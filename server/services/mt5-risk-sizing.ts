// ─────────────────────────────────────────────────────────────────────────────
// MT5 risk-% position sizing (Chris's directive, Nov 27, 2026).
//
// WHY: the MT5 lane landed every trade at 0.01 lots on a $500K account.
// Two causes, both in the legacy sizing chain:
//   1. Brain Learning Mode pinned the lot to 0.01 until the brain's record
//      showed 10+ trades AND a 60%+ win rate (~390 trades at ~52% → locked
//      forever in practice).
//   2. Even unlocked, the chain STARTED from the AI-suggested lot (0.01–0.05)
//      or baseLotSize (0.01) and only ever trimmed it — nothing ever sized
//      UP from the account balance on the MT5 side.
//
// THE RULE (Chris, Nov 27, 2026): "It needs to be the .5% per trade."
// MT5 trades are sized to risk a flat RISK % of the executing account's
// equity per trade, computed from the trade's own stop-loss distance:
//
//   lot = floor-to-0.01-step( riskUSD / (stopPips × pipValuePerLot) )
//   riskUSD = riskPct% × equity
//
// Floor-rounding ONLY: the realized risk at the floored lot never exceeds
// the target (the 0.01 minimum lot is the one exception — on a tiny
// account 0.01 can risk more than the target, and the pre-existing
// structural gates — Gate 0e's 5% hard cap — govern that case, exactly as
// they did before this module existed).
//
// The % is a TARGET and the cap for this sizing: the legacy lot-count
// ceilings (config.maxLotSize) do not shrink a correctly-sized trade.
// Gate 0e's 5%-of-equity hard cap remains the outer wall. Risk-REDUCING
// mechanisms (volatile-SL stop widening — which composes through the final
// stop distance — drawdown shield, consistency overrides, halts) keep
// working; risk-INFLATING multipliers (brain/Kelly, compounding, dynamic
// tiers, goal pace) do not touch the risk-% size. Risk is the %, flat.
//
// Equity + pip math come from the SAME sources the existing risk-cap /
// Gate 0e / fan-out code uses: the engine config's accountBalance on the
// live-engine path, the fresh MT5 account snapshot on the chart-data
// path, and server/utils/pipUtils for pip size/value everywhere.
//
// KILL SWITCH: MT5_RISK_PCT_SIZING=off restores the pre-change sizing
// chain exactly (brain lock, AI/base lot, multipliers, max-lot ceiling).
// ─────────────────────────────────────────────────────────────────────────────

import { getPipSize, getPipValue } from '../utils/pipUtils';

/** Master kill switch for MT5 risk-% sizing. Default ON. Read live from
 *  the env at every call so flipping it needs no code change. */
export function mt5RiskPctSizingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.MT5_RISK_PCT_SIZING !== 'off';
}

/** Default per-trade risk target, in percent of equity (Chris: 0.5%). */
export const MT5_RISK_PCT_DEFAULT = 0.5;

/** Resolve the per-trade risk % from the engine config. The field is
 *  `riskPercentPerTrade` on LiveEngineConfig (default 0.5, user-settable
 *  in engine settings). Anything unusable (unset, non-numeric, ≤ 0, or a
 *  nonsense > 100) falls back to the 0.5 default rather than silently
 *  disabling sizing or exploding it. */
export function resolveRiskPercentPerTrade(config: { riskPercentPerTrade?: unknown } | null | undefined): number {
  const n = Number((config as any)?.riskPercentPerTrade);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : MT5_RISK_PCT_DEFAULT;
}

export interface RiskPctLotInput {
  /** Executing account's equity (same source the caller's risk caps use). */
  equity: number;
  /** Risk target in percent of equity (e.g. 0.5 = 0.5%). */
  riskPct: number;
  symbol: string;
  entryPrice: number | null | undefined;
  stopLoss: number | null | undefined;
}

export interface RiskPctLotResult {
  /** Final lot, floor-rounded to the 0.01 step, minimum 0.01. */
  lot: number;
  /** Target risk in USD: riskPct% of equity. */
  riskUsd: number;
  /** Realized risk in USD at the floored lot (≤ riskUsd, except when the
   *  0.01 minimum lot binds on a tiny account). */
  realizedRiskUsd: number;
  /** Stop distance in pips (codebase pip conventions). */
  stopPips: number;
  /** USD value of 1 pip for 1.0 lot (pipUtils). */
  pipValuePerLot: number;
  /** True when the unfloored size was below the 0.01 minimum lot. */
  minLotApplied: boolean;
}

/**
 * Size a trade to risk `riskPct`% of `equity` over its stop distance.
 * Returns null when the size cannot be computed honestly — unknown or
 * non-positive equity, missing entry/stop, a zero stop distance, or a
 * degenerate pip value — so callers fall back to their legacy chain
 * instead of inventing a size (no phantom sizing).
 */
export function computeRiskPctLot(input: RiskPctLotInput): RiskPctLotResult | null {
  const equity = Number(input.equity);
  const riskPct = Number(input.riskPct);
  const entry = Number(input.entryPrice);
  const stop = Number(input.stopLoss);
  if (!Number.isFinite(equity) || equity <= 0) return null;
  if (!Number.isFinite(riskPct) || riskPct <= 0) return null;
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry <= 0 || stop <= 0) return null;

  const pipSize = getPipSize(input.symbol || '');
  const pipValuePerLot = getPipValue(input.symbol || '');
  if (!(pipSize > 0) || !(pipValuePerLot > 0)) return null;

  const stopPips = Math.abs(entry - stop) / pipSize;
  if (!(stopPips > 0)) return null;

  const riskUsd = equity * (riskPct / 100);
  const riskPerLotUsd = stopPips * pipValuePerLot;
  const rawLot = riskUsd / riskPerLotUsd;
  if (!Number.isFinite(rawLot) || rawLot <= 0) return null;

  // Floor to the 0.01 lot step — rounding UP would risk more than the
  // target %, which is the one thing this sizing must never do.
  const floored = Math.floor(rawLot * 100) / 100;
  const minLotApplied = floored < 0.01;
  const lot = Math.max(0.01, floored);

  return {
    lot,
    riskUsd,
    realizedRiskUsd: lot * riskPerLotUsd,
    stopPips,
    pipValuePerLot,
    minLotApplied,
  };
}

/** Plain-terms sizing log line (the math, readable at a glance). */
export function riskPctSizingLogLine(symbol: string, riskPct: number, equity: number, r: RiskPctLotResult): string {
  return `Sized ${r.lot.toFixed(2)} lots — ${riskPct}% of $${Math.round(equity).toLocaleString('en-US')} equity = $${r.riskUsd.toFixed(2)} risk over a ${Math.round(r.stopPips)}-pip stop ($${r.pipValuePerLot}/pip per lot)`;
}
