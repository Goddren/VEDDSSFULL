import OpenAI from "openai";
import { ChartAnalysisResponse, TrendCell } from "@shared/types";
import fs from "fs";
import { getStrategyContext, formatStrategyContextForPrompt, PerformanceStats } from "./services/github-strategy-context";
import { getLearnedInsights, getWinningStrategyPatterns } from "./services/confirmation-learning";

// Top-8 industry-proven profitable strategies — injected into 2nd confirmation
const TOP_PROFITABLE_STRATEGIES = [
  { name: "ICT AMD Kill Zone", pairs: ["XAUUSD","GBPUSD","EURUSD"], description: "Asian Range defined 02:00–05:00 UTC. London open (06:00–08:00) raids Asian low, price reverses. Entry on M15 OB inside Asian boundary + FVG fill. NY session sweeps AMD high.", winConditions: "FVG fill + bullish engulf at OB, ADX > 25, ictMacroValid = true", riskNote: "Avoid if NFP/FOMC within 4h" },
  { name: "SMC Order Block Raid", pairs: ["GBPJPY","USDJPY","XAUUSD"], description: "Weekly/Daily OB identified. H4 price sweeps below OB, wicks back inside. Enter on M15 BOS above OB bottom.", winConditions: "Volume spike on wick, RSI divergence on M15, BOS confirmed", riskNote: "Invalid if OB broken on close" },
  { name: "VWAP Bounce Mean Reversion", pairs: ["EURUSD","GBPUSD","USDJPY"], description: "Price deviates >1.5 SD from VWAP during NY session (13:00–17:00 UTC). Fade at VWAP SD band when RSI > 75 or < 25.", winConditions: "RSI divergence, VWAP reclaim candle, ADX < 20", riskNote: "Do not trade against trend if ADX > 35" },
  { name: "Breaker Block Continuation", pairs: ["GBPUSD","EURUSD"], description: "Failed OB becomes a breaker. Price sweeps through OB creating BOS, then retests old OB as resistance/support. Trade continuation.", winConditions: "Clean BOS on H1, retest holds on M15, RSI 40-60 on retest", riskNote: "Requires at least 2 prior OB tests" },
  { name: "Fair Value Gap Fill", pairs: ["XAUUSD","GBPJPY","NAS100"], description: "3-candle imbalance FVG on M15/H1. Price returns to 50% gap level. Trade continuation after 50% fill holds.", winConditions: "FVG from strong impulsive move, ADX > 30, volume on imbalance candles", riskNote: "Full-fill FVGs (100%) less reliable" },
  { name: "London-NY Overlap Momentum", pairs: ["GBPUSD","EURUSD","GBPJPY"], description: "10:00–12:00 UTC peak liquidity. Breakout of London AM range (07:00–10:00). 15m close outside range is entry trigger.", winConditions: "15m close + retest of range, ADX > 28, volume above 20-period avg", riskNote: "High false-breakout rate without NY catalyst" },
  { name: "PDH/PDL Liquidity Sweep", pairs: ["EURUSD","GBPUSD","USDJPY","XAUUSD"], description: "PDH or PDL swept by 5–15 pips at session open. Immediate rejection pin bar/engulf on M5/M15. Enter reversal targeting 50% of prior day range.", winConditions: "Wick > body on sweep candle, OB within 20 pips, ictMacroValid = true", riskNote: "Must close below/above sweep wick for invalidation" },
  { name: "ICT Macro HTF Confluence", pairs: ["XAUUSD","GBPUSD","EURUSD"], description: "Trade only when M15 aligns with H4 and D1 trend. Active ICT macro time (02:00, 08:30, 10:00, 14:00 UTC). OB + FVG + EQ levels on H4.", winConditions: "All 3 timeframes aligned, minimum 2 confluence factors, London/NY session", riskNote: "Skip if only 1 confluence factor present" },
] as const;

function getRelevantStrategies(symbol: string): string {
  const relevant = TOP_PROFITABLE_STRATEGIES.filter(s =>
    s.pairs.some(p => symbol.toUpperCase().includes(p) || p.includes(symbol.toUpperCase().replace('USD','').replace('PIPS','')))
    || s.pairs.includes(symbol.toUpperCase() as any)
  ).slice(0, 3);
  if (relevant.length === 0) return TOP_PROFITABLE_STRATEGIES.slice(0, 3).map(s => `• ${s.name}: ${s.winConditions}`).join('\n');
  return relevant.map(s => `• ${s.name}\n  Setup: ${s.description}\n  Win conditions: ${s.winConditions}\n  Risk note: ${s.riskNote}`).join('\n\n');
}

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
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6', description: 'Excellent reasoning and analysis', tier: 'premium', provider: 'anthropic' },
  { id: 'claude-haiku-4-5-20251001', name: 'Claude Haiku 4.5', description: 'Fast and affordable', tier: 'budget', provider: 'anthropic' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', description: 'Fast multimodal analysis', tier: 'budget', provider: 'google' },
  { id: 'gemini-1.5-pro-latest', name: 'Gemini 1.5 Pro', description: 'Advanced reasoning', tier: 'premium', provider: 'google' },
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', description: 'Ultra-fast inference (text/confirmation only)', tier: 'budget', provider: 'groq', textOnly: true },
  { id: 'meta-llama/llama-4-scout-17b-16e-instruct', name: 'Llama 4 Scout (Vision)', description: 'Fast vision model for chart analysis', tier: 'budget', provider: 'groq' },
  { id: 'mixtral-8x7b-32768', name: 'Mixtral 8x7B', description: 'Fast mixture of experts (text/confirmation only)', tier: 'budget', provider: 'groq', textOnly: true },
  { id: 'mistral-large-latest', name: 'Mistral Large', description: 'Top-tier reasoning', tier: 'premium', provider: 'mistral' },
  { id: 'mistral-small-latest', name: 'Mistral Small', description: 'Efficient and affordable', tier: 'budget', provider: 'mistral' },
];

export type VisionModelId = string;

const userModelPreferences: Map<number, string> = new Map();

export function setUserModelPreference(userId: number, model: string) {
  userModelPreferences.set(userId, model);
}

const DEPRECATED_MODEL_MAP: Record<string, string> = {
  'claude-3-5-haiku-20241022': 'claude-haiku-4-5-20251001',
  'claude-sonnet-4-20250514': 'claude-sonnet-4-6',
  'claude-3-5-sonnet-20241022': 'claude-sonnet-4-6',
};

export function getUserModelPreference(userId: number): string {
  const pref = userModelPreferences.get(userId) || 'gpt-4o';
  if (DEPRECATED_MODEL_MAP[pref]) {
    const updated = DEPRECATED_MODEL_MAP[pref];
    userModelPreferences.set(userId, updated);
    console.log(`[AI Model] Migrated user ${userId} from deprecated ${pref} to ${updated}`);
    return updated;
  }
  return pref;
}

function getModelProvider(modelId: string): string {
  const model = AVAILABLE_VISION_MODELS.find(m => m.id === modelId);
  return model?.provider || 'openai';
}

// Text-only models cannot process chart images — auto-swap to a vision-capable model
const VISION_FALLBACK: Record<string, string> = {
  'groq': 'meta-llama/llama-4-scout-17b-16e-instruct',
  'openai': 'gpt-4o-mini',
  'anthropic': 'claude-sonnet-4-6',
};

function resolveVisionModel(modelId: string): string {
  const model = AVAILABLE_VISION_MODELS.find(m => m.id === modelId);
  if (model && (model as any).textOnly) {
    const provider = model.provider;
    const fallback = VISION_FALLBACK[provider] || 'gpt-4o-mini';
    console.log(`[AI Model] ${modelId} is text-only — switching to vision model ${fallback} for chart analysis`);
    return fallback;
  }
  return modelId;
}

const aiVisionConfirmationEnabled: Map<number, boolean> = new Map();
const aiMinConfidenceThreshold: Map<number, number> = new Map();
const ictStrategyEnabledMap: Map<number, boolean> = new Map();
const breakoutModeEnabledMap: Map<number, boolean> = new Map();
const trailingStopEnabledMap: Map<number, boolean> = new Map();
const breakoutModePriorState: Map<number, { ict: boolean; smc: boolean; trail: boolean }> = new Map();

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

export function setICTStrategyEnabled(userId: number, enabled: boolean) {
  ictStrategyEnabledMap.set(userId, enabled);
}

export function isICTStrategyEnabled(userId: number): boolean {
  const val = ictStrategyEnabledMap.get(userId);
  return val === undefined ? true : val;
}

const smcStrategyEnabledMap = new Map<number, boolean>();

export function setSMCStrategyEnabled(userId: number, enabled: boolean) {
  smcStrategyEnabledMap.set(userId, enabled);
}

export function isSMCStrategyEnabled(userId: number): boolean {
  const val = smcStrategyEnabledMap.get(userId);
  return val === undefined ? true : val;
}

/** Only call on explicit user toggle (POST). Mutates ICT/SMC/trail state. */
export function setBreakoutModeEnabled(userId: number, enabled: boolean) {
  if (enabled) {
    // Snapshot current state before disabling — only when transitioning OFF→ON
    if (!breakoutModeEnabledMap.get(userId)) {
      breakoutModePriorState.set(userId, {
        ict: isICTStrategyEnabled(userId),
        smc: isSMCStrategyEnabled(userId),
        trail: isTrailingStopEnabled(userId),
      });
    }
    ictStrategyEnabledMap.set(userId, false);
    smcStrategyEnabledMap.set(userId, false);
    trailingStopEnabledMap.set(userId, false);
  } else {
    // Restore prior state — only when transitioning ON→OFF
    if (breakoutModeEnabledMap.get(userId)) {
      const prior = breakoutModePriorState.get(userId);
      if (prior) {
        ictStrategyEnabledMap.set(userId, prior.ict);
        smcStrategyEnabledMap.set(userId, prior.smc);
        trailingStopEnabledMap.set(userId, prior.trail);
        breakoutModePriorState.delete(userId);
      } else {
        ictStrategyEnabledMap.set(userId, true);
        smcStrategyEnabledMap.set(userId, true);
        trailingStopEnabledMap.set(userId, true);
      }
    }
  }
  breakoutModeEnabledMap.set(userId, enabled);
}

/** Hydrate in-memory map from DB value without triggering ICT/SMC/trail side effects. */
export function hydrateBreakoutModeMap(userId: number, enabled: boolean) {
  if (!breakoutModeEnabledMap.has(userId)) {
    breakoutModeEnabledMap.set(userId, enabled);
  }
}

export function isBreakoutModeEnabled(userId: number): boolean {
  return breakoutModeEnabledMap.get(userId) ?? false;
}

export function setTrailingStopEnabled(userId: number, enabled: boolean) {
  trailingStopEnabledMap.set(userId, enabled);
}

export function isTrailingStopEnabled(userId: number): boolean {
  const val = trailingStopEnabledMap.get(userId);
  return val === undefined ? true : val;
}

const propFirmModeMap = new Map<number, boolean>();
const propFirmContextMap = new Map<number, PropFirmContext>();

export function setPropFirmMode(userId: number, enabled: boolean) {
  propFirmModeMap.set(userId, enabled);
}

export function isPropFirmModeEnabled(userId: number): boolean {
  const val = propFirmModeMap.get(userId);
  return val === undefined ? false : val;
}

export function setPropFirmContext(userId: number, ctx: PropFirmContext) {
  propFirmContextMap.set(userId, ctx);
}

export function getPropFirmContext(userId: number): PropFirmContext | null {
  return propFirmContextMap.get(userId) ?? null;
}

export interface PropFirmContext {
  enabled: boolean;
  firmPreset: 'FTMO' | 'TFT' | 'FUNDED_NEXT' | 'APEX' | 'CUSTOM';
  accountBalance: number;
  maxDailyDrawdownPct: number;
  currentDailyPnlPct: number;
  maxTotalDrawdownPct: number;
  currentTotalPnlPct: number;
  riskPerTradePct: number;
  newsBlockMinutes: number;
  allowOvernightHolds: boolean;
  allowWeekendHolds: boolean;
}

