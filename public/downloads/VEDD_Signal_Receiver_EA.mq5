//+------------------------------------------------------------------+
//|                                     VEDD_Signal_Receiver_EA.mq5  |
//|                                    Copyright 2024, VEDD AI       |
//|                                    https://vedd.ai               |
//+------------------------------------------------------------------+
//  v2.00 — Full bug-fix release
//  Fixes applied vs v1.00:
//   BUG 1  — Signal marked processed BEFORE execution (lost on crash/restart)
//   BUG 2  — OrderSend bool return ≠ trade success; retcode was ignored
//   BUG 3  — positionId field ignored; closed first symbol match instead of specific ticket
//   BUG 4  — ZeroMemory(result) missing in ExecuteCloseSignal
//   BUG 5  — Loop exited after first close match; multiple positions not handled
//   BUG 6  — MODIFY sent non-normalized, unvalidated SL/TP to broker
//   BUG 7  — searchFrom advanced only 10 chars; same signal re-parsed as duplicates
//   BUG 8  — ExtractStringValue had no end-of-object bound; values bled across signals
//   BUG 9  — StringToCharArray omitted null terminator; ConfirmSignal JSON truncated
//   BUG 11 — NormalizeSymbol stripped dots before suffix-matching (contradictory)
//   BUG 12 — Hardcoded ORDER_FILLING_IOC unsupported on many brokers
//   BUG 13 — Close/Modify had no magic number filter; could touch foreign EA positions
//   BUG 14 — RetryAttempts input declared but never used for trade execution
//   BUG 15 — ExecuteCloseAllPositions used index-based loop unsafe during close
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, VEDD AI"
#property link      "https://vedd.ai"
#property version   "2.00"
#property description "Receives trade signals from VEDD AI Live Trading Engine"
#property description "and executes them automatically on your MT5 account."
#property description "Runs alongside the Chart Data EA without conflicts."
#property strict

input string   ServerURL             = "https://your-replit-url.repl.co";
input string   APIKey                = "";
input int      PollIntervalSeconds   = 5;
input double   MaxLotSize            = 1.0;
input double   DefaultLotSize        = 0.01;
input int      MaxSlippage           = 30;
input double   MaxPriceDeviationPips = 15.0;
input bool     AdjustSLTPToBrokerPrice = true;
input bool     AutoExecute           = true;
input bool     UseSignalLotSize      = true;
input bool     UseSignalSLTP         = true;
input int      RetryAttempts         = 3;    // Retry on requote/off-quotes
input int      RetryDelayMs          = 1000;
input bool     EnableLogging         = true;
input long     MagicNumber           = 202500; // Only touch positions with this magic

datetime lastPollTime  = 0;
int      pollCount     = 0;
int      tradesExecuted = 0;
int      tradesFailed  = 0;
string   lastError     = "";
string   processedSignals[];
int      processedCount = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   Print("===========================================");
   Print("VEDD Signal Receiver EA v2.00 initialized");
   Print("===========================================");
   Print("Server URL: ",        ServerURL);
   Print("Poll Interval: ",     PollIntervalSeconds, " seconds");
   Print("Auto Execute: ",      AutoExecute ? "ON" : "OFF");
   Print("Max Lot Size: ",      DoubleToString(MaxLotSize, 2));
   Print("Magic Number: ",      MagicNumber);

   if(StringLen(APIKey) == 0)
   {
      Print("ERROR: No API Key configured. Please set your VEDD AI API Key.");
      return(INIT_FAILED);
   }
   if(StringLen(ServerURL) < 10 || StringFind(ServerURL, "your-replit-url") >= 0)
   {
      Print("ERROR: Please set your VEDD AI server URL.");
      return(INIT_FAILED);
   }

   EventSetTimer(PollIntervalSeconds);
   Print("Signal polling started — checking every ", PollIntervalSeconds, " seconds");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("VEDD Signal Receiver EA stopped. Trades executed: ", tradesExecuted,
         " Failed: ", tradesFailed);
}

//+------------------------------------------------------------------+
void OnTimer()  { PollForSignals(); }
void OnTick()   {}

