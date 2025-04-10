import React from 'react';
import { useLocation } from 'wouter';
import { 
  InsightTooltip, 
  AnimatedInsightTooltip, 
  PatternInsight, 
  IndicatorInsight,
  MarketTrendInsight,
  ConfidenceInsight,
  DirectionInsight,
  BullishInsight,
  BearishInsight,
  VolatilityInsight,
  ConsolidationInsight
} from '@/components/tooltips';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { ChevronLeft, LineChart, BarChart2, Waves, LineChartIcon, TrendingUp, TrendingDown } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function TooltipShowcase() {
  const [, setLocation] = useLocation();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center mb-8">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/')} 
          className="mr-4"
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 bg-clip-text text-transparent">
            Interactive AI Insight Tooltips
          </h1>
          <p className="text-gray-400 mt-1">
            Contextual market animations enhance trading insights
          </p>
        </div>
      </div>

      <Tabs defaultValue="animated" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="animated">Animated Tooltips</TabsTrigger>
          <TabsTrigger value="patterns">Pattern Insights</TabsTrigger>
          <TabsTrigger value="indicators">Indicator Insights</TabsTrigger>
          <TabsTrigger value="market">Market Insights</TabsTrigger>
        </TabsList>
        
        <TabsContent value="animated" className="space-y-6">
          <h2 className="text-2xl font-semibold mb-4">Animated Contextual Tooltips</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-black/40 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="mr-2 h-5 w-5 text-green-500" />
                  Market Trend Animations
                </CardTitle>
                <CardDescription>
                  Visualize market movements with dynamic animations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Bullish:</span>
                    <AnimatedInsightTooltip
                      type="bullish"
                      title="Strong Uptrend"
                      description="Price is showing clear upward momentum with higher highs and higher lows, suggesting continued bullish pressure."
                      animationType="market"
                      strength="strong"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Bearish:</span>
                    <AnimatedInsightTooltip
                      type="bearish"
                      title="Downtrend Detected"
                      description="Price is making lower lows and lower highs, indicating selling pressure is dominating the market."
                      animationType="market"
                      strength="moderate"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Neutral:</span>
                    <AnimatedInsightTooltip
                      type="neutral"
                      title="Sideways Consolidation"
                      description="Price is trading within a narrow range with no clear directional bias, suggesting equilibrium between buyers and sellers."
                      animationType="market"
                      strength="weak"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Volatile:</span>
                    <AnimatedInsightTooltip
                      type="volatile"
                      title="High Volatility"
                      description="Market is experiencing significant price swings and unpredictable movements, suggesting caution is warranted."
                      animationType="market"
                      strength="strong"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <BarChart2 className="mr-2 h-5 w-5 text-amber-500" />
                  Pattern Visualizations
                </CardTitle>
                <CardDescription>
                  Chart patterns with contextual backgrounds
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Bullish:</span>
                    <AnimatedInsightTooltip
                      type="bullish"
                      title="Double Bottom"
                      description="A reversal pattern that forms after a downtrend, creating a 'W' shape that signals potential upward movement."
                      animationType="pattern"
                      strength="strong"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Bearish:</span>
                    <AnimatedInsightTooltip
                      type="bearish"
                      title="Head and Shoulders"
                      description="A reversal pattern consisting of three peaks with the middle one highest, signaling a bullish-to-bearish trend reversal."
                      animationType="pattern"
                      strength="moderate"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Neutral:</span>
                    <AnimatedInsightTooltip
                      type="neutral"
                      title="Rectangle Pattern"
                      description="A continuation pattern where price trades between parallel support and resistance levels, indicating a pause in the trend."
                      animationType="pattern"
                      strength="weak"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Volatile:</span>
                    <AnimatedInsightTooltip
                      type="volatile"
                      title="Broadening Formation"
                      description="An expanding price pattern with higher highs and lower lows, indicating increasing volatility and potential for sharp moves."
                      animationType="pattern"
                      strength="strong"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <LineChart className="mr-2 h-5 w-5 text-blue-500" />
                  Indicator Animations
                </CardTitle>
                <CardDescription>
                  Technical indicators with signal visualizations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Bullish:</span>
                    <AnimatedInsightTooltip
                      type="bullish"
                      title="MACD Crossover"
                      description="The MACD line has crossed above the signal line, generating a bullish signal that suggests potential upward momentum."
                      animationType="indicator"
                      strength="moderate"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Bearish:</span>
                    <AnimatedInsightTooltip
                      type="bearish"
                      title="RSI Overbought"
                      description="The Relative Strength Index has moved above 70, suggesting the asset may be overbought and due for a potential reversal."
                      animationType="indicator"
                      strength="strong"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Neutral:</span>
                    <AnimatedInsightTooltip
                      type="neutral"
                      title="Moving Average Flat"
                      description="The 50-period moving average has flattened, indicating a loss of momentum and potential consolidation phase."
                      animationType="indicator"
                      strength="weak"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Volatile:</span>
                    <AnimatedInsightTooltip
                      type="volatile"
                      title="Bollinger Band Squeeze"
                      description="Bollinger Bands are contracting, indicating decreasing volatility which often precedes a significant price movement."
                      animationType="indicator"
                      strength="moderate"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-black/40 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Waves className="mr-2 h-5 w-5 text-orange-500" />
                  Volatility Visualizations
                </CardTitle>
                <CardDescription>
                  Risk level indications with dynamic waveforms
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Low:</span>
                    <AnimatedInsightTooltip
                      type="bullish"
                      title="Low Volatility"
                      description="Market is experiencing minimal price fluctuations, suggesting a stable environment with predictable movements."
                      animationType="volatility"
                      strength="weak"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Medium:</span>
                    <AnimatedInsightTooltip
                      type="neutral"
                      title="Moderate Volatility"
                      description="Price is showing moderate fluctuations within an expected range, balancing risk and opportunity."
                      animationType="volatility"
                      strength="moderate"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">High:</span>
                    <AnimatedInsightTooltip
                      type="volatile"
                      title="Extreme Volatility"
                      description="Market is experiencing significant price swings with high trading volume, creating both high risk and potential opportunities."
                      animationType="volatility"
                      strength="strong"
                    />
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm w-20">Custom:</span>
                    <AnimatedInsightTooltip
                      type="bearish"
                      title="Post-News Volatility"
                      description="Increased volatility following major economic news release, with price attempting to find a new equilibrium level."
                      animationType="volatility"
                      strength="strong"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="patterns">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Chart Pattern Insights</CardTitle>
              <CardDescription>Pattern recognition with contextual information</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <PatternInsight pattern="Double Bottom" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <PatternInsight pattern="Head and Shoulders" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <PatternInsight pattern="Ascending Triangle" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <PatternInsight pattern="Descending Triangle" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <PatternInsight pattern="Symmetrical Triangle" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <PatternInsight pattern="Cup and Handle" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="indicators">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Technical Indicator Insights</CardTitle>
              <CardDescription>Indicator signals with interpretation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <IndicatorInsight indicator="MACD" signal="bullish" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <IndicatorInsight indicator="RSI" signal="bearish" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <IndicatorInsight indicator="Moving Average" signal="bullish" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <IndicatorInsight indicator="Bollinger Bands" signal="volatile" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <IndicatorInsight indicator="Stochastic" signal="neutral" />
                </div>
                <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                  <IndicatorInsight indicator="Fibonacci" signal="bullish" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="market">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Market Insight Components</CardTitle>
              <CardDescription>Specialized insight components for different trading signals</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                    <h3 className="text-lg font-medium mb-2">Market Trend</h3>
                    <div className="space-y-2">
                      <div><MarketTrendInsight trend="Uptrend" /></div>
                      <div><MarketTrendInsight trend="Downtrend" /></div>
                      <div><MarketTrendInsight trend="Ranging" /></div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                    <h3 className="text-lg font-medium mb-2">Confidence Level</h3>
                    <div className="space-y-2">
                      <div><ConfidenceInsight level="High" /></div>
                      <div><ConfidenceInsight level="Medium" /></div>
                      <div><ConfidenceInsight level="Low" /></div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                    <h3 className="text-lg font-medium mb-2">Direction</h3>
                    <div className="space-y-2">
                      <div><DirectionInsight direction="Buy" /></div>
                      <div><DirectionInsight direction="Sell" /></div>
                      <div><DirectionInsight direction="Hold" /></div>
                    </div>
                  </div>
                </div>
                
                <Separator className="my-6" />
                
                <h3 className="text-xl font-medium mb-4">Extended Market Insights</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                    <BullishInsight 
                      title="Bullish Momentum" 
                      description="Strong buying pressure with higher highs and higher lows forming, suggesting potential for continued upward movement."
                    />
                  </div>
                  <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                    <BearishInsight 
                      title="Bearish Pressure" 
                      description="Significant selling pressure with lower lows and lower highs, indicating potential for further downside."
                    />
                  </div>
                  <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                    <VolatilityInsight 
                      title="Increased Volatility" 
                      description="Market showing large price swings and unpredictable movements, suggesting caution is warranted."
                    />
                  </div>
                  <div className="p-4 rounded-lg border border-gray-800 bg-black/30">
                    <ConsolidationInsight 
                      title="Price Consolidation" 
                      description="Price trading in a tight range with reduced volatility, often preceding a significant breakout movement."
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="mt-12 bg-black/40 border border-gray-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Implementation Guide</h2>
        <div className="space-y-4">
          <p className="text-gray-300">
            To use these interactive tooltips in your analysis:
          </p>
          <ol className="list-decimal pl-6 space-y-2 text-gray-300">
            <li>Import the appropriate tooltip component from the tooltips directory</li>
            <li>Choose between standard InsightTooltip or AnimatedInsightTooltip for advanced effects</li>
            <li>Configure the tooltip type (bullish, bearish, neutral, volatile)</li>
            <li>For animated tooltips, specify the animation type and strength</li>
            <li>Add descriptive title and detailed explanation text</li>
          </ol>
          <div className="p-4 bg-gray-900/50 rounded-md mt-4">
            <pre className="text-xs text-gray-300 overflow-x-auto">
              {`<AnimatedInsightTooltip
  type="bullish"
  title="Strong Uptrend"
  description="Price showing clear upward momentum"
  animationType="market"
  strength="strong"
/>`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}