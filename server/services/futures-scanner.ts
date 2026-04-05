// ─── VEDD Futures Scanner Service ─────────────────────────────────────────────
// Continuously scans futures markets (NQ, ES, GC, CL, etc.) for setups,
// generates AI signals, and executes via Tradovate — mirrors live-trading-engine.ts

import { marketDataService } from '../market-data/service';
import { computeAllAdvancedIndicators, type CandleData } from '../indicators';
import { storage } from '../storage';
import { getOrCreateTradovateService, executeFuturesSignal } from '../tradovate';
import { FUTURES_INSTRUMENTS, getInstrument, calculateContractSize } from '../futures-instruments';

// ── Default instruments to scan (most liquid) ─────────────────────────────────
export const DEFAULT_FUTURES_SYMBOLS = ['NQ', 'ES', 'GC', 'CL', 'MNQ', 'MES'];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FuturesScanConfig {
  userId: number;
  symbols: string[];           // e.g. ['NQ', 'ES', 'GC', 'CL']
  scanIntervalMs: number;      // default 120000 (2 min)
  minConfidence: number;       // 0-100
  maxOpenTrades: number;
  riskPerTrade: number;        // % of account per trade
  accountBalance: number;
  aiMode: 'full' | 'economy' | 'rule_based';
  propFirmDailyDrawdownLimit: number; // % daily loss limit (0 = disabled)
  enableAutoExecution: boolean; // true = execute via Tradovate, false = signal-only
}

export interface FuturesActivity {
  id: string;
  timestamp: string;
  type: 'scan' | 'signal' | 'trade_open' | 'error' | 'info';
  symbol?: string;
  direction?: string;
  message: string;
  details?: any;
  confidence?: number;
}

export interface FuturesScanSignal {
  id: string;
  timestamp: string;
  symbol: string;
  direction: 'BUY' | 'SELL';
  contracts: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  stopLossTicks: number;
  takeProfitTicks: number;
  confidence: number;
  reason: string;
  strategy: string;
  confluences: string[];
  status: 'pending' | 'executed' | 'rejected';
  executionResult?: string;
}

interface FuturesScanState {
  status: 'stopped' | 'running' | 'paused';
  config: FuturesScanConfig;
  scanCount: number;
  lastScanAt: string | null;
  currentlyScanning: boolean;
  activities: FuturesActivity[];
  signals: FuturesScanSignal[];
  marketSnapshot: Record<string, any>;
  dailyLossHalted: boolean;
  dailyPnL: number;
  wins: number;
  losses: number;
  // Self-learning: track signal outcomes per symbol
  symbolPerformance: Record<string, { wins: number; losses: number; totalR: number }>;
}

// ── State Maps ────────────────────────────────────────────────────────────────

const scannerStates: Record<number, FuturesScanState> = {};
const scannerTimers: Record<number, ReturnType<typeof setTimeout>> = {};
const MAX_ACTIVITIES = 200;
const MAX_SIGNALS = 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function addActivity(userId: number, entry: Omit<FuturesActivity, 'id' | 'timestamp'>): void {
  const state = scannerStates[userId];
  if (!state) return;
  state.activities.unshift({ id: uid(), timestamp: new Date().toISOString(), ...entry });
  if (state.activities.length > MAX_ACTIVITIES) state.activities.length = MAX_ACTIVITIES;
}

function addSignal(userId: number, signal: FuturesScanSignal): void {
  const state = scannerStates[userId];
  if (!state) return;
  state.signals.unshift(signal);
  if (state.signals.length > MAX_SIGNALS) state.signals.length = MAX_SIGNALS;
}

function convertToCandles(bars: Array<{ timestamp: number; open: number; high: number; low: number; close: number; volume: number }>): CandleData[] {
  return bars.map(b => ({ t: b.timestamp, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }));
}

// ── Market Hours Guard ────────────────────────────────────────────────────────
// Equity futures trade virtually 24h (with brief closes), but best setups
// occur during CME RTH (14:30–21:00 UTC) and the London open (08:00–10:00 UTC).
// Energy/metals trade virtually 24h. We never block, but we log the session.

