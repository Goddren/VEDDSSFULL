// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp AI JUDGE (2026-11-22, Chris's ask: "why doesn't Kalshi
// use the AI brain?") — built as a JUDGE, not a gate.
//
// Every shadow candidate that has passed ALL existing gates (perp brain,
// VP veto, earnings blackout, improvement throttle, liquidity, caps) and
// is about to open gets ONE AI verdict — approve / reject / unsure +
// confidence + one-line reason — recorded on the trade's context row and
// scored later against the outcome (the panel's AI judge scoreboard).
// The verdict NEVER blocks, sizes, delays past its own call, or otherwise
// affects the entry in this build: gating is a later decision that needs
// this scoreboard's evidence first.
//
// Fail-open in both directions: any AI failure (402, budget block,
// timeout, bad JSON) records verdict 'no_verdict' with the failure class
// and the entry proceeds exactly as today. Only candidates that actually
// open are judged — blocked candidates are never judged (the brain alone
// blocks ~21k setups/30d; judging those would drain the shared AI pool
// for nothing).
//
// CONTEXT (Chris's scope refinement, 2026-11-22): the judge weighs the
// candidate against the lane's collected data, not in isolation — the
// ticker's own history (aggregates + last ~10 closes), the strategy's
// overall record and last-14d-vs-prior-14d form, the candidate's bucket
// evidence (what the deterministic brain sees), current context, and a
// compact candle/pattern summary. Aggregates only, never raw tables.
//
// COST: the call goes through getUniversalAIClientForUser with
// { engine: true } — the shared engine-marked failover client — so it is
// gated by and metered against the SAME per-user daily AI pool as every
// other engine (PR #103), exactly once per answered call, by that client.
// This module never meters anything itself. The prompt stays bounded
// (check-pinned size cap) — thousands of tokens per call was the
// original FX cost bug this pool exists to prevent.
//
// Kill switch: KALSHI_PERP_AI_JUDGE=off → no judge calls, no verdicts,
// the lane behaves exactly as today. SHADOW LANE ONLY: nothing in the
// live perp execution path imports this module.
// ─────────────────────────────────────────────────────────────────────────────

import { getUniversalAIClientForUser } from '../openai';

export const kalshiPerpAiJudgeEnabled = () => process.env.KALSHI_PERP_AI_JUDGE !== 'off';

/** Hard cap on one judge call so a slow provider cannot stall the lane
 *  cycle. The provider clients carry a 90s SDK timeout; the judge races
 *  at 30s (env-tunable) and records no_verdict/'timeout' past it. A call
 *  that loses the race was still bought if it later answers — the
 *  failover client meters answered calls, never this module. */
export const judgeTimeoutMs = () => {
  const n = Number(process.env.KALSHI_PERP_AI_JUDGE_TIMEOUT_MS ?? 30_000);
  return Number.isFinite(n) && n >= 1_000 ? n : 30_000;
};

export type PerpAiJudgeVerdict = 'approve' | 'reject' | 'unsure' | 'no_verdict';
export type PerpAiJudgeFailure = 'budget' | 'timeout' | 'provider' | 'bad_json' | 'disabled' | null;

export interface PerpJudgeCandidate {
  userId: number;
  strategy: string;
  ticker: string;
  underlying: string;
  direction: 'long' | 'short';
  entryPrice: number;
  /** The strategy runner's own score, when it produced one. */
  score?: number | null;
  sessionEt?: string | null;
  spreadBps?: number | null;
  atrPct?: number | null;
  fundingRateAtEntry?: number | null;
  htfAligned?: boolean | null;
  h1Trend?: string | null;
  h4Trend?: string | null;
  vpPosition?: string | null;
  /** The lane's own bucket advice for this candidate (adviceFor output). */
  adviceAtEntry?: string | null;
  /** Compact recent-price summary: the last H1 closes, oldest → newest. */
  recentCloses?: number[];
  /** Earnings proximity stamp (true/false when the calendar knows). */
  earningsWithin48h?: boolean | null;
  /** This underlying's own record in this lane (aggregates + last ~10
   *  closes) — the judge weighs the candidate against the ticker's
   *  history, not in isolation. */
  tickerHistory?: JudgeTickerHistory | null;
  /** The candidate strategy's overall lane record + recent form. */
  strategyRecord?: JudgeStrategyRecord | null;
  /** The candidate's own bucket evidence — what the deterministic brain
   *  sees (verdict, n, median net per matching bucket). */
  bucketEvidence?: JudgeBucketEvidence[] | null;
}