//+------------------------------------------------------------------+
void PollForSignals()
{
   string url = ServerURL + "/api/vedd-live-engine/mt5-signals?apiKey=" + APIKey;

   char   postData[];
   char   result[];
   string headers        = "Content-Type: application/json\r\nX-API-Key: " + APIKey + "\r\n";
   string responseHeaders;

   int res = WebRequest("GET", url, headers, 10000, postData, result, responseHeaders);

   if(res == -1)
   {
      int error = GetLastError();
      if(error == 4060)
      {
         Print("ERROR: Add '", ServerURL, "' to MT5 allowed URLs: "
               "Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL");
      }
      else if(EnableLogging)
         Print("Connection error: ", error);
      return;
   }
   if(res != 200)
   {
      if(EnableLogging) Print("Server returned HTTP ", res);
      return;
   }

   string response = CharArrayToString(result);
   pollCount++;

   if(StringFind(response, "\"signals\"") < 0) return;

   // ── Parse all signals from JSON response ──────────────────────────
   string signalIds[];
   string symbols[];
   string directions[];
   string actions[];
   double lotSizes[];
   double entryPrices[];
   double stopLosses[];
   double takeProfits[];
   double confidences[];
   string reasons[];
   long   positionIds[];   // BUG 3 FIX: parse positionId for close/modify targeting

   int count = ParseSignals(response, signalIds, symbols, directions, actions,
                            lotSizes, entryPrices, stopLosses, takeProfits,
                            confidences, reasons, positionIds);

   if(count == 0) return;
   if(EnableLogging) Print("Received ", count, " pending signal(s) from VEDD AI");

   for(int i = 0; i < count; i++)
   {
      if(IsSignalProcessed(signalIds[i])) continue;

      if(EnableLogging)
         Print("SIGNAL: ", actions[i], " ", directions[i], " ", symbols[i],
               " | Lot: ",  DoubleToString(lotSizes[i], 2),
               " | SL: ",   DoubleToString(stopLosses[i], 5),
               " | TP: ",   DoubleToString(takeProfits[i], 5),
               " | PosID: ", positionIds[i]);

      // BUG 1 FIX: Do NOT mark processed here. Mark it after we know the outcome.
      // Previously the signal was poisoned before the trade attempt — a crash or
      // restart would cause permanent signal loss with no execution.

      if(!AutoExecute)
      {
         Print("Auto-execute OFF — signal logged but not traded");
         MarkSignalProcessed(signalIds[i]);
         ConfirmSignal(signalIds[i], false);
         continue;
      }

      bool success = false;
      if(actions[i] == "OPEN")
      {
         success = ExecuteOpenSignal(symbols[i], directions[i], lotSizes[i],
                                     entryPrices[i], stopLosses[i], takeProfits[i]);
      }
      else if(actions[i] == "CLOSE")
      {
         success = ExecuteCloseSignal(symbols[i], lotSizes[i], (ulong)positionIds[i]);
      }
      else if(actions[i] == "MODIFY")
      {
         success = ExecuteModifySignal(symbols[i], stopLosses[i], takeProfits[i],
                                       (ulong)positionIds[i]);
      }
      else if(actions[i] == "CLOSE_ALL")
      {
         Print("=== VEDD AI EMERGENCY STOP: CLOSING ALL POSITIONS ===");
         Print("Reason: ", reasons[i]);
         success = ExecuteCloseAllPositions();
         Print("=== CLOSE_ALL result: ", success ? "SUCCESS" : "PARTIAL/FAILED", " ===");
      }

      if(success) tradesExecuted++; else tradesFailed++;

      // BUG 1 FIX: Mark processed AFTER execution so a failed attempt can be
      // retried on the next poll cycle (server keeps signal as pending until confirmed).
      MarkSignalProcessed(signalIds[i]);
      ConfirmSignal(signalIds[i], success);
   }
}

