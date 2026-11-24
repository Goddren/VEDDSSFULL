/**
 * AI budget pool reserve — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-ai-budget-reserve.ts
 * (Run with DATABASE_URL unset: runtime-state persistence is best-effort
 * and degrades silently — the in-process counters are what these checks
 * exercise, same as check-ai-cost-discipline / check-ai-budget-all-engines.)
 *
 * What is pinned:
 *   A. Reserve env parsing — AI_BUDGET_RESERVE_CENTS default 100, explicit
 *      0 honored, non-numeric/negative fall back to the default; the
 *      AI_BUDGET_RESERVE kill switch reports off only on 'off'.
 *   B. Gate behavior (direct module calls) — a GENERAL lane is allowed
 *      below cap − reserve, refused AT/above it while the pool is still
 *      below the cap (reserveBlocked verdict, counted separately), and a
 *      PROTECTED lane is allowed until the full cap and refused at it
 *      (a plain cap stop, not a reserve stop). The refusal error keeps
 *      the exact 402 budget shape for both stop kinds.
 *   C. End to end through wrapEngineAiClient — lane-carrying clients
 *      meter exactly once per answered call into the lane's spend split;
 *      a reserve-stopped general call never reaches the provider; a
 *      protected call for the same user still goes through; failed
 *      provider calls are not metered in either lane.
 *   D. Kill switch / zero reserve — AI_BUDGET_RESERVE=off (or reserve 0)
 *      restores the undifferentiated pool: a general lane may spend up
 *      to the full cap, exactly the pre-reserve behavior.
 *   E. Persistence shape — a pre-reserve saved row (no reserve fields)
 *      merges cleanly with the new fields defaulting to 0; a new-shape
 *      row merges every field with max semantics; a stale-day row is
 *      ignored. Health surfaces reserveCents / reserveEnabled /
 *      reserveBlockedToday and the protected/general spend split.
 *   F. Classification pins — the four protected call sites pass the
 *      protected lane (routes.ts chart-data ×3, watch plans, Kalshi
 *      judge, crypto confirmation's shadow scope); the ensemble gates
 *      as general; representative general sites (Sol, FX Models,
 *      options, futures, crypto scanner, live-trading engine) never
 *      claim the protected lane.
 *   G. Diff scope — the reserve env name lives only in the budget module
 *      and the client layer's log line; judge/watch-plan files carry no
 *      logic changes beyond their gate/meter lane arguments.
 */
import { readFileSync } from 'node:fs';

// Budget knobs are read at call time by the module, but set the starting
// values BEFORE importing anything anyway. Round numbers on purpose:
// cap $2.00, reserve $1.00, 10¢ per metered call → the general lane's
// allowance is exactly 10 calls, the protected remainder 10 more.
delete process.env.AI_COST_DISCIPLINE;
delete process.env.AI_BUDGET_ALL_ENGINES;
delete process.env.AI_BUDGET_RESERVE;
process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '200';
process.env.AI_BUDGET_RESERVE_CENTS = '100';
process.env.AI_ENGINE_CONFIRM_EST_CENTS = '10';

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

// ── A. Reserve env parsing ────────────────────────────────────────────────
{
  delete process.env.AI_BUDGET_RESERVE_CENTS;
  check('A1 reserve defaults to 100 cents (half the default $2 pool)',
    budget.engineAiBudgetReserveCents() === 100);
  process.env.AI_BUDGET_RESERVE_CENTS = '0';
  check('A2 explicit reserve 0 is honored', budget.engineAiBudgetReserveCents() === 0);
  process.env.AI_BUDGET_RESERVE_CENTS = 'abc';
  check('A3 non-numeric reserve falls back to the default',
    budget.engineAiBudgetReserveCents() === 100);
  process.env.AI_BUDGET_RESERVE_CENTS = '-5';
  check('A4 negative reserve falls back to the default',
    budget.engineAiBudgetReserveCents() === 100);
  process.env.AI_BUDGET_RESERVE_CENTS = '250';
  check('A5 reserve above the cap is allowed (general lanes get nothing)',
    budget.engineAiBudgetReserveCents() === 250);
  process.env.AI_BUDGET_RESERVE_CENTS = '100';

  check('A6 reserve is on by default', budget.aiBudgetReserveEnabled() === true);
  process.env.AI_BUDGET_RESERVE = 'off';
  check('A7 AI_BUDGET_RESERVE=off reports off', budget.aiBudgetReserveEnabled() === false);
  delete process.env.AI_BUDGET_RESERVE;
  check('A8 removing the switch re-arms the reserve', budget.aiBudgetReserveEnabled() === true);
}

