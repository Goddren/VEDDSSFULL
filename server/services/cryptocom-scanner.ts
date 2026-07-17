// ─── VEDD Crypto.com Perpetuals Scanner Service ───────────────────────────────
// Real autonomous AI-driven trading for Crypto.com perpetual futures.
// Previously "Auto-execute" on cryptocomConnections was a dead toggle read by
// nothing — this is the actual scanner/strategy engine behind it, following
// the same architecture as futures-scanner.ts (perpetuals are structurally
// closest to futures: quantity, long/short, leverage), including full FX SS
// AI Engine parity (Kelly sizing, Brain Learning Mode, Drawdown Shield,
// consistency rule, R-multiple trailing stops, Dual-Vote Consensus).

import { storage } from '../storage';
import { CryptoComService, decryptApiSecret } from '../cryptocom';
import { computeAllAdvancedIndicators, type CandleData } from '../indicators';
import type { CryptocomEngineConfig, CryptocomConnection } from '../../shared/schema';

const MIN_SCAN_INTERVAL_MS = 30000;
const lastScanAt = new Map<number, number>();

type Decision = 'watching' | 'signal' | 'skipped' | 'error';
interface StrategyResult {
  decision: Decision;
  reasoning: string;
  score: number | null;
  price: number | null;
  dailyChangePercent: number | null;
  strategy: string;
  direction?: 'BUY' | 'SELL';
}

