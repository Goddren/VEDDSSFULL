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

export type IndicatorKind =
  | 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'STOCHASTIC' | 'BOLLINGER' | 'ATR'
  | 'VWAP' | 'ADX' | 'CCI' | 'WILLIAMS_R' | 'ICHIMOKU' | 'SUPERTREND' | 'DONCHIAN'
  | 'VOLUME_PROFILE' | 'PIVOTS' | 'ORB' | 'SWINGS' | 'FVG' | 'ORDER_BLOCK';
export type StrategyTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface IndicatorConfig {
  id: string;
  kind: IndicatorKind;
  period?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  stdDev?: number;
  sourceId?: string;
  lookbackBars?: number;
  valueAreaPct?: number;
  pivotLeft?: number;
  pivotRight?: number;
  sessionStartHourUtc?: number;
  sessionStartMinuteUtc?: number;
  rangeMinutes?: number;
}

export type ConditionField =
  | 'value' | 'signal' | 'histogram' | 'upper' | 'middle' | 'lower' | 'k' | 'd' | 'price'
  | 'poc' | 'vah' | 'val' | 'tenkan' | 'kijun' | 'span_a' | 'span_b' | 'plus' | 'minus'
  | 'swing_high' | 'swing_low' | 'or_high' | 'or_low'
  | 'bull_high' | 'bull_low' | 'bear_high' | 'bear_low' | 'pp' | 'r1' | 'r2' | 's1' | 's2';
export type ConditionOperator =
  | 'crosses_above' | 'crosses_below' | 'above' | 'below' | 'rising' | 'falling'
  | 'turns_up' | 'turns_down';
export type ConditionCompare =
  | { kind: 'value'; value: number }
  | { kind: 'indicator'; indicatorId: string; field: ConditionField }
  | { kind: 'price' };

export interface Condition {
  indicatorId: string; // an IndicatorConfig id, or 'price'
  field: ConditionField;
  operator: ConditionOperator;
  compare: ConditionCompare;
  sustainBars?: number;
  minGapPips?: number;
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
  breakevenTriggerPips?: number | null;
  breakevenOffsetPips?: number | null;
}

export interface TrendFilter {
  timeframe: StrategyTimeframe;
  longGroup?: ConditionGroup | null;
  shortGroup?: ConditionGroup | null;
}

export interface SessionFilter {
  startHourUtc: number;
  endHourUtc: number;
  daysUtc?: number[];
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
  trendFilter?: TrendFilter | null;
  sessionFilter?: SessionFilter | null;
  risk: StrategyRisk;
}

export const INDICATOR_FIELDS: Record<IndicatorKind, ConditionField[]> = {
  EMA: ['value'], SMA: ['value'], RSI: ['value'], ATR: ['value'],
  MACD: ['value', 'signal', 'histogram'],
  STOCHASTIC: ['k', 'd'],
  BOLLINGER: ['upper', 'middle', 'lower'],
  VWAP: ['value'],
  ADX: ['value', 'plus', 'minus'],
  CCI: ['value'],
  WILLIAMS_R: ['value'],
  ICHIMOKU: ['tenkan', 'kijun', 'span_a', 'span_b'],
  SUPERTREND: ['value'],
  DONCHIAN: ['upper', 'middle', 'lower'],
  VOLUME_PROFILE: ['poc', 'vah', 'val'],
  PIVOTS: ['pp', 'r1', 'r2', 's1', 's2'],
  ORB: ['or_high', 'or_low'],
  SWINGS: ['swing_high', 'swing_low'],
  FVG: ['bull_high', 'bull_low', 'bear_high', 'bear_low'],
  ORDER_BLOCK: ['bull_high', 'bull_low', 'bear_high', 'bear_low'],
};