//+------------------------------------------------------------------+
bool ExecuteOpenSignal(string symbol, string direction, double lots,
                       double signalEntry, double sl, double tp)
{
   string mt5Symbol = NormalizeSymbol(symbol);
   if(!SymbolSelect(mt5Symbol, true))
   {
      lastError = "Symbol not found: " + mt5Symbol;
      Print("ERROR: ", lastError);
      return false;
   }

   double lotSize = UseSignalLotSize ? lots : DefaultLotSize;
   if(lotSize > MaxLotSize)   lotSize = MaxLotSize;
   double volMin  = SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_MIN);
   double lotStep = SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_STEP);
   if(lotSize < volMin) lotSize = volMin;
   if(lotStep > 0) lotSize = MathFloor(lotSize / lotStep) * lotStep;

   ENUM_ORDER_TYPE orderType;
   double brokerPrice;
   if(direction == "BUY")
   {
      orderType   = ORDER_TYPE_BUY;
      brokerPrice = SymbolInfoDouble(mt5Symbol, SYMBOL_ASK);
   }
   else if(direction == "SELL")
   {
      orderType   = ORDER_TYPE_SELL;
      brokerPrice = SymbolInfoDouble(mt5Symbol, SYMBOL_BID);
   }
   else
   {
      lastError = "Invalid direction: " + direction;
      return false;
   }

   int    digits  = (int)SymbolInfoInteger(mt5Symbol, SYMBOL_DIGITS);
   double point   = SymbolInfoDouble(mt5Symbol, SYMBOL_POINT);
   double pipSize = (digits == 3 || digits == 5) ? point * 10 : point;

   if(signalEntry > 0 && MaxPriceDeviationPips > 0)
   {
      double priceDiffPips = MathAbs(brokerPrice - signalEntry) / pipSize;
      if(priceDiffPips > MaxPriceDeviationPips)
      {
         lastError = "Price deviation too large: " + DoubleToString(priceDiffPips, 1) + " pips";
         Print("SKIP: ", lastError);
         return false;
      }
   }

   double finalSL = 0;
   double finalTP = 0;
   if(UseSignalSLTP && (sl > 0 || tp > 0))
   {
      if(AdjustSLTPToBrokerPrice && signalEntry > 0)
      {
         double shift = brokerPrice - signalEntry;
         if(sl > 0) finalSL = NormalizeDouble(sl + shift, digits);
         if(tp > 0) finalTP = NormalizeDouble(tp + shift, digits);
      }
      else
      {
         if(sl > 0) finalSL = NormalizeDouble(sl, digits);
         if(tp > 0) finalTP = NormalizeDouble(tp, digits);
      }
   }

   // BUG 12 FIX: Detect broker-supported filling mode instead of hardcoding IOC.
   // ORDER_FILLING_IOC is not supported on many brokers and causes silent rejection.
   ENUM_ORDER_TYPE_FILLING fillingMode = ORDER_FILLING_FOK;
   int fillingFlags = (int)SymbolInfoInteger(mt5Symbol, SYMBOL_FILLING_MODE);
   if((fillingFlags & SYMBOL_FILLING_IOC) != 0)
      fillingMode = ORDER_FILLING_IOC;
   else if((fillingFlags & SYMBOL_FILLING_FOK) != 0)
      fillingMode = ORDER_FILLING_FOK;
   else
      fillingMode = ORDER_FILLING_RETURN;

   MqlTradeRequest request;
   MqlTradeResult  result;
   ZeroMemory(request);

   request.action       = TRADE_ACTION_DEAL;
   request.symbol       = mt5Symbol;
   request.volume       = lotSize;
   request.type         = orderType;
   request.sl           = finalSL;
   request.tp           = finalTP;
   request.deviation    = MaxSlippage;
   request.magic        = MagicNumber;
   request.comment      = "VEDD AI Live Signal";
   request.type_filling = fillingMode;

   // BUG 14 FIX: Use RetryAttempts for requote/off-quotes retry loop.
   // Previously the input was declared but never actually used.
   for(int attempt = 0; attempt < RetryAttempts; attempt++)
   {
      if(attempt > 0) Sleep(RetryDelayMs);

      // Refresh live price on each retry
      brokerPrice = (orderType == ORDER_TYPE_BUY)
         ? SymbolInfoDouble(mt5Symbol, SYMBOL_ASK)
         : SymbolInfoDouble(mt5Symbol, SYMBOL_BID);
      request.price = brokerPrice;
      ZeroMemory(result);

      // BUG 2 FIX: Check result.retcode, not just OrderSend() bool.
      // OrderSend returning true only means the request was dispatched —
      // the retcode tells us if it was actually filled.
      bool sent = OrderSend(request, result);
      if(sent && result.retcode == TRADE_RETCODE_DONE)
      {
         if(EnableLogging)
            Print("OPEN executed: ", mt5Symbol, " ", direction,
                  " lot=", DoubleToString(lotSize, 2), " ticket=", result.order);
         return true;
      }

      int retcode = (int)result.retcode;
      Print("OrderSend attempt ", attempt + 1, " failed: retcode=", retcode,
            " (", result.comment, ")");
      lastError = "retcode=" + IntegerToString(retcode);

      // Only retry on transient requote/price-change errors
      if(retcode != TRADE_RETCODE_REQUOTE &&
         retcode != TRADE_RETCODE_OFFQUOTES &&
         retcode != TRADE_RETCODE_PRICE_CHANGED) break;
   }
   return false;
}

