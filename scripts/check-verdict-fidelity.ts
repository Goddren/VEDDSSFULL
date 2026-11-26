/**
 * Verdict-fidelity fix — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-verdict-fidelity.ts
 *
 * Diagnosis being fixed (code trace Nov 24, proven in production): on the
 * MT5 chart-data vision path, aiPasses read ONLY aiConfidence >= floor.
 * The model's parsed `confirmed` and `direction` were never consulted; the
 * only structured veto was smcVerdict==='PASS'. Two production verdicts
 * were labelled APPROVED with model direction NEUTRAL and reasoning that
 * concluded "reject" (Veteran Judge, gpt-oss-120b, 75 vs the 70 floor) —
 * and the advisory override could rewrite aiConfidence to exactly 75 (a
 * cap constant), so the feed displayed a number the model never gave.
 *
 * What is pinned:
 *   A. Pure evaluator truth table (fidelity ON) over
 *      confirmed × direction × confidence, including BOTH production
 *      cases (NEUTRAL / 75 / confirmed:false must NOT pass and must be a
 *      SKIP consensus vote).
 *   B. Kill switch: AI_VERDICT_FIDELITY=off restores the pre-fix
 *      confidence-only outcomes exactly, with vetoes still computed.
 *   C. Route wiring: the evaluator drives BOTH aiVerdict and aiPasses for
 *      vision verdicts (main path + breakout→vision fallback); pure
 *      breakout keeps confirmed-only; the SMC PASS hard block is
 *      byte-identical; the advisory override no longer rewrites
 *      aiConfirmation.aiConfidence (the cap survives only as
 *      advisoryEffectiveConfidence, consumed by the EA-facing response);
 *      both log writes + the outcome row use ADVISORY_OVERRIDE; both log
 *      writes stamp the raw-verdict snapshot + watch-plan linkage.
 *   D. openai.ts: confidenceDefaulted threading (coerceConfidenceDetailed
 *      behavior + parse sites + result/log types).
 *   E. Client: ADVISORY_OVERRIDE renders in both feeds and counts as an
 *      executed decision in weekly-strategy's isApproved enumerations;
 *      sw bumped to vedd-v298.
 */
import { readFileSync } from 'node:fs';

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passes++; else failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const fidelity = await import('../server/services/ai-verdict-fidelity');
const openai = await import('../server/openai');
const routes = src('../server/routes.ts');
const openaiSrc = src('../server/openai.ts');
const fidelitySrc = src('../server/services/ai-verdict-fidelity.ts');
const mt5Page = src('../client/src/pages/mt5-chart-data.tsx');
const weeklyPage = src('../client/src/pages/weekly-strategy.tsx');
const sw = src('../client/public/sw.js');

// ── A. Evaluator truth table (fidelity ON; passFloor 70, verdictBar 72) ──
{
  const ev = (over: Partial<Parameters<typeof fidelity.evaluateVisionVerdict>[0]>) =>
    fidelity.evaluateVisionVerdict({
      confirmed: true, aiDirection: 'SELL', aiConfidence: 75,
      proposedSignal: 'SELL', passFloor: 70, verdictBar: 72, fidelityOn: true,
      ...over,
    });

  // The two production cases (GBPJPY SELL 04:00:29, US30 SELL 03:09:05,
  // Nov 24): NEUTRAL direction, confidence 75 ≥ floor, reasoning = reject.
  const prod = ev({ confirmed: false, aiDirection: 'NEUTRAL' });
  check('A1 production shape (confirmed:false, NEUTRAL, 75) cannot pass', prod.aiPasses === false);
  check('A2 production shape is a SKIP consensus vote', prod.aiVerdict === 'SKIP');
  check('A3 production shape raises both vetoes', prod.directionVeto === true && prod.confirmedVeto === true);
  const prodBuy = ev({ confirmed: false, aiDirection: 'NEUTRAL', proposedSignal: 'BUY' });
  check('A4 production shape (BUY side) cannot pass either', prodBuy.aiPasses === false && prodBuy.aiVerdict === 'SKIP');

  const clean = ev({});
  check('A5 clean confirm (true, matching dir, 75) passes + CONFIRMs',
    clean.aiPasses === true && clean.aiVerdict === 'CONFIRM' && !clean.directionVeto && !clean.confirmedVeto);
  check('A6 confirmed:false with matching direction + 95 still cannot pass',
    ev({ confirmed: false, aiConfidence: 95 }).aiPasses === false);
  check('A7 opposite direction + confirmed + 95 cannot pass',
    ev({ aiDirection: 'BUY', aiConfidence: 95 }).aiPasses === false);
  check('A8 NEUTRAL + confirmed:true + 95 cannot pass (direction veto alone)',
    ev({ aiDirection: 'NEUTRAL', aiConfidence: 95 }).aiPasses === false);
  check('A9 below pass floor (65) cannot pass even with a clean verdict',
    ev({ aiConfidence: 65 }).aiPasses === false && ev({ aiConfidence: 65 }).aiVerdict === 'SKIP');
  check('A10 between floors (71: passes the pass floor, below the consensus bar) passes but votes SKIP',
    ev({ aiConfidence: 71 }).aiPasses === true && ev({ aiConfidence: 71 }).aiVerdict === 'SKIP');
  check('A11 non-boolean confirmed ("true" string) is a confirmed veto',
    ev({ confirmed: 'true' as any }).confirmedVeto === true && ev({ confirmed: 'true' as any }).aiPasses === false);
  check('A12 direction match is case-insensitive',
    ev({ aiDirection: 'sell' }).aiPasses === true);
  check('A13 missing direction is NEUTRAL → veto',
    ev({ aiDirection: undefined }).directionVeto === true && ev({ aiDirection: undefined }).aiPasses === false);
}

