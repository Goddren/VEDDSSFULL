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

interface EngineAiSpend { day: string; cents: number; calls: number; blocked: number }

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
    s = { day, cents: 0, calls: 0, blocked: 0 };
    spendByUser.set(userId, s);
  }
  return s;
}

async function ensureLoaded(userId: number): Promise<void> {
  if (loadStarted.has(userId)) return;
  loadStarted.add(userId);
  try {
    const saved: any = await getRuntimeStateStrict('ai_engine_budget', String(userId));
    if (saved && saved.day === utcDay()) {
      const s = currentSpend(userId);
      // Take the max so spend metered while the load was in flight is kept.
      s.cents = Math.max(s.cents, Number(saved.cents) || 0);
      s.calls = Math.max(s.calls, Number(saved.calls) || 0);
      s.blocked = Math.max(s.blocked, Number(saved.blocked) || 0);
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

/** True when another engine confirmation may be bought for this user today.
 *  Always true when the kill switch is off. Fails OPEN on any internal
 *  error — a budget-store hiccup must never halt confirmations; only a
 *  positively-known exhausted budget blocks. */
export async function engineAiBudgetAllows(userId: number): Promise<boolean> {
  if (!aiCostDisciplineEnabled()) return true;
  try {
    const cap = engineAiBudgetCents();
    if (cap <= 0) return false;
    await ensureLoaded(userId);
    return currentSpend(userId).cents < cap;
  } catch {
    return true;
  }
}

/** Meter one answered confirmation (units > 1 for deep-reasoning's passes).
 *  No-op when the kill switch is off. Callers meter only real answers —
 *  aiError verdicts are not billed and are not metered. */
export function meterEngineAiConfirmation(userId: number, units = 1): void {
  if (!aiCostDisciplineEnabled()) return;
  const u = Math.max(1, Math.floor(Number(units) || 1));
  const s = currentSpend(userId);
  s.cents += engineAiEstCentsPerCall() * u;
  s.calls += u;
  persistSoon(userId);
}

/** Today's metered spend for observability (health/checks). */
export function engineAiSpendToday(userId: number): { cents: number; calls: number; blocked: number; capCents: number } {
  const s = currentSpend(userId);
  return { cents: Math.round(s.cents * 1000) / 1000, calls: s.calls, blocked: s.blocked, capCents: engineAiBudgetCents() };
}

/** Record one budget-blocked engine call (the gate refused to buy it).
 *  Counted separately from metered spend — a blocked call costs nothing —
 *  and surfaced on /api/health so a capped engine is visible at a glance
 *  instead of looking like a provider outage. */
export function noteEngineAiBudgetBlock(userId: number): void {
  if (!aiCostDisciplineEnabled()) return;
  const s = currentSpend(userId);
  s.blocked += 1;
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
} {
  const day = utcDay();
  let users = 0, cents = 0, calls = 0, blocked = 0;
  spendByUser.forEach((s) => {
    if (s.day !== day) return;
    users++;
    cents += s.cents;
    calls += s.calls;
    blocked += s.blocked;
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
