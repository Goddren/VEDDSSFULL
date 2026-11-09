// ─── Canonical trade-source taxonomy ────────────────────────────────────────
// ONE mapping from the raw `source` values written into ai_trade_results
// (and echoed by engine trade tables) to a truthful platform label + engine.
//
// Why this exists: ABBA's context builder used to label everything that was
// not exactly source='tradelocker' as "MT5" — but the TradeLocker sync
// writes most engine trades as 'tradelocker_auto', DXtrade writes
// 'dxtrade', and Kalshi/Polymarket write their own sources, so ABBA was
// misattributing the majority of trades to MT5. Every consumer (ABBA
// context, engine room, future journal) must use this single map.

export interface CanonicalTradeSource {
  /** Human label ABBA and UIs may state, e.g. "TradeLocker". */
  label: string;
  /** Engine family the trade belongs to. */
  engine: 'fx' | 'kalshi' | 'polymarket' | 'sol' | 'crypto' | 'options' | 'futures' | 'other';
}

const MAP: Record<string, CanonicalTradeSource> = {
  tradelocker:      { label: 'TradeLocker', engine: 'fx' },
  tradelocker_auto: { label: 'TradeLocker', engine: 'fx' },
  dxtrade:          { label: 'DXtrade', engine: 'fx' },
  mt5:              { label: 'MT5', engine: 'fx' },
  mt5_ea:           { label: 'MT5', engine: 'fx' },
  mt5_copier:       { label: 'MT5', engine: 'fx' },
  manual:           { label: 'MT5', engine: 'fx' },
  kalshi:           { label: 'Kalshi', engine: 'kalshi' },
  polymarket:       { label: 'Polymarket', engine: 'polymarket' },
  polymarket_us:    { label: 'Polymarket', engine: 'polymarket' },
  solana:           { label: 'Sol', engine: 'sol' },
  sol:              { label: 'Sol', engine: 'sol' },
  cryptocom:        { label: 'Crypto', engine: 'crypto' },
  crypto:           { label: 'Crypto', engine: 'crypto' },
};

export function canonicalTradeSource(source: unknown): CanonicalTradeSource {
  const key = String(source ?? '').trim().toLowerCase();
  if (MAP[key]) return MAP[key];
  if (!key) return { label: 'Other', engine: 'other' };
  return { label: key.charAt(0).toUpperCase() + key.slice(1), engine: 'other' };
}

export function canonicalTradeSourceLabel(source: unknown): string {
  return canonicalTradeSource(source).label;
}
