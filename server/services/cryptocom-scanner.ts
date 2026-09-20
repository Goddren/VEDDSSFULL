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
// NOTE: defi-executor is imported LAZILY (dynamic import at the two call sites
// below) — it pulls in defi-swap → ethers, a heavy stack. Keeping it out of the
// module's static graph means the crypto scanner boots without loading ethers,
// so ENABLE_CRYPTO_ENGINE=true is memory-safe for CeFi/perps users. ethers only
// loads if a DeFi trade actually fires.

const MIN_SCAN_INTERVAL_MS = 60000; // trimmed footprint: min 60s between per-user scans (was 30s)
const lastScanAt = new Map<number, number>();
// Cap how many symbols are processed per scan cycle to bound per-cycle memory/CPU
// (candle fetch + full indicator suite per symbol). Large watchlists are covered
// by ROTATING through them across cycles instead of scanning all at once.
const MAX_SYMBOLS_PER_CYCLE = 5; // trimmed footprint: smaller working set per cycle (was 12); cursor still covers the full list over successive cycles
const scanCursor = new Map<number, number>();

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
      // ── PERPS ───────────────────────────────────────────────────────────────
      // Entry places a bare MARKET order — nothing is ever attached at the
      // venue — so trade.stopLoss / trade.takeProfit exist ONLY as DB columns
      // and this loop is the entire protection. It used to open with
      //     if (cfg.trailMethod === 'none') continue;
      // which sat ABOVE the hard-stop check. trail_method defaults to 'none'
      // (schema.ts:913), so on a default config the loop skipped every position
      // on every cycle: no venue stop, no software stop, a leveraged position
      // running to liquidation. Take-profit was never checked here in ANY
      // config, so a perp could blow through its TP and round-trip.
      //
      // Stop-loss and take-profit are protection and now ALWAYS run. Only the
      // TRAILING logic — which is an optimisation, not protection — stays gated
      // on trailMethod.
      const currentPrice = await CryptoComService.getTicker(trade.symbol);
      // A failed/zero ticker read must not be mistaken for a price: getTicker
      // returns null on a non-ok response, and closing on a bogus 0 would book
      // a catastrophic fake loss.
      if (!currentPrice || currentPrice <= 0) continue;

      const isLong = trade.direction === 'long';

      // Absolute price stops first — these work even when riskDistance is
      // unusable (e.g. stopLoss equal to entry), which the R-multiple path below
      // cannot evaluate.
      if (trade.takeProfit && (isLong ? currentPrice >= trade.takeProfit : currentPrice <= trade.takeProfit)) {
        await closePosition(userId, trade, currentPrice, 'take_profit');
        continue;
      }
      if (trade.stopLoss && (isLong ? currentPrice <= trade.stopLoss : currentPrice >= trade.stopLoss)) {
        await closePosition(userId, trade, currentPrice, 'stop_loss');
        continue;
      }

      // R-multiple bookkeeping + trailing. Needs a usable risk distance.
      if (!trade.stopLoss) continue;
      const riskDistance = Math.abs(trade.entryPrice - trade.stopLoss);
      if (riskDistance <= 0) continue;
      const currentR = isLong ? (currentPrice - trade.entryPrice) / riskDistance : (trade.entryPrice - currentPrice) / riskDistance;
      const peakR = Math.max(trade.peakRMultiple, currentR);
      const armed = trade.trailArmed || peakR >= cfg.trailActivationR;

      if (currentR <= -1) { // hard stop already breached
        await closePosition(userId, trade, currentPrice, 'stop_loss');
        continue;
      }
      if (cfg.trailMethod !== 'none' && armed) {
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
  // ── Claim the trade BEFORE sending any order ────────────────────────────────
  // 'open' -> 'closing', atomically. Whoever loses the race gets undefined and
  // returns without touching the venue. This is the guard against a DUPLICATE
  // CLOSE ORDER: manualCloseCryptoTrade runs in the WEB process (dashboard Close
  // button) while monitorOpenPositions runs in the worker/cron, and both could
  // previously fire a market close for the same trade. On a perpetual the second
  // order does not flatten — it opens an equal REVERSED position. It also
  // double-wrote crypto_brain_outcomes and double-counted into
  // prop_firm_daily_pnl, which is a non-idempotent accumulator.
  const claimed = await storage.claimCryptocomEngineTradeForClose(trade.id).catch((e: any) => {
    console.error(`[cryptocom-scanner] could not claim trade ${trade.id} for close (${e?.message}) — skipping to avoid a duplicate order`);
    return undefined;
  });
  if (!claimed) {
    console.warn(`[cryptocom-scanner] trade ${trade.id} already being closed by another process — skipping duplicate close`);
    return;
  }
  // Any path that does NOT complete the close must hand the claim back, or the
  // trade is stranded in 'closing' where nothing monitors it.
  let finished = false;
  try {
    const venue = trade.venue && trade.venue !== 'cryptocom' ? trade.venue : null;
    if (venue === 'defi') {
      // DeFi exit — swap the held token back to USDC via the hot wallet.
      const cfg = await storage.getUserCryptocomEngineConfig(userId).catch(() => null);
      await phase(`exit:trade_${trade.id}:defi_swap`); // the likeliest hang: an unbounded on-chain wait
      const { defiExitSell } = await import('./defi-executor'); // lazy — loads ethers only on a real DeFi exit
      const exit = await defiExitSell(userId, (cfg as any)?.defiChain || 'base', baseCoin(trade.symbol), trade.quantity, (cfg as any)?.defiSlippageBps ?? 100).catch((e: any) => ({ ok: false, exitPrice: 0, reason: e?.message || String(e) } as any));
      // A7: NEVER book a close the broker/chain didn't actually execute. If the
      // swap failed (needs token approval, no liquidity, RPC error, etc.) leave
      // the trade OPEN for retry next cycle — booking a phantom close would
      // record fabricated P&L while the tokens still sit in the hot wallet.
      // The tokens are not on-chain. Retrying cannot help: every attempt builds
      // a swap for a balance that does not exist, fails, and costs gas. Park the
      // trade so it leaves the exit loop, WITHOUT inventing a P&L for it.
      if ((exit as any)?.phantom) {
        console.error(`[cryptocom-scanner] trade ${trade.id} (${trade.symbol}) is NOT on-chain: ${(exit as any).reason} — flagging for reconciliation, no further exit attempts`);
        await storage.flagCryptocomEngineTradeUnreconciled(trade.id, String((exit as any).reason).slice(0, 500)).catch((e: any) =>
          console.error(`[cryptocom-scanner] could not flag trade ${trade.id} (${e?.message}) — it will keep retrying until this succeeds`));
        await storage.createCryptocomEngineActivity({ userId, symbol: trade.symbol, decision: 'skipped', strategy: trade.strategy, reasoning: `${trade.symbol}: position NOT on-chain — wallet holds none of this token. Trade parked as needs_reconciliation; NO P&L booked (real proceeds unknown). Verify on a block explorer.`, score: null, price: currentPrice, dailyChangePercent: null, source: 'cryptocom' }).catch(() => {});
        finished = true; // parked, not open — the claim must not be handed back
        return;
      }
      if (!exit?.ok) {
        console.error(`[cryptocom-scanner] DeFi exit FAILED for trade ${trade.id} (${trade.symbol}): ${(exit as any)?.reason || 'unknown'} — position left OPEN`);
        await storage.createCryptocomEngineActivity({ userId, symbol: trade.symbol, decision: 'signal', strategy: trade.strategy, reasoning: `${trade.symbol}: DeFi EXIT FAILED (${(exit as any)?.reason || 'error'}) — position still OPEN, will retry next cycle. No P&L booked.`, score: null, price: currentPrice, dailyChangePercent: null, source: 'cryptocom' }).catch(() => {});
        return;
      }
      if (exit.exitPrice) currentPrice = exit.exitPrice;
      // A8: prefer the REALIZED effective fill price (actual USDC received ÷ qty)
      // over the pre-swap quote, so booked P&L reflects real slippage + fees.
      if ((exit as any).proceedsUsd && trade.quantity > 0) currentPrice = (exit as any).proceedsUsd / trade.quantity;
    } else if (venue) {
      // CeFi spot exit — sell the held base amount on the venue.
      const exit = await cefiExitSell(userId, venue as CefiVenue, baseCoin(trade.symbol), trade.quantity).catch((e: any) => ({ ok: false, exitPrice: 0, reason: e?.message || String(e) } as any));
      if (!exit?.ok) {
        console.error(`[cryptocom-scanner] CeFi exit FAILED for trade ${trade.id} (${trade.symbol}) on ${venue}: ${(exit as any)?.reason || 'unknown'} — position left OPEN`);
        await storage.createCryptocomEngineActivity({ userId, symbol: trade.symbol, decision: 'signal', strategy: trade.strategy, reasoning: `${trade.symbol}: ${venue} EXIT FAILED (${(exit as any)?.reason || 'error'}) — position still OPEN, will retry. No P&L booked.`, score: null, price: currentPrice, dailyChangePercent: null, source: 'cryptocom' }).catch(() => {});
        return;
      }
      if (exit.exitPrice) currentPrice = exit.exitPrice;
    } else {
      // A7 (perp): NEVER book a close the venue didn't execute — same rule the
      // DeFi and CeFi branches above already follow. This branch used to be
      //     if (connection) { ... .placeOrder(...).catch(() => {}); }
      // and then fell through to closeCryptocomEngineTrade UNCONDITIONALLY. So a
      // rejected close (insufficient margin, rate limit, non-zero code, 12s
      // timeout) — or simply a missing/inactive connection, which skipped the
      // order entirely — flipped the row to `closed` with fabricated P&L. The
      // brain and the prop-firm ledger then learned from that invented number,
      // while a REAL leveraged position stayed open at the venue and dropped out
      // of getOpenCryptocomEngineTrades, so nothing ever monitored or closed it
      // again. Leaving the trade OPEN means the next monitor cycle retries.
      const connection = await storage.getUserCryptocomConnections(userId)
        .then(c => c.find(x => x.id === trade.connectionId))
        .catch(() => undefined);
      if (!connection) {
        console.error(`[cryptocom-scanner] perp exit SKIPPED for trade ${trade.id} (${trade.symbol}): connection ${trade.connectionId} not found/inactive — position left OPEN`);
        await storage.createCryptocomEngineActivity({ userId, symbol: trade.symbol, decision: 'signal', strategy: trade.strategy, reasoning: `${trade.symbol}: perp EXIT SKIPPED (connection unavailable) — position still OPEN, will retry next cycle. No P&L booked.`, score: null, price: currentPrice, dailyChangePercent: null, source: 'cryptocom' }).catch(() => {});
        return;
      }
      const closeSide = trade.direction === 'long' ? 'SELL' : 'BUY';
      try {
        const service = new CryptoComService(connection.apiKey, decryptApiSecret(connection.encryptedApiSecret));
        // call() throws on HTTP failure and on any non-zero Crypto.com code, so
        // reaching the next line means the venue ACCEPTED the close order.
        // NOTE: acceptance is not proof of fill — verifying the position is gone
        // needs a positions read, which CryptoComService does not implement yet.
        // That is a separate gap; this guard only stops us booking a close the
        // venue outright rejected.
        await service.placeOrder({ instrumentName: trade.symbol, side: closeSide, quantity: trade.quantity, type: 'MARKET' });
      } catch (e: any) {
        console.error(`[cryptocom-scanner] perp exit FAILED for trade ${trade.id} (${trade.symbol}): ${e?.message ?? e} — position left OPEN`);
        await storage.createCryptocomEngineActivity({ userId, symbol: trade.symbol, decision: 'signal', strategy: trade.strategy, reasoning: `${trade.symbol}: perp EXIT FAILED (${e?.message ?? 'error'}) — position still OPEN, will retry next cycle. No P&L booked.`, score: null, price: currentPrice, dailyChangePercent: null, source: 'cryptocom' }).catch(() => {});
        return;
      }
    }
    const realizedPnl = (trade.direction === 'long' ? currentPrice - trade.entryPrice : trade.entryPrice - currentPrice) * trade.quantity;
    const closedRow = await storage.closeCryptocomEngineTrade(trade.id, { exitPrice: currentPrice, exitReason: reason, realizedPnl });
    if (!closedRow) {
      // Belt-and-braces: the claim should make this unreachable, but if the row
      // is no longer in 'closing' someone else finalised it. Do NOT run the
      // follow-up writes again — recordRealizedPnl accumulates and the brain
      // feature store has no unique key, so both would double-count.
      console.warn(`[cryptocom-scanner] trade ${trade.id} was already finalised elsewhere — skipping duplicate P&L/brain writes`);
      finished = true;
      return;
    }
    finished = true;
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
  } finally {
    // Every early return above (failed DeFi/CeFi/perp exit, unavailable
    // connection) and any thrown error lands here with finished=false, so the
    // trade goes back to 'open' and the next cycle retries it. Only a completed
    // close leaves it closed.
    if (!finished) {
      await storage.releaseCryptocomEngineTradeClaim(trade.id)
        .catch((e: any) => console.error(`[cryptocom-scanner] FAILED to release close-claim on trade ${trade.id} (${e?.message}) — stale-claim recovery will re-open it`));
    }
  }
}

