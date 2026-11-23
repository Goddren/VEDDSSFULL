// ─────────────────────────────────────────────────────────────────────────────
// AI WATCH PLANS (2026-11-23, Chris's design, in his words: scans should be
// based on what the AI is seeing — "it need it to already know the pattern
// it's watching, the candle type it's looking for to enter"; the AI may
// spend MORE tokens on deep analysis when the picture warrants it; and it
// must be "a great steward of ai credits and reasoning in trade for
// stewarding trading account to the highest of importance").
//
// WHAT THIS REPLACES: on the live FX path (POST /api/mt5/chart-data) the
// engine used to buy an AI confirmation per candidate setup on a 60-second
// scan rhythm — thousands of calls, most spent re-asking about setups that
// had not changed. The plan rhythm instead:
//   1. DEEP ANALYSIS → WATCH PLAN. When a pair has no live plan, ONE deep
//      analysis (rich prompt — depth is allowed) produces a structured
//      plan: the named pattern being watched, direction, entry zone, a
//      DETERMINISTIC trigger (candle type + close vs level), SL/TP sketch
//      from structure, invalidation, and a bounded expiry (15 min – 8 h).
//   2. FREE WATCHING. While a plan is live and untriggered, chart-data
//      posts evaluate the trigger deterministically against the posted
//      candles — zero AI purchases — and the route answers with the same
//      no-trade shape it already produces when AI is skipped (signal
//      neutralised → mt5ExecuteTrade:false, mt5AiDecision:'OFF').
//   3. TRIGGER → ONE CONFIRMATION. When the trigger fires, the post falls
//      through to the EXISTING confirmation + decision path untouched:
//      the route buys its one confirmation under the PR #101/#103/#107
//      rules (budget gate, verdict cache, gray-zone, cheap first pass) and
//      every guard runs exactly as today. A plan NEVER places a trade.
//   4. RE-PLAN only on events: expiry, invalidation, or a hard structure
//      break (defined below), plus a per-pair deep-analysis cooldown
//      (default 15 min) so plan churn can never drain the pool. A plan
//      that has triggered stays in 'triggered' state — its posts keep
//      falling through to the normal path — until it expires or is
//      invalidated; that is v1's "triggered-and-resolved" retirement.
//
// STEWARDSHIP: deep calls happen per pair per plan lifetime (bounded by
// the cooldown: at most 4/hour/pair worst case, realistically 1–3 per
// session), watching is free, and trigger confirmations are the same
// single purchases the old rhythm made — but only at the moment the
// watched-for candle actually forms. The account side is stewarded by
// construction: plans carry invalidation + SL/TP up front, every guard
// still stands between a trigger and an order, and a plan whose levels
// fail validation is discarded, never trusted.
//
// FAIL-SAFE: every plan-layer failure (store unreachable, deep call
// fails, bad JSON, corrupt stored plan) ABSTAINS — the post proceeds
// through today's per-setup path exactly as if the layer did not exist.
// The one intentional exception is a live untriggered plan answering
// "watching": that is the design, not a failure.
//
// PERSISTENCE: runtime_state scope 'ai_watch_plans', one blob per user
// ({ plans: {SYMBOL: plan}, lastDeepAt: {SYMBOL: ms} }). The in-process
// cache is authoritative for this process (the only one serving
// chart-data); the blob is the restart-recovery layer, mirroring
// ai-engine-budget.ts. Plans are validated on write AND on read.
//
// METERING: the deep call is part of the chart-data route's flow, so —
// exactly like that route's confirmations — it is gated by
// engineAiBudgetAllows and metered MANUALLY via
// meterEngineAiConfirmation(userId, 2) (deep-reasoning convention),
// exactly once per ANSWERED call, and the client is built WITHOUT engine
// marking so the failover client cannot meter it a second time. Failed
// calls are not metered (they are not billed — budget-module convention).
//
// Kill switch: AI_WATCH_PLANS=off → the route never calls this module.
// ─────────────────────────────────────────────────────────────────────────────

import { getUniversalAIClientForUser, getUserModelPreference } from '../openai';
import { engineAiBudgetAllows, engineAiBudgetError, meterEngineAiConfirmation } from './ai-engine-budget';
import { getRuntimeStateStrict, ensureRuntimeStateTable } from './runtime-state';
import { pool } from '../db';

