// ─────────────────────────────────────────────────────────────────────────────
// Canonical candle field names for the MT5 chart-data payload.
//
// WHY: the EA posts bars in two different shapes. Measured 2026-09-21 over 214
// posts in one 14-minute window:
//
//   time|open|high|low|close|volume   187 posts
//   t|o|h|l|c|v  (+ an indicators.price object)   27 posts
//
// Everything downstream reads the SHORT names, so on a long-name post every
// field reads back `undefined`. The damage was not a crash — it was silence:
//
//   • `currentPrice = indicators.price?.bid || candles[0]?.c` resolved to
//     undefined, so the trade plan was never built, so approved setups hit the
//     _noLevels branch, flipped to NEUTRAL and never executed. 66 directional
//     setups were dropped this way in a single sample.
//   • `c.h !== c.l` compared undefined to undefined and reported FALSE, which
//     was read as "every bar has high === low" — a flat feed. Two missing
//     fields looked exactly like a real market-data defect.
//
// The fix belongs at ingest, once, rather than at each of the dozens of read
// sites. Normalising here means a shape change in the EA can never again be
// mistaken for a property of the market.
// ─────────────────────────────────────────────────────────────────────────────

export interface NormalizedCandle {
  t?: number | string; o: number; h: number; l: number; c: number; v?: number;
  [k: string]: any;
}

/** First finite number among the candidate keys, else undefined. */
function pick(src: any, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = src?.[k];
    if (typeof v === 'number' && isFinite(v)) return v;
    // MT5 JSON sometimes stringifies prices; accept only a clean numeric string.
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (isFinite(n)) return n;
    }
  }
  return undefined;
}

const O = ['o', 'open', 'Open', 'O'];
const H = ['h', 'high', 'High', 'H'];
const L = ['l', 'low', 'Low', 'L'];
const C = ['c', 'close', 'Close', 'C'];
const V = ['v', 'volume', 'Volume', 'tick_volume', 'tickVolume', 'V'];
const T = ['t', 'time', 'Time', 'timestamp', 'T'];

/**
 * Map one bar onto the canonical short keys.
 *
 * The original properties are preserved alongside, so any reader that already
 * used the long names keeps working — this only ADDS the spelling the rest of
 * the codebase expects. A bar whose OHLC cannot be resolved is returned
 * untouched rather than replaced by a half-built object: a bar we could not
 * read must not be passed on as a bar we could.
 */
export function normalizeCandle(raw: any): any {
  if (!raw || typeof raw !== 'object') return raw;
  const o = pick(raw, O), h = pick(raw, H), l = pick(raw, L), c = pick(raw, C);
  if (o === undefined && h === undefined && l === undefined && c === undefined) return raw;
  const out: any = { ...raw };
  if (o !== undefined) out.o = o;
  if (h !== undefined) out.h = h;
  if (l !== undefined) out.l = l;
  if (c !== undefined) out.c = c;
  const v = pick(raw, V); if (v !== undefined) out.v = v;
  const tRaw = raw.t ?? raw.time ?? raw.Time ?? raw.timestamp ?? raw.T;
  if (tRaw !== undefined) out.t = tRaw;
  return out;
}

/**
 * Normalise a whole payload. Non-arrays pass through unchanged so the caller's
 * own validation still sees exactly what the EA sent.
 */
export function normalizeCandles(raw: any): any {
  if (!Array.isArray(raw)) return raw;
  return raw.map(normalizeCandle);
}

/**
 * How many bars in this payload actually carry a usable close — the cheap
 * health check that distinguishes "wrong field names" from "bad prices".
 */
export function countReadableCloses(candles: any[]): number {
  if (!Array.isArray(candles)) return 0;
  return candles.filter((b) => typeof b?.c === 'number' && isFinite(b.c) && b.c > 0).length;
}
