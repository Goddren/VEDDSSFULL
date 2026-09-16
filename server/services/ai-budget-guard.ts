// ── Shared AI-provider budget guard (per-process circuit breaker) ───────────
// The FX (SS AI) engine is the PRIORITY engine. FX, Sol and crypto all draw on
// the same shared OpenRouter/OpenAI/Groq provider budget. When that budget is
// exhausted (402 insufficient credits) or rate-limited (429), the lower-priority
// engines (Sol, crypto) must BACK OFF so FX keeps first call on the shared budget.
//
// Usage:
//   • Any engine that gets an AI error calls noteAiBudgetError(err) — this trips
//     the breaker for a cooldown window.
//   • Lower-priority engines (Sol, crypto) check shouldDeferLowPriorityAi() before
//     making an AI call and, when true, skip it and fall back to their rule-based
//     logic. FX NEVER checks this — it always runs.
//
// Scope note: this is per-process. FX + Sol share the web process, so a 402/429
// seen by either makes Sol defer for FX. Crypto runs in its own worker process,
// so its breaker is independent — but that still preserves the shared upstream
// budget, because a credit-starved crypto worker stops hammering the same key.

let deferUntil = 0;
let lastReason = '';

const COOLDOWN_402_MS = 5 * 60_000; // credits exhausted — back off a while
const COOLDOWN_429_MS = 60_000;     // rate limited — short back off

export function noteAiBudgetError(err: any): void {
  const status = err?.status ?? err?.statusCode ?? err?.response?.status;
  const msg = String(err?.message || err || '').toLowerCase();
  const is402 = status === 402 || /insufficient credits|insufficient_quota|payment required|\b402\b/.test(msg);
  const is429 = status === 429 || /rate.?limit|\b429\b|quota|too many requests/.test(msg);
  const now = Date.now();
  if (is402) {
    deferUntil = Math.max(deferUntil, now + COOLDOWN_402_MS);
    lastReason = 'insufficient credits (402)';
  } else if (is429) {
    deferUntil = Math.max(deferUntil, now + COOLDOWN_429_MS);
    lastReason = 'rate limit (429)';
  }
}

/** True while the shared AI budget is exhausted/rate-limited — lower-priority
 *  engines should skip their AI review and use rule-based logic instead. */
export function shouldDeferLowPriorityAi(): boolean {
  return Date.now() < deferUntil;
}

export function aiBudgetDeferReason(): string {
  return lastReason;
}

/** Seconds remaining on the current back-off (0 when not deferring). */
export function aiBudgetDeferSecondsLeft(): number {
  const left = deferUntil - Date.now();
  return left > 0 ? Math.ceil(left / 1000) : 0;
}
