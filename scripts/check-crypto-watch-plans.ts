/**
 * Crypto SHADOW WATCH PLANS + live-confirmation bar cache — verification.
 *
 * Run:  DATABASE_URL= node --import tsx/esm scripts/check-crypto-watch-plans.ts
 *
 * No database, broker, market-data, or provider calls: the plan layer's
 * pure helpers (validation, geometry, trigger evaluation, prompt, parse)
 * are exercised directly, the store and deep-call seams are faked, the
 * Part B cache is driven on a patched clock, and the lane wiring (entry
 * rule placement, gates-first order, judge untouched + isolated, kill
 * switches, live-lane isolation) is pinned by source checks.
 *
 *   A. Schema / geometry / price-sanity validation (write + read shape).
 *   B. Deterministic trigger fixtures on H1 series (all 5 types +
 *      negatives + invalidation / structure break / expiry).
 *   C. Entry rule via the resolver: signal without a triggered plan →
 *      skipped + counted; signal + triggered plan → proceeds; watching
 *      costs ZERO purchases.
 *   D. Deep-call stewardship: ≥30-min per-symbol+strategy cooldown,
 *      per-cycle cap, protected-lane metering exactly once at 2 units,
 *      dry pool buys nothing.
 *   E. Failure modes: store failure → mechanical fallback (lane never
 *      throws); provider/budget failure → skip, NOT fallback.
 *   F. Kill switches + wiring pins: lane consults plans only when on,
 *      after every existing gate, before the judge + INSERT; report and
 *      panel expose aiWatchPlans; judge 'shadow-h1' namespace untouched;
 *      live DeFi files have zero plan references; sw vedd-v296.
 *   G. Part B — live confirmation cache: same question inside its bar =
 *      one purchase (live 5m bar, judge H1 bar); a new bar re-asks;
 *      CRYPTO_BAR_CACHE=off restores the fixed TTL; namespaces unchanged.
 */
import { readFileSync } from 'node:fs';
import * as wp from '../server/services/crypto-watch-plans';
import * as budget from '../server/services/ai-engine-budget';
import * as cacheMod from '../server/services/ai-confirmation-cache';
import { cryptoBarCacheEnabled } from '../server/services/crypto-ai-confirmation';
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

const KEYS = new Set(['momentum', 'breakout', 'trend_following', 'composite_autonomous']);
const NOW = 1_800_000_000_000;

const longFields = (over: Record<string, any> = {}): Record<string, any> => ({
  direction: 'long', pattern: 'BOS retest at value edge',
  entryZoneLow: 98, entryZoneHigh: 102, triggerType: 'close_beyond_level', triggerLevel: 102,
  stopLoss: 96, takeProfit: 108, invalidation: 95,
  expiryMinutes: 720, confidence: 70, rationale: 'fixture', ...over,
});
const shortFields = (over: Record<string, any> = {}): Record<string, any> => ({
  direction: 'short', pattern: 'Range rejection',
  entryZoneLow: 98, entryZoneHigh: 102, triggerType: 'close_beyond_level', triggerLevel: 98,
  stopLoss: 104, takeProfit: 92, invalidation: 105,
  expiryMinutes: 720, confidence: 65, rationale: 'fixture', ...over,
});
const mkPlan = (fields: Record<string, any>, over: Partial<wp.CryptoWatchPlan> = {}): wp.CryptoWatchPlan | null => {
  const p = wp.cryptoPlanFromFields(fields, {
    userId: 42, symbol: 'ETH', underlying: 'ETH', strategy: 'momentum',
    currentPrice: 100, now: NOW, id: 'cwp_fixture', strategyKeys: KEYS,
  });
  return p ? { ...p, ...over } : null;
};

const K = (o: number, h: number, l: number, c: number): PlanCandle => ({ o, h, l, c });

function memStore() {
  const data = new Map<number, wp.CryptoWatchPlanBlob>();
  return {
    data,
    async load(userId: number) { const b = data.get(userId); return b ? JSON.parse(JSON.stringify(b)) : null; },
    async save(userId: number, blob: wp.CryptoWatchPlanBlob) { data.set(userId, JSON.parse(JSON.stringify(blob))); },
  };
}

