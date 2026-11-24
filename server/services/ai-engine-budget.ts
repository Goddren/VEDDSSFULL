// ─────────────────────────────────────────────────────────────────────────────
// AI engine-confirmation daily budget + the AI_COST_DISCIPLINE kill switch.
//
// WHY: the FX engine's AI confirmations (POST /api/mt5/chart-data →
// getAiVisionConfirmation / getBreakoutConfirmation in server/openai.ts) are
// the app's biggest AI spend. The calls are individually cheap
// (openai/gpt-4o-mini via OpenRouter), so the burn is VOLUME: the repo's own
// measurement (routes.ts, 2026-09-22) recorded 11,354 confirmation calls in a
// day — ~$15/day at the per-call estimate below — repeatedly draining the
// shared OpenRouter balance mid-session and halting confirmation on 402s.
//
// The verdict cache (ai-confirmation-cache.ts) reuses answers for setups that
// have not moved; this module is the hard backstop behind it: a per-user,
// per-UTC-day spend cap for ENGINE CONFIRMATIONS ONLY. When the cap is hit,
// the route returns the same fail-closed verdict shape the engine already
// produces on a 402 ("AI confirmation unavailable" → trade refused), but with
// aiErrorStatus 'budget' and a "daily AI budget reached" reason, so a budget
// stop is never confused with empty provider credits in the decision feed or
// the safeguards panel.
//
// SCOPE (extended 2026-11-21, "AI budget on all engines"): PR #101 metered
// only the chart-data (MT5 EA) confirmation path. Chris directed the same
// $2/day discipline on ALL engines, so the universal failover client in
// openai.ts now consults THIS SAME per-user daily pool for every call made
// through an engine-marked client (opts.engine on the client builders, or
// wrapEngineAiClient for the engines' raw economy-Groq overrides). One
// counter, one cap: engine calls and chart-data confirmations draw from the
// same pool — it is NOT $2 per engine. User-initiated interactive AI (ABBA
// chat/TTS, Content Studio, chart analysis, and every other user-facing
// surface) is NOT engine-marked and stays outside this pool, under the
// platform caps in ai-usage.ts only. AI_BUDGET_ALL_ENGINES=off reverts to
// the PR #101 FX-only scope (engine marking becomes inert; the chart-data
// route keeps its own gate). The chart-data route remains the ONLY meter
// for confirmations: getAiVisionConfirmation / getBreakoutConfirmation
// build their clients inside openai.ts WITHOUT engine marking, so nothing
// on that path can double-meter (see the PR body for the full audit).
//
// METERING IS AN ESTIMATE, deliberately. The confirmation functions do not
// return token usage, and ai_usage_log never sees this path (recordAiUsage
// only fires inside the universal failover client), so there is no exact
// per-call cost to read back. Each confirmation that returns a real answer
// is metered at AI_ENGINE_CONFIRM_EST_CENTS (default 0.15¢), derived from a
// typical vision-confirmation call — ~5k input + ~1k output tokens at
// gpt-4o-mini OpenRouter pricing (15¢ / 60¢ per 1M) ≈ 0.135¢ — and consistent
// with the observed burn (~$15/day ÷ ~11k calls/day). Deep-reasoning
// confirmations meter 2 units (debate + judge passes). Failed calls
// (aiError verdicts — 402/429/auth) are NOT metered: they are not billed,
// and the 402 back-off in ai-budget-guard.ts already pauses that failure
// mode. The breakout path meters 1 unit per invocation that reaches the
// route's call branch, including its free deterministic grade-fail returns —
// a slight overcount, acceptable for a cap (this is a budget, not an invoice).
//
// POOL RESERVE (2026-11-23): the cap above is ONE pool, but a full Monday
// of evidence showed the 24/7 general lanes (Sol consensus, crypto live
// confirmations, options/futures, the ensemble, the FX Models cycle)
// re-draining it to the cap overnight — 25,532 blocked calls in a day —
// so the FX confirmation path, the AI watch plans, and the two shadow AI
// judges never got a cent. The reserve fixes the ORDER, not the size:
// the cap does not change, but calls are classified by lane. PROTECTED
// lanes (the FX chart-data confirmations in routes.ts, AI watch-plan
// deep analyses, the Kalshi perp AI judge, the crypto shadow AI judge)
// may spend the whole pool down to the last cent. GENERAL lanes (every
// other engine-marked call) may spend only while the day's spend is
// below cap − reserve (AI_BUDGET_RESERVE_CENTS, default 100¢ — half the
// default $2 pool). A general call stopped by the reserve fails with the
// exact same 402-shaped budget error as a cap stop, so no engine's
// fail-open/fail-closed behavior changes; it is counted separately
// (reserveBlocked) so the protection is visible on /api/health. Kill
// switch AI_BUDGET_RESERVE=off restores the single undifferentiated pool.
//
// PERSISTENCE: in-process counters (authoritative for the single web process
// that serves chart-data), debounced into runtime_state scope
// 'ai_engine_budget' so a mid-day restart does not reset the day's spend.
// Persistence is best-effort: if the store is unreachable the in-process
// counter still bounds this process, and loading NEVER blocks a confirmation
// (any load error resolves to "no saved spend").
//
// KILL SWITCH: AI_COST_DISCIPLINE=off disables everything in this PR —
// budgetAllows() always returns true, metering is a no-op, the routes.ts
// breakout→vision fallback goes back to calling the model uncached, and the
// confirmation clients in openai.ts restore their previous retry counts and
// cross-provider failover. The pre-existing verdict-cache wiring on the
// vision/breakout paths predates this PR and is NOT part of the switch.
// ─────────────────────────────────────────────────────────────────────────────

