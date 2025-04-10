import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { motion, AnimatePresence } from 'framer-motion';

// Define market trend data structure
interface TrendCell {
  pair: string;
  probability: number; // 0-100
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number; // 0-100
  timestamp: number;
}

interface MarketTrendHeatmapProps {
  title?: string;
  description?: string;
  data?: TrendCell[];
  isLoading?: boolean;
  className?: string;
}

export function MarketTrendHeatmap({
  title = "Market Trend Prediction",
  description = "AI-powered forecast of market direction and strength",
  data = [],
  isLoading = false,
  className = "",
}: MarketTrendHeatmapProps) {
  // If no data is provided, use sample data for demonstration
  const [trendData, setTrendData] = useState<TrendCell[]>(data.length > 0 ? data : generateSampleData());
  
  // Update data if props change
  useEffect(() => {
    if (data.length > 0) {
      setTrendData(data);
    }
  }, [data]);

  // Add animation effect - refresh one random cell every few seconds
  useEffect(() => {
    if (!isLoading && data.length === 0) { // Only auto-update if using sample data
      const interval = setInterval(() => {
        setTrendData(currentData => {
          const newData = [...currentData];
          const randomIndex = Math.floor(Math.random() * newData.length);
          newData[randomIndex] = {
            ...newData[randomIndex],
            probability: Math.min(100, Math.max(0, newData[randomIndex].probability + (Math.random() * 20 - 10))),
            strength: Math.min(100, Math.max(0, newData[randomIndex].strength + (Math.random() * 15 - 7.5))),
            timestamp: Date.now()
          };
          return newData;
        });
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [isLoading, data]);

  // Get color based on direction and strength
  const getCellColor = (cell: TrendCell) => {
    const { direction, strength } = cell;
    const alpha = (strength / 100) * 0.9 + 0.1; // Ensure minimum opacity of 0.1
    
    if (direction === 'bullish') {
      return `rgba(34, 197, 94, ${alpha})`; // green
    } else if (direction === 'bearish') {
      return `rgba(239, 68, 68, ${alpha})`; // red
    } else {
      return `rgba(168, 162, 158, ${alpha})`; // gray
    }
  };

  // Get text color for readability
  const getTextColor = (cell: TrendCell) => {
    return cell.strength > 50 ? 'text-white' : 'text-gray-900';
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center p-8">
            <div className="w-8 h-8 rounded-full border-4 border-primary border-t-transparent animate-spin"></div>
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-px bg-muted">
            {trendData.map((cell, index) => (
              <motion.div
                key={`${cell.pair}-${index}`}
                initial={{ opacity: 0.5, scale: 0.95 }}
                animate={{ 
                  opacity: 1,
                  scale: 1,
                  backgroundColor: getCellColor(cell)
                }}
                transition={{ 
                  duration: 0.5,
                  type: "spring",
                  stiffness: 100
                }}
                className={`aspect-square flex flex-col items-center justify-center p-3 ${getTextColor(cell)}`}
              >
                <div className="font-semibold text-sm">{cell.pair}</div>
                <div className="text-xs opacity-90 mt-1">
                  {cell.direction === 'bullish' ? '▲' : cell.direction === 'bearish' ? '▼' : '◆'}
                  {' '}
                  {cell.probability.toFixed(0)}%
                </div>
                <motion.div 
                  className="w-full h-1 mt-2 rounded-full bg-black/10"
                  initial={{ width: 0 }}
                  animate={{ width: `${cell.strength}%` }}
                  transition={{ duration: 0.5 }}
                />
              </motion.div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Generate sample data for demonstration
function generateSampleData(): TrendCell[] {
  const currencyPairs = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 
    'USD/CAD', 'AUD/USD', 'NZD/USD', 'EUR/GBP',
    'EUR/JPY', 'GBP/JPY', 'AUD/JPY', 'EUR/AUD'
  ];
  
  return currencyPairs.map(pair => {
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
      probability: Math.round(60 + Math.random() * 35), // 60-95%
      direction,
      strength: Math.round(20 + Math.random() * 75), // 20-95
      timestamp: Date.now()
    };
  });
}