// ─────────────────────────────────────────────────────────────────────────────
// Continuous improvement loop (2026-11-21, Chris's directive).
//
// "Every engine needs to continually learn from its bad trades and get
// measurably more accurate over time — accuracy and profit trending UP on
// a two-week rhythm, not silently degrading."
//
// Until now the app's learning was one-directional and fragmented: lesson
// gates (PR #68) block proven losers forever-until-the-window-clears, the
// perp brain rates buckets, trail guards judge themselves — but NOTHING
// measured whether a strategy is getting BETTER or WORSE over time, and
// nothing acted on a strategy that was quietly sliding. This module is
// that missing measurement + response layer, shared across engines:
//
//   • EVALUATOR (every 6 h): per user × engine × strategy, rolling stats
//     for the current 14 days vs the prior 14 days, read from the
//     EXISTING outcome sources — the shared shadow_ledger view (Kalshi
//     perp shadow, Sol shadow, crypto shadow, Studio shadow, FX models,
//     Kalshi weather/sports) plus fx_brain_outcomes for the live FX
//     brain. No new raw-trade tables; the ledger's own validity filters
//     (stats exclusions, junk-print quarantines) apply unchanged.
//   • SNAPSHOTS: every evaluation appends one snapshot to runtime_state
//     scope 'improvement_snapshots' (capped, newest last). The snapshot
//     history IS the evidence base for "accuracy better every other
//     week" — it survives restarts and is summarised on /api/health.
//   • CLASSIFICATION per strategy: IMPROVING (avg R up ≥ 0.1, n ≥ 20 in
//     the current window), DEGRADING (avg R down ≥ 0.15 AND win rate not
//     improved, n ≥ 20), else FLAT, or INSUFFICIENT when either window
//     lacks the evidence. Where a lane has no R, avg net % is the metric
//     with its own (larger) thresholds.
//   • AUTO-ACTION — SHADOW LANES ONLY (Kalshi perp shadow, Sol shadow,
//     crypto shadow, Studio shadow): a DEGRADING strategy's NEW shadow
//     entries pause until the next evaluation shows recovery or 7 days
//     elapse, whichever comes first. Transitions (pause / resume) are
//     logged as guard events. Open shadow positions are never touched —
//     they resolve on their own rules, exactly like the lesson gates.
//
// HARD LIMITS (pinned by scripts/check-improvement-loop.ts):
//   • NEVER touches a live-money order path, a promotion bar, an arming
//     flag, or any live engine's decision behavior.
//   • FAIL OPEN everywhere: an unreadable store, a failed query, or any
//     thrown error consults as "not throttled" and skips the evaluation
//     — a measurement layer must never become an outage.
//   • Kill switch IMPROVEMENT_LOOP=off disables evaluation, throttling
//     and the entry consults entirely; the lanes behave exactly as they
//     did before this module existed.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from '../db';
import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';
import { logGuard } from './guard-events';
import { loopTick } from '../crash-heartbeat';

const SNAPSHOT_SCOPE = 'improvement_snapshots';
const THROTTLE_SCOPE = 'improvement_throttles';
const STORE_KEY = 'global';

// ── Kill switch + env knobs ──────────────────────────────────────────────
export function improvementLoopOn(): boolean {
  return process.env.IMPROVEMENT_LOOP !== 'off';
}

const num = (name: string, dflt: number, min: number, max: number): number => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : dflt;
};

