// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp WATCH PLANS (2026-11-23, Chris's direction: give the
// perpetuals the FX watch-plan treatment — PR #108 — because their entries
// were purely mechanical and the accuracy showed it).
//
// The rhythm, mirroring ai-watch-plans.ts:
//   1. DEEP STUDY → PLAN. When a user+ticker+strategy has no live plan,
//      ONE deep AI analysis — fed the SAME lane aggregates the PR #105
//      judge weighs (ticker history + last-10 closes, strategy record +
//      14d form, bucket-brain evidence, funding / volume profile / HTF /
//      earnings context) — writes a validated watch plan that SHARPENS
//      one of the lane's existing strategies. A plan is never a new
//      signal source: the strategy's own mechanical signal must still
//      fire, exactly as today.
//   2. FREE WATCHING. The lane's existing entry cycle evaluates plan
//      triggers deterministically against the H1 bars it already fetched
//      (the FX trigger evaluator, reused) — zero AI purchases.
//   3. ENTRY RULE. With plans ON, a shadow entry opens only when the
//      mechanical signal fired AND a live plan for that ticker+strategy
//      has TRIGGERED. Every existing gate (earnings blackout, bucket
//      brain avoid, improvement throttle, VP veto, caps, cooldown) runs
//      first, unchanged and in its existing order. Signals without a
//      triggered plan are skipped and counted (planSkips) — the design,
//      not a failure. The PR #105 judge still scores every opened entry
//      exactly as today; its verdict never gates.
//   4. RE-PLAN only on events (expiry / invalidation / structure break)
//      plus a per-ticker+strategy deep cooldown (≥30 min) and a small
//      per-cycle deep-call cap, so a wide rotation can never burst the
//      pool.
//
// BUDGET FENCE (PR #109): deep studies buy through the shared pool's
// PROTECTED lane — gated by engineAiBudgetAllows(userId,'protected') and
// metered manually exactly once at 2 units (the deep-reasoning
// convention), via a client built WITHOUT engine marking so the failover
// wrapper cannot meter a second time. When the pool is dry, no study is
// bought; the lane opens nothing new that cycle beyond what already-
// triggered plans allow.
//
// FAIL-SAFE: any plan-layer failure (store, provider, bad JSON, corrupt
// stored plan) degrades to TODAY'S mechanical entries for that cycle —
// the lane never halts and this module never throws into it. That
// failure-fallback is counted (fallbacks) and is distinct from the
// intentional no-plan skip (planSkips).
//
// VALIDATION: strict schema + geometry + price sanity on write AND read.
// Geometry is the lane's own: the plan's implied stop distance must sit
// inside the lane's stop band (1.5×H1 ATR clamped 0.8–4%) and its target
// must sit at ≈2R — the plan sketches levels consistent with the exits
// the lane will actually run, it does not invent its own. Price sanity
// is ±25% of the current price (the PR #96 lesson). Corrupt plans are
// deleted, never trusted.
//
// PERSISTENCE: runtime_state scope 'kalshi_perp_watch_plans', one blob
// per user ({ plans: {ticker|strategy: plan}, lastDeepAt: {...} }),
// mirroring ai-watch-plans.ts; the in-process cache is authoritative.
//
// SHADOW LANE ONLY: kalshi-perp-live.ts never imports this module.
//
// Kill switch: KALSHI_PERP_WATCH_PLANS=off → the lane never calls this
// module and behaves exactly as today.
// ─────────────────────────────────────────────────────────────────────────────

import { getUniversalAIClientForUser, getUserModelPreference } from '../openai';
import { engineAiBudgetAllows, engineAiBudgetError, meterEngineAiConfirmation } from './ai-engine-budget';
import { getRuntimeStateStrict, ensureRuntimeStateTable } from './runtime-state';
import { pool } from '../db';
import {
  evaluateWatchPlan, describeTrigger, WATCH_PLAN_TRIGGER_TYPES,
  type WatchPlan, type WatchPlanTriggerType, type PlanCandle,
} from './ai-watch-plans';
import type {
  JudgeTickerHistory, JudgeStrategyRecord, JudgeBucketEvidence,
} from './kalshi-perp-ai-judge';

export const kalshiPerpWatchPlansEnabled = () => process.env.KALSHI_PERP_WATCH_PLANS !== 'off';

/** Minimum minutes between two DEEP studies for the same ticker+strategy. */
export const perpWatchPlanCooldownMs = () => {
  const n = Number(process.env.KALSHI_PERP_WATCH_PLAN_COOLDOWN_MIN ?? 30);
  return (Number.isFinite(n) && n >= 30 ? n : 30) * 60_000;
};