function getCurrentFuturesSession(): string {
  const hour = new Date().getUTCHours();
  if (hour >= 14 && hour < 21) return 'CME_RTH';    // 9:30–4pm ET
  if (hour >= 8 && hour < 10) return 'LONDON_OPEN';
  if (hour >= 21 || hour < 2) return 'AFTER_HOURS';
  return 'OVERNIGHT';
}

// ── Self-Learning: Confidence Adjustment ──────────────────────────────────────
// If a symbol has been losing, lower effective confidence threshold (be more selective).
// If winning, maintain or slightly lower threshold to stay active.

function getAdjustedMinConfidence(userId: number, symbol: string): number {
  const state = scannerStates[userId];
  if (!state) return 65;
  const perf = state.symbolPerformance[symbol];
  if (!perf || (perf.wins + perf.losses) < 3) return state.config.minConfidence;
  const winRate = perf.wins / (perf.wins + perf.losses);
  if (winRate < 0.35) return Math.min(90, state.config.minConfidence + 10); // losing streak → more selective
  if (winRate > 0.65) return Math.max(55, state.config.minConfidence - 5);  // winning → stay active
  return state.config.minConfidence;
}

function recordOutcome(userId: number, symbol: string, won: boolean, rMultiple: number): void {
  const state = scannerStates[userId];
  if (!state) return;
  if (!state.symbolPerformance[symbol]) {
    state.symbolPerformance[symbol] = { wins: 0, losses: 0, totalR: 0 };
  }
  const perf = state.symbolPerformance[symbol];
  if (won) { perf.wins++; state.wins++; } else { perf.losses++; state.losses++; }
  perf.totalR += rMultiple;
  addActivity(userId, {
    type: 'info', symbol,
    message: `📊 Learning update: ${symbol} W:${perf.wins} L:${perf.losses} | AvgR:${(perf.totalR / (perf.wins + perf.losses)).toFixed(2)} | Session W:${state.wins} L:${state.losses}`,
  });
}

// ── AI Signal Generation ──────────────────────────────────────────────────────

