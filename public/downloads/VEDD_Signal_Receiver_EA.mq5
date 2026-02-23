//+------------------------------------------------------------------+
//|                                     VEDD_Signal_Receiver_EA.mq5  |
//|                                    Copyright 2024, VEDD AI       |
//|                                    https://vedd.ai               |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, VEDD AI"
#property link      "https://vedd.ai"
#property version   "1.00"
#property description "Receives trade signals from VEDD AI Live Trading Engine"
#property description "and executes them automatically on your MT5 account."
#property description "Runs alongside the Chart Data EA without conflicts."
#property strict

input string   ServerURL = "https://your-replit-url.repl.co";
input string   APIKey = "";
input int      PollIntervalSeconds = 5;
input double   MaxLotSize = 1.0;
input double   DefaultLotSize = 0.01;
input int      MaxSlippage = 30;
input double   MaxPriceDeviationPips = 15.0;
input bool     AdjustSLTPToBrokerPrice = true;
input bool     AutoExecute = true;
input bool     UseSignalLotSize = true;
input bool     UseSignalSLTP = true;
input int      RetryAttempts = 3;
input int      RetryDelayMs = 1000;
input bool     EnableLogging = true;

datetime lastPollTime = 0;
int pollCount = 0;
int tradesExecuted = 0;
int tradesFailed = 0;
string lastError = "";
string processedSignals[];
int processedCount = 0;

//+------------------------------------------------------------------+
int OnInit()
{
   Print("===========================================");
   Print("VEDD Signal Receiver EA v1.00 initialized");
   Print("===========================================");
   Print("Server URL: ", ServerURL);
   Print("Poll Interval: ", PollIntervalSeconds, " seconds");
   Print("Auto Execute: ", AutoExecute ? "ON" : "OFF");
   Print("Max Lot Size: ", DoubleToString(MaxLotSize, 2));
   
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
   Print("Signal polling started - checking every ", PollIntervalSeconds, " seconds");
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("VEDD Signal Receiver EA stopped. Trades executed: ", tradesExecuted, " Failed: ", tradesFailed);
}

//+------------------------------------------------------------------+
void OnTimer()
{
   PollForSignals();
}

//+------------------------------------------------------------------+
void OnTick()
{
}