// ── B. Gate behavior, direct module calls ─────────────────────────────────
{
  const U1 = 950101;
  check('B1 fresh user: general lane allowed', (await budget.engineAiBudgetGate(U1, 'general')).allowed === true);
  check('B2 fresh user: protected lane allowed', (await budget.engineAiBudgetGate(U1, 'protected')).allowed === true);
  check('B3 engineAiBudgetAllows defaults to the general lane',
    (await budget.engineAiBudgetAllows(U1)) === true);

  for (let i = 0; i < 9; i++) budget.meterEngineAiConfirmation(U1, 1, 'general'); // 90¢ of 200¢
  check('B4 general lane allowed below cap − reserve (90 < 100)',
    (await budget.engineAiBudgetGate(U1, 'general')).allowed === true);

  budget.meterEngineAiConfirmation(U1, 1, 'general'); // 100¢ = cap − reserve
  const gGen = await budget.engineAiBudgetGate(U1, 'general');
  check('B5 general lane refused AT cap − reserve while the pool is below the cap',
    gGen.allowed === false && gGen.reserveBlocked === true,
    `spend=${budget.engineAiSpendToday(U1).cents} cap=${budget.engineAiSpendToday(U1).capCents}`);
  check('B6 protected lane still allowed at cap − reserve',
    (await budget.engineAiBudgetGate(U1, 'protected')).allowed === true);

  budget.noteEngineAiBudgetBlock(U1, { reserve: gGen.reserveBlocked });
  const s1 = budget.engineAiSpendToday(U1);
  check('B7 the reserve stop counts as blocked AND as reserveBlocked',
    s1.blocked === 1 && s1.reserveBlocked === 1, `blocked=${s1.blocked} reserveBlocked=${s1.reserveBlocked}`);
  check('B8 spend split tracks the general lane', s1.generalCents === 100 && s1.protectedCents === 0,
    `general=${s1.generalCents} protected=${s1.protectedCents}`);

  for (let i = 0; i < 9; i++) budget.meterEngineAiConfirmation(U1, 1, 'protected'); // 190¢
  check('B9 protected lane allowed below the full cap (190 < 200)',
    (await budget.engineAiBudgetGate(U1, 'protected')).allowed === true);
  budget.meterEngineAiConfirmation(U1, 1, 'protected'); // 200¢ = cap
  const gProt = await budget.engineAiBudgetGate(U1, 'protected');
  check('B10 protected lane refused AT the full cap — a cap stop, not a reserve stop',
    gProt.allowed === false && gProt.reserveBlocked === false);
  check('B11 general lane is also refused at the cap (cap stop, not reserve)',
    (await budget.engineAiBudgetGate(U1, 'general')).reserveBlocked === false);
  const s2 = budget.engineAiSpendToday(U1);
  check('B12 spend split sums to the pool total',
    s2.protectedCents === 100 && s2.generalCents === 100 && s2.cents === 200 && s2.calls === 20,
    `protected=${s2.protectedCents} general=${s2.generalCents} cents=${s2.cents} calls=${s2.calls}`);

  const err: any = budget.engineAiBudgetError();
  check('B13 the refusal error keeps the 402 budget shape (both stop kinds throw this)',
    err instanceof Error && err.status === 402 && err.aiErrorStatus === 'budget' && err.budgetBlocked === true);
}