async function runFuturesAIAnalysis(userId: number, marketAnalysis: Record<string, any>): Promise<void> {
  const state = scannerStates[userId];
  if (!state) return;

  const config = state.config;
  const session = getCurrentFuturesSession();

  // Rule-based mode: no API calls
  if (config.aiMode === 'rule_based') {
    for (const [symbol, data] of Object.entries(marketAnalysis) as [string, any][]) {
      const inst = getInstrument(symbol);
      if (!inst) continue;
      const adx = (data.adx as any)?.adx || 0;
      const plusDI = (data.adx as any)?.plusDI || 0;
      const minusDI = (data.adx as any)?.minusDI || 0;
      const rsi = data.rsi?.value || 50;
      const macdCross = data.macd?.histogram > 0;

      let direction: 'BUY' | 'SELL' | null = null;
      let confluences: string[] = [];
      let confidence = 0;

      if (adx > 25 && plusDI > minusDI && rsi < 65 && macdCross) {
        direction = 'BUY'; confluences = ['ADX trend', 'DI+ dominant', 'MACD bullish']; confidence = 68;
      } else if (adx > 25 && minusDI > plusDI && rsi > 35 && !macdCross) {
        direction = 'SELL'; confluences = ['ADX trend', 'DI- dominant', 'MACD bearish']; confidence = 68;
      }

      const minConf = getAdjustedMinConfidence(userId, symbol);
      if (!direction || confidence < minConf) continue;

      const atr = data.volatilityContext?.currentATR || inst.typicalDailyRange * inst.tickSize * 10;
      const slTicks = Math.round((atr / inst.tickSize) * 0.5);
      const tpTicks = slTicks * 2;
      const contracts = calculateContractSize(symbol, config.accountBalance, config.riskPerTrade, data.currentPrice, direction === 'BUY' ? data.currentPrice - slTicks * inst.tickSize : data.currentPrice + slTicks * inst.tickSize);

      const signal: FuturesScanSignal = {
        id: uid(), timestamp: new Date().toISOString(), symbol, direction,
        contracts: Math.max(1, contracts),
        entryPrice: data.currentPrice,
        stopLoss: direction === 'BUY' ? data.currentPrice - slTicks * inst.tickSize : data.currentPrice + slTicks * inst.tickSize,
        takeProfit: direction === 'BUY' ? data.currentPrice + tpTicks * inst.tickSize : data.currentPrice - tpTicks * inst.tickSize,
        stopLossTicks: slTicks, takeProfitTicks: tpTicks,
        confidence, reason: confluences.join(' | '), strategy: 'rule_based', confluences, status: 'pending',
      };

      addActivity(userId, { type: 'signal', symbol, direction, confidence, message: `⚡ Rule-based signal: ${direction} ${symbol} @ ${data.currentPrice} | Conf: ${confidence}% | SL: ${slTicks}t TP: ${tpTicks}t` });
      addSignal(userId, signal);
      await executeSignalIfEnabled(userId, signal);
    }
    return;
  }

  // Full / Economy AI mode
  let openai: any;
  try {
    const { getUniversalAIClientForUser } = await import('../openai');
    openai = await getUniversalAIClientForUser(userId);
  } catch {
    addActivity(userId, { type: 'error', message: 'No AI API key configured — futures scanner cannot analyze.' });
    return;
  }

  if (config.aiMode === 'economy' && process.env.GROQ_API_KEY) {
    try {
      const OpenAI = (await import('openai')).default;
      const groq = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' });
      (groq as any).defaultModel = 'llama-3.3-70b-versatile';
      openai = groq;
    } catch { /* fall back to primary */ }
  }

  const model = openai.defaultModel || 'gpt-4o';

  // Build market summary for prompt
  const marketSummary = Object.entries(marketAnalysis).map(([sym, data]: [string, any]) => {
    const inst = getInstrument(sym);
    const vol = data.volatilityContext;
    const sr = data.supportResistance;
    const atr = vol?.currentATR || 0;
    const atrTicks = inst ? Math.round(atr / inst.tickSize) : 0;
    const perfNote = (() => {
      const perf = state.symbolPerformance[sym];
      if (!perf || perf.wins + perf.losses < 2) return '';
      const wr = ((perf.wins / (perf.wins + perf.losses)) * 100).toFixed(0);
      return `, HistoricalWR=${wr}%(${perf.wins}W/${perf.losses}L)`;
    })();
    return `${sym}(${inst?.description || ''}): Price=${data.currentPrice}, Trend=${data.trend}, ADX=${(data.adx as any)?.adx?.toFixed(1) || 'N/A'}, RSI=${data.rsi?.value?.toFixed(1) || 'N/A'}, MACD_hist=${data.macd?.histogram?.toFixed(2) || 'N/A'}, ATR=${atr.toFixed(2)}(${atrTicks}ticks), TickVal=$${inst?.tickValue || '?'}/tick, Support=${sr?.supports?.[0]?.toFixed(2) || 'N/A'}, Resistance=${sr?.resistances?.[0]?.toFixed(2) || 'N/A'}, Patterns=[${(data.candlePatterns || []).join(',')}]${perfNote}`;
  }).join('\n');

  const symbolPerformanceSummary = Object.entries(state.symbolPerformance)
    .map(([sym, p]) => `${sym}: ${p.wins}W/${p.losses}L avgR=${p.wins + p.losses > 0 ? (p.totalR / (p.wins + p.losses)).toFixed(2) : 'N/A'}`)
    .join(', ') || 'No history yet';

  const prompt = `You are VEDD AI — an expert futures trader with deep knowledge of CME equity index, metals, and energy futures.

CURRENT SESSION: ${session} (UTC hour: ${new Date().getUTCHours()})
ACCOUNT BALANCE: $${config.accountBalance} | RISK PER TRADE: ${config.riskPerTrade}% | MAX OPEN: ${config.maxOpenTrades}
CURRENT WIN/LOSS: ${state.wins}W / ${state.losses}L
SYMBOL LEARNING: ${symbolPerformanceSummary}

MARKET DATA (15-minute candles):
${marketSummary}

FUTURES TRADING RULES:
- Equity futures (NQ/ES/YM/RTY and micros) are best traded during CME_RTH (14:30-21:00 UTC) and London open (08:00-10:00 UTC)
- Energy (CL, NG) and Metals (GC, SI) trade 24h but with best volume during RTH
- ALWAYS calculate stop loss in TICKS, not pips — each instrument has unique tick size
- Prefer 1.5R minimum reward:risk. Scale to 2R or 3R when momentum is clear
- During AFTER_HOURS or OVERNIGHT, only trade if ADX > 30 and patterns are clear
- High-impact news (FOMC, NFP, CPI, EIA) creates volatility — avoid entries 15min before/after
- Micro contracts (MNQ, MES, MYM, M2K, MGC, MCL) are appropriate for smaller accounts
- Self-learning: if a symbol has been losing (shown in history), be MORE selective (require 80%+ confidence)

Analyze the market data and decide whether to generate trade signals.

Respond ONLY with valid JSON:
{
  "decisions": [
    {
      "symbol": "NQ",
      "direction": "BUY",
      "confidence": 78,
      "strategy": "breakout_momentum",
      "reason": "brief explanation",
      "confluences": ["ADX 32 trending", "RSI 58 rising", "MACD bullish cross", "price at support"],
      "stopLossTicks": 20,
      "takeProfitTicks": 40,
      "holdTime": "45-90 minutes"
    }
  ],
  "marketOverview": "brief overall assessment",
  "sessionNote": "any session-specific notes"
}

Rules for decisions array:
- Only include signals with confidence >= ${config.minConfidence}%
- Max ${config.maxOpenTrades} signals per cycle
- If no good setups exist, return empty decisions array
- stopLossTicks and takeProfitTicks must be positive integers
- confidence is 0-100`;

  try {
    addActivity(userId, { type: 'info', message: `🤖 Futures AI analyzing ${Object.keys(marketAnalysis).length} instruments (${session}) via ${model}...` });

    const response = await openai.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1200,
      temperature: 0.3,
    });

    const raw = response.choices[0]?.message?.content || '{}';
    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }

    const decisions: any[] = parsed.decisions || [];
    if (parsed.marketOverview) {
      addActivity(userId, { type: 'info', message: `📊 ${parsed.marketOverview}${parsed.sessionNote ? ' | ' + parsed.sessionNote : ''}` });
    }

    if (decisions.length === 0) {
      addActivity(userId, { type: 'info', message: 'No futures setups this cycle — waiting for higher-quality alignment.' });
      return;
    }

    for (const d of decisions) {
      if (!d.symbol || !d.direction || !d.confidence) continue;
      const minConf = getAdjustedMinConfidence(userId, d.symbol);
      if (d.confidence < minConf) {
        addActivity(userId, { type: 'info', symbol: d.symbol, message: `Skipped ${d.symbol}: confidence ${d.confidence}% < adjusted threshold ${minConf}% (learning-adjusted)` });
        continue;
      }

      const inst = getInstrument(d.symbol);
      if (!inst) continue;

      const price = marketAnalysis[d.symbol]?.currentPrice || 0;
      const slTicks = Math.max(4, d.stopLossTicks || 20);
      const tpTicks = Math.max(slTicks, d.takeProfitTicks || slTicks * 2);
      const sl = d.direction === 'BUY' ? price - slTicks * inst.tickSize : price + slTicks * inst.tickSize;
      const tp = d.direction === 'BUY' ? price + tpTicks * inst.tickSize : price - tpTicks * inst.tickSize;
      const contracts = Math.max(1, calculateContractSize(d.symbol, config.accountBalance, config.riskPerTrade, price, sl));

      const signal: FuturesScanSignal = {
        id: uid(), timestamp: new Date().toISOString(),
        symbol: d.symbol, direction: d.direction,
        contracts, entryPrice: price, stopLoss: sl, takeProfit: tp,
        stopLossTicks: slTicks, takeProfitTicks: tpTicks,
        confidence: d.confidence, reason: d.reason || '',
        strategy: d.strategy || 'ai_analysis',
        confluences: d.confluences || [], status: 'pending',
      };

      addActivity(userId, {
        type: 'signal', symbol: d.symbol, direction: d.direction, confidence: d.confidence,
        message: `⚡ FUTURES SIGNAL: ${d.direction} ${d.symbol} @ ${price} | Conf: ${d.confidence}% | SL: ${slTicks}t ($${(slTicks * inst.tickValue * contracts).toFixed(0)} risk) | TP: ${tpTicks}t | Strategy: ${d.strategy}`,
        details: { confluences: d.confluences, holdTime: d.holdTime },
      });

      addSignal(userId, signal);
      await executeSignalIfEnabled(userId, signal);
    }
  } catch (err: any) {
    addActivity(userId, { type: 'error', message: `Futures AI error: ${err.message}` });
  }
}

