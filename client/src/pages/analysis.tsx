import React, { useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import ImageUpload from '@/components/ui/image-upload';
import LoadingIndicator from '@/components/ui/loading-indicator';
import ProgressSteps from '@/components/ui/progress-steps';
import AnalysisResult from '@/components/charts/analysis-result';
import { useToast } from '@/hooks/use-toast';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { AnalysisState, analysisPipeline, ChartAnalysisResponse } from '@shared/types';
import { delay } from '@/lib/utils';

const Analysis: React.FC = () => {
  const [analysisState, setAnalysisState] = useState<AnalysisState>(AnalysisState.INITIAL);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadedImageUrl, setUploadedImageUrl] = useState<string>('');
  const [analysisProgress, setAnalysisProgress] = useState<number>(0);
  const [analysisResult, setAnalysisResult] = useState<ChartAnalysisResponse | null>(null);
  const { toast } = useToast();

  // Upload image mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('chart', file);
      const response = await apiRequest('POST', '/api/upload', formData);
      return await response.json();
    },
    onSuccess: (data) => {
      setUploadedImageUrl(data.url);
      startAnalysis(data.url);
    },
    onError: (error) => {
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
        setAnalysisProgress((i / analysisPipeline.length) * 100);
        await delay(500); // Simulate processing time
      }
      
      const response = await apiRequest('POST', '/api/analyze', { imageUrl });
      return await response.json();
    },
    onSuccess: (data) => {
      setAnalysisResult(data);
      setAnalysisProgress(100);
      setAnalysisState(AnalysisState.COMPLETE);
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

  const handleImageUpload = useCallback((file: File) => {
    setUploadedFile(file);
    setAnalysisState(AnalysisState.UPLOADING);
    uploadMutation.mutate(file);
  }, [uploadMutation]);

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
    const currentStepIndex = Math.floor((analysisProgress / 100) * analysisPipeline.length);
    
    return analysisPipeline.map((step, index) => ({
      ...step,
      status: index < currentStepIndex 
        ? 'completed' 
        : index === currentStepIndex 
          ? 'current' 
          : 'upcoming'
    }));
  }, [analysisProgress]);

  // Sample images (would be fetched from API in production)
  const sampleImages = [
    { id: 'sample1', name: 'EUR/USD 4H', imageUrl: 'https://images.unsplash.com/photo-1535320903710-d993d3d77d29' },
    { id: 'sample2', name: 'BTC/USD Daily', imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3' },
    { id: 'sample3', name: 'GBP/JPY 1H', imageUrl: 'https://images.unsplash.com/photo-1642790551116-18e150f248e4' },
  ];

  return (
    <div className="container mx-auto px-4 md:px-8 py-8">
      {/* Page Title */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Chart Analysis</h1>
        <p className="text-gray-400 mt-2">Upload your trading chart for AI analysis and predictions</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Upload Section */}
        <div className="col-span-1 lg:col-span-1">
          <Card className="bg-[#1E1E1E] border-[#2D2D2D] shadow-lg">
            <CardHeader>
              <CardTitle>Upload Chart</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUpload 
                onImageUpload={handleImageUpload} 
                isUploading={analysisState === AnalysisState.UPLOADING}
              />
              
              {/* Tips */}
              <div className="mt-6">
                <h3 className="text-lg font-medium mb-2">Tips for best results:</h3>
                <ul className="text-gray-300 space-y-2 pl-4">
                  <li className="flex items-start">
                    <i className="fas fa-check-circle text-[#4CAF50] mt-1 mr-2"></i>
                    <span>Make sure price action is clearly visible</span>
                  </li>
                  <li className="flex items-start">
                    <i className="fas fa-check-circle text-[#4CAF50] mt-1 mr-2"></i>
                    <span>Include relevant indicators (if any)</span>
                  </li>
                  <li className="flex items-start">
                    <i className="fas fa-check-circle text-[#4CAF50] mt-1 mr-2"></i>
                    <span>Ensure timeframe is visible in screenshot</span>
                  </li>
                  <li className="flex items-start">
                    <i className="fas fa-exclamation-circle text-[#F39C12] mt-1 mr-2"></i>
                    <span>Crop out unnecessary elements</span>
                  </li>
                </ul>
              </div>

              {/* Sample Images */}
              <div className="mt-6">
                <h3 className="flex items-center justify-between text-lg font-medium mb-3">
                  <span>Sample Images</span>
                  <button className="text-sm text-[#E64A4A] hover:underline">View All</button>
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {sampleImages.map((image) => (
                    <div 
                      key={image.id}
                      className="aspect-w-16 aspect-h-9 bg-[#333333] rounded-md overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => {
                        toast({
                          title: "Sample Selected",
                          description: `Loading ${image.name} sample chart`,
                        });
                        // In a real implementation, this would fetch the sample image
                        // and process it just like an uploaded image
                      }}
                    >
                      <img
                        src={image.imageUrl}
                        alt={`Sample ${image.name} chart`}
                        className="object-cover w-full h-full"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Analysis Section */}
        <div className="col-span-1 lg:col-span-2">
          {analysisState === AnalysisState.INITIAL && (
            <Card className="bg-[#1E1E1E] border-[#2D2D2D] shadow-lg h-96 flex items-center justify-center">
              <CardContent className="text-center pt-6">
                <i className="fas fa-cloud-upload-alt text-4xl text-gray-400 mb-4"></i>
                <h3 className="text-xl font-medium">Upload a chart to begin analysis</h3>
                <p className="text-gray-400 mt-2 max-w-md">
                  We'll analyze your chart for patterns, indicators, and provide entry/exit recommendations
                </p>
              </CardContent>
            </Card>
          )}

          {(analysisState === AnalysisState.UPLOADING || analysisState === AnalysisState.ANALYZING) && (
            <Card className="bg-[#1E1E1E] border-[#2D2D2D] shadow-lg">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-16">
                  <LoadingIndicator progress={analysisProgress} />
                  
                  <h3 className="text-xl font-medium mt-6">
                    {analysisState === AnalysisState.UPLOADING ? 'Uploading your chart...' : 'Analyzing your chart...'}
                  </h3>
                  <p className="text-gray-400 mt-2 text-center max-w-md">
                    {analysisState === AnalysisState.UPLOADING 
                      ? 'Please wait while we upload your chart...'
                      : 'Our AI is analyzing patterns, indicators, and market conditions'}
                  </p>
                  
                  <div className="w-full max-w-md mt-8">
                    <ProgressSteps steps={getProgressSteps()} />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {analysisState === AnalysisState.ERROR && (
            <Card className="bg-[#1E1E1E] border-[#2D2D2D] shadow-lg">
              <CardContent className="pt-6">
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mb-4">
                    <i className="fas fa-exclamation-triangle text-red-500 text-xl"></i>
                  </div>
                  <h3 className="text-xl font-medium">Analysis Failed</h3>
                  <p className="text-gray-400 mt-2 text-center max-w-md">
                    We encountered an error processing your chart. Please try again with a different image.
                  </p>
                  <button
                    className="mt-6 px-4 py-2 bg-[#E64A4A] hover:bg-opacity-80 rounded-lg transition-colors font-medium"
                    onClick={() => setAnalysisState(AnalysisState.INITIAL)}
                  >
                    Try Again
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {analysisState === AnalysisState.COMPLETE && analysisResult && (
            <AnalysisResult 
              analysis={analysisResult} 
              imageUrl={uploadedImageUrl} 
              onReanalyze={handleReanalyze}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default Analysis;
