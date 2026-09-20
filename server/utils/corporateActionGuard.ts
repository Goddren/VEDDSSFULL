// ─────────────────────────────────────────────────────────────────────────────
// Corporate-action / bad-print guard.
//
// WHY: the engine can now trade Coinbase Tokenized Stocks on Base (AAPLC, NVDAC,
// TSLAC, GOOGLC, METAC, AMZNC, MSTRC). Those track real equities, and real
// equities split. A 4:1 split is a -75% print with no corporate-action awareness
// anywhere in the stack: the stop fires, the engine market-sells into it, and a
// non-event is booked as a catastrophic loss. A large special dividend does the
// same thing, smaller.
//
// The same shape of bad print happens on plain crypto too — a thin-liquidity
// wick, a bad oracle tick, a pool drained and refilled — so this guard is
// deliberately asset-class agnostic. It answers one question: does this price
// move look like TRADING, or like the instrument being redefined underneath us?
//
// The tell is volume. A genuine -50% move is panic and prints enormous volume.
// A split prints a -50% gap on ORDINARY volume, because nothing was traded — the
// share count changed. That divergence is what this measures.
//
// It is a CIRCUIT BREAKER, not a classifier. It does not try to prove a split
// happened; it refuses to act on a move it cannot explain, which is the correct
// response to a stop-loss trigger that might be fictional.
// ─────────────────────────────────────────────────────────────────────────────

export interface PriceAnomaly {
  suspect: boolean;
  reason: string;
  movePct: number;
  volumeRatio: number;
  /** Nearest common split ratio when the move closely matches one. */
  splitLike: string | null;
}

export interface GuardOptions {
  /** Single-bar move beyond this (%) is examined. Default 20. */
  moveThresholdPct?: number;
  /** Volume below this multiple of recent average marks the move unexplained. Default 1.5. */
  volumeConfirmRatio?: number;
  /** Bars of history used for the volume baseline. Default 20. */
  lookback?: number;
}

// Ratios a split or reverse split produces, as a fraction of the prior price.
const SPLIT_RATIOS: Array<[number, string]> = [
  [1 / 2, '2:1 split'], [1 / 3, '3:1 split'], [1 / 4, '4:1 split'],
  [1 / 5, '5:1 split'], [1 / 10, '10:1 split'], [2 / 3, '3:2 split'],
  [3 / 4, '4:3 split'], [2, '1:2 reverse split'], [3, '1:3 reverse split'],
  [5, '1:5 reverse split'], [10, '1:10 reverse split'],
];

function nearestSplit(ratio: number): string | null {
  for (const [r, label] of SPLIT_RATIOS) {
    // within 2% of a textbook ratio
    if (Math.abs(ratio - r) / r < 0.02) return label;
  }
  return null;
}

/**
 * Examine the most recent bar for a move that does not look like trading.
 * `bars` must be OLDEST-FIRST (the ordering fetchBars/getDefiCandles return).
 */
export function assessPriceAnomaly(
  bars: Array<{ o: number; h: number; l: number; c: number; v?: number }>,
  opts: GuardOptions = {},
): PriceAnomaly {
  const moveThreshold = opts.moveThresholdPct ?? 20;
  const volConfirm = opts.volumeConfirmRatio ?? 1.5;
  const lookback = opts.lookback ?? 20;

  const none: PriceAnomaly = { suspect: false, reason: 'no anomaly', movePct: 0, volumeRatio: 0, splitLike: null };
  if (!bars || bars.length < 3) {
    // Too little history to judge. Say so rather than implying the move is fine:
    // callers decide, and a silent "clean" here is how bad prints get traded.
    return { suspect: false, reason: 'insufficient history to assess', movePct: 0, volumeRatio: 0, splitLike: null };
  }

  const last = bars[bars.length - 1];
  const prev = bars[bars.length - 2];
  if (!(prev.c > 0) || !(last.c > 0)) return none;

  const ratio = last.c / prev.c;
  const movePct = (ratio - 1) * 100;
  if (Math.abs(movePct) < moveThreshold) return none;

  // Volume baseline from the bars BEFORE this one.
  const hist = bars.slice(Math.max(0, bars.length - 1 - lookback), bars.length - 1);
  const vols = hist.map((b) => b.v ?? 0).filter((v) => v > 0);
  const avgVol = vols.length ? vols.reduce((a, b) => a + b, 0) / vols.length : 0;
  const lastVol = last.v ?? 0;
  const volumeRatio = avgVol > 0 ? lastVol / avgVol : 0;

  const splitLike = nearestSplit(ratio);

  // A big move on heavy volume is a real move — panic, a listing, a liquidation
  // cascade. Let it through; that is exactly what the strategies exist to trade.
  if (avgVol > 0 && volumeRatio >= volConfirm) {
    return {
      suspect: false,
      reason: `${movePct.toFixed(1)}% move confirmed by ${volumeRatio.toFixed(1)}x volume — genuine`,
      movePct, volumeRatio, splitLike,
    };
  }

  return {
    suspect: true,
    reason: splitLike
      ? `${movePct.toFixed(1)}% move on ${volumeRatio.toFixed(1)}x volume matches a ${splitLike} — refusing to act; verify the corporate action`
      : `${movePct.toFixed(1)}% move on only ${volumeRatio.toFixed(1)}x volume — unexplained by trading activity, refusing to act`,
    movePct, volumeRatio, splitLike,
  };
}

/** Coinbase Tokenized Stocks on Base carry a trailing C (AAPLC, NVDAC…). */
export function isTokenizedEquity(symbol: string, name?: string): boolean {
  if (name && /tokenized stock/i.test(name)) return true;
  return /^[A-Z]{2,5}C$/.test(symbol) && !['USDC', 'ETHC', 'BTCC'].includes(symbol);
}
