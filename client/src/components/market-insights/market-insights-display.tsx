import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { InsightTooltip, type InsightType, type MarketPattern } from "@/components/ui/insight-tooltip";
import { cn } from "@/lib/utils";
import { ChevronRight, RefreshCw, ChevronsRight, Lightbulb, Sparkles } from "lucide-react";

interface InsightData {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  probability?: number; 
  pattern?: MarketPattern;
  timeframe?: string;
}

const MARKET_INSIGHTS: Record<string, InsightData[]> = {
  patterns: [
    {
      id: "pattern-1",
      type: "pattern",
      title: "Potential Double Top Detected",
      description: "A double top pattern has formed, suggesting a potential reversal of the current uptrend. Consider setting stop-loss orders below the neckline.",
      probability: 85,
      pattern: "double-top",
      timeframe: "4H"
    },
    {
      id: "pattern-2",
      type: "pattern",
      title: "Head and Shoulders Formation",
      description: "A possible head and shoulders pattern is forming on the 1H chart, which could indicate a bearish reversal if the neckline is broken.",
      probability: 72,
      pattern: "head-shoulders",
      timeframe: "1H"
    },
    {
      id: "pattern-3",
      type: "pattern",
      title: "Ascending Triangle Identified",
      description: "An ascending triangle pattern has been detected, suggesting a potential bullish continuation if price breaks above resistance.",
      probability: 78,
      pattern: "triangle",
      timeframe: "Daily"
    },
  ],
  trends: [
    {
      id: "trend-1",
      type: "bullish",
      title: "Strong Uptrend Continuation",
      description: "Price is making higher highs and higher lows, confirming the strength of the current uptrend. Consider buying on pullbacks to support.",
      probability: 88,
      timeframe: "4H"
    },
    {
      id: "trend-2",
      type: "bearish",
      title: "Market Sentiment Shifting Bearish",
      description: "Multiple technical indicators suggest a shift to bearish sentiment. Larger timeframes show declining buying pressure.",
      probability: 76,
      timeframe: "Daily"
    },
    {
      id: "trend-3",
      type: "neutral",
      title: "Consolidation Phase",
      description: "Price is trading in a range, suggesting a period of consolidation. Wait for a breakout before establishing new positions.",
      probability: 82,
      timeframe: "1H"
    }
  ],
  levels: [
    {
      id: "level-1",
      type: "support",
      title: "Key Support Level",
      description: "Price is approaching a major support level that has held multiple times. Watch for reversal signals near this level.",
      probability: 91,
      timeframe: "4H"
    },
    {
      id: "level-2",
      type: "resistance",
      title: "Strong Resistance Zone",
      description: "Multiple resistance factors converge around the current price, including historical resistance, Fibonacci level, and round number.",
      probability: 84,
      timeframe: "Daily"
    },
    {
      id: "level-3",
      type: "support",
      title: "Fibonacci Support Cluster",
      description: "Multiple Fibonacci retracement levels creating a support cluster, watch for potential bounce.",
      probability: 77,
      timeframe: "4H"
    }
  ],
  indicators: [
    {
      id: "indicator-1",
      type: "momentum",
      title: "RSI Divergence Alert",
      description: "Bearish divergence detected between price and RSI indicator, suggesting potential trend weakening and reversal.",
      probability: 82,
      timeframe: "4H"
    },
    {
      id: "indicator-2",
      type: "volume",
      title: "Volume Surge Detected",
      description: "Significant volume increase with price action, confirming the strength of the current move.",
      probability: 88,
      timeframe: "1H"
    },
    {
      id: "indicator-3",
      type: "volatility",
      title: "Volatility Expansion",
      description: "Bollinger Bands widening, indicating increasing volatility. Prepare for larger price movements.",
      probability: 79,
      timeframe: "4H"
    }
  ]
};

type InsightCategory = "patterns" | "trends" | "levels" | "indicators";

