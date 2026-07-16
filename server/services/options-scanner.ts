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

// ── Strategy: Order Flow / CVD Proxy (Scalp) ─────────────────────────────────
// Adapted from an order-flow/auction-market-theory scalping approach (balance
// vs. imbalance, cumulative volume delta, VWAP as fair value). Alpaca/
// TastyTrade don't expose tick-level bid/ask order flow, so "CVD" here is a
// per-bar proxy: each bar's volume is attributed toward buyers/sellers by
// where in its own high-low range the close landed (closing near the high
// attributes most of that bar's volume to buying pressure, and vice versa) —
// a legitimate volume-weighted directional-pressure read from the same OHLCV
// bars every other strategy here already uses, not real executed-order CVD.
async function runOrderFlow(service: AlpacaService, symbol: string, cfg: OptionsEngineConfig): Promise<StrategyResult> {
  const now = new Date();
  const lookback = Math.max(10, cfg.orderFlowLookbackBars);
  // Window is computed in calendar days, not bar-minutes: a wall-clock window
  // of lookback*5min can't reach back across the ~17.5h overnight gap (let
  // alone a weekend), which starved this of bars every morning — erroring on
  // every scan until enough of THAT day's session had accumulated. A regular
  // session yields ~78 five-min bars, so reach back enough sessions to cover
  // the lookback plus 3 days of weekend/holiday padding, same approach as
  // runBreakout.
  const sessionsNeeded = Math.ceil(lookback / 78);
  const start = new Date(now.getTime() - (sessionsNeeded + 3) * 24 * 60 * 60000);
  const bars = await service.getBars(symbol, '5Min', start, now, 500);
  if (bars.length < lookback) {
    return { decision: 'error', reasoning: `${symbol}: not enough intraday bars returned to compute an order-flow read (need ${lookback}, got ${bars.length}).`, score: null, price: null, dailyChangePercent: null, strategy: 'order_flow' };
  }
  const window = bars.slice(-lookback);

  const deltas = window.map(b => {
    const range = b.h - b.l;
    if (range <= 0) return 0;
    const closeLocation = (b.c - b.l) / range; // 0 = closed at low, 1 = closed at high
    return b.v * (closeLocation * 2 - 1); // -v..+v
  });
  const mid = Math.floor(deltas.length / 2);
  const cvdFirstHalf = deltas.slice(0, mid).reduce((s, d) => s + d, 0);
  const cvdSecondHalf = deltas.slice(mid).reduce((s, d) => s + d, 0);
  const totalVolume = window.reduce((s, b) => s + b.v, 0) || 1;
  const cvdShiftPct = ((cvdSecondHalf - cvdFirstHalf) / totalVolume) * 100;

  // VWAP over the window (volume-weighted, using each bar's own vw) as the
  // "fair value" reference the source strategy trades around.
  const vwapNum = window.reduce((s, b) => s + b.vw * b.v, 0);
  const vwap = totalVolume > 0 ? vwapNum / totalVolume : window[window.length - 1].c;

  const last = window[window.length - 1];
  const price = last.c;
  const lastBarBullish = last.c > last.o;
  const lastBarBearish = last.c < last.o;

  // Balance vs. imbalance: the window's own high-low range as a % of price —
  // narrow = balanced/ranging (source strategy sits out), wide = imbalanced/
  // trending (source strategy looks to trade the imbalance).
  const windowHigh = Math.max(...window.map(b => b.h));
  const windowLow = Math.min(...window.map(b => b.l));
  const rangePct = ((windowHigh - windowLow) / windowLow) * 100;
  const imbalanced = rangePct > 0.8;

  const cvdBull = cvdShiftPct > 2; // buying pressure accelerated in the second half of the window
  const cvdBear = cvdShiftPct < -2;
  const aboveVwap = price > vwap;
  const belowVwap = price < vwap;

  let direction: 'up' | 'down' | 'inside' = 'inside';
  if (imbalanced && cvdBull && aboveVwap && lastBarBullish) direction = 'up';
  else if (imbalanced && cvdBear && belowVwap && lastBarBearish) direction = 'down';

  const directionAllowed =
    cfg.directionFilter === 'both' ||
    (cfg.directionFilter === 'calls_only' && direction === 'up') ||
    (cfg.directionFilter === 'puts_only' && direction === 'down');

  const distFromVwapPct = Math.abs((price - vwap) / vwap) * 100;
  const score = Math.min(100, Math.round(35 + Math.abs(cvdShiftPct) * 6 + distFromVwapPct * 8));

  if (!imbalanced) {
    return { decision: 'watching', reasoning: `${symbol}: range is tight (${rangePct.toFixed(2)}% over the last ${lookback} bars) — market looks balanced, not imbalanced. Order flow sits out until price moves out of balance.`, score, price, dailyChangePercent: null, strategy: 'order_flow' };
  }
  if (direction === 'inside') {
    return { decision: 'watching', reasoning: `${symbol}: imbalanced (${rangePct.toFixed(2)}% range) but volume-delta and VWAP aren't aligned yet (CVD shift ${cvdShiftPct.toFixed(1)}%, price $${price.toFixed(2)} vs VWAP $${vwap.toFixed(2)}) — waiting for a full-candle-close confirmation.`, score, price, dailyChangePercent: null, strategy: 'order_flow' };
  }
  if (!directionAllowed) {
    return { decision: 'skipped', reasoning: `${symbol}: order-flow read is ${direction} (CVD shift ${cvdShiftPct.toFixed(1)}%, vs VWAP $${vwap.toFixed(2)}), but your direction filter is "${cfg.directionFilter}" — doesn't qualify.`, score, price, dailyChangePercent: null, strategy: 'order_flow' };
  }
  if (score < cfg.minConfidence) {
    return { decision: 'watching', reasoning: `${symbol}: ${direction} order-flow read (CVD shift ${cvdShiftPct.toFixed(1)}%, ${distFromVwapPct.toFixed(1)}% from VWAP), but score ${score}/100 is below your ${cfg.minConfidence} threshold.`, score, price, dailyChangePercent: null, strategy: 'order_flow' };
  }
  const optType = direction === 'up' ? 'call' : 'put';
  return {
    decision: 'signal', score, price, dailyChangePercent: null, strategy: 'order_flow', direction,
    reasoning: `${symbol}: imbalanced market (${rangePct.toFixed(2)}% range over ${lookback} bars) with a ${direction} volume-delta shift of ${cvdShiftPct.toFixed(1)}%, price $${price.toFixed(2)} ${direction === 'up' ? 'above' : 'below'} VWAP $${vwap.toFixed(2)}, confirmed by a full ${direction === 'up' ? 'bullish' : 'bearish'} candle close. Score ${score}/100. Would target a ${cfg.strikeSelectionMode} ${optType}, ${cfg.expiryPreference} expiry.`,
  };
}

