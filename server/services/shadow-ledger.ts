// ─────────────────────────────────────────────────────────────────────────────
// Shared shadow ledger (2026-10-30) — step 2 of "shadows → brain add-ons".
//
// One live VIEW over every shadow/paper stream so a single lessons job can
// learn across engines (step 3) instead of each shadow teaching only itself:
//   • fx_shadow      — FX Model 1 / Model 2 (fx_model_decisions engine='fx')
//   • crypto_shadow  — crypto Model 1 / Model 2 (fx_model_decisions engine='crypto')
//   • crypto_paper   — crypto engine paper trades incl. shorts + ORB (crypto_paper_trades)
//   • sol_paper      — Sol engine paper trades (sol_engine_positions mode='paper')
//   • sol_shadow     — Sol engine shadow tests (same table, mode='shadow')
//   • strategy_studio_shadow — Strategy Studio shadow deployments
//     (strategy_trades mode='shadow'; engine='studio')
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
//
// Sol bad-price quarantine (2026-11-06): Sol paper/shadow rows closed before
// the 8dd6a74 deploy (2026-11-06 19:10 UTC) with a <2-minute hold and a ≥40%
// move either way are junk-pool price artifacts, not trade evidence (RAY
// "hit TP" at +148% in 0.2s). They are excluded from the Sol arm below so
// lessons, summaries and the weekly review never learn from them. The
// positions themselves are untouched — only this learning view filters them.
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
  SELECT ('sol_' || s.mode || ':' || s.id)::text,
         CASE WHEN s.mode = 'shadow' THEN 'sol_shadow' ELSE 'sol_paper' END, 'sol', s.user_id,
         s.strategy_id, s.symbol, 'LONG',
         s.opened_at::timestamptz, NULLIF(s.closed_at, '')::timestamptz,
         extract(hour from s.opened_at::timestamptz AT TIME ZONE 'UTC')::int,
         ${SESSION_SQL("(s.opened_at::timestamptz AT TIME ZONE 'UTC')")},
         NULL, NULL, NULL, NULL, true,
         CASE WHEN s.close_pnl_pct > 0 THEN 'WIN' WHEN s.close_pnl_pct < 0 THEN 'LOSS' ELSE 'FLAT' END,
         CASE WHEN s.sl_pct > 0 THEN (s.close_pnl_pct / s.sl_pct)::float END,
         s.close_pnl_pct::float
    FROM sol_engine_positions s
   WHERE s.mode IN ('paper', 'shadow') AND s.status = 'closed' AND s.close_pnl_pct IS NOT NULL
     AND NOT (
       NULLIF(s.closed_at, '')::timestamptz < TIMESTAMPTZ '2026-11-06 19:15:00+00'
       AND abs(s.close_pnl_pct) >= 40
       AND (extract(epoch from (NULLIF(s.closed_at, '')::timestamptz - s.opened_at::timestamptz)) < 120
            -- known junk-priced symbols (sol-brain.ts BAD_PRICE_SYMBOLS), any hold
            OR s.symbol IN ('RAY', 'mSOL'))
     )
  UNION ALL
  -- Crypto all-strategy shadow lane (crypto-shadow.ts). Shorts are hypothetical
  -- (Base spot can't short) and get their own source so they are reported apart.
  SELECT ('crypto_shadow_all:' || x.id)::text,
         CASE WHEN x.direction = 'long' THEN 'crypto_shadow_all' ELSE 'crypto_shadow_short' END, 'crypto', x.user_id,
         x.strategy, x.symbol, CASE WHEN x.direction = 'long' THEN 'LONG' ELSE 'SHORT' END,
         x.opened_at, x.closed_at,
         extract(hour from x.opened_at AT TIME ZONE 'UTC')::int,
         ${SESSION_SQL("(x.opened_at AT TIME ZONE 'UTC')")},
         NULL, xc.h1_trend, xc.h4_trend, xc.htf_aligned, true,
         CASE WHEN x.exit_reason = 'time limit' THEN 'EXPIRED' WHEN x.r_multiple > 0 THEN 'WIN' WHEN x.r_multiple < 0 THEN 'LOSS' ELSE 'FLAT' END,
         x.r_multiple::float, x.return_pct::float
    FROM crypto_shadow_trades x
    LEFT JOIN crypto_shadow_context xc ON xc.trade_id = x.id
   WHERE x.status = 'closed' AND x.return_pct IS NOT NULL
  UNION ALL
  -- Kalshi stock-perp shadow lane (kalshi-stock-shadow.ts). Perps short
  -- natively, so shorts are real reads, not hypothetical. Corporate-action
  -- closes are excluded (the price series adjusts across the action — any
  -- return spanning it is fiction), as are sub-2-minute ≥40% prints (the
  -- Sol quarantine discipline: a large-cap perp does not legitimately move
  -- 40% in 2 minutes outside a split print, and splits are handled above).
  SELECT ('kalshi_stock_shadow:' || k.id)::text, 'kalshi_stock_shadow', 'kalshi_perp', k.user_id,
         k.strategy, k.ticker, CASE WHEN k.direction = 'short' THEN 'SHORT' ELSE 'LONG' END,
         k.opened_at, k.closed_at,
         extract(hour from k.opened_at AT TIME ZONE 'UTC')::int,
         ${SESSION_SQL("(k.opened_at AT TIME ZONE 'UTC')")},
         NULL, kc.h1_trend, kc.h4_trend, kc.htf_aligned, true,
         CASE WHEN k.exit_reason = 'time limit' THEN 'EXPIRED' WHEN k.r_multiple > 0 THEN 'WIN' WHEN k.r_multiple < 0 THEN 'LOSS' ELSE 'FLAT' END,
         k.r_multiple::float, k.return_pct::float
    FROM kalshi_perp_shadow_trades k
    LEFT JOIN kalshi_perp_shadow_context kc ON kc.trade_id = k.id
   WHERE k.status = 'closed' AND k.return_pct IS NOT NULL AND k.exclude_from_stats IS NOT TRUE
     AND NOT (abs(k.return_pct) >= 40 AND extract(epoch from (k.closed_at - k.opened_at)) < 120)
  UNION ALL
  -- Strategy Studio shadow deployments (strategy-shadow.ts): the runner
  -- trading saved spec strategies virtually — fills resolved from bar
  -- prices into strategy_trades rows with mode='shadow'. R comes from
  -- the row's own r_multiple (P&L vs the entry-time stop distance), so
  -- only closes that carried a stop participate. return_pct is not
  -- tracked for spec trades (no account balance to percentage against)
  -- and stays NULL. Live rows (mode='live') never appear here, and
  -- these rows never count toward Brain Marketplace eligibility.
  SELECT ('strategy_studio_shadow:' || t.id)::text, 'strategy_studio_shadow', 'studio', t.user_id,
         COALESCE(w.name, 'strategy ' || t.strategy_id), t.symbol,
         CASE WHEN upper(t.direction) = 'SELL' THEN 'SHORT' ELSE 'LONG' END,
         t.opened_at, t.closed_at,
         extract(hour from t.opened_at AT TIME ZONE 'UTC')::int,
         ${SESSION_SQL("(t.opened_at AT TIME ZONE 'UTC')")},
         NULL, NULL, NULL, NULL, true,
         CASE WHEN t.r_multiple > 0 THEN 'WIN' WHEN t.r_multiple < 0 THEN 'LOSS' ELSE 'FLAT' END,
         t.r_multiple::float, NULL::float
    FROM strategy_trades t
    LEFT JOIN wizard_strategies w ON w.id = t.strategy_id
   WHERE t.mode = 'shadow' AND t.status = 'closed' AND t.r_multiple IS NOT NULL
`;

let _ensured: Promise<void> | null = null;
/** Create/refresh the view. Missing source tables (fresh DB) are created by their own ensure functions first. */
export function ensureShadowLedger(): Promise<void> {
  if (!_ensured) {
    _ensured = (async () => {
      try { const { ensurePaperTable } = await import('./crypto-paper'); await ensurePaperTable(); } catch { /* table may already exist */ }
      try { const { ensureCryptoShadowTables } = await import('./crypto-shadow'); await ensureCryptoShadowTables(); } catch { /* table may already exist */ }
      try { const { ensureKalshiPerpShadowTables } = await import('./ensure-kalshi-perp-shadow-tables'); await ensureKalshiPerpShadowTables(); } catch { /* table may already exist */ }
      try { const { ensureStrategyTables } = await import('./strategy-deployments'); await ensureStrategyTables(); } catch { /* table may already exist */ }
      try { const { ensureWizardStrategiesTable } = await import('./wizard-spec-strategies'); await ensureWizardStrategiesTable(); } catch { /* table may already exist */ }
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
