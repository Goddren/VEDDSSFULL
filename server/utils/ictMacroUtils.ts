function getNYOffset(date: Date): number {
  const year = date.getUTCFullYear();
  const dstStart = new Date(Date.UTC(year, 2, 1));
  dstStart.setUTCDate(8 - ((dstStart.getUTCDay() + 7) % 7) + 7);
  const dstEnd = new Date(Date.UTC(year, 10, 1));
  dstEnd.setUTCDate(1 + (7 - dstEnd.getUTCDay()) % 7);
  return date >= dstStart && date < dstEnd ? -4 : -5;
}

function toNYTime(date: Date): { hours: number; minutes: number; timeStr: string } {
  const offset = getNYOffset(date);
  const nyMs = date.getTime() + offset * 60 * 60 * 1000;
  const nyDate = new Date(nyMs);
  const hours = nyDate.getUTCHours();
  const minutes = nyDate.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 === 0 ? 12 : hours % 12;
  const mm = minutes.toString().padStart(2, '0');
  return { hours, minutes, timeStr: `${h12}:${mm} ${ampm}` };
}

interface MacroWindow {
  name: string;
  type: 'AM' | 'PM' | 'LONDON';
  startH: number;
  startM: number;
  endH: number;
  endM: number;
}

const MACRO_WINDOWS: MacroWindow[] = [
  { name: 'London Open Macro (3:00-4:00 AM)', type: 'LONDON', startH: 3, startM: 0, endH: 4, endM: 0 },
  { name: 'London Kill Zone (2:00-5:00 AM)', type: 'LONDON', startH: 2, startM: 0, endH: 5, endM: 0 },
  { name: '7:50-8:10 AM Macro', type: 'AM', startH: 7, startM: 50, endH: 8, endM: 10 },
  { name: '8:50-9:10 AM Macro', type: 'AM', startH: 8, startM: 50, endH: 9, endM: 10 },
  { name: '9:50-10:10 AM Macro', type: 'AM', startH: 9, startM: 50, endH: 10, endM: 10 },
  { name: '10:50-11:10 AM Macro', type: 'AM', startH: 10, startM: 50, endH: 11, endM: 10 },
  { name: '11:50-12:10 PM Macro', type: 'AM', startH: 11, startM: 50, endH: 12, endM: 10 },
  { name: '1:20-1:40 PM Macro', type: 'PM', startH: 13, startM: 20, endH: 13, endM: 40 },
  { name: '2:50-3:10 PM Macro', type: 'PM', startH: 14, startM: 50, endH: 15, endM: 10 },
  { name: '3:15-3:45 PM Macro', type: 'PM', startH: 15, startM: 15, endH: 15, endM: 45 },
  { name: '3:50-4:10 PM Macro', type: 'PM', startH: 15, startM: 50, endH: 16, endM: 10 },
];

function windowToMinutes(h: number, m: number): number {
  return h * 60 + m;
}

export type TradingSession = 'LONDON' | 'NY_AM' | 'NY_PM' | 'ASIAN' | 'OVERNIGHT';

function deriveSession(hours: number): TradingSession {
  if (hours >= 2 && hours < 5) return 'LONDON';
  if (hours >= 8 && hours < 12) return 'NY_AM';
  if (hours >= 13 && hours < 16) return 'NY_PM';
  if (hours >= 17 || hours < 2) return 'ASIAN';
  return 'OVERNIGHT';
}

