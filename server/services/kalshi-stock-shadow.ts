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
// stats, and a cost floor: entries skipped when the stop is < 3×
// round-trip cost. Fees/funding accounting eras (2026-11-16,
// kalshi-perp-costs.ts): rows opened with exact accounting on carry
// cost_model='exact_v1' — the published tier-0 schedule (12 bps taker
// per leg, 24 round trip; this lane's client is public-only by
// construction, so the published schedule is its fee source — the
// authenticated /margin/fee_tiers read lives on the live lane) and
// funding accrued from Kalshi's actual prints through the shared
// module (0.01% deadband, ±2% cap), with the in-window estimate
// carried separately and marked 'estimate' if it is ever booked.
// Older rows and kill-switch-off rows keep cost_model='placeholder'
// (the legacy 20 bps modeled round trip); recorded nets are never
// rewritten. Kill switch: KALSHI_PERP_EXACT_COSTS=off.
//
// Caps mirror the crypto shadow lane's shape: 45 open / 4 per strategy / no
// duplicate underlying within a strategy / 60-min re-entry cooldown
// (widened from 30 / 3 on 2026-11-15 — see the tuning note at the knobs).
// Entries every 5 min, resolver every 5 min. Kill switch:
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
//
// Earnings blackout + funding-extremes fade (2026-11-13, build #3): the
// context's earnings_within_48h finally has a real source — Nasdaq's
// public earnings calendar, cached once a day (kalshi-earnings-calendar.ts).
// A ticker with earnings inside the window (default 48h,
// KALSHI_PERP_EARNINGS_WINDOW_H) has ALL its entries skipped and each
// skip audit-logged as reason 'earnings'; a calendar that is down or
// uncovered reads UNKNOWN and never blocks (kill switch
// KALSHI_PERP_EARNINGS=off). And the lane gains a 19th strategy,
// 'funding_fade' (kalshi-funding-fade.ts): when a ticker's latest
// realized funding print sits in the outer decile of its trailing
// distribution, the fade takes the other side — same touch entry, ATR
// stop, 2R target, funding + cost model as every lane strategy (kill
// switch KALSHI_FUNDING_FADE=off). Still SHADOW ONLY, same as the rest
// of this lane: no new data source here can place an order.
//
// AI judge (2026-11-22, kalshi-perp-ai-judge.ts): a candidate that has
// passed EVERY gate above and is about to open gets one AI verdict
// (approve / reject / unsure), stamped on its context row and scored
// against the outcome in the panel report. The verdict NEVER blocks,
// sizes, or otherwise affects the entry — it is a judge collecting
// evidence, not a gate. Only opening candidates are judged (blocked
// candidates are never judged — cost guard), AI failures record
// 'no_verdict' and the entry proceeds, and the call meters against the
// shared engine AI pool exactly once via the engine-marked client.
// Kill switch: KALSHI_PERP_AI_JUDGE=off.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { loopTick } from '../crash-heartbeat';
import { ensureKalshiPerpShadowTables } from './ensure-kalshi-perp-shadow-tables';
import { trailBrainConsult, trailBrainStopPrice, stampTrailBrainTrade, kalshiPerpTrailActivation, ensureTrailBrainColumns, kalshiPerpTrailROn, kalshiPerpTrailRGeometry } from './trail-brain';
import { improvementThrottleBlocks, logImprovementBlock } from './improvement-loop';
import {
  getLiquidStockPerps, getPerpCandles, getPerpTouch, getPerpFundingHistory, getPerpFundingEstimate,
  getPerpCorporateActions, getPerpBars, aggregateBars, type PerpBar, type PerpMarket,
} from './kalshi-perps';
import { computeKalshiOrbState, orbEntryDirection, orbAlreadyFiredToday } from './kalshi-orb';
import {
  perpBrainEnabled, perpVpEnabled, evaluatePerpBrainGate, logPerpBrainBlocks,
  getPerpBrainBlockSummary, classifyVpPosition, vpValueEdgeBlock, type VpPosition,
} from './kalshi-perp-brain';
import {
  perpEarningsEnabled, earningsWindowH, getEarningsInfo, earningsBlockApplies, earningsStampValue,
  type EarningsLookup,
} from './kalshi-earnings-calendar';
import { fundingFadeEnabled, buildFundingFadeBook, fundingFadeForTicker, type FundingFadeBook } from './kalshi-funding-fade';
import {
  exactCostsEnabled, COST_MODEL_EXACT, COST_MODEL_LEGACY, PUBLISHED_FEE_SCHEDULE,
  roundTripCostBps, accrueFundingFromPrints, fundingPnlUsd, fundingFallbackApplies,
} from './kalshi-perp-costs';
import {
  kalshiPerpAiJudgeEnabled, judgeKalshiPerpCandidate, aggregateAiJudgeScoreboard,
  summarizeJudgeRows, strategyRecordFromRows, bucketEvidenceFor,
  type PerpAiJudgeResult, type AiJudgeScoreboard, type JudgeTickerHistory, type JudgeStrategyRecord,
} from './kalshi-perp-ai-judge';
import {
  kalshiPerpWatchPlansEnabled, resolvePerpWatchPlan, newPerpPlanCycle, notePerpPlanEntry,
  kalshiPerpWatchPlansSummary, type PerpWatchPlanAction,
} from './kalshi-perp-watch-plans';
import {
  smallAccountEnabled, perpSaMode, sizePerpByRisk, SA_MIN_INCREMENT,
  getOrSeedPerpShadowWallet, loadPerpShadowWallet, adjustPerpShadowWallet,
  type PerpAccountContext, type PerpShadowWallet,
} from './kalshi-perp-small-account';
import { loadKalshiCredentials, getKalshiMarginBalance } from './kalshi-trading';
import { AI_BUDGET_DEGRADED_MODE, KALSHI_PERP_DEGRADED_CONTEXT_LINE } from './ai-budget-degrade';

export const stockOrbEnabled = () => process.env.KALSHI_STOCK_ORB !== 'off';

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
export const stockShadowEnabled = () => process.env.KALSHI_STOCK_SHADOW !== 'off';
export const accountSimEnabled = () => process.env.KALSHI_ACCOUNT_SIM !== 'off';
// Scan-cadence tuning (2026-11-15, Chris's ask for more perp action): entry
// evaluations now run on EVERY 5-minute tick (was every 10 min) and the
// concurrency caps widened (30 → 45 open, 3 → 4 per strategy) so the lane
// builds its shadow record materially faster toward the per-strategy
// promotion bar. These are coverage throttles only — every entry gate
// (perp brain, VP veto, earnings blackout, funding fade, lesson gates,
// confidence floor, cost floor) is untouched. All env-tunable.
const MAX_OPEN = () => Math.floor(num('KALSHI_STOCK_SHADOW_MAX_OPEN', 45));
const MAX_PER_STRAT = () => Math.floor(num('KALSHI_STOCK_SHADOW_MAX_PER_STRATEGY', 4));
const COOLDOWN_MS = () => num('KALSHI_STOCK_SHADOW_COOLDOWN_MIN', 60) * 60_000;
const EVERY_MS = () => num('KALSHI_STOCK_SHADOW_EVERY_MIN', 5) * 60_000;
const TICK_MS = 5 * 60_000;

/** Cadence/caps snapshot (env-driven, read live) — exported for the cadence
 *  checks and so the before/after numbers in the tuning PR are code, not
 *  prose. The universe cap lives in kalshi-perps.ts (maxStockPerpTickers). */
