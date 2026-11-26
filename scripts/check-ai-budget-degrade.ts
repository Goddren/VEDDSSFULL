/**
 * AI budget DEGRADE-DON'T-BLOCK — verification checks (2026-11-26).
 *
 * Run:  node --import tsx/esm scripts/check-ai-budget-degrade.ts
 * (Run with DATABASE_URL unset: the budget module's persistence degrades
 * silently and the in-process counters are what these checks exercise,
 * same as check-ai-budget-reserve / check-kalshi-perp-watch-plans.)
 *
 * The rule under test (Chris, 2026-11-26): the $2/day AI pool caps AI
 * SPEND only — it must never lock trading. When the budget layer refuses
 * an AI call (the TYPED refusal: engineAiBudgetError /
 * engineAiBudgetVerdict markers), each lane degrades to its deterministic
 * stack with honest rules_only_budget labeling. Provider/API failures are
 * NOT refusals and keep their pre-existing handling everywhere.
 *
 *   A. Kill switch + typed-refusal detection (pure, real budget shapes).
 *   B. FX degraded decision — the pure gate the chart-data route calls.
 *   C. FX wiring pins (chart-data route + live engine + watch plans).
 *   D. Crypto Dual-Vote degrade (helper + propagation + throw intact).
 *   E. Kalshi perp shadow: budget-refused study → mechanical fallback.
 *   F. FX regime tie-break: a refused vote simply never exists.
 *   G. Reserve / metering pins: spend still hard-stops at the cap.
 *   H. Sol finding: the pool CANNOT block Sol entries (veto-only AI).
 *   I. Service worker pin.
 */
import { readFileSync } from 'node:fs';
import * as degrade from '../server/services/ai-budget-degrade';
import * as budget from '../server/services/ai-engine-budget';
import * as wp from '../server/services/kalshi-perp-watch-plans';
import * as judge from '../server/services/kalshi-perp-ai-judge';
import * as fxModels from '../server/services/fx-models';
import * as fixPack from '../server/services/crypto-fix-pack';
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

