import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { 
  TrendingUp, 
  TrendingDown, 
  BarChart2, 
  ArrowRight, 
  ChevronsUp, 
  ChevronsDown, 
  AlertCircle,
  Info,
  Waves
} from "lucide-react";

export type InsightType = 
  | "bullish"
  | "bearish"
  | "neutral"
  | "volatility"
  | "pattern"
  | "support"
  | "resistance"
  | "volume"
  | "momentum";

export type MarketPattern =
  | "double-top"
  | "double-bottom"
  | "head-shoulders"
  | "inverse-head-shoulders"
  | "flag"
  | "triangle"
  | "wedge"
  | "channel"
  | "fibonacci";

interface InsightTooltipProps {
  type: InsightType;
  title: string;
  description: string;
  probability?: number; // 0-100
  pattern?: MarketPattern;
  timeframe?: string;
  className?: string;
  showAnimation?: boolean;
}

export function InsightTooltip({
  type,
  title,
  description,
  probability = 0,
  pattern,
  timeframe,
  className,
  showAnimation = true,
}: InsightTooltipProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { toast } = useToast();
  
  const getTypeIcon = () => {
    switch (type) {
      case "bullish":
        return <TrendingUp className="text-green-500" />;
      case "bearish":
        return <TrendingDown className="text-red-500" />;
      case "neutral":
        return <Waves className="text-blue-500" />;
      case "volatility":
        return <BarChart2 className="text-amber-500" />;
      case "pattern":
        return <BarChart2 className="text-purple-500" />;
      case "support":
        return <ChevronsUp className="text-emerald-500" />;
      case "resistance":
        return <ChevronsDown className="text-rose-500" />;
      case "volume":
        return <BarChart2 className="text-blue-500" />;
      case "momentum":
        return <ArrowRight className="text-amber-500" />;
      default:
        return <Info className="text-blue-500" />;
    }
  };
  
  const getBackgroundColor = () => {
    switch (type) {
      case "bullish":
        return "bg-gradient-to-r from-green-500/10 to-emerald-500/10";
      case "bearish":
        return "bg-gradient-to-r from-red-500/10 to-rose-500/10";
      case "neutral":
        return "bg-gradient-to-r from-blue-500/10 to-cyan-500/10";
      case "volatility":
        return "bg-gradient-to-r from-amber-500/10 to-yellow-500/10";
      case "pattern":
        return "bg-gradient-to-r from-purple-500/10 to-violet-500/10";
      case "support":
        return "bg-gradient-to-r from-emerald-500/10 to-teal-500/10";
      case "resistance":
        return "bg-gradient-to-r from-rose-500/10 to-pink-500/10";
      case "volume":
        return "bg-gradient-to-r from-blue-500/10 to-indigo-500/10";
      case "momentum":
        return "bg-gradient-to-r from-amber-500/10 to-orange-500/10";
      default:
        return "bg-gradient-to-r from-blue-500/10 to-indigo-500/10";
    }
  };
  
  const getBorderColor = () => {
    switch (type) {
      case "bullish":
        return "border-green-500/30";
      case "bearish":
        return "border-red-500/30";
      case "neutral":
        return "border-blue-500/30";
      case "volatility":
        return "border-amber-500/30";
      case "pattern":
        return "border-purple-500/30";
      case "support":
        return "border-emerald-500/30";
      case "resistance":
        return "border-rose-500/30";
      case "volume":
        return "border-blue-500/30";
      case "momentum":
        return "border-amber-500/30";
      default:
        return "border-blue-500/30";
    }
  };
  
  const getAnimation = () => {
    switch (type) {
      case "bullish":
        return (
          <motion.div 
            className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-green-500/20 to-transparent"
            initial={{ height: 0 }}
            animate={{ height: 20 }}
            transition={{ repeat: Infinity, repeatType: "reverse", duration: 1.5 }}
          />
        );
      case "bearish":
        return (
          <motion.div 
            className="absolute top-0 left-0 right-0 h-8 bg-gradient-to-b from-red-500/20 to-transparent"
            initial={{ height: 0 }}
            animate={{ height: 20 }}
            transition={{ repeat: Infinity, repeatType: "reverse", duration: 1.5 }}
          />
        );
      case "volatility":
        return (
          <motion.div
            className="absolute inset-0 flex justify-center items-center"
          >
            <motion.div
              className="h-3 w-3 rounded-full bg-amber-500"
              initial={{ scale: 0.8, opacity: 0.5 }}
              animate={{ scale: 1.5, opacity: 0 }}
              transition={{ repeat: Infinity, duration: 1.2 }}
            />
          </motion.div>
        );
      case "pattern":
        if (pattern === "double-top") {
          return (
            <svg 
              viewBox="0 0 100 30" 
              className="absolute bottom-2 left-2 w-16 h-8 opacity-40"
            >
              <motion.path
                d="M0,25 L20,5 L40,25 L60,5 L80,25 L100,25"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
              />
            </svg>
          );
        } else if (pattern === "head-shoulders") {
          return (
            <svg 
              viewBox="0 0 100 30" 
              className="absolute bottom-2 left-2 w-16 h-8 opacity-40"
            >
              <motion.path
                d="M0,20 L15,10 L30,20 L50,5 L70,20 L85,10 L100,20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 0.5 }}
              />
            </svg>
          );
        }
        return null;
      case "momentum":
        return (
          <motion.div 
            className="absolute right-2 bottom-2"
            initial={{ x: -10, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ repeat: Infinity, repeatType: "reverse", duration: 1, repeatDelay: 0.2 }}
          >
            <ArrowRight className="text-amber-500" />
          </motion.div>
        );
      default:
        return null;
    }
  };
  
  // Get probability color based on confidence level
  const getProbabilityColor = () => {
    if (probability >= 80) return "text-green-500";
    if (probability >= 60) return "text-blue-500";
    if (probability >= 40) return "text-amber-500";
    return "text-red-500";
  };
  
  const toggleExpand = () => {
    setIsExpanded(!isExpanded);
  };
  
  const shareInsight = () => {
    toast({
      title: "Insight saved",
      description: "This market insight has been saved to your analysis notes.",
    });
  };

  return (
    <motion.div
      className={cn(
        "relative overflow-hidden rounded-lg border p-3",
        getBackgroundColor(),
        getBorderColor(),
        "transition-all duration-200",
        isExpanded ? "max-w-md" : "max-w-sm",
        className
      )}
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ scale: 1.02 }}
      onClick={toggleExpand}
    >
      {showAnimation && getAnimation()}
      
      <div className="flex items-start space-x-3 z-10 relative">
        <div className="mt-0.5 bg-background bg-opacity-50 rounded-full p-1.5">
          {getTypeIcon()}
        </div>
        
        <div className="flex-1">
          <div className="flex justify-between items-start">
            <h3 className="font-semibold">{title}</h3>
            
            {probability > 0 && (
              <span className={cn("text-xs font-medium", getProbabilityColor())}>
                {probability}% 
              </span>
            )}
          </div>
          
          <AnimatePresence>
            {isExpanded ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-1 text-sm"
              >
                <p className="text-muted-foreground">{description}</p>
                
                {(timeframe || pattern) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {timeframe && (
                      <span className="inline-flex items-center px-2 py-1 text-xs rounded-md bg-background/50">
                        {timeframe}
                      </span>
                    )}
                    
                    {pattern && (
                      <span className="inline-flex items-center px-2 py-1 text-xs rounded-md bg-background/50">
                        {pattern.replace("-", " ")}
                      </span>
                    )}
                  </div>
                )}
                
                <div className="mt-3 flex justify-end space-x-2">
                  <motion.button
                    className="text-xs px-2 py-1 rounded-md hover:bg-background/80 text-muted-foreground"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      shareInsight();
                    }}
                  >
                    Save insight
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.p
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="mt-1 text-sm text-muted-foreground truncate"
              >
                {description}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}