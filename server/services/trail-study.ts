// ── Trail study (2026-11-08) ────────────────────────────────────────────────
// Studies how trailing stops actually performed on the Crypto and Sol
// engines, grouped by pair/token and by strategy, so trail settings can be
// fitted to evidence instead of taste. Observe-only: nothing here changes
// engine behavior or config.
//
// WHAT THE DATA SUPPORTS TODAY
// • Crypto (live trades, cryptocom_engine_trades): every trade stores its
//   peak R multiple and whether the trail armed; the final R is derived
//   from entry/exit vs the stop distance. Giveback = peak R − final R.
//   Crypto PAPER trades have no trailing at all (TP/SL exits only, no peak
//   tracking), so paper is out of scope until it records peaks.
// • Sol (sol_shadow_context, written for paper + shadow closes): stores
//   strategy, symbol, exit reason and peak gain %, so giveback =
//   peak gain − gross gain per group.
// Settings are NOT stamped per trade, so groups compare outcomes under the
// settings in force during the window — the report shows the current
// settings beside the results. A per-setting A/B would need the trail
// settings snapshotted onto each trade (possible follow-up).

import { pool } from '../db';
import { SOL_LR, solLearnedRulesOn } from './sol-learned-rules';

const r2 = (v: any): number | null => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

export interface TrailGroup {
  key: string;
  trades: number;
  winRate: number | null;
  avgFinal: number | null;    // crypto: final R · sol: avg net %
  avgPeak: number | null;     // crypto: peak R · sol: peak gain %
  avgGiveback: number | null; // peak − final, same units as above
  trailExitShare: number | null;
  verdict: string | null;
}

const FINAL_R = `
  CASE WHEN t.stop_loss IS NULL OR t.exit_price IS NULL THEN NULL
       WHEN lower(t.direction) IN ('long','buy') AND t.entry_price > t.stop_loss
         THEN (t.exit_price - t.entry_price) / (t.entry_price - t.stop_loss)
       WHEN lower(t.direction) IN ('short','sell') AND t.stop_loss > t.entry_price
         THEN (t.entry_price - t.exit_price) / (t.stop_loss - t.entry_price)
       ELSE NULL END`;

function cryptoVerdict(g: TrailGroup, activationR: number): string | null {
  if (g.trades < 8) return null;
  if (g.avgPeak != null && g.avgPeak < activationR) {
    return `Peaks average ${g.avgPeak}R — below the ${activationR}R trail activation, so the trail rarely switches on here.`;
  }
  if (g.trailExitShare != null && g.trailExitShare >= 0.25 && g.avgFinal != null && g.avgFinal >= 0.3) {
    return 'Trailing is earning its keep here — trail exits are common and close positive on average.';
  }
  if (g.avgGiveback != null && g.avgGiveback >= 1) {
    return `Winners give back about ${g.avgGiveback}R from their peak on average — a tighter trail or earlier activation is the candidate to test.`;
  }
  return 'Mixed picture — no clear trail change suggested yet.';
}

function solVerdict(g: TrailGroup): string | null {
  if (g.trades < 8) return null;
  if (g.trailExitShare != null && g.trailExitShare >= 0.3 && g.avgFinal != null && g.avgFinal > 0) {
    return 'The trail fits this group — trail exits are common and net-positive.';
  }
  if (g.avgGiveback != null && g.avgGiveback >= 8) {
    return `About ${g.avgGiveback}% is given back from the peak on average — a tighter trail distance or earlier activation is the candidate to test.`;
  }
  if (g.avgPeak != null && g.avgPeak < SOL_LR.breakevenAtPct) {
    return `Peaks rarely reach the +${SOL_LR.breakevenAtPct}% breakeven stage — trails barely engage here.`;
  }
  return 'Mixed picture — no clear trail change suggested yet.';
}

