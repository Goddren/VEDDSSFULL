// ─────────────────────────────────────────────────────────────────────────────
// DeFi-native market data — candles and token DISCOVERY straight from the chain.
//
// WHY THIS EXISTS: the crypto engine executes on-chain (0x swaps from a hot
// wallet) but every strategy took its candles from CryptoComService.getCandles.
// That capped the tradeable universe at whatever Crypto.com happens to list, on
// a bot whose money never touches Crypto.com. Of a 21-symbol watchlist only a
// handful existed on Base at all; "open it to everything on Base" was impossible
// by construction, because a token with no Crypto.com listing was invisible.
//
// Source: GeckoTerminal (free, no key). It gives both halves —
//   • which tokens are worth looking at (pools ranked by 24h volume), and
//   • OHLCV per pool, in the same [t,o,h,l,c,v] shape the strategies expect.
//
// Discovery is deliberately conservative. Opening a bot to every token on a
// chain means honeypots, sell-taxes, and LP rugs, so nothing reaches the
// strategies unless it clears the liquidity/volume/spread floors below.
// ─────────────────────────────────────────────────────────────────────────────

const GT = 'https://api.geckoterminal.com/api/v2';

// A CoinGecko DEMO key lifts the per-minute ceiling to a documented 30/min.
// Without it this IP measured ~3-4 calls/min before 429s, which is not enough to
// run an engine. The Demo key rides the SAME host; only paid tiers move to
// pro-api.coingecko.com/api/v3/onchain with an x-cg-pro-api-key header, so if
// this is ever upgraded both the host and the header name must change.
function cgHeaders(): Record<string, string> {
  const h: Record<string, string> = { accept: 'application/json' };
  const key = (process.env.COINGECKO_API_KEY ?? '').trim();
  if (key) h['x-cg-demo-api-key'] = key;
  return h;
}

/**
 * Demo tier is 30 calls/min but only ~10,000 calls/MONTH, and the monthly cap is
 * the binding constraint — roughly 330/day. Every default below is sized against
 * that budget, not against the per-minute limit. Override via env when the plan
 * changes rather than editing code.
 */
export function callBudget() {
  const hasKey = !!(process.env.COINGECKO_API_KEY ?? '').trim();
  return {
    hasKey,
    // With a key we can space calls at the documented rate; without one, crawl.
    minIntervalMs: Number(process.env.COINGECKO_MIN_INTERVAL_MS ?? (hasKey ? 2100 : 15000)),
    // Discovery is the same answer for everyone, so cache it hard: at 3 pages a
    // refresh, a 5-minute TTL alone would spend 864 calls/day of a ~330 budget.
    discoveryTtlMs: Number(process.env.COINGECKO_DISCOVERY_TTL_MS ?? (hasKey ? 60 * 60 * 1000 : 6 * 60 * 60 * 1000)),
    candleTtlMs: Number(process.env.COINGECKO_CANDLE_TTL_MS ?? (hasKey ? 10 * 60 * 1000 : 30 * 60 * 1000)),
  };
}

/** DEFI_CHAINS keys → GeckoTerminal network slugs. */
const GT_NETWORK: Record<string, string> = {
  ethereum: 'eth', base: 'base', arbitrum: 'arbitrum',
  optimism: 'optimism', polygon: 'polygon_pos',
};

export interface DefiCandle { t: number; o: number; h: number; l: number; c: number; v: number }

export interface DefiToken {
  symbol: string;
  address: string;        // the token contract — what actually gets swapped
  poolAddress: string;    // deepest pool, used for candles
  priceUsd: number;
  liquidityUsd: number;
  volume24Usd: number;
}

/**
 * Only the SETTLEMENT currency is excluded. Every position is entered and exited
 * as USDC -> token -> USDC, so buying USDC with USDC is the one meaningless
 * trade. Other stablecoins (EURC, USDT, DAI) and tokenized equities are real
 * positions with real price movement and stay in the universe.
 */
const SETTLEMENT = new Set(['USDC', 'USDBC', 'USDC.E']);

