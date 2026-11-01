// Strategy Wizard: real candle backtests, a forward paper test, and the step
// that turns a proven strategy into a brain idea.
//
// Every strategy here is deterministic: the same bars give the same signals.
// That is what makes the paper test honest. It is the same rules run only on
// bars that closed AFTER the user saved the strategy (out of sample), so
// nothing is tuned on the data it is judged on. No orders are ever placed.
//
// Trades: enter at the next bar's open, stop 1.5 ATR(14), target rr × stop,
// one trade at a time, give up after maxHold bars. Results are in R so they
// don't depend on account size; $ figures assume a 1% risk on a $10,000 account.

import { pool } from '../db';
import { sessionFor } from './fx-models';
import { saveIdea, sanitizeRule } from './brain-ideas';

export const WIZARD_SUPPORTED = [
  'head-and-shoulders', 'flag-pennant', 'harmonic-patterns', 'three-drive-pattern', 'cup-and-handle', 'wedge-patterns',
  'moving-average-crossover', 'rsi-overbought-oversold', 'breakout-with-volume', 'macd-signal-crossover',
  'stochastic-crossover', 'engulfing-candles', 'channel-trading', 'support-resistance-bounce', 'double-top-bottom',
];

const TF: Record<string, { tf: '5m' | '15m' | '30m' | '1h' | '4h' | '1d'; perDay: number }> = {
  M5: { tf: '5m', perDay: 288 }, M15: { tf: '15m', perDay: 96 }, M30: { tf: '30m', perDay: 48 },
  H1: { tf: '1h', perDay: 24 }, H4: { tf: '4h', perDay: 6 }, D1: { tf: '1d', perDay: 1 },
};
const PERIOD_DAYS: Record<string, number> = { '1M': 30, '3M': 91, '6M': 182, '1Y': 365, '2Y': 730 };
const MAX_BARS = 5000;
const PAPER_MIN_TRADES = 10;

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
type Dir = 'BUY' | 'SELL';
export interface WizardTrade { time: string; dir: Dir; entry: number; exit: number; r: number; bars: number; exitReason: string; session: string }
export interface WizardResult {
  strategyId: string; symbol: string; timeframe: string; from: string | null; to: string | null; bars: number;
  trades: WizardTrade[]; totalR: number; winRate: number; profitFactor: number; avgWinR: number; avgLossR: number;
  maxDrawdownR: number; sharpe: number; avgHoldBars: number;
  bySession: { session: string; trades: number; winRate: number; r: number }[];
  byDirection: { dir: Dir; trades: number; winRate: number; r: number }[];
  notes: string[];
}

const p = (params: Record<string, any>, id: string, d: number) => {
  const n = Number(params?.[id]); return Number.isFinite(n) ? n : d;
};

function ema(src: number[], n: number): number[] {
  const out: number[] = []; const k = 2 / (n + 1);
  src.forEach((x, i) => out.push(i === 0 ? x : x * k + out[i - 1] * (1 - k)));
  return out;
}
function sma(src: number[], n: number): number[] {
  const out: number[] = []; let s = 0;
  src.forEach((x, i) => { s += x; if (i >= n) s -= src[i - n]; out.push(i >= n - 1 ? s / n : NaN); });
  return out;
}
function rsi(c: number[], n: number): number[] {
  const out: number[] = new Array(c.length).fill(NaN); let g = 0, l = 0;
  for (let i = 1; i < c.length; i++) {
    const d = c[i] - c[i - 1]; const up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
    g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
function atr(b: Bar[], n = 14): number[] {
  const tr = b.map((x, i) => i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - b[i - 1].c), Math.abs(x.l - b[i - 1].c)));
  return ema(tr, n);
}
const hi = (b: Bar[], from: number, to: number) => { let m = -Infinity; for (let k = Math.max(0, from); k <= to; k++) m = Math.max(m, b[k].h); return m; };
const lo = (b: Bar[], from: number, to: number) => { let m = Infinity; for (let k = Math.max(0, from); k <= to; k++) m = Math.min(m, b[k].l); return m; };

