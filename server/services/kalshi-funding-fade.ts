// ─────────────────────────────────────────────────────────────────────────────
// Funding-extremes fade — a perp-native strategy for the Kalshi
// stock-perp SHADOW lane (2026-11-13, build #3).
//
// THE IDEA: Kalshi stock-perp funding lands once a day (16:00 ET). The
// rate is a premium index: a strongly POSITIVE rate means longs are
// crowded enough to pay shorts for the privilege of holding; a strongly
// NEGATIVE rate means shorts are crowded. Crowds at extremes tend to be
// wrong-footed, so this strategy fades them: extreme positive funding →
// SHORT, extreme negative funding → LONG. Entries, exits, funding
// accounting and costs are the lane's own machinery, unchanged — this
// module only decides the signal, from data the lane already fetches
// (kalshi-perps.ts getPerpFundingHistory).
//
// THE EXTREME, EXACTLY: the candidate rate is the ticker's most recent
// REALIZED funding print. It is compared against the trailing 90-day
// distribution of realized rates — the ticker's OWN distribution when
// that holds at least MIN_HISTORY prints, otherwise the LANE-WIDE pool
// (every lane ticker's prints in the window), which must also hold at
// least MIN_HISTORY prints before anything can fire. "Extreme" = the
// outer deciles: rate ≥ the distribution's 90th percentile (and > 0)
// fades short; rate ≤ the 10th percentile (and < 0) fades long. The
// sign guards matter: Kalshi's rate has a deadband around zero, so a
// distribution can sit mostly at 0 — a "top decile" of 0 is not a
// crowded long and must never fire. MIN_HISTORY defaults to 30 prints
// (KALSHI_FUNDING_FADE_MIN_HISTORY): with one print a day, a per-ticker
// distribution needs about six trading weeks; the lane pool reaches 30
// in roughly two sessions across ~20 tickers, so the fade can start on
// pooled evidence and graduate to per-ticker evidence as it accrues.
//
// SHADOW ONLY, structurally: this module reads only the public funding
// history in kalshi-perps.ts and is imported only by the shadow lane.
// There is no order path here and no live engine imports it.
// Kill switch: KALSHI_FUNDING_FADE=off.
// ─────────────────────────────────────────────────────────────────────────────
import { getPerpFundingHistory } from './kalshi-perps';

export const fundingFadeEnabled = () => process.env.KALSHI_FUNDING_FADE !== 'off';

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
/** Minimum prints in the distribution used, before the fade may fire. */
export const fundingFadeMinHistory = () => Math.floor(num('KALSHI_FUNDING_FADE_MIN_HISTORY', 30));
/** Trailing window the rate distribution is built from. */
export const fundingFadeWindowDays = () => num('KALSHI_FUNDING_FADE_WINDOW_DAYS', 90);
const BOOK_TTL_MS = 30 * 60_000;

// ── percentile + decision (pure) ────────────────────────────────────────────
/** Linear-interpolation quantile over an ascending-sorted series — the
 *  same shape the lane's own stats aggregation uses. */
export function fundingQuantile(sortedAsc: number[], q: number): number {
  if (!sortedAsc.length) return 0;
  const p = (sortedAsc.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p);
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * (p - lo);
}

export interface FundingFadeDecision {
  direction: 'long' | 'short';
  /** The ticker's latest realized funding rate that triggered the fade. */
  rate: number;
  p10: number;
  p90: number;
  /** Prints in the distribution the rate was judged against. */
  n: number;
  /** Whose distribution: the ticker's own, or the lane-wide pool. */
  scope: 'ticker' | 'lane';
}

/**
 * The fade decision (pure). Fires only when the distribution is big
 * enough AND the current rate sits in its outer decile with the
 * matching sign. Both tails are symmetric:
 *   rate ≥ p90 and rate > 0 → crowded longs paying   → 'short'
 *   rate ≤ p10 and rate < 0 → crowded shorts paying → 'long'
 */
