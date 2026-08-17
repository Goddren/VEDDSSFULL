// Ambassador Profit Split Program — VEDD takes `pct`% (default 30) of a user's
// prop-firm NET realized profit instead of a paid subscription. Enrolled users
// get full access (see getEffectiveAiCostCapCents in ai-usage.ts). Realized
// profit is summed from the durable prop_firm_daily_pnl ledger.

import { pool } from '../db';

export const DEFAULT_SPLIT_PCT = 30;

// ── Cached "is enrolled" check (hot path — read on AI cost-cap resolution) ──
const _enrolledCache = new Map<number, { v: boolean; at: number }>();
const ENROLL_TTL_MS = 30_000;

export async function isProfitSplitEnrolled(userId: number): Promise<boolean> {
  const hit = _enrolledCache.get(userId);
  if (hit && Date.now() - hit.at < ENROLL_TTL_MS) return hit.v;
  let v = false;
  try {
    const r = await pool.query(
      `SELECT 1 FROM profit_split_enrollments WHERE user_id = $1 AND status = 'active' LIMIT 1`,
      [userId],
    );
    v = (r.rowCount ?? 0) > 0;
  } catch { /* table may not exist yet on first boot — treat as not enrolled */ }
  _enrolledCache.set(userId, { v, at: Date.now() });
  return v;
}

function _invalidate(userId: number) { _enrolledCache.delete(userId); }

// Sum NET realized P&L across a user's prop-firm TradeLocker connections.
async function _propFirmRealized(userId: number): Promise<{ net: number; connections: number }> {
  const conns = await pool.query(
    `SELECT id FROM tradelocker_connections WHERE user_id = $1 AND is_prop_firm_account = true`,
    [userId],
  );
  const ids = conns.rows.map((r: any) => r.id);
  if (!ids.length) return { net: 0, connections: 0 };
  const sum = await pool.query(
    `SELECT COALESCE(SUM(realized_pnl), 0) AS net FROM prop_firm_daily_pnl
       WHERE connection_type = 'tradelocker' AND connection_id = ANY($1::int[])`,
    [ids],
  );
  return { net: Number(sum.rows[0]?.net ?? 0), connections: ids.length };
}

export interface ProfitSplitStatus {
  enrolled: boolean;
  pct: number;
  status: string | null;
  enrolledBy: number | null;
  propFirmConnections: number;
  netProfit: number;      // net realized P&L across prop-firm accounts
  owed: number;           // pct% of net profit (0 if net <= 0)
  paid: number;           // total collected
  balance: number;        // owed - paid
  startedAt: string | null;
}

export async function getProfitSplitStatus(userId: number): Promise<ProfitSplitStatus> {
  const enr = await pool.query(
    `SELECT pct, status, enrolled_by, created_at FROM profit_split_enrollments WHERE user_id = $1`,
    [userId],
  );
  const row = enr.rows[0];
  const pct = row ? Number(row.pct) : DEFAULT_SPLIT_PCT;
  const active = !!row && row.status === 'active';

  const { net, connections } = await _propFirmRealized(userId);
  const owed = net > 0 ? Math.round(net * (pct / 100) * 100) / 100 : 0;

  let paid = 0;
  try {
    const p = await pool.query(`SELECT COALESCE(SUM(amount), 0) AS paid FROM profit_split_payments WHERE user_id = $1`, [userId]);
    paid = Number(p.rows[0]?.paid ?? 0);
  } catch { /* ignore */ }

  return {
    enrolled: active,
    pct,
    status: row?.status ?? null,
    enrolledBy: row?.enrolled_by ?? null,
    propFirmConnections: connections,
    netProfit: Math.round(net * 100) / 100,
    owed,
    paid: Math.round(paid * 100) / 100,
    balance: Math.round((owed - paid) * 100) / 100,
    startedAt: row?.created_at ? new Date(row.created_at).toISOString() : null,
  };
}

export async function enrollProfitSplit(userId: number, enrolledBy: number | null, pct = DEFAULT_SPLIT_PCT): Promise<void> {
  await pool.query(
    `INSERT INTO profit_split_enrollments (user_id, pct, status, enrolled_by, updated_at)
       VALUES ($1, $2, 'active', $3, now())
     ON CONFLICT (user_id) DO UPDATE
       SET status = 'active', pct = EXCLUDED.pct, enrolled_by = EXCLUDED.enrolled_by, updated_at = now()`,
    [userId, pct, enrolledBy],
  );
  _invalidate(userId);
}

export async function unenrollProfitSplit(userId: number): Promise<void> {
  await pool.query(
    `UPDATE profit_split_enrollments SET status = 'ended', updated_at = now() WHERE user_id = $1`,
    [userId],
  );
  _invalidate(userId);
}

export async function recordProfitSplitPayment(userId: number, amount: number, note?: string): Promise<void> {
  await pool.query(
    `INSERT INTO profit_split_payments (user_id, amount, note) VALUES ($1, $2, $3)`,
    [userId, amount, note ?? null],
  );
}

// Admin: all active enrollments with computed owed/balance (for the console).
export async function listProfitSplitEnrollments(): Promise<Array<ProfitSplitStatus & { userId: number; username: string | null }>> {
  const enr = await pool.query(
    `SELECT e.user_id, u.username FROM profit_split_enrollments e
       LEFT JOIN users u ON u.id = e.user_id
      WHERE e.status = 'active' ORDER BY e.created_at DESC`,
  );
  const out: Array<ProfitSplitStatus & { userId: number; username: string | null }> = [];
  for (const r of enr.rows) {
    const s = await getProfitSplitStatus(r.user_id);
    out.push({ ...s, userId: r.user_id, username: r.username ?? null });
  }
  return out;
}
