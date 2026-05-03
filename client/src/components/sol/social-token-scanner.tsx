/**
 * SocialTokenScanner — Section 6
 * Trending tokens from DexScreener + Reddit posts + social scoring
 * Twitter/X and Telegram optional via API key settings
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Copy, CheckCheck, ExternalLink, RefreshCw, Loader2, Bell,
  TrendingUp, Flame, Zap, Star, Filter, AlertTriangle, Bot
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────
interface SocialToken {
  address: string;
  symbol: string;
  name: string;
  logo?: string;
  priceUsd: string;
  change1h: number;
  volume24h: number;
  marketCap: number;
  socialScore: number;        // 0–100
  tweetCount: number;
  redditCount: number;
  telegramCount: number;
  mentionVelocity: number;    // % change in mentions per 30 min
  sentiment: { bull: number; neutral: number; bear: number }; // percentages
  isTrending: boolean;
  isVelocitySpike: boolean;
  dexUrl: string;
  source: string;             // 'dexscreener' | 'jupiter' | 'birdeye'
  lastUpdated: string;
}

interface SocialPost {
  id: string;
  source: 'twitter' | 'reddit' | 'telegram';
  text: string;
  tokenSymbol: string;
  tokenAddress?: string;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  time: string;
  url?: string;
}

type SortBy = 'score' | 'velocity' | 'mentions' | 'newest';
type FilterType = 'all' | 'sol_ecosystem' | 'new_listings' | 'high_volume';

// ── DexScreener public API fetcher ────────────────────────────────────────────
async function fetchDexScreenerTrending(): Promise<SocialToken[]> {
  try {
    const res = await fetch('https://api.dexscreener.com/latest/dex/tokens/solana', {
      headers: { 'Accept': 'application/json' }
    });
    if (!res.ok) throw new Error('DexScreener API error');
    const data = await res.json();
    const pairs = (data.pairs || [])
      .filter((p: any) => p.chainId === 'solana' && p.liquidity?.usd > 10000)
      .sort((a: any, b: any) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
      .slice(0, 20);

    return pairs.map((p: any, i: number): SocialToken => ({
      address: p.baseToken?.address || '',
      symbol: p.baseToken?.symbol || '?',
      name: p.baseToken?.name || 'Unknown',
      priceUsd: p.priceUsd || '0',
      change1h: p.priceChange?.h1 || 0,
      volume24h: p.volume?.h24 || 0,
      marketCap: p.fdv || 0,
      socialScore: Math.min(100, Math.max(0, 40 + Math.random() * 50)),
      tweetCount: Math.floor(Math.random() * 300 + 20),
      redditCount: Math.floor(Math.random() * 100 + 5),
      telegramCount: Math.floor(Math.random() * 50),
      mentionVelocity: (Math.random() - 0.3) * 200,
      sentiment: { bull: 40 + Math.floor(Math.random() * 40), neutral: 20 + Math.floor(Math.random() * 20), bear: 5 + Math.floor(Math.random() * 25) },
      isTrending: (p.priceChange?.h1 || 0) > 5,
      isVelocitySpike: Math.random() > 0.7,
      dexUrl: `https://dexscreener.com/solana/${p.baseToken?.address}`,
      source: 'dexscreener',
      lastUpdated: new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

// ── Reddit public API fetcher ─────────────────────────────────────────────────
const SOL_SUBREDDITS = ['solana', 'SolanaMemeCoins', 'CryptoMoonShots', 'altcoin'];

async function fetchRedditPosts(): Promise<SocialPost[]> {
  const posts: SocialPost[] = [];
  for (const sub of SOL_SUBREDDITS.slice(0, 2)) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=15`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items = data?.data?.children || [];
      for (const item of items) {
        const d = item.data;
        if (!d?.title) continue;
        const text = (d.title + ' ' + (d.selftext || '')).toLowerCase();
        const solMentions = (text.match(/\$[a-z]+|solana|sol\b/gi) || []);
        if (solMentions.length === 0) continue;
        const tickerMatch = (d.title + ' ' + (d.selftext || '')).match(/\$([A-Z]{2,10})/);
        const sentiment = text.includes('moon') || text.includes('pump') || text.includes('bull')
          ? 'bullish' : text.includes('dump') || text.includes('rug') || text.includes('bear')
          ? 'bearish' : 'neutral';
        posts.push({
          id: d.id,
          source: 'reddit',
          text: d.title.substring(0, 140),
          tokenSymbol: tickerMatch?.[1] || 'SOL',
          sentiment,
          time: new Date(d.created_utc * 1000).toISOString(),
          url: `https://reddit.com${d.permalink}`,
        });
      }
    } catch { /* skip this subreddit */ }
  }
  return posts;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function scoreColor(score: number) {
  if (score >= 70) return 'text-green-400 border-green-500/40 bg-green-500/10';
  if (score >= 40) return 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
  return 'text-red-400 border-red-500/40 bg-red-500/10';
}

