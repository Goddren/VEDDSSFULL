/**
 * StrategySpec → MT5 EA compiler.
 *
 * Emits a complete .mq5 in the SAME structure as the app's existing EA
 * generator (generateMT5EACode in ea-generators.ts): grouped inputs,
 * OnInit/OnTick, raw MqlTradeRequest/OrderSend execution, ATR/pip stops,
 * trailing management, magic number. The difference is the signal core:
 * instead of AI chart-analysis conditions, the EA compiles the wizard
 * spec's actual indicator rules — so the EA trades exactly what the
 * backtester replayed.
 *
 * Semantics matched to strategy-backtest.ts:
 *  - Entries/exits evaluate on the last CLOSED bar (shift 1; crosses
 *    compare shifts 1 and 2), once per new bar.
 *  - One position at a time for this EA's magic + symbol.
 *  - SL/TP are set on the order (broker-side), trailing ratchets on tick.
 *  - Pip sizes mirror server/utils/pipUtils.ts.
 */
import type { StrategySpec, Condition, ConditionGroup } from './strategy-spec';

const TF_CONST: Record<string, string> = {
  M1: 'PERIOD_M1', M5: 'PERIOD_M5', M15: 'PERIOD_M15', M30: 'PERIOD_M30',
  H1: 'PERIOD_H1', H4: 'PERIOD_H4', D1: 'PERIOD_D1',
};

function deterministicMagic(spec: StrategySpec): number {
  const s = `${spec.name}|${spec.symbol}|${spec.timeframe}`;
  let h = 7;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return 10000 + (h % 90000);
}

function sanitize(name: string): string {
  return name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Strategy';
}

/** Buffer index per indicator field in MQL5. MACD histogram is computed. */
const BUFFER_INDEX: Record<string, Record<string, number>> = {
  EMA: { value: 0 }, SMA: { value: 0 }, RSI: { value: 0 }, ATR: { value: 0 },
  MACD: { value: 0, signal: 1 },
  STOCHASTIC: { k: 0, d: 1, value: 0 },
  BOLLINGER: { middle: 0, upper: 1, lower: 2, value: 0 },
  ADX: { value: 0, plus: 1, minus: 2 },
  CCI: { value: 0 },
  WILLIAMS_R: { value: 0 },
  ICHIMOKU: { tenkan: 0, kijun: 1, span_a: 2, span_b: 3, value: 1 },
};

/** Kinds computed from raw rates inside the EA (no MQL5 built-in buffer):
 *  their series arrays are filled by a compute pass in RefreshSeries. */
const CUSTOM_COMPUTE = new Set(['VWAP', 'DONCHIAN', 'SUPERTREND', 'PIVOTS']);

/** Features the EA cannot faithfully reproduce — refused, never faked.
 *  These run in the backtester and the server deployment runner instead. */
export function eaCompileCheck(spec: StrategySpec): string | null {
  const hard = spec.indicators.find((i) => ['VOLUME_PROFILE', 'ORB', 'SWINGS', 'FVG', 'ORDER_BLOCK'].includes(i.kind));
  if (hard) {
    return `The MT5 EA cannot reproduce ${hard.kind} faithfully (it needs the server's bar-history analysis). This strategy backtests and deploys through the VEDD runner — use Deploy to Account instead of the EA download.`;
  }
  if (spec.indicators.some((i) => i.sourceId)) {
    return 'The MT5 EA cannot reproduce indicator-on-indicator smoothing (sourceId). This strategy backtests and deploys through the VEDD runner.';
  }
  if (spec.trendFilter) {
    return 'The MT5 EA cannot reproduce the multi-timeframe trend filter. This strategy backtests and deploys through the VEDD runner — use Deploy to Account instead of the EA download.';
  }
  return null;
}

interface SeriesRef { id: string; field: string }

function collectRefs(spec: StrategySpec): SeriesRef[] {
  const seen = new Map<string, SeriesRef>();
  const add = (id: string, field: string) => {
    if (id === 'price') return;
    const key = `${id}:${field}`;
    if (!seen.has(key)) seen.set(key, { id, field });
  };
  const walk = (g: ConditionGroup | null | undefined) => {
    if (!g) return;
    for (const c of g.conditions) {
      add(c.indicatorId, c.field);
      if (c.compare.kind === 'indicator') add(c.compare.indicatorId, c.compare.field);
    }
  };
  walk(spec.entryLong); walk(spec.entryShort); walk(spec.exitLong); walk(spec.exitShort);
  return Array.from(seen.values());
}

const seriesFn = (id: string, field: string) => `S_${id}_${field}`;

