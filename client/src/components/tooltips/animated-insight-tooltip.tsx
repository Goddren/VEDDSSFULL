import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { 
  BaseTooltipProps, 
  TrendTooltipProps, 
  ConfidenceTooltipProps,
  PatternTooltipProps,
  IndicatorTooltipProps,
  AnimationType
} from './tooltip-types';

// Animation variants based on animation type
const getAnimationVariants = (
  type: AnimationType = 'wave', 
  speed: 'slow' | 'normal' | 'fast' = 'normal',
  intensity: number = 50,
  direction: 'up' | 'down' | 'both' = 'both'
) => {
  const speedMultiplier = speed === 'slow' ? 2 : speed === 'fast' ? 0.5 : 1;
  const duration = 1.5 * speedMultiplier;
  const intensityScale = intensity / 50; // Scale intensity (0-100) so 50 is normal
  
  const variants = {
    wave: {
      animate: {
        y: direction === 'up' ? [-5 * intensityScale, 0] : 
            direction === 'down' ? [0, -5 * intensityScale] : 
            [-5 * intensityScale, 0, -5 * intensityScale],
        transition: {
          y: {
            duration,
            repeat: Infinity,
            repeatType: "reverse" as const,
            ease: "easeInOut"
          }
        }
      }
    },
    zigzag: {
      animate: {
        x: [-5 * intensityScale, 5 * intensityScale],
        transition: {
          x: {
            duration: duration * 0.8,
            repeat: Infinity,
            repeatType: "reverse" as const,
            ease: "easeInOut"
          }
        }
      }
    },
    ripple: {
      initial: { 
        opacity: 0,
        scale: 0.3,
      },
      animate: {
        opacity: [0, 0.5, 0],
        scale: [0.3, 1.2],
        transition: {
          duration,
          repeat: Infinity,
          ease: "easeOut"
        }
      }
    },
    pulse: {
      animate: {
        scale: [1, 1 + (0.05 * intensityScale)],
        opacity: [0.7, 1],
        transition: {
          duration: duration * 0.7,
          repeat: Infinity,
          repeatType: "reverse" as const,
          ease: "easeInOut"
        }
      }
    },
    flash: {
      animate: {
        opacity: [0.5, 1],
        background: ["rgba(255,255,255,0.1)", "rgba(255,255,255,0.3)"],
        transition: {
          duration: duration * 0.5,
          repeat: Infinity,
          repeatType: "reverse" as const,
          ease: "easeInOut"
        }
      }
    },
    arrow: {
      animate: {
        x: [0, 10 * intensityScale, 0],
        transition: {
          duration,
          repeat: Infinity,
          ease: "easeInOut"
        }
      }
    },
    scatter: {
      animate: {
        rotate: [-2 * intensityScale, 2 * intensityScale],
        transition: {
          duration: duration * 1.2,
          repeat: Infinity,
          repeatType: "reverse" as const,
          ease: "easeInOut"
        }
      }
    },
    convergence: {
      animate: {
        scale: [0.95, 1.05],
        opacity: [0.8, 1],
        transition: {
          duration,
          repeat: Infinity,
          repeatType: "reverse" as const,
          ease: "easeInOut"
        }
      }
    }
  };

  return variants[type] || variants.wave;
};

