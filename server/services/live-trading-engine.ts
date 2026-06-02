import { marketDataService } from '../market-data/service';
import { executeMT5SignalOnTradeLocker, warmTradeLockerConnection } from '../tradelocker';
import { computeAllAdvancedIndicators, type CandleData } from '../indicators';
import { storage } from '../storage';
import { newsService } from '../news-service';
import { getPipSize } from '../utils/pipUtils';
import { detectBOSCHOCH, detectWyckoff, type BOSCHOCHResult, type WyckoffResult } from '../utils/smcUtils';
import { getPremiumDiscountContext } from '../utils/ictMacroUtils';
import { buildTransitionMatrix } from './markov-chain';
import { computeBreakoutScore } from '../utils/breakoutEngine';

interface HTFBiasData {
  trend: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bosChoch: BOSCHOCHResult;
  premiumDiscount: { zone: 'PREMIUM' | 'DISCOUNT' | 'EQUILIBRIUM'; aligns: boolean; description: string };
  wyckoff: WyckoffResult;
}

interface VolumeMetrics {
  currentVolume: number;
  avgVolume: number;
  relativeVolume: number;
  volumeTrend: 'surging' | 'above_average' | 'average' | 'below_average' | 'dry';
  volumeSpikes: number;
  isHighActivity: boolean;
}

function computeVolumeMetrics(bars: Array<{ volume: number }>): VolumeMetrics {
  if (!bars || bars.length < 5) {
    return { currentVolume: 0, avgVolume: 0, relativeVolume: 0, volumeTrend: 'below_average', volumeSpikes: 0, isHighActivity: false };
  }

  const volumes = bars.map(b => b.volume);
  const currentVolume = volumes[volumes.length - 1] || 0;
  const avgVolume = volumes.reduce((a, b) => a + b, 0) / volumes.length;
  const relativeVolume = avgVolume > 0 ? Math.round((currentVolume / avgVolume) * 100) / 100 : 1;

  const stdDev = Math.sqrt(volumes.reduce((sum, v) => sum + Math.pow(v - avgVolume, 2), 0) / volumes.length);
  const spikeThreshold = avgVolume + 2 * stdDev;
  const volumeSpikes = volumes.filter(v => v > spikeThreshold).length;

  const recentAvg = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const olderAvg = volumes.slice(0, -5).reduce((a, b) => a + b, 0) / Math.max(volumes.length - 5, 1);
  const volumeRatio = olderAvg > 0 ? recentAvg / olderAvg : 1;

  let volumeTrend: VolumeMetrics['volumeTrend'] = 'average';
  if (relativeVolume >= 2.0 || volumeRatio >= 1.8) volumeTrend = 'surging';
  else if (relativeVolume >= 1.3) volumeTrend = 'above_average';
  else if (relativeVolume <= 0.5) volumeTrend = 'dry';
  else if (relativeVolume <= 0.7) volumeTrend = 'below_average';

  return {
    currentVolume,
    avgVolume: Math.round(avgVolume),
    relativeVolume,
    volumeTrend,
    volumeSpikes,
    isHighActivity: relativeVolume >= 1.3,
  };
}

interface NewsContext {
  headlines: string[];
  economicEvents: string[];
  highImpactSoon: boolean;
  marketSentiment: string;
  tradingWindowWarning: string | null;
}

async function fetchNewsContext(pairs: string[]): Promise<NewsContext> {
  const context: NewsContext = {
    headlines: [],
    economicEvents: [],
    highImpactSoon: false,
    marketSentiment: 'neutral',
    tradingWindowWarning: null,
  };

  try {
    if (!newsService.isInitialized()) {
      newsService.initialize();
    }

    const [marketNews, calendar] = await Promise.all([
      newsService.fetchMarketNews('forex').catch(() => []),
      newsService.fetchEconomicCalendar(1).catch(() => []),
    ]);

    if (marketNews && marketNews.length > 0) {
      context.headlines = marketNews.slice(0, 8).map((n: any) => n.headline);

      let bullish = 0, bearish = 0;
      for (const n of marketNews.slice(0, 10)) {
        const h = (n.headline || '').toLowerCase();
        if (h.includes('rally') || h.includes('surge') || h.includes('gain') || h.includes('rise') || h.includes('bullish') || h.includes('boost')) bullish++;
        if (h.includes('fall') || h.includes('drop') || h.includes('crash') || h.includes('bear') || h.includes('decline') || h.includes('slump')) bearish++;
      }
      context.marketSentiment = bullish > bearish + 1 ? 'bullish' : bearish > bullish + 1 ? 'bearish' : 'neutral';
    }

    if (calendar && calendar.length > 0) {
      const now = Date.now();
      const twoHoursMs = 2 * 60 * 60 * 1000;

      const relevantCurrencies = new Set<string>();
      for (const pair of pairs) {
        relevantCurrencies.add(pair.substring(0, 3));
        relevantCurrencies.add(pair.substring(3, 6));
      }

      for (const event of calendar) {
        const eventCurrency = (event.currency || '').toUpperCase();
        const isRelevant = relevantCurrencies.has(eventCurrency) || eventCurrency === 'USD';
        if (!isRelevant && event.impact !== 'high') continue;

        const eventStr = `[${event.impact?.toUpperCase() || 'LOW'}] ${event.country || ''} ${event.event || ''} (${event.time || 'TBD'})${event.forecast ? ` F:${event.forecast}` : ''}${event.previous ? ` P:${event.previous}` : ''}`;
        context.economicEvents.push(eventStr);

        if (event.impact === 'high') {
          const timeStr = event.time || '';
          if (timeStr) {
            const [h, m] = timeStr.split(':').map(Number);
            if (!isNaN(h) && h >= 0 && h <= 23) {
              const today = new Date();
              const eventDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), h, m || 0, 0, 0));
              const diff = eventDate.getTime() - now;
              if (diff > -5 * 60000 && diff < twoHoursMs) {
                context.highImpactSoon = true;
                const minsAway = Math.round(diff / 60000);
                context.tradingWindowWarning = `HIGH IMPACT EVENT ${minsAway > 0 ? `in ${minsAway} minutes` : 'HAPPENING NOW'}: ${event.event} (${eventCurrency}). Consider widening stops or avoiding new entries for affected pairs.`;
              }
            }
          }
        }
      }
      context.economicEvents = context.economicEvents.slice(0, 12);
    }
  } catch (err) {
    console.log('News context fetch error (non-fatal):', (err as any)?.message);
  }

  return context;
}

interface LiveEngineConfig {
  userId: number;
  scanIntervalMs: number;
  pairs: string[];
  strategyMode: string;
  maxOpenTrades: number;
  riskPerTrade: number;
  minConfidence: number;
  maxLotSize: number;
  enablePositionManagement: boolean;
  trailingStopEnabled: boolean;
  trailingStopATRMultiplier: number;
  trailMethod: 'staged_volume' | 'chandelier' | 'r_multiple' | 'swing_structure' | 'parabolic_sar' | 'none' | 'fixed_pip' | 'profit_lock' | 'stepped_fixed';
  weeklyProfitTarget: number;
  accountBalance: number;
  enableCompounding: boolean;
  baseLotSize: number;
  propFirmMode: boolean;
  propFirmDailyDrawdownLimit: number;
  // Acceleration features
  adaptiveScanInterval: boolean;
  enablePyramiding: boolean;
  useKellyCriterion: boolean;
  brainLearningMode: boolean;
  drawdownShieldThreshold: number;
  // Safety
  dailyLossLimit: number;
  maxDailyTrades: number;                      // hard daily trade cap across all pairs (0 = unlimited)
  directionFilter: 'buy_only' | 'sell_only' | 'both'; // restrict signal direction (global)
  pairDirectionOverrides: Record<string, 'buy_only' | 'sell_only' | 'both'>; // per-pair overrides
  // ORB Autonomous mode: fire 9:30 AM opening range breakout trades autonomously
  enableORBAutonomous: boolean;
  // Composite Autonomous mode: fire trades directly from Markov×Polymarket (crypto only)
  enableCompositeAutonomous: boolean;
  compositeMinEdgeScore: number; // 0-100, default 72 — minimum edge score to fire autonomous trade
  // AI cost control
  aiMode: 'full' | 'economy' | 'rule_based';
  // R-Multiple: pip buffer above entry at 1R stage
  breakevenBufferPips: number;
  // Extended trail config
  trailFixedPips: number;        // fixed_pip + stepped_fixed: pip distance from price peak to SL
  trailStepPips: number;         // stepped_fixed: minimum pip improvement before SL moves
  trailProfitLockPct: number;    // profit_lock: % of peak profit to lock in (0-100)
  trailActivationPips: number;   // all server-side methods: don't activate trail until X pips in profit
  trailSarInitialAF: number;     // parabolic_sar: starting acceleration factor (default 0.02)
  trailSarMaxAF: number;         // parabolic_sar: maximum acceleration factor (default 0.20)
}

interface LiveActivity {
  id: string;
  timestamp: string;
  type: 'scan' | 'signal' | 'trade_open' | 'trade_close' | 'position_update' | 'error' | 'info' | 'ai_decision';
  symbol?: string;
  direction?: string;
  message: string;
  details?: any;
  confidence?: number;
}

export interface PendingMT5Signal {
  id: string;
  timestamp: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  action: 'OPEN' | 'CLOSE' | 'MODIFY' | 'CLOSE_ALL';
  lotSize: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  confidence: number;
  reason: string;
  holdTime: string;
  strategy: string;
  confluences: string[];
  status: 'pending' | 'executed' | 'rejected' | 'expired';
  modifyAction?: string;
  positionId?: string | null;
}

// Legacy flat queue kept for backwards-compat reads (alias = 'default')
// All writes go through broadcastMT5Signal() which fans out to per-alias queues.
const mt5AccountQueues: Record<number, Record<string, PendingMT5Signal[]>> = {};

// Registry of connected MT5 terminals: mt5AccountRegistry[userId][alias]
export interface MT5AccountInfo {
  alias: string;
  label: string;
  accountNumber: string;
  lastSeen: number;        // Date.now() ms
  receiveSignals: boolean; // whether this terminal should receive AI signals
}
const mt5AccountRegistry: Record<number, Record<string, MT5AccountInfo>> = {};

/** Push a signal to all registered alias queues (or 'default' if none registered). */
function broadcastMT5Signal(userId: number, signal: PendingMT5Signal): void {
  if (!mt5AccountQueues[userId]) mt5AccountQueues[userId] = {};
  const registry = mt5AccountRegistry[userId] || {};
  const activeAliases = Object.entries(registry)
    .filter(([, info]) => info.receiveSignals)
    .map(([alias]) => alias);
  const targets = activeAliases.length > 0 ? activeAliases : ['default'];
  for (const alias of targets) {
    if (!mt5AccountQueues[userId][alias]) mt5AccountQueues[userId][alias] = [];
    mt5AccountQueues[userId][alias].push({ ...signal });
    if (mt5AccountQueues[userId][alias].length > 200) {
      mt5AccountQueues[userId][alias] = mt5AccountQueues[userId][alias].slice(-100);
    }
  }
}

// ---------------------------------------------------------------------------
// MT5 Account registry helpers (exported for routes.ts)
// ---------------------------------------------------------------------------
export function registerMT5Account(
  userId: number,
  alias: string,
  info: { label?: string; accountNumber?: string; receiveSignals?: boolean }
): MT5AccountInfo {
  if (!mt5AccountRegistry[userId]) mt5AccountRegistry[userId] = {};
  const existing = mt5AccountRegistry[userId][alias];
  const updated: MT5AccountInfo = {
    alias,
    label: info.label ?? existing?.label ?? alias,
    accountNumber: info.accountNumber ?? existing?.accountNumber ?? '',
    lastSeen: Date.now(),
    receiveSignals: info.receiveSignals ?? existing?.receiveSignals ?? true,
  };
  mt5AccountRegistry[userId][alias] = updated;
  return updated;
}

export function heartbeatMT5Account(userId: number, alias: string): boolean {
  if (!mt5AccountRegistry[userId]?.[alias]) return false;
  mt5AccountRegistry[userId][alias].lastSeen = Date.now();
  return true;
}

export function getMT5Accounts(userId: number): MT5AccountInfo[] {
  const registry = mt5AccountRegistry[userId] || {};
  const now = Date.now();
  // Mark stale (> 3 min since last heartbeat)
  return Object.values(registry).map(a => ({ ...a, online: now - a.lastSeen < 3 * 60 * 1000 }));
}

export function setMT5AccountReceiveSignals(userId: number, alias: string, receive: boolean): boolean {
  if (!mt5AccountRegistry[userId]?.[alias]) return false;
  mt5AccountRegistry[userId][alias].receiveSignals = receive;
  return true;
}

interface GoalTracker {
  weeklyTarget: number;
  startBalance: number;
  currentProfit: number;
  progressPercent: number;
  weekStartedAt: string;
  dailyPnL: Record<string, number>;
  wins: number;
  losses: number;
  winRate: number;
  consecutiveWins: number;
  consecutiveLosses: number;
  bestTrade: { symbol: string; profit: number; strategy: string } | null;
  worstTrade: { symbol: string; profit: number; strategy: string } | null;
  strategyBreakdown: Record<string, { trades: number; wins: number; pnl: number }>;
  sessionBreakdown: Record<string, { trades: number; wins: number; pnl: number }>;
  symbolBreakdown: Record<string, { trades: number; wins: number; losses: number; pnl: number; bestTrade: number; worstTrade: number }>;
  pairStrategyBreakdown: Record<string, { trades: number; wins: number; losses: number; pnl: number }>;
  compoundMultiplier: number;
  currentPhase: 'warming_up' | 'building' | 'accelerating' | 'cruising' | 'pushing' | 'target_reached';
  phasePlan: string;
  kellyStats: Record<string, { wins: number; losses: number; totalRR: number }>;
}

interface PyramidEntry {
  positionId: string;
  entryPrice: number;
  direction: string;
  symbol: string;
  lotSize: number;
  pyramidCount: number;
}

interface EngineState {
  status: 'stopped' | 'running' | 'paused';
  startedAt: string | null;
  config: LiveEngineConfig;
  scanCount: number;
  signalsGenerated: number;
  tradesExecuted: number;
  /** Trades opened today — resets at UTC midnight. Enforces maxDailyTrades. */
  tradesOpenedToday: number;
  tradesOpenedTodayDate: string; // YYYY-MM-DD UTC
  tradesFailed: number;
  positionsManaged: number;
  lastScanAt: string | null;
  lastSignalAt: string | null;
  currentlyScanning: boolean;
  activityLog: LiveActivity[];
  openPositionCount: number;
  pnlSession: number;
  marketSnapshot: Record<string, { price: number; change: number; trend: string; rsi: number; atr: number; updatedAt: string; adx?: number; plusDI?: number; minusDI?: number; volumeTrend?: string; relativeVolume?: number; lastConfirmedCandle?: { open: number; close: number } | null }>;
  goalTracker: GoalTracker;
  modelLocked: boolean;
  asiaRangeHigh: Record<string, number>;
  asiaRangeLow: Record<string, number>;
  asiaRangeDate: string | null;
  lastHighImpactNewsAt: string | null;
  // Acceleration features
  strategyPerformanceWeights: Record<string, number>;
  sessionHighWatermark: number;
  drawdownShieldActive: boolean;
  openPyramidPositions: Record<string, PyramidEntry>;
  lastFridayClose: Record<string, number>;
  lastIndicatorSnapshot: Record<string, any>;
  lastTriggerAt: Record<string, number>;
  pnlToday: number;
  dailyLossHalted: boolean;
  dailyLossHaltedAt: string | null;
  tradesSinceLastLearn: number;
  positionTrailState: Record<string, { highestHigh: number; lowestLow: number; sar: number; ep: number; af: number; bullish: boolean }>;
  aiResponseCache: Record<string, { ts: number; price: number; response: any }>;
  htfBiasCache: Record<string, HTFBiasData>;
  // Post-loss same-direction lock: { [symbol]: { direction: 'BUY'|'SELL'; lockedUntil: number } }
  // After a loss on a pair, the same direction is blocked for 45 min unless 85%+ confidence + surging volume
  pairDirectionLock: Record<string, { direction: string; lockedUntil: number; lossCount: number }>;
  /** Last time a Composite Autonomous trade fired per crypto pair (ms timestamp) */
  compositeLastFiredAt: Record<string, number>;
  /** ORB Autonomous: tracks which pairs already traded today — value = YYYY-MM-DD */
  orbDailyFired: Record<string, string>;
}

const engineStates: Record<number, EngineState> = {};
const engineIntervals: Record<number, ReturnType<typeof setInterval>> = {};
const engineTimers: Record<number, ReturnType<typeof setTimeout>> = {};
const brainLearningIntervals: Record<number, ReturnType<typeof setInterval>> = {};

