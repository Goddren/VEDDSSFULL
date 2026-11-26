/**
 * Kalshi perp WATCH PLANS — verification checks.
 *
 * Run:  DATABASE_URL= node --import tsx/esm scripts/check-kalshi-perp-watch-plans.ts
 *
 * No database, broker, market-data, or provider calls: the plan layer's
 * pure helpers (validation, geometry, trigger evaluation, prompt, parse)
 * are exercised directly, the store and deep-call seams are faked, and
 * the lane wiring (entry rule placement, gates-first order, judge
 * untouched, kill switch, live-lane isolation) is pinned by source
 * checks.
 *
 *   A. Schema / geometry / price-sanity validation (write + read shape).
 *   B. Deterministic trigger fixtures on H1 series (all 5 types +
 *      negatives + invalidation / structure break / expiry).
 *   C. Entry rule via the resolver: signal without a triggered plan →
 *      skipped + counted; signal + triggered plan → proceeds; watching
 *      costs ZERO purchases.
 *   D. Deep-call stewardship: ≥30-min per-ticker+strategy cooldown,
 *      per-cycle cap, protected-lane metering exactly once at 2 units,
 *      dry pool buys nothing.
 *   E. Failure modes: store failure → mechanical fallback (lane never
 *      throws); provider failure → skip, NOT fallback; budget refusal →
 *      mechanical fallback flagged budgetDegraded (2026-11-26 degrade —
 *      the pool caps spend, never trading; AI_BUDGET_DEGRADE=off
 *      restores the skip). Full degrade pins live in
 *      check-ai-budget-degrade.ts.
 *   F. Kill switch + wiring pins: lane consults plans only when on,
 *      after every existing gate, before the judge + INSERT; report and
 *      panel expose aiWatchPlans; judge suite surface untouched;
 *      kalshi-perp-live.ts has zero plan references; sw vedd-v298.
 */
import { readFileSync } from 'node:fs';
import * as wp from '../server/services/kalshi-perp-watch-plans';
import * as budget from '../server/services/ai-engine-budget';
import type { PlanCandle } from '../server/services/ai-watch-plans';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(p, 'utf8');
const count = (s: string, sub: string) => s.split(sub).length - 1;

const KEYS = new Set(['orb', 'momentum', 'breakout']);
const NOW = 1_800_000_000_000;

const longFields = (over: Record<string, any> = {}): Record<string, any> => ({
  direction: 'long', pattern: 'BOS retest at value edge',
  entryZoneLow: 198, entryZoneHigh: 202, triggerType: 'close_beyond_level', triggerLevel: 202,
  stopLoss: 196, takeProfit: 208, invalidation: 195,
  expiryMinutes: 720, confidence: 70, rationale: 'fixture', ...over,
});
const shortFields = (over: Record<string, any> = {}): Record<string, any> => ({
  direction: 'short', pattern: 'Range rejection',
  entryZoneLow: 198, entryZoneHigh: 202, triggerType: 'close_beyond_level', triggerLevel: 198,
  stopLoss: 204, takeProfit: 192, invalidation: 205,
  expiryMinutes: 720, confidence: 65, rationale: 'fixture', ...over,
});
const mkPlan = (fields: Record<string, any>, over: Partial<wp.PerpWatchPlan> = {}): wp.PerpWatchPlan | null =>
  wp.perpPlanFromFields(fields, {
    userId: 42, ticker: 'KXAAPLPERP1', underlying: 'AAPL', strategy: 'orb',
    currentPrice: 200, now: NOW, id: 'kpw_fixture', strategyKeys: KEYS,
  }) && { ...(wp.perpPlanFromFields(fields, {
    userId: 42, ticker: 'KXAAPLPERP1', underlying: 'AAPL', strategy: 'orb',
    currentPrice: 200, now: NOW, id: 'kpw_fixture', strategyKeys: KEYS,
  }) as wp.PerpWatchPlan), ...over };

const K = (o: number, h: number, l: number, c: number): PlanCandle => ({ o, h, l, c });

function memStore() {
  const data = new Map<number, wp.PerpWatchPlanBlob>();
  return {
    data,
    async load(userId: number) { const b = data.get(userId); return b ? JSON.parse(JSON.stringify(b)) : null; },
    async save(userId: number, blob: wp.PerpWatchPlanBlob) { data.set(userId, JSON.parse(JSON.stringify(blob))); },
  };
}

