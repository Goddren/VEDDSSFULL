import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Wifi, WifiOff, TrendingUp, TrendingDown, Clock, BarChart3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ConnectedPair {
  symbol: string;
  timeframe: string;
  broker: string;
  lastSeen: string;
  candleCount: number;
  latestPrice: number | null;
  latestHigh: number | null;
  latestLow: number | null;
  secondsAgo: number;
  isActive: boolean;
  status: 'LIVE' | 'STALE' | 'OFFLINE';
}

interface ConnectedPairsResponse {
  activePairs: ConnectedPair[];
  stalePairs: ConnectedPair[];
  totalActive: number;
  totalStale: number;
}

export function ConnectedPairs() {
  const { data, isLoading, error } = useQuery<ConnectedPairsResponse>({
    queryKey: ['/api/mt5/connected-pairs'],
    refetchInterval: 10000,
  });

  if (isLoading) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400 animate-pulse" />
            Loading MT5 Connections...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error || !data) {
    return null;
  }

  const allPairs = [...data.activePairs, ...data.stalePairs];
  
  if (allPairs.length === 0) {
    return (
      <Card className="bg-slate-900/50 border-slate-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-gray-500" />
            No MT5 Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-gray-400">
            Start the Chart Data EA on MT5 to see connected pairs here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-400" />
          Chart Data AI Connected Pairs
          {data.totalActive > 0 && (
            <Badge variant="outline" className="ml-auto bg-green-500/20 text-green-400 border-green-500/30">
              {data.totalActive} Live
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {allPairs.map((pair, index) => (
          <div
            key={`${pair.symbol}_${pair.timeframe}_${index}`}
            className={`flex items-center justify-between p-2 rounded-lg ${
              pair.isActive 
                ? 'bg-green-500/10 border border-green-500/30' 
                : 'bg-gray-500/10 border border-gray-500/30'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className={`w-2 h-2 rounded-full ${pair.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{pair.symbol}</span>
                  <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                    {pair.timeframe}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-400">
                  <Clock className="w-3 h-3" />
                  {pair.isActive 
                    ? `Updated ${pair.secondsAgo}s ago`
                    : formatDistanceToNow(new Date(pair.lastSeen), { addSuffix: true })
                  }
                </div>
              </div>
            </div>
            
            <div className="text-right">
              {pair.latestPrice && (
                <div className="font-mono text-sm text-white">
                  {pair.latestPrice.toFixed(pair.symbol.includes('JPY') ? 3 : 5)}
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-gray-400">
                <BarChart3 className="w-3 h-3" />
                {pair.candleCount} candles
              </div>
            </div>
          </div>
        ))}
        
        <div className="text-xs text-gray-500 text-center pt-1">
          Data streaming from {allPairs[0]?.broker || 'MT5'}
        </div>
      </CardContent>
    </Card>
  );
}