type Pivot = { i: number; p: number; hi: boolean };
/** Swing pivots (k bars each side), each handed to cb only once it's confirmed (k bars later). */
function pivotScan(b: Bar[], k: number, cb: (i: number, pivots: Pivot[]) => void) {
  const P: Pivot[] = [];
  for (let i = 2 * k; i < b.length; i++) {
    const j = i - k; let isH = true, isL = true;
    for (let m = j - k; m <= j + k; m++) { if (m === j) continue; if (b[m].h >= b[j].h) isH = false; if (b[m].l <= b[j].l) isL = false; }
    if (isH) P.push({ i: j, p: b[j].h, hi: true });
    if (isL) P.push({ i: j, p: b[j].l, hi: false });
    if (P.length > 60) P.splice(0, P.length - 60);
    cb(i, P);
  }
}

/** Signal on the CLOSE of bar i (null = nothing). Only uses bars <= i. */
function buildSignals(id: string, b: Bar[], params: Record<string, any>): (Dir | null)[] {
  const c = b.map((x) => x.c); const v = b.map((x) => x.v);
  const hasVol = v.some((x) => x > 0);
  const vAvg = sma(v, 20);
  const volOk = (i: number, pct: number) => !hasVol || !(vAvg[i] > 0) || v[i] >= vAvg[i] * pct / 100;
  const sig: (Dir | null)[] = new Array(b.length).fill(null);
  const cross = (a: number[], s: number[], i: number): Dir | null =>
    a[i - 1] <= s[i - 1] && a[i] > s[i] ? 'BUY' : a[i - 1] >= s[i - 1] && a[i] < s[i] ? 'SELL' : null;

  switch (id) {
    case 'moving-average-crossover': {
      const ma = params?.['ma-type'] === 'sma' ? sma : ema;
      const f = ma(c, p(params, 'fast-period', 10)), s = ma(c, p(params, 'slow-period', 20));
      const trend = ema(c, 200); const filt = params?.['use-filters'] !== false;
      for (let i = 1; i < b.length; i++) {
        const d = cross(f, s, i); if (!d) continue;
        if (filt && i >= 200 && ((d === 'BUY' && c[i] < trend[i]) || (d === 'SELL' && c[i] > trend[i]))) continue;
        sig[i] = d;
      }
      break;
    }
    case 'rsi-overbought-oversold': {
      const r = rsi(c, p(params, 'rsi-period', 14)); const ob = p(params, 'overbought', 70), os = p(params, 'oversold', 30);
      for (let i = 1; i < b.length; i++) {
        if (r[i - 1] < os && r[i] >= os) sig[i] = 'BUY';
        else if (r[i - 1] > ob && r[i] <= ob) sig[i] = 'SELL';
      }
      break;
    }
    case 'breakout-with-volume': {
      const n = p(params, 'lookback-period', 20), vt = p(params, 'volume-threshold', 150); const t = params?.['breakout-type'] || 'both';
      for (let i = n; i < b.length; i++) {
        const H = hi(b, i - n, i - 1), L = lo(b, i - n, i - 1);
        if (t !== 'bearish' && c[i] > H && volOk(i, vt)) sig[i] = 'BUY';
        else if (t !== 'bullish' && c[i] < L && volOk(i, vt)) sig[i] = 'SELL';
      }
      break;
    }
    case 'macd-signal-crossover': {
      const f = ema(c, p(params, 'fast-ema', 12)), s = ema(c, p(params, 'slow-ema', 26));
      const m = f.map((x, i) => x - s[i]); const sg = ema(m, p(params, 'signal-period', 9));
      const conf = params?.['histogram-confirmation'] !== false;
      for (let i = 35; i < b.length; i++) {
        const d = cross(m, sg, i); if (!d) continue;
        if (conf && ((d === 'BUY' && m[i] > 0) || (d === 'SELL' && m[i] < 0))) continue; // take crosses from the far side of zero
        sig[i] = d;
      }
      break;
    }
    case 'stochastic-crossover': {
      const n = p(params, 'k-period', 14); const ob = p(params, 'overbought', 80), os = p(params, 'oversold', 20);
      const k = b.map((_, i) => { if (i < n - 1) return NaN; const H = hi(b, i - n + 1, i), L = lo(b, i - n + 1, i); return H === L ? 50 : (c[i] - L) / (H - L) * 100; });
      const d = sma(k.map((x) => (Number.isFinite(x) ? x : 50)), p(params, 'd-period', 3));
      for (let i = n + 3; i < b.length; i++) {
        const x = cross(k, d, i);
        if (x === 'BUY' && k[i] < os + 10) sig[i] = 'BUY';
        else if (x === 'SELL' && k[i] > ob - 10) sig[i] = 'SELL';
      }
      break;
    }
    case 'engulfing-candles': {
      const bodyX = p(params, 'body-size', 1.5), tl = p(params, 'trend-length', 5);
      for (let i = tl + 1; i < b.length; i++) {
        const prev = b[i - 1], cur = b[i]; const pb = Math.abs(prev.c - prev.o), cb = Math.abs(cur.c - cur.o);
        if (pb === 0 || cb < pb * bodyX) continue;
        const down = c[i - 1] < c[i - 1 - tl], up = c[i - 1] > c[i - 1 - tl];
        if (down && prev.c < prev.o && cur.c > cur.o && cur.c >= prev.o && cur.o <= prev.c) sig[i] = 'BUY';
        else if (up && prev.c > prev.o && cur.c < cur.o && cur.c <= prev.o && cur.o >= prev.c) sig[i] = 'SELL';
      }
      break;
    }
    case 'channel-trading': {
      const n = p(params, 'lookback-periods', 50), edge = p(params, 'entry-position', 20) / 100;
      for (let i = n; i < b.length; i++) {
        const H = hi(b, i - n, i - 1), L = lo(b, i - n, i - 1); const w = H - L; if (w <= 0) continue;
        const pos = (c[i] - L) / w;
        if (pos <= edge && pos >= 0 && c[i] > b[i].o) sig[i] = 'BUY';
        else if (pos >= 1 - edge && pos <= 1 && c[i] < b[i].o) sig[i] = 'SELL';
      }
      break;
    }
    case 'support-resistance-bounce': {
      const n = Math.min(p(params, 'lookback-period', 100), 300), touches = p(params, 'level-strength', 3), tol = p(params, 'bounce-threshold', 0.5) / 100;
      for (let i = n; i < b.length; i++) {
        const level = (x: number) => { let t = 0; for (let k = i - n; k < i; k++) if (Math.abs(b[k].l - x) / x <= tol || Math.abs(b[k].h - x) / x <= tol) t++; return t; };
        const L = lo(b, i - 10, i - 1), H = hi(b, i - 10, i - 1);
        if (Math.abs(b[i].l - L) / L <= tol && c[i] > b[i].o && level(L) >= touches) sig[i] = 'BUY';
        else if (Math.abs(b[i].h - H) / H <= tol && c[i] < b[i].o && level(H) >= touches) sig[i] = 'SELL';
      }
      break;
    }
    case 'head-and-shoulders': {
      const sym = p(params, 'symmetry-tolerance', 15) / 100;
      pivotScan(b, 3, (i, P) => {
        const H = P.filter((x) => x.hi).slice(-3), L = P.filter((x) => !x.hi).slice(-3);
        if (H.length === 3 && H[1].p > H[0].p && H[1].p > H[2].p) { // head and shoulders top
          const neck = Math.min(...L.filter((x) => x.i > H[0].i && x.i < H[2].i).map((x) => x.p));
          const height = H[1].p - Math.max(H[0].p, H[2].p);
          if (Number.isFinite(neck) && height > 0 && Math.abs(H[0].p - H[2].p) <= (H[1].p - neck) * sym && i - H[2].i < 30
            && c[i] < neck && c[i - 1] >= neck) sig[i] = 'SELL';
        }
        if (L.length === 3 && L[1].p < L[0].p && L[1].p < L[2].p) { // inverse
          const neck = Math.max(...H.filter((x) => x.i > L[0].i && x.i < L[2].i).map((x) => x.p));
          const height = Math.min(L[0].p, L[2].p) - L[1].p;
          if (Number.isFinite(neck) && height > 0 && Math.abs(L[0].p - L[2].p) <= (neck - L[1].p) * sym && i - L[2].i < 30
            && c[i] > neck && c[i - 1] <= neck) sig[i] = 'BUY';
        }
      });
      break;
    }
    case 'flag-pennant': {
      const a = atr(b); const m = Math.min(Math.max(p(params, 'consolidation-duration', 15), 5), 40); const pole = Math.max(p(params, 'pole-height', 5), 1) * 0.6;
      for (let i = m + 12; i < b.length; i++) {
        const s = i - m, move = c[s - 1] - c[s - 11]; const H = hi(b, s, i - 1), L = lo(b, s, i - 1);
        if (!(a[s] > 0) || Math.abs(move) < pole * a[s] || H - L > Math.abs(move) * 0.6) continue;
        if (move > 0 && c[i] > H) sig[i] = 'BUY';
        else if (move < 0 && c[i] < L) sig[i] = 'SELL';
      }
      break;
    }
    case 'harmonic-patterns': {
      const tol = p(params, 'fib-tolerance', 3) / 100;
      const near = (x: number, lo_: number, hi_: number) => x >= lo_ - tol && x <= hi_ + tol;
      let lastD = -1;
      pivotScan(b, 3, (i, P) => {
        if (P.length < 5) return;
        const [X, A, B, C, D] = P.slice(-5);
        if (D.i === lastD || i - D.i > 3) return;
        const XA = Math.abs(A.p - X.p); if (!XA) return;
        const ab = Math.abs(B.p - A.p) / XA, bc = Math.abs(C.p - B.p) / (Math.abs(B.p - A.p) || 1), ad = Math.abs(A.p - D.p) / XA;
        if (near(ab, 0.382, 0.886) && near(bc, 0.382, 0.886) && near(ad, 0.786, 1.27)) {
          sig[i] = D.hi ? 'SELL' : 'BUY'; lastD = D.i;
        }
      });
      break;
    }
    case 'three-drive-pattern': {
      const eq = p(params, 'drive-equality', 10) / 100; let last = -1;
      pivotScan(b, 3, (i, P) => {
        for (const isHi of [true, false]) {
          const S = P.filter((x) => x.hi === isHi).slice(-3);
          if (S.length < 3 || S[2].i === last || i - S[2].i > 3) continue;
          const d1 = S[1].p - S[0].p, d2 = S[2].p - S[1].p;
          const trending = isHi ? d1 > 0 && d2 > 0 : d1 < 0 && d2 < 0;
          if (trending && Math.abs(d1 - d2) <= Math.abs(d1) * (eq * 3)) { sig[i] = isHi ? 'SELL' : 'BUY'; last = S[2].i; }
        }
      });
      break;
    }
    case 'cup-and-handle': {
      const w = Math.min(Math.max(p(params, 'cup-width', 40), 20), 120), depthMax = p(params, 'cup-depth', 30) / 100, hr = p(params, 'handle-retracement', 38) / 100;
      for (let i = w + 10; i < b.length; i++) {
        const cs = i - w - 8, ce = i - 8; const rimL = hi(b, cs, cs + 5), bottom = lo(b, cs, ce), rimR = hi(b, ce - 5, ce);
        const depth = rimL - bottom; if (depth <= 0) continue;
        const handleLow = lo(b, ce, i - 1);
        const mid = lo(b, cs + Math.floor(w * 0.3), cs + Math.floor(w * 0.7));
        if (Math.abs(rimR - rimL) <= depth * 0.15 && mid <= bottom + depth * 0.25 && depth / rimL <= depthMax
          && rimR - handleLow <= depth * hr && rimR - handleLow > 0 && c[i] > Math.max(rimL, rimR) && c[i - 1] <= Math.max(rimL, rimR)) sig[i] = 'BUY';
      }
      break;
    }
    case 'wedge-patterns': {
      const t = params?.['wedge-type'] || 'both';
      pivotScan(b, 3, (i, P) => {
        const H = P.filter((x) => x.hi).slice(-3), L = P.filter((x) => !x.hi).slice(-3);
        if (H.length < 3 || L.length < 3 || i - Math.max(H[2].i, L[2].i) > 20) return;
        const sH = (H[2].p - H[0].p) / (H[2].i - H[0].i), sL = (L[2].p - L[0].p) / (L[2].i - L[0].i);
        const upper = H[2].p + sH * (i - H[2].i), lower = L[2].p + sL * (i - L[2].i);
        const upperPrev = upper - sH, lowerPrev = lower - sL;
        if (t !== 'falling' && sH > 0 && sL > 0 && sL > sH && c[i] < lower && c[i - 1] >= lowerPrev) sig[i] = 'SELL'; // rising wedge breaks down
        else if (t !== 'rising' && sH < 0 && sL < 0 && sH < sL && c[i] > upper && c[i - 1] <= upperPrev) sig[i] = 'BUY'; // falling wedge breaks up
      });
      break;
    }
    case 'double-top-bottom': {
      const tol = p(params, 'price-threshold', 3) / 1000; const t = params?.['pattern-type'] || 'both';
      for (let i = 40; i < b.length; i++) {
        const H1 = hi(b, i - 40, i - 21), H2 = hi(b, i - 20, i - 1), L1 = lo(b, i - 40, i - 21), L2 = lo(b, i - 20, i - 1);
        const mid = lo(b, i - 25, i - 15), midH = hi(b, i - 25, i - 15);
        if (t !== 'double-bottom' && Math.abs(H1 - H2) / H1 <= tol && c[i] < mid && c[i - 1] >= mid) sig[i] = 'SELL';
        else if (t !== 'double-top' && Math.abs(L1 - L2) / L1 <= tol && c[i] > midH && c[i - 1] <= midH) sig[i] = 'BUY';
      }
      break;
    }
  }
  return sig;
}

