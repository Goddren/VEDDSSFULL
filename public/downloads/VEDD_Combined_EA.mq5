//+------------------------------------------------------------------+
//|                                            VEDD_Combined_EA.mq5 |
//|                              AI Powered Trading Vault           |
//|         Combined: Signal Receiver + Chart Data + Trade Copier   |
//+------------------------------------------------------------------+
//  v1.00  2026-05-19
//
//  Single EA that replaces all three legacy EAs:
//    • VEDD_Signal_Receiver_EA   — poll + execute AI signals
//    • VEDD_ChartData_EA         — send live OHLCV + indicators to AI
//    • VEDD_TradeCopier_EA       — report manual trades to TradeLocker
//
//  New in v1.00 vs the three individual EAs:
//    • AccountAlias input for multi-MT5-account support
//    • 30 s heartbeat so the dashboard shows which terminals are online
//    • Manual-trade relay uses magic-number filter (AI trades = 202500 skipped)
//    • Unified error/status chart comment
//+------------------------------------------------------------------+
#property copyright "AI Powered Trading Vault"
#property link      "https://aipoweredtradingvault.com"
#property version   "1.00"
#property description "Combined EA: Signal Receiver + Chart Data sender + Trade Copier + Account Heartbeat"
#property strict

#include <Trade\Trade.mqh>

//====================================================================
//  CONNECTION
//====================================================================
input string  _h0          = "========== CONNECTION ==========";  // *** CONNECTION ***
input string  SERVER_URL   = "https://your-app.replit.app";       // Server Base URL (no trailing slash)
input string  API_KEY      = "";                                   // API Key from VEDD Dashboard
input string  ACCOUNT_ALIAS = "mt5_main";                         // Unique alias for this terminal
input string  ACCOUNT_LABEL = "MT5 Main Account";                 // Display label (shown in dashboard)
input int     TIMEOUT_MS   = 15000;                               // HTTP Request Timeout (ms)

//====================================================================
//  SIGNAL RECEIVER
//====================================================================
input string  _h1          = "========== SIGNAL RECEIVER =========="; // *** SIGNALS ***
input bool    ENABLE_SIGNALS = true;                               // Enable AI signal execution
input int     SIGNAL_POLL_SECONDS = 5;                            // How often to poll for signals (s)
input int     RETRY_ATTEMPTS    = 3;                              // Order send retries on failure
input int     RETRY_DELAY_MS    = 500;                            // Delay between retries (ms)
input int     MAGIC_NUMBER      = 202500;                         // Magic for AI trades (do NOT change)
input int     SLIPPAGE_POINTS   = 30;                             // Max slippage (points)

//====================================================================
//  CHART DATA SENDER
//====================================================================
input string  _h2               = "========== CHART DATA ==========";  // *** CHART DATA ***
input bool    ENABLE_CHART_DATA = true;                            // Send chart data to AI
input int     CHART_DATA_SECONDS = 60;                            // How often to send chart data (s)
input int     CANDLES_TO_SEND   = 50;                             // Candles per timeframe
input bool    INCLUDE_INDICATORS = true;                          // Include RSI/MACD/BB/ATR in payload

//====================================================================
//  TRADE COPIER  (manual trade relay)
//====================================================================
input string  _h3               = "========== TRADE COPIER =========="; // *** TRADE COPIER ***
input bool    ENABLE_TRADE_COPY = true;                            // Relay manual trades to TradeLocker
// Note: only trades with magic != MAGIC_NUMBER are relayed

//====================================================================
//  HEARTBEAT
//====================================================================
input string  _h4                 = "========== HEARTBEAT ==========";  // *** HEARTBEAT ***
input int     HEARTBEAT_SECONDS   = 30;                           // Heartbeat interval (s)
input bool    RECEIVE_SIGNALS_FLAG = true;                        // Should this terminal receive AI signals?
input bool    SHOW_CHART_COMMENT   = true;                        // Show status overlay on chart