import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';

/** Master kill switch for the AI cost-discipline PR. Default ON. */
export function aiCostDisciplineEnabled(): boolean {
  return process.env.AI_COST_DISCIPLINE !== 'off';
}

/** Scope switch for the all-engines extension: when off, engine-marked
 *  clients are inert (no gate, no metering) and the budget applies only to
 *  the chart-data confirmation route, exactly as in PR #101. Default ON. */
export function aiBudgetAllEnginesEnabled(): boolean {
  return aiCostDisciplineEnabled() && process.env.AI_BUDGET_ALL_ENGINES !== 'off';
}

/** Daily per-user cap for engine confirmations, in cents. Default $2.00/day.
 *  An explicit 0 is honored (hard stop). A non-numeric value falls back to
 *  the default rather than silently disabling or zeroing the cap. */
export function engineAiBudgetCents(): number {
  const raw = process.env.AI_ENGINE_DAILY_BUDGET_CENTS;
  if (raw === undefined) return 200;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 200;
}

/** Estimated cost of one confirmation call, in cents. See header. */
export function engineAiEstCentsPerCall(): number {
  const n = Number(process.env.AI_ENGINE_CONFIRM_EST_CENTS ?? 0.15);
  return Number.isFinite(n) && n > 0 ? n : 0.15;
}

/** Budget lane for an engine AI call. 'protected' lanes (FX chart-data
 *  confirmations, AI watch plans, the two shadow AI judges) may spend
 *  the whole pool; 'general' lanes (every other engine-marked call) stop
 *  at cap − reserve while the reserve is on. Default everywhere is
 *  'general' — a call site is protected only by opting in explicitly. */
export type EngineAiLane = 'protected' | 'general';

/** Kill switch for the pool reserve. Default ON. When off, the pool is
 *  the single undifferentiated pool of PR #103 — lane is ignored. */
export function aiBudgetReserveEnabled(): boolean {
  return aiCostDisciplineEnabled() && process.env.AI_BUDGET_RESERVE !== 'off';
}

/** Protected reserve inside the daily pool, in cents. Default 100¢
 *  (half the default $2 cap). Validated like the cap: a non-numeric or
 *  negative value falls back to the default rather than silently
 *  disabling or exploding the reserve; an explicit 0 is honored (no
 *  protection, equivalent to the kill switch). A reserve ≥ the cap is
 *  allowed — general lanes then get nothing — and is logged once. */
