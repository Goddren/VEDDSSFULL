import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { 
  LineChart, BarChart3, TrendingUp, Settings2, Save, Play, BarChart, 
  ChevronRight, ChevronLeft, CheckCircle2, CircleDot, Filter, Sliders
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';

// Types for trading strategy
interface StrategyParameter {
  id: string;
  name: string;
  type: 'number' | 'boolean' | 'select';
  description: string;
  value: any;
  options?: { label: string; value: any }[];
  min?: number;
  max?: number;
  step?: number;
}

interface TradingStrategy {
  id: string;
  name: string;
  description: string;
  category: 'trend' | 'reversal' | 'breakout' | 'volatility' | 'custom';
  parameters: StrategyParameter[];
  riskLevel: 'low' | 'medium' | 'high';
}

interface StrategyResults {
  winRate: number;
  profitFactor: number;
  averageWin: number;
  averageLoss: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: {
    date: string;
    type: 'buy' | 'sell';
    price: number;
    result: 'win' | 'loss';
    profit: number;
  }[];
  equity: { date: string; value: number }[];
}

// Predefined strategies
const predefinedStrategies: TradingStrategy[] = [
  {
    id: 'moving-average-crossover',
    name: 'Moving Average Crossover',
    description: 'A trend-following strategy that generates signals when a shorter moving average crosses a longer one',
    category: 'trend',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'fast-period',
        name: 'Fast MA Period',
        type: 'number',
        description: 'Period for the faster moving average',
        value: 10,
        min: 2,
        max: 50,
        step: 1
      },
      {
        id: 'slow-period',
        name: 'Slow MA Period',
        type: 'number',
        description: 'Period for the slower moving average',
        value: 20,
        min: 5,
        max: 200,
        step: 1
      },
      {
        id: 'ma-type',
        name: 'MA Type',
        type: 'select',
        description: 'Type of moving average to use',
        value: 'ema',
        options: [
          { label: 'Simple (SMA)', value: 'sma' },
          { label: 'Exponential (EMA)', value: 'ema' },
          { label: 'Weighted (WMA)', value: 'wma' }
        ]
      },
      {
        id: 'use-filters',
        name: 'Use Trend Filters',
        type: 'boolean',
        description: 'Apply additional filters to reduce false signals',
        value: true
      }
    ]
  },
  {
    id: 'rsi-overbought-oversold',
    name: 'RSI Overbought/Oversold',
    description: 'A mean-reversion strategy that looks for overbought and oversold conditions using RSI',
    category: 'reversal',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'rsi-period',
        name: 'RSI Period',
        type: 'number',
        description: 'Period for RSI calculation',
        value: 14,
        min: 2,
        max: 50,
        step: 1
      },
      {
        id: 'overbought',
        name: 'Overbought Level',
        type: 'number',
        description: 'Level considered overbought',
        value: 70,
        min: 50,
        max: 95,
        step: 1
      },
      {
        id: 'oversold',
        name: 'Oversold Level',
        type: 'number',
        description: 'Level considered oversold',
        value: 30,
        min: 5,
        max: 50,
        step: 1
      },
      {
        id: 'use-divergence',
        name: 'Check for Divergence',
        type: 'boolean',
        description: 'Look for price/RSI divergence for stronger signals',
        value: true
      }
    ]
  },
  {
    id: 'breakout-with-volume',
    name: 'Breakout with Volume Confirmation',
    description: 'Identifies price breakouts from ranges or patterns with volume confirmation',
    category: 'breakout',
    riskLevel: 'high',
    parameters: [
      {
        id: 'lookback-period',
        name: 'Lookback Period',
        type: 'number',
        description: 'Number of periods to identify the range',
        value: 20,
        min: 5,
        max: 100,
        step: 1
      },
      {
        id: 'volume-threshold',
        name: 'Volume Threshold',
        type: 'number',
        description: 'Volume increase required (in %)',
        value: 150,
        min: 100,
        max: 300,
        step: 5
      },
      {
        id: 'breakout-type',
        name: 'Breakout Type',
        type: 'select',
        description: 'Type of breakout to look for',
        value: 'both',
        options: [
          { label: 'Bullish Only', value: 'bullish' },
          { label: 'Bearish Only', value: 'bearish' },
          { label: 'Both Directions', value: 'both' }
        ]
      }
    ]
  }
];

// Wizard steps
type WizardStep = 'select' | 'configure' | 'backtest' | 'results';

