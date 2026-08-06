/**
 * BTC 5-Minute Price Predictor
 *
 * Uses the Binance public REST API — no API key required, no geo-block,
 * legal for US users. Fetches the last 100 5-minute BTCUSDT candles,
 * computes RSI/MACD/EMA/Volume Delta, and returns a scored directional
 * prediction the Polymarket Engine (and UI) can consume.
 *
 * Binance public klines: https://api.binance.com/api/v3/klines
 */

const BINANCE_BASE = 'https://api.binance.com';
// Coinbase Exchange is US-hosted and NOT geo-blocked — used as a fallback when
// Binance returns HTTP 451 (Binance blocks US server IPs like Render/Oregon).
const COINBASE_BASE = 'https://api.exchange.coinbase.com';
// Yahoo Finance's unofficial chart API — free, no key, no geo-block — used for
// GOLD since it isn't a crypto asset and has no Binance/Coinbase listing.
// Futures price (GC=F), not Kalshi's own "Pyth - Gold" settlement source —
// same category of approximation this file already accepts for crypto
// (Binance/Coinbase spot vs. Kalshi's "CF Benchmarks" settlement); highly
// correlated short-term movement, good enough for directional signal generation.
const YAHOO_BASE = 'https://query1.finance.yahoo.com';
const CACHE_TTL_MS = 30_000; // 30 seconds

// Coin → {Binance symbol, Coinbase product} — added to extend this predictor
// (originally BTC-only) to the other coins Kalshi lists hourly/15-min range
// events for. Coinbase product codes confirmed against their public API.
// 'GOLD' added for Kalshi's KXGOLDH commodities market (confirmed live:
// only Gold's HOURLY series has available_on_brokers:true — Oil's hourly/
// 15-min and Gold's own 15-min are all broker-unavailable on Kalshi's side,
// so they're intentionally not wired up as tradeable here yet).
export type CryptoCoin = 'BTC' | 'ETH' | 'SOL' | 'XRP' | 'DOGE' | 'GOLD';
const COIN_MAP: Record<Exclude<CryptoCoin, 'GOLD'>, { binance: string; coinbase: string }> = {
  BTC:  { binance: 'BTCUSDT',  coinbase: 'BTC-USD' },
  ETH:  { binance: 'ETHUSDT',  coinbase: 'ETH-USD' },
  SOL:  { binance: 'SOLUSDT',  coinbase: 'SOL-USD' },
  XRP:  { binance: 'XRPUSDT',  coinbase: 'XRP-USD' },
  DOGE: { binance: 'DOGEUSDT', coinbase: 'DOGE-USD' },
};
const YAHOO_SYMBOL: Record<'GOLD', string> = {
  GOLD: 'GC=F',
};

export interface BTC5MinCandle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface BTC5MinPrediction {
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  confidence: number;       // 0–100
  currentPrice: number;
  priceChange5m: number;    // % change last candle
  priceChange1h: number;    // % change over 12 candles (1 h)
  rsi: number;
  macdSignal: 'bullish' | 'bearish' | 'neutral';
  macdHistogram: number;
  ema9: number;
  ema21: number;
  ema50: number;
  volumeTrend: 'rising' | 'falling' | 'flat';
  supportLevel: number;
  resistanceLevel: number;
  reasons: string[];
  fetchedAt: string;
  fromCache: boolean;
  symbol: string;
  source?: string;          // 'binance' | 'coinbase' — which feed supplied the candles
}

// ── Cache ─────────────────────────────────────────────────────────────────────
// Per-coin now (was a single module-level slot when this was BTC-only) so
// scanning multiple coins in the same cycle doesn't have each one clobber the
// last one's cached prediction.

const predictionCache = new Map<CryptoCoin, { prediction: BTC5MinPrediction; ts: number }>();

// ── Technical analysis helpers ────────────────────────────────────────────────

function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const result: number[] = [];
  let e = values[0];
  result.push(e);
  for (let i = 1; i < values.length; i++) {
    e = values[i] * k + e * (1 - k);
    result.push(e);
  }
  return result;
}

