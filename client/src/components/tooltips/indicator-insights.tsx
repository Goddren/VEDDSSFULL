import React from 'react';
import { 
  InsightTooltip, 
  BullishInsight, 
  BearishInsight, 
  VolatilityInsight, 
  ConsolidationInsight
} from './insight-tooltip';

// A dictionary of common technical indicators with their descriptions and context
export const indicatorInsights = {
  'RSI': {
    title: 'Relative Strength Index (RSI)',
    description: 'A momentum oscillator that measures the speed and change of price movements. Values above 70 indicate overbought conditions, while values below 30 indicate oversold conditions.',
    type: 'volatility' as const,
  },
  'MACD': {
    title: 'Moving Average Convergence Divergence (MACD)',
    description: 'A trend-following momentum indicator that shows the relationship between two moving averages of a security\'s price. The MACD line crossing above the signal line is bullish, while crossing below is bearish.',
    type: 'volatility' as const,
  },
  'Bollinger Bands': {
    title: 'Bollinger Bands',
    description: 'Consists of a middle band (SMA) with two outer bands that expand and contract based on volatility. Price touching the upper band may indicate overbought conditions, while touching the lower band may indicate oversold conditions.',
    type: 'volatility' as const,
  },
  'Stochastic Oscillator': {
    title: 'Stochastic Oscillator',
    description: 'A momentum indicator comparing a security\'s closing price to its price range over a specific period. Readings above 80 indicate overbought conditions, while readings below 20 indicate oversold conditions.',
    type: 'volatility' as const,
  },
  'Moving Average': {
    title: 'Moving Average',
    description: 'Calculates the average price over a specific period. When a faster moving average crosses above a slower one, it generates a bullish signal. When it crosses below, it generates a bearish signal.',
    type: 'consolidation' as const,
  },
  'Ichimoku Cloud': {
    title: 'Ichimoku Cloud',
    description: 'A comprehensive indicator that defines support and resistance, identifies trend direction, gauges momentum, and provides trading signals. Price above the cloud is bullish, below is bearish.',
    type: 'consolidation' as const,
  },
  'Fibonacci Retracement': {
    title: 'Fibonacci Retracement',
    description: 'Uses horizontal lines to indicate potential support or resistance levels where price might reverse direction. Common levels are 23.6%, 38.2%, 50%, 61.8%, and 78.6%.',
    type: 'consolidation' as const,
  },
  'Average True Range (ATR)': {
    title: 'Average True Range (ATR)',
    description: 'Measures market volatility by decomposing the entire range of an asset price for a specific period. Higher ATR indicates higher volatility, useful for setting stop-loss levels.',
    type: 'volatility' as const,
  },
  'Volume': {
    title: 'Volume',
    description: 'Represents the number of shares or contracts traded in a security over a specific period. High volume on price movements often confirms trend strength.',
    type: 'volatility' as const,
  },
  'Parabolic SAR': {
    title: 'Parabolic SAR',
    description: 'Designed to identify potential reversals in price direction. When dots are below price, it\'s bullish; when above, it\'s bearish. Also helps in setting trailing stop-loss orders.',
    type: 'volatility' as const,
  },
  'Support': {
    title: 'Support Level',
    description: 'A price level where a downtrend is expected to pause due to buying interest. If the price breaks below this level, it often becomes resistance.',
    type: 'consolidation' as const,
  },
  'Resistance': {
    title: 'Resistance Level',
    description: 'A price level where an uptrend is expected to pause due to selling interest. If the price breaks above this level, it often becomes support.',
    type: 'consolidation' as const,
  },
  'Channel': {
    title: 'Channel',
    description: 'Consists of two parallel trendlines that connect price highs and lows. Price tends to bounce between these lines, making them good areas for potential buy and sell decisions.',
    type: 'consolidation' as const,
  },
  'Divergence': {
    title: 'Divergence',
    description: 'Occurs when the price of an asset makes a new high or low, but the indicator fails to confirm. Bullish divergence occurs when price makes a lower low but the indicator makes a higher low.',
    type: 'volatility' as const,
  },
  'Breakout': {
    title: 'Breakout',
    description: 'When the price moves outside a defined support or resistance level with increased volume. Often signals the potential start of a new trend.',
    type: 'volatility' as const,
  },
  'Candlestick Pattern': {
    title: 'Candlestick Pattern',
    description: 'Specific formations on candlestick charts that can indicate potential market reversals or continuations. Examples include doji, hammer, engulfing patterns, etc.',
    type: 'volatility' as const,
  },
};

export type IndicatorKey = keyof typeof indicatorInsights;

interface IndicatorInsightComponentProps {
  indicator: IndicatorKey | string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  iconSize?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function IndicatorInsight({
  indicator,
  signal = 'neutral',
  iconSize,
  className,
  children
}: IndicatorInsightComponentProps) {
  // If the indicator is not in our dictionary, use a generic tooltip
  if (!(indicator in indicatorInsights)) {
    return (
      <InsightTooltip
        type="volatility"
        title={indicator}
        description="A technical indicator identified in your chart analysis."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </InsightTooltip>
    );
  }

  const insight = indicatorInsights[indicator as IndicatorKey];
  
  // Override the type based on the signal if it's specified
  const type = signal === 'bullish' 
    ? 'bullish' 
    : signal === 'bearish' 
      ? 'bearish' 
      : insight.type;
  
  switch (type) {
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
    case 'consolidation':
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
    case 'volatility':
    default:
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
  }
}