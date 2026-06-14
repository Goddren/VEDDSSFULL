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
const CACHE_TTL_MS = 30_000; // 30 seconds

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
}

// ── Cache ─────────────────────────────────────────────────────────────────────

let cachedPrediction: BTC5MinPrediction | null = null;
let cacheTimestamp = 0;

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

// ── Prediction builder ────────────────────────────────────────────────────────

function buildPrediction(candles: BTC5MinCandle[], fromCache: boolean): BTC5MinPrediction {
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
    symbol: 'BTCUSDT',
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function getBTC5MinPrediction(forceRefresh = false): Promise<BTC5MinPrediction> {
  const now = Date.now();
  if (!forceRefresh && cachedPrediction && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return { ...cachedPrediction, fromCache: true };
  }

  const candles = await fetchBinanceCandles('BTCUSDT', '5m', 100);
  const prediction = buildPrediction(candles, false);
  cachedPrediction = prediction;
  cacheTimestamp   = now;
  return prediction;
}

export function clearBTCPredictionCache(): void {
  cachedPrediction = null;
  cacheTimestamp   = 0;
}
