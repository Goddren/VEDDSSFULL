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
import type { StrategySpec, Condition, ConditionGroup, IndicatorConfig, StrategyTimeframe } from './strategy-spec';
import { specWarmupBars, TF_MINUTES } from './strategy-spec';

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

function vwapSeries(bars: BacktestBar[]): Series {
  const out: Series = new Array(bars.length).fill(null);
  let cumPV = 0, cumV = 0, day = '';
  for (let i = 0; i < bars.length; i++) {
    const d = new Date(bars[i].timestamp).toISOString().slice(0, 10);
    if (d !== day) { day = d; cumPV = 0; cumV = 0; }
    const tp = (bars[i].high + bars[i].low + bars[i].close) / 3;
    const v = bars[i].volume || 0;
    cumPV += tp * v; cumV += v;
    out[i] = cumV > 0 ? cumPV / cumV : null; // no volume → no VWAP (never invented)
  }
  return out;
}

function adxParts(bars: BacktestBar[], period: number): { adx: Series; plus: Series; minus: Series } {
  const n = bars.length;
  const adx: Series = new Array(n).fill(null);
  const plus: Series = new Array(n).fill(null);
  const minus: Series = new Array(n).fill(null);
  if (n <= period * 2) return { adx, plus, minus };
  const trs: number[] = [0], pdm: number[] = [0], mdm: number[] = [0];
  for (let i = 1; i < n; i++) {
    const up = bars[i].high - bars[i - 1].high;
    const dn = bars[i - 1].low - bars[i].low;
    pdm.push(up > dn && up > 0 ? up : 0);
    mdm.push(dn > up && dn > 0 ? dn : 0);
    trs.push(Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close)));
  }
  let sTr = 0, sP = 0, sM = 0;
  for (let i = 1; i <= period; i++) { sTr += trs[i]; sP += pdm[i]; sM += mdm[i]; }
  const dx: Series = new Array(n).fill(null);
  const dxAt = (i: number) => {
    if (sTr === 0) return 0;
    const p = (sP / sTr) * 100, m = (sM / sTr) * 100;
    plus[i] = p; minus[i] = m;
    return p + m === 0 ? 0 : (Math.abs(p - m) / (p + m)) * 100;
  };
  dx[period] = dxAt(period);
  let adxVal = 0; let dxCount = 0; let seedSum = 0;
  for (let i = period + 1; i < n; i++) {
    sTr = sTr - sTr / period + trs[i];
    sP = sP - sP / period + pdm[i];
    sM = sM - sM / period + mdm[i];
    dx[i] = dxAt(i);
    if (i <= period * 2) { seedSum += dx[i] as number; dxCount++; if (dxCount === period) { adxVal = seedSum / period; adx[i] = adxVal; } }
    else { adxVal = ((adxVal * (period - 1)) + (dx[i] as number)) / period; adx[i] = adxVal; }
  }
  return { adx, plus, minus };
}

function cciSeries(bars: BacktestBar[], period: number): Series {
  const out: Series = new Array(bars.length).fill(null);
  const tp = bars.map((b) => (b.high + b.low + b.close) / 3);
  for (let i = period - 1; i < bars.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += tp[j];
    const mean = sum / period;
    let dev = 0;
    for (let j = i - period + 1; j <= i; j++) dev += Math.abs(tp[j] - mean);
    dev /= period;
    out[i] = dev === 0 ? 0 : (tp[i] - mean) / (0.015 * dev);
  }
  return out;
}

function williamsRSeries(bars: BacktestBar[], period: number): Series {
  const out: Series = new Array(bars.length).fill(null);
  for (let i = period - 1; i < bars.length; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
    out[i] = hh === ll ? -50 : ((hh - bars[i].close) / (hh - ll)) * -100;
  }
  return out;
}

