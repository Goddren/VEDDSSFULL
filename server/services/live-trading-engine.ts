import { marketDataService } from '../market-data/service';
import { executeMT5SignalOnTradeLocker } from '../tradelocker';
import { computeAllAdvancedIndicators, type CandleData } from '../indicators';
import { storage } from '../storage';
import { newsService } from '../news-service';

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
  trailMethod: 'staged_volume' | 'chandelier' | 'r_multiple' | 'swing_structure' | 'parabolic_sar';
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
  drawdownShieldThreshold: number;
  // Safety
  dailyLossLimit: number;
  // AI cost control
  aiMode: 'full' | 'economy' | 'rule_based';
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

const pendingMT5Signals: Record<number, PendingMT5Signal[]> = {};

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
  tradesFailed: number;
  positionsManaged: number;
  lastScanAt: string | null;
  lastSignalAt: string | null;
  currentlyScanning: boolean;
  activityLog: LiveActivity[];
  openPositionCount: number;
  pnlSession: number;
  marketSnapshot: Record<string, { price: number; change: number; trend: string; rsi: number; atr: number; updatedAt: string }>;
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
}

const engineStates: Record<number, EngineState> = {};
const engineIntervals: Record<number, ReturnType<typeof setInterval>> = {};
const engineTimers: Record<number, ReturnType<typeof setTimeout>> = {};
const brainLearningIntervals: Record<number, ReturnType<typeof setInterval>> = {};

