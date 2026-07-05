// ── Options AI Engine — scan/decision feed ──────────────────────────────────
// Real, explainable technical reads over each user's watched symbols using
// their connected Alpaca account's market data — not full AI-driven strategy
// selection yet, but genuine calculations (not fabricated). Every cycle
// produces a per-symbol log entry explaining what the engine saw and why it
// is (or isn't) acting. Order placement itself is a future step; this scans
// and explains only — settings like strike/expiry preference currently shape
// the *reasoning* the engine gives, not yet a live order.

import { storage } from '../storage';
import { AlpacaService, decryptApiSecret, type AlpacaOptionContract } from '../alpaca';
import type { OptionsEngineConfig, AlpacaConnection } from '../../shared/schema';

const MIN_SCAN_INTERVAL_MS = 30000; // never scan a single user faster than this
const lastScanAt = new Map<number, number>();

type Bar = { t: string; o: number; h: number; l: number; c: number; v: number };
type Decision = 'watching' | 'signal' | 'skipped' | 'error';
interface StrategyResult {
  decision: Decision;
  reasoning: string;
  score: number | null;
  price: number | null;
  dailyChangePercent: number | null;
  strategy: string;
  direction?: 'up' | 'down'; // only set on 'signal' — the direction execution should act on
}

// ── NY market-hours helpers (DST-aware via Intl, no extra dependency) ───────
function nyOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = dtf.formatToParts(date).reduce((acc: any, p) => { acc[p.type] = p.value; return acc; }, {});
  const asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUTC - date.getTime()) / 60000;
}

function nyMarketOpenUTC(reference: Date): Date {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = dtf.formatToParts(reference).reduce((acc: any, p) => { acc[p.type] = p.value; return acc; }, {});
  const y = +parts.year, m = +parts.month, d = +parts.day;
  const noonUTC = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const offsetMin = nyOffsetMinutes(noonUTC); // NY - UTC, e.g. -240 (EDT) or -300 (EST)
  const utcMinutesSinceMidnight = (9 * 60 + 30) - offsetMin;
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) + utcMinutesSinceMidnight * 60000);
}

function nyMarketCloseUTC(reference: Date): Date {
  const open = nyMarketOpenUTC(reference);
  return new Date(open.getTime() + 6.5 * 60 * 60000); // regular session is 6.5 hours
}

function isWeekday(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow >= 1 && dow <= 5;
}

