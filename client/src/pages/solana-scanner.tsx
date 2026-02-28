import React, { useState, useEffect, useCallback } from 'react';
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
  Zap,
  Settings,
  Power,
  Target,
  Shield,
  PlusCircle,
  LinkIcon,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Brain,
  Share2,
  Download,
  Twitter,
  Eye,
  History,
  Gift,
  Users,
  BarChart3,
  Trash2
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Link } from 'wouter';
import VeddLogo from '@/components/ui/vedd-logo';
import { buyToken, sellToken } from '@/lib/jupiter-swap';
import type { SwapResult } from '@/lib/jupiter-swap';
import { Connection } from '@solana/web3.js';
import { SiSolana } from 'react-icons/si';
import { useToast } from '@/hooks/use-toast';
import { useSolanaWallet } from '@/hooks/use-solana-wallet';
import { useNotifications } from '@/hooks/use-notifications';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

type DexSource = 'all' | 'raydium' | 'orca' | 'meteora' | 'pumpfun' | 'jupiter';

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
    dexSource?: DexSource;
    availableDexes?: string[];
    poolType?: string;
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
  recommendedSolAmount?: number;
}

interface ScanResponse {
  success: boolean;
  tokens: TokenAnalysis[];
  scannedAt: string;
  dexFilter?: DexSource;
}

const DEX_OPTIONS: { value: DexSource; label: string; color: string }[] = [
  { value: 'all', label: 'All DEXs', color: 'text-white' },
  { value: 'raydium', label: 'Raydium', color: 'text-purple-400' },
  { value: 'orca', label: 'Orca', color: 'text-cyan-400' },
  { value: 'meteora', label: 'Meteora', color: 'text-yellow-400' },
  { value: 'pumpfun', label: 'Pump.fun', color: 'text-green-400' },
  { value: 'jupiter', label: 'Jupiter', color: 'text-orange-400' },
];