async function main(): Promise<void> {
  const routes = src('server/routes.ts');
  const liveEngine = src('server/services/live-trading-engine.ts');
  const scanner = src('server/services/cryptocom-scanner.ts');
  const cryptoConf = src('server/services/crypto-ai-confirmation.ts');
  const perpPlans = src('server/services/kalshi-perp-watch-plans.ts');
  const perpLane = src('server/services/kalshi-stock-shadow.ts');

  // ── A. kill switch + typed-refusal detection ───────────────────────
  {
    check('A1 kill switch: AI_BUDGET_DEGRADE unset/other → enabled; =off → disabled (read live)',
      degrade.aiBudgetDegradeEnabled({}) === true &&
      degrade.aiBudgetDegradeEnabled({ AI_BUDGET_DEGRADE: 'on' }) === true &&
      degrade.aiBudgetDegradeEnabled({ AI_BUDGET_DEGRADE: 'off' }) === false);
    const budgetErr = budget.engineAiBudgetError();
    check('A2 the budget module\'s own thrown refusal IS detected (typed markers)',
      degrade.isBudgetRefusalError(budgetErr) && budgetErr.budgetBlocked === true && budgetErr.aiErrorStatus === 'budget');
    const verdict = budget.engineAiBudgetVerdict();
    check('A3 the budget module\'s own verdict IS a refusal — and its shape is unchanged (fail-closed, 0 confidence)',
      degrade.isBudgetRefusalVerdict(verdict) && verdict.confirmed === false && verdict.aiConfidence === 0 &&
      verdict.modelUsed === 'ai-budget-gate');
    check('A4 provider failures are NOT refusals (numeric status, bare 402, null, plain Error)',
      !degrade.isBudgetRefusalError(Object.assign(new Error('Insufficient credits'), { status: 402 })) &&
      !degrade.isBudgetRefusalError(new Error('network down')) &&
      !degrade.isBudgetRefusalError(null) && !degrade.isBudgetRefusalError(undefined) &&
      !degrade.isBudgetRefusalVerdict({ aiError: true, aiErrorStatus: 402 }) &&
      !degrade.isBudgetRefusalVerdict({ aiError: true, aiErrorStatus: null }) &&
      !degrade.isBudgetRefusalVerdict({ confirmed: true, aiConfidence: 80 }));
    check('A5 honest labels: mode marker + reason text are the agreed strings',
      degrade.AI_BUDGET_DEGRADED_MODE === 'rules_only_budget' &&
      degrade.AI_BUDGET_DEGRADED_REASON === 'no AI (budget out) — rules decided');
  }

  // ── B. FX degraded decision (the pure gate the route calls) ────────
  {
    const d = (over: Partial<Parameters<typeof degrade.fxBudgetDegradedDecision>[0]> = {}) =>
      degrade.fxBudgetDegradedDecision({ quantVerdict: 'CONFIRM', quantScore: 78, eaConfidence: 88, confluenceConflicts: false, ...over });
    check('B1 quant CONFIRM + EA above the floor → rules ALLOW', d().allowed === true);
    check('B2 EA exactly at the 74% floor → rules ALLOW (floor is inclusive)', d({ eaConfidence: 74 }).allowed === true);
    const below = d({ eaConfidence: 73 });
    check('B3 EA below the floor → still BLOCKED, and the reason names the 74% execution floor',
      below.allowed === false && below.blockReason.includes('74% execution floor'));
    const weakQuant = d({ quantVerdict: 'WATCH', eaConfidence: 95 });
    check('B4 quant not CONFIRM → BLOCKED even at EA 95 (no AI-style override exists in degraded mode)',
      weakQuant.allowed === false && weakQuant.blockReason.includes('not CONFIRM'));
    const conflict = d({ confluenceConflicts: true });
    check('B5 deterministic structure conflict → BLOCKED', conflict.allowed === false && conflict.blockReason.includes('structure'));
    check('B6 the floor constant is the live engine\'s 74', degrade.FX_DEGRADED_EA_FLOOR === 74);
  }

  // ── C. FX wiring pins ──────────────────────────────────────────────
  {
    check('C1 chart-data route detects the refusal via the typed verdict check, gated by the kill switch',
      routes.includes('_budgetDegrade.isBudgetRefusalVerdict(aiConfirmation)') &&
      routes.includes('_budgetRefused && _budgetDegrade.aiBudgetDegradeEnabled()'));
    check('C2 the degraded decision feeds tradeAllowed alongside (never instead of) the AI paths',
      routes.includes('|| _advisoryOverride || _degradedDecision.allowed'));
    check('C3 degraded BLOCK reason replaces the budget refusal text; the refusal text survives for kill-off/provider paths',
      routes.includes('${_budgetDegrade.AI_BUDGET_DEGRADED_REASON}: ${_degradedDecision.blockReason}') &&
      routes.includes('refusing to trade an unverified signal'));
    check('C4 durable stamps: aiMode in the raw-verdict log fields; RULES_ONLY_BUDGET on BOTH the feed log and the outcome row',
      routes.includes("aiMode: _budgetDegrade.AI_BUDGET_DEGRADED_MODE") &&
      count(routes, "'RULES_ONLY_BUDGET'") === 2 &&
      routes.includes("approvalLabel = _budgetDegraded ? 'RULES ONLY (BUDGET)'"));
    check('C5 advisory override still cannot fire on an errored verdict (budget verdict has aiError=true → no override in degraded mode)',
      routes.includes('&& !_aiErrored;') && routes.includes('const _aiErrored = (aiConfirmation as any).aiError === true;'));
    check('C6 no new confidence manufacture: aiConfirmation.aiConfidence is assigned exactly once in routes.ts (the pre-existing fidelity-off advisory rewrite)',
      count(routes, 'aiConfirmation.aiConfidence =') === 1);
    check('C7 degraded telemetry stage is distinct from the block stage',
      routes.includes("_cdiag.stage = 'ai_budget_degraded';") && routes.includes("_cdiag.stage = 'ai_budget_blocked';"));
    check('C8 live engine: budget refusal in ai mode falls back to the rules lane through actOnRulesPicks, stamped + kill-switched',
      liveEngine.includes('isBudgetRefusalError(err) && aiBudgetDegradeEnabled()') &&
      liveEngine.includes('await actOnRulesPicks(userId, _scanId, _fxMode, picks, newsContext, AI_BUDGET_DEGRADED_REASON)') &&
      liveEngine.includes('(p.decision as any).aiMode = AI_BUDGET_DEGRADED_MODE'));
    check('C9 live engine: hybrid fallback semantics untouched (any-failure fallback still runs through _aiFailed)',
      liveEngine.includes("if (_fxMode !== 'hybrid' || !_rulesP) return;") &&
      liveEngine.includes('await actOnRulesPicks(userId, _scanId, _fxMode, await _rulesP, newsContext, `hybrid fallback — AI ${status}`)'));
    // Watch-plan STUDIES stay budget-gated (spend): the deep call still
    // throws the typed budget error on a dry pool — behaviorally, with
    // the cap forced to 0 the study refuses BEFORE any provider call.
    process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '0';
    let studyThrewBudget = false;
    try {
      const { runDeepAnalysis } = await import('../server/services/ai-watch-plans');
      await runDeepAnalysis({
        userId: 990021, symbol: 'EURUSD', timeframe: 'H1', direction: 'BUY',
        price: 1.1, confidence: 80, candles: [], indicators: {},
      } as any, { defaultModel: 'fake', chat: { completions: { create: async () => { throw new Error('must never be called'); } } } });
    } catch (e: any) { studyThrewBudget = degrade.isBudgetRefusalError(e); }
    delete process.env.AI_ENGINE_DAILY_BUDGET_CENTS;
    check('C10 FX watch-plan STUDY purchases stay budget-gated (dry pool → typed refusal before any call)', studyThrewBudget);
  }

  // ── D. Crypto Dual-Vote degrade ────────────────────────────────────
  {
    check('D1 crypto degraded rule: quant CONFIRM alone allows; WATCH/SKIP do not',
      degrade.cryptoBudgetDegradedAllowed('CONFIRM') === true &&
      degrade.cryptoBudgetDegradedAllowed('WATCH') === false &&
      degrade.cryptoBudgetDegradedAllowed('SKIP') === false);
    check('D2 the typed marker now survives crypto-ai-confirmation\'s catch (aiBudgetBlocked, typed check only)',
      cryptoConf.includes('aiBudgetBlocked?: boolean;') &&
      cryptoConf.includes('...(isBudgetRefusalError(err) ? { aiBudgetBlocked: true } : {})'));
    check('D3 scanner wrapper short-circuits a budget refusal (no lite call against a dry pool), kill-switch aware',
      scanner.includes('if (conf.aiBudgetBlocked && aiBudgetDegradeEnabled())') &&
      scanner.includes('budgetBlocked: true };'));
    check('D4 lite fallback propagates the typed marker from its own catch',
      scanner.includes('...(isBudgetRefusalError(err) ? { budgetBlocked: true } : {})'));
    check('D5 assembleConsensus degrades on the marker: quant decides, result.reasoning stamped for trade records',
      scanner.includes('(ai as any).budgetBlocked === true && aiBudgetDegradeEnabled()') &&
      scanner.includes('tradeAllowed = cryptoBudgetDegradedAllowed(quantVerdict);') &&
      scanner.includes('[${AI_BUDGET_DEGRADED_REASON}]'));
    check('D6 PR #120 intact: consensus THROW still fails closed (helper default + caller wiring unchanged)',
      fixPack.consensusThrowAllowsTrade({}) === false &&
      fixPack.consensusThrowAllowsTrade({ CRYPTO_CONSENSUS_FAIL_CLOSED: 'off' }) === true &&
      scanner.includes('if (consensusThrowAllowsTrade())') &&
      scanner.includes('entry skipped rather than allowed without the Dual-Vote verdict (fail-closed)'));
    check('D7 PR #120 intact: promoted-guard consult errors still fail closed (degrade never touches that path)',
      scanner.includes('promotionErrorSkipsEntry(') || scanner.includes('promotionErrorSkipsEntry'));
  }

  // ── E. Kalshi perp shadow: budget-refused study → fallback ─────────
  {
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck(memStore());
    const r1 = await wp.resolvePerpWatchPlan(studyInput(), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw budget.engineAiBudgetError(); }, now: () => NOW, strategyKeys: KEYS,
    });
    check('E1 budget-refused study → mechanical FALLBACK flagged budgetDegraded (entry proceeds on the signal)',
      r1.action === 'fallback' && (r1 as any).budgetDegraded === true &&
      wp.perpWatchPlanCountersToday(42).fallbacks === 1 && wp.perpWatchPlanCountersToday(42).planSkips === 0);
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck(memStore());
    process.env.AI_BUDGET_DEGRADE = 'off';
    const r2 = await wp.resolvePerpWatchPlan(studyInput(), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw budget.engineAiBudgetError(); }, now: () => NOW, strategyKeys: KEYS,
    });
    delete process.env.AI_BUDGET_DEGRADE;
    check('E2 kill switch off → budget-refused study restores the stewardship SKIP',
      r2.action === 'skip' && wp.perpWatchPlanCountersToday(42).planSkips === 1 && wp.perpWatchPlanCountersToday(42).fallbacks === 0);
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck(memStore());
    const r3 = await wp.resolvePerpWatchPlan(studyInput(), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw new Error('provider 500'); }, now: () => NOW, strategyKeys: KEYS,
    });
    const r4 = await wp.resolvePerpWatchPlan(studyInput({ ticker: 'KXMSFTPERP1', underlying: 'MSFT' }), wp.newPerpPlanCycle(), {
      callDeep: async () => { throw Object.assign(new Error('Insufficient credits'), { status: 402 }); }, now: () => NOW, strategyKeys: KEYS,
    });
    check('E3 provider failures still SKIP — including a bare provider 402 with NO budget markers (typed, not status-matched)',
      r3.action === 'skip' && r4.action === 'skip' && wp.perpWatchPlanCountersToday(42).fallbacks === 0);
    wp.__resetPerpWatchPlansForCheck();
    wp.__setPerpWatchPlanStoreForCheck({
      async load() { throw new Error('store down'); },
      async save() { /* unreachable */ },
    });
    const r5 = await wp.resolvePerpWatchPlan(studyInput(), wp.newPerpPlanCycle(), {
      callDeep: async () => ({ content: '{}', model: 'm' }), now: () => NOW, strategyKeys: KEYS,
    });
    check('E4 plan-layer ERROR fallback preserved — and NOT flagged budgetDegraded (malfunction ≠ budget state)',
      r5.action === 'fallback' && (r5 as any).budgetDegraded !== true);
    wp.__setPerpWatchPlanStoreForCheck(null);
    check('E5 lane stamps the context row: budgetDegraded fallback pushes the rules_only_budget tag; plain fallback does not',
      perpLane.includes('res.budgetDegraded') && perpLane.includes('tags.push(AI_BUDGET_DEGRADED_MODE)'));
    check('E6 judge unchanged: budget failure classifies as budget → no_verdict (fail-open, never gates)',
      judge.classifyJudgeFailure(budget.engineAiBudgetError()) === 'budget' &&
      perpPlans.includes("from './kalshi-perp-ai-judge'"));
  }

  // ── F. FX regime tie-break ─────────────────────────────────────────
  {
    const noVote = fxModels.resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 3 }, undefined);
    check('F1 no vote (e.g. the models call was budget-refused) → the scorecard decides, nothing blocks',
      noVote.dayType === 'mixed' && noVote.autoModel === 'M1' && noVote.regimeSource === 'scorecard' && noVote.tiebreakApplied === false);
    const garbage = fxModels.resolveRegimeWithAiVote({ dayType: 'trend', autoModel: 'M2', score: 5 }, { regime: 'banana', confidence: 'x' });
    check('F2 garbage vote → scorecard decides', garbage.dayType === 'trend' && garbage.regimeSource === 'scorecard');
    const voted = fxModels.resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 3 }, { regime: 'trend', confidence: 0.9 });
    check('F3 a bought vote still tie-breaks exactly as before (the degrade changes nothing when AI answers)',
      voted.dayType === 'trend' && voted.regimeSource === 'ai_tiebreak' && voted.tiebreakApplied === true);
    const fxm = src('server/services/fx-models.ts');
    check('F4 the vote rides inside the single models-cycle call — there is no separate vote purchase to refuse',
      count(fxm, 'chat.completions.create') === 1 && fxm.includes('parsed?.regimeVotes'));
  }

  // ── G. Reserve / metering: spend still hard-stops ──────────────────
  {
    const u = 990031;
    process.env.AI_ENGINE_DAILY_BUDGET_CENTS = '200';
    process.env.AI_BUDGET_RESERVE_CENTS = '100';
    const est = budget.engineAiEstCentsPerCall();
    const unitsFor100c = Math.ceil(100 / est);
    budget.meterEngineAiConfirmation(u, unitsFor100c, 'general');
    const generalFenced = await budget.engineAiBudgetAllows(u, 'general');
    const protectedStillServed = await budget.engineAiBudgetAllows(u, 'protected');
    budget.meterEngineAiConfirmation(u, unitsFor100c, 'protected');
    const protectedDry = await budget.engineAiBudgetAllows(u, 'protected');
    delete process.env.AI_ENGINE_DAILY_BUDGET_CENTS;
    delete process.env.AI_BUDGET_RESERVE_CENTS;
    check('G1 reserve fence unchanged: general lane stops at cap − reserve while protected is still served',
      generalFenced === false && protectedStillServed === true, `est/call=${est}¢`);
    check('G2 spend hard-stops at the cap for EVERY lane — the degrade buys nothing and changes no metering',
      protectedDry === false);
    check('G3 the budget verdict the FX gate degrades on is still the fail-closed shape (confirmed false, NEUTRAL, 0)',
      (() => { const v = budget.engineAiBudgetVerdict(); return v.confirmed === false && v.aiDirection === 'NEUTRAL' && v.aiConfidence === 0; })());
  }

  // ── H. Sol finding: the pool cannot block Sol entries ──────────────
  {
    const solEngine = src('server/services/sol-engine.ts');
    const solScanner = src('server/solana-scanner.ts');
    check('H1 per-token AI reasoning can never gate: any failure (budget included) falls back to the deterministic template',
      solScanner.includes("reasoning = templateReasoning;") && solScanner.includes('skipAiReasoning'));
    check('H2 the 2nd-confirmation review is fail-open by design: its failure logs "trades will proceed without consensus"',
      solEngine.includes('trades will proceed without consensus this cycle'));
    const gateStart = solEngine.indexOf('AI/Quant consensus gate');
    const gateSlice = solEngine.slice(gateStart, gateStart + 2200);
    check('H3 the entry gate is VETO-ONLY: it blocks on a fresh STRONG_SKIP or a quant hard-SKIP — absence of a verdict never blocks',
      gateStart > 0 &&
      gateSlice.includes("priorConsensus.consensus === 'STRONG_SKIP'") &&
      gateSlice.includes("priorConsensus.quantVerdict === 'SKIP' && priorConsensus.quantScore < 10") &&
      !gateSlice.includes('STRONG_CONFIRM'));
    check('H4 no Sol code imports the degrade module — nothing to degrade (the finding is pinned, not built)',
      !solEngine.includes('ai-budget-degrade') && !solScanner.includes('ai-budget-degrade'));
  }

  // ── I. sw pin ──────────────────────────────────────────────────────
  check('I1 sw bumped to vedd-v298', src('client/public/sw.js').includes("CACHE_VERSION = 'vedd-v298'"));

  wp.__setPerpWatchPlanStoreForCheck(null);
  console.log(`\n${total - failures}/${total} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error('check crashed:', e); process.exit(1); });