// Animation elements based on animation type
const AnimationElement: React.FC<{ 
  type: AnimationType;
  speed?: 'slow' | 'normal' | 'fast';
  intensity?: number;
  direction?: 'up' | 'down' | 'both';
  gradientColors?: [string, string];
}> = ({ 
  type, 
  speed = 'normal', 
  intensity = 50,
  direction = 'both',
  gradientColors = ['rgba(255, 100, 100, 0.3)', 'rgba(255, 100, 255, 0.1)']
}) => {
  const variants = getAnimationVariants(type, speed, intensity, direction);
  
  // Base styling for all animation elements
  const baseClasses = "absolute inset-0 pointer-events-none";
  
  switch(type) {
    case 'wave':
      return (
        <motion.div 
          className={cn(baseClasses, "rounded-md bg-gradient-to-t")}
          style={{
            backgroundImage: `linear-gradient(to bottom, ${gradientColors[0]}, ${gradientColors[1]})`,
          }}
          variants={variants}
          animate="animate"
        />
      );
      
    case 'zigzag':
      return (
        <motion.div 
          className={cn(baseClasses, "flex items-center justify-center")}
          variants={variants}
          animate="animate"
        >
          <svg viewBox="0 0 100 20" className="w-full h-6 opacity-40">
            <path 
              d="M0,10 L20,5 L40,15 L60,5 L80,15 L100,10" 
              fill="none" 
              stroke={gradientColors[0]} 
              strokeWidth="2"
            />
          </svg>
        </motion.div>
      );
      
    case 'ripple':
      return (
        <motion.div 
          className={cn(baseClasses, "rounded-full border-2")}
          style={{ borderColor: gradientColors[0] }}
          variants={variants}
          initial="initial"
          animate="animate"
        />
      );
      
    case 'pulse':
      return (
        <motion.div 
          className={cn(baseClasses, "rounded-md")}
          style={{ 
            background: `linear-gradient(135deg, ${gradientColors[0]}, ${gradientColors[1]})`,
          }}
          variants={variants}
          animate="animate"
        />
      );
      
    case 'flash':
      return (
        <motion.div 
          className={cn(baseClasses, "rounded-md")}
          variants={variants}
          animate="animate"
        />
      );
      
    case 'arrow':
      return (
        <motion.div 
          className={cn(baseClasses, "flex items-center justify-end pr-2")}
          variants={variants}
          animate="animate"
        >
          <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            className="opacity-40"
          >
            <path 
              d="M5 12H19M19 12L12 5M19 12L12 19" 
              stroke={gradientColors[0]}
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round"
            />
          </svg>
        </motion.div>
      );
      
    case 'scatter':
      return (
        <motion.div 
          className={cn(baseClasses, "flex items-center justify-center")}
          variants={variants}
          animate="animate"
        >
          <div className="w-full h-full flex items-center justify-around">
            {[...Array(5)].map((_, i) => (
              <div 
                key={i}
                className="w-1 h-1 rounded-full bg-opacity-40"
                style={{ background: gradientColors[0] }}
              />
            ))}
          </div>
        </motion.div>
      );
      
    case 'convergence':
      return (
        <motion.div 
          className={cn(baseClasses, "rounded-md border-2")}
          style={{ borderColor: gradientColors[0] }}
          variants={variants}
          animate="animate"
        />
      );
      
    default:
      return null;
  }
};