// Manual close of a single open trade (from the UI "Close" button). Reuses the
// same venue-aware closePosition path as the auto TP/SL monitor — records
// realized P&L, brain outcome, and consistency ledger. Values the close at the
// latest candle close (same source the monitor uses).
export async function manualCloseCryptoTrade(userId: number, tradeId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    const open = await storage.getOpenCryptocomEngineTrades(userId);
    const trade = open.find((t: any) => t.id === tradeId);
    if (!trade) return { ok: false, error: 'Trade not found or already closed' };
    let px = 0;
    try {
      const bars = await CryptoComService.getCandles(trade.symbol, '5m', 2);
      px = bars?.[bars.length - 1]?.c ?? 0;
    } catch { /* fall through */ }
    if (!(px > 0)) return { ok: false, error: 'Could not fetch current price to close' };
    await closePosition(userId, trade, px, 'manual');
    return { ok: true };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'close failed' };
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
  // Priority back-off: crypto is lower priority than the FX engine and draws on
  // the same AI provider budget. When that budget is exhausted (402) or rate
  // limited (429), skip the AI confirmation (no new crypto entry this cycle) so
  // FX keeps the budget. Exits/monitoring are unaffected.
  try {
    const { shouldDeferLowPriorityAi, aiBudgetDeferReason } = await import('./ai-budget-guard');
    if (shouldDeferLowPriorityAi()) {
      return { confirmed: false, confidence: 0, reasoning: `AI review deferred — shared AI budget ${aiBudgetDeferReason()} (FX priority)` };
    }
  } catch { /* non-fatal */ }
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