function simulate(b: Bar[], sig: (Dir | null)[], rr: number, maxHold: number, fromTs = 0): WizardTrade[] {
  const a = atr(b); const out: WizardTrade[] = [];
  let i = 20;
  while (i < b.length - 1) {
    const d = sig[i];
    if (!d || b[i + 1].t < fromTs || !(a[i] > 0)) { i++; continue; }
    const e = b[i + 1].o, risk = a[i] * 1.5;
    const stop = d === 'BUY' ? e - risk : e + risk, tgt = d === 'BUY' ? e + risk * rr : e - risk * rr;
    let j = i + 1, exit = NaN, why = '';
    for (; j < b.length && j <= i + maxHold; j++) {
      const x = b[j];
      const hitS = d === 'BUY' ? x.l <= stop : x.h >= stop, hitT = d === 'BUY' ? x.h >= tgt : x.l <= tgt;
      if (hitS) { exit = stop; why = 'Stop loss (1.5 ATR)'; break; } // both in one bar → assume the stop (conservative)
      if (hitT) { exit = tgt; why = `Target (${rr}R)`; break; }
    }
    if (!Number.isFinite(exit)) {
      if (j >= b.length) break; // still open at the end of the data: not counted
      j = i + maxHold; exit = b[j].c; why = `Time exit (${maxHold} bars)`;
    }
    const r = ((d === 'BUY' ? exit - e : e - exit) / risk);
    const t = new Date(b[i + 1].t);
    out.push({ time: t.toISOString(), dir: d, entry: e, exit, r: Math.round(r * 100) / 100, bars: j - i, exitReason: why, session: sessionFor(t) });
    i = j + 1;
  }
  return out;
}

