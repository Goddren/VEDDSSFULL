/**
 * AI budget on all engines — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-ai-budget-all-engines.ts
 * (Run with DATABASE_URL unset: the budget module's runtime_state
 * persistence is best-effort and degrades silently — the in-process
 * counters are what these checks exercise, same as check-ai-cost-discipline.)
 *
 * What is pinned:
 *   A. Source wiring — the shared failover client gates engine-marked
 *      calls BEFORE the provider loop and meters once at the success
 *      return; both builders accept opts.engine (default off); the raw
 *      economy-Groq overrides are wrapped; every autonomous engine call
 *      site opts in; NO user-interactive call site does; ai-model-service
 *      has the entry gate + the exactly-once carve-out; /api/health
 *      surfaces the budget summary.
 *   B. Behavior (via wrapEngineAiClient around fake providers) — an
 *      answered engine call meters exactly 1 unit; at the cap the next
 *      call is refused BEFORE the provider is invoked, with an error
 *      indistinguishable in shape from a provider 402; failed provider
 *      calls are not metered; per-user isolation; blocked counting.
 *   C. Kill switches — AI_BUDGET_ALL_ENGINES=off makes engine marking
 *      inert while the FX chart-data gate keeps blocking (PR #101 scope
 *      preserved); AI_COST_DISCIPLINE=off disables everything.
 *   D. Double-count audit — the chart-data confirmation internals inside
 *      openai.ts stay UNMARKED (the route remains their only meter), and
 *      a multi-model call through the engine-marked universal client
 *      meters exactly once end to end.
 */
import { readFileSync } from 'node:fs';

// Budget knobs are read at call time by the module, but set the starting
// values BEFORE importing anything anyway.
delete process.env.AI_COST_DISCIPLINE;
delete process.env.AI_BUDGET_ALL_ENGINES;
process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '0.3';
process.env.AI_ENGINE_CONFIRM_EST_CENTS = '0.15';
// Pool reserve (2026-11-23): this suite predates the reserve and tests the
// undifferentiated pool — pin the reserve to 0 so its behavior sections
// keep their original meaning. The reserve itself is covered by
// check-ai-budget-reserve.ts.
process.env.AI_BUDGET_RESERVE_CENTS = '0';

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passes++; else failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const budget = await import('../server/services/ai-engine-budget');
const openaiMod = await import('../server/openai');

// ── A. Source wiring ────────────────────────────────────────────────────────
{
  const oai = src('../server/openai.ts');
  check('A1 failover client gates engine calls on the budget',
    oai.includes('aiBudgetAllEnginesEnabled()') && oai.includes('engineAiBudgetGate(userId!, engineLane)') &&
    oai.includes('throw engineAiBudgetError()'));
  check('A2 the gate runs BEFORE any provider call is bought',
    oai.indexOf('throw engineAiBudgetError()') > -1 &&
    oai.indexOf('throw engineAiBudgetError()') < oai.indexOf('for (let i = 0; i < clients.length; i++)'));
  check('A3 answered engine calls meter once at the success return',
    oai.includes('meterEngineAiConfirmation(userId!, 1, engineLane)'));
  check('A4 both builders accept opts.engine (default off)',
    count(oai, 'opts?: { critical?: boolean; engine?: boolean; engineLane?: EngineAiLane }') === 2 &&
    count(oai, 'makeFailoverClient(clients, userId, { engine: !!opts?.engine, engineLane: opts?.engineLane })') === 2);
  check('A5 wrapEngineAiClient is exported for raw engine clients',
    oai.includes('export function wrapEngineAiClient') &&
    oai.includes('makeFailoverClient([client], userId, { engine: true, engineLane: lane })'));

  const engineSites: Array<[string, string]> = [
    ['live-trading-engine', '../server/services/live-trading-engine.ts'],
    ['futures-scanner', '../server/services/futures-scanner.ts'],
    ['options-scanner', '../server/services/options-scanner.ts'],
    ['crypto-ai-confirmation', '../server/services/crypto-ai-confirmation.ts'],
    ['cryptocom-scanner', '../server/services/cryptocom-scanner.ts'],
    ['fx-models', '../server/services/fx-models.ts'],
    ['sol-engine', '../server/services/sol-engine.ts'],
  ];
  for (const [name, path] of engineSites) {
    check(`A6 engine call site opts in: ${name}`, src(path).includes('engine: true'));
  }
  for (const [name, path] of [
    ['live-trading-engine', '../server/services/live-trading-engine.ts'],
    ['futures-scanner', '../server/services/futures-scanner.ts'],
    ['sol-engine', '../server/services/sol-engine.ts'],
  ] as Array<[string, string]>) {
    check(`A7 economy-Groq override is wrapped: ${name}`, src(path).includes('wrapEngineAiClient('));
  }
  for (const [name, path] of [
    ['abba-strategist', '../server/abba-strategist.ts'],
    ['clipper', '../server/services/clipper.ts'],
    ['explainer-video', '../server/services/explainer-video.ts'],
    ['video-audio', '../server/services/video-audio.ts'],
    ['video-shot', '../server/services/video-shot.ts'],
    ['abba-ea-generator', '../server/services/abba-ea-generator.ts'],
    ['ambassador-post-queue', '../server/services/ambassador-post-queue.ts'],
  ] as Array<[string, string]>) {
    check(`A8 interactive call site is NOT budget-gated: ${name}`, !src(path).includes('engine: true'));
  }

  const ams = src('../server/services/ai-model-service.ts');
  check('A9 ai-model-service gates the ensemble before buying any model call',
    ams.includes('aiBudgetAllEnginesEnabled()') && ams.includes('throw budgetMod.engineAiBudgetError()'));
  check('A10 ai-model-service meters direct providers with the exactly-once carve-out',
    ams.includes("modelDef.provider === 'openai' && openaiInstance") &&
    ams.includes('budgetMod.meterEngineAiConfirmation(userId, 1)'));

  const routes = src('../server/routes.ts');
  check('A11 /api/health surfaces the budget summary',
    routes.includes('aiEngineBudget') && routes.includes('engineAiBudgetSummary'));
}

