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
import { Clock, TrendingUp, Code, Download, Check, X, Settings, Target } from 'lucide-react';
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
    mutationFn: async (platformType: 'MT5' | 'TradingView') => {
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
        tradeDuration
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
              <div className="flex gap-4">
                <Button
                  onClick={() => generateCodeMutation.mutate('MT5')}
                  disabled={generateCodeMutation.isPending}
                  className="flex-1"
                  data-testid="button-generate-mt5"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate MT5 EA Code
                </Button>
                <Button
                  onClick={() => generateCodeMutation.mutate('TradingView')}
                  disabled={generateCodeMutation.isPending}
                  className="flex-1"
                  data-testid="button-generate-tradingview"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Generate TradingView Pine Script
                </Button>
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
                      <CardTitle className="text-lg">Generated EA Code</CardTitle>
                      <CardDescription>
                        Copy this code and paste it into {(generateCodeMutation.data as any)?.platform === 'MT5' ? 'MetaEditor (MT5)' : 'TradingView Pine Editor'}
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