function summarize(base: Omit<WizardResult, 'totalR' | 'winRate' | 'profitFactor' | 'avgWinR' | 'avgLossR' | 'maxDrawdownR' | 'sharpe' | 'avgHoldBars' | 'bySession' | 'byDirection'>): WizardResult {
  const t = base.trades; const wins = t.filter((x) => x.r > 0), losses = t.filter((x) => x.r <= 0);
  const sum = (a: WizardTrade[]) => a.reduce((s, x) => s + x.r, 0);
  let eq = 0, peak = 0, dd = 0; for (const x of t) { eq += x.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  const mean = t.length ? sum(t) / t.length : 0;
  const sd = t.length > 1 ? Math.sqrt(t.reduce((s, x) => s + (x.r - mean) ** 2, 0) / (t.length - 1)) : 0;
  const group = <K extends string>(key: (x: WizardTrade) => K) => {
    const m = new Map<K, WizardTrade[]>(); t.forEach((x) => m.set(key(x), [...(m.get(key(x)) || []), x]));
    return Array.from(m.entries()).map(([k, a]) => ({ k, trades: a.length, winRate: Math.round(a.filter((x) => x.r > 0).length / a.length * 100), r: Math.round(sum(a) * 10) / 10 }));
  };
  const r1 = (n: number) => Math.round(n * 100) / 100;
  return {
    ...base,
    totalR: r1(sum(t)), winRate: t.length ? Math.round(wins.length / t.length * 1000) / 10 : 0,
    profitFactor: losses.length && sum(losses) < 0 ? r1(sum(wins) / -sum(losses)) : wins.length ? 99 : 0,
    avgWinR: wins.length ? r1(sum(wins) / wins.length) : 0, avgLossR: losses.length ? r1(sum(losses) / losses.length) : 0,
    maxDrawdownR: r1(dd), sharpe: sd > 0 ? r1(mean / sd * Math.sqrt(t.length)) : 0,
    avgHoldBars: t.length ? Math.round(t.reduce((s, x) => s + x.bars, 0) / t.length) : 0,
    bySession: group((x) => x.session).map(({ k, ...r }) => ({ session: k, ...r })),
    byDirection: group((x) => x.dir).map(({ k, ...r }) => ({ dir: k as Dir, ...r })),
  };
}

// Own provider instance + own cache: the shared market-data cache is keyed by
// symbol+timeframe only, so a long wizard series must never be served to the
// live engine (or the engine's short series to the wizard).
const barCache = new Map<string, { at: number; bars: Bar[] }>();
async function loadBars(symbol: string, timeframe: string, days: number): Promise<Bar[]> {
  const tf = TF[timeframe] || TF.H1;
  const s = symbol.toUpperCase();
  const limit = Math.min(Math.ceil(days * tf.perDay), MAX_BARS);
  const key = `${s}|${tf.tf}|${limit}`;
  const hit = barCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.bars;
  const assetType = /^(BTC|ETH|SOL|XRP|DOGE)/.test(s) ? 'crypto' : 'forex';
  let bars: Bar[] = []; let tdErr = '';
  if (process.env.TWELVE_DATA_API_KEY) {
    try {
      const { TwelveDataProvider } = await import('../market-data/providers/twelve-data');
      const raw = await new TwelveDataProvider(process.env.TWELVE_DATA_API_KEY).fetchOHLCV({ symbol: s, timeframe: tf.tf, assetType, limit } as any);
      bars = (raw || []).map((x: any) => ({ t: Number(x.timestamp), o: +x.open, h: +x.high, l: +x.low, c: +x.close, v: +(x.volume || 0) }))
        .filter((x) => Number.isFinite(x.c)).sort((a, z) => a.t - z.t);
    } catch (e: any) { tdErr = e.message; }
  }
  if (bars.length < 60) {
    const y = await yahooBars(s, tf.tf).catch(() => [] as Bar[]);
    if (y.length > bars.length) bars = y.slice(-limit);
  }
  if (bars.length < 60 && tdErr) throw new Error(`No candles for ${s} ${timeframe}: ${tdErr}`);
  barCache.set(key, { at: Date.now(), bars });
  if (barCache.size > 60) barCache.delete(barCache.keys().next().value as string);
  return bars;
}

// Backup candle source (no key) when Twelve Data errors or comes back short.
async function yahooBars(s: string, tf: string): Promise<Bar[]> {
  const ysym = s === 'XAUUSD' ? 'GC=F' : s === 'XAGUSD' ? 'SI=F' : /^(BTC|ETH|SOL|XRP|DOGE)USD/.test(s) ? `${s.slice(0, -3)}-USD` : `${s}=X`;
  const interval = tf === '1d' ? '1d' : tf === '1h' || tf === '4h' ? '60m' : tf;
  const range = interval === '1d' ? '5y' : interval === '60m' ? '730d' : '60d';
  const r = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ysym)}?interval=${interval}&range=${range}`,
    { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) return [];
  const res: any = (await r.json())?.chart?.result?.[0]; const q = res?.indicators?.quote?.[0];
  if (!res?.timestamp || !q) return [];
  let out: Bar[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    if ([q.open[i], q.high[i], q.low[i], q.close[i]].some((x) => x == null)) return;
    out.push({ t: t * 1000, o: q.open[i], h: q.high[i], l: q.low[i], c: q.close[i], v: q.volume?.[i] || 0 });
  });
  if (tf === '4h') {
    const m = new Map<number, Bar>();
    for (const x of out) {
      const k = Math.floor(x.t / 14_400_000) * 14_400_000; const g = m.get(k);
      if (!g) m.set(k, { ...x, t: k }); else { g.h = Math.max(g.h, x.h); g.l = Math.min(g.l, x.l); g.c = x.c; g.v += x.v; }
    }
    out = Array.from(m.values()).sort((a, z) => a.t - z.t);
  }
  return out;
}

export async function runWizardBacktest(opts: { strategyId: string; params: Record<string, any>; symbol: string; timeframe: string; period: string; rr?: number; fromTs?: number }): Promise<WizardResult> {
  if (!WIZARD_SUPPORTED.includes(opts.strategyId)) throw new Error('This pattern can\'t be backtested on real candles yet. Pick one of the strategies marked "Real backtest".');
  const days = PERIOD_DAYS[opts.period] || 182;
  const rr = Math.min(Math.max(Number(opts.rr) || 2, 0.5), 5);
  const tf = TF[opts.timeframe] ? opts.timeframe : 'H1';
  const b = await loadBars(opts.symbol, tf, days);
  if (b.length < 60) throw new Error(`Only ${b.length} candles came back for ${opts.symbol} ${tf}. Try a higher timeframe or another pair.`);
  const maxHold = Math.max(10, Math.round(TF[tf].perDay * 2));
  const trades = simulate(b, buildSignals(opts.strategyId, b, opts.params || {}), rr, maxHold, opts.fromTs || 0);
  const notes: string[] = [];
  const coveredDays = (b[b.length - 1].t - b[0].t) / 86_400_000;
  if (coveredDays < days * 0.8) notes.push(`The data source returned ${Math.round(coveredDays)} days of ${tf} candles, not the full ${opts.period}. Use H4 or D1 for longer tests.`);
  if (trades.length < 30 && !opts.fromTs) notes.push(`Only ${trades.length} trades. Under 30 trades the win rate can swing a lot by luck.`);
  notes.push('Entries at the next candle\'s open, stop 1.5 ATR, one trade at a time. Spread and commission are not included, so real results will be a bit lower.');
  return summarize({ strategyId: opts.strategyId, symbol: opts.symbol.toUpperCase(), timeframe: tf, from: new Date(b[0].t).toISOString(), to: new Date(b[b.length - 1].t).toISOString(), bars: b.length, trades, notes });
}

// ── Saved strategies + paper test ──────────────────────────────────────────

let ensured: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(`
CREATE TABLE IF NOT EXISTS user_wizard_strategies (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  name text NOT NULL,
  strategy_id text NOT NULL,
  params jsonb NOT NULL,
  symbol text NOT NULL,
  timeframe text NOT NULL,
  rr real NOT NULL DEFAULT 2,
  backtest jsonb,
  status text NOT NULL DEFAULT 'paper',
  idea_id integer,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_wizard_strategies_user_idx ON user_wizard_strategies (user_id, status);`).then(() => undefined)
      .catch((e) => { ensured = null; throw e; });
  }
  return ensured;
}

const slim = (r: WizardResult) => ({ ...r, trades: r.trades.slice(-50) });

export async function saveWizardStrategy(userId: number, body: any) {
  await ensureTable();
  const bt = await runWizardBacktest({ strategyId: body.strategyId, params: body.params, symbol: body.symbol, timeframe: body.timeframe, period: body.period, rr: body.rr });
  const name = String(body.name || `${body.strategyId} ${bt.symbol} ${bt.timeframe}`).slice(0, 80);
  const { rows } = await pool.query(`INSERT INTO user_wizard_strategies (user_id, name, strategy_id, params, symbol, timeframe, rr, backtest)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [userId, name, body.strategyId, JSON.stringify(body.params || {}), bt.symbol, bt.timeframe, Number(body.rr) || 2, JSON.stringify(slim(bt))]);
  return { id: rows[0].id, name };
}

