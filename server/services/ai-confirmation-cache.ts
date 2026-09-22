// ─────────────────────────────────────────────────────────────────────────────
// AI confirmation verdict cache + per-symbol call floor.
//
// WHY: the MT5 EA posts roughly every 10 seconds per symbol, and every post that
// clears the pre-AI gates triggers a fresh confirmation. The setup rarely changes
// between posts, so the same question is asked over and over. Measured over three
// hours on 2026-09-22:
//
//   1,666 AI calls  →  49 distinct symbol+direction+confidence combinations
//   BTCUSD BUY alone: 273 calls, 7 distinct EA confidence values
//
// 11,354 calls in a day, ~97% of them re-asking a question already answered. That
// exhausted the OpenRouter balance mid-session and halted confirmation entirely
// (402 Insufficient credits, ~600/hour).
//
// This does NOT change any decision. It reuses a recent verdict when the inputs
// that produced it have not materially moved, and re-asks the model the moment
// they do. Two independent controls:
//
//   1. VERDICT CACHE — keyed on what the model actually reasons about: symbol,
//      timeframe, direction, a confidence BAND and a price BAND. A direction flip
//      or a real move in either changes the key, so it misses and we re-ask.
//   2. CALL FLOOR — a hard minimum interval per symbol+timeframe. Bounds spend by
//      construction even if the cache keeps missing (e.g. a jittery confidence
//      oscillating across a band edge). A first look is NEVER throttled: with no
//      prior verdict to reuse, the call always goes through.
// ─────────────────────────────────────────────────────────────────────────────

export interface CachedVerdict { verdict: any; at: number; eaConfidence: number; price: number }

const TTL_MS = Number(process.env.AI_CONFIRM_CACHE_TTL_MS ?? 3 * 60 * 1000);   // 3 min
const FLOOR_MS = Number(process.env.AI_CONFIRM_MIN_INTERVAL_MS ?? 60 * 1000);  // 1/min/symbol
// A verdict older than TTL is still preferable to a call we are throttling, up to
// this age. Beyond it we would rather spend a credit than act on something stale.
const STALE_USABLE_MS = Number(process.env.AI_CONFIRM_STALE_MS ?? 10 * 60 * 1000);
// Materiality: what counts as "the setup changed".
const CONF_BAND = Number(process.env.AI_CONFIRM_CONF_BAND ?? 5);        // EA confidence points
const PRICE_BAND_PCT = Number(process.env.AI_CONFIRM_PRICE_BAND_PCT ?? 0.1); // % of price

const cache = new Map<string, CachedVerdict>();
const lastCallAt = new Map<string, number>();
let hits = 0, misses = 0, throttled = 0;

function bandKey(userId: number, symbol: string, timeframe: string, direction: string, eaConf: number, price: number): string {
  const cBand = Math.round((Number(eaConf) || 0) / CONF_BAND);
  // Relative band so it works for 1.13 (EURUSD) and 81,000 (BTCUSD) alike.
  const pBand = price > 0 ? Math.round(Math.log(price) / Math.log(1 + PRICE_BAND_PCT / 100)) : 0;
  return `${userId}:${symbol}:${timeframe}:${direction}:${cBand}:${pBand}`;
}
function symbolKey(userId: number, symbol: string, timeframe: string): string {
  return `${userId}:${symbol}:${timeframe}`;
}

/**
 * A reusable verdict, or null when the model must be asked.
 * `reason` is for logging only — it never affects the verdict itself.
 */
export function getCachedConfirmation(
  userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number,
): { verdict: any; reason: string } | null {
  const now = Date.now();
  const k = bandKey(userId, symbol, timeframe, direction, eaConfidence, price);
  const hit = cache.get(k);
  if (hit && now - hit.at < TTL_MS) {
    hits++;
    return { verdict: hit.verdict, reason: `cached ${Math.round((now - hit.at) / 1000)}s ago (same setup)` };
  }

  // Cache miss. Before spending a credit, respect the per-symbol floor — but only
  // if there is something recent enough to reuse. Never throttle a first look.
  const sk = symbolKey(userId, symbol, timeframe);
  const last = lastCallAt.get(sk) ?? 0;
  if (now - last < FLOOR_MS) {
    let best: CachedVerdict | null = null;
    for (const [ck, v] of Array.from(cache.entries())) {
      if (!ck.startsWith(`${userId}:${symbol}:${timeframe}:${direction}:`)) continue;
      if (now - v.at > STALE_USABLE_MS) continue;
      if (!best || v.at > best.at) best = v;
    }
    if (best) {
      throttled++;
      return { verdict: best.verdict, reason: `throttled (floor ${Math.round(FLOOR_MS / 1000)}s) — reusing verdict from ${Math.round((now - best.at) / 1000)}s ago` };
    }
  }
  misses++;
  return null;
}

/** Record a fresh verdict and mark the symbol as just-called. */
export function putCachedConfirmation(
  userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number, verdict: any,
): void {
  const now = Date.now();
  cache.set(bandKey(userId, symbol, timeframe, direction, eaConfidence, price), { verdict, at: now, eaConfidence, price });
  lastCallAt.set(symbolKey(userId, symbol, timeframe), now);
  // Bound the map: entries are worthless once past the stale window.
  if (cache.size > 500) {
    for (const [k, v] of Array.from(cache.entries())) if (now - v.at > STALE_USABLE_MS) cache.delete(k);
  }
}

/** Counters so the saving is measurable rather than assumed. */
export function confirmationCacheStats() {
  const total = hits + misses + throttled;
  return { hits, misses, throttled, total, savedPct: total ? Math.round(((hits + throttled) / total) * 100) : 0, entries: cache.size };
}
