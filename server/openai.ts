import OpenAI from "openai";
import { ChartAnalysisResponse, TrendCell } from "@shared/types";
import fs from "fs";

// Asset-specific analysis configurations for improved accuracy
interface AssetSpecificConfig {
  assetType: 'forex' | 'gold' | 'crypto' | 'indices';
  volatilityMultiplier: number;
  atrMultiplier: number;
  minimumConfirmations: number;
  sessionBias: string[];
  correlationAssets: string[];
  specialConsiderations: string[];
}

function getAssetSpecificConfig(symbol: string): AssetSpecificConfig {
  const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Gold/Precious Metals Configuration
  if (cleanSymbol.includes('XAU') || cleanSymbol.includes('GOLD')) {
    return {
      assetType: 'gold',
      volatilityMultiplier: 1.5,
      atrMultiplier: 2.0,
      minimumConfirmations: 3,
      sessionBias: ['London Session', 'New York Session'],
      correlationAssets: ['DXY (inverse)', 'US Treasury Yields (inverse)', 'Silver XAG'],
      specialConsiderations: [
        'Gold is a safe-haven asset - analyze risk sentiment',
        'Strong inverse correlation with USD strength (DXY)',
        'Reacts sharply to Fed rate decisions and inflation data',
        'Higher volatility during London/NY session overlap',
        'Consider geopolitical tensions as bullish catalyst',
        'Widen stop losses by 1.5-2x due to higher pip value volatility',
        'Look for exhaustion patterns at psychological levels ($1900, $2000, $2100)',
        'Volume spikes often precede major reversals'
      ]
    };
  }
  
  // Bitcoin/Crypto Configuration  
  if (cleanSymbol.includes('BTC') || cleanSymbol.includes('BITCOIN') || 
      cleanSymbol.includes('ETH') || cleanSymbol.includes('CRYPTO')) {
    return {
      assetType: 'crypto',
      volatilityMultiplier: 2.0,
      atrMultiplier: 2.5,
      minimumConfirmations: 4,
      sessionBias: ['24/7 - Focus on high volume periods'],
      correlationAssets: ['NASDAQ/Tech stocks', 'Ethereum ETH', 'Total Crypto Market Cap'],
      specialConsiderations: [
        'BTC trades 24/7 - volatility can spike any time',
        'Weekend volatility often higher with lower liquidity',
        'Whale wallet movements can cause sudden price swings',
        'ETF inflows/outflows significantly impact price',
        'Halving cycles create long-term bullish bias every 4 years',
        'Regulatory news causes extreme volatility - widen stops by 2x minimum',
        'Key psychological levels: $30k, $40k, $50k, $60k, $70k, $100k',
        'Look for CME gap fills as potential targets',
        'Funding rates indicate market sentiment (high = potential reversal)',
        'On-chain metrics (active addresses, exchange flows) provide context',
        'Correlation with risk assets during macro uncertainty'
      ]
    };
  }
  
  // Default Forex Configuration
  return {
    assetType: 'forex',
    volatilityMultiplier: 1.0,
    atrMultiplier: 1.5,
    minimumConfirmations: 2,
    sessionBias: ['Session depends on pair'],
    correlationAssets: ['Related pairs'],
    specialConsiderations: ['Standard forex analysis applies']
  };
}

// Generate asset-specific prompt additions for AI analysis
function getAssetSpecificPrompt(symbol: string): string {
  const config = getAssetSpecificConfig(symbol);
  
  if (config.assetType === 'gold') {
    return `
    
    GOLD/XAU SPECIFIC ANALYSIS (CRITICAL FOR ACCURACY):
    
    Gold is a HIGH-VOLATILITY precious metal with unique characteristics:
    
    1. VOLATILITY ADJUSTMENT:
       - Gold moves in larger pip increments than forex
       - Standard stop losses often get hit prematurely
       - MANDATORY: Widen all stop losses by 1.5-2x compared to forex
       - Use ATR 2x minimum for stop loss calculations
       
    2. CORRELATION CHECK (Must analyze):
       - Check USD strength context (strong USD = bearish gold)
       - Consider Treasury yield direction (rising yields = bearish gold)
       - Evaluate overall risk sentiment (risk-off = bullish gold)
       
    3. SESSION TIMING:
       - Best trading: London-NY overlap (13:00-17:00 GMT)
       - Avoid: Low liquidity Asian session for entries
       - News: Fed speeches, CPI data cause extreme moves
       
    4. PATTERN RELIABILITY:
       - Candlestick patterns need STRONGER confirmation on gold
       - Wait for volume confirmation before entry
       - Psychological levels ($1900, $2000, $2100) act as magnets
       
    5. SIGNAL REQUIREMENTS:
       - Require minimum 3 confirmations before signaling BUY/SELL
       - Single indicator signals are NOT sufficient for gold
       - If unsure, signal should be NEUTRAL with reduced confidence
       
    6. STOP LOSS RULES FOR GOLD:
       - Minimum 200-300 pips from entry (gold pips are 0.01)
       - Place below/above significant swing points
       - Never use tight stops on gold - they will get hunted`;
  }
  
  if (config.assetType === 'crypto') {
    return `
    
    BITCOIN/CRYPTO SPECIFIC ANALYSIS (CRITICAL FOR ACCURACY):
    
    Bitcoin is an EXTREMELY HIGH-VOLATILITY asset with unique characteristics:
    
    1. VOLATILITY ADJUSTMENT:
       - BTC can move 2-5% in hours, 10%+ on volatile days
       - Standard forex stop losses are COMPLETELY INADEQUATE
       - MANDATORY: Use ATR 2.5x minimum for stop loss calculations
       - Accept wider stops to avoid premature stop-outs
       
    2. MARKET STRUCTURE:
       - 24/7 trading means no session gaps (except CME futures)
       - Weekend often sees lower liquidity + higher volatility
       - Whale movements create sudden wicks - plan for them
       
    3. CONFIRMATION REQUIREMENTS:
       - Require minimum 4 confirmations for BTC signals
       - Single timeframe analysis is INSUFFICIENT
       - Volume must strongly confirm the direction
       - RSI extremes (>80, <20) more reliable than mid-range
       
    4. KEY LEVELS:
       - Psychological: $30k, $40k, $50k, $60k, $70k, $100k
       - CME gap levels often get filled
       - Previous all-time highs become strong support/resistance
       
    5. SENTIMENT FACTORS:
       - ETF flows (Blackrock, Fidelity) significantly move price
       - Funding rates: High positive = potential short squeeze, high negative = potential long squeeze
       - Fear & Greed Index provides context
       
    6. STOP LOSS RULES FOR BTC:
       - Minimum $1,000-$2,000 from entry point
       - Place below/above significant swing points
       - Use percentage-based stops (2-5% from entry)
       - Factor in potential wick hunting before major moves
       
    7. SIGNAL CONFIDENCE:
       - Be MORE CONSERVATIVE with confidence ratings
       - "High" confidence requires 4+ confirmations
       - Single indicator signals should be "Low" confidence maximum`;
  }
  
  return ''; // Standard forex - no additional prompt needed
}

