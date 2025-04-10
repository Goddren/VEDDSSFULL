import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';

// Basic types
type IconSize = 'sm' | 'md' | 'lg';
type InsightType = 'bullish' | 'bearish' | 'neutral' | 'volatile';

// Basic insight tooltip
interface InsightTooltipProps {
  type: InsightType;
  title: string;
  description: string;
  iconSize?: IconSize;
  children?: React.ReactNode;
}

export const SimpleInsight: React.FC<InsightTooltipProps> = ({
  type,
  title,
  description,
  iconSize = 'md',
  children
}) => {
  const getIconSize = (size: IconSize): number => {
    switch (size) {
      case 'sm': return 14;
      case 'md': return 18;
      case 'lg': return 24;
      default: return 18;
    }
  };

  const getIcon = () => {
    const size = getIconSize(iconSize);
    switch (type) {
      case 'bullish':
        return <ChevronUp size={size} className="text-green-500" />;
      case 'bearish':
        return <ChevronDown size={size} className="text-red-500" />;
      case 'neutral':
        return <ChevronsUpDown size={size} className="text-yellow-500" />;
      case 'volatile':
        return <AlertTriangle size={size} className="text-orange-500" />;
      default:
        return <ChevronUp size={size} className="text-gray-500" />;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
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

// Specific insight types
export const BullishInsight: React.FC<{ title: string; description: string; iconSize?: IconSize; children?: React.ReactNode }> = (props) => (
  <SimpleInsight type="bullish" {...props} />
);

export const BearishInsight: React.FC<{ title: string; description: string; iconSize?: IconSize; children?: React.ReactNode }> = (props) => (
  <SimpleInsight type="bearish" {...props} />
);

export const NeutralInsight: React.FC<{ title: string; description: string; iconSize?: IconSize; children?: React.ReactNode }> = (props) => (
  <SimpleInsight type="neutral" {...props} />
);

export const VolatileInsight: React.FC<{ title: string; description: string; iconSize?: IconSize; children?: React.ReactNode }> = (props) => (
  <SimpleInsight type="volatile" {...props} />
);

// Special insight types for trading
export const ConfidenceInsight: React.FC<{ level: string; iconSize?: IconSize }> = ({ level, iconSize = 'sm' }) => {
  const confidence = level.toLowerCase();
  let description = '';
  let type: InsightType = 'neutral';
  
  if (confidence.includes('high')) {
    description = 'High confidence signals are supported by multiple indicators and chart patterns, suggesting strong probability of the predicted outcome.';
    type = 'bullish';
  } else if (confidence.includes('medium')) {
    description = 'Medium confidence signals have reasonable supporting evidence but may have some conflicting indicators.';
    type = 'neutral';
  } else {
    description = 'Low confidence signals have limited supporting evidence or significant conflicting indicators. Exercise caution.';
    type = 'bearish';
  }

  return (
    <SimpleInsight
      type={type}
      title={`${level} Confidence`}
      description={description}
      iconSize={iconSize}
    >
      <span className="rounded-full w-4 h-4 inline-block bg-gradient-to-r from-yellow-500 to-orange-500"></span>
    </SimpleInsight>
  );
};

export const PatternInsight: React.FC<{ pattern: string; iconSize?: IconSize; children?: React.ReactNode }> = ({ 
  pattern, 
  iconSize = 'sm',
  children 
}) => {
  return (
    <SimpleInsight
      type="neutral"
      title={`${pattern} Pattern`}
      description={`${pattern} is a technical chart pattern that indicates a potential market movement.`}
      iconSize={iconSize}
    >
      {children}
    </SimpleInsight>
  );
};

export const IndicatorInsight: React.FC<{ 
  indicator: string;
  signal?: 'bullish' | 'bearish' | 'neutral';
  iconSize?: IconSize;
  children?: React.ReactNode 
}> = ({ 
  indicator, 
  signal = 'neutral',
  iconSize = 'sm',
  children 
}) => {
  return (
    <SimpleInsight
      type={signal as InsightType}
      title={`${indicator} Indicator`}
      description={`${indicator} is a technical indicator used to analyze market conditions and generate trading signals.`}
      iconSize={iconSize}
    >
      {children}
    </SimpleInsight>
  );
};

export default SimpleInsight;