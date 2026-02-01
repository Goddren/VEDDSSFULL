import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Search, 
  RefreshCw, 
  TrendingUp, 
  TrendingDown,
  AlertTriangle,
  Clock,
  DollarSign,
  Activity,
  Wallet,
  ExternalLink,
  Copy,
  CheckCircle,
  XCircle,
  Minus,
  Zap
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface TokenAnalysis {
  token: {
    address: string;
    symbol: string;
    name: string;
    priceUsd: string;
    priceChange24h: number;
    volume24h: number;
    liquidity: number;
    fdv: number;
    txns24h: { buys: number; sells: number };
    makers24h: number;
    pairAddress: string;
    dexId: string;
  };
  signal: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL' | 'STRONG_SELL';
  confidence: number;
  holdDuration: string;
  reasoning: string;
  sentimentScore: number;
  tokenomicsScore: number;
  whaleScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';
  entryPrice?: string;
  targetPrice?: string;
  stopLoss?: string;
}

interface ScanResponse {
  success: boolean;
  tokens: TokenAnalysis[];
  scannedAt: string;
}

const signalColors: Record<string, string> = {
  'STRONG_BUY': 'bg-green-500 text-white',
  'BUY': 'bg-green-400 text-white',
  'HOLD': 'bg-yellow-500 text-black',
  'SELL': 'bg-red-400 text-white',
  'STRONG_SELL': 'bg-red-600 text-white',
};

const riskColors: Record<string, string> = {
  'LOW': 'text-green-500',
  'MEDIUM': 'text-yellow-500',
  'HIGH': 'text-orange-500',
  'EXTREME': 'text-red-500',
};

const SignalIcon = ({ signal }: { signal: string }) => {
  if (signal.includes('BUY')) return <TrendingUp className="h-4 w-4" />;
  if (signal.includes('SELL')) return <TrendingDown className="h-4 w-4" />;
  return <Minus className="h-4 w-4" />;
};

