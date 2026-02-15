export interface CandleData {
  o: number;
  h: number;
  l: number;
  c: number;
  v?: number;
  t?: number | string;
}

export interface AdvancedIndicators {
  adx?: { value: number; plusDI: number; minusDI: number; trend: string; signal: string };
  stochastic?: { k: number; d: number; status: string; signal: string };
  vwap?: { value: number; priceRelation: string; signal: string };
  obv?: { value: number; trend: string; divergence: string };
  pivotPoints?: { pp: number; r1: number; r2: number; r3: number; s1: number; s2: number; s3: number };
  fibonacci?: { trend: string; levels: { level: string; price: number }[]; nearestLevel: string; nearestPrice: number };
  supportResistance?: { supports: number[]; resistances: number[]; nearestSupport: number; nearestResistance: number };
  candlePatterns?: string[];
  sessionContext?: { session: string; dayOfWeek: string; hourUTC: number; isSessionOpen: boolean; distanceFromSessionHigh: number; distanceFromSessionLow: number };
  volatilityContext?: { currentATR: number; atr30Avg: number; volatilityPercentile: string; isExpanding: boolean };
  swingPoints?: { lastSwingHigh: number; lastSwingLow: number; swingHighIndex: number; swingLowIndex: number };
  volumeProfile?: { avgVolume: number; currentVolume: number; volumeRatio: number; volumeTrend: string };
  recentTradeContext?: { openPositionsOnSymbol: number; recentWinRate: number; recentTradeCount: number; avgHoldingPeriod: string };
  breakoutDetection?: {
    isBreakoutWindow: boolean;
    session: string;
    minutesSinceOpen: number;
    preSessionRange: { high: number; low: number; range: number };
    breakoutDetected: boolean;
    breakoutDirection: 'BULLISH' | 'BEARISH' | 'NONE';
    breakoutStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE';
    priceVsRange: string;
    breakoutDistance: number;
    volumeConfirmed: boolean;
    signal: 'BUY' | 'SELL' | 'NEUTRAL';
  };
}

export function calculateADX(candles: CandleData[], period: number = 14): AdvancedIndicators['adx'] {
  if (candles.length < period + 1) return undefined;
  const chronological = [...candles].reverse();
  const trList: number[] = [];
  const plusDMList: number[] = [];
  const minusDMList: number[] = [];

  for (let i = 1; i < chronological.length; i++) {
    const high = chronological[i].h;
    const low = chronological[i].l;
    const prevClose = chronological[i - 1].c;
    const prevHigh = chronological[i - 1].h;
    const prevLow = chronological[i - 1].l;

    trList.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const plusDM = high - prevHigh > prevLow - low ? Math.max(high - prevHigh, 0) : 0;
    const minusDM = prevLow - low > high - prevHigh ? Math.max(prevLow - low, 0) : 0;
    plusDMList.push(plusDM);
    minusDMList.push(minusDM);
  }

  if (trList.length < period) return undefined;

  let atr = trList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let smoothPlusDM = plusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let smoothMinusDM = minusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < trList.length; i++) {
    atr = (atr * (period - 1) + trList[i]) / period;
    smoothPlusDM = (smoothPlusDM * (period - 1) + plusDMList[i]) / period;
    smoothMinusDM = (smoothMinusDM * (period - 1) + minusDMList[i]) / period;
  }

  const plusDI = atr > 0 ? (smoothPlusDM / atr) * 100 : 0;
  const minusDI = atr > 0 ? (smoothMinusDM / atr) * 100 : 0;
  const dx = (plusDI + minusDI) > 0 ? Math.abs(plusDI - minusDI) / (plusDI + minusDI) * 100 : 0;

  const dxList: number[] = [];
  let tempATR = trList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let tempPlusDM = plusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let tempMinusDM = minusDMList.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < trList.length; i++) {
    tempATR = (tempATR * (period - 1) + trList[i]) / period;
    tempPlusDM = (tempPlusDM * (period - 1) + plusDMList[i]) / period;
    tempMinusDM = (tempMinusDM * (period - 1) + minusDMList[i]) / period;
    const pdi = tempATR > 0 ? (tempPlusDM / tempATR) * 100 : 0;
    const mdi = tempATR > 0 ? (tempMinusDM / tempATR) * 100 : 0;
    dxList.push((pdi + mdi) > 0 ? Math.abs(pdi - mdi) / (pdi + mdi) * 100 : 0);
  }

  let adxValue = dx;
  if (dxList.length >= period) {
    adxValue = dxList.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxList.length; i++) {
      adxValue = (adxValue * (period - 1) + dxList[i]) / period;
    }
  }

  const trend = adxValue > 50 ? 'VERY STRONG' : adxValue > 25 ? 'STRONG' : adxValue > 20 ? 'MODERATE' : 'WEAK';
  const signal = plusDI > minusDI ? 'BUY' : minusDI > plusDI ? 'SELL' : 'NEUTRAL';

  return {
    value: Math.round(adxValue * 100) / 100,
    plusDI: Math.round(plusDI * 100) / 100,
    minusDI: Math.round(minusDI * 100) / 100,
    trend,
    signal
  };
}