function valueExpr(indicatorId: string, field: string, shift: number): string {
  if (indicatorId === 'price') return `iClose(_Symbol, InpTimeframe, ${shift})`;
  return `${seriesFn(indicatorId, field)}(${shift})`;
}

function rhsExpr(c: Condition, shift: number): string {
  if (c.compare.kind === 'value') return `(${c.compare.value})`;
  if (c.compare.kind === 'price') return `iClose(_Symbol, InpTimeframe, ${shift})`;
  return valueExpr(c.compare.indicatorId, c.compare.field, shift);
}

function conditionExprAt(c: Condition, s: number): string {
  const L = (sh: number) => valueExpr(c.indicatorId, c.field, sh);
  const R = (sh: number) => rhsExpr(c, sh);
  const gap = c.minGapPips ? ` + ${c.minGapPips} * PipSize()` : '';
  const gapNeg = c.minGapPips ? ` - ${c.minGapPips} * PipSize()` : '';
  switch (c.operator) {
    case 'above': return `(${L(s)} > ${R(s)}${gap})`;
    case 'below': return `(${L(s)} < ${R(s)}${gapNeg})`;
    case 'crosses_above': return `(${L(s + 1)} <= ${R(s + 1)} && ${L(s)} > ${R(s)}${gap})`;
    case 'crosses_below': return `(${L(s + 1)} >= ${R(s + 1)} && ${L(s)} < ${R(s)}${gapNeg})`;
    case 'rising': return `(${L(s)} > ${L(s + 1)})`;
    case 'falling': return `(${L(s)} < ${L(s + 1)})`;
    case 'turns_up': return `(${L(s + 1)} <= ${L(s + 2)} && ${L(s)} > ${L(s + 1)})`;
    case 'turns_down': return `(${L(s + 1)} >= ${L(s + 2)} && ${L(s)} < ${L(s + 1)})`;
  }
}

function conditionExpr(c: Condition): string {
  const sustain = Math.max(1, Math.floor(c.sustainBars ?? 1));
  const parts: string[] = [];
  for (let k = 0; k < sustain; k++) parts.push(conditionExprAt(c, 1 + k));
  return parts.length === 1 ? parts[0] : `(${parts.join(' && ')})`;
}

function groupExpr(g: ConditionGroup | null | undefined): string | null {
  if (!g || g.conditions.length === 0) return null;
  const joiner = g.logic === 'AND' ? ' && ' : ' || ';
  return `(${g.conditions.map(conditionExpr).join(joiner)})`;
}