// ── Multi-venue fan-out wrapper ──────────────────────────────────────────────
// When multiVenueEnabled is on, one confirmed signal fires on EVERY connected +
// enabled rail at once — Crypto.com perps + DeFi hot wallet + any connected CeFi
// spot exchange — instead of only the single executionVenue. Each rail runs
// independently (its own gate/size/execute + activity log); one failing never
// blocks the others. Perps take long AND short; DeFi/spot take the long side
// only (shorts are skipped there). Off = legacy single-venue routing, unchanged.
async function executeSignal(service: CryptoComService, connection: CryptocomConnection, userId: number, symbol: string, result: StrategyResult, cfg: CryptocomEngineConfig): Promise<void> {
  if (!result.direction || !result.price) return;
  if (!(cfg as any).multiVenueEnabled) {
    return executeSignalSingle(service, connection, userId, symbol, result, cfg);
  }

  const arms: Array<{ venue: string; label: string }> = [];
  // Perps — always in the fan-out when the Crypto.com connection is live.
  if (connection) arms.push({ venue: 'cryptocom', label: 'perps' });
  // DeFi hot wallet — only when explicitly enabled (a funded burner + ZEROX key).
  if ((cfg as any).defiAutoTradeEnabled) arms.push({ venue: 'defi', label: 'DeFi' });
  // CeFi spot — every connected exchange, so a newly-connected wallet auto-joins.
  if ((cfg as any).cefiAutoTradeEnabled) {
    try {
      const { pool } = await import('../db');
      for (const [tbl, v] of [['coinbase_connections', 'coinbase'], ['kraken_connections', 'kraken'], ['gemini_connections', 'gemini']] as const) {
        const r = await pool.query(`SELECT 1 FROM ${tbl} WHERE user_id=$1 AND is_active=true LIMIT 1`, [userId]).catch(() => null);
        if (r && r.rows.length) arms.push({ venue: v, label: v });
      }
    } catch { /* spot detection best-effort */ }
  }

  for (const arm of arms) {
    // Clone the config with this arm's venue forced, and the OTHER rails' flags
    // cleared, so executeSignalSingle routes cleanly into exactly one branch.
    const armCfg = {
      ...cfg,
      executionVenue: arm.venue,
      defiAutoTradeEnabled: arm.venue === 'defi',
      cefiAutoTradeEnabled: arm.venue !== 'defi' && arm.venue !== 'cryptocom',
    } as CryptocomEngineConfig;
    await executeSignalSingle(service, connection, userId, symbol, result, armCfg)
      .catch((e: any) => console.error(`[cryptocom-scanner] fan-out ${arm.label} failed for ${symbol}:`, e?.message ?? e));
  }
}