export function calculateStochastic(candles: CandleData[], kPeriod: number = 14, dPeriod: number = 3): AdvancedIndicators['stochastic'] {
  if (candles.length < kPeriod) return undefined;

  const chronological = [...candles].reverse();
  const kValues: number[] = [];
  for (let i = kPeriod - 1; i < chronological.length; i++) {
    const window = chronological.slice(i - kPeriod + 1, i + 1);
    const highest = Math.max(...window.map(c => c.h));
    const lowest = Math.min(...window.map(c => c.l));
    const close = chronological[i].c;
    kValues.push(highest !== lowest ? ((close - lowest) / (highest - lowest)) * 100 : 50);
  }

  const k = kValues[kValues.length - 1];
  const d = kValues.length >= dPeriod ? kValues.slice(-dPeriod).reduce((a, b) => a + b, 0) / dPeriod : k;

  const status = k > 80 ? 'OVERBOUGHT' : k < 20 ? 'OVERSOLD' : 'NEUTRAL';
  let signal = 'NEUTRAL';
  if (k < 20 && k > d) signal = 'BUY';
  else if (k > 80 && k < d) signal = 'SELL';

  return {
    k: Math.round(k * 100) / 100,
    d: Math.round(d * 100) / 100,
    status,
    signal
  };
}

export function calculateVWAP(candles: CandleData[]): AdvancedIndicators['vwap'] {
  if (candles.length < 2) return undefined;

  let cumulativeTPV = 0;
  let cumulativeVolume = 0;

  for (let i = candles.length - 1; i >= 0; i--) {
    const tp = (candles[i].h + candles[i].l + candles[i].c) / 3;
    const vol = candles[i].v || 1;
    cumulativeTPV += tp * vol;
    cumulativeVolume += vol;
  }

  const vwapValue = cumulativeVolume > 0 ? cumulativeTPV / cumulativeVolume : candles[0].c;
  const currentPrice = candles[0].c;
  const priceRelation = currentPrice > vwapValue * 1.001 ? 'ABOVE' : currentPrice < vwapValue * 0.999 ? 'BELOW' : 'AT';
  const signal = priceRelation === 'ABOVE' ? 'BUY' : priceRelation === 'BELOW' ? 'SELL' : 'NEUTRAL';

  return {
    value: Math.round(vwapValue * 100000) / 100000,
    priceRelation,
    signal
  };
}