export function decideFundingFade(
  currentRate: number | null | undefined,
  distribution: number[],
  scope: 'ticker' | 'lane',
  minHistory: number = fundingFadeMinHistory(),
): FundingFadeDecision | null {
  if (currentRate == null || !Number.isFinite(currentRate) || currentRate === 0) return null;
  const dist = (distribution || []).filter((v) => Number.isFinite(v));
  if (dist.length < Math.max(1, minHistory)) return null;
  const sorted = dist.slice().sort((a, b) => a - b);
  const p90 = fundingQuantile(sorted, 0.9);
  const p10 = fundingQuantile(sorted, 0.1);
  if (currentRate > 0 && p90 > 0 && currentRate >= p90) {
    return { direction: 'short', rate: currentRate, p10, p90, n: dist.length, scope };
  }
  if (currentRate < 0 && p10 < 0 && currentRate <= p10) {
    return { direction: 'long', rate: currentRate, p10, p90, n: dist.length, scope };
  }
  return null;
}

// ── distribution assembly (cached funding-history reads) ────────────────────
export interface FundingFadeTickerSeries {
  /** Most recent realized funding rate for the ticker (any age), or null. */
  latestRate: number | null;
  /** Realized rates inside the trailing window, oldest-first. */
  series: number[];
}
export interface FundingFadeBook {
  byTicker: Map<string, FundingFadeTickerSeries>;
  /** Every lane ticker's in-window rates pooled, oldest-first per ticker. */
  pool: number[];
}

/** Pure assembly from raw per-ticker histories — exported for checks. */
export function assembleFundingFadeBook(
  histories: Map<string, Array<{ fundingTimeMs: number; rate: number }>>,
  nowMs: number,
  windowDays: number = fundingFadeWindowDays(),
): FundingFadeBook {
  const cutoff = nowMs - windowDays * 24 * 3_600_000;
  const byTicker = new Map<string, FundingFadeTickerSeries>();
  const pool: number[] = [];
  for (const [ticker, hist] of Array.from(histories.entries())) {
    const clean = (hist || []).filter((r) => Number.isFinite(r?.rate) && Number.isFinite(r?.fundingTimeMs))
      .slice().sort((a, b) => a.fundingTimeMs - b.fundingTimeMs);
    const series = clean.filter((r) => r.fundingTimeMs >= cutoff).map((r) => r.rate);
    byTicker.set(ticker, { latestRate: clean.length ? clean[clean.length - 1].rate : null, series });
    pool.push(...series);
  }
  return { byTicker, pool };
}

let _bookCache: { at: number; key: string; book: FundingFadeBook } | null = null;

/** Fetch + assemble the book for a set of lane tickers (perp tickers,
 *  e.g. KXAAPLPERP). Cached ~30 min — funding prints once a day, so the
 *  distribution cannot move faster than that. Never throws: a failed
 *  history read contributes an empty series for that ticker. */
export async function buildFundingFadeBook(tickers: string[], nowMs: number = Date.now()): Promise<FundingFadeBook> {
  const key = `${tickers.slice().sort().join(',')}|${fundingFadeWindowDays()}`;
  if (_bookCache && _bookCache.key === key && nowMs - _bookCache.at < BOOK_TTL_MS) return _bookCache.book;
  const histories = new Map<string, Array<{ fundingTimeMs: number; rate: number }>>();
  await Promise.all((tickers || []).map(async (t) => {
    const h = await getPerpFundingHistory(t).catch(() => []);
    histories.set(t, h.map((r) => ({ fundingTimeMs: r.fundingTimeMs, rate: r.rate })));
  }));
  const book = assembleFundingFadeBook(histories, nowMs);
  _bookCache = { at: nowMs, key, book };
  return book;
}

/** The fade signal for one ticker against an assembled book (pure given
 *  the book): the ticker's own distribution once it is deep enough,
 *  otherwise the lane pool — the minimum-history gate applies to
 *  whichever distribution is used. */
export function fundingFadeForTicker(
  ticker: string,
  book: FundingFadeBook,
  minHistory: number = fundingFadeMinHistory(),
): FundingFadeDecision | null {
  const t = book.byTicker.get(ticker);
  if (!t || t.latestRate == null) return null;
  if (t.series.length >= Math.max(1, minHistory)) {
    return decideFundingFade(t.latestRate, t.series, 'ticker', minHistory);
  }
  return decideFundingFade(t.latestRate, book.pool, 'lane', minHistory);
}
