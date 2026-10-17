// ─────────────────────────────────────────────────────────────────────────────
// DeFi gas manager (2026-10-17).
//
// On 2026-10-16 the Base hot wallet ran down to 0.0000033 ETH: XDP and MORPHO
// hit their exits and every sell failed "insufficient native gas", leaving six
// positions with no working stop. Gas is now budgeted, exits first:
//   • Each cycle: native balance ÷ (gas price × SWAP_GAS) = swaps left.
//   • Exit budget = (open positions + 1) swaps. Below that, NEW ENTRIES are
//     blocked so the remaining gas is kept for exits.
//   • Below the refill line (exit budget × 2, at least GAS_REFILL_BELOW_SWAPS)
//     and while there is still gas for the refill swap itself: swap a small
//     amount of USDC → native gas token, capped per refill / hour / day.
//   • Too little gas even to refill → logged once an hour: manual top-up needed.
// Env: CRYPTO_GAS_MANAGER=off, CRYPTO_GAS_REFILL_USD (2), CRYPTO_GAS_DAILY_USD (6),
//      CRYPTO_GAS_REFILL_BELOW_SWAPS (10), CRYPTO_GAS_TARGET_SWAPS (60).
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from '../db';
import { getWalletTokenBalance, rpcUrlFor, executeDefiSwap, DEFI_CHAINS } from './defi-swap';

const SWAP_GAS = 350_000; // approval + swap headroom on an L2
const REFILL_USD = () => Number(process.env.CRYPTO_GAS_REFILL_USD ?? 2);
const DAILY_USD = () => Number(process.env.CRYPTO_GAS_DAILY_USD ?? 6);
const REFILL_BELOW = () => Number(process.env.CRYPTO_GAS_REFILL_BELOW_SWAPS ?? 10);
const TARGET_SWAPS = () => Number(process.env.CRYPTO_GAS_TARGET_SWAPS ?? 60);

export interface GasStatus {
  ok: boolean;               // false = could not read; callers keep old behaviour
  native: number;            // native balance (ETH on Base)
  perSwap: number;           // native cost of one swap at current gas price
  swapsLeft: number;
  exitBudget: number;        // swaps reserved for exiting open positions
  entriesAllowed: boolean;
  action?: string;           // what the manager did this cycle
  reason: string;
}

async function gasPriceWei(chainKey: string): Promise<bigint | null> {
  try {
    const r = await fetch(rpcUrlFor(chainKey), {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_gasPrice', params: [] }),
      signal: AbortSignal.timeout(10_000),
    });
    const j: any = await r.json();
    return typeof j?.result === 'string' ? BigInt(j.result) : null;
  } catch { return null; }
}

async function nativeUsdPrice(chainKey: string): Promise<number | null> {
  const coin = chainKey === 'polygon' ? 'MATIC' : 'ETH';
  try {
    const { getAggregatedQuote } = await import('./crypto-market-data');
    const q = await getAggregatedQuote(coin);
    return q?.best?.price ?? null;
  } catch { return null; }
}

async function readState(key: string): Promise<any> {
  try { const { getRuntimeStateStrict } = await import('./runtime-state'); return await getRuntimeStateStrict('crypto_gas', key); } catch { return null; }
}
function writeState(key: string, v: unknown): void {
  void import('./runtime-state').then((m) => m.saveRuntimeState('crypto_gas', key, v)).catch(() => {});
}