export function calculateOBV(candles: CandleData[]): AdvancedIndicators['obv'] {
  if (candles.length < 5) return undefined;

  let obv = 0;
  const obvValues: number[] = [0];

  for (let i = candles.length - 2; i >= 0; i--) {
    const vol = candles[i].v || 0;
    if (candles[i].c > candles[i + 1].c) obv += vol;
    else if (candles[i].c < candles[i + 1].c) obv -= vol;
    obvValues.push(obv);
  }

  const recent = obvValues.slice(-5);
  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const trend = obv > avgRecent * 1.05 ? 'RISING' : obv < avgRecent * 0.95 ? 'FALLING' : 'FLAT';

  const priceRising = candles[0].c > candles[Math.min(4, candles.length - 1)].c;
  const obvRising = trend === 'RISING';
  let divergence = 'NONE';
  if (priceRising && !obvRising) divergence = 'BEARISH';
  else if (!priceRising && obvRising) divergence = 'BULLISH';

  return { value: Math.round(obv), trend, divergence };
}

export function calculatePivotPoints(candles: CandleData[]): AdvancedIndicators['pivotPoints'] {
  if (candles.length < 2) return undefined;

  const prevCandle = candles[1];
  const pp = (prevCandle.h + prevCandle.l + prevCandle.c) / 3;
  const r1 = 2 * pp - prevCandle.l;
  const s1 = 2 * pp - prevCandle.h;
  const r2 = pp + (prevCandle.h - prevCandle.l);
  const s2 = pp - (prevCandle.h - prevCandle.l);
  const r3 = prevCandle.h + 2 * (pp - prevCandle.l);
  const s3 = prevCandle.l - 2 * (prevCandle.h - pp);

  const round = (n: number) => Math.round(n * 100000) / 100000;
  return { pp: round(pp), r1: round(r1), r2: round(r2), r3: round(r3), s1: round(s1), s2: round(s2), s3: round(s3) };
}

export function calculateFibonacci(candles: CandleData[], lookback: number = 50): AdvancedIndicators['fibonacci'] {
  const len = Math.min(lookback, candles.length);
  if (len < 5) return undefined;

  const slice = candles.slice(0, len);
  const highest = Math.max(...slice.map(c => c.h));
  const lowest = Math.min(...slice.map(c => c.l));
  const currentPrice = candles[0].c;

  const isUptrend = candles[0].c > candles[len - 1].c;
  const diff = highest - lowest;
  if (diff === 0) return undefined;

  const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
  const levels = fibLevels.map(fib => ({
    level: `${(fib * 100).toFixed(1)}%`,
    price: Math.round((isUptrend ? highest - diff * fib : lowest + diff * fib) * 100000) / 100000,
  }));

  let nearestIdx = 0;
  let nearestDist = Infinity;
  levels.forEach((l, i) => {
    const dist = Math.abs(currentPrice - l.price);
    if (dist < nearestDist) { nearestDist = dist; nearestIdx = i; }
  });

  return {
    trend: isUptrend ? 'UPTREND' : 'DOWNTREND',
    levels,
    nearestLevel: levels[nearestIdx].level,
    nearestPrice: levels[nearestIdx].price,
  };
}

export function findSupportResistance(candles: CandleData[], lookback: number = 50): AdvancedIndicators['supportResistance'] {
  const len = Math.min(lookback, candles.length);
  if (len < 10) return undefined;

  const currentPrice = candles[0].c;
  const levels: number[] = [];

  for (let i = 2; i < len - 2; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h &&
        candles[i].h > candles[i + 1].h && candles[i].h > candles[i + 2].h) {
      levels.push(candles[i].h);
    }
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l &&
        candles[i].l < candles[i + 1].l && candles[i].l < candles[i + 2].l) {
      levels.push(candles[i].l);
    }
  }

  const clustered: number[] = [];
  const tolerance = currentPrice * 0.001;
  for (const level of levels.sort((a, b) => a - b)) {
    if (clustered.length === 0 || Math.abs(level - clustered[clustered.length - 1]) > tolerance) {
      clustered.push(Math.round(level * 100000) / 100000);
    }
  }

  const supports = clustered.filter(l => l < currentPrice).slice(-3);
  const resistances = clustered.filter(l => l > currentPrice).slice(0, 3);

  return {
    supports,
    resistances,
    nearestSupport: supports.length > 0 ? supports[supports.length - 1] : 0,
    nearestResistance: resistances.length > 0 ? resistances[0] : 0,
  };
}