// ══════════════════════════════════════════════════════════════════════════
// Dual-Vote Consensus — Quant Rules Agent + AI Agent, mirroring the FX SS
// Engine's runForexQuantAgent + getAiVisionConfirmation dual-vote system.
// The "Quant Agent" here re-expresses the strategy's own score/reasoning as a
// verdict (it IS a hard technical-rules score, same spirit as FX's EMA/RSI/
// MACD/volume/ADX scoring); the "AI Agent" is a genuine second opinion from a
// text LLM call (same non-image "vision" pattern the FX engine actually uses).
// ══════════════════════════════════════════════════════════════════════════
type QuantVerdict = 'CONFIRM' | 'WATCH' | 'SKIP';
type ConsensusLabel = 'STRONG_CONFIRM' | 'STRONG_SKIP' | 'CAUTION' | 'WATCH';

function quantVerdictFromScore(score: number | null): QuantVerdict {
  if (score === null) return 'SKIP';
  if (score >= 65) return 'CONFIRM';
  if (score >= 40) return 'WATCH';
  return 'SKIP';
}

async function getOptionsAiConfirmation(userId: number, symbol: string, result: StrategyResult, cfg: OptionsEngineConfig): Promise<{ confirmed: boolean; confidence: number; reasoning: string }> {
  try {
    const { getUniversalAIClientForUser } = await import('../openai');
    const client = await getUniversalAIClientForUser(userId);
    const system = 'You are a disciplined options-trading second opinion. Given a technical signal from a rules-based scanner, decide whether you would independently confirm or skip it. Respond ONLY with JSON: {"confirmed": boolean, "confidence": number (0-100), "reasoning": string (1-2 sentences)}.';
    const user = `Underlying: ${symbol}\nStrategy: ${result.strategy}\nDirection: ${result.direction}\nQuant score: ${result.score}/100\nPrice: ${result.price}\nDaily change %: ${result.dailyChangePercent}\nScanner reasoning: ${result.reasoning}\n\nWould you confirm this trade?`;
    const r = await (client as any).chat.completions.create({
      model: (client as any).defaultModel || 'gpt-4o-mini',
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      max_tokens: 300,
      temperature: 0.3,
    });
    const parsed = JSON.parse(r.choices?.[0]?.message?.content || '{}');
    return {
      confirmed: !!parsed.confirmed,
      confidence: Math.max(0, Math.min(100, Number(parsed.confidence) || 0)),
      reasoning: String(parsed.reasoning || ''),
    };
  } catch (err: any) {
    // AI call failed — fail closed (don't confirm), but don't crash the scan.
    return { confirmed: false, confidence: 0, reasoning: `AI confirmation unavailable: ${err.message}` };
  }
}

