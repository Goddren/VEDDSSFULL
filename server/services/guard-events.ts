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

/**
 * Blocked-trade counterfactuals (2026-11-08, engine report follow-up):
 * when an entry guard stops a trade that had a complete plan (entry, stop,
 * target), record the plan as a shadow decision the existing resolver
 * (fx-models.ts resolveShadowDecisions) scores against real prices — so the
 * scoreboard can say whether each guard mostly stops winners or losers.
 *
 * Safety: rows are stored with source='guard_block', which every learning
 * consumer already excludes — the shadow ledger view and the fx-models
 * stats queries all filter source='own', and getModelMastery explicitly
 * excludes 'guard_block'. These rows can never teach the brain anything;
 * they only measure the guards. Fire-and-forget; a malformed plan (missing
 * prices, stop/target on the wrong side) is skipped silently. Kill switch:
 * GUARD_COUNTERFACTUALS=off.
 */
export function recordBlockedTrade(userId: number, kind: string, symbol: string | null, plan: {
  direction?: unknown; entryPrice?: unknown; stopLoss?: unknown; takeProfit?: unknown;
  confidence?: unknown; model?: unknown; setup?: unknown; session?: unknown;
}, detail?: string): void {
  if (process.env.GUARD_COUNTERFACTUALS === 'off') return;
  void (async () => {
    try {
      const dir = String(plan.direction ?? '').toUpperCase();
      if (dir !== 'BUY' && dir !== 'SELL') return;
      const entry = Number(plan.entryPrice), sl = Number(plan.stopLoss), tp = Number(plan.takeProfit);
      if (!(entry > 0) || !(sl > 0) || !(tp > 0)) return;
      if (!(Math.abs(entry - sl) > 0)) return;
      if (dir === 'BUY' ? !(sl < entry && tp > entry) : !(sl > entry && tp < entry)) return;
      const { ensureFxModelTables } = await import('./fx-models');
      await ensureFxModelTables();
      const conf = Number(plan.confidence);
      // Gate calibration (feat/gate-calibration) slices blocked plans by
      // pair × session and replays the R:R gate per confidence band, so the
      // row now also carries the canonical session plus the planned R:R and
      // the exact confidence in context. Older consumers only read
      // context->>'guard', which is unchanged.
      const plannedRR = Math.abs(tp - entry) / Math.abs(entry - sl);
      const { canonSession } = await import('../utils/session');
      const session = plan.session ? canonSession(plan.session, new Date().getUTCHours()) : null;
      await pool.query(
        `INSERT INTO fx_model_decisions (user_id, symbol, model, mode, session, direction, entry_price, stop_loss, take_profit, confidence, setup, reasoning, context, source, engine)
         VALUES ($1,$2,$3,'blocked',$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'guard_block','fx')`,
        [userId, symbol, String(plan.model ?? 'engine').slice(0, 60), session, dir, entry, sl, tp,
         Number.isFinite(conf) ? Math.round(conf) : null,
         plan.setup ? String(plan.setup).slice(0, 120) : null,
         `Blocked by ${kind}${detail ? `: ${String(detail).slice(0, 300)}` : ''}`.slice(0, 500),
         JSON.stringify({ guard: kind, plannedRR: Math.round(plannedRR * 1000) / 1000, ...(Number.isFinite(conf) ? { confidence: conf } : {}) })],
      );
    } catch { /* counterfactuals never block trading */ }
  })();
}

/** Per-guard counterfactual scoreboard: of the trades each guard stopped,
 *  how many would have won / lost (resolved by the shadow resolver). */
export async function guardCounterfactuals(userId: number, days = 30): Promise<{ days: number; guards: any[] }> {
  const d = Math.max(1, Math.min(90, days));
  try {
    const { ensureFxModelTables } = await import('./fx-models');
    await ensureFxModelTables();
    const { rows } = await pool.query(
      `SELECT context->>'guard' AS kind,
              count(*)::int AS recorded,
              count(*) FILTER (WHERE result IN ('WIN','LOSS','EXPIRED'))::int AS resolved,
              count(*) FILTER (WHERE result = 'WIN')::int AS would_win,
              count(*) FILTER (WHERE result = 'LOSS')::int AS would_lose,
              count(*) FILTER (WHERE result = 'EXPIRED')::int AS expired,
              count(*) FILTER (WHERE result IS NULL)::int AS pending,
              avg(r_multiple) FILTER (WHERE result IN ('WIN','LOSS','EXPIRED'))::float AS avg_r
         FROM fx_model_decisions
        WHERE user_id = $1 AND source = 'guard_block' AND created_at > now() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY resolved DESC, recorded DESC`,
      [userId, String(d)],
    );
    return { days: d, guards: rows };
  } catch {
    return { days: d, guards: [] };
  }
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
