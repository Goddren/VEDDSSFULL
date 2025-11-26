import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Eye, Download, Star } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export default function MySubscriptionsPage() {
  const { toast } = useToast();
  const [previewEA, setPreviewEA] = useState<any | null>(null);

  const { data: subscriptions = [], isLoading, refetch } = useQuery({
    queryKey: ['/api/my-subscriptions'],
    queryFn: () => apiRequest('GET', '/api/my-subscriptions').then(r => r.json()),
  });

  const unsubscribeMutation = useMutation({
    mutationFn: async (subscriptionId: number) =>
      apiRequest('DELETE', `/api/subscriptions/${subscriptionId}`).then(r => r.json()),
    onSuccess: () => {
      toast({ title: 'Unsubscribed successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/my-subscriptions'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to unsubscribe', description: error.message, variant: 'destructive' });
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
    return <div className="text-center py-8">Loading your subscriptions...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold">My EA Subscriptions</h1>
          <p className="text-muted-foreground mt-2">
            Expert Advisors you've subscribed to from other creators
          </p>
        </div>

        {subscriptions.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <p className="text-muted-foreground mb-4">No active subscriptions yet</p>
              <Button href="/ea-marketplace">Browse EA Marketplace</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {subscriptions.map((sub: any) => (
              <Card key={sub.id} className="border-blue-200 dark:border-blue-800">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-xl flex items-center gap-2">
                        <Star className="w-5 h-5 text-amber-500 fill-amber-500" />
                        {sub.savedEA?.name}
                      </CardTitle>
                      <CardDescription>
                        {sub.savedEA?.symbol} • {sub.savedEA?.platformType}
                      </CardDescription>
                    </div>
                    <Badge className="bg-blue-500">Subscribed</Badge>
                  </div>
                  {sub.savedEA?.description && (
                    <p className="text-sm mt-2 text-muted-foreground">{sub.savedEA.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Creator</p>
                      <p className="font-medium">{sub.creator?.username}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Strategy</p>
                      <p className="font-medium capitalize">{sub.savedEA?.strategyType || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Subscribed</p>
                      <p className="font-medium">{new Date(sub.startDate).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Status</p>
                      <Badge variant={sub.status === 'active' ? 'default' : 'secondary'}>
                        {sub.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="flex gap-2 pt-4">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setPreviewEA(sub.savedEA)}
                          className="flex-1"
                          data-testid="button-preview"
                        >
                          <Eye className="w-4 h-4 mr-2" />
                          Preview
                        </Button>
                      </DialogTrigger>
                      {previewEA && (
                        <DialogContent className="max-w-3xl max-h-96 overflow-y-auto">
                          <DialogHeader>
                            <DialogTitle>{previewEA.name} - Code Preview</DialogTitle>
                          </DialogHeader>
                          <pre className="bg-muted p-4 rounded text-xs overflow-x-auto">
                            <code>{previewEA.eaCode?.substring(0, 1000)}...</code>
                          </pre>
                        </DialogContent>
                      )}
                    </Dialog>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => downloadEAMutation.mutate(sub.savedEA)}
                      disabled={downloadEAMutation.isPending}
                      className="flex-1"
                      data-testid="button-download"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Download
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => {
                        if (confirm('Unsubscribe from this EA?')) {
                          unsubscribeMutation.mutate(sub.id);
                        }
                      }}
                      disabled={unsubscribeMutation.isPending}
                      data-testid="button-unsubscribe"
                    >
                      <Trash2 className="w-4 h-4" />
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