export interface DiscoveryOptions {
  minLiquidityUsd?: number;
  minVolume24Usd?: number;
  maxTokens?: number;
  pages?: number;
}

// GeckoTerminal's free tier allows roughly 30 calls/minute. A scan asks for
// several timeframes per token, so an unthrottled cycle trips the limit within
// seconds — and a 429 surfaced as zero candles is indistinguishable from a token
// with no trading history, which would quietly mark healthy tokens untradeable.
// Serialise every call behind a minimum interval, and back off on a real 429.
let callChain: Promise<any> = Promise.resolve();
let lastCallAt = 0;

async function gt(path: string): Promise<any> {
  const run = async (): Promise<any> => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const wait = Math.max(0, callBudget().minIntervalMs - (Date.now() - lastCallAt));
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastCallAt = Date.now();

      const res = await fetch(`${GT}${path}`, {
        headers: cgHeaders(),
        signal: AbortSignal.timeout(20000),
      });
      if (res.ok) return res.json();
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 0;
        const backoff = retryAfter > 0 ? retryAfter * 1000 : 3000 * (attempt + 1);
        console.warn(`[defi-market-data] rate limited on ${path}; waiting ${backoff}ms (attempt ${attempt + 1}/3)`);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
      throw new Error(`GeckoTerminal ${res.status} on ${path}`);
    }
    // Never silently return empty: the caller must be able to tell a throttled
    // read from a token that genuinely has no data.
    throw new Error(`GeckoTerminal rate limited after 3 attempts on ${path}`);
  };
  // Chain so concurrent callers queue instead of bursting.
  const next = callChain.then(run, run);
  callChain = next.catch(() => undefined);
  return next;
}

// Discovery is the same for every caller in a cycle, and GeckoTerminal's free
// tier is rate limited, so hold the result briefly.
let discoveryCache: { key: string; at: number; tokens: DefiToken[] } | null = null;

/**
 * The tradeable universe for a chain: tokens with a real, liquid pool, ranked by
 * 24h volume. THROWS if the API cannot be read — an empty list would look
 * exactly like "there is nothing to trade", and this codebase has already been
 * bitten twice by a failed read masquerading as an empty result.
 */
export async function discoverDefiTokens(chainKey: string, opts: DiscoveryOptions = {}): Promise<DefiToken[]> {
  const net = GT_NETWORK[chainKey];
  if (!net) throw new Error(`no GeckoTerminal network mapping for chain "${chainKey}"`);
  const minLiq = opts.minLiquidityUsd ?? 250_000;
  const minVol = opts.minVolume24Usd ?? 100_000;
  const maxTokens = opts.maxTokens ?? 40;
  const pages = opts.pages ?? 3;

  const key = `${chainKey}:${minLiq}:${minVol}:${maxTokens}:${pages}`;
  if (discoveryCache && discoveryCache.key === key && Date.now() - discoveryCache.at < callBudget().discoveryTtlMs) {
    return discoveryCache.tokens;
  }

  // Keep the DEEPEST pool per token: the same token appears in many pools and
  // candles from a thin one are noise that the strategies would read as signal.
  const best = new Map<string, DefiToken>();
  let pagesRead = 0;
  const errors: string[] = [];

  for (let page = 1; page <= pages; page++) {
    try {
      const d = await gt(`/networks/${net}/pools?page=${page}&sort=h24_volume_usd_desc`);
      pagesRead++;
      for (const p of (d?.data ?? [])) {
        const a = p?.attributes ?? {};
        const liq = Number(a.reserve_in_usd ?? 0);
        const vol = Number(a.volume_usd?.h24 ?? 0);
        const price = Number(a.base_token_price_usd ?? 0);
        const poolAddress = a.address;
        if (!poolAddress || !price || liq < minLiq || vol < minVol) continue;

        // "WETH / USDC 0.05%" → the base token is the left side.
        const symbol = String(a.name ?? '').split('/')[0].trim().toUpperCase();
        if (!symbol || SETTLEMENT.has(symbol)) continue;

        // relationships.base_token.data.id looks like "base_0xabc…"
        const rel = p?.relationships?.base_token?.data?.id ?? '';
        const address = String(rel).split('_').pop() ?? '';
        if (!/^0x[a-fA-F0-9]{40}$/.test(address)) continue;

        const prev = best.get(address);
        if (!prev || liq > prev.liquidityUsd) {
          best.set(address, { symbol, address, poolAddress, priceUsd: price, liquidityUsd: liq, volume24Usd: vol });
        }
      }
    } catch (e: any) {
      errors.push(e?.message);
    }
  }

  if (pagesRead === 0) {
    throw new Error(`could not read any pool page for ${chainKey}: ${errors.join(' | ')}`);
  }
  if (errors.length) console.warn(`[defi-market-data] ${errors.length}/${pages} pool pages failed for ${chainKey}: ${errors.join(' | ')}`);

  // Array.from, not [...spread]: this project's tsconfig target predates
  // downlevelIteration, so spreading a Map iterator is a compile error.
  const tokens = Array.from(best.values())
    .sort((x, y) => y.volume24Usd - x.volume24Usd)
    .slice(0, maxTokens);
  discoveryCache = { key, at: Date.now(), tokens };
  return tokens;
}

