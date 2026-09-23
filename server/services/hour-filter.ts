// ─────────────────────────────────────────────────────────────────────────────
// Hour-of-day performance filter.
//
// WHY: entry hour is the strongest predictor in this account's history, and the
// engine was ignoring it. Measured 2026-09-23 across 2,200+ TradeLocker trades:
//
//   03:00  87% WR      01:00  38% WR over 1,058 trades
//   09:00  75% WR      18:00  39% WR over   105
//   14:00  75% WR      20:00  26% WR over    39
//   15:00  74% WR      21:00  33% WR over    18
//
// Applied to the week of 2026-09-21 — using only hours already below the
// threshold BEFORE that week, so no hindsight — this blocks two signals that
// cost -$2,093 (GBPJPY SELL 01:43 and GBPUSD BUY 01:06, both in the 01:00 hour)
// and turns a -$2,776 week into -$683.
//
// The brain's Gate 2e already has an hour rule, but it is PER SYMBOL and needs
// 3+ trades on that pair in that hour — far too sparse to fire on a 6-pair
// watchlist. This is the same idea computed across the whole book, where the
// sample is large enough to mean something.
//
// FAILS OPEN. This is a performance filter, not a safety gate: if the stats
// cannot be read we let the trade through and say so, rather than halting
// trading because a query failed.
// ─────────────────────────────────────────────────────────────────────────────

export interface HourStat { hour: number; trades: number; winRate: number }

const MIN_SAMPLE = Number(process.env.HOUR_FILTER_MIN_TRADES ?? 15);
const WR_FLOOR = Number(process.env.HOUR_FILTER_MIN_WINRATE ?? 45);
const TTL_MS = Number(process.env.HOUR_FILTER_TTL_MS ?? 60 * 60 * 1000); // recompute hourly
// Roll the window so the filter tracks how the account trades NOW, not in April.
const LOOKBACK_DAYS = Number(process.env.HOUR_FILTER_LOOKBACK_DAYS ?? 120);

const cache = new Map<number, { at: number; stats: HourStat[]; blocked: Set<number> }>();

async function compute(userId: number): Promise<{ stats: HourStat[]; blocked: Set<number> }> {
  const { pool } = await import('../db');
  const { rows } = await pool.query(
    `SELECT EXTRACT(hour FROM created_at)::int AS hour,
            COUNT(*)::int AS trades,
            ROUND(100.0 * SUM(CASE WHEN result='WIN' THEN 1 ELSE 0 END) / COUNT(*), 1) AS win_rate
       FROM ai_trade_results
      WHERE user_id = $1
        AND result IN ('WIN','LOSS')
        AND source IN ('tradelocker','tradelocker_auto')
        AND symbol NOT LIKE 'KALSHI%'
        AND created_at > now() - ($2 || ' days')::interval
      GROUP BY 1`,
    [userId, String(LOOKBACK_DAYS)]
  );
  const stats: HourStat[] = rows.map((r: any) => ({ hour: Number(r.hour), trades: Number(r.trades), winRate: Number(r.win_rate) }));
  const blocked = new Set<number>(
    stats.filter((s) => s.trades >= MIN_SAMPLE && s.winRate < WR_FLOOR).map((s) => s.hour)
  );
  return { stats, blocked };
}

/**
 * Should a trade entered in this UTC hour be blocked?
 * Returns null to ALLOW — including when the stats cannot be computed, or the
 * sample is too small to justify refusing a trade.
 */
export async function hourFilterVerdict(userId: number, hourUtc: number): Promise<{ blocked: true; reason: string } | null> {
  if (process.env.HOUR_FILTER_ENABLED === 'false') return null;
  try {
    let entry = cache.get(userId);
    if (!entry || Date.now() - entry.at > TTL_MS) {
      const fresh = await compute(userId);
      entry = { at: Date.now(), ...fresh };
      cache.set(userId, entry);
      const list = Array.from(fresh.blocked).sort((a, b) => a - b).map((h) => `${h}:00`).join(', ');
      console.log(`[HourFilter] user ${userId}: recomputed over ${LOOKBACK_DAYS}d — blocking ${fresh.blocked.size} hour(s)${list ? ': ' + list : ''} (floor ${WR_FLOOR}% on ${MIN_SAMPLE}+ trades)`);
    }
    if (!entry.blocked.has(hourUtc)) return null;
    const s = entry.stats.find((x) => x.hour === hourUtc);
    return { blocked: true, reason: `Hour filter: ${hourUtc}:00 UTC is ${s?.winRate}% WR over ${s?.trades} trades — below the ${WR_FLOOR}% floor` };
  } catch (e: any) {
    // Never halt trading because a statistics query failed.
    console.error(`[HourFilter] could not evaluate (${e?.message}) — allowing the trade.`);
    return null;
  }
}

/** For the UI / diagnostics: the full table plus which hours are blocked. */
export async function hourFilterTable(userId: number): Promise<{ stats: HourStat[]; blocked: number[] }> {
  const { stats, blocked } = await compute(userId);
  return { stats: stats.sort((a, b) => a.hour - b.hour), blocked: Array.from(blocked).sort((a, b) => a - b) };
}