//====================================================================
//  Globals
//====================================================================
string g_signalUrl;
string g_confirmUrl;
string g_chartDataUrl;
string g_tradeSignalUrl;
string g_heartbeatUrl;

datetime g_lastSignalPoll   = 0;
datetime g_lastChartData    = 0;
datetime g_lastHeartbeat    = 0;

// Signal tracking
struct ProcessedSignal { string id; datetime ts; };
ProcessedSignal g_processed[500];
int g_processedCount = 0;

// OnTrade dedup
ulong   g_reportedTickets[200];
int     g_reportedCount = 0;

CTrade g_trade;

//+------------------------------------------------------------------+
//| Utility: JSON escape                                              |
//+------------------------------------------------------------------+
string JsonEscape(string s)
{
   string o = "";
   for(int i = 0; i < StringLen(s); i++)
   {
      ushort c = StringGetCharacter(s, i);
      if(c == 92)       o += "\\\\";
      else if(c == 34)  o += "\\\"";
      else if(c == 10)  o += "\\n";
      else if(c == 13)  o += "\\r";
      else if(c == 9)   o += "\\t";
      else if(c < 32)   o += "";
      else if(c > 127)  o += StringFormat("\\u%04x", c);
      else              o += ShortToString(c);
   }
   return o;
}

//+------------------------------------------------------------------+
//| Utility: safe double for JSON                                     |
//+------------------------------------------------------------------+
double SafeDouble(double v)
{
   if(!MathIsValidNumber(v) || v == EMPTY_VALUE || v == DBL_MAX || v == -DBL_MAX) return 0.0;
   if(v > 1e15 || v < -1e15) return 0.0;
   string t = DoubleToString(v, 8);
   if(StringFind(t, "nan") >= 0 || StringFind(t, "inf") >= 0 || StringFind(t, "#") >= 0) return 0.0;
   return v;
}

//+------------------------------------------------------------------+
//| Utility: HTTP POST, returns response body or ""                   |
//+------------------------------------------------------------------+
string HttpPost(string url, string jsonBody)
{
   char   postData[];
   char   result[];
   string headers = "Content-Type: application/json\r\nX-API-Key: " + API_KEY + "\r\n";
   StringToCharArray(jsonBody, postData);
   // Remove null terminator that StringToCharArray appends
   int sz = ArraySize(postData);
   if(sz > 0 && postData[sz-1] == 0)
      ArrayResize(postData, sz - 1);
   string resHeaders;
   int code = WebRequest("POST", url, headers, TIMEOUT_MS, postData, result, resHeaders);
   if(code <= 0) return "";
   return CharArrayToString(result);
}

//+------------------------------------------------------------------+
//| Utility: HTTP GET, returns response body or ""                    |
//+------------------------------------------------------------------+
string HttpGet(string url)
{
   char   dummy[];
   char   result[];
   string headers = "Content-Type: application/json\r\nX-API-Key: " + API_KEY + "\r\n";
   string resHeaders;
   int code = WebRequest("GET", url, headers, TIMEOUT_MS, dummy, result, resHeaders);
   if(code <= 0) return "";
   return CharArrayToString(result);
}

//+------------------------------------------------------------------+
//| Check if a signal was already processed                           |
//+------------------------------------------------------------------+
bool IsProcessed(string id)
{
   for(int i = 0; i < g_processedCount; i++)
      if(g_processed[i].id == id) return true;
   return false;
}

void MarkProcessed(string id)
{
   if(g_processedCount >= 499)
   {
      // Shift left, drop oldest
      for(int i = 0; i < 498; i++) g_processed[i] = g_processed[i+1];
      g_processedCount = 498;
   }
   g_processed[g_processedCount].id = id;
   g_processed[g_processedCount].ts = TimeCurrent();
   g_processedCount++;
}