//+------------------------------------------------------------------+
void PollForSignals()
{
   string url = ServerURL + "/api/vedd-live-engine/mt5-signals?apiKey=" + APIKey;
   
   char postData[];
   char result[];
   string headers = "Content-Type: application/json\r\nX-API-Key: " + APIKey + "\r\n";
   string responseHeaders;
   
   int timeout = 10000;
   int res = WebRequest("GET", url, headers, timeout, postData, result, responseHeaders);
   
   if(res == -1)
   {
      int error = GetLastError();
      if(error == 4060)
      {
         Print("ERROR: Add '", ServerURL, "' to MT5 allowed URLs:");
         Print("  Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL");
      }
      else
      {
         if(EnableLogging) Print("Connection error: ", error);
      }
      return;
   }
   
   if(res != 200)
   {
      if(EnableLogging) Print("Server returned HTTP ", res);
      return;
   }
   
   string response = CharArrayToString(result);
   pollCount++;
   
   int signalsStart = StringFind(response, "\"signals\"");
   if(signalsStart < 0)
   {
      return;
   }
   
   string signalIds[];
   string symbols[];
   string directions[];
   double lotSizes[];
   double entryPrices[];
   double stopLosses[];
   double takeProfits[];
   double confidences[];
   string reasons[];
   
   int count = ParseSignals(response, signalIds, symbols, directions, actions, lotSizes, 
                            entryPrices, stopLosses, takeProfits, confidences, reasons);
   
   if(count == 0) return;
   
   if(EnableLogging) Print("Received ", count, " pending signal(s) from VEDD AI Live Engine");
   
   for(int i = 0; i < count; i++)
   {
      if(IsSignalProcessed(signalIds[i])) continue;
      
      if(EnableLogging)
      {
         Print("SIGNAL: ", actions[i], " ", directions[i], " ", symbols[i], 
               " | Lot: ", DoubleToString(lotSizes[i], 2),
               " | SL: ", DoubleToString(stopLosses[i], 5),
               " | TP: ", DoubleToString(takeProfits[i], 5));
      }
      
      MarkSignalProcessed(signalIds[i]);
      
      if(!AutoExecute)
      {
         Print("Auto-execute OFF - signal logged but not traded");
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
         success = ExecuteCloseSignal(symbols[i], lotSizes[i]);
      }
      else if(actions[i] == "MODIFY")
      {
         success = ExecuteModifySignal(symbols[i], stopLosses[i], takeProfits[i]);
      }
      
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
      return false;
   }
   
   double lotSize = UseSignalLotSize ? lots : DefaultLotSize;
   if(lotSize > MaxLotSize) lotSize = MaxLotSize;
   if(lotSize < SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_MIN))
      lotSize = SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_MIN);
   
   double lotStep = SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_STEP);
   if(lotStep > 0)
      lotSize = MathFloor(lotSize / lotStep) * lotStep;
   
   ENUM_ORDER_TYPE orderType;
   double brokerPrice;
   
   if(direction == "BUY")
   {
      orderType = ORDER_TYPE_BUY;
      brokerPrice = SymbolInfoDouble(mt5Symbol, SYMBOL_ASK);
   }
   else if(direction == "SELL")
   {
      orderType = ORDER_TYPE_SELL;
      brokerPrice = SymbolInfoDouble(mt5Symbol, SYMBOL_BID);
   }
   else
   {
      lastError = "Invalid direction: " + direction;
      return false;
   }
   
   double point = SymbolInfoDouble(mt5Symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(mt5Symbol, SYMBOL_DIGITS);
   double pipSize = (digits == 3 || digits == 5) ? point * 10 : point;
   
   if(signalEntry > 0 && MaxPriceDeviationPips > 0)
   {
      double priceDiffPips = MathAbs(brokerPrice - signalEntry) / pipSize;
      if(priceDiffPips > MaxPriceDeviationPips)
      {
         lastError = "Price deviation too large: " + DoubleToString(priceDiffPips, 1) + " pips";
         return false;
      }
   }
   
   double finalSL = 0;
   double finalTP = 0;
   
   if(UseSignalSLTP && (sl > 0 || tp > 0))
   {
      if(AdjustSLTPToBrokerPrice && signalEntry > 0)
      {
         double priceShift = brokerPrice - signalEntry;
         if(sl > 0) finalSL = NormalizeDouble(sl + priceShift, digits);
         if(tp > 0) finalTP = NormalizeDouble(tp + priceShift, digits);
      }
      else
      {
         if(sl > 0) finalSL = sl;
         if(tp > 0) finalTP = tp;
      }
   }
   
   MqlTradeRequest request;
   MqlTradeResult result;
   ZeroMemory(request);
   ZeroMemory(result);
   
   request.action = TRADE_ACTION_DEAL;
   request.symbol = mt5Symbol;
   request.volume = lotSize;
   request.type = orderType;
   request.price = brokerPrice;
   request.sl = finalSL;
   request.tp = finalTP;
   request.deviation = MaxSlippage;
   request.magic = 202500;
   request.comment = "VEDD AI Live Signal";
   request.type_filling = ORDER_FILLING_IOC;
   
   return OrderSend(request, result);
}

//+------------------------------------------------------------------+
bool ExecuteCloseSignal(string symbol, double lots)
{
   string mt5Symbol = NormalizeSymbol(symbol);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL) == mt5Symbol)
      {
         MqlTradeRequest request;
         MqlTradeResult result;
         ZeroMemory(request);
         request.action = TRADE_ACTION_DEAL;
         request.position = ticket;
         request.symbol = mt5Symbol;
         request.volume = (lots > 0 && lots < PositionGetDouble(POSITION_VOLUME)) ? lots : PositionGetDouble(POSITION_VOLUME);
         request.type = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? ORDER_TYPE_SELL : ORDER_TYPE_BUY;
         request.price = (request.type == ORDER_TYPE_SELL) ? SymbolInfoDouble(mt5Symbol, SYMBOL_BID) : SymbolInfoDouble(mt5Symbol, SYMBOL_ASK);
         request.magic = 202500;
         return OrderSend(request, result);
      }
   }
   return false;
}