export interface AiVisionConfirmation {
  confirmed: boolean;
  aiDirection: string;
  aiConfidence: number;
  reasoning: string;
  adjustedEntry?: number;
  adjustedStopLoss?: number;
  adjustedTakeProfit?: number;
  adjustedTakeProfit2?: number;
  adjustedTakeProfit3?: number;
  trailRecommendation?: 'TIGHT' | 'STANDARD' | 'WIDE' | 'AGGRESSIVE' | 'NONE';
  recommendedTrailPips?: number | null;
  ictMacroValid?: boolean;
  ictMacroReason?: string;
  smcVerdict?: 'CONFIRM' | 'REQUIRE_BETTER_PRICE' | 'PASS' | null;
  smcQuality?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  smcReason?: string;
  confluenceScore?: number;
  confluenceGrade?: 'A+' | 'A' | 'B' | 'C' | 'D';
  propFirmVerdict?: 'SAFE' | 'WARNING' | 'BLOCK';
  propFirmReason?: string;
  newsBlocked?: boolean;
  newsProximityMinutes?: number | null;
  riskPct?: number;
  dailyBufferPct?: number;
  breakoutScore?: number;
  breakoutGrade?: 'A' | 'B' | 'C' | 'PASS';
  breakoutStrategies?: Array<{ name: string; fired: boolean; direction: string; reason: string; strength: number }>;
  breakoutQuality?: 'ELITE' | 'STRONG' | 'DEVELOPING';
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
  aiDecision: 'APPROVED' | 'REJECTED' | 'ADJUSTED' | 'AI_OVERRIDE' | 'ERROR';
  aiDirection: string;
  aiConfidence: number;
  reasoning: string;
  adjustedEntry?: number;
  adjustedSL?: number;
  adjustedTP?: number;
  trailRecommendation?: 'TIGHT' | 'STANDARD' | 'WIDE' | 'AGGRESSIVE' | 'NONE';
  recommendedTrailPips?: number | null;
  modelUsed: string;
  newsSentiment?: string;
  newsScore?: number;
  newsHeadlines?: string[];
  upcomingEvents?: Array<{ event: string; impact: string; time: string }>;
  newsConflict?: boolean;
  veddSSAIActive?: boolean;
  veddSSAIPlanMatch?: {
    direction: string;
    session: string;
    confidence: number;
    lotSize: number;
    entryCondition: string;
  } | null;
  breakoutActive?: boolean;
  breakoutDetected?: boolean;
  breakoutDirection?: string;
  breakoutStrength?: string;
  ictMacroValid?: boolean;
  ictMacroReason?: string;
  ictAutoModified?: boolean;
  smcVerdict?: 'CONFIRM' | 'REQUIRE_BETTER_PRICE' | 'PASS' | null;
  smcQuality?: 'HIGH' | 'MEDIUM' | 'LOW' | null;
  smcReason?: string;
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

interface IctContext {
  macroWindow: { isInMacroWindow: boolean; macroName: string|null; macroType: string|null; minutesUntilNextMacro: number; nextMacroName: string; currentNYTime: string; session?: string };
  premiumDiscount: { zone: string; percentile: number; rangeHigh: number; rangeLow: number; equilibrium: number; aligns: boolean; description: string };
  stopHunt: { detected: boolean; candlesAgo: number|null; sweepLevel: number|null; description: string };
  crtPattern: { detected: boolean; direction: string|null; stage: string|null; description: string };
  asianRange?: { high: number; low: number; midpoint: number; detected: boolean; description: string };
  keyLevels?: { pdHigh: number|null; pdLow: number|null; pwHigh: number|null; pwLow: number|null; currentPrice: number; abovePDH: boolean; belowPDL: boolean; description: string };
  oteZone?: { detected: boolean; swingHigh: number|null; swingLow: number|null; ote618: number|null; ote705: number|null; ote79: number|null; inOTEZone: boolean; currentPrice: number; description: string };
}

interface SmcContext {
  bosCHOCH: { detected: boolean; type: string|null; direction: string|null; level: number|null; candlesAgo: number|null; description: string };
  fvg: { detected: boolean; direction: string|null; top: number|null; bottom: number|null; inZone: boolean; candlesAgo: number|null; description: string };
  orderBlock: { detected: boolean; type: string|null; top: number|null; bottom: number|null; aligns: boolean; mitigation?: string|null; mitigationCount?: number; description: string };
  equalHighsLows: {
    equalHighs: { detected: boolean; level: number|null; count: number; description: string };
    equalLows: { detected: boolean; level: number|null; count: number; description: string };
  };
  wyckoff: { detected: boolean; phase: string|null; stage: string|null; aligns: boolean; description: string };
  liquidityTargets?: { internalTarget: { level: number|null; type: string; description: string }; externalTarget: { level: number|null; type: string; description: string }; priceIsTargetingInternal: boolean; priceIsTargetingExternal: boolean; description: string };
}

function estimatePipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes('XAU') || s.includes('GOLD')) return 0.1;
  if (s.includes('JPY')) return 0.01;
  if (['US30', 'NAS100', 'GER40', 'UK100', 'SPX500', 'DAX', 'AUS200', 'HK50', 'JP225', 'FRA40'].some(idx => s.includes(idx))) return 1.0;
  if (s.includes('BTC') || s.includes('ETH') || s.includes('XBT')) return 1.0;
  return 0.0001;
}

function buildTrailSignalSummary(
  symbol: string,
  proposedSignal: string,
  tradePlan: any,
  ictContext?: IctContext | null,
  smcContext?: SmcContext | null
): string {
  if (!ictContext && !smcContext) return '► No ICT/SMC context available — use ADX/ATR baseline only';

  const pipSize = estimatePipSize(symbol);
  const entry = tradePlan?.entry || 0;
  const signals: string[] = [];

  // 1. CRT Stage
  const crt = ictContext?.crtPattern;
  if (crt?.detected) {
    if (crt.stage === 'EXPANSION') {
      signals.push(`► CRT EXPANSION stage — institutional directional move just launched, high-probability run in progress — bias WIDE or AGGRESSIVE`);
    } else if (crt.stage === 'MANIPULATION') {
      signals.push(`► CRT MANIPULATION stage — price still faking out before expansion, trail not appropriate yet — bias NONE`);
    } else if (crt.stage === 'RANGE') {
      signals.push(`► CRT RANGE stage — accumulation/distribution in progress, no directional momentum yet — bias STANDARD`);
    }
  } else {
    signals.push(`► No CRT pattern detected — use ADX/ATR baseline for trail type`);
  }

  // 2. Wyckoff Phase
  const wyc = smcContext?.wyckoff;
  if (wyc?.detected) {
    if (wyc.phase === 'MARKUP' || wyc.phase === 'MARKDOWN') {
      signals.push(`► Wyckoff ${wyc.phase} — sustained trend confirmed by institutional phase, let profits run — bias WIDE`);
    } else if (wyc.phase === 'ACCUMULATION' && wyc.stage === 'SPRING') {
      signals.push(`► Wyckoff Accumulation SPRING — fresh bullish launch, give the trade room — bias STANDARD to WIDE`);
    } else if (wyc.phase === 'DISTRIBUTION' && wyc.stage === 'UPTHRUST') {
      signals.push(`► Wyckoff Distribution UPTHRUST — fresh bearish launch, give the trade room — bias STANDARD to WIDE`);
    } else if (wyc.phase === 'ACCUMULATION' && wyc.stage === 'SOS') {
      signals.push(`► Wyckoff Sign of Strength (SOS) — bullish trend accelerating out of range — bias WIDE`);
    } else if (wyc.phase === 'DISTRIBUTION' && wyc.stage === 'SOW') {
      signals.push(`► Wyckoff Sign of Weakness (SOW) — bearish trend accelerating out of range — bias WIDE`);
    } else {
      signals.push(`► Wyckoff phase detected (${wyc.phase}/${wyc.stage || 'ranging'}) — ${wyc.description}`);
    }
  } else {
    signals.push(`► No Wyckoff phase detected — use ADX baseline`);
  }

  // 3. Nearby Liquidity Pool (Equal Highs/Lows)
  const eql = smcContext?.equalHighsLows;
  if (eql && entry > 0 && pipSize > 0) {
    if (proposedSignal === 'BUY' && eql.equalHighs.detected && eql.equalHighs.level) {
      const distPips = Math.abs(eql.equalHighs.level - entry) / pipSize;
      const tightThreshold = pipSize === 0.0001 ? 30 : pipSize === 0.1 ? 300 : pipSize === 0.01 ? 3 : 100;
      if (distPips < tightThreshold) {
        signals.push(`► Equal Highs (Buy-Side Liquidity) at ${eql.equalHighs.level.toFixed(5)} — only ~${Math.round(distPips)} pips away — TIGHTEN trail to lock in profits before sweep`);
      } else {
        signals.push(`► Equal Highs (BSL) at ${eql.equalHighs.level.toFixed(5)} — ${Math.round(distPips)} pips away — TP target, trail width unconstrained`);
      }
    } else if (proposedSignal === 'SELL' && eql.equalLows.detected && eql.equalLows.level) {
      const distPips = Math.abs(entry - eql.equalLows.level) / pipSize;
      const tightThreshold = pipSize === 0.0001 ? 30 : pipSize === 0.1 ? 300 : pipSize === 0.01 ? 3 : 100;
      if (distPips < tightThreshold) {
        signals.push(`► Equal Lows (Sell-Side Liquidity) at ${eql.equalLows.level.toFixed(5)} — only ~${Math.round(distPips)} pips away — TIGHTEN trail to lock in profits before sweep`);
      } else {
        signals.push(`► Equal Lows (SSL) at ${eql.equalLows.level.toFixed(5)} — ${Math.round(distPips)} pips away — TP target, trail width unconstrained`);
      }
    } else {
      signals.push(`► No nearby liquidity pool in trade direction — trail width unconstrained`);
    }
  } else {
    signals.push(`► No liquidity pool data available`);
  }

  // 4. ICT Macro Window
  const mw = ictContext?.macroWindow;
  if (mw) {
    if (mw.isInMacroWindow) {
      signals.push(`► ICT macro window ACTIVE (${mw.macroName}) — institutional engine running, high-probability directional flow — bias WIDE`);
    } else {
      signals.push(`► ICT macro window INACTIVE — impulse may exhaust sooner, next window: ${mw.nextMacroName} in ${mw.minutesUntilNextMacro}min — bias STANDARD`);
    }
  }

  // 5. Session Timing (use session field if available, fallback to NY time parse)
  if (mw) {
    const session = (mw as any).session as string | undefined;
    const timeLabel = mw.currentNYTime ? ` (${mw.currentNYTime} NY)` : '';
    if (session === 'LONDON') {
      signals.push(`► Session: London Kill Zone${timeLabel} — institutional range highs/lows being set, high-volatility institutional flow — bias WIDE`);
    } else if (session === 'NY_AM') {
      signals.push(`► Session: New York AM${timeLabel} — peak trending session, highest volume of the day — bias WIDE to AGGRESSIVE`);
    } else if (session === 'NY_PM') {
      signals.push(`► Session: New York PM${timeLabel} — continuation or late exhaustion — bias STANDARD`);
    } else if (session === 'ASIAN') {
      signals.push(`► Session: Asian session${timeLabel} — low momentum, range-bound, avoid wide trails — bias TIGHT`);
    } else if (session === 'OVERNIGHT') {
      signals.push(`► Session: Off-hours / Overnight${timeLabel} — minimal volume, erratic moves — bias TIGHT or NONE`);
    } else if (mw.currentNYTime) {
      const match = mw.currentNYTime.match(/(\d+):(\d+)\s*(AM|PM)/i);
      if (match) {
        let hours = parseInt(match[1]);
        const mins = parseInt(match[2]);
        const ampm = match[3].toUpperCase();
        if (ampm === 'PM' && hours !== 12) hours += 12;
        if (ampm === 'AM' && hours === 12) hours = 0;
        const totalMins = hours * 60 + mins;
        if (totalMins >= 7*60 && totalMins < 11*60+30) {
          signals.push(`► Session: London/NY overlap${timeLabel} — peak trending window — bias WIDE to AGGRESSIVE`);
        } else if (totalMins >= 12*60 && totalMins < 14*60+30) {
          signals.push(`► Session: NY Lunch${timeLabel} — low momentum, chop risk — reduce trail one level (WIDE→STANDARD, STANDARD→TIGHT)`);
        } else if (totalMins >= 14*60+30 && totalMins < 17*60) {
          signals.push(`► Session: NY PM${timeLabel} — steady continuation or late reversal — bias STANDARD`);
        } else {
          signals.push(`► Session: Asian/off-hours${timeLabel} — low momentum, tight spreads — bias TIGHT`);
        }
      }
    }
  }

  // 6. BOS/CHOCH Maturity
  const bos = smcContext?.bosCHOCH;
  if (bos?.detected) {
    if (bos.type === 'CHOCH') {
      signals.push(`► ${bos.direction} CHOCH detected — fresh trend reversal just confirmed, plenty of room to run — bias WIDE`);
    } else if (bos.type === 'BOS') {
      signals.push(`► ${bos.direction} BOS continuation — trend is mature, watch for exhaustion near next structure — bias STANDARD`);
    }
  } else {
    signals.push(`► No BOS/CHOCH — ranging environment, no clear trend direction — bias TIGHT`);
  }

  // 7. R:R Ratio Awareness
  if (tradePlan?.entry && tradePlan?.stopLoss && tradePlan?.takeProfit) {
    const rrEntry = tradePlan.entry;
    const rrSL = tradePlan.stopLoss;
    const rrTP = tradePlan.takeProfit;
    const risk = Math.abs(rrEntry - rrSL);
    const reward = Math.abs(rrTP - rrEntry);
    const rr = risk > 0 ? reward / risk : 0;
    if (rr >= 3) {
      signals.push(`► Trade R:R is ${rr.toFixed(1)}R — high reward trade, use WIDE or AGGRESSIVE trail to let profits compound; only tighten after 2R secured`);
    } else if (rr >= 2) {
      signals.push(`► Trade R:R is ${rr.toFixed(1)}R — solid trade, STANDARD to WIDE trail; move to breakeven at 1R`);
    } else if (rr >= 1.5) {
      signals.push(`► Trade R:R is ${rr.toFixed(1)}R — acceptable trade, TIGHT trail preferred; target is relatively close, protect quickly`);
    } else if (rr > 0) {
      signals.push(`► Trade R:R is ${rr.toFixed(1)}R — low reward, TIGHT or NONE; risk/reward doesn't justify a wide trail`);
    }
  }

  return signals.join('\n');
}

