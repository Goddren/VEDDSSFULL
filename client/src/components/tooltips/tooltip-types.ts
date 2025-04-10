export type TooltipType = 'bullish' | 'bearish' | 'neutral' | 'volatile';

export type IconSize = 'sm' | 'md' | 'lg';

export type AnimationType = 'market' | 'pattern' | 'indicator' | 'volatility';

export type AnimationStrength = 'weak' | 'moderate' | 'strong';

export interface InsightTooltipProps {
  type: TooltipType;
  title: string;
  description: string;
  iconSize?: IconSize;
  children?: React.ReactNode;
}

export interface AnimatedInsightTooltipProps extends InsightTooltipProps {
  animationType?: AnimationType;
  strength?: AnimationStrength;
  showContextualAnimation?: boolean;
}

export interface PatternInsightProps {
  pattern: string;
  iconSize?: IconSize;
}

export interface IndicatorInsightProps {
  indicator: string;
  signal: TooltipType;
  iconSize?: IconSize;
}

export interface MarketTrendInsightProps {
  trend: string;
  iconSize?: IconSize;
}

export interface ConfidenceInsightProps {
  level: string;
  iconSize?: IconSize;
}

export interface DirectionInsightProps {
  direction: string;
  description?: string;
}

export interface PatternDescriptionMap {
  [key: string]: {
    description: string;
    visual: string;
    class: string;
  }
}

export interface IndicatorDescriptionMap {
  [key: string]: {
    description: string;
    interpretation: string;
    class: string;
  }
}