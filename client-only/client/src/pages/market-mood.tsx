import React, { useState } from 'react';
import { Link } from 'wouter';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChevronLeft, Gauge, Info, RefreshCcw } from 'lucide-react';
import { MarketMoodEmoji, MarketMoodGrid } from '@/components/market/market-mood-emoji';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { InsightTooltip } from '@/components/ui/insight-tooltip';

export default function MarketMoodPage() {
  // State for controlling the example mood
  const [trend, setTrend] = useState('bullish');
  const [volatility, setVolatility] = useState(0.5);
  const [symbol, setSymbol] = useState('BTC/USD');
  const [pulseEffect, setPulseEffect] = useState(true);
  const [showLabel, setShowLabel] = useState(true);
  const [size, setSize] = useState<'sm' | 'md' | 'lg'>('md');
  
  // Popular currency and crypto pairs
  const popularPairs = [
    { 
      category: "Forex", 
      pairs: ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "USD/CHF", "NZD/USD", "EUR/GBP"] 
    },
    { 
      category: "Crypto", 
      pairs: ["BTC/USD", "ETH/USD", "XRP/USD", "LTC/USD", "ADA/USD", "DOT/USD", "SOL/USD", "DOGE/USD"] 
    },
    { 
      category: "Commodities", 
      pairs: ["GOLD", "SILVER", "OIL", "NATURAL GAS", "COPPER"] 
    },
  ];
  
  // Current selected category
  const [activeCategory, setActiveCategory] = useState("Forex");
  
  return (
    <div className="container py-8">
      <div className="mb-6">
        <Link href="/dashboard">
          <Badge 
            variant="outline" 
            className="cursor-pointer hover:bg-secondary flex items-center gap-1 pl-2 pr-3 py-1.5"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Back to Dashboard</span>
          </Badge>
        </Link>
      </div>
      
      <div className="flex flex-col space-y-4 md:flex-row md:justify-between md:space-y-0 mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Market Mood Emojis</h1>
          <p className="text-muted-foreground mt-1">
            Real-time emotional indicators showing market sentiment
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => window.location.reload()} className="flex items-center gap-1.5">
            <RefreshCcw className="h-4 w-4" />
            <span>Refresh Data</span>
          </Button>
          <InsightTooltip
            title="About Market Mood"
            content="Market Mood Emojis reflect emotional sentiment in the market. These visual indicators can help you quickly gauge market psychology and potential trading opportunities."
            icon="info"
            animationType="none"
          />
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="md:col-span-1">
          <CardHeader>
            <CardTitle className="text-xl">Mood Customizer</CardTitle>
            <CardDescription>
              Create your own market mood emoji
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex justify-center mb-6">
              <MarketMoodEmoji
                trend={trend}
                volatility={volatility}
                symbol={symbol}
                size={size}
                showLabel={showLabel}
                pulse={pulseEffect}
              />
            </div>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Market Symbol</Label>
                <Select value={symbol} onValueChange={setSymbol}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a symbol" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BTC/USD">BTC/USD</SelectItem>
                    <SelectItem value="EUR/USD">EUR/USD</SelectItem>
                    <SelectItem value="GBP/USD">GBP/USD</SelectItem>
                    <SelectItem value="USD/JPY">USD/JPY</SelectItem>
                    <SelectItem value="ETH/USD">ETH/USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Market Trend</Label>
                <Select value={trend} onValueChange={setTrend}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a trend" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bullish">Bullish</SelectItem>
                    <SelectItem value="bearish">Bearish</SelectItem>
                    <SelectItem value="neutral">Neutral</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between">
                  <Label>Volatility</Label>
                  <Badge variant="outline">
                    {Math.round(volatility * 100)}%
                  </Badge>
                </div>
                <Slider
                  value={[volatility * 100]} 
                  max={100}
                  step={5}
                  onValueChange={(value) => setVolatility(value[0] / 100)}
                />
              </div>
              
              <div className="space-y-2">
                <Label>Size</Label>
                <Select value={size} onValueChange={(val) => setSize(val as 'sm' | 'md' | 'lg')}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sm">Small</SelectItem>
                    <SelectItem value="md">Medium</SelectItem>
                    <SelectItem value="lg">Large</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="pulse-effect">Pulse Effect</Label>
                <Switch 
                  id="pulse-effect" 
                  checked={pulseEffect} 
                  onCheckedChange={setPulseEffect} 
                />
              </div>
              
              <div className="flex items-center justify-between">
                <Label htmlFor="show-label">Show Label</Label>
                <Switch 
                  id="show-label" 
                  checked={showLabel} 
                  onCheckedChange={setShowLabel} 
                />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-xl">Real-Time Market Moods</CardTitle>
                <CardDescription>
                  Emotional indicators for popular trading pairs
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Gauge className="h-5 w-5 text-indigo-500" />
                <span className="text-sm text-muted-foreground">Live sentiment</span>
              </div>
            </div>
            
            <div className="flex flex-wrap gap-2 pt-2">
              {popularPairs.map((category) => (
                <Badge 
                  key={category.category}
                  variant={activeCategory === category.category ? "default" : "outline"}
                  className={`cursor-pointer ${activeCategory === category.category ? 'bg-primary' : 'hover:bg-secondary'}`}
                  onClick={() => setActiveCategory(category.category)}
                >
                  {category.category}
                </Badge>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <MarketMoodGrid 
              symbols={popularPairs.find(c => c.category === activeCategory)?.pairs || []} 
            />
            
            <div className="mt-8 text-center">
              <p className="text-sm text-muted-foreground">
                Market mood emojis update in real-time to reflect changing market conditions.
                <br />
                <span className="text-xs">Last updated: {new Date().toLocaleTimeString()}</span>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-xl">How to Use Market Mood Emojis</CardTitle>
          <CardDescription>
            A guide to interpreting market sentiment indicators
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="flex flex-col items-center gap-2 p-4 bg-green-500/5 rounded-lg">
              <MarketMoodEmoji
                trend="bullish"
                volatility={0.4}
                size="md"
                showLabel={true}
                pulse={false}
              />
              <h3 className="font-medium mt-2">Bullish Markets</h3>
              <p className="text-sm text-muted-foreground text-center">
                Look for buying opportunities and consider trailing stops to protect profits.
              </p>
            </div>
            
            <div className="flex flex-col items-center gap-2 p-4 bg-red-500/5 rounded-lg">
              <MarketMoodEmoji
                trend="bearish"
                volatility={0.4}
                size="md"
                showLabel={true}
                pulse={false}
              />
              <h3 className="font-medium mt-2">Bearish Markets</h3>
              <p className="text-sm text-muted-foreground text-center">
                Consider short positions or staying in cash. Be cautious with long positions.
              </p>
            </div>
            
            <div className="flex flex-col items-center gap-2 p-4 bg-purple-500/5 rounded-lg">
              <MarketMoodEmoji
                trend="neutral"
                volatility={0.8}
                size="md"
                showLabel={true}
                pulse={false}
              />
              <h3 className="font-medium mt-2">Volatile Markets</h3>
              <p className="text-sm text-muted-foreground text-center">
                Use wider stops and consider reducing position sizes to manage risk appropriately.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}