// ── Strategy: Opening Range Breakout ────────────────────────────────────────
async function runOrb(service: AlpacaService, symbol: string, cfg: OptionsEngineConfig): Promise<StrategyResult> {
  const now = new Date();
  const open = nyMarketOpenUTC(now);
  const rangeEnd = new Date(open.getTime() + cfg.orbRangeMinutes * 60000);

  if (!isWeekday(now) || now < open) {
    return { decision: 'watching', reasoning: `${symbol}: market is closed — ORB needs the regular session to be open.`, score: null, price: null, dailyChangePercent: null, strategy: 'orb' };
  }
  if (now < rangeEnd) {
    return { decision: 'watching', reasoning: `${symbol}: opening range still forming (first ${cfg.orbRangeMinutes} min) — checking again once it closes.`, score: null, price: null, dailyChangePercent: null, strategy: 'orb' };
  }

  const bars = await service.getBars(symbol, '1Min', open, now, 500);
  if (bars.length < cfg.orbRangeMinutes) {
    return { decision: 'error', reasoning: `${symbol}: not enough intraday bars returned to compute the opening range.`, score: null, price: null, dailyChangePercent: null, strategy: 'orb' };
  }

  const rangeBars = bars.filter(b => new Date(b.t) < rangeEnd);
  const afterRangeBars = bars.filter(b => new Date(b.t) >= rangeEnd);
  if (rangeBars.length === 0 || afterRangeBars.length === 0) {
    return { decision: 'watching', reasoning: `${symbol}: waiting on more bars to confirm the opening range.`, score: null, price: null, dailyChangePercent: null, strategy: 'orb' };
  }

  const orHigh = Math.max(...rangeBars.map(b => b.h));
  const orLow = Math.min(...rangeBars.map(b => b.l));
  const last = afterRangeBars[afterRangeBars.length - 1];
  const avgRangeVolume = rangeBars.reduce((s, b) => s + b.v, 0) / rangeBars.length;
  const volumeConfirmed = last.v > avgRangeVolume * 1.2;

  const brokeUp = last.c > orHigh;
  const brokeDown = last.c < orLow;
  const direction = brokeUp ? 'up' : brokeDown ? 'down' : 'inside';
  const directionAllowed =
    cfg.directionFilter === 'both' ||
    (cfg.directionFilter === 'calls_only' && direction === 'up') ||
    (cfg.directionFilter === 'puts_only' && direction === 'down');

  const rangeSizePct = ((orHigh - orLow) / orLow) * 100;
  const score = Math.min(100, Math.round(50 + rangeSizePct * 10 + (volumeConfirmed ? 15 : 0)));

  if (direction === 'inside') {
    return { decision: 'watching', reasoning: `${symbol}: still trading inside the ${cfg.orbRangeMinutes}-min opening range ($${orLow.toFixed(2)}-$${orHigh.toFixed(2)}) — no breakout yet.`, score, price: last.c, dailyChangePercent: null, strategy: 'orb' };
  }
  if (!directionAllowed) {
    return { decision: 'skipped', reasoning: `${symbol}: broke ${direction} out of the opening range at $${last.c.toFixed(2)}, but your direction filter is "${cfg.directionFilter}" — doesn't qualify.`, score, price: last.c, dailyChangePercent: null, strategy: 'orb' };
  }
  if (!volumeConfirmed) {
    return { decision: 'watching', reasoning: `${symbol}: broke ${direction} out of the opening range at $${last.c.toFixed(2)}, but volume (${Math.round(last.v)}) isn't confirming vs the range average (${Math.round(avgRangeVolume)}) — watching for confirmation.`, score, price: last.c, dailyChangePercent: null, strategy: 'orb' };
  }
  if (score < cfg.minConfidence) {
    return { decision: 'watching', reasoning: `${symbol}: volume-confirmed ${direction} breakout of the opening range, but score ${score}/100 is below your ${cfg.minConfidence} threshold.`, score, price: last.c, dailyChangePercent: null, strategy: 'orb' };
  }
  const optType = direction === 'up' ? 'call' : 'put';
  return {
    decision: 'signal', score, price: last.c, dailyChangePercent: null, strategy: 'orb', direction,
    reasoning: `${symbol}: volume-confirmed ${direction} breakout of the ${cfg.orbRangeMinutes}-min opening range ($${orLow.toFixed(2)}-$${orHigh.toFixed(2)}), now at $${last.c.toFixed(2)}. Score ${score}/100. Would target a ${cfg.strikeSelectionMode === 'delta_target' ? `~${cfg.targetDelta} delta` : cfg.strikeSelectionMode} ${optType}, ${cfg.expiryPreference} expiry.`,
  };
}

