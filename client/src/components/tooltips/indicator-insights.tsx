import React from 'react';
import { IndicatorInsightProps, IndicatorDescriptionMap } from './tooltip-types';
import InsightTooltip from './insight-tooltip';

// Dictionary of indicators and their descriptions
const indicatorDescriptions: IndicatorDescriptionMap = {
  'RSI': {
    description: 'Relative Strength Index (RSI) measures the speed and change of price movements. It oscillates between 0 and 100.',
    interpretation: 'Readings over 70 indicate overbought conditions, while readings below 30 suggest oversold conditions.',
    class: 'neutral'
  },
  'MACD': {
    description: 'Moving Average Convergence Divergence (MACD) shows the relationship between two moving averages of a security price.',
    interpretation: 'MACD crossing above the signal line is bullish, while crossing below is bearish. Divergence with price can signal reversals.',
    class: 'neutral'
  },
  'Bollinger Bands': {
    description: 'Bollinger Bands consist of a middle band (SMA) with two outer bands that expand and contract based on volatility.',
    interpretation: 'Price touching the upper band can indicate overbought conditions, while touching the lower band may indicate oversold conditions.',
    class: 'neutral'
  },
  'Stochastic': {
    description: 'Stochastic Oscillator shows the location of the current close relative to the high/low range over a set number of periods.',
    interpretation: 'Readings over 80 indicate overbought conditions, while readings below 20 suggest oversold conditions.',
    class: 'neutral'
  },
  'Moving Average': {
    description: 'Moving Average smooths out price data to create a single flowing line, making it easier to identify trends.',
    interpretation: 'Price above MA suggests bullish trend, while price below MA suggests bearish trend. MA crossovers can signal trend changes.',
    class: 'neutral'
  },
  'Volume': {
    description: 'Volume measures the number of shares or contracts traded in a security or market during a given period.',
    interpretation: 'High volume confirms trend strength. Rising price with rising volume suggests strong bullish trend, while falling price with rising volume indicates strong bearish trend.',
    class: 'neutral'
  },
  'Ichimoku Cloud': {
    description: 'Ichimoku Cloud is a comprehensive indicator that defines support and resistance, identifies trend direction, gauges momentum, and provides trading signals.',
    interpretation: 'Price above the cloud is bullish, while price below the cloud is bearish. Cloud crossovers can signal trend changes.',
    class: 'neutral'
  },
  'Fibonacci Retracement': {
    description: 'Fibonacci Retracement identifies potential support/resistance levels based on the Fibonacci sequence.',
    interpretation: 'Common retracement levels (23.6%, 38.2%, 50%, 61.8%) often act as support or resistance for price movements.',
    class: 'neutral'
  }
};

export const IndicatorInsight: React.FC<IndicatorInsightProps> = ({ indicator, signal, iconSize = 'sm' }) => {
  const indicatorInfo = indicatorDescriptions[indicator] || {
    description: `${indicator} indicator analysis.`,
    interpretation: 'Interpretation of this indicator not available.',
    class: 'neutral'
  };

  return (
    <InsightTooltip
      type={signal}
      title={indicator}
      description={`${indicatorInfo.description} ${indicatorInfo.interpretation}`}
      iconSize={iconSize}
    >
      <span className="font-medium text-base hover:underline dotted">{indicator}</span>
    </InsightTooltip>
  );
};

export default IndicatorInsight;