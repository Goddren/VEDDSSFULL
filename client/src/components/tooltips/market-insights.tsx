import React from "react";
import { BullishInsight, BearishInsight, VolatilityInsight, BreakoutInsight, ConsolidationInsight } from "./insight-tooltip";
import { TooltipIconSize } from "./tooltip-types";

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
    description: 'The market has a slight downward bias but lacks strong momentum. While the trend is negative, it may be close to finding support.',
    type: 'bearish' as const,
  },
  'Sideways': {
    title: 'Sideways Market',
    description: 'The market is moving in a range-bound pattern, neither trending up nor down significantly. This indicates a balance between buyers and sellers.',
    type: 'consolidation' as const,
  },
  'Volatile': {
    title: 'Volatile Market',
    description: 'The market shows significant price fluctuations with rapid moves in both directions. Risk management becomes essential in such conditions.',
    type: 'volatility' as const,
  },
  'Breakout Potential': {
    title: 'Breakout Potential',
    description: 'The market is coiling or testing a key level, suggesting an imminent breakout. The direction of the breakout often determines the next significant move.',
    type: 'breakout' as const,
  },
  'Strong Support': {
    title: 'Strong Support Level',
    description: 'Price is approaching a significant support zone where buying pressure has historically overwhelmed selling pressure.',
    type: 'bullish' as const,
  },
  'Strong Resistance': {
    title: 'Strong Resistance Level',
    description: 'Price is approaching a significant resistance zone where selling pressure has historically overwhelmed buying pressure.',
    type: 'bearish' as const,
  }
};

export type MarketInsightKey = keyof typeof marketInsights;

// Confidence levels
export const confidenceInsights = {
  'Low': {
    title: 'Low Confidence Signal',
    description: 'This signal indicates some potential for the predicted market direction but has limited supporting evidence or conflicting indicators. Consider waiting for confirmation before taking action.',
    type: 'volatility' as const,
  },
  'Medium': {
    title: 'Medium Confidence Signal',
    description: 'This signal has reasonable supporting evidence from multiple indicators or patterns, suggesting a moderate probability of the predicted market direction being accurate.',
    type: 'consolidation' as const,
  },
  'High': {
    title: 'High Confidence Signal',
    description: 'This signal has strong supporting evidence across multiple timeframes and technical indicators, suggesting a high probability of the predicted market direction being accurate.',
    type: 'bullish' as const,
  }
};

export type ConfidenceKey = keyof typeof confidenceInsights;

interface MarketTrendInsightProps {
  trend: MarketInsightKey | string;
  iconSize?: TooltipIconSize;
  className?: string;
  children?: React.ReactNode;
}

interface ConfidenceInsightProps {
  level: ConfidenceKey | string;
  iconSize?: TooltipIconSize;
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
    return (
      <ConsolidationInsight
        title={trend}
        description="Market trend identified in chart analysis."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </ConsolidationInsight>
    );
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

export function ConfidenceInsight({
  level,
  iconSize,
  className,
  children
}: ConfidenceInsightProps) {
  // If the confidence level is not in our dictionary, use a generic tooltip
  if (!(level in confidenceInsights)) {
    return (
      <ConsolidationInsight
        title={`${level} Confidence`}
        description="The level of confidence in the analysis prediction."
        iconSize={iconSize}
        className={className}
      >
        {children}
      </ConsolidationInsight>
    );
  }

  const insight = confidenceInsights[level as ConfidenceKey];
  
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