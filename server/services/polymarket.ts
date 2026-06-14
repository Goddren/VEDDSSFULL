/**
 * VEDD Polymarket BTC Live Service
 *
 * Fetches live BTC prediction market data from Polymarket's public Gamma API
 * and CLOB API for real-time YES/NO prices.
 *
 * Gamma API (market discovery): https://gamma-api.polymarket.com
 * CLOB API  (live prices):      https://clob.polymarket.com
 *
 * Short-term BTC markets are fetched first (soonest end date → most relevant
 * for 5-minute style predictions). Cache is kept to 30 s so the UI shows
 * near-real-time data without hammering the API.
 */

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CLOB_BASE  = 'https://clob.polymarket.com';

const CACHE_TTL_MS      = 30 * 1000;  // 30 s — "live" feel
const LIVE_CACHE_TTL_MS = 10 * 1000;  // 10 s — for the /btc-live endpoint

export interface PolymarketMarket {
  id: string;
  question: string;
  /** YES probability 0–100 */
  yesProbability: number;
  /** NO probability 0–100 */
  noProbability: number;
  /** Total $ volume traded */
  volume: number;
  /** ISO date string when market resolves */
  endDate: string | null;
  /** Whether this market has already resolved */
  closed: boolean;
  /** 'bullish' = YES means price up, 'bearish' = YES means price down */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Raw outcome labels */
  outcomes: string[];
  /** CLOB YES token ID for live price polling */
  yesTokenId?: string;
  /** CLOB NO token ID */
  noTokenId?: string;
  /** True if price came from live CLOB feed */
  livePrice?: boolean;
  /** Milliseconds until market resolves (null if no end date) */
  msUntilEnd?: number | null;
}

export interface PolymarketBTCSentiment {
  overallBullishScore: number;
  sentimentLabel: 'Very Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Very Bearish';
  markets: PolymarketMarket[];
  confidenceAdjustment: number;
  reason: string;
  fetchedAt: string;
  fromCache: boolean;
  /** Whether this response used live CLOB prices */
  livePrices?: boolean;
  /** Seconds until cache expires */
  cacheExpiresIn?: number;
}

// ─── In-memory caches ────────────────────────────────────────────────────────

let cachedSentiment:     PolymarketBTCSentiment | null = null;
let cacheTimestamp       = 0;
let cachedLiveSentiment: PolymarketBTCSentiment | null = null;
let liveCacheTimestamp   = 0;

// ─── Direction classifier ────────────────────────────────────────────────────

function classifyDirection(question: string): 'bullish' | 'bearish' | 'neutral' {
  const q = question.toLowerCase();
  if (
    q.includes('below') || q.includes('under $') || q.includes('crash') ||
    q.includes('drop to') || q.includes('fall below') || q.includes('lose') ||
    (q.includes('less than') && (q.includes('btc') || q.includes('bitcoin')))
  ) return 'bearish';
  if (
    q.includes('above') || q.includes('exceed') || q.includes('over $') ||
    q.includes('reach $') || q.includes('hit $') || q.includes('cross $') ||
    q.includes('surpass') || q.includes('higher than') ||
    (q.includes('at least') && (q.includes('btc') || q.includes('bitcoin')))
  ) return 'bullish';
  return 'neutral';
}

function computeSentimentLabel(score: number): PolymarketBTCSentiment['sentimentLabel'] {
  if (score >= 70) return 'Very Bullish';
  if (score >= 55) return 'Bullish';
  if (score >= 45) return 'Neutral';
  if (score >= 30) return 'Bearish';
  return 'Very Bearish';
}

function computeConfidenceAdjustment(score: number, dir?: 'BUY' | 'SELL'): number {
  if (!dir) return 0;
  const raw = Math.round(((score - 50) / 50) * 8);
  return dir === 'BUY' ? raw : -raw;
}

function buildReason(score: number, label: string, adj: number, dir?: 'BUY' | 'SELL'): string {
  if (!dir) return `Polymarket BTC: ${label} (${score}% bullish)`;
  const alignText = adj > 0 ? `aligns with ${dir}` : adj < 0 ? `conflicts with ${dir}` : 'neutral vs';
  const adjText   = adj !== 0 ? ` → ${adj > 0 ? '+' : ''}${adj}%` : ' → no adjustment';
  return `📊 Polymarket BTC: ${label} (${score}%) ${alignText}${adjText}`;
}

// ─── CLOB live price fetcher ─────────────────────────────────────────────────

/**
 * Fetch current mid prices for up to 20 token IDs in a single CLOB call.
 * Returns a map of tokenId → price (0–1 float).
 */
