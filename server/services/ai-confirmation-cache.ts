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
//
// STRUCTURE: `createConfirmationCache()` builds an independent instance (own
// maps + counters). The module-level functions below delegate to the default
// FX instance, unchanged. The crypto engine (crypto-ai-confirmation.ts) runs
// its own instance with the same semantics — the AI cost audit (2026-11-08)
// found the FX cache was never ported there, so identical crypto confirmations
// were re-bought on every scan. An optional per-call `discriminator` is
// appended to the verdict key (crypto passes its strategy name); FX passes
// none, so FX keys are byte-identical to before.
// ─────────────────────────────────────────────────────────────────────────────

export interface CachedVerdict { verdict: any; at: number; eaConfidence: number; price: number; barCloseAt?: number }

const TTL_MS = Number(process.env.AI_CONFIRM_CACHE_TTL_MS ?? 3 * 60 * 1000);   // 3 min

// ── Bar-aware validity (AI cost-cutting package, 2026-11-22) ────────────────
// The fixed 3-minute TTL above expires between the EA's posts on the same
// setup: the route checks a setup once per candle, so a verdict bought early
// in an H1 bar was dead long before the bar closed and the same question was
// re-bought again and again (the /api/health aiCache counters sat at zero
// while spend climbed). A verdict is now reusable until the bar it was
// bought on CLOSES — validity aligned to the judged bar's own timeframe —
// because the setup the verdict describes is that bar's setup; a new bar is
// new data and re-buys. The stale-usable window and the per-symbol call
// floor below are unchanged: past bar close, a verdict is only served via
// the throttled-reuse path, never as a fresh hit.
// Kill switch: AI_BAR_CACHE=off restores the fixed-TTL behavior exactly.
// Timeframes the parser does not recognize fall back to the fixed TTL.
export function barCacheEnabled(): boolean {
  return process.env.AI_BAR_CACHE !== 'off';
}

/** Bar length in ms for a timeframe string ('15min', '1h', 'M15', 'H4',
 *  '5m', '1day', 'D1'...), or null when unrecognized. Bars are aligned to
 *  UTC boundaries, as the EA's are: a bar containing `t` closes at
 *  floor(t / dur) * dur + dur. */
export function barDurationMs(timeframe: string): number | null {
  const tf = String(timeframe || '').trim();
  const m = tf.match(/^(\d+)\s*(m|min|mins|h|hr|hrs|d|day|days|w|week|weeks)$/i);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mult = unit.startsWith('h') ? 3_600_000
      : unit.startsWith('d') ? 86_400_000
      : unit.startsWith('w') ? 604_800_000
      : 60_000;
    return n > 0 ? n * mult : null;
  }
  const letter = tf.match(/^([MHWD])(\d+)$/i);
  if (letter) {
    const n = Number(letter[2]);
    const mult = letter[1].toUpperCase() === 'H' ? 3_600_000
      : letter[1].toUpperCase() === 'D' ? 86_400_000
      : letter[1].toUpperCase() === 'W' ? 604_800_000
      : 60_000;
    return n > 0 ? n * mult : null;
  }
  return null;
}
const FLOOR_MS = Number(process.env.AI_CONFIRM_MIN_INTERVAL_MS ?? 60 * 1000);  // 1/min/symbol
// A verdict older than TTL is still preferable to a call we are throttling, up to
// this age. Beyond it we would rather spend a credit than act on something stale.
const STALE_USABLE_MS = Number(process.env.AI_CONFIRM_STALE_MS ?? 10 * 60 * 1000);
// Materiality: what counts as "the setup changed".
const CONF_BAND = Number(process.env.AI_CONFIRM_CONF_BAND ?? 5);        // EA confidence points

export interface ConfirmationCache {
  get(userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number, discriminator?: string): { verdict: any; reason: string } | null;
  put(userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number, verdict: any, discriminator?: string): void;
  stats(): { hits: number; misses: number; throttled: number; total: number; savedPct: number; entries: number; barAware: boolean };
}

/** Per-instance bar-cache overrides (2026-11-24, crypto stewardship).
 *  Absent (the FX instance, every pre-existing caller), behavior is
 *  byte-identical to before: the shared AI_BAR_CACHE switch decides and
 *  the cache timeframe string IS the bar timeframe. An instance may
 *  supply its own switch (the crypto instance answers to
 *  CRYPTO_BAR_CACHE, decoupled from the FX switch) and a resolver from
 *  cache timeframe to bar timeframe (the crypto judge's cache timeframe
 *  carries its ':shadow-h1' namespace suffix, which is not a duration —
 *  its bars are H1, so its bar timeframe resolves to '1h'). */
export interface ConfirmationCacheOptions {
  barEnabled?: () => boolean;
  barTimeframe?: (timeframe: string) => string;
}

