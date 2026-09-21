// ─────────────────────────────────────────────────────────────────────────────
// Candle repair — replace a degenerate EA feed with real OHLC.
//
// WHY: the MT5 EA posts candles whose HIGH EQUALS LOW on every bar. Field names
// are correct (h,l,c,o,v,t) and closes are genuine — RSI computes fine from
// them — but nothing needing a bar's RANGE can work. Measured over five months:
// ADX produced a real value 0 times in 104,868 confirmations, MACD was NEUTRAL
// on 103,664, and ATR is affected identically. The diagnostic confirmed it:
// barsWithHighNotEqualLow=0.
//
// That is a client-side bug and the right fix is in the EA's CopyRates() loop.
// This is the fallback for when that cannot be changed: detect the degenerate
// feed and substitute real bars from Twelve Data, which is already configured
// (TWELVE_DATA_API_KEY) and already implements OHLC fetching.
//
// Deliberately conservative:
//   • It only engages when the EA's candles are ACTUALLY unusable. A healthy
//     feed is passed through untouched, so fixing the EA silently retires this.
//   • A failed fetch returns the original candles rather than nothing — a
//     repair that cannot run must not also destroy what we had.
//   • Results are cached per symbol+timeframe, because the free tier allows
//     8 requests/minute and the EA posts far more often than that.
// ─────────────────────────────────────────────────────────────────────────────

export interface RawCandle { t?: number | string; o: number; h: number; l: number; c: number; v?: number }

export interface RepairResult {
  candles: RawCandle[];
  repaired: boolean;
  reason: string;
}

/**
 * Is this feed usable for range-based indicators?
 * The test mirrors what calculateADX actually needs: enough bars, numeric
 * fields, and a true range that is not zero.
 */
export function assessCandles(candles: any[]): { usable: boolean; reason: string; barsWithRange: number } {
  if (!Array.isArray(candles) || candles.length < 15) {
    return { usable: false, reason: `too few candles (${Array.isArray(candles) ? candles.length : 0}, need >=15)`, barsWithRange: 0 };
  }
  const fin = (v: any) => typeof v === 'number' && isFinite(v);
  if (!candles.every((c) => fin(c?.h) && fin(c?.l) && fin(c?.c))) {
    return { usable: false, reason: 'malformed candles (non-numeric h/l/c)', barsWithRange: 0 };
  }
  const barsWithRange = candles.filter((c) => Number(c.h) !== Number(c.l)).length;
  if (barsWithRange === 0) {
    return { usable: false, reason: 'every bar has high === low (no true range)', barsWithRange: 0 };
  }
  // A handful of flat bars is normal in a quiet session; almost all flat is not.
  if (barsWithRange < candles.length * 0.1) {
    return { usable: false, reason: `only ${barsWithRange}/${candles.length} bars have any range`, barsWithRange };
  }
  return { usable: true, reason: 'ok', barsWithRange };
}

// Twelve Data's free tier is 8 requests/minute and the EA posts far more often,
// so a short cache is required, not an optimisation.
const cache = new Map<string, { at: number; candles: RawCandle[] }>();
const CACHE_TTL_MS = 60_000;

let lastFetchAt = 0;
const MIN_FETCH_GAP_MS = 8_000; // ~7/min, under the free-tier ceiling

/**
 * Return usable candles for this symbol/timeframe.
 * Passes the EA's own candles straight through when they are fine.
 */
export async function repairCandles(symbol: string, timeframe: string, eaCandles: any[]): Promise<RepairResult> {
  const verdict = assessCandles(eaCandles);
  if (verdict.usable) return { candles: eaCandles as RawCandle[], repaired: false, reason: verdict.reason };

  const key = `${symbol}:${timeframe}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
    return { candles: hit.candles, repaired: true, reason: `${verdict.reason} — substituted cached Twelve Data bars` };
  }

  if (!process.env.TWELVE_DATA_API_KEY) {
    return { candles: eaCandles as RawCandle[], repaired: false, reason: `${verdict.reason} — no TWELVE_DATA_API_KEY, cannot repair` };
  }
  // Respect the rate limit rather than burning the quota and getting nothing.
  if (Date.now() - lastFetchAt < MIN_FETCH_GAP_MS) {
    return { candles: eaCandles as RawCandle[], repaired: false, reason: `${verdict.reason} — throttled, keeping the EA bars this cycle` };
  }

  try {
    lastFetchAt = Date.now();
    const { TwelveDataProvider } = await import('../market-data/providers/twelve-data');
    const provider = new TwelveDataProvider(process.env.TWELVE_DATA_API_KEY);
    const bars = await provider.fetchOHLCV({ symbol, assetType: 'forex', timeframe, limit: 200 } as any);
    if (!Array.isArray(bars) || bars.length < 15) {
      return { candles: eaCandles as RawCandle[], repaired: false, reason: `${verdict.reason} — Twelve Data returned ${bars?.length ?? 0} bars, keeping the EA bars` };
    }
    // fetchOHLCV returns oldest-first; the chart-data path works newest-first.
    const mapped: RawCandle[] = bars
      .map((b: any) => ({ t: b.timestamp, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume }))
      .reverse();

    const check = assessCandles(mapped);
    if (!check.usable) {
      return { candles: eaCandles as RawCandle[], repaired: false, reason: `${verdict.reason} — replacement bars also unusable (${check.reason})` };
    }
    cache.set(key, { at: Date.now(), candles: mapped });
    console.log(`[candle-repair] ${symbol} ${timeframe}: EA feed unusable (${verdict.reason}); substituted ${mapped.length} Twelve Data bars, ${check.barsWithRange} with real range`);
    return { candles: mapped, repaired: true, reason: `${verdict.reason} — substituted Twelve Data bars` };
  } catch (e: any) {
    // A failed repair must leave the caller no worse off than before.
    console.error(`[candle-repair] ${symbol} ${timeframe}: could not fetch replacement bars (${e?.message}) — keeping the EA bars`);
    return { candles: eaCandles as RawCandle[], repaired: false, reason: `${verdict.reason} — fetch failed: ${e?.message}` };
  }
}
