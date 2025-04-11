import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, BarChart2, Lightbulb, TrendingDown, TrendingUp, InfoIcon } from 'lucide-react';
import { InsightTooltip } from '@/components/ui/insight-tooltip';
import { Link } from 'wouter';
import { motion } from 'framer-motion';

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { 
    opacity: 1,
    transition: { 
      staggerChildren: 0.1,
      delayChildren: 0.2
    }
  }
};

const itemVariants = {
  hidden: { opacity: 0, x: -5 },
  visible: { opacity: 1, x: 0 }
};

interface ChartInsightsPanelProps {
  trend?: string;
  confidence?: string;
  patterns?: string[];
  timeframe?: string;
  symbol?: string;
}

export function ChartInsightsPanel({ 
  trend, 
  confidence, 
  patterns = [], 
  timeframe,
  symbol
}: ChartInsightsPanelProps) {
  // Generate insights based on analysis data
  const insights = React.useMemo(() => {
    const result = [];
    
    // Add trend insight
    if (trend) {
      const isBullish = trend.toLowerCase().includes('bullish');
      result.push({
        id: 'trend',
        title: `${isBullish ? 'Bullish' : 'Bearish'} Trend Detected`,
        description: `The overall market direction appears to be ${trend.toLowerCase()}.`,
        icon: isBullish ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : <TrendingDown className="h-4 w-4 text-rose-500" />,
        tooltipTitle: `${isBullish ? 'Bullish' : 'Bearish'} Market`,
        tooltipContent: isBullish 
          ? 'In a bullish market, prices are expected to rise over time. Look for buying opportunities on pullbacks and consider trail stops to protect profits.' 
          : 'In a bearish market, prices are expected to fall over time. Consider short positions or staying in cash, and be cautious with long positions.',
        animationType: isBullish ? 'uptrend' : 'downtrend'
      });
    }
    
    // Add confidence insight
    if (confidence) {
      const confidenceLevel = 
        confidence.toLowerCase().includes('high') ? 'high' :
        confidence.toLowerCase().includes('medium') ? 'medium' : 'low';
      
      const confidenceIcon = 
        confidenceLevel === 'high' ? <Lightbulb className="h-4 w-4 text-amber-500" /> :
        confidenceLevel === 'medium' ? <InfoIcon className="h-4 w-4 text-blue-500" /> :
        <AlertTriangle className="h-4 w-4 text-rose-500" />;
      
      result.push({
        id: 'confidence',
        title: `${confidenceLevel.charAt(0).toUpperCase() + confidenceLevel.slice(1)} Confidence Signal`,
        description: `The AI has ${confidenceLevel} confidence in this analysis.`,
        icon: confidenceIcon,
        tooltipTitle: 'Signal Confidence',
        tooltipContent: confidenceLevel === 'high'
          ? 'High confidence signals are backed by multiple confirming factors and clear pattern recognition. Consider allocating more capital to these trades.'
          : confidenceLevel === 'medium'
          ? 'Medium confidence signals have some confirming factors but may include conflicting indicators. Use standard position sizing.'
          : 'Low confidence signals have weak pattern recognition or conflicting indicators. Consider smaller position sizes or avoiding the trade.',
        animationType: 'none'
      });
    }
    
    // Add timeframe insight
    if (timeframe) {
      result.push({
        id: 'timeframe',
        title: `${timeframe} Timeframe Analysis`,
        description: `This analysis is based on the ${timeframe} chart.`,
        icon: <BarChart2 className="h-4 w-4 text-purple-500" />,
        tooltipTitle: 'Timeframe Significance',
        tooltipContent: `The ${timeframe} timeframe is suitable for ${
          timeframe.toLowerCase().includes('1m') || timeframe.toLowerCase().includes('5m') ? 'scalping and very short-term trades lasting minutes to hours.' :
          timeframe.toLowerCase().includes('15m') || timeframe.toLowerCase().includes('30m') ? 'intraday trading with positions held for several hours.' :
          timeframe.toLowerCase().includes('1h') || timeframe.toLowerCase().includes('4h') ? 'swing trading with positions held for days to weeks.' :
          'position trading with longer-term outlook spanning weeks to months.'
        }`,
        animationType: 'none'
      });
    }
    
    // Add pattern insights
    if (patterns.length > 0) {
      patterns.forEach((pattern, index) => {
        const isBullish = pattern.toLowerCase().includes('bull') || 
                          pattern.toLowerCase().includes('support') ||
                          pattern.toLowerCase().includes('double bottom') ||
                          pattern.toLowerCase().includes('ascending');
        
        const isBearish = pattern.toLowerCase().includes('bear') || 
                          pattern.toLowerCase().includes('resistance') ||
                          pattern.toLowerCase().includes('double top') ||
                          pattern.toLowerCase().includes('descending');
        
        result.push({
          id: `pattern-${index}`,
          title: pattern,
          description: `${isBullish ? 'Bullish' : isBearish ? 'Bearish' : 'Neutral'} chart pattern detected.`,
          icon: isBullish ? <TrendingUp className="h-4 w-4 text-emerald-500" /> : 
                isBearish ? <TrendingDown className="h-4 w-4 text-rose-500" /> :
                <InfoIcon className="h-4 w-4 text-blue-500" />,
          tooltipTitle: pattern,
          tooltipContent: getPatternDescription(pattern),
          animationType: isBullish ? 'uptrend' : isBearish ? 'downtrend' : 'consolidation'
        });
      });
    }
    
    // Add market volatility insight
    result.push({
      id: 'volatility',
      title: 'Market Volatility Assessment',
      description: `Analyze the current volatility for ${symbol || 'this market'}.`,
      icon: <BarChart2 className="h-4 w-4 text-purple-500" />,
      tooltipTitle: 'Volatility Impact',
      tooltipContent: 'Higher volatility increases both risk and potential reward. During volatile periods, use wider stops and consider reducing position sizes to manage risk appropriately.',
      animationType: 'volatility'
    });
    
    return result;
  }, [trend, confidence, patterns, timeframe, symbol]);

  return (
    <Card className="border border-gray-200 dark:border-gray-800 shadow-sm mb-6">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg">Chart Insights</CardTitle>
            <CardDescription>
              Interactive explanations for this analysis
            </CardDescription>
          </div>
          <Link href="/market-insights">
            <Badge variant="outline" className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800">
              View All Insights
            </Badge>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <motion.div 
          className="space-y-3"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {insights.map((insight) => (
            <motion.div 
              key={insight.id}
              variants={itemVariants}
              className="flex items-start justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-800"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white dark:bg-gray-700 shadow-sm">
                  {insight.icon}
                </div>
                <div>
                  <h4 className="text-sm font-medium">{insight.title}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {insight.description}
                  </p>
                </div>
              </div>
              <InsightTooltip 
                title={insight.tooltipTitle}
                content={insight.tooltipContent}
                icon={insight.icon.type.name?.toLowerCase().includes('trending') ? 
                  (insight.title.toLowerCase().includes('bull') ? 'bullish' : 'bearish') : 
                  insight.icon.type.name?.toLowerCase().includes('chart') ? 'volatility' : 'info'}
                animationType={insight.animationType as any}
                className="mt-0.5"
              />
            </motion.div>
          ))}
        </motion.div>
      </CardContent>
    </Card>
  );
}

// Helper function to get detailed pattern descriptions
function getPatternDescription(pattern: string): string {
  const patternLower = pattern.toLowerCase();
  
  if (patternLower.includes('engulfing') && patternLower.includes('bull')) {
    return 'Bullish engulfing patterns occur when a green (bullish) candle completely engulfs the previous red (bearish) candle. This signals strong buying pressure and often marks the end of a downtrend.';
  }
  
  if (patternLower.includes('engulfing') && patternLower.includes('bear')) {
    return 'Bearish engulfing patterns occur when a red (bearish) candle completely engulfs the previous green (bullish) candle. This signals strong selling pressure and often marks the end of an uptrend.';
  }
  
  if (patternLower.includes('doji')) {
    return 'Doji candles have virtually the same open and close prices, creating a cross-like appearance. They indicate indecision in the market and potential trend reversals, especially after strong trends.';
  }
  
  if (patternLower.includes('hammer')) {
    return 'The hammer is a bullish reversal pattern that forms during a downtrend. It has a small body at the upper end of the trading range with a long lower shadow, showing buyers stepping in after selling pressure.';
  }
  
  if (patternLower.includes('shooting star')) {
    return 'The shooting star is a bearish reversal pattern that forms during an uptrend. It has a small body at the lower end of the trading range with a long upper shadow, showing sellers entering after an upward move.';
  }
  
  if (patternLower.includes('double top')) {
    return 'A double top is a bearish reversal pattern where price reaches a high twice with a moderate decline between the highs. The pattern completes when price breaks below the support level between the two tops.';
  }
  
  if (patternLower.includes('double bottom')) {
    return 'A double bottom is a bullish reversal pattern where price reaches a low twice with a moderate rally between the lows. The pattern completes when price breaks above the resistance level between the two bottoms.';
  }
  
  if (patternLower.includes('head and shoulders')) {
    return 'The head and shoulders pattern is a reversal pattern with three peaks - the middle peak (head) being higher than the two outer peaks (shoulders). A breakdown below the neckline confirms the pattern.';
  }
  
  if (patternLower.includes('triangle')) {
    if (patternLower.includes('ascending')) {
      return 'An ascending triangle is a bullish continuation pattern with a flat upper resistance line and an ascending lower support line. It indicates accumulation and typically breaks to the upside.';
    }
    if (patternLower.includes('descending')) {
      return 'A descending triangle is a bearish continuation pattern with a flat lower support line and a descending upper resistance line. It indicates distribution and typically breaks to the downside.';
    }
    return 'Triangle patterns show convergence of support and resistance lines, indicating decreasing volatility before a breakout. The direction of the breakout often indicates the next trend direction.';
  }
  
  if (patternLower.includes('flag') || patternLower.includes('pennant')) {
    return 'Flags and pennants are short-term continuation patterns that form after a sharp price move. They represent brief consolidations before the price continues in the direction of the previous trend.';
  }
  
  if (patternLower.includes('support')) {
    return 'Support levels are price areas where buying pressure is strong enough to overcome selling pressure, causing the price to stop falling and potentially reverse upward.';
  }
  
  if (patternLower.includes('resistance')) {
    return 'Resistance levels are price areas where selling pressure is strong enough to overcome buying pressure, causing the price to stop rising and potentially reverse downward.';
  }
  
  // Default description for unrecognized patterns
  return `${pattern} is a technical chart pattern that traders use to identify potential trading opportunities. Monitor price action around this pattern for confirmation signals.`;
}