/** Paper test = the same rules on candles that closed after the strategy was saved. */
async function paperTest(row: any): Promise<WizardResult | null> {
  const since = new Date(row.created_at).getTime();
  const days = Math.min(730, Math.ceil((Date.now() - since) / 86_400_000) + 30); // +30d warm-up for indicators
  const period = days <= 30 ? '1M' : days <= 91 ? '3M' : days <= 182 ? '6M' : days <= 365 ? '1Y' : '2Y';
  try {
    return await runWizardBacktest({ strategyId: row.strategy_id, params: row.params, symbol: row.symbol, timeframe: row.timeframe, period, rr: row.rr, fromTs: since });
  } catch { return null; }
}

function paperVerdict(pt: WizardResult | null) {
  if (!pt) return { ready: false, label: 'Paper test could not load candles right now.' };
  if (pt.trades.length < PAPER_MIN_TRADES) return { ready: false, label: `Paper testing: ${pt.trades.length}/${PAPER_MIN_TRADES} trades so far.` };
  if (pt.totalR <= 0) return { ready: false, label: `Paper test finished: ${pt.totalR}R over ${pt.trades.length} trades. It did not hold up out of sample, so it should not go in the brain.` };
  return { ready: true, label: `Paper test passed: +${pt.totalR}R over ${pt.trades.length} trades (${pt.winRate}% wins). Ready to add to your brain.` };
}

