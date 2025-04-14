import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import ImageUpload from '@/components/ui/image-upload';
import LoadingIndicator from '@/components/ui/loading-indicator';
import ProgressSteps from '@/components/ui/progress-steps';
import AnalysisResult from '@/components/charts/analysis-result';
import { ApiKeySettings } from '@/components/ui/api-key-settings';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { AnalysisState, analysisPipeline, ChartAnalysisResponse } from '@shared/types';
import { delay } from '@/lib/utils';
import { BarChart3, CameraIcon, LayoutDashboard, Upload, Calendar, Sparkles, Lightbulb } from 'lucide-react';
import { MarketCalendar } from '@/components/market/market-calendar';
import { ChartInsightsPanel } from '@/components/market-insights/chart-insights-panel';

// Image compression utility
interface CompressOptions {
  maxWidth: number;
  maxHeight: number;
  quality: number;
}

async function compressImage(file: File, options: CompressOptions): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    
    img.onload = () => {
      // Create a canvas element to resize the image
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      // Calculate new dimensions while maintaining aspect ratio
      if (width > options.maxWidth) {
        height = (height * options.maxWidth) / width;
        width = options.maxWidth;
      }
      
      if (height > options.maxHeight) {
        width = (width * options.maxHeight) / height;
        height = options.maxHeight;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      // Draw the image on the canvas
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      
      // Convert canvas to Blob
      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas toBlob failed'));
          return;
        }
        
        // Create a new File from the blob
        const compressedFile = new File([blob], file.name, {
          type: file.type,
          lastModified: Date.now()
        });
        
        // Release the URL object
        URL.revokeObjectURL(img.src);
        
        resolve(compressedFile);
      }, file.type, options.quality);
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      reject(new Error('Failed to load image'));
    };
  });
}