//+------------------------------------------------------------------+
bool ExecuteModifySignal(string symbol, double sl, double tp)
{
   string mt5Symbol = NormalizeSymbol(symbol);
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(PositionSelectByTicket(ticket) && PositionGetString(POSITION_SYMBOL) == mt5Symbol)
      {
         MqlTradeRequest request;
         MqlTradeResult result;
         ZeroMemory(request);
         request.action = TRADE_ACTION_SLTP;
         request.position = ticket;
         request.symbol = mt5Symbol;
         request.sl = sl;
         request.tp = tp;
         request.magic = 202500;
         return OrderSend(request, result);
      }
   }
   return false;
}
{
   string mt5Symbol = NormalizeSymbol(symbol);
   
   if(!SymbolSelect(mt5Symbol, true))
   {
      lastError = "Symbol not found: " + mt5Symbol;
      return false;
   }
   
   double lotSize = UseSignalLotSize ? lots : DefaultLotSize;
   if(lotSize > MaxLotSize) lotSize = MaxLotSize;
   if(lotSize < SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_MIN))
      lotSize = SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_MIN);
   
   double lotStep = SymbolInfoDouble(mt5Symbol, SYMBOL_VOLUME_STEP);
   if(lotStep > 0)
      lotSize = MathFloor(lotSize / lotStep) * lotStep;
   
   ENUM_ORDER_TYPE orderType;
   double brokerPrice;
   
   if(direction == "BUY")
   {
      orderType = ORDER_TYPE_BUY;
      brokerPrice = SymbolInfoDouble(mt5Symbol, SYMBOL_ASK);
   }
   else if(direction == "SELL")
   {
      orderType = ORDER_TYPE_SELL;
      brokerPrice = SymbolInfoDouble(mt5Symbol, SYMBOL_BID);
   }
   else
   {
      lastError = "Invalid direction: " + direction;
      return false;
   }
   
   double point = SymbolInfoDouble(mt5Symbol, SYMBOL_POINT);
   int digits = (int)SymbolInfoInteger(mt5Symbol, SYMBOL_DIGITS);
   double pipSize = (digits == 3 || digits == 5) ? point * 10 : point;
   
   if(signalEntry > 0 && MaxPriceDeviationPips > 0)
   {
      double priceDiffPips = MathAbs(brokerPrice - signalEntry) / pipSize;
      if(EnableLogging)
         Print("Price check: Signal=", DoubleToString(signalEntry, digits), 
               " Broker=", DoubleToString(brokerPrice, digits),
               " Diff=", DoubleToString(priceDiffPips, 1), " pips",
               " Max=", DoubleToString(MaxPriceDeviationPips, 1), " pips");
      
      if(priceDiffPips > MaxPriceDeviationPips)
      {
         lastError = "Price deviation too large: " + DoubleToString(priceDiffPips, 1) + 
                     " pips (max " + DoubleToString(MaxPriceDeviationPips, 1) + ")";
         return false;
      }
   }
   
   double finalSL = 0;
   double finalTP = 0;
   
   if(UseSignalSLTP && (sl > 0 || tp > 0))
   {
      if(AdjustSLTPToBrokerPrice && signalEntry > 0)
      {
         double priceShift = brokerPrice - signalEntry;
         if(sl > 0) finalSL = NormalizeDouble(sl + priceShift, digits);
         if(tp > 0) finalTP = NormalizeDouble(tp + priceShift, digits);
         if(EnableLogging && MathAbs(priceShift) > point)
            Print("SL/TP adjusted by ", DoubleToString(priceShift / pipSize, 1), 
                  " pips to match broker price | SL: ", DoubleToString(finalSL, digits),
                  " TP: ", DoubleToString(finalTP, digits));
      }
      else
      {
         if(sl > 0) finalSL = sl;
         if(tp > 0) finalTP = tp;
      }
   }
   
   double price = brokerPrice;
   
   MqlTradeRequest request;
   MqlTradeResult result;
   ZeroMemory(request);
   ZeroMemory(result);
   
   request.action = TRADE_ACTION_DEAL;
   request.symbol = mt5Symbol;
   request.volume = lotSize;
   request.type = orderType;
   request.price = price;
   request.sl = finalSL;
   request.tp = finalTP;
   request.deviation = MaxSlippage;
   request.magic = 202500;
   request.comment = "VEDD AI Live Signal";
   request.type_filling = ORDER_FILLING_IOC;
   
   for(int attempt = 0; attempt < RetryAttempts; attempt++)
   {
      if(OrderSend(request, result))
      {
         if(result.retcode == TRADE_RETCODE_DONE || result.retcode == TRADE_RETCODE_PLACED)
         {
            Print("Order executed successfully. Ticket: ", result.order, 
                  " Deal: ", result.deal, " Price: ", result.price);
            return true;
         }
      }
      
      lastError = "Retcode: " + IntegerToString(result.retcode) + " - " + result.comment;
      
      if(result.retcode == TRADE_RETCODE_REQUOTE)
      {
         if(direction == "BUY")
            request.price = SymbolInfoDouble(mt5Symbol, SYMBOL_ASK);
         else
            request.price = SymbolInfoDouble(mt5Symbol, SYMBOL_BID);
      }
      
      if(attempt < RetryAttempts - 1)
      {
         Print("Retry ", attempt + 1, "/", RetryAttempts, " after error: ", lastError);
         Sleep(RetryDelayMs);
      }
   }
   
   return false;
}