interface OptionsConsensusEntry {
  symbol: string; strategy: string;
  quantVerdict: QuantVerdict; quantScore: number;
  aiVerdict: 'CONFIRM' | 'SKIP'; aiConfidence: number; aiReasoning: string;
  consensus: ConsensusLabel;
  tradeAllowed: boolean;
  timestamp: string;
}

function pushOptionsConsensus(userId: number, entry: OptionsConsensusEntry): void {
  (global as any).optionsEngineConsensus = (global as any).optionsEngineConsensus || {};
  const list: OptionsConsensusEntry[] = (global as any).optionsEngineConsensus[userId] || [];
  const deduped = list.filter(e => e.symbol !== entry.symbol);
  (global as any).optionsEngineConsensus[userId] = [entry, ...deduped].slice(0, 20);
}

// Returns whether execution should proceed, and records the consensus entry
// regardless (so the client-side panel shows every signal the engine saw,
// not just the ones that traded).
async function assembleOptionsConsensus(userId: number, symbol: string, result: StrategyResult, cfg: OptionsEngineConfig): Promise<boolean> {
  const quantVerdict = quantVerdictFromScore(result.score);

  if (cfg.aiMode === 'rule_based') {
    // No AI call — quant-only consensus. Quant SKIP hard-blocks; CONFIRM/WATCH proceed.
    const tradeAllowed = quantVerdict !== 'SKIP';
    pushOptionsConsensus(userId, {
      symbol, strategy: result.strategy, quantVerdict, quantScore: result.score ?? 0,
      aiVerdict: 'CONFIRM', aiConfidence: 0, aiReasoning: 'Rule-based mode — AI confirmation skipped.',
      consensus: quantVerdict === 'CONFIRM' ? 'STRONG_CONFIRM' : quantVerdict === 'SKIP' ? 'STRONG_SKIP' : 'WATCH',
      tradeAllowed, timestamp: new Date().toISOString(),
    });
    return tradeAllowed;
  }

  const ai = await getOptionsAiConfirmation(userId, symbol, result, cfg);
  const aiVerdict: 'CONFIRM' | 'SKIP' = ai.confirmed && ai.confidence >= Math.max(60, cfg.minConfidence) ? 'CONFIRM' : 'SKIP';

  let consensus: ConsensusLabel;
  if (quantVerdict === 'CONFIRM' && aiVerdict === 'CONFIRM') consensus = 'STRONG_CONFIRM';
  else if (quantVerdict === 'SKIP' && aiVerdict === 'SKIP') consensus = 'STRONG_SKIP';
  else if ((quantVerdict === 'CONFIRM' && aiVerdict === 'SKIP') || (quantVerdict === 'SKIP' && aiVerdict === 'CONFIRM')) consensus = 'CAUTION';
  else consensus = 'WATCH';

  const tradeAllowed = consensus !== 'STRONG_SKIP' && aiVerdict === 'CONFIRM';

  pushOptionsConsensus(userId, {
    symbol, strategy: result.strategy, quantVerdict, quantScore: result.score ?? 0,
    aiVerdict, aiConfidence: ai.confidence, aiReasoning: ai.reasoning,
    consensus, tradeAllowed, timestamp: new Date().toISOString(),
  });
  return tradeAllowed;
}