async function autoRetainBrain(userId: number, _attempt = 0): Promise<void> {
  try {
    const fn = (global as any).runBrainLearning;
    if (typeof fn !== 'function') {
      // Race condition guard: routes may not have finished registering yet.
      // Retry up to 3 times with a 5-second delay before giving up.
      if (_attempt < 3) {
        setTimeout(() => autoRetainBrain(userId, _attempt + 1), 5000);
      }
      return;
    }
    const brain = await fn(userId);
    const count = brain?.totalTradesAnalyzed ?? 0;
    addActivity(userId, { type: 'info', message: `🧠 Brain auto-retrained from ${count} trades across ${brain?.pairsLearned ?? 0} pairs` });
    // T004: auto-generate autonomous signals after every retrain
    autoGenerateBrainSignals(userId, brain).catch(() => {});
  } catch (e) {
    // silent — don't crash engine if brain retrain fails
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAIN ENFORCER (T002) — hard pre-trade filter based on learned knowledge
// ─────────────────────────────────────────────────────────────────────────────
interface BrainEnforcementResult {
  allowed: boolean;
  reason: string;
  adjustedLotMultiplier: number;
  forcedStrategy: string | null;
  recommendedTrailPips: number;
}

function applyBrainEnforcement(
  userId: number,
  symbol: string,
  proposedDirection: string | null,
  currentATR: number,
  newsContext?: any,
): BrainEnforcementResult {
  const passthrough: BrainEnforcementResult = {
    allowed: true, reason: 'pass', adjustedLotMultiplier: 1.0,
    forcedStrategy: null, recommendedTrailPips: 20,
  };

  const brain = (global as any).veddAIBrain?.[userId];
  if (!brain?.pairKnowledge) return passthrough;

  const k = brain.pairKnowledge[symbol];
  if (!k || k.totalTrades < 3) return passthrough; // not enough data to enforce

  const now = new Date();
  const hour = now.getUTCHours();
  const session = hour < 7 ? 'Asian' : hour < 13 ? 'London' : hour < 20 ? 'New York' : 'Late NY';

  // ── RULE 1: Session block ──────────────────────────────────────────────
  const sessionData = k.topSessions?.find((s: any) => s.session === session);
  if (sessionData && sessionData.total >= 3 && sessionData.winRate < 45) {
    const msg = `🧠 Brain block: ${symbol} ${session} session only ${sessionData.winRate}% WR (${sessionData.total} trades) — below 45% threshold, skipping`;
    pushEnforcementLog(userId, { symbol, rule: 'session_block', direction: proposedDirection, reason: msg });
    return { ...passthrough, allowed: false, reason: msg };
  }

  // ── RULE 2: Hour block ────────────────────────────────────────────────
  const worstHourData = k.worstHours?.find((h: any) => h.hour === hour && h.total >= 3 && h.winRate < 40);
  if (worstHourData) {
    const msg = `🧠 Brain block: ${symbol} hour ${hour}:00 UTC only ${worstHourData.winRate}% WR — loss zone`;
    pushEnforcementLog(userId, { symbol, rule: 'hour_block', direction: proposedDirection, reason: msg });
    return { ...passthrough, allowed: false, reason: msg };
  }

  // ── RULE 3: Direction bias — 3-tier system ───────────────────────────
  // Tier 1 (<15 trades): not enough data — no enforcement at all
  // Tier 2 (15–29 trades, WR 20–39%): allowed but lot reduced to 0.7x (soft caution)
  // Tier 3 (30+ trades, WR <20%): statistically confirmed losing direction — hard block
  if (proposedDirection && k.totalTrades >= 15) {
    const dirWR = proposedDirection === 'BUY' ? (k.buyWinRate ?? 50) : (k.sellWinRate ?? 50);
    if (k.totalTrades >= 30 && dirWR < 20) {
      const msg = `🧠 Brain block: ${symbol} ${proposedDirection} ${dirWR}% WR over ${k.totalTrades} trades — statistically losing direction, hard blocked`;
      pushEnforcementLog(userId, { symbol, rule: 'direction_bias', direction: proposedDirection, reason: msg });
      return { ...passthrough, allowed: false, reason: msg };
    }
    if (dirWR >= 20 && dirWR < 40) {
      const msg = `⚠️ Brain caution: ${symbol} ${proposedDirection} ${dirWR}% WR (${k.totalTrades} trades) — trade allowed at 70% lot size`;
      pushEnforcementLog(userId, { symbol, rule: 'direction_caution', direction: proposedDirection, reason: msg });
      return {
        allowed: true,
        reason: msg,
        adjustedLotMultiplier: 0.7,
        forcedStrategy: k.bestStrategies?.[0] || null,
        recommendedTrailPips: k.optimalTrailPips || 20,
      };
    }
  }

  // ── RULE 4: Hard news block ───────────────────────────────────────────
  if (newsContext?.highImpactSoon) {
    const currencies = extractCurrenciesFromSymbol(symbol);
    const events: string[] = newsContext.economicEvents || [];
    const newsBlocked = events.some((ev: string) =>
      currencies.some(c => ev.toUpperCase().includes(c))
    );
    if (newsBlocked) {
      const msg = `🧠 News block: ${symbol} — high-impact event affecting ${currencies.join('/')} within 30min`;
      pushEnforcementLog(userId, { symbol, rule: 'news_block', direction: proposedDirection, reason: msg });
      return { ...passthrough, allowed: false, reason: msg };
    }
  }

  // ── RULE 5: Consecutive loss cooldown ─────────────────────────────────
  if (k.consecutiveLossesToday >= 3 && k.lastLossAt) {
    const msSinceLoss = Date.now() - new Date(k.lastLossAt).getTime();
    const THREE_HOURS = 3 * 60 * 60 * 1000;
    if (msSinceLoss < THREE_HOURS) {
      const minsLeft = Math.ceil((THREE_HOURS - msSinceLoss) / 60000);
      const msg = `🧠 Cooldown: ${symbol} — 3 consecutive losses, cooling for ${minsLeft} more min (3-hour lock)`;
      pushEnforcementLog(userId, { symbol, rule: 'loss_cooldown', direction: proposedDirection, reason: msg });
      return { ...passthrough, allowed: false, reason: msg };
    }
  }

  // ── RULE 6: ATR volatility filter ─────────────────────────────────────
  if (currentATR > 0 && k.minProfitableATR > 0 && currentATR < k.minProfitableATR * 0.5) {
    const msg = `🧠 ATR filter: ${symbol} ATR ${currentATR.toFixed(5)} below profitable threshold ${(k.minProfitableATR * 0.5).toFixed(5)}`;
    pushEnforcementLog(userId, { symbol, rule: 'atr_filter', direction: proposedDirection, reason: msg });
    return { ...passthrough, allowed: false, reason: msg };
  }

  // ── ALLOWED — return tuned parameters ────────────────────────────────
  pushEnforcementLog(userId, { symbol, rule: 'pass', direction: proposedDirection, reason: `✅ ${symbol} passed all brain filters` });
  return {
    allowed: true,
    reason: 'pass',
    adjustedLotMultiplier: Math.min(1.5, Math.max(0.5, k.recommendedLotMultiplier || 1.0)),
    forcedStrategy: k.bestStrategies?.[0] || null,
    recommendedTrailPips: k.optimalTrailPips || 20,
  };
}

function extractCurrenciesFromSymbol(symbol: string): string[] {
  const s = symbol.toUpperCase().replace('/', '');
  // Common 3-char currency codes
  if (s.length >= 6) return [s.slice(0, 3), s.slice(3, 6)];
  if (s === 'XAUUSD') return ['XAU', 'USD'];
  if (s === 'XAGUSD') return ['XAG', 'USD'];
  return [s];
}

function pushEnforcementLog(userId: number, entry: { symbol: string; rule: string; direction: string | null; reason: string }) {
  if (!(global as any).veddAIBrain) (global as any).veddAIBrain = {};
  if (!(global as any).veddAIBrain[userId]) (global as any).veddAIBrain[userId] = {};
  if (!(global as any).veddAIBrain[userId].enforcementLog) {
    (global as any).veddAIBrain[userId].enforcementLog = [];
  }
  const log = (global as any).veddAIBrain[userId].enforcementLog as any[];
  log.unshift({ ...entry, timestamp: new Date().toISOString() });
  if (log.length > 50) log.length = 50;
}

// T004: Auto-generate autonomous signals after brain retrain
async function autoGenerateBrainSignals(userId: number, brain: any): Promise<void> {
  let openai: any;
  try {
    if (!brain?.pairKnowledge || Object.keys(brain.pairKnowledge).length === 0) return;
    const { getUniversalAIClientForUser } = await import('../openai');
    try { openai = await getUniversalAIClientForUser(userId); } catch { return; }

    const connectedPairs = (global as any).mt5ConnectedPairs?.[userId] || {};
    const lastChartData = (global as any).mt5LastChartData?.[userId] || {};
    const openPositions = (global as any).mt5OpenPositions?.[userId]?.positions || [];
    const state = engineStates[userId];
    const strategyMode = state?.config?.strategyMode || 'sniper';

    const liveContext: Record<string, any> = {};
    for (const [sym, knowledge] of Object.entries(brain.pairKnowledge) as any[]) {
      const pairData = Object.values(connectedPairs).find((p: any) =>
        (p.symbol || '').toUpperCase().replace('/', '') === sym
      ) as any;
      const chartSnap = lastChartData[sym];
      liveContext[sym] = {
        ...knowledge,
        currentPrice: pairData?.price || chartSnap?.close || null,
        currentSignal: pairData?.signal || null,
        rsi: chartSnap?.rsi || null,
        trend: chartSnap?.trend || null,
        hasOpenPosition: openPositions.some((p: any) =>
          (p.symbol || '').toUpperCase().replace('/', '') === sym
        ),
      };
    }

    const nowUTC = new Date();
    const currentHour = nowUTC.getUTCHours();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentSession = currentHour < 7 ? 'Asian' : currentHour < 13 ? 'London' : currentHour < 20 ? 'New York' : 'Late NY';

    const prompt = `You are VEDD SS AI - autonomous self-learning trading engine. Generate proactive trade signals from learned knowledge.

CURRENT CONTEXT: ${nowUTC.toISOString()} | ${currentSession} session | ${dayNames[nowUTC.getUTCDay()]} | Strategy: ${strategyMode.toUpperCase()}

LEARNED BRAIN DATA (${brain.totalTradesAnalyzed} historical trades):
${JSON.stringify(liveContext, null, 1)}

BRAIN INSIGHTS:
${(brain.learningInsights || []).join('\n')}

Generate signals for pairs with strong learned edge. Respect session win-rates. Respond ONLY with valid JSON:
{"signals":[{"symbol":"XAUUSD","direction":"BUY","confidence":82,"entryZone":2315.00,"stopLoss":2305.00,"takeProfit":2335.00,"lotSize":0.01,"holdTime":"2-4hrs","reason":"Brain: 78% WR London session, preferred BUY direction","riskScore":3}],"marketRead":"Brief overview","brainConfidence":75}`;

    const resp = await openai.chat.completions.create({
      model: openai.defaultModel || 'gpt-4o',
      messages: [
        { role: 'system', content: 'You are VEDD SS AI. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 2000,
      temperature: 0.3,
    });

    const content = resp.choices[0]?.message?.content || '';
    let signals: any;
    try { signals = JSON.parse(content); } catch { return; }

    if (!(global as any).veddAIBrain[userId]) (global as any).veddAIBrain[userId] = {};
    (global as any).veddAIBrain[userId].lastAutonomousSignals = {
      signals: signals.signals || [],
      marketRead: signals.marketRead || '',
      brainConfidence: signals.brainConfidence || 0,
      generatedAt: new Date().toISOString(),
      strategyMode,
      autoScheduled: true,
    };

    const sigCount = signals.signals?.length || 0;
    if (sigCount > 0 && state) {
      addActivity(userId, {
        type: 'info',
        message: `🧠 Brain auto-generated ${sigCount} autonomous signal${sigCount !== 1 ? 's' : ''} (${strategyMode.toUpperCase()} mode) | Brain confidence: ${signals.brainConfidence || 'N/A'}%`,
      });
    }
  } catch (err: any) {
    const errMsg = err?.message || '';
    const errStatus = err?.status || err?.statusCode || 0;
    const isAuthError = errStatus === 401 || errMsg.includes('Incorrect API key') || errMsg.includes('invalid_api_key') || errMsg.includes('authentication_error') || errMsg.includes('401');
    if (isAuthError && openai?.provider && openai.provider !== 'platform') {
      try {
        const { db } = await import('../db');
        const { userApiKeys: uak } = await import('../../shared/schema');
        const { and, eq } = await import('drizzle-orm');
        await db.update(uak)
          .set({ isValid: false, lastValidated: new Date() })
          .where(and(eq(uak.userId, userId), eq(uak.provider, openai.provider)));
      } catch { /* ignore DB error */ }
      addActivity(userId, { type: 'error', message: `${openai.provider} API key invalid — auto-disabled. Brain engine will switch to your next active provider.` });
    }
    // otherwise silent — don't crash engine
  }
}
const goalTrackerCache: Record<string, GoalTracker> = {};

// All 16 strategy keys for weight initialisation
const ALL_STRATEGY_KEYS = [
  'scalping','momentum','session_breakout','aggressive','sniper','compound',
  'chart_pattern','ict_order_blocks','ict_fvg','ict_liquidity_sweep','ict_bos','ict_ote',
  'smc_demand_supply','asia_range_breakout','vwap_mean_reversion','news_fade',
  'prop_firm_sniper','sunday_gap',
];

function getAdaptiveScanInterval(config: LiveEngineConfig): number {
  if (!config.adaptiveScanInterval) return config.scanIntervalMs;
  const hourUtc = new Date().getUTCHours();
  const dayUtc = new Date().getUTCDay(); // 0=Sun, 6=Sat
  if (dayUtc === 0 || dayUtc === 6) return 180000; // weekends
  if (hourUtc >= 13 && hourUtc < 16) return 15000;  // London/NY overlap
  if ((hourUtc >= 7 && hourUtc < 13) || (hourUtc >= 16 && hourUtc < 20)) return 30000; // London or NY
  if (hourUtc >= 0 && hourUtc < 7) return 90000;    // Asian session
  return 180000; // off-hours
}

function calculateKellyFraction(wins: number, losses: number, totalRR: number): number {
  const total = wins + losses;
  if (total < 5) return 0.01; // need at least 5 trades before Kelly kicks in
  const winRate = wins / total;
  const avgRR = wins > 0 ? totalRR / wins : 1.5;
  const kelly = winRate - (1 - winRate) / Math.max(avgRR, 0.1);
  const fractionalKelly = kelly * 0.25; // 25% fractional Kelly for safety
  return Math.min(0.03, Math.max(0.005, fractionalKelly)); // clamp 0.5%–3%
}

// ─── Dynamic Lot Sizing Multipliers ──────────────────────────────────────────
// Three independent multipliers that combine to scale the base lot:
//
//  1. Confidence tier — rewards high-conviction signals with more size
//  2. Strategy tier  — rare sniper setups get more than frequent scalps
//  3. Exposure tier  — reduces size as more positions are already open
//
// Final lot = baseLot × confidenceMult × strategyMult × exposureMult
// All multipliers are capped so total lot never exceeds config.maxLotSize.

function getConfidenceLotMultiplier(confidence: number): { mult: number; label: string } {
  if (confidence >= 93) return { mult: 1.5,  label: `A+ (${confidence}% ≥93%) → 1.5×` };
  if (confidence >= 88) return { mult: 1.25, label: `A  (${confidence}% ≥88%) → 1.25×` };
  if (confidence >= 83) return { mult: 1.0,  label: `B  (${confidence}% ≥83%) → 1.0×` };
  if (confidence >= 78) return { mult: 0.75, label: `C  (${confidence}% ≥78%) → 0.75×` };
  return                        { mult: 0.5,  label: `D  (${confidence}%  <78%) → 0.5×` };
}

function getStrategyLotMultiplier(strategy: string): { mult: number; label: string } {
  const s = strategy.toLowerCase();
  // Tier 1 — rare, high-conviction setups: sniper / ICT / prop-firm
  if (['prop_firm_sniper','ict_ote','ict_order_blocks','sniper','smc_demand_supply'].includes(s)) {
    return { mult: 1.2, label: `sniper-tier (${s}) → 1.2×` };
  }
  // Tier 2 — standard momentum / swing setups
  if (['momentum','swing','breakout','asia_range_breakout','news_fade','sunday_gap'].includes(s)) {
    return { mult: 1.0, label: `standard-tier (${s}) → 1.0×` };
  }
  // Tier 3 — scalping / mean-reversion: high frequency, tighter margins
  if (['scalping','vwap_mean_reversion'].includes(s)) {
    return { mult: 0.8, label: `scalp-tier (${s}) → 0.8×` };
  }
  return { mult: 1.0, label: `default-tier (${s}) → 1.0×` };
}

function getExposureLotMultiplier(openPositions: number): { mult: number; label: string } {
  // Each additional open position reduces new trade size to contain total account exposure.
  // 0 open  → full size (no existing risk)
  // 1 open  → 85% (small existing exposure)
  // 2 open  → 70% (moderate exposure)
  // 3+ open → 55% (high exposure — be very selective)
  if (openPositions === 0) return { mult: 1.0,  label: `0 open → 1.0×` };
  if (openPositions === 1) return { mult: 0.85, label: `1 open → 0.85×` };
  if (openPositions === 2) return { mult: 0.70, label: `2 open → 0.70×` };
  return                           { mult: 0.55, label: `${openPositions} open → 0.55×` };
}

function addActivity(userId: number, activity: Omit<LiveActivity, 'id' | 'timestamp'>) {
  const state = engineStates[userId];
  if (!state) return;
  const entry: LiveActivity = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    ...activity,
  };
  state.activityLog.unshift(entry);
  if (state.activityLog.length > 100) state.activityLog = state.activityLog.slice(0, 100);
}

function getDefaultConfig(userId: number): LiveEngineConfig {
  return {
    userId,
    scanIntervalMs: 60000,
    pairs: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'],
    strategyMode: 'aggressive',
    maxOpenTrades: 5,
    riskPerTrade: 1,
    minConfidence: 70,
    maxLotSize: 0.10,
    enablePositionManagement: true,
    trailingStopEnabled: true,
    trailingStopATRMultiplier: 1.5,
    trailMethod: 'staged_volume',
    weeklyProfitTarget: 0,
    accountBalance: 0,
    enableCompounding: true,
    baseLotSize: 0.01,
    propFirmMode: false,
    propFirmDailyDrawdownLimit: 4,
    adaptiveScanInterval: true,
    enablePyramiding: false,
    useKellyCriterion: false,
    brainLearningMode: true,
    drawdownShieldThreshold: 3,
    dailyLossLimit: 5,
    maxDailyTrades: 0,
    directionFilter: 'both',
    pairDirectionOverrides: {},
    enableORBAutonomous: true,
    enableCompositeAutonomous: true,
    compositeMinEdgeScore: 72,
    aiMode: 'full',
    breakevenBufferPips: 5,
    trailFixedPips: 20,
    trailStepPips: 10,
    trailProfitLockPct: 60,
    trailActivationPips: 15,
    trailSarInitialAF: 0.02,
    trailSarMaxAF: 0.20,
  };
}

function createGoalTracker(config: LiveEngineConfig): GoalTracker {
  return {
    weeklyTarget: config.weeklyProfitTarget,
    startBalance: config.accountBalance,
    currentProfit: 0,
    progressPercent: 0,
    weekStartedAt: new Date().toISOString(),
    dailyPnL: {},
    wins: 0,
    losses: 0,
    winRate: 0,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    bestTrade: null,
    worstTrade: null,
    strategyBreakdown: {},
    sessionBreakdown: {},
    symbolBreakdown: {},
    pairStrategyBreakdown: {},
    compoundMultiplier: 1.0,
    currentPhase: 'warming_up',
    phasePlan: '',
    kellyStats: {},
  };
}

function getGoalPhase(tracker: GoalTracker): GoalTracker['currentPhase'] {
  if (tracker.weeklyTarget <= 0) return 'building';
  const pct = tracker.progressPercent;
  if (pct >= 100) return 'target_reached';
  if (pct >= 80) return 'pushing';
  if (pct >= 50) return 'cruising';
  if (pct >= 25) return 'accelerating';
  if (tracker.wins >= 3) return 'building';
  return 'warming_up';
}

function getCompoundMultiplier(tracker: GoalTracker, enableCompounding: boolean): number {
  if (!enableCompounding) return 1.0;
  let mult = 1.0;
  // ── Win streak: scale up gradually ──────────────────────────────────
  if (tracker.consecutiveWins >= 7) mult = 2.5;
  else if (tracker.consecutiveWins >= 5) mult = 2.0;
  else if (tracker.consecutiveWins >= 3) mult = 1.5;
  else if (tracker.consecutiveWins >= 2) mult = 1.25;
  // ── Loss streak: protect capital more aggressively ───────────────────
  // Applied AFTER win streak so losses always override
  if (tracker.consecutiveLosses >= 4) mult = 0.35; // heavy drawdown — near-minimum sizing
  else if (tracker.consecutiveLosses >= 3) mult = 0.5;
  else if (tracker.consecutiveLosses >= 2) mult = 0.75;
  // ── Late-stage goal protection: back off when nearly at target ───────
  if (tracker.progressPercent >= 90) mult = Math.min(mult, 0.75); // near target — protect gains
  else if (tracker.progressPercent >= 80) mult *= 0.85;
  return Math.round(mult * 100) / 100;
}

function getDaysRemaining(): number {
  const now = new Date();
  const dayOfWeek = now.getUTCDay();
  const daysLeft = dayOfWeek === 0 ? 5 : dayOfWeek === 6 ? 5 : 5 - dayOfWeek;
  return Math.max(1, daysLeft);
}

function getDailyTargetFromGoal(tracker: GoalTracker): number {
  if (tracker.weeklyTarget <= 0) return 0;
  const remaining = tracker.weeklyTarget - tracker.currentProfit;
  const daysLeft = getDaysRemaining();
  return Math.max(0, Math.round((remaining / daysLeft) * 100) / 100);
}

export function recordTradeResult(userId: number, result: {
  symbol: string;
  profit: number;
  strategy: string;
  session: string;
  // BUG 9 FIX: direction was missing from the interface — post-loss direction
  // lock (pairDirectionLock) and win-clear logic both read result.direction,
  // which was always undefined, making Gate 5 permanently non-functional.
  direction?: string;
}) {
  const state = engineStates[userId];
  if (!state) return;
  const tracker = state.goalTracker;

  tracker.currentProfit = Math.round((tracker.currentProfit + result.profit) * 100) / 100;
  tracker.progressPercent = tracker.weeklyTarget > 0
    ? Math.min(100, Math.max(0, Math.round((tracker.currentProfit / tracker.weeklyTarget) * 100)))
    : 0;

  const today = new Date().toISOString().split('T')[0];
  tracker.dailyPnL[today] = Math.round(((tracker.dailyPnL[today] || 0) + result.profit) * 100) / 100;

  if (result.profit > 0) {
    tracker.wins++;
    tracker.consecutiveWins++;
    tracker.consecutiveLosses = 0;
  } else {
    tracker.losses++;
    tracker.consecutiveLosses++;
    tracker.consecutiveWins = 0;
  }
  tracker.winRate = tracker.wins + tracker.losses > 0
    ? Math.round((tracker.wins / (tracker.wins + tracker.losses)) * 100)
    : 0;

  if (!tracker.bestTrade || result.profit > tracker.bestTrade.profit) {
    tracker.bestTrade = { symbol: result.symbol, profit: result.profit, strategy: result.strategy };
  }
  if (!tracker.worstTrade || result.profit < tracker.worstTrade.profit) {
    tracker.worstTrade = { symbol: result.symbol, profit: result.profit, strategy: result.strategy };
  }

  if (!tracker.strategyBreakdown[result.strategy]) {
    tracker.strategyBreakdown[result.strategy] = { trades: 0, wins: 0, pnl: 0 };
  }
  const sb = tracker.strategyBreakdown[result.strategy];
  sb.trades++;
  if (result.profit > 0) sb.wins++;
  sb.pnl = Math.round((sb.pnl + result.profit) * 100) / 100;

  if (!tracker.sessionBreakdown[result.session]) {
    tracker.sessionBreakdown[result.session] = { trades: 0, wins: 0, pnl: 0 };
  }
  const sessB = tracker.sessionBreakdown[result.session];
  sessB.trades++;
  if (result.profit > 0) sessB.wins++;
  sessB.pnl = Math.round((sessB.pnl + result.profit) * 100) / 100;

  if (!tracker.symbolBreakdown) tracker.symbolBreakdown = {};
  if (!tracker.symbolBreakdown[result.symbol]) {
    tracker.symbolBreakdown[result.symbol] = { trades: 0, wins: 0, losses: 0, pnl: 0, bestTrade: 0, worstTrade: 0 };
  }
  const sym = tracker.symbolBreakdown[result.symbol];
  sym.trades++;
  if (result.profit > 0) sym.wins++; else sym.losses++;
  sym.pnl = Math.round((sym.pnl + result.profit) * 100) / 100;
  if (result.profit > sym.bestTrade) sym.bestTrade = result.profit;
  if (result.profit < sym.worstTrade) sym.worstTrade = result.profit;

  if (!tracker.pairStrategyBreakdown) tracker.pairStrategyBreakdown = {};
  const psKey = `${result.symbol}|${result.strategy}`;
  if (!tracker.pairStrategyBreakdown[psKey]) {
    tracker.pairStrategyBreakdown[psKey] = { trades: 0, wins: 0, losses: 0, pnl: 0 };
  }
  const ps = tracker.pairStrategyBreakdown[psKey];
  ps.trades++;
  if (result.profit > 0) ps.wins++; else ps.losses++;
  ps.pnl = Math.round((ps.pnl + result.profit) * 100) / 100;

  tracker.compoundMultiplier = getCompoundMultiplier(tracker, state.config.enableCompounding);
  tracker.currentPhase = getGoalPhase(tracker);

  if (tracker.currentPhase === 'target_reached') {
    addActivity(userId, {
      type: 'info',
      message: `WEEKLY TARGET REACHED! $${tracker.currentProfit} profit achieved (target: $${tracker.weeklyTarget}). Switching to capital preservation mode.`,
    });
  }

  state.pnlSession = tracker.currentProfit;

  // ── Strategy Performance Weights (self-correction loop) ────────────
  if (!state.strategyPerformanceWeights) {
    state.strategyPerformanceWeights = Object.fromEntries(ALL_STRATEGY_KEYS.map(k => [k, 1.0]));
  }
  const strat = result.strategy;
  const weights = state.strategyPerformanceWeights;
  if (weights[strat] !== undefined) {
    weights[strat] = result.profit > 0
      ? Math.min(2.0, weights[strat] + 0.05)
      : Math.max(0.2, weights[strat] - 0.08);
  }
  // Mean-reversion decay — all weights drift back toward 1.0 by 1% per trade
  for (const k of Object.keys(weights)) {
    weights[k] = Math.round((weights[k] * 0.99 + 1.0 * 0.01) * 1000) / 1000;
  }

  // ── Kelly Criterion Stats Update ────────────────────────────────────
  if (!tracker.kellyStats) tracker.kellyStats = {};
  if (!tracker.kellyStats[strat]) tracker.kellyStats[strat] = { wins: 0, losses: 0, totalRR: 0 };
  const ks = tracker.kellyStats[strat];
  if (result.profit > 0) {
    ks.wins++;
    ks.totalRR += Math.abs(result.profit / Math.max(state.config.baseLotSize * 10, 0.01));
  } else {
    ks.losses++;
  }

  // ── Drawdown Shield ─────────────────────────────────────────────────
  if (!state.sessionHighWatermark) state.sessionHighWatermark = 0;
  // BUG 4 FIX: sessionHighWatermark was never reset between trading days,
  // so yesterday's peak permanently tripped today's shield from the first
  // trade. Reset both the watermark and shield at each calendar day boundary.
  {
    const shieldDate = new Date().toISOString().split('T')[0];
    if ((state as any)._shieldResetDate !== shieldDate) {
      (state as any)._shieldResetDate = shieldDate;
      state.sessionHighWatermark = 0;
      if (state.drawdownShieldActive) {
        state.drawdownShieldActive = false;
        addActivity(userId, { type: 'info', message: '🌅 New trading day — drawdown shield reset, watermark cleared.' });
      }
    }
  }
  if (state.pnlSession > state.sessionHighWatermark) {
    state.sessionHighWatermark = state.pnlSession;
  }
  const shieldThresholdDollar = state.config.accountBalance * (state.config.drawdownShieldThreshold || 3) / 100;
  const wasShieldActive = state.drawdownShieldActive;
  if (!state.drawdownShieldActive && state.pnlSession < state.sessionHighWatermark - shieldThresholdDollar && state.sessionHighWatermark > 0) {
    state.drawdownShieldActive = true;
    addActivity(userId, {
      type: 'info',
      message: `🛡️ DRAWDOWN SHIELD ACTIVATED — session dropped $${Math.abs(state.pnlSession - state.sessionHighWatermark).toFixed(2)} from peak $${state.sessionHighWatermark.toFixed(2)}. Switching to Sniper-only, 0.25% risk to protect gains.`,
    });
  } else if (wasShieldActive && state.pnlSession >= state.sessionHighWatermark - state.config.accountBalance * 0.01) {
    state.drawdownShieldActive = false;
    addActivity(userId, {
      type: 'info',
      message: `✅ Drawdown shield disengaged — session P&L recovered. Full strategy arsenal resuming.`,
    });
  }

  // ── Daily P&L tracking for loss limit ─────────────────────────────
  // Reset pnlToday on calendar day change (prevent yesterday's losses counting toward today's limit)
  const todayDate = new Date().toISOString().split('T')[0];
  if ((state as any)._pnlTodayDate !== todayDate) {
    (state as any)._pnlTodayDate = todayDate;
    state.pnlToday = 0;
  }
  state.pnlToday = Math.round((state.pnlToday + result.profit) * 100) / 100;
  checkDailyLossLimit(userId);

  // ── Decrement open position count on every trade close ────────────
  // openPositionCount was being incremented on open but never decremented —
  // causing it to accumulate and permanently block new trades after a few closes.
  if (state.openPositionCount > 0) {
    state.openPositionCount = Math.max(0, state.openPositionCount - 1);
  }

  // ── BUG 1 FIX: Clean up stale positionTrailState for closed pair ──
  // When a position on this symbol closes, remove its trail state so
  // that if the same symbol is re-entered the new position gets a clean
  // SAR/peak — not the values from the old trade which could be completely
  // wrong (e.g. a peak from +40% run applied to a fresh entry at current price).
  if (state.positionTrailState && result.symbol) {
    Object.keys(state.positionTrailState).forEach(key => {
      if (key === result.symbol || key.toUpperCase().includes(result.symbol.toUpperCase())) {
        delete state.positionTrailState[key];
      }
    });
  }

  // ── T003: Update per-pair consecutive loss tracking in brain ──────
  const brainForUser = (global as any).veddAIBrain?.[userId];
  if (brainForUser?.pairKnowledge?.[result.symbol]) {
    const pk = brainForUser.pairKnowledge[result.symbol];
    if (result.profit < 0) {
      pk.consecutiveLossesToday = (pk.consecutiveLossesToday || 0) + 1;
      pk.lastLossAt = new Date().toISOString();
    } else {
      pk.consecutiveLossesToday = 0; // reset on win
    }
  }

  // ── Post-loss direction lock ────────────────────────────────────────
  // After a loss on a pair, same direction is locked for 45 min.
  // This prevents "double-down" re-entries that compound losses.
  // Override is available for 85%+ confidence + surging volume (checked in processDecision).
  if (result.profit < 0 && result.symbol && result.direction) {
    if (!state.pairDirectionLock) state.pairDirectionLock = {};
    const existingLock = state.pairDirectionLock[result.symbol];
    const lossCount = existingLock?.direction === result.direction
      ? (existingLock.lossCount || 0) + 1
      : 1;
    // After 2 consecutive same-direction losses, extend lock to 90 minutes
    const lockMinutes = lossCount >= 2 ? 90 : 45;
    state.pairDirectionLock[result.symbol] = {
      direction: result.direction.toUpperCase(),
      lockedUntil: Date.now() + lockMinutes * 60 * 1000,
      lossCount,
    };
    addActivity(userId, {
      type: 'info',
      symbol: result.symbol,
      message: `🔒 Direction lock: ${result.symbol} ${result.direction} locked for ${lockMinutes} min after loss (loss #${lossCount}). Need 85%+ confidence + surging volume to override.`,
    });
  } else if (result.profit > 0 && result.symbol && result.direction) {
    // Win clears the direction lock for that pair
    if (state.pairDirectionLock?.[result.symbol]) {
      delete state.pairDirectionLock[result.symbol];
    }
  }

  // ── Auto-retrain brain every 3 trade results ───────────────────────
  state.tradesSinceLastLearn = (state.tradesSinceLastLearn || 0) + 1;
  if (state.tradesSinceLastLearn >= 3) {
    state.tradesSinceLastLearn = 0;
    autoRetainBrain(userId).then(() => {
      addActivity(userId, { type: 'info', message: '🧠 Brain updated after 3 new trade results' });
    });
  }

  const weekKey = `${userId}_${tracker.weekStartedAt.split('T')[0].substring(0, 8)}`;
  goalTrackerCache[weekKey] = { ...tracker };

  if (state.modelLocked && state.openPositionCount === 0) {
    state.modelLocked = false;
    addActivity(userId, {
      type: 'info',
      message: 'All positions closed — AI model switch lock released. You can now change models.',
    });
  }
}

function convertToCandles(bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>): CandleData[] {
  return bars.map(b => ({ t: b.timestamp, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }));
}

async function scanMarkets(userId: number): Promise<void> {
  const state = engineStates[userId];
  if (!state || state.status !== 'running' || state.currentlyScanning) return;

  state.currentlyScanning = true;
  state.scanCount++;
  state.lastScanAt = new Date().toISOString();

  try {
    if (!marketDataService.isInitialized()) {
      addActivity(userId, { type: 'error', message: 'Market data service not initialized. Check TWELVE_DATA_API_KEY.' });
      state.currentlyScanning = false;
      return;
    }

    const brain = (global as any).veddAIBrain?.[userId];
    const config = state.config;
    const pairsToScan = config.pairs.slice(0, 8);

    // ── Friday close capture (for Sunday gap scanner) ──────────────────
    const nowUtc2 = new Date();
    const dayOfWeek = nowUtc2.getUTCDay(); // 5=Friday
    const hourOfDay = nowUtc2.getUTCHours();
    const isFridayClose = dayOfWeek === 5 && hourOfDay >= 21 && hourOfDay < 22;

    // ── Adaptive scan interval log ─────────────────────────────────────
    const adaptiveMs = getAdaptiveScanInterval(config);
    const prevMs = (state as any)._lastAdaptiveMs || config.scanIntervalMs;
    if (adaptiveMs !== prevMs && config.adaptiveScanInterval) {
      (state as any)._lastAdaptiveMs = adaptiveMs;
      const windowName = adaptiveMs === 15000 ? 'London/NY overlap' : adaptiveMs === 30000 ? 'active session' : adaptiveMs === 90000 ? 'Asian session' : 'off-hours';
      addActivity(userId, { type: 'info', message: `⚡ Knowledge: ${windowName} — scanning every ${adaptiveMs / 1000}s for maximum opportunity` });
    }

    addActivity(userId, { type: 'scan', message: `Scanning ${pairsToScan.length} pairs: ${pairsToScan.join(', ')}` });

    const marketAnalysis: Record<string, any> = {};
    const htfPendingPromises: Promise<void>[] = [];
    const htfMarketData: Record<string, HTFBiasData> = {};
    // BUG 3 FIX: Do NOT clear state.htfBiasCache here. If all HTF fetches
    // fail this cycle the cache would be empty and the counter-trend gate
    // would be bypassed for every pair. We accumulate fresh data into the
    // local htfMarketData temp object and only replace the live cache once
    // we confirm at least one pair came back successfully (line ~1143 below).

    for (const symbol of pairsToScan) {
      try {
        const assetType = marketDataService.detectAssetType(symbol);
        const result = await marketDataService.fetchMarketData({
          symbol,
          assetType,
          timeframe: '15m',
          limit: 50,
        });

        if (!result.bars || result.bars.length < 20) continue;

        // ── Candle-close confirmation: drop the last (live/partial) bar ──────────
        // The final bar in the feed is the CURRENT unfinished M15 candle. It can be
        // 1 second or 14 minutes old. Computing indicators off it creates phantom
        // signals: RSI dips to 28 mid-candle as noise, engine calls BUY, candle
        // closes bearish and the trade is already onside for the wrong direction.
        // Using only confirmed closed bars eliminates this class of false signals.
        const confirmedBars = result.bars.slice(0, -1); // all except live partial candle
        if (confirmedBars.length < 20) continue;

        const candles = convertToCandles(confirmedBars);
        const indicators = computeAllAdvancedIndicators(candles, 0, symbol, 'M15');

        // currentPrice and change still use the live bar for accurate display/SL calc
        const currentPrice = result.bars[result.bars.length - 1]?.close || 0;
        const prevPrice = result.bars[result.bars.length - 2]?.close || currentPrice;
        const change = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

        // ── Trend detection: use DI lines, not just ADX strength ────────────
        // BUG FIX: Previously trend was only set to BULLISH/BEARISH when ADX > 25.
        // GBP/JPY mild downtrends typically show ADX 15–22 — these were all marked
        // NEUTRAL, causing the voting system to use mean-reversion logic (RSI<38=bull)
        // even in a clear downtrend. The DI lines always show direction regardless of
        // ADX magnitude.
        let trend = 'NEUTRAL';
        const adxData = indicators.adx as any;
        const adxStrength = adxData?.adx ?? adxData?.value ?? 0;
        const plusDI = adxData?.plusDI ?? 0;
        const minusDI = adxData?.minusDI ?? 0;
        const diSeparation = Math.abs(plusDI - minusDI);
        if (adxStrength > 20) {
          // Strong trend: ADX > 20 — use DI direction
          trend = plusDI > minusDI ? 'BULLISH' : 'BEARISH';
        } else if (adxStrength > 12 && diSeparation > 8) {
          // Mild trend: DI lines clearly separated even with weak ADX
          trend = plusDI > minusDI ? 'BULLISH' : 'BEARISH';
        }
        // If ADX < 12 or DI lines are close together → genuinely ranging, keep NEUTRAL

        const rsi = indicators.stochastic?.k || 50;
        const atr = indicators.volatilityContext?.currentATR || 0;

        const volumeMetrics = computeVolumeMetrics(confirmedBars); // confirmed bars only

        state.marketSnapshot[symbol] = {
          price: currentPrice,
          change: Math.round(change * 100) / 100,
          trend,
          rsi: Math.round(rsi),
          atr: Math.round(atr * 100000) / 100000,
          adx: adxStrength,       // stored so processDecision can access it directly
          plusDI,                  // stored for DI-based conflict detection
          minusDI,                 // stored for DI-based conflict detection
          volumeTrend: volumeMetrics.volumeTrend,    // for volume gate in processDecision
          relativeVolume: volumeMetrics.relativeVolume, // raw ratio for gate logic
          updatedAt: new Date().toISOString(),
          // Last confirmed candle stored for Markov current-state lookup in processDecision
          lastConfirmedCandle: confirmedBars.length > 0
            ? { open: confirmedBars[confirmedBars.length - 1].open, close: confirmedBars[confirmedBars.length - 1].close }
            : null,
        };
        // Cache ATR per symbol for post-GPT enforcement
        if (!(state as any)._lastATR) (state as any)._lastATR = {};
        (state as any)._lastATR[symbol] = atr;

        // ── T003: Pre-scan brain enforcement (session/hour/ATR rules) ──
        const preScanEnforcement = applyBrainEnforcement(userId, symbol, null, atr, undefined);
        if (!preScanEnforcement.allowed) {
          addActivity(userId, { type: 'info', symbol, message: preScanEnforcement.reason });
          await new Promise(r => setTimeout(r, 8500));
          continue;
        }

        // ── Build Markov transition matrix for this symbol ───────────────
        // Runs synchronously on confirmedBars — pure math, no I/O, ~1ms per pair.
        // The resulting matrix is cached in markov-chain.ts and used in processDecision.
        try {
          buildTransitionMatrix(symbol, confirmedBars.map(b => ({ open: b.open, close: b.close })));
        } catch { /* non-fatal — engine continues without Markov if it fails */ }

        marketAnalysis[symbol] = {
          currentPrice,
          change,
          trend,
          plusDI,    // DI lines stored so countIndicatorAlignment can use them
          minusDI,   // even if indicators.adx object doesn't expose them
          adx: indicators.adx,
          rsi: indicators.rsi,
          macd: indicators.macd,
          stochastic: indicators.stochastic,
          vwap: indicators.vwap,
          obv: indicators.obv,
          pivotPoints: indicators.pivotPoints,
          fibonacci: indicators.fibonacci,
          supportResistance: indicators.supportResistance,
          candlePatterns: indicators.candlePatterns,
          sessionContext: indicators.sessionContext,
          volatilityContext: indicators.volatilityContext,
          volumeProfile: indicators.volumeProfile,
          swingPoints: indicators.swingPoints,
          volumeMetrics,
          // Store last confirmed candle for Markov state lookup in processDecision
          lastConfirmedCandle: confirmedBars.length > 0
            ? { open: confirmedBars[confirmedBars.length - 1].open, close: confirmedBars[confirmedBars.length - 1].close }
            : null,
        };

        // ── Fire HTF (H1/H4) fetch in parallel with inter-pair delay ──
        const htfSymbol = symbol;
        const htfAssetType = assetType;
        const primaryTF = (config as any).primaryTimeframe || 'M15';
        const htfTimeframe = primaryTF === 'H1' ? '4h' : '1h';
        htfPendingPromises.push((async () => {
          try {
            const htfResult = await marketDataService.fetchMarketData({
              symbol: htfSymbol,
              assetType: htfAssetType,
              timeframe: htfTimeframe,
              limit: 50,
            });
            if (!htfResult.bars || htfResult.bars.length < 15) return;
            // Drop partial live candle on HTF too — same reasoning as M15
            const htfConfirmedBars = htfResult.bars.slice(0, -1);
            if (htfConfirmedBars.length < 14) return;
            const htfCandles = convertToCandles(htfConfirmedBars);
            const htfPrice = htfResult.bars[htfResult.bars.length - 1]?.close || 0;
            const bosChoch = detectBOSCHOCH(htfCandles, 'NEUTRAL');
            const wyckoff = detectWyckoff(htfCandles);

            let pdSignal = 'NEUTRAL';
            if (bosChoch.detected && bosChoch.direction) {
              pdSignal = bosChoch.direction === 'BULLISH' ? 'BUY' : 'SELL';
            } else if (wyckoff.detected) {
              if (wyckoff.phase === 'MARKUP' || wyckoff.phase === 'ACCUMULATION') pdSignal = 'BUY';
              else if (wyckoff.phase === 'MARKDOWN' || wyckoff.phase === 'DISTRIBUTION') pdSignal = 'SELL';
            }
            const pd = getPremiumDiscountContext(htfPrice, htfCandles, pdSignal);

            let htfTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
            if (bosChoch.detected && bosChoch.direction) {
              htfTrend = bosChoch.direction;
            } else if (wyckoff.detected) {
              if (wyckoff.phase === 'MARKUP' || wyckoff.phase === 'ACCUMULATION') htfTrend = 'BULLISH';
              else if (wyckoff.phase === 'MARKDOWN' || wyckoff.phase === 'DISTRIBUTION') htfTrend = 'BEARISH';
            }

            htfMarketData[htfSymbol] = {
              trend: htfTrend,
              bosChoch,
              premiumDiscount: { zone: pd.zone, aligns: pd.aligns, description: pd.description },
              wyckoff,
            };
          } catch { /* HTF fetch failed — skip silently */ }
        })());

        await new Promise(r => setTimeout(r, 8500));
      } catch (err: any) {
        addActivity(userId, { type: 'error', symbol, message: `Scan failed: ${err.message}` });
      }
    }

    // ── Friday close capture ───────────────────────────────────────────
    if (isFridayClose) {
      for (const [sym, data] of Object.entries(marketAnalysis) as [string, any][]) {
        if (data.currentPrice > 0) state.lastFridayClose[sym] = data.currentPrice;
      }
    }

    // ── Cross-Asset Leading Indicators ─────────────────────────────────
    const crossAssets: Record<string, any> = {};
    for (const crossSym of ['USDI', 'XAUUSD', 'US30']) {
      if (pairsToScan.includes(crossSym)) continue; // already have it
      try {
        const assetType = marketDataService.detectAssetType(crossSym);
        const result = await marketDataService.fetchMarketData({ symbol: crossSym, assetType, timeframe: '15m', limit: 25 });
        if (result.bars && result.bars.length >= 10) {
          const bars = result.bars;
          const current = bars[bars.length - 1].close;
          const ma10 = bars.slice(-10).reduce((s: number, b: any) => s + b.close, 0) / 10;
          crossAssets[crossSym] = { price: current, trend: current > ma10 * 1.001 ? 'UP' : current < ma10 * 0.999 ? 'DOWN' : 'FLAT' };
        }
        await new Promise(r => setTimeout(r, 3000));
      } catch { /* skip if unavailable */ }
    }

    // ── Settle any in-flight HTF fetches (fired in parallel during M15 loop) ──
    const htfLabel = ((config as any).primaryTimeframe || 'M15') === 'H1' ? 'H4' : 'H1';
    if (htfPendingPromises.length > 0) {
      await Promise.allSettled(htfPendingPromises);
      const htfCount = Object.keys(htfMarketData).length;
      if (htfCount > 0) {
        state.htfBiasCache = htfMarketData;
        addActivity(userId, { type: 'info', message: `📊 HTF bias loaded for ${htfCount}/${pairsToScan.length} pairs (${htfLabel} structure)` });
      } else {
        addActivity(userId, { type: 'info', message: `📊 HTF bias: all ${htfLabel} fetches failed — trading without HTF filter this cycle` });
      }
    }

    // ── Event-Triggered Scan Detection ────────────────────────────────
    const triggerPairs: string[] = [];
    const prevSnapshot = state.lastIndicatorSnapshot || {};
    const now2 = Date.now();
    for (const [sym, data] of Object.entries(marketAnalysis) as [string, any][]) {
      const prev = prevSnapshot[sym];
      const lastTrigger = state.lastTriggerAt[sym] || 0;
      if (now2 - lastTrigger < 30000) continue; // cooldown
      if (!prev) continue;
      const rsiNow = data.rsi?.value || data.stochastic?.k || 50;
      const rsiPrev = prev.rsi || 50;
      const vm = data.volumeMetrics as VolumeMetrics | undefined;
      const adxNow = (data.adx as any)?.adx || 0;
      const adxPrev = prev.adx || 0;
      let triggerReason = '';
      if (rsiPrev > 32 && rsiNow <= 30) triggerReason = `RSI crossed oversold (${rsiNow.toFixed(1)}) on ${sym} — evaluate BUY entry`;
      else if (rsiPrev < 68 && rsiNow >= 70) triggerReason = `RSI crossed overbought (${rsiNow.toFixed(1)}) on ${sym} — evaluate SELL entry`;
      else if (vm && vm.relativeVolume >= 2 && (prev.relVol || 0) < 2) triggerReason = `Volume SURGE on ${sym} (${vm.relativeVolume}x) — momentum breakout likely`;
      else if (adxPrev < 25 && adxNow >= 25) triggerReason = `ADX crossed 25 on ${sym} — trend emerging, enter with momentum`;
      if (triggerReason) {
        triggerPairs.push(triggerReason);
        state.lastTriggerAt[sym] = now2;
        addActivity(userId, { type: 'info', symbol: sym, message: `🚨 TRIGGER: ${triggerReason}` });
      }
    }
    // Save snapshot for next scan comparison
    state.lastIndicatorSnapshot = Object.fromEntries(
      Object.entries(marketAnalysis).map(([sym, data]: [string, any]) => [sym, {
        rsi: data.rsi?.value || data.stochastic?.k || 50,
        adx: (data.adx as any)?.adx || 0,
        relVol: (data.volumeMetrics as VolumeMetrics | undefined)?.relativeVolume || 1,
      }])
    );
    // Schedule an extra triggered scan in 12 seconds if triggers fired.
    // BUG 16 FIX: removed !state.currentlyScanning guard — it was always
    // true here (we're still inside the scan), silently killing every
    // triggered follow-up scan. scanMarkets() already has its own guard
    // at the top, so the setTimeout is safe to schedule unconditionally.
    if (triggerPairs.length > 0) {
      setTimeout(() => scanMarkets(userId), 12000);
    }

    const analyzedPairs = Object.keys(marketAnalysis);
    if (analyzedPairs.length === 0) {
      addActivity(userId, { type: 'info', message: 'No market data available for any pair. Waiting for next scan.' });
      state.currentlyScanning = false;
      return;
    }

    addActivity(userId, { type: 'info', message: `Market data collected for ${analyzedPairs.length} pairs. Fetching news & volume context...` });

    const newsContext = await fetchNewsContext(pairsToScan);
    if (newsContext.tradingWindowWarning) {
      addActivity(userId, { type: 'info', message: `⚠ ${newsContext.tradingWindowWarning}` });
    }
    if (newsContext.headlines.length > 0) {
      addActivity(userId, { type: 'info', message: `News sentiment: ${newsContext.marketSentiment.toUpperCase()} | ${newsContext.headlines.length} headlines | ${newsContext.economicEvents.length} upcoming events` });
    }

    const volumeSummary = Object.entries(marketAnalysis)
      .filter(([_, d]: [string, any]) => d.volumeMetrics?.isHighActivity)
      .map(([sym]: [string, any]) => sym);
    if (volumeSummary.length > 0) {
      addActivity(userId, { type: 'info', message: `High volume detected: ${volumeSummary.join(', ')}` });
    }

    const currentOpenPositions = (global as any).mt5OpenPositions?.[userId]?.positions || [];
    await applyServerSideTrails(userId, currentOpenPositions, marketAnalysis);

    // ── Composite Autonomous Scan (Markov × Polymarket → direct trade) ────────
    // For crypto pairs where BOTH Markov and Polymarket strongly agree on direction,
    // fire a trade directly without waiting for the AI. This is a pure probability-
    // driven signal path that runs every scan cycle with a 5-min per-pair cooldown.
    if (config.enableCompositeAutonomous !== false) {
      const CRYPTO_RE = /BTC|ETH|SOL|XRP|BNB|DOGE|ADA|MATIC|LINK/i;
      const minEdge = config.compositeMinEdgeScore ?? 72;
      const COMPOSITE_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes
      if (!state.compositeLastFiredAt) state.compositeLastFiredAt = {};

      const cryptoPairs = analyzedPairs.filter(sym => CRYPTO_RE.test(sym));

      for (const sym of cryptoPairs) {
        try {
          const symSnap = (state.marketSnapshot as any)?.[sym] ?? {};
          // M1 fix: supply the full cached candle sequence so Markov has a real
          // transition matrix. buildTransitionMatrix now stores candleHistory on
          // the cached matrix — reuse it here so we avoid a re-fetch.
          const { getCachedMatrix } = await import('./markov-chain');
          const cachedTM = getCachedMatrix(sym);
          const candles: Array<{ open: number; close: number }> =
            (cachedTM?.candleHistory?.length ?? 0) >= 5
              ? cachedTM!.candleHistory
              : symSnap.lastConfirmedCandle
                ? [symSnap.lastConfirmedCandle]
                : [];

          // Skip if fired within cooldown window
          const lastFired = state.compositeLastFiredAt[sym] || 0;
          if (Date.now() - lastFired < COMPOSITE_COOLDOWN_MS) continue;

          const { getCompositeEdgeSignal } = await import('./composite-signal');

          // Run for BUY first, then SELL — pick the one that passes the threshold
          for (const dir of ['BUY', 'SELL'] as const) {
            const composite = await getCompositeEdgeSignal(sym, dir, candles);

            // Only fire if Polymarket was actually available (usedPolymarket) and
            // both signals strongly agree
            if (!composite.usedPolymarket) break; // non-crypto or Polymarket down

            const edgeOk = dir === 'BUY'
              ? composite.compositeEdgeScore >= minEdge
              : composite.compositeEdgeScore <= (100 - minEdge);

            if (composite.alignment !== 'strong_agree' || !edgeOk) continue;

            // Build ATR-based SL/TP using marketAnalysis data
            const mData = (marketAnalysis as any)[sym] || {};
            const currentPrice = mData.currentPrice || symSnap.currentPrice || 0;
            if (currentPrice <= 0) continue;

            const atr = (mData.atr as any)?.value ?? mData.atr ?? currentPrice * 0.005;
            const pipSize = getPipSize(sym);
            const isJpy = sym.includes('JPY');
            const isXau = sym.includes('XAU');
            const isCrypto = !isJpy && !isXau;
            const minSlPips = isCrypto ? 50 : isXau ? 300 : 22;
            const minSlDist = minSlPips * pipSize;
            const slDist = Math.max(atr * 1.8, minSlDist);
            const tpDist = Math.max(atr * 3.6, slDist * 2.0);
            const sl = dir === 'BUY' ? currentPrice - slDist : currentPrice + slDist;
            const tp = dir === 'BUY' ? currentPrice + tpDist : currentPrice - tpDist;

            const autonomousDecision = {
              action: 'OPEN_TRADE',
              strategy: 'composite_autonomous',
              symbol: sym,
              direction: dir,
              confidence: Math.round(50 + Math.abs(composite.compositeEdgeScore - 50) * 0.8),
              reason: `🤖 Composite Autonomous — ${composite.reason}`,
              confluences: [
                `Markov: ${composite.markov.currentState} (bull ${composite.markov.bullP}%)`,
                `Polymarket: ${composite.polymarket?.sentimentLabel ?? 'N/A'} (${composite.polymarket?.overallBullishScore ?? 0}%)`,
                `Alignment: ${composite.alignment} | Edge: ${composite.compositeEdgeScore}`,
              ],
              entryPrice: currentPrice,
              stopLoss: sl,
              takeProfit: tp,
              lotSize: config.baseLotSize,
              holdTime: '5min',
              urgency: 'IMMEDIATE',
            };

            addActivity(userId, {
              type: 'signal',
              symbol: sym,
              direction: dir,
              message: `🔥 COMPOSITE AUTO SIGNAL [${sym}]: ${dir} — Markov + Polymarket strong_agree (edge ${composite.compositeEdgeScore}) → firing trade`,
              confidence: autonomousDecision.confidence,
            });

            state.compositeLastFiredAt[sym] = Date.now();
            await processDecision(userId, autonomousDecision, newsContext);
            break; // only one direction per pair per cycle
          }
        } catch { /* non-fatal — composite scan errors must never block main scan */ }
      }
    }

    // ── ORB Autonomous Scan ────────────────────────────────────────────────────
    // Runs only during 9:30 AM – 2:00 PM EST. Fires breakout+retest trades
    // when SS AI Bot score ≥ 70. One trade per pair per day.
    try { await runORBAutonomousScan(userId); } catch { /* non-fatal */ }

    await runAILiveAnalysis(userId, marketAnalysis, brain, newsContext, crossAssets, triggerPairs, htfMarketData);

  } catch (err: any) {
    addActivity(userId, { type: 'error', message: `Scan cycle error: ${err.message}` });
  } finally {
    state.currentlyScanning = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INDUSTRY-STANDARD TRAIL CALCULATION FUNCTIONS
// All return the new absolute SL price. Ratchet logic (only moves SL in the
// favourable direction) is applied in applyServerSideTrails() after calling these.
// ─────────────────────────────────────────────────────────────────────────────

function computeChandelierSL(
  position: any,
  atr: number,
  multiplier: number,
  trailState: { highestHigh: number; lowestLow: number },
): number {
  const price = position.currentPrice;
  if (!price || price <= 0) return position.sl || 0;
  const effectiveATR = atr > 0 ? atr : (position.symbol?.includes('JPY') ? 0.50 : 0.0050);
  if (position.direction === 'BUY') {
    if (price > (trailState.highestHigh || 0)) trailState.highestHigh = price;
    return (trailState.highestHigh || price) - effectiveATR * multiplier;
  } else {
    if (!trailState.lowestLow || price < trailState.lowestLow) trailState.lowestLow = price;
    return (trailState.lowestLow || price) + effectiveATR * multiplier;
  }
}

function computeRMultipleSL(position: any, config?: { breakevenBufferPips?: number }): number {
  const openPrice = position.openPrice;
  const originalSL = position.originalSL || position.sl;
  if (!openPrice || !originalSL || originalSL === 0) return position.sl || 0;
  const R = Math.abs(openPrice - originalSL);
  if (R === 0) return position.sl || 0;
  const pnlUnits = position.direction === 'BUY'
    ? (position.currentPrice - openPrice)
    : (openPrice - position.currentPrice);
  const rMultiple = pnlUnits / R;
  if (rMultiple < 1) return position.sl || 0;
  const lockedR = Math.floor(rMultiple) - 1;

  // At 1R (lockedR === 0): apply breakeven buffer pips instead of exact entry
  if (lockedR === 0 && (config?.breakevenBufferPips ?? 0) > 0) {
    const bufferPips = config?.breakevenBufferPips ?? 5;
    const pipSize = getPipSize(position.symbol || '');
    const buffer = bufferPips * pipSize;
    return position.direction === 'BUY'
      ? openPrice + buffer
      : openPrice - buffer;
  }

  if (position.direction === 'BUY') {
    return openPrice + lockedR * R;
  } else {
    return openPrice - lockedR * R;
  }
}

function computeSwingStructureSL(position: any, marketData: any): number {
  const sr = marketData?.supportResistance;
  const price = position.currentPrice;
  if (!sr || !price) return position.sl || 0;
  if (position.direction === 'BUY') {
    const supports: number[] = (sr.supports || []).filter((s: number) => s < price);
    if (supports.length > 0) {
      const nearestSupport = Math.max(...supports);
      const swingSL = nearestSupport * 0.9998;
      if (swingSL > (position.sl || 0)) return swingSL;
    }
  } else {
    const resistances: number[] = (sr.resistances || []).filter((r: number) => r > price);
    if (resistances.length > 0) {
      const nearestResistance = Math.min(...resistances);
      const swingSL = nearestResistance * 1.0002;
      if (!position.sl || swingSL < position.sl) return swingSL;
    }
  }
  return position.sl || 0;
}

function computeParabolicSAR(
  position: any,
  trailState: { sar: number; ep: number; af: number; bullish: boolean },
  initialAF = 0.02,
  maxAF = 0.20,
): number {
  const price = position.currentPrice;
  if (!price) return position.sl || 0;
  const bullish = position.direction === 'BUY';

  if (!trailState.sar) {
    trailState.sar = position.openPrice || price;
    trailState.ep = price;
    trailState.af = initialAF;
    trailState.bullish = bullish;
    return position.sl || 0;
  }

  if (bullish && price > trailState.ep) {
    trailState.ep = price;
    trailState.af = Math.min(maxAF, trailState.af + initialAF);
  } else if (!bullish && price < trailState.ep) {
    trailState.ep = price;
    trailState.af = Math.min(maxAF, trailState.af + initialAF);
  }
  const newSAR = trailState.sar + trailState.af * (trailState.ep - trailState.sar);
  trailState.sar = newSAR;
  return Math.round(newSAR * 100000) / 100000;
}

const TRAIL_METHOD_LABELS: Record<string, string> = {
  staged_volume: 'Staged Volume Trail',
  chandelier: 'Chandelier Exit (ATR-based)',
  r_multiple: 'R-Multiple Ladder',
  swing_structure: 'Swing High/Low Structure',
  parabolic_sar: 'Parabolic SAR',
  none: 'No Trail',
  fixed_pip: 'Fixed Pip Trail',
  profit_lock: 'Profit Lock %',
  stepped_fixed: 'Stepped Fixed Trail',
};

function computeFixedPipTrailSL(
  position: any,
  fixedPips: number,
  trailState: { highestHigh: number; lowestLow: number },
): number {
  const price = position.currentPrice;
  if (!price || price <= 0) return position.sl || 0;
  const pipSize = getPipSize(position.symbol || '');
  const distance = fixedPips * pipSize;
  if (position.direction === 'BUY') {
    if (price > (trailState.highestHigh || 0)) trailState.highestHigh = price;
    const newSL = (trailState.highestHigh || price) - distance;
    return newSL > (position.sl || 0) ? newSL : position.sl || 0;
  } else {
    if (!trailState.lowestLow || price < trailState.lowestLow) trailState.lowestLow = price;
    const newSL = (trailState.lowestLow || price) + distance;
    return (!position.sl || newSL < position.sl) ? newSL : position.sl || 0;
  }
}

function computeProfitLockSL(
  position: any,
  lockPct: number,
  trailState: { peakProfit: number },
): number {
  const price = position.currentPrice;
  const openPrice = position.openPrice;
  if (!price || !openPrice) return position.sl || 0;
  const currentProfit = position.direction === 'BUY' ? (price - openPrice) : (openPrice - price);
  if (currentProfit <= 0) return position.sl || 0;
  if (!trailState.peakProfit || currentProfit > trailState.peakProfit) {
    trailState.peakProfit = currentProfit;
  }
  const lockedProfit = trailState.peakProfit * (lockPct / 100);
  if (lockedProfit <= 0) return position.sl || 0;
  const newSL = position.direction === 'BUY'
    ? openPrice + lockedProfit
    : openPrice - lockedProfit;
  const isBuy = position.direction === 'BUY';
  const currentSL = position.sl || 0;
  if (isBuy) return newSL > currentSL ? newSL : currentSL;
  return (!currentSL || newSL < currentSL) ? newSL : currentSL;
}

function computeSteppedFixedTrailSL(
  position: any,
  fixedPips: number,
  stepPips: number,
  trailState: { highestHigh: number; lowestLow: number },
): number {
  const rawSL = computeFixedPipTrailSL(position, fixedPips, trailState);
  if (rawSL <= 0) return position.sl || 0;
  const pipSize = getPipSize(position.symbol || '');
  const stepSize = stepPips * pipSize;
  const currentSL = position.sl || 0;
  const isBuy = position.direction === 'BUY';
  if (isBuy) {
    return rawSL >= currentSL + stepSize ? rawSL : currentSL;
  } else {
    return (!currentSL || rawSL <= currentSL - stepSize) ? rawSL : currentSL;
  }
}

async function applyServerSideTrails(
  userId: number,
  openPositions: any[],
  marketAnalysis: Record<string, any>,
): Promise<void> {
  const state = engineStates[userId];
  if (!state) return;
  const config = state.config;
  if (!config.trailingStopEnabled || config.trailMethod === 'staged_volume' || config.trailMethod === 'none') return;
  if (openPositions.length === 0) return;

  if (!state.positionTrailState) state.positionTrailState = {};

  let tlConnection: any = null;
  try {
    tlConnection = await storage.getUserTradelockerConnection(userId);
    if (tlConnection && !tlConnection.isActive) tlConnection = null;
  } catch { /* no TL — MT5 only */ }

  const methodLabel = TRAIL_METHOD_LABELS[config.trailMethod] || config.trailMethod;
  const activationPips = config.trailActivationPips ?? 15;

  for (const pos of openPositions) {
    const key = String(pos.ticket || pos.id || pos.symbol);
    if (!state.positionTrailState[key]) {
      state.positionTrailState[key] = {
        highestHigh: pos.currentPrice || pos.openPrice,
        lowestLow: pos.currentPrice || pos.openPrice,
        sar: pos.openPrice || pos.currentPrice,
        ep: pos.currentPrice || pos.openPrice,
        af: config.trailSarInitialAF ?? 0.02,
        bullish: pos.direction === 'BUY',
        peakProfit: 0,
      };
    }
    const ts = state.positionTrailState[key];

    // Universal activation pip gate — don't trail until minimum pips in profit
    if (activationPips > 0 && pos.openPrice && pos.currentPrice) {
      const pipSize = getPipSize(pos.symbol || '');
      const pipsInProfit = pos.direction === 'BUY'
        ? (pos.currentPrice - pos.openPrice) / pipSize
        : (pos.openPrice - pos.currentPrice) / pipSize;
      if (pipsInProfit < activationPips) continue;
    }

    const symData = marketAnalysis[pos.symbol?.replace('/', '')] || marketAnalysis[pos.symbol] || {};
    const atr = symData.atr?.value ?? symData.atr ?? 0;
    const multiplier = config.trailingStopATRMultiplier || 3.0;

    let newSL = 0;
    switch (config.trailMethod) {
      case 'chandelier':
        newSL = computeChandelierSL(pos, atr, multiplier, ts);
        break;
      case 'r_multiple': {
        const prevSL = pos.sl || 0;
        newSL = computeRMultipleSL(pos, config);
        // Log when buffer is applied at 1R stage
        const openP = pos.openPrice;
        const origSL = pos.originalSL || prevSL;
        if (openP && origSL && newSL > 0) {
          const R = Math.abs(openP - origSL);
          if (R > 0) {
            const pnlU = pos.direction === 'BUY' ? (pos.currentPrice - openP) : (openP - pos.currentPrice);
            const rm = pnlU / R;
            const bufPips = config.breakevenBufferPips ?? 5;
            if (Math.floor(rm) === 1 && bufPips > 0 && newSL !== prevSL) {
              addActivity(userId, {
                type: 'position_update',
                symbol: pos.symbol,
                message: `⚡ R-Multiple 1R: ${pos.symbol} — SL locked at entry +${bufPips} pips (not flat breakeven)`,
              });
            }
          }
        }
        break;
      }
      case 'swing_structure':
        newSL = computeSwingStructureSL(pos, symData);
        break;
      case 'parabolic_sar':
        newSL = computeParabolicSAR(pos, ts, config.trailSarInitialAF ?? 0.02, config.trailSarMaxAF ?? 0.20);
        break;
      case 'fixed_pip':
        newSL = computeFixedPipTrailSL(pos, config.trailFixedPips ?? 20, ts);
        break;
      case 'profit_lock':
        newSL = computeProfitLockSL(pos, config.trailProfitLockPct ?? 60, ts);
        break;
      case 'stepped_fixed':
        newSL = computeSteppedFixedTrailSL(pos, config.trailFixedPips ?? 20, config.trailStepPips ?? 10, ts);
        break;
    }

    if (newSL <= 0) continue;

    const currentSL = pos.sl || 0;
    const isBuy = pos.direction === 'BUY';
    const improved = isBuy ? newSL > currentSL : (currentSL === 0 || newSL < currentSL);
    if (!improved) continue;

    broadcastMT5Signal(userId, {
      id: `trail_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: new Date().toISOString(),
      symbol: pos.symbol,
      direction: pos.direction,
      action: 'MODIFY',
      lotSize: 0,
      entryPrice: null,
      stopLoss: Math.round(newSL * 100000) / 100000,
      takeProfit: pos.tp || null,
      confidence: 100,
      reason: `${methodLabel}: auto-trail SL → ${Math.round(newSL * 100000) / 100000}`,
      holdTime: '',
      strategy: 'position_management',
      confluences: [],
      status: 'pending',
      modifyAction: 'trail_stop',
      positionId: pos.ticket || pos.id || null,
    } as PendingMT5Signal);

    addActivity(userId, {
      type: 'position_update',
      symbol: pos.symbol,
      message: `📐 ${methodLabel}: ${pos.symbol} ${pos.direction} trail → SL ${Math.round(newSL * 100000) / 100000} (was ${currentSL || 'none'})`,
    });

    if (tlConnection) {
      const positionId = pos.ticket || pos.id || null;
      if (positionId) {
        try {
          const trailResult = await executeMT5SignalOnTradeLocker(tlConnection, {
            action: 'MODIFY',
            symbol: pos.symbol,
            direction: pos.direction || 'BUY',
            volume: 0,
            stopLoss: Math.round(newSL * 100000) / 100000,
            takeProfit: pos.tp || undefined,
            positionId: String(positionId),
          });
          if (trailResult.success) {
            addActivity(userId, {
              type: 'position_update',
              symbol: pos.symbol,
              message: `✅ TradeLocker trail applied: ${pos.symbol} SL → ${Math.round(newSL * 100000) / 100000}`,
            });
          } else {
            addActivity(userId, {
              type: 'error',
              symbol: pos.symbol,
              message: `⚠️ TradeLocker trail failed: ${pos.symbol} — ${trailResult.error}. Signal queued for MT5 EA.`,
            });
          }
        } catch (tlErr: any) {
          addActivity(userId, {
            type: 'error',
            symbol: pos.symbol,
            message: `⚠️ TradeLocker trail error: ${pos.symbol} — ${tlErr.message}. Signal queued for MT5 EA.`,
          });
        }
      }
    }
  }
}

// ── Rule-Based Signal Generator (zero API cost) ─────────────────────────────
function generateRuleBasedSignals(indicators: Record<string, any>, config: LiveEngineConfig, symbol: string): any {
  let bull = 0;
  let bear = 0;
  const votes: string[] = [];

  const adxVal = indicators.adx?.adx ?? indicators.adx?.value ?? 0;
  const trend = indicators.trend ?? 'NEUTRAL';
  // Lowered from 25→18 to match the updated trend detection (DI-based, ADX>12+diSep>8)
  const trendIsStrong = adxVal > 18 && trend !== 'NEUTRAL';

  // RSI — trend-aware: in a trending market, RSI confirms direction; in ranging, use extremes
  const rsi = indicators.rsi?.value ?? indicators.stochastic?.k ?? 50;
  if (trendIsStrong) {
    if (trend === 'BULLISH' && rsi > 50) { bull++; votes.push(`RSI ${rsi.toFixed(1)} above 50 (bullish trend confirmation)`); }
    else if (trend === 'BEARISH' && rsi < 50) { bear++; votes.push(`RSI ${rsi.toFixed(1)} below 50 (bearish trend confirmation)`); }
    else if (trend === 'BULLISH' && rsi < 30) { bear++; votes.push(`RSI ${rsi.toFixed(1)} extreme oversold (exhaustion warning)`); }
    else if (trend === 'BEARISH' && rsi > 70) { bull++; votes.push(`RSI ${rsi.toFixed(1)} extreme overbought (exhaustion warning)`); }
  } else {
    if (rsi < 35) { bull++; votes.push(`RSI oversold (${rsi.toFixed(1)})`); }
    else if (rsi > 65) { bear++; votes.push(`RSI overbought (${rsi.toFixed(1)})`); }
  }

  // Stochastic — trend-aware: same logic as RSI
  const stochK = indicators.stochastic?.k ?? 50;
  if (trendIsStrong) {
    if (trend === 'BULLISH' && stochK > 50) { bull++; votes.push(`Stoch K ${stochK.toFixed(1)} above 50 (bullish confirmation)`); }
    else if (trend === 'BEARISH' && stochK < 50) { bear++; votes.push(`Stoch K ${stochK.toFixed(1)} below 50 (bearish confirmation)`); }
    else if (trend === 'BULLISH' && stochK < 20) { bear++; votes.push(`Stoch K ${stochK.toFixed(1)} extreme (trend exhaustion)`); }
    else if (trend === 'BEARISH' && stochK > 80) { bull++; votes.push(`Stoch K ${stochK.toFixed(1)} extreme (trend exhaustion)`); }
  } else {
    if (stochK < 25) { bull++; votes.push(`Stoch K oversold (${stochK.toFixed(1)})`); }
    else if (stochK > 75) { bear++; votes.push(`Stoch K overbought (${stochK.toFixed(1)})`); }
  }

  const macdHist = indicators.macd?.histogram ?? 0;
  if (macdHist > 0) { bull++; votes.push('MACD histogram positive'); }
  else if (macdHist < 0) { bear++; votes.push('MACD histogram negative'); }

  if (adxVal > 25 && trend === 'BULLISH') { bull++; votes.push(`ADX ${adxVal.toFixed(1)} + bullish trend`); }
  else if (adxVal > 25 && trend === 'BEARISH') { bear++; votes.push(`ADX ${adxVal.toFixed(1)} + bearish trend`); }

  // VWAP deviation — trend-aware: in a trend, VWAP position confirms direction
  const vwapDev = indicators.vwap?.deviationPercent ?? 0;
  const vwapRelation = (indicators.vwap?.priceRelation ?? '').toUpperCase();
  if (trendIsStrong) {
    if (trend === 'BULLISH' && vwapDev > 0) { bull++; votes.push(`Price above VWAP +${vwapDev.toFixed(2)}% (bullish confirmation)`); }
    else if (trend === 'BEARISH' && vwapDev < 0) { bear++; votes.push(`Price below VWAP ${vwapDev.toFixed(2)}% (bearish confirmation)`); }
  } else {
    if (vwapDev < -0.10) { bull++; votes.push(`Price below VWAP (${vwapDev.toFixed(2)}%)`); }
    else if (vwapDev > 0.10) { bear++; votes.push(`Price above VWAP (+${vwapDev.toFixed(2)}%)`); }
  }

  const obvTrend = indicators.obv?.trend ?? '';
  if (obvTrend === 'up') { bull++; votes.push('OBV uptrend'); }
  else if (obvTrend === 'down') { bear++; votes.push('OBV downtrend'); }

  const bullishPatterns = ['hammer', 'bullish_engulfing', 'morning_star', 'piercing_line', 'bullish_harami', 'inverted_hammer', 'three_white_soldiers'];
  const bearishPatterns = ['shooting_star', 'bearish_engulfing', 'evening_star', 'dark_cloud_cover', 'bearish_harami', 'hanging_man', 'three_black_crows'];
  const patterns: string[] = indicators.candlePatterns ?? [];
  if (patterns.some(p => bullishPatterns.includes(p))) { bull++; votes.push(`Bullish candle: ${patterns.filter(p => bullishPatterns.includes(p)).join(',')}`); }
  if (patterns.some(p => bearishPatterns.includes(p))) { bear++; votes.push(`Bearish candle: ${patterns.filter(p => bearishPatterns.includes(p)).join(',')}`); }

  const currentPrice = indicators.currentPrice ?? 0;
  const atr = indicators.atr?.value ?? indicators.atr ?? (currentPrice * 0.0005);

  if (bull < 4 && bear < 4) {
    return { newTrades: [], positionUpdates: [], marketOverview: `Rule-based (${symbol}): insufficient confluence — bull=${bull} bear=${bear} (need 4+)`, nextScanFocus: 'Waiting for 4+ indicator alignment' };
  }

  const direction = bull >= bear ? 'BUY' : 'SELL';
  const winningScore = Math.max(bull, bear);
  const confidence = Math.round((winningScore / 7) * 100);

  const entry = currentPrice;
  // ── ATR-based SL with minimum pip floor (prevents tight SL stop-outs) ──────
  // SL = max(1.8×ATR, minPipFloor) — gives trades room to breathe on M15 data
  const pipSize = getPipSize(symbol);
  const isJpy = symbol.includes('JPY');
  const isXau = symbol.includes('XAU');
  const minSlPips = isXau ? 300 : isJpy ? 22 : 16; // minimum pip floors
  const minSlDist = minSlPips * pipSize;
  const slMult = confidence >= 86 ? 2.0 : 1.8; // wider SL for M15 timeframe
  const tpMult = confidence >= 86 ? 4.0 : 3.6; // scale TP to maintain 2:1 R:R
  const rawSlDist = atr * slMult;
  const effectiveSlDist = Math.max(rawSlDist, minSlDist); // enforce minimum
  const effectiveTpDist = Math.max(atr * tpMult, effectiveSlDist * 2.0); // always at least 2:1
  const sl = direction === 'BUY' ? entry - effectiveSlDist : entry + effectiveSlDist;
  const tp = direction === 'BUY' ? entry + effectiveTpDist : entry - effectiveTpDist;

  let lotSize = config.baseLotSize;
  if (config.useKellyCriterion) {
    const pct = (winningScore / 7);
    const fractionalKelly = pct * 0.25;
    lotSize = Math.min(config.maxLotSize, Math.max(config.baseLotSize, parseFloat((config.baseLotSize * (1 + fractionalKelly)).toFixed(2))));
  }

  const trade = {
    action: 'OPEN_TRADE',
    strategy: 'momentum',
    symbol,
    direction,
    confidence,
    reason: `Rule-based consensus — ${winningScore}/7 indicators agree. Votes: ${votes.join('; ')}`,
    confluences: votes,
    entryPrice: entry,
    stopLoss: sl,
    takeProfit: tp,
    lotSize,
    holdTime: '30min',
    urgency: 'IMMEDIATE',
  };

  return {
    newTrades: [trade],
    decisions: [trade],
    positionUpdates: [],
    marketOverview: `Rule-based ${direction} on ${symbol}: ${winningScore}/7 indicators aligned. No AI API call used.`,
    nextScanFocus: `Monitor ${symbol} ${direction} for follow-through`,
    engineConfidence: confidence,
    activeStrategies: ['momentum'],
    tradingWindowQuality: 'good',
  };
}

// ── Indicator pre-filter: count indicator direction votes ────────────────────
// TREND-AWARE LOGIC: In a confirmed trending market (ADX > 22), oscillators like
// RSI and Stochastic CONFIRM the trend rather than signal reversals. Treating
// RSI<38 as "bull" in a BEARISH downtrend is wrong — it means continuation.
// In NEUTRAL/ranging markets we keep the original mean-reversion interpretation.
function countIndicatorAlignment(data: any): { bull: number; bear: number } {
  let bull = 0;
  let bear = 0;

  const trend = data.trend ?? 'NEUTRAL';
  const adxVal = data.adx?.adx ?? data.adx?.value ?? 0;
  // trendIsStrong: lowered threshold from 22→15 to catch mild GBP/JPY downtrends
  // where ADX is 15–22 but direction is clear. The trend itself is now set from
  // DI lines at ADX>12 level, so checking adxVal>15 here is consistent.
  const trendIsStrong = adxVal > 15 && trend !== 'NEUTRAL';

  // Vote 1: RSI — trend-aware
  // Trending: RSI above/below 50 CONFIRMS trend direction (momentum, not reversal)
  // Neutral: RSI extreme levels signal potential mean reversion
  const rsiVal = data.rsi?.value ?? 50;
  if (trendIsStrong) {
    if (trend === 'BULLISH' && rsiVal > 50) bull++;
    else if (trend === 'BEARISH' && rsiVal < 50) bear++;
    // Only count exhaustion reversal at extremes in a trend
    else if (trend === 'BULLISH' && rsiVal < 30) bear++;
    else if (trend === 'BEARISH' && rsiVal > 70) bull++;
  } else {
    // Neutral/ranging: mean reversion
    if (rsiVal < 38) bull++; else if (rsiVal > 62) bear++;
  }

  // Vote 2: Stochastic %K — trend-aware (same logic as RSI)
  const stochK = data.stochastic?.k ?? 50;
  if (trendIsStrong) {
    if (trend === 'BULLISH' && stochK > 50) bull++;
    else if (trend === 'BEARISH' && stochK < 50) bear++;
    // Extreme exhaustion only
    else if (trend === 'BULLISH' && stochK < 20) bear++;
    else if (trend === 'BEARISH' && stochK > 80) bull++;
  } else {
    if (stochK < 28) bull++; else if (stochK > 72) bear++;
  }

  // Vote 3: MACD histogram — directional (no change, always trend-aware by nature)
  const macdHist = data.macd?.histogram ?? 0;
  if (macdHist > 0) bull++; else if (macdHist < 0) bear++;

  // Vote 3b: MACD centerline — MACD line above/below zero = sustained trend bias
  // MACD line < 0 means bearish momentum has persisted. This is different from
  // the histogram (which shows acceleration). The centerline rarely flips in
  // intraday ranges so this is a reliable trend-direction vote.
  const macdLine = data.macd?.macd ?? data.macd?.value ?? null;
  if (macdLine !== null) {
    if (macdLine > 0) bull++; else if (macdLine < 0) bear++;
  }

  // Vote 4: ADX + DI trend direction — lowered threshold to match new trend detection
  if (adxVal > 15 && trend === 'BULLISH') bull++;
  else if (adxVal > 15 && trend === 'BEARISH') bear++;

  // Vote 5: OBV trend (unchanged — volume direction is always directional)
  const obvTrend = data.obv?.trend ?? '';
  if (obvTrend === 'up') bull++; else if (obvTrend === 'down') bear++;

  // Vote 6: VWAP price relation — trend-aware
  // In a trend: price position vs VWAP CONFIRMS trend (price above VWAP = bullish, below = bearish)
  // In neutral: price below VWAP = potential mean-reversion buy, above = potential fade
  const vwapRelation = (data.vwap?.priceRelation ?? '').toUpperCase();
  if (trendIsStrong) {
    if (trend === 'BULLISH' && vwapRelation === 'ABOVE') bull++;
    else if (trend === 'BEARISH' && vwapRelation === 'BELOW') bear++;
  } else {
    if (vwapRelation === 'BELOW') bull++; else if (vwapRelation === 'ABOVE') bear++;
  }

  return { bull, bear };
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-PAIR ADAPTIVE STRATEGY SELECTOR
// Reads current market conditions for a single pair and returns the strategy
// most likely to be profitable RIGHT NOW, independent of the user's global
// strategy mode setting.  The selector is deterministic (no AI API call) and
// runs before the AI prompt is assembled so the AI gets a clear instruction
// per pair.
//
// Priority order (first match wins):
//  1. News Fade        — post-news spike exhaustion window (5-30 min after event)
//  2. Asia Range Break — London open (07-08 UTC) + Asia range defined
//  3. Session Breakout — first 30 min of London or NY open + volume surge
//  4. ICT OTE          — H1 BOS/CHOCH confirmed + price in 61.8-78.6% Fib zone
//  5. SMC Demand/Supply— fresh demand/supply zone on H1/H4 + price returning
//  6. Sniper           — price at key Fib (38.2/61.8%) + S/R confluence + pattern
//  7. VWAP Reversion   — price > 0.15% from VWAP + RSI at extreme
//  8. Momentum         — ADX > 25 + strong DI separation + volume surging/above avg
//  9. Scalping         — ADX 15-28 + moderate trend + active London/NY session
// 10. Wait             — ADX < 12, DI close together, no clear structure
// ─────────────────────────────────────────────────────────────────────────────
interface StrategyRecommendation {
  strategy: string;
  reason: string;
  priority: 'high' | 'medium' | 'low' | 'none';
  minConfluences: number;
}

function selectStrategyForPair(
  symbol: string,
  data: any,
  htfBias: HTFBiasData | undefined,
  asiaHigh: number | undefined,
  asiaLow: number | undefined,
  utcHour: number,
  utcMinute: number,
  lastHighImpactNewsAt: string | null,
  globalStrategyMode: string,
): StrategyRecommendation {
  const adxVal   = (data.adx?.value ?? data.adx?.adx ?? 0) as number;
  const trend    = (data.trend ?? 'NEUTRAL') as string;
  const plusDI   = (data.plusDI ?? data.adx?.plusDI ?? 0) as number;
  const minusDI  = (data.minusDI ?? data.adx?.minusDI ?? 0) as number;
  const diSep    = Math.abs(plusDI - minusDI);
  const rsiVal   = (data.rsi?.value ?? 50) as number;
  const stochK   = (data.stochastic?.k ?? 50) as number;
  const vm       = data.volumeMetrics as VolumeMetrics | undefined;
  const volTrend = vm?.volumeTrend ?? 'average';
  const relVol   = vm?.relativeVolume ?? 1;
  const price    = data.currentPrice as number;
  const vwapVal  = data.vwap?.value as number | undefined;
  const sr       = data.supportResistance;
  const fib      = data.fibonacci?.retracementLevels as Record<string, number> | undefined;
  const patterns = (data.candlePatterns ?? []) as string[];
  const macdHist = (data.macd?.histogram ?? 0) as number;
  const obvTrend = (data.obv?.trend ?? '') as string;
  const isJpy    = symbol.includes('JPY');
  const isXau    = symbol.includes('XAU');
  const symUpper  = symbol.toUpperCase();
  const isCrypto = symUpper.includes('BTC') || symUpper.includes('XBT') || symUpper.includes('ETH') ||
                   symUpper.includes('LTC') || symUpper.includes('XRP') || symUpper.includes('ADA') ||
                   symUpper.includes('SOL') || symUpper.includes('BNB') || symUpper.includes('DOT');
  const utcDay   = new Date().getUTCDay(); // 0=Sun, 6=Sat
  const isWeekend = utcDay === 0 || utcDay === 6;

  // Helpers
  const pricePct  = (a: number, b: number) => Math.abs(a - b) / Math.max(b, 0.00001) * 100;
  const hasPattern = (...names: string[]) =>
    patterns.some(p => names.some(n => p.toLowerCase().includes(n.toLowerCase())));

  // ── 0. BTC / CRYPTO WEEKEND ─────────────────────────────────────────────
  // Crypto trades 24/7 but weekends = institutional players absent, retail-driven,
  // wider spreads, lower liquidity — needs a distinct approach.
  //   Trending  (ADX ≥ 22): ride momentum continuation, smaller size (no institution to reverse on)
  //   Ranging   (ADX < 22): mean-revert between weekly range extremes, fade overextended moves
  if (isCrypto && isWeekend) {
    const isVolumeOk = volTrend === 'surging' || volTrend === 'above_average' || volTrend === 'average';
    const dayLabel = utcDay === 6 ? 'Saturday' : 'Sunday';
    if (adxVal >= 22 && trend !== 'NEUTRAL' && diSep >= 8 && isVolumeOk) {
      return {
        strategy: 'btc_weekend_momentum',
        reason: `Crypto ${dayLabel} — trending market (ADX=${adxVal.toFixed(1)}, ${trend}, DI_sep=${diSep.toFixed(1)}). Vol=${volTrend}. Institutions absent = cleaner trends. Ride direction with 50% reduced size. Tight trailing stop — weekend gaps can snap.`,
        priority: 'high',
        minConfluences: 4,
      };
    }
    // Ranging weekend — fade extremes, trade S/R bounces near weekly open
    const vwapNote = vwapVal && price
      ? ` Price ${((price - vwapVal) / vwapVal * 100).toFixed(2)}% from VWAP.`
      : '';
    return {
      strategy: 'btc_weekend_range',
      reason: `Crypto ${dayLabel} — ranging market (ADX=${adxVal.toFixed(1)}, no clear trend). Low institutional liquidity. Fade extremes, buy support, sell resistance. Mean-revert to VWAP.${vwapNote} Reduce size 50%. Avoid Sunday 20:00–21:00 UTC (CME gap zone).`,
      priority: 'medium',
      minConfluences: 4,
    };
  }

  // ── 1. NEWS FADE ────────────────────────────────────────────────────────
  if (lastHighImpactNewsAt) {
    const msSince = Date.now() - new Date(lastHighImpactNewsAt).getTime();
    const inFadeWindow = msSince >= 5 * 60000 && msSince <= 30 * 60000;
    const rsiExtreme = rsiVal > 72 || rsiVal < 28;
    const volDeclined = relVol < 1.0 && relVol > 0; // volume declining after spike
    if (inFadeWindow && rsiExtreme && volDeclined) {
      return {
        strategy: 'news_fade',
        reason: `Post-news fade: ${Math.round(msSince / 60000)}min after event, RSI=${rsiVal.toFixed(1)} (extreme), volume declining (${relVol.toFixed(2)}x)`,
        priority: 'high',
        minConfluences: 3,
      };
    }
  }

  // ── 2. ASIA RANGE BREAKOUT ──────────────────────────────────────────────
  // London open window (07:00–08:30 UTC). Asia range must be set.
  const isLondonOpenWindow = (utcHour === 7) || (utcHour === 8 && utcMinute < 30);
  if (isLondonOpenWindow && asiaHigh && asiaLow && price) {
    const asiaRange = asiaHigh - asiaLow;
    const nearHigh = pricePct(price, asiaHigh) < 0.15;
    const nearLow  = pricePct(price, asiaLow)  < 0.15;
    const brokenHigh = price > asiaHigh;
    const brokenLow  = price < asiaLow;
    if ((nearHigh || nearLow || brokenHigh || brokenLow) && relVol >= 1.2 && asiaRange > 0) {
      const side = (brokenHigh || nearHigh) ? 'AsiaHigh breakout' : 'AsiaLow breakdown';
      return {
        strategy: 'asia_range_breakout',
        reason: `London open window (${utcHour}:${utcMinute.toString().padStart(2,'0')} UTC). Asia range defined. ${side}. Vol=${volTrend} (${relVol.toFixed(2)}x)`,
        priority: 'high',
        minConfluences: 3,
      };
    }
  }

  // ── 3. SESSION BREAKOUT ─────────────────────────────────────────────────
  // First 30 min of London (07:00–07:30) or NY (13:00–13:30)
  const isLondonOpen = utcHour === 7 && utcMinute < 30;
  const isNYOpen     = utcHour === 13 && utcMinute < 30;
  if ((isLondonOpen || isNYOpen) && relVol >= 1.4 && adxVal >= 15) {
    return {
      strategy: 'session_breakout',
      reason: `${isLondonOpen ? 'London' : 'NY'} open breakout window (${utcHour}:${utcMinute.toString().padStart(2,'0')} UTC). ADX=${adxVal.toFixed(1)}, Vol=${volTrend} (${relVol.toFixed(2)}x). First-30-min momentum.`,
      priority: 'high',
      minConfluences: 3,
    };
  }

  // ── 4. ICT OTE ──────────────────────────────────────────────────────────
  // H1 BOS or CHOCH detected + price inside 61.8–78.6% retracement zone
  if (htfBias?.bosChoch.detected && fib && price) {
    const f618 = fib['61.8'];
    const f786 = fib['78.6'];
    if (f618 && f786) {
      const lo = Math.min(f618, f786);
      const hi = Math.max(f618, f786);
      const inOTE = price >= lo * 0.9995 && price <= hi * 1.0005;
      if (inOTE) {
        return {
          strategy: 'ict_ote',
          reason: `H1 ${htfBias.bosChoch.type} (${htfBias.bosChoch.direction}) + price in OTE zone (61.8–78.6% Fib: ${lo.toFixed(5)}–${hi.toFixed(5)}). Institutional precision entry.`,
          priority: 'high',
          minConfluences: 5,
        };
      }
    }
  }

  // ── 5. SMC DEMAND / SUPPLY ──────────────────────────────────────────────
  // HTF is in premium/discount zone + Wyckoff accumulation/distribution
  if (htfBias?.premiumDiscount && htfBias.wyckoff.detected) {
    const phase = htfBias.wyckoff.phase;
    const zone  = htfBias.premiumDiscount.zone;
    const isBull = (phase === 'ACCUMULATION' || phase === 'MARKUP') && zone === 'DISCOUNT';
    const isBear = (phase === 'DISTRIBUTION' || phase === 'MARKDOWN') && zone === 'PREMIUM';
    if (isBull || isBear) {
      return {
        strategy: 'smc_demand_supply',
        reason: `HTF zone: ${zone} + Wyckoff ${phase}. Price ${isBull ? 'at discount demand zone → BUY' : 'at premium supply zone → SELL'}. Smart money footprint confirmed.`,
        priority: 'high',
        minConfluences: 5,
      };
    }
  }

  // ── 6. SNIPER ────────────────────────────────────────────────────────────
  // Price at Fib 38.2% or 61.8% + nearby S/R + reversal candle pattern
  const hasReversalPattern = hasPattern(
    'Engulfing', 'Hammer', 'Morning Star', 'Evening Star', 'Pin Bar', 'Doji', 'Shooting Star', 'Tweezer'
  );
  const nearFib = fib && price && (
    (fib['38.2'] && pricePct(price, fib['38.2']) < 0.12) ||
    (fib['61.8'] && pricePct(price, fib['61.8']) < 0.12)
  );
  const fibLabel = nearFib && fib
    ? (fib['38.2'] && pricePct(price, fib['38.2']) < 0.12 ? '38.2%' : '61.8%')
    : null;
  const nearSRLevel = sr && price && (
    (sr.supports  || []).some((s: number) => pricePct(price, s) < 0.15) ||
    (sr.resistances || []).some((r: number) => pricePct(price, r) < 0.15)
  );
  if (nearFib && nearSRLevel && hasReversalPattern && adxVal >= 12) {
    return {
      strategy: 'sniper',
      reason: `Price at Fib ${fibLabel} + S/R confluence + ${patterns.find(p => ['Engulfing','Hammer','Star','Pin'].some(n => p.includes(n))) || 'reversal pattern'}. Precision sniper setup.`,
      priority: 'high',
      minConfluences: 5,
    };
  }

  // ── 7. VWAP MEAN REVERSION ──────────────────────────────────────────────
  // Price > 0.15% from VWAP + RSI at extreme + volume declining on the push
  if (vwapVal && price) {
    const vwapDevPct = Math.abs((price - vwapVal) / vwapVal * 100);
    const rsiExtreme = rsiVal > 68 || rsiVal < 32;
    const volDeclining = relVol < 0.85;
    if (vwapDevPct > 0.15 && rsiExtreme && volDeclining) {
      const dir = price > vwapVal ? 'above (fade SELL)' : 'below (fade BUY)';
      return {
        strategy: 'vwap_mean_reversion',
        reason: `Price ${vwapDevPct.toFixed(3)}% ${dir} VWAP. RSI=${rsiVal.toFixed(1)} (extreme). Volume declining (${relVol.toFixed(2)}x). Mean reversion toward VWAP.`,
        priority: 'medium',
        minConfluences: 3,
      };
    }
  }

  // ── 8. MOMENTUM ─────────────────────────────────────────────────────────
  // ADX ≥ 25, strong DI separation, volume above average or surging
  const isVolumeGood = volTrend === 'surging' || volTrend === 'above_average';
  if (adxVal >= 25 && trend !== 'NEUTRAL' && diSep >= 10 && isVolumeGood) {
    return {
      strategy: 'momentum',
      reason: `Strong trend: ADX=${adxVal.toFixed(1)}, DI_sep=${diSep.toFixed(1)} (${trend}), Vol=${volTrend} (${relVol.toFixed(2)}x). Ride institutional momentum.`,
      priority: 'high',
      minConfluences: 3,
    };
  }
  // Moderate momentum (ADX 20-25)
  if (adxVal >= 20 && trend !== 'NEUTRAL' && diSep >= 8 && relVol >= 0.9) {
    return {
      strategy: 'momentum',
      reason: `Moderate trend: ADX=${adxVal.toFixed(1)}, DI_sep=${diSep.toFixed(1)}, Vol=${volTrend}. Momentum continuation likely.`,
      priority: 'medium',
      minConfluences: 3,
    };
  }

  // ── 9. SCALPING ──────────────────────────────────────────────────────────
  // ADX 15-28, mild-moderate trend, active London/NY session, volume ≥ average
  const isActiveSession = (utcHour >= 7 && utcHour < 12) || (utcHour >= 13 && utcHour < 19);
  const sym = symbol.toUpperCase();
  const notLowLiquidityAsian = !(
    (utcHour >= 0 && utcHour < 7) && (sym.includes('EUR') || sym.includes('GBP') || sym.includes('CHF')) && !isJpy
  );
  if (adxVal >= 15 && adxVal < 28 && trend !== 'NEUTRAL' && isActiveSession && relVol >= 0.7 && notLowLiquidityAsian) {
    const session = (utcHour >= 7 && utcHour < 12) ? 'London' : 'NY';
    return {
      strategy: 'scalping',
      reason: `M15 trend ${trend} (ADX=${adxVal.toFixed(1)}), active ${session} session, Vol=${volTrend} (${relVol.toFixed(2)}x). Momentum scalp in trend direction.`,
      priority: 'medium',
      minConfluences: 4,
    };
  }

  // ── 10. NO CLEAR SETUP ───────────────────────────────────────────────────
  if (adxVal < 12 || diSep < 6) {
    return {
      strategy: 'wait',
      reason: `Market ranging/directionless: ADX=${adxVal.toFixed(1)}, DI_sep=${diSep.toFixed(1)}. No strategy has an edge right now. Wait for trend to emerge.`,
      priority: 'none',
      minConfluences: 0,
    };
  }

  // Mild trend — default to global strategy mode with low priority
  return {
    strategy: globalStrategyMode || 'momentum',
    reason: `Mild conditions (ADX=${adxVal.toFixed(1)}, DI_sep=${diSep.toFixed(1)}). Defaulting to configured strategy: ${globalStrategyMode || 'momentum'}.`,
    priority: 'low',
    minConfluences: 3,
  };
}

async function runAILiveAnalysis(userId: number, marketAnalysis: Record<string, any>, brain: any, newsContext?: NewsContext, crossAssets?: Record<string, any>, triggerAlerts?: string[], htfMarketData?: Record<string, HTFBiasData>): Promise<void> {
  const state = engineStates[userId];
  if (!state) return;

  const aiMode = state.config.aiMode || 'full';

  // ── Rule-Based Mode: zero API calls ─────────────────────────────────
  if (aiMode === 'rule_based') {
    addActivity(userId, { type: 'info', message: '⚙️ Rule-based mode — processing indicator consensus (no API call)' });
    let totalSignals = 0;
    for (const [symbol, data] of Object.entries(marketAnalysis) as [string, any][]) {
      const result = generateRuleBasedSignals({ ...data, currentPrice: data.currentPrice }, state.config, symbol);
      if (result.decisions && result.decisions.length > 0) {
        totalSignals += result.decisions.length;
        addActivity(userId, { type: 'ai_decision', symbol, message: `Rule-based: ${result.decisions[0].direction} on ${symbol} | Confidence: ${result.engineConfidence}% | ${result.decisions.length} signal(s)`, details: { marketOverview: result.marketOverview } });
        for (const decision of result.decisions) {
          await processDecision(userId, decision, newsContext);
        }
      }
    }
    if (totalSignals === 0) {
      addActivity(userId, { type: 'info', message: 'Rule-based: no signals generated this cycle — insufficient indicator alignment across all pairs' });
    }
    state.lastSignalAt = new Date().toISOString();
    return;
  }

  // ── Pre-filter gate: skip AI call for pairs with no indicator alignment ──────
  // Raised from 3 → 4 votes required. 3/7 is only 43% alignment (near coin-flip).
  // 4/7 is 57% — meaningful majority. This dramatically reduces low-quality signals.
  {
    const filteredAnalysis: Record<string, any> = {};
    const voteSummary: string[] = [];
    const PREFILTER_VOTE_THRESHOLD = 4;
    for (const [sym, data] of Object.entries(marketAnalysis) as [string, any][]) {
      const { bull, bear } = countIndicatorAlignment(data);
      const direction = bull >= bear ? `🟢${bull}B` : `🔴${bear}R`;
      const passed = bull >= PREFILTER_VOTE_THRESHOLD || bear >= PREFILTER_VOTE_THRESHOLD;
      voteSummary.push(`${sym}:${direction}${passed ? '✓' : '✗'}`);
      if (passed) {
        filteredAnalysis[sym] = data;
      }
    }
    addActivity(userId, { type: 'info', message: `Pre-filter votes (need ${PREFILTER_VOTE_THRESHOLD}+): ${voteSummary.join(' | ')}` });
    if (Object.keys(filteredAnalysis).length === 0) {
      addActivity(userId, { type: 'info', message: `Pre-filter: no pairs with ${PREFILTER_VOTE_THRESHOLD}+ indicator votes this cycle — AI call skipped (market in full consolidation)` });
      return;
    }
    // Use filtered set for the AI call
    marketAnalysis = filteredAnalysis;
  }

  let openai: any;
  try {
    const { getUniversalAIClientForUser } = await import('../openai');
    try {
      openai = await getUniversalAIClientForUser(userId);
    } catch {
      addActivity(userId, { type: 'error', message: 'No AI API key configured. Cannot analyze.' });
      return;
    }

    // ── Economy mode: override with Groq client ──────────────────────────
    if (aiMode === 'economy' && process.env.GROQ_API_KEY) {
      try {
        const OpenAI = (await import('openai')).default;
        const groqClient = new OpenAI({
          apiKey: process.env.GROQ_API_KEY,
          baseURL: 'https://api.groq.com/openai/v1',
        });
        (groqClient as any).defaultModel = 'llama-3.3-70b-versatile';
        openai = groqClient;
        addActivity(userId, { type: 'info', message: '💚 Economy mode: routing to Groq Llama 3.3-70b (free tier) — cost reduced' });
      } catch {
        addActivity(userId, { type: 'info', message: 'Economy mode: Groq unavailable, falling back to primary AI client' });
      }
    } else if (aiMode === 'economy') {
      addActivity(userId, { type: 'info', message: '💚 Economy mode: GROQ_API_KEY not set — using primary client. Set GROQ_API_KEY for free routing.' });
    }

    const model = openai.defaultModel || 'gpt-4o';

    const now = new Date();
    const hour = now.getUTCHours();
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[now.getUTCDay()];
    const session = hour < 7 ? 'Asian' : hour < 13 ? 'London' : hour < 20 ? 'New York' : 'Late NY';

    const openPositions = (global as any).mt5OpenPositions?.[userId]?.positions || [];
    const currentOpenCount = openPositions.length;
    state.openPositionCount = currentOpenCount;

    const brainInsights = brain?.learningInsights?.join('\n') || 'No prior learning data';
    const pairKnowledge = brain?.pairKnowledge ? JSON.stringify(brain.pairKnowledge, null, 1) : '{}';

    // ── Asia Range Tracking ────────────────────────────────────────────
    const nowUtc = new Date();
    const todayStr = nowUtc.toISOString().substring(0, 10);
    const hourUtc = nowUtc.getUTCHours();
    const isAsianSession = hourUtc >= 0 && hourUtc < 7;

    // Reset range each new day
    if (state.asiaRangeDate !== todayStr) {
      state.asiaRangeHigh = {};
      state.asiaRangeLow = {};
      state.asiaRangeDate = todayStr;
    }

    // Track Asia high/low per pair during Asian session
    if (isAsianSession) {
      for (const [sym, data] of Object.entries(marketAnalysis) as [string, any][]) {
        const price = data.currentPrice;
        if (typeof price === 'number' && price > 0) {
          if (state.asiaRangeHigh[sym] === undefined || price > state.asiaRangeHigh[sym]) {
            state.asiaRangeHigh[sym] = price;
          }
          if (state.asiaRangeLow[sym] === undefined || price < state.asiaRangeLow[sym]) {
            state.asiaRangeLow[sym] = price;
          }
        }
      }
    }

    // Track last high-impact news timestamp for news fade strategy
    if (newsContext?.highImpactSoon) {
      state.lastHighImpactNewsAt = new Date().toISOString();
    }

    // ── Per-pair adaptive strategy selection ─────────────────────────────
    // Run BEFORE the AI prompt is assembled so each pair's recommended strategy
    // is injected into the market summary the AI reads.
    const nowForStrategy = new Date();
    const utcHourForStrategy = nowForStrategy.getUTCHours();
    const utcMinForStrategy  = nowForStrategy.getUTCMinutes();
    const pairStrategies: Record<string, StrategyRecommendation> = {};
    const stratSummaryLines: string[] = [];

    for (const [sym, data] of Object.entries(marketAnalysis) as [string, any][]) {
      const rec = selectStrategyForPair(
        sym,
        data,
        htfMarketData?.[sym],
        state.asiaRangeHigh[sym],
        state.asiaRangeLow[sym],
        utcHourForStrategy,
        utcMinForStrategy,
        state.lastHighImpactNewsAt,
        state.config.strategyMode,
      );
      pairStrategies[sym] = rec;
      if (rec.priority !== 'none') {
        stratSummaryLines.push(`${sym}→${rec.strategy.toUpperCase()}(${rec.priority}): ${rec.reason}`);
      }
    }

    // Log strategy selections for the activity feed (one combined line)
    if (stratSummaryLines.length > 0) {
      addActivity(userId, {
        type: 'info',
        message: `📊 Adaptive strategy selection:\n${stratSummaryLines.join('\n')}`,
      });
    }

    const marketSummary = Object.entries(marketAnalysis).map(([sym, data]: [string, any]) => {
      const sr = data.supportResistance;
      const fib = data.fibonacci;
      const vol = data.volatilityContext;
      const vm = data.volumeMetrics as VolumeMetrics | undefined;
      const asiaH = state.asiaRangeHigh[sym];
      const asiaL = state.asiaRangeLow[sym];
      const asiaRangeStr = (asiaH && asiaL) ? `, AsiaHigh=${asiaH}, AsiaLow=${asiaL}, AsiaRange=${(Math.abs(asiaH - asiaL) * (sym.includes('JPY') ? 100 : 10000)).toFixed(1)}pips` : '';
      const vwapVal = data.vwap?.value;
      const vwapDev = (vwapVal && data.currentPrice) ? ((data.currentPrice - vwapVal) / vwapVal * 100).toFixed(3) : 'N/A';
      const htf = htfMarketData?.[sym];
      const inlineHTFLabel = ((state.config as any).primaryTimeframe || 'M15') === 'H1' ? 'H4' : 'H1';
      const htfStr = htf ? `, ${inlineHTFLabel}_Bias=${htf.trend}, ${inlineHTFLabel}_BOS=${htf.bosChoch.detected ? `${htf.bosChoch.type}_${htf.bosChoch.direction}` : 'NONE'}, ${inlineHTFLabel}_PD=${htf.premiumDiscount.zone}, ${inlineHTFLabel}_Wyckoff=${htf.wyckoff.detected ? htf.wyckoff.phase : 'NONE'}` : '';
      const adxNum = (data.adx?.value ?? data.adx?.adx ?? 0) as number;
      const pDI = (data.plusDI ?? data.adx?.plusDI ?? 0) as number;
      const mDI = (data.minusDI ?? data.adx?.minusDI ?? 0) as number;
      const diDir = pDI > 0 || mDI > 0
        ? (pDI > mDI ? `BULL(+DI ${pDI.toFixed(1)}>-DI ${mDI.toFixed(1)})` : `BEAR(-DI ${mDI.toFixed(1)}>+DI ${pDI.toFixed(1)})`)
        : 'DI_UNAVAILABLE';
      // ── Adaptive strategy recommendation for this pair ──────────────────
      const rec = pairStrategies[sym];
      const stratStr = rec && rec.priority !== 'none'
        ? ` ★STRATEGY=${rec.strategy.toUpperCase()}(priority:${rec.priority},need:${rec.minConfluences}conf)[${rec.reason}]`
        : ` ★STRATEGY=WAIT[${rec?.reason || 'no clear setup'}]`;
      return `${sym}: Price=${data.currentPrice}, Trend=${data.trend}, ADX=${adxNum.toFixed(1)}, DI_Direction=${diDir}, RSI=${data.rsi?.value?.toFixed(1) || 'N/A'}, Stoch K=${data.stochastic?.k?.toFixed(1) || 'N/A'} D=${data.stochastic?.d?.toFixed(1) || 'N/A'}, MACD=${data.macd?.macd?.toFixed(5) || 'N/A'}(hist=${data.macd?.histogram?.toFixed(5) || 'N/A'}), VWAP=${vwapVal?.toFixed(5) || 'N/A'} (Dev${vwapDev}%), OBV Trend=${data.obv?.trend || 'N/A'}, Patterns=[${(data.candlePatterns || []).join(',')}], Session=${data.sessionContext?.currentSession || 'N/A'}, Volatility=${vol?.percentile?.toFixed(0) || 'N/A'}%, ATR=${(vol?.currentATR ?? 0).toFixed(5)}, Support=${sr?.supports?.[0]?.toFixed(5) || 'N/A'}, Resistance=${sr?.resistances?.[0]?.toFixed(5) || 'N/A'}, Fib 38.2%=${fib?.retracementLevels?.['38.2']?.toFixed(5) || 'N/A'}, Volume=${vm ? `RelVol=${vm.relativeVolume}x (${vm.volumeTrend}), Spikes=${vm.volumeSpikes}` : 'N/A'}${asiaRangeStr}${htfStr}${stratStr}`;
    }).join('\n');

    let htfBiasSection = '';
    const promptHTFLabel = ((state.config as any).primaryTimeframe || 'M15') === 'H1' ? 'H4' : 'H1';
    if (htfMarketData && Object.keys(htfMarketData).length > 0) {
      const htfLines = Object.entries(htfMarketData).map(([sym, htf]) => {
        const m15Trend = marketAnalysis[sym]?.trend || 'NEUTRAL';
        const aligns = htf.trend === 'NEUTRAL' || m15Trend === 'NEUTRAL' ||
          (m15Trend === 'BULLISH' && htf.trend === 'BULLISH') ||
          (m15Trend === 'BEARISH' && htf.trend === 'BEARISH');
        const alignLabel = htf.trend === 'NEUTRAL' ? `${promptHTFLabel} NEUTRAL` : aligns ? `ALIGNS (M15 ${m15Trend} + ${promptHTFLabel} ${htf.trend})` : `⚠ CONFLICT (M15 ${m15Trend} vs ${promptHTFLabel} ${htf.trend})`;
        return `- ${sym}: ${promptHTFLabel} Trend=${htf.trend} | BOS/CHOCH=${htf.bosChoch.detected ? htf.bosChoch.description : 'No clear structure'} | PD Zone=${htf.premiumDiscount.zone} | Wyckoff=${htf.wyckoff.detected ? `${htf.wyckoff.phase}${htf.wyckoff.stage ? '/' + htf.wyckoff.stage : ''}` : 'None'} | ${alignLabel}`;
      }).join('\n');
      htfBiasSection = `
HTF BIAS (${promptHTFLabel} STRUCTURE — higher timeframe directional filter):
${htfLines}
INSTRUCTION: Signals that ALIGN with ${promptHTFLabel} bias are high-quality institutional setups — give them +5% confidence bonus. Signals that CONFLICT with ${promptHTFLabel} bias are counter-trend fades — require 80%+ base confidence before firing. If ${promptHTFLabel} shows strong BOS/CHOCH in one direction and M15 signals the opposite, SKIP unless you have 5+ LTF confluences.
`;
    }

    const openPosStr = openPositions.length > 0
      ? openPositions.map((p: any) => {
          const pipSize = getPipSize(p.symbol || '');
          const pips = p.direction === 'BUY'
            ? (p.currentPrice - p.openPrice) / pipSize
            : (p.openPrice - p.currentPrice) / pipSize;
          const ticketId = p.ticket ?? p.id ?? 'unknown';
          const slInfo = p.sl > 0 ? p.sl : 'none';
          const tpInfo = p.tp > 0 ? p.tp : 'none';
          // Include trade age so the AI can accurately judge "30 min stagnant" —
          // previously it had no time context and closed trades within minutes of opening.
          const openTimeSec = p.openTime ? Math.round((Date.now() / 1000) - Number(p.openTime)) : null;
          const ageMin = openTimeSec != null ? Math.floor(openTimeSec / 60) : null;
          const ageStr = ageMin != null ? ` | Age: ${ageMin}min` : '';
          const beThreshold = 15;
          const trailThreshold = 40;
          // CHANGED: pips < -5 no longer shows "REVIEW SL" which was nudging
          // the AI to close trades that were barely negative. Now it explicitly
          // tells the AI to hold and trust the SL — preventing premature closure.
          const mgmtHint = pips >= trailThreshold
            ? '→ TRAIL STOP (staged: 25-pip trail if vol surging/above_avg, 20-pip if avg, 15-pip if below_avg/dry)'
            : pips >= beThreshold
            ? '→ MOVE TO BREAKEVEN ONLY — not ready to trail yet'
            : pips < -5
            ? `→ HOLD — SL provides protection. Do NOT close early (${ageMin != null ? `open ${ageMin}min` : 'age unknown'}). Only close if original setup structure breaks on H1.`
            : '';
          return `${p.symbol} (ticket:${ticketId}): ${p.direction} @ ${p.openPrice} | Curr: ${p.currentPrice} | Pips: ${pips.toFixed(1)} | PnL: $${p.profit} | SL: ${slInfo} | TP: ${tpInfo} | Vol: ${p.volume}${ageStr} ${mgmtHint}`;
        }).join('\n')
      : 'None';

    const config = state.config;
    const tracker = state.goalTracker;
    const dailyTarget = getDailyTargetFromGoal(tracker);
    const daysLeft = getDaysRemaining();
    const compMult = tracker.compoundMultiplier;
    const adjustedBaseLot = Math.round((config.baseLotSize * compMult) * 100) / 100;
    const effectiveMaxLot = config.maxLotSize;

    const goalSection = config.weeklyProfitTarget > 0 ? `
WEEKLY PROFIT GOAL SYSTEM:
- Weekly Target: $${config.weeklyProfitTarget} | Current Profit: $${tracker.currentProfit} | Progress: ${tracker.progressPercent}%
- Account Balance: $${config.accountBalance} | Goal Balance: $${config.accountBalance + config.weeklyProfitTarget}
- Days Remaining: ${daysLeft} trading days | Daily Target: $${dailyTarget}/day to stay on track
- Today's P&L: $${tracker.dailyPnL[new Date().toISOString().split('T')[0]] || 0}
- Win Rate: ${tracker.winRate}% (${tracker.wins}W / ${tracker.losses}L) | Streak: ${tracker.consecutiveWins > 0 ? tracker.consecutiveWins + ' wins' : tracker.consecutiveLosses + ' losses'}
- Phase: ${tracker.currentPhase.toUpperCase()} | Compound Multiplier: ${compMult}x
- Base Lot: ${config.baseLotSize} → Adjusted: ${adjustedBaseLot} (after compounding)
${tracker.currentPhase === 'warming_up' ? '- PHASE INSTRUCTIONS: Start conservative. Take only high-confidence setups (82%+). Build momentum with small wins. Use minimum lot sizes. Quality over quantity.' : ''}
${tracker.currentPhase === 'building' ? '- PHASE INSTRUCTIONS: Good progress. Use base lots. Focus on high-probability setups with clear HTF alignment. 2-4 quality trades per session. Do NOT force trades.' : ''}
${tracker.currentPhase === 'accelerating' ? '- PHASE INSTRUCTIONS: 25%+ done. Maintain discipline — do NOT lower confluence standards to chase frequency. Only take setups where HTF and M15 align. 3-5 trades/session MAX. Quality is the target, not volume.' : ''}
${tracker.currentPhase === 'cruising' ? '- PHASE INSTRUCTIONS: Halfway there. Maintain pace. Balance risk — do NOT blow gains. Use the compound multiplier but cap total open exposure to 3 trades max.' : ''}
${tracker.currentPhase === 'pushing' ? '- PHASE INSTRUCTIONS: 80%+ done! SHIFT TO PRESERVATION MODE NOW. Only A+ sniper/ICT setups with 85%+ confidence. Smaller lots. No scalping. Protect the gains.' : ''}
${tracker.currentPhase === 'target_reached' ? '- PHASE INSTRUCTIONS: TARGET HIT! PRESERVATION mode ONLY. Only ultra-high-confidence sniper setups (90%+). Minimum lot sizes. No scalping. Protect the bag.' : ''}

STRATEGY PERFORMANCE THIS WEEK:
${Object.entries(tracker.strategyBreakdown).map(([s, d]) => `- ${s}: ${d.trades} trades, ${d.wins} wins, $${d.pnl} P&L`).join('\n') || '- No trades yet'}

SESSION PERFORMANCE:
${Object.entries(tracker.sessionBreakdown).map(([s, d]) => `- ${s}: ${d.trades} trades, ${d.wins} wins, $${d.pnl} P&L`).join('\n') || '- No session data yet'}

PAIR PERFORMANCE THIS WEEK (use this to self-correct your trading):
${Object.keys(tracker.symbolBreakdown || {}).length > 0
  ? Object.entries(tracker.symbolBreakdown)
      .sort(([, a], [, b]) => b.pnl - a.pnl)
      .map(([symbol, d]) => {
        const winRate = d.trades > 0 ? Math.round((d.wins / d.trades) * 100) : 0;
        let label: string;
        let instruction: string;
        if (winRate >= 60 && d.pnl > 0) {
          label = 'FAVOUR';
          instruction = 'This pair is profitable this week - you can be slightly more aggressive on high-confidence setups.';
        } else if (d.trades >= 3 && (winRate < 40 || d.pnl < 0)) {
          label = 'AVOID';
          instruction = 'This pair has been underperforming. Require 85%+ confidence before entering, or skip marginal setups entirely.';
        } else {
          label = 'NEUTRAL';
          instruction = 'Trade with standard confidence thresholds.';
        }
        return `- ${symbol}: ${d.trades} trades | ${d.wins}W/${d.losses}L | ${winRate}% win rate | $${d.pnl >= 0 ? '+' : ''}${d.pnl} P&L → [${label}] ${instruction}`;
      }).join('\n')
  : '- No pair data yet this week. Treat all pairs equally until performance data builds up.'}
INSTRUCTION: Use the FAVOUR/NEUTRAL/AVOID ratings above to weight your decisions. Double down on pairs that are working. Be highly selective or skip pairs that are losing money.

PAIR + STRATEGY COMBINATIONS THIS WEEK (use this to pick the right strategy for each pair):
${Object.keys(tracker.pairStrategyBreakdown || {}).length > 0
  ? Object.entries(tracker.pairStrategyBreakdown)
      .sort(([, a], [, b]) => b.pnl - a.pnl)
      .map(([key, d]) => {
        const [symbol, strategy] = key.split('|');
        const winRate = d.trades > 0 ? Math.round((d.wins / d.trades) * 100) : 0;
        let label: string;
        if (winRate >= 60 && d.pnl > 0) label = 'BEST COMBO';
        else if (d.trades >= 2 && (winRate < 40 || d.pnl < 0)) label = 'POOR COMBO - AVOID';
        else label = 'NEUTRAL';
        return `- ${symbol} + ${strategy}: ${d.trades} trades | ${d.wins}W/${d.losses}L | ${winRate}% | $${d.pnl >= 0 ? '+' : ''}${d.pnl} → [${label}]`;
      }).join('\n')
  : '- No pair+strategy data yet. Build history over several trades.'}
INSTRUCTION: When deciding which strategy to apply to a pair, PRIORITISE combinations labelled BEST COMBO. AVOID combinations labelled POOR COMBO even if the pair or strategy looks good individually.
` : '';

    // ── Cross-Asset Context Block ──────────────────────────────────────
    let crossAssetSection = '';
    if (crossAssets && Object.keys(crossAssets).length > 0) {
      const dxy = crossAssets['USDI'];
      const gold = crossAssets['XAUUSD'];
      const us30 = crossAssets['US30'];
      const sentimentScore =
        (dxy ? (dxy.trend === 'UP' ? 1 : dxy.trend === 'DOWN' ? -1 : 0) : 0) * -1 + // DXY up = USD bullish, negative for risk pairs
        (gold ? (gold.trend === 'UP' ? -1 : gold.trend === 'DOWN' ? 1 : 0) : 0) + // Gold up = risk-off
        (us30 ? (us30.trend === 'UP' ? 1 : us30.trend === 'DOWN' ? -1 : 0) : 0);   // US30 up = risk-on
      const sentimentLabel = sentimentScore >= 2 ? 'RISK-ON (strong)' : sentimentScore >= 1 ? 'RISK-ON (mild)' : sentimentScore <= -2 ? 'RISK-OFF (strong)' : sentimentScore <= -1 ? 'RISK-OFF (mild)' : 'NEUTRAL';
      crossAssetSection = `
MACRO CROSS-ASSET SIGNALS:
${dxy ? `DXY (USD Index): ${dxy.trend} → ${dxy.trend === 'UP' ? 'USD strengthening — favour selling EUR/GBP/AUD, buying USD pairs' : dxy.trend === 'DOWN' ? 'USD weakening — favour buying EUR/GBP/AUD, selling USD pairs' : 'USD flat — neutral bias on USD pairs'}` : ''}
${gold ? `Gold (XAUUSD): ${gold.trend} → ${gold.trend === 'UP' ? 'Risk-OFF — flight to safety, favour JPY/CHF/Gold buys, avoid risk assets' : gold.trend === 'DOWN' ? 'Risk-ON — appetite for risk, favour AUD/NZD/equities, reduce JPY/CHF longs' : 'Gold flat — neutral risk environment'}` : ''}
${us30 ? `US30 (Dow Jones): ${us30.trend} → ${us30.trend === 'UP' ? 'Equities bid — risk-on, USD mixed, favour commodity currencies' : us30.trend === 'DOWN' ? 'Equities selling — risk-off, favour JPY/CHF/Gold, reduce exposure' : 'Equities flat — neutral macro environment'}` : ''}
Risk Sentiment Score: ${sentimentScore > 0 ? '+' : ''}${sentimentScore}/3 — ${sentimentLabel}
INSTRUCTION: Entries that align with this macro bias get +5% confidence. Entries opposing the bias need 80%+ base confidence before firing. If risk-off, avoid AUDJPY/AUDUSD buys. If risk-on, avoid USDJPY/CHF buys unless technically exceptional.
`;
    }

    // ── Strategy Performance Weights Block ────────────────────────────
    let weightsSection = '';
    if (state.strategyPerformanceWeights && Object.keys(state.strategyPerformanceWeights).length > 0) {
      const wEntries = Object.entries(state.strategyPerformanceWeights)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .map(([k, v]) => {
          const vn = v as number;
          const tag = vn >= 1.5 ? '🔥HOT' : vn >= 1.2 ? '✅WARM' : vn <= 0.3 ? '❌COLD' : vn <= 0.6 ? '⚠️COOL' : '◻️OK';
          return `${k}=${vn.toFixed(2)}${tag}`;
        }).join(', ');
      weightsSection = `
STRATEGY PERFORMANCE WEIGHTS (real-time, updated after every trade result):
${wEntries}
INSTRUCTION: Strategies marked 🔥HOT (≥1.5) or ✅WARM (≥1.2) — prioritise these, lower confidence threshold by 5%. Strategies ⚠️COOL (≤0.6) — only take if 85%+ confidence. Strategies ❌COLD (≤0.3) — skip entirely this session. This reflects actual live market performance — trust it.
`;
    }

    // ── Dual-Mode Arbitration Block ────────────────────────────────────
    let dualModeSection = '';
    if (config.useKellyCriterion && config.enablePyramiding) {
      dualModeSection = `
DUAL-MODE ACTIVE: Kelly Criterion + Auto-Pyramid are both enabled. You MUST choose which applies to each trade:
• KELLY ONLY (use when ADX < 25 — ranging/choppy market): Output a standard OPEN_TRADE signal. The engine automatically sizes using Kelly. Do NOT recommend pyramiding on ranging markets — it increases risk with no momentum edge.
• PYRAMID ALLOWED (use when ADX ≥ 25 — trending market): Include "pyramidAllowed": true in your JSON. The engine will add to winners automatically at +15 pips using Kelly-sized lots. Only recommend this on strongly trending setups with 5+ confluences.
• RULE: Never output pyramiding on reversal strategies (ict_ote, smc_demand_supply, news_fade) — those are mean-reversion and conflate badly with pyramiding.
• The engine will log its arbitration decision in the activity feed after every signal.
`;
    } else if (config.useKellyCriterion) {
      dualModeSection = `KELLY CRITERION ACTIVE: All lot sizes are dynamically calculated from per-strategy win rate and R:R history. Your suggested lotSize will be overridden by Kelly math. Focus on confidence and direction — the engine handles sizing.\n`;
    } else if (config.enablePyramiding) {
      dualModeSection = `AUTO-PYRAMID ACTIVE: For trending setups (ADX ≥ 25) with strong momentum, the engine will automatically add to winning positions at +15 pips. Favour momentum and breakout strategies for pyramid-eligible setups.\n`;
    }

    // ── Shield Override Block ──────────────────────────────────────────
    let shieldSection = '';
    if (state.drawdownShieldActive) {
      shieldSection = `
⚠️ DRAWDOWN SHIELD ACTIVE: Session has pulled back from its peak. PROTECT MODE ENGAGED.
ONLY trade these strategies: prop_firm_sniper, ict_ote, ict_order_blocks, sniper
Risk MAXIMUM 0.25% per trade (0.0025 × account balance)
NO scalping, NO momentum, NO compound, NO session_breakout strategies
REQUIRED confidence: 80%+ minimum before ANY entry
Your job is to protect what's been built and claw back to the peak methodically.
`;
    }

    // ── Trigger Alert Block ─────────────────────────────────────────────
    let triggerSection = '';
    if (triggerAlerts && triggerAlerts.length > 0) {
      triggerSection = `
🚨 LIVE TRIGGER ALERTS (priority pairs for this scan):
${triggerAlerts.map(t => `- ${t}`).join('\n')}
INSTRUCTION: This scan was triggered by real-time indicator events above. Prioritise evaluation of the flagged pairs immediately. High-probability entries may be forming RIGHT NOW.
`;
    }

    // ── Build code-gate status section so AI knows what's already protected ──
    let codeGateSection = '';
    {
      if (!state.pairDirectionLock) state.pairDirectionLock = {};
      const activeLocks = Object.entries(state.pairDirectionLock)
        .filter(([, v]) => Date.now() < v.lockedUntil)
        .map(([sym, v]) => `${sym}:${v.direction}(${Math.ceil((v.lockedUntil - Date.now()) / 60000)}min,${v.lossCount}L)`);
      if (activeLocks.length > 0) {
        codeGateSection = `
CODE-LEVEL DIRECTION LOCKS (engine auto-rejects these regardless of your signal):
${activeLocks.join(', ')}
These pairs had recent losses. Same-direction entries are code-blocked for 45-90 min. Focus on unlocked pairs or opposite direction if structure supports it.
`;
      }
    }

    const prompt = `You are VEDD SS AI LIVE TRADING ENGINE - operating in REAL-TIME autonomous HIGH-FREQUENCY mode. You are directly monitoring live market data and making INSTANT trading decisions to hit a weekly profit goal.
${triggerSection}${crossAssetSection}${codeGateSection}
LIVE MARKET DATA (just fetched):
${marketSummary}

CURRENT OPEN POSITIONS (${currentOpenCount}/${config.maxOpenTrades} max):
${openPosStr}

BRAIN KNOWLEDGE (from historical learning):
${brainInsights}

PAIR-SPECIFIC KNOWLEDGE:
${pairKnowledge}
${weightsSection}${htfBiasSection}${shieldSection}${dualModeSection}${goalSection}
REAL-TIME NEWS & MARKET SENTIMENT:
${newsContext && newsContext.headlines.length > 0 ? `Market Sentiment: ${newsContext.marketSentiment.toUpperCase()}
Recent Headlines:
${newsContext.headlines.map(h => `- ${h}`).join('\n')}` : 'No live news data available - trade based on technicals only'}

ECONOMIC CALENDAR (upcoming events affecting your pairs):
${newsContext && newsContext.economicEvents.length > 0 ? newsContext.economicEvents.join('\n') : 'No major events detected'}
${newsContext?.highImpactSoon ? `\n*** WARNING: ${newsContext.tradingWindowWarning} ***` : ''}

NEWS-AWARE TRADING RULES:
- BEFORE high-impact news (NFP, CPI, FOMC, rate decisions): AVOID opening new positions on affected currency pairs within 30 min of the event. For existing open positions — widen the SL if needed (MODIFY_POSITION + move_sl), but do NOT close them pre-emptively; news often accelerates the position's intended direction.
- AFTER high-impact news: Wait for the initial spike to settle (5-10 min), then trade the follow-through direction with momentum strategy
- If market sentiment is BULLISH: favor BUY setups on correlated pairs, tighten risk on SELL trades
- If market sentiment is BEARISH: favor SELL setups, tighten risk on BUY trades
- If sentiment is NEUTRAL or no news: trade purely on technicals

VOLUME-AWARE TRADING RULES:
- SURGING volume (RelVol 2x+): PRIORITY pairs - breakouts and momentum moves are most reliable here. Increase lot sizes on these pairs
- ABOVE AVERAGE volume (RelVol 1.3x+): Good trading conditions. Use standard strategies
- AVERAGE volume: Normal conditions. Focus on higher-confluence setups
- BELOW AVERAGE volume (RelVol <0.7x): REDUCE activity on these pairs. Tighter stops, smaller lots. Avoid breakout strategies - they fail in low volume
- DRY volume (RelVol <0.5x): AVOID trading these pairs entirely unless sniper setup with 5+ confluences. Low volume = fake breakouts, poor fills, wide spreads
- UNKNOWN volume (RelVol=0): Insufficient data - treat as BELOW AVERAGE. Do NOT use aggressive strategies on these pairs
- Volume SPIKES often precede big moves - if you see volume spikes with a consolidating price, a breakout is imminent
- Best trading windows: London open (07:00-10:00 UTC), NY open (13:00-16:00 UTC), London/NY overlap (13:00-16:00 UTC) - HIGHEST volume and best fills
- Worst windows: Late NY (20:00-00:00 UTC), Asian session for EUR/GBP pairs - LOW volume, choppy, wide spreads

AGGRESSIVE POSITION MANAGEMENT RULES:
- BE RELENTLESS: Your goal is maximum profit in minimum time. Manage active trades aggressively to lock in gains and free up margin for new high-frequency setups.
- BREAKEVEN: Move SL to entry only after 15+ pips profit. Give the trade room to breathe — do NOT rush to breakeven.
- ACTIVE TRAIL STRATEGY: ${TRAIL_METHOD_LABELS[config.trailMethod || 'staged_volume']}${config.trailMethod && config.trailMethod !== 'staged_volume' && config.trailMethod !== 'none' ? ` — the server is computing and applying trail SL updates automatically each scan cycle (activation: ${config.trailActivationPips ?? 15} pips in profit). Your position management role is PARTIAL_CLOSE and FULL_CLOSE decisions only — do NOT output trail_stop modify actions for open positions when a server-side trail method is active.` : ''}
${config.trailMethod === 'none' ? `- NO TRAILING STOP ACTIVE. The user has disabled trailing. Hold all open positions to their full TP target. Do NOT output trail_stop or trail_breakeven modify actions under any circumstances. Your only SL/TP actions are PARTIAL_CLOSE when TP1 is hit, or FULL_CLOSE if the setup completely invalidates (price action breaks structure against the trade). Original SL is the only protection — do not touch it.` : ''}
${(!config.trailMethod || config.trailMethod === 'staged_volume') ? `- TRAILING (STAGED + VOLUME-ADJUSTED — never trail too early, it kills winners):
    • 15–39 pips profit → Move SL to BREAKEVEN ONLY. Do not trail yet. Price needs room to develop.
    • 40–59 pips profit → Start trailing. Use volume-adjusted distance:
        - Volume SURGING or ABOVE_AVERAGE: 25-pip trail (strong momentum, give room to run)
        - Volume AVERAGE: 20-pip trail
        - Volume BELOW_AVERAGE or DRY: 15-pip trail (move exhausting, protect gains sooner)
    • 60–99 pips profit → Tighten trail. Use volume-adjusted distance:
        - Volume SURGING or ABOVE_AVERAGE: 20-pip trail
        - Volume AVERAGE: 15-pip trail
        - Volume BELOW_AVERAGE or DRY: 10-pip trail
    • 100+ pips profit → Lock in gains. Use volume-adjusted distance:
        - Volume SURGING or ABOVE_AVERAGE: 15-pip trail
        - Volume AVERAGE: 10-pip trail
        - Volume BELOW_AVERAGE or DRY: 8-pip trail
- NEVER use trail distance less than 8 pips — anything tighter gets hit by normal spread and noise.` : (config.trailMethod === 'none' ? '' : '- Trail SL management is handled server-side. Focus on: partial close at TP1, close if setup invalidated.')}
- PARTIAL CLOSE: Take 50% at TP1, then let the runner continue with the active trail method.
- RESPECT THE SL: A trade in drawdown is NOT a failed trade. Price oscillates — the stop loss exists precisely to protect against real failure. Do NOT close a position just because it is temporarily negative.
- STRUCTURAL INVALIDATION ONLY: Only close a losing trade if the ORIGINAL SETUP THESIS has been broken — e.g., a BOS/CHOCH against the trade on H1, or price closing THROUGH a key structure level that the setup depended on. Temporary pullbacks, noise, and short-term retracements do NOT invalidate a setup.
- MINIMUM HOLD TIME: Never request CLOSE_POSITION on a position that shows Age < 45min in the position data above unless it is approaching its SL. Give the trade time to develop.
- SCALE OUT: Only exit 50% early if price has CONFIRMED reversal (strong opposing candle + volume), not just a drawdown spike.
- NEVER close one position to open another: Each position lives and dies on its own merit. Never sacrifice a live trade to fund a new entry.

TREND-DIRECTION RULES (critical — do not violate these):
- NEVER output a BUY signal on a pair where the M15 or H1 trend shows BEARISH with ADX > 20. "Oversold" RSI or Stochastic in a downtrend means CONTINUATION, NOT reversal. Wait for trend to neutralize first.
- NEVER output a SELL signal on a pair where the M15 or H1 trend shows BULLISH with ADX > 20. "Overbought" readings in an uptrend mean continuation.
- DI LINE RULE: If plusDI < minusDI (regardless of ADX level), the market is bearish. Do NOT buy. If plusDI > minusDI, the market is bullish. Do NOT sell unless you have clear reversal structure.
- If a pair shows M15 BEARISH + H1 BEARISH simultaneously, the ONLY valid trade is SELL. Any BUY requires ALL of: 85%+ confidence, clear bullish BOS on M15, strong bullish engulfing candle, RSI divergence. If you don't have ALL of these, output NO_ACTION.
- Counter-trend trades are rare, high-skill setups. Default to trend alignment. When in doubt, skip the entry and wait for the trend to play out.
- In GBP pairs (GBPUSD, GBPJPY, EURGBP): these are highly news-sensitive. If macro context shows USD strength or GBP weakness, only take SELL setups unless you have clear bullish reversal structure.
- RSI/Stoch in a BEARISH trend: RSI below 50, Stoch below 50 = CONTINUATION signals. RSI below 30 in a downtrend is NOT a buy signal — it means the sell is accelerating.

ENTRY TIMING — WHEN TO BUY, SELL, OR WAIT (include in every signal):
- PRIME_ENTRY: M15 trend confirmed (ADX > 20 or DI sep > 10), momentum indicator in trend direction (RSI > 55 for bull or < 45 for bear), volume ABOVE_AVERAGE or SURGING, no major news in next 30 min. ENTER NOW.
- WAIT_PULLBACK: Trend confirmed but price extended from VWAP (Dev > 0.15%) or RSI > 70/< 30. Wait for a pullback to VWAP or 38.2% Fib retracement before entering. Set urgency = WAIT_FOR_PULLBACK.
- WAIT_STRUCTURE: Good macro setup but M15 hasn't confirmed with BOS yet. Wait for price to break structure and retest. Do NOT front-run structure breaks.
- AVOID: Any of these present → skip the trade entirely: (1) M15 trend CONFLICTS with H1 trend and confidence < 82%, (2) High impact news within 30 min on that currency, (3) Volume DRY (RelVol < 0.5x), (4) ADX < 12 and DI separation < 6 (market is truly ranging/directionless), (5) Session is 20:00-00:00 UTC and not a JPY/AUD pair.

For EVERY signal, set "urgency" to one of: IMMEDIATE (prime entry, enter now), WAIT_FOR_PULLBACK (good setup but overextended), MONITORING (building but not ready).
Set "tradingWindow" field = "prime" | "good" | "marginal" | "avoid" based on: session time + volume + trend strength + news proximity.
If tradingWindow = "avoid", output NO_ACTION instead of a trade signal.

CONFLUENCE REQUIREMENTS BY STRATEGY (minimum number of confirming factors):
- scalping: MINIMUM 4 confluences (trend direction, RSI>55/<45, Stoch in trend direction, VWAP on correct side, volume ≥ average). Without 4, output NO_ACTION.
- momentum: MINIMUM 3 confluences (trend confirmed by ADX, momentum indicator, OBV or volume direction).
- sniper / ict_ote / smc_demand_supply: MINIMUM 5 confluences (HTF bias + structure level + indicator + volume + candle pattern).
- session_breakout / asia_range_breakout: MINIMUM 3 confluences (range break + volume surge + candle close outside range).
- All others: MINIMUM 3 confluences. If you cannot list 3 specific confirming factors in the confluences field, do NOT signal.

HOLD TIME ALIGNMENT WITH TIMEFRAME:
- holdTime "15min"-"30min": This is a scalp. M15 trend MUST be in signal direction (no exceptions). ATR-based SL minimum 1.2× ATR. DO NOT use holdTime < 30min if M15 trend is NEUTRAL.
- holdTime "1hr": Intraday trade. Both M15 AND H1 should favour the direction. SL minimum 1.5× ATR.
- holdTime "4hr" or longer: Swing trade. H1 AND H4 must align. SL minimum 2× ATR. Higher TP targets (3:1+ R:R).
- NEVER assign holdTime "5min" — the engine operates on M15 data and 5-minute trades need M1/M5 analysis we don't have. Minimum holdTime is "30min".

CONTEXT:
- Time: ${now.toISOString()} | Session: ${session} | Day: ${day}
- Strategy: ${config.strategyMode.toUpperCase()} | Min Confidence: ${config.minConfidence}% (DO NOT submit signals below this — they will be auto-rejected)
- R:R Minimum: 1:2 required on all entries. Aim for 1:2.5–1:3 on premium setups (85%+ confidence). NEVER take a trade with R:R below 1:2
- Risk per trade: ${config.riskPerTrade}% | Trailing stops: ${config.trailingStopEnabled ? 'ON' : 'OFF'}
- Max trades allowed: ${config.maxOpenTrades} | Currently open: ${currentOpenCount}
- Position management: ${config.enablePositionManagement ? 'ACTIVE' : 'OFF'}
- Compounding: ${config.enableCompounding ? 'ON' : 'OFF'} | Compound Multiplier: ${compMult}x
${config.accountBalance > 0 && config.accountBalance < 500 ? `
SMALL ACCOUNT PROTECTION ($${config.accountBalance}):
- CRITICAL: This is a small account. CAPITAL PRESERVATION is the #1 priority.
- Use ONLY 0.01 lot size. Never suggest more than 0.01 for any trade.
- Maximum 2-3 open trades at a time - fewer trades = lower risk exposure.
- Only take A+ setups with 75%+ confidence. Skip marginal setups.
- Favor SNIPER and MOMENTUM strategies over rapid scalping - scalping spreads eat small accounts alive.
- Set tight stops (10-15 pips max for forex) but ensure R:R is at least 1:2.
- NEVER increase lot size until account is above $500. Compounding is capped.
- Close losing trades FAST - a $5 loss on a $100 account is already 5%.
- If account has dropped below starting balance, switch to ULTRA-CONSERVATIVE: only 1 trade at a time, 80%+ confidence only.
` : ''}
- IMPORTANT: Market data comes from Twelve Data. User's broker may have slightly different prices (spread, feed differences). Use ZONE-BASED entries rather than exact prices. Set SL/TP as DISTANCES from entry (e.g. 15 pips SL) so the EA can adjust to broker prices automatically.

HFT TRADING STRATEGY ARSENAL - USE ALL SIMULTANEOUSLY TO HIT THE WEEKLY GOAL:

SCALPING (M15 momentum setups, primary for quick profit accumulation):
- Trade clear M15 momentum moves that align with the current M15 trend direction — DO NOT scalp counter-trend
- Look for RSI momentum (>55 in uptrend, <45 in downtrend) + Stochastic %K crossing 50 in trend direction + VWAP on correct side
- STOP LOSS: Minimum 1.2× current ATR below entry for BUY (above for SELL). For major pairs this is typically 15-25 pips. NEVER less than 15 pips on non-JPY, NEVER less than 20 pips on JPY pairs. Tight SLs get hit by normal candle noise and lose money every time.
- TAKE PROFIT: Minimum 2× SL distance from entry (2:1 R:R), target 2.5-3:1 for A+ setups
- Entry timing: Only scalp DURING confirmed momentum candles — not at the start of consolidation. Wait for price to show clear direction first.
- VOLUME REQUIREMENT (CODE-ENFORCED): The engine will HARD BLOCK scalping signals if volume is below_average or dry (RelVol < 0.7x). Do NOT output scalping signals when volume is low — they will be rejected automatically. Only scalp when RelVol ≥ 0.7x and preferably SURGING or ABOVE_AVERAGE.
- SESSION REQUIREMENT (CODE-ENFORCED): EUR/GBP/CHF scalping is HARD BLOCKED during Asian hours (00:00-07:00 UTC). Do NOT output scalps on these pairs during Asian session — they will be rejected. Instead output momentum or sniper strategy if structure warrants it.
- Best windows: London open 07:00-09:30 UTC, NY open 13:00-15:30 UTC. DO NOT scalp during 20:00-00:00 UTC (low volume, wide spreads, fake moves)
- GOAL: 3-5 quality scalps with ≥2:1 R:R beats chasing 10 scalps with tight stops that get wiped out

MOMENTUM SURFING (15-40 pip rides - SECONDARY for bigger chunks):
- Catch breakouts from consolidation zones when ADX crosses above 25
- Ride strong directional moves confirmed by OBV trend alignment
- Enter on pullbacks to moving averages in trending markets
- Use trailing stops to let winners run - move SL to breakeven after 15 pips profit
- GOAL: Capture 2-3 big moves per day to boost daily P&L significantly

SESSION BREAKOUT STRATEGY (session-open captures):
- Watch for range breakouts at London open (07:00 UTC), NY open (13:00 UTC), Tokyo open (00:00 UTC)
- Calculate prior session high/low range, enter on confirmed break with volume
- Strongest breakouts happen in first 30 minutes of new session
- Use pre-session range as SL reference, target 1:2 or 1:3 R:R
- GOAL: Catch the big session-opening move. One good breakout can deliver $20-50+ in profit

SNIPER MODE (surgical precision, big targets):
- Only take the highest probability setups with 5+ confluences
- Wait for price at key Fibonacci levels (38.2%, 61.8%) + S/R confluence
- Candlestick reversal patterns (Engulfing, Morning/Evening Star) at key zones
- Wider targets, tighter risk - aim for 1:3+ reward-to-risk
- GOAL: Quality over quantity. One perfect sniper trade can make the whole day

CLASSIC CHART PATTERNS (pattern recognition trading):
- HEAD AND SHOULDERS: Three peaks where the middle peak (head) is highest. Neckline break = SELL. Inverse H&S (three troughs, middle lowest) neckline break = BUY. Target = distance from head to neckline projected from breakout
- DOUBLE TOP: Price hits same resistance twice and fails. Break below the valley between the two tops = SELL. Target = height of pattern projected down
- DOUBLE BOTTOM: Price hits same support twice and holds. Break above the peak between the two bottoms = BUY. Target = height of pattern projected up
- TRIPLE TOP/BOTTOM: Same as double but with three touches - even stronger signal when the pattern finally breaks
- ASCENDING TRIANGLE: Flat resistance + rising lows. Breakout above resistance = BUY. Volume should increase on breakout
- DESCENDING TRIANGLE: Flat support + lower highs. Breakdown below support = SELL. Volume confirms the break
- SYMMETRICAL TRIANGLE: Converging trendlines (lower highs + higher lows). Trade the breakout direction. Usually continues the prior trend
- BULL/BEAR FLAG: Strong move followed by a small counter-trend channel (the flag). Breakout in the original trend direction = continuation trade. Quick, high-probability setups
- RISING/FALLING WEDGE: Rising wedge = bearish reversal (breaks down). Falling wedge = bullish reversal (breaks up). Opposite of what the slope suggests
- CUP AND HANDLE: Rounded bottom (cup) followed by small pullback (handle). Break above the handle = BUY. Strong bullish continuation pattern
- CHANNEL TRADING: Price bouncing between parallel support and resistance lines. Buy at channel bottom, sell at channel top. Break out of channel = strong trend signal
- GOAL: Identify these patterns early and trade the confirmed breakout/breakdown. Always wait for the break + volume confirmation before entering. Measure the pattern height for profit targets

ICT ORDER BLOCKS (institutional footprint trading):
- Identify BULLISH ORDER BLOCKS: Last bearish candle before a strong bullish move that breaks structure. Price returns to this zone = BUY opportunity
- Identify BEARISH ORDER BLOCKS: Last bullish candle before a strong bearish move that breaks structure. Price returns to this zone = SELL opportunity
- Order blocks are most valid when they caused a Break of Structure (BOS) or Change of Character (CHOCH)
- Use H1/H4 order blocks for direction, M15/M5 order blocks for precision entries
- Best entries: Price wicks into the OB zone, shows rejection (wick/pin bar), then closes outside the zone
- GOAL: Trade with institutional money flow. Order blocks reveal where smart money placed orders

ICT FAIR VALUE GAPS (imbalance fills):
- FVG = 3-candle pattern where there is a gap between candle 1's wick and candle 3's wick (the middle candle moved so fast it left an imbalance)
- Bullish FVG: Gap between candle 1's HIGH and candle 3's LOW (candle 2 was strongly bullish). Price drops into this gap → BUY
- Bearish FVG: Gap between candle 1's LOW and candle 3's HIGH (candle 2 was strongly bearish). Price rallies into this gap → SELL
- FVGs act as magnets - price tends to fill them before continuing in the original direction
- Most reliable when FVG appears on H1/H4 timeframe and aligns with overall trend
- Enter when price touches the 50% level of the FVG (consequent encroachment)
- GOAL: Exploit market inefficiencies. FVGs on higher timeframes are institutional targets

ICT LIQUIDITY SWEEPS (stop hunt reversals):
- Liquidity pools form above equal highs and below equal lows - institutions target these to fill large orders
- SELL setup: Price spikes ABOVE a key high (sweeping buy-side liquidity), then reverses sharply with displacement
- BUY setup: Price drops BELOW a key low (sweeping sell-side liquidity), then reverses sharply with displacement
- Confirm with: displacement candle (large body, small wicks), followed by FVG creation
- Best during Kill Zone hours (London open 07:00-09:00 UTC, NY open 13:00-15:00 UTC, London close 15:00-17:00 UTC)
- Look for sweeps of Asian session highs/lows during London or NY sessions
- GOAL: Trade the reversal after smart money grabs liquidity. These produce the cleanest, highest R:R setups

ICT BREAK OF STRUCTURE (trend continuation/reversal):
- BOS (Break of Structure): Price breaks a recent swing high (bullish BOS) or swing low (bearish BOS) = trend continuation
- CHOCH (Change of Character): Price breaks structure in the OPPOSITE direction of the current trend = potential reversal
- After BOS: Wait for price to pull back to an order block or FVG within the broken structure, then enter in the BOS direction
- After CHOCH: Wait for confirmation (a second lower high or higher low) before entering the new direction
- Use M15 BOS/CHOCH for entry timing, H1/H4 for overall direction
- GOAL: Align trades with the current market structure. Never trade against structure unless CHOCH confirms reversal

ICT OPTIMAL TRADE ENTRY (precision Fibonacci entries):
- OTE zone = 61.8%-78.6% Fibonacci retracement of the most recent impulse leg
- After a BOS or liquidity sweep, measure the impulse move and enter at the OTE zone
- Combine with order blocks that sit within the OTE zone for maximum confluence
- SL goes beyond the swing point (the low of a bullish OTE or high of a bearish OTE)
- TP targets: 127.2% Fibonacci extension, 161.8% extension, or next liquidity pool
- GOAL: Enter at the optimal price within a confirmed setup. ICT's "sweet spot" for institutional entries

SMC DEMAND/SUPPLY ZONES (smart money footprint — institutional zone trading):
- DEMAND ZONE: Area where buyers overwhelmed sellers, launching price up sharply (impulsive move). When price returns to this zone = BUY opportunity. Enter at the 50–75% level inside the zone (the "sweet spot")
- SUPPLY ZONE: Area where sellers overwhelmed buyers, dropping price sharply. When price returns = SELL opportunity. Enter at the 50–75% level inside the zone
- ZONE VALIDITY: Fresh (not previously revisited), caused a BOS or CHOCH, aligns with higher timeframe (H1/H4) structure. Spent zones that have been revisited multiple times are invalid
- PRECISION ENTRY: Look for FVGs or order blocks INSIDE the zone for highest-precision entry. These are zones within zones — the ultimate confluence
- RISK MANAGEMENT: SL goes just below the demand zone (or above supply zone) — beyond where smart money would have their orders. TP targets the next opposing zone
- MULTI-TIMEFRAME: Use H4/H1 zones for directional bias, M15/M5 zones for entry timing
- Strategy label: smc_demand_supply
- GOAL: Trade FROM zones, not THROUGH them. Zones print the map of institutional order flow

ASIA RANGE BREAKOUT (session-range capture — one of the cleanest strategies in forex):
- SETUP: The Asian session (00:00–07:00 UTC) typically consolidates in a defined range. The market is building liquidity above and below this range for London to sweep
- TRACK: AsiaHigh and AsiaLow are provided for each pair in the market data above
- LONDON OPEN BREAKOUT (07:00–08:30 UTC): When price breaks convincingly ABOVE AsiaHigh = BUY. Break BELOW AsiaLow = SELL
- CONFIRMATION: (1) Candle closes outside the Asia range, (2) Volume surges on the break, (3) Price retests the broken level (old resistance becomes support, or vice versa)
- TARGETS: Minimum target = 50% of the Asia range size projected in the break direction. Full target = 100% of the Asia range size. Let runner ride to 150% with trailing stop
- STOP LOSS: 10–15 pips inside the Asia range from the break level (protect against false breakouts)
- PAIRS: All major forex pairs + XAUUSD. Most reliable on GBPUSD, EURUSD, GBPJPY
- FALSE BREAKOUT FILTER: If price breaks out but immediately reverses back inside the range within 2 candles, it's a false breakout — don't chase. Wait for clear London direction
- Strategy label: asia_range_breakout
- GOAL: Catch the London open momentum move. These setups often deliver 50–150+ pips in the first 1–2 hours

VWAP MEAN REVERSION (deviation fades — particularly powerful on indices):
- SETUP: When price deviates 2+ standard deviations from VWAP, it becomes statistically likely to revert back toward VWAP
- VWAP and VWAP deviation are visible in the market data (Dev% shown for each pair)
- BUY SIGNAL: Price is significantly BELOW VWAP (Dev% very negative, price at -2 SD or lower) + RSI oversold (<35) + volume declining on the drop = buy the reversion toward VWAP
- SELL SIGNAL: Price is significantly ABOVE VWAP (Dev% very positive, price at +2 SD or higher) + RSI overbought (>65) + volume declining on the rise = sell the reversion toward VWAP
- TARGET: VWAP itself is the primary target. Second target: the opposing SD level for extended moves
- STOP LOSS: Beyond the extreme (2.5 SD or recent wick extreme). Minimum 1:2 R:R required
- BEST MARKETS: US30, NAS100, SPX500 during NY session (13:00–20:00 UTC). Also valid on XAUUSD and currency majors in high-volume sessions
- CONFIRMATION: RSI divergence (price making new extreme but RSI declining), Stochastic crossover from extreme zone, OBV not confirming the price extreme
- Strategy label: vwap_mean_reversion
- GOAL: Exploit the rubber band effect — extreme deviations snap back. High win rate, consistent R:R

NEWS FADE / POST-NEWS REVERSAL (fading the crowd after high-impact events):
- CONCEPT: When major news hits (NFP, CPI, FOMC, Rate Decisions), retail traders chase the initial spike. Smart money fades the spike after liquidity is grabbed
- TIMING: Wait 5–15 minutes AFTER the news release for the spike to exhaust. The fade window is ONLY valid for 10–30 minutes after the event. After 30 min, the window closes
- FADE SIGNAL — all three needed: (1) RSI at extreme (>72 overbought or <28 oversold) on the spiked candle, (2) Sharp wick on the spike candle (long wick showing rejection), (3) Volume declining after the initial spike surge
- ENTRY: Enter in the OPPOSITE direction of the news spike. If news spiked price up → SELL. If news crashed price → BUY
- STOP LOSS: At or just beyond the wick extreme of the spike candle (where the spike peaked)
- TARGET: Pre-news consolidation zone (where price was trading before the news). Often a 50–100% retrace of the spike
- VALID PAIRS: The affected currency pairs. NFP affects USD pairs. CPI affects GBP (UK CPI), EUR (EU CPI), USD (US CPI)
- INVALID SETUP: If the news CONFIRMS the prior trend strongly (e.g., much better-than-expected jobs data in a USD bull market), skip the fade — the trend may continue
- Check lastHighImpactNewsAt context: if a high-impact event was flagged recently (within 30 min), actively look for fade setups on affected pairs
- Strategy label: news_fade
- GOAL: Let retail traders gift you the liquidity. The fade after exhaustion is one of the cleanest and most institutional setups available

AGGRESSIVE COMPOUND GROWTH (tie it all together):
- Combine ALL strategies above simultaneously across multiple pairs
- Scale lot sizes: base=${adjustedBaseLot} | With confidence scaling: 65-75%=${adjustedBaseLot}, 75-85%=${Math.round(adjustedBaseLot * 1.5 * 100) / 100}, 85%+=${Math.round(adjustedBaseLot * 2 * 100) / 100}
- Max lot size cap: ${effectiveMaxLot} (never exceed this)
- Pyramid into winning positions - add to trades that move 10+ pips in your favor
- Trade correlated pairs in the same direction when macro trend aligns
- Use partial closes to lock in profit (close 50% at TP1, trail the rest)
- Re-enter quickly after taking profit if conditions still hold

LIVE ENGINE RULES:
⚡ PRIORITY ORDER — ALWAYS follow this sequence each scan:
  STEP 1 — MANAGE OPEN POSITIONS FIRST (non-negotiable). For EVERY open position listed above, evaluate and output a MODIFY_POSITION or CLOSE_POSITION action using the exact ticket number shown. Apply: move to breakeven if 15–39 pips profit; trail stop only if ≥40 pips profit using volume-adjusted distance (25-pip if vol surging/above_avg, 20-pip if avg, 15-pip if below_avg/dry); close if setup invalidated. Do NOT skip this step when positions are open.
  STEP 2 — Only then consider new OPEN_TRADE signals on pairs that have NO existing open position.
  STEP 3 — Never open a new trade on a pair that already has an open position. One position per pair maximum.

1. Use ALL strategies simultaneously - scan for scalps, momentum, breakouts, sniper setups, AND ICT setups (order blocks, FVGs, liquidity sweeps, BOS/CHOCH, OTE) on EVERY scan
2. Generate MULTIPLE signals per scan when opportunities exist across different pairs WITH NO EXISTING POSITION
3. Only signal when multiple indicators CONFIRM the same direction (minimum 2-3 confluences depending on strategy)
4. Use brain knowledge to AVOID historically bad setups (wrong hours, wrong sessions, wrong direction bias)
5. Factor in current open positions - diversify across uncorrelated pairs for maximum exposure
6. If volatility percentile >80, widen stops and increase targets. If <20, use scalping with tight targets
7. Session context matters - trade pairs during their historically best sessions
8. Check support/resistance proximity - don't BUY at resistance or SELL at support
9. Manage existing positions: trail stops using staged volume-adjusted distances (25-pip at 40+ profit if vol surging, 20-pip avg, 15-pip if vol dry; tightens at 60+ and 100+ pips) — NEVER trail before 40 pips in profit. Partial close at TP1, let runners ride — use the ticket number as positionId in MODIFY_POSITION actions
10. GOAL-DRIVEN: Every decision must move toward the weekly target. Calculate estimated profit per trade and compare to daily target remaining
11. COMPOUND ON WINS: After consecutive wins, increase lot size using compound multiplier. After losses, reduce to protect gains
12. Look for RE-ENTRY opportunities after taking profit - the trend may still have legs
13. THINK IN DOLLAR TARGETS: Each scalp at ${adjustedBaseLot} lots = ~$${(adjustedBaseLot * 3).toFixed(2)}-$${(adjustedBaseLot * 8).toFixed(2)} profit. Need ~${dailyTarget > 0 ? Math.ceil(dailyTarget / (adjustedBaseLot * 5)) : 'N/A'} wins/day at avg $${(adjustedBaseLot * 5).toFixed(2)}/trade to hit daily target
14. NEWS-FIRST: Check the news headlines and economic calendar BEFORE entering. If a high-impact event is imminent on a currency, SKIP that pair or close existing positions. Trade WITH news sentiment, not against it
15. VOLUME-FIRST: Prioritize pairs with SURGING or ABOVE_AVERAGE relative volume. AVOID pairs with DRY volume. Volume confirms price action - no volume = unreliable signals
16. OPTIMAL TIMING: During London/NY overlap (13:00-16:00 UTC) be MOST aggressive. During Asian session, focus only on JPY/AUD pairs. During low-volume windows, reduce position sizes by 50% or skip entirely
17. ASIA RANGE: If AsiaHigh/AsiaLow data is present and it's London open window (07:00–08:30 UTC), PRIORITIZE asia_range_breakout setups on forex pairs. This is a prime time for large moves
18. VWAP DEVIATION: Check the VWAP Dev% for each pair. If any pair is >0.15% or <-0.15% deviation, assess for vwap_mean_reversion on indices. >0.3% deviation = strong signal
19. SMC ZONES: When you see a pair returning to a prior impulsive origin (demand/supply), use smc_demand_supply and combine with FVG or order block inside the zone for precision
20. NEWS FADE: If a high-impact news event occurred recently (within 30 minutes), check for exhaustion signals (extreme RSI + declining volume + wick rejection) on affected pairs for news_fade setups
${config.propFirmMode ? `
⚠️ PROP FIRM CHALLENGE MODE ACTIVE — STRICT RULES APPLY:
- MAXIMUM RISK: 0.5% of account balance per trade. Lot sizes must reflect this
- MAXIMUM 2 open trades at any time
- MINIMUM 78% confidence required for ANY entry — skip everything below this threshold
- NO SCALPING — every trade must have minimum 1:2 Risk:Reward ratio. No exceptions
- PREFERRED STRATEGIES: prop_firm_sniper, sniper, ict_order_blocks, smc_demand_supply only
- ALL SIGNALS must use strategy label: prop_firm_sniper
- DAILY DRAWDOWN LIMIT: ${config.propFirmDailyDrawdownLimit}% of account. Today's P&L is $${tracker.dailyPnL[new Date().toISOString().substring(0, 10)] || 0}. If you are at or near this limit, output NO_ACTION for all pairs
- VIOLATION = FAILING THE CHALLENGE. Be surgical, patient, and precise. Quality beats quantity every time in a prop firm challenge
` : ''}
Respond ONLY with valid JSON. Generate MULTIPLE decisions when opportunities exist - don't hold back:
{
  "decisions": [
    {
      "action": "OPEN_TRADE" | "MODIFY_POSITION" | "CLOSE_POSITION" | "NO_ACTION",
      "strategy": "scalping" | "momentum" | "session_breakout" | "sniper" | "compound" | "chart_pattern" | "ict_order_blocks" | "ict_fvg" | "ict_liquidity_sweep" | "ict_bos" | "ict_ote" | "smc_demand_supply" | "asia_range_breakout" | "vwap_mean_reversion" | "news_fade" | "prop_firm_sniper",
      "symbol": "EURUSD",
      "direction": "BUY" | "SELL",
      "confidence": 85,
      "reason": "Detailed multi-indicator reasoning",
      "confluences": ["indicator1 says X", "indicator2 confirms Y", "brain says Z"],
      "entryPrice": number,
      "stopLoss": number,
      "takeProfit": number,
      "takeProfit2": number,
      "lotSize": 0.01-0.05,
      "holdTime": "30min|1hr|2hr|4hr|8hr",
      "positionId": "for modify/close actions",
      "modifyAction": "trail_stop|move_sl|partial_close|full_close",
      "newStopLoss": number,
      "urgency": "IMMEDIATE" | "WAIT_FOR_PULLBACK" | "MONITORING",
      "tradingWindow": "prime|good|marginal|avoid",
      "entryTiming": "PRIME_ENTRY|WAIT_PULLBACK|WAIT_STRUCTURE|AVOID",
      "pyramidOf": "signal ID if adding to existing winning trade"
    }
  ],
  "marketOverview": "Current market read across all pairs",
  "hotPairs": ["pairs showing strongest signals right now"],
  "dangerZones": ["pairs or setups to avoid and why"],
  "nextScanFocus": "What to focus on in the next scan cycle",
  "engineConfidence": 0-100,
  "activeStrategies": ["which strategies found setups this scan"],
  "newsImpact": "how current news is affecting trading decisions",
  "volumeAssessment": "overall market volume quality and which pairs have best liquidity",
  "tradingWindowQuality": "excellent|good|fair|poor - based on session time + volume + news"
}`;

    const systemPrompt = 'You are VEDD SS AI - a live autonomous HIGH-FREQUENCY trading engine built for RAPID ACCOUNT GROWTH. Use every strategy in your arsenal simultaneously: scalping, momentum surfing, session breakouts, sniper setups, aggressive compounding, CLASSIC CHART PATTERNS (head and shoulders, double tops/bottoms, triangles, flags, wedges, cup and handle), AND ICT strategies (order blocks, fair value gaps, liquidity sweeps, break of structure, optimal trade entry). Always scan for chart patterns, order blocks, FVGs, liquidity grabs, and market structure shifts alongside traditional indicators. Generate MULTIPLE trade signals per scan when opportunities exist across different pairs and strategies. Be aggressive but intelligent - maximize trade frequency while maintaining edge. CRITICAL: Always factor in NEWS events and VOLUME levels before entering trades. Avoid pairs with upcoming high-impact news. Prioritize pairs with strong volume. Trade during optimal market hours for best fills. Respond with valid JSON only.\n\nCOMMUNICATION STYLE - SUPREME MATHEMATICS (Gods and Earths framework):\nWhen writing the "reason", "marketOverview", "nextScanFocus", "newsImpact", "volumeAssessment", and "tradingWindowQuality" fields, weave in Supreme Mathematics / Gods and Earths language naturally and authentically. Map the framework to trading as follows:\n- Knowledge (1) = Reading the chart, understanding price action and market structure\n- Wisdom (2) = Applying strategy with discipline — the correct action taken from what you know\n- Understanding (3) = The clear result — seeing the setup fully, knowing exactly what price is doing\n- Culture/Freedom (4) = Your trading rhythm and routine — freedom through mastery of the cipher\n- Power/Refinement (5) = Risk management, sizing, refining the edge — power through control\n- Equality (6) = Balance of the market — what the market gives, it can take; R:R must be equal or better\n- God (7) = Full control of the trade — mastering the setup from entry to exit\n- Build/Destroy (8) = Building the account, destroying weak setups and bad habits before they cost money\n- Born (9) = A trade closed — knowledge born into profit, a lesson completed\n- Cipher (0/10) = The full market cycle — complete understanding of all moving parts together\n\nUse terms like: "Peace", "The science of it is...", "Word is bond", "Build on that", "That\'s the mathematics", "Stay in the cipher", "Knowledge yourself", "dropping science", "the God cipher", "righteously"\nKeep it natural — not every sentence. Weave it in where it fits. ALL prices, lot sizes, SL/TP numbers stay precise and clean. The lingo lives in the explanatory text only.';

    const { runMultiModelAnalysis, DEFAULT_ROUTING_CONFIG } = await import('./ai-model-service');
    const modelConfig = await storage.getAiModelConfig(userId);

    let decisions: any;
    let usedMultiModel = false;

    const ensembleIds = Array.isArray(modelConfig?.ensembleModelIds) ? modelConfig.ensembleModelIds as string[] : [];
    const hasValidMultiModelConfig = modelConfig &&
      modelConfig.isActive &&
      modelConfig.routingMode !== 'single' &&
      (modelConfig.routingMode !== 'ensemble' || ensembleIds.length >= 2);

    if (hasValidMultiModelConfig) {
      try {
        const routingConfig = {
          mode: modelConfig.routingMode as any,
          primaryModelId: modelConfig.primaryModelId || 'openai-gpt4o',
          ensembleModelIds: ensembleIds,
          strategyAssignments: (modelConfig.strategyAssignments as Record<string, string>) || {},
          fallbackOrder: Array.isArray(modelConfig.fallbackOrder) ? modelConfig.fallbackOrder as string[] : [],
          ensembleMinAgreement: modelConfig.ensembleMinAgreement || 60,
          enabled: modelConfig.isActive,
        };

        addActivity(userId, { type: 'info', message: `Multi-Model: Using ${routingConfig.mode} mode with ${routingConfig.mode === 'ensemble' ? routingConfig.ensembleModelIds.length + ' models' : routingConfig.primaryModelId}` });

        const ensembleResult = await runMultiModelAnalysis(userId, systemPrompt, prompt, routingConfig, openai);

        if (ensembleResult.consensusDecisions.length > 0 || ensembleResult.decisions.length > 0) {
          const mc = ensembleResult.commentary;
          decisions = {
            decisions: ensembleResult.consensusDecisions.length > 0 ? ensembleResult.consensusDecisions : ensembleResult.decisions,
            engineConfidence: mc?.engineConfidence || ensembleResult.agreementPercent,
            marketOverview: mc?.marketOverview || `Multi-model ${routingConfig.mode} analysis — ${ensembleResult.agreementPercent}% agreement`,
            hotPairs: mc?.hotPairs,
            dangerZones: mc?.dangerZones,
            nextScanFocus: mc?.nextScanFocus,
            newsImpact: mc?.newsImpact,
            volumeAssessment: mc?.volumeAssessment,
            tradingWindowQuality: mc?.tradingWindowQuality,
            activeStrategies: [...new Set(ensembleResult.decisions.map((d: any) => d.strategy).filter(Boolean))],
          };

          if (routingConfig.mode === 'ensemble' && Object.keys(ensembleResult.modelVotes).length > 0) {
            addActivity(userId, {
              type: 'info',
              message: `Ensemble: ${ensembleResult.agreementPercent}% agreement | ${ensembleResult.consensusDecisions.length} consensus trades from ${Object.keys(ensembleResult.modelVotes).length} model votes`,
            });
          }
          usedMultiModel = true;
        }
      } catch (err: any) {
        addActivity(userId, { type: 'error', message: `Multi-model error: ${err.message}. Falling back to primary model.` });
      }
    }

    if (!usedMultiModel) {
      // ── Response cache check: skip API call if market hasn't moved ─────
      const cacheKey = Object.keys(marketAnalysis).sort().join('|');
      const cached = state.aiResponseCache[cacheKey];
      const pairPrices = Object.values(marketAnalysis).map((d: any) => d.currentPrice || 0);
      const avgPrice = pairPrices.length > 0 ? pairPrices.reduce((a, b) => a + b, 0) / pairPrices.length : 0;
      const cachedPrice = cached?.price ?? 0;
      const pipMove = cachedPrice > 0 ? Math.abs(avgPrice - cachedPrice) / cachedPrice * 10000 : 999;
      const cacheAge = cached ? (Date.now() - cached.ts) : 999999;

      if (cached && cacheAge < 60000 && pipMove < 3) {
        decisions = cached.response;
        addActivity(userId, { type: 'info', message: `💾 Cache hit: reusing last AI response (${Math.round(cacheAge / 1000)}s old, ${pipMove.toFixed(1)}p move) — API call saved` });
      } else {
        const modelToUse = model;
        const supportsJson = modelToUse.startsWith('gpt') || modelToUse.startsWith('gemini') || modelToUse.startsWith('llama') || modelToUse.startsWith('mistral') || modelToUse.startsWith('claude');

        const response = await openai.chat.completions.create({
          model: modelToUse,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          ...(supportsJson ? { response_format: { type: 'json_object' } } : {}),
          max_tokens: 4000,
          temperature: 0.3,
        });

        const content = response.choices[0]?.message?.content || '';
        try {
          decisions = JSON.parse(content);
        } catch {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) decisions = JSON.parse(jsonMatch[0]);
          else {
            addActivity(userId, { type: 'error', message: 'AI returned invalid response' });
            return;
          }
        }

        // Store in cache
        state.aiResponseCache[cacheKey] = { ts: Date.now(), price: avgPrice, response: decisions };
      }
    }

    const windowQuality = decisions.tradingWindowQuality || 'N/A';
    addActivity(userId, {
      type: 'ai_decision',
      message: `AI Analysis Complete | Confidence: ${decisions.engineConfidence || 'N/A'}% | Window: ${windowQuality} | ${decisions.decisions?.length || 0} decisions`,
      details: {
        marketOverview: decisions.marketOverview,
        hotPairs: decisions.hotPairs,
        dangerZones: decisions.dangerZones,
        nextScanFocus: decisions.nextScanFocus,
        engineConfidence: decisions.engineConfidence,
        newsImpact: decisions.newsImpact,
        volumeAssessment: decisions.volumeAssessment,
        tradingWindowQuality: windowQuality,
      },
    });

    state.lastSignalAt = new Date().toISOString();

    if (decisions.decisions && decisions.decisions.length > 0) {
      for (const decision of decisions.decisions) {
        await processDecision(userId, decision, newsContext);
      }
    }
  } catch (err: any) {
    const errMsg = err.message || '';
    const errStatus = err.status || err.statusCode || 0;
    const isAuthError = errStatus === 401 || errMsg.includes('Incorrect API key') || errMsg.includes('invalid_api_key') || errMsg.includes('authentication_error') || errMsg.includes('401');
    if (isAuthError && openai?.provider && openai.provider !== 'platform') {
      // Auto-mark this provider's key as invalid so the next cycle switches to a working one
      try {
        const { db } = await import('../db');
        const { userApiKeys: uak } = await import('../../shared/schema');
        const { and, eq } = await import('drizzle-orm');
        await db.update(uak)
          .set({ isValid: false, lastValidated: new Date() })
          .where(and(eq(uak.userId, userId), eq(uak.provider, openai.provider)));
      } catch { /* ignore DB error */ }
      addActivity(userId, { type: 'error', message: `${openai.provider} API key is invalid or expired — auto-disabled. Engine will switch to your next active provider on next scan.` });
    } else {
      addActivity(userId, { type: 'error', message: `AI analysis error: ${errMsg}` });
    }
  }
}

async function processDecision(userId: number, decision: any, newsCtx?: any): Promise<void> {
  const state = engineStates[userId];
  if (!state) return;
  const config = state.config;

  const parseNum = (v: any): number | undefined => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const n = parseFloat(v.replace(/[^0-9.\-]/g, '')); return isNaN(n) ? undefined : n; }
    return undefined;
  };

  const confidence = typeof decision.confidence === 'number' ? decision.confidence : parseFloat(decision.confidence) || 0;

  if (decision.action === 'NO_ACTION') {
    addActivity(userId, {
      type: 'info',
      symbol: decision.symbol,
      message: `No action: ${decision.reason || 'Conditions not met'}`,
      confidence,
    });
    return;
  }

  if (decision.action === 'OPEN_TRADE') {
    // ── Daily Trade Cap (maxDailyTrades) ─────────────────────────────────
    // Reset counter at UTC midnight, then enforce the cap if set (0 = unlimited).
    {
      const todayUTC = new Date().toISOString().slice(0, 10);
      if (state.tradesOpenedTodayDate !== todayUTC) {
        state.tradesOpenedToday = 0;
        state.tradesOpenedTodayDate = todayUTC;
      }
      const cap = config.maxDailyTrades ?? 0;
      if (cap > 0 && state.tradesOpenedToday >= cap) {
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `🚫 DAILY TRADE CAP: ${decision.symbol} ${decision.direction} blocked — already opened ${state.tradesOpenedToday}/${cap} trades today. Cap resets at UTC midnight.`,
        });
        state.signalsGenerated++;
        return;
      }
    }
    // ── Direction Filter Gate ─────────────────────────────────────────────
    // Per-pair overrides take priority over the global directionFilter.
    // e.g. pairDirectionOverrides: { XAUUSD: 'buy_only' } blocks gold sells
    // even when the global filter is 'both'.
    const _signalDirRaw = (decision.direction || '').toUpperCase();
    const _pairFilter = config.pairDirectionOverrides?.[decision.symbol] ?? config.directionFilter ?? 'both';
    if (_pairFilter === 'buy_only' && _signalDirRaw === 'SELL') {
      const isOverride = !!config.pairDirectionOverrides?.[decision.symbol];
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `🚫 DIRECTION FILTER: SELL on ${decision.symbol} blocked — ${isOverride ? `${decision.symbol} is set to BUY ONLY (per-pair override)` : 'engine is set to BUY ONLY'}. Change in engine settings to allow sells.`,
      });
      state.signalsGenerated++;
      return;
    }
    if (_pairFilter === 'sell_only' && _signalDirRaw === 'BUY') {
      const isOverride = !!config.pairDirectionOverrides?.[decision.symbol];
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `🚫 DIRECTION FILTER: BUY on ${decision.symbol} blocked — ${isOverride ? `${decision.symbol} is set to SELL ONLY (per-pair override)` : 'engine is set to SELL ONLY'}. Change in engine settings to allow buys.`,
      });
      state.signalsGenerated++;
      return;
    }

    // ── Conflicting Open Position Gate ────────────────────────────────────
    // If there is already an open trade on this pair in the OPPOSITE direction,
    // block the new signal. Running a BUY and SELL on the same pair simultaneously
    // is a net-zero hedge that pays double spread — never profitable.
    // To reverse a position, the open trade must be closed first.
    if (_signalDirRaw === 'BUY' || _signalDirRaw === 'SELL') {
      const _livePositions: any[] = (global as any).mt5OpenPositions?.[userId]?.positions || [];
      const _existingOnPair = _livePositions.find(
        (p: any) => (p.symbol || '').toUpperCase().replace('/', '') === decision.symbol?.toUpperCase().replace('/', '')
      );
      if (_existingOnPair) {
        const _existingDir = (_existingOnPair.direction || _existingOnPair.type || '').toUpperCase();
        const _isConflict = (_existingDir === 'BUY' && _signalDirRaw === 'SELL') ||
                            (_existingDir === 'SELL' && _signalDirRaw === 'BUY');
        if (_isConflict) {
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `🔀 OPPOSITE-DIRECTION BLOCK: ${_signalDirRaw} ${decision.symbol} rejected — already have an open ${_existingDir} position on this pair (ticket ${_existingOnPair.ticket ?? _existingOnPair.id ?? '?'}). Close or manage the existing trade before reversing direction.`,
          });
          state.signalsGenerated++;
          return;
        }
        // Same-direction add — only allow if pyramiding is explicitly on
        if (_existingDir === _signalDirRaw && !config.enablePyramiding) {
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `📦 SAME-DIRECTION BLOCK: ${_signalDirRaw} ${decision.symbol} rejected — already have an open ${_existingDir} position on this pair. Enable pyramiding in settings to stack positions.`,
          });
          state.signalsGenerated++;
          return;
        }
      }
    }

    // ── USD Correlation Guard ────────────────────────────────────────────
    // Running multiple USD-base pairs in the same direction simultaneously is
    // concentrated correlated risk: one USD news spike hits ALL open positions.
    // Rule: allow max 2 correlated USD positions open at once, and only if they
    // do NOT all have the same USD direction (e.g. all SELLING USD = all buying EUR/GBP/AUD).
    {
      const newSym = (decision.symbol || '').toUpperCase().replace('/', '');
      const newIsUSD = newSym.includes('USD');
      if (newIsUSD) {
        const _livePositionsForCorr: any[] = (global as any).mt5OpenPositions?.[userId]?.positions || [];
        const openUSDPositions = _livePositionsForCorr.filter((p: any) => {
          const pSym = (p.symbol || '').toUpperCase().replace('/', '');
          return pSym.includes('USD');
        });
        if (openUSDPositions.length >= 2) {
          // Check if all open USD positions expose same USD direction
          // e.g. BUY EURUSD = sell USD; SELL EURUSD = buy USD
          // e.g. BUY USDCHF = buy USD; SELL USDCHF = sell USD
          const usdDirOf = (sym: string, tradeDir: string): 'BUY_USD' | 'SELL_USD' => {
            const s = sym.toUpperCase().replace('/', '');
            const usdIsBase = s.startsWith('USD'); // USDCHF, USDJPY → USD is base
            if (usdIsBase) return tradeDir === 'BUY' ? 'BUY_USD' : 'SELL_USD';
            return tradeDir === 'BUY' ? 'SELL_USD' : 'BUY_USD'; // EURUSD BUY = selling USD
          };
          const newUSDDir = usdDirOf(newSym, _signalDirRaw);
          const existingUSDDirs = openUSDPositions.map((p: any) =>
            usdDirOf((p.symbol || '').toUpperCase().replace('/', ''), (p.direction || p.type || '').toUpperCase())
          );
          const allSameAsNew = existingUSDDirs.every((d: string) => d === newUSDDir);
          if (allSameAsNew && openUSDPositions.length >= 2) {
            addActivity(userId, {
              type: 'info',
              symbol: decision.symbol,
              message: `⚡ USD CORRELATION BLOCK: ${_signalDirRaw} ${decision.symbol} rejected — already ${openUSDPositions.length} USD positions all in ${newUSDDir} direction. Correlated exposure cap reached (max 2 same-direction USD trades). Close an existing position first.`,
            });
            state.signalsGenerated++;
            return;
          }
        }
      }
    }

    // ── Drawdown Shield Enforcement ───────────────────────────────────
    if (state.drawdownShieldActive) {
      const shieldStrategies = ['prop_firm_sniper', 'ict_ote', 'ict_order_blocks', 'sniper'];
      const decisionStrategy = (decision.strategy || '').toLowerCase();
      if (!shieldStrategies.includes(decisionStrategy)) {
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `🛡️ SHIELD BLOCK: ${decisionStrategy || 'unknown'} strategy rejected during drawdown protection. Only sniper/ICT allowed.`,
        });
        return;
      }
      if (confidence < 80) {
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `🛡️ SHIELD BLOCK: ${confidence}% confidence too low during shield mode (need 80%+). Skipping.`,
        });
        return;
      }
    }

    // ── HTF Conflict Pre-Filter ────────────────────────────────────────
    const htfBias = state.htfBiasCache?.[decision.symbol];
    let adjustedConfidence = confidence;
    if (htfBias && htfBias.trend !== 'NEUTRAL' && decision.direction) {
      const signalDir = decision.direction.toUpperCase();
      const htfTFLabel = ((config as any).primaryTimeframe || 'M15') === 'H1' ? 'H4' : 'H1';
      const htfAligns = (signalDir === 'BUY' && htfBias.trend === 'BULLISH') || (signalDir === 'SELL' && htfBias.trend === 'BEARISH');
      if (htfAligns) {
        adjustedConfidence = Math.min(100, confidence + 5);
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `📊 HTF bias: ${htfTFLabel} ${htfBias.trend} — aligns with ${signalDir} (+5% confidence → ${adjustedConfidence}%)`,
        });
      } else {
        // Raised from 85% to 90% — counter-trend trades against HTF bias are institutional plays
        // that require extremely high LTF confluence. LLM confidence at 85% still loses ~30-35% of
        // the time against a clear HTF trend. 90% gives much better expected value.
        if (confidence < 90) {
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `📊 HTF CONFLICT BLOCK: ${signalDir} on ${decision.symbol} vs ${htfTFLabel} ${htfBias.trend} — ${confidence}% < 90% required for counter-trend. Trade blocked.`,
          });
          state.signalsGenerated++;
          return;
        }
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `📊 HTF CONFLICT: ${signalDir} on ${decision.symbol} vs ${htfTFLabel} ${htfBias.trend} — ${confidence}% ≥ 90% threshold cleared. Allowing high-confidence counter-trend.`,
        });
      }
    }

    // ── M15 Trend Conflict Gate ──────────────────────────────────────────
    // Uses DI lines from the snapshot so mild GBP/JPY downtrends at ADX 15–22
    // are caught, not just strong ADX > 25 trends.
    // STRONG conflict (ADX > 20 or DI sep > 12): HARD BLOCK unless 82%+ confidence
    // MILD conflict (ADX 12-20 or DI sep 8-12): 12% confidence penalty
    const m15Snap = state.marketSnapshot?.[decision.symbol];
    if (m15Snap && decision.direction) {
      const signalDir = decision.direction.toUpperCase();
      const m15ADX = (m15Snap as any).adx || 0;
      const m15PlusDI = (m15Snap as any).plusDI || 0;
      const m15MinusDI = (m15Snap as any).minusDI || 0;
      const diSep = Math.abs(m15PlusDI - m15MinusDI);

      // Derive effective trend from DI lines — same logic as the scan loop
      let effectiveTrend = (m15Snap as any).trend ?? 'NEUTRAL';
      if (effectiveTrend === 'NEUTRAL' && m15ADX > 12 && diSep > 8) {
        effectiveTrend = m15PlusDI > m15MinusDI ? 'BULLISH' : 'BEARISH';
      }

      const trendDetected = (m15ADX > 12 || diSep > 8) && effectiveTrend !== 'NEUTRAL';
      const m15Conflicts = (signalDir === 'BUY' && effectiveTrend === 'BEARISH') || (signalDir === 'SELL' && effectiveTrend === 'BULLISH');

      if (trendDetected && m15Conflicts) {
        const isStrongTrend = m15ADX > 20 || diSep > 12;

        if (isStrongTrend) {
          // HARD BLOCK for strong counter-trend entries — these lose money consistently
          // Raised from 82% → 88%: M15 strong-trend counter-entries are almost always losers
          // even at 82% AI confidence. Require near-certainty for these trades.
          if (adjustedConfidence < 88) {
            addActivity(userId, {
              type: 'info',
              symbol: decision.symbol,
              message: `🚫 M15 TREND BLOCK: ${signalDir} vs strong M15 ${effectiveTrend} (ADX ${m15ADX.toFixed(1)}, +DI ${m15PlusDI.toFixed(1)} / -DI ${m15MinusDI.toFixed(1)}, diSep ${diSep.toFixed(1)}) — ${adjustedConfidence}% < 88% required for counter-trend. BLOCKED.`,
            });
            state.signalsGenerated++;
            return;
          }
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `⚠️ M15 STRONG CONFLICT: ${signalDir} vs M15 ${effectiveTrend} — ${adjustedConfidence}% ≥ 88% cleared. Allowing high-confidence counter-trend (use caution).`,
          });
        } else {
          // Mild conflict: 12% penalty + warning
          const penalty = 12;
          adjustedConfidence = Math.max(0, adjustedConfidence - penalty);
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `⚠️ M15 TREND CONFLICT (mild): ${signalDir} vs M15 ${effectiveTrend} (ADX ${m15ADX.toFixed(1)}, diSep ${diSep.toFixed(1)}) — confidence penalised ${penalty}% → ${adjustedConfidence}%`,
          });
        }
      }
    }

    // ── Composite Edge Signal (Markov × Polymarket) ───────────────────
    // Fuses Markov chain price-action probability with Polymarket crowd-
    // wisdom sentiment into one calibrated adjustment.
    // • Crypto symbols: Markov + Polymarket (amplified when both agree)
    // • Forex/indices: Markov only
    // • Non-fatal: any error degrades gracefully — signal still executes
    if (decision.direction && (decision.direction === 'BUY' || decision.direction === 'SELL')) {
      try {
        const { getCompositeEdgeSignal } = await import('./composite-signal');
        const symSnap   = state.marketSnapshot?.[decision.symbol] ?? {};
        const lastCC    = (symSnap as any).lastConfirmedCandle ?? null;
        const candles   = lastCC ? [lastCC] : [];

        const composite = await getCompositeEdgeSignal(
          decision.symbol,
          decision.direction as 'BUY' | 'SELL',
          candles,
        );

        const adj = composite.confidenceAdjustment;
        if (adj !== 0) {
          adjustedConfidence = Math.min(100, Math.max(0, adjustedConfidence + adj));
        }
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: composite.reason + (adj !== 0 ? ` → confidence now ${adjustedConfidence}%` : ''),
        });

        // Attach full composite data to decision for display / logging
        (decision as any)._composite = {
          adjustment:         adj,
          alignment:          composite.alignment,
          compositeEdgeScore: composite.compositeEdgeScore,
          markov:             composite.markov,
          polymarket:         composite.polymarket,
          usedPolymarket:     composite.usedPolymarket,
        };
      } catch { /* non-fatal — composite errors must never block execution */ }
    }

    // ── T003: Post-GPT brain enforcement (direction/news/cooldown) ────
    const currentATR = (state as any)._lastATR?.[decision.symbol] || 0;
    const postEnforcement = applyBrainEnforcement(userId, decision.symbol, decision.direction, currentATR, newsCtx);
    if (!postEnforcement.allowed) {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: postEnforcement.reason,
      });
      return;
    }
    // Apply brain-tuned lot multiplier and strategy override
    if (postEnforcement.forcedStrategy && !decision.strategy) {
      decision.strategy = postEnforcement.forcedStrategy;
    }
    (decision as any)._brainLotMultiplier = postEnforcement.adjustedLotMultiplier;
    (decision as any)._brainTrailPips = postEnforcement.recommendedTrailPips;

    // Hard floor: never execute below 78% regardless of user config
    // Below 78%, the statistical edge is not reliable enough to overcome spread + slippage
    // Raised from 72% → 78% after analysis showed 72% signals had near-coin-flip real accuracy
    const HARD_CONFIDENCE_FLOOR = 78;
    const effectiveMinConf2 = Math.max(config.minConfidence, HARD_CONFIDENCE_FLOOR);
    if (adjustedConfidence < effectiveMinConf2) {
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence: adjustedConfidence,
        message: `Signal skipped (${adjustedConfidence}% < ${effectiveMinConf2}% min [hard floor: ${HARD_CONFIDENCE_FLOOR}%]): ${decision.reason}`,
      });
      state.signalsGenerated++;
      return;
    }

    const isSmallAcct = config.accountBalance > 0 && config.accountBalance < 500;
    const effectiveMaxTrades = isSmallAcct ? Math.min(config.maxOpenTrades, 3) : config.maxOpenTrades;
    const effectiveMinConf = isSmallAcct ? Math.max(config.minConfidence, 75) : config.minConfidence;

    if (isSmallAcct && adjustedConfidence < effectiveMinConf) {
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence: adjustedConfidence,
        message: `Small account protection: skipped (${adjustedConfidence}% < ${effectiveMinConf}% required for accounts under $500)`,
      });
      state.signalsGenerated++;
      return;
    }

    if (state.openPositionCount >= effectiveMaxTrades) {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `Trade skipped - max open trades reached (${state.openPositionCount}/${effectiveMaxTrades}${isSmallAcct ? ' small-account cap' : ''})`,
      });
      return;
    }

    const existingSignals = mt5AccountQueues[userId]
      ? Object.values(mt5AccountQueues[userId]).flat()
      : [];
    const cooldownMs = Math.max(config.scanIntervalMs * 3, 3 * 60 * 1000);
    const hasRecentForPair = existingSignals.some(
      s => s.symbol === decision.symbol && (Date.now() - new Date(s.timestamp).getTime()) < cooldownMs
    );
    if (hasRecentForPair) {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `Trade skipped - ${decision.symbol} already has a recent signal (cooldown ${Math.round(cooldownMs / 60000)}min)`,
      });
      return;
    }

    state.signalsGenerated++;

    addActivity(userId, {
      type: 'signal',
      symbol: decision.symbol,
      direction: decision.direction,
      confidence: adjustedConfidence,
      message: `LIVE SIGNAL [${(decision.strategy || 'auto').toUpperCase()}]: ${decision.direction} ${decision.symbol} @ ${adjustedConfidence}% confidence${adjustedConfidence !== confidence ? ` (HTF-adjusted from ${confidence}%)` : ''}`,
      details: {
        strategy: decision.strategy,
        confluences: decision.confluences,
        reason: decision.reason,
        urgency: decision.urgency,
        holdTime: decision.holdTime,
        takeProfit2: decision.takeProfit2,
        pyramidOf: decision.pyramidOf,
      },
    });

    if (decision.urgency === 'WAIT_FOR_PULLBACK' || decision.urgency === 'MONITORING') {
      addActivity(userId, { type: 'info', symbol: decision.symbol, message: `Watching for entry - urgency: ${decision.urgency}` });
      return;
    }

    // ── Trading window gate: block "avoid" window signals ─────────────────────
    const tradingWindow = (decision.tradingWindow || '').toLowerCase();
    if (tradingWindow === 'avoid') {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `🕐 TIMING BLOCK: ${decision.symbol} ${decision.direction} — AI flagged tradingWindow=avoid (poor session/volume/news conditions). Signal skipped.`,
      });
      return;
    }

    // ── Hold time gate: reject < 30-min scalps (engine runs on M15 data) ──────
    const holdTimeRaw = (decision.holdTime || '').toLowerCase();
    const isUltraShortScalp = holdTimeRaw === '5min' || holdTimeRaw === '5m' || holdTimeRaw === '10min';
    if (isUltraShortScalp) {
      // Silently upgrade to 30min rather than hard-reject
      decision.holdTime = '30min';
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `⏱ HOLD TIME: ${decision.symbol} holdTime upgraded from ${holdTimeRaw} → 30min (M15 engine minimum). SL widened to give trade room.`,
      });
    }

    // ── Confluence count gate ─────────────────────────────────────────────────
    const confluences: string[] = Array.isArray(decision.confluences) ? decision.confluences : [];
    const strategy = (decision.strategy || '').toLowerCase();
    const minConf = (strategy === 'scalping') ? 4
      : (strategy === 'sniper' || strategy === 'ict_ote' || strategy === 'smc_demand_supply' || strategy === 'prop_firm_sniper') ? 5
      : 3;
    if (confluences.length < minConf) {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `⚠️ CONFLUENCE GATE: ${decision.symbol} ${strategy} has ${confluences.length}/${minConf} required confluences — signal rejected. Need more confirming factors.`,
      });
      state.signalsGenerated++;
      return;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // LOSS-PREVENTION GATES — added after analysis of yesterday's losing trades
    // These are CODE-LEVEL blocks. The AI prompt advisory was insufficient alone.
    // ═══════════════════════════════════════════════════════════════════════════

    const snap = state.marketSnapshot?.[decision.symbol];
    const signalDirection = (decision.direction || '').toUpperCase();

    // ── GATE 1: Hard news blackout (< 15 min before high-impact event) ───────
    // High-impact events (NFP, CPI, FOMC, rate decisions) spike price violently,
    // hitting even ATR-expanded SLs. No edge exists in the last 15 minutes.
    // The AI prompt says "avoid 30 min before" but this was advisory only.
    // Now code-enforced: no new entries within 15 min of high-impact news.
    if (newsCtx?.highImpactSoon === true) {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `📰 NEWS BLACKOUT: ${decision.symbol} ${signalDirection} BLOCKED — high-impact economic event imminent. No new entries until event clears. Protects open trades from spike stop-outs.`,
      });
      state.signalsGenerated++;
      return;
    }

    // ── GATE 2: Post-loss same-direction lock (45–90 min) ────────────────────
    // After a loss on this pair+direction, same direction is locked.
    // Yesterday: GBPUSD BUY lost → engine fired another GBPUSD BUY 3 min later.
    // Same market conditions = same result. Need a structural reset first.
    // Override ONLY if: 85%+ confidence AND volume is SURGING (≥2x average).
    if (!state.pairDirectionLock) state.pairDirectionLock = {};
    const dirLock = state.pairDirectionLock[decision.symbol];
    if (dirLock && dirLock.direction === signalDirection && Date.now() < dirLock.lockedUntil) {
      const minsRemaining = Math.ceil((dirLock.lockedUntil - Date.now()) / 60000);
      const volTrend = snap?.volumeTrend || 'unknown';
      const relVol = snap?.relativeVolume || 0;
      const canOverride = adjustedConfidence >= 85 && (volTrend === 'surging' || relVol >= 2.0);
      if (!canOverride) {
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `🔒 DIRECTION LOCK: ${decision.symbol} ${signalDirection} locked for ${minsRemaining} more min (${dirLock.lossCount} loss(es) in this direction). Need 85%+ conf + surging volume to override (have ${adjustedConfidence}% + ${volTrend} vol).`,
        });
        state.signalsGenerated++;
        return;
      }
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `🔓 DIRECTION LOCK OVERRIDE: ${decision.symbol} ${signalDirection} — ${adjustedConfidence}% conf + ${volTrend} volume clears the lock. High-conviction entry allowed.`,
      });
    }

    // ── GATE 3: Volume block ──────────────────────────────────────────────────
    // Scalping on below_average/dry volume = wide spreads, fake-outs, poor fills.
    // Extended: all strategies blocked at extreme-dry volume (< 0.3x avg).
    // Scalping additionally blocked at below_average (< 0.7x avg).
    {
      const volTrend = snap?.volumeTrend || 'unknown';
      const relVol = snap?.relativeVolume || 1;
      const isScalp = strategy === 'scalping';
      const extremeDry = volTrend === 'dry' || relVol < 0.3;
      const belowAvg = volTrend === 'below_average' || relVol < 0.7;
      if (extremeDry) {
        // Block ALL strategies — extreme dry volume means market is dead/pre-news
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `📉 EXTREME DRY VOLUME BLOCK [${strategy}]: ${decision.symbol} rejected — volume is ${volTrend} (${relVol.toFixed(2)}x avg). Dead market conditions apply to all strategies. No valid liquidity for any entry.`,
        });
        state.signalsGenerated++;
        return;
      }
      if (isScalp && belowAvg) {
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `📉 SCALP VOLUME BLOCK: ${decision.symbol} scalp rejected — volume is ${volTrend} (${relVol.toFixed(2)}x avg). Scalping requires ≥ 0.7x average volume. Wait for volume or switch to sniper/swing strategy.`,
        });
        state.signalsGenerated++;
        return;
      }
    }

    // ── GATE 4: Session block for EUR/GBP/CHF pairs in Asian session ─────────
    // EUR/GBP pairs have thin liquidity 00:00–07:00 UTC (Asian hours).
    // Extended: all strategies blocked for these pairs during Asian session when
    // volume is also below average (double penalty = guaranteed bad fill).
    {
      const nowUtcHour = new Date().getUTCHours();
      const isAsianHours = nowUtcHour >= 0 && nowUtcHour < 7;
      const sym = (decision.symbol || '').toUpperCase();
      const isLowLiquidityPairInAsia = (
        sym.includes('EUR') || sym.includes('GBP') || sym.includes('CHF')
      ) && !sym.includes('JPY'); // JPY pairs are liquid in Asia
      const isScalp = strategy === 'scalping';
      const relVol = snap?.relativeVolume || 1;
      if (isAsianHours && isLowLiquidityPairInAsia) {
        if (isScalp) {
          // Always block scalping on these pairs during Asian hours
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `🌙 ASIAN SESSION SCALP BLOCK: ${decision.symbol} scalp rejected — Asian hours (${nowUtcHour}:00 UTC). EUR/GBP/CHF need London session (07:00+ UTC) for scalp entries.`,
          });
          state.signalsGenerated++;
          return;
        }
        if (relVol < 0.5) {
          // Block all strategies on these pairs during Asian hours with very low volume
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `🌙 ASIAN LOW-VOL BLOCK [${strategy}]: ${decision.symbol} rejected — Asian hours (${nowUtcHour}:00 UTC) + low volume (${relVol.toFixed(2)}x). EUR/GBP/CHF at < 0.5x volume during Asia = guaranteed slippage. Waiting for London.`,
          });
          state.signalsGenerated++;
          return;
        }
      }
    }

    // ── GATE 5: Consecutive pair loss escalation ──────────────────────────────
    // If this pair has 2+ consecutive losses in the brain today, raise the
    // confidence threshold to 85%. The brain-level 3-loss cooldown kicks in at 3+
    // but we need an intermediate raise at 2 losses before that triggers.
    {
      const brainForGate = (global as any).veddAIBrain?.[userId];
      const pk = brainForGate?.pairKnowledge?.[decision.symbol];
      const consecLosses = pk?.consecutiveLossesToday || 0;
      if (consecLosses >= 2) {
        const requiredForPairLoss = 85;
        if (adjustedConfidence < requiredForPairLoss) {
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `⚡ PAIR LOSS ESCALATION: ${decision.symbol} has ${consecLosses} consecutive losses today — confidence threshold raised to ${requiredForPairLoss}%. Signal at ${adjustedConfidence}% rejected. Market conditions may have structurally changed.`,
          });
          state.signalsGenerated++;
          return;
        }
      }
    }

    // ═══════════════════════════════════════════════════════════════════════════

    let entryPrice = parseNum(decision.entryPrice);
    let stopLoss = parseNum(decision.stopLoss);
    let takeProfit = parseNum(decision.takeProfit);

    // ── HARD BLOCK: SL or TP missing = trade rejected (undefined risk) ────────
    // The R:R gate and ATR expansion both skip when SL/TP are null — meaning a
    // trade with no SL or TP would execute completely unprotected. This is the
    // highest-severity gap: reject categorically before any further processing.
    if (!stopLoss || stopLoss <= 0) {
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence: adjustedConfidence,
        message: `🚫 NO SL BLOCK: ${decision.symbol} ${decision.direction} rejected — AI returned no stop loss. Trade with undefined risk is never allowed. AI prompt must include SL.`,
      });
      state.signalsGenerated++;
      return;
    }
    if (!takeProfit || takeProfit <= 0) {
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence: adjustedConfidence,
        message: `🚫 NO TP BLOCK: ${decision.symbol} ${decision.direction} rejected — AI returned no take profit. Trade with no exit target is never allowed. AI prompt must include TP.`,
      });
      state.signalsGenerated++;
      return;
    }

    // ── ATR-based minimum SL expansion (prevent premature stop-outs) ─────────
    // Scalps with 5-8 pip SLs on M15 data get wiped by normal candle noise.
    // Enforce a per-symbol floor so every trade has room to breathe.
    // Floor = max(minPipFloor, 1.0 × current ATR)
    if (entryPrice && stopLoss) {
      const pipSize = getPipSize(decision.symbol || '');
      const isJpy = (decision.symbol || '').includes('JPY');
      const isXau = (decision.symbol || '').includes('XAU');
      const currentATRForSL = (state as any)._lastATR?.[decision.symbol] || 0;

      // Minimum pip floors by instrument type
      const minPipFloor = isXau ? 300 : isJpy ? 20 : 15; // pips
      const minPipDist = minPipFloor * pipSize;

      // 1.0× ATR floor — trades need at least 1 full ATR of room
      const atrFloor = currentATRForSL > 0 ? currentATRForSL * 1.0 : minPipDist;
      const effectiveMinSL = Math.max(minPipDist, atrFloor);

      const actualSlDist = Math.abs(entryPrice - stopLoss);

      if (actualSlDist < effectiveMinSL) {
        // Expand SL to the minimum, then scale TP to preserve at least 2:1 R:R
        const expandedSL = decision.direction === 'BUY'
          ? entryPrice - effectiveMinSL
          : entryPrice + effectiveMinSL;

        let expandedTP = takeProfit;
        if (takeProfit) {
          const originalRR = Math.abs(takeProfit - entryPrice) / actualSlDist;
          const newRR = Math.max(originalRR, 2.0); // preserve original R:R or push to 2:1 minimum
          const newTpDist = effectiveMinSL * newRR;
          expandedTP = decision.direction === 'BUY'
            ? entryPrice + newTpDist
            : entryPrice - newTpDist;
        }

        const oldSlPips = Math.round(actualSlDist / pipSize);
        const newSlPips = Math.round(effectiveMinSL / pipSize);

        // ── CRITICAL: Scale down lot size proportionally when SL is expanded ──
        // Expanding the SL without reducing lot size increases the dollar risk per pip.
        // E.g. SL doubled from 10 pips → 20 pips = 2× the money at stake per lot.
        // Fix: scale lot inversely so dollar risk stays constant.
        const slExpansionRatio = actualSlDist > 0 ? effectiveMinSL / actualSlDist : 1;
        if (slExpansionRatio > 1 && decision.lotSize && decision.lotSize > 0) {
          const originalLot = decision.lotSize;
          const scaledLot = Math.max(0.01, Math.round((originalLot / slExpansionRatio) * 100) / 100);
          decision.lotSize = scaledLot;
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `📏 SL EXPANDED: ${decision.symbol} ${decision.direction} — SL ${oldSlPips}→${newSlPips} pips (ATR floor). Lot scaled ${originalLot}→${scaledLot} to keep dollar risk constant. TP scaled to maintain R:R.`,
          });
        } else {
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `📏 SL EXPANDED: ${decision.symbol} ${decision.direction} — SL was ${oldSlPips} pips (too tight), expanded to ${newSlPips} pips (ATR floor). TP scaled to maintain R:R.`,
          });
        }

        decision.stopLoss = Math.round(expandedSL * 100000) / 100000;
        decision.takeProfit = expandedTP ? Math.round(expandedTP * 100000) / 100000 : takeProfit;
        stopLoss = decision.stopLoss;
        takeProfit = decision.takeProfit;
      }
    }

    // ── Hard R:R gate: reject signals below 1:1.5 minimum ────────────
    if (entryPrice && stopLoss && takeProfit) {
      const riskDist = Math.abs(entryPrice - stopLoss);
      const rewardDist = Math.abs(takeProfit - entryPrice);
      if (riskDist > 0) {
        const rr = rewardDist / riskDist;
        if (rr < 1.5) {
          addActivity(userId, {
            type: 'signal',
            symbol: decision.symbol,
            direction: decision.direction,
            confidence: adjustedConfidence,
            message: `❌ R:R GATE REJECT: ${decision.symbol} ${decision.direction} R:R=${rr.toFixed(2)} < 1.5 minimum. Adjust TP or skip this setup.`,
          });
          state.signalsGenerated++;
          return;
        }
        // Enforce 2.0 R:R minimum — only allow below 2.0 on very high-confidence setups (88%+)
        if (rr < 2.0 && adjustedConfidence < 88) {
          addActivity(userId, {
            type: 'signal',
            symbol: decision.symbol,
            direction: decision.direction,
            confidence: adjustedConfidence,
            message: `❌ R:R GATE REJECT: ${decision.symbol} ${decision.direction} R:R=${rr.toFixed(2)} — below 1:2 minimum. Requires 88%+ confidence to allow sub-2:1 setups (current: ${adjustedConfidence}%).`,
          });
          state.signalsGenerated++;
          return;
        }
        if (rr < 2.0) {
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `⚠️ R:R note: ${decision.symbol} R:R=${rr.toFixed(2)} allowed on ${adjustedConfidence}% confidence (88%+ exception). Monitor closely.`,
          });
        }
      }
    }

    // ── Brain Learning Mode: lock at 0.01 until 60%+ WR (if toggle ON) ──
    // Raised from 55% → 60% WR required to unlock full sizing.
    // At 55% WR with 1:1.5 R:R the expectancy is barely positive — full lots at that
    // level too easily turn small losing streaks into account damage.
    let brainLocked = false;
    let brainTotalTrades = 0;
    let brainOverallWinRate = 0;
    if (config.brainLearningMode) {
      const brainData = (global as any).veddAIBrain?.[userId];
      if (brainData?.pairKnowledge) {
        const pairs = Object.values(brainData.pairKnowledge) as any[];
        const totals = pairs.reduce((acc: any, p: any) => {
          acc.trades += (p.totalTrades || 0);
          acc.wins += Math.round((p.totalTrades || 0) * ((p.winRate ?? p.buyWinRate ?? 50) / 100));
          return acc;
        }, { trades: 0, wins: 0 });
        brainTotalTrades = totals.trades;
        brainOverallWinRate = totals.trades >= 5 ? Math.round((totals.wins / totals.trades) * 100) : 0;
      }
      brainLocked = brainTotalTrades < 10 || brainOverallWinRate < 60;
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: brainLocked
          ? `🧠 Learning Mode: lot locked at 0.01 (${brainTotalTrades}/10 trades, ${brainOverallWinRate}%/60% WR) — full sizing unlocks automatically`
          : `🧠 Brain unlocked: ${brainTotalTrades} trades @ ${brainOverallWinRate}% WR — full risk sizing active`,
      });
    }

    const rawLotBase = brainLocked ? 0.01 : (parseNum(decision.lotSize) || config.baseLotSize || 0.01);
    // Apply brain-tuned lot multiplier (Kelly-based, clamped 0.5–1.5)
    const brainMult = brainLocked ? 1.0 : ((decision as any)._brainLotMultiplier || 1.0);
    const rawLotSize = Math.round(rawLotBase * brainMult * 100) / 100;
    const isSmallAccount = config.accountBalance > 0 && config.accountBalance < 500;
    const safeMaxLot = isSmallAccount
      ? Math.min(0.02, config.maxLotSize || 0.10)
      : (config.maxLotSize || 0.10);

    // ── Drawdown Shield Lot Override ──────────────────────────────────
    if (state.drawdownShieldActive && config.accountBalance > 0) {
      const shieldLot = Math.max(0.01, Math.round(config.accountBalance * 0.0025 / 1000 * 100) / 100);
      const shieldFinal = Math.min(shieldLot, safeMaxLot);
      const mt5SigShield: PendingMT5Signal = {
        id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        symbol: decision.symbol,
        direction: decision.direction,
        action: 'OPEN',
        lotSize: shieldFinal,
        entryPrice: entryPrice || null,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        confidence: adjustedConfidence,
        reason: `[SHIELD MODE] ${decision.reason || ''}`,
        holdTime: decision.holdTime || '',
        strategy: decision.strategy || 'sniper',
        confluences: decision.confluences || [],
        status: 'pending',
      };
      broadcastMT5Signal(userId, mt5SigShield);
      state.signalsGenerated++;
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence: adjustedConfidence,
        message: `🛡️ SHIELD SIGNAL: ${decision.direction} ${decision.symbol} at reduced lot ${shieldFinal} (0.25% risk). ${decision.reason || ''}`,
      });
      return;
    }

    // ── Smart Dual-Mode Arbitration: Kelly + Pyramid ───────────────────
    // When BOTH are enabled, the engine picks the right tool per trade:
    //  • Kelly = conservative data-driven base (choppy/ranging markets)
    //  • Pyramid = momentum-scaling (strongly trending markets only)
    //  • Both ON = Kelly sets the base lot, pyramid fires only if ADX > 25

    const bothEnabled = config.useKellyCriterion && config.enablePyramiding;
    const snapshot = state.marketSnapshot?.[decision.symbol] || state.lastIndicatorSnapshot?.[decision.symbol];
    const adxNow = (snapshot as any)?.adx || 0;
    const isTrending = adxNow >= 25;

    // Determine which sizing mode wins for this trade
    let sizingMode: 'kelly' | 'pyramid' | 'kelly_base_pyramid_allowed' | 'default' = 'default';
    if (bothEnabled) {
      if (isTrending) {
        sizingMode = 'kelly_base_pyramid_allowed';
      } else {
        sizingMode = 'kelly'; // Kelly only — no pyramiding in choppy markets
      }
    } else if (config.useKellyCriterion) {
      sizingMode = 'kelly';
    } else if (config.enablePyramiding) {
      sizingMode = 'pyramid';
    }

    // ── Kelly Criterion Lot Sizing ─────────────────────────────────────
    let kellyLot = rawLotSize;
    if ((sizingMode === 'kelly' || sizingMode === 'kelly_base_pyramid_allowed') && config.accountBalance > 0) {
      const strat = (decision.strategy || 'auto').toLowerCase();
      const ks = state.goalTracker.kellyStats?.[strat];
      const wins = ks?.wins || 0;
      const losses = ks?.losses || 0;
      const totalRR = ks?.totalRR || 0;
      const kellyFraction = calculateKellyFraction(wins, losses, totalRR);
      kellyLot = Math.round((config.accountBalance * kellyFraction / 1000) * 100) / 100;
      const winRate = wins + losses >= 5 ? Math.round(wins / (wins + losses) * 100) : null;
      const avgRR = wins > 0 ? (totalRR / wins).toFixed(1) : '1.5';
      const modeLabel = sizingMode === 'kelly_base_pyramid_allowed'
        ? `Kelly base (ADX=${adxNow.toFixed(0)}, trending — pyramiding ALLOWED on this trade)`
        : `Kelly only (ADX=${adxNow.toFixed(0)}, ranging — pyramiding SUPPRESSED)`;
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `📐 ${modeLabel}${winRate !== null ? ` | ${strat} ${winRate}% WR, R:R ${avgRR}` : ''} → ${kellyLot} lots`,
      });
    }

    // Suppress pyramid if Kelly says market is choppy (both enabled + no trend)
    const pyramidSuppressed = bothEnabled && !isTrending;
    if (pyramidSuppressed && decision.pyramidOf) {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `📐 Pyramid suppressed by Kelly mode — ADX ${adxNow.toFixed(0)} < 25, market ranging. Kelly sizing protects capital.`,
      });
      return;
    }

    const safeCompoundMult = isSmallAccount
      ? Math.min(state.goalTracker.compoundMultiplier, 1.25)
      : state.goalTracker.compoundMultiplier;
    const baseLotForCalc = (sizingMode === 'kelly' || sizingMode === 'kelly_base_pyramid_allowed') ? kellyLot : rawLotSize;
    const compoundedLot = config.enableCompounding
      ? Math.round(baseLotForCalc * safeCompoundMult * 100) / 100
      : baseLotForCalc;

    // ── Dynamic Lot Scaling: confidence + strategy + exposure ────────────────
    // Only applies when brain is NOT locked (learning mode allows 0.01 micro-lots only).
    // Skip for pyramid entries (they have their own lot logic) and shield mode (already handled).
    const isDynamicSizingEnabled = !brainLocked && !decision.pyramidOf;
    let dynamicLot = compoundedLot;

    if (isDynamicSizingEnabled) {
      const confTier   = getConfidenceLotMultiplier(adjustedConfidence);
      const stratTier  = getStrategyLotMultiplier(decision.strategy || 'auto');
      const openCount  = (global as any).mt5OpenPositions?.[userId]?.positions?.length ?? state.openPositionCount;
      const expTier    = getExposureLotMultiplier(openCount);

      const combinedMult = confTier.mult * stratTier.mult * expTier.mult;
      dynamicLot = Math.round(compoundedLot * combinedMult * 100) / 100;

      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `📐 Dynamic sizing: ${compoundedLot} base × [Conf:${confTier.label}] × [Strat:${stratTier.label}] × [Exp:${expTier.label}] = ${dynamicLot} lots`,
      });
    }

    const lotSize = Math.max(0.01, Math.min(isDynamicSizingEnabled ? dynamicLot : compoundedLot, safeMaxLot));

    const mt5Signal: PendingMT5Signal = {
      id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      symbol: decision.symbol,
      direction: decision.direction,
      action: 'OPEN',
      lotSize,
      entryPrice: entryPrice || null,
      stopLoss: stopLoss || null,
      takeProfit: takeProfit || null,
      confidence: adjustedConfidence,
      reason: decision.reason || '',
      holdTime: decision.holdTime || '',
      strategy: decision.strategy || 'auto',
      confluences: decision.confluences || [],
      status: 'pending',
    };
    broadcastMT5Signal(userId, mt5Signal);

    // ── Multi-account TradeLocker execution ──────────────────────────────
    // Fetch ALL active TradeLocker connections for this user and execute
    // the signal on each in parallel. Partial failures are logged per
    // account without blocking the other accounts.
    const tlConnections = await storage.getUserTradelockerConnections(userId);
    const activeTLConnections = tlConnections.filter((c: any) => c.isActive);
    if (activeTLConnections.length === 0) {
      addActivity(userId, { type: 'info', symbol: decision.symbol, message: 'No active TradeLocker connections. Signal queued for MT5 EA pickup.' });
      return;
    }

    // ── Live Engine TL Cooldown Gate ─────────────────────────────────────
    // Prevents the live engine from firing the same pair more than once per 4 hours.
    // Shares the same recentTrades map used by the chart-data handler so both
    // paths respect the same cooldown.
    {
      const _leCooldownKey = `last_trade_${userId}_${decision.symbol.toUpperCase().replace('/', '')}`;
      (global as any).recentTrades = (global as any).recentTrades || {};
      const _leLastTime = (global as any).recentTrades[_leCooldownKey];
      const _leNow = Date.now();
      const _leCooldownMs = 240 * 60 * 1000; // 4 hours — matches chart-data default
      if (_leLastTime && (_leNow - _leLastTime) < _leCooldownMs) {
        const _leWaitMin = Math.ceil((_leCooldownMs - (_leNow - _leLastTime)) / 60000);
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `[Live Engine] TL cooldown active on ${decision.symbol} — ${_leWaitMin}min remaining. Signal skipped.`,
        });
        return;
      }
      // Check daily trade count against maxOpenTrades as a hard daily cap
      const _leDate = new Date().toISOString().slice(0, 10);
      const _leDailyLogs = await storage.getTradelockerTradeLogs(userId, 200);
      const _leDailyCount = _leDailyLogs.filter((t: any) =>
        t.symbol?.toUpperCase().replace('/', '') === decision.symbol.toUpperCase().replace('/', '') &&
        t.action === 'OPEN' &&
        t.status === 'executed' &&
        t.createdAt && new Date(t.createdAt).toISOString().slice(0, 10) === _leDate
      ).length;
      const _leMaxDaily = config.maxOpenTrades ?? 3;
      if (_leDailyCount >= _leMaxDaily) {
        addActivity(userId, {
          type: 'info',
          symbol: decision.symbol,
          message: `[Live Engine] Daily cap reached for ${decision.symbol}: ${_leDailyCount}/${_leMaxDaily}. No more trades today.`,
        });
        return;
      }
      // Reserve the cooldown slot before executing (prevents race conditions)
      (global as any).recentTrades[_leCooldownKey] = _leNow;
    }

    try {
      const signalLog = await storage.createMt5SignalLog({
        userId,
        symbol: decision.symbol,
        direction: decision.direction,
        action: 'OPEN',
        volume: lotSize,
        entryPrice: entryPrice || null,
        stopLoss: stopLoss || null,
        takeProfit: takeProfit || null,
        confidence: adjustedConfidence,
        source: 'vedd_live_engine',
      });

      // Execute on ALL active accounts in parallel
      const openResults = await Promise.allSettled(
        activeTLConnections.map(async (tlConn: any) => {
          // Apply per-account lot multiplier (default 1.0 = no change)
          const acctMult = typeof tlConn.lotMultiplier === 'number' && tlConn.lotMultiplier > 0
            ? tlConn.lotMultiplier : 1.0;
          const acctLot = Math.max(0.01, Math.round(lotSize * acctMult * 100) / 100);

          const tradeResult = await executeMT5SignalOnTradeLocker(tlConn, {
            action: 'OPEN',
            symbol: decision.symbol,
            direction: decision.direction,
            volume: acctLot,
            entryPrice,
            stopLoss,
            takeProfit,
          });

          await storage.createTradelockerTradeLog({
            connectionId: tlConn.id,
            userId,
            sourceSignalId: signalLog.id,
            action: 'OPEN',
            symbol: decision.symbol,
            direction: decision.direction,
            volume: acctLot,
            entryPrice,
            stopLoss,
            takeProfit,
            tradelockerOrderId: tradeResult.orderId || null,
            status: tradeResult.success ? 'executed' : 'failed',
            errorMessage: tradeResult.error || null,
          });

          return { tlConn, tradeResult, acctLot };
        })
      );

      let anySuccess = false;
      for (const result of openResults) {
        if (result.status === 'fulfilled') {
          const { tlConn, tradeResult, acctLot: executedLot } = result.value;
          const acctLabel = tlConn.email ? `[${tlConn.email}]` : `[Account ${tlConn.id}]`;
          const multLabel = (tlConn.lotMultiplier ?? 1) !== 1 ? ` (×${tlConn.lotMultiplier})` : '';
          if (tradeResult.success) {
            anySuccess = true;
            addActivity(userId, {
              type: 'trade_open',
              symbol: decision.symbol,
              direction: decision.direction,
              confidence: adjustedConfidence,
              message: `TRADE EXECUTED via TradeLocker ${acctLabel}: ${decision.direction} ${decision.symbol} | Lot: ${executedLot}${multLabel} | SL: ${stopLoss || 'N/A'} | TP: ${takeProfit || 'N/A'} | Order: ${tradeResult.orderId}`,
              details: { orderId: tradeResult.orderId, lotSize, stopLoss, takeProfit, confluences: decision.confluences },
            });
          } else {
            addActivity(userId, {
              type: 'error',
              symbol: decision.symbol,
              message: `TradeLocker ${acctLabel} execution failed: ${decision.direction} ${decision.symbol} - ${tradeResult.error}`,
            });
          }
        } else {
          addActivity(userId, {
            type: 'error',
            symbol: decision.symbol,
            message: `TradeLocker execution error on one account: ${result.reason?.message || 'Unknown error'}`,
          });
        }
      }

      if (anySuccess) {
        state.tradesExecuted++;
        state.tradesOpenedToday++;
        state.openPositionCount++;
        // Mark the queued MT5 signal as already executed so the MT5 EA
        // does NOT pick it up and fire the same trade a second time.
        mt5Signal.status = 'executed';
      } else {
        state.tradesFailed++;
        addActivity(userId, {
          type: 'error',
          symbol: decision.symbol,
          message: `TradeLocker execution failed on all ${activeTLConnections.length} account(s). Signal still available for MT5 EA.`,
        });
      }
    } catch (err: any) {
      state.tradesFailed++;
      addActivity(userId, { type: 'error', symbol: decision.symbol, message: `Execution error: ${err.message}. Signal still available for MT5 EA.` });
    }
  }

  if (decision.action === 'MODIFY_POSITION' || decision.action === 'CLOSE_POSITION') {
    // ── PREMATURE CLOSE GATE ─────────────────────────────────────────────────
    // Blocks the AI from closing a losing position before it has had enough
    // time to develop. Previously the AI was closing negative trades within
    // minutes of opening — then the same trade continued to profit in
    // TradeLocker because the close either failed or wasn't synced.
    //
    // Rule: if the AI wants to FULL_CLOSE a position AND the position is
    // currently in a loss (profit < 0) AND it has been open < 45 minutes,
    // override the action to a MODIFY (SL review only) and log the block.
    if (decision.action === 'CLOSE_POSITION') {
      const openPositions: any[] = (global as any).mt5OpenPositions?.[userId]?.positions || [];
      const pos = openPositions.find((p: any) =>
        String(p.ticket ?? p.id) === String(decision.positionId) ||
        (p.symbol || '').toUpperCase().replace('/', '') === decision.symbol?.toUpperCase().replace('/', '')
      );
      if (pos) {
        const isInLoss = (pos.profit ?? 0) < 0;
        const openTimeSec = pos.openTime ? Math.round(Date.now() / 1000 - Number(pos.openTime)) : null;
        const ageMin = openTimeSec != null ? Math.floor(openTimeSec / 60) : null;
        const MIN_HOLD_BEFORE_FORCE_CLOSE = 45; // minutes
        if (isInLoss && ageMin != null && ageMin < MIN_HOLD_BEFORE_FORCE_CLOSE) {
          addActivity(userId, {
            type: 'info',
            symbol: decision.symbol,
            message: `🛡️ PREMATURE CLOSE BLOCKED: ${decision.symbol} in loss but only ${ageMin}min old — minimum ${MIN_HOLD_BEFORE_FORCE_CLOSE}min required before force-close. SL provides protection. Trade left open to recover.`,
          });
          return; // Reject this close entirely — let the SL do its job
        }
      }
    }

    state.positionsManaged++;

    const modifyAction = decision.modifyAction || (decision.action === 'CLOSE_POSITION' ? 'full_close' : 'trail_stop');
    const newSL = parseNum(decision.newStopLoss);
    const newTP = parseNum(decision.newTakeProfit);
    const partialVolume = parseNum(decision.partialVolume);

    addActivity(userId, {
      type: 'position_update',
      symbol: decision.symbol,
      confidence: typeof decision.confidence === 'number' ? decision.confidence : 0,
      message: `POSITION MGMT [${modifyAction.toUpperCase()}]: ${decision.symbol} - ${decision.reason}`,
      details: { modifyAction, newStopLoss: newSL, newTakeProfit: newTP, partialVolume, positionId: decision.positionId },
    });

    // Send to MT5 first by adding to pending signals
    const signalAction = decision.action === 'CLOSE_POSITION' ? 'CLOSE' as const : 'MODIFY' as const;
    const mgmtSignal: PendingMT5Signal = {
      id: `mgmt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      timestamp: new Date().toISOString(),
      symbol: decision.symbol,
      direction: decision.direction || 'BUY',
      action: signalAction,
      lotSize: partialVolume || 0,
      entryPrice: null,
      stopLoss: newSL || null,
      takeProfit: newTP || null,
      confidence: typeof decision.confidence === 'number' ? decision.confidence : 0,
      reason: `${modifyAction}: ${decision.reason || ''}`,
      holdTime: '',
      strategy: decision.strategy || 'position_management',
      confluences: decision.confluences || [],
      status: 'pending',
      modifyAction,
      positionId: decision.positionId || null,
    };
    broadcastMT5Signal(userId, mgmtSignal);

    // Then try TradeLocker — execute on ALL active accounts simultaneously
    const tlConnectionsForMgmt = await storage.getUserTradelockerConnections(userId);
    const activeTLForMgmt = tlConnectionsForMgmt.filter((c: any) => c.isActive);
    if (activeTLForMgmt.length > 0) {
      await Promise.allSettled(
        activeTLForMgmt.map(async (tlConn: any) => {
          const acctLabel = tlConn.email ? `[${tlConn.email}]` : `[Account ${tlConn.id}]`;
          try {
            if (signalAction === 'CLOSE') {
              const tradeResult = await executeMT5SignalOnTradeLocker(tlConn, {
                action: 'CLOSE',
                symbol: decision.symbol,
                direction: decision.direction || 'BUY',
                volume: partialVolume || 0,
                positionId: decision.positionId,
              });
              if (tradeResult.success) {
                addActivity(userId, { type: 'trade_close', symbol: decision.symbol, message: `Position CLOSED via TradeLocker ${acctLabel}: ${decision.symbol} - ${decision.reason}` });
              } else {
                addActivity(userId, { type: 'error', symbol: decision.symbol, message: `CLOSE failed on TradeLocker ${acctLabel}: ${tradeResult.error}` });
              }
            } else if (signalAction === 'MODIFY') {
              const tradeResult = await executeMT5SignalOnTradeLocker(tlConn, {
                action: 'MODIFY',
                symbol: decision.symbol,
                direction: decision.direction || 'BUY',
                volume: 0,
                stopLoss: newSL,
                takeProfit: newTP,
                positionId: decision.positionId,
              });
              if (tradeResult.success) {
                addActivity(userId, { type: 'position_update', symbol: decision.symbol, message: `Position MODIFIED via TradeLocker ${acctLabel}: ${decision.symbol} | New SL: ${newSL || 'N/A'} | New TP: ${newTP || 'N/A'}` });
              } else {
                addActivity(userId, { type: 'error', symbol: decision.symbol, message: `MODIFY failed on TradeLocker ${acctLabel}: ${tradeResult.error}` });
              }
            }
          } catch (err: any) {
            addActivity(userId, { type: 'error', symbol: decision.symbol, message: `Position management error on TradeLocker ${acctLabel}: ${err.message}` });
          }
        })
      );
    }
  }
}

// ── Self-scheduling scan loop ──────────────────────────────────────────
function scheduleScan(userId: number): void {
  const state = engineStates[userId];
  if (!state || state.status !== 'running') return;
  const interval = getAdaptiveScanInterval(state.config);
  engineTimers[userId] = setTimeout(async () => {
    await scanMarkets(userId);
    scheduleScan(userId); // reschedule after scan completes
  }, interval);
}

// ── Sunday Gap Scanner ─────────────────────────────────────────────────
function scheduleGapScanner(userId: number): void {
  const state = engineStates[userId];
  if (!state) return;

  const now = new Date();
  const dayUtc = now.getUTCDay(); // 0=Sun
  const hourUtc = now.getUTCHours();
  const minUtc = now.getUTCMinutes();

  // Calculate ms until next Sunday 22:05 UTC
  let daysUntilSunday = (7 - dayUtc) % 7;
  if (dayUtc === 0 && (hourUtc < 22 || (hourUtc === 22 && minUtc < 5))) daysUntilSunday = 0;
  else if (daysUntilSunday === 0) daysUntilSunday = 7;

  const targetSunday = new Date(now);
  targetSunday.setUTCDate(targetSunday.getUTCDate() + daysUntilSunday);
  targetSunday.setUTCHours(22, 5, 0, 0);
  const msUntilScan = Math.max(1000, targetSunday.getTime() - now.getTime());

  setTimeout(async () => {
    const latestState = engineStates[userId];
    if (!latestState || latestState.status !== 'running') return;
    await runSundayGapScanner(userId);
    scheduleGapScanner(userId); // reschedule weekly
  }, msUntilScan);

  addActivity(userId, {
    type: 'info',
    message: `🌙 Sunday gap scanner scheduled for ${targetSunday.toISOString().slice(0, 16)} UTC (${Math.round(msUntilScan / 3600000)}h away)`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// ORB AUTONOMOUS SCAN
// Runs every engine cycle. Detects 9:30 AM EST opening range breakout + retest
// and fires trades autonomously when SS AI Bot score ≥ 70.
//
// Rules (matches the manual ORB page exactly):
//   • Valid window: 9:30 AM – 2:00 PM EST only
//   • ORB range = high/low of the 9:30 AM M1 candle (15-min range via M1 data)
//   • Breakout: full-body 6-min candle close above ORB High (LONG) or below ORB Low (SHORT)
//   • Entry: on the RETEST of the broken level (ORB High → support / ORB Low → resistance)
//   • Score gate: computeBreakoutScore ≥ 70 required
//   • One trade per pair per day (orbDailyFired)
//   • SL: ORB Low – 10% range (LONG) / ORB High + 10% range (SHORT)
//   • TP1: 2:1 R:R | TP2: 3:1 R:R
// ─────────────────────────────────────────────────────────────────────────────
async function runORBAutonomousScan(userId: number): Promise<void> {
  const state = engineStates[userId];
  if (!state) return;
  const config = state.config;
  if (config.enableORBAutonomous === false) return;

  if (!state.orbDailyFired) state.orbDailyFired = {};

  // ── 1. Time gate — EST 9:30 AM to 2:00 PM ────────────────────────────────
  const nowUTC = new Date();
  // Try EDT (-4) and EST (-5) — pick whichever puts us in a valid window
  const estOffsets = [-4, -5];
  let estHour = -1, estMin = -1;
  for (const off of estOffsets) {
    const h = ((nowUTC.getUTCHours() + off) % 24 + 24) % 24;
    const m = nowUTC.getUTCMinutes();
    const totalMins = h * 60 + m;
    if (totalMins >= 9 * 60 + 30 && totalMins < 14 * 60) {
      estHour = h; estMin = m; break;
    }
  }
  if (estHour === -1) return; // outside trading window

  const todayKey = nowUTC.toISOString().slice(0, 10); // YYYY-MM-DD

  // ── 2. Scan configured pairs ──────────────────────────────────────────────
  for (const symbol of config.pairs) {
    try {
      // Skip if already traded this pair today
      if (state.orbDailyFired[symbol] === todayKey) continue;

      // Fetch M5 candles for ORB detection (need ~30 candles for today's session)
      const assetType = marketDataService.detectAssetType(symbol);
      const m5Result = await marketDataService.fetchMarketData({
        symbol, assetType, timeframe: '5m', limit: 60,
      });
      if (!m5Result.bars || m5Result.bars.length < 6) continue;

      // Also fetch H1 for ATR / breakout score
      const h1Result = await marketDataService.fetchMarketData({
        symbol, assetType, timeframe: '1h', limit: 30,
      });

      const m5Bars = m5Result.bars;
      const h1Bars = h1Result.bars || [];
      const currentPrice = m5Bars[m5Bars.length - 1].close;

      // Convert bars to BreakoutCandle format (newest-first for breakoutEngine)
      const toBC = (b: any) => ({ o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume ?? 0, t: Math.floor((b.timestamp ?? Date.now()) / 1000) });
      const m5BC = [...m5Bars].reverse().map(toBC);
      const h1BC = [...h1Bars].reverse().map(toBC);

      // ── 3. Find today's ORB high/low from 9:30 AM candle ─────────────────
      // UTC offsets for EST (-5) and EDT (-4)
      let orbHigh = 0, orbLow = 0;
      for (const off of estOffsets) {
        const orbCandles = m5BC.filter(c => {
          if (!c.t) return false;
          const d = new Date(c.t * 1000);
          const h = ((d.getUTCHours() + off) % 24 + 24) % 24;
          const m = d.getUTCMinutes();
          // 9:30–9:45 AM EST = opening range window
          return h === 9 && m >= 30 && m < 45;
        });
        if (orbCandles.length > 0) {
          orbHigh = Math.max(...orbCandles.map(c => c.h));
          orbLow  = Math.min(...orbCandles.map(c => c.l));
          break;
        }
      }
      if (orbHigh === 0 || orbLow === 0 || orbHigh <= orbLow) continue;

      const orbRange = orbHigh - orbLow;
      const retestBuffer = orbRange * 0.15; // 15% tolerance for retest detection

      // ── 4. Detect phase: did a breakout happen and is price retesting? ───
      // Look at candles after 9:45 AM for breakout close, then check retest
      let breakoutDir: 'BUY' | 'SELL' | null = null;

      // Candles are newest-first in m5BC — find candles after 9:45 AM TODAY only.
      // Must include date boundary so yesterday's post-9:45 candles are excluded.
      const todayUTCDate = nowUTC.toISOString().slice(0, 10); // YYYY-MM-DD
      const postORBCandles = m5BC.filter(c => {
        if (!c.t) return false;
        const candleDate = new Date(c.t * 1000).toISOString().slice(0, 10);
        if (candleDate !== todayUTCDate) return false; // ← date boundary fix (C2)
        for (const off of estOffsets) {
          const d = new Date(c.t * 1000);
          const h = ((d.getUTCHours() + off) % 24 + 24) % 24;
          const m = d.getUTCMinutes();
          const total = h * 60 + m;
          if (total >= 9 * 60 + 45) return true;
        }
        return false;
      });

      // Check if any past candle had a full-body close beyond the ORB
      for (const c of postORBCandles.slice(1)) { // skip the most recent (live)
        const bodyHigh = Math.max(c.o, c.c);
        const bodyLow  = Math.min(c.o, c.c);
        if (bodyLow > orbHigh) { breakoutDir = 'BUY'; break; }
        if (bodyHigh < orbLow) { breakoutDir = 'SELL'; break; }
      }
      if (!breakoutDir) continue; // no breakout yet — wait

      // ── 5. Check retest: current price near the broken ORB level ─────────
      const isRetestLong = breakoutDir === 'BUY' &&
        currentPrice >= orbHigh - retestBuffer &&
        currentPrice <= orbHigh + retestBuffer;
      const isRetestShort = breakoutDir === 'SELL' &&
        currentPrice >= orbLow - retestBuffer &&
        currentPrice <= orbLow + retestBuffer;

      if (!isRetestLong && !isRetestShort) continue; // not at retest yet

      // ── 6. SS AI Bot score gate (≥ 70) ───────────────────────────────────
      const scoreResult = await computeBreakoutScore(currentPrice, [], m5BC, [], h1BC, []);
      const aiScore = scoreResult.percentage;
      if (aiScore < 70) {
        addActivity(userId, {
          type: 'info', symbol,
          message: `📊 ORB AUTO [${symbol}]: ${breakoutDir} retest detected but SS AI score ${aiScore}/100 < 70 — skipping`,
        });
        continue;
      }

      // ── 7. Build trade decision ───────────────────────────────────────────
      const direction = breakoutDir;
      const entry     = currentPrice;
      const slDist    = orbRange + orbRange * 0.1; // SL = 10% beyond the ORB range
      const tp1Dist   = slDist * 2;  // 2:1 R:R
      const tp2Dist   = slDist * 3;  // 3:1 R:R
      const sl  = direction === 'BUY' ? orbLow  - orbRange * 0.1 : orbHigh + orbRange * 0.1;
      const tp1 = direction === 'BUY' ? entry + tp1Dist : entry - tp1Dist;
      const tp2 = direction === 'BUY' ? entry + tp2Dist : entry - tp2Dist;

      addActivity(userId, {
        type: 'signal', symbol, direction,
        message: `🚀 ORB AUTO SIGNAL [${symbol}]: ${direction} — retest at ${entry.toFixed(4)} | ORB ${orbLow.toFixed(4)}–${orbHigh.toFixed(4)} | SS AI ${aiScore}/100 | SL ${sl.toFixed(4)} TP1 ${tp1.toFixed(4)}`,
        confidence: aiScore,
      });

      state.orbDailyFired[symbol] = todayKey;

      await processDecision(userId, {
        action:      'OPEN_TRADE',
        strategy:    'orb_breakout',
        symbol,
        direction,
        confidence:  aiScore,
        entryPrice:  entry,
        stopLoss:    sl,
        takeProfit:  tp1,
        takeProfit2: tp2,
        lotSize:     config.baseLotSize,
        holdTime:    '2-4 hours',
        urgency:     'ENTER_NOW',
        reason:      `ORB Autonomous — ${direction} retest of ${direction === 'BUY' ? `ORB High ${orbHigh.toFixed(4)}` : `ORB Low ${orbLow.toFixed(4)}`} | Range ${(orbRange * 10000).toFixed(0)} pips | SS AI ${aiScore}/100 | ${scoreResult.summary.split('\n')[0]}`,
        confluences: [
          `ORB range: ${orbLow.toFixed(4)}–${orbHigh.toFixed(4)}`,
          `Breakout direction: ${direction}`,
          `Retest at: ${entry.toFixed(4)}`,
          `SS AI Bot score: ${aiScore}/100`,
          ...scoreResult.strategies.filter(s => s.fired).map(s => s.name),
        ],
      });

    } catch (err: any) {
      addActivity(userId, { type: 'error', symbol, message: `ORB Auto scan error (${symbol}): ${err.message}` });
    }

    await new Promise(r => setTimeout(r, 3000)); // pace between pairs
  }
}

async function runSundayGapScanner(userId: number): Promise<void> {
  const state = engineStates[userId];
  if (!state) return;
  const config = state.config;
  const gapPairs = ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'GBPJPY'].filter(p => config.pairs.includes(p) || config.pairs.length === 0);

  addActivity(userId, { type: 'scan', message: `🌙 Sunday gap scan running for ${gapPairs.join(', ')}` });

  for (const symbol of gapPairs) {
    const fridayClose = state.lastFridayClose[symbol];
    if (!fridayClose) continue;
    try {
      const assetType = marketDataService.detectAssetType(symbol);
      const result = await marketDataService.fetchMarketData({ symbol, assetType, timeframe: '1m', limit: 5 });
      if (!result.bars || result.bars.length === 0) continue;
      const sundayOpen = result.bars[result.bars.length - 1].open;
      const isJPY = symbol.includes('JPY');
      const isGold = symbol === 'XAUUSD';
      const gapPips = Math.abs(sundayOpen - fridayClose) * (isJPY ? 100 : isGold ? 10 : 10000);
      const gapThreshold = isGold ? 30 : 5;
      if (gapPips < gapThreshold) continue;

      const direction: 'BUY' | 'SELL' = sundayOpen < fridayClose ? 'BUY' : 'SELL';
      const gapSize = Math.abs(sundayOpen - fridayClose);
      const tp1 = direction === 'BUY' ? sundayOpen + gapSize * 0.618 : sundayOpen - gapSize * 0.618;
      const tp2 = fridayClose; // 100% fill
      // SL in price distance = pip_count × pipSize (C3 fix: was using raw pips for gold)
      const pipSz = getPipSize(symbol);
      const slPipCount = isGold ? 300 : isJPY ? 20 : 20; // 300 gold pips, 20 pips for forex/JPY
      const slDist = slPipCount * pipSz;
      const sl = direction === 'BUY' ? sundayOpen - slDist : sundayOpen + slDist;
      const confidence = Math.min(88, 72 + gapPips * 0.8);

      addActivity(userId, {
        type: 'info',
        symbol,
        message: `🌙 SUNDAY GAP: ${symbol} opened ${gapPips.toFixed(1)} pips ${sundayOpen > fridayClose ? 'above' : 'below'} Friday close → gap fill ${direction} (confidence: ${confidence.toFixed(0)}%)`,
      });

      await processDecision(userId, {
        action: 'OPEN_TRADE',
        symbol,
        direction,
        confidence,
        strategy: 'sunday_gap',
        entryPrice: sundayOpen,
        stopLoss: sl,
        takeProfit: tp1,
        takeProfit2: tp2,
        reason: `Sunday gap ${gapPips.toFixed(1)} pips — gap fill trade toward Friday close at ${fridayClose}`,
        confluences: ['sunday_gap', 'gap_fill_probability', 'mean_reversion'],
        holdTime: '2-8 hours',
        urgency: 'ENTER_NOW',
      });
    } catch (err: any) {
      addActivity(userId, { type: 'error', symbol, message: `Gap scan error: ${err.message}` });
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

export function startLiveEngine(userId: number, config?: Partial<LiveEngineConfig>): EngineState {
  if (engineIntervals[userId]) {
    clearInterval(engineIntervals[userId]);
    delete engineIntervals[userId];
  }
  if (engineTimers[userId]) {
    clearTimeout(engineTimers[userId]);
    delete engineTimers[userId];
  }

  const fullConfig = { ...getDefaultConfig(userId), ...(config || {}) };

  const weekStart = new Date().toISOString().substring(0, 8);
  const weekKey = `${userId}_${weekStart}`;
  const cachedTracker = goalTrackerCache[weekKey];
  const restoredTracker = cachedTracker
    ? { ...cachedTracker, weeklyTarget: fullConfig.weeklyProfitTarget || cachedTracker.weeklyTarget }
    : createGoalTracker(fullConfig);

  // Initialise strategy performance weights for all 16 strategies
  const initWeights: Record<string, number> = Object.fromEntries(ALL_STRATEGY_KEYS.map(k => [k, 1.0]));

  engineStates[userId] = {
    status: 'running',
    startedAt: new Date().toISOString(),
    config: fullConfig,
    scanCount: 0,
    signalsGenerated: 0,
    tradesExecuted: 0,
    tradesFailed: 0,
    tradesOpenedToday: 0,
    tradesOpenedTodayDate: new Date().toISOString().slice(0, 10),
    positionsManaged: 0,
    lastScanAt: null,
    lastSignalAt: null,
    currentlyScanning: false,
    activityLog: [],
    openPositionCount: 0,
    pnlSession: restoredTracker.currentProfit,
    marketSnapshot: {},
    goalTracker: restoredTracker,
    modelLocked: false,
    asiaRangeHigh: {},
    asiaRangeLow: {},
    asiaRangeDate: null,
    lastHighImpactNewsAt: null,
    // Acceleration feature state
    strategyPerformanceWeights: initWeights,
    openPyramidPositions: {},
    sessionHighWatermark: 0,
    drawdownShieldActive: false,
    lastFridayClose: {},
    lastIndicatorSnapshot: {},
    lastTriggerAt: {},
    pnlToday: 0,
    dailyLossHalted: false,
    dailyLossHaltedAt: null,
    tradesSinceLastLearn: 0,
    positionTrailState: {},
    aiResponseCache: {},
    htfBiasCache: {},
    pairDirectionLock: {},
    compositeLastFiredAt: {},
    orbDailyFired: {},
  };

  const adaptiveInterval = getAdaptiveScanInterval(fullConfig);
  const intervalDisplay = fullConfig.adaptiveScanInterval
    ? `adaptive (${adaptiveInterval / 1000}s now)`
    : `${fullConfig.scanIntervalMs / 1000}s`;

  const goalMsg = fullConfig.weeklyProfitTarget > 0
    ? ` | Weekly Goal: $${fullConfig.weeklyProfitTarget} (${((fullConfig.accountBalance + fullConfig.weeklyProfitTarget) / Math.max(fullConfig.accountBalance, 1)).toFixed(1)}x growth)`
    : '';

  const featFlags = [
    fullConfig.adaptiveScanInterval && '⚡ Adaptive Scan',
    fullConfig.enablePyramiding && '📈 Pyramiding',
    fullConfig.useKellyCriterion && '📐 Kelly Sizing',
    fullConfig.drawdownShieldThreshold > 0 && `🛡️ Shield @${fullConfig.drawdownShieldThreshold}%`,
    fullConfig.propFirmMode && '🏆 PropFirm',
  ].filter(Boolean).join(' | ');

  addActivity(userId, {
    type: 'info',
    message: `VEDD AI Live Engine STARTED | Strategy: ${fullConfig.strategyMode} | Pairs: ${fullConfig.pairs.join(', ')} | Interval: ${intervalDisplay} | Min confidence: ${fullConfig.minConfidence}%${goalMsg}${featFlags ? ` | Features: ${featFlags}` : ''}`,
  });

  (async () => {
    try {
      const tlConn = await storage.getUserTradelockerConnection(userId);
      if (tlConn && tlConn.isActive) {
        const warmResult = await warmTradeLockerConnection(tlConn);
        addActivity(userId, {
          type: warmResult.success ? 'info' : 'error',
          message: warmResult.success
            ? 'TradeLocker pre-warmed — ready for instant trade execution'
            : `TradeLocker pre-warm failed: ${warmResult.error}`,
        });
      }
    } catch (e) {
      console.log('[VEDD Live Engine] TradeLocker pre-warm skipped:', (e as Error).message);
    }
  })();

  setTimeout(() => {
    scanMarkets(userId).then(() => scheduleScan(userId));
  }, 2000);

  scheduleGapScanner(userId);

  // ── Load persisted brain from disk so dashboard has data immediately ──
  // This restores the brain without waiting for the 30-min retrain interval.
  try {
    const loadFn = (global as any).loadPersistedBrain;
    if (typeof loadFn === 'function') {
      const persisted = loadFn(userId);
      if (persisted) {
        addActivity(userId, {
          type: 'info',
          message: `🧠 Brain restored from disk — ${persisted.totalTradesAnalyzed ?? 0} trades, ${persisted.pairsLearned ?? 0} pairs`,
        });
      }
    }
  } catch (_) {}

  // Auto-train brain immediately on engine start (refreshes from latest DB data),
  // then every 30 minutes to capture newly closed trades
  autoRetainBrain(userId);
  if (brainLearningIntervals[userId]) clearInterval(brainLearningIntervals[userId]);
  brainLearningIntervals[userId] = setInterval(() => autoRetainBrain(userId), 30 * 60 * 1000);

  console.log(`[VEDD Live Engine] Started for user ${userId} | Strategy: ${fullConfig.strategyMode} | Interval: ${intervalDisplay}`);

  return engineStates[userId];
}

function queueCloseAllSignal(userId: number, reason: string): void {
  broadcastMT5Signal(userId, {
    id: `close_all_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    symbol: 'ALL',
    direction: 'BUY',
    action: 'CLOSE_ALL',
    lotSize: 0,
    entryPrice: null,
    stopLoss: null,
    takeProfit: null,
    confidence: 100,
    reason,
    holdTime: '',
    strategy: 'emergency_stop',
    confluences: [],
    status: 'pending',
  });
}

export function emergencyStopEngine(userId: number): EngineState | null {
  if (engineIntervals[userId]) {
    clearInterval(engineIntervals[userId]);
    delete engineIntervals[userId];
  }
  if (engineTimers[userId]) {
    clearTimeout(engineTimers[userId]);
    delete engineTimers[userId];
  }
  if (brainLearningIntervals[userId]) {
    clearInterval(brainLearningIntervals[userId]);
    delete brainLearningIntervals[userId];
  }

  const state = engineStates[userId];
  if (state) {
    state.status = 'stopped';
    state.dailyLossHalted = true;
    state.dailyLossHaltedAt = new Date().toISOString();
    addActivity(userId, {
      type: 'error',
      message: `🚨 EMERGENCY STOP — CLOSE ALL signal sent to MT5 EA. Engine halted. All positions will be closed by the EA.`,
    });
  }

  queueCloseAllSignal(userId, 'Emergency stop triggered from dashboard');
  return state || null;
}

function checkDailyLossLimit(userId: number): void {
  const state = engineStates[userId];
  if (!state || state.dailyLossHalted) return;
  const limit = state.config.dailyLossLimit;
  if (!limit || limit <= 0) return;
  const balance = state.config.accountBalance;
  if (!balance || balance <= 0) return;
  const lossPct = (state.pnlToday / balance) * 100;
  if (lossPct <= -limit) {
    addActivity(userId, {
      type: 'error',
      message: `🚨 DAILY LOSS LIMIT HIT — ${Math.abs(lossPct).toFixed(2)}% loss today exceeds ${limit}% limit. Sending CLOSE_ALL to MT5 and halting engine.`,
    });
    emergencyStopEngine(userId);
  }
}

export function stopLiveEngine(userId: number): EngineState | null {
  if (engineIntervals[userId]) {
    clearInterval(engineIntervals[userId]);
    delete engineIntervals[userId];
  }
  if (engineTimers[userId]) {
    clearTimeout(engineTimers[userId]);
    delete engineTimers[userId];
  }
  if (brainLearningIntervals[userId]) {
    clearInterval(brainLearningIntervals[userId]);
    delete brainLearningIntervals[userId];
  }

  const state = engineStates[userId];
  if (state) {
    state.status = 'stopped';
    addActivity(userId, {
      type: 'info',
      message: `Live Engine STOPPED | Scans: ${state.scanCount} | Signals: ${state.signalsGenerated} | Trades: ${state.tradesExecuted} | Failed: ${state.tradesFailed}`,
    });
  }

  return state || null;
}

export function getLiveEngineState(userId: number): EngineState | null {
  return engineStates[userId] || null;
}

export function getLiveEngineActivity(userId: number, limit: number = 50): LiveActivity[] {
  const state = engineStates[userId];
  if (!state) return [];
  return state.activityLog.slice(0, limit);
}

export function updateLiveEngineConfig(userId: number, updates: Partial<LiveEngineConfig>): EngineState | null {
  const state = engineStates[userId];
  if (!state) return null;

  Object.assign(state.config, updates);

  if (updates.scanIntervalMs && engineIntervals[userId]) {
    clearInterval(engineIntervals[userId]);
    engineIntervals[userId] = setInterval(() => scanMarkets(userId), state.config.scanIntervalMs);
  }

  addActivity(userId, {
    type: 'info',
    message: `Engine config updated: ${Object.keys(updates).join(', ')}`,
  });

  return state;
}

export function getPendingMT5Signals(userId: number, accountAlias: string = 'default'): PendingMT5Signal[] {
  const queues = mt5AccountQueues[userId];
  if (!queues) return [];
  // If the requested alias doesn't exist but 'default' does (legacy), fall back
  const alias = queues[accountAlias] ? accountAlias : (queues['default'] ? 'default' : null);
  if (!alias) return [];
  const now = Date.now();
  queues[alias].forEach(s => {
    if (s.status === 'pending' && now - new Date(s.timestamp).getTime() > 5 * 60 * 1000) {
      s.status = 'expired';
    }
  });
  return queues[alias].filter(s => s.status === 'pending');
}

export function confirmMT5Signal(
  userId: number,
  signalId: string,
  executed: boolean,
  accountAlias: string = 'default'
): PendingMT5Signal | null {
  const queues = mt5AccountQueues[userId];
  if (!queues) return null;
  // Search in the provided alias first, then fall back across all aliases
  const alias = queues[accountAlias] ? accountAlias : 'default';
  const queue = queues[alias];
  if (!queue) return null;
  const signal = queue.find(s => s.id === signalId);
  if (!signal) {
    // Cross-alias fallback (signal id may not include alias suffix)
    for (const q of Object.values(queues)) {
      const found = q.find(s => s.id === signalId);
      if (found) {
        found.status = executed ? 'executed' : 'rejected';
        _postConfirmActivity(userId, found, executed);
        return found;
      }
    }
    return null;
  }
  signal.status = executed ? 'executed' : 'rejected';
  _postConfirmActivity(userId, signal, executed);
  return signal;
}

function _postConfirmActivity(userId: number, signal: PendingMT5Signal, executed: boolean): void {
  addActivity(userId, {
    type: executed ? 'trade_open' : 'info',
    symbol: signal.symbol,
    direction: signal.direction,
    confidence: signal.confidence,
    message: executed
      ? `MT5 EXECUTED: ${signal.direction} ${signal.symbol} via Combined EA`
      : `MT5 signal rejected by EA: ${signal.symbol}`,
  });
  if (executed) {
    const state = engineStates[userId];
    if (state) {
      state.tradesExecuted++;
      state.openPositionCount++;
    }
  }
}

export function getAllMT5Signals(userId: number, limit: number = 50): PendingMT5Signal[] {
  const queues = mt5AccountQueues[userId];
  if (!queues) return [];
  // Merge all alias queues, deduplicate by id, sort by timestamp desc
  const all: PendingMT5Signal[] = [];
  const seen = new Set<string>();
  for (const q of Object.values(queues)) {
    for (const s of q) {
      if (!seen.has(s.id)) {
        seen.add(s.id);
        all.push(s);
      }
    }
  }
  all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  return all.slice(0, limit);
}

export function setModelLock(userId: number, locked: boolean): boolean {
  const state = engineStates[userId];
  if (!state) return false;
  state.modelLocked = locked;
  if (locked) {
    addActivity(userId, {
      type: 'info',
      message: 'AI model locked until all open positions are closed. Switch will apply automatically when flat.',
    });
  }
  return true;
}

export function getModelLockStatus(userId: number): { locked: boolean; openPositions: number } {
  const state = engineStates[userId];
  if (!state) return { locked: false, openPositions: 0 };
  return { locked: state.modelLocked, openPositions: state.openPositionCount };
}
