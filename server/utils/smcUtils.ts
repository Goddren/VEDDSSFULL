/**
 * Smart Money Concepts (SMC) Utility Functions
 * Detects: BOS/CHOCH, Fair Value Gaps, Order Blocks, Equal Highs/Lows, Wyckoff phases
 * Candles: index 0 = most recent, index N = oldest
 */

export interface BOSCHOCHResult {
  detected: boolean;
  type: 'BOS' | 'CHOCH' | null;
  direction: 'BULLISH' | 'BEARISH' | null;
  level: number | null;
  candlesAgo: number | null;
  description: string;
}

export interface FVGResult {
  detected: boolean;
  direction: 'BULLISH' | 'BEARISH' | null;
  top: number | null;
  bottom: number | null;
  inZone: boolean;
  candlesAgo: number | null;
  description: string;
}

export interface OrderBlockResult {
  detected: boolean;
  type: 'BULLISH_OB' | 'BEARISH_OB' | 'BREAKER' | null;
  top: number | null;
  bottom: number | null;
  aligns: boolean;
  description: string;
}

export interface EqualHighsLowsResult {
  equalHighs: { detected: boolean; level: number | null; count: number; description: string };
  equalLows: { detected: boolean; level: number | null; count: number; description: string };
}

export interface WyckoffResult {
  detected: boolean;
  phase: 'ACCUMULATION' | 'DISTRIBUTION' | 'MARKUP' | 'MARKDOWN' | null;
  stage: 'SPRING' | 'UPTHRUST' | 'TEST' | 'SOS' | 'SOW' | null;
  aligns: boolean;
  description: string;
}

// Identify swing highs in the candle array (0=newest). A swing high at index i means
// candles[i].h is the highest of candles[i-1], candles[i], candles[i+1].
function findSwingHighs(candles: any[], lookback = 20): Array<{ index: number; level: number }> {
  const result: Array<{ index: number; level: number }> = [];
  const limit = Math.min(lookback, candles.length - 2);
  for (let i = 1; i < limit; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i + 1].h) {
      result.push({ index: i, level: candles[i].h });
    }
  }
  return result;
}

function findSwingLows(candles: any[], lookback = 20): Array<{ index: number; level: number }> {
  const result: Array<{ index: number; level: number }> = [];
  const limit = Math.min(lookback, candles.length - 2);
  for (let i = 1; i < limit; i++) {
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i + 1].l) {
      result.push({ index: i, level: candles[i].l });
    }
  }
  return result;
}

/**
 * Detects the most recent Break of Structure (BOS) or Change of Character (CHOCH).
 * BOS = structural continuation break. CHOCH = momentum shift break.
 */
export function detectBOSCHOCH(candles: any[], signal: string): BOSCHOCHResult {
  const none: BOSCHOCHResult = { detected: false, type: null, direction: null, level: null, candlesAgo: null, description: 'No clear BOS or CHOCH detected in recent structure' };
  if (!candles || candles.length < 10) return none;

  const swingHighs = findSwingHighs(candles, 25);
  const swingLows = findSwingLows(candles, 25);

  const currentClose = candles[0].c;

  // Check for bullish BOS: current price broke above a recent swing high
  const brokeHigh = swingHighs.find(sh => currentClose > sh.level && sh.index >= 2);
  if (brokeHigh) {
    // Check if prior trend was bearish (CHOCH) or bullish (BOS continuation)
    const priorHighs = swingHighs.filter(sh => sh.index > brokeHigh.index);
    const priorLows = swingLows.filter(sl => sl.index > brokeHigh.index);
    const priorTrendBearish = priorHighs.length >= 2 &&
      priorHighs[0].level < priorHighs[priorHighs.length - 1].level &&
      priorLows.length >= 1;
    const type = priorTrendBearish ? 'CHOCH' : 'BOS';
    return {
      detected: true, type, direction: 'BULLISH',
      level: brokeHigh.level, candlesAgo: brokeHigh.index,
      description: `${type} BULLISH — price broke above swing high at ${brokeHigh.level.toFixed(5)} (${brokeHigh.index} candles ago)${type === 'CHOCH' ? ', reversing prior bearish structure' : ', continuing bullish momentum'}`,
    };
  }

  // Check for bearish BOS: current price broke below a recent swing low
  const brokeLow = swingLows.find(sl => currentClose < sl.level && sl.index >= 2);
  if (brokeLow) {
    const priorHighs = swingHighs.filter(sh => sh.index > brokeLow.index);
    const priorLows = swingLows.filter(sl => sl.index > brokeLow.index);
    const priorTrendBullish = priorLows.length >= 2 &&
      priorLows[0].level > priorLows[priorLows.length - 1].level &&
      priorHighs.length >= 1;
    const type = priorTrendBullish ? 'CHOCH' : 'BOS';
    return {
      detected: true, type, direction: 'BEARISH',
      level: brokeLow.level, candlesAgo: brokeLow.index,
      description: `${type} BEARISH — price broke below swing low at ${brokeLow.level.toFixed(5)} (${brokeLow.index} candles ago)${type === 'CHOCH' ? ', reversing prior bullish structure' : ', continuing bearish momentum'}`,
    };
  }

  return none;
}