//+------------------------------------------------------------------+
string NormalizeSymbol(string symbol)
{
   string sym = symbol;
   StringReplace(sym, "/", "");
   StringReplace(sym, ".", "");
   StringReplace(sym, "_", "");
   StringToUpper(sym);
   
   if(SymbolInfoDouble(sym, SYMBOL_BID) > 0) return sym;
   
   string suffixes[] = {".r", ".i", ".e", ".pro", "m", ".", "_"};
   for(int i = 0; i < ArraySize(suffixes); i++)
   {
      string test = sym + suffixes[i];
      if(SymbolInfoDouble(test, SYMBOL_BID) > 0) return test;
   }
   
   string lowerSym = symbol;
   StringToLower(lowerSym);
   if(SymbolInfoDouble(lowerSym, SYMBOL_BID) > 0) return lowerSym;
   
   return sym;
}

//+------------------------------------------------------------------+
void ConfirmSignal(string signalId, bool executed)
{
   string url = ServerURL + "/api/vedd-live-engine/mt5-signal-confirm";
   
   string json = "{\"apiKey\":\"" + APIKey + "\",\"signalId\":\"" + signalId + 
                 "\",\"executed\":" + (executed ? "true" : "false") + "}";
   
   char postData[];
   StringToCharArray(json, postData, 0, StringLen(json));
   
   char result[];
   string headers = "Content-Type: application/json\r\nX-API-Key: " + APIKey + "\r\n";
   string responseHeaders;
   
   int res = WebRequest("POST", url, headers, 5000, postData, result, responseHeaders);
   
   if(res != 200 && EnableLogging)
   {
      Print("Failed to confirm signal ", signalId, " - HTTP ", res);
   }
}

