// ─────────────────────────────────────────────────────────────────────────────
// Kalshi perp EXACT cost accounting — shared by the stock-perp SHADOW lane
// (kalshi-stock-shadow.ts) and the stock-perp LIVE lane
// (kalshi-perp-live.ts) so a strategy's shadow proof and its live record
// are computed with IDENTICAL fee/funding math (2026-11-16, Chris-approved
// accuracy upgrade; research basis:
// research_notes/kalshi-perps-opensource-20261115.md).
//
// This module is PURE: no DB, no fetch, no credential store, no imports
// from the authenticated client. That is deliberate — the shadow lane's
// core safety property is that it cannot reach an authenticated path, and
// importing this module must never change that. Callers that CAN reach
// Kalshi's authenticated API (the live lane, via kalshi-trading.ts) fetch
// the fee-tier payload themselves and hand it to parseFeeTiersPayload().
//
// FEES — published tier-0 schedule (two independent sources agree: the
// CFTC-filed tier table via the quantfirm venue dossier, and Hummingbot's
// kalshi_perpetual fee schema): 12 bps TAKER / 5 bps MAKER on USD
// notional, charged on OPEN and on CLOSE (a taker round trip is 24 bps).
// When an authenticated /margin/fee_tiers read succeeds, its base tier
// replaces the published constants; any failure falls back to published.
// Which source is active is always explicit (PerpFeeSchedule.source) —
// never silent.
//
// FUNDING — stock perps settle funding ONCE DAILY at 16:00 ET. The lane
// accrues from Kalshi's ACTUAL historical prints (never a reimplemented
// premium formula — Kalshi's own sources conflict on the formula, the
// prints are ground truth). Rates pass through normalizeFundingRate():
// |rate| < 0.01% (the deadband) pays exactly 0, and the rate is clamped
// to the ±2% cap — applied exactly, and idempotent on Kalshi's own
// already-normalized prints. During a holding window the in-progress
// estimate is carried separately (funding_estimate_usd on the row) and
// is REPLACED by the actual print when it lands — an estimate is never
// booked as realized funding unless the historical read failed at close
// time, and then the trade is stamped funding_model='estimate' so the
// substitution is visible in the record forever.
//
// ANNUALIZATION CONVENTION (the ~9× trap, pinned): a funding rate series
// annualizes as the MEAN OVER ALL INTERVALS — zero/deadband intervals
// included — times the number of intervals per year. Annualizing only
// the intervals that charged overstates funding by ~9× on real Kalshi
// data (most windows pay nothing). annualizedFundingPct() is the only
// annualization this module offers; there is deliberately no
// charging-only variant.
//
// ERAS: exact accounting applies GOING FORWARD only. Rows opened under
// it carry cost_model='exact_v1'; older rows and rows opened while the
// kill switch is off keep cost_model='placeholder' (the legacy modeled
// 20 bps round trip) and their recorded nets are never rewritten. The
// $100-account replay and bucket stats read each trade's own recorded
// return_pct, so eras coexist honestly in the same stats.
//
// Kill switch: KALSHI_PERP_EXACT_COSTS=off → callers use the legacy
// modeled costs exactly as before this module existed (era stamps still
// distinguish the rows).
// ─────────────────────────────────────────────────────────────────────────────

/** Master switch for exact cost accounting. Read dynamically so the
 *  env flip takes effect without a restart of the accounting decision. */
export const exactCostsEnabled = () => process.env.KALSHI_PERP_EXACT_COSTS !== 'off';

/** Accounting-era stamps written onto trade rows. */
export const COST_MODEL_EXACT = 'exact_v1';
export const COST_MODEL_LEGACY = 'placeholder';

// ── fees ────────────────────────────────────────────────────────────────────
export const PERP_FEE_TAKER_BPS = 12;
export const PERP_FEE_MAKER_BPS = 5;

export type FeeLiquidity = 'taker' | 'maker';

export interface PerpFeeSchedule {
  takerBps: number;
  makerBps: number;
  /** 'api' = parsed from an authenticated /margin/fee_tiers read;
   *  'published' = the published tier-0 schedule (documented fallback). */
  source: 'api' | 'published';
}

/** The published tier-0 schedule — the fallback whenever the
 *  authenticated fee-tier read is unavailable or unparseable. */
export const PUBLISHED_FEE_SCHEDULE: PerpFeeSchedule = {
  takerBps: PERP_FEE_TAKER_BPS,
  makerBps: PERP_FEE_MAKER_BPS,
  source: 'published',
};

