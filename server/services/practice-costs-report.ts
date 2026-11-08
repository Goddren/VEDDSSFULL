// ── Practice cost check (Stage E, 2026-11-08) ───────────────────────────────
// What do practice trades actually get charged, and what does the cost
// model assume? Aggregates the stored per-trade costs on crypto paper
// trades (cost_bps / cost_usd / liquidity_usd / gross vs net return —
// columns added 2026-11-06) and reports the cost model's live constants
// (env-resolved, same defaults as paper-costs.ts) beside them.
//
// HONEST SCOPE: live crypto fills are DeFi swaps whose costs are embedded
// in execution prices — no fee column exists on live trades, so there is
// no stored "real cost" series to diff against. This report is the
// evidence base for tuning: the distribution of what practice charges,
// how much return it eats, and how often it flips a winner to a loser.
// Sol paper positions store no cost column, so Sol appears as model
// constants only.

import { pool } from '../db';

const num = (name: string, dflt: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};

export function costModelConstants() {
  return {
    cryptoFeeBps: num('CRYPTO_PAPER_FEE_BPS', 30),
    cryptoFeeDeepBps: num('CRYPTO_PAPER_FEE_DEEP_BPS', 5),
    cryptoFloorMult: num('CRYPTO_PAPER_COST_FLOOR_MULT', 3),
    solSlippagePct: num('SOL_PAPER_SLIPPAGE_PCT', 0.5),
    solFeePumpfunPct: num('SOL_PAPER_FEE_PUMPFUN_PCT', 1.0),
    solFeeDefaultPct: num('SOL_PAPER_FEE_DEFAULT_PCT', 0.3),
    solImpactFallbackPct: num('SOL_PAPER_IMPACT_FALLBACK_PCT', 1.0),
  };
}

const BANDS = `
  CASE WHEN liquidity_usd IS NULL THEN 'unknown'
       WHEN liquidity_usd < 50000 THEN 'thin (<$50K)'
       WHEN liquidity_usd < 250000 THEN 'mid ($50–250K)'
       ELSE 'deep (>$250K)' END`;

export async function practiceCostReport(userId: number, days = 90): Promise<any> {
  const d = Math.max(7, Math.min(365, days));
  const out: any = { days: d, constants: costModelConstants(), cryptoPaper: null, bands: [] };
  try {
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n,
              avg(cost_bps)::float AS avg_bps,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY cost_bps)::float AS median_bps,
              avg(cost_usd)::float AS avg_cost_usd,
              avg(notional_usd)::float AS avg_notional,
              avg(CASE WHEN notional_usd > 0 THEN cost_usd / notional_usd END)::float AS avg_cost_pct,
              avg(gross_return_pct - return_pct)::float AS avg_drag_pct,
              count(*) FILTER (WHERE gross_return_pct > 0 AND return_pct <= 0)::int AS flipped
         FROM crypto_paper_trades
        WHERE user_id = $1 AND status = 'closed' AND closed_at > now() - ($2 || ' days')::interval`,
      [userId, String(d)],
    );
    out.cryptoPaper = rows[0];
    const bands = await pool.query(
      `SELECT ${BANDS} AS band, count(*)::int AS n, avg(cost_bps)::float AS avg_bps,
              avg(gross_return_pct - return_pct)::float AS avg_drag_pct
         FROM crypto_paper_trades
        WHERE user_id = $1 AND status = 'closed' AND closed_at > now() - ($2 || ' days')::interval
        GROUP BY 1 ORDER BY n DESC`,
      [userId, String(d)],
    );
    out.bands = bands.rows;
  } catch { /* table may not exist yet on a fresh deploy — constants still report */ }
  return out;
}
