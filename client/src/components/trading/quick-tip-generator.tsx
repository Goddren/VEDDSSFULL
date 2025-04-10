import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowUpRightFromCircle, Sparkles, TrendingUp, TrendingDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

// Common timeframes for trading
const timeframes = [
  { value: "1m", label: "1 Minute" },
  { value: "5m", label: "5 Minutes" },
  { value: "15m", label: "15 Minutes" },
  { value: "30m", label: "30 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "4h", label: "4 Hours" },
  { value: "1d", label: "Daily" },
  { value: "1w", label: "Weekly" },
  { value: "1M", label: "Monthly" },
];

// Common trading pairs
const commonSymbols = [
  "EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", 
  "BTCUSD", "ETHUSD", "XRPUSD", "LTCUSD", "BNBUSD"
];

interface TradingTip {
  tip: string;
  direction: string;
  confidence: number;
  key_levels: { 
    support: string;
    resistance: string;
  };
}

export function QuickTipGenerator() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [symbol, setSymbol] = useState("");
  const [timeframe, setTimeframe] = useState("4h");
  const [marketContext, setMarketContext] = useState("");
  const [customSymbol, setCustomSymbol] = useState("");
  const [tipData, setTipData] = useState<TradingTip | null>(null);

  // Handle generating the trading tip
  const { mutate: generateTip, isPending } = useMutation({
    mutationFn: async () => {
      if (!symbol && !customSymbol) {
        throw new Error("Symbol is required");
      }
      
      const finalSymbol = symbol || customSymbol;
      const response = await apiRequest("POST", "/api/generate-trading-tip", {
        symbol: finalSymbol,
        timeframe,
        marketContext
      });
      
      return response.json();
    },
    onSuccess: (data: TradingTip) => {
      setTipData(data);
      toast({
        title: "Tip Generated",
        description: `Successfully generated a trading tip for ${symbol || customSymbol}`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to generate trading tip",
        variant: "destructive",
      });
    },
  });

  function getConfidenceBadgeColor(confidence: number): string {
    if (confidence >= 80) return "bg-green-100 text-green-800";
    if (confidence >= 60) return "bg-blue-100 text-blue-800";
    if (confidence >= 40) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  }

  function getDirectionIcon(direction: string) {
    switch (direction.toLowerCase()) {
      case 'buy':
        return <TrendingUp className="h-4 w-4 text-green-600" />;
      case 'sell':
        return <TrendingDown className="h-4 w-4 text-red-600" />;
      default:
        return <ArrowUpRightFromCircle className="h-4 w-4 text-gray-600" />;
    }
  }

  function getDirectionColor(direction: string): string {
    switch (direction.toLowerCase()) {
      case 'buy':
        return "text-green-600";
      case 'sell':
        return "text-red-600";
      default:
        return "text-gray-600";
    }
  }

  return (
    <Card className="w-full shadow-lg">
      <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-t-lg">
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Quick Trading Tip Generator
        </CardTitle>
        <CardDescription className="text-blue-100">
          Generate concise AI-powered trading tips in seconds
        </CardDescription>
      </CardHeader>
      
      <CardContent className="pt-6 pb-2">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="symbol">Trading Pair</Label>
              <Select
                value={symbol}
                onValueChange={(value) => {
                  setSymbol(value);
                  if (value === "custom") {
                    // Focus the custom input when "Other" is selected
                    setTimeout(() => {
                      document.getElementById("customSymbol")?.focus();
                    }, 100);
                  } else {
                    setCustomSymbol("");
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select trading pair" />
                </SelectTrigger>
                <SelectContent>
                  {commonSymbols.map((sym) => (
                    <SelectItem key={sym} value={sym}>
                      {sym}
                    </SelectItem>
                  ))}
                  <SelectItem value="custom">Other (Custom)</SelectItem>
                </SelectContent>
              </Select>
              
              {symbol === "custom" && (
                <div className="mt-2">
                  <Input
                    id="customSymbol"
                    placeholder="Enter custom symbol (e.g., USDCHF)"
                    value={customSymbol}
                    onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                  />
                </div>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="timeframe">Timeframe</Label>
              <Select value={timeframe} onValueChange={setTimeframe}>
                <SelectTrigger>
                  <SelectValue placeholder="Select timeframe" />
                </SelectTrigger>
                <SelectContent>
                  {timeframes.map((tf) => (
                    <SelectItem key={tf.value} value={tf.value}>
                      {tf.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="context">Market Context (Optional)</Label>
            <Textarea
              id="context"
              placeholder="Add any additional context about current market conditions..."
              value={marketContext}
              onChange={(e) => setMarketContext(e.target.value)}
              rows={2}
              className="resize-none"
            />
          </div>
        </div>
      </CardContent>
      
      <CardFooter className="flex flex-col space-y-4">
        <Button 
          onClick={() => generateTip()} 
          disabled={isPending || (!symbol && !customSymbol)}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Tip...
            </>
          ) : (
            <>
              <Sparkles className="mr-2 h-4 w-4" /> Generate Quick Tip
            </>
          )}
        </Button>
        
        {tipData && (
          <div className="w-full p-4 bg-gray-50 rounded-lg mt-2 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700">
                  {symbol || customSymbol} ({timeframe})
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium flex items-center gap-1 ${getDirectionColor(tipData.direction)}`}>
                  {getDirectionIcon(tipData.direction)} {tipData.direction.toUpperCase()}
                </span>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${getConfidenceBadgeColor(tipData.confidence)}`}>
                {tipData.confidence}% Confidence
              </span>
            </div>
            
            <p className="text-gray-700">{tipData.tip}</p>
            
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-green-50 p-2 rounded">
                <span className="text-gray-500 block">Support</span>
                <span className="font-medium">{tipData.key_levels.support}</span>
              </div>
              <div className="bg-red-50 p-2 rounded">
                <span className="text-gray-500 block">Resistance</span>
                <span className="font-medium">{tipData.key_levels.resistance}</span>
              </div>
            </div>
          </div>
        )}
      </CardFooter>
    </Card>
  );
}