async function executeSignalSingle(service: CryptoComService, connection: CryptocomConnection, userId: number, symbol: string, result: StrategyResult, cfg: CryptocomEngineConfig): Promise<void> {
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
      const { defiEntryBuy } = await import('./defi-executor'); // lazy — loads ethers only on a real DeFi entry
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

  // NOTE: monitorOpenPositions is deliberately NOT called here any more. It now
  // runs unconditionally at the top of runCryptocomEngineScan, before any of
  // this function's four early-return gates, so exits keep working when the
  // engine is stopped or a connection is deactivated. Calling it here too would
  // evaluate the same position twice per cycle and risk a duplicate close.

  // Warm the self-learning brain once per cycle so sizing/gating read fresh learning.
  if ((config as any).cryptoBrainEnabled !== false) await getOrRefreshCryptoBrain(userId).catch(() => {});

  const canAutoExecute = activeConn.autoExecute && config.enableAutoExecution;
  const allSymbols: string[] = Array.isArray(config.symbols) ? config.symbols : [];

  // Rotate through a bounded slice each cycle so a large watchlist doesn't build a
  // big working set in one pass (candles + indicators per symbol). The cursor
  // advances each cycle, wrapping, so every symbol is still scanned over time.
  let symbols = allSymbols;
  if (allSymbols.length > MAX_SYMBOLS_PER_CYCLE) {
    const start = (scanCursor.get(userId) || 0) % allSymbols.length;
    symbols = [];
    for (let i = 0; i < MAX_SYMBOLS_PER_CYCLE; i++) symbols.push(allSymbols[(start + i) % allSymbols.length]);
    scanCursor.set(userId, (start + MAX_SYMBOLS_PER_CYCLE) % allSymbols.length);
  }

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

/**
 * ONE scan cycle across all active users, guarded by the cross-process run lock.
 *
 * The lock lives HERE rather than only in startCryptocomEngineScanner() because
 * this function is also the direct entry point for crypto-cron.ts, which called
 * it with no lock at all. Worker + cron both deployed therefore scanned the same
 * user in the same window and placed two orders for one signal. That is not
 * theoretical: trades 27/28 are the same UNI signal 22.5s apart with two order
 * ids, and 9/10 and 11/12 show the same pattern. Putting the acquire/release at
 * the single choke point means every caller — worker loop, cron, web — is
 * covered by construction rather than by remembering to wrap the call.
 *
 * A process that already holds the lock for its lifetime (the worker, via
 * startCryptocomEngineScanner) must NOT try to take it again: advisory locks are
 * per-session, so a second session would be refused and the worker would block
 * itself. `_holdsRunLock` distinguishes those cases.
 */
export async function runCryptocomEngineScan(): Promise<void> {
  // Only acquire if this process isn't already holding it for its lifetime.
  const ownedHere = !_holdsRunLock;
  if (ownedHere) {
    const locked = await acquireCryptoRunLock();
    if (locked !== 'acquired') {
      console.error(locked === 'held_elsewhere'
        ? '[cryptocom-scanner] SKIPPING scan — another process holds the crypto run lock. This prevents double-trading.'
        : '[cryptocom-scanner] SKIPPING scan — the run lock could not be VERIFIED (database unreachable?). Failing closed.');
      return;
    }
  }
  try {
    // ── EXIT MANAGEMENT FIRST, and unconditionally ──────────────────────────
    // monitorOpenPositions used to be reachable only from inside scanOneUser,
    // which returns early on FOUR separate conditions: no config, config not
    // active, the per-user scan-interval throttle, and no active connection. So
    // stopping the engine, deactivating a connection, or rotating an API key
    // silently abandoned every open position — and since perp entries attach no
    // exchange-side stop, "abandoned" means unprotected.
    //
    // Exits are not part of scanning for new entries and must not share its
    // gates. Stopping the engine should stop new ENTRIES, never orphan live
    // positions. This pass runs for every user holding an open trade, whether
    // or not their engine is switched on, and is throttle-free.
    // A close claim flips status open -> 'closing' so two processes can't fire
    // the same exit. If the claimer dies mid-close (deploy, crash, OOM) the row
    // is left in 'closing', which getOpenCryptocomEngineTrades does not return —
    // i.e. an unmonitored position. Re-open anything that has been 'closing'
    // longer than any real close could take, before listing holders.
    await phase('recover_stale_claims');
    const recovered = await storage.recoverStaleCryptocomCloseClaims().catch((e: any) => {
      console.error('[cryptocom-scanner] stale close-claim recovery failed:', e?.message);
      return 0;
    });
    if (recovered > 0) console.warn(`[cryptocom-scanner] re-opened ${recovered} trade(s) stranded in 'closing' by a dead process`);

    await phase('exit_pass:list_holders');
    const holders = await storage.getUserIdsWithOpenCryptocomTrades().catch((e: any) => {
      console.error('[cryptocom-scanner] could not list users with open trades — exit management SKIPPED this cycle:', e?.message);
      return [] as number[];
    });
    for (const uid of holders) {
      try {
        await phase(`exit_pass:user_${uid}`);
        // The config supplies trail parameters only. A missing config must not
        // block exits, so fall back to defaults that still honour SL/TP.
        const cfg = await storage.getUserCryptocomEngineConfig(uid);
        await monitorOpenPositions(uid, (cfg ?? {
          trailMethod: 'none', trailActivationR: 1, trailFixedR: 0.5,
          trailStepR: 0.5, trailProfitLockPct: 50, trailSarInitialAf: 0.02,
          trailSarMaxAf: 0.2, breakevenBufferR: 0,
        }) as any);
      } catch (e: any) {
        console.error(`[cryptocom-scanner] exit management failed for user ${uid}:`, e?.message);
      }
    }

    await phase('entry_scan:list_configs');
    const configs = await storage.getAllActiveCryptocomEngineConfigs();
    for (const config of configs) {
      await phase(`entry_scan:user_${config.userId}`);
      await scanOneUser(config.userId).catch((e: any) => console.error(`[cryptocom-scanner] user ${config.userId} scan failed:`, e.message));
    }
  } catch (err: any) {
    console.error('[cryptocom-scanner] runCryptocomEngineScan failed:', err.message);
  } finally {
    // Release only what this call took, so the next cron invocation can acquire.
    // The long-lived worker keeps its lock (ownedHere === false there).
    if (ownedHere) await releaseCryptoRunLock();
  }
}

let started = false;
let scanInFlight = false;
let _skippedTicks = 0;
let _scansCompleted = 0;

// Cross-process mutual exclusion. All in-process guards (started, scanInFlight)
// are per-process, so nothing stops the in-process web scanner (if
// ENABLE_CRYPTO_ENGINE is ever flipped true on web) from running the SAME users
// against the SAME DB at the same time as the crypto-worker/cron — double orders,
// doubled daily-trade accounting, and the shared-process OOM that forced crypto
// out of the web process. A Postgres session-level advisory lock, held for the
// process lifetime, makes only one crypto scanner active across all processes.
// ── Liveness instrumentation ────────────────────────────────────────────────
// On 2026-09-20 the worker held the run lock, reported healthy, and wrote
// nothing for 45 minutes. From outside, a wedged scan and an idle engine are
// indistinguishable: the lock is held either way, and if a scan never settles
// `scanInFlight` stays true so every subsequent tick is skipped silently. This
// records where each scan is, so the next stall is diagnosable from the database
// instead of from Render's log viewer.
//
// Every write is best-effort: instrumentation must never be able to break or
// slow the engine it measures.
const WORKER_ID = `${process.pid}-${Date.now().toString(36)}`;
let _hbBooted = false;

async function hb(fields: Record<string, any>): Promise<void> {
  try {
    const { pool } = await import('../db');
    const set: Record<string, any> = { worker_id: WORKER_ID, updated_at: new Date(), ...fields };
    const cols = Object.keys(set);
    const vals = cols.map((c) => set[c]);
    const ph = cols.map((_, i) => `$${i + 1}`).join(',');
    const upd = cols.filter((c) => c !== 'id').map((c) => `"${c}"=EXCLUDED."${c}"`).join(',');
    await pool.query(
      `INSERT INTO crypto_engine_heartbeat ("id",${cols.map((c) => `"${c}"`).join(',')})
       VALUES (1,${ph}) ON CONFLICT ("id") DO UPDATE SET ${upd}`,
      vals,
    );
  } catch { /* never let the heartbeat affect the engine */ }
}

/** Record which step the current scan is on, so a hang can be located. */
async function phase(name: string): Promise<void> { await hb({ phase: name }); }

const CRYPTO_RUN_LOCK_KEY = 918273645; // arbitrary constant unique to this scanner
// True when THIS process is holding the advisory lock. Needed because advisory
// locks are per-session: a process that already holds it must not open a second
// session and ask again, or it would refuse itself.
let _holdsRunLock = false;

type LockResult = 'acquired' | 'held_elsewhere' | 'check_failed';

async function acquireCryptoRunLock(): Promise<LockResult> {
  try {
    const { pool } = await import('../db');
    const client = await pool.connect();
    const r = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [CRYPTO_RUN_LOCK_KEY]);
    if (r.rows?.[0]?.locked === true) {
      // Hold the client so the session-level lock persists until we release it.
      (global as any).__cryptoRunLockClient = client;
      _holdsRunLock = true;
      return 'acquired';
    }
    client.release();
    return 'held_elsewhere';
  } catch (e: any) {
    // FAIL CLOSED. This used to `return true` on any error, reasoning that a
    // lock-infra problem shouldn't disable the engine — but the failure it
    // permits is two processes trading the same signal with real money, which
    // is strictly worse than not trading for a cycle. A transient DB error now
    // skips the cycle; the next tick/cron retries. Consistent with the rule
    // applied across this codebase: "could not verify" is never "safe to
    // proceed".
    console.error('[cryptocom-scanner] advisory-lock check FAILED — refusing to scan this cycle (fail-closed to prevent double-trading):', e?.message);
    return 'check_failed';
  }
}