/** Comparison window length in days (the "two-week rhythm"). */
export const improvementWindowDays = (): number => Math.floor(num('IMPROVEMENT_LOOP_WINDOW_DAYS', 14, 3, 60));
/** Minimum current-window trades behind the metric before a trend is called. */
export const improvementMinTrades = (): number => Math.floor(num('IMPROVEMENT_LOOP_MIN_TRADES', 20, 3, 500));
/** Minimum prior-window trades behind the metric for a delta to exist. */
export const improvementPriorMinTrades = (): number => Math.floor(num('IMPROVEMENT_LOOP_PRIOR_MIN_TRADES', 5, 1, 500));
/** Avg-R gain that earns IMPROVING. */
export const improvementImprovingDeltaR = (): number => num('IMPROVEMENT_LOOP_IMPROVING_DELTA_R', 0.1, 0.01, 5);
/** Avg-R loss that (with no win-rate improvement) earns DEGRADING. */
export const improvementDegradingDeltaR = (): number => num('IMPROVEMENT_LOOP_DEGRADING_DELTA_R', 0.15, 0.01, 5);
/** Net-% fallbacks for lanes with no R (bigger numbers — % units). */
export const improvementImprovingDeltaPct = (): number => num('IMPROVEMENT_LOOP_IMPROVING_DELTA_PCT', 0.5, 0.05, 50);
export const improvementDegradingDeltaPct = (): number => num('IMPROVEMENT_LOOP_DEGRADING_DELTA_PCT', 0.75, 0.05, 50);
/** How long a throttle pause lasts before it lifts on time alone. */
export const improvementPauseDays = (): number => num('IMPROVEMENT_LOOP_PAUSE_DAYS', 7, 0.25, 60);
/** Evaluation cadence. */
export const improvementIntervalMs = (): number => Math.floor(num('IMPROVEMENT_LOOP_INTERVAL_MS', 6 * 3_600_000, 60_000, 7 * 24 * 3_600_000));
/** Snapshot history cap in runtime_state. */
export const improvementSnapshotCap = (): number => Math.floor(num('IMPROVEMENT_LOOP_SNAPSHOT_CAP', 200, 10, 2000));

// ── Types ────────────────────────────────────────────────────────────────
export interface WindowStat {
  trades: number;
  wins: number;
  winRate: number | null;
  rTrades: number;
  avgR: number | null;
  totalR: number | null;
  pctTrades: number;
  avgPct: number | null;
  totalPct: number | null;
}

export type ImprovementClassification = 'improving' | 'degrading' | 'flat' | 'insufficient';

export interface StrategyTrend {
  userId: number;
  engine: string;
  strategy: string;
  /** True only for the four shadow lanes the throttle may act on. */
  throttleLane: boolean;
  classification: ImprovementClassification;
  /** Which metric the classification ran on ('R' preferred, 'pct' fallback). */
  metric: 'R' | 'pct' | null;
  /** cur − prior in metric units; null when no delta could be computed. */
  delta: number | null;
  cur: WindowStat;
  prior: WindowStat;
}

export interface ThrottleEntry {
  userId: number;
  engine: string;
  strategy: string;
  pausedAt: string;
  pausedUntil: string;
  reason: string;
}

export interface ImprovementSnapshot {
  at: string;
  curStart: string;
  curEnd: string;
  priorStart: string;
  priorEnd: string;
  strategies: StrategyTrend[];
  throttled: ThrottleEntry[];
}

export interface ThrottleTransition {
  type: 'pause' | 'resume_recovery' | 'resume_expired';
  entry: ThrottleEntry;
  trend?: StrategyTrend;
}

// ── Pure helpers (the check script walks every one of these) ─────────────
export function emptyWindowStat(): WindowStat {
  return { trades: 0, wins: 0, winRate: null, rTrades: 0, avgR: null, totalR: null, pctTrades: 0, avgPct: null, totalPct: null };
}

interface RawAccum { trades: number; wins: number; rTrades: number; sumR: number; pctTrades: number; sumPct: number }

export function emptyAccum(): RawAccum {
  return { trades: 0, wins: 0, rTrades: 0, sumR: 0, pctTrades: 0, sumPct: 0 };
}

export function addToAccum(a: RawAccum, r: { trades?: any; wins?: any; rTrades?: any; sumR?: any; pctTrades?: any; sumPct?: any }): void {
  a.trades += Number(r.trades) || 0;
  a.wins += Number(r.wins) || 0;
  a.rTrades += Number(r.rTrades) || 0;
  a.sumR += Number(r.sumR) || 0;
  a.pctTrades += Number(r.pctTrades) || 0;
  a.sumPct += Number(r.sumPct) || 0;
}

