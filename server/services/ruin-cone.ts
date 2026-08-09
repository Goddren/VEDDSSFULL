/**
 * Ruin Cone — forward Monte Carlo simulation of equity paths.
 *
 * Forward-projects the scanner's OWN realized trade distribution (bootstrap
 * resampling — NOT a fitted Gaussian, so the fat tails / skew of a prediction-
 * market strategy are preserved) and reports the probability of breaching
 * FTUK-style prop-firm rules before the challenge profit target is reached:
 *   - max drawdown limit  → "ruin"
 *   - daily loss limit
 *   - consistency rule (no single day's profit > X% of total profit)
 *
 * Data source: realized dollar P&L of closed trades from ai_trade_results
 * (default source='kalshi' — the BTC/crypto scanner). We resample dollar P&L
 * directly rather than R-multiples: no per-trade risk amount is stored, and a
 * dollar equity curve is what the prop rules are actually measured against, so
 * an R→$ round-trip would only add noise.
 *
 * Starting equity defaults to the live Kalshi bankroll (startingBankroll +
 * realized P&L) unless an explicit value is passed.
 */

import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '../db';
import { aiTradeResults } from '../../shared/schema';
import { getKalshiEngineState, kalshiBankroll } from './kalshi-engine';

// ── FTUK rule defaults (all overridable per-request) ────────────────────────
// Percentages of starting equity. Confirm these against the user's actual
// challenge terms — see the summary note in the route/README.
export const FTUK_DEFAULTS = {
  dailyLossPct:      5,   // max loss from a day's starting balance
  maxDrawdownPct:    10,  // max trailing drawdown from peak equity ("ruin")
  consistencyPct:    30,  // no single day's profit may exceed this % of total profit
  profitTargetPct:   8,   // challenge target (FTUK evaluation is commonly 8–10%)
};

const DEFAULT_NUM_SIMULATIONS = 2000;
const DEFAULT_NUM_TRADES      = 100;   // forward trades when the remaining-window size is unknown
const DEFAULT_SOURCE_LIMIT    = 200;   // most-recent closed trades to build the distribution from
const CACHE_TTL_MS            = 5 * 60 * 1000;

export interface RuinConeParams {
  numSimulations?: number;
  numTrades?: number;
  startingEquity?: number;
  dailyLossLimit?: number;          // absolute $; defaults to dailyLossPct of startingEquity
  maxDrawdownLimit?: number;        // absolute $; defaults to maxDrawdownPct of startingEquity
  consistencyRuleThreshold?: number;// 0–1 fraction (or 0–100 pct, normalized); defaults to consistencyPct
  profitTarget?: number;            // absolute $ profit; defaults to profitTargetPct of startingEquity
  sourceLimit?: number;             // how many recent trades to sample from
  source?: string;                  // ai_trade_results.source filter (default 'kalshi')
  noCache?: boolean;
}

export interface RuinConePoint {
  tradeIndex: number;
  p5: number; p25: number; p50: number; p75: number; p95: number;
}

export interface RuinConeStats {
  probRuin: number;               // fraction of sims that breached max drawdown
  probDailyLossBreach: number;    // fraction that breached the daily loss limit (extra — not fatal to the cone)
  probConsistencyBreach: number;  // fraction whose single-day profit exceeded the consistency threshold
  probHitTarget: number;          // fraction that reached the profit target while still "alive"
  expectedFinalEquity: number;
  stdDevFinalEquity: number;
  simulationsRun: number;
  tradesProjected: number;
  sourceTradeCount: number;
  tradesPerDay: number;
  startingEquity: number;
  dailyLossLimit: number;
  maxDrawdownLimit: number;
  consistencyRuleThreshold: number;
  profitTarget: number;
}

export interface RuinConeResult {
  cone: RuinConePoint[];
  stats: RuinConeStats;
  warning?: string;               // set when history is too thin to trust the output
}

// ── In-memory TTL cache (5 min) ─────────────────────────────────────────────
// Simple per-user+params cache; the sim is nontrivial at 2000×100. The
// "resimulate" button passes noCache to force a fresh run.
const _cache = new Map<string, { expires: number; result: RuinConeResult }>();

function _cacheKey(userId: number, p: Required<Omit<RuinConeParams, 'noCache'>>): string {
  return `${userId}:${JSON.stringify(p)}`;
}