const Analysis: React.FC = () => {
  const [analysisState, setAnalysisState] = useState<AnalysisState>(AnalysisState.INITIAL);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<ChartAnalysisResponse | null>(null);
  const [apiKeyValid, setApiKeyValid] = useState<boolean | null>(null);
  const { toast } = useToast();

  // Upload image mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      console.log('Upload mutation started with file:', file.name, file.type, file.size);
      
      // Compress and resize the image before uploading
      const compressedImage = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.8
      });
      
      console.log(`Original file size: ${file.size} bytes, compressed size: ${compressedImage.size} bytes`);
      
      // Read the compressed file as base64
      const fileReader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        fileReader.onload = () => {
          const base64 = fileReader.result?.toString().split(',')[1]; // Remove the data URL prefix
          if (base64) {
            resolve(base64);
          } else {
            reject(new Error('Failed to read file as base64'));
          }
        };
        fileReader.onerror = () => {
          reject(new Error('Error reading file'));
        };
      });
      
      fileReader.readAsDataURL(compressedImage);
      const base64Image = await base64Promise;
      
      console.log('File read as base64, sending directly to analyze endpoint');
      
      try {
        // Send the base64 data directly to the analyze endpoint instead of uploading the file
        const response = await apiRequest('POST', '/api/analyze-base64', {
          base64Image,
          filename: file.name
        });
        console.log('Analysis response received:', response.status);
        const result = await response.json();
        
        // Create a fake upload URL just for display purposes
        const fakeUrl = `/uploads/${Date.now()}-${file.name}`;
        return { 
          url: fakeUrl,
          analysisResult: result 
        };
      } catch (err) {
        console.error('Upload/analyze error caught:', err);
        throw err;
      }
    },
    onSuccess: (data) => {
      console.log('Upload/analysis successful', data);
      setUploadedImageUrl(data.url);
      
      // Skip the separate analysis step and use the result directly
      if (data.analysisResult) {
        setAnalysisResult(data.analysisResult);
        setAnalysisProgress(100);
        setAnalysisState(AnalysisState.COMPLETE);
        checkAchievements();
        
        // Invalidate subscription cache to update the usage bar
        queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
      } else {
        // Fall back to the old flow if we don't have analysis results yet
        startAnalysis(data.url);
      }
    },
    onError: (error) => {
      console.error('Upload mutation error:', error);
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
      setAnalysisState(AnalysisState.ERROR);
    }
  });

  // Analyze chart mutation
  const analysisMutation = useMutation({
    mutationFn: async (imageUrl: string) => {
      // Simulate the steps with delays
      for (let i = 0; i < analysisPipeline.length; i++) {
        setAnalysisProgress(((i + 0.5) / analysisPipeline.length) * 100);
        await delay(800); // Simulate processing time
      }
      
      try {
        // Try to fetch the image first to convert it to base64
        const imageResponse = await fetch(imageUrl);
        if (!imageResponse.ok) {
          throw new Error(`Failed to fetch image: ${imageResponse.status}`);
        }
        
        // Convert the image to base64
        const blob = await imageResponse.blob();
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const base64 = reader.result?.toString().split(',')[1];
            if (base64) {
              resolve(base64);
            } else {
              reject(new Error('Failed to convert image to base64'));
            }
          };
          reader.onerror = () => reject(new Error('Error reading image'));
        });
        
        reader.readAsDataURL(blob);
        const base64Image = await base64Promise;
        
        // Use the analyze-base64 endpoint instead of the analyze endpoint
        const response = await apiRequest('POST', '/api/analyze-base64', { 
          base64Image,
          filename: imageUrl.split('/').pop() || 'reanalyzed-image.png'
        });
        return await response.json();
      } catch (error) {
        console.error('Error reanalyzing image:', error);
        // Fall back to the original endpoint if base64 conversion fails
        const response = await apiRequest('POST', '/api/analyze', { imageUrl });
        return await response.json();
      }
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      setAnalysisProgress(100);
      setAnalysisState(AnalysisState.COMPLETE);
      
      // Record this analysis in achievements system
      checkAchievements();
      
      // Invalidate subscription cache to update the usage bar
      queryClient.invalidateQueries({ queryKey: ['/api/subscription'] });
    },
    onError: (error) => {
      toast({
        title: 'Analysis Failed',
        description: error.message,
        variant: 'destructive',
      });
      setAnalysisState(AnalysisState.ERROR);
    }
  });

  // Check if OpenAI API key is valid
  useEffect(() => {
    async function checkApiKey() {
      try {
        const response = await apiRequest('GET', '/api/validate-key');
        const data = await response.json();
        setApiKeyValid(data.valid);
      } catch (error) {
        setApiKeyValid(false);
      }
    }
    
    checkApiKey();
  }, []);

  // Check for achievements after successful analysis
  const checkAchievements = useCallback(async () => {
    try {
      await apiRequest('POST', '/api/check-achievements', { 
        type: 'analysis', 
        payload: { completed: true } 
      });
    } catch (error) {
      console.error('Failed to check achievements:', error);
    }
  }, []);

  const handleImageUpload = useCallback(async (file: File) => {
    // Check for API key validity first
    if (apiKeyValid === false) {
      toast({
        title: 'API Key Required',
        description: 'Please configure your OpenAI API key before analyzing images.',
        variant: 'destructive',
      });
      return;
    }
    
    // Check subscription limits before uploading
    try {
      const response = await apiRequest('POST', '/api/subscription/check-limits', {
        actionType: 'analysis'
      });
      
      const result = await response.json();
      
      if (!result.allowed) {
        toast({
          title: 'Subscription Limit Reached',
          description: `You've reached your monthly limit of ${result.limit} analyses on your ${result.planName} plan. Please upgrade to continue analyzing charts.`,
          variant: 'destructive',
        });
        return;
      }
      
      // If limit check passes, proceed with upload and analysis
      setAnalysisState(AnalysisState.UPLOADING);
      uploadMutation.mutate(file);
    } catch (error) {
      console.error('Error checking subscription limits:', error);
      toast({
        title: 'Error Checking Subscription',
        description: error instanceof Error ? error.message : 'Failed to check subscription limits. Please try again.',
        variant: 'destructive',
      });
    }
  }, [uploadMutation, apiKeyValid, toast]);

  const startAnalysis = useCallback((imageUrl: string) => {
    setAnalysisState(AnalysisState.ANALYZING);
    analysisMutation.mutate(imageUrl);
  }, [analysisMutation]);

  const handleReanalyze = useCallback(() => {
    if (uploadedImageUrl) {
      setAnalysisResult(null);
      setAnalysisState(AnalysisState.ANALYZING);
      setAnalysisProgress(0);
      analysisMutation.mutate(uploadedImageUrl);
    }
  }, [uploadedImageUrl, analysisMutation]);
  
  // Generate progress steps based on current state
  const getProgressSteps = useCallback(() => {
    const currentStepIndex = Math.min(
      Math.floor((analysisProgress / 100) * analysisPipeline.length),
      analysisPipeline.length - 1
    );
    
    return analysisPipeline.map((step, index) => ({
      ...step,
      status: index < currentStepIndex 
        ? 'completed' as const
        : index === currentStepIndex 
          ? 'current' as const
          : 'upcoming' as const
    }));
  }, [analysisProgress]);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page Header */}
      <div className="mb-8 space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Chart Analysis</h1>
        <p className="text-muted-foreground">
          Upload your trading charts for AI-powered analysis and trading recommendations
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Section */}
        <div className="lg:col-span-1 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                <span>Chart Upload</span>
              </CardTitle>
              <CardDescription>
                Supports MT4, MT5, and TradingView screenshots
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ImageUpload 
                onImageUpload={handleImageUpload} 
                isUploading={analysisState === AnalysisState.UPLOADING}
              />
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <LayoutDashboard className="h-4 w-4" />
                <span>Tips for best results</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <div className="rounded-full h-5 w-5 bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="rounded-full h-2 w-2 bg-primary" />
                  </div>
                  <p>Ensure price action and candlesticks are clearly visible</p>
                </li>
                <li className="flex items-start gap-2">
                  <div className="rounded-full h-5 w-5 bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="rounded-full h-2 w-2 bg-primary" />
                  </div>
                  <p>Include relevant indicators if they're part of your strategy</p>
                </li>
                <li className="flex items-start gap-2">
                  <div className="rounded-full h-5 w-5 bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="rounded-full h-2 w-2 bg-primary" />
                  </div>
                  <p>Make sure timeframe and symbol are visible in the screenshot</p>
                </li>
                <li className="flex items-start gap-2">
                  <div className="rounded-full h-5 w-5 bg-primary/20 flex items-center justify-center mt-0.5">
                    <div className="rounded-full h-2 w-2 bg-primary" />
                  </div>
                  <p>Consider cropping out unnecessary elements for better results</p>
                </li>
              </ul>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <CameraIcon className="h-4 w-4" />
                <span>Supported platforms</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs font-medium">MT4</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs font-medium">MT5</p>
                </div>
                <div className="rounded-lg bg-muted p-3 text-center">
                  <p className="text-xs font-medium">TradingView</p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Our AI model is trained on charts from these popular trading platforms
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Analysis Section */}
        <div className="lg:col-span-2">

          {/* API Key Configuration Card */}
          {apiKeyValid === false && (
            <Card className="mb-6">
              <CardHeader>
                <CardTitle>API Key Required</CardTitle>
                <CardDescription>
                  This application requires an OpenAI API key with active billing to analyze trading charts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApiKeySettings 
                  onKeySaved={() => setApiKeyValid(true)}
                />
              </CardContent>
            </Card>
          )}
          
          {/* Initial State - No Upload Yet */}
          {analysisState === AnalysisState.INITIAL && (
            <>
              <Card className="h-[500px] flex flex-col items-center justify-center mb-6">
                <CardContent className="text-center max-w-md py-12">
                  <div className="rounded-full w-20 h-20 mx-auto mb-6 bg-muted flex items-center justify-center">
                    <BarChart3 className="h-10 w-10 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-semibold mb-3">Upload a chart to begin analysis</h3>
                  <p className="text-muted-foreground mb-6">
                    Our AI will analyze your chart for patterns, indicators, support/resistance levels, and provide detailed trading recommendations
                  </p>
                  <p className="text-sm text-muted-foreground/80">
                    You can drag & drop an image, paste from clipboard, or use the file browser to upload
                  </p>
                </CardContent>
              </Card>
              
              {/* Economic Calendar for Initial State */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    <span className="text-blue-500">Economic Calendar</span>
                  </CardTitle>
                  <CardDescription>
                    Upcoming market-moving events that could impact your trading decisions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MarketCalendar />
                </CardContent>
              </Card>
            </>
          )}

          {/* Loading/Processing State */}
          {(analysisState === AnalysisState.UPLOADING || analysisState === AnalysisState.ANALYZING) && (
            <Card>
              <CardHeader>
                <CardTitle>
                  {analysisState === AnalysisState.UPLOADING 
                    ? 'Uploading Chart' 
                    : 'Analyzing Chart'
                  }
                </CardTitle>
                <CardDescription>
                  {analysisState === AnalysisState.UPLOADING 
                    ? 'Please wait while we process your chart image' 
                    : 'Our AI is analyzing your chart for patterns and signals'
                  }
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="flex flex-col items-center py-8">
                  <LoadingIndicator progress={analysisProgress} />
                  
                  <h3 className="text-lg font-medium mt-8">
                    {analysisState === AnalysisState.UPLOADING 
                      ? 'Preparing your chart...' 
                      : 'AI Analysis in Progress...'
                    }
                  </h3>
                  <p className="text-muted-foreground mt-2 text-center max-w-md">
                    {analysisState === AnalysisState.UPLOADING 
                      ? 'Your chart is being processed and optimized for analysis' 
                      : 'Analyzing price action, patterns, and trend direction'
                    }
                  </p>
                  
                  <div className="w-full max-w-lg mt-8 border rounded-lg p-6 bg-card">
                    <ProgressSteps steps={getProgressSteps()} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {analysisState === AnalysisState.ERROR && (
            <Card className="border-destructive/20">
              <CardHeader>
                <CardTitle className="text-destructive">Analysis Failed</CardTitle>
                <CardDescription>
                  We encountered an error while trying to analyze your chart
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col items-center py-8">
                  <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
                    <div className="w-10 h-10 rounded-full bg-destructive/20 flex items-center justify-center">
                      <div className="w-5 h-5 rounded-full bg-destructive"></div>
                    </div>
                  </div>
                  
                  {apiKeyValid === false ? (
                    <div className="w-full max-w-md text-center">
                      <h3 className="text-lg font-medium mb-3">API Key Required</h3>
                      <p className="text-muted-foreground mb-6">
                        The analysis requires a valid OpenAI API key with active billing. Please configure your API key below.
                      </p>
                      <ApiKeySettings 
                        onKeySaved={() => {
                          setApiKeyValid(true);
                          setAnalysisState(AnalysisState.INITIAL);
                        }}
                      />
                    </div>
                  ) : (
                    <div className="text-center">
                      <h3 className="text-lg font-medium mb-3">Something went wrong</h3>
                      <p className="text-muted-foreground mb-6">
                        We couldn't process your chart image. This could be due to image quality or format issues.
                      </p>
                      <Button
                        variant="default"
                        onClick={() => setAnalysisState(AnalysisState.INITIAL)}
                      >
                        Try Again
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Complete State - Show Results */}
          {analysisState === AnalysisState.COMPLETE && analysisResult && (
            <>
              <AnalysisResult 
                analysis={analysisResult} 
                imageUrl={analysisResult.imageUrl || uploadedImageUrl} 
                onReanalyze={handleReanalyze}
              />
              
              {/* Interactive AI Market Insights */}
              <div className="mt-6">
                <ChartInsightsPanel
                  symbol={analysisResult.symbol}
                  timeframe={analysisResult.timeframe}
                  direction={analysisResult.direction}
                  trend={analysisResult.trend}
                  confidence={analysisResult.confidence}
                  pattern={typeof analysisResult.patterns === 'string' && analysisResult.patterns
                    ? JSON.parse(analysisResult.patterns)[0]?.name 
                    : Array.isArray(analysisResult.patterns) && analysisResult.patterns.length > 0
                      ? analysisResult.patterns[0]?.name
                      : undefined}
                  patterns={typeof analysisResult.patterns === 'string' && analysisResult.patterns
                    ? JSON.parse(analysisResult.patterns).map((p: any) => p.name)
                    : Array.isArray(analysisResult.patterns) 
                      ? analysisResult.patterns.map((p: any) => p.name)
                      : []}
                  entryPoint={analysisResult.entryPoint}
                  exitPoint={analysisResult.exitPoint}
                  className="border-indigo-700/20"
                />
              </div>
              
              {/* Economic Calendar - Moved below results */}
              <Card className="mt-6">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Calendar className="h-5 w-5 text-blue-500" />
                    <span className="text-blue-500">Economic Calendar</span>
                  </CardTitle>
                  <CardDescription>
                    Upcoming market-moving events that could impact your trading decisions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <MarketCalendar />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default Analysis;