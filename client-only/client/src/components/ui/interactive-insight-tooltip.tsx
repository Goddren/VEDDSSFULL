import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  TrendingUp, 
  TrendingDown, 
  AlertCircle, 
  CheckCircle,
  HelpCircle,
  BarChart4,
  Lightbulb,
  ArrowUp,
  ArrowDown,
  XCircle,
} from 'lucide-react';

type PatternType = 
  | 'bullish'
  | 'bearish'
  | 'double_top'
  | 'double_bottom'
  | 'head_and_shoulders'
  | 'inverse_head_and_shoulders'
  | 'triangle'
  | 'wedge'
  | 'flag'
  | 'channel'
  | 'support'
  | 'resistance'
  | 'breakout'
  | 'reversal'
  | 'continuation'
  | 'undefined';

interface InteractiveInsightTooltipProps {
  // Original props
  insight?: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  patternType?: PatternType;
  marketTrend?: 'bullish' | 'bearish' | 'neutral';
  expandByDefault?: boolean;
  
  // Market insights page props
  title?: string;
  description?: string;
  context?: 'candlestick' | 'pattern' | 'support' | 'resistance' | 'breakout' | 'trend' | 'volume' | 'divergence' | 'indicator' | 'reversal';
  children?: React.ReactNode;
  
  // Common props
  className?: string;
}

// Animations based on pattern types and market trends
const getAnimation = (patternType: PatternType | undefined, marketTrend: string | undefined) => {
  if (!patternType && !marketTrend) return null;

  // Default animation properties
  let animationProps = {
    type: 'path', // can be 'path', 'bar', 'candle', 'line'
    color: '#22c55e', // green for bullish by default
    secondaryColor: '#ef4444', // red for bearish moves
    duration: 2.5, // seconds
    path: '', // SVG path for path animations
    data: [] as number[], // data points for other animation types
  };
  
  // Set default color based on market trend
  if (marketTrend === 'bearish') {
    animationProps.color = '#ef4444'; // Red for bearish
    animationProps.secondaryColor = '#22c55e'; // Green for potential reversals
  } else if (marketTrend === 'neutral') {
    animationProps.color = '#f59e0b'; // Amber for neutral
  }

  // Adjust animation based on specific pattern
  switch (patternType) {
    case 'bullish':
      animationProps.type = 'line';
      animationProps.data = [10, 15, 12, 18, 16, 22, 25, 30];
      break;
    case 'bearish':
      animationProps.type = 'line';
      animationProps.data = [30, 25, 27, 22, 24, 18, 15, 10];
      break;
    case 'double_top':
      animationProps.type = 'path';
      animationProps.path = 'M10,70 Q20,20 30,70 Q40,120 50,70 Q60,20 70,70 Q80,120 90,140';
      break;
    case 'double_bottom':
      animationProps.type = 'path';
      animationProps.path = 'M10,30 Q20,80 30,30 Q40,-20 50,30 Q60,80 70,30 Q80,-20 90,10';
      break;
    case 'head_and_shoulders':
      animationProps.type = 'path';
      animationProps.path = 'M10,50 Q15,20 20,50 Q25,80 30,20 Q35,-40 40,20 Q45,80 50,50 Q55,20 60,50';
      break;
    case 'inverse_head_and_shoulders':
      animationProps.type = 'path';
      animationProps.path = 'M10,20 Q15,50 20,20 Q25,-10 30,50 Q35,110 40,50 Q45,-10 50,20 Q55,50 60,20';
      break;
    case 'triangle':
      animationProps.type = 'path';
      animationProps.path = 'M10,10 L20,50 L30,20 L40,45 L50,25 L60,40 L70,30 L80,35 L90,33';
      break;
    case 'wedge':
      animationProps.type = 'path';
      animationProps.path = 'M10,10 L30,50 L50,20 L70,40 L90,30';
      break;
    case 'flag':
      animationProps.type = 'path';
      animationProps.path = 'M10,80 L20,10 L30,30 L40,20 L50,35 L60,25 L70,10';
      break;
    case 'channel':
      animationProps.type = 'path';
      animationProps.path = 'M10,30 L20,40 L30,20 L40,30 L50,15 L60,25 L70,10 L80,20';
      break;
    case 'support':
      animationProps.type = 'line';
      animationProps.data = [30, 20, 25, 15, 18, 15, 20, 18, 15];
      break;
    case 'resistance':
      animationProps.type = 'line';
      animationProps.data = [10, 20, 18, 25, 22, 25, 20, 22, 25];
      break;
    case 'breakout':
      animationProps.type = 'line';
      animationProps.data = [15, 16, 15, 17, 15, 16, 15, 25, 35, 45];
      break;
    case 'reversal':
      animationProps.type = 'path';
      animationProps.path = marketTrend === 'bearish' 
        ? 'M10,10 L30,60 L50,80 L70,50 L90,20' // Bearish to bullish
        : 'M10,70 L30,30 L50,10 L70,40 L90,70'; // Bullish to bearish
      break;
    case 'continuation':
      animationProps.type = 'line';
      animationProps.data = marketTrend === 'bullish'
        ? [10, 20, 15, 25, 20, 30, 25, 35]
        : [35, 25, 30, 20, 25, 15, 20, 10];
      break;
    default:
      animationProps.type = 'line';
      animationProps.data = [20, 22, 18, 25, 17, 28, 21, 24];
  }

  return animationProps;
};