export function generateSpecMT5EA(spec: StrategySpec): { code: string; filename: string; magicNumber: number } {
  const unsupported = eaCompileCheck(spec);
  if (unsupported) throw new Error(unsupported);
  const magic = deterministicMagic(spec);
  const refs = collectRefs(spec);
  let maxSustain = 1;
  const scanSustain = (g: ConditionGroup | null | undefined) => { for (const c of g?.conditions ?? []) maxSustain = Math.max(maxSustain, Math.floor(c.sustainBars ?? 1)); };
  scanSustain(spec.entryLong); scanSustain(spec.entryShort); scanSustain(spec.exitLong); scanSustain(spec.exitShort);
  const copyDepth = Math.min(90, 12 + maxSustain);
  const customInds = spec.indicators.filter((i) => CUSTOM_COMPUTE.has(i.kind));
  const hasCustom = customInds.length > 0;
  const atrInd = spec.indicators.find((i) => i.kind === 'ATR');
  const useAtrStops = (spec.risk.stopLossAtrMult != null || spec.risk.takeProfitAtrMult != null) && !!atrInd;
  if (useAtrStops && !refs.some((r) => r.id === atrInd!.id && r.field === 'value')) {
    refs.push({ id: atrInd!.id, field: 'value' });
  }

  const indById = new Map(spec.indicators.map((i) => [i.id, i]));
  // A MACD histogram reference needs the value + signal series too
  // (histogram is computed from them after copying).
  for (const ref of [...refs]) {
    if (indById.get(ref.id)?.kind === 'MACD') {
      for (const f of ['value', 'signal']) {
        if (!refs.some((r) => r.id === ref.id && r.field === f)) refs.push({ id: ref.id, field: f });
      }
    }
  }
  const handleDecls: string[] = [];
  const bufferDecls: string[] = [];
  const handleInits: string[] = [];
  const copyCalls: string[] = [];
  const getters: string[] = [];

  for (const ind of spec.indicators) {
    const h = `h_${ind.id}`;
    if (CUSTOM_COMPUTE.has(ind.kind)) {
      // The compute pass owns these arrays: declare every field the kind
      // exposes (the compute writes them all, referenced or not).
      const fieldsByKind: Record<string, string[]> = {
        VWAP: ['value'],
        DONCHIAN: ['upper', 'middle', 'lower', 'value'],
        SUPERTREND: ['value'],
        PIVOTS: ['pp', 'r1', 'r2', 's1', 's2', 'value'],
      };
      for (const f of fieldsByKind[ind.kind] ?? ['value']) bufferDecls.push(`double g_${ind.id}_${f}[];`);
      // No built-in handle; SUPERTREND needs an ATR helper handle.
      if (ind.kind === 'SUPERTREND') {
        handleDecls.push(`int ${h}_atr = INVALID_HANDLE;`);
        bufferDecls.push(`double g_${ind.id}_atrbuf[];`);
        handleInits.push(`   ${h}_atr = iATR(_Symbol, InpTimeframe, ${ind.period ?? 10});\n   if(${h}_atr == INVALID_HANDLE) { Print("VEDD: failed to create SUPERTREND ATR handle"); return INIT_FAILED; }`);
        copyCalls.push(`   if(CopyBuffer(${h}_atr, 0, 0, 300, g_${ind.id}_atrbuf) < 50) return false;\n   ArraySetAsSeries(g_${ind.id}_atrbuf, true);`);
      }
      continue;
    }
    handleDecls.push(`int ${h} = INVALID_HANDLE;`);
    let init = '';
    switch (ind.kind) {
      case 'EMA': init = `iMA(_Symbol, InpTimeframe, ${ind.period ?? 21}, 0, MODE_EMA, PRICE_CLOSE)`; break;
      case 'SMA': init = `iMA(_Symbol, InpTimeframe, ${ind.period ?? 50}, 0, MODE_SMA, PRICE_CLOSE)`; break;
      case 'RSI': init = `iRSI(_Symbol, InpTimeframe, ${ind.period ?? 14}, PRICE_CLOSE)`; break;
      case 'ATR': init = `iATR(_Symbol, InpTimeframe, ${ind.period ?? 14})`; break;
      case 'MACD': init = `iMACD(_Symbol, InpTimeframe, ${ind.fastPeriod ?? 12}, ${ind.slowPeriod ?? 26}, ${ind.signalPeriod ?? 9}, PRICE_CLOSE)`; break;
      case 'STOCHASTIC': init = `iStochastic(_Symbol, InpTimeframe, ${ind.period ?? 14}, ${ind.signalPeriod ?? 3}, 1, MODE_SMA, STO_LOWHIGH)`; break;
      case 'BOLLINGER': init = `iBands(_Symbol, InpTimeframe, ${ind.period ?? 20}, 0, ${ind.stdDev ?? 2}, PRICE_CLOSE)`; break;
      case 'ADX': init = `iADX(_Symbol, InpTimeframe, ${ind.period ?? 14})`; break;
      case 'CCI': init = `iCCI(_Symbol, InpTimeframe, ${ind.period ?? 20}, PRICE_TYPICAL)`; break;
      case 'WILLIAMS_R': init = `iWPR(_Symbol, InpTimeframe, ${ind.period ?? 14})`; break;
      case 'ICHIMOKU': init = `iIchimoku(_Symbol, InpTimeframe, ${ind.period ?? 9}, ${ind.fastPeriod ?? 26}, ${ind.slowPeriod ?? 52})`; break;
    }
    handleInits.push(`   ${h} = ${init};\n   if(${h} == INVALID_HANDLE) { Print("VEDD: failed to create ${ind.kind} handle"); return INIT_FAILED; }`);
  }

  for (const ref of refs) {
    const ind = indById.get(ref.id);
    if (!ind) continue;
    const arr = `g_${ref.id}_${ref.field}`;
    if (!CUSTOM_COMPUTE.has(ind.kind)) bufferDecls.push(`double ${arr}[];`);
    if (ind.kind === 'MACD' && ref.field === 'histogram') {
      // histogram = main - signal, computed after both are copied
      copyCalls.push(`   // histogram for ${ref.id} computed below`);
    } else if (CUSTOM_COMPUTE.has(ind.kind)) {
      copyCalls.push(`   // ${ref.id}:${ref.field} filled by Compute_${ref.id}() below`);
    } else {
      const bufIdx = BUFFER_INDEX[ind.kind]?.[ref.field] ?? 0;
      copyCalls.push(`   if(CopyBuffer(h_${ref.id}, ${bufIdx}, 0, ${copyDepth}, ${arr}) < 4) return false;\n   ArraySetAsSeries(${arr}, true);`);
    }
    getters.push(`double ${seriesFn(ref.id, ref.field)}(int shift) { return g_${ref.id}_${ref.field}[shift]; }`);
  }
  const hasHistogram = refs.some((r) => indById.get(r.id)?.kind === 'MACD' && r.field === 'histogram');
  const histogramCode = hasHistogram ? (() => {
    const mid = refs.find((r) => indById.get(r.id)?.kind === 'MACD' && r.field === 'histogram')!.id;
    return `\n   // MACD histogram = main - signal\n   if(ArraySize(g_${mid}_value) >= 3 && ArraySize(g_${mid}_signal) >= 3) {\n      ArrayResize(g_${mid}_histogram, ArraySize(g_${mid}_value));\n      ArraySetAsSeries(g_${mid}_histogram, true);\n      for(int i = 0; i < ArraySize(g_${mid}_value); i++) g_${mid}_histogram[i] = g_${mid}_value[i] - g_${mid}_signal[i];\n   }`;
  })() : '';

  // Rates-computed series (VWAP / Donchian / Supertrend / Pivots): filled
  // from the last 300 bars each refresh — same formulas as the backtester.
  const computeFns: string[] = [];
  for (const ind of customInds) {
    if (ind.kind === 'VWAP') {
      computeFns.push(`void Compute_${ind.id}()
{
   int n = ArraySize(g_rates);
   ArrayResize(g_${ind.id}_value, n); ArraySetAsSeries(g_${ind.id}_value, true);
   double cumPV = 0, cumV = 0; long day = -1;
   for(int i = n - 1; i >= 0; i--)
   {
      long d = (long)g_rates[i].time / 86400;
      if(d != day) { day = d; cumPV = 0; cumV = 0; }
      double tp = (g_rates[i].high + g_rates[i].low + g_rates[i].close) / 3.0;
      double v = (double)g_rates[i].tick_volume;
      cumPV += tp * v; cumV += v;
      g_${ind.id}_value[i] = cumV > 0 ? cumPV / cumV : EMPTY_VALUE;
   }
}`);
    } else if (ind.kind === 'DONCHIAN') {
      const period = ind.period ?? 20;
      computeFns.push(`void Compute_${ind.id}()
{
   int n = ArraySize(g_rates);
   ArrayResize(g_${ind.id}_upper, n); ArrayResize(g_${ind.id}_lower, n); ArrayResize(g_${ind.id}_middle, n); ArrayResize(g_${ind.id}_value, n);
   ArraySetAsSeries(g_${ind.id}_upper, true); ArraySetAsSeries(g_${ind.id}_lower, true); ArraySetAsSeries(g_${ind.id}_middle, true); ArraySetAsSeries(g_${ind.id}_value, true);
   for(int i = 0; i < n; i++)
   {
      if(i + ${period} >= n) { g_${ind.id}_upper[i] = EMPTY_VALUE; g_${ind.id}_lower[i] = EMPTY_VALUE; g_${ind.id}_middle[i] = EMPTY_VALUE; g_${ind.id}_value[i] = EMPTY_VALUE; continue; }
      double hh = -DBL_MAX, ll = DBL_MAX;
      for(int k = 1; k <= ${period}; k++) { hh = MathMax(hh, g_rates[i + k].high); ll = MathMin(ll, g_rates[i + k].low); }
      g_${ind.id}_upper[i] = hh; g_${ind.id}_lower[i] = ll; g_${ind.id}_middle[i] = (hh + ll) / 2.0; g_${ind.id}_value[i] = (hh + ll) / 2.0;
   }
}`);
    } else if (ind.kind === 'PIVOTS') {
      computeFns.push(`void Compute_${ind.id}()
{
   int n = ArraySize(g_rates);
   ArrayResize(g_${ind.id}_pp, n); ArrayResize(g_${ind.id}_r1, n); ArrayResize(g_${ind.id}_r2, n); ArrayResize(g_${ind.id}_s1, n); ArrayResize(g_${ind.id}_s2, n); ArrayResize(g_${ind.id}_value, n);
   ArraySetAsSeries(g_${ind.id}_pp, true); ArraySetAsSeries(g_${ind.id}_r1, true); ArraySetAsSeries(g_${ind.id}_r2, true); ArraySetAsSeries(g_${ind.id}_s1, true); ArraySetAsSeries(g_${ind.id}_s2, true); ArraySetAsSeries(g_${ind.id}_value, true);
   long day = -1; double cH = -DBL_MAX, cL = DBL_MAX, pH = 0, pL = 0, pC = 0; bool have = false;
   double pp = 0, r1 = 0, r2 = 0, s1 = 0, s2 = 0;
   for(int i = n - 1; i >= 0; i--)
   {
      long d = (long)g_rates[i].time / 86400;
      if(d != day)
      {
         if(day != -1) { pH = cH; pL = cL; pC = g_rates[i + 1].close; double p = (pH + pL + pC) / 3.0; pp = p; r1 = 2*p - pL; s1 = 2*p - pH; r2 = p + (pH - pL); s2 = p - (pH - pL); have = true; }
         day = d; cH = -DBL_MAX; cL = DBL_MAX;
      }
      g_${ind.id}_pp[i] = have ? pp : EMPTY_VALUE; g_${ind.id}_r1[i] = have ? r1 : EMPTY_VALUE; g_${ind.id}_r2[i] = have ? r2 : EMPTY_VALUE; g_${ind.id}_s1[i] = have ? s1 : EMPTY_VALUE; g_${ind.id}_s2[i] = have ? s2 : EMPTY_VALUE; g_${ind.id}_value[i] = g_${ind.id}_pp[i];
      cH = MathMax(cH, g_rates[i].high); cL = MathMin(cL, g_rates[i].low);
   }
}`);
    } else if (ind.kind === 'SUPERTREND') {
      const mult = ind.stdDev ?? 3;
      computeFns.push(`void Compute_${ind.id}()
{
   int n = MathMin(ArraySize(g_rates), ArraySize(g_${ind.id}_atrbuf));
   ArrayResize(g_${ind.id}_value, n); ArraySetAsSeries(g_${ind.id}_value, true);
   double prevUB = 0, prevLB = 0, prevST = 0, prevClose = 0;
   for(int i = n - 1; i >= 0; i--)
   {
      double a = g_${ind.id}_atrbuf[i];
      if(a == EMPTY_VALUE || a <= 0) { g_${ind.id}_value[i] = EMPTY_VALUE; continue; }
      double mid = (g_rates[i].high + g_rates[i].low) / 2.0;
      double ub = mid + ${mult} * a;
      double lb = mid - ${mult} * a;
      if(prevUB != 0) { ub = (ub < prevUB || prevClose > prevUB) ? ub : prevUB; lb = (lb > prevLB || prevClose < prevLB) ? lb : prevLB; }
      double st;
      if(prevST == prevUB && prevUB != 0) st = g_rates[i].close <= ub ? ub : lb;
      else if(prevST == prevLB && prevLB != 0) st = g_rates[i].close >= lb ? lb : ub;
      else st = g_rates[i].close <= ub ? ub : lb;
      g_${ind.id}_value[i] = st;
      prevUB = ub; prevLB = lb; prevST = st; prevClose = g_rates[i].close;
   }
}`);
    }
  }
  const computeCalls = customInds.map((i) => `   Compute_${i.id}();`).join('\n');

  const entryLongExpr = groupExpr(spec.entryLong);
  const entryShortExpr = groupExpr(spec.entryShort);
  const exitLongExpr = groupExpr(spec.exitLong);
  const exitShortExpr = groupExpr(spec.exitShort);

  const r = spec.risk;
  const code = `//+------------------------------------------------------------------+
//|                                            VEDD_${sanitize(spec.name)}.mq5 |
//|  Generated by VEDD AI Trading Vault — Strategy Wizard            |
//|  Strategy : ${spec.name} (${spec.source}${spec.engineStrategyKey ? ` · engine: ${spec.engineStrategyKey}` : ''}${spec.templateId ? ` · template: ${spec.templateId}` : ''})
//|  Market   : ${spec.symbol} ${spec.timeframe} — attach to a ${spec.symbol} ${spec.timeframe} chart
//|                                                                  |
//|  These are the exact rules that were backtested in the wizard:   |
//|  signals evaluate on the last CLOSED bar, one position at a      |
//|  time, stops set on the order. Trailing ratchets on tick (the    |
//|  backtester trailed from prior-bar extremes — live is tighter).  |
//|  Past backtest results never guarantee live performance.         |
//+------------------------------------------------------------------+
#property strict
#property version   "1.00"
#property description "VEDD Strategy Wizard EA — ${spec.name.replace(/"/g, '')}"

//--- Inputs (structure follows the VEDD EA generator)
input group "=== Strategy ==="
input ENUM_TIMEFRAMES InpTimeframe = ${TF_CONST[spec.timeframe] ?? 'PERIOD_H1'}; // Signal timeframe

input group "=== Risk Management ==="
input double InpLotSize         = ${r.lotSize};       // Lot size
input double InpStopLossPips    = ${r.stopLossPips ?? 0};    // Stop loss in pips (0 = off${useAtrStops && r.stopLossPips == null ? ', ATR mode below' : ''})
input double InpTakeProfitPips  = ${r.takeProfitPips ?? 0};    // Take profit in pips (0 = off${useAtrStops && r.takeProfitPips == null ? ', ATR mode below' : ''})
${useAtrStops ? `input double InpStopLossAtrMult   = ${r.stopLossAtrMult ?? 0};    // Stop loss x ATR (0 = off)
input double InpTakeProfitAtrMult = ${r.takeProfitAtrMult ?? 0};    // Take profit x ATR (0 = off)` : ''}
input double InpTrailingStopPips = ${r.trailingStopPips ?? 0};   // Trailing stop in pips (0 = off)
input int    InpMaxTradesPerDay  = ${r.maxTradesPerDay ?? 0};   // Max entries per day (0 = no cap)
${r.breakevenTriggerPips ? `input double InpBreakevenTriggerPips = ${r.breakevenTriggerPips};   // Move stop to entry after this profit (pips)
input double InpBreakevenOffsetPips  = ${r.breakevenOffsetPips ?? 0};   // Breakeven stop offset from entry (pips)` : ''}
${spec.sessionFilter ? `input group "=== Session Filter (from the spec, UTC) ==="
input int    InpSessionStartHourUtc = ${spec.sessionFilter.startHourUtc};   // Entries from this UTC hour
input int    InpSessionEndHourUtc   = ${spec.sessionFilter.endHourUtc};   // Entries until this UTC hour (exclusive)
input string InpSessionDaysUtc      = "${(spec.sessionFilter.daysUtc && spec.sessionFilter.daysUtc.length ? spec.sessionFilter.daysUtc : [0, 1, 2, 3, 4, 5, 6]).join('')}";   // UTC weekdays allowed (0=Sun)
input int    InpServerUtcOffsetHours = 0;   // Your broker server's UTC offset (e.g. 2 or 3) so the UTC window lands right` : ''}

input group "=== Execution ==="
input long   InpMagicNumber     = ${magic};   // Magic number (stable for this strategy)
input int    InpSlippagePoints  = 30;         // Max slippage (points)

//--- Indicator handles
${handleDecls.join('\n')}

//--- Series buffers (index 0 = forming bar, 1 = last closed bar)
${bufferDecls.join('\n')}
${hasCustom ? '\n//--- Raw rates for the rates-computed series (VWAP / Donchian / Supertrend / Pivots)\nMqlRates g_rates[];' : ''}

${getters.join('\n')}
${computeFns.length ? `\n//--- Rates-computed series builders\n${computeFns.join('\n\n')}` : ''}
${spec.sessionFilter ? `
//+------------------------------------------------------------------+
//| Session filter from the spec (UTC window; broker offset input)   |
//+------------------------------------------------------------------+
bool InSession()
{
   datetime utcNow = TimeCurrent() - InpServerUtcOffsetHours * 3600;
   MqlDateTime dt; TimeToStruct(utcNow, dt);
   if(StringFind(InpSessionDaysUtc, IntegerToString(dt.day_of_week)) < 0) return false;
   if(InpSessionEndHourUtc > InpSessionStartHourUtc)
      return dt.hour >= InpSessionStartHourUtc && dt.hour < InpSessionEndHourUtc;
   return dt.hour >= InpSessionStartHourUtc || dt.hour < InpSessionEndHourUtc;
}` : ''}

//+------------------------------------------------------------------+
//| Pip size — mirrors the VEDD backtester (pipUtils)                |
//+------------------------------------------------------------------+
double PipSize()
{
   string s = _Symbol;
   if(StringFind(s, "JPY") >= 0) return 0.01;
   if(StringFind(s, "XAU") >= 0) return 0.1;
   if(StringFind(s, "XAG") >= 0) return 0.001;
   if(StringFind(s, "US30") >= 0 || StringFind(s, "NAS100") >= 0 || StringFind(s, "USTEC") >= 0 || StringFind(s, "US500") >= 0) return 1.0;
   if(StringFind(s, "BTC") >= 0) return 1.0;
   if(StringFind(s, "ETH") >= 0 || StringFind(s, "SOL") >= 0) return 0.01;
   if(StringFind(s, "XRP") >= 0) return 0.0001;
   return 0.0001;
}

//+------------------------------------------------------------------+
int OnInit()
{
${handleInits.join('\n')}
   Print("VEDD Wizard EA initialized: ${spec.name.replace(/"/g, '')} on ", _Symbol);
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason)
{
${spec.indicators.filter((i) => !CUSTOM_COMPUTE.has(i.kind)).map((i) => `   if(h_${i.id} != INVALID_HANDLE) IndicatorRelease(h_${i.id});`).join('\n')}
${spec.indicators.filter((i) => i.kind === 'SUPERTREND').map((i) => `   if(h_${i.id}_atr != INVALID_HANDLE) IndicatorRelease(h_${i.id}_atr);`).join('\n')}
}

