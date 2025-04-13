import React, { useState, useEffect } from 'react';
import { AIInsightTooltip } from '@/components/tooltips/ai-insight-tooltip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getContextualInsight, type MarketInsight, type MarketTrend } from '@/lib/market-insights';
import { ChevronDown, TrendingUp, TrendingDown, Sparkles, AlertCircle, BarChart2, DollarSign } from 'lucide-react';

export default function AITooltipShowcase() {
  const [insights, setInsights] = useState<Record<string, MarketInsight>>({
    eurusd: {
      id: 'eurusd-1',
      text: 'EUR/USD shows a potential double top formation. Watch the neckline at 1.0850 for confirmation of a bearish reversal.',
      trend: 'bearish',
      symbol: 'EUR/USD',
      confidence: 0.85
    },
    btcusd: {
      id: 'btcusd-1',
      text: 'BTC/USD is forming a bull flag pattern on the 4H chart. A breakout above $68,500 would confirm the continuation pattern.',
      trend: 'bullish',
      symbol: 'BTC/USD',
      confidence: 0.78
    },
    gold: {
      id: 'gold-1',
      text: 'Gold volatility increasing ahead of key economic data. Price action forming a symmetrical triangle - prepare for a breakout.',
      trend: 'volatile',
      symbol: 'XAU/USD',
      confidence: 0.72
    },
    sp500: {
      id: 'sp500-1',
      text: 'S&P 500 consolidating in a range after recent gains. Volume declining suggests indecision. Watch market breadth indicators for clues on direction.',
      trend: 'neutral',
      symbol: 'S&P 500',
      confidence: 0.88
    }
  });

  const [selectedSymbol, setSelectedSymbol] = useState('eurusd');
  const [selectedPattern, setSelectedPattern] = useState('');
  const [selectedTimeframe, setSelectedTimeframe] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedTab, setSelectedTab] = useState('demo');

  const patterns = [
    'Double Top',
    'Head and Shoulders',
    'Triangle',
    'Flag',
    'Engulfing',
    'Doji'
  ];

  const timeframes = [
    '1 Minute',
    '5 Minutes',
    '15 Minutes',
    '30 Minutes',
    '1 Hour',
    '4 Hour',
    'Daily',
    'Weekly'
  ];

  const currencies = [
    { value: 'eurusd', label: 'EUR/USD' },
    { value: 'gbpusd', label: 'GBP/USD' },
    { value: 'usdjpy', label: 'USD/JPY' },
    { value: 'btcusd', label: 'BTC/USD' },
    { value: 'ethusd', label: 'ETH/USD' },
    { value: 'gold', label: 'Gold (XAU/USD)' },
    { value: 'sp500', label: 'S&P 500' }
  ];

  // Function to generate a new insight based on selected parameters
  const generateInsight = async () => {
    if (!selectedSymbol) return;
    
    setIsLoading(true);
    try {
      // Get symbol label from array
      const symbolLabel = currencies.find(c => c.value === selectedSymbol)?.label || selectedSymbol;
      
      // Generate an insight using our API
      const insight = await getContextualInsight({
        symbol: symbolLabel,
        pattern: selectedPattern || undefined,
        timeframe: selectedTimeframe || undefined
      });
      
      // Update insights state with new insight
      setInsights(prev => ({
        ...prev,
        [selectedSymbol]: insight
      }));
      
    } catch (error) {
      console.error('Error generating insight:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Get the current insight for the selected symbol
  const currentInsight = insights[selectedSymbol] || {
    id: 'default',
    text: 'Select a symbol to see market insights',
    trend: 'neutral' as MarketTrend
  };

  return (
    <div className="container max-w-6xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold mb-2">Interactive AI Market Insights</h1>
        <p className="text-gray-500 max-w-2xl mx-auto">
          Explore interactive tooltips with real-time market insights powered by AI. 
          Hover over chart elements to reveal contextual analysis with dynamic animations.
        </p>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
        <TabsList className="grid grid-cols-2 w-full max-w-md mx-auto mb-8">
          <TabsTrigger value="demo">Interactive Demo</TabsTrigger>
          <TabsTrigger value="components">Components</TabsTrigger>
        </TabsList>

        <TabsContent value="demo" className="space-y-8">
          <div className="flex flex-col md:flex-row gap-6">
            {/* Market Chart Simulation */}
            <Card className="flex-1 p-6 border-gray-700 bg-gray-800/50">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="text-lg font-semibold mb-1">{currencies.find(c => c.value === selectedSymbol)?.label || 'Select Market'}</h3>
                  <div className="flex items-center">
                    <Badge 
                      variant="outline"
                      className={`mr-2 ${
                        currentInsight.trend === 'bullish' ? 'bg-green-900/50 text-green-400 border-green-500/50' : 
                        currentInsight.trend === 'bearish' ? 'bg-red-900/50 text-red-400 border-red-500/50' : 
                        currentInsight.trend === 'volatile' ? 'bg-amber-900/50 text-amber-400 border-amber-500/50' : 
                        'bg-blue-900/50 text-blue-400 border-blue-500/50'
                      }`}
                    >
                      {currentInsight.trend === 'bullish' && <TrendingUp className="w-3 h-3 mr-1" />}
                      {currentInsight.trend === 'bearish' && <TrendingDown className="w-3 h-3 mr-1" />}
                      {currentInsight.trend === 'volatile' && <AlertCircle className="w-3 h-3 mr-1" />}
                      {currentInsight.trend.charAt(0).toUpperCase() + currentInsight.trend.slice(1)}
                    </Badge>
                    {selectedTimeframe && (
                      <Badge variant="outline" className="bg-gray-700">
                        {selectedTimeframe}
                      </Badge>
                    )}
                  </div>
                </div>
                <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
                  <SelectTrigger className="w-[180px] bg-gray-700 border-gray-600">
                    <SelectValue placeholder="Select market" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {currencies.map(currency => (
                      <SelectItem key={currency.value} value={currency.value}>
                        {currency.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Chart Simulation with Interactive Elements */}
              <div className="relative bg-gray-900 rounded-xl p-4 h-64 border border-gray-700 overflow-hidden">
                {/* Chart Background - simplified visualization */}
                <div className="absolute inset-0 opacity-30">
                  <div className="absolute left-0 right-0 h-px bg-gray-600" style={{ top: '25%' }}></div>
                  <div className="absolute left-0 right-0 h-px bg-gray-600" style={{ top: '50%' }}></div>
                  <div className="absolute left-0 right-0 h-px bg-gray-600" style={{ top: '75%' }}></div>
                  
                  <div className="absolute top-0 bottom-0 w-px bg-gray-600" style={{ left: '25%' }}></div>
                  <div className="absolute top-0 bottom-0 w-px bg-gray-600" style={{ left: '50%' }}></div>
                  <div className="absolute top-0 bottom-0 w-px bg-gray-600" style={{ left: '75%' }}></div>
                </div>

                {/* Price Movement Simulation */}
                <div className="absolute inset-0 overflow-hidden">
                  {currentInsight.trend === 'bullish' && (
                    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 h-32 w-40 bg-gradient-to-t from-green-500/20 to-transparent rounded-full blur-xl"></div>
                  )}
                  {currentInsight.trend === 'bearish' && (
                    <div className="absolute top-8 left-1/2 transform -translate-x-1/2 h-32 w-40 bg-gradient-to-b from-red-500/20 to-transparent rounded-full blur-xl"></div>
                  )}
                  {currentInsight.trend === 'volatile' && (
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-32 w-40 bg-gradient-to-r from-yellow-500/10 via-orange-500/20 to-yellow-500/10 rounded-full blur-xl"></div>
                  )}
                </div>

                {/* Interactive Tooltip Triggers */}
                <div className="relative h-full">
                  {/* Support/Resistance Level */}
                  <div className="absolute left-0 right-0 top-1/4 flex items-center">
                    <div className="absolute left-0 right-0 h-0.5 bg-blue-500/50 z-10"></div>
                    <AIInsightTooltip 
                      insight="Key resistance level formed by previous swing highs. Watch for rejection or breakout at this level."
                      marketTrend="neutral"
                      position="top"
                    >
                      <div className="relative z-20 bg-blue-500 rounded-full h-3 w-3 cursor-help border-2 border-gray-900"></div>
                    </AIInsightTooltip>
                  </div>
                  
                  {/* Entry Point */}
                  <div className="absolute left-1/3 bottom-1/3">
                    <AIInsightTooltip 
                      insight={currentInsight.text}
                      marketTrend={currentInsight.trend}
                      title="Market Insight"
                      position="right"
                    >
                      <div className="bg-green-500 h-4 w-4 rounded-full cursor-help border-2 border-gray-900 animate-pulse"></div>
                    </AIInsightTooltip>
                  </div>
                  
                  {/* Pattern Recognition */}
                  <div className="absolute right-1/4 top-1/2">
                    <AIInsightTooltip 
                      insight={selectedPattern ? `${selectedPattern} pattern detected with ${Math.round(Math.random() * 30 + 65)}% reliability in current market conditions.` : "No specific pattern selected. Choose a pattern to see analysis."}
                      marketTrend={selectedPattern ? (Math.random() > 0.5 ? 'bullish' : 'bearish') : 'neutral'}
                      title="Pattern Analysis"
                      position="left"
                      icon={<Sparkles className="h-5 w-5 text-purple-500" />}
                    >
                      <div className="flex items-center justify-center h-6 w-6 rounded-full bg-purple-500/30 border border-purple-500 cursor-help">
                        <AlertCircle className="h-4 w-4 text-purple-300" />
                      </div>
                    </AIInsightTooltip>
                  </div>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Technical Pattern</label>
                  <Select value={selectedPattern} onValueChange={setSelectedPattern}>
                    <SelectTrigger className="w-full bg-gray-700 border-gray-600">
                      <SelectValue placeholder="Select pattern" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="">None</SelectItem>
                      {patterns.map(pattern => (
                        <SelectItem key={pattern} value={pattern}>
                          {pattern}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1">Timeframe</label>
                  <Select value={selectedTimeframe} onValueChange={setSelectedTimeframe}>
                    <SelectTrigger className="w-full bg-gray-700 border-gray-600">
                      <SelectValue placeholder="Select timeframe" />
                    </SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      <SelectItem value="">None</SelectItem>
                      {timeframes.map(timeframe => (
                        <SelectItem key={timeframe} value={timeframe}>
                          {timeframe}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Button 
                className="w-full mt-4 bg-rose-600 hover:bg-rose-700"
                onClick={generateInsight}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></span>
                    Generating Insight...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate AI Market Insight
                  </>
                )}
              </Button>
            </Card>

            {/* Insight Details */}
            <Card className="w-full md:w-96 p-6 border-gray-700 bg-gray-800/50">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <BarChart2 className="h-5 w-5 mr-2 text-rose-500" />
                Current Market Insight
              </h3>

              <div className="space-y-4">
                <div>
                  <span className="text-sm text-gray-400">Symbol</span>
                  <p className="font-semibold">{currencies.find(c => c.value === selectedSymbol)?.label || 'N/A'}</p>
                </div>

                <div>
                  <span className="text-sm text-gray-400">Trend Analysis</span>
                  <div className="flex items-center mt-1">
                    {currentInsight.trend === 'bullish' && <TrendingUp className="h-5 w-5 text-green-500 mr-2" />}
                    {currentInsight.trend === 'bearish' && <TrendingDown className="h-5 w-5 text-red-500 mr-2" />}
                    {currentInsight.trend === 'volatile' && <AlertCircle className="h-5 w-5 text-amber-500 mr-2" />}
                    {currentInsight.trend === 'neutral' && <BarChart2 className="h-5 w-5 text-blue-500 mr-2" />}
                    <p className="font-semibold">
                      {currentInsight.trend.charAt(0).toUpperCase() + currentInsight.trend.slice(1)}
                    </p>
                  </div>
                </div>

                {selectedPattern && (
                  <div>
                    <span className="text-sm text-gray-400">Pattern</span>
                    <p className="font-semibold">{selectedPattern}</p>
                  </div>
                )}

                {selectedTimeframe && (
                  <div>
                    <span className="text-sm text-gray-400">Timeframe</span>
                    <p className="font-semibold">{selectedTimeframe}</p>
                  </div>
                )}

                <div>
                  <span className="text-sm text-gray-400">AI Insight</span>
                  <p className="p-3 bg-gray-700 rounded-md mt-1 text-sm">{currentInsight.text}</p>
                </div>

                {currentInsight.confidence && (
                  <div>
                    <span className="text-sm text-gray-400">Confidence</span>
                    <div className="w-full h-2 bg-gray-700 rounded-full mt-2">
                      <div 
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-rose-500" 
                        style={{ width: `${currentInsight.confidence * 100}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-xs mt-1">
                      <span>0%</span>
                      <span>{Math.round(currentInsight.confidence * 100)}%</span>
                      <span>100%</span>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="components" className="space-y-8">
          <h2 className="text-2xl font-bold mb-4">AI Insight Tooltip Variations</h2>
          <p className="text-gray-400 mb-6">
            These tooltips provide contextual market insights with animations that match the trend analysis. Click on each element to see the tooltip in action.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Bullish Tooltip */}
            <Card className="p-6 border-green-500/20 bg-gray-800">
              <h3 className="font-medium mb-4 flex items-center text-green-400">
                <TrendingUp className="h-5 w-5 mr-2" />
                Bullish Insight
              </h3>
              <div className="flex justify-center my-8">
                <AIInsightTooltip
                  insight="Price breaking above the 200-day moving average with increasing volume indicates bullish momentum. Look for continuation patterns to form."
                  marketTrend="bullish"
                  title="Bullish Breakout"
                >
                  <Button className="bg-green-600 hover:bg-green-700">
                    Bullish Signal
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </AIInsightTooltip>
              </div>
            </Card>

            {/* Bearish Tooltip */}
            <Card className="p-6 border-red-500/20 bg-gray-800">
              <h3 className="font-medium mb-4 flex items-center text-red-400">
                <TrendingDown className="h-5 w-5 mr-2" />
                Bearish Insight
              </h3>
              <div className="flex justify-center my-8">
                <AIInsightTooltip
                  insight="Head and shoulders pattern confirmed with neckline breakdown. Volume increasing on the breakdown suggests further downside potential."
                  marketTrend="bearish"
                  title="Bearish Pattern"
                  position="right"
                >
                  <Button className="bg-red-600 hover:bg-red-700">
                    Bearish Signal
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </AIInsightTooltip>
              </div>
            </Card>

            {/* Volatile Tooltip */}
            <Card className="p-6 border-amber-500/20 bg-gray-800">
              <h3 className="font-medium mb-4 flex items-center text-amber-400">
                <AlertCircle className="h-5 w-5 mr-2" />
                Volatile Insight
              </h3>
              <div className="flex justify-center my-8">
                <AIInsightTooltip
                  insight="Market showing exceptionally high volatility ahead of economic data release. Consider reducing position size and using wider stop losses."
                  marketTrend="volatile"
                  title="Volatility Warning"
                  position="top"
                >
                  <Button className="bg-amber-600 hover:bg-amber-700">
                    Volatility Alert
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </AIInsightTooltip>
              </div>
            </Card>

            {/* Neutral Tooltip */}
            <Card className="p-6 border-blue-500/20 bg-gray-800">
              <h3 className="font-medium mb-4 flex items-center text-blue-400">
                <BarChart2 className="h-5 w-5 mr-2" />
                Neutral Insight
              </h3>
              <div className="flex justify-center my-8">
                <AIInsightTooltip
                  insight="Price consolidating within a well-defined range. Watch for breakout of support at 1.2340 or resistance at 1.2580 for next directional move."
                  marketTrend="neutral"
                  title="Range Analysis"
                  position="bottom"
                >
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    Consolidation Zone
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </AIInsightTooltip>
              </div>
            </Card>
          </div>

          <div className="mt-8">
            <h3 className="text-xl font-semibold mb-4">Custom Icon Examples</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card className="p-6 border-gray-700 bg-gray-800">
                <div className="flex justify-center my-4">
                  <AIInsightTooltip
                    insight="Current RSI reading of 72.5 indicates overbought conditions. Watch for potential reversal signals in price action."
                    marketTrend="bearish"
                    title="RSI Indicator"
                    icon={<BarChart2 className="h-5 w-5 text-purple-500" />}
                  >
                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-purple-900/30 cursor-help">
                      <div className="text-sm font-mono font-bold text-purple-400">RSI</div>
                    </div>
                  </AIInsightTooltip>
                </div>
              </Card>

              <Card className="p-6 border-gray-700 bg-gray-800">
                <div className="flex justify-center my-4">
                  <AIInsightTooltip
                    insight="Support level at $35,750 has been tested three times and held. This is a sign of strong buying interest at this level."
                    marketTrend="bullish"
                    title="Support Level"
                    icon={<DollarSign className="h-5 w-5 text-green-500" />}
                  >
                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-green-900/30 cursor-help">
                      <div className="text-sm font-mono font-bold text-green-400">S1</div>
                    </div>
                  </AIInsightTooltip>
                </div>
              </Card>

              <Card className="p-6 border-gray-700 bg-gray-800">
                <div className="flex justify-center my-4">
                  <AIInsightTooltip
                    insight="Double top pattern confirmed with high volume breakdown. Target projection suggests a 5% move to the downside from current levels."
                    marketTrend="bearish"
                    title="Pattern Analysis"
                    icon={<Sparkles className="h-5 w-5 text-amber-500" />}
                  >
                    <div className="flex items-center justify-center h-12 w-12 rounded-full bg-amber-900/30 cursor-help">
                      <div className="text-sm font-mono font-bold text-amber-400">M</div>
                    </div>
                  </AIInsightTooltip>
                </div>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}