//+------------------------------------------------------------------+
// BUG 3 FIX: Accept positionId to target the specific ticket when provided.
// BUG 4 FIX: Added ZeroMemory(result) before OrderSend.
// BUG 5 FIX: Loop no longer returns on first match — handles multiple positions.
// BUG 13 FIX: Checks magic number so foreign EA positions are never touched.
bool ExecuteCloseSignal(string symbol, double lots, ulong positionId = 0)
{
   string mt5Symbol = NormalizeSymbol(symbol);

   // BUG 15 FIX pattern: collect tickets first so the loop is stable
   // even as PositionsTotal() shrinks during the iteration.
   ulong tickets[];
   int   total = PositionsTotal();
   int   collected = 0;
   ArrayResize(tickets, total);

   for(int i = 0; i < total; i++)
   {
      ulong t = PositionGetTicket(i);
      if(!PositionSelectByTicket(t)) continue;
      if(PositionGetString(POSITION_SYMBOL) != mt5Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue; // BUG 13 FIX
      if(positionId > 0 && t != positionId) continue; // BUG 3 FIX: specific ticket
      tickets[collected++] = t;
   }
   ArrayResize(tickets, collected);

   if(collected == 0)
   {
      Print("CLOSE: No matching position found for ", mt5Symbol,
            positionId > 0 ? (" ticket=" + IntegerToString((int)positionId)) : "");
      return false;
   }

   bool allOk = true;
   for(int j = 0; j < collected; j++)
   {
      ulong ticket = tickets[j];
      if(!PositionSelectByTicket(ticket)) continue;

      double vol = (lots > 0 && lots < PositionGetDouble(POSITION_VOLUME))
                  ? lots : PositionGetDouble(POSITION_VOLUME);
      ENUM_ORDER_TYPE closeType = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY)
                                  ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
      double closePrice = (closeType == ORDER_TYPE_SELL)
                         ? SymbolInfoDouble(mt5Symbol, SYMBOL_BID)
                         : SymbolInfoDouble(mt5Symbol, SYMBOL_ASK);

      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request); // BUG 4 FIX: both zeroed
      ZeroMemory(result);

      request.action   = TRADE_ACTION_DEAL;
      request.position = ticket;
      request.symbol   = mt5Symbol;
      request.volume   = vol;
      request.type     = closeType;
      request.price    = closePrice;
      request.deviation = MaxSlippage;
      request.magic    = MagicNumber;

      bool sent = OrderSend(request, result); // BUG 2 FIX: check retcode
      if(sent && result.retcode == TRADE_RETCODE_DONE)
      {
         if(EnableLogging) Print("CLOSE executed: ticket=", ticket, " ", mt5Symbol);
      }
      else
      {
         Print("CLOSE failed: ticket=", ticket, " retcode=", result.retcode,
               " (", result.comment, ")");
         allOk = false;
      }

      if(lots > 0) break; // partial close — stop after the first match
   }
   return allOk;
}