/** Percentile of a pre-sorted ascending array, linear interpolation. */
function _percentile(sorted: number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0];
  const idx = p * (n - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

export async function runRuinConeSimulation(userId: number, params: RuinConeParams = {}): Promise<RuinConeResult> {
  const numSimulations = Math.max(100, Math.min(10000, Math.floor(params.numSimulations ?? DEFAULT_NUM_SIMULATIONS)));
  const numTrades      = Math.max(1, Math.min(1000, Math.floor(params.numTrades ?? DEFAULT_NUM_TRADES)));
  const sourceLimit    = Math.max(1, Math.min(2000, Math.floor(params.sourceLimit ?? DEFAULT_SOURCE_LIMIT)));
  const source         = params.source ?? 'kalshi';

  // Starting equity: explicit override, else the live Kalshi bankroll.
  const startingEquity = params.startingEquity != null && params.startingEquity > 0
    ? params.startingEquity
    : Math.max(1, kalshiBankroll(getKalshiEngineState(userId)));

  const dailyLossLimit   = params.dailyLossLimit   != null ? Math.abs(params.dailyLossLimit)   : startingEquity * (FTUK_DEFAULTS.dailyLossPct / 100);
  const maxDrawdownLimit = params.maxDrawdownLimit != null ? Math.abs(params.maxDrawdownLimit) : startingEquity * (FTUK_DEFAULTS.maxDrawdownPct / 100);
  const profitTarget     = params.profitTarget     != null ? Math.abs(params.profitTarget)     : startingEquity * (FTUK_DEFAULTS.profitTargetPct / 100);
  // Accept the consistency threshold as either a 0–1 fraction or a 0–100 pct.
  const rawConsistency = params.consistencyRuleThreshold != null ? params.consistencyRuleThreshold : FTUK_DEFAULTS.consistencyPct;
  const consistencyRuleThreshold = rawConsistency > 1 ? rawConsistency / 100 : rawConsistency;

  const resolved = {
    numSimulations, numTrades, startingEquity, dailyLossLimit, maxDrawdownLimit,
    consistencyRuleThreshold, profitTarget, sourceLimit, source,
  };

  if (!params.noCache) {
    const hit = _cache.get(_cacheKey(userId, resolved));
    if (hit && hit.expires > Date.now()) return hit.result;
  }

  // ── Pull the empirical distribution: realized $ P&L of recent closed trades ──
  const rows = await db.select({ pnl: aiTradeResults.profitLoss, closedAt: aiTradeResults.closedAt })
    .from(aiTradeResults)
    .where(and(
      eq(aiTradeResults.userId, userId),
      eq(aiTradeResults.source, source),
      isNotNull(aiTradeResults.profitLoss),
      isNotNull(aiTradeResults.closedAt),
    ))
    .orderBy(desc(aiTradeResults.closedAt))
    .limit(sourceLimit);

  const pnls = rows.map(r => Number(r.pnl)).filter(v => Number.isFinite(v));
  const sourceTradeCount = pnls.length;

  // trades-per-day rate from the history's calendar-day (UTC) spread — used to
  // bucket forward trades into "days" for the daily-loss and consistency rules.
  const dayKeys = new Set<string>();
  for (const r of rows) {
    const d = r.closedAt ? new Date(r.closedAt) : null;
    if (d) dayKeys.add(`${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`);
  }
  const distinctDays = Math.max(1, dayKeys.size);
  const tradesPerDay = Math.max(1, Math.min(50, Math.round(sourceTradeCount / distinctDays) || 1));

  // Not enough history to resample meaningfully — return a flat cone + zeroed
  // stats with a warning so the UI can tell the user rather than show noise.
  if (sourceTradeCount < 2) {
    const flat: RuinConePoint[] = Array.from({ length: numTrades + 1 }, (_, i) => ({
      tradeIndex: i, p5: startingEquity, p25: startingEquity, p50: startingEquity, p75: startingEquity, p95: startingEquity,
    }));
    const result: RuinConeResult = {
      cone: flat,
      stats: {
        probRuin: 0, probDailyLossBreach: 0, probConsistencyBreach: 0, probHitTarget: 0,
        expectedFinalEquity: startingEquity, stdDevFinalEquity: 0,
        simulationsRun: 0, tradesProjected: numTrades, sourceTradeCount, tradesPerDay,
        startingEquity, dailyLossLimit, maxDrawdownLimit, consistencyRuleThreshold, profitTarget,
      },
      warning: `Only ${sourceTradeCount} closed '${source}' trade(s) on record — need at least 2 to simulate. Let the scanner build more history.`,
    };
    _cache.set(_cacheKey(userId, resolved), { expires: Date.now() + CACHE_TTL_MS, result });
    return result;
  }

  // ── Monte Carlo ─────────────────────────────────────────────────────────────
  // paths[sim] holds equity at each step 0..numTrades (step 0 = startingEquity).
  const paths: Float64Array[] = new Array(numSimulations);
  const finalEquities = new Float64Array(numSimulations);

  let ruinCount = 0;          // breached max drawdown
  let dailyBreachCount = 0;   // breached daily loss limit
  let consistencyBreachCount = 0;
  let hitTargetCount = 0;     // reached profit target while still alive

  const targetEquity = startingEquity + profitTarget;

  for (let s = 0; s < numSimulations; s++) {
    const path = new Float64Array(numTrades + 1);
    path[0] = startingEquity;

    let equity = startingEquity;
    let peak = startingEquity;
    let firstFailIndex = -1;    // first trade index where a hard breach (DD or daily) occurred
    let firstTargetIndex = -1;  // first trade index where equity reached the target
    let everRuin = false;
    let everDailyBreach = false;

    // Day tracking
    let dayStartEquity = startingEquity;
    let tradeInDay = 0;
    let maxDayProfit = -Infinity; // largest single completed-day profit

    for (let t = 1; t <= numTrades; t++) {
      // Bootstrap resample: draw one realized P&L with replacement.
      const pnl = pnls[(Math.random() * sourceTradeCount) | 0];
      equity += pnl;
      path[t] = equity;

      if (equity > peak) peak = equity;

      // Ruin: trailing drawdown from peak crosses the max drawdown limit.
      if (!everRuin && peak - equity >= maxDrawdownLimit) {
        everRuin = true;
        if (firstFailIndex === -1) firstFailIndex = t;
      }

      // Daily loss: loss from the day's starting balance crosses the limit.
      if (!everDailyBreach && dayStartEquity - equity >= dailyLossLimit) {
        everDailyBreach = true;
        if (firstFailIndex === -1) firstFailIndex = t;
      }

      // Profit target reached.
      if (firstTargetIndex === -1 && equity >= targetEquity) firstTargetIndex = t;

      // Close the "day" bucket every tradesPerDay trades (and at the very end).
      tradeInDay++;
      if (tradeInDay >= tradesPerDay || t === numTrades) {
        const dayProfit = equity - dayStartEquity;
        if (dayProfit > maxDayProfit) maxDayProfit = dayProfit;
        dayStartEquity = equity;
        tradeInDay = 0;
      }
    }

    paths[s] = path;
    finalEquities[s] = equity;

    if (everRuin) ruinCount++;
    if (everDailyBreach) dailyBreachCount++;

    // Alive at target = reached target before any hard breach.
    if (firstTargetIndex !== -1 && (firstFailIndex === -1 || firstTargetIndex < firstFailIndex)) {
      hitTargetCount++;
    }

    // Consistency: only meaningful when the run ended in net profit. If the
    // best single day made up more than the threshold share of total profit,
    // the run would fail the consistency rule at payout.
    const totalProfit = equity - startingEquity;
    if (totalProfit > 0 && maxDayProfit > consistencyRuleThreshold * totalProfit) {
      consistencyBreachCount++;
    }
  }

  // ── Aggregate: percentile cone per trade step ───────────────────────────────
  const cone: RuinConePoint[] = new Array(numTrades + 1);
  const col = new Float64Array(numSimulations);
  for (let t = 0; t <= numTrades; t++) {
    for (let s = 0; s < numSimulations; s++) col[s] = paths[s][t];
    const sorted = Array.from(col).sort((a, b) => a - b);
    cone[t] = {
      tradeIndex: t,
      p5:  Math.round(_percentile(sorted, 0.05)),
      p25: Math.round(_percentile(sorted, 0.25)),
      p50: Math.round(_percentile(sorted, 0.50)),
      p75: Math.round(_percentile(sorted, 0.75)),
      p95: Math.round(_percentile(sorted, 0.95)),
    };
  }

  // Final-equity moments
  let sum = 0;
  for (let s = 0; s < numSimulations; s++) sum += finalEquities[s];
  const mean = sum / numSimulations;
  let varSum = 0;
  for (let s = 0; s < numSimulations; s++) { const d = finalEquities[s] - mean; varSum += d * d; }
  const stdDev = Math.sqrt(varSum / numSimulations);

  const result: RuinConeResult = {
    cone,
    stats: {
      probRuin:              ruinCount / numSimulations,
      probDailyLossBreach:   dailyBreachCount / numSimulations,
      probConsistencyBreach: consistencyBreachCount / numSimulations,
      probHitTarget:         hitTargetCount / numSimulations,
      expectedFinalEquity:   Math.round(mean),
      stdDevFinalEquity:     Math.round(stdDev),
      simulationsRun:        numSimulations,
      tradesProjected:       numTrades,
      sourceTradeCount,
      tradesPerDay,
      startingEquity:        Math.round(startingEquity),
      dailyLossLimit:        Math.round(dailyLossLimit),
      maxDrawdownLimit:      Math.round(maxDrawdownLimit),
      consistencyRuleThreshold,
      profitTarget:          Math.round(profitTarget),
    },
    warning: sourceTradeCount < 20
      ? `Thin history: only ${sourceTradeCount} closed '${source}' trade(s). Results are indicative only until more trades accumulate.`
      : undefined,
  };

  _cache.set(_cacheKey(userId, resolved), { expires: Date.now() + CACHE_TTL_MS, result });
  return result;
}