export const INDICATOR_DEFAULTS: Record<IndicatorKind, Partial<IndicatorConfig>> = {
  EMA: { period: 21 }, SMA: { period: 50 }, RSI: { period: 14 }, ATR: { period: 14 },
  MACD: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 },
  STOCHASTIC: { period: 14, signalPeriod: 3 },
  BOLLINGER: { period: 20, stdDev: 2 },
  VWAP: {},
  ADX: { period: 14 },
  CCI: { period: 20 },
  WILLIAMS_R: { period: 14 },
  ICHIMOKU: { period: 9, fastPeriod: 26, slowPeriod: 52 },
  SUPERTREND: { period: 10, stdDev: 3 },
  DONCHIAN: { period: 20 },
  VOLUME_PROFILE: { lookbackBars: 100, valueAreaPct: 70 },
  PIVOTS: {},
  ORB: { sessionStartHourUtc: 14, sessionStartMinuteUtc: 30, rangeMinutes: 30 },
  SWINGS: { pivotLeft: 3, pivotRight: 3 },
  FVG: { lookbackBars: 100 },
  ORDER_BLOCK: { lookbackBars: 100, pivotLeft: 5 },
};

export const TF_MINUTES_MAP: Record<StrategyTimeframe, number> = {
  M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
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

// ── Advanced strategy presets ───────────────────────────────────────
// Mechanical, backtestable versions of the strategies traders actually
// ask for: Volume Profile, ORB, ICT (sweeps / FVG / order blocks / BOS),
// Supertrend, Ichimoku, VWAP, Donchian, and a multi-timeframe trend
// system. Every preset loads as editable rules in the builder — what
// you see is exactly what the backtester replays.

export interface AdvancedPreset {
  id: string;
  name: string;
  family: string;
  tagline: string;
  defaultTimeframe: StrategyTimeframe;
  build: (symbol: string, timeframe: StrategyTimeframe) => StrategySpec;
}

const C = (
  indicatorId: string, field: ConditionField, operator: ConditionOperator,
  compare: ConditionCompare, extra?: Partial<Condition>,
): Condition => ({ indicatorId, field, operator, compare, ...extra });
const vs = (indicatorId: string, field: ConditionField): ConditionCompare => ({ kind: 'indicator', indicatorId, field });
const num = (value: number): ConditionCompare => ({ kind: 'value', value });
const G = (...conditions: Condition[]): ConditionGroup => ({ logic: 'AND', conditions });
const ADV_RISK: StrategyRisk = { lotSize: 0.1, stopLossPips: 30, takeProfitPips: 60, trailingStopPips: null, maxTradesPerDay: null };

export const ADVANCED_PRESETS: AdvancedPreset[] = [
  {
    id: 'vp-value-area-bounce', name: 'Volume Profile — Value Area Bounce', family: 'Volume Profile',
    tagline: 'Buy the reclaim of the Value Area Low, sell the rejection of the Value Area High. Needs volume data — FX feeds use tick volume.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'VP Value Area Bounce', source: 'template', templateId: 'vp-value-area-bounce', symbol, timeframe,
      indicators: [{ id: 'vp', kind: 'VOLUME_PROFILE', lookbackBars: 100, valueAreaPct: 70 }],
      entryLong: G(C('price', 'price', 'crosses_above', vs('vp', 'val'))),
      entryShort: G(C('price', 'price', 'crosses_below', vs('vp', 'vah'))),
      exitLong: G(C('price', 'price', 'crosses_above', vs('vp', 'poc'))),
      exitShort: G(C('price', 'price', 'crosses_below', vs('vp', 'poc'))),
      risk: { ...ADV_RISK, stopLossPips: 25, takeProfitPips: 50 },
    }),
  },
  {
    id: 'vp-breakout', name: 'Volume Profile — Value Area Breakout', family: 'Volume Profile',
    tagline: 'Momentum through the value area: long above the VAH, short below the VAL, targeting moves away from the POC.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'VP Breakout', source: 'template', templateId: 'vp-breakout', symbol, timeframe,
      indicators: [{ id: 'vp', kind: 'VOLUME_PROFILE', lookbackBars: 100, valueAreaPct: 70 }],
      entryLong: G(C('price', 'price', 'crosses_above', vs('vp', 'vah'))),
      entryShort: G(C('price', 'price', 'crosses_below', vs('vp', 'val'))),
      exitLong: null, exitShort: null,
      risk: { ...ADV_RISK, stopLossPips: 30, takeProfitPips: 90, breakevenTriggerPips: 30, breakevenOffsetPips: 2 },
    }),
  },
  {
    id: 'orb-new-york', name: 'ORB — New York Open Breakout', family: 'Opening Range',
    tagline: 'The classic opening range breakout: first 30 minutes from 14:30 UTC (9:30 ET) set the range, trade the break.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'ORB New York', source: 'template', templateId: 'orb-new-york', symbol, timeframe,
      indicators: [{ id: 'orb', kind: 'ORB', sessionStartHourUtc: 14, sessionStartMinuteUtc: 30, rangeMinutes: 30 }],
      entryLong: G(C('price', 'price', 'crosses_above', vs('orb', 'or_high'))),
      entryShort: G(C('price', 'price', 'crosses_below', vs('orb', 'or_low'))),
      exitLong: null, exitShort: null,
      sessionFilter: { startHourUtc: 14, endHourUtc: 21, daysUtc: [1, 2, 3, 4, 5] },
      risk: { ...ADV_RISK, stopLossPips: 25, takeProfitPips: 50, maxTradesPerDay: 2 },
    }),
  },
  {
    id: 'orb-london', name: 'ORB — London Open Breakout', family: 'Opening Range',
    tagline: 'First hour of the London session (08:00 UTC) sets the range — the highest-volume FX open of the day.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'ORB London', source: 'template', templateId: 'orb-london', symbol, timeframe,
      indicators: [{ id: 'orb', kind: 'ORB', sessionStartHourUtc: 8, sessionStartMinuteUtc: 0, rangeMinutes: 60 }],
      entryLong: G(C('price', 'price', 'crosses_above', vs('orb', 'or_high'))),
      entryShort: G(C('price', 'price', 'crosses_below', vs('orb', 'or_low'))),
      exitLong: null, exitShort: null,
      sessionFilter: { startHourUtc: 8, endHourUtc: 17, daysUtc: [1, 2, 3, 4, 5] },
      risk: { ...ADV_RISK, stopLossPips: 25, takeProfitPips: 50, maxTradesPerDay: 2 },
    }),
  },
  {
    id: 'ict-liquidity-sweep', name: 'ICT — Liquidity Sweep Reversal', family: 'ICT / Smart Money',
    tagline: 'Price raids a swing low (stops run), closes back above it → long. Mirror at swing highs. Mechanical close-based version of the sweep + reclaim.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'ICT Liquidity Sweep', source: 'template', templateId: 'ict-liquidity-sweep', symbol, timeframe,
      indicators: [{ id: 'sw', kind: 'SWINGS', pivotLeft: 3, pivotRight: 3 }],
      entryLong: G(C('price', 'price', 'crosses_above', vs('sw', 'swing_low'))),
      entryShort: G(C('price', 'price', 'crosses_below', vs('sw', 'swing_high'))),
      exitLong: null, exitShort: null,
      risk: { ...ADV_RISK, stopLossPips: 20, takeProfitPips: 60, breakevenTriggerPips: 25, breakevenOffsetPips: 1 },
    }),
  },
  {
    id: 'ict-fvg-continuation', name: 'ICT — FVG Retest Continuation', family: 'ICT / Smart Money',
    tagline: 'Trend + imbalance: in an uptrend, buy when price dips back into a bullish Fair Value Gap and holds its floor.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'ICT FVG Continuation', source: 'template', templateId: 'ict-fvg-continuation', symbol, timeframe,
      indicators: [
        { id: 'ema', kind: 'EMA', period: 50 },
        { id: 'fvg', kind: 'FVG', lookbackBars: 100 },
      ],
      entryLong: G(
        C('price', 'price', 'above', vs('ema', 'value')),
        C('price', 'price', 'crosses_below', vs('fvg', 'bull_high')),
        C('price', 'price', 'above', vs('fvg', 'bull_low')),
      ),
      entryShort: G(
        C('price', 'price', 'below', vs('ema', 'value')),
        C('price', 'price', 'crosses_above', vs('fvg', 'bear_low')),
        C('price', 'price', 'below', vs('fvg', 'bear_high')),
      ),
      exitLong: null, exitShort: null,
      risk: { ...ADV_RISK, stopLossPips: 25, takeProfitPips: 75 },
    }),
  },
  {
    id: 'ict-order-block', name: 'ICT — Order Block Retest', family: 'ICT / Smart Money',
    tagline: 'Buy the first retest of a confirmed bullish order block (the last down candle before displacement up). Mirror for bearish blocks.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'ICT Order Block Retest', source: 'template', templateId: 'ict-order-block', symbol, timeframe,
      indicators: [{ id: 'ob', kind: 'ORDER_BLOCK', lookbackBars: 100, pivotLeft: 5 }],
      entryLong: G(
        C('price', 'price', 'crosses_below', vs('ob', 'bull_high')),
        C('price', 'price', 'above', vs('ob', 'bull_low')),
      ),
      entryShort: G(
        C('price', 'price', 'crosses_above', vs('ob', 'bear_low')),
        C('price', 'price', 'below', vs('ob', 'bear_high')),
      ),
      exitLong: null, exitShort: null,
      risk: { ...ADV_RISK, stopLossPips: 20, takeProfitPips: 60 },
    }),
  },
  {
    id: 'ict-bos-trend', name: 'ICT — Break of Structure Trend', family: 'ICT / Smart Money',
    tagline: 'Market-structure trend following: a close above the last confirmed swing high is a bullish BOS — buy it while price holds above the EMA.',
    defaultTimeframe: 'H1',
    build: (symbol, timeframe) => ({
      name: 'ICT BOS Trend', source: 'template', templateId: 'ict-bos-trend', symbol, timeframe,
      indicators: [
        { id: 'sw', kind: 'SWINGS', pivotLeft: 3, pivotRight: 3 },
        { id: 'ema', kind: 'EMA', period: 50 },
      ],
      entryLong: G(
        C('price', 'price', 'crosses_above', vs('sw', 'swing_high')),
        C('price', 'price', 'above', vs('ema', 'value')),
      ),
      entryShort: G(
        C('price', 'price', 'crosses_below', vs('sw', 'swing_low')),
        C('price', 'price', 'below', vs('ema', 'value')),
      ),
      exitLong: G(C('price', 'price', 'crosses_below', vs('sw', 'swing_low'))),
      exitShort: G(C('price', 'price', 'crosses_above', vs('sw', 'swing_high'))),
      risk: { ...ADV_RISK, stopLossPips: 40, takeProfitPips: 120, trailingStopPips: 50 },
    }),
  },
  {
    id: 'supertrend-follow', name: 'Supertrend + ADX Filter', family: 'Trend',
    tagline: 'Ride Supertrend flips, but only when ADX says a real trend exists (ADX above 25).',
    defaultTimeframe: 'H1',
    build: (symbol, timeframe) => ({
      name: 'Supertrend ADX', source: 'template', templateId: 'supertrend-follow', symbol, timeframe,
      indicators: [
        { id: 'st', kind: 'SUPERTREND', period: 10, stdDev: 3 },
        { id: 'adx', kind: 'ADX', period: 14 },
      ],
      entryLong: G(
        C('price', 'price', 'crosses_above', vs('st', 'value')),
        C('adx', 'value', 'above', num(25)),
      ),
      entryShort: G(
        C('price', 'price', 'crosses_below', vs('st', 'value')),
        C('adx', 'value', 'above', num(25)),
      ),
      exitLong: G(C('price', 'price', 'crosses_below', vs('st', 'value'))),
      exitShort: G(C('price', 'price', 'crosses_above', vs('st', 'value'))),
      risk: { ...ADV_RISK, stopLossPips: 40, takeProfitPips: 120 },
    }),
  },
  {
    id: 'ichimoku-break', name: 'Ichimoku — Cloud Breakout', family: 'Trend',
    tagline: 'Price breaks the Kumo with Tenkan above Kijun for longs; full cloud + TK alignment, no half signals.',
    defaultTimeframe: 'H1',
    build: (symbol, timeframe) => ({
      name: 'Ichimoku Cloud Break', source: 'template', templateId: 'ichimoku-break', symbol, timeframe,
      indicators: [{ id: 'ichi', kind: 'ICHIMOKU', period: 9, fastPeriod: 26, slowPeriod: 52 }],
      entryLong: G(
        C('price', 'price', 'crosses_above', vs('ichi', 'span_a')),
        C('ichi', 'span_a', 'above', vs('ichi', 'span_b')),
        C('ichi', 'tenkan', 'above', vs('ichi', 'kijun')),
      ),
      entryShort: G(
        C('price', 'price', 'crosses_below', vs('ichi', 'span_b')),
        C('price', 'price', 'below', vs('ichi', 'span_a')),
        C('ichi', 'tenkan', 'below', vs('ichi', 'kijun')),
      ),
      exitLong: G(C('ichi', 'tenkan', 'crosses_below', vs('ichi', 'kijun'))),
      exitShort: G(C('ichi', 'tenkan', 'crosses_above', vs('ichi', 'kijun'))),
      risk: { ...ADV_RISK, stopLossPips: 50, takeProfitPips: 150, trailingStopPips: 60 },
    }),
  },
  {
    id: 'vwap-reversion', name: 'VWAP Mean Reversion', family: 'Mean Reversion',
    tagline: 'Fade the stretch: price reclaims VWAP with RSI turning up from oversold. Intraday only — VWAP resets daily.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'VWAP Mean Reversion', source: 'template', templateId: 'vwap-reversion', symbol, timeframe,
      indicators: [
        { id: 'vw', kind: 'VWAP' },
        { id: 'rsi', kind: 'RSI', period: 14 },
      ],
      entryLong: G(
        C('price', 'price', 'crosses_above', vs('vw', 'value')),
        C('rsi', 'value', 'turns_up', num(0)),
        C('rsi', 'value', 'below', num(55)),
      ),
      entryShort: G(
        C('price', 'price', 'crosses_below', vs('vw', 'value')),
        C('rsi', 'value', 'turns_down', num(0)),
        C('rsi', 'value', 'above', num(45)),
      ),
      exitLong: null, exitShort: null,
      sessionFilter: { startHourUtc: 7, endHourUtc: 21, daysUtc: [1, 2, 3, 4, 5] },
      risk: { ...ADV_RISK, stopLossPips: 20, takeProfitPips: 40, maxTradesPerDay: 4 },
    }),
  },
  {
    id: 'mtf-trend', name: 'Multi-Timeframe Trend (HTF Filter)', family: 'Trend',
    tagline: 'Entries on your timeframe only fire when the higher-timeframe trend agrees — the H4 EMA stack gates every trade.',
    defaultTimeframe: 'M15',
    build: (symbol, timeframe) => ({
      name: 'MTF Trend', source: 'template', templateId: 'mtf-trend', symbol, timeframe,
      indicators: [
        { id: 'emaFast', kind: 'EMA', period: 9 },
        { id: 'emaSlow', kind: 'EMA', period: 21 },
        { id: 'adx', kind: 'ADX', period: 14 },
      ],
      entryLong: G(
        C('emaFast', 'value', 'crosses_above', vs('emaSlow', 'value')),
        C('adx', 'value', 'above', num(20)),
      ),
      entryShort: G(
        C('emaFast', 'value', 'crosses_below', vs('emaSlow', 'value')),
        C('adx', 'value', 'above', num(20)),
      ),
      exitLong: null, exitShort: null,
      trendFilter: {
        timeframe: 'H4',
        longGroup: G(C('emaFast', 'value', 'above', vs('emaSlow', 'value'))),
        shortGroup: G(C('emaFast', 'value', 'below', vs('emaSlow', 'value'))),
      },
      risk: { ...ADV_RISK, stopLossPips: 35, takeProfitPips: 105, breakevenTriggerPips: 35, breakevenOffsetPips: 2 },
    }),
  },
  {
    id: 'donchian-turtle', name: 'Donchian Breakout (Turtle)', family: 'Trend',
    tagline: 'The original Turtle system: 20-bar channel breakout, ATR-sized stops — the strategy that made breakout trading famous.',
    defaultTimeframe: 'H4',
    build: (symbol, timeframe) => ({
      name: 'Donchian Turtle', source: 'template', templateId: 'donchian-turtle', symbol, timeframe,
      indicators: [
        { id: 'dc', kind: 'DONCHIAN', period: 20 },
        { id: 'atr', kind: 'ATR', period: 14 },
      ],
      entryLong: G(C('price', 'price', 'crosses_above', vs('dc', 'upper'))),
      entryShort: G(C('price', 'price', 'crosses_below', vs('dc', 'lower'))),
      exitLong: G(C('price', 'price', 'crosses_below', vs('dc', 'middle'))),
      exitShort: G(C('price', 'price', 'crosses_above', vs('dc', 'middle'))),
      risk: { lotSize: 0.1, stopLossPips: null, takeProfitPips: null, stopLossAtrMult: 2, takeProfitAtrMult: 6, trailingStopPips: null, maxTradesPerDay: null },
    }),
  },
];