const studyInput = (over: Partial<wp.PerpWatchPlanResolveInput> = {}): wp.PerpWatchPlanResolveInput => ({
  userId: 42, ticker: 'KXAAPLPERP1', underlying: 'AAPL', strategy: 'orb',
  signalDirection: 'long', signalScore: 80, entryPrice: 200, slPct: 2, atrPct: 1.3,
  fundingRate: 0.0001, h1Trend: 'BULLISH', h4Trend: 'BULLISH', vpPosition: 'above_value',
  earningsWithin48h: false, recentCloses: [195, 197, 199, 200],
  candlesNewestFirst: [K(200, 201, 199, 200), K(199, 200, 198, 199)],
  currentPrice: 200, ...over,
});
const planReply = (fields: Record<string, any>) => JSON.stringify({ plan: fields });

async function main(): Promise<void> {
  const lane = src('server/services/kalshi-stock-shadow.ts');
  const svcSrc = src('server/services/kalshi-perp-watch-plans.ts');

  // ── A. validation ──────────────────────────────────────────────────
  {
    const p = mkPlan(longFields());
    check('A1 valid long plan passes (stop 2% in band, target 2R)', !!p && p!.direction === 'long' && p!.status === 'watching');
    check('A2 valid short plan passes (mirrored geometry)', !!mkPlan(shortFields()));
    check('A3 stop inside the band floor (0.25%) → rejected', mkPlan(longFields({ stopLoss: 199.5 })) === null);
    check('A4 stop beyond the band ceiling (5%) → rejected', mkPlan(longFields({ stopLoss: 190, takeProfit: 220 })) === null);
    check('A5 target off the 2R sketch (1R) → rejected', mkPlan(longFields({ takeProfit: 204 })) === null);
    check('A6 target at 2.1R passes, 2.4R rejected',
      !!mkPlan(longFields({ takeProfit: 208.4 })) && mkPlan(longFields({ takeProfit: 209.6 })) === null);
    check('A7 wrong-side geometry (long TP below zone) → rejected', mkPlan(longFields({ takeProfit: 190 })) === null);
    check('A8 price sanity: plan written at 200 read at 1000 → rejected',
      wp.validatePerpWatchPlan(mkPlan(longFields()) as any, { ticker: 'KXAAPLPERP1', currentPrice: 1000, strategyKeys: KEYS }) === null);
    check('A9 unknown strategy key → rejected; known key passes',
      mkPlan(longFields(), {}) !== null &&
      wp.perpPlanFromFields(longFields(), { userId: 42, ticker: 'KXAAPLPERP1', underlying: 'AAPL', strategy: 'nope', currentPrice: 200, now: NOW, id: 'x', strategyKeys: KEYS }) === null);
    const clampedHi = mkPlan(longFields({ expiryMinutes: 100000 }));
    const clampedLo = mkPlan(longFields({ expiryMinutes: 5 }));
    check('A10 expiry clamped into 1h–48h',
      !!clampedHi && clampedHi!.expiresAt - clampedHi!.createdAt === 48 * 3_600_000 &&
      !!clampedLo && clampedLo!.expiresAt - clampedLo!.createdAt === 1 * 3_600_000);
    check('A11 corrupt shapes rejected (bad trigger, empty pattern, v≠1)',
      mkPlan(longFields({ triggerType: 'moon_bounce' })) === null &&
      mkPlan(longFields({ pattern: '  ' })) === null &&
      wp.validatePerpWatchPlan({ ...(mkPlan(longFields()) as any), v: 2 }, { ticker: 'KXAAPLPERP1', currentPrice: 200, strategyKeys: KEYS }) === null);
    const parsed = wp.parsePerpWatchPlanResponse(`Sure — ${planReply(longFields())}`);
    check('A12 parse: prose-wrapped plan salvaged; noPlan and garbage handled',
      parsed?.kind === 'plan' &&
      wp.parsePerpWatchPlanResponse('{"noPlan": true, "reason": "proven loser"}')?.kind === 'no_plan' &&
      wp.parsePerpWatchPlanResponse('no json') === null);
    const prompt = wp.buildPerpWatchPlanPrompt({
      ...studyInput(), tickerHistory: { summary: { n: 40, winRate: 0.35, avgR: -0.2, medianNetPct: -0.4 }, recent: Array.from({ length: 10 }, () => ({ strategy: 'orb', direction: 'long', netPct: -1.2, rMultiple: -0.6 })) },
      strategyRecord: { overall: { n: 60, winRate: 0.38, avgR: -0.1, medianNetPct: -0.2 }, last14d: { n: 20, winRate: 0.3, avgR: -0.4, medianNetPct: -0.8 }, prior14d: { n: 22, winRate: 0.45, avgR: 0.1, medianNetPct: 0.2 } },
      bucketEvidence: [{ dim: 'session', bucket: 'regular', verdict: 'avoid', n: 25, medianNet: -1.4 }],
    });
    check('A13 fully-enriched study prompt stays lean (< 3000 chars) and carries the evidence',
      prompt.user.length < 3000 && prompt.user.includes('TICKER HISTORY') && prompt.user.includes('BUCKET EVIDENCE') && prompt.system.includes('2R'),
      `${prompt.user.length} chars`);
  }

  // ── B. triggers ────────────────────────────────────────────────────
  {
    const base = mkPlan(longFields())!;
    check('B1 close_beyond_level: cross up triggers, no cross watches',
      wp.evaluatePerpWatchPlan(base, [K(202.5, 203.5, 202, 203), K(200, 201.5, 199.5, 201)], NOW) === 'triggered' &&
      wp.evaluatePerpWatchPlan(base, [K(200.5, 201.5, 199.5, 201), K(199, 200, 198, 199.5)], NOW) === 'watching');
    const eng = mkPlan(longFields({ triggerType: 'engulfing' }))!;
    check('B2 engulfing: bullish engulf past level triggers; non-engulfing watches',
      wp.evaluatePerpWatchPlan(eng, [K(199.5, 203.5, 199, 203), K(202, 202.5, 199.8, 200)], NOW) === 'triggered' &&
      wp.evaluatePerpWatchPlan(eng, [K(201, 202, 200, 201.5), K(202, 202.5, 199.8, 200)], NOW) === 'watching');
    const pin = mkPlan(longFields({ triggerType: 'pin_bar', triggerLevel: 200 }))!;
    check('B3 pin_bar: long lower wick at level triggers; big-body candle watches',
      wp.evaluatePerpWatchPlan(pin, [K(201, 202, 196, 201.5), K(200, 201, 199, 200)], NOW) === 'triggered' &&
      wp.evaluatePerpWatchPlan(pin, [K(198, 202.5, 197.5, 202), K(200, 201, 199, 200)], NOW) === 'watching');
    const ret = mkPlan(longFields({ triggerType: 'retest_level', triggerLevel: 200 }))!;
    check('B4 retest_level: broke away, came back, held → triggered; no prior breakaway → watching',
      wp.evaluatePerpWatchPlan(ret, [K(200.2, 201, 199.5, 200.6), K(204, 205.5, 203.5, 205)], NOW) === 'triggered' &&
      wp.evaluatePerpWatchPlan(ret, [K(200.2, 201, 199.5, 200.6), K(199, 200, 198, 199.5)], NOW) === 'watching');
    const ibb = mkPlan(longFields({ triggerType: 'inside_bar_break', triggerLevel: 200 }))!;
    check('B5 inside_bar_break: inside bar then break of mother high triggers; no inside bar watches',
      wp.evaluatePerpWatchPlan(ibb, [K(204, 206.5, 203.5, 206), K(200, 203, 197, 201), K(199, 205, 195, 200)], NOW) === 'triggered' &&
      wp.evaluatePerpWatchPlan(ibb, [K(204, 206.5, 203.5, 206), K(200, 207, 194, 201), K(199, 205, 195, 200)], NOW) === 'watching');
    check('B6 invalidation vs structure break (25% of stop distance past invalidation)',
      wp.evaluatePerpWatchPlan(base, [K(196, 197, 194, 194.6), K(199, 200, 198, 199)], NOW) === 'invalidated' &&
      wp.evaluatePerpWatchPlan(base, [K(196, 197, 193, 194), K(199, 200, 198, 199)], NOW) === 'structure_break');
    const expired = { ...base, expiresAt: NOW - 1 };
    check('B7 expired plan evaluates expired regardless of candles',
      wp.evaluatePerpWatchPlan(expired, [K(202.5, 203.5, 202, 203), K(200, 201.5, 199.5, 201)], NOW) === 'expired');
    const shortP = mkPlan(shortFields())!;
    check('B8 short close_beyond_level mirrors (cross down triggers)',
      wp.evaluatePerpWatchPlan(shortP, [K(197.5, 198.5, 196.5, 197), K(199, 200, 198.5, 199.5)], NOW) === 'triggered');
  }

  // ── C/D/E. resolver behavior ───────────────────────────────────────
  const watchingReply = async () => ({ content: planReply(longFields()), model: 'fixture-model' });
  const triggeredCandles = [K(202.5, 203.5, 202, 203), K(200, 201.5, 199.5, 201)];
  {
    wp.__resetPerpWatchPlansForCheck();
    const store = memStore();
    wp.__setPerpWatchPlanStoreForCheck(store);
    let calls = 0;
    const counting = async () => { calls++; return watchingReply(); };
    const cycle = wp.newPerpPlanCycle();
    const r1 = await wp.resolvePerpWatchPlan(studyInput(), cycle, { callDeep: counting, now: () => NOW, strategyKeys: KEYS });
    const c1 = wp.perpWatchPlanCountersToday(42);
    check('C1 no plan → one study bought; watching plan → signal skipped + counted',
      r1.action === 'skip' && calls === 1 && c1.created === 1 && c1.deepCalls === 1 && c1.planSkips === 1);
    const r2 = await wp.resolvePerpWatchPlan(studyInput(), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw new Error('watching must never buy'); }, now: () => NOW + 60_000, strategyKeys: KEYS,
    });
    check('C2 watching is FREE: existing plan, zero purchases, still skipped',
      r2.action === 'skip' && wp.perpWatchPlanCountersToday(42).deepCalls === 1);
    check('C3 plan persisted under ticker|strategy in the kalshi_perp_watch_plans shape',
      !!store.data.get(42)?.plans['KXAAPLPERP1|orb']);
  }
  {
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck(memStore());
    const r = await wp.resolvePerpWatchPlan(studyInput({ candlesNewestFirst: triggeredCandles }), wp.newPerpPlanCycle(), {
      callDeep: watchingReply, now: () => NOW, strategyKeys: KEYS,
    });
    check('C4 born-triggered plan → entry proceeds', r.action === 'triggered' && wp.perpWatchPlanCountersToday(42).triggered === 1);
    const r2 = await wp.resolvePerpWatchPlan(studyInput({ candlesNewestFirst: [K(200, 201, 199, 200), K(199, 200, 198, 199)] }), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw new Error('triggered plan must not re-buy'); }, now: () => NOW + 60_000, strategyKeys: KEYS,
    });
    check('C5 triggered plan STAYS triggered (v1 semantics) without new purchases', r2.action === 'triggered');
  }
  {
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck(memStore());
    let calls = 0;
    const noPlan = async () => { calls++; return { content: '{"noPlan": true, "reason": "proven loser"}', model: 'm' }; };
    const cycle = wp.newPerpPlanCycle();
    await wp.resolvePerpWatchPlan(studyInput(), cycle, { callDeep: noPlan, now: () => NOW, strategyKeys: KEYS });
    await wp.resolvePerpWatchPlan(studyInput(), cycle, { callDeep: noPlan, now: () => NOW + 10 * 60_000, strategyKeys: KEYS });
    check('D1 cooldown: a bought study stamps lastDeepAt — no re-buy inside 30 min', calls === 1);
    await wp.resolvePerpWatchPlan(studyInput(), cycle, { callDeep: noPlan, now: () => NOW + 31 * 60_000, strategyKeys: KEYS });
    check('D2 cooldown expires at 30 min — a new study may be bought', calls === 2);
    check('D3 cooldown floor is 30 min', wp.perpWatchPlanCooldownMs() >= 30 * 60_000);
  }
  {
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck(memStore());
    let calls = 0;
    const counting = async () => { calls++; return watchingReply(); };
    const cycle = wp.newPerpPlanCycle();
    const tickers = ['KXAAPLPERP1', 'KXMSFTPERP1', 'KXNVDA PERP'.replace(' ', ''), 'KXTSLAPERP1', 'KXMETAPERP1'];
    for (const t of tickers) {
      await wp.resolvePerpWatchPlan(studyInput({ ticker: t, underlying: t.slice(2, 6) }), cycle, { callDeep: counting, now: () => NOW, strategyKeys: KEYS });
    }
    check('D4 per-cycle deep cap: 5 plan-less candidates in one cycle buy at most the cap',
      calls === wp.perpPlanMaxDeepPerCycle() && calls <= 3, `calls=${calls}, cap=${wp.perpPlanMaxDeepPerCycle()}`);
  }
  {
    // Metering: drive runPerpDeepStudy with a fake client (DATABASE_URL
    // unset — the budget module's in-process counters are the evidence).
    const u = 990011;
    const before = budget.engineAiSpendToday(u);
    const fakeClient = {
      defaultModel: 'fake-model',
      chat: { completions: { create: async () => ({ choices: [{ message: { content: '{"noPlan": true}' } }], model: 'fake-model' }) } },
    };
    const out = await wp.runPerpDeepStudy(studyInput({ userId: u }), fakeClient);
    const after = budget.engineAiSpendToday(u);
    check('D5 deep study meters EXACTLY ONCE at 2 units, on the PROTECTED lane',
      out.content.includes('noPlan') && after.calls - before.calls === 2 &&
      Math.abs((after.protectedCents - before.protectedCents) - 2 * budget.engineAiEstCentsPerCall()) < 1e-9 &&
      after.generalCents === before.generalCents,
      `calls +${after.calls - before.calls}, protected +${(after.protectedCents - before.protectedCents).toFixed(3)}¢`);
    const failClient = { defaultModel: 'fake-model', chat: { completions: { create: async () => { throw new Error('provider down'); } } } };
    let threw = false;
    try { await wp.runPerpDeepStudy(studyInput({ userId: u }), failClient); } catch { threw = true; }
    const afterFail = budget.engineAiSpendToday(u);
    check('D6 a failed study meters nothing', threw && afterFail.calls === after.calls && afterFail.cents === after.cents);
    process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '0';
    let budgetThrew = false;
    try { await wp.runPerpDeepStudy(studyInput({ userId: 990012 }), fakeClient); } catch (e: any) { budgetThrew = !!e?.budgetBlocked; }
    delete process.env.AI_ENGINE_DAILY_BUDGET_CENTS;
    check('D7 dry pool refuses BEFORE any call (402-shaped budget error)', budgetThrew);
    check('D8 service meters at exactly one call site, protected, 2 units; client never engine-marked',
      count(svcSrc, "meterEngineAiConfirmation(input.userId, 2, 'protected')") === 1 &&
      svcSrc.includes("engineAiBudgetAllows(input.userId, 'protected')") &&
      !/engine:\s*true/.test(svcSrc));
  }
  {
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck({
      async load() { throw new Error('store down'); },
      async save() { /* unreachable */ },
    });
    const r = await wp.resolvePerpWatchPlan(studyInput(), wp.newPerpPlanCycle(), { callDeep: watchingReply, now: () => NOW, strategyKeys: KEYS });
    check('E1 store failure → mechanical FALLBACK (never throws, never skips)',
      r.action === 'fallback' && wp.perpWatchPlanCountersToday(42).fallbacks === 1 && wp.perpWatchPlanCountersToday(42).planSkips === 0);
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck(memStore());
    const budgetErr = Object.assign(new Error('budget'), { budgetBlocked: true, aiErrorStatus: 'budget' });
    const r2 = await wp.resolvePerpWatchPlan(studyInput(), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw budgetErr; }, now: () => NOW, strategyKeys: KEYS,
    });
    const r3 = await wp.resolvePerpWatchPlan(studyInput({ ticker: 'KXMSFTPERP1', underlying: 'MSFT' }), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw new Error('provider 500'); }, now: () => NOW, strategyKeys: KEYS,
    });
    check('E2 budget refusal → FALLBACK flagged budgetDegraded (2026-11-26 degrade); provider failure → SKIP, not fallback',
      r2.action === 'fallback' && (r2 as any).budgetDegraded === true && r3.action === 'skip' &&
      wp.perpWatchPlanCountersToday(42).fallbacks === 1);
    process.env.AI_BUDGET_DEGRADE = 'off';
    const r2b = await wp.resolvePerpWatchPlan(studyInput({ ticker: 'KXTSLAPERP1', underlying: 'TSLA' }), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw budgetErr; }, now: () => NOW, strategyKeys: KEYS,
    });
    delete process.env.AI_BUDGET_DEGRADE;
    check('E2b AI_BUDGET_DEGRADE=off → budget refusal restores the stewardship SKIP',
      r2b.action === 'skip' && wp.perpWatchPlanCountersToday(42).fallbacks === 1);
    const r4 = await wp.resolvePerpWatchPlan(studyInput({ ticker: 'KXNVDA PERP'.replace(' ', ''), underlying: 'NVDA' }), wp.newPerpPlanCycle(), {
      callDeep: async () => ({ content: planReply(longFields({ stopLoss: 150, takeProfit: 300 })), model: 'm' }), now: () => NOW, strategyKeys: KEYS,
    });
    check('E3 invalid plan from the AI → discarded, signal skipped, nothing stored',
      r4.action === 'skip');
  }

  // ── F. wiring pins ─────────────────────────────────────────────────
  {
    const planIdx = lane.indexOf('resolvePerpWatchPlan({');
    const judgeIdx = lane.indexOf('judgeKalshiPerpCandidate({');
    const insIdx = lane.indexOf('INSERT INTO kalshi_perp_shadow_trades');
    check('F1 plan consult exists exactly once in the lane', count(lane, 'resolvePerpWatchPlan({') === 1 && planIdx > 0);
    check('F2 plan consult runs AFTER every existing gate (earnings, brain, throttle, VP)',
      ['earningsBlockApplies', 'evaluatePerpBrainGate', 'improvementThrottleBlocks', 'vpValueEdgeBlock']
        .every((g) => lane.indexOf(g) > 0 && lane.indexOf(g) < planIdx));
    check('F3 plan consult runs BEFORE the judge and the trade INSERT', planIdx < judgeIdx && planIdx < insIdx);
    check('F4 entry rule: skip action skips the entry; triggered marks viaPlan; fallback proceeds mechanically',
      lane.includes("if (res.action === 'skip') continue;") && lane.includes("viaPlan = res.action === 'triggered';") &&
      lane.includes('if (viaPlan) notePerpPlanEntry(userId);'));
    check('F5 kill switch: lane consults plans only when enabled; module defaults ON',
      lane.includes('const plansOn = kalshiPerpWatchPlansEnabled();') && lane.includes('if (plansOn) {') &&
      svcSrc.includes("process.env.KALSHI_PERP_WATCH_PLANS !== 'off'"));
    const saved = process.env.KALSHI_PERP_WATCH_PLANS;
    process.env.KALSHI_PERP_WATCH_PLANS = 'off';
    const off = !wp.kalshiPerpWatchPlansEnabled();
    if (saved === undefined) delete process.env.KALSHI_PERP_WATCH_PLANS; else process.env.KALSHI_PERP_WATCH_PLANS = saved;
    check('F6 KALSHI_PERP_WATCH_PLANS=off flips the enabled check', off && wp.kalshiPerpWatchPlansEnabled());
    check('F7 judge untouched by the plan layer: judge call still precedes INSERT and no branch reads the verdict',
      judgeIdx > 0 && judgeIdx < insIdx && !lane.slice(judgeIdx, insIdx).includes('judge.verdict') && !lane.slice(judgeIdx, insIdx).includes('judge?.verdict'));
    check('F8 report + panel expose aiWatchPlans with the honest label',
      lane.includes('aiWatchPlans,') && lane.includes('kalshiPerpWatchPlansSummary(userId)') &&
      src('client/src/components/kalshi-shadow-panel.tsx').includes('entries now wait for an AI plan trigger'));
    const live = src('server/services/kalshi-perp-live.ts');
    check('F9 live-lane isolation: kalshi-perp-live.ts has zero watch-plan references',
      !live.includes('kalshi-perp-watch-plans') && !live.includes('PerpWatchPlan') && !live.includes('resolvePerpWatchPlan'));
    check('F10 sw bumped to vedd-v298', src('client/public/sw.js').includes("CACHE_VERSION = 'vedd-v298'"));
    check('F11 plan layer reuses the FX trigger evaluator + judge evidence types (no forked logic)',
      svcSrc.includes("from './ai-watch-plans'") && svcSrc.includes('evaluateWatchPlan') &&
      svcSrc.includes("from './kalshi-perp-ai-judge'"));
    check('F12 one plan per user+ticker+strategy; store scope is kalshi_perp_watch_plans',
      svcSrc.includes("getRuntimeStateStrict('kalshi_perp_watch_plans'") && svcSrc.includes('perpPlanKey(input.ticker, input.strategy)'));
  }

  wp.__setPerpWatchPlanStoreForCheck(null);
  console.log(`\n${total - failures}/${total} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error('check crashed:', e); process.exit(1); });