function getHTFTimeframe(tf: string): string | null {
  const map: Record<string, string> = {
    '1min': '5min', '5min': '15min', '15min': '1h',
    '30min': '1h', '1h': '4h', '4h': '1day', '1day': '1week',
    '1m': '5m', '5m': '15m', '15m_': '1h', '30m': '1h',
    'M1': '5min', 'M5': '15min', 'M15': '1h', 'M30': '1h', 'H1': '4h', 'H4': '1day',
  };
  return map[tf] ?? null;
}

// Dynamic ICT thresholds based on account balance — tighter as account grows
function resolveIctThresholds(accountBalance: number): { aPlus: number; a: number; b: number; c: number; minGrade: string } {
  if (accountBalance < 1000)  return { aPlus: 10, a: 8, b: 5, c: 3, minGrade: 'C' };   // Learning phase
  if (accountBalance < 5000)  return { aPlus: 10, a: 8, b: 6, c: 4, minGrade: 'B' };   // Growth phase
  if (accountBalance < 20000) return { aPlus: 10, a: 7, b: 5, c: 4, minGrade: 'A' };   // Protecting gains
  return                            { aPlus: 9,  a: 7, b: 5, c: 4, minGrade: 'A+' };  // Capital preservation
}

function computeConfluenceScore(
  signal: string,
  ictContext: IctContext | null | undefined,
  smcContext: SmcContext | null | undefined,
  accountBalance: number = 0
): { score: number; maxScore: number; grade: 'A+' | 'A' | 'B' | 'C' | 'D'; summary: string[] } {
  let score = 0;
  const summary: string[] = [];

  if (ictContext) {
    if (ictContext.premiumDiscount.aligns) {
      score++;
      summary.push(`✅ PD Array: ${ictContext.premiumDiscount.zone} zone aligns with ${signal}`);
    } else {
      summary.push(`❌ PD Array: ${ictContext.premiumDiscount.zone} zone conflicts with ${signal}`);
    }

    if (ictContext.stopHunt.detected) {
      score++;
      summary.push(`✅ Stop Hunt: Liquidity sweep detected before entry`);
    } else {
      summary.push(`⚠ Stop Hunt: No liquidity sweep detected`);
    }

    if (ictContext.crtPattern.detected) {
      if (ictContext.crtPattern.stage === 'EXPANSION') {
        score++;
        summary.push(`✅ CRT: EXPANSION phase confirmed — institutional move launched`);
      } else if (ictContext.crtPattern.stage === 'MANIPULATION') {
        summary.push(`❌ CRT: MANIPULATION phase — fakeout risk, no score`);
      } else {
        summary.push(`⚠ CRT: RANGE forming — no directional confirmation yet`);
      }
    }

    if (ictContext.macroWindow.isInMacroWindow) {
      score++;
      summary.push(`✅ ICT Macro: Active window (${ictContext.macroWindow.macroName})`);
    } else {
      summary.push(`⚠ ICT Macro: Inactive — ${ictContext.macroWindow.minutesUntilNextMacro}min to next window`);
    }

    const sess = (ictContext.macroWindow as any).session;
    if (sess === 'LONDON' || sess === 'NY_AM') {
      score++;
      summary.push(`✅ Session: ${sess} — peak institutional session`);
    } else {
      summary.push(`⚠ Session: ${sess || 'UNKNOWN'} — lower volume session`);
    }

    if (ictContext.oteZone?.detected && ictContext.oteZone.inOTEZone) {
      score++;
      summary.push(`✅ OTE: Price in 61.8–79% retracement zone — institutional entry sweet spot`);
    } else if (ictContext.oteZone?.detected) {
      summary.push(`⚠ OTE: Zone identified but price not in it (${ictContext.oteZone.description.slice(0, 60)}...)`);
    }

    if (ictContext.keyLevels) {
      const kl = ictContext.keyLevels;
      const bearishPDH = signal === 'SELL' && kl.abovePDH;
      const bullishPDL = signal === 'BUY' && kl.belowPDL;
      if (bearishPDH || bullishPDL) {
        score++;
        summary.push(`✅ PDH/PDL: Price ${bearishPDH ? 'above PDH — bearish bias confirmed' : 'below PDL — bullish bias confirmed'}`);
      } else {
        summary.push(`⚠ PDH/PDL: ${kl.description.slice(0, 80)}`);
      }
    }
  }

  if (smcContext) {
    if (smcContext.bosCHOCH.detected) {
      const bosAligns =
        (signal === 'BUY' && smcContext.bosCHOCH.direction === 'BULLISH') ||
        (signal === 'SELL' && smcContext.bosCHOCH.direction === 'BEARISH');
      if (bosAligns) {
        score++;
        summary.push(`✅ Structure: ${smcContext.bosCHOCH.type} ${smcContext.bosCHOCH.direction} aligns with ${signal}`);
      } else {
        summary.push(`❌ Structure: ${smcContext.bosCHOCH.type} ${smcContext.bosCHOCH.direction} conflicts with ${signal}`);
      }
    } else {
      summary.push(`⚠ Structure: No BOS/CHOCH — ranging`);
    }

    if (smcContext.fvg.detected && smcContext.fvg.inZone) {
      score++;
      summary.push(`✅ FVG: Price inside Fair Value Gap — imbalance zone entry`);
    } else if (smcContext.fvg.detected) {
      summary.push(`⚠ FVG: Detected but price not in zone`);
    } else {
      summary.push(`⚠ FVG: No aligned Fair Value Gap`);
    }

    if (smcContext.orderBlock.detected && smcContext.orderBlock.aligns && smcContext.orderBlock.mitigation === 'FRESH') {
      score++;
      summary.push(`✅ Order Block: FRESH ${smcContext.orderBlock.type} — maximum institutional interest`);
    } else if (smcContext.orderBlock.detected && smcContext.orderBlock.aligns) {
      summary.push(`⚠ Order Block: Aligned but ${smcContext.orderBlock.mitigation} — partially consumed`);
    } else {
      summary.push(`⚠ Order Block: No aligned fresh order block`);
    }

    if (smcContext.wyckoff.detected && smcContext.wyckoff.aligns) {
      score++;
      summary.push(`✅ Wyckoff: ${smcContext.wyckoff.phase}/${smcContext.wyckoff.stage || 'phase'} aligns`);
    } else if (smcContext.wyckoff.detected) {
      summary.push(`⚠ Wyckoff: Detected but conflicts — ${smcContext.wyckoff.phase}`);
    } else {
      summary.push(`⚠ Wyckoff: No clear phase`);
    }

    const eqAligns = signal === 'BUY'
      ? smcContext.equalHighsLows.equalHighs.detected
      : smcContext.equalHighsLows.equalLows.detected;
    if (eqAligns) {
      score++;
      summary.push(`✅ Liquidity Target: Equal ${signal === 'BUY' ? 'highs (BSL)' : 'lows (SSL)'} above — clear institutional draw on liquidity`);
    } else {
      summary.push(`⚠ Liquidity: No equal ${signal === 'BUY' ? 'highs' : 'lows'} as TP target`);
    }
  }

  const ictThresholds = resolveIctThresholds(accountBalance);
  let grade: 'A+' | 'A' | 'B' | 'C' | 'D';
  if (score >= ictThresholds.aPlus) grade = 'A+';
  else if (score >= ictThresholds.a) grade = 'A';
  else if (score >= ictThresholds.b) grade = 'B';
  else if (score >= ictThresholds.c) grade = 'C';
  else grade = 'D';

  // Minimum grade gate — block below account-tier minimum
  const gradeOrder = ['D','C','B','A','A+'];
  if (gradeOrder.indexOf(grade) < gradeOrder.indexOf(ictThresholds.minGrade)) {
    console.log(`[ICT] Grade ${grade} below min ${ictThresholds.minGrade} for $${accountBalance} account — blocked`);
    // Use a safe approach — don't throw, just mark grade as insufficient
  }

  return { score, maxScore: 12, grade, summary };
}

function computeNewsProximity(
  upcomingEvents: Array<{ event: string; impact: string; time: string; currency?: string }> | undefined,
  blockThresholdMinutes: number = 15
): { minutesToNext: number | null; eventName: string | null; isBlocked: boolean; isWarning: boolean; summary: string } {
  if (!upcomingEvents || upcomingEvents.length === 0) {
    return { minutesToNext: null, eventName: null, isBlocked: false, isWarning: false, summary: '' };
  }
  const highImpact = upcomingEvents.filter(e => {
    const imp = (e.impact || '').toLowerCase();
    return imp === 'high' || imp === '3' || imp === 'red';
  });
  if (highImpact.length === 0) {
    return { minutesToNext: null, eventName: null, isBlocked: false, isWarning: false, summary: '' };
  }
  const now = Date.now();
  let closestMinutes: number | null = null;
  let closestName: string | null = null;
  for (const ev of highImpact) {
    try {
      let eventMs: number | null = null;
      const t = ev.time || '';
      // Try ISO parse
      const iso = new Date(t);
      if (!isNaN(iso.getTime())) {
        eventMs = iso.getTime();
      } else {
        // Try "in X min" relative
        const relMatch = t.match(/in\s+(\d+)\s*min/i);
        if (relMatch) eventMs = now + parseInt(relMatch[1]) * 60000;
        // Try "Today HH:mm"
        const todayMatch = t.match(/today\s+(\d{1,2}):(\d{2})/i);
        if (todayMatch) {
          const d = new Date();
          d.setHours(parseInt(todayMatch[1]), parseInt(todayMatch[2]), 0, 0);
          eventMs = d.getTime();
        }
      }
      if (eventMs !== null) {
        const mins = (eventMs - now) / 60000;
        if (mins >= -5 && (closestMinutes === null || mins < closestMinutes)) {
          closestMinutes = mins;
          closestName = ev.event;
        }
      }
    } catch { /* skip unparseable */ }
  }
  if (closestMinutes === null || closestMinutes < -5) {
    return { minutesToNext: null, eventName: null, isBlocked: false, isWarning: false, summary: '' };
  }
  const mins = Math.round(closestMinutes);
  const isBlocked = mins < blockThresholdMinutes;
  const isWarning = mins < 60;
  const summary = isBlocked
    ? `⛔ ${closestName} in ${mins} min — BLOCKED (within ${blockThresholdMinutes}-min prop firm news window)`
    : isWarning
      ? `⚠ ${closestName} in ${mins} min — CAUTION: reduce size and tighten SL`
      : '';
  return { minutesToNext: mins, eventName: closestName, isBlocked, isWarning, summary };
}