export function accumToStat(a: RawAccum): WindowStat {
  return {
    trades: a.trades,
    wins: a.wins,
    winRate: a.trades > 0 ? a.wins / a.trades : null,
    rTrades: a.rTrades,
    avgR: a.rTrades > 0 ? a.sumR / a.rTrades : null,
    totalR: a.rTrades > 0 ? a.sumR : null,
    pctTrades: a.pctTrades,
    avgPct: a.pctTrades > 0 ? a.sumPct / a.pctTrades : null,
    totalPct: a.pctTrades > 0 ? a.sumPct : null,
  };
}

/** [priorStart, curStart) and [curStart, curEnd) boundaries for `now`. */
export function windowBounds(nowMs: number, windowDays: number): { priorStart: number; curStart: number; curEnd: number } {
  const w = windowDays * 24 * 3_600_000;
  return { priorStart: nowMs - 2 * w, curStart: nowMs - w, curEnd: nowMs };
}

export interface ClassifyThresholds {
  minTrades: number;
  priorMinTrades: number;
  improvingDeltaR: number;
  degradingDeltaR: number;
  improvingDeltaPct: number;
  degradingDeltaPct: number;
}

export function defaultClassifyThresholds(): ClassifyThresholds {
  return {
    minTrades: improvementMinTrades(),
    priorMinTrades: improvementPriorMinTrades(),
    improvingDeltaR: improvementImprovingDeltaR(),
    degradingDeltaR: improvementDegradingDeltaR(),
    improvingDeltaPct: improvementImprovingDeltaPct(),
    degradingDeltaPct: improvementDegradingDeltaPct(),
  };
}

/**
 * Call the trend for one strategy from its two window stats. Pure.
 * The metric is avg R when both windows carry R evidence, else avg net
 * %. A call needs ≥ minTrades behind the metric in the current window
 * and ≥ priorMinTrades in the prior window — anything less is
 * INSUFFICIENT, never a guess. DEGRADING additionally requires the win
 * rate NOT to have improved: a strategy whose average R dipped while
 * its hit rate rose is restructuring, not rotting.
 */
export function classifyTrend(
  cur: WindowStat, prior: WindowStat, th: ClassifyThresholds = defaultClassifyThresholds(),
): { classification: ImprovementClassification; metric: 'R' | 'pct' | null; delta: number | null } {
  let metric: 'R' | 'pct' | null = null;
  if (cur.avgR != null && prior.avgR != null) metric = 'R';
  else if (cur.avgPct != null && prior.avgPct != null) metric = 'pct';
  if (!metric) return { classification: 'insufficient', metric: null, delta: null };
  const curN = metric === 'R' ? cur.rTrades : cur.pctTrades;
  const priorN = metric === 'R' ? prior.rTrades : prior.pctTrades;
  if (curN < th.minTrades || priorN < th.priorMinTrades) {
    return { classification: 'insufficient', metric, delta: null };
  }
  const curAvg = (metric === 'R' ? cur.avgR : cur.avgPct) as number;
  const priorAvg = (metric === 'R' ? prior.avgR : prior.avgPct) as number;
  const delta = curAvg - priorAvg;
  const improvingDelta = metric === 'R' ? th.improvingDeltaR : th.improvingDeltaPct;
  const degradingDelta = metric === 'R' ? th.degradingDeltaR : th.degradingDeltaPct;
  // EPS: a delta that IS the threshold (0.3 − 0.2) must not fall a float
  // ULP short of it — thresholds are policy, not float trivia.
  const EPS = 1e-9;
  if (delta >= improvingDelta - EPS) return { classification: 'improving', metric, delta };
  const winRateImproved = cur.winRate != null && prior.winRate != null && cur.winRate > prior.winRate;
  if (delta <= -degradingDelta + EPS && !winRateImproved) return { classification: 'degrading', metric, delta };
  return { classification: 'flat', metric, delta };
}

