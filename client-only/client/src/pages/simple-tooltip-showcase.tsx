import React from "react";
import { useLocation, Link } from "wouter";
import { ChevronLeft, ChevronUp, ChevronDown, ChevronsUpDown, AlertTriangle } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// Define simple tooltip components directly in this file to avoid import issues
const SimpleInsight: React.FC<{
  type: 'bullish' | 'bearish' | 'neutral' | 'volatile';
  title: string;
  description: string;
  children: React.ReactNode;
}> = ({ type, title, description, children }) => {
  // Get icon based on type
  const getIcon = () => {
    switch (type) {
      case 'bullish':
        return <ChevronUp size={18} className="text-green-500" />;
      case 'bearish':
        return <ChevronDown size={18} className="text-red-500" />;
      case 'neutral':
        return <ChevronsUpDown size={18} className="text-yellow-500" />;
      case 'volatile':
        return <AlertTriangle size={18} className="text-orange-500" />;
      default:
        return <ChevronUp size={18} className="text-gray-500" />;
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <div className="inline-flex items-center gap-1 cursor-help">
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs bg-[#181818] border-[#333333]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h4 className="font-medium">{title}</h4>
              {getIcon()}
            </div>
            <p className="text-xs text-gray-400">{description}</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default function SimpleTooltipShowcase() {
  const [, setLocation] = useLocation();
  
  return (
    <div className="container max-w-6xl py-8 space-y-8">
      <div className="flex items-center">
        <Button
          variant="ghost"
          onClick={() => setLocation("/")}
          className="mr-4"
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 bg-clip-text text-transparent">
            Simple AI Insight Tooltips
          </h1>
          <p className="text-gray-400 mt-1">
            Simplified tooltips that provide contextual information for market data and insights
          </p>
        </div>
      </div>

      <Card className="bg-black/40 border-gray-800">
        <CardHeader>
          <CardTitle>Market Trend Tooltips</CardTitle>
          <CardDescription>
            Basic tooltips for market analysis insights
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4">
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Bullish Trend</span>
              <SimpleInsight
                type="bullish"
                title="Bullish Market"
                description="Price is in an uptrend with higher highs and higher lows. Consider buy opportunities."
              >
                <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full">Bullish</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Bearish Trend</span>
              <SimpleInsight
                type="bearish"
                title="Bearish Market"
                description="Price is in a downtrend with lower highs and lower lows. Consider sell opportunities."
              >
                <span className="px-3 py-1 bg-red-500/20 text-red-500 rounded-full">Bearish</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Neutral Market</span>
              <SimpleInsight
                type="neutral"
                title="Neutral Market"
                description="Price is moving sideways with no clear directional bias. Wait for clearer signals."
              >
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-500 rounded-full">Neutral</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Volatile Market</span>
              <SimpleInsight
                type="volatile"
                title="Volatile Market"
                description="Price is showing high volatility with erratic movements. Use wider stops."
              >
                <span className="px-3 py-1 bg-purple-500/20 text-purple-500 rounded-full">Volatile</span>
              </SimpleInsight>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-black/40 border-gray-800">
        <CardHeader>
          <CardTitle>Pattern & Indicator Tooltips</CardTitle>
          <CardDescription>
            Tooltips for technical analysis elements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4">
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Support Level</span>
              <SimpleInsight
                type="bullish"
                title="Support Level"
                description="A price level where demand is strong enough to prevent further decline, often a good area for buy orders."
              >
                <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full">Support</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Resistance Level</span>
              <SimpleInsight
                type="bearish"
                title="Resistance Level"
                description="A price level where selling pressure is strong enough to prevent further rise, often a good area for sell orders."
              >
                <span className="px-3 py-1 bg-red-500/20 text-red-500 rounded-full">Resistance</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Double Bottom Pattern</span>
              <SimpleInsight
                type="bullish"
                title="Double Bottom Pattern"
                description="A bullish reversal pattern that forms after a downtrend, indicating a potential trend change to the upside."
              >
                <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full">Double Bottom</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Head and Shoulders</span>
              <SimpleInsight
                type="bearish"
                title="Head and Shoulders Pattern"
                description="A bearish reversal pattern that forms at the end of an uptrend, signaling a potential trend change to the downside."
              >
                <span className="px-3 py-1 bg-red-500/20 text-red-500 rounded-full">Head & Shoulders</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">RSI Indicator</span>
              <SimpleInsight
                type="neutral"
                title="RSI Indicator"
                description="The Relative Strength Index measures the speed and change of price movements, with readings over 70 indicating overbought and under 30 indicating oversold conditions."
              >
                <span className="px-3 py-1 bg-blue-500/20 text-blue-500 rounded-full">RSI: 54</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">MACD Indicator</span>
              <SimpleInsight
                type="bullish"
                title="MACD Indicator"
                description="The Moving Average Convergence Divergence is a trend-following momentum indicator that shows the relationship between two moving averages of a security's price."
              >
                <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full">MACD: Bullish Crossover</span>
              </SimpleInsight>
            </div>
          </div>
        </CardContent>
      </Card>
      
      <Card className="bg-black/40 border-gray-800">
        <CardHeader>
          <CardTitle>Market Insight Tooltips</CardTitle>
          <CardDescription>
            Tooltips for trading recommendations and entry/exit points
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 p-4">
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Entry Point</span>
              <SimpleInsight
                type="bullish"
                title="Entry Point: 1.0850"
                description="Recommended entry price based on the current chart pattern and support/resistance levels. Place buy order slightly above this price to confirm upward momentum."
              >
                <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full">Entry: 1.0850</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Stop Loss</span>
              <SimpleInsight
                type="bearish"
                title="Stop Loss: 1.0780"
                description="Recommended stop loss level to protect against adverse price movements. This level is below key support to avoid premature exits during normal market volatility."
              >
                <span className="px-3 py-1 bg-red-500/20 text-red-500 rounded-full">Stop: 1.0780</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Take Profit</span>
              <SimpleInsight
                type="bullish"
                title="Take Profit: 1.0950"
                description="Recommended profit target based on the next significant resistance level and historical price reactions at this zone."
              >
                <span className="px-3 py-1 bg-purple-500/20 text-purple-500 rounded-full">TP: 1.0950</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Risk/Reward Ratio</span>
              <SimpleInsight
                type="neutral"
                title="Risk/Reward Ratio: 1:2.5"
                description="The ratio between the potential loss (risk) and potential gain (reward) for this trade. A higher ratio indicates a more favorable trade setup."
              >
                <span className="px-3 py-1 bg-blue-500/20 text-blue-500 rounded-full">R/R: 1:2.5</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Trade Signal</span>
              <SimpleInsight
                type="bullish"
                title="Buy Signal: Strong"
                description="Overall trade recommendation based on technical analysis, pattern recognition, and indicator consensus."
              >
                <span className="px-3 py-1 bg-green-500/20 text-green-500 rounded-full">Buy (Strong)</span>
              </SimpleInsight>
            </div>
            
            <div className="flex flex-col gap-2 items-center">
              <span className="text-sm text-gray-400">Confidence Level</span>
              <SimpleInsight
                type="bullish"
                title="Confidence: High (78%)"
                description="The confidence level in this analysis based on multiple confirming factors including price action, pattern quality, and indicator alignment."
              >
                <span className="px-3 py-1 bg-amber-500/20 text-amber-500 rounded-full">Confidence: 78%</span>
              </SimpleInsight>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}