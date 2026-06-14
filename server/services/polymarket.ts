/**
 * VEDD Polymarket BTC Sentiment Service
 *
 * Fetches live BTC prediction market data from Polymarket's public Gamma API.
 * No API key required — read-only public data.
 *
 * Data is cached for 5 minutes to avoid hammering the API on every request.
 *
 * Polymarket API docs: https://docs.polymarket.com/
 * Gamma API base: https://gamma-api.polymarket.com
 */

const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface PolymarketMarket {
  id: string;
  question: string;
  /** YES probability 0–100 */
  yesProbability: number;
  /** NO probability 0–100 */
  noProbability: number;
  /** Total $ volume traded on this market */
  volume: number;
  /** ISO date string when the market resolves */
  endDate: string | null;
  /** Whether this market has already resolved */
  closed: boolean;
  /**
   * Directional interpretation:
   *   'bullish'  — YES = price goes up / hits target
   *   'bearish'  — YES = price goes down / fails to hit target
   *   'neutral'  — can't determine direction automatically
   */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** Raw outcome labels from Polymarket */
  outcomes: string[];
}

export interface PolymarketBTCSentiment {
  /** 0–100 composite bullish score (volume-weighted average of bullish markets) */
  overallBullishScore: number;
  /** Human-readable sentiment label */
  sentimentLabel: 'Very Bullish' | 'Bullish' | 'Neutral' | 'Bearish' | 'Very Bearish';
  /** Top active BTC markets */
  markets: PolymarketMarket[];
  /** Confidence adjustment to apply to BTC/crypto signals (-8 to +8) */
  confidenceAdjustment: number;
  /** Reason string for activity feed */
  reason: string;
  /** ISO timestamp of when the data was fetched */
  fetchedAt: string;
  /** Whether data came from cache */
  fromCache: boolean;
}

// ─── In-memory cache ──────────────────────────────────────────────────────────
let cachedSentiment: PolymarketBTCSentiment | null = null;
let cacheTimestamp = 0;

// ─── Direction classifier ─────────────────────────────────────────────────────

/**
 * Determine if a market's YES outcome is bullish or bearish for BTC.
 * Uses keyword matching on the question text.
 */
function classifyDirection(question: string): 'bullish' | 'bearish' | 'neutral' {
  const q = question.toLowerCase();

  // Bearish signals: fall below, crash, under, drop
  if (
    q.includes('below') ||
    q.includes('under $') ||
    q.includes('crash') ||
    q.includes('drop to') ||
    q.includes('fall below') ||
    q.includes('lose') ||
    (q.includes('less than') && (q.includes('btc') || q.includes('bitcoin')))
  ) return 'bearish';

  // Bullish signals: above, reach, hit, exceed, over
  if (
    q.includes('above') ||
    q.includes('exceed') ||
    q.includes('over $') ||
    q.includes('reach $') ||
    q.includes('hit $') ||
    q.includes('cross $') ||
    q.includes('surpass') ||
    q.includes('higher than') ||
    (q.includes('at least') && (q.includes('btc') || q.includes('bitcoin')))
  ) return 'bullish';

  return 'neutral';
}

// ─── Sentiment calculator ─────────────────────────────────────────────────────

function computeSentimentLabel(score: number): PolymarketBTCSentiment['sentimentLabel'] {
  if (score >= 70) return 'Very Bullish';
  if (score >= 55) return 'Bullish';
  if (score >= 45) return 'Neutral';
  if (score >= 30) return 'Bearish';
  return 'Very Bearish';
}

function computeConfidenceAdjustment(score: number, signalDirection?: 'BUY' | 'SELL'): number {
  if (!signalDirection) return 0;
  // Score 0–100: 50 = neutral, >50 = bullish, <50 = bearish
  const deviation = score - 50; // -50 to +50
  // Scale to -8 to +8
  const raw = Math.round((deviation / 50) * 8);
  if (signalDirection === 'BUY') return raw;   // positive = helpful for BUY
  if (signalDirection === 'SELL') return -raw; // invert for SELL
  return 0;
}

// ─── Polymarket API fetcher ───────────────────────────────────────────────────

