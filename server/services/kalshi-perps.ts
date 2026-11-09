// ─────────────────────────────────────────────────────────────────────────────
// Kalshi margin (perpetual futures) PUBLIC market-data client — 2026-11-08.
//
// PHASE 1 of the Kalshi stock-perp lane (see
// research_notes/kalshi-stock-perps-recon-20261108.md). This module is
// deliberately PUBLIC-ONLY: unauthenticated GETs against the margin market
// data endpoints. It must NEVER grow auth headers, credential imports, or
// order endpoints — the authenticated client lives in kalshi-trading.ts and
// the two must stay separate so the shadow lane can prove it cannot trade.
//
// Phase 0 findings pinned here (verified live 2026-11-09 against prod):
//  • Prod tickers carry NO generation suffix: KXAAPLPERP. The DEMO host uses
//    KX{SYM}PERP1 (current) / PERP2 (legacy, closed). Accept PERP and PERP1;
//    PERP2 is always rejected.
//  • Candlesticks: period_interval ∈ {1, 60, 1440} minutes only; max 5000
//    candles per request (larger ranges 400). Candles carry bid/ask/price
//    OHLC objects; price.* fields are NULL on no-trade minutes (use
//    `previous`, then the bid/ask mid). end_period_ts is the period END.
//  • Stock-perp history only exists since the product launch (2026-11-05)
//    and the market closes Fri 17:00 ET → Sun 18:00 ET, so windows spanning
//    the weekend return far fewer bars than the wall-clock span suggests.
//  • Funding (equities): once daily at 16:00 ET. PINNED sign convention
//    (Kalshi docs + spec): funding_rate > 0 → LONGS PAY SHORTS; < 0 →
//    shorts pay longs. Payment = rate × mark_price × contracts held at the
//    funding timestamp; /margin/funding_history's funding_amount uses the
//    same sign from the holder's side (positive = received). Rate is a
//    TWAP premium index clamped to ±funding_cap (0.02) with a deadband
//    (0.00002) below which the rate is 0.
//  • Orderbook: { asks: [[price, size], ...], bids: [...] } — do not assume
//    sort order; best bid = max bid price, best ask = min ask price.
// ─────────────────────────────────────────────────────────────────────────────

const PROD_HOST = 'https://external-api.kalshi.com/trade-api/v2';
const DEMO_HOST = 'https://external-api.demo.kalshi.co/trade-api/v2';

/** Prod by default. KALSHI_PERP_HOST=demo exists only to validate API shape —
 *  demo prices are synthetic and must never price a shadow outcome. */
export function perpHost(): string {
  return process.env.KALSHI_PERP_HOST === 'demo' ? DEMO_HOST : PROD_HOST;
}

const num = (v: any): number => { const n = typeof v === 'string' ? parseFloat(v) : Number(v); return Number.isFinite(n) ? n : 0; };

async function getJson(path: string): Promise<any> {
  const ctrl = new AbortController();
  const to = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch(`${perpHost()}${path}`, { signal: ctrl.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`kalshi-perps GET ${path} -> ${res.status}`);
    return await res.json();
  } finally { clearTimeout(to); }
}

// ── markets ─────────────────────────────────────────────────────────────────
export interface PerpMarket {
  ticker: string;
  underlying: string;
  title: string;
  status: string;
  bid: number; ask: number; price: number;
  contractSize: number;
  leverageEstimate: number;
  volume24hContracts: number;
  volume24hNotionalUsd: number;
  openInterest: number;
  openInterestNotionalUsd: number;
  tickSize: number;
  fundingCap: number;
  scheduleOpen: boolean;
  haltSources: string[];
}

/** KX{SYM}PERP (prod) or KX{SYM}PERP1 (demo) — never PERP2 (legacy/closed). */
export function underlyingOfPerpTicker(ticker: string): string | null {
  const m = /^KX([A-Z][A-Z0-9.]*)PERP1?$/.exec(ticker || '');
  return m ? m[1] : null;
}

