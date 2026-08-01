// Durable Micro Growth session history — replaces global.microGrowthSessions
// (active) / global.microGrowthHistory (completed), both in-memory only and
// wiped on every restart/deploy.

import { pool } from '../db';

export interface MicroGrowthSessionRow {
  id: string;
  userId: number;
  startedAt: string;
  durationMs: number;
  tier: number;
  lotSize: number;
  maxTrades: number;
  pipTarget: number;
  slPips: number;
  pairs: string[];
  weekendCryptoMode: boolean;
  status: 'active' | 'completed';
  tradesCount: number;
  pipsGained: number;
  pnl: number;
  completedAt: string | null;
}

function toRow(r: any): MicroGrowthSessionRow {
  return {
    id: r.id, userId: r.user_id, startedAt: new Date(r.started_at).toISOString(),
    durationMs: r.duration_ms, tier: r.tier, lotSize: r.lot_size, maxTrades: r.max_trades,
    pipTarget: r.pip_target, slPips: r.sl_pips, pairs: r.pairs ?? [],
    weekendCryptoMode: r.weekend_crypto_mode, status: r.status, tradesCount: r.trades_count,
    pipsGained: r.pips_gained, pnl: r.pnl,
    completedAt: r.completed_at ? new Date(r.completed_at).toISOString() : null,
  };
}

export async function createMicroGrowthSession(session: Omit<MicroGrowthSessionRow, 'completedAt' | 'status'>): Promise<void> {
  await pool.query(
    `INSERT INTO micro_growth_sessions
       (id, user_id, started_at, duration_ms, tier, lot_size, max_trades, pip_target, sl_pips, pairs, weekend_crypto_mode, status, trades_count, pips_gained, pnl)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'active', $12, $13, $14)`,
    [session.id, session.userId, session.startedAt, session.durationMs, session.tier, session.lotSize,
     session.maxTrades, session.pipTarget, session.slPips, JSON.stringify(session.pairs), session.weekendCryptoMode,
     session.tradesCount, session.pipsGained, session.pnl]
  );
}

export async function getActiveMicroGrowthSession(userId: number): Promise<MicroGrowthSessionRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM micro_growth_sessions WHERE user_id = $1 AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
    [userId]
  );
  return rows[0] ? toRow(rows[0]) : null;
}

export async function completeMicroGrowthSession(
  sessionId: string, userId: number,
  updates: { pipsGained: number; tradesCount: number; pnl: number; pairs?: string[] }
): Promise<MicroGrowthSessionRow | null> {
  const { rows } = await pool.query(
    `UPDATE micro_growth_sessions
     SET status = 'completed', pips_gained = $1, trades_count = $2, pnl = $3,
         pairs = COALESCE($4, pairs), completed_at = now()
     WHERE id = $5 AND user_id = $6 AND status = 'active'
     RETURNING *`,
    [updates.pipsGained, updates.tradesCount, updates.pnl,
     updates.pairs ? JSON.stringify(updates.pairs) : null, sessionId, userId]
  );
  return rows[0] ? toRow(rows[0]) : null;
}

export async function getMicroGrowthHistory(userId: number, limit = 20): Promise<MicroGrowthSessionRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM micro_growth_sessions WHERE user_id = $1 AND status = 'completed'
     ORDER BY completed_at DESC LIMIT $2`,
    [userId, limit]
  );
  return rows.map(toRow);
}

/** Today's + all-time realized P&L and total completed-session count, for the status card. */
export async function getMicroGrowthStats(userId: number): Promise<{ todayPnl: number; totalPnl: number; sessionCount: number }> {
  const { rows } = await pool.query(
    `SELECT
       COALESCE(sum(pnl) FILTER (WHERE completed_at >= date_trunc('day', now())), 0) AS today_pnl,
       COALESCE(sum(pnl), 0) AS total_pnl,
       count(*) AS session_count
     FROM micro_growth_sessions WHERE user_id = $1 AND status = 'completed'`,
    [userId]
  );
  const r = rows[0];
  return { todayPnl: Number(r.today_pnl), totalPnl: Number(r.total_pnl), sessionCount: Number(r.session_count) };
}