function getDexBadgeColor(dexId: string): string {
  const d = (dexId || '').toLowerCase();
  if (d.includes('raydium')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  if (d.includes('orca') || d.includes('whirlpool')) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30';
  if (d.includes('meteora')) return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
  if (d.includes('pump')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
}

function getDexDisplayName(dexId: string): string {
  const d = (dexId || '').toLowerCase();
  if (d.includes('raydium')) return 'Raydium';
  if (d.includes('orca') || d.includes('whirlpool')) return 'Orca';
  if (d.includes('meteora')) return 'Meteora';
  if (d.includes('pump')) return 'Pump.fun';
  return dexId || 'DEX';
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

function TokenCard({ analysis, onBuy, isBuying }: { analysis: TokenAnalysis; onBuy?: (tokenAddress: string, symbol: string) => void; isBuying?: boolean }) {
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
                <Badge variant="outline" className={`text-xs ${getDexBadgeColor(token.dexId)}`}>
                  {getDexDisplayName(token.dexId)}
                </Badge>
                {token.poolType && (
                  <Badge variant="outline" className="text-xs opacity-70">{token.poolType}</Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-1">
                <CardDescription className="text-xs truncate max-w-[140px]">{token.name}</CardDescription>
                {token.availableDexes && token.availableDexes.length > 1 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    +{token.availableDexes.length - 1} DEX
                  </Badge>
                )}
              </div>
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
            Copy
          </Button>
          <Button 
            size="sm" 
            variant="outline" 
            className="flex-1"
            onClick={() => window.open(`https://dexscreener.com/solana/${token.pairAddress}`, '_blank')}
          >
            <ExternalLink className="h-3 w-3 mr-1" />
            Chart
          </Button>
          {onBuy && (signal === 'STRONG_BUY' || signal === 'BUY') && (
            <Button 
              size="sm" 
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => onBuy(token.address, token.symbol)}
              disabled={isBuying}
            >
              {isBuying ? (
                <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Zap className="h-3 w-3 mr-1" />
              )}
              Buy
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TradingWallet {
  id: number;
  solBalance: number;
  lockedBalance: number;
  totalProfitLoss: number;
  isAutoTradeEnabled: boolean;
  maxPositions: number;
  tradeAmountSol: number;
  takeProfitPercent: number;
  stopLossPercent: number;
  minSignalConfidence: number;
  isAutoRebalanceEnabled: boolean;
  rebalanceThresholdPercent: number;
}

interface WalletToken {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  decimals: number;
  uiAmount: number;
  priceUsd: number | null;
  valueUsd: number | null;
}

interface TokenPosition {
  id: number;
  tokenSymbol: string;
  tokenName: string;
  tokenAddress: string;
  entryPriceSol: number;
  currentPriceSol: number;
  amountSolInvested: number;
  tokenAmount: number;
  unrealizedPL: number;
  status: string;
  signalType: string;
  openedAt: string;
}

const WALLET_RPC_ENDPOINTS = [
  'https://rpc.ankr.com/solana',
  'https://solana.public-rpc.com',
  'https://api.mainnet-beta.solana.com',
  'https://mainnet.helius-rpc.com/?api-key=15319bf4-5b40-4958-ac8d-6313aa55eb92',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function MyWalletTokens() {
  const { toast } = useToast();
  const { connected, walletData, signAndSendTransaction, getPublicKey, refreshWalletData, getConnection } = useSolanaWallet();
  const { playSound, notifyTradeSignal } = useNotifications();
  const [sellingToken, setSellingToken] = useState<string | null>(null);
  const [walletTokens, setWalletTokens] = useState<WalletToken[]>([]);
  const [loadingTokens, setLoadingTokens] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [tokenSignals, setTokenSignals] = useState<Map<string, TokenAnalysis>>(new Map());
  const [analyzingTokens, setAnalyzingTokens] = useState(false);
  const [notifiedSellSignals, setNotifiedSellSignals] = useState<Set<string>>(new Set());
  const [monitoringEnabled, setMonitoringEnabled] = useState(true);
  
  // Analyze wallet tokens for signals
  const analyzeWalletTokens = async () => {
    if (walletTokens.length === 0) return;
    setAnalyzingTokens(true);
    
    const signalMap = new Map<string, TokenAnalysis>();
    
    for (const token of walletTokens) {
      try {
        const response = await fetch(`/api/solana/search?query=${token.mint}`);
        const data = await response.json();
        if (data.success && data.tokens && data.tokens.length > 0) {
          signalMap.set(token.mint, data.tokens[0]);
        }
      } catch (e) {
        console.log(`Failed to get signal for ${token.symbol}`);
      }
    }
    
    setTokenSignals(signalMap);
    setAnalyzingTokens(false);
    
    // Check for sell signals and notify
    if (monitoringEnabled) {
      signalMap.forEach((analysis, mint) => {
        if ((analysis.signal === 'SELL' || analysis.signal === 'STRONG_SELL') && !notifiedSellSignals.has(mint)) {
          const token = walletTokens.find(t => t.mint === mint);
          if (token) {
            playSound('alert');
            notifyTradeSignal(token.symbol, analysis.signal, analysis.confidence);
            toast({
              title: `⚠️ Sell Signal: ${token.symbol}`,
              description: `${analysis.signal} signal detected at ${analysis.confidence}% confidence`,
              variant: 'destructive'
            });
            setNotifiedSellSignals(prev => {
              const next = new Set(Array.from(prev));
              next.add(mint);
              return next;
            });
          }
        }
      });
    }
  };
  
  // Monitor wallet tokens periodically
  useEffect(() => {
    if (!connected || walletTokens.length === 0 || !monitoringEnabled) return;
    
    // Initial analysis
    analyzeWalletTokens();
    
    // Re-analyze every 60 seconds
    const interval = setInterval(analyzeWalletTokens, 60000);
    return () => clearInterval(interval);
  }, [connected, walletTokens.length, monitoringEnabled]);
  
  const fetchWalletTokens = async () => {
    if (!connected || !walletData?.address) {
      console.log('MyWalletTokens: Not fetching - connected:', connected, 'address:', walletData?.address);
      return;
    }
    setLoadingTokens(true);
    setFetchError(null);
    
    console.log('MyWalletTokens: Starting fetch for address:', walletData.address);
    
    try {
      // Use server-side API to avoid client RPC rate limiting
      const response = await fetch(`/api/solana/wallet-tokens/${walletData.address}`);
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch wallet tokens');
      }
      
      console.log('MyWalletTokens: Got', data.tokens?.length || 0, 'tokens from server');
      
      const tokens: WalletToken[] = (data.tokens || []).map((t: any) => ({
        mint: t.mint,
        symbol: t.symbol,
        name: t.name,
        amount: parseInt(t.amount) || 0,
        decimals: t.decimals,
        uiAmount: t.uiAmount,
        priceUsd: t.priceUsd,
        valueUsd: t.valueUsd,
      }));
      
      console.log('MyWalletTokens: Setting', tokens.length, 'tokens');
      setWalletTokens(tokens);
    } catch (error: any) {
      console.error('MyWalletTokens: Failed to fetch wallet tokens:', error);
      setFetchError(error.message || 'Failed to load tokens');
      toast({
        title: 'Failed to load wallet tokens',
        description: error.message || 'Server error. Try again in a moment.',
        variant: 'destructive'
      });
    } finally {
      setLoadingTokens(false);
    }
  };
  
  useEffect(() => {
    if (connected && walletData?.address) {
      fetchWalletTokens();
    }
  }, [connected, walletData?.address]);
  
  const handleSellToken = async (token: WalletToken) => {
    if (!connected) return;
    const publicKey = getPublicKey();
    if (!publicKey) return;
    
    setSellingToken(token.mint);
    toast({ title: `Selling ${token.symbol}...`, description: `Swapping to SOL via Jupiter` });
    
    try {
      const result = await sellToken(
        token.mint,
        token.uiAmount,
        token.decimals,
        signAndSendTransaction,
        publicKey.toString(),
        150
      );
      
      if (result.success) {
        toast({ 
          title: 'Sold!', 
          description: `Received ${result.outputAmount.toFixed(4)} SOL - TX: ${result.signature?.slice(0, 8)}...`
        });
        refreshWalletData();
        fetchWalletTokens();
      } else {
        toast({ title: 'Sell failed', description: result.error, variant: 'destructive' });
      }
    } catch (error: any) {
      toast({ title: 'Sell error', description: error.message, variant: 'destructive' });
    } finally {
      setSellingToken(null);
    }
  };
  
  if (!connected) return null;
  
  return (
    <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-blue-400">
            <Wallet className="h-5 w-5" />
            My Wallet Tokens
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={analyzeWalletTokens} 
              disabled={analyzingTokens || walletTokens.length === 0}
              title="Analyze tokens for signals"
            >
              <Brain className={`h-4 w-4 ${analyzingTokens ? 'animate-pulse text-purple-400' : ''}`} />
            </Button>
            <Button variant="ghost" size="sm" onClick={fetchWalletTokens} disabled={loadingTokens}>
              <RefreshCw className={`h-4 w-4 ${loadingTokens ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
        <CardDescription className="flex items-center justify-between">
          <span>Tokens in your connected Phantom wallet</span>
          <div className="flex items-center gap-2">
            <span className="text-xs">Signal Monitor</span>
            <Switch
              checked={monitoringEnabled}
              onCheckedChange={setMonitoringEnabled}
              className="scale-75"
            />
            {monitoringEnabled && analyzingTokens && (
              <Badge variant="outline" className="text-xs bg-purple-500/20 text-purple-300">
                Analyzing...
              </Badge>
            )}
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loadingTokens ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : walletTokens.length > 0 ? (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {walletTokens.map((token) => {
              const signal = tokenSignals.get(token.mint);
              const signalColor = signal ? (
                signal.signal === 'STRONG_BUY' || signal.signal === 'BUY' ? 'bg-green-500/20 text-green-400 border-green-500/30' :
                signal.signal === 'STRONG_SELL' || signal.signal === 'SELL' ? 'bg-red-500/20 text-red-400 border-red-500/30 animate-pulse' :
                'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
              ) : '';
              
              return (
                <div key={token.mint} className={`flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border ${(signal?.signal === 'SELL' || signal?.signal === 'STRONG_SELL') ? 'border-red-500/50' : 'border-gray-700'} hover:border-blue-500/50 transition-colors`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold">
                      {token.symbol.slice(0, 2)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium">{token.symbol}</p>
                        {signal && (
                          <Badge className={`text-xs ${signalColor}`}>
                            {signal.signal} {signal.confidence}%
                          </Badge>
                        )}
                        <a 
                          href={`https://dexscreener.com/solana/${token.mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 hover:text-blue-300"
                          title="View on DexScreener"
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                      <p className="text-xs text-muted-foreground">{token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate max-w-[120px]">{token.mint.slice(0, 6)}...{token.mint.slice(-4)}</p>
                    </div>
                  </div>
                  <div className="text-right flex items-center gap-2">
                    {token.valueUsd !== null ? (
                      <div>
                        <p className="font-bold">${token.valueUsd.toFixed(2)}</p>
                        <p className="text-xs text-muted-foreground">${token.priceUsd?.toFixed(8)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">Price unavailable</p>
                    )}
                    <a 
                      href={`https://solscan.io/token/${token.mint}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded bg-gray-700/50 hover:bg-gray-600/50 text-blue-400"
                      title="View on Solscan"
                    >
                      <Search className="h-3.5 w-3.5" />
                    </a>
                    <Button
                      size="sm"
                      variant={signal?.signal === 'SELL' || signal?.signal === 'STRONG_SELL' ? 'destructive' : 'outline'}
                      onClick={() => handleSellToken(token)}
                      disabled={sellingToken === token.mint}
                      className={signal?.signal === 'SELL' || signal?.signal === 'STRONG_SELL' ? 'animate-pulse' : ''}
                    >
                      {sellingToken === token.mint ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Sell'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : fetchError ? (
          <div className="text-center py-6 text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-yellow-500" />
            <p className="text-yellow-400">{fetchError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={fetchWalletTokens}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No tokens found in wallet</p>
            <p className="text-xs mt-1">Buy tokens from the scanner below</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AutoTradingPanel() {
  const { toast } = useToast();
  const [depositAmount, setDepositAmount] = useState('');
  const [buyingToken, setBuyingToken] = useState<string | null>(null);
  const [autoTradeLog, setAutoTradeLog] = useState<string[]>([]);
  const [recentlyBought, setRecentlyBought] = useState<Set<string>>(new Set());
  const { connected, connecting, walletData, connect, disconnect, signAndSendTransaction, getPublicKey, refreshWalletData, error } = useSolanaWallet();
  const { permission, soundEnabled, requestPermission, playSound, notifyTradeSignal, notifyTradeExecuted, notifyTakeProfitHit, notifyStopLossHit, toggleSound } = useNotifications();
  
  // Position tracking for auto-sell with AI reasoning
  interface TrackedPosition {
    tokenAddress: string;
    symbol: string;
    purchasePrice: number;
    purchaseAmount: number;
    decimals: number;
    purchasedAt: string;
    // AI reasoning and confidence
    signal: string;
    confidence: number;
    reasoning: string[];
    sentimentScore: number;
    tokenomicsScore: number;
    whaleScore: number;
    // Token info for display
    tokenName: string;
    tokenImage?: string;
    marketCap?: number;
    volume24h?: number;
    fdv?: number;
    // PnL tracking
    currentPrice?: number;
    pnlPercent?: number;
    // Staged volume-adjusted trailing stop
    trailingHighPrice: number;
    trailingFloor: number;
    volumeStatus?: string;
    approachAlertFired?: boolean;
  }
  
  interface ClosedPosition extends TrackedPosition {
    soldAt: string;
    soldPrice: number;
    soldAmount: number; // SOL received
    finalPnlPercent: number;
    exitReason: 'take_profit' | 'stop_loss' | 'pump_detected' | 'manual_sell' | 'trailing_stop';
    txSignature?: string;
  }
  
  // Load tracked positions from localStorage on mount
  const [trackedPositions, setTrackedPositions] = useState<Map<string, TrackedPosition>>(() => {
    try {
      const stored = localStorage.getItem('trackedPositions');
      if (stored) {
        const parsed = JSON.parse(stored);
        return new Map(Object.entries(parsed));
      }
    } catch (e) {}
    return new Map();
  });
  
  // Load closed positions history from localStorage
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>(() => {
    try {
      const stored = localStorage.getItem('closedPositions');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {}
    return [];
  });
  
  // Use ref for sellingToken to avoid stale closure issues
  const sellingTokenRef = React.useRef<string | null>(null);
  const [sellingToken, setSellingToken] = useState<string | null>(null);
  
  // Persist tracked positions to localStorage when they change
  useEffect(() => {
    const obj: Record<string, TrackedPosition> = {};
    Array.from(trackedPositions.entries()).forEach(([k, v]) => {
      obj[k] = v;
    });
    localStorage.setItem('trackedPositions', JSON.stringify(obj));
  }, [trackedPositions]);
  
  // Persist closed positions to localStorage when they change
  useEffect(() => {
    localStorage.setItem('closedPositions', JSON.stringify(closedPositions));
  }, [closedPositions]);
  
  // Helper to save a closed position
  const saveClosedPosition = useCallback((
    position: TrackedPosition, 
    soldPrice: number, 
    soldAmount: number, 
    exitReason: ClosedPosition['exitReason'],
    txSignature?: string
  ) => {
    const finalPnlPercent = ((soldPrice - position.purchasePrice) / position.purchasePrice) * 100;
    const closedPos: ClosedPosition = {
      ...position,
      soldAt: new Date().toISOString(),
      soldPrice,
      soldAmount,
      finalPnlPercent,
      exitReason,
      txSignature,
    };
    setClosedPositions(prev => [closedPos, ...prev].slice(0, 50)); // Keep last 50 trades
  }, []);
  
  // Keep ref in sync with state
  useEffect(() => {
    sellingTokenRef.current = sellingToken;
  }, [sellingToken]);
  
  // Use phantom wallet-based settings when connected (no login required)
  const phantomAddress = connected ? walletData?.address : null;
  
  const { data: wallet, isLoading: walletLoading, refetch: refetchWallet } = useQuery<TradingWallet>({
    queryKey: phantomAddress ? ['/api/trading/phantom-wallet', phantomAddress] : ['/api/trading/wallet'],
    queryFn: async () => {
      const url = phantomAddress 
        ? `/api/trading/phantom-wallet/${phantomAddress}` 
        : '/api/trading/wallet';
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch wallet');
      return res.json();
    },
    refetchInterval: 30000,
    enabled: connected || true, // Always fetch, phantom or user wallet
  });
  
  const { data: positions, refetch: refetchPositions } = useQuery<TokenPosition[]>({
    queryKey: ['/api/trading/positions'],
    refetchInterval: 10000,
  });
  
  // Fetch scan data for auto-trading
  const { data: scanData } = useQuery<ScanResponse>({
    queryKey: ['/api/solana/scan', { limit: 12 }],
    refetchInterval: wallet?.isAutoTradeEnabled ? 60000 : false, // Auto-refresh when enabled
  });
  
  // Fetch wallet tokens for position tracking
  const [walletTokenMints, setWalletTokenMints] = useState<Set<string>>(new Set());
  
  // Get connection from wallet hook
  const { getConnection: getWalletConnection } = useSolanaWallet();
  
  // Refresh wallet token mints periodically for position tracking
  useEffect(() => {
    if (!connected || !walletData?.address) return;
    
    const refreshTokenMints = async () => {
      try {
        const { PublicKey } = await import('@solana/web3.js');
        const connection = getWalletConnection();
        const publicKey = new PublicKey(walletData.address);
        
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA')
        });
        
        const mints = new Set<string>();
        for (const account of tokenAccounts.value) {
          const info = account.account.data.parsed.info;
          if (info.tokenAmount.uiAmount > 0) {
            mints.add(info.mint);
          }
        }
        setWalletTokenMints(mints);
      } catch (error) {
        console.error('Failed to refresh token mints:', error);
      }
    };
    
    refreshTokenMints();
    const interval = setInterval(refreshTokenMints, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [connected, walletData?.address]);
  
  // Auto-trade execution effect
  useEffect(() => {
    if (!wallet?.isAutoTradeEnabled || !connected || !scanData?.tokens) return;
    
    const publicKey = getPublicKey();
    if (!publicKey) return;
    
    const executeAutoTrade = async () => {
      const minConfidence = wallet.minSignalConfidence || 70;
      const maxPositions = wallet.maxPositions || 3;
      const tradeAmount = wallet.tradeAmountSol || 0.1;
      const balance = walletData?.solBalance || 0;
      
      // Use actual wallet token count for position tracking
      const openPositionCount = walletTokenMints.size;
      if (openPositionCount >= maxPositions) {
        const timestamp = new Date().toLocaleTimeString();
        setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: Max positions (${maxPositions}) reached - skipping`]);
        return;
      }
      
      if (balance < tradeAmount) {
        const timestamp = new Date().toLocaleTimeString();
        setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: Insufficient balance (${balance.toFixed(4)} SOL < ${tradeAmount} SOL)`]);
        return;
      }
      
      // Find strong buy signals we haven't already bought (check actual wallet tokens)
      const strongSignals = scanData.tokens.filter(t => 
        (t.signal === 'STRONG_BUY' || t.signal === 'BUY') &&
        t.confidence >= minConfidence &&
        !walletTokenMints.has(t.token.address) && // Don't buy tokens we already hold
        !recentlyBought.has(t.token.address)
      );
      
      if (strongSignals.length === 0) return;
      
      // Take the strongest signal
      const bestSignal = strongSignals[0];
      const tokenAddress = bestSignal.token.address;
      const tokenSymbol = bestSignal.token.symbol;
      
      // Add to recently bought to prevent double-buying
      setRecentlyBought(prev => new Set(prev).add(tokenAddress));
      setBuyingToken(tokenAddress);
      
      const timestamp = new Date().toLocaleTimeString();
      setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: Auto-buying ${tokenSymbol} (${bestSignal.confidence}% confidence)`]);
      
      // Send notification and play sound for trade signal
      notifyTradeSignal(tokenSymbol, bestSignal.signal, bestSignal.confidence);
      
      toast({ 
        title: `Auto-Trade: Buying ${tokenSymbol}`, 
        description: `Signal: ${bestSignal.signal} at ${bestSignal.confidence}% confidence`
      });
      
      try {
        const result = await buyToken(
          tokenAddress,
          tradeAmount,
          signAndSendTransaction,
          publicKey.toString(),
          150 // 1.5% slippage for auto-trades
        );
        
        if (result.success) {
          setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: SUCCESS - Bought ${tokenSymbol} for ${result.inputAmount.toFixed(4)} SOL`]);
          // Track position for auto-sell with AI reasoning
          const currentPrice = parseFloat(bestSignal.token.priceUsd);
          const tokenDecimals = result.outputDecimals || 9;
          
          // Generate AI reasoning for why this trade was made
          const reasoning: string[] = [];
          const buyRatio = bestSignal.token.txns24h.buys / (bestSignal.token.txns24h.buys + bestSignal.token.txns24h.sells || 1);
          const volumeToLiquidity = bestSignal.token.volume24h / (bestSignal.token.liquidity || 1);
          
          if (bestSignal.token.priceChange24h > 10) reasoning.push(`Strong momentum: +${bestSignal.token.priceChange24h.toFixed(1)}% in 24h`);
          if (buyRatio > 0.6) reasoning.push(`Bullish pressure: ${(buyRatio * 100).toFixed(0)}% buys`);
          if (volumeToLiquidity > 0.5) reasoning.push(`High trading activity vs liquidity`);
          if (bestSignal.sentimentScore >= 70) reasoning.push(`Strong sentiment score: ${bestSignal.sentimentScore}/100`);
          if (bestSignal.tokenomicsScore >= 70) reasoning.push(`Solid tokenomics: ${bestSignal.tokenomicsScore}/100`);
          if (bestSignal.whaleScore >= 70) reasoning.push(`Whale interest detected: ${bestSignal.whaleScore}/100`);
          if (bestSignal.confidence >= 80) reasoning.push(`High AI confidence: ${bestSignal.confidence}%`);
          if (reasoning.length === 0) reasoning.push(`Signal: ${bestSignal.signal} with ${bestSignal.confidence}% confidence`);
          
          setTrackedPositions(prev => {
            const next = new Map(prev);
            next.set(tokenAddress, {
              tokenAddress,
              symbol: tokenSymbol,
              purchasePrice: currentPrice,
              purchaseAmount: result.outputAmount,
              decimals: tokenDecimals,
              purchasedAt: new Date().toISOString(),
              // AI analysis data
              signal: bestSignal.signal,
              confidence: bestSignal.confidence,
              reasoning,
              sentimentScore: bestSignal.sentimentScore,
              tokenomicsScore: bestSignal.tokenomicsScore,
              whaleScore: bestSignal.whaleScore,
              // Token info
              tokenName: bestSignal.token.name,
              tokenImage: undefined,
              marketCap: bestSignal.token.fdv,
              volume24h: bestSignal.token.volume24h,
              fdv: bestSignal.token.fdv,
              // Trailing stop — initialised to entry price
              trailingHighPrice: currentPrice,
              trailingFloor: currentPrice,
              volumeStatus: 'average',
              approachAlertFired: false,
            });
            return next;
          });
          // Notify success
          notifyTradeExecuted(tokenSymbol, 'bought', result.inputAmount);
          const txSig = result.signature || '';
          toast({ 
            title: 'Auto-Trade Executed!', 
            description: `Bought ${tokenSymbol} with ${result.inputAmount.toFixed(4)} SOL`,
            action: txSig ? (
              <a 
                href={`https://solscan.io/tx/${txSig}`} 
                target="_blank" 
                rel="noopener noreferrer"
                className="underline text-purple-400 hover:text-purple-300"
              >
                View TX
              </a>
            ) : undefined
          });
          console.log('[Auto-Trade] Transaction signature:', txSig);
          console.log('[Auto-Trade] View on Solscan:', `https://solscan.io/tx/${txSig}`);
          // Wait a bit for blockchain to update, then refresh
          setTimeout(() => refreshWalletData(), 3000);
        } else {
          setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: FAILED - ${result.error}`]);
          playSound('error');
          // Remove from recently bought so we can retry
          setRecentlyBought(prev => {
            const next = new Set(prev);
            next.delete(tokenAddress);
            return next;
          });
        }
      } catch (error: any) {
        setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: ERROR - ${error.message}`]);
        playSound('error');
      } finally {
        setBuyingToken(null);
      }
    };
    
    executeAutoTrade();
  }, [scanData?.scannedAt, wallet?.isAutoTradeEnabled, connected]);
  
  // Helper: compute staged volume-adjusted trail distance (%)
  const computeTrailDistance = (gainPct: number, volStatus: string): number => {
    const isStrong = volStatus === 'surging' || volStatus === 'above_average';
    const isWeak = volStatus === 'below_average' || volStatus === 'dry';
    if (gainPct >= 80) return isStrong ? 10 : isWeak ? 6 : 8;
    if (gainPct >= 40) return isStrong ? 12 : isWeak ? 8 : 10;
    return isStrong ? 15 : isWeak ? 10 : 12; // 20-39% zone
  };

  // Auto-sell monitoring — staged volume-adjusted trailing stop + approach alerts
  useEffect(() => {
    if (!wallet?.isAutoTradeEnabled || !connected || trackedPositions.size === 0 || !scanData?.tokens) return;
    
    const publicKey = getPublicKey();
    if (!publicKey) return;
    
    const checkAutoSell = async () => {
      const stopLossPercent = wallet.stopLossPercent || 20;
      
      for (const [tokenAddress, position] of Array.from(trackedPositions.entries())) {
        if (sellingTokenRef.current === tokenAddress) continue;
        
        const currentData = scanData.tokens.find(t => t.token.address === tokenAddress);
        if (!currentData) continue;
        
        const currentPrice = parseFloat(currentData.token.priceUsd);
        const gainPct = ((currentPrice - position.purchasePrice) / position.purchasePrice) * 100;
        const timestamp = new Date().toLocaleTimeString();

        // ── Determine volume status from current scan data ──────────────
        const volStatus = (() => {
          const entryVol = position.volume24h || 0;
          const curVol = currentData.token.volume24h || 0;
          if (entryVol <= 0) return 'average';
          const ratio = curVol / entryVol;
          if (ratio >= 2.5) return 'surging';
          if (ratio >= 1.25) return 'above_average';
          if (ratio <= 0.5) return 'dry';
          if (ratio <= 0.75) return 'below_average';
          return 'average';
        })();

        // ── Update trailing high + compute new floor ────────────────────
        const newHigh = Math.max(position.trailingHighPrice, currentPrice);
        let newFloor = position.trailingFloor;

        if (gainPct >= 20) {
          const dist = computeTrailDistance(gainPct, volStatus);
          const computedFloor = newHigh * (1 - dist / 100);
          // Apply breakeven floor: floor never goes below entry once ≥8%
          const beFloor = gainPct >= 8 ? position.purchasePrice : 0;
          newFloor = Math.max(computedFloor, beFloor, position.trailingFloor);
        } else if (gainPct >= 8) {
          // Breakeven only — move floor up to entry price but don't trail yet
          newFloor = Math.max(position.trailingFloor, position.purchasePrice);
        }

        // ── Approach warning — within 3% above trail floor ─────────────
        const distFromFloor = newFloor > 0 ? ((currentPrice - newFloor) / newFloor) * 100 : 999;
        const nearFloor = gainPct >= 8 && distFromFloor <= 3;
        let newApproachFired = position.approachAlertFired;

        if (nearFloor && !position.approachAlertFired) {
          playSound('alert');
          notifyStopLossHit(position.symbol, gainPct);
          setAutoTradeLog(prev => [
            ...prev.slice(-9),
            `${timestamp}: ⚠️ TRAIL FLOOR NEAR — ${position.symbol} is ${distFromFloor.toFixed(1)}% above floor $${newFloor.toFixed(position.purchasePrice < 0.01 ? 8 : 6)} — GET READY TO APPROVE SELL`,
          ]);
          newApproachFired = true;
        } else if (!nearFloor && position.approachAlertFired && distFromFloor > 5) {
          // Reset alert if price moves away
          newApproachFired = false;
        }

        // ── Update position state with new trail data ───────────────────
        if (newHigh !== position.trailingHighPrice || newFloor !== position.trailingFloor || volStatus !== position.volumeStatus || newApproachFired !== position.approachAlertFired) {
          setTrackedPositions(prev => {
            const next = new Map(prev);
            const pos = next.get(tokenAddress);
            if (pos) next.set(tokenAddress, { ...pos, trailingHighPrice: newHigh, trailingFloor: newFloor, volumeStatus: volStatus, approachAlertFired: newApproachFired });
            return next;
          });
        }

        // ── TRAILING STOP HIT — trigger sell ───────────────────────────
        if (gainPct >= 8 && currentPrice <= newFloor) {
          setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: 🔼 TRAIL FLOOR HIT — ${position.symbol} at ${gainPct.toFixed(1)}% gain, floor was $${newFloor.toFixed(position.purchasePrice < 0.01 ? 8 : 6)} — approve sell in Phantom`]);
          notifyTakeProfitHit(position.symbol, gainPct);
          setSellingToken(tokenAddress);
          try {
            const result = await sellToken(tokenAddress, position.purchaseAmount, position.decimals || 9, signAndSendTransaction, publicKey.toString(), 200);
            if (result.success) {
              setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: TRAIL SOLD ${position.symbol} +${gainPct.toFixed(1)}%, received ${result.outputAmount.toFixed(4)} SOL`]);
              notifyTradeExecuted(position.symbol, 'sold', result.outputAmount);
              saveClosedPosition(position, currentPrice, result.outputAmount, 'trailing_stop', result.signature);
              setTrackedPositions(prev => { const next = new Map(prev); next.delete(tokenAddress); return next; });
              refreshWalletData();
            }
          } catch (err: any) {
            setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: TRAIL SELL FAILED - ${err.message}`]);
          } finally { setSellingToken(null); }
          continue;
        }

        // ── STOP LOSS (before trailing kicks in, i.e. < 8% gain) ────────
        if (gainPct <= -stopLossPercent) {
          setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: STOP LOSS - ${position.symbol} ${gainPct.toFixed(1)}% (limit: -${stopLossPercent}%)`]);
          notifyStopLossHit(position.symbol, gainPct);
          setSellingToken(tokenAddress);
          try {
            const result = await sellToken(tokenAddress, position.purchaseAmount, position.decimals || 9, signAndSendTransaction, publicKey.toString(), 300);
            if (result.success) {
              setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: SOLD ${position.symbol} ${gainPct.toFixed(1)}% loss, received ${result.outputAmount.toFixed(4)} SOL`]);
              notifyTradeExecuted(position.symbol, 'sold', result.outputAmount);
              saveClosedPosition(position, currentPrice, result.outputAmount, 'stop_loss', result.signature);
              setTrackedPositions(prev => { const next = new Map(prev); next.delete(tokenAddress); return next; });
              refreshWalletData();
            }
          } catch (err: any) {
            setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: SELL FAILED - ${err.message}`]);
          } finally { setSellingToken(null); }
          continue;
        }

        // ── PUMP DETECTION (strong signal reversal at high gain) ─────────
        if (gainPct > 30 && (currentData.signal === 'SELL' || currentData.signal === 'STRONG_SELL')) {
          setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: PUMP DETECTED - ${position.symbol} +${gainPct.toFixed(1)}% with SELL signal`]);
          notifyTakeProfitHit(position.symbol, gainPct);
          setSellingToken(tokenAddress);
          try {
            const result = await sellToken(tokenAddress, position.purchaseAmount, position.decimals || 9, signAndSendTransaction, publicKey.toString(), 300);
            if (result.success) {
              setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: PUMP EXIT - Sold ${position.symbol} at +${gainPct.toFixed(1)}%`]);
              notifyTradeExecuted(position.symbol, 'sold', result.outputAmount);
              saveClosedPosition(position, currentPrice, result.outputAmount, 'pump_detected', result.signature);
              setTrackedPositions(prev => { const next = new Map(prev); next.delete(tokenAddress); return next; });
              refreshWalletData();
            }
          } catch (err: any) {
            setAutoTradeLog(prev => [...prev.slice(-9), `${timestamp}: PUMP EXIT FAILED - ${err.message}`]);
          } finally { setSellingToken(null); }
        }
      }
    };
    
    const interval = setInterval(checkAutoSell, 30000);
    checkAutoSell();
    return () => clearInterval(interval);
  }, [wallet?.isAutoTradeEnabled, connected, trackedPositions, scanData?.tokens]);
  
  const updateSettingsMutation = useMutation({
    mutationFn: async (settings: Partial<TradingWallet>) => {
      // Use phantom wallet endpoint when connected (no auth required)
      if (phantomAddress) {
        const res = await fetch(`/api/trading/phantom-wallet/${phantomAddress}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings),
        });
        if (!res.ok) throw new Error('Failed to update settings');
        return res.json();
      } else {
        const res = await apiRequest('PATCH', '/api/trading/wallet', settings);
        return res.json();
      }
    },
    onSuccess: () => {
      toast({ title: 'Settings updated' });
      refetchWallet();
    },
    onError: (error: any) => toast({ title: 'Failed to update settings', description: error?.message, variant: 'destructive' }),
  });
  
  const depositMutation = useMutation({
    mutationFn: async (amount: number) => {
      const res = await apiRequest('POST', '/api/trading/deposit', { amount });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: `Deposited ${depositAmount} SOL`, description: data.message });
      setDepositAmount('');
      refetchWallet();
    },
    onError: () => toast({ title: 'Deposit failed', variant: 'destructive' }),
  });
  
  const closePositionMutation = useMutation({
    mutationFn: async (positionId: number) => {
      const res = await apiRequest('POST', `/api/trading/positions/${positionId}/close`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Position closed' });
      refetchPositions();
      refetchWallet();
    },
    onError: () => toast({ title: 'Failed to close position', variant: 'destructive' }),
  });
  
  const openPositions = positions?.filter(p => p.status === 'open') || [];
  // Use real Phantom wallet balance and token count instead of demo
  const availableBalance = connected ? (walletData?.solBalance || 0) : (wallet?.solBalance || 0);
  const actualTokenCount = connected ? walletTokenMints.size : openPositions.length;
  const totalPL = wallet?.totalProfitLoss || 0;
  
  return (
    <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-purple-400">
            <Wallet className="h-5 w-5" />
            Auto-Trading Wallet
          </CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="auto-trade" className="text-sm text-muted-foreground">Auto-Trade</Label>
            <Switch
              id="auto-trade"
              checked={wallet?.isAutoTradeEnabled || false}
              onCheckedChange={(checked) => updateSettingsMutation.mutate({ isAutoTradeEnabled: checked })}
              disabled={walletLoading || updateSettingsMutation.isPending}
            />
            {wallet?.isAutoTradeEnabled ? (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                <Power className="h-3 w-3 mr-1" /> Active
              </Badge>
            ) : (
              <Badge variant="secondary">Off</Badge>
            )}
          </div>
        </div>
        <CardDescription>
          Automatically buy tokens with strong signals and sell when targets are hit or pump/dump detected
        </CardDescription>
        <div className="flex items-center gap-2 mt-2">
          <Button 
            variant={permission === 'granted' ? 'outline' : 'default'}
            size="sm" 
            onClick={requestPermission}
            className={permission === 'granted' ? 'bg-green-500/10 border-green-500/30 text-green-400' : ''}
          >
            {permission === 'granted' ? (
              <><Bell className="h-4 w-4 mr-1" /> Notifications On</>
            ) : (
              <><BellOff className="h-4 w-4 mr-1" /> Enable Notifications</>
            )}
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={toggleSound}
            className={soundEnabled ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' : ''}
          >
            {soundEnabled ? (
              <><Volume2 className="h-4 w-4 mr-1" /> Sound On</>
            ) : (
              <><VolumeX className="h-4 w-4 mr-1" /> Sound Off</>
            )}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => playSound('alert')}
            className="text-muted-foreground"
          >
            Test Sound
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-gray-900/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{connected ? 'Phantom Balance' : 'Demo Balance'}</p>
            <p className="text-xl font-bold text-purple-400">{availableBalance.toFixed(4)} SOL</p>
            {connected && <p className="text-xs text-green-400">Real Wallet</p>}
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">Trade Amount</p>
            <p className="text-xl font-bold text-blue-400">{(wallet?.tradeAmountSol || 0.1).toFixed(2)} SOL</p>
          </div>
          <div className="bg-gray-900/50 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">{connected ? 'Wallet Tokens' : 'Open Trades'}</p>
            <p className="text-xl font-bold">{actualTokenCount}/{wallet?.maxPositions || 3}</p>
            {connected && <p className="text-xs text-green-400">Real Positions</p>}
          </div>
          <div className={`bg-gray-900/50 rounded-lg p-3 text-center ${totalPL >= 0 ? 'border-green-500/30' : 'border-red-500/30'} border`}>
            <p className="text-xs text-muted-foreground">Total P/L</p>
            <p className={`text-xl font-bold ${totalPL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {totalPL >= 0 ? '+' : ''}{totalPL.toFixed(4)} SOL
            </p>
          </div>
        </div>
        
        {/* AI Activity Panel - Shows scanning status */}
        {wallet?.isAutoTradeEnabled && connected && (
          <div className="bg-gradient-to-r from-purple-900/30 via-blue-900/20 to-purple-900/30 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <Brain className="h-6 w-6 text-purple-400" />
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
              </div>
              <div>
                <h4 className="font-semibold text-purple-300 flex items-center gap-2">
                  AI Scanner Active
                  <RefreshCw className="h-3 w-3 animate-spin text-purple-400" />
                </h4>
                <p className="text-xs text-gray-400">Monitoring {scanData?.tokens?.length || 0} tokens for signals</p>
              </div>
            </div>
            
            {/* Scanning Activity Feed */}
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {scanData?.tokens?.slice(0, 5).map((token, idx) => {
                const signalType = token.signal;
                const confidence = token.confidence || 0;
                const isNearSignal = confidence >= (wallet?.minSignalConfidence || 75) - 15 && confidence < (wallet?.minSignalConfidence || 75);
                const meetsThreshold = confidence >= (wallet?.minSignalConfidence || 75) && (signalType === 'BUY' || signalType === 'STRONG_BUY');
                
                return (
                  <div key={token.token.address} className="flex items-center justify-between bg-gray-800/50 rounded px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${meetsThreshold ? 'bg-green-500 animate-pulse' : isNearSignal ? 'bg-yellow-500 animate-pulse' : 'bg-gray-500'}`}></div>
                      <span className="font-medium text-gray-300">{token.token.symbol}</span>
                      <span className="text-xs text-gray-500">${parseFloat(token.token.priceUsd).toFixed(8)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {meetsThreshold ? (
                        <Badge className="bg-green-500/20 text-green-400 text-xs border-green-500/30">
                          <Zap className="h-3 w-3 mr-1" />
                          Signal Ready!
                        </Badge>
                      ) : isNearSignal ? (
                        <Badge className="bg-yellow-500/20 text-yellow-400 text-xs border-yellow-500/30">
                          <Target className="h-3 w-3 mr-1" />
                          Near Signal ({confidence}%)
                        </Badge>
                      ) : (
                        <span className="text-xs text-gray-500">Analyzing... {confidence}%</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            
            {/* What AI is Looking For */}
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <p className="text-xs text-gray-500 mb-2">Currently Evaluating:</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-xs bg-blue-500/10 border-blue-500/30 text-blue-400">
                  <TrendingUp className="h-3 w-3 mr-1" />
                  Price Momentum
                </Badge>
                <Badge variant="outline" className="text-xs bg-green-500/10 border-green-500/30 text-green-400">
                  <Activity className="h-3 w-3 mr-1" />
                  Tokenomics
                </Badge>
                <Badge variant="outline" className="text-xs bg-yellow-500/10 border-yellow-500/30 text-yellow-400">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Whale Activity
                </Badge>
                <Badge variant="outline" className="text-xs bg-purple-500/10 border-purple-500/30 text-purple-400">
                  <Shield className="h-3 w-3 mr-1" />
                  Liquidity Health
                </Badge>
              </div>
              <p className="text-xs text-gray-600 mt-2">
                Min confidence: {wallet?.minSignalConfidence || 75}% | Buy amount: {wallet?.tradeAmountSol || 0.1} SOL | TP: {wallet?.takeProfitPercent || 50}% | SL: {wallet?.stopLossPercent || 20}%
              </p>
            </div>
          </div>
        )}
        
        {!connected ? (
          <div className="flex flex-col gap-2">
            <div className="flex gap-2 items-center flex-wrap">
              <Badge variant="outline" className="text-yellow-400 border-yellow-500/30">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Wallet Not Connected
              </Badge>
              <Button onClick={() => connect('phantom')} variant="outline" size="sm" disabled={connecting}>
                <LinkIcon className="h-4 w-4 mr-1" />
                {connecting ? 'Connecting...' : 'Connect Phantom'}
              </Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                  if (isMobile) {
                    const currentUrl = encodeURIComponent(window.location.href);
                    window.location.href = `https://phantom.app/ul/browse/${currentUrl}`;
                  } else {
                    window.open('https://phantom.app/', '_blank');
                  }
                }}
                className="text-xs text-muted-foreground"
              >
                <ExternalLink className="h-3 w-3 mr-1" />
                {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) ? 'Open in Phantom App' : 'Install Phantom'}
              </Button>
            </div>
            {error && (
              <p className="text-xs text-red-400">{error}</p>
            )}
            {/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) && (
              <p className="text-xs text-muted-foreground">
                On mobile, open this page in the Phantom app browser to connect your wallet
              </p>
            )}
          </div>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              Wallet: {walletData?.address?.slice(0, 4)}...{walletData?.address?.slice(-4)}
            </Badge>
            <Badge variant="outline">
              <SiSolana className="h-3 w-3 mr-1" />
              {walletData?.solBalance?.toFixed(4) || '0'} SOL
            </Badge>
            <Button variant="ghost" size="sm" onClick={disconnect} className="text-xs">
              Disconnect
            </Button>
          </div>
        )}
        
        <Tabs defaultValue="trades" className="w-full">
          <TabsList className="flex w-full overflow-x-auto gap-1 h-auto flex-wrap sm:flex-nowrap">
            <TabsTrigger value="trades" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">My Trades</span>
              <span className="sm:hidden">Trades</span>
              <span className="ml-1">({trackedPositions.size})</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Past Trades</span>
              <span className="sm:hidden">History</span>
              <span className="ml-1">({closedPositions.length})</span>
            </TabsTrigger>
            <TabsTrigger value="positions" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Positions</span>
              <span className="sm:hidden">Pos</span>
              <span className="ml-1">({openPositions.length})</span>
            </TabsTrigger>
            <TabsTrigger value="activity" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
              <span className="hidden sm:inline">Activity Log</span>
              <span className="sm:hidden">Log</span>
            </TabsTrigger>
            <TabsTrigger value="settings" className="flex-shrink-0 text-xs sm:text-sm px-2 sm:px-3">
              <Settings className="h-4 w-4 sm:hidden" />
              <span className="hidden sm:inline">Settings</span>
            </TabsTrigger>
          </TabsList>
          
          {/* My Trades - Shows AI auto-trades with live P&L and reasoning */}
          <TabsContent value="trades" className="space-y-4 mt-4">
            {trackedPositions.size > 0 ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">{trackedPositions.size} active trade{trackedPositions.size !== 1 ? 's' : ''}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-400 border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                    onClick={() => {
                      if (window.confirm('Clear all trades from this list? This only removes them from tracking — it does not sell anything in your wallet.')) {
                        setTrackedPositions(new Map());
                        localStorage.removeItem('trackedPositions');
                        toast({ title: 'Trades cleared', description: 'All tracked trades have been removed from the list.' });
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Clear All
                  </Button>
                </div>
                {Array.from(trackedPositions.values()).map((position) => {
                  // Calculate live P&L
                  const currentToken = scanData?.tokens?.find(t => t.token.address === position.tokenAddress);
                  const currentPrice = currentToken ? parseFloat(currentToken.token.priceUsd) : position.purchasePrice;
                  const pnlPercent = position.purchasePrice > 0 
                    ? ((currentPrice - position.purchasePrice) / position.purchasePrice * 100)
                    : 0;
                  const timeSincePurchase = new Date().getTime() - new Date(position.purchasedAt).getTime();
                  const minutesAgo = Math.floor(timeSincePurchase / 60000);
                  const hoursAgo = Math.floor(minutesAgo / 60);
                  const daysAgo = Math.floor(hoursAgo / 24);
                  const timeAgo = daysAgo > 0 ? `${daysAgo}d ago` : hoursAgo > 0 ? `${hoursAgo}h ago` : minutesAgo > 0 ? `${minutesAgo}m ago` : 'just now';
                  const timeHeld = daysAgo > 0 ? `${daysAgo}d ${hoursAgo % 24}h` : hoursAgo > 0 ? `${hoursAgo}h ${minutesAgo % 60}m` : `${minutesAgo}m`;
                  
                  return (
                    <Card key={position.tokenAddress} className="bg-gray-900/50 border-gray-700 overflow-hidden">
                      <div className="p-4">
                        {/* Header with token info and P&L */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            {position.tokenImage ? (
                              <img src={position.tokenImage} alt={position.symbol} className="w-12 h-12 rounded-full" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-lg font-bold">
                                {position.symbol.slice(0, 2)}
                              </div>
                            )}
                            <div>
                              <h3 className="font-bold text-lg">{position.tokenName || position.symbol}</h3>
                              <p className="text-sm text-muted-foreground flex items-center gap-2">
                                <span>${currentPrice.toFixed(8)}</span>
                                <span className={`font-bold ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  {pnlPercent >= 0 ? '↑' : '↓'}{Math.abs(pnlPercent).toFixed(2)}%
                                </span>
                              </p>
                            </div>
                          </div>
                          <div className="text-right flex items-start gap-2">
                            <div>
                              <Badge className={pnlPercent >= 0 ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}>
                                {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}% P&L
                              </Badge>
                              <p className="text-xs text-muted-foreground mt-1">Bought {timeAgo}</p>
                            </div>
                            <button
                              title="Remove from tracking"
                              className="p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
                              onClick={() => {
                                setTrackedPositions(prev => {
                                  const next = new Map(prev);
                                  next.delete(position.tokenAddress);
                                  return next;
                                });
                                toast({ title: `${position.symbol} removed`, description: 'Trade removed from tracking list.' });
                              }}
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                        
                        {/* Price Chart - Enhanced Sparkline like CIELO */}
                        <div className="bg-gray-800/30 rounded-lg p-3 mb-3">
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <span className={`text-lg font-bold ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                ${currentPrice.toFixed(currentPrice < 0.001 ? 10 : 8)}
                              </span>
                              <span className={`ml-2 text-sm font-medium ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {pnlPercent >= 0 ? '↑' : '↓'}{Math.abs(pnlPercent).toFixed(2)}%
                              </span>
                            </div>
                            <Badge className="bg-gray-700/50 text-gray-300 text-xs">
                              Held {timeHeld}
                            </Badge>
                          </div>
                          
                          {/* SVG Chart with price labels */}
                          <div className="relative">
                            <svg viewBox="0 0 240 80" className="w-full h-20">
                              <defs>
                                <linearGradient id={`gradient-${position.tokenAddress}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                  <stop offset="0%" stopColor={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.4" />
                                  <stop offset="100%" stopColor={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0" />
                                </linearGradient>
                              </defs>
                              {(() => {
                                const points: number[] = [];
                                const startPrice = position.purchasePrice;
                                const endPrice = currentPrice;
                                const volatility = Math.abs(pnlPercent) * 0.015 + 0.03;
                                
                                for (let i = 0; i <= 24; i++) {
                                  const progress = i / 24;
                                  const basePrice = startPrice + (endPrice - startPrice) * progress;
                                  const noise = (Math.sin(i * 2.1) * 0.4 + Math.cos(i * 1.7) * 0.3 + Math.sin(i * 0.7) * 0.2) * volatility * startPrice;
                                  points.push(basePrice + noise);
                                }
                                
                                const minP = Math.min(...points) * 0.97;
                                const maxP = Math.max(...points) * 1.03;
                                const range = maxP - minP || 1;
                                
                                const chartWidth = 200;
                                const chartLeft = 20;
                                const pathPoints = points.map((p, i) => {
                                  const x = chartLeft + (i / 24) * chartWidth;
                                  const y = 65 - ((p - minP) / range) * 55;
                                  return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                                }).join(' ');
                                
                                const areaPath = pathPoints + ` L ${chartLeft + chartWidth} 70 L ${chartLeft} 70 Z`;
                                const startY = 65 - ((startPrice - minP) / range) * 55;
                                const endY = 65 - ((endPrice - minP) / range) * 55;
                                
                                return (
                                  <>
                                    {/* Horizontal guide line at entry */}
                                    <line x1={chartLeft} y1={startY} x2={chartLeft + chartWidth} y2={startY} stroke="#9ca3af" strokeWidth="0.5" strokeDasharray="3,3" opacity="0.3" />
                                    {/* Area fill */}
                                    <path d={areaPath} fill={`url(#gradient-${position.tokenAddress})`} />
                                    {/* Main line */}
                                    <path d={pathPoints} fill="none" stroke={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    {/* Entry point */}
                                    <circle cx={chartLeft} cy={startY} r="5" fill="#a855f7" stroke="#1f2937" strokeWidth="2" />
                                    {/* Current point with glow */}
                                    <circle cx={chartLeft + chartWidth} cy={endY} r="6" fill={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} stroke="#1f2937" strokeWidth="2" />
                                    {/* Price labels */}
                                    <text x="5" y={startY + 3} fill="#9ca3af" fontSize="7" fontFamily="monospace">${startPrice.toFixed(startPrice < 0.01 ? 8 : 6)}</text>
                                    <text x={chartLeft + chartWidth + 5} y={endY + 3} fill={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} fontSize="7" fontWeight="bold" fontFamily="monospace">${endPrice.toFixed(endPrice < 0.01 ? 8 : 6)}</text>
                                  </>
                                );
                              })()}
                            </svg>
                          </div>
                          
                          {/* Stats row below chart */}
                          <div className="flex justify-between text-xs mt-2 pt-2 border-t border-gray-700/50">
                            <div className="flex items-center gap-1">
                              <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                              <span className="text-gray-500">Entry ${position.purchasePrice.toFixed(position.purchasePrice < 0.01 ? 8 : 6)}</span>
                            </div>
                            <span className="text-gray-600">|</span>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3 text-gray-500" />
                              <span className="text-gray-500">{timeHeld}</span>
                            </div>
                            <span className="text-gray-600">|</span>
                            <div className="flex items-center gap-1">
                              <span className={`w-2 h-2 rounded-full ${pnlPercent >= 0 ? 'bg-green-500' : 'bg-red-500'}`}></span>
                              <span className={pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}>{pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Mini stats row */}
                        <div className="grid grid-cols-3 gap-3 mb-3 text-center">
                          <div className="bg-gray-800/50 rounded-lg p-2">
                            <p className="text-xs text-muted-foreground">Market Cap</p>
                            <p className="font-medium text-sm">
                              {position.marketCap ? (position.marketCap >= 1e6 ? `$${(position.marketCap / 1e6).toFixed(1)}M` : `$${(position.marketCap / 1e3).toFixed(0)}K`) : 'N/A'}
                            </p>
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-2">
                            <p className="text-xs text-muted-foreground">24h Volume</p>
                            <p className="font-medium text-sm">
                              {position.volume24h ? (position.volume24h >= 1e6 ? `$${(position.volume24h / 1e6).toFixed(1)}M` : `$${(position.volume24h / 1e3).toFixed(0)}K`) : 'N/A'}
                            </p>
                          </div>
                          <div className="bg-gray-800/50 rounded-lg p-2">
                            <p className="text-xs text-muted-foreground">Confidence</p>
                            <p className="font-medium text-sm text-purple-400">{position.confidence}%</p>
                          </div>
                        </div>

                        {/* ── Trailing Stop Panel ── */}
                        {(() => {
                          const trailFloor = position.trailingFloor || position.purchasePrice;
                          const trailHigh = position.trailingHighPrice || position.purchasePrice;
                          const volStat = position.volumeStatus || 'average';
                          const gainPct = pnlPercent;
                          const distFromFloor = trailFloor > 0 ? ((pnlPercent >= 0 ? (currentPrice || position.purchasePrice) - trailFloor : 0) / trailFloor) * 100 : 0;
                          const nearFloorWarn = gainPct >= 8 && distFromFloor <= 3 && gainPct >= 0;
                          const trailDist = gainPct >= 20 ? computeTrailDistance(gainPct, volStat) : null;
                          const beOnly = gainPct >= 8 && gainPct < 20;
                          const volColor = volStat === 'surging' ? 'text-green-400' : volStat === 'above_average' ? 'text-emerald-400' : volStat === 'below_average' ? 'text-orange-400' : volStat === 'dry' ? 'text-red-400' : 'text-gray-400';
                          const rangeMin = position.purchasePrice;
                          const rangeMax = trailHigh * 1.05;
                          const toX = (p: number) => rangeMax > rangeMin ? Math.max(0, Math.min(100, ((p - rangeMin) / (rangeMax - rangeMin)) * 100)) : 0;
                          const entryX = toX(position.purchasePrice);
                          const floorX = toX(trailFloor);
                          const curX = toX(currentPrice || position.purchasePrice);
                          const peakX = toX(trailHigh);

                          return (
                            <div className={`rounded-lg p-3 mb-3 border ${nearFloorWarn ? 'bg-amber-900/30 border-amber-500/60 animate-pulse' : 'bg-gray-800/40 border-gray-700/50'}`}>
                              {nearFloorWarn && (
                                <div className="flex items-center gap-2 mb-2 text-amber-400 font-semibold text-xs">
                                  <span>⚠️</span>
                                  <span>TRAIL FLOOR NEAR — BE READY TO APPROVE SELL IN PHANTOM</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs text-gray-400 font-medium">🔼 Trail Stop</span>
                                <div className="flex items-center gap-2">
                                  {trailDist && (
                                    <span className="text-[10px] text-gray-500">{trailDist}% trail · <span className={volColor}>{volStat.replace('_', ' ')}</span></span>
                                  )}
                                  {beOnly && <span className="text-[10px] text-blue-400">breakeven floor active</span>}
                                  {gainPct < 8 && <span className="text-[10px] text-gray-500">trailing not active yet</span>}
                                </div>
                              </div>
                              {/* Progress bar: entry → floor → current → peak */}
                              <div className="relative h-3 bg-gray-700/50 rounded-full overflow-hidden mb-1">
                                <div className="absolute inset-0 h-full bg-gradient-to-r from-purple-600/30 via-green-500/20 to-green-600/30 rounded-full" style={{ width: `${peakX}%` }} />
                                <div className="absolute inset-y-0 bg-red-500/40 rounded-l-full" style={{ left: 0, width: `${floorX}%` }} />
                                {/* Floor marker */}
                                <div className="absolute inset-y-0 w-0.5 bg-red-500" style={{ left: `${floorX}%` }} />
                                {/* Entry marker */}
                                <div className="absolute inset-y-0 w-0.5 bg-purple-500" style={{ left: `${entryX}%` }} />
                                {/* Current price dot */}
                                <div className={`absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${gainPct >= 0 ? 'bg-green-400' : 'bg-red-400'}`} style={{ left: `calc(${curX}% - 5px)` }} />
                                {/* Peak marker */}
                                <div className="absolute inset-y-0 w-0.5 bg-yellow-400/60" style={{ left: `${peakX}%` }} />
                              </div>
                              <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                                <span>Entry</span>
                                <span className="text-red-400">Floor ${trailFloor.toFixed(trailFloor < 0.01 ? 8 : 6)}</span>
                                <span className={gainPct >= 0 ? 'text-green-400' : 'text-red-400'}>Now</span>
                                <span className="text-yellow-400">Peak ${trailHigh.toFixed(trailHigh < 0.01 ? 8 : 6)}</span>
                              </div>
                            </div>
                          );
                        })()}
                        
                        {/* AI Reasoning */}
                        <div className="bg-purple-900/20 border border-purple-500/30 rounded-lg p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <Brain className="h-4 w-4 text-purple-400" />
                            <p className="text-sm font-medium text-purple-400">Why AI Bought This Token</p>
                          </div>
                          <ul className="space-y-1">
                            {position.reasoning.map((reason, idx) => (
                              <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                <span className="text-green-400 mt-1">•</span>
                                <span>{reason}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="flex items-center gap-4 mt-3 pt-2 border-t border-purple-500/20">
                            <div className="flex items-center gap-1">
                              <TrendingUp className="h-3 w-3 text-blue-400" />
                              <span className="text-xs text-muted-foreground">Sentiment: {position.sentimentScore}/100</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Target className="h-3 w-3 text-green-400" />
                              <span className="text-xs text-muted-foreground">Tokenomics: {position.tokenomicsScore}/100</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3 text-yellow-400" />
                              <span className="text-xs text-muted-foreground">Whale: {position.whaleScore}/100</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Action buttons */}
                        <div className="flex gap-2 mt-3">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex-1"
                            onClick={() => window.open(`https://dexscreener.com/solana/${position.tokenAddress}`, '_blank')}
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            DexScreener
                          </Button>
                          
                          {/* Share Button with Dialog */}
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button size="sm" variant="outline" className="flex-1 bg-purple-600/20 border-purple-500/30 hover:bg-purple-600/30">
                                <Share2 className="h-3 w-3 mr-1" />
                                Share
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Share2 className="h-5 w-5" />
                                  Share Trade Performance
                                </DialogTitle>
                              </DialogHeader>
                              
                              {/* Share Card Preview */}
                              <div 
                                id={`share-card-${position.tokenAddress}`}
                                className="bg-gradient-to-br from-gray-900 via-purple-900/50 to-gray-900 rounded-xl p-5 border border-purple-500/30"
                              >
                                {/* Header with VEDD Logo */}
                                <div className="flex items-center justify-between mb-4">
                                  <VeddLogo height={32} />
                                  <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30">
                                    AI Trade
                                  </Badge>
                                </div>
                                
                                {/* Token Info */}
                                <div className="flex items-center gap-3 mb-4">
                                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-xl font-bold">
                                    {position.symbol.slice(0, 2)}
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-xl text-white">{position.tokenName || position.symbol}</h3>
                                    <p className="text-sm text-gray-400">${position.symbol}</p>
                                  </div>
                                </div>
                                
                                {/* Price Chart for Share Card */}
                                <div className="mb-4 rounded-lg overflow-hidden bg-gray-800/50 p-2">
                                  <svg viewBox="0 0 280 70" className="w-full h-16">
                                    <defs>
                                      <linearGradient id={`share-gradient-${position.tokenAddress}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.5" />
                                        <stop offset="100%" stopColor={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0" />
                                      </linearGradient>
                                    </defs>
                                    {(() => {
                                      const pts: number[] = [];
                                      const sp = position.purchasePrice;
                                      const ep = currentPrice;
                                      const vol = Math.abs(pnlPercent) * 0.012 + 0.02;
                                      for (let i = 0; i <= 28; i++) {
                                        const prog = i / 28;
                                        const base = sp + (ep - sp) * prog;
                                        pts.push(base + (Math.sin(i * 2.3) * 0.4 + Math.cos(i * 1.5) * 0.35) * vol * sp);
                                      }
                                      const minP = Math.min(...pts) * 0.96;
                                      const maxP = Math.max(...pts) * 1.04;
                                      const rng = maxP - minP || 1;
                                      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${10 + (i / 28) * 220} ${55 - ((p - minP) / rng) * 45}`).join(' ');
                                      const sY = 55 - ((sp - minP) / rng) * 45;
                                      const eY = 55 - ((ep - minP) / rng) * 45;
                                      return (
                                        <>
                                          <path d={path + ' L 230 60 L 10 60 Z'} fill={`url(#share-gradient-${position.tokenAddress})`} />
                                          <path d={path} fill="none" stroke={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="2.5" strokeLinecap="round" />
                                          <circle cx="10" cy={sY} r="4" fill="#a855f7" />
                                          <circle cx="230" cy={eY} r="5" fill={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} />
                                          <text x="5" y="12" fill="#9ca3af" fontSize="8">${sp.toFixed(sp < 0.01 ? 8 : 6)}</text>
                                          <text x="235" y={eY + 3} fill={pnlPercent >= 0 ? '#22c55e' : '#ef4444'} fontSize="9" fontWeight="bold">${ep.toFixed(ep < 0.01 ? 8 : 6)}</text>
                                        </>
                                      );
                                    })()}
                                  </svg>
                                </div>
                                
                                {/* P&L Display */}
                                <div className={`text-center py-4 rounded-lg mb-4 ${pnlPercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                                  <p className="text-sm text-gray-400 mb-1">Profit/Loss</p>
                                  <p className={`text-4xl font-bold ${pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                                  </p>
                                  <div className="flex items-center justify-center gap-3 mt-2 text-xs">
                                    <span className="text-gray-500">Entry: ${position.purchasePrice.toFixed(8)}</span>
                                    <span className="text-gray-600">→</span>
                                    <span className={pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}>${currentPrice.toFixed(8)}</span>
                                  </div>
                                </div>
                                
                                {/* AI Scores */}
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                  <div className="text-center bg-gray-800/50 rounded-lg p-2">
                                    <p className="text-xs text-blue-400">Sentiment</p>
                                    <p className="font-bold text-white">{position.sentimentScore}</p>
                                  </div>
                                  <div className="text-center bg-gray-800/50 rounded-lg p-2">
                                    <p className="text-xs text-green-400">Tokenomics</p>
                                    <p className="font-bold text-white">{position.tokenomicsScore}</p>
                                  </div>
                                  <div className="text-center bg-gray-800/50 rounded-lg p-2">
                                    <p className="text-xs text-yellow-400">Whale</p>
                                    <p className="font-bold text-white">{position.whaleScore}</p>
                                  </div>
                                </div>
                                
                                {/* AI Confidence */}
                                <div className="flex items-center justify-between text-sm mb-3">
                                  <span className="text-gray-400">AI Confidence</span>
                                  <span className="text-purple-400 font-bold">{position.confidence}%</span>
                                </div>
                                
                                {/* Time Held */}
                                <div className="flex items-center justify-center gap-2 mb-3">
                                  <Clock className="h-4 w-4 text-gray-500" />
                                  <span className="text-sm text-gray-400">Time Held: <span className="text-white font-medium">{timeHeld}</span></span>
                                </div>
                                
                                {/* Footer */}
                                <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                                  <span className="text-xs text-gray-500">Traded {timeAgo}</span>
                                  <span className="text-xs text-purple-400">VEDD AI Trading</span>
                                </div>
                              </div>
                              
                              {/* Share Buttons */}
                              <div className="flex gap-2 mt-4">
                                <Button
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => {
                                    const text = `🚀 My VEDD AI Trade Performance!\n\n${position.symbol}: ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% P&L\n⏱️ Time Held: ${timeHeld}\n\n🤖 AI Confidence: ${position.confidence}%\n📊 Sentiment: ${position.sentimentScore}/100\n💎 Tokenomics: ${position.tokenomicsScore}/100\n🐋 Whale Activity: ${position.whaleScore}/100\n\n#VEDD #AI #Trading #Solana`;
                                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
                                  }}
                                >
                                  <Twitter className="h-4 w-4 mr-2" />
                                  Tweet
                                </Button>
                                <Button
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => {
                                    const text = `🚀 VEDD AI Trade: ${position.symbol} ${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}% P&L | Held ${timeHeld} | AI Confidence: ${position.confidence}%`;
                                    navigator.clipboard.writeText(text);
                                    toast({ title: 'Copied!', description: 'Trade info copied to clipboard' });
                                  }}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                          
                          <Button
                            size="sm"
                            variant="destructive"
                            className="flex-1"
                            onClick={async () => {
                              const pk = getPublicKey();
                              if (!pk) return;
                              setSellingToken(position.tokenAddress);
                              try {
                                const result = await sellToken(
                                  position.tokenAddress,
                                  position.purchaseAmount,
                                  position.decimals || 9,
                                  signAndSendTransaction,
                                  pk.toString(),
                                  200
                                );
                                if (result.success) {
                                  const txSig = result.signature || '';
                                  toast({ 
                                    title: `Sold ${position.symbol}!`, 
                                    description: `Received ${result.outputAmount.toFixed(4)} SOL`,
                                    action: txSig ? (
                                      <a 
                                        href={`https://solscan.io/tx/${txSig}`} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="underline text-purple-400 hover:text-purple-300"
                                      >
                                        View TX
                                      </a>
                                    ) : undefined
                                  });
                                  // Save to closed positions history
                                  saveClosedPosition(position, currentPrice, result.outputAmount, 'manual_sell', txSig);
                                  setTrackedPositions(prev => {
                                    const next = new Map(prev);
                                    next.delete(position.tokenAddress);
                                    return next;
                                  });
                                  refreshWalletData();
                                } else {
                                  toast({ title: 'Sell failed', description: result.error, variant: 'destructive' });
                                }
                              } catch (err: any) {
                                toast({ title: 'Sell failed', description: err.message, variant: 'destructive' });
                              } finally {
                                setSellingToken(null);
                              }
                            }}
                            disabled={sellingToken === position.tokenAddress}
                          >
                            {sellingToken === position.tokenAddress ? (
                              <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <TrendingDown className="h-3 w-3 mr-1" />
                            )}
                            Sell Now
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Brain className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No AI trades yet</p>
                <p className="text-xs mt-1">Enable auto-trade and connect your wallet to start AI-powered trading</p>
                <p className="text-xs mt-2 text-purple-400">When AI buys a token, you'll see the reasoning here with live P&L tracking</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    const demoPosition: TrackedPosition = {
                      tokenAddress: 'DEMO_' + Date.now(),
                      symbol: 'DEMO',
                      purchasePrice: 0.00045,
                      purchaseAmount: 100000,
                      decimals: 9,
                      purchasedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
                      signal: 'BUY',
                      confidence: 87,
                      reasoning: [
                        'Strong upward momentum detected',
                        'High whale accumulation (15+ large buys)',
                        'Healthy liquidity ratio 12%',
                        'Positive social sentiment trending'
                      ],
                      sentimentScore: 82,
                      tokenomicsScore: 78,
                      whaleScore: 91,
                      tokenName: 'Demo Token',
                      marketCap: 4500000,
                      volume24h: 2100000,
                      currentPrice: 0.00068,
                      pnlPercent: 51.1,
                      trailingHighPrice: 0.00068,
                      trailingFloor: 0.00045,
                      volumeStatus: 'above_average',
                      approachAlertFired: false,
                    };
                    setTrackedPositions(prev => {
                      const next = new Map(prev);
                      next.set(demoPosition.tokenAddress, demoPosition);
                      return next;
                    });
                    toast({ title: 'Demo trade added!', description: 'Preview the share card and chart' });
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Add Demo Trade to Preview
                </Button>
              </div>
            )}
          </TabsContent>
          
          {/* Past Trades - History of closed positions with P&L and share cards */}
          <TabsContent value="history" className="space-y-4 mt-4">
            {closedPositions.length > 0 ? (
              <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-3 mb-4">
                  <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total Trades</p>
                    <p className="text-xl font-bold">{closedPositions.length}</p>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Win Rate</p>
                    <p className="text-xl font-bold text-green-400">
                      {((closedPositions.filter(p => p.finalPnlPercent > 0).length / closedPositions.length) * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Best Trade</p>
                    <p className="text-xl font-bold text-green-400">
                      +{Math.max(...closedPositions.map(p => p.finalPnlPercent), 0).toFixed(1)}%
                    </p>
                  </div>
                  <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Total SOL Gained</p>
                    <p className={`text-xl font-bold ${closedPositions.reduce((sum, p) => sum + p.soldAmount, 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {closedPositions.reduce((sum, p) => sum + p.soldAmount, 0).toFixed(4)}
                    </p>
                  </div>
                </div>
                
                {closedPositions.map((position, idx) => {
                  const tradeDate = new Date(position.soldAt);
                  const purchaseDate = new Date(position.purchasedAt);
                  const holdDuration = tradeDate.getTime() - purchaseDate.getTime();
                  const days = Math.floor(holdDuration / (1000 * 60 * 60 * 24));
                  const hours = Math.floor((holdDuration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                  const mins = Math.floor((holdDuration % (1000 * 60 * 60)) / (1000 * 60));
                  const timeHeld = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  const timeAgo = new Date(position.soldAt).toLocaleDateString();
                  
                  const exitReasonLabel: Record<string, string> = {
                    'take_profit': 'Take Profit',
                    'stop_loss': 'Stop Loss',
                    'pump_detected': 'Pump Exit',
                    'manual_sell': 'Manual Sell',
                    'trailing_stop': 'Trail Stop Hit',
                  };
                  
                  const exitReasonColor: Record<string, string> = {
                    'take_profit': 'text-green-400 bg-green-500/20 border-green-500/30',
                    'stop_loss': 'text-red-400 bg-red-500/20 border-red-500/30',
                    'pump_detected': 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
                    'manual_sell': 'text-blue-400 bg-blue-500/20 border-blue-500/30',
                    'trailing_stop': 'text-emerald-400 bg-emerald-500/20 border-emerald-500/30',
                  };
                  
                  return (
                    <Card key={`${position.tokenAddress}-${idx}`} className={`bg-gray-900/50 border ${position.finalPnlPercent >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}>
                      <div className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold ${position.finalPnlPercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                              {position.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <h4 className="font-semibold flex items-center gap-2">
                                {position.tokenName || position.symbol}
                                <Badge className={exitReasonColor[position.exitReason]}>{exitReasonLabel[position.exitReason]}</Badge>
                              </h4>
                              <p className="text-xs text-muted-foreground">${position.symbol}</p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-bold ${position.finalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {position.finalPnlPercent >= 0 ? '+' : ''}{position.finalPnlPercent.toFixed(2)}%
                            </p>
                            <p className="text-xs text-muted-foreground">Received {position.soldAmount.toFixed(4)} SOL</p>
                          </div>
                        </div>
                        
                        {/* Price Chart */}
                        <div className="mb-3 rounded-lg overflow-hidden bg-gray-800/50 p-2">
                          <svg viewBox="0 0 280 50" className="w-full h-12">
                            <defs>
                              <linearGradient id={`history-gradient-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                <stop offset="0%" stopColor={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.4" />
                                <stop offset="100%" stopColor={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0" />
                              </linearGradient>
                            </defs>
                            {(() => {
                              const pts: number[] = [];
                              const sp = position.purchasePrice;
                              const ep = position.soldPrice;
                              const vol = Math.abs(position.finalPnlPercent) * 0.01 + 0.02;
                              for (let i = 0; i <= 20; i++) {
                                const prog = i / 20;
                                const base = sp + (ep - sp) * prog;
                                pts.push(base + (Math.sin(i * 2.1) * 0.35 + Math.cos(i * 1.4) * 0.3) * vol * sp);
                              }
                              const minP = Math.min(...pts) * 0.95;
                              const maxP = Math.max(...pts) * 1.05;
                              const rng = maxP - minP || 1;
                              const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${15 + (i / 20) * 210} ${40 - ((p - minP) / rng) * 32}`).join(' ');
                              const sY = 40 - ((sp - minP) / rng) * 32;
                              const eY = 40 - ((ep - minP) / rng) * 32;
                              return (
                                <>
                                  <path d={path + ' L 225 45 L 15 45 Z'} fill={`url(#history-gradient-${idx})`} />
                                  <path d={path} fill="none" stroke={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="2" strokeLinecap="round" />
                                  <circle cx="15" cy={sY} r="3" fill="#a855f7" />
                                  <circle cx="225" cy={eY} r="4" fill={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} />
                                  <text x="5" y="10" fill="#9ca3af" fontSize="7">${sp.toFixed(sp < 0.01 ? 8 : 5)}</text>
                                  <text x="235" y={eY + 3} fill={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} fontSize="8" fontWeight="bold">${ep.toFixed(ep < 0.01 ? 8 : 5)}</text>
                                </>
                              );
                            })()}
                          </svg>
                        </div>
                        
                        {/* Trade Info */}
                        <div className="grid grid-cols-4 gap-2 text-xs mb-3">
                          <div className="text-center">
                            <p className="text-muted-foreground">Entry</p>
                            <p className="font-medium">${position.purchasePrice.toFixed(8)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground">Exit</p>
                            <p className="font-medium">${position.soldPrice.toFixed(8)}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground">Held</p>
                            <p className="font-medium">{timeHeld}</p>
                          </div>
                          <div className="text-center">
                            <p className="text-muted-foreground">AI Conf</p>
                            <p className="font-medium text-purple-400">{position.confidence}%</p>
                          </div>
                        </div>
                        
                        {/* AI Scores */}
                        <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                          <div className="bg-gray-800/50 rounded p-2 text-center">
                            <p className="text-blue-400">Sentiment</p>
                            <p className="font-bold">{position.sentimentScore}/100</p>
                          </div>
                          <div className="bg-gray-800/50 rounded p-2 text-center">
                            <p className="text-green-400">Tokenomics</p>
                            <p className="font-bold">{position.tokenomicsScore}/100</p>
                          </div>
                          <div className="bg-gray-800/50 rounded p-2 text-center">
                            <p className="text-yellow-400">Whale</p>
                            <p className="font-bold">{position.whaleScore}/100</p>
                          </div>
                        </div>
                        
                        {/* Reasoning */}
                        {position.reasoning && position.reasoning.length > 0 && (
                          <div className="mb-3 p-2 bg-gray-800/30 rounded text-xs">
                            <p className="text-muted-foreground mb-1">AI Reasoning:</p>
                            <ul className="list-disc list-inside text-gray-400 space-y-0.5">
                              {position.reasoning.slice(0, 3).map((r, i) => (
                                <li key={i}>{r}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        
                        {/* Actions */}
                        <div className="flex gap-2">
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" className="flex-1">
                                <Share2 className="h-3 w-3 mr-1" />
                                Share Card
                              </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-md">
                              <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                  <Share2 className="h-5 w-5" />
                                  Share Completed Trade
                                </DialogTitle>
                              </DialogHeader>
                              
                              {/* Share Card Preview */}
                              <div 
                                id={`history-share-card-${idx}`}
                                className="bg-gradient-to-br from-gray-900 via-purple-900/50 to-gray-900 rounded-xl p-5 border border-purple-500/30"
                              >
                                {/* Header with VEDD Logo */}
                                <div className="flex items-center justify-between mb-4">
                                  <VeddLogo height={32} />
                                  <Badge className={exitReasonColor[position.exitReason]}>
                                    {exitReasonLabel[position.exitReason]}
                                  </Badge>
                                </div>
                                
                                {/* Token Info */}
                                <div className="flex items-center gap-3 mb-4">
                                  <div className={`w-14 h-14 rounded-full flex items-center justify-center text-xl font-bold ${position.finalPnlPercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                                    {position.symbol.slice(0, 2)}
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-xl text-white">{position.tokenName || position.symbol}</h3>
                                    <p className="text-sm text-gray-400">${position.symbol}</p>
                                  </div>
                                </div>
                                
                                {/* Price Chart */}
                                <div className="mb-4 rounded-lg overflow-hidden bg-gray-800/50 p-2">
                                  <svg viewBox="0 0 280 70" className="w-full h-16">
                                    <defs>
                                      <linearGradient id={`share-history-gradient-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                                        <stop offset="0%" stopColor={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.5" />
                                        <stop offset="100%" stopColor={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0" />
                                      </linearGradient>
                                    </defs>
                                    {(() => {
                                      const pts: number[] = [];
                                      const sp = position.purchasePrice;
                                      const ep = position.soldPrice;
                                      const vol = Math.abs(position.finalPnlPercent) * 0.012 + 0.02;
                                      for (let i = 0; i <= 28; i++) {
                                        const prog = i / 28;
                                        const base = sp + (ep - sp) * prog;
                                        pts.push(base + (Math.sin(i * 2.3) * 0.4 + Math.cos(i * 1.5) * 0.35) * vol * sp);
                                      }
                                      const minP = Math.min(...pts) * 0.96;
                                      const maxP = Math.max(...pts) * 1.04;
                                      const rng = maxP - minP || 1;
                                      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${10 + (i / 28) * 220} ${55 - ((p - minP) / rng) * 45}`).join(' ');
                                      const sY = 55 - ((sp - minP) / rng) * 45;
                                      const eY = 55 - ((ep - minP) / rng) * 45;
                                      return (
                                        <>
                                          <path d={path + ' L 230 60 L 10 60 Z'} fill={`url(#share-history-gradient-${idx})`} />
                                          <path d={path} fill="none" stroke={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="2.5" strokeLinecap="round" />
                                          <circle cx="10" cy={sY} r="4" fill="#a855f7" />
                                          <circle cx="230" cy={eY} r="5" fill={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} />
                                          <text x="5" y="12" fill="#9ca3af" fontSize="8">${sp.toFixed(sp < 0.01 ? 8 : 6)}</text>
                                          <text x="235" y={eY + 3} fill={position.finalPnlPercent >= 0 ? '#22c55e' : '#ef4444'} fontSize="9" fontWeight="bold">${ep.toFixed(ep < 0.01 ? 8 : 6)}</text>
                                        </>
                                      );
                                    })()}
                                  </svg>
                                </div>
                                
                                {/* P&L Display */}
                                <div className={`text-center py-4 rounded-lg mb-4 ${position.finalPnlPercent >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                                  <p className="text-sm text-gray-400 mb-1">Final Profit/Loss</p>
                                  <p className={`text-4xl font-bold ${position.finalPnlPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {position.finalPnlPercent >= 0 ? '+' : ''}{position.finalPnlPercent.toFixed(2)}%
                                  </p>
                                  <p className="text-sm text-gray-400 mt-1">Received {position.soldAmount.toFixed(4)} SOL</p>
                                </div>
                                
                                {/* AI Scores */}
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                  <div className="text-center bg-gray-800/50 rounded-lg p-2">
                                    <p className="text-xs text-blue-400">Sentiment</p>
                                    <p className="font-bold text-white">{position.sentimentScore}</p>
                                  </div>
                                  <div className="text-center bg-gray-800/50 rounded-lg p-2">
                                    <p className="text-xs text-green-400">Tokenomics</p>
                                    <p className="font-bold text-white">{position.tokenomicsScore}</p>
                                  </div>
                                  <div className="text-center bg-gray-800/50 rounded-lg p-2">
                                    <p className="text-xs text-yellow-400">Whale</p>
                                    <p className="font-bold text-white">{position.whaleScore}</p>
                                  </div>
                                </div>
                                
                                {/* Time Held */}
                                <div className="flex items-center justify-center gap-2 mb-3">
                                  <Clock className="h-4 w-4 text-gray-500" />
                                  <span className="text-sm text-gray-400">Time Held: <span className="text-white font-medium">{timeHeld}</span></span>
                                </div>
                                
                                {/* Footer */}
                                <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                                  <span className="text-xs text-gray-500">Closed {timeAgo}</span>
                                  <span className="text-xs text-purple-400">VEDD AI Trading</span>
                                </div>
                              </div>
                              
                              {/* Share Buttons */}
                              <div className="flex gap-2 mt-4">
                                <Button
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => {
                                    const text = `${position.finalPnlPercent >= 0 ? '🚀' : '📉'} Completed VEDD AI Trade!\n\n${position.symbol}: ${position.finalPnlPercent >= 0 ? '+' : ''}${position.finalPnlPercent.toFixed(2)}% P&L\n💰 Received: ${position.soldAmount.toFixed(4)} SOL\n⏱️ Time Held: ${timeHeld}\n🏷️ Exit: ${exitReasonLabel}\n\n🤖 AI Confidence: ${position.confidence}%\n📊 Sentiment: ${position.sentimentScore}/100\n💎 Tokenomics: ${position.tokenomicsScore}/100\n🐋 Whale Activity: ${position.whaleScore}/100\n\n#VEDD #AI #Trading #Solana`;
                                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
                                  }}
                                >
                                  <Twitter className="h-4 w-4 mr-2" />
                                  Tweet
                                </Button>
                                <Button
                                  variant="outline"
                                  className="flex-1"
                                  onClick={() => {
                                    const text = `${position.finalPnlPercent >= 0 ? '🚀' : '📉'} VEDD AI Trade: ${position.symbol} ${position.finalPnlPercent >= 0 ? '+' : ''}${position.finalPnlPercent.toFixed(2)}% | ${position.soldAmount.toFixed(4)} SOL | Held ${timeHeld} | ${exitReasonLabel} | AI: ${position.confidence}%`;
                                    navigator.clipboard.writeText(text);
                                    toast({ title: 'Copied!', description: 'Trade info copied to clipboard' });
                                  }}
                                >
                                  <Copy className="h-4 w-4 mr-2" />
                                  Copy
                                </Button>
                              </div>
                              
                              {position.txSignature && (
                                <div className="mt-2 text-center">
                                  <a
                                    href={`https://solscan.io/tx/${position.txSignature}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-purple-400 hover:text-purple-300 underline"
                                  >
                                    View Transaction on Solscan
                                  </a>
                                </div>
                              )}
                            </DialogContent>
                          </Dialog>
                          
                          {position.txSignature && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => window.open(`https://solscan.io/tx/${position.txSignature}`, '_blank')}
                            >
                              <ExternalLink className="h-3 w-3 mr-1" />
                              TX
                            </Button>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
                
                {/* Clear History */}
                <div className="flex justify-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs text-muted-foreground"
                    onClick={() => {
                      if (confirm('Clear all trade history? This cannot be undone.')) {
                        setClosedPositions([]);
                      }
                    }}
                  >
                    Clear History
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <History className="h-10 w-10 mx-auto mb-3 opacity-50" />
                <p className="font-medium">No past trades yet</p>
                <p className="text-xs mt-1">Completed trades will appear here with full P&L tracking and shareable cards</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="positions" className="space-y-3 mt-4">
            {openPositions.length > 0 ? (
              openPositions.map((pos) => {
                const plPercent = pos.entryPriceSol > 0 
                  ? ((pos.currentPriceSol - pos.entryPriceSol) / pos.entryPriceSol * 100)
                  : 0;
                return (
                  <div key={pos.id} className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center text-xs font-bold">
                        {pos.tokenSymbol?.slice(0, 2)}
                      </div>
                      <div>
                        <p className="font-medium">{pos.tokenSymbol}</p>
                        <p className="text-xs text-muted-foreground">{pos.amountSolInvested.toFixed(4)} SOL</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${plPercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {plPercent >= 0 ? '+' : ''}{plPercent.toFixed(2)}%
                      </p>
                      <Badge variant="outline" className="text-xs">{pos.signalType}</Badge>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => closePositionMutation.mutate(pos.id)}
                      disabled={closePositionMutation.isPending}
                    >
                      Close
                    </Button>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No open positions</p>
                <p className="text-xs mt-1">Enable auto-trade to automatically buy strong signals</p>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="activity" className="space-y-3 mt-4">
            {autoTradeLog.length > 0 ? (
              <div className="space-y-1 max-h-60 overflow-y-auto">
                {autoTradeLog.map((log, idx) => (
                  <div key={idx} className={`text-xs p-2 rounded ${log.includes('SUCCESS') ? 'bg-green-900/30 text-green-400' : log.includes('FAILED') || log.includes('ERROR') ? 'bg-red-900/30 text-red-400' : 'bg-gray-800/50 text-muted-foreground'}`}>
                    {log}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No auto-trade activity yet</p>
                <p className="text-xs mt-1">Enable auto-trade and connect your wallet to start</p>
              </div>
            )}
            {buyingToken && (
              <div className="flex items-center gap-2 p-3 bg-purple-900/30 rounded-lg border border-purple-500/30">
                <RefreshCw className="h-4 w-4 animate-spin text-purple-400" />
                <span className="text-sm text-purple-400">Executing trade via Jupiter...</span>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="settings" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Trade Amount (SOL)</Label>
                <span className="text-sm font-medium">{wallet?.tradeAmountSol || 0.1} SOL</span>
              </div>
              <Slider
                value={[wallet?.tradeAmountSol || 0.1]}
                onValueChange={([v]) => updateSettingsMutation.mutate({ tradeAmountSol: v })}
                min={0.01}
                max={1}
                step={0.01}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Take Profit %</Label>
                <span className="text-sm font-medium text-green-400">+{wallet?.takeProfitPercent || 50}%</span>
              </div>
              <Slider
                value={[wallet?.takeProfitPercent || 50]}
                onValueChange={([v]) => updateSettingsMutation.mutate({ takeProfitPercent: v })}
                min={10}
                max={200}
                step={5}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Stop Loss %</Label>
                <span className="text-sm font-medium text-red-400">-{wallet?.stopLossPercent || 20}%</span>
              </div>
              <Slider
                value={[wallet?.stopLossPercent || 20]}
                onValueChange={([v]) => updateSettingsMutation.mutate({ stopLossPercent: v })}
                min={5}
                max={50}
                step={5}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Min Signal Confidence</Label>
                <span className="text-sm font-medium">{wallet?.minSignalConfidence || 70}%</span>
              </div>
              <Slider
                value={[wallet?.minSignalConfidence || 70]}
                onValueChange={([v]) => updateSettingsMutation.mutate({ minSignalConfidence: v })}
                min={50}
                max={95}
                step={5}
              />
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Max Positions</Label>
                <span className="text-sm font-medium">{wallet?.maxPositions || 3}</span>
              </div>
              <Slider
                value={[wallet?.maxPositions || 3]}
                onValueChange={([v]) => updateSettingsMutation.mutate({ maxPositions: v })}
                min={1}
                max={10}
                step={1}
              />
            </div>
            
            <div className="p-3 bg-purple-500/10 rounded-lg border border-purple-500/30">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-start gap-2">
                  <RefreshCw className="h-4 w-4 text-purple-500 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-purple-500">Auto-Rebalance</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Automatically sell losing tokens and replace with better performers
                    </p>
                  </div>
                </div>
                <Switch
                  checked={wallet?.isAutoRebalanceEnabled || false}
                  onCheckedChange={(checked) => updateSettingsMutation.mutate({ isAutoRebalanceEnabled: checked })}
                  disabled={walletLoading || updateSettingsMutation.isPending}
                />
              </div>
              {wallet?.isAutoRebalanceEnabled && (
                <div className="space-y-2 pt-2 border-t border-purple-500/20">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Rebalance at</Label>
                    <span className="text-sm font-medium text-red-400">-{wallet?.rebalanceThresholdPercent || 10}%</span>
                  </div>
                  <Slider
                    value={[wallet?.rebalanceThresholdPercent || 10]}
                    onValueChange={([v]) => updateSettingsMutation.mutate({ rebalanceThresholdPercent: v })}
                    min={5}
                    max={30}
                    step={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    When a token drops {wallet?.rebalanceThresholdPercent || 10}%, sell it and buy a better signal
                  </p>
                </div>
              )}
            </div>
            
            <div className="p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
              <div className="flex items-start gap-2">
                <Shield className="h-4 w-4 text-yellow-500 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-500">Pump/Dump Protection</p>
                  <p className="text-muted-foreground text-xs mt-1">
                    AI monitors for rapid price drops after spikes and automatically exits positions to protect gains.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'VEDD';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export default function SolanaScanner() {
  const [searchQuery, setSearchQuery] = useState('');
  const [buyingToken, setBuyingToken] = useState<string | null>(null);
  const [referralCode, setReferralCode] = useState<string>('');
  const [referralCopied, setReferralCopied] = useState(false);
  const [referralStats, setReferralStats] = useState({ referrals: 0, earnings: 0 });
  const [dexFilter, setDexFilter] = useState<DexSource>('all');
  const [solEngineSettingsOpen, setSolEngineSettingsOpen] = useState(false);
  const [solEngineAutoScan, setSolEngineAutoScan] = useState(true);
  const [solEngineKelly, setSolEngineKelly] = useState(false);
  const [solEngineShield, setSolEngineShield] = useState(true);
  const [solEngineShieldThreshold, setSolEngineShieldThreshold] = useState(10);
  const [solEngineMinConf, setSolEngineMinConf] = useState(65);
  const [solPortfolioValue, setSolPortfolioValue] = useState('');
  const [solResultToken, setSolResultToken] = useState<{ address: string; dex: string; symbol: string } | null>(null);
  const [solResultGain, setSolResultGain] = useState('');
  const [activeStrategyId, setActiveStrategyId] = useState('momentum_surfer');
  const [weeklyGoalTargetSol, setWeeklyGoalTargetSol] = useState('');
  const [weeklyGoalTargetPct, setWeeklyGoalTargetPct] = useState('');
  const { toast } = useToast();
  const { connected, walletData, signAndSendTransaction, getPublicKey, refreshWalletData } = useSolanaWallet();

  const { data: solEngineStatus, refetch: refetchEngineStatus } = useQuery<any>({
    queryKey: ['/api/sol-engine/status'],
    refetchInterval: (data: any) => (data?.running ? 10000 : false),
    staleTime: 5000,
  });

  const solEngineRunning = solEngineStatus?.running || false;

  const startSolEngineMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/sol-engine/start', {
      dexFilter, minConfidence: solEngineMinConf, maxTokens: 12,
      useKelly: solEngineKelly, shieldEnabled: solEngineShield,
      shieldThreshold: solEngineShieldThreshold, adaptiveScan: solEngineAutoScan,
    }),
    onSuccess: () => { toast({ title: '🚀 Sol Engine started', description: 'Autonomous scanning active' }); refetchEngineStatus(); },
    onError: () => toast({ title: 'Failed to start engine', variant: 'destructive' }),
  });

  const stopSolEngineMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/sol-engine/stop', {}),
    onSuccess: () => { toast({ title: '🛑 Sol Engine stopped' }); refetchEngineStatus(); },
  });

  const recordResultMutation = useMutation({
    mutationFn: (params: { dex: string; outcome: 'WIN' | 'LOSS'; gainPct: number }) =>
      apiRequest('POST', '/api/sol-engine/record-result', params),
    onSuccess: () => { toast({ title: 'Result recorded — DEX weights updated' }); refetchEngineStatus(); },
  });

  const updatePortfolioMutation = useMutation({
    mutationFn: (solValue: number) => apiRequest('POST', '/api/sol-engine/update-portfolio', { solValue }),
    onSuccess: (data: any) => {
      const msg = data?.shieldActive ? '🛡️ Shield ACTIVATED — portfolio drawdown detected' : 'Portfolio value updated';
      toast({ title: msg });
      refetchEngineStatus();
    },
  });

  const setStrategyMutation = useMutation({
    mutationFn: (strategyId: string) => apiRequest('POST', '/api/sol-engine/set-strategy', { strategyId }),
    onSuccess: (_data: any, strategyId: string) => {
      setActiveStrategyId(strategyId);
      toast({ title: `Strategy switched` });
      refetchEngineStatus();
    },
  });

  const setWeeklyGoalMutation = useMutation({
    mutationFn: (params: { targetSol?: number; targetPct?: number }) =>
      apiRequest('POST', '/api/sol-engine/set-weekly-goal', params),
    onSuccess: () => {
      toast({ title: '🎯 Weekly goal set!', description: 'Auto-sizing will now adjust by phase' });
      setWeeklyGoalTargetSol('');
      setWeeklyGoalTargetPct('');
      refetchEngineStatus();
    },
  });

  const resetWeeklyGoalMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/sol-engine/reset-weekly-goal', {}),
    onSuccess: () => { toast({ title: 'Weekly goal reset' }); refetchEngineStatus(); },
  });
  
  useEffect(() => {
    const stored = localStorage.getItem('vedd_referral_code');
    if (stored) {
      setReferralCode(stored);
    } else {
      const newCode = generateReferralCode();
      localStorage.setItem('vedd_referral_code', newCode);
      setReferralCode(newCode);
    }
    const stats = localStorage.getItem('vedd_referral_stats');
    if (stats) setReferralStats(JSON.parse(stats));
    
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    if (ref && ref !== stored) {
      localStorage.setItem('vedd_referred_by', ref);
    }
  }, []);
  
  const { data: wallet } = useQuery<TradingWallet>({
    queryKey: ['/api/trading/wallet'],
  });
  
  const { data: scanData, isLoading, refetch, isFetching } = useQuery<ScanResponse>({
    queryKey: ['/api/solana/scan', { limit: 12, dex: dexFilter }],
    queryFn: async () => {
      const res = await fetch(`/api/solana/scan?limit=12&dex=${dexFilter}`);
      if (!res.ok) throw new Error('Failed to scan');
      return res.json();
    },
    refetchOnWindowFocus: false,
    staleTime: 60000,
  });
  
  const [searchResults, setSearchResults] = useState<TokenAnalysis[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const handleBuyToken = async (tokenAddress: string, tokenSymbol: string) => {
    if (!connected) {
      toast({ title: 'Connect your wallet first', variant: 'destructive' });
      return;
    }
    
    const publicKey = getPublicKey();
    if (!publicKey) {
      toast({ title: 'Wallet not ready', variant: 'destructive' });
      return;
    }
    
    const tradeAmount = wallet?.tradeAmountSol || 0.1;
    if ((walletData?.solBalance || 0) < tradeAmount) {
      toast({ title: 'Insufficient SOL balance', description: `Need at least ${tradeAmount} SOL`, variant: 'destructive' });
      return;
    }
    
    setBuyingToken(tokenAddress);
    toast({ title: `Buying ${tokenSymbol}...`, description: `Swapping ${tradeAmount} SOL via Jupiter` });
    
    try {
      const result = await buyToken(
        tokenAddress,
        tradeAmount,
        signAndSendTransaction,
        publicKey.toString(),
        100
      );
      
      if (result.success) {
        const txSig = result.signature || '';
        console.log('[Manual Buy] SUCCESS! Transaction signature:', txSig);
        console.log('[Manual Buy] View on Solscan:', `https://solscan.io/tx/${txSig}`);
        toast({ 
          title: 'Trade executed!', 
          description: `Bought ${tokenSymbol} with ${result.inputAmount.toFixed(4)} SOL`,
          action: txSig ? (
            <a 
              href={`https://solscan.io/tx/${txSig}`} 
              target="_blank" 
              rel="noopener noreferrer"
              className="underline text-purple-400 hover:text-purple-300"
            >
              View TX
            </a>
          ) : undefined
        });
        // Wait for blockchain to update before refreshing
        setTimeout(() => refreshWalletData(), 3000);
      } else {
        console.error('[Manual Buy] FAILED:', result.error);
        toast({ title: 'Trade failed', description: result.error, variant: 'destructive' });
      }
    } catch (error: any) {
      console.error('[Manual Buy] ERROR:', error);
      toast({ title: 'Trade error', description: error.message, variant: 'destructive' });
    } finally {
      setBuyingToken(null);
    }
  };
  
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
        
        <div className="flex items-center gap-2">
          <Link href="/sol-scanner/trades">
            <Button variant="outline" size="sm">
              <BarChart3 className="h-4 w-4 mr-2" />
              All Trades
            </Button>
          </Link>
          
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="text-yellow-500 border-yellow-500/30 hover:bg-yellow-500/10">
                <Gift className="h-4 w-4 mr-2" />
                Refer & Earn
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-yellow-400" />
                  Earn VEDD Rewards
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Share your referral link and earn 5% of your referrals' trading profits, paid in VEDD tokens!
                </p>
                
                <div className="flex items-center gap-2">
                  <Input 
                    value={`${window.location.origin}/sol-scanner?ref=${referralCode}`} 
                    readOnly 
                    className="bg-muted text-xs"
                  />
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/sol-scanner?ref=${referralCode}`);
                      setReferralCopied(true);
                      toast({ title: 'Link Copied!', description: 'Share to earn VEDD rewards' });
                      setTimeout(() => setReferralCopied(false), 2000);
                    }}
                  >
                    {referralCopied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  </Button>
                </div>
                
                <div className="flex items-center justify-between text-sm bg-muted/50 rounded-lg p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Code: {referralCode}</Badge>
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1">
                      <Users className="h-3 w-3" /> {referralStats.referrals}
                    </span>
                    <span className="flex items-center gap-1 text-green-400">
                      <DollarSign className="h-3 w-3" /> {referralStats.earnings.toFixed(2)} VEDD
                    </span>
                  </div>
                </div>
                
                <Button
                  className="w-full"
                  onClick={() => {
                    const text = `🚀 Trade Solana tokens with AI signals!\n\n🤖 AI scans trending tokens 24/7\n📊 Auto buy/sell at targets\n💰 Earn 5% of friends' profits\n\nJoin with my link:\n${window.location.origin}/sol-scanner?ref=${referralCode}\n\n#VEDD #Solana #AI`;
                    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
                  }}
                >
                  <Twitter className="h-4 w-4 mr-2" />
                  Share on Twitter
                </Button>
                
                <p className="text-xs text-center text-muted-foreground">
                  Earnings backed by the VEDD token ecosystem
                </p>
              </div>
            </DialogContent>
          </Dialog>
          
          <Button onClick={() => refetch()} disabled={isFetching} size="lg">
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            {isFetching ? 'Scanning...' : 'Scan Now'}
          </Button>
        </div>
      </div>
      
      {/* ═══ SOL ENGINE COMMAND CENTER ═══ */}
      {(() => {
        const weights = solEngineStatus?.signalWeights || {};
        const feed = solEngineStatus?.activityFeed || [];
        const macro = solEngineStatus?.lastMacro;
        const shieldOn = solEngineStatus?.shieldActive || false;
        const weeklyGoal = solEngineStatus?.weeklyGoal || { phase: 'idle', targetSol: 0, currentProfitSol: 0, winStreak: 0, tradeHistory: [] };
        const serverStrategy = solEngineStatus?.activeStrategy || activeStrategyId;
        const dexList = ['raydium', 'orca', 'meteora', 'pumpfun', 'jupiter'];
        const weightLabel = (w: number) => w >= 1.5 ? '🔥' : w >= 1.2 ? '✅' : w <= 0.3 ? '❌' : w <= 0.6 ? '⚠️' : '—';

        const STRATEGIES = [
          { id: 'momentum_surfer', name: 'Momentum Surfer', icon: '🏄', hold: '1–4h', conf: 70, risk: 'MEDIUM', base: 3 },
          { id: 'breakout_hunter', name: 'Breakout Hunter', icon: '🚀', hold: '30m–2h', conf: 75, risk: 'MEDIUM', base: 2.5 },
          { id: 'dip_sniper', name: 'Dip Sniper', icon: '🎯', hold: '2–8h', conf: 68, risk: 'LOW', base: 2 },
          { id: 'meme_velocity', name: 'Meme Velocity', icon: '⚡', hold: '10–15m', conf: 65, risk: 'HIGH', base: 4 },
          { id: 'whale_follower', name: 'Whale Follower', icon: '🐋', hold: '4–24h', conf: 72, risk: 'MEDIUM', base: 2 },
          { id: 'volume_explosion', name: 'Volume Explosion', icon: '💥', hold: '20–45m', conf: 65, risk: 'MEDIUM', base: 3.5 },
          { id: 'smart_money_flow', name: 'Smart Money', icon: '🧠', hold: '1–3d', conf: 78, risk: 'LOW', base: 2.5 },
          { id: 'liquidity_sweep', name: 'Liquidity Sweep', icon: '🌊', hold: '10–30m', conf: 60, risk: 'HIGH', base: 1 },
        ];

        const phaseConfig: Record<string, { label: string; color: string; bg: string; mult: string }> = {
          idle: { label: 'No goal set', color: 'text-gray-400', bg: 'bg-gray-700/30', mult: '—' },
          warming_up: { label: 'Warming Up', color: 'text-blue-300', bg: 'bg-blue-500/20', mult: '0.8×' },
          building: { label: 'Building', color: 'text-cyan-300', bg: 'bg-cyan-500/20', mult: '1.0×' },
          accelerating: { label: 'Accelerating', color: 'text-amber-300', bg: 'bg-amber-500/20', mult: '1.25×' },
          cruising: { label: 'Cruising', color: 'text-emerald-300', bg: 'bg-emerald-500/20', mult: '1.0×' },
          pushing: { label: 'Pushing Hard', color: 'text-orange-300', bg: 'bg-orange-500/20', mult: '1.5×+' },
          target_reached: { label: '🏆 Goal Reached!', color: 'text-yellow-300', bg: 'bg-yellow-500/20', mult: '0.5× coast' },
        };
        const phase = weeklyGoal.phase || 'idle';
        const pc = phaseConfig[phase] || phaseConfig.idle;
        const goalProgress = weeklyGoal.targetSol > 0 ? Math.min(1, weeklyGoal.currentProfitSol / weeklyGoal.targetSol) : 0;
        const tradeCount = weeklyGoal.tradeHistory?.length || 0;
        const wins = weeklyGoal.tradeHistory?.filter((t: any) => t.outcome === 'WIN').length || 0;
        const winRate = tradeCount > 0 ? Math.round((wins / tradeCount) * 100) : 0;

        return (
          <div className={`rounded-2xl border transition-all duration-300 ${solEngineRunning ? 'border-purple-500/50 bg-gradient-to-r from-purple-950/30 to-violet-950/30' : 'border-gray-700/40 bg-gray-900/20'}`}>
            {/* ── Header bar ── */}
            <div className="flex items-center justify-between p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className={`p-2 rounded-xl ${solEngineRunning ? 'bg-purple-500/20' : 'bg-gray-800/60'}`}>
                  <Brain className={`w-5 h-5 ${solEngineRunning ? 'text-purple-400' : 'text-gray-500'}`} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-bold text-sm ${solEngineRunning ? 'text-purple-300' : 'text-gray-400'}`}>SOL ENGINE</span>
                    {solEngineRunning && <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] animate-pulse">SCANNING</Badge>}
                    {!solEngineRunning && <Badge className="bg-gray-700/50 text-gray-500 border-gray-600/30 text-[10px]">IDLE</Badge>}
                    {shieldOn && <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">🛡️ SHIELD ON</Badge>}
                    {phase !== 'idle' && (
                      <Badge className={`${pc.bg} ${pc.color} border-0 text-[10px]`}>{pc.label} {pc.mult}</Badge>
                    )}
                    {solEngineRunning && (
                      <span className="text-[10px] text-gray-500">
                        {STRATEGIES.find(s => s.id === serverStrategy)?.icon}{' '}
                        {STRATEGIES.find(s => s.id === serverStrategy)?.name}
                      </span>
                    )}
                  </div>
                  {macro && (
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      BTC {macro.btcChange >= 0 ? '+' : ''}{macro.btcChange.toFixed(1)}% • ETH {macro.ethChange >= 0 ? '+' : ''}{macro.ethChange.toFixed(1)}% • SOL {macro.solChange >= 0 ? '+' : ''}{macro.solChange.toFixed(1)}%
                      <span className={`ml-1 font-semibold ${macro.bias === 'RISK_ON' ? 'text-emerald-400' : macro.bias === 'RISK_OFF' ? 'text-red-400' : 'text-yellow-400'}`}>→ {macro.bias.replace('_', '-')}</span>
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setSolEngineSettingsOpen(o => !o)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-700/50 transition-colors">
                  <Settings className="w-4 h-4" />
                </button>
                {solEngineRunning ? (
                  <Button size="sm" variant="destructive" onClick={() => stopSolEngineMutation.mutate()} disabled={stopSolEngineMutation.isPending} className="text-xs h-8">
                    <Power className="w-3 h-3 mr-1" /> Stop
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => startSolEngineMutation.mutate()} disabled={startSolEngineMutation.isPending} className="text-xs h-8 bg-purple-600 hover:bg-purple-700">
                    <Power className="w-3 h-3 mr-1" /> Start
                  </Button>
                )}
              </div>
            </div>

            {/* ── Settings panel ── */}
            {solEngineSettingsOpen && (
              <div className="border-t border-gray-700/50 p-4 space-y-5">
                {/* Core toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className={`rounded-xl border p-3 ${solEngineAutoScan ? 'border-violet-500/50 bg-violet-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => setSolEngineAutoScan(v => !v)}>
                      <input type="checkbox" checked={solEngineAutoScan} onChange={() => {}} className="accent-violet-500" />
                      <span className="text-xs font-semibold text-violet-300">Adaptive Auto-Scan</span>
                      {solEngineAutoScan && <Badge className="ml-auto bg-violet-500/20 text-violet-300 border-violet-500/30 text-[9px]">ON</Badge>}
                    </label>
                    <p className="text-[10px] text-gray-400 mt-1">30s during peak hours (13–20 UTC), 2min overnight</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${solEngineKelly ? 'border-blue-500/50 bg-blue-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => setSolEngineKelly(v => !v)}>
                      <input type="checkbox" checked={solEngineKelly} onChange={() => {}} className="accent-blue-500" />
                      <span className="text-xs font-semibold text-blue-300">Kelly Sizing Blend</span>
                      {solEngineKelly && <Badge className="ml-auto bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px]">ON</Badge>}
                    </label>
                    <p className="text-[10px] text-gray-400 mt-1">Blends Kelly criterion with strategy base size</p>
                  </div>
                  <div className={`rounded-xl border p-3 ${solEngineShield ? 'border-amber-500/50 bg-amber-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer" onClick={() => setSolEngineShield(v => !v)}>
                        <input type="checkbox" checked={solEngineShield} onChange={() => {}} className="accent-amber-500" />
                        <span className="text-xs font-semibold text-amber-300">Drawdown Shield</span>
                      </label>
                      {solEngineShield && (
                        <div className="flex items-center gap-1">
                          <input type="number" value={solEngineShieldThreshold} onChange={e => setSolEngineShieldThreshold(Number(e.target.value))} min={3} max={30} step={1} className="w-12 h-6 bg-gray-800 border border-amber-700 text-amber-300 text-[11px] px-1 rounded text-center" />
                          <span className="text-[10px] text-gray-400">%</span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-1">Restricts to LOW risk / 85%+ confidence when portfolio drops</p>
                  </div>
                  <div className="rounded-xl border border-gray-700 bg-gray-900/30 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-300">Min Confidence</span>
                      <span className="text-xs text-emerald-400 font-bold">{solEngineMinConf}%</span>
                    </div>
                    <input type="range" min={50} max={90} step={5} value={solEngineMinConf} onChange={e => setSolEngineMinConf(Number(e.target.value))} className="w-full accent-emerald-500" />
                    <p className="text-[10px] text-gray-400 mt-1">Filter tokens below this threshold</p>
                  </div>
                </div>

                {/* Portfolio value */}
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-gray-400 block mb-1">Portfolio Value (SOL) — for auto-sizing &amp; shield</label>
                    <div className="flex gap-2">
                      <input type="number" min="0" step="0.1" value={solPortfolioValue} onChange={e => setSolPortfolioValue(e.target.value)} placeholder="e.g. 12.5" className="flex-1 h-8 bg-gray-800 border border-gray-600 text-white text-xs px-2 rounded" />
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { const v = parseFloat(solPortfolioValue); if (!isNaN(v) && v > 0) updatePortfolioMutation.mutate(v); }} disabled={updatePortfolioMutation.isPending}>Update</Button>
                    </div>
                  </div>
                  {solEngineStatus?.sessionHighWatermark > 0 && (
                    <div className="text-right text-[10px] text-gray-400">
                      <div>Peak: {solEngineStatus.sessionHighWatermark.toFixed(3)} SOL</div>
                      <div>Current: {solEngineStatus.currentPortfolioValue?.toFixed(3) || '—'} SOL</div>
                    </div>
                  )}
                </div>

                {/* ── Strategy Selector ── */}
                <div>
                  <p className="text-xs font-semibold text-purple-300 mb-2">Trading Strategy</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {STRATEGIES.map(s => {
                      const isActive = serverStrategy === s.id;
                      const riskColor = s.risk === 'LOW' ? 'text-emerald-400' : s.risk === 'HIGH' ? 'text-red-400' : 'text-yellow-400';
                      return (
                        <button
                          key={s.id}
                          onClick={() => setStrategyMutation.mutate(s.id)}
                          disabled={setStrategyMutation.isPending}
                          className={`rounded-xl border p-2.5 text-left transition-all duration-200 ${isActive ? 'border-purple-500 bg-purple-500/20 shadow-lg shadow-purple-500/10' : 'border-gray-700 bg-gray-900/30 hover:border-gray-500 hover:bg-gray-800/40'}`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-base">{s.icon}</span>
                            {isActive && <span className="text-[8px] text-purple-400 font-bold">ACTIVE</span>}
                          </div>
                          <p className={`text-[10px] font-semibold leading-tight ${isActive ? 'text-purple-200' : 'text-gray-300'}`}>{s.name}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">{s.hold} • {s.conf}% min</p>
                          <p className={`text-[9px] font-semibold mt-0.5 ${riskColor}`}>{s.risk} • {s.base}% base</p>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1.5">Strategy sets base position size — auto-adjusts with phase multiplier each week</p>
                </div>
              </div>
            )}

            {/* ── Weekly Goal Tracker ── */}
            {solEngineRunning && (
              <div className="border-t border-gray-700/50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-gray-300">Weekly SOL Goal</p>
                  {phase !== 'idle' && (
                    <button onClick={() => resetWeeklyGoalMutation.mutate()} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">Reset</button>
                  )}
                </div>

                {phase === 'idle' ? (
                  <div className="space-y-2">
                    <p className="text-[10px] text-gray-400">Set a SOL profit target for this week. Position sizes will auto-scale through 6 phases as you progress.</p>
                    <div className="flex gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min="0" step="0.1" value={weeklyGoalTargetSol}
                          onChange={e => { setWeeklyGoalTargetSol(e.target.value); setWeeklyGoalTargetPct(''); }}
                          placeholder="Target SOL gain"
                          className="w-32 h-8 bg-gray-800 border border-gray-600 text-white text-xs px-2 rounded"
                        />
                        <span className="text-[10px] text-gray-400">SOL</span>
                      </div>
                      <span className="text-[10px] text-gray-500 self-center">or</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number" min="0" step="1" value={weeklyGoalTargetPct}
                          onChange={e => { setWeeklyGoalTargetPct(e.target.value); setWeeklyGoalTargetSol(''); }}
                          placeholder="Target %"
                          className="w-24 h-8 bg-gray-800 border border-gray-600 text-white text-xs px-2 rounded"
                        />
                        <span className="text-[10px] text-gray-400">% gain</span>
                      </div>
                      <Button
                        size="sm" className="h-8 text-xs bg-purple-600 hover:bg-purple-700"
                        disabled={setWeeklyGoalMutation.isPending || (!weeklyGoalTargetSol && !weeklyGoalTargetPct)}
                        onClick={() => {
                          const params: any = {};
                          if (weeklyGoalTargetSol) params.targetSol = parseFloat(weeklyGoalTargetSol);
                          if (weeklyGoalTargetPct) params.targetPct = parseFloat(weeklyGoalTargetPct);
                          setWeeklyGoalMutation.mutate(params);
                        }}
                      >Set Goal</Button>
                    </div>
                    <p className="text-[10px] text-gray-500">Requires portfolio value set above. Phases: Warming Up (0.8×) → Building (1×) → Accelerating (1.25×) → Cruising (1×) → Pushing (1.5×) → Coast (0.5×)</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`${pc.bg} ${pc.color} border-0 text-xs px-2 py-0.5`}>{pc.label}</Badge>
                      <span className="text-[10px] text-gray-400">Position size: <span className="font-bold text-white">{pc.mult}</span></span>
                      {weeklyGoal.winStreak >= 3 && <Badge className="bg-orange-500/20 text-orange-300 border-0 text-[9px]">🔥 {weeklyGoal.winStreak} win streak</Badge>}
                    </div>
                    <div>
                      <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                        <span>Progress</span>
                        <span className={pc.color}>{(goalProgress * 100).toFixed(1)}% of target</span>
                      </div>
                      <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${phase === 'target_reached' ? 'bg-yellow-400' : phase === 'pushing' ? 'bg-orange-400' : phase === 'accelerating' ? 'bg-amber-400' : phase === 'cruising' ? 'bg-emerald-400' : phase === 'building' ? 'bg-cyan-400' : 'bg-blue-400'}`}
                          style={{ width: `${goalProgress * 100}%` }}
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <p className="text-[9px] text-gray-500">Profit</p>
                        <p className={`text-xs font-bold ${weeklyGoal.currentProfitSol >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{weeklyGoal.currentProfitSol >= 0 ? '+' : ''}{weeklyGoal.currentProfitSol.toFixed(3)} SOL</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-gray-500">Target</p>
                        <p className="text-xs font-bold text-white">{weeklyGoal.targetSol.toFixed(3)} SOL</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-gray-500">Trades</p>
                        <p className="text-xs font-bold text-white">{tradeCount}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[9px] text-gray-500">Win Rate</p>
                        <p className={`text-xs font-bold ${winRate >= 60 ? 'text-emerald-400' : winRate >= 45 ? 'text-yellow-400' : 'text-red-400'}`}>{winRate}%</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── DEX Weights row ── */}
            {solEngineRunning && Object.keys(weights).length > 0 && (
              <div className="border-t border-gray-700/50 px-4 py-2 flex flex-wrap gap-3">
                {dexList.map(dex => {
                  const w = weights[dex] || 1.0;
                  const icon = weightLabel(w);
                  const color = w >= 1.5 ? 'text-emerald-400' : w >= 1.2 ? 'text-green-400' : w <= 0.3 ? 'text-red-400' : w <= 0.6 ? 'text-orange-400' : 'text-gray-400';
                  return (
                    <div key={dex} className="flex items-center gap-1">
                      <span className="text-[10px] text-gray-500 capitalize">{dex}</span>
                      <span className={`text-[11px] font-bold ${color}`}>{icon} {w.toFixed(2)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── Activity feed ── */}
            {solEngineRunning && feed.length > 0 && (
              <div className="border-t border-gray-700/50 p-3 space-y-1 max-h-40 overflow-y-auto">
                {feed.slice(0, 10).map((entry: any, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-[9px] text-gray-600 shrink-0 mt-0.5">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span className={`text-[10px] leading-relaxed ${entry.type === 'shield' ? 'text-amber-300' : entry.type === 'trigger' ? 'text-yellow-300' : entry.type === 'kelly' ? 'text-blue-300' : entry.type === 'signal' ? 'text-emerald-300' : entry.type === 'goal' ? 'text-purple-300' : entry.type === 'strategy' ? 'text-violet-300' : 'text-gray-300'}`}>{entry.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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
      
      <div className="flex flex-wrap gap-2">
        {DEX_OPTIONS.map((dex) => (
          <Button
            key={dex.value}
            variant={dexFilter === dex.value ? 'default' : 'outline'}
            size="sm"
            className={dexFilter === dex.value ? '' : `${dex.color} hover:opacity-80`}
            onClick={() => setDexFilter(dex.value)}
          >
            {dex.label}
          </Button>
        ))}
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
      
      <AutoTradingPanel />
      
      <MyWalletTokens />
      
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
              <TokenCard key={analysis.token.address + idx} analysis={analysis} onBuy={handleBuyToken} isBuying={buyingToken === analysis.token.address} />
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
            <div key={analysis.token.address + idx} className="relative">
              {/* Shield overlay for HIGH/EXTREME risk when shield is active */}
              {solEngineStatus?.shieldActive && (analysis.riskLevel === 'HIGH' || analysis.riskLevel === 'EXTREME') && (
                <div className="absolute inset-0 z-10 rounded-lg bg-gray-900/85 flex items-center justify-center backdrop-blur-sm">
                  <div className="text-center">
                    <span className="text-2xl">🛡️</span>
                    <p className="text-xs text-amber-300 font-semibold mt-1">SHIELD — Hidden</p>
                    <p className="text-[10px] text-gray-400">{analysis.riskLevel} risk blocked</p>
                  </div>
                </div>
              )}
              <TokenCard analysis={analysis} onBuy={handleBuyToken} isBuying={buyingToken === analysis.token.address} />
              {/* Sol Engine extras */}
              {solEngineRunning && (
                <div className="mt-1.5 flex items-center gap-2 px-1 flex-wrap">
                  {(() => {
                    const goalPhase = solEngineStatus?.weeklyGoal?.phase || 'idle';
                    const shieldOn = solEngineStatus?.shieldActive;
                    const phaseMultMap: Record<string, string> = { warming_up: '0.8×', building: '1.0×', accelerating: '1.25×', cruising: '1.0×', pushing: '1.5×+', target_reached: '0.5×' };
                    const mult = phaseMultMap[goalPhase] || '';
                    if (goalPhase === 'target_reached') {
                      return <Badge className="bg-yellow-500/20 text-yellow-300 border-yellow-500/30 text-[10px]">🎯 Goal hit — coast mode</Badge>;
                    }
                    if (shieldOn) {
                      return <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">🛡️ Min size active</Badge>;
                    }
                    if (analysis.recommendedSolAmount && analysis.recommendedSolAmount > 0) {
                      return (
                        <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px]">
                          📐 Auto: {analysis.recommendedSolAmount.toFixed(3)} SOL{mult ? ` (${mult})` : ''}
                        </Badge>
                      );
                    }
                    if (solEngineStatus?.currentPortfolioValue > 0) {
                      return <span className="text-[9px] text-gray-600">Set goal for auto-sizing</span>;
                    }
                    return null;
                  })()}
                  <div className="ml-auto flex gap-1.5">
                    <button
                      onClick={() => recordResultMutation.mutate({ dex: analysis.token.dexId?.split('_')[0] || 'unknown', outcome: 'WIN', gainPct: 25 })}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                      title="Mark this signal as a WIN"
                    >✓ WIN</button>
                    <button
                      onClick={() => recordResultMutation.mutate({ dex: analysis.token.dexId?.split('_')[0] || 'unknown', outcome: 'LOSS', gainPct: 0 })}
                      className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/30 hover:bg-red-500/30 transition-colors"
                      title="Mark this signal as a LOSS"
                    >✗ LOSS</button>
                  </div>
                </div>
              )}
            </div>
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
      
      <div className="text-center py-8 border-t border-border/50 mt-8">
        <VeddLogo height={32} className="mx-auto mb-4" />
        <p className="text-sm text-muted-foreground mb-4">Part of the VEDD AI Trading Vault ecosystem</p>
        <div className="flex items-center justify-center gap-4">
          <Link href="/">
            <Button variant="outline">
              <Target className="h-4 w-4 mr-2" />
              Enter Trading Vault
            </Button>
          </Link>
          <Link href="/sol-scanner">
            <Button variant="ghost" size="sm">
              Learn More
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
