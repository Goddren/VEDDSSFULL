/**
 * Kalshi perp AI judge — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-perp-ai-judge.ts
 *
 * No database, broker, market-data, or provider calls: the judge's pure
 * helpers (prompt, parse, failure classification, scoreboard math) are
 * exercised directly, the call seam is faked to count invocations, and
 * the lane wiring (post-gate placement, verdict-never-gates, persistence,
 * kill switch, cost guard, live-lane isolation, metering) is pinned by
 * source checks.
 *
 *   A. Judge runs post-gate/pre-open and cannot block: lane source places
 *      the judge call after every gate's `continue` and before the trade
 *      INSERT, and no code between the judge call and the open reads the
 *      verdict. Behavioral: approve/reject/unsure/no_verdict results are
 *      all returned as records — the judge function itself has no way to
 *      veto anything.
 *   B. Verdict persisted on the context row: the lane's context INSERT
 *      carries all six ai_judge_* columns from the judge result, and the
 *      ensure-tables chain adds them with ADD COLUMN IF NOT EXISTS.
 *   C. AI failure → no_verdict + entry proceeds: provider throw and
 *      bad-JSON reply both resolve to no_verdict results (never throw).
 *   D. Budget-blocked (402-shaped / budgetBlocked) → no_verdict with
 *      failure class 'budget', metered=false.
 *   E. Kill switch off → judgeKalshiPerpCandidate returns null and makes
 *      ZERO calls.
 *   F. Blocked candidates are never judged: the only judge invocation in
 *      the lane sits after the brain/VP/earnings/throttle gates (their
 *      `continue`s precede it) — pinned by source position.
 *   G. Scoreboard aggregation on fixtures: approve vs reject win rate /
 *      avg R / net match hand-computed values; invalid rows skipped.
 *   H. Metering exactly once: the judge buys through
 *      getUniversalAIClientForUser(userId, { engine: true }) — the shared
 *      engine-marked client that meters answered calls once — and never
 *      calls meterEngineAiConfirmation itself; dedupe makes an identical
 *      repeat candidate cost zero additional calls.
 *   I. Parse + prompt hygiene: strict JSON, prose-wrapped JSON, 0–100
 *      confidence rescale, garbage → null; the prompt stays lean.
 *   J. Live-lane isolation: kalshi-perp-live.ts never references the
 *      judge; sw bumped to vedd-v294 for the panel change.
 */
import { readFileSync } from 'node:fs';
import {
  kalshiPerpAiJudgeEnabled, judgeKalshiPerpCandidate, parseJudgeResponse,
  classifyJudgeFailure, buildJudgePrompt, aggregateAiJudgeScoreboard,
  summarizeJudgeRows, strategyRecordFromRows, bucketEvidenceFor,
  clearJudgeDedupe, type PerpJudgeCandidate,
} from '../server/services/kalshi-perp-ai-judge';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(p, 'utf8');

const CAND: PerpJudgeCandidate = {
  userId: 1, strategy: 'orb', ticker: 'KXAAPLPERP1', underlying: 'AAPL',
  direction: 'long', entryPrice: 231.5, score: null, sessionEt: 'regular',
  spreadBps: 12, atrPct: 1.1, fundingRateAtEntry: 0.0001, htfAligned: true,
  h1Trend: 'BULLISH', h4Trend: 'BULLISH', vpPosition: 'above_value',
  adviceAtEntry: 'favor — session: regular median +0.80% over 20 trades',
  recentCloses: [228.1, 229.0, 230.2, 231.5],
};
const okReply = (v: string, conf = 0.8) => async () => ({
  content: JSON.stringify({ verdict: v, confidence: conf, reason: `fixture ${v}` }), model: 'fixture-model',
});

