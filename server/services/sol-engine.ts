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
  type: 'info' | 'signal' | 'shield' | 'trigger' | 'kelly' | 'goal' | 'strategy';
  message: string;
  timestamp: string;
}

export interface SolStrategy {
  id: string;
  name: string;
  icon: string;
  description: string;
  minConfidence: number;
  maxRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  baseFraction: number;
  minSignal: 'BUY' | 'STRONG_BUY';
  holdTarget: string;
  dexPreference?: string;
}

export interface SolWeeklyGoal {
  targetSol: number;
  targetPct: number;
  startPortfolio: number;
  currentProfitSol: number;
  phase: 'idle' | 'warming_up' | 'building' | 'accelerating' | 'cruising' | 'pushing' | 'target_reached';
  weekStart: number;
  winStreak: number;
  tradeHistory: Array<{
    timestamp: string;
    symbol: string;
    sol: number;
    gainPct: number;
    outcome: 'WIN' | 'LOSS';
    strategy: string;
  }>;
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
  weeklyGoal: SolWeeklyGoal;
  activeStrategy: string;
}

const DEX_NAMES = ['raydium', 'orca', 'meteora', 'pumpfun', 'jupiter'];

export const SOL_STRATEGIES: SolStrategy[] = [
  {
    id: 'momentum_surfer',
    name: 'Momentum Surfer',
    icon: '🏄',
    description: 'Rides strong directional price momentum with buy pressure confirmation',
    minConfidence: 70,
    maxRisk: 'MEDIUM',
    baseFraction: 0.03,
    minSignal: 'BUY',
    holdTarget: '1–4h',
  },
  {
    id: 'breakout_hunter',
    name: 'Breakout Hunter',
    icon: '🚀',
    description: 'Targets tokens breaking out of consolidation on strong buy signals',
    minConfidence: 75,
    maxRisk: 'MEDIUM',
    baseFraction: 0.025,
    minSignal: 'STRONG_BUY',
    holdTarget: '30min–2h',
  },
  {
    id: 'dip_sniper',
    name: 'Dip Sniper',
    icon: '🎯',
    description: 'Enters on brief pullbacks in overall uptrends — low risk entries',
    minConfidence: 68,
    maxRisk: 'LOW',
    baseFraction: 0.02,
    minSignal: 'BUY',
    holdTarget: '2–8h',
  },
  {
    id: 'meme_velocity',
    name: 'Meme Velocity',
    icon: '⚡',
    description: 'Captures explosive meme token moves with quick in-out on Pump.fun',
    minConfidence: 65,
    maxRisk: 'HIGH',
    baseFraction: 0.04,
    minSignal: 'BUY',
    holdTarget: '10–15min',
    dexPreference: 'pumpfun',
  },
  {
    id: 'whale_follower',
    name: 'Whale Follower',
    icon: '🐋',
    description: 'Tracks large wallet accumulation patterns and high maker counts',
    minConfidence: 72,
    maxRisk: 'MEDIUM',
    baseFraction: 0.02,
    minSignal: 'BUY',
    holdTarget: '4–24h',
  },
  {
    id: 'volume_explosion',
    name: 'Volume Explosion',
    icon: '💥',
    description: 'Enters tokens with sudden 3x+ volume spikes on strong buy signals',
    minConfidence: 65,
    maxRisk: 'MEDIUM',
    baseFraction: 0.035,
    minSignal: 'STRONG_BUY',
    holdTarget: '20–45min',
  },
  {
    id: 'smart_money_flow',
    name: 'Smart Money Flow',
    icon: '🧠',
    description: 'Institutional-grade entries on high-confidence, low-risk accumulation',
    minConfidence: 78,
    maxRisk: 'LOW',
    baseFraction: 0.025,
    minSignal: 'STRONG_BUY',
    holdTarget: '1–3 days',
  },
  {
    id: 'liquidity_sweep',
    name: 'Liquidity Sweep',
    icon: '🌊',
    description: 'Scalps sharp moves after liquidity pool sweeps — small, frequent gains',
    minConfidence: 60,
    maxRisk: 'HIGH',
    baseFraction: 0.01,
    minSignal: 'BUY',
    holdTarget: '10–30min',
  },
];

