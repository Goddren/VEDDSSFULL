/**
 * Strategy Spec — the shared language of the Strategy Wizard.
 *
 * One JSON spec describes a strategy whether it came from a template
 * (source: 'template', a preset that fills this shape) or from the
 * condition builder (source: 'builder', user-composed indicator rules).
 * The same spec drives:
 *   - the deterministic backtester (strategy-backtest.ts)
 *   - the MT5 EA bridge (maps the spec into the existing EA generator)
 *   - the deploy/brain layer (a saved spec is the strategy entity)
 *
 * Conditions compare an indicator series (or price) against a constant,
 * another indicator series, or price — e.g. "RSI(14) crosses_above 30",
 * "EMA(9) crosses_above EMA(21)", "close above Bollinger upper".
 */

export type IndicatorKind =
  | 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'STOCHASTIC' | 'BOLLINGER' | 'ATR'
  | 'VWAP' | 'ADX' | 'CCI' | 'WILLIAMS_R' | 'ICHIMOKU' | 'SUPERTREND' | 'DONCHIAN'
  | 'VOLUME_PROFILE' | 'PIVOTS' | 'ORB' | 'SWINGS' | 'FVG' | 'ORDER_BLOCK';
export type StrategyTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface IndicatorConfig {
  id: string;                 // unique within the spec, referenced by conditions
  kind: IndicatorKind;
  period?: number;            // EMA/SMA/RSI/ATR/Bollinger lookback; stochastic %K period
  fastPeriod?: number;        // MACD
  slowPeriod?: number;        // MACD
  signalPeriod?: number;      // MACD signal / stochastic %D smoothing
  stdDev?: number;            // Bollinger / Supertrend ATR multiplier
  /** EMA/SMA only: smooth another indicator's 'value' series instead of price. */
  sourceId?: string;
  lookbackBars?: number;      // VOLUME_PROFILE: rolling window in bars
  valueAreaPct?: number;      // VOLUME_PROFILE: value area share (e.g. 70)
  pivotLeft?: number;         // SWINGS / FVG / ORDER_BLOCK: pivot confirmation bars
  pivotRight?: number;
  sessionStartHourUtc?: number;   // ORB: opening-range session start (UTC)
  sessionStartMinuteUtc?: number;
  rangeMinutes?: number;          // ORB: opening range length
}

export type ConditionField =
  | 'value' | 'signal' | 'histogram' | 'upper' | 'middle' | 'lower' | 'k' | 'd' | 'price'
  | 'poc' | 'vah' | 'val'
  | 'tenkan' | 'kijun' | 'span_a' | 'span_b'
  | 'plus' | 'minus'
  | 'swing_high' | 'swing_low' | 'or_high' | 'or_low'
  | 'bull_high' | 'bull_low' | 'bear_high' | 'bear_low'
  | 'pp' | 'r1' | 'r2' | 's1' | 's2';
export type ConditionOperator =
  | 'crosses_above' | 'crosses_below' | 'above' | 'below' | 'rising' | 'falling'
  | 'turns_up' | 'turns_down';

export type ConditionCompare =
  | { kind: 'value'; value: number }
  | { kind: 'indicator'; indicatorId: string; field: ConditionField }
  | { kind: 'price' };

export interface Condition {
  /** Indicator config id, or the literal 'price' for the close series. */
  indicatorId: string;
  field: ConditionField;
  operator: ConditionOperator;
  compare: ConditionCompare;  // ignored for rising/falling/turns_*
  /** The condition must hold on this many consecutive bars (incl. current). */
  sustainBars?: number;
  /** For above/below/crosses: the gap past the compare level, in pips. */
  minGapPips?: number;
}

export interface ConditionGroup {
  logic: 'AND' | 'OR';
  conditions: Condition[];
}

export interface StrategyRisk {
  lotSize: number;
  stopLossPips?: number | null;
  takeProfitPips?: number | null;
  stopLossAtrMult?: number | null;    // used when the spec includes an ATR indicator
  takeProfitAtrMult?: number | null;
  trailingStopPips?: number | null;
  maxTradesPerDay?: number | null;
  /** Move the stop to entry (+offset) once price runs this far in profit. */
  breakevenTriggerPips?: number | null;
  breakevenOffsetPips?: number | null;
}

/** Multi-timeframe trend filter: entry groups on the base timeframe only
 *  fire when the filter group — the same indicator ids computed on
 *  resampled higher-timeframe bars — also holds on the last closed HTF bar. */
