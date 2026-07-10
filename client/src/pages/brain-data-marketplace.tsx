import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Brain, TrendingUp, Calendar, Target, Check, ShoppingCart } from 'lucide-react';

interface BrainListing {
  id: number;
  sellerId: number;
  sellerUsername: string;
  title: string;
  description: string | null;
  priceVedd: number;
  suggestedPriceVedd: number;
  tradeCount: number;
  distinctPairs: number;
  ageDays: number;
  winRate: number | null;
  purchaseCount: number;
  alreadyPurchased: boolean;
  isOwnListing: boolean;
}

interface PreviewStats {
  eligible: boolean;
  tradeCount: number;
  minTradesRequired?: number;
  distinctPairs?: number;
  ageDays?: number;
  winRate?: number | null;
  suggestedPriceVedd?: number;
}

export default function BrainDataMarketplacePage() {
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [customPrice, setCustomPrice] = useState('');

  const { data: wallet } = useQuery<{ veddBalance: number }>({ queryKey: ['/api/wallet/balance'] });
  const { data: listings = [], isLoading } = useQuery<BrainListing[]>({ queryKey: ['/api/brain-marketplace'] });
  const { data: myListings = [] } = useQuery<any[]>({ queryKey: ['/api/brain-marketplace/my-listings'] });
  const { data: preview } = useQuery<PreviewStats>({ queryKey: ['/api/brain-marketplace/my-listings/preview'] });

  const myBalance = wallet?.veddBalance ?? 0;
  const myActiveListing = myListings.find((l: any) => l.isActive);

  const listMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/brain-marketplace/list', {
        title,
        description: description || undefined,
        priceVedd: customPrice ? parseInt(customPrice, 10) : undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Brain data listed!', description: 'Your trade history is now available in the marketplace.' });
      setTitle('');
      setDescription('');
      setCustomPrice('');
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace/my-listings'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Listing failed', description: error.message, variant: 'destructive' });
    },
  });

  const buyMutation = useMutation({
    mutationFn: async (listingId: number) => {
      const res = await apiRequest('POST', `/api/brain-marketplace/${listingId}/buy`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({ title: 'Purchase complete', description: `${data.tradesImported} trades merged into your brain.` });
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace/my-purchases'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Purchase failed', description: error.message, variant: 'destructive' });
    },
  });

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold flex items-center gap-3">
            <Brain className="w-8 h-8 text-purple-500" /> Brain Data Marketplace
          </h1>
          <p className="text-muted-foreground mt-2">
            Buy or sell trade history for VEDD tokens — a copy merges into your own AI learning brain. Your own data is never lost when you sell.
          </p>
        </div>

        {/* Sell your data */}
        <Card>
          <CardHeader>
            <CardTitle>Sell Your Brain Data</CardTitle>
            <CardDescription>List a snapshot of your trade history. Buyers get a copy — you keep yours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {myActiveListing ? (
              <div className="rounded-lg border p-4 space-y-2">
                <p className="font-semibold">{myActiveListing.title}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div><p className="text-muted-foreground">Price</p><p className="font-bold">{myActiveListing.priceVedd} VEDD</p></div>
                  <div><p className="text-muted-foreground">Trades</p><p className="font-bold">{myActiveListing.tradeCount}</p></div>
                  <div><p className="text-muted-foreground">Purchases</p><p className="font-bold">{myActiveListing.purchaseCount}</p></div>
                  <div><p className="text-muted-foreground">Earned</p><p className="font-bold">{myActiveListing.purchaseCount * myActiveListing.priceVedd} VEDD</p></div>
                </div>
              </div>
            ) : !preview?.eligible ? (
              <p className="text-sm text-muted-foreground">
                You need at least {preview?.minTradesRequired ?? 10} completed trades to list your brain data (you have {preview?.tradeCount ?? 0}).
              </p>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                  <div className="bg-secondary/50 rounded p-2 text-center"><p className="text-muted-foreground">Trades</p><p className="font-bold">{preview.tradeCount}</p></div>
                  <div className="bg-secondary/50 rounded p-2 text-center"><p className="text-muted-foreground">Pairs</p><p className="font-bold">{preview.distinctPairs}</p></div>
                  <div className="bg-secondary/50 rounded p-2 text-center"><p className="text-muted-foreground">Age</p><p className="font-bold">{preview.ageDays}d</p></div>
                  <div className="bg-secondary/50 rounded p-2 text-center"><p className="text-muted-foreground">Suggested</p><p className="font-bold">{preview.suggestedPriceVedd} VEDD</p></div>
                </div>
                <Input placeholder="Listing title, e.g. 'EURUSD London-session swing setups'" value={title} onChange={e => setTitle(e.target.value)} />
                <Textarea placeholder="Description (optional)" value={description} onChange={e => setDescription(e.target.value)} />
                <Input
                  placeholder={`Price in VEDD (suggested: ${preview.suggestedPriceVedd})`}
                  type="number"
                  value={customPrice}
                  onChange={e => setCustomPrice(e.target.value)}
                />
                <Button onClick={() => listMutation.mutate()} disabled={!title || listMutation.isPending}>
                  {listMutation.isPending ? 'Listing…' : 'List My Data'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Browse */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Browse Listings</h2>
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Loading marketplace…</p>
          ) : listings.filter(l => !l.isOwnListing).length === 0 ? (
            <Card><CardContent className="pt-12 text-center"><p className="text-muted-foreground">No listings available yet</p></CardContent></Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.filter(l => !l.isOwnListing).map(listing => (
                <Card key={listing.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader>
                    <CardTitle className="text-lg">{listing.title}</CardTitle>
                    <CardDescription>by {listing.sellerUsername}</CardDescription>
                    {listing.description && <p className="text-sm text-muted-foreground mt-2">{listing.description}</p>}
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-secondary/50 rounded p-2 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-amber-500" />
                        <div><p className="text-muted-foreground text-xs">Trades</p><p className="font-bold">{listing.tradeCount}</p></div>
                      </div>
                      <div className="bg-secondary/50 rounded p-2 flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-500" />
                        <div><p className="text-muted-foreground text-xs">Pairs</p><p className="font-bold">{listing.distinctPairs}</p></div>
                      </div>
                      <div className="bg-secondary/50 rounded p-2 flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-green-500" />
                        <div><p className="text-muted-foreground text-xs">Age</p><p className="font-bold">{listing.ageDays}d</p></div>
                      </div>
                      <div className="bg-secondary/50 rounded p-2">
                        <p className="text-muted-foreground text-xs">Win Rate</p>
                        <p className="font-bold">{listing.winRate != null ? `${(listing.winRate * 100).toFixed(0)}%` : 'N/A'}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <Badge variant="secondary" className="text-base px-3 py-1">{listing.priceVedd} VEDD</Badge>
                      <span className="text-xs text-muted-foreground">{listing.purchaseCount} sold</span>
                    </div>
                    <Button
                      className="w-full"
                      onClick={() => buyMutation.mutate(listing.id)}
                      disabled={buyMutation.isPending || listing.alreadyPurchased || myBalance < listing.priceVedd}
                      title={myBalance < listing.priceVedd ? 'Insufficient VEDD balance' : undefined}
                    >
                      {listing.alreadyPurchased ? (
                        <><Check className="w-4 h-4 mr-2" /> Owned</>
                      ) : (
                        <><ShoppingCart className="w-4 h-4 mr-2" /> Buy for {listing.priceVedd} VEDD</>
                      )}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
