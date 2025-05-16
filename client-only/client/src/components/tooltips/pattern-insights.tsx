import React from 'react';
import { PatternInsightProps, PatternDescriptionMap } from './tooltip-types';
import InsightTooltip from './insight-tooltip';

// Dictionary of patterns and their descriptions
const patternDescriptions: PatternDescriptionMap = {
  'Head and Shoulders': {
    description: 'A reversal pattern with three peaks where the middle peak (head) is higher than the two surrounding peaks (shoulders). Signals a trend reversal from bullish to bearish.',
    visual: 'Forms a distinctive pattern that resembles a head with two shoulders.',
    class: 'bearish'
  },
  'Inverse Head and Shoulders': {
    description: 'A reversal pattern with three troughs where the middle trough (head) is lower than the two surrounding troughs (shoulders). Signals a trend reversal from bearish to bullish.',
    visual: 'Forms an upside-down head and shoulders pattern.',
    class: 'bullish'
  },
  'Double Top': {
    description: 'A reversal pattern forming two consecutive peaks at approximately the same price level. Indicates a potential reversal from bullish to bearish.',
    visual: 'Creates an "M" shape on the chart.',
    class: 'bearish'
  },
  'Double Bottom': {
    description: 'A reversal pattern forming two consecutive troughs at approximately the same price level. Indicates a potential reversal from bearish to bullish.',
    visual: 'Creates a "W" shape on the chart.',
    class: 'bullish'
  },
  'Triple Top': {
    description: 'A reversal pattern that forms three peaks at approximately the same price level. Indicates strong resistance and a potential reversal from bullish to bearish.',
    visual: 'Forms three consecutive peaks of similar height.',
    class: 'bearish'
  },
  'Triple Bottom': {
    description: 'A reversal pattern that forms three troughs at approximately the same price level. Indicates strong support and a potential reversal from bearish to bullish.',
    visual: 'Forms three consecutive troughs of similar depth.',
    class: 'bullish'
  },
  'Ascending Triangle': {
    description: 'A continuation pattern with a flat top resistance line and an upward-sloping bottom support line. Usually signals a bullish breakout.',
    visual: 'Forms a triangle with a flat upper line and an ascending lower line.',
    class: 'bullish'
  },
  'Descending Triangle': {
    description: 'A continuation pattern with a flat bottom support line and a downward-sloping top resistance line. Usually signals a bearish breakdown.',
    visual: 'Forms a triangle with a flat lower line and a descending upper line.',
    class: 'bearish'
  },
  'Symmetrical Triangle': {
    description: 'A continuation pattern formed by converging trendlines of support and resistance. The breakout direction indicates the next likely trend direction.',
    visual: 'Forms a triangle with converging upper and lower lines.',
    class: 'neutral'
  },
  'Rising Wedge': {
    description: 'A reversal pattern formed by converging rising support and resistance lines. Despite its upward movement, it usually signals a bearish reversal.',
    visual: 'Forms a narrowing ascending channel with converging boundary lines.',
    class: 'bearish'
  },
  'Falling Wedge': {
    description: 'A reversal pattern formed by converging falling support and resistance lines. Despite its downward movement, it usually signals a bullish reversal.',
    visual: 'Forms a narrowing descending channel with converging boundary lines.',
    class: 'bullish'
  },
  'Bull Flag': {
    description: 'A continuation pattern that forms after a strong upward movement, followed by a consolidation phase. Signals a likely continuation of the bullish trend.',
    visual: 'Consists of a flagpole (strong uptrend) followed by a parallel channel (flag).',
    class: 'bullish'
  },
  'Bear Flag': {
    description: 'A continuation pattern that forms after a strong downward movement, followed by a consolidation phase. Signals a likely continuation of the bearish trend.',
    visual: 'Consists of a flagpole (strong downtrend) followed by a parallel channel (flag).',
    class: 'bearish'
  },
};

export const PatternInsight: React.FC<PatternInsightProps> = ({ pattern, iconSize = 'sm' }) => {
  const patternInfo = patternDescriptions[pattern] || {
    description: `${pattern} pattern identified in the chart.`,
    visual: 'Pattern visualization not available.',
    class: 'neutral'
  };

  return (
    <InsightTooltip
      type={patternInfo.class as 'bullish' | 'bearish' | 'neutral' | 'volatile'}
      title={pattern}
      description={`${patternInfo.description} ${patternInfo.visual}`}
      iconSize={iconSize}
    >
      <span className="font-medium text-base hover:underline dotted">{pattern}</span>
    </InsightTooltip>
  );
};

export default PatternInsight;