/**
 * Client mirror of the server StrategySpec (server/services/strategy-spec.ts)
 * plus the wizard's catalogs: template presets, the FX engine's built-in
 * strategies, and a starter spec for the condition builder.
 *
 * Honesty rules baked in:
 *  - Only indicator-based templates get mechanical presets. Pattern
 *    templates (Head & Shoulders, Harmonics, ...) return null — they
 *    can't be replayed by an indicator engine, and the wizard says so.
 *  - Engine strategies with an `approx` get a clearly-labeled mechanical
 *    approximation for backtesting; the rest are engine-native (they run
 *    on the FX engine's AI analysis live) and carry empty rule groups.
 */

export type IndicatorKind = 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'STOCHASTIC' | 'BOLLINGER' | 'ATR';
export type StrategyTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface IndicatorConfig {
  id: string;
  kind: IndicatorKind;
  period?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  stdDev?: number;
}

export type ConditionField = 'value' | 'signal' | 'histogram' | 'upper' | 'middle' | 'lower' | 'k' | 'd' | 'price';
export type ConditionOperator = 'crosses_above' | 'crosses_below' | 'above' | 'below' | 'rising' | 'falling';
export type ConditionCompare =
  | { kind: 'value'; value: number }
  | { kind: 'indicator'; indicatorId: string; field: ConditionField }
  | { kind: 'price' };

export interface Condition {
  indicatorId: string; // an IndicatorConfig id, or 'price'
  field: ConditionField;
  operator: ConditionOperator;
  compare: ConditionCompare;
}

export interface ConditionGroup { logic: 'AND' | 'OR'; conditions: Condition[] }

export interface StrategyRisk {
  lotSize: number;
  stopLossPips?: number | null;
  takeProfitPips?: number | null;
  stopLossAtrMult?: number | null;
  takeProfitAtrMult?: number | null;
  trailingStopPips?: number | null;
  maxTradesPerDay?: number | null;
}

export interface StrategySpec {
  name: string;
  source: 'template' | 'builder' | 'engine';
  engineStrategyKey?: string;
  templateId?: string;
  symbol: string;
  timeframe: StrategyTimeframe;
  indicators: IndicatorConfig[];
  entryLong: ConditionGroup;
  entryShort: ConditionGroup;
  exitLong?: ConditionGroup | null;
  exitShort?: ConditionGroup | null;
  risk: StrategyRisk;
}

export const INDICATOR_FIELDS: Record<IndicatorKind, ConditionField[]> = {
  EMA: ['value'], SMA: ['value'], RSI: ['value'], ATR: ['value'],
  MACD: ['value', 'signal', 'histogram'],
  STOCHASTIC: ['k', 'd'],
  BOLLINGER: ['upper', 'middle', 'lower'],
};

export const INDICATOR_DEFAULTS: Record<IndicatorKind, Partial<IndicatorConfig>> = {
  EMA: { period: 21 }, SMA: { period: 50 }, RSI: { period: 14 }, ATR: { period: 14 },
  MACD: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  STOCHASTIC: { period: 14, signalPeriod: 3 },
  BOLLINGER: { period: 20, stdDev: 2 },
};

export const WIZARD_SYMBOLS = [
  'EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'AUDUSD', 'NZDUSD', 'USDCAD',
  'EURGBP', 'GBPJPY', 'EURJPY', 'XAUUSD', 'XAGUSD', 'US30', 'NAS100',
  'BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD',
];

export const TIMEFRAMES: StrategyTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

const DEFAULT_RISK: StrategyRisk = { lotSize: 0.1, stopLossPips: 30, takeProfitPips: 60, trailingStopPips: null, maxTradesPerDay: null };

export function defaultBuilderSpec(symbol = 'EURUSD', timeframe: StrategyTimeframe = 'H1'): StrategySpec {
  return {
    name: 'My Custom Strategy',
    source: 'builder',
    symbol,
    timeframe,
    indicators: [
      { id: 'emaFast', kind: 'EMA', period: 9 },
      { id: 'emaSlow', kind: 'EMA', period: 21 },
      { id: 'rsi', kind: 'RSI', period: 14 },
    ],
    entryLong: { logic: 'AND', conditions: [
      { indicatorId: 'emaFast', field: 'value', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } },
    ]},
    entryShort: { logic: 'AND', conditions: [
      { indicatorId: 'emaFast', field: 'value', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } },
    ]},
    exitLong: null,
    exitShort: null,
    risk: { ...DEFAULT_RISK },
  };
}