export function detectCandlePatterns(candles: CandleData[]): string[] {
  if (candles.length < 3) return [];
  const patterns: string[] = [];
  const c0 = candles[0];
  const c1 = candles[1];
  const c2 = candles[2];

  const bodySize = (c: CandleData) => Math.abs(c.c - c.o);
  const candleRange = (c: CandleData) => c.h - c.l;
  const isBullish = (c: CandleData) => c.c > c.o;
  const isBearish = (c: CandleData) => c.c < c.o;
  const upperWick = (c: CandleData) => c.h - Math.max(c.o, c.c);
  const lowerWick = (c: CandleData) => Math.min(c.o, c.c) - c.l;

  const range0 = candleRange(c0);
  const body0 = bodySize(c0);
  const body1 = bodySize(c1);

  if (range0 > 0 && body0 / range0 < 0.1) {
    patterns.push('Doji');
  }

  if (range0 > 0) {
    const lw = lowerWick(c0);
    const uw = upperWick(c0);
    if (lw > body0 * 2 && uw < body0 * 0.5 && isBullish(c0)) {
      patterns.push('Hammer (Bullish)');
    }
    if (uw > body0 * 2 && lw < body0 * 0.5 && isBearish(c0)) {
      patterns.push('Shooting Star (Bearish)');
    }
  }

  if (isBearish(c1) && isBullish(c0) && c0.c > c1.o && c0.o < c1.c && body0 > body1 * 0.5) {
    patterns.push('Bullish Engulfing');
  }
  if (isBullish(c1) && isBearish(c0) && c0.c < c1.o && c0.o > c1.c && body0 > body1 * 0.5) {
    patterns.push('Bearish Engulfing');
  }

  if (candles.length >= 3) {
    if (isBearish(c2) && bodySize(c2) > 0 &&
        bodySize(c1) < bodySize(c2) * 0.3 &&
        isBullish(c0) && c0.c > (c2.o + c2.c) / 2) {
      patterns.push('Morning Star (Bullish)');
    }
    if (isBullish(c2) && bodySize(c2) > 0 &&
        bodySize(c1) < bodySize(c2) * 0.3 &&
        isBearish(c0) && c0.c < (c2.o + c2.c) / 2) {
      patterns.push('Evening Star (Bearish)');
    }
  }

  if (range0 > 0 && body0 / range0 < 0.3 && upperWick(c0) > range0 * 0.3 && lowerWick(c0) > range0 * 0.3) {
    patterns.push('Spinning Top');
  }

  if (body0 > 0) {
    const avgBody = candles.slice(0, 10).reduce((s, c) => s + bodySize(c), 0) / Math.min(10, candles.length);
    if (body0 > avgBody * 2 && isBullish(c0)) patterns.push('Strong Bullish Candle');
    if (body0 > avgBody * 2 && isBearish(c0)) patterns.push('Strong Bearish Candle');
  }

  return patterns;
}

