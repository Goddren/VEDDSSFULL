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

export async function recentGuardEvents(userId: number, limit = 100): Promise<{ events: any[]; summary: any[] }> {
  await ensure();
  const [ev, sum] = await Promise.all([
    pool.query(`SELECT id, engine, kind, symbol, detail, created_at FROM engine_guard_events WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`, [userId, Math.min(500, Math.max(1, limit))]),
    pool.query(`SELECT kind, count(*)::int AS n, max(created_at) AS last FROM engine_guard_events WHERE user_id=$1 AND created_at > now() - interval '7 days' GROUP BY kind ORDER BY n DESC`, [userId]),
  ]);
  return { events: ev.rows, summary: sum.rows };
}