/** Check the gas budget and refill from USDC if needed. Never throws. */
export async function manageGas(userId: number, chainKey: string, openPositions: number): Promise<GasStatus> {
  const fail = (reason: string): GasStatus => ({ ok: false, native: 0, perSwap: 0, swapsLeft: 0, exitBudget: 0, entriesAllowed: true, reason });
  if (process.env.CRYPTO_GAS_MANAGER === 'off') return fail('gas manager off');
  try {
    const { rows } = await pool.query(`SELECT encrypted_private_key AS k, address FROM defi_hot_wallets WHERE user_id=$1 AND is_active=true ORDER BY id LIMIT 1`, [userId]);
    if (!rows.length) return fail('no hot wallet');
    const address = String(rows[0].address);
    const [native, gp] = await Promise.all([getWalletTokenBalance(chainKey, address, 'NATIVE'), gasPriceWei(chainKey)]);
    if (gp == null) return fail('gas price unreadable');
    const perSwap = (Number(gp) * SWAP_GAS) / 1e18;
    const swapsLeft = perSwap > 0 ? native / perSwap : Infinity;
    const exitBudget = openPositions + 1;
    const st: GasStatus = { ok: true, native, perSwap, swapsLeft, exitBudget, entriesAllowed: swapsLeft >= exitBudget + 1, reason: '' };
    st.reason = `gas ${native.toPrecision(3)} = ${swapsLeft.toFixed(1)} swaps (exit budget ${exitBudget})`;

    const refillLine = Math.max(REFILL_BELOW(), exitBudget * 2);
    if (swapsLeft >= refillLine) return st;

    // Too little even for the refill swap: say so (hourly), nothing else to do.
    if (swapsLeft < 1.5) {
      const last = await readState(`warn:${userId}`);
      if (!last || Date.now() - Number(last.at) > 3_600_000) {
        writeState(`warn:${userId}`, { at: Date.now() });
        st.action = 'manual_topup_needed';
      }
      st.reason += ` — below the cost of a refill swap; send a little ${chainKey === 'polygon' ? 'POL' : 'ETH'} on ${chainKey} to ${address}`;
      return st;
    }

    // Rate limits: once an hour, DAILY_USD per UTC day.
    const day = new Date().toISOString().slice(0, 10);
    const dayKey = `spent:${userId}:${day}`;
    const spent = Number((await readState(dayKey))?.usd) || 0;
    const lastRefill = Number((await readState(`last:${userId}`))?.at) || 0;
    if (Date.now() - lastRefill < 3_600_000) { st.reason += ' — refill already done this hour'; return st; }
    const px = await nativeUsdPrice(chainKey);
    if (!(px && px > 0)) { st.reason += ' — native price unknown, no refill'; return st; }
    const wantUsd = (TARGET_SWAPS() - swapsLeft) * perSwap * px;
    const usd = Math.min(REFILL_USD(), DAILY_USD() - spent, Math.max(0.5, wantUsd));
    if (!(usd >= 0.5)) { st.reason += ` — daily refill cap ($${DAILY_USD()}) reached`; return st; }

    // Leave the USDC needed for at least one normal entry untouched.
    const usdc = await getWalletTokenBalance(chainKey, address, DEFI_CHAINS[chainKey]?.usdc || 'USDC').catch(() => 0);
    if (usdc < usd + 1) { st.reason += ` — only $${usdc.toFixed(2)} USDC, not refilling`; return st; }

    writeState(`last:${userId}`, { at: Date.now() }); // claim the hour before the swap
    const r = await executeDefiSwap({ encryptedPrivateKey: rows[0].k, chainKey, sellToken: 'USDC', buyToken: 'NATIVE', sellAmountHuman: Number(usd.toFixed(2)), slippageBps: 150, confirm: true });
    if (r.ok) {
      writeState(dayKey, { usd: spent + usd });
      st.action = 'refilled';
      st.reason += ` — REFILLED: swapped $${usd.toFixed(2)} USDC → ${chainKey === 'polygon' ? 'POL' : 'ETH'} (≈${(usd / px / perSwap).toFixed(0)} more swaps; $${(spent + usd).toFixed(2)}/$${DAILY_USD()} today)`;
      // Refreshed balance → entries may reopen.
      const n2 = await getWalletTokenBalance(chainKey, address, 'NATIVE').catch(() => native);
      st.native = n2; st.swapsLeft = perSwap > 0 ? n2 / perSwap : st.swapsLeft; st.entriesAllowed = st.swapsLeft >= exitBudget + 1;
    } else {
      st.action = 'refill_failed';
      st.reason += ` — refill swap FAILED: ${r.reason || 'unknown'}`;
    }
    return st;
  } catch (e: any) {
    return fail(`gas check failed: ${e?.message || e}`);
  }
}

/** USDC balance of the user's hot wallet (null if unreadable). */
export async function hotWalletUsdc(userId: number, chainKey: string): Promise<number | null> {
  try {
    const { rows } = await pool.query(`SELECT address FROM defi_hot_wallets WHERE user_id=$1 AND is_active=true ORDER BY id LIMIT 1`, [userId]);
    if (!rows.length) return null;
    return await getWalletTokenBalance(chainKey, String(rows[0].address), DEFI_CHAINS[chainKey]?.usdc || 'USDC');
  } catch { return null; }
}
