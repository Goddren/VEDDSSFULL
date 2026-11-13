// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp SHADOW lane — Phase 1 (2026-11-08).
// Spec: research_notes/kalshi-stock-perps-recon-20261108.md §3 + §5, plus
// Chris's same-night scope expansion (options + FX strategy evaluation).
//
// Virtual positions on REAL production public market data (kalshi-perps.ts).
// SHADOW ONLY, by construction:
//  • the only data source is kalshi-perps.ts — public, unauthenticated GETs;
//  • this module imports NO authenticated Kalshi client, NO credential
//    store, NO order path — there is nothing here that could place an order;
//  • positions live in kalshi_perp_shadow_trades/_context and touch no real
//    balance, no live Kalshi engine state, no daily counts, no live stats.
//
// Strategies evaluated every cycle (export-don't-copy — the lane calls the
// engines' own runner functions):
//  • Crypto perp runners (via the KALSHI: fetchBars seam in
//    cryptocom-scanner.ts): breakout, trend_following, structure,
//    divergence, order_flow, volume_profile + composite_autonomous
//    (≥2 agree, blended ≥ 72 — the crypto lane's own rule). Crypto
//    'momentum' is OUT (Phase 1.5: its ±3% saturation needs ATR-relative
//    rescaling before its scores mean anything on large-cap stocks).
//  • FX engine mechanical approximations (the 5 of 19 that have deterministic
//    rules — client/src/lib/strategy-spec.ts `approx`): fx_scalping (M5),
//    fx_momentum, fx_aggressive, fx_sniper, fx_prop_firm_sniper (H1),
//    evaluated by the SAME evaluateSpecSignals() the backtester and the
//    live spec runner share. The other 14 FX keys are engine-native AI
//    strategies — no mechanical rules exist in the code to port (see PR).
//  • Options engine underlying-price runners (via an Alpaca-shaped adapter
//    over Kalshi bars): opt_orb, opt_volume_profile, opt_breakout,
//    opt_momentum, opt_order_flow. The chain strategies (covered_call,
//    credit_spread, long_call, long_put) have no runner and no meaning on a
//    perp — excluded. (opt_orb is the options runner's own ORB: immediate
//    volume-confirmed breakout, no retest.)
//  • 'orb' (2026-11-11, Chris's ask): the app's canonical Opening Range
//    Breakout with FX/Studio semantics (kalshi-orb.ts) — 9:30–9:45 AM ET
//    range from 1-min candles, confirmed full-body breakout close, entry
//    only on a retest of the broken level (±25% of range), once per ticker
//    per ET day, 9:30–15:00 ET weekdays. Entries/exits are the lane's own:
//    touch entry, H1-ATR stop (1.5×, clamped 0.8–4%), 2R target, funding +
//    placeholder costs, gap-through resolver. Kill switch for this
//    strategy alone: KALSHI_STOCK_ORB=off (the lane switch still rules).
//
// Stock adaptations (recon §2/§3): ATR stop = 1.5 × H1 ATR clamped to
// 0.8–4% (placeholder the crypto 1.5–12% clamp is far too wide for large
// caps; shadow evidence revises it), target 2R, liquidity gate (active
// PERP/PERP1 equities only, price > 0, 24h volume + OI floors), entries and
// exits priced at the touch (long in at ask / out at bid, short inverse),
// gap-through stop fills, daily funding accrued at 16:00 ET (PINNED
// convention: rate > 0 → longs pay shorts; payment = rate × mark ×
// contracts), corporate-action force-close with the row excluded from
// stats, fees as a stamped placeholder (cost_model='placeholder' until a
// margin-enabled account's real /margin/fee_tiers can replace them), and a
// cost floor: entries skipped when the stop is < 3× round-trip cost.
//
// Caps mirror the crypto shadow lane: 30 open / 3 per strategy / no
// duplicate underlying within a strategy / 60-min re-entry cooldown.
// Entries every 10 min, resolver every 5 min. Kill switch:
// KALSHI_STOCK_SHADOW=off. Runs for the owner account only
// (KALSHI_STOCK_SHADOW_USER_ID, else first admin) — per-user by design so
// the shared shadow_ledger can carry the rows.
//
// Perp brain + volume-profile filter (2026-11-12): the bucket stats below
// now ACT — a candidate whose buckets include an 'avoid' verdict is
// hard-blocked before it opens, every block is audit-logged, and blocks
// lift on their own as the 60-day stats window rolls (kalshi-perp-brain.ts;
// kill switch KALSHI_PERP_BRAIN=off). Each candidate also gets an
// entry-time volume profile (the spec path's own volumeProfileSeries over
// today's ET-session 15m bars): price position is recorded on the context
// row and learned as a 'vp' bucket dimension, and ONE conservative veto
// skips entries pressing into the far value-area edge from inside value
// (kill switch KALSHI_PERP_VP=off).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { ensureKalshiPerpShadowTables } from './ensure-kalshi-perp-shadow-tables';
import {
  getLiquidStockPerps, getPerpCandles, getPerpTouch, getPerpFundingHistory, getPerpFundingEstimate,
  getPerpCorporateActions, getPerpBars, aggregateBars, type PerpBar, type PerpMarket,
} from './kalshi-perps';
import { computeKalshiOrbState, orbEntryDirection, orbAlreadyFiredToday } from './kalshi-orb';
import {
  perpBrainEnabled, perpVpEnabled, evaluatePerpBrainGate, logPerpBrainBlocks,
  getPerpBrainBlockSummary, classifyVpPosition, vpValueEdgeBlock, type VpPosition,
} from './kalshi-perp-brain';

export const stockOrbEnabled = () => process.env.KALSHI_STOCK_ORB !== 'off';

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
export const stockShadowEnabled = () => process.env.KALSHI_STOCK_SHADOW !== 'off';
export const accountSimEnabled = () => process.env.KALSHI_ACCOUNT_SIM !== 'off';
const MAX_OPEN = () => Math.floor(num('KALSHI_STOCK_SHADOW_MAX_OPEN', 30));
const MAX_PER_STRAT = () => Math.floor(num('KALSHI_STOCK_SHADOW_MAX_PER_STRATEGY', 3));
const COOLDOWN_MS = () => num('KALSHI_STOCK_SHADOW_COOLDOWN_MIN', 60) * 60_000;
const EVERY_MS = () => num('KALSHI_STOCK_SHADOW_EVERY_MIN', 10) * 60_000;
const NOTIONAL = () => num('KALSHI_STOCK_SHADOW_NOTIONAL_USD', 250);
const MIN_CONF = () => num('KALSHI_STOCK_SHADOW_MIN_CONFIDENCE', 70);
const FEE_BPS = () => num('KALSHI_STOCK_SHADOW_FEE_BPS', 20); // round-trip placeholder taker cost
const SL_LO = () => num('KALSHI_STOCK_SHADOW_SL_MIN_PCT', 0.8);
const SL_HI = () => num('KALSHI_STOCK_SHADOW_SL_MAX_PCT', 4);
const ATR_MULT = () => num('KALSHI_STOCK_SHADOW_SL_ATR_MULT', 1.5);
const RR = () => num('KALSHI_STOCK_SHADOW_RR', 2);

const CRYPTO_PORTS = ['breakout', 'trend_following', 'structure', 'divergence', 'order_flow', 'volume_profile'] as const;
const OPTIONS_PORTS = ['orb', 'volume_profile', 'breakout', 'momentum', 'order_flow'] as const;

