import React, { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';

// Basic type for tooltip insights
export type InsightType = 'bullish' | 'bearish' | 'neutral' | 'volatile';

// Common props shared across all tooltips
interface TooltipBaseProps {
  title: string;
  description: string;
  children?: ReactNode;
}

// AnimatedInsightTooltip - This is a simplified version
const AnimatedInsightTooltip: React.FC<TooltipBaseProps & { type?: InsightType }> = ({
  title,
  description,
  type = 'neutral',
  children
}) => {
  // Simple icon selector based on type
  const getIcon = () => {
    switch (type) {
      case 'bullish':
        return <ChevronUp size={18} className="text-green-500" />;
      case 'bearish':
        return <ChevronDown size={18} className="text-red-500" />;
      case 'neutral':
        return <ChevronsUpDown size={18} className="text-yellow-500" />;
      case 'volatile':
        return <AlertTriangle size={18} className="text-orange-500" />;
      default:
        return <ChevronUp size={18} className="text-gray-500" />;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={200}>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 cursor-help">
            {children || (
              <>
                {title} {getIcon()}
              </>
            )}
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

// Export specialized tooltips that use the base implementation
export const TrendTooltip: React.FC<TooltipBaseProps & { trend: string }> = ({ 
  trend, 
  title, 
  description, 
  children 
}) => {
  const type: InsightType = trend.toLowerCase().includes('bullish') ? 'bullish' :
    trend.toLowerCase().includes('bearish') ? 'bearish' :
    trend.toLowerCase().includes('volatile') ? 'volatile' : 'neutral';
  
  return (
    <AnimatedInsightTooltip
      type={type}
      title={title || `${trend} Trend`}
      description={description || `The market is currently in a ${trend.toLowerCase()} trend.`}
    >
      {children}
    </AnimatedInsightTooltip>
  );
};

export const ConfidenceTooltip: React.FC<TooltipBaseProps & { confidence: string }> = ({ 
  confidence, 
  title, 
  description, 
  children 
}) => {
  return (
    <AnimatedInsightTooltip
      type={confidence.toLowerCase().includes('high') ? 'bullish' : 
        confidence.toLowerCase().includes('low') ? 'bearish' : 'neutral'}
      title={title || `${confidence} Confidence`}
      description={description || `This analysis has ${confidence.toLowerCase()} confidence.`}
    >
      {children}
    </AnimatedInsightTooltip>
  );
};

export const PatternTooltip: React.FC<TooltipBaseProps & { pattern: string }> = ({ 
  pattern, 
  title, 
  description, 
  children 
}) => {
  return (
    <AnimatedInsightTooltip
      type="neutral"
      title={title || `${pattern} Pattern`}
      description={description || `${pattern} is a chart pattern that may indicate market direction.`}
    >
      {children}
    </AnimatedInsightTooltip>
  );
};

export const IndicatorTooltip: React.FC<TooltipBaseProps & { 
  indicator: string;
  signal?: InsightType;
}> = ({ 
  indicator, 
  signal = 'neutral',
  title, 
  description, 
  children 
}) => {
  return (
    <AnimatedInsightTooltip
      type={signal}
      title={title || `${indicator} Indicator`}
      description={description || `${indicator} is a technical indicator used for market analysis.`}
    >
      {children}
    </AnimatedInsightTooltip>
  );
};

export default AnimatedInsightTooltip;