// ── B. Kill switch restores pre-fix semantics ─────────────────────────────
{
  const off = (over: Partial<Parameters<typeof fidelity.evaluateVisionVerdict>[0]>) =>
    fidelity.evaluateVisionVerdict({
      confirmed: true, aiDirection: 'SELL', aiConfidence: 75,
      proposedSignal: 'SELL', passFloor: 70, verdictBar: 72, fidelityOn: false,
      ...over,
    });
  const prodOff = off({ confirmed: false, aiDirection: 'NEUTRAL' });
  check('B1 kill-switch OFF: production shape passes on confidence alone (pre-fix behavior)',
    prodOff.aiPasses === true && prodOff.aiVerdict === 'CONFIRM');
  check('B2 kill-switch OFF: vetoes are still computed for telemetry',
    prodOff.directionVeto === true && prodOff.confirmedVeto === true);
  check('B3 kill-switch OFF: below-floor confidence still fails',
    off({ aiConfidence: 65 }).aiPasses === false && off({ aiConfidence: 65 }).aiVerdict === 'SKIP');
  check('B4 verdictFidelityEnabled reads the env at call time',
    fidelity.verdictFidelityEnabled() === (process.env.AI_VERDICT_FIDELITY !== 'off'));
  check('B5 kill-switch env name lives in the fidelity module',
    fidelitySrc.includes("process.env.AI_VERDICT_FIDELITY !== 'off'"));
}

// ── C. Route wiring ───────────────────────────────────────────────────────
{
  check('C1 route imports the fidelity module inside the gate block',
    routes.includes("const _verdictFidelity = await import('./services/ai-verdict-fidelity');"));
  check('C2 vision-verdict detection covers main path + breakout→vision fallback',
    routes.includes("const _isVisionVerdict = !useBreakoutMode || _cdiag.stage === 'breakout_vision_fallback';"));
  check('C3 aiVerdict comes from the evaluator when a vision verdict is present',
    routes.includes('const aiVerdict: \'CONFIRM\' | \'SKIP\' = _verdictEval') &&
    routes.includes('? _verdictEval.aiVerdict') &&
    routes.includes(': (aiConfirmation.confirmed ? \'CONFIRM\' : \'SKIP\');'));
  check('C4 aiPasses comes from the evaluator; breakout keeps confirmed-only',
    routes.includes('const aiPasses = _verdictEval') &&
    routes.includes('? _verdictEval.aiPasses') &&
    routes.includes(': aiConfirmation.confirmed;'));
  check('C5 the old confidence-only aiPasses expression is gone',
    !routes.includes(': aiConfirmation.aiConfidence >= AI_MIN_CONFIDENCE;'));
  check('C6 SMC PASS hard block is unchanged',
    routes.includes("const _smcSaysNo = _smcOn && aiConfirmation.smcVerdict === 'PASS';") &&
    routes.includes('const tradeAllowed = !_smcSaysNo'));
  check('C7 advisory override stores the cap ONLY as advisoryEffectiveConfidence',
    routes.includes('(aiConfirmation as any).advisoryEffectiveConfidence = Math.max(60, Math.min(preConfirmConfidence, 75));') &&
    routes.includes('(aiConfirmation as any).modelAiConfidence = _modelVerdict.confidence;'));
  check('C8 the confidence rewrite survives exactly once — inside the kill-switch-off branch',
    count(routes, 'aiConfirmation.aiConfidence = Math.max(60, Math.min(preConfirmConfidence, 75));') === 1);
  check('C9 ADVISORY_OVERRIDE label on both the log write and the outcome row (behind the 2026-11-26 RULES_ONLY_BUDGET head — mutually exclusive: the override cannot fire on an errored verdict, a degraded one never carries its label)',
    count(routes, "_advisoryLabel ? 'ADVISORY_OVERRIDE' :") === 2 &&
    count(routes, "aiDecision: _budgetDegraded ? 'RULES_ONLY_BUDGET' :") === 2);
  check('C10 raw-verdict snapshot is taken before the gate (before tradeAllowed)',
    routes.indexOf('const _modelVerdict = {') > -1 &&
    routes.indexOf('const _modelVerdict = {') < routes.indexOf('const tradeAllowed = !_smcSaysNo'));
  check('C11 both log writes stamp the raw-verdict + plan-linkage fields',
    count(routes, '..._rawVerdictLog,') === 2 &&
    routes.includes('modelConfirmed: _modelVerdict.confirmed,') &&
    routes.includes('watchPlanId: String(_wpDiag.id), watchPlanTriggered: !!_wpDiag.triggered'));
  check('C12 EA-facing response reports the effective (capped) confidence',
    routes.includes('mt5AiConfidence: (aiConfirmation as any)?.advisoryEffectiveConfidence ?? aiConfirmation?.aiConfidence ?? 0,') &&
    routes.includes('aiConfidence: (aiConfirmation as any).advisoryEffectiveConfidence ?? aiConfirmation.aiConfidence,'));
  check('C13 fidelity veto is logged with both veto flags',
    routes.includes('verdict-fidelity veto — model direction='));
}

