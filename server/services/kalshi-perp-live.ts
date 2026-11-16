// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp LIVE lane (2026-11-15) — the execution path behind the
// shadow lane's "Arm for live" toggle. Chris approved the build Nov 15,
// 2026 ("Yes build it both"). REAL MONEY: this module places real orders
// on the owner's Kalshi margin account, and it is built to fail CLOSED at
// every step.
//
// WHAT IT DOES: mirrors the SHADOW lane's entries (kalshi-stock-shadow.ts)
// into real perp orders. The shadow lane's full gate stack (perp brain,
// VP veto, earnings blackout, corporate-action blocks, liquidity floors)
// has already run before a shadow position exists — this lane adds the
// live gates on top and never originates its own signals.
//
// THE GATE CHAIN — a live ENTRY order is placed only when ALL of these
// hold, re-verified server-side on EVERY cycle (nothing is cached trust):
//   1. Master kill switch: KALSHI_PERP_LIVE is not 'off'.
//   2. The lane is not auto-paused (API error storm) and the daily-loss
//      halt is not active.
//   3. Kalshi credentials exist for the owner account.
//   4. GET /margin/enabled answers an explicit TRUE for the account
//      (any error or any other answer → no orders).
//   5. The margin balance reads successfully and yields an equity figure
//      (sizing is impossible without it → no orders).
//   6. The strategy is ARMED via the in-app toggle (getArmedPerpStrategies
//      — default NOT armed; an unreadable arm state reads as not armed).
//   7. The strategy meets the EXISTING promotion bar on FRESH shadow
//      stats: ≥50 resolved trades net of fees+funding, avg ≥ +0.2R,
//      win rate ≥ 40%, no losing week in the last two calendar weeks,
//      $100-replay drawdown ≤ 10% (the same bar PR #89's panel states).
//   8. Blast-radius caps: ≤3 live open or in flight (env
//      KALSHI_PERP_LIVE_MAX_OPEN), ≤2 per strategy, ≤10 live orders per
//      UTC day, one live position per strategy+underlying, per-trade
//      notional ≤ the shadow model's $250 AND ≤ 25% of margin equity.
// EXITS are not gated by 1–8: exit monitoring and reconciliation run even
// with the kill switch off, because stranding a real position is worse
// than closing it. The kill switch stops NEW entries, never exits.
//
// ORDER SAFETY: every order intent is persisted BEFORE it is sent, with a
// deterministic client_order_id (Kalshi's idempotency key). An ambiguous
// response (timeout / 5xx / unparseable) is NEVER retried blind: the lane
// reconciles by client_order_id and by position reads first, and the
// intent stays blocked until Kalshi's own records resolve it.
//
// RECONCILIATION (every cycle, before exits and entries): Kalshi's
// position list is ground truth. A live row Kalshi doesn't show is closed
// out of the journal as externally closed (never assumed still open); a
// Kalshi position no live row claims is SURFACED on the panel as unknown
// and never adopted, sized, or closed by this lane (it may be a manual
// trade). Size drift is corrected to Kalshi's count.
//
// EXITS mirror the shadow resolver: 1-minute candle walk on the touch
// series (long exits on bid, short on ask) for stop/target, max-hold time
// exit, corporate-action exit — executed as reduce-only IOC orders priced
// through the touch. Real fills (average_fill_price) price the journal,
// never the model.
//
// DAILY-LOSS HALT mirrors the event engine's Ruin Guard daily leg: the
// day's realized P&L (durable live journal) + floating P&L on lane
// positions vs −5% (env KALSHI_PERP_LIVE_DAILY_LOSS_PCT) of the day's
// opening margin equity (first successful balance read of the UTC day,
// persisted) → entries halt until the next UTC day.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { ensureKalshiPerpLiveTables } from './ensure-kalshi-perp-live-tables';
import { ensureKalshiPerpShadowTables } from './ensure-kalshi-perp-shadow-tables';
import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';
import {
  getPerpTouch, getPerpCandles, getPerpCorporateActions, getPerpMarkets, perpHost, type PerpBar,
} from './kalshi-perps';
import {
  loadKalshiCredentials, getKalshiMarginEnabled, getKalshiMarginBalance, getKalshiMarginPositions,
  placeKalshiMarginOrder, findKalshiMarginOrderByClientId, getKalshiMarginFills, getKalshiMarginFundingHistoryUsd,
  type KalshiMarginPosition,
} from './kalshi-trading';
import { accountReplay } from './kalshi-stock-shadow';

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
export const perpLiveEnabled = () => process.env.KALSHI_PERP_LIVE !== 'off';
const NOTIONAL = () => num('KALSHI_PERP_LIVE_NOTIONAL_USD', 250);
const MAX_OPEN = () => Math.max(1, Math.floor(num('KALSHI_PERP_LIVE_MAX_OPEN', 3)));
const MAX_PER_STRAT = () => Math.max(1, Math.floor(num('KALSHI_PERP_LIVE_MAX_PER_STRATEGY', 2)));
const MAX_ORDERS_DAY = () => Math.max(1, Math.floor(num('KALSHI_PERP_LIVE_MAX_ORDERS_PER_DAY', 10)));
const MAX_EQUITY_PCT = () => num('KALSHI_PERP_LIVE_MAX_EQUITY_PCT_PER_TRADE', 25);
const DAILY_LOSS_PCT = () => num('KALSHI_PERP_LIVE_DAILY_LOSS_PCT', 5);
const SIGNAL_MAX_AGE_MIN = () => num('KALSHI_PERP_LIVE_SIGNAL_MAX_AGE_MIN', 10);
const EXIT_SLIPPAGE_PCT = () => num('KALSHI_PERP_LIVE_EXIT_SLIPPAGE_PCT', 0.5);
const ERROR_STORM_LIMIT = 3;
const ERROR_PAUSE_MS = 30 * 60_000;
const AMBIGUOUS_ABANDON_MS = 15 * 60_000;

// ── promotion bar (the EXISTING bar, evaluated on fresh shadow closes) ────
export interface PerpPromotionCloses { closedAtMs: number; returnPct: number; rMultiple: number | null }
export interface PerpPromotionBar {
  met: boolean;
  trades: number;
  avgR: number | null;
  winRate: number | null;
  losingWeeks: string[];
  maxDrawdownPct: number;
  reasons: string[];
}

/** ISO-week key (weeks start Monday, UTC) for the no-losing-week rule. */
export function isoWeekKey(ms: number): string {
  const d = new Date(ms);
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return monday.toISOString().slice(0, 10);
}

/**
 * The shadow→live promotion bar, pure and deterministic: ≥50 resolved
 * trades (net of fees+funding — the shadow lane's return_pct already is),
 * avg ≥ +0.2R, win rate ≥ 40%, no losing week in the last two calendar
 * weeks, and the $100-account replay drawdown ≤ 10%. This is the SAME bar
 * the arming panel states (PR #89's evaluateKalshiBar): the losing-week
 * rule is weekly R sums over the current + previous Monday-start UTC
 * weeks, and a week with no R-carrying closes never condemns — an early
 * bad week must not brick a strategy forever once its recent record is
 * clean, and the panel must never say "bar met" while execution refuses.
 */
