/**
 * Deterministic strategy backtester.
 *
 * Replays a StrategySpec over historical OHLCV bars. Pure function of
 * (spec, bars, options) — no randomness anywhere, so the same inputs
 * always produce the same numbers and results can be shown to users
 * as real backtests.
 *
 * Replay rules (documented so results are explainable):
 *  - Entries are evaluated on bar close; fills happen at that close
 *    adjusted by half the spread + slippage against the trader.
 *  - SL/TP are checked intrabar against high/low. If both are touched
 *    in the same bar, the stop loss wins (conservative).
 *  - Trailing stops are updated from extremes of bars BEFORE the
 *    current one, then the current bar is checked against them.
 *  - Exit-condition groups are evaluated on bar close.
 *  - One position at a time. A position still open at the end is
 *    closed at the last close (reason: 'end').
 *  - Money PnL is computed in the quote currency (exact USD for
 *    *-USD pairs; USD-base pairs are converted at the exit price;
 *    other crosses are reported in quote currency units).
 */
import { getPipSize } from '../utils/pipUtils';
import type { StrategySpec, Condition, ConditionGroup, IndicatorConfig } from './strategy-spec';
import { specWarmupBars } from './strategy-spec';

export interface BacktestBar { timestamp: number; open: number; high: number; low: number; close: number; volume: number }

export interface BacktestOptions {
  initialCapital: number;
  spreadPips?: number;
  slippagePips?: number;
  commissionPerLot?: number;   // per side, in account currency
}

export interface BacktestTrade {
  side: 'long' | 'short';
  entryTime: number; exitTime: number;
  entryIndex: number; exitIndex: number;
  entryPrice: number; exitPrice: number;
  pips: number; pnl: number;
  exitReason: 'take_profit' | 'stop_loss' | 'exit_signal' | 'end';
}

export interface BacktestResult {
  trades: BacktestTrade[];
  equityCurve: Array<{ timestamp: number; equity: number }>;
  stats: {
    barsUsed: number; totalTrades: number; wins: number; losses: number;
    winRate: number; netPnl: number; netPips: number; returnPct: number;
    grossProfit: number; grossLoss: number; profitFactor: number | null;
    maxDrawdown: number; maxDrawdownPct: number;
    avgWin: number; avgLoss: number; bestTrade: number; worstTrade: number;
    finalBalance: number;
  };
  /** Full data-point set retained on the strategy — the raw material its brain is built from. */
  dataPoints: {
    perSymbol: string; timeframe: string;
    tradesByExitReason: Record<string, number>;
    longTrades: number; shortTrades: number;
    longWinRate: number | null; shortWinRate: number | null;
    avgHoldBars: number;
  };
}

const CONTRACT_SIZE: Record<string, number> = {
  XAUUSD: 100, XAGUSD: 5000, BTCUSD: 1, ETHUSD: 10, SOLUSD: 100, XRPUSD: 10000,
};
function contractSize(symbol: string): number {
  return CONTRACT_SIZE[symbol.replace(/[^A-Z]/g, '')] ?? 100000;
}

// ── Indicator series ────────────────────────────────────────────────

type Series = Array<number | null>;

function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev: number | null = null;
  let seedSum = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) { seedSum += values[i]; continue; }
    if (i === period - 1) { seedSum += values[i]; prev = seedSum / period; out[i] = prev; continue; }
    prev = (values[i] - (prev as number)) * k + (prev as number);
    out[i] = prev;
  }
  return out;
}

