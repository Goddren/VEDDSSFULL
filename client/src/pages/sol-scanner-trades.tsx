import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  TrendingUp, 
  TrendingDown, 
  Clock, 
  Share2, 
  ArrowLeft,
  Copy,
  Twitter,
  BarChart3,
  DollarSign,
  Target,
  Brain,
  ExternalLink
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';
import { useToast } from '@/hooks/use-toast';
import VeddLogo from '@/components/ui/vedd-logo';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ClosedPosition {
  tokenAddress: string;
  symbol: string;
  purchasePrice: number;
  purchaseAmount: number;
  decimals: number;
  purchasedAt: string;
  signal: string;
  confidence: number;
  reasoning: string[];
  sentimentScore: number;
  tokenomicsScore: number;
  whaleScore: number;
  tokenName: string;
  soldAt: string;
  soldPrice: number;
  soldAmount: number;
  finalPnlPercent: number;
  exitReason: 'take_profit' | 'stop_loss' | 'pump_detected' | 'manual_sell';
  txSignature?: string;
}

interface TrackedPosition {
  tokenAddress: string;
  symbol: string;
  purchasePrice: number;
  purchaseAmount: number;
  purchasedAt: string;
  signal: string;
  confidence: number;
  reasoning: string[];
  sentimentScore: number;
  tokenomicsScore: number;
  whaleScore: number;
  tokenName: string;
  currentPrice?: number;
  pnlPercent?: number;
}

