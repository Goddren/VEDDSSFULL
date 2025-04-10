// Export all tooltip components and types
export * from './tooltip-types';

// Export animated tooltip components (used by showcase page)
export { 
  default as AnimatedInsightTooltip,
  AnimatedInsightTooltip as BaseTooltip, 
  TrendTooltip,
  ConfidenceTooltip,
  PatternTooltip,
  IndicatorTooltip
} from './animated-insight-tooltip';

// Export basic insight tooltip for simple usage
export { default as InsightTooltip } from './insight-tooltip';

// Export simple insight components that will be used in the application UI
export {
  SimpleInsight,
  BullishInsight,
  BearishInsight,
  NeutralInsight,
  VolatileInsight,
  ConfidenceInsight,
  PatternInsight,
  IndicatorInsight
} from './simple-insight';

// For compatibility with existing code, export aliases
import { SimpleInsight as SI } from './simple-insight';
export const MarketTrendInsight = SI;