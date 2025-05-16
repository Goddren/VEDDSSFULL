import React from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InsightTooltipProps, IconSize } from './tooltip-types';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from 'lucide-react';

export const InsightTooltip: React.FC<InsightTooltipProps> = ({
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
        return <ChevronUp size={size} className="text-green-500 animate-rise" />;
      case 'bearish':
        return <ChevronDown size={size} className="text-red-500 animate-fall" />;
      case 'neutral':
        return <ChevronsUpDown size={size} className="text-yellow-500 animate-shake" />;
      case 'volatile':
        return <AlertTriangle size={size} className="text-orange-500 animate-bounce-custom" />;
      default:
        return <ChevronUp size={size} className="text-gray-500" />;
    }
  };
  
  const getAnimationClass = () => {
    switch (type) {
      case 'bullish': return 'animate-rise';
      case 'bearish': return 'animate-fall';
      case 'neutral': return 'animate-shake';
      case 'volatile': return 'animate-bounce-custom';
      default: return '';
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

export default InsightTooltip;