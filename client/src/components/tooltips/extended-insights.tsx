import React from 'react';
import InsightTooltip from './insight-tooltip';

interface ExtendedInsightProps {
  title: string;
  description: string;
  iconSize?: 'sm' | 'md' | 'lg';
  children?: React.ReactNode;
}

export const BullishInsight: React.FC<ExtendedInsightProps> = ({ 
  title, 
  description, 
  iconSize = 'sm',
  children 
}) => {
  return (
    <InsightTooltip
      type="bullish"
      title={title}
      description={description}
      iconSize={iconSize}
    >
      {children || <span className="font-medium text-base hover:underline dotted">{title}</span>}
    </InsightTooltip>
  );
};

export const BearishInsight: React.FC<ExtendedInsightProps> = ({ 
  title, 
  description, 
  iconSize = 'sm',
  children 
}) => {
  return (
    <InsightTooltip
      type="bearish"
      title={title}
      description={description}
      iconSize={iconSize}
    >
      {children || <span className="font-medium text-base hover:underline dotted">{title}</span>}
    </InsightTooltip>
  );
};

export const VolatilityInsight: React.FC<ExtendedInsightProps> = ({ 
  title, 
  description, 
  iconSize = 'sm',
  children 
}) => {
  return (
    <InsightTooltip
      type="volatile"
      title={title}
      description={description}
      iconSize={iconSize}
    >
      {children || <span className="font-medium text-base hover:underline dotted">{title}</span>}
    </InsightTooltip>
  );
};

export const ConsolidationInsight: React.FC<ExtendedInsightProps> = ({ 
  title, 
  description, 
  iconSize = 'sm',
  children 
}) => {
  return (
    <InsightTooltip
      type="neutral"
      title={title}
      description={description}
      iconSize={iconSize}
    >
      {children || <span className="font-medium text-base hover:underline dotted">{title}</span>}
    </InsightTooltip>
  );
};

export default {
  BullishInsight,
  BearishInsight,
  VolatilityInsight,
  ConsolidationInsight
};