async function fetchCLOBPrices(tokenIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!tokenIds.length) return map;

  try {
    const ids = tokenIds.slice(0, 20).join(',');
    const res = await fetch(`${CLOB_BASE}/prices?token_ids=${ids}`, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return map;
    const data = await res.json() as any[];
    if (Array.isArray(data)) {
      for (const item of data) {
        if (item?.token_id && item?.price != null) {
          map.set(item.token_id, parseFloat(item.price));
        }
      }
    }
  } catch { /* ignore — fall back to Gamma prices */ }

  return map;
}

// ─── Gamma market fetcher ─────────────────────────────────────────────────────

async function fetchBTCMarketsFromGamma(limit = 30): Promise<PolymarketMarket[]> {
  const urlSorted   = `${GAMMA_BASE}/markets?tag=bitcoin&active=true&closed=false&limit=${limit}&sort_by=end_date_min&order=asc`;
  const urlFallback = `${GAMMA_BASE}/markets?tag=bitcoin&active=true&closed=false&limit=${limit}`;

  let res = await fetch(urlSorted, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    res = await fetch(urlFallback, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
      signal: AbortSignal.timeout(10000),
    });
  }
  if (!res.ok) throw new Error(`Polymarket Gamma API ${res.status}`);

  const raw = await res.json() as any[];
  if (!Array.isArray(raw)) throw new Error('Unexpected Gamma response');

  const now = Date.now();
  const markets: PolymarketMarket[] = [];

  for (const item of raw) {
    const direction = classifyDirection(item.question || '');
    if (direction === 'neutral') continue;

    const outcomes: string[] = (() => {
      try { return Array.isArray(item.outcomes) ? item.outcomes : JSON.parse(item.outcomes || '["Yes","No"]'); }
      catch { return ['Yes', 'No']; }
    })();

    const prices: number[] = (() => {
      try {
        const p = Array.isArray(item.outcomePrices) ? item.outcomePrices : JSON.parse(item.outcomePrices || '[0.5,0.5]');
        return p.map((x: any) => parseFloat(String(x)));
      } catch { return [0.5, 0.5]; }
    })();

    const clobTokenIds: string[] = (() => {
      try { return Array.isArray(item.clobTokenIds) ? item.clobTokenIds : JSON.parse(item.clobTokenIds || '[]'); }
      catch { return []; }
    })();

    const endDate   = item.endDate || item.endDateIso || null;
    const msUntilEnd = endDate ? new Date(endDate).getTime() - now : null;
    const volume    = parseFloat(item.volumeNum ?? item.volume ?? '0') || 0;
    const yesProb   = Math.round((prices[0] ?? 0.5) * 100);

    markets.push({
      id:           item.id || item.conditionId || '',
      question:     item.question || 'Unknown market',
      yesProbability: yesProb,
      noProbability:  100 - yesProb,
      volume,
      endDate,
      closed:       item.closed ?? false,
      direction,
      outcomes,
      yesTokenId:   clobTokenIds[0] || undefined,
      noTokenId:    clobTokenIds[1] || undefined,
      msUntilEnd:   msUntilEnd,
    });
  }

  const MAX_DAYS = 30; // only show markets resolving within 30 days
  const maxMs = MAX_DAYS * 24 * 60 * 60 * 1000;

  // Block obviously long-term / meme speculative markets
  const BLOCK_PHRASES = [
    'gta', 'grand theft', 'before 20', 'by 202', 'end of 202',
    'never', 'all time high', 'all-time high', 'ath', 'halving',
    'etf', 'election', 'president', 'trump', 'biden',
    '$1 million', '$1m', '1,000,000', '500,000', '$500k',
  ];
  function isBlockedMarket(question: string): boolean {
    const q = question.toLowerCase();
    return BLOCK_PHRASES.some(p => q.includes(p));
  }

  return markets
    .filter(m => m.volume > 500)
    .filter(m => !isBlockedMarket(m.question))
    .filter(m => m.msUntilEnd == null || m.msUntilEnd <= maxMs)
    .sort((a, b) => {
      // Soonest-resolving markets first
      const aT = a.msUntilEnd ?? Infinity;
      const bT = b.msUntilEnd ?? Infinity;
      if (aT === bT) return b.volume - a.volume;
      return aT - bT;
    })
    .slice(0, 8);
}

// ─── Live fetch: Gamma + CLOB price overlay ──────────────────────────────────

