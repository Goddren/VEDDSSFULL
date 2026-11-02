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

export type IndicatorKind = 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'STOCHASTIC' | 'BOLLINGER' | 'ATR';
export type StrategyTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface IndicatorConfig {
  id: string;                 // unique within the spec, referenced by conditions
  kind: IndicatorKind;
  period?: number;            // EMA/SMA/RSI/ATR/Bollinger lookback; stochastic %K period
  fastPeriod?: number;        // MACD
  slowPeriod?: number;        // MACD
  signalPeriod?: number;      // MACD signal / stochastic %D smoothing
  stdDev?: number;            // Bollinger
}

export type ConditionField = 'value' | 'signal' | 'histogram' | 'upper' | 'middle' | 'lower' | 'k' | 'd' | 'price';
export type ConditionOperator = 'crosses_above' | 'crosses_below' | 'above' | 'below' | 'rising' | 'falling';

export type ConditionCompare =
  | { kind: 'value'; value: number }
  | { kind: 'indicator'; indicatorId: string; field: ConditionField }
  | { kind: 'price' };

export interface Condition {
  /** Indicator config id, or the literal 'price' for the close series. */
  indicatorId: string;
  field: ConditionField;
  operator: ConditionOperator;
  compare: ConditionCompare;  // ignored for rising/falling
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
}

export interface StrategySpec {
  name: string;
  source: 'template' | 'builder';
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
];

const TIMEFRAMES: StrategyTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const OPERATORS: ConditionOperator[] = ['crosses_above', 'crosses_below', 'above', 'below', 'rising', 'falling'];
const FIELDS: ConditionField[] = ['value', 'signal', 'histogram', 'upper', 'middle', 'lower', 'k', 'd', 'price'];

function isNum(x: any, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
}

function validateGroup(g: any, indicatorIds: Set<string>, label: string): string | null {
  if (!g || (g.logic !== 'AND' && g.logic !== 'OR')) return `${label}: logic must be AND or OR`;
  if (!Array.isArray(g.conditions) || g.conditions.length < 1 || g.conditions.length > 6) {
    return `${label}: needs 1–6 conditions`;
  }
  for (const c of g.conditions as Condition[]) {
    if (c.indicatorId !== 'price' && !indicatorIds.has(c.indicatorId)) {
      return `${label}: unknown indicator "${c.indicatorId}"`;
    }
    if (!FIELDS.includes(c.field)) return `${label}: bad field "${c.field}"`;
    if (!OPERATORS.includes(c.operator)) return `${label}: bad operator "${c.operator}"`;
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
  if (s.source !== 'template' && s.source !== 'builder') return { ok: false, error: "source must be 'template' or 'builder'" };
  if (typeof s.symbol !== 'string' || !/^[A-Za-z0-9./_-]{3,15}$/.test(s.symbol)) return { ok: false, error: 'bad symbol' };
  if (!TIMEFRAMES.includes(s.timeframe)) return { ok: false, error: 'bad timeframe' };
  if (!Array.isArray(s.indicators) || s.indicators.length > 8) return { ok: false, error: 'indicators: max 8' };

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
  }

  for (const [label, g] of [['entryLong', s.entryLong], ['entryShort', s.entryShort]] as const) {
    const err = validateGroup(g, ids, label);
    if (err) return { ok: false, error: err };
  }
  for (const [label, g] of [['exitLong', s.exitLong], ['exitShort', s.exitShort]] as const) {
    if (g == null) continue;
    const err = validateGroup(g, ids, label);
    if (err) return { ok: false, error: err };
  }

  const r = s.risk;
  if (!r || !isNum(r.lotSize, 0.01, 50)) return { ok: false, error: 'risk.lotSize must be 0.01–50' };
  for (const k of ['stopLossPips', 'takeProfitPips', 'trailingStopPips'] as const) {
    if (r[k] != null && !isNum(r[k], 0, 100000)) return { ok: false, error: `risk.${k} out of range` };
  }
  for (const k of ['stopLossAtrMult', 'takeProfitAtrMult'] as const) {
    if (r[k] != null && !isNum(r[k], 0, 100)) return { ok: false, error: `risk.${k} out of range` };
  }
  if (r.maxTradesPerDay != null && !isNum(r.maxTradesPerDay, 1, 1000)) return { ok: false, error: 'risk.maxTradesPerDay out of range' };
  if ((r.stopLossAtrMult != null || r.takeProfitAtrMult != null) && !s.indicators.some((i) => i.kind === 'ATR')) {
    return { ok: false, error: 'ATR-based stops need an ATR indicator in the spec' };
  }
  if (r.stopLossPips == null && r.stopLossAtrMult == null && r.takeProfitPips == null && r.takeProfitAtrMult == null) {
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
      : (ind.period ?? 14);
    w = Math.max(w, need + 2);
  }
  return w;
}
