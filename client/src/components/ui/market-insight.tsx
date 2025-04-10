import React from "react";
import { InfoIcon, AlertCircle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { 
  MarketTrendInsight, 
  ConfidenceInsight,
  PatternInsight,
  IndicatorInsight,
  InsightTooltip,
  BullishInsight,
  BearishInsight,
  VolatilityInsight,
  ConsolidationInsight 
} from "@/components/tooltips";

type InsightCategory = 'risk' | 'pattern' | 'indicator' | 'level' | 'strategy';

interface MarketInsightProps {
  term: string;
  category: InsightCategory;
  description: string;
  animation?: 'bullish' | 'bearish' | 'volatile' | 'sideways' | 'resistance' | 'support';
  className?: string;
}

interface DirectionInsightProps {
  direction: string;
  description: string;
  className?: string;
}

export function MarketInsight({ term, category, description, animation, className }: MarketInsightProps) {
  function getTooltipType() {
    if (animation === 'bullish') return 'bullish' as const;
    if (animation === 'bearish') return 'bearish' as const;
    if (animation === 'volatile' || animation === 'sideways') return 'volatility' as const;
    if (animation === 'support' || animation === 'resistance') return 'consolidation' as const;
    
    // Default based on category
    switch (category) {
      case 'risk': return 'volatility' as const;
      case 'pattern': return 'consolidation' as const;
      case 'indicator': return 'volatility' as const;
      case 'level': return 'consolidation' as const;
      case 'strategy': return 'consolidation' as const;
      default: return 'volatility' as const;
    }
  }

  function getBadgeDetails() {
    switch (category) {
      case 'risk':
        return {
          badgeColor: "bg-yellow-500/10 text-yellow-500",
          label: 'RISK'
        };
      case 'pattern':
        return {
          badgeColor: "bg-blue-500/10 text-blue-500",
          label: 'PATTERN'
        };
      case 'indicator':
        return {
          badgeColor: "bg-purple-500/10 text-purple-500",
          label: 'INDICATOR'
        };
      case 'level':
        return {
          badgeColor: "bg-indigo-500/10 text-indigo-500",
          label: 'LEVEL'
        };
      case 'strategy':
        return {
          badgeColor: "bg-green-500/10 text-green-500",
          label: 'STRATEGY'
        };
      default:
        return {
          badgeColor: "bg-gray-500/10 text-gray-500",
          label: 'INFO'
        };
    }
  }

  const { badgeColor, label } = getBadgeDetails();
  const tooltipType = getTooltipType();

  // Handle special cases based on category
  if (category === 'pattern') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="font-medium text-sm">{term}</span>
        <PatternInsight pattern={term} iconSize="sm">
          <Badge 
            variant="outline"
            className={cn("text-xs px-1.5 py-0 h-5", badgeColor)}
          >
            {label}
          </Badge>
        </PatternInsight>
      </div>
    );
  }

  if (category === 'indicator') {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <span className="font-medium text-sm">{term}</span>
        <IndicatorInsight 
          indicator={term} 
          signal={animation === 'bullish' ? 'bullish' : animation === 'bearish' ? 'bearish' : 'neutral'}
          iconSize="sm"
        >
          <Badge 
            variant="outline"
            className={cn("text-xs px-1.5 py-0 h-5", badgeColor)}
          >
            {label}
          </Badge>
        </IndicatorInsight>
      </div>
    );
  }

  // For other categories, use the generic insight tooltip
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-medium text-sm">{term}</span>
      <InsightTooltip
        type={tooltipType}
        title={term}
        description={description}
        iconSize="sm"
      >
        <Badge 
          variant="outline"
          className={cn("text-xs px-1.5 py-0 h-5", badgeColor)}
        >
          {label}
        </Badge>
      </InsightTooltip>
    </div>
  );
}

// Direction insight specifically for buy/sell signals
export function DirectionInsight({ direction, description, className }: DirectionInsightProps) {
  const isBuy = direction.toLowerCase().includes('buy');
  const badgeColor = isBuy ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500";
  const label = isBuy ? "BUY" : "SELL";
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {isBuy ? (
        <BullishInsight
          title={`${direction} Signal`}
          description={description}
          iconSize="sm"
        >
          <Badge 
            variant="outline"
            className={cn("text-xs px-2 py-0.5 h-6", badgeColor)}
          >
            {label}
          </Badge>
        </BullishInsight>
      ) : (
        <BearishInsight
          title={`${direction} Signal`}
          description={description}
          iconSize="sm"
        >
          <Badge 
            variant="outline"
            className={cn("text-xs px-2 py-0.5 h-6", badgeColor)}
          >
            {label}
          </Badge>
        </BearishInsight>
      )}
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