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
  patterns: Pattern[];
  indicators: Indicator[];
  supportResistance: SupportResistanceLevel[];
  timeframeAnalysis: TimeframeAnalysis[];
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
  { id: 1, name: "Processing image" },
  { id: 2, name: "Identifying chart elements" },
  { id: 3, name: "Extracting price data" },
  { id: 4, name: "Analyzing patterns and indicators" },
  { id: 5, name: "Generating recommendations" }
];