export const throttleKey = (userId: number, engine: string, strategy: string): string => `${userId}|${engine}|${strategy}`;

/**
 * Advance the throttle set by one evaluation. Pure: given the current
 * pauses, this evaluation's trends, and the clock, returns the new set
 * plus the transitions to log. A pause lifts on the FIRST of: an
 * evaluation whose trend for the strategy is no longer DEGRADING with
 * sufficient evidence behind it (recovery), or the pause window
 * elapsing (expiry). A still-degrading strategy past expiry is resumed
 * by the clock and will simply be re-paused by this same pass if its
 * fresh trend still condemns it — the 7-day lift is real, not a
 * rubber stamp.
 */
export function nextThrottleState(
  existing: ThrottleEntry[],
  trends: StrategyTrend[],
  nowMs: number,
  pauseDays: number,
  windowDays: number = 14,
): { entries: ThrottleEntry[]; transitions: ThrottleTransition[] } {
  const transitions: ThrottleTransition[] = [];
  const trendByKey = new Map<string, StrategyTrend>();
  for (const t of trends) trendByKey.set(throttleKey(t.userId, t.engine, t.strategy), t);
  const kept = new Map<string, ThrottleEntry>();
  for (const e of existing) {
    const k = throttleKey(e.userId, e.engine, e.strategy);
    const trend = trendByKey.get(k);
    const expired = nowMs >= Date.parse(e.pausedUntil);
    if (trend && trend.classification !== 'degrading' && trend.classification !== 'insufficient') {
      transitions.push({ type: 'resume_recovery', entry: e, trend });
      continue;
    }
    if (expired) {
      transitions.push({ type: 'resume_expired', entry: e, trend });
      continue;
    }
    kept.set(k, e);
  }
  for (const t of trends) {
    if (!t.throttleLane || t.classification !== 'degrading') continue;
    const k = throttleKey(t.userId, t.engine, t.strategy);
    if (kept.has(k)) continue;
    const fmt = (v: number | null, u: string) => (v == null ? '?' : `${v >= 0 ? '+' : ''}${v.toFixed(2)}${u}`);
    const entry: ThrottleEntry = {
      userId: t.userId, engine: t.engine, strategy: t.strategy,
      pausedAt: new Date(nowMs).toISOString(),
      pausedUntil: new Date(nowMs + pauseDays * 24 * 3_600_000).toISOString(),
      reason: `degrading trend: avg ${t.metric === 'pct' ? 'net %' : 'R'} ${fmt(t.metric === 'pct' ? t.prior.avgPct : t.prior.avgR, t.metric === 'pct' ? '%' : 'R')} → ${fmt(t.metric === 'pct' ? t.cur.avgPct : t.cur.avgR, t.metric === 'pct' ? '%' : 'R')} over the last ${windowDays} days vs the prior ${windowDays}, win rate ${t.cur.winRate != null ? Math.round(t.cur.winRate * 100) : '?'}% — new shadow entries paused`,
    };
    kept.set(k, entry);
    transitions.push({ type: 'pause', entry, trend: t });
  }
  return { entries: Array.from(kept.values()), transitions };
}

/** Append one snapshot to the history, capped (newest last). Pure. */
export function appendSnapshot(history: ImprovementSnapshot[], snap: ImprovementSnapshot, cap: number): ImprovementSnapshot[] {
  const next = [...history, snap];
  return next.length > cap ? next.slice(next.length - cap) : next;
}

/** Shape a snapshot object from evaluated trends + the live throttle set. Pure. */
export function buildSnapshot(atMs: number, bounds: { priorStart: number; curStart: number; curEnd: number }, trends: StrategyTrend[], throttled: ThrottleEntry[]): ImprovementSnapshot {
  const iso = (ms: number) => new Date(ms).toISOString();
  return {
    at: iso(atMs),
    curStart: iso(bounds.curStart), curEnd: iso(bounds.curEnd),
    priorStart: iso(bounds.priorStart), priorEnd: iso(bounds.curStart),
    strategies: trends, throttled,
  };
}

