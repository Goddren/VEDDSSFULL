import { scanAndAnalyzeTokens, fetchCryptoMacroContext, type DexSource, type TokenAnalysis, type CryptoMacroContext } from '../solana-scanner';

export interface SolEngineConfig {
  dexFilter: DexSource;
  minConfidence: number;
  maxTokens: number;
  useKelly: boolean;
  shieldEnabled: boolean;
  shieldThreshold: number;
  adaptiveScan: boolean;
}

export interface SolActivityEntry {
  type: 'info' | 'signal' | 'shield' | 'trigger' | 'kelly';
  message: string;
  timestamp: string;
}

interface SolEngineState {
  isRunning: boolean;
  config: SolEngineConfig;
  lastScanAt: number;
  lastTokenSnapshot: Record<string, { volume: number; price: number; signal: string; confidence: number }>;
  lastTriggerAt: Record<string, number>;
  activityFeed: SolActivityEntry[];
  signalWeights: Record<string, number>;
  kellyStats: Record<string, { wins: number; losses: number; totalGainPct: number }>;
  sessionHighWatermark: number;
  currentPortfolioValue: number;
  shieldActive: boolean;
  scanTimer: NodeJS.Timeout | null;
  lastResults: TokenAnalysis[];
  lastMacro: CryptoMacroContext | null;
}

const DEX_NAMES = ['raydium', 'orca', 'meteora', 'pumpfun', 'jupiter'];

const DEFAULT_CONFIG: SolEngineConfig = {
  dexFilter: 'all',
  minConfidence: 65,
  maxTokens: 10,
  useKelly: false,
  shieldEnabled: true,
  shieldThreshold: 10,
  adaptiveScan: true,
};

const engineStates = new Map<number, SolEngineState>();

function createInitialState(config: SolEngineConfig): SolEngineState {
  return {
    isRunning: false,
    config,
    lastScanAt: 0,
    lastTokenSnapshot: {},
    lastTriggerAt: {},
    activityFeed: [],
    signalWeights: Object.fromEntries(DEX_NAMES.map(d => [d, 1.0])),
    kellyStats: Object.fromEntries(DEX_NAMES.map(d => [d, { wins: 0, losses: 0, totalGainPct: 0 }])),
    sessionHighWatermark: 0,
    currentPortfolioValue: 0,
    shieldActive: false,
    scanTimer: null,
    lastResults: [],
    lastMacro: null,
  };
}

function addActivity(state: SolEngineState, entry: Omit<SolActivityEntry, 'timestamp'>) {
  state.activityFeed.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (state.activityFeed.length > 100) state.activityFeed = state.activityFeed.slice(0, 100);
}

function getAdaptiveScanInterval(config: SolEngineConfig): number {
  if (!config.adaptiveScan) return 60000;
  const hourUtc = new Date().getUTCHours();
  const dayUtc = new Date().getUTCDay();
  if (dayUtc === 0 || dayUtc === 6) return 120000;
  if (hourUtc >= 13 && hourUtc < 20) return 30000;
  if (hourUtc >= 7 && hourUtc < 13) return 60000;
  return 120000;
}

function calculateSolKellySize(wins: number, losses: number, totalGainPct: number, portfolioSol: number): number {
  const total = wins + losses;
  if (total < 3 || portfolioSol <= 0) return 0;
  const winRate = wins / total;
  const avgGain = wins > 0 ? totalGainPct / wins / 100 : 0.5;
  const kelly = winRate - (1 - winRate) / Math.max(avgGain, 0.01);
  const fractional = Math.max(0.01, Math.min(0.10, kelly * 0.25));
  return Math.round(portfolioSol * fractional * 1000) / 1000;
}

