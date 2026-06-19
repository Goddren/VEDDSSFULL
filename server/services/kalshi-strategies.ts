/**
 * Kalshi Auto-Trade Strategies
 *
 * Pluggable signal generators for the Kalshi BTC engine. Each returns a
 * normalized TradeSignal the engine uses to pick a bracket and place a trade.
 *
 *  - momentum:       RSI/MACD/EMA score (the original BTC 5-min predictor)
 *  - volume_profile: VPVR — Point of Control / Value Area breakout logic
 *  - markov:         next-state probability from a candle-direction transition matrix
 */

import { getBTC5MinPrediction, getBTCCandles, type BTC5MinCandle } from './btc-5min-predictor';
import { computeOrderFlow } from './orderflow-strategy';

export type KalshiStrategy = 'momentum' | 'volume_profile' | 'markov' | 'order_flow' | 'ensemble';

export interface TradeSignal {
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;      // 0–100
  currentPrice: number;
  priceChange1h: number;   // % over last ~12 candles
  reason: string;
  strategy: KalshiStrategy;
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

function pct1h(candles: BTC5MinCandle[]): number {
  if (candles.length < 13) return 0;
  const last = candles[candles.length - 1].close;
  const prev = candles[candles.length - 13].close;
  return ((last - prev) / prev) * 100;
}

// ── Volume Profile (VPVR) ───────────────────────────────────────────────────────
// Builds a volume-by-price histogram over the recent window, finds the Point of
// Control (POC) and the 70% Value Area (VAL..VAH). Price breaking above the value
// area = bullish acceptance (BUY); below = bearish (SELL); inside = no edge.

export function volumeProfileSignal(candles: BTC5MinCandle[]): TradeSignal {
  const price = candles[candles.length - 1].close;
  const priceChange1h = pct1h(candles);
  const window = candles.slice(-60); // ~5h of 5-min candles

  const hi = Math.max(...window.map(c => c.high));
  const lo = Math.min(...window.map(c => c.low));
  const bins = 24;
  const binSize = (hi - lo) / bins || 1;

  const vol = new Array(bins).fill(0);
  for (const c of window) {
    const tp = (c.high + c.low + c.close) / 3; // typical price
    let idx = Math.floor((tp - lo) / binSize);
    idx = clamp(idx, 0, bins - 1);
    vol[idx] += c.volume;
  }

  const totalVol = vol.reduce((a, b) => a + b, 0) || 1;
  let pocIdx = 0;
  for (let i = 1; i < bins; i++) if (vol[i] > vol[pocIdx]) pocIdx = i;
  const pocPrice = lo + (pocIdx + 0.5) * binSize;

  // Expand from POC outward until 70% of volume is enclosed → Value Area
  let included = vol[pocIdx];
  let loIdx = pocIdx, hiIdx = pocIdx;
  while (included < totalVol * 0.7 && (loIdx > 0 || hiIdx < bins - 1)) {
    const down = loIdx > 0 ? vol[loIdx - 1] : -1;
    const up = hiIdx < bins - 1 ? vol[hiIdx + 1] : -1;
    if (up >= down) { hiIdx++; included += vol[hiIdx]; }
    else { loIdx--; included += vol[loIdx]; }
  }
  const VAL = lo + loIdx * binSize;
  const VAH = lo + (hiIdx + 1) * binSize;

  // Volume confirmation: recent 3-candle vol vs window average
  const avgVol = totalVol / window.length;
  const recentVol = window.slice(-3).reduce((s, c) => s + c.volume, 0) / 3;
  const volConfirm = recentVol > avgVol;

  let direction: TradeSignal['direction'] = 'NEUTRAL';
  let confidence = 50;
  let reason: string;

  // Require volume confirmation on the breakout — VA breakouts on falling volume
  // routinely fail back into the range (a key source of false Kalshi entries).
  if (price > VAH && volConfirm) {
    direction = 'BUY';
    const dist = (price - VAH) / binSize; // bins above value area
    confidence = clamp(Math.round(60 + dist * 8), 55, 90);
    reason = `VP breakout: price $${price.toFixed(0)} above value-area-high $${VAH.toFixed(0)} (POC $${pocPrice.toFixed(0)}), volume confirming`;
  } else if (price < VAL && volConfirm) {
    direction = 'SELL';
    const dist = (VAL - price) / binSize;
    confidence = clamp(Math.round(60 + dist * 8), 55, 90);
    reason = `VP breakdown: price $${price.toFixed(0)} below value-area-low $${VAL.toFixed(0)} (POC $${pocPrice.toFixed(0)}), volume confirming`;
  } else if (price > VAH || price < VAL) {
    direction = 'NEUTRAL';
    confidence = 48;
    reason = `VP: price outside value area but volume NOT confirming — likely false breakout, skip`;
  } else {
    direction = 'NEUTRAL';
    confidence = 45;
    reason = `VP: price $${price.toFixed(0)} inside value area $${VAL.toFixed(0)}–$${VAH.toFixed(0)} (POC $${pocPrice.toFixed(0)}) — no breakout edge`;
  }

  return { direction, confidence, currentPrice: price, priceChange1h, reason, strategy: 'volume_profile' };
}

// ── Markov chain ────────────────────────────────────────────────────────────────
// Classifies each candle as Up / Down / Flat, builds a 3×3 transition matrix from
// the recent window, then reads the next-state probabilities for the current state.

export function markovSignal(candles: BTC5MinCandle[]): TradeSignal {
  const price = candles[candles.length - 1].close;
  const priceChange1h = pct1h(candles);
  const window = candles.slice(-80);

  const FLAT = 0.0004; // ±0.04% per-candle move counts as "flat"
  type S = 'U' | 'D' | 'F';
  const states: S[] = window.map(c => {
    const ch = (c.close - c.open) / c.open;
    return ch > FLAT ? 'U' : ch < -FLAT ? 'D' : 'F';
  });

  const idx: Record<S, number> = { U: 0, D: 1, F: 2 };
  const M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 1; i < states.length; i++) M[idx[states[i - 1]]][idx[states[i]]]++;