// ── Source mapping ───────────────────────────────────────────────────────
// shadow_ledger source → (engine label, throttle lane?). Only the four
// named shadow lanes may be throttled. Everything else is measured for
// the trend record and NEVER acted on: fx_shadow is the FX Models
// measurement lane (its own lesson gate already acts inside
// shadowDecide), the Kalshi weather/sports lanes keep their own bars,
// and fx_brain_outcomes is LIVE FX — measurement only, by design.
const LEDGER_SOURCES: Record<string, { engine: string; throttleLane: boolean }> = {
  kalshi_stock_shadow: { engine: 'kalshi_perp', throttleLane: true },
  sol_shadow: { engine: 'sol', throttleLane: true },
  crypto_shadow_all: { engine: 'crypto', throttleLane: true },
  crypto_shadow_short: { engine: 'crypto', throttleLane: true },
  strategy_studio_shadow: { engine: 'studio', throttleLane: true },
  fx_shadow: { engine: 'fx', throttleLane: false },
  kalshi_weather_shadow: { engine: 'kalshi', throttleLane: false },
  kalshi_sports_shadow: { engine: 'kalshi', throttleLane: false },
};

/** Guard-event engine label for a trend engine. */
const guardEngineFor = (engine: string): string => (engine === 'kalshi_perp' ? 'kalshi' : engine);

// ── Persistence (runtime_state; best-effort, fail-open) ──────────────────
async function loadSnapshots(): Promise<ImprovementSnapshot[]> {
  try {
    const v = await getRuntimeStateStrict(SNAPSHOT_SCOPE, STORE_KEY);
    return Array.isArray(v) ? (v as ImprovementSnapshot[]) : [];
  } catch { return []; }
}

async function loadThrottleEntries(): Promise<ThrottleEntry[]> {
  try {
    const v = await getRuntimeStateStrict(THROTTLE_SCOPE, STORE_KEY);
    if (v && typeof v === 'object' && Array.isArray((v as any).entries)) return (v as any).entries as ThrottleEntry[];
    return [];
  } catch { return []; }
}

function persistThrottles(entries: ThrottleEntry[]): void {
  _throttleCache = { at: Date.now(), entries };
  saveRuntimeState(THROTTLE_SCOPE, STORE_KEY, { entries });
}

// ── Throttle consult (hot path — cached, FAIL OPEN) ──────────────────────
let _throttleCache: { at: number; entries: ThrottleEntry[] } | null = null;
const THROTTLE_CACHE_MS = 60_000;

async function currentThrottles(): Promise<ThrottleEntry[]> {
  if (_throttleCache && Date.now() - _throttleCache.at < THROTTLE_CACHE_MS) return _throttleCache.entries;
  const entries = await loadThrottleEntries();
  _throttleCache = { at: Date.now(), entries };
  return entries;
}

/**
 * True when this strategy's NEW shadow entries are paused by the
 * improvement loop. Consulted on the four shadow entry paths next to
 * the lanes' own lesson gates. FAILS OPEN on every error — including an
 * unreadable store — and returns false when the kill switch is off.
 * An entry whose pause window has elapsed never blocks, even if the
 * evaluator has not run yet to record the resume.
 */
export async function improvementThrottleBlocks(userId: number, engine: string, strategy: string): Promise<boolean> {
  if (!improvementLoopOn()) return false;
  try {
    const entries = await currentThrottles();
    const hit = entries.find((e) => e.userId === userId && e.engine === engine && e.strategy === strategy);
    if (!hit) return false;
    return Date.now() < Date.parse(hit.pausedUntil);
  } catch { return false; }
}

