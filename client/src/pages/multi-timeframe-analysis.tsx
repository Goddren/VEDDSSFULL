import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import ImageUpload from '@/components/ui/image-upload';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ChartAnalysisResponse } from '@shared/types';
import { Clock, TrendingUp, Code, Download, Check, X, Settings, Target, Sparkles, Save, Zap, Upload, AlertCircle } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

interface TimeframeUpload {
  timeframe: string;
  file: File | null;
  previewUrl: string | null;
  analysis: ChartAnalysisResponse | null;
  uploading: boolean;
  error: string | null;
}

const TIMEFRAMES = [
  { value: 'M1', label: '1 Minute (M1)' },
  { value: 'M5', label: '5 Minutes (M5)' },
  { value: 'M15', label: '15 Minutes (M15)' },
  { value: 'M30', label: '30 Minutes (M30)' },
  { value: 'H1', label: '1 Hour (H1)' },
  { value: 'H4', label: '4 Hours (H4)' },
  { value: 'D1', label: 'Daily (D1)' },
  { value: 'W1', label: 'Weekly (W1)' },
];

async function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > 1200) {
        height = (height * 1200) / width;
        width = 1200;
      }
      if (height > 1200) {
        width = (width * 1200) / height;
        height = 1200;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob failed'));
          return;
        }
        const compressedFile = new File([blob], file.name, {
          type: file.type,
          lastModified: Date.now()
        });
        URL.revokeObjectURL(img.src);
        resolve(compressedFile);
      }, file.type, 0.8);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
  });
}

const STRATEGY_TYPES = [
  { 
    value: 'scalping', 
    label: 'Scalping (seconds to minutes)', 
    duration: '1-15 minutes',
    suggestedTimeframes: ['M1', 'M5', 'M15'],
    description: 'Quick trades, capturing small price movements'
  },
  { 
    value: 'day_trading', 
    label: 'Day Trading (minutes to hours)', 
    duration: '15 minutes - 4 hours',
    suggestedTimeframes: ['M15', 'M30', 'H1', 'H4'],
    description: 'Intraday trades, closed before market close'
  },
  { 
    value: 'swing_trading', 
    label: 'Swing Trading (hours to days)', 
    duration: '4 hours - 5 days',
    suggestedTimeframes: ['H4', 'D1'],
    description: 'Multi-day trades, capturing trend swings'
  },
  { 
    value: 'position_trading', 
    label: 'Position Trading (days to weeks)', 
    duration: '5+ days',
    suggestedTimeframes: ['D1', 'W1'],
    description: 'Long-term trades, following major trends'
  }
];

