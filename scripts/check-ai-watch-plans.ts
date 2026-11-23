/**
 * AI watch-plan engine verification checks (2026-11-23).
 *
 * Run:  node --import tsx/esm scripts/check-ai-watch-plans.ts
 * (Run with DATABASE_URL unset, like the other AI cost suites: the store
 * seam replaces runtime_state, and the budget module must degrade to its
 * in-process counters.)
 *
 * What is pinned:
 *   1. Plan schema validation — well-formed plans (BUY and SELL mirrors)
 *      pass; bad geometry, corrupt prices, out-of-band expiry, unknown
 *      trigger types and symbol mismatches are rejected; a corrupt plan
 *      sitting in the store is discarded on read, never trusted.
 *   2. Deterministic trigger evaluation on candle fixtures — every
 *      trigger type fires on its candle and stays silent on the wrong
 *      candle/level; invalidation retires marginally, a blow-through is
 *      a structure break; expiry is honored.
 *   3. Watching is FREE — after the one creating deep call, repeated
 *      posts against a live untriggered plan buy ZERO further AI calls.
 *   4. A fired trigger falls through (the route then buys its ONE
 *      confirmation through the existing path) and never re-buys a deep
 *      analysis; structural pins prove the route's plan hook sits BEFORE
 *      the existing AI gate, folds into the existing _skipAi no-trade
 *      shape, and that every guard on the path is still present and
 *      unaltered (brain gate, EA confidence gate 80, dual-vote/SMC
 *      decision block, signal-quality guard, Gate 0) — the plan layer
 *      itself never touches the signal, the trade plan, or execution.
 *   5. Kill switch AI_WATCH_PLANS=off — the service reports disabled and
 *      the route only ever calls the resolver inside the enabled check.
 *   6. Fallbacks — store throw / deep-call failure / unparseable reply /
 *      invalid plan geometry / no-plan answer all abstain (today's path)
 *      with no throw escaping the resolver.
 *   7. Re-plan discipline — the per-pair deep-analysis cooldown is
 *      enforced after retirement AND after a no-plan answer; expiry
 *      retires a plan and a fresh plan is only bought after cooldown.
 *   8. Metering — a deep analysis meters EXACTLY ONCE at 2 units through
 *      the shared pool (observed on the budget counters via a fake
 *      client); a failed call meters nothing; a dry pool refuses before
 *      any call; the service never builds an engine-marked client (no
 *      double-count). Diff scope: no brain / trail / improvement /
 *      judge / other-engine files are touched by this branch.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passes++; else failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const wp = await import('../server/services/ai-watch-plans');
const budget = await import('../server/services/ai-engine-budget');

const routesSrc = src('../server/routes.ts');
const svcSrc = src('../server/services/ai-watch-plans.ts');
const engineSrc = src('../server/services/live-trading-engine.ts');

// ── Fixtures ────────────────────────────────────────────────────────────────
const T0 = 1_700_000_000_000;
const CTX = { userId: 42, symbol: 'EURUSD', timeframe: 'M15', currentPrice: 1.1, now: T0, id: 'wp_test' };
const PLAN_FIELDS: Record<string, any> = {
  direction: 'BUY', pattern: 'engulfing at a key level',
  entryZoneLow: 1.099, entryZoneHigh: 1.101,
  triggerType: 'engulfing', triggerLevel: 1.1,
  stopLoss: 1.095, takeProfit: 1.11, invalidation: 1.096,
  expiryMinutes: 120, confidence: 72, rationale: 'fixture',
};
const planJson = (over: Record<string, any> = {}) =>
  JSON.stringify({ plan: { ...PLAN_FIELDS, ...over } });

const WATCH = [
  // Quiet drift — deliberately NOT an engulfing: the last candle opens
  // ABOVE the previous close, so it cannot engulf the previous body.
  { o: 1.10005, h: 1.10035, l: 1.09985, c: 1.10015 },
  { o: 1.1001, h: 1.1004, l: 1.0998, c: 1.1 },
  { o: 1.1, h: 1.1003, l: 1.0997, c: 1.1001 },
];
const TRIG_ENGULF = [
  { o: 1.0994, h: 1.1012, l: 1.0993, c: 1.1008 },
  { o: 1.1005, h: 1.1006, l: 1.0994, c: 1.0995 },
  { o: 1.1002, h: 1.1007, l: 1.0999, c: 1.1004 },
];
const INV_MARGINAL = [{ o: 1.097, h: 1.0972, l: 1.0952, c: 1.0955 }, ...WATCH.slice(1)];
const INV_BLOWN = [{ o: 1.095, h: 1.0952, l: 1.0938, c: 1.094 }, ...WATCH.slice(1)];

function memStore() {
  const data = new Map<number, any>();
  return {
    data,
    async load(u: number) { return data.get(u) ?? null; },
    async save(u: number, b: any) { data.set(u, JSON.parse(JSON.stringify(b))); },
  };
}
const mkInput = (userId: number, candles: any[]) => ({
  userId, symbol: 'EURUSD', timeframe: 'M15', candles,
  currentPrice: candles[0].c, indicators: {},
  engineRead: { signal: 'NEUTRAL', confidence: 50, trend: 'range', patterns: [] as string[] },
  sessionLabel: 'London',
});

// ── 1. Schema validation ────────────────────────────────────────────────────
{
  const buy = wp.planFromFields(PLAN_FIELDS, CTX);
  check('1.1 well-formed BUY plan validates', !!buy && buy.direction === 'BUY' && buy.status === 'watching');
  const sell = wp.planFromFields({
    ...PLAN_FIELDS, direction: 'SELL', stopLoss: 1.105, takeProfit: 1.09, invalidation: 1.104,
  }, CTX);
  check('1.2 well-formed SELL mirror validates', !!sell && sell.direction === 'SELL');
  check('1.3 fraction confidence rescales to 0–100',
    wp.planFromFields({ ...PLAN_FIELDS, confidence: 0.72 }, CTX)?.confidence === 72);
  check('1.4 expiry clamps into the 15m–8h band',
    (wp.planFromFields({ ...PLAN_FIELDS, expiryMinutes: 99999 }, CTX)?.expiresAt ?? 0) - T0 === wp.PLAN_MAX_EXPIRY_MS &&
    (wp.planFromFields({ ...PLAN_FIELDS, expiryMinutes: 1 }, CTX)?.expiresAt ?? 0) - T0 === wp.PLAN_MIN_EXPIRY_MS);
  check('1.5 BUY with stop above the zone is rejected',
    wp.planFromFields({ ...PLAN_FIELDS, stopLoss: 1.102 }, CTX) === null);
  check('1.6 BUY with target below the zone is rejected',
    wp.planFromFields({ ...PLAN_FIELDS, takeProfit: 1.098 }, CTX) === null);
  const good = wp.planFromFields(PLAN_FIELDS, CTX)!;
  check('1.7 corrupt price (PR #96 print) is rejected',
    wp.validateWatchPlan({ ...good, takeProfit: 9.24e14 }, { symbol: 'EURUSD', currentPrice: 1.1, now: T0 }) === null);
  check('1.8 out-of-band stored expiry is rejected',
    wp.validateWatchPlan({ ...good, expiresAt: T0 + 10 * 3_600_000 }, { symbol: 'EURUSD', currentPrice: 1.1, now: T0 }) === null &&
    wp.validateWatchPlan({ ...good, expiresAt: T0 + 5 * 60_000 }, { symbol: 'EURUSD', currentPrice: 1.1, now: T0 }) === null);
  check('1.9 unknown trigger type is rejected',
    wp.validateWatchPlan({ ...good, trigger: { type: 'magic_candle', level: 1.1 } }, { symbol: 'EURUSD', currentPrice: 1.1, now: T0 }) === null);
  check('1.10 symbol mismatch is rejected',
    wp.validateWatchPlan(good, { symbol: 'GBPUSD', currentPrice: 1.1, now: T0 }) === null);
  check('1.11 garbage is rejected', wp.validateWatchPlan({ nope: true }, { symbol: 'EURUSD', currentPrice: 1.1, now: T0 }) === null);
}

// ── 2. Deterministic trigger evaluation ─────────────────────────────────────
{
  const buy = wp.planFromFields(PLAN_FIELDS, CTX)!;
  check('2.1 quiet candles keep watching', wp.evaluateWatchPlan(buy, WATCH, T0 + 60_000) === 'watching');
  check('2.2 engulfing trigger fires', wp.evaluateWatchPlan(buy, TRIG_ENGULF, T0 + 60_000) === 'triggered');
  const highLevel = wp.planFromFields({ ...PLAN_FIELDS, triggerLevel: 1.101 }, CTX)!;
  check('2.3 engulfing that does not reach the level stays watching',
    wp.evaluateWatchPlan(highLevel, TRIG_ENGULF, T0 + 60_000) === 'watching');
  check('2.4 marginal invalidation cross retires as invalidated',
    wp.evaluateWatchPlan(buy, INV_MARGINAL, T0 + 60_000) === 'invalidated');
  check('2.5 blow-through invalidation is a structure break',
    wp.evaluateWatchPlan(buy, INV_BLOWN, T0 + 60_000) === 'structure_break');
  check('2.6 expiry is honored', wp.evaluateWatchPlan(buy, WATCH, T0 + 121 * 60_000) === 'expired');

  const cbl = wp.planFromFields({ ...PLAN_FIELDS, triggerType: 'close_beyond_level' }, CTX)!;
  check('2.7 close_beyond_level fires on the cross',
    wp.evaluateWatchPlan(cbl, [{ o: 1.0999, h: 1.1007, l: 1.0998, c: 1.1005 }, { o: 1.0997, h: 1.1, l: 1.0995, c: 1.0998 }], T0 + 60_000) === 'triggered');
  check('2.8 close_beyond_level needs an actual cross (already above = watching)',
    wp.evaluateWatchPlan(cbl, [{ o: 1.1004, h: 1.1007, l: 1.1002, c: 1.1005 }, { o: 1.1001, h: 1.1004, l: 1.0999, c: 1.1002 }], T0 + 60_000) === 'watching');

  const pin = wp.planFromFields({ ...PLAN_FIELDS, triggerType: 'pin_bar' }, CTX)!;
  check('2.9 pin bar fires on wick rejection at the level',
    wp.evaluateWatchPlan(pin, [{ o: 1.1002, h: 1.1004, l: 1.0988, c: 1.1001 }, ...WATCH.slice(1)], T0 + 60_000) === 'triggered');
  check('2.10 big-body candle is not a pin bar',
    wp.evaluateWatchPlan(pin, [{ o: 1.0996, h: 1.1009, l: 1.0995, c: 1.1008 }, ...WATCH.slice(1)], T0 + 60_000) === 'watching');

  const ibb = wp.planFromFields({ ...PLAN_FIELDS, triggerType: 'inside_bar_break', triggerLevel: 1.1006 }, CTX)!;
  check('2.11 inside-bar break fires through the mother high',
    wp.evaluateWatchPlan(ibb, [
      { o: 1.1003, h: 1.101, l: 1.1002, c: 1.1008 },
      { o: 1.1, h: 1.1005, l: 1.0996, c: 1.1003 },
      { o: 1.0998, h: 1.1006, l: 1.0994, c: 1.1002 },
    ], T0 + 60_000) === 'triggered');
  check('2.12 inside bar that does not break stays watching',
    wp.evaluateWatchPlan(ibb, [
      { o: 1.1001, h: 1.1005, l: 1.0999, c: 1.1004 },
      { o: 1.1, h: 1.1005, l: 1.0996, c: 1.1003 },
      { o: 1.0998, h: 1.1006, l: 1.0994, c: 1.1002 },
    ], T0 + 60_000) === 'watching');

  const ret = wp.planFromFields({ ...PLAN_FIELDS, triggerType: 'retest_level' }, CTX)!;
  check('2.13 retest fires after break-away, return, and hold',
    wp.evaluateWatchPlan(ret, [
      { o: 1.1003, h: 1.1006, l: 1.0999, c: 1.1004 },
      { o: 1.1012, h: 1.1018, l: 1.101, c: 1.1015 },
      { o: 1.1008, h: 1.1012, l: 1.1005, c: 1.101 },
    ], T0 + 60_000) === 'triggered');
  check('2.14 touch without a prior break-away is not a retest',
    wp.evaluateWatchPlan(ret, [
      { o: 1.1002, h: 1.1004, l: 1.0999, c: 1.1003 },
      { o: 1.1001, h: 1.1004, l: 1.0999, c: 1.1002 },
      { o: 1.1, h: 1.1003, l: 1.0998, c: 1.1001 },
    ], T0 + 60_000) === 'watching');
}

// ── 3 + 4. Resolver: create → watch free → trigger falls through ────────────
{
  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  let deepCalls = 0;
  let now = T0;
  const deps = {
    now: () => now,
    callDeep: async () => { deepCalls++; return { content: planJson(), model: 'fake' }; },
  };
  const u = 9101;
  const r1 = await wp.resolveWatchPlanForPost(mkInput(u, WATCH), deps);
  check('3.1 first post creates a plan and watches', r1.action === 'watch' && deepCalls === 1);
  let allWatch = true;
  for (let i = 0; i < 5; i++) {
    now += 60_000;
    const r = await wp.resolveWatchPlanForPost(mkInput(u, WATCH), deps);
    if (r.action !== 'watch') allWatch = false;
  }
  check('3.2 five more watching posts buy ZERO further AI calls', allWatch && deepCalls === 1, `deepCalls=${deepCalls}`);
  const s1 = wp.aiWatchPlansSummary();
  check('3.3 summary shows 1 created / 1 deep call',
    s1.created === 1 && s1.deepCallsToday === 1);

  now += 60_000;
  const rt = await wp.resolveWatchPlanForPost(mkInput(u, TRIG_ENGULF), deps);
  check('4.1 trigger post falls through to the existing chain', rt.action === 'fallthrough' && deepCalls === 1);
  now += 60_000;
  const rt2 = await wp.resolveWatchPlanForPost(mkInput(u, TRIG_ENGULF), deps);
  const s2 = wp.aiWatchPlansSummary();
  check('4.2 repeated triggered posts keep falling through, trigger counted once, no new deep call',
    rt2.action === 'fallthrough' && deepCalls === 1 && s2.triggered === 1);
  wp.noteWatchPlanConfirmed(u);
  check('4.3 confirmation note lands on the health counters', wp.aiWatchPlansSummary().confirmed === 1);
}

// ── 3b. Active-plan count on the wall clock (what /api/health reports) ──────
{
  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  const r = await wp.resolveWatchPlanForPost(mkInput(9100, WATCH), {
    callDeep: async () => ({ content: planJson(), model: 'fake' }),
  });
  check('3.4 a live plan counts as active on /api/health',
    r.action === 'watch' && wp.aiWatchPlansSummary().activePlans === 1);
}

// ── 4b. Born triggered ──────────────────────────────────────────────────────
{
  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  const r = await wp.resolveWatchPlanForPost(mkInput(9102, TRIG_ENGULF), {
    now: () => T0,
    callDeep: async () => ({ content: planJson(), model: 'fake' }),
  });
  const s = wp.aiWatchPlansSummary();
  check('4.4 a plan whose trigger already formed is born triggered (same-cycle fallthrough)',
    r.action === 'fallthrough' && s.created === 1 && s.triggered === 1);
}

// ── 5. Kill switch ──────────────────────────────────────────────────────────
{
  process.env.AI_WATCH_PLANS = 'off';
  check('5.1 AI_WATCH_PLANS=off disables the layer', wp.watchPlansEnabled() === false && wp.aiWatchPlansSummary().enabled === false);
  delete process.env.AI_WATCH_PLANS;
  check('5.2 default is ON', wp.watchPlansEnabled() === true);
  const hookAt = routesSrc.indexOf('resolveWatchPlanForPost');
  const gateAt = routesSrc.indexOf("if (!_skipAi && analysis.signal !== 'NEUTRAL'");
  check('5.3 route calls the resolver only behind watchPlansEnabled()',
    routesSrc.slice(Math.max(0, hookAt - 400), hookAt).includes('watchPlansEnabled()'));
  check('5.4 plan hook sits BEFORE the existing AI gate', hookAt > 0 && gateAt > hookAt);
}

// ── 6. Fallbacks ────────────────────────────────────────────────────────────
{
  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck({
    async load() { throw new Error('store down'); },
    async save() { /* unreachable */ },
  });
  const rStore = await wp.resolveWatchPlanForPost(mkInput(9103, WATCH), {
    now: () => T0, callDeep: async () => ({ content: planJson(), model: 'fake' }),
  });
  check('6.1 store throw → abstain, nothing escapes', rStore.action === 'abstain');

  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  const rThrow = await wp.resolveWatchPlanForPost(mkInput(9104, WATCH), {
    now: () => T0, callDeep: async () => { throw new Error('provider 402'); },
  });
  check('6.2 deep-call failure → abstain', rThrow.action === 'abstain');

  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  const rBad = await wp.resolveWatchPlanForPost(mkInput(9105, WATCH), {
    now: () => T0, callDeep: async () => ({ content: 'the market looks nice today', model: 'fake' }),
  });
  check('6.3 unparseable deep reply → abstain + fallback counted',
    rBad.action === 'abstain' && wp.aiWatchPlansSummary().fallbacks >= 1);

  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  const rGeom = await wp.resolveWatchPlanForPost(mkInput(9106, WATCH), {
    now: () => T0, callDeep: async () => ({ content: planJson({ stopLoss: 1.102 }), model: 'fake' }),
  });
  check('6.4 invalid plan geometry from the AI → abstain, no plan stored',
    rGeom.action === 'abstain' && wp.aiWatchPlansSummary().activePlans === 0);

  wp.__resetWatchPlansForCheck();
  const store = memStore();
  const good = wp.planFromFields(PLAN_FIELDS, CTX)!;
  store.data.set(9107, { plans: { EURUSD: { ...good, takeProfit: 9.24e14 } }, lastDeepAt: {} });
  wp.__setWatchPlanStoreForCheck(store);
  let deepCalls = 0;
  const rCorrupt = await wp.resolveWatchPlanForPost(mkInput(9107, WATCH), {
    now: () => T0,
    callDeep: async () => { deepCalls++; return { content: planJson(), model: 'fake' }; },
  });
  check('6.5 corrupt stored plan is discarded and replaced, never trusted',
    rCorrupt.action === 'watch' && deepCalls === 1);
}