async function runScan(userId: number, state: SolEngineState, triggerToken?: string) {
  if (!state.isRunning) return;
  try {
    const macro = await fetchCryptoMacroContext().catch(() => null);
    state.lastMacro = macro;

    const shieldFilter = state.config.shieldEnabled && state.shieldActive;

    const scanResult = await scanAndAnalyzeTokens(
      state.config.maxTokens,
      state.config.dexFilter,
      {
        signalWeights: state.signalWeights,
        macro: macro || undefined,
        kellyStats: state.config.useKelly ? state.kellyStats : undefined,
        portfolioSol: state.currentPortfolioValue,
        shieldActive: shieldFilter,
        minConfidence: state.config.minConfidence,
      }
    );

    const now = Date.now();
    state.lastScanAt = now;

    for (const dex of DEX_NAMES) {
      state.signalWeights[dex] = Math.round((state.signalWeights[dex] * 0.99 + 1.0 * 0.01) * 1000) / 1000;
    }

    for (const analysis of scanResult) {
      const key = analysis.token.address;
      const prev = state.lastTokenSnapshot[key];
      if (prev && analysis.token.volume24h > 0 && prev.volume > 0) {
        const volumeMultiple = analysis.token.volume24h / prev.volume;
        const lastTrigger = state.lastTriggerAt[key] || 0;
        if (volumeMultiple >= 3 && now - lastTrigger > 60000) {
          state.lastTriggerAt[key] = now;
          addActivity(state, {
            type: 'trigger',
            message: `⚡ Volume spike on ${analysis.token.symbol} (${volumeMultiple.toFixed(1)}x surge) — rescanning in 8s`,
          });
          setTimeout(() => runScan(userId, state, analysis.token.symbol), 8000);
        }
      }
      state.lastTokenSnapshot[key] = {
        volume: analysis.token.volume24h,
        price: parseFloat(analysis.token.priceUsd) || 0,
        signal: analysis.signal,
        confidence: analysis.confidence,
      };
    }

    state.lastResults = scanResult;

    const label = triggerToken ? ` (trigger: ${triggerToken})` : '';
    const intervalSec = getAdaptiveScanInterval(state.config) / 1000;
    const buys = scanResult.filter(t => t.signal === 'STRONG_BUY' || t.signal === 'BUY').length;
    const shieldNote = shieldFilter ? ' 🛡️' : '';
    addActivity(state, {
      type: 'info',
      message: `🔍 Scanned ${scanResult.length} tokens${label}${shieldNote} — ${buys} buy signal${buys !== 1 ? 's' : ''} found. Next in ${intervalSec}s`,
    });

    if (macro) {
      const btcStr = `BTC ${macro.btcChange >= 0 ? '+' : ''}${macro.btcChange.toFixed(1)}%`;
      const ethStr = `ETH ${macro.ethChange >= 0 ? '+' : ''}${macro.ethChange.toFixed(1)}%`;
      const solStr = `SOL ${macro.solChange >= 0 ? '+' : ''}${macro.solChange.toFixed(1)}%`;
      addActivity(state, {
        type: 'info',
        message: `📊 Macro: ${btcStr} • ${ethStr} • ${solStr} → ${macro.bias}`,
      });
    }

    if (state.config.useKelly && state.currentPortfolioValue > 0) {
      for (const analysis of scanResult) {
        if ((analysis.signal === 'STRONG_BUY' || analysis.signal === 'BUY') && analysis.recommendedSolAmount && analysis.recommendedSolAmount > 0) {
          const dex = (analysis.token.dexId || '').toLowerCase().split('_')[0];
          addActivity(state, {
            type: 'kelly',
            message: `📐 Kelly: ${analysis.token.symbol} on ${dex} → recommend ${analysis.recommendedSolAmount.toFixed(3)} SOL`,
          });
        }
      }
    }

  } catch (err) {
    addActivity(state, {
      type: 'info',
      message: `⚠️ Scan error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }

  if (state.isRunning) {
    const nextMs = getAdaptiveScanInterval(state.config);
    state.scanTimer = setTimeout(() => runScan(userId, state), nextMs);
  }
}

export function startSolEngine(userId: number, config: Partial<SolEngineConfig> = {}): void {
  const existing = engineStates.get(userId);
  if (existing?.isRunning) stopSolEngine(userId);

  const fullConfig: SolEngineConfig = { ...DEFAULT_CONFIG, ...config };
  const state = createInitialState(fullConfig);
  state.isRunning = true;
  engineStates.set(userId, state);

  const intervalSec = getAdaptiveScanInterval(fullConfig) / 1000;
  const window = intervalSec === 30 ? 'peak hours (13–20 UTC)'
    : intervalSec === 60 ? 'standard hours'
    : 'overnight / weekend';
  addActivity(state, {
    type: 'info',
    message: `🚀 Sol Engine started — scanning every ${intervalSec}s (${window})`,
  });

  runScan(userId, state);
}

export function stopSolEngine(userId: number): void {
  const state = engineStates.get(userId);
  if (!state) return;
  state.isRunning = false;
  if (state.scanTimer) { clearTimeout(state.scanTimer); state.scanTimer = null; }
  addActivity(state, { type: 'info', message: '🛑 Sol Engine stopped' });
}

export function getSolEngineStatus(userId: number) {
  const state = engineStates.get(userId);
  if (!state) {
    return { running: false, activityFeed: [], signalWeights: Object.fromEntries(DEX_NAMES.map(d => [d, 1.0])), shieldActive: false, lastResults: [], kellyStats: {}, lastMacro: null };
  }
  return {
    running: state.isRunning,
    config: state.config,
    activityFeed: state.activityFeed.slice(0, 20),
    signalWeights: state.signalWeights,
    kellyStats: state.kellyStats,
    shieldActive: state.shieldActive,
    sessionHighWatermark: state.sessionHighWatermark,
    currentPortfolioValue: state.currentPortfolioValue,
    lastScanAt: state.lastScanAt,
    lastResults: state.lastResults,
    lastMacro: state.lastMacro,
  };
}

export function recordSolSignalResult(
  userId: number,
  params: { dex: string; outcome: 'WIN' | 'LOSS'; gainPct: number }
): { success: boolean } {
  const state = engineStates.get(userId);
  if (!state) return { success: false };

  const dex = (params.dex || 'unknown').toLowerCase().replace(/[^a-z]/g, '') || 'unknown';
  if (!state.signalWeights[dex]) state.signalWeights[dex] = 1.0;
  if (!state.kellyStats[dex]) state.kellyStats[dex] = { wins: 0, losses: 0, totalGainPct: 0 };

  if (params.outcome === 'WIN') {
    state.signalWeights[dex] = Math.min(2.0, state.signalWeights[dex] + 0.05);
    state.kellyStats[dex].wins++;
    state.kellyStats[dex].totalGainPct += Math.abs(params.gainPct);
    addActivity(state, {
      type: 'signal',
      message: `✅ WIN logged: ${dex} +${params.gainPct.toFixed(1)}% → weight now ${state.signalWeights[dex].toFixed(2)}`,
    });
  } else {
    state.signalWeights[dex] = Math.max(0.2, state.signalWeights[dex] - 0.08);
    state.kellyStats[dex].losses++;
    addActivity(state, {
      type: 'signal',
      message: `❌ LOSS logged: ${dex} → weight now ${state.signalWeights[dex].toFixed(2)}`,
    });
  }
  return { success: true };
}

export function updateSolPortfolioValue(userId: number, solValue: number): { shieldActive: boolean } {
  const state = engineStates.get(userId);
  if (!state) return { shieldActive: false };

  state.currentPortfolioValue = solValue;
  if (solValue > state.sessionHighWatermark) state.sessionHighWatermark = solValue;

  if (!state.config.shieldEnabled) return { shieldActive: false };

  const threshold = state.config.shieldThreshold / 100;
  const triggerLevel = state.sessionHighWatermark * (1 - threshold);
  const disengageLevel = state.sessionHighWatermark * 0.97;

  if (!state.shieldActive && state.sessionHighWatermark > 0 && solValue < triggerLevel) {
    state.shieldActive = true;
    const dropPct = ((1 - solValue / state.sessionHighWatermark) * 100).toFixed(1);
    addActivity(state, {
      type: 'shield',
      message: `🛡️ DRAWDOWN SHIELD ACTIVATED — portfolio dropped ${dropPct}% from peak (${state.sessionHighWatermark.toFixed(3)} SOL). Restricting to LOW risk / 85%+ confidence only.`,
    });
  } else if (state.shieldActive && solValue >= disengageLevel) {
    state.shieldActive = false;
    addActivity(state, { type: 'shield', message: '✅ Drawdown shield disengaged — full scan resumed' });
  }

  return { shieldActive: state.shieldActive };
}
