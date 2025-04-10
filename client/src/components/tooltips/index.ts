// Export all tooltip types
export * from './tooltip-types';

// Export animated components for the showcase
export { 
  default as AnimatedInsightTooltip,
  TrendTooltip,
  ConfidenceTooltip,
  PatternTooltip,
  IndicatorTooltip
} from './animated-insight-tooltip';

// Export basic insight tooltip
export { default as InsightTooltip } from './insight-tooltip';

// Import and export simple insight components
import SimpleInsightDefault from './simple-insight';
export const SimpleInsight = SimpleInsightDefault;

export {
  BullishInsight,
  BearishInsight,
  NeutralInsight,
  VolatileInsight,
  ConfidenceInsight,
  PatternInsight,
  IndicatorInsight
} from './simple-insight';

// Aliases for backward compatibility
export const MarketTrendInsight = TrendTooltip;