/**
 * Detects the most recent unmitigated Fair Value Gap (imbalance) that aligns with the signal.
 * Bullish FVG: candle[i+2].h < candle[i].l → price gap, expecting fill upward
 * Bearish FVG: candle[i+2].l > candle[i].h → price gap, expecting fill downward
 * (candles index 0 = newest; candle triplet: candles[i], [i+1], [i+2] = new→old)
 */
export function detectFairValueGap(candles: any[], signal: string): FVGResult {
  const none: FVGResult = { detected: false, direction: null, top: null, bottom: null, inZone: false, candlesAgo: null, description: 'No active Fair Value Gap detected' };
  if (!candles || candles.length < 6) return none;

  const currentClose = candles[0].c;
  const lookback = Math.min(15, candles.length - 2);

  // Search from oldest to newest so we get the most recent relevant FVG
  for (let i = lookback - 1; i >= 1; i--) {
    const newer = candles[i - 1]; // closer to present
    const mid = candles[i];
    const older = candles[i + 1]; // further in past

    // Bullish FVG: older.h < newer.l (gap between older high and newer low)
    if (older.h < newer.l) {
      const top = newer.l;
      const bottom = older.h;
      const midpoint = (top + bottom) / 2;
      const inZone = currentClose >= bottom && currentClose <= top;
      const aligns = signal === 'BUY';
      if (!aligns) continue;
      return {
        detected: true, direction: 'BULLISH',
        top, bottom, inZone, candlesAgo: i,
        description: `Bullish FVG at ${bottom.toFixed(5)}–${top.toFixed(5)} (${i} candles ago)${inZone ? ' — price INSIDE zone, potential support' : ` — price ${currentClose > top ? 'above' : 'below'} zone`}`,
      };
    }

    // Bearish FVG: older.l > newer.h (gap between older low and newer high)
    if (older.l > newer.h) {
      const top = older.l;
      const bottom = newer.h;
      const inZone = currentClose >= bottom && currentClose <= top;
      const aligns = signal === 'SELL';
      if (!aligns) continue;
      return {
        detected: true, direction: 'BEARISH',
        top, bottom, inZone, candlesAgo: i,
        description: `Bearish FVG at ${bottom.toFixed(5)}–${top.toFixed(5)} (${i} candles ago)${inZone ? ' — price INSIDE zone, potential resistance' : ` — price ${currentClose < bottom ? 'below' : 'above'} zone`}`,
      };
    }
  }

  return none;
}

/**
 * Detects the most relevant Order Block (OB) or Breaker Block.
 * Bullish OB: last bearish candle before a strong upward displacement
 * Bearish OB: last bullish candle before a strong downward displacement
 * Breaker: an OB that was broken through — now acts as opposing level
 */
