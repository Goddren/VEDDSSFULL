import { MarketDataProvider, MarketDataRequest, OHLCVBar, AssetType } from '../types';
import { rateLimiter } from '../rate-limiter';

const TWELVE_DATA_BASE_URL = 'https://api.twelvedata.com';

const FOREX_PAIRS = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 'AUD/USD', 'USD/CAD', 'NZD/USD', 
  'EUR/GBP', 'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'EUR/AUD', 'EUR/CAD', 'EUR/CHF'];

const CRYPTO_PAIRS = ['BTC/USD', 'ETH/USD', 'XRP/USD', 'LTC/USD', 'ADA/USD', 'DOT/USD', 'DOGE/USD',
  'SOL/USD', 'AVAX/USD', 'MATIC/USD'];

export class TwelveDataProvider implements MarketDataProvider {
  name = 'twelvedata';
  supportedAssets: AssetType[] = ['forex', 'stock', 'crypto', 'index'];
  
  private apiKey: string;
  
  constructor(apiKey: string) {
    this.apiKey = apiKey;
    rateLimiter.registerProvider(this.name, {
      maxRequests: 8,
      windowMs: 60 * 1000,
      retryAfterMs: 8000
    });
  }
  
  private normalizeSymbol(symbol: string, assetType: AssetType): string {
    let normalized = symbol.toUpperCase().replace('_', '/');
    
    if (!normalized.includes('/')) {
      if (assetType === 'forex' && normalized.length === 6) {
        normalized = `${normalized.slice(0, 3)}/${normalized.slice(3)}`;
      } else if (assetType === 'crypto') {
        const cryptoBases = ['BTC', 'ETH', 'XRP', 'LTC', 'ADA', 'DOT', 'DOGE', 'SOL', 'AVAX', 'MATIC', 'BNB', 'LINK'];
        for (const base of cryptoBases) {
          if (normalized.startsWith(base)) {
            normalized = `${base}/${normalized.slice(base.length)}`;
            break;
          }
        }
      }
    }
    
    return normalized;
  }
  
  private mapTimeframe(timeframe: string): string {
    const map: Record<string, string> = {
      '1m': '1min',
      '5m': '5min',
      '15m': '15min',
      '30m': '30min',
      '1h': '1h',
      '4h': '4h',
      '1d': '1day',
      '1w': '1week'
    };
    return map[timeframe] || '1h';
  }
  
  isSymbolSupported(symbol: string, assetType: AssetType): boolean {
    const normalized = this.normalizeSymbol(symbol, assetType);
    
    if (assetType === 'forex') {
      return FOREX_PAIRS.some(p => p === normalized || p.replace('/', '') === normalized.replace('/', ''));
    }
    if (assetType === 'crypto') {
      return CRYPTO_PAIRS.some(p => p === normalized || p.replace('/', '') === normalized.replace('/', ''));
    }
    return true;
  }
  
