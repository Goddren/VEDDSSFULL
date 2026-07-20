import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { Brain, TrendingUp, Calendar, Target, Check, ShoppingCart } from 'lucide-react';
import BrainVisualization3D from '@/components/brain-visualization-3d';

type SourceCategory = 'forex' | 'tradelocker';

const CATEGORY_LABEL: Record<SourceCategory, string> = { forex: 'Forex / MT5 Brain', tradelocker: 'TradeLocker Brain' };

interface BrainListing {
  id: number;
  sellerId: number;
  sellerUsername: string;
  sourceCategory: SourceCategory;
  symbolFilter: string[] | null;
  includesManualTrades: boolean;
  title: string;
  description: string | null;
  priceVedd: number;
  suggestedPriceVedd: number;
  tradeCount: number;
  distinctPairs: number;
  ageDays: number;
  winRate: number | null;
  purchaseCount: number;
  isActive?: boolean;
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
  const [symbolsInput, setSymbolsInput] = useState('');
  // Manually-logged (discretionary) trades live in a separate table from
  // AI-confirmed trades and are excluded by default — opt-in only, and only
  // meaningful for the forex/MT5 category (manual logging is MT5-side).
  const [includeManualTrades, setIncludeManualTrades] = useState(false);
  // Sellers can list two separate brains — one built only from MT5/EA-triggered
  // forex signals, one built only from TradeLocker-executed trades — rather
  // than one blended listing. Within a category, an optional pair scope
  // (symbolsInput) lets several distinct brains coexist (e.g. an EURUSD-only
  // brain and a USDJPY-only brain), and re-listing the same pair scope
  // updates that specific brain with a fresh snapshot instead of a new one.
  const [sellCategory, setSellCategory] = useState<SourceCategory>('forex');

