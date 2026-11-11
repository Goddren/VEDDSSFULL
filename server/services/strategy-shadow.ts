/**
 * Strategy Studio SHADOW deployments — virtual execution of saved spec
 * strategies by the deployment runner, with no account and no broker.
 *
 * A shadow deployment is a strategy_deployments row whose platform is
 * 'shadow'. The runner evaluates it on the same closed bars, with the
 * same evaluator (evaluateSpecSignals), as a live deployment — but the
 * branch that lands here is taken BEFORE any broker dispatch code, and
 * the dispatch functions themselves refuse shadow deployments loudly
 * (see assertBrokerDispatchAllowed in strategy-runner.ts). Nothing in
 * this module can reach an account: it is pure decision logic over
 * (spec, position state, signals, bar).
 *
 * Fill semantics (deliberately the backtester's, minus costs):
 *  - Entries fill at the signal bar's close. No spread/slippage model —
 *    shadow measures the RULES, not execution quality, and the brain
 *    labels the layer "Shadow (virtual)" so nobody mistakes it for
 *    either a backtest (historical) or a live fill (real).
 *  - SL/TP resolve intrabar against the NEXT bars' high/low; if both
 *    are touched in one bar the stop wins (conservative), exactly like
 *    the backtester.
 *  - Breakeven / trailing stops tighten from the favourable extreme of
 *    bars BEFORE the current one, then the current bar is checked —
 *    the backtester's causal order.
 *  - Exit-rule groups resolve on bar close, like the backtester and
 *    the live runner both do.
 *  - One open position per deployment; the deployment's daily entry
 *    cap applies (the runner passes entriesAllowed).
 *
 * Because entries/exits are resolved here from bar prices — not from
 * broker fills — the runner-only spec families the EA compiler refuses
 * (volume profile, ORB, ICT structure, multi-timeframe) work in shadow
 * unchanged: they are evaluated by the shared evaluator, and this
 * module only consumes its signals.
 */
import { getPipSize } from '../utils/pipUtils';
import type { StrategySpec } from './strategy-spec';
import type { BacktestBar, SpecSignals } from './strategy-backtest';

// Same contract sizes the runner's tradePnl uses for lot-based platforms.
const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, XAGUSD: 5000, BTCUSD: 1, ETHUSD: 10, SOLUSD: 100, XRPUSD: 10000,
};

/** Money P&L of a virtual trade, in spec terms — identical formula to
 *  the runner's tradePnl for lot-sized platforms (quote→USD like the
 *  backtester). Shadow never trades DXtrade unit sizing. */
export function specMoneyPnl(spec: StrategySpec, direction: string, entryPrice: number, exitPrice: number, volume: number): number {
  const dirSign = String(direction).toUpperCase() === 'BUY' ? 1 : -1;
  const diff = (exitPrice - entryPrice) * dirSign;
  const cs = CONTRACT_SIZE[spec.symbol.replace(/[^A-Z]/g, '')] ?? 100000;
  let pnl = diff * cs * volume;
  if (spec.symbol.length === 6 && spec.symbol.startsWith('USD') && exitPrice > 0) pnl = pnl / exitPrice;
  return Math.round(pnl * 100) / 100;
}

export interface ShadowPositionState {
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  /** Best favourable price over bars up to and including the entry bar,
   *  then folded forward one bar at a time (never the current bar). */
  extremePrice: number;
  breakevenApplied: boolean;
  /** |entry − initial stop| in price terms; the R denominator. */
  riskDist: number | null;
  volume: number;
}

export type ShadowDecision =
  | { type: 'open'; direction: 'BUY' | 'SELL'; entryPrice: number; stopLoss: number | null; takeProfit: number | null; extremePrice: number; riskDist: number | null; volume: number }
  | { type: 'close'; exitPrice: number; exitReason: 'stop_loss' | 'take_profit' | 'exit_signal'; pnl: number; rMultiple: number | null }
  | { type: 'update'; stopLoss: number | null; extremePrice: number; breakevenApplied: boolean }
  | { type: 'none' };

/**
 * One bar of shadow execution. `sig` must be evaluateSpecSignals' output
 * for the series ending at `bar` (the last closed bar), and `position`
 * the deployment's open virtual position, if any.
 */