export function evaluatePerpPromotionBar(closes: PerpPromotionCloses[], nowMs: number = Date.now()): PerpPromotionBar {
  const valid = closes
    .filter((c) => Number.isFinite(c.returnPct) && Number.isFinite(c.closedAtMs))
    .sort((a, b) => a.closedAtMs - b.closedAtMs);
  const trades = valid.length;
  const rRows = valid.filter((c) => c.rMultiple != null && Number.isFinite(c.rMultiple));
  const avgR = rRows.length ? rRows.reduce((a, c) => a + (c.rMultiple as number), 0) / rRows.length : null;
  const winRate = trades ? valid.filter((c) => c.returnPct > 0).length / trades : null;
  const now = new Date(nowMs);
  const dow = (now.getUTCDay() + 6) % 7; // Mon=0
  const windowStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow) - 7 * 86_400_000;
  const byWeek = new Map<string, number>();
  for (const c of valid) {
    if (c.closedAtMs < windowStart || c.rMultiple == null || !Number.isFinite(c.rMultiple)) continue;
    const k = isoWeekKey(c.closedAtMs);
    byWeek.set(k, (byWeek.get(k) ?? 0) + (c.rMultiple as number));
  }
  const losingWeeks = Array.from(byWeek.entries()).filter(([, sum]) => sum < 0).map(([k]) => k).sort();
  const maxDrawdownPct = accountReplay(valid.map((c) => c.returnPct)).maxDrawdownPct;
  const reasons: string[] = [];
  if (trades < 50) reasons.push(`${trades}/50 resolved shadow trades`);
  if (avgR == null || avgR < 0.2) reasons.push(`avg ${avgR == null ? '—' : avgR.toFixed(2)}R is below the +0.2R bar`);
  if (winRate == null || winRate < 0.4) reasons.push(`win rate ${winRate == null ? '—' : `${Math.round(winRate * 100)}%`} is below 40%`);
  if (losingWeeks.length) reasons.push(`losing week in the last two weeks: ${losingWeeks.join(', ')}`);
  if (maxDrawdownPct > 10) reasons.push(`shadow drawdown ${maxDrawdownPct.toFixed(1)}% exceeds 10%`);
  return { met: reasons.length === 0, trades, avgR, winRate, losingWeeks, maxDrawdownPct, reasons };
}

async function loadShadowClosesByStrategy(userId: number): Promise<Map<string, PerpPromotionCloses[]>> {
  await ensureKalshiPerpShadowTables();
  const { rows } = await pool.query(
    `SELECT strategy, return_pct, r_multiple, closed_at FROM kalshi_perp_shadow_trades
      WHERE user_id=$1 AND status='closed' AND exclude_from_stats IS NOT TRUE
        AND return_pct IS NOT NULL AND closed_at IS NOT NULL ORDER BY closed_at ASC`,
    [userId]);
  const out = new Map<string, PerpPromotionCloses[]>();
  for (const r of rows) {
    const list = out.get(String(r.strategy)) ?? [];
    list.push({
      closedAtMs: new Date(r.closed_at).getTime(),
      returnPct: Number(r.return_pct),
      rMultiple: r.r_multiple == null ? null : Number(r.r_multiple),
    });
    out.set(String(r.strategy), list);
  }
  return out;
}

// ── sizing + levels (pure; mirror the shadow lane's math) ──────────────────
/** Whole contracts for a target notional at a price — floored, so live
 *  size never exceeds the model the way the shadow lane's rounding can. */
export function perpLiveContractsFor(targetNotionalUsd: number, price: number): number {
  if (!(targetNotionalUsd > 0) || !(price > 0)) return 0;
  return Math.floor(targetNotionalUsd / price);
}

export function sizeLiveEntry(equityUsd: number | null, price: number): { contracts: number; notionalUsd: number; targetUsd: number; reason: string | null } {
  const modelTarget = NOTIONAL();
  const equityCap = equityUsd != null && equityUsd > 0 ? (equityUsd * MAX_EQUITY_PCT()) / 100 : null;
  const targetUsd = equityCap != null ? Math.min(modelTarget, equityCap) : modelTarget;
  const contracts = perpLiveContractsFor(targetUsd, price);
  if (contracts < 1) {
    return { contracts: 0, notionalUsd: 0, targetUsd, reason: `price ${price} leaves no whole contract inside the $${targetUsd.toFixed(0)} target` };
  }
  return { contracts, notionalUsd: contracts * price, targetUsd, reason: null };
}

/** Stop/target from the ACTUAL live fill, same geometry as the shadow
 *  lane: stop at slPct, target at 2R. */
export function exitLevelsFor(direction: string, fillPrice: number, slPct: number): { stop: number; target: number } {
  const short = direction === 'short';
  return {
    stop: short ? fillPrice * (1 + slPct / 100) : fillPrice * (1 - slPct / 100),
    target: short ? fillPrice * (1 - (slPct * 2) / 100) : fillPrice * (1 + (slPct * 2) / 100),
  };
}

/** Shadow-resolver exit scan over 1-minute candles, on the touch series
 *  (long exits on bid, short on ask); stop is checked before target within
 *  a candle, exactly as the shadow resolver does. */
export function scanExitTrigger(
  candles: Array<Pick<PerpBar, 'bid' | 'ask'>>,
  direction: string, stop: number, target: number,
): 'stop' | 'target' | null {
  const short = direction === 'short';
  for (const cd of candles) {
    if (short ? cd.ask.h >= stop : cd.bid.l <= stop) return 'stop';
    if (short ? cd.ask.l <= target : cd.bid.h >= target) return 'target';
  }
  return null;
}

// ── INTEGRATION POINT — the "Arm for live" toggle state ────────────────────
// The toggle build (PR #89, server/services/shadow-live-toggles.ts) stores
// the owner's arming choices per user in runtime_state scope
// 'kalshi_perp_armed', keyed by userId, as a record keyed by strategy:
// { [strategy]: { armed: boolean, updatedAt, bar } }. That scope is read
// FIRST; the older provisional scopes remain as fallbacks. Whenever the
// store is unreadable this returns an EMPTY set — not armed is the only
// safe default, and gate 6 fails closed on any read error. Everything
// downstream treats the result as fresh-per-cycle truth (no caching here:
// PR #89's own 30s read cache is on the panel side, never on this gate).
const ARM_SCOPES = ['kalshi_perp_armed', 'kalshi_perp_live_arm', 'kalshi_perp_arm'];
export function parseArmedStrategies(v: any): Set<string> {
  const out = new Set<string>();
  const add = (s: unknown) => { if (typeof s === 'string' && s.trim()) out.add(s.trim()); };
  if (Array.isArray(v)) v.forEach(add);
  else if (v && typeof v === 'object') {
    if (Array.isArray(v.strategies)) v.strategies.forEach(add);
    if (Array.isArray(v.armed)) v.armed.forEach(add);
    else if (v.armed && typeof v.armed === 'object') for (const [k, on] of Object.entries(v.armed)) if (on) add(k);
    if (v.armedStrategies && typeof v.armedStrategies === 'object') {
      for (const [k, on] of Object.entries(v.armedStrategies)) if (on) add(k);
    }
    // PR #89's store shape: a record keyed by strategy whose values are
    // arm entries ({ armed: true, … }) — or, in a plain boolean map, true.
    for (const [k, val] of Object.entries(v)) {
      if (k === 'strategies' || k === 'armed' || k === 'armedStrategies') continue;
      if (val === true) add(k);
      else if (val && typeof val === 'object' && (val as any).armed === true) add(k);
    }
  }
  return out;
}

export async function getArmedPerpStrategies(userId: number): Promise<Set<string>> {
  for (const scope of ARM_SCOPES) {
    let v: any = null;
    try { v = await getRuntimeStateStrict(scope, String(userId)); }
    catch { return new Set(); } // unreadable arm state → NOT armed (fail closed)
    const parsed = parseArmedStrategies(v);
    if (parsed.size) return parsed;
  }
  return new Set();
}

// ── lane state (runtime_state 'kalshi_perp_live' / userId) ─────────────────
interface PerpLiveState {
  pausedUntilMs: number;
  pauseReason: string | null;
  consecutiveApiErrors: number;
  dayAnchorDate: string | null;
  dayAnchorEquityUsd: number | null;
  unknownPositions: Array<{ ticker: string; contracts: number; seenAt: string }>;
  lastCycleAt: string | null;
  lastBlockReason: string | null;
}
const STATE_SCOPE = 'kalshi_perp_live';
const defaultState = (): PerpLiveState => ({
  pausedUntilMs: 0, pauseReason: null, consecutiveApiErrors: 0,
  dayAnchorDate: null, dayAnchorEquityUsd: null, unknownPositions: [],
  lastCycleAt: null, lastBlockReason: null,
});
async function loadPerpLiveState(userId: number): Promise<PerpLiveState> {
  try {
    const v = await getRuntimeStateStrict(STATE_SCOPE, String(userId));
    if (v && typeof v === 'object') return { ...defaultState(), ...v };
  } catch { /* a lost state must never enable trading: defaults have no day anchor, so entries block until one is set */ }
  return defaultState();
}
function savePerpLiveState(userId: number, s: PerpLiveState): void {
  saveRuntimeState(STATE_SCOPE, String(userId), s);
}

const utcDayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

// ── order sending with ambiguity discipline ────────────────────────────────
type SendResult =
  | { kind: 'filled' | 'partial' | 'unfilled'; orderId: string; fillCount: number; avgFillPrice: number | null }
  | { kind: 'rejected'; code: string; message: string }
  | { kind: 'blocked'; why: string };

async function adoptFoundOrder(userId: number, orderRowId: number, found: { orderId: string; fillCount: number; avgFillPrice: number | null }): Promise<SendResult> {
  const status = found.fillCount > 0 ? 'reconciled' : 'canceled';
  await pool.query(
    `UPDATE kalshi_perp_live_orders SET status=$2, order_id=$3, fill_count=$4, avg_fill_price=$5, updated_at=now() WHERE id=$1`,
    [orderRowId, status, found.orderId, found.fillCount, found.avgFillPrice]).catch(() => {});
  if (found.fillCount > 0) return { kind: 'filled', orderId: found.orderId, fillCount: found.fillCount, avgFillPrice: found.avgFillPrice };
  return { kind: 'unfilled', orderId: found.orderId, fillCount: 0, avgFillPrice: null };
}

/**
 * Send one order intent. The intent row is persisted FIRST (status
 * 'sending'); a pre-existing row for the same client_order_id (crash
 * recovery, or an earlier ambiguous attempt) is reconciled against
 * Kalshi before anything new is sent. Ambiguous outcomes reconcile
 * immediately once; if still unresolved the intent returns 'blocked' and
 * stays blocked until a later cycle's reconciliation resolves it — a
 * second order for the same intent is never fired blind.
 */
async function sendMarginOrderIntent(userId: number, intent: {
  liveTradeId: number | null; kind: 'entry' | 'exit'; clientOrderId: string;
  ticker: string; side: 'bid' | 'ask'; count: number; price: number; tickSize?: number | null; reduceOnly?: boolean;
}): Promise<SendResult> {
  await ensureKalshiPerpLiveTables();
  const ins = await pool.query(
    `INSERT INTO kalshi_perp_live_orders (user_id, live_trade_id, kind, client_order_id, ticker, side, count, price, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'sending')
     ON CONFLICT (client_order_id) DO NOTHING RETURNING id`,
    [userId, intent.liveTradeId, intent.kind, intent.clientOrderId, intent.ticker, intent.side, intent.count, intent.price]);
  let orderRowId: number | null = ins.rows[0]?.id ?? null;
  if (!orderRowId) {
    const { rows } = await pool.query(`SELECT * FROM kalshi_perp_live_orders WHERE client_order_id=$1`, [intent.clientOrderId]);
    const existing = rows[0];
    if (!existing) return { kind: 'blocked', why: 'order intent row vanished' };
    orderRowId = Number(existing.id);
    if (existing.status === 'filled' || existing.status === 'partial') {
      return { kind: existing.status === 'filled' ? 'filled' : 'partial', orderId: String(existing.order_id ?? ''), fillCount: Number(existing.fill_count) || 0, avgFillPrice: existing.avg_fill_price == null ? null : Number(existing.avg_fill_price) };
    }
    if (existing.status === 'rejected') return { kind: 'rejected', code: '', message: String(existing.error ?? 'previously rejected') };
    if (existing.status === 'not_placed') return { kind: 'unfilled', orderId: '', fillCount: 0, avgFillPrice: null };
    // 'sending' (crashed mid-send) or 'ambiguous' → reconcile, never resend.
    const found = await findKalshiMarginOrderByClientId(userId, intent.clientOrderId).catch(() => null);
    await pool.query(`UPDATE kalshi_perp_live_orders SET reconcile_attempts = reconcile_attempts + 1, updated_at=now() WHERE id=$1`, [orderRowId]).catch(() => {});
    if (found) return adoptFoundOrder(userId, orderRowId, found);
    const ageMs = Date.now() - new Date(existing.created_at).getTime();
    if (ageMs > AMBIGUOUS_ABANDON_MS && Number(existing.reconcile_attempts ?? 0) >= 1) {
      await pool.query(`UPDATE kalshi_perp_live_orders SET status='not_placed', error='never appeared on Kalshi after repeated reconciliation', updated_at=now() WHERE id=$1`, [orderRowId]).catch(() => {});
      return { kind: 'unfilled', orderId: '', fillCount: 0, avgFillPrice: null };
    }
    return { kind: 'blocked', why: `order ${intent.clientOrderId} is unresolved on Kalshi (sent, no confirmation) — waiting for reconciliation` };
  }

  const outcome = await placeKalshiMarginOrder(userId, {
    ticker: intent.ticker, clientOrderId: intent.clientOrderId, side: intent.side,
    count: intent.count, price: intent.price, tickSize: intent.tickSize, reduceOnly: intent.reduceOnly,
  });
  if (outcome.outcome === 'responded') {
    const status = outcome.fillCount <= 0 ? 'canceled' : outcome.remainingCount > 0 ? 'partial' : 'filled';
    await pool.query(
      `UPDATE kalshi_perp_live_orders SET status=$2, order_id=$3, fill_count=$4, remaining_count=$5, avg_fill_price=$6, updated_at=now() WHERE id=$1`,
      [orderRowId, status, outcome.orderId, outcome.fillCount, outcome.remainingCount, outcome.avgFillPrice]).catch(() => {});
    if (outcome.fillCount <= 0) return { kind: 'unfilled', orderId: outcome.orderId, fillCount: 0, avgFillPrice: null };
    return { kind: outcome.remainingCount > 0 ? 'partial' : 'filled', orderId: outcome.orderId, fillCount: outcome.fillCount, avgFillPrice: outcome.avgFillPrice };
  }
  if (outcome.outcome === 'rejected') {
    if (outcome.code === 'order_already_exists') {
      // The original send DID land (an earlier ambiguous attempt). Adopt it.
      const found = await findKalshiMarginOrderByClientId(userId, intent.clientOrderId).catch(() => null);
      if (found) return adoptFoundOrder(userId, orderRowId, found);
      await pool.query(`UPDATE kalshi_perp_live_orders SET status='ambiguous', error='order_already_exists but order not yet visible', updated_at=now() WHERE id=$1`, [orderRowId]).catch(() => {});
      return { kind: 'blocked', why: 'Kalshi reports this order exists but it is not visible yet — waiting for reconciliation' };
    }
    await pool.query(`UPDATE kalshi_perp_live_orders SET status='rejected', error=$2, updated_at=now() WHERE id=$1`,
      [orderRowId, `${outcome.code}: ${outcome.message}`.slice(0, 500)]).catch(() => {});
    return { kind: 'rejected', code: outcome.code, message: outcome.message };
  }
  // Ambiguous: the order may exist. Reconcile once now; stay blocked if unresolved.
  await pool.query(`UPDATE kalshi_perp_live_orders SET status='ambiguous', error=$2, updated_at=now() WHERE id=$1`,
    [orderRowId, outcome.error.slice(0, 500)]).catch(() => {});
  const found = await findKalshiMarginOrderByClientId(userId, intent.clientOrderId).catch(() => null);
  if (found) return adoptFoundOrder(userId, orderRowId, found);
  return { kind: 'blocked', why: `order ${intent.clientOrderId} unconfirmed (${outcome.error}) — reconciliation pending, no retry fired` };
}

// ── close journaling ───────────────────────────────────────────────────────
/** Real funding the account actually paid/received for this ticker since
 *  the position opened, from /margin/funding_history. Best-effort: null
 *  when the read fails or the payload doesn't parse — the journal then
 *  carries price P&L only and says so in its notes. */
async function fundingHistoryUsd(userId: number, ticker: string, fromMs: number, toMs: number): Promise<number | null> {
  return getKalshiMarginFundingHistoryUsd(userId, ticker, fromMs, toMs);
}

