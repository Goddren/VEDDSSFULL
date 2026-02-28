import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { Copy, Share2, Trash2, Download, Eye, Settings, EyeOff, RefreshCw, Share, History, ArrowRight, AlertCircle, CheckCircle2, Sliders, DollarSign, Users, Layers, Pencil, TrendingUp, SortAsc, HelpCircle, Zap, Target, Shield, BarChart2, Clock, Info } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { ShareCardDialog } from '@/components/share-card-dialog';
import { ConfidenceExplainer } from '@/components/confidence-explainer';
import { ATRIndicator } from '@/components/atr-indicator';

// Helper function to explain common AI Refresh errors
function getRefreshErrorExplanation(errorMessage: string): { title: string; explanation: string; fix: string } | null {
  const msg = errorMessage.toLowerCase();
  
  // 401 Unauthorized - Most common for AI refresh
  if (msg.includes('401') || msg.includes('unauthorized')) {
    return {
      title: '401 Unauthorized',
      explanation: 'The market data API key (Twelve Data) is invalid, expired, or missing.',
      fix: 'Contact support to verify the TWELVE_DATA_API_KEY is configured correctly. Your session may also have expired - try logging out and back in.'
    };
  }
  
  // Market data service not initialized
  if (msg.includes('market data service not initialized') || msg.includes('twelve_data_api_key')) {
    return {
      title: 'Market Data Service Not Available',
      explanation: 'The live market data service is not configured on the server.',
      fix: 'The TWELVE_DATA_API_KEY needs to be added to the server secrets. Contact support.'
    };
  }
  
  // Rate limit
  if (msg.includes('rate limit') || msg.includes('429') || msg.includes('too many requests')) {
    return {
      title: 'Rate Limit Exceeded',
      explanation: 'Too many refresh requests have been made in a short time.',
      fix: 'Wait 1-2 minutes before trying again. The free tier allows 8 requests per minute.'
    };
  }
  
  // Session expired
  if (msg.includes('session') || msg.includes('not logged in')) {
    return {
      title: 'Session Expired',
      explanation: 'Your login session has expired.',
      fix: 'Log out and log back in to refresh your session, then try again.'
    };
  }
  
  // Network errors
  if (msg.includes('network') || msg.includes('fetch') || msg.includes('econnrefused')) {
    return {
      title: 'Network Error',
      explanation: 'Could not connect to the market data service.',
      fix: 'Check your internet connection and try again.'
    };
  }
  
  // Generic server error
  if (msg.includes('500') || msg.includes('internal server error')) {
    return {
      title: 'Server Error',
      explanation: 'The server encountered an unexpected error.',
      fix: 'Try again in a few minutes. If the problem persists, contact support.'
    };
  }
  
  return null;
}

function getSensitivityLevel(volatility: number, atr: number, price: number): { label: string; color: string; description: string } {
  const avgThreshold = (volatility + atr + price) / 3;
  if (avgThreshold <= 10) {
    return { label: 'Very Sensitive', color: 'text-red-500', description: 'Triggers on small market moves' };
  } else if (avgThreshold <= 20) {
    return { label: 'Sensitive', color: 'text-orange-500', description: 'Triggers on moderate changes' };
  } else if (avgThreshold <= 35) {
    return { label: 'Normal', color: 'text-blue-500', description: 'Balanced sensitivity (recommended)' };
  } else if (avgThreshold <= 50) {
    return { label: 'Conservative', color: 'text-green-500', description: 'Only major changes trigger' };
  } else {
    return { label: 'Very Conservative', color: 'text-gray-500', description: 'Rare triggers on extreme moves' };
  }
}

interface RefreshJob {
  id: number;
  eaId: number;
  status: string;
  triggeredBy: string;
  changeSummary: any;
  newDirection: string | null;
  newConfidence: string | null;
  error: string | null;
  triggeredAt: string;
  completedAt: string | null;
}