const DEFAULT_CONFIG: SolEngineConfig = {
  dexFilter: 'all',
  minConfidence: 65,
  maxTokens: 10,
  useKelly: false,
  shieldEnabled: true,
  shieldThreshold: 10,
  adaptiveScan: true,
};

const DEFAULT_WEEKLY_GOAL: SolWeeklyGoal = {
  targetSol: 0,
  targetPct: 0,
  startPortfolio: 0,
  currentProfitSol: 0,
  phase: 'idle',
  weekStart: 0,
  winStreak: 0,
  tradeHistory: [],
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
    weeklyGoal: { ...DEFAULT_WEEKLY_GOAL },
    activeStrategy: 'momentum_surfer',
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
  const fractional = Math.max(0.005, Math.min(0.15, kelly * 0.25));
  return Math.round(portfolioSol * fractional * 1000) / 1000;
}

function getPhaseMultiplier(phase: SolWeeklyGoal['phase'], winStreak: number): number {
  switch (phase) {
    case 'warming_up': return 0.8;
    case 'building': return 1.0;
    case 'accelerating': return 1.25;
    case 'cruising': return 1.0;
    case 'pushing': return Math.min(2.0, 1.5 + (winStreak >= 3 ? 0.25 : 0));
    case 'target_reached': return 0.5;
    default: return 1.0;
  }
}

function computeGoalPhase(goal: SolWeeklyGoal): SolWeeklyGoal['phase'] {
  if (goal.targetSol <= 0 || goal.phase === 'idle') return 'idle';
  const pct = goal.currentProfitSol / goal.targetSol;
  if (pct >= 1.0) return 'target_reached';
  if (pct >= 0.85) return 'pushing';
  if (pct >= 0.70) return 'cruising';
  if (pct >= 0.50) return 'accelerating';
  if (pct >= 0.20) return 'building';
  return 'warming_up';
}