// ── Strategy: Volume Profile (Point of Control / Value Area) ───────────────
async function runVolumeProfile(service: AlpacaService, symbol: string, cfg: OptionsEngineConfig): Promise<StrategyResult> {
  const now = new Date();
  const start = new Date(now.getTime() - cfg.volumeProfileLookbackDays * 24 * 60 * 60000);
  const bars = await service.getBars(symbol, '5Min', start, now, 2000);
  if (bars.length < 20) {
    return { decision: 'error', reasoning: `${symbol}: not enough intraday history returned to build a volume profile.`, score: null, price: null, dailyChangePercent: null, strategy: 'volume_profile' };
  }

  const lo = Math.min(...bars.map(b => b.l));
  const hi = Math.max(...bars.map(b => b.h));
  const binCount = 24;
  const binSize = (hi - lo) / binCount || 1;
  const volumeByBin = new Array(binCount).fill(0);
  for (const b of bars) {
    const mid = (b.h + b.l) / 2;
    const idx = Math.min(binCount - 1, Math.max(0, Math.floor((mid - lo) / binSize)));
    volumeByBin[idx] += b.v;
  }
  const totalVolume = volumeByBin.reduce((s, v) => s + v, 0);
  let pocIdx = 0;
  for (let i = 1; i < binCount; i++) if (volumeByBin[i] > volumeByBin[pocIdx]) pocIdx = i;
  const pocPrice = lo + (pocIdx + 0.5) * binSize;

  // Value area = bins around POC accounting for ~70% of total volume
  let sorted = volumeByBin.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v);
  let acc = 0;
  const valueAreaIdx = new Set<number>();
  for (const { i, v } of sorted) {
    valueAreaIdx.add(i);
    acc += v;
    if (acc >= totalVolume * 0.7) break;
  }
  const valueAreaIdxArr = Array.from(valueAreaIdx);
  const vaHighIdx = Math.max(...valueAreaIdxArr);
  const vaLowIdx = Math.min(...valueAreaIdxArr);
  const vaHigh = lo + (vaHighIdx + 1) * binSize;
  const vaLow = lo + vaLowIdx * binSize;

  const last = bars[bars.length - 1];
  const price = last.c;
  const distFromPocPct = Math.abs((price - pocPrice) / pocPrice) * 100;

  const aboveVA = price > vaHigh;
  const belowVA = price < vaLow;
  const direction = aboveVA ? 'up' : belowVA ? 'down' : 'inside';
  const directionAllowed =
    cfg.directionFilter === 'both' ||
    (cfg.directionFilter === 'calls_only' && direction === 'up') ||
    (cfg.directionFilter === 'puts_only' && direction === 'down');

  const score = Math.min(100, Math.round(40 + distFromPocPct * 8));

  if (direction === 'inside') {
    return { decision: 'watching', reasoning: `${symbol}: trading inside its ${cfg.volumeProfileLookbackDays}-day value area ($${vaLow.toFixed(2)}-$${vaHigh.toFixed(2)}, POC $${pocPrice.toFixed(2)}) — fair value, no edge either direction.`, score, price, dailyChangePercent: null, strategy: 'volume_profile' };
  }
  if (!directionAllowed) {
    return { decision: 'skipped', reasoning: `${symbol}: broke ${direction} out of its value area (POC $${pocPrice.toFixed(2)}) at $${price.toFixed(2)}, but your direction filter is "${cfg.directionFilter}" — doesn't qualify.`, score, price, dailyChangePercent: null, strategy: 'volume_profile' };
  }
  if (score < cfg.minConfidence) {
    return { decision: 'watching', reasoning: `${symbol}: outside its value area at $${price.toFixed(2)} (POC $${pocPrice.toFixed(2)}), but score ${score}/100 is below your ${cfg.minConfidence} threshold.`, score, price, dailyChangePercent: null, strategy: 'volume_profile' };
  }
  const optType = direction === 'up' ? 'call' : 'put';
  return {
    decision: 'signal', score, price, dailyChangePercent: null, strategy: 'volume_profile', direction,
    reasoning: `${symbol}: broke ${direction} out of its ${cfg.volumeProfileLookbackDays}-day value area ($${vaLow.toFixed(2)}-$${vaHigh.toFixed(2)}) — POC (point of control) at $${pocPrice.toFixed(2)}, now at $${price.toFixed(2)} (${distFromPocPct.toFixed(1)}% away). Score ${score}/100. Would target a ${cfg.strikeSelectionMode} ${optType}, ${cfg.expiryPreference} expiry.`,
  };
}