export function evaluateShadowBar(args: {
  spec: StrategySpec;
  position: ShadowPositionState | null;
  sig: SpecSignals;
  bar: BacktestBar;
  entriesAllowed: boolean;
}): ShadowDecision {
  const { spec, sig, bar } = args;
  const pip = getPipSize(spec.symbol);
  const pos = args.position;

  if (pos) {
    const isLong = pos.direction === 'BUY';
    const dirSign = isLong ? 1 : -1;
    const entry = pos.entryPrice;
    let sl = pos.stopLoss;
    let beApplied = pos.breakevenApplied;

    // 1) Breakeven + trailing tighten from extremes of bars BEFORE this
    //    one, then this bar is checked against the tightened stop.
    const best = pos.extremePrice;
    if (spec.risk.breakevenTriggerPips) {
      const trig = spec.risk.breakevenTriggerPips * pip;
      const off = (spec.risk.breakevenOffsetPips ?? 0) * pip;
      const run = isLong ? best - entry : entry - best;
      if (run >= trig) {
        const cand = isLong ? entry + off : entry - off;
        if (sl == null || (isLong ? cand > sl : cand < sl)) { sl = cand; beApplied = true; }
      }
    }
    if (spec.risk.trailingStopPips) {
      const trail = spec.risk.trailingStopPips * pip;
      const cand = isLong ? best - trail : best + trail;
      if (sl == null || (isLong ? cand > sl : cand < sl)) sl = cand;
    }

    // 2) Intrabar SL/TP on this bar — stop wins ties (backtester rule).
    let exitPrice: number | null = null;
    let exitReason: 'stop_loss' | 'take_profit' | 'exit_signal' | null = null;
    if (isLong) {
      if (sl != null && bar.low <= sl) { exitPrice = sl; exitReason = 'stop_loss'; }
      else if (pos.takeProfit != null && bar.high >= pos.takeProfit) { exitPrice = pos.takeProfit; exitReason = 'take_profit'; }
    } else {
      if (sl != null && bar.high >= sl) { exitPrice = sl; exitReason = 'stop_loss'; }
      else if (pos.takeProfit != null && bar.low <= pos.takeProfit) { exitPrice = pos.takeProfit; exitReason = 'take_profit'; }
    }

    // 3) Exit-rule group on this bar's close.
    if (exitPrice == null) {
      const exitNow = isLong ? sig.exitLong : sig.exitShort;
      if (exitNow) { exitPrice = sig.close; exitReason = 'exit_signal'; }
    }

    if (exitPrice != null && exitReason) {
      const pnl = specMoneyPnl(spec, pos.direction, entry, exitPrice, pos.volume);
      // R against the ORIGINAL stop distance, converted with the same
      // money formula so the ratio is unit-clean.
      const riskMoney = pos.riskDist != null && pos.riskDist > 0
        ? Math.abs(specMoneyPnl(spec, pos.direction, entry, entry + dirSign * pos.riskDist, pos.volume))
        : null;
      const rMultiple = riskMoney && riskMoney > 0 ? Math.round((pnl / riskMoney) * 1000) / 1000 : null;
      return { type: 'close', exitPrice, exitReason, pnl, rMultiple };
    }

    // Still open: fold this bar into the extreme for the next bar.
    const extremePrice = isLong ? Math.max(best, bar.high) : Math.min(best, bar.low);
    return { type: 'update', stopLoss: sl, extremePrice, breakevenApplied: beApplied };
  }

  // Flat — entries. Runner semantics: long and short firing together is
  // ambiguous and opens nothing (the backtester prefers long; live and
  // shadow both sit it out rather than guess).
  if (!args.entriesAllowed) return { type: 'none' };
  const direction = sig.enterLong && !sig.enterShort ? 'BUY' : sig.enterShort && !sig.enterLong ? 'SELL' : null;
  if (!direction) return { type: 'none' };

  // Same SL/TP derivation as the live runner's entry path.
  const slDist = spec.risk.stopLossAtrMult && sig.atr ? spec.risk.stopLossAtrMult * sig.atr
    : spec.risk.stopLossPips ? spec.risk.stopLossPips * pip : null;
  const tpDist = spec.risk.takeProfitAtrMult && sig.atr ? spec.risk.takeProfitAtrMult * sig.atr
    : spec.risk.takeProfitPips ? spec.risk.takeProfitPips * pip : null;
  const round5 = (n: number | null) => (n == null ? null : Math.round(n * 100000) / 100000);
  const entry = sig.close;
  const stopLoss = round5(slDist ? (direction === 'BUY' ? entry - slDist : entry + slDist) : null);
  const takeProfit = round5(tpDist ? (direction === 'BUY' ? entry + tpDist : entry - tpDist) : null);
  return {
    type: 'open',
    direction,
    entryPrice: entry,
    stopLoss,
    takeProfit,
    // The entry bar's own extreme seeds the tracker: the backtester's
    // `best` picks up the entry bar on the next bar's update, so the
    // state after this bar is identical.
    extremePrice: direction === 'BUY' ? bar.high : bar.low,
    riskDist: stopLoss != null ? Math.abs(entry - stopLoss) : null,
    volume: spec.risk.lotSize,
  };
}