// This is using Replit's AI Integrations service, which provides OpenAI-compatible API access without requiring your own OpenAI API key.
// The AI integration uses Replit credits and is billed to your Replit account.
export const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

export const AVAILABLE_VISION_MODELS = [
  { id: 'gpt-4o', name: 'GPT-4o', description: 'Best accuracy for chart analysis', tier: 'premium', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', description: 'Budget-friendly, good accuracy', tier: 'budget', provider: 'openai' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', description: 'Excellent reasoning and analysis', tier: 'premium', provider: 'anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', description: 'Fast and affordable', tier: 'budget', provider: 'anthropic' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast multimodal analysis', tier: 'budget', provider: 'google' },
  { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', description: 'Advanced reasoning', tier: 'premium', provider: 'google' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Ultra-fast inference', tier: 'budget', provider: 'groq' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'Fast mixture of experts', tier: 'budget', provider: 'groq' },
  { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Top-tier reasoning', tier: 'premium', provider: 'mistral' },
  { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Efficient and affordable', tier: 'budget', provider: 'mistral' },
];

export type VisionModelId = string;

const userModelPreferences: Map<number, string> = new Map();

export function setUserModelPreference(userId: number, model: string) {
  userModelPreferences.set(userId, model);
}

export function getUserModelPreference(userId: number): string {
  return userModelPreferences.get(userId) || 'gpt-4o';
}

function getModelProvider(modelId: string): string {
  const model = AVAILABLE_VISION_MODELS.find(m => m.id === modelId);
  return model?.provider || 'openai';
}

const aiVisionConfirmationEnabled: Map<number, boolean> = new Map();
const aiMinConfidenceThreshold: Map<number, number> = new Map();

export function setAiVisionConfirmation(userId: number, enabled: boolean) {
  aiVisionConfirmationEnabled.set(userId, enabled);
}

export function isAiVisionConfirmationEnabled(userId: number): boolean {
  return aiVisionConfirmationEnabled.get(userId) || false;
}

export function setAiMinConfidence(userId: number, minConfidence: number) {
  const clamped = Math.max(0, Math.min(100, Math.round(minConfidence)));
  aiMinConfidenceThreshold.set(userId, clamped);
}

export function getAiMinConfidence(userId: number): number {
  return aiMinConfidenceThreshold.get(userId) ?? 70;
}

export interface AiVisionConfirmation {
  confirmed: boolean;
  aiDirection: string;
  aiConfidence: number;
  reasoning: string;
  adjustedEntry?: number;
  adjustedStopLoss?: number;
  adjustedTakeProfit?: number;
}

export interface AiConfirmationLogEntry {
  id: number;
  timestamp: string;
  symbol: string;
  timeframe: string;
  proposedSignal: string;
  proposedConfidence: number;
  proposedEntry?: number;
  proposedSL?: number;
  proposedTP?: number;
  aiDecision: 'APPROVED' | 'REJECTED' | 'ADJUSTED' | 'ERROR';
  aiDirection: string;
  aiConfidence: number;
  reasoning: string;
  adjustedEntry?: number;
  adjustedSL?: number;
  adjustedTP?: number;
  modelUsed: string;
}

const aiConfirmationLogs: Map<number, AiConfirmationLogEntry[]> = new Map();
let logIdCounter = 1;

export function addAiConfirmationLog(userId: number, entry: Omit<AiConfirmationLogEntry, 'id'>) {
  if (!aiConfirmationLogs.has(userId)) {
    aiConfirmationLogs.set(userId, []);
  }
  const logs = aiConfirmationLogs.get(userId)!;
  logs.unshift({ ...entry, id: logIdCounter++ });
  if (logs.length > 50) logs.pop();
}

export function getAiConfirmationLogs(userId: number): AiConfirmationLogEntry[] {
  return aiConfirmationLogs.get(userId) || [];
}

function buildConfirmationPrompt(
  candleData: any[], indicators: any, proposedSignal: string,
  proposedConfidence: number, tradePlan: any, symbol: string, timeframe: string,
  newsContext?: { sentiment?: any; upcomingEvents?: any[]; topHeadlines?: string[] }
): { system: string; user: string } {
  const recentCandles = candleData.slice(0, 30);
  const candleSummary = recentCandles.map((c: any, i: number) => 
    `[${i}] O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v || 0}`
  ).join('\n');

  const coreIndicators: any = {};
  const advancedIndicators: any = {};
  if (indicators) {
    const advancedKeys = ['adx', 'stochastic', 'vwap', 'obv', 'pivotPoints', 'fibonacci', 'supportResistance', 'candlePatterns', 'swingPoints', 'sessionContext', 'volatilityContext', 'volumeProfile', 'breakoutDetection'];
    for (const [key, val] of Object.entries(indicators)) {
      if (advancedKeys.includes(key)) advancedIndicators[key] = val;
      else coreIndicators[key] = val;
    }
  }

  const coreStr = JSON.stringify(coreIndicators, null, 2);
  const advStr = Object.keys(advancedIndicators).length > 0 ? JSON.stringify(advancedIndicators, null, 2) : '';

  let newsSection = '';
  if (newsContext) {
    const parts: string[] = [];
    if (newsContext.sentiment) {
      parts.push(`NEWS SENTIMENT: ${newsContext.sentiment.overallLabel?.toUpperCase() || 'NEUTRAL'} (score: ${newsContext.sentiment.overallScore || 0}/100)`);
      parts.push(`Bullish articles: ${newsContext.sentiment.bullishCount || 0} | Bearish: ${newsContext.sentiment.bearishCount || 0} | Neutral: ${newsContext.sentiment.neutralCount || 0}`);
      if (newsContext.sentiment.tradingImplication) {
        parts.push(`Trading Implication: ${newsContext.sentiment.tradingImplication}`);
      }
      if (newsContext.sentiment.pairDirection) {
        parts.push(`Pair Direction from News: ${newsContext.sentiment.pairDirection}`);
      }
    }
    if (newsContext.topHeadlines && newsContext.topHeadlines.length > 0) {
      parts.push(`\nRecent Headlines:`);
      newsContext.topHeadlines.slice(0, 5).forEach((h, i) => parts.push(`  ${i + 1}. ${h}`));
    }
    if (newsContext.upcomingEvents && newsContext.upcomingEvents.length > 0) {
      parts.push(`\nUPCOMING ECONOMIC EVENTS (potential volatility):`);
      newsContext.upcomingEvents.slice(0, 5).forEach((e: any) => {
        const timeUntil = e.daysUntil === 0 ? 'TODAY' : e.daysUntil === 1 ? 'TOMORROW' : `in ${e.daysUntil} days`;
        parts.push(`  - [${e.impact?.toUpperCase()}] ${e.event} (${e.currency}) - ${timeUntil} at ${e.timeFormatted || 'TBD'}`);
        if (e.potentialImpact) parts.push(`    Impact: ${e.potentialImpact}`);
      });
    }
    if (parts.length > 0) {
      newsSection = `\nNEWS & ECONOMIC EVENTS CONTEXT:\n${parts.join('\n')}`;
    }
  }

  return {
    system: "You are an elite institutional trading analyst with expertise in technical analysis, market structure, price action, risk management, and fundamental/news analysis. Provide honest, unbiased second opinions on trade signals using ALL available data including news sentiment and upcoming economic events. Always return valid JSON.",
    user: `You are an elite trading analyst providing a SECOND OPINION on a proposed trade. Use ALL data below for maximum accuracy.

SYMBOL: ${symbol}
TIMEFRAME: ${timeframe}

PROPOSED SIGNAL: ${proposedSignal} with ${proposedConfidence}% confidence
PROPOSED TRADE PLAN:
- Entry: ${tradePlan?.entry}
- Stop Loss: ${tradePlan?.stopLoss}
- Take Profit: ${tradePlan?.takeProfit}
- Risk/Reward: ${tradePlan?.riskReward}

RECENT CANDLE DATA (index 0 = most recent):
${candleSummary}

CORE INDICATORS (RSI, MACD, MAs, BBs, ATR):
${coreStr}
${advStr ? `
ADVANCED ANALYSIS:
${advStr}
` : ''}${newsSection}

Provide your independent assessment considering ALL of the following:
1. PRICE ACTION: Do candle patterns (engulfing, hammer, star, doji) support the direction?
2. MOMENTUM: RSI, MACD, Stochastic alignment — any divergences?
3. TREND STRENGTH: ADX value — is the trend strong enough to trade? Is it ranging (ADX < 20)?
4. VOLUME: OBV trend and divergence, volume profile — is volume confirming the move?
5. MARKET STRUCTURE: Support/Resistance, Pivot Points, Fibonacci levels — is SL behind structure? Is TP at a realistic level?
6. VWAP: Is price above or below VWAP? Does it align with the signal?
7. SESSION CONTEXT: Is this the right trading session for this pair? Low liquidity risk?
8. VOLATILITY: Is current ATR normal, high, or low vs recent history? Should position size be adjusted?
9. RISK/REWARD: Is the R:R ratio >= 1.5? Are the SL/TP levels optimized relative to S/R?
10. SWING POINTS: Are recent swing highs/lows respected in the trade plan?
11. OPEN POSITIONS: Are there existing positions on this symbol? Avoid doubling correlated exposure.
12. TRADE HISTORY: What is the recent win rate on this symbol? Is the trader on a losing streak?
13. NEWS SENTIMENT: Does the current news flow support or contradict the proposed trade direction? Are headlines bullish or bearish for this pair?
14. UPCOMING EVENTS: Are there high-impact economic events (rate decisions, NFP, CPI) coming soon that could invalidate the trade? Should the trader wait or use tighter stops?
15. MARKET OPEN BREAKOUT: If breakoutDetection data is present and shows isBreakoutWindow=true, is there a confirmed breakout at the session open? Does the breakout direction align with the proposed signal? Is volume confirming the breakout? A strong volume-confirmed breakout at London or NY open is a high-probability setup — boost confidence if aligned, reduce if contradicting.

CRITICAL RULES FOR YOUR DECISION:
- CONFIRM the trade if the majority of indicators support the direction, even if 1-2 minor indicators are neutral or slightly against. No trade has 100% alignment — focus on the weight of evidence.
- REJECT ONLY if there are serious red flags: strong divergence against the trade, price hitting major resistance/support in the wrong direction, extreme overbought/oversold against the signal, or imminent high-impact news that directly threatens the trade.
- Your "confidence" field is YOUR independent confidence in the trade (0-100). This is shown separately from the EA's confidence so traders see both perspectives.
- If a market open breakout is detected with volume confirmation, this is a high-probability institutional setup — give it significant weight.
- If news events are imminent (today/tomorrow), factor this into confidence. Warn if the trade could be invalidated.

Return your analysis as JSON:
{
  "confirmed": boolean,
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": number (0-100, your independent AI confidence percentage),
  "reasoning": "Concise explanation referencing the key indicators and news/events that drove your decision",
  "adjustedEntry": number or null,
  "adjustedStopLoss": number or null,
  "adjustedTakeProfit": number or null
}`
  };
}

async function callOpenAIConfirmation(prompt: { system: string; user: string }, model: string, userId?: number): Promise<string> {
  const openaiInstance = userId ? await getOpenAIInstanceForUser(userId) : getOpenAIInstance();
  const response = await openaiInstance.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000,
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content || '';
}

async function callAnthropicConfirmation(prompt: { system: string; user: string }, model: string, apiKey: string): Promise<string> {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model,
    max_tokens: 1000,
    system: prompt.system + ' Always return valid JSON with no markdown formatting.',
    messages: [{ role: "user", content: prompt.user }],
  });
  const block = response.content[0];
  return block.type === 'text' ? block.text : '';
}

async function callGoogleConfirmation(prompt: { system: string; user: string }, model: string, apiKey: string): Promise<string> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(apiKey);
  const genModel = genAI.getGenerativeModel({ 
    model,
    systemInstruction: prompt.system,
    generationConfig: { responseMimeType: "application/json", temperature: 0.3, maxOutputTokens: 1000 },
  });
  const result = await genModel.generateContent(prompt.user);
  return result.response.text();
}