function rsi(closes: number[], period = 14): number {
  if (closes.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Math.round(100 - 100 / (1 + rs));
}

function macd(closes: number[]): { macdLine: number; signalLine: number; histogram: number } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const last = closes.length - 1;
  return {
    macdLine:   macdLine[last],
    signalLine: signalLine[last],
    histogram:  macdLine[last] - signalLine[last],
  };
}

function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

// ── Binance fetcher ───────────────────────────────────────────────────────────

async function fetchBinanceCandles(symbol: string, interval: string, limit: number): Promise<BTC5MinCandle[]> {
  const url = `${BINANCE_BASE}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Binance API ${res.status}: ${res.statusText}`);
  const raw: any[][] = await res.json();
  return raw.map(c => ({
    openTime: c[0],
    open:     parseFloat(c[1]),
    high:     parseFloat(c[2]),
    low:      parseFloat(c[3]),
    close:    parseFloat(c[4]),
    volume:   parseFloat(c[5]),
  }));
}

// Coinbase fallback — returns [time(s), low, high, open, close, volume], newest first.
// Used when Binance is geo-blocked (HTTP 451) from US-hosted servers.
async function fetchCoinbaseCandles(limit: number, product = 'BTC-USD'): Promise<BTC5MinCandle[]> {
  // granularity 300 = 5-minute candles; Coinbase caps at 300 candles per request
  const url = `${COINBASE_BASE}/products/${product}/candles?granularity=300`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Coinbase API ${res.status}: ${res.statusText}`);
  const raw: any[][] = await res.json();
  // Coinbase returns newest-first; reverse to oldest-first to match Binance ordering
  const ascending = raw.slice().reverse();
  return ascending.slice(-limit).map(c => ({
    openTime: c[0] * 1000, // seconds → ms
    low:      parseFloat(c[1]),
    high:     parseFloat(c[2]),
    open:     parseFloat(c[3]),
    close:    parseFloat(c[4]),
    volume:   parseFloat(c[5]),
  }));
}

// Tries Binance first, falls back to Coinbase on geo-block / failure.
async function fetchCandlesWithFallback(symbol: string, interval: string, limit: number, coinbaseProduct = 'BTC-USD'): Promise<{ candles: BTC5MinCandle[]; source: string }> {
  try {
    const candles = await fetchBinanceCandles(symbol, interval, limit);
    return { candles, source: 'binance' };
  } catch (binanceErr: any) {
    console.warn(`[BTC5Min] Binance fetch failed (${binanceErr.message}); falling back to Coinbase`);
    const candles = await fetchCoinbaseCandles(limit, coinbaseProduct);
    return { candles, source: 'coinbase' };
  }
}

// ── Yahoo Finance fetcher (GOLD) ──────────────────────────────────────────────

async function fetchYahooCandles(yahooSymbol: string, limit: number): Promise<BTC5MinCandle[]> {
  const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=5m&range=1d`;
  const res = await fetch(url, {
    headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (VEDD-Trading-AI/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`Yahoo Finance API ${res.status}: ${res.statusText}`);
  const data = await res.json() as any;
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`Yahoo Finance returned no chart data for ${yahooSymbol}`);
  const timestamps: number[] = result.timestamp ?? [];
  const q = result.indicators?.quote?.[0] ?? {};
  const candles: BTC5MinCandle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    // Yahoo leaves gaps as null during closed sessions/thin liquidity — skip incomplete bars.
    if (q.open?.[i] == null || q.close?.[i] == null || q.high?.[i] == null || q.low?.[i] == null) continue;
    candles.push({
      openTime: timestamps[i] * 1000,
      open:  q.open[i],
      high:  q.high[i],
      low:   q.low[i],
      close: q.close[i],
      volume: q.volume?.[i] ?? 0,
    });
  }
  return candles.slice(-limit);
}

// ── Prediction builder ────────────────────────────────────────────────────────

