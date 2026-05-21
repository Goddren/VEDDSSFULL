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

// Placeholder components for showcase/demo pages
import React from 'react';
const _noop = (_props: Record<string, any>) => null as any;
export const AnimatedInsightTooltip: React.FC<Record<string, any>> = _noop;
export const TrendTooltip: React.FC<Record<string, any>> = _noop;
export const ConfidenceTooltip: React.FC<Record<string, any>> = _noop;
export const PatternTooltip: React.FC<Record<string, any>> = _noop;
export const IndicatorTooltip: React.FC<Record<string, any>> = _noop;
export const SimpleInsight: React.FC<Record<string, any>> = _noop;
export const BullishInsight: React.FC<Record<string, any>> = _noop;
export const BearishInsight: React.FC<Record<string, any>> = _noop;
export const NeutralInsight: React.FC<Record<string, any>> = _noop;
export const VolatileInsight: React.FC<Record<string, any>> = _noop;
export const VolatilityInsight: React.FC<Record<string, any>> = _noop;