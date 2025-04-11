import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InsightTooltip, type InsightType, type MarketPattern } from "@/components/ui/insight-tooltip";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight, RefreshCw, Sparkles, Info } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ChartInsight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  probability: number;
  pattern?: MarketPattern;
  timeframe?: string;
}

interface ChartInsightsPanelProps {
  symbol?: string;
  timeframe?: string;
  direction?: string;
  pattern?: string;
  entryPoint?: string;
  exitPoint?: string;
  className?: string;
}

export function ChartInsightsPanel({
  symbol = "Unknown",
  timeframe = "Unknown",
  direction = "neutral",
  pattern,
  entryPoint,
  exitPoint,
  className
}: ChartInsightsPanelProps) {
  const [insights, setInsights] = useState<ChartInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeInsightIndex, setActiveInsightIndex] = useState(0);
  const { toast } = useToast();

  // Generate relevant insights based on chart data
  const generateInsights = () => {
    setLoading(true);
    
    // Simulate API call delay
    setTimeout(() => {
      const directionType = direction?.toLowerCase().includes('buy') || 
                           direction?.toLowerCase().includes('bullish') ? 
                           'bullish' : 
                           direction?.toLowerCase().includes('sell') || 
                           direction?.toLowerCase().includes('bearish') ? 
                           'bearish' : 'neutral';
      
      let patternType: MarketPattern | undefined;
      if (pattern) {
        if (pattern.toLowerCase().includes('double top')) patternType = 'double-top';
        else if (pattern.toLowerCase().includes('double bottom')) patternType = 'double-bottom';
        else if (pattern.toLowerCase().includes('head') && pattern.toLowerCase().includes('shoulder')) {
          patternType = pattern.toLowerCase().includes('inverse') ? 'inverse-head-shoulders' : 'head-shoulders';
        }
        else if (pattern.toLowerCase().includes('triangle')) patternType = 'triangle';
        else if (pattern.toLowerCase().includes('flag')) patternType = 'flag';
        else if (pattern.toLowerCase().includes('wedge')) patternType = 'wedge';
        else if (pattern.toLowerCase().includes('channel')) patternType = 'channel';
      }
      
      const generatedInsights: ChartInsight[] = [];
      
      // Add direction insight
      generatedInsights.push({
        id: 'direction-insight',
        type: directionType as InsightType,
        title: `${directionType.charAt(0).toUpperCase() + directionType.slice(1)} Market Detected`,
        description: directionType === 'bullish' ? 
          `Current market conditions for ${symbol} show bullish momentum. Consider looking for buying opportunities with proper risk management.` :
          directionType === 'bearish' ?
          `Current market conditions for ${symbol} show bearish momentum. Consider looking for selling opportunities or wait for a trend reversal.` :
          `Market is showing neutral patterns for ${symbol}. Wait for clearer directional signals before entering positions.`,
        probability: directionType === 'neutral' ? 65 : 85,
        timeframe: timeframe
      });
      
      // Add pattern insight if available
      if (patternType) {
        generatedInsights.push({
          id: 'pattern-insight',
          type: 'pattern',
          title: `${pattern} Pattern Identified`,
          description: `A ${pattern} pattern has been detected on the ${timeframe} chart. This suggests a potential ${directionType} continuation. Typical targets for this pattern are approximately ${exitPoint || 'pending calculation'}.`,
          probability: 78,
          pattern: patternType,
          timeframe: timeframe
        });
      }
      
      // Add support/resistance insight
      generatedInsights.push({
        id: 'level-insight',
        type: directionType === 'bullish' ? 'resistance' : 'support',
        title: directionType === 'bullish' ? 'Key Resistance Level' : 'Key Support Level',
        description: directionType === 'bullish' ?
          `There's a key resistance level near ${exitPoint || 'the identified exit point'}. Watch for price action around this level for possible breakout or rejection signals.` :
          `There's a key support level near ${entryPoint || 'the identified entry point'}. Monitor price action around this level for potential bounce or breakdown signals.`,
        probability: 82,
        timeframe: timeframe
      });
      
      // Add volatility insight
      generatedInsights.push({
        id: 'volatility-insight',
        type: 'volatility',
        title: 'Volatility Analysis',
        description: `Current volatility levels for ${symbol} are ${Math.random() > 0.5 ? 'moderate' : 'high'}. ${Math.random() > 0.5 ? 'Consider widening stop loss levels to account for potential swings.' : 'Short-term traders might benefit from the increased movement.'}`,
        probability: 73,
        timeframe: timeframe
      });
      
      setInsights(generatedInsights);
      setLoading(false);
    }, 800);
  };
  
  // Generate insights on initial load and when chart data changes
  useEffect(() => {
    if (symbol && timeframe) {
      generateInsights();
    }
  }, [symbol, timeframe, direction, pattern]);
  
  // Handle navigation between insights
  const nextInsight = () => {
    setActiveInsightIndex(prev => (prev + 1) % insights.length);
  };
  
  const prevInsight = () => {
    setActiveInsightIndex(prev => (prev - 1 + insights.length) % insights.length);
  };
  
  const refreshInsights = () => {
    generateInsights();
    toast({
      title: "Insights refreshed",
      description: "Updated market analysis based on current chart data.",
    });
  };
  
  return (
    <Card className={cn("overflow-hidden border-gray-800 bg-gray-900", className)}>
      <CardHeader className="border-b border-gray-800 bg-gradient-to-r from-gray-900 to-indigo-950 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg text-white flex items-center">
            <Sparkles className="mr-2 h-4 w-4 text-indigo-400" />
            AI Market Insights
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm" 
            className="h-8 w-8 p-0 text-gray-400 hover:text-white"
            onClick={refreshInsights}
            disabled={loading}
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="p-3">
        {insights.length > 0 ? (
          <div className="relative min-h-[180px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeInsightIndex}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                transition={{ duration: 0.2 }}
                className="pb-10"
              >
                <InsightTooltip
                  type={insights[activeInsightIndex].type}
                  title={insights[activeInsightIndex].title}
                  description={insights[activeInsightIndex].description}
                  probability={insights[activeInsightIndex].probability}
                  pattern={insights[activeInsightIndex].pattern}
                  timeframe={insights[activeInsightIndex].timeframe}
                  className="w-full cursor-pointer shadow-lg"
                />
              </motion.div>
            </AnimatePresence>
            
            {insights.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between py-1 px-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 w-7 p-0 rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-indigo-900" 
                  onClick={prevInsight}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                
                <div className="text-xs text-gray-400">
                  {activeInsightIndex + 1} / {insights.length}
                </div>
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-7 w-7 p-0 rounded-full bg-gray-800 text-gray-400 hover:text-white hover:bg-indigo-900" 
                  onClick={nextInsight}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-6 text-gray-400">
            <Info className="h-10 w-10 mb-2 text-gray-600" />
            <p className="text-sm">No insights available</p>
            <Button 
              variant="outline" 
              size="sm" 
              className="mt-3" 
              onClick={generateInsights} 
              disabled={loading}
            >
              {loading ? (
                <>
                  <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                  Loading...
                </>
              ) : (
                "Generate Insights"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}