export function findSwingPoints(candles: CandleData[], lookback: number = 30): AdvancedIndicators['swingPoints'] {
  const len = Math.min(lookback, candles.length);
  if (len < 5) return undefined;

  let swingHigh = candles[0].h, swingHighIdx = 0;
  let swingLow = candles[0].l, swingLowIdx = 0;

  for (let i = 2; i < len - 2; i++) {
    if (candles[i].h > candles[i - 1].h && candles[i].h > candles[i - 2].h &&
        candles[i].h > candles[i + 1].h && candles[i].h > candles[i + 2].h) {
      if (swingHighIdx === 0 || i < swingHighIdx) {
        swingHigh = candles[i].h;
        swingHighIdx = i;
      }
      break;
    }
  }

  for (let i = 2; i < len - 2; i++) {
    if (candles[i].l < candles[i - 1].l && candles[i].l < candles[i - 2].l &&
        candles[i].l < candles[i + 1].l && candles[i].l < candles[i + 2].l) {
      if (swingLowIdx === 0 || i < swingLowIdx) {
        swingLow = candles[i].l;
        swingLowIdx = i;
      }
      break;
    }
  }

  return {
    lastSwingHigh: Math.round(swingHigh * 100000) / 100000,
    lastSwingLow: Math.round(swingLow * 100000) / 100000,
    swingHighIndex: swingHighIdx,
    swingLowIndex: swingLowIdx,
  };
}

export function getSessionContext(symbol: string): AdvancedIndicators['sessionContext'] {
  const now = new Date();
  const hourUTC = now.getUTCHours();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayOfWeek = days[now.getUTCDay()];

  let session = 'OFF';
  let isSessionOpen = false;

  if (hourUTC >= 0 && hourUTC < 9) { session = 'ASIAN'; isSessionOpen = true; }
  else if (hourUTC >= 7 && hourUTC < 16) { session = 'LONDON'; isSessionOpen = true; }
  else if (hourUTC >= 13 && hourUTC < 22) { session = 'NEW_YORK'; isSessionOpen = true; }

  if (hourUTC >= 13 && hourUTC < 16) session = 'LONDON_NY_OVERLAP';
  if (hourUTC >= 7 && hourUTC < 9) session = 'ASIAN_LONDON_OVERLAP';

  if (dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday') {
    isSessionOpen = false;
    session = 'WEEKEND';
  }

  return {
    session,
    dayOfWeek,
    hourUTC,
    isSessionOpen,
    distanceFromSessionHigh: 0,
    distanceFromSessionLow: 0,
  };
}

export function calculateVolatilityContext(candles: CandleData[], currentATR: number): AdvancedIndicators['volatilityContext'] {
  if (candles.length < 30) return undefined;

  const atrValues: number[] = [];
  for (let start = 0; start <= candles.length - 15; start++) {
    let sum = 0;
    for (let i = start; i < start + 14 && i < candles.length - 1; i++) {
      const tr = Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i + 1].c),
        Math.abs(candles[i].l - candles[i + 1].c)
      );
      sum += tr;
    }
    atrValues.push(sum / 14);
  }

  const atr30Avg = atrValues.slice(0, 30).reduce((a, b) => a + b, 0) / Math.min(30, atrValues.length);
  const ratio = atr30Avg > 0 ? currentATR / atr30Avg : 1;

  const volatilityPercentile = ratio > 1.5 ? 'VERY HIGH' : ratio > 1.2 ? 'HIGH' : ratio > 0.8 ? 'NORMAL' : 'LOW';
  const isExpanding = atrValues.length >= 3 && atrValues[0] > atrValues[1] && atrValues[1] > atrValues[2];

  return {
    currentATR: Math.round(currentATR * 100000) / 100000,
    atr30Avg: Math.round(atr30Avg * 100000) / 100000,
    volatilityPercentile,
    isExpanding,
  };
}

export function calculateVolumeProfile(candles: CandleData[]): AdvancedIndicators['volumeProfile'] {
  if (candles.length < 5) return undefined;

  const totalVol = candles.reduce((s, c) => s + (c.v || 0), 0);
  const avgVolume = totalVol / candles.length;
  const currentVolume = candles[0].v || 0;
  const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

  const recentAvg = candles.slice(0, 5).reduce((s, c) => s + (c.v || 0), 0) / 5;
  const olderAvg = candles.slice(5, 15).reduce((s, c) => s + (c.v || 0), 0) / Math.min(10, Math.max(1, candles.length - 5));
  const volumeTrend = recentAvg > olderAvg * 1.2 ? 'INCREASING' : recentAvg < olderAvg * 0.8 ? 'DECREASING' : 'STABLE';

  return {
    avgVolume: Math.round(avgVolume),
    currentVolume: Math.round(currentVolume),
    volumeRatio: Math.round(volumeRatio * 100) / 100,
    volumeTrend,
  };
}

