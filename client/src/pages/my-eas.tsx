import { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { Copy, Share2, Trash2, Download, Eye, Settings, EyeOff, RefreshCw, Share } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ShareCardDialog } from '@/components/share-card-dialog';

export default function MyEAsPage() {
  const { toast } = useToast();
  const [sharePrice, setSharePrice] = useState(9.99);
  const [selectedEAId, setSelectedEAId] = useState<number | null>(null);
  const [previewEA, setPreviewEA] = useState<any | null>(null);

  const { data: eas = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/my-eas'],
    queryFn: () => apiRequest('GET', '/api/my-eas').then(r => r.json()),
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
      
      // Handle AI re-analysis error
      if (data.reanalysisResult?.error) {
        toast({ 
          title: 'AI re-analysis failed',
          description: 'Market change detected but AI analysis could not be completed. Please try again.',
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
      toast({ 
        title: 'Refresh failed', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  const copyCodeMutation = useMutation({
    mutationFn: async (eaId: number) => {
      const ea = eas.find(e => e.id === eaId);
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

  if (isLoading) {
    return <div className="text-center py-8">Loading your EAs...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold">My EAs</h1>
          <p className="text-muted-foreground mt-2">
            Manage your saved Expert Advisors and share them with the community
          </p>
        </div>

        {eas.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <p className="text-muted-foreground mb-4">No saved EAs yet</p>
              <Link href="/multi-timeframe">
                <Button>Generate Your First EA</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {eas.map((ea: any) => (
              <Card key={ea.id} className={ea.isShared ? 'border-green-500' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-xl">{ea.name}</CardTitle>
                      <CardDescription>{ea.symbol} • {ea.platformType}</CardDescription>
                    </div>
                    {ea.isShared && (
                      <Badge className="bg-green-500">Shared</Badge>
                    )}
                  </div>
                  {ea.description && (
                    <p className="text-sm mt-2 text-muted-foreground">{ea.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Strategy</p>
                      <p className="font-medium capitalize">{ea.strategyType || 'N/A'}</p>
                    </div>
                    {ea.isShared && (
                      <>
                        <div>
                          <p className="text-muted-foreground">Price</p>
                          <p className="font-medium">${(ea.price / 100).toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Subscribers</p>
                          <p className="font-medium">{ea.shareCount || 0}</p>
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
                            variant="outline"
                            onClick={() => setSelectedEAId(ea.id)}
                            data-testid={`button-share-ea-${ea.id}`}
                          >
                            <Share2 className="w-4 h-4 mr-1" />
                            Share
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Share EA and Earn</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <label className="text-sm font-medium">
                                Subscription Price ($/month)
                              </label>
                              <Input
                                type="number"
                                value={sharePrice}
                                onChange={(e) => setSharePrice(parseFloat(e.target.value))}
                                min="1"
                                max="999"
                                step="0.01"
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Set the monthly subscription price for this EA
                              </p>
                            </div>
                            <Button
                              onClick={() => shareEAMutation.mutate(ea.id)}
                              disabled={shareEAMutation.isPending}
                              className="w-full"
                            >
                              {shareEAMutation.isPending ? 'Sharing...' : 'Publish to Marketplace'}
                            </Button>
                          </div>
                        </DialogContent>
                      </Dialog>
                    ) : (
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
                        <EyeOff className="w-4 h-4 mr-1" />
                        {unshareEAMutation.isPending ? 'Removing...' : 'Unshare'}
                      </Button>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
