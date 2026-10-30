// ─────────────────────────────────────────────────────────────────────────────
// Shared shadow ledger (2026-10-30) — step 2 of "shadows → brain add-ons".
//
// One live VIEW over every shadow/paper stream so a single lessons job can
// learn across engines (step 3) instead of each shadow teaching only itself:
//   • fx_shadow      — FX Model 1 / Model 2 (fx_model_decisions engine='fx')
//   • crypto_shadow  — crypto Model 1 / Model 2 (fx_model_decisions engine='crypto')
//   • crypto_paper   — crypto engine paper trades incl. shorts + ORB (crypto_paper_trades)
//   • sol_paper      — Sol engine paper trades (sol_engine_positions mode='paper')
// A VIEW, not a copy: always current, nothing to sync, no duplicates.
//
// Common columns: source, engine, user_id, strategy, symbol, direction
// (LONG/SHORT), opened_at, closed_at, hour_utc, session (Asian/London/
// Overlap/NewYork/Late by entry hour UTC), day_type, h1_trend, h4_trend,
// h4_aligned, context_reliable, result (WIN/LOSS/EXPIRED/FLAT), r_multiple,
// return_pct.
//
// context_reliable: FX shadow H1/H4 fields recorded before 2026-10-23 04:00
// UTC came from oldest-first (week-stale) reads (fixed d1d1f932) — the
// RESULTS are fine, the trend context is not. Lessons must not use those
// trend fields when context_reliable is false.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

const SESSION_SQL = (ts: string) => `CASE
  WHEN extract(hour from ${ts}) < 7  THEN 'Asian'
  WHEN extract(hour from ${ts}) < 12 THEN 'London'
  WHEN extract(hour from ${ts}) < 16 THEN 'Overlap'
  WHEN extract(hour from ${ts}) < 21 THEN 'NewYork'
  ELSE 'Late' END`;

const VIEW_SQL = `
CREATE OR REPLACE VIEW shadow_ledger AS
  SELECT ('fx_model:' || d.id)::text AS ledger_id,
         CASE WHEN d.engine = 'crypto' THEN 'crypto_shadow' ELSE 'fx_shadow' END AS source,
         COALESCE(d.engine, 'fx') AS engine, d.user_id,
         d.model AS strategy, d.symbol,
         CASE WHEN upper(d.direction) = 'SELL' THEN 'SHORT' ELSE 'LONG' END AS direction,
         (d.created_at AT TIME ZONE 'UTC') AS opened_at, (d.resolved_at AT TIME ZONE 'UTC') AS closed_at,
         extract(hour from d.created_at)::int AS hour_utc,
         ${SESSION_SQL('d.created_at')} AS session,
         d.day_type,
         d.context->'h1'->>'trend' AS h1_trend, d.context->'h4'->>'trend' AS h4_trend,
         CASE WHEN d.context->'h4'->>'trend' IS NULL THEN NULL
              WHEN upper(d.direction) = 'BUY'  THEN (d.context->'h4'->>'trend') = 'BULLISH'
              WHEN upper(d.direction) = 'SELL' THEN (d.context->'h4'->>'trend') = 'BEARISH' END AS h4_aligned,
         (d.created_at >= TIMESTAMP '2026-10-23 04:00:00') AS context_reliable,
         CASE WHEN d.result = 'EXPIRED' THEN 'EXPIRED' WHEN d.r_multiple > 0 THEN 'WIN' WHEN d.r_multiple < 0 THEN 'LOSS' ELSE d.result END AS result,
         d.r_multiple::float AS r_multiple, NULL::float AS return_pct
    FROM fx_model_decisions d
   WHERE d.result IN ('WIN','LOSS','EXPIRED') AND d.direction IN ('BUY','SELL') AND d.source = 'own'
  UNION ALL
  SELECT ('crypto_paper:' || c.id)::text, 'crypto_paper', 'crypto', c.user_id,
         c.strategy, c.symbol,
         CASE WHEN c.direction = 'short' THEN 'SHORT' ELSE 'LONG' END,
         c.opened_at, c.closed_at,
         extract(hour from c.opened_at AT TIME ZONE 'UTC')::int,
         ${SESSION_SQL("(c.opened_at AT TIME ZONE 'UTC')")},
         NULL, NULL, NULL, NULL, true,
         CASE WHEN c.exit_reason = 'time limit' THEN 'EXPIRED' WHEN c.r_multiple > 0 THEN 'WIN' WHEN c.r_multiple < 0 THEN 'LOSS' ELSE 'FLAT' END,
         c.r_multiple::float, c.return_pct::float
    FROM crypto_paper_trades c
   WHERE c.status = 'closed'
  UNION ALL
  SELECT ('sol_paper:' || s.id)::text, 'sol_paper', 'sol', s.user_id,
         s.strategy_id, s.symbol, 'LONG',
         s.opened_at::timestamptz, NULLIF(s.closed_at, '')::timestamptz,
         extract(hour from s.opened_at::timestamptz AT TIME ZONE 'UTC')::int,
         ${SESSION_SQL("(s.opened_at::timestamptz AT TIME ZONE 'UTC')")},
         NULL, NULL, NULL, NULL, true,
         CASE WHEN s.close_pnl_pct > 0 THEN 'WIN' WHEN s.close_pnl_pct < 0 THEN 'LOSS' ELSE 'FLAT' END,
         CASE WHEN s.sl_pct > 0 THEN (s.close_pnl_pct / s.sl_pct)::float END,
         s.close_pnl_pct::float
    FROM sol_engine_positions s
   WHERE s.mode = 'paper' AND s.status = 'closed' AND s.close_pnl_pct IS NOT NULL
`;

