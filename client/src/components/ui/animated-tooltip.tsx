import React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

// Market-specific animations
export type MarketAnimation = 
  | 'bullish' 
  | 'bearish' 
  | 'volatile' 
  | 'sideways'
  | 'resistance'
  | 'support';

interface AnimatedTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  animation?: MarketAnimation;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
}

export function AnimatedTooltip({
  content,
  children,
  animation,
  className,
  side = "top",
  align = "center",
}: AnimatedTooltipProps) {
  // Animation classes based on market condition
  const getAnimationClass = () => {
    switch (animation) {
      case 'bullish':
        return "animate-rise text-green-500";
      case 'bearish':
        return "animate-fall text-red-500";
      case 'volatile':
        return "animate-shake text-yellow-500";
      case 'sideways':
        return "animate-pulse text-blue-500";
      case 'resistance':
        return "animate-bounce text-purple-500";
      case 'support':
        return "animate-pulse text-indigo-500";
      default:
        return "";
    }
  };

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className="cursor-help">{children}</span>
        </TooltipTrigger>
        <TooltipContent
          side={side}
          align={align}
          className={cn(
            "max-w-xs text-sm px-3 py-2 bg-card border border-border shadow-lg",
            getAnimationClass(),
            className
          )}
        >
          <div>{content}</div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}