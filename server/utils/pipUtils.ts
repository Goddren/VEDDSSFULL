/**
 * Pip size and pip value utilities for all asset classes.
 *
 * getPipSize  — price units per 1 pip (used to convert pip counts ↔ price distances)
 * getPipValue — USD value per pip per standard lot (used for lot-size / risk calculations)
 */

function matchesAny(symbol: string, patterns: string[]): boolean {
  const s = symbol.toUpperCase();
  return patterns.some(p => s.includes(p.toUpperCase()));
}

/**
 * Returns the price-unit size of one pip for the given symbol.
 *
 * Examples:
 *   EURUSD  → 0.0001  (4th decimal)
 *   USDJPY  → 0.01    (2nd decimal)
 *   XAUUSD  → 0.1     (gold: $0.10 = 1 pip)
 *   US30    → 1.0     (index: 1 point = 1 pip)
 *   BTCUSD  → 1.0     (crypto: $1 = 1 pip)
 */
export function getPipSize(symbol: string): number {
  if (!symbol) return 0.0001;

  // JPY pairs — 2 decimal places
  if (matchesAny(symbol, ['JPY'])) return 0.01;

  // Gold
  if (matchesAny(symbol, ['XAU', 'GOLD'])) return 0.1;

  // Silver
  if (matchesAny(symbol, ['XAG', 'SILVER'])) return 0.001;

  // Platinum / Palladium
  if (matchesAny(symbol, ['XPT', 'XPD'])) return 0.01;

  // Stock indices — whole-point moves
  if (matchesAny(symbol, [
    'US30', 'DJ30', 'WALLST', 'DOW',
    'NAS100', 'USTEC', 'US100', 'NDX', 'NASDAQ',
    'US500', 'SPX', 'SP500',
    'GER40', 'GER30', 'DAX', 'DE40',
    'UK100', 'FTSE', 'UKX',
    'JP225', 'NKY', 'NIKKEI', 'JPN225', 'N225',
    'AUS200', 'ASX', 'HK50', 'HSI',
    'FRA40', 'CAC', 'ESP35', 'IBEX',
    'EUSTX50', 'SWI20',
  ])) return 1.0;

  // Oil / Energy
  if (matchesAny(symbol, ['USOIL', 'WTI', 'CRUDE', 'BRENT', 'UKOIL', 'OIL'])) return 0.01;

  // Natural Gas
  if (matchesAny(symbol, ['NGAS', 'NATGAS'])) return 0.001;

  // BTC / large-value crypto (price ~$10,000+)
  if (matchesAny(symbol, ['BTC', 'XBT'])) return 1.0;

  // Mid-range crypto (ETH, BNB, SOL, etc.)
  if (matchesAny(symbol, ['ETH', 'BNB', 'SOL', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI'])) return 0.01;

  // Small crypto / meme coins
  if (matchesAny(symbol, ['XRP', 'DOGE', 'SHIB', 'LTC', 'TRX'])) return 0.0001;

  // Default: standard forex (4 decimal places)
  return 0.0001;
}

/**
 * Returns the approximate USD value per pip per standard lot (100,000 units).
 *
 * Used for lot-size / risk calculations:
 *   lots = riskUSD / (slPips * pipValue)
 *
 * Examples:
 *   EURUSD  → $10   (100,000 * 0.0001 = $10)
 *   XAUUSD  → $10   (100 oz * 0.1 pip = $10)
 *   US30    → $1    (typical prop-firm contract: $1/point)
 *   BTCUSD  → $1    (varies; conservative estimate)
 */
/**
 * Signed P&L in PIPS for a closed trade.
 *
 * ai_trade_results.profit_loss_pips has been NULL on all 2,225 rows ever
 * written — nothing populated it, while several readers consume it
 * (routes.ts avgWinPips, the brain's `actualPips` feature, the trade feed).
 * Those all silently read blank.
 *
 * Returns null rather than 0 when it cannot be computed. A missing price must
 * not be recorded as a zero-pip trade: zero is a real, meaningful outcome and
 * would pollute every average that consumes this.
 */
export function computePips(
  symbol: string,
  entryPrice: number | null | undefined,
  exitPrice: number | null | undefined,
  direction: string | null | undefined,
): number | null {
  const entry = Number(entryPrice), exit = Number(exitPrice);
  if (!Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0 || exit <= 0) return null;
  const pipSize = getPipSize(symbol);
  if (!(pipSize > 0)) return null;
  const isSell = /sell|short/i.test(String(direction ?? ''));
  const diff = isSell ? entry - exit : exit - entry;
  return Math.round((diff / pipSize) * 10) / 10;
}

export function getPipValue(symbol: string): number {
  if (!symbol) return 10;

  // Gold — 100 oz per standard lot, pip = $0.10 → $10/pip/lot
  if (matchesAny(symbol, ['XAU', 'GOLD'])) return 10;

  // Silver — 5,000 oz per lot, pip = $0.001 → ~$5/pip/lot
  if (matchesAny(symbol, ['XAG', 'SILVER'])) return 5;

  // Platinum / Palladium
  if (matchesAny(symbol, ['XPT', 'XPD'])) return 10;

  // Stock indices — most prop-firm TradeLocker contracts: $1/point/lot
  if (matchesAny(symbol, [
    'US30', 'DJ30', 'WALLST', 'DOW',
    'NAS100', 'USTEC', 'US100', 'NDX', 'NASDAQ',
    'US500', 'SPX', 'SP500',
    'GER40', 'GER30', 'DAX', 'DE40',
    'UK100', 'FTSE',
    'JP225', 'NKY', 'NIKKEI', 'JPN225',
    'AUS200', 'ASX', 'HK50',
    'FRA40', 'CAC', 'ESP35', 'EUSTX50',
  ])) return 1;

  // Oil — 1,000 barrels per lot, pip = $0.01 → $10/pip/lot
  if (matchesAny(symbol, ['USOIL', 'WTI', 'CRUDE', 'BRENT', 'UKOIL', 'OIL'])) return 10;

  // Natural gas
  if (matchesAny(symbol, ['NGAS', 'NATGAS'])) return 10;

  // BTC — conservative $1/point
  if (matchesAny(symbol, ['BTC', 'XBT'])) return 1;

  // ETH and other mid crypto
  if (matchesAny(symbol, ['ETH', 'BNB', 'SOL', 'ADA', 'DOT', 'AVAX', 'MATIC', 'LINK', 'UNI'])) return 1;

  // ── FX: pip value depends on the QUOTE currency ──────────────────────────
  // A standard lot is 100,000 units of the BASE currency, so one pip is worth
  // (100,000 x pipSize) of the QUOTE currency — which is only $10 when the pair
  // is quoted in USD. Returning a flat 10 for everything mis-sized every
  // non-USD-quoted pair:
  //   USDJPY  true ~$6.8  -> assumed $10 => lots ~32% too SMALL (under-risked)
  //   EURGBP  true ~$13.4 -> assumed $10 => lots ~34% too LARGE (OVER-risked)
  // since lots = riskUSD / (slPips * pipValue).
  const s = symbol.toUpperCase().split('.')[0].replace(/[^A-Z]/g, '');
  if (/^[A-Z]{6}$/.test(s)) {
    const quote = s.slice(3);
    const perLotQuote = 100000 * getPipSize(symbol); // pip value in QUOTE currency
    const rate = quoteToUsd(quote);
    if (rate !== null) return perLotQuote * rate;
  }

  // Default standard forex: $10/pip/lot
  return 10;
}

// ── FX rate book for quote-currency conversion ───────────────────────────────
// Live rates are published by the engine's market scan; the statics are only a
// floor so a cold cache never produces a wild number. Each static is chosen to
// err toward a HIGHER pip value, because a higher pip value yields a SMALLER
// lot — the safe direction when we are unsure.
const FX_FALLBACK: Record<string, number> = {
  USDJPY: 140, GBPUSD: 1.36, EURUSD: 1.17, AUDUSD: 0.70,
  NZDUSD: 0.63, USDCHF: 0.80, USDCAD: 1.30,
};
const _fxLive = new Map<string, { rate: number; at: number }>();
const FX_LIVE_TTL_MS = 6 * 60 * 60 * 1000;

/** Publish a live FX rate (called by the engine's market scan). */
export function setFxRate(pair: string, rate: number): void {
  const p = String(pair || '').toUpperCase().replace(/[^A-Z]/g, '');
  const r = Number(rate);
  if (!/^[A-Z]{6}$/.test(p) || !isFinite(r) || r <= 0) return;
  _fxLive.set(p, { rate: r, at: Date.now() });
}

function rateOf(pair: string): number {
  const live = _fxLive.get(pair);
  if (live && Date.now() - live.at < FX_LIVE_TTL_MS) return live.rate;
  return FX_FALLBACK[pair];
}

/** USD per 1 unit of `quote`, or null when we have no way to convert. */
function quoteToUsd(quote: string): number | null {
  if (quote === 'USD') return 1;
  const direct = rateOf(`${quote}USD`);   // e.g. GBPUSD: 1 GBP = 1.36 USD
  if (direct > 0) return direct;
  const inverse = rateOf(`USD${quote}`);  // e.g. USDJPY: 1 JPY = 1/147 USD
  if (inverse > 0) return 1 / inverse;
  return null;
}
