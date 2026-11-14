// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp BRAIN (2026-11-12, Chris's ask: "make the lane act on
// its lessons" + "add vp").
//
// The shadow lane (kalshi-stock-shadow.ts) has always RECORDED wisdom: every
// closed trade feeds bucket stats (strategy × ticker / side / session /
// spread / volatility / funding / HTF / hour block — plus, from this build,
// the volume-profile position) with 'favor' / 'avoid' / 'learning' verdicts,
// and every new trade is stamped with that advice. Until now nothing ACTED
// on a verdict. This module is the actor:
//
//  • GATE — before a shadow trade opens, the candidate's buckets are matched
//    against the current stats (the exact matching rule adviceFor() uses).
//    ANY matching 'avoid' bucket HARD-BLOCKS the entry. 'favor' matches are
//    tags only — shadow sizing is a fixed notional, so there is nothing to
//    boost, and inventing one would fake evidence.
//  • LOG — every block lands in kalshi_perp_brain_blocks (one row per
//    blocking bucket, plus the volume-profile veto rows and, from build
//    #3, the earnings-blackout rows with reason 'earnings' and the
//    report date in bucket_value) so the panel — and Chris — can audit
//    exactly what the brain stopped, and why.
//  • REHABILITATION IS AUTOMATIC — stats roll over the lane's own 60-day
//    window and are re-aggregated every cycle. When a bucket's recent
//    record improves enough that its verdict leaves 'avoid', the gate
//    simply stops matching it and entries flow again. Nothing is banned
//    forever, and no human has to un-ban anything.
//
// SOURCE ISOLATION (pinned by scripts/check-kalshi-perp-brain.ts): this
// brain learns ONLY from the perp lane's own record — the bucket stats are
// computed by the lane from kalshi_perp_shadow_trades/_context and passed
// in. The main Kalshi brain is a different animal (event-market coins; its
// ticker mapping falls back to 'BTC' for stock tickers) and is never read,
// imported, or consulted here. This module reads/writes exactly one table
// of its own: kalshi_perp_brain_blocks.
//
// Kill switches: KALSHI_PERP_BRAIN=off → no gating (advice stamping in the
// lane continues exactly as before). KALSHI_PERP_VP=off → no volume-profile
// veto and no 'vp' bucket dimension (the lane stops computing the profile).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

export const perpBrainEnabled = () => process.env.KALSHI_PERP_BRAIN !== 'off';
export const perpVpEnabled = () => process.env.KALSHI_PERP_VP !== 'off';

// ── bucket-stat matching (pure) ─────────────────────────────────────────────
/** Structural mirror of the lane's KalshiBucketStat — declared locally so
 *  this module never imports the lane (the lane imports THIS module). */
export interface PerpBucketStatLike {
  strategy: string;
  dim: string;
  bucket: string;
  n: number;
  medianNet: number;
  winRate: number;
  verdict: 'favor' | 'avoid' | 'learning';
}

export interface PerpBrainGateResult {
  blocked: boolean;
  /** Matching buckets whose verdict is 'avoid' — each one blocks on its own. */
  avoid: PerpBucketStatLike[];
  /** Matching buckets whose verdict is 'favor' — recorded as tags only. */
  favor: PerpBucketStatLike[];
}

/**
 * Match a candidate's buckets against the lane's bucket stats. This is the
 * SAME rule the lane's adviceFor() has always used to stamp advice: same
 * strategy, verdict past 'learning', and the candidate's bucket value for
 * that dimension equal to the stat's bucket. Thresholds are NOT re-decided
 * here — they live in the lane's aggregateKalshiStats (n ≥ 15, median net
 * > +0.5% → favor, < −1% → avoid) and this gate simply obeys them.
 */
export function evaluatePerpBrainGate(
  stats: PerpBucketStatLike[],
  strategy: string,
  buckets: Record<string, string>,
): PerpBrainGateResult {
  const hits = (stats || []).filter(
    (s) => s.strategy === strategy && s.verdict !== 'learning' && buckets[s.dim] === s.bucket,
  );
  const avoid = hits.filter((s) => s.verdict === 'avoid');
  const favor = hits.filter((s) => s.verdict === 'favor');
  return { blocked: avoid.length > 0, avoid, favor };
}

// ── volume-profile position + value-edge veto (pure) ────────────────────────
export interface VpProfileLike { poc: number; vah: number; val: number }

export type VpPosition = 'above_value' | 'inside_value' | 'below_value';

/** Where a price sits relative to the value area. At an edge exactly =
 *  still inside (it has not broken out until it is past the edge). */
export function classifyVpPosition(price: number, vah: number, val: number): VpPosition {
  if (price > vah) return 'above_value';
  if (price < val) return 'below_value';
  return 'inside_value';
}

/**
 * The value-edge tolerance, in multiples of the lane's H1 ATR: a candidate
 * INSIDE the value area counts as "pressing into" the far edge when it is
 * within 0.25×ATR of it. A quarter of the typical hourly range is close
 * enough that the next ordinary wiggle reaches the edge — the entry is
 * effectively buying the top (or selling the bottom) of the accepted value
 * range with the whole range as its first obstacle. Breakouts already
 * outside value are untouched, and a retest of the edge from outside is a
 * different, welcome setup — neither is vetoed.
 */
export const VP_EDGE_TOL_ATR_MULT = 0.25;

/**
 * The ONE conservative VP veto: skip a LONG whose entry is inside the value
 * area and pressing into VAH, and a SHORT inside value pressing into VAL.
 * Anything else — mid-value entries, breakouts beyond the edge, retests
 * from outside — is not this veto's business.
 */