// ── B. Behavior through the shared layer ────────────────────────────────────
function fakeProvider(opts?: { failWith?: any; content?: string; withUsage?: boolean }) {
  const fake: any = {
    defaultModel: 'gpt-4o-mini',
    provider: 'fakeprov',
    calls: 0,
    chat: {
      completions: {
        create: async (_params: any) => {
          fake.calls++;
          if (opts?.failWith) throw opts.failWith;
          const out: any = { choices: [{ message: { content: opts?.content ?? '{}' } }] };
          if (opts?.withUsage) out.usage = { prompt_tokens: 10, completion_tokens: 5 };
          return out;
        },
      },
    },
  };
  return fake;
}
// Caller harness shaped like the engines' own call sites: any throw from
// create() is a provider failure and produces the same fallback outcome.
async function engineStyleAttempt(client: any): Promise<{ ok: boolean; status?: number }> {
  try {
    await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [] });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, status: typeof e?.status === 'number' ? e.status : undefined };
  }
}

{
  const U1 = 930101, U2 = 930102, U3 = 930103;
  const fake = fakeProvider({ withUsage: true });
  const client = openaiMod.wrapEngineAiClient(fake, U1);

  const r1 = await engineStyleAttempt(client);
  const s1 = budget.engineAiSpendToday(U1);
  check('B1 first engine call is answered and meters exactly 1 unit',
    r1.ok && fake.calls === 1 && s1.calls === 1 && Math.abs(s1.cents - 0.15) < 1e-9,
    `calls=${s1.calls} cents=${s1.cents}`);
  const r2 = await engineStyleAttempt(client);
  const s2 = budget.engineAiSpendToday(U1);
  check('B2 second call reaches the cap exactly',
    r2.ok && fake.calls === 2 && s2.calls === 2 && Math.abs(s2.cents - 0.3) < 1e-9,
    `calls=${s2.calls} cents=${s2.cents}`);

  const r3 = await engineStyleAttempt(client);
  const s3 = budget.engineAiSpendToday(U1);
  check('B3 at the cap the call is refused BEFORE the provider is invoked',
    !r3.ok && fake.calls === 2, `provider calls=${fake.calls}`);
  check('B4 the refusal counts as blocked, not as spend',
    s3.blocked === 1 && s3.calls === 2 && Math.abs(s3.cents - 0.3) < 1e-9,
    `blocked=${s3.blocked}`);

  // The budget refusal must be indistinguishable from a provider failure:
  // same harness, same outcome shape as a real provider 402.
  const providerErr: any = new Error('402 Insufficient credits'); providerErr.status = 402;
  const failing = openaiMod.wrapEngineAiClient(fakeProvider({ failWith: providerErr }), U3);
  const providerOutcome = await engineStyleAttempt(failing);
  check('B5 budget block is indistinguishable from a provider 402 to callers',
    r3.ok === providerOutcome.ok && r3.status === 402 && providerOutcome.status === 402,
    `budget=${JSON.stringify(r3)} provider=${JSON.stringify(providerOutcome)}`);
  let thrown: any = null;
  try { await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [] }); } catch (e: any) { thrown = e; }
  check('B6 the thrown refusal is an Error carrying the provider-failure shape',
    thrown instanceof Error && thrown.status === 402 && thrown.budgetBlocked === true &&
    thrown.aiErrorStatus === 'budget');

  const sU3 = budget.engineAiSpendToday(U3);
  check('B7 a failed provider call is NOT metered',
    sU3.calls === 0 && sU3.cents === 0, `calls=${sU3.calls} cents=${sU3.cents}`);

  const noUsage = openaiMod.wrapEngineAiClient(fakeProvider({}), U2);
  const rn = await engineStyleAttempt(noUsage);
  const sU2 = budget.engineAiSpendToday(U2);
  check('B8 an answered call meters once even without a usage block',
    rn.ok && sU2.calls === 1 && Math.abs(sU2.cents - 0.15) < 1e-9,
    `calls=${sU2.calls} cents=${sU2.cents}`);
  check('B9 per-user isolation: U2 is unaffected by U1 being capped',
    (await budget.engineAiBudgetAllows(U2)) === true && (await budget.engineAiBudgetAllows(U1)) === false);
}

