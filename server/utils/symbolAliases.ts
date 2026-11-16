/**
 * Cross-broker index symbol parity — ONE canonical name per index, and the
 * full set of broker names that mean the same underlying.
 *
 * WHY: brokers name the same index differently — the S&P 500 is SPX500 on
 * one broker, SP500 on the next, US500 or SPX on a third. Every engine
 * table that is keyed by ONE of those names (ORB broker-candle aliases,
 * TradeLocker candle/order alias tables, DXtrade instrument matching,
 * FX Models exclusion lists, the AI's ORB thresholds) silently missed
 * every other name: a user whose config says SP500 got no ORB candles
 * from an MT5 chart posting SPX500, no TradeLocker instrument match, no
 * DXtrade spec — no error, just absence. US30/NAS100 were wired end-to-end
 * in PR #86; this module is the shared source the S&P 500 (and the two
 * older indices, re-audited) resolve through so the names can never drift
 * apart again.
 *
 * Canonical names are the engine's long-standing ones: US30, NAS100,
 * US500. SP500 is a first-class ALIAS of US500 everywhere — a config,
 * broker, or EA that says SP500/SPX500/SPX means US500.
 */

function cleanSym(symbol: string): string {
  return String(symbol ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Canonical index symbol → every broker name for the same underlying
 * (canonical itself first). Union of the engine's INDEX_BROKER_ALIASES,
 * the TradeLocker candle/order tables, the routes session-window variants
 * and the Twelve Data alias map, re-audited for SP500 parity.
 */
export const INDEX_SYMBOL_ALIASES: Record<string, string[]> = {
  US30: ['US30', 'US30CASH', 'US30C', 'DOW30', 'DOWJONES', 'DJIA', 'DJI', 'DJ30', 'WS30', 'YM', 'DOW', 'USA30', 'CASH30', 'US30USD', 'DJA', 'WALLST30', 'WALLSTREET30', 'USWALL'],
  NAS100: ['NAS100', 'NAS100CASH', 'NAS100C', 'NASDAQ100', 'USTEC', 'NDX100', 'US100', 'NQ', 'NQ100', 'NASDAQ', 'NASUSD', 'NA100', 'NDAQ', 'QQQ', 'TECH100', 'USTECH100', 'NASD100', 'NAS100USD'],
  US500: ['US500', 'SP500', 'SPX500', 'SPX', 'SPXUSD', 'SP500USD', 'SPX500USD', 'US500CASH', 'SP500C', 'SPXC', 'SPXUSDM', 'USINDEX', 'ES', 'USA500'],
};

const ALIAS_TO_CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [canonical, names] of Object.entries(INDEX_SYMBOL_ALIASES)) {
    for (const name of names) map[name] = canonical;
  }
  return map;
})();

// Broker suffixes that ride on top of a base symbol name (US500m, SPX500.pro,
// US30.cash…). Stripped once for a retry match — the same tolerance the
// Twelve Data provider applies. Never strips a name that matches as-is.
const TRAILING_SUFFIX = /(CASH|USD|RAW|PRO|ECN|STP|MT5|SB|M|C|I)$/;

/**
 * The canonical engine symbol for any broker's name for an index:
 * canonicalIndexSymbol('SP500') === 'US500', ('SPX500') === 'US500',
 * ('WS30') === 'US30', ('USTEC') === 'NAS100'. Non-index symbols pass
 * through cleaned (uppercased, punctuation stripped) but unchanged, so
 * callers can use this unconditionally on any pair name.
 */
export function canonicalIndexSymbol(symbol: string): string {
  const clean = cleanSym(symbol);
  if (ALIAS_TO_CANONICAL[clean]) return ALIAS_TO_CANONICAL[clean];
  const stripped = clean.replace(TRAILING_SUFFIX, '');
  if (stripped !== clean && ALIAS_TO_CANONICAL[stripped]) return ALIAS_TO_CANONICAL[stripped];
  return clean;
}

/**
 * Every name that means the same instrument as `symbol`, canonical first,
 * deduped — including the caller's own cleaned name. For a non-index
 * symbol this is just [cleaned symbol], so variant-driven lookups degrade
 * to the exact behaviour they had before.
 */
export function indexSymbolVariants(symbol: string): string[] {
  const clean = cleanSym(symbol);
  const canonical = canonicalIndexSymbol(symbol);
  const family = INDEX_SYMBOL_ALIASES[canonical];
  if (!family) return [clean];
  const out: string[] = [];
  for (const name of [canonical, ...family, clean]) {
    if (name && !out.includes(name)) out.push(name);
  }
  return out;
}

/** True when two names denote the same index (or are the same symbol). */
export function sameIndexSymbol(a: string, b: string): boolean {
  return canonicalIndexSymbol(a) === canonicalIndexSymbol(b) && !!INDEX_SYMBOL_ALIASES[canonicalIndexSymbol(a)];
}
