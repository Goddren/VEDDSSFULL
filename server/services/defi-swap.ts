// DeFi swap execution via the 0x Swap API (allowance-holder) + ethers v6, signed
// by a server-held hot-wallet key. Powers the unattended DeFi auto-trade engine.
//
// SAFETY: this signs and broadcasts real on-chain transactions with the user's
// hot-wallet private key. Every entry point is gated (confirm + caps) by callers.
// Requires ZEROX_API_KEY in the env. Uses the allowance-holder flow (approve the
// AllowanceHolder, then send the quote's tx) to avoid Permit2 signature juggling.

import { ethers } from 'ethers';
import { decryptApiSecret } from '../cryptocom';

export const DEFI_CHAINS: Record<string, { chainId: number; rpc: string; name: string; native: string; usdc: string; weth: string }> = {
  ethereum: { chainId: 1, rpc: 'https://ethereum-rpc.publicnode.com', name: 'Ethereum', native: 'ETH', usdc: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', weth: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' },
  base: { chainId: 8453, rpc: 'https://base-rpc.publicnode.com', name: 'Base', native: 'ETH', usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', weth: '0x4200000000000000000000000000000000000006' },
  arbitrum: { chainId: 42161, rpc: 'https://arbitrum-one-rpc.publicnode.com', name: 'Arbitrum', native: 'ETH', usdc: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', weth: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1' },
  optimism: { chainId: 10, rpc: 'https://optimism-rpc.publicnode.com', name: 'Optimism', native: 'ETH', usdc: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', weth: '0x4200000000000000000000000000000000000006' },
  polygon: { chainId: 137, rpc: 'https://polygon-bor-rpc.publicnode.com', name: 'Polygon', native: 'POL', usdc: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', weth: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619' },
}

const NATIVE_PSEUDO = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
const ERC20_ABI = ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)', 'function decimals() view returns (uint8)', 'function balanceOf(address) view returns (uint256)'];

export function isDefiSwapAvailable(): boolean { return !!process.env.ZEROX_API_KEY; }

/** Resolve a token identifier ('ETH'/'USDC'/'WETH' or a 0x address) to an address. */
export function resolveToken(chainKey: string, token: string): string {
  const c = DEFI_CHAINS[chainKey];
  const t = token.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(t)) return t;
  const up = t.toUpperCase();
  if (up === c.native || up === 'ETH' || up === 'NATIVE' || up === 'POL' || up === 'MATIC') return NATIVE_PSEUDO;
  if (up === 'USDC') return c.usdc;
  if (up === 'WETH') return c.weth;
  throw new Error(`Unknown token "${token}" on ${chainKey} — use USDC/WETH/native or a 0x address`);
}

async function zeroXQuote(chainId: number, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams({ chainId: String(chainId), ...params });
  const res = await fetch(`https://api.0x.org/swap/allowance-holder/quote?${qs.toString()}`, {
    headers: { '0x-api-key': process.env.ZEROX_API_KEY || '', '0x-version': 'v2' },
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`0x ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}

export interface SwapResult { ok: boolean; txHash?: string; buyAmount?: string; approveTxHash?: string; reason?: string; }

/**
 * Execute a swap of `sellAmountHuman` of sellToken -> buyToken on `chainKey`,
 * signed by the encrypted hot-wallet key. `slippageBps` caps slippage (e.g. 100 = 1%).
 */
export async function executeDefiSwap(opts: {
  encryptedPrivateKey: string; chainKey: string; sellToken: string; buyToken: string;
  sellAmountHuman: number; slippageBps: number;
}): Promise<SwapResult> {
  if (!isDefiSwapAvailable()) return { ok: false, reason: 'ZEROX_API_KEY not set on the server' };
  const chain = DEFI_CHAINS[opts.chainKey];
  if (!chain) return { ok: false, reason: `unsupported chain ${opts.chainKey}` };

  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId);
  const wallet = new ethers.Wallet(decryptApiSecret(opts.encryptedPrivateKey), provider);
  const sellToken = resolveToken(opts.chainKey, opts.sellToken);
  const buyToken = resolveToken(opts.chainKey, opts.buyToken);

  // Determine sell amount in base units (decimals of the sell token; 18 for native).
  let decimals = 18;
  if (sellToken !== NATIVE_PSEUDO) {
    const erc = new ethers.Contract(sellToken, ERC20_ABI, provider);
    decimals = Number(await erc.decimals());
  }
  const sellAmount = ethers.parseUnits(String(opts.sellAmountHuman), decimals).toString();

  const quote = await zeroXQuote(chain.chainId, {
    sellToken, buyToken, sellAmount, taker: wallet.address, slippageBps: String(opts.slippageBps),
  });
  if (!quote?.liquidityAvailable && quote?.liquidityAvailable !== undefined) {
    return { ok: false, reason: 'no liquidity for this pair/size' };
  }

  // ERC-20 sells need an allowance to the AllowanceHolder (quote.issues.allowance.spender).
  let approveTxHash: string | undefined;
  const spender = quote?.issues?.allowance?.spender || quote?.allowanceTarget;
  if (sellToken !== NATIVE_PSEUDO && spender) {
    const erc = new ethers.Contract(sellToken, ERC20_ABI, wallet);
    const current: bigint = await erc.allowance(wallet.address, spender);
    if (current < BigInt(sellAmount)) {
      const aTx = await erc.approve(spender, ethers.MaxUint256);
      approveTxHash = aTx.hash;
      await aTx.wait();
    }
  }

  const t = quote.transaction;
  if (!t?.to || !t?.data) return { ok: false, reason: 'quote returned no transaction' };
  const txResp = await wallet.sendTransaction({
    to: t.to, data: t.data, value: t.value ? BigInt(t.value) : BigInt(0),
    ...(t.gas ? { gasLimit: BigInt(Math.ceil(Number(t.gas) * 1.2)) } : {}),
  });
  await txResp.wait();
  return { ok: true, txHash: txResp.hash, approveTxHash, buyAmount: quote.buyAmount };
}

/** Derive the address for a raw private key (for storing a hot wallet). */
export function addressFromPrivateKey(pk: string): string {
  return new ethers.Wallet(pk.trim()).address;
}