//+------------------------------------------------------------------+
//| Normalize symbol: strip "/" only                                  |
//+------------------------------------------------------------------+
string NormalizeSymbol(string sym)
{
   StringReplace(sym, "/", "");
   return sym;
}

//+------------------------------------------------------------------+
//| Dynamic filling mode detection                                    |
//+------------------------------------------------------------------+
ENUM_ORDER_TYPE_FILLING GetFillMode(string sym)
{
   long fillFlags = SymbolInfoInteger(sym, SYMBOL_FILLING_MODE);
   if((fillFlags & SYMBOL_FILLING_FOK) != 0) return ORDER_FILLING_FOK;
   if((fillFlags & SYMBOL_FILLING_IOC) != 0) return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
}

//+------------------------------------------------------------------+
//| JSON string extractor  (bounded by objEnd)                        |
//+------------------------------------------------------------------+
string ExtractString(string json, string key, int startPos, int endPos)
{
   string search = "\"" + key + "\":\"";
   int p = StringFind(json, search, startPos);
   if(p < 0 || p > endPos) return "";
   p += StringLen(search);
   int q = StringFind(json, "\"", p);
   if(q < 0 || q > endPos) return "";
   return StringSubstr(json, p, q - p);
}

string ExtractNumber(string json, string key, int startPos, int endPos)
{
   string search = "\"" + key + "\":";
   int p = StringFind(json, search, startPos);
   if(p < 0 || p > endPos) return "0";
   p += StringLen(search);
   // skip spaces
   while(p < endPos && StringGetCharacter(json, p) == ' ') p++;
   if(StringGetCharacter(json, p) == '"') { p++; }
   int q = p;
   ushort c;
   while(q < endPos)
   {
      c = StringGetCharacter(json, q);
      if(c == ',' || c == '}' || c == ']' || c == '"') break;
      q++;
   }
   string raw = StringSubstr(json, p, q - p);
   if(raw == "null" || raw == "") return "0";
   return raw;
}

//+------------------------------------------------------------------+
//| ── SIGNAL RECEIVER ────────────────────────────────────────────── |
//+------------------------------------------------------------------+
void PollAndExecuteSignals()
{
   string url = g_signalUrl + "?accountAlias=" + ACCOUNT_ALIAS;
   string resp = HttpGet(url);
   if(StringLen(resp) == 0) return;

   // Walk through signal objects
   int searchFrom = 0;
   while(true)
   {
      int objStart = StringFind(resp, "{", searchFrom);
      if(objStart < 0) break;
      int objEnd = StringFind(resp, "}", objStart);
      if(objEnd < 0) break;
      searchFrom = objEnd + 1;

      string id = ExtractString(resp, "id", objStart, objEnd);
      if(StringLen(id) == 0) continue;
      if(IsProcessed(id)) continue;

      string action    = ExtractString(resp, "action",      objStart, objEnd);
      string symbol    = ExtractString(resp, "symbol",      objStart, objEnd);
      string direction = ExtractString(resp, "direction",   objStart, objEnd);
      string lotStr    = ExtractNumber(resp, "lotSize",     objStart, objEnd);
      string entryStr  = ExtractNumber(resp, "entryPrice",  objStart, objEnd);
      string slStr     = ExtractNumber(resp, "stopLoss",    objStart, objEnd);
      string tpStr     = ExtractNumber(resp, "takeProfit",  objStart, objEnd);
      string posId     = ExtractString(resp, "positionId",  objStart, objEnd);
      string modAct    = ExtractString(resp, "modifyAction",objStart, objEnd);

      double lotSize   = StringToDouble(lotStr);
      double entry     = StringToDouble(entryStr);
      double sl        = StringToDouble(slStr);
      double tp        = StringToDouble(tpStr);

      bool ok = false;
      if(action == "OPEN")         ok = ExecuteOpen(symbol, direction, lotSize, entry, sl, tp, id);
      else if(action == "CLOSE")   ok = ExecuteClose(symbol, posId, id);
      else if(action == "MODIFY")  ok = ExecuteModify(symbol, posId, sl, tp, modAct, id);
      else if(action == "CLOSE_ALL") { CloseAllPositions(id); ok = true; }

      // Mark processed AFTER execution attempt (v2 fix)
      MarkProcessed(id);
      ConfirmSignal(id, ok);
   }
}

