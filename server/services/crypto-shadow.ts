// ─────────────────────────────────────────────────────────────────────────────
// Crypto all-strategy shadow lane — 2026-11-07 (design step 2).
//
// Every crypto runner (trend_following, momentum, order_flow, volume_profile,
// breakout, structure, divergence + the composite) is evaluated on the
// cycle's DeFi symbols and every signal is traded VIRTUALLY into
// crypto_shadow_trades: longs as 'long', SELL signals as 'hypothetical_short'
// (Base spot can't short; they are reported apart). Never touches live
// orders, wallets, or the paper table (crypto_paper_trades).
//
// Levels: stop = CRYPTO_SL_ATR_MULT (1.5) x H1 ATR clamped 1.5–12%, target 2x
// stop; costs from paper-costs.ts by pool liquidity; entries with a stop under
// 3x the round-trip cost are skipped. Time limit by runner timeframe (24h fast
// / 72h slow, crypto-paper.ts paperMaxHoursFor).
// Caps: CRYPTO_SHADOW_MAX_PER_STRATEGY (3) open per strategy, CRYPTO_SHADOW_MAX_OPEN
// (30) total; no duplicate underlying within a strategy; 60-min re-entry
// cooldown per strategy+underlying. Runs at most every CRYPTO_SHADOW_EVERY_MIN
// (10) per user to spare the GeckoTerminal budget.
//
// Each entry writes market context to crypto_shadow_context; closed rows roll
// up per strategy × bucket and are judged by MEDIAN net % (favor/avoid needs
// n ≥ CRYPTO_SHADOW_STATS_MIN_N, 15). The crypto AI confirmation prompt
// reads the strongest buckets, and each entry stores the advice it would
// have got (advice_at_entry).
// Lesson gate (2026-11-12, shadow-lesson-gate.ts): the lane also ACTS on
// those verdicts — an entry whose strategy (overall) or exact context
// bucket carries an 'avoid' verdict is skipped and the block audited in
// shadow_lesson_blocks. Rolling 60-day stats rehabilitate on their own.
// AI judge (2026-11-22, Chris's ask): every entry that survives the gates
// and is recorded is also SCORED by the crypto-native AI confirmation
// (crypto-ai-confirmation.ts) and the verdict is stamped on the context
// row (judge_* columns). The judge is evidence only — it never blocks,
// skips, sizes or otherwise changes an entry; the scoreboard
// (computeCryptoShadowAiJudge) exists so a later build can decide, from
// the lane's own numbers, whether AI-approved entries actually win more.
// AI watch plans (2026-11-24, crypto-watch-plans.ts): the stewardship
// layer — a deep AI study writes a validated watch plan per
// symbol+strategy; watching is free and deterministic on the lane's H1
// bars; with plans ON an entry needs the strategy's own signal AND a
// triggered plan. Studies buy on the budget pool's PROTECTED lane,
// metered once at 2 units; plan-layer failures fall back to the
// mechanical entry, so the lane never halts. The judge above is
// untouched: it still scores every recorded entry and never gates.
// Kill switches: CRYPTO_SHADOW_ALL=off (whole lane),
// CRYPTO_SHADOW_LESSONS=off (lesson gate only),
// CRYPTO_SHADOW_AI_JUDGE=off (judge only),
// CRYPTO_WATCH_PLANS=off (watch plans only).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { cryptoShadowLessonsOn, logShadowLessonBlock, matchingAvoidBucket } from './shadow-lesson-gate';
import { improvementThrottleBlocks, logImprovementBlock } from './improvement-loop';
import { trailBrainConsult, trailBrainDecide, stampTrailBrainTrade } from './trail-brain';
import {
  cryptoWatchPlansEnabled, resolveCryptoWatchPlan, newCryptoPlanCycle, noteCryptoPlanEntry,
  type CryptoWatchPlanAction, type CryptoPairHistory, type CryptoStrategyRecord, type CryptoBucketEvidence,
  type CryptoPlanClosesSummary,
} from './crypto-watch-plans';

type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export interface ShadowRunnerResult { decision: string; reasoning: string; score: number | null; price: number | null; dailyChangePercent: number | null; strategy: string; direction?: 'BUY' | 'SELL' }
export interface ShadowDeps {
  runners: Record<string, (sym: string, cfg: any) => Promise<ShadowRunnerResult>>;
  /** The engine's signal gates (HTF bias etc.); used only to record whether live would have blocked it. */
  gate: (sym: string, r: ShadowRunnerResult, cfg: any) => Promise<ShadowRunnerResult>;
  universe: (sym: string) => { address: string; poolAddress: string; liquidityUsd: number; priceUsd: number; volume24Usd?: number; flow?: import('./defi-market-data').PoolFlow; newToken?: boolean } | undefined;
  h1: (sym: string) => Promise<{ atr: number; bars: Bar[] } | null>;
}

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
export const shadowAllEnabled = () => process.env.CRYPTO_SHADOW_ALL !== 'off';
const MAX_OPEN = () => Math.floor(num('CRYPTO_SHADOW_MAX_OPEN', 30));
const MAX_PER_STRAT = () => Math.floor(num('CRYPTO_SHADOW_MAX_PER_STRATEGY', 3));
const COOLDOWN_MS = () => num('CRYPTO_SHADOW_COOLDOWN_MIN', 60) * 60_000;
const EVERY_MS = () => num('CRYPTO_SHADOW_EVERY_MIN', 10) * 60_000;
const NOTIONAL = () => num('CRYPTO_SHADOW_NOTIONAL_USD', 20);