// ── Strategy: N-day High/Low Breakout ────────────────────────────────────────
async function runBreakout(service: AlpacaService, symbol: string, cfg: OptionsEngineConfig): Promise<StrategyResult> {
  const now = new Date();
  const start = new Date(now.getTime() - (cfg.breakoutLookbackDays + 3) * 24 * 60 * 60000);
  const bars = await service.getBars(symbol, '1Day', start, now, 200);
  if (bars.length < cfg.breakoutLookbackDays) {
    return { decision: 'error', reasoning: `${symbol}: not enough daily history returned for a ${cfg.breakoutLookbackDays}-day breakout check.`, score: null, price: null, dailyChangePercent: null, strategy: 'breakout' };
  }

  const priorBars = bars.slice(-cfg.breakoutLookbackDays - 1, -1); // exclude today
  const today = bars[bars.length - 1];
  const priorHigh = Math.max(...priorBars.map(b => b.h));
  const priorLow = Math.min(...priorBars.map(b => b.l));
  const avgVolume = priorBars.reduce((s, b) => s + b.v, 0) / priorBars.length;
  const volumeConfirmed = today.v > avgVolume * 1.3;

  const brokeUp = today.c > priorHigh;
  const brokeDown = today.c < priorLow;
  const direction = brokeUp ? 'up' : brokeDown ? 'down' : 'inside';
  const directionAllowed =
    cfg.directionFilter === 'both' ||
    (cfg.directionFilter === 'calls_only' && direction === 'up') ||
    (cfg.directionFilter === 'puts_only' && direction === 'down');

  const breakoutMagnitudePct = direction === 'up'
    ? ((today.c - priorHigh) / priorHigh) * 100
    : direction === 'down' ? ((priorLow - today.c) / priorLow) * 100 : 0;
  const score = Math.min(100, Math.round(45 + breakoutMagnitudePct * 15 + (volumeConfirmed ? 15 : 0)));

  if (direction === 'inside') {
    return { decision: 'watching', reasoning: `${symbol}: still inside its ${cfg.breakoutLookbackDays}-day range ($${priorLow.toFixed(2)}-$${priorHigh.toFixed(2)}) — no breakout.`, score, price: today.c, dailyChangePercent: null, strategy: 'breakout' };
  }
  if (!directionAllowed) {
    return { decision: 'skipped', reasoning: `${symbol}: broke ${direction} out of its ${cfg.breakoutLookbackDays}-day range at $${today.c.toFixed(2)}, but your direction filter is "${cfg.directionFilter}" — doesn't qualify.`, score, price: today.c, dailyChangePercent: null, strategy: 'breakout' };
  }
  if (!volumeConfirmed) {
    return { decision: 'watching', reasoning: `${symbol}: broke ${direction} out of its ${cfg.breakoutLookbackDays}-day range at $${today.c.toFixed(2)}, but today's volume isn't confirming (${Math.round(today.v)} vs avg ${Math.round(avgVolume)}) — watching for follow-through.`, score, price: today.c, dailyChangePercent: null, strategy: 'breakout' };
  }
  if (score < cfg.minConfidence) {
    return { decision: 'watching', reasoning: `${symbol}: volume-confirmed ${direction} breakout of its ${cfg.breakoutLookbackDays}-day range, but score ${score}/100 is below your ${cfg.minConfidence} threshold.`, score, price: today.c, dailyChangePercent: null, strategy: 'breakout' };
  }
  const optType = direction === 'up' ? 'call' : 'put';
  return {
    decision: 'signal', score, price: today.c, dailyChangePercent: null, strategy: 'breakout', direction,
    reasoning: `${symbol}: volume-confirmed ${direction} breakout of its ${cfg.breakoutLookbackDays}-day range ($${priorLow.toFixed(2)}-$${priorHigh.toFixed(2)}), now at $${today.c.toFixed(2)}. Score ${score}/100. Would target a ${cfg.strikeSelectionMode} ${optType}, ${cfg.expiryPreference} expiry.`,
  };
}

// ── Strategy: Daily Momentum (original rule-based read, kept as the default) ─
function momentumScore(dailyChangePercent: number): number {
  const magnitude = Math.min(Math.abs(dailyChangePercent) / 3, 1);
  return Math.round(50 + magnitude * 50);
}

async function runMomentum(service: AlpacaService, symbol: string, cfg: OptionsEngineConfig): Promise<StrategyResult> {
  const snap = await service.getSnapshot(symbol);
  if (!snap) {
    return { decision: 'error', reasoning: `${symbol}: no market data returned — check the symbol is a valid US equity ticker.`, score: null, price: null, dailyChangePercent: null, strategy: 'momentum' };
  }
  const score = momentumScore(snap.dailyChangePercent);
  const direction = snap.dailyChangePercent >= 0 ? 'up' : 'down';
  const meetsConfidence = score >= cfg.minConfidence;
  const directionAllowed =
    cfg.directionFilter === 'both' ||
    (cfg.directionFilter === 'calls_only' && direction === 'up') ||
    (cfg.directionFilter === 'puts_only' && direction === 'down');

  if (!directionAllowed) {
    return { decision: 'skipped', score, price: snap.price, dailyChangePercent: snap.dailyChangePercent, strategy: 'momentum', reasoning: `${symbol} moved ${direction} ${Math.abs(snap.dailyChangePercent).toFixed(2)}% today, but your direction filter is "${cfg.directionFilter}" — this move doesn't qualify.` };
  }
  if (meetsConfidence) {
    const optType = direction === 'up' ? 'call' : 'put';
    return { decision: 'signal', score, price: snap.price, dailyChangePercent: snap.dailyChangePercent, strategy: 'momentum', direction, reasoning: `${symbol} moved ${direction} ${Math.abs(snap.dailyChangePercent).toFixed(2)}% today — momentum score ${score}/100 clears your ${cfg.minConfidence} minimum. Would target a ${cfg.strikeSelectionMode} ${optType}, ${cfg.expiryPreference} expiry.` };
  }
  return { decision: 'watching', score, price: snap.price, dailyChangePercent: snap.dailyChangePercent, strategy: 'momentum', reasoning: `${symbol} at $${snap.price.toFixed(2)} (${direction} ${Math.abs(snap.dailyChangePercent).toFixed(2)}% today) — momentum score ${score}/100 is below your ${cfg.minConfidence} confidence threshold. Watching, not acting.` };
}

