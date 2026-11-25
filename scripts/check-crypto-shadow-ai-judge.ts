/**
 * Crypto shadow AI judge — "the AI scores shadow entries, it never gates
 * them" — verification checks (2026-11-22).
 *
 * Run:  node --import tsx/esm scripts/check-crypto-shadow-ai-judge.ts
 *
 * No database and no provider are touched: the verdict mapping and the
 * scoreboard aggregation are pure and exercised on fixtures; the judge
 * runner is exercised with an injected fake confirmation (the real one is
 * the live engine's crypto-ai-confirmation, reused as-is); the wiring is
 * pinned by source checks — judge runs only after the lesson gate and the
 * improvement throttle, only after the trade row exists, its result is
 * only ever written into the context INSERT, and the live confirmation's
 * cache keys stay byte-identical unless a cacheScope is passed.
 *
 *   A. judgeStampFromConfirmation — verdict mapping, errors ≠ rejection.
 *   B. judgeCryptoShadowEntry — fail-open: throw/timeout/off → no_verdict.
 *   C. Metering + cache isolation — engine-marked client, namespaced keys.
 *   D. Wiring — post-gate, post-insert, stamp-only (cannot skip an entry).
 *   E. aggregateAiJudge — scoreboard math, long/short split.
 *   F. Panel + payload + columns + sw pins.
 */
import { readFileSync } from 'node:fs';
import {
  judgeStampFromConfirmation, judgeCryptoShadowEntry, aggregateAiJudge,
  cryptoShadowAiJudgeOn, buildJudgeEvidence, summarizeJudgeCloses, strategyForm,
  type CryptoJudgeStamp, type JudgeEvidenceInput,
} from '../server/services/crypto-shadow';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9;

// ── A. Verdict mapping (pure) ─────────────────────────────────────────────
const conf = (over: Record<string, any> = {}) => ({
  confirmed: true, aiDirection: 'BUY' as const, aiConfidence: 82, reasoning: 'trend and flow agree', ...over,
});
check('A1 confirmed + agreeing direction → confirmed', judgeStampFromConfirmation(conf(), 'BUY').verdict === 'confirmed');
check('A2 confirmed + NEUTRAL direction → confirmed (does not oppose)', judgeStampFromConfirmation(conf({ aiDirection: 'NEUTRAL' }), 'BUY').verdict === 'confirmed');
check('A3 confirmed but opposing direction → not_confirmed', judgeStampFromConfirmation(conf({ aiDirection: 'SELL' }), 'BUY').verdict === 'not_confirmed');
check('A4 model declines → not_confirmed', judgeStampFromConfirmation(conf({ confirmed: false }), 'BUY').verdict === 'not_confirmed');
check('A5 SELL proposal confirmed by SELL → confirmed', judgeStampFromConfirmation(conf({ aiDirection: 'SELL' }), 'SELL').verdict === 'confirmed');
{
  const s = judgeStampFromConfirmation(conf({ aiError: true, aiErrorStatus: 402, confirmed: false, reasoning: 'budget reached' }), 'BUY');
  check('A6 budget block (402) → no_verdict, failure=budget — never a rejection', s.verdict === 'no_verdict' && s.failure === 'budget');
}
check('A7 rate limit (429) → no_verdict/rate_limit', judgeStampFromConfirmation(conf({ aiError: true, aiErrorStatus: 429 }), 'BUY').failure === 'rate_limit');
check('A8 provider error (500) → no_verdict/ai_error', judgeStampFromConfirmation(conf({ aiError: true, aiErrorStatus: 500 }), 'BUY').failure === 'ai_error');
check('A9 auth error (401) → no_verdict/auth', judgeStampFromConfirmation(conf({ aiError: true, aiErrorStatus: 401 }), 'BUY').failure === 'auth');
check('A10 null confirmation → no_verdict', judgeStampFromConfirmation(null, 'BUY').verdict === 'no_verdict');
{
  const s = judgeStampFromConfirmation(conf(), 'BUY');
  check('A11 stamp carries direction/confidence/reason', s.aiDirection === 'BUY' && s.confidence === 82 && s.reason === 'trend and flow agree' && s.failure === null);
}

