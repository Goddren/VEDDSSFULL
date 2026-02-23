import { marketDataService } from '../market-data/service';
import { executeMT5SignalOnTradeLocker } from '../tradelocker';
import { computeAllAdvancedIndicators, type CandleData } from '../indicators';
import { storage } from '../storage';

interface LiveEngineConfig {
  userId: number;
  scanIntervalMs: number;
  pairs: string[];
  strategyMode: string;
  maxOpenTrades: number;
  riskPerTrade: number;
  minConfidence: number;
  enablePositionManagement: boolean;
  trailingStopEnabled: boolean;
  trailingStopATRMultiplier: number;
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
  status: 'pending' | 'executed' | 'rejected' | 'expired';
}

const pendingMT5Signals: Record<number, PendingMT5Signal[]> = {};

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
    enablePositionManagement: true,
    trailingStopEnabled: true,
    trailingStopATRMultiplier: 1.5,
  };
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

    addActivity(userId, { type: 'info', message: `Market data collected for ${analyzedPairs.length} pairs. Running AI analysis...` });

    await runAILiveAnalysis(userId, marketAnalysis, brain);

  } catch (err: any) {
    addActivity(userId, { type: 'error', message: `Scan cycle error: ${err.message}` });
  } finally {
    state.currentlyScanning = false;
  }
}