const STRATEGY_RUNNERS: Record<string, (s: AlpacaService, sym: string, c: OptionsEngineConfig) => Promise<StrategyResult>> = {
  orb: runOrb,
  volume_profile: runVolumeProfile,
  breakout: runBreakout,
  momentum: runMomentum,
};

async function scanSymbol(service: AlpacaService, symbol: string, cfg: OptionsEngineConfig): Promise<StrategyResult> {
  const now = new Date();

  // Session filter — avoid the volatile open and the pin-risk/illiquid close window
  if (cfg.sessionFilterEnabled && isWeekday(now)) {
    const open = nyMarketOpenUTC(now);
    const close = nyMarketCloseUTC(now);
    const closeGuardStart = new Date(close.getTime() - cfg.avoidLastMinutesBeforeClose * 60000);
    if (now >= close || now < open) {
      return { decision: 'watching', reasoning: `${symbol}: outside regular market hours — session filter is on.`, score: null, price: null, dailyChangePercent: null, strategy: cfg.strategyMode };
    }
    if (now >= closeGuardStart) {
      return { decision: 'watching', reasoning: `${symbol}: within the last ${cfg.avoidLastMinutesBeforeClose} minutes before close — session filter is skipping new entries (pin-risk/illiquidity guard).`, score: null, price: null, dailyChangePercent: null, strategy: cfg.strategyMode };
    }
  }

  if (cfg.strategyMode === 'auto') {
    // Run all real strategies and take the highest-scoring signal; fall back to momentum's read if none signal.
    const results = await Promise.all(['orb', 'volume_profile', 'breakout', 'momentum'].map(k => STRATEGY_RUNNERS[k](service, symbol, cfg).catch(() => null)));
    const valid = results.filter((r): r is StrategyResult => !!r);
    const signals = valid.filter(r => r.decision === 'signal').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (signals.length > 0) return signals[0];
    const watching = valid.filter(r => r.decision === 'watching').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (watching.length > 0) return watching[0];
    return valid[0] ?? { decision: 'error', reasoning: `${symbol}: all strategies failed to return data.`, score: null, price: null, dailyChangePercent: null, strategy: 'auto' };
  }

  const runner = STRATEGY_RUNNERS[cfg.strategyMode];
  if (!runner) {
    return { decision: 'watching', reasoning: `${symbol}: strategy "${cfg.strategyMode}" isn't yet backed by live scanning logic (options-spread strategies like covered_call/credit_spread are on the roadmap) — no read produced.`, score: null, price: null, dailyChangePercent: null, strategy: cfg.strategyMode };
  }
  return runner(service, symbol, cfg);
}

// ══════════════════════════════════════════════════════════════════════════
// Execution — turning a 'signal' into a real order. Every step here can bail
// out (return null / no-op) rather than guess; ambiguity should skip a trade,
// never force one.
// ══════════════════════════════════════════════════════════════════════════

function daysUntil(dateStr: string, from: Date): number {
  const target = new Date(dateStr + 'T00:00:00Z');
  return Math.round((target.getTime() - from.getTime()) / (24 * 60 * 60000));
}

