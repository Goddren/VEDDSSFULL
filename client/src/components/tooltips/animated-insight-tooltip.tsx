import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { InsightTooltipProps, IconSize, TooltipType } from './tooltip-types';
import { ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle, TrendingUp, TrendingDown, BarChart2, LineChart } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AnimatedInsightTooltipProps extends InsightTooltipProps {
  animationType?: 'market' | 'pattern' | 'indicator' | 'volatility';
  strength?: 'weak' | 'moderate' | 'strong';
  showContextualAnimation?: boolean;
}

export const AnimatedInsightTooltip: React.FC<AnimatedInsightTooltipProps> = ({
  type,
  title,
  description,
  iconSize = 'md',
  animationType = 'market',
  strength = 'moderate',
  showContextualAnimation = true,
  children
}) => {
  const [isHovering, setIsHovering] = useState(false);

  const getIconSize = (size: IconSize): number => {
    switch (size) {
      case 'sm': return 16;
      case 'md': return 20;
      case 'lg': return 28;
      default: return 20;
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
  
  const getAnimationClass = () => {
    switch (type) {
      case 'bullish': return 'animate-rise';
      case 'bearish': return 'animate-fall';
      case 'neutral': return 'animate-shake';
      case 'volatile': return 'animate-bounce-custom';
      default: return '';
    }
  };

  const getAnimationDuration = () => {
    switch (strength) {
      case 'weak': return 'animation-duration: 2s';
      case 'strong': return 'animation-duration: 0.8s';
      default: return 'animation-duration: 1.5s';
    }
  };

  const getBackgroundAnimation = (tooltipType: TooltipType, animType: string) => {
    if (!showContextualAnimation) return null;
    
    const animationClasses = {
      'market': {
        'bullish': 'bg-gradient-to-t from-transparent to-green-500/10 animate-rise',
        'bearish': 'bg-gradient-to-b from-transparent to-red-500/10 animate-fall',
        'neutral': 'bg-gradient-to-r from-transparent via-yellow-500/10 to-transparent animate-pulse',
        'volatile': 'bg-gradient-to-r from-orange-500/10 to-red-500/10 animate-pulse'
      },
      'pattern': {
        'bullish': 'bg-[url("data:image/svg+xml,%3Csvg width=\'30\' height=\'30\' viewBox=\'0 0 30 30\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 15 L10 5 L20 15 L30 5\' fill=\'none\' stroke=\'rgba(74, 222, 128, 0.1)\' stroke-width=\'2\'/%3E%3C/svg%3E")] animate-rise',
        'bearish': 'bg-[url("data:image/svg+xml,%3Csvg width=\'30\' height=\'30\' viewBox=\'0 0 30 30\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 5 L10 15 L20 5 L30 15\' fill=\'none\' stroke=\'rgba(248, 113, 113, 0.1)\' stroke-width=\'2\'/%3E%3C/svg%3E")] animate-fall',
        'neutral': 'bg-[url("data:image/svg+xml,%3Csvg width=\'30\' height=\'30\' viewBox=\'0 0 30 30\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 10 L10 15 L20 10 L30 15\' fill=\'none\' stroke=\'rgba(234, 179, 8, 0.1)\' stroke-width=\'2\'/%3E%3C/svg%3E")] animate-shake',
        'volatile': 'bg-[url("data:image/svg+xml,%3Csvg width=\'30\' height=\'30\' viewBox=\'0 0 30 30\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cpath d=\'M0 15 L6 5 L12 20 L18 10 L24 25 L30 15\' fill=\'none\' stroke=\'rgba(249, 115, 22, 0.1)\' stroke-width=\'2\'/%3E%3C/svg%3E")] animate-bounce-custom'
      },
      'indicator': {
        'bullish': 'after:absolute after:inset-0 after:bg-gradient-to-t after:from-transparent after:to-green-500/10 after:animate-rise',
        'bearish': 'after:absolute after:inset-0 after:bg-gradient-to-b after:from-transparent after:to-red-500/10 after:animate-fall',
        'neutral': 'after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-yellow-500/10 after:to-transparent after:animate-pulse',
        'volatile': 'after:absolute after:inset-0 after:bg-gradient-to-r after:from-orange-500/10 after:to-red-500/10 after:animate-pulse'
      },
      'volatility': {
        'bullish': 'bg-gradient-radial from-green-500/5 to-transparent animate-pulse',
        'bearish': 'bg-gradient-radial from-red-500/5 to-transparent animate-pulse',
        'neutral': 'bg-gradient-radial from-yellow-500/5 to-transparent animate-pulse',
        'volatile': 'bg-gradient-radial from-orange-500/5 to-transparent animate-pulse-fast'
      }
    };
    
    const animationStyle = animationClasses[animType as keyof typeof animationClasses]?.[tooltipType as keyof typeof animationClasses['market']];
    return (
      <div
        className={cn(
          "absolute inset-0 pointer-events-none",
          animationStyle
        )}
        style={{ [getAnimationDuration()]: true }}
      />
    );
  };

  const getContextualVisualization = () => {
    if (!showContextualAnimation) return null;

    const icons = {
      'market': {
        'bullish': <TrendingUp className="text-green-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'bearish': <TrendingDown className="text-red-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'neutral': <ChevronsUpDown className="text-yellow-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'volatile': <AlertTriangle className="text-orange-500/20 absolute right-2 bottom-2 h-12 w-12" />
      },
      'pattern': {
        'bullish': <BarChart2 className="text-green-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'bearish': <BarChart2 className="text-red-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'neutral': <BarChart2 className="text-yellow-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'volatile': <BarChart2 className="text-orange-500/20 absolute right-2 bottom-2 h-12 w-12" />
      },
      'indicator': {
        'bullish': <LineChart className="text-green-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'bearish': <LineChart className="text-red-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'neutral': <LineChart className="text-yellow-500/20 absolute right-2 bottom-2 h-12 w-12" />,
        'volatile': <LineChart className="text-orange-500/20 absolute right-2 bottom-2 h-12 w-12" />
      },
      'volatility': {
        'bullish': renderVolatilityLines('low'),
        'bearish': renderVolatilityLines('low'),
        'neutral': renderVolatilityLines('medium'),
        'volatile': renderVolatilityLines('high')
      }
    };

    return icons[animationType as keyof typeof icons]?.[type as keyof typeof icons['market']];
  };

  function renderVolatilityLines(intensity: 'low' | 'medium' | 'high') {
    const lineCount = intensity === 'low' ? 3 : intensity === 'medium' ? 5 : 8;
    const amplitude = intensity === 'low' ? 5 : intensity === 'medium' ? 10 : 15;
    const color = type === 'bullish' ? 'green' : type === 'bearish' ? 'red' : type === 'neutral' ? 'yellow' : 'orange';
    
    return (
      <svg className="absolute right-2 bottom-2 h-12 w-12 text-opacity-20" viewBox="0 0 100 100">
        {Array.from({ length: lineCount }).map((_, index) => {
          const delay = index * 0.2;
          return (
            <path
              key={index}
              d={`M 0,${50 + (index - lineCount/2) * 10} Q 25,${50 + (index - lineCount/2) * 10 - amplitude} 50,${50 + (index - lineCount/2) * 10} Q 75,${50 + (index - lineCount/2) * 10 + amplitude} 100,${50 + (index - lineCount/2) * 10}`}
              stroke={`var(--color-${color}-500)`}
              strokeOpacity="0.2"
              fill="none"
              strokeWidth="2"
              className="animate-pulse"
              style={{ animationDelay: `${delay}s` }}
            />
          );
        })}
      </svg>
    );
  }

  const getBorderColor = () => {
    switch (type) {
      case 'bullish': return 'border-green-500/20';
      case 'bearish': return 'border-red-500/20';
      case 'neutral': return 'border-yellow-500/20';
      case 'volatile': return 'border-orange-500/20';
      default: return 'border-gray-500/20';
    }
  };

  const getShadowColor = () => {
    switch (type) {
      case 'bullish': return 'shadow-green-500/10 hover:shadow-green-500/20';
      case 'bearish': return 'shadow-red-500/10 hover:shadow-red-500/20';
      case 'neutral': return 'shadow-yellow-500/10 hover:shadow-yellow-500/20';
      case 'volatile': return 'shadow-orange-500/10 hover:shadow-orange-500/20';
      default: return 'shadow-gray-500/10 hover:shadow-gray-500/20';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div 
            className={cn("inline-flex items-center gap-1 cursor-help", isHovering && getAnimationClass())}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
          >
            {children || (
              <>
                {title} {getIcon()}
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side="top" 
          className={cn(
            "max-w-xs bg-[#181818]/90 backdrop-blur-sm",
            getBorderColor(),
            getShadowColor(),
            "shadow-lg relative overflow-hidden transition-all duration-200"
          )}
        >
          {getBackgroundAnimation(type, animationType)}
          <div className="flex flex-col gap-1 relative z-10">
            <h4 className="font-medium">
              {title} {getIcon()}
            </h4>
            <p className="text-xs text-gray-400">{description}</p>
          </div>
          {getContextualVisualization()}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default AnimatedInsightTooltip;