// ── ET session helpers ──────────────────────────────────────────────────────
const etFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' });
function etParts(ts: number): { hour: number; minute: number; dow: number } {
  const parts = etFmt.formatToParts(new Date(ts));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: Number(g('hour')) % 24, minute: Number(g('minute')), dow: dowMap[g('weekday')] ?? 0 };
}
export function sessionEt(ts: number): string {
  const { hour, minute } = etParts(ts);
  const m = hour * 60 + minute;
  if (m >= 240 && m < 570) return 'premarket';
  if (m >= 570 && m < 960) return 'regular';
  if (m >= 960 && m < 1200) return 'after_hours';
  return 'overnight';
}

// ── small indicator helpers (lane-local, same shape as crypto-shadow.ts) ────
function ema(vals: number[], n: number): number | null {
  if (vals.length < n) return null;
  const k = 2 / (n + 1); let e = vals.slice(0, n).reduce((a, b) => a + b, 0) / n;
  for (let i = n; i < vals.length; i++) e = vals[i] * k + e * (1 - k);
  return e;
}
function trendOf(closes: number[], fast: number, slow: number): string | null {
  const f = ema(closes, fast), s = ema(closes, slow);
  if (f == null || s == null) return null;
  return f > s * 1.002 ? 'BULLISH' : f < s * 0.998 ? 'BEARISH' : 'NEUTRAL';
}
function atrOf(bars: Array<{ h: number; l: number; c: number }>, n = 14): number | null {
  if (bars.length < n + 1) return null;
  const trs: number[] = [];
  for (let i = bars.length - n; i < bars.length; i++) {
    const b = bars[i], pc = bars[i - 1].c;
    trs.push(Math.max(b.h - b.l, Math.abs(b.h - pc), Math.abs(b.l - pc)));
  }
  return trs.reduce((a, b) => a + b, 0) / n;
}