export function engineAiBudgetReserveCents(): number {
  const raw = process.env.AI_BUDGET_RESERVE_CENTS;
  if (raw === undefined) return 100;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 100;
}

let reserveConfigWarned = false;
function noteReserveConfig(reserve: number, cap: number): void {
  if (reserveConfigWarned || reserve < cap) return;
  reserveConfigWarned = true;
  console.warn(`[AI Budget] AI_BUDGET_RESERVE_CENTS (${reserve}) >= the daily cap (${cap}) — general engine lanes get no AI spend while the reserve is on; protected lanes (FX confirmations, watch plans, judges) are unaffected.`);
}

interface EngineAiSpend {
  day: string; cents: number; calls: number; blocked: number;
  /** General-lane calls stopped by the reserve while the pool still had
   *  protected room (a subset of blocked, broken out for /api/health). */
  reserveBlocked: number;
  /** Metered spend split by lane, for observability. cents is always
   *  their sum (modulo rows saved before the reserve existed). */
  protectedCents: number; generalCents: number;
}

const spendByUser = new Map<number, EngineAiSpend>();
const loadStarted = new Set<number>();
const persistTimers = new Map<number, ReturnType<typeof setTimeout>>();
const lastBlockLogAt = new Map<number, number>();

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function currentSpend(userId: number): EngineAiSpend {
  const day = utcDay();
  let s = spendByUser.get(userId);
  if (!s || s.day !== day) {
    s = { day, cents: 0, calls: 0, blocked: 0, reserveBlocked: 0, protectedCents: 0, generalCents: 0 };
    spendByUser.set(userId, s);
  }
  return s;
}

/** Merge a persisted ai_engine_budget row into the in-process counters.
 *  Backward-compatible by construction: rows saved before the reserve
 *  existed have no reserveBlocked / protectedCents / generalCents
 *  fields, and Number(undefined) || 0 reads them as 0 — an old row
 *  loads cleanly and the lane split simply starts counting from the
 *  upgrade. Exported so the check suite can drive the merge directly
 *  (the DB load path itself is best-effort and unreachable in checks). */
export function applySavedEngineAiSpend(s: EngineAiSpend, saved: any): void {
  if (!saved || saved.day !== s.day) return;
  // Take the max so spend metered while the load was in flight is kept.
  s.cents = Math.max(s.cents, Number(saved.cents) || 0);
  s.calls = Math.max(s.calls, Number(saved.calls) || 0);
  s.blocked = Math.max(s.blocked, Number(saved.blocked) || 0);
  s.reserveBlocked = Math.max(s.reserveBlocked, Number(saved.reserveBlocked) || 0);
  s.protectedCents = Math.max(s.protectedCents, Number(saved.protectedCents) || 0);
  s.generalCents = Math.max(s.generalCents, Number(saved.generalCents) || 0);
}

async function ensureLoaded(userId: number): Promise<void> {
  if (loadStarted.has(userId)) return;
  loadStarted.add(userId);
  try {
    const saved: any = await getRuntimeStateStrict('ai_engine_budget', String(userId));
    if (saved && saved.day === utcDay()) {
      applySavedEngineAiSpend(currentSpend(userId), saved);
    }
  } catch { /* best-effort: in-process counter still bounds this process */ }
}

function persistSoon(userId: number): void {
  if (persistTimers.has(userId)) return;
  const t = setTimeout(() => {
    persistTimers.delete(userId);
    try {
      const s = spendByUser.get(userId);
      if (s) saveRuntimeState('ai_engine_budget', String(userId), { ...s });
    } catch { /* best-effort */ }
  }, 5000);
  if (typeof (t as any).unref === 'function') (t as any).unref();
  persistTimers.set(userId, t);
}

/** The gate verdict for one prospective engine AI call. reserveBlocked
 *  is true only when the call was refused BY THE RESERVE — a general
 *  lane stopped while the pool still had protected room — as opposed
 *  to a plain cap stop, so callers can count the protection separately
 *  (noteEngineAiBudgetBlock's reserve flag). */
export interface EngineAiBudgetGateResult { allowed: boolean; reserveBlocked: boolean }