function rsiSeries(closes: number[], period: number): Series {
  const out: Series = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  gain /= period; loss /= period;
  out[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

function atrSeries(bars: BacktestBar[], period: number): Series {
  const out: Series = new Array(bars.length).fill(null);
  if (bars.length <= period) return out;
  const tr = (i: number) => {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    return Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  };
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += tr(i);
  atr /= period;
  out[period] = atr;
  for (let i = period + 1; i < bars.length; i++) {
    atr = (atr * (period - 1) + tr(i)) / period;
    out[i] = atr;
  }
  return out;
}

/** seriesKey → per-field series for one indicator config. */
function buildSeries(spec: StrategySpec, bars: BacktestBar[]): Map<string, Series> {
  const closes = bars.map((b) => b.close);
  const map = new Map<string, Series>();
  map.set('price:price', closes.slice());
  map.set('price:value', closes.slice());
  for (const ind of spec.indicators) {
    const key = (f: string) => `${ind.id}:${f}`;
    switch (ind.kind) {
      case 'EMA': map.set(key('value'), ema(closes, ind.period ?? 21)); break;
      case 'SMA': map.set(key('value'), sma(closes, ind.period ?? 50)); break;
      case 'RSI': map.set(key('value'), rsiSeries(closes, ind.period ?? 14)); break;
      case 'ATR': map.set(key('value'), atrSeries(bars, ind.period ?? 14)); break;
      case 'MACD': {
        const fast = ema(closes, ind.fastPeriod ?? 12);
        const slow = ema(closes, ind.slowPeriod ?? 26);
        const macd: Series = closes.map((_, i) => (fast[i] != null && slow[i] != null ? (fast[i] as number) - (slow[i] as number) : null));
        const macdNums = macd.map((v) => v ?? 0);
        const firstValid = macd.findIndex((v) => v != null);
        const sigRaw = ema(macdNums, ind.signalPeriod ?? 9);
        const signal: Series = macd.map((v, i) => (v == null || i < firstValid + (ind.signalPeriod ?? 9) - 1 ? null : sigRaw[i]));
        map.set(key('value'), macd);
        map.set(key('signal'), signal);
        map.set(key('histogram'), macd.map((v, i) => (v != null && signal[i] != null ? v - (signal[i] as number) : null)));
        break;
      }
      case 'STOCHASTIC': {
        const period = ind.period ?? 14;
        const kSeries: Series = new Array(bars.length).fill(null);
        for (let i = period - 1; i < bars.length; i++) {
          let hh = -Infinity, ll = Infinity;
          for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
          kSeries[i] = hh === ll ? 50 : ((bars[i].close - ll) / (hh - ll)) * 100;
        }
        const kNums = kSeries.map((v) => v ?? 50);
        const dRaw = sma(kNums, ind.signalPeriod ?? 3);
        map.set(key('k'), kSeries);
        map.set(key('value'), kSeries);
        map.set(key('d'), kSeries.map((v, i) => (v == null ? null : dRaw[i])));
        break;
      }
      case 'BOLLINGER': {
        const period = ind.period ?? 20;
        const mid = sma(closes, period);
        const upper: Series = new Array(bars.length).fill(null);
        const lower: Series = new Array(bars.length).fill(null);
        for (let i = period - 1; i < bars.length; i++) {
          let sq = 0;
          for (let j = i - period + 1; j <= i; j++) sq += (closes[j] - (mid[i] as number)) ** 2;
          const sd = Math.sqrt(sq / period) * (ind.stdDev ?? 2);
          upper[i] = (mid[i] as number) + sd;
          lower[i] = (mid[i] as number) - sd;
        }
        map.set(key('middle'), mid);
        map.set(key('value'), mid);
        map.set(key('upper'), upper);
        map.set(key('lower'), lower);
        break;
      }
    }
  }
  return map;
}

function evalCondition(c: Condition, series: Map<string, Series>, i: number): boolean {
  if (i < 1) return false;
  const a = series.get(`${c.indicatorId}:${c.field}`);
  if (!a) return false;
  const ai = a[i], aiPrev = a[i - 1];
  if (ai == null || aiPrev == null) return false;
  if (c.operator === 'rising') return ai > aiPrev;
  if (c.operator === 'falling') return ai < aiPrev;
  let bNow: number | null, bPrev: number | null;
  if (c.compare.kind === 'value') { bNow = c.compare.value; bPrev = c.compare.value; }
  else {
    const bKey = c.compare.kind === 'price' ? 'price:price' : `${c.compare.indicatorId}:${c.compare.field}`;
    const b = series.get(bKey);
    if (!b) return false;
    bNow = b[i]; bPrev = b[i - 1];
  }
  if (bNow == null || bPrev == null) return false;
  switch (c.operator) {
    case 'above': return ai > bNow;
    case 'below': return ai < bNow;
    case 'crosses_above': return aiPrev <= bPrev && ai > bNow;
    case 'crosses_below': return aiPrev >= bPrev && ai < bNow;
  }
  return false;
}

function evalGroup(g: ConditionGroup | null | undefined, series: Map<string, Series>, i: number): boolean {
  if (!g || g.conditions.length === 0) return false;
  const results = g.conditions.map((c) => evalCondition(c, series, i));
  return g.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

export interface SpecSignals {
  enterLong: boolean;
  enterShort: boolean;
  exitLong: boolean;
  exitShort: boolean;
  /** ATR value at the evaluated bar when the spec declares an ATR indicator. */
  atr: number | null;
  /** Close of the evaluated (last closed) bar. */
  close: number;
  /** Timestamp of the evaluated bar. */
  barTime: number;
}

/**
 * Live-signal evaluation — the SAME series builders and condition
 * evaluators the backtester replays with, applied to the last bar of a
 * live candle series. One definition of the strategy's rules, used by
 * both the backtest and the live deployment runner, so a deployed
 * strategy trades exactly what was backtested. Bars must be ascending
 * and the last bar must be CLOSED (callers slice off any forming bar).
 */
export function evaluateSpecSignals(spec: StrategySpec, barsIn: BacktestBar[]): SpecSignals | null {
  const bars = [...barsIn].sort((a, b) => a.timestamp - b.timestamp);
  if (bars.length < 3) return null;
  const series = buildSeries(spec, bars);
  const i = bars.length - 1;
  let atr: number | null = null;
  for (const ind of spec.indicators) {
    if (ind.kind === 'ATR') {
      const s = series.get(`${ind.id}:value`);
      const v = s ? s[i] : null;
      if (typeof v === 'number' && isFinite(v)) atr = v;
    }
  }
  return {
    enterLong: evalGroup(spec.entryLong, series, i),
    enterShort: evalGroup(spec.entryShort, series, i),
    exitLong: evalGroup(spec.exitLong, series, i),
    exitShort: evalGroup(spec.exitShort, series, i),
    atr,
    close: bars[i].close,
    barTime: bars[i].timestamp,
  };
}

// ── Replay ──────────────────────────────────────────────────────────

export function runBacktest(spec: StrategySpec, barsIn: BacktestBar[], opts: BacktestOptions): BacktestResult {
  const bars = [...barsIn].sort((a, b) => a.timestamp - b.timestamp);
  const pipSize = getPipSize(spec.symbol);
  const spread = (opts.spreadPips ?? 1) * pipSize;
  const slippage = (opts.slippagePips ?? 0.3) * pipSize;
  const commission = (opts.commissionPerLot ?? 0) * spec.risk.lotSize * 2; // round trip
  const pipValueMoney = pipSize * contractSize(spec.symbol) * spec.risk.lotSize; // per pip, quote ccy
  const usdBase = spec.symbol.replace(/[^A-Z]/g, '').startsWith('USD');

  const series = buildSeries(spec, bars);
  const atrId = spec.indicators.find((x: IndicatorConfig) => x.kind === 'ATR')?.id;
  const atrAt = (i: number) => (atrId ? series.get(`${atrId}:value`)?.[i] ?? null : null);

  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ timestamp: number; equity: number }> = [];
  let balance = opts.initialCapital;
  let peak = balance, maxDd = 0, maxDdPct = 0;
  equityCurve.push({ timestamp: bars.length ? bars[0].timestamp : 0, equity: balance });

  interface Pos { side: 'long' | 'short'; entryPrice: number; entryTime: number; entryIndex: number; sl: number | null; tp: number | null; best: number }
  let pos: Pos | null = null;
  const entriesByDay = new Map<string, number>();

  const closePos = (i: number, rawExit: number, reason: BacktestTrade['exitReason']) => {
    if (!pos) return;
    const dir = pos.side === 'long' ? 1 : -1;
    const exitPrice = rawExit - dir * slippage; // slippage always against the trader
    const pips = ((exitPrice - pos.entryPrice) * dir) / pipSize;
    let pnl = pips * pipValueMoney - commission;
    if (usdBase && exitPrice > 0) pnl = pnl / exitPrice; // quote(=JPY etc.) → USD approx
    balance += pnl;
    trades.push({ side: pos.side, entryTime: pos.entryTime, exitTime: bars[i].timestamp, entryIndex: pos.entryIndex, exitIndex: i, entryPrice: pos.entryPrice, exitPrice, pips, pnl, exitReason: reason });
    peak = Math.max(peak, balance);
    const dd = peak - balance;
    if (dd > maxDd) { maxDd = dd; maxDdPct = peak > 0 ? (dd / peak) * 100 : 0; }
    equityCurve.push({ timestamp: bars[i].timestamp, equity: balance });
    pos = null;
  };

  const warmup = Math.min(specWarmupBars(spec), Math.max(0, bars.length - 1));
  for (let i = warmup; i < bars.length; i++) {
    const bar = bars[i];
    if (pos) {
      const dir = pos.side === 'long' ? 1 : -1;
      // Trailing: tighten from extremes of bars before this one.
      if (spec.risk.trailingStopPips && i > pos.entryIndex) {
        const trailDist = spec.risk.trailingStopPips * pipSize;
        if (pos.side === 'long') {
          pos.best = Math.max(pos.best, bars[i - 1].high);
          const cand = pos.best - trailDist;
          if (cand > (pos.sl ?? -Infinity)) pos.sl = cand;
        } else {
          pos.best = Math.min(pos.best, bars[i - 1].low);
          const cand = pos.best + trailDist;
          if (cand < (pos.sl ?? Infinity)) pos.sl = cand;
        }
      }
      // Intrabar SL/TP (stop wins ties — conservative).
      if (pos.side === 'long') {
        if (pos.sl != null && bar.low <= pos.sl) { closePos(i, pos.sl, 'stop_loss'); }
        else if (pos.tp != null && bar.high >= pos.tp) { closePos(i, pos.tp, 'take_profit'); }
      } else {
        if (pos.sl != null && bar.high >= pos.sl) { closePos(i, pos.sl, 'stop_loss'); }
        else if (pos.tp != null && bar.low <= pos.tp) { closePos(i, pos.tp, 'take_profit'); }
      }
      if (pos) {
        const exitGroup = pos.side === 'long' ? spec.exitLong : spec.exitShort;
        if (evalGroup(exitGroup, series, i)) closePos(i, bar.close, 'exit_signal');
      }
    }
    if (!pos && i < bars.length - 1) {
      const dayKey = new Date(bar.timestamp).toISOString().slice(0, 10);
      const todayCount = entriesByDay.get(dayKey) ?? 0;
      if (spec.risk.maxTradesPerDay == null || todayCount < spec.risk.maxTradesPerDay) {
        const goLong = evalGroup(spec.entryLong, series, i);
        const goShort = !goLong && evalGroup(spec.entryShort, series, i);
        if (goLong || goShort) {
          const side = goLong ? 'long' : 'short';
          const dir = goLong ? 1 : -1;
          const entryPrice = bar.close + dir * (spread / 2 + slippage);
          const atr = atrAt(i);
          const slDist = spec.risk.stopLossPips != null ? spec.risk.stopLossPips * pipSize
            : spec.risk.stopLossAtrMult != null && atr != null ? spec.risk.stopLossAtrMult * atr : null;
          const tpDist = spec.risk.takeProfitPips != null ? spec.risk.takeProfitPips * pipSize
            : spec.risk.takeProfitAtrMult != null && atr != null ? spec.risk.takeProfitAtrMult * atr : null;
          pos = {
            side, entryPrice, entryTime: bar.timestamp, entryIndex: i,
            sl: slDist != null ? entryPrice - dir * slDist : null,
            tp: tpDist != null ? entryPrice + dir * tpDist : null,
            best: entryPrice,
          };
          entriesByDay.set(dayKey, todayCount + 1);
        }
      }
    }
  }
  if (pos && bars.length) closePos(bars.length - 1, bars[bars.length - 1].close, 'end');

  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossProfit = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const longs = trades.filter((t) => t.side === 'long');
  const shorts = trades.filter((t) => t.side === 'short');
  const byReason: Record<string, number> = {};
  for (const t of trades) byReason[t.exitReason] = (byReason[t.exitReason] ?? 0) + 1;
  const holdBars = trades.length
    ? trades.reduce((s, t) => s + (t.exitIndex - t.entryIndex), 0) / trades.length
    : 0;

  return {
    trades,
    equityCurve,
    stats: {
      barsUsed: bars.length,
      totalTrades: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      netPnl: balance - opts.initialCapital,
      netPips: trades.reduce((s, t) => s + t.pips, 0),
      returnPct: opts.initialCapital > 0 ? ((balance - opts.initialCapital) / opts.initialCapital) * 100 : 0,
      grossProfit,
      grossLoss,
      profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
      maxDrawdown: maxDd,
      maxDrawdownPct: maxDdPct,
      avgWin: wins.length ? grossProfit / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      bestTrade: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
      worstTrade: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
      finalBalance: balance,
    },
    dataPoints: {
      perSymbol: spec.symbol,
      timeframe: spec.timeframe,
      tradesByExitReason: byReason,
      longTrades: longs.length,
      shortTrades: shorts.length,
      longWinRate: longs.length ? (longs.filter((t) => t.pnl > 0).length / longs.length) * 100 : null,
      shortWinRate: shorts.length ? (shorts.filter((t) => t.pnl > 0).length / shorts.length) * 100 : null,
      avgHoldBars: holdBars,
    },
  };
}
