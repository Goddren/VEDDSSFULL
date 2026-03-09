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

  // JPY pairs — pip value is ~$9 but use $10 as convention
  if (matchesAny(symbol, ['JPY'])) return 10;

  // Default standard forex: $10/pip/lot
  return 10;
}
