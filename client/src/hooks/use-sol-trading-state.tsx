/**
 * use-sol-trading-state — shared daily P&L, goals, strategy & auto-stop state
 * Persists to localStorage. Daily gain array resets at midnight.
 */
import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';

export type StrategyId =
  | 'sniper_entry'
  | 'momentum_scalp'
  | 'micro_compounder'
  | 'breakout_hunter'
  | 'new_listing_flip'
  | 'sol_arb';

export interface TradePoint {
  time: string;          // ISO timestamp
  label: string;         // e.g. "SOL/USDC"
  pnlUsd: number;        // P&L for this single trade
  cumPct: number;        // cumulative % gain at this point
  cumUsd: number;        // cumulative USD gain
}

export interface SolTradingState {
  // Daily tracking
  dailyTrades: TradePoint[];
  currentCumPct: number;
  currentCumUsd: number;
  sessionStartTime: string;      // ISO — when session started (midnight reset)

  // Goals
  dailyGoalPct: number;          // e.g. 8 → +8%
  dailyLossLimitPct: number;     // e.g. -3 → stop at -3%

  // Strategy
  activeStrategy: StrategyId;
  comboMode: boolean;
  comboSecondary: StrategyId | null;

  // Auto-stop
  isAutoStopped: boolean;
  autoStopReason: 'goal_reached' | 'loss_limit' | null;

  // Actions
  addTrade: (trade: Omit<TradePoint, 'cumPct' | 'cumUsd'> & { portfolioValueUsd: number }) => void;
  setDailyGoal: (pct: number) => void;
  setLossLimit: (pct: number) => void;
  setStrategy: (id: StrategyId) => void;
  setComboMode: (enabled: boolean, secondary?: StrategyId | null) => void;
  resumeEngine: () => void;
  resetDay: () => void;
}

const LS_KEY = 'vedd_sol_trading_state';

interface PersistedState {
  dailyTrades: TradePoint[];
  currentCumPct: number;
  currentCumUsd: number;
  sessionStartTime: string;
  dailyGoalPct: number;
  dailyLossLimitPct: number;
  activeStrategy: StrategyId;
  comboMode: boolean;
  comboSecondary: StrategyId | null;
  isAutoStopped: boolean;
  autoStopReason: 'goal_reached' | 'loss_limit' | null;
}

function getMidnight(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function loadState(): PersistedState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return defaultPersisted();
    const parsed: PersistedState = JSON.parse(raw);
    // Reset if session started before today's midnight
    if (new Date(parsed.sessionStartTime) < new Date(getMidnight())) {
      return { ...parsed, dailyTrades: [], currentCumPct: 0, currentCumUsd: 0, isAutoStopped: false, autoStopReason: null, sessionStartTime: getMidnight() };
    }
    return parsed;
  } catch {
    return defaultPersisted();
  }
}

function defaultPersisted(): PersistedState {
  return {
    dailyTrades: [],
    currentCumPct: 0,
    currentCumUsd: 0,
    sessionStartTime: getMidnight(),
    dailyGoalPct: 8,
    dailyLossLimitPct: -3,
    activeStrategy: 'micro_compounder',
    comboMode: false,
    comboSecondary: null,
    isAutoStopped: false,
    autoStopReason: null,
  };
}

const SolTradingContext = createContext<SolTradingState | null>(null);

export function SolTradingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PersistedState>(() => loadState());

  // Persist on every change
  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }, [state]);

  // Midnight reset check
  useEffect(() => {
    const interval = setInterval(() => {
      const midnight = getMidnight();
      if (new Date(state.sessionStartTime) < new Date(midnight)) {
        setState(prev => ({
          ...prev,
          dailyTrades: [],
          currentCumPct: 0,
          currentCumUsd: 0,
          isAutoStopped: false,
          autoStopReason: null,
          sessionStartTime: midnight,
        }));
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [state.sessionStartTime]);

  const addTrade = useCallback((
    trade: Omit<TradePoint, 'cumPct' | 'cumUsd'> & { portfolioValueUsd: number }
  ) => {
    setState(prev => {
      const newCumUsd = prev.currentCumUsd + trade.pnlUsd;
      const newCumPct = trade.portfolioValueUsd > 0
        ? (newCumUsd / trade.portfolioValueUsd) * 100
        : prev.currentCumPct + (trade.pnlUsd / 100);

      const point: TradePoint = {
        time: trade.time,
        label: trade.label,
        pnlUsd: trade.pnlUsd,
        cumPct: newCumPct,
        cumUsd: newCumUsd,
      };

      let isAutoStopped = prev.isAutoStopped;
      let autoStopReason = prev.autoStopReason;

      if (!isAutoStopped) {
        if (newCumPct >= prev.dailyGoalPct) {
          isAutoStopped = true;
          autoStopReason = 'goal_reached';
        } else if (newCumPct <= prev.dailyLossLimitPct) {
          isAutoStopped = true;
          autoStopReason = 'loss_limit';
        }
      }

      return {
        ...prev,
        dailyTrades: [...prev.dailyTrades, point],
        currentCumPct: newCumPct,
        currentCumUsd: newCumUsd,
        isAutoStopped,
        autoStopReason,
      };
    });
  }, []);

  const setDailyGoal = useCallback((pct: number) => {
    setState(prev => ({ ...prev, dailyGoalPct: pct }));
  }, []);

  const setLossLimit = useCallback((pct: number) => {
    setState(prev => ({ ...prev, dailyLossLimitPct: pct }));
  }, []);

  const setStrategy = useCallback((id: StrategyId) => {
    setState(prev => ({ ...prev, activeStrategy: id }));
  }, []);

  const setComboMode = useCallback((enabled: boolean, secondary?: StrategyId | null) => {
    setState(prev => ({ ...prev, comboMode: enabled, comboSecondary: secondary ?? prev.comboSecondary }));
  }, []);

  const resumeEngine = useCallback(() => {
    setState(prev => ({ ...prev, isAutoStopped: false, autoStopReason: null }));
  }, []);

  const resetDay = useCallback(() => {
    setState(prev => ({
      ...prev,
      dailyTrades: [],
      currentCumPct: 0,
      currentCumUsd: 0,
      isAutoStopped: false,
      autoStopReason: null,
      sessionStartTime: getMidnight(),
    }));
  }, []);

  const value: SolTradingState = {
    ...state,
    addTrade,
    setDailyGoal,
    setLossLimit,
    setStrategy,
    setComboMode,
    resumeEngine,
    resetDay,
  };

  return <SolTradingContext.Provider value={value}>{children}</SolTradingContext.Provider>;
}

export function useSolTradingState(): SolTradingState {
  const ctx = useContext(SolTradingContext);
  if (!ctx) throw new Error('useSolTradingState must be inside SolTradingProvider');
  return ctx;
}
