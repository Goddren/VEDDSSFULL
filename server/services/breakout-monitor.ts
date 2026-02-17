import { detectMarketOpenBreakout, type CandleData } from '../indicators';

interface BreakoutResult {
  symbol: string;
  timeframe: string;
  session: string;
  detectedAt: string;
  isBreakoutWindow: boolean;
  breakoutDetected: boolean;
  breakoutDirection: string;
  breakoutStrength: string;
  priceVsRange: string;
  breakoutDistance: number;
  volumeConfirmed: boolean;
  signal: string;
  approachingBreakout?: boolean;
  approachingDirection?: string;
  rangePosition?: number;
  preSessionRange: { high: number; low: number; range: number };
  minutesSinceOpen: number;
  source: 'independent_m15';
}

interface MonitorState {
  results: Record<string, BreakoutResult>;
  lastPollTime: string | null;
  isPolling: boolean;
  pollCount: number;
  errors: string[];
  pollOffset: number;
}

const monitorStates: Record<number, MonitorState> = {};

function getOrCreateState(userId: number): MonitorState {
  if (!monitorStates[userId]) {
    monitorStates[userId] = {
      results: {},
      lastPollTime: null,
      isPolling: false,
      pollCount: 0,
      errors: [],
      pollOffset: 0,
    };
  }
  return monitorStates[userId];
}

function isInSessionWindow(): { inWindow: boolean; session: string; minutesSinceOpen: number } {
  const now = new Date();
  const hourUTC = now.getUTCHours();
  const minuteUTC = now.getUTCMinutes();
  const dayOfWeek = now.getUTCDay();

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return { inWindow: false, session: 'NONE', minutesSinceOpen: 0 };
  }

  const sessions = [
    { name: 'LONDON', openHour: 7, windowMinutes: 90 },
    { name: 'NEW_YORK', openHour: 13, windowMinutes: 90 },
    { name: 'TOKYO', openHour: 0, windowMinutes: 60 },
  ];

  const totalMinutes = hourUTC * 60 + minuteUTC;

  for (const sess of sessions) {
    const openMinutes = sess.openHour * 60;
    let diff = totalMinutes - openMinutes;
    if (diff < 0) diff += 1440;
    if (diff >= 0 && diff <= sess.windowMinutes) {
      return { inWindow: true, session: sess.name, minutesSinceOpen: diff };
    }
  }

  return { inWindow: false, session: 'NONE', minutesSinceOpen: 0 };
}

function convertOHLCVToCandleData(bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>): CandleData[] {
  return bars.map(bar => ({
    t: bar.timestamp,
    o: bar.open,
    h: bar.high,
    l: bar.low,
    c: bar.close,
    v: bar.volume,
  })).reverse();
}

function getConnectedPairsForUser(userId: number): string[] {
  const connectedPairs = (global as any).mt5ConnectedPairs?.[userId];
  if (!connectedPairs) return [];

  const symbols = new Set<string>();
  for (const key of Object.keys(connectedPairs)) {
    const pair = connectedPairs[key];
    if (pair?.symbol) {
      symbols.add(pair.symbol.toUpperCase().replace('/', ''));
    }
  }
  return Array.from(symbols);
}

