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

export type ConsistencyStatus = 'safe' | 'warning' | 'breached';

export interface ConsistencyResult {
  connectionId: number;
  connectionType: string;
  thresholdPct: number;
  todayPnl: number;
  totalPositivePnl: number;
  ratioPct: number; // today's (positive) profit as % of total positive profit
  status: ConsistencyStatus;
  sizeMultiplier: number; // 0 (hard block) .. 1 (full size)
  hardBlocked: boolean;
  guidance: string;
}

function todayUtcDateStr(): string {
  return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
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
  thresholdPct: number | null | undefined
): Promise<ConsistencyResult> {
  const threshold = (typeof thresholdPct === 'number' && thresholdPct > 0)
    ? thresholdPct
    : DEFAULT_CONSISTENCY_THRESHOLD_PCT;
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

  const taperStartPct = threshold * TAPER_START_FRACTION;
  let status: ConsistencyStatus = 'safe';
  let sizeMultiplier = 1;
  let hardBlocked = false;
  let guidance = `Today's profit is ${ratioPct.toFixed(1)}% of total realized profit — well within the ${threshold}% consistency cap.`;

  if (ratioPct >= threshold) {
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
    thresholdPct: threshold,
    todayPnl,
    totalPositivePnl,
    ratioPct,
    status,
    sizeMultiplier,
    hardBlocked,
    guidance,
  };
}