/**
 * Break the run lock when its holder is provably dead.
 *
 * An advisory lock lives on the SESSION, not the process, so a worker killed
 * abruptly (deploy, OOM, container replacement) can leave its Postgres backend
 * connected and idle for hours, still holding the lock. Seen live on
 * 2026-09-20: pid 2315945 held it for 341 minutes, its last query being the
 * pg_try_advisory_lock that took it, while the engine did nothing. Every
 * replacement worker was refused and retried forever.
 *
 * A session-level lock can only be released by its owner, so the only remedy is
 * to terminate that backend. This is deliberately narrow: it acts only on a
 * session holding THIS key, and only when the heartbeat proves no scan has run
 * for STALE_AFTER_MS. A live worker refreshes tick_at every 60s, so a healthy
 * holder can never be targeted.
 */
const STALE_AFTER_MS = 5 * 60 * 1000;

async function breakStaleRunLock(): Promise<void> {
  try {
    const { pool } = await import('../db');
    const { rows: hb } = await pool.query(`SELECT worker_id, tick_at FROM crypto_engine_heartbeat WHERE id=1`);
    const tick = hb[0]?.tick_at ? new Date(hb[0].tick_at).getTime() : 0;
    const age = Date.now() - tick;
    // No heartbeat at all means the holder predates this instrumentation, which
    // is itself evidence it is stale — but only once it has held long enough
    // that a live worker would certainly have written one.
    if (tick && age < STALE_AFTER_MS) return; // holder is alive and working
    const { rows } = await pool.query(
      `SELECT a.pid, round(extract(epoch from now()-a.backend_start)/60) held_min
         FROM pg_locks l JOIN pg_stat_activity a ON a.pid = l.pid
        WHERE l.locktype='advisory' AND l.objid=$1
          AND a.pid <> pg_backend_pid()
          AND a.backend_start < now() - interval '5 minutes'`,
      [CRYPTO_RUN_LOCK_KEY],
    );
    for (const r of rows) {
      console.error(`[cryptocom-scanner] run lock held by pid ${r.pid} for ${r.held_min} min with a heartbeat ${tick ? Math.round(age / 60000) + ' min' : 'never written'} — its process is gone. Terminating that session to release the lock.`);
      await pool.query(`SELECT pg_terminate_backend($1)`, [r.pid]);
    }
  } catch (e: any) {
    console.error('[cryptocom-scanner] could not check/break a stale run lock:', e?.message);
  }
}