export interface TrendFilter {
  timeframe: StrategyTimeframe;
  longGroup?: ConditionGroup | null;   // must hold for long entries
  shortGroup?: ConditionGroup | null;  // must hold for short entries
}

/** Session filter: entries only on bars inside the UTC window. */
export interface SessionFilter {
  startHourUtc: number;   // 0–23
  endHourUtc: number;     // 0–24 (exclusive); wraps midnight when end < start
  daysUtc?: number[];     // 0=Sunday … 6=Saturday; empty = all days
}

/** The FX engine's built-in strategy keys — mirror of ALL_STRATEGY_KEYS in
 *  services/live-trading-engine.ts. Engine strategies join the wizard's
 *  choose list; ones without mechanical rules carry source 'engine' with
 *  empty condition groups and run on the engine's AI analysis when deployed. */
export const ENGINE_STRATEGY_KEYS = [
  'scalping', 'momentum', 'session_breakout', 'aggressive', 'sniper', 'compound',
  'chart_pattern', 'ict_order_blocks', 'ict_fvg', 'ict_liquidity_sweep', 'ict_bos', 'ict_ote',
  'smc_demand_supply', 'asia_range_breakout', 'vwap_mean_reversion', 'news_fade',
  'prop_firm_sniper', 'sunday_gap', 'order_flow',
] as const;
export type EngineStrategyKey = (typeof ENGINE_STRATEGY_KEYS)[number];

export interface StrategySpec {
  name: string;
  source: 'template' | 'builder' | 'engine';
  /** Set when source is 'engine': which FX-engine strategy this entry is. */
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
  /** Set ONLY on a buyer's cloned copy of a Marketplace strategy
   *  listing: which listing/seller/strategy it came from and which
   *  proof (shadow or live) the seller's record carried. The runner
   *  ignores it; it exists so the copy is honestly labelled forever. */
  marketplace?: {
    purchased: true;
    source: 'marketplace_strategy';
    listingId: number;
    sellerId: number;
    sourceStrategyId: number;
    proofType: 'shadow' | 'live';
    /** 'purchase' (default, permanent) or 'subscription' — a
     *  subscription clone loses deployment access when the buyer's
     *  subscription to the listing lapses (marketplace-subscriptions). */
    grantType?: 'purchase' | 'subscription';
  };
}

export const INDICATOR_CATALOG: Array<{
  kind: IndicatorKind; label: string; fields: ConditionField[]; defaults: Partial<IndicatorConfig>;
}> = [
  { kind: 'EMA', label: 'Exponential Moving Average', fields: ['value'], defaults: { period: 21 } },
  { kind: 'SMA', label: 'Simple Moving Average', fields: ['value'], defaults: { period: 50 } },
  { kind: 'RSI', label: 'Relative Strength Index', fields: ['value'], defaults: { period: 14 } },
  { kind: 'MACD', label: 'MACD', fields: ['value', 'signal', 'histogram'], defaults: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 } },
  { kind: 'STOCHASTIC', label: 'Stochastic Oscillator', fields: ['k', 'd'], defaults: { period: 14, signalPeriod: 3 } },
  { kind: 'BOLLINGER', label: 'Bollinger Bands', fields: ['upper', 'middle', 'lower'], defaults: { period: 20, stdDev: 2 } },
  { kind: 'ATR', label: 'Average True Range', fields: ['value'], defaults: { period: 14 } },
  { kind: 'VWAP', label: 'VWAP (daily reset)', fields: ['value'], defaults: {} },
  { kind: 'ADX', label: 'ADX (trend strength)', fields: ['value', 'plus', 'minus'], defaults: { period: 14 } },
  { kind: 'CCI', label: 'CCI', fields: ['value'], defaults: { period: 20 } },
  { kind: 'WILLIAMS_R', label: 'Williams %R', fields: ['value'], defaults: { period: 14 } },
  { kind: 'ICHIMOKU', label: 'Ichimoku Cloud', fields: ['tenkan', 'kijun', 'span_a', 'span_b'], defaults: { period: 9, fastPeriod: 26, slowPeriod: 52 } },
  { kind: 'SUPERTREND', label: 'Supertrend', fields: ['value'], defaults: { period: 10, stdDev: 3 } },
  { kind: 'DONCHIAN', label: 'Donchian Channel', fields: ['upper', 'middle', 'lower'], defaults: { period: 20 } },
  { kind: 'VOLUME_PROFILE', label: 'Volume Profile (POC / Value Area)', fields: ['poc', 'vah', 'val'], defaults: { lookbackBars: 100, valueAreaPct: 70 } },
  { kind: 'PIVOTS', label: 'Daily Pivot Points', fields: ['pp', 'r1', 'r2', 's1', 's2'], defaults: {} },
  { kind: 'ORB', label: 'Opening Range (ORB)', fields: ['or_high', 'or_low'], defaults: { sessionStartHourUtc: 14, sessionStartMinuteUtc: 30, rangeMinutes: 30 } },
  { kind: 'SWINGS', label: 'Swing Highs / Lows (structure)', fields: ['swing_high', 'swing_low'], defaults: { pivotLeft: 3, pivotRight: 3 } },
  { kind: 'FVG', label: 'Fair Value Gaps (ICT)', fields: ['bull_high', 'bull_low', 'bear_high', 'bear_low'], defaults: { lookbackBars: 100 } },
  { kind: 'ORDER_BLOCK', label: 'Order Blocks (ICT)', fields: ['bull_high', 'bull_low', 'bear_high', 'bear_low'], defaults: { lookbackBars: 100, pivotLeft: 5 } },
];