// ── B. Judge runner — fail-open everywhere ────────────────────────────────
const judgeArgs = { userId: 1, symbol: 'WETH', strategy: 'momentum', direction: 'BUY' as const, price: 3000, score: 80, reasoning: 'scanner', trend: 'BULLISH', candles: [] as any[] };
{
  let seenOpts: any = null;
  const s = await judgeCryptoShadowEntry(judgeArgs, async (opts: any) => { seenOpts = opts; return conf(); });
  check('B1 injected confirmation → confirmed stamp', s.verdict === 'confirmed');
  check('B2 judge passes the shadow cache scope', seenOpts?.cacheScope === 'shadow-h1');
  check('B3 judge passes entry fields through (score clamped, trend as the only indicator)',
    seenOpts?.quantScore === 80 && seenOpts?.indicators?.trend === 'BULLISH' && Object.keys(seenOpts?.indicators ?? {}).length === 1);
}
{
  const s = await judgeCryptoShadowEntry(judgeArgs, async () => { throw new Error('provider down'); });
  check('B4 confirmation throws → no_verdict/exception, entry unaffected', s.verdict === 'no_verdict' && s.failure === 'exception');
}
{
  process.env.CRYPTO_SHADOW_AI_JUDGE_TIMEOUT_MS = '50';
  const keepAlive = setInterval(() => {}, 10);
  const s = await judgeCryptoShadowEntry(judgeArgs, async () => new Promise(() => {}));
  clearInterval(keepAlive);
  delete process.env.CRYPTO_SHADOW_AI_JUDGE_TIMEOUT_MS;
  check('B5 confirmation hangs → no_verdict/timeout after the cap', s.verdict === 'no_verdict' && s.failure === 'timeout');
}
{
  process.env.CRYPTO_SHADOW_AI_JUDGE = 'off';
  let calls = 0;
  const s = await judgeCryptoShadowEntry(judgeArgs, async () => { calls++; return conf(); });
  check('B6 kill switch off → zero judge calls', calls === 0 && cryptoShadowAiJudgeOn() === false && s.failure === 'judge_off');
  delete process.env.CRYPTO_SHADOW_AI_JUDGE;
  check('B7 kill switch defaults on', cryptoShadowAiJudgeOn() === true);
}
{
  const s = await judgeCryptoShadowEntry({ ...judgeArgs, score: 250 }, async (opts: any) => conf({ __opts: opts }));
  check('B8 stamp shape is complete', (['confirmed', 'not_confirmed', 'no_verdict'] as const).includes(s.verdict) && 'aiDirection' in s && 'confidence' in s && 'failure' in s);
}
{
  let seenOpts: any = null;
  await judgeCryptoShadowEntry({ ...judgeArgs, evidence: 'LANE EVIDENCE test block' }, async (opts: any) => { seenOpts = opts; return conf(); });
  check('B9 lane evidence is passed through to the confirmation', seenOpts?.evidence === 'LANE EVIDENCE test block');
  let bareOpts: any = null;
  await judgeCryptoShadowEntry(judgeArgs, async (opts: any) => { bareOpts = opts; return conf(); });
  check('B10 no evidence → confirmation called without it (prompt unchanged)', bareOpts?.evidence === undefined);
}

// ── C. Metering + cache isolation (source pins) ───────────────────────────
const shadowSrc = src('../server/services/crypto-shadow.ts');
const confirmSrc = src('../server/services/crypto-ai-confirmation.ts');
check('C1 judge reuses the live confirmation module (dynamic import, no new prompt)',
  shadowSrc.includes("await import('./crypto-ai-confirmation')") && shadowSrc.includes('getCryptoAiConfirmation'));
check('C2 confirmation client is engine-marked (shared pool metering, as live)',
  confirmSrc.includes('getUniversalAIClientForUser(opts.userId, { engine: true, engineLane: opts.cacheScope ? \'protected\' : \'general\' })'));