// ── 7. Cooldown + expiry re-plan discipline ─────────────────────────────────
{
  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  let deepCalls = 0;
  let now = T0;
  const deps = {
    now: () => now,
    callDeep: async () => { deepCalls++; return { content: planJson({ expiryMinutes: 30 }), model: 'fake' }; },
  };
  const u = 9108;
  await wp.resolveWatchPlanForPost(mkInput(u, WATCH), deps);
  now = T0 + 5 * 60_000;
  const rInv = await wp.resolveWatchPlanForPost(mkInput(u, INV_MARGINAL), deps);
  check('7.1 invalidation retires the plan; same-post re-plan is cooldown-blocked (abstain)',
    rInv.action === 'abstain' && deepCalls === 1 && wp.aiWatchPlansSummary().invalidated === 1);
  now = T0 + 10 * 60_000;
  const rCool = await wp.resolveWatchPlanForPost(mkInput(u, WATCH), deps);
  check('7.2 still inside the 15m cooldown → abstain, no deep call', rCool.action === 'abstain' && deepCalls === 1);
  now = T0 + 16 * 60_000;
  const rRe = await wp.resolveWatchPlanForPost(mkInput(u, WATCH), deps);
  check('7.3 after the cooldown a fresh plan is bought', rRe.action === 'watch' && deepCalls === 2);
  now = T0 + 16 * 60_000 + 31 * 60_000; // past the new plan's 30m expiry AND the cooldown
  const rExp = await wp.resolveWatchPlanForPost(mkInput(u, WATCH), deps);
  const s = wp.aiWatchPlansSummary();
  check('7.4 expired plan retires and (cooldown served) is replaced',
    rExp.action === 'watch' && s.expired === 1 && deepCalls === 3);

  wp.__resetWatchPlansForCheck();
  wp.__setWatchPlanStoreForCheck(memStore());
  let npCalls = 0;
  let npNow = T0;
  const npDeps = {
    now: () => npNow,
    callDeep: async () => { npCalls++; return { content: JSON.stringify({ noPlan: true, reason: 'chop' }), model: 'fake' }; },
  };
  const a1 = await wp.resolveWatchPlanForPost(mkInput(9109, WATCH), npDeps);
  npNow = T0 + 5 * 60_000;
  const a2 = await wp.resolveWatchPlanForPost(mkInput(9109, WATCH), npDeps);
  check('7.5 a no-plan answer also starts the cooldown (no re-buy churn)',
    a1.action === 'abstain' && a2.action === 'abstain' && npCalls === 1);
}

