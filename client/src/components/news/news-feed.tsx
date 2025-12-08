import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Minus, Newspaper, ExternalLink, Clock, AlertCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NewsItem {
  id: string;
  headline: string;
  summary: string;
  source: string;
  url: string;
  image: string;
  datetime: number;
  related: string;
  category: string;
}

interface NewsSentiment {
  overallScore: number;
  overallLabel: 'bullish' | 'bearish' | 'neutral';
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  totalArticles: number;
  topHeadlines: string[];
  tradingImplication: string;
}

interface NewsResponse {
  news: NewsItem[];
  sentiment: NewsSentiment;
}

interface NewsFeedProps {
  symbol?: string;
  showSentiment?: boolean;
  maxItems?: number;
  compact?: boolean;
}

export function NewsFeed({ symbol, showSentiment = true, maxItems = 5, compact = false }: NewsFeedProps) {
  const { data, isLoading, error } = useQuery<NewsResponse>({
    queryKey: symbol ? ['/api/news/symbol', symbol] : ['/api/news/market'],
    queryFn: async () => {
      const url = symbol ? `/api/news/symbol/${symbol}` : '/api/news/market';
      const res = await apiRequest('GET', url);
      if (!res.ok) throw new Error('Failed to fetch news');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Newspaper className="w-5 h-5" />
            {symbol ? `${symbol} News` : 'Market News'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Newspaper className="w-5 h-5" />
            {symbol ? `${symbol} News` : 'Market News'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">Unable to load news</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { news, sentiment } = data;
  const displayNews = news.slice(0, maxItems);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Newspaper className="w-5 h-5" />
            {symbol ? `${symbol} News` : 'Market News'}
          </CardTitle>
          {showSentiment && sentiment && (
            <SentimentBadge sentiment={sentiment} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {showSentiment && sentiment && !compact && (
          <SentimentIndicator sentiment={sentiment} />
        )}
        
        <div className={`space-y-${compact ? '2' : '3'}`}>
          {displayNews.map((item) => (
            <NewsItemCard key={item.id} item={item} compact={compact} />
          ))}
        </div>
        
        {displayNews.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No recent news available
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SentimentBadge({ sentiment }: { sentiment: NewsSentiment }) {
  const colors: Record<string, string> = {
    bullish: 'bg-green-500/10 text-green-500 border-green-500/30',
    bearish: 'bg-red-500/10 text-red-500 border-red-500/30',
    neutral: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/30',
  };

  const icons: Record<string, JSX.Element> = {
    bullish: <TrendingUp className="w-3 h-3" />,
    bearish: <TrendingDown className="w-3 h-3" />,
    neutral: <Minus className="w-3 h-3" />,
  };

  const label = sentiment.overallLabel || 'neutral';
  const safeLabel = ['bullish', 'bearish', 'neutral'].includes(label) ? label : 'neutral';

  return (
    <Badge variant="outline" className={`${colors[safeLabel]} flex items-center gap-1`}>
      {icons[safeLabel]}
      {safeLabel.charAt(0).toUpperCase() + safeLabel.slice(1)}
    </Badge>
  );
}

function SentimentIndicator({ sentiment }: { sentiment: NewsSentiment }) {
  const scoreColor = sentiment.overallScore > 20 ? 'text-green-500' : 
                     sentiment.overallScore < -20 ? 'text-red-500' : 'text-yellow-500';
  const bgColor = sentiment.overallScore > 20 ? 'bg-green-500/10' : 
                  sentiment.overallScore < -20 ? 'bg-red-500/10' : 'bg-yellow-500/10';

  return (
    <div className={`${bgColor} rounded-lg p-3 space-y-2`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">News Sentiment</span>
        <span className={`text-lg font-bold ${scoreColor}`}>
          {sentiment.overallScore > 0 ? '+' : ''}{sentiment.overallScore}
        </span>
      </div>
      
      <div className="flex gap-4 text-xs">
        <span className="text-green-500">{sentiment.bullishCount} Bullish</span>
        <span className="text-red-500">{sentiment.bearishCount} Bearish</span>
        <span className="text-yellow-500">{sentiment.neutralCount} Neutral</span>
      </div>

      <p className="text-xs text-muted-foreground">
        {sentiment.tradingImplication}
      </p>
    </div>
  );
}

function NewsItemCard({ item, compact }: { item: NewsItem; compact: boolean }) {
  const timeAgo = formatDistanceToNow(new Date(item.datetime), { addSuffix: true });

  if (compact) {
    return (
      <a 
        href={item.url} 
        target="_blank" 
        rel="noopener noreferrer"
        className="block hover:bg-accent/50 rounded p-2 -mx-2 transition-colors"
        data-testid={`link-news-${item.id}`}
      >
        <p className="text-sm font-medium line-clamp-1">{item.headline}</p>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span>{item.source}</span>
          <span>•</span>
          <span>{timeAgo}</span>
        </div>
      </a>
    );
  }

  return (
    <a 
      href={item.url} 
      target="_blank" 
      rel="noopener noreferrer"
      className="block border rounded-lg p-3 hover:bg-accent/50 transition-colors"
      data-testid={`link-news-${item.id}`}
    >
      <div className="flex gap-3">
        {item.image && (
          <img 
            src={item.image} 
            alt="" 
            className="w-16 h-16 object-cover rounded hidden sm:block"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
        )}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm line-clamp-2 mb-1">{item.headline}</p>
          <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.summary}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium">{item.source}</span>
            <span>•</span>
            <Clock className="w-3 h-3" />
            <span>{timeAgo}</span>
            <ExternalLink className="w-3 h-3 ml-auto" />
          </div>
        </div>
      </div>
    </a>
  );
}

export function NewsSentimentWidget({ symbol }: { symbol: string }) {
  const { data, isLoading } = useQuery<{ symbol: string; sentiment: NewsSentiment; tradingSignal: any }>({
    queryKey: ['/api/news/sentiment', symbol],
    queryFn: async () => {
      const res = await apiRequest('POST', '/api/news/analyze-sentiment', { symbol });
      if (!res.ok) throw new Error('Failed to analyze sentiment');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2">
        <Skeleton className="h-6 w-20" />
        <Skeleton className="h-4 w-16" />
      </div>
    );
  }

  if (!data) return null;

  const sentiment = data.sentiment || { 
    overallScore: 0, 
    overallLabel: 'neutral' as const, 
    tradingImplication: 'Monitor news for trading opportunities.' 
  };
  const tradingSignal = data.tradingSignal || { direction: 'NEUTRAL', confidence: 0, reason: '' };
  
  const direction = tradingSignal.direction || 'NEUTRAL';
  const color = direction === 'BUY' ? 'text-green-500' :
                direction === 'SELL' ? 'text-red-500' : 'text-yellow-500';
  const bgColor = direction === 'BUY' ? 'bg-green-500/10' :
                  direction === 'SELL' ? 'bg-red-500/10' : 'bg-yellow-500/10';

  return (
    <div className={`${bgColor} rounded-lg p-3`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium flex items-center gap-1">
          <Newspaper className="w-4 h-4" />
          News Signal
        </span>
        <Badge variant="outline" className={color}>
          {direction}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">{sentiment.tradingImplication || 'Monitor news for trading opportunities.'}</p>
    </div>
  );
}