// ── bucket stats (fork of the crypto/sol machinery, stock buckets) ──────────
export function kalshiBucketsOf(c: {
  session_et?: string | null; ticker?: string | null; spread_bps?: number | null; atr_pct?: number | null;
  funding_rate_at_entry?: number | null; htf_aligned?: boolean | null; direction?: string | null; hour_et?: number | null;
  vp_position?: string | null;
}): Record<string, string> {
  const b: Record<string, string> = {};
  if (c.session_et) b.session = c.session_et;
  if (c.ticker) b.ticker = c.ticker;
  if (c.direction) b.side = c.direction;
  if (c.spread_bps != null) b.spread = c.spread_bps < 10 ? '<10bps' : c.spread_bps < 25 ? '10-25bps' : c.spread_bps < 50 ? '25-50bps' : '50bps+';
  if (c.atr_pct != null) b.volatility = c.atr_pct < 0.5 ? 'atr<0.5%' : c.atr_pct < 1 ? 'atr0.5-1%' : c.atr_pct < 2 ? 'atr1-2%' : 'atr2%+';
  if (c.funding_rate_at_entry != null) b.funding = c.funding_rate_at_entry < 0 ? 'negative' : c.funding_rate_at_entry > 0 ? 'positive' : 'zero';
  if (c.htf_aligned != null) b.htf = c.htf_aligned ? 'aligned' : 'against';
  if (c.hour_et != null) { const s = Math.floor(c.hour_et / 4) * 4; b.hourEt = `${String(s).padStart(2, '0')}-${String(s + 4).padStart(2, '0')}ET`; }
  // Volume-profile position at entry (perp-brain build). Rows written
  // before the build have no vp_position and contribute no 'vp' bucket —
  // the dimension only learns from this build forward.
  if (c.vp_position) b.vp = c.vp_position;
  return b;
}
export interface KalshiBucketStat { strategy: string; dim: string; bucket: string; n: number; medianNet: number; winRate: number; verdict: 'favor' | 'avoid' | 'learning' }
function quantile(s: number[], q: number) { if (!s.length) return 0; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
export function aggregateKalshiStats(rows: any[]): KalshiBucketStat[] {
  const g = new Map<string, number[]>();
  for (const r of rows) {
    const v = Number(r.net_pct); if (!Number.isFinite(v)) continue;
    for (const [dim, bucket] of Object.entries({ ...kalshiBucketsOf(r), all: 'all' })) {
      const k = `${r.strategy}|${dim}|${bucket}`; (g.get(k) ?? g.set(k, []).get(k)!).push(v);
    }
  }
  const minN = num('KALSHI_STOCK_SHADOW_STATS_MIN_N', 15), fav = num('KALSHI_STOCK_SHADOW_FAVOR_MEDIAN_PCT', 0.5), avd = num('KALSHI_STOCK_SHADOW_AVOID_MEDIAN_PCT', 1);
  return Array.from(g.entries()).map(([k, v]) => {
    const [strategy, dim, bucket] = k.split('|'); const s = v.slice().sort((a, b) => a - b); const med = quantile(s, 0.5);
    const verdict: KalshiBucketStat['verdict'] = s.length >= minN ? (med > fav ? 'favor' : med < -avd ? 'avoid' : 'learning') : 'learning';
    return { strategy, dim, bucket, n: s.length, medianNet: med, winRate: s.filter((x) => x > 0).length / s.length, verdict };
  });
}
const _statsCache = new Map<number, { at: number; stats: KalshiBucketStat[] }>();
export async function computeKalshiStockShadowStats(userId: number, force = false): Promise<KalshiBucketStat[]> {
  const hit = _statsCache.get(userId);
  if (!force && hit && Date.now() - hit.at < 15 * 60_000) return hit.stats;
  await ensureKalshiPerpShadowTables();
  const { rows } = await pool.query(
    `SELECT c.strategy, c.ticker, c.direction, c.session_et, c.spread_bps, c.atr_pct, c.funding_rate_at_entry, c.htf_aligned, c.hour_et, c.vp_position, c.net_pct
       FROM kalshi_perp_shadow_context c JOIN kalshi_perp_shadow_trades t ON t.id = c.trade_id
      WHERE c.user_id=$1 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL AND t.exclude_from_stats IS NOT TRUE
        AND c.closed_at >= now() - interval '60 days'`, [userId]);
  const stats = aggregateKalshiStats(rows);
  _statsCache.set(userId, { at: Date.now(), stats });
  return stats;
}
export interface KalshiStockShadowSummary {
  openCount: number;
  closedCount: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  estNetPnlUsd: number;
  fundingUsd: number;
  lastOpenedAt: string | null;
  lastClosedAt: string | null;
  enabled: boolean;
}

export interface KalshiStockShadowStrategyStat {
  strategy: string;
  trades: number;
  wins: number;
  winRate: number;
  avgR: number | null;
  avgNetPct: number;
  estNetPnlUsd: number;
  fundingUsd: number;
  // $100-account illustration for THIS strategy alone (accountReplay over its
  // own closes, each strategy starting independently at $100). Absent when
  // KALSHI_ACCOUNT_SIM=off; null when the strategy has no closes.
  accountEnd?: number | null;
  accountReturnPct?: number | null;
}

export interface KalshiStockShadowOpenPosition {
  id: number;
  strategy: string;
  ticker: string;
  underlying: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  contracts: number;
  notional_usd: number;
  funding_accrued_usd: number;
  score: number | null;
  max_hours: number;
  opened_at: string;
  current_mark: number | null;
  unrealized_net_pct: number | null;
}

export interface KalshiStockShadowRecentClose {
  id: number;
  strategy: string;
  ticker: string;
  underlying: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  return_pct: number;
  r_multiple: number | null;
  funding_accrued_usd: number;
  exit_reason: string | null;
  hold_minutes: number | null;
  closed_at: string;
}

export interface KalshiPerpBrainPanelReport {
  enabled: boolean;
  vpEnabled: boolean;
  /** Brain 'avoid'-verdict blocks logged in the selected window. */
  blocksInWindow: number;
  /** Volume-profile value-edge skips logged in the selected window. */
  vpSkipsInWindow: number;
  /** Current 60-day verdict map: setup buckets (the per-strategy 'all' row
   *  excluded) carrying a favor / avoid verdict right now. */
  favorBuckets: number;
  avoidBuckets: number;
  topBlocks: Array<{
    strategy: string;
    underlying: string | null;
    ticker: string;
    direction: string | null;
    dim: string;
    bucket: string;
    blocks: number;
    medianNetPct: number | null;
    bucketN: number | null;
  }>;
}

export interface KalshiStockShadowReport {
  days: number;
  summary: KalshiStockShadowSummary;
  byStrategy: KalshiStockShadowStrategyStat[];
  openPositions: KalshiStockShadowOpenPosition[];
  recentCloses: KalshiStockShadowRecentClose[];
  // $100-account illustration over the window's closes. Absent when
  // KALSHI_ACCOUNT_SIM=off (the client then hides the block).
  accountSim?: KalshiAccountSimResult;
  // Perp-brain audit summary: what the brain blocked in the window and how
  // the current verdict map stands (kalshi-perp-brain.ts).
  perpBrain: KalshiPerpBrainPanelReport;
}

export interface KalshiAccountSimResult {
  startBalance: number;
  endBalance: number;
  totalReturnPct: number;
  trades: number;
  maxDrawdownPct: number;
  worstTradePct: number | null;
  bestTradePct: number | null;
}

/**
 * Pure $100-account replay over closed shadow trades, in the order they
 * closed: each close moves the WHOLE running balance by that trade's NET
 * return_pct (already net of funding + modeled costs), one trade at a time.
 * Deterministic and DB-free so it can be unit-tested directly.
 *
 * Illustration, not an account history: the live lane can hold several
 * positions at once at a fixed ~$250 notional, while this replay applies
 * each result to the full balance sequentially — that is the honest,
 * easy-to-read version of "what would these results have done to $100".
 */
export function accountReplay(
  closes: Array<number | { return_pct: number }>,
  startBalance = 100,
): KalshiAccountSimResult {
  const start = Number.isFinite(startBalance) && startBalance > 0 ? startBalance : 100;
  let balance = start;
  let peak = start;
  let maxDrawdownPct = 0;
  let worstTradePct: number | null = null;
  let bestTradePct: number | null = null;
  let trades = 0;
  for (const close of closes) {
    const pct = typeof close === 'number' ? close : Number((close as { return_pct: number })?.return_pct);
    if (!Number.isFinite(pct)) continue;
    balance += (balance * pct) / 100;
    trades++;
    if (balance > peak) peak = balance;
    if (peak > 0) maxDrawdownPct = Math.max(maxDrawdownPct, ((peak - balance) / peak) * 100);
    worstTradePct = worstTradePct == null ? pct : Math.min(worstTradePct, pct);
    bestTradePct = bestTradePct == null ? pct : Math.max(bestTradePct, pct);
  }
  return {
    startBalance: start,
    endBalance: balance,
    totalReturnPct: ((balance - start) / start) * 100,
    trades,
    maxDrawdownPct,
    worstTradePct,
    bestTradePct,
  };
}

const toIso = (v: unknown): string | null => {
  if (v == null) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
};

/**
 * Read-only report for the dedicated Kalshi stock-perp shadow panel.
 *
 * Semantics are deliberately aligned with closeTrade(): return_pct is NET
 * (gross move + signed funding P&L - modeled round-trip cost), and
 * funding_accrued_usd is itself a signed P&L contribution. Corporate-action
 * closes carry exclude_from_stats=true and are omitted from every statistic
 * and list below. SELECTs only — this function never resolves or mutates a
 * shadow position.
 */
export async function getKalshiStockShadowReport(userId: number, days = 30): Promise<KalshiStockShadowReport> {
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(365, Math.floor(days))) : 30;
  await ensureKalshiPerpShadowTables();

  const validCloseWhere = `user_id=$1 AND status='closed' AND exclude_from_stats IS NOT TRUE
    AND return_pct IS NOT NULL AND closed_at >= now() - ($2::int * interval '1 day')`;
  const simOn = accountSimEnabled();
  const [summaryRes, byStrategyRes, openRes, recentClosesRes, closesRes] = await Promise.all([
    pool.query(
      `WITH valid_closes AS (
         SELECT * FROM kalshi_perp_shadow_trades WHERE ${validCloseWhere}
       )
       SELECT
         (SELECT count(*)::int FROM kalshi_perp_shadow_trades WHERE user_id=$1 AND status='open') AS open_count,
         count(*)::int AS closed_count,
         (count(*) FILTER (WHERE return_pct > 0))::int AS wins,
         CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE return_pct > 0))::float / count(*)::float END AS win_rate,
         avg(r_multiple)::float AS avg_r,
         COALESCE(sum(notional_usd * return_pct / 100), 0)::float AS est_net_pnl_usd,
         COALESCE(sum(funding_accrued_usd), 0)::float AS funding_usd,
         (SELECT max(opened_at) FROM kalshi_perp_shadow_trades
           WHERE user_id=$1 AND (status='open' OR opened_at >= now() - ($2::int * interval '1 day'))) AS last_opened_at,
         max(closed_at) AS last_closed_at
       FROM valid_closes`,
      [userId, windowDays]),
    pool.query(
      `SELECT strategy,
         count(*)::int AS trades,
         (count(*) FILTER (WHERE return_pct > 0))::int AS wins,
         ((count(*) FILTER (WHERE return_pct > 0))::float / count(*)::float) AS win_rate,
         avg(r_multiple)::float AS avg_r,
         avg(return_pct)::float AS avg_net_pct,
         COALESCE(sum(notional_usd * return_pct / 100), 0)::float AS est_net_pnl_usd,
         COALESCE(sum(funding_accrued_usd), 0)::float AS funding_usd
       FROM kalshi_perp_shadow_trades
       WHERE ${validCloseWhere}
       GROUP BY strategy
       ORDER BY trades DESC, strategy ASC`,
      [userId, windowDays]),
    pool.query(
      `SELECT id, strategy, ticker, underlying, direction, entry_price, stop_loss, take_profit,
         contracts, notional_usd, funding_accrued_usd, score, max_hours, opened_at, cost_bps
       FROM kalshi_perp_shadow_trades
       WHERE user_id=$1 AND status='open'
       ORDER BY opened_at DESC
       LIMIT 30`,
      [userId]),
    pool.query(
      `SELECT t.id, t.strategy, t.ticker, t.underlying, t.direction, t.entry_price, t.exit_price,
         t.return_pct, t.r_multiple, t.funding_accrued_usd, t.exit_reason, c.hold_minutes, t.closed_at
       FROM kalshi_perp_shadow_trades t
       LEFT JOIN kalshi_perp_shadow_context c ON c.trade_id=t.id AND c.user_id=t.user_id
       WHERE t.user_id=$1 AND t.status='closed' AND t.exclude_from_stats IS NOT TRUE
         AND t.return_pct IS NOT NULL AND t.closed_at >= now() - ($2::int * interval '1 day')
       ORDER BY t.closed_at DESC
       LIMIT 10`,
      [userId, windowDays]),
    // Every valid close in the window, oldest first, for the $100-account
    // replay (the recent-closes list above is capped at 10 — never reuse it).
    // Same validCloseWhere, so corporate-action rows stay excluded.
    simOn
      ? pool.query(
        `SELECT strategy, return_pct::float AS return_pct, closed_at
         FROM kalshi_perp_shadow_trades
         WHERE ${validCloseWhere}
         ORDER BY closed_at ASC, id ASC`,
        [userId, windowDays])
      : Promise.resolve(null),
  ]);

  const s = summaryRes.rows[0] || {};
  const openRows: any[] = openRes.rows || [];

  // Current exit marks are a display enhancement, never a panel dependency:
  // one fail-soft public orderbook read per distinct ticker (longs mark to
  // the bid they would exit at; shorts mark to the ask). Any failure leaves
  // that position's mark and unrealized estimate null.
  const touches = new Map<string, { bid: number; ask: number } | null>();
  await Promise.all(Array.from(new Set(openRows.map((p) => String(p.ticker)))).map(async (ticker) => {
    touches.set(ticker, await getPerpTouch(ticker).catch(() => null));
  }));

  const openPositions = openRows.map((p: any): KalshiStockShadowOpenPosition => {
    const touch = touches.get(String(p.ticker)) || null;
    const entry = Number(p.entry_price);
    const currentMark = touch ? (p.direction === 'short' ? touch.ask : touch.bid) : null;
    let unrealizedNetPct: number | null = null;
    if (currentMark != null && entry > 0) {
      const grossPct = p.direction === 'short'
        ? ((entry - currentMark) / entry) * 100
        : ((currentMark - entry) / entry) * 100;
      const fundingPct = Number(p.notional_usd) > 0
        ? (Number(p.funding_accrued_usd) / Number(p.notional_usd)) * 100
        : 0;
      unrealizedNetPct = grossPct + fundingPct - (Number(p.cost_bps) || 0) / 100;
    }
    return {
      id: Number(p.id),
      strategy: String(p.strategy),
      ticker: String(p.ticker),
      underlying: String(p.underlying),
      direction: String(p.direction),
      entry_price: Number(p.entry_price),
      stop_loss: Number(p.stop_loss),
      take_profit: Number(p.take_profit),
      contracts: Number(p.contracts),
      notional_usd: Number(p.notional_usd),
      funding_accrued_usd: Number(p.funding_accrued_usd) || 0,
      score: p.score == null ? null : Number(p.score),
      max_hours: Number(p.max_hours),
      opened_at: toIso(p.opened_at) || new Date(0).toISOString(),
      current_mark: currentMark,
      unrealized_net_pct: unrealizedNetPct,
    };
  });

  // $100-account replays: one over the whole window, plus one per strategy
  // (each strategy independently starts at $100 — an illustration per
  // strategy, not a split of one account).
  const windowCloses: Array<{ strategy: string; return_pct: number }> =
    ((closesRes as any)?.rows || []).map((r: any) => ({ strategy: String(r.strategy), return_pct: Number(r.return_pct) }));
  const accountSim = simOn ? accountReplay(windowCloses) : undefined;
  const perStrategySim = new Map<string, KalshiAccountSimResult>();
  if (simOn) {
    const grouped = new Map<string, Array<{ return_pct: number }>>();
    for (const c of windowCloses) {
      const list = grouped.get(c.strategy) ?? [];
      list.push({ return_pct: c.return_pct });
      grouped.set(c.strategy, list);
    }
    grouped.forEach((list, strategy) => perStrategySim.set(strategy, accountReplay(list)));
  }

  // Perp-brain audit summary for the panel: what the brain stopped in this
  // window, and how the current 60-day verdict map stands. Fail-soft — the
  // panel must render even if the block log or stats are unreachable.
  const brainBlockSummary = await getPerpBrainBlockSummary(userId, windowDays).catch(() => null);
  let favorBuckets = 0;
  let avoidBuckets = 0;
  try {
    const statsNow = await computeKalshiStockShadowStats(userId);
    for (const s of statsNow) {
      if (s.dim === 'all') continue; // the strategy-overall row is not a setup bucket
      if (s.verdict === 'favor') favorBuckets++;
      else if (s.verdict === 'avoid') avoidBuckets++;
    }
  } catch { /* verdict counts are panel decoration; the gate itself re-reads stats in the lane */ }
  const perpBrain: KalshiPerpBrainPanelReport = {
    enabled: perpBrainEnabled(),
    vpEnabled: perpVpEnabled(),
    blocksInWindow: brainBlockSummary?.brainBlocks ?? 0,
    vpSkipsInWindow: brainBlockSummary?.vpSkips ?? 0,
    favorBuckets,
    avoidBuckets,
    topBlocks: brainBlockSummary?.topBlocks ?? [],
  };

  return {
    days: windowDays,
    ...(accountSim ? { accountSim } : {}),
    perpBrain,
    summary: {
      openCount: Number(s.open_count) || 0,
      closedCount: Number(s.closed_count) || 0,
      wins: Number(s.wins) || 0,
      winRate: s.win_rate == null ? null : Number(s.win_rate),
      avgR: s.avg_r == null ? null : Number(s.avg_r),
      estNetPnlUsd: Number(s.est_net_pnl_usd) || 0,
      fundingUsd: Number(s.funding_usd) || 0,
      lastOpenedAt: toIso(s.last_opened_at),
      lastClosedAt: toIso(s.last_closed_at),
      enabled: stockShadowEnabled(),
    },
    byStrategy: (byStrategyRes.rows || []).map((r: any): KalshiStockShadowStrategyStat => {
      const strategy = String(r.strategy);
      const sim = simOn ? perStrategySim.get(strategy) : undefined;
      return {
        strategy,
        trades: Number(r.trades) || 0,
        wins: Number(r.wins) || 0,
        winRate: Number(r.win_rate) || 0,
        avgR: r.avg_r == null ? null : Number(r.avg_r),
        avgNetPct: Number(r.avg_net_pct) || 0,
        estNetPnlUsd: Number(r.est_net_pnl_usd) || 0,
        fundingUsd: Number(r.funding_usd) || 0,
        ...(simOn ? {
          accountEnd: sim ? sim.endBalance : null,
          accountReturnPct: sim ? sim.totalReturnPct : null,
        } : {}),
      };
    }),
    openPositions,
    recentCloses: (recentClosesRes.rows || []).map((r: any): KalshiStockShadowRecentClose => ({
      id: Number(r.id),
      strategy: String(r.strategy),
      ticker: String(r.ticker),
      underlying: String(r.underlying),
      direction: String(r.direction),
      entry_price: Number(r.entry_price),
      exit_price: r.exit_price == null ? null : Number(r.exit_price),
      return_pct: Number(r.return_pct),
      r_multiple: r.r_multiple == null ? null : Number(r.r_multiple),
      funding_accrued_usd: Number(r.funding_accrued_usd) || 0,
      exit_reason: r.exit_reason == null ? null : String(r.exit_reason),
      hold_minutes: r.hold_minutes == null ? null : Number(r.hold_minutes),
      closed_at: toIso(r.closed_at) || new Date(0).toISOString(),
    })),
  };
}

