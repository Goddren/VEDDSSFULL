import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { TooltipIconSize, InsightTooltipType, InsightTooltipProps } from "./tooltip-types";
import { TriangleIcon, DollarSignIcon, ArrowDownIcon, ArrowUpIcon, LineChartIcon, ActivityIcon, TrendingUpIcon, TrendingDownIcon, ArrowRightIcon } from "lucide-react";

// Base insight tooltip component
export function InsightTooltip({
  type,
  title,
  description,
  iconSize = "md",
  className,
  children
}: {
  type: InsightTooltipType;
  title: string;
  description: string;
  iconSize?: TooltipIconSize;
  className?: string;
  children?: React.ReactNode;
}) {
  // Icon size classes
  const getIconSizeClass = () => {
    switch (iconSize) {
      case "sm": return "h-3 w-3";
      case "lg": return "h-5 w-5";
      case "md":
      default: return "h-4 w-4";
    }
  };

  // Animation and styling based on insight type
  const getTypeStyles = () => {
    switch (type) {
      case 'bullish':
        return "animate-rise border-green-500/20 bg-green-500/5 text-green-500";
      case 'bearish':
        return "animate-fall border-red-500/20 bg-red-500/5 text-red-500";
      case 'volatility':
        return "animate-pulse border-yellow-500/20 bg-yellow-500/5 text-yellow-500";
      case 'breakout':
        return "animate-bounce border-purple-500/20 bg-purple-500/5 text-purple-500";
      case 'consolidation':
      default:
        return "animate-pulse border-blue-500/20 bg-blue-500/5 text-blue-500";
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="cursor-help">{children}</span>
        </TooltipTrigger>
        <TooltipContent
          sideOffset={5}
          side="top"
          align="center"
          className={cn(
            "max-w-xs text-sm px-3 py-2 rounded-lg border shadow-md",
            getTypeStyles(),
            className
          )}
        >
          <div className="flex flex-col gap-1">
            <div className="font-medium">{title}</div>
            <div className="text-xs opacity-90">{description}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Bullish pattern tooltip
export function BullishInsight({ title, description, iconSize, className, children }: InsightTooltipProps) {
  return (
    <div className="inline-flex items-center">
      <InsightTooltip
        type="bullish"
        title={title}
        description={description}
        iconSize={iconSize}
        className={className}
      >
        {children ? children : (
          <div className="flex items-center text-green-500">
            <TrendingUpIcon className={iconSize === "sm" ? "h-3 w-3" : iconSize === "lg" ? "h-5 w-5" : "h-4 w-4"} />
          </div>
        )}
      </InsightTooltip>
    </div>
  );
}

// Bearish pattern tooltip
export function BearishInsight({ title, description, iconSize, className, children }: InsightTooltipProps) {
  return (
    <div className="inline-flex items-center">
      <InsightTooltip
        type="bearish"
        title={title}
        description={description}
        iconSize={iconSize}
        className={className}
      >
        {children ? children : (
          <div className="flex items-center text-red-500">
            <TrendingDownIcon className={iconSize === "sm" ? "h-3 w-3" : iconSize === "lg" ? "h-5 w-5" : "h-4 w-4"} />
          </div>
        )}
      </InsightTooltip>
    </div>
  );
}

// Volatility tooltip
export function VolatilityInsight({ title, description, iconSize, className, children }: InsightTooltipProps) {
  return (
    <div className="inline-flex items-center">
      <InsightTooltip
        type="volatility"
        title={title}
        description={description}
        iconSize={iconSize}
        className={className}
      >
        {children ? children : (
          <div className="flex items-center text-yellow-500">
            <ActivityIcon className={iconSize === "sm" ? "h-3 w-3" : iconSize === "lg" ? "h-5 w-5" : "h-4 w-4"} />
          </div>
        )}
      </InsightTooltip>
    </div>
  );
}

// Consolidation tooltip
export function ConsolidationInsight({ title, description, iconSize, className, children }: InsightTooltipProps) {
  return (
    <div className="inline-flex items-center">
      <InsightTooltip
        type="consolidation"
        title={title}
        description={description}
        iconSize={iconSize}
        className={className}
      >
        {children ? children : (
          <div className="flex items-center text-blue-500">
            <ArrowRightIcon className={iconSize === "sm" ? "h-3 w-3" : iconSize === "lg" ? "h-5 w-5" : "h-4 w-4"} />
          </div>
        )}
      </InsightTooltip>
    </div>
  );
}

// Breakout tooltip
export function BreakoutInsight({ title, description, iconSize, className, children }: InsightTooltipProps) {
  return (
    <div className="inline-flex items-center">
      <InsightTooltip
        type="breakout"
        title={title}
        description={description}
        iconSize={iconSize}
        className={className}
      >
        {children ? children : (
          <div className="flex items-center text-purple-500">
            <TriangleIcon className={iconSize === "sm" ? "h-3 w-3" : iconSize === "lg" ? "h-5 w-5" : "h-4 w-4"} />
          </div>
        )}
      </InsightTooltip>
    </div>
  );
}