// ── 8. Metering exactly once + guard-chain / scope pins ─────────────────────
{
  const u = 990001;
  const before = budget.engineAiSpendToday(u);
  const fakeClient = {
    defaultModel: 'fake-model',
    chat: { completions: { create: async () => ({ choices: [{ message: { content: '{"noPlan": true}' } }], model: 'fake-model' }) } },
  };
  const out = await wp.runDeepAnalysis(mkInput(u, WATCH), fakeClient);
  const after = budget.engineAiSpendToday(u);
  check('8.1 deep analysis meters EXACTLY ONCE at 2 units',
    out.content.includes('noPlan') && after.calls - before.calls === 2 &&
    Math.abs((after.cents - before.cents) - 2 * budget.engineAiEstCentsPerCall()) < 1e-9,
    `calls +${after.calls - before.calls}, cents +${(after.cents - before.cents).toFixed(3)}`);

  const failClient = {
    defaultModel: 'fake-model',
    chat: { completions: { create: async () => { throw new Error('provider down'); } } },
  };
  let threw = false;
  try { await wp.runDeepAnalysis(mkInput(u, WATCH), failClient); } catch { threw = true; }
  const afterFail = budget.engineAiSpendToday(u);
  check('8.2 a failed deep call meters nothing', threw && afterFail.calls === after.calls && afterFail.cents === after.cents);

  process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '0';
  let budgetThrew = false;
  try { await wp.runDeepAnalysis(mkInput(990002, WATCH), fakeClient); } catch (e: any) { budgetThrew = !!e?.budgetBlocked; }
  delete process.env.AI_ENGINE_DAILY_BUDGET_CENTS;
  check('8.3 dry pool refuses BEFORE any call (402-shaped budget error)', budgetThrew);

  check('8.4 service meters at exactly one call site, at 2 units',
    count(svcSrc, 'meterEngineAiConfirmation(input.userId, 2)') === 1);
  check('8.5 service never builds an engine-marked client (no double-count)',
    !/engine:\s*true/.test(svcSrc) && !/getUniversalAIClientForUser\(input\.userId,\s*\{/.test(svcSrc));
  check('8.6 watching answers through the EXISTING no-trade shape (_skipAi fold + neutralisation)',
    routesSrc.includes('|| _watchPlanSkip') && routesSrc.includes("'ai_watch_plan'") &&
    routesSrc.includes("analysis.signal = 'NEUTRAL'"));
  check('8.7 _watchPlanSkip is set in exactly the hook + fold + branch (no other writes)',
    count(routesSrc, '_watchPlanSkip') === 5, `occurrences=${count(routesSrc, '_watchPlanSkip')}`);
  check('8.8 plan layer never assigns the signal or the trade plan',
    !/_watchPlan(Fallthrough|Skip)[^\n]*analysis\.(signal|tradePlan)\s*=/.test(routesSrc));
  const hookBlock = routesSrc.slice(routesSrc.indexOf('AI WATCH PLANS (services/ai-watch-plans.ts'), routesSrc.indexOf('const _skipAi'));
  check('8.9 the hook block contains no execution call', !/shouldMT5Execute|executeOrder|placeOrder|sendOrder/.test(hookBlock));
  check('8.10 guards still present on the path (brain gate, EA gate 80, SMC, signal guard, Gate 0)',
    routesSrc.includes('fxBrainGateVerdict') && routesSrc.includes('EA_MIN_CONFIDENCE_FOR_AI_GATE = 80') &&
    routesSrc.includes("smcVerdict === 'PASS'") && routesSrc.includes('tlSignalGuard') &&
    routesSrc.includes('Gate 0: ACCOUNT SAFETY'));
  check('8.11 news blackout still enforced in the live engine gate chain',
    engineSrc.includes('newsBlackoutVerdicts'));
  check('8.12 /api/health exports aiWatchPlans', routesSrc.includes('aiWatchPlansSummary()') && routesSrc.includes('aiWatchPlans:'));
  check('8.13 plan lifecycle is written to the existing decision feed',
    svcSrc.includes('addAiConfirmationLog') && svcSrc.includes("'WATCH_PLAN'"));

  try {
    const root = new URL('../', import.meta.url).pathname;
    const changed = new Set<string>();
    execSync('git status --porcelain', { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean)
      .forEach((l) => { const p = l.slice(3).trim(); if (p) changed.add(p); });
    execSync('git diff --name-only 096ced0e HEAD', { cwd: root, encoding: 'utf8' })
      .split('\n').filter(Boolean).forEach((p) => changed.add(p));
    const forbidden = [...changed].filter((p) =>
      /(brain|trail|improvement|judge)/i.test(p) && !p.includes('ai-watch-plans'));
    const allowed = (p: string) =>
      p.startsWith('dist/') || p === 'server/routes.ts' || p === 'server/openai.ts' ||
      p === 'server/services/ai-watch-plans.ts' || p === 'scripts/check-ai-watch-plans.ts' ||
      p === 'server/build-info.ts';
    const outOfScope = [...changed].filter((p) => !allowed(p));
    check('8.14 diff scope: no brain/trail/improvement/judge files touched', forbidden.length === 0, forbidden.join(','));
    check('8.15 diff scope: only the plan service, route hook, feed type, health, checks, dist',
      outOfScope.length === 0, outOfScope.join(','));
  } catch (e: any) {
    check('8.14/8.15 diff scope (git unavailable)', false, String(e?.message || e).slice(0, 120));
  }
}

wp.__setWatchPlanStoreForCheck(null);
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