export default function SolScannerTrades() {
  const { toast } = useToast();
  const [closedPositions, setClosedPositions] = useState<ClosedPosition[]>([]);
  const [activePositions, setActivePositions] = useState<TrackedPosition[]>([]);
  const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('all');
  
  useEffect(() => {
    // Load closed positions
    const storedClosed = localStorage.getItem('closedPositions');
    if (storedClosed) {
      setClosedPositions(JSON.parse(storedClosed));
    }
    
    // Load active positions
    const storedActive = localStorage.getItem('trackedPositions');
    if (storedActive) {
      const parsed = JSON.parse(storedActive);
      setActivePositions(Object.values(parsed));
    }
  }, []);
  
  const allTrades = [
    ...activePositions.map(p => ({ ...p, type: 'active' as const })),
    ...closedPositions.map(p => ({ ...p, type: 'closed' as const }))
  ].sort((a, b) => {
    const dateA = a.type === 'closed' ? new Date(a.soldAt) : new Date(a.purchasedAt);
    const dateB = b.type === 'closed' ? new Date(b.soldAt) : new Date(b.purchasedAt);
    return dateB.getTime() - dateA.getTime();
  });
  
  const filteredTrades = filter === 'all' 
    ? allTrades 
    : filter === 'active' 
      ? allTrades.filter(t => t.type === 'active')
      : allTrades.filter(t => t.type === 'closed');
  
  const totalPL = closedPositions.reduce((sum, p) => sum + p.finalPnlPercent, 0);
  const winRate = closedPositions.length > 0 
    ? (closedPositions.filter(p => p.finalPnlPercent > 0).length / closedPositions.length * 100).toFixed(0)
    : 0;
  const totalSolGained = closedPositions.reduce((sum, p) => sum + p.soldAmount, 0);
  
  const formatTimeHeld = (purchasedAt: string, soldAt?: string) => {
    const start = new Date(purchasedAt);
    const end = soldAt ? new Date(soldAt) : new Date();
    const duration = end.getTime() - start.getTime();
    const days = Math.floor(duration / (1000 * 60 * 60 * 24));
    const hours = Math.floor((duration % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
    return days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };
  
  const exitReasonLabels: Record<string, string> = {
    'take_profit': 'Take Profit',
    'stop_loss': 'Stop Loss',
    'pump_detected': 'Pump Exit',
    'manual_sell': 'Manual Sell'
  };
  
  const exitReasonColors: Record<string, string> = {
    'take_profit': 'text-green-400 bg-green-500/20 border-green-500/30',
    'stop_loss': 'text-red-400 bg-red-500/20 border-red-500/30',
    'pump_detected': 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30',
    'manual_sell': 'text-blue-400 bg-blue-500/20 border-blue-500/30'
  };
  
  const shareAllTrades = () => {
    const text = `📊 My VEDD AI Trading Performance!\n\n📈 Total Trades: ${closedPositions.length}\n🎯 Win Rate: ${winRate}%\n💰 Total SOL: ${totalSolGained.toFixed(4)} SOL\n\nStart trading with AI: ${window.location.origin}/sol-scanner\n\n#VEDD #AI #Solana #Trading`;
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-purple-900/20 to-gray-900">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/sol-scanner">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </Link>
            <VeddLogo height={32} />
          </div>
          <div className="flex items-center gap-2">
            <Link href="/solana-scanner">
              <Button variant="outline" size="sm">
                <Brain className="h-4 w-4 mr-2" />
                Open Scanner
              </Button>
            </Link>
            <Button onClick={shareAllTrades} size="sm" className="bg-purple-600 hover:bg-purple-700">
              <Share2 className="h-4 w-4 mr-2" />
              Share All
            </Button>
          </div>
        </div>
        
        {/* Title */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">All VEDD AI Trades</h1>
          <p className="text-gray-400">Complete trading history with shareable performance cards</p>
        </div>
        
        {/* Stats Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 text-center">
              <BarChart3 className="h-6 w-6 mx-auto mb-2 text-purple-400" />
              <p className="text-2xl font-bold">{allTrades.length}</p>
              <p className="text-xs text-gray-500">Total Trades</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 text-center">
              <Target className="h-6 w-6 mx-auto mb-2 text-green-400" />
              <p className="text-2xl font-bold text-green-400">{winRate}%</p>
              <p className="text-xs text-gray-500">Win Rate</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 text-center">
              <TrendingUp className="h-6 w-6 mx-auto mb-2 text-blue-400" />
              <p className="text-2xl font-bold">{activePositions.length}</p>
              <p className="text-xs text-gray-500">Active Trades</p>
            </CardContent>
          </Card>
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-4 text-center">
              <SiSolana className="h-6 w-6 mx-auto mb-2 text-purple-400" />
              <p className={`text-2xl font-bold ${totalSolGained >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {totalSolGained.toFixed(4)}
              </p>
              <p className="text-xs text-gray-500">SOL Earned</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Filter Tabs */}
        <div className="flex gap-2 mb-6">
          {(['all', 'active', 'closed'] as const).map(f => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
              className={filter === f ? 'bg-purple-600' : ''}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
              {f === 'active' && ` (${activePositions.length})`}
              {f === 'closed' && ` (${closedPositions.length})`}
            </Button>
          ))}
        </div>
        
        {/* Trades Grid */}
        {filteredTrades.length > 0 ? (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTrades.map((trade, idx) => {
              const isActive = trade.type === 'active';
              const pnl = isActive 
                ? ((trade.currentPrice || trade.purchasePrice) - trade.purchasePrice) / trade.purchasePrice * 100
                : (trade as ClosedPosition).finalPnlPercent;
              const timeHeld = formatTimeHeld(
                trade.purchasedAt, 
                isActive ? undefined : (trade as ClosedPosition).soldAt
              );
              
              return (
                <Card 
                  key={`${trade.tokenAddress}-${idx}`} 
                  className={`bg-gray-800/50 border ${pnl >= 0 ? 'border-green-500/30' : 'border-red-500/30'}`}
                >
                  <CardContent className="p-4">
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${pnl >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                          {trade.symbol.slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold">{trade.tokenName || trade.symbol}</p>
                          <p className="text-xs text-gray-500">${trade.symbol}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-xl font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                        </p>
                        <Badge className={isActive ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : exitReasonColors[(trade as ClosedPosition).exitReason]}>
                          {isActive ? 'Active' : exitReasonLabels[(trade as ClosedPosition).exitReason]}
                        </Badge>
                      </div>
                    </div>
                    
                    {/* Mini Chart */}
                    <div className="mb-3 rounded overflow-hidden bg-gray-900/50 p-1">
                      <svg viewBox="0 0 200 40" className="w-full h-8">
                        <defs>
                          <linearGradient id={`trade-grad-${idx}`} x1="0%" y1="0%" x2="0%" y2="100%">
                            <stop offset="0%" stopColor={pnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0.4" />
                            <stop offset="100%" stopColor={pnl >= 0 ? '#22c55e' : '#ef4444'} stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        {(() => {
                          const pts: number[] = [];
                          const sp = trade.purchasePrice;
                          const ep = isActive ? (trade.currentPrice || sp) : (trade as ClosedPosition).soldPrice;
                          for (let i = 0; i <= 15; i++) {
                            const prog = i / 15;
                            const base = sp + (ep - sp) * prog;
                            pts.push(base + (Math.sin(i * 2) * 0.3 + Math.cos(i * 1.5) * 0.25) * 0.03 * sp);
                          }
                          const minP = Math.min(...pts) * 0.95;
                          const maxP = Math.max(...pts) * 1.05;
                          const rng = maxP - minP || 1;
                          const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${10 + (i / 15) * 160} ${32 - ((p - minP) / rng) * 26}`).join(' ');
                          return (
                            <>
                              <path d={path + ' L 170 36 L 10 36 Z'} fill={`url(#trade-grad-${idx})`} />
                              <path d={path} fill="none" stroke={pnl >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.5" />
                            </>
                          );
                        })()}
                      </svg>
                    </div>
                    
                    {/* Info */}
                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="text-center">
                        <p className="text-gray-500">Entry</p>
                        <p className="font-medium">${trade.purchasePrice.toFixed(6)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">{isActive ? 'Current' : 'Exit'}</p>
                        <p className="font-medium">
                          ${isActive 
                            ? (trade.currentPrice || trade.purchasePrice).toFixed(6) 
                            : (trade as ClosedPosition).soldPrice.toFixed(6)
                          }
                        </p>
                      </div>
                      <div className="text-center">
                        <p className="text-gray-500">Held</p>
                        <p className="font-medium">{timeHeld}</p>
                      </div>
                    </div>
                    
                    {/* AI Scores */}
                    <div className="flex items-center justify-between text-xs mb-3">
                      <span className="text-purple-400">AI: {trade.confidence}%</span>
                      <span className="text-blue-400">Sent: {trade.sentimentScore}</span>
                      <span className="text-green-400">Tok: {trade.tokenomicsScore}</span>
                      <span className="text-yellow-400">Whale: {trade.whaleScore}</span>
                    </div>
                    
                    {/* Share Button */}
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="w-full">
                          <Share2 className="h-3 w-3 mr-1" />
                          Share Trade
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-md">
                        <DialogHeader>
                          <DialogTitle>Share Trade Performance</DialogTitle>
                        </DialogHeader>
                        
                        {/* Share Card Preview */}
                        <div className="bg-gradient-to-br from-gray-900 via-purple-900/50 to-gray-900 rounded-xl p-5 border border-purple-500/30">
                          <div className="flex items-center justify-between mb-4">
                            <VeddLogo height={28} />
                            <Badge className={isActive ? 'bg-blue-500/20 text-blue-400' : pnl >= 0 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                              {isActive ? 'Live Trade' : pnl >= 0 ? 'Winner' : 'Loss'}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-3 mb-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold ${pnl >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                              {trade.symbol.slice(0, 2)}
                            </div>
                            <div>
                              <h3 className="font-bold text-lg">{trade.tokenName || trade.symbol}</h3>
                              <p className="text-sm text-gray-400">${trade.symbol}</p>
                            </div>
                          </div>
                          
                          <div className={`text-center py-4 rounded-lg mb-4 ${pnl >= 0 ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                            <p className="text-sm text-gray-400">P&L</p>
                            <p className={`text-3xl font-bold ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pnl >= 0 ? '+' : ''}{pnl.toFixed(2)}%
                            </p>
                          </div>
                          
                          <div className="grid grid-cols-3 gap-2 text-center text-xs mb-3">
                            <div className="bg-gray-800/50 rounded p-2">
                              <p className="text-blue-400">Sentiment</p>
                              <p className="font-bold">{trade.sentimentScore}</p>
                            </div>
                            <div className="bg-gray-800/50 rounded p-2">
                              <p className="text-green-400">Tokenomics</p>
                              <p className="font-bold">{trade.tokenomicsScore}</p>
                            </div>
                            <div className="bg-gray-800/50 rounded p-2">
                              <p className="text-yellow-400">Whale</p>
                              <p className="font-bold">{trade.whaleScore}</p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-center gap-2 mb-3 text-sm">
                            <Clock className="h-4 w-4 text-gray-500" />
                            <span className="text-gray-400">Held: {timeHeld}</span>
                          </div>
                          
                          <div className="flex items-center justify-between pt-3 border-t border-gray-700 text-xs">
                            <span className="text-gray-500">AI Confidence: {trade.confidence}%</span>
                            <span className="text-purple-400">VEDD AI Trading</span>
                          </div>
                        </div>
                        
                        <div className="flex gap-2 mt-4">
                          <Button
                            variant="outline"
                            className="flex-1"
                            onClick={() => {
                              const text = `${pnl >= 0 ? '🚀' : '📉'} ${trade.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% P&L | Held ${timeHeld}\n🤖 AI Confidence: ${trade.confidence}%\n\nTrade with AI: ${window.location.origin}/sol-scanner\n\n#VEDD #Solana #AI`;
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
                              const text = `${trade.symbol}: ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}% | Held ${timeHeld} | AI: ${trade.confidence}% | ${window.location.origin}/sol-scanner`;
                              navigator.clipboard.writeText(text);
                              toast({ title: 'Copied!' });
                            }}
                          >
                            <Copy className="h-4 w-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        
                        {!isActive && (trade as ClosedPosition).txSignature && (
                          <div className="mt-2 text-center">
                            <a
                              href={`https://solscan.io/tx/${(trade as ClosedPosition).txSignature}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-purple-400 hover:underline"
                            >
                              <ExternalLink className="h-3 w-3 inline mr-1" />
                              View on Solscan
                            </a>
                          </div>
                        )}
                      </DialogContent>
                    </Dialog>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="py-16 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-600" />
              <h3 className="text-xl font-semibold mb-2">No Trades Yet</h3>
              <p className="text-gray-500 mb-4">Start trading with AI to see your performance here</p>
              <Link href="/solana-scanner">
                <Button className="bg-purple-600 hover:bg-purple-700">
                  <Brain className="h-4 w-4 mr-2" />
                  Open AI Scanner
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
        
        {/* Back to Vault CTA */}
        <div className="mt-12 text-center">
          <p className="text-gray-500 mb-4">Part of the VEDD Trading Vault ecosystem</p>
          <Link href="/">
            <Button variant="outline" className="border-purple-500/30 text-purple-400">
              <Target className="h-4 w-4 mr-2" />
              Enter Trading Vault
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
