// Unified live crypto market-data layer across the top US-available venues.
// Phase 1 of the multi-provider wallet/exchange integration: public price feeds
// (no API keys) from Coinbase, Kraken, Gemini, and Crypto.com. Powers a
// best-price / cross-venue view and underpins later trading + DeFi phases.
//
// All endpoints here are PUBLIC (no auth) and read-only. Trading (Coinbase/
// Kraken/Gemini order placement) and DeFi wallet-connect are separate phases.

export type CryptoVenue = 'coinbase' | 'kraken' | 'gemini' | 'cryptocom';

export interface VenueQuote {
  venue: CryptoVenue;
  symbol: string;       // normalized base, e.g. 'BTC'
  price: number | null; // USD
  volume24h?: number | null;
  error?: string;
}

export interface AggregatedQuote {
  symbol: string;
  best: { venue: CryptoVenue; price: number } | null; // lowest ask-ish (spot)
  spreadPct: number | null; // (max-min)/min across venues, a cross-venue dislocation gauge
  venues: VenueQuote[];
  fetchedAt: string;
}

const TTL_MS = 15_000;
const _cache = new Map<string, { q: AggregatedQuote; ts: number }>();

function krakenPair(sym: string): string {
  // Kraken uses XBT for BTC and its own asset codes; USD pairs mostly work as `${SYM}USD`.
  const s = sym.toUpperCase();
  return (s === 'BTC' ? 'XBT' : s) + 'USD';
}

async function coinbaseSpot(sym: string): Promise<VenueQuote> {
  try {
    const r = await fetch(`https://api.coinbase.com/v2/prices/${sym}-USD/spot`, { headers: { 'User-Agent': 'VEDD/1.0' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { venue: 'coinbase', symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json() as any;
    const p = parseFloat(d?.data?.amount);
    return { venue: 'coinbase', symbol: sym, price: isFinite(p) ? p : null };
  } catch (e: any) { return { venue: 'coinbase', symbol: sym, price: null, error: e.message }; }
}

async function krakenTicker(sym: string): Promise<VenueQuote> {
  try {
    const r = await fetch(`https://api.kraken.com/0/public/Ticker?pair=${krakenPair(sym)}`, { headers: { 'User-Agent': 'VEDD/1.0' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { venue: 'kraken', symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json() as any;
    const first: any = Object.values(d?.result || {})[0];
    const p = parseFloat(first?.c?.[0]);
    const v = parseFloat(first?.v?.[1]);
    return { venue: 'kraken', symbol: sym, price: isFinite(p) ? p : null, volume24h: isFinite(v) ? v : null, error: (d?.error?.length ? d.error.join(',') : undefined) };
  } catch (e: any) { return { venue: 'kraken', symbol: sym, price: null, error: e.message }; }
}

async function geminiTicker(sym: string): Promise<VenueQuote> {
  try {
    const r = await fetch(`https://api.gemini.com/v1/pubticker/${sym.toLowerCase()}usd`, { headers: { 'User-Agent': 'VEDD/1.0' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { venue: 'gemini', symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json() as any;
    const p = parseFloat(d?.last);
    const v = parseFloat(d?.volume?.[sym.toUpperCase()]);
    return { venue: 'gemini', symbol: sym, price: isFinite(p) ? p : null, volume24h: isFinite(v) ? v : null };
  } catch (e: any) { return { venue: 'gemini', symbol: sym, price: null, error: e.message }; }
}

async function cryptocomTicker(sym: string): Promise<VenueQuote> {
  try {
    const r = await fetch(`https://api.crypto.com/v2/public/get-ticker?instrument_name=${sym.toUpperCase()}_USDT`, { headers: { 'User-Agent': 'VEDD/1.0' }, signal: AbortSignal.timeout(6000) });
    if (!r.ok) return { venue: 'cryptocom', symbol: sym, price: null, error: `HTTP ${r.status}` };
    const d = await r.json() as any;
    const t = d?.result?.data;
    const row = Array.isArray(t) ? t[0] : t;
    const p = parseFloat(row?.a ?? row?.k); // 'a' = latest ask/price
    const v = parseFloat(row?.v);
    return { venue: 'cryptocom', symbol: sym, price: isFinite(p) ? p : null, volume24h: isFinite(v) ? v : null };
  } catch (e: any) { return { venue: 'cryptocom', symbol: sym, price: null, error: e.message }; }
}

/** Live cross-venue quote for one base symbol (e.g. 'BTC'), 15s cached. */
export async function getAggregatedQuote(symbol: string): Promise<AggregatedQuote> {
  const sym = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const hit = _cache.get(sym);
  if (hit && Date.now() - hit.ts < TTL_MS) return hit.q;

  const venues = await Promise.all([coinbaseSpot(sym), krakenTicker(sym), geminiTicker(sym), cryptocomTicker(sym)]);
  const priced = venues.filter(v => typeof v.price === 'number' && v.price! > 0) as (VenueQuote & { price: number })[];
  let best: { venue: CryptoVenue; price: number } | null = null;
  let spreadPct: number | null = null;
  if (priced.length) {
    const lo = priced.reduce((a, b) => (b.price < a.price ? b : a));
    const hi = priced.reduce((a, b) => (b.price > a.price ? b : a));
    best = { venue: lo.venue, price: lo.price };
    spreadPct = lo.price > 0 ? Math.round(((hi.price - lo.price) / lo.price) * 10000) / 100 : null;
  }
  const q: AggregatedQuote = { symbol: sym, best, spreadPct, venues, fetchedAt: new Date().toISOString() };
  _cache.set(sym, { q, ts: Date.now() });
  return q;
}

export async function getAggregatedQuotes(symbols: string[]): Promise<AggregatedQuote[]> {
  const uniq = Array.from(new Set(symbols.map(s => s.toUpperCase().replace(/[^A-Z0-9]/g, '')))).slice(0, 25);
  return Promise.all(uniq.map(getAggregatedQuote));
}