export function stockShadowCadence(): { tickMs: number; entryEveryMs: number; maxOpen: number; maxPerStrategy: number; cooldownMs: number } {
  return { tickMs: TICK_MS, entryEveryMs: EVERY_MS(), maxOpen: MAX_OPEN(), maxPerStrategy: MAX_PER_STRAT(), cooldownMs: COOLDOWN_MS() };
}
const NOTIONAL = () => num('KALSHI_STOCK_SHADOW_NOTIONAL_USD', 250);
const MIN_CONF = () => num('KALSHI_STOCK_SHADOW_MIN_CONFIDENCE', 70);
const FEE_BPS = () => num('KALSHI_STOCK_SHADOW_FEE_BPS', 20); // LEGACY era round-trip placeholder taker cost (exact era: kalshi-perp-costs.ts)
const SL_LO = () => num('KALSHI_STOCK_SHADOW_SL_MIN_PCT', 0.8);
const SL_HI = () => num('KALSHI_STOCK_SHADOW_SL_MAX_PCT', 4);
const ATR_MULT = () => num('KALSHI_STOCK_SHADOW_SL_ATR_MULT', 1.5);
const RR = () => num('KALSHI_STOCK_SHADOW_RR', 2);

// ── stats validity (2026-11-16 stats blow-up fix) ──────────────────────────
// A close in this lane resolves through the resolver's own candle walk:
// stops sit at slPct ∈ [0.8%, 4%], targets at 2R (≤ +8%), fills price at
// the touch or the candle open. A REAL resolved trade therefore cannot
// post |return_pct| anywhere near 100 — a long cannot lose more than its
// notional, and a >100% gain would have crossed the 2R target in the same
// walk first. Values beyond ±100% (or non-finite) can only come from
// corrupt price inputs: an off-scale candle/touch print, a near-zero
// entry quote passing the bid>0 guard, a funding print read in the wrong
// unit. Before this fix a single such row poisoned every headline stat —
// the panel's sum(notional × return_pct / 100), the bucket medians, and
// the $100 replay's whole-balance compounding — while the count-based
// stats (trades, wins, win rate) stayed sane: production showed a
// −$9.24e14 "net result" next to a perfectly ordinary 359-trade count.
// Validity is therefore enforced at write time (closeTrade stamps the
// row excluded + stats_invalid_reason), at read time (the report and
// bucket-stat queries carry the same bound), and inside the pure
// aggregators — and invalid closes are counted and surfaced in the
// panel payload, never silently dropped.
export const maxValidReturnPct = () => num('KALSHI_STOCK_SHADOW_MAX_VALID_RETURN_PCT', 100);
export function isValidShadowReturnPct(v: unknown): boolean {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && Math.abs(n) <= maxValidReturnPct();
}

/** Absolute ceiling on a sane entry price for this lane's universe
 *  (single-stock perps + major crypto perps; the most expensive real
 *  underlying, BTC, is ~1e5). An entry print above this is off-scale by
 *  construction, whatever it claims. This is the production blow-up's
 *  actual shape (per-strategy attribution, 2026-11-16): one
 *  opt_volume_profile trade whose entry print was ~9.24e14 — contracts
 *  = max(1, round(250 / entry)) = 1, so notional_usd = entry ≈ 9.24e14
 *  while its return_pct stayed a plausible-looking −100.05 and its R a
 *  sane-looking −25. A return-only guard catches that row by 0.05 of a
 *  percent; the entry ceiling names the corrupt field directly. */
export const maxValidEntryUsd = () => num('KALSHI_STOCK_SHADOW_MAX_VALID_ENTRY_USD', 1_000_000);

/** The largest notional consistent with this lane's sizing for a given
 *  entry: contracts = max(1, round(target / entry)), so the notional is
 *  ≈ target for ordinary prices and exactly entry when one contract
 *  already exceeds the target (BTC-class prices). A notional beyond
 *  max(2× target, 1.5× entry) is inconsistent with the trade's own
 *  stated entry — the notional (or contracts) field itself is corrupt,
 *  independent of whether the entry price was sane. */
export function maxValidNotionalUsd(entryPrice: unknown, targetNotionalUsd: number): number {
  const entry = Number(entryPrice);
  const target = Number.isFinite(targetNotionalUsd) && targetNotionalUsd > 0 ? targetNotionalUsd : 250;
  return Math.max(2 * target, (Number.isFinite(entry) && entry > 0 ? entry : 0) * 1.5);
}
export function isValidShadowNotional(entryPrice: unknown, notionalUsd: unknown, targetNotionalUsd: number): boolean {
  const n = Number(notionalUsd);
  return Number.isFinite(n) && n > 0 && n <= maxValidNotionalUsd(entryPrice, targetNotionalUsd);
}

/** Why a computed close is not usable evidence, or null when it is.
 *  Pure — exercised directly by scripts/check-kalshi-perp-stats-fix.ts. */
export function shadowCloseInvalidReason(parts: {
  entryPrice: unknown; exitPrice: unknown;
  grossPct: number | null; fundingPct: number | null; netPct: number | null;
  notionalUsd?: unknown; targetNotionalUsd?: number;
}): string | null {
  const entry = Number(parts.entryPrice);
  if (!Number.isFinite(entry) || entry <= 0 || entry > maxValidEntryUsd()) return 'entry_price';
  if (parts.notionalUsd != null && !isValidShadowNotional(entry, parts.notionalUsd, parts.targetNotionalUsd ?? 250)) return 'notional';
  if (parts.exitPrice != null) {
    const exit = Number(parts.exitPrice);
    if (!Number.isFinite(exit) || exit <= 0) return 'exit_price';
  }
  const bound = maxValidReturnPct();
  if (parts.grossPct != null && (!Number.isFinite(parts.grossPct) || Math.abs(parts.grossPct) > bound)) return 'gross_return';
  if (parts.fundingPct != null && (!Number.isFinite(parts.fundingPct) || Math.abs(parts.fundingPct) > bound)) return 'funding';
  if (parts.netPct != null && (!Number.isFinite(parts.netPct) || Math.abs(parts.netPct) > bound)) return 'net_return';
  return null;
}

// ── data repair: stamp the pre-fix poisoned rows (Chris-approved) ────────
// The write/read guards above protect everything computed from now on,
// and the report's read-time bound keeps poisoned rows out of the panel
// even before they are stamped. But the promotion-bar and live-gate
// readers (shadow-live-toggles.ts, kalshi-perp-live.ts) filter closes
// ONLY on exclude_from_stats — so a pre-fix poisoned row stays valid
// evidence for the PR #89/#91 bars until it carries the stamp. This
// boot-time repair applies the stamp: same geometry signature as the
// report's read filter (return bound / entry ceiling / notional
// consistency, all from the helpers above), stamp-only — NO deletes,
// NO value rewrites, open trades and already-excluded rows untouched,
// and a write-time reason already on a row is never overwritten. The
// predicate is self-exhausting (a stamped row no longer matches), so
// the once-per-boot memo below is a courtesy, not a correctness need.
// Kill switch: KALSHI_PERP_STATS_REPAIR=off.
export const statsRepairEnabled = () => process.env.KALSHI_PERP_STATS_REPAIR !== 'off';
export const STATS_REPAIR_REASON = 'auto-repair: invalid close geometry';

/** Pure mirror of the repair UPDATE's WHERE clause, over a row's raw
 *  fields — exercised directly by scripts/check-kalshi-perp-stats-fix.ts.
 *  A NULL return_pct fails no return test (SQL: abs(NULL) > bound is
 *  NULL), but the entry/notional geometry tests still apply. */
export function shadowRowNeedsStatsRepair(row: {
  status?: unknown; excludeFromStats?: unknown;
  returnPct?: unknown; entryPrice?: unknown; notionalUsd?: unknown; targetNotionalUsd?: number;
}): boolean {
  if (String(row.status) !== 'closed') return false;
  if (row.excludeFromStats === true) return false;
  const rp = row.returnPct == null ? null : Number(row.returnPct);
  if (rp != null && (!Number.isFinite(rp) || Math.abs(rp) > maxValidReturnPct())) return true;
  const entry = Number(row.entryPrice);
  if (Number.isFinite(entry) && entry > maxValidEntryUsd()) return true;
  const notional = Number(row.notionalUsd);
  if (Number.isFinite(notional) && notional > maxValidNotionalUsd(entry, row.targetNotionalUsd ?? NOTIONAL())) return true;
  return false;
}