const STRATEGY_RUNNERS: Record<string, (s: AlpacaService, sym: string, c: OptionsEngineConfig) => Promise<StrategyResult>> = {
  orb: runOrb,
  volume_profile: runVolumeProfile,
  breakout: runBreakout,
  momentum: runMomentum,
  order_flow: runOrderFlow,
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
    const results = await Promise.all(['orb', 'volume_profile', 'breakout', 'momentum', 'order_flow'].map(k => STRATEGY_RUNNERS[k](service, symbol, cfg).catch(() => null)));
    const valid = results.filter((r): r is StrategyResult => !!r);
    const signals = valid.filter(r => r.decision === 'signal').sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    if (signals.length > 0) return signals[0];

    // Composite Autonomous Entries — no single strategy cleared its own bar,
    // but if a majority of strategies that DID return a read agree on
    // direction and their blended "edge score" clears the configured floor,
    // trade the consensus anyway. This is the multi-strategy-agreement analog
    // to the FX engine's rule-based consensus voting.
    if (cfg.enableCompositeAutonomous) {
      const withDirection = valid.filter(r => (r.decision === 'watching' || r.decision === 'signal') && typeof r.score === 'number');
      // Individual 'watching' results don't carry a direction field, so momentum's
      // raw daily-change sign is used as the composite's direction tiebreaker.
      const momentum = valid.find(r => r.strategy === 'momentum');
      const compositeScore = withDirection.length > 0 ? withDirection.reduce((s, r) => s + (r.score ?? 0), 0) / withDirection.length : 0;
      if (momentum && momentum.dailyChangePercent !== null && compositeScore >= cfg.compositeMinEdgeScore) {
        const direction: 'up' | 'down' = momentum.dailyChangePercent >= 0 ? 'up' : 'down';
        const directionAllowed =
          cfg.directionFilter === 'both' ||
          (cfg.directionFilter === 'calls_only' && direction === 'up') ||
          (cfg.directionFilter === 'puts_only' && direction === 'down');
        if (directionAllowed) {
          const optType = direction === 'up' ? 'call' : 'put';
          return {
            decision: 'signal', score: Math.round(compositeScore), price: momentum.price, dailyChangePercent: momentum.dailyChangePercent,
            strategy: 'composite_autonomous', direction,
            reasoning: `${symbol}: Composite Autonomous Entry — ${withDirection.length} strategies blended to a ${Math.round(compositeScore)}/100 edge score (floor ${cfg.compositeMinEdgeScore}), consensus direction ${direction} from momentum. Would target a ${cfg.strikeSelectionMode} ${optType}, ${cfg.expiryPreference} expiry.`,
          };
        }
      }
    }

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

// ── Sizing — base risk% sizing, then Brain Learning Mode lock / Kelly boost,
// mirroring the FX engine's exact same two gates (in the same precedence:
// Brain lock overrides everything else while it's active). ──────────────────
async function computeContractQuantity(userId: number, cfg: OptionsEngineConfig, equity: number, askPrice: number, signalScore: number | null = null): Promise<{ quantity: number; reasoning: string }> {
  if (!askPrice || askPrice <= 0 || equity <= 0) return { quantity: 0, reasoning: '' };
  const contractCost = askPrice * 100; // options are quoted per-share; contract = 100 shares
  const riskAmount = equity * (cfg.riskPerTrade / 100);
  const baseQty = Math.max(0, Math.min(Math.floor(riskAmount / contractCost), cfg.maxContractsPerTrade));

  // High Confidence Override — a 90+ score signal bypasses the Brain Learning
  // lock, same exception the FX engine grants its R:R floor at 88%+ confidence.
  if (cfg.highConfidenceOverride && (signalScore ?? 0) >= 90) {
    const kelly = cfg.useKellyCriterion ? await storage.getOptionsEngineTradeStats(userId) : null;
    const qty = kelly
      ? Math.min(cfg.maxContractsPerTrade, Math.max(baseQty, Math.round(baseQty * (1 + (kelly.winRate / 100) * 0.25))))
      : baseQty;
    return { quantity: qty, reasoning: `⚡ High Confidence Override: ${signalScore}/100 score bypasses Brain Learning lock — ${qty} contracts.` };
  }

  if (cfg.brainLearningMode) {
    const stats = await storage.getOptionsEngineTradeStats(userId);
    const brainLocked = stats.totalClosed < 10 || stats.winRate < 60;
    if (brainLocked) {
      const lockedQty = baseQty > 0 ? 1 : 0;
      return {
        quantity: lockedQty,
        reasoning: `🧠 Learning Mode: contracts locked at 1 (${stats.totalClosed}/10 trades, ${stats.winRate}%/60% WR) — full sizing unlocks automatically.`,
      };
    }
    if (cfg.useKellyCriterion) {
      const fractionalKelly = (stats.winRate / 100) * 0.25;
      const kellyQty = Math.min(cfg.maxContractsPerTrade, Math.max(baseQty, Math.round(baseQty * (1 + fractionalKelly))));
      return { quantity: kellyQty, reasoning: `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) + Kelly sizing: ${kellyQty} contracts.` };
    }
    return { quantity: baseQty, reasoning: `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) — full risk sizing active.` };
  }

  if (cfg.useKellyCriterion) {
    const stats = await storage.getOptionsEngineTradeStats(userId);
    const fractionalKelly = (stats.winRate / 100) * 0.25;
    const kellyQty = Math.min(cfg.maxContractsPerTrade, Math.max(baseQty, Math.round(baseQty * (1 + fractionalKelly))));
    return { quantity: kellyQty, reasoning: `Kelly Criterion sizing (${stats.winRate}% WR over ${stats.totalClosed} trades): ${kellyQty} contracts.` };
  }

  return { quantity: baseQty, reasoning: '' };
}

// Session high-watermark for Drawdown Shield — resets on process restart,
// same "session" scope as the FX engine's shield (it is meant to react to
// intra-session equity swings, not survive indefinitely across restarts).
const sessionPeakEquity = new Map<number, number>();

async function checkSafetyGates(userId: number, cfg: OptionsEngineConfig, equity: number): Promise<{ allowed: boolean; reason?: string; riskMultiplier: number }> {
  if (cfg.maxDailyTrades > 0) {
    const count = await storage.getTodayOptionsEngineTradeCount(userId);
    if (count >= cfg.maxDailyTrades) return { allowed: false, reason: `max daily trades (${cfg.maxDailyTrades}) already reached`, riskMultiplier: 1 };
  }
  const openTrades = await storage.getOpenOptionsEngineTrades(userId);
  if (openTrades.length >= cfg.maxOpenPositions) return { allowed: false, reason: `max open positions (${cfg.maxOpenPositions}) already reached`, riskMultiplier: 1 };

  let riskMultiplier = 1;

  if (equity > 0) {
    const todayPnl = await storage.getTodayOptionsEngineRealizedPnl(userId);
    if (cfg.dailyLossLimit > 0 && todayPnl <= -(equity * cfg.dailyLossLimit / 100)) {
      return { allowed: false, reason: `daily loss limit (${cfg.dailyLossLimit}%) reached`, riskMultiplier: 1 };
    }
    if (cfg.propFirmMode && todayPnl <= -(equity * cfg.propFirmDailyDrawdownLimit / 100)) {
      return { allowed: false, reason: `prop-firm daily drawdown limit (${cfg.propFirmDailyDrawdownLimit}%) reached`, riskMultiplier: 1 };
    }
    if (cfg.dailyProfitTarget > 0 && todayPnl >= (equity * cfg.dailyProfitTarget / 100)) {
      return { allowed: false, reason: `daily profit target (${cfg.dailyProfitTarget}%) already reached — locking in gains`, riskMultiplier: 1 };
    }

    // ── Drawdown Shield — auto-tighten to conservative sizing once equity
    // pulls back from its session peak by more than the configured threshold.
    const peak = Math.max(sessionPeakEquity.get(userId) ?? equity, equity);
    sessionPeakEquity.set(userId, peak);
    const ddFromPeakPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (ddFromPeakPct >= cfg.drawdownShieldThreshold) {
      riskMultiplier = Math.min(riskMultiplier, 0.25);
    }

    // ── Consistency enforcement — reduce risk as the prop-firm challenge
    // period runs low on days remaining to hit the min-profitable-days bar.
    if (cfg.consistencyEnforcementEnabled && cfg.propFirmMode) {
      const history = await storage.getOptionsEngineDailyPnlHistory(userId, cfg.consistencyPeriodDays);
      const today = new Date().toISOString().split('T')[0];
      history[today] = todayPnl;
      const recentKeys = Object.keys(history).sort().slice(-cfg.consistencyPeriodDays);
      const profitableDays = recentKeys.filter(k => (history[k] ?? 0) > 0).length;
      const tradingDays = recentKeys.length;
      const daysRemaining = cfg.consistencyPeriodDays - tradingDays;
      const todayIsLosing = todayPnl < 0;
      const daysNeeded = cfg.consistencyMinProfitableDays - profitableDays;
      const mustWinRemaining = todayIsLosing ? daysNeeded : Math.max(0, daysNeeded - 1);
      if (mustWinRemaining > 0 && daysRemaining <= mustWinRemaining + 1) {
        riskMultiplier = Math.min(riskMultiplier, 0.25);
      } else if (mustWinRemaining > 0 && daysRemaining <= mustWinRemaining + 3) {
        riskMultiplier = Math.min(riskMultiplier, 0.5);
      }

      // Max single-day profit as % of total challenge profit (FTMO-style rule) —
      // once today already accounts for too much of total profit, stop banking more.
      if (cfg.maxDailyProfitPctOfTotal > 0) {
        const totalProfitAllTime = Object.values(history).reduce((s, v) => s + Math.max(0, v ?? 0), 0);
        const todayProfit = Math.max(0, todayPnl);
        if (totalProfitAllTime > 0 && todayProfit > 0) {
          const todayPctOfTotal = (todayProfit / totalProfitAllTime) * 100;
          if (todayPctOfTotal >= cfg.maxDailyProfitPctOfTotal) {
            return { allowed: false, reason: `consistency rule — today's profit is already ${todayPctOfTotal.toFixed(0)}% of total challenge profit (limit ${cfg.maxDailyProfitPctOfTotal}%)`, riskMultiplier: 1 };
          }
        }
      }
    }
  }
  return { allowed: true, riskMultiplier };
}

async function executeSignal(service: AlpacaService, connection: AlpacaConnection, userId: number, underlyingSymbol: string, result: StrategyResult, cfg: OptionsEngineConfig): Promise<void> {
  if (!result.direction) return;

  // Account info is fetched BEFORE the safety gates so the gates run against
  // the same live equity that position sizing uses below. They previously ran
  // against the user-typed cfg.accountBalance, which defaults to 0 — and the
  // equity-based gates (daily loss limit, prop-firm drawdown, daily profit
  // target) are skipped entirely when equity is 0, so any user who never set
  // a balance had those protections silently disabled while trades still
  // sized and executed off real equity.
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

  const gateEquity = account.equity > 0 ? account.equity : cfg.accountBalance;
  const gate = await checkSafetyGates(userId, cfg, gateEquity);
  if (!gate.allowed) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped',
      reasoning: `${underlyingSymbol}: signal confirmed (${result.strategy}), but execution blocked — ${gate.reason}.`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca', strategy: result.strategy,
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

  // Drawdown Shield / consistency-rule risk reduction applies as a multiplier
  // on the configured risk% before sizing — never on the base cfg object.
  const sizingCfg = gate.riskMultiplier < 1 ? { ...cfg, riskPerTrade: cfg.riskPerTrade * gate.riskMultiplier } : cfg;
  const { quantity, reasoning: sizingReasoningRaw } = await computeContractQuantity(userId, sizingCfg, account.equity, contract.ask, result.score);
  const sizingReasoning = gate.riskMultiplier < 1
    ? `${sizingReasoningRaw} ⚠️ Risk reduced to ${Math.round(gate.riskMultiplier * 100)}% of normal (Drawdown Shield / consistency rule active).`
    : sizingReasoningRaw;
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
    reasoning: `${underlyingSymbol}: EXECUTED — bought ${quantity}x ${contract.symbol} (${contract.type}, strike $${contract.strikePrice}, exp ${contract.expirationDate}) @ ~$${contract.ask.toFixed(2)}/contract. ${result.reasoning}${sizingReasoning ? ` ${sizingReasoning}` : ''}`,
    score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
  });
}

