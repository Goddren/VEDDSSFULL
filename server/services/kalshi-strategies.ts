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

export type KalshiStrategy = 'momentum' | 'volume_profile' | 'markov';

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

  if (price > VAH) {
    direction = 'BUY';
    const dist = (price - VAH) / binSize; // bins above value area
    confidence = clamp(Math.round(58 + dist * 8 + (volConfirm ? 8 : 0)), 50, 90);
    reason = `VP breakout: price $${price.toFixed(0)} above value-area-high $${VAH.toFixed(0)} (POC $${pocPrice.toFixed(0)})${volConfirm ? ', volume rising' : ''}`;
  } else if (price < VAL) {
    direction = 'SELL';
    const dist = (VAL - price) / binSize;
    confidence = clamp(Math.round(58 + dist * 8 + (volConfirm ? 8 : 0)), 50, 90);
    reason = `VP breakdown: price $${price.toFixed(0)} below value-area-low $${VAL.toFixed(0)} (POC $${pocPrice.toFixed(0)})${volConfirm ? ', volume rising' : ''}`;
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

  if (pU > pD && pU >= 0.4) {
    direction = 'BUY';
    confidence = clamp(Math.round(pU * 100), 50, 92);
  } else if (pD > pU && pD >= 0.4) {
    direction = 'SELL';
    confidence = clamp(Math.round(pD * 100), 50, 92);
  } else {
    direction = 'NEUTRAL';
    confidence = clamp(Math.round(Math.max(pU, pD) * 100), 40, 60);
  }

  const reason = `Markov from '${cur}' state: P(up)=${(pU * 100).toFixed(0)}%, P(down)=${(pD * 100).toFixed(0)}% (${rowSum} samples)`;
  return { direction, confidence, currentPrice: price, priceChange1h, reason, strategy: 'markov' };
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
  return strategy === 'volume_profile' ? volumeProfileSignal(candles) : markovSignal(candles);
}
