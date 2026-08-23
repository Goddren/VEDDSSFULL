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
import { getOrRefreshCryptoBrain, cryptoBrainSizeMultiplier, cryptoBrainGate, recordCryptoBrainOutcome } from './crypto-brain';
import { recordRealizedPnl } from './prop-firm-consistency';
import { cefiEntryBuy, cefiExitSell, baseCoin, type CefiVenue } from './cefi-executor';
import { defiEntryBuy, defiExitSell } from './defi-executor';

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

// ── Strategy: Order Flow (CVD proxy + VWAP) — institutional-pressure read on
// the 5-min candles, same shape as the options-engine order_flow strategy. ────
async function runOrderFlow(symbol: string, cfg: CryptocomEngineConfig): Promise<StrategyResult> {
  const bars = await CryptoComService.getCandles(symbol, '5m', 60);
  if (bars.length < 20) return { decision: 'error', reasoning: `${symbol}: not enough candles for order flow.`, score: null, price: null, dailyChangePercent: null, strategy: 'order_flow' };
  const c = convertToCandles(bars);
  const price = c[c.length - 1].c;
  const dailyChangePercent = ((price - c[0].c) / c[0].c) * 100;
  const win = c.slice(-30);
  // VWAP over the window
  let pv = 0, vv = 0; for (const b of win) { const tp = (b.h + b.l + b.c) / 3; pv += tp * (b.v ?? 0); vv += (b.v ?? 0); }
  const vwap = vv > 0 ? pv / vv : price;
  // CVD proxy: signed volume by candle direction; compare recent half vs prior half
  const delta = win.map(b => (b.c >= b.o ? 1 : -1) * (b.v ?? 0));
  const mid = Math.floor(delta.length / 2);
  const cvdFirst = delta.slice(0, mid).reduce((s, d) => s + d, 0);
  const cvdSecond = delta.slice(mid).reduce((s, d) => s + d, 0);
  const cvdShiftPct = vv > 0 ? ((cvdSecond - cvdFirst) / vv) * 100 : 0;
  const rangePct = ((Math.max(...win.map(b => b.h)) - Math.min(...win.map(b => b.l))) / price) * 100;
  const last = win[win.length - 1];
  let direction: 'BUY' | 'SELL' | null = null;
  if (rangePct >= 0.8 && price > vwap && cvdShiftPct > 0 && last.c >= last.o) direction = 'BUY';
  else if (rangePct >= 0.8 && price < vwap && cvdShiftPct < 0 && last.c <= last.o) direction = 'SELL';
  if (!direction) return { decision: 'watching', reasoning: `${symbol}: order flow balanced (range ${rangePct.toFixed(2)}%, CVD shift ${cvdShiftPct.toFixed(1)}%, price ${price > vwap ? 'above' : 'below'} VWAP).`, score: 45, price, dailyChangePercent, strategy: 'order_flow' };
  const score = Math.round(Math.min(92, 60 + Math.min(20, Math.abs(cvdShiftPct)) + Math.min(12, rangePct)));
  const directionAllowed = cfg.directionFilter === 'both' || (cfg.directionFilter === 'long_only' && direction === 'BUY') || (cfg.directionFilter === 'short_only' && direction === 'SELL');
  if (!directionAllowed) return { decision: 'skipped', reasoning: `${symbol}: ${direction} order-flow read, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: 'order_flow' };
  if (score < cfg.minConfidence) return { decision: 'watching', reasoning: `${symbol}: ${direction} order flow (CVD ${cvdShiftPct.toFixed(1)}%) but score ${score}/100 below ${cfg.minConfidence}.`, score, price, dailyChangePercent, strategy: 'order_flow' };
  return { decision: 'signal', score, price, dailyChangePercent, strategy: 'order_flow', direction, reasoning: `${symbol}: ${direction} order flow — CVD shift ${cvdShiftPct.toFixed(1)}%, price ${direction === 'BUY' ? 'above' : 'below'} VWAP $${vwap.toFixed(2)}, ${rangePct.toFixed(2)}% range. Score ${score}/100.` };
}

// ── Strategy: Volume Profile (POC / Value Area breakout) ─────────────────────
async function runVolumeProfile(symbol: string, cfg: CryptocomEngineConfig): Promise<StrategyResult> {
  const bars = await CryptoComService.getCandles(symbol, '15m', 96);
  if (bars.length < 40) return { decision: 'error', reasoning: `${symbol}: not enough candles for volume profile.`, score: null, price: null, dailyChangePercent: null, strategy: 'volume_profile' };
  const c = convertToCandles(bars);
  const price = c[c.length - 1].c;
  const dailyChangePercent = ((price - c[0].c) / c[0].c) * 100;
  const hi = Math.max(...c.map(b => b.h)), lo = Math.min(...c.map(b => b.l));
  const bins = 24, binSize = (hi - lo) / bins || 1;
  const vol = new Array(bins).fill(0);
  for (const b of c) { const tp = (b.h + b.l + b.c) / 3; let i = Math.floor((tp - lo) / binSize); i = Math.max(0, Math.min(bins - 1, i)); vol[i] += (b.v ?? 0); }
  const total = vol.reduce((a, b) => a + b, 0) || 1;
  let poc = 0; for (let i = 1; i < bins; i++) if (vol[i] > vol[poc]) poc = i;
  let inc = vol[poc], loI = poc, hiI = poc;
  while (inc < total * 0.7 && (loI > 0 || hiI < bins - 1)) { const d = loI > 0 ? vol[loI - 1] : -1; const u = hiI < bins - 1 ? vol[hiI + 1] : -1; if (u >= d) { hiI++; inc += vol[hiI]; } else { loI--; inc += vol[loI]; } }
  const VAL = lo + loI * binSize, VAH = lo + (hiI + 1) * binSize;
  const avgVol = total / c.length, recentVol = c.slice(-3).reduce((s, b) => s + (b.v ?? 0), 0) / 3;
  const volConfirm = recentVol > avgVol;
  let direction: 'BUY' | 'SELL' | null = null;
  if (price > VAH && volConfirm) direction = 'BUY'; else if (price < VAL && volConfirm) direction = 'SELL';
  if (!direction) return { decision: 'watching', reasoning: `${symbol}: inside/at value area $${VAL.toFixed(2)}–$${VAH.toFixed(2)} or volume not confirming — no VP edge.`, score: 46, price, dailyChangePercent, strategy: 'volume_profile' };
  const dist = direction === 'BUY' ? (price - VAH) / binSize : (VAL - price) / binSize;
  const score = Math.round(Math.max(55, Math.min(90, 60 + dist * 8)));
  const directionAllowed = cfg.directionFilter === 'both' || (cfg.directionFilter === 'long_only' && direction === 'BUY') || (cfg.directionFilter === 'short_only' && direction === 'SELL');
  if (!directionAllowed) return { decision: 'skipped', reasoning: `${symbol}: ${direction} VP breakout, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: 'volume_profile' };
  if (score < cfg.minConfidence) return { decision: 'watching', reasoning: `${symbol}: ${direction} VP breakout but score ${score}/100 below ${cfg.minConfidence}.`, score, price, dailyChangePercent, strategy: 'volume_profile' };
  return { decision: 'signal', score, price, dailyChangePercent, strategy: 'volume_profile', direction, reasoning: `${symbol}: ${direction} value-area ${direction === 'BUY' ? 'breakout above ' + VAH.toFixed(2) : 'breakdown below ' + VAL.toFixed(2)} (POC ~$${(lo + (poc + 0.5) * binSize).toFixed(2)}), volume confirming. Score ${score}/100.` };
}

