// DeFi hot-wallet execution router (Phase B) — lets the crypto auto-engine place
// its BUY signals as on-chain 0x swaps signed by the user's encrypted burner key.
// SPOT, long-only: a BUY opens USDC -> token; the exit swaps token -> USDC.
//
// Token scope: on-chain swaps trade real ERC-20s, so only tokens that exist on
// the selected chain are swappable. Token addresses are resolved at runtime from
// the canonical Uniswap token list (see defi-swap.ts resolveToken/isTokenTradeable)
// — ETH→WETH and BTC→WBTC/cbBTC are aliased there. Bases that don't exist on the
// chain (SOL/XRP/DOGE/… as native L1s) simply fail resolution and are skipped.

import { pool } from '../db';
import { getAggregatedQuote } from './crypto-market-data';
import { executeDefiSwap, isTokenTradeable } from './defi-swap';
import { baseCoin } from './cefi-executor';

/** Whether the engine can swap this symbol's base coin on the given chain. */
export async function defiTokenAvailable(chainKey: string, symbol: string): Promise<boolean> {
  return isTokenTradeable(chainKey, baseCoin(symbol));
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
  const token = baseCoin(base);
  const chain = chainKey || 'base';
  if (!(await isTokenTradeable(chain, token))) {
    return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: `DeFi venue can't trade ${token} on ${chain} — not on the chain's token list (try a token that exists on ${chain}, or a different chain)` };
  }
  const hw = await loadHotWallet(userId);
  if (!hw) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: 'no active DeFi hot wallet connected' };

  const q = await getAggregatedQuote(token).catch(() => null);
  const price = q?.best?.price ?? 0;
  if (!price) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: `no live price for ${token}` };

  const r = await executeDefiSwap({
    encryptedPrivateKey: hw.encryptedKey, chainKey: chain,
    sellToken: 'USDC', buyToken: token, sellAmountHuman: notionalUsd, slippageBps,
  });
  if (!r.ok) return { ok: false, token, qtyBase: 0, entryPrice: price, reason: r.reason };

  // Prefer the actual on-chain amount received (decimals-correct); fall back to
  // notional/price if the quote didn't return one.
  let qtyBase = notionalUsd / price;
  if (r.buyAmountHuman && Number.isFinite(r.buyAmountHuman) && r.buyAmountHuman > 0) qtyBase = r.buyAmountHuman;
  qtyBase = Math.max(0, Math.round(qtyBase * 1e8) / 1e8);
  return { ok: true, token, qtyBase, entryPrice: price, txHash: r.txHash };
}

/** Close a DeFi long: swap `qtyBase` of token -> USDC on the wallet's chain. */
export async function defiExitSell(userId: number, chainKey: string, base: string, qtyBase: number, slippageBps: number): Promise<{ ok: boolean; exitPrice: number; txHash?: string; reason?: string }> {
  const token = baseCoin(base);
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
