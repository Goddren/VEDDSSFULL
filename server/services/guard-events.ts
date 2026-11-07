// Engine safeguard log (2026-10-19 bug-scan fixes). Every time a protection
// acts — a stop loosen refused, a size clamped to a cap, a partial close
// refused, a brain block skipped for thin data, a flatten retried — a row is
// written here so the effect of each fix can be watched like shadow mode.
// Fire-and-forget: logging can never block or fail a trading action.

import { pool } from '../db';

let ensured: Promise<void> | null = null;
function ensure(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(`
      CREATE TABLE IF NOT EXISTS engine_guard_events (
        id serial PRIMARY KEY,
        user_id integer NOT NULL,
        engine text NOT NULL DEFAULT 'fx',
        kind text NOT NULL,
        symbol text,
        detail text,
        data jsonb,
        created_at timestamp NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS engine_guard_events_user_idx ON engine_guard_events (user_id, created_at DESC);
    `).then(() => undefined).catch((e: any) => { console.error('[guard-events] ensure failed:', e?.message || e); ensured = null; });
  }
  return ensured;
}

export function logGuard(userId: number, kind: string, symbol: string | null, detail: string, data?: unknown, engine = 'fx'): void {
  void (async () => {
    try {
      await ensure();
      await pool.query(
        `INSERT INTO engine_guard_events (user_id, engine, kind, symbol, detail, data) VALUES ($1,$2,$3,$4,$5,$6::jsonb)`,
        [userId, engine, kind, symbol, String(detail).slice(0, 500), JSON.stringify(data ?? null)],
      );
    } catch { /* never block trading on logging */ }
  })();
}

/**
 * Per-guard fire rates (2026-11-06, engine report rec #3): for each engine +
 * guard kind, how many times it fired in the current window vs the previous
 * one, when it last fired, and the symbol it fires on most. A guard that
 * fires constantly is a recalibration candidate; a guard that never fires is
 * dead weight — this turns guard tuning from opinion into measurement.
 */
export async function guardFireRates(userId: number, days = 7): Promise<{ days: number; rates: any[] }> {
  await ensure();
  const d = Math.max(1, Math.min(90, days));
  const { rows } = await pool.query(
    `SELECT e.engine, e.kind,
            count(*) FILTER (WHERE e.created_at > now() - ($2 || ' days')::interval)::int AS fires,
            count(*) FILTER (WHERE e.created_at <= now() - ($2 || ' days')::interval)::int AS prev_fires,
            max(e.created_at) AS last_fired,
            (SELECT e2.symbol FROM engine_guard_events e2
              WHERE e2.user_id = $1 AND e2.engine = e.engine AND e2.kind = e.kind AND e2.symbol IS NOT NULL
              GROUP BY e2.symbol ORDER BY count(*) DESC LIMIT 1) AS top_symbol
       FROM engine_guard_events e
      WHERE e.user_id = $1 AND e.created_at > now() - (2 * ($2 || ' days')::interval)
      GROUP BY e.engine, e.kind
      ORDER BY fires DESC`,
    [userId, String(d)],
  );
  return { days: d, rates: rows };
}

export async function recentGuardEvents(userId: number, limit = 100, kinds?: string[]): Promise<{ events: any[]; summary: any[] }> {
  await ensure();
  const _k = (kinds || []).filter((k) => /^[a-z_]{1,40}$/.test(k));
  const [ev, sum] = await Promise.all([
    _k.length
      ? pool.query(`SELECT id, engine, kind, symbol, detail, created_at FROM engine_guard_events WHERE user_id=$1 AND kind = ANY($3) ORDER BY created_at DESC LIMIT $2`, [userId, Math.min(500, Math.max(1, limit)), _k])
      : pool.query(`SELECT id, engine, kind, symbol, detail, created_at FROM engine_guard_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, Math.min(500, Math.max(1, limit))]),
    pool.query(`SELECT kind, count(*)::int AS n, max(created_at) AS last FROM engine_guard_events WHERE user_id=$1 AND created_at > now() - interval '7 days' GROUP BY kind ORDER BY n DESC`, [userId]),
  ]);
  return { events: ev.rows, summary: sum.rows };
}