function computeAutoSolSize(state: SolEngineState, dex: string): number {
  const portfolio = state.currentPortfolioValue;
  if (portfolio <= 0) return 0;

  const strategy = SOL_STRATEGIES.find(s => s.id === state.activeStrategy) || SOL_STRATEGIES[0];
  const phaseMultiplier = getPhaseMultiplier(state.weeklyGoal.phase, state.weeklyGoal.winStreak);

  let fraction = strategy.baseFraction * phaseMultiplier;

  if (state.config.useKelly) {
    const stats = state.kellyStats[dex] || { wins: 0, losses: 0, totalGainPct: 0 };
    const kellySize = calculateSolKellySize(stats.wins, stats.losses, stats.totalGainPct, portfolio);
    if (kellySize > 0) {
      const kellyFrac = kellySize / portfolio;
      fraction = (fraction + kellyFrac) / 2;
    }
  }

  fraction = Math.max(0.005, Math.min(0.15, fraction));
  return Math.round(portfolio * fraction * 1000) / 1000;
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

      if ((analysis.signal === 'STRONG_BUY' || analysis.signal === 'BUY') && state.currentPortfolioValue > 0) {
        const dexKey = (analysis.token.dexId || '').toLowerCase().split('_')[0];
        const autoSize = computeAutoSolSize(state, dexKey);
        if (autoSize > 0) {
          analysis.recommendedSolAmount = autoSize;
        }
      }
    }

    state.lastResults = scanResult;

    const label = triggerToken ? ` (trigger: ${triggerToken})` : '';
    const intervalSec = getAdaptiveScanInterval(state.config) / 1000;
    const buys = scanResult.filter(t => t.signal === 'STRONG_BUY' || t.signal === 'BUY').length;
    const shieldNote = shieldFilter ? ' 🛡️' : '';
    const strategy = SOL_STRATEGIES.find(s => s.id === state.activeStrategy);
    const stratNote = strategy ? ` [${strategy.icon}${strategy.name}]` : '';
    addActivity(state, {
      type: 'info',
      message: `🔍 Scanned ${scanResult.length} tokens${label}${shieldNote}${stratNote} — ${buys} buy signal${buys !== 1 ? 's' : ''} found. Next in ${intervalSec}s`,
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

    if (state.currentPortfolioValue > 0) {
      for (const analysis of scanResult) {
        if ((analysis.signal === 'STRONG_BUY' || analysis.signal === 'BUY') && analysis.recommendedSolAmount && analysis.recommendedSolAmount > 0) {
          const dexKey = (analysis.token.dexId || '').toLowerCase().split('_')[0];
          const phase = state.weeklyGoal.phase;
          const mult = getPhaseMultiplier(phase, state.weeklyGoal.winStreak);
          addActivity(state, {
            type: 'kelly',
            message: `📐 Auto-size: ${analysis.token.symbol} on ${dexKey} → ${analysis.recommendedSolAmount.toFixed(3)} SOL (${mult}× ${phase.replace('_', ' ')})`,
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
  if (existing) {
    state.weeklyGoal = existing.weeklyGoal;
    state.activeStrategy = existing.activeStrategy;
    state.signalWeights = existing.signalWeights;
    state.kellyStats = existing.kellyStats;
    state.sessionHighWatermark = existing.sessionHighWatermark;
    state.currentPortfolioValue = existing.currentPortfolioValue;
    state.shieldActive = existing.shieldActive;
  }
  state.isRunning = true;
  engineStates.set(userId, state);

  const intervalSec = getAdaptiveScanInterval(fullConfig) / 1000;
  const window = intervalSec === 30 ? 'peak hours (13–20 UTC)'
    : intervalSec === 60 ? 'standard hours'
    : 'overnight / weekend';
  const strategy = SOL_STRATEGIES.find(s => s.id === state.activeStrategy);
  addActivity(state, {
    type: 'info',
    message: `🚀 Sol Engine started — ${strategy?.icon || ''}${strategy?.name || 'momentum'} strategy — scanning every ${intervalSec}s (${window})`,
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
    return {
      running: false,
      activityFeed: [],
      signalWeights: Object.fromEntries(DEX_NAMES.map(d => [d, 1.0])),
      shieldActive: false,
      lastResults: [],
      kellyStats: {},
      lastMacro: null,
      weeklyGoal: { ...DEFAULT_WEEKLY_GOAL },
      activeStrategy: 'momentum_surfer',
    };
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
    weeklyGoal: state.weeklyGoal,
    activeStrategy: state.activeStrategy,
  };
}

export function getSolStrategies(): SolStrategy[] {
  return SOL_STRATEGIES;
}

export function setSolStrategy(userId: number, strategyId: string): { success: boolean; strategy?: SolStrategy } {
  const strategy = SOL_STRATEGIES.find(s => s.id === strategyId);
  if (!strategy) return { success: false };

  let state = engineStates.get(userId);
  if (!state) {
    state = createInitialState({ ...DEFAULT_CONFIG });
    engineStates.set(userId, state);
  }
  state.activeStrategy = strategyId;
  addActivity(state, {
    type: 'strategy',
    message: `${strategy.icon} Strategy switched to ${strategy.name} — min ${strategy.minConfidence}% confidence, ${strategy.baseFraction * 100}% base size, ${strategy.holdTarget} hold`,
  });
  return { success: true, strategy };
}

export function setSolWeeklyGoal(userId: number, params: { targetSol?: number; targetPct?: number }): { success: boolean } {
  let state = engineStates.get(userId);
  if (!state) {
    state = createInitialState({ ...DEFAULT_CONFIG });
    engineStates.set(userId, state);
  }

  const portfolio = state.currentPortfolioValue;
  let targetSol = params.targetSol || 0;
  let targetPct = params.targetPct || 0;

  if (targetPct > 0 && portfolio > 0 && targetSol <= 0) {
    targetSol = portfolio * (targetPct / 100);
  } else if (targetSol > 0 && portfolio > 0 && targetPct <= 0) {
    targetPct = (targetSol / portfolio) * 100;
  }

  if (targetSol <= 0) return { success: false };

  state.weeklyGoal = {
    targetSol,
    targetPct,
    startPortfolio: portfolio,
    currentProfitSol: 0,
    phase: 'warming_up',
    weekStart: Date.now(),
    winStreak: 0,
    tradeHistory: [],
  };

  addActivity(state, {
    type: 'goal',
    message: `🎯 Weekly goal set: +${targetSol.toFixed(3)} SOL (${targetPct.toFixed(1)}%) — Phase: WARMING UP (0.8× size)`,
  });

  return { success: true };
}

export function resetSolWeeklyGoal(userId: number): { success: boolean } {
  const state = engineStates.get(userId);
  if (!state) return { success: false };
  state.weeklyGoal = { ...DEFAULT_WEEKLY_GOAL };
  addActivity(state, { type: 'goal', message: '🔄 Weekly goal reset — back to idle' });
  return { success: true };
}

export function recordSolSignalResult(
  userId: number,
  params: { dex: string; outcome: 'WIN' | 'LOSS'; gainPct: number; symbol?: string; sol?: number }
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
    state.weeklyGoal.winStreak = (state.weeklyGoal.winStreak || 0) + 1;
    addActivity(state, {
      type: 'signal',
      message: `✅ WIN logged: ${params.symbol || dex} +${params.gainPct.toFixed(1)}% → ${dex} weight now ${state.signalWeights[dex].toFixed(2)} | Streak: ${state.weeklyGoal.winStreak}`,
    });
  } else {
    state.signalWeights[dex] = Math.max(0.2, state.signalWeights[dex] - 0.08);
    state.kellyStats[dex].losses++;
    state.weeklyGoal.winStreak = 0;
    addActivity(state, {
      type: 'signal',
      message: `❌ LOSS logged: ${params.symbol || dex} → ${dex} weight now ${state.signalWeights[dex].toFixed(2)} | Streak reset`,
    });
  }

  if (state.weeklyGoal.phase !== 'idle') {
    const solAmount = params.sol || 0;
    const gainSol = params.outcome === 'WIN' ? solAmount * (params.gainPct / 100) : -(solAmount * 0.05);

    state.weeklyGoal.currentProfitSol += gainSol;
    state.weeklyGoal.tradeHistory.unshift({
      timestamp: new Date().toISOString(),
      symbol: params.symbol || dex,
      sol: solAmount,
      gainPct: params.outcome === 'WIN' ? params.gainPct : -5,
      outcome: params.outcome,
      strategy: state.activeStrategy,
    });
    if (state.weeklyGoal.tradeHistory.length > 100) {
      state.weeklyGoal.tradeHistory = state.weeklyGoal.tradeHistory.slice(0, 100);
    }

    const prevPhase = state.weeklyGoal.phase;
    const newPhase = computeGoalPhase(state.weeklyGoal);
    if (newPhase !== prevPhase) {
      state.weeklyGoal.phase = newPhase;
      const mult = getPhaseMultiplier(newPhase, state.weeklyGoal.winStreak);
      const phaseNames: Record<string, string> = {
        warming_up: '🔵 WARMING UP', building: '🔵 BUILDING', accelerating: '🟡 ACCELERATING',
        cruising: '🟢 CRUISING', pushing: '🟠 PUSHING', target_reached: '🏆 TARGET REACHED',
      };
      addActivity(state, {
        type: 'goal',
        message: `${phaseNames[newPhase] || newPhase} — position size now ${mult}× | Progress: ${((state.weeklyGoal.currentProfitSol / state.weeklyGoal.targetSol) * 100).toFixed(1)}% of goal`,
      });
    }
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
