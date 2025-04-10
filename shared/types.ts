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
  patterns: Pattern[];
  indicators: Indicator[];
  supportResistance: SupportResistanceLevel[];
  timeframeAnalysis: TimeframeAnalysis[];
  volumeAnalysis: VolumeAnalysis[];
  recommendation: string;
  steps: string[];
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
