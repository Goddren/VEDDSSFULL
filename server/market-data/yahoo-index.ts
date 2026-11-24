import { MarketDataRequest, OHLCVBar } from './types';

// ── Yahoo Finance cash-index data (no key) ───────────────────────────────
// Shared by the market-data service (OHLCV) and the Twelve Data provider
// (ATR). Indices (US30, US500, NAS100, GER40…) aren't on the account's
// Twelve Data plan — DJI/NDX return HTTP 404 on every call — so Yahoo's
// cash-index candles are the working source for them (2026-10-19).
const YAHOO_INDEX: Array<[RegExp, string]> = [
  [/^(US30|WS30|DJ30|DJI|DOW|USA30|WALLST)/i, '^DJI'],
  [/^(US500|SPX500|SPX|SP500|USA500)/i, '^GSPC'],
  [/^(US100|NAS100|NAS|USTEC|NDX)/i, '^NDX'],
  [/^(GER40|DE40|GER30|DAX)/i, '^GDAXI'],
  [/^(UK100|FTSE)/i, '^FTSE'],
  [/^(JP225|JPN225|NIK225)/i, '^N225'],
];

/** Pure: the Yahoo cash-index symbol for a broker index name, or null. */
export function yahooIndexSymbol(symbol: string): string | null {
  const sym = String(symbol || '').replace(/[^A-Za-z0-9]/g, '');
  const hit = YAHOO_INDEX.find(([re]) => re.test(sym));
  return hit ? hit[1] : null;
}

export async function fetchIndexFromYahoo(req: MarketDataRequest): Promise<OHLCVBar[] | null> {
  const yahooSymbol = yahooIndexSymbol(req.symbol);
  if (!yahooSymbol) return null;
  const tf = req.timeframe;
  const interval = tf === '1m' ? '1m' : tf === '5m' ? '5m' : tf === '15m' ? '15m' : tf === '30m' ? '30m' : (tf === '1h' || tf === '4h') ? '60m' : tf === '1w' ? '1wk' : '1d';
  const range = interval === '1m' ? '5d' : (interval === '5m' || interval === '15m' || interval === '30m') ? '30d' : interval === '60m' ? '180d' : '5y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) return null;
  const j: any = await r.json();
  const res = j?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  if (!res?.timestamp || !q) return null;
  let bars: OHLCVBar[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    if (q.close[i] == null || q.open[i] == null || q.high[i] == null || q.low[i] == null) return;
    bars.push({ timestamp: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? 0 });
  });
  if (tf === '4h') {
    const m = new Map<number, OHLCVBar>();
    for (const b of bars) {
      const k = Math.floor(b.timestamp / 14_400_000) * 14_400_000;
      const x = m.get(k);
      if (!x) m.set(k, { ...b, timestamp: k });
      else { x.high = Math.max(x.high, b.high); x.low = Math.min(x.low, b.low); x.close = b.close; x.volume += b.volume; }
    }
    bars = Array.from(m.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
  if (!bars.length) return null;
  // The cash index only trades exchange hours — outside them the last bar is
  // hours old. Intraday requests get no data then, rather than stale prices.
  const ageMs = Date.now() - bars[bars.length - 1].timestamp;
  const maxAge = interval === '1d' || interval === '1wk' ? 5 * 86_400_000 : tf === '4h' ? 6 * 3_600_000 : 2 * 3_600_000;
  if (ageMs > maxAge) return null;
  const lim = req.limit && req.limit > 0 ? req.limit : bars.length;
  return bars.slice(-lim);
}

/**
 * Pure: simple true-range ATR over the last `period` bars (oldest-first).
 * Twelve Data's /atr uses Wilder smoothing; this average is the fallback
 * grade used when the ATR must be derived from Yahoo candles instead.
 * Returns null when there aren't enough bars to compute a single TR.
 */
export function computeAtrFromBars(bars: OHLCVBar[], period: number = 14): { atr: number; currentPrice: number } | null {
  if (!bars || bars.length < 2) return null;
  const trs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const prevClose = bars[i - 1].close;
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - prevClose), Math.abs(b.low - prevClose)));
  }
  if (!trs.length) return null;
  const window = trs.slice(-period);
  const atr = window.reduce((a, b) => a + b, 0) / window.length;
  return { atr, currentPrice: bars[bars.length - 1].close };
}

// ── Source-evidence logging (throttled) ──────────────────────────────────
// Production logs should prove WHICH source carried an index symbol, but
// the engine scans every minute — log each symbol+source at most once
// per 15 minutes.
const _indexSourceLogAt = new Map<string, number>();
const INDEX_SOURCE_LOG_THROTTLE_MS = 15 * 60 * 1000;

export function logIndexSource(symbol: string, source: 'yahoo' | 'twelvedata', detail?: string): void {
  const key = `${symbol}:${source}`;
  const now = Date.now();
  if (now - (_indexSourceLogAt.get(key) || 0) < INDEX_SOURCE_LOG_THROTTLE_MS) return;
  _indexSourceLogAt.set(key, now);
  console.log(`[market-data] index ${symbol} served by ${source === 'yahoo' ? 'Yahoo' : 'Twelve Data'}${detail ? ` (${detail})` : ''}`);
}
