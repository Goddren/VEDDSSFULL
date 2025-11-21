import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import ImageUpload from '@/components/ui/image-upload';
import { useToast } from '@/hooks/use-toast';
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { ChartAnalysisResponse } from '@shared/types';
import { Clock, TrendingUp, Code, Download, Check, X } from 'lucide-react';
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

export default function MultiTimeframeAnalysis() {
  const [symbol, setSymbol] = useState('');
  const [groupId] = useState(uuidv4());
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
        image: base64Image,
        multiTimeframeGroupId: groupId
      }).then(res => res.json());

      setTimeframeUploads(prev => ({
        ...prev,
        [timeframe]: {
          ...prev[timeframe],
          analysis: response.analysisResult,
          uploading: false
        }
      }));

      if (!symbol && response.analysisResult.symbol) {
        setSymbol(response.analysisResult.symbol);
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
        timeframes: uploadedTimeframes
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-2" data-testid="title-multi-timeframe">Multi-Timeframe Analysis</h1>
          <p className="text-muted-foreground" data-testid="text-description">
            Upload charts from multiple timeframes to generate MT5 or TradingView EA code for automated trading
          </p>
        </div>

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
                <Card className="bg-muted">
                  <CardHeader>
                    <CardTitle className="text-lg">Generated Code</CardTitle>
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
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