export async function listWizardStrategies(userId: number) {
  await ensureTable();
  const { rows } = await pool.query(`SELECT * FROM user_wizard_strategies WHERE user_id = $1 AND status <> 'retired' ORDER BY created_at DESC LIMIT 20`, [userId]);
  return Promise.all(rows.map(async (r) => {
    const pt = await paperTest(r);
    return { id: r.id, name: r.name, strategyId: r.strategy_id, symbol: r.symbol, timeframe: r.timeframe, rr: r.rr, status: r.status, ideaId: r.idea_id, createdAt: r.created_at,
      backtest: r.backtest ? { totalR: r.backtest.totalR, winRate: r.backtest.winRate, trades: r.backtest.trades?.length ?? 0, profitFactor: r.backtest.profitFactor } : null,
      paper: pt ? { totalR: pt.totalR, winRate: pt.winRate, trades: pt.trades.length, bySession: pt.bySession, byDirection: pt.byDirection, recent: pt.trades.slice(-5) } : null,
      verdict: paperVerdict(pt) };
  }));
}

/**
 * Add a paper-proven strategy to the brain as a FILTER idea (ideas never open
 * trades): the engine's own signals on this pair are kept only in the sessions
 * and direction where the strategy made money, both in the backtest and on paper.
 * It lands in shadow like every other idea; going live stays a manual step.
 */
