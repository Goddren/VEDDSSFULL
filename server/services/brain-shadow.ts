// Shadow outcomes for brain-blocked sessions.
//
// A brain session block (e.g. GBPUSD Asian 22% WR) stops new entries, so the
// session gets no new data and the block can never lift. While a pair is
// blocked we open a SHADOW trade (no order) and resolve it against real M15
// highs/lows. Resolved shadows are blended into the session win rate at reduced
// weight (BRAIN_SHADOW_WEIGHT, default 0.5) so a session whose blocked setups
// keep winning unblocks itself, and one that keeps losing stays blocked.
//
// One open shadow per user/symbol/direction. Stop = 1.5 × M15 ATR, target = 2R
// (or the AI decision's own SL/TP when a blocked decision supplies them). A bar
// that touches both levels counts as a loss. Unresolved after 24h = expired
// (not counted).

import { sessionForHour, sameSession } from '../utils/session';

export interface ShadowBar { timestamp: number; high: number; low: number }

interface SessionStat { wins: number; losses: number }

let _tableReady = false;
let _statsAt = 0;
let _statsLoading = false;
// key: `${userId}|${SYMBOL}|${session}`
let _stats = new Map<string, SessionStat>();
// key: `${userId}|${SYMBOL}|${direction}` — avoid a DB round-trip per scan
const _openKeys = new Set<string>();
let _openKeysLoaded = false;

const STATS_TTL_MS = 10 * 60_000;
const EXPIRE_MS = 24 * 3_600_000;
const LOOKBACK_DAYS = 60;

const norm = (s: string) => String(s || '').toUpperCase().replace('/', '');

async function ensureTable(): Promise<any> {
  const { pool } = await import('../db');
  if (!_tableReady) {
    await pool.query(`CREATE TABLE IF NOT EXISTS brain_shadow_trades (
      id serial primary key, user_id int not null, symbol text not null, session text not null,
      direction text not null, entry real not null, stop_loss real not null, take_profit real not null,
      source text, reason text, status text not null default 'open', r_multiple real,
      created_at timestamptz default now(), resolved_at timestamptz)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS brain_shadow_open ON brain_shadow_trades (user_id, symbol, status)`);
    _tableReady = true;
  }
  if (!_openKeysLoaded) {
    const r = await pool.query(`SELECT user_id, symbol, direction FROM brain_shadow_trades WHERE status='open'`);
    for (const row of r.rows) _openKeys.add(`${row.user_id}|${norm(row.symbol)}|${row.direction}`);
    _openKeysLoaded = true;
  }
  return pool;
}