export function getICTMacroContext(nowUTC: Date): {
  isInMacroWindow: boolean;
  macroName: string | null;
  macroType: 'AM' | 'PM' | 'LONDON' | null;
  minutesUntilNextMacro: number;
  nextMacroName: string;
  currentNYTime: string;
  session: TradingSession;
} {
  const { hours, minutes, timeStr } = toNYTime(nowUTC);
  const currentTotalMinutes = hours * 60 + minutes;
  const session = deriveSession(hours);

  for (const w of MACRO_WINDOWS) {
    const start = windowToMinutes(w.startH, w.startM);
    const end = windowToMinutes(w.endH, w.endM);
    if (currentTotalMinutes >= start && currentTotalMinutes < end) {
      return {
        isInMacroWindow: true,
        macroName: w.name,
        macroType: w.type,
        minutesUntilNextMacro: 0,
        nextMacroName: w.name,
        currentNYTime: timeStr,
        session,
      };
    }
  }

  let minWait = Infinity;
  let nextMacro = MACRO_WINDOWS[0];
  for (const w of MACRO_WINDOWS) {
    const start = windowToMinutes(w.startH, w.startM);
    const diff = start > currentTotalMinutes ? start - currentTotalMinutes : (24 * 60 - currentTotalMinutes + start);
    if (diff < minWait) {
      minWait = diff;
      nextMacro = w;
    }
  }

  return {
    isInMacroWindow: false,
    macroName: null,
    macroType: null,
    minutesUntilNextMacro: minWait,
    nextMacroName: nextMacro.name,
    currentNYTime: timeStr,
    session,
  };
}

export function getPremiumDiscountContext(
  currentPrice: number,
  candles: any[],
  signal: string
): {
  zone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  percentile: number;
  rangeHigh: number;
  rangeLow: number;
  equilibrium: number;
  aligns: boolean;
  description: string;
} {
  const recent = candles.slice(0, 20);
  const rangeHigh = Math.max(...recent.map((c: any) => c.h || c.high || 0));
  const rangeLow = Math.min(...recent.map((c: any) => c.l || c.low || Infinity));
  const equilibrium = (rangeHigh + rangeLow) / 2;
  const rangeSize = rangeHigh - rangeLow;
  const rawPercentile = rangeSize > 0 ? ((currentPrice - rangeLow) / rangeSize) * 100 : 50;
  const percentile = Math.max(0, Math.min(100, Math.round(rawPercentile)));

  let zone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM';
  if (percentile >= 70) zone = 'PREMIUM';
  else if (percentile <= 30) zone = 'DISCOUNT';
  else zone = 'EQUILIBRIUM';

  const aligns =
    (signal === 'SELL' && zone === 'PREMIUM') ||
    (signal === 'BUY' && zone === 'DISCOUNT');

  const description = `Price at ${percentile}th percentile of 20-candle range (${rangeLow.toFixed(5)}-${rangeHigh.toFixed(5)}), equil ${equilibrium.toFixed(5)} — ${zone}${aligns ? ' (ALIGNS with signal)' : ' (CONFLICTS with signal)'}`;

  return { zone, percentile, rangeHigh, rangeLow, equilibrium, aligns, description };
}

export function detectStopHunt(
  candles: any[],
  signal: string
): {
  detected: boolean;
  candlesAgo: number | null;
  sweepLevel: number | null;
  description: string;
} {
  if (candles.length < 7) {
    return { detected: false, candlesAgo: null, sweepLevel: null, description: 'Not enough candles to detect stop hunt' };
  }

  for (let i = 1; i <= 6; i++) {
    const candle = candles[i];
    if (!candle) continue;
    const prior = candles.slice(i + 1, i + 6);
    if (prior.length < 2) continue;

    if (signal === 'BUY') {
      const priorLow = Math.min(...prior.map((c: any) => c.l || c.low || Infinity));
      const candleLow = candle.l || candle.low || 0;
      const candleClose = candle.c || candle.close || 0;
      if (candleLow < priorLow && candleClose > priorLow) {
        return {
          detected: true,
          candlesAgo: i,
          sweepLevel: priorLow,
          description: `Buy-side liquidity swept: swing low ${priorLow.toFixed(5)} pierced ${i} candle(s) ago, price reclaimed above — institutional accumulation zone`,
        };
      }
    } else if (signal === 'SELL') {
      const priorHigh = Math.max(...prior.map((c: any) => c.h || c.high || 0));
      const candleHigh = candle.h || candle.high || 0;
      const candleClose = candle.c || candle.close || 0;
      if (candleHigh > priorHigh && candleClose < priorHigh) {
        return {
          detected: true,
          candlesAgo: i,
          sweepLevel: priorHigh,
          description: `Sell-side liquidity swept: swing high ${priorHigh.toFixed(5)} exceeded ${i} candle(s) ago, price rejected below — institutional distribution zone`,
        };
      }
    }
  }

  return {
    detected: false,
    candlesAgo: null,
    sweepLevel: null,
    description: `No liquidity sweep detected in last 6 candles — stop hunt not confirmed`,
  };
}