bool ExecuteOpen(string rawSym, string direction, double lotSize, double entry, double sl, double tp, string sigId)
{
   string sym = NormalizeSymbol(rawSym);
   if(!SymbolSelect(sym, true)) { Print("[VEDD] Symbol not found: ", sym); return false; }

   double ask = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid = SymbolInfoDouble(sym, SYMBOL_BID);
   int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

   ENUM_ORDER_TYPE orderType = (direction == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = (direction == "BUY") ? ask : bid;
   if(entry > 0) price = entry; // use specified entry if provided

   price = NormalizeDouble(price, digits);
   if(sl > 0) sl = NormalizeDouble(sl, digits);
   if(tp > 0) tp = NormalizeDouble(tp, digits);
   if(lotSize <= 0) lotSize = 0.01;

   ENUM_ORDER_TYPE_FILLING fill = GetFillMode(sym);

   MqlTradeRequest req = {};
   MqlTradeResult  res = {};
   ZeroMemory(req);
   ZeroMemory(res);

   req.action       = TRADE_ACTION_DEAL;
   req.symbol       = sym;
   req.volume       = lotSize;
   req.type         = orderType;
   req.price        = price;
   req.sl           = sl;
   req.tp           = tp;
   req.magic        = MAGIC_NUMBER;
   req.deviation    = SLIPPAGE_POINTS;
   req.type_filling = fill;
   req.comment      = "VEDD_AI_" + sigId;

   for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
   {
      ZeroMemory(res);
      if(OrderSend(req, res))
      {
         if(res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_DONE_PARTIAL)
         {
            Print("[VEDD] OPEN executed: ", direction, " ", sym, " lot=", lotSize, " ticket=", res.deal);
            return true;
         }
      }
      if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
   }
   Print("[VEDD] OPEN FAILED: ", sym, " retcode=", res.retcode, " (", res.comment, ")");
   return false;
}

bool ExecuteClose(string rawSym, string posId, string sigId)
{
   string sym = NormalizeSymbol(rawSym);
   ulong  targetTicket = (ulong)StringToInteger(posId);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;

      bool matchTicket = (targetTicket > 0 && ticket == targetTicket);
      bool matchSymbol = (PositionGetString(POSITION_SYMBOL) == sym);
      bool matchMagic  = (PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER);

      if(!(matchTicket || (matchSymbol && matchMagic && targetTicket == 0))) continue;

      MqlTradeRequest req = {};
      MqlTradeResult  res = {};
      ZeroMemory(req);
      ZeroMemory(res);

      req.action   = TRADE_ACTION_DEAL;
      req.position = ticket;
      req.symbol   = PositionGetString(POSITION_SYMBOL);
      req.volume   = PositionGetDouble(POSITION_VOLUME);
      req.magic    = MAGIC_NUMBER;
      req.deviation = SLIPPAGE_POINTS;
      req.type_filling = GetFillMode(req.symbol);
      req.comment  = "VEDD_CLOSE_" + sigId;

      ENUM_POSITION_TYPE ptype = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double closePrice;
      if(ptype == POSITION_TYPE_BUY) {
         req.type   = ORDER_TYPE_SELL;
         closePrice = SymbolInfoDouble(req.symbol, SYMBOL_BID);
      } else {
         req.type   = ORDER_TYPE_BUY;
         closePrice = SymbolInfoDouble(req.symbol, SYMBOL_ASK);
      }
      req.price = NormalizeDouble(closePrice, (int)SymbolInfoInteger(req.symbol, SYMBOL_DIGITS));

      for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
      {
         ZeroMemory(res);
         if(OrderSend(req, res))
            if(res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_DONE_PARTIAL)
            {
               Print("[VEDD] CLOSE executed: ticket=", ticket);
               return true;
            }
         if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
      }
      Print("[VEDD] CLOSE FAILED: ticket=", ticket, " retcode=", res.retcode);
      return false;
   }
   Print("[VEDD] CLOSE: no matching position found. sym=", sym, " posId=", posId);
   return false;
}

