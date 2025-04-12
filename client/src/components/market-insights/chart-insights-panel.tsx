import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InteractiveInsightTooltip } from '@/components/ui/interactive-insight-tooltip';
import { Sparkles } from 'lucide-react';

export interface ChartInsightsPanelProps {
  symbol?: string;
  timeframe?: string;
  pattern?: string;
  trend?: string;
  entryPoint?: string;
  exitPoint?: string;
  className?: string;
}

export const ChartInsightsPanel: React.FC<ChartInsightsPanelProps> = ({
  symbol = 'unknown',
  timeframe = 'H1',
  pattern,
  trend = 'neutral',
  entryPoint,
  exitPoint,
  className = ''
}) => {
  // Determine market context based on pattern
  const getPatternContext = (patternName?: string): 'pattern' | 'reversal' | 'trend' => {
    if (!patternName) return 'trend';
    
    const reversalPatterns = ['double top', 'double bottom', 'head and shoulders', 'inverse head', 'reversal'];
    const lowerPattern = patternName.toLowerCase();
    
    if (reversalPatterns.some(p => lowerPattern.includes(p))) {
      return 'reversal';
    }
    
    return 'pattern';
  };
  
  // Determine market trend type
  const getTrendType = (trendDesc?: string): 'bullish' | 'bearish' | 'neutral' | 'volatile' => {
    if (!trendDesc) return 'neutral';
    
    const lowerTrend = trendDesc.toLowerCase();
    
    if (lowerTrend.includes('bullish') || lowerTrend.includes('uptrend')) {
      return 'bullish';
    } else if (lowerTrend.includes('bearish') || lowerTrend.includes('downtrend')) {
      return 'bearish';
    } else if (lowerTrend.includes('volatile') || lowerTrend.includes('choppy')) {
      return 'volatile';
    }
    
    return 'neutral';
  };
  
  // Get candlestick context based on time frame
  const getTimeframeContext = (tm?: string): 'candlestick' | 'indicator' => {
    if (!tm) return 'candlestick';
    
    const lowerTm = tm.toLowerCase();
    
    if (['h4', 'd1', 'daily', 'weekly', 'monthly', 'w1', 'm1'].some(t => lowerTm.includes(t))) {
      return 'candlestick';
    }
    
    return 'indicator';
  };
  
  // Entry and exit points
  const getPriceContext = (isPriceEntry: boolean): 'support' | 'resistance' | 'breakout' => {
    const trendType = getTrendType(trend);
    
    if (isPriceEntry) {
      return trendType === 'bullish' ? 'support' : 'resistance';
    } else {
      return 'breakout';
    }
  };
  
  return (
    <Card className={`bg-gray-900 border-gray-800 shadow-xl ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-white">
          <Sparkles className="h-5 w-5 text-indigo-500" />
          <span>Interactive Chart Insights</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Chart Pattern */}
          {pattern && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400">Chart Pattern</span>
              <InteractiveInsightTooltip
                title={pattern}
                description={getPatternDescription(pattern)}
                type={getTrendType(trend)}
                context={getPatternContext(pattern)}
              >
                <div className={`
                  inline-flex p-1.5 px-3 rounded-lg text-sm font-medium
                  ${getTrendType(trend) === 'bullish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    getTrendType(trend) === 'bearish' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                    getTrendType(trend) === 'volatile' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 
                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'}
                `}>
                  {pattern}
                </div>
              </InteractiveInsightTooltip>
            </div>
          )}
          
          {/* Market Trend */}
          {trend && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400">Market Trend</span>
              <InteractiveInsightTooltip
                title={`${getTrendType(trend).charAt(0).toUpperCase() + getTrendType(trend).slice(1)} Trend`}
                description={getTrendDescription(trend)}
                type={getTrendType(trend)}
                context="trend"
              >
                <div className={`
                  inline-flex p-1.5 px-3 rounded-lg text-sm font-medium
                  ${getTrendType(trend) === 'bullish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    getTrendType(trend) === 'bearish' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20' : 
                    getTrendType(trend) === 'volatile' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20' : 
                    'bg-amber-500/10 text-amber-400 border border-amber-500/20'}
                `}>
                  {trend}
                </div>
              </InteractiveInsightTooltip>
            </div>
          )}
          
          {/* Entry Point */}
          {entryPoint && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400">Entry Point</span>
              <InteractiveInsightTooltip
                title={`Entry at ${entryPoint}`}
                description={`Suggested market entry point for ${symbol} is at ${entryPoint}. ${
                  getTrendType(trend) === 'bullish' 
                    ? 'This represents a potential support level or breakout confirmation.' 
                    : 'This represents a potential resistance level or breakdown confirmation.'
                }`}
                type={getTrendType(trend)}
                context={getPriceContext(true)}
              >
                <div className={`
                  inline-flex p-1.5 px-3 rounded-lg text-sm font-medium
                  ${getTrendType(trend) === 'bullish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    'bg-rose-500/10 text-rose-400 border border-rose-500/20'}
                `}>
                  {entryPoint}
                </div>
              </InteractiveInsightTooltip>
            </div>
          )}
          
          {/* Exit Point */}
          {exitPoint && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400">Take Profit Target</span>
              <InteractiveInsightTooltip
                title={`Take Profit at ${exitPoint}`}
                description={`Suggested take profit level for ${symbol} is at ${exitPoint}. This target is based on the identified pattern and recent price action.`}
                type={getTrendType(trend)}
                context={getPriceContext(false)}
              >
                <div className={`
                  inline-flex p-1.5 px-3 rounded-lg text-sm font-medium
                  ${getTrendType(trend) === 'bullish' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 
                    'bg-rose-500/10 text-rose-400 border border-rose-500/20'}
                `}>
                  {exitPoint}
                </div>
              </InteractiveInsightTooltip>
            </div>
          )}
          
          {/* Timeframe Context */}
          {timeframe && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-gray-400">Timeframe Context</span>
              <InteractiveInsightTooltip
                title={`${timeframe.toUpperCase()} Timeframe`}
                description={getTimeframeDescription(timeframe)}
                type={getTrendType(trend)}
                context={getTimeframeContext(timeframe)}
              >
                <div className={`
                  inline-flex p-1.5 px-3 rounded-lg text-sm font-medium bg-gray-800 text-gray-300 border border-gray-700
                `}>
                  {timeframe.toUpperCase()}
                </div>
              </InteractiveInsightTooltip>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

// Helper function to get pattern descriptions
function getPatternDescription(pattern: string): string {
  const lowerPattern = pattern.toLowerCase();
  
  if (lowerPattern.includes('double top')) {
    return "A double top is a bearish reversal pattern that forms after an uptrend when price tests a resistance level twice before moving lower, indicating a potential trend change to the downside.";
  } else if (lowerPattern.includes('double bottom')) {
    return "A double bottom is a bullish reversal pattern that forms after a downtrend when price tests a support level twice before moving higher, indicating a potential trend change to the upside.";
  } else if (lowerPattern.includes('head and shoulders')) {
    return "A head and shoulders pattern is a reversal pattern characterized by a peak (shoulder), followed by a higher peak (head), and then another lower peak (shoulder), signaling a bearish reversal.";
  } else if (lowerPattern.includes('inverse head')) {
    return "An inverse head and shoulders pattern is a bullish reversal pattern characterized by a trough (shoulder), followed by a lower trough (head), and then another higher trough (shoulder), signaling a potential uptrend.";
  } else if (lowerPattern.includes('triangle')) {
    if (lowerPattern.includes('ascending')) {
      return "An ascending triangle is a bullish continuation pattern characterized by a horizontal upper resistance line and an upward-sloping lower support line, suggesting a potential breakout to the upside.";
    } else if (lowerPattern.includes('descending')) {
      return "A descending triangle is a bearish continuation pattern characterized by a horizontal lower support line and a downward-sloping upper resistance line, suggesting a potential breakdown to the downside.";
    } else {
      return "A triangle pattern occurs when price consolidates between converging support and resistance lines, indicating a potential breakout in either direction.";
    }
  } else if (lowerPattern.includes('flag')) {
    return "A flag pattern is a continuation pattern that forms as a small counter-trend rectangle after a sharp price movement, usually followed by a continuation in the direction of the prior trend.";
  } else if (lowerPattern.includes('wedge')) {
    return "A wedge pattern forms when price consolidates between converging support and resistance lines. Falling wedges are typically bullish, while rising wedges are typically bearish.";
  } else if (lowerPattern.includes('channel')) {
    return "A channel pattern forms when price moves between parallel support and resistance lines. Ascending channels suggest bullish conditions, while descending channels suggest bearish conditions.";
  }
  
  return `The ${pattern} pattern may indicate a potential trading opportunity based on historical price behavior. Click for more details on this pattern.`;
}

// Helper function for trend descriptions
function getTrendDescription(trend: string): string {
  const lowerTrend = trend.toLowerCase();
  
  if (lowerTrend.includes('strong') && lowerTrend.includes('bullish')) {
    return "A strong bullish trend shows price consistently making higher highs and higher lows, with strong buying pressure and often increased volume on upward movements.";
  } else if (lowerTrend.includes('bullish')) {
    return "A bullish trend is characterized by a general upward movement in price, with higher highs and higher lows forming over time.";
  } else if (lowerTrend.includes('strong') && lowerTrend.includes('bearish')) {
    return "A strong bearish trend shows price consistently making lower highs and lower lows, with strong selling pressure and often increased volume on downward movements.";
  } else if (lowerTrend.includes('bearish')) {
    return "A bearish trend is characterized by a general downward movement in price, with lower highs and lower lows forming over time.";
  } else if (lowerTrend.includes('neutral') || lowerTrend.includes('sideways')) {
    return "A neutral or sideways trend shows price moving horizontally with no clear directional bias, often contained within a trading range.";
  } else if (lowerTrend.includes('volatile')) {
    return "A volatile trend shows extreme price movements in both directions, with large candles and significant price swings, indicating uncertainty in the market.";
  }
  
  return "The current market trend indicates the overall direction of price movement, which can help inform entry and exit decisions.";
}

// Helper function for timeframe descriptions
function getTimeframeDescription(timeframe: string): string {
  const lowerTimeframe = timeframe.toLowerCase();
  
  if (lowerTimeframe.includes('m1') || lowerTimeframe.includes('1m')) {
    return "The 1-minute timeframe shows very short-term price movements and is typically used by scalpers for quick trades with small profit targets.";
  } else if (lowerTimeframe.includes('m5') || lowerTimeframe.includes('5m')) {
    return "The 5-minute timeframe provides a short-term view of price action, suitable for intraday trading and identifying short-term support/resistance levels.";
  } else if (lowerTimeframe.includes('m15') || lowerTimeframe.includes('15m')) {
    return "The 15-minute timeframe offers a balance between detail and noise reduction, commonly used by day traders to identify intraday patterns.";
  } else if (lowerTimeframe.includes('m30') || lowerTimeframe.includes('30m')) {
    return "The 30-minute timeframe reduces market noise while maintaining intraday detail, making it useful for swing traders and intraday position management.";
  } else if (lowerTimeframe.includes('h1') || lowerTimeframe.includes('1h')) {
    return "The 1-hour timeframe provides a medium-term view that balances detail and trend visibility, popular among both day traders and swing traders.";
  } else if (lowerTimeframe.includes('h4') || lowerTimeframe.includes('4h')) {
    return "The 4-hour timeframe offers a broader market perspective with reduced noise, ideal for swing traders and identifying medium-term trends.";
  } else if (lowerTimeframe.includes('d1') || lowerTimeframe.includes('daily')) {
    return "The daily timeframe shows long-term price movements and trend development, filtering out short-term noise and providing a clear view of market structure.";
  } else if (lowerTimeframe.includes('w1') || lowerTimeframe.includes('weekly')) {
    return "The weekly timeframe reveals major market trends and significant support/resistance levels, used primarily by position traders and investors.";
  } else if (lowerTimeframe.includes('mn') || lowerTimeframe.includes('monthly')) {
    return "The monthly timeframe shows very long-term market cycles and historical price levels, used mainly for strategic investment decisions and identifying major market shifts.";
  }
  
  return `The ${timeframe} timeframe provides a specific perspective on price movement that can influence trading decisions and strategy selection.`;
}