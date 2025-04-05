import React, { useState } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, BarChart2, CandlestickChart } from 'lucide-react';

// Types for market animations
export type MarketAnimation = 
  | 'bullish' 
  | 'bearish' 
  | 'volatile' 
  | 'sideways'
  | 'resistance'
  | 'support';

interface AnimatedTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  animation?: MarketAnimation;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function AnimatedTooltip({
  content,
  children,
  animation = 'bullish',
  className,
  side = "top",
  align = "center"
}: AnimatedTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  // Create animation based on market pattern
  const renderAnimation = () => {
    switch (animation) {
      case 'bullish':
        return (
          <div className="absolute -z-10 top-0 left-0 right-0 bottom-0 flex items-center justify-center">
            <motion.div 
              className="absolute h-[2px] w-[2px] bg-green-500 rounded-full" 
              initial={{ y: 10, opacity: 0.4, scale: 0.5 }}
              animate={{ 
                y: -10, 
                opacity: [0.4, 1, 0.4], 
                scale: [0.5, 1, 0.5] 
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            />
            <TrendingUp className="text-green-500 h-6 w-6 opacity-20" />
          </div>
        );
      case 'bearish':
        return (
          <div className="absolute -z-10 top-0 left-0 right-0 bottom-0 flex items-center justify-center">
            <motion.div 
              className="absolute h-[2px] w-[2px] bg-red-500 rounded-full" 
              initial={{ y: -10, opacity: 0.4, scale: 0.5 }}
              animate={{ 
                y: 10, 
                opacity: [0.4, 1, 0.4], 
                scale: [0.5, 1, 0.5] 
              }}
              transition={{ 
                duration: 1.5, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            />
            <TrendingDown className="text-red-500 h-6 w-6 opacity-20" />
          </div>
        );
      case 'volatile':
        return (
          <div className="absolute -z-10 top-0 left-0 right-0 bottom-0 flex items-center justify-center">
            <motion.div 
              className="absolute h-[2px] w-[2px] bg-amber-500 rounded-full" 
              initial={{ x: -5, y: 5 }}
              animate={{ 
                x: [0, 5, -5, 0], 
                y: [-5, 5, -5, 5],
                opacity: [0.4, 1, 0.4], 
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            />
            <BarChart2 className="text-amber-500 h-6 w-6 opacity-20" />
          </div>
        );
      case 'sideways':
        return (
          <div className="absolute -z-10 top-0 left-0 right-0 bottom-0 flex items-center justify-center">
            <motion.div 
              className="absolute h-[2px] w-[2px] bg-blue-500 rounded-full" 
              initial={{ x: -10 }}
              animate={{ 
                x: [10, -10],
                opacity: [0.4, 1, 0.4]
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                ease: "linear" 
              }}
            />
            <motion.div 
              className="h-[1px] w-10 bg-blue-500 opacity-20" 
              animate={{ opacity: [0.2, 0.3, 0.2] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </div>
        );
      case 'resistance':
        return (
          <div className="absolute -z-10 top-0 left-0 right-0 bottom-0 flex items-center justify-center">
            <motion.div 
              className="absolute top-[40%] h-[1px] w-8 bg-purple-500 opacity-30" 
            />
            <motion.div 
              className="absolute h-[2px] w-[2px] bg-purple-500 rounded-full" 
              initial={{ y: 0 }}
              animate={{ 
                y: [-5, -6, -4, -6, 0], 
                opacity: [0.4, 1, 0.4] 
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                ease: "easeOut" 
              }}
            />
            <CandlestickChart className="text-purple-500 h-6 w-6 opacity-20" />
          </div>
        );
      case 'support':
        return (
          <div className="absolute -z-10 top-0 left-0 right-0 bottom-0 flex items-center justify-center">
            <motion.div 
              className="absolute bottom-[40%] h-[1px] w-8 bg-teal-500 opacity-30" 
            />
            <motion.div 
              className="absolute h-[2px] w-[2px] bg-teal-500 rounded-full" 
              initial={{ y: 0 }}
              animate={{ 
                y: [5, 6, 4, 6, 0], 
                opacity: [0.4, 1, 0.4] 
              }}
              transition={{ 
                duration: 2, 
                repeat: Infinity, 
                ease: "easeOut" 
              }}
            />
            <CandlestickChart className="text-teal-500 h-6 w-6 opacity-20" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip
        open={isOpen}
        onOpenChange={setIsOpen}
        delayDuration={300}
      >
        <TooltipTrigger asChild>
          <div 
            className={cn(
              "relative inline-block cursor-help", 
              isOpen && "z-50",
              className
            )}
          >
            {children}
            {isOpen && renderAnimation()}
          </div>
        </TooltipTrigger>
        <TooltipContent 
          side={side} 
          align={align}
          className="max-w-xs p-3 animate-in fade-in-0 zoom-in-95"
        >
          <div className="text-sm">
            {content}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}