bool ExecuteModify(string rawSym, string posId, double newSL, double newTP, string modAct, string sigId)
{
   string sym = NormalizeSymbol(rawSym);
   ulong  targetTicket = (ulong)StringToInteger(posId);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;

      bool matchTicket = (targetTicket > 0 && ticket == targetTicket);
      bool matchSymbol = (PositionGetString(POSITION_SYMBOL) == sym);
      bool matchMagic  = (PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER);

      if(!(matchTicket || (matchSymbol && matchMagic && targetTicket == 0))) continue;

      string posSym = PositionGetString(POSITION_SYMBOL);
      int    digits = (int)SymbolInfoInteger(posSym, SYMBOL_DIGITS);
      double useSL  = (newSL > 0) ? NormalizeDouble(newSL, digits) : PositionGetDouble(POSITION_SL);
      double useTP  = (newTP > 0) ? NormalizeDouble(newTP, digits) : PositionGetDouble(POSITION_TP);

      MqlTradeRequest req = {};
      MqlTradeResult  res = {};
      ZeroMemory(req);
      ZeroMemory(res);

      req.action   = TRADE_ACTION_SLTP;
      req.position = ticket;
      req.symbol   = posSym;
      req.sl       = useSL;
      req.tp       = useTP;
      req.magic    = MAGIC_NUMBER;

      for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
      {
         ZeroMemory(res);
         if(OrderSend(req, res))
            if(res.retcode == TRADE_RETCODE_DONE)
            {
               Print("[VEDD] MODIFY executed: ticket=", ticket, " SL=", useSL, " TP=", useTP);
               return true;
            }
         if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
      }
      Print("[VEDD] MODIFY FAILED: ticket=", ticket, " retcode=", res.retcode);
      return false;
   }
   return false;
}

void CloseAllPositions(string sigId)
{
   // Snapshot tickets first to avoid iterator invalidation
   ulong tickets[];
   int total = PositionsTotal();
   ArrayResize(tickets, total);
   int count = 0;
   for(int i = 0; i < total; i++)
   {
      ulong t = PositionGetTicket(i);
      if(t > 0) { tickets[count] = t; count++; }
   }
   for(int i = 0; i < count; i++)
      ExecuteClose("", IntegerToString(tickets[i]), sigId + "_" + IntegerToString(i));
}

void ConfirmSignal(string sigId, bool executed)
{
   string body = StringFormat(
      "{\"signalId\":\"%s\",\"executed\":%s,\"accountAlias\":\"%s\"}",
      JsonEscape(sigId),
      executed ? "true" : "false",
      JsonEscape(ACCOUNT_ALIAS)
   );
   HttpPost(g_confirmUrl, body);
}