// ── Trade Execution via Tradovate ─────────────────────────────────────────────

async function executeSignalIfEnabled(userId: number, signal: FuturesScanSignal): Promise<void> {
  const state = scannerStates[userId];
  if (!state || !state.config.enableAutoExecution) return;

  try {
    const connection = await storage.getUserTradovateConnection(userId);
    if (!connection || !connection.isActive) {
      addActivity(userId, { type: 'info', symbol: signal.symbol, message: `Signal queued (Tradovate not connected): ${signal.direction} ${signal.symbol}` });
      return;
    }

    const result = await executeFuturesSignal(connection, {
      action: 'OPEN',
      symbol: signal.symbol,
      direction: signal.direction,
      contracts: signal.contracts,
      stopLoss: signal.stopLoss || undefined,
      takeProfit: signal.takeProfit || undefined,
    });

    if (result.success) {
      signal.status = 'executed';
      signal.executionResult = `Order #${result.orderId} placed`;
      addActivity(userId, { type: 'trade_open', symbol: signal.symbol, direction: signal.direction, message: `✅ EXECUTED: ${signal.direction} ${signal.contracts} ${signal.symbol} | Order: ${result.orderId}` });
    } else {
      signal.status = 'rejected';
      signal.executionResult = result.error || 'Execution failed';
      addActivity(userId, { type: 'error', symbol: signal.symbol, message: `❌ Execution failed: ${signal.symbol} — ${result.error}` });
    }
  } catch (err: any) {
    signal.status = 'rejected';
    signal.executionResult = err.message;
    addActivity(userId, { type: 'error', symbol: signal.symbol, message: `Execution error: ${err.message}` });
  }
}