export async function promoteToBrain(userId: number, id: number) {
  await ensureTable();
  const { rows } = await pool.query(`SELECT * FROM user_wizard_strategies WHERE id = $1 AND user_id = $2`, [id, userId]);
  const row = rows[0]; if (!row) throw new Error('Strategy not found.');
  if (row.idea_id) throw new Error('This strategy is already in your brain.');
  const pt = await paperTest(row); const v = paperVerdict(pt);
  if (!v.ready || !pt) throw new Error(v.label);
  const bt: WizardResult = row.backtest;
  const good = <T extends { r: number; trades: number }>(a: T[], b: T[], key: (x: T) => string) =>
    a.filter((x) => x.r > 0 && x.trades >= 2 && (b.find((y) => key(y) === key(x))?.r ?? 0) >= 0).map(key);
  // Sessions only mean something on intraday candles (H4/D1 bars are stamped at fixed hours).
  const sessions = ['M5', 'M15', 'M30', 'H1'].includes(row.timeframe) ? good(pt.bySession, bt?.bySession || [], (x: any) => x.session) : [];
  const dirs = good(pt.byDirection, bt?.byDirection || [], (x: any) => x.dir);
  const rule = sanitizeRule({ action: 'only', symbols: [row.symbol], sessions: sessions.length < 4 ? sessions : [], directions: dirs.length === 1 ? dirs : [], models: ['engine'] });
  if (!rule || (!rule.sessions.length && !rule.directions.length)) {
    throw new Error('The strategy made money in every session and both directions, so there is no filter to add. It works as is; nothing in the brain would change.');
  }
  const idea = await saveIdea(userId, `${row.name} filter`, rule,
    `From Strategy Wizard: ${row.strategy_id} on ${row.symbol} ${row.timeframe}. Backtest ${bt?.totalR ?? '?'}R, paper test +${pt.totalR}R over ${pt.trades.length} trades.`);
  await pool.query(`UPDATE user_wizard_strategies SET status = 'in_brain', idea_id = $1 WHERE id = $2`, [idea.id, id]);
  return idea;
}

export async function retireWizardStrategy(userId: number, id: number) {
  await ensureTable();
  await pool.query(`UPDATE user_wizard_strategies SET status = 'retired' WHERE id = $1 AND user_id = $2`, [id, userId]);
}

export async function wizardContextText(userId: number): Promise<string> {
  try {
    await ensureTable();
    const { rows } = await pool.query(`SELECT name, symbol, timeframe, status, backtest->>'totalR' AS r, created_at FROM user_wizard_strategies
      WHERE user_id = $1 AND status <> 'retired' ORDER BY created_at DESC LIMIT 8`, [userId]);
    if (!rows.length) return '';
    return `=== STRATEGY WIZARD (saved strategies; paper test = same rules on candles after the save date) ===\n` +
      rows.map((r) => `- ${r.name} (${r.symbol} ${r.timeframe}): backtest ${r.r}R, ${r.status === 'in_brain' ? 'added to brain as a filter' : 'paper testing'} since ${String(r.created_at).slice(0, 10)}`).join('\n') +
      `\nTo add one to the brain the user taps "Add to brain" on the Strategy Wizard page once its paper test passes (${PAPER_MIN_TRADES}+ trades, positive R).`;
  } catch { return ''; }
}