  const cur = states[states.length - 1];
  const row = M[idx[cur]];
  const rowSum = row[0] + row[1] + row[2] || 1;
  const pU = row[0] / rowSum;
  const pD = row[1] / rowSum;

  let direction: TradeSignal['direction'] = 'NEUTRAL';
  let confidence = 50;

  // Require a REAL edge: ≥55% next-state probability AND a clear ≥12pt margin over
  // the opposite direction, on enough samples. (Was 40% — that fired BUY when the
  // up-probability was below a coin-flip, a direct cause of Kalshi losses.)
  const MIN_PROB = 0.55;
  const MIN_MARGIN = 0.12;
  const enoughSamples = rowSum >= 8;
  if (enoughSamples && pU >= MIN_PROB && (pU - pD) >= MIN_MARGIN) {
    direction = 'BUY';
    confidence = clamp(Math.round(pU * 100), 55, 92);
  } else if (enoughSamples && pD >= MIN_PROB && (pD - pU) >= MIN_MARGIN) {
    direction = 'SELL';
    confidence = clamp(Math.round(pD * 100), 55, 92);
  } else {
    direction = 'NEUTRAL';
    confidence = clamp(Math.round(Math.max(pU, pD) * 100), 40, 54);
  }

  const reason = `Markov from '${cur}' state: P(up)=${(pU * 100).toFixed(0)}%, P(down)=${(pD * 100).toFixed(0)}% (${rowSum} samples)`;
  return { direction, confidence, currentPrice: price, priceChange1h, reason, strategy: 'markov' };
}

// ── Order Flow ──────────────────────────────────────────────────────────────────
// Uses CVD (Cumulative Volume Delta), delta divergence, absorption, and volume
// imbalance on BTC 5-min candles to detect institutional positioning before price moves.

export function orderFlowSignal(candles: BTC5MinCandle[]): TradeSignal {
  const price = candles[candles.length - 1].close;
  const priceChange1h = pct1h(candles);

  // Convert BTC5MinCandle → CandleData format expected by computeOrderFlow
  const cdCandles = candles.map(c => ({ o: c.open, h: c.high, l: c.low, c: c.close, v: c.volume }));
  const of = computeOrderFlow(cdCandles, Math.min(30, cdCandles.length));

  if (of.direction === 'NEUTRAL') {
    return { direction: 'NEUTRAL', confidence: 45, currentPrice: price, priceChange1h, reason: 'Order flow neutral — no CVD divergence or imbalance detected', strategy: 'order_flow' };
  }

  return {
    direction: of.direction,
    confidence: of.confidence,
    currentPrice: price,
    priceChange1h,
    reason: of.reason,
    strategy: 'order_flow',
  };
}

// ── Ensemble (multi-factor confluence + regime filter) ───────────────────────────
// Highest-accuracy strategy. Inspired by gradient-boosting feature engineering
// (github.com/cbyn/bitpredict — buyer/seller aggression, price-trend slope, multi-
// window momentum) plus classic EMA/RSI/MACD confluence. It only fires when MULTIPLE
// independent factors agree AND the market is in a trending (non-chop) regime — the
// regime filter is the key win-rate lever, since most losses come from chop.

function ema(values: number[], period: number): number {
  if (!values.length) return 0;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}