async function callGroqConfirmation(prompt: { system: string; user: string }, model: string, apiKey: string): Promise<string> {
  const Groq = (await import('groq-sdk')).default;
  const client = new Groq({ apiKey });
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000,
    temperature: 0.3,
  });
  return response.choices[0]?.message?.content || '';
}

async function callMistralConfirmation(prompt: { system: string; user: string }, model: string, apiKey: string): Promise<string> {
  const { Mistral } = await import('@mistralai/mistralai');
  const client = new Mistral({ apiKey });
  const response = await client.chat.complete({
    model,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user }
    ],
    responseFormat: { type: "json_object" },
    maxTokens: 1000,
    temperature: 0.3,
  });
  const choice = response.choices?.[0];
  if (!choice || !('message' in choice)) return '';
  return typeof choice.message.content === 'string' ? choice.message.content : '';
}

async function getUserApiKeyForProvider(userId: number, provider: string): Promise<string | null> {
  try {
    const { storage } = await import('./storage');
    const userKey = await storage.getActiveUserApiKey(userId, provider);
    if (userKey?.apiKey) {
      await storage.updateUserApiKeyUsage(userId, provider);
      return userKey.apiKey;
    }
  } catch (e) {
    console.error(`Error fetching user API key for ${provider}:`, e);
  }
  return null;
}

