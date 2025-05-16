// Export types
export * from './tooltip-types';

// Export properly wrapped React components
import { 
  InsightTooltipWrapper as InsightTooltip,
  IndicatorInsightWrapper as IndicatorInsight,
  PatternInsightWrapper as PatternInsight,
  MarketTrendInsightWrapper as MarketTrendInsight,
  ConfidenceInsightWrapper as ConfidenceInsight
} from './wrapper-components';

export {
  InsightTooltip,
  IndicatorInsight,
  PatternInsight,
  MarketTrendInsight,
  ConfidenceInsight
};

// Dummy exports for components we aren't actively using
export const AnimatedInsightTooltip = 'AnimatedInsightTooltip';
export const TrendTooltip = 'TrendTooltip';
export const ConfidenceTooltip = 'ConfidenceTooltip';
export const PatternTooltip = 'PatternTooltip';
export const IndicatorTooltip = 'IndicatorTooltip';
export const SimpleInsight = 'SimpleInsight';
export const BullishInsight = 'BullishInsight';
export const BearishInsight = 'BearishInsight';
export const NeutralInsight = 'NeutralInsight';
export const VolatileInsight = 'VolatileInsight';
export const VolatilityInsight = 'VolatilityInsight';