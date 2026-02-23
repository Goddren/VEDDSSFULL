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
  weeklyProfitTarget: number;
  accountBalance: number;
  enableCompounding: boolean;
  baseLotSize: number;
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
  action: 'OPEN' | 'CLOSE' | 'MODIFY';
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
  compoundMultiplier: number;
  currentPhase: 'warming_up' | 'building' | 'accelerating' | 'cruising' | 'pushing' | 'target_reached';
  phasePlan: string;
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
}

const engineStates: Record<number, EngineState> = {};
const engineIntervals: Record<number, ReturnType<typeof setInterval>> = {};

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
    weeklyProfitTarget: 0,
    accountBalance: 0,
    enableCompounding: true,
    baseLotSize: 0.01,
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
    compoundMultiplier: 1.0,
    currentPhase: 'warming_up',
    phasePlan: '',
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

  tracker.compoundMultiplier = getCompoundMultiplier(tracker, state.config.enableCompounding);
  tracker.currentPhase = getGoalPhase(tracker);

  if (tracker.currentPhase === 'target_reached') {
    addActivity(userId, {
      type: 'info',
      message: `WEEKLY TARGET REACHED! $${tracker.currentProfit} profit achieved (target: $${tracker.weeklyTarget}). Switching to capital preservation mode.`,
    });
  }

  state.pnlSession = tracker.currentProfit;
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

    await runAILiveAnalysis(userId, marketAnalysis, brain, newsContext);

  } catch (err: any) {
    addActivity(userId, { type: 'error', message: `Scan cycle error: ${err.message}` });
  } finally {
    state.currentlyScanning = false;
  }
}