/** Open a shadow trade for a blocked session entry. Fire-and-forget. */
export function recordShadow(userId: number, p: {
  symbol: string; direction: 'BUY' | 'SELL'; entry: number; atr?: number;
  stopLoss?: number | null; takeProfit?: number | null; source: string; reason: string;
}, onSkip?: (why: string) => void, onOpen?: (msg: string) => void): void {
  void (async () => {
    try {
      const sym = norm(p.symbol);
      const key = `${userId}|${sym}|${p.direction}`;
      const pool = await ensureTable();
      if (_openKeys.has(key)) return; // one open shadow per pair/direction — normal
      if (!(p.entry > 0)) { onSkip?.(`no entry price`); return; }
      const buy = p.direction === 'BUY';
      let sl = Number(p.stopLoss), tp = Number(p.takeProfit);
      const validSL = sl > 0 && (buy ? sl < p.entry : sl > p.entry);
      if (!validSL) {
        if (!(Number(p.atr) > 0)) { onSkip?.(`no ATR (got ${p.atr}) and no stop`); return; }
        const risk = 1.5 * Number(p.atr);
        sl = buy ? p.entry - risk : p.entry + risk;
      }
      const risk = Math.abs(p.entry - sl);
      const validTP = tp > 0 && (buy ? tp > p.entry : tp < p.entry);
      if (!validTP) tp = buy ? p.entry + 2 * risk : p.entry - 2 * risk;
      const session = sessionForHour(new Date().getUTCHours());
      _openKeys.add(key);
      await pool.query(
        `INSERT INTO brain_shadow_trades (user_id, symbol, session, direction, entry, stop_loss, take_profit, source, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [userId, sym, session, p.direction, p.entry, sl, tp, p.source, String(p.reason).slice(0, 300)],
      ).catch((e: any) => { _openKeys.delete(key); throw e; }); onOpen?.(`${p.direction} @ ${p.entry} SL ${+sl.toFixed(5)} TP ${+tp.toFixed(5)} (${session})`);
    } catch (e: any) { onSkip?.(`error: ${String(e?.message || e).slice(0, 120)}`); /* never breaks trading */ }
  })();
}

/** Resolve open shadows for one symbol against confirmed M15 bars. Fire-and-forget. */
export function resolveShadows(userId: number, symbol: string, bars: ShadowBar[]): void {
  const sym = norm(symbol);
  if (!_openKeysLoaded) { void ensureTable().catch(() => {}); return; }
  if (!_openKeys.has(`${userId}|${sym}|BUY`) && !_openKeys.has(`${userId}|${sym}|SELL`)) return;
  void (async () => {
    try {
      const pool = await ensureTable();
      const r = await pool.query(
        `SELECT id, direction, entry, stop_loss, take_profit, created_at FROM brain_shadow_trades
         WHERE user_id=$1 AND symbol=$2 AND status='open'`, [userId, sym]);
      for (const s of r.rows) {
        const opened = new Date(s.created_at).getTime();
        const buy = s.direction === 'BUY';
        let outcome: 'win' | 'loss' | null = null;
        // Bar timestamp = bar open; only bars that opened after the shadow count.
        for (const b of bars) {
          if (!(b.timestamp > opened)) continue;
          const hitSL = buy ? b.low <= s.stop_loss : b.high >= s.stop_loss;
          const hitTP = buy ? b.high >= s.take_profit : b.low <= s.take_profit;
          if (hitSL) { outcome = 'loss'; break; }   // both in one bar → loss
          if (hitTP) { outcome = 'win'; break; }
        }
        let status: string | null = outcome;
        if (!status && Date.now() - opened > EXPIRE_MS) status = 'expired';
        if (!status) continue;
        const rr = Math.abs(s.take_profit - s.entry) / (Math.abs(s.entry - s.stop_loss) || 1);
        await pool.query(
          `UPDATE brain_shadow_trades SET status=$1, r_multiple=$2, resolved_at=now() WHERE id=$3 AND status='open'`,
          [status, status === 'win' ? rr : status === 'loss' ? -1 : 0, s.id]);
        _openKeys.delete(`${userId}|${sym}|${s.direction}`);
        _statsAt = 0; // refresh blended stats on next read
      }
    } catch (_) { /* non-fatal */ }
  })();
}

function refreshStats(): void {
  if (_statsLoading || Date.now() - _statsAt < STATS_TTL_MS) return;
  _statsLoading = true;
  void (async () => {
    try {
      const pool = await ensureTable();
      const r = await pool.query(
        `SELECT user_id, symbol, session, count(*) FILTER (WHERE status='win')::int w, count(*) FILTER (WHERE status='loss')::int l
         FROM brain_shadow_trades WHERE status IN ('win','loss') AND created_at > now() - interval '${LOOKBACK_DAYS} days'
         GROUP BY 1,2,3`);
      const m = new Map<string, SessionStat>();
      for (const row of r.rows) m.set(`${row.user_id}|${norm(row.symbol)}|${row.session}`, { wins: row.w, losses: row.l });
      _stats = m;
      _statsAt = Date.now();
    } catch (_) { /* keep previous stats */ }
    finally { _statsLoading = false; }
  })();
}

/** Resolved shadow wins/losses for a symbol+session (sync; refreshes in the background). */
export function getShadowSessionStat(userId: number, symbol: string, session: string): SessionStat | null {
  refreshStats();
  const sym = norm(symbol);
  let hit: SessionStat | null = null;
  _stats.forEach((v, k) => {
    const [u, s, sess] = k.split('|');
    if (Number(u) === userId && s === sym && sameSession(sess, session)) {
      hit = hit ? { wins: hit.wins + v.wins, losses: hit.losses + v.losses } : { ...v };
    }
  });
  return hit;
}

export const SHADOW_WEIGHT = () => {
  const w = Number(process.env.BRAIN_SHADOW_WEIGHT ?? 0.5);
  return Number.isFinite(w) && w >= 0 ? w : 0.5;
};
