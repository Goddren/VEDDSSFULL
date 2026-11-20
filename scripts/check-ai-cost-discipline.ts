/**
 * AI cost-discipline verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-ai-cost-discipline.ts
 * (Run with DATABASE_URL unset: the budget module's runtime_state
 * persistence is best-effort and must degrade silently — the in-process
 * counter is what these checks exercise.)
 *
 * What is pinned:
 *   A. Source wiring — the chart-data route gates all three confirmation
 *      branches (vision, breakout, breakout→vision fallback) on the daily
 *      budget, meters answered calls, and routes the fallback through the
 *      verdict cache under a ':fallback' direction suffix; /api/health
 *      still exports the same cache counters the route feeds.
 *   B. Budget behavior — default cap $2.00/day, per-call estimate from env,
 *      block at the cap, per-user isolation, the fail-closed budget verdict
 *      shape (aiErrorStatus 'budget'), and the AI_COST_DISCIPLINE=off kill
 *      switch restoring ungated behavior.
 *   C. Verdict cache — a stored verdict is served without any AI call (the
 *      acceptance mechanism behind /api/health's aiCache counters), and the
 *      floor-scan never serves a suffixed question type's verdict
 *      ('BUY:breakout' / 'BUY:fallback') for a plain 'BUY' lookup.
 *   D. Retry discipline — confirmation clients cap retries via
 *      confirmationMaxRetries, the shared builder default stays 4 for
 *      everyone else, and the vision path's paid cross-provider failover is
 *      skipped while discipline is on.
 */
import { readFileSync } from 'node:fs';

// Budget knobs are read at call time by the module, but set the starting
// values BEFORE importing anything anyway.
delete process.env.AI_COST_DISCIPLINE;
process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '0.3';
process.env.AI_ENGINE_CONFIRM_EST_CENTS = '0.15';

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passes++; else failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const budget = await import('../server/services/ai-engine-budget');
const cache = await import('../server/services/ai-confirmation-cache');

// ── A. Source wiring ────────────────────────────────────────────────────────
{
  const routes = src('../server/routes.ts');
  check('A1 all three confirmation branches consult the budget gate',
    count(routes, 'engineAiBudgetAllows(token.userId)') >= 3,
    `${count(routes, 'engineAiBudgetAllows(token.userId)')} call sites`);
  check('A2 all three branches meter answered confirmations',
    count(routes, 'meterEngineAiConfirmation(token.userId') >= 3,
    `${count(routes, 'meterEngineAiConfirmation(token.userId')} call sites`);
  check('A3 budget-blocked stage is set and preserved in both gated branches',
    count(routes, "'ai_budget_blocked'") >= 4,
    `${count(routes, "'ai_budget_blocked'")} occurrences`);
  check('A4 fallback is cached under a :fallback direction suffix',
    routes.includes("`${analysis.signal}:fallback`") && routes.includes('_fbDir'));
  check('A5 budget block emits the throttled guard log',
    routes.includes('_logBudgetBlock') && routes.includes('daily AI budget reached'));
  check('A6 health still exports the default-instance cache counters',
    routes.includes('aiCache: aiConfirmationCacheStats()'));
}

// ── B. Budget behavior ──────────────────────────────────────────────────────
{
  delete process.env.AI_ENGINE_DAILY_BUDGET_CENTS;
  check('B1 discipline is on by default', budget.aiCostDisciplineEnabled() === true);
  check('B2 default cap is 200 cents ($2/day)', budget.engineAiBudgetCents() === 200);
  process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '0.3';
  check('B3 cap reads env at call time', budget.engineAiBudgetCents() === 0.3);

  const U1 = 920101, U2 = 920102;
  check('B4 fresh user is allowed', await budget.engineAiBudgetAllows(U1) === true);
  budget.meterEngineAiConfirmation(U1, 1);
  const s1 = budget.engineAiSpendToday(U1);
  check('B5 one call meters the estimate', Math.abs(s1.cents - 0.15) < 1e-9 && s1.calls === 1,
    `cents=${s1.cents} calls=${s1.calls}`);
  check('B6 still allowed under the cap', await budget.engineAiBudgetAllows(U1) === true);
  budget.meterEngineAiConfirmation(U1, 2); // deep-reasoning style: 2 units
  const s2 = budget.engineAiSpendToday(U1);
  check('B7 multi-unit metering accumulates', Math.abs(s2.cents - 0.45) < 1e-9 && s2.calls === 3,
    `cents=${s2.cents} calls=${s2.calls}`);
  check('B8 at/over the cap the gate closes', await budget.engineAiBudgetAllows(U1) === false);
  check('B9 other users are unaffected', await budget.engineAiBudgetAllows(U2) === true);

  const v = budget.engineAiBudgetVerdict();
  check('B10 budget verdict fails closed like a 402',
    v.confirmed === false && v.aiConfidence === 0 && v.aiError === true);
  check('B11 budget verdict is distinguishable from empty credits',
    v.aiErrorStatus === 'budget' && v.modelUsed === 'ai-budget-gate' &&
    typeof v.reasoning === 'string' && v.reasoning.includes('daily AI budget reached'));

  process.env.AI_COST_DISCIPLINE = 'off';
  check('B12 kill switch reports off', budget.aiCostDisciplineEnabled() === false);
  check('B13 kill switch reopens the gate', await budget.engineAiBudgetAllows(U1) === true);
  const before = budget.engineAiSpendToday(U1).cents;
  budget.meterEngineAiConfirmation(U1, 1);
  check('B14 kill switch makes metering a no-op',
    budget.engineAiSpendToday(U1).cents === before);
  delete process.env.AI_COST_DISCIPLINE;
  check('B15 removing the switch re-arms the gate',
    budget.aiCostDisciplineEnabled() === true && (await budget.engineAiBudgetAllows(U1)) === false);
}

