import React, { useState } from 'react';
import { Link } from 'wouter';
import { ChevronLeft, TrendingUp, BarChart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectValue, SelectTrigger, SelectContent, SelectItem } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { MarketSentimentCloud } from '@/components/market/market-sentiment-cloud';
import { MarketMoodDisplay } from '@/components/market/market-mood-display';

const currencyPairs = [
  'BTC/USD',
  'ETH/USD',
  'EUR/USD',
  'GBP/USD',
  'USD/JPY',
  'AUD/USD',
  'USD/CAD',
  'XRP/USD',
  'SOL/USD',
];

const timeframes = [
  '5m',
  '15m',
  '1h',
  '4h',
  '1d',
  '1w',
];

const MarketSentiment: React.FC = () => {
  const [selectedPair, setSelectedPair] = useState('BTC/USD');
  const [selectedTimeframe, setSelectedTimeframe] = useState('1h');
  
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="sm" className="mb-4">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Market Sentiment Analysis</h1>
              <p className="text-muted-foreground mt-1">
                Analyze market sentiment and mood for different trading instruments
              </p>
            </div>
          </div>
        </div>
        
        <Card className="mb-6 bg-card/50 backdrop-blur-sm">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <BarChart className="h-5 w-5 text-muted-foreground" />
                <h2 className="text-lg font-semibold">Customize Analysis</h2>
              </div>
              
              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Trading Pair</label>
                  <Select 
                    value={selectedPair} 
                    onValueChange={setSelectedPair}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue placeholder="Select pair" />
                    </SelectTrigger>
                    <SelectContent>
                      {currencyPairs.map(pair => (
                        <SelectItem key={pair} value={pair}>{pair}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm text-muted-foreground block mb-1">Timeframe</label>
                  <Select 
                    value={selectedTimeframe} 
                    onValueChange={setSelectedTimeframe}
                  >
                    <SelectTrigger className="w-[100px]">
                      <SelectValue placeholder="Timeframe" />
                    </SelectTrigger>
                    <SelectContent>
                      {timeframes.map(tf => (
                        <SelectItem key={tf} value={tf}>{tf}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <MarketSentimentCloud 
            symbol={selectedPair} 
            timeframe={selectedTimeframe}
          />
          
          <MarketMoodDisplay
            symbol={selectedPair}
            timeframe={selectedTimeframe}
            trend={getTrendFromPair(selectedPair)}
            volatility={getVolatilityFromPair(selectedPair)}
          />
        </div>
        
        <div className="mb-6">
          <Card>
            <CardContent className="p-6">
              <h2 className="text-lg font-semibold mb-3">
                About Market Sentiment Analysis
              </h2>
              <p className="text-muted-foreground mb-4">
                Market sentiment reflects the overall attitude and emotions of traders and investors 
                toward a specific financial instrument or the market as a whole. Understanding market 
                sentiment can provide valuable context for technical analysis.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                <div className="p-4 bg-card rounded-lg border border-border">
                  <h3 className="text-md font-medium mb-2 flex items-center">
                    <div className="mr-2 w-3 h-3 rounded-full bg-emerald-500"></div>
                    Bullish Sentiment
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    When traders are optimistic about price increases. Typically associated with buying 
                    pressure, uptrends, and positive market news.
                  </p>
                </div>
                
                <div className="p-4 bg-card rounded-lg border border-border">
                  <h3 className="text-md font-medium mb-2 flex items-center">
                    <div className="mr-2 w-3 h-3 rounded-full bg-rose-500"></div>
                    Bearish Sentiment
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    When traders expect prices to decrease. Usually accompanied by selling pressure, 
                    downtrends, and negative market outlook.
                  </p>
                </div>
                
                <div className="p-4 bg-card rounded-lg border border-border">
                  <h3 className="text-md font-medium mb-2 flex items-center">
                    <div className="mr-2 w-3 h-3 rounded-full bg-amber-500"></div>
                    Neutral Sentiment
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    When there's balance between bullish and bearish forces. Often seen during consolidation 
                    phases with indecision in the market.
                  </p>
                </div>
                
                <div className="p-4 bg-card rounded-lg border border-border">
                  <h3 className="text-md font-medium mb-2 flex items-center">
                    <div className="mr-2 w-3 h-3 rounded-full bg-purple-500"></div>
                    Contrarian Approach
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    Trading against extreme market sentiment can be profitable, as excessive bullishness 
                    often precedes corrections, while extreme bearishness may signal bottoms.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
        
        <div className="text-center mt-4">
          <p className="text-sm text-muted-foreground mb-4">
            Market sentiment analysis is for informational purposes only and should not be considered financial advice.
          </p>
        </div>
      </div>
    </div>
  );
};

// Helper functions
function getTrendFromPair(pair: string): string {
  // In a real implementation, this would be fetched from an API
  // For demo purposes, we'll assign trends based on the pair name
  const pairHash = pair.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
  const trends = ['Bullish', 'Slightly Bullish', 'Neutral', 'Slightly Bearish', 'Bearish'];
  const index = pairHash % trends.length;
  return trends[index];
}

function getVolatilityFromPair(pair: string): number {
  // In a real implementation, this would be calculated from actual market data
  // For demo purposes, we'll use a hash of the pair name to generate a consistent value
  const pairHash = pair.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
  return (pairHash % 80 + 20) / 100; // Returns value between 0.2 and 1.0
}

export default MarketSentiment;