export const watchPlansEnabled = () => process.env.AI_WATCH_PLANS !== 'off';

/** Minimum minutes between two DEEP analyses for the same pair. */
export const watchPlanCooldownMs = () => {
  const n = Number(process.env.AI_WATCH_PLAN_COOLDOWN_MIN ?? 15);
  return (Number.isFinite(n) && n >= 1 ? n : 15) * 60_000;
};

/** Hard cap on one deep analysis so a slow provider cannot stall a post. */
export const watchPlanTimeoutMs = () => {
  const n = Number(process.env.AI_WATCH_PLAN_TIMEOUT_MS ?? 45_000);
  return Number.isFinite(n) && n >= 5_000 ? n : 45_000;
};

export const PLAN_MIN_EXPIRY_MS = 15 * 60_000;
export const PLAN_MAX_EXPIRY_MS = 8 * 3_600_000;
/** Price-sanity bound: every plan price must sit within ±25% of the
 *  current price. FX/index/gold/crypto moves inside a plan's ≤8h life are
 *  far smaller; the bound exists to catch corrupt prints (the PR #96
 *  lesson: one bad print at 9.24e14 poisoned a whole lane's stats). */
export const PLAN_PRICE_SANITY_PCT = 0.25;

// ── Schema ──────────────────────────────────────────────────────────────────

export type WatchPlanDirection = 'BUY' | 'SELL';
export type WatchPlanTriggerType =
  | 'engulfing'          // engulfing candle in plan direction, closing past the level
  | 'pin_bar'            // pin bar (wick rejection) in plan direction at the level
  | 'close_beyond_level' // a candle CLOSES across the level (BOS / range break)
  | 'retest_level'       // price broke away from the level, came back, and held it
  | 'inside_bar_break';  // inside bar breaks its mother bar in plan direction

export const WATCH_PLAN_TRIGGER_TYPES: WatchPlanTriggerType[] = [
  'engulfing', 'pin_bar', 'close_beyond_level', 'retest_level', 'inside_bar_break',
];

export interface WatchPlan {
  v: 1;
  id: string;
  userId: number;
  symbol: string;
  timeframe: string;
  direction: WatchPlanDirection;
  /** Named pattern being watched (AI's label, e.g. 'BOS + FVG entry'). */
  pattern: string;
  entryZone: { low: number; high: number };
  trigger: { type: WatchPlanTriggerType; level: number };
  stopLoss: number;
  takeProfit: number;
  /** Price that kills the plan before entry (at or beyond the stop side). */
  invalidation: number;
  /** AI's confidence in the plan itself, 0–100. */
  confidence: number;
  rationale: string;
  createdAt: number;
  expiresAt: number;
  status: 'watching' | 'triggered';
  triggeredAt?: number;
  modelUsed?: string | null;
}

export type PlanEvaluation = 'watching' | 'triggered' | 'invalidated' | 'structure_break' | 'expired';

export interface PlanCandle { o: number; h: number; l: number; c: number; t?: number }

// ── Validation (write AND read — a corrupt plan is discarded) ──────────────