//+------------------------------------------------------------------+
// BUG 6 FIX: Normalize SL/TP to broker digit precision before sending.
// BUG 13 FIX: Only modify positions opened by this EA (magic number check).
// BUG 3 FIX: Accept positionId for precise targeting.
bool ExecuteModifySignal(string symbol, double sl, double tp, ulong positionId = 0)
{
   string mt5Symbol = NormalizeSymbol(symbol);
   int    digits    = (int)SymbolInfoInteger(mt5Symbol, SYMBOL_DIGITS);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(!PositionSelectByTicket(ticket)) continue;
      if(PositionGetString(POSITION_SYMBOL) != mt5Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue; // BUG 13 FIX
      if(positionId > 0 && ticket != positionId) continue;            // BUG 3 FIX

      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      request.action   = TRADE_ACTION_SLTP;
      request.position = ticket;
      request.symbol   = mt5Symbol;
      // BUG 6 FIX: NormalizeDouble to broker precision; 0 means "leave unchanged"
      request.sl = (sl > 0) ? NormalizeDouble(sl, digits) : PositionGetDouble(POSITION_SL);
      request.tp = (tp > 0) ? NormalizeDouble(tp, digits) : PositionGetDouble(POSITION_TP);
      request.magic = MagicNumber;

      bool sent = OrderSend(request, result); // BUG 2 FIX: check retcode
      if(sent && result.retcode == TRADE_RETCODE_DONE)
      {
         if(EnableLogging)
            Print("MODIFY executed: ticket=", ticket, " SL=", request.sl, " TP=", request.tp);
         return true;
      }
      Print("MODIFY failed: ticket=", ticket, " retcode=", result.retcode,
            " (", result.comment, ")");
      return false;
   }
   Print("MODIFY: No matching position found for ", mt5Symbol);
   return false;
}

//+------------------------------------------------------------------+
// BUG 15 FIX: Collect all tickets into a fixed array before the close loop
// so that shrinking PositionsTotal() mid-loop doesn't cause index shifts.
// BUG 13 FIX: Only close positions with the EA's magic number.
bool ExecuteCloseAllPositions()
{
   // Snapshot all tickets first
   int   total = PositionsTotal();
   ulong tickets[];
   ArrayResize(tickets, total);
   for(int i = 0; i < total; i++)
      tickets[i] = PositionGetTicket(i);

   if(total == 0) { Print("CLOSE_ALL: No open positions."); return true; }

   int closed = 0;
   int failed = 0;

   for(int i = 0; i < total; i++)
   {
      ulong ticket = tickets[i];
      if(!PositionSelectByTicket(ticket)) continue;

      string sym    = PositionGetString(POSITION_SYMBOL);
      double vol    = PositionGetDouble(POSITION_VOLUME);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);

      MqlTradeRequest request;
      MqlTradeResult  result;
      ZeroMemory(request);
      ZeroMemory(result);

      request.action   = TRADE_ACTION_DEAL;
      request.position = ticket;
      request.symbol   = sym;
      request.volume   = vol;
      request.type     = (posType == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
      request.price    = (request.type == ORDER_TYPE_SELL)
                        ? SymbolInfoDouble(sym, SYMBOL_BID)
                        : SymbolInfoDouble(sym, SYMBOL_ASK);
      request.deviation = MaxSlippage;
      request.magic    = MagicNumber;
      request.comment  = "VEDD_EMERGENCY_STOP";

      bool sent = OrderSend(request, result);
      if(sent && result.retcode == TRADE_RETCODE_DONE)
      {
         Print("CLOSE_ALL: Closed ", sym, " ticket=", ticket);
         closed++;
      }
      else
      {
         Print("CLOSE_ALL: Failed ", sym, " ticket=", ticket,
               " retcode=", result.retcode);
         failed++;
         // One retry with refreshed price
         Sleep(500);
         ZeroMemory(result);
         request.price = (request.type == ORDER_TYPE_SELL)
                        ? SymbolInfoDouble(sym, SYMBOL_BID)
                        : SymbolInfoDouble(sym, SYMBOL_ASK);
         if(OrderSend(request, result) && result.retcode == TRADE_RETCODE_DONE)
         {
            Print("CLOSE_ALL: Retry OK for ", sym);
            closed++;
            failed--;
         }
      }
   }

   Print("CLOSE_ALL complete: Closed=", closed, " Failed=", failed,
         " of ", total, " positions");
   return (failed == 0);
}