async function runAILiveAnalysis(userId: number, marketAnalysis: Record<string, any>, brain: any, newsContext?: NewsContext): Promise<void> {
  const state = engineStates[userId];
  if (!state) return;

  try {
    const { getOpenAIInstanceForUser, getUserModelPreference } = await import('../openai');
    let openai: any, model: string;
    try {
      openai = await getOpenAIInstanceForUser(userId);
      model = getUserModelPreference(userId);
    } catch {
      addActivity(userId, { type: 'error', message: 'No AI API key configured. Cannot analyze.' });
      return;
    }

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

    const marketSummary = Object.entries(marketAnalysis).map(([sym, data]: [string, any]) => {
      const sr = data.supportResistance;
      const fib = data.fibonacci;
      const vol = data.volatilityContext;
      const vm = data.volumeMetrics as VolumeMetrics | undefined;
      return `${sym}: Price=${data.currentPrice}, Trend=${data.trend}, ADX=${data.adx?.adx?.toFixed(1) || 'N/A'}, Stoch K=${data.stochastic?.k?.toFixed(1) || 'N/A'} D=${data.stochastic?.d?.toFixed(1) || 'N/A'}, VWAP=${data.vwap?.value?.toFixed(5) || 'N/A'}, OBV Trend=${data.obv?.trend || 'N/A'}, Patterns=[${(data.candlePatterns || []).join(',')}], Session=${data.sessionContext?.currentSession || 'N/A'}, Volatility=${vol?.percentile?.toFixed(0) || 'N/A'}%, Support=${sr?.supports?.[0]?.toFixed(5) || 'N/A'}, Resistance=${sr?.resistances?.[0]?.toFixed(5) || 'N/A'}, Fib 38.2%=${fib?.retracementLevels?.['38.2']?.toFixed(5) || 'N/A'}, Volume=${vm ? `RelVol=${vm.relativeVolume}x (${vm.volumeTrend}), Spikes=${vm.volumeSpikes}` : 'N/A'}`;
    }).join('\n');

    const openPosStr = openPositions.length > 0
      ? openPositions.map((p: any) => {
          const pips = p.direction === 'BUY' 
            ? (p.currentPrice - p.openPrice) * (p.symbol.includes('JPY') ? 100 : 10000)
            : (p.openPrice - p.currentPrice) * (p.symbol.includes('JPY') ? 100 : 10000);
          return `${p.symbol} (${p.id}): ${p.direction} @ ${p.openPrice} | Curr: ${p.currentPrice} | Pips: ${pips.toFixed(1)} | PnL: $${p.profit} | Vol: ${p.volume}`;
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
` : '';

    const prompt = `You are VEDD SS AI LIVE TRADING ENGINE - operating in REAL-TIME autonomous HIGH-FREQUENCY mode. You are directly monitoring live market data and making INSTANT trading decisions to hit a weekly profit goal.

LIVE MARKET DATA (just fetched):
${marketSummary}

CURRENT OPEN POSITIONS (${currentOpenCount}/${config.maxOpenTrades} max):
${openPosStr}

BRAIN KNOWLEDGE (from historical learning):
${brainInsights}

PAIR-SPECIFIC KNOWLEDGE:
${pairKnowledge}
${goalSection}
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
- BREAKEVEN: Move SL to entry (breakeven) as soon as a trade hits 10-15 pips profit. Never let a winner turn into a loser.
- TRAILING: Use aggressive trailing stops (5-10 pips) once in 20+ pips profit to capture momentum surges.
- PARTIAL CLOSE: Take 50% profit at TP1 (scalping targets) and trail the rest for "infinite" R:R.
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

AGGRESSIVE COMPOUND GROWTH (tie it all together):
- Combine ALL strategies above simultaneously across multiple pairs
- Scale lot sizes: base=${adjustedBaseLot} | With confidence scaling: 65-75%=${adjustedBaseLot}, 75-85%=${Math.round(adjustedBaseLot * 1.5 * 100) / 100}, 85%+=${Math.round(adjustedBaseLot * 2 * 100) / 100}
- Max lot size cap: ${effectiveMaxLot} (never exceed this)
- Pyramid into winning positions - add to trades that move 10+ pips in your favor
- Trade correlated pairs in the same direction when macro trend aligns
- Use partial closes to lock in profit (close 50% at TP1, trail the rest)
- Re-enter quickly after taking profit if conditions still hold

LIVE ENGINE RULES:
1. Use ALL strategies simultaneously - scan for scalps, momentum, breakouts, and sniper setups on EVERY scan
2. Generate MULTIPLE signals per scan when opportunities exist across different pairs
3. Only signal when multiple indicators CONFIRM the same direction (minimum 2-3 confluences depending on strategy)
4. Use brain knowledge to AVOID historically bad setups (wrong hours, wrong sessions, wrong direction bias)
5. Factor in current open positions - diversify across uncorrelated pairs for maximum exposure
6. If volatility percentile >80, widen stops and increase targets. If <20, use scalping with tight targets
7. Session context matters - trade pairs during their historically best sessions
8. Check support/resistance proximity - don't BUY at resistance or SELL at support
9. Manage existing positions: trail stops aggressively, partial close at TP1, let runners ride
10. GOAL-DRIVEN: Every decision must move toward the weekly target. Calculate estimated profit per trade and compare to daily target remaining
11. COMPOUND ON WINS: After consecutive wins, increase lot size using compound multiplier. After losses, reduce to protect gains
12. Look for RE-ENTRY opportunities after taking profit - the trend may still have legs
13. THINK IN DOLLAR TARGETS: Each scalp at ${adjustedBaseLot} lots = ~$${(adjustedBaseLot * 3).toFixed(2)}-$${(adjustedBaseLot * 8).toFixed(2)} profit. Need ~${dailyTarget > 0 ? Math.ceil(dailyTarget / (adjustedBaseLot * 5)) : 'N/A'} wins/day at avg $${(adjustedBaseLot * 5).toFixed(2)}/trade to hit daily target
14. NEWS-FIRST: Check the news headlines and economic calendar BEFORE entering. If a high-impact event is imminent on a currency, SKIP that pair or close existing positions. Trade WITH news sentiment, not against it
15. VOLUME-FIRST: Prioritize pairs with SURGING or ABOVE_AVERAGE relative volume. AVOID pairs with DRY volume. Volume confirms price action - no volume = unreliable signals
16. OPTIMAL TIMING: During London/NY overlap (13:00-16:00 UTC) be MOST aggressive. During Asian session, focus only on JPY/AUD pairs. During low-volume windows, reduce position sizes by 50% or skip entirely

Respond ONLY with valid JSON. Generate MULTIPLE decisions when opportunities exist - don't hold back:
{
  "decisions": [
    {
      "action": "OPEN_TRADE" | "MODIFY_POSITION" | "CLOSE_POSITION" | "NO_ACTION",
      "strategy": "scalping" | "momentum" | "session_breakout" | "sniper" | "compound",
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

    const modelToUse = model.startsWith('gpt') ? model : 'gpt-4o-mini';
    const supportsJson = modelToUse.startsWith('gpt');

    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: 'You are VEDD SS AI - a live autonomous HIGH-FREQUENCY trading engine built for RAPID ACCOUNT GROWTH. Use every strategy in your arsenal simultaneously: scalping, momentum surfing, session breakouts, sniper setups, and aggressive compounding. Generate MULTIPLE trade signals per scan when opportunities exist across different pairs and strategies. Be aggressive but intelligent - maximize trade frequency while maintaining edge. CRITICAL: Always factor in NEWS events and VOLUME levels before entering trades. Avoid pairs with upcoming high-impact news. Prioritize pairs with strong volume. Trade during optimal market hours for best fills. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      ...(supportsJson ? { response_format: { type: 'json_object' } } : {}),
      max_tokens: 4000,
      temperature: 0.3,
    });

    const content = response.choices[0]?.message?.content || '';
    let decisions: any;
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
        await processDecision(userId, decision);
      }
    }
  } catch (err: any) {
    addActivity(userId, { type: 'error', message: `AI analysis error: ${err.message}` });
  }
}

async function processDecision(userId: number, decision: any): Promise<void> {
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
    const rawLotSize = parseNum(decision.lotSize) || config.baseLotSize || 0.01;
    const isSmallAccount = config.accountBalance > 0 && config.accountBalance < 500;
    const safeMaxLot = isSmallAccount 
      ? Math.min(0.02, config.maxLotSize || 0.10)
      : (config.maxLotSize || 0.10);
    const safeCompoundMult = isSmallAccount
      ? Math.min(state.goalTracker.compoundMultiplier, 1.25)
      : state.goalTracker.compoundMultiplier;
    const compoundedLot = config.enableCompounding
      ? Math.round(rawLotSize * safeCompoundMult * 100) / 100
      : rawLotSize;
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

export function startLiveEngine(userId: number, config?: Partial<LiveEngineConfig>): EngineState {
  if (engineIntervals[userId]) {
    clearInterval(engineIntervals[userId]);
    delete engineIntervals[userId];
  }

  const fullConfig = { ...getDefaultConfig(userId), ...(config || {}) };

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
    pnlSession: 0,
    marketSnapshot: {},
    goalTracker: createGoalTracker(fullConfig),
  };

  const goalMsg = fullConfig.weeklyProfitTarget > 0
    ? ` | Weekly Goal: $${fullConfig.weeklyProfitTarget} (${((fullConfig.accountBalance + fullConfig.weeklyProfitTarget) / Math.max(fullConfig.accountBalance, 1)).toFixed(1)}x growth)`
    : '';
  addActivity(userId, {
    type: 'info',
    message: `VEDD AI Live Engine STARTED | Strategy: ${fullConfig.strategyMode} | Pairs: ${fullConfig.pairs.join(', ')} | Scan interval: ${fullConfig.scanIntervalMs / 1000}s | Min confidence: ${fullConfig.minConfidence}%${goalMsg}`,
  });

  setTimeout(() => scanMarkets(userId), 2000);

  engineIntervals[userId] = setInterval(() => {
    scanMarkets(userId);
  }, fullConfig.scanIntervalMs);

  console.log(`[VEDD Live Engine] Started for user ${userId} | Strategy: ${fullConfig.strategyMode} | Interval: ${fullConfig.scanIntervalMs}ms`);

  return engineStates[userId];
}

export function stopLiveEngine(userId: number): EngineState | null {
  if (engineIntervals[userId]) {
    clearInterval(engineIntervals[userId]);
    delete engineIntervals[userId];
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
