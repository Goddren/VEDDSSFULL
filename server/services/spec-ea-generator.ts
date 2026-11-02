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
};

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

function conditionExpr(c: Condition): string {
  const L = (s: number) => valueExpr(c.indicatorId, c.field, s);
  const R = (s: number) => rhsExpr(c, s);
  switch (c.operator) {
    case 'above': return `(${L(1)} > ${R(1)})`;
    case 'below': return `(${L(1)} < ${R(1)})`;
    case 'crosses_above': return `(${L(2)} <= ${R(2)} && ${L(1)} > ${R(1)})`;
    case 'crosses_below': return `(${L(2)} >= ${R(2)} && ${L(1)} < ${R(1)})`;
    case 'rising': return `(${L(1)} > ${L(2)})`;
    case 'falling': return `(${L(1)} < ${L(2)})`;
  }
}

function groupExpr(g: ConditionGroup | null | undefined): string | null {
  if (!g || g.conditions.length === 0) return null;
  const joiner = g.logic === 'AND' ? ' && ' : ' || ';
  return `(${g.conditions.map(conditionExpr).join(joiner)})`;
}

export function generateSpecMT5EA(spec: StrategySpec): { code: string; filename: string; magicNumber: number } {
  const magic = deterministicMagic(spec);
  const refs = collectRefs(spec);
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
    }
    handleInits.push(`   ${h} = ${init};\n   if(${h} == INVALID_HANDLE) { Print("VEDD: failed to create ${ind.kind} handle"); return INIT_FAILED; }`);
  }

  for (const ref of refs) {
    const ind = indById.get(ref.id);
    if (!ind) continue;
    const arr = `g_${ref.id}_${ref.field}`;
    bufferDecls.push(`double ${arr}[];`);
    if (ind.kind === 'MACD' && ref.field === 'histogram') {
      // histogram = main - signal, computed after both are copied
      copyCalls.push(`   // histogram for ${ref.id} computed below`);
    } else {
      const bufIdx = BUFFER_INDEX[ind.kind]?.[ref.field] ?? 0;
      copyCalls.push(`   if(CopyBuffer(h_${ref.id}, ${bufIdx}, 0, 5, ${arr}) < 3) return false;\n   ArraySetAsSeries(${arr}, true);`);
    }
    getters.push(`double ${seriesFn(ref.id, ref.field)}(int shift) { return g_${ref.id}_${ref.field}[shift]; }`);
  }
  const hasHistogram = refs.some((r) => indById.get(r.id)?.kind === 'MACD' && r.field === 'histogram');
  const histogramCode = hasHistogram ? (() => {
    const mid = refs.find((r) => indById.get(r.id)?.kind === 'MACD' && r.field === 'histogram')!.id;
    return `\n   // MACD histogram = main - signal\n   if(ArraySize(g_${mid}_value) >= 3 && ArraySize(g_${mid}_signal) >= 3) {\n      ArrayResize(g_${mid}_histogram, ArraySize(g_${mid}_value));\n      ArraySetAsSeries(g_${mid}_histogram, true);\n      for(int i = 0; i < ArraySize(g_${mid}_value); i++) g_${mid}_histogram[i] = g_${mid}_value[i] - g_${mid}_signal[i];\n   }`;
  })() : '';

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

input group "=== Execution ==="
input long   InpMagicNumber     = ${magic};   // Magic number (stable for this strategy)
input int    InpSlippagePoints  = 30;         // Max slippage (points)

//--- Indicator handles
${handleDecls.join('\n')}

//--- Series buffers (index 0 = forming bar, 1 = last closed bar)
${bufferDecls.join('\n')}

${getters.join('\n')}

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
${spec.indicators.map((i) => `   if(h_${i.id} != INVALID_HANDLE) IndicatorRelease(h_${i.id});`).join('\n')}
}

//+------------------------------------------------------------------+
bool RefreshSeries()
{
${copyCalls.join('\n')}${histogramCode}
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

//+------------------------------------------------------------------+
void OnTick()
{
   if(!RefreshSeries()) return;

   ulong ticket; long ptype; double openPrice, sl, tp, volume;
   bool havePos = FindMyPosition(ticket, ptype, openPrice, sl, tp, volume);
   if(havePos) ManageTrailing(ticket, ptype, sl, tp);

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

   if(InpMaxTradesPerDay > 0 && EntriesToday() >= InpMaxTradesPerDay) return;

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
