// Type definitions for the different types of animated tooltips

export type AnimationType = 'wave' | 'zigzag' | 'ripple' | 'pulse' | 'flash' | 'arrow' | 'scatter' | 'convergence';

export type IconSize = 'sm' | 'md' | 'lg';

export type MarketTrend = 'bullish' | 'bearish' | 'neutral' | 'volatile' | 'sideways';

// Props for the basic insight tooltip
export interface InsightTooltipProps {
  type: 'bullish' | 'bearish' | 'neutral' | 'volatile';
  title: string;
  description: string;
  iconSize?: IconSize;
  children?: React.ReactNode;
}

export type ConfidenceLevel = 'low' | 'medium' | 'high' | 'very-high';

export type PatternType = 
  'head-and-shoulders' | 
  'double-top' | 
  'double-bottom' | 
  'triangle' | 
  'wedge' | 
  'flag' | 
  'pennant' | 
  'channel' | 
  'cup-and-handle' |
  'reversal' |
  'continuation';

export type IndicatorType = 
  'moving-average' | 
  'macd' | 
  'rsi' | 
  'bollinger-bands' | 
  'fibonacci' | 
  'volume' | 
  'stochastic' | 
  'support-resistance' |
  'divergence';

// Base tooltip props shared across all tooltip types
export interface BaseTooltipProps {
  title: string;
  description: string;
  animationType?: AnimationType;
  animationSpeed?: 'slow' | 'normal' | 'fast';
  interactiveAnimation?: boolean; // If true, animation responds to hover/click
  className?: string;
  gradientColors?: [string, string]; // For gradient effects
  onClick?: () => void;
  children?: React.ReactNode; // Allow for custom content within tooltip
}

// Trend-specific tooltip for showing market direction with appropriate animations
export interface TrendTooltipProps extends BaseTooltipProps {
  trend: MarketTrend;
  intensity?: number; // 0-100 scale for animation intensity
  displayPrice?: boolean; // Whether to show price movement in the animation
  priceData?: number[]; // Optional array of price points for custom animation
}

// Confidence-specific tooltip that visualizes strength/probability
export interface ConfidenceTooltipProps extends BaseTooltipProps {
  level: ConfidenceLevel;
  percentage?: number; // 0-100
  emphasize?: boolean; // Whether to add extra visual emphasis
}

// Pattern-specific tooltip that visualizes chart patterns
export interface PatternTooltipProps extends BaseTooltipProps {
  patternType: PatternType;
  strength?: 'weak' | 'moderate' | 'strong';
  completion?: number; // 0-100 percentage of pattern completion
  direction?: 'bullish' | 'bearish'; // The direction indicated by the pattern
}

// Indicator-specific tooltip for technical indicators
export interface IndicatorTooltipProps extends BaseTooltipProps {
  indicatorType: IndicatorType;
  signal?: 'buy' | 'sell' | 'hold' | 'overbought' | 'oversold';
  value?: number; // The numeric value of the indicator if applicable
  threshold?: number; // Any relevant threshold for the indicator
}

// Tooltip data interfaces for applying to analysis results
export interface TooltipData {
  id: string;
  type: 'trend' | 'confidence' | 'pattern' | 'indicator';
  title: string;
  description: string;
  properties: Record<string, any>;
}

// Helper function to create tooltip data objects
export function createTrendTooltip(
  title: string, 
  description: string, 
  trend: MarketTrend, 
  intensity?: number
): TooltipData {
  return {
    id: `trend-${Date.now()}`,
    type: 'trend',
    title,
    description,
    properties: {
      trend,
      intensity: intensity || 50
    }
  };
}

export function createConfidenceTooltip(
  title: string, 
  description: string, 
  level: ConfidenceLevel, 
  percentage?: number
): TooltipData {
  return {
    id: `confidence-${Date.now()}`,
    type: 'confidence',
    title,
    description,
    properties: {
      level,
      percentage: percentage || getPercentageFromLevel(level)
    }
  };
}

export function createPatternTooltip(
  title: string, 
  description: string, 
  patternType: PatternType, 
  strength?: 'weak' | 'moderate' | 'strong',
  direction?: 'bullish' | 'bearish'
): TooltipData {
  return {
    id: `pattern-${Date.now()}`,
    type: 'pattern',
    title,
    description,
    properties: {
      patternType,
      strength: strength || 'moderate',
      direction: direction || 'bullish'
    }
  };
}

export function createIndicatorTooltip(
  title: string, 
  description: string, 
  indicatorType: IndicatorType, 
  signal?: 'buy' | 'sell' | 'hold' | 'overbought' | 'oversold',
  value?: number
): TooltipData {
  return {
    id: `indicator-${Date.now()}`,
    type: 'indicator',
    title,
    description,
    properties: {
      indicatorType,
      signal: signal || 'hold',
      value
    }
  };
}

// Helper function to convert confidence level to percentage
function getPercentageFromLevel(level: ConfidenceLevel): number {
  switch (level) {
    case 'low': return 25;
    case 'medium': return 50;
    case 'high': return 75;
    case 'very-high': return 95;
    default: return 50;
  }
}