/** Per-cycle deep-call cap: one entry cycle may commission at most this
 *  many studies across the whole rotation, so a wide universe waking up
 *  at once can never burst the pool. */
export const PERP_PLAN_MAX_DEEP_PER_CYCLE = 3;
export const perpPlanMaxDeepPerCycle = () => {
  const n = Number(process.env.KALSHI_PERP_WATCH_PLAN_MAX_DEEP_PER_CYCLE ?? PERP_PLAN_MAX_DEEP_PER_CYCLE);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : PERP_PLAN_MAX_DEEP_PER_CYCLE;
};

export const perpWatchPlanTimeoutMs = () => {
  const n = Number(process.env.KALSHI_PERP_WATCH_PLAN_TIMEOUT_MS ?? 45_000);
  return Number.isFinite(n) && n >= 5_000 ? n : 45_000;
};

export const PERP_PLAN_MIN_EXPIRY_MS = 1 * 3_600_000;
export const PERP_PLAN_MAX_EXPIRY_MS = 48 * 3_600_000;
/** Price-sanity bound (PR #96 lesson): every plan price within ±25% of
 *  the current price. */
export const PERP_PLAN_PRICE_SANITY_PCT = 0.25;
/** The lane's exit geometry (kalshi-stock-shadow.ts): stop = 1.5×H1 ATR
 *  clamped into [0.8%, 4%]; target = 2R. A plan's levels must be
 *  consistent with these — validated, not invented. */
export const PERP_PLAN_STOP_MIN_PCT = 0.8;
export const PERP_PLAN_STOP_MAX_PCT = 4;
export const PERP_PLAN_TARGET_R = 2;

// ── Schema ──────────────────────────────────────────────────────────────────

export type PerpPlanDirection = 'long' | 'short';
export type { WatchPlanTriggerType as PerpPlanTriggerType };
export const PERP_PLAN_TRIGGER_TYPES = WATCH_PLAN_TRIGGER_TYPES;

export interface PerpWatchPlan {
  v: 1;
  id: string;
  userId: number;
  ticker: string;
  underlying: string;
  /** One of the lane's existing strategy keys — the plan sharpens this
   *  strategy; it is not a new signal source. */
  strategy: string;
  direction: PerpPlanDirection;
  pattern: string;
  entryZone: { low: number; high: number };
  trigger: { type: WatchPlanTriggerType; level: number };
  stopLoss: number;
  takeProfit: number;
  invalidation: number;
  confidence: number;
  rationale: string;
  createdAt: number;
  expiresAt: number;
  status: 'watching' | 'triggered';
  triggeredAt?: number;
  modelUsed?: string | null;
}

export const perpPlanKey = (ticker: string, strategy: string) => `${ticker}|${strategy}`;

const isPos = (n: any): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** Implied stop distance of a plan, as % of the entry-zone midpoint. */
export function perpPlanStopPct(p: { entryZone: { low: number; high: number }; stopLoss: number }): number {
  const mid = (p.entryZone.low + p.entryZone.high) / 2;
  return mid > 0 ? (Math.abs(mid - p.stopLoss) / mid) * 100 : NaN;
}

/** Implied reward:risk of a plan (target distance ÷ stop distance). */
export function perpPlanRMultiple(p: { entryZone: { low: number; high: number }; stopLoss: number; takeProfit: number }): number {
  const mid = (p.entryZone.low + p.entryZone.high) / 2;
  const risk = Math.abs(mid - p.stopLoss);
  return risk > 0 ? Math.abs(p.takeProfit - mid) / risk : NaN;
}

/** Strict validation — write AND read. ctx.strategyKeys, when given, is
 *  the lane's live strategy-key set: a plan for an unknown strategy is
 *  not a plan. Geometry must match the lane's exit geometry (stop inside
 *  [0.8%, 4%], target within [1.8R, 2.2R] of the 2R sketch). */