async function autoRetainBrain(userId: number): Promise<void> {
  try {
    const fn = (global as any).runBrainLearning;
    if (typeof fn !== 'function') return;
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
  if (sessionData && sessionData.total >= 3 && sessionData.winRate < 40) {
    const msg = `🧠 Brain block: ${symbol} ${session} session only ${sessionData.winRate}% WR (${sessionData.total} trades) — skipping`;
    pushEnforcementLog(userId, { symbol, rule: 'session_block', direction: proposedDirection, reason: msg });
    return { ...passthrough, allowed: false, reason: msg };
  }

  // ── RULE 2: Hour block ────────────────────────────────────────────────
  const worstHourData = k.worstHours?.find((h: any) => h.hour === hour && h.total >= 3 && h.winRate < 35);
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
    const TWO_HOURS = 2 * 60 * 60 * 1000;
    if (msSinceLoss < TWO_HOURS) {
      const minsLeft = Math.ceil((TWO_HOURS - msSinceLoss) / 60000);
      const msg = `🧠 Cooldown: ${symbol} — 3 consecutive losses, cooling for ${minsLeft} more min`;
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
    minConfidence: 65,
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
    drawdownShieldThreshold: 3,
    dailyLossLimit: 5,
    aiMode: 'full',
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
  if (tracker.consecutiveWins >= 5) mult = 2.0;
  else if (tracker.consecutiveWins >= 3) mult = 1.5;
  else if (tracker.consecutiveWins >= 2) mult = 1.25;
  if (tracker.consecutiveLosses >= 3) mult = 0.5;
  else if (tracker.consecutiveLosses >= 2) mult = 0.75;
  if (tracker.progressPercent >= 80) mult *= 0.8;
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
  state.pnlToday = Math.round((state.pnlToday + result.profit) * 100) / 100;
  checkDailyLossLimit(userId);

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

  // ── Auto-retrain brain every 5 trade results ───────────────────────
  state.tradesSinceLastLearn = (state.tradesSinceLastLearn || 0) + 1;
  if (state.tradesSinceLastLearn >= 5) {
    state.tradesSinceLastLearn = 0;
    autoRetainBrain(userId).then(() => {
      addActivity(userId, { type: 'info', message: '🧠 Brain updated after 5 new trade results' });
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

        const candles = convertToCandles(result.bars);
        const indicators = computeAllAdvancedIndicators(candles, 0, symbol, 'M15');

        const currentPrice = result.bars[result.bars.length - 1]?.close || 0;
        const prevPrice = result.bars[result.bars.length - 2]?.close || currentPrice;
        const change = prevPrice > 0 ? ((currentPrice - prevPrice) / prevPrice) * 100 : 0;

        let trend = 'NEUTRAL';
        const adxData = indicators.adx as any;
        if (adxData && (adxData.adx || adxData.value) > 25) {
          trend = adxData.plusDI > adxData.minusDI ? 'BULLISH' : 'BEARISH';
        }

        const rsi = indicators.stochastic?.k || 50;
        const atr = indicators.volatilityContext?.currentATR || 0;

        const volumeMetrics = computeVolumeMetrics(result.bars);

        state.marketSnapshot[symbol] = {
          price: currentPrice,
          change: Math.round(change * 100) / 100,
          trend,
          rsi: Math.round(rsi),
          atr: Math.round(atr * 100000) / 100000,
          updatedAt: new Date().toISOString(),
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

        marketAnalysis[symbol] = {
          currentPrice,
          change,
          trend,
          adx: indicators.adx,
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
        };

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
    // Schedule an extra triggered scan in 12 seconds if triggers fired
    if (triggerPairs.length > 0 && !state.currentlyScanning) {
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

    await runAILiveAnalysis(userId, marketAnalysis, brain, newsContext, crossAssets, triggerPairs);

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

function computeRMultipleSL(position: any): number {
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
): number {
  const price = position.currentPrice;
  if (!price) return position.sl || 0;
  const bullish = position.direction === 'BUY';

  if (!trailState.sar) {
    trailState.sar = position.openPrice || price;
    trailState.ep = price;
    trailState.af = 0.02;
    trailState.bullish = bullish;
    return position.sl || 0;
  }

  if (bullish && price > trailState.ep) {
    trailState.ep = price;
    trailState.af = Math.min(0.20, trailState.af + 0.02);
  } else if (!bullish && price < trailState.ep) {
    trailState.ep = price;
    trailState.af = Math.min(0.20, trailState.af + 0.02);
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
};

async function applyServerSideTrails(
  userId: number,
  openPositions: any[],
  marketAnalysis: Record<string, any>,
): Promise<void> {
  const state = engineStates[userId];
  if (!state) return;
  const config = state.config;
  if (!config.trailingStopEnabled || config.trailMethod === 'staged_volume') return;
  if (openPositions.length === 0) return;

  if (!state.positionTrailState) state.positionTrailState = {};

  const methodLabel = TRAIL_METHOD_LABELS[config.trailMethod] || config.trailMethod;

  for (const pos of openPositions) {
    const key = String(pos.ticket || pos.id || pos.symbol);
    if (!state.positionTrailState[key]) {
      state.positionTrailState[key] = {
        highestHigh: pos.currentPrice || pos.openPrice,
        lowestLow: pos.currentPrice || pos.openPrice,
        sar: pos.openPrice || pos.currentPrice,
        ep: pos.currentPrice || pos.openPrice,
        af: 0.02,
        bullish: pos.direction === 'BUY',
      };
    }
    const ts = state.positionTrailState[key];

    const symData = marketAnalysis[pos.symbol?.replace('/', '')] || marketAnalysis[pos.symbol] || {};
    const atr = symData.atr?.value ?? symData.atr ?? 0;
    const multiplier = config.trailingStopATRMultiplier || 3.0;

    let newSL = 0;
    switch (config.trailMethod) {
      case 'chandelier':
        newSL = computeChandelierSL(pos, atr, multiplier, ts);
        break;
      case 'r_multiple':
        newSL = computeRMultipleSL(pos);
        break;
      case 'swing_structure':
        newSL = computeSwingStructureSL(pos, symData);
        break;
      case 'parabolic_sar':
        newSL = computeParabolicSAR(pos, ts);
        break;
    }

    if (newSL <= 0) continue;

    const currentSL = pos.sl || 0;
    const isBuy = pos.direction === 'BUY';
    const improved = isBuy ? newSL > currentSL : (currentSL === 0 || newSL < currentSL);
    if (!improved) continue;

    if (!pendingMT5Signals[userId]) pendingMT5Signals[userId] = [];
    pendingMT5Signals[userId].push({
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
  }
}

// ── Rule-Based Signal Generator (zero API cost) ─────────────────────────────
function generateRuleBasedSignals(indicators: Record<string, any>, config: LiveEngineConfig, symbol: string): any {
  let bull = 0;
  let bear = 0;
  const votes: string[] = [];

  const rsi = indicators.rsi?.value ?? indicators.stochastic?.k ?? 50;
  if (rsi < 35) { bull++; votes.push(`RSI oversold (${rsi.toFixed(1)})`); }
  else if (rsi > 65) { bear++; votes.push(`RSI overbought (${rsi.toFixed(1)})`); }

  const stochK = indicators.stochastic?.k ?? 50;
  if (stochK < 25) { bull++; votes.push(`Stoch K oversold (${stochK.toFixed(1)})`); }
  else if (stochK > 75) { bear++; votes.push(`Stoch K overbought (${stochK.toFixed(1)})`); }

  const macdHist = indicators.macd?.histogram ?? 0;
  if (macdHist > 0) { bull++; votes.push('MACD histogram positive'); }
  else if (macdHist < 0) { bear++; votes.push('MACD histogram negative'); }

  const adxVal = indicators.adx?.adx ?? indicators.adx?.value ?? 0;
  const trend = indicators.trend ?? 'NEUTRAL';
  if (adxVal > 25 && trend === 'BULLISH') { bull++; votes.push(`ADX ${adxVal.toFixed(1)} + bullish trend`); }
  else if (adxVal > 25 && trend === 'BEARISH') { bear++; votes.push(`ADX ${adxVal.toFixed(1)} + bearish trend`); }

  const vwapDev = indicators.vwap?.deviationPercent ?? 0;
  if (vwapDev < -0.10) { bull++; votes.push(`Price below VWAP (${vwapDev.toFixed(2)}%)`); }
  else if (vwapDev > 0.10) { bear++; votes.push(`Price above VWAP (+${vwapDev.toFixed(2)}%)`); }

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

  if (bull < 3 && bear < 3) {
    return { newTrades: [], positionUpdates: [], marketOverview: `Rule-based (${symbol}): insufficient confluence — bull=${bull} bear=${bear}`, nextScanFocus: 'Waiting for indicator alignment' };
  }

  const direction = bull >= bear ? 'BUY' : 'SELL';
  const winningScore = Math.max(bull, bear);
  const confidence = Math.round((winningScore / 7) * 100);

  const entry = currentPrice;
  const sl = direction === 'BUY' ? entry - (atr * 1.5) : entry + (atr * 1.5);
  const tp = direction === 'BUY' ? entry + (atr * 2.5) : entry - (atr * 2.5);

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
    holdTime: '15min',
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
function countIndicatorAlignment(data: any): { bull: number; bear: number } {
  let bull = 0;
  let bear = 0;

  const rsi = data.rsi?.value ?? data.stochastic?.k ?? 50;
  if (rsi < 38) bull++; else if (rsi > 62) bear++;

  const stochK = data.stochastic?.k ?? 50;
  if (stochK < 28) bull++; else if (stochK > 72) bear++;

  const macdHist = data.macd?.histogram ?? 0;
  if (macdHist > 0) bull++; else if (macdHist < 0) bear++;

  const adxVal = data.adx?.adx ?? data.adx?.value ?? 0;
  const trend = data.trend ?? 'NEUTRAL';
  if (adxVal > 22 && trend === 'BULLISH') bull++;
  else if (adxVal > 22 && trend === 'BEARISH') bear++;

  const vwapDev = data.vwap?.deviationPercent ?? 0;
  if (vwapDev < -0.08) bull++; else if (vwapDev > 0.08) bear++;

  const obvTrend = data.obv?.trend ?? '';
  if (obvTrend === 'up') bull++; else if (obvTrend === 'down') bear++;

  return { bull, bear };
}

async function runAILiveAnalysis(userId: number, marketAnalysis: Record<string, any>, brain: any, newsContext?: NewsContext, crossAssets?: Record<string, any>, triggerAlerts?: string[]): Promise<void> {
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
  {
    const filteredAnalysis: Record<string, any> = {};
    for (const [sym, data] of Object.entries(marketAnalysis) as [string, any][]) {
      const { bull, bear } = countIndicatorAlignment(data);
      if (bull >= 3 || bear >= 3) {
        filteredAnalysis[sym] = data;
      } else {
        addActivity(userId, { type: 'info', symbol: sym, message: `⚡ Pre-filter: weak alignment on ${sym} (bull=${bull} bear=${bear}) — API call skipped` });
      }
    }
    if (Object.keys(filteredAnalysis).length === 0) {
      addActivity(userId, { type: 'info', message: 'Pre-filter: no pairs with sufficient alignment this cycle — AI call skipped entirely' });
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
      return `${sym}: Price=${data.currentPrice}, Trend=${data.trend}, ADX=${data.adx?.adx?.toFixed(1) || 'N/A'}, RSI=${data.rsi?.value?.toFixed(1) || 'N/A'}, Stoch K=${data.stochastic?.k?.toFixed(1) || 'N/A'} D=${data.stochastic?.d?.toFixed(1) || 'N/A'}, VWAP=${vwapVal?.toFixed(5) || 'N/A'} (Dev${vwapDev}%), OBV Trend=${data.obv?.trend || 'N/A'}, Patterns=[${(data.candlePatterns || []).join(',')}], Session=${data.sessionContext?.currentSession || 'N/A'}, Volatility=${vol?.percentile?.toFixed(0) || 'N/A'}%, Support=${sr?.supports?.[0]?.toFixed(5) || 'N/A'}, Resistance=${sr?.resistances?.[0]?.toFixed(5) || 'N/A'}, Fib 38.2%=${fib?.retracementLevels?.['38.2']?.toFixed(5) || 'N/A'}, Volume=${vm ? `RelVol=${vm.relativeVolume}x (${vm.volumeTrend}), Spikes=${vm.volumeSpikes}` : 'N/A'}${asiaRangeStr}`;
    }).join('\n');

    const openPosStr = openPositions.length > 0
      ? openPositions.map((p: any) => {
          const pips = p.direction === 'BUY' 
            ? (p.currentPrice - p.openPrice) * (p.symbol.includes('JPY') ? 100 : 10000)
            : (p.openPrice - p.currentPrice) * (p.symbol.includes('JPY') ? 100 : 10000);
          const ticketId = p.ticket ?? p.id ?? 'unknown';
          const slInfo = p.sl > 0 ? p.sl : 'none';
          const tpInfo = p.tp > 0 ? p.tp : 'none';
          const beThreshold = p.symbol.includes('JPY') ? 15 : 15;
          const trailThreshold = p.symbol.includes('JPY') ? 40 : 40;
          const mgmtHint = pips >= trailThreshold ? '→ TRAIL STOP (staged: 25-pip trail if vol surging/above_avg, 20-pip if avg, 15-pip if below_avg/dry)' : pips >= beThreshold ? '→ MOVE TO BREAKEVEN ONLY — not ready to trail yet' : pips < -5 ? '→ REVIEW SL' : '';
          return `${p.symbol} (ticket:${ticketId}): ${p.direction} @ ${p.openPrice} | Curr: ${p.currentPrice} | Pips: ${pips.toFixed(1)} | PnL: $${p.profit} | SL: ${slInfo} | TP: ${tpInfo} | Vol: ${p.volume} ${mgmtHint}`;
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
${tracker.currentPhase === 'warming_up' ? '- PHASE INSTRUCTIONS: Start conservative. Take only high-confidence setups (80%+). Build momentum with small wins. Use minimum lot sizes.' : ''}
${tracker.currentPhase === 'building' ? '- PHASE INSTRUCTIONS: Good progress. Use base lots. Mix scalping for quick wins with momentum for bigger moves. Aim for 3-5 trades/session.' : ''}
${tracker.currentPhase === 'accelerating' ? '- PHASE INSTRUCTIONS: 25%+ done. INCREASE frequency - use all strategies. Scale lot sizes up with compound multiplier. Target 5-8 trades/session.' : ''}
${tracker.currentPhase === 'cruising' ? '- PHASE INSTRUCTIONS: Halfway there. Maintain pace. Balance risk - dont blow gains. Use the compound multiplier but cap exposure.' : ''}
${tracker.currentPhase === 'pushing' ? '- PHASE INSTRUCTIONS: 80%+ done! Almost there. REDUCE risk now - smaller lots, only A+ setups. Protect gains. Avoid revenge trading.' : ''}
${tracker.currentPhase === 'target_reached' ? '- PHASE INSTRUCTIONS: TARGET HIT! Switch to PRESERVATION mode. Only take ultra-high confidence sniper setups. Minimum lot sizes. Protect the bag.' : ''}

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

    const prompt = `You are VEDD SS AI LIVE TRADING ENGINE - operating in REAL-TIME autonomous HIGH-FREQUENCY mode. You are directly monitoring live market data and making INSTANT trading decisions to hit a weekly profit goal.
${triggerSection}${crossAssetSection}
LIVE MARKET DATA (just fetched):
${marketSummary}

CURRENT OPEN POSITIONS (${currentOpenCount}/${config.maxOpenTrades} max):
${openPosStr}

BRAIN KNOWLEDGE (from historical learning):
${brainInsights}

PAIR-SPECIFIC KNOWLEDGE:
${pairKnowledge}
${weightsSection}${shieldSection}${dualModeSection}${goalSection}
REAL-TIME NEWS & MARKET SENTIMENT:
${newsContext && newsContext.headlines.length > 0 ? `Market Sentiment: ${newsContext.marketSentiment.toUpperCase()}
Recent Headlines:
${newsContext.headlines.map(h => `- ${h}`).join('\n')}` : 'No live news data available - trade based on technicals only'}

ECONOMIC CALENDAR (upcoming events affecting your pairs):
${newsContext && newsContext.economicEvents.length > 0 ? newsContext.economicEvents.join('\n') : 'No major events detected'}
${newsContext?.highImpactSoon ? `\n*** WARNING: ${newsContext.tradingWindowWarning} ***` : ''}

NEWS-AWARE TRADING RULES:
- BEFORE high-impact news (NFP, CPI, FOMC, rate decisions): AVOID opening new positions on affected currency pairs within 30 min of the event. Widen stops on existing positions or close them
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
- ACTIVE TRAIL STRATEGY: ${TRAIL_METHOD_LABELS[config.trailMethod || 'staged_volume']}${config.trailMethod && config.trailMethod !== 'staged_volume' ? ' — the server is computing and applying trail SL updates automatically each scan cycle. Your position management role is PARTIAL_CLOSE and FULL_CLOSE decisions only — do NOT output trail_stop modify actions for open positions when a server-side trail method is active.' : ''}
${!config.trailMethod || config.trailMethod === 'staged_volume' ? `- TRAILING (STAGED + VOLUME-ADJUSTED — never trail too early, it kills winners):
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
- NEVER use trail distance less than 8 pips — anything tighter gets hit by normal spread and noise.` : '- Trail SL management is handled server-side. Focus on: move to breakeven at 15+ pips, partial close at TP1, close if setup invalidated.'}
- PARTIAL CLOSE: Take 50% at TP1, then let the runner continue with the active trail method.
- CLOSE LOSERS EARLY: If a trade is stagnant for 30+ minutes or price action invalidates the setup, CLOSE it immediately. Don't hope.
- SCALE OUT: If volatility spikes against you, exit 50% early to reduce exposure.
- MAXIMIZE VELOCITY: If you see a better setup on another pair but are at max trades, close the weakest performer to take the high-conviction one.

CONTEXT:
- Time: ${now.toISOString()} | Session: ${session} | Day: ${day}
- Strategy: ${config.strategyMode.toUpperCase()} | Min Confidence: ${config.minConfidence}%
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

SCALPING (3-8 pip targets, high frequency - PRIMARY for quick profit accumulation):
- Trade micro-moves on 1min/5min momentum bursts - THIS IS YOUR BREAD AND BUTTER
- Look for RSI divergence + Stochastic crossovers in overbought/oversold zones
- Quick entries on VWAP bounces - price touching VWAP and reversing with volume confirmation
- Tight stops (5-10 pips), fast targets (3-8 pips), high win rate focus
- Best during high-volume sessions (London, NY overlap)
- GOAL: Stack small wins rapidly. 5-10+ scalps per session to compound gains

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
      "holdTime": "5min|15min|1hr|4hr",
      "positionId": "for modify/close actions",
      "modifyAction": "trail_stop|move_sl|partial_close|full_close",
      "newStopLoss": number,
      "urgency": "IMMEDIATE" | "WAIT_FOR_PULLBACK" | "MONITORING",
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

      if (cached && cacheAge < 120000 && pipMove < 5) {
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

    if (confidence < config.minConfidence) {
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence,
        message: `Signal skipped (${confidence}% < ${config.minConfidence}% min): ${decision.reason}`,
      });
      state.signalsGenerated++;
      return;
    }

    const isSmallAcct = config.accountBalance > 0 && config.accountBalance < 500;
    const effectiveMaxTrades = isSmallAcct ? Math.min(config.maxOpenTrades, 3) : config.maxOpenTrades;
    const effectiveMinConf = isSmallAcct ? Math.max(config.minConfidence, 75) : config.minConfidence;

    if (isSmallAcct && confidence < effectiveMinConf) {
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence,
        message: `Small account protection: skipped (${confidence}% < ${effectiveMinConf}% required for accounts under $500)`,
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

    const existingSignals = pendingMT5Signals[userId] || [];
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
      confidence,
      message: `LIVE SIGNAL [${(decision.strategy || 'auto').toUpperCase()}]: ${decision.direction} ${decision.symbol} @ ${confidence}% confidence`,
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

    const entryPrice = parseNum(decision.entryPrice);
    const stopLoss = parseNum(decision.stopLoss);
    const takeProfit = parseNum(decision.takeProfit);
    const rawLotBase = parseNum(decision.lotSize) || config.baseLotSize || 0.01;
    // Apply brain-tuned lot multiplier (Kelly-based, clamped 0.5–1.5)
    const brainMult = (decision as any)._brainLotMultiplier || 1.0;
    const rawLotSize = Math.round(rawLotBase * brainMult * 100) / 100;
    const isSmallAccount = config.accountBalance > 0 && config.accountBalance < 500;
    const safeMaxLot = isSmallAccount
      ? Math.min(0.02, config.maxLotSize || 0.10)
      : (config.maxLotSize || 0.10);

    // ── Drawdown Shield Lot Override ──────────────────────────────────
    if (state.drawdownShieldActive && config.accountBalance > 0) {
      const shieldLot = Math.max(0.01, Math.round(config.accountBalance * 0.0025 / 1000 * 100) / 100);
      const shieldFinal = Math.min(shieldLot, safeMaxLot);
      if (!pendingMT5Signals[userId]) pendingMT5Signals[userId] = [];
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
        confidence,
        reason: `[SHIELD MODE] ${decision.reason || ''}`,
        holdTime: decision.holdTime || '',
        strategy: decision.strategy || 'sniper',
        confluences: decision.confluences || [],
        status: 'pending',
      };
      pendingMT5Signals[userId].push(mt5SigShield);
      state.signalsGenerated++;
      addActivity(userId, {
        type: 'signal',
        symbol: decision.symbol,
        direction: decision.direction,
        confidence,
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
    const lotSize = Math.max(0.01, Math.min(compoundedLot, safeMaxLot));

    if (!pendingMT5Signals[userId]) pendingMT5Signals[userId] = [];
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
      confidence,
      reason: decision.reason || '',
      holdTime: decision.holdTime || '',
      strategy: decision.strategy || 'auto',
      confluences: decision.confluences || [],
      status: 'pending',
    };
    pendingMT5Signals[userId].push(mt5Signal);
    if (pendingMT5Signals[userId].length > 200) {
      pendingMT5Signals[userId] = pendingMT5Signals[userId].slice(-100);
    }

    const tlConnection = await storage.getUserTradelockerConnection(userId);
    if (!tlConnection || !tlConnection.isActive) {
      addActivity(userId, { type: 'info', symbol: decision.symbol, message: 'TradeLocker not connected. Signal queued for MT5 EA pickup.' });
      return;
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
        confidence,
        source: 'vedd_live_engine',
      });

      const tradeResult = await executeMT5SignalOnTradeLocker(tlConnection, {
        action: 'OPEN',
        symbol: decision.symbol,
        direction: decision.direction,
        volume: lotSize,
        entryPrice,
        stopLoss,
        takeProfit,
      });

      await storage.createTradelockerTradeLog({
        connectionId: tlConnection.id,
        userId,
        sourceSignalId: signalLog.id,
        action: 'OPEN',
        symbol: decision.symbol,
        direction: decision.direction,
        volume: lotSize,
        entryPrice,
        stopLoss,
        takeProfit,
        tradelockerOrderId: tradeResult.orderId || null,
        status: tradeResult.success ? 'executed' : 'failed',
        errorMessage: tradeResult.error || null,
      });

      if (tradeResult.success) {
        state.tradesExecuted++;
        state.openPositionCount++;
        addActivity(userId, {
          type: 'trade_open',
          symbol: decision.symbol,
          direction: decision.direction,
          confidence,
          message: `TRADE EXECUTED via TradeLocker: ${decision.direction} ${decision.symbol} | Lot: ${lotSize} | SL: ${stopLoss || 'N/A'} | TP: ${takeProfit || 'N/A'} | Order: ${tradeResult.orderId}`,
          details: { orderId: tradeResult.orderId, lotSize, stopLoss, takeProfit, confluences: decision.confluences },
        });
      } else {
        state.tradesFailed++;
        addActivity(userId, {
          type: 'error',
          symbol: decision.symbol,
          message: `TradeLocker execution failed: ${decision.direction} ${decision.symbol} - ${tradeResult.error}. Signal still available for MT5 EA.`,
        });
      }
    } catch (err: any) {
      state.tradesFailed++;
      addActivity(userId, { type: 'error', symbol: decision.symbol, message: `Execution error: ${err.message}. Signal still available for MT5 EA.` });
    }
  }

  if (decision.action === 'MODIFY_POSITION' || decision.action === 'CLOSE_POSITION') {
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
    if (!pendingMT5Signals[userId]) pendingMT5Signals[userId] = [];

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
    pendingMT5Signals[userId].push(mgmtSignal);

    // Then try TradeLocker if connected
    const tlConnection = await storage.getUserTradelockerConnection(userId);
    if (tlConnection && tlConnection.isActive) {
      try {
        if (signalAction === 'CLOSE') {
          const tradeResult = await executeMT5SignalOnTradeLocker(tlConnection, {
            action: 'CLOSE',
            symbol: decision.symbol,
            direction: decision.direction || 'BUY',
            volume: partialVolume || 0,
            positionId: decision.positionId,
          });
          if (tradeResult.success) {
            addActivity(userId, { type: 'trade_close', symbol: decision.symbol, message: `Position CLOSED via TradeLocker: ${decision.symbol} - ${decision.reason}` });
          }
        } else if (signalAction === 'MODIFY') {
          const tradeResult = await executeMT5SignalOnTradeLocker(tlConnection, {
            action: 'MODIFY',
            symbol: decision.symbol,
            direction: decision.direction || 'BUY',
            volume: 0,
            stopLoss: newSL,
            takeProfit: newTP,
            positionId: decision.positionId,
          });
          if (tradeResult.success) {
            addActivity(userId, { type: 'position_update', symbol: decision.symbol, message: `Position MODIFIED via TradeLocker: ${decision.symbol} | New SL: ${newSL || 'N/A'} | New TP: ${newTP || 'N/A'}` });
          }
        }
      } catch (err: any) {
        addActivity(userId, { type: 'error', symbol: decision.symbol, message: `Position management execution error: ${err.message}. Signal queued for MT5 EA.` });
      }
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
      const slPips = isGold ? 300 : isJPY ? 20 : 0.0020;
      const sl = direction === 'BUY' ? sundayOpen - slPips : sundayOpen + slPips;
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

  // Kick off first scan in 2 seconds, then self-schedule
  setTimeout(() => {
    scanMarkets(userId).then(() => scheduleScan(userId));
  }, 2000);

  // Schedule Sunday gap scanner
  scheduleGapScanner(userId);

  // Auto-train brain immediately on engine start, then every 30 minutes
  autoRetainBrain(userId);
  if (brainLearningIntervals[userId]) clearInterval(brainLearningIntervals[userId]);
  brainLearningIntervals[userId] = setInterval(() => autoRetainBrain(userId), 30 * 60 * 1000);

  console.log(`[VEDD Live Engine] Started for user ${userId} | Strategy: ${fullConfig.strategyMode} | Interval: ${intervalDisplay}`);

  return engineStates[userId];
}

function queueCloseAllSignal(userId: number, reason: string): void {
  if (!pendingMT5Signals[userId]) pendingMT5Signals[userId] = [];
  const signal: PendingMT5Signal = {
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
  };
  pendingMT5Signals[userId].push(signal);
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

export function getPendingMT5Signals(userId: number): PendingMT5Signal[] {
  if (!pendingMT5Signals[userId]) return [];
  const now = Date.now();
  pendingMT5Signals[userId].forEach(s => {
    if (s.status === 'pending' && now - new Date(s.timestamp).getTime() > 5 * 60 * 1000) {
      s.status = 'expired';
    }
  });
  return pendingMT5Signals[userId].filter(s => s.status === 'pending');
}

export function confirmMT5Signal(userId: number, signalId: string, executed: boolean): PendingMT5Signal | null {
  if (!pendingMT5Signals[userId]) return null;
  const signal = pendingMT5Signals[userId].find(s => s.id === signalId);
  if (!signal) return null;
  signal.status = executed ? 'executed' : 'rejected';
  addActivity(userId, {
    type: executed ? 'trade_open' : 'info',
    symbol: signal.symbol,
    direction: signal.direction,
    confidence: signal.confidence,
    message: executed
      ? `MT5 EXECUTED: ${signal.direction} ${signal.symbol} via Signal Receiver EA`
      : `MT5 signal rejected by EA: ${signal.symbol}`,
  });
  if (executed) {
    const state = engineStates[userId];
    if (state) {
      state.tradesExecuted++;
      state.openPositionCount++;
    }
  }
  return signal;
}

export function getAllMT5Signals(userId: number, limit: number = 50): PendingMT5Signal[] {
  if (!pendingMT5Signals[userId]) return [];
  return pendingMT5Signals[userId].slice(-limit).reverse();
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
