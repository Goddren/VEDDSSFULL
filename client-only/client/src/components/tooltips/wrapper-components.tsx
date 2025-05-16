import React from 'react';
import { default as InsightTooltipOriginal } from './insight-tooltip';
import { InsightTooltipProps } from './tooltip-types';

// Wrapper components that will be used in place of the string exports
export const InsightTooltipWrapper: React.FC<InsightTooltipProps> = (props) => {
  return <InsightTooltipOriginal {...props} />;
};

export const IndicatorInsightWrapper: React.FC<any> = (props) => {
  return <span>{props.children || props.indicator}</span>;
};

export const PatternInsightWrapper: React.FC<any> = (props) => {
  return <span>{props.children || props.pattern}</span>;
};

export const MarketTrendInsightWrapper: React.FC<any> = (props) => {
  return <span>{props.children || props.trend}</span>;
};

export const ConfidenceInsightWrapper: React.FC<any> = (props) => {
  return <span>{props.children || props.level}</span>;
};