export function createConfirmationCache(opts: ConfirmationCacheOptions = {}): ConfirmationCache {
  const barOn = (): boolean => (opts.barEnabled ? opts.barEnabled() : barCacheEnabled());
  const barTf = (timeframe: string): string => (opts.barTimeframe ? opts.barTimeframe(timeframe) : timeframe);
  const cache = new Map<string, CachedVerdict>();
  const lastCallAt = new Map<string, number>();
  let hits = 0, misses = 0, throttled = 0;

  function bandKey(userId: number, symbol: string, timeframe: string, direction: string, eaConf: number, _price: number, discriminator?: string): string {
    const cBand = Math.round((Number(eaConf) || 0) / CONF_BAND);
    // PRICE IS DELIBERATELY NOT IN THE KEY.
    //
    // It was, as a 0.1% band, and it made the cache useless: measured in
    // production 91% of posts still reached the model (~919/hr, no better than
    // before). The price is a live tick that moves on essentially every post, so
    // on EURUSD at 1.1440 a 0.1% band is 11 pips — crossed constantly — and every
    // crossing minted a new key.
    //
    // Direction and the confidence band already capture whether the SETUP changed,
    // which is what the model reasons about. The exact tick does not change a
    // verdict on an H1 signal, and the TTL bounds how stale a reused answer can be.
    // The discriminator (when given) sits BEFORE the band so the call-floor
    // prefix scan below also stays inside the same discriminator — a throttled
    // crypto lookup reuses a verdict for the same strategy, never another's.
    return `${userId}:${symbol}:${timeframe}:${direction}${discriminator ? `:${discriminator}` : ''}:${cBand}`;
  }
  function symbolKey(userId: number, symbol: string, timeframe: string): string {
    return `${userId}:${symbol}:${timeframe}`;
  }

  /**
   * A reusable verdict, or null when the model must be asked.
   * `reason` is for logging only — it never affects the verdict itself.
   */
  function get(
    userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number, discriminator?: string,
  ): { verdict: any; reason: string } | null {
    const now = Date.now();
    const k = bandKey(userId, symbol, timeframe, direction, eaConfidence, price, discriminator);
    const hit = cache.get(k);
    // Fresh = within the fixed TTL, or — with the bar cache on — still on
    // the same bar the verdict was bought on (see barDurationMs above).
    const fresh = !!hit && (barOn() && hit.barCloseAt !== undefined
      ? now < hit.barCloseAt
      : now - hit.at < TTL_MS);
    if (hit && fresh) {
      hits++;
      return { verdict: hit.verdict, reason: `cached ${Math.round((now - hit.at) / 1000)}s ago (same setup)` };
    }

    // Cache miss. Before spending a credit, respect the per-symbol floor — but only
    // if there is something recent enough to reuse. Never throttle a first look.
    const sk = symbolKey(userId, symbol, timeframe);
    const last = lastCallAt.get(sk) ?? 0;
    if (now - last < FLOOR_MS) {
      let best: CachedVerdict | null = null;
      const prefix = `${userId}:${symbol}:${timeframe}:${direction}${discriminator ? `:${discriminator}` : ''}:`;
      for (const [ck, v] of Array.from(cache.entries())) {
        if (!ck.startsWith(prefix)) continue;
        // The remainder after the prefix must be JUST the confidence band.
        // Routes fold a question suffix into the direction ('BUY:breakout',
        // 'BUY:fallback') so different confirmation types get different keys —
        // but a plain 'BUY' prefix also matches 'BUY:breakout:16', whose
        // remainder is 'breakout:16', not a band. Without this guard the
        // throttle path could serve one question type's verdict for another
        // (the exact cross-serving the suffixes exist to prevent).
        if (!/^\d+$/.test(ck.slice(prefix.length))) continue;
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
  function put(
    userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number, verdict: any, discriminator?: string,
  ): void {
    const now = Date.now();
    const dur = barOn() ? barDurationMs(barTf(timeframe)) : null;
    const barCloseAt = dur ? (Math.floor(now / dur) + 1) * dur : undefined;
    cache.set(bandKey(userId, symbol, timeframe, direction, eaConfidence, price, discriminator), { verdict, at: now, eaConfidence, price, barCloseAt });
    lastCallAt.set(symbolKey(userId, symbol, timeframe), now);
    // Bound the map: entries are worthless once past the stale window.
    if (cache.size > 500) {
      for (const [k, v] of Array.from(cache.entries())) if (now - v.at > STALE_USABLE_MS) cache.delete(k);
    }
  }

  /** Counters so the saving is measurable rather than assumed. */
  function stats() {
    const total = hits + misses + throttled;
    return { hits, misses, throttled, total, savedPct: total ? Math.round(((hits + throttled) / total) * 100) : 0, entries: cache.size, barAware: barOn() };
  }

  return { get, put, stats };
}

// ── Default instance: the FX (MT5 EA) confirmation cache ────────────────────
// Keys and semantics exactly as before the factory refactor.
const fxConfirmationCache = createConfirmationCache();

/**
 * A reusable verdict, or null when the model must be asked.
 * `reason` is for logging only — it never affects the verdict itself.
 */
export function getCachedConfirmation(
  userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number,
): { verdict: any; reason: string } | null {
  return fxConfirmationCache.get(userId, symbol, timeframe, direction, eaConfidence, price);
}

/** Record a fresh verdict and mark the symbol as just-called. */
export function putCachedConfirmation(
  userId: number, symbol: string, timeframe: string, direction: string, eaConfidence: number, price: number, verdict: any,
): void {
  fxConfirmationCache.put(userId, symbol, timeframe, direction, eaConfidence, price, verdict);
}

/** Counters so the saving is measurable rather than assumed. */
export function confirmationCacheStats() {
  return fxConfirmationCache.stats();
}
