import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  RefreshCw,
  MessageSquare,
  ExternalLink,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { motion } from 'framer-motion';

interface GoldSignal {
  text: string;
  date: string;
  sentiment: 'BUY' | 'SELL' | 'NEUTRAL';
}

interface GoldSentimentData {
  overallSentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  latestSignals: GoldSignal[];
  summary: string;
  lastUpdated: string;
  isDemo?: boolean;
}

const SentimentIcon = ({ sentiment }: { sentiment: string }) => {
  switch (sentiment) {
    case 'BULLISH':
    case 'BUY':
      return <TrendingUp className="w-5 h-5 text-emerald-400" />;
    case 'BEARISH':
    case 'SELL':
      return <TrendingDown className="w-5 h-5 text-red-400" />;
    default:
      return <Minus className="w-5 h-5 text-gray-400" />;
  }
};

const getSentimentColor = (sentiment: string) => {
  switch (sentiment) {
    case 'BULLISH':
    case 'BUY':
      return 'from-emerald-500/20 to-emerald-600/10 border-emerald-500/30 text-emerald-400';
    case 'BEARISH':
    case 'SELL':
      return 'from-red-500/20 to-red-600/10 border-red-500/30 text-red-400';
    default:
      return 'from-gray-500/20 to-gray-600/10 border-gray-500/30 text-gray-400';
  }
};

const getConfidenceColor = (confidence: number) => {
  if (confidence >= 70) return 'bg-emerald-500';
  if (confidence >= 40) return 'bg-amber-500';
  return 'bg-red-500';
};

export function GoldSentiment() {
  const { data, isLoading, refetch, isFetching } = useQuery<GoldSentimentData>({
    queryKey: ['/api/gold-sentiment'],
    refetchInterval: 5 * 60 * 1000,
  });

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  if (isLoading) {
    return (
      <Card className="bg-gray-900 border-gray-800">
        <CardContent className="p-6">
          <div className="flex items-center justify-center h-48">
            <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
            <span className="ml-2 text-gray-400">Loading gold sentiment...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-gray-900 border-gray-800 overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                Gold Sentiment
                <Badge variant="outline" className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400">
                  XAU/USD
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs flex items-center gap-1">
                <MessageSquare className="w-3 h-3" />
                Telegram Channel Analysis
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            className="h-8 w-8"
            data-testid="button-refresh-sentiment"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {data?.isDemo && (
          <div className="mb-4 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400" />
            <span className="text-xs text-amber-400">Demo mode - Connect Telegram for live signals</span>
          </div>
        )}

        {data && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <div className={`p-4 rounded-xl bg-gradient-to-br ${getSentimentColor(data.overallSentiment)} border`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <SentimentIcon sentiment={data.overallSentiment} />
                  <span className="font-bold text-lg">{data.overallSentiment}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs text-gray-400">Confidence</div>
                  <div className="font-bold">{data.confidence}%</div>
                </div>
              </div>
              
              <div className="w-full h-2 bg-gray-700 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${data.confidence}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className={`h-full ${getConfidenceColor(data.confidence)} rounded-full`}
                />
              </div>
            </div>

            <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
              <p className="text-sm text-gray-300 leading-relaxed">{data.summary}</p>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-400">Latest Signals</span>
                <a 
                  href="https://t.me/goldtradermo" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  data-testid="link-telegram-channel"
                >
                  View Channel <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              
              <ScrollArea className="h-[150px]">
                <div className="space-y-2">
                  {data.latestSignals.map((signal, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="p-3 rounded-lg bg-gray-800/30 border border-gray-700/30"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="text-sm text-gray-200 line-clamp-2">{signal.text}</p>
                          <span className="text-[10px] text-gray-500">{formatDate(signal.date)}</span>
                        </div>
                        <Badge 
                          variant="outline" 
                          className={`text-[10px] flex-shrink-0 ${getSentimentColor(signal.sentiment)}`}
                        >
                          <SentimentIcon sentiment={signal.sentiment} />
                          <span className="ml-1">{signal.sentiment}</span>
                        </Badge>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="text-[10px] text-gray-500 text-center">
              Last updated: {formatTime(data.lastUpdated)}
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

export default GoldSentiment;
