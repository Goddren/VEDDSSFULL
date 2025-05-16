import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'wouter';
import { ChartAnalysis } from '@shared/schema';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, TrendingUp, TrendingDown, AlertTriangle, BarChart2, LineChart, Share2, Check } from 'lucide-react';
import { getConfidenceColor, getDirectionColor, normalizeImageUrl } from '@/lib/utils';
import { NewsAlert, NewsEvent } from '@/components/ui/news-alert';
import { getNewsForSymbol } from '@/lib/news-service';
import { useToast } from '@/hooks/use-toast';
import ShareAnalysis from '@/components/charts/share-analysis';
import VolatilityMeter from '@/components/charts/volatility-meter';
import { calculateVolatilityScore } from '@/lib/analysis-utils';
import { apiRequest } from '@/lib/queryClient';
import { InteractiveInsightTooltip } from '@/components/ui/interactive-insight-tooltip';
import { ChartInsightsPanel } from '@/components/market-insights/chart-insights-panel';
import { MarketMoodDisplay } from '@/components/market/market-mood-display';

const AnalysisDetail: React.FC = () => {
  const { id } = useParams();
  const analysisId = parseInt(id as string);
  const { toast } = useToast();
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [showShareModal, setShowShareModal] = useState<boolean>(false);

  const { data: analysis, isLoading, isError } = useQuery<ChartAnalysis>({
    queryKey: [`/api/analyses/${analysisId}`],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/analyses/${analysisId}`);
      return res.json();
    },
    enabled: !isNaN(analysisId)
  });
  
  // Fetch relevant news when analysis data is available
  useEffect(() => {
    if (analysis?.symbol) {
      // Get news related to the currency pair
      const symbolNews = getNewsForSymbol(analysis.symbol);
      setNewsEvents(symbolNews);
      
      // Show a notification if there are high impact news events
      const highImpactNews = symbolNews.filter(news => news.impact === 'high');
      if (highImpactNews.length > 0) {
        toast({
          title: "Important Market News Detected",
          description: `There ${highImpactNews.length === 1 ? 'is' : 'are'} ${highImpactNews.length} high-impact news event${highImpactNews.length === 1 ? '' : 's'} that may affect your ${analysis.symbol} trading signal.`,
          variant: "default",
        });
      }
    }
  }, [analysis?.symbol, toast]);

  if (isNaN(analysisId)) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-red-500" />
        <h1 className="text-2xl font-bold mb-4">Invalid Analysis ID</h1>
        <p className="mb-8 text-muted-foreground">
          The analysis ID provided is not valid.
        </p>
        <Link to="/historical">
          <Button>View All Analyses</Button>
        </Link>
      </div>
    );
  }

  if (isLoading) {
    return <AnalysisDetailSkeleton />;
  }

  if (isError || !analysis) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <AlertTriangle className="h-16 w-16 mx-auto mb-4 text-red-500" />
        <h1 className="text-2xl font-bold mb-4">Analysis Not Found</h1>
        <p className="mb-8 text-muted-foreground">
          The analysis you're looking for could not be found or you don't have permission to view it.
        </p>
        <Link to="/historical">
          <Button>View All Analyses</Button>
        </Link>
      </div>
    );
  }

  // Format date for display
  const formattedDate = new Date(analysis.createdAt).toLocaleString();
  
  // Parse JSON fields if they're stored as strings
  const patterns = typeof analysis.patterns === 'string' 
    ? JSON.parse(analysis.patterns as string) 
    : analysis.patterns;
    
  const indicators = typeof analysis.indicators === 'string' 
    ? JSON.parse(analysis.indicators as string) 
    : analysis.indicators;
    
  const supportResistance = typeof analysis.supportResistance === 'string' 
    ? JSON.parse(analysis.supportResistance as string) 
    : analysis.supportResistance;

  // Direction icon based on buy/sell
  const DirectionIcon = analysis.direction.toLowerCase() === 'buy' 
    ? TrendingUp 
    : TrendingDown;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <Link to="/historical">
            <Button variant="ghost" size="sm" className="mb-4">
              <ChevronLeft className="mr-1 h-4 w-4" />
              Back to Analysis History
            </Button>
          </Link>
          
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold">
                  {analysis.symbol || 'Unknown Symbol'}
                </h1>
                <Badge className={getDirectionColor(analysis.direction)}>
                  {analysis.direction}
                </Badge>
                <Badge variant="outline">
                  {analysis.timeframe || 'Unknown Timeframe'}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">Analyzed on {formattedDate}</p>
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-gray-400 bg-gray-900/50">
                {analysis.price ? `Price: ${analysis.price}` : 'Price not available'}
              </Badge>
              <Badge variant="outline" className={getConfidenceColor(analysis.confidence)}>
                {analysis.confidence} Confidence
              </Badge>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setShowShareModal(true)}
                className="flex gap-1 items-center ml-1"
              >
                <Share2 className="h-4 w-4" />
                Share
              </Button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          <Card className="lg:col-span-2">
            <CardContent className="p-0 overflow-hidden">
              <img 
                src={normalizeImageUrl(analysis.imageUrl)} 
                alt={`${analysis.symbol || 'Chart'} analysis`}
                className="w-full h-auto object-contain border-b border-border"
                onError={(e) => {
                  console.error("Image failed to load:", analysis.imageUrl);
                  e.currentTarget.src = "https://placehold.co/600x400/black/gray?text=Chart+Image+Unavailable";
                }}
              />
              <div className="p-6">
                <h2 className="text-xl font-bold mb-4">Recommendation</h2>
                <div className="flex items-start gap-3 mb-6">
                  <div className="bg-primary/10 p-2 rounded-full">
                    <DirectionIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium">
                      <InteractiveInsightTooltip 
                        type={analysis.trend?.toLowerCase().includes('bullish') ? 'bullish' : 
                              analysis.trend?.toLowerCase().includes('bearish') ? 'bearish' : 'neutral'}
                        title={`${analysis.trend} Market Trend`}
                        description="AI-detected trend based on price action, market structure, and momentum indicators."
                        context="trend"
                      >
                        {analysis.trend} trend detected
                      </InteractiveInsightTooltip>
                    </p>
                    <p className="text-muted-foreground">
                      {analysis.recommendation || 'No specific recommendation available'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-md font-semibold mb-2">Entry/Exit Strategy</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Entry Point:</span>
                        <span className="font-medium">{analysis.entryPoint}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Exit Point:</span>
                        <span className="font-medium">{analysis.exitPoint}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Stop Loss:</span>
                        <span className="font-medium">{analysis.stopLoss}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Take Profit:</span>
                        <span className="font-medium">{analysis.takeProfit}</span>
                      </div>
                    </div>
                  </div>
                  
                  <div>
                    <h3 className="text-md font-semibold mb-2">Risk Assessment</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Risk/Reward Ratio:</span>
                        <span className="font-medium">{analysis.riskRewardRatio || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Potential Pips:</span>
                        <span className="font-medium">{analysis.potentialPips || 'N/A'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Confidence:</span>
                        <InteractiveInsightTooltip
                          type={analysis.confidence?.toLowerCase() === 'high' ? 'bullish' : 
                                analysis.confidence?.toLowerCase() === 'low' ? 'bearish' : 'neutral'}
                          title={`${analysis.confidence} Signal Confidence`}
                          description="AI confidence score based on pattern clarity, indicator alignment, and historical accuracy."
                          context="indicator"
                        >
                          <span className={`font-medium ${getConfidenceColor(analysis.confidence || 'Medium', false)}`}>
                            {analysis.confidence}
                          </span>
                        </InteractiveInsightTooltip>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <div className="space-y-6">
            <MarketMoodDisplay
              trend={analysis.trend || ''}
              symbol={analysis.symbol || ''}
              timeframe={analysis.timeframe || ''}
              volatility={0.5} // Default to medium volatility
            />
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold">Chart Patterns</h2>
                </div>
                
                {patterns && patterns.length > 0 ? (
                  <div className="space-y-4">
                    {patterns.map((pattern: any, index: number) => (
                      <div key={index} className="border-b border-border pb-3 last:border-0 last:pb-0">
                        <div className="flex justify-between mb-1">
                          <InteractiveInsightTooltip
                            type={pattern.type?.toLowerCase().includes('bullish') ? 'bullish' : 
                                 pattern.type?.toLowerCase().includes('bearish') ? 'bearish' : 'neutral'}
                            title={pattern.name}
                            description={pattern.description}
                            context="pattern"
                          >
                            <span className="font-medium cursor-help">{pattern.name}</span>
                          </InteractiveInsightTooltip>
                          <Badge variant="outline">{pattern.type}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mb-1">{pattern.description}</p>
                        <div className="text-xs flex items-center gap-1">
                          <span>Strength:</span>
                          <Badge variant="outline" className="text-xs">
                            {pattern.strength}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No patterns detected</p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <LineChart className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold">Technical Indicators</h2>
                </div>
                
                {indicators && indicators.length > 0 ? (
                  <div className="space-y-4">
                    {indicators.map((indicator: any, index: number) => (
                      <div key={index} className="border-b border-border pb-3 last:border-0 last:pb-0">
                        <div className="flex justify-between mb-1">
                          <InteractiveInsightTooltip
                            type={indicator.signal?.toLowerCase().includes('buy') ? 'bullish' : 
                                  indicator.signal?.toLowerCase().includes('sell') ? 'bearish' : 
                                  indicator.signal?.toLowerCase().includes('neutral') ? 'neutral' : 'volatile'}
                            title={indicator.name}
                            description={indicator.details || `${indicator.name} indicator with ${indicator.signal} signal`}
                            context="indicator"
                          >
                            <span className="font-medium cursor-help">{indicator.name}</span>
                          </InteractiveInsightTooltip>
                          <Badge 
                            variant="outline" 
                            className={
                              indicator.signal?.toLowerCase().includes('buy') ? 'text-green-500' :
                              indicator.signal?.toLowerCase().includes('sell') ? 'text-red-500' : 
                              'text-yellow-500'
                            }
                          >
                            {indicator.signal}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {indicator.details || 'No details available'}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No indicators analyzed</p>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {supportResistance && supportResistance.length > 0 && (
          <Card className="mb-6">
            <CardContent className="p-6">
              <h2 className="text-xl font-bold mb-4">Support & Resistance Levels</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                {supportResistance.map((level: any, index: number) => (
                  <div key={index} className="bg-card/50 p-4 rounded-lg border border-border">
                    <div className="flex justify-between mb-2">
                      <InteractiveInsightTooltip
                        type={level.type?.toLowerCase().includes('support') ? 'bullish' : 'bearish'}
                        title={`${level.type} Level`}
                        description={`${level.type} at ${level.level} with ${level.strength} strength. ${level.type?.toLowerCase().includes('support') ? 'Price tends to bounce up from this level.' : 'Price tends to bounce down from this level.'}`}
                        context={level.type?.toLowerCase().includes('support') ? 'support' : 'resistance'}
                      >
                        <span className="font-medium cursor-help">{level.type}</span>
                      </InteractiveInsightTooltip>
                      <Badge variant="outline">{level.strength}</Badge>
                    </div>
                    <div className="text-xl font-bold">{level.level}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Chart Insights Panel with interactive tooltips */}
        <ChartInsightsPanel
          trend={analysis.trend || ''}
          confidence={analysis.confidence || ''}
          patterns={patterns && patterns.length > 0 ? patterns.map((p: any) => p.name) : []}
          timeframe={analysis.timeframe || ''}
          symbol={analysis.symbol || ''}
          direction={analysis.direction || ''}
          entryPoint={analysis.entryPoint || ''}
          exitPoint={analysis.exitPoint || ''}
          className="mb-6"
        />
        
        {/* Volatility Meter */}
        <div className="mb-6">
          <VolatilityMeter 
            volatility={calculateVolatilityScore(analysis)}
            symbol={analysis.symbol || 'Unknown'} 
            direction={analysis.direction} 
          />
        </div>
        
        {/* News Alerts Section */}
        {newsEvents.length > 0 && (
          <NewsAlert 
            symbol={analysis.symbol || ''} 
            news={newsEvents}
            className="mb-6"
          />
        )}

        <div className="text-center mt-8">
          <p className="text-sm text-muted-foreground mb-4">
            Trading involves risk. This analysis is for informational purposes only and should not be considered financial advice.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            {!analysis.isPublic && (
              <Button 
                onClick={async () => {
                  try {
                    // Check subscription limits before sharing
                    const limitResponse = await apiRequest('POST', '/api/subscription/check-limits', {
                      actionType: 'social_share'
                    });
                    const limitResult = await limitResponse.json();
                    
                    if (!limitResult.allowed) {
                      toast({
                        title: "Subscription Limit Reached",
                        description: `You've reached your monthly limit of ${limitResult.limit} social shares on your ${limitResult.planName} plan. Please upgrade to continue sharing analyses.`,
                        variant: "destructive",
                      });
                      return;
                    }
                    
                    // Social publishing has been removed
                    await apiRequest('POST', `/api/analyses/${analysisId}/share`, {
                      notes: "Shared publicly"
                    });
                    toast({
                      title: "Success!",
                      description: "Your analysis has been shared publicly.",
                      variant: "default",
                    });
                    // Refresh data
                    window.location.reload();
                  } catch (error) {
                    console.error('Error sharing analysis:', error);
                    toast({
                      title: "Error",
                      description: error instanceof Error ? error.message : "Failed to share this analysis. Please try again.",
                      variant: "destructive",
                    });
                  }
                }}
                className="w-full sm:w-auto"
                variant="secondary"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share Analysis
              </Button>
            )}
            {analysis.isPublic && (
              <Button 
                variant="outline" 
                className="w-full sm:w-auto"
                disabled
              >
                <Check className="mr-2 h-4 w-4 text-green-500" />
                Analysis Shared
              </Button>
            )}
            <Link to="/analysis" className="w-full sm:w-auto">
              <Button className="w-full">
                Analyze a New Chart
              </Button>
            </Link>
          </div>
        </div>
        
        {/* Share Modal */}
        {showShareModal && analysis && (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="max-w-md w-full">
              <ShareAnalysis 
                analysis={analysis} 
                onClose={() => setShowShareModal(false)} 
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Skeleton loader for the analysis detail page
const AnalysisDetailSkeleton: React.FC = () => (
  <div className="container mx-auto px-4 py-8">
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Skeleton className="h-10 w-40 mb-4" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3">
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-20" />
              <Skeleton className="h-6 w-32" />
            </div>
            <Skeleton className="h-5 w-64 mt-2" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="lg:col-span-2">
          <CardContent className="p-0">
            <Skeleton className="w-full h-[400px]" />
            <div className="p-6">
              <Skeleton className="h-8 w-48 mb-4" />
              <Skeleton className="h-24 w-full mb-6" />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Skeleton className="h-6 w-40 mb-4" />
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                </div>
                
                <div>
                  <Skeleton className="h-6 w-40 mb-4" />
                  <div className="space-y-3">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-full" />
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <div className="space-y-6">
          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-6 w-40 mb-4" />
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <Skeleton className="h-6 w-48 mb-4" />
              <div className="space-y-4">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </div>
);

export default AnalysisDetail;