// ── Strategy: Breakout (N-period high/low with volume confirm) ───────────────
async function runBreakout(symbol: string, cfg: CryptocomEngineConfig): Promise<StrategyResult> {
  const bars = await CryptoComService.getCandles(symbol, '1h', 60);
  if (bars.length < 25) return { decision: 'error', reasoning: `${symbol}: not enough candles for breakout.`, score: null, price: null, dailyChangePercent: null, strategy: 'breakout' };
  const c = convertToCandles(bars);
  const price = c[c.length - 1].c;
  const dailyChangePercent = ((price - c[0].c) / c[0].c) * 100;
  const lookback = 20;
  const prior = c.slice(-(lookback + 1), -1);
  const priorHigh = Math.max(...prior.map(b => b.h)), priorLow = Math.min(...prior.map(b => b.l));
  const avgVol = prior.reduce((s, b) => s + (b.v ?? 0), 0) / prior.length;
  const last = c[c.length - 1];
  let direction: 'BUY' | 'SELL' | null = null;
  if (last.c > priorHigh) direction = 'BUY'; else if (last.c < priorLow) direction = 'SELL';
  if (!direction) return { decision: 'watching', reasoning: `${symbol}: inside its ${lookback}h range $${priorLow.toFixed(2)}–$${priorHigh.toFixed(2)} — no breakout.`, score: 45, price, dailyChangePercent, strategy: 'breakout' };
  const volConfirm = (last.v ?? 0) > avgVol;
  if (!volConfirm) return { decision: 'watching', reasoning: `${symbol}: ${direction} breakout of ${lookback}h range but volume not confirming (${Math.round(last.v ?? 0)} vs avg ${Math.round(avgVol)}).`, score: 52, price, dailyChangePercent, strategy: 'breakout' };
  const score = Math.round(Math.min(90, 65 + Math.min(20, (Math.abs(last.c - (direction === 'BUY' ? priorHigh : priorLow)) / price) * 2000)));
  const directionAllowed = cfg.directionFilter === 'both' || (cfg.directionFilter === 'long_only' && direction === 'BUY') || (cfg.directionFilter === 'short_only' && direction === 'SELL');
  if (!directionAllowed) return { decision: 'skipped', reasoning: `${symbol}: ${direction} breakout, but direction filter is "${cfg.directionFilter}".`, score, price, dailyChangePercent, strategy: 'breakout' };
  if (score < cfg.minConfidence) return { decision: 'watching', reasoning: `${symbol}: ${direction} volume-confirmed breakout but score ${score}/100 below ${cfg.minConfidence}.`, score, price, dailyChangePercent, strategy: 'breakout' };
  return { decision: 'signal', score, price, dailyChangePercent, strategy: 'breakout', direction, reasoning: `${symbol}: ${direction} volume-confirmed breakout of ${lookback}h range ($${priorLow.toFixed(2)}–$${priorHigh.toFixed(2)}), now $${price.toFixed(2)}. Score ${score}/100.` };
}

