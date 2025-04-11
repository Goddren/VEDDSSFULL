import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MarketMoodEmojiProps {
  trend?: string;
  symbol?: string;
  volatility?: number;
  confidence?: string;
  animate?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
  pulse?: boolean;
}

// Variants of emoji expressions based on market conditions
type MoodType = 'bullish' | 'bearish' | 'neutral' | 'volatile' | 'panic' | 'euphoric';

interface MoodInfo {
  emoji: string;
  label: string;
  description: string;
  bgColor: string;
  textColor: string;
}

const moodMap: Record<MoodType, MoodInfo> = {
  bullish: {
    emoji: '😀',
    label: 'Bullish',
    description: 'Market is showing strong upward momentum with positive sentiment.',
    bgColor: 'bg-green-500/10', 
    textColor: 'text-green-500'
  },
  bearish: {
    emoji: '😞',
    label: 'Bearish',
    description: 'Market is in a downtrend with negative sentiment.',
    bgColor: 'bg-red-500/10',
    textColor: 'text-red-500'
  },
  neutral: {
    emoji: '😐',
    label: 'Neutral',
    description: 'Market is showing sideways movement with balanced buying and selling.',
    bgColor: 'bg-blue-500/10',
    textColor: 'text-blue-500'
  },
  volatile: {
    emoji: '😬',
    label: 'Volatile',
    description: 'Market is showing significant price swings and unpredictable movements.',
    bgColor: 'bg-purple-500/10',
    textColor: 'text-purple-500'
  },
  panic: {
    emoji: '😱',
    label: 'Panic',
    description: 'Market is experiencing extreme fear with rapid selling pressure.',
    bgColor: 'bg-orange-500/10',
    textColor: 'text-orange-500'
  },
  euphoric: {
    emoji: '🤩',
    label: 'Euphoric',
    description: 'Market is showing extreme optimism, possibly approaching overextension.',
    bgColor: 'bg-amber-500/10',
    textColor: 'text-amber-500'
  }
};

// Animation variants for emoji
const containerVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { 
      duration: 0.3,
      type: "spring",
      stiffness: 200,
      damping: 15
    }
  },
  exit: { 
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.2 }
  }
};

// Framer Motion animation for pulsing effect
const pulseVariant = {
  pulse: {
    scale: [1, 1.05, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      repeatType: "reverse" as const
    }
  }
};

export function MarketMoodEmoji({ 
  trend, 
  symbol, 
  volatility = 0.5,
  confidence,
  animate = true,
  size = 'md',
  showLabel = true,
  className = '',
  pulse = true
}: MarketMoodEmojiProps) {
  // Determine the current mood based on inputs
  const [currentMood, setCurrentMood] = useState<MoodType>('neutral');
  const [isChanging, setIsChanging] = useState(false);

  useEffect(() => {
    // Logic to determine mood based on trend, volatility, and confidence
    let newMood: MoodType = 'neutral';
    
    if (trend) {
      if (trend.toLowerCase().includes('bullish')) {
        if (volatility > 0.8) {
          newMood = 'euphoric';
        } else {
          newMood = 'bullish';
        }
      } else if (trend.toLowerCase().includes('bearish')) {
        if (volatility > 0.8) {
          newMood = 'panic';
        } else {
          newMood = 'bearish';
        }
      }
    }
    
    // High volatility overrides normal mood
    if (volatility > 0.7 && newMood !== 'euphoric' && newMood !== 'panic') {
      newMood = 'volatile';
    }
    
    // Only animate if mood is actually changing
    if (newMood !== currentMood) {
      if (animate) {
        setIsChanging(true);
        setTimeout(() => {
          setCurrentMood(newMood);
          setIsChanging(false);
        }, 300);
      } else {
        setCurrentMood(newMood);
      }
    }
  }, [trend, volatility, confidence, animate, currentMood]);

  // Size classes
  const sizeClasses = {
    sm: 'text-xl',
    md: 'text-3xl',
    lg: 'text-5xl',
  };

  // Get current mood info
  const mood = moodMap[currentMood];

  // Simulates real-time updates by randomly changing the mood slightly
  useEffect(() => {
    if (!symbol) return; // Only do random updates if a symbol is provided
    
    const interval = setInterval(() => {
      const shouldChange = Math.random() > 0.7; // 30% chance of changing
      if (shouldChange) {
        // Small random changes that don't drastically alter the mood
        const randomFactor = Math.random();
        if (currentMood === 'bullish' && randomFactor > 0.8) {
          setIsChanging(true);
          setTimeout(() => {
            setCurrentMood('euphoric');
            setIsChanging(false);
          }, 300);
        } else if (currentMood === 'bearish' && randomFactor > 0.8) {
          setIsChanging(true);
          setTimeout(() => {
            setCurrentMood('panic');
            setIsChanging(false);
          }, 300);
        } else if (currentMood === 'euphoric' && randomFactor > 0.7) {
          setIsChanging(true);
          setTimeout(() => {
            setCurrentMood('bullish');
            setIsChanging(false);
          }, 300);
        } else if (currentMood === 'panic' && randomFactor > 0.7) {
          setIsChanging(true);
          setTimeout(() => {
            setCurrentMood('bearish');
            setIsChanging(false);
          }, 300);
        }
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [currentMood, symbol]);

  return (
    <div className={`inline-flex flex-col items-center ${className}`}>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Card className={`cursor-help ${mood.bgColor} border-none shadow-sm hover:shadow-md transition-shadow`}>
              <CardContent className="p-2 flex flex-col items-center">
                <AnimatePresence mode="wait">
                  {!isChanging && (
                    <motion.div
                      key={currentMood}
                      variants={containerVariants}
                      initial="hidden"
                      animate={pulse ? "visible" : "visible"}
                      whileInView={pulse ? pulseAnimation : undefined}
                      exit="exit"
                      className={`${sizeClasses[size]} font-emoji leading-none select-none`}
                    >
                      {mood.emoji}
                    </motion.div>
                  )}
                </AnimatePresence>
                
                {showLabel && (
                  <Badge variant="outline" className={`mt-1 ${mood.textColor}`}>
                    {symbol ? `${symbol}: ` : ''}{mood.label}
                  </Badge>
                )}
              </CardContent>
            </Card>
          </TooltipTrigger>
          <TooltipContent>
            <p>{mood.description}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}

// Additional component for displaying mood across multiple symbols in a grid
export function MarketMoodGrid({ symbols = ['EUR/USD', 'GBP/USD', 'USD/JPY', 'AUD/USD'] }) {
  // Mock data for different currencies
  const mockMoods: Record<string, { trend: string, volatility: number }> = {
    'EUR/USD': { trend: 'bullish', volatility: 0.3 },
    'GBP/USD': { trend: 'bearish', volatility: 0.6 },
    'USD/JPY': { trend: 'bullish', volatility: 0.9 },
    'AUD/USD': { trend: 'bearish', volatility: 0.4 },
    'USD/CAD': { trend: 'neutral', volatility: 0.2 },
    'NZD/USD': { trend: 'bearish', volatility: 0.8 },
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
      {symbols.map((symbol) => (
        <div key={symbol} className="flex flex-col items-center">
          <MarketMoodEmoji
            symbol={symbol}
            trend={mockMoods[symbol]?.trend}
            volatility={mockMoods[symbol]?.volatility}
            size="md"
            showLabel={true}
          />
        </div>
      ))}
    </div>
  );
}