function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  const rs = loss === 0 ? 100 : gain / loss;
  return 100 - 100 / (1 + rs);
}
function macdHist(closes: number[]): number {
  if (closes.length < 26) return 0;
  const emaArr = (vals: number[], p: number) => { const k = 2 / (p + 1); let e = vals[0]; const out = [e]; for (let i = 1; i < vals.length; i++) { e = vals[i] * k + e * (1 - k); out.push(e); } return out; };
  const e12 = emaArr(closes, 12), e26 = emaArr(closes, 26);
  const macdLine = closes.map((_, i) => e12[i] - e26[i]);
  const signal = emaArr(macdLine.slice(-9), 9);
  return macdLine[macdLine.length - 1] - signal[signal.length - 1];
}
function linregSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xs = values.map((_, i) => i);
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (values[i] - my); den += (xs[i] - mx) ** 2; }
  return den === 0 ? 0 : num / den;
}

export function ensembleSignal(candles: BTC5MinCandle[]): TradeSignal {
  const price = candles[candles.length - 1].close;
  const priceChange1h = pct1h(candles);
  if (candles.length < 30) {
    return { direction: 'NEUTRAL', confidence: 0, currentPrice: price, priceChange1h, reason: 'Not enough candles for ensemble', strategy: 'ensemble' };
  }
  const closes = candles.map(c => c.close);
  const recent = candles.slice(-30);

  // 1. Trend filter — EMA stack
  const ema9 = ema(closes.slice(-40), 9);
  const ema21 = ema(closes.slice(-60), 21);
  const ema50 = ema(closes.slice(-80), 50);
  const trendUp = ema9 > ema21 && ema21 > ema50 && price > ema50;
  const trendDn = ema9 < ema21 && ema21 < ema50 && price < ema50;

  // 2. Momentum — RSI + MACD histogram
  const r = rsi(closes);
  const mh = macdHist(closes);

  // 3. Buyer/seller aggression (bitpredict-style) — close position within range, volume-weighted
  let aggr = 0, volSum = 0;
  for (const c of recent.slice(-12)) {
    const range = c.high - c.low;
    if (range <= 0) continue;
    aggr += ((c.close - c.low) / range * 2 - 1) * c.volume;
    volSum += c.volume;
  }
  const aggrNorm = volSum > 0 ? aggr / volSum : 0; // -1..+1

  // 4. Price-trend slope (normalised to price)
  const slope = linregSlope(closes.slice(-12)) / price;

  // 5. Regime filter — is the market actually trending or chopping?
  //    Use stdev of the last 20 returns vs the EMA spread. Tight EMAs + low directional
  //    movement = chop → skip. This is the biggest accuracy lever.
  const emaSpreadPct = Math.abs(ema9 - ema50) / price * 100;
  const rets = recent.slice(-20).map((c, i, a) => i === 0 ? 0 : (c.close - a[i - 1].close) / a[i - 1].close);
  const meanRet = rets.reduce((a, b) => a + b, 0) / rets.length;
  const directionalness = Math.abs(meanRet) / (Math.sqrt(rets.reduce((s, x) => s + (x - meanRet) ** 2, 0) / rets.length) || 1e-9);
  const choppy = emaSpreadPct < 0.06 && directionalness < 0.25;

  if (choppy) {
    return { direction: 'NEUTRAL', confidence: 40, currentPrice: price, priceChange1h, reason: `Ensemble: choppy/ranging regime (EMA spread ${emaSpreadPct.toFixed(3)}%, low directionalness) — standing aside`, strategy: 'ensemble' };
  }

  // Score the factors (each ±1)
  let bull = 0, bear = 0;
  const notes: string[] = [];
  if (trendUp) { bull++; notes.push('EMA stack up'); } else if (trendDn) { bear++; notes.push('EMA stack down'); }
  if (mh > 0) bull++; else if (mh < 0) bear++;
  if (r > 50 && r < 72) { bull++; notes.push(`RSI ${r.toFixed(0)}`); } else if (r < 50 && r > 28) { bear++; notes.push(`RSI ${r.toFixed(0)}`); }
  if (aggrNorm > 0.1) { bull++; notes.push('buyer aggression'); } else if (aggrNorm < -0.1) { bear++; notes.push('seller aggression'); }
  if (slope > 0) bull++; else if (slope < 0) bear++;

  const total = bull + bear;
  let direction: TradeSignal['direction'] = 'NEUTRAL';
  let confidence = 50;
  // Require a clear ≥4/5 majority for a high-confidence ensemble signal
  if (bull >= 4 && bull > bear) { direction = 'BUY'; confidence = clamp(60 + bull * 6, 60, 92); }
  else if (bear >= 4 && bear > bull) { direction = 'SELL'; confidence = clamp(60 + bear * 6, 60, 92); }
  else { direction = 'NEUTRAL'; confidence = clamp(45 + Math.max(bull, bear) * 3, 40, 58); }

  const reason = `Ensemble ${direction}: ${Math.max(bull, bear)}/5 factors agree (${notes.join(', ')}). Trending regime confirmed.`;
  return { direction, confidence, currentPrice: price, priceChange1h, reason, strategy: 'ensemble' };
}