function convertToCandles(bars: { t: number; o: number; h: number; l: number; c: number; v: number }[]): CandleData[] {
  return bars.map(b => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
}

// ── Strategy: trend/momentum confluence — same read as the FX/futures rule-
// based engines (ADX trend strength, RSI zone, MACD histogram direction). ───
async function runTrendFollowing(symbol: string, cfg: CryptocomEngineConfig): Promise<StrategyResult> {
  const bars = await CryptoComService.getCandles(symbol, '5m', 100);
  if (bars.length < 30) {
    return { decision: 'error', reasoning: `${symbol}: not enough candle history returned.`, score: null, price: null, dailyChangePercent: null, strategy: 'trend_following' };
  }
  const candles = convertToCandles(bars);
  const indicators = computeAllAdvancedIndicators(candles, 0, symbol, 'M5');
  const price = candles[candles.length - 1].c;
  const dailyChangePercent = ((price - candles[0].c) / candles[0].c) * 100;

  const adx = (indicators.adx as any)?.adx || 0;
  const plusDI = (indicators.adx as any)?.plusDI || 0;
  const minusDI = (indicators.adx as any)?.minusDI || 0;
  const rsi = indicators.rsi?.value || 50;
  const macdHist = indicators.macd?.histogram || 0;

  let direction: 'BUY' | 'SELL' | null = null;
  let score = 0;
  const confluences: string[] = [];
  if (adx > 25 && plusDI > minusDI && rsi < 68 && macdHist > 0) {
    direction = 'BUY'; score = 60 + Math.min(20, adx - 25); confluences.push(`ADX ${adx.toFixed(1)} trend`, 'DI+ dominant', 'MACD bullish');
  } else if (adx > 25 && minusDI > plusDI && rsi > 32 && macdHist < 0) {
    direction = 'SELL'; score = 60 + Math.min(20, adx - 25); confluences.push(`ADX ${adx.toFixed(1)} trend`, 'DI- dominant', 'MACD bearish');
  }

  if (!direction) {
    return { decision: 'watching', reasoning: `${symbol}: no clear trend confluence (ADX ${adx.toFixed(1)}, RSI ${rsi.toFixed(1)}).`, score: Math.round(score), price, dailyChangePercent, strategy: 'trend_following' };
  }
  const directionAllowed = cfg.directionFilter === 'both' ||
    (cfg.directionFilter === 'long_only' && direction === 'BUY') ||
    (cfg.directionFilter === 'short_only' && direction === 'SELL');
  if (!directionAllowed) {
    return { decision: 'skipped', reasoning: `${symbol}: ${direction} confluence found, but direction filter is "${cfg.directionFilter}".`, score: Math.round(score), price, dailyChangePercent, strategy: 'trend_following' };
  }
  if (score < cfg.minConfidence) {
    return { decision: 'watching', reasoning: `${symbol}: ${direction} confluence (${confluences.join(', ')}) but score ${Math.round(score)}/100 below ${cfg.minConfidence} threshold.`, score: Math.round(score), price, dailyChangePercent, strategy: 'trend_following' };
  }
  return {
    decision: 'signal', score: Math.round(score), price, dailyChangePercent, strategy: 'trend_following', direction,
    reasoning: `${symbol}: ${direction} trend confluence — ${confluences.join(', ')}. Score ${Math.round(score)}/100.`,
  };
}

async function runMomentum(symbol: string, cfg: CryptocomEngineConfig): Promise<StrategyResult> {
  const bars = await CryptoComService.getCandles(symbol, '15m', 30);
  if (bars.length < 10) {
    return { decision: 'error', reasoning: `${symbol}: not enough candle history.`, score: null, price: null, dailyChangePercent: null, strategy: 'momentum' };
  }
  const price = bars[bars.length - 1].c;
  const dailyChangePercent = ((price - bars[0].c) / bars[0].c) * 100;
  const direction: 'BUY' | 'SELL' = dailyChangePercent >= 0 ? 'BUY' : 'SELL';
  const score = Math.round(Math.min(100, 50 + Math.min(Math.abs(dailyChangePercent) / 3, 1) * 50));
  const directionAllowed = cfg.directionFilter === 'both' ||
    (cfg.directionFilter === 'long_only' && direction === 'BUY') ||
    (cfg.directionFilter === 'short_only' && direction === 'SELL');
  if (!directionAllowed) {
    return { decision: 'skipped', reasoning: `${symbol}: moved ${direction === 'BUY' ? 'up' : 'down'} ${Math.abs(dailyChangePercent).toFixed(2)}%, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: 'momentum' };
  }
  if (score < cfg.minConfidence) {
    return { decision: 'watching', reasoning: `${symbol}: momentum score ${score}/100 below ${cfg.minConfidence} threshold.`, score, price, dailyChangePercent, strategy: 'momentum' };
  }
  return { decision: 'signal', score, price, dailyChangePercent, strategy: 'momentum', direction, reasoning: `${symbol}: momentum ${direction} — moved ${Math.abs(dailyChangePercent).toFixed(2)}% this window. Score ${score}/100.` };
}

const STRATEGY_RUNNERS: Record<string, (sym: string, cfg: CryptocomEngineConfig) => Promise<StrategyResult>> = {
  trend_following: runTrendFollowing,
  momentum: runMomentum,
};

async function scanSymbol(symbol: string, cfg: CryptocomEngineConfig): Promise<StrategyResult> {
  if (cfg.strategyMode === 'auto') {
    const results = await Promise.all(['trend_following', 'momentum'].map(k => STRATEGY_RUNNERS[k](symbol, cfg).catch(() => null)));
    const valid = results.filter((r): r is StrategyResult => !!r);
    const signals = valid.filter(r => r.decision === 'signal').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (signals.length > 0) return signals[0];
    const watching = valid.filter(r => r.decision === 'watching').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (watching.length > 0) return watching[0];
    return valid[0] ?? { decision: 'error', reasoning: `${symbol}: all strategies failed.`, score: null, price: null, dailyChangePercent: null, strategy: 'auto' };
  }
  const runner = STRATEGY_RUNNERS[cfg.strategyMode] || runTrendFollowing;
  return runner(symbol, cfg);
}

// ══════════════════════════════════════════════════════════════════════════
// Sizing (Brain Learning Mode + Kelly), trailing stops (R-multiple), safety
// gates (Drawdown Shield + Consistency Rule), Dual-Vote Consensus — same
// pattern as options-scanner.ts / futures-scanner.ts this session.
// ══════════════════════════════════════════════════════════════════════════

async function computeCryptocomQuantity(userId: number, cfg: CryptocomEngineConfig, accountBalance: number, price: number): Promise<{ quantity: number; reasoning: string }> {
  if (!price || price <= 0 || accountBalance <= 0) return { quantity: 0, reasoning: '' };
  const riskAmount = accountBalance * (cfg.riskPerTrade / 100) * cfg.leverage;
  const baseQty = Math.max(0, Math.round((riskAmount / price) * 1000) / 1000);

  if (cfg.brainLearningMode) {
    const stats = await storage.getCryptocomEngineTradeStats(userId);
    const brainLocked = stats.totalClosed < 10 || stats.winRate < 60;
    if (brainLocked) {
      return { quantity: baseQty > 0 ? Math.min(baseQty, Math.max(0.001, baseQty * 0.25)) : 0, reasoning: `🧠 Learning Mode: sized conservatively (${stats.totalClosed}/10 trades, ${stats.winRate}%/60% WR).` };
    }
    if (cfg.useKellyCriterion) {
      const fractionalKelly = (stats.winRate / 100) * 0.25;
      return { quantity: baseQty * (1 + fractionalKelly), reasoning: `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) + Kelly sizing.` };
    }
    return { quantity: baseQty, reasoning: `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) — full risk sizing.` };
  }
  if (cfg.useKellyCriterion) {
    const stats = await storage.getCryptocomEngineTradeStats(userId);
    const fractionalKelly = (stats.winRate / 100) * 0.25;
    return { quantity: baseQty * (1 + fractionalKelly), reasoning: `Kelly sizing (${stats.winRate}% WR over ${stats.totalClosed} trades).` };
  }
  return { quantity: baseQty, reasoning: '' };
}

function computeTrailFloorR(cfg: CryptocomEngineConfig, peakR: number): number {
  switch (cfg.trailMethod) {
    case 'fixed_r': return peakR - cfg.trailFixedR;
    case 'stepped_fixed': { const steps = Math.floor(peakR / cfg.trailStepR); return (steps - 1) * cfg.trailStepR; }
    case 'profit_lock': return peakR * (cfg.trailProfitLockPct / 100);
    case 'chandelier': return peakR - cfg.trailFixedR * 1.5;
    case 'parabolic_sar': { const af = Math.min(cfg.trailSarMaxAF, cfg.trailSarInitialAF + peakR * cfg.trailSarInitialAF); return peakR * (1 - af); }
    case 'r_multiple': return cfg.trailActivationR + (peakR - cfg.trailActivationR) * 0.5;
    case 'swing_structure': return peakR - cfg.trailFixedR * 0.75;
    default: return -Infinity;
  }
}

async function monitorOpenPositions(userId: number, cfg: CryptocomEngineConfig): Promise<void> {
  const openTrades = await storage.getOpenCryptocomEngineTrades(userId);
  if (openTrades.length === 0 || cfg.trailMethod === 'none') return;

  for (const trade of openTrades) {
    try {
      const currentPrice = await CryptoComService.getTicker(trade.symbol);
      if (!currentPrice || !trade.stopLoss) continue;
      const riskDistance = Math.abs(trade.entryPrice - trade.stopLoss);
      if (riskDistance <= 0) continue;
      const isLong = trade.direction === 'long';
      const currentR = isLong ? (currentPrice - trade.entryPrice) / riskDistance : (trade.entryPrice - currentPrice) / riskDistance;
      const peakR = Math.max(trade.peakRMultiple, currentR);
      const armed = trade.trailArmed || peakR >= cfg.trailActivationR;

      if (currentR <= -1) { // hard stop already breached
        await closePosition(userId, trade, currentPrice, 'stop_loss');
        continue;
      }
      if (armed) {
        const floor = Math.max(computeTrailFloorR(cfg, peakR), cfg.breakevenBufferR);
        if (currentR <= floor) { await closePosition(userId, trade, currentPrice, 'trailing_stop'); continue; }
      }
      if (peakR !== trade.peakRMultiple || armed !== trade.trailArmed) {
        await storage.updateCryptocomEngineTradeTrailState(trade.id, { peakRMultiple: peakR, trailArmed: armed });
      }
    } catch (err: any) {
      console.error(`[cryptocom-scanner] monitor failed for trade ${trade.id}:`, err.message);
    }
  }
}

async function closePosition(userId: number, trade: any, currentPrice: number, reason: string): Promise<void> {
  try {
    const connection = await storage.getUserCryptocomConnections(userId).then(c => c.find(x => x.id === trade.connectionId));
    if (connection) {
      const service = new CryptoComService(connection.apiKey, decryptApiSecret(connection.encryptedApiSecret));
      const closeSide = trade.direction === 'long' ? 'SELL' : 'BUY';
      await service.placeOrder({ instrumentName: trade.symbol, side: closeSide, quantity: trade.quantity, type: 'MARKET' }).catch(() => {});
    }
    const realizedPnl = (trade.direction === 'long' ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) * trade.quantity;
    await storage.closeCryptocomEngineTrade(trade.id, { exitPrice: currentPrice, exitReason: reason, realizedPnl });
    await storage.createCryptocomEngineActivity({
      userId, symbol: trade.symbol, decision: 'signal', strategy: trade.strategy,
      reasoning: `${trade.symbol}: CLOSED ${trade.quantity} @ ~$${currentPrice.toFixed(2)} (${reason.replace('_', ' ')}). Realized P&L: $${realizedPnl.toFixed(2)}.`,
      score: null, price: currentPrice, dailyChangePercent: null, source: 'cryptocom',
    });
  } catch (err: any) {
    console.error(`[cryptocom-scanner] closePosition failed for trade ${trade.id}:`, err.message);
  }
}

const sessionPeakEquity = new Map<number, number>();

async function checkSafetyGates(userId: number, cfg: CryptocomEngineConfig, equity: number): Promise<{ allowed: boolean; reason?: string; riskMultiplier: number }> {
  if (cfg.maxDailyTrades > 0) {
    const count = await storage.getTodayCryptocomEngineTradeCount(userId);
    if (count >= cfg.maxDailyTrades) return { allowed: false, reason: `max daily trades (${cfg.maxDailyTrades}) reached`, riskMultiplier: 1 };
  }
  const openTrades = await storage.getOpenCryptocomEngineTrades(userId);
  if (openTrades.length >= cfg.maxOpenTrades) return { allowed: false, reason: `max open trades (${cfg.maxOpenTrades}) reached`, riskMultiplier: 1 };

  let riskMultiplier = 1;
  if (equity > 0) {
    const todayPnl = await storage.getTodayCryptocomEngineRealizedPnl(userId);
    if (cfg.dailyLossLimit > 0 && todayPnl <= -(equity * cfg.dailyLossLimit / 100)) {
      return { allowed: false, reason: `daily loss limit (${cfg.dailyLossLimit}%) reached`, riskMultiplier: 1 };
    }
    if (cfg.dailyProfitTarget > 0 && todayPnl >= (equity * cfg.dailyProfitTarget / 100)) {
      return { allowed: false, reason: `daily profit target (${cfg.dailyProfitTarget}%) already reached`, riskMultiplier: 1 };
    }
    const peak = Math.max(sessionPeakEquity.get(userId) ?? equity, equity);
    sessionPeakEquity.set(userId, peak);
    const ddFromPeakPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (ddFromPeakPct >= cfg.drawdownShieldThreshold) riskMultiplier = Math.min(riskMultiplier, 0.25);

    if (cfg.consistencyEnforcementEnabled) {
      const history = await storage.getCryptocomEngineDailyPnlHistory(userId, cfg.consistencyPeriodDays);
      const today = new Date().toISOString().split('T')[0];
      history[today] = todayPnl;
      if (cfg.maxDailyProfitPctOfTotal > 0) {
        const totalProfitAllTime = Object.values(history).reduce((s, v) => s + Math.max(0, v ?? 0), 0);
        const todayProfit = Math.max(0, todayPnl);
        if (totalProfitAllTime > 0 && todayProfit > 0) {
          const todayPctOfTotal = (todayProfit / totalProfitAllTime) * 100;
          if (todayPctOfTotal >= cfg.maxDailyProfitPctOfTotal) {
            return { allowed: false, reason: `consistency rule — today's profit already ${todayPctOfTotal.toFixed(0)}% of total`, riskMultiplier: 1 };
          }
        }
      }
    }
  }
  return { allowed: true, riskMultiplier };
}