// Throttled guard-event logging for entry-path blocks: at most one per
// (user, engine, strategy) per hour, so a paused strategy scanned every
// few minutes does not flood the safeguards panel (the ai-engine-budget
// block-log idiom).
const _blockLogAt = new Map<string, number>();
export function logImprovementBlock(userId: number, engine: string, strategy: string, symbol: string | null): void {
  const k = throttleKey(userId, engine, strategy);
  const now = Date.now();
  if (now - (_blockLogAt.get(k) || 0) < 3_600_000) return;
  _blockLogAt.set(k, now);
  logGuard(userId, 'improvement_throttle', symbol,
    `Improvement loop: new ${engine} shadow entries for "${strategy}" are paused — its last-14-days trend is degrading vs the prior 14 days. Open shadow positions are unaffected.`,
    { engine, strategy }, guardEngineFor(engine));
}

// ── Studio strategy key ──────────────────────────────────────────────────
// The ledger's Studio arm keys strategies by wizard strategy NAME
// (falling back to 'strategy <id>'), so the runner's consult must build
// the same string. Cached lookup; any failure falls back to the id form
// (which simply never matches a named throttle — fail open).
const _studioKeyCache = new Map<number, { at: number; key: string }>();
export async function getStudioImprovementKey(strategyId: number): Promise<string> {
  const hit = _studioKeyCache.get(strategyId);
  if (hit && Date.now() - hit.at < 15 * 60_000) return hit.key;
  let key = `strategy ${strategyId}`;
  try {
    const { rows } = await pool.query(`SELECT name FROM wizard_strategies WHERE id = $1`, [strategyId]);
    const name = rows[0]?.name;
    if (name) key = String(name);
  } catch { /* fallback form */ }
  _studioKeyCache.set(strategyId, { at: Date.now(), key });
  return key;
}

// ── Evaluator ────────────────────────────────────────────────────────────
async function readLedgerTrends(bounds: { priorStart: number; curStart: number; curEnd: number }, th: ClassifyThresholds): Promise<StrategyTrend[]> {
  const { ensureShadowLedger } = await import('./shadow-ledger');
  await ensureShadowLedger();
  const sources = Object.keys(LEDGER_SOURCES);
  const iso = (ms: number) => new Date(ms).toISOString();
  const { rows } = await pool.query(
    `SELECT user_id, source, strategy,
            CASE WHEN closed_at >= $3::timestamptz THEN 'cur' ELSE 'prior' END AS win,
            count(*)::int AS trades,
            count(*) FILTER (WHERE result = 'WIN')::int AS wins,
            count(r_multiple)::int AS r_trades, COALESCE(sum(r_multiple), 0)::float AS sum_r,
            count(return_pct)::int AS pct_trades, COALESCE(sum(return_pct), 0)::float AS sum_pct
       FROM shadow_ledger
      WHERE closed_at >= $1::timestamptz AND closed_at < $2::timestamptz
        AND source = ANY($4::text[])
      GROUP BY user_id, source, strategy, win`,
    [iso(bounds.priorStart), iso(bounds.curEnd), iso(bounds.curStart), sources]);
  // Accumulate per (user, engine, strategy, window) — crypto's long and
  // hypothetical-short sources merge into the one crypto lane here.
  const acc = new Map<string, { userId: number; engine: string; strategy: string; throttleLane: boolean; cur: RawAccum; prior: RawAccum }>();
  for (const r of rows) {
    const map = LEDGER_SOURCES[String(r.source)];
    if (!map) continue;
    const userId = Number(r.user_id);
    const strategy = String(r.strategy);
    const k = `${userId}|${map.engine}|${strategy}`;
    let slot = acc.get(k);
    if (!slot) {
      slot = { userId, engine: map.engine, strategy, throttleLane: map.throttleLane, cur: emptyAccum(), prior: emptyAccum() };
      acc.set(k, slot);
    }
    addToAccum(r.win === 'cur' ? slot.cur : slot.prior, {
      trades: r.trades, wins: r.wins, rTrades: r.r_trades, sumR: r.sum_r, pctTrades: r.pct_trades, sumPct: r.sum_pct,
    });
  }
  const trends: StrategyTrend[] = [];
  for (const slot of acc.values()) {
    const cur = accumToStat(slot.cur);
    const prior = accumToStat(slot.prior);
    const c = classifyTrend(cur, prior, th);
    trends.push({
      userId: slot.userId, engine: slot.engine, strategy: slot.strategy,
      throttleLane: slot.throttleLane, classification: c.classification, metric: c.metric, delta: c.delta, cur, prior,
    });
  }
  return trends;
}