//+------------------------------------------------------------------+
//| ── CHART DATA SENDER ──────────────────────────────────────────── |
//+------------------------------------------------------------------+
void SendChartData()
{
   string sym    = Symbol();
   ENUM_TIMEFRAMES tf = Period();
   string tfStr;
   switch(tf)
   {
      case PERIOD_M1:  tfStr = "M1";  break;
      case PERIOD_M5:  tfStr = "M5";  break;
      case PERIOD_M15: tfStr = "M15"; break;
      case PERIOD_M30: tfStr = "M30"; break;
      case PERIOD_H1:  tfStr = "H1";  break;
      case PERIOD_H4:  tfStr = "H4";  break;
      case PERIOD_D1:  tfStr = "D1";  break;
      case PERIOD_W1:  tfStr = "W1";  break;
      default:         tfStr = "H1";  break;
   }

   int n = MathMin(CANDLES_TO_SEND, 200);
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(sym, tf, 0, n, rates);
   if(copied <= 0) return;

   // Build candles JSON array
   string candlesJson = "[";
   for(int i = copied - 1; i >= 0; i--)
   {
      if(i < copied - 1) candlesJson += ",";
      candlesJson += StringFormat(
         "{\"time\":%d,\"open\":%.5f,\"high\":%.5f,\"low\":%.5f,\"close\":%.5f,\"volume\":%.2f}",
         (long)rates[i].time,
         SafeDouble(rates[i].open),
         SafeDouble(rates[i].high),
         SafeDouble(rates[i].low),
         SafeDouble(rates[i].close),
         SafeDouble((double)rates[i].tick_volume)
      );
   }
   candlesJson += "]";

   // Optional indicators
   string indJson = "{}";
   if(INCLUDE_INDICATORS)
   {
      // RSI(14)
      double rsiVal = iRSI(sym, tf, 14, PRICE_CLOSE, 0);
      // MACD
      double macdMain = iMACD(sym, tf, 12, 26, 9, PRICE_CLOSE, MODE_MAIN, 0);
      double macdSig  = iMACD(sym, tf, 12, 26, 9, PRICE_CLOSE, MODE_SIGNAL, 0);
      // BB
      double bbUp  = iBands(sym, tf, 20, 2.0, 0, PRICE_CLOSE, MODE_UPPER, 0);
      double bbMid = iBands(sym, tf, 20, 2.0, 0, PRICE_CLOSE, MODE_MAIN,  0);
      double bbLow = iBands(sym, tf, 20, 2.0, 0, PRICE_CLOSE, MODE_LOWER, 0);
      // ATR(14)
      double atrVal = iATR(sym, tf, 14, 0);
      // EMA 20/50/200
      double ema20  = iMA(sym, tf, 20,  0, MODE_EMA, PRICE_CLOSE, 0);
      double ema50  = iMA(sym, tf, 50,  0, MODE_EMA, PRICE_CLOSE, 0);
      double ema200 = iMA(sym, tf, 200, 0, MODE_EMA, PRICE_CLOSE, 0);

      indJson = StringFormat(
         "{\"rsi\":%.4f,\"macd\":{\"main\":%.6f,\"signal\":%.6f},"
         "\"bb\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f},"
         "\"atr\":%.6f,\"ema20\":%.5f,\"ema50\":%.5f,\"ema200\":%.5f}",
         SafeDouble(rsiVal),
         SafeDouble(macdMain), SafeDouble(macdSig),
         SafeDouble(bbUp), SafeDouble(bbMid), SafeDouble(bbLow),
         SafeDouble(atrVal),
         SafeDouble(ema20), SafeDouble(ema50), SafeDouble(ema200)
      );
   }

   double balance  = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity   = AccountInfoDouble(ACCOUNT_EQUITY);
   double spread   = SymbolInfoInteger(sym, SYMBOL_SPREAD) * SymbolInfoDouble(sym, SYMBOL_POINT);
   double ask      = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid      = SymbolInfoDouble(sym, SYMBOL_BID);

   string body = StringFormat(
      "{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"candles\":%s,"
      "\"indicators\":%s,"
      "\"account\":{\"balance\":%.2f,\"equity\":%.2f},"
      "\"market\":{\"ask\":%.5f,\"bid\":%.5f,\"spread\":%.5f},"
      "\"accountAlias\":\"%s\",\"platform\":\"MT5\"}",
      JsonEscape(sym), tfStr, candlesJson,
      indJson,
      balance, equity,
      SafeDouble(ask), SafeDouble(bid), SafeDouble(spread),
      JsonEscape(ACCOUNT_ALIAS)
   );

   string resp = HttpPost(g_chartDataUrl, body);
   if(StringLen(resp) > 0)
      Print("[VEDD] Chart data sent: ", sym, "/", tfStr, " (", copied, " candles)");
   else
      Print("[VEDD] Chart data send failed for ", sym, "/", tfStr);
}

