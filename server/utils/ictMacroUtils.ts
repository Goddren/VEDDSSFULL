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
  type: 'AM' | 'PM';
  startH: number;
  startM: number;
  endH: number;
  endM: number;
}

const MACRO_WINDOWS: MacroWindow[] = [
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

export function getICTMacroContext(nowUTC: Date): {
  isInMacroWindow: boolean;
  macroName: string | null;
  macroType: 'AM' | 'PM' | null;
  minutesUntilNextMacro: number;
  nextMacroName: string;
  currentNYTime: string;
} {
  const { hours, minutes, timeStr } = toNYTime(nowUTC);
  const currentTotalMinutes = hours * 60 + minutes;

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
