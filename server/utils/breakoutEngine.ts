export interface BreakoutCandle {
  o: number; h: number; l: number; c: number; v?: number; t?: number;
}

export interface BreakoutStrategyResult {
  name: string;
  fired: boolean;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  reason: string;
  strength: number;
}

export interface BreakoutScoreResult {
  score: number;
  maxScore: number;
  percentage: number;
  grade: 'A' | 'B' | 'C' | 'PASS';
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  strategies: BreakoutStrategyResult[];
  atr: number;
  tp1: number; tp2: number; tp3: number;
  slDistance: number;
  breakoutCandle?: BreakoutCandle;
  summary: string;
}

function calcATR(candles: BreakoutCandle[], period = 14): number {
  if (candles.length < 2) return 0;
  const trs = candles.slice(0, period + 1).map((c, i) => {
    if (i === 0) return c.h - c.l;
    const prev = candles[i - 1];
    return Math.max(c.h - c.l, Math.abs(c.h - prev.c), Math.abs(c.l - prev.c));
  });
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function calcVWAP(candles: BreakoutCandle[]): number {
  let cumPV = 0, cumV = 0;
  for (const c of candles) {
    const tp = (c.h + c.l + c.c) / 3;
    const v = c.v || 1;
    cumPV += tp * v;
    cumV += v;
  }
  return cumV > 0 ? cumPV / cumV : 0;
}

function calcBollingerBands(candles: BreakoutCandle[], period = 20, mult = 2) {
  if (candles.length < period) return null;
  const closes = candles.slice(0, period).map(c => c.c);
  const mean = closes.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(closes.map(c => (c - mean) ** 2).reduce((a, b) => a + b, 0) / period);
  return { upper: mean + mult * stdDev, lower: mean - mult * stdDev, middle: mean, width: 2 * mult * stdDev };
}

// ─── Strategy 1: Asian Range Breakout (ARB) ───────────────────────────────
function asianRangeBreakout(m15Candles: BreakoutCandle[], currentPrice: number): BreakoutStrategyResult {
  const name = 'Asian Range Breakout (ARB)';
  const now = new Date();
  const utcHour = now.getUTCHours();

  const asianCandles = m15Candles.filter((c) => {
    if (!c.t) return false;
    const h = new Date(c.t * 1000).getUTCHours();
    return h >= 0 && h < 7;
  });

  if (asianCandles.length < 4) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'Not enough Asian session candles', strength: 0 };
  }

  const high = Math.max(...asianCandles.map(c => c.h));
  const low = Math.min(...asianCandles.map(c => c.l));
  const range = high - low;

  if (range === 0) return { name, fired: false, direction: 'NEUTRAL', reason: 'Zero range', strength: 0 };

  const threshold = range * 0.15;
  const bullish = currentPrice > high + threshold;
  const bearish = currentPrice < low - threshold;

  if (bullish || bearish) {
    const breakPct = Math.round(((bullish ? currentPrice - high : low - currentPrice) / range) * 100);
    return {
      name, fired: true,
      direction: bullish ? 'BUY' : 'SELL',
      reason: `Price broke Asian ${bullish ? 'high' : 'low'} by ${breakPct}% of range (H:${high.toFixed(5)} L:${low.toFixed(5)})`,
      strength: Math.min(breakPct / 100, 1),
    };
  }
  return { name, fired: false, direction: 'NEUTRAL', reason: `Price within Asian range (${low.toFixed(5)}–${high.toFixed(5)})`, strength: 0 };
}