// ── lane-history aggregates (pure; the lane gathers, the judge weighs) ─────
export interface JudgeRecordSummary {
  n: number;
  winRate: number | null;
  avgR: number | null;
  medianNetPct: number | null;
}
export interface JudgeTickerHistory {
  summary: JudgeRecordSummary;
  recent: Array<{ strategy: string; direction: string; netPct: number; rMultiple: number | null }>;
}
export interface JudgeStrategyRecord {
  overall: JudgeRecordSummary;
  last14d: JudgeRecordSummary | null;
  prior14d: JudgeRecordSummary | null;
}
export interface JudgeBucketEvidence {
  dim: string;
  bucket: string;
  verdict: string;
  n: number;
  medianNet: number;
}

const medianOf = (vals: number[]): number | null => {
  if (!vals.length) return null;
  const s = vals.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Aggregate a set of closed perp shadow trades (net_pct / r_multiple as
 *  booked at close, already net of funding + costs) into the compact
 *  record summary the prompt carries. Pure. */
export function summarizeJudgeRows(rows: Array<{ netPct?: unknown; rMultiple?: unknown }>): JudgeRecordSummary {
  const nets: number[] = [];
  const rs: number[] = [];
  let wins = 0;
  for (const r of rows) {
    const net = Number(r.netPct);
    if (!Number.isFinite(net)) continue;
    nets.push(net);
    if (net > 0) wins++;
    const rMul = r.rMultiple == null ? NaN : Number(r.rMultiple);
    if (Number.isFinite(rMul)) rs.push(rMul);
  }
  return {
    n: nets.length,
    winRate: nets.length ? wins / nets.length : null,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    medianNetPct: medianOf(nets),
  };
}

/** A strategy's record with recent form: last-14d vs the prior 14d,
 *  windowed from the lane's own closed trades. Pure. */
export function strategyRecordFromRows(
  rows: Array<{ netPct?: unknown; rMultiple?: unknown; closedAtMs?: unknown }>,
  nowMs: number,
): JudgeStrategyRecord {
  const DAY = 86_400_000;
  const last: typeof rows = [];
  const prior: typeof rows = [];
  for (const r of rows) {
    const t = Number(r.closedAtMs);
    if (!Number.isFinite(t)) continue;
    if (t > nowMs - 14 * DAY && t <= nowMs) last.push(r);
    else if (t > nowMs - 28 * DAY && t <= nowMs - 14 * DAY) prior.push(r);
  }
  return {
    overall: summarizeJudgeRows(rows),
    last14d: last.length ? summarizeJudgeRows(last) : null,
    prior14d: prior.length ? summarizeJudgeRows(prior) : null,
  };
}

/** The candidate's matching bucket evidence from the lane's bucket stats
 *  — the same matching rule the perp brain gate uses (same strategy, the
 *  candidate's bucket value for that dimension), but INCLUDING 'learning'
 *  buckets: the judge sees the evidence, not just the verdicts that act.
 *  Ordered avoid → favor → learning, biggest samples first, capped.
 *  Pure. */
export function bucketEvidenceFor(
  stats: Array<{ strategy: string; dim: string; bucket: string; n: number; medianNet: number; verdict: string }>,
  strategy: string,
  buckets: Record<string, string>,
  cap = 8,
): JudgeBucketEvidence[] {
  const rank = (v: string) => v === 'avoid' ? 0 : v === 'favor' ? 1 : 2;
  return (stats || [])
    .filter((s) => s.strategy === strategy && buckets[s.dim] === s.bucket)
    .map((s) => ({ dim: s.dim, bucket: s.bucket, verdict: s.verdict, n: s.n, medianNet: s.medianNet }))
    .sort((a, b) => rank(a.verdict) - rank(b.verdict) || b.n - a.n)
    .slice(0, Math.max(1, cap));
}

export interface PerpAiJudgeResult {
  verdict: PerpAiJudgeVerdict;
  confidence: number | null;
  reason: string;
  model: string | null;
  failure: PerpAiJudgeFailure;
  /** Cost-metering marker: true iff this candidate consumed an answered
   *  engine-marked call (the failover client meters exactly those, once).
   *  False for budget blocks (never bought), provider failures (not
   *  metered), and dedupe reuses (no new call). */
  metered: boolean;
  /** True when this result was reused from an identical candidate judged
   *  moments ago in the same lane cycle — no second call was made. */
  deduped?: boolean;
}

const noVerdict = (failure: PerpAiJudgeFailure, reason: string): PerpAiJudgeResult => ({
  verdict: 'no_verdict', confidence: null, reason, model: null, failure, metered: false,
});

/** Classify a judge-call failure for the context row. Budget blocks are
 *  the 402-shaped error the shared pool throws (ai-engine-budget.ts:
 *  status 402 + budgetBlocked marker) — the same shape a genuinely empty
 *  provider balance produces, and the scoreboard reads both the same way:
 *  the judge never got to speak. Pure — exercised by the check script. */
export function classifyJudgeFailure(e: any): Exclude<PerpAiJudgeFailure, null | 'disabled'> {
  const msg = String(e?.message || e || '');
  if (e?.budgetBlocked === true || e?.aiErrorStatus === 'budget') return 'budget';
  if (Number(e?.status ?? e?.statusCode) === 402 || /\b402\b/.test(msg)) return 'budget';
  if (/timed?\s?out|timeout|aborted|ETIMEDOUT/i.test(msg) || e?.name === 'AbortError') return 'timeout';
  return 'provider';
}

/** Parse the judge's reply into a verdict. Accepts the strict JSON shape
 *  the prompt asks for, salvages a JSON object embedded in prose, and
 *  normalizes confidence to 0–1 (a 0–100 answer is rescaled). Anything
 *  unusable returns null → the caller records no_verdict/'bad_json'.
 *  Pure — exercised by the check script. */
export function parseJudgeResponse(content: string): { verdict: 'approve' | 'reject' | 'unsure'; confidence: number; reason: string } | null {
  if (!content) return null;
  let parsed: any;
  try { parsed = JSON.parse(content); } catch {
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try { parsed = JSON.parse(m[0]); } catch { return null; }
  }
  const verdict = String(parsed?.verdict || '').toLowerCase();
  if (verdict !== 'approve' && verdict !== 'reject' && verdict !== 'unsure') return null;
  let confidence = Number(parsed?.confidence);
  if (!Number.isFinite(confidence)) confidence = 0;
  if (confidence > 1 && confidence <= 100) confidence = confidence / 100;
  confidence = Math.min(1, Math.max(0, confidence));
  const reason = String(parsed?.reason || '').replace(/\s+/g, ' ').trim().slice(0, 300) || 'no reason given';
  return { verdict, confidence, reason };
}

const fmtRec = (s: JudgeRecordSummary | null | undefined): string => {
  if (!s || !s.n) return 'no closed trades yet';
  const wr = s.winRate != null ? `${Math.round(s.winRate * 100)}% WR` : 'WR n/a';
  const avgR = s.avgR != null ? `avg ${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R` : 'avg R n/a';
  const med = s.medianNetPct != null ? `median net ${s.medianNetPct >= 0 ? '+' : ''}${s.medianNetPct.toFixed(2)}%` : 'median n/a';
  return `${s.n} trades, ${wr}, ${avgR}, ${med}`;
};

/** The judge prompt: the candidate weighed against the lane's collected
 *  evidence — this ticker's history, the strategy's record and recent
 *  form, and the candidate's own bucket evidence (what the deterministic
 *  brain sees) — plus current context and a compact candle/pattern
 *  summary. Aggregates and last-10 closes only, never raw tables: the
 *  whole user message stays bounded (check-pinned size cap) — thousands
 *  of tokens per call was the original cost bug. Pure. */
export function buildJudgePrompt(c: PerpJudgeCandidate): { system: string; user: string } {
  const system =
    'You are a disciplined stock perpetual-futures trader acting as an independent judge on a shadow-trading lane. ' +
    'A mechanical strategy has already produced this candidate and every risk gate has passed. ' +
    'Weigh the candidate against the evidence below: this ticker\'s history in this lane, the strategy\'s record and recent form, ' +
    'and the bucket evidence — the lane\'s own track record on setups like this one. A setup the history supports deserves approval; ' +
    'one the history keeps punishing deserves rejection even if the chart alone looks fine. ' +
    'You are scoring, not trading: your verdict is recorded and graded against the outcome later. ' +
    'Respond ONLY with JSON: {"verdict": "approve"|"reject"|"unsure", "confidence": number (0 to 1), "reason": "one short line"}.';
  const closes = (c.recentCloses || []).filter((n) => Number.isFinite(n)).slice(-12);
  let pattern: string | null = null;
  if (closes.length >= 2) {
    const first = closes[0], lastC = closes[closes.length - 1];
    const movePct = first > 0 ? ((lastC - first) / first) * 100 : 0;
    let ups = 0;
    for (let i = 1; i < closes.length; i++) if (closes[i] > closes[i - 1]) ups++;
    pattern = `Recent H1 closes (oldest to newest): ${closes.join(', ')} — net ${movePct >= 0 ? '+' : ''}${movePct.toFixed(2)}% over the window, ${ups} of ${closes.length - 1} hourly moves up`;
  }
  const hist = c.tickerHistory;
  const recentLines = (hist?.recent || []).slice(0, 10).map((r) =>
    `${r.strategy} ${r.direction} ${r.netPct >= 0 ? '+' : ''}${r.netPct.toFixed(2)}%${r.rMultiple != null ? ` (${r.rMultiple >= 0 ? '+' : ''}${r.rMultiple.toFixed(1)}R)` : ''}`);
  const rec = c.strategyRecord;
  const formLine = rec && (rec.last14d || rec.prior14d)
    ? `Strategy recent form: last 14d ${fmtRec(rec.last14d)} vs prior 14d ${fmtRec(rec.prior14d)}`
    : null;
  const evidenceLines = (c.bucketEvidence || []).slice(0, 8).map((b) =>
    `${b.dim}=${b.bucket}: ${b.verdict} (n=${b.n}, median net ${b.medianNet >= 0 ? '+' : ''}${b.medianNet.toFixed(2)}%)`);
  const user = [
    `CANDIDATE: ${c.strategy} — ${c.direction.toUpperCase()} ${c.underlying} (${c.ticker}) @ ${c.entryPrice}`,
    c.score != null ? `Strategy score: ${c.score}` : null,
    `MARKET CONTEXT: session (ET) ${c.sessionEt ?? 'unknown'} · spread ${c.spreadBps != null ? `${c.spreadBps.toFixed(1)} bps` : 'n/a'} · ATR ${c.atrPct != null ? `${c.atrPct.toFixed(2)}%` : 'n/a'} · H1 trend ${c.h1Trend ?? 'n/a'}, H4 trend ${c.h4Trend ?? 'n/a'} — entry is ${c.htfAligned == null ? 'HTF-neutral' : c.htfAligned ? 'WITH the higher-timeframe trend' : 'AGAINST the higher-timeframe trend'} · funding at entry ${c.fundingRateAtEntry == null ? 'n/a' : c.fundingRateAtEntry} · volume-profile position ${c.vpPosition ?? 'n/a'} · earnings within 48h: ${c.earningsWithin48h == null ? 'unknown' : c.earningsWithin48h ? 'YES' : 'no'}`,
    `TICKER HISTORY (${c.underlying} in this lane): ${fmtRec(hist?.summary)}`,
    recentLines.length ? `Last closes on ${c.underlying} (newest first): ${recentLines.join('; ')}` : null,
    `STRATEGY RECORD (${c.strategy} overall): ${fmtRec(rec?.overall)}`,
    formLine,
    `BUCKET EVIDENCE (the lane's record on setups like this): ${evidenceLines.length ? '' : 'no bucket has enough history yet'}`,
    ...evidenceLines.map((l) => `  ${l}`),
    `Lane advice stamp for this candidate: ${c.adviceAtEntry || 'no verdict yet (still learning)'}`,
    pattern,
    `Weigh this ${c.direction} entry against that history and pattern evidence — approve, reject, or unsure?`,
  ].filter(Boolean).join('\n');
  return { system, user };
}

// ── in-cycle dedupe ─────────────────────────────────────────────────────────
// The same candidate (user × strategy × ticker × direction × entry price)
// can surface twice in one entry cycle (e.g. a port runner and the
// composite agreeing). It is judged ONCE; the second surface reuses the
// verdict and buys no second call. Entries are evicted on a short TTL so
// a later cycle's genuinely new candidate at the same price is judged
// fresh.
const _judged = new Map<string, { at: number; result: PerpAiJudgeResult }>();
const DEDUPE_TTL_MS = 10 * 60_000;
export function judgeCandidateKey(c: PerpJudgeCandidate): string {
  return `${c.userId}|${c.strategy}|${c.ticker}|${c.direction}|${c.entryPrice}`;
}
export function clearJudgeDedupe(): void { _judged.clear(); }

/** Injectable call seam for the check script: the real implementation
 *  buys one engine-marked AI call; checks substitute a fake and count
 *  invocations, so metering/dedupe/fail-open behavior is testable with
 *  zero provider spend. */
export interface JudgeCallDeps {
  callAi?: (c: PerpJudgeCandidate) => Promise<{ content: string; model: string | null }>;
}

async function realJudgeCall(c: PerpJudgeCandidate): Promise<{ content: string; model: string | null }> {
  // Engine caller: gated + metered against the shared daily AI budget,
  // exactly once per answered call, inside the failover client.
  const client: any = await getUniversalAIClientForUser(c.userId, { engine: true });
  const { system, user } = buildJudgePrompt(c);
  const modelId = client.defaultModel || 'gpt-4o-mini';
  const call = client.chat.completions.create({
    model: modelId,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
    max_tokens: 300,
  });
  const timeout = new Promise<never>((_, reject) => {
    const t = setTimeout(() => reject(new Error(`judge call timed out after ${judgeTimeoutMs()}ms`)), judgeTimeoutMs());
    (t as any).unref?.();
  });
  const r = await Promise.race([call, timeout]);
  return { content: r?.choices?.[0]?.message?.content || '', model: modelId };
}

/**
 * Judge one candidate. NEVER throws and NEVER returns anything the lane
 * could gate on accidentally — the result is a record, not a decision:
 * callers stamp it on the context row and open the trade regardless.
 * Returns null only when the judge is switched off (no verdict recorded).
 */
export async function judgeKalshiPerpCandidate(
  c: PerpJudgeCandidate,
  deps: JudgeCallDeps = {},
): Promise<PerpAiJudgeResult | null> {
  if (!kalshiPerpAiJudgeEnabled()) return null;
  const key = judgeCandidateKey(c);
  const hit = _judged.get(key);
  if (hit && Date.now() - hit.at < DEDUPE_TTL_MS) {
    return { ...hit.result, metered: false, deduped: true };
  }
  let result: PerpAiJudgeResult;
  try {
    const callAi = deps.callAi ?? realJudgeCall;
    const { content, model } = await callAi(c);
    const parsed = parseJudgeResponse(content);
    result = parsed
      ? { verdict: parsed.verdict, confidence: parsed.confidence, reason: parsed.reason, model, failure: null, metered: true }
      : { ...noVerdict('bad_json', 'judge reply was not parseable JSON'), model };
  } catch (e: any) {
    const failure = classifyJudgeFailure(e);
    result = noVerdict(failure, failure === 'budget'
      ? 'judge unavailable — daily AI budget reached or provider credits exhausted'
      : `judge call failed (${failure})`);
    if (failure !== 'budget') {
      console.warn(`[kalshi-perp-ai-judge] ${c.ticker} ${c.strategy}: ${String(e?.message || e).slice(0, 160)}`);
    }
  }
  _judged.set(key, { at: Date.now(), result });
  if (_judged.size > 500) {
    const cutoff = Date.now() - DEDUPE_TTL_MS;
    _judged.forEach((v, k) => { if (v.at < cutoff) _judged.delete(k); });
  }
  return result;
}

// ── scoreboard ──────────────────────────────────────────────────────────────
export interface AiJudgeBucketStat {
  n: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  avgNetPct: number | null;
  /** Est. net P&L in USD — the lane report's own convention:
   *  Σ return_pct/100 × notional_usd over the bucket's closes. */
  netUsd: number;
}
export interface AiJudgeScoreboard {
  approve: AiJudgeBucketStat;
  reject: AiJudgeBucketStat;
  unsure: AiJudgeBucketStat;
  noVerdict: AiJudgeBucketStat;
  judgedCloses: number;
}

const emptyBucket = (): AiJudgeBucketStat => ({ n: 0, wins: 0, winRate: null, avgR: null, avgNetPct: null, netUsd: 0 });

/** Pure scoreboard aggregation over closed, stats-valid trades carrying
 *  a judge verdict on their context row. R and net use the lane's own
 *  conventions (r_multiple and return_pct are already net of funding +
 *  costs as booked by closeTrade). Exercised by the check script. */
export function aggregateAiJudgeScoreboard(rows: Array<{
  verdict?: unknown; returnPct?: unknown; rMultiple?: unknown; notionalUsd?: unknown;
}>): AiJudgeScoreboard {
  const acc = {
    approve: { ...emptyBucket(), rSum: 0, rN: 0, pctSum: 0 },
    reject: { ...emptyBucket(), rSum: 0, rN: 0, pctSum: 0 },
    unsure: { ...emptyBucket(), rSum: 0, rN: 0, pctSum: 0 },
    noVerdict: { ...emptyBucket(), rSum: 0, rN: 0, pctSum: 0 },
  };
  const pick = (v: unknown) => v === 'approve' ? acc.approve : v === 'reject' ? acc.reject : v === 'unsure' ? acc.unsure : acc.noVerdict;
  let judgedCloses = 0;
  for (const r of rows) {
    const pct = Number(r.returnPct);
    if (!Number.isFinite(pct)) continue;
    const b = pick(String(r.verdict || 'no_verdict'));
    b.n++;
    judgedCloses++;
    if (pct > 0) b.wins++;
    b.pctSum += pct;
    const notional = Number(r.notionalUsd);
    if (Number.isFinite(notional) && notional > 0) b.netUsd += (pct / 100) * notional;
    const rMul = r.rMultiple == null ? NaN : Number(r.rMultiple);
    if (Number.isFinite(rMul)) { b.rSum += rMul; b.rN++; }
  }
  const finish = (b: typeof acc.approve): AiJudgeBucketStat => ({
    n: b.n,
    wins: b.wins,
    winRate: b.n ? b.wins / b.n : null,
    avgR: b.rN ? b.rSum / b.rN : null,
    avgNetPct: b.n ? b.pctSum / b.n : null,
    netUsd: Math.round(b.netUsd * 100) / 100,
  });
  return {
    approve: finish(acc.approve), reject: finish(acc.reject),
    unsure: finish(acc.unsure), noVerdict: finish(acc.noVerdict),
    judgedCloses,
  };
}