const TIMEFRAMES: StrategyTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const OPERATORS: ConditionOperator[] = ['crosses_above', 'crosses_below', 'above', 'below', 'rising', 'falling', 'turns_up', 'turns_down'];
const FIELDS: ConditionField[] = [
  'value', 'signal', 'histogram', 'upper', 'middle', 'lower', 'k', 'd', 'price',
  'poc', 'vah', 'val', 'tenkan', 'kijun', 'span_a', 'span_b', 'plus', 'minus',
  'swing_high', 'swing_low', 'or_high', 'or_low',
  'bull_high', 'bull_low', 'bear_high', 'bear_low', 'pp', 'r1', 'r2', 's1', 's2',
];

export const TF_MINUTES: Record<StrategyTimeframe, number> = {
  M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
};

function isNum(x: any, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
}

function validateGroup(g: any, indicatorIds: Set<string>, label: string, allowEmpty = false): string | null {
  if (!g || (g.logic !== 'AND' && g.logic !== 'OR')) return `${label}: logic must be AND or OR`;
  const min = allowEmpty ? 0 : 1;
  if (!Array.isArray(g.conditions) || g.conditions.length < min || g.conditions.length > 6) {
    return `${label}: needs ${min}–6 conditions`;
  }
  for (const c of g.conditions as Condition[]) {
    if (c.indicatorId !== 'price' && !indicatorIds.has(c.indicatorId)) {
      return `${label}: unknown indicator "${c.indicatorId}"`;
    }
    if (!FIELDS.includes(c.field)) return `${label}: bad field "${c.field}"`;
    if (!OPERATORS.includes(c.operator)) return `${label}: bad operator "${c.operator}"`;
    if (c.sustainBars !== undefined && !isNum(c.sustainBars, 1, 50)) return `${label}: sustainBars out of range`;
    if (c.minGapPips !== undefined && !isNum(c.minGapPips, 0, 100000)) return `${label}: minGapPips out of range`;
    const cmp = c.compare;
    if (!cmp || !['value', 'indicator', 'price'].includes(cmp.kind)) return `${label}: bad compare target`;
    if (cmp.kind === 'value' && !isNum(cmp.value, -1e9, 1e9)) return `${label}: compare value must be a number`;
    if (cmp.kind === 'indicator' && cmp.indicatorId !== 'price' && !indicatorIds.has(cmp.indicatorId)) {
      return `${label}: unknown compare indicator "${cmp.indicatorId}"`;
    }
  }
  return null;
}