// ── C. End to end through the shared client layer ─────────────────────────
function fakeProvider(opts?: { failWith?: any }) {
  const fake: any = {
    defaultModel: 'gpt-4o-mini',
    provider: 'fakeprov',
    calls: 0,
    chat: {
      completions: {
        create: async (_params: any) => {
          fake.calls++;
          if (opts?.failWith) throw opts.failWith;
          return { choices: [{ message: { content: '{}' } }] };
        },
      },
    },
  };
  return fake;
}
async function attempt(client: any): Promise<{ ok: boolean; status?: number; budget?: boolean }> {
  try {
    await client.chat.completions.create({ model: 'gpt-4o-mini', messages: [] });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, status: typeof e?.status === 'number' ? e.status : undefined, budget: e?.budgetBlocked === true };
  }
}
{
  const U2 = 950102;
  const genFake = fakeProvider({});
  const genClient = openaiMod.wrapEngineAiClient(genFake, U2); // default lane: general
  const r1 = await attempt(genClient);
  const s1 = budget.engineAiSpendToday(U2);
  check('C1 general client call answered; meters exactly once, into the general split',
    r1.ok && genFake.calls === 1 && s1.calls === 1 && s1.generalCents === 10 && s1.protectedCents === 0,
    `calls=${s1.calls} general=${s1.generalCents}`);

  // Fill the general allowance (9 more answered calls = 100¢ total).
  for (let i = 0; i < 9; i++) budget.meterEngineAiConfirmation(U2, 1, 'general');
  const r2 = await attempt(genClient);
  check('C2 at cap − reserve the general client is refused BEFORE the provider runs',
    !r2.ok && genFake.calls === 1 && r2.status === 402 && r2.budget === true,
    `provider calls=${genFake.calls}`);
  const s2 = budget.engineAiSpendToday(U2);
  check('C3 the reserve refusal counted as reserveBlocked, not as spend',
    s2.reserveBlocked === 1 && s2.calls === 10 && s2.cents === 100,
    `reserveBlocked=${s2.reserveBlocked} calls=${s2.calls} cents=${s2.cents}`);

  const protFake = fakeProvider({});
  const protClient = openaiMod.wrapEngineAiClient(protFake, U2, 'protected');
  const r3 = await attempt(protClient);
  const s3 = budget.engineAiSpendToday(U2);
  check('C4 the same user\'s protected client still buys from the reserve',
    r3.ok && protFake.calls === 1 && s3.protectedCents === 10 && s3.calls === 11,
    `protected=${s3.protectedCents} calls=${s3.calls}`);

  const failFake = fakeProvider({ failWith: Object.assign(new Error('boom'), { status: 500 }) });
  const failClient = openaiMod.wrapEngineAiClient(failFake, U2, 'protected');
  const r4 = await attempt(failClient);
  const s4 = budget.engineAiSpendToday(U2);
  check('C5 a failed provider call is not metered in either lane',
    !r4.ok && s4.calls === 11 && s4.protectedCents === 10 && s4.generalCents === 100);
}

// ── D. Kill switch / zero reserve restore the undifferentiated pool ───────
{
  const U3 = 950103;
  for (let i = 0; i < 15; i++) budget.meterEngineAiConfirmation(U3, 1, 'general'); // 150¢ > threshold 100
  check('D1 setup: at 150¢ the general lane is reserve-stopped',
    (await budget.engineAiBudgetGate(U3, 'general')).reserveBlocked === true);

  process.env.AI_BUDGET_RESERVE = 'off';
  const gOff = await budget.engineAiBudgetGate(U3, 'general');
  check('D2 AI_BUDGET_RESERVE=off: general lane may spend toward the full cap again',
    gOff.allowed === true && gOff.reserveBlocked === false);
  delete process.env.AI_BUDGET_RESERVE;

  process.env.AI_BUDGET_RESERVE_CENTS = '0';
  check('D3 reserve 0 is equivalent to off for the gate',
    (await budget.engineAiBudgetGate(U3, 'general')).allowed === true);
  process.env.AI_BUDGET_RESERVE_CENTS = '100';
  check('D4 restoring the reserve re-arms the protection',
    (await budget.engineAiBudgetGate(U3, 'general')).reserveBlocked === true);
}

// ── E. Persistence shape ──────────────────────────────────────────────────
{
  const today = new Date().toISOString().slice(0, 10);
  const fresh = (): any => ({ day: today, cents: 0, calls: 0, blocked: 0, reserveBlocked: 0, protectedCents: 0, generalCents: 0 });

  const oldRow: any = fresh();
  budget.applySavedEngineAiSpend(oldRow, { day: today, cents: 50, calls: 5, blocked: 2 });
  check('E1 a pre-reserve saved row loads cleanly — new fields default to 0',
    oldRow.cents === 50 && oldRow.calls === 5 && oldRow.blocked === 2 &&
    oldRow.reserveBlocked === 0 && oldRow.protectedCents === 0 && oldRow.generalCents === 0,
    JSON.stringify(oldRow));

  const newRow: any = fresh();
  newRow.cents = 30;
  budget.applySavedEngineAiSpend(newRow, { day: today, cents: 50, calls: 5, blocked: 2, reserveBlocked: 7, protectedCents: 20, generalCents: 30 });
  check('E2 a new-shape row merges every field with max semantics',
    newRow.cents === 50 && newRow.reserveBlocked === 7 && newRow.protectedCents === 20 && newRow.generalCents === 30);

  const staleRow: any = fresh();
  budget.applySavedEngineAiSpend(staleRow, { day: '1999-01-01', cents: 999, calls: 9, blocked: 9, reserveBlocked: 9 });
  check('E3 a stale-day row is ignored', staleRow.cents === 0 && staleRow.reserveBlocked === 0);

  const summary = budget.engineAiBudgetSummary();
  check('E4 health summary carries the reserve fields',
    summary.reserveCents === 100 && summary.reserveEnabled === true &&
    typeof summary.reserveBlockedToday === 'number' && summary.reserveBlockedToday >= 2 &&
    summary.protectedSpendCentsToday > 0 && summary.generalSpendCentsToday > 0,
    JSON.stringify(summary));
  const st = budget.engineAiSpendToday(950101);
  check('E5 per-user spend view carries the reserve fields',
    st.reserveCents === 100 && st.reserveEnabled === true && st.reserveBlocked === 1);
}