async function runAILiveAnalysis(userId: number, marketAnalysis: Record<string, any>, brain: any): Promise<void> {
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
      return `${sym}: Price=${data.currentPrice}, Trend=${data.trend}, ADX=${data.adx?.adx?.toFixed(1) || 'N/A'}, Stoch K=${data.stochastic?.k?.toFixed(1) || 'N/A'} D=${data.stochastic?.d?.toFixed(1) || 'N/A'}, VWAP=${data.vwap?.value?.toFixed(5) || 'N/A'}, OBV Trend=${data.obv?.trend || 'N/A'}, Patterns=[${(data.candlePatterns || []).join(',')}], Session=${data.sessionContext?.currentSession || 'N/A'}, Volatility=${vol?.percentile?.toFixed(0) || 'N/A'}%, Support=${sr?.supports?.[0]?.toFixed(5) || 'N/A'}, Resistance=${sr?.resistances?.[0]?.toFixed(5) || 'N/A'}, Fib 38.2%=${fib?.retracementLevels?.['38.2']?.toFixed(5) || 'N/A'}`;
    }).join('\n');

    const openPosStr = openPositions.length > 0
      ? openPositions.map((p: any) => `${p.symbol}: ${p.direction} @ ${p.openPrice} (PnL: ${p.profit})`).join('\n')
      : 'None';

    const config = state.config;

    const prompt = `You are VEDD SS AI LIVE TRADING ENGINE - operating in REAL-TIME autonomous mode. You are directly monitoring live market data and making INSTANT trading decisions.

LIVE MARKET DATA (just fetched):
${marketSummary}

CURRENT OPEN POSITIONS (${currentOpenCount}/${config.maxOpenTrades} max):
${openPosStr}

BRAIN KNOWLEDGE (from historical learning):
${brainInsights}

PAIR-SPECIFIC KNOWLEDGE:
${pairKnowledge}

CONTEXT:
- Time: ${now.toISOString()} | Session: ${session} | Day: ${day}
- Strategy: ${config.strategyMode.toUpperCase()} | Min Confidence: ${config.minConfidence}%
- Risk per trade: ${config.riskPerTrade}% | Trailing stops: ${config.trailingStopEnabled ? 'ON' : 'OFF'}
- Max trades allowed: ${config.maxOpenTrades} | Currently open: ${currentOpenCount}
- Position management: ${config.enablePositionManagement ? 'ACTIVE' : 'OFF'}
- IMPORTANT: Market data comes from Twelve Data. User's broker may have slightly different prices (spread, feed differences). Use ZONE-BASED entries rather than exact prices. Set SL/TP as DISTANCES from entry (e.g. 15 pips SL) so the EA can adjust to broker prices automatically.

LIVE ENGINE RULES:
1. Analyze ALL indicators together - ADX, Stochastic, VWAP, OBV, S/R, Fibonacci, candle patterns, volume
2. Only signal when multiple indicators CONFIRM the same direction (minimum 3 confluences)
3. Use brain knowledge to AVOID historically bad setups (wrong hours, wrong sessions, wrong direction bias)
4. Factor in current open positions - don't overexpose to one pair or correlated pairs
5. If volatility percentile >80, widen stops. If <20, use tighter targets.
6. Session context matters - trade pairs during their historically best sessions
7. Check support/resistance proximity - don't BUY at resistance or SELL at support
8. Manage existing positions: suggest trailing stop moves, partial closes, or full exits when conditions change
9. Be a GENIUS - combine all data points like an institutional trader

Respond ONLY with valid JSON:
{
  "decisions": [
    {
      "action": "OPEN_TRADE" | "MODIFY_POSITION" | "CLOSE_POSITION" | "NO_ACTION",
      "symbol": "EURUSD",
      "direction": "BUY" | "SELL",
      "confidence": 85,
      "reason": "Detailed multi-indicator reasoning",
      "confluences": ["indicator1 says X", "indicator2 confirms Y", "brain says Z"],
      "entryPrice": number,
      "stopLoss": number,
      "takeProfit": number,
      "lotSize": number,
      "holdTime": "5min|15min|1hr|4hr",
      "positionId": "for modify/close actions",
      "modifyAction": "trail_stop|move_sl|partial_close|full_close",
      "newStopLoss": number,
      "urgency": "IMMEDIATE" | "WAIT_FOR_PULLBACK" | "MONITORING"
    }
  ],
  "marketOverview": "Current market read across all pairs",
  "hotPairs": ["pairs showing strongest signals right now"],
  "dangerZones": ["pairs or setups to avoid and why"],
  "nextScanFocus": "What to focus on in the next scan cycle",
  "engineConfidence": 0-100
}`;

    const modelToUse = model.startsWith('gpt') ? model : 'gpt-4o-mini';
    const supportsJson = modelToUse.startsWith('gpt');

    const response = await openai.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: 'You are VEDD SS AI - a live autonomous trading engine operating in real-time. Analyze market data with institutional precision. Every decision impacts real money. Be surgical. Respond with valid JSON only.' },
        { role: 'user', content: prompt },
      ],
      ...(supportsJson ? { response_format: { type: 'json_object' } } : {}),
      max_tokens: 3000,
      temperature: 0.2,
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

    addActivity(userId, {
      type: 'ai_decision',
      message: `AI Analysis Complete | Engine Confidence: ${decisions.engineConfidence || 'N/A'}% | ${decisions.decisions?.length || 0} decisions`,
      details: {
        marketOverview: decisions.marketOverview,
        hotPairs: decisions.hotPairs,
        dangerZones: decisions.dangerZones,
        nextScanFocus: decisions.nextScanFocus,
        engineConfidence: decisions.engineConfidence,
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

    if (state.openPositionCount >= config.maxOpenTrades) {
      addActivity(userId, {
        type: 'info',
        symbol: decision.symbol,
        message: `Trade skipped - max open trades reached (${state.openPositionCount}/${config.maxOpenTrades})`,
      });
      return;
    }

    state.signalsGenerated++;

    addActivity(userId, {
      type: 'signal',
      symbol: decision.symbol,
      direction: decision.direction,
      confidence,
      message: `LIVE SIGNAL: ${decision.direction} ${decision.symbol} @ ${confidence}% confidence`,
      details: {
        confluences: decision.confluences,
        reason: decision.reason,
        urgency: decision.urgency,
        holdTime: decision.holdTime,
      },
    });

    if (decision.urgency === 'WAIT_FOR_PULLBACK' || decision.urgency === 'MONITORING') {
      addActivity(userId, { type: 'info', symbol: decision.symbol, message: `Watching for entry - urgency: ${decision.urgency}` });
      return;
    }

    const entryPrice = parseNum(decision.entryPrice);
    const stopLoss = parseNum(decision.stopLoss);
    const takeProfit = parseNum(decision.takeProfit);
    const lotSize = parseNum(decision.lotSize) || 0.01;

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
        mt5Signal.status = 'executed';
        addActivity(userId, {
          type: 'trade_open',
          symbol: decision.symbol,
          direction: decision.direction,
          confidence,
          message: `TRADE EXECUTED: ${decision.direction} ${decision.symbol} | Lot: ${lotSize} | SL: ${stopLoss || 'N/A'} | TP: ${takeProfit || 'N/A'} | Order: ${tradeResult.orderId}`,
          details: { orderId: tradeResult.orderId, lotSize, stopLoss, takeProfit, confluences: decision.confluences },
        });
      } else {
        state.tradesFailed++;
        mt5Signal.status = 'rejected';
        addActivity(userId, {
          type: 'error',
          symbol: decision.symbol,
          message: `Trade FAILED: ${decision.direction} ${decision.symbol} - ${tradeResult.error}`,
        });
      }
    } catch (err: any) {
      state.tradesFailed++;
      addActivity(userId, { type: 'error', symbol: decision.symbol, message: `Execution error: ${err.message}` });
    }
  }

  if (decision.action === 'MODIFY_POSITION' || decision.action === 'CLOSE_POSITION') {
    state.positionsManaged++;
    addActivity(userId, {
      type: 'position_update',
      symbol: decision.symbol,
      message: `Position ${decision.modifyAction || decision.action}: ${decision.symbol} - ${decision.reason}`,
      details: { modifyAction: decision.modifyAction, newStopLoss: decision.newStopLoss },
    });
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
  };

  addActivity(userId, {
    type: 'info',
    message: `VEDD AI Live Engine STARTED | Strategy: ${fullConfig.strategyMode} | Pairs: ${fullConfig.pairs.join(', ')} | Scan interval: ${fullConfig.scanIntervalMs / 1000}s | Min confidence: ${fullConfig.minConfidence}%`,
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