export default function StrategyWizard() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('select');
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategy | null>(null);
  const [customizedStrategy, setCustomizedStrategy] = useState<TradingStrategy | null>(null);
  const [symbol, setSymbol] = useState<string>('EURUSD');
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [testPeriod, setTestPeriod] = useState<string>('6M');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<StrategyResults | null>(null);
  
  const { toast } = useToast();

  // Handle strategy selection
  const handleSelectStrategy = (strategy: TradingStrategy) => {
    setSelectedStrategy(strategy);
    setCustomizedStrategy({...strategy});
  };

  // Update parameter value
  const handleParamChange = (paramId: string, value: any) => {
    if (!customizedStrategy) return;
    
    setCustomizedStrategy({
      ...customizedStrategy,
      parameters: customizedStrategy.parameters.map(param => 
        param.id === paramId ? {...param, value} : param
      )
    });
  };

  // Navigate to next step
  const handleNext = () => {
    if (currentStep === 'select' && !selectedStrategy) {
      toast({
        title: "Select a Strategy",
        description: "Please select a strategy before proceeding",
        variant: "destructive"
      });
      return;
    }

    const stepOrder: WizardStep[] = ['select', 'configure', 'backtest', 'results'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex < stepOrder.length - 1) {
      setCurrentStep(stepOrder[currentIndex + 1]);
    }
  };

  // Navigate to previous step
  const handleBack = () => {
    const stepOrder: WizardStep[] = ['select', 'configure', 'backtest', 'results'];
    const currentIndex = stepOrder.indexOf(currentStep);
    if (currentIndex > 0) {
      setCurrentStep(stepOrder[currentIndex - 1]);
    }
  };

  // Run backtest
  const handleRunBacktest = async () => {
    if (!customizedStrategy) return;
    
    setIsLoading(true);
    
    try {
      // Simulate API call for backtest
      // In a real implementation, this would be an API call to the backend
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Generate mock results
      const mockResults: StrategyResults = {
        winRate: 65 + Math.random() * 10,
        profitFactor: 1.5 + Math.random(),
        averageWin: 50 + Math.random() * 20,
        averageLoss: 30 + Math.random() * 10,
        maxDrawdown: 15 + Math.random() * 5,
        sharpeRatio: 1.2 + Math.random() * 0.5,
        trades: [],
        equity: []
      };
      
      // Generate mock trade history
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);
      
      for (let i = 0; i < 50; i++) {
        const tradeDate = new Date(startDate);
        tradeDate.setDate(tradeDate.getDate() + i * 3);
        
        const isWin = Math.random() > 0.35;
        const profit = isWin 
          ? mockResults.averageWin * (0.8 + Math.random() * 0.4) 
          : -mockResults.averageLoss * (0.8 + Math.random() * 0.4);
        
        mockResults.trades.push({
          date: tradeDate.toISOString().split('T')[0],
          type: Math.random() > 0.5 ? 'buy' : 'sell',
          price: 1.1000 + (Math.random() * 0.1000),
          result: isWin ? 'win' : 'loss',
          profit
        });
      }
      
      // Generate equity curve
      let equity = 10000;
      for (let i = 0; i < 180; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        
        if (i % 3 === 0 && mockResults.trades[i/3]) {
          equity += mockResults.trades[i/3].profit;
        } else {
          // Small random fluctuation
          equity += (Math.random() * 10) - 5;
        }
        
        mockResults.equity.push({
          date: date.toISOString().split('T')[0],
          value: equity
        });
      }
      
      setResults(mockResults);
      setCurrentStep('results');
      
      toast({
        title: "Backtest Complete",
        description: "Your strategy has been successfully tested"
      });
    } catch (error) {
      toast({
        title: "Backtest Failed",
        description: "There was an error running the backtest",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  // UI Components for each step
  const renderStepContent = () => {
    switch (currentStep) {
      case 'select':
        return (
          <div className="space-y-6">
            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
              {predefinedStrategies.map(strategy => (
                <Card 
                  key={strategy.id} 
                  className={cn(
                    "cursor-pointer transition-all hover:border-primary/50 overflow-hidden",
                    selectedStrategy?.id === strategy.id ? "border-2 border-primary" : ""
                  )}
                  onClick={() => handleSelectStrategy(strategy)}
                >
                  <div className={cn(
                    "h-2 w-full",
                    strategy.riskLevel === 'low' ? "bg-green-500" : 
                    strategy.riskLevel === 'medium' ? "bg-amber-500" : "bg-rose-500"
                  )} />
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{strategy.name}</CardTitle>
                      {strategy.category === 'trend' && <TrendingUp className="h-5 w-5 text-blue-500" />}
                      {strategy.category === 'reversal' && <BarChart3 className="h-5 w-5 text-purple-500" />}
                      {strategy.category === 'breakout' && <LineChart className="h-5 w-5 text-amber-500" />}
                      {strategy.category === 'volatility' && <BarChart className="h-5 w-5 text-rose-500" />}
                    </div>
                    <CardDescription>
                      {strategy.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm">
                      <div className="font-medium mb-2">Key Parameters:</div>
                      <ul className="space-y-1">
                        {strategy.parameters.slice(0, 2).map(param => (
                          <li key={param.id} className="flex items-center gap-2">
                            <CircleDot className="h-3 w-3 text-primary/60" />
                            <span>{param.name}: </span>
                            <span className="text-muted-foreground">{param.value}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CardContent>
                  <CardFooter>
                    <div className="w-full flex justify-between items-center">
                      <div className="text-xs text-muted-foreground">
                        Risk Level: <span className={cn(
                          strategy.riskLevel === 'low' ? "text-green-500" : 
                          strategy.riskLevel === 'medium' ? "text-amber-500" : "text-rose-500"
                        )}>{strategy.riskLevel.toUpperCase()}</span>
                      </div>
                      <Button size="sm" variant="ghost">
                        Select <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        );
        
      case 'configure':
        return (
          <>
            {customizedStrategy && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>{customizedStrategy.name} Configuration</CardTitle>
                    <CardDescription>
                      Customize the parameters for your trading strategy
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {customizedStrategy.parameters.map(param => (
                      <div key={param.id} className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label htmlFor={param.id} className="font-medium">
                            {param.name}
                          </Label>
                          
                          {param.type === 'boolean' ? (
                            <Switch 
                              id={param.id} 
                              checked={param.value} 
                              onCheckedChange={(checked) => handleParamChange(param.id, checked)}
                            />
                          ) : param.type === 'number' ? (
                            <div className="w-24">
                              <Input 
                                id={param.id}
                                type="number"
                                value={param.value}
                                min={param.min}
                                max={param.max}
                                step={param.step}
                                onChange={(e) => handleParamChange(param.id, Number(e.target.value))}
                                className="text-right"
                              />
                            </div>
                          ) : null}
                        </div>
                        
                        {param.type === 'number' && param.min !== undefined && param.max !== undefined && (
                          <Slider 
                            id={`${param.id}-slider`}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            value={[param.value]}
                            onValueChange={(value) => handleParamChange(param.id, value[0])}
                          />
                        )}
                        
                        {param.type === 'select' && (
                          <Select 
                            value={param.value}
                            onValueChange={(value) => handleParamChange(param.id, value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select option" />
                            </SelectTrigger>
                            <SelectContent>
                              {param.options?.map(option => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        <p className="text-xs text-muted-foreground">{param.description}</p>
                        <Separator className="my-2" />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </div>
            )}
          </>
        );
        
      case 'backtest':
        return (
          <>
            {customizedStrategy && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Backtest Settings</CardTitle>
                    <CardDescription>
                      Configure the backtest parameters for your strategy
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label htmlFor="symbol">Symbol</Label>
                        <Select value={symbol} onValueChange={setSymbol}>
                          <SelectTrigger id="symbol">
                            <SelectValue placeholder="Select symbol" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="EURUSD">EUR/USD</SelectItem>
                            <SelectItem value="GBPUSD">GBP/USD</SelectItem>
                            <SelectItem value="USDJPY">USD/JPY</SelectItem>
                            <SelectItem value="BTCUSD">BTC/USD</SelectItem>
                            <SelectItem value="ETHUSD">ETH/USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="timeframe">Timeframe</Label>
                        <Select value={timeframe} onValueChange={setTimeframe}>
                          <SelectTrigger id="timeframe">
                            <SelectValue placeholder="Select timeframe" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="M5">5 Minutes</SelectItem>
                            <SelectItem value="M15">15 Minutes</SelectItem>
                            <SelectItem value="M30">30 Minutes</SelectItem>
                            <SelectItem value="H1">1 Hour</SelectItem>
                            <SelectItem value="H4">4 Hours</SelectItem>
                            <SelectItem value="D1">Daily</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="period">Test Period</Label>
                        <Select value={testPeriod} onValueChange={setTestPeriod}>
                          <SelectTrigger id="period">
                            <SelectValue placeholder="Select period" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1M">1 Month</SelectItem>
                            <SelectItem value="3M">3 Months</SelectItem>
                            <SelectItem value="6M">6 Months</SelectItem>
                            <SelectItem value="1Y">1 Year</SelectItem>
                            <SelectItem value="2Y">2 Years</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label htmlFor="initialCapital">Initial Capital</Label>
                        <Input 
                          id="initialCapital" 
                          type="number" 
                          defaultValue="10000" 
                          className="text-right"
                        />
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Advanced Settings</h3>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="spreadAdjustment" className="block">Spread Adjustment</Label>
                          <p className="text-xs text-muted-foreground">
                            Account for trading spreads in simulation
                          </p>
                        </div>
                        <Switch id="spreadAdjustment" defaultChecked />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="slippage" className="block">Slippage</Label>
                          <p className="text-xs text-muted-foreground">
                            Simulate execution slippage
                          </p>
                        </div>
                        <Switch id="slippage" defaultChecked />
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div>
                          <Label htmlFor="commissions" className="block">Include Commissions</Label>
                          <p className="text-xs text-muted-foreground">
                            Factor in broker commissions
                          </p>
                        </div>
                        <Switch id="commissions" defaultChecked />
                      </div>
                    </div>
                  </CardContent>
                  <CardFooter className="flex justify-center">
                    <Button 
                      size="lg" 
                      disabled={isLoading}
                      onClick={handleRunBacktest}
                      className="bg-gradient-to-r from-indigo-500 to-indigo-700 hover:from-indigo-600 hover:to-indigo-800 text-white gap-2"
                    >
                      {isLoading ? (
                        <>
                          <div className="h-5 w-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          Running Backtest...
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4" /> 
                          Run Backtest
                        </>
                      )}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            )}
          </>
        );
        
      case 'results':
        return (
          <>
            {results && (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      Strategy Performance Results
                    </CardTitle>
                    <CardDescription>
                      Performance metrics for {customizedStrategy?.name} on {symbol} {timeframe}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                        <div className="text-2xl font-bold text-green-500">
                          {results.winRate.toFixed(1)}%
                        </div>
                      </div>
                      
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Profit Factor</div>
                        <div className="text-2xl font-bold text-indigo-500">
                          {results.profitFactor.toFixed(2)}
                        </div>
                      </div>
                      
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Max Drawdown</div>
                        <div className="text-2xl font-bold text-amber-500">
                          {results.maxDrawdown.toFixed(1)}%
                        </div>
                      </div>
                      
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Avg. Win</div>
                        <div className="text-2xl font-bold">
                          ${results.averageWin.toFixed(2)}
                        </div>
                      </div>
                      
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Avg. Loss</div>
                        <div className="text-2xl font-bold">
                          ${results.averageLoss.toFixed(2)}
                        </div>
                      </div>
                      
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Sharpe Ratio</div>
                        <div className="text-2xl font-bold text-blue-500">
                          {results.sharpeRatio.toFixed(2)}
                        </div>
                      </div>
                    </div>
                    
                    <Tabs defaultValue="equity">
                      <TabsList className="grid w-full grid-cols-2">
                        <TabsTrigger value="equity">Equity Curve</TabsTrigger>
                        <TabsTrigger value="trades">Trade History</TabsTrigger>
                      </TabsList>
                      
                      <TabsContent value="equity" className="pt-4">
                        <div className="h-[300px] border rounded-lg p-4 flex items-center justify-center">
                          <div className="text-center">
                            <div className="text-lg font-medium mb-2">Equity Curve Chart</div>
                            <p className="text-muted-foreground">
                              Visual chart would go here (Line chart plotting the equity curve over time)
                            </p>
                          </div>
                        </div>
                      </TabsContent>
                      
                      <TabsContent value="trades" className="pt-4">
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full">
                            <thead>
                              <tr className="bg-muted/50">
                                <th className="text-left p-3 font-medium">Date</th>
                                <th className="text-left p-3 font-medium">Type</th>
                                <th className="text-left p-3 font-medium">Price</th>
                                <th className="text-left p-3 font-medium">Result</th>
                                <th className="text-right p-3 font-medium">Profit/Loss</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.trades.slice(0, 10).map((trade, index) => (
                                <tr key={index} className="border-t">
                                  <td className="p-3">{trade.date}</td>
                                  <td className="p-3">
                                    <span className={cn(
                                      "px-2 py-1 text-xs font-medium rounded-full",
                                      trade.type === 'buy' 
                                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                    )}>
                                      {trade.type === 'buy' ? 'BUY' : 'SELL'}
                                    </span>
                                  </td>
                                  <td className="p-3">{trade.price.toFixed(4)}</td>
                                  <td className="p-3">
                                    <span className={cn(
                                      "px-2 py-1 text-xs font-medium rounded-full",
                                      trade.result === 'win' 
                                        ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300"
                                        : "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300"
                                    )}>
                                      {trade.result.toUpperCase()}
                                    </span>
                                  </td>
                                  <td className={cn(
                                    "p-3 text-right font-medium",
                                    trade.profit > 0 ? "text-green-500" : "text-red-500"
                                  )}>
                                    {trade.profit > 0 ? '+' : ''}{trade.profit.toFixed(2)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          {results.trades.length > 10 && (
                            <div className="p-3 bg-muted/20 text-center text-sm text-muted-foreground">
                              Showing 10 of {results.trades.length} trades
                            </div>
                          )}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </CardContent>
                  <CardFooter className="flex justify-between">
                    <Button variant="outline" onClick={() => setCurrentStep('backtest')}>
                      <Settings2 className="h-4 w-4 mr-2" />
                      Adjust Parameters
                    </Button>
                    
                    <Button>
                      <Save className="h-4 w-4 mr-2" />
                      Save Strategy
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            )}
          </>
        );
    }
  };

  // Progress indicator
  const renderStepIndicator = () => {
    const steps = [
      { id: 'select', name: 'Select Strategy', icon: Filter },
      { id: 'configure', name: 'Configure Parameters', icon: Sliders },
      { id: 'backtest', name: 'Backtest Settings', icon: Play },
      { id: 'results', name: 'Review Results', icon: LineChart }
    ];

    return (
      <div className="flex items-center justify-center mb-10">
        <div className="flex items-center max-w-3xl w-full">
          {steps.map((step, index) => {
            const StepIcon = step.icon;
            const isActive = step.id === currentStep;
            const isCompleted = stepIndex(currentStep) > stepIndex(step.id as WizardStep);
            
            return (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center flex-1">
                  <div className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center transition-colors",
                    isActive && "bg-primary text-primary-foreground",
                    isCompleted && "bg-primary/80 text-primary-foreground",
                    !isActive && !isCompleted && "bg-muted text-muted-foreground"
                  )}>
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : (
                      <StepIcon className="h-5 w-5" />
                    )}
                  </div>
                  <span className={cn(
                    "text-xs mt-2 text-center",
                    (isActive || isCompleted) ? "text-foreground font-medium" : "text-muted-foreground"
                  )}>
                    {step.name}
                  </span>
                </div>
                
                {index < steps.length - 1 && (
                  <div className={cn(
                    "h-[2px] flex-1 mx-2 transition-colors",
                    stepIndex(currentStep) > index ? "bg-primary" : "bg-muted"
                  )} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    );
  };

  // Helper to get step index
  const stepIndex = (step: WizardStep): number => {
    const steps: WizardStep[] = ['select', 'configure', 'backtest', 'results'];
    return steps.indexOf(step);
  };

  return (
    <div className="container mx-auto px-4 py-10">
      <div className="mb-10 text-center">
        <motion.h1 
          className="text-3xl md:text-4xl font-bold tracking-tight"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          Trading Strategy Visualization Wizard
        </motion.h1>
        <motion.p 
          className="text-muted-foreground mt-4 max-w-2xl mx-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          Create, customize, and backtest trading strategies with visual performance analysis
        </motion.p>
      </div>
      
      {/* Step Indicator */}
      {renderStepIndicator()}
      
      {/* Step Content */}
      <div className="mb-8">
        {renderStepContent()}
      </div>
      
      {/* Navigation Buttons */}
      <div className="flex justify-between mt-8">
        <Button
          variant="outline"
          onClick={handleBack}
          disabled={currentStep === 'select'}
        >
          <ChevronLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        
        {currentStep !== 'backtest' && currentStep !== 'results' && (
          <Button onClick={handleNext}>
            Next
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        )}
      </div>
    </div>
  );
}