export function validatePerpWatchPlan(
  raw: any,
  ctx: { ticker: string; currentPrice: number; strategyKeys?: ReadonlySet<string> | string[] },
): PerpWatchPlan | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as PerpWatchPlan;
    if (p.v !== 1) return null;
    if (typeof p.id !== 'string' || !p.id) return null;
    if (!Number.isFinite(p.userId)) return null;
    if (p.ticker !== ctx.ticker) return null;
    if (typeof p.underlying !== 'string' || !p.underlying) return null;
    if (typeof p.strategy !== 'string' || !p.strategy) return null;
    if (ctx.strategyKeys) {
      const keys = ctx.strategyKeys instanceof Set ? ctx.strategyKeys : new Set(ctx.strategyKeys);
      if (!keys.has(p.strategy)) return null;
    }
    if (p.direction !== 'long' && p.direction !== 'short') return null;
    if (typeof p.pattern !== 'string' || p.pattern.trim().length < 1 || p.pattern.length > 80) return null;
    if (!p.entryZone || !isPos(p.entryZone.low) || !isPos(p.entryZone.high) || p.entryZone.low > p.entryZone.high) return null;
    if (!p.trigger || !WATCH_PLAN_TRIGGER_TYPES.includes(p.trigger.type) || !isPos(p.trigger.level)) return null;
    if (!isPos(p.stopLoss) || !isPos(p.takeProfit) || !isPos(p.invalidation)) return null;
    if (!Number.isFinite(p.createdAt) || !Number.isFinite(p.expiresAt)) return null;
    const life = p.expiresAt - p.createdAt;
    if (life < PERP_PLAN_MIN_EXPIRY_MS - 60_000 || life > PERP_PLAN_MAX_EXPIRY_MS + 60_000) return null;
    if (p.status !== 'watching' && p.status !== 'triggered') return null;
    const px = ctx.currentPrice;
    if (!isPos(px)) return null;
    const band = (v: number) => Math.abs(v - px) / px <= PERP_PLAN_PRICE_SANITY_PCT;
    if (![p.entryZone.low, p.entryZone.high, p.trigger.level, p.stopLoss, p.takeProfit, p.invalidation].every(band)) return null;
    const long = p.direction === 'long';
    if (long) {
      if (!(p.stopLoss < p.entryZone.low)) return null;
      if (!(p.invalidation < p.entryZone.low)) return null;
      if (!(p.takeProfit > p.entryZone.high)) return null;
    } else {
      if (!(p.stopLoss > p.entryZone.high)) return null;
      if (!(p.invalidation > p.entryZone.high)) return null;
      if (!(p.takeProfit < p.entryZone.low)) return null;
    }
    // Lane exit geometry: stop distance inside the lane's clamp band,
    // target at the lane's 2R (±10%).
    const stopPct = perpPlanStopPct(p);
    if (!Number.isFinite(stopPct) || stopPct < PERP_PLAN_STOP_MIN_PCT || stopPct > PERP_PLAN_STOP_MAX_PCT) return null;
    const rMult = perpPlanRMultiple(p);
    if (!Number.isFinite(rMult) || rMult < PERP_PLAN_TARGET_R * 0.9 || rMult > PERP_PLAN_TARGET_R * 1.1) return null;
    if (typeof p.confidence !== 'number' || !Number.isFinite(p.confidence)) return null;
    return {
      ...p,
      confidence: Math.min(100, Math.max(0, p.confidence)),
      rationale: typeof p.rationale === 'string' ? p.rationale.slice(0, 400) : '',
    };
  } catch {
    return null;
  }
}

// ── Trigger evaluation (FX evaluator, adapted) ─────────────────────────────
// The deterministic trigger rules are the FX ones (ai-watch-plans.ts
// evaluateWatchPlan) — same candle semantics, newest-first. This wrapper
// only translates the lane's long/short vocabulary to the evaluator's
// BUY/SELL and back.

function toFxPlan(p: PerpWatchPlan): WatchPlan {
  return {
    v: 1, id: p.id, userId: p.userId, symbol: p.ticker, timeframe: 'H1',
    direction: p.direction === 'long' ? 'BUY' : 'SELL',
    pattern: p.pattern, entryZone: p.entryZone, trigger: p.trigger,
    stopLoss: p.stopLoss, takeProfit: p.takeProfit, invalidation: p.invalidation,
    confidence: p.confidence, rationale: p.rationale,
    createdAt: p.createdAt, expiresAt: p.expiresAt,
    status: p.status, triggeredAt: p.triggeredAt, modelUsed: p.modelUsed,
  };
}

export type PerpPlanEvaluation = 'watching' | 'triggered' | 'invalidated' | 'structure_break' | 'expired';

/** Evaluate a plan against H1 candles, NEWEST FIRST (the FX convention). */
export function evaluatePerpWatchPlan(plan: PerpWatchPlan, candlesNewestFirst: PlanCandle[], now: number): PerpPlanEvaluation {
  return evaluateWatchPlan(toFxPlan(plan), candlesNewestFirst, now);
}

export function describePerpTrigger(plan: PerpWatchPlan): string {
  return describeTrigger(toFxPlan(plan));
}

// ── Deep-study prompt + parse ───────────────────────────────────────────────