export function detectOrderBlock(candles: any[], signal: string): OrderBlockResult {
  const none: OrderBlockResult = { detected: false, type: null, top: null, bottom: null, aligns: false, description: 'No significant order block detected' };
  if (!candles || candles.length < 6) return none;

  const currentClose = candles[0].c;
  const lookback = Math.min(20, candles.length - 2);

  // Displacement threshold: the impulse candle body must be >= 1.5x the OB body
  for (let i = 2; i < lookback; i++) {
    const obCandle = candles[i]; // potential order block
    const impulse = candles[i - 1]; // next candle after OB (displacement)
    const obBody = Math.abs(obCandle.c - obCandle.o);
    const impulseBody = Math.abs(impulse.c - impulse.o);
    if (obBody === 0 || impulseBody < obBody * 1.5) continue;

    // Bullish OB: OB is bearish candle followed by bullish impulse
    if (obCandle.c < obCandle.o && impulse.c > impulse.o) {
      const obTop = obCandle.o; // open of bearish candle = top of OB zone
      const obBottom = obCandle.l;
      const inZone = currentClose >= obBottom && currentClose <= obTop;
      const breached = currentClose < obBottom;

      if (breached) {
        // It became a breaker — only relevant for SELL
        if (signal !== 'SELL') continue;
        return {
          detected: true, type: 'BREAKER',
          top: obTop, bottom: obBottom, aligns: true,
          description: `Bearish breaker at ${obBottom.toFixed(5)}–${obTop.toFixed(5)} — bullish OB was breached, now acting as resistance (${i} candles ago)`,
        };
      }

      if (signal !== 'BUY') continue;
      return {
        detected: true, type: 'BULLISH_OB',
        top: obTop, bottom: obBottom, aligns: true,
        description: `Bullish OB at ${obBottom.toFixed(5)}–${obTop.toFixed(5)} (${i} candles ago)${inZone ? ' — price retesting OB zone' : ''}`,
      };
    }

    // Bearish OB: OB is bullish candle followed by bearish impulse
    if (obCandle.c > obCandle.o && impulse.c < impulse.o) {
      const obTop = obCandle.h;
      const obBottom = obCandle.o; // open of bullish candle = bottom of OB zone
      const inZone = currentClose >= obBottom && currentClose <= obTop;
      const breached = currentClose > obTop;

      if (breached) {
        if (signal !== 'BUY') continue;
        return {
          detected: true, type: 'BREAKER',
          top: obTop, bottom: obBottom, aligns: true,
          description: `Bullish breaker at ${obBottom.toFixed(5)}–${obTop.toFixed(5)} — bearish OB was breached, now acting as support (${i} candles ago)`,
        };
      }

      if (signal !== 'SELL') continue;
      return {
        detected: true, type: 'BEARISH_OB',
        top: obTop, bottom: obBottom, aligns: true,
        description: `Bearish OB at ${obBottom.toFixed(5)}–${obTop.toFixed(5)} (${i} candles ago)${inZone ? ' — price retesting OB zone' : ''}`,
      };
    }
  }

  return none;
}

/**
 * Detects equal highs and equal lows (buy-side / sell-side liquidity pools).
 * Equal highs: 2+ swing highs within 0.05% of each other → buy-side liquidity above
 * Equal lows: 2+ swing lows within 0.05% of each other → sell-side liquidity below
 */
export function detectEqualHighsLows(candles: any[]): EqualHighsLowsResult {
  const swingHighs = findSwingHighs(candles, 30);
  const swingLows = findSwingLows(candles, 30);
  const tolerance = 0.0005; // 0.05%

  let eqHighLevel: number | null = null;
  let eqHighCount = 0;
  for (let i = 0; i < swingHighs.length; i++) {
    for (let j = i + 1; j < swingHighs.length; j++) {
      const diff = Math.abs(swingHighs[i].level - swingHighs[j].level) / swingHighs[i].level;
      if (diff <= tolerance) {
        eqHighLevel = (swingHighs[i].level + swingHighs[j].level) / 2;
        eqHighCount++;
        break;
      }
    }
    if (eqHighLevel) break;
  }

  let eqLowLevel: number | null = null;
  let eqLowCount = 0;
  for (let i = 0; i < swingLows.length; i++) {
    for (let j = i + 1; j < swingLows.length; j++) {
      const diff = Math.abs(swingLows[i].level - swingLows[j].level) / swingLows[i].level;
      if (diff <= tolerance) {
        eqLowLevel = (swingLows[i].level + swingLows[j].level) / 2;
        eqLowCount++;
        break;
      }
    }
    if (eqLowLevel) break;
  }

  return {
    equalHighs: {
      detected: eqHighLevel !== null,
      level: eqHighLevel,
      count: eqHighCount + (eqHighLevel ? 2 : 0),
      description: eqHighLevel
        ? `Equal highs at ~${eqHighLevel.toFixed(5)} — buy-side liquidity pool above, likely target for sell-side to sweep`
        : 'No equal highs detected',
    },
    equalLows: {
      detected: eqLowLevel !== null,
      level: eqLowLevel,
      count: eqLowCount + (eqLowLevel ? 2 : 0),
      description: eqLowLevel
        ? `Equal lows at ~${eqLowLevel.toFixed(5)} — sell-side liquidity pool below, likely target for buy-side to sweep`
        : 'No equal lows detected',
    },
  };
}

