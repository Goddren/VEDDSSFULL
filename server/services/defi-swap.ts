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

// ── Canonical token resolution ──────────────────────────────────────────────
// Rather than hardcode fragile per-chain ERC-20 addresses (a wrong address burns
// funds), we resolve unknown symbols at runtime from the canonical Uniswap token
// list (chainId + symbol → address). Fast-paths for native/USDC/WETH stay hard-
// coded (those are pinned in DEFI_CHAINS). Cached in-process after first load.
// Per-chain caches. The old code kept ONE global index built from a single URL.
const tokenIndexCache = new Map<string, Map<string, string>>();
const tokenIndexLoadedAt = new Map<string, number>();

/** Thrown when the token list could not be READ. Distinct from "not listed". */
export class TokenListUnavailableError extends Error {}

// CoinGecko publishes a list PER CHAIN; these slugs are its chain ids.
const CG_SLUG: Record<string, string> = {
  ethereum: 'ethereum', base: 'base', arbitrum: 'arbitrum-one',
  optimism: 'optimistic-ethereum', polygon: 'polygon-pos',
};

// `https://tokens.uniswap.org` now serves the Uniswap web app's HTML, not JSON
// (verified 2026-09-20: 200, content-type text/html, body "<!DOCTYPE html>").
// The old loader did `await res.json()`, threw on the HTML, and its catch
// returned an EMPTY map — so every symbol except the hardcoded native/USDC/WETH
// failed to resolve, on every chain, and the engine could not enter any token.
// The message it produced, "isn't listed on this chain", was actively wrong.
//
// Sources are tried in order and the first usable one wins. Uniswap stays last
// in case it comes back.
function sourcesFor(chainKey: string): string[] {
  const slug = CG_SLUG[chainKey];
  return [
    ...(slug ? [`https://tokens.coingecko.com/${slug}/all.json`] : []),
    'https://tokens.1inch.eth.link',
    'https://tokens.uniswap.org',
  ];
}

/**
 * Build {chainId:SYMBOL -> address} for one chain.
 * THROWS TokenListUnavailableError when every source fails, so callers can tell
 * "we could not look it up" from "it does not exist here". Returning an empty
 * map for an unreadable list is what made this failure invisible for eight days.
 */
async function loadTokenIndex(chainKey: string): Promise<Map<string, string>> {
  const cached = tokenIndexCache.get(chainKey);
  const at = tokenIndexLoadedAt.get(chainKey) ?? 0;
  if (cached && Date.now() - at < 6 * 3600_000) return cached;

  const chain = DEFI_CHAINS[chainKey];
  const errors: string[] = [];
  for (const url of sourcesFor(chainKey)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      const ct = res.headers.get('content-type') ?? '';
      if (!res.ok || !ct.includes('json')) { errors.push(`${url} -> ${res.status} ${ct || 'no content-type'}`); continue; }
      const data: any = await res.json();
      const idx = new Map<string, string>();
      for (const t of (data?.tokens ?? [])) {
        if (!t?.symbol || !t?.address) continue;
        // A per-chain list may omit chainId; assume it is the chain requested.
        const cid = t.chainId ?? chain?.chainId;
        if (cid === chain?.chainId) idx.set(String(t.symbol).toUpperCase(), t.address);
      }
      if (idx.size === 0) { errors.push(`${url} -> parsed but 0 tokens for chainId ${chain?.chainId}`); continue; }
      tokenIndexCache.set(chainKey, idx);
      tokenIndexLoadedAt.set(chainKey, Date.now());
      return idx;
    } catch (e: any) {
      errors.push(`${url} -> ${e?.message}`);
    }
  }
  // Stale beats nothing — an old list is still real data.
  if (cached) {
    console.warn(`[defi-swap] every token-list source failed for ${chainKey}; using the cached list from ${new Date(at).toISOString()}. ${errors.join(' | ')}`);
    return cached;
  }
  throw new TokenListUnavailableError(`Could not load a token list for ${chainKey}: ${errors.join(' | ')}`);
}

// Aliases: engine "base coins" → the on-chain wrapped symbol(s) to try, in order.
const SYMBOL_ALIASES: Record<string, string[]> = {
  ETH: ['WETH'], WETH: ['WETH'],
  BTC: ['WBTC', 'CBBTC', 'BTCB'], WBTC: ['WBTC', 'CBBTC'],
  MATIC: ['WMATIC', 'POL'], POL: ['POL', 'WMATIC'],
};