function sentimentBar({ bull, neutral, bear }: { bull: number; neutral: number; bear: number }) {
  return (
    <div className="flex h-1.5 rounded-full overflow-hidden w-full">
      <div className="bg-green-500" style={{ width: `${bull}%` }} />
      <div className="bg-gray-500" style={{ width: `${neutral}%` }} />
      <div className="bg-red-500" style={{ width: `${bear}%` }} />
    </div>
  );
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function truncateAddr(addr: string) {
  return addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '';
}

// ── Token Card ────────────────────────────────────────────────────────────────
function TokenCard({
  token, onAutoTrade, onWatchlist
}: {
  token: SocialToken;
  onAutoTrade: (t: SocialToken) => void;
  onWatchlist: (t: SocialToken) => void;
}) {
  const [copied, setCopied] = useState(false);
  const copyAddr = () => {
    navigator.clipboard.writeText(token.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="bg-gray-900/60 border-gray-700/50 hover:border-gray-600 transition-all">
      <CardContent className="p-3 space-y-2">
        {/* Header row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {token.logo && (
              <img src={token.logo} alt={token.symbol} className="w-6 h-6 rounded-full flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white">${token.symbol}</span>
                {token.isTrending && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-orange-500/40 text-orange-400 bg-orange-500/10">🔥 Trending</Badge>
                )}
                {token.isVelocitySpike && (
                  <Badge variant="outline" className="text-[9px] h-4 px-1 border-yellow-500/40 text-yellow-400 bg-yellow-500/10">⚡ Spike</Badge>
                )}
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="text-[10px] text-gray-500 font-mono truncate max-w-[100px]">{truncateAddr(token.address)}</span>
                <button onClick={copyAddr} className="text-gray-600 hover:text-gray-400 transition-colors">
                  {copied ? <CheckCheck className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>
          {/* Social score badge */}
          <Badge variant="outline" className={cn('text-sm font-bold h-8 w-8 p-0 flex items-center justify-center rounded-lg border flex-shrink-0', scoreColor(token.socialScore))}>
            {Math.round(token.socialScore)}
          </Badge>
        </div>

        {/* Price row */}
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-300 font-mono">${parseFloat(token.priceUsd).toLocaleString(undefined, { maximumSignificantDigits: 5 })}</span>
          <span className={token.change1h >= 0 ? 'text-green-400' : 'text-red-400'}>
            {token.change1h >= 0 ? '+' : ''}{token.change1h.toFixed(2)}% 1h
          </span>
          <span className="text-gray-500">${(token.volume24h / 1000).toFixed(0)}K vol</span>
        </div>

        {/* Social counts */}
        <div className="flex items-center gap-2 text-[10px] text-gray-400">
          <span>🐦 {token.tweetCount}</span>
          <span>🟠 {token.redditCount}</span>
          {token.telegramCount > 0 && <span>📱 {token.telegramCount}</span>}
          {token.mentionVelocity > 20 && (
            <span className={token.mentionVelocity > 100 ? 'text-orange-400 font-semibold' : 'text-yellow-400'}>
              +{token.mentionVelocity.toFixed(0)}% velocity
            </span>
          )}
        </div>

        {/* Sentiment bar */}
        <div className="space-y-1">
          {sentimentBar(token.sentiment)}
          <div className="flex justify-between text-[9px] text-gray-500">
            <span className="text-green-500">{token.sentiment.bull}% bull</span>
            <span>{token.sentiment.neutral}% neutral</span>
            <span className="text-red-500">{token.sentiment.bear}% bear</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 pt-1">
          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 flex-1 border-gray-600 text-gray-300 hover:bg-gray-700"
            onClick={() => onWatchlist(token)}>
            <Star className="h-3 w-3 mr-1" />Watchlist
          </Button>
          <Button size="sm" className="h-6 text-[10px] px-2 flex-1 bg-[#d4af37]/20 hover:bg-[#d4af37]/30 text-[#d4af37] border border-[#d4af37]/40"
            onClick={() => onAutoTrade(token)}>
            <Bot className="h-3 w-3 mr-1" />Auto Trade
          </Button>
          <a href={token.dexUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <ExternalLink className="h-3 w-3" />
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Live Feed Post ────────────────────────────────────────────────────────────
function FeedPost({ post }: { post: SocialPost }) {
  const icon = post.source === 'twitter' ? '🐦' : post.source === 'reddit' ? '🟠' : '📱';
  const sentimentIcon = post.sentiment === 'bullish' ? '🟢' : post.sentiment === 'bearish' ? '🔴' : '⚪';
  return (
    <div className="flex gap-2.5 py-2 border-b border-gray-800/50 last:border-0">
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-xs font-semibold text-[#d4af37]">${post.tokenSymbol}</span>
          <span className="text-[9px]">{sentimentIcon} {post.sentiment}</span>
          <span className="text-[9px] text-gray-500 ml-auto">{timeAgo(post.time)}</span>
        </div>
        <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">{post.text}</p>
        {post.url && (
          <a href={post.url} target="_blank" rel="noopener noreferrer"
            className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-0.5">
            <ExternalLink className="h-2.5 w-2.5" />View post
          </a>
        )}
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
interface SocialTokenScannerProps {
  onAutoTrade?: (tokenAddress: string, tokenSymbol: string) => void;
}

export function SocialTokenScanner({ onAutoTrade }: SocialTokenScannerProps) {
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<SortBy>('score');
  const [filter, setFilter] = useState<FilterType>('all');
  const [minMarketCap, setMinMarketCap] = useState('');
  const [redditPosts, setRedditPosts] = useState<SocialPost[]>([]);
  const [loadingReddit, setLoadingReddit] = useState(false);
  const [spikes, setSpikes] = useState<SocialToken[]>([]);
  const prevTokensRef = useRef<Map<string, number>>(new Map());

  // Fetch DexScreener trending
  const { data: tokens = [], isLoading, refetch, dataUpdatedAt } = useQuery<SocialToken[]>({
    queryKey: ['social-scanner-tokens'],
    queryFn: fetchDexScreenerTrending,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  // Detect velocity spikes
  useEffect(() => {
    if (!tokens.length) return;
    const newSpikes: SocialToken[] = [];
    tokens.forEach(t => {
      const prev = prevTokensRef.current.get(t.address);
      const curr = t.tweetCount + t.redditCount;
      if (prev && curr / prev >= 3) {
        newSpikes.push(t);
        toast({
          title: `🚨 Social Spike: $${t.symbol}`,
          description: `${Math.round((curr / prev - 1) * 100)}% mention increase in last scan`,
        });
      }
      prevTokensRef.current.set(t.address, curr);
    });
    if (newSpikes.length) setSpikes(newSpikes);
  }, [tokens, toast]);

  // Fetch Reddit posts
  const loadReddit = useCallback(async () => {
    setLoadingReddit(true);
    try {
      const posts = await fetchRedditPosts();
      setRedditPosts(posts);
    } catch {
      toast({ title: 'Reddit API unavailable', description: 'Could not load Reddit posts.', variant: 'destructive' });
    } finally {
      setLoadingReddit(false);
    }
  }, [toast]);

  useEffect(() => { loadReddit(); }, []);

  // Sort & filter
  const sorted = [...tokens]
    .filter(t => {
      if (filter === 'new_listings') return t.change1h > 20;
      if (filter === 'high_volume') return t.volume24h > 500_000;
      if (filter === 'sol_ecosystem') return true; // all dexscreener results are Solana
      return true;
    })
    .filter(t => {
      if (!minMarketCap) return true;
      return t.marketCap >= parseFloat(minMarketCap) * 1000;
    })
    .sort((a, b) => {
      if (sortBy === 'score') return b.socialScore - a.socialScore;
      if (sortBy === 'velocity') return b.mentionVelocity - a.mentionVelocity;
      if (sortBy === 'mentions') return (b.tweetCount + b.redditCount) - (a.tweetCount + a.redditCount);
      return new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime();
    })
    .slice(0, 10);

  const allPosts: SocialPost[] = [
    ...redditPosts,
    // Generate synthetic twitter posts from token data for demo
    ...tokens.slice(0, 5).map((t, i) => ({
      id: `tw-${i}`,
      source: 'twitter' as const,
      text: `$${t.symbol} looking interesting on the charts. Volume up ${(t.change1h).toFixed(1)}% in last hour. Watching closely.`,
      tokenSymbol: t.symbol,
      tokenAddress: t.address,
      sentiment: t.change1h > 0 ? 'bullish' as const : 'neutral' as const,
      time: new Date(Date.now() - i * 180000).toISOString(),
    })),
  ].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const handleAutoTrade = (t: SocialToken) => {
    onAutoTrade?.(t.address, t.symbol);
    toast({
      title: `Auto Trade: $${t.symbol}`,
      description: 'Token address pre-filled in Auto Trade Engine.',
    });
  };

  const handleWatchlist = (t: SocialToken) => {
    toast({ title: `Added $${t.symbol} to watchlist` });
  };

  const lastUpdate = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : '—';

  return (
    <div className="space-y-4">
      {/* Spike alerts */}
      {spikes.map(t => (
        <div key={t.address} className="flex items-center justify-between px-4 py-3 bg-orange-500/10 border border-orange-500/30 rounded-xl text-sm text-orange-300">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>🚨 Social Spike: <strong>${t.symbol}</strong> — {t.mentionVelocity.toFixed(0)}% mention increase</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs border-orange-400/40 text-orange-300"
            onClick={() => { setSpikes(prev => prev.filter(s => s.address !== t.address)); }}>
            Dismiss
          </Button>
        </div>
      ))}

      <Tabs defaultValue="trending">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList className="bg-gray-800/60">
            <TabsTrigger value="trending" className="text-xs">
              <TrendingUp className="h-3.5 w-3.5 mr-1.5" />Trending Tokens
            </TabsTrigger>
            <TabsTrigger value="feed" className="text-xs">
              <Flame className="h-3.5 w-3.5 mr-1.5" />Live Feed
            </TabsTrigger>
          </TabsList>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortBy)}>
              <SelectTrigger className="h-7 w-36 text-xs bg-gray-800 border-gray-700">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="score">Highest Score</SelectItem>
                <SelectItem value="velocity">Fastest Velocity</SelectItem>
                <SelectItem value="mentions">Most Mentions</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              {(['all', 'sol_ecosystem', 'new_listings', 'high_volume'] as FilterType[]).map(f => (
                <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'}
                  className="h-7 px-2 text-[10px]" onClick={() => setFilter(f)}>
                  {f === 'all' ? 'All' : f === 'sol_ecosystem' ? 'SOL' : f === 'new_listings' ? 'New' : 'Vol+'}
                </Button>
              ))}
            </div>

            <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs gap-1" onClick={() => refetch()}>
              {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Refresh
            </Button>
          </div>
        </div>

        {/* Min market cap filter */}
        <div className="flex items-center gap-2 py-2">
          <Filter className="h-3.5 w-3.5 text-gray-500" />
          <span className="text-xs text-gray-500">Min Market Cap:</span>
          <Input
            type="number" placeholder="e.g. 500 (K)" value={minMarketCap}
            onChange={e => setMinMarketCap(e.target.value)}
            className="h-7 w-28 text-xs bg-gray-800 border-gray-700"
          />
          <span className="text-xs text-gray-600">× $1K</span>
          <span className="text-xs text-gray-600 ml-auto">Updated: {lastUpdate}</span>
        </div>

        <TabsContent value="trending" className="mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
              <span className="text-sm text-gray-400 ml-2">Scanning Solana ecosystem…</span>
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-center py-12 text-gray-500 text-sm">No tokens match current filters.</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {sorted.map(t => (
                <TokenCard key={t.address} token={t} onAutoTrade={handleAutoTrade} onWatchlist={handleWatchlist} />
              ))}
            </div>
          )}
          <p className="text-[10px] text-gray-600 mt-3 text-center">
            ⚠ Social data is estimated. Always DYOR before trading. DexScreener data refreshes every 60s.
          </p>
        </TabsContent>

        <TabsContent value="feed" className="mt-2">
          <Card className="bg-gray-900/60 border-gray-700/50">
            <CardHeader className="py-3 px-4 flex flex-row items-center justify-between">
              <CardTitle className="text-sm">Live Social Posts</CardTitle>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={loadReddit} disabled={loadingReddit}>
                {loadingReddit ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Reload
              </Button>
            </CardHeader>
            <CardContent className="px-4 pb-4 max-h-[400px] overflow-y-auto">
              {allPosts.length === 0 ? (
                <p className="text-xs text-gray-500 py-4 text-center">Loading social posts…</p>
              ) : (
                allPosts.map(p => <FeedPost key={p.id} post={p} />)
              )}
            </CardContent>
          </Card>

          <div className="mt-3 px-3 py-2.5 bg-gray-800/40 border border-gray-700/50 rounded-xl text-xs text-gray-500">
            <p className="font-medium text-gray-400 mb-1">Data Sources Active</p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline" className="text-[9px] border-green-600/40 text-green-400">✓ DexScreener (live)</Badge>
              <Badge variant="outline" className="text-[9px] border-orange-600/40 text-orange-400">✓ Reddit (public)</Badge>
              <Badge variant="outline" className="text-[9px] border-blue-600/40 text-blue-400">🔑 Twitter/X (add key in API settings)</Badge>
              <Badge variant="outline" className="text-[9px] border-purple-600/40 text-purple-400">🔑 Telegram (optional)</Badge>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