function donchianSeries(bars: BacktestBar[], period: number): { upper: Series; mid: Series; lower: Series } {
  const n = bars.length;
  const upper: Series = new Array(n).fill(null);
  const mid: Series = new Array(n).fill(null);
  const lower: Series = new Array(n).fill(null);
  // Prior bars only (excludes current): a close can then actually CROSS the band.
  for (let i = period; i < n; i++) {
    let hh = -Infinity, ll = Infinity;
    for (let j = i - period; j < i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
    upper[i] = hh; lower[i] = ll; mid[i] = (hh + ll) / 2;
  }
  return { upper, mid, lower };
}

function supertrendSeries(bars: BacktestBar[], period: number, mult: number): Series {
  const n = bars.length;
  const out: Series = new Array(n).fill(null);
  const atr = atrSeries(bars, period);
  let prevUB = 0, prevLB = 0, prevST = 0, prevClose = 0;
  for (let i = 0; i < n; i++) {
    const a = atr[i];
    if (a == null) continue;
    const mid = (bars[i].high + bars[i].low) / 2;
    let ub = mid + mult * a;
    let lb = mid - mult * a;
    if (i > 0 && prevUB) {
      ub = ub < prevUB || prevClose > prevUB ? ub : prevUB;
      lb = lb > prevLB || prevClose < prevLB ? lb : prevLB;
    }
    const st = prevST === prevUB ? (bars[i].close <= ub ? ub : lb)
      : prevST === prevLB ? (bars[i].close >= lb ? lb : ub)
      : bars[i].close <= ub ? ub : lb;
    out[i] = st;
    prevUB = ub; prevLB = lb; prevST = st; prevClose = bars[i].close;
  }
  return out;
}

function ichimokuParts(bars: BacktestBar[], tenkanP: number, kijunP: number, senkouP: number): { tenkan: Series; kijun: Series; spanA: Series; spanB: Series } {
  const n = bars.length;
  const hlMid = (period: number, shift: number): Series => {
    const out: Series = new Array(n).fill(null);
    for (let i = period - 1; i < n; i++) {
      let hh = -Infinity, ll = Infinity;
      for (let j = i - period + 1; j <= i; j++) { hh = Math.max(hh, bars[j].high); ll = Math.min(ll, bars[j].low); }
      out[i] = (hh + ll) / 2;
    }
    if (shift > 0) {
      const shifted: Series = new Array(n).fill(null);
      for (let i = shift; i < n; i++) shifted[i] = out[i - shift];
      return shifted;
    }
    return out;
  };
  const tenkan = hlMid(tenkanP, 0);
  const kijun = hlMid(kijunP, 0);
  // Spans are plotted 26 bars ahead in the classic chart; the value VISIBLE
  // at bar i was computed from data up to i-26 — exactly the shifted series.
  const spanARaw: Series = tenkan.map((t, i) => (t != null && kijun[i] != null ? (t + (kijun[i] as number)) / 2 : null));
  const spanA: Series = new Array(n).fill(null);
  for (let i = 26; i < n; i++) spanA[i] = spanARaw[i - 26];
  const spanB = hlMid(senkouP, 26);
  return { tenkan, kijun, spanA, spanB };
}

export function volumeProfileSeries(bars: BacktestBar[], lookback: number, vaPct: number): { poc: Series; vah: Series; val: Series } {
  const n = bars.length;
  const poc: Series = new Array(n).fill(null);
  const vah: Series = new Array(n).fill(null);
  const val: Series = new Array(n).fill(null);
  const BINS = 24;
  for (let i = 0; i < n; i++) {
    const from = Math.max(0, i - lookback + 1);
    let lo = Infinity, hi = -Infinity, total = 0;
    for (let j = from; j <= i; j++) { lo = Math.min(lo, bars[j].low); hi = Math.max(hi, bars[j].high); total += bars[j].volume || 0; }
    if (!(total > 0) || hi <= lo) continue; // no volume data → profile undefined
    const width = (hi - lo) / BINS;
    const bins = new Array(BINS).fill(0);
    for (let j = from; j <= i; j++) {
      const idx = Math.min(BINS - 1, Math.max(0, Math.floor((bars[j].close - lo) / width)));
      bins[idx] += bars[j].volume || 0;
    }
    let pocBin = 0;
    for (let b = 1; b < BINS; b++) if (bins[b] > bins[pocBin]) pocBin = b;
    let acc = bins[pocBin], up = pocBin, dn = pocBin;
    const target = total * (vaPct / 100);
    while (acc < target && (up < BINS - 1 || dn > 0)) {
      const upVol = up < BINS - 1 ? bins[up + 1] : -1;
      const dnVol = dn > 0 ? bins[dn - 1] : -1;
      if (upVol >= dnVol && upVol >= 0) { up++; acc += bins[up]; } else if (dnVol >= 0) { dn--; acc += bins[dn]; } else break;
    }
    poc[i] = lo + (pocBin + 0.5) * width;
    vah[i] = lo + (up + 1) * width;
    val[i] = lo + dn * width;
  }
  return { poc, vah, val };
}

function pivotsSeries(bars: BacktestBar[]): { pp: Series; r1: Series; r2: Series; s1: Series; s2: Series } {
  const n = bars.length;
  const mk = (): Series => new Array(n).fill(null);
  const pp = mk(), r1 = mk(), r2 = mk(), s1 = mk(), s2 = mk();
  let prevDay = '', pH = 0, pL = 0, pC = 0, curH = -Infinity, curL = Infinity;
  let levels: { pp: number; r1: number; r2: number; s1: number; s2: number } | null = null;
  for (let i = 0; i < n; i++) {
    const d = new Date(bars[i].timestamp).toISOString().slice(0, 10);
    if (d !== prevDay) {
      if (prevDay && curH > -Infinity) {
        const p = (pH + pL + pC) / 3;
        levels = { pp: p, r1: 2 * p - pL, s1: 2 * p - pH, r2: p + (pH - pL), s2: p - (pH - pL) };
      }
      prevDay = d; curH = -Infinity; curL = Infinity;
    }
    if (levels) { pp[i] = levels.pp; r1[i] = levels.r1; r2[i] = levels.r2; s1[i] = levels.s1; s2[i] = levels.s2; }
    curH = Math.max(curH, bars[i].high); curL = Math.min(curL, bars[i].low);
    pH = curH; pL = curL; pC = bars[i].close;
  }
  return { pp, r1, r2, s1, s2 };
}

function orbSeries(bars: BacktestBar[], startH: number, startM: number, rangeMinutes: number, barMs: number): { orHigh: Series; orLow: Series } {
  const n = bars.length;
  const orHigh: Series = new Array(n).fill(null);
  const orLow: Series = new Array(n).fill(null);
  const startMs = (startH * 60 + startM) * 60000;
  const rangeMs = rangeMinutes * 60000;
  const dayMs = 86400000;
  let curSession = -1, rH = -Infinity, rL = Infinity, formed: { h: number; l: number } | null = null;
  for (let i = 0; i < n; i++) {
    const t = bars[i].timestamp;
    const sessionStart = Math.floor((t - startMs) / dayMs) * dayMs + startMs;
    const sess = sessionStart;
    if (sess !== curSession) { curSession = sess; rH = -Infinity; rL = Infinity; formed = null; }
    if (t < sess + rangeMs) {
      rH = Math.max(rH, bars[i].high); rL = Math.min(rL, bars[i].low);
    }
    // Series are read at bar close: the range is fully known at the close
    // of its last bar, so levels appear on that bar — otherwise a breakout
    // on the very next bar could never register as a cross (the level
    // would still be null on the pre-breakout bar).
    if (t + barMs >= sess + rangeMs && rH > -Infinity) {
      if (!formed) formed = { h: rH, l: rL };
      orHigh[i] = formed.h; orLow[i] = formed.l;
    }
  }
  return { orHigh, orLow };
}

function swingsSeries(bars: BacktestBar[], left: number, right: number): { swingHigh: Series; swingLow: Series } {
  const n = bars.length;
  const swingHigh: Series = new Array(n).fill(null);
  const swingLow: Series = new Array(n).fill(null);
  let lastH: number | null = null, lastL: number | null = null;
  for (let i = 0; i < n; i++) {
    // A pivot centered at j becomes known at j+right — apply confirmations first.
    const j = i - right;
    if (j >= left) {
      let isH = true, isL = true;
      for (let k = j - left; k <= j + right; k++) {
        if (k === j) continue;
        if (bars[k].high >= bars[j].high) isH = false;
        if (bars[k].low <= bars[j].low) isL = false;
      }
      if (isH) lastH = bars[j].high;
      if (isL) lastL = bars[j].low;
    }
    swingHigh[i] = lastH;
    swingLow[i] = lastL;
  }
  return { swingHigh, swingLow };
}

function fvgSeries(bars: BacktestBar[], maxAge: number): { bullHigh: Series; bullLow: Series; bearHigh: Series; bearLow: Series } {
  const n = bars.length;
  const bullHigh: Series = new Array(n).fill(null);
  const bullLow: Series = new Array(n).fill(null);
  const bearHigh: Series = new Array(n).fill(null);
  const bearLow: Series = new Array(n).fill(null);
  interface Gap { hi: number; lo: number; born: number }
  let bulls: Gap[] = [], bears: Gap[] = [];
  for (let i = 0; i < n; i++) {
    // Mitigation first: a bullish gap dies when price trades down through its bottom.
    bulls = bulls.filter((g) => bars[i].low > g.lo && i - g.born <= maxAge);
    bears = bears.filter((g) => bars[i].high < g.hi && i - g.born <= maxAge);
    if (i >= 2) {
      if (bars[i].low > bars[i - 2].high) bulls.push({ hi: bars[i].low, lo: bars[i - 2].high, born: i });
      if (bars[i].high < bars[i - 2].low) bears.push({ hi: bars[i - 2].low, lo: bars[i].high, born: i });
    }
    const b = bulls[bulls.length - 1];
    if (b) { bullHigh[i] = b.hi; bullLow[i] = b.lo; }
    const s = bears[bears.length - 1];
    if (s) { bearHigh[i] = s.hi; bearLow[i] = s.lo; }
  }
  return { bullHigh, bullLow, bearHigh, bearLow };
}

function orderBlockSeries(bars: BacktestBar[], confirmWindow: number, maxAge: number): { bullHigh: Series; bullLow: Series; bearHigh: Series; bearLow: Series } {
  const n = bars.length;
  const bullHigh: Series = new Array(n).fill(null);
  const bullLow: Series = new Array(n).fill(null);
  const bearHigh: Series = new Array(n).fill(null);
  const bearLow: Series = new Array(n).fill(null);
  interface Ob { hi: number; lo: number; born: number }
  interface Cand { hi: number; lo: number; at: number }
  let bulls: Ob[] = [], bears: Ob[] = [];
  let bullCands: Cand[] = [], bearCands: Cand[] = [];
  for (let i = 0; i < n; i++) {
    // Mitigation: bullish OB dies on a close through its low (bearish: close through high).
    bulls = bulls.filter((o) => bars[i].close >= o.lo && i - o.born <= maxAge);
    bears = bears.filter((o) => bars[i].close <= o.hi && i - o.born <= maxAge);
    // Confirm pending candidates with displacement closes.
    bullCands = bullCands.filter((c) => {
      if (bars[i].close > c.hi) { bulls.push({ hi: c.hi, lo: c.lo, born: i }); return false; }
      return i - c.at < confirmWindow;
    });
    bearCands = bearCands.filter((c) => {
      if (bars[i].close < c.lo) { bears.push({ hi: c.hi, lo: c.lo, born: i }); return false; }
      return i - c.at < confirmWindow;
    });
    if (bars[i].close < bars[i].open) bullCands.push({ hi: bars[i].high, lo: bars[i].low, at: i });
    if (bars[i].close > bars[i].open) bearCands.push({ hi: bars[i].high, lo: bars[i].low, at: i });
    const b = bulls[bulls.length - 1];
    if (b) { bullHigh[i] = b.hi; bullLow[i] = b.lo; }
    const s = bears[bears.length - 1];
    if (s) { bearHigh[i] = s.hi; bearLow[i] = s.lo; }
  }
  return { bullHigh, bullLow, bearHigh, bearLow };
}

/** seriesKey → per-field series for one indicator config. */
function buildSeries(spec: StrategySpec, bars: BacktestBar[]): Map<string, Series> {
  const closes = bars.map((b) => b.close);
  const map = new Map<string, Series>();
  map.set('price:price', closes.slice());
  map.set('price:value', closes.slice());
  const buildOne = (ind: IndicatorConfig) => {
    const key = (f: string) => `${ind.id}:${f}`;
    if (map.has(key('value')) && ind.kind !== 'EMA' && ind.kind !== 'SMA') return;
    switch (ind.kind) {
      case 'EMA': case 'SMA': {
        // Optional smoothing of another indicator's value series (sourceId).
        if (ind.sourceId) {
          const src = map.get(`${ind.sourceId}:value`);
          if (!src) return; // dependency not built yet — a later pass retries
          const nums = src.map((v) => v ?? NaN);
          const raw = ind.kind === 'EMA' ? ema(nums, ind.period ?? 21) : sma(nums, ind.period ?? 50);
          map.set(key('value'), raw.map((v, i) => (src[i] == null || v == null || Number.isNaN(v as number) ? null : v)));
          return;
        }
        map.set(key('value'), ind.kind === 'EMA' ? ema(closes, ind.period ?? 21) : sma(closes, ind.period ?? 50));
        break;
      }
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
      case 'VWAP': map.set(key('value'), vwapSeries(bars)); break;
      case 'ADX': {
        const p = adxParts(bars, ind.period ?? 14);
        map.set(key('value'), p.adx);
        map.set(key('plus'), p.plus);
        map.set(key('minus'), p.minus);
        break;
      }
      case 'CCI': map.set(key('value'), cciSeries(bars, ind.period ?? 20)); break;
      case 'WILLIAMS_R': map.set(key('value'), williamsRSeries(bars, ind.period ?? 14)); break;
      case 'DONCHIAN': {
        const d = donchianSeries(bars, ind.period ?? 20);
        map.set(key('upper'), d.upper);
        map.set(key('middle'), d.mid);
        map.set(key('value'), d.mid);
        map.set(key('lower'), d.lower);
        break;
      }
      case 'SUPERTREND': map.set(key('value'), supertrendSeries(bars, ind.period ?? 10, ind.stdDev ?? 3)); break;
      case 'ICHIMOKU': {
        const p = ichimokuParts(bars, ind.period ?? 9, ind.fastPeriod ?? 26, ind.slowPeriod ?? 52);
        map.set(key('tenkan'), p.tenkan);
        map.set(key('kijun'), p.kijun);
        map.set(key('span_a'), p.spanA);
        map.set(key('span_b'), p.spanB);
        map.set(key('value'), p.kijun);
        break;
      }
      case 'VOLUME_PROFILE': {
        const p = volumeProfileSeries(bars, ind.lookbackBars ?? 100, ind.valueAreaPct ?? 70);
        map.set(key('poc'), p.poc);
        map.set(key('vah'), p.vah);
        map.set(key('val'), p.val);
        map.set(key('value'), p.poc);
        break;
      }
      case 'PIVOTS': {
        const p = pivotsSeries(bars);
        map.set(key('pp'), p.pp);
        map.set(key('r1'), p.r1);
        map.set(key('r2'), p.r2);
        map.set(key('s1'), p.s1);
        map.set(key('s2'), p.s2);
        map.set(key('value'), p.pp);
        break;
      }
      case 'ORB': {
        const p = orbSeries(bars, ind.sessionStartHourUtc ?? 14, ind.sessionStartMinuteUtc ?? 30, ind.rangeMinutes ?? 30, TF_MINUTES[spec.timeframe] * 60000);
        map.set(key('or_high'), p.orHigh);
        map.set(key('or_low'), p.orLow);
        map.set(key('value'), p.orHigh);
        break;
      }
      case 'SWINGS': {
        const p = swingsSeries(bars, ind.pivotLeft ?? 3, ind.pivotRight ?? 3);
        map.set(key('swing_high'), p.swingHigh);
        map.set(key('swing_low'), p.swingLow);
        map.set(key('value'), p.swingHigh);
        break;
      }
      case 'FVG': {
        const p = fvgSeries(bars, ind.lookbackBars ?? 100);
        map.set(key('bull_high'), p.bullHigh);
        map.set(key('bull_low'), p.bullLow);
        map.set(key('bear_high'), p.bearHigh);
        map.set(key('bear_low'), p.bearLow);
        map.set(key('value'), p.bullLow);
        break;
      }
      case 'ORDER_BLOCK': {
        const p = orderBlockSeries(bars, ind.pivotLeft ?? 5, ind.lookbackBars ?? 100);
        map.set(key('bull_high'), p.bullHigh);
        map.set(key('bull_low'), p.bullLow);
        map.set(key('bear_high'), p.bearHigh);
        map.set(key('bear_low'), p.bearLow);
        map.set(key('value'), p.bullLow);
        break;
      }
    }
  };
  // Multiple passes so EMA/SMA sourceId chains resolve in any order.
  for (let pass = 0; pass <= spec.indicators.length; pass++) {
    for (const ind of spec.indicators) buildOne(ind);
  }
  return map;
}

function evalBaseCondition(c: Condition, series: Map<string, Series>, i: number, pipSize: number): boolean {
  if (i < 1) return false;
  const a = series.get(`${c.indicatorId}:${c.field}`);
  if (!a) return false;
  const ai = a[i], aiPrev = a[i - 1];
  if (ai == null || aiPrev == null) return false;
  if (c.operator === 'rising') return ai > aiPrev;
  if (c.operator === 'falling') return ai < aiPrev;
  if (c.operator === 'turns_up' || c.operator === 'turns_down') {
    if (i < 2) return false;
    const aiPrev2 = a[i - 2];
    if (aiPrev2 == null) return false;
    return c.operator === 'turns_up' ? aiPrev <= aiPrev2 && ai > aiPrev : aiPrev >= aiPrev2 && ai < aiPrev;
  }
  let bNow: number | null, bPrev: number | null;
  if (c.compare.kind === 'value') { bNow = c.compare.value; bPrev = c.compare.value; }
  else {
    const bKey = c.compare.kind === 'price' ? 'price:price' : `${c.compare.indicatorId}:${c.compare.field}`;
    const b = series.get(bKey);
    if (!b) return false;
    bNow = b[i]; bPrev = b[i - 1];
  }
  if (bNow == null || bPrev == null) return false;
  const gap = (c.minGapPips ?? 0) * pipSize;
  switch (c.operator) {
    case 'above': return ai > bNow + gap;
    case 'below': return ai < bNow - gap;
    case 'crosses_above': return aiPrev <= bPrev && ai > bNow + gap;
    case 'crosses_below': return aiPrev >= bPrev && ai < bNow - gap;
  }
  return false;
}

function evalCondition(c: Condition, series: Map<string, Series>, i: number, pipSize: number): boolean {
  const sustain = Math.max(1, Math.floor(c.sustainBars ?? 1));
  for (let j = i - sustain + 1; j <= i; j++) {
    if (j < 1 || !evalBaseCondition(c, series, j, pipSize)) return false;
  }
  return true;
}

function evalGroup(g: ConditionGroup | null | undefined, series: Map<string, Series>, i: number, pipSize: number): boolean {
  if (!g || g.conditions.length === 0) return false;
  const results = g.conditions.map((c) => evalCondition(c, series, i, pipSize));
  return g.logic === 'AND' ? results.every(Boolean) : results.some(Boolean);
}

// ── Filters: session window + higher-timeframe trend ────────────────

function sessionAllows(spec: StrategySpec, barTs: number): boolean {
  const sf = spec.sessionFilter;
  if (!sf) return true;
  const d = new Date(barTs);
  if (sf.daysUtc && sf.daysUtc.length && !sf.daysUtc.includes(d.getUTCDay())) return false;
  const h = d.getUTCHours();
  return sf.endHourUtc > sf.startHourUtc
    ? h >= sf.startHourUtc && h < sf.endHourUtc
    : h >= sf.startHourUtc || h < sf.endHourUtc; // wraps midnight
}

/** Aggregate base bars into higher-timeframe buckets aligned to UTC epoch. */
export function resampleBars(bars: BacktestBar[], baseTf: string, htfTf: string): BacktestBar[] {
  const ratio = Math.max(1, Math.round(TF_MINUTES[htfTf as StrategyTimeframe] / TF_MINUTES[baseTf as StrategyTimeframe]));
  if (ratio <= 1) return bars.slice();
  const bucketMs = TF_MINUTES[htfTf as StrategyTimeframe] * 60000;
  const out: BacktestBar[] = [];
  let cur: BacktestBar | null = null;
  for (const b of bars) {
    const start = Math.floor(b.timestamp / bucketMs) * bucketMs;
    if (!cur || cur.timestamp !== start) {
      if (cur) out.push(cur);
      cur = { timestamp: start, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0 };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume || 0;
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface FilterCtx {
  htfSeries: Map<string, Series> | null;
  htfBars: BacktestBar[];
  htfMs: number;
}

function buildFilterCtx(spec: StrategySpec, bars: BacktestBar[]): FilterCtx {
  if (!spec.trendFilter) return { htfSeries: null, htfBars: [], htfMs: 0 };
  const htfBars = resampleBars(bars, spec.timeframe, spec.trendFilter.timeframe);
  return {
    htfSeries: buildSeries(spec, htfBars),
    htfBars,
    htfMs: TF_MINUTES[spec.trendFilter.timeframe] * 60000,
  };
}

/** Entries additionally gated by the trend filter (evaluated on the last
 *  HTF bar that closed before the signal bar closes) and the session window. */
function entryAllowed(
  spec: StrategySpec, ctx: FilterCtx, series: Map<string, Series>,
  bars: BacktestBar[], i: number, pipSize: number, side: 'long' | 'short',
): boolean {
  if (!sessionAllows(spec, bars[i].timestamp)) return false;
  if (!spec.trendFilter || !ctx.htfSeries) return true;
  const group = side === 'long' ? spec.trendFilter.longGroup : spec.trendFilter.shortGroup;
  if (!group || !group.conditions?.length) return true;
  const barClose = bars[i].timestamp + TF_MINUTES[spec.timeframe] * 60000;
  let h = -1;
  for (let k = 0; k < ctx.htfBars.length; k++) {
    if (ctx.htfBars[k].timestamp + ctx.htfMs <= barClose) h = k; else break;
  }
  if (h < 1) return false;
  return evalGroup(group, ctx.htfSeries, h, pipSize);
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
  const pipSize = getPipSize(spec.symbol);
  const i = bars.length - 1;
  let atr: number | null = null;
  for (const ind of spec.indicators) {
    if (ind.kind === 'ATR') {
      const s = series.get(`${ind.id}:value`);
      const v = s ? s[i] : null;
      if (typeof v === 'number' && isFinite(v)) atr = v;
    }
  }
  const ctx = buildFilterCtx(spec, bars);
  return {
    enterLong: evalGroup(spec.entryLong, series, i, pipSize) && entryAllowed(spec, ctx, series, bars, i, pipSize, 'long'),
    enterShort: evalGroup(spec.entryShort, series, i, pipSize) && entryAllowed(spec, ctx, series, bars, i, pipSize, 'short'),
    exitLong: evalGroup(spec.exitLong, series, i, pipSize),
    exitShort: evalGroup(spec.exitShort, series, i, pipSize),
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
  const filterCtx = buildFilterCtx(spec, bars);
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
      // Track the favourable extreme from bars before this one (causal).
      if (i > pos.entryIndex) {
        pos.best = pos.side === 'long' ? Math.max(pos.best, bars[i - 1].high) : Math.min(pos.best, bars[i - 1].low);
      }
      // Breakeven: once price has run trigger pips in profit, move the
      // stop to entry + offset. Only ever tightens.
      if (spec.risk.breakevenTriggerPips && i > pos.entryIndex) {
        const trig = spec.risk.breakevenTriggerPips * pipSize;
        const off = (spec.risk.breakevenOffsetPips ?? 0) * pipSize;
        if (pos.side === 'long' && pos.best - pos.entryPrice >= trig) {
          const cand = pos.entryPrice + off;
          if (cand > (pos.sl ?? -Infinity)) pos.sl = cand;
        } else if (pos.side === 'short' && pos.entryPrice - pos.best >= trig) {
          const cand = pos.entryPrice - off;
          if (cand < (pos.sl ?? Infinity)) pos.sl = cand;
        }
      }
      // Trailing: tighten from extremes of bars before this one.
      if (spec.risk.trailingStopPips && i > pos.entryIndex) {
        const trailDist = spec.risk.trailingStopPips * pipSize;
        if (pos.side === 'long') {
          const cand = pos.best - trailDist;
          if (cand > (pos.sl ?? -Infinity)) pos.sl = cand;
        } else {
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
        if (evalGroup(exitGroup, series, i, pipSize)) closePos(i, bar.close, 'exit_signal');
      }
    }
    if (!pos && i < bars.length - 1) {
      const dayKey = new Date(bar.timestamp).toISOString().slice(0, 10);
      const todayCount = entriesByDay.get(dayKey) ?? 0;
      if (spec.risk.maxTradesPerDay == null || todayCount < spec.risk.maxTradesPerDay) {
        const goLong = evalGroup(spec.entryLong, series, i, pipSize) && entryAllowed(spec, filterCtx, series, bars, i, pipSize, 'long');
        const goShort = !goLong && evalGroup(spec.entryShort, series, i, pipSize) && entryAllowed(spec, filterCtx, series, bars, i, pipSize, 'short');
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
