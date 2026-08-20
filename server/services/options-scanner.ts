// ── Options AI Engine — scan/decision feed ──────────────────────────────────
// Real, explainable technical reads over each user's watched symbols using
// their connected Alpaca account's market data — not full AI-driven strategy
// selection yet, but genuine calculations (not fabricated). Every cycle
// produces a per-symbol log entry explaining what the engine saw and why it
// is (or isn't) acting. Order placement itself is a future step; this scans
// and explains only — settings like strike/expiry preference currently shape
// the *reasoning* the engine gives, not yet a live order.

import { storage } from '../storage';
import { AlpacaService, decryptApiSecret, parseOccSymbol, type AlpacaOptionContract, type AlpacaMultiLegLeg } from '../alpaca';
import type { OptionsEngineConfig, AlpacaConnection } from '../../shared/schema';
import { getOrRefreshOptionsBrain } from './options-brain';

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
    const { getUniversalAIClientForUser, hasHiddenReasoningOverhead } = await import('../openai');
    const client = await getUniversalAIClientForUser(userId);
    const system = 'You are a disciplined options-trading second opinion. Given a technical signal from a rules-based scanner, decide whether you would independently confirm or skip it. Respond ONLY with JSON: {"confirmed": boolean, "confidence": number (0-100), "reasoning": string (1-2 sentences)}.';
    const user = `Underlying: ${symbol}\nStrategy: ${result.strategy}\nDirection: ${result.direction}\nQuant score: ${result.score}/100\nPrice: ${result.price}\nDaily change %: ${result.dailyChangePercent}\nScanner reasoning: ${result.reasoning}\n\nWould you confirm this trade?`;
    const model = (client as any).defaultModel || 'gpt-4o-mini';
    const r = await (client as any).chat.completions.create({
      model,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
      response_format: { type: 'json_object' },
      // 300 was too tight for gpt-oss/Qwen3 (the current Groq/OpenRouter default
      // models) — their hidden reasoning tokens alone could consume the whole
      // budget and leave content empty, which this function's catch block then
      // reports as a hard failure (confidence 0) indistinguishable from an
      // actual provider/auth error.
      max_tokens: hasHiddenReasoningOverhead(model) ? 1200 : 300,
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
  // Mirror to the durable table so a server restart doesn't blank the panel
  // until the next scan cycle happens to run (fire-and-forget, non-fatal).
  import('./engine-consensus').then(({ recordEngineConsensus }) =>
    recordEngineConsensus(userId, 'options', entry)
  ).catch(() => {});
}

// Returns whether execution should proceed, and records the consensus entry
// regardless (so the client-side panel shows every signal the engine saw,
// not just the ones that traded).
async function assembleOptionsConsensus(userId: number, symbol: string, result: StrategyResult, cfg: OptionsEngineConfig): Promise<boolean> {
  const quantVerdict = quantVerdictFromScore(result.score);

  if (cfg.aiMode === 'rule_based') {
    // No AI call — quant-only consensus. Quant SKIP hard-blocks; CONFIRM/WATCH
    // proceed only if the score also clears the user's own minConfidence —
    // previously this used a fixed 65 floor regardless of what the user set,
    // so a lower minConfidence setting had no effect on rule_based mode.
    const tradeAllowed = quantVerdict !== 'SKIP' && (result.score ?? 0) >= cfg.minConfidence;
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

  // 'credit_spread' isn't a signal generator — it's an execution style. Derive
  // its directional read from the same 'auto' multi-strategy logic; the credit
  // spread is then built in executeSignal (creditSpreadEnabled path).
  if (cfg.strategyMode === 'auto' || cfg.strategyMode === 'credit_spread') {
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

// Spread/liquidity/IV-approximation gate — options need this more than stocks
// since a wide bid-ask spread eats the whole edge before the trade even moves,
// and buying rich premium at a high IV level structurally favors the seller.
// Note: Alpaca's snapshot endpoint gives raw impliedVolatility, not a true
// historical IV-rank percentile (that needs 1yr+ IV history this codebase
// doesn't fetch anywhere) — cfg.ivRankMax is applied here as an approximate
// raw-IV cap (IV*100) until real IV-rank data is wired in.
function passesLiquidityAndIvGate(c: AlpacaOptionContract, cfg: OptionsEngineConfig): boolean {
  if (!c.bid || c.bid <= 0 || !c.ask || c.ask <= 0) return false;
  const mid = (c.bid + c.ask) / 2;
  const spreadPct = mid > 0 ? ((c.ask - c.bid) / mid) * 100 : Infinity;
  if (spreadPct > cfg.maxSpreadPct) return false;
  // Alpaca's options snapshot endpoint does not return openInterest on this
  // account's data plan (verified: 0/200 contracts across SPY/QQQ/NVDA/TSLA
  // report it) — only enforce the OI floor when a real value is present,
  // same pattern as the IV check below. Defaulting missing OI to 0 rejected
  // every single contract and silently blocked 100% of trades since this
  // gate was added (2026-07-20).
  if (typeof c.openInterest === 'number' && c.openInterest < cfg.minOpenInterest) return false;
  if (typeof c.impliedVolatility === 'number' && c.impliedVolatility * 100 > cfg.ivRankMax) return false;
  return true;
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
  candidates = candidates.filter(c => passesLiquidityAndIvGate(c, cfg));
  if (candidates.length === 0) return null;

  // 'auto' no longer targets the absolute minimum DTE (often 1) — theta decay
  // is steepest in the final days before expiry, so the default now aims for
  // a ~7-day (weekly-equivalent) contract unless the user explicitly chose
  // '0dte'/'weekly'/'monthly'.
  const targetDte = cfg.expiryPreference === '0dte' ? 0 : cfg.expiryPreference === 'weekly' ? 7 : cfg.expiryPreference === 'monthly' ? 30 : 7;
  const sortedByExpiry = [...candidates].sort((a, b) => Math.abs(daysUntil(a.expirationDate, now) - targetDte) - Math.abs(daysUntil(b.expirationDate, now) - targetDte));
  const chosenExpiry = sortedByExpiry[0].expirationDate;
  candidates = candidates.filter(c => c.expirationDate === chosenExpiry);

  const snap = await service.getSnapshot(underlyingSymbol);
  if (!snap) return null;
  const price = snap.price;

  // Among liquid candidates at the chosen expiry, prefer the tightest spread
  // when multiple strikes are otherwise equally valid for the selection mode.
  const bySpread = (a: AlpacaOptionContract, b: AlpacaOptionContract) => {
    const spreadA = a.bid && a.ask ? (a.ask - a.bid) / ((a.ask + a.bid) / 2) : Infinity;
    const spreadB = b.bid && b.ask ? (b.ask - b.bid) / ((b.ask + b.bid) / 2) : Infinity;
    return spreadA - spreadB;
  };

  const sortedByStrike = [...candidates].sort((a, b) => a.strikePrice - b.strikePrice);

  if (cfg.strikeSelectionMode === 'delta_target') {
    const withDelta = sortedByStrike.filter(c => typeof c.delta === 'number');
    if (withDelta.length > 0) {
      const byDeltaDistance = withDelta.sort((a, b) => Math.abs(Math.abs(a.delta!) - cfg.targetDelta) - Math.abs(Math.abs(b.delta!) - cfg.targetDelta));
      // Take the 3 closest-delta candidates, then pick the tightest spread among them
      // rather than blindly taking the single closest-delta strike regardless of liquidity.
      return [...byDeltaDistance.slice(0, 3)].sort(bySpread)[0] ?? byDeltaDistance[0];
    }
    // no delta data available — fall through to ATM as the safest default
  }
  if (cfg.strikeSelectionMode === 'itm') {
    const itm = optType === 'call' ? sortedByStrike.filter(c => c.strikePrice < price) : sortedByStrike.filter(c => c.strikePrice > price);
    if (itm.length === 0) return null;
    const closest = optType === 'call' ? itm.slice(-3) : itm.slice(0, 3);
    return [...closest].sort(bySpread)[0] ?? (optType === 'call' ? itm[itm.length - 1] : itm[0]);
  }
  if (cfg.strikeSelectionMode === 'otm') {
    const otm = optType === 'call' ? sortedByStrike.filter(c => c.strikePrice > price) : sortedByStrike.filter(c => c.strikePrice < price);
    if (otm.length === 0) return null;
    const closest = optType === 'call' ? otm.slice(0, 3) : otm.slice(-3);
    return [...closest].sort(bySpread)[0] ?? (optType === 'call' ? otm[0] : otm[otm.length - 1]);
  }
  // atm (default/fallback)
  const nearAtm = [...sortedByStrike].sort((a, b) => Math.abs(a.strikePrice - price) - Math.abs(b.strikePrice - price)).slice(0, 3);
  return [...nearAtm].sort(bySpread)[0] ?? null;
}

// ── Sizing — base risk% sizing, then Brain Learning Mode lock / Kelly sizing /
// volatile-pair cap / loss-streak re-lock, mirroring the FX engine's gates. ──
// Real fractional-Kelly (via brainMultiplier, from options-brain.ts) can size
// DOWN as well as up — the previous formula only ever multiplied size up
// (1 + fraction), so a losing system still got bigger positions.
async function computeContractQuantity(
  userId: number, cfg: OptionsEngineConfig, equity: number, askPrice: number,
  signalScore: number | null = null, brainMultiplier: number | null = null, contractIv: number | null = null,
): Promise<{ quantity: number; reasoning: string }> {
  if (!askPrice || askPrice <= 0 || equity <= 0) return { quantity: 0, reasoning: '' };
  const contractCost = askPrice * 100; // options are quoted per-share; contract = 100 shares
  const riskAmount = equity * (cfg.riskPerTrade / 100);
  let baseQty = Math.max(0, Math.min(Math.floor(riskAmount / contractCost), cfg.maxContractsPerTrade));
  const notes: string[] = [];

  const stats = await storage.getOptionsEngineTradeStats(userId);

  // Volatile Cap — halve size on richly-priced premium (approximate IV proxy,
  // same caveat as the entry gate: raw IV, not a true historical IV-rank).
  if (cfg.volatileCapMode === 'risk_scaled' && typeof contractIv === 'number' && contractIv > 0.5 && baseQty > 1) {
    baseQty = Math.max(1, Math.floor(baseQty / 2));
    notes.push(`Volatile Cap: high IV (${(contractIv * 100).toFixed(0)}%) halved base size to ${baseQty}`);
  }

  const finalize = (qty: number, reason: string): { quantity: number; reasoning: string } => {
    // Loss-streak re-lock — applies on top of every other sizing path. The old
    // Kelly math never re-tightened after a drawdown; 3+ losses in a row now
    // force size back to 1 regardless of how it was otherwise computed.
    if (stats.lossStreak >= 3 && qty > 1) {
      const relocked = qty > 0 ? 1 : 0;
      return { quantity: relocked, reasoning: `${reason} ⚠️ Loss-streak re-lock: ${stats.lossStreak} losses in a row — capped to ${relocked} contract.` };
    }
    return { quantity: qty, reasoning: [reason, ...notes].filter(Boolean).join(' ') };
  };

  // High Confidence Override — a 90+ score signal bypasses the Brain Learning
  // lock, same exception the FX engine grants its R:R floor at 88%+ confidence.
  if (cfg.highConfidenceOverride && (signalScore ?? 0) >= 90) {
    const qty = brainMultiplier != null
      ? Math.max(0, Math.min(cfg.maxContractsPerTrade, Math.round(baseQty * brainMultiplier)))
      : baseQty;
    return finalize(qty, `⚡ High Confidence Override: ${signalScore}/100 score bypasses Brain Learning lock — ${qty} contracts.`);
  }

  if (cfg.brainLearningMode) {
    const brainLocked = stats.totalClosed < 10 || stats.winRate < 60;
    if (brainLocked) {
      const lockedQty = baseQty > 0 ? 1 : 0;
      return finalize(lockedQty, `🧠 Learning Mode: contracts locked at 1 (${stats.totalClosed}/10 trades, ${stats.winRate}%/60% WR) — full sizing unlocks automatically.`);
    }
    if (cfg.useKellyCriterion && brainMultiplier != null) {
      const kellyQty = Math.max(0, Math.min(cfg.maxContractsPerTrade, Math.round(baseQty * brainMultiplier)));
      return finalize(kellyQty, `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) + real Kelly sizing (${brainMultiplier.toFixed(2)}x): ${kellyQty} contracts.`);
    }
    return finalize(baseQty, `🧠 Brain unlocked (${stats.totalClosed} trades @ ${stats.winRate}% WR) — full risk sizing active.`);
  }

  if (cfg.useKellyCriterion && brainMultiplier != null) {
    const kellyQty = Math.max(0, Math.min(cfg.maxContractsPerTrade, Math.round(baseQty * brainMultiplier)));
    return finalize(kellyQty, `Kelly Criterion sizing (${brainMultiplier.toFixed(2)}x, ${stats.winRate}% WR over ${stats.totalClosed} trades): ${kellyQty} contracts.`);
  }

  return finalize(baseQty, '');
}

// Session high-watermark for Drawdown Shield, keyed by connectionId — resets
// on process restart, same "session" scope as the FX engine's shield (it is
// meant to react to intra-session equity swings, not survive indefinitely
// across restarts).
const sessionPeakEquity = new Map<number, number>();

async function checkSafetyGates(
  userId: number, cfg: OptionsEngineConfig, equity: number, connectionId: number, connectionType: string = 'alpaca',
): Promise<{ allowed: boolean; reason?: string; riskMultiplier: number }> {
  if (cfg.maxDailyTrades > 0) {
    const count = await storage.getTodayOptionsEngineTradeCount(userId, connectionId);
    if (count >= cfg.maxDailyTrades) return { allowed: false, reason: `max daily trades (${cfg.maxDailyTrades}) already reached`, riskMultiplier: 1 };
  }
  const openTrades = await storage.getOpenOptionsEngineTrades(userId, connectionId);
  if (openTrades.length >= cfg.maxOpenPositions) return { allowed: false, reason: `max open positions (${cfg.maxOpenPositions}) already reached`, riskMultiplier: 1 };

  let riskMultiplier = 1;

  if (equity > 0) {
    const todayPnl = await storage.getTodayOptionsEngineRealizedPnl(userId, connectionId);
    if (cfg.dailyLossLimit > 0 && todayPnl <= -(equity * cfg.dailyLossLimit / 100)) {
      return { allowed: false, reason: `daily loss limit (${cfg.dailyLossLimit}%) reached`, riskMultiplier: 1 };
    }

    // ── Per-connection prop-firm gate — a connection explicitly marked as a
    // prop-firm account uses ITS OWN challenge/funded rule set (independently
    // editable, see propFirmAccountState) instead of the engine-wide
    // cfg.propFirmMode fields below, and is backed by the same durable
    // consistency ledger (prop_firm_daily_pnl) the FX engine uses — so
    // multiple prop-firm accounts on this engine are tracked completely
    // independently rather than blended into one user-wide PnL figure.
    const propState = await storage.getPropFirmAccountState(connectionId, connectionType);
    if (propState) {
      const isFunded = propState.phase === 'funded';
      const activeDrawdownPct = isFunded ? propState.fundedDailyDrawdownPct : propState.challengeDailyDrawdownPct;
      const activeConsistencyEnabled = isFunded ? propState.fundedConsistencyEnabled : propState.challengeConsistencyEnabled;
      const activeConsistencyThreshold = isFunded ? propState.fundedConsistencyThresholdPct : propState.challengeConsistencyThresholdPct;

      if (activeDrawdownPct > 0 && todayPnl <= -(equity * activeDrawdownPct / 100)) {
        return { allowed: false, reason: `prop-firm ${propState.phase} daily drawdown limit (${activeDrawdownPct}%) reached`, riskMultiplier: 1 };
      }

      const { getConsistencyStatus } = await import('./prop-firm-consistency');
      const consistency = await getConsistencyStatus(connectionId, connectionType, activeConsistencyThreshold, activeConsistencyEnabled);
      if (consistency.hardBlocked) {
        return { allowed: false, reason: consistency.guidance, riskMultiplier: 1 };
      }
      riskMultiplier = Math.min(riskMultiplier, consistency.sizeMultiplier);
    } else if (cfg.propFirmMode && todayPnl <= -(equity * cfg.propFirmDailyDrawdownLimit / 100)) {
      return { allowed: false, reason: `prop-firm daily drawdown limit (${cfg.propFirmDailyDrawdownLimit}%) reached`, riskMultiplier: 1 };
    }

    if (cfg.dailyProfitTarget > 0 && todayPnl >= (equity * cfg.dailyProfitTarget / 100)) {
      return { allowed: false, reason: `daily profit target (${cfg.dailyProfitTarget}%) already reached — locking in gains`, riskMultiplier: 1 };
    }

    // ── Drawdown Shield — auto-tighten to conservative sizing once equity
    // pulls back from its session peak by more than the configured threshold.
    // Keyed per connection (not userId) so each account's own equity curve
    // is tracked independently once a user has more than one.
    const peak = Math.max(sessionPeakEquity.get(connectionId) ?? equity, equity);
    sessionPeakEquity.set(connectionId, peak);
    const ddFromPeakPct = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (ddFromPeakPct >= cfg.drawdownShieldThreshold) {
      riskMultiplier = Math.min(riskMultiplier, 0.25);
    }

    // ── Consistency enforcement (legacy, engine-wide) — reduce risk as the
    // prop-firm challenge period runs low on days remaining to hit the
    // min-profitable-days bar. Only runs for connections that AREN'T using
    // the new per-connection prop-firm state above, to avoid applying two
    // different consistency systems to the same account at once.
    if (!propState && cfg.consistencyEnforcementEnabled && cfg.propFirmMode) {
      const history = await storage.getOptionsEngineDailyPnlHistory(userId, cfg.consistencyPeriodDays, connectionId);
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

// ── Premium-selling: defined-risk vertical credit spread ─────────────────────
// Bullish signal → BULL PUT spread (sell a ~16Δ put, buy one width lower).
// Bearish signal → BEAR CALL spread (sell a ~16Δ call, buy one width higher).
// The short leg collects premium; the long leg caps the loss. We only sell when
// IV is elevated (premium is rich) and the credit is a worthwhile fraction of the
// width, size off the DEFINED max loss, and later buy back at 50% of the credit.
interface BuiltCreditSpread {
  spreadType: 'bull_put' | 'bear_call';
  optType: 'call' | 'put';
  shortLeg: AlpacaOptionContract;
  longLeg: AlpacaOptionContract;
  credit: number;        // net credit per spread (dollars/share)
  width: number;         // strike distance
  maxLoss: number;       // (width - credit) * 100, per spread
  creditPct: number;     // credit / width * 100
  dte: number;
  ivRank: number | null; // 0-100, or null when history is still building
}

async function buildCreditSpread(
  service: AlpacaService, underlyingSymbol: string, direction: 'up' | 'down', cfg: OptionsEngineConfig,
): Promise<{ spread: BuiltCreditSpread | null; reason: string }> {
  const spreadType: 'bull_put' | 'bear_call' = direction === 'up' ? 'bull_put' : 'bear_call';
  const optType: 'call' | 'put' = spreadType === 'bull_put' ? 'put' : 'call';
  const now = new Date();

  const chain = await service.getOptionsChain(underlyingSymbol);
  const inBand = chain.filter(c => {
    if (c.type !== optType) return false;
    const d = daysUntil(c.expirationDate, now);
    if (d < cfg.creditSpreadDteMin || d > cfg.creditSpreadDteMax) return false;
    if (typeof c.delta !== 'number' || typeof c.bid !== 'number' || typeof c.ask !== 'number') return false;
    if (c.bid <= 0 || c.ask <= 0) return false;
    if (typeof c.openInterest === 'number' && c.openInterest < cfg.minOpenInterest) return false;
    return true;
  });
  if (!inBand.length) return { spread: null, reason: `no ${optType}s with delta/quotes in the ${cfg.creditSpreadDteMin}-${cfg.creditSpreadDteMax} DTE band` };

  // Pick the single expiry closest to the target DTE, then work within it.
  const byExpiryDist = [...inBand].sort((a, b) =>
    Math.abs(daysUntil(a.expirationDate, now) - cfg.creditSpreadDte) - Math.abs(daysUntil(b.expirationDate, now) - cfg.creditSpreadDte));
  const targetExpiry = byExpiryDist[0].expirationDate;
  const sameExpiry = inBand.filter(c => c.expirationDate === targetExpiry);

  // Short leg: |delta| closest to the target (~0.16).
  const shortLeg = [...sameExpiry].sort((a, b) =>
    Math.abs(Math.abs(a.delta!) - cfg.creditSpreadShortDelta) - Math.abs(Math.abs(b.delta!) - cfg.creditSpreadShortDelta))[0];
  if (!shortLeg) return { spread: null, reason: 'could not resolve a short leg near target delta' };

  // ── IV gate — prefer true IV Rank, fall back to an absolute IV floor ───────
  // Snapshot today's ATM IV so IV Rank self-builds, then gate on where current
  // IV sits within this name's own 1-year range (rich premium = the time to
  // sell). Until ≥20 days of history exist, getIvRank returns null and we use
  // the absolute IV floor instead.
  const { recordDailyIv, getIvRank } = await import('./iv-rank');
  const atm = [...sameExpiry].sort((a, b) =>
    Math.abs(a.strikePrice - (byExpiryDist[0].strikePrice)) - Math.abs(b.strikePrice - (byExpiryDist[0].strikePrice)))[0];
  const atmIv = (typeof atm?.impliedVolatility === 'number' ? atm.impliedVolatility : shortLeg.impliedVolatility) ?? 0;
  if (atmIv > 0) await recordDailyIv(underlyingSymbol, atmIv).catch(() => {});
  let capturedIvRank: number | null = null;
  const shortIv = shortLeg.impliedVolatility;
  if (typeof shortIv === 'number' && shortIv > 0) {
    const { ivRank, samples } = await getIvRank(underlyingSymbol, shortIv).catch(() => ({ ivRank: null as number | null, samples: 0 }));
    capturedIvRank = ivRank;
    if (ivRank !== null) {
      if (ivRank < cfg.creditSpreadMinIvRank) {
        return { spread: null, reason: `IV Rank ${ivRank} below the ${cfg.creditSpreadMinIvRank} floor (${samples} days of history) — premium not rich enough vs this name's own range` };
      }
    } else if (shortIv < cfg.creditSpreadMinIv) {
      // Not enough IV history yet — fall back to the absolute IV floor.
      return { spread: null, reason: `IV ${(shortIv * 100).toFixed(0)}% below the ${(cfg.creditSpreadMinIv * 100).toFixed(0)}% floor (building IV-rank history: ${samples}/20 days)` };
    }
  }

  // Long (protective) leg: one width further OTM. Puts → lower strike; calls → higher.
  const targetLongStrike = spreadType === 'bull_put'
    ? shortLeg.strikePrice - cfg.creditSpreadWidthDollars
    : shortLeg.strikePrice + cfg.creditSpreadWidthDollars;
  const longLeg = [...sameExpiry].sort((a, b) =>
    Math.abs(a.strikePrice - targetLongStrike) - Math.abs(b.strikePrice - targetLongStrike))[0];
  if (!longLeg || longLeg.strikePrice === shortLeg.strikePrice) {
    return { spread: null, reason: 'no distinct protective long strike ~1 width OTM available' };
  }

  const width = Math.abs(shortLeg.strikePrice - longLeg.strikePrice);
  // Conservative credit: sell the short at its BID, buy the long at its ASK.
  const credit = Math.round((shortLeg.bid! - longLeg.ask!) * 100) / 100;
  if (credit <= 0) return { spread: null, reason: `spread would be a net debit (${credit}) — not a credit spread` };
  const creditPct = (credit / width) * 100;
  if (creditPct < cfg.creditSpreadMinCreditPct) {
    return { spread: null, reason: `credit $${credit.toFixed(2)} is only ${creditPct.toFixed(0)}% of the $${width} width (need ≥${cfg.creditSpreadMinCreditPct}%) — reward/risk too poor` };
  }
  const maxLoss = Math.round((width - credit) * 100 * 100) / 100;
  const dte = daysUntil(shortLeg.expirationDate, now);
  return { spread: { spreadType, optType, shortLeg, longLeg, credit, width, maxLoss, creditPct, dte, ivRank: capturedIvRank }, reason: '' };
}

async function executeCreditSpread(
  service: AlpacaService, connection: AlpacaConnection, userId: number, underlyingSymbol: string,
  result: StrategyResult, cfg: OptionsEngineConfig, account: { equity: number }, gate: { riskMultiplier: number },
): Promise<void> {
  const dir = result.direction!;
  const { spread, reason } = await buildCreditSpread(service, underlyingSymbol, dir, cfg).catch(err => ({ spread: null as BuiltCreditSpread | null, reason: err?.message || 'build error' }));
  if (!spread) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped', strategy: `${result.strategy}:credit_spread`,
      reasoning: `${underlyingSymbol}: credit-spread signal (${dir === 'up' ? 'bull put' : 'bear call'}) but ${reason}.`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  // Size off the DEFINED max loss (never full Kelly — options tails punish it).
  const equity = account.equity > 0 ? account.equity : cfg.accountBalance;
  const riskPct = (cfg.creditSpreadRiskPct / 100) * (gate.riskMultiplier < 1 ? gate.riskMultiplier : 1);
  const riskDollars = equity * riskPct;
  const quantity = Math.max(0, Math.floor(riskDollars / spread.maxLoss));
  if (quantity < 1) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped', strategy: `${result.strategy}:credit_spread`,
      reasoning: `${underlyingSymbol}: ${spread.spreadType} spread has max loss $${spread.maxLoss.toFixed(0)}/spread, but ${cfg.creditSpreadRiskPct}% of $${equity.toFixed(0)} ($${riskDollars.toFixed(0)}) doesn't cover even one.`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  // mleg open: sell short_to_open + buy long_to_open. Net limit is a CREDIT →
  // negative per Alpaca's signed convention.
  const legs: AlpacaMultiLegLeg[] = [
    { optionSymbol: spread.shortLeg.symbol, side: 'sell', ratioQty: 1, positionIntent: 'sell_to_open' },
    { optionSymbol: spread.longLeg.symbol, side: 'buy', ratioQty: 1, positionIntent: 'buy_to_open' },
  ];
  let order;
  try {
    order = await service.placeMultiLegOrder({ legs, quantity, netLimitPrice: -spread.credit, timeInForce: 'day' });
  } catch (err: any) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'error', strategy: `${result.strategy}:credit_spread`,
      reasoning: `${underlyingSymbol}: ${spread.spreadType} spread order failed (${spread.shortLeg.symbol} / ${spread.longLeg.symbol} x${quantity}): ${err.message}`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  await storage.createOptionsEngineTrade({
    userId, connectionId: connection.id, broker: 'alpaca',
    underlyingSymbol, optionSymbol: spread.shortLeg.symbol, strategy: `${result.strategy}:credit_spread`,
    optionType: spread.optType, quantity,
    entryPrice: spread.credit, entryOrderId: order.orderId, entryReasoning: result.reasoning, status: 'open',
    entryConfidence: result.score, dte: spread.dte, ivAtEntry: spread.shortLeg.impliedVolatility ?? null,
    underlyingPriceAtEntry: result.price, bidAskSpreadPct: null,
    spreadType: spread.spreadType, longLegSymbol: spread.longLeg.symbol,
    netCredit: spread.credit, maxLossPerSpread: spread.maxLoss,
  } as any);

  await storage.createOptionsEngineActivity({
    userId, symbol: underlyingSymbol, decision: 'signal', strategy: `${result.strategy}:credit_spread`,
    reasoning: `${underlyingSymbol}: EXECUTED ${spread.spreadType.replace('_', ' ')} x${quantity} — sold ${spread.shortLeg.strikePrice}${spread.optType[0].toUpperCase()} / bought ${spread.longLeg.strikePrice}${spread.optType[0].toUpperCase()} exp ${spread.shortLeg.expirationDate} (${spread.dte} DTE). Net credit $${spread.credit.toFixed(2)} on $${spread.width} width (${spread.creditPct.toFixed(0)}% of width), max loss $${spread.maxLoss.toFixed(0)}/spread. Short IV ${((spread.shortLeg.impliedVolatility ?? 0) * 100).toFixed(0)}%${spread.ivRank !== null ? ` (IV Rank ${spread.ivRank})` : ' (IV-rank history building)'}, ~${(Math.abs(spread.shortLeg.delta ?? 0) * 100).toFixed(0)}Δ. Target: buy back at ${cfg.creditSpreadProfitTakePct}% of credit. ${result.reasoning}`,
    score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
  });
}

async function executeSignal(
  service: AlpacaService, connection: AlpacaConnection, userId: number, underlyingSymbol: string,
  result: StrategyResult, cfg: OptionsEngineConfig, brainMultiplier: number | null, bestStrategies: string[],
): Promise<void> {
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
  const gate = await checkSafetyGates(userId, cfg, gateEquity, connection.id, 'alpaca');
  if (!gate.allowed) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped',
      reasoning: `${underlyingSymbol}: signal confirmed (${result.strategy}), but execution blocked — ${gate.reason}.`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca', strategy: result.strategy,
    });
    return;
  }

  // Drawdown Shield strengthening — previously the shield only shrank size
  // (below), which still let the SAME low-confidence setups fire smaller.
  // Mirrors the FX engine's shield: while active, additionally demand 80%+
  // confidence and restrict to the brain's own best-performing strategies
  // for this symbol (once enough trade history exists to trust that list).
  if (gate.riskMultiplier < 1) {
    if ((result.score ?? 0) < 80) {
      await storage.createOptionsEngineActivity({
        userId, symbol: underlyingSymbol, decision: 'skipped', strategy: result.strategy,
        reasoning: `${underlyingSymbol}: Drawdown Shield active — only 80%+ confidence setups allowed during drawdown (this signal: ${result.score}/100).`,
        score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
      });
      return;
    }
    if (bestStrategies.length > 0 && !bestStrategies.includes(result.strategy)) {
      await storage.createOptionsEngineActivity({
        userId, symbol: underlyingSymbol, decision: 'skipped', strategy: result.strategy,
        reasoning: `${underlyingSymbol}: Drawdown Shield active — only this symbol's best-performing strategies (${bestStrategies.join(', ')}) are allowed during drawdown ("${result.strategy}" isn't one of them).`,
        score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
      });
      return;
    }
  }

  // ── Premium-selling mode: sell a defined-risk credit spread instead of ─────
  // buying a single long option. The proven options edge is short premium.
  if (cfg.creditSpreadEnabled || cfg.strategyMode === 'credit_spread') {
    await executeCreditSpread(service, connection, userId, underlyingSymbol, result, cfg, account, gate);
    return;
  }

  const contract = await resolveContract(service, underlyingSymbol, result.direction, cfg).catch(() => null);
  if (!contract || !contract.ask) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped', strategy: result.strategy,
      reasoning: `${underlyingSymbol}: signal confirmed, but no matching option contract cleared the liquidity/spread filter for expiry preference "${cfg.expiryPreference}" / strike mode "${cfg.strikeSelectionMode}" within ${cfg.minDaysToExpiry}-${cfg.maxDaysToExpiry} days to expiry (max spread ${cfg.maxSpreadPct}%, min OI ${cfg.minOpenInterest}).`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  const dte = daysUntil(contract.expirationDate, new Date());
  // Theta-safety gate — HARD floor, not confidence-gated. The old gate keyed off
  // (score < minConfidence+15), but the order_flow/composite scores saturate at
  // ~100, so it never fired and 0-1 DTE long calls flooded in. This account's own
  // results are unambiguous: 1-DTE won just 29% for -$4,195, and the entire
  // 2026-08-10→18 drawdown (-$26k) was 1-DTE NVDA calls stopping out, while the
  // 2-7 DTE band won 74% for +$42,278. Long premium at 0-1 DTE is pure theta
  // decay + gap risk. Block it outright unless the user has EXPLICITLY chosen a
  // 0DTE expiry preference (then they own that risk deliberately).
  const minSafeDte = cfg.expiryPreference === '0dte' ? 0 : 2;
  if (dte < minSafeDte) {
    await storage.createOptionsEngineActivity({
      userId, symbol: underlyingSymbol, decision: 'skipped', strategy: result.strategy,
      reasoning: `${underlyingSymbol}: signal confirmed, but the resolved contract is ${dte}-DTE — below the ${minSafeDte}-DTE theta-safety floor for long premium (0-1 DTE won only 29% / -$4.2k historically; the 2-7 DTE band won 74%). Set expiry preference to "0dte" to override.`,
      score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent, source: 'alpaca',
    });
    return;
  }

  // Drawdown Shield / consistency-rule risk reduction applies as a multiplier
  // on the configured risk% before sizing — never on the base cfg object.
  const sizingCfg = gate.riskMultiplier < 1 ? { ...cfg, riskPerTrade: cfg.riskPerTrade * gate.riskMultiplier } : cfg;
  const { quantity, reasoning: sizingReasoningRaw } = await computeContractQuantity(
    userId, sizingCfg, account.equity, contract.ask, result.score, brainMultiplier, contract.impliedVolatility ?? null,
  );
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

  // Marketable limit at the mid (or ask if no bid is quoted) instead of a bare
  // market order — on options a market order pays the full spread, and this
  // engine trades short-dated/liquid-filtered contracts where that spread is
  // still real money. A limit at mid fills almost as fast as market on a
  // liquid contract but caps the worst-case slippage.
  const entryMid = contract.bid ? Math.round(((contract.bid + contract.ask) / 2) * 100) / 100 : contract.ask;
  const entrySpreadPct = contract.bid ? ((contract.ask - contract.bid) / entryMid) * 100 : 0;

  let order;
  try {
    order = await service.placeOrder({ optionSymbol: contract.symbol, side: 'buy', quantity, type: 'limit', limitPrice: entryMid, timeInForce: 'day' });
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
    entryPrice: entryMid, entryOrderId: order.orderId, entryReasoning: result.reasoning, status: 'open',
    entryConfidence: result.score, dte, ivAtEntry: contract.impliedVolatility ?? null,
    underlyingPriceAtEntry: result.price, bidAskSpreadPct: entrySpreadPct,
  } as any);

  await storage.createOptionsEngineActivity({
    userId, symbol: underlyingSymbol, decision: 'signal', strategy: result.strategy,
    reasoning: `${underlyingSymbol}: EXECUTED — bought ${quantity}x ${contract.symbol} (${contract.type}, strike $${contract.strikePrice}, exp ${contract.expirationDate}, ${dte} DTE) @ ~$${entryMid.toFixed(2)}/contract (limit, mid of $${contract.bid?.toFixed(2) ?? '?'}/$${contract.ask.toFixed(2)}). ${result.reasoning}${sizingReasoning ? ` ${sizingReasoning}` : ''}`,
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
// Manage one open credit spread: re-quote both legs, compute the net cost to
// buy it back, and close at the profit target (50% of credit), the stop (cost
// ≥ Nx credit), or near expiry (assignment/pin guard). Closes via a single
// buy-to-close mleg order so both legs exit together.
async function manageCreditSpread(service: AlpacaService, userId: number, cfg: OptionsEngineConfig, connectionId: number, trade: any): Promise<void> {
  const shortSym: string = trade.optionSymbol;
  const longSym: string = trade.longLegSymbol;
  const credit: number = trade.netCredit ?? trade.entryPrice;
  const qty: number = trade.quantity;

  const [sq, lq] = await Promise.all([
    service.getOptionQuote(shortSym).catch(() => null),
    service.getOptionQuote(longSym).catch(() => null),
  ]);

  // Reconcile expired/settled spreads (broker stops quoting after expiry).
  if (!sq || !lq || sq.ask <= 0) {
    const { expirationDate } = parseOccSymbol(shortSym, trade.underlyingSymbol);
    const isPastExpiry = new Date(expirationDate + 'T21:00:00Z').getTime() < Date.now();
    if (isPastExpiry) {
      const live = await service.getPositions().catch(() => [] as any[]);
      const stillOpen = live.some(p => p.symbol === shortSym || p.symbol === longSym);
      if (!stillOpen) {
        await storage.markOptionsEngineTradeFailed(trade.id, `credit spread expired ${expirationDate} — settled by broker; realized P&L not tracked here, check the Alpaca statement`);
      }
    }
    return;
  }

  // Net cost to buy the spread back now (pay short's ask, sell long's bid).
  const closeCost = Math.round((sq.ask - lq.bid) * 100) / 100;
  const closeMid = Math.round(((sq.mid - lq.mid)) * 100) / 100;
  const capturedPct = credit > 0 ? ((credit - closeCost) / credit) * 100 : 0;

  const dte = daysUntil(parseOccSymbol(shortSym, trade.underlyingSymbol).expirationDate, new Date());
  let exitReason: string | null = null;
  if (closeCost <= credit * (1 - cfg.creditSpreadProfitTakePct / 100)) exitReason = 'profit_target';
  else if (closeCost >= credit * cfg.creditSpreadStopMultiple) exitReason = 'stop_loss';
  else if (dte <= 1) exitReason = 'expiry_close'; // don't carry short options into expiry (assignment/pin risk)
  if (!exitReason) return;

  // Buy-to-close mleg: buy back the short, sell the long. Net DEBIT → positive limit.
  const legs: AlpacaMultiLegLeg[] = [
    { optionSymbol: shortSym, side: 'buy', ratioQty: 1, positionIntent: 'buy_to_close' },
    { optionSymbol: longSym, side: 'sell', ratioQty: 1, positionIntent: 'sell_to_close' },
  ];
  let closeOrder;
  try {
    closeOrder = await service.placeMultiLegOrder({ legs, quantity: qty, netLimitPrice: Math.max(0.01, closeCost), timeInForce: 'day' });
  } catch (err: any) {
    await storage.createOptionsEngineActivity({
      userId, symbol: trade.underlyingSymbol, decision: 'error', strategy: trade.strategy,
      reasoning: `${trade.underlyingSymbol}: failed to close ${trade.spreadType} spread (${shortSym}/${longSym}): ${err.message}`,
      score: null, price: null, dailyChangePercent: null, source: 'alpaca',
    });
    return;
  }

  // Realized P&L = (credit received − debit paid to close) × 100 × spreads. Use
  // the mid as the fill estimate (limit is placed at the ask-based cost).
  const closeFill = closeMid > 0 ? closeMid : closeCost;
  const realizedPnl = Math.round((credit - closeFill) * 100 * qty * 100) / 100;
  await storage.closeOptionsEngineTrade(trade.id, { exitPrice: closeFill, exitOrderId: closeOrder.orderId, exitReason, realizedPnl });
  try {
    const { recordRealizedPnl } = await import('./prop-firm-consistency');
    await recordRealizedPnl(userId, connectionId, 'alpaca', realizedPnl);
  } catch { /* non-critical */ }
  await storage.createOptionsEngineActivity({
    userId, symbol: trade.underlyingSymbol, decision: 'signal', strategy: trade.strategy,
    reasoning: `${trade.underlyingSymbol}: CLOSED ${trade.spreadType} x${qty} @ net $${closeFill.toFixed(2)} debit (captured ${capturedPct.toFixed(0)}% of the $${credit.toFixed(2)} credit, ${exitReason.replace('_', ' ')}). Realized P&L: $${realizedPnl.toFixed(2)}.`,
    score: null, price: null, dailyChangePercent: null, source: 'alpaca',
  });
  try {
    const { db } = await import('../db');
    const { optionsBrainOutcomes } = await import('../../shared/schema');
    const entered = trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now();
    await db.insert(optionsBrainOutcomes).values({
      userId, underlyingSymbol: trade.underlyingSymbol, optionType: trade.optionType,
      strategy: trade.strategy, direction: trade.spreadType === 'bull_put' ? 'bullish' : 'bearish',
      entryConfidence: trade.entryConfidence ?? null, returnPct: capturedPct,
      hourUtc: new Date().getUTCHours(), holdingMinutes: Math.max(0, Math.round((Date.now() - entered) / 60000)),
      exitReason, result: realizedPnl > 0 ? 'WIN' : realizedPnl < 0 ? 'LOSS' : 'BREAKEVEN',
      profitLoss: realizedPnl, contracts: qty, source: 'live', closedAt: new Date(),
    } as any);
  } catch { /* non-critical */ }
}

async function monitorOpenPositions(service: AlpacaService, userId: number, cfg: OptionsEngineConfig, connectionId: number): Promise<void> {
  // Scoped to THIS connection — previously every connection beyond the first
  // was monitored/closed using whichever Alpaca session happened to be
  // "the" one for the whole user, which would fail (or worse, misroute an
  // order) once a user had more than one Alpaca account connected.
  const openTrades = await storage.getOpenOptionsEngineTrades(userId, connectionId);
  const alpacaTrades = openTrades.filter(t => t.broker === 'alpaca');
  for (const trade of alpacaTrades) {
    try {
      // Credit spreads are managed as a net two-leg position (buy back at 50% of
      // credit / stop at the credit-multiple), not as a single long option.
      if ((trade as any).spreadType && (trade as any).longLegSymbol) {
        await manageCreditSpread(service, userId, cfg, connectionId, trade);
        continue;
      }

      const quote = await service.getOptionQuote(trade.optionSymbol);
      if (!quote || quote.mid <= 0) {
        // Quote lookups fail permanently once a contract expires (the broker
        // stops quoting it) — this previously left the trade 'open' forever
        // with zero visibility, still counting against maxOpenPositions and
        // daily-loss accounting. Reconcile against the contract's own
        // expiration date (parsed from its OCC symbol): if it's past expiry
        // and the broker no longer lists it as a live position, it settled
        // (expired worthless or was exercised/assigned) — mark it failed/closed
        // out rather than let it rot. Real P&L isn't fabricated here (we have
        // no fill data for the settlement) — check the broker statement.
        const { expirationDate } = parseOccSymbol(trade.optionSymbol, trade.underlyingSymbol);
        const isPastExpiry = new Date(expirationDate + 'T21:00:00Z').getTime() < Date.now();
        if (isPastExpiry) {
          const livePositions = await service.getPositions();
          const stillOpenAtBroker = livePositions.some(p => p.symbol === trade.optionSymbol);
          if (!stillOpenAtBroker) {
            await storage.markOptionsEngineTradeFailed(trade.id, `expired ${expirationDate} — settled by broker (worthless or exercised/assigned), real P&L not tracked here; check the Alpaca account statement`);
            await storage.createOptionsEngineActivity({
              userId, symbol: trade.underlyingSymbol, decision: 'error', strategy: trade.strategy,
              reasoning: `${trade.underlyingSymbol}: ${trade.optionSymbol} expired ${expirationDate} and no longer appears in the broker's open positions — closed out of tracking. P&L wasn't captured by this reconciliation; check the Alpaca account statement for the actual settlement amount.`,
              score: null, price: null, dailyChangePercent: null, source: 'alpaca',
            });
          }
        }
        continue;
      }

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

      // Limit at the current bid (not market) — a sell limit at bid is
      // immediately marketable against the best bid in a liquid market (fills
      // about as fast as a market order would) while capping the worst-case
      // slippage if the quote is stale or the book is thin, unlike a bare
      // market order which accepts whatever fill the exchange gives it.
      const exitLimitPrice = quote.bid > 0 ? quote.bid : quote.mid;
      const closeOrder = await service.placeOrder({ optionSymbol: trade.optionSymbol, side: 'sell', quantity: trade.quantity, type: 'limit', limitPrice: exitLimitPrice, timeInForce: 'day' });
      const realizedPnl = (quote.mid - trade.entryPrice) * 100 * trade.quantity;
      await storage.closeOptionsEngineTrade(trade.id, { exitPrice: quote.mid, exitOrderId: closeOrder.orderId, exitReason, realizedPnl });
      // Feed the shared prop-firm consistency ledger unconditionally — cheap
      // no-op for accounts that aren't marked prop-firm (nothing reads
      // prop_firm_daily_pnl unless getPropFirmAccountState finds a row for
      // this connection), but means the moment an account IS marked, its
      // drawdown/consistency math is already backed by real history instead
      // of needing a backfill.
      try {
        const { recordRealizedPnl } = await import('./prop-firm-consistency');
        await recordRealizedPnl(userId, connectionId, 'alpaca', realizedPnl);
      } catch { /* non-critical */ }
      await storage.createOptionsEngineActivity({
        userId, symbol: trade.underlyingSymbol, decision: 'signal', strategy: trade.strategy,
        reasoning: `${trade.underlyingSymbol}: CLOSED ${trade.optionSymbol} x${trade.quantity} @ ~$${quote.mid.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}% of premium, ${exitReason.replace('_', ' ')}). Realized P&L: $${realizedPnl.toFixed(2)}.`,
        score: null, price: quote.mid, dailyChangePercent: null, source: 'alpaca',
      });

      // Record the close into the brain feature store (durable per-trade context,
      // correlated with win/loss) and let the brain absorb it — mirrors the
      // Kalshi engine's _finalizeKalshiClose. Non-critical: never block the close.
      try {
        const { db } = await import('../db');
        const { optionsBrainOutcomes } = await import('../../shared/schema');
        const entered = trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now();
        await db.insert(optionsBrainOutcomes).values({
          userId,
          underlyingSymbol: trade.underlyingSymbol,
          optionType: trade.optionType,
          strategy: trade.strategy,
          direction: trade.optionType === 'call' ? 'bullish' : 'bearish',
          entryConfidence: trade.entryConfidence ?? null,
          returnPct: pnlPercent,
          hourUtc: new Date().getUTCHours(),
          holdingMinutes: Math.max(0, Math.round((Date.now() - entered) / 60000)),
          exitReason,
          result: realizedPnl > 0 ? 'WIN' : realizedPnl < 0 ? 'LOSS' : 'BREAKEVEN',
          profitLoss: realizedPnl,
          contracts: trade.quantity,
          source: 'live',
        });
        const { runOptionsBrainLearning } = await import('./options-brain');
        await runOptionsBrainLearning(userId).catch(() => {});
      } catch (e: any) {
        console.error('[options-scanner] brain outcome record failed (non-critical):', e?.message ?? e);
      }
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
  const activeConns = alpacaConns.filter(c => c.isActive);
  if (activeConns.length === 0) {
    await storage.createOptionsEngineActivity({
      userId, symbol: '—', decision: 'error',
      reasoning: 'No active Alpaca connection — market data requires at least one connected Alpaca account. TastyTrade/Crypto.com orders can still execute, but symbol scanning needs Alpaca for now.',
      score: null, price: null, dailyChangePercent: null, source: 'none', strategy: null,
    });
    return;
  }

  // Market data (symbol scanning) is account-agnostic — build one service off
  // the first active connection for that, rather than repeating identical
  // scans per connection. Execution and position monitoring, below, use each
  // connection's OWN service so multiple prop-firm/personal accounts each
  // trade under their own credentials and risk gates — previously every
  // connection beyond the first silently reused this same session, which
  // would monitor/close/size trades against the wrong Alpaca account.
  const primaryConn = activeConns[0];
  let service: AlpacaService;
  try {
    const secret = decryptApiSecret(primaryConn.encryptedApiSecret);
    service = new AlpacaService(primaryConn.accountType as 'paper' | 'live', primaryConn.apiKeyId, secret);
  } catch (err: any) {
    await storage.createOptionsEngineActivity({
      userId, symbol: '—', decision: 'error',
      reasoning: `Could not decrypt Alpaca credentials: ${err.message}`,
      score: null, price: null, dailyChangePercent: null, source: 'alpaca', strategy: null,
    });
    return;
  }

  const connServices = new Map<number, AlpacaService>();
  connServices.set(primaryConn.id, service);
  for (const conn of activeConns) {
    if (connServices.has(conn.id)) continue;
    try {
      const secret = decryptApiSecret(conn.encryptedApiSecret);
      connServices.set(conn.id, new AlpacaService(conn.accountType as 'paper' | 'live', conn.apiKeyId, secret));
    } catch (err: any) {
      await storage.createOptionsEngineActivity({
        userId, symbol: '—', decision: 'error',
        reasoning: `Could not decrypt credentials for Alpaca connection "${conn.propFirmName || conn.accountId || conn.id}": ${err.message}`,
        score: null, price: null, dailyChangePercent: null, source: 'alpaca', strategy: null,
      });
    }
  }

  // Exit management runs every cycle regardless of new signals — closing a
  // winning/losing position takes priority over opening a new one. Runs once
  // per connection, using that connection's own service.
  for (const conn of activeConns) {
    const connSvc = connServices.get(conn.id);
    if (!connSvc) continue;
    await monitorOpenPositions(connSvc, userId, config, conn.id).catch((e: any) =>
      console.error(`[options-scanner] monitorOpenPositions failed for user ${userId} connection ${conn.id}:`, e.message)
    );
  }

  // Trading-days-of-week gate — skip the whole scan on days the user hasn't opted into.
  const todayDow = new Date().getUTCDay();
  const allowedDows: number[] = Array.isArray(config.tradingDaysOfWeek) ? config.tradingDaysOfWeek : [1, 2, 3, 4, 5];
  if (!allowedDows.includes(todayDow)) return;

  const symbolDaySchedule: Record<string, number[]> = (config.symbolDaySchedule as any) || {};
  const symbolDirectionOverrides: Record<string, string> = (config.symbolDirectionOverrides as any) || {};
  const symbolContractOverrides: Record<string, number> = (config.symbolContractOverrides as any) || {};

  // Load the Options Brain once per scan cycle — previously computed but
  // never consumed here, so the "self-learning" brain never actually
  // influenced a single trade decision (only displayed in the UI).
  const brain = await getOrRefreshOptionsBrain(userId).catch(() => null);

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

      let result = await scanSymbol(service, symbol, symbolCfg);

      // Brain-informed strategy/direction gating — the whole point of a
      // "self-learning brain" is that a strategy or direction with a
      // demonstrated losing record on THIS symbol should get harder to fire,
      // not just recorded for the dashboard. Applied only once enough trade
      // history exists to trust the numbers (min sample sizes below).
      const symbolKnowledge = brain?.contractKnowledge?.[symbol];
      if (result.decision === 'signal' && symbolKnowledge) {
        const stratStats = symbolKnowledge.strategyWinRates?.[result.strategy];
        if (stratStats && stratStats.total >= 5 && stratStats.winRate < 45) {
          result = {
            ...result, decision: 'skipped',
            reasoning: `${symbol}: ${result.reasoning} — BLOCKED by brain: "${result.strategy}" has only a ${stratStats.winRate}% win rate on ${symbol} over ${stratStats.total} trades.`,
          };
        } else if (
          symbolKnowledge.preferredDirection !== 'both' && symbolKnowledge.totalTrades >= 5 &&
          ((symbolKnowledge.preferredDirection === 'call' && result.direction === 'down') ||
           (symbolKnowledge.preferredDirection === 'put' && result.direction === 'up')) &&
          (result.score ?? 0) < symbolCfg.minConfidence + 15
        ) {
          result = {
            ...result, decision: 'watching',
            reasoning: `${symbol}: ${result.reasoning} — brain shows a strong ${symbolKnowledge.preferredDirection.toUpperCase()} bias on ${symbol}; this counter-bias signal needs ${symbolCfg.minConfidence + 15}%+ confidence (has ${result.score}/100).`,
          };
        }
      }

      await storage.createOptionsEngineActivity({
        userId, symbol, decision: result.decision, reasoning: result.reasoning,
        score: result.score, price: result.price, dailyChangePercent: result.dailyChangePercent,
        source: 'alpaca', strategy: result.strategy,
      });
      // Auto-execution requires BOTH the engine's executionSource to allow
      // Alpaca AND each connection's own autoExecute switch — checked here
      // per connection so e.g. a personal account can stay paused while a
      // prop-firm challenge account keeps trading the same signal.
      const executingConns = activeConns.filter(c =>
        c.autoExecute && (config.executionSource === 'alpaca' || config.executionSource === 'auto') && connServices.has(c.id)
      );
      if (result.decision === 'signal' && executingConns.length > 0) {
        // Consensus (AI second opinion) is a judgment on the SIGNAL itself,
        // not on any one account — check it once per symbol, then execute
        // independently on every qualifying connection.
        const tradeAllowed = await assembleOptionsConsensus(userId, symbol, result, symbolCfg).catch((e: any) => {
          console.error(`[options-scanner] consensus check failed for ${symbol}:`, e.message);
          // Fail CLOSED — a broken consensus check (e.g. the AI call erroring)
          // must not silently let an unconfirmed trade through. Previously
          // this returned true, meaning any consensus failure defaulted to
          // executing the trade anyway.
          return false;
        });
        if (tradeAllowed) {
          // Only trust the brain's real fractional-Kelly multiplier once there's
          // enough history to calibrate it; otherwise sizing falls back to the
          // warm-up/ad-hoc paths already inside computeContractQuantity.
          const brainMultiplier = symbolKnowledge && symbolKnowledge.totalTrades >= 10 ? symbolKnowledge.recommendedContractMultiplier : null;
          const bestStrategies = symbolKnowledge?.bestStrategies ?? [];
          for (const conn of executingConns) {
            const connSvc = connServices.get(conn.id)!;
            await executeSignal(connSvc, conn, userId, symbol, result, symbolCfg, brainMultiplier, bestStrategies).catch((e: any) =>
              console.error(`[options-scanner] executeSignal failed for ${symbol} on connection ${conn.id}:`, e.message)
            );
          }
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
