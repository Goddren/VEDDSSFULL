import React from 'react';
import { AnimatedTooltip, MarketAnimation } from './animated-tooltip';
import { Badge } from './badge';
import { getDirectionColor } from '@/lib/utils';

// Market insight tooltip content types
export type InsightCategory = 
  | 'pattern'
  | 'indicator'
  | 'level'
  | 'strategy'
  | 'risk'
  | 'signal';

export interface MarketInsightProps {
  term: string;
  category: InsightCategory;
  animation: MarketAnimation;
  description: string;
  className?: string;
}

export function MarketInsight({
  term,
  category,
  animation,
  description,
  className
}: MarketInsightProps) {
  // Map category to appropriate styles and labels
  const getCategoryStyles = (): { color: string; label: string } => {
    switch (category) {
      case 'pattern':
        return { color: 'purple', label: 'Pattern' };
      case 'indicator':
        return { color: 'blue', label: 'Indicator' };
      case 'level':
        return { color: 'teal', label: 'Key Level' };
      case 'strategy':
        return { color: 'amber', label: 'Strategy' };
      case 'risk':
        return { color: 'red', label: 'Risk' };
      case 'signal':
        return { color: 'green', label: 'Signal' };
      default:
        return { color: 'slate', label: 'Insight' };
    }
  };

  const { color, label } = getCategoryStyles();
  const badgeVariant = color === 'slate' ? 'outline' : 'default';

  // Generate content for the tooltip
  const tooltipContent = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{term}</span>
        <Badge variant={badgeVariant} className={`bg-${color}-500/10 text-${color}-500 border-${color}-500/20`}>
          {label}
        </Badge>
      </div>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );

  return (
    <AnimatedTooltip
      content={tooltipContent}
      animation={animation}
      className={className}
    >
      <span className="border-b border-dotted border-primary/30 font-medium">
        {term}
      </span>
    </AnimatedTooltip>
  );
}

// Component for direction insight that uses the utils color function
export function DirectionInsight({
  direction,
  description,
  className
}: {
  direction: string;
  description: string;
  className?: string;
}) {
  const animation = direction.toLowerCase().includes('buy') || 
                   direction.toLowerCase().includes('bullish') 
                   ? 'bullish' : 'bearish';
  
  const tooltipContent = (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="font-medium">{direction}</span>
        <Badge variant="outline" className={getDirectionColor(direction)}>
          Direction
        </Badge>
      </div>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );

  return (
    <AnimatedTooltip
      content={tooltipContent}
      animation={animation}
      className={className}
    >
      <span className={`font-semibold ${getDirectionColor(direction)}`}>
        {direction}
      </span>
    </AnimatedTooltip>
  );
}