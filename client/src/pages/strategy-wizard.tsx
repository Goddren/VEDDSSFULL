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
import { apiRequest } from '@/lib/queryClient';
import { StrategyBuilder } from '@/components/trading/strategy-builder';
import type { StrategySpec, EngineStrategyInfo } from '@/lib/strategy-spec';
import { templatePreset, defaultBuilderSpec, engineNativeSpec, ENGINE_STRATEGIES } from '@/lib/strategy-spec';

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

  // ── Spec-driven flow state (templates with presets / builder / engine) ──
  const [mode, setMode] = useState<'template' | 'builder' | 'engine'>('template');
  const [spec, setSpec] = useState<StrategySpec | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [realResults, setRealResults] = useState<any | null>(null);
  const [btError, setBtError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [btCapital, setBtCapital] = useState<number>(10000);
  const [btSpread, setBtSpread] = useState<number>(1);
  const [btSlippage, setBtSlippage] = useState<number>(0.3);
  const [btCommission, setBtCommission] = useState<number>(0);
  
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

  // Handle strategy selection. Indicator-based templates load their
  // mechanical preset as an editable spec; pattern templates keep the
  // legacy parameter view (spec stays null — no invented backtest).
  const syncSpecFromTemplate = (strategy: TradingStrategy) => {
    const params: Record<string, any> = {};
    strategy.parameters.forEach(p => { params[p.id] = p.value; });
    setSpec(templatePreset(strategy.id, strategy.name, params, symbol, timeframe as StrategySpec['timeframe']));
  };

  const handleSelectStrategy = (strategy: TradingStrategy) => {
    setMode('template');
    setSelectedStrategy(strategy);
    setCustomizedStrategy({...strategy});
    setSavedId(null);
    setRealResults(null);
    setBtError(null);
    syncSpecFromTemplate(strategy);
  };

  // Update parameter value
  const handleParamChange = (paramId: string, value: any) => {
    if (!customizedStrategy) return;

    const updated = {
      ...customizedStrategy,
      parameters: customizedStrategy.parameters.map(param =>
        param.id === paramId ? {...param, value} : param
      )
    };
    setCustomizedStrategy(updated);
    syncSpecFromTemplate(updated);
  };

  // Navigate to next step
  const handleNext = () => {
    if (currentStep === 'select' && !selectedStrategy && !spec) {
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

  // ── Real backtest: deterministic replay of the current spec on the server.
  // (The old Math.random mock is gone — numbers a user sees are the numbers
  //  the strategy actually produced on historical bars.)
  const errText = (e: any): string => {
    const raw = e?.message || 'Request failed';
    try { const j = JSON.parse(raw); return j.error || raw; } catch { return String(raw).slice(0, 300); }
  };

  const handleRunBacktest = async () => {
    if (!spec) {
      toast({
        title: 'Pattern templates can\'t be replayed mechanically',
        description: 'This template is pattern-based (shapes on a chart), so an indicator backtest would be invented numbers. Pick an indicator template, an engine strategy with an approximation, or build your own rules.',
        variant: 'destructive',
      });
      return;
    }
    if (spec.entryLong.conditions.length + spec.entryShort.conditions.length === 0) {
      toast({
        title: 'Engine-native strategy',
        description: 'This one runs on the FX engine\'s AI analysis — there are no fixed rules to replay. Save it here; its track record comes from live results once deployed.',
        variant: 'destructive',
      });
      return;
    }
    setIsLoading(true);
    setBtError(null);
    try {
      const res = await apiRequest('POST', '/api/strategy-wizard/backtest', {
        spec,
        strategyId: savedId ?? undefined,
        initialCapital: btCapital,
        spreadPips: btSpread,
        slippagePips: btSlippage,
        commissionPerLot: btCommission,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'Backtest failed');
      setRealResults(data);
      setCurrentStep('results');
      toast({
        title: 'Backtest complete',
        description: `${data.stats.totalTrades} trades over ${data.stats.barsUsed} bars · data: ${data.provider} · same inputs always give this result`,
      });
    } catch (error: any) {
      const msg = errText(error);
      setBtError(msg);
      toast({ title: 'Backtest failed', description: msg, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveStrategy = async () => {
    if (!spec) return;
    setIsSaving(true);
    try {
      if (savedId) {
        const res = await apiRequest('PUT', `/api/strategy-wizard/strategies/${savedId}`, { spec });
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d?.error || 'Save failed'); }
        toast({ title: 'Strategy updated', description: 'Your saved strategy now matches these rules.' });
      } else {
        const res = await apiRequest('POST', '/api/strategy-wizard/strategies', { spec });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error || 'Save failed');
        setSavedId(data.strategy.id);
        toast({
          title: 'Strategy saved',
          description: realResults
            ? 'Run the backtest once more and this run\'s data points attach to the strategy — they\'re what its brain is built from.'
            : 'Run a backtest and its data points attach to the strategy — they\'re what its brain is built from.',
        });
      }
    } catch (error: any) {
      toast({ title: 'Save failed', description: errText(error), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Start the condition builder with a fresh editable spec.
  const handleStartBuilder = () => {
    setMode('builder');
    setSelectedStrategy(null);
    setCustomizedStrategy(null);
    setSpec(defaultBuilderSpec(symbol, timeframe as StrategySpec['timeframe']));
    setSavedId(null);
    setRealResults(null);
    setBtError(null);
    setCurrentStep('configure');
  };

  // Pick one of the FX engine's built-in strategies.
  const handleSelectEngineStrategy = (info: EngineStrategyInfo) => {
    setMode('engine');
    setSelectedStrategy(null);
    setCustomizedStrategy(null);
    setSavedId(null);
    setRealResults(null);
    setBtError(null);
    setSpec(info.approx
      ? { ...info.approx(symbol, timeframe as StrategySpec['timeframe']), symbol, timeframe: timeframe as StrategySpec['timeframe'] }
      : engineNativeSpec(info, symbol, timeframe as StrategySpec['timeframe']));
    setCurrentStep('configure');
  };

  // UI Components for each step
  const renderStepContent = () => {
    switch (currentStep) {
      case 'select':
        return (
          <div className="space-y-6">
            {/* Build your own */}
            <Card className="border-indigo-500/40 bg-gradient-to-r from-indigo-500/10 to-transparent">
              <CardContent className="pt-6 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-indigo-400" /> Build Your Own Strategy
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    Combine indicators into your own entry and exit rules — EMA, RSI, MACD, Stochastic, Bollinger, ATR.
                    Backtest it for real, save it, turn it into an MT5 EA, deploy it to a live account.
                  </p>
                </div>
                <Button size="lg" onClick={handleStartBuilder} className="bg-gradient-to-r from-indigo-500 to-indigo-700 text-white shrink-0">
                  Open the Condition Builder
                </Button>
              </CardContent>
            </Card>

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

            {/* FX Engine Strategies */}
            <div className="pt-2">
              <h3 className="text-lg font-medium mb-1">FX Engine Strategies</h3>
              <p className="text-sm text-muted-foreground mb-4">
                The strategies already built into the VEDD FX engine. Ones marked
                <Badge variant="outline" className="mx-1">backtestable</Badge>
                carry a mechanical approximation you can replay here; the rest run on the engine's AI analysis live.
              </p>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {ENGINE_STRATEGIES.map((info) => (
                  <Card
                    key={info.key}
                    className={`cursor-pointer hover:border-primary/60 transition-colors ${spec?.engineStrategyKey === info.key ? 'border-2 border-primary' : ''}`}
                    onClick={() => handleSelectEngineStrategy(info)}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center justify-between gap-2">
                        {info.name}
                        {info.approx
                          ? <Badge variant="outline" className="shrink-0">backtestable</Badge>
                          : <Badge variant="secondary" className="shrink-0">engine AI</Badge>}
                      </CardTitle>
                      <CardDescription>{info.description}</CardDescription>
                    </CardHeader>
                    <CardFooter className="pt-0">
                      <span className="text-xs text-muted-foreground">{info.category} · FX Engine</span>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            </div>
          </div>
        );

      case 'configure':
        return (
          <>
            {spec ? (
              <StrategyBuilder
                value={spec}
                onChange={(s) => { setSpec(s); setSymbol(s.symbol); setTimeframe(s.timeframe); }}
              />
            ) : customizedStrategy && (
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
                        <Select value={symbol} onValueChange={(v) => { setSymbol(v); setSpec(prev => prev ? { ...prev, symbol: v } : prev); }}>
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
                        <Select value={timeframe} onValueChange={(v) => { setTimeframe(v); setSpec(prev => prev ? { ...prev, timeframe: v as StrategySpec['timeframe'] } : prev); }}>
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
                          value={btCapital}
                          onChange={(e) => setBtCapital(Number(e.target.value))}
                          className="text-right"
                        />
                      </div>
                    </div>
                    
                    <Separator />
                    
                    <div className="space-y-4">
                      <h3 className="text-lg font-medium">Trading Costs (counted in the replay)</h3>

                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="spreadPips">Spread (pips)</Label>
                          <Input
                            id="spreadPips"
                            type="number" step="0.1" min="0"
                            value={btSpread}
                            onChange={(e) => setBtSpread(Number(e.target.value))}
                            className="text-right"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="slippagePips">Slippage (pips)</Label>
                          <Input
                            id="slippagePips"
                            type="number" step="0.1" min="0"
                            value={btSlippage}
                            onChange={(e) => setBtSlippage(Number(e.target.value))}
                            className="text-right"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="commissionPerLot">Commission ($ / lot / side)</Label>
                          <Input
                            id="commissionPerLot"
                            type="number" step="0.1" min="0"
                            value={btCommission}
                            onChange={(e) => setBtCommission(Number(e.target.value))}
                            className="text-right"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        The replay is deterministic: same rules + same bars + same costs = the same result every run.
                        Bars come from the market data service (or your MT5 candle cache) — if there aren't enough real bars, the backtest refuses instead of inventing numbers.
                      </p>
                      {btError && (
                        <div className="border border-red-500/40 bg-red-500/10 rounded-lg p-3 text-sm text-red-400">
                          {btError}
                        </div>
                      )}
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
            {realResults ? (
              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                      Backtest Results — {spec?.name}
                    </CardTitle>
                    <CardDescription>
                      {spec?.symbol} {spec?.timeframe} · {realResults.stats.barsUsed} bars · data: {realResults.provider} · deterministic replay (same inputs, same result, every time)
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Net PnL</div>
                        <div className={`text-2xl font-bold ${realResults.stats.netPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                          {realResults.stats.netPnl >= 0 ? '+' : '-'}${Math.abs(realResults.stats.netPnl).toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">{realResults.stats.returnPct >= 0 ? '+' : ''}{realResults.stats.returnPct.toFixed(2)}% return</div>
                      </div>
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Win Rate</div>
                        <div className="text-2xl font-bold text-green-500">{realResults.stats.winRate.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">{realResults.stats.wins}W / {realResults.stats.losses}L</div>
                      </div>
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Profit Factor</div>
                        <div className="text-2xl font-bold text-indigo-500">
                          {realResults.stats.profitFactor == null ? (realResults.stats.grossProfit > 0 ? '∞' : '—') : realResults.stats.profitFactor.toFixed(2)}
                        </div>
                        <div className="text-xs text-muted-foreground">{realResults.stats.totalTrades} trades · {realResults.stats.netPips >= 0 ? '+' : ''}{realResults.stats.netPips.toFixed(1)} pips</div>
                      </div>
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Max Drawdown</div>
                        <div className="text-2xl font-bold text-amber-500">{realResults.stats.maxDrawdownPct.toFixed(1)}%</div>
                        <div className="text-xs text-muted-foreground">final balance ${realResults.stats.finalBalance.toFixed(2)}</div>
                      </div>
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Avg Win</div>
                        <div className="text-2xl font-bold">${realResults.stats.avgWin.toFixed(2)}</div>
                      </div>
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Avg Loss</div>
                        <div className="text-2xl font-bold">${realResults.stats.avgLoss.toFixed(2)}</div>
                      </div>
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Long / Short Win Rate</div>
                        <div className="text-2xl font-bold">
                          {realResults.dataPoints.longWinRate == null ? '—' : `${realResults.dataPoints.longWinRate.toFixed(0)}%`}
                          <span className="text-muted-foreground text-base"> / </span>
                          {realResults.dataPoints.shortWinRate == null ? '—' : `${realResults.dataPoints.shortWinRate.toFixed(0)}%`}
                        </div>
                        <div className="text-xs text-muted-foreground">{realResults.dataPoints.longTrades} long · {realResults.dataPoints.shortTrades} short</div>
                      </div>
                      <div className="bg-card border rounded-lg p-4 text-center">
                        <div className="text-sm text-muted-foreground mb-1">Avg Hold</div>
                        <div className="text-2xl font-bold">{realResults.dataPoints.avgHoldBars.toFixed(1)} bars</div>
                        <div className="text-xs text-muted-foreground">
                          exits: {Object.entries(realResults.dataPoints.tradesByExitReason).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join(' · ') || '—'}
                        </div>
                      </div>
                    </div>

                    {realResults.equityCurve.length > 1 && (() => {
                      const pts = realResults.equityCurve;
                      const min = Math.min(...pts.map((p: any) => p.equity));
                      const max = Math.max(...pts.map((p: any) => p.equity));
                      const range = max - min || 1;
                      const poly = pts.map((p: any, i: number) =>
                        `${(i / (pts.length - 1)) * 600},${110 - ((p.equity - min) / range) * 100}`).join(' ');
                      return (
                        <div className="mb-8">
                          <div className="text-sm font-medium mb-2">Equity Curve</div>
                          <svg viewBox="0 0 600 120" className="w-full h-28 border rounded-lg bg-card" preserveAspectRatio="none">
                            <polyline points={poly} fill="none" stroke="#6366f1" strokeWidth="2" />
                          </svg>
                          <div className="flex justify-between text-xs text-muted-foreground mt-1">
                            <span>${min.toFixed(0)}</span><span>${max.toFixed(0)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {realResults.trades.length > 0 && (
                      <div className="mb-2">
                        <div className="text-sm font-medium mb-2">Recent Trades (last {Math.min(10, realResults.trades.length)})</div>
                        <div className="space-y-2">
                          {[...realResults.trades].slice(-10).reverse().map((t: any, i: number) => (
                            <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 border rounded-lg px-3 py-2 text-sm">
                              <Badge variant={t.side === 'long' ? 'default' : 'secondary'}>{t.side.toUpperCase()}</Badge>
                              <span className="text-muted-foreground">{new Date(t.entryTime).toLocaleString()}</span>
                              <span>{t.entryPrice.toFixed(5)} → {t.exitPrice.toFixed(5)}</span>
                              <span className={t.pips >= 0 ? 'text-green-500' : 'text-red-500'}>{t.pips >= 0 ? '+' : ''}{t.pips.toFixed(1)} pips</span>
                              <span className={t.pnl >= 0 ? 'text-green-500 font-medium' : 'text-red-500 font-medium'}>{t.pnl >= 0 ? '+' : '-'}${Math.abs(t.pnl).toFixed(2)}</span>
                              <span className="text-xs text-muted-foreground ml-auto">{String(t.exitReason).replace('_', ' ')}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex flex-wrap gap-3 justify-between">
                    <Button variant="outline" onClick={() => setCurrentStep('backtest')}>
                      <Settings2 className="h-4 w-4 mr-2" />
                      Adjust & Re-run
                    </Button>
                    <Button onClick={handleSaveStrategy} disabled={isSaving || !spec}>
                      <Save className="h-4 w-4 mr-2" />
                      {isSaving ? 'Saving…' : savedId ? 'Update Saved Strategy' : 'Save Strategy'}
                    </Button>
                  </CardFooter>
                </Card>
              </div>
            ) : (
              <div className="p-10 border rounded-lg text-center">
                <BarChart3 className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                <h3 className="text-lg font-medium mb-2">No backtest results yet</h3>
                <p className="text-muted-foreground mb-4">
                  Run a backtest from the Backtest step — results here are a real replay of your rules on historical bars, never simulated numbers.
                </p>
                <Button variant="outline" onClick={() => setCurrentStep('backtest')} className="mx-auto">
                  Go to Backtest
                </Button>
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