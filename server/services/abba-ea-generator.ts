/**
 * ABBA Natural Language → EA Generator
 *
 * Converts a user's plain-English strategy description (typed to ABBA) into
 * a downloadable MQL5 Expert Advisor. Optionally enriches the generated EA
 * with live technical data for the detected pair (from Binance or MT5 cache).
 *
 * Flow:
 *   1. Parse pair + strategy from user message (OpenAI)
 *   2. Pull live indicators for that pair (Binance 5m/1h klines)
 *   3. Generate full MQL5 EA code (OpenAI)
 *   4. Return name, description, code, and downloadable filename
 */

import { getUniversalAIClientForUser } from '../openai';
import { getBTC5MinPrediction } from './btc-5min-predictor';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ParsedStrategy {
  pair: string;             // e.g. "EURUSD", "BTCUSDT", "XAUUSD"
  timeframe: string;        // e.g. "M5", "H1", "M15"
  indicators: string[];     // ["EMA 9", "EMA 21", "RSI 14", "MACD"]
  entryLong: string;        // natural language entry condition for BUY
  entryShort: string;       // natural language entry condition for SELL
  stopLossType: string;     // "ATR", "fixed", "swing_low", "percent"
  stopLossValue: string;    // e.g. "1.5 ATR", "50 pips", "1%"
  takeProfitType: string;
  takeProfitValue: string;
  riskPercent: number;      // % of balance risked per trade
  trailingStop: boolean;
  name: string;
  description: string;
}

export interface GeneratedEA {
  name: string;
  description: string;
  pair: string;
  timeframe: string;
  mql5Code: string;
  filename: string;
  liveContext?: string;     // brief live market note shown in UI
  parsedStrategy: ParsedStrategy;
  generatedAt: string;
}

// ── Live data fetcher ─────────────────────────────────────────────────────────