type ParamBag = Record<string, any>;
const param = (params: ParamBag, id: string, fallback: number) =>
  typeof params[id] === 'number' && Number.isFinite(params[id]) ? params[id] : fallback;

/** Mechanical preset for a wizard template, or null when the template is
 *  pattern-based and can't be replayed by the indicator backtester. */
export function templatePreset(templateId: string, templateName: string, params: ParamBag, symbol: string, timeframe: StrategyTimeframe): StrategySpec | null {
  const base = { name: templateName, source: 'template' as const, templateId, symbol, timeframe, risk: { ...DEFAULT_RISK } };
  switch (templateId) {
    case 'moving-average-crossover': {
      const kind = params['ma-type'] === 'sma' ? 'SMA' : 'EMA';
      return { ...base,
        indicators: [
          { id: 'maFast', kind, period: param(params, 'fast-period', 10) },
          { id: 'maSlow', kind, period: param(params, 'slow-period', 20) },
        ],
        entryLong: { logic: 'AND', conditions: [{ indicatorId: 'maFast', field: 'value', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'maSlow', field: 'value' } }] },
        entryShort: { logic: 'AND', conditions: [{ indicatorId: 'maFast', field: 'value', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'maSlow', field: 'value' } }] },
      };
    }
    case 'rsi-overbought-oversold': {
      const ob = param(params, 'overbought', 70);
      const os = param(params, 'oversold', 30);
      return { ...base,
        indicators: [{ id: 'rsi', kind: 'RSI', period: param(params, 'rsi-period', 14) }],
        entryLong: { logic: 'AND', conditions: [{ indicatorId: 'rsi', field: 'value', operator: 'crosses_above', compare: { kind: 'value', value: os } }] },
        entryShort: { logic: 'AND', conditions: [{ indicatorId: 'rsi', field: 'value', operator: 'crosses_below', compare: { kind: 'value', value: ob } }] },
        exitLong: { logic: 'AND', conditions: [{ indicatorId: 'rsi', field: 'value', operator: 'crosses_above', compare: { kind: 'value', value: ob } }] },
        exitShort: { logic: 'AND', conditions: [{ indicatorId: 'rsi', field: 'value', operator: 'crosses_below', compare: { kind: 'value', value: os } }] },
      };
    }
    case 'macd-signal-crossover':
      return { ...base,
        indicators: [{ id: 'macd', kind: 'MACD', fastPeriod: param(params, 'fast-ema', 12), slowPeriod: param(params, 'slow-ema', 26), signalPeriod: param(params, 'signal-period', 9) }],
        entryLong: { logic: 'AND', conditions: [{ indicatorId: 'macd', field: 'value', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'macd', field: 'signal' } }] },
        entryShort: { logic: 'AND', conditions: [{ indicatorId: 'macd', field: 'value', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'macd', field: 'signal' } }] },
      };
    case 'stochastic-crossover': {
      return { ...base,
        indicators: [{ id: 'stoch', kind: 'STOCHASTIC', period: param(params, 'k-period', 14), signalPeriod: param(params, 'd-period', 3) }],
        entryLong: { logic: 'AND', conditions: [{ indicatorId: 'stoch', field: 'k', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'stoch', field: 'd' } }] },
        entryShort: { logic: 'AND', conditions: [{ indicatorId: 'stoch', field: 'k', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'stoch', field: 'd' } }] },
      };
    }
    case 'channel-trading': {
      const lookback = Math.min(param(params, 'lookback-periods', 50), 200);
      return { ...base, name: `${templateName} (Bollinger Channel)`,
        indicators: [{ id: 'bb', kind: 'BOLLINGER', period: lookback, stdDev: 2 }],
        entryLong: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'bb', field: 'lower' } }] },
        entryShort: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'bb', field: 'upper' } }] },
        exitLong: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'bb', field: 'middle' } }] },
        exitShort: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'bb', field: 'middle' } }] },
      };
    }
    default:
      return null;
  }
}