// ── D. openai.ts threading ────────────────────────────────────────────────
{
  check('D1 coerceConfidenceDetailed flags the fallback',
    JSON.stringify(openai.coerceConfidenceDetailed('not-a-number')) === JSON.stringify({ value: 50, defaulted: true }) &&
    JSON.stringify(openai.coerceConfidenceDetailed(undefined)) === JSON.stringify({ value: 50, defaulted: true }));
  check('D2 coerceConfidenceDetailed passes real values through unflagged',
    JSON.stringify(openai.coerceConfidenceDetailed(75)) === JSON.stringify({ value: 75, defaulted: false }) &&
    JSON.stringify(openai.coerceConfidenceDetailed(0.5)) === JSON.stringify({ value: 50, defaulted: false }));
  check('D3 coerceConfidence behavior is unchanged (delegates / same outputs)',
    openai.coerceConfidence('x') === 50 && openai.coerceConfidence(75) === 75 && openai.coerceConfidence(0.5) === 50 && openai.coerceConfidence(1) === 1);
  check('D4 result type + both model parse sites thread confidenceDefaulted',
    openaiSrc.includes('confidenceDefaulted?: boolean;') &&
    openaiSrc.includes('confidenceDefaulted: _judgeConf.defaulted,') &&
    openaiSrc.includes('confidenceDefaulted: _visionConf.defaulted,'));
  check('D5 log-entry type carries the label + raw-verdict + plan-linkage fields',
    openaiSrc.includes("'ADVISORY_OVERRIDE'") &&
    openaiSrc.includes('modelConfirmed?: boolean;') &&
    openaiSrc.includes('watchPlanId?: string;') &&
    openaiSrc.includes('watchPlanTriggered?: boolean;'));
}

// ── E. Client ─────────────────────────────────────────────────────────────
{
  check('E1 mt5-chart-data renders ADVISORY_OVERRIDE distinctly',
    mt5Page.includes("log.aiDecision === 'ADVISORY_OVERRIDE'") &&
    mt5Page.includes("'ADVISORY OVERRIDE'"));
  check('E2 weekly-strategy renders ADVISORY_OVERRIDE distinctly',
    weeklyPage.includes("log.aiDecision === 'ADVISORY_OVERRIDE'") &&
    weeklyPage.includes("'ADVISORY OVERRIDE'"));
  check('E3 weekly-strategy counts ADVISORY_OVERRIDE as an executed decision in both enumerations',
    count(weeklyPage, "latest?.aiDecision === 'ADVISORY_OVERRIDE';") === 1 &&
    count(weeklyPage, "log.aiDecision === 'ADVISORY_OVERRIDE';") === 1);
  check('E4 sw bumped to vedd-v298 for the client change',
    sw.includes("CACHE_VERSION = 'vedd-v298'"));
}

console.log(`\n${passes} passed, ${failures} failed`);
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