check('C3 shadow lane adds NO second meter/client of its own',
  !shadowSrc.includes('ai-engine-budget') && !shadowSrc.includes('meterEngineAi') && !shadowSrc.includes('getUniversalAIClientForUser'));
check('C4 cacheScope namespaces the verdict cache key', confirmSrc.includes("`${CONFIRM_TIMEFRAME}:${opts.cacheScope}`"));
check('C5 no cacheScope → live cache keys byte-identical to before',
  confirmSrc.includes("opts.cacheScope ? `${CONFIRM_TIMEFRAME}:${opts.cacheScope}` : CONFIRM_TIMEFRAME"));
check('C6 judge asks in the shadow-h1 namespace', shadowSrc.includes("cacheScope: 'shadow-h1'"));

// ── D. Wiring — post-gate, post-insert, stamp-only ────────────────────────
const gateIdx = shadowSrc.indexOf('matchingAvoidBucket');
const throttleIdx = shadowSrc.indexOf('improvementThrottleBlocks(userId');
const tradeInsertIdx = shadowSrc.indexOf('INSERT INTO crypto_shadow_trades');
const judgeIdx = shadowSrc.indexOf('judgeCryptoShadowEntry({');
const ctxInsertIdx = shadowSrc.indexOf('INSERT INTO crypto_shadow_context');
check('D1 lesson gate runs before the judge (skipped signals are never judged)', gateIdx > -1 && judgeIdx > gateIdx);
check('D2 improvement throttle runs before the judge', throttleIdx > -1 && judgeIdx > throttleIdx);
check('D3 judge runs only after the trade row exists (entry already recorded)', tradeInsertIdx > -1 && judgeIdx > tradeInsertIdx);
check('D4 verdict lands on the context insert', ctxInsertIdx > judgeIdx && shadowSrc.slice(ctxInsertIdx, ctxInsertIdx + 1400).includes('judge_verdict'));
{
  const between = shadowSrc.slice(judgeIdx, ctxInsertIdx);
  check('D5 nothing between judge and context insert can skip the entry (no continue/throw)',
    !between.includes('continue') && !between.includes('throw'));
}
check('D6 judge call is fail-open wrapped', shadowSrc.includes('.catch(() => null)') && shadowSrc.includes('judgeCryptoShadowEntry({'));
check('D7 kill switch gates the call site', shadowSrc.includes('if (cryptoShadowAiJudgeOn())'));

// ── E. Scoreboard aggregation (fixtures) ──────────────────────────────────
const jrow = (over: Record<string, any>): Record<string, any> => ({ direction: 'long', judge_verdict: 'confirmed', net_pct: 2, r_multiple: 1, ...over });
{
  const stats = aggregateAiJudge([
    jrow({ net_pct: 2, r_multiple: 1 }), jrow({ net_pct: -1, r_multiple: -0.5 }), jrow({ net_pct: 3, r_multiple: 1.5 }),
    jrow({ direction: 'short', net_pct: -4, r_multiple: -2 }),
    jrow({ judge_verdict: 'no_verdict', net_pct: 1, r_multiple: 0.5 }),
    jrow({ judge_verdict: null, net_pct: 99, r_multiple: 99 }),
    jrow({ net_pct: null }),
  ]);
  const lc = stats.find((s) => s.side === 'long' && s.verdict === 'confirmed');
  check('E1 long/confirmed aggregates apart', !!lc && lc.n === 3 && approx(lc.winRate, 2 / 3) && approx(lc.medianNet, 2) && approx(lc.avgR ?? NaN, (1 - 0.5 + 1.5) / 3), JSON.stringify(lc));
  const ss = stats.find((s) => s.side === 'short' && s.verdict === 'confirmed');
  check('E2 hypothetical shorts are never blended into longs', !!ss && ss.n === 1 && approx(ss.medianNet, -4));
  const nv = stats.find((s) => s.side === 'long' && s.verdict === 'no_verdict');
  check('E3 no_verdict is its own bucket', !!nv && nv.n === 1);
  check('E4 unstamped (pre-judge) and net-less rows are excluded', stats.reduce((a, s) => a + s.n, 0) === 5);
}
{
  const stats = aggregateAiJudge([jrow({ r_multiple: null })]);
  check('E5 avgR is null when no R was recorded', stats.length === 1 && stats[0].avgR === null);
  check('E6 empty input → empty scoreboard', aggregateAiJudge([]).length === 0);
}

