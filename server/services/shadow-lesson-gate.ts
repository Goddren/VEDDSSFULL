// ─────────────────────────────────────────────────────────────────────────────
// Shadow lesson GATE — "all shadow lanes act on their own lessons"
// (2026-11-12, Chris's directive).
//
// Until now every shadow lane RECORDED its lessons and acted on none of
// them: the Sol bucket stats, the crypto bucket stats and the shared
// shadow-lessons job were advisory text, and the FX models' mastery only
// gated LIVE hand-off — a proven-dead slice kept taking shadow trades
// forever. This module is the shared plumbing for the gates that close
// that loop, lane by lane:
//
//   • one audit table, shadow_lesson_blocks — every gate writes a row
//     BEFORE it skips an entry, so a block is always explainable after
//     the fact (which lane, which strategy/bucket, the stats snapshot
//     that condemned it);
//   • pure verdict helpers — each lane keeps its OWN established bar:
//       - Sol:      the platform lesson bar (shadow-lessons.ts step 4:
//                   50+ trades, avg R ≤ −0.2, win rate ≤ 40%, no winning
//                   week) over the shared ledger's sol_shadow arm;
//       - Crypto:   the lane's own BucketStat 'avoid' verdict
//                   (n ≥ 15, median net < −1% over rolling 60 days);
//       - Studio:   the shadow-proof bar inverted (≥30 R-bearing
//                   closes, avg R ≤ −0.2, win rate ≤ 40%) per deployment;
//       - FX models: the lesson bar's core (50+ resolved, avg R ≤ −0.2,
//                   win rate ≤ 40%) per slice, rolling 60 days.
//   • rehabilitation is structural, never manual: every gate reads a
//     ROLLING window, so when old losses age out and the verdict clears,
//     entries resume on their own.
//
// Kill switches (per lane, default ON): SOL_SHADOW_LESSONS=off,
// CRYPTO_SHADOW_LESSONS=off, STUDIO_SHADOW_LESSONS=off,
// FX_MODELS_LESSON_GATE=off. With a switch off the lane behaves exactly
// as it did before this module existed.
//
// Deliberately NOT gated: fx-decision-shadow (an AI-vs-rules MEASUREMENT
// lane — gating it would bias the comparison it exists to make) and
// brain-shadow sessions (they already act: they feed the live FX brain,
// whose own gates act on live trades). Kalshi perps have their own
// perp-brain gate (separate PR).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

// ── Kill switches ────────────────────────────────────────────────────────
export const solShadowLessonsOn = (): boolean => process.env.SOL_SHADOW_LESSONS !== 'off';
export const cryptoShadowLessonsOn = (): boolean => process.env.CRYPTO_SHADOW_LESSONS !== 'off';
export const studioShadowLessonsOn = (): boolean => process.env.STUDIO_SHADOW_LESSONS !== 'off';
export const fxModelsLessonGateOn = (): boolean => process.env.FX_MODELS_LESSON_GATE !== 'off';

