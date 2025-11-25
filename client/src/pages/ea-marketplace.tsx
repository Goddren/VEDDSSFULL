import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Search, Star, Users, TrendingUp, Download, Check } from 'lucide-react';
import { Input } from '@/components/ui/input';

export default function EAMarketplacePage() {
  const { toast } = useToast();
  const [searchQuery, setSearchQuery] = useState('');

  const { data: eas = [], isLoading } = useQuery({
    queryKey: ['/api/ea-marketplace'],
    queryFn: () => apiRequest('GET', '/api/ea-marketplace').then(r => r.json()),
  });

  const { data: subscriptions = [] } = useQuery({
    queryKey: ['/api/my-subscriptions'],
    queryFn: () => apiRequest('GET', '/api/my-subscriptions').then(r => r.json()),
  });

  const subscribeMutation = useMutation({
    mutationFn: async (eaId: number) =>
      apiRequest('POST', `/api/subscribe-to-ea/${eaId}`, {}).then(r => r.json()),
    onSuccess: () => {
      toast({ title: 'Subscribed successfully!' });
      queryClient.invalidateQueries({ queryKey: ['/api/my-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ea-marketplace'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Subscription failed', description: error.message, variant: 'destructive' });
    },
  });

  const isSubscribed = (eaId: number) => {
    return subscriptions.some((s: any) => s.eaId === eaId);
  };

  const filteredEAs = eas.filter((ea: any) =>
    ea.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    ea.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return <div className="text-center py-8">Loading marketplace...</div>;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold">EA Marketplace</h1>
          <p className="text-muted-foreground mt-2">
            Discover and subscribe to Expert Advisors created by top traders
          </p>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-3 w-5 h-5 text-muted-foreground" />
          <Input
            placeholder="Search by name or symbol..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {filteredEAs.length === 0 ? (
          <Card>
            <CardContent className="pt-12 text-center">
              <p className="text-muted-foreground">No EAs found in marketplace</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredEAs.map((ea: any) => (
              <Card key={ea.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="space-y-2">
                    <CardTitle className="text-lg">{ea.name}</CardTitle>
                    <CardDescription>
                      <div className="flex items-center gap-2">
                        <span>{ea.symbol}</span>
                        <Badge variant="secondary">{ea.platformType}</Badge>
                      </div>
                    </CardDescription>
                  </div>
                  {ea.description && (
                    <p className="text-sm text-muted-foreground mt-2">{ea.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center text-sm">
                    <div className="bg-secondary/50 rounded p-2">
                      <p className="text-muted-foreground">Price</p>
                      <p className="font-bold">${(ea.price / 100).toFixed(2)}/mo</p>
                    </div>
                    <div className="bg-secondary/50 rounded p-2">
                      <p className="text-muted-foreground">Users</p>
                      <p className="font-bold flex items-center justify-center gap-1">
                        <Users className="w-4 h-4" />
                        {ea.subscriberCount || 0}
                      </p>
                    </div>
                    <div className="bg-secondary/50 rounded p-2">
                      <p className="text-muted-foreground">Creator</p>
                      <p className="font-bold text-xs truncate">{ea.creator?.username || 'N/A'}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {ea.strategyType && (
                      <div className="flex items-center gap-2 text-sm">
                        <TrendingUp className="w-4 h-4 text-amber-500" />
                        <span className="capitalize">{ea.strategyType} Strategy</span>
                      </div>
                    )}
                  </div>

                  <Button
                    onClick={() => subscribeMutation.mutate(ea.id)}
                    disabled={
                      subscribeMutation.isPending ||
                      isSubscribed(ea.id)
                    }
                    className="w-full"
                  >
                    {isSubscribed(ea.id) ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Subscribed
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 mr-2" />
                        Subscribe
                      </>
                    )}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