/** Live FX brain outcomes — measurement only (engine 'fx_live'). Read
 *  fail-soft: a missing/renamed column must not sink the evaluation. */
async function readFxLiveTrends(bounds: { priorStart: number; curStart: number; curEnd: number }, th: ClassifyThresholds): Promise<StrategyTrend[]> {
  const iso = (ms: number) => new Date(ms).toISOString();
  const { rows } = await pool.query(
    `SELECT user_id, COALESCE(strategy_mode, 'unknown') AS strategy,
            CASE WHEN closed_at >= $3::timestamptz THEN 'cur' ELSE 'prior' END AS win,
            count(*)::int AS trades,
            count(*) FILTER (WHERE realised_rr > 0)::int AS wins,
            count(realised_rr)::int AS r_trades, COALESCE(sum(realised_rr), 0)::float AS sum_r
       FROM fx_brain_outcomes
      WHERE closed_at >= $1::timestamptz AND closed_at < $2::timestamptz AND realised_rr IS NOT NULL
      GROUP BY user_id, strategy, win`,
    [iso(bounds.priorStart), iso(bounds.curEnd), iso(bounds.curStart)]);
  const acc = new Map<string, { userId: number; strategy: string; cur: RawAccum; prior: RawAccum }>();
  for (const r of rows) {
    const userId = Number(r.user_id);
    const strategy = String(r.strategy);
    const k = `${userId}|${strategy}`;
    let slot = acc.get(k);
    if (!slot) { slot = { userId, strategy, cur: emptyAccum(), prior: emptyAccum() }; acc.set(k, slot); }
    addToAccum(r.win === 'cur' ? slot.cur : slot.prior, { trades: r.trades, wins: r.wins, rTrades: r.r_trades, sumR: r.sum_r });
  }
  const trends: StrategyTrend[] = [];
  for (const slot of acc.values()) {
    const cur = accumToStat(slot.cur);
    const prior = accumToStat(slot.prior);
    const c = classifyTrend(cur, prior, th);
    trends.push({
      userId: slot.userId, engine: 'fx_live', strategy: slot.strategy,
      throttleLane: false, classification: c.classification, metric: c.metric, delta: c.delta, cur, prior,
    });
  }
  return trends;
}

let _lastSnapshot: ImprovementSnapshot | null = null;
let _evaluating = false;

/**
 * One evaluation pass: read both windows, classify every strategy,
 * advance the throttle set, persist the snapshot. Returns the snapshot,
 * or null when the kill switch is off or the pass failed (fail-soft —
 * the next scheduled pass retries; nothing downstream depends on a
 * single pass landing).
 */
