// ─────────────────────────────────────────────────────────────────────────────
// Per-pair DAILY stop.
//
// WHY: the only loss brake that existed was Gate 2e Rule 5 — three losing
// signals bought a THREE HOUR cooldown, after which the same pair was free to
// do it again. On a 24h FX book that is two or three more attempts in the same
// session on an instrument that has already proven it is wrong today. This
// stops the pair until the next UTC day and nothing re-opens it before then.
//
// Scoped to ONE pair. Other instruments keep trading — this is not a kill
// switch for the engine, it is a kill switch for the thing that is bleeding.
//
// DERIVED FROM CLOSED TRADES, NOT MEMORY. The consecutive-loss counter that was
// supposed to do this job lived in a Map that runBrainLearning reset every 60
// seconds, so it never once fired (see 38e4ea66). Anything that must survive a
// rebuild, a deploy or a restart reads the database.
//
// FILLS ARE GROUPED INTO SIGNALS. One signal opens on every active connection,
// so a single bad setup closes four times within seconds. Counting fills would
// stop a pair on its FIRST losing signal.
// ─────────────────────────────────────────────────────────────────────────────

export interface PairDayStat {
  symbol: string;
  losingSignals: number;
  winningSignals: number;
  netPnl: number;
  lastLossAt: string | null;
  stopped: boolean;
  reason: string | null;
}

// Losing SIGNALS (not fills) that stop the pair for the rest of the UTC day.
const MAX_LOSING_SIGNALS = Number(process.env.PAIR_DAILY_MAX_LOSING_SIGNALS ?? 3);
// Optional money-based stop, in account currency. 0 disables it.
const MAX_DAILY_LOSS = Number(process.env.PAIR_DAILY_MAX_LOSS_USD ?? 0);
// Fan-out window: same direction + same result closing this close together is
// one signal across N accounts, not N signals.
const GROUP_MS = Number(process.env.PAIR_DAILY_GROUP_MS ?? 120_000);
const TTL_MS = Number(process.env.PAIR_DAILY_TTL_MS ?? 60_000);

type CacheEntry = { at: number; day: string; stats: Map<string, PairDayStat> };
const cache = new Map<number, CacheEntry>();

const norm = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const utcDay = () => new Date().toISOString().slice(0, 10);

async function compute(userId: number): Promise<Map<string, PairDayStat>> {
  const { pool } = await import('../db');
  // Rows closed since 00:00 UTC today.
  //
  // mt5_ea / mt5_copier are excluded deliberately. They mirror the SAME signals
  // onto the $3.62 MT5 terminal account (permanently suppressed by gate 0e) and
  // their closes are batched hours later, so they do not fall inside the fan-out
  // grouping window and would be counted a second time — stopping a pair on one
  // bad setup instead of three.
  const { rows } = await pool.query(
    `SELECT symbol, direction, result, COALESCE(profit_loss, 0) AS pnl, closed_at
       FROM ai_trade_results
      WHERE user_id = $1
        AND result IN ('WIN','LOSS')
        AND closed_at IS NOT NULL
        AND closed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
        AND source NOT IN ('mt5_ea','mt5_copier','kalshi','polymarket')
      ORDER BY closed_at DESC`,
    [userId]
  );

  const bySymbol = new Map<string, any[]>();
  for (const r of rows) {
    const k = norm(r.symbol);
    if (!k) continue;
    if (!bySymbol.has(k)) bySymbol.set(k, []);
    bySymbol.get(k)!.push(r);
  }

  const out = new Map<string, PairDayStat>();
  for (const [sym, list] of Array.from(bySymbol.entries())) {
    const netPnl = list.reduce((s, r) => s + Number(r.pnl || 0), 0);
    // Collapse fan-out fills (list is already newest-first).
    const signals: { result: string; ts: number; dir: string }[] = [];
    for (const r of list) {
      const ts = new Date(r.closed_at).getTime();
      const dir = String(r.direction ?? '');
      const prev = signals[signals.length - 1];
      if (prev && prev.result === r.result && prev.dir === dir && (prev.ts - ts) <= GROUP_MS) continue;
      signals.push({ result: r.result, ts, dir });
    }
    const losing = signals.filter((s) => s.result === 'LOSS');
    const stat: PairDayStat = {
      symbol: sym,
      losingSignals: losing.length,
      winningSignals: signals.length - losing.length,
      netPnl: Math.round(netPnl * 100) / 100,
      lastLossAt: losing.length ? new Date(losing[0].ts).toISOString() : null,
      stopped: false,
      reason: null,
    };
    if (MAX_LOSING_SIGNALS > 0 && stat.losingSignals >= MAX_LOSING_SIGNALS) {
      stat.stopped = true;
      stat.reason = `Pair daily stop: ${sym} has ${stat.losingSignals} losing setups today (limit ${MAX_LOSING_SIGNALS}), net ${stat.netPnl} — stopped until 00:00 UTC`;
    } else if (MAX_DAILY_LOSS > 0 && netPnl <= -Math.abs(MAX_DAILY_LOSS)) {
      stat.stopped = true;
      stat.reason = `Pair daily stop: ${sym} is down ${stat.netPnl} today (limit -${Math.abs(MAX_DAILY_LOSS)}) — stopped until 00:00 UTC`;
    }
    out.set(sym, stat);
  }
  return out;
}