// Base Animated Tooltip Component
export const AnimatedInsightTooltip: React.FC<BaseTooltipProps> = ({ 
  title,
  description,
  animationType = 'wave',
  animationSpeed = 'normal',
  interactiveAnimation = true,
  className,
  gradientColors = ['rgba(239, 68, 68, 0.5)', 'rgba(239, 68, 68, 0.2)'],
  onClick,
  children,
  ...props
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  
  const handleMouseEnter = () => setIsHovered(true);
  const handleMouseLeave = () => setIsHovered(false);
  
  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild>
          <div 
            className={cn(
              "relative inline-flex items-center justify-center p-2 rounded-md cursor-pointer overflow-hidden",
              "border border-gray-700 bg-black/50 hover:bg-black/30",
              "transition-all duration-300",
              className
            )}
            onClick={onClick}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
            {/* Animation Element */}
            {(interactiveAnimation && isHovered) && (
              <AnimationElement 
                type={animationType}
                speed={animationSpeed}
                gradientColors={gradientColors}
              />
            )}
            
            {/* Content */}
            <div className="relative z-10">
              {children || title}
            </div>
          </div>
        </TooltipTrigger>
        
        <TooltipContent 
          side="top"
          align="center"
          className="max-w-xs bg-black/90 border border-gray-700 text-white p-4 rounded-md shadow-md"
        >
          <div className="space-y-2">
            <h4 className="font-semibold">{title}</h4>
            <p className="text-sm text-gray-300">{description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

// Market Trend Tooltip
export const TrendTooltip: React.FC<TrendTooltipProps> = ({
  trend,
  intensity = 50,
  displayPrice = false,
  priceData,
  ...props
}) => {
  // Determine animation type based on trend
  const getTrendAnimation = (): AnimationType => {
    switch (trend) {
      case 'bullish': return 'wave';
      case 'bearish': return 'wave';
      case 'neutral': return 'pulse';
      case 'volatile': return 'zigzag';
      case 'sideways': return 'scatter';
      default: return 'wave';
    }
  };
  
  // Determine gradient colors based on trend
  const getTrendColors = (): [string, string] => {
    switch (trend) {
      case 'bullish': return ['rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0.2)']; // Green
      case 'bearish': return ['rgba(239, 68, 68, 0.6)', 'rgba(239, 68, 68, 0.2)'];   // Red
      case 'neutral': return ['rgba(156, 163, 175, 0.6)', 'rgba(156, 163, 175, 0.2)']; // Gray
      case 'volatile': return ['rgba(236, 72, 153, 0.6)', 'rgba(236, 72, 153, 0.2)']; // Pink
      case 'sideways': return ['rgba(96, 165, 250, 0.6)', 'rgba(96, 165, 250, 0.2)']; // Blue
      default: return ['rgba(156, 163, 175, 0.6)', 'rgba(156, 163, 175, 0.2)'];
    }
  };
  
  // Get direction for wave animation based on trend
  const getDirection = () => {
    if (trend === 'bullish') return 'up';
    if (trend === 'bearish') return 'down';
    return 'both';
  };
  
  return (
    <AnimatedInsightTooltip
      animationType={getTrendAnimation()}
      gradientColors={getTrendColors()}
      {...props}
    >
      <div className="flex items-center gap-2">
        {trend === 'bullish' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-green-500">
            <path d="M12 5L12 19M12 5L19 12M12 5L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {trend === 'bearish' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-red-500">
            <path d="M12 19L12 5M12 19L19 12M12 19L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {trend === 'neutral' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-500">
            <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {trend === 'volatile' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-pink-500">
            <path d="M2 12L7 7M7 7L12 12M7 7V17M22 12L17 17M17 17L12 12M17 17V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {trend === 'sideways' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-500">
            <path d="M17 8L21 12M21 12L17 16M21 12H3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        <span>{props.children || props.title}</span>
      </div>
    </AnimatedInsightTooltip>
  );
};

// Confidence Tooltip
export const ConfidenceTooltip: React.FC<ConfidenceTooltipProps> = ({
  level,
  percentage = 50,
  emphasize = false,
  ...props
}) => {
  // Determine animation type based on confidence level
  const getConfidenceAnimation = (): AnimationType => {
    switch (level) {
      case 'very-high': return 'pulse';
      case 'high': return 'wave';
      case 'medium': return 'pulse';
      case 'low': return 'scatter';
      default: return 'pulse';
    }
  };
  
  // Determine gradient colors based on confidence level
  const getConfidenceColors = (): [string, string] => {
    switch (level) {
      case 'very-high': return ['rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0.2)']; // Green
      case 'high': return ['rgba(139, 92, 246, 0.6)', 'rgba(139, 92, 246, 0.2)']; // Purple
      case 'medium': return ['rgba(250, 204, 21, 0.6)', 'rgba(250, 204, 21, 0.2)']; // Yellow
      case 'low': return ['rgba(239, 68, 68, 0.6)', 'rgba(239, 68, 68, 0.2)']; // Red
      default: return ['rgba(156, 163, 175, 0.6)', 'rgba(156, 163, 175, 0.2)']; // Gray
    }
  };
  
  return (
    <AnimatedInsightTooltip
      animationType={getConfidenceAnimation()}
      animationSpeed={emphasize ? 'fast' : 'normal'}
      gradientColors={getConfidenceColors()}
      {...props}
    >
      <div className="flex items-center gap-2">
        <div className="relative w-8 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div 
            className={cn(
              "absolute top-0 left-0 h-full rounded-full",
              level === 'very-high' ? 'bg-green-500' :
              level === 'high' ? 'bg-purple-500' :
              level === 'medium' ? 'bg-yellow-500' :
              'bg-red-500'
            )}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <span>{props.children || props.title}</span>
      </div>
    </AnimatedInsightTooltip>
  );
};

// Pattern Tooltip
export const PatternTooltip: React.FC<PatternTooltipProps> = ({
  patternType,
  strength = 'moderate',
  completion = 100,
  direction = 'bullish',
  ...props
}) => {
  // Define animation based on pattern type
  const getPatternAnimation = (): AnimationType => {
    // For simplicity, using basic animations based on pattern categories
    if (['head-and-shoulders', 'double-top', 'double-bottom'].includes(patternType)) {
      return 'wave';
    } else if (['triangle', 'wedge'].includes(patternType)) {
      return 'convergence';
    } else if (['flag', 'pennant'].includes(patternType)) {
      return 'ripple';
    } else if (['channel', 'cup-and-handle'].includes(patternType)) {
      return 'pulse';
    } else {
      return 'scatter';
    }
  };
  
  // Pattern colors based on direction and strength
  const getPatternColors = (): [string, string] => {
    if (direction === 'bullish') {
      return strength === 'strong' ? 
        ['rgba(16, 185, 129, 0.7)', 'rgba(16, 185, 129, 0.2)'] :
        strength === 'moderate' ? 
        ['rgba(16, 185, 129, 0.5)', 'rgba(16, 185, 129, 0.15)'] :
        ['rgba(16, 185, 129, 0.3)', 'rgba(16, 185, 129, 0.1)'];
    } else {
      return strength === 'strong' ? 
        ['rgba(239, 68, 68, 0.7)', 'rgba(239, 68, 68, 0.2)'] :
        strength === 'moderate' ? 
        ['rgba(239, 68, 68, 0.5)', 'rgba(239, 68, 68, 0.15)'] :
        ['rgba(239, 68, 68, 0.3)', 'rgba(239, 68, 68, 0.1)'];
    }
  };
  
  return (
    <AnimatedInsightTooltip
      animationType={getPatternAnimation()}
      gradientColors={getPatternColors()}
      {...props}
    >
      <div className="flex items-center gap-2">
        {/* Pattern icon based on type */}
        {(patternType === 'triangle' || patternType === 'wedge') && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" 
               className={direction === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            <path d="M2 18L12 6L22 18H2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {(patternType === 'head-and-shoulders') && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
               className={direction === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            <path d="M3 18L7 14L12 18L17 14L21 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {(patternType === 'double-top' || patternType === 'double-bottom') && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
               className={direction === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            <path d="M3 12L7 8L12 12L17 8L21 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M3 16L7 12L12 16L17 12L21 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {/* Default pattern icon */}
        {!['triangle', 'wedge', 'head-and-shoulders', 'double-top', 'double-bottom'].includes(patternType) && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
               className={direction === 'bullish' ? 'text-green-500' : 'text-red-500'}>
            <path d="M2 12H6L10 7L14 16L18 12H22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        <span>{props.children || props.title}</span>
      </div>
    </AnimatedInsightTooltip>
  );
};

// Indicator Tooltip
export const IndicatorTooltip: React.FC<IndicatorTooltipProps> = ({
  indicatorType,
  signal = 'hold',
  value,
  threshold,
  ...props
}) => {
  // Define animation based on indicator type
  const getIndicatorAnimation = (): AnimationType => {
    if (['moving-average', 'macd'].includes(indicatorType)) {
      return 'wave';
    } else if (['rsi', 'stochastic'].includes(indicatorType)) {
      return 'pulse';
    } else if (['bollinger-bands', 'fibonacci'].includes(indicatorType)) {
      return 'ripple';
    } else if (['volume', 'support-resistance'].includes(indicatorType)) {
      return 'scatter';
    } else {
      return 'pulse';
    }
  };
  
  // Indicator colors based on signal
  const getIndicatorColors = (): [string, string] => {
    switch (signal) {
      case 'buy': return ['rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0.2)']; // Green
      case 'sell': return ['rgba(239, 68, 68, 0.6)', 'rgba(239, 68, 68, 0.2)']; // Red
      case 'overbought': return ['rgba(239, 68, 68, 0.5)', 'rgba(239, 68, 68, 0.15)']; // Light Red
      case 'oversold': return ['rgba(16, 185, 129, 0.5)', 'rgba(16, 185, 129, 0.15)']; // Light Green
      case 'hold': 
      default: 
        return ['rgba(96, 165, 250, 0.6)', 'rgba(96, 165, 250, 0.2)']; // Blue
    }
  };
  
  return (
    <AnimatedInsightTooltip
      animationType={getIndicatorAnimation()}
      gradientColors={getIndicatorColors()}
      {...props}
    >
      <div className="flex items-center gap-2">
        {/* Signal icon */}
        {signal === 'buy' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-green-500">
            <path d="M12 5L12 19M12 5L19 12M12 5L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {signal === 'sell' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-red-500">
            <path d="M12 19L12 5M12 19L19 12M12 19L5 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {signal === 'overbought' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-red-400">
            <path d="M15 10L12 7M12 7L9 10M12 7V17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {signal === 'oversold' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-green-400">
            <path d="M9 14L12 17M12 17L15 14M12 17V7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        {signal === 'hold' && (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-blue-500">
            <path d="M18 8L22 12M22 12L18 16M22 12H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
        <span>
          {props.children || props.title}
          {value !== undefined && `: ${value}${threshold ? `/${threshold}` : ''}`}
        </span>
      </div>
    </AnimatedInsightTooltip>
  );
};

export default AnimatedInsightTooltip;