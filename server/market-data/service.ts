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
    const indices = ['SPX', 'NDX', 'DJI', 'VIX', 'FTSE', 'DAX', 'NI225',
      'US30', 'US500', 'US100', 'UK100', 'GER40', 'DE40', 'FRA40', 'JP225', 'JPN225', 'AU200', 'HK50'];
    if (indices.some(i => upper.includes(i))) {
      return 'index';
    }

    return 'stock';
  }
  
  isInitialized(): boolean {
    return this.providers.size > 0;
  }
}

// ── Index fallback (Yahoo Finance chart API, no key) ─────────────────────
const YAHOO_INDEX: Array<[RegExp, string]> = [
  [/^(US30|WS30|DJ30|DJI|DOW|USA30|WALLST)/i, '^DJI'],
  [/^(US500|SPX500|SPX|SP500|USA500)/i, '^GSPC'],
  [/^(US100|NAS100|NAS|USTEC|NDX)/i, '^NDX'],
  [/^(GER40|DE40|GER30|DAX)/i, '^GDAXI'],
  [/^(UK100|FTSE)/i, '^FTSE'],
  [/^(JP225|JPN225|NIK225)/i, '^N225'],
];
async function fetchIndexFromYahoo(req: MarketDataRequest): Promise<OHLCVBar[] | null> {
  const sym = String(req.symbol || '').replace(/[^A-Za-z0-9]/g, '');
  const hit = YAHOO_INDEX.find(([re]) => re.test(sym));
  if (!hit) return null;
  const tf = req.timeframe;
  const interval = tf === '1m' ? '1m' : tf === '5m' ? '5m' : tf === '15m' ? '15m' : tf === '30m' ? '30m' : (tf === '1h' || tf === '4h') ? '60m' : tf === '1w' ? '1wk' : '1d';
  const range = interval === '1m' ? '5d' : (interval === '5m' || interval === '15m' || interval === '30m') ? '30d' : interval === '60m' ? '180d' : '5y';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(hit[1])}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(12_000) });
  if (!r.ok) return null;
  const j: any = await r.json();
  const res = j?.chart?.result?.[0];
  const q = res?.indicators?.quote?.[0];
  if (!res?.timestamp || !q) return null;
  let bars: OHLCVBar[] = [];
  res.timestamp.forEach((t: number, i: number) => {
    if (q.close[i] == null || q.open[i] == null || q.high[i] == null || q.low[i] == null) return;
    bars.push({ timestamp: t * 1000, open: q.open[i], high: q.high[i], low: q.low[i], close: q.close[i], volume: q.volume?.[i] ?? 0 });
  });
  if (tf === '4h') {
    const m = new Map<number, OHLCVBar>();
    for (const b of bars) {
      const k = Math.floor(b.timestamp / 14_400_000) * 14_400_000;
      const x = m.get(k);
      if (!x) m.set(k, { ...b, timestamp: k });
      else { x.high = Math.max(x.high, b.high); x.low = Math.min(x.low, b.low); x.close = b.close; x.volume += b.volume; }
    }
    bars = Array.from(m.values()).sort((a, b) => a.timestamp - b.timestamp);
  }
  if (!bars.length) return null;
  // The cash index only trades exchange hours — outside them the last bar is
  // hours old. Intraday requests get no data then, rather than stale prices.
  const ageMs = Date.now() - bars[bars.length - 1].timestamp;
  const maxAge = interval === '1d' || interval === '1wk' ? 5 * 86_400_000 : tf === '4h' ? 6 * 3_600_000 : 2 * 3_600_000;
  if (ageMs > maxAge) return null;
  const lim = req.limit && req.limit > 0 ? req.limit : bars.length;
  return bars.slice(-lim);
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