// ── FX engine built-in strategies (mirror of ALL_STRATEGY_KEYS in the
//    live trading engine; names/descriptions follow the app's own
//    ai-trading-models / weekly-strategy pages). ─────────────────────

export interface EngineStrategyInfo {
  key: string;
  name: string;
  description: string;
  category: string;
  /** Mechanical approximation for backtesting. The live engine version
   *  uses AI analysis — an approximation is labeled as one in the UI. */
  approx?: (symbol: string, timeframe: StrategyTimeframe) => StrategySpec;
}

function engineSpec(key: string, name: string, partial: Partial<StrategySpec>): StrategySpec {
  return {
    name: `${name} (mechanical approximation)`,
    source: 'engine',
    engineStrategyKey: key,
    symbol: 'EURUSD',
    timeframe: 'H1',
    indicators: [],
    entryLong: { logic: 'AND', conditions: [] },
    entryShort: { logic: 'AND', conditions: [] },
    risk: { ...DEFAULT_RISK },
    ...partial,
  } as StrategySpec;
}

const emaTrend = (fast: number, slow: number) => ([
  { id: 'emaFast', kind: 'EMA' as const, period: fast },
  { id: 'emaSlow', kind: 'EMA' as const, period: slow },
]);
const crossUp = { indicatorId: 'emaFast', field: 'value' as const, operator: 'crosses_above' as const, compare: { kind: 'indicator' as const, indicatorId: 'emaSlow', field: 'value' as const } };
const crossDown = { indicatorId: 'emaFast', field: 'value' as const, operator: 'crosses_below' as const, compare: { kind: 'indicator' as const, indicatorId: 'emaSlow', field: 'value' as const } };