export function MarketInsightsDisplay() {
  const [activeTab, setActiveTab] = useState<InsightCategory>("patterns");
  const [visibleInsights, setVisibleInsights] = useState<InsightData[]>(
    MARKET_INSIGHTS.patterns.slice(0, 1)
  );
  const [isLoading, setIsLoading] = useState(false);
  
  const loadMoreInsights = () => {
    setIsLoading(true);
    
    // Simulate API delay
    setTimeout(() => {
      const currentInsights = MARKET_INSIGHTS[activeTab];
      const currentCount = visibleInsights.length;
      const nextInsight = currentInsights[currentCount % currentInsights.length];
      
      if (nextInsight) {
        setVisibleInsights(prev => [...prev, {...nextInsight, id: `${nextInsight.id}-${Date.now()}`}]);
      }
      
      setIsLoading(false);
    }, 600);
  };
  
  const refreshInsights = () => {
    setIsLoading(true);
    
    // Simulate API delay
    setTimeout(() => {
      setVisibleInsights(MARKET_INSIGHTS[activeTab].slice(0, 1));
      setIsLoading(false);
    }, 600);
  };
  
  const handleTabChange = (value: string) => {
    setActiveTab(value as InsightCategory);
    setVisibleInsights(MARKET_INSIGHTS[value as InsightCategory].slice(0, 1));
  };

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-lg overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-gray-900 to-gray-800 text-white">
        <div className="flex items-center">
          <Sparkles className="h-5 w-5 mr-2 text-yellow-400" />
          <CardTitle>Interactive Market Insights</CardTitle>
        </div>
        <CardDescription className="text-gray-300">
          AI-powered analysis and contextual market insights
        </CardDescription>
      </CardHeader>
      
      <div className="overflow-hidden">
        <Tabs 
          defaultValue="patterns" 
          value={activeTab} 
          onValueChange={handleTabChange}
          className="w-full"
        >
          <div className="px-4 pt-2">
            <TabsList className="w-full grid grid-cols-4">
              <TabsTrigger value="patterns" className="text-xs sm:text-sm">Patterns</TabsTrigger>
              <TabsTrigger value="trends" className="text-xs sm:text-sm">Trends</TabsTrigger>
              <TabsTrigger value="levels" className="text-xs sm:text-sm">Key Levels</TabsTrigger>
              <TabsTrigger value="indicators" className="text-xs sm:text-sm">Indicators</TabsTrigger>
            </TabsList>
          </div>
          
          <CardContent className="p-4">
            <div className="space-y-4 min-h-[400px]">
              <AnimatePresence mode="popLayout">
                {visibleInsights.map((insight, index) => (
                  <motion.div
                    key={insight.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.3 }}
                    className="relative"
                  >
                    <InsightTooltip
                      type={insight.type}
                      title={insight.title}
                      description={insight.description}
                      probability={insight.probability}
                      pattern={insight.pattern}
                      timeframe={insight.timeframe}
                      className={cn(
                        "w-full cursor-pointer",
                        index === 0 && "border-2"
                      )}
                    />
                    
                    {index === 0 && (
                      <motion.div 
                        className="absolute -right-1 -top-1 bg-primary text-primary-foreground rounded-full p-1"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.3 }}
                      >
                        <Lightbulb className="h-3.5 w-3.5" />
                      </motion.div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              <div className="flex justify-center pt-4 space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshInsights}
                  disabled={isLoading}
                >
                  <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                  Reset
                </Button>
                
                <Button
                  onClick={loadMoreInsights}
                  disabled={isLoading || visibleInsights.length >= 3}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600"
                  size="sm"
                >
                  {isLoading ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ChevronRight className="h-4 w-4 mr-2" />
                  )}
                  Generate Insight
                </Button>
              </div>
              
              <div className="text-center mt-2">
                <p className="text-xs text-muted-foreground flex items-center justify-center">
                  <ChevronsRight className="h-3 w-3 mr-1" />
                  Click on insights to expand details
                </p>
              </div>
            </div>
          </CardContent>
        </Tabs>
      </div>
    </Card>
  );
}