// ── C. Verdict cache ────────────────────────────────────────────────────────
{
  const U = 920201, SYM = 'ZZTEST', TF = 'H1';
  const verdict = { confirmed: true, aiConfidence: 88, reasoning: 'check verdict' };
  check('C1 first look misses (never throttled)',
    cache.getCachedConfirmation(U, SYM, TF, 'BUY', 80, 100) === null);
  const st0 = cache.confirmationCacheStats();
  check('C2 the miss moved the health counters', st0.total >= 1 && st0.misses >= 1,
    JSON.stringify(st0));
  cache.putCachedConfirmation(U, SYM, TF, 'BUY', 80, 100, verdict);
  const hit = cache.getCachedConfirmation(U, SYM, TF, 'BUY', 80, 100);
  check('C3 stored verdict is served back with no AI call',
    !!hit && hit.verdict === verdict);
  const st1 = cache.confirmationCacheStats();
  check('C4 the hit moved the health counters', st1.hits >= 1 && st1.total > st0.total,
    JSON.stringify(st1));

  // Suffixed question types must never leak into a plain lookup via the
  // call-floor reuse path (fresh symbol where ONLY a fallback verdict exists).
  const U2 = 920202, SYM2 = 'ZZFB';
  const fbVerdict = { confirmed: false, aiConfidence: 71, reasoning: 'fallback verdict' };
  cache.putCachedConfirmation(U2, SYM2, TF, 'BUY:fallback', 80, 100, fbVerdict);
  check('C5 plain BUY lookup is NOT served the fallback verdict',
    cache.getCachedConfirmation(U2, SYM2, TF, 'BUY', 80, 100) === null);
  const fbHit = cache.getCachedConfirmation(U2, SYM2, TF, 'BUY:fallback', 80, 100);
  check('C6 fallback lookup still finds its own verdict',
    !!fbHit && fbHit.verdict === fbVerdict);

  const U3 = 920203, SYM3 = 'ZZBO';
  const boVerdict = { confirmed: true, aiConfidence: 90, reasoning: 'breakout verdict' };
  cache.putCachedConfirmation(U3, SYM3, TF, 'BUY:breakout', 80, 100, boVerdict);
  check('C7 plain BUY lookup is NOT served the breakout verdict',
    cache.getCachedConfirmation(U3, SYM3, TF, 'BUY', 80, 100) === null);
}

// ── D. Retry discipline (openai.ts source pins) ─────────────────────────────
{
  const oai = src('../server/openai.ts');
  check('D1 confirmation retry helper exists and honors the kill switch',
    oai.includes('function confirmationMaxRetries(') &&
    oai.includes("process.env.AI_COST_DISCIPLINE === 'off'"));
  check('D2 OpenRouter confirmation client is retry-capped',
    oai.includes("buildOpenAICompatClient('openrouter', apiKey, { maxRetries: confirmationMaxRetries(4) })"));
  check('D3 promoted-model vision client is retry-capped',
    oai.includes('maxRetries: confirmationMaxRetries(3)'));
  check('D4 shared builder default retry count is unchanged for other callers',
    oai.includes('maxRetries: opts?.maxRetries ?? 4'));
  check('D5 paid cross-provider failover is skipped while discipline is on',
    oai.includes("process.env.AI_COST_DISCIPLINE !== 'off' && isFailoverError(branchErr)") &&
    oai.includes('no paid cross-provider failover for a confirmation'));
}

console.log(`\n${passes} passed, ${failures} failed`);
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