/** Close out a live trade row at a REAL fill price and journal the result
 *  into ai_trade_results (the app's shared trade journal, source
 *  'kalshi_perp', strategy in the notes — the same shape the Kalshi event
 *  engine uses). P&L = contracts × price delta (perp price units already
 *  embed the 0.02-share contract size: Kalshi's own notional for these
 *  markets is contracts × price, and the shadow lane's P&L math matches). */
async function closeLiveTrade(userId: number, t: any, exitPrice: number | null, why: string, fundingUsd: number | null): Promise<boolean> {
  const entry = Number(t.entry_price);
  const contracts = Number(t.contracts);
  const dirSign = t.direction === 'short' ? -1 : 1;
  const gross = exitPrice != null && entry > 0 && contracts > 0 ? dirSign * (exitPrice - entry) * contracts : null;
  const net = gross != null ? gross + (fundingUsd ?? 0) : null;
  const notional = entry > 0 && contracts > 0 ? entry * contracts : Number(t.notional_usd) || 0;
  const returnPct = net != null && notional > 0 ? (net / notional) * 100 : null;
  const rMultiple = returnPct != null && Number(t.sl_pct) > 0 ? returnPct / Number(t.sl_pct) : null;
  const upd = await pool.query(
    `UPDATE kalshi_perp_live_trades SET status='closed', exit_price=$2, exit_reason=$3, gross_pnl_usd=$4,
       funding_usd=$5, net_pnl_usd=$6, return_pct=$7, r_multiple=$8, closed_at=now()
     WHERE id=$1 AND status IN ('open','closing')`,
    [t.id, exitPrice, why, gross, fundingUsd, net, returnPct, rMultiple]);
  if (!upd.rowCount) return false;
  Promise.resolve().then(async () => {
    try {
      const { db } = await import('../db');
      const { aiTradeResults } = await import('../../shared/schema');
      await db.insert(aiTradeResults).values({
        userId,
        symbol: `KALSHI:${t.ticker}`,
        direction: t.direction === 'short' ? 'SELL' : 'BUY',
        entryPrice: entry,
        exitPrice: exitPrice ?? undefined,
        stopLoss: Number(t.stop_loss),
        takeProfit: Number(t.take_profit),
        result: net == null ? 'PENDING' : net > 0 ? 'WIN' : net < 0 ? 'LOSS' : 'BREAKEVEN',
        profitLoss: net == null ? undefined : Math.round(net * 100) / 100,
        closedAt: new Date(),
        source: 'kalshi_perp',
        mt5Ticket: `perp-live-${t.id}`,
        notes: `${t.strategy}: Kalshi stock-perp LIVE | ${why}${fundingUsd == null ? ' | funding unrecorded' : ''}`,
      });
    } catch { /* journal insert is best-effort; the live table is the lane's record */ }
  });
  return true;
}

// ── reconciliation ─────────────────────────────────────────────────────────
interface ReconcileResult { positions: KalshiMarginPosition[]; byTicker: Map<string, KalshiMarginPosition> }

/** Kalshi's positions are ground truth. Resolves vanished positions,
 *  adopts fills for pending entries whose orders landed, corrects size
 *  drift, and records unknown positions (never adopted). */
async function reconcileLivePositions(userId: number, state: PerpLiveState): Promise<ReconcileResult> {
  const positions = await getKalshiMarginPositions(userId); // throws on API failure — the cycle counts it
  const byTicker = new Map(positions.map((p) => [p.ticker, p]));
  const { rows } = await pool.query(
    `SELECT * FROM kalshi_perp_live_trades WHERE user_id=$1 AND status IN ('open','closing','pending_entry') ORDER BY id ASC`,
    [userId]);
  const claimed = new Set<string>();

  for (const t of rows) {
    const pos = byTicker.get(String(t.ticker));
    if (t.status === 'pending_entry') {
      // An entry intent is in flight (or crashed). Resolve it through the
      // order path first; a position that matches OUR in-flight intent is
      // adopted — a position with no intent of ours is NOT (see unknown).
      const { rows: ords } = await pool.query(
        `SELECT * FROM kalshi_perp_live_orders WHERE live_trade_id=$1 AND kind='entry' ORDER BY id DESC LIMIT 1`, [t.id]);
      const ord = ords[0];
      if (ord && (ord.status === 'sending' || ord.status === 'ambiguous')) {
        const res = await sendMarginOrderIntent(userId, {
          liveTradeId: Number(t.id), kind: 'entry', clientOrderId: String(ord.client_order_id),
          ticker: String(t.ticker), side: ord.side === 'ask' ? 'ask' : 'bid',
          count: Number(ord.count), price: Number(ord.price), reduceOnly: false,
        });
        if ((res.kind === 'filled' || res.kind === 'partial') && pos) {
          const fillPrice = res.avgFillPrice ?? pos.entryPrice ?? Number(ord.price);
          const levels = exitLevelsFor(String(t.direction), fillPrice, Number(t.sl_pct));
          await pool.query(
            `UPDATE kalshi_perp_live_trades SET status='open', contracts=$2, entry_price=$3, stop_loss=$4, take_profit=$5,
               notional_usd=$6, entry_order_id=$7, opened_at=COALESCE(opened_at, now()), last_reconciled_at=now(),
               notes=COALESCE(notes,'') || ' entry adopted via reconciliation;' WHERE id=$1`,
            [t.id, Math.abs(pos.contracts), fillPrice, levels.stop, levels.target, Math.abs(pos.contracts) * fillPrice, res.orderId]);
          claimed.add(String(t.ticker));
          continue;
        }
        if (res.kind === 'unfilled') {
          await pool.query(`UPDATE kalshi_perp_live_trades SET status='unfilled', closed_at=now(), exit_reason='entry never landed (reconciled)', last_reconciled_at=now() WHERE id=$1`, [t.id]);
          continue;
        }
        // blocked/rejected: leave pending; if rejected outright, close the intent out.
        if (res.kind === 'rejected') {
          await pool.query(`UPDATE kalshi_perp_live_trades SET status='rejected', closed_at=now(), exit_reason=$2, last_reconciled_at=now() WHERE id=$1`,
            [t.id, `entry rejected: ${res.code} ${res.message}`.slice(0, 300)]);
        }
        continue;
      }
      // Terminal order states: the entry path never revisits this row, so
      // reconciliation resolves it here. (A crash can strand a pending row
      // between the order-row update inside the send and the trade-row
      // update that follows it — without this, a filled entry would leave
      // a real position unmonitored and misreported as "unknown".)
      if (ord && (ord.status === 'filled' || ord.status === 'partial' || ord.status === 'reconciled') && Number(ord.fill_count ?? 0) > 0) {
        if (pos) {
          // Our order DID open this position — provably ours (the order
          // row is keyed to this trade). Adopt it.
          const fillPrice = ord.avg_fill_price != null ? Number(ord.avg_fill_price) : (pos.entryPrice ?? Number(ord.price));
          const levels = exitLevelsFor(String(t.direction), fillPrice, Number(t.sl_pct));
          await pool.query(
            `UPDATE kalshi_perp_live_trades SET status='open', contracts=$2, entry_price=$3, stop_loss=$4, take_profit=$5,
               notional_usd=$6, entry_order_id=$7, opened_at=COALESCE(opened_at, now()), last_reconciled_at=now(),
               notes=COALESCE(notes,'') || ' entry adopted from terminal order state;' WHERE id=$1`,
            [t.id, Math.abs(pos.contracts), fillPrice, levels.stop, levels.target, Math.abs(pos.contracts) * fillPrice, ord.order_id != null ? String(ord.order_id) : null]);
          claimed.add(String(t.ticker));
        } else {
          // Filled, but Kalshi shows no position: it opened and closed
          // between cycles. Journal the close at the real exit fill when
          // one is findable; never invent a price.
          const fillPrice = ord.avg_fill_price != null ? Number(ord.avg_fill_price) : Number(ord.price);
          await pool.query(
            `UPDATE kalshi_perp_live_trades SET status='open', contracts=$2, entry_price=$3, opened_at=COALESCE(opened_at, $4), entry_order_id=$5 WHERE id=$1`,
            [t.id, Number(ord.fill_count), fillPrice, ord.created_at, ord.order_id != null ? String(ord.order_id) : null]);
          const fills = await getKalshiMarginFills(userId, String(t.ticker)).catch(() => [] as any[]);
          const ordMs = new Date(ord.created_at).getTime();
          const exitSide = t.direction === 'short' ? 'bid' : 'ask';
          const closeFill = fills
            .filter((f: any) => String(f.side ?? '') === exitSide)
            .map((f: any) => ({ px: Number(f.price ?? f.fill_price ?? NaN), ts: new Date(f.created_time ?? f.ts ?? f.created_at ?? 0).getTime() }))
            .filter((f: any) => Number.isFinite(f.px) && f.px > 0 && f.ts >= ordMs)
            .sort((a: any, b: any) => b.ts - a.ts)[0];
          await closeLiveTrade(userId, { ...t, contracts: Number(ord.fill_count), entry_price: fillPrice }, closeFill?.px ?? null, 'reconciled_closed', null);
        }
        continue;
      }
      if (ord && (ord.status === 'canceled' || ord.status === 'not_placed')) {
        await pool.query(`UPDATE kalshi_perp_live_trades SET status='unfilled', closed_at=now(), exit_reason='entry never landed (terminal order state)', last_reconciled_at=now() WHERE id=$1`, [t.id]);
        continue;
      }
      if (ord && ord.status === 'rejected') {
        await pool.query(`UPDATE kalshi_perp_live_trades SET status='rejected', closed_at=now(), exit_reason=$2, last_reconciled_at=now() WHERE id=$1`,
          [t.id, `entry rejected: ${String(ord.error ?? '')}`.slice(0, 300)]);
        continue;
      }
      if (!ord && !pos) {
        // No order row at all: the process died between inserting this
        // trade row and persisting the intent. Declare it lost only once
        // it is old enough that no in-flight send can still be running.
        const ageMs = Date.now() - new Date(t.created_at).getTime();
        if (ageMs > 2 * 60_000) {
          await pool.query(`UPDATE kalshi_perp_live_trades SET status='unfilled', closed_at=now(), exit_reason='entry intent lost before send (recovered in reconciliation)', last_reconciled_at=now() WHERE id=$1`, [t.id]);
        }
      }
      continue;
    }
    // open / closing rows
    if (!pos) {
      // Kalshi shows no position: it is NOT still open, whatever we thought.
      // Find the real exit price from fills when possible; never invent one.
      const fills = await getKalshiMarginFills(userId, String(t.ticker)).catch(() => [] as any[]);
      const openedMs = t.opened_at ? new Date(t.opened_at).getTime() : 0;
      const exitSide = t.direction === 'short' ? 'bid' : 'ask';
      const closeFill = fills
        .filter((f: any) => String(f.side ?? '') === exitSide)
        .map((f: any) => ({ px: Number(f.price ?? f.fill_price ?? NaN), ts: new Date(f.created_time ?? f.ts ?? f.created_at ?? 0).getTime() }))
        .filter((f: any) => Number.isFinite(f.px) && f.px > 0 && (openedMs === 0 || f.ts >= openedMs))
        .sort((a: any, b: any) => b.ts - a.ts)[0];
      await closeLiveTrade(userId, t, closeFill?.px ?? null, 'reconciled_closed', null);
      continue;
    }
    claimed.add(String(t.ticker));
    const kalshiCount = Math.abs(pos.contracts);
    const kalshiDir = pos.contracts < 0 ? 'short' : 'long';
    if (kalshiDir !== t.direction) {
      // Direction itself disagrees — surface loudly via notes, trust Kalshi
      // for sizing, and let the exit monitor close on the position's side.
      await pool.query(
        `UPDATE kalshi_perp_live_trades SET contracts=$2, direction=$3, last_reconciled_at=now(),
           notes=COALESCE(notes,'') || ' direction corrected to Kalshi position;' WHERE id=$1`,
        [t.id, kalshiCount, kalshiDir]);
      t.direction = kalshiDir; t.contracts = kalshiCount;
    } else if (Math.abs(kalshiCount - Number(t.contracts)) > 1e-9) {
      await pool.query(
        `UPDATE kalshi_perp_live_trades SET contracts=$2, last_reconciled_at=now(),
           notes=COALESCE(notes,'') || ' size corrected to Kalshi position;' WHERE id=$1`,
        [t.id, kalshiCount]);
      t.contracts = kalshiCount;
    } else {
      await pool.query(`UPDATE kalshi_perp_live_trades SET last_reconciled_at=now() WHERE id=$1`, [t.id]).catch(() => {});
    }
  }

  state.unknownPositions = positions
    .filter((p) => !claimed.has(p.ticker))
    .map((p) => ({ ticker: p.ticker, contracts: p.contracts, seenAt: new Date().toISOString() }));
  return { positions, byTicker };
}

