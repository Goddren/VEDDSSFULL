import React from "react";
import { BullishInsight, BearishInsight, VolatilityInsight, ConsolidationInsight } from "./insight-tooltip";
import { TooltipIconSize } from "./tooltip-types";

// A dictionary of technical indicators with descriptions
export const indicatorInsights = {
  'RSI': {
    title: 'Relative Strength Index',
    description: 'A momentum oscillator that measures the speed and change of price movements. Readings above 70 indicate overbought conditions, while readings below 30 indicate oversold conditions.',
    type: 'volatility' as const,
  },
  'MACD': {
    title: 'Moving Average Convergence Divergence',
    description: 'A trend-following momentum indicator that shows the relationship between two moving averages of a security price. The MACD is calculated by subtracting the 26-period EMA from the 12-period EMA.',
    type: 'volatility' as const,
  },
  'Bollinger Bands': {
    title: 'Bollinger Bands',
    description: 'Volatility bands placed above and below a moving average. Price reaching the upper band indicates overbought conditions, while price reaching the lower band indicates oversold conditions.',
    type: 'volatility' as const,
  },
  'Moving Average': {
    title: 'Moving Average',
    description: 'A calculation to analyze data points by creating a series of averages of different subsets of the full data set. Used to identify the direction of a trend and potential support/resistance levels.',
    type: 'consolidation' as const,
  },
  'Stochastic': {
    title: 'Stochastic Oscillator',
    description: 'A momentum indicator comparing a particular closing price of a security to a range of its prices over a certain period of time. Values above 80 suggest overbought conditions, while values below 20 suggest oversold conditions.',
    type: 'volatility' as const,
  },
  'Ichimoku Cloud': {
    title: 'Ichimoku Cloud',
    description: 'A comprehensive indicator that defines support and resistance, identifies trend direction, gauges momentum, and provides trading signals. Price above the cloud is bullish, while price below the cloud is bearish.',
    type: 'consolidation' as const,
  },
  'Fibonacci Retracement': {
    title: 'Fibonacci Retracement',
    description: 'A technical analysis tool showing potential support and resistance levels based on the Fibonacci sequence. Common retracement levels are 23.6%, 38.2%, 50%, 61.8%, and 78.6%.',
    type: 'consolidation' as const,
  },
  'ADX': {
    title: 'Average Directional Index',
    description: 'A technical indicator used to quantify the strength of a trend. ADX values above 25 suggest a strong trend, while values below 20 suggest a weak trend or ranging market.',
    type: 'volatility' as const,
  },
  'ATR': {
    title: 'Average True Range',
    description: 'A technical indicator that measures market volatility by decomposing the entire range of an asset price for that period. Higher ATR values indicate higher volatility.',
    type: 'volatility' as const,
  },
  'Volume Profile': {
    title: 'Volume Profile',
    description: 'A technical indicator that shows the trading activity at specific price levels over a defined period. It helps identify key support and resistance levels based on trading volume.',
    type: 'consolidation' as const,
  }
};

export type IndicatorKey = keyof typeof indicatorInsights;

interface IndicatorInsightComponentProps {
  indicator: IndicatorKey | string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  iconSize?: TooltipIconSize;
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
      <VolatilityInsight
        title={indicator}
        description="A technical indicator used in trading analysis."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </VolatilityInsight>
    );
  }

  const insight = indicatorInsights[indicator as IndicatorKey];
  
  // For indicators, we also consider the signal direction
  if (signal === 'bullish') {
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
  } else if (signal === 'bearish') {
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
  } else {
    // Use the default type from the dictionary
    switch (insight.type) {
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
}