// ── C. Kill switches ────────────────────────────────────────────────────────
{
  const U1 = 930101;
  const fake = fakeProvider({});
  const client = openaiMod.wrapEngineAiClient(fake, U1);

  process.env.AI_BUDGET_ALL_ENGINES = 'off';
  check('C1 scope switch reports off', budget.aiBudgetAllEnginesEnabled() === false);
  const before = budget.engineAiSpendToday(U1);
  const rOff = await engineStyleAttempt(client);
  const after = budget.engineAiSpendToday(U1);
  check('C2 AI_BUDGET_ALL_ENGINES=off: engine marking is inert (call proceeds, no metering)',
    rOff.ok && fake.calls === 1 && after.cents === before.cents && after.calls === before.calls);
  check('C3 AI_BUDGET_ALL_ENGINES=off: the FX chart-data gate still blocks (PR #101 scope)',
    (await budget.engineAiBudgetAllows(U1)) === false);
  delete process.env.AI_BUDGET_ALL_ENGINES;
  check('C4 removing the scope switch re-arms the engine gate',
    budget.aiBudgetAllEnginesEnabled() === true && (await engineStyleAttempt(client)).ok === false);

  process.env.AI_COST_DISCIPLINE = 'off';
  const rKill = await engineStyleAttempt(client);
  check('C5 AI_COST_DISCIPLINE=off disables the engine gate too',
    rKill.ok && (await budget.engineAiBudgetAllows(U1)) === true);
  delete process.env.AI_COST_DISCIPLINE;
  check('C6 removing the kill switch re-arms everything',
    budget.aiCostDisciplineEnabled() === true && (await budget.engineAiBudgetAllows(U1)) === false);
}

// ── D. Double-count audit ───────────────────────────────────────────────────
{
  const oai = src('../server/openai.ts');
  check('D1 chart-data confirmation internals stay UNMARKED (route is their only meter)',
    oai.includes('getUniversalAIClientForUser(userId, { critical: true })') &&
    oai.includes('getUniversalAIClientForUser(userId || 0, { critical: true })') &&
    !oai.includes('{ critical: true, engine: true }'));

  // End to end: a multi-model ensemble call whose openai provider runs
  // through the engine-marked universal client must meter EXACTLY once —
  // at the client layer, not again in ai-model-service's callModel.
  const { runMultiModelAnalysis } = await import('../server/services/ai-model-service');
  const U4 = 930104;
  const fake = fakeProvider({ content: '{"decisions": []}' });
  const instance = openaiMod.wrapEngineAiClient(fake, U4);
  const routing: any = {
    mode: 'single', primaryModelId: 'openai-gpt4o-mini', ensembleModelIds: [],
    strategyAssignments: {}, fallbackOrder: [], ensembleMinAgreement: 60, enabled: true,
  };
  const res = await runMultiModelAnalysis(U4, 'sys', 'user', routing, instance);
  const sU4 = budget.engineAiSpendToday(U4);
  check('D2 ensemble call through the engine-marked client meters exactly once',
    Array.isArray(res.decisions) && fake.calls === 1 && sU4.calls === 1 && Math.abs(sU4.cents - 0.15) < 1e-9,
    `provider calls=${fake.calls} metered calls=${sU4.calls} cents=${sU4.cents}`);

  // And a capped user's ensemble buys nothing: the entry gate refuses
  // before any provider invocation (the ensemble's own catch converts
  // the refusal to its standard empty-result failure shape).
  const U1 = 930101;
  const fakeCapped = fakeProvider({ content: '{"decisions": []}' });
  const cappedInstance = openaiMod.wrapEngineAiClient(fakeCapped, U1);
  const resCapped = await runMultiModelAnalysis(U1, 'sys', 'user', routing, cappedInstance);
  check('D3 a capped user\'s ensemble is refused before any provider call',
    fakeCapped.calls === 0 && resCapped.decisions.length === 0,
    `provider calls=${fakeCapped.calls}`);

  const summary = budget.engineAiBudgetSummary();
  check('D4 health summary aggregates the same counters',
    summary.allEngines === true && summary.capCentsPerUser === 0.3 &&
    summary.callsToday >= 3 && summary.blockedToday >= 1,
    JSON.stringify(summary));
}

console.log(`\n${passes} passed, ${failures} failed`);
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