// ── exit monitoring (mirrors the shadow resolver) ──────────────────────────
const _exitWatermark = new Map<number, number>();

async function monitorLiveExits(userId: number, actions: Array<{ ticker: string; status: string; effectiveMs: number | null }>): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM kalshi_perp_live_trades WHERE user_id=$1 AND status IN ('open','closing') ORDER BY id ASC`, [userId]);
  for (const t of rows) {
    try {
      const openedMs = t.opened_at ? new Date(t.opened_at).getTime() : Date.now();
      const ca = actions.find((a) => a.ticker === t.ticker && a.status !== 'cancelled' && a.status !== 'lapsed'
        && a.effectiveMs != null && a.effectiveMs > openedMs && a.effectiveMs <= Date.now());
      let why: string | null = t.status === 'closing' ? 'closing' : null;
      if (ca) why = 'corporate_action';
      if (!why) {
        const since = Math.max(openedMs, _exitWatermark.get(Number(t.id)) ?? openedMs);
        const mins = Math.max(1, Math.min(5000, Math.ceil((Date.now() - since) / 60_000) + 2));
        const candles = await getPerpCandles(String(t.ticker), 1, mins).catch(() => [] as PerpBar[]);
        const fresh = candles.filter((c) => c.t + 60_000 > since);
        if (fresh.length) {
          why = scanExitTrigger(fresh, String(t.direction), Number(t.stop_loss), Number(t.take_profit));
          _exitWatermark.set(Number(t.id), fresh[fresh.length - 1].t + 60_000);
        }
        if (!why && (Date.now() - openedMs) / 3_600_000 >= Number(t.max_hours)) why = 'time limit';
      }
      if (!why) continue;

      if (t.status !== 'closing') {
        await pool.query(`UPDATE kalshi_perp_live_trades SET status='closing' WHERE id=$1 AND status='open'`, [t.id]).catch(() => {});
      }
      // An earlier exit intent that is still unresolved on Kalshi
      // ('sending' after a crash, or 'ambiguous') is reconciled FIRST by
      // re-driving its own client_order_id — minting a second intent for
      // the same exit could double-fire if the first one actually landed.
      const { rows: priorExits } = await pool.query(
        `SELECT * FROM kalshi_perp_live_orders WHERE live_trade_id=$1 AND kind='exit' ORDER BY id DESC LIMIT 1`, [t.id]);
      const prior = priorExits[0];
      let price: number;
      let res: SendResult;
      if (prior && (prior.status === 'sending' || prior.status === 'ambiguous')) {
        price = Number(prior.price);
        res = await sendMarginOrderIntent(userId, {
          liveTradeId: Number(t.id), kind: 'exit', clientOrderId: String(prior.client_order_id),
          ticker: String(t.ticker), side: prior.side === 'ask' ? 'ask' : 'bid',
          count: Number(prior.count), price, reduceOnly: true,
        });
      } else {
        const touch = await getPerpTouch(String(t.ticker)).catch(() => null);
        if (!touch) { console.error(`[kalshi-perp-live] exit ${why} for trade ${t.id} deferred — no live touch for ${t.ticker}`); continue; }
        const short = t.direction === 'short';
        const slip = EXIT_SLIPPAGE_PCT() / 100;
        const side: 'bid' | 'ask' = short ? 'bid' : 'ask';
        price = short ? touch.ask * (1 + slip) : touch.bid * (1 - slip);
        const attempt = await pool.query(
          `SELECT count(*)::int AS n FROM kalshi_perp_live_orders WHERE live_trade_id=$1 AND kind='exit'`, [t.id]);
        const clientOrderId = `vedd-perp-x${t.id}-${Number(attempt.rows[0]?.n ?? 0) + 1}`;
        res = await sendMarginOrderIntent(userId, {
          liveTradeId: Number(t.id), kind: 'exit', clientOrderId, ticker: String(t.ticker),
          side, count: Number(t.contracts), price, reduceOnly: true,
        });
      }
      if (res.kind === 'filled') {
        const funding = await fundingHistoryUsd(userId, String(t.ticker), openedMs, Date.now());
        await closeLiveTrade(userId, t, res.avgFillPrice ?? price, why, funding);
        _exitWatermark.delete(Number(t.id));
      } else if (res.kind === 'partial') {
        const remaining = Math.max(0, Number(t.contracts) - res.fillCount);
        await pool.query(`UPDATE kalshi_perp_live_trades SET contracts=$2, notes=COALESCE(notes,'') || ' partial exit fill;' WHERE id=$1`, [t.id, remaining]);
        if (remaining <= 0) {
          const funding = await fundingHistoryUsd(userId, String(t.ticker), openedMs, Date.now());
          await closeLiveTrade(userId, { ...t, contracts: res.fillCount }, res.avgFillPrice ?? price, why, funding);
          _exitWatermark.delete(Number(t.id));
        }
      } else if (res.kind === 'rejected') {
        console.error(`[kalshi-perp-live] exit order rejected for trade ${t.id} (${why}): ${res.code} ${res.message} — will retry next cycle`);
      } else if (res.kind === 'unfilled') {
        // IOC exit simply didn't fill (price moved through the limit).
        // The position stays 'closing'; the order row is terminal, so the
        // next cycle retries with a fresh intent — no double-fire risk.
        console.error(`[kalshi-perp-live] exit order for trade ${t.id} (${why}) did not fill (IOC) — will retry next cycle`);
      } else if (res.kind === 'blocked') {
        console.error(`[kalshi-perp-live] exit order for trade ${t.id} (${why}) blocked: ${res.why}`);
      }
    } catch (e: any) {
      console.error(`[kalshi-perp-live] exit monitor failed for trade ${t.id} (non-fatal):`, e?.message ?? e);
    }
  }
}

// ── entry processing (the full gate chain, in order) ───────────────────────
async function processLiveEntries(
  userId: number, state: PerpLiveState,
  markets: Array<{ ticker: string; status: string; scheduleOpen: boolean; tickSize: number }>,
  pendingCa: Set<string>,
): Promise<void> {
  const block = (reason: string) => { state.lastBlockReason = reason; };
  // Gate 1 — master kill switch (entries only; exits already ran).
  if (!perpLiveEnabled()) return block('kill switch KALSHI_PERP_LIVE=off — entries disabled (exits still monitored)');
  // Gate 2 — auto-pause (the daily-loss half of this gate is checked below,
  // once the day's equity anchor exists).
  if (state.pausedUntilMs > Date.now()) return block(`auto-paused until ${new Date(state.pausedUntilMs).toISOString()}: ${state.pauseReason ?? ''}`);
  // Gate 3 — credentials presence.
  if (!loadKalshiCredentials(userId)) return block('no Kalshi credentials saved for the owner account');
  // Gate 4 — margin enabled, fresh this cycle. Fail closed on any error.
  let marginEnabled = false;
  try { marginEnabled = await getKalshiMarginEnabled(userId); }
  catch (e: any) { state.consecutiveApiErrors++; return block(`margin check failed: ${e?.message ?? e}`); }
  if (!marginEnabled) return block('Kalshi margin is not enabled for this account (/margin/enabled is not true)');
  // Gate 5 — balance/equity readable (sizing depends on it).
  let equityUsd: number | null = null;
  try { equityUsd = (await getKalshiMarginBalance(userId)).equityUsd; }
  catch (e: any) { state.consecutiveApiErrors++; return block(`margin balance read failed: ${e?.message ?? e}`); }
  if (equityUsd == null || !(equityUsd > 0)) return block('margin balance unreadable — cannot size safely');
  // Day anchor + Gate 2b — daily-loss halt (Ruin Guard daily leg shape).
  const today = utcDayKey(Date.now());
  if (state.dayAnchorDate !== today || state.dayAnchorEquityUsd == null) {
    state.dayAnchorDate = today; state.dayAnchorEquityUsd = equityUsd;
  }
  const anchor = state.dayAnchorEquityUsd;
  const { rows: pnlRows } = await pool.query(
    `SELECT COALESCE(sum(net_pnl_usd),0)::float AS realized FROM kalshi_perp_live_trades
      WHERE user_id=$1 AND status='closed' AND closed_at >= $2::date AND net_pnl_usd IS NOT NULL`,
    [userId, today]);
  const realizedToday = Number(pnlRows[0]?.realized) || 0;
  const { rows: openRows } = await pool.query(
    `SELECT * FROM kalshi_perp_live_trades WHERE user_id=$1 AND status IN ('open','closing','pending_entry')`, [userId]);
  // Floating P&L on the lane's open positions, marked the way the panel
  // marks them (long at the bid, short at the ask — the exit side). The
  // halt reads realized + floating, as documented in the header; a trade
  // whose touch is unreadable contributes 0 rather than a guessed number.
  let floatingToday = 0;
  for (const t of openRows as any[]) {
    if ((t.status !== 'open' && t.status !== 'closing') || t.entry_price == null) continue;
    const entry = Number(t.entry_price);
    const contracts = Number(t.contracts);
    if (!(entry > 0) || !(contracts > 0)) continue;
    const touch = await getPerpTouch(String(t.ticker)).catch(() => null);
    if (!touch) continue;
    const mark = t.direction === 'short' ? touch.ask : touch.bid;
    floatingToday += (t.direction === 'short' ? entry - mark : mark - entry) * contracts;
  }
  if (anchor > 0 && realizedToday + floatingToday <= -(DAILY_LOSS_PCT() / 100) * anchor) {
    return block(`daily-loss halt: realized ${realizedToday.toFixed(2)} + floating ${floatingToday.toFixed(2)} today vs −${DAILY_LOSS_PCT()}% of the day's opening equity $${anchor.toFixed(2)}`);
  }
  // Gate 6 — armed strategies (fresh read; unreadable = none armed).
  const armed = await getArmedPerpStrategies(userId);
  if (!armed.size) return block('no perp strategy is armed for live (toggle is off for every strategy)');
  // Candidates: fresh shadow entries from armed strategies, not yet mirrored.
  const { rows: candidates } = await pool.query(
    `SELECT s.* FROM kalshi_perp_shadow_trades s
      LEFT JOIN kalshi_perp_live_trades l ON l.shadow_trade_id = s.id
      WHERE s.user_id=$1 AND s.status='open' AND l.id IS NULL
        AND s.opened_at >= now() - ($2::text || ' minutes')::interval
      ORDER BY s.opened_at ASC LIMIT 10`,
    [userId, String(SIGNAL_MAX_AGE_MIN())]);
  if (!candidates.length) return block('no fresh shadow entries from armed strategies right now');
  // Gate 7 prep — fresh promotion-bar stats for the candidate strategies.
  const closesByStrategy = await loadShadowClosesByStrategy(userId);
  const barByStrategy = new Map<string, PerpPromotionBar>();
  const { rows: orderCountRows } = await pool.query(
    `SELECT count(*)::int AS n FROM kalshi_perp_live_orders WHERE user_id=$1 AND created_at >= $2::date`, [userId, today]);
  let ordersToday = Number(orderCountRows[0]?.n) || 0;
  const marketByTicker = new Map(markets.map((m) => [m.ticker, m]));
  // Caps + the one-position-per-strategy+underlying rule count positions
  // IN FLIGHT ('pending_entry') as well as open ones: an unresolved entry
  // may already be a real position on Kalshi, so it must consume cap and
  // uniqueness exactly like an open row until reconciliation resolves it.
  let openLive = [...openRows];

  for (const s of candidates) {
    const strategy = String(s.strategy);
    if (!armed.has(strategy)) continue;
    if (openLive.length >= MAX_OPEN()) { block(`live cap reached (${MAX_OPEN()} open)`); break; }
    if (ordersToday >= MAX_ORDERS_DAY()) { block(`daily live order cap reached (${MAX_ORDERS_DAY()})`); break; }
    if (openLive.filter((r: any) => r.strategy === strategy).length >= MAX_PER_STRAT()) continue;
    if (openLive.some((r: any) => r.strategy === strategy && r.underlying === s.underlying)) continue;
    // Gate 7 — the promotion bar, on this cycle's fresh stats.
    let bar = barByStrategy.get(strategy);
    if (!bar) { bar = evaluatePerpPromotionBar(closesByStrategy.get(strategy) ?? []); barByStrategy.set(strategy, bar); }
    if (!bar.met) { block(`${strategy} has not cleared the promotion bar (${bar.reasons.join('; ')})`); continue; }
    // Gate 8 — market sanity + price sanity + sizing.
    const mkt = marketByTicker.get(String(s.ticker));
    if (!mkt || mkt.status !== 'active' || !mkt.scheduleOpen) continue;
    if (pendingCa.has(String(s.ticker))) continue;
    const touch = await getPerpTouch(String(s.ticker)).catch(() => null);
    if (!touch || !(touch.ask > touch.bid) || !(touch.bid > 0)) continue;
    const short = s.direction === 'short';
    if (short ? touch.ask >= Number(s.stop_loss) : touch.bid <= Number(s.stop_loss)) continue; // setup already failed
    const entryBasis = short ? touch.bid : touch.ask;
    const sizing = sizeLiveEntry(equityUsd, entryBasis);
    if (sizing.contracts < 1) { block(`${strategy}/${s.ticker}: ${sizing.reason}`); continue; }

    const ins = await pool.query(
      `INSERT INTO kalshi_perp_live_trades (user_id, shadow_trade_id, strategy, ticker, underlying, direction,
         contracts, stop_loss, take_profit, sl_pct, notional_usd, max_hours, entry_client_order_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,0,$10,$11,'pending_entry')
       ON CONFLICT (shadow_trade_id) DO NOTHING RETURNING id`,
      [userId, s.id, strategy, s.ticker, s.underlying, s.direction, s.stop_loss, s.take_profit, s.sl_pct, s.max_hours, `vedd-perp-e${s.id}`]);
    const liveId = ins.rows[0]?.id;
    if (!liveId) continue; // raced with another cycle — the other intent owns it
    ordersToday++;
    const res = await sendMarginOrderIntent(userId, {
      liveTradeId: Number(liveId), kind: 'entry', clientOrderId: `vedd-perp-e${s.id}`,
      ticker: String(s.ticker), side: short ? 'ask' : 'bid', count: sizing.contracts,
      price: entryBasis, tickSize: mkt.tickSize, reduceOnly: false,
    });
    if (res.kind === 'filled' || res.kind === 'partial') {
      const fillPrice = res.avgFillPrice ?? entryBasis;
      const levels = exitLevelsFor(String(s.direction), fillPrice, Number(s.sl_pct));
      await pool.query(
        `UPDATE kalshi_perp_live_trades SET status='open', contracts=$2, entry_price=$3, stop_loss=$4, take_profit=$5,
           notional_usd=$6, entry_order_id=$7, opened_at=now(), last_reconciled_at=now() WHERE id=$1`,
        [liveId, res.fillCount, fillPrice, levels.stop, levels.target, res.fillCount * fillPrice, res.orderId]);
      openLive = [...openLive, { strategy, underlying: String(s.underlying), status: 'open' }];
      console.log(`[kalshi-perp-live] LIVE entry: ${strategy} ${s.direction} ${res.fillCount} × ${s.ticker} @ ${fillPrice}`);
    } else if (res.kind === 'unfilled') {
      await pool.query(`UPDATE kalshi_perp_live_trades SET status='unfilled', closed_at=now(), exit_reason='entry order did not fill (IOC)' WHERE id=$1`, [liveId]);
    } else if (res.kind === 'rejected') {
      await pool.query(`UPDATE kalshi_perp_live_trades SET status='rejected', closed_at=now(), exit_reason=$2 WHERE id=$1`,
        [liveId, `entry rejected: ${res.code} ${res.message}`.slice(0, 300)]);
      block(`${strategy}/${s.ticker} entry rejected by Kalshi: ${res.code} ${res.message}`);
    } else if (res.kind === 'blocked') {
      // Blocked = the order may exist on Kalshi. Count the in-flight row
      // against this cycle's caps/uniqueness so no second candidate for
      // the same strategy+underlying can fire behind it.
      openLive = [...openLive, { strategy, underlying: String(s.underlying), status: 'pending_entry' }];
      block(`${strategy}/${s.ticker}: ${res.why}`);
    }
  }
}