// ── Main Scan Cycle ───────────────────────────────────────────────────────────

async function scanFuturesMarkets(userId: number): Promise<void> {
  const state = scannerStates[userId];
  if (!state || state.status !== 'running' || state.currentlyScanning) return;

  // Prop firm daily drawdown guard
  if (state.dailyLossHalted) {
    addActivity(userId, { type: 'error', message: '🚨 Daily loss limit reached — scanner halted. Reset tomorrow.' });
    return;
  }

  state.currentlyScanning = true;
  state.scanCount++;
  state.lastScanAt = new Date().toISOString();
  const session = getCurrentFuturesSession();

  try {
    if (!marketDataService.isInitialized()) {
      addActivity(userId, { type: 'error', message: 'Market data service not initialized — check TWELVE_DATA_API_KEY.' });
      return;
    }

    const symbols = state.config.symbols.slice(0, 8);
    addActivity(userId, { type: 'scan', message: `🔍 Futures scan #${state.scanCount}: ${symbols.join(', ')} [${session}]` });

    const marketAnalysis: Record<string, any> = {};

    for (const symbol of symbols) {
      try {
        const result = await marketDataService.fetchMarketData({ symbol, assetType: 'futures', timeframe: '15m', limit: 50 });
        if (!result.bars || result.bars.length < 20) continue;

        const candles = convertToCandles(result.bars);
        const indicators = computeAllAdvancedIndicators(candles, 0, symbol, 'M15');
        const currentPrice = result.bars[result.bars.length - 1]?.close || 0;

        let trend = 'NEUTRAL';
        const adxData = indicators.adx as any;
        if (adxData && (adxData.adx || adxData.value) > 25) {
          trend = adxData.plusDI > adxData.minusDI ? 'BULLISH' : 'BEARISH';
        }

        state.marketSnapshot[symbol] = {
          price: currentPrice,
          trend,
          rsi: Math.round(indicators.stochastic?.k || 50),
          atr: indicators.volatilityContext?.currentATR || 0,
          updatedAt: new Date().toISOString(),
        };

        marketAnalysis[symbol] = {
          currentPrice,
          trend,
          adx: indicators.adx,
          rsi: indicators.rsi,
          macd: indicators.macd,
          stochastic: indicators.stochastic,
          supportResistance: indicators.supportResistance,
          candlePatterns: indicators.candlePatterns,
          volatilityContext: indicators.volatilityContext,
          volumeProfile: indicators.volumeProfile,
        };

        await new Promise(r => setTimeout(r, 4000)); // rate-limit spacing
      } catch (err: any) {
        addActivity(userId, { type: 'error', symbol, message: `Data fetch failed: ${err.message}` });
      }
    }

    if (Object.keys(marketAnalysis).length === 0) {
      addActivity(userId, { type: 'info', message: 'No futures market data available this cycle.' });
      return;
    }

    await runFuturesAIAnalysis(userId, marketAnalysis);

  } catch (err: any) {
    addActivity(userId, { type: 'error', message: `Futures scan error: ${err.message}` });
  } finally {
    state.currentlyScanning = false;
  }
}