export default function MultiTimeframeAnalysis() {
  const [symbol, setSymbol] = useState('');
  const [groupId] = useState(uuidv4());
  const [strategyType, setStrategyType] = useState<string>('day_trading');
  const [eaName, setEaName] = useState('Multi-Timeframe Strategy');
  const [tradeDuration, setTradeDuration] = useState('');
  const [validityDays, setValidityDays] = useState(30);
  const [eaDescription, setEaDescription] = useState('');
  const [isSaveDialogOpen, setIsSaveDialogOpen] = useState(false);
  const [chartDate, setChartDate] = useState(new Date().toISOString().split('T')[0]);
  const [useTrailingStop, setUseTrailingStop] = useState(true);
  const [trailingStopDistance, setTrailingStopDistance] = useState(50);
  const [trailingStopStep, setTrailingStopStep] = useState(10);
  const [multiTradeStrategy, setMultiTradeStrategy] = useState<'single' | 'pyramiding' | 'grid' | 'hedging'>('single');
  const [maxSimultaneousTrades, setMaxSimultaneousTrades] = useState(1);
  const [pyramidingRatio, setPyramidingRatio] = useState(0.5);
  const [selectedPlatform, setSelectedPlatform] = useState<'MT5' | 'TradingView' | 'TradeLocker'>('MT5');
  const [volumeThreshold, setVolumeThreshold] = useState(0);
  const [unifiedSignal, setUnifiedSignal] = useState<any | null>(null);
  const [useBulkUpload, setUseBulkUpload] = useState(false);
  const [detectingCharts, setDetectingCharts] = useState(false);
  const [detectedCharts, setDetectedCharts] = useState<any[]>([]);
  const [useBreakoutEntry, setUseBreakoutEntry] = useState(false);
  const [breakoutTimeframe, setBreakoutTimeframe] = useState('M5');
  const [breakoutStartHour, setBreakoutStartHour] = useState(0);
  const [breakoutStartMinute, setBreakoutStartMinute] = useState(0);
  const [oneTradePerDay, setOneTradePerDay] = useState(false);
  const [tradingDays, setTradingDays] = useState<Record<string, boolean>>({
    Monday: true,
    Tuesday: true,
    Wednesday: true,
    Thursday: true,
    Friday: true,
    Saturday: true,
    Sunday: true
  });
  const [timeframeUploads, setTimeframeUploads] = useState<Record<string, TimeframeUpload>>(
    TIMEFRAMES.reduce((acc, tf) => ({
      ...acc,
      [tf.value]: {
        timeframe: tf.value,
        file: null,
        previewUrl: null,
        analysis: null,
        uploading: false,
        error: null
      }
    }), {})
  );
  const { toast } = useToast();

  const synthesizeSignalMutation = useMutation({
    mutationFn: async () => {
      const completedAnalyses = Object.values(timeframeUploads)
        .filter(tu => tu.analysis)
        .map(tu => tu.analysis);
      
      if (completedAnalyses.length < 2) {
        throw new Error('Need at least 2 chart analyses');
      }
      
      return apiRequest('POST', '/api/synthesize-trade-signal', { 
        analyses: completedAnalyses 
      }).then(r => r.json());
    },
    onSuccess: (data) => {
      setUnifiedSignal(data);
      toast({ title: 'Unified signal synthesized!' });
    },
    onError: (error: Error) => {
      toast({ 
        title: 'Signal synthesis failed', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const handleImageUpload = async (timeframe: string, file: File) => {
    setTimeframeUploads(prev => ({
      ...prev,
      [timeframe]: {
        ...prev[timeframe],
        file,
        previewUrl: URL.createObjectURL(file),
        uploading: true,
        error: null
      }
    }));

    try {
      const compressedImage = await compressImage(file);
      
      const fileReader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        fileReader.onload = () => {
          const fullBase64 = fileReader.result?.toString();
          if (fullBase64) {
            const base64 = fullBase64.split(',')[1];
            resolve(base64);
          } else {
            reject(new Error('Failed to read file'));
          }
        };
        fileReader.onerror = reject;
      });
      
      fileReader.readAsDataURL(compressedImage);
      const base64Image = await base64Promise;

      const response: any = await apiRequest('POST', '/api/analyze-base64', {
        base64Image: base64Image,
        multiTimeframeGroupId: groupId,
        timeframe: timeframe
      }).then(res => res.json());

      setTimeframeUploads(prev => ({
        ...prev,
        [timeframe]: {
          ...prev[timeframe],
          analysis: response,
          uploading: false
        }
      }));

      if (!symbol && response.symbol) {
        setSymbol(response.symbol);
      }

      toast({
        title: 'Analysis Complete',
        description: `${timeframe} chart analyzed successfully`
      });
    } catch (error) {
      setTimeframeUploads(prev => ({
        ...prev,
        [timeframe]: {
          ...prev[timeframe],
          uploading: false,
          error: error instanceof Error ? error.message : 'Upload failed'
        }
      }));
      
      toast({
        title: 'Upload Failed',
        description: `Failed to analyze ${timeframe} chart`,
        variant: 'destructive'
      });
    }
  };

  const clearTimeframeUpload = (timeframe: string) => {
    setTimeframeUploads(prev => ({
      ...prev,
      [timeframe]: {
        timeframe,
        file: null,
        previewUrl: null,
        analysis: null,
        uploading: false,
        error: null
      }
    }));
  };

  const generateCodeMutation = useMutation({
    mutationFn: async (platformType: 'MT5' | 'TradingView' | 'TradeLocker') => {
      const uploadedTimeframes = Object.values(timeframeUploads)
        .filter(tf => tf.analysis !== null)
        .map(tf => ({
          timeframe: tf.timeframe,
          analysis: tf.analysis
        }));

      if (uploadedTimeframes.length < 2) {
        throw new Error('Please upload at least 2 timeframes to generate EA code');
      }

      const response: any = await apiRequest('POST', '/api/generate-ea-code', {
        groupId,
        symbol: symbol || 'UNKNOWN',
        platformType,
        timeframes: uploadedTimeframes,
        strategyType,
        eaName,
        tradeDuration,
        validityDays,
        chartDate,
        useTrailingStop,
        trailingStopDistance,
        trailingStopStep,
        multiTradeStrategy,
        maxSimultaneousTrades,
        pyramidingRatio,
        volumeThreshold,
        tradingDays,
        useBreakoutEntry,
        breakoutTimeframe,
        breakoutStartHour,
        breakoutStartMinute,
        oneTradePerDay
      }).then(res => res.json());

      return response;
    },
    onSuccess: (data, platformType) => {
      toast({
        title: 'Code Generated',
        description: `${platformType} EA code generated successfully`
      });
    },
    onError: (error) => {
      toast({
        title: 'Generation Failed',
        description: error instanceof Error ? error.message : 'Failed to generate code',
        variant: 'destructive'
      });
    }
  });

  const saveEAMutation = useMutation({
    mutationFn: async () => {
      if (!generateCodeMutation.data) {
        throw new Error('No generated code to save');
      }

      const chartAnalysisData = Object.values(timeframeUploads)
        .filter(tf => tf.analysis !== null)
        .map(tf => ({
          timeframe: tf.timeframe,
          direction: tf.analysis?.direction || 'NEUTRAL',
          confidence: tf.analysis?.confidence || '50',
          patterns: (tf.analysis?.patterns || []).map((p: any) => typeof p === 'string' ? p : p.name),
          entryPoint: tf.analysis?.entryPoint || 'N/A',
          stopLoss: tf.analysis?.stopLoss || 'N/A',
          takeProfit: tf.analysis?.takeProfit || 'N/A',
          trend: tf.analysis?.trend || 'Unknown',
          riskRewardRatio: tf.analysis?.riskRewardRatio || '1:2'
        }));

      const response: any = await apiRequest('POST', '/api/save-ea', {
        name: eaName,
        description: eaDescription,
        platformType: selectedPlatform,
        eaCode: (generateCodeMutation.data as any).code,
        symbol: symbol || 'UNKNOWN',
        strategyType,
        direction: unifiedSignal?.direction || 'NEUTRAL',
        confidence: unifiedSignal?.confidence || '50',
        entryPoint: unifiedSignal?.entryPoint || 'N/A',
        stopLoss: unifiedSignal?.stopLoss || 'N/A',
        takeProfit: unifiedSignal?.takeProfit || 'N/A',
        chartAnalysisData,
        multiTimeframeGroupId: groupId
      }).then(res => res.json());

      return response;
    },
    onSuccess: () => {
      toast({
        title: 'EA Saved!',
        description: 'Your EA has been saved. Visit "My EAs" to manage it or share to marketplace'
      });
      setIsSaveDialogOpen(false);
      setEaDescription('');
    },
    onError: (error) => {
      toast({
        title: 'Save Failed',
        description: error instanceof Error ? error.message : 'Failed to save EA',
        variant: 'destructive'
      });
    }
  });

  const uploadedCount = Object.values(timeframeUploads).filter(tf => tf.analysis !== null).length;
  const isAnyUploading = Object.values(timeframeUploads).some(tf => tf.uploading);
  const canGenerateCode = uploadedCount >= 2 && !isAnyUploading;

  const selectedStrategy = STRATEGY_TYPES.find(st => st.value === strategyType);

  // Get recommended chart from unified signal (only available after synthesis)
  const bestChart = unifiedSignal?.recommendedChart || null;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-3xl font-bold mb-2" data-testid="title-multi-timeframe">Multi-Timeframe Analysis</h1>
          <p className="text-muted-foreground" data-testid="text-description">
            Upload charts from multiple timeframes to generate MT5 or TradingView EA code for automated trading
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                EA Configuration
              </CardTitle>
              <CardDescription>
                Customize your Expert Advisor based on your trading style
              </CardDescription>
            </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ea-name">EA Name</Label>
                <Input
                  id="ea-name"
                  value={eaName}
                  onChange={(e) => setEaName(e.target.value)}
                  placeholder="My Trading Strategy"
                  data-testid="input-ea-name"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="strategy-type">Trading Strategy Type</Label>
                <Select value={strategyType} onValueChange={setStrategyType}>
                  <SelectTrigger id="strategy-type" data-testid="select-strategy-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STRATEGY_TYPES.map((st) => (
                      <SelectItem key={st.value} value={st.value}>
                        {st.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedStrategy && (
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <div className="flex items-start gap-2">
                  <Target className="w-5 h-5 mt-0.5 text-primary" />
                  <div>
                    <p className="font-medium">{selectedStrategy.description}</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Typical trade duration: {selectedStrategy.duration}
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Recommended timeframes:</strong> {selectedStrategy.suggestedTimeframes.join(', ')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">EA Validity Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="chart-date">Chart Analysis Date</Label>
                  <Input
                    id="chart-date"
                    type="date"
                    value={chartDate}
                    onChange={(e) => setChartDate(e.target.value)}
                    data-testid="input-chart-date"
                  />
                  <p className="text-xs text-muted-foreground">Date when the chart was analyzed</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="validity-days">EA Valid For (Days)</Label>
                  <Input
                    id="validity-days"
                    type="number"
                    value={validityDays}
                    onChange={(e) => setValidityDays(parseInt(e.target.value) || 30)}
                    min={1}
                    max={365}
                    data-testid="input-validity-days"
                  />
                  <p className="text-xs text-muted-foreground">Re-analyze after this period</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Trailing Stop Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useTrailingStop}
                      onChange={(e) => setUseTrailingStop(e.target.checked)}
                      className="rounded"
                      data-testid="checkbox-trailing-stop"
                    />
                    Enable Trailing Stop
                  </Label>
                  <p className="text-xs text-muted-foreground">Lock in profits while in profit</p>
                </div>
                {useTrailingStop && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="trailing-distance">Distance (pips)</Label>
                      <Input
                        id="trailing-distance"
                        type="number"
                        value={trailingStopDistance}
                        onChange={(e) => setTrailingStopDistance(parseInt(e.target.value) || 50)}
                        min={10}
                        data-testid="input-trailing-distance"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="trailing-step">Step (pips)</Label>
                      <Input
                        id="trailing-step"
                        type="number"
                        value={trailingStopStep}
                        onChange={(e) => setTrailingStopStep(parseInt(e.target.value) || 10)}
                        min={1}
                        data-testid="input-trailing-step"
                      />
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Trading Filters</h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="volume-threshold">Volume Threshold (% of average)</Label>
                  <Input
                    id="volume-threshold"
                    type="number"
                    value={volumeThreshold}
                    onChange={(e) => setVolumeThreshold(parseFloat(e.target.value) || 0)}
                    min={0}
                    max={500}
                    step={10}
                    placeholder="0 = No filter, 100 = Match average, 150 = 50% above average"
                    data-testid="input-volume-threshold"
                  />
                  <p className="text-xs text-muted-foreground">
                    0 (disabled) - trades triggered regardless of volume. Higher values require minimum volume before trade triggers
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="block">Trading Days</Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {Object.entries(tradingDays).map(([day, enabled]) => (
                      <label key={day} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={enabled}
                          onChange={(e) => setTradingDays(prev => ({ ...prev, [day]: e.target.checked }))}
                          className="rounded"
                          data-testid={`checkbox-trading-day-${day}`}
                        />
                        <span className="text-sm">{day}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">Select which days of the week trades can be triggered</p>
                </div>
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Multi-Trade Strategy</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="multi-trade-strategy">Strategy Mode</Label>
                  <Select value={multiTradeStrategy} onValueChange={(value: any) => setMultiTradeStrategy(value)}>
                    <SelectTrigger id="multi-trade-strategy" data-testid="select-multi-trade">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="single">Single Trade Only</SelectItem>
                      <SelectItem value="pyramiding">Pyramiding (Add to Winners)</SelectItem>
                      <SelectItem value="grid">Grid Trading</SelectItem>
                      <SelectItem value="hedging">Hedging</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="max-trades">Max Simultaneous Trades</Label>
                  <Input
                    id="max-trades"
                    type="number"
                    value={maxSimultaneousTrades}
                    onChange={(e) => setMaxSimultaneousTrades(parseInt(e.target.value) || 1)}
                    min={1}
                    max={10}
                    data-testid="input-max-trades"
                  />
                </div>
                {multiTradeStrategy === 'pyramiding' && (
                  <div className="space-y-2">
                    <Label htmlFor="pyramiding-ratio">Pyramiding Ratio</Label>
                    <Input
                      id="pyramiding-ratio"
                      type="number"
                      step="0.1"
                      value={pyramidingRatio}
                      onChange={(e) => setPyramidingRatio(parseFloat(e.target.value) || 0.5)}
                      min={0.1}
                      max={2}
                      data-testid="input-pyramiding-ratio"
                    />
                    <p className="text-xs text-muted-foreground">Lot multiplier for additional positions</p>
                  </div>
                )}
              </div>
            </div>

            <div className="border-t pt-4 mt-4">
              <h3 className="font-semibold mb-3">Breakout Entry Strategy</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useBreakoutEntry}
                    onChange={(e) => setUseBreakoutEntry(e.target.checked)}
                    className="rounded"
                    data-testid="checkbox-use-breakout"
                  />
                  <span className="text-sm font-medium">Enable Breakout Entry Strategy</span>
                </label>
                
                {useBreakoutEntry && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-6 border-l-2 border-blue-300 dark:border-blue-600">
                    <div className="space-y-2">
                      <Label htmlFor="breakout-timeframe">Breakout Timeframe</Label>
                      <Select value={breakoutTimeframe} onValueChange={setBreakoutTimeframe}>
                        <SelectTrigger id="breakout-timeframe" data-testid="select-breakout-timeframe">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="M1">1 Minute</SelectItem>
                          <SelectItem value="M5">5 Minutes</SelectItem>
                          <SelectItem value="M15">15 Minutes</SelectItem>
                          <SelectItem value="M30">30 Minutes</SelectItem>
                          <SelectItem value="H1">1 Hour</SelectItem>
                          <SelectItem value="H4">4 Hours</SelectItem>
                          <SelectItem value="D1">Daily</SelectItem>
                          <SelectItem value="W1">Weekly</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">Timeframe for detecting breakout levels</p>
                    </div>

                    <div className="space-y-2">
                      <Label className="block">Start Time (HH:MM)</Label>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <Input
                            id="breakout-hour"
                            type="number"
                            value={breakoutStartHour}
                            onChange={(e) => setBreakoutStartHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                            min={0}
                            max={23}
                            placeholder="Hour"
                            data-testid="input-breakout-hour"
                            className="text-center"
                          />
                        </div>
                        <span className="flex items-center">:</span>
                        <div className="flex-1">
                          <Input
                            id="breakout-minute"
                            type="number"
                            value={String(breakoutStartMinute).padStart(2, '0')}
                            onChange={(e) => setBreakoutStartMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                            min={0}
                            max={59}
                            placeholder="Min"
                            data-testid="input-breakout-minute"
                            className="text-center"
                          />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">Only place breakout trades after this time (24-hour format)</p>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={oneTradePerDay}
                          onChange={(e) => setOneTradePerDay(e.target.checked)}
                          className="rounded"
                          data-testid="checkbox-one-trade-per-day"
                        />
                        <span className="text-sm font-medium">Limit to 1 Trade Per Day</span>
                      </label>
                      <p className="text-xs text-muted-foreground">EA will only open 1 trade per calendar day (resets at 00:00)</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        </motion.div>

        {symbol && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card>
              <CardHeader>
                <CardTitle>Analyzing: {symbol}</CardTitle>
              <CardDescription>
                {uploadedCount} of {TIMEFRAMES.length} timeframes uploaded
                {isAnyUploading && (
                  <div className="mt-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                    Analyzing in progress... Please wait for all charts to complete before generating EA.
                  </div>
                )}
              </CardDescription>
              </CardHeader>
            </Card>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5" />
                Upload Charts
              </CardTitle>
            <CardDescription>
              Choose how to upload your charts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Upload Mode Toggle */}
            <div className="flex gap-2">
              <Button
                variant={!useBulkUpload ? "default" : "outline"}
                onClick={() => {
                  setUseBulkUpload(false);
                  setDetectedCharts([]);
                }}
                className="flex-1"
                data-testid="button-manual-upload"
              >
                Manual Selection
              </Button>
              <Button
                variant={useBulkUpload ? "default" : "outline"}
                onClick={() => setUseBulkUpload(true)}
                className="flex-1"
                data-testid="button-bulk-upload"
              >
                Bulk Upload All
              </Button>
            </div>

            {/* Manual Timeframe Selection Mode */}
            {!useBulkUpload && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {TIMEFRAMES.map((tf, index) => {
                  const upload = timeframeUploads[tf.value];
                  return (
                    <motion.div
                      key={tf.value}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: index * 0.05 }}
                    >
                      <Card className="relative">
                      <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-sm">{tf.label}</CardTitle>
                          {upload.analysis && (
                            <Badge variant="default" className="bg-green-500">
                              <Check className="w-3 h-3 mr-1" />
                              Done
                            </Badge>
                          )}
                          {upload.uploading && (
                            <Badge variant="secondary">Analyzing...</Badge>
                          )}
                          {upload.error && (
                            <Badge variant="destructive">
                              <X className="w-3 h-3 mr-1" />
                              Error
                            </Badge>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {upload.previewUrl ? (
                          <>
                            <img 
                              src={upload.previewUrl} 
                              alt={`${tf.value} chart`}
                              className="w-full h-32 object-cover rounded border"
                            />
                            {upload.analysis && (
                              <div className="text-xs space-y-1">
                                <p><strong>Signal:</strong> {upload.analysis.direction}</p>
                                <p><strong>Confidence:</strong> {upload.analysis.confidence}</p>
                                {upload.analysis.momentumIndicators?.rsi && (
                                  <p><strong>RSI:</strong> {upload.analysis.momentumIndicators.rsi.value}</p>
                                )}
                              </div>
                            )}
                            {upload.error && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => clearTimeframeUpload(tf.value)}
                                className="w-full text-destructive hover:bg-destructive/10"
                                data-testid={`button-reupload-${tf.value}`}
                              >
                                Re-upload Chart
                              </Button>
                            )}
                          </>
                        ) : (
                          <ImageUpload
                            onImageUpload={(file) => handleImageUpload(tf.value, file)}
                          />
                        )}
                      </CardContent>
                    </Card>
                    </motion.div>
                  );
                })}
              </div>
            )}

            {/* Bulk Upload Mode */}
            {useBulkUpload && (
              <div className="space-y-4">
                {detectedCharts.length === 0 ? (
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="font-medium mb-2">Upload all charts at once</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Select 2+ chart images and AI will detect which timeframe each one is
                    </p>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={async (e) => {
                        const files = Array.from(e.currentTarget.files || []);
                        if (files.length < 2) {
                          toast({
                            title: "Need at least 2 charts",
                            description: "Please select 2 or more chart images",
                            variant: "destructive"
                          });
                          return;
                        }

                        setDetectingCharts(true);
                        try {
                          const base64Images = await Promise.all(
                            files.map(f => new Promise<string>((resolve) => {
                              const reader = new FileReader();
                              reader.onload = () => {
                                const base64 = (reader.result as string).split(',')[1];
                                resolve(base64);
                              };
                              reader.readAsDataURL(f);
                            }))
                          );

                          const response = await apiRequest('POST', '/api/auto-detect-charts', {
                            images: base64Images
                          });
                          const data = await response.json();
                          
                          if (data.results) {
                            setDetectedCharts(data.results);
                          }
                        } catch (error) {
                          toast({
                            title: "Detection failed",
                            description: error instanceof Error ? error.message : "Could not detect charts",
                            variant: "destructive"
                          });
                        } finally {
                          setDetectingCharts(false);
                        }
                      }}
                      disabled={detectingCharts}
                      className="hidden"
                      id="bulk-file-input"
                      data-testid="input-bulk-charts"
                    />
                    <Button
                      onClick={() => document.getElementById('bulk-file-input')?.click()}
                      disabled={detectingCharts}
                      data-testid="button-select-charts"
                    >
                      {detectingCharts ? 'Detecting...' : 'Select Charts'}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="font-medium">Detected Timeframes ({detectedCharts.length} charts)</p>
                    <div className="space-y-2">
                      {detectedCharts.map((chart, idx) => (
                        <div key={idx} className="border rounded-lg p-4 flex items-start gap-4">
                          <img
                            src={`data:image/png;base64,${chart.base64Image}`}
                            alt={`chart-${idx}`}
                            className="w-24 h-24 object-cover rounded border"
                          />
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-lg text-blue-600">{chart.detectedTimeframe || '?'}</span>
                              <Badge variant={
                                chart.confidence === 'high' ? 'default' :
                                chart.confidence === 'medium' ? 'secondary' :
                                'destructive'
                              }>
                                {chart.confidence} confidence
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">{chart.reasoning}</p>
                            {chart.error && (
                              <div className="flex items-center gap-2 text-sm text-destructive">
                                <AlertCircle className="w-4 h-4" />
                                {chart.error}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => setDetectedCharts([])}
                        className="flex-1"
                        data-testid="button-reselect-charts"
                      >
                        Re-select Charts
                      </Button>
                      <Button
                        onClick={async () => {
                          // Map detected charts to timeframe uploads
                          const newUploads = { ...timeframeUploads };
                          for (const chart of detectedCharts) {
                            if (chart.detectedTimeframe) {
                              const timeframe = chart.detectedTimeframe;
                              if (timeframe in newUploads) {
                                newUploads[timeframe].previewUrl = `data:image/png;base64,${chart.base64Image}`;
                              }
                            }
                          }
                          setTimeframeUploads(newUploads);
                          setUseBulkUpload(false);
                          setDetectedCharts([]);
                          toast({ title: "Charts loaded! Now analyzing..." });

                          // Trigger analysis for each detected timeframe
                          for (const chart of detectedCharts) {
                            if (chart.detectedTimeframe && chart.detectedTimeframe in timeframeUploads) {
                              const timeframe = chart.detectedTimeframe;
                              const binaryString = atob(chart.base64Image);
                              const bytes = new Uint8Array(binaryString.length);
                              for (let i = 0; i < binaryString.length; i++) {
                                bytes[i] = binaryString.charCodeAt(i);
                              }
                              const file = new File([bytes], `chart-${timeframe}.png`, { type: 'image/png' });
                              await handleImageUpload(timeframe, file);
                            }
                          }
                        }}
                        disabled={!detectedCharts.some(c => c.detectedTimeframe)}
                        className="flex-1"
                        data-testid="button-confirm-charts"
                      >
                        Confirm & Analyze
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
        </motion.div>

        {uploadedCount >= 2 && !unifiedSignal && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
          >
            <Card className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-blue-900 dark:text-blue-100">
                  <Zap className="w-5 h-5" />
                  Unified Trade Signal
                </CardTitle>
              <CardDescription className="text-blue-800 dark:text-blue-200">
                Synthesize all chart analyses into one trading recommendation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => synthesizeSignalMutation.mutate()}
                disabled={synthesizeSignalMutation.isPending}
                className="w-full"
              >
                {synthesizeSignalMutation.isPending ? 'Analyzing...' : 'Generate Unified Signal'}
              </Button>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {unifiedSignal && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, type: "spring", stiffness: 100 }}
          >
            <Card className="border-primary/30 dark:border-primary/40 bg-primary/5 dark:bg-primary/10 overflow-hidden">
            <CardHeader className="bg-primary/20 dark:bg-primary/30 pb-3">
              <CardTitle className="flex items-center gap-2 text-primary text-2xl">
                <Check className="w-6 h-6" />
                Unified Multi-Timeframe Analysis
              </CardTitle>
              <CardDescription className="text-primary/80 dark:text-primary/70 mt-1">
                Ready to trade decision
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Signal Strength Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-2 border-primary/30 dark:border-primary/40 text-center">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Signal</p>
                  <p className={`text-3xl font-black mt-2 ${unifiedSignal.direction === 'BUY' ? 'text-green-500' : unifiedSignal.direction === 'SELL' ? 'text-primary' : 'text-amber-500'}`}>
                    {unifiedSignal.direction}
                  </p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-2 border-primary/30 dark:border-primary/40 text-center">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Confidence</p>
                  <p className="text-3xl font-black mt-2 text-primary">{unifiedSignal.confidence}</p>
                  <p className="text-xs text-muted-foreground mt-1">Signal Reliability</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-2 border-primary/30 dark:border-primary/40 text-center">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Strength</p>
                  <p className="text-3xl font-black mt-2 text-primary">{unifiedSignal.strength}/10</p>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 h-2 rounded mt-2">
                    <div className="bg-primary h-2 rounded" style={{width: `${(unifiedSignal.strength/10)*100}%`}}></div>
                  </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-2 border-primary/30 dark:border-primary/40 text-center">
                  <p className="text-xs text-muted-foreground font-semibold uppercase">Risk/Reward</p>
                  <p className="text-3xl font-black mt-2 text-primary">{unifiedSignal.riskRewardRatio}</p>
                  <p className="text-xs text-muted-foreground mt-1">Ratio</p>
                </div>
              </div>

              {/* Trade Setup Section */}
              <div className="border-t-2 border-primary/30 dark:border-primary/40 pt-4 mt-2">
                <h3 className="font-bold text-primary mb-3 text-sm uppercase tracking-wider">Trade Setup</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900 dark:to-blue-800 p-4 rounded-lg border-2 border-blue-300 dark:border-blue-700">
                    <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase">📍 Entry Point</p>
                    <p className="text-2xl font-black text-blue-700 dark:text-blue-300 mt-2">{unifiedSignal.entryPoint}</p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">Market entry price</p>
                  </div>
                  <div className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900 dark:to-orange-800 p-4 rounded-lg border-2 border-orange-300 dark:border-orange-700">
                    <p className="text-xs font-semibold text-orange-900 dark:text-orange-100 uppercase">🛑 Stop Loss</p>
                    <p className="text-2xl font-black text-orange-700 dark:text-orange-300 mt-2">{unifiedSignal.stopLoss}</p>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-1">Risk protection</p>
                  </div>
                  <div className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900 dark:to-emerald-800 p-4 rounded-lg border-2 border-emerald-300 dark:border-emerald-700">
                    <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-100 uppercase">🎯 Take Profit</p>
                    <p className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-2">{unifiedSignal.takeProfit}</p>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Profit target</p>
                  </div>
                </div>
              </div>

              {/* Analysis Insights */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-l-4 border-primary">
                <p className="text-xs font-semibold text-primary uppercase mb-2">🔄 Timeframe Convergence</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{unifiedSignal.convergence}</p>
              </div>

              {/* Trading Reasoning */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-l-4 border-blue-500">
                <p className="text-xs font-semibold text-blue-900 dark:text-blue-100 uppercase mb-2">💡 Why This Signal?</p>
                <p className="text-sm text-muted-foreground leading-relaxed">{unifiedSignal.reasoning}</p>
              </div>

              <Button 
                onClick={() => setUnifiedSignal(null)}
                variant="outline"
                className="w-full mt-2"
              >
                Analyze Different Charts
              </Button>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {bestChart && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 overflow-hidden">
              <CardHeader className="bg-amber-100 dark:bg-amber-900 pb-3">
                <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100 text-2xl">
                  <Sparkles className="w-6 h-6" />
                  Perfect Entry Point Found
                </CardTitle>
              <CardDescription className="text-amber-700 dark:text-amber-300 mt-1">
                AI recommends this timeframe for the best EA entry
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              {/* Recommendation Highlight */}
              <div className="bg-gradient-to-r from-amber-100 to-orange-100 dark:from-amber-800 dark:to-orange-800 p-5 rounded-lg border-2 border-amber-300 dark:border-amber-700 text-center">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-100 uppercase tracking-wider mb-2">Chart To Use</p>
                <p className="text-4xl font-black text-amber-700 dark:text-amber-300">{bestChart.timeframe}</p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
                  <Badge className={bestChart.direction === 'BUY' ? 'bg-green-500 text-white' : bestChart.direction === 'SELL' ? 'bg-primary text-white' : 'bg-gray-500 text-white'} style={{fontSize: '12px', padding: '4px 8px'}}>
                    {bestChart.direction} Signal
                  </Badge>
                </p>
              </div>

              {/* Key Metrics */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-l-4 border-primary">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Confidence</p>
                  <p className="text-2xl font-black text-primary mt-1">{bestChart.confidence}</p>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-l-4 border-blue-500">
                  <p className="text-xs font-semibold text-muted-foreground uppercase">Signal Type</p>
                  <p className={`text-2xl font-black mt-1 ${bestChart.direction === 'BUY' ? 'text-green-500' : 'text-primary'}`}>{bestChart.direction}</p>
                </div>
              </div>

              {/* Why This Chart Section */}
              <div className="bg-white dark:bg-slate-900 p-4 rounded-lg border-l-4 border-amber-500">
                <p className="text-xs font-bold text-amber-900 dark:text-amber-100 uppercase mb-3">Why This Chart?</p>
                <p className="text-sm text-muted-foreground leading-relaxed mb-3">{bestChart.reasoning}</p>
                
                {/* Technical Details */}
                <div className="space-y-2 text-sm">
                  {bestChart.patterns && bestChart.patterns.length > 0 && (
                    <div className="bg-blue-50 dark:bg-blue-900 p-2 rounded">
                      <p className="text-xs font-semibold text-blue-900 dark:text-blue-100">📊 Patterns Detected:</p>
                      <p className="text-blue-700 dark:text-blue-300">{bestChart.patterns.map((p: any) => p.name || p).join(', ')}</p>
                    </div>
                  )}
                  {bestChart.rsi !== null && bestChart.rsi !== undefined && (
                    <div className="bg-orange-50 dark:bg-orange-900 p-2 rounded">
                      <p className="text-xs font-semibold text-orange-900 dark:text-orange-100">📈 RSI Momentum:</p>
                      <p className="text-orange-700 dark:text-orange-300">
                        {typeof bestChart.rsi === 'number' ? bestChart.rsi.toFixed(2) : bestChart.rsi} - 
                        {typeof bestChart.rsi === 'number' ? (bestChart.rsi > 70 ? ' Overbought (sell pressure)' : bestChart.rsi < 30 ? ' Oversold (buy pressure)' : ' Neutral momentum') : ''}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Item */}
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900 dark:to-emerald-900 p-4 rounded-lg border-2 border-green-300 dark:border-green-700">
                <p className="text-sm font-bold text-green-900 dark:text-green-100 mb-2">✅ Next Step</p>
                <p className="text-sm text-green-800 dark:text-green-200">
                  Attach your Expert Advisor to the <strong>{bestChart.timeframe}</strong> chart to get the best entry signals from all timeframes combined.
                </p>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {canGenerateCode && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
          >
            <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code className="w-5 h-5" />
                Generate EA Code
              </CardTitle>
              <CardDescription>
                Create automated trading strategy code based on your multi-timeframe analysis
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="platform-select">Select Platform</Label>
                  <Select value={selectedPlatform} onValueChange={(value: any) => setSelectedPlatform(value)}>
                    <SelectTrigger id="platform-select" data-testid="select-platform">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="MT5">MT5 EA Code</SelectItem>
                      <SelectItem value="TradingView">TradingView Pine Script</SelectItem>
                      <SelectItem value="TradeLocker">TradeLocker Bot</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <Button
                  onClick={() => generateCodeMutation.mutate(selectedPlatform)}
                  disabled={generateCodeMutation.isPending}
                  className="w-full"
                  data-testid="button-generate-code"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate Code
                </Button>
              </div>

              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded border border-blue-200 dark:border-blue-800 text-sm">
                <p className="font-semibold text-blue-900 dark:text-blue-100 mb-2">📌 How It Works (For New Users):</p>
                <div className="space-y-2 text-blue-800 dark:text-blue-200 text-xs">
                  <p><strong>The Process:</strong></p>
                  <ol className="list-decimal pl-5 space-y-1">
                    <li>You upload 2+ trading charts from different timeframes</li>
                    <li>Our AI (OpenAI Vision) analyzes each chart for patterns, support/resistance, and signals</li>
                    <li>Results are combined into a multi-timeframe analysis</li>
                    <li>You customize EA settings (strategy type, trading hours, volume filters, etc.)</li>
                    <li>Click "Generate Code" - our API creates ready-to-use trading bot code</li>
                    <li>Copy the code and deploy it on your chosen platform</li>
                  </ol>
                  <p className="pt-2"><strong>API Endpoints Used:</strong></p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">/api/analyze-base64</code> - Sends chart image to OpenAI for AI analysis</li>
                    <li><code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">/api/generate-ea-code</code> - Creates platform-specific trading code</li>
                  </ul>
                </div>
              </div>

              <div className="p-3 bg-green-50 dark:bg-green-950 rounded border border-green-200 dark:border-green-800 text-sm">
                <p className="font-semibold text-green-900 dark:text-green-100 mb-2">✅ Platform Instructions:</p>
                <ul className="space-y-1 text-green-800 dark:text-green-200 text-xs list-disc pl-5">
                  <li><strong>MT5:</strong> Paste in MetaEditor, compile, attach to your {symbol} chart in MT5</li>
                  <li><strong>TradingView:</strong> Paste in Pine Script Editor, add to any {symbol} chart (any timeframe)</li>
                  <li><strong>TradeLocker:</strong> Run as Node.js bot (npm install, replace API key, node bot.js)</li>
                </ul>
              </div>

              {generateCodeMutation.data && (
                <>
                  <Card className="bg-primary/10 border-primary/20">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <TrendingUp className="w-5 h-5" />
                        Strategy Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <p className="text-xs text-muted-foreground">Strategy Type</p>
                          <p className="font-semibold">{selectedStrategy?.label.split('(')[0].trim()}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">EA Name</p>
                          <p className="font-semibold">{eaName}</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Timeframes</p>
                          <p className="font-semibold">{(generateCodeMutation.data as any)?.timeframesCount} analyzed</p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">Platform</p>
                          <p className="font-semibold">{(generateCodeMutation.data as any)?.platform}</p>
                        </div>
                      </div>
                      <div className="pt-2 border-t">
                        <p className="text-sm text-muted-foreground">
                          <strong>Features:</strong> ATR-based stops, multi-timeframe confirmation, volume filter, customizable risk management
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-muted">
                    <CardHeader>
                      <CardTitle className="text-lg">Generated Code</CardTitle>
                      <CardDescription>
                        {(generateCodeMutation.data as any)?.platform === 'MT5' && (
                          <>1. Copy code below 2. Open MetaEditor (in MT5) 3. Create new Expert Advisor 4. Paste code 5. Compile 6. Attach to {symbol} chart</>
                        )}
                        {(generateCodeMutation.data as any)?.platform === 'TradingView' && (
                          <>1. Copy code 2. Open any {symbol} chart on TradingView 3. Open Pine Editor 4. Create new script 5. Paste code 6. Add to chart</>
                        )}
                        {(generateCodeMutation.data as any)?.platform === 'TradeLocker' && (
                          <>1. Copy code to file (e.g., strategy.js) 2. Install: npm install axios 3. Replace YOUR_API_KEY and YOUR_ACCOUNT_ID 4. Run: node strategy.js</>
                        )}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <pre className="text-xs overflow-x-auto p-4 bg-background rounded border max-h-96">
                        <code>{(generateCodeMutation.data as any)?.code}</code>
                      </pre>
                      <div className="flex gap-2 mt-4 flex-wrap">
                        <Button
                          onClick={() => {
                            navigator.clipboard.writeText((generateCodeMutation.data as any)?.code || '');
                            toast({ title: 'Copied to clipboard' });
                          }}
                          data-testid="button-copy-code"
                        >
                          Copy Code
                        </Button>

                        <Dialog open={isSaveDialogOpen} onOpenChange={setIsSaveDialogOpen}>
                          <DialogTrigger asChild>
                            <Button variant="outline">
                              <Save className="w-4 h-4 mr-2" />
                              Save EA
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Save Your EA</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="space-y-2">
                                <Label htmlFor="save-name">EA Name</Label>
                                <Input
                                  id="save-name"
                                  value={eaName}
                                  onChange={(e) => setEaName(e.target.value)}
                                  placeholder="e.g., Multi-Timeframe EURUSD Strategy"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor="save-desc">Description (Optional)</Label>
                                <Textarea
                                  id="save-desc"
                                  value={eaDescription}
                                  onChange={(e) => setEaDescription(e.target.value)}
                                  placeholder="Describe your EA, settings, and performance expectations..."
                                  rows={3}
                                />
                              </div>
                              <Button
                                onClick={() => saveEAMutation.mutate()}
                                disabled={saveEAMutation.isPending || !eaName}
                                className="w-full"
                              >
                                {saveEAMutation.isPending ? 'Saving...' : 'Save EA'}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
          </motion.div>
        )}
      </div>
    </div>
  );
}