const isPos = (n: any): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function validateWatchPlan(raw: any, ctx: { symbol: string; currentPrice: number; now: number }): WatchPlan | null {
  try {
    if (!raw || typeof raw !== 'object') return null;
    const p = raw as WatchPlan;
    if (p.v !== 1) return null;
    if (typeof p.id !== 'string' || !p.id) return null;
    if (!Number.isFinite(p.userId)) return null;
    if (p.symbol !== ctx.symbol) return null;
    if (p.direction !== 'BUY' && p.direction !== 'SELL') return null;
    if (typeof p.pattern !== 'string' || p.pattern.trim().length < 1 || p.pattern.length > 80) return null;
    if (!p.entryZone || !isPos(p.entryZone.low) || !isPos(p.entryZone.high) || p.entryZone.low > p.entryZone.high) return null;
    if (!p.trigger || !WATCH_PLAN_TRIGGER_TYPES.includes(p.trigger.type) || !isPos(p.trigger.level)) return null;
    if (!isPos(p.stopLoss) || !isPos(p.takeProfit) || !isPos(p.invalidation)) return null;
    if (!Number.isFinite(p.createdAt) || !Number.isFinite(p.expiresAt)) return null;
    const life = p.expiresAt - p.createdAt;
    if (life < PLAN_MIN_EXPIRY_MS - 60_000 || life > PLAN_MAX_EXPIRY_MS + 60_000) return null;
    if (p.status !== 'watching' && p.status !== 'triggered') return null;
    // Price sanity vs the CURRENT price (catches corrupt stored levels).
    const px = ctx.currentPrice;
    if (!isPos(px)) return null;
    const band = (v: number) => Math.abs(v - px) / px <= PLAN_PRICE_SANITY_PCT;
    if (![p.entryZone.low, p.entryZone.high, p.trigger.level, p.stopLoss, p.takeProfit, p.invalidation].every(band)) return null;
    // Geometry: the stop and invalidation sit on the loss side of the zone,
    // the target on the profit side. No invented thresholds — this is the
    // plan's own internal consistency, the same shape any trade plan has.
    if (p.direction === 'BUY') {
      if (!(p.stopLoss < p.entryZone.low)) return null;
      if (!(p.invalidation < p.entryZone.low)) return null;
      if (!(p.takeProfit > p.entryZone.high)) return null;
    } else {
      if (!(p.stopLoss > p.entryZone.high)) return null;
      if (!(p.invalidation > p.entryZone.high)) return null;
      if (!(p.takeProfit < p.entryZone.low)) return null;
    }
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

// ── Deterministic trigger / invalidation evaluation ────────────────────────
// Candles arrive newest-first (the EA convention this route already uses:
// candles[0] is the latest candle, candles[0].c the current price). All
// rules below are pure functions of the posted set — same posts, same
// verdict, no clocks except expiry (checked by the caller against now).

export function evaluateWatchPlan(plan: WatchPlan, candles: PlanCandle[], now: number): PlanEvaluation {
  if (now >= plan.expiresAt) return 'expired';
  const cs = (candles || []).filter((k) => k && isPos(k.o) && isPos(k.h) && isPos(k.l) && isPos(k.c));
  if (!cs.length) return 'watching';
  const last = cs[0];
  const prev = cs[1];
  const buy = plan.direction === 'BUY';
  const zoneMid = (plan.entryZone.low + plan.entryZone.high) / 2;
  const riskDist = Math.abs(zoneMid - plan.stopLoss) || Math.abs(last.c - plan.stopLoss) || 0;

  // Invalidation first — capital stewardship outranks entry eagerness.
  // A marginal cross retires the plan as 'invalidated'; a blow-through
  // (close beyond invalidation by ≥ 25% of the plan's own stop distance)
  // is a HARD STRUCTURE BREAK: the premise level didn't just get touched,
  // it got run over. Both retire the plan; the distinction is logged.
  if (buy ? last.c < plan.invalidation : last.c > plan.invalidation) {
    const beyond = buy ? plan.invalidation - last.c : last.c - plan.invalidation;
    return riskDist > 0 && beyond >= 0.25 * riskDist ? 'structure_break' : 'invalidated';
  }

  const lvl = plan.trigger.level;
  switch (plan.trigger.type) {
    case 'engulfing': {
      if (!prev) return 'watching';
      const formed = buy
        ? prev.c < prev.o && last.c > last.o && last.o <= prev.c && last.c >= prev.o && last.c >= lvl
        : prev.c > prev.o && last.c < last.o && last.o >= prev.c && last.c <= prev.o && last.c <= lvl;
      return formed ? 'triggered' : 'watching';
    }
    case 'pin_bar': {
      const range = last.h - last.l;
      if (range <= 0) return 'watching';
      const body = Math.abs(last.c - last.o);
      const lowerWick = Math.min(last.o, last.c) - last.l;
      const upperWick = last.h - Math.max(last.o, last.c);
      const formed = buy
        ? body <= 0.35 * range && lowerWick >= 0.55 * range && last.c >= lvl
        : body <= 0.35 * range && upperWick >= 0.55 * range && last.c <= lvl;
      return formed ? 'triggered' : 'watching';
    }
    case 'close_beyond_level': {
      if (!prev) return 'watching';
      const crossed = buy ? prev.c <= lvl && last.c > lvl : prev.c >= lvl && last.c < lvl;
      return crossed ? 'triggered' : 'watching';
    }
    case 'retest_level': {
      // Price must have BROKEN AWAY from the level earlier in the posted
      // window (an earlier close beyond level ± 25% of the stop distance),
      // then come back to it and HOLD (wick touches, close stays on side).
      const away = cs.slice(1, 12).some((k) => (buy ? k.c > lvl + 0.25 * riskDist : k.c < lvl - 0.25 * riskDist));
      if (!away) return 'watching';
      const held = buy ? last.l <= lvl && last.c >= lvl : last.h >= lvl && last.c <= lvl;
      return held ? 'triggered' : 'watching';
    }
    case 'inside_bar_break': {
      const mother = cs[2];
      if (!prev || !mother) return 'watching';
      const inside = prev.h <= mother.h && prev.l >= mother.l;
      if (!inside) return 'watching';
      const broke = buy ? last.c > mother.h : last.c < mother.l;
      return broke ? 'triggered' : 'watching';
    }
  }
  return 'watching';
}

/** One-line human description of what the plan is waiting for (feed/UI). */
export function describeTrigger(plan: WatchPlan): string {
  const lvl = plan.trigger.level;
  switch (plan.trigger.type) {
    case 'engulfing': return `${plan.direction === 'BUY' ? 'bullish' : 'bearish'} engulfing close past ${lvl}`;
    case 'pin_bar': return `${plan.direction === 'BUY' ? 'bullish' : 'bearish'} pin bar at ${lvl}`;
    case 'close_beyond_level': return `close ${plan.direction === 'BUY' ? 'above' : 'below'} ${lvl}`;
    case 'retest_level': return `retest of ${lvl} that holds`;
    case 'inside_bar_break': return `inside-bar break ${plan.direction === 'BUY' ? 'up' : 'down'} through ${lvl}`;
  }
}

// ── Deep-analysis prompt + parse ────────────────────────────────────────────

export interface DeepAnalysisInput {
  userId: number;
  symbol: string;
  timeframe: string;
  candles: PlanCandle[];
  indicators?: any;
  engineRead?: { signal?: string; confidence?: number; trend?: string; patterns?: string[]; tradePlan?: any } | null;
  sessionLabel?: string | null;
}

const fmt = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  return Math.abs(n) >= 100 ? n.toFixed(2) : Math.abs(n) >= 1 ? n.toFixed(4) : n.toFixed(5);
};

/** The deep-analysis prompt. Depth is deliberate (Chris: the AI may spend
 *  more tokens when the picture warrants it) — 30 candles, the engine's
 *  own deterministic read, and the indicator set — but the OUTPUT is a
 *  strict, small JSON contract the server can validate deterministically. */
export function buildWatchPlanPrompt(input: DeepAnalysisInput): { system: string; user: string } {
  const system =
    'You are the senior FX analyst for a live automated trading engine. Your job is NOT to call a trade for this instant. ' +
    'Your job is to study this pair and write ONE WATCH PLAN: the single highest-quality pattern setup worth waiting for, ' +
    'the exact candle that will confirm entry when it forms, and the price that proves the idea wrong. ' +
    'The engine will watch your plan for free and only ask for a final confirmation at the moment your trigger candle forms, ' +
    'so a precise, patient plan is worth more than an eager one. Choose patterns from: ORB retest, BOS + FVG entry, ' +
    'engulfing at a key level, pin-bar rejection, range rejection, inside-bar break, trend pullback continuation. ' +
    'If nothing on this chart is worth watching, say so with noPlan — a steward does not invent setups. ' +
    'Respond ONLY with JSON in one of these two shapes:\n' +
    '{"plan": {"direction": "BUY"|"SELL", "pattern": string, "entryZoneLow": number, "entryZoneHigh": number, ' +
    '"triggerType": "engulfing"|"pin_bar"|"close_beyond_level"|"retest_level"|"inside_bar_break", "triggerLevel": number, ' +
    '"stopLoss": number, "takeProfit": number, "invalidation": number, "expiryMinutes": number (15 to 480), ' +
    '"confidence": number (0 to 100), "rationale": "one or two short lines"}}\n' +
    '{"noPlan": true, "reason": "one short line"}\n' +
    'Geometry rules: for BUY, stopLoss and invalidation are BELOW the entry zone and takeProfit is ABOVE it (mirror for SELL). ' +
    'invalidation is the price that kills the idea before entry; triggerLevel is the level the trigger candle must close past or hold.';
  const candles = (input.candles || []).slice(0, 30);
  const csv = candles.map((k) => `${fmt(k.o)},${fmt(k.h)},${fmt(k.l)},${fmt(k.c)}`).join('\n');
  const ind = input.indicators || {};
  const indBits: string[] = [];
  const pick = (label: string, v: any) => { const n = Number(v); if (Number.isFinite(n)) indBits.push(`${label}=${fmt(n)}`); };
  pick('RSI', ind.rsi ?? ind.rsi14);
  pick('ADX', ind.adx);
  pick('ATR', ind.atr);
  pick('MACD hist', ind.macd?.histogram ?? ind.macdHistogram);
  pick('EMA20', ind.ema20 ?? ind.ema?.fast);
  pick('EMA50', ind.ema50 ?? ind.ema?.slow);
  const er = input.engineRead;
  const user = [
    `PAIR: ${input.symbol} (${input.timeframe}) — session: ${input.sessionLabel || 'unknown'}`,
    `Current price: ${candles.length ? fmt(candles[0].c) : 'unknown'}`,
    `Last ${candles.length} candles, NEWEST FIRST (open,high,low,close):\n${csv}`,
    indBits.length ? `Indicators: ${indBits.join(' · ')}` : null,
    er ? `Engine's deterministic read right now: signal ${er.signal ?? 'NEUTRAL'}, confidence ${er.confidence ?? '?'}%, trend ${er.trend ?? 'unknown'}${er.patterns?.length ? `, patterns seen: ${er.patterns.join(', ')}` : ''}${er.tradePlan ? `, its draft plan: entry ${fmt(Number(er.tradePlan.entry) || 0)}, SL ${fmt(Number(er.tradePlan.stopLoss) || 0)}, TP ${fmt(Number(er.tradePlan.takeProfit) || 0)}` : ''}` : null,
    'Write the watch plan for this pair now — the pattern you will wait for, the candle that triggers entry, and the price that kills it.',
  ].filter(Boolean).join('\n');
  return { system, user };
}

export type ParsedDeepAnalysis =
  | { kind: 'plan'; fields: Record<string, any> }
  | { kind: 'no_plan'; reason: string }
  | null;

/** Parse the deep call's reply. Salvages an embedded JSON object from
 *  prose; anything unusable returns null → caller falls back. Pure. */
export function parseWatchPlanResponse(content: string): ParsedDeepAnalysis {
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

/** Turn parsed AI fields into a stamped plan and validate it. Expiry the
 *  AI requests is CLAMPED into the allowed 15 min – 8 h band (rejecting a
 *  sound plan over 9h vs 8h would waste a bought call); every other field
 *  must pass strict validation or the plan is discarded. Pure. */
export function planFromFields(
  fields: Record<string, any>,
  ctx: { userId: number; symbol: string; timeframe: string; currentPrice: number; now: number; id: string; modelUsed?: string | null },
): WatchPlan | null {
  let confidence = Number(fields.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  if (confidence > 0 && confidence <= 1) confidence *= 100;
  const expiryMinRaw = Number(fields.expiryMinutes);
  const expiryMin = Number.isFinite(expiryMinRaw)
    ? Math.min(PLAN_MAX_EXPIRY_MS / 60_000, Math.max(PLAN_MIN_EXPIRY_MS / 60_000, expiryMinRaw))
    : 120;
  const candidate: WatchPlan = {
    v: 1,
    id: ctx.id,
    userId: ctx.userId,
    symbol: ctx.symbol,
    timeframe: String(fields.timeframe || ctx.timeframe || ''),
    direction: String(fields.direction || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
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
  return validateWatchPlan(candidate, { symbol: ctx.symbol, currentPrice: ctx.currentPrice, now: ctx.now });
}

// ── Counters (telemetry for /api/health, gray-zone pattern) ────────────────

interface WatchPlanDay {
  day: string; created: number; triggered: number; confirmed: number;
  expired: number; invalidated: number; structureBreaks: number; deepCalls: number; fallbacks: number;
}
const countersByUser = new Map<number, WatchPlanDay>();
const utcDay = () => new Date().toISOString().slice(0, 10);
function currentCounters(userId: number): WatchPlanDay {
  const day = utcDay();
  let s = countersByUser.get(userId);
  if (!s || s.day !== day) {
    s = { day, created: 0, triggered: 0, confirmed: 0, expired: 0, invalidated: 0, structureBreaks: 0, deepCalls: 0, fallbacks: 0 };
    countersByUser.set(userId, s);
  }
  return s;
}

/** Called by the route when a post that fell through from a triggered
 *  plan actually bought its confirmation on the existing path. */
export function noteWatchPlanConfirmed(userId: number): void {
  currentCounters(userId).confirmed += 1;
}

// ── Store (runtime_state blob per user + in-process cache) ─────────────────

export interface WatchPlanBlob { plans: Record<string, WatchPlan>; lastDeepAt: Record<string, number> }

export interface WatchPlanStore {
  load(userId: number): Promise<WatchPlanBlob | null>;
  save(userId: number, blob: WatchPlanBlob): Promise<void>;
}

const defaultStore: WatchPlanStore = {
  async load(userId: number) {
    const saved: any = await getRuntimeStateStrict('ai_watch_plans', String(userId));
    if (!saved || typeof saved !== 'object') return null;
    return {
      plans: saved.plans && typeof saved.plans === 'object' ? saved.plans : {},
      lastDeepAt: saved.lastDeepAt && typeof saved.lastDeepAt === 'object' ? saved.lastDeepAt : {},
    };
  },
  async save(userId: number, blob: WatchPlanBlob) {
    await ensureRuntimeStateTable();
    await pool.query(
      `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      ['ai_watch_plans', String(userId), JSON.stringify(blob)],
    );
  },
};

let store: WatchPlanStore = defaultStore;
/** Check-script seam: substitute an in-memory (or throwing) store. */
export function __setWatchPlanStoreForCheck(s: WatchPlanStore | null): void {
  store = s ?? defaultStore;
  cache.clear();
}

const cache = new Map<number, WatchPlanBlob>();
const loadStarted = new Set<number>();

async function getBlob(userId: number): Promise<WatchPlanBlob> {
  const hit = cache.get(userId);
  if (hit) return hit;
  if (!loadStarted.has(userId)) {
    loadStarted.add(userId);
    const loaded = await store.load(userId); // may throw → caller abstains
    const blob: WatchPlanBlob = loaded ?? { plans: {}, lastDeepAt: {} };
    cache.set(userId, blob);
    return blob;
  }
  // A previous load attempt finished without caching (it threw) — retry.
  const loaded = await store.load(userId);
  const blob: WatchPlanBlob = loaded ?? { plans: {}, lastDeepAt: {} };
  cache.set(userId, blob);
  return blob;
}

async function persist(userId: number, blob: WatchPlanBlob): Promise<void> {
  try { await store.save(userId, blob); } catch { /* in-process cache stays authoritative; next mutation retries */ }
}

// ── Deep call (injectable seam for checks) ──────────────────────────────────

export interface WatchPlanDeps {
  callDeep?: (input: DeepAnalysisInput) => Promise<{ content: string; model: string | null }>;
  now?: () => number;
}

/**
 * The deep analysis itself, against an already-built client (exported so
 * the check suite can drive it with a fake client and observe the shared
 * pool's counters). Budget gate first (throws the 402-shaped budget error
 * when the pool is dry — the resolver treats that as an abstain); on an
 * answered call the pool is metered EXACTLY ONCE at 2 units (the
 * deep-reasoning convention). The client is deliberately built WITHOUT
 * engine marking: metering here is manual (like the chart-data route's
 * own confirmations), so a deep call can never be double-counted by the
 * failover wrapper (the double-count PR #103's audit exists to prevent).
 */
export async function runDeepAnalysis(input: DeepAnalysisInput, client: any): Promise<{ content: string; model: string | null }> {
  if (!(await engineAiBudgetAllows(input.userId))) {
    throw engineAiBudgetError();
  }
  const { system, user } = buildWatchPlanPrompt(input);
  const modelId = client.defaultModel || getUserModelPreference(input.userId) || 'gpt-4o-mini';
  const call = client.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.3,
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`watch-plan deep analysis timed out after ${watchPlanTimeoutMs()}ms`)), watchPlanTimeoutMs()),
  );
  const resp: any = await Promise.race([call, timeout]);
  const content = String(resp?.choices?.[0]?.message?.content || '');
  if (!content) throw new Error('watch-plan deep analysis returned an empty reply');
  // The call was ANSWERED — meter it exactly once, at the deep rate.
  meterEngineAiConfirmation(input.userId, 2);
  return { content, model: resp?.model || modelId };
}

async function realDeepCall(input: DeepAnalysisInput): Promise<{ content: string; model: string | null }> {
  const client: any = await getUniversalAIClientForUser(input.userId);
  return runDeepAnalysis(input, client);
}

// ── Feed logging ────────────────────────────────────────────────────────────
// Plan lifecycle goes into the SAME AI confirmation log the app renders as
// its decision feed (addAiConfirmationLog), with aiDecision 'WATCH_PLAN'
// and the event in the reasoning text — Chris can SEE what the AI is
// watching, what fired, and what died, in the feed he already reads.

async function logPlanEvent(plan: WatchPlan, event: string, detail: string): Promise<void> {
  try {
    const { addAiConfirmationLog } = await import('../openai');
    addAiConfirmationLog(plan.userId, {
      timestamp: new Date().toISOString(),
      symbol: plan.symbol,
      timeframe: plan.timeframe,
      proposedSignal: plan.direction,
      proposedConfidence: plan.confidence,
      proposedEntry: (plan.entryZone.low + plan.entryZone.high) / 2,
      proposedSL: plan.stopLoss,
      proposedTP: plan.takeProfit,
      aiDecision: 'WATCH_PLAN',
      aiDirection: plan.direction,
      aiConfidence: plan.confidence,
      reasoning: `WATCH PLAN ${event}: ${plan.pattern} ${plan.direction} ${plan.symbol} — ${detail}`,
      modelUsed: plan.modelUsed || 'ai-watch-plans',
    });
  } catch { /* logging only — never disrupt the post */ }
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export type WatchPlanAction =
  | { action: 'watch'; plan: WatchPlan }
  | { action: 'fallthrough'; plan: WatchPlan }
  | { action: 'abstain' };

/**
 * Resolve the plan layer for one chart-data post. NEVER throws: any
 * failure returns 'abstain' and the post proceeds through today's path.
 *  - 'watch'       → a live plan is waiting for its trigger candle; the
 *                    route answers no-trade (zero AI purchases).
 *  - 'fallthrough' → the plan's trigger has fired; the route proceeds
 *                    into the existing confirmation + guard chain.
 *  - 'abstain'     → no plan applies this post (cooldown, no-plan answer,
 *                    or any failure); today's path runs unchanged.
 */
export async function resolveWatchPlanForPost(
  input: DeepAnalysisInput & { currentPrice: number },
  deps: WatchPlanDeps = {},
): Promise<WatchPlanAction> {
  const now = (deps.now ?? Date.now)();
  const userId = input.userId;
  const symbol = input.symbol;
  try {
    const blob = await getBlob(userId);
    let plan: WatchPlan | null = null;
    const stored = blob.plans[symbol];
    if (stored) {
      // Validate on read — a corrupt stored plan is discarded, never trusted.
      plan = validateWatchPlan(stored, { symbol, currentPrice: input.currentPrice, now });
      if (!plan) delete blob.plans[symbol];
    }

    if (plan) {
      const ev = evaluateWatchPlan(plan, input.candles, now);
      if (ev === 'expired' || ev === 'invalidated' || ev === 'structure_break') {
        delete blob.plans[symbol];
        await persist(userId, blob);
        const c = currentCounters(userId);
        if (ev === 'expired') c.expired += 1;
        else if (ev === 'invalidated') c.invalidated += 1;
        else c.structureBreaks += 1;
        void logPlanEvent(plan, ev === 'expired' ? 'EXPIRED' : ev === 'invalidated' ? 'INVALIDATED' : 'STRUCTURE BREAK',
          ev === 'expired'
            ? `plan window ended without its trigger (${describeTrigger(plan)} never formed)`
            : `price closed through invalidation ${plan.invalidation} — the idea is dead`);
        plan = null; // fall through to the re-plan branch below
      } else if (ev === 'triggered') {
        if (plan.status !== 'triggered') {
          plan.status = 'triggered';
          plan.triggeredAt = now;
          blob.plans[symbol] = plan;
          await persist(userId, blob);
          currentCounters(userId).triggered += 1;
          void logPlanEvent(plan, 'TRIGGERED',
            `trigger formed (${describeTrigger(plan)}) — buying the one confirmation through the normal guard chain`);
        }
        return { action: 'fallthrough', plan };
      } else {
        return { action: 'watch', plan };
      }
    }

    // No live plan → maybe create one (re-plan events land here too).
    const lastDeep = Number(blob.lastDeepAt[symbol] || 0);
    if (now - lastDeep < watchPlanCooldownMs()) return { action: 'abstain' };

    const callDeep = deps.callDeep ?? realDeepCall;
    const { content, model } = await callDeep(input); // throws → abstain
    currentCounters(userId).deepCalls += 1;
    blob.lastDeepAt[symbol] = now; // a bought call starts the cooldown, whatever it answered
    await persist(userId, blob);

    const parsed = parseWatchPlanResponse(content);
    if (!parsed) { currentCounters(userId).fallbacks += 1; return { action: 'abstain' }; }
    if (parsed.kind === 'no_plan') return { action: 'abstain' };

    const created = planFromFields(parsed.fields, {
      userId, symbol, timeframe: input.timeframe,
      currentPrice: input.currentPrice, now,
      id: `wp_${now.toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`,
      modelUsed: model,
    });
    if (!created) { currentCounters(userId).fallbacks += 1; return { action: 'abstain' }; }

    blob.plans[symbol] = created;
    await persist(userId, blob);
    currentCounters(userId).created += 1;
    void logPlanEvent(created, 'CREATED',
      `watching for ${describeTrigger(created)} · zone ${created.entryZone.low}–${created.entryZone.high} · SL ${created.stopLoss} · TP ${created.takeProfit} · dies at ${created.invalidation} · expires ${new Date(created.expiresAt).toISOString()}`);

    // Born triggered? The trigger may already be formed on these candles.
    const ev0 = evaluateWatchPlan(created, input.candles, now);
    if (ev0 === 'triggered') {
      created.status = 'triggered';
      created.triggeredAt = now;
      blob.plans[symbol] = created;
      await persist(userId, blob);
      currentCounters(userId).triggered += 1;
      void logPlanEvent(created, 'TRIGGERED', `trigger already formed at creation (${describeTrigger(created)}) — proceeding to confirmation`);
      return { action: 'fallthrough', plan: created };
    }
    if (ev0 === 'invalidated' || ev0 === 'structure_break') {
      // The AI's levels are already dead on the current candles — retire
      // the newborn plan rather than watch a corpse.
      delete blob.plans[symbol];
      await persist(userId, blob);
      if (ev0 === 'invalidated') currentCounters(userId).invalidated += 1;
      else currentCounters(userId).structureBreaks += 1;
      return { action: 'abstain' };
    }
    return { action: 'watch', plan: created };
  } catch {
    try { currentCounters(userId).fallbacks += 1; } catch { /* counters are best-effort */ }
    return { action: 'abstain' };
  }
}

/** Platform-wide view for /api/health. */
export function aiWatchPlansSummary(): {
  enabled: boolean; activePlans: number;
  created: number; triggered: number; confirmed: number; expired: number;
  invalidated: number; structureBreaks: number; deepCallsToday: number; fallbacks: number;
} {
  const day = utcDay();
  const agg = { created: 0, triggered: 0, confirmed: 0, expired: 0, invalidated: 0, structureBreaks: 0, deepCalls: 0, fallbacks: 0 };
  countersByUser.forEach((s) => {
    if (s.day !== day) return;
    agg.created += s.created; agg.triggered += s.triggered; agg.confirmed += s.confirmed;
    agg.expired += s.expired; agg.invalidated += s.invalidated; agg.structureBreaks += s.structureBreaks;
    agg.deepCalls += s.deepCalls; agg.fallbacks += s.fallbacks;
  });
  const now = Date.now();
  let activePlans = 0;
  cache.forEach((blob) => {
    for (const p of Object.values(blob.plans)) if (p && p.expiresAt > now) activePlans += 1;
  });
  return { enabled: watchPlansEnabled(), activePlans, ...agg, deepCallsToday: agg.deepCalls };
}

/** Check-script seam: wipe in-process state between scenarios. */
export function __resetWatchPlansForCheck(): void {
  cache.clear();
  loadStarted.clear();
  countersByUser.clear();
}
