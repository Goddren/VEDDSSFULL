import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { 
  HelpCircle, 
  TrendingUp, 
  TrendingDown, 
  BarChart2, 
  Activity, 
  Zap
} from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

// Animations for different market contexts
const animations = {
  bullish: {
    component: () => (
      <motion.div
        className="w-full h-10 flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-6 h-6 text-emerald-500"
          initial={{ y: 20 }}
          animate={{ 
            y: -20,
            transition: { 
              repeat: Infinity, 
              duration: 1.5,
              repeatType: "loop"
            }
          }}
        >
          <TrendingUp className="w-full h-full" />
        </motion.div>
      </motion.div>
    ),
  },
  bearish: {
    component: () => (
      <motion.div
        className="w-full h-10 flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-6 h-6 text-rose-500"
          initial={{ y: -20 }}
          animate={{ 
            y: 20,
            transition: { 
              repeat: Infinity, 
              duration: 1.5,
              repeatType: "loop"
            }
          }}
        >
          <TrendingDown className="w-full h-full" />
        </motion.div>
      </motion.div>
    ),
  },
  consolidation: {
    component: () => (
      <motion.div
        className="w-full h-10 flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-6 h-6 text-amber-500"
          initial={{ x: -10 }}
          animate={{ 
            x: 10,
            transition: { 
              repeat: Infinity, 
              duration: 0.8,
              repeatType: "mirror"
            }
          }}
        >
          <BarChart2 className="w-full h-full" />
        </motion.div>
      </motion.div>
    ),
  },
  volatility: {
    component: () => (
      <motion.div
        className="w-full h-10 flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-6 h-6 text-purple-500"
          animate={{ 
            scale: [1, 1.2, 1, 0.9, 1],
            rotate: [0, 5, 0, -5, 0],
            transition: { 
              repeat: Infinity, 
              duration: 0.8,
              repeatType: "loop"
            }
          }}
        >
          <Activity className="w-full h-full" />
        </motion.div>
      </motion.div>
    ),
  },
  breakout: {
    component: () => (
      <motion.div
        className="w-full h-10 flex items-center justify-center overflow-hidden"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-6 h-6 text-blue-500"
          initial={{ scale: 0, rotate: -45 }}
          animate={{ 
            scale: 1.2,
            rotate: 0,
            transition: { 
              repeat: Infinity, 
              duration: 1,
              repeatType: "loop"
            }
          }}
        >
          <Zap className="w-full h-full" />
        </motion.div>
      </motion.div>
    ),
  },
};

export interface InsightTooltipProps {
  type: 'bullish' | 'bearish' | 'consolidation' | 'volatility' | 'breakout';
  title: string;
  description: string;
  iconSize?: 'sm' | 'md' | 'lg';
  className?: string;
  children?: React.ReactNode;
}

export function InsightTooltip({
  type,
  title,
  description,
  iconSize = 'md',
  className = '',
  children
}: InsightTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  const iconSizeClass = {
    sm: 'w-4 h-4',
    md: 'w-5 h-5',
    lg: 'w-6 h-6',
  }[iconSize];
  
  const AnimationComponent = animations[type].component;

  return (
    <TooltipProvider>
      <Tooltip open={isOpen} onOpenChange={setIsOpen}>
        <TooltipTrigger asChild onClick={() => setIsOpen(true)}>
          <div className={`inline-flex items-center cursor-help ${className}`}>
            {children || (
              <HelpCircle className={`${iconSizeClass} text-primary ml-1 transition-colors`} />
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          align="center"
          className="border border-border/40 bg-card/95 backdrop-blur-sm p-0 shadow-xl w-72 rounded-xl overflow-hidden"
        >
          <div className="p-3 pb-2">
            <h3 className="font-medium text-sm text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-1">{description}</p>
          </div>
          <AnimatePresence>
            <AnimationComponent />
          </AnimatePresence>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Export a higher-order component that automatically determines the animation based on context
export function BullishInsight({ title, description, ...props }: Omit<InsightTooltipProps, 'type'>) {
  return (
    <InsightTooltip
      type="bullish"
      title={title}
      description={description}
      {...props}
    />
  );
}

export function BearishInsight({ title, description, ...props }: Omit<InsightTooltipProps, 'type'>) {
  return (
    <InsightTooltip
      type="bearish"
      title={title}
      description={description}
      {...props}
    />
  );
}

export function VolatilityInsight({ title, description, ...props }: Omit<InsightTooltipProps, 'type'>) {
  return (
    <InsightTooltip
      type="volatility"
      title={title}
      description={description}
      {...props}
    />
  );
}

export function ConsolidationInsight({ title, description, ...props }: Omit<InsightTooltipProps, 'type'>) {
  return (
    <InsightTooltip
      type="consolidation"
      title={title}
      description={description}
      {...props}
    />
  );
}

export function BreakoutInsight({ title, description, ...props }: Omit<InsightTooltipProps, 'type'>) {
  return (
    <InsightTooltip
      type="breakout"
      title={title}
      description={description}
      {...props}
    />
  );
}