export function vpValueEdgeBlock(
  direction: 'long' | 'short' | string,
  entry: number,
  profile: VpProfileLike,
  atr: number,
): boolean {
  if (!(entry > 0) || !(atr > 0) || !(profile.vah > profile.val)) return false;
  if (classifyVpPosition(entry, profile.vah, profile.val) !== 'inside_value') return false;
  const tol = VP_EDGE_TOL_ATR_MULT * atr;
  return direction === 'short'
    ? entry - profile.val <= tol
    : profile.vah - entry <= tol;
}

// ── block log (the brain's audit trail) ─────────────────────────────────────
let _ensured: Promise<void> | null = null;
export function ensurePerpBrainTables(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS kalshi_perp_brain_blocks (
      id serial PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL, ticker text NOT NULL, underlying text,
      direction text, reason text NOT NULL, bucket_dim text, bucket_value text,
      median_net_pct double precision, bucket_n int,
      created_at timestamptz NOT NULL DEFAULT now())`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_perp_brain_blocks_user_created ON kalshi_perp_brain_blocks (user_id, created_at)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

export interface PerpBrainBlockRow {
  strategy: string;
  ticker: string;
  underlying?: string | null;
  direction?: string | null;
  reason: 'brain_avoid' | 'vp_edge' | 'earnings';
  bucketDim?: string | null;
  bucketValue?: string | null;
  medianNetPct?: number | null;
  bucketN?: number | null;
}

/**
 * Durably record blocks. Never throws: a logging failure must not break the
 * lane (the skip itself has already been decided by the caller), but it is
 * surfaced in the server log rather than swallowed silently.
 */
export async function logPerpBrainBlocks(userId: number, rows: PerpBrainBlockRow[]): Promise<void> {
  if (!rows.length) return;
  try {
    await ensurePerpBrainTables();
    for (const r of rows) {
      await pool.query(
        `INSERT INTO kalshi_perp_brain_blocks (user_id, strategy, ticker, underlying, direction, reason, bucket_dim, bucket_value, median_net_pct, bucket_n)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [userId, r.strategy, r.ticker, r.underlying ?? null, r.direction ?? null, r.reason,
         r.bucketDim ?? null, r.bucketValue ?? null, r.medianNetPct ?? null, r.bucketN ?? null]);
    }
  } catch (e: any) {
    console.error('[kalshi-perp-brain] block log write failed (non-fatal):', e?.message ?? e);
  }
}

// ── panel summary (read-only) ───────────────────────────────────────────────
export interface PerpBrainTopBlock {
  strategy: string;
  underlying: string | null;
  ticker: string;
  direction: string | null;
  dim: string;
  bucket: string;
  blocks: number;
  medianNetPct: number | null;
  bucketN: number | null;
}

export interface PerpBrainBlockSummary {
  brainBlocks: number;
  vpSkips: number;
  earningsSkips: number;
  topBlocks: PerpBrainTopBlock[];
}

/** Block counts + the most frequent blocking buckets in the window, for the
 *  panel. Read-only; fail-soft by the caller. */
export async function getPerpBrainBlockSummary(userId: number, days: number): Promise<PerpBrainBlockSummary> {
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(365, Math.floor(days))) : 30;
  await ensurePerpBrainTables();
  const [countsRes, topRes] = await Promise.all([
    pool.query(
      `SELECT reason, count(*)::int AS n FROM kalshi_perp_brain_blocks
        WHERE user_id=$1 AND created_at >= now() - ($2::int * interval '1 day')
        GROUP BY reason`,
      [userId, windowDays]),
    pool.query(
      `SELECT strategy,
          (array_agg(underlying ORDER BY created_at DESC))[1] AS underlying,
          (array_agg(ticker ORDER BY created_at DESC))[1] AS ticker,
          (array_agg(direction ORDER BY created_at DESC))[1] AS direction,
          bucket_dim, bucket_value, count(*)::int AS blocks,
          (array_agg(median_net_pct ORDER BY created_at DESC))[1] AS median_net_pct,
          (array_agg(bucket_n ORDER BY created_at DESC))[1] AS bucket_n
       FROM kalshi_perp_brain_blocks
       WHERE user_id=$1 AND reason='brain_avoid' AND bucket_dim IS NOT NULL
         AND created_at >= now() - ($2::int * interval '1 day')
       GROUP BY strategy, bucket_dim, bucket_value
       ORDER BY blocks DESC, strategy ASC
       LIMIT 5`,
      [userId, windowDays]),
  ]);
  const counts = new Map<string, number>((countsRes.rows || []).map((r: any) => [String(r.reason), Number(r.n) || 0]));
  return {
    brainBlocks: counts.get('brain_avoid') || 0,
    vpSkips: counts.get('vp_edge') || 0,
    earningsSkips: counts.get('earnings') || 0,
    topBlocks: (topRes.rows || []).map((r: any): PerpBrainTopBlock => ({
      strategy: String(r.strategy),
      underlying: r.underlying == null ? null : String(r.underlying),
      ticker: String(r.ticker),
      direction: r.direction == null ? null : String(r.direction),
      dim: String(r.bucket_dim),
      bucket: String(r.bucket_value),
      blocks: Number(r.blocks) || 0,
      medianNetPct: r.median_net_pct == null ? null : Number(r.median_net_pct),
      bucketN: r.bucket_n == null ? null : Number(r.bucket_n),
    })),
  };
}