// ─── Strategy 2: Opening Range Breakout (ORB) ─────────────────────────────
function openingRangeBreakout(m5Candles: BreakoutCandle[], currentPrice: number): BreakoutStrategyResult {
  const name = 'Opening Range Breakout (ORB)';

  const londonCandles = m5Candles.filter((c) => {
    if (!c.t) return false;
    const h = new Date(c.t * 1000).getUTCHours();
    const m = new Date(c.t * 1000).getUTCMinutes();
    return (h === 7 && m >= 0 && m < 30);
  });

  const nyCandles = m5Candles.filter((c) => {
    if (!c.t) return false;
    const h = new Date(c.t * 1000).getUTCHours();
    const m = new Date(c.t * 1000).getUTCMinutes();
    return (h === 13 && m >= 0 && m < 30);
  });

  const openCandles = londonCandles.length >= 3 ? londonCandles : nyCandles.length >= 3 ? nyCandles : [];
  const session = londonCandles.length >= 3 ? 'London' : 'NY';

  if (openCandles.length < 3) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'Not in opening range window', strength: 0 };
  }

  const high = Math.max(...openCandles.map(c => c.h));
  const low = Math.min(...openCandles.map(c => c.l));
  const range = high - low;
  if (range === 0) return { name, fired: false, direction: 'NEUTRAL', reason: 'Zero ORB range', strength: 0 };

  const lastCandle = m5Candles[0];
  const bodySize = Math.abs(lastCandle.c - lastCandle.o);
  const bodyPct = bodySize / (lastCandle.h - lastCandle.l || 1);

  const bullish = lastCandle.c > high && bodyPct > 0.5;
  const bearish = lastCandle.c < low && bodyPct > 0.5;

  if (bullish || bearish) {
    return {
      name, fired: true,
      direction: bullish ? 'BUY' : 'SELL',
      reason: `${session} ORB ${bullish ? 'bullish' : 'bearish'} breakout — body ${Math.round(bodyPct * 100)}% of candle`,
      strength: bodyPct,
    };
  }
  return { name, fired: false, direction: 'NEUTRAL', reason: `Price inside ${session} ORB (${low.toFixed(5)}–${high.toFixed(5)})`, strength: 0 };
}

// ─── Strategy 3: Donchian Channel Breakout ────────────────────────────────
function donchianBreakout(h1Candles: BreakoutCandle[]): BreakoutStrategyResult {
  const name = 'Donchian Channel Breakout';
  if (h1Candles.length < 22) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'Not enough H1 candles for 20-period Donchian', strength: 0 };
  }

  const lookback = h1Candles.slice(1, 21);
  const channelHigh = Math.max(...lookback.map(c => c.h));
  const channelLow = Math.min(...lookback.map(c => c.l));
  const current = h1Candles[0];

  const bullish = current.c > channelHigh;
  const bearish = current.c < channelLow;

  if (bullish || bearish) {
    const breakPips = bullish ? current.c - channelHigh : channelLow - current.c;
    return {
      name, fired: true,
      direction: bullish ? 'BUY' : 'SELL',
      reason: `20-period Donchian ${bullish ? 'high' : 'low'} broken (channel: ${channelLow.toFixed(5)}–${channelHigh.toFixed(5)})`,
      strength: Math.min(breakPips / (channelHigh - channelLow + 0.00001), 1),
    };
  }
  return { name, fired: false, direction: 'NEUTRAL', reason: `Price within Donchian channel (${channelLow.toFixed(5)}–${channelHigh.toFixed(5)})`, strength: 0 };
}

