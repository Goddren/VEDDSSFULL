export interface Pattern {
  name: string;
  description: string;
  strength: string;
  type: string;
  details: string;
}

export interface Indicator {
  name: string;
  type: string;
  signal: string;
  details: string;
}

export interface SupportResistanceLevel {
  type: string;
  strength: string;
  level: string;
}

export interface TimeframeAnalysis {
  timeframe: string;
  trend: string;
}

export interface VolumeAnalysis {
  period: string;
  volume: string;
  activity: string;
  quality: string;
}

export interface VolatilityData {
  score: number;              // Overall volatility score (0-100)
  atr: number;                // Average True Range
  standardDeviation: number;  // Standard deviation of price movements
  range: number;              // Range between high and low
  historicalRank: number;     // Where current volatility ranks historically (0-100)
  riskFactor: number;         // Risk factor based on volatility (0-100)
}

export interface TrendCell {
  pair: string;               // Currency or trading pair (e.g., "EUR/USD")
  probability: number;        // Likelihood of trend direction (0-100)
  direction: 'bullish' | 'bearish' | 'neutral';  // Market trend direction
  strength: number;           // Strength of the trend signal (0-100)
  timestamp: number;          // Timestamp when prediction was made
}

export interface MarketTrendData {
  trends: TrendCell[];        // Array of trend predictions for different pairs
  lastUpdated: number;        // Timestamp of last data update
  source: string;             // Source of prediction (AI model, etc.)
}

export interface ATRStopLossOptions {
  atrValue: string;
  atr1x: string;
  atr15x: string;
  atr2x: string;
  recommended: string;
}

export interface MomentumIndicators {
  rsi?: { value: string; signal: string; interpretation: string };
  macd?: { value: string; signal: string; interpretation: string };
  stochastic?: { value: string; signal: string; interpretation: string };
  volumeTrend?: { direction: string; strength: string; interpretation: string };
}

export interface ChartAnalysisResponse {
  symbol: string;
  timeframe: string;
  currentPrice: string;
  direction: string;
  trend: string;
  confidence: string;
  entryPoint: string;
  exitPoint: string;
  stopLoss: string;
  takeProfit: string;
  riskRewardRatio: string;
  potentialPips: string;
  volatilityScore: number;
  volatilityData: VolatilityData;
  atrStopLoss?: ATRStopLossOptions;
  momentumIndicators?: MomentumIndicators;
  marketTrends?: TrendCell[];  // Optional market trend data for related pairs
  patterns: Pattern[];
  indicators: Indicator[];
  supportResistance: SupportResistanceLevel[];
  timeframeAnalysis: TimeframeAnalysis[];
  volumeAnalysis: VolumeAnalysis[];
  recommendation: string;
  steps: string[];
  imageUrl?: string;  // URL to the saved chart image
  annotatedImageUrl?: string;  // URL to the trade setup annotated chart image
}

export interface ImageUploadResponse {
  url: string;
}

export enum AnalysisState {
  INITIAL = "initial",
  UPLOADING = "uploading",
  ANALYZING = "analyzing",
  COMPLETE = "complete",
  ERROR = "error"
}

export interface AnalysisProgress {
  step: number;
  message: string;
  completed: boolean;
}

export const analysisPipeline = [
  { id: "processing", name: "Processing image", message: "Converting and optimizing your chart image" },
  { id: "identifying", name: "Identifying chart elements", message: "Detecting candlesticks, indicators, and drawing tools" },
  { id: "extracting", name: "Extracting price data", message: "Reading price levels, timeframes, and market context" },
  { id: "analyzing", name: "Analyzing patterns and indicators", message: "Identifying key patterns, trend strength and signals" },
  { id: "support-resistance", name: "Detecting support/resistance", message: "Finding key support and resistance levels" },
  { id: "volume-analysis", name: "Analyzing volume patterns", message: "Determining optimal trading sessions based on volume" },
  { id: "volatility-analysis", name: "Measuring volatility", message: "Calculating market volatility score and risk assessment" },
  { id: "generating", name: "Generating recommendations", message: "Calculating entry/exit points and risk metrics" }
];
