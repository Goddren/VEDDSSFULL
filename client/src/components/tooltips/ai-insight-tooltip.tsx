import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, TrendingUp, TrendingDown, DollarSign, BarChart, Activity, Info } from 'lucide-react';

type MarketTrend = 'bullish' | 'bearish' | 'neutral' | 'volatile';

interface AIInsightTooltipProps {
  children: React.ReactNode;
  insight: string;
  marketTrend?: MarketTrend;
  title?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  width?: string;
  icon?: React.ReactNode;
}

export function AIInsightTooltip({
  children,
  insight,
  marketTrend = 'neutral',
  title = 'AI Insight',
  position = 'top',
  width = '300px',
  icon
}: AIInsightTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Handle clicks outside to close tooltip
  useEffect(() => {
    if (!isOpen) return;
    
    function handleClickOutside(event: MouseEvent) {
      if (
        tooltipRef.current && 
        !tooltipRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);
  
  // Get trend-specific styles and animations
  const getTrendConfig = (trend: MarketTrend) => {
    switch (trend) {
      case 'bullish':
        return {
          icon: icon || <TrendingUp className="h-5 w-5 text-green-500" />,
          color: 'border-green-500',
          animationColor: 'rgba(34, 197, 94, 0.4)', // green-500 with opacity
          textColor: 'text-green-400'
        };
      case 'bearish':
        return {
          icon: icon || <TrendingDown className="h-5 w-5 text-red-500" />,
          color: 'border-red-500',
          animationColor: 'rgba(239, 68, 68, 0.4)', // red-500 with opacity
          textColor: 'text-red-400'
        };
      case 'volatile':
        return {
          icon: icon || <Activity className="h-5 w-5 text-amber-500" />,
          color: 'border-amber-500',
          animationColor: 'rgba(245, 158, 11, 0.4)', // amber-500 with opacity
          textColor: 'text-amber-400'
        };
      case 'neutral':
      default:
        return {
          icon: icon || <Info className="h-5 w-5 text-blue-500" />,
          color: 'border-blue-500',
          animationColor: 'rgba(59, 130, 246, 0.4)', // blue-500 with opacity
          textColor: 'text-blue-400'
        };
    }
  };
  
  const trendConfig = getTrendConfig(marketTrend);
  
  // Determine position-specific styles
  const getPositionStyles = () => {
    switch (position) {
      case 'bottom':
        return {
          position: 'top-full mt-2',
          transform: 'translateX(-50%)',
          arrow: 'top-0 left-1/2 -translate-x-1/2 -translate-y-full border-b-gray-900'
        };
      case 'left':
        return {
          position: 'right-full top-1/2 -translate-y-1/2 mr-2',
          transform: '',
          arrow: 'right-0 top-1/2 -translate-y-1/2 translate-x-full border-l-gray-900'
        };
      case 'right':
        return {
          position: 'left-full top-1/2 -translate-y-1/2 ml-2',
          transform: '',
          arrow: 'left-0 top-1/2 -translate-y-1/2 -translate-x-full border-r-gray-900'
        };
      case 'top':
      default:
        return {
          position: 'bottom-full mb-2',
          transform: 'translateX(-50%)',
          arrow: 'bottom-0 left-1/2 -translate-x-1/2 translate-y-full border-t-gray-900'
        };
    }
  };
  
  const posStyles = getPositionStyles();
  
  // BullishAnimation component
  const BullishAnimation = () => (
    <motion.div 
      className="absolute inset-0 z-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.8 }}
      exit={{ opacity: 0 }}
    >
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-4 h-4 rounded-full"
          style={{ backgroundColor: trendConfig.animationColor }}
          initial={{ 
            x: Math.random() * 100 - 50 + 100, 
            y: Math.random() * 100 - 50 + 100,
            scale: 0.5,
            opacity: 0
          }}
          animate={{ 
            y: [null, -20, -40], 
            scale: [null, 0.8, 1],
            opacity: [0, 0.8, 0]
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity, 
            delay: i * 0.4, 
            ease: "easeOut" 
          }}
        />
      ))}
    </motion.div>
  );
  
  // BearishAnimation component
  const BearishAnimation = () => (
    <motion.div 
      className="absolute inset-0 z-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.8 }}
      exit={{ opacity: 0 }}
    >
      {[...Array(5)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-4 h-4 rounded-full"
          style={{ backgroundColor: trendConfig.animationColor }}
          initial={{ 
            x: Math.random() * 100 - 50 + 100, 
            y: Math.random() * 100 - 50 + 100,
            scale: 0.5,
            opacity: 0
          }}
          animate={{ 
            y: [null, 20, 40], 
            scale: [null, 0.8, 1],
            opacity: [0, 0.8, 0]
          }}
          transition={{ 
            duration: 2, 
            repeat: Infinity, 
            delay: i * 0.4, 
            ease: "easeOut" 
          }}
        />
      ))}
    </motion.div>
  );
  
  // VolatileAnimation component
  const VolatileAnimation = () => (
    <motion.div 
      className="absolute inset-0 z-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.8 }}
      exit={{ opacity: 0 }}
    >
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-3 h-3 rounded-full"
          style={{ backgroundColor: trendConfig.animationColor }}
          initial={{ 
            x: Math.random() * 200, 
            y: Math.random() * 100,
            scale: 0.5,
            opacity: 0
          }}
          animate={{ 
            x: [null, Math.random() * 200], 
            y: [null, Math.random() * 100],
            scale: [null, 0.8, 1],
            opacity: [0, 0.8, 0]
          }}
          transition={{ 
            duration: 1.5, 
            repeat: Infinity, 
            delay: i * 0.2, 
            ease: "easeInOut" 
          }}
        />
      ))}
    </motion.div>
  );
  
  // NeutralAnimation component
  const NeutralAnimation = () => (
    <motion.div 
      className="absolute inset-0 z-0 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 0.8 }}
      exit={{ opacity: 0 }}
    >
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute top-1/2 h-0.5 rounded-full"
          style={{ 
            backgroundColor: trendConfig.animationColor,
            width: '80%',
            left: '10%',
            y: i * 15 - 15
          }}
          animate={{ 
            opacity: [0.3, 0.7, 0.3],
            scaleX: [0.9, 1, 0.9]
          }}
          transition={{ 
            duration: 3, 
            repeat: Infinity, 
            delay: i * 0.5, 
            ease: "easeInOut" 
          }}
        />
      ))}
    </motion.div>
  );
  
  // Select the appropriate animation based on market trend
  const renderTrendAnimation = () => {
    switch (marketTrend) {
      case 'bullish':
        return <BullishAnimation />;
      case 'bearish':
        return <BearishAnimation />;
      case 'volatile':
        return <VolatileAnimation />;
      case 'neutral':
      default:
        return <NeutralAnimation />;
    }
  };
  
  return (
    <div className="relative inline-block">
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-help relative z-10"
      >
        {children}
      </div>
      
      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={tooltipRef}
            className={`absolute ${posStyles.position} z-50`}
            style={{ width, transform: posStyles.transform ? posStyles.transform : undefined }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.2 }}
          >
            <div className={`relative rounded-md border ${trendConfig.color} bg-gray-900 p-3 shadow-lg`}>
              {/* Arrow indicator */}
              <div className={`absolute w-0 h-0 border-4 border-transparent ${posStyles.arrow}`}></div>
              
              {/* Animation container */}
              {renderTrendAnimation()}
              
              {/* Content */}
              <div className="relative z-10">
                <div className="flex items-center mb-2">
                  {trendConfig.icon}
                  <h4 className={`font-medium ml-2 ${trendConfig.textColor}`}>{title}</h4>
                </div>
                <p className="text-sm text-gray-300">{insight}</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}