async function resolveContract(service: AlpacaService, underlyingSymbol: string, direction: 'up' | 'down', cfg: OptionsEngineConfig): Promise<AlpacaOptionContract | null> {
  const optType: 'call' | 'put' = direction === 'up' ? 'call' : 'put';
  const chain = await service.getOptionsChain(underlyingSymbol);
  const now = new Date();

  let candidates = chain.filter(c => c.type === optType && c.ask && c.ask > 0);
  candidates = candidates.filter(c => {
    const dte = daysUntil(c.expirationDate, now);
    return dte >= cfg.minDaysToExpiry && dte <= cfg.maxDaysToExpiry;
  });
  if (candidates.length === 0) return null;

  const targetDte = cfg.expiryPreference === '0dte' ? 0 : cfg.expiryPreference === 'weekly' ? 7 : cfg.expiryPreference === 'monthly' ? 30 : cfg.minDaysToExpiry;
  const sortedByExpiry = [...candidates].sort((a, b) => Math.abs(daysUntil(a.expirationDate, now) - targetDte) - Math.abs(daysUntil(b.expirationDate, now) - targetDte));
  const chosenExpiry = sortedByExpiry[0].expirationDate;
  candidates = candidates.filter(c => c.expirationDate === chosenExpiry);

  const snap = await service.getSnapshot(underlyingSymbol);
  if (!snap) return null;
  const price = snap.price;

  const sortedByStrike = [...candidates].sort((a, b) => a.strikePrice - b.strikePrice);

  if (cfg.strikeSelectionMode === 'delta_target') {
    const withDelta = sortedByStrike.filter(c => typeof c.delta === 'number');
    if (withDelta.length > 0) {
      return withDelta.sort((a, b) => Math.abs(Math.abs(a.delta!) - cfg.targetDelta) - Math.abs(Math.abs(b.delta!) - cfg.targetDelta))[0];
    }
    // no delta data available — fall through to ATM as the safest default
  }
  if (cfg.strikeSelectionMode === 'itm') {
    const itm = optType === 'call' ? sortedByStrike.filter(c => c.strikePrice < price) : sortedByStrike.filter(c => c.strikePrice > price);
    if (itm.length === 0) return null;
    return optType === 'call' ? itm[itm.length - 1] : itm[0]; // closest ITM strike to spot
  }
  if (cfg.strikeSelectionMode === 'otm') {
    const otm = optType === 'call' ? sortedByStrike.filter(c => c.strikePrice > price) : sortedByStrike.filter(c => c.strikePrice < price);
    if (otm.length === 0) return null;
    return optType === 'call' ? otm[0] : otm[otm.length - 1]; // closest OTM strike to spot
  }
  // atm (default/fallback)
  return sortedByStrike.sort((a, b) => Math.abs(a.strikePrice - price) - Math.abs(b.strikePrice - price))[0] ?? null;
}

function computeContractQuantity(equity: number, riskPerTradePct: number, askPrice: number, maxContracts: number): number {
  if (!askPrice || askPrice <= 0 || equity <= 0) return 0;
  const riskAmount = equity * (riskPerTradePct / 100);
  const contractCost = askPrice * 100; // options are quoted per-share; contract = 100 shares
  const bySize = Math.floor(riskAmount / contractCost);
  return Math.max(0, Math.min(bySize, maxContracts));
}

async function checkSafetyGates(userId: number, cfg: OptionsEngineConfig, equity: number): Promise<{ allowed: boolean; reason?: string }> {
  if (cfg.maxDailyTrades > 0) {
    const count = await storage.getTodayOptionsEngineTradeCount(userId);
    if (count >= cfg.maxDailyTrades) return { allowed: false, reason: `max daily trades (${cfg.maxDailyTrades}) already reached` };
  }
  const openTrades = await storage.getOpenOptionsEngineTrades(userId);
  if (openTrades.length >= cfg.maxOpenPositions) return { allowed: false, reason: `max open positions (${cfg.maxOpenPositions}) already reached` };

  if (equity > 0) {
    const todayPnl = await storage.getTodayOptionsEngineRealizedPnl(userId);
    if (cfg.dailyLossLimit > 0 && todayPnl <= -(equity * cfg.dailyLossLimit / 100)) {
      return { allowed: false, reason: `daily loss limit (${cfg.dailyLossLimit}%) reached` };
    }
    if (cfg.propFirmMode && todayPnl <= -(equity * cfg.propFirmDailyDrawdownLimit / 100)) {
      return { allowed: false, reason: `prop-firm daily drawdown limit (${cfg.propFirmDailyDrawdownLimit}%) reached` };
    }
    if (cfg.dailyProfitTarget > 0 && todayPnl >= (equity * cfg.dailyProfitTarget / 100)) {
      return { allowed: false, reason: `daily profit target (${cfg.dailyProfitTarget}%) already reached — locking in gains` };
    }
  }
  return { allowed: true };
}