async function fetchLiveBTCMarkets(): Promise<{ markets: PolymarketMarket[]; livePrices: boolean }> {
  const markets = await fetchBTCMarketsFromGamma(30);

  // Collect all YES token IDs and fetch live CLOB prices in one batch
  const tokenIds = markets.map(m => m.yesTokenId).filter(Boolean) as string[];
  const clobPrices = await fetchCLOBPrices(tokenIds);

  let livePricesApplied = false;
  const enriched = markets.map(m => {
    if (m.yesTokenId && clobPrices.has(m.yesTokenId)) {
      const livePrice = clobPrices.get(m.yesTokenId)!;
      livePricesApplied = true;
      return {
        ...m,
        yesProbability: Math.round(livePrice * 100),
        noProbability:  Math.round((1 - livePrice) * 100),
        livePrice: true,
      };
    }
    return m;
  });

  return { markets: enriched, livePrices: livePricesApplied };
}

// ─── Sentiment builder ────────────────────────────────────────────────────────

function buildSentiment(
  markets: PolymarketMarket[],
  livePrices: boolean,
  fromCache: boolean,
  signalDirection?: 'BUY' | 'SELL',
  cacheAge?: number,
): PolymarketBTCSentiment {
  let totalVolume = 0;
  let weightedBull = 0;
  for (const m of markets) {
    const bull = m.direction === 'bullish' ? m.yesProbability : 100 - m.yesProbability;
    weightedBull += bull * m.volume;
    totalVolume  += m.volume;
  }
  const overallBullishScore = totalVolume > 0 ? Math.round(weightedBull / totalVolume) : 50;
  const sentimentLabel      = computeSentimentLabel(overallBullishScore);
  const adj                 = computeConfidenceAdjustment(overallBullishScore, signalDirection);
  const reason              = buildReason(overallBullishScore, sentimentLabel, adj, signalDirection);

  return {
    overallBullishScore,
    sentimentLabel,
    markets,
    confidenceAdjustment: adj,
    reason,
    fetchedAt: new Date().toISOString(),
    fromCache,
    livePrices,
    cacheExpiresIn: fromCache && cacheAge != null
      ? Math.max(0, Math.round((CACHE_TTL_MS - cacheAge) / 1000))
      : undefined,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Standard BTC sentiment — 30-second cache with CLOB price overlay.
 * Used by the engine and general sentiment display.
 */
export async function getPolymarketBTCSentiment(
  signalDirection?: 'BUY' | 'SELL',
  forceRefresh = false,
): Promise<PolymarketBTCSentiment> {
  const now = Date.now();
  const age = now - cacheTimestamp;

  if (!forceRefresh && cachedSentiment && age < CACHE_TTL_MS) {
    return {
      ...buildSentiment(cachedSentiment.markets, cachedSentiment.livePrices ?? false, true, signalDirection, age),
    };
  }

  try {
    const { markets, livePrices } = await fetchLiveBTCMarkets();
    const result = buildSentiment(markets, livePrices, false, signalDirection);
    cachedSentiment  = result;
    cacheTimestamp   = now;
    return result;
  } catch (err: any) {
    if (cachedSentiment) {
      return { ...cachedSentiment, fromCache: true, confidenceAdjustment: 0, reason: 'Polymarket: using stale cache (fetch failed)' };
    }
    throw err;
  }
}

/**
 * Live BTC predictions — 10-second cache with CLOB prices.
 * Used by the /api/polymarket/btc-live endpoint for the real-time UI panel.
 */
export async function getPolymarketBTCLive(): Promise<PolymarketBTCSentiment> {
  const now = Date.now();
  const age = now - liveCacheTimestamp;

  if (cachedLiveSentiment && age < LIVE_CACHE_TTL_MS) {
    return { ...cachedLiveSentiment, fromCache: true, cacheExpiresIn: Math.max(0, Math.round((LIVE_CACHE_TTL_MS - age) / 1000)) };
  }

  try {
    const { markets, livePrices } = await fetchLiveBTCMarkets();
    const result = buildSentiment(markets, livePrices, false);
    cachedLiveSentiment = result;
    liveCacheTimestamp  = now;
    return result;
  } catch (err: any) {
    if (cachedLiveSentiment) {
      return { ...cachedLiveSentiment, fromCache: true, reason: 'Using stale data — Polymarket temporarily unavailable' };
    }
    throw err;
  }
}

export function clearPolymarketCache(): void {
  cachedSentiment     = null;
  cacheTimestamp      = 0;
  cachedLiveSentiment = null;
  liveCacheTimestamp  = 0;
}

export function getCachedPolymarketSentiment(): PolymarketBTCSentiment | null {
  return cachedSentiment;
}