//+------------------------------------------------------------------+
//| ── HEARTBEAT ──────────────────────────────────────────────────── |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   string accNum  = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   string body    = StringFormat(
      "{\"accountAlias\":\"%s\",\"accountLabel\":\"%s\",\"accountNumber\":\"%s\","
      "\"receiveSignals\":%s,\"platform\":\"MT5\",\"symbol\":\"%s\"}",
      JsonEscape(ACCOUNT_ALIAS),
      JsonEscape(ACCOUNT_LABEL),
      JsonEscape(accNum),
      RECEIVE_SIGNALS_FLAG ? "true" : "false",
      JsonEscape(Symbol())
   );
   HttpPost(g_heartbeatUrl, body);
}

//+------------------------------------------------------------------+
//| ── TRADE COPIER (OnTrade relay) ───────────────────────────────── |
//+------------------------------------------------------------------+
bool IsAlreadyReported(ulong ticket)
{
   for(int i = 0; i < g_reportedCount; i++)
      if(g_reportedTickets[i] == ticket) return true;
   return false;
}

void MarkReported(ulong ticket)
{
   if(g_reportedCount >= 199)
   {
      for(int i = 0; i < 198; i++) g_reportedTickets[i] = g_reportedTickets[i+1];
      g_reportedCount = 198;
   }
   g_reportedTickets[g_reportedCount++] = ticket;
}

void ReportTradeToServer(ulong ticket, string action)
{
   if(!HistoryDealSelect(ticket)) return;

   long   magic     = HistoryDealGetInteger(ticket, DEAL_MAGIC);
   // Skip AI trades — engine already handled them
   if(magic == MAGIC_NUMBER) return;

   string sym       = HistoryDealGetString (ticket, DEAL_SYMBOL);
   double volume    = HistoryDealGetDouble (ticket, DEAL_VOLUME);
   double price     = HistoryDealGetDouble (ticket, DEAL_PRICE);
   double sl        = HistoryDealGetDouble (ticket, DEAL_SL);
   double tp        = HistoryDealGetDouble (ticket, DEAL_TP);
   long   dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
   string direction = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
   datetime openTime = (datetime)HistoryDealGetInteger(ticket, DEAL_TIME);
   string comment   = HistoryDealGetString(ticket, DEAL_COMMENT);

   string body = StringFormat(
      "{\"action\":\"%s\",\"symbol\":\"%s\",\"direction\":\"%s\","
      "\"volume\":%.2f,\"entryPrice\":%.5f,\"stopLoss\":%.5f,\"takeProfit\":%.5f,"
      "\"ticket\":%I64u,\"magic\":%I64d,\"comment\":\"%s\","
      "\"openTime\":%d,\"platform\":\"MT5\",\"accountAlias\":\"%s\"}",
      JsonEscape(action),
      JsonEscape(sym),
      direction,
      volume, price, sl, tp,
      ticket, magic,
      JsonEscape(comment),
      (long)openTime,
      JsonEscape(ACCOUNT_ALIAS)
   );
   HttpPost(g_tradeSignalUrl, body);
   MarkReported(ticket);
}

//+------------------------------------------------------------------+
//| OnTrade — called on every trade event                             |
//+------------------------------------------------------------------+
void OnTrade()
{
   if(!ENABLE_TRADE_COPY) return;

   // Scan recent deals
   datetime from = TimeCurrent() - 300; // last 5 min
   HistorySelect(from, TimeCurrent());
   int total = HistoryDealsTotal();
   for(int i = total - 1; i >= MathMax(0, total - 10); i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0) continue;
      if(IsAlreadyReported(ticket)) continue;

      long entry  = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      string act  = (entry == DEAL_ENTRY_IN) ? "OPEN" : "CLOSE";
      ReportTradeToServer(ticket, act);
   }
}

