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
  alignedVotes: number;
  alignedPct: number;
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

/** Get the UTC date string (YYYY-MM-DD) for a candle's timestamp */
function candleDateKey(c: BreakoutCandle): string | null {
  if (!c.t) return null;
  const d = new Date(c.t * 1000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// ─── Strategy 1: Asian Range Breakout (ARB) — date-bounded ────────────────
function asianRangeBreakout(m15Candles: BreakoutCandle[], currentPrice: number): BreakoutStrategyResult {
  const name = 'Asian Range Breakout (ARB)';
  if (m15Candles.length === 0) {
    return { name, fired: false, direction: 'NEUTRAL', reason: 'No M15 candles supplied', strength: 0 };
  }

  // Determine reference day from the most recent candle
  const refDate = candleDateKey(m15Candles[0]);
  if (!refDate) return { name, fired: false, direction: 'NEUTRAL', reason: 'No timestamp on candles', strength: 0 };

  // For current-day Asian session: same date, 00:00–07:00 UTC
  // Candles are newest-first, so check today and yesterday (Asian session may be previous calendar day)
  const prevDate = new Date(m15Candles[0].t! * 1000);
  prevDate.setUTCDate(prevDate.getUTCDate() - 1);
  const prevDateKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, '0')}-${String(prevDate.getUTCDate()).padStart(2, '0')}`;

  const asianCandles = m15Candles.filter((c) => {
    if (!c.t) return false;
    const d = new Date(c.t * 1000);
    const dk = candleDateKey(c);
    const h = d.getUTCHours();
    return (dk === refDate || dk === prevDateKey) && h >= 0 && h < 7;
  });

  if (asianCandles.length < 4) {
    return { name, fired: false, direction: 'NEUTRAL', reason: `Only ${asianCandles.length} Asian session candles on ${refDate}/${prevDateKey} (need 4+)`, strength: 0 };
  }

  const high = Math.max(...asianCandles.map(c => c.h));
  const low = Math.min(...asianCandles.map(c => c.l));
  const range = high - low;
  if (range === 0) return { name, fired: false, direction: 'NEUTRAL', reason: 'Zero Asian range', strength: 0 };

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

// ─── Strategy 2: Opening Range Breakout (ORB) — date-bounded + body vs ORB range ──
function openingRangeBreakout(m5Candles: BreakoutCandle[], currentPrice: number): BreakoutStrategyResult {
  const name = 'Opening Range Breakout (ORB)';
  if (m5Candles.length === 0) return { name, fired: false, direction: 'NEUTRAL', reason: 'No M5 candles', strength: 0 };

  // Reference day: most recent candle
  const refDate = candleDateKey(m5Candles[0]);
  if (!refDate) return { name, fired: false, direction: 'NEUTRAL', reason: 'No timestamp on M5 candles', strength: 0 };

  // Date-scoped session filter helper
  const sessionFilter = (c: BreakoutCandle, startH: number, startM: number, endH: number, endM: number) => {
    if (!c.t) return false;
    const d = new Date(c.t * 1000);
    if (candleDateKey(c) !== refDate) return false;
    const mins = d.getUTCHours() * 60 + d.getUTCMinutes();
    return mins >= startH * 60 + startM && mins < endH * 60 + endM;
  };

  // London open: 07:00–07:30 UTC; NY open: 13:00–13:30 UTC
  const londonCandles = m5Candles.filter(c => sessionFilter(c, 7, 0, 7, 30));
  const nyCandles = m5Candles.filter(c => sessionFilter(c, 13, 0, 13, 30));

  const openCandles = londonCandles.length >= 3 ? londonCandles : nyCandles.length >= 3 ? nyCandles : [];
  const session = londonCandles.length >= 3 ? 'London' : 'NY';

  if (openCandles.length < 3) {
    return { name, fired: false, direction: 'NEUTRAL', reason: `No ${session} opening range window on ${refDate}`, strength: 0 };
  }

  const high = Math.max(...openCandles.map(c => c.h));
  const low = Math.min(...openCandles.map(c => c.l));
  const range = high - low;
  if (range === 0) return { name, fired: false, direction: 'NEUTRAL', reason: 'Zero ORB range', strength: 0 };

  const lastCandle = m5Candles[0];
  const bodySize = Math.abs(lastCandle.c - lastCandle.o);
  // Body must be > 50% of the OPENING RANGE (not the breakout candle's own H-L)
  const bodyVsORBPct = bodySize / range;

  const bullish = lastCandle.c > high && bodyVsORBPct > 0.5;
  const bearish = lastCandle.c < low && bodyVsORBPct > 0.5;

  if (bullish || bearish) {
    return {
      name, fired: true,
      direction: bullish ? 'BUY' : 'SELL',
      reason: `${session} ORB ${bullish ? 'bullish' : 'bearish'} breakout — body is ${Math.round(bodyVsORBPct * 100)}% of opening range`,
      strength: Math.min(bodyVsORBPct, 1),
    };
  }
  return { name, fired: false, direction: 'NEUTRAL', reason: `Price inside ${session} ORB (${low.toFixed(5)}–${high.toFixed(5)}) or weak body vs ORB`, strength: 0 };
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

  // BUY: price broke above demand zone top AND a retest is confirmed (at least one recent H4 candle touched zone top then closed above)
  if (bestDemandZoneTop > 0 && currentPrice > bestDemandZoneTop) {
    const retest = h4Candles.slice(1, 5).some(c => c.l <= bestDemandZoneTop && c.c > bestDemandZoneTop);
    if (retest) {
      const breakPct = Math.round(((currentPrice - bestDemandZoneTop) / bestDemandZoneTop) * 10000);
      return { name, fired: true, direction: 'BUY', reason: `Demand zone broken & retested: ${breakPct}bps above zone (${bestDemandZoneTop.toFixed(5)}) — institutional demand confirmed`, strength: 0.85 };
    }
    return { name, fired: false, direction: 'NEUTRAL', reason: `Demand zone broken (${bestDemandZoneTop.toFixed(5)}) but no retest confirmation yet`, strength: 0 };
  }
  // SELL: price broke below supply zone bottom AND a retest is confirmed
  if (bestSupplyZoneBottom < Infinity && currentPrice < bestSupplyZoneBottom) {
    const retest = h4Candles.slice(1, 5).some(c => c.h >= bestSupplyZoneBottom && c.c < bestSupplyZoneBottom);
    if (retest) {
      const breakPct = Math.round(((bestSupplyZoneBottom - currentPrice) / bestSupplyZoneBottom) * 10000);
      return { name, fired: true, direction: 'SELL', reason: `Supply zone broken & retested: ${breakPct}bps below zone (${bestSupplyZoneBottom.toFixed(5)}) — institutional supply confirmed`, strength: 0.85 };
    }
    return { name, fired: false, direction: 'NEUTRAL', reason: `Supply zone broken (${bestSupplyZoneBottom.toFixed(5)}) but no retest confirmation yet`, strength: 0 };
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

  // Require an actual VWAP cross event: previous bar on opposite side, current bar crossed over
  const prevClose = m5Candles[1]?.c ?? currentPrice;
  const crossedAbove = currentPrice > vwap && prevClose <= vwap;
  const crossedBelow = currentPrice < vwap && prevClose >= vwap;

  if (crossedAbove || crossedBelow) {
    const pct = Math.round((currentVol / avgVol) * 100);
    return {
      name, fired: true,
      direction: crossedAbove ? 'BUY' : 'SELL',
      reason: `Price crossed ${crossedAbove ? 'above' : 'below'} VWAP (${vwap.toFixed(5)}) with ${pct}% volume surge (prev close: ${prevClose.toFixed(5)})`,
      strength: Math.min(pct / 300, 1),
    };
  }
  const side = currentPrice > vwap ? 'above' : currentPrice < vwap ? 'below' : 'at';
  return { name, fired: false, direction: 'NEUTRAL', reason: `No VWAP cross — price already ${side} VWAP (no cross event)`, strength: 0 };
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
  // score = total strategies that fired (regardless of direction) — used for display
  const score = fired.length;
  const maxScore = 7;
  const percentage = Math.round((score / maxScore) * 100);

  // Count directional votes among fired strategies
  const buyVotes = fired.filter(s => s.direction === 'BUY').length;
  const sellVotes = fired.filter(s => s.direction === 'SELL').length;
  // Direction = clear majority; NEUTRAL when tied or no fired strategies
  const direction: 'BUY' | 'SELL' | 'NEUTRAL' =
    buyVotes > sellVotes ? 'BUY' : sellVotes > buyVotes ? 'SELL' : 'NEUTRAL';

  // alignedVotes = strategies that fired in the majority direction
  const alignedVotes = direction === 'BUY' ? buyVotes : direction === 'SELL' ? sellVotes : 0;
  // alignedPct = percentage of max strategies that aligned in the same direction (used for grading)
  const alignedPct = Math.round((alignedVotes / maxScore) * 100);

  // Grade by total-fired percentage (score / maxScore * 100) — independent of direction/alignment
  // A ≥70% | B ≥50% | C ≥35% | PASS <35% — for display and logging only
  // CONFIRM is controlled separately by alignedVotes >= 3 (see getBreakoutConfirmation in openai.ts)
  let grade: 'A' | 'B' | 'C' | 'PASS';
  if (percentage >= 70) {
    grade = 'A'; // ≥5/7 fired (71%)
  } else if (percentage >= 50) {
    grade = 'B'; // ≥4/7 fired (57%)
  } else if (percentage >= 35) {
    grade = 'C'; // 3/7 fired (43%)
  } else {
    grade = 'PASS'; // ≤2/7 fired — insufficient evidence
  }

  // ATR from H1 candles (most stable single-timeframe basis); fallback to m15 or m5 if H1 unavailable
  const atrCandles = h1Candles.length >= 14 ? h1Candles
    : m15Candles.length >= 14 ? m15Candles
    : m5Candles;
  const atr = calcATR(atrCandles, 14);
  // TP direction: always BUY or SELL — never NEUTRAL (0 TPs when no clear direction)
  const sign = direction === 'BUY' ? 1 : -1;
  const tp1 = direction !== 'NEUTRAL' ? currentPrice + sign * atr : 0;
  const tp2 = direction !== 'NEUTRAL' ? currentPrice + sign * atr * 2 : 0;
  const tp3 = direction !== 'NEUTRAL' ? currentPrice + sign * atr * 3 : 0;

  const breakoutCandle = [...m15Candles, ...h1Candles][0];
  const slDistance = atr * 1.5;

  const summary = `Breakout Score: ${score}/${maxScore} fired | ${alignedVotes} aligned (${alignedPct}%) — Grade ${grade} — ${direction}\n` +
    strategies.map(s => `${s.fired ? '✅' : '❌'} ${s.name}: ${s.reason}`).join('\n');

  return { score, maxScore, percentage, alignedVotes, alignedPct, grade, direction, strategies, atr, tp1, tp2, tp3, slDistance, breakoutCandle, summary };
}