// ─── Strategy 4: Bollinger Band Squeeze Breakout ─────────────────────────
function bollingerSqueeze(h1Candles: BreakoutCandle[]): BreakoutStrategyResult {
  const name = 'Bollinger Band Squeeze';
  if (h1Candles.length < 55) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'Not enough H1 candles for BB squeeze', strength: 0 };
  }

  const currentBB = calcBollingerBands(h1Candles, 20, 2);
  if (!currentBB) return { name, fired: false, direction: 'NEUTRAL', reason: 'BB calculation failed', strength: 0 };

  const widths: number[] = [];
  for (let i = 5; i < 55; i++) {
    const bb = calcBollingerBands(h1Candles.slice(i), 20, 2);
    if (bb) widths.push(bb.width);
  }
  const avgWidth = widths.reduce((a, b) => a + b, 0) / (widths.length || 1);
  const isSqueeze = currentBB.width < avgWidth * 1.5;
  const current = h1Candles[0];

  if (isSqueeze && current.c > currentBB.upper) {
    return { name, fired: true, direction: 'BUY', reason: `BB squeeze breakout: price closed above upper band (width ${(currentBB.width / avgWidth * 100).toFixed(0)}% of avg)`, strength: 0.8 };
  }
  if (isSqueeze && current.c < currentBB.lower) {
    return { name, fired: true, direction: 'SELL', reason: `BB squeeze breakout: price closed below lower band (width ${(currentBB.width / avgWidth * 100).toFixed(0)}% of avg)`, strength: 0.8 };
  }
  if (!isSqueeze) {
    return { name, fired: false, direction: 'NEUTRAL', reason: `No BB squeeze (width ${(currentBB.width / avgWidth * 100).toFixed(0)}% of avg — need <150%)`, strength: 0 };
  }
  return { name, fired: false, direction: 'NEUTRAL', reason: 'BB squeeze detected but no breakout yet', strength: 0 };
}

// ─── Strategy 5: Supply / Demand Zone Break (with retest confirmation) ────
function supplyDemandBreak(h4Candles: BreakoutCandle[], currentPrice: number): BreakoutStrategyResult {
  const name = 'Supply/Demand Zone Break';
  if (h4Candles.length < 20) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'Not enough H4 candles for zone detection', strength: 0 };
  }

  let bestDemandZoneTop = 0;
  let bestSupplyZoneBottom = Infinity;

  for (let i = 3; i < Math.min(h4Candles.length - 3, 30); i++) {
    const base = h4Candles.slice(i, i + 3);
    const baseHigh = Math.max(...base.map(c => c.h));
    const baseLow = Math.min(...base.map(c => c.l));
    const baseRange = baseHigh - baseLow;
    const before = h4Candles[i + 3];
    const breakout = h4Candles[i - 1];
    if (!before || !breakout) continue;
    const impulse = Math.abs(breakout.c - before.c);
    if (impulse > baseRange * 2) {
      if (breakout.c > before.c) {
        if (baseHigh > bestDemandZoneTop) { bestDemandZoneTop = baseHigh; }
      } else {
        if (baseLow < bestSupplyZoneBottom) { bestSupplyZoneBottom = baseLow; }
      }
    }
  }

  // BUY: price has broken above demand zone top AND retested (price dipped back near zone before current candle)
  if (bestDemandZoneTop > 0 && currentPrice > bestDemandZoneTop) {
    const retest = h4Candles.slice(1, 5).some(c => c.l <= bestDemandZoneTop && c.c > bestDemandZoneTop);
    const breakPct = Math.round(((currentPrice - bestDemandZoneTop) / bestDemandZoneTop) * 10000);
    if (retest) {
      return { name, fired: true, direction: 'BUY', reason: `Demand zone broken & retested: ${breakPct}bps above zone (${bestDemandZoneTop.toFixed(5)}) — institutional demand confirmed`, strength: 0.85 };
    }
    return { name, fired: true, direction: 'BUY', reason: `Demand zone broken: price ${breakPct}bps above zone top (${bestDemandZoneTop.toFixed(5)}) — pending retest`, strength: 0.65 };
  }
  // SELL: price has broken below supply zone bottom AND retested
  if (bestSupplyZoneBottom < Infinity && currentPrice < bestSupplyZoneBottom) {
    const retest = h4Candles.slice(1, 5).some(c => c.h >= bestSupplyZoneBottom && c.c < bestSupplyZoneBottom);
    const breakPct = Math.round(((bestSupplyZoneBottom - currentPrice) / bestSupplyZoneBottom) * 10000);
    if (retest) {
      return { name, fired: true, direction: 'SELL', reason: `Supply zone broken & retested: ${breakPct}bps below zone (${bestSupplyZoneBottom.toFixed(5)}) — institutional supply confirmed`, strength: 0.85 };
    }
    return { name, fired: true, direction: 'SELL', reason: `Supply zone broken: price ${breakPct}bps below zone bottom (${bestSupplyZoneBottom.toFixed(5)}) — pending retest`, strength: 0.65 };
  }

  return { name, fired: false, direction: 'NEUTRAL', reason: 'Price within supply/demand zones — no confirmed break', strength: 0 };
}