  const symbols = symbolsInput.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);

  const { data: wallet } = useQuery<{ veddBalance: number }>({ queryKey: ['/api/wallet/balance'] });
  const { data: listings = [], isLoading } = useQuery<BrainListing[]>({ queryKey: ['/api/brain-marketplace'] });
  const { data: myListings = [] } = useQuery<BrainListing[]>({ queryKey: ['/api/brain-marketplace/my-listings'] });
  const manualOptInActive = includeManualTrades && sellCategory === 'forex';

  const { data: preview } = useQuery<PreviewStats>({
    queryKey: ['/api/brain-marketplace/my-listings/preview', sellCategory, symbols.join(','), manualOptInActive],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/brain-marketplace/my-listings/preview?sourceCategory=${sellCategory}&symbols=${encodeURIComponent(symbols.join(','))}&includeManualTrades=${manualOptInActive}`);
      return res.json();
    },
  });

  const myBalance = wallet?.veddBalance ?? 0;
  const myActiveListingsForCategory = myListings.filter(l => l.isActive && l.sourceCategory === sellCategory);
  const normSymbols = (s: string[] | null) => (s && s.length ? [...s].map(x => x.toUpperCase()).sort().join(',') : '');
  const editingExisting = myActiveListingsForCategory.find(l => normSymbols(l.symbolFilter) === normSymbols(symbols.length ? symbols : null));

  const listMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/brain-marketplace/list', {
        title,
        description: description || undefined,
        priceVedd: customPrice ? parseInt(customPrice, 10) : undefined,
        sourceCategory: sellCategory,
        symbols: symbols.length ? symbols : undefined,
        includeManualTrades: manualOptInActive,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: editingExisting ? 'Brain updated!' : 'Brain data listed!', description: 'Your trade history is now available in the marketplace.' });
      setTitle('');
      setDescription('');
      setCustomPrice('');
      setSymbolsInput('');
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace/my-listings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace/my-listings/preview'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Listing failed', description: error.message, variant: 'destructive' });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (listingId: number) => (await apiRequest('POST', `/api/brain-marketplace/${listingId}/deactivate`, {})).json(),
    onSuccess: () => {
      toast({ title: 'Listing retired' });
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace'] });
      queryClient.invalidateQueries({ queryKey: ['/api/brain-marketplace/my-listings'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not retire listing', description: error.message, variant: 'destructive' });
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

        {/* Live brain visualization — pulse speed/density scales with real
            marketplace activity (total trades + sales across listings), so
            it's a genuine (if loose) reflection of how much is flowing
            through the network right now, not just decoration. */}
        <Card className="overflow-hidden border-purple-500/20">
          <CardContent className="p-0 relative h-64 md:h-80">
            <BrainVisualization3D
              intensity={0.6 + Math.min(1.9, (listings.reduce((s, l) => s + l.tradeCount + l.purchaseCount * 5, 0)) / 400)}
            />
            <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between pointer-events-none">
              <span className="text-xs font-semibold text-purple-200/80 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1">
                Live neural activity — {listings.length} brain{listings.length === 1 ? '' : 's'} active
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Sell your data */}
        <Card>
          <CardHeader>
            <CardTitle>Sell Your Brain Data</CardTitle>
            <CardDescription>List a snapshot of your trade history. Buyers get a copy — you keep yours.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              {(['forex', 'tradelocker'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSellCategory(cat)}
                  className={`flex-1 text-sm font-semibold rounded-lg px-3 py-2 border transition-colors ${
                    sellCategory === cat ? 'bg-purple-500/15 border-purple-500 text-purple-400' : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {CATEGORY_LABEL[cat]}
                </button>
              ))}
            </div>
            <Input
              placeholder="Pairs to include (optional, comma-separated — e.g. EURUSD, USDJPY). Leave blank for all pairs."
              value={symbolsInput}
              onChange={e => setSymbolsInput(e.target.value)}
            />
            <p className="text-xs text-muted-foreground -mt-2">
              Scoping to specific pairs lets you sell multiple, separate brains at once (e.g. an EURUSD-only brain and a USDJPY-only brain). Re-listing the same pair scope updates that brain with your latest trades instead of creating a duplicate.
            </p>

            {sellCategory === 'forex' && (
              <div className="flex items-start gap-2 rounded-lg border p-3">
                <Checkbox
                  id="include-manual-trades"
                  checked={includeManualTrades}
                  onCheckedChange={c => setIncludeManualTrades(c === true)}
                  className="mt-0.5"
                />
                <label htmlFor="include-manual-trades" className="text-sm cursor-pointer">
                  <span className="font-semibold">Include my manually-logged trades</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Off by default — your discretionary (manually entered) trades live separately from AI-confirmed trades. Turning this on blends them into this brain, and buyers will see it's marked as including manual trades.
                  </p>
                </label>
              </div>
            )}

            {!preview?.eligible ? (
              <p className="text-sm text-muted-foreground">
                You need at least {preview?.minTradesRequired ?? 10} completed trades{symbols.length ? ` on ${symbols.join('/')}` : ''} to list this brain (you have {preview?.tradeCount ?? 0}).
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
                  {listMutation.isPending ? 'Saving…' : editingExisting ? 'Update This Brain' : 'List My Data'}
                </Button>
              </>
            )}

            {myActiveListingsForCategory.length > 0 && (
              <div className="pt-2 space-y-2">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Your Active Brains — {CATEGORY_LABEL[sellCategory]}</p>
                {myActiveListingsForCategory.map(l => (
                  <div key={l.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{l.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {l.symbolFilter?.length ? l.symbolFilter.join('/') : 'All pairs'} · {l.tradeCount} trades{l.includesManualTrades ? ' (incl. manual)' : ''} · {l.priceVedd} VEDD · {l.purchaseCount} sold ({l.purchaseCount * l.priceVedd} VEDD earned)
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => deactivateMutation.mutate(l.id)} disabled={deactivateMutation.isPending}>
                      Retire
                    </Button>
                  </div>
                ))}
              </div>
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
                    <div className="flex flex-wrap gap-1 mb-1">
                      <Badge variant="outline" className="w-fit text-xs">{CATEGORY_LABEL[listing.sourceCategory] ?? 'Forex / MT5 Brain'}</Badge>
                      {listing.symbolFilter?.length ? (
                        <Badge variant="outline" className="w-fit text-xs border-purple-500/40 text-purple-400">{listing.symbolFilter.join('/')}</Badge>
                      ) : null}
                      {listing.includesManualTrades && (
                        <Badge variant="outline" className="w-fit text-xs border-amber-500/40 text-amber-400">Includes manual trades</Badge>
                      )}
                    </div>
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
