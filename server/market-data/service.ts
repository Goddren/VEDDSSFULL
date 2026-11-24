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
import { fetchIndexFromYahoo, logIndexSource } from './yahoo-index';

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
    const values = Array.from(this.providers.values());
    for (const provider of values) {
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
    // Index symbols take a dedicated path (Yahoo-primary — see below).
    // Every other asset type keeps the exact flow it has always had.
    if (request.assetType === 'index') {
      return this.fetchIndexMarketData(request);
    }
    const provider = this.selectProvider(request.assetType);
    if (!provider) {
      const yb = await fetchIndexFromYahoo(request).catch(() => null);
      if (yb && yb.length) return { bars: yb, provider: 'yahoo-index', hash: this.generateHash(yb), fromCache: false };
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
    
    let bars: OHLCVBar[];
    try {
      bars = await provider.fetchOHLCV(request);
    } catch (err) {
      // Indices (US30, US500, NAS100, GER40…) aren't on every Twelve Data plan
      // — US30 returned 404 on every scan, so the engine could never trade it
      // (2026-10-19). Fall back to Yahoo's cash-index candles for those only.
      const yb = await fetchIndexFromYahoo(request).catch(() => null);
      if (!yb || !yb.length) throw err;
      bars = yb;
    }
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
  
  /**
   * Index OHLCV (US30, NAS100, US500, GER40…).
   *
   * The account's Twelve Data plan does not include indices — DJI/NDX
   * return HTTP 404 on every call — while Yahoo's cash-index candles work.
   * The old order (Twelve Data first, Yahoo only in the catch) therefore
   * burned a guaranteed-404 request on every scan, and whenever Yahoo
   * returned nothing (throttled, or its by-design refusal to serve stale
   * intraday bars outside cash hours) the RAW provider 404 was rethrown
   * and surfaced as the engine's scan error ("Scan failed: Twelve Data
   * API error: 404 Not Found", live-trading-engine scan loop).
   *
   * So for indices Yahoo is PRIMARY and Twelve Data the fallback
   * (INDEX_YAHOO_PRIMARY=off restores the old order). When both sources
   * fail, one clear error names the symbol and both sources instead of
   * presenting a bare provider 404 as the scan failure.
   */
  private async fetchIndexMarketData(request: MarketDataRequest): Promise<{
    bars: OHLCVBar[];
    provider: string;
    hash: string;
    fromCache: boolean;
  }> {
    const provider = this.selectProvider(request.assetType);
    const ttl = marketDataCache.getTTLForTimeframe(request.timeframe);
    const yahooFirst = process.env.INDEX_YAHOO_PRIMARY !== 'off';

    const fromYahoo = async (): Promise<{ bars: OHLCVBar[]; provider: string; hash: string; fromCache: boolean } | null> => {
      const cached = marketDataCache.get<OHLCVBar[]>(request.symbol, request.timeframe, 'yahoo-index');
      if (cached) {
        return { bars: cached, provider: 'yahoo-index', hash: this.generateHash(cached), fromCache: true };
      }
      const yb = await fetchIndexFromYahoo(request).catch(() => null);
      if (!yb || !yb.length) return null;
      logIndexSource(request.symbol, 'yahoo', 'OHLCV');
      marketDataCache.set(request.symbol, request.timeframe, 'yahoo-index', yb, ttl);
      return { bars: yb, provider: 'yahoo-index', hash: this.generateHash(yb), fromCache: false };
    };

    let tdError: Error | null = null;
    const fromTwelveData = async (): Promise<{ bars: OHLCVBar[]; provider: string; hash: string; fromCache: boolean } | null> => {
      if (!provider) return null;
      const cached = marketDataCache.get<OHLCVBar[]>(request.symbol, request.timeframe, provider.name);
      if (cached) {
        return { bars: cached, provider: provider.name, hash: this.generateHash(cached), fromCache: true };
      }
      try {
        const bars = await provider.fetchOHLCV(request);
        logIndexSource(request.symbol, 'twelvedata', 'OHLCV');
        marketDataCache.set(request.symbol, request.timeframe, provider.name, bars, ttl);
        return { bars, provider: provider.name, hash: this.generateHash(bars), fromCache: false };
      } catch (err) {
        tdError = err instanceof Error ? err : new Error(String(err));
        return null;
      }
    };

    if (yahooFirst) {
      const y = await fromYahoo();
      if (y) return y;
      const t = await fromTwelveData();
      if (t) return t;
    } else {
      const t = await fromTwelveData();
      if (t) return t;
      const y = await fromYahoo();
      if (y) return y;
    }

    const message = `Index data unavailable for ${request.symbol}: Yahoo returned no data and Twelve Data failed (${tdError ? tdError.message : 'no Twelve Data provider configured'})`;
    console.error(`[market-data] ${message}`);
    throw new Error(message);
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
    const upper = symbol.toUpperCase().replace(/1!$/, ''); // strip continuous contract suffix

    const futuresSymbols = ['NQ', 'MNQ', 'ES', 'MES', 'YM', 'MYM', 'RTY', 'M2K', 'GC', 'MGC', 'SI', 'SIL', 'CL', 'MCL', 'NG', 'ZN', 'ZB'];
    if (futuresSymbols.includes(upper)) {
      return 'futures';
    }

    const metals = ['XAU', 'XAG', 'XPT', 'XPD'];
    if (metals.some(m => upper.startsWith(m))) {
      return 'forex';
    }

    const forexPairs = ['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD'];
    const forexPattern = forexPairs.some(c => upper.startsWith(c) || upper.includes(`/${c}`));
    if (forexPattern && (upper.length === 6 || upper.includes('/'))) {
      return 'forex';
    }

    const cryptoSymbols = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC'];
    if (cryptoSymbols.some(c => upper.startsWith(c))) {
      return 'crypto';
    }

    // Include common CFD broker names (US30=Dow, US500=S&P, UK100=FTSE, etc.)
    // NAS100 / USTEC / WS30 / DJ30 were missing: 'NAS100' contains none of
    // the substrings below (it is not 'US100', 'NDX' or 'SPX'), so the
    // canonical Nasdaq CFD name fell through to 'stock' — which silently
    // routed it AWAY from every index path, including the ORB builder's
    // broker-candle source (getOrbStateFull branches on 'index') and the
    // Twelve Data index symbol map. US30 was detected correctly; NAS100
    // was not, so the two indices behaved differently for no reason.
    const indices = ['SPX', 'NDX', 'DJI', 'VIX', 'FTSE', 'DAX', 'NI225',
      'US30', 'US500', 'SP500', 'SPX500', 'US100', 'NAS100', 'USTEC', 'WS30', 'DJ30', 'UK100', 'GER40', 'DE40', 'FRA40', 'JP225', 'JPN225', 'AU200', 'HK50'];
    if (indices.some(i => upper.includes(i))) {
      return 'index';
    }

    return 'stock';
  }
  
  isInitialized(): boolean {
    return this.providers.size > 0;
  }
}

// The Yahoo cash-index fetcher lives in ./yahoo-index (shared with the
// Twelve Data provider's ATR path); it is imported at the top of this file
// and used by fetchMarketData / fetchIndexMarketData above.

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