async function fetchPolymarketBTCMarkets(): Promise<PolymarketMarket[]> {
  // Try sorted URL first; fall back to unsorted if API rejects sort params (422)
  const urlSorted   = `${GAMMA_BASE}/markets?tag=bitcoin&active=true&closed=false&limit=20&sort_by=volume&order=desc`;
  const urlFallback = `${GAMMA_BASE}/markets?tag=bitcoin&active=true&closed=false&limit=20`;

  let res = await fetch(urlSorted, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    signal: AbortSignal.timeout(8000),
  });

  if (!res.ok && res.status === 422) {
    // Sort params rejected — retry without them
    res = await fetch(urlFallback, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
      signal: AbortSignal.timeout(8000),
    });
  }

  if (!res.ok) throw new Error(`Polymarket API error: ${res.status}`);

  const data = await res.json() as any[];
  if (!Array.isArray(data)) throw new Error('Unexpected Polymarket response format');

  const markets: PolymarketMarket[] = [];

  for (const item of data) {
    // outcomePrices is an array of stringified numbers like ["0.43", "0.57"]
    // outcomes is an array of labels like ["Yes", "No"]
    const outcomes: string[] = Array.isArray(item.outcomes)
      ? item.outcomes
      : JSON.parse(item.outcomes || '["Yes","No"]');

    const prices: number[] = (() => {
      try {
        const raw = Array.isArray(item.outcomePrices)
          ? item.outcomePrices
          : JSON.parse(item.outcomePrices || '[0.5,0.5]');
        return raw.map((p: string | number) => parseFloat(String(p)));
      } catch { return [0.5, 0.5]; }
    })();

    // Yes is always index 0 in Polymarket binary markets
    const yesProb = Math.round((prices[0] ?? 0.5) * 100);
    const noProb  = 100 - yesProb;

    const direction = classifyDirection(item.question || '');
    const volume    = parseFloat(item.volumeNum ?? item.volume ?? '0') || 0;

    markets.push({
      id:              item.id || item.conditionId || '',
      question:        item.question || 'Unknown market',
      yesProbability:  yesProb,
      noProbability:   noProb,
      volume,
      endDate:         item.endDate || item.endDateIso || null,
      closed:          item.closed ?? false,
      direction,
      outcomes,
    });
  }

  // Only return markets where we know the direction (bullish or bearish)
  // and that have meaningful volume (> $1k) to filter test markets
  return markets
    .filter(m => m.direction !== 'neutral' && m.volume > 1000)
    .slice(0, 10);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Get BTC sentiment from Polymarket.
 * Results are cached for 5 minutes. Pass `forceRefresh=true` to bypass cache.
 */
export async function getPolymarketBTCSentiment(
  signalDirection?: 'BUY' | 'SELL',
  forceRefresh = false,
): Promise<PolymarketBTCSentiment> {
  const now = Date.now();

  // Return cached data if still fresh
  if (!forceRefresh && cachedSentiment && (now - cacheTimestamp) < CACHE_TTL_MS) {
    const adj = computeConfidenceAdjustment(cachedSentiment.overallBullishScore, signalDirection);
    return {
      ...cachedSentiment,
      confidenceAdjustment: adj,
      reason: buildReason(cachedSentiment.overallBullishScore, cachedSentiment.sentimentLabel, adj, signalDirection),
      fromCache: true,
    };
  }

  let markets: PolymarketMarket[] = [];
  try {
    markets = await fetchPolymarketBTCMarkets();
  } catch (err: any) {
    // If fetch fails and we have stale cache, return it rather than crashing
    if (cachedSentiment) {
      return { ...cachedSentiment, fromCache: true, confidenceAdjustment: 0, reason: 'Polymarket: using stale cache (fetch failed)' };
    }
    throw err;
  }

  // Compute volume-weighted average bullish score
  let totalVolume = 0;
  let weightedBullScore = 0;

  for (const m of markets) {
    const bullScore = m.direction === 'bullish' ? m.yesProbability : (100 - m.yesProbability);
    weightedBullScore += bullScore * m.volume;
    totalVolume += m.volume;
  }

  const overallBullishScore = totalVolume > 0
    ? Math.round(weightedBullScore / totalVolume)
    : 50;

  const sentimentLabel = computeSentimentLabel(overallBullishScore);
  const adj = computeConfidenceAdjustment(overallBullishScore, signalDirection);
  const reason = buildReason(overallBullishScore, sentimentLabel, adj, signalDirection);

  const result: PolymarketBTCSentiment = {
    overallBullishScore,
    sentimentLabel,
    markets,
    confidenceAdjustment: adj,
    reason,
    fetchedAt: new Date().toISOString(),
    fromCache: false,
  };

  // Store in cache
  cachedSentiment = result;
  cacheTimestamp = now;

  return result;
}

function buildReason(
  score: number,
  label: string,
  adj: number,
  direction?: 'BUY' | 'SELL',
): string {
  if (!direction) return `Polymarket BTC: ${label} (${score}% bullish sentiment)`;
  const alignText = adj > 0 ? `aligns with ${direction}` : adj < 0 ? `conflicts with ${direction}` : 'neutral vs';
  const adjText = adj !== 0 ? ` → ${adj > 0 ? '+' : ''}${adj}%` : ' → no adjustment';
  return `📊 Polymarket BTC: ${label} (${score}%) ${alignText}${adjText}`;
}

/** Force-clear the cache (useful when testing or after engine restart) */
export function clearPolymarketCache(): void {
  cachedSentiment = null;
  cacheTimestamp = 0;
}

/** Return the raw cached data without fetching */
export function getCachedPolymarketSentiment(): PolymarketBTCSentiment | null {
  return cachedSentiment;
}
