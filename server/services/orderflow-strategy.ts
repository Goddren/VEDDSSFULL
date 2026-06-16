// ─── Order Flow Strategy Engine ──────────────────────────────────────────────
// Implements institutional Order Flow concepts from OHLCV candles:
//   1. Cumulative Volume Delta (CVD) — running net buy vs sell volume
//   2. Delta Divergence     — price vs CVD moving in opposite directions
//   3. Absorption           — high volume + minimal price movement (passive orders absorbing)
//   4. Volume Imbalance     — 3+ consecutive candles with aligned direction + delta
//
// All signals derived via close-position estimation:
//   buyVol  = vol × (close − low) / (high − low)
//   sellVol = vol × (high − close) / (high − low)
//   delta   = buyVol − sellVol  →  positive = net buying, negative = net selling

import type { CandleData } from '../indicators';

export interface OrderFlowResult {
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;         // 0–100
  reason: string;
  confluences: string[];
  // Raw metrics (for external callers)
  cvd: number;
  cvdTrend: 'rising' | 'falling' | 'flat';
  divergence: boolean;
  divergenceType: 'bullish' | 'bearish' | null;
  absorption: boolean;
  absorptionType: 'buying' | 'selling' | null;
  imbalance: boolean;
  imbalanceType: 'bullish' | 'bearish' | null;
}

function estimateDelta(c: CandleData): number {
  const range = c.h - c.l;
  if (range <= 0) return 0;
  const buyFrac = (c.c - c.l) / range;
  return (buyFrac * 2 - 1) * (c.v || 1);
}

function cvdSeries(candles: CandleData[]): number[] {
  const series: number[] = [];
  let running = 0;
  for (const c of candles) {
    running += estimateDelta(c);
    series.push(running);
  }
  return series;
}