function adviceFor(stats: KalshiBucketStat[], strategy: string, ctx: Parameters<typeof kalshiBucketsOf>[0]): string {
  const bs = kalshiBucketsOf(ctx);
  const hits = stats.filter((s) => s.strategy === strategy && s.verdict !== 'learning' && bs[s.dim] === s.bucket);
  if (!hits.length) return 'learning';
  const avoid = hits.filter((s) => s.verdict === 'avoid');
  const f = (s: KalshiBucketStat) => `${s.verdict}: ${s.dim} ${s.bucket} (n=${s.n}, median ${s.medianNet.toFixed(1)}%)`;
  return `${avoid.length ? 'avoid' : 'favor'} — ${[...avoid, ...hits.filter((s) => s.verdict === 'favor')].map(f).join('; ')}`.slice(0, 500);
}

// ── FX mechanical approximations (data mirrors of the client `approx` specs;
//    evaluated by the server's own evaluateSpecSignals — no rule copies) ─────
type SpecLike = import('./strategy-spec').StrategySpec;
const emaTrend = (fast: number, slow: number) => ([
  { id: 'emaFast', kind: 'EMA' as const, period: fast },
  { id: 'emaSlow', kind: 'EMA' as const, period: slow },
]);
const crossUp = { indicatorId: 'emaFast', field: 'value' as const, operator: 'crosses_above' as const, compare: { kind: 'indicator' as const, indicatorId: 'emaSlow', field: 'value' as const } };
const crossDown = { indicatorId: 'emaFast', field: 'value' as const, operator: 'crosses_below' as const, compare: { kind: 'indicator' as const, indicatorId: 'emaSlow', field: 'value' as const } };
const rsiAbove = (v: number) => ({ indicatorId: 'rsi', field: 'value' as const, operator: 'above' as const, compare: { kind: 'value' as const, value: v } });
const rsiBelow = (v: number) => ({ indicatorId: 'rsi', field: 'value' as const, operator: 'below' as const, compare: { kind: 'value' as const, value: v } });
const rsiCrossUp = (v: number) => ({ indicatorId: 'rsi', field: 'value' as const, operator: 'crosses_above' as const, compare: { kind: 'value' as const, value: v } });
const rsiCrossDown = (v: number) => ({ indicatorId: 'rsi', field: 'value' as const, operator: 'crosses_below' as const, compare: { kind: 'value' as const, value: v } });
const emaAbove = { indicatorId: 'emaFast', field: 'value' as const, operator: 'above' as const, compare: { kind: 'indicator' as const, indicatorId: 'emaSlow', field: 'value' as const } };
const emaBelow = { indicatorId: 'emaFast', field: 'value' as const, operator: 'below' as const, compare: { kind: 'indicator' as const, indicatorId: 'emaSlow', field: 'value' as const } };