/** Full gate: may this user buy another engine AI call in this lane
 *  today? Always allowed when the kill switch is off. Fails OPEN on any
 *  internal error — a budget-store hiccup must never halt confirmations;
 *  only a positively-known exhausted budget (or reserve) blocks. */
export async function engineAiBudgetGate(userId: number, lane: EngineAiLane = 'general'): Promise<EngineAiBudgetGateResult> {
  if (!aiCostDisciplineEnabled()) return { allowed: true, reserveBlocked: false };
  try {
    const cap = engineAiBudgetCents();
    if (cap <= 0) return { allowed: false, reserveBlocked: false };
    await ensureLoaded(userId);
    const s = currentSpend(userId);
    if (s.cents >= cap) return { allowed: false, reserveBlocked: false };
    if (lane === 'general' && aiBudgetReserveEnabled()) {
      const reserve = engineAiBudgetReserveCents();
      noteReserveConfig(reserve, cap);
      if (reserve > 0 && s.cents >= cap - reserve) {
        return { allowed: false, reserveBlocked: true };
      }
    }
    return { allowed: true, reserveBlocked: false };
  } catch {
    return { allowed: true, reserveBlocked: false };
  }
}

/** True when another engine confirmation may be bought for this user
 *  today in the given lane (default 'general' — the stricter lane, so
 *  pre-reserve call sites keep working unchanged). Thin wrapper over
 *  engineAiBudgetGate for callers that do not count reserve blocks. */
export async function engineAiBudgetAllows(userId: number, lane: EngineAiLane = 'general'): Promise<boolean> {
  return (await engineAiBudgetGate(userId, lane)).allowed;
}

/** Meter one answered confirmation (units > 1 for deep-reasoning's passes).
 *  No-op when the kill switch is off. Callers meter only real answers —
 *  aiError verdicts are not billed and are not metered. The lane only
 *  feeds the protected/general spend split on /api/health; the pool
 *  total (cents/calls) is identical whichever lane meters. */
export function meterEngineAiConfirmation(userId: number, units = 1, lane: EngineAiLane = 'general'): void {
  if (!aiCostDisciplineEnabled()) return;
  const u = Math.max(1, Math.floor(Number(units) || 1));
  const s = currentSpend(userId);
  const cost = engineAiEstCentsPerCall() * u;
  s.cents += cost;
  s.calls += u;
  if (lane === 'protected') s.protectedCents += cost; else s.generalCents += cost;
  persistSoon(userId);
}

/** Today's metered spend for observability (health/checks). */
export function engineAiSpendToday(userId: number): {
  cents: number; calls: number; blocked: number; capCents: number;
  reserveBlocked: number; protectedCents: number; generalCents: number;
  reserveCents: number; reserveEnabled: boolean;
} {
  const s = currentSpend(userId);
  return {
    cents: Math.round(s.cents * 1000) / 1000, calls: s.calls, blocked: s.blocked,
    capCents: engineAiBudgetCents(),
    reserveBlocked: s.reserveBlocked,
    protectedCents: Math.round(s.protectedCents * 1000) / 1000,
    generalCents: Math.round(s.generalCents * 1000) / 1000,
    reserveCents: engineAiBudgetReserveCents(),
    reserveEnabled: aiBudgetReserveEnabled(),
  };
}

/** Record one budget-blocked engine call (the gate refused to buy it).
 *  Counted separately from metered spend — a blocked call costs nothing —
 *  and surfaced on /api/health so a capped engine is visible at a glance
 *  instead of looking like a provider outage. opts.reserve marks a
 *  general-lane call stopped by the reserve while protected room
 *  remained; it counts in blocked too (reserveBlocked is the subset). */
export function noteEngineAiBudgetBlock(userId: number, opts?: { reserve?: boolean }): void {
  if (!aiCostDisciplineEnabled()) return;
  const s = currentSpend(userId);
  s.blocked += 1;
  if (opts?.reserve) s.reserveBlocked += 1;
  persistSoon(userId);
}