export default function MyEAsPage() {
  const { toast } = useToast();
  const [sharePrice, setSharePrice] = useState(9.99);
  const [editingSharedEA, setEditingSharedEA] = useState<any | null>(null);
  const [selectedEAId, setSelectedEAId] = useState<number | null>(null);
  const [previewEA, setPreviewEA] = useState<any | null>(null);
  const [historyEAId, setHistoryEAId] = useState<number | null>(null);
  const [settingsEA, setSettingsEA] = useState<any | null>(null);
  const [thresholds, setThresholds] = useState({ volatility: 30, atr: 20, price: 2 });
  const [filterType, setFilterType] = useState<'all' | 'shared' | 'unshared'>('all');
  const [sortType, setSortType] = useState<'newest' | 'subscribers' | 'price'>('newest');

  const { data: eas = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/my-eas'],
    queryFn: () => apiRequest('GET', '/api/my-eas').then(r => r.json()),
  });

  const { data: refreshHistory = [], isLoading: historyLoading } = useQuery<RefreshJob[]>({
    queryKey: ['/api/eas', historyEAId, 'refresh-history'],
    queryFn: () => {
      if (historyEAId === null) return Promise.resolve([]);
      return apiRequest('GET', `/api/eas/${historyEAId}/refresh-history`).then(r => r.json());
    },
    enabled: historyEAId !== null,
  });

  const deleteEAMutation = useMutation({
    mutationFn: async (eaId: number) =>
      apiRequest('DELETE', `/api/my-eas/${eaId}`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: 'EA deleted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/my-eas'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete EA', description: error.message, variant: 'destructive' });
    },
  });

  const shareEAMutation = useMutation({
    mutationFn: async (eaId: number) =>
      apiRequest('POST', `/api/share-ea/${eaId}`, { price: sharePrice * 100 }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: 'EA shared successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/my-eas'] });
      setSelectedEAId(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to share EA', description: error.message, variant: 'destructive' });
    },
  });

  const unshareEAMutation = useMutation({
    mutationFn: async (eaId: number) =>
      apiRequest('POST', `/api/unshare-ea/${eaId}`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: 'EA removed from marketplace' });
      queryClient.invalidateQueries({ queryKey: ['/api/my-eas'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ea-marketplace'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to unshare EA', description: error.message, variant: 'destructive' });
    },
  });

  const refreshEAMutation = useMutation({
    mutationFn: async (eaId: number) =>
      apiRequest('POST', `/api/eas/${eaId}/refresh`).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/my-eas'] });
      
      // Handle AI re-analysis states using explicit flags
      if (data.aiReanalysisTriggered && !data.aiReanalysisSucceeded) {
        toast({ 
          title: 'AI re-analysis failed',
          description: data.message || 'Market change detected but AI analysis could not be completed. Please try again.',
          variant: 'destructive'
        });
      } else if (data.reanalysisResult?.directionChanged) {
        toast({ 
          title: '🔄 Direction Change Detected!',
          description: `${data.reanalysisResult.changeReason || 'Market conditions have shifted'}. New direction: ${data.reanalysisResult.newDirection} (${data.reanalysisResult.confidence}% confidence)`,
          duration: 10000
        });
      } else if (data.patternChange?.hasSignificantChange) {
        toast({ 
          title: 'Market change detected',
          description: data.message
        });
      } else {
        toast({ 
          title: 'Refresh complete',
          description: 'No significant pattern changes detected'
        });
      }
    },
    onError: (error: Error) => {
      const explanation = getRefreshErrorExplanation(error.message);
      toast({ 
        title: explanation ? `Refresh failed: ${explanation.title}` : 'Refresh failed', 
        description: explanation 
          ? `${explanation.explanation}\n\n💡 Fix: ${explanation.fix}`
          : error.message,
        variant: 'destructive',
        duration: 10000
      });
    },
  });

  const copyCodeMutation = useMutation({
    mutationFn: async (eaId: number) => {
      const ea = eas.find((e: any) => e.id === eaId);
      if (!ea) throw new Error('EA not found');
      navigator.clipboard.writeText(ea.eaCode);
      return true;
    },
    onSuccess: () => {
      toast({ title: 'EA code copied to clipboard!' });
    },
  });

  const downloadEAMutation = useMutation({
    mutationFn: async (ea: any) => {
      const element = document.createElement('a');
      const file = new Blob([ea.eaCode], { type: 'text/plain' });
      element.href = URL.createObjectURL(file);
      element.download = `${ea.name}.mq5`;
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      return true;
    },
    onSuccess: () => {
      toast({ title: 'EA downloaded successfully!' });
    },
  });

  const updateThresholdsMutation = useMutation({
    mutationFn: async ({ eaId, thresholds }: { eaId: number; thresholds: { volatility: number; atr: number; price: number } }) =>
      apiRequest('PATCH', `/api/my-eas/${eaId}`, {
        refreshVolatilityThreshold: thresholds.volatility,
        refreshAtrThreshold: thresholds.atr,
        refreshPriceThreshold: thresholds.price,
      }).then(r => r.json()),
    onSuccess: () => {
      toast({ title: 'Refresh settings updated!' });
      queryClient.invalidateQueries({ queryKey: ['/api/my-eas'] });
      setSettingsEA(null);
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update settings', description: error.message, variant: 'destructive' });
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading your EAs...</div>;
  }

  const totalSubscribers = eas.reduce((sum: number, ea: any) => sum + (ea.shareCount || 0), 0);
  const totalRevenue = eas.reduce((sum: number, ea: any) => sum + ((ea.shareCount || 0) * (ea.price || 0) / 100), 0);
  const sharedCount = eas.filter((ea: any) => ea.isShared).length;

  const filteredEAs = eas
    .filter((ea: any) => {
      if (filterType === 'shared') return ea.isShared;
      if (filterType === 'unshared') return !ea.isShared;
      return true;
    })
    .sort((a: any, b: any) => {
      if (sortType === 'subscribers') return (b.shareCount || 0) - (a.shareCount || 0);
      if (sortType === 'price') return (b.price || 0) - (a.price || 0);
      return b.id - a.id;
    });

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold">My EAs</h1>
          <p className="text-muted-foreground mt-2">
            Build, manage, and monetize your Expert Advisors
          </p>
        </div>

        {/* Stats Header */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-gray-900/60 border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/20"><Layers className="w-5 h-5 text-blue-400" /></div>
              <div>
                <p className="text-xs text-gray-400">Total EAs</p>
                <p className="text-2xl font-bold">{eas.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-gray-700">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-purple-500/20"><Users className="w-5 h-5 text-purple-400" /></div>
              <div>
                <p className="text-xs text-gray-400">Active Listings · Subscribers</p>
                <p className="text-2xl font-bold">{sharedCount} <span className="text-sm text-gray-400 font-normal">/ {totalSubscribers} subs</span></p>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gray-900/60 border-amber-500/30 border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/20"><DollarSign className="w-5 h-5 text-amber-400" /></div>
              <div>
                <p className="text-xs text-gray-400">Est. Monthly Revenue</p>
                <p className="text-2xl font-bold text-amber-400">${totalRevenue.toFixed(2)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* AI Confidence Info Banner */}
        <Card className="bg-gradient-to-r from-green-900/20 to-emerald-900/10 border-green-500/30">
          <CardContent className="p-4">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-green-500/20">
                <Zap className="w-5 h-5 text-green-400" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-green-400 mb-1">Understanding AI Confidence %</h3>
                <p className="text-sm text-gray-300 mb-3">
                  Each EA shows a confidence percentage based on pattern confluence, indicator agreement, 
                  support/resistance alignment, volume confirmation, and multi-timeframe agreement.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="bg-red-500/20 text-red-300 border-red-500/30">Low: 40-55%</Badge>
                  <Badge variant="outline" className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30">Medium: 56-74%</Badge>
                  <Badge variant="outline" className="bg-green-500/20 text-green-300 border-green-500/30">High: 75-95%</Badge>
                  <Badge variant="outline" className="bg-blue-500/20 text-blue-300 border-blue-500/30">+10% boost when 60%+ timeframes agree</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter & Sort Bar */}
        {eas.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1">
              {(['all', 'shared', 'unshared'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilterType(f)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filterType === f ? 'bg-amber-500 text-black' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'}`}
                >
                  {f === 'all' ? 'All' : f === 'shared' ? '🟢 Shared' : '⬜ Not Shared'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <SortAsc className="w-4 h-4 text-gray-400" />
              <select
                value={sortType}
                onChange={e => setSortType(e.target.value as any)}
                className="bg-gray-800 border border-gray-700 rounded-md px-2 py-1.5 text-xs text-gray-300"
              >
                <option value="newest">Newest</option>
                <option value="subscribers">Most Subscribers</option>
                <option value="price">Highest Price</option>
              </select>
            </div>
          </div>
        )}

        {eas.length === 0 ? (
          <Card className="bg-gray-900/60 border-gray-700">
            <CardContent className="pt-10 pb-10 text-center">
              <div className="flex justify-center gap-8 mb-6">
                {[
                  { icon: <TrendingUp className="w-6 h-6 text-blue-400" />, label: '1. Generate EA', sub: 'From chart analysis' },
                  { icon: <Settings className="w-6 h-6 text-amber-400" />, label: '2. Customize', sub: 'Set thresholds & test' },
                  { icon: <DollarSign className="w-6 h-6 text-green-400" />, label: '3. Sell & Earn', sub: 'Publish to marketplace' },
                ].map((step, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <div className="p-3 rounded-full bg-gray-800">{step.icon}</div>
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-gray-500">{step.sub}</p>
                  </div>
                ))}
              </div>
              <Link href="/multi-timeframe">
                <Button className="bg-amber-500 hover:bg-amber-600 text-black font-semibold">Generate Your First EA</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filteredEAs.map((ea: any) => {
              const monthlyRevenue = ((ea.shareCount || 0) * (ea.price || 0) / 100).toFixed(2);
              const borderColor = ea.isShared && (ea.shareCount || 0) > 0
                ? 'border-l-4 border-l-green-500'
                : ea.isShared
                  ? 'border-l-4 border-l-amber-500'
                  : 'border-l-4 border-l-gray-600';
              return (
              <Card key={ea.id} className={`${borderColor} bg-gray-900/40`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{ea.name}</CardTitle>
                      <CardDescription>{ea.symbol} • {ea.platformType}</CardDescription>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {ea.isShared && <Badge className="bg-green-500/80 text-white text-xs">Listed</Badge>}
                      {ea.isShared && parseFloat(monthlyRevenue) > 0 && (
                        <Badge className="bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs">
                          Est. ${monthlyRevenue}/mo
                        </Badge>
                      )}
                    </div>
                  </div>
                  {ea.description && (
                    <p className="text-xs mt-1 text-muted-foreground">{ea.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground text-xs">Strategy</p>
                      <p className="font-medium capitalize text-sm">{ea.strategyType || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">ATR-Based SL</p>
                      <ATRIndicator symbol={ea.symbol} />
                    </div>
                    {ea.isShared && (
                      <>
                        <div>
                          <p className="text-muted-foreground text-xs">Price</p>
                          <p className="font-medium text-sm">{ea.price != null ? `$${(ea.price / 100).toFixed(2)}/mo` : 'Free'}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Subscribers</p>
                          <div>
                            <p className="font-medium text-sm">{ea.shareCount || 0}</p>
                            <div className="mt-1 h-1 w-full bg-gray-700 rounded-full overflow-hidden">
                              <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, ((ea.shareCount || 0) / 20) * 100)}%` }} />
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setPreviewEA(ea)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Preview
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-2xl max-h-96">
                        <DialogHeader>
                          <DialogTitle>Preview EA Code - {ea.name}</DialogTitle>
                        </DialogHeader>
                        <div className="bg-slate-900 p-4 rounded text-sm text-slate-100 font-mono overflow-auto max-h-64 whitespace-pre-wrap break-words">
                          {ea.eaCode}
                        </div>
                      </DialogContent>
                    </Dialog>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => copyCodeMutation.mutate(ea.id)}
                      disabled={copyCodeMutation.isPending}
                    >
                      <Copy className="w-4 h-4 mr-1" />
                      Copy
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => downloadEAMutation.mutate(ea)}
                      disabled={downloadEAMutation.isPending}
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => refreshEAMutation.mutate(ea.id)}
                      disabled={refreshEAMutation.isPending}
                      data-testid={`button-refresh-ea-${ea.id}`}
                      title="Check for market pattern changes"
                    >
                      <RefreshCw className={`w-4 h-4 mr-1 ${refreshEAMutation.isPending ? 'animate-spin' : ''}`} />
                      {refreshEAMutation.isPending ? 'Checking...' : 'Refresh'}
                    </Button>

                    <Dialog open={historyEAId === ea.id} onOpenChange={(open) => setHistoryEAId(open ? ea.id : null)}>
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-history-ea-${ea.id}`}
                          title="View refresh history"
                        >
                          <History className="w-4 h-4 mr-1" />
                          History
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Refresh History - {ea.symbol}</DialogTitle>
                        </DialogHeader>
                        
                        {/* Original Analysis Section */}
                        <div className="bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-lg p-4 mb-4 border">
                          <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                            <Eye className="w-4 h-4" />
                            Original Analysis
                          </h4>
                          <div className="grid grid-cols-2 gap-3 text-sm">
                            <div>
                              <span className="text-muted-foreground">Direction:</span>
                              <span className={`ml-2 font-semibold ${ea.direction?.toUpperCase().includes('BUY') || ea.direction?.toUpperCase().includes('BULLISH') ? 'text-green-600' : 'text-red-600'}`}>
                                {ea.direction || 'N/A'}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Confidence:</span>
                              <span className="ml-2 font-medium">{ea.confidence || 'N/A'}%</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Entry:</span>
                              <span className="ml-2 font-medium">{ea.entryPoint || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Stop Loss:</span>
                              <span className="ml-2 font-medium text-red-500">{ea.stopLoss || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Take Profit:</span>
                              <span className="ml-2 font-medium text-green-500">{ea.takeProfit || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Created:</span>
                              <span className="ml-2 text-xs">{new Date(ea.createdAt).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>

                        <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                          <History className="w-4 h-4" />
                          Refresh Updates
                        </h4>
                        
                        <ScrollArea className="max-h-60">
                          {historyLoading ? (
                            <div className="text-center py-4 text-muted-foreground">Loading history...</div>
                          ) : refreshHistory.length === 0 ? (
                            <div className="text-center py-4 text-muted-foreground">
                              No refresh history yet. Use the Refresh button to check for market changes.
                            </div>
                          ) : (
                            <div className="space-y-3">
                              {refreshHistory.map((job) => (
                                <div key={job.id} className="border rounded-lg p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                      {job.status === 'completed' ? (
                                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                                      ) : job.status === 'failed' ? (
                                        <AlertCircle className="w-4 h-4 text-red-500" />
                                      ) : (
                                        <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                                      )}
                                      <Badge variant={job.status === 'completed' ? 'default' : job.status === 'failed' ? 'destructive' : 'secondary'}>
                                        {job.status}
                                      </Badge>
                                    </div>
                                    <span className="text-xs text-muted-foreground">
                                      {new Date(job.triggeredAt).toLocaleString()}
                                    </span>
                                  </div>
                                  
                                  {job.newDirection && (
                                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-3 space-y-2">
                                      <div className="flex items-center gap-2 text-sm font-medium">
                                        <span className="text-muted-foreground">Signal Update:</span>
                                        {job.changeSummary?.previousDirection && (
                                          <>
                                            <span className={job.changeSummary.previousDirection.toUpperCase().includes('BUY') ? 'text-green-600' : 'text-red-600'}>
                                              {job.changeSummary.previousDirection}
                                            </span>
                                            <ArrowRight className="w-4 h-4 text-muted-foreground" />
                                          </>
                                        )}
                                        <span className={job.newDirection.toUpperCase().includes('BUY') ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>
                                          {job.newDirection}
                                        </span>
                                        {job.newConfidence && (
                                          <Badge variant="outline" className="ml-1">{job.newConfidence}%</Badge>
                                        )}
                                      </div>
                                      {(job.changeSummary?.newEntryPrice || job.changeSummary?.newStopLoss || job.changeSummary?.newTakeProfit) && (
                                        <div className="grid grid-cols-3 gap-2 text-xs mt-2">
                                          {job.changeSummary.newEntryPrice && (
                                            <div>
                                              <span className="text-muted-foreground">Entry:</span>
                                              <span className="ml-1 font-medium">{job.changeSummary.newEntryPrice}</span>
                                            </div>
                                          )}
                                          {job.changeSummary.newStopLoss && (
                                            <div>
                                              <span className="text-muted-foreground">SL:</span>
                                              <span className="ml-1 font-medium text-red-500">{job.changeSummary.newStopLoss}</span>
                                            </div>
                                          )}
                                          {job.changeSummary.newTakeProfit && (
                                            <div>
                                              <span className="text-muted-foreground">TP:</span>
                                              <span className="ml-1 font-medium text-green-500">{job.changeSummary.newTakeProfit}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}
                                      {job.changeSummary?.changeReason && (
                                        <p className="text-xs text-muted-foreground">{job.changeSummary.changeReason}</p>
                                      )}
                                      {job.changeSummary?.recommendation && (
                                        <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                                          Recommendation: {job.changeSummary.recommendation}
                                        </p>
                                      )}
                                      {job.changeSummary?.codeRegenerated && (
                                        <Badge variant="outline" className="mt-2 text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-300">
                                          EA Code Updated
                                        </Badge>
                                      )}
                                    </div>
                                  )}
                                  
                                  {!job.newDirection && job.changeSummary && (
                                    <div className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                                      {typeof job.changeSummary === 'string' 
                                        ? job.changeSummary 
                                        : job.changeSummary.details || job.changeSummary.message || 'No significant pattern changes detected'}
                                    </div>
                                  )}
                                  
                                  {job.error && (
                                    <div className="text-xs text-red-500 bg-red-50 rounded p-2">
                                      {job.error}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </ScrollArea>
                      </DialogContent>
                    </Dialog>

                    <Dialog 
                      open={settingsEA?.id === ea.id} 
                      onOpenChange={(open) => {
                        if (open) {
                          setSettingsEA(ea);
                          setThresholds({
                            volatility: ea.refreshVolatilityThreshold ?? 30,
                            atr: ea.refreshAtrThreshold ?? 20,
                            price: ea.refreshPriceThreshold ?? 2
                          });
                        } else {
                          setSettingsEA(null);
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          data-testid={`button-settings-ea-${ea.id}`}
                          title="Configure refresh sensitivity"
                        >
                          <Sliders className="w-4 h-4 mr-1" />
                          Settings
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Refresh Sensitivity Settings</DialogTitle>
                          <DialogDescription>
                            Adjust how sensitive the AI refresh is to market changes for {ea.symbol}
                          </DialogDescription>
                        </DialogHeader>
                        
                        <div className="space-y-6 py-4">
                          <div className="text-center p-4 bg-gradient-to-r from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-lg">
                            <div className={`text-lg font-semibold ${getSensitivityLevel(thresholds.volatility, thresholds.atr, thresholds.price).color}`}>
                              {getSensitivityLevel(thresholds.volatility, thresholds.atr, thresholds.price).label}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {getSensitivityLevel(thresholds.volatility, thresholds.atr, thresholds.price).description}
                            </p>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <div className="flex justify-between mb-2">
                                <Label htmlFor="volatility">Volatility Change</Label>
                                <span className="text-sm font-medium">{thresholds.volatility}%</span>
                              </div>
                              <Slider
                                id="volatility"
                                min={5}
                                max={100}
                                step={5}
                                value={[thresholds.volatility]}
                                onValueChange={([val]) => setThresholds(prev => ({ ...prev, volatility: val }))}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Triggers when market volatility changes by this percentage
                              </p>
                            </div>

                            <div>
                              <div className="flex justify-between mb-2">
                                <Label htmlFor="atr">ATR Change</Label>
                                <span className="text-sm font-medium">{thresholds.atr}%</span>
                              </div>
                              <Slider
                                id="atr"
                                min={5}
                                max={100}
                                step={5}
                                value={[thresholds.atr]}
                                onValueChange={([val]) => setThresholds(prev => ({ ...prev, atr: val }))}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Triggers when Average True Range changes by this percentage
                              </p>
                            </div>

                            <div>
                              <div className="flex justify-between mb-2">
                                <Label htmlFor="price">Price Move</Label>
                                <span className="text-sm font-medium">{thresholds.price}%</span>
                              </div>
                              <Slider
                                id="price"
                                min={1}
                                max={20}
                                step={1}
                                value={[thresholds.price]}
                                onValueChange={([val]) => setThresholds(prev => ({ ...prev, price: val }))}
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Triggers when price moves by this percentage
                              </p>
                            </div>
                          </div>

                          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                            <p className="text-xs text-blue-700 dark:text-blue-300">
                              <strong>Tip:</strong> Lower values = more frequent updates. Higher values = fewer, but more significant updates.
                              Default: Volatility 30%, ATR 20%, Price 2%
                            </p>
                          </div>
                        </div>

                        <DialogFooter>
                          <Button
                            variant="outline"
                            onClick={() => setThresholds({ volatility: 30, atr: 20, price: 2 })}
                            data-testid={`button-reset-thresholds-${ea.id}`}
                          >
                            Reset to Default
                          </Button>
                          <Button
                            onClick={() => updateThresholdsMutation.mutate({ eaId: ea.id, thresholds })}
                            disabled={updateThresholdsMutation.isPending}
                            data-testid={`button-save-thresholds-${ea.id}`}
                          >
                            {updateThresholdsMutation.isPending ? 'Saving...' : 'Save Settings'}
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <ShareCardDialog
                      eaId={ea.id}
                      eaName={ea.name}
                      symbol={ea.symbol}
                      trigger={
                        <Button 
                          size="sm" 
                          variant="default" 
                          className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700"
                          data-testid={`button-social-share-${ea.id}`}
                        >
                          <Share className="w-4 h-4 mr-1" />
                          Social Share
                        </Button>
                      }
                    />

                    {!ea.isShared ? (
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => { setSelectedEAId(ea.id); setSharePrice(9.99); }}
                            data-testid={`button-share-ea-${ea.id}`}
                          >
                            <Share2 className="w-4 h-4 mr-1" />
                            List & Sell
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Publish EA to Marketplace</DialogTitle>
                            <DialogDescription>Set your monthly subscription price and start earning passive income.</DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium">Monthly Price</label>
                              <div className="relative mt-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                                <Input
                                  type="number"
                                  value={sharePrice}
                                  onChange={(e) => setSharePrice(parseFloat(e.target.value) || 0)}
                                  min="1" max="999" step="0.01"
                                  className="pl-7"
                                />
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">You keep 70% after platform fee</p>
                            </div>
                            <div className="bg-gray-800/60 rounded-lg p-3 text-sm space-y-1">
                              <p className="text-gray-400 text-xs font-medium">Earnings preview</p>
                              <p>10 subscribers → <span className="text-green-400 font-semibold">${(sharePrice * 0.7 * 10).toFixed(2)}/mo</span></p>
                              <p>50 subscribers → <span className="text-green-400 font-semibold">${(sharePrice * 0.7 * 50).toFixed(2)}/mo</span></p>
                            </div>
                            <Button
                              onClick={() => shareEAMutation.mutate(ea.id)}
                              disabled={shareEAMutation.isPending}
                              className="w-full bg-green-600 hover:bg-green-700"
                            >
                              {shareEAMutation.isPending ? 'Publishing...' : 'Publish to Marketplace'}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
                      <div className="flex gap-1">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-500/50 text-amber-400 hover:bg-amber-500/10"
                              onClick={() => { setEditingSharedEA(ea); setSharePrice(ea.price != null ? ea.price / 100 : 9.99); }}
                            >
                              <Pencil className="w-3 h-3 mr-1" />
                              Edit Price
                            </Button>
                          </DialogTrigger>
                          <DialogContent>
                            <DialogHeader>
                              <DialogTitle>Update Price — {ea.name}</DialogTitle>
                              <DialogDescription>Change the monthly subscription price for this listed EA.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div>
                                <label className="text-sm font-medium">New Monthly Price</label>
                                <div className="relative mt-1">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-medium">$</span>
                                  <Input
                                    type="number"
                                    value={sharePrice}
                                    onChange={(e) => setSharePrice(parseFloat(e.target.value) || 0)}
                                    min="1" max="999" step="0.01"
                                    className="pl-7"
                                  />
                                </div>
                                <p className="text-xs text-muted-foreground mt-1">Current: {ea.price != null ? `$${(ea.price / 100).toFixed(2)}/mo` : 'Free'}</p>
                              </div>
                              <div className="bg-gray-800/60 rounded-lg p-3 text-sm space-y-1">
                                <p className="text-gray-400 text-xs font-medium">Revenue with {ea.shareCount || 0} current subscribers</p>
                                <p>At new price → <span className="text-amber-400 font-semibold">${(sharePrice * 0.7 * (ea.shareCount || 0)).toFixed(2)}/mo</span></p>
                              </div>
                              <Button
                                onClick={() => shareEAMutation.mutate(ea.id)}
                                disabled={shareEAMutation.isPending}
                                className="w-full"
                              >
                                {shareEAMutation.isPending ? 'Updating...' : 'Update Price'}
                              </Button>
                            </div>
                          </DialogContent>
                        </Dialog>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (confirm('Remove this EA from the marketplace? Existing subscribers will lose access.')) {
                              unshareEAMutation.mutate(ea.id);
                            }
                          }}
                          disabled={unshareEAMutation.isPending}
                          data-testid={`button-unshare-ea-${ea.id}`}
                        >
                          <EyeOff className="w-3 h-3 mr-1" />
                          {unshareEAMutation.isPending ? 'Removing...' : 'Unlist'}
                        </Button>
                      </div>
                    )}

                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        if (confirm('Delete this EA? This cannot be undone.')) {
                          deleteEAMutation.mutate(ea.id);
                        }
                      }}
                      disabled={deleteEAMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      Delete
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
