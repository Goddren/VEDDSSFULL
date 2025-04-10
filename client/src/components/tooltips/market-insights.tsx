import React from 'react';
import { MarketTrendInsightProps } from './tooltip-types';
import InsightTooltip from './insight-tooltip';

export const MarketTrendInsight: React.FC<MarketTrendInsightProps> = ({ trend, iconSize = 'sm' }) => {
  const isBullish = trend.toLowerCase().includes('bullish');
  const isBearish = trend.toLowerCase().includes('bearish');
  const isNeutral = !isBullish && !isBearish;
  
  let description = '';
  if (isBullish) {
    description = 'A bullish trend indicates upward price momentum. Look for buying opportunities or hold existing long positions.';
  } else if (isBearish) {
    description = 'A bearish trend indicates downward price momentum. Consider short positions or avoiding long entries.';
  } else {
    description = 'A neutral or sideways trend indicates consolidation. Price is moving without clear direction - wait for breakout confirmation.';
  }

  return (
    <InsightTooltip
      type={isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral'}
      title={`${trend} Trend`}
      description={description}
      iconSize={iconSize}
    >
      <span className="rounded-full w-4 h-4 inline-block bg-gradient-to-r from-blue-500 to-violet-500"></span>
    </InsightTooltip>
  );
};

export const ConfidenceInsight: React.FC<{ level: string; iconSize?: 'sm' | 'md' | 'lg' }> = ({ level, iconSize = 'sm' }) => {
  const confidence = level.toLowerCase();
  let description = '';
  let type: 'bullish' | 'bearish' | 'neutral' | 'volatile' = 'neutral';
  
  if (confidence === 'high') {
    description = 'High confidence signals are supported by multiple indicators and chart patterns, suggesting strong probability of the predicted outcome.';
    type = 'bullish';
  } else if (confidence === 'medium') {
    description = 'Medium confidence signals have reasonable supporting evidence but may have some conflicting indicators.';
    type = 'neutral';
  } else {
    description = 'Low confidence signals have limited supporting evidence or significant conflicting indicators. Exercise caution.';
    type = 'bearish';
  }

  return (
    <InsightTooltip
      type={type}
      title={`${level} Confidence`}
      description={description}
      iconSize={iconSize}
    >
      <span className="rounded-full w-4 h-4 inline-block bg-gradient-to-r from-yellow-500 to-orange-500"></span>
    </InsightTooltip>
  );
};

export const DirectionInsight: React.FC<{ direction: string; description?: string }> = ({ direction, description }) => {
  const isBuy = direction.toLowerCase().includes('buy');

  return (
    <div className={`px-3 py-1 rounded-md ${isBuy ? 'bg-green-500/20 text-green-500' : 'bg-red-500/20 text-red-500'} font-medium text-sm flex items-center`}>
      <i className={`fas fa-arrow-${isBuy ? 'up' : 'down'} mr-1.5`}></i>
      <InsightTooltip
        type={isBuy ? 'bullish' : 'bearish'}
        title={direction}
        description={description || `${direction} signal based on technical analysis of price action, indicators, and patterns.`}
      >
        <span>{direction}</span>
      </InsightTooltip>
    </div>
  );
};

export default {
  MarketTrendInsight,
  ConfidenceInsight,
  DirectionInsight
};