// ── Dual-Vote Consensus — Quant Rules Agent (trend/RSI/MACD score already
// computed) + AI Agent (real LLM second opinion). ───────────────────────────
type QuantVerdict = 'CONFIRM' | 'WATCH' | 'SKIP';
type ConsensusLabel = 'STRONG_CONFIRM' | 'STRONG_SKIP' | 'CAUTION' | 'WATCH';

function quantVerdictFromScore(score: number | null): QuantVerdict {
  if (score === null) return 'SKIP';
  if (score >= 65) return 'CONFIRM';
  if (score >= 40) return 'WATCH';
  return 'SKIP';
}

async function getCryptocomAiConfirmation(userId: number, symbol: string, result: StrategyResult): Promise<{ confirmed: boolean; confidence: number; reasoning: string }> {
  try {
    const { getUniversalAIClientForUser } = await import('../openai');
    const client = await getUniversalAIClientForUser(userId);
    const system = 'You are a disciplined crypto perpetual futures second opinion. Given a rules-based signal, decide whether you would independently confirm or skip it. Respond ONLY with JSON: {"confirmed": boolean, "confidence": number (0-100), "reasoning": string}.';
    const user = `Symbol: ${symbol}\nStrategy: ${result.strategy}\nDirection: ${result.direction}\nQuant score: ${result.score}/100\nPrice: ${result.price}\nDaily change %: ${result.dailyChangePercent}\nReasoning: ${result.reasoning}`;
    const r = await (client as any).chat.completions.create({
      model: (client as any).defaultModel || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      max_tokens: 300, temperature: 0.3,
    });
    const parsed = JSON.parse(r.choices?.[0]?.message?.content || '{}');
    return { confirmed: !!parsed.confirmed, confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)), reasoning: String(parsed.reasoning || '') };
  } catch (err: any) {
    return { confirmed: false, confidence: 0, reasoning: `AI confirmation unavailable: ${err.message}` };
  }
}