export async function trailStudyReport(userId: number, days = 90) {
  const d = Math.min(365, Math.max(1, Math.floor(days) || 90));

  // ── Crypto ────────────────────────────────────────────────────────────────
  const cfgRows = await pool.query(
    `SELECT trail_method, trail_activation_r, trail_fixed_r, trail_step_r, trail_profit_lock_pct,
            trail_sar_initial_af, trail_sar_max_af, breakeven_buffer_r
       FROM cryptocom_engine_configs WHERE user_id = $1`, [userId]).then(r => r.rows).catch(() => []);
  const cfg = cfgRows[0] ?? null;
  const activationR = cfg ? Number(cfg.trail_activation_r) || 1 : 1;

  const cryptoAgg = async (groupCol: string | null): Promise<TrailGroup[]> => {
    const sel = groupCol ? `${groupCol} AS key,` : `'all' AS key,`;
    const grp = groupCol ? `GROUP BY ${groupCol}` : '';
    const rows = await pool.query(
      `SELECT ${sel} COUNT(*)::int AS trades,
              AVG(CASE WHEN realized_pnl > 0 THEN 1.0 ELSE 0.0 END) AS win_rate,
              AVG(${FINAL_R}) AS avg_final_r,
              AVG(NULLIF(peak_r_multiple, 0)) AS avg_peak_r,
              AVG(CASE WHEN peak_r_multiple > 0 THEN peak_r_multiple - ${FINAL_R} END) AS avg_giveback_r,
              AVG(CASE WHEN exit_reason = 'trailing_stop' THEN 1.0 ELSE 0.0 END) AS trail_share
         FROM cryptocom_engine_trades t
        WHERE user_id = $1 AND status = 'closed' AND closed_at >= now() - ($2 || ' days')::interval
        ${grp}`, [userId, String(d)]).then(r => r.rows).catch(() => []);
    return rows.map((row: any) => {
      const g: TrailGroup = {
        key: String(row.key ?? 'all'), trades: Number(row.trades) || 0,
        winRate: r2(row.win_rate), avgFinal: r2(row.avg_final_r), avgPeak: r2(row.avg_peak_r),
        avgGiveback: r2(row.avg_giveback_r), trailExitShare: r2(row.trail_share), verdict: null,
      };
      g.verdict = cryptoVerdict(g, activationR);
      return g;
    }).filter(g => g.trades > 0).sort((a, b) => b.trades - a.trades);
  };

  const [cOverall, cByStrategy, cBySymbol] = await Promise.all([
    cryptoAgg(null), cryptoAgg('strategy'), cryptoAgg('symbol'),
  ]);

  // ── Sol ───────────────────────────────────────────────────────────────────
  const solAgg = async (groupCol: string | null): Promise<TrailGroup[]> => {
    const sel = groupCol ? `${groupCol} AS key,` : `'all' AS key,`;
    const grp = groupCol ? `GROUP BY ${groupCol}` : '';
    const rows = await pool.query(
      `SELECT ${sel} COUNT(*)::int AS trades,
              AVG(CASE WHEN net_pct > 0 THEN 1.0 ELSE 0.0 END) AS win_rate,
              AVG(net_pct) AS avg_net, AVG(peak_gain_pct) AS avg_peak,
              AVG(CASE WHEN peak_gain_pct IS NOT NULL AND gross_pct IS NOT NULL
                       THEN peak_gain_pct - gross_pct END) AS avg_giveback,
              AVG(CASE WHEN exit_reason = 'trail' THEN 1.0 ELSE 0.0 END) AS trail_share
         FROM sol_shadow_context
        WHERE user_id = $1 AND closed_at >= now() - ($2 || ' days')::interval
        ${grp}`, [userId, String(d)]).then(r => r.rows).catch(() => []);
    return rows.map((row: any) => {
      const g: TrailGroup = {
        key: String(row.key ?? 'all'), trades: Number(row.trades) || 0,
        winRate: r2(row.win_rate), avgFinal: r2(row.avg_net), avgPeak: r2(row.avg_peak),
        avgGiveback: r2(row.avg_giveback), trailExitShare: r2(row.trail_share), verdict: null,
      };
      g.verdict = solVerdict(g);
      return g;
    }).filter(g => g.trades > 0).sort((a, b) => b.trades - a.trades);
  };

  const [sOverall, sByStrategy, sBySymbol] = await Promise.all([
    solAgg(null), solAgg('strategy_id'), solAgg('symbol'),
  ]);

  return {
    days: d,
    crypto: {
      settings: cfg ? {
        method: cfg.trail_method, activationR: Number(cfg.trail_activation_r),
        fixedR: Number(cfg.trail_fixed_r), stepR: Number(cfg.trail_step_r),
        profitLockPct: Number(cfg.trail_profit_lock_pct),
        sarInitialAf: Number(cfg.trail_sar_initial_af), sarMaxAf: Number(cfg.trail_sar_max_af),
        breakevenBufferR: Number(cfg.breakeven_buffer_r),
      } : null,
      overall: cOverall[0] ?? null,
      byStrategy: cByStrategy.slice(0, 12),
      bySymbol: cBySymbol.slice(0, 12),
      note: 'Live trades only — crypto paper trades have no trailing (TP/SL exits, no peak tracking), so there is nothing to study there yet.',
    },
    sol: {
      settings: {
        learnedRulesOn: solLearnedRulesOn(),
        breakevenAtPct: SOL_LR.breakevenAtPct,
        partialAtPct: SOL_LR.partialAtPct,
        partialFraction: SOL_LR.partialFraction,
        trailDistPct: SOL_LR.trailDistPct,
        stagedTrail: 'Breakeven floor from +8% gain; active trail from +20% gain (per-position setting) with a volume-adjusted distance of 6–15% under the peak.',
      },
      overall: sOverall[0] ?? null,
      byStrategy: sByStrategy.slice(0, 12),
      bySymbol: sBySymbol.slice(0, 12),
      note: 'From paper + shadow closes (sol_shadow_context). Settings are not stamped per position, so groups compare outcomes under the settings in force during the window.',
    },
  };
}