function buildPrediction(candles: BTC5MinCandle[], fromCache: boolean, source = 'binance', binanceSymbol = 'BTCUSDT', coinbaseProduct = 'BTC-USD'): BTC5MinPrediction {
  const closes  = candles.map(c => c.close);
  const volumes = candles.map(c => c.volume);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);

  const last    = candles[candles.length - 1];
  const prev    = candles[candles.length - 2];

  const currentPrice  = last.close;
  const priceChange5m = ((last.close - prev.close) / prev.close) * 100;
  const priceChange1h = ((last.close - candles[candles.length - 13].close) / candles[candles.length - 13].close) * 100;

  const ema9Val  = ema(closes, 9)[closes.length - 1];
  const ema21Val = ema(closes, 21)[closes.length - 1];
  const ema50Val = ema(closes, 50)[closes.length - 1];
  const rsiVal   = rsi(closes, 14);
  const { macdLine, signalLine, histogram } = macd(closes);

  const volSma20      = sma(volumes, 20);
  const volLast3      = sma(volumes.slice(-3), 3);
  const volumeTrend   = volLast3 > volSma20 * 1.15 ? 'rising' : volLast3 < volSma20 * 0.85 ? 'falling' : 'flat';
  const macdSignalDir = histogram > 0 ? 'bullish' : histogram < 0 ? 'bearish' : 'neutral';

  // Support = recent 20-candle low, resistance = recent 20-candle high
  const recent20H = Math.max(...highs.slice(-20));
  const recent20L = Math.min(...lows.slice(-20));

  // Score bullish signals (+1 each) vs bearish (-1 each)
  const signals: { score: number; reason: string }[] = [];

  // EMA stack
  if (ema9Val > ema21Val && ema21Val > ema50Val) {
    signals.push({ score: 2, reason: 'EMA stack bullish (9 > 21 > 50)' });
  } else if (ema9Val < ema21Val && ema21Val < ema50Val) {
    signals.push({ score: -2, reason: 'EMA stack bearish (9 < 21 < 50)' });
  }

  // Price vs EMA9
  if (currentPrice > ema9Val) {
    signals.push({ score: 1, reason: `Price above EMA9 ($${ema9Val.toFixed(0)})` });
  } else {
    signals.push({ score: -1, reason: `Price below EMA9 ($${ema9Val.toFixed(0)})` });
  }

  // RSI
  if (rsiVal > 60) {
    signals.push({ score: 1, reason: `RSI ${rsiVal} — momentum bullish` });
  } else if (rsiVal < 40) {
    signals.push({ score: -1, reason: `RSI ${rsiVal} — momentum bearish` });
  } else if (rsiVal > 50) {
    signals.push({ score: 0.5, reason: `RSI ${rsiVal} — mildly bullish` });
  } else {
    signals.push({ score: -0.5, reason: `RSI ${rsiVal} — mildly bearish` });
  }

  // MACD histogram direction
  if (macdSignalDir === 'bullish') {
    signals.push({ score: histogram > 50 ? 2 : 1, reason: `MACD histogram positive (+${histogram.toFixed(1)})` });
  } else {
    signals.push({ score: histogram < -50 ? -2 : -1, reason: `MACD histogram negative (${histogram.toFixed(1)})` });
  }

  // Volume
  if (volumeTrend === 'rising' && priceChange5m > 0) {
    signals.push({ score: 1, reason: 'Volume rising with price — buyers active' });
  } else if (volumeTrend === 'rising' && priceChange5m < 0) {
    signals.push({ score: -1, reason: 'Volume rising with drop — sellers active' });
  }

  // 1-hour trend
  if (priceChange1h > 0.5) {
    signals.push({ score: 1, reason: `1h trend +${priceChange1h.toFixed(2)}%` });
  } else if (priceChange1h < -0.5) {
    signals.push({ score: -1, reason: `1h trend ${priceChange1h.toFixed(2)}%` });
  }

  // RSI extremes — potential reversal
  if (rsiVal >= 75) {
    signals.push({ score: -1, reason: `RSI ${rsiVal} — overbought, watch for reversal` });
  } else if (rsiVal <= 25) {
    signals.push({ score: 1, reason: `RSI ${rsiVal} — oversold, watch for bounce` });
  }

  const rawScore    = signals.reduce((s, x) => s + x.score, 0);
  const maxScore    = 9; // theoretical max
  const normalised  = (rawScore / maxScore + 1) / 2; // 0→1 range
  const confidence  = Math.min(95, Math.max(30, Math.round(normalised * 100)));

  let direction: 'BUY' | 'SELL' | 'NEUTRAL';
  if (rawScore >= 2)       direction = 'BUY';
  else if (rawScore <= -2) direction = 'SELL';
  else                     direction = 'NEUTRAL';

  // Top 3 reasons for the direction
  const sorted = signals
    .sort((a, b) => (direction === 'BUY' ? b.score - a.score : a.score - b.score))
    .slice(0, 3)
    .map(s => s.reason);

  return {
    direction,
    confidence: direction === 'NEUTRAL' ? Math.round(50 + Math.abs(rawScore) * 5) : confidence,
    currentPrice,
    priceChange5m: Math.round(priceChange5m * 1000) / 1000,
    priceChange1h: Math.round(priceChange1h * 1000) / 1000,
    rsi: rsiVal,
    macdSignal: macdSignalDir,
    macdHistogram: Math.round(histogram * 100) / 100,
    ema9:  Math.round(ema9Val),
    ema21: Math.round(ema21Val),
    ema50: Math.round(ema50Val),
    volumeTrend,
    supportLevel:    Math.round(recent20L),
    resistanceLevel: Math.round(recent20H),
    reasons: sorted,
    fetchedAt: new Date().toISOString(),
    fromCache,
    symbol: source === 'coinbase' ? coinbaseProduct : binanceSymbol,
    source,
  };
}