function formatNumber(num: number): string {
  if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

function formatPrice(price: string): string {
  const num = parseFloat(price);
  if (num < 0.00001) return `$${num.toExponential(2)}`;
  if (num < 0.01) return `$${num.toFixed(6)}`;
  if (num < 1) return `$${num.toFixed(4)}`;
  return `$${num.toFixed(2)}`;
}

function TokenCard({ analysis }: { analysis: TokenAnalysis }) {
  const { toast } = useToast();
  const { token, signal, confidence, holdDuration, reasoning, sentimentScore, tokenomicsScore, whaleScore, riskLevel, entryPrice, targetPrice, stopLoss } = analysis;
  
  const copyAddress = () => {
    navigator.clipboard.writeText(token.address);
    toast({ title: 'Address copied!', description: token.address.slice(0, 20) + '...' });
  };
  
  const buyRatio = token.txns24h.buys / Math.max(1, token.txns24h.buys + token.txns24h.sells) * 100;
  
  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold">
              {token.symbol.slice(0, 2)}
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                {token.symbol}
                <Badge variant="outline" className="text-xs">{token.dexId}</Badge>
              </CardTitle>
              <CardDescription className="text-xs truncate max-w-[180px]">{token.name}</CardDescription>
            </div>
          </div>
          <Badge className={`${signalColors[signal]} flex items-center gap-1`}>
            <SignalIcon signal={signal} />
            {signal.replace('_', ' ')}
          </Badge>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Price</p>
            <p className="font-semibold text-lg">{formatPrice(token.priceUsd)}</p>
          </div>
          <div className="space-y-1 text-right">
            <p className="text-xs text-muted-foreground">24h Change</p>
            <p className={`font-semibold ${token.priceChange24h >= 0 ? 'text-green-500' : 'text-red-500'}`}>
              {token.priceChange24h >= 0 ? '+' : ''}{token.priceChange24h.toFixed(2)}%
            </p>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 bg-muted/50 rounded">
            <p className="text-xs text-muted-foreground">Volume</p>
            <p className="font-medium text-sm">{formatNumber(token.volume24h)}</p>
          </div>
          <div className="p-2 bg-muted/50 rounded">
            <p className="text-xs text-muted-foreground">Liquidity</p>
            <p className="font-medium text-sm">{formatNumber(token.liquidity)}</p>
          </div>
          <div className="p-2 bg-muted/50 rounded">
            <p className="text-xs text-muted-foreground">FDV</p>
            <p className="font-medium text-sm">{formatNumber(token.fdv)}</p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Buy/Sell Ratio</span>
            <span className={buyRatio > 50 ? 'text-green-500' : 'text-red-500'}>{buyRatio.toFixed(0)}% Buys</span>
          </div>
          <Progress value={buyRatio} className="h-2" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{token.txns24h.buys.toLocaleString()} buys</span>
            <span>{token.txns24h.sells.toLocaleString()} sells</span>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Sentiment</p>
            <div className="flex items-center justify-center gap-1">
              <Activity className="h-3 w-3 text-blue-500" />
              <span className="font-bold text-sm">{sentimentScore}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Tokenomics</p>
            <div className="flex items-center justify-center gap-1">
              <DollarSign className="h-3 w-3 text-green-500" />
              <span className="font-bold text-sm">{tokenomicsScore}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs text-muted-foreground mb-1">Whale Activity</p>
            <div className="flex items-center justify-center gap-1">
              <Wallet className="h-3 w-3 text-purple-500" />
              <span className="font-bold text-sm">{whaleScore}</span>
            </div>
          </div>
        </div>
        
        <div className="p-3 bg-muted/30 rounded-lg space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Hold Duration</span>
            </div>
            <span className="text-sm font-bold">{holdDuration}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className={`h-4 w-4 ${riskColors[riskLevel]}`} />
              <span className="text-sm font-medium">Risk Level</span>
            </div>
            <span className={`text-sm font-bold ${riskColors[riskLevel]}`}>{riskLevel}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Confidence</span>
            <span className="text-sm font-bold">{confidence}%</span>
          </div>
        </div>
        
        {(targetPrice || stopLoss) && (
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="text-center p-2 bg-blue-500/10 rounded">
              <p className="text-muted-foreground">Entry</p>
              <p className="font-medium text-blue-500">{formatPrice(entryPrice || '0')}</p>
            </div>
            {targetPrice && (
              <div className="text-center p-2 bg-green-500/10 rounded">
                <p className="text-muted-foreground">Target</p>
                <p className="font-medium text-green-500">{formatPrice(targetPrice)}</p>
              </div>
            )}
            {stopLoss && (
              <div className="text-center p-2 bg-red-500/10 rounded">
                <p className="text-muted-foreground">Stop Loss</p>
                <p className="font-medium text-red-500">{formatPrice(stopLoss)}</p>
              </div>
            )}
          </div>
        )}
        
        <p className="text-xs text-muted-foreground leading-relaxed">{reasoning}</p>
        
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={copyAddress}>
            <Copy className="h-3 w-3 mr-1" />
            Copy Address
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1"
            onClick={() => window.open(`https://dexscreener.com/solana/${token.pairAddress}`, '_blank')}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            DexScreener
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export default function SolanaScanner() {
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  
  const { data: scanData, isLoading, refetch, isFetching } = useQuery<ScanResponse>({
    queryKey: ['/api/solana/scan', { limit: 12 }],
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
  
  const [searchResults, setSearchResults] = useState<TokenAnalysis[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const searchMutation = useMutation({
    mutationFn: async (query: string) => {
      setIsSearching(true);
      const res = await apiRequest('GET', `/api/solana/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      
      if (data.tokens?.length > 0) {
        // Analyze each found token
        const analyses: TokenAnalysis[] = [];
        for (const token of data.tokens.slice(0, 5)) {
          try {
            const analyzeRes = await apiRequest('GET', `/api/solana/analyze/${token.address}`);
            const analyzeData = await analyzeRes.json();
            if (analyzeData.success && analyzeData.analysis) {
              analyses.push(analyzeData.analysis);
            }
          } catch (e) {
            console.error('Failed to analyze token', token.symbol);
          }
        }
        return { tokens: data.tokens, analyses };
      }
      return { tokens: [], analyses: [] };
    },
    onSuccess: (data) => {
      setIsSearching(false);
      if (data.analyses?.length > 0) {
        setSearchResults(data.analyses);
        toast({ title: `Analyzed ${data.analyses.length} tokens from search` });
      } else if (data.tokens?.length > 0) {
        toast({ title: `Found ${data.tokens.length} tokens but analysis failed`, variant: 'destructive' });
      } else {
        toast({ title: 'No tokens found', variant: 'destructive' });
      }
    },
    onError: () => {
      setIsSearching(false);
      toast({ title: 'Search failed', variant: 'destructive' });
    }
  });
  
  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchMutation.mutate(searchQuery);
    }
  };
  
  const tokens = scanData?.tokens || [];
  const buySignals = tokens.filter(t => t.signal === 'STRONG_BUY' || t.signal === 'BUY');
  const holdSignals = tokens.filter(t => t.signal === 'HOLD');
  const sellSignals = tokens.filter(t => t.signal === 'SELL' || t.signal === 'STRONG_SELL');
  
  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center">
            <SiSolana className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">Solana Token Scanner</h1>
            <p className="text-muted-foreground">AI-powered buy/sell signals based on sentiment, tokenomics & whale activity</p>
          </div>
        </div>
        
        <Button onClick={() => refetch()} disabled={isFetching} size="lg">
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          {isFetching ? 'Scanning...' : 'Scan Now'}
        </Button>
      </div>
      
      <div className="flex gap-2">
        <Input
          placeholder="Search by token name, symbol, or address..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-md"
        />
        <Button onClick={handleSearch} disabled={searchMutation.isPending || isSearching}>
          <Search className={`h-4 w-4 mr-2 ${isSearching ? 'animate-pulse' : ''}`} />
          {isSearching ? 'Analyzing...' : 'Search'}
        </Button>
        {searchResults.length > 0 && (
          <Button variant="outline" onClick={() => { setSearchResults([]); setSearchQuery(''); }}>
            Clear
          </Button>
        )}
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Tokens Scanned</p>
                <p className="text-2xl font-bold">{tokens.length}</p>
              </div>
              <Zap className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-500/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Buy Signals</p>
                <p className="text-2xl font-bold text-green-500">{buySignals.length}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Hold Signals</p>
                <p className="text-2xl font-bold text-yellow-500">{holdSignals.length}</p>
              </div>
              <Minus className="h-8 w-8 text-yellow-500" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-red-500/50">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sell Signals</p>
                <p className="text-2xl font-bold text-red-500">{sellSignals.length}</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {scanData?.scannedAt && !searchResults.length && (
        <p className="text-sm text-muted-foreground text-center">
          Last scanned: {new Date(scanData.scannedAt).toLocaleString()}
        </p>
      )}
      
      {searchResults.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Search Results for "{searchQuery}"</h2>
            <Badge variant="secondary">{searchResults.length} tokens</Badge>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {searchResults.map((analysis, idx) => (
              <TokenCard key={analysis.token.address + idx} analysis={analysis} />
            ))}
          </div>
          <hr className="my-8" />
          <h2 className="text-xl font-semibold">Trending Tokens</h2>
        </>
      )}
      
      {isLoading ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent className="space-y-3">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : tokens.length > 0 ? (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tokens.map((analysis, idx) => (
            <TokenCard key={analysis.token.address + idx} analysis={analysis} />
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
          <SiSolana className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-semibold mb-2">No tokens scanned yet</h3>
          <p className="text-muted-foreground mb-4">Click "Scan Now" to analyze trending Solana tokens</p>
          <Button onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Start Scanning
          </Button>
        </Card>
      )}
      
      <Card className="bg-muted/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-500" />
            Disclaimer
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This scanner provides AI-generated trading signals for educational purposes only. 
            Cryptocurrency trading involves significant risk. Always do your own research (DYOR) 
            before making any investment decisions. Past performance does not guarantee future results. 
            Never invest more than you can afford to lose.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