// ─── Strategy 6: ICT BOS/CHOCH + LTF FVG Entry (using smcUtils logic) ────
function ictStructuralBreak(
  h1Candles: BreakoutCandle[],
  m15Candles: BreakoutCandle[],
  currentPrice: number
): BreakoutStrategyResult {
  const name = 'ICT Structural Break + FVG';
  if (h1Candles.length < 10 || m15Candles.length < 6) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'Not enough candles for structural analysis', strength: 0 };
  }

  // BOS detection: same logic as smcUtils.detectBOSCHOCH
  // Bullish BOS = price closes above previous swing high (breaking prior internal high)
  // Bearish BOS = price closes below previous swing low (breaking prior internal low)
  let bullishBOS = false;
  let bearishBOS = false;
  const lookback = h1Candles.slice(0, Math.min(20, h1Candles.length));
  // Find swing highs and lows in lookback
  for (let i = 2; i < lookback.length - 2; i++) {
    const isSwingHigh = lookback[i].h > lookback[i - 1].h && lookback[i].h > lookback[i + 1].h;
    const isSwingLow = lookback[i].l < lookback[i - 1].l && lookback[i].l < lookback[i + 1].l;
    if (isSwingHigh && lookback[0].c > lookback[i].h) bullishBOS = true;
    if (isSwingLow && lookback[0].c < lookback[i].l) bearishBOS = true;
  }

  // FVG detection in M15 (Fair Value Gap = 3-candle imbalance)
  let inBullFVG = false;
  let inBearFVG = false;
  for (let i = 1; i < Math.min(m15Candles.length - 1, 15); i++) {
    const prev2 = m15Candles[i + 1];
    const next = m15Candles[i - 1];
    // Bullish FVG: prev2.h < next.l (gap between top of candle -2 and bottom of candle 0)
    if (prev2.h < next.l && currentPrice >= prev2.h && currentPrice <= next.l) inBullFVG = true;
    // Bearish FVG: prev2.l > next.h
    if (prev2.l > next.h && currentPrice <= prev2.l && currentPrice >= next.h) inBearFVG = true;
  }

  if (bullishBOS && inBullFVG) {
    return { name, fired: true, direction: 'BUY', reason: 'H1 BOS (break of prior swing high) + price trading in M15 bullish FVG — ICT institutional entry zone', strength: 0.9 };
  }
  if (bearishBOS && inBearFVG) {
    return { name, fired: true, direction: 'SELL', reason: 'H1 BOS (break of prior swing low) + price trading in M15 bearish FVG — ICT institutional distribution zone', strength: 0.9 };
  }
  if (bullishBOS) return { name, fired: false, direction: 'NEUTRAL', reason: 'H1 bullish BOS confirmed — no M15 FVG entry yet', strength: 0 };
  if (bearishBOS) return { name, fired: false, direction: 'NEUTRAL', reason: 'H1 bearish BOS confirmed — no M15 FVG entry yet', strength: 0 };
  return { name, fired: false, direction: 'NEUTRAL', reason: 'No H1 BOS/CHOCH detected in recent 20 candles', strength: 0 };
}