function fxSpec(key: string, name: string, timeframe: 'M5' | 'H1', indicators: any[], long: any[], short: any[], symbol: string): SpecLike {
  return {
    name: `${name} (mechanical approximation)`, source: 'engine', engineStrategyKey: key, symbol, timeframe,
    indicators, entryLong: { logic: 'AND', conditions: long }, entryShort: { logic: 'AND', conditions: short },
    risk: { lotSize: 0.1 },
  } as SpecLike;
}
const FX_PORTS: Array<{ id: string; tf: '5m' | '1h'; bars: number; make: (symbol: string) => SpecLike }> = [
  { id: 'fx_scalping', tf: '5m', bars: 60, make: (s) => fxSpec('scalping', 'Scalping', 'M5', emaTrend(5, 13), [crossUp], [crossDown], s) },
  { id: 'fx_momentum', tf: '1h', bars: 120, make: (s) => fxSpec('momentum', 'Momentum Surfing', 'H1', [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI' as const, period: 14 }], [crossUp, rsiAbove(50)], [crossDown, rsiBelow(50)], s) },
  { id: 'fx_aggressive', tf: '1h', bars: 120, make: (s) => fxSpec('aggressive', 'Aggressive Compound', 'H1', [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI' as const, period: 14 }], [crossUp, rsiAbove(50)], [crossDown, rsiBelow(50)], s) },
  { id: 'fx_sniper', tf: '1h', bars: 120, make: (s) => fxSpec('sniper', 'Sniper Mode', 'H1', [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI' as const, period: 14 }], [emaAbove, rsiCrossUp(40)], [emaBelow, rsiCrossDown(60)], s) },
  { id: 'fx_prop_firm_sniper', tf: '1h', bars: 120, make: (s) => fxSpec('prop_firm_sniper', 'Prop Firm Sniper', 'H1', [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI' as const, period: 14 }], [emaAbove, rsiCrossUp(35)], [emaBelow, rsiCrossDown(65)], s) },
];

// ── options adapter: AlpacaService-shaped reads over Kalshi bars ───────────
function optionsAdapter(ticker: string): any {
  const inRange = (bars: PerpBar[], start: Date, end: Date) => bars.filter((b) => b.t >= start.getTime() && b.t < end.getTime());
  const shape = (bars: PerpBar[], limit: number) => bars.slice(-limit).map((b) => ({ t: new Date(b.t).toISOString(), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.c, n: 0 }));
  return {
    getBars: async (_sym: string, timeframe: string, start: Date, end: Date, limit = 1000) => {
      const spanMin = Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000));
      if (timeframe === '1Day') return shape(inRange(await getPerpCandles(ticker, 1440, Math.min(5000, spanMin + 1440)), start, end), limit);
      if (timeframe === '5Min') return shape(inRange(aggregateBars(await getPerpCandles(ticker, 1, Math.min(5000, spanMin + 30)), 5), start, end), limit);
      return shape(inRange(await getPerpCandles(ticker, 1, Math.min(5000, spanMin + 30)), start, end), limit);
    },
    getSnapshot: async (_sym: string) => {
      const daily = await getPerpCandles(ticker, 1440, 5000);
      if (daily.length < 2) return null;
      const prevClose = daily[daily.length - 2].c;
      const touch = await getPerpTouch(ticker);
      const price = touch ? (touch.bid + touch.ask) / 2 : daily[daily.length - 1].c;
      if (!(prevClose > 0) || !(price > 0)) return null;
      return { price, prevClose, dailyChangePercent: ((price - prevClose) / prevClose) * 100 };
    },
  };
}
const OPTIONS_CFG: any = {
  orbRangeMinutes: 15, volumeProfileLookbackDays: 10, breakoutLookbackDays: 20,
  directionFilter: 'both', strikeSelectionMode: 'atm', targetDelta: 0.3, expiryPreference: 'weekly',
};

// ── funding accrual ─────────────────────────────────────────────────────────
/** Accrue every funding event crossed since the trade's watermark.
 *  PINNED convention: rate > 0 → longs pay. Payment (P&L) for a LONG is
 *  −rate × mark × contracts; a SHORT receives it. */
async function accrueFunding(t: any): Promise<number> {
  const since = Math.max(new Date(t.opened_at).getTime(), Number(t.funding_through_ms) || 0);
  const rates = await getPerpFundingHistory(t.ticker).catch(() => []);
  let accrued = Number(t.funding_accrued_usd) || 0;
  let through = since;
  for (const r of rates) {
    if (r.fundingTimeMs <= since || r.fundingTimeMs > Date.now()) continue;
    const notionalAtFunding = r.markPrice * Number(t.contracts);
    accrued += (t.direction === 'long' ? -1 : 1) * r.rate * notionalAtFunding;
    through = Math.max(through, r.fundingTimeMs);
  }
  if (through !== since) {
    await pool.query(`UPDATE kalshi_perp_shadow_trades SET funding_accrued_usd=$2, funding_through_ms=$3 WHERE id=$1`, [t.id, accrued, through]);
  }
  return accrued;
}

// ── resolver ────────────────────────────────────────────────────────────────
async function closeTrade(t: any, exit: number | null, why: string, fundingUsd: number, exclude: boolean): Promise<boolean> {
  const short = t.direction === 'short';
  const gross = exit != null ? ((short ? t.entry_price - exit : exit - t.entry_price) / t.entry_price) * 100 : null;
  const fundingPct = gross != null && t.notional_usd > 0 ? (fundingUsd / t.notional_usd) * 100 : null;
  const net = gross != null ? gross + (fundingPct ?? 0) - Number(t.cost_bps) / 100 : null;
  const r = net != null && t.sl_pct > 0 ? net / t.sl_pct : null;
  const upd = await pool.query(
    `UPDATE kalshi_perp_shadow_trades SET status='closed', exit_price=$2, exit_reason=$3, gross_return_pct=$4, return_pct=$5,
       r_multiple=$6, funding_accrued_usd=$7, exclude_from_stats=$8, closed_at=now() WHERE id=$1 AND status='open'`,
    [t.id, exit, why, gross, net, r, fundingUsd, exclude]);
  if (!upd.rowCount) return false;
  const ageH = (Date.now() - new Date(t.opened_at).getTime()) / 3_600_000;
  await pool.query(`UPDATE kalshi_perp_shadow_context SET closed_at=now(), exit_reason=$2, hold_minutes=$3, net_pct=$4, funding_paid_usd=$5 WHERE trade_id=$1`,
    [t.id, why, ageH * 60, exclude ? null : net, fundingUsd]).catch(() => {});
  return true;
}

export async function resolveKalshiStockShadowTrades(userId: number): Promise<number> {
  await ensureKalshiPerpShadowTables();
  const { rows } = await pool.query(`SELECT * FROM kalshi_perp_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  if (!rows.length) return 0;
  const actions = await getPerpCorporateActions().catch(() => []);
  let closed = 0;
  for (const t of rows) {
    const funding = await accrueFunding(t).catch(() => Number(t.funding_accrued_usd) || 0);
    const openedMs = new Date(t.opened_at).getTime();
    // Corporate action that became effective while the position was open:
    // force-close at the last mark and exclude the row from stats — the
    // price series itself adjusts across the action, so any "return"
    // spanning it is fiction.
    const ca = actions.find((a) => a.ticker === t.ticker && a.status !== 'cancelled' && a.status !== 'lapsed'
      && a.effectiveMs != null && a.effectiveMs > openedMs && a.effectiveMs <= Date.now());
    const minsSinceOpen = Math.max(1, Math.min(5000, Math.ceil((Date.now() - openedMs) / 60_000) + 5));
    const candles = await getPerpCandles(t.ticker, 1, minsSinceOpen).catch(() => [] as PerpBar[]);
    const latest = candles[candles.length - 1];
    if (ca) {
      if (await closeTrade(t, latest ? latest.c : Number(t.entry_price), 'corporate_action', funding, true)) closed++;
      continue;
    }
    const short = t.direction === 'short';
    const ageH = (Date.now() - openedMs) / 3_600_000;
    let exit: number | null = null, why = '';
    if (candles.length) {
      // Walk the candles since entry for the first stop/target touch, priced
      // at the touch (long exits on the bid series, short on the ask).
      for (const cd of candles) {
        if (cd.t + 60_000 <= openedMs) continue;
        const gain = short ? ((t.entry_price - cd.ask.l) / t.entry_price) * 100 : ((cd.bid.h - t.entry_price) / t.entry_price) * 100;
        if (t.peak_gain_pct == null || gain > t.peak_gain_pct) {
          await pool.query(`UPDATE kalshi_perp_shadow_trades SET peak_gain_pct=$2 WHERE id=$1`, [t.id, gain]).catch(() => {});
          t.peak_gain_pct = gain;
        }
        if (short ? cd.ask.h >= t.stop_loss : cd.bid.l <= t.stop_loss) {
          exit = short ? Math.max(t.stop_loss, cd.ask.o) : Math.min(t.stop_loss, cd.bid.o); why = 'stop'; break;
        }
        if (short ? cd.ask.l <= t.take_profit : cd.bid.h >= t.take_profit) { exit = Number(t.take_profit); why = 'target'; break; }
      }
      if (!why && ageH >= t.max_hours) {
        const touch = await getPerpTouch(t.ticker).catch(() => null);
        exit = touch ? (short ? touch.ask : touch.bid) : latest.c; why = 'time limit';
      }
    } else if (ageH >= t.max_hours + 24) { exit = null; why = 'no price'; }
    if (!why) continue;
    if (await closeTrade(t, exit, why, funding, false)) closed++;
  }
  return closed;
}

// ── entry lane ──────────────────────────────────────────────────────────────
interface Signal { strategy: string; direction: 'long' | 'short'; score: number | null }
const _lastEntryRun = new Map<number, number>();

export async function runKalshiStockShadowCycle(userId: number): Promise<{ opened: number; closed: number }> {
  if (!stockShadowEnabled()) return { opened: 0, closed: 0 };
  await ensureKalshiPerpShadowTables();
  const closed = await resolveKalshiStockShadowTrades(userId).catch((e: any) => { console.error('[kalshi-stock-shadow] resolver failed (non-fatal):', e?.message ?? e); return 0; });
  if (Date.now() - (_lastEntryRun.get(userId) || 0) < EVERY_MS()) return { opened: 0, closed };
  _lastEntryRun.set(userId, Date.now());

  const [{ STRATEGY_RUNNERS }, { OPTIONS_STRATEGY_RUNNERS }, { evaluateSpecSignals, volumeProfileSeries }, { paperMaxHoursFor }, { assessPriceAnomaly }] = await Promise.all([
    import('./cryptocom-scanner'), import('./options-scanner'), import('./strategy-backtest'), import('./crypto-paper'), import('../utils/corporateActionGuard'),
  ]);
  const stats = await computeKalshiStockShadowStats(userId).catch(() => [] as KalshiBucketStat[]);
  const markets = await getLiquidStockPerps().catch(() => [] as PerpMarket[]);
  if (!markets.length) return { opened: 0, closed };
  const actions = await getPerpCorporateActions().catch(() => []);
  const pendingCa = new Set(actions.filter((a) => a.status === 'scheduled' && a.effectiveMs != null && a.effectiveMs <= Date.now() + 24 * 3_600_000).map((a) => a.ticker));

  const { rows: open } = await pool.query(`SELECT strategy, underlying FROM kalshi_perp_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  const { rows: recent } = await pool.query(
    `SELECT strategy, underlying FROM kalshi_perp_shadow_trades WHERE user_id=$1 AND status='closed' AND closed_at >= now() - ($2::text || ' milliseconds')::interval`,
    [userId, String(COOLDOWN_MS())]);
  // ORB once-per-ticker-per-ET-day state (any status — an ORB entry that
  // already stopped out still counts as today's one shot, mirroring the FX
  // lane's orbDailyFired). Day boundaries are compared in ET in JS via
  // kalshi-orb.ts so the rule is unit-testable (scripts/check-kalshi-orb.ts).
  const { rows: orbPrior } = await pool.query(
    `SELECT ticker, opened_at FROM kalshi_perp_shadow_trades WHERE user_id=$1 AND strategy='orb' AND opened_at >= now() - interval '30 hours'`,
    [userId]).catch(() => ({ rows: [] as any[] }));
  const orbPriorList = orbPrior.map((r: any) => ({ ticker: String(r.ticker), openedAtMs: new Date(r.opened_at).getTime() }));
  const cryptoCfg: any = { defiChain: 'kalshi', directionFilter: 'both', minConfidence: MIN_CONF(), compositeMinEdgeScore: 72 };
  const optCfg: any = { ...OPTIONS_CFG, minConfidence: MIN_CONF() };
  let opened = 0;

  for (const mkt of markets) {
    if (open.length >= MAX_OPEN()) break;
    if (!mkt.scheduleOpen || pendingCa.has(mkt.ticker)) continue;
    const symbol = `KALSHI:${mkt.ticker}`;
    // Corporate-action / bad-print backstop on the candle feed itself.
    const bars15 = await getPerpBars(mkt.ticker, '15m', 40).catch(() => []);
    if (bars15.length >= 3 && assessPriceAnomaly(bars15).suspect) continue;

    const signals: Signal[] = [];
    // ORB — canonical opening-range breakout (kalshi-orb.ts): today's
    // 9:30–9:45 ET range from this ticker's 1-min candles, entry only on a
    // retest after a confirmed breakout, once per ticker per ET day. The
    // signal flows into the SAME entry machinery below (touch entry, ATR
    // stop, 2R target, funding/cost model) as every other lane strategy.
    if (stockOrbEnabled() && !orbAlreadyFiredToday(orbPriorList, mkt.ticker, Date.now())) {
      const nowMs = Date.now();
      const { hour: etH, minute: etM } = etParts(nowMs);
      const minsSinceOpen = (etH * 60 + etM) - (9 * 60 + 30);
      if (minsSinceOpen >= 15 && minsSinceOpen <= 8 * 60) { // past the range, same ET day
        const oneMin = await getPerpCandles(mkt.ticker, 1, Math.min(5000, minsSinceOpen + 10)).catch(() => [] as PerpBar[]);
        if (oneMin.length >= 15) {
          const m5 = aggregateBars(oneMin, 5).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c }));
          const state = computeKalshiOrbState(m5, oneMin[oneMin.length - 1].c, nowMs);
          const dir = orbEntryDirection(state);
          if (dir) signals.push({ strategy: 'orb', direction: dir, score: null });
        }
      }
    }
    // Crypto ports — the engine's own runners, unchanged.
    const cryptoResults = await Promise.all(CRYPTO_PORTS.map((k) =>
      STRATEGY_RUNNERS[k](symbol, cryptoCfg).then((r: any) => ({ k, r })).catch(() => null)));
    for (const cr of cryptoResults) {
      if (cr?.r?.decision === 'signal' && cr.r.direction) {
        signals.push({ strategy: cr.k, direction: cr.r.direction === 'SELL' ? 'short' : 'long', score: cr.r.score ?? null });
      }
    }
    // Composite (crypto lane rule): ≥2 of the ported runners agree, blend ≥ 72.
    const dirs = signals.filter((s) => CRYPTO_PORTS.includes(s.strategy as any));
    const longs = dirs.filter((s) => s.direction === 'long'), shorts = dirs.filter((s) => s.direction === 'short');
    const side = longs.length > shorts.length ? longs : shorts.length > longs.length ? shorts : [];
    if (side.length >= 2) {
      const blend = Math.round(side.reduce((a, s) => a + (s.score ?? 0), 0) / side.length);
      if (blend >= 72) signals.push({ strategy: 'composite_autonomous', direction: side[0].direction, score: blend });
    }
    // Options ports — underlying-price runners on the Alpaca-shaped adapter.
    const adapter = optionsAdapter(mkt.ticker);
    for (const k of OPTIONS_PORTS) {
      const r: any = await OPTIONS_STRATEGY_RUNNERS[k](adapter, mkt.underlying, optCfg).catch(() => null);
      if (r?.decision === 'signal' && r.direction) {
        signals.push({ strategy: `opt_${k}`, direction: r.direction === 'SELL' || r.direction === 'down' ? 'short' : 'long', score: r.score ?? null });
      }
    }
    // FX mechanical approximations — the spec evaluator shared with the backtester.
    for (const fx of FX_PORTS) {
      const raw = await getPerpBars(mkt.ticker, fx.tf, fx.bars + 2).catch(() => []);
      const tfMs = (fx.tf === '5m' ? 5 : 60) * 60_000;
      const closedBars = raw.filter((b) => b.t + tfMs <= Date.now()).slice(-fx.bars);
      if (closedBars.length < 30) continue;
      const sig = evaluateSpecSignals(fx.make(mkt.ticker), closedBars.map((b) => ({ timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })));
      if (!sig) continue;
      if (sig.enterLong && !sig.enterShort) signals.push({ strategy: fx.id, direction: 'long', score: null });
      else if (sig.enterShort && !sig.enterLong) signals.push({ strategy: fx.id, direction: 'short', score: null });
    }
    if (!signals.length) continue;

    // Shared per-ticker context: H1 ATR + trends, touch, funding estimate.
    const h1Bars = await getPerpBars(mkt.ticker, '1h', 60).catch(() => []);
    if (h1Bars.length < 16) continue;
    const lastClose = h1Bars[h1Bars.length - 1].c;
    const atr = atrOf(h1Bars);
    if (!atr || !(lastClose > 0)) continue;
    const atrPct = (atr / lastClose) * 100;
    const h1Trend = trendOf(h1Bars.map((b) => b.c), 9, 21);
    const h4Closes = aggregateBars(await getPerpCandles(mkt.ticker, 60, 60 * 60).catch(() => []), 4).map((b) => b.c);
    const h4Trend = trendOf(h4Closes, 5, 10);
    const touch = await getPerpTouch(mkt.ticker).catch(() => null);
    const bid = touch?.bid ?? mkt.bid, ask = touch?.ask ?? mkt.ask;
    if (!(bid > 0) || !(ask > bid)) continue;
    const spreadBps = ((ask - bid) / ((ask + bid) / 2)) * 10_000;
    const fundEst = await getPerpFundingEstimate(mkt.ticker).catch(() => null);
    const slPct = Math.min(SL_HI(), Math.max(SL_LO(), ATR_MULT() * atrPct));
    const costBps = FEE_BPS();
    if (slPct < 3 * (costBps / 100)) continue; // cost floor (crypto lane rule)
    const now = Date.now();
    const et = etParts(now);

    // Entry-time volume profile for this ticker (perp-brain build): the
    // spec path's own volumeProfileSeries (24 bins, 70% value area) over
    // today's ET-session 15m bars — falling back to the trailing ~24h of
    // bars when the session is too young to define a profile. Computed
    // once per ticker per cycle; each candidate below is placed against
    // it. Fail-soft: no usable profile → no VP context and no VP veto.
    let vpProfile: { poc: number; vah: number; val: number } | null = null;
    if (perpVpEnabled()) {
      const rawVp = await getPerpBars(mkt.ticker, '15m', 120).catch(() => [] as Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>);
      const etMidnightMs = now - ((et.hour * 60 + et.minute) * 60_000 + (now % 60_000));
      let vpWindow = rawVp.filter((b) => b.t >= etMidnightMs);
      if (vpWindow.length < 24) vpWindow = rawVp.slice(-96);
      if (vpWindow.length >= 24) {
        const vpSeries = volumeProfileSeries(
          vpWindow.map((b) => ({ timestamp: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v })),
          vpWindow.length, 70);
        const li = vpWindow.length - 1;
        const poc = vpSeries.poc[li], vah = vpSeries.vah[li], val = vpSeries.val[li];
        if (poc != null && vah != null && val != null && vah > val) vpProfile = { poc, vah, val };
      }
    }

    for (const sig of signals) {
      if (open.length >= MAX_OPEN()) break;
      if (open.filter((o) => o.strategy === sig.strategy).length >= MAX_PER_STRAT()) continue;
      if (open.some((o) => o.strategy === sig.strategy && o.underlying === mkt.underlying)) continue;
      if (recent.some((o) => o.strategy === sig.strategy && o.underlying === mkt.underlying)) continue;
      const short = sig.direction === 'short';
      const entry = short ? bid : ask;
      const stop = short ? entry * (1 + slPct / 100) : entry * (1 - slPct / 100);
      const target = short ? entry * (1 - slPct * RR() / 100) : entry * (1 + slPct * RR() / 100);
      const contracts = Math.max(1, Math.round(NOTIONAL() / entry));
      const notional = contracts * entry;
      const aligned = h4Trend == null ? null : short ? h4Trend === 'BEARISH' : h4Trend === 'BULLISH';
      const agreeing = signals.filter((s) => s.direction === sig.direction).length;
      // This candidate's volume-profile position (null when no profile
      // could be built or the VP filter is off) — recorded on the context
      // row and learned as the 'vp' bucket dimension from here forward.
      const vpPos: VpPosition | null = vpProfile ? classifyVpPosition(entry, vpProfile.vah, vpProfile.val) : null;
      const ctx = {
        session_et: sessionEt(now), ticker: mkt.ticker, spread_bps: spreadBps, atr_pct: atrPct,
        funding_rate_at_entry: fundEst?.rate ?? null, htf_aligned: aligned, direction: sig.direction, hour_et: et.hour,
        vp_position: vpPos,
      };
      const tags: string[] = [];
      if (aligned === false) tags.push('against_htf');
      if (aligned === true) tags.push('htf_aligned');
      if (agreeing < 2) tags.push('single_runner_no_confluence');
      if (spreadBps > 25) tags.push('wide_spread');
      if (ctx.session_et === 'overnight') tags.push('overnight_session');
      // ── Perp brain gate (kalshi-perp-brain.ts): the lane's own bucket
      // verdicts now ACT. Any matching 'avoid' bucket hard-blocks this
      // entry, audit-logged per bucket BEFORE the skip; 'favor' matches
      // only tag the trade (fixed-notional shadow sizing has nothing to
      // boost). Verdicts roll with the 60-day stats window, so a block
      // lifts by itself when the bucket's record improves past the bar —
      // rehabilitation is automatic and needs no human action.
      if (perpBrainEnabled()) {
        const gate = evaluatePerpBrainGate(stats, sig.strategy, kalshiBucketsOf(ctx));
        if (gate.blocked) {
          await logPerpBrainBlocks(userId, gate.avoid.map((s) => ({
            strategy: sig.strategy, ticker: mkt.ticker, underlying: mkt.underlying, direction: sig.direction,
            reason: 'brain_avoid' as const, bucketDim: s.dim, bucketValue: s.bucket, medianNetPct: s.medianNet, bucketN: s.n,
          })));
          continue;
        }
        if (gate.favor.length) tags.push('brain_favor');
      }
      // ── Volume-profile value-edge veto (ONE conservative rule): no long
      // pressing into VAH from inside value, no short pressing into VAL.
      // Breakouts already outside value and retests from outside are NOT
      // blocked. Skips are audit-logged as 'vp_edge'; no trade row opens.
      if (perpVpEnabled() && vpProfile && vpValueEdgeBlock(sig.direction, entry, vpProfile, atr)) {
        await logPerpBrainBlocks(userId, [{
          strategy: sig.strategy, ticker: mkt.ticker, underlying: mkt.underlying, direction: sig.direction,
          reason: 'vp_edge' as const, bucketDim: 'vp', bucketValue: vpPos, medianNetPct: null, bucketN: null,
        }]);
        continue;
      }
      const ins = await pool.query(
        `INSERT INTO kalshi_perp_shadow_trades (user_id, strategy, ticker, underlying, direction, entry_price, entry_bid, entry_ask,
           stop_loss, take_profit, sl_pct, contracts, notional_usd, cost_bps, cost_model, score, max_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'placeholder',$15,$16) RETURNING id`,
        [userId, sig.strategy, mkt.ticker, mkt.underlying, sig.direction, entry, bid, ask, stop, target, slPct, contracts, notional, costBps, sig.score, paperMaxHoursFor(sig.strategy)]);
      const id = ins.rows[0]?.id;
      if (!id) continue;
      await pool.query(
        `INSERT INTO kalshi_perp_shadow_context (trade_id, user_id, strategy, ticker, direction, spread_bps, volume_24h_usd, open_interest,
           atr_pct, h1_trend, h4_trend, htf_aligned, funding_rate_at_entry, session_et, hour_utc, hour_et, day_of_week,
           earnings_within_48h, corporate_action_pending, live_gate_blocked, leverage_estimate, tags, advice_at_entry,
           vp_poc, vp_vah, vp_val, vp_position)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) ON CONFLICT (trade_id) DO NOTHING`,
        [id, userId, sig.strategy, mkt.ticker, sig.direction, spreadBps, mkt.volume24hNotionalUsd, mkt.openInterest,
         atrPct, h1Trend, h4Trend, aligned, fundEst?.rate ?? null, ctx.session_et, new Date(now).getUTCHours(), et.hour, et.dow,
         null, pendingCa.has(mkt.ticker), agreeing < 2, mkt.leverageEstimate, tags, adviceFor(stats, sig.strategy, ctx),
         vpProfile?.poc ?? null, vpProfile?.vah ?? null, vpProfile?.val ?? null, vpPos]).catch(() => {});
      open.push({ strategy: sig.strategy, underlying: mkt.underlying });
      opened++;
    }
  }
  return { opened, closed };
}

// ── boot wiring (mirrors engine-watchdog's starter shape) ───────────────────
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
/** Start the 5-minute lane tick (resolver each tick, entries every 10 min). Idempotent; never throws. */
export function startKalshiStockShadow(): void {
  if (_started) return;
  _started = true;
  if (!stockShadowEnabled()) { console.log('[kalshi-stock-shadow] disabled (KALSHI_STOCK_SHADOW=off).'); return; }
  const tick = async () => {
    try {
      const uid = await resolveOwnerUserId();
      if (uid) await runKalshiStockShadowCycle(uid);
    } catch (e: any) { console.error('[kalshi-stock-shadow] tick failed (non-fatal):', e?.message ?? e); }
  };
  setTimeout(tick, 3 * 60_000).unref?.();
  setInterval(tick, 5 * 60_000).unref?.();
  console.log('[kalshi-stock-shadow] started — SHADOW lane on public Kalshi perp data (no credentials, no orders).');
}