//+------------------------------------------------------------------+
int ParseSignals(string json, string &ids[], string &syms[], string &dirs[],
                 double &lots[], double &entries[], double &sls[], double &tps[],
                 double &confs[], string &rsns[])
{
   int count = 0;
   int maxSignals = 20;
   ArrayResize(ids, maxSignals);
   ArrayResize(syms, maxSignals);
   ArrayResize(dirs, maxSignals);
   ArrayResize(lots, maxSignals);
   ArrayResize(entries, maxSignals);
   ArrayResize(sls, maxSignals);
   ArrayResize(tps, maxSignals);
   ArrayResize(confs, maxSignals);
   ArrayResize(rsns, maxSignals);
   
   int searchFrom = 0;
   
   while(count < maxSignals)
   {
      int idPos = StringFind(json, "\"id\"", searchFrom);
      if(idPos < 0) break;
      
      ids[count] = ExtractStringValue(json, "id", idPos);
      syms[count] = ExtractStringValue(json, "symbol", idPos);
      dirs[count] = ExtractStringValue(json, "direction", idPos);
      lots[count] = ExtractNumericValue(json, "lotSize", idPos);
      entries[count] = ExtractNumericValue(json, "entryPrice", idPos);
      sls[count] = ExtractNumericValue(json, "stopLoss", idPos);
      tps[count] = ExtractNumericValue(json, "takeProfit", idPos);
      confs[count] = ExtractNumericValue(json, "confidence", idPos);
      rsns[count] = ExtractStringValue(json, "reason", idPos);
      
      if(StringLen(ids[count]) == 0 || StringLen(syms[count]) == 0) break;
      
      if(lots[count] <= 0) lots[count] = DefaultLotSize;
      
      count++;
      searchFrom = idPos + 10;
   }
   
   ArrayResize(ids, count);
   ArrayResize(syms, count);
   ArrayResize(dirs, count);
   ArrayResize(lots, count);
   ArrayResize(entries, count);
   ArrayResize(sls, count);
   ArrayResize(tps, count);
   ArrayResize(confs, count);
   ArrayResize(rsns, count);
   
   return count;
}

//+------------------------------------------------------------------+
string ExtractStringValue(string json, string key, int startFrom)
{
   string search = "\"" + key + "\"";
   int keyPos = StringFind(json, search, startFrom);
   if(keyPos < 0) return "";
   
   int colonPos = StringFind(json, ":", keyPos + StringLen(search));
   if(colonPos < 0) return "";
   
   int quoteStart = StringFind(json, "\"", colonPos + 1);
   if(quoteStart < 0) return "";
   
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
double ExtractNumericValue(string json, string key, int startFrom)
{
   string search = "\"" + key + "\"";
   int keyPos = StringFind(json, search, startFrom);
   if(keyPos < 0) return 0;
   
   int colonPos = StringFind(json, ":", keyPos + StringLen(search));
   if(colonPos < 0) return 0;
   
   string numStr = "";
   int pos = colonPos + 1;
   int jsonLen = StringLen(json);
   
   while(pos < jsonLen)
   {
      ushort ch = StringGetCharacter(json, pos);
      if(ch == ' ' || ch == '\t' || ch == '\n' || ch == '\r')
      {
         pos++;
         continue;
      }
      break;
   }
   
   if(pos < jsonLen)
   {
      ushort firstChar = StringGetCharacter(json, pos);
      if(firstChar == 'n') return 0;
      if(firstChar == '"')
      {
         int endQuote = StringFind(json, "\"", pos + 1);
         if(endQuote > pos)
            numStr = StringSubstr(json, pos + 1, endQuote - pos - 1);
      }
      else
      {
         int endPos = pos;
         while(endPos < jsonLen)
         {
            ushort c = StringGetCharacter(json, endPos);
            if(c == ',' || c == '}' || c == ']' || c == ' ' || c == '\n') break;
            endPos++;
         }
         numStr = StringSubstr(json, pos, endPos - pos);
      }
   }
   
   if(StringLen(numStr) == 0) return 0;
   return StringToDouble(numStr);
}

//+------------------------------------------------------------------+
bool IsSignalProcessed(string signalId)
{
   for(int i = 0; i < processedCount; i++)
   {
      if(processedSignals[i] == signalId) return true;
   }
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
