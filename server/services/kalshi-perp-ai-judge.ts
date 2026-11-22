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
// COST: the call goes through getUniversalAIClientForUser with
// { engine: true } — the shared engine-marked failover client — so it is
// gated by and metered against the SAME per-user daily AI pool as every
// other engine (PR #103), exactly once per answered call, by that client.
// This module never meters anything itself. The prompt is deliberately
// lean (candidate fields + the last 12 H1 closes as numbers, no candle
// serialization) — thousands of tokens per call was the original FX cost
// bug this pool exists to prevent.
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

/** The lean judge prompt: candidate fields + the lane's own context + a
 *  compact recent-closes line. No candle serialization, no indicator
 *  dumps — the whole user message stays in the low hundreds of tokens.
 *  Pure — exercised by the check script. */
export function buildJudgePrompt(c: PerpJudgeCandidate): { system: string; user: string } {
  const system =
    'You are a disciplined stock perpetual-futures trader acting as an independent judge on a shadow-trading lane. ' +
    'A mechanical strategy has already produced this candidate and every risk gate has passed. Give your honest verdict on the setup itself — ' +
    'trend alignment, momentum, entry timing, and whether the lane\'s own track record on similar setups supports it. ' +
    'You are scoring, not trading: your verdict is recorded and graded against the outcome later. ' +
    'Respond ONLY with JSON: {"verdict": "approve"|"reject"|"unsure", "confidence": number (0 to 1), "reason": "one short line"}.';
  const closes = (c.recentCloses || []).filter((n) => Number.isFinite(n)).slice(-12);
  const user = [
    `CANDIDATE: ${c.strategy} — ${c.direction.toUpperCase()} ${c.underlying} (${c.ticker}) @ ${c.entryPrice}`,
    c.score != null ? `Strategy score: ${c.score}` : null,
    `Session (ET): ${c.sessionEt ?? 'unknown'} · Spread: ${c.spreadBps != null ? `${c.spreadBps.toFixed(1)} bps` : 'n/a'} · ATR: ${c.atrPct != null ? `${c.atrPct.toFixed(2)}%` : 'n/a'}`,
    `Trend: H1 ${c.h1Trend ?? 'n/a'}, H4 ${c.h4Trend ?? 'n/a'} — entry is ${c.htfAligned == null ? 'HTF-neutral' : c.htfAligned ? 'WITH the higher-timeframe trend' : 'AGAINST the higher-timeframe trend'}`,
    `Funding at entry: ${c.fundingRateAtEntry == null ? 'n/a' : c.fundingRateAtEntry}`,
    `Volume-profile position: ${c.vpPosition ?? 'n/a'}`,
    `The lane's own record on similar setups: ${c.adviceAtEntry || 'no verdict yet (still learning)'}`,
    closes.length ? `Recent H1 closes (oldest to newest): ${closes.join(', ')}` : null,
    `Would you approve this ${c.direction} entry on its own merits?`,
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
    for (const [k, v] of _judged) if (v.at < cutoff) _judged.delete(k);
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
