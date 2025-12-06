import { createHash } from 'crypto';
import { 
  MarketDataProvider, 
  MarketDataRequest, 
  OHLCVBar, 
  AssetType,
  PatternChangeResult 
} from './types';
import { marketDataCache } from './cache';
import { patternChangeDetector } from './pattern-change-detector';
import { TwelveDataProvider } from './providers/twelve-data';

class MarketDataService {
  private providers: Map<string, MarketDataProvider> = new Map();
  private primaryProvider: MarketDataProvider | null = null;
  
  registerProvider(provider: MarketDataProvider, isPrimary: boolean = false): void {
    this.providers.set(provider.name, provider);
    if (isPrimary || !this.primaryProvider) {
      this.primaryProvider = provider;
    }
  }
  
  getProvider(name: string): MarketDataProvider | undefined {
    return this.providers.get(name);
  }
  
  private selectProvider(assetType: AssetType): MarketDataProvider | null {
    for (const [_, provider] of this.providers) {
      if (provider.supportedAssets.includes(assetType)) {
        return provider;
      }
    }
    return this.primaryProvider;
  }
  
  private generateHash(bars: OHLCVBar[]): string {
    const data = bars.map(b => `${b.timestamp}:${b.close}`).join('|');
    return createHash('md5').update(data).digest('hex');
  }
  
  async fetchMarketData(request: MarketDataRequest): Promise<{
    bars: OHLCVBar[];
    provider: string;
    hash: string;
    fromCache: boolean;
  }> {
    const provider = this.selectProvider(request.assetType);
    if (!provider) {
      throw new Error(`No provider available for asset type: ${request.assetType}`);
    }
    
    const cached = marketDataCache.get<OHLCVBar[]>(
      request.symbol, 
      request.timeframe, 
      provider.name
    );
    
    if (cached) {
      return {
        bars: cached,
        provider: provider.name,
        hash: this.generateHash(cached),
        fromCache: true
      };
    }
    
    const bars = await provider.fetchOHLCV(request);
    const hash = this.generateHash(bars);
    
    const ttl = marketDataCache.getTTLForTimeframe(request.timeframe);
    marketDataCache.set(request.symbol, request.timeframe, provider.name, bars, ttl);
    
    return {
      bars,
      provider: provider.name,
      hash,
      fromCache: false
    };
  }
  
  async checkForPatternChange(
    symbol: string,
    assetType: AssetType,
    timeframe: string,
    previousBars: OHLCVBar[]
  ): Promise<{
    patternChange: PatternChangeResult;
    newBars: OHLCVBar[];
    hash: string;
  }> {
    const result = await this.fetchMarketData({
      symbol,
      assetType,
      timeframe: timeframe as any,
      limit: 50
    });
    
    const patternChange = patternChangeDetector.compareSnapshots(previousBars, result.bars);
    
    return {
      patternChange,
      newBars: result.bars,
      hash: result.hash
    };
  }
  
  detectAssetType(symbol: string): AssetType {
    const upper = symbol.toUpperCase();
    
    const forexPairs = ['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
    const forexPattern = forexPairs.some(c => upper.startsWith(c) || upper.includes(`/${c}`));
    if (forexPattern && (upper.length === 6 || upper.includes('/'))) {
      return 'forex';
    }
    
    const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC'];
    if (cryptoSymbols.some(c => upper.startsWith(c))) {
      return 'crypto';
    }
    
    const indices = ['SPX', 'NDX', 'DJI', 'VIX', 'FTSE', 'DAX', 'NI225'];
    if (indices.some(i => upper.includes(i))) {
      return 'index';
    }
    
    return 'stock';
  }
  
  isInitialized(): boolean {
    return this.providers.size > 0;
  }
}

export const marketDataService = new MarketDataService();

export function initializeMarketDataService(): void {
  const twelveDataKey = process.env.TWELVE_DATA_API_KEY;
  
  if (twelveDataKey) {
    const twelveData = new TwelveDataProvider(twelveDataKey);
    marketDataService.registerProvider(twelveData, true);
    console.log('Market data service initialized with Twelve Data provider');
  } else {
    console.log('Market data service: No TWELVE_DATA_API_KEY found, service not initialized');
  }
}
