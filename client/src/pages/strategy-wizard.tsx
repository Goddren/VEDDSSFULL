import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { 
  LineChart, BarChart3, TrendingUp, Settings2, Save, Play, BarChart, 
  ChevronRight, ChevronLeft, CheckCircle2, CircleDot, Filter, Sliders,
  Activity, ArrowUpRight, Undo, Flame,
  ShieldCheck, Scale, Settings,
  ArrowLeftRight, Waves, CandlestickChart, FilterX
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
  category: 'trend' | 'reversal' | 'breakout' | 'volatility' | 'custom' | 'range' | 'oscillator' | 'pattern';
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
  averageHoldingTime: string; // Average time in trade
  optimalEntryTime: string; // Best time to enter trades
  trades: {
    date: string;
    time: string; // Time of day for the signal
    type: 'buy' | 'sell';
    price: number;
    result: 'win' | 'loss';
    profit: number;
    holdingPeriod: string; // How long the trade was held
    exitReason: string; // Why the trade was closed
  }[];
  equity: { date: string; value: number }[];
  optimalTradingHours: {
    session: string;
    winRate: number;
    averageProfit: number;
    volume: string;
  }[];
  exitIndicators: {
    name: string;
    description: string;
    reliability: number;
  }[];
}

// Predefined strategies
const predefinedStrategies: TradingStrategy[] = [
  // Additional pattern indicators
  {
    id: 'head-and-shoulders',
    name: 'Head & Shoulders Pattern',
    description: 'Classic reversal pattern with three peaks, the middle one being the highest',
    category: 'pattern',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'symmetry-tolerance',
        name: 'Symmetry Tolerance',
        type: 'number',
        description: 'Maximum % difference between shoulders',
        value: 15,
        min: 5,
        max: 30,
        step: 1
      },
      {
        id: 'neckline-slope',
        name: 'Max Neckline Slope',
        type: 'number',
        description: 'Maximum slope of neckline in degrees',
        value: 10,
        min: 0,
        max: 15,
        step: 1
      },
      {
        id: 'volume-profile',
        name: 'Volume Profile Check',
        type: 'boolean',
        description: 'Confirm with decreasing volume on right shoulder',
        value: true
      },
      {
        id: 'min-pattern-height',
        name: 'Min Pattern Height',
        type: 'number',
        description: 'Minimum pattern height as % of price',
        value: 3,
        min: 1,
        max: 10,
        step: 0.5
      }
    ]
  },
  {
    id: 'flag-pennant',
    name: 'Flag/Pennant Pattern',
    description: 'Trade continuation patterns after strong trend moves',
    category: 'pattern',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'pattern-type',
        name: 'Pattern Type',
        type: 'select',
        description: 'Type of continuation pattern',
        value: 'flag',
        options: [
          { label: 'Bull Flag', value: 'bull-flag' },
          { label: 'Bear Flag', value: 'bear-flag' },
          { label: 'Pennant', value: 'pennant' }
        ]
      },
      {
        id: 'pole-height',
        name: 'Minimum Pole Height',
        type: 'number',
        description: 'Minimum height of flagpole as % of price',
        value: 5,
        min: 2,
        max: 15,
        step: 1
      },
      {
        id: 'consolidation-duration',
        name: 'Max Consolidation',
        type: 'number',
        description: 'Maximum duration of flag/pennant in candles',
        value: 15,
        min: 5,
        max: 30,
        step: 1
      },
      {
        id: 'breakout-volume',
        name: 'Require Volume Surge',
        type: 'boolean',
        description: 'Require volume increase on breakout',
        value: true
      }
    ]
  },
  {
    id: 'harmonic-patterns',
    name: 'Harmonic Patterns',
    description: 'Trade precise Fibonacci retracement levels in Gartley, Butterfly and Bat patterns',
    category: 'pattern',
    riskLevel: 'high',
    parameters: [
      {
        id: 'pattern-type',
        name: 'Pattern Type',
        type: 'select',
        description: 'Type of harmonic pattern to identify',
        value: 'butterfly',
        options: [
          { label: 'Gartley', value: 'gartley' },
          { label: 'Butterfly', value: 'butterfly' },
          { label: 'Bat', value: 'bat' },
          { label: 'Crab', value: 'crab' }
        ]
      },
      {
        id: 'fib-tolerance',
        name: 'Fibonacci Tolerance',
        type: 'number',
        description: 'Tolerance % for Fibonacci ratios',
        value: 3,
        min: 1,
        max: 5,
        step: 0.5
      },
      {
        id: 'minimum-size',
        name: 'Minimum Pattern Size',
        type: 'number',
        description: 'Minimum pattern size as % of price',
        value: 1,
        min: 0.5,
        max: 5,
        step: 0.5
      },
      {
        id: 'structure-quality',
        name: 'Structure Quality Check',
        type: 'boolean',
        description: 'Apply strict geometric validation',
        value: true
      }
    ]
  },
  {
    id: 'engulfing-candles',
    name: 'Engulfing Candle Pattern',
    description: 'Trade powerful reversal signals from engulfing candlestick patterns',
    category: 'reversal',
    riskLevel: 'high',
    parameters: [
      {
        id: 'body-size',
        name: 'Minimum Body Size',
        type: 'number',
        description: 'Minimum engulfing candle body size as ATR multiple',
        value: 1.5,
        min: 1,
        max: 3,
        step: 0.1
      },
      {
        id: 'trend-length',
        name: 'Prior Trend Length',
        type: 'number',
        description: 'Minimum prior trend length in candles',
        value: 5,
        min: 3,
        max: 10,
        step: 1
      },
      {
        id: 'at-key-level',
        name: 'At Key Level Only',
        type: 'boolean',
        description: 'Only take signals at support/resistance levels',
        value: true
      },
      {
        id: 'volume-confirmation',
        name: 'Volume Confirmation',
        type: 'boolean',
        description: 'Require above-average volume on engulfing candle',
        value: true
      }
    ]
  },
  {
    id: 'three-drive-pattern',
    name: 'Three Drive Pattern',
    description: 'Trade reversal signals after three successive drives in one direction',
    category: 'reversal',
    riskLevel: 'high',
    parameters: [
      {
        id: 'drive-equality',
        name: 'Drive Equality %',
        type: 'number',
        description: 'Maximum % difference between drive lengths',
        value: 10,
        min: 5,
        max: 20,
        step: 1
      },
      {
        id: 'fib-relationship',
        name: 'Fibonacci Relationship',
        type: 'boolean',
        description: 'Require Fibonacci relationship between drives',
        value: true
      },
      {
        id: 'time-symmetry',
        name: 'Time Symmetry',
        type: 'number',
        description: 'Max % difference in time between drives',
        value: 30,
        min: 10,
        max: 50,
        step: 5
      },
      {
        id: 'reversal-confirmation',
        name: 'Confirmation Candles',
        type: 'number',
        description: 'Candles for reversal confirmation',
        value: 1,
        min: 1,
        max: 3,
        step: 1
      }
    ]
  },
  {
    id: 'cup-and-handle',
    name: 'Cup and Handle',
    description: 'Bullish continuation pattern resembling a cup with a handle',
    category: 'pattern',
    riskLevel: 'low',
    parameters: [
      {
        id: 'cup-depth',
        name: 'Cup Depth %',
        type: 'number',
        description: 'Depth of cup as % of price',
        value: 30,
        min: 10,
        max: 50,
        step: 5
      },
      {
        id: 'handle-retracement',
        name: 'Handle Retracement %',
        type: 'number',
        description: 'Handle retracement as % of cup depth',
        value: 38,
        min: 20,
        max: 50,
        step: 1
      },
      {
        id: 'cup-width',
        name: 'Cup Width (candles)',
        type: 'number',
        description: 'Width of cup in number of candles',
        value: 40,
        min: 20,
        max: 100,
        step: 5
      },
      {
        id: 'volume-pattern',
        name: 'Volume Pattern Check',
        type: 'boolean',
        description: 'Confirm with appropriate volume pattern',
        value: true
      }
    ]
  },
  // Original strategies
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
  },
  {
    id: 'macd-signal-crossover',
    name: 'MACD Signal Line Crossover',
    description: 'Uses MACD indicator to identify momentum shifts when the MACD line crosses its signal line',
    category: 'trend',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'fast-ema',
        name: 'Fast EMA Period',
        type: 'number',
        description: 'Period for the fast EMA in MACD calculation',
        value: 12,
        min: 5,
        max: 30,
        step: 1
      },
      {
        id: 'slow-ema',
        name: 'Slow EMA Period',
        type: 'number',
        description: 'Period for the slow EMA in MACD calculation',
        value: 26,
        min: 10,
        max: 50,
        step: 1
      },
      {
        id: 'signal-period',
        name: 'Signal Line Period',
        type: 'number',
        description: 'Period for the signal line calculation',
        value: 9,
        min: 3,
        max: 25,
        step: 1
      },
      {
        id: 'histogram-confirmation',
        name: 'Histogram Confirmation',
        type: 'boolean',
        description: 'Require histogram direction confirmation',
        value: true
      }
    ]
  },
  {
    id: 'double-top-bottom',
    name: 'Double Top/Bottom Pattern',
    description: 'Identifies reversal patterns where price tests a level twice before changing direction',
    category: 'reversal',
    riskLevel: 'high',
    parameters: [
      {
        id: 'pattern-type',
        name: 'Pattern Type',
        type: 'select',
        description: 'Type of pattern to look for',
        value: 'both',
        options: [
          { label: 'Double Top Only', value: 'top' },
          { label: 'Double Bottom Only', value: 'bottom' },
          { label: 'Both Types', value: 'both' }
        ]
      },
      {
        id: 'price-threshold',
        name: 'Price Threshold (%)',
        type: 'number',
        description: 'Maximum percentage difference between tops/bottoms',
        value: 3,
        min: 0.5,
        max: 10,
        step: 0.5
      },
      {
        id: 'confirmation-break',
        name: 'Need Neckline Breakout',
        type: 'boolean',
        description: 'Require price to break neckline for confirmation',
        value: true
      },
      {
        id: 'volume-confirmation',
        name: 'Volume Confirmation',
        type: 'boolean',
        description: 'Require increasing volume on breakout',
        value: true
      }
    ]
  },
  {
    id: 'channel-trading',
    name: 'Channel Trading Strategy',
    description: 'Trades within established price channels by buying at support and selling at resistance',
    category: 'range',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'channel-type',
        name: 'Channel Type',
        type: 'select',
        description: 'Type of channel to identify',
        value: 'horizontal',
        options: [
          { label: 'Horizontal Channel', value: 'horizontal' },
          { label: 'Ascending Channel', value: 'ascending' },
          { label: 'Descending Channel', value: 'descending' }
        ]
      },
      {
        id: 'lookback-periods',
        name: 'Lookback Periods',
        type: 'number',
        description: 'Number of periods to identify channel',
        value: 50,
        min: 20,
        max: 200,
        step: 10
      },
      {
        id: 'touch-count',
        name: 'Minimum Touches',
        type: 'number',
        description: 'Minimum number of touches required for valid channel',
        value: 2,
        min: 2,
        max: 10,
        step: 1
      },
      {
        id: 'entry-position',
        name: 'Entry Position',
        type: 'number',
        description: 'Entry position within channel (0-100%)',
        value: 20,
        min: 5,
        max: 45,
        step: 5
      }
    ]
  },
  {
    id: 'stochastic-crossover',
    name: 'Stochastic Crossover',
    description: 'Uses stochastic oscillator crossovers to identify overbought and oversold conditions',
    category: 'oscillator',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'k-period',
        name: '%K Period',
        type: 'number',
        description: 'Number of periods for %K line',
        value: 14,
        min: 5,
        max: 30,
        step: 1
      },
      {
        id: 'd-period',
        name: '%D Period',
        type: 'number',
        description: 'Number of periods for %D line',
        value: 3,
        min: 1,
        max: 10,
        step: 1
      },
      {
        id: 'overbought',
        name: 'Overbought Level',
        type: 'number',
        description: 'Level above which market is considered overbought',
        value: 80,
        min: 70,
        max: 95,
        step: 1
      },
      {
        id: 'oversold',
        name: 'Oversold Level',
        type: 'number',
        description: 'Level below which market is considered oversold',
        value: 20,
        min: 5,
        max: 30,
        step: 1
      }
    ]
  },
  {
    id: 'support-resistance-bounce',
    name: 'Support & Resistance Bounce',
    description: 'Identifies key support and resistance levels and trades price reactions at these levels',
    category: 'reversal',
    riskLevel: 'medium',
    parameters: [
      {
        id: 'lookback-period',
        name: 'Lookback Period',
        type: 'number',
        description: 'Number of periods to identify S&R levels',
        value: 100,
        min: 50,
        max: 500,
        step: 50
      },
      {
        id: 'level-strength',
        name: 'Level Strength',
        type: 'number',
        description: 'Minimum touches required for valid level',
        value: 3,
        min: 2,
        max: 10,
        step: 1
      },
      {
        id: 'bounce-threshold',
        name: 'Bounce Threshold (%)',
        type: 'number',
        description: 'Minimum price percentage for valid bounce',
        value: 0.5,
        min: 0.1,
        max: 2,
        step: 0.1
      },
      {
        id: 'confirmation-candles',
        name: 'Confirmation Candles',
        type: 'number',
        description: 'Number of candles to confirm bounce',
        value: 2,
        min: 1,
        max: 5,
        step: 1
      }
    ]
  },
  {
    id: 'wedge-patterns',
    name: 'Wedge Pattern Strategy',
    description: 'Identifies and trades wedge patterns, which are powerful continuation or reversal signals',
    category: 'pattern',
    riskLevel: 'high',
    parameters: [
      {
        id: 'wedge-type',
        name: 'Wedge Type',
        type: 'select',
        description: 'Type of wedge pattern to identify',
        value: 'both',
        options: [
          { label: 'Rising Wedge Only', value: 'rising' },
          { label: 'Falling Wedge Only', value: 'falling' },
          { label: 'Both Types', value: 'both' }
        ]
      },
      {
        id: 'min-points',
        name: 'Minimum Touch Points',
        type: 'number',
        description: 'Minimum points required on each trendline',
        value: 3,
        min: 2,
        max: 10,
        step: 1
      },
      {
        id: 'breakout-percent',
        name: 'Breakout Threshold (%)',
        type: 'number',
        description: 'Percentage beyond trendline for breakout confirmation',
        value: 1,
        min: 0.2,
        max: 5,
        step: 0.2
      },
      {
        id: 'volume-increase',
        name: 'Volume Increase (%)',
        type: 'number',
        description: 'Minimum volume increase on breakout',
        value: 130,
        min: 100,
        max: 300,
        step: 10
      }
    ]
  }
];