export interface PerpDeepStudyInput {
  userId: number;
  ticker: string;
  underlying: string;
  strategy: string;
  /** The mechanical signal that makes this candidate interesting now. */
  signalDirection: 'long' | 'short';
  signalScore?: number | null;
  entryPrice: number;
  /** The lane's own stop for this ticker right now (slPct, %) — the
   *  study's sketch must stay consistent with the lane's geometry. */
  slPct: number;
  atrPct?: number | null;
  fundingRate?: number | null;
  h1Trend?: string | null;
  h4Trend?: string | null;
  vpPosition?: string | null;
  earningsWithin48h?: boolean | null;
  /** Last H1 closes, oldest → newest (compact pattern summary). */
  recentCloses?: number[];
  tickerHistory?: JudgeTickerHistory | null;
  strategyRecord?: JudgeStrategyRecord | null;
  bucketEvidence?: JudgeBucketEvidence[] | null;
}

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  return Math.abs(n) >= 100 ? n.toFixed(2) : Math.abs(n) >= 1 ? n.toFixed(4) : n.toFixed(5);
};
const fmtRec = (s: { n: number; winRate: number | null; avgR: number | null; medianNetPct: number | null } | null | undefined): string => {
  if (!s || !s.n) return 'no closed trades yet';
  const wr = s.winRate != null ? `${Math.round(s.winRate * 100)}% WR` : 'WR n/a';
  const avgR = s.avgR != null ? `avg ${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R` : 'avg R n/a';
  const med = s.medianNetPct != null ? `median net ${s.medianNetPct >= 0 ? '+' : ''}${s.medianNetPct.toFixed(2)}%` : 'median n/a';
  return `${s.n} trades, ${wr}, ${avgR}, ${med}`;
};

/** The deep-study prompt: the judge's evidence set (aggregates only),
 *  pointed at writing ONE plan instead of one verdict. Lean by the same
 *  discipline as the judge's — check-pinned size cap. Pure. */
export function buildPerpWatchPlanPrompt(input: PerpDeepStudyInput): { system: string; user: string } {
  const system =
    'You are the senior analyst for a stock perpetual-futures SHADOW trading lane. A mechanical strategy has flagged this ticker, ' +
    'but mechanical entries alone have produced poor accuracy. Your job is NOT to call a trade for this instant. Study the evidence ' +
    'and write ONE WATCH PLAN for the named strategy: the single highest-quality pattern worth waiting for on this ticker, the exact ' +
    'candle that confirms entry when it forms, and the price that proves the idea wrong. The engine will watch your plan for free on ' +
    'hourly candles and only open when your trigger forms AND the strategy\'s own signal agrees. A precise, patient plan beats an ' +
    'eager one; if the evidence says this ticker+strategy pairing is a proven loser or nothing is worth watching, say so with noPlan — ' +
    'a steward does not invent setups. Respond ONLY with JSON in one of these two shapes:\n' +
    '{"plan": {"direction": "long"|"short", "pattern": string, "entryZoneLow": number, "entryZoneHigh": number, ' +
    '"triggerType": "engulfing"|"pin_bar"|"close_beyond_level"|"retest_level"|"inside_bar_break", "triggerLevel": number, ' +
    '"stopLoss": number, "takeProfit": number, "invalidation": number, "expiryMinutes": number (60 to 2880), ' +
    '"confidence": number (0 to 100), "rationale": "one or two short lines"}}\n' +
    '{"noPlan": true, "reason": "one short line"}\n' +
    'Geometry rules (the lane\'s exits are fixed and your sketch must match them): for long, stopLoss and invalidation are BELOW the ' +
    'entry zone and takeProfit is ABOVE it (mirror for short). The stop distance from the zone midpoint must be between 0.8% and 4% ' +
    'of price, and the target must sit at about 2x the stop distance (2R). triggerLevel is the level the trigger candle must close ' +
    'past or hold. Anchor your stop near the lane stop given below.';
  const closes = (input.recentCloses || []).filter((n) => Number.isFinite(n)).slice(-12);
  let pattern: string | null = null;
  if (closes.length >= 2) {
    const first = closes[0], lastC = closes[closes.length - 1];
    const movePct = first > 0 ? ((lastC - first) / first) * 100 : 0;
    let ups = 0;
    for (let i = 1; i < closes.length; i++) if (closes[i] > closes[i - 1]) ups++;
    pattern = `Recent H1 closes (oldest to newest): ${closes.join(', ')} — net ${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}% over the window, ${ups} of ${closes.length - 1} hourly moves up`;
  }
  const hist = input.tickerHistory;
  const recentLines = (hist?.recent || []).slice(0, 10).map((r) =>
    `${r.strategy} ${r.direction} ${r.netPct >= 0 ? '+' : ''}${r.netPct.toFixed(2)}%${r.rMultiple != null ? ` (${r.rMultiple >= 0 ? '+' : ''}${r.rMultiple.toFixed(1)}R)` : ''}`);
  const rec = input.strategyRecord;
  const formLine = rec && (rec.last14d || rec.prior14d)
    ? `Strategy recent form: last 14d ${fmtRec(rec.last14d)} vs prior 14d ${fmtRec(rec.prior14d)}`
    : null;
  const evidenceLines = (input.bucketEvidence || []).slice(0, 8).map((b) =>
    `${b.dim}=${b.bucket}: ${b.verdict} (n=${b.n}, median net ${b.medianNet >= 0 ? '+' : ''}${b.medianNet.toFixed(2)}%)`);
  const user = [
    `STUDY: ${input.strategy} on ${input.underlying} (${input.ticker}) — the strategy's mechanical signal just fired ${input.signalDirection.toUpperCase()}${input.signalScore != null ? ` (score ${input.signalScore})` : ''}`,
    `Current price ≈ ${fmt(input.entryPrice)} · lane stop for this ticker right now: ${input.slPct.toFixed(2)}% (1.5x H1 ATR, clamped 0.8–4%) · ATR ${input.atrPct != null ? `${input.atrPct.toFixed(2)}%` : 'n/a'} · H1 trend ${input.h1Trend ?? 'n/a'}, H4 trend ${input.h4Trend ?? 'n/a'} · funding ${input.fundingRate == null ? 'n/a' : input.fundingRate} · volume-profile position ${input.vpPosition ?? 'n/a'} · earnings within 48h: ${input.earningsWithin48h == null ? 'unknown' : input.earningsWithin48h ? 'YES' : 'no'}`,
    `TICKER HISTORY (${input.underlying} in this lane): ${fmtRec(hist?.summary)}`,
    recentLines.length ? `Last closes on ${input.underlying} (newest first): ${recentLines.join('; ')}` : null,
    `STRATEGY RECORD (${input.strategy} overall): ${fmtRec(rec?.overall)}`,
    formLine,
    `BUCKET EVIDENCE (the lane's record on setups like this): ${evidenceLines.length ? '' : 'no bucket has enough history yet'}`,
    ...evidenceLines.map((l) => `  ${l}`),
    pattern,
    `Write the watch plan for ${input.strategy} on ${input.underlying} now — or answer noPlan if the evidence says wait for a different day.`,
  ].filter(Boolean).join('\n');
  return { system, user };
}