/** The error thrown by the shared AI client layer when an engine-marked
 *  call is budget-blocked. Deliberately shaped like the provider failure
 *  callers already handle — an Error with a numeric `status` (402, the
 *  exhausted-credits failure mode this cap exists to prevent) thrown out of
 *  chat.completions.create — so every engine's existing try/catch,
 *  fail-open, and fail-closed behavior applies unchanged. The marker
 *  properties (aiErrorStatus 'budget', budgetBlocked) are for logs and
 *  telemetry only; they do not change caller control flow. */
export function engineAiBudgetError(): Error & { status: number; aiErrorStatus: string; budgetBlocked: boolean } {
  const err: any = new Error(
    `402 Insufficient credits — daily AI budget reached (engine AI spend cap of $${(engineAiBudgetCents() / 100).toFixed(2)}/day across all engines). Engine AI calls resume at 00:00 UTC.`,
  );
  err.status = 402;
  err.aiErrorStatus = 'budget';
  err.budgetBlocked = true;
  return err;
}

/** Platform-wide view of today's engine-budget counters for /api/health:
 *  aggregates the same in-process per-user counters the gate consults (no
 *  parallel surface). Spend is per-user capped; the totals show how much
 *  of the pool the whole platform's engines have drawn today. */
export function engineAiBudgetSummary(): {
  enabled: boolean; allEngines: boolean; capCentsPerUser: number; estCentsPerCall: number;
  usersTracked: number; spendCentsToday: number; callsToday: number; blockedToday: number;
  reserveCents: number; reserveEnabled: boolean; reserveBlockedToday: number;
  protectedSpendCentsToday: number; generalSpendCentsToday: number;
} {
  const day = utcDay();
  let users = 0, cents = 0, calls = 0, blocked = 0, reserveBlocked = 0, protectedCents = 0, generalCents = 0;
  spendByUser.forEach((s) => {
    if (s.day !== day) return;
    users++;
    cents += s.cents;
    calls += s.calls;
    blocked += s.blocked;
    reserveBlocked += s.reserveBlocked;
    protectedCents += s.protectedCents;
    generalCents += s.generalCents;
  });
  return {
    enabled: aiCostDisciplineEnabled(),
    allEngines: aiBudgetAllEnginesEnabled(),
    capCentsPerUser: engineAiBudgetCents(),
    estCentsPerCall: engineAiEstCentsPerCall(),
    usersTracked: users,
    spendCentsToday: Math.round(cents * 1000) / 1000,
    callsToday: calls,
    blockedToday: blocked,
    reserveCents: engineAiBudgetReserveCents(),
    reserveEnabled: aiBudgetReserveEnabled(),
    reserveBlockedToday: reserveBlocked,
    protectedSpendCentsToday: Math.round(protectedCents * 1000) / 1000,
    generalSpendCentsToday: Math.round(generalCents * 1000) / 1000,
  };
}

/** The fail-closed verdict returned when the budget is exhausted. Same shape
 *  the engine already produces on a 402 (confirmed:false, aiConfidence:0,
 *  aiError:true → routes.ts refuses the unverified trade and suppresses the
 *  advisory override), distinguished by aiErrorStatus 'budget', the
 *  'ai-budget-gate' model label, and the "daily AI budget reached" reason. */
export function engineAiBudgetVerdict(): any {
  return {
    confirmed: false,
    aiDirection: 'NEUTRAL',
    aiConfidence: 0,
    reasoning: `AI confirmation unavailable — daily AI budget reached (engine confirmation spend cap of $${(engineAiBudgetCents() / 100).toFixed(2)}/day). Confirmations resume at 00:00 UTC; no trade will be taken on an unverified signal.`,
    aiError: true,
    aiErrorStatus: 'budget',
    modelUsed: 'ai-budget-gate',
    providerUsed: 'budget',
  };
}

/** Throttle for the guard-event emitted on a budget block: at most one per
 *  user per hour, so a blocked engine does not flood the safeguards panel. */
export function shouldLogBudgetBlock(userId: number): boolean {
  const now = Date.now();
  const last = lastBlockLogAt.get(userId) || 0;
  if (now - last < 3_600_000) return false;
  lastBlockLogAt.set(userId, now);
  return true;
}