// ── the cycle ──────────────────────────────────────────────────────────────
export async function runKalshiPerpLiveCycle(userId: number): Promise<void> {
  await ensureKalshiPerpLiveTables();
  await ensureKalshiPerpShadowTables();
  const state = await loadPerpLiveState(userId);
  state.lastCycleAt = new Date().toISOString();
  state.lastBlockReason = null;
  let apiFailed = false;

  const hasCreds = !!loadKalshiCredentials(userId);
  const actions = await getPerpCorporateActions().catch(() => []);
  if (hasCreds) {
    // Reconciliation + exits run regardless of the kill switch / pause /
    // halt: real positions are never stranded by a config state.
    try {
      await reconcileLivePositions(userId, state);
    } catch (e: any) {
      apiFailed = true;
      state.lastBlockReason = `position reconciliation failed: ${e?.message ?? e}`;
      console.error('[kalshi-perp-live] reconciliation failed:', e?.message ?? e);
    }
    await monitorLiveExits(userId, actions).catch((e: any) => console.error('[kalshi-perp-live] exit monitor failed (non-fatal):', e?.message ?? e));
  } else {
    state.lastBlockReason = 'no Kalshi credentials saved for the owner account';
  }

  // Entries (the full gate chain lives in processLiveEntries).
  const markets = await getPerpMarkets().catch(() => []);
  const pendingCa = new Set(actions
    .filter((a) => a.status === 'scheduled' && a.effectiveMs != null && a.effectiveMs <= Date.now() + 24 * 3_600_000)
    .map((a) => a.ticker));
  const errorsBefore = state.consecutiveApiErrors;
  await processLiveEntries(userId, state, markets, pendingCa).catch((e: any) => {
    apiFailed = true;
    state.lastBlockReason = `entry processing failed: ${e?.message ?? e}`;
    console.error('[kalshi-perp-live] entry processing failed:', e?.message ?? e);
  });
  if (state.consecutiveApiErrors > errorsBefore) apiFailed = true;

  // Error-storm accounting: a cycle with authenticated-API failures counts
  // ONCE (gates 4/5 already incremented the counter when they failed, and
  // the comparison above flagged the cycle) — a clean cycle resets. ≥3 in
  // a row → entries auto-pause 30 minutes.
  if (apiFailed) {
    if (state.consecutiveApiErrors === errorsBefore) state.consecutiveApiErrors++;
    if (state.consecutiveApiErrors >= ERROR_STORM_LIMIT && state.pausedUntilMs <= Date.now()) {
      state.pausedUntilMs = Date.now() + ERROR_PAUSE_MS;
      state.pauseReason = `Kalshi API error storm (${state.consecutiveApiErrors} consecutive failed cycles)`;
      console.error(`[kalshi-perp-live] AUTO-PAUSED: ${state.pauseReason}`);
    }
  } else if (hasCreds) {
    state.consecutiveApiErrors = 0;
    if (state.pausedUntilMs > 0 && state.pausedUntilMs <= Date.now()) { state.pausedUntilMs = 0; state.pauseReason = null; }
  }
  savePerpLiveState(userId, state);
}