// Line animation component
const LineAnimation = ({ data, color }: { data: number[], color: string }) => {
  const maxValue = Math.max(...data);
  const minValue = Math.min(...data);
  const range = maxValue - minValue;
  const normalized = data.map(val => 100 - ((val - minValue) / range) * 80);
  
  // Create points for SVG polyline
  const points = normalized.map((y, i) => {
    return `${(i / (data.length - 1)) * 100},${y}`;
  }).join(' ');

  return (
    <div className="h-[80px] w-full overflow-hidden">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <motion.polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, ease: "easeInOut" }}
        />
        {/* Add dots at each data point */}
        {normalized.map((y, i) => (
          <motion.circle
            key={i}
            cx={(i / (data.length - 1)) * 100}
            cy={y}
            r="1.5"
            fill={color}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: (i / data.length) * 1.5 }}
          />
        ))}
      </svg>
    </div>
  );
};

// Path animation component
const PathAnimation = ({ path, color }: { path: string, color: string }) => {
  return (
    <div className="h-[80px] w-full overflow-hidden">
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        preserveAspectRatio="none"
      >
        <motion.path
          d={path}
          fill="none"
          stroke={color}
          strokeWidth="2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
      </svg>
    </div>
  );
};

export const InteractiveInsightTooltip: React.FC<InteractiveInsightTooltipProps> = ({
  // Handle both API interfaces
  insight,
  title,
  description,
  type = 'info',
  patternType,
  marketTrend,
  context,
  className = '',
  expandByDefault = false,
  children,
}) => {
  const [isExpanded, setIsExpanded] = useState(expandByDefault);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Determine what type of content we have
  const isNewFormat = !!title || !!description || !!context;
  
  // Map context to patternType if needed
  const effectivePatternType = patternType || 
    (context === 'candlestick' ? 'continuation' :
    context === 'support' ? 'support' :
    context === 'resistance' ? 'resistance' :
    context === 'breakout' ? 'breakout' :
    context === 'reversal' ? 'reversal' :
    context === 'pattern' ? 'triangle' : undefined);
  
  // Map type string to trend if applicable
  const effectiveMarketTrend = marketTrend || 
    (type === 'bullish' ? 'bullish' : 
    type === 'bearish' ? 'bearish' : 
    type === 'neutral' ? 'neutral' : undefined);
  
  const animation = getAnimation(effectivePatternType as PatternType, effectiveMarketTrend);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  const getIcon = () => {
    // Support both the new format from market-insights.tsx and original format
    if (isNewFormat) {
      if (type === 'bullish') {
        return <TrendingUp className="h-5 w-5 text-green-500" />;
      } else if (type === 'bearish') {
        return <TrendingDown className="h-5 w-5 text-red-500" />;
      } else if (type === 'volatile') {
        return <Activity className="h-5 w-5 text-amber-500" />;
      } else if (type === 'neutral') {
        return <BarChart4 className="h-5 w-5 text-blue-500" />;
      }
    }
    
    // Original format icon selection
    switch (type) {
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-green-500" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-500" />;
      case 'info':
      default:
        if (effectivePatternType) {
          if (effectivePatternType.includes('bullish') || effectiveMarketTrend === 'bullish') {
            return <TrendingUp className="h-5 w-5 text-green-500" />;
          } else if (effectivePatternType.includes('bearish') || effectiveMarketTrend === 'bearish') {
            return <TrendingDown className="h-5 w-5 text-red-500" />;
          } else {
            return <BarChart4 className="h-5 w-5 text-blue-500" />;
          }
        }
        return <Lightbulb className="h-5 w-5 text-blue-500" />;
    }
  };

  // Get background color based on type
  const getBgColor = () => {
    // Support market trend colors for new format
    if (isNewFormat) {
      if (type === 'bullish') {
        return 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800';
      } else if (type === 'bearish') {
        return 'bg-rose-50 border-rose-200 dark:bg-rose-950 dark:border-rose-800';
      } else if (type === 'volatile') {
        return 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800';
      } else if (type === 'neutral') {
        return 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
      }
    }
    
    // Original type colors
    switch (type) {
      case 'warning':
        return 'bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800';
      case 'success':
        return 'bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800';
      case 'error':
        return 'bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800';
    }
  };

  const getColorBasedOnMarketTrend = () => {
    if (effectiveMarketTrend === 'bullish' || type === 'bullish') {
      return 'text-green-600 dark:text-green-400';
    } else if (effectiveMarketTrend === 'bearish' || type === 'bearish') {
      return 'text-red-600 dark:text-red-400';
    } else if (type === 'volatile') {
      return 'text-amber-600 dark:text-amber-400';
    }
    return '';
  };

  // Render the arrow based on market trend
  const renderTrendArrow = () => {
    if (effectiveMarketTrend === 'bullish' || type === 'bullish') {
      return (
        <motion.div
          className="text-green-500"
          initial={{ y: 0 }}
          animate={{ y: [-5, 0, -5] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <ArrowUp className="h-5 w-5" />
        </motion.div>
      );
    } else if (effectiveMarketTrend === 'bearish' || type === 'bearish') {
      return (
        <motion.div
          className="text-red-500"
          initial={{ y: 0 }}
          animate={{ y: [5, 0, 5] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <ArrowDown className="h-5 w-5" />
        </motion.div>
      );
    }
    return null;
  };

  return (
    <div 
      className={`relative ${className}`}
      ref={tooltipRef}
    >
      {/* Clickable Tooltip Trigger - Supporting both formats */}
      {children ? (
        // Market insights style with children as trigger
        <div onClick={() => setIsExpanded(!isExpanded)}>
          {children}
        </div>
      ) : (
        // Original style with pill button
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          className={`
            inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm 
            font-medium border cursor-pointer transition-colors hover:opacity-80
            ${getBgColor()}
          `}
        >
          {getIcon()}
          <span className={getColorBasedOnMarketTrend()}>
            {title || (effectivePatternType ? effectivePatternType.replace(/_/g, ' ') : 'Insight')}
          </span>
          {renderTrendArrow()}
        </div>
      )}

      {/* Expanded Tooltip Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={`
              absolute z-50 mt-2 p-4 rounded-lg shadow-lg border 
              ${getBgColor()}
              w-[300px] max-w-[95vw]
            `}
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getIcon()}
                  <h3 className="font-semibold">
                    {title || 
                      (effectivePatternType 
                        ? effectivePatternType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) 
                        : 'Market Insight')}
                  </h3>
                </div>
                <button 
                  onClick={() => setIsExpanded(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>

              {/* Animation based on pattern */}
              {animation && (
                <div className="py-1">
                  {animation.type === 'line' && (
                    <LineAnimation data={animation.data} color={animation.color} />
                  )}
                  {animation.type === 'path' && (
                    <PathAnimation path={animation.path} color={animation.color} />
                  )}
                </div>
              )}

              <p className="text-sm">{description || insight}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InteractiveInsightTooltip;