export function detectCRTPattern(candles: any[]): {
  detected: boolean;
  direction: 'BULLISH' | 'BEARISH' | null;
  stage: 'RANGE' | 'MANIPULATION' | 'EXPANSION' | null;
  description: string;
} {
  if (candles.length < 4) {
    return { detected: false, direction: null, stage: null, description: 'Not enough candles for CRT detection' };
  }

  const [c0, c1, c2, c3] = candles;

  const getH = (c: any) => c.h || c.high || 0;
  const getL = (c: any) => c.l || c.low || Infinity;
  const getC = (c: any) => c.c || c.close || 0;

  const aH = getH(c3);
  const aL = getL(c3);

  const bH = getH(c2);
  const bL = getL(c2);
  const bC = getC(c2);

  const cH = getH(c1);
  const cL = getL(c1);
  const cC = getC(c1);

  const d0C = getC(c0);

  const bullishManip = bL < aL && bC > aL;
  const bearishManip = bH > aH && bC < aH;

  if (bullishManip) {
    if (cC > aH || d0C > aH) {
      return {
        detected: true,
        direction: 'BULLISH',
        stage: 'EXPANSION',
        description: `Bullish CRT: candle A range ${aL.toFixed(5)}-${aH.toFixed(5)}, manipulation low ${bL.toFixed(5)} swept below (${Math.abs(candles.indexOf(c2))} candles ago), expansion UP confirmed — price breaking above range`,
      };
    }
    return {
      detected: true,
      direction: 'BULLISH',
      stage: 'MANIPULATION',
      description: `Bullish CRT in manipulation phase: low ${bL.toFixed(5)} swept A's low (${aL.toFixed(5)}), waiting for expansion UP — do NOT chase yet`,
    };
  }

  if (bearishManip) {
    if (cC < aL || d0C < aL) {
      return {
        detected: true,
        direction: 'BEARISH',
        stage: 'EXPANSION',
        description: `Bearish CRT: candle A range ${aL.toFixed(5)}-${aH.toFixed(5)}, manipulation high ${bH.toFixed(5)} swept above (${Math.abs(candles.indexOf(c2))} candles ago), expansion DOWN confirmed — price breaking below range`,
      };
    }
    return {
      detected: true,
      direction: 'BEARISH',
      stage: 'MANIPULATION',
      description: `Bearish CRT in manipulation phase: high ${bH.toFixed(5)} swept A's high (${aH.toFixed(5)}), waiting for expansion DOWN — fakeout risk if entering now`,
    };
  }

  const aRange = aH - aL;
  const bRange = bH - bL;
  const isNarrow = bRange < aRange * 0.6;

  if (isNarrow) {
    return {
      detected: true,
      direction: null,
      stage: 'RANGE',
      description: `CRT range candle forming: candle A established ${aL.toFixed(5)}-${aH.toFixed(5)}, watching for manipulation spike next`,
    };
  }

  return {
    detected: false,
    direction: null,
    stage: null,
    description: 'No CRT pattern detected in recent 4 candles',
  };
}