async function executeSignal(service: AlpacaService, connection: AlpacaConnection, userId: number, underlyingSymbol: string, result: StrategyResult, cfg: OptionsEngineConfig): Promise<void> {
  if (!result.direction) return;

  const gate = await checkSafetyGates(userId, cfg, cfg.accountBalance);
  if (!gate.allowed) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped',
      reasoning: `${underlyingSymbol}: signal confirmed (${result.strategy}), but execution blocked — ${gate.reason}.`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca', strategy: result.strategy,
    });
    return;
  }

  let account;
  try {
    account = await service.getAccountInfo();
  } catch (err: any) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'error', strategy: result.strategy,
      reasoning: `${underlyingSymbol}: couldn't fetch account info before sizing the trade: ${err.message}`,
      score: null, price: null, dailyChangePercent: null, source: 'alpaca',
    });
    return;
  }

  const contract = await resolveContract(service, underlyingSymbol, result.direction, cfg).catch(() => null);
  if (!contract || !contract.ask) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'error', strategy: result.strategy,
      reasoning: `${underlyingSymbol}: signal confirmed, but no matching option contract was found for expiry preference "${cfg.expiryPreference}" / strike mode "${cfg.strikeSelectionMode}" within ${cfg.minDaysToExpiry}-${cfg.maxDaysToExpiry} days to expiry.`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  const quantity = computeContractQuantity(account.equity, cfg.riskPerTrade, contract.ask, cfg.maxContractsPerTrade);
  if (quantity < 1) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped', strategy: result.strategy,
      reasoning: `${underlyingSymbol}: signal confirmed, but ${cfg.riskPerTrade}% of equity ($${account.equity.toFixed(0)}) doesn't cover even 1 contract at $${contract.ask.toFixed(2)} ($${(contract.ask * 100).toFixed(0)}/contract).`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  let order;
  try {
    order = await service.placeOrder({ optionSymbol: contract.symbol, side: 'buy', quantity, type: 'market', timeInForce: 'day' });
  } catch (err: any) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'error', strategy: result.strategy,
      reasoning: `${underlyingSymbol}: order placement failed for ${contract.symbol} x${quantity}: ${err.message}`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  await storage.createOptionsEngineTrade({
    userId, connectionId: connection.id, broker: 'alpaca',
    underlyingSymbol, optionSymbol: contract.symbol, strategy: result.strategy,
    optionType: result.direction === 'up' ? 'call' : 'put', quantity,
    entryPrice: contract.ask, entryOrderId: order.orderId, entryReasoning: result.reasoning, status: 'open',
  });

  await storage.createOptionsEngineActivity({
    userId, symbol: underlyingSymbol, decision: 'signal', strategy: result.strategy,
    reasoning: `${underlyingSymbol}: EXECUTED — bought ${quantity}x ${contract.symbol} (${contract.type}, strike $${contract.strikePrice}, exp ${contract.expirationDate}) @ ~$${contract.ask.toFixed(2)}/contract. ${result.reasoning}`,
    score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
  });
}

// ── Exit management — close open trades on profit target / stop loss ───────
async function monitorOpenPositions(service: AlpacaService, userId: number, cfg: OptionsEngineConfig): Promise<void> {
  const openTrades = await storage.getOpenOptionsEngineTrades(userId);
  const alpacaTrades = openTrades.filter(t => t.broker === 'alpaca');
  for (const trade of alpacaTrades) {
    try {
      const quote = await service.getOptionQuote(trade.optionSymbol);
      if (!quote || quote.mid <= 0) continue;

      const pnlPercent = ((quote.mid - trade.entryPrice) / trade.entryPrice) * 100;
      let exitReason: string | null = null;
      if (pnlPercent >= cfg.profitTargetPercent) exitReason = 'profit_target';
      else if (pnlPercent <= -cfg.stopLossPercent) exitReason = 'stop_loss';
      if (!exitReason) continue;

      const closeOrder = await service.placeOrder({ optionSymbol: trade.optionSymbol, side: 'sell', quantity: trade.quantity, type: 'market', timeInForce: 'day' });
      const realizedPnl = (quote.mid - trade.entryPrice) * 100 * trade.quantity;
      await storage.closeOptionsEngineTrade(trade.id, { exitPrice: quote.mid, exitOrderId: closeOrder.orderId, exitReason, realizedPnl });
      await storage.createOptionsEngineActivity({
        userId, symbol: trade.underlyingSymbol, decision: 'signal', strategy: trade.strategy,
        reasoning: `${trade.underlyingSymbol}: CLOSED ${trade.optionSymbol} x${trade.quantity} @ ~$${quote.mid.toFixed(2)} (${exitReason === 'profit_target' ? '+' : ''}${pnlPercent.toFixed(1)}% of premium, ${exitReason.replace('_', ' ')}). Realized P&L: $${realizedPnl.toFixed(2)}.`,
        score: null, price: quote.mid, dailyChangePercent: null, source: 'alpaca',
      });
    } catch (err: any) {
      console.error(`[options-scanner] failed to monitor/close trade ${trade.id}:`, err.message);
    }
  }
}