// ── F. Classification pins ────────────────────────────────────────────────
{
  const routes = src('../server/routes.ts');
  check('F1 FX chart-data confirmations gate as a protected lane (all 3 branches)',
    count(routes, "engineAiBudgetAllows(token.userId, 'protected')") === 3,
    `${count(routes, "engineAiBudgetAllows(token.userId, 'protected')")} sites`);
  check('F2 FX chart-data metering is stamped protected (all 3 branches)',
    routes.includes("meterEngineAiConfirmation(token.userId, 1, 'protected')") &&
    routes.includes("meterEngineAiConfirmation(token.userId, _fbUnits, 'protected')") &&
    routes.includes("meterEngineAiConfirmation(token.userId, _units, 'protected')"));

  const wp = src('../server/services/ai-watch-plans.ts');
  check('F3 watch-plan deep analyses gate + meter as protected',
    wp.includes("engineAiBudgetAllows(input.userId, 'protected')") &&
    wp.includes("meterEngineAiConfirmation(input.userId, 2, 'protected')"));

  const judge = src('../server/services/kalshi-perp-ai-judge.ts');
  check('F4 Kalshi perp judge buys through a protected engine client',
    judge.includes("getUniversalAIClientForUser(c.userId, { engine: true, engineLane: 'protected' })"));

  const confirm = src('../server/services/crypto-ai-confirmation.ts');
  check('F5 crypto confirmation: shadow scope is protected, live is general',
    confirm.includes("engineLane: opts.cacheScope ? 'protected' : 'general'"));

  const ams = src('../server/services/ai-model-service.ts');
  check('F6 the multi-model ensemble gates as a general lane and counts reserve stops',
    ams.includes("engineAiBudgetGate(userId, 'general')") &&
    ams.includes('noteEngineAiBudgetBlock(userId, { reserve: gate.reserveBlocked })'));

  const oai = src('../server/openai.ts');
  check('F7 the failover client gates + meters on the client\'s lane',
    oai.includes('engineAiBudgetGate(userId!, engineLane)') &&
    oai.includes('meterEngineAiConfirmation(userId!, 1, engineLane)') &&
    count(oai, 'engineLane?: EngineAiLane') === 3);

  for (const [name, path] of [
    ['sol-engine', '../server/services/sol-engine.ts'],
    ['fx-models', '../server/services/fx-models.ts'],
    ['options-scanner', '../server/services/options-scanner.ts'],
    ['futures-scanner', '../server/services/futures-scanner.ts'],
    ['cryptocom-scanner', '../server/services/cryptocom-scanner.ts'],
    ['live-trading-engine', '../server/services/live-trading-engine.ts'],
  ] as Array<[string, string]>) {
    check(`F8 general site never claims the protected lane: ${name}`,
      !src(path).includes("engineLane: 'protected'") && !src(path).includes("'protected'"));
  }
}

// ── G. Diff scope ─────────────────────────────────────────────────────────
{
  for (const [name, path] of [
    ['sol-engine', '../server/services/sol-engine.ts'],
    ['fx-models', '../server/services/fx-models.ts'],
    ['options-scanner', '../server/services/options-scanner.ts'],
    ['futures-scanner', '../server/services/futures-scanner.ts'],
    ['cryptocom-scanner', '../server/services/cryptocom-scanner.ts'],
    ['live-trading-engine', '../server/services/live-trading-engine.ts'],
    ['kalshi-perp-ai-judge', '../server/services/kalshi-perp-ai-judge.ts'],
    ['crypto-shadow', '../server/services/crypto-shadow.ts'],
    ['ai-watch-plans', '../server/services/ai-watch-plans.ts'],
  ] as Array<[string, string]>) {
    check(`G1 reserve env name stays out of engine/judge/plan logic: ${name}`,
      !src(path).includes('AI_BUDGET_RESERVE'));
  }
  const wp = src('../server/services/ai-watch-plans.ts');
  check('G2 watch-plan service changes are only the gate/meter lane arguments',
    count(wp, "'protected'") === 2 && wp.includes('buildWatchPlanPrompt'));
  const judge = src('../server/services/kalshi-perp-ai-judge.ts');
  check('G3 Kalshi judge changes are only the client lane argument',
    count(judge, 'engineLane') === 1 && judge.includes('buildJudgePrompt'));
}

console.log(`\n${passes} passed, ${failures} failed`);
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
