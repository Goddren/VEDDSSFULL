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

export interface DefiEntryResult { ok: boolean; token: string; qtyBase: number; entryPrice: number; txHash?: string; reason?: string; pending?: boolean; }

/** Open a DeFi long: swap `notionalUsd` of USDC -> token for `base` on the wallet's chain. */
/** A 0x contract address must pass through untouched; only tickers get normalised. */
function tokenRef(base: string): string {
  const t = String(base ?? '').trim();
  return /^0x[a-fA-F0-9]{40}$/i.test(t) ? t : baseCoin(t);
}

export async function defiEntryBuy(userId: number, chainKey: string, base: string, notionalUsd: number, slippageBps: number, priceHint?: number): Promise<DefiEntryResult> {
  // baseCoin() uppercases and strips trailing USD/USDC/USDT — harmless for a
  // ticker, destructive for a contract address, which is what the scanner now
  // passes to avoid symbol collisions.
  const token = tokenRef(base);
  const chain = chainKey || 'base';
  if (!(await isTokenTradeable(chain, token))) {
    return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: `DeFi venue can't trade ${token} on ${chain} — not on the chain's token list (try a token that exists on ${chain}, or a different chain)` };
  }
  const hw = await loadHotWallet(userId);
  if (!hw) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: 'no active DeFi hot wallet connected' };

  // Price. getAggregatedQuote asks Coinbase/Kraken/Gemini by TICKER, which is
  // useless for a token discovered on-chain: it has no CEX listing, and since
  // the scanner now passes a contract address the lookup was being handed
  // "0x4200...0006" and returning nothing. Observed live as
  // "no live price for 0x4200000000000000000000000000000000000006" on WETH.
  //
  // The caller already knows the price — discovery returns it and the strategy
  // computed its signal from the same candles — so take it. Fall back to the
  // CEX aggregate only for ticker-based callers (the pre-discovery path).
  let price = Number(priceHint) > 0 ? Number(priceHint) : 0;
  if (!price) {
    const q = await getAggregatedQuote(token).catch(() => null);
    price = q?.best?.price ?? 0;
  }
  if (!price) return { ok: false, token, qtyBase: 0, entryPrice: 0, reason: `no live price for ${token}` };

  const r = await executeDefiSwap({
    encryptedPrivateKey: hw.encryptedKey, chainKey: chain,
    sellToken: 'USDC', buyToken: token, sellAmountHuman: notionalUsd, slippageBps,
    confirm: true, // wait for on-chain success — no phantom entries on a revert
  });
  if (!r.ok) {
    // A broadcast-but-unconfirmed swap keeps its hash and its expected size, so
    // the caller can record it and reconcile against the chain later.
    const qtyHint = (r.buyAmountHuman && Number.isFinite(r.buyAmountHuman) && r.buyAmountHuman > 0)
      ? r.buyAmountHuman : (price > 0 ? notionalUsd / price : 0);
    return { ok: false, pending: !!r.pending, token, qtyBase: r.pending ? qtyHint : 0, entryPrice: price, txHash: r.txHash, reason: r.reason };
  }

  // Prefer the actual on-chain amount received (decimals-correct); fall back to
  // notional/price if the quote didn't return one.
  let qtyBase = notionalUsd / price;
  if (r.buyAmountHuman && Number.isFinite(r.buyAmountHuman) && r.buyAmountHuman > 0) qtyBase = r.buyAmountHuman;
  qtyBase = Math.max(0, Math.round(qtyBase * 1e8) / 1e8);
  return { ok: true, token, qtyBase, entryPrice: price, txHash: r.txHash };
}

/** Close a DeFi long: swap `qtyBase` of token -> USDC on the wallet's chain. */
export async function defiExitSell(userId: number, chainKey: string, base: string, qtyBase: number, slippageBps: number, priceHint?: number): Promise<{ ok: boolean; exitPrice: number; proceedsUsd?: number; txHash?: string; reason?: string; phantom?: boolean; soldQty?: number }> {
  const token = tokenRef(base);
  const hw = await loadHotWallet(userId);
  if (!hw) return { ok: false, exitPrice: 0, reason: 'no active DeFi hot wallet connected' };

  // Same trap on the way out: a chain-discovered token has no CEX quote. The
  // caller passes the pool price; this stays as a fallback for tickers.
  let price = Number(priceHint) > 0 ? Number(priceHint) : 0;
  if (!price) {
    const q = await getAggregatedQuote(baseCoin(base)).catch(() => null);
    price = q?.best?.price ?? 0;
  }

  // ── PRE-FLIGHT: does the wallet actually hold what the DB claims? ──────────
  // Nothing reconciled DB trades against the chain, so a row could outlive the
  // tokens it describes and the engine would retry its exit forever, paying gas
  // each time. Ask the chain first.
  //
  // A read FAILURE is not a zero balance: on an RPC error we fall through and
  // attempt the swap exactly as before, because refusing to exit a real position
  // because we could not read it is the worse mistake.
  const { getWalletTokenBalance, addressFromPrivateKey } = await import('./defi-swap');
  const { decryptApiSecret } = await import('../cryptocom');
  let sellQty = qtyBase;
  try {
    const walletAddr = addressFromPrivateKey(decryptApiSecret(hw.encryptedKey));
    const held = await getWalletTokenBalance(chainKey || hw.chain, walletAddr, token);
    // Dust tolerance: below this the position is not sellable in any meaningful
    // sense, and 0x would quote against a balance worth less than the gas.
    const DUST = 1e-8;
    if (held <= DUST) {
      return {
        ok: false, exitPrice: price, phantom: true,
        reason: `position is NOT on-chain — wallet ${walletAddr} holds ${held} ${token} but this trade claims ${qtyBase}. No swap attempted; needs reconciliation.`,
      };
    }
    if (held < qtyBase) {
      // The wallet balance is shared by every open trade in this token, so a
      // shortfall cannot be attributed to one trade. Sell what is actually there
      // rather than sending a swap that must revert, and report the real size.
      console.warn(`[defi-executor] trade wants ${qtyBase} ${token} but wallet holds ${held} — selling the available balance instead`);
      sellQty = held;
    }
  } catch (e: any) {
    console.error(`[defi-executor] could not read ${token} balance (${e?.message}) — proceeding with the swap rather than assuming the position is gone`);
  }

  const r = await executeDefiSwap({
    encryptedPrivateKey: hw.encryptedKey, chainKey: chainKey || hw.chain,
    sellToken: token, buyToken: 'USDC', sellAmountHuman: sellQty, slippageBps,
    confirm: true, // wait for on-chain success — don't book a close that reverted
  });
  if (!r.ok) return { ok: false, exitPrice: price, reason: r.reason, soldQty: sellQty };
  // A8: buyAmountHuman is the ACTUAL USDC received from the swap (after
  // slippage + fees). Return it so realized P&L is computed from real proceeds,
  // not the pre-swap quote price.
  return { ok: true, exitPrice: price, proceedsUsd: (r.buyAmountHuman && Number.isFinite(r.buyAmountHuman) && r.buyAmountHuman > 0) ? r.buyAmountHuman : undefined, txHash: r.txHash, soldQty: sellQty };
}
