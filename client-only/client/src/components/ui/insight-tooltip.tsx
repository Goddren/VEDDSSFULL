import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Info, AlertTriangle, TrendingUp, TrendingDown, BarChart2, Zap, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface InsightTooltipProps {
  title: string;
  content: string;
  icon?: 'info' | 'warning' | 'bullish' | 'bearish' | 'volatility' | 'signal';
  animationType?: 'uptrend' | 'downtrend' | 'volatility' | 'consolidation' | 'breakout' | 'none';
  className?: string;
  showButton?: boolean;
  buttonText?: string;
  onButtonClick?: () => void;
}

export function InsightTooltip({
  title,
  content,
  icon = 'info',
  animationType = 'none',
  className,
  showButton = false,
  buttonText = 'Learn More',
  onButtonClick
}: InsightTooltipProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<HTMLDivElement>(null);

  // Handle outside click to close tooltip
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (tooltipRef.current && !tooltipRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get icon based on type
  const getIcon = () => {
    switch (icon) {
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case 'bullish':
        return <TrendingUp className="h-4 w-4 text-emerald-500" />;
      case 'bearish':
        return <TrendingDown className="h-4 w-4 text-rose-500" />;
      case 'volatility':
        return <BarChart2 className="h-4 w-4 text-purple-500" />;
      case 'signal':
        return <Zap className="h-4 w-4 text-amber-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  // Render animation based on type
  const renderAnimation = () => {
    if (animationType === 'none' || !isExpanded) return null;

    const animationStyles = {
      height: '120px',
      overflow: 'hidden',
      position: 'relative' as const,
      borderRadius: '0.375rem',
      marginTop: '0.75rem',
      marginBottom: '0.75rem',
      backgroundColor: 'rgba(0, 0, 0, 0.2)',
    };

    return (
      <div 
        ref={animationRef} 
        style={animationStyles} 
        className="relative"
      >
        {animationType === 'uptrend' && (
          <UptrendAnimation />
        )}
        {animationType === 'downtrend' && (
          <DowntrendAnimation />
        )}
        {animationType === 'volatility' && (
          <VolatilityAnimation />
        )}
        {animationType === 'consolidation' && (
          <ConsolidationAnimation />
        )}
        {animationType === 'breakout' && (
          <BreakoutAnimation />
        )}
      </div>
    );
  };

  return (
    <div 
      ref={tooltipRef}
      className={cn(
        "relative inline-block",
        className
      )}
    >
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-center p-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        aria-label={`Tooltip for ${title}`}
      >
        {getIcon()}
      </button>

      {/* Tooltip content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -5 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -5 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 w-72 md:w-80 p-4 bg-white dark:bg-gray-900 shadow-lg rounded-lg border border-gray-200 dark:border-gray-800 mt-2 left-0"
          >
            <div className="flex items-start justify-between">
              <h4 className="font-medium text-gray-900 dark:text-gray-100 flex items-center gap-1.5">
                {getIcon()}
                {title}
              </h4>
              <button
                onClick={() => setIsExpanded(false)}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            {/* Animation area */}
            {renderAnimation()}

            <p className="text-sm text-gray-600 dark:text-gray-300 mt-2">
              {content}
            </p>

            {showButton && (
              <Button 
                variant="outline" 
                className="mt-3 text-xs py-1 h-auto w-full flex items-center justify-center gap-1"
                onClick={onButtonClick}
              >
                {buttonText}
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Animation Components
function UptrendAnimation() {
  return (
    <motion.div className="w-full h-full p-2 flex items-center justify-center">
      <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none">
        {/* Background grid lines */}
        <g stroke="rgba(255,255,255,0.1)" strokeWidth="0.5">
          {[0, 20, 40, 60, 80, 100].map(x => (
            <line key={`vline-${x}`} x1={x} y1="0" x2={x} y2="60" />
          ))}
          {[0, 15, 30, 45, 60].map(y => (
            <line key={`hline-${y}`} x1="0" y1={y} x2="100" y2={y} />
          ))}
        </g>
        
        {/* Uptrend line */}
        <motion.path
          d="M0,60 L20,50 L40,45 L60,30 L80,20 L100,5"
          stroke="#10b981"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        
        {/* Price candles */}
        {[
          { x: 10, open: 55, close: 50, high: 48, low: 58 },
          { x: 30, open: 48, close: 42, high: 40, low: 50 },
          { x: 50, open: 38, close: 30, high: 28, low: 40 },
          { x: 70, open: 25, close: 18, high: 16, low: 28 },
          { x: 90, open: 16, close: 8, high: 5, low: 18 },
        ].map((candle, i) => (
          <motion.g key={`candle-${i}`} 
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.2 + 0.5, duration: 0.3 }}
          >
            {/* Candle wick */}
            <line 
              x1={candle.x} y1={candle.high} 
              x2={candle.x} y2={candle.low} 
              stroke="#10b981" 
              strokeWidth="1"
            />
            {/* Candle body */}
            <rect 
              x={candle.x - 3} 
              y={Math.min(candle.open, candle.close)} 
              width="6" 
              height={Math.abs(candle.open - candle.close)} 
              fill="#10b981" 
              opacity="0.8"
            />
          </motion.g>
        ))}
        
        {/* Moving average */}
        <motion.path
          d="M0,58 L25,48 L50,38 L75,25 L100,12"
          stroke="rgba(59, 130, 246, 0.6)"
          strokeWidth="1.5"
          strokeDasharray="2,2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1 }}
        />
      </svg>
    </motion.div>
  );
}

function DowntrendAnimation() {
  return (
    <motion.div className="w-full h-full p-2 flex items-center justify-center">
      <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none">
        {/* Background grid lines */}
        <g stroke="rgba(255,255,255,0.1)" strokeWidth="0.5">
          {[0, 20, 40, 60, 80, 100].map(x => (
            <line key={`vline-${x}`} x1={x} y1="0" x2={x} y2="60" />
          ))}
          {[0, 15, 30, 45, 60].map(y => (
            <line key={`hline-${y}`} x1="0" y1={y} x2="100" y2={y} />
          ))}
        </g>
        
        {/* Downtrend line */}
        <motion.path
          d="M0,5 L20,15 L40,25 L60,35 L80,45 L100,58"
          stroke="#ef4444"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        
        {/* Price candles */}
        {[
          { x: 10, open: 8, close: 12, high: 5, low: 15 },
          { x: 30, open: 17, close: 22, high: 15, low: 25 },
          { x: 50, open: 30, close: 37, high: 28, low: 40 },
          { x: 70, open: 42, close: 48, high: 40, low: 50 },
          { x: 90, open: 53, close: 58, high: 50, low: 60 },
        ].map((candle, i) => (
          <motion.g key={`candle-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.2 + 0.5, duration: 0.3 }}
          >
            {/* Candle wick */}
            <line 
              x1={candle.x} y1={candle.high} 
              x2={candle.x} y2={candle.low} 
              stroke="#ef4444" 
              strokeWidth="1"
            />
            {/* Candle body */}
            <rect 
              x={candle.x - 3} 
              y={Math.min(candle.open, candle.close)} 
              width="6" 
              height={Math.abs(candle.open - candle.close)} 
              fill="#ef4444" 
              opacity="0.8"
            />
          </motion.g>
        ))}
        
        {/* Moving average */}
        <motion.path
          d="M0,8 L25,18 L50,28 L75,40 L100,52"
          stroke="rgba(59, 130, 246, 0.6)"
          strokeWidth="1.5"
          strokeDasharray="2,2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 1 }}
        />
      </svg>
    </motion.div>
  );
}

function VolatilityAnimation() {
  return (
    <motion.div className="w-full h-full p-2 flex items-center justify-center">
      <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none">
        {/* Background grid lines */}
        <g stroke="rgba(255,255,255,0.1)" strokeWidth="0.5">
          {[0, 20, 40, 60, 80, 100].map(x => (
            <line key={`vline-${x}`} x1={x} y1="0" x2={x} y2="60" />
          ))}
          {[0, 15, 30, 45, 60].map(y => (
            <line key={`hline-${y}`} x1="0" y1={y} x2="100" y2={y} />
          ))}
        </g>
        
        {/* Volatility line */}
        <motion.path
          d="M0,30 L10,15 L20,45 L30,10 L40,50 L50,25 L60,40 L70,5 L80,55 L90,20 L100,35"
          stroke="#a855f7"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        
        {/* Volatility candles with large wicks */}
        {[
          { x: 10, open: 20, close: 10, high: 5, low: 40 },   // Large bearish
          { x: 30, open: 15, close: 35, high: 5, low: 45 },   // Large bullish
          { x: 50, open: 40, close: 25, high: 15, low: 45 },  // Medium bearish
          { x: 70, open: 20, close: 35, high: 5, low: 45 },   // Medium bullish
          { x: 90, open: 35, close: 25, high: 15, low: 45 },  // Small bearish
        ].map((candle, i) => (
          <motion.g key={`candle-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.15 + 0.5, duration: 0.3 }}
          >
            {/* Candle wick */}
            <line 
              x1={candle.x} y1={candle.high} 
              x2={candle.x} y2={candle.low} 
              stroke={candle.open > candle.close ? "#ef4444" : "#10b981"} 
              strokeWidth="1"
            />
            {/* Candle body */}
            <rect 
              x={candle.x - 3} 
              y={Math.min(candle.open, candle.close)} 
              width="6" 
              height={Math.abs(candle.open - candle.close)} 
              fill={candle.open > candle.close ? "#ef4444" : "#10b981"} 
              opacity="0.8"
            />
          </motion.g>
        ))}
        
        {/* Volatility bands */}
        <motion.path
          d="M0,15 L20,20 L40,25 L60,15 L80,20 L100,15"
          stroke="rgba(168, 85, 247, 0.4)"
          strokeWidth="1.5"
          strokeDasharray="2,2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.7 }}
        />
        <motion.path
          d="M0,45 L20,40 L40,35 L60,45 L80,40 L100,45"
          stroke="rgba(168, 85, 247, 0.4)"
          strokeWidth="1.5"
          strokeDasharray="2,2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1.5, delay: 0.7 }}
        />
      </svg>
    </motion.div>
  );
}

function ConsolidationAnimation() {
  return (
    <motion.div className="w-full h-full p-2 flex items-center justify-center">
      <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none">
        {/* Background grid lines */}
        <g stroke="rgba(255,255,255,0.1)" strokeWidth="0.5">
          {[0, 20, 40, 60, 80, 100].map(x => (
            <line key={`vline-${x}`} x1={x} y1="0" x2={x} y2="60" />
          ))}
          {[0, 15, 30, 45, 60].map(y => (
            <line key={`hline-${y}`} x1="0" y1={y} x2="100" y2={y} />
          ))}
        </g>
        
        {/* Consolidation range lines */}
        <motion.line
          x1="0" y1="25" x2="100" y2="25"
          stroke="rgba(59, 130, 246, 0.5)"
          strokeWidth="1"
          strokeDasharray="3,2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        />
        <motion.line
          x1="0" y1="35" x2="100" y2="35"
          stroke="rgba(59, 130, 246, 0.5)"
          strokeWidth="1"
          strokeDasharray="3,2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
        />
        
        {/* Price line */}
        <motion.path
          d="M0,28 L10,32 L20,27 L30,33 L40,29 L50,34 L60,26 L70,31 L80,28 L90,33 L100,30"
          stroke="#f59e0b"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
        
        {/* Small candles in tight range */}
        {[
          { x: 10, open: 29, close: 32, high: 26, low: 33 },
          { x: 30, open: 33, close: 30, high: 28, low: 34 },
          { x: 50, open: 28, close: 31, high: 27, low: 32 },
          { x: 70, open: 32, close: 29, high: 27, low: 33 },
          { x: 90, open: 28, close: 31, high: 26, low: 33 },
        ].map((candle, i) => (
          <motion.g key={`candle-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.2 + 0.5, duration: 0.3 }}
          >
            {/* Candle wick */}
            <line 
              x1={candle.x} y1={candle.high} 
              x2={candle.x} y2={candle.low} 
              stroke={candle.open > candle.close ? "#ef4444" : "#10b981"} 
              strokeWidth="1"
            />
            {/* Candle body */}
            <rect 
              x={candle.x - 3} 
              y={Math.min(candle.open, candle.close)} 
              width="6" 
              height={Math.abs(candle.open - candle.close)} 
              fill={candle.open > candle.close ? "#ef4444" : "#10b981"} 
              opacity="0.8"
            />
          </motion.g>
        ))}
        
        {/* Volume bars - decreasing during consolidation */}
        {[10, 30, 50, 70, 90].map((x, i) => (
          <motion.rect 
            key={`vol-${i}`}
            x={x - 4} 
            y={50} 
            width="8" 
            height={10 - i * 1.5} 
            fill="rgba(249, 168, 212, 0.5)"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 10 - i * 1.5, opacity: 1 }}
            transition={{ delay: i * 0.15 + 1, duration: 0.3 }}
          />
        ))}
      </svg>
    </motion.div>
  );
}

function BreakoutAnimation() {
  return (
    <motion.div className="w-full h-full p-2 flex items-center justify-center">
      <svg width="100%" height="100%" viewBox="0 0 100 60" preserveAspectRatio="none">
        {/* Background grid lines */}
        <g stroke="rgba(255,255,255,0.1)" strokeWidth="0.5">
          {[0, 20, 40, 60, 80, 100].map(x => (
            <line key={`vline-${x}`} x1={x} y1="0" x2={x} y2="60" />
          ))}
          {[0, 15, 30, 45, 60].map(y => (
            <line key={`hline-${y}`} x1="0" y1={y} x2="100" y2={y} />
          ))}
        </g>
        
        {/* Resistance level that gets broken */}
        <motion.line
          x1="0" y1="25" x2="100" y2="25"
          stroke="rgba(239, 68, 68, 0.7)"
          strokeWidth="1.5"
          strokeDasharray="4,2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
        />
        
        {/* Support level */}
        <motion.line
          x1="0" y1="40" x2="100" y2="40"
          stroke="rgba(16, 185, 129, 0.7)"
          strokeWidth="1.5"
          strokeDasharray="4,2"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 1, delay: 0.2 }}
        />
        
        {/* Price line with breakout */}
        <motion.path
          d="M0,35 L10,32 L20,38 L30,34 L40,36 L50,30 L60,25 L70,20 L80,15 L90,10 L100,5"
          stroke="#10b981"
          strokeWidth="2"
          fill="none"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 2.5, ease: "easeInOut" }}
        />
        
        {/* Candles showing consolidation then breakout */}
        {[
          { x: 10, open: 34, close: 36, high: 32, low: 38 }, // Consolidation
          { x: 30, open: 36, close: 34, high: 32, low: 38 }, // Consolidation
          { x: 50, open: 32, close: 26, high: 24, low: 34 }, // Breakout candle
          { x: 70, open: 24, close: 18, high: 16, low: 26 }, // Follow-through
          { x: 90, open: 15, close: 8, high: 5, low: 17 },   // Continuation
        ].map((candle, i) => (
          <motion.g key={`candle-${i}`}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.25 + 0.5, duration: 0.3 }}
          >
            {/* Candle wick */}
            <line 
              x1={candle.x} y1={candle.high} 
              x2={candle.x} y2={candle.low} 
              stroke={candle.open > candle.close ? "#ef4444" : "#10b981"} 
              strokeWidth="1"
            />
            {/* Candle body */}
            <rect 
              x={candle.x - 3} 
              y={Math.min(candle.open, candle.close)} 
              width="6" 
              height={Math.abs(candle.open - candle.close)} 
              fill={candle.open > candle.close ? "#ef4444" : "#10b981"} 
              opacity="0.8"
            />
          </motion.g>
        ))}
        
        {/* Volume bars - increasing during breakout */}
        {[10, 30, 50, 70, 90].map((x, i) => {
          // Volume increases dramatically at breakout (index 2)
          const height = i < 2 ? 4 : i === 2 ? 15 : 10;
          return (
            <motion.rect 
              key={`vol-${i}`}
              x={x - 4} 
              y={50} 
              width="8" 
              height={height} 
              fill={i < 2 ? "rgba(249, 168, 212, 0.5)" : "rgba(16, 185, 129, 0.7)"}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height, opacity: 1 }}
              transition={{ delay: i * 0.25 + 1, duration: 0.3 }}
            />
          );
        })}
      </svg>
    </motion.div>
  );
}