// ── Self-scheduling scan loop ─────────────────────────────────────────────────

function scheduleNextScan(userId: number): void {
  const state = scannerStates[userId];
  if (!state || state.status !== 'running') return;
  scannerTimers[userId] = setTimeout(async () => {
    await scanFuturesMarkets(userId);
    scheduleNextScan(userId);
  }, state.config.scanIntervalMs);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function startFuturesScanner(config: FuturesScanConfig): FuturesScanState {
  // Stop existing scanner for this user if running
  stopFuturesScanner(config.userId);

  const fullConfig: FuturesScanConfig = {
    userId: config.userId,
    symbols: Array.isArray(config.symbols) && config.symbols.length > 0 ? config.symbols : DEFAULT_FUTURES_SYMBOLS,
    scanIntervalMs: config.scanIntervalMs || 120000,
    minConfidence: config.minConfidence || 70,
    maxOpenTrades: config.maxOpenTrades || 3,
    riskPerTrade: config.riskPerTrade || 1,
    accountBalance: config.accountBalance || 50000,
    aiMode: config.aiMode || 'full',
    propFirmDailyDrawdownLimit: config.propFirmDailyDrawdownLimit ?? 2,
    enableAutoExecution: config.enableAutoExecution === true,
  };

  scannerStates[config.userId] = {
    status: 'running',
    config: fullConfig,
    scanCount: 0,
    lastScanAt: null,
    currentlyScanning: false,
    activities: [],
    signals: [],
    marketSnapshot: {},
    dailyLossHalted: false,
    dailyPnL: 0,
    wins: 0,
    losses: 0,
    symbolPerformance: {},
  };

  addActivity(config.userId, {
    type: 'info',
    message: `🚀 Futures Scanner STARTED | Instruments: ${fullConfig.symbols.join(', ')} | Interval: ${fullConfig.scanIntervalMs / 1000}s | Min confidence: ${fullConfig.minConfidence}% | Auto-execute: ${fullConfig.enableAutoExecution ? 'ON' : 'OFF (signals only)'}`,
  });

  // First scan after 3 seconds, then on interval
  setTimeout(() => {
    scanFuturesMarkets(config.userId).then(() => scheduleNextScan(config.userId));
  }, 3000);

  return scannerStates[config.userId];
}

export function stopFuturesScanner(userId: number): void {
  if (scannerTimers[userId]) {
    clearTimeout(scannerTimers[userId]);
    delete scannerTimers[userId];
  }
  const state = scannerStates[userId];
  if (state) {
    state.status = 'stopped';
    addActivity(userId, { type: 'info', message: '⏹️ Futures Scanner STOPPED.' });
  }
}

export function getFuturesScannerState(userId: number): FuturesScanState | null {
  return scannerStates[userId] || null;
}

export function getFuturesScannerActivities(userId: number, limit = 50): FuturesActivity[] {
  return (scannerStates[userId]?.activities || []).slice(0, limit);
}

export function getFuturesScannerSignals(userId: number, limit = 20): FuturesScanSignal[] {
  return (scannerStates[userId]?.signals || []).slice(0, limit);
}

export function recordFuturesTradeOutcome(userId: number, symbol: string, won: boolean, rMultiple: number): void {
  recordOutcome(userId, symbol, won, rMultiple);
}
