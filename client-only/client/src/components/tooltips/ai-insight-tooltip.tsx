import React, { ReactNode, useState } from 'react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { BarChart2, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { cn } from "@/lib/utils";

export type MarketTrend = 'bullish' | 'bearish' | 'neutral' | 'volatile';

interface AIInsightTooltipProps {
  children: ReactNode;
  insight: string;
  marketTrend: MarketTrend;
  title?: string;
  icon?: ReactNode;
  position?: 'top' | 'right' | 'bottom' | 'left';
  className?: string;
}

export function AIInsightTooltip({
  children,
  insight,
  marketTrend,
  title,
  icon,
  position = 'top',
  className
}: AIInsightTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Determine background color and animation based on market trend
  const getTrendStyles = () => {
    switch (marketTrend) {
      case 'bullish':
        return {
          bgClass: 'bg-gradient-to-r from-green-900/90 to-green-800/90 border-green-700',
          iconColor: 'text-green-400',
          animationClass: 'ai-tooltip-bullish-animation',
          icon: icon || <TrendingUp className="h-5 w-5 text-green-400" />
        };
      case 'bearish':
        return {
          bgClass: 'bg-gradient-to-r from-red-900/90 to-red-800/90 border-red-700',
          iconColor: 'text-red-400',
          animationClass: 'ai-tooltip-bearish-animation',
          icon: icon || <TrendingDown className="h-5 w-5 text-red-400" />
        };
      case 'volatile':
        return {
          bgClass: 'bg-gradient-to-r from-amber-900/90 to-amber-800/90 border-amber-700',
          iconColor: 'text-amber-400',
          animationClass: 'ai-tooltip-volatile-animation',
          icon: icon || <AlertCircle className="h-5 w-5 text-amber-400" />
        };
      case 'neutral':
      default:
        return {
          bgClass: 'bg-gradient-to-r from-blue-900/90 to-blue-800/90 border-blue-700',
          iconColor: 'text-blue-400',
          animationClass: 'ai-tooltip-neutral-animation',
          icon: icon || <BarChart2 className="h-5 w-5 text-blue-400" />
        };
    }
  };

  const { bgClass, iconColor, animationClass, icon: trendIcon } = getTrendStyles();

  // Side based on position
  const getSide = () => {
    switch (position) {
      case 'right': return 'left';
      case 'bottom': return 'top';
      case 'left': return 'right';
      case 'top':
      default:
        return 'bottom';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip
        open={isOpen}
        onOpenChange={setIsOpen}
        delayDuration={200}
      >
        <TooltipTrigger
          className={cn("cursor-help outline-none", className)}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(!isOpen);
          }}
        >
          {children}
        </TooltipTrigger>
        <TooltipContent 
          side={getSide()}
          className={cn(
            "p-0 max-w-[280px] border rounded-lg shadow-lg", 
            bgClass
          )}
          sideOffset={8}
        >
          <div className="relative overflow-hidden rounded-lg">
            {/* Animated background effect */}
            <div className={cn(
              "absolute inset-0 opacity-30 pointer-events-none",
              animationClass
            )}>
              {marketTrend === 'bullish' && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-green-500/20 via-green-400/10 to-transparent animate-pulse"></div>
              )}
              {marketTrend === 'bearish' && (
                <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-red-500/20 via-red-400/10 to-transparent animate-pulse"></div>
              )}
              {marketTrend === 'volatile' && (
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 via-amber-400/5 to-amber-500/10 animate-shimmer"></div>
              )}
              {marketTrend === 'neutral' && (
                <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-blue-400/5 to-blue-500/10"></div>
              )}
            </div>

            <div className="relative z-10 p-3">
              {/* Header with icon */}
              <div className="flex items-center mb-2">
                <div className="mr-2">{trendIcon}</div>
                <h3 className={cn("font-medium text-sm", iconColor)}>
                  {title || `${marketTrend.charAt(0).toUpperCase() + marketTrend.slice(1)} Market Insight`}
                </h3>
              </div>

              {/* Insight text */}
              <p className="text-sm text-white">{insight}</p>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}