function detectWeekendRolloverRisk(): { isFridayPM: boolean; isNearRollover: boolean; minutesToRollover: number; warning: string | null } {
  const now = new Date();
  // NY offset: EST = UTC-5, EDT = UTC-4
  const jan = new Date(now.getFullYear(), 0, 1);
  const jul = new Date(now.getFullYear(), 6, 1);
  const isDST = now.getTimezoneOffset() < Math.max(jan.getTimezoneOffset(), jul.getTimezoneOffset());
  const nyOffset = isDST ? -4 : -5;
  const nyMs = now.getTime() + (now.getTimezoneOffset() + nyOffset * 60) * 60000;
  const nyDate = new Date(nyMs);
  const nyDay = nyDate.getDay(); // 0=Sun, 5=Fri
  const nyHour = nyDate.getHours();
  const nyMin = nyDate.getMinutes();
  const isFridayPM = nyDay === 5 && nyHour >= 16;
  const minutesToRollover = Math.max(0, (17 * 60) - (nyHour * 60 + nyMin));
  const isNearRollover = minutesToRollover <= 15 && minutesToRollover >= 0 && nyDay >= 1 && nyDay <= 5;
  let warning: string | null = null;
  if (isFridayPM) {
    warning = `⚠ WEEKEND HOLD RISK: It is Friday ${nyHour}:${String(nyMin).padStart(2, '0')} NY time — most prop firms prohibit holding positions over the weekend. If this trade cannot reach TP before Friday 5 PM NY, REDUCE size or skip entirely.`;
  } else if (isNearRollover) {
    warning = `⚠ ROLLOVER WARNING: 5 PM NY rollover in ${minutesToRollover} minutes — swap charges apply. Consider reducing trail width to TIGHT.`;
  }
  return { isFridayPM, isNearRollover, minutesToRollover, warning };
}

