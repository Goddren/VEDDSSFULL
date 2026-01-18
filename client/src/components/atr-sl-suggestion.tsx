import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingDown, Shield, AlertTriangle, Info, RefreshCw, Target } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface ATRData {
  success: boolean;
  symbol: string;
  timeframe: string;
  assetType: string;
  atr: number;
  atrPercent: number;
  currentPrice: number;
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

interface ATRStopLossSuggestionProps {
  symbol: string;
  timeframe?: string;
  aiSuggestedSL?: string;
  direction?: 'buy' | 'sell';
}

export function ATRStopLossSuggestion({ 
  symbol, 
  timeframe = '1d',
  aiSuggestedSL,
  direction = 'buy' // Default to buy as most common signal type
}: ATRStopLossSuggestionProps) {
  const [atrData, setAtrData] = useState<ATRData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStyle, setSelectedStyle] = useState<'conservative' | 'moderate' | 'aggressive'>('moderate');

  const fetchATR = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest('POST', '/api/market-data/atr', {
        symbol,
        timeframe
      });
      
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to fetch ATR');
      }
      
      const data = await response.json();
      setAtrData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load ATR data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchATR();
  }, [symbol, timeframe]);

  const formatPrice = (price: number, assetType: string) => {
    if (assetType === 'crypto') {
      return price >= 1 ? price.toFixed(2) : price.toFixed(6);
    }
    if (assetType === 'forex') {
      return price.toFixed(5);
    }
    return price.toFixed(2);
  };

  const getStyleDescription = (style: string) => {
    switch (style) {
      case 'conservative':
        return 'Wider SL (2x ATR) - Fewer stop-outs, gives trade room to breathe';
      case 'moderate':
        return 'Balanced SL (1.5x ATR) - Good balance of risk and room';
      case 'aggressive':
        return 'Tight SL (1x ATR) - Higher risk but less capital at risk';
      default:
        return '';
    }
  };

  const getStyleColor = (style: string) => {
    switch (style) {
      case 'conservative':
        return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'moderate':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case 'aggressive':
        return 'bg-red-500/20 text-red-400 border-red-500/30';
      default:
        return '';
    }
  };

  if (loading) {
    return (
      <Card className="border-amber-500/30 bg-gradient-to-br from-slate-900/50 to-amber-900/10">
        <CardHeader className="pb-2">
          <Skeleton className="h-6 w-48" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-10 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-amber-500/30 bg-gradient-to-br from-slate-900/50 to-amber-900/10">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-500" />
            ATR-Based Stop Loss Suggestions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-amber-400/80 text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>{error}</span>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchATR}
              className="ml-auto"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            Live ATR data unavailable. Use AI-suggested SL as baseline.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!atrData) return null;

  const selectedSL = atrData.suggestedSL[selectedStyle];
  const selectedPips = atrData.suggestedSLPips?.[selectedStyle];

  return (
    <Card className="border-amber-500/30 bg-gradient-to-br from-slate-900/50 to-amber-900/10">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Target className="h-5 w-5 text-amber-500" />
            ATR Stop Loss Suggestions
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p>ATR (Average True Range) measures market volatility. These suggestions help set SL distances that match {symbol}'s current volatility to avoid unnecessary stop-outs while managing risk.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={fetchATR}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline" className="text-xs">
            {atrData.assetType.toUpperCase()}
          </Badge>
          <span>•</span>
          <span>ATR({timeframe}): {formatPrice(atrData.atr, atrData.assetType)}</span>
          <span>•</span>
          <span>Volatility: {atrData.atrPercent.toFixed(2)}%</span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {(['conservative', 'moderate', 'aggressive'] as const).map((style) => (
            <button
              key={style}
              onClick={() => setSelectedStyle(style)}
              className={`p-3 rounded-lg border transition-all ${
                selectedStyle === style 
                  ? getStyleColor(style) + ' ring-2 ring-offset-2 ring-offset-background' 
                  : 'border-border/50 hover:border-border'
              }`}
            >
              <div className="text-xs font-medium capitalize mb-1">{style}</div>
              <div className="text-lg font-bold">
                {atrData.suggestedSLPips 
                  ? `${atrData.suggestedSLPips[style]} pips`
                  : formatPrice(atrData.suggestedSL[style], atrData.assetType)
                }
              </div>
              <div className="text-xs text-muted-foreground">
                {style === 'conservative' ? '2x ATR' : style === 'moderate' ? '1.5x ATR' : '1x ATR'}
              </div>
            </button>
          ))}
        </div>

        <div className="bg-background/50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2 text-sm">
            <Shield className="h-4 w-4 text-amber-500" />
            <span className="font-medium">Selected: {selectedStyle.charAt(0).toUpperCase() + selectedStyle.slice(1)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {getStyleDescription(selectedStyle)}
          </p>
          
          <div className="pt-2 border-t border-border/50">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Current Price</div>
                <div className="font-mono">{formatPrice(atrData.currentPrice, atrData.assetType)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">
                  Suggested SL {direction === 'buy' ? 'Below' : 'Above'}
                </div>
                <div className="font-mono text-amber-400">
                  {formatPrice(
                    direction === 'buy' 
                      ? atrData.currentPrice - selectedSL 
                      : atrData.currentPrice + selectedSL,
                    atrData.assetType
                  )}
                </div>
              </div>
            </div>
          </div>

          {aiSuggestedSL && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center gap-2 text-xs">
                <TrendingDown className="h-3 w-3" />
                <span className="text-muted-foreground">AI Pattern-Based SL:</span>
                <span className="font-mono">{aiSuggestedSL}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Compare with ATR suggestion. If AI SL is tighter than 1x ATR, consider widening it to avoid volatility stop-outs.
              </p>
            </div>
          )}
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
          <div className="flex gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-200/80">
              <strong>Risk Note:</strong> These are suggestions based on current volatility. 
              Always validate against your risk tolerance and account size. 
              BTC and crypto pairs typically need wider SLs than forex pairs.
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}