/**
 * Is this pair stopped for the rest of the UTC day?
 * Returns null to ALLOW.
 *
 * On a query failure this serves the LAST KNOWN result rather than failing
 * fully open: a pair we already established should be stopped stays stopped
 * through a transient DB error. It only allows when nothing has ever been
 * computed, so a cold start cannot deadlock the engine.
 */
export async function pairDailyStopVerdict(
  userId: number,
  symbol: string
): Promise<{ blocked: true; reason: string } | null> {
  if (process.env.PAIR_DAILY_STOP_ENABLED === 'false') return null;
  const sym = norm(symbol);
  if (!sym) return null;
  const today = utcDay();
  let entry = cache.get(userId);
  try {
    if (!entry || entry.day !== today || Date.now() - entry.at > TTL_MS) {
      const stats = await compute(userId);
      entry = { at: Date.now(), day: today, stats };
      cache.set(userId, entry);
      const stopped = Array.from(stats.values()).filter((s) => s.stopped);
      if (stopped.length) {
        console.log(`[PairDailyStop] user ${userId}: ${stopped.length} pair(s) stopped for ${today} — ` +
          stopped.map((s) => `${s.symbol} (${s.losingSignals}L, ${s.netPnl})`).join(', '));
      }
    }
  } catch (e: any) {
    if (!entry) {
      console.error(`[PairDailyStop] could not evaluate and have no prior result (${e?.message}) — allowing ${sym}.`);
      return null;
    }
    console.error(`[PairDailyStop] refresh failed (${e?.message}) — reusing the last known result from ${new Date(entry.at).toISOString()}.`);
  }
  const stat = entry.stats.get(sym);
  if (!stat?.stopped) return null;
  return { blocked: true, reason: stat.reason! };
}

/**
 * Drop the cached picture for this user so the next check re-reads the database.
 *
 * Called the moment a position closes. Without it the 60s cache can hand back a
 * count taken BEFORE the loss that crosses the threshold: on 2026-09-23 the
 * third losing USDJPY setup closed at 13:07:37 and the next entry opened at
 * 13:08 — 23 seconds later, inside the cache window. The stop has to see a close
 * immediately or it arrives one trade too late, which is exactly the trade it
 * exists to prevent (that one lost $3,161).
 */
