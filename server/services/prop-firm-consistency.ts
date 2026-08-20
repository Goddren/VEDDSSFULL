// Shared FTMO-style consistency rule engine for prop-firm accounts.
//
// Rule: no single trading day's realized profit may exceed a set % of the
// account's total realized profit (e.g. 20%). Real prop firms fail an
// evaluation (or reduce a payout) over this — it exists to prove profits
// come from a repeatable process, not one lucky day.
//
// This replaces four separate, hand-copied, in-memory-only implementations
// (server/services/live-trading-engine.ts, futures-scanner.ts, options-scanner.ts,
// cryptocom-scanner.ts) that each reset to zero on every deploy/restart — a real
// compliance risk for a live funded account mid-challenge. This module is
// backed by the durable `prop_firm_daily_pnl` table (one row per connection per
// UTC trading day) so the ratio survives restarts and is the single source of
// truth for Gate 0, the size-tapering logic, and the client-facing monitor.

import { pool } from '../db';

export const DEFAULT_CONSISTENCY_THRESHOLD_PCT = 20;

// Below this fraction of the threshold, trade at full size (safe zone).
const TAPER_START_FRACTION = 0.7;
// Floor multiplier once inside the taper zone but not yet breached.
const TAPER_FLOOR_MULTIPLIER = 0.25;

export type ConsistencyStatus = 'safe' | 'warning' | 'breached' | 'disabled';

export interface ConsistencyResult {
  connectionId: number;
  connectionType: string;
  enabled: boolean;
  thresholdPct: number;
  todayPnl: number;
  totalPositivePnl: number;
  ratioPct: number; // today's (positive) profit as % of total positive profit
  maxDayPnl?: number;       // biggest single positive day
  maxDayRatioPct?: number;  // maxDay / total — the REAL prop-firm consistency ratio
  dilutionActive?: boolean; // account is stuck (past big day breaches) → daily-cap dilution engaged
  status: ConsistencyStatus;
  sizeMultiplier: number; // 0 (hard block) .. 1 (full size)
  hardBlocked: boolean;
  guidance: string;
}

function todayUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
}

// When an account is "stuck" (a past big day already exceeds the cap), each new
// dilution day is held to this fraction of the biggest day so it never becomes a
// new max — leaving margin below the historical max while total grows.
const DILUTION_DAY_FRACTION = 0.8;

export interface ConsistencyPlan {
  passing: boolean;              // max-day ratio already ≤ threshold
  thresholdPct: number;
  totalPositivePnl: number;
  maxDayPnl: number;             // the single biggest positive day (the binding day)
  maxDayDate: string | null;
  maxDayRatioPct: number;        // maxDay / total — the REAL prop-firm consistency ratio
  // To pass, total must reach this (maxDay becomes exactly threshold% of it):
  targetTotalPnl: number;
  additionalProfitNeeded: number;
  // A safe per-day profit cap for the dilution days (stays under the historical
  // max so it can't become a new breach):
  safeDailyProfitCap: number;
  estDaysNeeded: number;
  // How many times the current total profit must grow to pass (targetTotal/total).
  growthMultiple: number;
  // 'passing' | 'achievable' (≤1.5×) | 'hard' (≤2.5×) | 'unrealistic' (>2.5× — the
  // one big day dwarfs everything; grinding it down is impractical, consider reset).
  feasibility: 'passing' | 'achievable' | 'hard' | 'unrealistic';
  recommendation: string;
  summary: string;
}

/**
 * Compute what it takes to bring a STUCK account's consistency ratio under the
 * cap. The real rule is maxSingleDay / totalProfit ≤ threshold. Since the big
 * day is already banked and can't be reduced, the only lever is to add profit on
 * OTHER days — each small enough not to become a new max — until total grows
 * enough that the big day is ≤ threshold% of it. At a 20% cap that means total
 * must reach 5× the biggest day.
 */
