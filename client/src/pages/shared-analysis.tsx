import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ChartAnalysis } from '@shared/schema';
import { ChartAnalysisResponse } from '@shared/types';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { convertToChartAnalysisResponse, calculateVolatilityScore } from '@/lib/analysis-utils';
import AnalysisResult from '@/components/charts/analysis-result';
import ChartAnnotator from '@/components/charts/chart-annotator';
import { Card } from '@/components/ui/card';
import { Loader2, Share2, Link as LinkIcon, Info, Terminal, ArrowLeft, Pencil, Image } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'wouter';
import VolatilityMeter from '@/components/charts/volatility-meter';

const SharedAnalysisPage: React.FC = () => {
  const { shareId } = useParams();
  const [_, navigate] = useLocation();
  const { user } = useAuth();
  const [copySuccess, setCopySuccess] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState<boolean>(true);

  const { data: analysis, isLoading, error } = useQuery<ChartAnalysis, Error>({
    queryKey: [`/api/shared/${shareId}`],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/shared/${shareId}`);
      if (!res.ok) {
        throw new Error('Shared analysis not found');
      }
      return await res.json();
    },
    retry: false
  });

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center">
          <Loader2 className="animate-spin h-12 w-12 text-[#E64A4A] mb-4" />
          <p className="text-gray-400">Loading shared analysis...</p>
        </div>
      </div>
    );
  }

  if (error || !analysis) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-8 max-w-md">
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <Info className="h-8 w-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Analysis Not Found</h2>
            <p className="text-gray-400 mb-6">
              This shared analysis may have been removed or the link is invalid.
            </p>
            <Button 
              onClick={() => navigate('/')}
              className="bg-[#E64A4A] hover:bg-[#D63A3A] text-white"
            >
              Return to Home
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl px-4 py-8">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/')}
            className="mr-2 h-10 w-10 rounded-full hover:bg-[#333333]"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-bold flex items-center">
            <Share2 className="h-6 w-6 mr-2 text-[#E64A4A]" />
            Shared Chart Analysis
          </h1>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={copyToClipboard}
            className="border-[#333333] hover:bg-[#333333]"
          >
            {copySuccess ? (
              <>
                <Terminal className="mr-2 h-4 w-4" />
                Copied!
              </>
            ) : (
              <>
                <LinkIcon className="mr-2 h-4 w-4" />
                Copy Link
              </>
            )}
          </Button>
          {user && (
            <Button
              variant="default"
              onClick={() => navigate('/')}
              className="bg-[#E64A4A] hover:bg-[#D63A3A]"
            >
              Analyze Your Own Chart
            </Button>
          )}
        </div>
      </div>

      {analysis.notes && (
        <Card className="mb-6 p-4 bg-[#0A0A0A] border-[#333333]">
          <h3 className="text-lg font-medium mb-2 flex items-center">
            <Terminal className="h-5 w-5 mr-2 text-[#E64A4A]" />
            Trading Notes
          </h3>
          <p className="text-gray-300 whitespace-pre-wrap">{analysis.notes}</p>
        </Card>
      )}

      <div className="animate-in fade-in-50 duration-500">
        {/* Volatility Meter */}
        <div className="mb-6">
          <VolatilityMeter 
            volatility={calculateVolatilityScore(analysis)}
            symbol={analysis.symbol || 'Unknown'} 
            direction={analysis.direction}
          />
        </div>
        
        {/* Chart with trade signals */}
        <Card className="mb-6 overflow-hidden">
          {/* Chart toggle controls */}
          <div className="flex items-center justify-end gap-2 p-2 border-b border-[#333333] bg-black/5">
            <div className="flex items-center gap-2">
              <Image className="h-4 w-4 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Original</span>
            </div>
            <Switch 
              checked={showAnnotations} 
              onCheckedChange={setShowAnnotations}
              className="mx-2"
            />
            <div className="flex items-center gap-2">
              <Pencil className="h-4 w-4 text-[#E64A4A]" />
              <span className="text-xs text-muted-foreground">Annotated</span>
            </div>
          </div>
          
          {showAnnotations ? (
            <ChartAnnotator
              analysis={convertToChartAnalysisResponse(analysis)}
              imageUrl={analysis.imageUrl 
                ? (analysis.imageUrl.startsWith('http') 
                  ? analysis.imageUrl 
                  : `/api/shared-image/${analysis.imageUrl.split('/').pop()}`) 
                : ''}
              className="w-full"
            />
          ) : (
            <div className="relative">
              <img 
                src={analysis.imageUrl 
                  ? (analysis.imageUrl.startsWith('http') 
                    ? analysis.imageUrl 
                    : `/api/shared-image/${analysis.imageUrl.split('/').pop()}`) 
                  : ''}
                alt={`${analysis.symbol || 'Chart'} analysis`}
                className="w-full h-auto object-contain"
              />
              <div className="absolute top-3 right-3 bg-black/70 text-white text-xs px-3 py-1 rounded-full">
                Original Chart
              </div>
            </div>
          )}
        </Card>
        
        {/* Original analysis result for detailed info */}
        <AnalysisResult
          analysis={convertToChartAnalysisResponse(analysis)}
          imageUrl={analysis.imageUrl 
            ? (analysis.imageUrl.startsWith('http') 
              ? analysis.imageUrl 
              : `/api/shared-image/${analysis.imageUrl.split('/').pop()}`) 
            : ''}
          onReanalyze={() => {}}
        />
      </div>

      {!user && (
        <div className="mt-8 p-6 border border-[#333333] rounded-lg bg-gradient-to-r from-[#1A1A1A] to-[#0A0A0A]">
          <div className="flex flex-col md:flex-row items-center justify-between">
            <div className="mb-4 md:mb-0">
              <h3 className="text-xl font-bold mb-2">Want to analyze your own charts?</h3>
              <p className="text-gray-400">
                Sign up now to get AI-powered chart analysis and trading insights.
              </p>
            </div>
            <div className="flex gap-3">
              <Link href="/auth">
                <Button variant="outline" className="border-[#333333] hover:bg-[#333333]">
                  Log In
                </Button>
              </Link>
              <Link href="/auth">
                <Button className="bg-[#E64A4A] hover:bg-[#D63A3A]">
                  Sign Up Free
                </Button>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedAnalysisPage;