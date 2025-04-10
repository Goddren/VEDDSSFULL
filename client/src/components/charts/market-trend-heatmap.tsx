import React, { useState, useEffect } from 'react';
import { TrendCell } from '@shared/types';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface MarketTrendHeatmapProps {
  title?: string;
  description?: string;
  data?: TrendCell[];
  isLoading?: boolean;
  className?: string;
}

export function MarketTrendHeatmap({
  title = "Market Trend Predictions",
  description = "Correlation analysis of related currency pairs",
  data = [],
  isLoading = false,
  className = "",
}: MarketTrendHeatmapProps) {
  const [sortedData, setSortedData] = useState<TrendCell[]>([]);
  const [highlightedPair, setHighlightedPair] = useState<string | null>(null);
  
  // Sort and prepare data for display
  useEffect(() => {
    // Sort by probability (highest first) + strength as secondary sort
    const sorted = [...data].sort((a, b) => {
      if (a.probability === b.probability) {
        return b.strength - a.strength;
      }
      return b.probability - a.probability;
    });
    
    setSortedData(sorted);
  }, [data]);

  // Function to determine cell background color based on direction and strength
  const getCellColor = (cell: TrendCell) => {
    const { direction, strength, probability } = cell;
    
    // Base alpha value on probability
    const alpha = 0.3 + (probability / 100) * 0.7;
    
    if (direction === 'bullish') {
      // Green with varying intensity based on strength
      const g = 180 + Math.floor((strength / 100) * 75);
      const r = 30 + Math.floor((1 - strength / 100) * 70);
      const b = 30 + Math.floor((1 - strength / 100) * 70);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else if (direction === 'bearish') {
      // Red with varying intensity based on strength
      const r = 180 + Math.floor((strength / 100) * 75);
      const g = 30 + Math.floor((1 - strength / 100) * 70);
      const b = 30 + Math.floor((1 - strength / 100) * 70);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    } else {
      // Neutral - gray
      return `rgba(120, 120, 120, ${alpha})`;
    }
  };

  // Function to determine text color for contrast with cell background
  const getTextColor = (cell: TrendCell) => {
    const { direction, strength } = cell;
    
    if (direction === 'bullish' && strength > 70) {
      return 'text-black';
    } else if (direction === 'bearish' && strength > 70) {
      return 'text-white';
    }
    
    return 'text-white';
  };

  // Calculate time since prediction
  const getTimeAgo = (timestamp: number) => {
    const now = Date.now();
    const seconds = Math.floor((now - timestamp) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (isLoading) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full h-48 flex items-center justify-center">
            <motion.div
              className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full"
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
            />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className={`w-full ${className}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="w-full h-48 flex flex-col items-center justify-center text-center gap-2">
            <AlertTriangle className="w-10 h-10 text-muted-foreground" />
            <p className="text-muted-foreground">No market trend data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sortedData.map((cell, index) => (
            <motion.div
              key={cell.pair}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: index * 0.05 }}
              whileHover={{ scale: 1.02 }}
              className={`relative rounded-lg overflow-hidden cursor-pointer ${
                highlightedPair === cell.pair ? 'ring-2 ring-white ring-opacity-50' : ''
              }`}
              onMouseEnter={() => setHighlightedPair(cell.pair)}
              onMouseLeave={() => setHighlightedPair(null)}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className="p-3 w-full"
                      style={{ backgroundColor: getCellColor(cell) }}
                    >
                      <div className="flex justify-between items-center">
                        <div className="font-medium">{cell.pair}</div>
                        <div className={`text-sm font-bold ${getTextColor(cell)}`}>
                          {cell.direction.toUpperCase()}
                        </div>
                      </div>
                      <div className="mt-1 flex justify-between items-center">
                        <div className="text-xs opacity-90 flex items-center gap-1">
                          <div className={`w-2 h-2 rounded-full bg-${cell.direction === 'bullish' ? 'green' : cell.direction === 'bearish' ? 'red' : 'gray'}-500`}></div>
                          <span>Signal strength: {cell.strength}%</span>
                        </div>
                        <div className="text-xs opacity-90">{cell.probability}%</div>
                      </div>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="max-w-xs">
                    <div className="space-y-1">
                      <p className="font-medium">{cell.pair} - {cell.direction.toUpperCase()}</p>
                      <p className="text-sm">Probability: {cell.probability}%</p>
                      <p className="text-sm">Signal Strength: {cell.strength}%</p>
                      <p className="text-xs opacity-80">Updated {getTimeAgo(cell.timestamp)}</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Utility function to generate sample data for tests
export function generateSampleData(): TrendCell[] {
  const pairs = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 
    'USD/CAD', 'AUD/USD', 'NZD/USD', 'EUR/GBP'
  ];
  
  return pairs.map(pair => {
    const random = Math.random();
    let direction: 'bullish' | 'bearish' | 'neutral';
    
    if (random < 0.4) {
      direction = 'bullish';
    } else if (random < 0.8) {
      direction = 'bearish';
    } else {
      direction = 'neutral';
    }
    
    return {
      pair,
      probability: Math.round(50 + Math.random() * 50), // 50-100%
      direction,
      strength: Math.round(30 + Math.random() * 70), // 30-100
      timestamp: Date.now() - Math.random() * 3600000 // Within the last hour
    };
  });
}