export function validateStrategySpec(x: any): { ok: true; spec: StrategySpec } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'spec must be an object' };
  const s = x as StrategySpec;
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) return { ok: false, error: 'name is required (max 80 chars)' };
  if (s.source !== 'template' && s.source !== 'builder' && s.source !== 'engine') return { ok: false, error: "source must be 'template', 'builder' or 'engine'" };
  const isEngineNative = s.source === 'engine';
  if (isEngineNative && !(ENGINE_STRATEGY_KEYS as readonly string[]).includes(s.engineStrategyKey ?? '')) {
    return { ok: false, error: 'engine source needs a valid engineStrategyKey' };
  }
  if (typeof s.symbol !== 'string' || !/^[A-Za-z0-9./_-]{3,15}$/.test(s.symbol)) return { ok: false, error: 'bad symbol' };
  if (!TIMEFRAMES.includes(s.timeframe)) return { ok: false, error: 'bad timeframe' };
  if (!Array.isArray(s.indicators) || s.indicators.length > 10) return { ok: false, error: 'indicators: max 10' };

  const ids = new Set<string>();
  for (const ind of s.indicators) {
    if (!ind.id || typeof ind.id !== 'string' || ids.has(ind.id)) return { ok: false, error: 'indicator ids must be unique strings' };
    ids.add(ind.id);
    if (!INDICATOR_CATALOG.some((c) => c.kind === ind.kind)) return { ok: false, error: `bad indicator kind "${ind.kind}"` };
    if (ind.period !== undefined && !isNum(ind.period, 1, 500)) return { ok: false, error: 'indicator period out of range' };
    if (ind.fastPeriod !== undefined && !isNum(ind.fastPeriod, 1, 500)) return { ok: false, error: 'fastPeriod out of range' };
    if (ind.slowPeriod !== undefined && !isNum(ind.slowPeriod, 1, 500)) return { ok: false, error: 'slowPeriod out of range' };
    if (ind.signalPeriod !== undefined && !isNum(ind.signalPeriod, 1, 100)) return { ok: false, error: 'signalPeriod out of range' };
    if (ind.stdDev !== undefined && !isNum(ind.stdDev, 0.1, 10)) return { ok: false, error: 'stdDev out of range' };
    if (ind.sourceId !== undefined && (typeof ind.sourceId !== 'string' || ind.sourceId === ind.id)) return { ok: false, error: 'sourceId must name another indicator' };
    if (ind.lookbackBars !== undefined && !isNum(ind.lookbackBars, 10, 1000)) return { ok: false, error: 'lookbackBars out of range' };
    if (ind.valueAreaPct !== undefined && !isNum(ind.valueAreaPct, 10, 100)) return { ok: false, error: 'valueAreaPct out of range' };
    if (ind.pivotLeft !== undefined && !isNum(ind.pivotLeft, 1, 50)) return { ok: false, error: 'pivotLeft out of range' };
    if (ind.pivotRight !== undefined && !isNum(ind.pivotRight, 1, 50)) return { ok: false, error: 'pivotRight out of range' };
    if (ind.sessionStartHourUtc !== undefined && !isNum(ind.sessionStartHourUtc, 0, 23)) return { ok: false, error: 'sessionStartHourUtc out of range' };
    if (ind.sessionStartMinuteUtc !== undefined && !isNum(ind.sessionStartMinuteUtc, 0, 59)) return { ok: false, error: 'sessionStartMinuteUtc out of range' };
    if (ind.rangeMinutes !== undefined && !isNum(ind.rangeMinutes, 1, 720)) return { ok: false, error: 'rangeMinutes out of range' };
  }
  for (const ind of s.indicators) {
    if (ind.sourceId !== undefined && !ids.has(ind.sourceId)) return { ok: false, error: `sourceId "${ind.sourceId}" is not an indicator` };
    if (ind.sourceId !== undefined && ind.kind !== 'EMA' && ind.kind !== 'SMA') return { ok: false, error: 'only EMA/SMA can smooth another indicator' };
  }

  for (const [label, g] of [['entryLong', s.entryLong], ['entryShort', s.entryShort]] as const) {
    const err = validateGroup(g, ids, label, isEngineNative);
    if (err) return { ok: false, error: err };
  }
  for (const [label, g] of [['exitLong', s.exitLong], ['exitShort', s.exitShort]] as const) {
    if (g == null) continue;
    const err = validateGroup(g, ids, label);
    if (err) return { ok: false, error: err };
  }

  if (s.trendFilter != null) {
    const tf = s.trendFilter;
    if (!TIMEFRAMES.includes(tf.timeframe)) return { ok: false, error: 'trendFilter: bad timeframe' };
    if (TF_MINUTES[tf.timeframe] <= TF_MINUTES[s.timeframe]) {
      return { ok: false, error: 'trendFilter timeframe must be HIGHER than the strategy timeframe' };
    }
    if (tf.timeframe === 'D1' && s.timeframe !== 'H4' && s.timeframe !== 'H1') {
      // resampling needs an integer bar ratio; D1 from intraday is fine (24h buckets)
    }
    for (const [label, g] of [['trendFilter.long', tf.longGroup], ['trendFilter.short', tf.shortGroup]] as const) {
      if (g == null) continue;
      const err = validateGroup(g, ids, label);
      if (err) return { ok: false, error: err };
    }
    if (!tf.longGroup?.conditions?.length && !tf.shortGroup?.conditions?.length) {
      return { ok: false, error: 'trendFilter needs at least one filter group' };
    }
  }
  if (s.sessionFilter != null) {
    const sf = s.sessionFilter;
    if (!isNum(sf.startHourUtc, 0, 23) || !isNum(sf.endHourUtc, 0, 24)) return { ok: false, error: 'sessionFilter hours out of range' };
    if (sf.daysUtc !== undefined && (!Array.isArray(sf.daysUtc) || sf.daysUtc.some((d) => !isNum(d, 0, 6)))) {
      return { ok: false, error: 'sessionFilter days must be 0–6' };
    }
  }

  const r = s.risk;
  if (!r || !isNum(r.lotSize, 0.01, 50)) return { ok: false, error: 'risk.lotSize must be 0.01–50' };
  for (const k of ['stopLossPips', 'takeProfitPips', 'trailingStopPips', 'breakevenTriggerPips', 'breakevenOffsetPips'] as const) {
    if (r[k] != null && !isNum(r[k], 0, 100000)) return { ok: false, error: `risk.${k} out of range` };
  }
  for (const k of ['stopLossAtrMult', 'takeProfitAtrMult'] as const) {
    if (r[k] != null && !isNum(r[k], 0, 100)) return { ok: false, error: `risk.${k} out of range` };
  }
  if (r.maxTradesPerDay != null && !isNum(r.maxTradesPerDay, 1, 1000)) return { ok: false, error: 'risk.maxTradesPerDay out of range' };
  if ((r.stopLossAtrMult != null || r.takeProfitAtrMult != null) && !s.indicators.some((i) => i.kind === 'ATR')) {
    return { ok: false, error: 'ATR-based stops need an ATR indicator in the spec' };
  }
  if (!isEngineNative && r.stopLossPips == null && r.stopLossAtrMult == null && r.takeProfitPips == null && r.takeProfitAtrMult == null) {
    return { ok: false, error: 'a strategy needs at least a stop loss or a take profit' };
  }

  return { ok: true, spec: { ...s, symbol: s.symbol.toUpperCase(), name: s.name.trim() } };
}

