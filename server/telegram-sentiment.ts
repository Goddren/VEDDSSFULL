import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { openai } from './openai';

const GOLD_CHANNEL = 'goldtradermo';

interface TelegramSignal {
  id: number;
  date: Date;
  text: string;
  views?: number;
}

interface GoldSentiment {
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  latestSignals: Array<{
    text: string;
    date: string;
    sentiment: 'BUY' | 'SELL' | 'NEUTRAL';
  }>;
  summary: string;
  lastUpdated: string;
}

let cachedSentiment: GoldSentiment | null = null;
let lastFetchTime: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

let telegramClient: TelegramClient | null = null;
let isConnecting = false;

async function getClient(): Promise<TelegramClient | null> {
  const apiId = parseInt(process.env.TELEGRAM_API_ID || '0');
  const apiHash = process.env.TELEGRAM_API_HASH || '';
  
  if (!apiId || !apiHash) {
    console.log('Telegram API credentials not configured');
    return null;
  }

  if (telegramClient?.connected) {
    return telegramClient;
  }

  if (isConnecting) {
    return null;
  }

  try {
    isConnecting = true;
    const stringSession = new StringSession(process.env.TELEGRAM_SESSION || '');
    
    telegramClient = new TelegramClient(stringSession, apiId, apiHash, {
      connectionRetries: 3,
    });

    await telegramClient.connect();
    console.log('Telegram client connected');
    
    isConnecting = false;
    return telegramClient;
  } catch (error) {
    console.error('Failed to connect to Telegram:', error);
    isConnecting = false;
    return null;
  }
}

async function fetchChannelMessages(limit: number = 20): Promise<TelegramSignal[]> {
  try {
    const client = await getClient();
    if (!client) {
      return [];
    }

    const messages = await client.getMessages(GOLD_CHANNEL, { limit });
    
    return messages
      .filter(msg => msg.message && msg.message.trim().length > 0)
      .map(msg => ({
        id: msg.id,
        date: new Date(msg.date * 1000),
        text: msg.message || '',
        views: msg.views || 0
      }));
  } catch (error) {
    console.error('Error fetching Telegram messages:', error);
    return [];
  }
}

async function analyzeSignalsWithAI(signals: TelegramSignal[]): Promise<GoldSentiment> {
  if (signals.length === 0) {
    return {
      overallSentiment: 'NEUTRAL',
      confidence: 0,
      latestSignals: [],
      summary: 'No signals available from the channel. Please check back later.',
      lastUpdated: new Date().toISOString()
    };
  }

  const signalTexts = signals.slice(0, 10).map((s, i) => 
    `[${i + 1}] (${s.date.toLocaleString()}): ${s.text}`
  ).join('\n\n');

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a trading signal analyst specializing in Gold (XAU/USD). 
Analyze the following Telegram channel signals and provide:
1. Overall market sentiment (BULLISH, BEARISH, or NEUTRAL)
2. Confidence level (0-100)
3. Individual signal interpretations
4. A brief summary

Look for:
- Buy/Sell signals and entry points
- Take profit (TP) and stop loss (SL) levels
- Market analysis and predictions
- Technical indicators mentioned

Respond in JSON format:
{
  "overallSentiment": "BULLISH" | "BEARISH" | "NEUTRAL",
  "confidence": number,
  "signals": [{ "text": "signal summary", "sentiment": "BUY" | "SELL" | "NEUTRAL" }],
  "summary": "brief market outlook based on signals"
}`
        },
        {
          role: "user",
          content: `Analyze these recent gold trading signals from Telegram:\n\n${signalTexts}`
        }
      ],
      max_tokens: 1000,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from AI');
    }

    const analysis = JSON.parse(content);
    
    return {
      overallSentiment: analysis.overallSentiment || 'NEUTRAL',
      confidence: analysis.confidence || 50,
      latestSignals: (analysis.signals || []).map((s: any, i: number) => ({
        text: s.text || signals[i]?.text.substring(0, 100) || '',
        date: signals[i]?.date.toISOString() || new Date().toISOString(),
        sentiment: s.sentiment || 'NEUTRAL'
      })),
      summary: analysis.summary || 'Unable to analyze signals',
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    console.error('Error analyzing signals with AI:', error);
    return {
      overallSentiment: 'NEUTRAL',
      confidence: 0,
      latestSignals: signals.slice(0, 5).map(s => ({
        text: s.text.substring(0, 100),
        date: s.date.toISOString(),
        sentiment: 'NEUTRAL' as const
      })),
      summary: 'Error analyzing signals. Raw data displayed.',
      lastUpdated: new Date().toISOString()
    };
  }
}

export async function getGoldSentiment(): Promise<GoldSentiment> {
  const now = Date.now();
  
  if (cachedSentiment && (now - lastFetchTime) < CACHE_DURATION) {
    return cachedSentiment;
  }

  const signals = await fetchChannelMessages(20);
  const sentiment = await analyzeSignalsWithAI(signals);
  
  cachedSentiment = sentiment;
  lastFetchTime = now;
  
  return sentiment;
}

export function getMockGoldSentiment(): GoldSentiment {
  return {
    overallSentiment: 'BULLISH',
    confidence: 72,
    latestSignals: [
      {
        text: 'GOLD BUY at 2650, TP: 2680, SL: 2630',
        date: new Date().toISOString(),
        sentiment: 'BUY'
      },
      {
        text: 'Strong support at 2640, looking for bounce',
        date: new Date(Date.now() - 3600000).toISOString(),
        sentiment: 'BUY'
      },
      {
        text: 'Market consolidating, wait for breakout',
        date: new Date(Date.now() - 7200000).toISOString(),
        sentiment: 'NEUTRAL'
      }
    ],
    summary: 'Gold showing bullish momentum with strong support levels. Multiple buy signals from the channel suggest upward movement expected.',
    lastUpdated: new Date().toISOString()
  };
}

export function isTelegramConfigured(): boolean {
  const apiId = process.env.TELEGRAM_API_ID;
  const apiHash = process.env.TELEGRAM_API_HASH;
  return !!(apiId && apiHash);
}