let _ensured: Promise<void> | null = null;
/** Create/refresh the view. Missing source tables (fresh DB) are created by their own ensure functions first. */
export function ensureShadowLedger(): Promise<void> {
  if (!_ensured) {
    _ensured = (async () => {
      try { const { ensurePaperTable } = await import('./crypto-paper'); await ensurePaperTable(); } catch { /* table may already exist */ }
      await pool.query(VIEW_SQL);
    })().catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

/** Totals by source, plus the strongest/weakest slices, for the API and the lessons job. */
export async function shadowLedgerSummary(userId: number, days = 30): Promise<any> {
  await ensureShadowLedger();
  const since = `now() - ($2 || ' days')::interval`;
  const q = (sql: string) => pool.query(sql, [userId, String(Math.max(1, Math.min(365, days)))]).then((r) => r.rows);
  const agg = `count(*)::int AS trades, count(*) FILTER (WHERE result='WIN')::int AS wins,
               round(avg(r_multiple)::numeric, 2)::float AS avg_r, round(sum(r_multiple)::numeric, 1)::float AS total_r`;
  const [bySource, bySession, byDirection, slices, alignment] = await Promise.all([
    q(`SELECT source, ${agg} FROM shadow_ledger WHERE user_id=$1 AND closed_at >= ${since} GROUP BY 1 ORDER BY 1`),
    q(`SELECT source, session, ${agg} FROM shadow_ledger WHERE user_id=$1 AND closed_at >= ${since} GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT source, direction, ${agg} FROM shadow_ledger WHERE user_id=$1 AND closed_at >= ${since} GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT source, strategy, symbol, ${agg} FROM shadow_ledger WHERE user_id=$1 AND closed_at >= ${since}
        GROUP BY 1,2,3 HAVING count(*) >= 3 ORDER BY avg(r_multiple) DESC NULLS LAST`),
    q(`SELECT source, h4_aligned, ${agg} FROM shadow_ledger WHERE user_id=$1 AND closed_at >= ${since} AND context_reliable AND h4_aligned IS NOT NULL
        GROUP BY 1,2 ORDER BY 1,2`),
  ]);
  return { days, bySource, bySession, byDirection, best: slices.slice(0, 10), worst: slices.slice(-10).reverse(), h4Alignment: alignment };
}
