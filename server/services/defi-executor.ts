// DeFi hot-wallet execution router (Phase B) — lets the crypto auto-engine place
// its BUY signals as on-chain 0x swaps signed by the user's encrypted burner key.
// SPOT, long-only: a BUY opens USDC -> token; the exit swaps token -> USDC.
//
// Token scope: on-chain swaps trade real ERC-20s, so only tokens that exist on
// the selected chain are swappable. We reliably support ETH (via WETH) today;
// other bases are skipped with a clear message rather than guessing an address
// (a wrong address would burn funds). Extend DEFI_TRADEABLE to add more per-chain
// tokens as their addresses are verified.

import { pool } from '../db';
import { getAggregatedQuote } from './crypto-market-data';
import { executeDefiSwap } from './defi-swap';
import { baseCoin } from './cefi-executor';

// Bases the DeFi engine can currently swap, mapped to the token id resolveToken()
// understands (see defi-swap.ts). WETH is available on every supported chain.
const DEFI_TRADEABLE: Record<string, string> = { ETH: 'WETH', WETH: 'WETH' };

export function defiTradeableToken(symbol: string): string | null {
  return DEFI_TRADEABLE[baseCoin(symbol)] ?? null;
}

async function loadHotWallet(userId: number): Promise<{ encryptedKey: string; chain: string } | null> {
  const { rows } = await pool.query(
    `SELECT encrypted_private_key AS k, chain FROM defi_hot_wallets WHERE user_id=$1 AND is_active=true ORDER BY id LIMIT 1`,
    [userId],
  );
  if (!rows.length) return null;
  return { encryptedKey: rows[0].k, chain: rows[0].chain || 'base' };
}

export interface DefiEntryResult { ok: boolean; token: string; qtyBase: number; entryPrice: number; txHash?: string; reason?: string; }

/** Open a DeFi long: swap `notionalUsd` of USDC -> token for `base` on the wallet's chain. */
export async function defiEntryBuy(userId: number, chainKey: string, base: string, notionalUsd: number, slippageBps: number): Promise<DefiEntryResult> {
  const token = defiTradeableToken(base);
  if (!token) return { ok: false, token: '', qtyBase: 0, entryPrice: 0, reason: `DeFi venue can't trade ${baseCoin(base)} yet — only ETH/WETH is wired for on-chain swaps` };
  const hw = await loadHotWallet(userId);
  if (!hw) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: 'no active DeFi hot wallet connected' };

  const q = await getAggregatedQuote(baseCoin(base)).catch(() => null);
  const price = q?.best?.price ?? 0;
  if (!price) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: `no live price for ${baseCoin(base)}` };

  const r = await executeDefiSwap({
    encryptedPrivateKey: hw.encryptedKey, chainKey: chainKey || hw.chain,
    sellToken: 'USDC', buyToken: token, sellAmountHuman: notionalUsd, slippageBps,
  });
  if (!r.ok) return { ok: false, token, qtyBase: 0, entryPrice: price, reason: r.reason };

  // buyAmount is in the token's base units (WETH = 18 decimals). Convert to human,
  // falling back to notional/price if the quote didn't return a buyAmount.
  let qtyBase = notionalUsd / price;
  if (r.buyAmount) { const n = Number(r.buyAmount) / 1e18; if (Number.isFinite(n) && n > 0) qtyBase = n; }
  qtyBase = Math.max(0, Math.round(qtyBase * 1e8) / 1e8);
  return { ok: true, token, qtyBase, entryPrice: price, txHash: r.txHash };
}

/** Close a DeFi long: swap `qtyBase` of token -> USDC on the wallet's chain. */
export async function defiExitSell(userId: number, chainKey: string, base: string, qtyBase: number, slippageBps: number): Promise<{ ok: boolean; exitPrice: number; txHash?: string; reason?: string }> {
  const token = defiTradeableToken(base);
  if (!token) return { ok: false, exitPrice: 0, reason: `no DeFi token mapping for ${baseCoin(base)}` };
  const hw = await loadHotWallet(userId);
  if (!hw) return { ok: false, exitPrice: 0, reason: 'no active DeFi hot wallet connected' };

  const q = await getAggregatedQuote(baseCoin(base)).catch(() => null);
  const price = q?.best?.price ?? 0;
  const r = await executeDefiSwap({
    encryptedPrivateKey: hw.encryptedKey, chainKey: chainKey || hw.chain,
    sellToken: token, buyToken: 'USDC', sellAmountHuman: qtyBase, slippageBps,
  });
  if (!r.ok) return { ok: false, exitPrice: price, reason: r.reason };
  return { ok: true, exitPrice: price, txHash: r.txHash };
}