const STRATEGY_RUNNERS: Record<string, (sym: string, cfg: CryptocomEngineConfig) => Promise<StrategyResult>> = {
  trend_following: runTrendFollowing,
  momentum: runMomentum,
  order_flow: runOrderFlow,
  volume_profile: runVolumeProfile,
  breakout: runBreakout,
};

const AUTO_STRATEGIES = ['trend_following', 'momentum', 'order_flow', 'volume_profile', 'breakout'];

async function scanSymbol(symbol: string, cfg: CryptocomEngineConfig): Promise<StrategyResult> {
  if (cfg.strategyMode === 'auto') {
    const results = await Promise.all(AUTO_STRATEGIES.map(k => STRATEGY_RUNNERS[k](symbol, cfg).catch(() => null)));
    const valid = results.filter((r): r is StrategyResult => !!r);
    const signals = valid.filter(r => r.decision === 'signal').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (signals.length > 0) return signals[0];
    // Composite autonomous entry — no single strategy cleared its bar, but if a
    // majority agree on direction and the blended score clears the floor, take it.
    if ((cfg as any).enableCompositeAutonomous) {
      const dir = valid.filter(r => r.direction);
      const buys = dir.filter(r => r.direction === 'BUY'), sells = dir.filter(r => r.direction === 'SELL');
      const side = buys.length > sells.length ? buys : sells.length > buys.length ? sells : [];
      if (side.length >= 2) {
        const composite = Math.round(side.reduce((s, r) => s + (r.score ?? 0), 0) / side.length);
        const floor = (cfg as any).compositeMinEdgeScore ?? 72;
        if (composite >= floor) {
          const direction = side[0].direction!;
          const allowed = cfg.directionFilter === 'both' || (cfg.directionFilter === 'long_only' && direction === 'BUY') || (cfg.directionFilter === 'short_only' && direction === 'SELL');
          if (allowed) return { decision: 'signal', score: composite, price: side[0].price, dailyChangePercent: side[0].dailyChangePercent, strategy: 'composite_autonomous', direction, reasoning: `${symbol}: Composite Autonomous Entry — ${side.length} strategies agree ${direction}, blended ${composite}/100 (floor ${floor}).` };
        }
      }
    }
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

async function computeCryptocomQuantity(userId: number, cfg: CryptocomEngineConfig, accountBalance: number, price: number, symbol?: string): Promise<{ quantity: number; reasoning: string }> {
  if (!price || price <= 0 || accountBalance <= 0) return { quantity: 0, reasoning: '' };
  const riskAmount = accountBalance * (cfg.riskPerTrade / 100) * cfg.leverage;
  let baseQty = Math.max(0, Math.round((riskAmount / price) * 1000) / 1000);

  // Self-learning brain reweight: scale sizing by what has actually been winning
  // for THIS symbol (bounded 0.25–1.5, neutral until ≥10 trades). Reweight is
  // always on when the brain is enabled — it never hard-blocks here (that's the
  // opt-in gate in the scan path).
  let brainNote = '';
  if ((cfg as any).cryptoBrainEnabled !== false && symbol) {
    const bm = cryptoBrainSizeMultiplier(userId, symbol);
    if (bm !== 1.0) { baseQty = Math.round(baseQty * bm * 1000) / 1000; brainNote = ` 🧠 Brain ${bm}× (${symbol}).`; }
  }

  if (cfg.brainLearningMode) {
    const stats = await storage.getCryptocomEngineTradeStats(userId);
    const brainLocked = stats.totalClosed < 10 || stats.winRate < 60;
    if (brainLocked) {
      return { quantity: baseQty > 0 ? Math.min(baseQty, Math.max(0.001, baseQty * 0.25)) : 0, reasoning: `🧠 Learning Mode: sized conservatively (${stats.totalClosed}/10 trades, ${stats.winRate}%/60% WR).` };
    }
    if (cfg.useKellyCriterion) {
      const fractionalKelly = (stats.winRate / 100) * 0.25;
      return { quantity: baseQty * (1 + fractionalKelly), reasoning: `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) + Kelly sizing.${brainNote}` };
    }
    return { quantity: baseQty, reasoning: `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) — full risk sizing.${brainNote}` };
  }
  if (cfg.useKellyCriterion) {
    const stats = await storage.getCryptocomEngineTradeStats(userId);
    const fractionalKelly = (stats.winRate / 100) * 0.25;
    return { quantity: baseQty * (1 + fractionalKelly), reasoning: `Kelly sizing (${stats.winRate}% WR over ${stats.totalClosed} trades).${brainNote}` };
  }
  return { quantity: baseQty, reasoning: brainNote.trim() };
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
  if (openTrades.length === 0) return;

  for (const trade of openTrades) {
    try {
      // CeFi spot trades: fixed %-TP/%-SL against the public price, always checked.
      if ((trade as any).venue && (trade as any).venue !== 'cryptocom') {
        const { getAggregatedQuote } = await import('./crypto-market-data');
        const q = await getAggregatedQuote(baseCoin(trade.symbol)).catch(() => null);
        const px = q?.best?.price ?? 0;
        if (!px) continue;
        if (trade.takeProfit && px >= trade.takeProfit) { await closePosition(userId, trade, px, 'take_profit'); continue; }
        if (trade.stopLoss && px <= trade.stopLoss) { await closePosition(userId, trade, px, 'stop_loss'); continue; }
        continue;
      }
      if (cfg.trailMethod === 'none') continue; // perp trailing only when enabled
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
    const venue = trade.venue && trade.venue !== 'cryptocom' ? trade.venue : null;
    if (venue === 'defi') {
      // DeFi exit — swap the held token back to USDC via the hot wallet.
      const cfg = await storage.getUserCryptocomEngineConfig(userId).catch(() => null);
      const exit = await defiExitSell(userId, (cfg as any)?.defiChain || 'base', baseCoin(trade.symbol), trade.quantity, (cfg as any)?.defiSlippageBps ?? 100).catch(() => null);
      if (exit?.exitPrice) currentPrice = exit.exitPrice;
    } else if (venue) {
      // CeFi spot exit — sell the held base amount on the venue.
      const exit = await cefiExitSell(userId, venue as CefiVenue, baseCoin(trade.symbol), trade.quantity).catch(() => null);
      if (exit?.exitPrice) currentPrice = exit.exitPrice;
    } else {
      const connection = await storage.getUserCryptocomConnections(userId).then(c => c.find(x => x.id === trade.connectionId));
      if (connection) {
        const service = new CryptoComService(connection.apiKey, decryptApiSecret(connection.encryptedApiSecret));
        const closeSide = trade.direction === 'long' ? 'SELL' : 'BUY';
        await service.placeOrder({ instrumentName: trade.symbol, side: closeSide, quantity: trade.quantity, type: 'MARKET' }).catch(() => {});
      }
    }
    const realizedPnl = (trade.direction === 'long' ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) * trade.quantity;
    await storage.closeCryptocomEngineTrade(trade.id, { exitPrice: currentPrice, exitReason: reason, realizedPnl });
    await storage.createCryptocomEngineActivity({
      userId, symbol: trade.symbol, decision: 'signal', strategy: trade.strategy,
      reasoning: `${trade.symbol}: CLOSED ${trade.quantity} @ ~$${currentPrice.toFixed(2)} (${reason.replace('_', ' ')}). Realized P&L: $${realizedPnl.toFixed(2)}.`,
      score: null, price: currentPrice, dailyChangePercent: null, source: 'cryptocom',
    });
    // Feed the shared prop-firm consistency ledger (no-op unless the connection
    // is flagged prop-firm) and the self-learning brain feature store.
    try { await recordRealizedPnl(userId, trade.connectionId, 'cryptocom', realizedPnl); } catch { /* non-critical */ }
    try {
      const notional = (trade.entryPrice || 0) * (trade.quantity || 0);
      const returnPct = notional > 0 ? (realizedPnl / notional) * 100 : 0;
      const entered = trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now();
      await recordCryptoBrainOutcome({
        userId, symbol: trade.symbol, strategy: trade.strategy || 'unknown', direction: trade.direction,
        entryConfidence: trade.entryConfidence ?? null, returnPct,
        holdingMinutes: Math.max(0, Math.round((Date.now() - entered) / 60000)), exitReason: reason, profitLoss: realizedPnl,
      });
    } catch { /* non-critical */ }
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

    // ── Ruin Guard — hard circuit breaker (opt-in), parity with the FX/Kalshi
    // engines. Halts NEW trades once a hard daily-loss or drawdown limit (% of
    // the configured account balance) is hit, instead of merely down-sizing.
    if ((cfg as any).ruinGuardEnabled) {
      const base = cfg.accountBalance > 0 ? cfg.accountBalance : equity;
      const dailyLimitPct = (cfg as any).dailyLossLimitPct ?? 5;
      const maxDdPct = (cfg as any).maxDrawdownLimitPct ?? 10;
      if (dailyLimitPct > 0 && todayPnl <= -(base * dailyLimitPct / 100)) {
        return { allowed: false, reason: `🛑 Ruin Guard: daily P&L hit the −${dailyLimitPct}% limit — halted until next UTC day`, riskMultiplier: 1 };
      }
      if (maxDdPct > 0 && ddFromPeakPct >= maxDdPct) {
        return { allowed: false, reason: `🛑 Ruin Guard: drawdown ${ddFromPeakPct.toFixed(1)}% from peak hit the ${maxDdPct}% max-DD limit — halted until equity recovers`, riskMultiplier: 1 };
      }
    }

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

// Lightweight numeric second-opinion — used as the FALLBACK when the full SS AI
// reasoner can't run (no candles, model error, etc.). Text-from-numbers only.
async function getCryptocomAiConfirmationLite(userId: number, symbol: string, result: StrategyResult): Promise<{ confirmed: boolean; confidence: number; reasoning: string }> {
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

// SS AI reasoning for crypto — reuses the EXACT same confirmation brain the FX
// SS AI Engine runs (getAiVisionConfirmation), fed this pair's live candles +
// full indicator suite. Despite the "vision" name that function reasons from a
// text-serialized candle/indicator context (not a screenshot), so it drops in
// cleanly for crypto pairs. On any failure it degrades to the lite numeric
// second-opinion above so the gate never silently hard-blocks (vision + fallback).
async function getCryptocomAiConfirmation(userId: number, symbol: string, result: StrategyResult): Promise<{ confirmed: boolean; confidence: number; reasoning: string }> {
  try {
    const bars = await CryptoComService.getCandles(symbol, '5m', 100);
    if (!bars || bars.length < 30) return getCryptocomAiConfirmationLite(userId, symbol, result);
    const candles = convertToCandles(bars);
    const indicators = computeAllAdvancedIndicators(candles, 0, symbol, 'M5');
    const { getAiVisionConfirmation } = await import('../openai');
    const proposedSignal = result.direction === 'BUY' ? 'BUY' : result.direction === 'SELL' ? 'SELL' : 'NEUTRAL';
    const tradePlan = { direction: proposedSignal, entry: result.price, strategy: result.strategy };
    const conf: any = await getAiVisionConfirmation(
      candles, indicators, proposedSignal, Math.max(0, Math.min(100, result.score ?? 0)),
      tradePlan, symbol, 'M5', userId,
      undefined, null, null, undefined, null, undefined, undefined,
      `crypto-${result.strategy}`, false,
    );
    if (!conf || (conf.aiConfidence === undefined && conf.confirmed === undefined)) {
      return getCryptocomAiConfirmationLite(userId, symbol, result);
    }
    // SS AI must agree on DIRECTION too — a confirmed long on a SELL signal is a skip.
    const dirOk = !conf.aiDirection || conf.aiDirection === 'NEUTRAL' || conf.aiDirection === proposedSignal;
    return {
      confirmed: !!conf.confirmed && dirOk,
      confidence: Math.max(0, Math.min(100, Number(conf.aiConfidence) || 0)),
      reasoning: `[SS AI${conf.modelUsed ? ` · ${conf.modelUsed}` : ''}] ${String(conf.reasoning || 'no reasoning returned')}${dirOk ? '' : ` (direction mismatch: AI says ${conf.aiDirection}, signal is ${proposedSignal} — skipped)`}`,
    };
  } catch (err: any) {
    // Never hard-fail the gate on an SS AI error — fall back to the numeric opinion.
    return getCryptocomAiConfirmationLite(userId, symbol, result);
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
  // Mirror to the durable table so a server restart doesn't blank the panel
  // until the next scan cycle happens to run (fire-and-forget, non-fatal).
  import('./engine-consensus').then(({ recordEngineConsensus }) =>
    recordEngineConsensus(userId, 'cryptocom', entry)
  ).catch(() => {});
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

  const venue = (cfg as any).executionVenue as string;

  // ── DeFi hot-wallet routing (Phase B) — unattended on-chain 0x swaps ────────
  // When the engine is set to the DeFi venue AND defiAutoTradeEnabled is on, route
  // BUY signals as USDC->token swaps signed by the burner hot wallet. Long-only.
  if (venue === 'defi' && (cfg as any).defiAutoTradeEnabled) {
    if (result.direction !== 'BUY') {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: `${symbol}: DeFi swaps are long-only — SELL/short signals aren't traded on-chain.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
      return;
    }
    const gateD = await checkSafetyGates(userId, cfg, cfg.accountBalance);
    if (!gateD.allowed) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but execution blocked — ${gateD.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
      return;
    }
    const chain = (cfg as any).defiChain || 'base';
    const slip = (cfg as any).defiSlippageBps ?? 100;
    const notionalD = Math.max(1, (cfg as any).defiNotionalUsd ?? 25) * (gateD.riskMultiplier < 1 ? gateD.riskMultiplier : 1);
    try {
      const r = await defiEntryBuy(userId, chain, symbol, notionalD, slip);
      if (!r.ok) {
        await storage.createCryptocomEngineActivity({ userId, symbol, decision: r.reason?.includes("can't trade") ? 'skipped' : 'error', strategy: result.strategy, reasoning: `${symbol}: DeFi swap entry ${r.reason?.includes("can't trade") ? 'skipped' : 'failed'} — ${r.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
        return;
      }
      const tp = r.entryPrice * (1 + ((cfg as any).cefiTakeProfitPct ?? 3) / 100);
      const sl = r.entryPrice * (1 - ((cfg as any).cefiStopLossPct ?? 2) / 100);
      await storage.createCryptocomEngineTrade({
        userId, connectionId: connection?.id ?? 0, venue: 'defi', symbol, strategy: result.strategy,
        direction: 'long', quantity: r.qtyBase, entryPrice: r.entryPrice, stopLoss: sl, takeProfit: tp,
        entryOrderId: r.txHash ?? '', entryReasoning: result.reasoning, status: 'open',
      } as any);
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'signal', strategy: result.strategy, reasoning: `${symbol}: EXECUTED on DeFi (${chain}) — swapped ~$${notionalD.toFixed(0)} USDC → ${r.qtyBase} ${r.token} @ ~$${r.entryPrice.toFixed(2)}. TP +${(cfg as any).cefiTakeProfitPct ?? 3}% / SL -${(cfg as any).cefiStopLossPct ?? 2}%. tx ${r.txHash?.slice(0, 12) ?? ''}… ${result.reasoning}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    } catch (err: any) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'error', strategy: result.strategy, reasoning: `${symbol}: DeFi swap error: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    }
    return;
  }

  // ── CeFi spot routing (Coinbase / Kraken / Gemini) ─────────────────────────
  // When the engine is set to a spot venue AND CeFi auto-trade is explicitly on,
  // route the signal there instead of Crypto.com perps. Spot is long-only.
  if (venue && venue !== 'cryptocom' && venue !== 'defi' && (cfg as any).cefiAutoTradeEnabled) {
    if (result.direction !== 'BUY') {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: `${symbol}: ${venue} is spot (long-only) — SELL/short signals aren't traded on this venue.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
      return;
    }
    // Respect max-open + daily caps via the same gate (equity=configured balance).
    const gateC = await checkSafetyGates(userId, cfg, cfg.accountBalance);
    if (!gateC.allowed) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: `${symbol}: signal confirmed, but execution blocked — ${gateC.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
      return;
    }
    const base = baseCoin(symbol);
    const notional = Math.max(1, (cfg as any).cefiNotionalUsd ?? 25) * (gateC.riskMultiplier < 1 ? gateC.riskMultiplier : 1);
    try {
      const r = await cefiEntryBuy(userId, venue as CefiVenue, base, notional);
      if (!r.ok) {
        await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'error', strategy: result.strategy, reasoning: `${symbol}: ${venue} spot entry failed — ${r.reason}.`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
        return;
      }
      await storage.createCryptocomEngineTrade({
        userId, connectionId: connection?.id ?? 0, venue, symbol: r.venueSymbol, strategy: result.strategy,
        direction: 'long', quantity: r.qtyBase, entryPrice: r.entryPrice,
        stopLoss: r.entryPrice * (1 - ((cfg as any).cefiStopLossPct ?? 2) / 100),
        takeProfit: r.entryPrice * (1 + ((cfg as any).cefiTakeProfitPct ?? 3) / 100),
        entryOrderId: r.orderId, entryReasoning: result.reasoning, status: 'open',
      } as any);
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'signal', strategy: result.strategy, reasoning: `${symbol}: EXECUTED on ${venue.toUpperCase()} — spot BUY ${r.qtyBase} ${base} (~$${notional.toFixed(0)}) @ ~$${r.entryPrice.toFixed(2)}. TP +${(cfg as any).cefiTakeProfitPct ?? 3}% / SL -${(cfg as any).cefiStopLossPct ?? 2}%. ${result.reasoning}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    } catch (err: any) {
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'error', strategy: result.strategy, reasoning: `${symbol}: ${venue} spot order error: ${err.message}`, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
    }
    return;
  }

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
  // Size off the SAME equity the safety gate used (gateEquity), which falls back
  // to the configured accountBalance when the live margin wallet reads 0. Passing
  // raw account.equity here meant a 0-equity derivatives wallet (funds in spot /
  // unfunded margin side) passed the gate but sized to 0 → signal skipped, never
  // traded. This is the "detecting signals but never executing" trap.
  const { quantity, reasoning: sizingReasoning } = await computeCryptocomQuantity(userId, sizingCfg, gateEquity, result.price, symbol);
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

  // Warm the self-learning brain once per cycle so sizing/gating read fresh learning.
  if ((config as any).cryptoBrainEnabled !== false) await getOrRefreshCryptoBrain(userId).catch(() => {});

  const canAutoExecute = activeConn.autoExecute && config.enableAutoExecution;
  const symbols: string[] = Array.isArray(config.symbols) ? config.symbols : [];

  for (const symbol of symbols) {
    try {
      const result = await scanSymbol(symbol, config);
      await storage.createCryptocomEngineActivity({ userId, symbol, decision: result.decision, reasoning: result.reasoning, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom', strategy: result.strategy });
      if (result.decision === 'signal' && canAutoExecute) {
        // Brain gate (opt-in hard-block): skip symbols/strategies/hours proven to lose.
        if ((config as any).cryptoBrainEnabled !== false && (config as any).cryptoBrainGating) {
          const g = cryptoBrainGate(userId, symbol, result.strategy, new Date().getUTCHours());
          if (g.blocked) {
            await storage.createCryptocomEngineActivity({ userId, symbol, decision: 'skipped', strategy: result.strategy, reasoning: g.reason, score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'cryptocom' });
            continue;
          }
        }
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
