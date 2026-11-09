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
//    perp — excluded.
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
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { ensureKalshiPerpShadowTables } from './ensure-kalshi-perp-shadow-tables';
import {
  getLiquidStockPerps, getPerpCandles, getPerpTouch, getPerpFundingHistory, getPerpFundingEstimate,
  getPerpCorporateActions, getPerpBars, aggregateBars, type PerpBar, type PerpMarket,
} from './kalshi-perps';

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
export const stockShadowEnabled = () => process.env.KALSHI_STOCK_SHADOW !== 'off';
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
    `SELECT c.strategy, c.ticker, c.direction, c.session_et, c.spread_bps, c.atr_pct, c.funding_rate_at_entry, c.htf_aligned, c.hour_et, c.net_pct
       FROM kalshi_perp_shadow_context c JOIN kalshi_perp_shadow_trades t ON t.id = c.trade_id
      WHERE c.user_id=$1 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL AND t.exclude_from_stats IS NOT TRUE
        AND c.closed_at >= now() - interval '60 days'`, [userId]);
  const stats = aggregateKalshiStats(rows);
  _statsCache.set(userId, { at: Date.now(), stats });
  return stats;
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

  const [{ STRATEGY_RUNNERS }, { OPTIONS_STRATEGY_RUNNERS }, { evaluateSpecSignals }, { paperMaxHoursFor }, { assessPriceAnomaly }] = await Promise.all([
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
      const ctx = {
        session_et: sessionEt(now), ticker: mkt.ticker, spread_bps: spreadBps, atr_pct: atrPct,
        funding_rate_at_entry: fundEst?.rate ?? null, htf_aligned: aligned, direction: sig.direction, hour_et: et.hour,
      };
      const tags: string[] = [];
      if (aligned === false) tags.push('against_htf');
      if (aligned === true) tags.push('htf_aligned');
      if (agreeing < 2) tags.push('single_runner_no_confluence');
      if (spreadBps > 25) tags.push('wide_spread');
      if (ctx.session_et === 'overnight') tags.push('overnight_session');
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
           earnings_within_48h, corporate_action_pending, live_gate_blocked, leverage_estimate, tags, advice_at_entry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) ON CONFLICT (trade_id) DO NOTHING`,
        [id, userId, sig.strategy, mkt.ticker, sig.direction, spreadBps, mkt.volume24hNotionalUsd, mkt.openInterest,
         atrPct, h1Trend, h4Trend, aligned, fundEst?.rate ?? null, ctx.session_et, new Date(now).getUTCHours(), et.hour, et.dow,
         null, pendingCa.has(mkt.ticker), agreeing < 2, mkt.leverageEstimate, tags, adviceFor(stats, sig.strategy, ctx)]).catch(() => {});
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