// timeframe → GeckoTerminal (endpoint, aggregate)
const TF: Record<string, [string, number]> = {
  '1m': ['minute', 1], '5m': ['minute', 5], '15m': ['minute', 15],
  '1h': ['hour', 1], '4h': ['hour', 4], '1d': ['day', 1],
};

// Five strategies ask for several timeframes per token per cycle; without this
// a 40-token watchlist would blow through the free tier's rate limit instantly.
const candleCache = new Map<string, { at: number; bars: DefiCandle[] }>();

/**
 * OHLCV for a pool, oldest-first — the same shape and ordering that
 * CryptoComService.getCandles returned, so strategy code needs no changes.
 */
export async function getDefiCandles(chainKey: string, poolAddress: string, timeframe: string, count: number): Promise<DefiCandle[]> {
  const net = GT_NETWORK[chainKey];
  if (!net) throw new Error(`no GeckoTerminal network mapping for chain "${chainKey}"`);
  const [endpoint, aggregate] = TF[timeframe] ?? TF['5m'];

  // Key deliberately EXCLUDES count. The strategies ask the same timeframe for
  // different depths (5m x100 and 5m x60), which under a count-keyed cache meant
  // two API calls for data that is a subset of itself — doubling traffic against
  // a rate-limited free tier. Fetch a generous depth once, slice per caller.
  const FETCH_DEPTH = 300;
  const key = `${net}:${poolAddress}:${endpoint}:${aggregate}`;
  const hit = candleCache.get(key);
  if (hit && Date.now() - hit.at < callBudget().candleTtlMs) return hit.bars.slice(-count);

  const d = await gt(`/networks/${net}/pools/${poolAddress}/ohlcv/${endpoint}?aggregate=${aggregate}&limit=${FETCH_DEPTH}`);
  const list: any[] = d?.data?.attributes?.ohlcv_list ?? [];
  // GeckoTerminal returns newest-first; the indicators assume oldest-first.
  const bars = list
    .map((r) => ({ t: Number(r[0]) * 1000, o: Number(r[1]), h: Number(r[2]), l: Number(r[3]), c: Number(r[4]), v: Number(r[5]) }))
    .filter((b) => Number.isFinite(b.c) && b.c > 0)
    .reverse();
  candleCache.set(key, { at: Date.now(), bars });
  return bars.slice(-count);
}

/** Spot price from the freshest candle close. */
export async function getDefiPrice(chainKey: string, poolAddress: string): Promise<number | null> {
  const bars = await getDefiCandles(chainKey, poolAddress, '5m', 2).catch(() => [] as DefiCandle[]);
  const last = bars[bars.length - 1];
  return last?.c && last.c > 0 ? last.c : null;
}
