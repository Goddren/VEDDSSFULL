import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { InteractiveInsightTooltip } from '@/components/ui/interactive-insight-tooltip';
import { ArrowLeft, Book, Lightbulb, BarChart, LineChart, Activity, TrendingUp, TrendingDown, ExternalLink } from 'lucide-react';
import { Link } from 'wouter';

const MarketInsights: React.FC = () => {
  const tooltipData = [
    // Candlestick insights
    {
      title: "Bullish Engulfing Pattern",
      description: "A bullish engulfing pattern occurs when a small bearish candle is followed by a large bullish candle that completely 'engulfs' the previous one. This signals potential trend reversal to the upside.",
      type: "bullish" as const,
      context: "candlestick" as const,
    },
    {
      title: "Bearish Evening Star",
      description: "A bearish evening star pattern is a three-candle pattern that signals a potential reversal from bullish to bearish momentum. The middle candle is typically a small-bodied candle that shows indecision.",
      type: "bearish" as const,
      context: "candlestick" as const,
    },
    
    // Support/Resistance
    {
      title: "Dynamic Support Level",
      description: "Dynamic support moves with price and often comes from moving averages or trend lines. These levels tend to provide stronger support during uptrends.",
      type: "bullish" as const,
      context: "support" as const,
    },
    {
      title: "Key Resistance Zone",
      description: "A key resistance zone represents a price area where selling pressure has overwhelmed buying pressure multiple times. Breaking above this zone could trigger significant upward movement.",
      type: "bearish" as const,
      context: "resistance" as const,
    },
    
    // Breakout
    {
      title: "Bull Flag Breakout",
      description: "A bull flag breakout occurs when price consolidates in a downward-sloping parallel channel after a strong upward move, then breaks above the upper boundary, potentially continuing the uptrend.",
      type: "bullish" as const,
      context: "breakout" as const,
    },
    {
      title: "Head & Shoulders Breakdown",
      description: "A head and shoulders breakdown occurs when price breaks below the neckline of the pattern, suggesting a significant reversal from bullish to bearish momentum.",
      type: "bearish" as const,
      context: "breakout" as const,
    },
    
    // Trend
    {
      title: "Strong Uptrend",
      description: "A strong uptrend is characterized by higher highs and higher lows, with price consistently closing above key moving averages. Volume often increases during upward price movements.",
      type: "bullish" as const,
      context: "trend" as const,
    },
    {
      title: "Developing Downtrend",
      description: "A developing downtrend shows lower highs and lower lows forming on the chart, with price action starting to close below key moving averages.",
      type: "bearish" as const,
      context: "trend" as const,
    },
    {
      title: "Sideways Consolidation",
      description: "Price is moving horizontally within a defined range, showing neither bullish nor bearish conviction. This often precedes a significant move when the range is eventually broken.",
      type: "neutral" as const,
      context: "trend" as const,
    },
    {
      title: "Increased Volatility",
      description: "Market volatility has significantly increased, creating wider price swings and potentially larger trading opportunities, but also greater risk.",
      type: "volatile" as const,
      context: "trend" as const,
    },
    
    // Volume
    {
      title: "Volume Confirmation",
      description: "Increasing volume accompanying a price move provides confirmation of the trend's strength and sustainability.",
      type: "bullish" as const,
      context: "volume" as const,
    },
    {
      title: "Volume Divergence",
      description: "Price is making new highs, but volume is decreasing, suggesting the trend may be weakening and a reversal could be forthcoming.",
      type: "bearish" as const,
      context: "volume" as const,
    },
    
    // Divergence
    {
      title: "Bullish RSI Divergence",
      description: "Price makes lower lows while the RSI indicator makes higher lows, suggesting weakening downside momentum and potential reversal to the upside.",
      type: "bullish" as const,
      context: "divergence" as const,
    },
    {
      title: "Bearish MACD Divergence",
      description: "Price makes higher highs while the MACD histogram makes lower highs, indicating weakening upward momentum despite rising prices.",
      type: "bearish" as const,
      context: "divergence" as const,
    },
    
    // Indicator
    {
      title: "Golden Cross",
      description: "A golden cross occurs when a shorter-term moving average crosses above a longer-term moving average, signaling a potential change to an uptrend.",
      type: "bullish" as const,
      context: "indicator" as const,
    },
    {
      title: "Death Cross",
      description: "A death cross occurs when a shorter-term moving average crosses below a longer-term moving average, signaling a potential change to a downtrend.",
      type: "bearish" as const,
      context: "indicator" as const,
    },
    
    // Reversal
    {
      title: "Double Bottom Reversal",
      description: "A double bottom is a reversal pattern that forms after a downtrend, with price testing a support level twice before moving higher, indicating a potential trend change.",
      type: "bullish" as const,
      context: "reversal" as const,
    },
    {
      title: "Double Top Reversal",
      description: "A double top is a reversal pattern that forms after an uptrend, with price testing a resistance level twice before moving lower, indicating a potential trend change.",
      type: "bearish" as const,
      context: "reversal" as const,
    },
    
    // Pattern
    {
      title: "Ascending Triangle",
      description: "An ascending triangle is a bullish continuation pattern characterized by a horizontal upper resistance line and an upward-sloping lower support line.",
      type: "bullish" as const,
      context: "pattern" as const,
    },
    {
      title: "Descending Triangle",
      description: "A descending triangle is a bearish continuation pattern characterized by a horizontal lower support line and a downward-sloping upper resistance line.",
      type: "bearish" as const,
      context: "pattern" as const,
    },
  ];

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center mb-8">
        <Link href="/dashboard">
          <Button variant="ghost" size="sm" className="mr-4">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Market Insights</h1>
          <p className="text-muted-foreground">
            Interactive AI-powered trading insights with contextual visualizations
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-500" />
              <span>Interactive AI Tooltips</span>
            </CardTitle>
            <CardDescription>
              Hover over or click on any insight to see detailed visualizations
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Our interactive AI insights provide visual context to help you understand complex trading concepts and market conditions.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <Book className="h-5 w-5 text-blue-500" />
              <span>Trading Education</span>
            </CardTitle>
            <CardDescription>
              Learn trading concepts through interactive visualizations
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Visualizing market concepts helps develop intuition and pattern recognition skills that are essential for successful trading.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg font-medium flex items-center gap-2">
              <BarChart className="h-5 w-5 text-rose-500" />
              <span>Contextual Animations</span>
            </CardTitle>
            <CardDescription>
              Dynamic visuals that explain market conditions
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground mb-4">
              Each tooltip features context-specific animations that help visualize the concept being explained, from candlestick patterns to breakouts.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Candlestick & Chart Patterns</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tooltipData
            .filter(tip => ['candlestick', 'pattern', 'reversal'].includes(tip.context))
            .map((tip, index) => (
              <Card key={index} className="border-gray-800 bg-gray-900/70 transition-all duration-300 hover:bg-gray-900">
                <CardContent className="pt-6">
                  <div className="mb-4">
                    <InteractiveInsightTooltip
                      title={tip.title}
                      description={tip.description}
                      type={tip.type}
                      context={tip.context}
                    >
                      <div className={`
                        p-2 rounded-lg 
                        ${tip.type === 'bullish' ? 'bg-emerald-500/10 border border-emerald-500/20' : 
                          tip.type === 'bearish' ? 'bg-rose-500/10 border border-rose-500/20' : 
                          tip.type === 'volatile' ? 'bg-orange-500/10 border border-orange-500/20' : 
                          'bg-amber-500/10 border border-amber-500/20'}
                        w-full text-center font-medium cursor-help
                      `}>
                        {tip.title}
                      </div>
                    </InteractiveInsightTooltip>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-3">{tip.description}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Support, Resistance & Breakouts</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tooltipData
            .filter(tip => ['support', 'resistance', 'breakout'].includes(tip.context))
            .map((tip, index) => (
              <Card key={index} className="border-gray-800 bg-gray-900/70 transition-all duration-300 hover:bg-gray-900">
                <CardContent className="pt-6">
                  <div className="mb-4">
                    <InteractiveInsightTooltip
                      title={tip.title}
                      description={tip.description}
                      type={tip.type}
                      context={tip.context}
                    >
                      <div className={`
                        p-2 rounded-lg 
                        ${tip.type === 'bullish' ? 'bg-emerald-500/10 border border-emerald-500/20' : 
                          tip.type === 'bearish' ? 'bg-rose-500/10 border border-rose-500/20' : 
                          tip.type === 'volatile' ? 'bg-orange-500/10 border border-orange-500/20' : 
                          'bg-amber-500/10 border border-amber-500/20'}
                        w-full text-center font-medium cursor-help
                      `}>
                        {tip.title}
                      </div>
                    </InteractiveInsightTooltip>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-3">{tip.description}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Trend Analysis & Volume</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tooltipData
            .filter(tip => ['trend', 'volume'].includes(tip.context))
            .map((tip, index) => (
              <Card key={index} className="border-gray-800 bg-gray-900/70 transition-all duration-300 hover:bg-gray-900">
                <CardContent className="pt-6">
                  <div className="mb-4">
                    <InteractiveInsightTooltip
                      title={tip.title}
                      description={tip.description}
                      type={tip.type}
                      context={tip.context}
                    >
                      <div className={`
                        p-2 rounded-lg 
                        ${tip.type === 'bullish' ? 'bg-emerald-500/10 border border-emerald-500/20' : 
                          tip.type === 'bearish' ? 'bg-rose-500/10 border border-rose-500/20' : 
                          tip.type === 'volatile' ? 'bg-orange-500/10 border border-orange-500/20' : 
                          'bg-amber-500/10 border border-amber-500/20'}
                        w-full text-center font-medium cursor-help
                      `}>
                        {tip.title}
                      </div>
                    </InteractiveInsightTooltip>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-3">{tip.description}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Indicators & Divergences</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {tooltipData
            .filter(tip => ['indicator', 'divergence'].includes(tip.context))
            .map((tip, index) => (
              <Card key={index} className="border-gray-800 bg-gray-900/70 transition-all duration-300 hover:bg-gray-900">
                <CardContent className="pt-6">
                  <div className="mb-4">
                    <InteractiveInsightTooltip
                      title={tip.title}
                      description={tip.description}
                      type={tip.type}
                      context={tip.context}
                    >
                      <div className={`
                        p-2 rounded-lg 
                        ${tip.type === 'bullish' ? 'bg-emerald-500/10 border border-emerald-500/20' : 
                          tip.type === 'bearish' ? 'bg-rose-500/10 border border-rose-500/20' : 
                          tip.type === 'volatile' ? 'bg-orange-500/10 border border-orange-500/20' : 
                          'bg-amber-500/10 border border-amber-500/20'}
                        w-full text-center font-medium cursor-help
                      `}>
                        {tip.title}
                      </div>
                    </InteractiveInsightTooltip>
                  </div>
                  <p className="text-sm text-gray-400 line-clamp-3">{tip.description}</p>
                </CardContent>
              </Card>
            ))}
        </div>
      </div>

      <div className="mb-8">
        <h2 className="text-2xl font-bold mb-4">Practical Examples</h2>
        <Card className="border-gray-800">
          <CardContent className="pt-6">
            <p className="mb-4 text-sm">
              Using our interactive tooltips in your trading analysis can help identify key market conditions. For example, when you see a 
              {' '}<InteractiveInsightTooltip title="Bullish Engulfing Pattern" description="A bullish engulfing pattern occurs when a small bearish candle is followed by a large bullish candle that completely 'engulfs' the previous one." type="bullish" context="candlestick" className="font-medium text-emerald-500" />{' '}
              forming near a 
              {' '}<InteractiveInsightTooltip title="Support Level" description="A price level where buying pressure is expected to overcome selling pressure, causing the price to bounce higher." type="bullish" context="support" className="font-medium text-emerald-500" />{' '}
              with 
              {' '}<InteractiveInsightTooltip title="Volume Confirmation" description="Increasing volume accompanying a price move provides confirmation that the trend has strength and is more likely to continue." type="bullish" context="volume" className="font-medium text-emerald-500" />{' '}
              and a 
              {' '}<InteractiveInsightTooltip title="Bullish MACD Crossover" description="When the MACD line crosses above the signal line, indicating increasing bullish momentum in the market." type="bullish" context="indicator" className="font-medium text-emerald-500" />{' '},
              this creates a stronger case for a potential upward move.
            </p>
            <p className="mb-4 text-sm">
              Similarly, traders should be cautious when they identify a 
              {' '}<InteractiveInsightTooltip title="Bearish Evening Star" description="A bearish evening star pattern is a three-candle pattern that signals a potential reversal from bullish to bearish momentum." type="bearish" context="candlestick" className="font-medium text-rose-500" />{' '}
              at a major 
              {' '}<InteractiveInsightTooltip title="Resistance Level" description="A price level where selling pressure is expected to overcome buying pressure, causing the price to decline." type="bearish" context="resistance" className="font-medium text-rose-500" />{' '}
              combined with 
              {' '}<InteractiveInsightTooltip title="Bearish Divergence" description="Price makes higher highs while an oscillator makes lower highs, suggesting weakening upward momentum despite rising prices." type="bearish" context="divergence" className="font-medium text-rose-500" />{' '}
              on the RSI indicator.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-12">
        <h2 className="text-2xl font-bold mb-4">Using Insight Tooltips in Chart Analysis</h2>
        <Card>
          <CardContent className="pt-6">
            <p className="mb-6 text-sm text-muted-foreground">
              Our interactive insight tooltips are integrated throughout the application, providing contextual information when analyzing charts. 
              They appear on analysis results, in educational sections, and can help explain complex concepts as you review your trading history.
            </p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex flex-col items-center gap-2 p-4 bg-gray-900/50 rounded-lg">
                <TrendingUp className="h-8 w-8 text-emerald-500" />
                <h3 className="font-medium">Bullish Signals</h3>
                <p className="text-xs text-center text-gray-400">
                  Interactive visualizations of bullish patterns and indicators to confirm uptrends and potential entry points
                </p>
              </div>
              
              <div className="flex flex-col items-center gap-2 p-4 bg-gray-900/50 rounded-lg">
                <TrendingDown className="h-8 w-8 text-rose-500" />
                <h3 className="font-medium">Bearish Signals</h3>
                <p className="text-xs text-center text-gray-400">
                  Animated visualizations of bearish patterns and indicators to identify downtrends and potential exit points
                </p>
              </div>
              
              <div className="flex flex-col items-center gap-2 p-4 bg-gray-900/50 rounded-lg">
                <Activity className="h-8 w-8 text-amber-500" />
                <h3 className="font-medium">Market Conditions</h3>
                <p className="text-xs text-center text-gray-400">
                  Visual context for market conditions including volatility, trend strength, and trading volume
                </p>
              </div>
            </div>
            
            <div className="mt-6 text-center">
              <Link href="/analysis">
                <Button>
                  Try In Chart Analysis 
                  <ExternalLink className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default MarketInsights;