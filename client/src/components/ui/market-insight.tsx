import React from "react";
import { InfoIcon, AlertCircle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { AnimatedTooltip, type MarketAnimation } from "@/components/ui/animated-tooltip";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type InsightType = 'info' | 'warning' | 'bullish' | 'bearish' | 'volatility';
type InsightCategory = 'risk' | 'pattern' | 'indicator' | 'level' | 'strategy';

interface MarketInsightProps {
  term: string;
  category: InsightCategory;
  description: string;
  animation?: MarketAnimation;
  className?: string;
}

interface DirectionInsightProps {
  direction: string;
  description: string;
  className?: string;
}

export function MarketInsight({ term, category, description, animation, className }: MarketInsightProps) {
  // Get icon and badge color based on category
  const getInsightDetails = () => {
    switch (category) {
      case 'risk':
        return {
          icon: <AlertCircle className="h-4 w-4 text-yellow-500" />,
          badgeColor: "bg-yellow-500/10 text-yellow-500",
          defaultAnimation: 'volatile' as MarketAnimation,
          label: "RISK"
        };
      case 'pattern':
        return {
          icon: <Activity className="h-4 w-4 text-blue-500" />,
          badgeColor: "bg-blue-500/10 text-blue-500",
          defaultAnimation: 'sideways' as MarketAnimation,
          label: "PATTERN"
        };
      case 'indicator':
        return {
          icon: <TrendingUp className="h-4 w-4 text-green-500" />,
          badgeColor: "bg-green-500/10 text-green-500",
          defaultAnimation: 'bullish' as MarketAnimation,
          label: "INDICATOR"
        };
      case 'level':
        return {
          icon: <TrendingDown className="h-4 w-4 text-purple-500" />,
          badgeColor: "bg-purple-500/10 text-purple-500", 
          defaultAnimation: 'resistance' as MarketAnimation,
          label: "LEVEL"
        };
      case 'strategy':
        return {
          icon: <InfoIcon className="h-4 w-4 text-red-500" />,
          badgeColor: "bg-red-500/10 text-red-500",
          defaultAnimation: 'bullish' as MarketAnimation,
          label: "STRATEGY"
        };
      default:
        return {
          icon: <InfoIcon className="h-4 w-4 text-blue-500" />,
          badgeColor: "bg-blue-500/10 text-blue-500",
          defaultAnimation: 'sideways' as MarketAnimation,
          label: "INFO"
        };
    }
  };

  const { icon, badgeColor, defaultAnimation, label } = getInsightDetails();
  const finalAnimation = animation || defaultAnimation;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-medium text-sm">{term}</span>
      <AnimatedTooltip
        content={
          <div className="space-y-2">
            <p>{description}</p>
          </div>
        }
        animation={finalAnimation}
      >
        <Badge 
          variant="outline"
          className={cn("text-xs px-1.5 py-0 h-5", badgeColor)}
        >
          {label}
        </Badge>
      </AnimatedTooltip>
    </div>
  );
}

// Direction insight specifically for buy/sell signals
export function DirectionInsight({ direction, description, className }: DirectionInsightProps) {
  const isBuy = direction.toLowerCase().includes('buy');
  const animation = isBuy ? 'bullish' : 'bearish';
  const badgeColor = isBuy ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500";
  const label = isBuy ? "BUY" : "SELL";
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <AnimatedTooltip
        content={
          <div className="space-y-2">
            <p>{description}</p>
          </div>
        }
        animation={animation}
      >
        <Badge 
          variant="outline"
          className={cn("text-xs px-2 py-0.5 h-6", badgeColor)}
        >
          {label}
        </Badge>
      </AnimatedTooltip>
    </div>
  );
}

// A collection of insights to be displayed together
export function MarketInsightGroup({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("space-y-2", className)}>
      {children}
    </div>
  );
}