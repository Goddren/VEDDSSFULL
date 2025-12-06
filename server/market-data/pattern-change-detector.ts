import { OHLCVBar, PatternChangeResult } from './types';

export class PatternChangeDetector {
  private calculateATR(bars: OHLCVBar[], period: number = 14): number {
    if (bars.length < period + 1) return 0;
    
    const trueRanges: number[] = [];
    for (let i = 1; i < bars.length && i <= period; i++) {
      const high = bars[i].high;
      const low = bars[i].low;
      const prevClose = bars[i - 1].close;
      
      const tr = Math.max(
        high - low,
        Math.abs(high - prevClose),
        Math.abs(low - prevClose)
      );
      trueRanges.push(tr);
    }
    
    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }
  
  private calculateVolatility(bars: OHLCVBar[]): number {
    if (bars.length < 2) return 0;
    
    const returns: number[] = [];
    for (let i = 1; i < bars.length; i++) {
      const ret = (bars[i].close - bars[i - 1].close) / bars[i - 1].close;
      returns.push(ret);
    }
    
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;
    
    return Math.sqrt(variance) * 100;
  }
  
  private detectTrendDirection(bars: OHLCVBar[]): 'up' | 'down' | 'sideways' {
    if (bars.length < 5) return 'sideways';
    
    const firstHalf = bars.slice(0, Math.floor(bars.length / 2));
    const secondHalf = bars.slice(Math.floor(bars.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, b) => sum + b.close, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, b) => sum + b.close, 0) / secondHalf.length;
    
    const changePercent = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (changePercent > 0.5) return 'up';
    if (changePercent < -0.5) return 'down';
    return 'sideways';
  }
  
  compareSnapshots(
    oldBars: OHLCVBar[],
    newBars: OHLCVBar[],
    thresholds = { volatility: 30, atr: 20, price: 2 }
  ): PatternChangeResult {
    const oldVolatility = this.calculateVolatility(oldBars);
    const newVolatility = this.calculateVolatility(newBars);
    const volatilityDelta = Math.abs(((newVolatility - oldVolatility) / (oldVolatility || 1)) * 100);
    
    const oldATR = this.calculateATR(oldBars);
    const newATR = this.calculateATR(newBars);
    const atrChange = Math.abs(((newATR - oldATR) / (oldATR || 1)) * 100);
    
    const oldLastPrice = oldBars[oldBars.length - 1]?.close || 0;
    const newLastPrice = newBars[newBars.length - 1]?.close || 0;
    const priceChangePercent = Math.abs(((newLastPrice - oldLastPrice) / (oldLastPrice || 1)) * 100);
    
    const oldTrend = this.detectTrendDirection(oldBars);
    const newTrend = this.detectTrendDirection(newBars);
    const trendReversal = oldTrend !== newTrend && oldTrend !== 'sideways' && newTrend !== 'sideways';
    
    const hasSignificantChange = 
      volatilityDelta > thresholds.volatility ||
      atrChange > thresholds.atr ||
      priceChangePercent > thresholds.price ||
      trendReversal;
    
    const details: string[] = [];
    if (volatilityDelta > thresholds.volatility) {
      details.push(`Volatility changed by ${volatilityDelta.toFixed(1)}%`);
    }
    if (atrChange > thresholds.atr) {
      details.push(`ATR changed by ${atrChange.toFixed(1)}%`);
    }
    if (priceChangePercent > thresholds.price) {
      details.push(`Price moved ${priceChangePercent.toFixed(2)}%`);
    }
    if (trendReversal) {
      details.push(`Trend reversed from ${oldTrend} to ${newTrend}`);
    }
    
    return {
      hasSignificantChange,
      volatilityDelta,
      atrChange,
      priceChangePercent,
      trendReversal,
      details: details.join('; ') || 'No significant changes detected'
    };
  }
}

export const patternChangeDetector = new PatternChangeDetector();