//+------------------------------------------------------------------+
bool RefreshSeries()
{
${hasCustom ? `   if(CopyRates(_Symbol, InpTimeframe, 0, 300, g_rates) < 50) return false;\n   ArraySetAsSeries(g_rates, true);` : ''}
${copyCalls.join('\n')}${histogramCode}
${computeCalls}
   return true;
}

//+------------------------------------------------------------------+
//| Position helpers (this EA's magic + symbol only)                 |
//+------------------------------------------------------------------+
bool FindMyPosition(ulong &ticket, long &type, double &openPrice, double &sl, double &tp, double &volume)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != InpMagicNumber) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      type = PositionGetInteger(POSITION_TYPE);
      openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      sl = PositionGetDouble(POSITION_SL);
      tp = PositionGetDouble(POSITION_TP);
      volume = PositionGetDouble(POSITION_VOLUME);
      return true;
   }
   return false;
}

int EntriesToday()
{
   datetime dayStart = iTime(_Symbol, PERIOD_D1, 0);
   if(!HistorySelect(dayStart, TimeCurrent())) return 0;
   int count = 0;
   for(int i = 0; i < HistoryDealsTotal(); i++)
   {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      if(HistoryDealGetInteger(deal, DEAL_MAGIC) != InpMagicNumber) continue;
      if(HistoryDealGetString(deal, DEAL_SYMBOL) != _Symbol) continue;
      if(HistoryDealGetInteger(deal, DEAL_ENTRY) == DEAL_ENTRY_IN) count++;
   }
   return count;
}