const saneBps = (v: number) => Number.isFinite(v) && v >= 0 && v <= 100;

/** A fee value from an API payload: either already in bps (12) or a
 *  decimal fraction of notional (0.0012). Values ≤ 0.1 read as fractions;
 *  anything larger reads as bps. Returns null when unusable. */
function feeValueToBps(v: any): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  const bps = n <= 0.1 ? n * 10_000 : n;
  return saneBps(bps) ? Math.round(bps * 10_000) / 10_000 : null;
}

const TAKER_KEYS = ['taker_fee_bps', 'taker_bps', 'taker_fee', 'takerFeeBps', 'taker'];
const MAKER_KEYS = ['maker_fee_bps', 'maker_bps', 'maker_fee', 'makerFeeBps', 'maker'];

function pickFee(entry: any, keys: string[]): number | null {
  for (const k of keys) {
    if (entry && entry[k] != null) {
      const bps = feeValueToBps(entry[k]);
      if (bps != null) return bps;
    }
  }
  return null;
}

/**
 * Parse a GET /margin/fee_tiers payload into a fee schedule. Defensive
 * across the documented shape variants (array under fee_tiers / tiers /
 * the payload itself; per-tier fee fields in bps or decimal). The BASE
 * tier is the one with the highest taker fee — an account's volume tier
 * cannot be identified from the payload alone, and tier 0 is both the
 * documented entry tier and the conservative choice. Returns null when
 * nothing sane parses, so callers fall back to the published schedule.
 */
export function parseFeeTiersPayload(data: any): PerpFeeSchedule | null {
  const arr: any[] = Array.isArray(data) ? data
    : Array.isArray(data?.fee_tiers) ? data.fee_tiers
    : Array.isArray(data?.feeTiers) ? data.feeTiers
    : Array.isArray(data?.tiers) ? data.tiers
    : [];
  let best: PerpFeeSchedule | null = null;
  for (const entry of arr) {
    const takerBps = pickFee(entry, TAKER_KEYS);
    const makerBps = pickFee(entry, MAKER_KEYS);
    if (takerBps == null || makerBps == null) continue;
    if (!best || takerBps > best.takerBps) best = { takerBps, makerBps, source: 'api' };
  }
  return best;
}

/** API schedule when one was read, else the published tier-0 schedule. */
export function resolveFeeSchedule(api: PerpFeeSchedule | null | undefined): PerpFeeSchedule {
  return api ?? PUBLISHED_FEE_SCHEDULE;
}

/** Fee in USD for one leg (open or close) on a USD notional. */
export function feeUsd(notionalUsd: number, schedule: PerpFeeSchedule, liquidity: FeeLiquidity): number {
  if (!(notionalUsd > 0)) return 0;
  const bps = liquidity === 'maker' ? schedule.makerBps : schedule.takerBps;
  return (notionalUsd * bps) / 10_000;
}

/** Round-trip cost in bps for an open+close pair (the figure the shadow
 *  lane stamps as cost_bps and checks its entry cost floor against). */
export function roundTripCostBps(schedule: PerpFeeSchedule, openLiquidity: FeeLiquidity = 'taker', closeLiquidity: FeeLiquidity = 'taker'): number {
  const open = openLiquidity === 'maker' ? schedule.makerBps : schedule.takerBps;
  const close = closeLiquidity === 'maker' ? schedule.makerBps : schedule.takerBps;
  return open + close;
}

// ── funding ─────────────────────────────────────────────────────────────────
/** Funding deadband: |rate| below 0.01% pays exactly zero. */
export const FUNDING_DEADBAND = 0.0001;
/** Funding cap: a single window's rate never exceeds ±2%. */
export const FUNDING_CAP = 0.02;

/**
 * Normalize a funding rate exactly as Kalshi settles it: inside the
 * deadband → 0; beyond the cap → clamped to ±cap. Idempotent on Kalshi's
 * own historical prints (already normalized venue-side).
 */
export function normalizeFundingRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  if (Math.abs(rate) < FUNDING_DEADBAND) return 0;
  return Math.max(-FUNDING_CAP, Math.min(FUNDING_CAP, rate));
}

/**
 * Signed funding P&L in USD for one funding event. PINNED convention
 * (Kalshi docs): rate > 0 → LONGS PAY SHORTS, so a long's P&L is
 * −rate × mark × contracts and a short receives it.
 */
export function fundingPnlUsd(direction: string, rate: number, markPrice: number, contracts: number): number {
  const r = normalizeFundingRate(rate);
  if (r === 0 || !(markPrice > 0) || !(contracts > 0)) return 0;
  return (direction === 'long' ? -1 : 1) * r * markPrice * contracts;
}