// ── Audit table ──────────────────────────────────────────────────────────
let _ensured: Promise<void> | null = null;
export function ensureShadowLessonBlocksTable(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS shadow_lesson_blocks (
      id serial PRIMARY KEY,
      lane text NOT NULL,
      user_id int NOT NULL,
      strategy_key text NOT NULL,
      bucket text NOT NULL,
      n int,
      win_rate double precision,
      avg_r double precision,
      median_pct double precision,
      reason text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now())`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS shadow_lesson_blocks_lane_user_at ON shadow_lesson_blocks (lane, user_id, created_at DESC)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

export interface ShadowLessonBlock {
  /** 'trail_guard' rows are not entry blocks — they are the trail guards'
   *  self-evaluation retirements (trail-guard-learning.ts), written to the
   *  same audit table so every lesson-driven action has one trail.
   *  'gate_calibration' rows are likewise not blocks: they are the user's
   *  apply/revert taps on per-slice gate recommendations
   *  (gate-calibration.ts), audited here for the same reason. */
  lane: 'sol_shadow' | 'crypto_shadow' | 'studio_shadow' | 'fx_models' | 'trail_guard' | 'gate_calibration';
  userId: number;
  strategyKey: string;
  /** Human-readable bucket: "all", "liquidity <25k", "M1 · range · EURUSD · London", "deployment 42". */
  bucket: string;
  n?: number | null;
  winRate?: number | null;
  avgR?: number | null;
  medianPct?: number | null;
  reason: string;
}

/**
 * Write one audit row for a block. Throttled: an identical
 * (lane, user, strategy, bucket) block within the last
 * SHADOW_LESSON_BLOCK_LOG_THROTTLE_MIN minutes (default 60) is not
 * written again — scans re-evaluate the same condemned strategy every
 * few seconds, and the audit trail needs the fact, not the flood.
 * Never throws: a lane must never fail because its audit write did.
 */
export async function logShadowLessonBlock(b: ShadowLessonBlock): Promise<void> {
  try {
    await ensureShadowLessonBlocksTable();
    const throttleMin = Math.max(0, Number(process.env.SHADOW_LESSON_BLOCK_LOG_THROTTLE_MIN ?? 60) || 0);
    await pool.query(
      `INSERT INTO shadow_lesson_blocks (lane, user_id, strategy_key, bucket, n, win_rate, avg_r, median_pct, reason)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9
        WHERE NOT EXISTS (
          SELECT 1 FROM shadow_lesson_blocks
           WHERE lane=$1 AND user_id=$2 AND strategy_key=$3 AND bucket=$4
             AND created_at > now() - ($10 || ' minutes')::interval)`,
      [b.lane, b.userId, b.strategyKey, b.bucket, b.n ?? null, b.winRate ?? null, b.avgR ?? null, b.medianPct ?? null, String(b.reason).slice(0, 500), String(throttleMin)],
    );
  } catch (e: any) {
    console.error('[shadow-lesson-gate] block log failed (non-fatal):', e?.message || e);
  }
}

// ── Pure verdict helpers ─────────────────────────────────────────────────
export interface RBarStat {
  trades: number;
  wins: number;
  avgR: number;
  /** Total R per week inside the window (oldest → newest). When given,
   *  the bar additionally requires NO winning week. */
  weeklyR?: number[];
}

/**
 * The platform's established lesson bar for a PROVEN LOSER (the mirror of
 * the FX lesson-promotion / go-live bar in shadow-lessons.ts step 4):
 * 50+ trades, average R at or below −0.2, win rate at or below 40%, and —
 * when weekly totals are supplied — no winning week in the window.
 * Pure; the check script walks every threshold.
 */
export function promotionBarLoser(s: RBarStat): boolean {
  if (!s || !(s.trades >= 50)) return false;
  if (!(s.avgR <= -0.2)) return false;
  const wr = s.trades > 0 ? s.wins / s.trades : 0;
  if (!(wr <= 0.40)) return false;
  if (s.weeklyR && s.weeklyR.length && !s.weeklyR.every((r) => r <= 0)) return false;
  return true;
}

export interface BucketVerdictStat {
  strategy: string; dim: string; bucket: string;
  n: number; medianNet: number; winRate: number;
  verdict: 'favor' | 'avoid' | 'learning';
}

/**
 * The Kalshi/crypto bucket-gate shape: a candidate is condemned when the
 * strategy's OVERALL bucket (dim 'all', when includeAll) carries an
 * 'avoid' verdict, or when any of the candidate's own context buckets
 * does. Returns the condemning stat (overall first — it is the broader
 * condemnation), or null. The lane's own stats machinery owns the
 * thresholds (n and median cut-offs); this helper only matches.
 */
export function matchingAvoidBucket(
  stats: BucketVerdictStat[],
  strategy: string,
  buckets: Record<string, string>,
  opts: { includeAll?: boolean } = {},
): BucketVerdictStat | null {
  if (opts.includeAll !== false) {
    const all = stats.find((s) => s.strategy === strategy && s.dim === 'all' && s.verdict === 'avoid');
    if (all) return all;
  }
  return stats.find((s) => s.strategy === strategy && s.verdict === 'avoid' && buckets[s.dim] === s.bucket) ?? null;
}

/**
 * Studio shadow, per deployment — the shadow-proof bar
 * (strategyShadowProofEligible: ≥30 R-bearing trades, avg ≥ +0.2R,
 * win rate ≥ 40%) INVERTED to "clearly losing": at least 30 R-bearing
 * closes AND avg R ≤ −0.2 AND win rate ≤ 40%. Merely unproven
 * (avg between −0.2 and +0.2) never pauses a deployment.
 */
export function studioDeploymentProvenLosing(s: { rTrades: number; wins: number; avgR: number | null }): boolean {
  if (!s || !(s.rTrades >= 30)) return false;
  if (s.avgR == null || !(s.avgR <= -0.2)) return false;
  const wr = s.rTrades > 0 ? s.wins / s.rTrades : 0;
  return wr <= 0.40;
}

// ── Sol: per-strategy verdicts from the shared shadow ledger ────────────
export interface SolLessonVerdict extends RBarStat { strategy: string; blocked: boolean }

const _solCache = new Map<number, { at: number; verdicts: Map<string, SolLessonVerdict> }>();

/**
 * Per-strategy lesson verdicts for the Sol shadow lane, read from the
 * shared ledger's sol_shadow arm over a rolling window
 * (SOL_SHADOW_LESSON_WINDOW_DAYS, default 60). The unit is the STRATEGY
 * — the ledger's Sol rows are all LONG, so strategy × direction is the
 * same cut, and per-token gating is forbidden by design (a pump.fun
 * token trades once and vanishes; only the pooled strategy record is
 * evidence). Cached ~15 min per user, like the lane's other stats.
 */
export async function getSolShadowLessonVerdicts(userId: number, force = false): Promise<Map<string, SolLessonVerdict>> {
  const hit = _solCache.get(userId);
  if (!force && hit && Date.now() - hit.at < 15 * 60_000) return hit.verdicts;
  const verdicts = new Map<string, SolLessonVerdict>();
  const days = Math.max(7, Math.floor(Number(process.env.SOL_SHADOW_LESSON_WINDOW_DAYS ?? 60) || 60));
  const { ensureShadowLedger } = await import('./shadow-ledger');
  await ensureShadowLedger();
  const { rows } = await pool.query(
    `SELECT strategy, count(*)::int AS trades, count(*) FILTER (WHERE result='WIN')::int AS wins,
            COALESCE(avg(r_multiple),0)::float AS avg_r
       FROM shadow_ledger
      WHERE user_id=$1 AND source='sol_shadow' AND r_multiple IS NOT NULL
        AND closed_at >= now() - ($2 || ' days')::interval
      GROUP BY strategy`, [userId, String(days)]);
  const { rows: weekly } = await pool.query(
    `SELECT strategy, date_trunc('week', closed_at) AS wk, COALESCE(sum(r_multiple),0)::float AS r
       FROM shadow_ledger
      WHERE user_id=$1 AND source='sol_shadow' AND r_multiple IS NOT NULL
        AND closed_at >= now() - ($2 || ' days')::interval
      GROUP BY strategy, wk ORDER BY wk`, [userId, String(days)]);
  const weeksByStrategy = new Map<string, number[]>();
  for (const w of weekly) {
    const a = weeksByStrategy.get(w.strategy) ?? [];
    a.push(Number(w.r) || 0);
    weeksByStrategy.set(w.strategy, a);
  }
  for (const r of rows) {
    const stat: RBarStat = {
      trades: Number(r.trades) || 0,
      wins: Number(r.wins) || 0,
      avgR: Number(r.avg_r) || 0,
      weeklyR: weeksByStrategy.get(r.strategy) ?? [],
    };
    verdicts.set(r.strategy, { strategy: r.strategy, ...stat, blocked: promotionBarLoser(stat) });
  }
  _solCache.set(userId, { at: Date.now(), verdicts });
  return verdicts;
}