bool SendOrder(ENUM_ORDER_TYPE type, double price, double sl, double tp)
{
   MqlTradeRequest req = {};
   MqlTradeResult  res = {};
   req.action    = TRADE_ACTION_DEAL;
   req.symbol    = _Symbol;
   req.volume    = InpLotSize;
   req.type      = type;
   req.price     = price;
   req.sl        = sl;
   req.tp        = tp;
   req.deviation = InpSlippagePoints;
   req.magic     = InpMagicNumber;
   req.comment   = "VEDD Wizard";
   req.type_filling = ORDER_FILLING_IOC;
   if(!OrderSend(req, res))
      Print("VEDD: OrderSend failed, retcode=", res.retcode, " ", res.comment);
   return (res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_PLACED);
}

bool ClosePosition(ulong ticket)
{
   if(!PositionSelectByTicket(ticket)) return false;
   long type = PositionGetInteger(POSITION_TYPE);
   double volume = PositionGetDouble(POSITION_VOLUME);
   MqlTradeRequest req = {};
   MqlTradeResult  res = {};
   req.action    = TRADE_ACTION_DEAL;
   req.symbol    = _Symbol;
   req.volume    = volume;
   req.position  = ticket;
   req.magic     = InpMagicNumber;
   req.deviation = InpSlippagePoints;
   req.comment   = "VEDD Wizard exit";
   req.type_filling = ORDER_FILLING_IOC;
   if(type == POSITION_TYPE_BUY) { req.type = ORDER_TYPE_SELL; req.price = SymbolInfoDouble(_Symbol, SYMBOL_BID); }
   else                          { req.type = ORDER_TYPE_BUY;  req.price = SymbolInfoDouble(_Symbol, SYMBOL_ASK); }
   if(!OrderSend(req, res))
      Print("VEDD: close failed, retcode=", res.retcode, " ", res.comment);
   return (res.retcode == TRADE_RETCODE_DONE);
}