/** Bars of warmup the slowest indicator in the spec needs before bar 0 can be evaluated. */
export function specWarmupBars(spec: StrategySpec): number {
  let w = 2;
  for (const ind of spec.indicators) {
    const need =
      ind.kind === 'MACD' ? (ind.slowPeriod ?? 26) + (ind.signalPeriod ?? 9)
      : ind.kind === 'STOCHASTIC' ? (ind.period ?? 14) + (ind.signalPeriod ?? 3)
      : ind.kind === 'ICHIMOKU' ? (ind.slowPeriod ?? 52) + (ind.fastPeriod ?? 26)
      : ind.kind === 'VOLUME_PROFILE' || ind.kind === 'FVG' || ind.kind === 'ORDER_BLOCK' ? (ind.lookbackBars ?? 100)
      : ind.kind === 'SWINGS' ? (ind.pivotLeft ?? 3) + (ind.pivotRight ?? 3) + 10
      : ind.kind === 'ORB' || ind.kind === 'PIVOTS' || ind.kind === 'VWAP' ? 2
      : (ind.period ?? 14);
    w = Math.max(w, need + 2);
  }
  // A higher-timeframe filter consumes base bars at the TF ratio.
  if (spec.trendFilter) {
    const ratio = Math.max(1, Math.round(TF_MINUTES[spec.trendFilter.timeframe] / TF_MINUTES[spec.timeframe]));
    let htfWarm = 2;
    for (const ind of spec.indicators) {
      const need = ind.kind === 'MACD' ? (ind.slowPeriod ?? 26) + (ind.signalPeriod ?? 9) : (ind.period ?? 14);
      htfWarm = Math.max(htfWarm, need + 2);
    }
    w = Math.max(w, htfWarm * ratio + ratio);
  }
  return w;
}