interface ConsensusEntry {
  symbol: string; strategy: string;
  quantVerdict: QuantVerdict; quantScore: number;
  aiVerdict: 'CONFIRM' | 'SKIP'; aiConfidence: number; aiReasoning: string;
  consensus: ConsensusLabel; tradeAllowed: boolean; timestamp: string;
}

function pushConsensus(userId: number, entry: ConsensusEntry): void {
  (global as any).cryptocomEngineConsensus = (global as any).cryptocomEngineConsensus || {};
  const list: ConsensusEntry[] = (global as any).cryptocomEngineConsensus[userId] || [];
  const deduped = list.filter(e => e.symbol !== entry.symbol);
  (global as any).cryptocomEngineConsensus[userId] = [entry, ...deduped].slice(0, 20);
}

async function assembleConsensus(userId: number, symbol: string, result: StrategyResult, cfg: CryptocomEngineConfig): Promise<boolean> {
  const quantVerdict = quantVerdictFromScore(result.score);
  if (cfg.aiMode === 'rule_based') {
    const tradeAllowed = quantVerdict !== 'SKIP';
    pushConsensus(userId, {
      symbol, strategy: result.strategy, quantVerdict, quantScore: result.score ?? 0,
      aiVerdict: 'CONFIRM', aiConfidence: 0, aiReasoning: 'Rule-based mode — AI confirmation skipped.',
      consensus: quantVerdict === 'CONFIRM' ? 'STRONG_CONFIRM' : quantVerdict === 'SKIP' ? 'STRONG_SKIP' : 'WATCH',
      tradeAllowed, timestamp: new Date().toISOString(),
    });
    return tradeAllowed;
  }
  const ai = await getCryptocomAiConfirmation(userId, symbol, result);
  const aiVerdict: 'CONFIRM' | 'SKIP' = ai.confirmed && ai.confidence >= Math.max(60, cfg.minConfidence) ? 'CONFIRM' : 'SKIP';
  let consensus: ConsensusLabel;
  if (quantVerdict === 'CONFIRM' && aiVerdict === 'CONFIRM') consensus = 'STRONG_CONFIRM';
  else if (quantVerdict === 'SKIP' && aiVerdict === 'SKIP') consensus = 'STRONG_SKIP';
  else if ((quantVerdict === 'CONFIRM' && aiVerdict === 'SKIP') || (quantVerdict === 'SKIP' && aiVerdict === 'CONFIRM')) consensus = 'CAUTION';
  else consensus = 'WATCH';
  const tradeAllowed = consensus !== 'STRONG_SKIP' && aiVerdict === 'CONFIRM';
  pushConsensus(userId, { symbol, strategy: result.strategy, quantVerdict, quantScore: result.score ?? 0, aiVerdict, aiConfidence: ai.confidence, aiReasoning: ai.reasoning, consensus, tradeAllowed, timestamp: new Date().toISOString() });
  return tradeAllowed;
}