bool ModifySL(ulong ticket, double newSL, double tp)
{
   MqlTradeRequest req = {};
   MqlTradeResult  res = {};
   req.action   = TRADE_ACTION_SLTP;
   req.symbol   = _Symbol;
   req.position = ticket;
   req.sl       = newSL;
   req.tp       = tp;
   req.magic    = InpMagicNumber;
   if(!OrderSend(req, res))
      Print("VEDD: modify failed, retcode=", res.retcode, " ", res.comment);
   return (res.retcode == TRADE_RETCODE_DONE);
}

//+------------------------------------------------------------------+
void ManageTrailing(ulong ticket, long type, double currentSL, double tp)
{
   if(InpTrailingStopPips <= 0) return;
   double dist = InpTrailingStopPips * PipSize();
   double digits = (double)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   if(type == POSITION_TYPE_BUY)
   {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double candidate = NormalizeDouble(bid - dist, (int)digits);
      if(candidate > currentSL + _Point) ModifySL(ticket, candidate, tp);
   }
   else
   {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double candidate = NormalizeDouble(ask + dist, (int)digits);
      if(currentSL == 0 || candidate < currentSL - _Point) ModifySL(ticket, candidate, tp);
   }
}

${r.breakevenTriggerPips ? `//+------------------------------------------------------------------+
void ManageBreakeven(ulong ticket, long type, double openPrice, double currentSL, double tp)
{
   double trig = InpBreakevenTriggerPips * PipSize();
   double off = InpBreakevenOffsetPips * PipSize();
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   if(type == POSITION_TYPE_BUY)
   {
      double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      if(bid - openPrice >= trig)
      {
         double cand = NormalizeDouble(openPrice + off, digits);
         if(cand > currentSL + _Point) ModifySL(ticket, cand, tp);
      }
   }
   else
   {
      double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      if(openPrice - ask >= trig)
      {
         double cand = NormalizeDouble(openPrice - off, digits);
         if(currentSL == 0 || cand < currentSL - _Point) ModifySL(ticket, cand, tp);
      }
   }
}

` : ''}//+------------------------------------------------------------------+
void OnTick()
{
   if(!RefreshSeries()) return;

   ulong ticket; long ptype; double openPrice, sl, tp, volume;
   bool havePos = FindMyPosition(ticket, ptype, openPrice, sl, tp, volume);
   if(havePos) { ManageTrailing(ticket, ptype, sl, tp);${r.breakevenTriggerPips ? ' ManageBreakeven(ticket, ptype, openPrice, sl, tp);' : ''} }

   // Entries and signal-exits evaluate once per new bar (on closed-bar data).
   static datetime lastBarTime = 0;
   datetime curBar = iTime(_Symbol, InpTimeframe, 0);
   if(curBar == lastBarTime) return;
   lastBarTime = curBar;

   if(havePos)
   {
      bool exitNow = false;
      ${exitLongExpr ? `if(ptype == POSITION_TYPE_BUY && ${exitLongExpr}) exitNow = true;` : ''}
      ${exitShortExpr ? `if(ptype == POSITION_TYPE_SELL && ${exitShortExpr}) exitNow = true;` : ''}
      if(exitNow) ClosePosition(ticket);
      return;
   }

${spec.sessionFilter ? '   if(!InSession()) return;\n' : ''}   if(InpMaxTradesPerDay > 0 && EntriesToday() >= InpMaxTradesPerDay) return;

   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   int digits = (int)SymbolInfoInteger(_Symbol, SYMBOL_DIGITS);
   double pip = PipSize();
   ${useAtrStops ? `double atr = ${seriesFn(atrInd!.id, 'value')}(1);` : ''}

   ${entryLongExpr ? `if(${entryLongExpr})
   {
      double slDist = InpStopLossPips > 0 ? InpStopLossPips * pip : 0;
      double tpDist = InpTakeProfitPips > 0 ? InpTakeProfitPips * pip : 0;
      ${useAtrStops ? `if(InpStopLossAtrMult > 0) slDist = InpStopLossAtrMult * atr;
      if(InpTakeProfitAtrMult > 0) tpDist = InpTakeProfitAtrMult * atr;` : ''}
      double newSL = slDist > 0 ? NormalizeDouble(ask - slDist, digits) : 0;
      double newTP = tpDist > 0 ? NormalizeDouble(ask + tpDist, digits) : 0;
      SendOrder(ORDER_TYPE_BUY, ask, newSL, newTP);
      return;
   }` : '// (no long entry rules)'}
   ${entryShortExpr ? `if(${entryShortExpr})
   {
      double slDist = InpStopLossPips > 0 ? InpStopLossPips * pip : 0;
      double tpDist = InpTakeProfitPips > 0 ? InpTakeProfitPips * pip : 0;
      ${useAtrStops ? `if(InpStopLossAtrMult > 0) slDist = InpStopLossAtrMult * atr;
      if(InpTakeProfitAtrMult > 0) tpDist = InpTakeProfitAtrMult * atr;` : ''}
      double newSL = slDist > 0 ? NormalizeDouble(bid + slDist, digits) : 0;
      double newTP = tpDist > 0 ? NormalizeDouble(bid - tpDist, digits) : 0;
      SendOrder(ORDER_TYPE_SELL, bid, newSL, newTP);
      return;
   }` : '// (no short entry rules)'}
}
//+------------------------------------------------------------------+
`;

  return { code, filename: `VEDD_${sanitize(spec.name)}.mq5`, magicNumber: magic };
}