export function detectAsianRange(candles: any[]): {
  high: number;
  low: number;
  midpoint: number;
  detected: boolean;
  description: string;
} {
  const none = { high: 0, low: 0, midpoint: 0, detected: false, description: 'Asian range not detectable from available candles' };
  if (!candles || candles.length < 10) return none;

  const lookback = Math.min(25, candles.length);
  let bestHigh = 0;
  let bestLow = Infinity;
  let bestRange = Infinity;
  const windowSize = 10;

  for (let start = 0; start + windowSize <= lookback; start++) {
    const slice = candles.slice(start, start + windowSize);
    const sliceHigh = Math.max(...slice.map((c: any) => c.h || c.high || 0));
    const sliceLow = Math.min(...slice.map((c: any) => c.l || c.low || Infinity));
    const range = sliceHigh - sliceLow;
    const mid = (sliceHigh + sliceLow) / 2;
    const rangePercent = mid > 0 ? range / mid : 1;
    if (rangePercent < bestRange) {
      bestRange = rangePercent;
      bestHigh = sliceHigh;
      bestLow = sliceLow;
    }
  }

  if (bestRange > 0.003 || bestLow === Infinity) return none;

  const midpoint = (bestHigh + bestLow) / 2;
  return {
    high: bestHigh,
    low: bestLow,
    midpoint,
    detected: true,
    description: `Asian consolidation range: ${bestLow.toFixed(5)}–${bestHigh.toFixed(5)} (${(bestRange * 100).toFixed(2)}% range) — midpoint ${midpoint.toFixed(5)}`,
  };
}

export function detectKeyReferenceLevels(candles: any[]): {
  pdHigh: number | null;
  pdLow: number | null;
  pwHigh: number | null;
  pwLow: number | null;
  currentPrice: number;
  abovePDH: boolean;
  belowPDL: boolean;
  description: string;
} {
  const none = { pdHigh: null, pdLow: null, pwHigh: null, pwLow: null, currentPrice: 0, abovePDH: false, belowPDL: false, description: 'Not enough candles for key reference levels' };
  if (!candles || candles.length < 25) return none;

  const currentPrice = candles[0]?.c || candles[0]?.close || 0;

  const pdCandles = candles.slice(24, Math.min(48, candles.length));
  const pwCandles = candles.slice(24, Math.min(168, candles.length));

  const pdHigh = pdCandles.length > 0 ? Math.max(...pdCandles.map((c: any) => c.h || c.high || 0)) : null;
  const pdLow = pdCandles.length > 0 ? Math.min(...pdCandles.map((c: any) => c.l || c.low || Infinity)) : null;
  const pwHigh = pwCandles.length > 0 ? Math.max(...pwCandles.map((c: any) => c.h || c.high || 0)) : null;
  const pwLow = pwCandles.length > 0 ? Math.min(...pwCandles.map((c: any) => c.l || c.low || Infinity)) : null;

  const safePDLow = pdLow === Infinity ? null : pdLow;
  const safePWLow = pwLow === Infinity ? null : pwLow;

  const abovePDH = pdHigh !== null && currentPrice > pdHigh;
  const belowPDL = safePDLow !== null && currentPrice < safePDLow;

  const lines: string[] = [];
  if (pdHigh !== null) lines.push(`PDH: ${pdHigh.toFixed(5)} (price is ${abovePDH ? 'ABOVE' : 'below'})`);
  if (safePDLow !== null) lines.push(`PDL: ${safePDLow.toFixed(5)} (price is ${belowPDL ? 'BELOW' : 'above'})`);
  if (pwHigh !== null) lines.push(`PWH: ${pwHigh.toFixed(5)}`);
  if (safePWLow !== null) lines.push(`PWL: ${safePWLow.toFixed(5)}`);

  const posDesc = abovePDH
    ? 'Price trading ABOVE PDH — potential bearish draw, bulls need strong conviction here'
    : belowPDL
    ? 'Price trading BELOW PDL — continuation bearish or bounce incoming'
    : 'Price within PDH/PDL range — looking for draw on liquidity at these levels';

  return {
    pdHigh,
    pdLow: safePDLow,
    pwHigh,
    pwLow: safePWLow,
    currentPrice,
    abovePDH,
    belowPDL,
    description: `${lines.join(' | ')} → ${posDesc}`,
  };
}