// ── Public API ────────────────────────────────────────────────────────────────
// Generic multi-coin entry points (BTC, ETH, SOL, XRP, DOGE — added to extend
// the Kalshi engine beyond its original BTC-only KXBTC hourly brackets).
// getBTC5MinPrediction/getBTCCandles below are kept as thin BTC-only wrappers
// so existing callers (Polymarket engine, etc.) are untouched.

export async function getCryptoPrediction(coin: CryptoCoin, forceRefresh = false): Promise<BTC5MinPrediction> {
  const now = Date.now();
  const cached = predictionCache.get(coin);
  if (!forceRefresh && cached && (now - cached.ts) < CACHE_TTL_MS) {
    return { ...cached.prediction, fromCache: true };
  }

  if (coin === 'GOLD') {
    const candles = await fetchYahooCandles(YAHOO_SYMBOL.GOLD, 100);
    const prediction = buildPrediction(candles, false, 'yahoo', YAHOO_SYMBOL.GOLD, YAHOO_SYMBOL.GOLD);
    predictionCache.set(coin, { prediction, ts: now });
    return prediction;
  }

  const { binance, coinbase } = COIN_MAP[coin];
  const { candles, source } = await fetchCandlesWithFallback(binance, '5m', 100, coinbase);
  const prediction = buildPrediction(candles, false, source, binance, coinbase);
  predictionCache.set(coin, { prediction, ts: now });
  return prediction;
}

export function clearCryptoPredictionCache(coin?: CryptoCoin): void {
  if (coin) predictionCache.delete(coin);
  else predictionCache.clear();
}

/** Raw 5-min candles for any supported coin (Binance → Coinbase fallback for
 * crypto; Yahoo Finance futures data for GOLD, which has no crypto-exchange listing). */
export async function getCryptoCandles(coin: CryptoCoin, limit = 100): Promise<{ candles: BTC5MinCandle[]; source: string }> {
  if (coin === 'GOLD') {
    const candles = await fetchYahooCandles(YAHOO_SYMBOL.GOLD, limit);
    return { candles, source: 'yahoo' };
  }
  const { binance, coinbase } = COIN_MAP[coin];
  return fetchCandlesWithFallback(binance, '5m', limit, coinbase);
}

export async function getBTC5MinPrediction(forceRefresh = false): Promise<BTC5MinPrediction> {
  return getCryptoPrediction('BTC', forceRefresh);
}

export function clearBTCPredictionCache(): void {
  clearCryptoPredictionCache('BTC');
}

/** Raw 5-min BTC candles (Binance → Coinbase fallback) for alternative strategies. */
export async function getBTCCandles(limit = 100): Promise<{ candles: BTC5MinCandle[]; source: string }> {
  return getCryptoCandles('BTC', limit);
}
