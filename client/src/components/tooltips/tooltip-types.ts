// Tooltip types and interfaces

// Size options for tooltip icons
export type TooltipIconSize = 'sm' | 'md' | 'lg';

// Types of tooltips for insight messaging
export type InsightTooltipType = 
  | 'bullish' 
  | 'bearish' 
  | 'volatility' 
  | 'consolidation' 
  | 'breakout';

// Common props for all insight tooltips
export interface InsightTooltipProps {
  title: string;
  description: string;
  iconSize?: TooltipIconSize;
  className?: string;
  children?: React.ReactNode;
}