// Wizard steps
type WizardStep = 'select' | 'configure' | 'backtest' | 'results';

// Helper function to get optimal trading session based on strategy
function getTradingSessionBasedOnStrategy(strategyId: string | undefined): string {
  if (!strategyId) return "London Session (08:00-16:00 GMT)";
  
  switch (strategyId) {
    // Original strategies
    case 'moving-average-crossover':
      return "London/New York Overlap (13:00-16:00 GMT)";
    case 'rsi-overbought-oversold':
      return "End of New York Session (19:00-21:00 GMT)";
    case 'breakout-with-volume':
      return "London Opening (08:00-10:00 GMT)";
    case 'macd-signal-crossover':
      return "London Session (09:00-12:00 GMT)";
    case 'double-top-bottom':
      return "New York Session (14:00-17:00 GMT)";
    case 'channel-trading':
      return "Asian/London Overlap (07:00-09:00 GMT)";
    case 'stochastic-crossover':
      return "End of Asian Session (06:00-08:00 GMT)";
    case 'support-resistance-bounce':
      return "London/New York Overlap (13:00-15:00 GMT)";
    case 'wedge-patterns':
      return "New York Opening (13:00-15:00 GMT)";
      
    // New pattern indicators
    case 'head-and-shoulders':
      return "New York Session (14:00-17:00 GMT)";
    case 'flag-pennant':
      return "London/New York Overlap (13:00-16:00 GMT)";
    case 'harmonic-patterns':
      return "London Session (09:00-12:00 GMT)";
    case 'engulfing-candles':
      return "Asian/London Overlap (07:00-09:00 GMT)";
    case 'three-drive-pattern':
      return "New York Session (14:00-17:00 GMT)";
    case 'cup-and-handle':
      return "London/New York Overlap (13:00-16:00 GMT)";
    default:
      return "London Session (08:00-16:00 GMT)";
  }
}