let _statsRepair: Promise<number> | null = null;
export function repairKalshiPerpShadowStats(): Promise<number> {
  if (!_statsRepair) {
    _statsRepair = (async () => {
      if (!statsRepairEnabled()) return 0;
      await ensureKalshiPerpShadowTables();
      const res = await pool.query(
        `UPDATE kalshi_perp_shadow_trades
           SET exclude_from_stats = true,
               stats_invalid_reason = COALESCE(stats_invalid_reason, $4)
         WHERE status='closed' AND exclude_from_stats IS NOT TRUE
           AND (abs(return_pct) > $1::float
                OR entry_price > $2::float
                OR notional_usd > greatest($3::float, entry_price * 1.5))
         RETURNING id`,
        [maxValidReturnPct(), maxValidEntryUsd(), 2 * NOTIONAL(), STATS_REPAIR_REASON]);
      const ids = (res.rows || []).map((r: any) => r.id);
      if (ids.length) {
        console.warn(`[kalshi-stock-shadow] stats auto-repair: stamped ${ids.length} pre-fix closed trade(s) excluded from stats (ids: ${ids.join(', ')}) — invalid close geometry, values left untouched`);
      }
      return ids.length;
    })().catch((e: any) => {
      // A failed repair must never block boot or the lane; reset the
      // memo so a later call can retry.
      _statsRepair = null;
      console.error('[kalshi-stock-shadow] stats auto-repair failed (non-fatal):', e?.message ?? e);
      return 0;
    });
  }
  return _statsRepair;
}

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
    const v = Number(r.net_pct); if (!isValidShadowReturnPct(v)) continue;
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
        AND abs(c.net_pct) <= $2::float
        AND c.closed_at >= now() - interval '60 days'`, [userId, maxValidReturnPct()]);
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
  /** Closed trades in the window quarantined as invalid (impossible
   *  values — see the ±100 bound): stamped at close since the fix, plus
   *  pre-fix rows failing the bound at read time. Counted and shown in
   *  the panel; never included in any statistic. */
  invalidExcludedCount: number;
  lastOpenedAt: string | null;
  lastClosedAt: string | null;
  enabled: boolean;
  /** Small-account mirror (kalshi-perp-small-account.ts): the virtual
   *  wallet the shadow lane sizes against and the ladder mode it is in.
   *  Null when the kill switch is off or no wallet has seeded yet. */
  virtualWalletEquityUsd: number | null;
  smallAccountMode: 'survival' | 'growth' | 'standard' | null;
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
  /** Exact-era rows only: the in-window funding estimate for the next
   *  4pm ET print (display-only; never booked as realized). */
  funding_estimate_usd: number;
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
  /** Funding provenance: 'actual' | 'estimate' | 'exact_v1' | 'legacy'. */
  funding_model: string;
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
  /** Earnings blackout state (build #3): whether the blackout is on, and
   *  how many entries it skipped in the selected window. */
  earningsEnabled: boolean;
  earningsSkipsInWindow: number;
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

export interface KalshiAiJudgePanelReport {
  enabled: boolean;
  /** Closed, stats-valid trades in the window that carry a judge
   *  verdict on their context row — the scoreboard's evidence base. */
  judgedCloses: number;
  /** Per-verdict outcomes (win rate / avg R / est. net, all net of
   *  funding + costs as booked at close). The judge does NOT block
   *  trades — 'reject' rows opened anyway, which is exactly what makes
   *  the approve-vs-reject comparison honest evidence. */
  scoreboard: AiJudgeScoreboard;
}

export interface KalshiPerpWatchPlansPanelReport {
  enabled: boolean;
  /** Live (unexpired) plans currently held for this user. */
  activePlans: number;
  /** Today's plan-layer counters (UTC day, in-process like the FX
   *  watch-plan health counters): studies bought, plans created and
   *  triggered, signals skipped for want of a triggered plan, plan-layer
   *  failures that fell back to mechanical entries, and entries that
   *  opened under a triggered plan. */
  created: number;
  triggered: number;
  expired: number;
  invalidated: number;
  structureBreaks: number;
  deepCalls: number;
  planSkips: number;
  fallbacks: number;
  entriesViaPlan: number;
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
  // AI judge scoreboard (kalshi-perp-ai-judge.ts): how the judge's
  // verdicts graded out against real closes. Evidence only — the judge
  // never gates entries in this build.
  aiJudge: KalshiAiJudgePanelReport;
  // AI watch plans (kalshi-perp-watch-plans.ts): with plans ON, entries
  // wait for an AI plan trigger on top of the mechanical signal — the
  // counters below are the layer's evidence.
  aiWatchPlans: KalshiPerpWatchPlansPanelReport;
  // Trail Brain on this lane (trail-brain.ts): activation mode in force
  // and the guided-close evidence for the window.
  trailBrain: KalshiPerpTrailBrainReport;
}

export interface KalshiPerpTrailBrainReport {
  /** 'R' = activation derived from each trade's own R geometry
   *  (KALSHI_PERP_TRAIL_R on); 'pct' = legacy percent activation. */
  mode: 'R' | 'pct';
  /** The R arm point in force when mode is 'R' (e.g. 1.0 = arm at +1R
   *  of the trade's own stop); null in 'pct' mode. */
  activationR: number | null;
  /** Valid closes in the window that exited on the brain's trailed
   *  stop (exit_reason 'trail'). Zero was structural before R mode:
   *  percent activation (15%, 8% floor) sat above this lane's +8%
   *  peak cap, so the brain could never arm. */
  guidedCloses: number;
  /** Valid closes in the window stamped brain-governed (the brain's
   *  floor bound at some point in the trade's life). */
  governedCloses: number;
  /** Average NET return % of the guided closes; null when none. */
  avgNetPctGuided: number | null;
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
 *
 * maxValidPct (optional): closes with |pct| beyond the bound are skipped
 * as corrupt. The stock-perp lane passes its ±100 bound — whole-balance
 * compounding is exactly where one poisoned row did the most damage (a
 * pct ≤ −100 would zero/invert the balance and flip the sign of every
 * later trade). The weather/sports lanes share this helper WITHOUT the
 * bound on purpose: their binary-contract closes legitimately exceed
 * +100% (a 10¢ YES that settles YES is +900%).
 */
export function accountReplay(
  closes: Array<number | { return_pct: number }>,
  startBalance = 100,
  maxValidPct?: number,
): KalshiAccountSimResult {
  const start = Number.isFinite(startBalance) && startBalance > 0 ? startBalance : 100;
  const bound = maxValidPct != null && Number.isFinite(maxValidPct) && maxValidPct > 0 ? maxValidPct : null;
  let balance = start;
  let peak = start;
  let maxDrawdownPct = 0;
  let worstTradePct: number | null = null;
  let bestTradePct: number | null = null;
  let trades = 0;
  for (const close of closes) {
    const pct = typeof close === 'number' ? close : Number((close as { return_pct: number })?.return_pct);
    if (!Number.isFinite(pct)) continue;
    if (bound != null && Math.abs(pct) > bound) continue;
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
  // The trail-brain section below reads the attribution stamp columns;
  // the ensure is the same lazy, idempotent, never-rejecting pattern
  // the stamp path uses, so the report works before any stamp lands.
  await ensureTrailBrainColumns('kalshi_perp_shadow_trades');

  // The abs(return_pct) bound + the notional bound are the read-time half
  // of the stats-validity quarantine: closes written before the write-time
  // stamp existed can still carry impossible values (the production
  // blow-up's row passes a return-only check almost cleanly — its
  // notional is the corrupt field), and no aggregate may consume them.
  const returnBound = maxValidReturnPct();
  const notionalCap = 2 * NOTIONAL();
  const entryCeiling = maxValidEntryUsd();
  const validCloseWhere = `user_id=$1 AND status='closed' AND exclude_from_stats IS NOT TRUE
    AND return_pct IS NOT NULL AND abs(return_pct) <= $3::float
    AND notional_usd <= greatest($4::float, entry_price * 1.5)
    AND entry_price <= $5::float
    AND closed_at >= now() - ($2::int * interval '1 day')`;
  const simOn = accountSimEnabled();
  const [summaryRes, byStrategyRes, openRes, recentClosesRes, closesRes, invalidRes, aiJudgeRes, trailBrainRes] = await Promise.all([
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
      [userId, windowDays, returnBound, notionalCap, entryCeiling]),
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
      [userId, windowDays, returnBound, notionalCap, entryCeiling]),
    pool.query(
      `SELECT id, strategy, ticker, underlying, direction, entry_price, stop_loss, take_profit,
         contracts, notional_usd, funding_accrued_usd, funding_estimate_usd, cost_model, score, max_hours, opened_at, cost_bps
       FROM kalshi_perp_shadow_trades
       WHERE user_id=$1 AND status='open'
       ORDER BY opened_at DESC
       LIMIT 30`,
      [userId]),
    pool.query(
      `SELECT t.id, t.strategy, t.ticker, t.underlying, t.direction, t.entry_price, t.exit_price,
         t.return_pct, t.r_multiple, t.funding_accrued_usd, t.funding_model, t.exit_reason, c.hold_minutes, t.closed_at
       FROM kalshi_perp_shadow_trades t
       LEFT JOIN kalshi_perp_shadow_context c ON c.trade_id=t.id AND c.user_id=t.user_id
       WHERE t.user_id=$1 AND t.status='closed' AND t.exclude_from_stats IS NOT TRUE
         AND t.return_pct IS NOT NULL AND abs(t.return_pct) <= $3::float
         AND t.notional_usd <= greatest($4::float, t.entry_price * 1.5)
         AND t.entry_price <= $5::float
         AND t.closed_at >= now() - ($2::int * interval '1 day')
       ORDER BY t.closed_at DESC
       LIMIT 10`,
      [userId, windowDays, returnBound, notionalCap, entryCeiling]),
    // Every valid close in the window, oldest first, for the $100-account
    // replay (the recent-closes list above is capped at 10 — never reuse it).
    // Same validCloseWhere, so corporate-action rows stay excluded.
    simOn
      ? pool.query(
        `SELECT strategy, return_pct::float AS return_pct, closed_at
         FROM kalshi_perp_shadow_trades
         WHERE ${validCloseWhere}
         ORDER BY closed_at ASC, id ASC`,
        [userId, windowDays, returnBound, notionalCap, entryCeiling])
      : Promise.resolve(null),
    // Quarantine count for the panel: closes stamped invalid at write
    // time (stats_invalid_reason set — those rows are also excluded, so
    // they need their own count), plus pre-fix rows that fail the bound
    // at read time and are not otherwise excluded. Corporate-action
    // exclusions (valid values, no stamp) are NOT counted here.
    pool.query(
      `SELECT count(*)::int AS invalid_count
       FROM kalshi_perp_shadow_trades
       WHERE user_id=$1 AND status='closed' AND return_pct IS NOT NULL
         AND closed_at >= now() - ($2::int * interval '1 day')
         AND (stats_invalid_reason IS NOT NULL
              OR (exclude_from_stats IS NOT TRUE
                  AND (abs(return_pct) > $3::float
                       OR notional_usd > greatest($4::float, entry_price * 1.5)
                       OR entry_price > $5::float)))`,
      [userId, windowDays, returnBound, notionalCap, entryCeiling]),
    // AI judge scoreboard rows: every valid close in the window whose
    // context row carries a judge verdict (same validity bounds as every
    // other statistic here, applied to the trade side of the join).
    // Fail-soft: a lane whose context table predates the judge columns
    // must still render its panel — the .catch at the call site turns a
    // failed read into an empty scoreboard.
    pool.query(
      `SELECT c.ai_judge_verdict AS verdict, t.return_pct, t.r_multiple, t.notional_usd
       FROM kalshi_perp_shadow_trades t
       JOIN kalshi_perp_shadow_context c ON c.trade_id = t.id AND c.user_id = t.user_id
       WHERE t.user_id=$1 AND t.status='closed' AND t.exclude_from_stats IS NOT TRUE
         AND c.ai_judge_verdict IS NOT NULL
         AND t.return_pct IS NOT NULL AND abs(t.return_pct) <= $3::float
         AND t.notional_usd <= greatest($4::float, t.entry_price * 1.5)
         AND t.entry_price <= $5::float
         AND t.closed_at >= now() - ($2::int * interval '1 day')`,
      [userId, windowDays, returnBound, notionalCap, entryCeiling]).catch(() => ({ rows: [] as any[] })),
    // Trail Brain evidence for the window: closes that exited on the
    // brain's trailed stop, and closes stamped brain-governed. Same
    // validity bounds as every other statistic here. Fail-soft like
    // the judge read — a missing stamp column must not sink the panel.
    pool.query(
      `SELECT
         (count(*) FILTER (WHERE exit_reason = 'trail'))::int AS guided_closes,
         (count(*) FILTER (WHERE trail_brain_version IS NOT NULL))::int AS governed_closes,
         avg(return_pct) FILTER (WHERE exit_reason = 'trail')::float AS avg_net_pct_guided
       FROM kalshi_perp_shadow_trades
       WHERE ${validCloseWhere}`,
      [userId, windowDays, returnBound, notionalCap, entryCeiling]).catch(() => ({ rows: [] as any[] })),
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
      // Exact-era rows also carry the in-window funding estimate for the
      // next print, so the unrealized figure isn't blind to the funding
      // charge that lands if the position is still open at 4pm ET. The
      // estimate is replaced by the actual print when it lands — it is
      // never added to funding_accrued_usd.
      const fundingUsdTotal = (Number(p.funding_accrued_usd) || 0)
        + (p.cost_model === COST_MODEL_EXACT ? (Number(p.funding_estimate_usd) || 0) : 0);
      const fundingPct = Number(p.notional_usd) > 0
        ? (fundingUsdTotal / Number(p.notional_usd)) * 100
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
      funding_estimate_usd: p.cost_model === COST_MODEL_EXACT ? (Number(p.funding_estimate_usd) || 0) : 0,
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
  const accountSim = simOn ? accountReplay(windowCloses, 100, maxValidReturnPct()) : undefined;
  const perStrategySim = new Map<string, KalshiAccountSimResult>();
  if (simOn) {
    const grouped = new Map<string, Array<{ return_pct: number }>>();
    for (const c of windowCloses) {
      const list = grouped.get(c.strategy) ?? [];
      list.push({ return_pct: c.return_pct });
      grouped.set(c.strategy, list);
    }
    grouped.forEach((list, strategy) => perStrategySim.set(strategy, accountReplay(list, 100, maxValidReturnPct())));
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
    earningsEnabled: perpEarningsEnabled(),
    earningsSkipsInWindow: brainBlockSummary?.earningsSkips ?? 0,
    favorBuckets,
    avoidBuckets,
    topBlocks: brainBlockSummary?.topBlocks ?? [],
  };

  // AI judge scoreboard: the judge's verdicts graded against the
  // window's real closes. Pure aggregation over the joined rows — the
  // same function the check script exercises on fixtures.
  const aiJudge: KalshiAiJudgePanelReport = {
    enabled: kalshiPerpAiJudgeEnabled(),
    judgedCloses: 0,
    scoreboard: aggregateAiJudgeScoreboard(((aiJudgeRes as any)?.rows || []).map((r: any) => ({
      verdict: r.verdict, returnPct: r.return_pct, rMultiple: r.r_multiple, notionalUsd: r.notional_usd,
    }))),
  };
  aiJudge.judgedCloses = aiJudge.scoreboard.judgedCloses;

  const aiWatchPlans: KalshiPerpWatchPlansPanelReport = kalshiPerpWatchPlansSummary(userId);

  // Small-account mirror state for the panel: the virtual wallet (read
  // only here — seeding happens on the entry path, never on a report).
  const saWalletReport = smallAccountEnabled() ? await loadPerpShadowWallet(userId).catch(() => null) : null;

  const tbRow = (trailBrainRes as any)?.rows?.[0] || {};
  const trailBrain: KalshiPerpTrailBrainReport = {
    mode: kalshiPerpTrailROn() ? 'R' : 'pct',
    activationR: kalshiPerpTrailROn() ? kalshiPerpTrailRGeometry().activationR : null,
    guidedCloses: Number(tbRow.guided_closes) || 0,
    governedCloses: Number(tbRow.governed_closes) || 0,
    avgNetPctGuided: tbRow.avg_net_pct_guided == null ? null : Number(tbRow.avg_net_pct_guided),
  };

  return {
    days: windowDays,
    ...(accountSim ? { accountSim } : {}),
    perpBrain,
    aiJudge,
    aiWatchPlans,
    trailBrain,
    summary: {
      openCount: Number(s.open_count) || 0,
      closedCount: Number(s.closed_count) || 0,
      wins: Number(s.wins) || 0,
      winRate: s.win_rate == null ? null : Number(s.win_rate),
      avgR: s.avg_r == null ? null : Number(s.avg_r),
      estNetPnlUsd: Number(s.est_net_pnl_usd) || 0,
      fundingUsd: Number(s.funding_usd) || 0,
      invalidExcludedCount: Number((invalidRes.rows[0] as any)?.invalid_count) || 0,
      lastOpenedAt: toIso(s.last_opened_at),
      lastClosedAt: toIso(s.last_closed_at),
      enabled: stockShadowEnabled(),
      virtualWalletEquityUsd: saWalletReport ? saWalletReport.equityUsd : null,
      smallAccountMode: saWalletReport ? perpSaMode(saWalletReport.equityUsd) : null,
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
      funding_model: String(r.funding_model || 'legacy'),
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

/** Every strategy key this lane can open under — the watch-plan layer
 *  validates plans against this set (a plan sharpens one of these; it is
 *  never a new signal source). */
const PERP_STRATEGY_KEYS: ReadonlySet<string> = new Set<string>([
  ...CRYPTO_PORTS,
  ...OPTIONS_PORTS.map((k) => `opt_${k}`),
  ...FX_PORTS.map((f) => f.id),
  'orb', 'composite_autonomous', 'funding_fade',
]);

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
interface FundingAccrual { usd: number; historyOk: boolean; throughMs: number }

/** Accrue every funding event crossed since the trade's watermark.
 *  PINNED convention: rate > 0 → longs pay. Payment (P&L) for a LONG is
 *  −rate × mark × contracts; a SHORT receives it.
 *
 *  Exact-era trades (cost_model='exact_v1') accrue through the shared
 *  kalshi-perp-costs module — Kalshi's ACTUAL historical prints with the
 *  0.01% deadband and ±2% cap applied exactly. Legacy-era trades keep
 *  the original print loop below, byte-for-byte: their era's accounting
 *  does not change retroactively. historyOk reports whether the
 *  historical read succeeded — the close path needs it for the
 *  estimate-fallback rule (fundingFallbackApplies). */
async function accrueFundingDetailed(t: any): Promise<FundingAccrual> {
  const since = Math.max(new Date(t.opened_at).getTime(), Number(t.funding_through_ms) || 0);
  const hist = await getPerpFundingHistory(t.ticker).catch(() => null);
  const historyOk = hist != null;
  const rates = hist ?? [];
  let accrued = Number(t.funding_accrued_usd) || 0;
  let through = since;
  if (t.cost_model === COST_MODEL_EXACT) {
    const r = accrueFundingFromPrints({
      direction: t.direction, contracts: Number(t.contracts),
      openedMs: new Date(t.opened_at).getTime(), throughMs: since, nowMs: Date.now(), prints: rates,
    });
    accrued += r.deltaUsd;
    through = r.throughMs;
  } else {
    for (const r of rates) {
      if (r.fundingTimeMs <= since || r.fundingTimeMs > Date.now()) continue;
      const notionalAtFunding = r.markPrice * Number(t.contracts);
      accrued += (t.direction === 'long' ? -1 : 1) * r.rate * notionalAtFunding;
      through = Math.max(through, r.fundingTimeMs);
    }
  }
  if (through !== since) {
    await pool.query(`UPDATE kalshi_perp_shadow_trades SET funding_accrued_usd=$2, funding_through_ms=$3 WHERE id=$1`, [t.id, accrued, through]);
  }
  return { usd: accrued, historyOk, throughMs: through };
}

async function accrueFunding(t: any): Promise<number> {
  return (await accrueFundingDetailed(t)).usd;
}

// ── resolver ────────────────────────────────────────────────────────────────
async function closeTrade(t: any, exit: number | null, why: string, fundingUsd: number, exclude: boolean, fundingModel?: string | null): Promise<boolean> {
  const short = t.direction === 'short';
  const gross = exit != null ? ((short ? t.entry_price - exit : exit - t.entry_price) / t.entry_price) * 100 : null;
  const fundingPct = gross != null && t.notional_usd > 0 ? (fundingUsd / t.notional_usd) * 100 : null;
  const net = gross != null ? gross + (fundingPct ?? 0) - Number(t.cost_bps) / 100 : null;
  const r = net != null && t.sl_pct > 0 ? net / t.sl_pct : null;
  // Stats-validity quarantine (2026-11-16 blow-up fix): a close whose
  // computed values are physically impossible for this lane (see the
  // ±100 bound above shadowCloseInvalidReason) is corrupt evidence —
  // an off-scale price print or a near-zero entry quote — not a result.
  // It still closes (the position is over), but it is stamped excluded
  // with the reason, exactly like a corporate-action close, so no
  // aggregate, bar check, or ledger read can ever consume it. The
  // computed values stay on the row for audit; exclusion is what keeps
  // them out of every statistic.
  const invalidReason = shadowCloseInvalidReason({
    entryPrice: t.entry_price, exitPrice: exit, grossPct: gross, fundingPct, netPct: net,
    notionalUsd: t.notional_usd, targetNotionalUsd: NOTIONAL(),
  });
  if (invalidReason) {
    exclude = true;
    console.warn(`[kalshi-stock-shadow] close quarantined as invalid (${invalidReason}): trade ${t.id} ${t.ticker} entry=${t.entry_price} exit=${exit} gross=${gross} fundingPct=${fundingPct} net=${net}`);
  }
  // funding_model: stamped at close for exact-era trades ('actual' /
  // 'estimate'); legacy rows keep the stamp they opened with. The
  // in-window estimate column is zeroed — booked truth is
  // funding_accrued_usd alone.
  const upd = await pool.query(
    `UPDATE kalshi_perp_shadow_trades SET status='closed', exit_price=$2, exit_reason=$3, gross_return_pct=$4, return_pct=$5,
       r_multiple=$6, funding_accrued_usd=$7, exclude_from_stats=$8, funding_estimate_usd=0,
       funding_model=CASE WHEN $9::text IS NOT NULL THEN $9 ELSE funding_model END,
       stats_invalid_reason=$10, closed_at=now() WHERE id=$1 AND status='open'`,
    [t.id, exit, why, gross, net, r, fundingUsd, exclude, fundingModel ?? null, invalidReason]);
  if (!upd.rowCount) return false;
  // Small-account mirror: compound the virtual wallet by this close's
  // net $ result (notional × net%). Excluded closes (corporate action,
  // quarantined-invalid) book NO wallet movement — their "result" spans
  // an adjusted series or corrupt prints, not a trade the account made.
  // Kill switch off → the wallet is never touched.
  if (smallAccountEnabled() && !exclude && net != null && Number(t.notional_usd) > 0) {
    await adjustPerpShadowWallet(Number(t.user_id), (Number(t.notional_usd) * net) / 100).catch(() => {});
  }
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
    const acc = await accrueFundingDetailed(t).catch(() => ({
      usd: Number(t.funding_accrued_usd) || 0, historyOk: false, throughMs: Number(t.funding_through_ms) || 0,
    }));
    let funding = acc.usd;
    // Exact-era funding provenance for the close stamp. Default
    // 'actual': everything booked came from Kalshi's prints. The one
    // exception is the fail-soft rule — the historical read failed
    // across a 4pm ET print this position crossed: book the in-progress
    // estimate for that print rather than pretending funding was zero,
    // and stamp the trade 'estimate' so the substitution is visible in
    // the record forever (never silent).
    let fundingModel: string | null = null;
    if (t.cost_model === COST_MODEL_EXACT) {
      fundingModel = 'actual';
      if (fundingFallbackApplies(acc.historyOk, acc.throughMs, Date.now())) {
        fundingModel = 'estimate';
        const est = await getPerpFundingEstimate(t.ticker).catch(() => null);
        const touch = await getPerpTouch(t.ticker).catch(() => null);
        const mark = touch ? (touch.bid + touch.ask) / 2 : Number(t.entry_price);
        if (est) funding += fundingPnlUsd(t.direction, est.rate, mark, Number(t.contracts));
      }
    }
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
      if (await closeTrade(t, latest ? latest.c : Number(t.entry_price), 'corporate_action', funding, true, fundingModel)) closed++;
      continue;
    }
    const short = t.direction === 'short';
    const ageH = (Date.now() - openedMs) / 3_600_000;
    let exit: number | null = null, why = '';
    // Trail Brain: the group's learned parameters (kalshi × strategy ×
    // underlying, % units) may raise a trailed stop behind the peak.
    // The trailed stop is clamped at the trade's own stop inside
    // trailBrainDecide (−sl_pct), so it can only tighten; the hard
    // stop/target checks keep their order and priority. Activation
    // runs on the trade's OWN R geometry (kalshiPerpTrailActivation):
    // the percent defaults (arm at 15%, 8% hard floor) could never arm
    // on a lane whose peak caps at +8% (2R target on a ≤4% stop) —
    // R mode arms at +1R of this trade's stop instead.
    // KALSHI_PERP_TRAIL_R=off restores percent activation.
    const tb = await trailBrainConsult(userId, 'kalshi', String(t.strategy || 'all'), String(t.underlying || 'all'));
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
        if (tb) {
          const ts = trailBrainStopPrice({ direction: String(t.direction), entryPrice: Number(t.entry_price), peakGainPct: Number(t.peak_gain_pct) || 0, currentGainPct: gain, slPct: Number(t.sl_pct), params: tb.params, rActivation: kalshiPerpTrailActivation({ entryPrice: Number(t.entry_price), takeProfit: Number(t.take_profit), slPct: Number(t.sl_pct) }) ?? undefined });
          if (ts) {
            void stampTrailBrainTrade('kalshi_perp_shadow_trades', t.id, tb);
            if (short ? cd.ask.h >= ts.stopPrice : cd.bid.l <= ts.stopPrice) {
              exit = short ? Math.max(ts.stopPrice, cd.ask.o) : Math.min(ts.stopPrice, cd.bid.o); why = 'trail'; break;
            }
          }
        }
        if (short ? cd.ask.l <= t.take_profit : cd.bid.h >= t.take_profit) { exit = Number(t.take_profit); why = 'target'; break; }
      }
      if (!why && ageH >= t.max_hours) {
        const touch = await getPerpTouch(t.ticker).catch(() => null);
        exit = touch ? (short ? touch.ask : touch.bid) : latest.c; why = 'time limit';
      }
    } else if (ageH >= t.max_hours + 24) { exit = null; why = 'no price'; }
    if (!why) {
      // Still open: refresh the exact-era in-window funding estimate for
      // the next 4pm ET print (display-only — it is replaced by the
      // actual print when it lands, never booked from here).
      if (t.cost_model === COST_MODEL_EXACT) {
        const est = await getPerpFundingEstimate(t.ticker).catch(() => null);
        const mark = latest ? latest.c : Number(t.entry_price);
        const estUsd = est ? fundingPnlUsd(t.direction, est.rate, mark, Number(t.contracts)) : 0;
        await pool.query(`UPDATE kalshi_perp_shadow_trades SET funding_estimate_usd=$2 WHERE id=$1`, [t.id, estUsd]).catch(() => {});
      }
      continue;
    }
    if (await closeTrade(t, exit, why, funding, false, fundingModel)) closed++;
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
  // AI judge evidence base (2026-11-22 scope refinement): the lane's own
  // recent closes, gathered ONCE per entry cycle and only when the judge
  // is on — grouped by underlying (ticker history + last-10 closes) and
  // by strategy (overall record + 14d form) in the candidate loop. One
  // bounded read (500 newest valid closes), fail-soft: no history simply
  // means the judge sees a thinner prompt, never a blocked entry.
  const judgeOn = kalshiPerpAiJudgeEnabled();
  // Watch plans (kalshi-perp-watch-plans.ts) weigh the SAME evidence
  // base as the judge, so the per-cycle gather runs when either layer
  // is on. The plan layer's per-cycle deep-call budget is created here,
  // once, and shared across every candidate below.
  const plansOn = kalshiPerpWatchPlansEnabled();
  const planCycle = newPerpPlanCycle();
  const judgeRowsByUnderlying = new Map<string, any[]>();
  const judgeRowsByStrategy = new Map<string, any[]>();
  if (judgeOn || plansOn) {
    const { rows: judgeRows } = await pool.query(
      `SELECT underlying, strategy, direction, return_pct, r_multiple, closed_at
         FROM kalshi_perp_shadow_trades
        WHERE user_id=$1 AND status='closed' AND exclude_from_stats IS NOT TRUE
          AND return_pct IS NOT NULL AND abs(return_pct) <= $2::float
        ORDER BY closed_at DESC LIMIT 500`,
      [userId, maxValidReturnPct()]).catch(() => ({ rows: [] as any[] }));
    for (const r of judgeRows) {
      const u = String(r.underlying), s = String(r.strategy);
      (judgeRowsByUnderlying.get(u) ?? judgeRowsByUnderlying.set(u, []).get(u)!).push(r);
      (judgeRowsByStrategy.get(s) ?? judgeRowsByStrategy.set(s, []).get(s)!).push(r);
    }
  }
  // Small-account brain (kalshi-perp-small-account.ts): this cycle's
  // account context — the real margin equity (ONE fail-soft read, only
  // when credentials exist; the lane stays fully usable without them)
  // and the virtual wallet the mirror sizes against, seeded on first
  // use from that real figure (else $25). The resolver already ran
  // above, so the wallet loaded here reflects this cycle's closes.
  // Kill switch off → none of this runs and the lane is the pre-build
  // lane exactly (fixed $250 sizing, no AI account context).
  const saOn = smallAccountEnabled();
  let saRealEquityUsd: number | null = null;
  let saWallet: PerpShadowWallet | null = null;
  let saAccountContext: PerpAccountContext | null = null;
  if (saOn) {
    try {
      if (loadKalshiCredentials(userId)) {
        const bal = await getKalshiMarginBalance(userId);
        saRealEquityUsd = bal?.equityUsd ?? null;
      }
    } catch { saRealEquityUsd = null; }
    saWallet = await getOrSeedPerpShadowWallet(userId, saRealEquityUsd).catch(() => null);
    if (saWallet) {
      saAccountContext = { realEquityUsd: saRealEquityUsd, virtualEquityUsd: saWallet.equityUsd, mode: perpSaMode(saWallet.equityUsd) };
    }
  }
  const markets = await getLiquidStockPerps().catch(() => [] as PerpMarket[]);
  if (!markets.length) return { opened: 0, closed };
  // Earnings calendar for this cycle (build #3): one lookup per lane
  // underlying against the daily-cached Nasdaq snapshot. Lookups share
  // the single in-flight fetch cycle; any failure reads UNKNOWN and
  // unknown never blocks. Skipped entirely when the blackout is off —
  // no fetch, and the context stamp stays NULL exactly as before.
  const earningsByUnderlying = new Map<string, EarningsLookup>();
  if (perpEarningsEnabled()) {
    const universe = Array.from(new Set(markets.map((m) => m.underlying).filter(Boolean)));
    await Promise.all(universe.map(async (u) => {
      earningsByUnderlying.set(u, await getEarningsInfo(u, universe).catch(() => ({ known: false } as EarningsLookup)));
    }));
  }
  // Funding-fade distribution book for this cycle (build #3): trailing
  // realized funding prints per ticker + the lane pool, ~30-min cached
  // inside the module (funding prints once a day). Fail-soft — no book,
  // no funding_fade signals.
  const fundingBook: FundingFadeBook | null = fundingFadeEnabled()
    ? await buildFundingFadeBook(markets.map((m) => m.ticker)).catch(() => null)
    : null;
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
    // Funding-extremes fade (build #3): the ticker's latest realized
    // funding print in the outer decile of its trailing distribution →
    // take the other side of the crowd. The signal flows into the SAME
    // entry machinery below (touch entry, ATR stop, 2R target, funding +
    // cost model, brain gate, VP veto, earnings blackout) as every
    // other lane strategy — the fade earns no exemptions.
    if (fundingBook) {
      const ff = fundingFadeForTicker(mkt.ticker, fundingBook);
      if (ff) signals.push({ strategy: 'funding_fade', direction: ff.direction, score: null });
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
    // Data-sanity cross-check (2026-11-16 stats blow-up fix): the touch
    // and the H1 candle close are independent reads of the same price.
    // If they disagree by more than 3×, one source is off-scale — the
    // near-zero / wrong-unit quote that later explodes return_pct when
    // it becomes a close's denominator. Skip the ticker this cycle
    // rather than opening a position on a corrupt entry price.
    if (!(bid >= lastClose / 3 && ask <= lastClose * 3)) {
      console.warn(`[kalshi-stock-shadow] skipping ${mkt.ticker}: touch ${bid}/${ask} disagrees with H1 close ${lastClose} — off-scale price suspected`);
      continue;
    }
    const spreadBps = ((ask - bid) / ((ask + bid) / 2)) * 10_000;
    const fundEst = await getPerpFundingEstimate(mkt.ticker).catch(() => null);
    const slPct = Math.min(SL_HI(), Math.max(SL_LO(), ATR_MULT() * atrPct));
    // Accounting era for everything opened this cycle (kalshi-perp-
    // costs.ts): exact era stamps the published tier-0 taker round trip
    // (12 bps open + 12 bps close = 24) — this lane's client is
    // public-only by construction, so the published schedule is its fee
    // source, stated openly; the legacy era keeps the 20 bps modeled
    // placeholder. The cost floor below judges the stamped figure.
    const exactEra = exactCostsEnabled();
    const costBps = exactEra ? roundTripCostBps(PUBLISHED_FEE_SCHEDULE) : FEE_BPS();
    const costModel = exactEra ? COST_MODEL_EXACT : COST_MODEL_LEGACY;
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

    // This ticker's earnings lookup for the candidate loop (build #3):
    // consulted by the blackout below and stamped on the context row.
    const eInfo: EarningsLookup | undefined = earningsByUnderlying.get(mkt.underlying);

    for (const sig of signals) {
      if (open.length >= MAX_OPEN()) break;
      if (open.filter((o) => o.strategy === sig.strategy).length >= MAX_PER_STRAT()) continue;
      if (open.some((o) => o.strategy === sig.strategy && o.underlying === mkt.underlying)) continue;
      if (recent.some((o) => o.strategy === sig.strategy && o.underlying === mkt.underlying)) continue;
      const short = sig.direction === 'short';
      const entry = short ? bid : ask;
      const stop = short ? entry * (1 + slPct / 100) : entry * (1 - slPct / 100);
      const target = short ? entry * (1 - slPct * RR() / 100) : entry * (1 + slPct * RR() / 100);
      // Small-account mirror sizing: the SAME ladder math the live lane
      // runs (same bands/risks/caps, fractional contracts), against the
      // virtual wallet — so the record this lane builds is a
      // small-account record, not a $250 record. A candidate the ladder
      // sizes below the minimum increment is skipped: on a tiny wallet
      // that is the honest answer for an expensive perp. The ladder's
      // margin cap uses the live lane's assumed leverage (5x default).
      // Kill switch off (or an unseeded wallet) → the fixed-$250 line.
      let contracts: number;
      let notional: number;
      if (saOn && saWallet) {
        const levRaw = Number(process.env.KALSHI_PERP_LIVE_ASSUMED_LEVERAGE);
        const sized = sizePerpByRisk({
          equityUsd: saWallet.equityUsd, price: entry, slPct, mode: perpSaMode(saWallet.equityUsd),
          availableMarginUsd: saWallet.equityUsd, leverage: Number.isFinite(levRaw) && levRaw > 0 ? levRaw : 5,
        });
        if (sized.contracts < SA_MIN_INCREMENT()) continue;
        contracts = sized.contracts;
        notional = sized.notionalUsd;
      } else {
        contracts = Math.max(1, Math.round(NOTIONAL() / entry));
        notional = contracts * entry;
      }
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
      // ── Earnings blackout (build #3, kalshi-earnings-calendar.ts): a
      // KNOWN earnings report inside the window skips EVERY strategy on
      // this ticker — earnings gaps are not a setup any lane strategy is
      // priced for. Skips are audit-logged as reason 'earnings' with the
      // report date as the bucket value. An UNKNOWN calendar (source
      // down / symbol not covered) never blocks: earningsBlockApplies
      // only fires on a known date inside the window.
      if (perpEarningsEnabled() && eInfo && earningsBlockApplies(eInfo, now, earningsWindowH())) {
        await logPerpBrainBlocks(userId, [{
          strategy: sig.strategy, ticker: mkt.ticker, underlying: mkt.underlying, direction: sig.direction,
          reason: 'earnings' as const, bucketDim: 'earnings', bucketValue: eInfo.known ? eInfo.date : null,
          medianNetPct: null, bucketN: null,
        }]);
        continue;
      }
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
      // ── Improvement-loop throttle (improvement-loop.ts): the shared
      // cross-engine evaluation (6h cadence) pauses NEW shadow entries
      // for a strategy whose last-14-days trend is DEGRADING vs the
      // prior 14, until recovery or 7 days. Complements — never
      // replaces — the perp brain's own bucket gate above; the consult
      // fails open, and open positions are never affected.
      if (await improvementThrottleBlocks(userId, 'kalshi_perp', sig.strategy)) {
        logImprovementBlock(userId, 'kalshi_perp', sig.strategy, mkt.ticker);
        continue;
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
      // earnings_within_48h stamp (build #3): true/false only when the
      // calendar KNOWS (see earningsStampValue); NULL when unknown or
      // the feature is off — the column's original stub semantics.
      const earnings48 = perpEarningsEnabled() && eInfo ? earningsStampValue(eInfo, now) : null;
      // The lane's collected evidence for this candidate — weighed by
      // BOTH AI layers below (watch-plan study and judge): this ticker's
      // history (aggregates + last 10 closes), this strategy's record
      // and recent form, and the candidate's own bucket evidence — all
      // from the per-cycle gather above and the bucket stats the brain
      // gate already computed. Aggregates only; the prompt builders cap
      // every section.
      const tickerRows = judgeRowsByUnderlying.get(mkt.underlying) || [];
      const tickerHistory: JudgeTickerHistory = {
        summary: summarizeJudgeRows(tickerRows.map((r: any) => ({ netPct: r.return_pct, rMultiple: r.r_multiple }))),
        recent: tickerRows.slice(0, 10).map((r: any) => ({
          strategy: String(r.strategy), direction: String(r.direction),
          netPct: Number(r.return_pct), rMultiple: r.r_multiple == null ? null : Number(r.r_multiple),
        })),
      };
      const strategyRows = judgeRowsByStrategy.get(sig.strategy) || [];
      const strategyRecord: JudgeStrategyRecord = strategyRecordFromRows(
        strategyRows.map((r: any) => ({
          netPct: r.return_pct, rMultiple: r.r_multiple,
          closedAtMs: new Date(r.closed_at).getTime(),
        })), now);
      const bucketEvidence = bucketEvidenceFor(stats, sig.strategy, kalshiBucketsOf(ctx));
      // ── AI watch plans (kalshi-perp-watch-plans.ts): this candidate
      // has passed EVERY existing gate above (earnings, brain,
      // improvement throttle, VP veto) in its existing order. With plans
      // ON, the entry additionally needs a live plan for this
      // ticker+strategy whose trigger has formed on the H1 bars this
      // cycle already fetched (free, deterministic — watching buys
      // nothing). No triggered plan → the signal is skipped and counted
      // by the plan layer (planSkips); that is the design. A plan-layer
      // FAILURE degrades to today's mechanical entry for this candidate
      // (action 'fallback', counted separately) — the lane never halts.
      // resolvePerpWatchPlan never throws; the try/catch is
      // belt-and-braces with the same fallback semantics.
      let viaPlan = false;
      let budgetDegradedEntry = false;
      if (plansOn) {
        let res: PerpWatchPlanAction = { action: 'fallback' };
        try {
          res = await resolvePerpWatchPlan({
            userId, ticker: mkt.ticker, underlying: mkt.underlying, strategy: sig.strategy,
            signalDirection: sig.direction, signalScore: sig.score,
            entryPrice: entry, slPct, atrPct,
            fundingRate: fundEst?.rate ?? null, h1Trend, h4Trend, vpPosition: vpPos,
            earningsWithin48h: earnings48,
            recentCloses: h1Bars.slice(-12).map((b) => b.c),
            tickerHistory, strategyRecord, bucketEvidence,
            accountContext: saAccountContext,
            candlesNewestFirst: h1Bars.slice().reverse().map((b) => ({ o: b.o, h: b.h, l: b.l, c: b.c })),
            currentPrice: lastClose,
          }, planCycle, { strategyKeys: PERP_STRATEGY_KEYS });
        } catch { res = { action: 'fallback' }; }
        if (res.action === 'skip') continue;
        viaPlan = res.action === 'triggered';
        if (res.action === 'fallback' && res.budgetDegraded) {
          // AI budget degrade (2026-11-26): this entry proceeds on the
          // strategy's own signal because the watch-plan STUDY was
          // budget-refused — no plan was bought and no AI was involved.
          // The context row's tags carry the durable rules_only_budget
          // marker (the lane's plan-error fallback stays untagged: that
          // one is a malfunction, not a budget state).
          tags.push(AI_BUDGET_DEGRADED_MODE);
          budgetDegradedEntry = true;
        }
      }
      // ── AI judge (kalshi-perp-ai-judge.ts): this candidate has passed
      // EVERY gate above (earnings, brain, improvement throttle, VP
      // veto — and, when plans are on, the plan trigger) and is about to
      // open — only now is it judged, so blocked candidates never spend
      // from the shared AI pool. The verdict is stamped on the context
      // row below and scored against the outcome later; it is NEVER
      // consulted here — no branch below reads it, and the entry
      // proceeds identically whatever it says (including 'no_verdict' on
      // any AI failure: judgeKalshiPerpCandidate never throws, and the
      // .catch is belt-and-braces).
      let judge: PerpAiJudgeResult | null = null;
      if (judgeOn) {
        judge = await judgeKalshiPerpCandidate({
          userId, strategy: sig.strategy, ticker: mkt.ticker, underlying: mkt.underlying,
          direction: sig.direction, entryPrice: entry, score: sig.score,
          sessionEt: ctx.session_et, spreadBps, atrPct,
          fundingRateAtEntry: fundEst?.rate ?? null, htfAligned: aligned,
          h1Trend, h4Trend, vpPosition: vpPos,
          adviceAtEntry: adviceFor(stats, sig.strategy, ctx),
          recentCloses: h1Bars.slice(-12).map((b) => b.c),
          earningsWithin48h: earnings48,
          tickerHistory,
          strategyRecord,
          bucketEvidence: bucketEvidenceFor(stats, sig.strategy, kalshiBucketsOf(ctx)),
          accountContext: saAccountContext,
        }).catch(() => null);
      }
      const ins = await pool.query(
        `INSERT INTO kalshi_perp_shadow_trades (user_id, strategy, ticker, underlying, direction, entry_price, entry_bid, entry_ask,
           stop_loss, take_profit, sl_pct, contracts, notional_usd, cost_bps, cost_model, funding_model, score, max_hours)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
        [userId, sig.strategy, mkt.ticker, mkt.underlying, sig.direction, entry, bid, ask, stop, target, slPct, contracts, notional, costBps, costModel, exactEra ? COST_MODEL_EXACT : 'legacy', sig.score, paperMaxHoursFor(sig.strategy)]);
      const id = ins.rows[0]?.id;
      if (!id) continue;
      // Degraded entries also carry the plain-voice context line on the
      // context row's text record, next to the rules_only_budget tag —
      // so the record says in plain words why no plan was involved.
      const adviceAtEntry = budgetDegradedEntry
        ? `${adviceFor(stats, sig.strategy, ctx)} | ${KALSHI_PERP_DEGRADED_CONTEXT_LINE}`
        : adviceFor(stats, sig.strategy, ctx);
      await pool.query(
        `INSERT INTO kalshi_perp_shadow_context (trade_id, user_id, strategy, ticker, direction, spread_bps, volume_24h_usd, open_interest,
           atr_pct, h1_trend, h4_trend, htf_aligned, funding_rate_at_entry, session_et, hour_utc, hour_et, day_of_week,
           earnings_within_48h, corporate_action_pending, live_gate_blocked, leverage_estimate, tags, advice_at_entry,
           vp_poc, vp_vah, vp_val, vp_position,
           ai_judge_verdict, ai_judge_confidence, ai_judge_reason, ai_judge_model, ai_judge_failure, ai_judge_metered,
           sa_virtual_equity_usd, sa_mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35) ON CONFLICT (trade_id) DO NOTHING`,
        [id, userId, sig.strategy, mkt.ticker, sig.direction, spreadBps, mkt.volume24hNotionalUsd, mkt.openInterest,
         atrPct, h1Trend, h4Trend, aligned, fundEst?.rate ?? null, ctx.session_et, new Date(now).getUTCHours(), et.hour, et.dow,
         earnings48, pendingCa.has(mkt.ticker), agreeing < 2, mkt.leverageEstimate, tags, adviceAtEntry,
         vpProfile?.poc ?? null, vpProfile?.vah ?? null, vpProfile?.val ?? null, vpPos,
         judge?.verdict ?? null, judge?.confidence ?? null, judge?.reason ?? null,
         judge?.model ?? null, judge?.failure ?? null, judge ? judge.metered : null,
         saOn && saWallet ? saWallet.equityUsd : null, saOn && saWallet ? perpSaMode(saWallet.equityUsd) : null]).catch(() => {});
      open.push({ strategy: sig.strategy, underlying: mkt.underlying });
      if (viaPlan) notePerpPlanEntry(userId);
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
let _tickInFlight = false;
/** Start the 5-minute lane tick (resolver + entries each tick). Idempotent; never throws. */
export function startKalshiStockShadow(): void {
  if (_started) return;
  _started = true;
  if (!stockShadowEnabled()) { console.log('[kalshi-stock-shadow] disabled (KALSHI_STOCK_SHADOW=off).'); return; }
  const tick = async () => {
    // In-flight guard (mirrors the crypto scanner's): with the widened
    // 40-ticker universe a cycle can outlast the 5-minute tick, and two
    // overlapping cycles would double the Kalshi API load for no extra
    // coverage — the second tick's resolver pass is idempotent but not
    // free. Skip the tick; the next one lands 5 minutes later.
    if (_tickInFlight) { console.warn('[kalshi-stock-shadow] previous cycle still running — skipping this tick.'); return; }
    _tickInFlight = true;
    try {
      const uid = await resolveOwnerUserId();
      if (uid) await runKalshiStockShadowCycle(uid);
      loopTick('kalshi-stock-shadow');
    } catch (e: any) { console.error('[kalshi-stock-shadow] tick failed (non-fatal):', e?.message ?? e); }
    finally { _tickInFlight = false; }
  };
  setTimeout(tick, 3 * 60_000).unref?.();
  setInterval(tick, TICK_MS).unref?.();
  console.log('[kalshi-stock-shadow] started — SHADOW lane on public Kalshi perp data (no credentials, no orders).');
}