// ─── Strategy 7: VWAP + Volume Surge ─────────────────────────────────────
function vwapVolumeSurge(m5Candles: BreakoutCandle[], currentPrice: number): BreakoutStrategyResult {
  const name = 'VWAP + Volume Surge';
  if (m5Candles.length < 12) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'Not enough M5 candles for VWAP', strength: 0 };
  }

  const vwap = calcVWAP(m5Candles.slice(0, 78));
  const volLookback = m5Candles.slice(1, 11).map(c => c.v || 0);
  const avgVol = volLookback.reduce((a, b) => a + b, 0) / (volLookback.length || 1);
  const currentVol = m5Candles[0].v || 0;
  const volSurge = avgVol > 0 && currentVol > avgVol * 1.5;

  if (!volSurge) {
    const ratio = avgVol > 0 ? Math.round((currentVol / avgVol) * 100) : 0;
    return { name, fired: false, direction: 'NEUTRAL', reason: `Volume not surging (${ratio}% of avg — need 150%+)`, strength: 0 };
  }

  const bullish = currentPrice > vwap;
  const bearish = currentPrice < vwap;

  if (bullish || bearish) {
    const pct = Math.round((currentVol / avgVol) * 100);
    return {
      name, fired: true,
      direction: bullish ? 'BUY' : 'SELL',
      reason: `Price ${bullish ? 'above' : 'below'} VWAP (${vwap.toFixed(5)}) with ${pct}% volume surge`,
      strength: Math.min(pct / 300, 1),
    };
  }
  return { name, fired: false, direction: 'NEUTRAL', reason: 'Price at VWAP equilibrium', strength: 0 };
}

// ─── Master Score Function ─────────────────────────────────────────────────
export function computeBreakoutScore(
  currentPrice: number,
  m1Candles: BreakoutCandle[] = [],
  m5Candles: BreakoutCandle[] = [],
  m15Candles: BreakoutCandle[] = [],
  h1Candles: BreakoutCandle[] = [],
  h4Candles: BreakoutCandle[] = [],
): BreakoutScoreResult {
  const strategies: BreakoutStrategyResult[] = [
    asianRangeBreakout(m15Candles, currentPrice),
    openingRangeBreakout(m5Candles, currentPrice),
    donchianBreakout(h1Candles),
    bollingerSqueeze(h1Candles),
    supplyDemandBreak(h4Candles, currentPrice),
    ictStructuralBreak(h1Candles, m15Candles, currentPrice),
    vwapVolumeSurge(m5Candles, currentPrice),
  ];

  const fired = strategies.filter(s => s.fired);
  const score = fired.length;
  const maxScore = 7;
  const percentage = Math.round((score / maxScore) * 100);

  let grade: 'A' | 'B' | 'C' | 'PASS';
  if (percentage >= 70) grade = 'A';
  else if (percentage >= 50) grade = 'B';
  else if (percentage >= 35) grade = 'C';
  else grade = 'PASS';

  const buyVotes = fired.filter(s => s.direction === 'BUY').length;
  const sellVotes = fired.filter(s => s.direction === 'SELL').length;
  const direction: 'BUY' | 'SELL' | 'NEUTRAL' =
    buyVotes > sellVotes ? 'BUY' : sellVotes > buyVotes ? 'SELL' : 'NEUTRAL';

  const allCandles = [...h1Candles, ...m15Candles, ...m5Candles];
  const atr = calcATR(allCandles.length > 14 ? allCandles : h1Candles, 14);
  const sign = direction === 'BUY' ? 1 : -1;
  const tp1 = currentPrice + sign * atr;
  const tp2 = currentPrice + sign * atr * 2;
  const tp3 = currentPrice + sign * atr * 3;

  const breakoutCandle = [...m15Candles, ...h1Candles][0];
  const slDistance = atr * 1.5;

  const summary = `Breakout Score: ${score}/${maxScore} (${percentage}%) — Grade ${grade} — ${direction}\n` +
    strategies.map(s => `${s.fired ? '✅' : '❌'} ${s.name}: ${s.reason}`).join('\n');

  return { score, maxScore, percentage, grade, direction, strategies, atr, tp1, tp2, tp3, slDistance, breakoutCandle, summary };
}