export async function runImprovementEvaluation(nowMs: number = Date.now()): Promise<ImprovementSnapshot | null> {
  if (!improvementLoopOn()) return null;
  if (_evaluating) return _lastSnapshot;
  _evaluating = true;
  try {
    const th = defaultClassifyThresholds();
    const bounds = windowBounds(nowMs, improvementWindowDays());
    const ledgerTrends = await readLedgerTrends(bounds, th);
    const fxTrends = await readFxLiveTrends(bounds, th).catch((e: any) => {
      console.error('[improvement-loop] fx_brain_outcomes read failed (non-fatal):', e?.message || e);
      return [] as StrategyTrend[];
    });
    const trends = [...ledgerTrends, ...fxTrends]
      .sort((a, b) => a.engine.localeCompare(b.engine) || a.strategy.localeCompare(b.strategy) || a.userId - b.userId);

    const existing = await loadThrottleEntries();
    const { entries, transitions } = nextThrottleState(existing, trends, nowMs, improvementPauseDays(), improvementWindowDays());
    persistThrottles(entries);
    for (const tr of transitions) {
      if (tr.type === 'pause') {
        logGuard(tr.entry.userId, 'improvement_throttle_pause', null,
          `Improvement loop paused new ${tr.entry.engine} shadow entries for "${tr.entry.strategy}" — ${tr.entry.reason}`,
          { engine: tr.entry.engine, strategy: tr.entry.strategy, pausedUntil: tr.entry.pausedUntil }, guardEngineFor(tr.entry.engine));
      } else {
        logGuard(tr.entry.userId, 'improvement_throttle_resume', null,
          `Improvement loop resumed ${tr.entry.engine} shadow entries for "${tr.entry.strategy}" — ${tr.type === 'resume_recovery' ? 'the latest 14-day trend is no longer degrading' : 'the pause window elapsed'}.`,
          { engine: tr.entry.engine, strategy: tr.entry.strategy, resumeType: tr.type }, guardEngineFor(tr.entry.engine));
      }
    }

    const snap = buildSnapshot(nowMs, bounds, trends, entries);
    const history = await loadSnapshots();
    saveRuntimeState(SNAPSHOT_SCOPE, STORE_KEY, appendSnapshot(history, snap, improvementSnapshotCap()));
    _lastSnapshot = snap;
    loopTick('improvement-loop', `evaluated ${trends.length} strategies, ${transitions.length} throttle transitions`);
    return snap;
  } catch (e: any) {
    console.error('[improvement-loop] evaluation failed (non-fatal):', e?.message || e);
    return null;
  } finally {
    _evaluating = false;
  }
}

// ── Health surface ───────────────────────────────────────────────────────
export interface ImprovementLoopHealth {
  enabled: boolean;
  lastEvaluationAt: string | null;
  engines: Record<string, { improving: number; degrading: number; flat: number; insufficient: number }>;
  throttled: Array<{ userId: number; engine: string; strategy: string; pausedUntil: string }>;
  throttleCount: number;
}

/** The /api/health summary: latest snapshot's per-engine classification
 *  counts + the currently-throttled strategies. Reads the persisted
 *  snapshot when this process has not evaluated yet (post-restart). */
export async function getImprovementLoopHealth(): Promise<ImprovementLoopHealth> {
  const enabled = improvementLoopOn();
  let snap = _lastSnapshot;
  if (!snap) {
    const history = await loadSnapshots().catch(() => [] as ImprovementSnapshot[]);
    snap = history.length ? history[history.length - 1] : null;
    if (snap) _lastSnapshot = snap;
  }
  const engines: ImprovementLoopHealth['engines'] = {};
  if (snap) {
    for (const s of snap.strategies) {
      const e = (engines[s.engine] ??= { improving: 0, degrading: 0, flat: 0, insufficient: 0 });
      e[s.classification]++;
    }
  }
  let throttled: ThrottleEntry[] = [];
  try { throttled = await currentThrottles(); } catch { throttled = []; }
  const active = throttled.filter((e) => Date.now() < Date.parse(e.pausedUntil));
  return {
    enabled,
    lastEvaluationAt: snap?.at ?? null,
    engines,
    throttled: active.map((e) => ({ userId: e.userId, engine: e.engine, strategy: e.strategy, pausedUntil: e.pausedUntil })),
    throttleCount: active.length,
  };
}

// ── Periodic starter (watchdog idiom: delayed start, unref'd) ────────────
let _started = false;
export function startImprovementLoop(): void {
  if (_started) return;
  _started = true;
  const firstDelay = Math.floor(num('IMPROVEMENT_LOOP_FIRST_DELAY_MS', 10 * 60_000, 5_000, 3_600_000));
  const t0 = setTimeout(() => { void runImprovementEvaluation(); }, firstDelay);
  t0.unref?.();
  const iv = setInterval(() => { void runImprovementEvaluation(); }, improvementIntervalMs());
  iv.unref?.();
  console.log('[improvement-loop] started — per-strategy 14d-vs-prior-14d trend evaluation every 6h; degrading shadow strategies pause new entries (kill switch IMPROVEMENT_LOOP=off).');
}
