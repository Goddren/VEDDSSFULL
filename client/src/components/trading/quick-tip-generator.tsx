import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { 
  Loader2, 
  ArrowUpRightFromCircle, 
  Sparkles, 
  TrendingUp, 
  TrendingDown,
  Clock,
  BarChart3,
  AlertCircle,
  ChevronRight,
  RefreshCw,
  Zap,
  DollarSign,
  Bitcoin,
  BarChart4
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";

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

  const [activeTab, setActiveTab] = useState("generator");
  const [isExpanded, setIsExpanded] = useState(false);
  const [popularPairs, setPopularPairs] = useState([
    { symbol: "EURUSD", direction: "buy", image: "🇪🇺" },
    { symbol: "GBPUSD", direction: "sell", image: "🇬🇧" },
    { symbol: "BTCUSD", direction: "buy", image: "₿" }
  ]);
  
  // Simulated confidence slider functionality
  const [confidenceValue, setConfidenceValue] = useState<number[]>([60]);

  useEffect(() => {
    if (tipData) {
      setActiveTab("result");
    }
  }, [tipData]);

  // Generate random "popular now" trading pairs
  useEffect(() => {
    const refreshPopularPairs = () => {
      const directions = ["buy", "sell"];
      const randomPairs = [...commonSymbols]
        .sort(() => 0.5 - Math.random())
        .slice(0, 3)
        .map(sym => ({
          symbol: sym,
          direction: directions[Math.floor(Math.random() * directions.length)],
          image: sym.includes("BTC") ? "₿" : 
                 sym.includes("ETH") ? "Ξ" : 
                 sym.includes("EUR") ? "🇪🇺" : 
                 sym.includes("GBP") ? "🇬🇧" : 
                 sym.includes("JPY") ? "🇯🇵" : 
                 sym.includes("AUD") ? "🇦🇺" : 
                 sym.includes("CAD") ? "🇨🇦" : "💱"
        }));
      setPopularPairs(randomPairs);
    };
    
    refreshPopularPairs();
    const interval = setInterval(refreshPopularPairs, 60000); // Refresh every minute
    
    return () => clearInterval(interval);
  }, []);

  const handleQuickSelect = (pair: string) => {
    setSymbol(pair);
    setCustomSymbol("");
    setActiveTab("generator");
  };

  // Animation variants for framer-motion
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: { 
      opacity: 1,
      transition: { 
        staggerChildren: 0.1
      }
    }
  };
  
  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: { 
      y: 0, 
      opacity: 1,
      transition: { type: "spring", stiffness: 300, damping: 24 }
    }
  };

  const pulseAnimation = {
    scale: [1, 1.03, 1],
    transition: { 
      duration: 1.5,
      repeat: Infinity,
      repeatType: "reverse" as const
    }
  };
  
  const confidenceGradient = 
    confidenceValue[0] >= 80 ? "from-green-500 to-green-700" : 
    confidenceValue[0] >= 60 ? "from-blue-500 to-blue-700" : 
    confidenceValue[0] >= 40 ? "from-yellow-500 to-yellow-700" : 
    "from-red-500 to-red-700";
    
  return (
    <Card className="overflow-hidden bg-gray-900 border-gray-800 shadow-xl">
      <CardHeader className="bg-gradient-to-r from-rose-600 to-indigo-700 text-white">
        <motion.div 
          className="flex items-center justify-between"
          layout
        >
          <motion.div
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
          >
            <CardTitle className="flex items-center gap-2 text-xl">
              <Sparkles className="h-5 w-5" />
              Quick Trading Tip Generator
            </CardTitle>
            <CardDescription className="text-gray-200 mt-1">
              AI-powered market insights in seconds
            </CardDescription>
          </motion.div>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsExpanded(!isExpanded)}
            className="rounded-full bg-white/10 p-2 hover:bg-white/20 transition-colors"
          >
            <ChevronRight className={`h-5 w-5 transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
          </motion.button>
        </motion.div>
      </CardHeader>
      
      <motion.div
        initial={false}
        animate={isExpanded ? "visible" : "hidden"}
        variants={{
          visible: { height: "auto", opacity: 1 },
          hidden: { height: "auto", opacity: 1 }
        }}
      >
        <Tabs 
          value={activeTab} 
          onValueChange={setActiveTab}
          className="w-full"
        >
          <div className="px-6 pt-6">
            <TabsList className="grid w-full grid-cols-2 bg-gray-800">
              <TabsTrigger 
                value="generator" 
                className="data-[state=active]:bg-rose-600 data-[state=active]:text-white"
              >
                Generator
              </TabsTrigger>
              <TabsTrigger 
                value="result" 
                className="data-[state=active]:bg-rose-600 data-[state=active]:text-white"
                disabled={!tipData}
              >
                Trading Tip
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value="generator" className="mt-0 p-0">
            <CardContent className="pt-6 pb-2">
              <motion.div 
                className="space-y-4"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
              >
                {/* Popular pairs */}
                <motion.div variants={itemVariants} className="mb-4">
                  <h3 className="text-sm font-medium text-gray-400 mb-2">Popular Now</h3>
                  <div className="flex flex-wrap gap-2">
                    {popularPairs.map((pair, idx) => (
                      <motion.div
                        key={idx}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className={`px-3 py-1.5 rounded-full border cursor-pointer flex items-center gap-1.5 ${
                          pair.direction === 'buy' 
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400' 
                            : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                        }`}
                        onClick={() => handleQuickSelect(pair.symbol)}
                      >
                        <span className="text-lg">{pair.image}</span>
                        <span>{pair.symbol}</span>
                        {pair.direction === 'buy' ? (
                          <TrendingUp className="h-3.5 w-3.5" />
                        ) : (
                          <TrendingDown className="h-3.5 w-3.5" />
                        )}
                      </motion.div>
                    ))}
                    <motion.div
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="px-3 py-1.5 rounded-full border border-gray-700 bg-gray-800/50 text-gray-400 cursor-pointer flex items-center gap-1.5"
                      onClick={() => setPopularPairs(prev => [...prev].sort(() => 0.5 - Math.random()))}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Refresh</span>
                    </motion.div>
                  </div>
                </motion.div>
                
                <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="symbol" className="text-gray-300">Trading Pair</Label>
                    <Select
                      value={symbol}
                      onValueChange={(value) => {
                        setSymbol(value);
                        if (value === "custom") {
                          setTimeout(() => {
                            document.getElementById("customSymbol")?.focus();
                          }, 100);
                        } else {
                          setCustomSymbol("");
                        }
                      }}
                    >
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Select trading pair" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700 text-white">
                        <div className="grid grid-cols-2 gap-1">
                          {commonSymbols.map((sym) => (
                            <SelectItem key={sym} value={sym} className="hover:bg-gray-700">
                              {sym}
                            </SelectItem>
                          ))}
                        </div>
                        <SelectItem value="custom" className="hover:bg-gray-700">Other (Custom)</SelectItem>
                      </SelectContent>
                    </Select>
                    
                    <AnimatePresence>
                      {symbol === "custom" && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-2">
                            <Input
                              id="customSymbol"
                              placeholder="Enter custom symbol (e.g., USDCHF)"
                              value={customSymbol}
                              onChange={(e) => setCustomSymbol(e.target.value.toUpperCase())}
                              className="bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                            />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="timeframe" className="text-gray-300">Timeframe</Label>
                    <Select value={timeframe} onValueChange={setTimeframe}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white">
                        <SelectValue placeholder="Select timeframe" />
                      </SelectTrigger>
                      <SelectContent className="bg-gray-800 border-gray-700 text-white">
                        {timeframes.map((tf) => (
                          <SelectItem key={tf.value} value={tf.value} className="hover:bg-gray-700">
                            {tf.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </motion.div>
                
                <motion.div variants={itemVariants} className="space-y-2">
                  <div className="flex justify-between items-center">
                    <Label htmlFor="confidence" className="text-gray-300">Expected Confidence</Label>
                    <Badge variant="outline" className={`${
                      confidenceValue[0] >= 80 ? 'bg-green-500/20 text-green-300 border-green-500/30' : 
                      confidenceValue[0] >= 60 ? 'bg-blue-500/20 text-blue-300 border-blue-500/30' : 
                      confidenceValue[0] >= 40 ? 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30' : 
                      'bg-red-500/20 text-red-300 border-red-500/30'
                    }`}>
                      {confidenceValue[0]}%
                    </Badge>
                  </div>
                  <Slider
                    defaultValue={[60]}
                    max={100}
                    step={1}
                    onValueChange={setConfidenceValue}
                    className="py-4"
                  />
                  <div className="w-full bg-gray-800 h-1.5 rounded-full mt-1 overflow-hidden">
                    <div 
                      className={`h-full bg-gradient-to-r ${confidenceGradient} rounded-full transition-all duration-300`}
                      style={{ width: `${confidenceValue[0]}%` }}
                    ></div>
                  </div>
                </motion.div>
                
                <motion.div variants={itemVariants} className="space-y-2">
                  <Label htmlFor="context" className="text-gray-300">Market Context (Optional)</Label>
                  <Textarea
                    id="context"
                    placeholder="Add any additional context about current market conditions..."
                    value={marketContext}
                    onChange={(e) => setMarketContext(e.target.value)}
                    rows={2}
                    className="resize-none bg-gray-800 border-gray-700 text-white placeholder:text-gray-500"
                  />
                </motion.div>
              </motion.div>
            </CardContent>
            
            <CardFooter className="pt-2 pb-6">
              <motion.div
                className="w-full"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                animate={isPending ? { scale: [1, 1.02, 1] } : {}}
                transition={isPending ? { 
                  duration: 1.5,
                  repeat: Infinity,
                  repeatType: "reverse"
                } : {}}
              >
                <Button 
                  onClick={() => generateTip()} 
                  disabled={isPending || (!symbol && !customSymbol)}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg shadow-rose-900/20 h-12"
                >
                  {isPending ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" /> 
                      <span className="text-base">Analyzing Market Data...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="mr-2 h-5 w-5" /> 
                      <span className="text-base">Generate Flash Tip</span>
                    </>
                  )}
                </Button>
              </motion.div>
            </CardFooter>
          </TabsContent>
          
          <TabsContent value="result" className="space-y-4 mt-0 p-0">
            <CardContent className="pt-6 pb-6">
              {tipData && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  className="rounded-lg overflow-hidden"
                >
                  <div className={`p-5 ${tipData.direction.toLowerCase() === 'buy' 
                    ? 'bg-gradient-to-br from-emerald-900/30 to-emerald-900/10 border-l-4 border-emerald-500' 
                    : 'bg-gradient-to-br from-rose-900/30 to-rose-900/10 border-l-4 border-rose-500'}`}
                  >
                    {/* Header */}
                    <motion.div 
                      className="flex items-center justify-between mb-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.2 }}
                    >
                      <div className="flex items-center gap-3">
                        <motion.div
                          animate={pulseAnimation}
                          className={`flex items-center justify-center h-12 w-12 rounded-full ${
                            tipData.direction.toLowerCase() === 'buy' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-rose-500/20 text-rose-400'
                          }`}
                        >
                          {tipData.direction.toLowerCase() === 'buy' 
                            ? <TrendingUp className="h-6 w-6" /> 
                            : <TrendingDown className="h-6 w-6" />
                          }
                        </motion.div>
                        
                        <div>
                          <h3 className="font-bold text-white text-lg flex items-center gap-2">
                            {symbol || customSymbol}
                            <span className={`text-xs px-2 py-1 rounded ${
                              tipData.direction.toLowerCase() === 'buy' 
                                ? 'bg-emerald-500/20 text-emerald-400' 
                                : 'bg-rose-500/20 text-rose-400'
                            }`}>
                              {timeframe}
                            </span>
                          </h3>
                          <motion.div 
                            className="flex items-center gap-2 mt-1"
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.4 }}
                          >
                            <Badge className={`${
                              tipData.direction.toLowerCase() === 'buy' 
                                ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
                                : 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                            }`}>
                              {tipData.direction.toUpperCase()}
                            </Badge>
                            <Badge className={`${
                              tipData.confidence >= 80 ? 'bg-green-500/20 text-green-400 border-green-500/30' : 
                              tipData.confidence >= 60 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 
                              tipData.confidence >= 40 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 
                              'bg-red-500/20 text-red-400 border-red-500/30'
                            }`}>
                              {tipData.confidence}% Confidence
                            </Badge>
                          </motion.div>
                        </div>
                      </div>
                    </motion.div>
                    
                    {/* Tip Content */}
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.6 }}
                    >
                      <div className="bg-gray-900/80 p-4 rounded-lg border border-gray-800 mb-4">
                        <p className="text-gray-200 leading-relaxed">{tipData.tip}</p>
                      </div>
                    </motion.div>
                    
                    {/* Key Levels */}
                    <motion.div
                      className="grid grid-cols-2 gap-3"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.8 }}
                    >
                      <div className="bg-emerald-900/20 border border-emerald-900/30 p-3 rounded-lg">
                        <h4 className="text-emerald-400 flex items-center gap-2 mb-1 font-medium">
                          <TrendingUp className="h-4 w-4" /> Support
                        </h4>
                        <p className="text-white text-lg font-mono">{tipData.key_levels.support}</p>
                      </div>
                      <div className="bg-rose-900/20 border border-rose-900/30 p-3 rounded-lg">
                        <h4 className="text-rose-400 flex items-center gap-2 mb-1 font-medium">
                          <TrendingDown className="h-4 w-4" /> Resistance
                        </h4>
                        <p className="text-white text-lg font-mono">{tipData.key_levels.resistance}</p>
                      </div>
                    </motion.div>
                    
                    {/* Actions */}
                    <motion.div 
                      className="flex justify-between items-center mt-5 gap-3"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 1 }}
                    >
                      <Button
                        variant="outline"
                        className="border-gray-700 hover:bg-gray-800 text-gray-300"
                        onClick={() => setActiveTab("generator")}
                      >
                        <RefreshCw className="mr-2 h-4 w-4" /> New Tip
                      </Button>
                      <div className="text-gray-400 text-sm flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        Generated just now
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}
            </CardContent>
          </TabsContent>
        </Tabs>
      </motion.div>
    </Card>
  );
}