// ══════════════════════════════════════════════════════════════════════════
// Execution
// ══════════════════════════════════════════════════════════════════════════

async function executeSignal(service: CryptoComService, connection: CryptocomConnection, userId: number, symbol: string, result: StrategyResult, cfg: CryptocomEngineConfig): Promise<void> {
  if (!result.direction || !result.price) return;

  let account;
  try {
    account = await service.getAccountInfo();
  } catch (err: any) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'error', strategy: result.strategy, reasoning: `${symbol}: couldn't fetch account info: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    return;
  }

  const gateEquity = account.equity > 0 ? account.equity : cfg.accountBalance;
  const gate = await checkSafetyGates(userId, cfg, gateEquity);
  if (!gate.allowed) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but execution blocked — ${gate.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    return;
  }

  const sizingCfg = gate.riskMultiplier < 1 ? { ...cfg, riskPerTrade: cfg.riskPerTrade * gate.riskMultiplier } : cfg;
  const { quantity, reasoning: sizingReasoning } = await computeCryptocomQuantity(userId, sizingCfg, account.equity, result.price);
  if (quantity <= 0) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but sizing produced 0 quantity.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    return;
  }

  const atrDistance = Math.max(result.price * 0.01, result.price * 0.005); // ~1% stop distance proxy
  const stopLoss = result.direction === 'BUY' ? result.price - atrDistance : result.price + atrDistance;
  const takeProfit = result.direction === 'BUY' ? result.price + atrDistance * 2 : result.price - atrDistance * 2;

  let order;
  try {
    order = await service.placeOrder({ instrumentName: symbol, side: result.direction, quantity, type: 'MARKET' });
  } catch (err: any) {
    await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'error', strategy: result.strategy, reasoning: `${symbol}: order failed: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    return;
  }

  await storage.createCryptocomEngineTrade({
    userId, connectionId: connection.id, symbol, strategy: result.strategy,
    direction: result.direction === 'BUY' ? 'long' : 'short', quantity,
    entryPrice: result.price, stopLoss, takeProfit,
    entryOrderId: order.orderId, entryReasoning: result.reasoning, status: 'open',
  });

  await storage.createCryptocomEngineActivity({
    userId, symbol, decision: 'signal', strategy: result.strategy,
    reasoning: `${symbol}: EXECUTED — ${result.direction === 'BUY' ? 'long' : 'short'} ${quantity} @ ~$${result.price.toFixed(2)}. ${result.reasoning}${sizingReasoning ? ` ${sizingReasoning}` : ''}`,
    score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom',
  });
}