//+------------------------------------------------------------------+
//| OnTimer                                                           |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeCurrent();

   // Signal poll
   if(ENABLE_SIGNALS && now - g_lastSignalPoll >= SIGNAL_POLL_SECONDS)
   {
      g_lastSignalPoll = now;
      PollAndExecuteSignals();
   }

   // Chart data
   if(ENABLE_CHART_DATA && now - g_lastChartData >= CHART_DATA_SECONDS)
   {
      g_lastChartData = now;
      SendChartData();
   }

   // Heartbeat
   if(now - g_lastHeartbeat >= HEARTBEAT_SECONDS)
   {
      g_lastHeartbeat = now;
      SendHeartbeat();
   }

   UpdateChartComment();
}

//+------------------------------------------------------------------+
//| Chart comment                                                     |
//+------------------------------------------------------------------+
void UpdateChartComment()
{
   if(!SHOW_CHART_COMMENT) return;
   string status = "";
   status += "╔═══ VEDD Combined EA v1.00 ═══╗\n";
   status += "║ Alias  : " + ACCOUNT_ALIAS + "\n";
   status += "║ Label  : " + ACCOUNT_LABEL + "\n";
   status += "║ Signals: " + (ENABLE_SIGNALS    ? "ON  " : "OFF ") + "\n";
   status += "║ Chart  : " + (ENABLE_CHART_DATA ? "ON  " : "OFF ") + "\n";
   status += "║ Copy   : " + (ENABLE_TRADE_COPY ? "ON  " : "OFF ") + "\n";
   status += "║ Symbol : " + Symbol() + "\n";
   status += "╚══════════════════════════════╝\n";
   Comment(status);
}

//+------------------------------------------------------------------+
//| OnInit                                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   // Build endpoint URLs
   string base = SERVER_URL;
   // Trim trailing slash
   while(StringLen(base) > 0 && StringGetCharacter(base, StringLen(base)-1) == '/')
      base = StringSubstr(base, 0, StringLen(base)-1);

   g_signalUrl      = base + "/api/vedd-live-engine/mt5-signals";
   g_confirmUrl     = base + "/api/vedd-live-engine/mt5-signal-confirm";
   g_chartDataUrl   = base + "/api/mt5/chart-data";
   g_tradeSignalUrl = base + "/api/mt5-signal";
   g_heartbeatUrl   = base + "/api/mt5-accounts/heartbeat";

   if(StringLen(API_KEY) == 0)
   {
      Alert("[VEDD] API_KEY is empty! Enter your API key in EA settings.");
      return INIT_PARAMETERS_INCORRECT;
   }
   if(StringLen(ACCOUNT_ALIAS) == 0)
   {
      Alert("[VEDD] ACCOUNT_ALIAS is empty! Enter a unique alias for this terminal.");
      return INIT_PARAMETERS_INCORRECT;
   }

   g_trade.SetExpertMagicNumber(MAGIC_NUMBER);
   g_trade.SetDeviationInPoints(SLIPPAGE_POINTS);

   // Use 1s timer — we gate each action with its own interval
   EventSetTimer(1);

   // Immediate heartbeat on start
   SendHeartbeat();

   Print("[VEDD] Combined EA initialized. Alias=", ACCOUNT_ALIAS, " Signals=", ENABLE_SIGNALS,
         " ChartData=", ENABLE_CHART_DATA, " TradeCopy=", ENABLE_TRADE_COPY);

   UpdateChartComment();
   return INIT_SUCCEEDED;
}

//+------------------------------------------------------------------+
//| OnDeinit                                                          |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Comment("");
   Print("[VEDD] Combined EA stopped. Reason=", reason);
}