/** Resolve a token identifier ('ETH'/'USDC'/'WETH', a known symbol, or a 0x address) to an address. */
export async function resolveToken(chainKey: string, token: string): Promise<string> {
  const c = DEFI_CHAINS[chainKey];
  const t = token.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(t)) return t;
  const up = t.toUpperCase();
  if (up === c.native || up === 'ETH' || up === 'NATIVE' || up === 'POL' || up === 'MATIC') return NATIVE_PSEUDO;
  if (up === 'USDC') return c.usdc;
  if (up === 'WETH') return c.weth;
  // Everything else: look up by symbol in that chain's token list. A failure to
  // LOAD the list propagates as TokenListUnavailableError — never as "not listed".
  const idx = await loadTokenIndex(chainKey);
  const candidates = SYMBOL_ALIASES[up] ?? [up];
  for (const sym of candidates) {
    const addr = idx.get(sym);
    if (addr) return addr;
  }
  throw new Error(`Token "${token}" isn't listed on ${chainKey} — it may not exist on this chain. Use a 0x address, or pick a token that trades on ${chainKey}.`);
}

/**
 * True if `token` can be resolved to an address on `chainKey`.
 * A list-load failure still returns false — we will not trade a symbol we could
 * not verify — but it is LOUD, because "the lookup is broken" and "this coin is
 * not on this chain" demand completely different responses from a human.
 */
export async function isTokenTradeable(chainKey: string, token: string): Promise<boolean> {
  try { await resolveToken(chainKey, token); return true; }
  catch (e: any) {
    if (e instanceof TokenListUnavailableError) {
      console.error(`[defi-swap] CANNOT VERIFY tokens on ${chainKey} — the token list is unreadable, so NOTHING will trade until it recovers: ${e.message}`);
    }
    return false;
  }
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

export interface SwapResult { ok: boolean; txHash?: string; buyAmount?: string; buyAmountHuman?: number; approveTxHash?: string; reason?: string; }

/**
 * Execute a swap of `sellAmountHuman` of sellToken -> buyToken on `chainKey`,
 * signed by the encrypted hot-wallet key. `slippageBps` caps slippage (e.g. 100 = 1%).
 */
export async function executeDefiSwap(opts: {
  encryptedPrivateKey: string; chainKey: string; sellToken: string; buyToken: string;
  sellAmountHuman: number; slippageBps: number;
  // When true (unattended cron/engine path), WAIT for the tx receipt and only
  // return ok:true if it actually succeeded on-chain (status===1). Prevents
  // phantom positions from a broadcast-but-reverted swap. The HTTP manual-swap
  // endpoint leaves this false to avoid overrunning the gateway timeout (→502).
  confirm?: boolean;
}): Promise<SwapResult> {
  if (!isDefiSwapAvailable()) return { ok: false, reason: 'ZEROX_API_KEY not set on the server' };
  const chain = DEFI_CHAINS[opts.chainKey];
  if (!chain) return { ok: false, reason: `unsupported chain ${opts.chainKey}` };

  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId);
  try {
  const wallet = new ethers.Wallet(decryptApiSecret(opts.encryptedPrivateKey), provider);
  let sellToken: string, buyToken: string;
  try {
    sellToken = await resolveToken(opts.chainKey, opts.sellToken);
    buyToken = await resolveToken(opts.chainKey, opts.buyToken);
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'token resolution failed' };
  }

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
      // One-time approval per token. Approve MUST be mined before the swap tx (else
      // it reverts), and waiting for it inside the HTTP request overruns the gateway
      // timeout (→ 502). So we BROADCAST the approve and return immediately with a
      // clear retry message — the next attempt sees the allowance and swaps fast.
      const aTx = await erc.approve(spender, ethers.MaxUint256);
      approveTxHash = aTx.hash;
      return { ok: false, approveTxHash, reason: `One-time token approval submitted (tx ${aTx.hash.slice(0, 10)}…). Wait ~20s for it to confirm, then run the swap again — this only happens once per token.` };
    }
  }

  // Convert the quoted buyAmount (base units) to a human number using the buy
  // token's real decimals (WBTC=8, USDC=6, WETH=18 …). Taken from the QUOTE, so
  // no need to wait for the tx to confirm to know the expected amount.
  let buyAmountHuman: number | undefined;
  if (quote.buyAmount) {
    try {
      let bDec = 18;
      if (buyToken !== NATIVE_PSEUDO) bDec = Number(await new ethers.Contract(buyToken, ERC20_ABI, provider).decimals());
      buyAmountHuman = Number(ethers.formatUnits(BigInt(quote.buyAmount), bDec));
    } catch { /* leave undefined; caller falls back to notional/price */ }
  }

  const t = quote.transaction;
  if (!t?.to || !t?.data) return { ok: false, reason: 'quote returned no transaction' };
  const txResp = await wallet.sendTransaction({
    to: t.to, data: t.data, value: t.value ? BigInt(t.value) : BigInt(0),
    ...(t.gas ? { gasLimit: BigInt(Math.ceil(Number(t.gas) * 1.2)) } : {}),
  });
  if (opts.confirm) {
    // Unattended path: wait for the receipt and VERIFY success. A reverted swap
    // (insufficient balance, missing allowance, slippage) is mined but delivers
    // no tokens — returning ok:true here is what created phantom positions.
    const rcpt = await txResp.wait(1, 90_000).catch(() => null);
    if (!rcpt) return { ok: false, txHash: txResp.hash, reason: 'swap not confirmed within 90s — treat as unfilled (verify on explorer)' };
    if (rcpt.status !== 1) return { ok: false, txHash: txResp.hash, reason: 'swap reverted on-chain (no tokens received)' };
    return { ok: true, txHash: txResp.hash, approveTxHash, buyAmount: quote.buyAmount, buyAmountHuman };
  }
  // HTTP path: return as soon as the swap is BROADCAST — awaiting full confirmation
  // overran the gateway timeout (→ 502). Best-effort short wait; verify on explorer.
  try { await Promise.race([txResp.wait(), new Promise((r) => setTimeout(r, 8000))]); } catch { /* revert/other — hash still returned; verify on explorer */ }
  return { ok: true, txHash: txResp.hash, approveTxHash, buyAmount: quote.buyAmount, buyAmountHuman };
  } finally {
    // ethers v6 JsonRpcProvider keeps a network poll timer/socket alive; without
    // destroy() each swap leaks a poller → memory growth over time. Release it on
    // every exit path (early returns included).
    try { provider.destroy(); } catch { /* ignore */ }
  }
}

