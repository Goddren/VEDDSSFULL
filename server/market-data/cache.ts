import { CacheEntry } from './types';

class MarketDataCache {
  private cache: Map<string, CacheEntry<any>> = new Map();
  
  private generateKey(symbol: string, timeframe: string, provider: string): string {
    return `${symbol}:${timeframe}:${provider}`;
  }
  
  get<T>(symbol: string, timeframe: string, provider: string): T | null {
    const key = this.generateKey(symbol, timeframe, provider);
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    const now = Date.now();
    if (now - entry.timestamp > entry.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  set<T>(symbol: string, timeframe: string, provider: string, data: T, ttlMs: number): void {
    const key = this.generateKey(symbol, timeframe, provider);
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttlMs
    });
  }
  
  invalidate(symbol: string, timeframe: string, provider: string): void {
    const key = this.generateKey(symbol, timeframe, provider);
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  getTTLForTimeframe(timeframe: string): number {
    const ttlMap: Record<string, number> = {
      '1m': 30 * 1000,
      '5m': 2 * 60 * 1000,
      '15m': 5 * 60 * 1000,
      '30m': 10 * 60 * 1000,
      '1h': 15 * 60 * 1000,
      '4h': 30 * 60 * 1000,
      '1d': 60 * 60 * 1000,
      '1w': 4 * 60 * 60 * 1000
    };
    return ttlMap[timeframe] || 5 * 60 * 1000;
  }
}

export const marketDataCache = new MarketDataCache();