export interface FundingPrint { fundingTimeMs: number; rate: number; markPrice: number }

/**
 * Accrue funding from ACTUAL historical prints over the window
 * (max(openedMs, throughMs), nowMs]. Pure: returns the delta to add to
 * the position's accrued funding and the advanced watermark. Prints at
 * or before the window start and prints in the future never count, so
 * re-running accrual is idempotent — the print that lands replaces any
 * estimate carried for its window, it never stacks on top of it.
 */
export function accrueFundingFromPrints(args: {
  direction: string; contracts: number; openedMs: number; throughMs: number; nowMs: number;
  prints: FundingPrint[];
}): { deltaUsd: number; throughMs: number; applied: number } {
  const since = Math.max(args.openedMs, args.throughMs);
  let deltaUsd = 0;
  let through = since;
  let applied = 0;
  for (const p of args.prints) {
    if (p.fundingTimeMs <= since || p.fundingTimeMs > args.nowMs) continue;
    deltaUsd += fundingPnlUsd(args.direction, p.rate, p.markPrice, args.contracts);
    through = Math.max(through, p.fundingTimeMs);
    applied++;
  }
  return { deltaUsd, throughMs: through, applied };
}

// ── the daily 16:00 ET print boundary ───────────────────────────────────────
const etDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });

/** UTC ms for a New York wall-clock time, resolved through the ET offset
 *  in force on that date (DST-safe via a two-pass offset fix-up). */
function etWallTimeToUtcMs(y: number, mo: number, d: number, hh: number, mi: number): number {
  const guess = Date.UTC(y, mo - 1, d, hh, mi);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date(guess));
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'), g('second'));
  return guess + (guess - asUtc);
}

function etDateParts(ms: number): { y: number; mo: number; d: number; dow: number } {
  const parts = etDateFmt.formatToParts(new Date(ms));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { y: Number(g('year')), mo: Number(g('month')), d: Number(g('day')), dow: dowMap[g('weekday')] ?? 0 };
}

/**
 * The most recent daily funding print time (16:00 ET on a weekday) at or
 * before nowMs. Stock perps fund once daily at 4pm ET on trading days;
 * weekends have no print (the market itself is closed Fri 17:00 ET →
 * Sun 18:00 ET), so a Friday position's next print is Monday's.
 */
export function lastFundingPrintMs(nowMs: number): number {
  let { y, mo, d, dow } = etDateParts(nowMs);
  for (let back = 0; back < 5; back++) {
    if (dow >= 1 && dow <= 5) {
      const t = etWallTimeToUtcMs(y, mo, d, 16, 0);
      if (t <= nowMs) return t;
    }
    // step back one ET calendar day
    const prev = new Date(etWallTimeToUtcMs(y, mo, d, 12, 0) - 24 * 3_600_000);
    ({ y, mo, d, dow } = etDateParts(prev.getTime()));
  }
  return 0;
}

/** The funding print boundary inside (throughMs, nowMs], if one exists —
 *  i.e. a print this position crossed that its watermark hasn't covered. */
export function fundingPrintCrossedMs(throughMs: number, nowMs: number): number | null {
  const last = lastFundingPrintMs(nowMs);
  return last > throughMs && last <= nowMs ? last : null;
}

/**
 * Fail-soft rule: when the historical funding read FAILED and a print
 * boundary passed since the position's watermark, the close books the
 * in-progress estimate for that print instead of pretending funding was
 * zero — and the trade is stamped funding_model='estimate'. When no
 * boundary passed, a failed read changes nothing (no print, no funding).
 */
export function fundingFallbackApplies(historyOk: boolean, throughMs: number, nowMs: number): boolean {
  return !historyOk && fundingPrintCrossedMs(throughMs, nowMs) != null;
}

// ── annualization (the pinned convention) ───────────────────────────────────
/**
 * Annualize a series of per-interval funding rates the ONLY honest way:
 * the mean over ALL intervals — zero/deadband intervals included —
 * times the intervals per year (365 for the daily stock-perp prints),
 * expressed in percent. Annualizing over charging intervals only is the
 * documented ~9× trap and is deliberately not offered here.
 */
export function annualizedFundingPct(rates: number[], intervalsPerYear = 365): number {
  if (!rates.length) return 0;
  const mean = rates.reduce((a, r) => a + normalizeFundingRate(r), 0) / rates.length;
  return mean * intervalsPerYear * 100;
}