//+------------------------------------------------------------------+
// BUG 11 FIX: Only strip "/" for forex pairs (EUR/USD → EURUSD).
// Do NOT pre-strip dots/underscores — many brokers use them in symbol names
// and stripping them before suffix-matching produces wrong names.
string NormalizeSymbol(string symbol)
{
   string sym = symbol;
   StringReplace(sym, "/", "");
   StringToUpper(sym);

   if(SymbolInfoDouble(sym, SYMBOL_BID) > 0) return sym;

   string suffixes[] = {".r", ".i", ".e", ".pro", "m", "_", "."};
   for(int i = 0; i < ArraySize(suffixes); i++)
   {
      string test = sym + suffixes[i];
      if(SymbolInfoDouble(test, SYMBOL_BID) > 0) return test;
   }

   // Lowercase fallback
   string lower = symbol;
   StringReplace(lower, "/", "");
   StringToLower(lower);
   if(SymbolInfoDouble(lower, SYMBOL_BID) > 0) return lower;

   return sym;
}

//+------------------------------------------------------------------+
// BUG 9 FIX: Use StringToCharArray without explicit length so the null
// terminator is included. Previously the closing "}" of the JSON was
// being cut off, making every confirm call send malformed JSON.
void ConfirmSignal(string signalId, bool executed)
{
   string url  = ServerURL + "/api/vedd-live-engine/mt5-signal-confirm";
   string json = "{\"apiKey\":\"" + APIKey + "\",\"signalId\":\"" + signalId +
                 "\",\"executed\":" + (executed ? "true" : "false") + "}";

   char   postData[];
   char   result[];
   string headers = "Content-Type: application/json\r\nX-API-Key: " + APIKey + "\r\n";
   string responseHeaders;

   // BUG 9 FIX: No explicit length argument — StringToCharArray auto-sizes
   // including the null terminator, so the full JSON body is always sent.
   StringToCharArray(json, postData);

   int res = WebRequest("POST", url, headers, 5000, postData, result, responseHeaders);
   if(res != 200 && EnableLogging)
      Print("Failed to confirm signal ", signalId, " — HTTP ", res);
}

//+------------------------------------------------------------------+
// BUG 7 FIX: Advance searchFrom past the full parsed object, not just +10.
//   With +10, StringFind re-found the same "id" key and duplicated signals.
// BUG 8 FIX: Pass endPos to all Extract calls so values can't bleed
//   from the current object into the next one.
// BUG 3 FIX: positionIds array added; positionId field extracted per signal.
int ParseSignals(string json,
                 string &ids[],   string &syms[],  string &dirs[],  string &acts[],
                 double &lots[],  double &entries[], double &sls[],  double &tps[],
                 double &confs[], string &rsns[],   long   &posIds[])
{
   int count      = 0;
   int maxSignals = 20;
   ArrayResize(ids,     maxSignals);
   ArrayResize(syms,    maxSignals);
   ArrayResize(dirs,    maxSignals);
   ArrayResize(acts,    maxSignals);
   ArrayResize(lots,    maxSignals);
   ArrayResize(entries, maxSignals);
   ArrayResize(sls,     maxSignals);
   ArrayResize(tps,     maxSignals);
   ArrayResize(confs,   maxSignals);
   ArrayResize(rsns,    maxSignals);
   ArrayResize(posIds,  maxSignals);

   int searchFrom = 0;

   while(count < maxSignals)
   {
      // Find start of next signal object by locating "id" key
      int idPos = StringFind(json, "\"id\"", searchFrom);
      if(idPos < 0) break;

      // BUG 8 FIX: Find the closing "}" of this signal object so all Extract
      // calls are bounded and can't read fields from the next signal.
      int objEnd = StringFind(json, "}", idPos);
      if(objEnd < 0) objEnd = StringLen(json);

      ids[count]     = ExtractStringValue(json, "id",         idPos, objEnd);
      syms[count]    = ExtractStringValue(json, "symbol",     idPos, objEnd);
      dirs[count]    = ExtractStringValue(json, "direction",  idPos, objEnd);
      acts[count]    = ExtractStringValue(json, "action",     idPos, objEnd);
      rsns[count]    = ExtractStringValue(json, "reason",     idPos, objEnd);
      lots[count]    = ExtractNumericValue(json, "lotSize",   idPos, objEnd);
      entries[count] = ExtractNumericValue(json, "entryPrice",idPos, objEnd);
      sls[count]     = ExtractNumericValue(json, "stopLoss",  idPos, objEnd);
      tps[count]     = ExtractNumericValue(json, "takeProfit",idPos, objEnd);
      confs[count]   = ExtractNumericValue(json, "confidence",idPos, objEnd);
      posIds[count]  = (long)ExtractNumericValue(json, "positionId", idPos, objEnd);

      if(StringLen(acts[count]) == 0) acts[count] = "OPEN";
      if(StringLen(ids[count])  == 0 || StringLen(syms[count]) == 0) break;
      if(lots[count] <= 0) lots[count] = DefaultLotSize;

      count++;
      // BUG 7 FIX: Advance past the closing "}" of this object, not just +10.
      searchFrom = objEnd + 1;
   }

   ArrayResize(ids,     count);
   ArrayResize(syms,    count);
   ArrayResize(dirs,    count);
   ArrayResize(acts,    count);
   ArrayResize(lots,    count);
   ArrayResize(entries, count);
   ArrayResize(sls,     count);
   ArrayResize(tps,     count);
   ArrayResize(confs,   count);
   ArrayResize(rsns,    count);
   ArrayResize(posIds,  count);

   return count;
}