let _ensured: Promise<void> | null = null;
export function ensureCryptoShadowTables(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS crypto_shadow_trades (
      id serial PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL, symbol text NOT NULL, underlying text NOT NULL,
      chain text, token_address text, pool_address text, direction text NOT NULL,
      entry_price double precision NOT NULL, stop_loss double precision NOT NULL, take_profit double precision NOT NULL,
      sl_pct double precision NOT NULL, notional_usd double precision NOT NULL, cost_bps double precision NOT NULL,
      score real, max_hours double precision NOT NULL, status text NOT NULL DEFAULT 'open',
      exit_price double precision, exit_reason text, gross_return_pct double precision, return_pct double precision,
      r_multiple double precision, peak_gain_pct double precision,
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz)`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS crypto_shadow_trades_user_status ON crypto_shadow_trades (user_id, status)`))
      .then(() => pool.query(`CREATE TABLE IF NOT EXISTS crypto_shadow_context (
      trade_id int PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL, symbol text NOT NULL, direction text NOT NULL,
      liquidity_usd double precision, change_1h double precision, change_24h double precision, volume_24h_usd double precision,
      atr_pct double precision, h1_trend text, h4_trend text, htf_aligned boolean, live_gate_blocked boolean,
      btc_change_24h double precision, hour_utc int, day_of_week int, score real, tags text[], advice_at_entry text,
      closed_at timestamptz, exit_reason text, hold_minutes double precision, net_pct double precision)`))
      // Step 4 (2026-11-07): pool order flow + token basics.
      .then(() => pool.query(`ALTER TABLE crypto_shadow_context
        ADD COLUMN IF NOT EXISTS buy_share_h1 double precision, ADD COLUMN IF NOT EXISTS buy_share_h24 double precision,
        ADD COLUMN IF NOT EXISTS txns_h1 int, ADD COLUMN IF NOT EXISTS txns_h24 int,
        ADD COLUMN IF NOT EXISTS buyers_h1 int, ADD COLUMN IF NOT EXISTS sellers_h1 int,
        ADD COLUMN IF NOT EXISTS market_cap_usd double precision, ADD COLUMN IF NOT EXISTS token_age_hours double precision,
        ADD COLUMN IF NOT EXISTS new_token boolean`))
      // AI judge (2026-11-22): the verdict stamped at entry, evidence only.
      .then(() => pool.query(`ALTER TABLE crypto_shadow_context
        ADD COLUMN IF NOT EXISTS judge_verdict text, ADD COLUMN IF NOT EXISTS judge_ai_direction text,
        ADD COLUMN IF NOT EXISTS judge_confidence real, ADD COLUMN IF NOT EXISTS judge_reason text,
        ADD COLUMN IF NOT EXISTS judge_failure text`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

// ── helpers ─────────────────────────────────────────────────────────────────
function ema(vals: number[], n: number): number | null {
  if (vals.length < n) return null;
  const k = 2 / (n + 1); let e = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
  return e;
}
/** Bars may arrive newest-first or oldest-first; normalise to oldest-first. */
export function oldestFirst(bars: Bar[]): Bar[] { return bars.length > 1 && bars[0].t > bars[bars.length - 1].t ? bars.slice().reverse() : bars; }
export function trendOf(closes: number[], fast: number, slow: number): string | null {
  const f = ema(closes, fast), s = ema(closes, slow);
  if (f == null || s == null) return null;
  return f > s * 1.002 ? 'BULLISH' : f < s * 0.998 ? 'BEARISH' : 'NEUTRAL';
}
export function pctChange(bars: Bar[], hoursBack: number): number | null {
  if (bars.length <= hoursBack) return null;
  const now = bars[bars.length - 1].c, then = bars[bars.length - 1 - hoursBack].c;
  return then > 0 ? ((now - then) / then) * 100 : null;
}

export function bucketsOf(c: { hour_utc?: number | null; liquidity_usd?: number | null; change_24h?: number | null; atr_pct?: number | null; htf_aligned?: boolean | null; btc_change_24h?: number | null; direction?: string | null;
  buy_share_h1?: number | null; txns_h1?: number | null; market_cap_usd?: number | null; token_age_hours?: number | null }): Record<string, string> {
  const b: Record<string, string> = {};
  if (c.buy_share_h1 != null) b.buyShare = c.buy_share_h1 < 0.45 ? 'sellers<45%' : c.buy_share_h1 < 0.55 ? 'balanced' : c.buy_share_h1 < 0.65 ? 'buyers55-65%' : 'buyers65%+';
  if (c.txns_h1 != null) b.activity = c.txns_h1 < 20 ? 'quiet<20tx/h' : c.txns_h1 < 100 ? '20-100tx/h' : c.txns_h1 < 500 ? '100-500tx/h' : '500+tx/h';
  if (c.market_cap_usd != null && c.market_cap_usd > 0) b.mcap = c.market_cap_usd < 10e6 ? '<10M' : c.market_cap_usd < 100e6 ? '10-100M' : c.market_cap_usd < 1e9 ? '100M-1B' : '1B+';
  if (c.token_age_hours != null) b.age = c.token_age_hours < 72 ? '<3d' : c.token_age_hours < 720 ? '3-30d' : '30d+';
  if (c.direction) b.side = c.direction;
  if (c.hour_utc != null) { const s = Math.floor(c.hour_utc / 4) * 4; b.hour = `${String(s).padStart(2, '0')}-${String(s + 4).padStart(2, '0')}UTC`; }
  const liq = c.liquidity_usd ?? 0;
  if (liq > 0) b.liquidity = liq < 250_000 ? '<250k' : liq < 1_000_000 ? '250k-1M' : liq < 5_000_000 ? '1-5M' : '5M+';
  if (c.change_24h != null) b.change24h = c.change_24h < -10 ? '<-10%' : c.change_24h < -2 ? '-10--2%' : c.change_24h < 2 ? 'flat' : c.change_24h < 10 ? '2-10%' : '10%+';
  if (c.atr_pct != null) b.volatility = c.atr_pct < 1 ? 'atr<1%' : c.atr_pct < 3 ? 'atr1-3%' : 'atr3%+';
  if (c.htf_aligned != null) b.htf = c.htf_aligned ? 'aligned' : 'against';
  if (c.btc_change_24h != null) b.btc = c.btc_change_24h < -2 ? 'btc_down' : c.btc_change_24h > 2 ? 'btc_up' : 'btc_flat';
  return b;
}

export interface BucketStat { strategy: string; dim: string; bucket: string; n: number; medianNet: number; winRate: number; verdict: 'favor' | 'avoid' | 'learning' }
function quantile(s: number[], q: number) { if (!s.length) return 0; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
export function aggregate(rows: any[]): BucketStat[] {
  const g = new Map<string, number[]>();
  for (const r of rows) {
    const v = Number(r.net_pct); if (!Number.isFinite(v)) continue;
    for (const [dim, bucket] of Object.entries({ ...bucketsOf(r), all: 'all' })) {
      const k = `${r.strategy}|${dim}|${bucket}`; (g.get(k) ?? g.set(k, []).get(k)!).push(v);
    }
  }
  const minN = num('CRYPTO_SHADOW_STATS_MIN_N', 15), fav = num('CRYPTO_SHADOW_FAVOR_MEDIAN_PCT', 0.5), avd = num('CRYPTO_SHADOW_AVOID_MEDIAN_PCT', 1);
  return Array.from(g.entries()).map(([k, v]) => {
    const [strategy, dim, bucket] = k.split('|'); const s = v.slice().sort((a, b) => a - b); const med = quantile(s, 0.5);
    const verdict: BucketStat['verdict'] = s.length >= minN ? (med > fav ? 'favor' : med < -avd ? 'avoid' : 'learning') : 'learning';
    return { strategy, dim, bucket, n: s.length, medianNet: med, winRate: s.filter((x) => x > 0).length / s.length, verdict };
  });
}
const _statsCache = new Map<number, { at: number; stats: BucketStat[] }>();
export async function computeCryptoShadowStats(userId: number, force = false): Promise<BucketStat[]> {
  const hit = _statsCache.get(userId);
  if (!force && hit && Date.now() - hit.at < 15 * 60_000) return hit.stats;
  await ensureCryptoShadowTables();
  const { rows } = await pool.query(
    `SELECT strategy, direction, hour_utc, liquidity_usd, change_24h, atr_pct, htf_aligned, btc_change_24h, buy_share_h1, txns_h1, market_cap_usd, token_age_hours, net_pct FROM crypto_shadow_context
      WHERE user_id=$1 AND closed_at IS NOT NULL AND net_pct IS NOT NULL AND closed_at >= now() - interval '60 days'`, [userId]);
  const stats = aggregate(rows);
  _statsCache.set(userId, { at: Date.now(), stats });
  return stats;
}
export function adviceFor(stats: BucketStat[], strategy: string, ctx: Parameters<typeof bucketsOf>[0]): string {
  const bs = bucketsOf(ctx);
  const hits = stats.filter((s) => s.strategy === strategy && s.verdict !== 'learning' && bs[s.dim] === s.bucket);
  if (!hits.length) return 'learning';
  const avoid = hits.filter((s) => s.verdict === 'avoid');
  const f = (s: BucketStat) => `${s.verdict}: ${s.dim} ${s.bucket} (n=${s.n}, median ${s.medianNet.toFixed(1)}%)`;
  return `${avoid.length ? 'avoid' : 'favor'} — ${[...avoid, ...hits.filter((s) => s.verdict === 'favor')].map(f).join('; ')}`.slice(0, 500);
}
/** Prompt block for crypto AI confirmation. Advice only. */
export async function getCryptoShadowStatsText(userId: number, max = 12): Promise<string> {
  try {
    // Shadow-only tests (session_breakout, btc_weekend_range) and the hour
    // buckets stay out of the prompt: no FX-style session language in crypto.
    const { SHADOW_ONLY_TESTS } = await import('./crypto-ports');
    const st = (await computeCryptoShadowStats(userId)).filter((s) => s.verdict !== 'learning' && s.dim !== 'all' && s.dim !== 'hour' && !SHADOW_ONLY_TESTS.has(s.strategy));
    if (!st.length) return '';
    const top = st.sort((a, b) => Math.abs(b.medianNet) * Math.sqrt(b.n) - Math.abs(a.medianNet) * Math.sqrt(a.n)).slice(0, max);
    return `CRYPTO SHADOW EVIDENCE (virtual trades of every strategy, net of costs, judged by MEDIAN; advice only; 'short' rows are hypothetical — Base spot can't short):\n` +
      top.map((s) => `- ${s.strategy} ${s.verdict.toUpperCase()} when ${s.dim}=${s.bucket}: n=${s.n}, median ${s.medianNet >= 0 ? '+' : ''}${s.medianNet.toFixed(2)}%, win ${(s.winRate * 100).toFixed(0)}%`).join('\n');
  } catch { return ''; }
}

// ── AI judge (shadow-scored only, 2026-11-22) ──────────────────────────────
// Reuses the live engine's crypto-native confirmation
// (crypto-ai-confirmation.ts) — same prompt, same verdict cache, same
// engine-marked budget metering — but as a JUDGE, not a gate: the stamp is
// written on the entry's context row and the entry stands whatever the
// verdict says. Two isolation details keep the live path untouched:
//  • the judge passes cacheScope 'shadow-h1', so its verdicts live in a
//    separate cache namespace and can never be served to (or throttle)
//    the live Dual-Vote gate, and vice versa;
//  • the candles judged are the lane's own H1 bars (deps.h1) and the only
//    indicator supplied is the lane's own H1 trend — the confirmation
//    prompt renders anything else as 'n/a' rather than inventing values.
export type CryptoJudgeVerdict = 'confirmed' | 'not_confirmed' | 'no_verdict';
export interface CryptoJudgeStamp {
  verdict: CryptoJudgeVerdict;
  aiDirection: 'BUY' | 'SELL' | 'NEUTRAL' | null;
  confidence: number | null;
  reason: string | null;
  /** Why there is no verdict: budget | rate_limit | auth | ai_error | timeout | exception. */
  failure: string | null;
}
export const cryptoShadowAiJudgeOn = () => process.env.CRYPTO_SHADOW_AI_JUDGE !== 'off';
const JUDGE_TIMEOUT_MS = () => num('CRYPTO_SHADOW_AI_JUDGE_TIMEOUT_MS', 30_000);
const NO_VERDICT = (failure: string): CryptoJudgeStamp => ({ verdict: 'no_verdict', aiDirection: null, confidence: null, reason: null, failure });

/** Pure mapping from a confirmation result to the stamp. An AI/provider
 *  error is NEVER a rejection — it is no_verdict with the failure class,
 *  the same distinction the live gate makes (an outage is not "AI said
 *  skip"). Direction agreement mirrors the live gate: the model's own
 *  direction must not oppose the proposed side (NEUTRAL does not oppose). */
export function judgeStampFromConfirmation(conf: {
  confirmed: boolean; aiDirection: 'BUY' | 'SELL' | 'NEUTRAL'; aiConfidence: number; reasoning: string;
  aiError?: boolean; aiErrorStatus?: number | null;
} | null, proposed: 'BUY' | 'SELL'): CryptoJudgeStamp {
  if (!conf) return NO_VERDICT('no_confirmation');
  if (conf.aiError) {
    const failure = conf.aiErrorStatus === 402 ? 'budget'
      : conf.aiErrorStatus === 429 ? 'rate_limit'
      : conf.aiErrorStatus === 401 || conf.aiErrorStatus === 403 ? 'auth' : 'ai_error';
    return { ...NO_VERDICT(failure), reason: (conf.reasoning || '').slice(0, 300) || null };
  }
  const dirOk = conf.aiDirection === proposed || conf.aiDirection === 'NEUTRAL';
  return {
    verdict: conf.confirmed && dirOk ? 'confirmed' : 'not_confirmed',
    aiDirection: conf.aiDirection,
    confidence: Number.isFinite(conf.aiConfidence) ? conf.aiConfidence : null,
    reason: (conf.reasoning || '').slice(0, 300) || null,
    failure: null,
  };
}

export type JudgeConfirmationFn = (opts: {
  userId: number; symbol: string; strategy: string; direction: 'BUY' | 'SELL'; price: number;
  quantScore: number; quantReasoning: string; indicators: any; candles: any[]; cacheScope?: string;
  evidence?: string;
}) => Promise<any>;

/** Ask the judge about one entry that is about to be recorded. NEVER
 *  throws and NEVER returns anything that could block the entry: every
 *  failure mode (provider error, budget block, timeout, exception) lands
 *  as no_verdict. The confirmation module's verdict cache makes repeat
 *  cycles re-ask nothing for the same setup. */
export async function judgeCryptoShadowEntry(args: {
  userId: number; symbol: string; strategy: string; direction: 'BUY' | 'SELL';
  price: number; score: number | null; reasoning: string; trend: string | null; candles: Bar[];
  /** Aggregated lane evidence (buildJudgeEvidence) — the judge sees the
   *  lane's own record for this pair/strategy/setup, not just the candle
   *  snapshot. Optional: absent, the confirmation prompt is unchanged. */
  evidence?: string;
}, confirmFn?: JudgeConfirmationFn): Promise<CryptoJudgeStamp> {
  if (!cryptoShadowAiJudgeOn()) return NO_VERDICT('judge_off');
  const TIMEOUT = Symbol('judge-timeout');
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const fn: JudgeConfirmationFn = confirmFn
      ?? (await import('./crypto-ai-confirmation')).getCryptoAiConfirmation as JudgeConfirmationFn;
    const conf: any = await Promise.race([
      fn({
        userId: args.userId, symbol: args.symbol, strategy: args.strategy, direction: args.direction,
        price: args.price, quantScore: Math.max(0, Math.min(100, Math.round(args.score ?? 0))),
        quantReasoning: args.reasoning || '', indicators: { trend: args.trend ?? undefined },
        candles: args.candles, cacheScope: 'shadow-h1', evidence: args.evidence,
      }),
      new Promise((resolve) => { timer = setTimeout(() => resolve(TIMEOUT), JUDGE_TIMEOUT_MS()); (timer as any).unref?.(); }),
    ]);
    if (conf === TIMEOUT) return NO_VERDICT('timeout');
    return judgeStampFromConfirmation(conf, args.direction);
  } catch {
    return NO_VERDICT('exception');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── AI judge scoreboard ─────────────────────────────────────────────────────
// Closed shadow trades grouped by side (long vs hypothetical short — Base
// spot can't short, so the two are never blended) × the verdict stamped
// at entry. Rows closed before the judge existed carry no stamp and are
// excluded — a missing verdict is not a no_verdict.
export interface AiJudgeStat { side: 'long' | 'short'; verdict: CryptoJudgeVerdict; n: number; winRate: number; medianNet: number; avgR: number | null }
export function aggregateAiJudge(rows: any[]): AiJudgeStat[] {
  const g = new Map<string, { nets: number[]; rs: number[] }>();
  for (const r of rows) {
    const v = String(r.judge_verdict || '');
    if (v !== 'confirmed' && v !== 'not_confirmed' && v !== 'no_verdict') continue;
    if (r.net_pct == null) continue; // Number(null) is 0 — a missing net is not a flat trade
    const net = Number(r.net_pct); if (!Number.isFinite(net)) continue;
    const k = `${r.direction === 'short' ? 'short' : 'long'}|${v}`;
    const e = g.get(k) ?? g.set(k, { nets: [], rs: [] }).get(k)!;
    e.nets.push(net);
    const rv = r.r_multiple == null ? NaN : Number(r.r_multiple); if (Number.isFinite(rv)) e.rs.push(rv);
  }
  const out: AiJudgeStat[] = [];
  for (const side of ['long', 'short'] as const) {
    for (const verdict of ['confirmed', 'not_confirmed', 'no_verdict'] as const) {
      const e = g.get(`${side}|${verdict}`); if (!e) continue;
      const s = e.nets.slice().sort((a, b) => a - b);
      out.push({
        side, verdict, n: s.length,
        winRate: s.filter((x) => x > 0).length / s.length,
        medianNet: quantile(s, 0.5),
        avgR: e.rs.length ? e.rs.reduce((a, b) => a + b, 0) / e.rs.length : null,
      });
    }
  }
  return out;
}
const _judgeStatsCache = new Map<number, { at: number; stats: AiJudgeStat[] }>();
export async function computeCryptoShadowAiJudge(userId: number, force = false): Promise<AiJudgeStat[]> {
  const hit = _judgeStatsCache.get(userId);
  if (!force && hit && Date.now() - hit.at < 15 * 60_000) return hit.stats;
  await ensureCryptoShadowTables();
  const { rows } = await pool.query(
    `SELECT c.direction, c.judge_verdict, c.net_pct, t.r_multiple
       FROM crypto_shadow_context c JOIN crypto_shadow_trades t ON t.id = c.trade_id
      WHERE c.user_id=$1 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL AND c.judge_verdict IS NOT NULL
        AND c.closed_at >= now() - interval '60 days'`, [userId]);
  const stats = aggregateAiJudge(rows);
  _judgeStatsCache.set(userId, { at: Date.now(), stats });
  return stats;
}

// ── Judge evidence (aggregated, token-lean) ─────────────────────────────────
// The judge must see the lane's collected data, not just the single entry
// in isolation (Chris, 2026-11-22): this pair's record in the lane, the
// candidate strategy's record + recent form, the bucket verdicts behind
// advice_at_entry, and the entry's market context. Aggregates and the
// last 10 closes ONLY — never a raw table dump (the original AI cost bug
// was thousand-token prompts), and the whole block is hard-capped.
export interface JudgeClosesSummary { n: number; winRate: number; medianNet: number; avgR: number | null }
export function summarizeJudgeCloses(rows: any[]): JudgeClosesSummary {
  const nets: number[] = [], rs: number[] = [];
  for (const r of rows) {
    if (r.net_pct == null) continue;
    const net = Number(r.net_pct); if (!Number.isFinite(net)) continue;
    nets.push(net);
    const rv = r.r_multiple == null ? NaN : Number(r.r_multiple); if (Number.isFinite(rv)) rs.push(rv);
  }
  const s = nets.slice().sort((a, b) => a - b);
  return {
    n: s.length,
    winRate: s.length ? s.filter((x) => x > 0).length / s.length : 0,
    medianNet: s.length ? quantile(s, 0.5) : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
  };
}
/** Overall record + recent form: last 14 days vs the prior 14, windowed
 *  from the rows' own closed_at (rows arrive newest-first). */
export function strategyForm(rows: any[], now = Date.now()): { overall: JudgeClosesSummary; last14: JudgeClosesSummary | null; prior14: JudgeClosesSummary | null } {
  const DAY = 86_400_000;
  const inWin = (r: any, from: number, to: number) => { const t = new Date(r.closed_at).getTime(); return Number.isFinite(t) && t >= from && t < to; };
  const last = summarizeJudgeCloses(rows.filter((r) => inWin(r, now - 14 * DAY, now + DAY)));
  const prior = summarizeJudgeCloses(rows.filter((r) => inWin(r, now - 28 * DAY, now - 14 * DAY)));
  return { overall: summarizeJudgeCloses(rows), last14: last.n ? last : null, prior14: prior.n ? prior : null };
}
export interface JudgeEvidenceInput {
  pair: JudgeClosesSummary & { underlying: string; recent: Array<{ strategy: string; direction: string; netPct: number; rMultiple: number | null }> };
  strategy: JudgeClosesSummary & { name: string; last14: JudgeClosesSummary | null; prior14: JudgeClosesSummary | null };
  buckets: Array<{ verdict: string; dim: string; bucket: string; n: number; medianNet: number }>;
  context: {
    liquidityUsd?: number | null; buyShareH1?: number | null; buyShareH24?: number | null;
    buyersH1?: number | null; sellersH1?: number | null; txnsH1?: number | null;
    tokenAgeHours?: number | null; marketCapUsd?: number | null; btcChange24h?: number | null;
    h1Trend?: string | null; h4Trend?: string | null; htfAligned?: boolean | null;
    atrPct?: number | null; change1h?: number | null; change24h?: number | null;
  };
}
const _pct = (x: number) => `${x >= 0 ? '+' : ''}${x.toFixed(2)}%`;
const _r = (x: number | null) => (x == null ? 'n/a' : `${x >= 0 ? '+' : ''}${x.toFixed(2)}R`);
const _usd = (x: number) => (x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e3 ? `$${Math.round(x / 1e3)}k` : `$${Math.round(x)}`);
export function buildJudgeEvidence(e: JudgeEvidenceInput): string {
  const lines: string[] = ["LANE EVIDENCE (this trading lane's own shadow record for this setup, net of costs — aggregates and recent closes only):"];
  if (e.pair.n > 0) {
    lines.push(`Pair ${e.pair.underlying} in this lane: ${e.pair.n} closed, ${Math.round(e.pair.winRate * 100)}% wins, median ${_pct(e.pair.medianNet)}, avg ${_r(e.pair.avgR)}.`);
    const recent = e.pair.recent.slice(0, 10);
    if (recent.length) lines.push(`Last closes on ${e.pair.underlying}: ${recent.map((r) => `${r.strategy} ${r.direction} ${_pct(r.netPct)}${r.rMultiple != null ? ` (${_r(r.rMultiple)})` : ''}`).join('; ')}.`);
  } else {
    lines.push(`Pair ${e.pair.underlying} in this lane: no closed shadow trades yet.`);
  }
  if (e.strategy.n > 0) {
    let line = `Strategy ${e.strategy.name} overall in this lane: ${e.strategy.n} closed, ${Math.round(e.strategy.winRate * 100)}% wins, median ${_pct(e.strategy.medianNet)}, avg ${_r(e.strategy.avgR)}.`;
    if (e.strategy.last14 || e.strategy.prior14) {
      const f = (s: JudgeClosesSummary | null) => (s ? `${s.n} closed, ${Math.round(s.winRate * 100)}% wins, median ${_pct(s.medianNet)}` : 'no closes');
      line += ` Recent form — last 14d: ${f(e.strategy.last14)}; prior 14d: ${f(e.strategy.prior14)}.`;
    }
    lines.push(line);
  } else {
    lines.push(`Strategy ${e.strategy.name} overall in this lane: no closed shadow trades yet.`);
  }
  if (e.buckets.length) {
    lines.push(`Bucket evidence for this setup: ${e.buckets.map((b) => `${b.verdict} — ${b.dim} ${b.bucket} (n=${b.n}, median ${_pct(b.medianNet)})`).join('; ')}.`);
  }
  const c = e.context, parts: string[] = [];
  if (c.liquidityUsd != null && c.liquidityUsd > 0) parts.push(`liquidity ${_usd(c.liquidityUsd)}`);
  if (c.buyShareH1 != null) parts.push(`buy share 1h ${Math.round(c.buyShareH1 * 100)}%${c.buyersH1 != null && c.sellersH1 != null ? ` (buyers ${c.buyersH1} / sellers ${c.sellersH1}${c.txnsH1 != null ? `, ${c.txnsH1} txns` : ''})` : ''}`);
  if (c.buyShareH24 != null) parts.push(`buy share 24h ${Math.round(c.buyShareH24 * 100)}%`);
  if (c.tokenAgeHours != null) parts.push(`token age ${c.tokenAgeHours < 72 ? `${Math.round(c.tokenAgeHours)}h` : `${Math.round(c.tokenAgeHours / 24)}d`}`);
  if (c.marketCapUsd != null && c.marketCapUsd > 0) parts.push(`market cap ${_usd(c.marketCapUsd)}`);
  if (c.btcChange24h != null) parts.push(`BTC 24h ${_pct(c.btcChange24h)}`);
  if (c.h1Trend) parts.push(`H1 trend ${c.h1Trend}`);
  if (c.h4Trend) parts.push(`H4 trend ${c.h4Trend}${c.htfAligned != null ? (c.htfAligned ? ' (HTF aligned with this side)' : ' (HTF against this side)') : ''}`);
  if (c.atrPct != null) parts.push(`ATR ${c.atrPct.toFixed(1)}%`);
  if (c.change1h != null) parts.push(`change 1h ${_pct(c.change1h)}`);
  if (c.change24h != null) parts.push(`change 24h ${_pct(c.change24h)}`);
  if (parts.length) lines.push(`Market context at entry: ${parts.join(', ')}.`);
  return lines.join('\n').slice(0, 2000);
}
/** Collect the evidence for one entry from the lane's own tables + the
 *  stats/context already computed for this cycle. Fail-soft: any read
 *  failure returns undefined and the judge proceeds on candles alone. */
export async function collectJudgeEvidence(userId: number, args: {
  underlying: string; strategy: string; stats: BucketStat[];
  ctx: Record<string, any>; h1Trend: string | null; h4Trend: string | null; aligned: boolean | null;
  buyShareH24: number | null; buyersH1: number | null; sellersH1: number | null;
}): Promise<string | undefined> {
  try {
    const pairRows = (await pool.query(
      `SELECT c.strategy, c.direction, c.net_pct, t.r_multiple FROM crypto_shadow_context c JOIN crypto_shadow_trades t ON t.id = c.trade_id
        WHERE c.user_id=$1 AND t.underlying=$2 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL ORDER BY c.closed_at DESC`,
      [userId, args.underlying])).rows;
    const stratRows = (await pool.query(
      `SELECT c.net_pct, t.r_multiple, c.closed_at FROM crypto_shadow_context c JOIN crypto_shadow_trades t ON t.id = c.trade_id
        WHERE c.user_id=$1 AND c.strategy=$2 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL ORDER BY c.closed_at DESC`,
      [userId, args.strategy])).rows;
    const form = strategyForm(stratRows);
    const bs = bucketsOf(args.ctx as any);
    const hits = args.stats
      .filter((s) => s.strategy === args.strategy && s.verdict !== 'learning' && bs[s.dim] === s.bucket)
      .map((s) => ({ verdict: s.verdict, dim: s.dim, bucket: s.bucket, n: s.n, medianNet: s.medianNet }));
    return buildJudgeEvidence({
      pair: {
        underlying: args.underlying, ...summarizeJudgeCloses(pairRows),
        recent: pairRows.slice(0, 10).map((r: any) => ({
          strategy: String(r.strategy), direction: String(r.direction),
          netPct: Number(r.net_pct), rMultiple: r.r_multiple == null ? null : Number(r.r_multiple),
        })),
      },
      strategy: { name: args.strategy, ...form.overall, last14: form.last14, prior14: form.prior14 },
      buckets: hits,
      context: {
        liquidityUsd: args.ctx.liquidity_usd, buyShareH1: args.ctx.buy_share_h1, buyShareH24: args.buyShareH24,
        buyersH1: args.buyersH1, sellersH1: args.sellersH1, txnsH1: args.ctx.txns_h1,
        tokenAgeHours: args.ctx.token_age_hours, marketCapUsd: args.ctx.market_cap_usd, btcChange24h: args.ctx.btc_change_24h,
        h1Trend: args.h1Trend, h4Trend: args.h4Trend, htfAligned: args.aligned,
        atrPct: args.ctx.atr_pct, change1h: args.ctx.change_1h, change24h: args.ctx.change_24h,
      },
    });
  } catch { return undefined; }
}

// ── Watch-plan evidence (structured form of the judge's record) ────────────
// The watch-plan deep study weighs the SAME lane record as the judge —
// pair history + last-10 closes, strategy record + 14d form, bucket
// evidence — but consumes it structured (crypto-watch-plans.ts builds
// the prompt). Same two bounded reads as collectJudgeEvidence.
// Fail-soft: any read failure returns undefined and the study proceeds
// on the entry context alone.
const toPlanSummary = (s: JudgeClosesSummary): CryptoPlanClosesSummary => s.n
  ? { n: s.n, winRate: s.winRate, avgR: s.avgR, medianNetPct: s.medianNet }
  : { n: 0, winRate: null, avgR: null, medianNetPct: null };
export async function collectCryptoPlanEvidence(userId: number, args: {
  underlying: string; strategy: string; stats: BucketStat[]; ctx: Record<string, any>;
}): Promise<{ pairHistory: CryptoPairHistory; strategyRecord: CryptoStrategyRecord; bucketEvidence: CryptoBucketEvidence[] } | undefined> {
  try {
    const pairRows = (await pool.query(
      `SELECT c.strategy, c.direction, c.net_pct, t.r_multiple FROM crypto_shadow_context c JOIN crypto_shadow_trades t ON t.id = c.trade_id
        WHERE c.user_id=$1 AND t.underlying=$2 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL ORDER BY c.closed_at DESC`,
      [userId, args.underlying])).rows;
    const stratRows = (await pool.query(
      `SELECT c.net_pct, t.r_multiple, c.closed_at FROM crypto_shadow_context c JOIN crypto_shadow_trades t ON t.id = c.trade_id
        WHERE c.user_id=$1 AND c.strategy=$2 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL ORDER BY c.closed_at DESC`,
      [userId, args.strategy])).rows;
    const form = strategyForm(stratRows);
    const bs = bucketsOf(args.ctx as any);
    const bucketEvidence = args.stats
      .filter((s) => s.strategy === args.strategy && s.verdict !== 'learning' && bs[s.dim] === s.bucket)
      .map((s) => ({ verdict: s.verdict, dim: s.dim, bucket: s.bucket, n: s.n, medianNet: s.medianNet }));
    return {
      pairHistory: {
        summary: toPlanSummary(summarizeJudgeCloses(pairRows)),
        recent: pairRows.slice(0, 10).map((r: any) => ({
          strategy: String(r.strategy), direction: String(r.direction),
          netPct: Number(r.net_pct), rMultiple: r.r_multiple == null ? null : Number(r.r_multiple),
        })),
      },
      strategyRecord: {
        overall: toPlanSummary(form.overall),
        last14d: form.last14 ? toPlanSummary(form.last14) : null,
        prior14d: form.prior14 ? toPlanSummary(form.prior14) : null,
      },
      bucketEvidence,
    };
  } catch { return undefined; }
}

// ── resolver ────────────────────────────────────────────────────────────────
export async function resolveCryptoShadowTrades(userId: number): Promise<number> {
  await ensureCryptoShadowTables();
  const { rows } = await pool.query(`SELECT * FROM crypto_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  if (!rows.length) return 0;
  const { getDefiPrice } = await import('./defi-market-data');
  let closed = 0;
  for (const t of rows) {
    const px = t.pool_address ? await getDefiPrice(t.chain || 'base', t.pool_address).catch(() => null) : null;
    const ageH = (Date.now() - new Date(t.opened_at).getTime()) / 3_600_000;
    const short = t.direction !== 'long';
    let exit: number | null = null, why = '';
    if (px != null && px > 0) {
      const move = ((short ? t.entry_price - px : px - t.entry_price) / t.entry_price) * 100;
      if (t.peak_gain_pct == null || move > t.peak_gain_pct) await pool.query(`UPDATE crypto_shadow_trades SET peak_gain_pct=$2 WHERE id=$1`, [t.id, move]);
      // Gap-through fills at the worse of price and level (no optimistic stop fills).
      if (short ? px >= t.stop_loss : px <= t.stop_loss) { exit = short ? Math.max(px, t.stop_loss) : Math.min(px, t.stop_loss); why = 'stop'; }
      else if (short ? px <= t.take_profit : px >= t.take_profit) { exit = t.take_profit; why = 'target'; }
      // Trail Brain: the same group (crypto × strategy × symbol) the
      // live lane learns on, in R (peak/current gain ÷ the trade's own
      // stop %). The floor is clamped at the trade's stop inside
      // trailBrainDecide, so the trailed stop can only tighten.
      if (!why) {
        const tb = await trailBrainConsult(userId, 'crypto', String(t.strategy || 'all'), String(t.symbol || 'all'));
        if (tb && Number(t.sl_pct) > 0) {
          const peakGain = Math.max(Number(t.peak_gain_pct) || -Infinity, move);
          const d = trailBrainDecide(tb.params, { peak: peakGain / Number(t.sl_pct), current: move / Number(t.sl_pct), stopFloor: -1 });
          if (d.binding) {
            void stampTrailBrainTrade('crypto_shadow_trades', t.id, tb);
            const floorPct = d.floor * Number(t.sl_pct);
            const ts = short ? Number(t.entry_price) * (1 - floorPct / 100) : Number(t.entry_price) * (1 + floorPct / 100);
            if (short ? px >= ts : px <= ts) { exit = short ? Math.max(px, ts) : Math.min(px, ts); why = 'trail'; }
          }
        }
      }
      if (!why && ageH >= t.max_hours) { exit = px; why = 'time limit'; }
    } else if (ageH >= t.max_hours + 24) { exit = null; why = 'no price'; }
    if (!why) continue;
    const gross = exit != null ? ((short ? t.entry_price - exit : exit - t.entry_price) / t.entry_price) * 100 : null;
    const net = gross != null ? gross - Number(t.cost_bps) / 100 : null;
    const r = net != null && t.sl_pct > 0 ? net / t.sl_pct : null;
    const upd = await pool.query(
      `UPDATE crypto_shadow_trades SET status='closed', exit_price=$2, exit_reason=$3, gross_return_pct=$4, return_pct=$5, r_multiple=$6, closed_at=now()
        WHERE id=$1 AND status='open'`, [t.id, exit, why, gross, net, r]);
    if (!upd.rowCount) continue;
    closed++;
    await pool.query(`UPDATE crypto_shadow_context SET closed_at=now(), exit_reason=$2, hold_minutes=$3, net_pct=$4 WHERE trade_id=$1`,
      [t.id, why, ageH * 60, net]).catch(() => {});
  }
  return closed;
}

// ── entry lane ──────────────────────────────────────────────────────────────
const _lastRun = new Map<number, number>();
export async function runCryptoShadowAll(userId: number, cfg: any, symbols: string[], chain: string, slippageCapBps: number, deps: ShadowDeps): Promise<{ opened: number; closed: number }> {
  if (!shadowAllEnabled()) return { opened: 0, closed: 0 };
  await ensureCryptoShadowTables();
  const closed = await resolveCryptoShadowTrades(userId).catch(() => 0);
  if (Date.now() - (_lastRun.get(userId) || 0) < EVERY_MS()) return { opened: 0, closed };
  _lastRun.set(userId, Date.now());

  const { isTokenizedAsset, underlyingOf, paperMaxHoursFor } = await import('./crypto-paper');
  const { estimateCryptoRoundTripBps } = await import('./paper-costs');
  const stats = await computeCryptoShadowStats(userId).catch(() => [] as BucketStat[]);
  const { rows: open } = await pool.query(`SELECT strategy, underlying FROM crypto_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  const { rows: recent } = await pool.query(
    `SELECT strategy, underlying FROM crypto_shadow_trades WHERE user_id=$1 AND status='closed' AND closed_at >= now() - ($2::text || ' milliseconds')::interval`,
    [userId, String(COOLDOWN_MS())]);
  const btc = deps.universe('CBBTC') ? await deps.h1('CBBTC').catch(() => null) : null;
  const btcChange = btc ? pctChange(oldestFirst(btc.bars), 24) : null;
  const lo = num('CRYPTO_PAPER_SL_MIN', 1.5), hi = num('CRYPTO_PAPER_SL_MAX', 12), atrMult = num('CRYPTO_SL_ATR_MULT', 1.5), rr = num('CRYPTO_MIN_RR', 2);
  const floorMult = Number(process.env.CRYPTO_PAPER_COST_FLOOR_MULT ?? 3);
  let opened = 0;
  const shadowCfg = { ...cfg, directionFilter: 'both' };
  // Watch plans (crypto-watch-plans.ts): the plan layer's per-cycle
  // deep-call budget is created here, once, and shared across every
  // candidate below; the strategy-key set is the lane's live runner
  // keys plus the synthesized composite.
  const plansOn = cryptoWatchPlansEnabled();
  const planCycle = newCryptoPlanCycle();
  const planStrategyKeys = new Set([...Object.keys(deps.runners), 'composite_autonomous']);

  for (const symbol of symbols) {
    if (open.length >= MAX_OPEN()) break;
    if (isTokenizedAsset(symbol)) continue;
    const uni = deps.universe(symbol);
    if (!uni?.poolAddress) continue;
    const und = underlyingOf(symbol);
    // New-pool tokens are evaluated ONLY by the new-token runner (meme);
    // established tokens never by it.
    const { NEW_TOKEN_RUNNERS, buyShare } = await import('./crypto-ports');
    const runnersFor = Object.entries(deps.runners).filter(([k]) => uni.newToken ? NEW_TOKEN_RUNNERS.has(k) : !NEW_TOKEN_RUNNERS.has(k));
    const results = (await Promise.all(runnersFor.map(([k, fn]) => fn(symbol, shadowCfg).then((r) => ({ ...r, strategy: r.strategy || k })).catch(() => null))))
      .filter((r): r is ShadowRunnerResult => !!r);
    // Composite (same rule as auto mode): >=2 runners agree, blended score >= floor.
    const ORIGINAL = new Set(['trend_following', 'momentum', 'order_flow', 'volume_profile', 'breakout', 'structure', 'divergence']);
    const dirs = results.filter((r) => r.direction && ORIGINAL.has(r.strategy));
    const buys = dirs.filter((r) => r.direction === 'BUY'), sells = dirs.filter((r) => r.direction === 'SELL');
    const side = buys.length > sells.length ? buys : sells.length > buys.length ? sells : [];
    const signals = results.filter((r) => r.decision === 'signal' && r.direction && r.price);
    if (side.length >= 2) {
      const comp = Math.round(side.reduce((s, r) => s + (r.score ?? 0), 0) / side.length);
      if (comp >= (cfg.compositeMinEdgeScore ?? 72)) signals.push({ ...side[0], decision: 'signal', score: comp, strategy: 'composite_autonomous', reasoning: `${side.length} runners agree` });
    }
    if (!signals.length) continue;
    const h1 = await deps.h1(symbol).catch(() => null);
    if (!h1 || !(h1.atr > 0)) continue;
    const bars = oldestFirst(h1.bars), closes = bars.map((b) => b.c);
    const h1Trend = trendOf(closes, 9, 21);
    const h4Closes = closes.filter((_, i) => (closes.length - 1 - i) % 4 === 0);
    const h4Trend = trendOf(h4Closes, 5, 10);
    const ch1 = pctChange(bars, 1), ch24 = pctChange(bars, 24);
    const vol24 = bars.slice(-24).reduce((a, b) => a + (b.v || 0) * (b.c || 0), 0);

    for (const sig of signals) {
      if (open.length >= MAX_OPEN()) break;
      const strat = sig.strategy;
      if (open.filter((o) => o.strategy === strat).length >= MAX_PER_STRAT()) continue;
      if (open.some((o) => o.strategy === strat && o.underlying === und)) continue;
      if (recent.some((o) => o.strategy === strat && o.underlying === und)) continue;
      const price = Number(sig.price) || Number(uni.priceUsd);
      if (!(price > 0)) continue;
      const direction = sig.direction === 'SELL' ? 'hypothetical_short' : 'long';
      const short = direction !== 'long';
      const slPct = Math.min(hi, Math.max(lo, (h1.atr * atrMult / price) * 100));
      const costBps = estimateCryptoRoundTripBps({ notionalUsd: NOTIONAL(), liquidityUsd: uni.liquidityUsd, slippageCapBps }).roundTripBps
        // New pools: sniping bots, MEV and launch taxes — the high-cost model.
        + (uni.newToken ? Number(process.env.CRYPTO_MEME_EXTRA_COST_BPS ?? 200) : 0);
      if (floorMult > 0 && slPct < floorMult * costBps / 100) continue;
      const stop = short ? price * (1 + slPct / 100) : price * (1 - slPct / 100);
      const target = short ? price * (1 - slPct * rr / 100) : price * (1 + slPct * rr / 100);
      const aligned = h4Trend == null ? null : short ? h4Trend === 'BEARISH' : h4Trend === 'BULLISH';
      const gated = await deps.gate(symbol, sig, cfg).then((g) => g.decision !== 'signal').catch(() => null);
      const hourUtc = new Date().getUTCHours();
      const fl = uni.flow;
      const created = fl?.poolCreatedAt ? new Date(fl.poolCreatedAt).getTime() : NaN;
      const ctx = { hour_utc: hourUtc, liquidity_usd: uni.liquidityUsd, change_24h: ch24, atr_pct: (h1.atr / price) * 100, htf_aligned: aligned, btc_change_24h: btcChange, direction: short ? 'short' : 'long',
        buy_share_h1: fl ? buyShare(fl.h1) : null, txns_h1: fl ? fl.h1.buys + fl.h1.sells : null,
        market_cap_usd: fl ? (fl.marketCapUsd ?? fl.fdvUsd) : null,
        token_age_hours: Number.isFinite(created) ? (Date.now() - created) / 3_600_000 : null };
      const advice = adviceFor(stats, strat, ctx);
      // Lesson gate: skip entries the lane's own lessons have proven
      // losing. Stats are this lane's closes only (rolling 60 days).
      if (cryptoShadowLessonsOn()) {
        const hit = matchingAvoidBucket(stats, strat, bucketsOf(ctx), { includeAll: true });
        if (hit) {
          void logShadowLessonBlock({
            lane: 'crypto_shadow', userId, strategyKey: strat,
            bucket: hit.dim === 'all' ? 'strategy (all)' : `${hit.dim} ${hit.bucket}`,
            n: hit.n, winRate: hit.winRate, medianPct: hit.medianNet,
            reason: `bucket verdict 'avoid': n=${hit.n}, median net ${hit.medianNet.toFixed(2)}% over the rolling 60 days`,
          });
          continue;
        }
      }
      // Improvement-loop throttle (improvement-loop.ts): the shared
      // cross-engine evaluation pauses NEW shadow entries for a
      // strategy whose last-14-days trend is DEGRADING vs the prior 14,
      // until recovery or 7 days. Trend signal, distinct from the
      // bucket gate above; the consult fails open.
      if (await improvementThrottleBlocks(userId, 'crypto', strat)) {
        logImprovementBlock(userId, 'crypto', strat, symbol);
        continue;
      }
      const tags: string[] = [];
      if (ch1 != null && Math.abs(ch1) >= 3) tags.push(ch1 > 0 ? 'hot_hour' : 'dump_hour');
      if (ch24 != null && ch24 >= 20) tags.push('extended_24h');
      // HTF alignment filter (design step 3): tag + stats only, never a block.
      if (aligned === false) tags.push('against_htf');
      if (aligned === true) tags.push('htf_aligned');
      if (gated) tags.push('live_gate_would_block');
      if (uni.liquidityUsd < 250_000) tags.push('thin_pool');
      if (uni.newToken) tags.push('new_token');
      if (ctx.buy_share_h1 != null && ctx.buy_share_h1 > 0.65) tags.push('buyers_dominant');
      if (ctx.buy_share_h1 != null && ctx.buy_share_h1 < 0.45) tags.push('sellers_dominant');
      // ── AI watch plans (crypto-watch-plans.ts): this candidate has
      // passed EVERY existing gate above (caps, no-duplicate, re-entry
      // cooldown, cost floor, lesson gate, improvement throttle) in its
      // existing order. With plans ON, the entry additionally needs a
      // live plan for this symbol+strategy whose trigger has formed on
      // the H1 bars this cycle already fetched (free, deterministic —
      // watching buys nothing). No triggered plan → the signal is
      // skipped and counted by the plan layer (planSkips); that is the
      // design. A plan-layer FAILURE degrades to today's mechanical
      // entry for this candidate (action 'fallback', counted
      // separately) — the lane never halts. resolveCryptoWatchPlan
      // never throws; the try/catch is belt-and-braces with the same
      // fallback semantics.
      let viaPlan = false;
      if (plansOn) {
        let res: CryptoWatchPlanAction = { action: 'fallback' };
        try {
          const planEvidence = await collectCryptoPlanEvidence(userId, {
            underlying: und, strategy: strat, stats, ctx,
          }).catch(() => undefined);
          res = await resolveCryptoWatchPlan({
            userId, symbol, underlying: und, strategy: strat,
            signalDirection: short ? 'short' : 'long', signalScore: sig.score ?? null,
            entryPrice: price, slPct, atrPct: ctx.atr_pct,
            h1Trend, h4Trend, htfAligned: aligned,
            liquidityUsd: uni.liquidityUsd, buyShareH1: ctx.buy_share_h1, btcChange24h: btcChange,
            recentCloses: closes.slice(-12),
            pairHistory: planEvidence?.pairHistory ?? null,
            strategyRecord: planEvidence?.strategyRecord ?? null,
            bucketEvidence: planEvidence?.bucketEvidence ?? null,
            candlesNewestFirst: bars.slice().reverse().map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c })),
            currentPrice: price,
          }, planCycle, { strategyKeys: planStrategyKeys });
        } catch { res = { action: 'fallback' }; }
        if (res.action === 'skip') continue;
        viaPlan = res.action === 'triggered';
      }
      const ins = await pool.query(
        `INSERT INTO crypto_shadow_trades (user_id, strategy, symbol, underlying, chain, token_address, pool_address, direction, entry_price, stop_loss, take_profit,
           sl_pct, notional_usd, cost_bps, score, max_hours) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
        [userId, strat, symbol, und, chain, uni.address ?? null, uni.poolAddress, direction, price, stop, target, slPct, NOTIONAL(), costBps, sig.score ?? null, paperMaxHoursFor(strat)]);
      const id = ins.rows[0]?.id;
      if (!id) continue;
      // AI judge: the trade row already exists, so the entry stands
      // whatever the judge says — the verdict is only stamped onto the
      // context row below as evidence. judgeCryptoShadowEntry never
      // throws (failures land as no_verdict); the extra catch is belt and
      // braces so a judge fault can never cost the lane an entry.
      let judge: CryptoJudgeStamp | null = null;
      if (cryptoShadowAiJudgeOn()) {
        // The judge sees the lane's own record for this pair/strategy/
        // setup (aggregates + last closes), not just the entry snapshot.
        // Evidence collection is fail-soft — no evidence, judge proceeds.
        const evidence = await collectJudgeEvidence(userId, {
          underlying: und, strategy: strat, stats, ctx: { ...ctx, change_1h: ch1 },
          h1Trend, h4Trend, aligned,
          buyShareH24: fl ? buyShare(fl.h24) : null, buyersH1: fl?.h1.buyers ?? null, sellersH1: fl?.h1.sellers ?? null,
        }).catch(() => undefined);
        judge = await judgeCryptoShadowEntry({
          userId, symbol, strategy: strat, direction: short ? 'SELL' : 'BUY',
          price, score: sig.score ?? null, reasoning: sig.reasoning ?? '',
          trend: h1Trend, candles: bars, evidence,
        }).catch(() => null);
      }
      await pool.query(
        `INSERT INTO crypto_shadow_context (trade_id, user_id, strategy, symbol, direction, liquidity_usd, change_1h, change_24h, volume_24h_usd, atr_pct,
           h1_trend, h4_trend, htf_aligned, live_gate_blocked, btc_change_24h, hour_utc, day_of_week, score, tags, advice_at_entry,
           buy_share_h1, buy_share_h24, txns_h1, txns_h24, buyers_h1, sellers_h1, market_cap_usd, token_age_hours, new_token,
           judge_verdict, judge_ai_direction, judge_confidence, judge_reason, judge_failure)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34) ON CONFLICT (trade_id) DO NOTHING`,
        [id, userId, strat, symbol, ctx.direction, uni.liquidityUsd, ch1, ch24, vol24 || null, ctx.atr_pct, h1Trend, h4Trend, aligned, gated, btcChange,
         hourUtc, new Date().getUTCDay(), sig.score ?? null, tags, advice,
         ctx.buy_share_h1, fl ? buyShare(fl.h24) : null, ctx.txns_h1, fl ? fl.h24.buys + fl.h24.sells : null,
         fl?.h1.buyers ?? null, fl?.h1.sellers ?? null, ctx.market_cap_usd, ctx.token_age_hours, !!uni.newToken,
         judge?.verdict ?? null, judge?.aiDirection ?? null, judge?.confidence ?? null, judge?.reason ?? null, judge?.failure ?? null]).catch(() => {});
      open.push({ strategy: strat, underlying: und });
      if (viaPlan) noteCryptoPlanEntry(userId);
      opened++;
    }
  }
  return { opened, closed };
}