export async function getAiVisionConfirmation(
  candleData: any[],
  indicators: any,
  proposedSignal: string,
  proposedConfidence: number,
  tradePlan: any,
  symbol: string,
  timeframe: string,
  userId?: number,
  newsContext?: { sentiment?: any; upcomingEvents?: any[]; topHeadlines?: string[] }
): Promise<AiVisionConfirmation> {
  try {
    const selectedModel = userId ? getUserModelPreference(userId) : 'gpt-4o-mini';
    const provider = getModelProvider(selectedModel);
    const prompt = buildConfirmationPrompt(candleData, indicators, proposedSignal, proposedConfidence, tradePlan, symbol, timeframe, newsContext);

    console.log(`[AI Vision Confirmation] Requesting ${provider}/${selectedModel} confirmation for ${symbol} ${proposedSignal}`);

    let content = '';

    if (provider === 'openai') {
      content = await callOpenAIConfirmation(prompt, selectedModel, userId);
    } else if (userId) {
      const apiKey = await getUserApiKeyForProvider(userId, provider);
      if (!apiKey) {
        return {
          confirmed: false,
          aiDirection: 'NEUTRAL',
          aiConfidence: 0,
          reasoning: `No ${provider} API key configured. Add your key on the AI Provider Keys page, or switch to an OpenAI model.`,
        };
      }
      switch (provider) {
        case 'anthropic':
          content = await callAnthropicConfirmation(prompt, selectedModel, apiKey);
          break;
        case 'google':
          content = await callGoogleConfirmation(prompt, selectedModel, apiKey);
          break;
        case 'groq':
          content = await callGroqConfirmation(prompt, selectedModel, apiKey);
          break;
        case 'mistral':
          content = await callMistralConfirmation(prompt, selectedModel, apiKey);
          break;
        default:
          content = await callOpenAIConfirmation(prompt, selectedModel, userId);
      }
    } else {
      content = await callOpenAIConfirmation(prompt, 'gpt-4o-mini');
    }

    if (!content) throw new Error("No response from AI");

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const result = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    console.log(`[AI Vision Confirmation] ${symbol}: ${result.confirmed ? 'CONFIRMED' : 'REJECTED'} (AI says ${result.direction} at ${result.confidence}%) [${provider}/${selectedModel}]`);

    return {
      confirmed: !!result.confirmed,
      aiDirection: result.direction || 'NEUTRAL',
      aiConfidence: typeof result.confidence === 'number' ? result.confidence : 50,
      reasoning: result.reasoning || 'No reasoning provided',
      adjustedEntry: typeof result.adjustedEntry === 'number' ? result.adjustedEntry : undefined,
      adjustedStopLoss: typeof result.adjustedStopLoss === 'number' ? result.adjustedStopLoss : undefined,
      adjustedTakeProfit: typeof result.adjustedTakeProfit === 'number' ? result.adjustedTakeProfit : undefined,
    };
  } catch (error) {
    console.error('[AI Vision Confirmation] Error:', error);
    return {
      confirmed: false,
      aiDirection: 'NEUTRAL',
      aiConfidence: 0,
      reasoning: 'AI confirmation unavailable - blocking trade for safety (disable AI Second Opinion to trade without confirmation)',
    };
  }
}

// Function to get an OpenAI instance - optionally using a user's own API key
function getOpenAIInstance(userApiKey?: string) {
  if (userApiKey) {
    return new OpenAI({ apiKey: userApiKey });
  }
  return openai;
}

// Get OpenAI instance for a specific user, checking for their own API key first
export async function getOpenAIInstanceForUser(userId: number): Promise<OpenAI> {
  try {
    const { storage } = await import('./storage');
    const userKey = await storage.getActiveUserApiKey(userId, 'openai');
    if (userKey && userKey.apiKey) {
      await storage.updateUserApiKeyUsage(userId, 'openai');
      return new OpenAI({ apiKey: userKey.apiKey });
    }
  } catch (e) {
    console.error('Error fetching user API key, falling back to platform key:', e);
  }
  return openai;
}