export async function getConsistencyPlan(
  connectionId: number,
  connectionType: string,
  thresholdPct: number | null | undefined,
): Promise<ConsistencyPlan> {
  const threshold = (typeof thresholdPct === 'number' && thresholdPct > 0)
    ? thresholdPct
    : DEFAULT_CONSISTENCY_THRESHOLD_PCT;
  const frac = threshold / 100;

  let rows: Array<{ trade_date: string; realized_pnl: string | number }> = [];
  try {
    const { rows: r } = await pool.query(
      `SELECT trade_date, realized_pnl FROM prop_firm_daily_pnl WHERE connection_id = $1 AND connection_type = $2`,
      [connectionId, connectionType]
    );
    rows = r;
  } catch (err: any) {
    console.error('[Consistency] Plan read failed (defaulting to empty):', err?.message ?? err);
  }

  let totalPositive = 0;
  let maxDayPnl = 0;
  let maxDayDate: string | null = null;
  for (const r of rows) {
    const pnl = typeof r.realized_pnl === 'number' ? r.realized_pnl : parseFloat(r.realized_pnl || '0');
    if (!isFinite(pnl) || pnl <= 0) continue;
    totalPositive += pnl;
    if (pnl > maxDayPnl) { maxDayPnl = pnl; maxDayDate = r.trade_date; }
  }

  const maxDayRatioPct = totalPositive > 0 ? (maxDayPnl / totalPositive) * 100 : 0;
  const passing = totalPositive <= 0 || maxDayRatioPct <= threshold;

  // Total needed so the biggest day is exactly threshold% of it.
  const targetTotalPnl = maxDayPnl > 0 ? maxDayPnl / frac : 0;
  const additionalProfitNeeded = Math.max(0, targetTotalPnl - totalPositive);
  // Each dilution day capped below the historical max so it can't become a new
  // breach (and stays under threshold% of the eventual target total).
  const safeDailyProfitCap = maxDayPnl > 0 ? Math.max(1, round2(maxDayPnl * DILUTION_DAY_FRACTION)) : 0;
  const estDaysNeeded = additionalProfitNeeded > 0 && safeDailyProfitCap > 0
    ? Math.ceil(additionalProfitNeeded / safeDailyProfitCap)
    : 0;

  // Feasibility: how many times total profit must grow to dilute the big day out.
  const growthMultiple = totalPositive > 0 && targetTotalPnl > 0 ? targetTotalPnl / totalPositive : 0;
  let feasibility: ConsistencyPlan['feasibility'];
  if (passing) feasibility = 'passing';
  else if (growthMultiple <= 1.5) feasibility = 'achievable';
  else if (growthMultiple <= 2.5) feasibility = 'hard';
  else feasibility = 'unrealistic';

  let recommendation: string;
  if (passing) {
    recommendation = 'Consistency requirement met — request the payout / evaluation pass.';
  } else if (feasibility === 'achievable') {
    recommendation = `Keep VEDD's auto-dilution on — small green days at ≤ $${safeDailyProfitCap}/day will clear the cap in ~${estDaysNeeded} day(s).`;
  } else if (feasibility === 'hard') {
    recommendation = `Doable but slow: total profit must ${growthMultiple.toFixed(1)}× (grind ~${estDaysNeeded} days at ≤ $${safeDailyProfitCap}/day). Auto-dilution will handle it, but weigh the days against a fresh reset.`;
  } else {
    recommendation = `⚠️ Impractical to dilute: your biggest day ($${round2(maxDayPnl)}) is so large that total profit would have to ${growthMultiple.toFixed(1)}× (to ~$${round2(targetTotalPnl)}) to get it under ${threshold}%. That's ~${estDaysNeeded} more grind days. Consider RESETTING this account and trading smaller, even days from the start so no single day dominates.`;
  }

  let summary: string;
  if (passing) {
    summary = totalPositive > 0
      ? `Consistency PASSING: biggest day $${round2(maxDayPnl)} is ${maxDayRatioPct.toFixed(1)}% of $${round2(totalPositive)} total (cap ${threshold}%).`
      : `No positive profit recorded yet — nothing to evaluate.`;
  } else {
    summary = `Consistency STUCK at ${maxDayRatioPct.toFixed(1)}% (cap ${threshold}%). Biggest day $${round2(maxDayPnl)} of $${round2(totalPositive)} total. `
      + `To pass, grow total to $${round2(targetTotalPnl)} — about $${round2(additionalProfitNeeded)} more profit, spread across ~${estDaysNeeded} day(s) at ≤ $${safeDailyProfitCap}/day so no new day breaches the cap.`;
  }

  return {
    passing, thresholdPct: threshold, totalPositivePnl: round2(totalPositive),
    maxDayPnl: round2(maxDayPnl), maxDayDate, maxDayRatioPct: round2(maxDayRatioPct),
    targetTotalPnl: round2(targetTotalPnl), additionalProfitNeeded: round2(additionalProfitNeeded),
    safeDailyProfitCap, estDaysNeeded, growthMultiple: round2(growthMultiple),
    feasibility, recommendation, summary,
  };
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

/**
 * Rebuild the durable daily P&L ledger for one connection from the broker's OWN
 * closed-trade history (not just VEDD-routed trades). This is what makes the
 * consistency ratio match the prop firm's dashboard: VEDD's live ledger only
 * captures days VEDD itself closed a trade, so accounts with manual trades (or
 * history predating the connection) read far lower than the firm shows. Pulling
 * the broker's full closed-trade P&L and grouping by UTC day fixes that.
 *
 * REPLACES the connection's existing rows (the broker history is the source of
 * truth and already includes any VEDD-executed trades, so merging would double
 * count). `closedTrades` = [{ profit, closeTime }] from getClosedTradesWithPnl.
 */
export async function rebuildDailyLedgerFromClosedTrades(
  userId: number,
  connectionId: number,
  connectionType: string,
  closedTrades: Array<{ profit: number; closeTime: string | number | Date }>,
): Promise<{ days: number; totalPositive: number; maxDay: number; maxDayDate: string | null; tradesUsed: number }> {
  // Bucket realized P&L by UTC trading day.
  const byDay = new Map<string, number>();
  let used = 0;
  for (const t of closedTrades) {
    const pnl = Number(t.profit);
    if (!isFinite(pnl) || pnl === 0) continue;
    const d = new Date(t.closeTime);
    if (isNaN(d.getTime())) continue;
    const day = d.toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + pnl);
    used++;
  }

  // Replace the connection's ledger atomically.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `DELETE FROM prop_firm_daily_pnl WHERE connection_id = $1 AND connection_type = $2`,
      [connectionId, connectionType]
    );
    for (const [day, pnl] of Array.from(byDay)) {
      await client.query(
        `INSERT INTO prop_firm_daily_pnl (user_id, connection_id, connection_type, trade_date, realized_pnl)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (connection_id, connection_type, trade_date)
         DO UPDATE SET realized_pnl = $5, updated_at = now()`,
        [userId, connectionId, connectionType, day, round2(pnl)]
      );
    }
    await client.query('COMMIT');
  } catch (err: any) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  let totalPositive = 0, maxDay = 0, maxDayDate: string | null = null;
  for (const [day, pnl] of Array.from(byDay)) {
    if (pnl > 0) totalPositive += pnl;
    if (pnl > maxDay) { maxDay = pnl; maxDayDate = day; }
  }
  return { days: byDay.size, totalPositive: round2(totalPositive), maxDay: round2(maxDay), maxDayDate, tradesUsed: used };
}

