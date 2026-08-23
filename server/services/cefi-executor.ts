// Unified CeFi spot execution router — lets the Crypto.com auto-engine place its
// signals on Coinbase / Kraken / Gemini instead (spot). Reuses the read/trade
// clients built in Phase 2. SPOT is long-only: a BUY signal opens a spot
// position (buy the coin); the exit sells the held base amount. SELL/short
// signals are skipped on spot venues.
//
// Symbol handling: the engine's symbols look like 'BTCUSD-PERP' (Crypto.com). We
// reduce to a base coin and remap to each venue's spot symbol.

import { pool } from '../db';
import { getAggregatedQuote } from './crypto-market-data';

export type CefiVenue = 'coinbase' | 'kraken' | 'gemini';

/** Reduce an engine symbol ('BTCUSD-PERP', 'ETH_USDT', 'SOLUSD') to a base coin. */
export function baseCoin(symbol: string): string {
  return symbol.toUpperCase().replace(/[-_]/g, '').replace(/PERP$/, '').replace(/(USDT|USDC|USD)$/, '') || symbol.toUpperCase();
}

function venueSymbol(venue: CefiVenue, base: string): string {
  if (venue === 'coinbase') return `${base}-USD`;
  if (venue === 'kraken') return `${base === 'BTC' ? 'XBT' : base}USD`;
  return `${base.toLowerCase()}usd`; // gemini
}

async function serviceFor(userId: number, venue: CefiVenue): Promise<any | null> {
  const table = `${venue}_connections`;
  const keyCol = venue === 'coinbase' ? 'api_key_name' : 'api_key';
  const { rows } = await pool.query(`SELECT ${keyCol} AS k, encrypted_api_secret AS s FROM ${table} WHERE user_id=$1 AND is_active=true ORDER BY id LIMIT 1`, [userId]);
  if (!rows.length) return null;
  if (venue === 'coinbase') { const { CoinbaseService, decryptApiSecret } = await import('../coinbase'); return new CoinbaseService(rows[0].k, decryptApiSecret(rows[0].s)); }
  if (venue === 'kraken') { const { KrakenService, decryptApiSecret } = await import('../kraken'); return new KrakenService(rows[0].k, decryptApiSecret(rows[0].s)); }
  const { GeminiService, decryptApiSecret } = await import('../gemini'); return new GeminiService(rows[0].k, decryptApiSecret(rows[0].s));
}

export interface CefiEntryResult { ok: boolean; venue: CefiVenue; venueSymbol: string; qtyBase: number; entryPrice: number; orderId: string; reason?: string; }

/** Open a spot long: buy `notionalUsd` of `base` on `venue`. */
export async function cefiEntryBuy(userId: number, venue: CefiVenue, base: string, notionalUsd: number): Promise<CefiEntryResult> {
  const sym = venueSymbol(venue, base);
  const svc = await serviceFor(userId, venue);
  if (!svc) return { ok: false, venue, venueSymbol: sym, qtyBase: 0, entryPrice: 0, orderId: '', reason: `no active ${venue} connection` };
  const q = await getAggregatedQuote(base).catch(() => null);
  const price = q?.best?.price ?? 0;
  if (!price) return { ok: false, venue, venueSymbol: sym, qtyBase: 0, entryPrice: 0, orderId: '', reason: `no live price for ${base}` };
  const qtyBase = Math.max(0, Math.round((notionalUsd / price) * 1e6) / 1e6);
  if (qtyBase <= 0) return { ok: false, venue, venueSymbol: sym, qtyBase: 0, entryPrice: price, orderId: '', reason: 'size rounds to 0' };

  let orderId = '';
  if (venue === 'coinbase') {
    const r = await svc.placeOrder({ product: sym, side: 'BUY', type: 'market', quoteSize: Math.round(notionalUsd * 100) / 100 });
    orderId = r.orderId;
  } else if (venue === 'kraken') {
    const r = await svc.placeOrder({ pair: sym, type: 'buy', ordertype: 'market', volume: qtyBase });
    orderId = (r.txids || [])[0] || '';
  } else {
    // gemini: IOC limit ~1% through the ask for a market-like fill
    const r = await svc.placeOrder({ symbol: sym, side: 'buy', amount: qtyBase, price: Math.round(price * 1.01 * 100) / 100, immediateOrCancel: true });
    orderId = r.orderId;
  }
  return { ok: true, venue, venueSymbol: sym, qtyBase, entryPrice: price, orderId };
}

/** Close a spot long: sell `qtyBase` of `base` on `venue`. */
export async function cefiExitSell(userId: number, venue: CefiVenue, base: string, qtyBase: number): Promise<{ ok: boolean; exitPrice: number; orderId: string; reason?: string }> {
  const sym = venueSymbol(venue, base);
  const svc = await serviceFor(userId, venue);
  if (!svc) return { ok: false, exitPrice: 0, orderId: '', reason: `no active ${venue} connection` };
  const q = await getAggregatedQuote(base).catch(() => null);
  const price = q?.best?.price ?? 0;
  let orderId = '';
  if (venue === 'coinbase') {
    const r = await svc.placeOrder({ product: sym, side: 'SELL', type: 'market', baseSize: qtyBase }); orderId = r.orderId;
  } else if (venue === 'kraken') {
    const r = await svc.placeOrder({ pair: sym, type: 'sell', ordertype: 'market', volume: qtyBase }); orderId = (r.txids || [])[0] || '';
  } else {
    const r = await svc.placeOrder({ symbol: sym, side: 'sell', amount: qtyBase, price: price ? Math.round(price * 0.99 * 100) / 100 : 0.01, immediateOrCancel: true }); orderId = r.orderId;
  }
  return { ok: true, exitPrice: price, orderId };
}
