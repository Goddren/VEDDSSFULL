import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Target, RefreshCw, AlertTriangle } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ATRData {
  success: boolean;
  atr: number;
  atrPercent: number;
  currentPrice: number;
  assetType: string;
  suggestedSL: {
    conservative: number;
    moderate: number;
    aggressive: number;
  };
  suggestedSLPips?: {
    conservative: number;
    moderate: number;
    aggressive: number;
  };
}

interface ATRIndicatorProps {
  symbol: string;
  timeframe?: string;
  compact?: boolean;
}

export function ATRIndicator({ symbol, timeframe = '1h', compact = true }: ATRIndicatorProps) {
  const [atrData, setAtrData] = useState<ATRData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetched, setFetched] = useState(false);

  const fetchATR = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('POST', '/api/market-data/atr', {
        symbol,
        timeframe
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch');
      }
      
      const data = await response.json();
      setAtrData(data);
      setFetched(true);
    } catch (err) {
      setError('ATR unavailable');
      setFetched(true);
    } finally {
      setLoading(false);
    }
  };

  const formatValue = (val: number, assetType: string) => {
    if (assetType === 'crypto') return val >= 1 ? val.toFixed(2) : val.toFixed(6);
    if (assetType === 'forex') return val.toFixed(5);
    return val.toFixed(2);
  };

  if (compact) {
    return (
      <Popover>
        <PopoverTrigger asChild>
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 px-2 text-xs"
              onClick={() => !fetched && fetchATR()}
            >
              <Target className="h-3 w-3 mr-1 text-amber-500" />
              ATR SL
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-3">
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : error ? (
              <div className="text-center py-2">
                <AlertTriangle className="h-4 w-4 text-amber-500 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">{error}</p>
                <Button size="sm" variant="ghost" onClick={fetchATR} className="mt-1">
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Retry
                </Button>
              </div>
            ) : atrData ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{symbol} ATR Suggestions</span>
                  <Badge variant="outline" className="text-xs">{atrData.atrPercent.toFixed(2)}% vol</Badge>
                </div>
                
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-green-500/10 rounded p-2">
                    <div className="text-[10px] text-green-400">Conservative</div>
                    <div className="text-xs font-bold">
                      {atrData.suggestedSLPips 
                        ? `${atrData.suggestedSLPips.conservative} pips`
                        : formatValue(atrData.suggestedSL.conservative, atrData.assetType)
                      }
                    </div>
                  </div>
                  <div className="bg-yellow-500/10 rounded p-2 ring-1 ring-yellow-500/30">
                    <div className="text-[10px] text-yellow-400">Moderate</div>
                    <div className="text-xs font-bold">
                      {atrData.suggestedSLPips 
                        ? `${atrData.suggestedSLPips.moderate} pips`
                        : formatValue(atrData.suggestedSL.moderate, atrData.assetType)
                      }
                    </div>
                  </div>
                  <div className="bg-red-500/10 rounded p-2">
                    <div className="text-[10px] text-red-400">Aggressive</div>
                    <div className="text-xs font-bold">
                      {atrData.suggestedSLPips 
                        ? `${atrData.suggestedSLPips.aggressive} pips`
                        : formatValue(atrData.suggestedSL.aggressive, atrData.assetType)
                      }
                    </div>
                  </div>
                </div>
                
                <p className="text-[10px] text-muted-foreground text-center">
                  Based on {timeframe} ATR: {formatValue(atrData.atr, atrData.assetType)}
                </p>
              </div>
            ) : (
              <div className="text-center py-2">
                <Button size="sm" onClick={fetchATR}>
                  <Target className="h-3 w-3 mr-1" />
                  Load ATR Suggestions
                </Button>
              </div>
            )}
          </PopoverContent>
        </Popover>
    );
  }

  return null;
}