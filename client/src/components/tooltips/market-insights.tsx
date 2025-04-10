import React from 'react';
import { 
  InsightTooltip, 
  BullishInsight, 
  BearishInsight, 
  VolatilityInsight, 
  ConsolidationInsight,
  BreakoutInsight
} from './insight-tooltip';

// A dictionary of market trend insights with descriptions
export const marketInsights = {
  'Strongly Bullish': {
    title: 'Strongly Bullish Trend',
    description: 'The market shows a strong upward momentum with consistently higher highs and higher lows. This trend suggests continued buying pressure and potential for further price appreciation.',
    type: 'bullish' as const,
  },
  'Bullish': {
    title: 'Bullish Trend',
    description: 'The market is in an upward trend with prices making higher highs and higher lows. Buying opportunities may present themselves on pullbacks to support levels.',
    type: 'bullish' as const,
  },
  'Mildly Bullish': {
    title: 'Mildly Bullish Trend',
    description: 'The market has a slight upward bias but lacks strong momentum. While the trend is positive, it may be vulnerable to reversals.',
    type: 'bullish' as const,
  },
  'Strongly Bearish': {
    title: 'Strongly Bearish Trend',
    description: 'The market shows strong downward momentum with consistently lower highs and lower lows. This trend suggests continued selling pressure and potential for further price decline.',
    type: 'bearish' as const,
  },
  'Bearish': {
    title: 'Bearish Trend',
    description: 'The market is in a downward trend with prices making lower highs and lower lows. Selling opportunities may present themselves on rallies to resistance levels.',
    type: 'bearish' as const,
  },
  'Mildly Bearish': {
    title: 'Mildly Bearish Trend',
    description: 'The market has a slight downward bias but lacks strong momentum. While the trend is negative, it may be vulnerable to reversals.',
    type: 'bearish' as const,
  },
  'Neutral': {
    title: 'Neutral Market',
    description: 'The market lacks a clear direction, moving sideways within a range. This may represent a period of equilibrium between buyers and sellers, or consolidation before the next move.',
    type: 'consolidation' as const,
  },
  'Volatile': {
    title: 'Volatile Market',
    description: 'The market shows significant price fluctuations in both directions without establishing a clear trend. This environment can present opportunities for short-term traders but requires careful risk management.',
    type: 'volatility' as const,
  },
  'Breakout': {
    title: 'Market Breakout',
    description: 'The price has broken through a significant support or resistance level with increased volume, potentially signaling the start of a new trend. The direction of the breakout suggests the likely direction of the new trend.',
    type: 'breakout' as const,
  },
  'Range-Bound': {
    title: 'Range-Bound Market',
    description: 'The market is fluctuating between clearly defined support and resistance levels. Trading strategies often involve buying near support and selling near resistance until a breakout occurs.',
    type: 'consolidation' as const,
  },
  'Trending': {
    title: 'Trending Market',
    description: 'The market is showing a consistent directional movement over time. Trend-following strategies are typically more effective in this environment.',
    type: 'consolidation' as const,
  },
  'Reversal': {
    title: 'Market Reversal',
    description: 'The market is showing signs of changing direction after a prolonged trend. This may be confirmed by reversal patterns, divergences in indicators, or breaks of key trendlines.',
    type: 'volatility' as const,
  },
  'Consolidation': {
    title: 'Market Consolidation',
    description: 'The market is in a period of reduced volatility after a significant move, often forming patterns like triangles, flags, or pennants. This typically precedes the next directional move.',
    type: 'consolidation' as const,
  },
  'Correction': {
    title: 'Market Correction',
    description: 'A temporary price movement against the prevailing trend, typically retracing a portion of the previous move. This often represents a healthy adjustment within a larger trend and may provide entry opportunities.',
    type: 'consolidation' as const,
  },
  'Overbought': {
    title: 'Overbought Market',
    description: 'The market has risen too far too quickly and may be due for a pullback or consolidation. This is often indicated by technical indicators reaching extreme levels.',
    type: 'bearish' as const,
  },
  'Oversold': {
    title: 'Oversold Market',
    description: 'The market has fallen too far too quickly and may be due for a bounce or consolidation. This is often indicated by technical indicators reaching extreme levels.',
    type: 'bullish' as const,
  },
};