/** Release the run lock held by this process, if any. */
async function releaseCryptoRunLock(): Promise<void> {
  const client = (global as any).__cryptoRunLockClient;
  (global as any).__cryptoRunLockClient = null;
  _holdsRunLock = false;
  if (!client) return;
  try { await client.query('SELECT pg_advisory_unlock($1)', [CRYPTO_RUN_LOCK_KEY]); }
  catch (e: any) { console.error('[cryptocom-scanner] advisory-unlock failed (session close will release it):', e?.message); }
  try { client.release(); } catch { /* pool already gone */ }
}

export function startCryptocomEngineScanner(): void {
  if (started) return;
  started = true;
  // RETRY, never give up. This used to ask for the lock once and `return` on any
  // answer but yes — which left NOTHING holding the event loop open, so the
  // always-on worker exited silently with code 0. Render logged a clean restart,
  // not a crash, and the engine stayed dark. Seen live: a worker with no
  // DATABASE_URL fell back to localhost, the lock check threw, this path fired,
  // and crypto was down until someone went looking. A transient DB blip at boot
  // must not be permanent downtime, so we keep a timer alive and re-ask.
  const RETRY_MS = 60000;
  const tryStart = () => {
    acquireCryptoRunLock().then((locked) => {
    if (locked !== 'acquired') {
      console.error(locked === 'held_elsewhere'
        ? `[cryptocom-scanner] NOT starting — another process already holds the crypto run lock (worker/cron already running). This prevents double-trading. Set ENABLE_CRYPTO_ENGINE=false on the web service if this is the web process. Retrying in ${RETRY_MS / 1000}s.`
        : `[cryptocom-scanner] NOT starting — the run lock could not be VERIFIED, so the database is probably unreachable. Check DATABASE_URL on THIS service (Render does not copy env vars between services). Retrying in ${RETRY_MS / 1000}s.`);
      // Report even while locked out. The first version of this heartbeat only
      // began writing AFTER the lock was acquired, so a worker stuck in this
      // retry loop stayed completely invisible — the exact blind spot the
      // heartbeat exists to remove.
      void hb({ tick_at: new Date(), phase: locked === 'held_elsewhere' ? 'waiting_for_lock' : 'db_unreachable', last_error: `startup: ${locked}` });
      // A holder whose process is gone leaves its Postgres session — and the
      // session-level lock with it — behind. Nothing then ever starts again.
      if (locked === 'held_elsewhere') void breakStaleRunLock();
      // This timer is also what keeps the process alive to retry at all.
      setTimeout(tryStart, RETRY_MS);
      return;
    }
  const LOOP_INTERVAL_MS = 60000;
  setInterval(() => {
    // Re-entrancy guard: a scan cycle (many symbols × AI calls × DeFi RPC) can
    // run longer than the 60s tick. Without this, ticks overlap and pile up —
    // each overlapping run retains candle arrays, brain features and providers
    // in memory simultaneously, compounding into an OOM. Skip the tick if the
    // previous cycle is still running.
    if (scanInFlight) {
      // A handful of these is normal (a scan outran the 60s tick). A rising,
      // unbounded count with no completed scan means the previous scan is WEDGED
      // and the engine has silently stopped — check `phase` for where it stuck.
      _skippedTicks++;
      console.warn(`[cryptocom-scanner] previous scan still running — skipping this tick to avoid overlap/OOM (consecutive skips: ${_skippedTicks})`);
      void hb({ tick_at: new Date(), skipped_ticks: _skippedTicks });
      return;
    }
    _skippedTicks = 0;
    scanInFlight = true;
    const _t0 = Date.now();
    void hb({ tick_at: new Date(), scan_started_at: new Date(), phase: 'scan:start', skipped_ticks: 0 });

    // WATCHDOG. A scan that never settles freezes the engine permanently: the
    // re-entrancy guard keeps skipping every tick, and the run lock is held for
    // the process lifetime, so no replacement worker can start either.
    // Observed 2026-09-20: the worker stopped mid DeFi exit at 07:15:50 and did
    // nothing for the next six hours while holding the lock. The hang is inside
    // ethers' sendTransaction (gas estimation has no timeout of its own), so
    // nothing below this level can be relied on to return.
    //
    // The timed-out work cannot be cancelled — it dangles until its socket
    // gives up — but the LOOP must recover. Booking a close it might still
    // complete is prevented by the close-claim (the trade sits in 'closing')
    // and by the pre-flight balance check.
    const SCAN_TIMEOUT_MS = 4 * 60 * 1000; // > a 90s confirm wait plus overhead
    let _timedOut = false;
    const _watchdog = new Promise<void>((resolve) => setTimeout(() => { _timedOut = true; resolve(); }, SCAN_TIMEOUT_MS));

    Promise.race([runCryptocomEngineScan(), _watchdog])
      .then(() => {
        if (_timedOut) {
          console.error(`[cryptocom-scanner] scan EXCEEDED ${SCAN_TIMEOUT_MS / 1000}s and was abandoned — the loop continues so the engine cannot freeze. Check the heartbeat phase for where it hung.`);
          void hb({ scan_finished_at: new Date(), last_duration_ms: Date.now() - _t0, phase: 'timed_out', last_error: `scan abandoned after ${SCAN_TIMEOUT_MS / 1000}s` });
          return;
        }
        _scansCompleted++;
        void hb({ scan_finished_at: new Date(), last_duration_ms: Date.now() - _t0, phase: 'idle', scans_completed: _scansCompleted, last_error: null });
      })
      .catch((e: any) => { void hb({ scan_finished_at: new Date(), last_duration_ms: Date.now() - _t0, phase: 'error', last_error: String(e?.message ?? e).slice(0, 500) }); })
      .finally(() => { scanInFlight = false; });
  }, LOOP_INTERVAL_MS);
  console.log('[cryptocom-scanner] Background Crypto.com perpetuals scan loop started (60s tick, re-entrancy guarded, per-user throttled, strategies: trend_following/momentum/auto).');
  if (!_hbBooted) { _hbBooted = true; void hb({ booted_at: new Date(), phase: 'booted', skipped_ticks: 0, last_error: null }); }
    });
  };
  tryStart();
}
