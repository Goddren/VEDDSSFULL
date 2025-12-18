import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Lightbulb,
  TrendingUp,
  TrendingDown,
  Target,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  BarChart3,
  Percent,
  ArrowRight,
  Sparkles,
  History,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import type { ScenarioAnalysis } from '@shared/schema';

interface ScenarioOutcome {
  scenario: string;
  probability: number;
  priceTarget?: string;
  reasoning: string;
}

interface ScenarioResult {
  success: boolean;
  id: number;
  outcomes: ScenarioOutcome[];
  recommendation: string;
  riskAssessment: string;
  profitPotential: string;
  bestCase: {
    scenario: string;
    probability: number;
    potentialGain: string;
  };
  worstCase: {
    scenario: string;
    probability: number;
    potentialLoss: string;
  };
  mostLikely: {
    scenario: string;
    probability: number;
    expectedOutcome: string;
  };
}

export default function WhatIfAnalysisPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('price_target');
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [linkedAnalysis, setLinkedAnalysis] = useState(false);
  
  const [formData, setFormData] = useState({
    symbol: '',
    currentPrice: '',
    entryPrice: '',
    stopLoss: '',
    takeProfit: '',
    positionSize: '1.0',
    stopLossLevels: '',
    trend: 'bullish',
    volatility: 'normal',
    newsType: 'economic',
    shortTermBias: '',
    mediumTermBias: '',
    longTermBias: '',
    positionType: 'swing',
    patterns: '',
    trendDirection: 'bullish',
    description: '',
    hypothesis: ''
  });

  // Read URL params on mount to pre-fill form from chart analysis
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const symbol = params.get('symbol');
    const currentPrice = params.get('currentPrice');
    
    if (symbol && currentPrice) {
      setLinkedAnalysis(true);
      setFormData({
        symbol: symbol || '',
        currentPrice: currentPrice || '',
        entryPrice: params.get('entryPrice') || '',
        stopLoss: params.get('stopLoss') || '',
        takeProfit: params.get('takeProfit') || '',
        positionSize: '1.0',
        stopLossLevels: '',
        trend: params.get('trend') || 'bullish',
        volatility: 'normal',
        newsType: 'economic',
        shortTermBias: '',
        mediumTermBias: '',
        longTermBias: '',
        positionType: 'swing',
        patterns: params.get('patterns') || '',
        trendDirection: params.get('trend') || 'bullish',
        description: '',
        hypothesis: ''
      });
    }
  }, []);

  const { data: pastScenarios, isLoading: loadingHistory } = useQuery<ScenarioAnalysis[]>({
    queryKey: ['/api/scenario-analysis'],
    enabled: !!user
  });

  const analyzeMutation = useMutation({
    mutationFn: async (data: { scenarioType: string; scenarioParams: any }) => {
      const response = await apiRequest('POST', '/api/scenario-analysis', {
        symbol: formData.symbol,
        currentPrice: formData.currentPrice,
        scenarioType: data.scenarioType,
        scenarioParams: data.scenarioParams
      });
      return response.json();
    },
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['/api/scenario-analysis'] });
      toast({
        title: 'Analysis Complete',
        description: 'Your What If scenario has been analyzed.'
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Analysis Failed',
        description: error.message || 'Failed to analyze scenario',
        variant: 'destructive'
      });
    }
  });

  const handleAnalyze = () => {
    if (!formData.symbol || !formData.currentPrice) {
      toast({
        title: 'Missing Information',
        description: 'Please enter the symbol and current price',
        variant: 'destructive'
      });
      return;
    }

    let scenarioParams: any = {};

    switch (activeTab) {
      case 'price_target':
        scenarioParams = {
          entryPrice: formData.entryPrice || formData.currentPrice,
          stopLoss: formData.stopLoss,
          takeProfit: formData.takeProfit,
          positionSize: formData.positionSize
        };
        break;
      case 'stop_loss':
        scenarioParams = {
          stopLossLevels: formData.stopLossLevels.split(',').map(s => s.trim()).filter(Boolean),
          trend: formData.trend,
          volatility: formData.volatility
        };
        break;
      case 'news_impact':
        scenarioParams = {
          newsType: formData.newsType,
          historicalVolatility: formData.volatility
        };
        break;
      case 'timeframe':
        scenarioParams = {
          shortTermBias: formData.shortTermBias,
          mediumTermBias: formData.mediumTermBias,
          longTermBias: formData.longTermBias,
          positionType: formData.positionType
        };
        break;
      case 'market_condition':
        scenarioParams = {
          patterns: formData.patterns.split(',').map(s => s.trim()).filter(Boolean),
          trendDirection: formData.trendDirection
        };
        break;
      case 'custom':
        scenarioParams = {
          description: formData.description,
          hypothesis: formData.hypothesis
        };
        break;
    }

    analyzeMutation.mutate({
      scenarioType: activeTab,
      scenarioParams
    });
  };

  const getRiskColor = (risk: string) => {
    if (risk?.toLowerCase().includes('low')) return 'text-green-400';
    if (risk?.toLowerCase().includes('high')) return 'text-red-400';
    return 'text-yellow-400';
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-950 py-8 px-4">
      <div className="container mx-auto max-w-6xl">
        <div className="text-center mb-8">
          <Badge className="mb-4 bg-purple-500/20 text-purple-400 border-purple-500/30">
            AI-Powered Analysis
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4" data-testid="text-whatif-title">
            What If Scenario Analysis
          </h1>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Explore different trading scenarios and get AI-powered probability assessments 
            to make more informed decisions.
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-yellow-400" />
                  Create Scenario
                </CardTitle>
                <CardDescription>
                  Enter your trade details and explore different what-if scenarios
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {linkedAnalysis && (
                  <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-amber-400 shrink-0" />
                    <div>
                      <p className="text-amber-300 font-medium text-sm">Linked from Chart Analysis</p>
                      <p className="text-amber-400/70 text-xs">
                        Data pre-filled from your {formData.symbol} analysis. You can modify any values before running the scenario.
                      </p>
                    </div>
                  </div>
                )}
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="symbol">Symbol / Pair</Label>
                    <Input
                      id="symbol"
                      placeholder="e.g., EUR/USD, BTC/USDT, AAPL"
                      value={formData.symbol}
                      onChange={(e) => setFormData({ ...formData, symbol: e.target.value })}
                      data-testid="input-symbol"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="currentPrice">Current Price</Label>
                    <Input
                      id="currentPrice"
                      placeholder="e.g., 1.0850"
                      value={formData.currentPrice}
                      onChange={(e) => setFormData({ ...formData, currentPrice: e.target.value })}
                      data-testid="input-current-price"
                    />
                  </div>
                </div>

                <Separator />

                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <TabsList className="grid grid-cols-3 lg:grid-cols-6 gap-1">
                    <TabsTrigger value="price_target" className="text-xs">Price Target</TabsTrigger>
                    <TabsTrigger value="stop_loss" className="text-xs">Stop Loss</TabsTrigger>
                    <TabsTrigger value="news_impact" className="text-xs">News Impact</TabsTrigger>
                    <TabsTrigger value="timeframe" className="text-xs">Timeframe</TabsTrigger>
                    <TabsTrigger value="market_condition" className="text-xs">Market</TabsTrigger>
                    <TabsTrigger value="custom" className="text-xs">Custom</TabsTrigger>
                  </TabsList>

                  <TabsContent value="price_target" className="space-y-4 mt-4">
                    <p className="text-sm text-gray-400">
                      Analyze the probability of reaching your price targets based on entry, stop loss, and take profit levels.
                    </p>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Entry Price</Label>
                        <Input
                          placeholder="Entry price"
                          value={formData.entryPrice}
                          onChange={(e) => setFormData({ ...formData, entryPrice: e.target.value })}
                          data-testid="input-entry-price"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Stop Loss</Label>
                        <Input
                          placeholder="Stop loss price"
                          value={formData.stopLoss}
                          onChange={(e) => setFormData({ ...formData, stopLoss: e.target.value })}
                          data-testid="input-stop-loss"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Take Profit</Label>
                        <Input
                          placeholder="Take profit price"
                          value={formData.takeProfit}
                          onChange={(e) => setFormData({ ...formData, takeProfit: e.target.value })}
                          data-testid="input-take-profit"
                        />
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="stop_loss" className="space-y-4 mt-4">
                    <p className="text-sm text-gray-400">
                      Compare different stop loss levels to find optimal placement.
                    </p>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Stop Loss Levels (comma-separated)</Label>
                        <Input
                          placeholder="e.g., 1.0800, 1.0780, 1.0750"
                          value={formData.stopLossLevels}
                          onChange={(e) => setFormData({ ...formData, stopLossLevels: e.target.value })}
                        />
                      </div>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Current Trend</Label>
                          <Select value={formData.trend} onValueChange={(v) => setFormData({ ...formData, trend: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="bullish">Bullish</SelectItem>
                              <SelectItem value="bearish">Bearish</SelectItem>
                              <SelectItem value="ranging">Ranging</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Volatility</Label>
                          <Select value={formData.volatility} onValueChange={(v) => setFormData({ ...formData, volatility: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="low">Low</SelectItem>
                              <SelectItem value="normal">Normal</SelectItem>
                              <SelectItem value="high">High</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="news_impact" className="space-y-4 mt-4">
                    <p className="text-sm text-gray-400">
                      Analyze how different news outcomes could affect your trade.
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>News Type</Label>
                        <Select value={formData.newsType} onValueChange={(v) => setFormData({ ...formData, newsType: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="economic">Economic Data (NFP, CPI, etc.)</SelectItem>
                            <SelectItem value="central_bank">Central Bank Decision</SelectItem>
                            <SelectItem value="earnings">Earnings Report</SelectItem>
                            <SelectItem value="geopolitical">Geopolitical Event</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Historical Volatility</Label>
                        <Select value={formData.volatility} onValueChange={(v) => setFormData({ ...formData, volatility: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="low">Low</SelectItem>
                            <SelectItem value="normal">Normal</SelectItem>
                            <SelectItem value="high">High</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="timeframe" className="space-y-4 mt-4">
                    <p className="text-sm text-gray-400">
                      Analyze trade outcomes across different timeframes.
                    </p>
                    <div className="grid md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Short-term Bias (1-4 hours)</Label>
                        <Input
                          placeholder="e.g., bullish continuation"
                          value={formData.shortTermBias}
                          onChange={(e) => setFormData({ ...formData, shortTermBias: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Medium-term Bias (1-5 days)</Label>
                        <Input
                          placeholder="e.g., range-bound"
                          value={formData.mediumTermBias}
                          onChange={(e) => setFormData({ ...formData, mediumTermBias: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Long-term Bias (1-4 weeks)</Label>
                        <Input
                          placeholder="e.g., bearish reversal"
                          value={formData.longTermBias}
                          onChange={(e) => setFormData({ ...formData, longTermBias: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Position Type</Label>
                        <Select value={formData.positionType} onValueChange={(v) => setFormData({ ...formData, positionType: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="scalp">Scalp (minutes)</SelectItem>
                            <SelectItem value="day">Day Trade (hours)</SelectItem>
                            <SelectItem value="swing">Swing Trade (days)</SelectItem>
                            <SelectItem value="position">Position (weeks)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="market_condition" className="space-y-4 mt-4">
                    <p className="text-sm text-gray-400">
                      Analyze how different market conditions could affect your trade.
                    </p>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Identified Patterns (comma-separated)</Label>
                        <Input
                          placeholder="e.g., Head and Shoulders, Double Top"
                          value={formData.patterns}
                          onChange={(e) => setFormData({ ...formData, patterns: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Expected Trend Direction</Label>
                        <Select value={formData.trendDirection} onValueChange={(v) => setFormData({ ...formData, trendDirection: v })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bullish">Bullish</SelectItem>
                            <SelectItem value="bearish">Bearish</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="custom" className="space-y-4 mt-4">
                    <p className="text-sm text-gray-400">
                      Describe your custom scenario for AI analysis.
                    </p>
                    <div className="space-y-4">
                      <div className="space-y-2">
                        <Label>Scenario Description</Label>
                        <Textarea
                          placeholder="Describe your trading scenario in detail..."
                          value={formData.description}
                          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                          rows={3}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Your Hypothesis</Label>
                        <Textarea
                          placeholder="What do you think will happen and why?"
                          value={formData.hypothesis}
                          onChange={(e) => setFormData({ ...formData, hypothesis: e.target.value })}
                          rows={2}
                        />
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </CardContent>
              <CardFooter>
                <Button 
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  onClick={handleAnalyze}
                  disabled={analyzeMutation.isPending}
                  data-testid="button-analyze"
                >
                  {analyzeMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing Scenarios...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 mr-2" />
                      Analyze What If Scenario
                    </>
                  )}
                </Button>
              </CardFooter>
            </Card>

            {result && (
              <Card className="bg-gray-900/50 border-gray-800">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-purple-400" />
                    Scenario Analysis Results
                  </CardTitle>
                  <CardDescription>
                    AI-powered probability assessment for your trading scenario
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid md:grid-cols-3 gap-4">
                    <Card className="bg-green-500/10 border-green-500/30">
                      <CardContent className="p-4 text-center">
                        <TrendingUp className="w-8 h-8 text-green-400 mx-auto mb-2" />
                        <h4 className="text-sm font-medium text-green-400 mb-1">Best Case</h4>
                        <p className="text-lg font-bold text-green-300">{result.bestCase?.potentialGain || 'N/A'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {result.bestCase?.probability}% probability
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{result.bestCase?.scenario}</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-blue-500/10 border-blue-500/30">
                      <CardContent className="p-4 text-center">
                        <Target className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                        <h4 className="text-sm font-medium text-blue-400 mb-1">Most Likely</h4>
                        <p className="text-lg font-bold text-blue-300">{result.mostLikely?.expectedOutcome || 'N/A'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {result.mostLikely?.probability}% probability
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{result.mostLikely?.scenario}</p>
                      </CardContent>
                    </Card>

                    <Card className="bg-red-500/10 border-red-500/30">
                      <CardContent className="p-4 text-center">
                        <TrendingDown className="w-8 h-8 text-red-400 mx-auto mb-2" />
                        <h4 className="text-sm font-medium text-red-400 mb-1">Worst Case</h4>
                        <p className="text-lg font-bold text-red-300">{result.worstCase?.potentialLoss || 'N/A'}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {result.worstCase?.probability}% probability
                        </p>
                        <p className="text-xs text-gray-500 mt-2">{result.worstCase?.scenario}</p>
                      </CardContent>
                    </Card>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h4 className="font-medium flex items-center gap-2">
                      <Percent className="w-4 h-4 text-purple-400" />
                      Outcome Probabilities
                    </h4>
                    <div className="space-y-3">
                      {result.outcomes?.map((outcome, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-300">{outcome.scenario}</span>
                            <span className="text-purple-400">{outcome.probability}%</span>
                          </div>
                          <Progress value={outcome.probability} className="h-2" />
                          <p className="text-xs text-gray-500">{outcome.reasoning}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <Shield className="w-4 h-4 text-yellow-400" />
                        Risk Assessment
                      </h4>
                      <p className={`text-sm ${getRiskColor(result.riskAssessment)}`}>
                        {result.riskAssessment}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-medium flex items-center gap-2">
                        <DollarSign className="w-4 h-4 text-green-400" />
                        Profit Potential
                      </h4>
                      <p className="text-sm text-gray-300">{result.profitPotential}</p>
                    </div>
                  </div>

                  <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                    <h4 className="font-medium flex items-center gap-2 text-purple-400 mb-2">
                      <CheckCircle2 className="w-4 h-4" />
                      AI Recommendation
                    </h4>
                    <p className="text-sm text-gray-300">{result.recommendation}</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <History className="w-5 h-5 text-gray-400" />
                  Recent Scenarios
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingHistory ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                  </div>
                ) : pastScenarios && pastScenarios.length > 0 ? (
                  <div className="space-y-3">
                    {pastScenarios.slice(0, 5).map((scenario) => (
                      <div 
                        key={scenario.id}
                        className="p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium text-sm">{scenario.symbol}</span>
                          <Badge variant="outline" className="text-xs">
                            {scenario.scenarioType.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-400">
                          Price: {scenario.currentPrice}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          {new Date(scenario.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 text-center py-4">
                    No scenarios analyzed yet
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gray-900/50 border-gray-800">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                  Important Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-gray-400">
                <p>
                  <strong className="text-gray-300">Probabilities are estimates:</strong> AI analysis provides educated estimates based on historical patterns and market behavior.
                </p>
                <p>
                  <strong className="text-gray-300">Not financial advice:</strong> Always do your own research and consider consulting a financial advisor.
                </p>
                <p>
                  <strong className="text-gray-300">Market conditions change:</strong> Reassess scenarios if market conditions shift significantly.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