export type MarketInsightKey = keyof typeof marketInsights;

interface MarketTrendInsightProps {
  trend: MarketInsightKey | string;
  iconSize?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function MarketTrendInsight({
  trend,
  iconSize,
  className,
  children
}: MarketTrendInsightProps) {
  // If the trend is not in our dictionary, use a generic tooltip
  if (!(trend in marketInsights)) {
    // Try to determine if the trend is bullish or bearish based on the name
    const lowerTrend = trend.toLowerCase();
    if (lowerTrend.includes('bull') || lowerTrend.includes('up')) {
      return (
        <BullishInsight
          title={trend}
          description="An upward market trend identified in your chart analysis."
          iconSize={iconSize}
          className={className}
        >
          {children}
        </BullishInsight>
      );
    } else if (lowerTrend.includes('bear') || lowerTrend.includes('down')) {
      return (
        <BearishInsight
          title={trend}
          description="A downward market trend identified in your chart analysis."
          iconSize={iconSize}
          className={className}
        >
          {children}
        </BearishInsight>
      );
    } else {
      return (
        <ConsolidationInsight
          title={trend}
          description="A market condition identified in your chart analysis."
          iconSize={iconSize}
          className={className}
        >
          {children}
        </ConsolidationInsight>
      );
    }
  }

  const insight = marketInsights[trend as MarketInsightKey];
  
  switch (insight.type) {
    case 'bullish':
      return (
        <BullishInsight
          title={insight.title}
          description={insight.description}
          iconSize={iconSize}
          className={className}
        >
          {children}
        </BullishInsight>
      );
    case 'bearish':
      return (
        <BearishInsight
          title={insight.title}
          description={insight.description}
          iconSize={iconSize}
          className={className}
        >
          {children}
        </BearishInsight>
      );
    case 'volatility':
      return (
        <VolatilityInsight
          title={insight.title}
          description={insight.description}
          iconSize={iconSize}
          className={className}
        >
          {children}
        </VolatilityInsight>
      );
    case 'breakout':
      return (
        <BreakoutInsight
          title={insight.title}
          description={insight.description}
          iconSize={iconSize}
          className={className}
        >
          {children}
        </BreakoutInsight>
      );
    case 'consolidation':
    default:
      return (
        <ConsolidationInsight
          title={insight.title}
          description={insight.description}
          iconSize={iconSize}
          className={className}
        >
          {children}
        </ConsolidationInsight>
      );
  }
}

// Export a component specifically for confidence levels
export function ConfidenceInsight({
  level,
  iconSize,
  className,
  children
}: {
  level: string;
  iconSize?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}) {
  const lowerLevel = level.toLowerCase();
  
  if (lowerLevel.includes('high') || lowerLevel.includes('strong')) {
    return (
      <BullishInsight
        title="High Confidence Signal"
        description="This analysis has a high level of confidence based on multiple confirming factors such as strong pattern recognition, supporting indicators, and clear market context."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </BullishInsight>
    );
  } else if (lowerLevel.includes('medium') || lowerLevel.includes('moderate')) {
    return (
      <ConsolidationInsight
        title="Moderate Confidence Signal"
        description="This analysis has a moderate level of confidence. While the signals are present, there may be some conflicting indicators or the pattern may not be fully formed."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </ConsolidationInsight>
    );
  } else {
    return (
      <VolatilityInsight
        title="Low Confidence Signal"
        description="This analysis has a lower level of confidence. The signals may be weak or there may be significant conflicting indicators. Consider waiting for additional confirmation before taking action."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </VolatilityInsight>
    );
  }
}