async function fetchBinanceLiveContext(pair: string): Promise<string | null> {
  const symbol = pair.toUpperCase().replace('/', '').replace('-', '');
  if (!symbol.includes('BTC') && !symbol.includes('ETH') && !symbol.includes('USDT')) {
    return null; // Only fetch live data for supported Binance symbols
  }

  try {
    const res = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=5m&limit=50`,
      { headers: { 'User-Agent': 'VEDD-Trading-AI/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    const klines: any[][] = await res.json();
    if (!klines.length) return null;

    const closes = klines.map(k => parseFloat(k[4]));
    const last   = closes[closes.length - 1];
    const prev5  = closes[closes.length - 6];
    const change5m = ((last - prev5) / prev5 * 100).toFixed(3);
    const high20 = Math.max(...klines.slice(-20).map(k => parseFloat(k[2])));
    const low20  = Math.min(...klines.slice(-20).map(k => parseFloat(k[3])));
    const vol    = parseFloat(klines[klines.length - 1][5]).toFixed(2);

    return `${symbol} live (Binance): price $${last.toLocaleString()} | 5m change ${change5m}% | 20-bar range $${low20.toLocaleString()}–$${high20.toLocaleString()} | volume ${vol}`;
  } catch {
    return null;
  }
}

// ── Parse strategy from NL ────────────────────────────────────────────────────

async function parseStrategy(userId: number, userMessage: string, pairHint?: string): Promise<ParsedStrategy> {
  const ai = await getUniversalAIClientForUser(userId);

  const systemPrompt = `You are a professional algorithmic trading strategy parser.
Extract a trading strategy from the user's natural language description and return ONLY valid JSON — no markdown, no extra text.

Required JSON structure:
{
  "pair": "EURUSD",          // trading symbol (MT5 format, no slash)
  "timeframe": "M5",          // M1|M5|M15|M30|H1|H4|D1
  "indicators": ["EMA 9", "RSI 14"],  // array of indicator strings
  "entryLong": "EMA 9 crosses above EMA 21 and RSI > 50",
  "entryShort": "EMA 9 crosses below EMA 21 and RSI < 50",
  "stopLossType": "ATR",      // ATR | fixed | swing_low | percent
  "stopLossValue": "1.5 ATR",
  "takeProfitType": "RR",     // RR | ATR | fixed | percent
  "takeProfitValue": "2:1",
  "riskPercent": 1.0,         // 0.5 to 2.0
  "trailingStop": false,
  "name": "EMA Crossover RSI",
  "description": "One-sentence description"
}

If the user does not specify something, use sensible defaults.
${pairHint ? `The user seems to be discussing ${pairHint} — use that as the pair if not explicitly stated.` : ''}`;

  const response = await ai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const raw = response.choices[0]?.message?.content?.trim() ?? '';
  // Strip any markdown code fences
  const clean = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  return JSON.parse(clean) as ParsedStrategy;
}

// ── MQL5 EA code generator ────────────────────────────────────────────────────

async function generateMQL5Code(userId: number, strategy: ParsedStrategy, liveContext: string | null): Promise<string> {
  const ai = await getUniversalAIClientForUser(userId);

  const systemPrompt = `You are an expert MQL5 (MetaTrader 5) programmer.
Generate a complete, compilable MQL5 Expert Advisor based on the strategy spec.

REQUIREMENTS:
- Use #property strict, correct MQL5 syntax
- Add input parameters for all key values (lot size, SL, TP, indicator periods)
- Use OnTick() for signal detection
- Handle both long and short trades
- Include comment with strategy name and pairs
- Use iRSI, iEMA, iMACD, iATR etc. for indicators (MQL5 handle-based style)
- Add proper OrderSend with MqlTradeRequest / MqlTradeResult
- Include risk management: max daily loss, max trades
- Output ONLY the MQL5 code — no markdown, no explanation before or after
${liveContext ? `\n// Live market context at generation time: ${liveContext}` : ''}`;

  const userPrompt = `Generate MQL5 EA for this strategy:
Name: ${strategy.name}
Pair: ${strategy.pair}
Timeframe: ${strategy.timeframe}
Indicators: ${strategy.indicators.join(', ')}
Entry LONG: ${strategy.entryLong}
Entry SHORT: ${strategy.entryShort}
Stop Loss: ${strategy.stopLossValue} (${strategy.stopLossType})
Take Profit: ${strategy.takeProfitValue} (${strategy.takeProfitType})
Risk per trade: ${strategy.riskPercent}%
Trailing stop: ${strategy.trailingStop}
Description: ${strategy.description}`;

  const response = await ai.chat.completions.create({
    model: 'gpt-4o',
    temperature: 0.1,
    max_tokens: 3000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  let code = response.choices[0]?.message?.content?.trim() ?? '';
  // Strip any accidental code fences
  code = code.replace(/```(mql5|mq5|cpp|c\+\+)?\n?/gi, '').replace(/```/g, '').trim();
  return code;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function generateEAFromNL(
  userId: number,
  userMessage: string,
  pairHint?: string,
): Promise<GeneratedEA> {
  // 1. Parse strategy structure
  const strategy = await parseStrategy(userId, userMessage, pairHint);

  // 2. Fetch live context for the detected pair
  const liveContext = await fetchBinanceLiveContext(strategy.pair);

  // 3. Generate MQL5 code
  const mql5Code = await generateMQL5Code(userId, strategy, liveContext ?? null);

  const safeFilename = strategy.name
    .replace(/[^a-zA-Z0-9_\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 50);

  return {
    name:           strategy.name,
    description:    strategy.description,
    pair:           strategy.pair,
    timeframe:      strategy.timeframe,
    mql5Code,
    filename:       `${safeFilename}_VEDD.mq5`,
    liveContext:    liveContext ?? undefined,
    parsedStrategy: strategy,
    generatedAt:    new Date().toISOString(),
  };
}

/** Quick pair extraction from a message (for ABBA to suggest EA generation) */
export function detectPairInMessage(message: string): string | null {
  const upperMsg = message.toUpperCase();
  const pairs = [
    'EURUSD','GBPUSD','USDJPY','USDCHF','AUDUSD','NZDUSD','USDCAD',
    'GBPJPY','EURJPY','EURGBP','XAUUSD','GOLD','BTCUSDT','BTCUSD',
    'ETHUSD','ETHUSDT','NAS100','US30','SPX500','GER40',
    'EUR/USD','GBP/USD','USD/JPY','XAU/USD','BTC/USD',
  ];
  for (const p of pairs) {
    if (upperMsg.includes(p)) return p.replace('/', '');
  }
  return null;
}