// ══════════════════════════════════════════════════════════════════════════
// Main scan loop — same manual-Start/DB-restore pattern as every other
// engine in this app (no auto-start for users who've never clicked Start).
// ══════════════════════════════════════════════════════════════════════════

async function scanOneUser(userId: number): Promise<void> {
  const config = await storage.getUserCryptocomEngineConfig(userId);
  if (!config || !config.isActive) return;

  const now = Date.now();
  const last = lastScanAt.get(userId) || 0;
  if (now - last < Math.max(MIN_SCAN_INTERVAL_MS, config.scanIntervalMs)) return;
  lastScanAt.set(userId, now);

  const connections = await storage.getUserCryptocomConnections(userId);
  const activeConn = connections.find(c => c.isActive);
  if (!activeConn) {
    await storage.createCryptocomEngineActivity({ userId, symbol: '—', decision: 'error', reasoning: 'No active Crypto.com connection.', score: null, price: null, dailyChangePercent: null, source: 'cryptocom', strategy: null });
    return;
  }

  let service: CryptoComService;
  try {
    service = new CryptoComService(activeConn.apiKey, decryptApiSecret(activeConn.encryptedApiSecret));
  } catch (err: any) {
    await storage.createCryptocomEngineActivity({ userId, symbol: '—', decision: 'error', reasoning: `Could not decrypt credentials: ${err.message}`, score: null, price: null, dailyChangePercent: null, source: 'cryptocom', strategy: null });
    return;
  }

  await monitorOpenPositions(userId, config).catch((e: any) => console.error(`[cryptocom-scanner] monitorOpenPositions failed for user ${userId}:`, e.message));

  const canAutoExecute = activeConn.autoExecute && config.enableAutoExecution;
  const symbols: string[] = Array.isArray(config.symbols) ? config.symbols : [];

  for (const symbol of symbols) {
    try {
      const result = await scanSymbol(symbol, config);
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: result.decision, reasoning: result.reasoning, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom', strategy: result.strategy });
      if (result.decision === 'signal' && canAutoExecute) {
        const tradeAllowed = await assembleConsensus(userId, symbol, result, config).catch(() => true);
        if (tradeAllowed) {
          await executeSignal(service, activeConn, userId, symbol, result, config).catch((e: any) => console.error(`[cryptocom-scanner] executeSignal failed for ${symbol}:`, e.message));
        } else {
          await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: `${symbol}: signal confirmed by quant scan, but Dual-Vote Consensus blocked execution.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
        }
      }
    } catch (err: any) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'error', reasoning: `Scan failed for ${symbol}: ${err.message}`, score: null, price: null, dailyChangePercent: null, source: 'cryptocom', strategy: config.strategyMode });
    }
  }
}

export async function runCryptocomEngineScan(): Promise<void> {
  try {
    const configs = await storage.getAllActiveCryptocomEngineConfigs();
    for (const config of configs) {
      await scanOneUser(config.userId).catch((e: any) => console.error(`[cryptocom-scanner] user ${config.userId} scan failed:`, e.message));
    }
  } catch (err: any) {
    console.error('[cryptocom-scanner] runCryptocomEngineScan failed:', err.message);
  }
}

let started = false;
export function startCryptocomEngineScanner(): void {
  if (started) return;
  started = true;
  const LOOP_INTERVAL_MS = 60000;
  setInterval(() => { runCryptocomEngineScan().catch(() => {}); }, LOOP_INTERVAL_MS);
  console.log('[cryptocom-scanner] Background Crypto.com perpetuals scan loop started (60s tick, per-user throttled, strategies: trend_following/momentum/auto).');
}