export function invalidatePairDailyStop(userId: number): void {
  cache.delete(userId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Historical day-stop picture, for the brain's "does this pair get day-stopped
// on a particular weekday, repeatedly?" correlation.
//
// DELIBERATELY DERIVED, NOT LOGGED. The obvious design is a new
// pair_daily_stop_log table, written the moment pairDailyStopVerdict first
// flips a pair to stopped:true for the day. That needs its own transition
// detector, because this function is called from a hot loop across several
// live paths (the relay gate and sniper gate in routes.ts, the autoexec path
// in live-trading-engine.ts's decision loop, plus the engine's own decision
// path a few lines below) many times per minute per symbol — logging on every
// call would flood a table with duplicate rows for one real stop, so "first
// time today" would need its own new in-memory-plus-DB dedup layer just to
// keep the log honest. That is a second stateful system built to protect a
// third one from itself.
//
// Every close that would have triggered today's stop is ALREADY a durable row
// in ai_trade_results (this file already reads it in compute() above), so this
// re-derives the same picture for past days instead: group those closes by
// calendar day, collapse fan-out fills into signals with the SAME grouping
// window compute() uses, and apply the SAME losing-signal threshold. One
// query, no schema change, and it cannot drift from what pairDailyStopVerdict
// actually does today because it is the identical rule run over older dates.
// ─────────────────────────────────────────────────────────────────────────────

export interface PairDayStopHistory {
  dayOfWeek: number;      // 0=Sun..6=Sat (Date#getUTCDay())
  daysActive: number;     // distinct calendar days this pair had a closed signal
  daysStopped: number;    // of those, how many would have hit the daily stop
}

export async function pairDayStopHistory(
  userId: number, symbol: string, lookbackDays = 180,
): Promise<PairDayStopHistory[]> {
  const { pool } = await import('../db');
  const sym = norm(symbol);
  if (!sym) return [];

  // Same source table, same exclusions and threshold as compute() — this is
  // the identical rule, just walked over every past day instead of "today".
  // closed_at is stored as a naive UTC timestamp (same convention fx-brain.ts's
  // own query relies on with `closed_at::date AS d`) — casting straight to
  // ::date here, with no AT TIME ZONE conversion, keeps the calendar day this
  // function groups by identical to the one the brain already groups by.
  const { rows } = await pool.query(
    `SELECT symbol, direction, result, COALESCE(profit_loss, 0) AS pnl, closed_at,
            closed_at::date AS d
       FROM ai_trade_results
      WHERE user_id = $1
        AND result IN ('WIN','LOSS')
        AND closed_at IS NOT NULL
        AND closed_at > now() - ($2 || ' days')::interval
        AND source NOT IN ('mt5_ea','mt5_copier','kalshi','polymarket')
      ORDER BY closed_at ASC`,
    [userId, String(lookbackDays)]
  );

  const bySym = rows.filter((r: any) => norm(r.symbol) === sym);
  if (!bySym.length) return [];

  const byDay = new Map<string, any[]>();
  for (const r of bySym) {
    const k = String(r.d);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k)!.push(r);
  }

  const perDow = new Map<number, { active: number; stopped: number }>();
  for (const [dateStr, list] of Array.from(byDay.entries())) {
    // Fan-out collapse identical to compute(): list is chronological here, so
    // walk it the same direction and group same-result/same-direction closes
    // within GROUP_MS as one signal.
    const signals: { result: string }[] = [];
    for (const r of list) {
      const ts = new Date(r.closed_at).getTime();
      const dir = String(r.direction ?? '');
      const prev: any = (signals as any)[signals.length - 1];
      if (prev && prev.result === r.result && prev.dir === dir && Math.abs(ts - prev.ts) <= GROUP_MS) continue;
      (signals as any).push({ result: r.result, ts, dir });
    }
    const losing = signals.filter((s) => s.result === 'LOSS').length;
    const stopped = MAX_LOSING_SIGNALS > 0 && losing >= MAX_LOSING_SIGNALS;
    const dow = new Date(dateStr + 'T00:00:00Z').getUTCDay();
    const cur = perDow.get(dow) || { active: 0, stopped: 0 };
    cur.active += 1;
    if (stopped) cur.stopped += 1;
    perDow.set(dow, cur);
  }

  return Array.from(perDow.entries())
    .map(([dayOfWeek, v]) => ({ dayOfWeek, daysActive: v.active, daysStopped: v.stopped }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}

/** For /api/health and the dashboard: today's per-pair picture. */
export async function pairDailyStopTable(userId: number): Promise<{ day: string; limit: number; maxLoss: number; pairs: PairDayStat[] }> {
  let stats: Map<string, PairDayStat>;
  try {
    stats = await compute(userId);
  } catch {
    stats = cache.get(userId)?.stats ?? new Map();
  }
  return {
    day: utcDay(),
    limit: MAX_LOSING_SIGNALS,
    maxLoss: MAX_DAILY_LOSS,
    pairs: Array.from(stats.values()).sort((a, b) => a.netPnl - b.netPnl),
  };
}