export function detectMarketOpenBreakout(
  candles: CandleData[],
  symbol: string,
  timeframe: string
): AdvancedIndicators['breakoutDetection'] {
  if (candles.length < 20) return undefined;

  const now = new Date();
  const hourUTC = now.getUTCHours();
  const minuteUTC = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) return undefined;

  const sessionDefs = [
    { name: 'LONDON', openHour: 7, preSessionHours: 7, windowMinutes: 30 },
    { name: 'NEW_YORK', openHour: 13, preSessionHours: 6, windowMinutes: 30 },
    { name: 'TOKYO', openHour: 0, preSessionHours: 3, windowMinutes: 30 },
  ];

  let activeSession: typeof sessionDefs[0] | null = null;
  let minutesSinceOpen = 0;

  for (const sess of sessionDefs) {
    const totalMinutes = hourUTC * 60 + minuteUTC;
    const openMinutes = sess.openHour * 60;
    let diff = totalMinutes - openMinutes;
    if (diff < 0) diff += 1440;
    if (diff >= 0 && diff <= sess.windowMinutes) {
      activeSession = sess;
      minutesSinceOpen = diff;
      break;
    }
  }

  if (!activeSession) {
    return {
      isBreakoutWindow: false,
      session: 'NONE',
      minutesSinceOpen: 0,
      preSessionRange: { high: 0, low: 0, range: 0 },
      breakoutDetected: false,
      breakoutDirection: 'NONE',
      breakoutStrength: 'NONE',
      priceVsRange: 'Outside breakout window',
      breakoutDistance: 0,
      volumeConfirmed: false,
      signal: 'NEUTRAL',
    };
  }

  const chronological = [...candles].reverse();

  let tfMinutes = 60;
  if (timeframe.includes('M1')) tfMinutes = 1;
  else if (timeframe.includes('M5')) tfMinutes = 5;
  else if (timeframe.includes('M15')) tfMinutes = 15;
  else if (timeframe.includes('M30')) tfMinutes = 30;
  else if (timeframe.includes('H1')) tfMinutes = 60;
  else if (timeframe.includes('H4')) tfMinutes = 240;

  const preSessionCandles = Math.max(4, Math.ceil((activeSession.preSessionHours * 60) / tfMinutes));
  const openCandles = Math.max(1, Math.ceil(minutesSinceOpen / tfMinutes));

  const endIdx = chronological.length;
  const preSessionSlice = chronological.slice(
    Math.max(0, endIdx - openCandles - preSessionCandles),
    Math.max(0, endIdx - openCandles)
  );

  if (preSessionSlice.length < 2) {
    return {
      isBreakoutWindow: true,
      session: activeSession.name,
      minutesSinceOpen,
      preSessionRange: { high: 0, low: 0, range: 0 },
      breakoutDetected: false,
      breakoutDirection: 'NONE',
      breakoutStrength: 'NONE',
      priceVsRange: 'Insufficient pre-session data',
      breakoutDistance: 0,
      volumeConfirmed: false,
      signal: 'NEUTRAL',
    };
  }

  let rangeHigh = -Infinity;
  let rangeLow = Infinity;
  for (const c of preSessionSlice) {
    if (c.h > rangeHigh) rangeHigh = c.h;
    if (c.l < rangeLow) rangeLow = c.l;
  }
  const range = rangeHigh - rangeLow;

  if (range <= 0) {
    return {
      isBreakoutWindow: true,
      session: activeSession.name,
      minutesSinceOpen,
      preSessionRange: { high: rangeHigh === -Infinity ? 0 : rangeHigh, low: rangeLow === Infinity ? 0 : rangeLow, range: 0 },
      breakoutDetected: false,
      breakoutDirection: 'NONE',
      breakoutStrength: 'NONE',
      priceVsRange: 'Range too narrow for breakout detection',
      breakoutDistance: 0,
      volumeConfirmed: false,
      signal: 'NEUTRAL',
    };
  }

  const currentPrice = candles[0].c;
  const breakoutDistance = currentPrice > rangeHigh
    ? currentPrice - rangeHigh
    : currentPrice < rangeLow
      ? rangeLow - currentPrice
      : 0;

  let breakoutDirection: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
  let breakoutDetected = false;

  const threshold = range * 0.1;
  if (currentPrice > rangeHigh + threshold) {
    breakoutDirection = 'BULLISH';
    breakoutDetected = true;
  } else if (currentPrice < rangeLow - threshold) {
    breakoutDirection = 'BEARISH';
    breakoutDetected = true;
  }

  let breakoutStrength: 'STRONG' | 'MODERATE' | 'WEAK' | 'NONE' = 'NONE';
  if (breakoutDetected) {
    const ratio = breakoutDistance / range;
    if (ratio > 0.5) breakoutStrength = 'STRONG';
    else if (ratio > 0.25) breakoutStrength = 'MODERATE';
    else breakoutStrength = 'WEAK';
  }

  let volumeConfirmed = false;
  if (breakoutDetected && candles[0].v && candles.length >= 10) {
    const avgVol = candles.slice(1, 11).reduce((s, c) => s + (c.v || 0), 0) / 10;
    volumeConfirmed = (candles[0].v || 0) > avgVol * 1.2;
  }

  let priceVsRange: string;
  if (currentPrice > rangeHigh) priceVsRange = `Price ABOVE range high by ${breakoutDistance.toFixed(5)}`;
  else if (currentPrice < rangeLow) priceVsRange = `Price BELOW range low by ${breakoutDistance.toFixed(5)}`;
  else priceVsRange = `Price INSIDE range (${((currentPrice - rangeLow) / range * 100).toFixed(0)}% from low)`;

  let signal: 'BUY' | 'SELL' | 'NEUTRAL' = 'NEUTRAL';
  if (breakoutDetected && breakoutStrength !== 'NONE') {
    signal = breakoutDirection === 'BULLISH' ? 'BUY' : 'SELL';
  }

  return {
    isBreakoutWindow: true,
    session: activeSession.name,
    minutesSinceOpen,
    preSessionRange: {
      high: Math.round(rangeHigh * 100000) / 100000,
      low: Math.round(rangeLow * 100000) / 100000,
      range: Math.round(range * 100000) / 100000,
    },
    breakoutDetected,
    breakoutDirection,
    breakoutStrength,
    priceVsRange,
    breakoutDistance: Math.round(breakoutDistance * 100000) / 100000,
    volumeConfirmed,
    signal,
  };
}

export function computeAllAdvancedIndicators(
  candles: CandleData[],
  currentATR: number,
  symbol: string,
  timeframe: string = 'H1'
): AdvancedIndicators {
  return {
    adx: calculateADX(candles),
    stochastic: calculateStochastic(candles),
    vwap: calculateVWAP(candles),
    obv: calculateOBV(candles),
    pivotPoints: calculatePivotPoints(candles),
    fibonacci: calculateFibonacci(candles),
    supportResistance: findSupportResistance(candles),
    candlePatterns: detectCandlePatterns(candles),
    swingPoints: findSwingPoints(candles),
    sessionContext: getSessionContext(symbol),
    volatilityContext: calculateVolatilityContext(candles, currentATR),
    volumeProfile: calculateVolumeProfile(candles),
    breakoutDetection: detectMarketOpenBreakout(candles, symbol, timeframe),
  };
}