// ── F. Storage, payload, panel, sw ────────────────────────────────────────
check('F1 judge columns added via the established ALTER pattern',
  shadowSrc.includes('ADD COLUMN IF NOT EXISTS judge_verdict') && shadowSrc.includes('ADD COLUMN IF NOT EXISTS judge_failure'));
check('F2 scoreboard query reads closed, stamped context rows joined to trades for R',
  shadowSrc.includes('computeCryptoShadowAiJudge') && shadowSrc.includes('c.judge_verdict IS NOT NULL') && shadowSrc.includes('JOIN crypto_shadow_trades'));
const promoSrc = src('../server/services/crypto-shadow-promotions.ts');
check('F3 promotions panel payload carries aiJudge (fail-soft)', promoSrc.includes('aiJudge') && promoSrc.includes('computeCryptoShadowAiJudge'));
const panelSrc = src('../client/src/components/engine-safeguards-panel.tsx');
check('F4 judge scoreboard panel exists with honest framing',
  panelSrc.includes('CryptoShadowAiJudgePanel') && panelSrc.includes('The judge never blocks an entry') && panelSrc.includes('collecting evidence'));
const pageSrc = src('../client/src/pages/guards-trails.tsx');
check('F5 panel is placed on Guards & Trails', pageSrc.includes('<CryptoShadowAiJudgePanel />'));
const sw = src('../client/public/sw.js');
check('F6 sw bumped for the client change', sw.includes("CACHE_VERSION = 'vedd-v294'"));

