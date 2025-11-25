import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ImageUpload from '@/components/ui/image-upload';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ChartAnalysisResponse } from '@shared/types';
import { Clock, TrendingUp, Code, Download, Check, X, Settings, Target, Sparkles } from 'lucide-react';
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
  const [chartDate, setChartDate] = useState(new Date().toISOString().split('T')[0]);
  const [useTrailingStop, setUseTrailingStop] = useState(true);
  const [trailingStopDistance, setTrailingStopDistance] = useState(50);
  const [trailingStopStep, setTrailingStopStep] = useState(10);
  const [multiTradeStrategy, setMultiTradeStrategy] = useState<'single' | 'pyramiding' | 'grid' | 'hedging'>('single');
  const [maxSimultaneousTrades, setMaxSimultaneousTrades] = useState(1);
  const [pyramidingRatio, setPyramidingRatio] = useState(0.5);
  const [selectedPlatform, setSelectedPlatform] = useState<'MT5' | 'TradingView' | 'TradeLocker'>('MT5');
  const [volumeThreshold, setVolumeThreshold] = useState(0);
  const [tradingDays, setTradingDays] = useState<Record<string, boolean>>({
    Monday: true,
    Tuesday: true,
    Wednesday: true,
    Thursday: true,
    Friday: true,
    Saturday: false,
    Sunday: false
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
        tradingDays
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

  const uploadedCount = Object.values(timeframeUploads).filter(tf => tf.analysis !== null).length;
  const canGenerateCode = uploadedCount >= 2;

  const selectedStrategy = STRATEGY_TYPES.find(st => st.value === strategyType);

  // AI-powered chart recommendation for best entry
  const getChartRecommendation = () => {
    const uploadedCharts = Object.entries(timeframeUploads)
      .filter(([_, tf]) => tf.analysis !== null)
      .map(([timeframe, tf]) => {
        const analysis = tf.analysis as any;
        
        // Score based on signal strength and confidence
        let score = 0;
        
        // Direction confidence (high confidence = higher score)
        const confidenceMap: Record<string, number> = {
          'Very High': 100,
          'High': 80,
          'Medium': 60,
          'Low': 40
        };
        score += confidenceMap[analysis.confidence] || 50;
        
        // Signal type bonus
        if (analysis.direction === 'BUY' || analysis.direction === 'SELL') {
          score += 30;
        }
        
        // Technical indicator strength
        if (analysis.momentumIndicators?.rsi) {
          const rsiValue = analysis.momentumIndicators.rsi.value;
          // Strong RSI signals (overbought/oversold) are better
          if ((rsiValue > 70 && analysis.direction === 'SELL') || 
              (rsiValue < 30 && analysis.direction === 'BUY')) {
            score += 25;
          } else if ((rsiValue > 60 && analysis.direction === 'SELL') || 
                     (rsiValue < 40 && analysis.direction === 'BUY')) {
            score += 15;
          }
        }
        
        // MACD confirmation bonus
        if (analysis.trendIndicators?.macd) {
          score += 20;
        }
        
        // Pattern recognition bonus
        if (analysis.patterns && analysis.patterns.length > 0) {
          score += 15 * Math.min(analysis.patterns.length, 2);
        }
        
        return {
          timeframe,
          score,
          analysis,
          rsi: analysis.momentumIndicators?.rsi?.value ? parseFloat(analysis.momentumIndicators.rsi.value) : null,
          pattern: analysis.patterns?.[0]?.name || 'None'
        };
      });
    
    if (uploadedCharts.length === 0) return null;
    
    const best = uploadedCharts.sort((a, b) => b.score - a.score)[0];
    return best;
  };

  const bestChart = canGenerateCode ? getChartRecommendation() : null;

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="title-multi-timeframe">Multi-Timeframe Analysis</h1>
          <p className="text-muted-foreground" data-testid="text-description">
            Upload charts from multiple timeframes to generate MT5 or TradingView EA code for automated trading
          </p>
        </div>

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
          </CardContent>
        </Card>

        {symbol && (
          <Card>
            <CardHeader>
              <CardTitle>Analyzing: {symbol}</CardTitle>
              <CardDescription>
                {uploadedCount} of {TIMEFRAMES.length} timeframes uploaded
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Upload Timeframe Charts
            </CardTitle>
            <CardDescription>
              Upload at least 2 different timeframes of the same trading pair
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {TIMEFRAMES.map((tf) => {
                const upload = timeframeUploads[tf.value];
                return (
                  <Card key={tf.value} className="relative">
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
                    <CardContent>
                      {upload.previewUrl ? (
                        <div className="space-y-2">
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
                        </div>
                      ) : (
                        <ImageUpload
                          onImageUpload={(file) => handleImageUpload(tf.value, file)}
                        />
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {bestChart && (
          <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-amber-900 dark:text-amber-100">
                <Sparkles className="w-5 h-5" />
                AI Recommendation: Best Chart for EA Entry
              </CardTitle>
              <CardDescription className="text-amber-800 dark:text-amber-200">
                Based on signal strength, confidence, and technical indicators
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-muted-foreground">Recommended Timeframe</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{bestChart.timeframe}</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-muted-foreground">Signal Quality Score</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{Math.round(bestChart.score)}/250</p>
                  </div>
                  <div className="bg-white dark:bg-slate-900 p-3 rounded border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-muted-foreground">Signal Direction</p>
                    <Badge className={bestChart.analysis.direction === 'BUY' ? 'bg-green-500' : bestChart.analysis.direction === 'SELL' ? 'bg-red-500' : 'bg-gray-500'}>
                      {bestChart.analysis.direction}
                    </Badge>
                  </div>
                </div>
                
                <div className="bg-white dark:bg-slate-900 p-3 rounded border border-amber-200 dark:border-amber-800 space-y-2">
                  <p className="text-sm font-medium">Why this chart?</p>
                  <ul className="text-sm space-y-1 text-muted-foreground list-disc pl-5">
                    <li><strong>Confidence:</strong> {bestChart.analysis.confidence} - Strong signal reliability</li>
                    <li><strong>Pattern:</strong> {bestChart.pattern} - Clear technical pattern identified</li>
                    {bestChart.rsi !== null && bestChart.rsi !== undefined && <li><strong>RSI:</strong> {typeof bestChart.rsi === 'number' ? bestChart.rsi.toFixed(2) : bestChart.rsi} - {typeof bestChart.rsi === 'number' ? (bestChart.rsi > 70 ? 'Overbought (sell pressure)' : bestChart.rsi < 30 ? 'Oversold (buy pressure)' : 'Neutral momentum') : ''}</li>}
                    <li><strong>Best For:</strong> Attach your EA to the <strong>{bestChart.timeframe}</strong> chart for optimal entry signals</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {canGenerateCode && (
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
                      <Button
                        className="mt-4"
                        onClick={() => {
                          navigator.clipboard.writeText((generateCodeMutation.data as any)?.code || '');
                          toast({ title: 'Copied to clipboard' });
                        }}
                        data-testid="button-copy-code"
                      >
                        Copy Code
                      </Button>
                    </CardContent>
                  </Card>
                </>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