async function main(): Promise<void> {
  const lane = src('server/services/kalshi-stock-shadow.ts');
  const judgeSrc = src('server/services/kalshi-perp-ai-judge.ts');
  const ensureSrc = src('server/services/ensure-kalshi-perp-shadow-tables.ts');

  // A — placement + non-gating shape
  {
    const judgeIdx = lane.indexOf('judgeKalshiPerpCandidate({');
    const insIdx = lane.indexOf('INSERT INTO kalshi_perp_shadow_trades');
    const brainIdx = lane.indexOf('evaluatePerpBrainGate(stats');
    const vpIdx = lane.indexOf('vpValueEdgeBlock(sig.direction');
    const earnIdx = lane.indexOf('earningsBlockApplies(eInfo');
    const throttleIdx = lane.indexOf('improvementThrottleBlocks(userId');
    check('A1 judge call exists in the entry loop', judgeIdx > 0);
    check('A2 judge runs AFTER brain gate, VP veto, earnings and throttle gates',
      judgeIdx > brainIdx && judgeIdx > vpIdx && judgeIdx > earnIdx && judgeIdx > throttleIdx);
    check('A3 judge runs BEFORE the trade INSERT (pre-open)', judgeIdx > 0 && judgeIdx < insIdx);
    const between = lane.slice(judgeIdx, insIdx);
    check('A4 nothing between the judge call and the open branches on the verdict',
      !/if\s*\([^)]*judge/.test(between) && !between.includes('judge.verdict') && !between.includes('judge?.verdict'));
    clearJudgeDedupe();
    const r = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.01 }, { callAi: okReply('reject', 0.95) });
    check('A5 a confident REJECT is returned as a record, not a veto', r?.verdict === 'reject' && r.confidence === 0.95 && r.metered === true);
  }

  // B — persistence
  {
    const ctxIns = lane.slice(lane.indexOf('INSERT INTO kalshi_perp_shadow_context'));
    check('B1 context INSERT carries all six ai_judge_* columns',
      ['ai_judge_verdict', 'ai_judge_confidence', 'ai_judge_reason', 'ai_judge_model', 'ai_judge_failure', 'ai_judge_metered']
        .every((c) => ctxIns.includes(c)));
    check('B2 context INSERT stamps values from the judge result',
      ctxIns.includes('judge?.verdict ?? null') && ctxIns.includes('judge?.confidence ?? null') && ctxIns.includes('judge ? judge.metered : null'));
    check('B3 ensure-tables adds the columns non-destructively',
      ['ai_judge_verdict text', 'ai_judge_confidence double precision', 'ai_judge_reason text', 'ai_judge_model text', 'ai_judge_failure text', 'ai_judge_metered boolean']
        .every((c) => ensureSrc.includes(`ADD COLUMN IF NOT EXISTS ${c}`)));
  }

  // C — failures fail open
  {
    clearJudgeDedupe();
    const boom = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.02 }, {
      callAi: async () => { throw new Error('socket hang up'); },
    });
    check('C1 provider throw → no_verdict/provider, never throws', boom?.verdict === 'no_verdict' && boom.failure === 'provider' && boom.metered === false);
    clearJudgeDedupe();
    const badJson = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.03 }, {
      callAi: async () => ({ content: 'the setup looks fine to me', model: 'fixture-model' }),
    });
    check('C2 unparseable reply → no_verdict/bad_json', badJson?.verdict === 'no_verdict' && badJson.failure === 'bad_json');
    clearJudgeDedupe();
    const slow = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.04 }, {
      callAi: async () => { throw new Error('judge call timed out after 30000ms'); },
    });
    check('C3 timeout → no_verdict/timeout', slow?.verdict === 'no_verdict' && slow.failure === 'timeout');
  }

  // D — budget block
  {
    clearJudgeDedupe();
    const budgetErr: any = new Error('402 Insufficient credits — daily AI budget reached');
    budgetErr.status = 402; budgetErr.budgetBlocked = true; budgetErr.aiErrorStatus = 'budget';
    const blocked = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.05 }, {
      callAi: async () => { throw budgetErr; },
    });
    check('D1 budget-blocked → no_verdict/budget, unmetered', blocked?.verdict === 'no_verdict' && blocked.failure === 'budget' && blocked.metered === false);
    check('D2 classifyJudgeFailure reads the budget marker', classifyJudgeFailure(budgetErr) === 'budget');
    check('D3 classifyJudgeFailure reads a bare 402', classifyJudgeFailure(Object.assign(new Error('nope'), { status: 402 })) === 'budget');
  }

  // E — kill switch
  {
    let calls = 0;
    process.env.KALSHI_PERP_AI_JUDGE = 'off';
    try {
      check('E1 kill switch flips the enabled check', !kalshiPerpAiJudgeEnabled());
      const off = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.06 }, {
        callAi: async () => { calls++; return { content: '{}', model: 'x' }; },
      });
      check('E2 judge off → null result and ZERO calls', off === null && calls === 0);
    } finally { delete process.env.KALSHI_PERP_AI_JUDGE; }
    check('E3 judge defaults back on', kalshiPerpAiJudgeEnabled());
  }

  // F — blocked candidates never judged (structural)
  {
    const callSites = lane.split('judgeKalshiPerpCandidate({').length - 1;
    check('F1 exactly one judge invocation site in the lane', callSites === 1, `found ${callSites} call sites`);
    const judgeIdx = lane.indexOf('judgeKalshiPerpCandidate({');
    const gateContinues = ['logPerpBrainBlocks(userId, gate.avoid', 'vpValueEdgeBlock(sig.direction', 'earningsBlockApplies(eInfo', 'improvementThrottleBlocks(userId'];
    check('F2 every gate skip sits before the judge call', gateContinues.every((g) => lane.indexOf(g) > 0 && lane.indexOf(g) < judgeIdx));
  }

  // G — scoreboard math on fixtures
  {
    const sb = aggregateAiJudgeScoreboard([
      { verdict: 'approve', returnPct: 4, rMultiple: 2, notionalUsd: 250 },
      { verdict: 'approve', returnPct: -2, rMultiple: -1, notionalUsd: 250 },
      { verdict: 'approve', returnPct: 2, rMultiple: 1, notionalUsd: 200 },
      { verdict: 'reject', returnPct: -4, rMultiple: -2, notionalUsd: 250 },
      { verdict: 'reject', returnPct: -2, rMultiple: -1, notionalUsd: 250 },
      { verdict: 'unsure', returnPct: 0, rMultiple: 0, notionalUsd: 250 },
      { verdict: 'no_verdict', returnPct: 6, rMultiple: 3, notionalUsd: 100 },
      { verdict: 'approve', returnPct: NaN, rMultiple: 9, notionalUsd: 250 }, // invalid row skipped
    ]);
    check('G1 approve bucket: n=3, wins=2, WR=2/3', sb.approve.n === 3 && sb.approve.wins === 2 && Math.abs((sb.approve.winRate ?? 0) - 2 / 3) < 1e-9);
    check('G2 approve avgR = (2 − 1 + 1)/3', Math.abs((sb.approve.avgR ?? 0) - 2 / 3) < 1e-9);
    check('G3 approve net = 10 − 5 + 4 = $9', sb.approve.netUsd === 9);
    check('G4 reject bucket: n=2, WR=0, avgR=−1.5, net=−$15', sb.reject.n === 2 && sb.reject.winRate === 0 && sb.reject.avgR === -1.5 && sb.reject.netUsd === -15);
    check('G5 unsure flat row counts as a non-win', sb.unsure.n === 1 && sb.unsure.wins === 0 && sb.unsure.winRate === 0);
    check('G6 no_verdict bucket keeps its own stats', sb.noVerdict.n === 1 && sb.noVerdict.netUsd === 6);
    check('G7 judgedCloses excludes the invalid row', sb.judgedCloses === 7);
    const empty = aggregateAiJudgeScoreboard([]);
    check('G8 empty input → empty scoreboard', empty.judgedCloses === 0 && empty.approve.winRate === null && empty.approve.avgR === null);
  }

  // H — metering exactly once + dedupe
  {
    check('H1 judge buys through the engine-marked client', judgeSrc.includes("getUniversalAIClientForUser(c.userId, { engine: true, engineLane: 'protected' })"));
    check('H2 judge module never meters itself', !judgeSrc.includes('meterEngineAiConfirmation'));
    clearJudgeDedupe();
    let calls = 0;
    const counting = async () => { calls++; return { content: JSON.stringify({ verdict: 'approve', confidence: 0.7, reason: 'ok' }), model: 'fixture-model' }; };
    const first = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.07 }, { callAi: counting });
    const second = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.07 }, { callAi: counting });
    check('H3 identical repeat candidate in-cycle costs zero extra calls', calls === 1 && first?.metered === true && second?.deduped === true && second?.metered === false);
    const third = await judgeKalshiPerpCandidate({ ...CAND, entryPrice: 999.08 }, { callAi: counting });
    check('H4 a different entry price is a new candidate (judged fresh)', calls === 2 && third?.deduped !== true);
  }

  // I — parse + prompt hygiene
  {
    check('I1 strict JSON parses', parseJudgeResponse('{"verdict":"approve","confidence":0.8,"reason":"trend aligned"}')?.verdict === 'approve');
    check('I2 prose-wrapped JSON salvaged', parseJudgeResponse('Here is my call: {"verdict":"reject","confidence":0.6,"reason":"against HTF"} — good luck')?.verdict === 'reject');
    check('I3 0–100 confidence rescaled to 0–1', parseJudgeResponse('{"verdict":"unsure","confidence":55,"reason":"mixed"}')?.confidence === 0.55);
    check('I4 garbage → null', parseJudgeResponse('no json here') === null && parseJudgeResponse('') === null);
    check('I5 unknown verdict → null', parseJudgeResponse('{"verdict":"moon","confidence":1,"reason":"x"}') === null);
    const p = buildJudgePrompt(CAND);
    check('I6 prompt carries candidate + lane context', p.user.includes('orb') && p.user.includes('AAPL') && p.user.includes('Recent H1 closes'));
    check('I7 bare-candidate prompt stays lean (< 1500 chars user message)', p.user.length < 1500, `${p.user.length} chars`);
  }

  // K — enriched context (Chris's 2026-11-22 scope refinement): the judge
  // weighs the candidate against the lane's collected data — ticker
  // history, strategy record + form, bucket evidence — token-lean.
  {
    const nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
    const rows = [
      { netPct: 4, rMultiple: 2, closedAtMs: nowMs - 2 * 86_400_000 },
      { netPct: -2, rMultiple: -1, closedAtMs: nowMs - 5 * 86_400_000 },
      { netPct: 2, rMultiple: 1, closedAtMs: nowMs - 20 * 86_400_000 },
      { netPct: -4, rMultiple: -2, closedAtMs: nowMs - 40 * 86_400_000 },
    ];
    const sum = summarizeJudgeRows(rows);
    check('K1 ticker-history aggregate: n/WR/avgR/median', sum.n === 4 && sum.winRate === 0.5 && sum.avgR === 0 && sum.medianNetPct === 0);
    const rec = strategyRecordFromRows(rows, nowMs);
    check('K2 strategy form splits last-14d vs prior-14d', rec.last14d?.n === 2 && rec.prior14d?.n === 1 && rec.overall.n === 4);
    const ev = bucketEvidenceFor([
      { strategy: 'orb', dim: 'session', bucket: 'regular', n: 20, medianNet: 0.8, verdict: 'favor' },
      { strategy: 'orb', dim: 'side', bucket: 'long', n: 30, medianNet: -1.9, verdict: 'avoid' },
      { strategy: 'orb', dim: 'session', bucket: 'overnight', n: 99, medianNet: -5, verdict: 'avoid' }, // different bucket value — excluded
      { strategy: 'breakout', dim: 'side', bucket: 'long', n: 99, medianNet: -5, verdict: 'avoid' }, // different strategy — excluded
      { strategy: 'orb', dim: 'vp', bucket: 'above_value', n: 6, medianNet: 0.2, verdict: 'learning' },
    ], 'orb', { session: 'regular', side: 'long', vp: 'above_value' });
    check('K3 bucket evidence matches the brain rule (strategy + bucket value), includes learning',
      ev.length === 3 && ev[0].verdict === 'avoid' && ev.some((e) => e.verdict === 'learning'));
    const rich: PerpJudgeCandidate = {
      ...CAND,
      earningsWithin48h: false,
      tickerHistory: {
        summary: sum,
        recent: Array.from({ length: 10 }, (_, i) => ({ strategy: 'orb', direction: 'long', netPct: i % 2 ? -2 : 4, rMultiple: i % 2 ? -1 : 2 })),
      },
      strategyRecord: rec,
      bucketEvidence: ev,
    };
    const p = buildJudgePrompt(rich);
    check('K4 prompt includes TICKER HISTORY section with aggregates + last closes',
      p.user.includes('TICKER HISTORY') && p.user.includes('4 trades, 50% WR') && p.user.includes('Last closes on AAPL'));
    check('K5 prompt includes STRATEGY RECORD + recent form',
      p.user.includes('STRATEGY RECORD') && p.user.includes('last 14d') && p.user.includes('prior 14d'));
    check('K6 prompt includes BUCKET EVIDENCE with verdict/n/median',
      p.user.includes('BUCKET EVIDENCE') && p.user.includes('side=long: avoid (n=30, median net -1.90%)'));
    check('K7 prompt includes current context (earnings proximity)', p.user.includes('earnings within 48h: no'));
    check('K8 fully-enriched prompt stays under the size cap (< 2600 chars)', p.user.length < 2600, `${p.user.length} chars`);
    check('K9 lane gathers history once per cycle, only when the judge is on',
      lane.includes('if (judgeOn)') && lane.includes('judgeRowsByUnderlying') && lane.includes('LIMIT 500'));
    check('K10 lane passes ticker history, strategy record and bucket evidence into the judge call',
      lane.includes('tickerHistory,') && lane.includes('strategyRecord,') && lane.includes('bucketEvidence: bucketEvidenceFor(stats, sig.strategy, kalshiBucketsOf(ctx))'));
  }

  // J — isolation + sw
  {
    const live = src('server/services/kalshi-perp-live.ts');
    check('J1 live perp path never references the judge', !live.includes('ai-judge') && !live.includes('AiJudge') && !live.includes('judgeKalshi'));
    check('J2 report exposes the aiJudge scoreboard', lane.includes('aggregateAiJudgeScoreboard') && lane.includes('aiJudge,'));
    check('J3 sw bumped to vedd-v294', src('client/public/sw.js').includes("CACHE_VERSION = 'vedd-v294'"));
    const panel = src('client/src/components/kalshi-shadow-panel.tsx');
    check('J4 panel renders the AI judge section with honest copy', panel.includes('AI judge') && panel.includes('collecting evidence') && panel.includes('never blocking'));
  }

  console.log(`\n${total - failures}/${total} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error('check crashed:', e); process.exit(1); });