// ── G. Lane evidence — the judge sees the collected record ────────────────
const evInput = (over: Partial<JudgeEvidenceInput> = {}): JudgeEvidenceInput => ({
  pair: {
    underlying: 'WETH', n: 23, winRate: 9 / 23, medianNet: -0.84, avgR: -0.31,
    recent: Array.from({ length: 15 }, (_, i) => ({ strategy: 'momentum', direction: 'long', netPct: i % 2 ? 1.5 : -2, rMultiple: i % 2 ? 0.75 : -1 })),
  },
  strategy: {
    name: 'momentum', n: 41, winRate: 15 / 41, medianNet: -0.62, avgR: -0.28,
    last14: { n: 12, winRate: 4 / 12, medianNet: -0.91, avgR: -0.4 },
    prior14: { n: 15, winRate: 7 / 15, medianNet: 0.1, avgR: 0.05 },
  },
  buckets: [
    { verdict: 'avoid', dim: 'liquidity', bucket: '<250k', n: 18, medianNet: -2.3 },
    { verdict: 'favor', dim: 'htf', bucket: 'aligned', n: 21, medianNet: 0.8 },
  ],
  context: {
    liquidityUsd: 180_000, buyShareH1: 0.58, buyShareH24: 0.52, buyersH1: 120, sellersH1: 86, txnsH1: 206,
    tokenAgeHours: 960, marketCapUsd: 50e6, btcChange24h: 1.2, h1Trend: 'BULLISH', h4Trend: 'BULLISH',
    htfAligned: true, atrPct: 2.1, change1h: 0.8, change24h: 3,
  },
  ...over,
});
{
  const ev = buildJudgeEvidence(evInput());
  check('G1 evidence carries the pair record (n, win rate, median, avg R)',
    ev.includes('Pair WETH in this lane: 23 closed') && ev.includes('median -0.84%') && ev.includes('-0.31R'));
  check('G2 recent closes are capped at 10, never a raw dump',
    (ev.match(/momentum long/g) || []).length === 10, `saw ${(ev.match(/momentum long/g) || []).length}`);
  check('G3 strategy record + last-14d vs prior-14d form',
    ev.includes('Strategy momentum overall') && ev.includes('last 14d: 12 closed') && ev.includes('prior 14d: 15 closed'));
  check('G4 bucket verdicts with n and median',
    ev.includes("avoid — liquidity <250k (n=18, median -2.30%)") && ev.includes('favor — htf aligned (n=21'));
  check('G5 market context: liquidity, order flow, age, mcap, BTC, trends, ATR',
    ev.includes('liquidity $180k') && ev.includes('buy share 1h 58% (buyers 120 / sellers 86, 206 txns)') && ev.includes('buy share 24h 52%')
    && ev.includes('token age 40d') && ev.includes('market cap $50.0M') && ev.includes('BTC 24h +1.20%')
    && ev.includes('H1 trend BULLISH') && ev.includes('HTF aligned with this side') && ev.includes('ATR 2.1%'));
  check('G6 whole evidence block is hard-capped (token-lean)', ev.length <= 2000, `${ev.length} chars`);
  const empty = buildJudgeEvidence(evInput({ pair: { underlying: 'NEW', n: 0, winRate: 0, medianNet: 0, avgR: null, recent: [] }, strategy: { name: 'breakout', n: 0, winRate: 0, medianNet: 0, avgR: null, last14: null, prior14: null }, buckets: [], context: {} }));
  check('G7 no history reads honestly as no history', empty.includes('no closed shadow trades yet') && !empty.includes('undefined') && !empty.includes('NaN'));
}
{
  const now = Date.now(), DAY = 86_400_000;
  const rows = [
    { net_pct: 2, r_multiple: 1, closed_at: new Date(now - 2 * DAY).toISOString() },
    { net_pct: -2, r_multiple: -1, closed_at: new Date(now - 5 * DAY).toISOString() },
    { net_pct: 4, r_multiple: 2, closed_at: new Date(now - 20 * DAY).toISOString() },
    { net_pct: null, r_multiple: null, closed_at: new Date(now - 1 * DAY).toISOString() },
  ];
  const form = strategyForm(rows, now);
  check('G8 strategyForm windows by closed_at (last14 vs prior14, null nets skipped)',
    form.overall.n === 3 && form.last14?.n === 2 && form.prior14?.n === 1 && approx(form.last14?.medianNet ?? NaN, 0));
  const sum = summarizeJudgeCloses(rows);
  check('G9 summarizeJudgeCloses aggregates net + R', sum.n === 3 && approx(sum.winRate, 2 / 3) && approx(sum.avgR ?? NaN, (1 - 1 + 2) / 3));
}
const evidenceCallIdx = shadowSrc.indexOf('await collectJudgeEvidence(userId, {');
check('G10 evidence is collected at the entry site, before the judge call, post-gate',
  evidenceCallIdx > gateIdx && evidenceCallIdx < judgeIdx && evidenceCallIdx > tradeInsertIdx);
{
  const defIdx = shadowSrc.indexOf('export async function collectJudgeEvidence');
  check('G11 evidence collection is fail-soft (judge proceeds without it)',
    defIdx > -1 && shadowSrc.slice(defIdx, defIdx + 6000).includes('catch { return undefined; }'));
}
check('G12 confirmation prompt takes evidence ONLY when provided (live prompt byte-identical)',
  confirmSrc.includes("${opts.evidence ? `${opts.evidence}\\n\\n` : ''}") || confirmSrc.includes('opts.evidence ?'));
{
  const scannerSrc = src('../server/services/cryptocom-scanner.ts');
  const callAt = scannerSrc.indexOf('getCryptoAiConfirmation({');
  const callBlock = callAt > -1 ? scannerSrc.slice(callAt, callAt + 400) : '';
  check('G13 the live scanner call passes no evidence and no cacheScope (live behavior unchanged)',
    callAt > -1 && !callBlock.includes('evidence') && !callBlock.includes('cacheScope'), callBlock.slice(0, 80));
}
check('G14 judge runner forwards evidence to the confirmation', shadowSrc.includes('evidence: args.evidence'));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