const studyInput = (over: Partial<wp.CryptoWatchPlanResolveInput> = {}): wp.CryptoWatchPlanResolveInput => ({
  userId: 42, symbol: 'ETH', underlying: 'ETH', strategy: 'momentum',
  signalDirection: 'long', signalScore: 80, entryPrice: 100, slPct: 4, atrPct: 2.7,
  h1Trend: 'BULLISH', h4Trend: 'BULLISH', htfAligned: true,
  liquidityUsd: 2_400_000, buyShareH1: 0.58, btcChange24h: 1.2,
  recentCloses: [97, 98.5, 99, 100],
  candlesNewestFirst: [K(100, 101, 99, 100), K(99, 100, 98, 99)],
  currentPrice: 100, ...over,
});
const planReply = (fields: Record<string, any>) => JSON.stringify({ plan: fields });

async function main(): Promise<void> {
  const lane = src('server/services/crypto-shadow.ts');
  const svcSrc = src('server/services/crypto-watch-plans.ts');
  const confirmSrc = src('server/services/crypto-ai-confirmation.ts');

  // ── A. validation ──────────────────────────────────────────────────
  {
    const p = mkPlan(longFields());
    check('A1 valid long plan passes (stop 4% in 1.5–12% band, target 2R)', !!p && p!.direction === 'long' && p!.status === 'watching');
    check('A2 valid short plan passes (mirrored geometry)', !!mkPlan(shortFields()));
    check('A3 stop inside the band floor (1%) → rejected',
      mkPlan(longFields({ entryZoneLow: 99.2, entryZoneHigh: 100.8, stopLoss: 99, takeProfit: 102, invalidation: 98.5 })) === null);
    check('A4 stop beyond the band ceiling (12.5%) → rejected',
      mkPlan(longFields({ stopLoss: 87.5, takeProfit: 125, invalidation: 86 })) === null);
    check('A5 target off the 2R sketch (1R) → rejected', mkPlan(longFields({ takeProfit: 104 })) === null);
    check('A6 target at 2.1R passes, 2.4R rejected',
      !!mkPlan(longFields({ takeProfit: 108.4 })) && mkPlan(longFields({ takeProfit: 109.6 })) === null);
    check('A7 wrong-side geometry (long TP below zone) → rejected', mkPlan(longFields({ takeProfit: 90 })) === null);
    check('A8 price sanity: plan written at 100 read at 1000 → rejected',
      wp.validateCryptoWatchPlan(mkPlan(longFields()) as any, { symbol: 'ETH', currentPrice: 1000, strategyKeys: KEYS }) === null);
    check('A9 unknown strategy key → rejected; known key passes',
      mkPlan(longFields(), {}) !== null &&
      wp.cryptoPlanFromFields(longFields(), { userId: 42, symbol: 'ETH', underlying: 'ETH', strategy: 'nope', currentPrice: 100, now: NOW, id: 'x', strategyKeys: KEYS }) === null);
    const clampedHi = mkPlan(longFields({ expiryMinutes: 100000 }));
    const clampedLo = mkPlan(longFields({ expiryMinutes: 5 }));
    check('A10 expiry clamped into 1h–48h',
      !!clampedHi && clampedHi!.expiresAt - clampedHi!.createdAt === 48 * 3_600_000 &&
      !!clampedLo && clampedLo!.expiresAt - clampedLo!.createdAt === 1 * 3_600_000);
    check('A11 corrupt shapes rejected (bad trigger, empty pattern, v≠1)',
      mkPlan(longFields({ triggerType: 'moon_bounce' })) === null &&
      mkPlan(longFields({ pattern: '  ' })) === null &&
      wp.validateCryptoWatchPlan({ ...(mkPlan(longFields()) as any), v: 2 }, { symbol: 'ETH', currentPrice: 100, strategyKeys: KEYS }) === null);
    const parsed = wp.parseCryptoWatchPlanResponse(`Sure — ${planReply(longFields())}`);
    check('A12 parse: prose-wrapped plan salvaged; noPlan and garbage handled',
      parsed?.kind === 'plan' &&
      wp.parseCryptoWatchPlanResponse('{"noPlan": true, "reason": "proven loser"}')?.kind === 'no_plan' &&
      wp.parseCryptoWatchPlanResponse('no json') === null);
    const prompt = wp.buildCryptoWatchPlanPrompt({
      ...studyInput(), pairHistory: { summary: { n: 40, winRate: 0.35, avgR: -0.2, medianNetPct: -0.4 }, recent: Array.from({ length: 10 }, () => ({ strategy: 'momentum', direction: 'long', netPct: -1.2, rMultiple: -0.6 })) },
      strategyRecord: { overall: { n: 60, winRate: 0.38, avgR: -0.1, medianNetPct: -0.2 }, last14d: { n: 20, winRate: 0.3, avgR: -0.4, medianNetPct: -0.8 }, prior14d: { n: 22, winRate: 0.45, avgR: 0.1, medianNetPct: 0.2 } },
      bucketEvidence: [{ dim: 'liquidity', bucket: '1-5M', verdict: 'avoid', n: 25, medianNet: -1.4 }],
    });
    check('A13 fully-enriched study prompt stays lean (< 3000 chars) and carries the evidence',
      prompt.user.length < 3000 && prompt.user.includes('PAIR HISTORY') && prompt.user.includes('BUCKET EVIDENCE') && prompt.system.includes('2R'),
      `${prompt.user.length} chars`);
  }

  // ── B. triggers ────────────────────────────────────────────────────
  {
    const base = mkPlan(longFields())!;
    check('B1 close_beyond_level: cross up triggers, no cross watches',
      wp.evaluateCryptoWatchPlan(base, [K(102.5, 103.5, 102, 103), K(100, 101.5, 99.5, 101)], NOW) === 'triggered' &&
      wp.evaluateCryptoWatchPlan(base, [K(100.5, 101.5, 99.5, 101), K(99, 100, 98, 99.5)], NOW) === 'watching');
    const eng = mkPlan(longFields({ triggerType: 'engulfing' }))!;
    check('B2 engulfing: bullish engulf past level triggers; non-engulfing watches',
      wp.evaluateCryptoWatchPlan(eng, [K(99.5, 103.5, 99, 103), K(102, 102.5, 99.8, 100)], NOW) === 'triggered' &&
      wp.evaluateCryptoWatchPlan(eng, [K(101, 102, 100, 101.5), K(102, 102.5, 99.8, 100)], NOW) === 'watching');
    const pin = mkPlan(longFields({ triggerType: 'pin_bar', triggerLevel: 100 }))!;
    check('B3 pin_bar: long lower wick at level triggers; big-body candle watches',
      wp.evaluateCryptoWatchPlan(pin, [K(101, 102, 96, 101.5), K(100, 101, 99, 100)], NOW) === 'triggered' &&
      wp.evaluateCryptoWatchPlan(pin, [K(98, 102.5, 97.5, 102), K(100, 101, 99, 100)], NOW) === 'watching');
    const ret = mkPlan(longFields({ triggerType: 'retest_level', triggerLevel: 100 }))!;
    check('B4 retest_level: broke away, came back, held → triggered; no prior breakaway → watching',
      wp.evaluateCryptoWatchPlan(ret, [K(100.2, 101, 99.5, 100.6), K(104, 105.5, 103.5, 105)], NOW) === 'triggered' &&
      wp.evaluateCryptoWatchPlan(ret, [K(100.2, 101, 99.5, 100.6), K(99, 100, 98, 99.5)], NOW) === 'watching');
    const ibb = mkPlan(longFields({ triggerType: 'inside_bar_break', triggerLevel: 100 }))!;
    check('B5 inside_bar_break: inside bar then break of mother high triggers; no inside bar watches',
      wp.evaluateCryptoWatchPlan(ibb, [K(104, 106.5, 103.5, 106), K(100, 103, 97, 101), K(99, 105, 95, 100)], NOW) === 'triggered' &&
      wp.evaluateCryptoWatchPlan(ibb, [K(104, 106.5, 103.5, 106), K(100, 107, 94, 101), K(99, 105, 95, 100)], NOW) === 'watching');
    check('B6 invalidation vs structure break (25% of stop distance past invalidation)',
      wp.evaluateCryptoWatchPlan(base, [K(96, 97, 94, 94.6), K(99, 100, 98, 99)], NOW) === 'invalidated' &&
      wp.evaluateCryptoWatchPlan(base, [K(96, 97, 93, 94), K(99, 100, 98, 99)], NOW) === 'structure_break');
    const expired = { ...base, expiresAt: NOW - 1 };
    check('B7 expired plan evaluates expired regardless of candles',
      wp.evaluateCryptoWatchPlan(expired, [K(102.5, 103.5, 102, 103), K(100, 101.5, 99.5, 101)], NOW) === 'expired');
    const shortP = mkPlan(shortFields())!;
    check('B8 short close_beyond_level mirrors (cross down triggers)',
      wp.evaluateCryptoWatchPlan(shortP, [K(97.5, 98.5, 96.5, 97), K(99, 100, 98.5, 99.5)], NOW) === 'triggered');
  }

  // ── C/D/E. resolver behavior ───────────────────────────────────────
  const watchingReply = async () => ({ content: planReply(longFields()), model: 'fixture-model' });
  const triggeredCandles = [K(102.5, 103.5, 102, 103), K(100, 101.5, 99.5, 101)];
  {
    wp.__resetCryptoWatchPlansForCheck();
    const store = memStore();
    wp.__setCryptoWatchPlanStoreForCheck(store);
    let calls = 0;
    const counting = async () => { calls++; return watchingReply(); };
    const cycle = wp.newCryptoPlanCycle();
    const r1 = await wp.resolveCryptoWatchPlan(studyInput(), cycle, { callDeep: counting, now: () => NOW, strategyKeys: KEYS });
    const c1 = wp.cryptoWatchPlanCountersToday(42);
    check('C1 no plan → one study bought; watching plan → signal skipped + counted',
      r1.action === 'skip' && calls === 1 && c1.created === 1 && c1.deepCalls === 1 && c1.planSkips === 1);
    const r2 = await wp.resolveCryptoWatchPlan(studyInput(), wp.newCryptoPlanCycle(), {
      callDeep: async () => { throw new Error('watching must never buy'); }, now: () => NOW + 60_000, strategyKeys: KEYS,
    });
    check('C2 watching is FREE: existing plan, zero purchases, still skipped',
      r2.action === 'skip' && wp.cryptoWatchPlanCountersToday(42).deepCalls === 1);
    check('C3 plan persisted under symbol|strategy in the crypto_watch_plans shape',
      !!store.data.get(42)?.plans['ETH|momentum']);
  }
  {
    wp.__resetCryptoWatchPlansForCheck();
    wp.__setCryptoWatchPlanStoreForCheck(memStore());
    const r = await wp.resolveCryptoWatchPlan(studyInput({ candlesNewestFirst: triggeredCandles }), wp.newCryptoPlanCycle(), {
      callDeep: watchingReply, now: () => NOW, strategyKeys: KEYS,
    });
    check('C4 born-triggered plan → entry proceeds', r.action === 'triggered' && wp.cryptoWatchPlanCountersToday(42).triggered === 1);
    const r2 = await wp.resolveCryptoWatchPlan(studyInput({ candlesNewestFirst: [K(100, 101, 99, 100), K(99, 100, 98, 99)] }), wp.newCryptoPlanCycle(), {
      callDeep: async () => { throw new Error('triggered plan must not re-buy'); }, now: () => NOW + 60_000, strategyKeys: KEYS,
    });
    check('C5 triggered plan STAYS triggered (v1 semantics) without new purchases', r2.action === 'triggered');
  }
  {
    wp.__resetCryptoWatchPlansForCheck();
    wp.__setCryptoWatchPlanStoreForCheck(memStore());
    let calls = 0;
    const noPlan = async () => { calls++; return { content: '{"noPlan": true, "reason": "proven loser"}', model: 'm' }; };
    const cycle = wp.newCryptoPlanCycle();
    await wp.resolveCryptoWatchPlan(studyInput(), cycle, { callDeep: noPlan, now: () => NOW, strategyKeys: KEYS });
    await wp.resolveCryptoWatchPlan(studyInput(), cycle, { callDeep: noPlan, now: () => NOW + 10 * 60_000, strategyKeys: KEYS });
    check('D1 cooldown: a bought study stamps lastDeepAt — no re-buy inside 30 min', calls === 1);
    await wp.resolveCryptoWatchPlan(studyInput(), cycle, { callDeep: noPlan, now: () => NOW + 31 * 60_000, strategyKeys: KEYS });
    check('D2 cooldown expires at 30 min — a new study may be bought', calls === 2);
    check('D3 cooldown floor is 30 min', wp.cryptoWatchPlanCooldownMs() >= 30 * 60_000);
  }
  {
    wp.__resetCryptoWatchPlansForCheck();
    wp.__setCryptoWatchPlanStoreForCheck(memStore());
    let calls = 0;
    const counting = async () => { calls++; return watchingReply(); };
    const cycle = wp.newCryptoPlanCycle();
    const symbols = ['ETH', 'SOL', 'BASE', 'AERO', 'WETH'];
    for (const s of symbols) {
      await wp.resolveCryptoWatchPlan(studyInput({ symbol: s, underlying: s }), cycle, { callDeep: counting, now: () => NOW, strategyKeys: KEYS });
    }
    check('D4 per-cycle deep cap: 5 plan-less candidates in one cycle buy at most the cap',
      calls === wp.cryptoPlanMaxDeepPerCycle() && calls <= 3, `calls=${calls}, cap=${wp.cryptoPlanMaxDeepPerCycle()}`);
  }
  {
    // Metering: drive runCryptoDeepStudy with a fake client (DATABASE_URL
    // unset — the budget module's in-process counters are the evidence).
    const u = 990021;
    const before = budget.engineAiSpendToday(u);
    const fakeClient = {
      defaultModel: 'fake-model',
      chat: { completions: { create: async () => ({ choices: [{ message: { content: '{"noPlan": true}' } }], model: 'fake-model' }) } },
    };
    const out = await wp.runCryptoDeepStudy(studyInput({ userId: u }), fakeClient);
    const after = budget.engineAiSpendToday(u);
    check('D5 deep study meters EXACTLY ONCE at 2 units, on the PROTECTED lane',
      out.content.includes('noPlan') && after.calls - before.calls === 2 &&
      Math.abs((after.protectedCents - before.protectedCents) - 2 * budget.engineAiEstCentsPerCall()) < 1e-9 &&
      after.generalCents === before.generalCents,
      `calls +${after.calls - before.calls}, protected +${(after.protectedCents - before.protectedCents).toFixed(3)}¢`);
    const failClient = { defaultModel: 'fake-model', chat: { completions: { create: async () => { throw new Error('provider down'); } } } };
    let threw = false;
    try { await wp.runCryptoDeepStudy(studyInput({ userId: u }), failClient); } catch { threw = true; }
    const afterFail = budget.engineAiSpendToday(u);
    check('D6 a failed study meters nothing', threw && afterFail.calls === after.calls && afterFail.cents === after.cents);
    process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '0';
    let budgetThrew = false;
    try { await wp.runCryptoDeepStudy(studyInput({ userId: 990022 }), fakeClient); } catch (e: any) { budgetThrew = !!e?.budgetBlocked; }
    delete process.env.AI_ENGINE_DAILY_BUDGET_CENTS;
    check('D7 dry pool refuses BEFORE any call (402-shaped budget error)', budgetThrew);
    check('D8 service meters at exactly one call site, protected, 2 units; client never engine-marked',
      count(svcSrc, "meterEngineAiConfirmation(input.userId, 2, 'protected')") === 1 &&
      svcSrc.includes("engineAiBudgetAllows(input.userId, 'protected')") &&
      !/engine:\s*true/.test(svcSrc));
  }
  {
    wp.__resetCryptoWatchPlansForCheck();
    wp.__setCryptoWatchPlanStoreForCheck({
      async load() { throw new Error('store down'); },
      async save() { /* unreachable */ },
    });
    const r = await wp.resolveCryptoWatchPlan(studyInput(), wp.newCryptoPlanCycle(), { callDeep: watchingReply, now: () => NOW, strategyKeys: KEYS });
    check('E1 store failure → mechanical FALLBACK (never throws, never skips)',
      r.action === 'fallback' && wp.cryptoWatchPlanCountersToday(42).fallbacks === 1 && wp.cryptoWatchPlanCountersToday(42).planSkips === 0);
    wp.__resetCryptoWatchPlansForCheck();
    wp.__setCryptoWatchPlanStoreForCheck(memStore());
    const budgetErr = Object.assign(new Error('budget'), { budgetBlocked: true, aiErrorStatus: 'budget' });
    const r2 = await wp.resolveCryptoWatchPlan(studyInput(), wp.newCryptoPlanCycle(), {
      callDeep: async () => { throw budgetErr; }, now: () => NOW, strategyKeys: KEYS,
    });
    const r3 = await wp.resolveCryptoWatchPlan(studyInput({ symbol: 'SOL', underlying: 'SOL' }), wp.newCryptoPlanCycle(), {
      callDeep: async () => { throw new Error('provider 500'); }, now: () => NOW, strategyKeys: KEYS,
    });
    check('E2 budget/provider failure → SKIP (stewardship outcome), not fallback',
      r2.action === 'skip' && r3.action === 'skip' && wp.cryptoWatchPlanCountersToday(42).fallbacks === 0);
    const r4 = await wp.resolveCryptoWatchPlan(studyInput({ symbol: 'AERO', underlying: 'AERO' }), wp.newCryptoPlanCycle(), {
      callDeep: async () => ({ content: planReply(longFields({ stopLoss: 50, takeProfit: 300 })), model: 'm' }), now: () => NOW, strategyKeys: KEYS,
    });
    check('E3 invalid plan from the AI → discarded, signal skipped, nothing stored',
      r4.action === 'skip');
  }

  // ── F. wiring pins ─────────────────────────────────────────────────
  {
    const planIdx = lane.indexOf('resolveCryptoWatchPlan({');
    const judgeIdx = lane.indexOf('judgeCryptoShadowEntry({');
    const insIdx = lane.indexOf('INSERT INTO crypto_shadow_trades');
    check('F1 plan consult exists exactly once in the lane', count(lane, 'resolveCryptoWatchPlan({') === 1 && planIdx > 0);
    check('F2 plan consult runs AFTER every existing gate (cost floor, lesson gate, improvement throttle)',
      ['slPct < floorMult * costBps / 100', 'matchingAvoidBucket', 'improvementThrottleBlocks']
        .every((g) => lane.indexOf(g) > 0 && lane.indexOf(g) < planIdx));
    check('F3 plan consult runs BEFORE the trade INSERT and the judge stamp', planIdx < insIdx && planIdx < judgeIdx);
    check('F4 entry rule: skip action skips the entry; triggered marks viaPlan; fallback proceeds mechanically',
      lane.includes("if (res.action === 'skip') continue;") && lane.includes("viaPlan = res.action === 'triggered';") &&
      lane.includes('if (viaPlan) noteCryptoPlanEntry(userId);'));
    check('F5 kill switch: lane consults plans only when enabled; module defaults ON',
      lane.includes('const plansOn = cryptoWatchPlansEnabled();') && lane.includes('if (plansOn) {') &&
      svcSrc.includes("process.env.CRYPTO_WATCH_PLANS !== 'off'"));
    const saved = process.env.CRYPTO_WATCH_PLANS;
    process.env.CRYPTO_WATCH_PLANS = 'off';
    const off = !wp.cryptoWatchPlansEnabled();
    if (saved === undefined) delete process.env.CRYPTO_WATCH_PLANS; else process.env.CRYPTO_WATCH_PLANS = saved;
    check('F6 CRYPTO_WATCH_PLANS=off flips the enabled check', off && wp.cryptoWatchPlansEnabled());
    check('F7 judge isolation: judge still asked with the shadow-h1 scope; plan layer never calls the judge or its cache',
      lane.includes("cacheScope: 'shadow-h1'") && !svcSrc.includes('cacheScope') &&
      !svcSrc.includes('crypto-ai-confirmation') && !svcSrc.includes('getCryptoAiConfirmation') &&
      !svcSrc.includes('judgeCryptoShadowEntry'));
    check('F8 report + panel expose aiWatchPlans with the honest label',
      src('server/services/crypto-shadow-promotions.ts').includes('cryptoWatchPlansSummary(userId)') &&
      src('server/services/crypto-shadow-promotions.ts').includes('aiWatchPlans') &&
      src('client/src/components/engine-safeguards-panel.tsx').includes('CryptoWatchPlansPanel') &&
      src('client/src/components/engine-safeguards-panel.tsx').includes('Entries now wait for an AI plan trigger') &&
      src('client/src/pages/guards-trails.tsx').includes('<CryptoWatchPlansPanel />'));
    const scanner = src('server/services/cryptocom-scanner.ts');
    const defiExec = src('server/services/defi-executor.ts');
    const defiSwap = src('server/services/defi-swap.ts');
    check('F9 live-lane isolation: live scanner + DeFi execution files have zero watch-plan references',
      !scanner.includes('crypto-watch-plans') && !scanner.includes('resolveCryptoWatchPlan') &&
      !defiExec.includes('crypto-watch-plans') && !defiSwap.includes('crypto-watch-plans'));
    check('F10 sw bumped to vedd-v296', src('client/public/sw.js').includes("CACHE_VERSION = 'vedd-v296'"));
    check('F11 plan layer reuses the FX trigger evaluator (no forked logic)',
      svcSrc.includes("from './ai-watch-plans'") && svcSrc.includes('evaluateWatchPlan'));
    check('F12 one plan per user+symbol+strategy; store scope is crypto_watch_plans',
      svcSrc.includes("getRuntimeStateStrict('crypto_watch_plans'") && svcSrc.includes('cryptoPlanKey(input.symbol, input.strategy)'));
  }

  // ── G. Part B — bar-length validity for live confirmations ─────────
  {
    const realNow = Date.now;
    // NOW is aligned to both a 5m and an H1 UTC boundary.
    let now = NOW;
    Date.now = () => now;
    try {
      const mkCache = () => cacheMod.createConfirmationCache({
        barEnabled: cryptoBarCacheEnabled,
        barTimeframe: (tf) => (tf.includes(':shadow-h1') ? '1h' : tf),
      });
      const verdict = { confirmed: true, aiDirection: 'BUY', aiConfidence: 80, reasoning: 'fixture' };
      const c = mkCache();
      c.put(7, 'ETH', '5m', 'BUY', 80, 100, verdict, 'momentum');
      check('G1 same question inside its 5m bar = served from cache (no re-buy)',
        c.get(7, 'ETH', '5m', 'BUY', 80, 100, 'momentum')?.verdict === verdict);
      now = NOW + 4 * 60_000; // still inside the same 5m bar (past the old 3-min TTL)
      check('G2 verdict outlives the old fixed TTL while its bar is open',
        c.get(7, 'ETH', '5m', 'BUY', 80, 100, 'momentum')?.verdict === verdict);
      now = NOW + 5 * 60_000 + 61_000; // past bar close AND past the 1-min call floor
      check('G3 a new bar re-asks (no fresh hit, no throttled reuse)',
        c.get(7, 'ETH', '5m', 'BUY', 80, 100, 'momentum') === null);
      now = NOW;
      const cj = mkCache();
      cj.put(7, 'ETH', '5m:shadow-h1', 'BUY', 80, 100, verdict, 'momentum');
      now = NOW + 10 * 60_000; // inside the judge's H1 bar, far past any 5m bar
      check('G4 judge verdicts ride the H1 bar (their candles are H1)',
        cj.get(7, 'ETH', '5m:shadow-h1', 'BUY', 80, 100, 'momentum')?.verdict === verdict);
      check('G5 namespaces unchanged: live key never serves the judge scope or vice versa',
        cj.get(7, 'ETH', '5m', 'BUY', 80, 100, 'momentum') === null &&
        c.get(7, 'ETH', '5m:shadow-h1', 'BUY', 80, 100, 'momentum') === null);
      // Kill switch: fixed TTL restored.
      process.env.CRYPTO_BAR_CACHE = 'off';
      now = NOW;
      const ck = mkCache();
      ck.put(7, 'ETH', '5m', 'BUY', 80, 100, verdict, 'momentum');
      const inTtl = ck.get(7, 'ETH', '5m', 'BUY', 80, 100, 'momentum')?.verdict === verdict;
      now = NOW + 4 * 60_000; // past the 3-min TTL, inside the bar — must MISS with the switch off
      const pastTtl = ck.get(7, 'ETH', '5m', 'BUY', 80, 100, 'momentum');
      check('G6 CRYPTO_BAR_CACHE=off restores the fixed TTL (hit inside TTL, miss past it)',
        inTtl && pastTtl === null && !cryptoBarCacheEnabled());
      delete process.env.CRYPTO_BAR_CACHE;
      check('G7 crypto cache answers to its own switch, decoupled from AI_BAR_CACHE',
        cryptoBarCacheEnabled() && confirmSrc.includes('barEnabled: cryptoBarCacheEnabled') &&
        confirmSrc.includes("tf.includes(':shadow-h1') ? '1h' : tf") &&
        confirmSrc.includes("process.env.CRYPTO_BAR_CACHE !== 'off'"));
      check('G8 live gate semantics untouched: cache key construction byte-identical',
        confirmSrc.includes("opts.cacheScope ? `${CONFIRM_TIMEFRAME}:${opts.cacheScope}` : CONFIRM_TIMEFRAME") &&
        confirmSrc.includes("const CONFIRM_TIMEFRAME = '5m';"));
    } finally {
      Date.now = realNow;
      delete process.env.CRYPTO_BAR_CACHE;
    }
  }

  wp.__setCryptoWatchPlanStoreForCheck(null);
  console.log(`\n${total - failures}/${total} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error('check crashed:', e); process.exit(1); });