/**
 * Detects Wyckoff accumulation/distribution patterns.
 * Accumulation + Spring: ranging market, price briefly pierced below range low and recovered → bullish
 * Distribution + Upthrust: ranging market, price briefly pierced above range high and rejected → bearish
 * Also detects simple MARKUP (strong uptrend) / MARKDOWN (strong downtrend) phases
 */
export function detectWyckoff(candles: any[]): WyckoffResult {
  const none: WyckoffResult = { detected: false, phase: null, stage: null, aligns: false, description: 'No clear Wyckoff phase detected' };
  if (!candles || candles.length < 15) return none;

  const lookback = Math.min(20, candles.length);
  const rangeCandles = candles.slice(0, lookback);
  const highs = rangeCandles.map(c => c.h);
  const lows = rangeCandles.map(c => c.l);
  const closes = rangeCandles.map(c => c.c);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangeSize = rangeHigh - rangeLow;
  if (rangeSize === 0) return none;

  const avgPrice = (rangeHigh + rangeLow) / 2;
  const rangePercent = rangeSize / avgPrice;

  // Detect MARKUP: most recent candles consistently above midpoint + trending up
  const recentCloses = closes.slice(0, 8);
  const midpoint = (rangeHigh + rangeLow) / 2;
  const aboveMid = recentCloses.filter(c => c > midpoint).length;
  const risingCandles = recentCloses.filter((c, i) => i > 0 && c > recentCloses[i - 1]).length;

  if (aboveMid >= 6 && risingCandles >= 5) {
    return { detected: true, phase: 'MARKUP', stage: null, aligns: true, description: 'Wyckoff MARKUP — price in sustained uptrend above range midpoint, bullish momentum confirmed' };
  }

  // Detect MARKDOWN: most recent candles consistently below midpoint + trending down
  const belowMid = recentCloses.filter(c => c < midpoint).length;
  const fallingCandles = recentCloses.filter((c, i) => i > 0 && c < recentCloses[i - 1]).length;

  if (belowMid >= 6 && fallingCandles >= 5) {
    return { detected: true, phase: 'MARKDOWN', stage: null, aligns: true, description: 'Wyckoff MARKDOWN — price in sustained downtrend below range midpoint, bearish momentum confirmed' };
  }

  // Detect ranging (potential ACCUMULATION or DISTRIBUTION)
  // Range is tight if rangePercent < 0.5%
  if (rangePercent < 0.005 && lookback >= 10) {
    // Spring detection (for Accumulation): a recent candle spiked below rangeLow but closed above it
    const spring = candles.slice(0, 8).find((c, i) => c.l < rangeLow && c.c > rangeLow);
    if (spring) {
      return {
        detected: true, phase: 'ACCUMULATION', stage: 'SPRING',
        aligns: true,
        description: `Wyckoff ACCUMULATION Spring — price swept below range low (${rangeLow.toFixed(5)}) then closed back inside; institutional buy signal`,
      };
    }

    // Upthrust detection (for Distribution): a recent candle spiked above rangeHigh but closed below it
    const upthrust = candles.slice(0, 8).find((c, i) => c.h > rangeHigh && c.c < rangeHigh);
    if (upthrust) {
      return {
        detected: true, phase: 'DISTRIBUTION', stage: 'UPTHRUST',
        aligns: true,
        description: `Wyckoff DISTRIBUTION Upthrust — price swept above range high (${rangeHigh.toFixed(5)}) then closed back inside; institutional sell signal`,
      };
    }

    // Signs of Strength / Weakness
    const latestClose = closes[0];
    if (latestClose > midpoint + rangeSize * 0.3) {
      return {
        detected: true, phase: 'ACCUMULATION', stage: 'SOS',
        aligns: true,
        description: `Wyckoff Sign of Strength (SOS) — price pushing into upper range, accumulation nearing markup phase`,
      };
    }
    if (latestClose < midpoint - rangeSize * 0.3) {
      return {
        detected: true, phase: 'DISTRIBUTION', stage: 'SOW',
        aligns: true,
        description: `Wyckoff Sign of Weakness (SOW) — price dropping into lower range, distribution nearing markdown phase`,
      };
    }
  }

  return none;
}