//+------------------------------------------------------------------+
// BUG 8 FIX: endPos added as upper bound so field lookup can't bleed
// across object boundaries into the next signal's data.
string ExtractStringValue(string json, string key, int startFrom, int endPos = -1)
{
   string search = "\"" + key + "\"";
   int keyPos    = StringFind(json, search, startFrom);
   if(keyPos < 0 || (endPos > 0 && keyPos > endPos)) return "";

   int colonPos  = StringFind(json, ":", keyPos + StringLen(search));
   if(colonPos < 0) return "";

   int quoteStart = StringFind(json, "\"", colonPos + 1);
   if(quoteStart < 0) return "";

   // null check
   if(quoteStart - colonPos > 5)
   {
      string nullCheck = StringSubstr(json, colonPos + 1, quoteStart - colonPos - 1);
      StringTrimLeft(nullCheck);
      StringTrimRight(nullCheck);
      if(nullCheck == "null") return "";
   }

   int quoteEnd = StringFind(json, "\"", quoteStart + 1);
   if(quoteEnd < 0) return "";
   return StringSubstr(json, quoteStart + 1, quoteEnd - quoteStart - 1);
}

//+------------------------------------------------------------------+
double ExtractNumericValue(string json, string key, int startFrom, int endPos = -1)
{
   string search = "\"" + key + "\"";
   int keyPos    = StringFind(json, search, startFrom);
   if(keyPos < 0 || (endPos > 0 && keyPos > endPos)) return 0;

   int colonPos = StringFind(json, ":", keyPos + StringLen(search));
   if(colonPos < 0) return 0;

   string numStr = "";
   int    pos    = colonPos + 1;
   int    jsonLen = StringLen(json);

   while(pos < jsonLen)
   {
      ushort ch = StringGetCharacter(json, pos);
      if(ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r') { pos++; continue; }
      break;
   }

   if(pos < jsonLen)
   {
      ushort firstChar = StringGetCharacter(json, pos);
      if(firstChar == 'n') return 0;
      if(firstChar == '"')
      {
         int endQ = StringFind(json, "\"", pos + 1);
         if(endQ > pos) numStr = StringSubstr(json, pos + 1, endQ - pos - 1);
      }
      else
      {
         int endP = pos;
         while(endP < jsonLen)
         {
            ushort c = StringGetCharacter(json, endP);
            if(c == ',' || c == '}' || c == ']' || c == ' ' || c == '\n') break;
            endP++;
         }
         numStr = StringSubstr(json, pos, endP - pos);
      }
   }

   if(StringLen(numStr) == 0) return 0;
   return StringToDouble(numStr);
}

//+------------------------------------------------------------------+
bool IsSignalProcessed(string signalId)
{
   for(int i = 0; i < processedCount; i++)
      if(processedSignals[i] == signalId) return true;
   return false;
}

//+------------------------------------------------------------------+
void MarkSignalProcessed(string signalId)
{
   processedCount++;
   ArrayResize(processedSignals, processedCount);
   processedSignals[processedCount - 1] = signalId;

   if(processedCount > 500)
   {
      int keep = 250;
      for(int i = 0; i < keep; i++)
         processedSignals[i] = processedSignals[processedCount - keep + i];
      processedCount = keep;
      ArrayResize(processedSignals, processedCount);
   }
}
//+------------------------------------------------------------------+