// Function to test if OpenAI API key is valid
export async function testOpenAIApiKey(): Promise<boolean> {
  try {
    // If using Replit AI Integrations, just check if the env vars are set
    if (process.env.AI_INTEGRATIONS_OPENAI_BASE_URL && process.env.AI_INTEGRATIONS_OPENAI_API_KEY) {
      return true;
    }
    
    // For regular OpenAI API, test with models.list()
    const openai = getOpenAIInstance();
    const response = await openai.models.list();
    return response.data.length > 0;
  } catch (error) {
    console.error("Error validating OpenAI API key:", error);
    return false;
  }
}

// Export the config functions for use in EA generators
export { getAssetSpecificConfig, getAssetSpecificPrompt };

// Enhanced chart analysis with optional symbol for asset-specific analysis
export async function analyzeChartImage(base64Image: string, knownSymbol?: string, userId?: number): Promise<ChartAnalysisResponse> {
  try {
    const openai = userId ? await getOpenAIInstanceForUser(userId) : getOpenAIInstance();
    const selectedModel = userId ? getUserModelPreference(userId) : 'gpt-4o';
    
    // Get asset-specific prompt if symbol is provided
    const assetSpecificAddition = knownSymbol ? getAssetSpecificPrompt(knownSymbol) : '';
    const assetConfig = knownSymbol ? getAssetSpecificConfig(knownSymbol) : null;
    
    console.log(`[AI Analysis] Using model: ${selectedModel} for user ${userId || 'platform'}`);
    
    const visionResponse = await openai.chat.completions.create({
      model: selectedModel,
      messages: [
        {
          role: "system",
          content: `You are an expert trading chart analyst with deep expertise in technical analysis, volume analysis, and momentum indicators. Analyze the trading chart image and provide detailed, accurate analysis.
          
          CRITICAL ANALYSIS REQUIREMENTS:
          
          1. VOLUME & MOMENTUM ANALYSIS (Priority):
             - Analyze volume bars visible on the chart to assess buying/selling pressure
             - Look for volume divergences that could signal trend reversals
             - Identify momentum indicators (RSI, MACD, Stochastic if visible)
             - Assess whether volume confirms or contradicts price action${assetSpecificAddition}
             - Higher volume on breakouts increases signal reliability
             - Low volume in trends suggests potential reversal
          
          2. UNBIASED SIGNAL DIRECTION:
             - Consider BOTH bullish and bearish scenarios equally
             - If price is at resistance with bearish volume/momentum, suggest SELL
             - If price is at support with bullish volume/momentum, suggest BUY
             - Volume should CONFIRM direction (e.g., rising prices need rising volume)
             - Momentum indicators (RSI >70 = overbought/SELL, RSI <30 = oversold/BUY)
          
          3. ATR-BASED STOP LOSS CALCULATION:
             - Estimate the Average True Range (ATR) from visible price action
             - Provide multiple stop loss options based on ATR multiples:
               * Conservative: 1x ATR
               * Balanced: 1.5x ATR (recommended for most trades)
               * Aggressive: 2x ATR (for swing trades)
             - ATR-based stops adapt to market volatility and reduce premature stop-outs
          
          4. TECHNICAL ANALYSIS:
             - Identify chart patterns, support/resistance levels
             - Analyze trend direction across multiple timeframes if visible
             - Consider confluence of multiple indicators for higher confidence
          
          5. VOLUME SESSIONS ANALYSIS:
             - Asian, London, New York session characteristics
             - Best trading times based on currency pair and volume
          
          6. CANDLESTICK SIGNIFICANCE ANALYSIS (NEW INDICATOR):
             - Identify all visible candlestick patterns (Doji, Hammer, Engulfing, Morning/Evening Star, etc.)
             - Assess significance based on location (at support/resistance, after trend, at breakout)
             - Rate each pattern's reliability and trading implications
             - Consider pattern clusters and confluences
             - Provide actionable insights for each significant pattern
          
          VERY IMPORTANT: Return the analysis in valid JSON format with all required properties.
          Even if you cannot determine some information, include placeholder values rather than omitting properties.
          For numeric fields where you cannot determine a value, use a string representation (e.g., "Unknown").
          All properties in the response schema are required.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this trading chart in detail and provide the following information in structured JSON format:

{
  "symbol": string,           // Name of the trading pair or symbol (e.g. "EURUSD", "BTCUSD")
  "timeframe": string,        // Chart timeframe (e.g. "1H", "4H", "1D")
  "currentPrice": string,     // Current price visible on the chart
  "direction": string,        // "BUY" or "SELL" signal based on volume, momentum, and technical analysis
  "trend": string,            // "Bullish" or "Bearish"
  "confidence": string,       // "Low", "Medium", or "High" - higher if volume confirms the signal
  "entryPoint": string,       // Suggested entry price
  "exitPoint": string,        // Suggested exit price
  "stopLoss": string,         // Suggested stop loss level (can be based on ATR)
  "takeProfit": string,       // Suggested take profit level
  "riskRewardRatio": string,  // Risk-to-reward ratio (e.g. "1:2", "1:3")
  "potentialPips": string,    // Potential pips/points in the trade
  "atrStopLoss": {            // ATR-based stop loss options (REQUIRED)
    "atrValue": string,       // Estimated ATR value from chart (e.g. "0.0045")
    "atr1x": string,          // Conservative stop: current price +/- 1x ATR
    "atr15x": string,         // Balanced stop: current price +/- 1.5x ATR (RECOMMENDED)
    "atr2x": string,          // Wide stop: current price +/- 2x ATR
    "recommended": string     // Your recommended stop loss from the above options
  },
  "momentumIndicators": {     // Momentum and volume indicators (REQUIRED)
    "rsi": {                  // RSI if visible, otherwise estimate from price action
      "value": string,        // e.g. "68"
      "signal": string,       // "Overbought", "Oversold", "Neutral"
      "interpretation": string // Brief explanation
    },
    "macd": {                 // MACD if visible
      "value": string,        // e.g. "Bullish crossover"
      "signal": string,       // "Bullish", "Bearish", "Neutral"
      "interpretation": string
    },
    "volumeTrend": {          // Volume analysis (CRITICAL)
      "direction": string,    // "Increasing", "Decreasing", "Stable"
      "strength": string,     // "Weak", "Moderate", "Strong"
      "interpretation": string // How volume confirms or contradicts price action
    }
  },
  "patterns": [               // Array of identified chart patterns
    {
      "name": string,         // Pattern name (e.g. "Double Top", "Head and Shoulders")
      "description": string,  // Brief description
      "strength": string,     // "Weak", "Moderate", "Strong"
      "type": string,         // "Reversal", "Continuation", etc.
      "details": string       // Additional details about the pattern
    }
  ],
  "indicators": [             // Array of technical indicators visible on chart
    {
      "name": string,         // Indicator name (e.g. "RSI", "MACD", "Volume")
      "type": string,         // Type of indicator (e.g. "Oscillator", "Trend", "Volume")
      "signal": string,       // "Bullish", "Bearish", "Neutral"
      "details": string       // Additional details about the indicator
    }
  ],
  "supportResistance": [      // Array of support and resistance levels
    {
      "type": string,         // "Support" or "Resistance"
      "strength": string,     // "Weak", "Moderate", "Strong"
      "level": string         // Price level
    }
  ],
  "timeframeAnalysis": [      // Analysis across different timeframes
    {
      "timeframe": string,    // Timeframe (e.g. "1H", "4H", "1D")
      "trend": string         // "Bullish" or "Bearish" on that timeframe
    }
  ],
  "volumeAnalysis": [         // Analysis of volume patterns and best trading times
    {
      "period": string,       // Time period (e.g. "Asian Session", "London Session", "New York Session") 
      "volume": string,       // "Low", "Medium", "High" volume level
      "activity": string,     // Description of market activity during this period
      "quality": string       // Quality of trading opportunities ("Poor", "Average", "Excellent")
    }
  ],
  "preferredVolumeThreshold": string, // Preferred volume level (e.g. "150% above average", "2x average volume")
  "preferredTradingTime": string,     // Best time to trade (e.g. "London Session", "US Market Open")
  "candlestickSignificance": {        // Candlestick pattern analysis as an indicator (REQUIRED)
    "overallSignal": string,          // "Strong Buy", "Buy", "Neutral", "Sell", "Strong Sell"
    "reliability": string,            // "Low", "Medium", "High" - how reliable the signals are
    "patterns": [                     // Array of identified candlestick patterns
      {
        "name": string,               // Pattern name (e.g., "Doji", "Hammer", "Bullish Engulfing")
        "type": string,               // "Bullish", "Bearish", or "Neutral"
        "significance": string,       // "Low", "Medium", "High", "Very High"
        "location": string,           // Where it appears (e.g., "At key support", "After downtrend")
        "description": string,        // Brief explanation of what this pattern means
        "actionableInsight": string   // What traders should consider doing
      }
    ],
    "keyObservation": string,         // Most important observation about recent candles
    "tradingImplication": string      // What this means for trading decisions
  },
  "recommendation": string,   // Overall trading recommendation considering volume and momentum
  "steps": string[]           // Array of actionable steps to take
}

IMPORTANT: All fields marked as REQUIRED must be included in your response with actual data, not "Unknown".`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 4000,
      response_format: { type: "json_object" }
    });

    // Log the raw response for debugging
    console.log("OpenAI JSON Response:", visionResponse.choices[0].message.content);
    
    // Parse the response
    const contentStr = visionResponse.choices[0].message.content as string;
    let response;
    
    try {
      response = JSON.parse(contentStr);
      console.log("Parsed response successfully");
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      console.log("Response content:", contentStr);
      // If parsing failed, create a default response structure
      response = {};
    }
    
    // Get the symbol for generating market trend data
    const symbol = typeof response.symbol === 'string' ? response.symbol : "Unknown";
    
    // Create the analysis response with strict property checking and defaults
    const analysisResponse: ChartAnalysisResponse = {
      symbol,
      timeframe: typeof response.timeframe === 'string' ? response.timeframe : "Unknown",
      currentPrice: typeof response.currentPrice === 'string' ? response.currentPrice : "Unknown",
      direction: typeof response.direction === 'string' ? response.direction : "Unknown",
      trend: typeof response.trend === 'string' ? response.trend : "Unknown",
      confidence: typeof response.confidence === 'string' ? response.confidence : "Medium",
      entryPoint: typeof response.entryPoint === 'string' ? response.entryPoint : "Unknown",
      exitPoint: typeof response.exitPoint === 'string' ? response.exitPoint : "Unknown",
      stopLoss: typeof response.stopLoss === 'string' ? response.stopLoss : "Unknown",
      takeProfit: typeof response.takeProfit === 'string' ? response.takeProfit : "Unknown", 
      riskRewardRatio: typeof response.riskRewardRatio === 'string' ? response.riskRewardRatio : "Unknown",
      potentialPips: typeof response.potentialPips === 'string' ? response.potentialPips : "Unknown",
      volatilityScore: 50, // Default medium volatility, client will recalculate
      volatilityData: {
        score: 50,
        atr: 0.0010,
        standardDeviation: 0.0015,
        range: 0.0100,
        historicalRank: 50,
        riskFactor: 50
      },
      // ATR-based stop loss options
      atrStopLoss: response.atrStopLoss && typeof response.atrStopLoss === 'object' ? {
        atrValue: response.atrStopLoss.atrValue || "0.0010",
        atr1x: response.atrStopLoss.atr1x || "Unknown",
        atr15x: response.atrStopLoss.atr15x || "Unknown",
        atr2x: response.atrStopLoss.atr2x || "Unknown",
        recommended: response.atrStopLoss.recommended || "Unknown"
      } : undefined,
      // Momentum indicators
      momentumIndicators: response.momentumIndicators && typeof response.momentumIndicators === 'object' ? {
        rsi: response.momentumIndicators.rsi,
        macd: response.momentumIndicators.macd,
        stochastic: response.momentumIndicators.stochastic,
        volumeTrend: response.momentumIndicators.volumeTrend
      } : undefined,
      // Candlestick significance analysis
      candlestickSignificance: response.candlestickSignificance && typeof response.candlestickSignificance === 'object' ? {
        overallSignal: response.candlestickSignificance.overallSignal || "Neutral",
        reliability: response.candlestickSignificance.reliability || "Medium",
        patterns: Array.isArray(response.candlestickSignificance.patterns) ? response.candlestickSignificance.patterns : [],
        keyObservation: response.candlestickSignificance.keyObservation || "No significant patterns detected",
        tradingImplication: response.candlestickSignificance.tradingImplication || "Continue monitoring for clearer signals"
      } : undefined,
      // Generate market trend data for related pairs
      marketTrends: await generateMarketTrendPredictions(symbol),
      patterns: Array.isArray(response.patterns) ? response.patterns : [],
      indicators: Array.isArray(response.indicators) ? response.indicators : [],
      supportResistance: Array.isArray(response.supportResistance) ? response.supportResistance : [],
      timeframeAnalysis: Array.isArray(response.timeframeAnalysis) ? response.timeframeAnalysis : [],
      volumeAnalysis: Array.isArray(response.volumeAnalysis) && response.volumeAnalysis.length > 0 ? response.volumeAnalysis : (() => {
        // Generate dynamic volume analysis data based on the currency pair
        const symbol = typeof response.symbol === 'string' ? response.symbol : "Unknown";
        
        // Default volume analysis
        const defaultVolume = [
          {
            period: "Asian Session",
            volume: "Medium",
            activity: "Moderate price action with occasional breakouts during Tokyo open",
            quality: "Average"
          },
          {
            period: "London Session",
            volume: "High",
            activity: "Increased volatility and liquidity as European markets open",
            quality: "Excellent"
          },
          {
            period: "New York Session",
            volume: "High",
            activity: "Peak trading volume when both European and US markets are active",
            quality: "Excellent"
          }
        ];
        
        // Customize based on currency pair
        if (symbol.includes("JPY") || symbol.includes("AUD") || symbol.includes("NZD")) {
          // Asian currencies are more active during Asian session
          defaultVolume[0].volume = "High";
          defaultVolume[0].quality = "Excellent";
          defaultVolume[0].activity = "Strong price movements and liquidity during Tokyo/Sydney sessions";
        } else if (symbol.includes("GBP") || symbol.includes("EUR") || symbol.includes("CHF")) {
          // European currencies are more active during London session
          defaultVolume[1].volume = "Very High";
          defaultVolume[1].activity = "Peak liquidity and volatility for European currencies";
        } else if (symbol.includes("CAD")) {
          // CAD has higher activity during NY session
          defaultVolume[2].volume = "Very High";
          defaultVolume[2].activity = "Highest volatility during New York and Toronto market hours";
        }
        
        return defaultVolume;
      })(),
      recommendation: typeof response.recommendation === 'string' ? response.recommendation : "No recommendation available",
      steps: Array.isArray(response.steps) ? response.steps : []
    };
    
    return analysisResponse;
  } catch (error) {
    console.error("Error analyzing chart:", error);
    if (error instanceof Error) {
      throw error; // Preserve the original error and stack trace
    } else {
      throw new Error("Failed to analyze chart image");
    }
  }
}

// Generate concise trading tips for a symbol
export async function generateTradingTip(
  symbol: string,
  timeframe: string = '4H', 
  marketContext: string = ''
): Promise<{ tip: string; direction: string; confidence: number; key_levels: { support: string; resistance: string } }> {
  const openai = getOpenAIInstance();
  
  // Prepare prompt for AI to generate trading tip
  const prompt = `Generate a concise trading tip for ${symbol} on the ${timeframe} timeframe.
${marketContext ? `Current market context: ${marketContext}` : ''}

Analyze potential trade opportunities for ${symbol} based on recent price action, key support/resistance levels, 
and relevant indicators. Focus on actionable advice for traders.

Format your response as a JSON object with these fields:
- tip: A concise 1-2 sentence trading recommendation
- direction: Either "buy", "sell", or "neutral"
- confidence: A number from 1-100 representing confidence in this tip
- key_levels: An object containing "support" and "resistance" price levels

Keep the tip under 150 characters - direct and actionable.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // use the newest model
      messages: [
        { role: "system", content: "You are a professional forex and crypto trading advisor with 15+ years of experience." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse the response
    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error("Failed to generate trading tip");
    }
    
    try {
      const tipData = JSON.parse(content);
      return {
        tip: tipData.tip || "No tip available",
        direction: tipData.direction || "neutral",
        confidence: Number(tipData.confidence) || 50,
        key_levels: {
          support: tipData.key_levels?.support || "N/A",
          resistance: tipData.key_levels?.resistance || "N/A"
        }
      };
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      throw new Error("Failed to parse trading tip");
    }
  } catch (error) {
    console.error("Error generating trading tip:", error);
    throw error;
  }
}

export async function extractTextFromImage(base64Image: string): Promise<string> {
  try {
    const openai = getOpenAIInstance();
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text visible in this trading chart image. Focus on price values, indicators, timeframes, and any other relevant information."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 1000,
    });

    return visionResponse.choices[0].message.content || "";
  } catch (error) {
    console.error("Error extracting text from image:", error);
    if (error instanceof Error) {
      throw error; // Preserve the original error and stack trace
    } else {
      throw new Error("Failed to extract text from image");
    }
  }
}

/**
 * Generate market trend predictions for related currency pairs
 * @param mainSymbol The primary symbol being analyzed
 * @returns Array of trend predictions for related currency pairs
 */
export async function generateMarketTrendPredictions(mainSymbol: string): Promise<TrendCell[]> {
  try {
    const openai = getOpenAIInstance();
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: 
            "You are a professional forex and trading market analyst with deep technical analysis expertise. " +
            "Generate accurate trend predictions for currency pairs related to the main pair being analyzed. " +
            "Your predictions should be based on recent market patterns, economic data, and technical indicators."
        },
        {
          role: "user",
          content: `Based on the current analysis of ${mainSymbol}, predict the market trends for 8-12 related trading pairs. ` +
            "For each pair, provide: pair name, probability (0-100), direction (bullish/bearish/neutral), " +
            "and signal strength (0-100). Format your response as a JSON array of objects with the field name 'predictions'."
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const parsedResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    if (Array.isArray(parsedResponse.predictions)) {
      return parsedResponse.predictions.map((pred: any) => ({
        pair: pred.pair || "Unknown Pair",
        probability: typeof pred.probability === 'number' ? pred.probability : parseInt(pred.probability) || 50,
        direction: pred.direction === 'bullish' || pred.direction === 'bearish' || pred.direction === 'neutral' 
          ? pred.direction 
          : 'neutral',
        strength: typeof pred.strength === 'number' ? pred.strength : parseInt(pred.strength) || 50,
        timestamp: Date.now()
      }));
    }
    
    // Fallback in case the model doesn't return the expected format
    return generateFallbackTrendData(mainSymbol);
  } catch (error) {
    console.error("Error generating market trend predictions:", error);
    return generateFallbackTrendData(mainSymbol);
  }
}

/**
 * Generate fallback trend data when the API call fails
 */
function generateFallbackTrendData(mainSymbol: string): TrendCell[] {
  const currencyPairs = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 
    'USD/CAD', 'AUD/USD', 'NZD/USD', 'EUR/GBP'
  ];
  
  // Filter out the main symbol and take up to 8 pairs
  const relatedPairs = currencyPairs
    .filter(pair => pair !== mainSymbol)
    .slice(0, 8);
  
  return relatedPairs.map(pair => {
    const random = Math.random();
    let direction: 'bullish' | 'bearish' | 'neutral';
    
    if (random < 0.4) {
      direction = 'bullish';
    } else if (random < 0.8) {
      direction = 'bearish';
    } else {
      direction = 'neutral';
    }
    
    return {
      pair,
      probability: Math.round(60 + Math.random() * 35), // 60-95%
      direction,
      strength: Math.round(20 + Math.random() * 75), // 20-95
      timestamp: Date.now()
    };
  });
}

// Presentation slide structure
export interface PresentationSlide {
  slideNumber: number;
  title: string;
  bulletPoints: string[];
  explainerExample?: string;
  realWorldExample?: string;
  notableIncident?: string;
  keyReasons?: string[];
  speakerNotes?: string;
  visualSuggestion?: string;
  duration?: string;
}

export interface PresentationOutline {
  eventTitle: string;
  totalSlides: number;
  estimatedDuration: string;
  slides: PresentationSlide[];
}

// Generate AI presentation outline for an event
export async function generatePresentationOutline(
  eventTitle: string,
  eventDescription: string,
  talkingPoints: string[],
  agenda: { time: string; topic: string; notes?: string }[],
  duration: number
): Promise<PresentationOutline> {
  if (!openai) {
    throw new Error("OpenAI API key is not configured");
  }

  const prompt = `You are creating a professional presentation outline for a live trading/educational event. 
  
EVENT DETAILS:
- Title: ${eventTitle}
- Description: ${eventDescription}
- Duration: ${duration} minutes
- Key Talking Points: ${talkingPoints.join(', ')}
- Agenda: ${agenda.map(a => `${a.time}: ${a.topic}`).join('; ')}

Create a visually engaging presentation outline with ${Math.max(3, Math.min(10, Math.floor(duration / 5)))} slides.

Each slide MUST have:
1. A compelling title (short, impactful)
2. 2-4 bullet points (concise, action-oriented)
3. An EXPLAINER EXAMPLE - a simple analogy or everyday comparison that makes the concept click (e.g., "A stop loss is like a safety net for a trapeze artist - you hope you never need it, but it saves you when things go wrong")
4. A REAL-WORLD EXAMPLE - a specific, concrete scenario with names/numbers (e.g., "When Bitcoin dropped 40% in May 2021, traders using 3% stop losses preserved 97% of capital")
5. A NOTABLE INCIDENT - a famous trading story or market event (e.g., "Nick Leeson lost $1.3B and collapsed Barings Bank by hiding losses")
6. KEY REASONS - 2-3 specific reasons WHY this matters with data (e.g., "Studies show 90% of day traders lose money due to emotional trading")
7. Brief speaker notes
8. Visual suggestion (icon/graphic idea)
9. Approximate duration

CRITICAL: 
- Explainer examples should use everyday analogies (cooking, sports, driving, etc.) to make complex trading concepts easy to understand
- Real-world examples, incidents, and reasons must be SPECIFIC and MEMORABLE with real names, numbers, and events

Style guidelines:
- Professional trading/finance theme
- Clear, educational tone
- Actionable insights with proof
- Memorable stories that stick

Return a JSON object with this exact structure:
{
  "eventTitle": "string",
  "totalSlides": number,
  "estimatedDuration": "string",
  "slides": [
    {
      "slideNumber": 1,
      "title": "string",
      "bulletPoints": ["point1", "point2", "point3"],
      "explainerExample": "Simple analogy using everyday concepts to explain the topic",
      "realWorldExample": "Specific example with names and numbers",
      "notableIncident": "Famous trading story or market event",
      "keyReasons": ["Reason 1 with data", "Reason 2 with statistics"],
      "speakerNotes": "string",
      "visualSuggestion": "string",
      "duration": "2 min"
    }
  ]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are an expert presentation designer for trading and financial education. Create compelling, professional slide outlines. Always return valid JSON."
        },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" },
      max_tokens: 4000,
      temperature: 0.7
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const result = JSON.parse(content) as PresentationOutline;
    return result;
  } catch (error) {
    console.error("Error generating presentation outline:", error);
    
    // Return fallback outline
    return {
      eventTitle: eventTitle,
      totalSlides: 3,
      estimatedDuration: `${duration} minutes`,
      slides: [
        {
          slideNumber: 1,
          title: "Welcome & Overview",
          bulletPoints: ["Session objectives", "What you'll learn today", "Key takeaways"],
          speakerNotes: "Introduce yourself and set expectations",
          visualSuggestion: "Welcome graphic with logo",
          duration: "3 min"
        },
        {
          slideNumber: 2,
          title: eventTitle,
          bulletPoints: talkingPoints.slice(0, 4),
          speakerNotes: "Cover the main content",
          visualSuggestion: "Chart or diagram",
          duration: `${Math.floor(duration * 0.7)} min`
        },
        {
          slideNumber: 3,
          title: "Summary & Next Steps",
          bulletPoints: ["Key points recap", "Action items", "Questions?"],
          speakerNotes: "Wrap up and take questions",
          visualSuggestion: "Checklist graphic",
          duration: "5 min"
        }
      ]
    };
  }
}