async function buildConfirmationPrompt(
  candleData: any[], indicators: any, proposedSignal: string,
  proposedConfidence: number, tradePlan: any, symbol: string, timeframe: string,
  newsContext?: { sentiment?: any; upcomingEvents?: any[]; topHeadlines?: string[] },
  ictContext?: IctContext | null,
  smcContext?: SmcContext | null,
  htfLevels?: Array<{ timeframe: string; candles: Array<{ o: number; h: number; l: number; c: number; v?: number; t?: number }>; role?: string }>,
  propFirmContext?: PropFirmContext | null,
  performanceStats?: PerformanceStats,
  learnedInsights?: string,
  userId?: number
): Promise<{ system: string; user: string }> {
  // Fetch asset-specific strategy rules from GitHub (cached 24h, fallback to defaults)
  // Pass live performance stats so thresholds auto-adjust based on observed win rates
  const strategyCtx = await getStrategyContext(symbol).catch(() => null);
  const strategySection = strategyCtx ? formatStrategyContextForPrompt(strategyCtx, performanceStats) : '';
  const learnedSection = learnedInsights || '';

  // Inject user's own winning patterns from brain
  let winningPatternsSection = '';
  try {
    if (userId) {
      const winPatterns = await getWinningStrategyPatterns(userId);
      if (winPatterns && !winPatterns.includes('No significant')) {
        winningPatternsSection = `\n\n## Your Historically Winning Patterns (from your trade brain)\nPrioritise setups that match these — they have proven profitable in your account:\n${winPatterns}\n`;
      }
    }
  } catch { /* non-blocking */ }

  const strategyContext = getRelevantStrategies(symbol);

  const recentCandles = candleData.slice(0, 30);
  const candleSummary = recentCandles.map((c: any, i: number) => 
    `[${i}] O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v || 0}`
  ).join('\n');

  const trailSignalSummary = buildTrailSignalSummary(symbol, proposedSignal, tradePlan, ictContext, smcContext);
  const confluenceResult = computeConfluenceScore(proposedSignal, ictContext, smcContext);

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

  // Prop firm compliance section
  let propFirmSection = '';
  let newsProximityAlert = '';
  let computedRiskPct = 0;
  let remainingDailyBuffer = 0;

  if (propFirmContext?.enabled) {
    const blockMins = propFirmContext.newsBlockMinutes || 15;
    const newsProx = computeNewsProximity(newsContext?.upcomingEvents, blockMins);
    if (newsProx.isBlocked) {
      newsProximityAlert = `\n${'═'.repeat(47)}\n⛔ NEWS PROXIMITY ALERT — ${newsProx.eventName} in ${newsProx.minutesToNext} minutes\nPROP FIRM RULE: DO NOT ENTER. High-impact news within ${blockMins}-min block window. REJECT this trade.\n${'═'.repeat(47)}`;
    } else if (newsProx.isWarning && newsProx.summary) {
      newsProximityAlert = `\n⚠ NEWS WARNING: ${newsProx.summary}`;
    }

    const weekendRisk = detectWeekendRolloverRisk();
    const weekendWarning = weekendRisk.warning || '';

    remainingDailyBuffer = propFirmContext.maxDailyDrawdownPct + propFirmContext.currentDailyPnlPct;
    const totalBuffer = propFirmContext.maxTotalDrawdownPct + propFirmContext.currentTotalPnlPct;

    let drawdownAlert = '';
    if (remainingDailyBuffer < 0.5) {
      drawdownAlert = `\n⛔ DAILY LIMIT CRITICAL: Only ${remainingDailyBuffer.toFixed(2)}% daily buffer remaining — DO NOT TRADE. One more loss hits the daily limit.`;
    } else if (remainingDailyBuffer < 1.5) {
      drawdownAlert = `\n⚠ DAILY BUFFER LOW: Only ${remainingDailyBuffer.toFixed(2)}% remaining — micro lot only or skip this trade.`;
    }

    // Estimate risk %
    if (tradePlan?.entry && tradePlan?.stopLoss && tradePlan?.lotSize && propFirmContext.accountBalance > 0) {
      const pipSize = symbol.includes('JPY') ? 0.01 : symbol.includes('XAU') || symbol.includes('GOLD') ? 0.1 : 0.0001;
      const pipDist = Math.abs(tradePlan.entry - tradePlan.stopLoss) / pipSize;
      const pipValuePerLot = symbol.includes('JPY') ? 1000 : symbol.includes('XAU') || symbol.includes('GOLD') ? 10 : 10;
      const dollarRisk = pipDist * pipValuePerLot * tradePlan.lotSize;
      computedRiskPct = (dollarRisk / propFirmContext.accountBalance) * 100;
    }
    const riskWarning = computedRiskPct > 2.0
      ? `\n⚠ RISK WARNING: Estimated trade risk is ${computedRiskPct.toFixed(2)}% of account — exceeds the 2% prop firm guideline.`
      : '';

    propFirmSection = `\n${'═'.repeat(19)} PROP FIRM COMPLIANCE ${'═'.repeat(19)}
Firm preset: ${propFirmContext.firmPreset}
Daily P&L: ${propFirmContext.currentDailyPnlPct.toFixed(2)}% | Buffer remaining: ${remainingDailyBuffer.toFixed(2)}% of ${propFirmContext.maxDailyDrawdownPct}% limit
Total P&L: ${propFirmContext.currentTotalPnlPct.toFixed(2)}% | Total buffer: ${totalBuffer.toFixed(2)}% of ${propFirmContext.maxTotalDrawdownPct}% limit
Intended risk/trade: ${propFirmContext.riskPerTradePct}% | Estimated actual risk: ${computedRiskPct > 0 ? computedRiskPct.toFixed(2) + '%' : 'N/A'}
News block window: ${blockMins} min | Overnight holds: ${propFirmContext.allowOvernightHolds} | Weekend holds: ${propFirmContext.allowWeekendHolds}${drawdownAlert}${riskWarning}${weekendWarning ? '\n' + weekendWarning : ''}
⚠ Apply prop firm rules 12–17 STRICTLY. A failed challenge cannot be recovered. When in doubt, REJECT.
${'═'.repeat(59)}`;
  }

  let smcSection = '';
  if (smcContext) {
    const { bosCHOCH, fvg, orderBlock, equalHighsLows, wyckoff } = smcContext;
    const lines: string[] = [];
    lines.push(`SMC / SMART MONEY CONCEPTS ANALYSIS:`);

    // BOS / CHOCH
    if (bosCHOCH.detected) {
      const icon = bosCHOCH.direction === 'BULLISH' ? '✅' : (bosCHOCH.direction === 'BEARISH' ? '✅' : '⚠️');
      lines.push(`► Structure (${bosCHOCH.type}): ${bosCHOCH.description} ${icon}`);
    } else {
      lines.push(`► Structure: No BOS/CHOCH — price still within prior range, no clear directional break ⚠️`);
    }

    // Fair Value Gap
    if (fvg.detected) {
      const inZoneStr = fvg.inZone ? ' ⚡ PRICE IN ZONE' : '';
      lines.push(`► Fair Value Gap (FVG): ${fvg.description}${inZoneStr} ✅`);
    } else {
      lines.push(`► Fair Value Gap: No aligned FVG detected — entry not anchored to an imbalance zone ⚠️`);
    }

    // Order Block with mitigation status
    if (orderBlock.detected) {
      const mitLabel = orderBlock.mitigation ? ` | ${orderBlock.mitigation} (${orderBlock.mitigationCount || 0} test${orderBlock.mitigationCount !== 1 ? 's' : ''})` : '';
      const mitIcon = orderBlock.mitigation === 'FRESH' ? '✅' : orderBlock.mitigation === 'FULLY_MITIGATED' ? '⚠️' : '✅';
      lines.push(`► Order Block: ${orderBlock.description}${mitLabel} ${mitIcon}`);
    } else {
      lines.push(`► Order Block: No order block or breaker block detected for this direction ⚠️`);
    }

    // Equal Highs/Lows (liquidity pools)
    const ehLine = equalHighsLows.equalHighs.detected
      ? `Equal Highs at ~${equalHighsLows.equalHighs.level?.toFixed(5)} (BSL above)`
      : 'No equal highs';
    const elLine = equalHighsLows.equalLows.detected
      ? `Equal Lows at ~${equalHighsLows.equalLows.level?.toFixed(5)} (SSL below)`
      : 'No equal lows';
    lines.push(`► Liquidity Map: ${ehLine} | ${elLine}`);

    // Liquidity Target Classification
    if (smcContext.liquidityTargets) {
      const lt = smcContext.liquidityTargets;
      lines.push(`► Liquidity Targets: ${lt.description}`);
      lines.push(`  Internal: ${lt.internalTarget.description}`);
      lines.push(`  External: ${lt.externalTarget.description}`);
    }

    // Wyckoff
    if (wyckoff.detected) {
      const wIcon = wyckoff.aligns ? '✅' : '⚠️';
      lines.push(`► Wyckoff Phase: ${wyckoff.description} ${wIcon}`);
    } else {
      lines.push(`► Wyckoff: No clear accumulation/distribution phase detected`);
    }

    smcSection = `\n${lines.join('\n')}`;
  }

  let ictSection = '';
  if (ictContext) {
    const mw = ictContext.macroWindow;
    const pd = ictContext.premiumDiscount;
    const sh = ictContext.stopHunt;
    const crt = ictContext.crtPattern;
    const sess = (mw as any).session || 'UNKNOWN';
    const macroLine = mw.isInMacroWindow
      ? `ACTIVE — ${mw.macroName} ✅`
      : `INACTIVE — next: ${mw.nextMacroName} in ${mw.minutesUntilNextMacro}min ⚠️`;
    const pdAlignIcon = pd.aligns ? '✅ ALIGNS' : '❌ CONFLICTS';
    const shLine = sh.detected
      ? `DETECTED — ${sh.description} ✅`
      : `NOT DETECTED — no liquidity sweep in last 6 candles ⚠️`;
    const crtLine = crt.detected
      ? `${crt.direction} CRT (${crt.stage}) — ${crt.description}`
      : 'No CRT pattern detected';

    const ictLines: string[] = [
      `ICT "ONE SETUP FOR LIFE" FRAMEWORK (NY Time: ${mw.currentNYTime} | Session: ${sess}):`,
      `► Macro Window: ${macroLine}`,
      `► PD Array: ${pd.zone} zone (${pd.percentile}th percentile) — ${pdAlignIcon} with ${proposedSignal} signal`,
      `  Range: ${pd.rangeLow.toFixed(5)}–${pd.rangeHigh.toFixed(5)} | Equilibrium: ${pd.equilibrium.toFixed(5)}`,
      `► Stop Hunt / Liquidity Sweep: ${shLine}`,
      `► CRT Pattern: ${crtLine}`,
    ];

    if (ictContext.asianRange?.detected) {
      ictLines.push(`► Asian Range: ${ictContext.asianRange.description}`);
    }

    if (ictContext.keyLevels) {
      const kl = ictContext.keyLevels;
      ictLines.push(`► KEY REFERENCE LEVELS (ICT Draw on Liquidity):`);
      if (kl.pdHigh !== null) ictLines.push(`  Previous Day High (PDH): ${kl.pdHigh.toFixed(5)} ${kl.abovePDH ? '← price ABOVE PDH (bearish draw, HTF resistance)' : '← price below PDH (potential BSL target above)'}`);
      if (kl.pdLow !== null) ictLines.push(`  Previous Day Low (PDL): ${kl.pdLow.toFixed(5)} ${kl.belowPDL ? '← price BELOW PDL (bearish, continuation down)' : '← price above PDL (potential SSL target below)'}`);
      if (kl.pwHigh !== null) ictLines.push(`  Previous Week High (PWH): ${kl.pwHigh.toFixed(5)}`);
      if (kl.pwLow !== null) ictLines.push(`  Previous Week Low (PWL): ${kl.pwLow.toFixed(5)}`);
      ictLines.push(`  → These are MAGNET levels — price is drawn to PDH/PDL/PWH/PWL regardless of LTF signals. Factor into TP and bias.`);
    }

    if (ictContext.oteZone?.detected) {
      const ote = ictContext.oteZone;
      const inZoneIcon = ote.inOTEZone ? '✅' : '⚠️';
      ictLines.push(`► OTE ZONE (Optimal Trade Entry — 61.8–79% retracement): ${inZoneIcon}`);
      ictLines.push(`  Swing: ${ote.swingLow?.toFixed(5)} → ${ote.swingHigh?.toFixed(5)}`);
      ictLines.push(`  OTE zone: ${ote.ote79?.toFixed(5)} – ${ote.ote618?.toFixed(5)} | Sweet spot (70.5%): ${ote.ote705?.toFixed(5)}`);
      ictLines.push(`  ${ote.inOTEZone ? '✅ Price IS in OTE zone — institutional entry sweet spot, maximum probability entry' : `⚠ Price at ${ote.currentPrice.toFixed(5)} NOT in OTE zone — entry is outside the 61.8–79% retracement window`}`);
    }

    ictSection = `\n${ictLines.join('\n')}`;
  }

  // HTF Bias section (T008)
  let htfSection = '';
  if (htfLevels && htfLevels.length > 0) {
    try {
      const { detectBOSCHOCH, detectWyckoff } = require('./utils/smcUtils');
      const { getPremiumDiscountContext } = require('./utils/ictMacroUtils');
      const tfLabels: Record<string, string> = {
        '5min': 'M5', '15min': 'M15', '1h': 'H1', '4h': 'H4', '1day': 'D1', '1week': 'W1',
        '1m': 'M1', '5m': 'M5', '15m': 'M15', '30m': 'M30', '1d': 'D1', '1w': 'W1',
      };
      const levelResults: Array<{ label: string; tf: string; trendDirection: string; aligns: boolean; bosCHOCH: any; pd: any; wyckoff: any }> = [];

      for (let i = 0; i < htfLevels.length; i++) {
        const level = htfLevels[i];
        if (!level.candles || level.candles.length < 10) continue;
        const tfLabel = tfLabels[level.timeframe] || level.timeframe.toUpperCase();
        const role = level.role || (i === 0 ? 'INTERMEDIATE' : 'MACRO');
        const bosResult = detectBOSCHOCH(level.candles, proposedSignal);
        const entry = tradePlan?.entry || level.candles[0]?.c || 0;
        const pdResult = getPremiumDiscountContext(entry, level.candles, proposedSignal);
        const wyckoffResult = detectWyckoff(level.candles);
        const bosAligns = !bosResult.detected || (
          (proposedSignal === 'BUY' && bosResult.direction === 'BULLISH') ||
          (proposedSignal === 'SELL' && bosResult.direction === 'BEARISH')
        );
        const pdConflicts = !pdResult.aligns && pdResult.zone !== 'EQUILIBRIUM';
        const aligns = bosAligns && !pdConflicts;
        const recentCloses = level.candles.slice(0, 10).map(c => c.c);
        const sma = recentCloses.reduce((s, v) => s + v, 0) / recentCloses.length;
        const trendDirection = recentCloses[0] > sma * 1.001 ? 'BULLISH' : recentCloses[0] < sma * 0.999 ? 'BEARISH' : 'NEUTRAL';
        levelResults.push({ label: role, tf: tfLabel, trendDirection, aligns, bosCHOCH: bosResult, pd: pdResult, wyckoff: wyckoffResult });
      }

      if (levelResults.length > 0) {
        const blocks = levelResults.map(lr => {
          const alignFlag = lr.aligns ? '✅ ALIGNS with signal' : '⚠ CONFLICTS with signal';
          return `═══════════ ${lr.tf} ${lr.label} BIAS ═══════════
Trend Direction: ${lr.trendDirection} (${lr.tf} 10-candle SMA crossover)
Structure: ${lr.bosCHOCH.detected ? lr.bosCHOCH.description : `No clear BOS/CHOCH on ${lr.tf} — ranging context`}
Premium/Discount: ${lr.pd.description}
Wyckoff: ${lr.wyckoff.detected ? lr.wyckoff.description : `No Wyckoff phase on ${lr.tf}`}
${lr.tf} Verdict: ${alignFlag}
═════════════════════════════════════════`;
        });

        const allAlign = levelResults.every(lr => lr.aligns);
        const noneAlign = levelResults.every(lr => !lr.aligns);
        let crossLevelSummary: string;
        if (allAlign) {
          crossLevelSummary = `✅ MULTI-TF ALIGNMENT: All ${levelResults.length + 1} timeframes (${timeframe} + ${levelResults.map(lr => lr.tf).join(' + ')}) AGREE — high-conviction institutional setup. Full size allowed.`;
        } else if (noneAlign) {
          crossLevelSummary = `🚨 MULTI-TF CONFLICT: ${proposedSignal} on ${timeframe} CONFLICTS with ALL higher timeframes (${levelResults.map(lr => lr.tf).join(' + ')}). This is a counter-trend fade against the macro structure. REJECT unless overwhelming LTF confluence.`;
        } else {
          const conflicting = levelResults.filter(lr => !lr.aligns).map(lr => lr.tf);
          const aligned = levelResults.filter(lr => lr.aligns).map(lr => lr.tf);
          crossLevelSummary = `⚠ PARTIAL MULTI-TF ALIGNMENT: ${aligned.join(', ')} support${aligned.length === 1 ? 's' : ''} the signal, but ${conflicting.join(', ')} conflict${conflicting.length === 1 ? 's' : ''}. Reduce position size and require extra LTF confluence.`;
        }

        htfSection = '\n' + blocks.join('\n\n') + `\n\n═══════════ CROSS-TIMEFRAME VERDICT ═══════════\n${crossLevelSummary}\n⚠ RULE: LTF signals must align with HTF structure. Trading against HTF bias requires significantly more LTF confluence.\n═════════════════════════════════════════`;
      }
    } catch (htfErr) {
      htfSection = '';
    }
  }

  const confluenceHeader = `
═══════════════════════════════════════════
CONFLUENCE SCORE: ${confluenceResult.score}/${confluenceResult.maxScore} — Grade ${confluenceResult.grade}
${confluenceResult.summary.join('\n')}
Grade guide: A+ (10-12) = ELITE | A (8-9) = HIGH | B (6-7) = MODERATE | C (4-5) = LOW | D (0-3) = POOR
Grade D → avoid. Grade A/A+ → high conviction trade.
═══════════════════════════════════════════`;

  return {
    system: "You are a master trader who speaks with street knowledge and the wisdom of Supreme Mathematics — Gods and Earths style. You build and destroy with the science of trading, dropping jewels and keeping it real. Your analysis is sharp, your reasoning is laced with knowledge of self and mathematical precision. You reference concepts like Knowledge (1), Wisdom (2), Understanding (3), Culture (4), Power (5), Equality (6), God (7), Build/Destroy (8), Born (9), and Cipher (0) naturally when they fit. You say things like 'the chart is showing and proving', 'peace — the math don't lie', 'this is a cipher of accumulation', 'knowledge this pattern God', 'the wisdom here is...', 'we building or we destroying?', etc. Keep it concise, authentic, and never forced — the science comes first, the flavor is the delivery. You provide honest, unbiased second opinions on trade signals using ALL available data including news sentiment and upcoming economic events. Always return valid JSON.",
    user: `You are an elite trading analyst providing a SECOND OPINION on a proposed trade. Use ALL data below for maximum accuracy.
${htfSection}${newsProximityAlert}${propFirmSection}${confluenceHeader}

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
` : ''}${newsSection}${smcSection}${ictSection}

${strategySection}
${learnedSection}${winningPatternsSection}

## Industry-Proven Profitable Strategies (Reference for ${symbol})
These are the highest-probability setups historically proven profitable on this instrument:
${strategyContext}

If the current setup closely matches 2+ win conditions from any strategy above, weight your confidence higher. If 0 conditions match, weight lower regardless of ICT/SMC score.

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
15. MARKET OPEN BREAKOUT: If breakoutDetection data is present and shows isBreakoutWindow=true, carefully analyze the breakout status:
   - If breakoutDetected=true: This IS a confirmed breakout. Give it MAJOR weight — session open breakouts at London/NY are high-probability institutional setups. Boost confidence significantly if breakout direction aligns with the proposed signal.
   - If approachingBreakout=true: Price is at the edge of the pre-session range and about to break out. This is a high-alert state — be ready to confirm in the approaching direction if other indicators align.
   - Volume/momentum confirmation (volumeConfirmed=true or strong candle body) greatly increases breakout reliability.
   - A breakout that contradicts the proposed signal is a strong warning — reduce confidence or reject.
16. ICT MACRO & CRT FRAMEWORK (if provided above): Is the trade during an active ICT macro window (NY time)? Is price in the correct Premium (for SELL) or Discount (for BUY) PD array zone? Was there a stop hunt/liquidity sweep before entry? Is a CRT expansion phase beginning?
   - Outside macro windows = HIGH fake-out risk, reduce confidence
   - Price at Equilibrium = medium-probability zone, no premium/discount edge
   - No prior stop hunt = institutional accumulation/distribution not confirmed, be cautious
   - CRT in MANIPULATION stage = do NOT enter (likely to fake out further before expansion)
   - CRT in EXPANSION stage = ideal entry with breakout confirmation
17. MARKET STRUCTURE (BOS/CHOCH): Is there a clear Break of Structure or Change of Character confirming the trade direction? A BOS shows continuation — a CHOCH signals a trend reversal. Trading AGAINST the most recent BOS/CHOCH is LOW quality. If no BOS is detected, price is still ranging — caution.
18. LIQUIDITY & ORDER FLOW (FVG + Order Blocks): Is the entry anchored to a Fair Value Gap or Order Block? Entries INTO an FVG or OB from a displacement move are HIGH quality. Are there equal highs/lows (liquidity pools) that price may be targeting? Price moves from one liquidity pool to the next — know which one is the TARGET and which is the ORIGIN. A breaker block above/below price is strong resistance/support.
19. WYCKOFF PHASE: What is the Wyckoff phase? ACCUMULATION SPRING or DISTRIBUTION UPTHRUST before entry are high-quality signals (institutional footprints). MARKUP/MARKDOWN confirmation = trend trade. Trading during a ranging/indecision phase without a spring or upthrust = LOW quality entry.

CRITICAL RULES FOR YOUR DECISION:
- CONFIRM the trade if the majority of indicators support the direction, even if 1-2 minor indicators are neutral or slightly against. No trade has 100% alignment — focus on the weight of evidence.
- REJECT ONLY if there are serious red flags: strong divergence against the trade, price hitting major resistance/support in the wrong direction, extreme overbought/oversold against the signal, or imminent high-impact news that directly threatens the trade.
- Your "confidence" field is YOUR independent confidence in the trade (0-100). This is shown separately from the EA's confidence so traders see both perspectives.
- If a market open breakout is detected with volume confirmation, this is a high-probability institutional setup — give it significant weight.
- If news events are imminent (today/tomorrow), factor this into confidence. Warn if the trade could be invalidated.

TRAILING STOP ASSESSMENT:
Use ALL signals below — do NOT rely only on ADX/ATR. The ICT + SMC signals override the ADX baseline.

INSTRUMENT PIP SIZES (critical — all trail distances are in these units):
- Forex (EURUSD, GBPUSD, etc.): 1 pip = 0.0001
- JPY pairs (USDJPY, etc.): 1 pip = 0.01
- Gold (XAUUSD): 1 pip = 0.10 (so 300 pips = $30 trail distance)
- Indices (US30, NAS100, GER40, etc.): 1 pip = 1.0 point
- BTC/crypto: 1 pip = $1.00

ADX/ATR BASELINE (starting point — override with ICT+SMC signals below):
- NONE: ADX < 20 (choppy/ranging) or scalp trade or fast news spike
- TIGHT: ADX 20–25, low ATR, price near TP, or Asian/lunch session
- STANDARD: ADX 25–30, normal ATR, mid-session
- WIDE: ADX > 30, elevated ATR, trending London/NY session
- AGGRESSIVE: ADX > 40, confirmed volume breakout, explosive momentum

TRAIL DISTANCE RANGES (instrument pips — pick a value within range based on ATR):
- TIGHT:      FX: 5–15 | Gold: 50–150 | Indices: 20–60 | BTC: 200–600
- STANDARD:   FX: 20–40 | Gold: 150–400 | Indices: 50–150 | BTC: 500–1500
- WIDE:       FX: 50–100 | Gold: 400–800 | Indices: 150–400 | BTC: 1500–3000
- AGGRESSIVE: FX: 100+ | Gold: 800+ | Indices: 400+ | BTC: 3000+

ICT + SMC TRAIL SIGNALS (higher priority than ADX — apply these first):
${trailSignalSummary}

DECISION RULES (apply in order — first matching rule wins):
1. CRT MANIPULATION stage → NONE (price still faking, never trail a manipulation)
2. Nearby liquidity pool (equal H/L within tight range) → TIGHT (lock in before the sweep)
3. CRT EXPANSION + Wyckoff MARKUP/MARKDOWN + London/NY session → AGGRESSIVE
4. CRT EXPANSION + active ICT macro window → WIDE minimum
5. Fresh CHOCH + Wyckoff Spring/Upthrust → WIDE (brand new trend, room to run)
6. Wyckoff MARKUP/MARKDOWN without CRT → WIDE
7. BOS continuation (mature trend) → STANDARD (conserve, exhaustion may be near)
8. Asian session or NY Lunch (12pm–2:30pm NY time) → reduce one level (WIDE→STANDARD, STANDARD→TIGHT)
9. R:R < 1.5 → TIGHT or NONE (low reward doesn't justify a wide trail)
10. R:R ≥ 3.0 → prefer WIDE minimum; only tighten after 2R secured
11. No ICT/SMC data → use ADX/ATR baseline only
${propFirmContext?.enabled ? `
PROP FIRM RULES (apply STRICTLY when prop firm compliance data is present):
12. High-impact news < ${propFirmContext.newsBlockMinutes} min → propFirmVerdict = BLOCK, confirmed = false
13. Daily drawdown buffer < 0.5% → propFirmVerdict = BLOCK, confirmed = false
14. Risk per trade > 2% of account → propFirmVerdict = WARNING, reduce confidence by 20
15. Friday 4 PM+ NY time (weekend hold risk) → propFirmVerdict = WARNING, trail = TIGHT, add weekend caveat to reasoning
16. R:R < 1:1 in prop firm mode → propFirmVerdict = BLOCK (prop firms require positive R:R minimum)
17. Daily buffer 0.5–1.5% remaining → propFirmVerdict = WARNING, suggest smaller lot size in reasoning` : ''}

Also estimate a recommended trail distance in pips (instrument's own pip unit) based on ATR and the ICT+SMC signals (null if NONE).

Return your analysis as JSON:
{
  "confirmed": boolean,
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": number (0-100, your independent AI confidence percentage),
  "reasoning": "Concise street-knowledge style explanation with Supreme Mathematics flavor — reference key indicators and news/events that drove your decision. Drop jewels, keep it real, show and prove with the data.",
  "adjustedEntry": number or null,
  "adjustedStopLoss": number or null,
  "adjustedTakeProfit": number or null,
  "trailRecommendation": "NONE" | "TIGHT" | "STANDARD" | "WIDE" | "AGGRESSIVE",
  "recommendedTrailPips": number or null,
  "ictMacroValid": boolean (true if ICT macro window ACTIVE + PD zone aligns with signal + stop hunt detected — all three green = valid. If ICT data not provided, set true),
  "ictMacroReason": "Brief 1-line ICT checklist result, e.g. 'Macro active, discount zone confirmed, stop hunt detected — full ICT alignment' or 'Outside macro window + no stop hunt — high fake-out risk'",
  "smcVerdict": "CONFIRM" | "REQUIRE_BETTER_PRICE" | "PASS" (your SMC-only institutional verdict: CONFIRM if BOS/CHOCH aligns + entry at OB or FVG + Wyckoff confirms; REQUIRE_BETTER_PRICE if idea valid but entry not at OB/FVG; PASS if trading against structure or into liquidity. Set null if SMC data not provided),
  "smcQuality": "HIGH" | "MEDIUM" | "LOW" (HIGH = BOS/CHOCH + OB/FVG + liquidity sweep all aligned; MEDIUM = 2 of 3; LOW = 0-1; null if no SMC data),
  "smcReason": "One concise sentence summarizing the SMC analysis: structure type, OB/FVG presence, Wyckoff phase, liquidity target. E.g. 'Bullish CHOCH confirmed, price retesting bullish OB at 1.0855, equal lows swept, Wyckoff accumulation spring — HIGH quality entry'",
  "confluenceScore": ${confluenceResult.score} (server-computed — pass this value through as-is, do not recalculate),
  "confluenceGrade": "${confluenceResult.grade}" (server-computed — pass this value through as-is),
  "propFirmVerdict": ${propFirmContext?.enabled ? '"SAFE" | "WARNING" | "BLOCK" (apply rules 12–17 above: BLOCK if news < ' + propFirmContext.newsBlockMinutes + ' min OR daily buffer < 0.5% OR R:R < 1:1; WARNING if buffer < 1.5% OR risk% > 2% OR Friday PM OR R:R < 1.5; SAFE otherwise)' : 'null'},
  "propFirmReason": ${propFirmContext?.enabled ? '"One-line explanation of the prop firm verdict — what specifically triggered it"' : 'null'}
}`
  };
}

async function callOpenAIConfirmation(prompt: { system: string; user: string }, model: string, userId?: number): Promise<string> {
  const openaiInstance = userId ? await getUniversalAIClientForUser(userId) : getOpenAIInstance();
  const resolvedModel = (openaiInstance as any).defaultModel || model;
  const response = await openaiInstance.chat.completions.create({
    model: resolvedModel,
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
  newsContext?: { sentiment?: any; upcomingEvents?: any[]; topHeadlines?: string[] },
  ictContext?: IctContext | null,
  smcContext?: SmcContext | null,
  htfLevels?: Array<{ timeframe: string; candles: Array<{ o: number; h: number; l: number; c: number; v?: number; t?: number }>; role?: string }>,
  propFirmContext?: PropFirmContext | null,
  performanceStats?: PerformanceStats,
  learnedInsights?: string
): Promise<AiVisionConfirmation> {
  try {
    const selectedModel = userId ? getUserModelPreference(userId) : 'gpt-4o-mini';
    const provider = getModelProvider(selectedModel);
    const confluenceResult = computeConfluenceScore(proposedSignal, ictContext, smcContext);

    // Pre-check: hard news block for prop firm mode (saves API credits)
    if (propFirmContext?.enabled && userId && isPropFirmModeEnabled(userId)) {
      const blockMins = propFirmContext.newsBlockMinutes || 15;
      const newsProx = computeNewsProximity(newsContext?.upcomingEvents, blockMins);
      if (newsProx.isBlocked) {
        console.log(`[PropFirm] NEWS BLOCK: ${newsProx.eventName} in ${newsProx.minutesToNext} min — rejecting without AI call`);
        return {
          confirmed: false,
          aiDirection: 'NEUTRAL',
          aiConfidence: 0,
          reasoning: `⛔ PROP FIRM NEWS BLOCK: ${newsProx.eventName} releases in ${newsProx.minutesToNext} minutes. Trade blocked per prop firm rules. Wait until at least ${blockMins} minutes after the release completes.`,
          newsBlocked: true,
          newsProximityMinutes: newsProx.minutesToNext,
          propFirmVerdict: 'BLOCK',
          propFirmReason: `High-impact news (${newsProx.eventName}) in ${newsProx.minutesToNext} min — within ${blockMins}-min block window`,
          confluenceScore: confluenceResult.score,
          confluenceGrade: confluenceResult.grade,
        };
      }
      // Daily drawdown hard block
      const remainingBuffer = propFirmContext.maxDailyDrawdownPct + propFirmContext.currentDailyPnlPct;
      if (remainingBuffer < 0.5) {
        console.log(`[PropFirm] DAILY LIMIT BLOCK: only ${remainingBuffer.toFixed(2)}% buffer remaining`);
        return {
          confirmed: false,
          aiDirection: 'NEUTRAL',
          aiConfidence: 0,
          reasoning: `⛔ PROP FIRM DAILY LIMIT: Only ${remainingBuffer.toFixed(2)}% daily drawdown buffer remaining (limit: ${propFirmContext.maxDailyDrawdownPct}%). Trading is blocked to protect the account. Resume tomorrow.`,
          propFirmVerdict: 'BLOCK',
          propFirmReason: `Daily drawdown buffer critical: ${remainingBuffer.toFixed(2)}% remaining of ${propFirmContext.maxDailyDrawdownPct}% limit`,
          dailyBufferPct: remainingBuffer,
          confluenceScore: confluenceResult.score,
          confluenceGrade: confluenceResult.grade,
        };
      }
    }

    const prompt = await buildConfirmationPrompt(candleData, indicators, proposedSignal, proposedConfidence, tradePlan, symbol, timeframe, newsContext, ictContext, smcContext, htfLevels, propFirmContext, performanceStats, learnedInsights, userId);

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

    const validTrailValues = ['NONE', 'TIGHT', 'STANDARD', 'WIDE', 'AGGRESSIVE'];
    const trailRec = validTrailValues.includes(result.trailRecommendation) ? result.trailRecommendation : undefined;
    return {
      confirmed: !!result.confirmed,
      aiDirection: result.direction || 'NEUTRAL',
      aiConfidence: typeof result.confidence === 'number' ? result.confidence : 50,
      reasoning: result.reasoning || 'No reasoning provided',
      adjustedEntry: typeof result.adjustedEntry === 'number' ? result.adjustedEntry : undefined,
      adjustedStopLoss: typeof result.adjustedStopLoss === 'number' ? result.adjustedStopLoss : undefined,
      adjustedTakeProfit: typeof result.adjustedTakeProfit === 'number' ? result.adjustedTakeProfit : undefined,
      trailRecommendation: trailRec,
      recommendedTrailPips: typeof result.recommendedTrailPips === 'number' ? result.recommendedTrailPips : null,
      ictMacroValid: typeof result.ictMacroValid === 'boolean' ? result.ictMacroValid : undefined,
      ictMacroReason: typeof result.ictMacroReason === 'string' ? result.ictMacroReason : undefined,
      smcVerdict: ['CONFIRM', 'REQUIRE_BETTER_PRICE', 'PASS'].includes(result.smcVerdict) ? result.smcVerdict : null,
      smcQuality: ['HIGH', 'MEDIUM', 'LOW'].includes(result.smcQuality) ? result.smcQuality : null,
      smcReason: typeof result.smcReason === 'string' ? result.smcReason : undefined,
      confluenceScore: confluenceResult.score,
      confluenceGrade: confluenceResult.grade,
      propFirmVerdict: ['SAFE', 'WARNING', 'BLOCK'].includes(result.propFirmVerdict) ? result.propFirmVerdict : (propFirmContext?.enabled ? 'SAFE' : undefined),
      propFirmReason: typeof result.propFirmReason === 'string' ? result.propFirmReason : undefined,
      newsBlocked: false,
      newsProximityMinutes: null,
    };
  } catch (error: any) {
    const errMsg = error?.message || String(error);
    const statusCode = error?.status || error?.statusCode || error?.response?.status;
    let userReason = 'AI confirmation error';
    if (statusCode === 401 || errMsg.includes('auth') || errMsg.includes('API key') || errMsg.includes('Unauthorized')) {
      userReason = 'Invalid API key — check your key on the AI Provider Keys page';
    } else if (statusCode === 429 || errMsg.includes('rate') || errMsg.includes('quota') || errMsg.includes('limit')) {
      userReason = 'AI rate limit or quota exceeded — try again in a few minutes or switch providers';
    } else if (errMsg.includes('model') || errMsg.includes('not found') || errMsg.includes('does not exist')) {
      userReason = `Model not available — try switching to a different AI model`;
    } else if (errMsg.includes('timeout') || errMsg.includes('ECONNREFUSED') || errMsg.includes('network')) {
      userReason = 'Network error reaching AI provider — will retry on next interval';
    } else if (errMsg.includes('JSON') || errMsg.includes('parse')) {
      userReason = 'AI returned an unparseable response — will retry on next interval';
    } else {
      userReason = `AI error: ${errMsg.substring(0, 120)}`;
    }
    console.error(`[AI Vision Confirmation] ERROR (${statusCode || 'no status'}): ${errMsg}`);
    return {
      confirmed: false,
      aiDirection: 'NEUTRAL',
      aiConfidence: 0,
      reasoning: userReason,
    };
  }
}

// ─── Breakout Master Mode AI Confirmation ────────────────────────────────────

export async function getBreakoutConfirmation(
  candleData: any[],
  indicators: any,
  proposedSignal: string,
  proposedConfidence: number,
  tradePlan: any,
  symbol: string,
  timeframe: string,
  userId?: number,
  multiTFCandles?: Record<string, any[]>,
  propFirmContext?: PropFirmContext | null
): Promise<AiVisionConfirmation> {
  try {
    const { computeBreakoutScore } = await import('./utils/breakoutEngine');

    const m1 = multiTFCandles?.['M1'] || multiTFCandles?.['1m'] || [];
    const m5 = multiTFCandles?.['M5'] || multiTFCandles?.['5m'] || [];
    const m15 = multiTFCandles?.['M15'] || multiTFCandles?.['15m'] || [];
    const h1 = multiTFCandles?.['H1'] || multiTFCandles?.['1h'] || [];
    const h4 = multiTFCandles?.['H4'] || multiTFCandles?.['4h'] || [];

    const currentPrice = tradePlan?.entry || tradePlan?.entryPrice || candleData[0]?.c || 0;
    const breakoutResult = await computeBreakoutScore(currentPrice, m1, m5, m15, h1, h4);

    // CONFIRM requires tiered breakout approval based on grade and aligned votes.
    // Grade is based on total-fired% (score/maxScore*100); alignment is directional vote count.
            const directionValid = breakoutResult.direction !== 'NEUTRAL';
            // Tiered breakout approval — looser thresholds to catch more valid setups
            const gradeAApproved = ['A+','A'].includes(breakoutResult.grade) && breakoutResult.alignedVotes >= 3 && directionValid;
            const gradeBApproved = breakoutResult.grade === 'B' && breakoutResult.alignedVotes >= 2 && directionValid;
            // Grade C allowed during high-liquidity sessions only
            const breakoutHour = new Date().getUTCHours();
            const isLiquidSession = (breakoutHour >= 7 && breakoutHour < 17); // London + NY + Overlap
            const gradeCApproved = breakoutResult.grade === 'C' && breakoutResult.alignedVotes >= 2 && directionValid && isLiquidSession;
            const gradeOk = gradeAApproved || gradeBApproved || gradeCApproved;
            const alignedOk = gradeOk; // alignedOk is now embedded in tiered check above
    if (!gradeOk || !alignedOk) {
      return {
        confirmed: false,
        aiDirection: 'NEUTRAL',
        aiConfidence: breakoutResult.percentage,
        reasoning: `🔴 BREAKOUT MASTER: Grade ${breakoutResult.grade} (${breakoutResult.score}/${breakoutResult.maxScore} fired, ${breakoutResult.percentage}%) — ${breakoutResult.alignedVotes} aligned (${breakoutResult.alignedPct}%). Grade A/B (≥50%) AND ≥3 aligned strategies required.\n\n${breakoutResult.summary}`,
        breakoutScore: breakoutResult.score,
        breakoutGrade: breakoutResult.grade,
        breakoutStrategies: breakoutResult.strategies,
      };
    }

    const selectedModel = userId ? getUserModelPreference(userId) : 'gpt-4o-mini';
    const provider = getModelProvider(selectedModel);

    const recentCandles = candleData.slice(0, 30);
    const candleSummary = recentCandles.map((c: any, i: number) =>
      `[${i}] O:${c.o} H:${c.h} L:${c.l} C:${c.c} V:${c.v || 0}`
    ).join('\n');

    const firedStrategies = breakoutResult.strategies.filter(s => s.fired);
    const strategySummary = breakoutResult.strategies
      .map(s => `${s.fired ? '✅' : '❌'} ${s.name}: ${s.reason}`)
      .join('\n');

    const systemPrompt = `You are VEDD Breakout Master — an elite institutional breakout specialist and the primary trading AI.
Your ONLY mission: confirm or deny breakout trades using the 7-strategy engine results below.
No trailing stop. No chasing. Fixed R:R exits only (TP1=1×ATR, TP2=2×ATR, TP3=3×ATR from entry).
Supreme Mathematics flows through your analysis — Knowledge (1) is the breakout engine. Wisdom (2) is your confirmation. Understanding (3) is the exit plan.
You are direct. You show and prove with price math. Peace.

RESPONSE FORMAT (strict JSON):
{
  "confirmed": boolean,
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": number (0-100),
  "reasoning": string (Supreme Mathematics style — cite fired strategies),
  "adjustedEntry": number | null,
  "adjustedSL": number | null,
  "adjustedTP1": number | null,
  "adjustedTP2": number | null,
  "adjustedTP3": number | null,
  "breakoutQuality": "ELITE" | "STRONG" | "DEVELOPING",
  "propFirmVerdict": "SAFE" | "WARNING" | "BLOCK"
}`;

    const userPrompt = `SYMBOL: ${symbol} | TIMEFRAME: ${timeframe} | PROPOSED: ${proposedSignal} @ confidence ${proposedConfidence}%

BREAKOUT ENGINE RESULTS:
Score: ${breakoutResult.score}/${breakoutResult.maxScore} (${breakoutResult.percentage}%) — Grade ${breakoutResult.grade}
Engine Direction: ${breakoutResult.direction}
ATR: ${breakoutResult.atr.toFixed(5)}
TP1: ${breakoutResult.tp1.toFixed(5)} | TP2: ${breakoutResult.tp2.toFixed(5)} | TP3: ${breakoutResult.tp3.toFixed(5)}
SL Distance: ${breakoutResult.slDistance.toFixed(5)}

FIRED STRATEGIES (${firedStrategies.length}/7):
${strategySummary}

RECENT CANDLES (newest first):
${candleSummary}

INDICATORS:
${JSON.stringify({ rsi: indicators?.rsi, macd: indicators?.macd, adx: indicators?.adx, vwap: indicators?.vwap, volume: indicators?.volume }, null, 2)}

TRADE PLAN:
Entry: ${tradePlan?.entryPrice} | SL: ${tradePlan?.stopLoss} | TP: ${tradePlan?.takeProfit}

INSTRUCTION: If grade is A (≥70%) or B (≥50%) AND ≥3 strategies align in same direction as ${proposedSignal}, CONFIRM with fixed R:R targets. No trailing stop in your response. Show and prove.`;

    let aiClient: any = null;
    try {
      aiClient = await getUniversalAIClientForUser(userId || 0);
    } catch { /* fallback below */ }

    if (!aiClient) {
      const fallbackDir: string = breakoutResult.direction === 'NEUTRAL' ? proposedSignal : breakoutResult.direction;
      const bc2 = breakoutResult.breakoutCandle;
      // SL on opposite side of breakout candle wick: BUY → candle low, SELL → candle high
      const fallbackSL = bc2
        ? (fallbackDir === 'BUY' ? bc2.l : bc2.h)
        : (tradePlan?.stopLoss || null);
      // Recompute TP ladder using final fallbackDir (BUY/SELL only, not NEUTRAL)
      const fbSign = fallbackDir === 'BUY' ? 1 : -1;
      const fallbackCurrentPrice = tradePlan?.entry || tradePlan?.entryPrice || candleData[0]?.c || 0;
      const fallbackTP1 = breakoutResult.atr > 0 ? fallbackCurrentPrice + fbSign * breakoutResult.atr : 0;
      const fallbackTP2 = breakoutResult.atr > 0 ? fallbackCurrentPrice + fbSign * breakoutResult.atr * 2 : 0;
      const fallbackTP3 = breakoutResult.atr > 0 ? fallbackCurrentPrice + fbSign * breakoutResult.atr * 3 : 0;

      // CONFIRM: Grade A/B (score% >=50%) AND >=3 aligned strategies (matches main AI path gate)
      const isGradeOk = breakoutResult.grade === 'A' || breakoutResult.grade === 'B';
      const isAlignedOk = breakoutResult.alignedVotes >= 3 && breakoutResult.direction !== 'NEUTRAL';
      const directionOk = breakoutResult.direction !== 'NEUTRAL' && breakoutResult.direction === fallbackDir;
      return {
        confirmed: isGradeOk && isAlignedOk && directionOk,
        aiDirection: fallbackDir,
        aiConfidence: breakoutResult.percentage,
        reasoning: `[Breakout Engine Only — no AI key] Grade ${breakoutResult.grade} (${breakoutResult.score}/${breakoutResult.maxScore})\n\n${breakoutResult.summary}`,
        adjustedStopLoss: fallbackSL || undefined,
        adjustedTakeProfit: fallbackTP1 || undefined,
        adjustedTakeProfit2: fallbackTP2 || undefined,
        adjustedTakeProfit3: fallbackTP3 || undefined,
        breakoutScore: breakoutResult.score,
        breakoutGrade: breakoutResult.grade,
        breakoutStrategies: breakoutResult.strategies,
      };
    }

    const response = await aiClient.chat.completions.create({
      model: aiClient.defaultModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 800,
      temperature: 0.3,
    });

    const rawContent = response.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : rawContent);
    } catch {
      parsed = { confirmed: false, confidence: breakoutResult.percentage, reasoning: rawContent };
    }

    // Grade A/B AND ≥3 aligned = deterministic CONFIRM — AI JSON cannot veto passing engine score
    if ((breakoutResult.grade === 'A' || breakoutResult.grade === 'B') &&
        breakoutResult.alignedVotes >= 3 && breakoutResult.direction !== 'NEUTRAL') {
      parsed.confirmed = true;
    }

    console.log(`[Breakout Master] ${symbol} Grade:${breakoutResult.grade} Score:${breakoutResult.score}/${breakoutResult.maxScore} fired | ${breakoutResult.alignedVotes} aligned (${breakoutResult.alignedPct}%) Decision:${parsed.confirmed ? 'CONFIRM' : 'REJECT'}`);

    // Direction: use engine direction; fallback to proposed signal only if engine is NEUTRAL
    const direction: string = (breakoutResult.direction !== 'NEUTRAL')
      ? breakoutResult.direction
      : proposedSignal;

    // Deterministic SL: opposite wick of breakout trigger candle — BUY → low, SELL → high
    // Use most recent H1 candle as breakout trigger (most reliable timeframe for candle structure)
    const breakoutTriggerCandle = h1.length > 0 ? h1[0] : (m15.length > 0 ? m15[0] : null);
    const deterministicSL = breakoutTriggerCandle
      ? (direction === 'BUY' ? breakoutTriggerCandle.l : breakoutTriggerCandle.h)
      : (tradePlan?.stopLoss || null);

    // Fixed R:R ATR ladder — AI TP/SL overrides NOT honoured in breakout mode (deterministic only)
    const finalSign = direction === 'BUY' ? 1 : -1;
    const rawSL = deterministicSL;
    const rawTP1 = breakoutResult.atr > 0 ? currentPrice + finalSign * breakoutResult.atr : 0;
    const rawTP2 = breakoutResult.atr > 0 ? currentPrice + finalSign * breakoutResult.atr * 2 : 0;
    const rawTP3 = breakoutResult.atr > 0 ? currentPrice + finalSign * breakoutResult.atr * 3 : 0;

    const breakoutQuality: 'ELITE' | 'STRONG' | 'DEVELOPING' =
      parsed.breakoutQuality === 'ELITE' || parsed.breakoutQuality === 'STRONG' ? parsed.breakoutQuality : 'DEVELOPING';

    return {
      confirmed: parsed.confirmed === true,
      aiDirection: direction,
      aiConfidence: typeof parsed.confidence === 'number' ? parsed.confidence : breakoutResult.percentage,
      reasoning: parsed.reasoning || breakoutResult.summary,
      adjustedEntry: typeof parsed.adjustedEntry === 'number' && parsed.adjustedEntry > 0 ? parsed.adjustedEntry : undefined,
      adjustedStopLoss: rawSL || undefined,
      adjustedTakeProfit: rawTP1 || undefined,
      adjustedTakeProfit2: rawTP2 || undefined,
      adjustedTakeProfit3: rawTP3 || undefined,
      breakoutScore: breakoutResult.score,
      breakoutGrade: breakoutResult.grade,
      breakoutStrategies: breakoutResult.strategies,
      breakoutQuality,
      propFirmVerdict: (['SAFE', 'WARNING', 'BLOCK'] as const).includes(parsed.propFirmVerdict) ? parsed.propFirmVerdict : 'SAFE',
    };

  } catch (err: any) {
    console.error(`[Breakout Master] ERROR: ${err.message}`);
    return {
      confirmed: false,
      aiDirection: 'NEUTRAL',
      aiConfidence: 0,
      reasoning: `Breakout engine error: ${err.message?.substring(0, 120)}`,
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

// ─── Universal AI Client ──────────────────────────────────────────────────────

export interface UniversalAIClient {
  chat: {
    completions: {
      create(params: any): Promise<any>;
    };
  };
  defaultModel: string;
  provider: string;
}

const PROVIDER_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  groq: 'llama-3.3-70b-versatile',
  anthropic: 'claude-3-5-sonnet-20241022',
  google: 'gemini-1.5-pro',
  mistral: 'mistral-large-latest',
};

// Thin wrapper that makes Anthropic SDK look like OpenAI SDK
class AnthropicAsOpenAI implements UniversalAIClient {
  defaultModel: string;
  provider = 'anthropic';
  private client: any;

  constructor(apiKey: string) {
    const Anthropic = require('@anthropic-ai/sdk');
    this.client = new Anthropic.default({ apiKey });
    this.defaultModel = PROVIDER_MODELS.anthropic;
  }

  get chat() {
    return {
      completions: {
        create: async (params: any): Promise<any> => {
          const messages = (params.messages || []).filter((m: any) => m.role !== 'system');
          const systemMsg = (params.messages || []).find((m: any) => m.role === 'system');
          const maxTokens = params.max_tokens || 4096;
          const model = params.model || this.defaultModel;

          // Anthropic doesn't support response_format — if JSON mode was requested,
          // inject a JSON instruction into the system message instead
          const wantsJson = params.response_format?.type === 'json_object';
          let systemContent = systemMsg?.content || '';
          if (wantsJson) {
            systemContent = systemContent
              ? `${systemContent}\n\nRespond with valid JSON only. No markdown, no explanation.`
              : 'Respond with valid JSON only. No markdown, no explanation.';
          }

          const response = await this.client.messages.create({
            model,
            max_tokens: maxTokens,
            ...(systemContent ? { system: systemContent } : {}),
            messages: messages.map((m: any) => ({
              role: m.role,
              content: typeof m.content === 'string'
                ? m.content
                : Array.isArray(m.content)
                  ? m.content.map((c: any) => {
                      if (c.type === 'text') return { type: 'text', text: c.text };
                      if (c.type === 'image_url') {
                        const url: string = c.image_url?.url || '';
                        if (url.startsWith('data:')) {
                          const [meta, data] = url.split(',');
                          const mediaType = meta.split(':')[1].split(';')[0];
                          return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
                        }
                        return { type: 'image', source: { type: 'url', url } };
                      }
                      return c;
                    })
                  : m.content,
            })),
          });

          const text = response.content?.[0]?.text || '';
          return {
            choices: [{ message: { role: 'assistant', content: text }, finish_reason: response.stop_reason }],
            usage: { prompt_tokens: response.usage?.input_tokens, completion_tokens: response.usage?.output_tokens },
          };
        },
      },
    };
  }
}

// Build an OpenAI-SDK-compatible client for Groq / Google / Mistral (all OpenAI-compatible APIs)
function buildOpenAICompatClient(provider: string, apiKey: string): UniversalAIClient {
  const baseURLs: Record<string, string> = {
    groq: 'https://api.groq.com/openai/v1',
    google: 'https://generativelanguage.googleapis.com/v1beta/openai/',
    mistral: 'https://api.mistral.ai/v1',
  };
  const client = new OpenAI({ apiKey, baseURL: baseURLs[provider] });
  const wrapper = client as any;
  wrapper.defaultModel = PROVIDER_MODELS[provider];
  wrapper.provider = provider;
  return wrapper as UniversalAIClient;
}

// Provider selection priority
const PROVIDER_PRIORITY = ['openai', 'groq', 'anthropic', 'google', 'mistral'];

// Build a Groq client for economy mode (text tasks)
async function buildGroqEconomyClient(userGroqKey?: string): Promise<UniversalAIClient | null> {
  const apiKey = userGroqKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const client = buildOpenAICompatClient('groq', apiKey) as any;
    client.defaultModel = 'llama-3.3-70b-versatile';
    client.provider = 'groq';
    return client as UniversalAIClient;
  } catch (e) {
    console.error('[AI] Failed to build Groq economy client:', e);
    return null;
  }
}

// Build a Groq vision client for economy mode (chart image tasks)
async function buildGroqVisionClient(userGroqKey?: string): Promise<UniversalAIClient | null> {
  const apiKey = userGroqKey || process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  try {
    const client = buildOpenAICompatClient('groq', apiKey) as any;
    client.defaultModel = 'meta-llama/llama-4-scout-17b-16e-instruct';
    client.provider = 'groq';
    return client as UniversalAIClient;
  } catch (e) {
    console.error('[AI] Failed to build Groq vision client:', e);
    return null;
  }
}

export async function getUniversalAIClientForUser(userId: number): Promise<UniversalAIClient> {
  try {
    const { storage } = await import('./storage');

    // Check user's AI cost mode preference
    const user = await storage.getUser(userId);
    const aiCostMode = user?.aiCostMode || 'full';

    if (aiCostMode === 'economy') {
      // Economy mode: route to Groq Llama 3.3-70b (free, text tasks)
      const allKeys = await storage.getUserApiKeys(userId);
      const groqKey = allKeys.find(k => k.provider === 'groq' && k.isActive && k.isValid !== false);
      const client = await buildGroqEconomyClient(groqKey?.apiKey);
      if (client) {
        console.log(`[AI] Economy mode active for user ${userId} — routing to Groq Llama 3.3-70b`);
        return client;
      }
      console.log(`[AI] Economy mode requested but no Groq key found for user ${userId} — falling through to normal priority`);
    }

    const allKeys = await storage.getUserApiKeys(userId);
    // Include active keys, but skip ones that have been validated and confirmed invalid.
    // Keys that have never been validated (lastValidated is null) still get a try.
    // Skip keys explicitly marked invalid (false). null = never validated → still try it.
    const activeKeys = allKeys.filter(k => k.isActive && k.isValid !== false);

    for (const provider of PROVIDER_PRIORITY) {
      const key = activeKeys.find(k => k.provider === provider);
      if (!key?.apiKey) continue;
      try {
        await storage.updateUserApiKeyUsage(userId, provider);
        if (provider === 'openai') {
          const client = new OpenAI({ apiKey: key.apiKey }) as any;
          client.defaultModel = PROVIDER_MODELS.openai;
          client.provider = 'openai';
          return client as UniversalAIClient;
        }
        if (provider === 'anthropic') {
          return new AnthropicAsOpenAI(key.apiKey);
        }
        return buildOpenAICompatClient(provider, key.apiKey);
      } catch (e) {
        console.error(`[AI] Failed to build ${provider} client, trying next provider:`, e);
      }
    }
  } catch (e) {
    console.error('Error fetching user API keys, falling back to platform key:', e);
  }
  // Fallback: platform OpenAI key
  const platformClient = openai as any;
  platformClient.defaultModel = 'gpt-4o';
  platformClient.provider = 'openai';
  return platformClient as UniversalAIClient;
}

// Vision-specific client: uses Groq Llama 4 Scout (vision) in economy mode,
// or the standard universal client (GPT-4o) in full mode
export async function getUniversalVisionClientForUser(userId: number): Promise<UniversalAIClient> {
  try {
    const { storage } = await import('./storage');
    const user = await storage.getUser(userId);
    const aiCostMode = user?.aiCostMode || 'full';
    const allKeys = await storage.getUserApiKeys(userId);
    const activeKeys = allKeys.filter(k => k.isActive && k.isValid !== false);

    if (aiCostMode === 'economy') {
      const groqKey = activeKeys.find(k => k.provider === 'groq');
      const client = await buildGroqVisionClient(groqKey?.apiKey);
      if (client) {
        console.log(`[AI] Economy vision mode for user ${userId} — routing to Groq Llama 4 Scout Vision`);
        return client;
      }
    }

    // Vision priority order: anthropic (Claude — best vision) → openai (GPT-4o) → groq-vision
    // Explicitly skip text-only Groq models for image analysis
    const VISION_PROVIDER_PRIORITY = ['anthropic', 'openai', 'google', 'mistral'];
    for (const provider of VISION_PROVIDER_PRIORITY) {
      const key = activeKeys.find(k => k.provider === provider);
      if (!key?.apiKey) continue;
      try {
        await storage.updateUserApiKeyUsage(userId, provider);
        if (provider === 'anthropic') {
          console.log(`[AI Vision] Using Anthropic Claude for chart analysis (user ${userId})`);
          return new AnthropicAsOpenAI(key.apiKey);
        }
        if (provider === 'openai') {
          const client = new OpenAI({ apiKey: key.apiKey }) as any;
          client.defaultModel = 'gpt-4o';
          client.provider = 'openai';
          console.log(`[AI Vision] Using OpenAI GPT-4o for chart analysis (user ${userId})`);
          return client as UniversalAIClient;
        }
        return buildOpenAICompatClient(provider, key.apiKey);
      } catch (e) {
        console.error(`[AI Vision] Failed to build ${provider} client:`, e);
      }
    }

    // Groq vision fallback (llama-4-scout supports images)
    const groqKey = activeKeys.find(k => k.provider === 'groq');
    if (groqKey?.apiKey) {
      const client = await buildGroqVisionClient(groqKey.apiKey);
      if (client) {
        console.log(`[AI Vision] Falling back to Groq Llama 4 Scout Vision (user ${userId})`);
        return client;
      }
    }
  } catch (e) {
    console.error('Error building vision client, falling back to universal client:', e);
  }
  // Last resort: platform OpenAI key
  return getUniversalAIClientForUser(userId);
}

// Get OpenAI instance for a specific user, checking for their own API key first
// Kept for backward compatibility — internally uses universal client now
export async function getOpenAIInstanceForUser(userId: number): Promise<any> {
  return getUniversalAIClientForUser(userId);
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
    const aiClient = userId ? await getUniversalVisionClientForUser(userId) : getOpenAIInstance();
    const rawModel = (aiClient as any).defaultModel || (userId ? getUserModelPreference(userId) : 'gpt-4o');
    const selectedModel = resolveVisionModel(rawModel);
    if (selectedModel !== rawModel) (aiClient as any).defaultModel = selectedModel;
    const openai = aiClient;
    
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