  async fetchOHLCV(request: MarketDataRequest): Promise<OHLCVBar[]> {
    await rateLimiter.waitForSlot(this.name);
    
    const symbol = this.normalizeSymbol(request.symbol, request.assetType);
    const interval = this.mapTimeframe(request.timeframe);
    const outputSize = request.limit || 50;
    
    const url = new URL(`${TWELVE_DATA_BASE_URL}/time_series`);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('interval', interval);
    url.searchParams.set('outputsize', outputSize.toString());
    url.searchParams.set('apikey', this.apiKey);
    
    try {
      rateLimiter.recordRequest(this.name);
      
      const response = await fetch(url.toString());
      
      // Handle HTTP errors first
      if (response.status === 401) {
        throw new Error('Twelve Data API key is invalid or expired. Please check your TWELVE_DATA_API_KEY in secrets.');
      }
      if (response.status === 429) {
        throw new Error('Twelve Data rate limit exceeded. Free tier: 8 requests/minute. Wait a moment and try again.');
      }
      if (!response.ok) {
        throw new Error(`Twelve Data API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === 'error') {
        throw new Error(data.message || 'Twelve Data API error');
      }
      
      if (!data.values || !Array.isArray(data.values)) {
        throw new Error('Invalid response from Twelve Data');
      }
      
      return data.values.map((bar: any) => ({
        timestamp: new Date(bar.datetime).getTime(),
        open: parseFloat(bar.open),
        high: parseFloat(bar.high),
        low: parseFloat(bar.low),
        close: parseFloat(bar.close),
        volume: parseFloat(bar.volume) || 0
      })).reverse();
      
    } catch (error) {
      console.error(`Twelve Data fetch error for ${symbol}:`, error);
      throw error;
    }
  }
  
  async fetchATR(symbol: string, assetType: AssetType, timeframe: string = '1d', period: number = 14): Promise<{
    atr: number;
    atrPercent: number;
    currentPrice: number;
    suggestedSL: {
      conservative: number;
      moderate: number;
      aggressive: number;
    };
    suggestedSLPips?: {
      conservative: number;
      moderate: number;
      aggressive: number;
    };
  }> {
    await rateLimiter.waitForSlot(this.name);
    
    const normalizedSymbol = this.normalizeSymbol(symbol, assetType);
    const interval = this.mapTimeframe(timeframe);
    
    // Fetch ATR indicator
    const atrUrl = new URL(`${TWELVE_DATA_BASE_URL}/atr`);
    atrUrl.searchParams.set('symbol', normalizedSymbol);
    atrUrl.searchParams.set('interval', interval);
    atrUrl.searchParams.set('time_period', period.toString());
    atrUrl.searchParams.set('outputsize', '1');
    atrUrl.searchParams.set('apikey', this.apiKey);
    
    // Fetch current price
    const priceUrl = new URL(`${TWELVE_DATA_BASE_URL}/price`);
    priceUrl.searchParams.set('symbol', normalizedSymbol);
    priceUrl.searchParams.set('apikey', this.apiKey);
    
    try {
      rateLimiter.recordRequest(this.name);
      
      const [atrResponse, priceResponse] = await Promise.all([
        fetch(atrUrl.toString()),
        fetch(priceUrl.toString())
      ]);
      
      // Handle HTTP errors with specific messaging
      if (atrResponse.status === 401 || priceResponse.status === 401) {
        throw new Error('Twelve Data API key is invalid or expired. Please check your TWELVE_DATA_API_KEY in secrets.');
      }
      if (atrResponse.status === 429 || priceResponse.status === 429) {
        throw new Error('Twelve Data rate limit exceeded. Free tier: 8 requests/minute. Wait a moment and try again.');
      }
      if (!atrResponse.ok || !priceResponse.ok) {
        throw new Error(`Twelve Data API error: ATR ${atrResponse.status}, Price ${priceResponse.status}`);
      }
      
      const atrData = await atrResponse.json();
      const priceData = await priceResponse.json();
      
      if (atrData.status === 'error') {
        throw new Error(atrData.message || 'ATR fetch failed');
      }
      
      const atrValue = atrData.values && atrData.values[0] 
        ? parseFloat(atrData.values[0].atr) 
        : 0;
      const currentPrice = parseFloat(priceData.price) || 0;
      
      // Calculate ATR as percentage of price
      const atrPercent = currentPrice > 0 ? (atrValue / currentPrice) * 100 : 0;
      
      // Calculate suggested SL distances based on ATR multiples
      // Conservative: 2x ATR (wider, fewer stop-outs)
      // Moderate: 1.5x ATR (balanced)
      // Aggressive: 1x ATR (tighter, higher risk)
      const suggestedSL = {
        conservative: atrValue * 2,
        moderate: atrValue * 1.5,
        aggressive: atrValue * 1
      };
      
      // For forex pairs, convert to pips (assuming standard pip size)
      let suggestedSLPips: { conservative: number; moderate: number; aggressive: number } | undefined;
      
      if (assetType === 'forex') {
        // Most pairs: 1 pip = 0.0001, JPY pairs: 1 pip = 0.01
        const isJPYPair = normalizedSymbol.includes('JPY');
        const pipMultiplier = isJPYPair ? 100 : 10000;
        
        suggestedSLPips = {
          conservative: Math.round(suggestedSL.conservative * pipMultiplier),
          moderate: Math.round(suggestedSL.moderate * pipMultiplier),
          aggressive: Math.round(suggestedSL.aggressive * pipMultiplier)
        };
      }
      
      return {
        atr: atrValue,
        atrPercent,
        currentPrice,
        suggestedSL,
        suggestedSLPips
      };
      
    } catch (error) {
      console.error(`Twelve Data ATR fetch error for ${symbol}:`, error);
      throw error;
    }
  }
}
