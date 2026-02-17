import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, WifiOff, Clock, Volume2, ArrowUp, ArrowDown, Server } from 'lucide-react';
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
  hourlyHigh: number | null;
  hourlyLow: number | null;
  hourlyVolume: number;
  avgVolume: number;
  volumeRatio: number;
  isHighVolume: boolean;
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

function formatPrice(price: number | null, symbol: string): string {
  if (price === null) return '--';
  const decimals = symbol.includes('JPY') ? 3 : 5;
  return price.toFixed(decimals);
}

function formatVolume(volume: number): string {
  if (volume >= 1000000) return (volume / 1000000).toFixed(1) + 'M';
  if (volume >= 1000) return (volume / 1000).toFixed(1) + 'K';
  return volume.toFixed(0);
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

  const brokerGroups: Record<string, ConnectedPair[]> = {};
  for (const pair of allPairs) {
    const brokerName = pair.broker || 'Unknown';
    if (!brokerGroups[brokerName]) {
      brokerGroups[brokerName] = [];
    }
    brokerGroups[brokerName].push(pair);
  }

  const brokerNames = Object.keys(brokerGroups);

  return (
    <Card className="bg-slate-900/50 border-slate-700">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Activity className="w-4 h-4 text-green-400" />
          Chart Data AI Connected Pairs
          <div className="ml-auto flex items-center gap-2">
            {brokerNames.length > 1 && (
              <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/30">
                {brokerNames.length} Brokers
              </Badge>
            )}
            {data.totalActive > 0 && (
              <Badge variant="outline" className="bg-green-500/20 text-green-400 border-green-500/30">
                {data.totalActive} Live
              </Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {brokerNames.map((brokerName) => {
          const pairs = brokerGroups[brokerName];
          const activePairsCount = pairs.filter(p => p.isActive).length;
          return (
            <div key={brokerName} className="space-y-2">
              {brokerNames.length > 1 && (
                <div className="flex items-center gap-2 pb-1 border-b border-gray-700/50">
                  <Server className="w-3.5 h-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">{brokerName}</span>
                  <Badge variant="outline" className={`text-[10px] ml-auto ${activePairsCount > 0 ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-gray-500/20 text-gray-400 border-gray-500/30'}`}>
                    {activePairsCount}/{pairs.length} Live
                  </Badge>
                </div>
              )}
              {pairs.map((pair, index) => (
                <div
                  key={`${pair.symbol}_${pair.timeframe}_${index}`}
                  className={`p-3 rounded-lg ${
                    pair.isActive 
                      ? 'bg-green-500/10 border border-green-500/30' 
                      : 'bg-gray-500/10 border border-gray-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${pair.isActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                      <span className="font-semibold text-white">{pair.symbol}</span>
                      <Badge variant="outline" className="text-xs bg-blue-500/20 text-blue-400 border-blue-500/30">
                        {pair.timeframe}
                      </Badge>
                      {pair.isHighVolume && (
                        <Badge variant="outline" className="text-xs bg-orange-500/20 text-orange-400 border-orange-500/30">
                          <Volume2 className="w-3 h-3 mr-1" />
                          HIGH VOL
                        </Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-white">
                        {formatPrice(pair.latestPrice, pair.symbol)}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <Clock className="w-3 h-3" />
                        {pair.isActive 
                          ? `${pair.secondsAgo}s ago`
                          : formatDistanceToNow(new Date(pair.lastSeen), { addSuffix: true })
                        }
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-700/50">
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs">
                        <ArrowUp className="w-3 h-3 text-green-400" />
                        <span className="text-gray-400">Hourly High:</span>
                      </div>
                      <span className="font-mono text-xs text-green-400">
                        {formatPrice(pair.hourlyHigh, pair.symbol)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-xs">
                        <ArrowDown className="w-3 h-3 text-red-400" />
                        <span className="text-gray-400">Hourly Low:</span>
                      </div>
                      <span className="font-mono text-xs text-red-400">
                        {formatPrice(pair.hourlyLow, pair.symbol)}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-gray-700/50">
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Hourly Vol</div>
                      <div className={`text-xs font-mono ${pair.isHighVolume ? 'text-orange-400' : 'text-gray-300'}`}>
                        {formatVolume(pair.hourlyVolume)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Avg Vol</div>
                      <div className="text-xs font-mono text-gray-300">
                        {formatVolume(pair.avgVolume)}
                      </div>
                    </div>
                    <div className="text-center">
                      <div className="text-xs text-gray-500">Vol Ratio</div>
                      <div className={`text-xs font-mono ${pair.volumeRatio > 1.5 ? 'text-orange-400' : pair.volumeRatio > 1 ? 'text-green-400' : 'text-gray-300'}`}>
                        {pair.volumeRatio.toFixed(2)}x
                      </div>
                    </div>
                  </div>
                  
                  {brokerNames.length <= 1 && (
                    <div className="flex items-center justify-center gap-1 text-xs text-gray-500 mt-2">
                      <Server className="w-3 h-3" />
                      {pair.broker}
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })}
        
        {brokerNames.length <= 1 && (
          <div className="text-xs text-gray-500 text-center pt-1">
            Data streaming from {allPairs[0]?.broker || 'MT5'}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
