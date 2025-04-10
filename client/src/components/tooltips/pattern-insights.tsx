import React from "react";
import { InsightTooltip, BullishInsight, BearishInsight, VolatilityInsight, BreakoutInsight, ConsolidationInsight } from "./insight-tooltip";
import { TooltipIconSize } from "./tooltip-types";

// A dictionary of chart patterns with descriptions
export const patternInsights = {
  'Head and Shoulders': {
    title: 'Head and Shoulders Pattern',
    description: 'A reversal pattern consisting of three peaks, with the middle peak (head) being the highest and the two outer peaks (shoulders) being lower and roughly equal in height.',
    type: 'bearish' as const,
    strength: 'Strong reversal signal when occurring after an uptrend.'
  },
  'Inverse Head and Shoulders': {
    title: 'Inverse Head and Shoulders Pattern',
    description: 'A reversal pattern consisting of three troughs, with the middle trough (head) being the lowest and the two outer troughs (shoulders) being higher and roughly equal in height.',
    type: 'bullish' as const,
    strength: 'Strong reversal signal when occurring after a downtrend.'
  },
  'Double Top': {
    title: 'Double Top Pattern',
    description: 'A reversal pattern formed when price reaches a high point, retraces, and then returns to approximately the same high before declining again.',
    type: 'bearish' as const,
    strength: 'More reliable when the second peak fails to reach the height of the first.'
  },
  'Double Bottom': {
    title: 'Double Bottom Pattern',
    description: 'A reversal pattern formed when price reaches a low point, rebounds, and then returns to approximately the same low before rising again.',
    type: 'bullish' as const,
    strength: 'More reliable when the second bottom is higher than the first.'
  },
  'Ascending Triangle': {
    title: 'Ascending Triangle Pattern',
    description: 'A continuation pattern with a flat upper trendline and an upward-sloping lower trendline, indicating accumulation and typically breaking to the upside.',
    type: 'bullish' as const,
    strength: 'Most reliable when formed during an uptrend.'
  },
  'Descending Triangle': {
    title: 'Descending Triangle Pattern',
    description: 'A continuation pattern with a flat lower trendline and a downward-sloping upper trendline, indicating distribution and typically breaking to the downside.',
    type: 'bearish' as const,
    strength: 'Most reliable when formed during a downtrend.'
  },
  'Triangle': {
    title: 'Triangle Pattern',
    description: 'A consolidation pattern where price movement narrows, forming a triangle. Can be ascending, descending, or symmetrical, each suggesting different potential outcomes.',
    type: 'consolidation' as const,
    strength: 'Direction after breakout often continues the previous trend direction.'
  },
  'Flag': {
    title: 'Flag Pattern',
    description: 'A continuation pattern that forms after a strong price movement, followed by a brief consolidation against the trend, resembling a flag on a pole.',
    type: 'consolidation' as const,
    strength: 'Usually continues in the direction of the initial trend after completion.'
  },
  'Pennant': {
    title: 'Pennant Pattern',
    description: 'Similar to a flag but forms a triangular pattern during the consolidation phase. A short-term continuation pattern after a sharp price movement.',
    type: 'consolidation' as const,
    strength: 'High reliability for trend continuation after breakout.'
  },
  'Cup and Handle': {
    title: 'Cup and Handle Pattern',
    description: 'A bullish continuation pattern resembling a cup with a handle, indicating a potential upward movement after a consolidation period.',
    type: 'bullish' as const,
    strength: 'More reliable when the cup is U-shaped rather than V-shaped.'
  },
  'Falling Wedge': {
    title: 'Falling Wedge Pattern',
    description: 'A bullish pattern formed by converging trendlines, both sloping downward. Suggests a potential upward breakout despite the downward price action.',
    type: 'bullish' as const,
    strength: 'Strong reversal signal when it forms during a downtrend.'
  },
  'Rising Wedge': {
    title: 'Rising Wedge Pattern',
    description: 'A bearish pattern formed by converging trendlines, both sloping upward. Suggests a potential downward breakout despite the upward price action.',
    type: 'bearish' as const,
    strength: 'Reliable reversal signal when it forms during an uptrend.'
  },
  'Breakout': {
    title: 'Breakout',
    description: 'A significant movement through an established support or resistance level, often leading to accelerated price movement in the breakout direction.',
    type: 'breakout' as const,
    strength: 'Stronger when accompanied by high volume and when the level was tested multiple times before.'
  },
  'Fibonacci Retracement': {
    title: 'Fibonacci Retracement',
    description: 'Price levels derived from the Fibonacci sequence that often act as support or resistance. Common retracement levels are 38.2%, 50%, and 61.8%.',
    type: 'consolidation' as const,
    strength: 'More reliable when multiple Fibonacci levels coincide with other technical indicators.'
  },
  'RSI Divergence': {
    title: 'RSI Divergence',
    description: 'When price makes a new high/low but RSI does not confirm by making a corresponding high/low. Signals potential trend reversal.',
    type: 'volatility' as const,
    strength: 'Strong reversal signal, especially when RSI is in overbought/oversold territory.'
  },
  'MACD Crossover': {
    title: 'MACD Crossover',
    description: 'When the MACD line crosses above or below the signal line, indicating potential buy or sell signals respectively.',
    type: 'volatility' as const,
    strength: 'More reliable in trending markets than in ranging markets.'
  },
  'Bollinger Band Squeeze': {
    title: 'Bollinger Band Squeeze',
    description: 'When Bollinger Bands contract, indicating low volatility, often preceding a period of high volatility and significant price movement.',
    type: 'volatility' as const,
    strength: 'Does not predict direction but signals potential for a strong move in either direction.'
  },
};

export type PatternKey = keyof typeof patternInsights;

interface PatternInsightComponentProps {
  pattern: PatternKey | string;
  iconSize?: TooltipIconSize;
  className?: string;
  children?: React.ReactNode;
}

export function PatternInsight({
  pattern,
  iconSize,
  className,
  children
}: PatternInsightComponentProps) {
  // If the pattern is not in our dictionary, use a generic tooltip
  if (!(pattern in patternInsights)) {
    return (
      <InsightTooltip
        type="consolidation"
        title={pattern}
        description="A trading pattern identified in your chart analysis."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </InsightTooltip>
    );
  }

  const insight = patternInsights[pattern as PatternKey];
  
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