export function detectOTEZone(candles: any[], signal: string): {
  detected: boolean;
  swingHigh: number | null;
  swingLow: number | null;
  ote618: number | null;
  ote705: number | null;
  ote79: number | null;
  inOTEZone: boolean;
  currentPrice: number;
  description: string;
} {
  const none = { detected: false, swingHigh: null, swingLow: null, ote618: null, ote705: null, ote79: null, inOTEZone: false, currentPrice: 0, description: 'Not enough structure for OTE zone detection' };
  if (!candles || candles.length < 15) return none;

  const currentPrice = candles[0]?.c || candles[0]?.close || 0;
  const lookback = Math.min(30, candles.length - 2);

  let swingHighs: Array<{ index: number; level: number }> = [];
  let swingLows: Array<{ index: number; level: number }> = [];

  for (let i = 1; i < lookback; i++) {
    const c = candles[i];
    const prev = candles[i - 1];
    const next = candles[i + 1];
    if (!c || !prev || !next) continue;
    if (c.h > prev.h && c.h > next.h) swingHighs.push({ index: i, level: c.h });
    if (c.l < prev.l && c.l < next.l) swingLows.push({ index: i, level: c.l });
  }

  if (swingHighs.length < 1 || swingLows.length < 1) return none;

  let swingHigh: number | null = null;
  let swingLow: number | null = null;

  if (signal === 'BUY') {
    swingLow = Math.min(...swingLows.map(s => s.level));
    swingHigh = Math.max(...swingHighs.filter(s => swingLows.some(l => l.index > s.index)).map(s => s.level));
    if (!swingHigh) swingHigh = Math.max(...swingHighs.map(s => s.level));
  } else {
    swingHigh = Math.max(...swingHighs.map(s => s.level));
    swingLow = Math.min(...swingLows.filter(s => swingHighs.some(h => h.index > s.index)).map(s => s.level));
    if (!swingLow) swingLow = Math.min(...swingLows.map(s => s.level));
  }

  if (!swingHigh || !swingLow || swingHigh <= swingLow) return none;

  const range = swingHigh - swingLow;
  if (range / ((swingHigh + swingLow) / 2) < 0.001) return none;

  let ote618: number, ote705: number, ote79: number;
  let inOTEZone: boolean;

  if (signal === 'BUY') {
    ote618 = swingHigh - range * 0.618;
    ote705 = swingHigh - range * 0.705;
    ote79 = swingHigh - range * 0.79;
    inOTEZone = currentPrice >= ote79 && currentPrice <= ote618;
  } else {
    ote618 = swingLow + range * 0.618;
    ote705 = swingLow + range * 0.705;
    ote79 = swingLow + range * 0.79;
    inOTEZone = currentPrice >= ote618 && currentPrice <= ote79;
  }

  const zoneDesc = inOTEZone
    ? `✅ Price IS in OTE zone (${ote79.toFixed(5)}–${ote618.toFixed(5)}) — institutional entry sweet spot`
    : `⚠ Price at ${currentPrice.toFixed(5)} NOT in OTE zone (${ote79.toFixed(5)}–${ote618.toFixed(5)}) — wait for retracement or accept lower-quality entry`;

  return {
    detected: true,
    swingHigh,
    swingLow,
    ote618,
    ote705,
    ote79,
    inOTEZone,
    currentPrice,
    description: `Swing: ${swingLow.toFixed(5)}→${swingHigh.toFixed(5)} | OTE zone: ${ote79.toFixed(5)}–${ote618.toFixed(5)} | 70.5% sweet spot: ${ote705.toFixed(5)} | ${zoneDesc}`,
  };
}
