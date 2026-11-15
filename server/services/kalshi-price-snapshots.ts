// ─────────────────────────────────────────────────────────────────────────────
// Kalshi price-snapshot recorder (2026-11-15) — shared by the Kalshi SHADOW
// lanes (weather ensemble, sports odds benchmark; usable by any future lane).
//
// Why this exists (recon 2026-11-15 §5A/§5C): an independent audit of 15,272
// settled Kalshi contracts found 92.8% had NO capturable price after the fact
// — you cannot grade a strategy later on prices you didn't record at the
// time. So every market a shadow lane evaluates gets timestamped snapshots:
//   • kind='decision'   — the cycle that opened a shadow trade on the market
//   • kind='interval'   — routine re-reads while the market is live
//   • kind='settlement' — the final read once Kalshi posts a result
// Prices are integer cents (Kalshi's native unit in this codebase).
//
// Retention (sane by construction): interval snapshots prune after 45 days,
// decision/settlement snapshots after 180 days. Pruning is DELETE-by-age on
// this table only, run at most once a day by a lane tick — never at boot in a
// hot path, and always fail-soft.
//
// SHADOW INFRASTRUCTURE ONLY: this module reads prices handed to it and
// writes them to its own table. It imports no order path and places nothing.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

export type KalshiSnapshotKind = 'decision' | 'interval' | 'settlement';

export interface KalshiPriceSnapshotInput {
  lane: string;               // e.g. 'kalshi_weather_shadow' | 'kalshi_sports_shadow'
  userId: number;
  marketTicker: string;
  eventTicker?: string | null;
  seriesTicker?: string | null;
  yesBidCents?: number | null;
  yesAskCents?: number | null;
  lastPriceCents?: number | null;
  volume?: number | null;
  kind: KalshiSnapshotKind;
}

let _ensured: Promise<void> | null = null;
export function ensureKalshiPriceSnapshotTable(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS kalshi_price_snapshots (
      id serial PRIMARY KEY, lane text NOT NULL, user_id int NOT NULL,
      market_ticker text NOT NULL, event_ticker text, series_ticker text,
      yes_bid_cents int, yes_ask_cents int, last_price_cents int,
      volume double precision, kind text NOT NULL DEFAULT 'interval',
      captured_at timestamptz NOT NULL DEFAULT now())`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_price_snapshots_market_time ON kalshi_price_snapshots (market_ticker, captured_at)`))
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_price_snapshots_time ON kalshi_price_snapshots (captured_at)`))
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_price_snapshots_lane_user ON kalshi_price_snapshots (lane, user_id)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

const centsOrNull = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : Math.round(v);

/** Record one snapshot. Fail-soft by design: a recorder outage must never
 *  break a lane cycle, so errors are swallowed (the lane's trades are the
 *  primary record; snapshots are the grading evidence). */
export async function recordKalshiPriceSnapshot(s: KalshiPriceSnapshotInput): Promise<boolean> {
  try {
    await ensureKalshiPriceSnapshotTable();
    await pool.query(
      `INSERT INTO kalshi_price_snapshots (lane, user_id, market_ticker, event_ticker, series_ticker, yes_bid_cents, yes_ask_cents, last_price_cents, volume, kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [s.lane, s.userId, s.marketTicker, s.eventTicker ?? null, s.seriesTicker ?? null,
       centsOrNull(s.yesBidCents), centsOrNull(s.yesAskCents), centsOrNull(s.lastPriceCents),
       s.volume == null || !Number.isFinite(s.volume) ? null : s.volume, s.kind]);
    return true;
  } catch { return false; }
}

/** Batch variant — one round trip for a whole event's brackets. Fail-soft. */
export async function recordKalshiPriceSnapshots(rows: KalshiPriceSnapshotInput[]): Promise<number> {
  if (!rows.length) return 0;
  try {
    await ensureKalshiPriceSnapshotTable();
    const values: any[] = [];
    const tuples: string[] = [];
    rows.forEach((s, i) => {
      const b = i * 10;
      tuples.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10})`);
      values.push(s.lane, s.userId, s.marketTicker, s.eventTicker ?? null, s.seriesTicker ?? null,
        centsOrNull(s.yesBidCents), centsOrNull(s.yesAskCents), centsOrNull(s.lastPriceCents),
        s.volume == null || !Number.isFinite(s.volume) ? null : s.volume, s.kind);
    });
    await pool.query(
      `INSERT INTO kalshi_price_snapshots (lane, user_id, market_ticker, event_ticker, series_ticker, yes_bid_cents, yes_ask_cents, last_price_cents, volume, kind)
       VALUES ${tuples.join(',')}`, values);
    return rows.length;
  } catch { return 0; }
}

export async function countKalshiPriceSnapshots(lane: string, userId: number): Promise<number> {
  try {
    await ensureKalshiPriceSnapshotTable();
    const { rows } = await pool.query(
      `SELECT count(*)::int AS n FROM kalshi_price_snapshots WHERE lane=$1 AND user_id=$2`, [lane, userId]);
    return Number(rows[0]?.n ?? 0);
  } catch { return 0; }
}

const INTERVAL_RETENTION_DAYS = 45;
const DECISION_RETENTION_DAYS = 180;
let _lastPruneMs = 0;
/** Age-based prune, at most once per 24h per process. Returns rows deleted, or -1 if skipped/failed. */
export async function pruneKalshiPriceSnapshots(nowMs = Date.now()): Promise<number> {
  if (nowMs - _lastPruneMs < 24 * 3600_000) return -1;
  _lastPruneMs = nowMs;
  try {
    await ensureKalshiPriceSnapshotTable();
    const a = await pool.query(
      `DELETE FROM kalshi_price_snapshots WHERE kind='interval' AND captured_at < now() - ($1::int * interval '1 day')`,
      [INTERVAL_RETENTION_DAYS]);
    const b = await pool.query(
      `DELETE FROM kalshi_price_snapshots WHERE kind IN ('decision','settlement') AND captured_at < now() - ($1::int * interval '1 day')`,
      [DECISION_RETENTION_DAYS]);
    return (a.rowCount ?? 0) + (b.rowCount ?? 0);
  } catch { return -1; }
}