export function computeOrderFlow(candles: CandleData[], lookback = 20): OrderFlowResult {
  const empty: OrderFlowResult = {
    direction: 'NEUTRAL', confidence: 0, reason: 'Insufficient data', confluences: [],
    cvd: 0, cvdTrend: 'flat', divergence: false, divergenceType: null,
    absorption: false, absorptionType: null, imbalance: false, imbalanceType: null,
  };
  if (candles.length < Math.min(lookback, 10)) return empty;

  const recent = candles.slice(-lookback);
  const cvd = cvdSeries(recent);
  const currentCVD = cvd[cvd.length - 1];

  // ── CVD Trend: early half vs late half ──────────────────────────────────────
  const half = Math.floor(recent.length / 2);
  const cvdEarlyAvg = cvd.slice(0, half).reduce((s, v) => s + v, 0) / half;
  const cvdLateAvg  = cvd.slice(half).reduce((s, v) => s + v, 0) / (cvd.length - half);
  const cvdTrend: 'rising' | 'falling' | 'flat' =
    cvdLateAvg > cvdEarlyAvg * 1.03 ? 'rising' :
    cvdLateAvg < cvdEarlyAvg * 0.97 ? 'falling' : 'flat';

  // ── Price Trend: early vs late close prices ──────────────────────────────
  const pricesEarly = recent.slice(0, half).map(c => c.c);
  const pricesLate  = recent.slice(half).map(c => c.c);
  const priceEarlyAvg = pricesEarly.reduce((s, v) => s + v, 0) / pricesEarly.length;
  const priceLateAvg  = pricesLate.reduce((s, v) => s + v, 0) / pricesLate.length;
  const priceTrend =
    priceLateAvg > priceEarlyAvg * 1.0008 ? 'rising' :
    priceLateAvg < priceEarlyAvg * 0.9992 ? 'falling' : 'flat';

  // ── Delta Divergence ─────────────────────────────────────────────────────
  // Bullish: price falling while CVD rising → sellers losing steam, buyers accumulating
  // Bearish: price rising while CVD falling → buyers exhausted, sellers quietly distributing
  let divergence = false;
  let divergenceType: 'bullish' | 'bearish' | null = null;
  if (priceTrend === 'falling' && cvdTrend === 'rising')  { divergence = true; divergenceType = 'bullish'; }
  if (priceTrend === 'rising'  && cvdTrend === 'falling') { divergence = true; divergenceType = 'bearish'; }

  // ── Absorption ────────────────────────────────────────────────────────────
  // High volume over last 3 candles but price barely moved → large passive orders absorbing
  const last3     = recent.slice(-3);
  const avgVol    = recent.reduce((s, c) => s + (c.v || 1), 0) / recent.length;
  const last3Vol  = last3.reduce((s, c) => s + (c.v || 1), 0) / 3;
  const moveRange = Math.abs(last3[2].c - last3[0].o) / Math.max(last3[0].o, 0.000001);
  const isHighVolLowMove = last3Vol > avgVol * 1.4 && moveRange < 0.0012;

  let absorption = false;
  let absorptionType: 'buying' | 'selling' | null = null;
  if (isHighVolLowMove) {
    const last3Delta = last3.reduce((s, c) => s + estimateDelta(c), 0);
    // Positive delta on stuck price = sellers absorbing buyers at resistance
    // Negative delta on stuck price = buyers absorbing sellers at support
    if (last3Delta > 0)  { absorption = true; absorptionType = 'buying'; }
    if (last3Delta < 0)  { absorption = true; absorptionType = 'selling'; }
  }

  // ── Volume Imbalance ─────────────────────────────────────────────────────
  // 3+ consecutive candles in same direction with delta agreeing
  let imbalance = false;
  let imbalanceType: 'bullish' | 'bearish' | null = null;
  const last5 = recent.slice(-5);
  let bullSeq = 0, bearSeq = 0;
  for (const c of last5) {
    const d = estimateDelta(c);
    if (c.c > c.o && d > 0) { bullSeq++; bearSeq = 0; }
    else if (c.c < c.o && d < 0) { bearSeq++; bullSeq = 0; }
    else { bullSeq = 0; bearSeq = 0; }
  }
  if (bullSeq >= 3) { imbalance = true; imbalanceType = 'bullish'; }
  if (bearSeq >= 3) { imbalance = true; imbalanceType = 'bearish'; }

  // ── Score & Direction ────────────────────────────────────────────────────
  let bullScore = 0, bearScore = 0;
  const confluences: string[] = [];

  // CVD trend
  if (cvdTrend === 'rising')  { bullScore += 2; confluences.push('CVD rising — net buyer aggression'); }
  if (cvdTrend === 'falling') { bearScore += 2; confluences.push('CVD falling — net seller aggression'); }

  // Delta divergence (strong signal — 4 pts)
  if (divergence && divergenceType === 'bullish') { bullScore += 4; confluences.push('Bullish delta divergence (price ↓ / CVD ↑)'); }
  if (divergence && divergenceType === 'bearish') { bearScore += 4; confluences.push('Bearish delta divergence (price ↑ / CVD ↓)'); }

  // Absorption
  // Selling absorption = sellers stuck, passive buyers defending → BUY
  // Buying absorption  = buyers stuck, passive sellers defending → SELL
  if (absorption && absorptionType === 'selling') { bullScore += 3; confluences.push('Selling absorption at support (passive buyers defending)'); }
  if (absorption && absorptionType === 'buying')  { bearScore += 3; confluences.push('Buying absorption at resistance (passive sellers defending)'); }

  // Volume imbalance
  if (imbalance && imbalanceType === 'bullish') { bullScore += 3; confluences.push('Bullish volume imbalance (3+ consecutive buying candles)'); }
  if (imbalance && imbalanceType === 'bearish') { bearScore += 3; confluences.push('Bearish volume imbalance (3+ consecutive selling candles)'); }

  const THRESHOLD = 3;
  let direction: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  let confidence = 0;
  let reason = 'No order flow edge detected';

  if (bullScore >= THRESHOLD && bullScore > bearScore) {
    direction  = 'BUY';
    confidence = Math.min(91, 53 + bullScore * 4);
    reason     = confluences.filter(c => /bull|buyer|CVD ris|selling abs/i.test(c)).join(' | ') || 'Bullish order flow';
  } else if (bearScore >= THRESHOLD && bearScore > bullScore) {
    direction  = 'SELL';
    confidence = Math.min(91, 53 + bearScore * 4);
    reason     = confluences.filter(c => /bear|seller|CVD fall|buying abs/i.test(c)).join(' | ') || 'Bearish order flow';
  }

  return {
    direction, confidence, reason, confluences,
    cvd: currentCVD, cvdTrend, divergence, divergenceType,
    absorption, absorptionType, imbalance, imbalanceType,
  };
}
