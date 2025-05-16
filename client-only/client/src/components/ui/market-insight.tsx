import React from "react";
import { InfoIcon, AlertCircle, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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

  // Create a simple insight tooltip
  const SimpleTooltip = ({ title, description, children }: { title: string, description: string, children: React.ReactNode }) => {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1 cursor-help">
              {children}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs bg-[#181818] border-[#333333]">
            <div className="flex flex-col gap-1">
              <h4 className="font-medium">{title}</h4>
              <p className="text-xs text-gray-400">{description}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-medium text-sm">{term}</span>
      <SimpleTooltip
        title={term}
        description={description}
      >
        <Badge 
          variant="outline"
          className={cn("text-xs px-1.5 py-0 h-5", badgeColor)}
        >
          {label}
        </Badge>
      </SimpleTooltip>
    </div>
  );
}

// Direction insight specifically for buy/sell signals
export function DirectionInsight({ direction, description, className }: DirectionInsightProps) {
  const isBuy = direction.toLowerCase().includes('buy');
  const badgeColor = isBuy ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500";
  const label = isBuy ? "BUY" : "SELL";
  
  // Simple tooltip component
  const DirectionTooltip = ({ title, description, children }: { title: string, description: string, children: React.ReactNode }) => {
    return (
      <TooltipProvider>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <div className="inline-flex items-center gap-1 cursor-help">
              {children}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-xs bg-[#181818] border-[#333333]">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <h4 className="font-medium">{title}</h4>
                {isBuy ? 
                  <TrendingUp size={16} className="text-green-500" /> : 
                  <TrendingDown size={16} className="text-red-500" />
                }
              </div>
              <p className="text-xs text-gray-400">{description}</p>
            </div>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };
  
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <DirectionTooltip
        title={`${direction} Signal`}
        description={description}
      >
        <Badge 
          variant="outline"
          className={cn("text-xs px-2 py-0.5 h-6", badgeColor)}
        >
          {label}
        </Badge>
      </DirectionTooltip>
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