async function scanOneUser(userId: number): Promise<void> {
  const config = await storage.getUserOptionsEngineConfig(userId);
  if (!config || !config.isActive) return;

  const now = Date.now();
  const last = lastScanAt.get(userId) || 0;
  if (now - last < Math.max(MIN_SCAN_INTERVAL_MS, config.scanIntervalMs)) return;
  lastScanAt.set(userId, now);

  const alpacaConns = await storage.getUserAlpacaConnections(userId);
  const activeAlpaca = alpacaConns.find(c => c.isActive);
  if (!activeAlpaca) {
    await storage.createOptionsEngineActivity({
      userId, symbol: '—', decision: 'error',
      reasoning: 'No active Alpaca connection — market data requires at least one connected Alpaca account. TastyTrade/Crypto.com orders can still execute, but symbol scanning needs Alpaca for now.',
      score: null, price: null, dailyChangePercent: null, source: 'none', strategy: null,
    });
    return;
  }

  let service: AlpacaService;
  try {
    const secret = decryptApiSecret(activeAlpaca.encryptedApiSecret);
    service = new AlpacaService(activeAlpaca.accountType as 'paper' | 'live', activeAlpaca.apiKeyId, secret);
  } catch (err: any) {
    await storage.createOptionsEngineActivity({
      userId, symbol: '—', decision: 'error',
      reasoning: `Could not decrypt Alpaca credentials: ${err.message}`,
      score: null, price: null, dailyChangePercent: null, source: 'alpaca', strategy: null,
    });
    return;
  }

  // Exit management runs every cycle regardless of new signals — closing a
  // winning/losing position takes priority over opening a new one.
  await monitorOpenPositions(service, userId, config).catch((e: any) =>
    console.error(`[options-scanner] monitorOpenPositions failed for user ${userId}:`, e.message)
  );

  // Auto-execution requires BOTH the engine's executionSource to allow Alpaca
  // AND the connection's own autoExecute switch — the per-connection toggle is
  // the master kill switch a user controls independently of engine settings.
  const canAutoExecute = activeAlpaca.autoExecute && (config.executionSource === 'alpaca' || config.executionSource === 'auto');

  const symbols: string[] = Array.isArray(config.symbols) ? config.symbols : [];
  for (const symbol of symbols) {
    try {
      const result = await scanSymbol(service, symbol, config);
      await storage.createOptionsEngineActivity({
        userId, symbol, decision: result.decision, reasoning: result.reasoning,
        score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent,
        source: 'alpaca', strategy: result.strategy,
      });
      if (result.decision === 'signal' && canAutoExecute) {
        await executeSignal(service, activeAlpaca, userId, symbol, result, config).catch((e: any) =>
          console.error(`[options-scanner] executeSignal failed for ${symbol}:`, e.message)
        );
      }
    } catch (err: any) {
      await storage.createOptionsEngineActivity({
        userId, symbol, decision: 'error', reasoning: `Scan failed for ${symbol}: ${err.message}`,
        score: null, price: null, dailyChangePercent: null, source: 'alpaca', strategy: config.strategyMode,
      });
    }
  }
}

export async function runOptionsEngineScan(): Promise<void> {
  try {
    const configs = await storage.getAllActiveOptionsEngineConfigs();
    for (const config of configs) {
      await scanOneUser(config.userId).catch((e: any) =>
        console.error(`[options-scanner] user ${config.userId} scan failed:`, e.message)
      );
    }
  } catch (err: any) {
    console.error('[options-scanner] runOptionsEngineScan failed:', err.message);
  }
}

let started = false;
export function startOptionsEngineScanner(): void {
  if (started) return;
  started = true;
  const LOOP_INTERVAL_MS = 60000;
  setInterval(() => { runOptionsEngineScan().catch(() => {}); }, LOOP_INTERVAL_MS);
  console.log('[options-scanner] Background options-engine scan loop started (60s tick, per-user throttled, strategies: orb/volume_profile/breakout/momentum/auto).');
}
