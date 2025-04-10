// Export all tooltip types
export * from './tooltip-types';

// Create fallback components for compatibility
import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const FallbackTooltip: React.FC<{
  title: string;
  description: string;
  children?: React.ReactNode;
}> = ({ title, description, children }) => {
  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 cursor-help">
            {children || title}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-[#181818] border-[#333333]">
          <div className="flex flex-col gap-1">
            <h4 className="font-medium">{title}</h4>
            <p className="text-xs text-gray-400">{description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Re-export the FallbackTooltip under various names for backward compatibility
export const AnimatedInsightTooltip = FallbackTooltip;
export const TrendTooltip = FallbackTooltip;
export const ConfidenceTooltip = FallbackTooltip;
export const PatternTooltip = FallbackTooltip;
export const IndicatorTooltip = FallbackTooltip;
export const InsightTooltip = FallbackTooltip;
export const SimpleInsight = FallbackTooltip;
export const BullishInsight = FallbackTooltip;
export const BearishInsight = FallbackTooltip;
export const NeutralInsight = FallbackTooltip;
export const VolatileInsight = FallbackTooltip;
export const ConfidenceInsight = FallbackTooltip;
export const PatternInsight = FallbackTooltip;
export const IndicatorInsight = FallbackTooltip;
export const MarketTrendInsight = FallbackTooltip;