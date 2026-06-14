/**
 * VEDD Kalshi BTC Integration
 *
 * Kalshi is a CFTC-regulated US prediction market exchange.
 * Legal for US residents. No API key needed for reading market data.
 *
 * API: https://api.elections.kalshi.com/trade-api/v2/
 * Series: KXBTC — "Bitcoin price range at [time]?" events
 *
 * Each event is a set of mutually-exclusive binary contracts covering
 * $250-wide BTC price buckets (e.g. "$103,000–$103,249") plus catch-all
 * tail contracts ("above $X" / "below $Y"). The YES price (0–100¢ = 0–100%)
 * represents the market's probability that BTC lands in that bucket.
 *
 * Markets are hourly — Kalshi posts a new event for each upcoming hour.
 */

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const CACHE_TTL_MS = 60_000; // 60 s

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KalshiBTCBracket {
  ticker: string;
  subtitle: string;          // e.g. "$103,000 to 103,249.99"
  strikeType: 'greater' | 'less' | 'between';
  floorStrike: number | null;
  capStrike: number | null;
  yesProbability: number;    // 0–100 (from yes_bid or last_price)
  noProb: number;
  hasLiquidity: boolean;
  volume: number;
  yesAsk: number;
  yesBid: number;
}

export interface KalshiBTCEvent {
  eventTicker: string;
  title: string;
  closeTime: string;         // ISO when market resolves
  msUntilClose: number;
  brackets: KalshiBTCBracket[];
  /** The bracket closest to currentBTCPrice (if provided) */
  nearestBracket: KalshiBTCBracket | null;
  /** Bracket with highest YES probability — "market consensus" */
  consensusBracket: KalshiBTCBracket | null;
  totalVolume: number;
  hasActiveLiquidity: boolean;
  fetchedAt: string;
  fromCache: boolean;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cached: KalshiBTCEvent | null = null;
let cacheTs = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDollars(val: string | number | undefined | null): number {
  if (val == null) return 0;
  const n = parseFloat(String(val));
  return isNaN(n) ? 0 : Math.round(n * 100); // convert $0.37 → 37 (cents = %)
}

// ── API fetchers ──────────────────────────────────────────────────────────────

async function fetchNearestEvent(): Promise<{ eventTicker: string; title: string; closeTime: string } | null> {
  const url = `${KALSHI_BASE}/events?series_ticker=KXBTC&limit=10&status=open`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Kalshi events API ${res.status}`);
  const data = await res.json() as { events?: any[] };
  const events = data.events ?? [];
  if (!events.length) return null;

  const now = Date.now();
  // Find the event with the soonest strike_date in the future
  const upcoming = events
    .map((e: any) => ({
      eventTicker: e.event_ticker as string,
      title: e.title as string,
      closeTime: (e.strike_date as string) ?? '',
    }))
    .filter(e => new Date(e.closeTime).getTime() > now)
    .sort((a, b) => new Date(a.closeTime).getTime() - new Date(b.closeTime).getTime());

  return upcoming[0] ?? null;
}

async function fetchEventMarkets(eventTicker: string): Promise<any[]> {
  const url = `${KALSHI_BASE}/markets?event_ticker=${eventTicker}&limit=200`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Kalshi markets API ${res.status}`);
  const data = await res.json() as { markets?: any[] };
  return data.markets ?? [];
}

// ── Main builder ──────────────────────────────────────────────────────────────

function buildBrackets(rawMarkets: any[]): KalshiBTCBracket[] {
  return rawMarkets
    .filter(m => m.status === 'active' || m.status === 'open')
    .map((m): KalshiBTCBracket => {
      const yesAsk  = parseDollars(m.yes_ask_dollars);
      const yesBid  = parseDollars(m.yes_bid_dollars);
      const noAsk   = parseDollars(m.no_ask_dollars);
      const noBid   = parseDollars(m.no_bid_dollars);
      const lastPct = parseDollars(m.last_price_dollars);
      const volume  = parseFloat(m.volume_fp ?? '0') || 0;

      // Best estimate of YES probability:
      // Use last_price if traded; otherwise mid of bid/ask; otherwise infer from NO side
      let yesProbability: number;
      if (lastPct > 0) {
        yesProbability = lastPct;
      } else if (yesBid > 0 || yesAsk > 0) {
        yesProbability = yesBid > 0 && yesAsk > 0 ? Math.round((yesBid + yesAsk) / 2) : Math.max(yesBid, yesAsk);
      } else if (noBid > 0) {
        yesProbability = 100 - noBid; // infer from NO side
      } else {
        yesProbability = 0;
      }

      const hasLiquidity = volume > 0 || (yesBid > 1 && yesAsk < 99);

      return {
        ticker:       m.ticker,
        subtitle:     m.subtitle ?? m.yes_sub_title ?? '',
        strikeType:   m.strike_type,
        floorStrike:  m.floor_strike != null ? Number(m.floor_strike) : null,
        capStrike:    m.cap_strike   != null ? Number(m.cap_strike)   : null,
        yesProbability,
        noProb:       Math.max(0, 100 - yesProbability),
        hasLiquidity,
        volume,
        yesAsk,
        yesBid,
      };
    });
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getKalshiBTCEvent(
  currentBTCPrice?: number,
  forceRefresh = false,
): Promise<KalshiBTCEvent> {
  const now = Date.now();
  if (!forceRefresh && cached && (now - cacheTs) < CACHE_TTL_MS) {
    return { ...cached, fromCache: true };
  }

  const nearestEvent = await fetchNearestEvent();
  if (!nearestEvent) {
    throw new Error('No active KXBTC events on Kalshi');
  }

  const rawMarkets = await fetchEventMarkets(nearestEvent.eventTicker);
  const brackets   = buildBrackets(rawMarkets);

  const totalVolume      = brackets.reduce((s, b) => s + b.volume, 0);
  const hasActiveLiquidity = brackets.some(b => b.hasLiquidity);

  // Consensus = highest YES probability bracket (market's best guess)
  const consensusBracket = brackets.reduce<KalshiBTCBracket | null>((best, b) =>
    b.yesProbability > (best?.yesProbability ?? -1) ? b : best, null);

  // Nearest to current BTC price (if we know it)
  let nearestBracket: KalshiBTCBracket | null = null;
  if (currentBTCPrice && brackets.length) {
    nearestBracket = brackets.reduce((best, b) => {
      // For "between" brackets use midpoint; for tails use the strike
      const mid = b.floorStrike != null && b.capStrike != null
        ? (b.floorStrike + b.capStrike) / 2
        : b.floorStrike ?? b.capStrike ?? 0;
      const bestMid = best.floorStrike != null && best.capStrike != null
        ? (best.floorStrike + best.capStrike) / 2
        : best.floorStrike ?? best.capStrike ?? 0;
      return Math.abs(mid - currentBTCPrice) < Math.abs(bestMid - currentBTCPrice) ? b : best;
    });
  }

  const msUntilClose = Math.max(0, new Date(nearestEvent.closeTime).getTime() - now);

  const result: KalshiBTCEvent = {
    eventTicker:       nearestEvent.eventTicker,
    title:             nearestEvent.title,
    closeTime:         nearestEvent.closeTime,
    msUntilClose,
    brackets:          brackets.sort((a, b) => b.yesProbability - a.yesProbability).slice(0, 10),
    nearestBracket,
    consensusBracket,
    totalVolume,
    hasActiveLiquidity,
    fetchedAt:         new Date().toISOString(),
    fromCache:         false,
  };

  cached  = result;
  cacheTs = now;
  return result;
}

export function clearKalshiCache(): void {
  cached  = null;
  cacheTs = 0;
}