// Index / ETF underlyings that ride along in the Equities asset class but are
// not single stocks. KALSHI_STOCK_PERP_EXCLUDE (comma list) replaces this set.
const DEFAULT_INDEX_EXCLUDE = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'US500', 'USTECH100', 'SPX', 'NDX', 'VIX']);
export function indexExcludeSet(): Set<string> {
  const env = (process.env.KALSHI_STOCK_PERP_EXCLUDE || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
  return env.length ? new Set(env) : DEFAULT_INDEX_EXCLUDE;
}

let _marketsCache: { at: number; markets: PerpMarket[] } | null = null;
const MARKETS_TTL_MS = 60_000;

export async function getPerpMarkets(): Promise<PerpMarket[]> {
  if (_marketsCache && Date.now() - _marketsCache.at < MARKETS_TTL_MS) return _marketsCache.markets;
  const out: PerpMarket[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const q = `/margin/markets?limit=1000${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const data = await getJson(q);
    for (const m of data?.markets ?? []) {
      out.push({
        ticker: String(m.ticker || ''),
        underlying: underlyingOfPerpTicker(String(m.ticker || '')) || '',
        title: String(m.title || ''),
        status: String(m.status || ''),
        bid: num(m.bid), ask: num(m.ask), price: num(m.price),
        contractSize: num(m.contract_size),
        leverageEstimate: num(m.leverage_estimate),
        volume24hContracts: num(m.volume_24h),
        volume24hNotionalUsd: num(m.volume_24h_notional_value_dollars),
        openInterest: num(m.open_interest),
        openInterestNotionalUsd: num(m.open_interest_notional_value_dollars),
        tickSize: num(m.tick_size),
        fundingCap: num(m.funding_cap),
        scheduleOpen: m.schedule?.is_open !== false,
        haltSources: Array.isArray(m.halt_sources) ? m.halt_sources.map(String) : [],
      });
    }
    cursor = data?.cursor || null;
    if (!cursor) break;
  }
  _marketsCache = { at: Date.now(), markets: out };
  return out;
}

/** Active single-stock PERP markets passing the liquidity gate, most liquid first. */
export async function getLiquidStockPerps(): Promise<PerpMarket[]> {
  const minVol = Number(process.env.KALSHI_STOCK_SHADOW_MIN_VOL24_USD ?? 25_000);
  const minOi = Number(process.env.KALSHI_STOCK_SHADOW_MIN_OI_USD ?? 10_000);
  const maxTickers = Math.max(1, Math.floor(Number(process.env.KALSHI_STOCK_SHADOW_MAX_TICKERS ?? 20)));
  const exclude = indexExcludeSet();
  const all = await getPerpMarkets();
  return all
    .filter((m) => m.status === 'active' && m.underlying && !exclude.has(m.underlying))
    .filter((m) => m.price > 0 && m.bid > 0 && m.ask > m.bid)
    .filter((m) => m.volume24hNotionalUsd >= minVol && m.openInterestNotionalUsd >= minOi)
    .sort((a, b) => b.volume24hNotionalUsd - a.volume24hNotionalUsd)
    .slice(0, maxTickers);
}

// ── risk parameters ─────────────────────────────────────────────────────────
export interface PerpRiskParams { initialMarginMultiplier: number | null; liquidationThreshold: number | null }
let _riskCache: { at: number; map: Map<string, PerpRiskParams> } | null = null;
export async function getPerpRiskParams(): Promise<Map<string, PerpRiskParams>> {
  if (_riskCache && Date.now() - _riskCache.at < 10 * 60_000) return _riskCache.map;
  const data = await getJson('/margin/risk_parameters');
  const map = new Map<string, PerpRiskParams>();
  const src = data?.risk_parameters ?? data ?? {};
  for (const [ticker, v] of Object.entries<any>(src)) {
    map.set(ticker, {
      initialMarginMultiplier: v?.initial_margin_multiplier != null ? num(v.initial_margin_multiplier) : null,
      liquidationThreshold: v?.liquidation_margin_ratio_threshold != null ? num(v.liquidation_margin_ratio_threshold) : null,
    });
  }
  _riskCache = { at: Date.now(), map };
  return map;
}

// ── candles ─────────────────────────────────────────────────────────────────
export interface PerpBar {
  t: number; // period START, ms epoch
  o: number; h: number; l: number; c: number;
  v: number; // contracts
  bid: { o: number; h: number; l: number; c: number };
  ask: { o: number; h: number; l: number; c: number };
  openInterest: number;
}

function dist(d: any): { o: number | null; h: number | null; l: number | null; c: number | null } {
  const f = (x: any) => (x == null || x === '' ? null : num(x));
  return { o: f(d?.open), h: f(d?.high), l: f(d?.low), c: f(d?.close) };
}

function toBar(raw: any, intervalMin: number): PerpBar | null {
  const endTs = Number(raw?.end_period_ts);
  if (!Number.isFinite(endTs) || endTs <= 0) return null;
  const bid = dist(raw.bid), ask = dist(raw.ask), px = dist(raw.price);
  const prev = raw.price?.previous != null && raw.price.previous !== '' ? num(raw.price.previous) : null;
  const mid = bid.c != null && ask.c != null ? (bid.c + ask.c) / 2 : (bid.c ?? ask.c);
  const c = px.c ?? prev ?? mid;
  if (c == null || !(c > 0)) return null;
  const o = px.o ?? prev ?? c;
  const h = px.h ?? Math.max(o, c);
  const l = px.l ?? Math.min(o, c);
  const z = { o: 0, h: 0, l: 0, c: 0 };
  return {
    t: (endTs - intervalMin * 60) * 1000,
    o, h, l, c, v: num(raw.volume),
    bid: { o: bid.o ?? c, h: bid.h ?? c, l: bid.l ?? c, c: bid.c ?? c },
    ask: { o: ask.o ?? c, h: ask.h ?? c, l: ask.l ?? c, c: ask.c ?? c },
    openInterest: num(raw.open_interest),
  };
}

const _candleCache = new Map<string, { at: number; bars: PerpBar[] }>();
const CANDLE_TTL_MS = 45_000;

/** Raw candles at a native interval (1 | 60 | 1440 minutes), oldest-first. */
export async function getPerpCandles(ticker: string, intervalMin: 1 | 60 | 1440, minutesBack: number): Promise<PerpBar[]> {
  const capped = Math.min(Math.max(intervalMin, minutesBack), 5000 * intervalMin);
  const key = `${ticker}|${intervalMin}|${capped}`;
  const hit = _candleCache.get(key);
  if (hit && Date.now() - hit.at < CANDLE_TTL_MS) return hit.bars;
  const end = Math.floor(Date.now() / 1000);
  const start = end - capped * 60;
  const data = await getJson(`/margin/markets/${encodeURIComponent(ticker)}/candlesticks?start_ts=${start}&end_ts=${end}&period_interval=${intervalMin}`);
  const bars = (data?.candlesticks ?? []).map((r: any) => toBar(r, intervalMin)).filter((b: PerpBar | null): b is PerpBar => !!b)
    .sort((a: PerpBar, b: PerpBar) => a.t - b.t);
  _candleCache.set(key, { at: Date.now(), bars });
  return bars;
}

export function aggregateBars(bars: PerpBar[], factor: number): PerpBar[] {
  if (factor <= 1) return bars;
  const span = factor * 60_000;
  const out: PerpBar[] = [];
  let cur: PerpBar | null = null;
  let bucket = -1;
  for (const b of bars) {
    const bk = Math.floor(b.t / span);
    if (!cur || bk !== bucket) {
      if (cur) out.push(cur);
      bucket = bk;
      cur = { ...b, bid: { ...b.bid }, ask: { ...b.ask } };
    } else {
      cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.v += b.v;
      cur.bid.h = Math.max(cur.bid.h, b.bid.h); cur.bid.l = Math.min(cur.bid.l, b.bid.l); cur.bid.c = b.bid.c;
      cur.ask.h = Math.max(cur.ask.h, b.ask.h); cur.ask.l = Math.min(cur.ask.l, b.ask.l); cur.ask.c = b.ask.c;
      cur.openInterest = b.openInterest;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const TF_MINUTES: Record<string, number> = { '1m': 1, '5m': 5, '15m': 15, '30m': 30, '1h': 60, '4h': 240, '1d': 1440 };

/**
 * The fetchBars seam for the crypto strategy runners: oldest-first OHLCV bars
 * for (timeframe, count). 1h/1d use native intervals; everything else is
 * aggregated from 1-minute candles (Kalshi has no native 5m/15m). The window
 * is widened ×2 for the Fri→Sun market closure and retried once wider if the
 * aggregated series still comes back short.
 */
export async function getPerpBars(ticker: string, timeframe: string, count: number): Promise<Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>> {
  const tf = TF_MINUTES[timeframe] ?? 15;
  const strip = (bars: PerpBar[]) => bars.slice(-count).map((b) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v }));
  if (tf === 60 || tf === 1440) {
    const bars = await getPerpCandles(ticker, tf === 60 ? 60 : 1440, (count + 6) * tf);
    return strip(bars);
  }
  if (tf === 240) {
    const bars = await getPerpCandles(ticker, 60, (Math.ceil(count / 4) + 6) * 60);
    return strip(aggregateBars(bars, 4));
  }
  let minutes = Math.min(5000, Math.ceil(count * tf * 2));
  let bars = aggregateBars(await getPerpCandles(ticker, 1, minutes), tf);
  if (bars.length < count && minutes < 5000) {
    minutes = 5000;
    bars = aggregateBars(await getPerpCandles(ticker, 1, minutes), tf);
  }
  return strip(bars);
}

/** Latest touch (best bid/ask) for a ticker from the public orderbook. */
export async function getPerpTouch(ticker: string): Promise<{ bid: number; ask: number } | null> {
  try {
    const data = await getJson(`/margin/markets/${encodeURIComponent(ticker)}/orderbook`);
    const bids: any[] = data?.orderbook?.bids ?? [];
    const asks: any[] = data?.orderbook?.asks ?? [];
    const bid = bids.reduce((mx, lvl) => Math.max(mx, num(lvl?.[0])), 0);
    const ask = asks.reduce((mn, lvl) => { const p = num(lvl?.[0]); return p > 0 && (mn === 0 || p < mn) ? p : mn; }, 0);
    return bid > 0 && ask > bid ? { bid, ask } : null;
  } catch { return null; }
}

// ── funding ─────────────────────────────────────────────────────────────────
export interface PerpFundingRate { fundingTimeMs: number; rate: number; markPrice: number }

/** Historical funding events for a ticker, oldest-first. Public. */
export async function getPerpFundingHistory(ticker: string): Promise<PerpFundingRate[]> {
  const data = await getJson(`/margin/funding_rates/historical?ticker=${encodeURIComponent(ticker)}`);
  return (data?.funding_rates ?? [])
    .map((r: any) => ({ fundingTimeMs: new Date(r.funding_time).getTime(), rate: num(r.funding_rate), markPrice: num(r.mark_price) }))
    .filter((r: PerpFundingRate) => Number.isFinite(r.fundingTimeMs) && r.fundingTimeMs > 0)
    .sort((a: PerpFundingRate, b: PerpFundingRate) => a.fundingTimeMs - b.fundingTimeMs);
}

/** Current in-progress funding estimate for a ticker. Public. */
export async function getPerpFundingEstimate(ticker: string): Promise<{ rate: number; nextFundingTimeMs: number } | null> {
  try {
    const data = await getJson(`/margin/funding_rates/estimate?ticker=${encodeURIComponent(ticker)}`);
    const next = new Date(data?.next_funding_time).getTime();
    return { rate: num(data?.funding_rate), nextFundingTimeMs: Number.isFinite(next) ? next : 0 };
  } catch { return null; }
}

// ── corporate actions ───────────────────────────────────────────────────────
export interface PerpCorporateAction {
  ticker: string;
  type: string;
  status: string; // scheduled | cancelled | applied | lapsed | (other, passed through)
  effectiveMs: number | null;
  raw: any;
}

let _caCache: { at: number; actions: PerpCorporateAction[] } | null = null;
/** All corporate-action notices (public). Parsed defensively — the feed is
 *  empty at launch, so unknown fields are preserved on `raw`. */
export async function getPerpCorporateActions(): Promise<PerpCorporateAction[]> {
  if (_caCache && Date.now() - _caCache.at < 10 * 60_000) return _caCache.actions;
  const data = await getJson('/margin/corporate_actions');
  const list: any[] = Array.isArray(data) ? data : (data?.corporate_actions ?? data?.notices ?? []);
  const actions = list.map((a: any) => {
    const t = a?.effective_ts ?? a?.effective_time ?? a?.scheduled_ts ?? a?.scheduled_time ?? a?.ex_date ?? a?.pay_date ?? a?.record_date ?? null;
    const ms = t == null ? null : (typeof t === 'number' ? (t > 1e12 ? t : t * 1000) : new Date(t).getTime());
    return {
      ticker: String(a?.market_ticker ?? a?.ticker ?? ''),
      type: String(a?.type ?? a?.action_type ?? ''),
      status: String(a?.status ?? '').toLowerCase(),
      effectiveMs: ms != null && Number.isFinite(ms) ? ms : null,
      raw: a,
    } as PerpCorporateAction;
  }).filter((a: PerpCorporateAction) => !!a.ticker);
  _caCache = { at: Date.now(), actions };
  return actions;
}