/** Derive the address for a raw private key (for storing a hot wallet). */
/**
 * How much of `token` the wallet ACTUALLY holds on-chain, in human units.
 *
 * The engine had no way to ask this, so a DB row saying "open 1.148 UNI" was
 * taken as fact forever. When the tokens were no longer there, every exit
 * attempt built a swap for a balance that did not exist, failed, and retried on
 * the next cycle — a loop that burns gas indefinitely and can never succeed.
 * Seen live on 2026-09-20: three UNI longs open in the DB, wallet balance
 * 0.000000, 18 failed exits in 30 minutes.
 *
 * Throws on RPC failure rather than returning 0: "could not read the balance"
 * must never be mistaken for "the balance is zero", which would strand a real
 * position as phantom.
 */
export async function getWalletTokenBalance(chainKey: string, walletAddress: string, token: string): Promise<number> {
  const chain = DEFI_CHAINS[chainKey];
  if (!chain) throw new Error(`unsupported chain ${chainKey}`);
  const provider = new ethers.JsonRpcProvider(chain.rpc, chain.chainId);
  try {
    const addr = await resolveToken(chainKey, token);
    if (addr === NATIVE_PSEUDO) return Number(ethers.formatEther(await provider.getBalance(walletAddress)));
    const erc = new ethers.Contract(addr, ERC20_ABI, provider);
    const [raw, dec] = await Promise.all([erc.balanceOf(walletAddress), erc.decimals()]);
    return Number(ethers.formatUnits(raw, Number(dec)));
  } finally {
    try { provider.destroy(); } catch { /* ignore */ }
  }
}

export function addressFromPrivateKey(pk: string): string {
  return new ethers.Wallet(pk.trim()).address;
}