// ── panel report (read-only; reads the same records the lane writes) ──────
export interface KalshiPerpLiveReport {
  enabled: boolean;
  host: 'prod' | 'demo';
  hasCredentials: boolean;
  marginEnabled: boolean | null;
  paused: { active: boolean; reason: string | null; until: string | null };
  lastBlockReason: string | null;
  lastCycleAt: string | null;
  dayAnchorEquityUsd: number | null;
  todayRealizedPnlUsd: number;
  todayOrders: number;
  caps: { maxOpen: number; maxPerStrategy: number; maxOrdersPerDay: number; notionalUsd: number; dailyLossPct: number };
  strategies: Array<{ strategy: string; armed: boolean; bar: PerpPromotionBar }>;
  openPositions: Array<{
    id: number; strategy: string; ticker: string; underlying: string; direction: string; status: string;
    contracts: number; entry_price: number | null; stop_loss: number; take_profit: number;
    opened_at: string | null; current_mark: number | null; unrealized_usd: number | null;
  }>;
  unknownPositions: Array<{ ticker: string; contracts: number; seenAt: string }>;
  recentCloses: Array<{
    id: number; strategy: string; ticker: string; underlying: string; direction: string;
    entry_price: number | null; exit_price: number | null; net_pnl_usd: number | null;
    return_pct: number | null; exit_reason: string | null; closed_at: string | null;
  }>;
}