async function pollBreakoutsForUser(userId: number): Promise<void> {
  const state = getOrCreateState(userId);
  if (state.isPolling) return;

  const sessionCheck = isInSessionWindow();
  if (!sessionCheck.inWindow) return;

  state.isPolling = true;

  try {
    const { marketDataService } = await import('../market-data');
    if (!marketDataService.isInitialized()) {
      state.isPolling = false;
      return;
    }

    const symbols = getConnectedPairsForUser(userId);
    if (symbols.length === 0) {
      state.isPolling = false;
      return;
    }

    const maxPerPoll = Math.min(3, symbols.length);
    const offset = state.pollOffset % symbols.length;
    const symbolsToCheck: string[] = [];
    for (let i = 0; i < maxPerPoll; i++) {
      const idx = (offset + i) % symbols.length;
      if (!symbolsToCheck.includes(symbols[idx])) {
        symbolsToCheck.push(symbols[idx]);
      }
    }
    state.pollOffset = (offset + maxPerPoll) % Math.max(symbols.length, 1);

    for (const rawSymbol of symbolsToCheck) {
      try {
        const assetType = marketDataService.detectAssetType(rawSymbol);

        const result = await marketDataService.fetchMarketData({
          symbol: rawSymbol,
          assetType,
          timeframe: '15m',
          limit: 50,
        });

        if (!result.bars || result.bars.length < 20) continue;

        const candleData = convertOHLCVToCandleData(result.bars);
        const breakout = detectMarketOpenBreakout(candleData, rawSymbol, 'M15');

        if (breakout) {
          const symbolKey = rawSymbol.toUpperCase().replace('/', '');
          state.results[symbolKey] = {
            symbol: rawSymbol,
            timeframe: 'M15',
            session: breakout.session,
            detectedAt: new Date().toISOString(),
            isBreakoutWindow: breakout.isBreakoutWindow,
            breakoutDetected: breakout.breakoutDetected,
            breakoutDirection: breakout.breakoutDirection,
            breakoutStrength: breakout.breakoutStrength,
            priceVsRange: breakout.priceVsRange,
            breakoutDistance: breakout.breakoutDistance,
            volumeConfirmed: breakout.volumeConfirmed,
            signal: breakout.signal,
            approachingBreakout: breakout.approachingBreakout,
            approachingDirection: breakout.approachingDirection,
            rangePosition: breakout.rangePosition,
            preSessionRange: breakout.preSessionRange,
            minutesSinceOpen: breakout.minutesSinceOpen,
            source: 'independent_m15',
          };
        }

        await new Promise(resolve => setTimeout(resolve, 8000));
      } catch (err: any) {
        const errMsg = `${rawSymbol}: ${err.message || 'Unknown error'}`;
        state.errors = [errMsg, ...state.errors.slice(0, 9)];
      }
    }

    state.lastPollTime = new Date().toISOString();
    state.pollCount++;
  } catch (err: any) {
    state.errors = [`Poll error: ${err.message}`, ...state.errors.slice(0, 9)];
  } finally {
    state.isPolling = false;
  }
}

export function getIndependentBreakoutForSymbol(userId: number, symbol: string): BreakoutResult | null {
  const state = monitorStates[userId];
  if (!state) return null;

  const key = symbol.toUpperCase().replace('/', '');
  const result = state.results[key];
  if (!result) return null;

  const age = Date.now() - new Date(result.detectedAt).getTime();
  if (age > 10 * 60 * 1000) return null;

  return result;
}

export function getIndependentBreakoutStatus(userId: number): {
  session: { inWindow: boolean; session: string; minutesSinceOpen: number };
  results: Record<string, BreakoutResult>;
  lastPollTime: string | null;
  pollCount: number;
  monitorActive: boolean;
  errors: string[];
} {
  const state = monitorStates[userId];
  const sessionCheck = isInSessionWindow();

  return {
    session: sessionCheck,
    results: state?.results || {},
    lastPollTime: state?.lastPollTime || null,
    pollCount: state?.pollCount || 0,
    monitorActive: state?.isPolling || false,
    errors: state?.errors?.slice(0, 5) || [],
  };
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export function startBreakoutMonitor(): void {
  if (pollInterval) return;

  console.log('Independent breakout monitor started (M15 polling during session windows)');

  pollInterval = setInterval(async () => {
    const sessionCheck = isInSessionWindow();
    if (!sessionCheck.inWindow) return;

    const allUserIds = Object.keys((global as any).mt5ConnectedPairs || {}).map(Number);
    for (const userId of allUserIds) {
      try {
        await pollBreakoutsForUser(userId);
      } catch (err) {
      }
    }
  }, 90 * 1000);

  setTimeout(async () => {
    const sessionCheck = isInSessionWindow();
    if (!sessionCheck.inWindow) return;

    const allUserIds = Object.keys((global as any).mt5ConnectedPairs || {}).map(Number);
    for (const userId of allUserIds) {
      try {
        await pollBreakoutsForUser(userId);
      } catch (err) {
      }
    }
  }, 5000);
}

export function stopBreakoutMonitor(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('Independent breakout monitor stopped');
  }
}
