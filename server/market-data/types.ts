export type AssetType = 'forex' | 'stock' | 'crypto' | 'index';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w';

export interface OHLCVBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface MarketDataSnapshot {
  symbol: string;
  assetType: AssetType;
  timeframe: Timeframe;
  provider: string;
  bars: OHLCVBar[];
  capturedAt: Date;
  hash: string;
}

export interface MarketDataRequest {
  symbol: string;
  assetType: AssetType;
  timeframe: Timeframe;
  limit?: number;
}

export interface MarketDataProvider {
  name: string;
  supportedAssets: AssetType[];
  
  fetchOHLCV(request: MarketDataRequest): Promise<OHLCVBar[]>;
  
  isSymbolSupported(symbol: string, assetType: AssetType): boolean;
}

export interface PatternChangeResult {
  hasSignificantChange: boolean;
  volatilityDelta: number;
  atrChange: number;
  priceChangePercent: number;
  trendReversal: boolean;
  details: string;
}

export interface RefreshJobResult {
  eaId: number;
  success: boolean;
  patternChange: PatternChangeResult | null;
  aiReanalysisTriggered: boolean;
  newConfidence?: string;
  newDirection?: string;
  error?: string;
}

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttlMs: number;
}

export interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  retryAfterMs: number;
}
