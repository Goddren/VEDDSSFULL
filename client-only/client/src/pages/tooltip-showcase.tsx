import React, { useState } from "react";
import { useLocation, Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  SimpleInsight,
  BullishInsight,
  BearishInsight,
  NeutralInsight,
  VolatileInsight
} from "@/components/tooltips";

// Import types from tooltip-types
import {
  AnimationType,
  MarketTrend,
  ConfidenceLevel,
  PatternType,
  IndicatorType
} from "@/components/tooltips/tooltip-types";

export default function TooltipShowcase() {
  const [, setLocation] = useLocation();
  
  // Animation settings
  const [selectedAnimation, setSelectedAnimation] = useState<AnimationType>("wave");
  const [animationSpeed, setAnimationSpeed] = useState<"slow" | "normal" | "fast">("normal");
  const [intensity, setIntensity] = useState(50);
  
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
            Interactive AI Insight Tooltips
          </h1>
          <p className="text-gray-400 mt-1">
            Animated tooltips that provide contextual visualizations for market data and insights
          </p>
        </div>
      </div>

      <Tabs defaultValue="animations" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="animations">Base Animations</TabsTrigger>
          <TabsTrigger value="market-trends">Market Trends</TabsTrigger>
          <TabsTrigger value="confidence">Confidence Levels</TabsTrigger>
          <TabsTrigger value="patterns">Chart Patterns</TabsTrigger>
          <TabsTrigger value="indicators">Technical Indicators</TabsTrigger>
        </TabsList>
        
        {/* Base Animation Types */}
        <TabsContent value="animations" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Animation Types</CardTitle>
              <CardDescription>
                Hover over each tooltip to see its animation in action
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Wave</span>
                  <AnimatedInsightTooltip 
                    title="Wave Animation" 
                    description="Shows smooth up and down movement, great for price trends or momentum."
                    animationType="wave"
                  >
                    Wave
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Zigzag</span>
                  <AnimatedInsightTooltip 
                    title="Zigzag Animation" 
                    description="Shows rapid side-to-side movement, ideal for volatility or erratic price action."
                    animationType="zigzag"
                    gradientColors={['rgba(236, 72, 153, 0.6)', 'rgba(236, 72, 153, 0.2)']}
                  >
                    Zigzag
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Ripple</span>
                  <AnimatedInsightTooltip 
                    title="Ripple Animation" 
                    description="Creates expanding circles, good for showing impact or zone effects."
                    animationType="ripple"
                    gradientColors={['rgba(139, 92, 246, 0.6)', 'rgba(139, 92, 246, 0.2)']}
                  >
                    Ripple
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Pulse</span>
                  <AnimatedInsightTooltip 
                    title="Pulse Animation" 
                    description="Shows rhythmic pulse, good for showing strength or importance."
                    animationType="pulse"
                    gradientColors={['rgba(96, 165, 250, 0.6)', 'rgba(96, 165, 250, 0.2)']}
                  >
                    Pulse
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Flash</span>
                  <AnimatedInsightTooltip 
                    title="Flash Animation" 
                    description="Creates blinking effect, good for alerts and critical information."
                    animationType="flash"
                    gradientColors={['rgba(250, 204, 21, 0.6)', 'rgba(250, 204, 21, 0.2)']}
                  >
                    Flash
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Arrow</span>
                  <AnimatedInsightTooltip 
                    title="Arrow Animation" 
                    description="Shows arrow movement, good for direction or next steps."
                    animationType="arrow"
                    gradientColors={['rgba(16, 185, 129, 0.6)', 'rgba(16, 185, 129, 0.2)']}
                  >
                    Arrow
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Scatter</span>
                  <AnimatedInsightTooltip 
                    title="Scatter Animation" 
                    description="Shows dispersed movement, good for distribution or fragmentation."
                    animationType="scatter"
                    gradientColors={['rgba(251, 113, 133, 0.6)', 'rgba(251, 113, 133, 0.2)']}
                  >
                    Scatter
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Convergence</span>
                  <AnimatedInsightTooltip 
                    title="Convergence Animation" 
                    description="Shows focusing or converging elements, good for consolidation patterns."
                    animationType="convergence"
                    gradientColors={['rgba(124, 58, 237, 0.6)', 'rgba(124, 58, 237, 0.2)']}
                  >
                    Convergence
                  </AnimatedInsightTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Custom</span>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <div>
                        <label className="text-xs text-gray-500">Animation Type</label>
                        <select 
                          className="w-full bg-black/60 border border-gray-800 rounded p-1 text-sm"
                          value={selectedAnimation}
                          onChange={(e) => setSelectedAnimation(e.target.value as AnimationType)}
                        >
                          <option value="wave">Wave</option>
                          <option value="zigzag">Zigzag</option>
                          <option value="ripple">Ripple</option>
                          <option value="pulse">Pulse</option>
                          <option value="flash">Flash</option>
                          <option value="arrow">Arrow</option>
                          <option value="scatter">Scatter</option>
                          <option value="convergence">Convergence</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-500">Speed</label>
                        <select 
                          className="w-full bg-black/60 border border-gray-800 rounded p-1 text-sm"
                          value={animationSpeed}
                          onChange={(e) => setAnimationSpeed(e.target.value as "slow" | "normal" | "fast")}
                        >
                          <option value="slow">Slow</option>
                          <option value="normal">Normal</option>
                          <option value="fast">Fast</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Intensity: {intensity}</label>
                      <Slider 
                        min={0} 
                        max={100} 
                        step={1}
                        value={[intensity]} 
                        onValueChange={(value) => setIntensity(value[0])}
                        className="my-2"
                      />
                    </div>
                    <AnimatedInsightTooltip 
                      title="Custom Animation" 
                      description={`Using ${selectedAnimation} animation with ${animationSpeed} speed and ${intensity}% intensity.`}
                      animationType={selectedAnimation}
                      animationSpeed={animationSpeed}
                      gradientColors={['rgba(147, 51, 234, 0.6)', 'rgba(147, 51, 234, 0.2)']}
                    >
                      Custom
                    </AnimatedInsightTooltip>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Market Trend Tooltips */}
        <TabsContent value="market-trends" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Market Trend Visualizations</CardTitle>
              <CardDescription>
                Tooltips that visualize different market trend directions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Bullish Trend</span>
                  <TrendTooltip 
                    title="Bullish Market" 
                    description="Price is in a strong uptrend with higher highs and higher lows. Consider buy opportunities."
                    trend="bullish"
                    intensity={70}
                  >
                    Bullish
                  </TrendTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Bearish Trend</span>
                  <TrendTooltip 
                    title="Bearish Market" 
                    description="Price is in a downtrend with lower highs and lower lows. Consider sell opportunities."
                    trend="bearish"
                    intensity={60}
                  >
                    Bearish
                  </TrendTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Neutral Trend</span>
                  <TrendTooltip 
                    title="Neutral Market" 
                    description="Price is moving sideways with no clear directional bias. Consider waiting for clearer signals."
                    trend="neutral"
                    intensity={40}
                  >
                    Neutral
                  </TrendTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Volatile Market</span>
                  <TrendTooltip 
                    title="Volatile Market" 
                    description="Price is showing high volatility with large candles and erratic movements. Use caution and wider stops."
                    trend="volatile"
                    intensity={80}
                  >
                    Volatile
                  </TrendTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Sideways Market</span>
                  <TrendTooltip 
                    title="Sideways Market" 
                    description="Price is trading in a defined range between support and resistance. Consider range-bound strategies."
                    trend="sideways"
                    intensity={50}
                  >
                    Sideways
                  </TrendTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Bullish Breakout</span>
                  <TrendTooltip 
                    title="Bullish Breakout" 
                    description="Price has broken above a key resistance level with increasing volume, signaling potential trend continuation."
                    trend="bullish"
                    intensity={90}
                  >
                    Breakout
                  </TrendTooltip>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Confidence Level Tooltips */}
        <TabsContent value="confidence" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Signal Confidence Indicators</CardTitle>
              <CardDescription>
                Tooltips that visualize confidence levels for trading signals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Very High Confidence</span>
                  <ConfidenceTooltip 
                    title="Very High Confidence" 
                    description="Multiple indicators align strongly, with clear pattern confirmation and strong momentum."
                    level="very-high"
                    percentage={95}
                    emphasize={true}
                  >
                    Very High
                  </ConfidenceTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">High Confidence</span>
                  <ConfidenceTooltip 
                    title="High Confidence" 
                    description="Several indicators confirm the signal with good pattern completion and volume support."
                    level="high"
                    percentage={75}
                  >
                    High
                  </ConfidenceTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Medium Confidence</span>
                  <ConfidenceTooltip 
                    title="Medium Confidence" 
                    description="Some indicators confirm but there may be conflicting signals or incomplete patterns."
                    level="medium"
                    percentage={50}
                  >
                    Medium
                  </ConfidenceTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Low Confidence</span>
                  <ConfidenceTooltip 
                    title="Low Confidence" 
                    description="Few indicators align, with weak patterns and potential for false signals."
                    level="low"
                    percentage={25}
                  >
                    Low
                  </ConfidenceTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Buy Signal</span>
                  <ConfidenceTooltip 
                    title="Buy Signal Confidence" 
                    description="Strong buy signal with 76% confidence based on multiple bullish indicators."
                    level="high"
                    percentage={76}
                  >
                    Buy - 76%
                  </ConfidenceTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Sell Signal</span>
                  <ConfidenceTooltip 
                    title="Sell Signal Confidence" 
                    description="Moderate sell signal with 62% confidence based on emerging bearish patterns."
                    level="medium"
                    percentage={62}
                  >
                    Sell - 62%
                  </ConfidenceTooltip>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Chart Pattern Tooltips */}
        <TabsContent value="patterns" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Chart Pattern Visualizations</CardTitle>
              <CardDescription>
                Tooltips that illustrate common technical analysis patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Head and Shoulders</span>
                  <PatternTooltip 
                    title="Head and Shoulders" 
                    description="Reversal pattern showing three peaks with the middle one highest, signaling potential trend reversal."
                    patternType="head-and-shoulders"
                    direction="bearish"
                    strength="strong"
                    completion={95}
                  >
                    H&S Pattern
                  </PatternTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Double Bottom</span>
                  <PatternTooltip 
                    title="Double Bottom" 
                    description="Bullish reversal pattern showing two lows at approximately the same level, indicating potential upward reversal."
                    patternType="double-bottom"
                    direction="bullish"
                    strength="moderate"
                    completion={85}
                  >
                    Double Bottom
                  </PatternTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Ascending Triangle</span>
                  <PatternTooltip 
                    title="Ascending Triangle" 
                    description="Continuation pattern with horizontal resistance and rising support, typically bullish."
                    patternType="triangle"
                    direction="bullish"
                    strength="strong"
                    completion={75}
                  >
                    Asc Triangle
                  </PatternTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Wedge Pattern</span>
                  <PatternTooltip 
                    title="Falling Wedge" 
                    description="Bullish reversal pattern with converging downward trendlines, suggesting potential upside breakout."
                    patternType="wedge"
                    direction="bullish"
                    strength="moderate"
                    completion={80}
                  >
                    Falling Wedge
                  </PatternTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Flag Pattern</span>
                  <PatternTooltip 
                    title="Bullish Flag" 
                    description="Continuation pattern formed after a strong move, showing a channel that slopes against the prior trend."
                    patternType="flag"
                    direction="bullish"
                    strength="strong"
                    completion={90}
                  >
                    Bullish Flag
                  </PatternTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Channel Pattern</span>
                  <PatternTooltip 
                    title="Bearish Channel" 
                    description="Price action bounded by parallel downward trendlines, forming a consistent descending channel."
                    patternType="channel"
                    direction="bearish"
                    strength="moderate"
                    completion={70}
                  >
                    Bearish Channel
                  </PatternTooltip>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Technical Indicator Tooltips */}
        <TabsContent value="indicators" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Technical Indicator Signals</CardTitle>
              <CardDescription>
                Tooltips that visualize technical indicator readings and signals
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">RSI Indicator</span>
                  <IndicatorTooltip 
                    title="RSI Indicator" 
                    description="Relative Strength Index is currently showing overbought conditions at 78.5."
                    indicatorType="rsi"
                    signal="overbought"
                    value={78.5}
                    threshold={70}
                  >
                    RSI: 78.5
                  </IndicatorTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">MACD Indicator</span>
                  <IndicatorTooltip 
                    title="MACD Crossover" 
                    description="MACD line has crossed above the signal line, generating a bullish signal."
                    indicatorType="macd"
                    signal="buy"
                  >
                    MACD: Bullish
                  </IndicatorTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Moving Average</span>
                  <IndicatorTooltip 
                    title="Moving Average Crossover" 
                    description="The 50-day MA has crossed below the 200-day MA, forming a Death Cross bearish signal."
                    indicatorType="moving-average"
                    signal="sell"
                  >
                    MA: Death Cross
                  </IndicatorTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Bollinger Bands</span>
                  <IndicatorTooltip 
                    title="Bollinger Bands Squeeze" 
                    description="Bands are contracting, indicating decreased volatility and potential for a breakout."
                    indicatorType="bollinger-bands"
                    signal="hold"
                  >
                    BB: Squeeze
                  </IndicatorTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Stochastic Oscillator</span>
                  <IndicatorTooltip 
                    title="Stochastic Oversold" 
                    description="Stochastic oscillator is in oversold territory at 15.3, suggesting potential bullish reversal."
                    indicatorType="stochastic"
                    signal="oversold"
                    value={15.3}
                    threshold={20}
                  >
                    Stoch: 15.3
                  </IndicatorTooltip>
                </div>
                
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Support/Resistance</span>
                  <IndicatorTooltip 
                    title="Major Support Level" 
                    description="Price is approaching a major support level at 1.1250 with multiple touches in the past."
                    indicatorType="support-resistance"
                    signal="buy"
                    value={1.1250}
                  >
                    Support: 1.1250
                  </IndicatorTooltip>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}