/**
 * Record a closed trade's realized P&L against the account's daily ledger.
 * Additive — call once per newly-resolved closed trade. Safe to call
 * concurrently; upserts with a running total for the day.
 */
export async function recordRealizedPnl(
  userId: number,
  connectionId: number,
  connectionType: string,
  realizedPnlDelta: number,
  tradeDate?: string
): Promise<void> {
  if (!isFinite(realizedPnlDelta) || realizedPnlDelta === 0) return;
  const dateStr = tradeDate || todayUtcDateStr();
  try {
    await pool.query(
      `INSERT INTO prop_firm_daily_pnl (user_id, connection_id, connection_type, trade_date, realized_pnl)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (connection_id, connection_type, trade_date)
       DO UPDATE SET realized_pnl = prop_firm_daily_pnl.realized_pnl + $5, updated_at = now()`,
      [userId, connectionId, connectionType, dateStr, realizedPnlDelta]
    );
  } catch (err: any) {
    console.error('[Consistency] Failed to record daily P&L (non-fatal):', err?.message ?? err);
  }
}

/**
 * Compute the live consistency ratio + resulting size multiplier for an
 * account, from the durable daily ledger (survives restarts/deploys).
 */
export async function getConsistencyStatus(
  connectionId: number,
  connectionType: string,
  thresholdPct: number | null | undefined,
  enabled: boolean = true
): Promise<ConsistencyResult> {
  const threshold = (typeof thresholdPct === 'number' && thresholdPct > 0)
    ? thresholdPct
    : DEFAULT_CONSISTENCY_THRESHOLD_PCT;

  if (!enabled) {
    // Opted out — some prop firms don't enforce this rule at all. No sizing
    // impact, no block; still report the underlying numbers so the user can
    // see what the ratio WOULD be if they turned it back on.
    return {
      connectionId, connectionType, enabled: false, thresholdPct: threshold,
      todayPnl: 0, totalPositivePnl: 0, ratioPct: 0,
      status: 'disabled', sizeMultiplier: 1, hardBlocked: false,
      guidance: 'Consistency rule is turned off for this account — trades are not tapered or blocked based on daily profit share. Turn it on if your prop firm enforces a max-single-day-profit rule.',
    };
  }

  const dateStr = todayUtcDateStr();

  let rows: Array<{ trade_date: string; realized_pnl: string | number }> = [];
  try {
    const { rows: r } = await pool.query(
      `SELECT trade_date, realized_pnl FROM prop_firm_daily_pnl WHERE connection_id = $1 AND connection_type = $2`,
      [connectionId, connectionType]
    );
    rows = r;
  } catch (err: any) {
    console.error('[Consistency] Failed to read daily P&L (defaulting to safe/no-data):', err?.message ?? err);
  }

  let todayPnl = 0;
  let totalPositivePnl = 0;
  for (const r of rows) {
    const pnl = typeof r.realized_pnl === 'number' ? r.realized_pnl : parseFloat(r.realized_pnl || '0');
    if (!isFinite(pnl)) continue;
    if (r.trade_date === dateStr) todayPnl = pnl;
    if (pnl > 0) totalPositivePnl += pnl;
  }

  const todayPositive = Math.max(0, todayPnl);
  const ratioPct = totalPositivePnl > 0 ? (todayPositive / totalPositivePnl) * 100 : 0;

  // Biggest single day across the whole ledger — this, not today alone, is the
  // real prop-firm consistency ratio. An account can be "stuck" (a PAST big day
  // already exceeds the cap) even on a fresh day when today's ratio is tiny.
  let maxDayPnl = 0;
  for (const r of rows) {
    const pnl = typeof r.realized_pnl === 'number' ? r.realized_pnl : parseFloat(r.realized_pnl || '0');
    if (isFinite(pnl) && pnl > maxDayPnl) maxDayPnl = pnl;
  }
  const maxDayRatioPct = totalPositivePnl > 0 ? (maxDayPnl / totalPositivePnl) * 100 : 0;
  const stuck = maxDayRatioPct > threshold; // a past day already breaches → can only pass by diluting

  const taperStartPct = threshold * TAPER_START_FRACTION;
  let status: ConsistencyStatus = 'safe';
  let sizeMultiplier = 1;
  let hardBlocked = false;
  let guidance = `Today's profit is ${ratioPct.toFixed(1)}% of total realized profit — well within the ${threshold}% consistency cap.`;

  if (stuck) {
    // DILUTION MODE. The account can't pass by concentrating — it needs many
    // small green days so the historical big day shrinks as a share of total.
    // Enforce a per-day profit cap (a fraction of the big day) so no new day
    // becomes a fresh breach; once today hits the cap, stop trading for the day
    // and let tomorrow keep growing the total.
    const dailyCap = Math.max(1, maxDayPnl * DILUTION_DAY_FRACTION);
    const targetTotal = maxDayPnl / (threshold / 100);
    const addNeeded = Math.max(0, targetTotal - totalPositivePnl);
    const daysLeft = dailyCap > 0 ? Math.ceil(addNeeded / dailyCap) : 0;
    if (todayPositive >= dailyCap) {
      status = 'breached';
      sizeMultiplier = 0;
      hardBlocked = true;
      guidance = `Consistency dilution: today's profit ($${todayPositive.toFixed(2)}) hit the per-day cap ($${dailyCap.toFixed(2)}). Trading paused for today so this day doesn't become a new breach. Biggest day is ${maxDayRatioPct.toFixed(1)}% of total (cap ${threshold}%) — grow total to $${targetTotal.toFixed(0)} (~$${addNeeded.toFixed(0)} more, ~${daysLeft} day(s)) to pass.`;
    } else {
      status = 'warning';
      const room = dailyCap - todayPositive;
      // Taper as today approaches the daily cap so it lands under it, not over.
      const progress = dailyCap > 0 ? todayPositive / dailyCap : 1;
      sizeMultiplier = Math.max(TAPER_FLOOR_MULTIPLIER, 1 - progress * (1 - TAPER_FLOOR_MULTIPLIER));
      guidance = `Consistency dilution active: biggest day is ${maxDayRatioPct.toFixed(1)}% of total (cap ${threshold}%). Taking small green days — up to $${room.toFixed(2)} more today (cap $${dailyCap.toFixed(2)}). Need ~$${addNeeded.toFixed(0)} more total over ~${daysLeft} day(s) to pass.`;
    }
  } else if (ratioPct >= threshold) {
    status = 'breached';
    sizeMultiplier = 0;
    hardBlocked = true;
    guidance = `Consistency cap breached: today's profit is ${ratioPct.toFixed(1)}% of total (cap ${threshold}%). New trades are blocked on this account until the next trading day. The ratio will come down as more profit accumulates on other days without adding to today's total.`;
  } else if (ratioPct >= taperStartPct) {
    status = 'warning';
    // Linear taper from 1.0 at taperStartPct down to TAPER_FLOOR_MULTIPLIER at threshold.
    const span = threshold - taperStartPct;
    const progress = span > 0 ? (ratioPct - taperStartPct) / span : 1;
    sizeMultiplier = Math.max(TAPER_FLOOR_MULTIPLIER, 1 - progress * (1 - TAPER_FLOOR_MULTIPLIER));
    guidance = `Approaching the consistency cap: today's profit is ${ratioPct.toFixed(1)}% of total (cap ${threshold}%). Position sizing is being reduced (${Math.round(sizeMultiplier * 100)}% of normal) to avoid crossing the line today.`;
  }

  return {
    connectionId,
    connectionType,
    enabled: true,
    thresholdPct: threshold,
    todayPnl,
    totalPositivePnl,
    ratioPct,
    maxDayPnl: round2(maxDayPnl),
    maxDayRatioPct: round2(maxDayRatioPct),
    dilutionActive: stuck,
    status,
    sizeMultiplier,
    hardBlocked,
    guidance,
  };
}
