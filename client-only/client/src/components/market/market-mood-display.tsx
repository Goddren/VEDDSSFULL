import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { MarketMoodEmoji } from './market-mood-emoji';
import { ChevronRight } from 'lucide-react';

interface MarketMoodDisplayProps {
  trend?: string;
  symbol?: string;
  timeframe?: string;
  volatility?: number; // 0-1 scale
  className?: string;
}

export function MarketMoodDisplay({
  trend = 'neutral',
  symbol = 'Unknown',
  timeframe,
  volatility = 0.5,
  className = '',
}: MarketMoodDisplayProps) {
  // Calculate volatility score from analysis data if not provided
  const [calculatedVolatility, setCalculatedVolatility] = useState(volatility);
  
  // Update volatility based on trend strength
  useEffect(() => {
    if (trend) {
      // Adjust volatility based on trend strength indicators in the text
      if (trend.toLowerCase().includes('strong')) {
        setCalculatedVolatility(Math.min(0.8, volatility + 0.2));
      } else if (trend.toLowerCase().includes('weak')) {
        setCalculatedVolatility(Math.max(0.3, volatility - 0.1));
      }
    }
  }, [trend, volatility]);

  return (
    <Card className={`border-gray-200 dark:border-gray-800 shadow-sm ${className}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="text-lg">Market Mood</CardTitle>
            <CardDescription>
              Real-time sentiment for {symbol}
            </CardDescription>
          </div>
          <Link href="/market-mood">
            <Badge 
              variant="outline" 
              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 flex items-center gap-1"
            >
              <span>More</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Badge>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-center py-2">
          <MarketMoodEmoji
            trend={trend}
            symbol={symbol}
            volatility={calculatedVolatility}
            size="lg"
            showLabel={true}
            pulse={true}
          />
        </div>
        
        <div className="mt-4 text-sm text-muted-foreground text-center">
          <p>
            {timeframe && `${timeframe} timeframe • `}
            Updated {new Date().toLocaleTimeString()}
          </p>
          <p className="text-xs mt-2">
            Market mood reflects real-time sentiment based on price action and volatility
          </p>
        </div>
      </CardContent>
    </Card>
  );
}