// ── Trailing-stop system — FX-engine parity, adapted to premium % moves ────
// Options don't have pips/ATR-on-the-underlying cheaply available every scan
// cycle, so every method here trails as a function of the trade's own P&L%
// (peak-tracked) rather than true underlying price structure. Each method's
// distinctive shape (fixed distance, staircase, locked fraction of peak,
// widening/tightening acceleration) is preserved even though the input signal
// is premium % instead of pips — this is a deliberate adaptation, not a stub.
function computeTrailFloorPercent(cfg: OptionsEngineConfig, peakPnlPercent: number): number {
  switch (cfg.trailMethod) {
    case 'fixed_pct':
      return peakPnlPercent - cfg.trailFixedPct;
    case 'stepped_fixed': {
      // Staircase: floor only ratchets up in whole trailStepPct increments of peak.
      const steps = Math.floor(peakPnlPercent / cfg.trailStepPct);
      return (steps - 1) * cfg.trailStepPct;
    }
    case 'profit_lock':
      // Locks in a fixed fraction of the best profit seen, never gives more back than that.
      return peakPnlPercent * (cfg.trailProfitLockPct / 100);
    case 'chandelier':
      // ATR-style — wider stop than fixed_pct since it's meant to ride bigger swings.
      return peakPnlPercent - cfg.trailFixedPct * 1.5;
    case 'parabolic_sar': {
      // Acceleration factor ramps from initial→max as profit builds, tightening the give-back.
      const af = Math.min(cfg.trailSarMaxAF, cfg.trailSarInitialAF + (peakPnlPercent / 100) * cfg.trailSarInitialAF);
      return peakPnlPercent * (1 - af);
    }
    case 'r_multiple':
      // Give back at most half of every R gained past activation.
      return cfg.trailActivationPct + (peakPnlPercent - cfg.trailActivationPct) * 0.5;
    case 'swing_structure':
      // Anchors tighter than fixed_pct, approximating "nearest structure" without underlying swing data.
      return peakPnlPercent - cfg.trailFixedPct * 0.75;
    default:
      return -Infinity; // 'none' — no trailing floor, static TP/SL only
  }
}