export type ParsedPerpDeepStudy =
  | { kind: 'plan'; fields: Record<string, any> }
  | { kind: 'no_plan'; reason: string }
  | null;

/** Parse the study's reply (same salvage discipline as the FX parser). Pure. */
export function parsePerpWatchPlanResponse(content: string): ParsedPerpDeepStudy {
  if (!content) return null;
  let parsed: any;
  try { parsed = JSON.parse(content); } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
  }
  if (parsed?.noPlan === true) {
    return { kind: 'no_plan', reason: String(parsed.reason || 'no setup worth watching').slice(0, 200) };
  }
  const f = parsed?.plan;
  if (!f || typeof f !== 'object') return null;
  return { kind: 'plan', fields: f };
}

/** Turn parsed fields into a stamped plan and validate it. Requested
 *  expiry is CLAMPED into the lane's 1h–48h band; every other field must
 *  pass strict validation or the plan is discarded. Pure. */
export function perpPlanFromFields(
  fields: Record<string, any>,
  ctx: { userId: number; ticker: string; underlying: string; strategy: string; currentPrice: number; now: number; id: string; modelUsed?: string | null; strategyKeys?: ReadonlySet<string> | string[] },
): PerpWatchPlan | null {
  let confidence = Number(fields.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  if (confidence > 0 && confidence <= 1) confidence *= 100;
  const expiryMinRaw = Number(fields.expiryMinutes);
  const expiryMin = Number.isFinite(expiryMinRaw)
    ? Math.min(PERP_PLAN_MAX_EXPIRY_MS / 60_000, Math.max(PERP_PLAN_MIN_EXPIRY_MS / 60_000, expiryMinRaw))
    : 720;
  const dirRaw = String(fields.direction || '').toLowerCase();
  const candidate: PerpWatchPlan = {
    v: 1,
    id: ctx.id,
    userId: ctx.userId,
    ticker: ctx.ticker,
    underlying: ctx.underlying,
    strategy: ctx.strategy,
    direction: dirRaw === 'short' || dirRaw === 'sell' ? 'short' : 'long',
    pattern: String(fields.pattern || '').slice(0, 80),
    entryZone: { low: Number(fields.entryZoneLow), high: Number(fields.entryZoneHigh) },
    trigger: {
      type: String(fields.triggerType || '') as WatchPlanTriggerType,
      level: Number(fields.triggerLevel),
    },
    stopLoss: Number(fields.stopLoss),
    takeProfit: Number(fields.takeProfit),
    invalidation: Number(fields.invalidation),
    confidence,
    rationale: String(fields.rationale || '').slice(0, 400),
    createdAt: ctx.now,
    expiresAt: ctx.now + expiryMin * 60_000,
    status: 'watching',
    modelUsed: ctx.modelUsed ?? null,
  };
  if (candidate.entryZone.low > candidate.entryZone.high) {
    const t = candidate.entryZone.low;
    candidate.entryZone.low = candidate.entryZone.high;
    candidate.entryZone.high = t;
  }
  return validatePerpWatchPlan(candidate, { ticker: ctx.ticker, currentPrice: ctx.currentPrice, strategyKeys: ctx.strategyKeys });
}

// ── Counters (per user, per UTC day — the report's evidence base) ──────────

export interface PerpWatchPlanCounters {
  created: number; triggered: number; expired: number; invalidated: number;
  structureBreaks: number; deepCalls: number; planSkips: number;
  fallbacks: number; entriesViaPlan: number;
}
const emptyCounters = (): PerpWatchPlanCounters => ({
  created: 0, triggered: 0, expired: 0, invalidated: 0, structureBreaks: 0,
  deepCalls: 0, planSkips: 0, fallbacks: 0, entriesViaPlan: 0,
});
interface PerpCounterDay { day: string; c: PerpWatchPlanCounters }
const countersByUser = new Map<number, PerpCounterDay>();
const utcDay = () => new Date().toISOString().slice(0, 10);
function currentCounters(userId: number): PerpWatchPlanCounters {
  const day = utcDay();
  let s = countersByUser.get(userId);
  if (!s || s.day !== day) {
    s = { day, c: emptyCounters() };
    countersByUser.set(userId, s);
  }
  return s.c;
}

/** Called by the lane after an entry actually opened under a triggered
 *  plan, so the report can separate plan-driven entries from fallback
 *  (mechanical) ones. */
export function notePerpPlanEntry(userId: number): void {
  currentCounters(userId).entriesViaPlan += 1;
}

/** Today's counters for one user (report payload). */
export function perpWatchPlanCountersToday(userId: number): PerpWatchPlanCounters {
  const s = countersByUser.get(userId);
  return s && s.day === utcDay() ? { ...s.c } : emptyCounters();
}

// ── Store (runtime_state blob per user + in-process cache) ─────────────────

export interface PerpWatchPlanBlob { plans: Record<string, PerpWatchPlan>; lastDeepAt: Record<string, number> }

export interface PerpWatchPlanStore {
  load(userId: number): Promise<PerpWatchPlanBlob | null>;
  save(userId: number, blob: PerpWatchPlanBlob): Promise<void>;
}

const defaultStore: PerpWatchPlanStore = {
  async load(userId: number) {
    const saved: any = await getRuntimeStateStrict('kalshi_perp_watch_plans', String(userId));
    if (!saved || typeof saved !== 'object') return null;
    return {
      plans: saved.plans && typeof saved.plans === 'object' ? saved.plans : {},
      lastDeepAt: saved.lastDeepAt && typeof saved.lastDeepAt === 'object' ? saved.lastDeepAt : {},
    };
  },
  async save(userId: number, blob: PerpWatchPlanBlob) {
    await ensureRuntimeStateTable();
    await pool.query(
      `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      ['kalshi_perp_watch_plans', String(userId), JSON.stringify(blob)],
    );
  },
};

let store: PerpWatchPlanStore = defaultStore;
/** Check-script seam: substitute an in-memory (or throwing) store. */
export function __setPerpWatchPlanStoreForCheck(s: PerpWatchPlanStore | null): void {
  store = s ?? defaultStore;
  cache.clear();
  loadStarted.clear();
}

const cache = new Map<number, PerpWatchPlanBlob>();
const loadStarted = new Set<number>();

async function getBlob(userId: number): Promise<PerpWatchPlanBlob> {
  const hit = cache.get(userId);
  if (hit) return hit;
  loadStarted.add(userId);
  const loaded = await store.load(userId); // may throw → caller falls back
  const blob: PerpWatchPlanBlob = loaded ?? { plans: {}, lastDeepAt: {} };
  cache.set(userId, blob);
  return blob;
}

async function persist(userId: number, blob: PerpWatchPlanBlob): Promise<void> {
  try { await store.save(userId, blob); } catch { /* in-process cache stays authoritative; next mutation retries */ }
}

/** Live (unexpired) plans currently held for a user — report payload. */
export function countActivePerpPlans(userId: number, now = Date.now()): number {
  const blob = cache.get(userId);
  if (!blob) return 0;
  let n = 0;
  for (const p of Object.values(blob.plans)) if (p && p.expiresAt > now) n += 1;
  return n;
}

// ── Deep call ───────────────────────────────────────────────────────────────

export interface PerpWatchPlanDeps {
  callDeep?: (input: PerpDeepStudyInput) => Promise<{ content: string; model: string | null }>;
  now?: () => number;
  /** The lane's live strategy-key set, for plan validation. */
  strategyKeys?: ReadonlySet<string> | string[];
}

/** Per-cycle deep-call budget, created by the lane once per entry cycle
 *  and shared across every candidate in it. */
export interface PerpPlanCycle { deepUsed: number; deepCap: number }
export function newPerpPlanCycle(): PerpPlanCycle {
  return { deepUsed: 0, deepCap: perpPlanMaxDeepPerCycle() };
}

/**
 * The deep study itself, against an already-built client (exported so
 * the check suite can drive it with a fake client and observe the shared
 * pool's counters). Budget gate first — PROTECTED lane (PR #109): when
 * the pool cannot serve protected calls it throws the 402-shaped budget
 * error and the resolver treats that as "no study this cycle", never a
 * lane failure. On an ANSWERED call the pool is metered EXACTLY ONCE at
 * 2 units (deep-reasoning convention). The client is deliberately built
 * WITHOUT engine marking: metering here is manual (like the FX watch
 * plans), so a study can never be double-counted by the failover wrapper.
 */
export async function runPerpDeepStudy(input: PerpDeepStudyInput, client: any): Promise<{ content: string; model: string | null }> {
  if (!(await engineAiBudgetAllows(input.userId, 'protected'))) {
    throw engineAiBudgetError();
  }
  const { system, user } = buildPerpWatchPlanPrompt(input);
  const modelId = client.defaultModel || getUserModelPreference(input.userId) || 'gpt-4o-mini';
  const call = client.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
  });
  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error(`perp watch-plan study timed out after ${perpWatchPlanTimeoutMs()}ms`)), perpWatchPlanTimeoutMs());
    (t as any).unref?.();
  });
  const resp: any = await Promise.race([call, timeout]);
  const content = String(resp?.choices?.[0]?.message?.content || '');
  if (!content) throw new Error('perp watch-plan study returned an empty reply');
  // The call was ANSWERED — meter it exactly once, at the deep rate,
  // against the protected lane it was gated on.
  meterEngineAiConfirmation(input.userId, 2, 'protected');
  return { content, model: resp?.model || modelId };
}

async function realDeepCall(input: PerpDeepStudyInput): Promise<{ content: string; model: string | null }> {
  const client: any = await getUniversalAIClientForUser(input.userId);
  return runPerpDeepStudy(input, client);
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export type PerpWatchPlanAction =
  /** A live plan has TRIGGERED for this ticker+strategy — entry may
   *  proceed through the lane's normal insert (judge still scores). */
  | { action: 'triggered'; plan: PerpWatchPlan }
  /** No triggered plan — the signal is skipped BY DESIGN (counted). */
  | { action: 'skip'; plan: PerpWatchPlan | null }
  /** Plan-layer FAILURE — the lane falls back to today's mechanical
   *  entry for this candidate (counted, distinct from 'skip'). */
  | { action: 'fallback' };

export interface PerpWatchPlanResolveInput extends PerpDeepStudyInput {
  /** H1 candles for trigger evaluation, NEWEST FIRST. */
  candlesNewestFirst: PlanCandle[];
  currentPrice: number;
}

/**
 * Resolve the plan layer for one candidate whose mechanical signal has
 * fired and which has passed every existing gate. NEVER throws.
 *  - existing plan, triggered (now or earlier) → 'triggered'
 *  - existing plan, still watching → 'skip' (planSkips++)
 *  - existing plan, expired/invalidated/broken → retired (counted);
 *    the candidate may commission a fresh study (cooldown + cycle cap
 *    permitting) whose plan, if born triggered, returns 'triggered',
 *    otherwise 'skip'
 *  - no plan → same study path as above
 *  - budget dry / provider failure / bad JSON / invalid plan → 'skip'
 *    when the layer functioned (nothing bought or nothing usable is a
 *    stewardship outcome), 'fallback' only on plan-layer ERRORS (store
 *    throw, unexpected exception) — the lane then enters mechanically.
 */
export async function resolvePerpWatchPlan(
  input: PerpWatchPlanResolveInput,
  cycle: PerpPlanCycle,
  deps: PerpWatchPlanDeps = {},
): Promise<PerpWatchPlanAction> {
  const now = (deps.now ?? Date.now)();
  const userId = input.userId;
  const key = perpPlanKey(input.ticker, input.strategy);
  const counters = currentCounters(userId);
  try {
    const blob = await getBlob(userId);
    let plan: PerpWatchPlan | null = null;
    const stored = blob.plans[key];
    if (stored) {
      plan = validatePerpWatchPlan(stored, { ticker: input.ticker, currentPrice: input.currentPrice, strategyKeys: deps.strategyKeys });
      if (!plan) delete blob.plans[key];
    }

    if (plan) {
      const ev = evaluatePerpWatchPlan(plan, input.candlesNewestFirst, now);
      if (ev === 'expired' || ev === 'invalidated' || ev === 'structure_break') {
        delete blob.plans[key];
        await persist(userId, blob);
        if (ev === 'expired') counters.expired += 1;
        else if (ev === 'invalidated') counters.invalidated += 1;
        else counters.structureBreaks += 1;
        plan = null; // fall through to the re-plan branch below
      } else if (ev === 'triggered') {
        if (plan.status !== 'triggered') {
          plan.status = 'triggered';
          plan.triggeredAt = now;
          blob.plans[key] = plan;
          await persist(userId, blob);
          counters.triggered += 1;
        }
        return { action: 'triggered', plan };
      } else {
        counters.planSkips += 1;
        return { action: 'skip', plan };
      }
    }

    // No live plan → maybe commission a study (cooldown + cycle cap).
    const lastDeep = Number(blob.lastDeepAt[key] || 0);
    if (now - lastDeep < perpWatchPlanCooldownMs() || cycle.deepUsed >= cycle.deepCap) {
      counters.planSkips += 1;
      return { action: 'skip', plan: null };
    }

    const callDeep = deps.callDeep ?? realDeepCall;
    let study: { content: string; model: string | null };
    try {
      study = await callDeep(input);
    } catch (e: any) {
      // Budget-dry is a stewardship outcome (skip quietly); a provider
      // error also buys nothing usable — both are 'skip', NOT the
      // failure-fallback: the layer worked, there is simply no plan.
      const isBudget = e?.budgetBlocked === true || e?.aiErrorStatus === 'budget' || Number(e?.status ?? e?.statusCode) === 402;
      if (!isBudget) console.warn(`[kalshi-perp-watch-plans] study failed for ${input.ticker}/${input.strategy}: ${String(e?.message || e).slice(0, 140)}`);
      counters.planSkips += 1;
      return { action: 'skip', plan: null };
    }
    cycle.deepUsed += 1;
    counters.deepCalls += 1;
    blob.lastDeepAt[key] = now; // a bought call starts the cooldown, whatever it answered
    await persist(userId, blob);

    const parsed = parsePerpWatchPlanResponse(study.content);
    if (!parsed || parsed.kind === 'no_plan') {
      counters.planSkips += 1;
      return { action: 'skip', plan: null };
    }
    const created = perpPlanFromFields(parsed.fields, {
      userId, ticker: input.ticker, underlying: input.underlying, strategy: input.strategy,
      currentPrice: input.currentPrice, now,
      id: `kpw_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      modelUsed: study.model,
      strategyKeys: deps.strategyKeys,
    });
    if (!created) {
      counters.planSkips += 1;
      return { action: 'skip', plan: null };
    }
    blob.plans[key] = created;
    await persist(userId, blob);
    counters.created += 1;

    const ev0 = evaluatePerpWatchPlan(created, input.candlesNewestFirst, now);
    if (ev0 === 'triggered') {
      created.status = 'triggered';
      created.triggeredAt = now;
      blob.plans[key] = created;
      await persist(userId, blob);
      counters.triggered += 1;
      return { action: 'triggered', plan: created };
    }
    if (ev0 === 'invalidated' || ev0 === 'structure_break') {
      delete blob.plans[key];
      await persist(userId, blob);
      if (ev0 === 'invalidated') counters.invalidated += 1;
      else counters.structureBreaks += 1;
      counters.planSkips += 1;
      return { action: 'skip', plan: null };
    }
    counters.planSkips += 1;
    return { action: 'skip', plan: created };
  } catch {
    // Plan-layer failure (store unreachable, unexpected throw): degrade
    // to today's mechanical entries for this candidate — never halt.
    try { currentCounters(userId).fallbacks += 1; } catch { /* counters are best-effort */ }
    return { action: 'fallback' };
  }
}

/** Platform view for the shadow report: today's counters + live plans. */
export function kalshiPerpWatchPlansSummary(userId: number): PerpWatchPlanCounters & { enabled: boolean; activePlans: number } {
  return {
    enabled: kalshiPerpWatchPlansEnabled(),
    activePlans: countActivePerpPlans(userId),
    ...perpWatchPlanCountersToday(userId),
  };
}

/** Check-script seam: wipe in-process state between scenarios. */
export function __resetPerpWatchPlansForCheck(): void {
  cache.clear();
  loadStarted.clear();
  countersByUser.clear();
}