// Helper function to get strategy category icon
function getCategoryIcon(category: string) {
  switch (category) {
    case 'trend':
      return <TrendingUp className="w-4 h-4" />;
    case 'reversal':
      return <Undo className="w-4 h-4" />;
    case 'breakout':
      return <ArrowUpRight className="w-4 h-4" />;
    case 'oscillator':
      return <Waves className="w-4 h-4" />;
    case 'pattern':
      return <CandlestickChart className="w-4 h-4" />;
    case 'range':
      return <ArrowLeftRight className="w-4 h-4" />;
    case 'volatility':
      return <Activity className="w-4 h-4" />;
    default:
      return <Settings2 className="w-4 h-4" />;
  }
}

export default function StrategyWizard() {
  const [currentStep, setCurrentStep] = useState<WizardStep>('select');
  const [selectedStrategy, setSelectedStrategy] = useState<TradingStrategy | null>(null);
  const [customizedStrategy, setCustomizedStrategy] = useState<TradingStrategy | null>(null);
  const [symbol, setSymbol] = useState<string>('EURUSD');
  const [timeframe, setTimeframe] = useState<string>('H1');
  const [testPeriod, setTestPeriod] = useState<string>('6M');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [results, setResults] = useState<StrategyResults | null>(null);
  
  // Filter states
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedRiskFilter, setSelectedRiskFilter] = useState<string>('all');
  
  // Filtered strategies based on selected filters
  const filteredStrategies = useMemo(() => {
    return predefinedStrategies.filter(strategy => {
      const categoryMatch = selectedCategoryFilter === 'all' || strategy.category === selectedCategoryFilter;
      const riskMatch = selectedRiskFilter === 'all' || strategy.riskLevel === selectedRiskFilter;
      return categoryMatch && riskMatch;
    });
  }, [selectedCategoryFilter, selectedRiskFilter]);
  
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
      
      // Generate mock results with detailed timing information
      const mockResults: StrategyResults = {
        winRate: 65 + Math.random() * 10,
        profitFactor: 1.5 + Math.random(),
        averageWin: 50 + Math.random() * 20,
        averageLoss: 30 + Math.random() * 10,
        maxDrawdown: 15 + Math.random() * 5,
        sharpeRatio: 1.2 + Math.random() * 0.5,
        averageHoldingTime: `${Math.floor(4 + Math.random() * 8)} hours`,
        optimalEntryTime: getTradingSessionBasedOnStrategy(customizedStrategy?.id),
        trades: [],
        equity: [],
        optimalTradingHours: [
          {
            session: "Asian Session (00:00-08:00 GMT)",
            winRate: 58 + Math.random() * 10,
            averageProfit: 35 + Math.random() * 15,
            volume: "Moderate"
          },
          {
            session: "London Session (08:00-16:00 GMT)",
            winRate: 72 + Math.random() * 10,
            averageProfit: 55 + Math.random() * 20,
            volume: "High"
          },
          {
            session: "New York Session (13:00-21:00 GMT)",
            winRate: 67 + Math.random() * 10,
            averageProfit: 48 + Math.random() * 20,
            volume: "High"
          }
        ],
        exitIndicators: [
          {
            name: "Price Action Reversal",
            description: "Exit when candle closes against trend with increased volume",
            reliability: 75 + Math.random() * 15
          },
          {
            name: "Moving Average Crossover",
            description: "Exit when fast MA crosses back over slow MA",
            reliability: 68 + Math.random() * 12
          },
          {
            name: "Take Profit Target",
            description: "Exit at predetermined price target based on support/resistance",
            reliability: 85 + Math.random() * 10
          },
          {
            name: "RSI Divergence",
            description: "Exit when RSI shows divergence against price movement",
            reliability: 70 + Math.random() * 15
          }
        ]
      };
      
      // Generate mock trade history with timing details
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 6);
      
      // Trading sessions with their time ranges
      const tradingSessions = [
        { name: "Asian", hours: [0, 1, 2, 3, 4, 5, 6, 7] },
        { name: "London", hours: [8, 9, 10, 11, 12, 13, 14, 15] },
        { name: "New York", hours: [13, 14, 15, 16, 17, 18, 19, 20] }
      ];
      
      // Exit reasons
      const exitReasons = [
        "Take Profit Target Reached",
        "Stop Loss Triggered",
        "Technical Indicator Signal",
        "Pattern Completion",
        "Time-Based Exit",
        "Support/Resistance Level Reached",
        "Volatility Spike",
        "Risk Management Rule"
      ];
      
      for (let i = 0; i < 50; i++) {
        const tradeDate = new Date(startDate);
        tradeDate.setDate(tradeDate.getDate() + i * 3);
        
        // Randomly select session and hour within session
        const randomSession = tradingSessions[Math.floor(Math.random() * tradingSessions.length)];
        const randomHour = randomSession.hours[Math.floor(Math.random() * randomSession.hours.length)];
        const randomMinute = Math.floor(Math.random() * 60);
        
        // Format time
        const timeString = `${randomHour.toString().padStart(2, '0')}:${randomMinute.toString().padStart(2, '0')} GMT`;
        
        // Determine holding period (longer for winning trades typically)
        const isWin = Math.random() > 0.35;
        const holdingHours = isWin ? 
          Math.floor(3 + Math.random() * 12) : 
          Math.floor(1 + Math.random() * 6);
        const holdingMinutes = Math.floor(Math.random() * 60);
        const holdingPeriod = `${holdingHours}h ${holdingMinutes}m`;
        
        // Calculate profit
        const profit = isWin 
          ? mockResults.averageWin * (0.8 + Math.random() * 0.4) 
          : -mockResults.averageLoss * (0.8 + Math.random() * 0.4);
        
        // Select exit reason based on result
        const exitReason = isWin ? 
          exitReasons[Math.floor(Math.random() * 3)] : // Better exit reasons for wins
          exitReasons[3 + Math.floor(Math.random() * 5)]; // Different reasons for losses
        
        mockResults.trades.push({
          date: tradeDate.toISOString().split('T')[0],
          time: timeString,
          type: Math.random() > 0.5 ? 'buy' : 'sell',
          price: 1.1000 + (Math.random() * 0.1000),
          result: isWin ? 'win' : 'loss',
          profit,
          holdingPeriod,
          exitReason
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
            {/* Filter Controls */}
            <div className="mb-6 p-4 bg-card border rounded-lg">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div>
                  <h3 className="text-lg font-medium mb-1">Filter Strategies</h3>
                  <p className="text-sm text-muted-foreground">
                    Find the perfect strategy for your trading style
                  </p>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      setSelectedCategoryFilter('all');
                      setSelectedRiskFilter('all');
                    }}
                    className="flex items-center gap-1"
                  >
                    <FilterX className="h-4 w-4" />
                    <span>Reset</span>
                  </Button>
                </div>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <Label className="mb-2 block">Category</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant={selectedCategoryFilter === 'all' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryFilter('all')}
                    >
                      All
                    </Button>
                    <Button 
                      variant={selectedCategoryFilter === 'trend' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryFilter('trend')}
                      className="flex items-center gap-1"
                    >
                      <TrendingUp className="h-3.5 w-3.5" />
                      <span>Trend</span>
                    </Button>
                    <Button 
                      variant={selectedCategoryFilter === 'reversal' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryFilter('reversal')}
                      className="flex items-center gap-1"
                    >
                      <Undo className="h-3.5 w-3.5" />
                      <span>Reversal</span>
                    </Button>
                    <Button 
                      variant={selectedCategoryFilter === 'breakout' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryFilter('breakout')}
                      className="flex items-center gap-1"
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      <span>Breakout</span>
                    </Button>
                    <Button 
                      variant={selectedCategoryFilter === 'oscillator' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryFilter('oscillator')}
                      className="flex items-center gap-1"
                    >
                      <Waves className="h-3.5 w-3.5" />
                      <span>Oscillator</span>
                    </Button>
                    <Button 
                      variant={selectedCategoryFilter === 'pattern' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryFilter('pattern')}
                      className="flex items-center gap-1"
                    >
                      <CandlestickChart className="h-3.5 w-3.5" />
                      <span>Pattern</span>
                    </Button>
                    <Button 
                      variant={selectedCategoryFilter === 'range' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedCategoryFilter('range')}
                      className="flex items-center gap-1"
                    >
                      <ArrowLeftRight className="h-3.5 w-3.5" />
                      <span>Range</span>
                    </Button>
                  </div>
                </div>
                
                <div>
                  <Label className="mb-2 block">Risk Level</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button 
                      variant={selectedRiskFilter === 'all' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedRiskFilter('all')}
                    >
                      All
                    </Button>
                    <Button 
                      variant={selectedRiskFilter === 'low' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedRiskFilter('low')}
                      className="flex items-center gap-1 text-green-600 border-green-600 hover:text-green-700 hover:border-green-700"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      <span>Low Risk</span>
                    </Button>
                    <Button 
                      variant={selectedRiskFilter === 'medium' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedRiskFilter('medium')}
                      className="flex items-center gap-1 text-amber-600 border-amber-600 hover:text-amber-700 hover:border-amber-700"
                    >
                      <Scale className="h-3.5 w-3.5" />
                      <span>Medium Risk</span>
                    </Button>
                    <Button 
                      variant={selectedRiskFilter === 'high' ? "default" : "outline"}
                      size="sm"
                      onClick={() => setSelectedRiskFilter('high')}
                      className="flex items-center gap-1 text-rose-600 border-rose-600 hover:text-rose-700 hover:border-rose-700"
                    >
                      <Flame className="h-3.5 w-3.5" />
                      <span>High Risk</span>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Strategy Cards */}
            {filteredStrategies.length > 0 ? (
              <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {filteredStrategies.map((strategy, index) => {
                  return (
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
                          {getCategoryIcon(strategy.category)}
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
                  );
                })}
              </div>
            ) : (
              <div className="p-10 border rounded-lg text-center">
                <FilterX className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No matching strategies</h3>
                <p className="text-muted-foreground mb-4">
                  No strategies match your current filters. Try adjusting your criteria or reset the filters.
                </p>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSelectedCategoryFilter('all');
                    setSelectedRiskFilter('all');
                  }}
                  className="mx-auto"
                >
                  Reset All Filters
                </Button>
              </div>
            )}
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

                    {/* Timing and Exit Information */}
                    <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Optimal Trading Timing</CardTitle>
                          <CardDescription>
                            Best times to enter and exit trades based on historical data
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-4">
                            <div className="flex justify-between items-center border-b pb-2">
                              <span className="font-medium">Best Entry Time</span>
                              <span className="text-primary font-medium">{results.optimalEntryTime}</span>
                            </div>
                            <div className="flex justify-between items-center border-b pb-2">
                              <span className="font-medium">Average Holding Period</span>
                              <span>{results.averageHoldingTime}</span>
                            </div>

                            <div className="pt-2">
                              <h4 className="font-medium mb-3">Session Performance</h4>
                              <div className="space-y-3">
                                {results.optimalTradingHours.map((session, index) => (
                                  <div key={index} className="flex flex-col">
                                    <div className="flex justify-between mb-1">
                                      <span className="text-sm">{session.session}</span>
                                      <span className="text-sm font-medium">
                                        Win Rate: {session.winRate.toFixed(1)}%
                                      </span>
                                    </div>
                                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                                      <div 
                                        className="h-full bg-primary rounded-full" 
                                        style={{ width: `${session.winRate}%` }}
                                      ></div>
                                    </div>
                                    <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                                      <span>Avg. Profit: ${session.averageProfit.toFixed(2)}</span>
                                      <span>Volume: {session.volume}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg">Exit Indicators</CardTitle>
                          <CardDescription>
                            Recommended exit conditions for this strategy
                          </CardDescription>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {results.exitIndicators.map((indicator, index) => (
                              <div key={index} className="border-b pb-3 last:border-0">
                                <div className="flex justify-between mb-1">
                                  <span className="font-medium">{indicator.name}</span>
                                  <span className="text-sm">
                                    Reliability: {indicator.reliability.toFixed(0)}%
                                  </span>
                                </div>
                                <p className="text-sm text-muted-foreground">{indicator.description}</p>
                                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden mt-2">
                                  <div 
                                    className={cn(
                                      "h-full rounded-full",
                                      indicator.reliability > 80 ? "bg-green-500" :
                                      indicator.reliability > 70 ? "bg-blue-500" :
                                      "bg-amber-500"
                                    )}
                                    style={{ width: `${indicator.reliability}%` }}
                                  ></div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    
                    <Tabs defaultValue="equity">
                      <TabsList className="grid w-full grid-cols-3">
                        <TabsTrigger value="equity">Equity Curve</TabsTrigger>
                        <TabsTrigger value="trades">Trade History</TabsTrigger>
                        <TabsTrigger value="timing">Timing Analysis</TabsTrigger>
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
                                <th className="text-left p-3 font-medium">Time</th>
                                <th className="text-left p-3 font-medium">Type</th>
                                <th className="text-left p-3 font-medium">Price</th>
                                <th className="text-left p-3 font-medium">Result</th>
                                <th className="text-left p-3 font-medium">Duration</th>
                                <th className="text-right p-3 font-medium">Profit/Loss</th>
                              </tr>
                            </thead>
                            <tbody>
                              {results.trades.slice(0, 10).map((trade, index) => (
                                <tr key={index} className="border-t">
                                  <td className="p-3">{trade.date}</td>
                                  <td className="p-3">{trade.time}</td>
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
                                  <td className="p-3">{trade.holdingPeriod}</td>
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

                      <TabsContent value="timing" className="pt-4">
                        <div className="border rounded-lg p-4">
                          <h3 className="text-lg font-medium mb-4">Exit Reason Analysis</h3>
                          <div className="space-y-4">
                            {results.trades.slice(0, 5).map((trade, index) => (
                              <div key={index} className="border rounded-lg p-4">
                                <div className="flex justify-between items-center mb-2">
                                  <div>
                                    <span className="text-sm text-muted-foreground">Trade #{index + 1} - </span>
                                    <span className={cn(
                                      "font-medium",
                                      trade.result === 'win' ? "text-green-500" : "text-red-500"
                                    )}>
                                      {trade.result === 'win' ? 'Win' : 'Loss'}
                                    </span>
                                  </div>
                                  <div className="text-sm">
                                    {trade.date} at {trade.time}
                                  </div>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2">
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Entry</div>
                                    <div className="flex items-center gap-2">
                                      <div className={cn(
                                        "w-3 h-3 rounded-full",
                                        trade.type === 'buy' ? "bg-green-500" : "bg-red-500"
                                      )}></div>
                                      <span>{trade.type === 'buy' ? 'BUY' : 'SELL'} @ {trade.price.toFixed(4)}</span>
                                    </div>
                                  </div>
                                  
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Duration</div>
                                    <div>{trade.holdingPeriod}</div>
                                  </div>
                                  
                                  <div>
                                    <div className="text-xs text-muted-foreground mb-1">Profit/Loss</div>
                                    <div className={trade.profit > 0 ? "text-green-500" : "text-red-500"}>
                                      {trade.profit > 0 ? '+' : ''}{trade.profit.toFixed(2)}
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="mt-2 pt-2 border-t">
                                  <div className="text-xs text-muted-foreground mb-1">Exit Reason</div>
                                  <div className="font-medium">{trade.exitReason}</div>
                                </div>
                              </div>
                            ))}
                          </div>
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