export async function getKalshiPerpLiveReport(userId: number): Promise<KalshiPerpLiveReport> {
  await ensureKalshiPerpLiveTables();
  const state = await loadPerpLiveState(userId);
  const hasCredentials = !!loadKalshiCredentials(userId);
  let marginEnabled: boolean | null = null;
  if (hasCredentials) {
    marginEnabled = await getKalshiMarginEnabled(userId).catch(() => null);
  }
  const armed = await getArmedPerpStrategies(userId).catch(() => new Set<string>());
  const closesByStrategy = await loadShadowClosesByStrategy(userId).catch(() => new Map<string, PerpPromotionCloses[]>());
  const strategyNames = new Set<string>();
  armed.forEach((s) => strategyNames.add(s));
  closesByStrategy.forEach((_v, k) => strategyNames.add(k));
  const strategies = Array.from(strategyNames).sort().map((strategy) => ({
    strategy,
    armed: armed.has(strategy),
    bar: evaluatePerpPromotionBar(closesByStrategy.get(strategy) ?? []),
  }));
  const today = utcDayKey(Date.now());
  const [openRes, closesRes, pnlRes, ordRes] = await Promise.all([
    pool.query(`SELECT * FROM kalshi_perp_live_trades WHERE user_id=$1 AND status IN ('open','closing','pending_entry') ORDER BY id DESC LIMIT 20`, [userId]),
    pool.query(`SELECT * FROM kalshi_perp_live_trades WHERE user_id=$1 AND status IN ('closed','rejected','unfilled') ORDER BY closed_at DESC NULLS LAST, id DESC LIMIT 10`, [userId]),
    pool.query(`SELECT COALESCE(sum(net_pnl_usd),0)::float AS realized FROM kalshi_perp_live_trades WHERE user_id=$1 AND status='closed' AND closed_at >= $2::date AND net_pnl_usd IS NOT NULL`, [userId, today]),
    pool.query(`SELECT count(*)::int AS n FROM kalshi_perp_live_orders WHERE user_id=$1 AND created_at >= $2::date`, [userId, today]),
  ]);
  const touches = new Map<string, { bid: number; ask: number } | null>();
  await Promise.all(Array.from(new Set(openRes.rows.map((p: any) => String(p.ticker)))).map(async (ticker) => {
    touches.set(ticker, await getPerpTouch(ticker).catch(() => null));
  }));
  const toIso = (v: unknown): string | null => {
    if (v == null) return null;
    const d = v instanceof Date ? v : new Date(String(v));
    return Number.isFinite(d.getTime()) ? d.toISOString() : null;
  };
  return {
    enabled: perpLiveEnabled(),
    host: perpHost().includes('demo') ? 'demo' : 'prod',
    hasCredentials,
    marginEnabled,
    paused: {
      active: state.pausedUntilMs > Date.now(),
      reason: state.pauseReason,
      until: state.pausedUntilMs > 0 ? new Date(state.pausedUntilMs).toISOString() : null,
    },
    lastBlockReason: state.lastBlockReason,
    lastCycleAt: state.lastCycleAt,
    dayAnchorEquityUsd: state.dayAnchorEquityUsd,
    todayRealizedPnlUsd: Number(pnlRes.rows[0]?.realized) || 0,
    todayOrders: Number(ordRes.rows[0]?.n) || 0,
    caps: { maxOpen: MAX_OPEN(), maxPerStrategy: MAX_PER_STRAT(), maxOrdersPerDay: MAX_ORDERS_DAY(), notionalUsd: NOTIONAL(), dailyLossPct: DAILY_LOSS_PCT() },
    strategies,
    openPositions: openRes.rows.map((p: any) => {
      const touch = touches.get(String(p.ticker)) || null;
      const entry = p.entry_price == null ? null : Number(p.entry_price);
      const mark = touch ? (p.direction === 'short' ? touch.ask : touch.bid) : null;
      const unrealized = mark != null && entry != null && entry > 0
        ? (p.direction === 'short' ? entry - mark : mark - entry) * Number(p.contracts)
        : null;
      return {
        id: Number(p.id), strategy: String(p.strategy), ticker: String(p.ticker), underlying: String(p.underlying),
        direction: String(p.direction), status: String(p.status), contracts: Number(p.contracts),
        entry_price: entry, stop_loss: Number(p.stop_loss), take_profit: Number(p.take_profit),
        opened_at: toIso(p.opened_at), current_mark: mark, unrealized_usd: unrealized,
      };
    }),
    unknownPositions: state.unknownPositions ?? [],
    recentCloses: closesRes.rows.map((c: any) => ({
      id: Number(c.id), strategy: String(c.strategy), ticker: String(c.ticker), underlying: String(c.underlying),
      direction: String(c.direction), entry_price: c.entry_price == null ? null : Number(c.entry_price),
      exit_price: c.exit_price == null ? null : Number(c.exit_price),
      net_pnl_usd: c.net_pnl_usd == null ? null : Number(c.net_pnl_usd),
      return_pct: c.return_pct == null ? null : Number(c.return_pct),
      exit_reason: c.exit_reason == null ? null : String(c.exit_reason),
      closed_at: toIso(c.closed_at),
    })),
  };
}

// ── boot wiring (mirrors the shadow lane's starter shape) ──────────────────
let _ownerId: number | null = null;
async function resolveOwnerUserId(): Promise<number | null> {
  if (_ownerId) return _ownerId;
  const env = Number(process.env.KALSHI_STOCK_SHADOW_USER_ID);
  if (Number.isFinite(env) && env > 0) { _ownerId = env; return _ownerId; }
  try {
    const { rows } = await pool.query(`SELECT id FROM users WHERE is_admin = true ORDER BY id LIMIT 1`);
    _ownerId = rows[0]?.id ?? 1;
  } catch { _ownerId = 1; }
  return _ownerId;
}

let _started = false;
/** Start the 1-minute live tick. Idempotent; never throws. The tick runs
 *  even when KALSHI_PERP_LIVE=off so open positions keep their exit
 *  monitoring and reconciliation — the switch gates ENTRIES inside the
 *  cycle, not the safety machinery. */
export function startKalshiPerpLive(): void {
  if (_started) return;
  _started = true;
  const tick = async () => {
    try {
      const uid = await resolveOwnerUserId();
      if (uid) await runKalshiPerpLiveCycle(uid);
    } catch (e: any) { console.error('[kalshi-perp-live] tick failed (non-fatal):', e?.message ?? e); }
  };
  setTimeout(tick, 4 * 60_000).unref?.();
  setInterval(tick, 60_000).unref?.();
  console.log(perpLiveEnabled()
    ? '[kalshi-perp-live] started — LIVE perp lane: entries require arm + promotion bar + margin-enabled, re-verified every cycle.'
    : '[kalshi-perp-live] started with KALSHI_PERP_LIVE=off — entries disabled; exit monitoring + reconciliation active.');
}