// ── Unified signal entry point ──────────────────────────────────────────────────

export async function getKalshiSignal(strategy: KalshiStrategy): Promise<TradeSignal> {
  if (strategy === 'momentum') {
    const p = await getBTC5MinPrediction();
    return {
      direction: p.direction,
      confidence: p.confidence,
      currentPrice: p.currentPrice,
      priceChange1h: p.priceChange1h,
      reason: p.reasons?.[0] ?? 'Momentum (RSI/MACD/EMA) signal',
      strategy: 'momentum',
    };
  }

  const { candles } = await getBTCCandles(100);
  if (!candles.length) {
    return { direction: 'NEUTRAL', confidence: 0, currentPrice: 0, priceChange1h: 0, reason: 'No candle data available', strategy };
  }
  if (strategy === 'volume_profile') return volumeProfileSignal(candles);
  if (strategy === 'order_flow')    return orderFlowSignal(candles);
  if (strategy === 'ensemble')      return ensembleSignal(candles);
  return markovSignal(candles);
}

// ── Consensus across ALL strategies ──────────────────────────────────────────────
// Runs every strategy on the same candle set and blends them into one view.
// Consensus = the direction the majority (weighted by confidence) agrees on.
// agreement = share of strategies (by confidence weight) pointing the consensus way.

export interface KalshiConsensus {
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;      // 0–100 blended confidence of the agreeing side
  agreement: number;       // 0–1 share of weight agreeing
  currentPrice: number;
  priceChange1h: number;
  signals: TradeSignal[];  // each strategy's raw signal
  reasons: string[];       // human-readable per-strategy summaries
}

/** Hourly volatility (std-dev of 5-min returns scaled to 1h) as a price fraction. */
export function estimateHourlyVol(candles: BTC5MinCandle[]): number {
  if (candles.length < 13) return 0.004; // ~0.4% fallback
  const rets: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const prev = candles[i - 1].close;
    if (prev > 0) rets.push((candles[i].close - prev) / prev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, b) => a + (b - mean) ** 2, 0) / rets.length;
  const perCandle = Math.sqrt(variance);
  return perCandle * Math.sqrt(12); // 12 five-min candles per hour
}

export async function getKalshiConsensus(): Promise<KalshiConsensus> {
  const { candles } = await getBTCCandles(100);
  if (!candles.length) {
    return { direction: 'NEUTRAL', confidence: 0, agreement: 0, currentPrice: 0, priceChange1h: 0, signals: [], reasons: ['No candle data'] };
  }

  const momentumPred = await getBTC5MinPrediction().catch(() => null);
  const signals: TradeSignal[] = [];
  if (momentumPred) {
    signals.push({
      direction: momentumPred.direction,
      confidence: momentumPred.confidence,
      currentPrice: momentumPred.currentPrice,
      priceChange1h: momentumPred.priceChange1h,
      reason: momentumPred.reasons?.[0] ?? 'Momentum signal',
      strategy: 'momentum',
    });
  }
  signals.push(volumeProfileSignal(candles));
  signals.push(markovSignal(candles));
  signals.push(orderFlowSignal(candles));
  signals.push(ensembleSignal(candles));

  const price = candles[candles.length - 1].close;
  const priceChange1h = pct1h(candles);

  // Weighted vote: each non-neutral strategy contributes its confidence to its side
  let buyWeight = 0, sellWeight = 0;
  for (const sig of signals) {
    if (sig.direction === 'BUY')  buyWeight  += sig.confidence;
    if (sig.direction === 'SELL') sellWeight += sig.confidence;
  }
  const totalWeight = buyWeight + sellWeight;
  let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 0;
  let agreement = 0;

  if (totalWeight > 0) {
    if (buyWeight > sellWeight) {
      direction = 'BUY';
      agreement = buyWeight / totalWeight;
      const buyers = signals.filter(s => s.direction === 'BUY');
      confidence = Math.round(buyers.reduce((a, b) => a + b.confidence, 0) / buyers.length);
    } else if (sellWeight > buyWeight) {
      direction = 'SELL';
      agreement = sellWeight / totalWeight;
      const sellers = signals.filter(s => s.direction === 'SELL');
      confidence = Math.round(sellers.reduce((a, b) => a + b.confidence, 0) / sellers.length);
    }
  }

  const reasons = signals.map(s => `${s.strategy}: ${s.direction} ${s.confidence}%`);
  return { direction, confidence, agreement, currentPrice: price, priceChange1h, signals, reasons };
}