export const ENGINE_STRATEGIES: EngineStrategyInfo[] = [
  { key: 'scalping', name: 'Scalping', description: 'Quick in-and-out trades', category: 'HFT',
    approx: (symbol, timeframe) => engineSpec('scalping', 'Scalping', { symbol, timeframe: 'M5',
      indicators: emaTrend(5, 13),
      entryLong: { logic: 'AND', conditions: [crossUp] }, entryShort: { logic: 'AND', conditions: [crossDown] },
      risk: { lotSize: 0.1, stopLossPips: 10, takeProfitPips: 15 } }) },
  { key: 'momentum', name: 'Momentum Surfing', description: 'Ride strong price moves', category: 'HFT',
    approx: (symbol, timeframe) => engineSpec('momentum', 'Momentum Surfing', { symbol, timeframe,
      indicators: [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI', period: 14 }],
      entryLong: { logic: 'AND', conditions: [crossUp, { indicatorId: 'rsi', field: 'value', operator: 'above', compare: { kind: 'value', value: 50 } }] },
      entryShort: { logic: 'AND', conditions: [crossDown, { indicatorId: 'rsi', field: 'value', operator: 'below', compare: { kind: 'value', value: 50 } }] },
      risk: { lotSize: 0.1, stopLossPips: 25, takeProfitPips: 50 } }) },
  { key: 'session_breakout', name: 'Session Breakout', description: 'Trade key session opens', category: 'HFT' },
  { key: 'aggressive', name: 'Aggressive Compound', description: 'All strategies, max frequency, compound sizing', category: 'HFT',
    approx: (symbol, timeframe) => engineSpec('aggressive', 'Aggressive Compound', { symbol, timeframe,
      indicators: [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI', period: 14 }],
      entryLong: { logic: 'AND', conditions: [crossUp, { indicatorId: 'rsi', field: 'value', operator: 'above', compare: { kind: 'value', value: 50 } }] },
      entryShort: { logic: 'AND', conditions: [crossDown, { indicatorId: 'rsi', field: 'value', operator: 'below', compare: { kind: 'value', value: 50 } }] },
      risk: { lotSize: 0.2, stopLossPips: 40, takeProfitPips: 40 } }) },
  { key: 'sniper', name: 'Sniper Mode', description: 'High-confidence precision entries', category: 'HFT',
    approx: (symbol, timeframe) => engineSpec('sniper', 'Sniper Mode', { symbol, timeframe,
      indicators: [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI', period: 14 }],
      entryLong: { logic: 'AND', conditions: [
        { indicatorId: 'emaFast', field: 'value', operator: 'above', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } },
        { indicatorId: 'rsi', field: 'value', operator: 'crosses_above', compare: { kind: 'value', value: 40 } }] },
      entryShort: { logic: 'AND', conditions: [
        { indicatorId: 'emaFast', field: 'value', operator: 'below', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } },
        { indicatorId: 'rsi', field: 'value', operator: 'crosses_below', compare: { kind: 'value', value: 60 } }] },
      risk: { lotSize: 0.1, stopLossPips: 20, takeProfitPips: 60, maxTradesPerDay: 3 } }) },
  { key: 'compound', name: 'Compound Growth', description: 'Aggressive compounding on wins', category: 'HFT' },
  { key: 'chart_pattern', name: 'Chart Patterns', description: 'Head & shoulders, double tops, triangles, flags, wedges', category: 'Classic' },
  { key: 'ict_order_blocks', name: 'ICT Order Blocks', description: 'Trade institutional supply/demand zones', category: 'ICT' },
  { key: 'ict_fvg', name: 'ICT Fair Value Gaps', description: 'Exploit price imbalance fills', category: 'ICT' },
  { key: 'ict_liquidity_sweep', name: 'ICT Liquidity Sweeps', description: 'Trade reversals after stop hunts', category: 'ICT' },
  { key: 'ict_bos', name: 'ICT Break of Structure', description: 'BOS/CHOCH trend shifts', category: 'ICT' },
  { key: 'ict_ote', name: 'ICT Optimal Trade Entry', description: 'Precision Fibonacci OTE zone entries', category: 'ICT' },
  { key: 'smc_demand_supply', name: 'SMC Demand & Supply', description: 'Smart-money demand and supply zones', category: 'SMC' },
  { key: 'asia_range_breakout', name: 'Asia Range Breakout', description: 'Breakout of the Asian session range', category: 'Session' },
  { key: 'vwap_mean_reversion', name: 'VWAP Mean Reversion', description: 'Fade stretched moves back to VWAP', category: 'Mean Reversion' },
  { key: 'news_fade', name: 'News Fade', description: 'Fade the initial spike after major news', category: 'Event' },
  { key: 'prop_firm_sniper', name: 'Prop Firm Sniper', description: 'Low-frequency precision entries sized for prop-firm rules', category: 'Prop Firm',
    approx: (symbol, timeframe) => engineSpec('prop_firm_sniper', 'Prop Firm Sniper', { symbol, timeframe,
      indicators: [...emaTrend(9, 21), { id: 'rsi', kind: 'RSI', period: 14 }],
      entryLong: { logic: 'AND', conditions: [
        { indicatorId: 'emaFast', field: 'value', operator: 'above', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } },
        { indicatorId: 'rsi', field: 'value', operator: 'crosses_above', compare: { kind: 'value', value: 35 } }] },
      entryShort: { logic: 'AND', conditions: [
        { indicatorId: 'emaFast', field: 'value', operator: 'below', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } },
        { indicatorId: 'rsi', field: 'value', operator: 'crosses_below', compare: { kind: 'value', value: 65 } }] },
      risk: { lotSize: 0.05, stopLossPips: 15, takeProfitPips: 45, maxTradesPerDay: 2 } }) },
  { key: 'sunday_gap', name: 'Sunday Gap', description: 'Trade the weekend gap at the Sunday open', category: 'Event' },
  { key: 'order_flow', name: 'Order Flow', description: 'Footprint and order-flow imbalance entries', category: 'Advanced' },
];

/** Engine-native spec (no mechanical rules) for engine strategies without an approximation. */
export function engineNativeSpec(info: EngineStrategyInfo, symbol: string, timeframe: StrategyTimeframe): StrategySpec {
  return {
    name: info.name,
    source: 'engine',
    engineStrategyKey: info.key,
    symbol,
    timeframe,
    indicators: [],
    entryLong: { logic: 'AND', conditions: [] },
    entryShort: { logic: 'AND', conditions: [] },
    exitLong: null,
    exitShort: null,
    risk: { ...DEFAULT_RISK },
  };
}