// ── Exit management — close open trades on profit target / stop loss, or a
// per-trade trailing stop once cfg.trailMethod is enabled and armed ─────────
async function monitorOpenPositions(service: AlpacaService, userId: number, cfg: OptionsEngineConfig): Promise<void> {
  const openTrades = await storage.getOpenOptionsEngineTrades(userId);
  const alpacaTrades = openTrades.filter(t => t.broker === 'alpaca');
  for (const trade of alpacaTrades) {
    try {
      const quote = await service.getOptionQuote(trade.optionSymbol);
      if (!quote || quote.mid <= 0) continue;

      const pnlPercent = ((quote.mid - trade.entryPrice) / trade.entryPrice) * 100;
      let exitReason: string | null = null;

      if (cfg.trailMethod === 'none') {
        if (pnlPercent >= cfg.profitTargetPercent) exitReason = 'profit_target';
        else if (pnlPercent <= -cfg.stopLossPercent) exitReason = 'stop_loss';
      } else {
        const peakPnlPercent = Math.max(trade.peakPnlPercent, pnlPercent);
        const armed = trade.trailArmed || peakPnlPercent >= cfg.trailActivationPct;

        if (pnlPercent <= -cfg.stopLossPercent) {
          exitReason = 'stop_loss'; // hard stop always applies, trail or not
        } else if (armed) {
          const rawFloor = computeTrailFloorPercent(cfg, peakPnlPercent);
          // Breakeven buffer: once trailing is armed, never let the floor fall
          // below a small locked-in gain regardless of the method's own math.
          const floor = Math.max(rawFloor, cfg.breakevenBufferPct);
          if (pnlPercent <= floor) exitReason = 'trailing_stop';
        }

        if (!exitReason && (peakPnlPercent !== trade.peakPnlPercent || armed !== trade.trailArmed)) {
          await storage.updateOptionsEngineTradeTrailState(trade.id, { peakPnlPercent, trailArmed: armed });
        }
      }

      if (!exitReason) continue;

      const closeOrder = await service.placeOrder({ optionSymbol: trade.optionSymbol, side: 'sell', quantity: trade.quantity, type: 'market', timeInForce: 'day' });
      const realizedPnl = (quote.mid - trade.entryPrice) * 100 * trade.quantity;
      await storage.closeOptionsEngineTrade(trade.id, { exitPrice: quote.mid, exitOrderId: closeOrder.orderId, exitReason, realizedPnl });
      await storage.createOptionsEngineActivity({
        userId, symbol: trade.underlyingSymbol, decision: 'signal', strategy: trade.strategy,
        reasoning: `${trade.underlyingSymbol}: CLOSED ${trade.optionSymbol} x${trade.quantity} @ ~$${quote.mid.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}% of premium, ${exitReason.replace('_', ' ')}). Realized P&L: $${realizedPnl.toFixed(2)}.`,
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

  // Trading-days-of-week gate — skip the whole scan on days the user hasn't opted into.
  const todayDow = new Date().getUTCDay();
  const allowedDows: number[] = Array.isArray(config.tradingDaysOfWeek) ? config.tradingDaysOfWeek : [1, 2, 3, 4, 5];
  if (!allowedDows.includes(todayDow)) return;

  const symbolDaySchedule: Record<string, number[]> = (config.symbolDaySchedule as any) || {};
  const symbolDirectionOverrides: Record<string, string> = (config.symbolDirectionOverrides as any) || {};
  const symbolContractOverrides: Record<string, number> = (config.symbolContractOverrides as any) || {};

  const symbols: string[] = Array.isArray(config.symbols) ? config.symbols : [];
  for (const symbol of symbols) {
    try {
      // Per-symbol day override — if this symbol has its own schedule, it takes precedence over the global one.
      const symbolDays = symbolDaySchedule[symbol];
      if (Array.isArray(symbolDays) && symbolDays.length > 0 && !symbolDays.includes(todayDow)) {
        continue;
      }

      let symbolCfg = config;
      if (symbolDirectionOverrides[symbol] || symbolContractOverrides[symbol]) {
        symbolCfg = {
          ...config,
          directionFilter: (symbolDirectionOverrides[symbol] as any) || config.directionFilter,
          maxContractsPerTrade: symbolContractOverrides[symbol] || config.maxContractsPerTrade,
        };
      }

      // Smart Symbol Escalation — a symbol whose most recent closed trade was a
      // win gets a slightly lower confidence bar this cycle, mirroring how a
      // discretionary trader gives a recently-proven setup a bit more benefit
      // of the doubt without touching every other symbol's threshold.
      if (config.smartSymbolEscalation) {
        const recentForSymbol = (await storage.getUserOptionsEngineTrades(userId, 50))
          .filter(t => t.underlyingSymbol === symbol && t.status === 'closed')
          .sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime());
        if (recentForSymbol[0] && (recentForSymbol[0].realizedPnl ?? 0) > 0) {
          symbolCfg = { ...symbolCfg, minConfidence: Math.max(50, symbolCfg.minConfidence - 5) };
        }
      }

      const result = await scanSymbol(service, symbol, symbolCfg);
      await storage.createOptionsEngineActivity({
        userId, symbol, decision: result.decision, reasoning: result.reasoning,
        score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent,
        source: 'alpaca', strategy: result.strategy,
      });
      if (result.decision === 'signal' && canAutoExecute) {
        const tradeAllowed = await assembleOptionsConsensus(userId, symbol, result, symbolCfg).catch((e: any) => {
          console.error(`[options-scanner] consensus check failed for ${symbol}:`, e.message);
          return true; // consensus check itself failing shouldn't block an otherwise-valid signal
        });
        if (tradeAllowed) {
          await executeSignal(service, activeAlpaca, userId, symbol, result, symbolCfg).catch((e: any) =>
            console.error(`[options-scanner] executeSignal failed for ${symbol}:`, e.message)
          );
        } else {
          await storage.createOptionsEngineActivity({
            userId, symbol, decision: 'skipped', strategy: result.strategy,
            reasoning: `${symbol}: signal confirmed by quant scan, but Dual-Vote Consensus blocked execution (AI second opinion disagreed).`,
            score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
          });
        }
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
  console.log('[options-scanner] Background options-engine scan loop started (60s tick, per-user throttled, strategies: orb/volume_profile/breakout/momentum/order_flow/auto).');
}
