//+------------------------------------------------------------------+
//|                                            VEDD_Combined_EA.mq5 |
//|                              VEDD Trading AI                     |
//|         Combined: Signal Receiver + Chart Data + Trade Copier   |
//+------------------------------------------------------------------+
//  v1.01  2026-05-19  — Fix: replaced MQL4-style indicator calls
//                        with proper MQL5 handle/CopyBuffer API
//
//  Single EA that replaces all three legacy EAs:
//    • VEDD_Signal_Receiver_EA   — poll + execute AI signals
//    • VEDD_ChartData_EA         — send live OHLCV + indicators to AI
//    • VEDD_TradeCopier_EA       — report manual trades to TradeLocker
//
//  FOR MT4: download VEDD_Combined_EA.mq4 instead
//+------------------------------------------------------------------+
#property copyright "VEDD Trading AI"
#property link      "https://veddbuild.com"
#property version   "1.01"
#property description "Combined EA: Signal Receiver + Chart Data + Trade Copier + Account Heartbeat"

#include <Trade\Trade.mqh>

//====================================================================
//  CONNECTION
//====================================================================
input string  _h0           = "========== CONNECTION ==========";   // *** CONNECTION ***
input string  SERVER_URL    = "https://veddbuild.com";               // Server Base URL (no trailing slash)
input string  API_KEY       = "";                                    // API Key from VEDD Dashboard
input string  ACCOUNT_ALIAS = "mt5_main";                           // Unique alias for this terminal
input string  ACCOUNT_LABEL = "";                                    // Display label — leave blank to auto-read from terminal
input int     TIMEOUT_MS    = 15000;                                 // HTTP Request Timeout (ms)

//====================================================================
//  SIGNAL RECEIVER
//====================================================================
input string  _h1              = "========== SIGNAL RECEIVER =========="; // *** SIGNALS ***
input bool    ENABLE_SIGNALS   = true;                               // Enable AI signal execution
input int     SIGNAL_POLL_SECONDS = 5;                               // How often to poll for signals (s)
input int     RETRY_ATTEMPTS   = 3;                                  // Order send retries on failure
input int     RETRY_DELAY_MS   = 500;                                // Delay between retries (ms)
input int     MAGIC_NUMBER     = 202500;                             // Magic for AI trades (do NOT change)
input int     SLIPPAGE_POINTS  = 30;                                 // Max slippage (points)

//====================================================================
//  CHART DATA SENDER
//====================================================================
input string  _h2                = "========== CHART DATA ==========";  // *** CHART DATA ***
input bool    ENABLE_CHART_DATA  = true;                             // Send chart data to AI
input int     CHART_DATA_SECONDS = 60;                               // How often to send chart data (s)
input int     CANDLES_TO_SEND    = 50;                               // Candles per timeframe
input bool    INCLUDE_INDICATORS = true;                             // Include RSI/MACD/BB/ATR/EMA

//====================================================================
//  TRADE COPIER  (manual trade relay)
//====================================================================
input string  _h3                = "========== TRADE COPIER =========="; // *** TRADE COPIER ***
input bool    ENABLE_TRADE_COPY  = true;                             // Relay manual trades to TradeLocker

//====================================================================
//  HEARTBEAT
//====================================================================
input string  _h4                  = "========== HEARTBEAT ==========";  // *** HEARTBEAT ***
input int     HEARTBEAT_SECONDS    = 30;                             // Heartbeat interval (s)
input bool    RECEIVE_SIGNALS_FLAG = true;                           // Should this terminal receive signals?
input bool    SHOW_CHART_COMMENT   = true;                           // Show status overlay on chart

//====================================================================
//  Globals — URLs
//====================================================================
string g_signalUrl;
string g_confirmUrl;
string g_chartDataUrl;
string g_tradeSignalUrl;
string g_heartbeatUrl;

//====================================================================
//  Globals — Auto-detected account info (populated in OnInit)
//====================================================================
string g_effectiveLabel  = "";   // ACCOUNT_LABEL or auto-read AccountName
string g_accountName     = "";   // terminal account owner name
string g_accountNumber   = "";   // login number
string g_brokerName      = "";   // broker company
string g_serverName      = "";   // trading server

//====================================================================
//  Globals — Timers
//====================================================================
datetime g_lastSignalPoll = 0;
datetime g_lastChartData  = 0;
datetime g_lastHeartbeat  = 0;

//====================================================================
//  Globals — Indicator handles  (created in OnInit, released OnDeinit)
//====================================================================
int g_rsiH    = INVALID_HANDLE;
int g_macdH   = INVALID_HANDLE;
int g_bbH     = INVALID_HANDLE;
int g_atrH    = INVALID_HANDLE;
int g_ema20H  = INVALID_HANDLE;
int g_ema50H  = INVALID_HANDLE;
int g_ema200H = INVALID_HANDLE;

//====================================================================
//  Globals — Signal / Trade dedup
//====================================================================
struct ProcessedSignal { string id; datetime ts; };
ProcessedSignal g_processed[500];
int g_processedCount = 0;

ulong g_reportedTickets[200];
int   g_reportedCount = 0;

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
      if(c == 92)      o += "\\\\";
      else if(c == 34) o += "\\\"";
      else if(c == 10) o += "\\n";
      else if(c == 13) o += "\\r";
      else if(c == 9)  o += "\\t";
      else if(c < 32)  o += "";
      else if(c > 127) o += StringFormat("\\u%04x", c);
      else             o += ShortToString(c);
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
//| Utility: HTTP POST                                                |
//+------------------------------------------------------------------+
string HttpPost(string url, string jsonBody)
{
   char   postData[];
   char   result[];
   string headers = "Content-Type: application/json\r\nX-API-Key: " + API_KEY + "\r\n";
   StringToCharArray(jsonBody, postData);
   int sz = ArraySize(postData);
   if(sz > 0 && postData[sz-1] == 0) ArrayResize(postData, sz - 1);
   string resHeaders;
   int code = WebRequest("POST", url, headers, TIMEOUT_MS, postData, result, resHeaders);
   if(code <= 0) return "";
   return CharArrayToString(result);
}

//+------------------------------------------------------------------+
//| Utility: HTTP GET                                                 |
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
//| Signal dedup helpers                                              |
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
      for(int i = 0; i < 498; i++) g_processed[i] = g_processed[i+1];
      g_processedCount = 498;
   }
   g_processed[g_processedCount].id = id;
   g_processed[g_processedCount].ts = TimeCurrent();
   g_processedCount++;
}

//+------------------------------------------------------------------+
//| Symbol normalizer                                                 |
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
   long f = SymbolInfoInteger(sym, SYMBOL_FILLING_MODE);
   if((f & SYMBOL_FILLING_FOK) != 0) return ORDER_FILLING_FOK;
   if((f & SYMBOL_FILLING_IOC) != 0) return ORDER_FILLING_IOC;
   return ORDER_FILLING_RETURN;
}

//+------------------------------------------------------------------+
//| Lightweight JSON field extractors                                 |
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
   while(p < endPos && StringGetCharacter(json, p) == ' ') p++;
   if(StringGetCharacter(json, p) == '"') p++;
   int q = p;
   while(q < endPos)
   {
      ushort c = StringGetCharacter(json, q);
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
   string url  = g_signalUrl + "?accountAlias=" + ACCOUNT_ALIAS;
   string resp = HttpGet(url);
   if(StringLen(resp) == 0) return;

   int searchFrom = 0;
   while(true)
   {
      int objStart = StringFind(resp, "{", searchFrom);
      if(objStart < 0) break;
      int objEnd   = StringFind(resp, "}", objStart);
      if(objEnd < 0) break;
      searchFrom = objEnd + 1;

      string id = ExtractString(resp, "id", objStart, objEnd);
      if(StringLen(id) == 0) continue;
      if(IsProcessed(id)) continue;

      string action    = ExtractString(resp, "action",       objStart, objEnd);
      string symbol    = ExtractString(resp, "symbol",       objStart, objEnd);
      string direction = ExtractString(resp, "direction",    objStart, objEnd);
      string lotStr    = ExtractNumber(resp, "lotSize",      objStart, objEnd);
      string entryStr  = ExtractNumber(resp, "entryPrice",   objStart, objEnd);
      string slStr     = ExtractNumber(resp, "stopLoss",     objStart, objEnd);
      string tpStr     = ExtractNumber(resp, "takeProfit",   objStart, objEnd);
      string posId     = ExtractString(resp, "positionId",   objStart, objEnd);
      string modAct    = ExtractString(resp, "modifyAction", objStart, objEnd);

      double lotSize = StringToDouble(lotStr);
      double entry   = StringToDouble(entryStr);
      double sl      = StringToDouble(slStr);
      double tp      = StringToDouble(tpStr);

      bool ok = false;
      if(action == "OPEN")          ok = ExecuteOpen(symbol, direction, lotSize, entry, sl, tp, id);
      else if(action == "CLOSE")    ok = ExecuteClose(symbol, posId, id);
      else if(action == "MODIFY")   ok = ExecuteModify(symbol, posId, sl, tp, modAct, id);
      else if(action == "CLOSE_ALL"){ CloseAllPositions(id); ok = true; }

      MarkProcessed(id);
      ConfirmSignal(id, ok);
   }
}

bool ExecuteOpen(string rawSym, string direction, double lotSize, double entry,
                 double sl, double tp, string sigId)
{
   string sym = NormalizeSymbol(rawSym);
   if(!SymbolSelect(sym, true)) { Print("[VEDD] Symbol not found: ", sym); return false; }

   int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   ENUM_ORDER_TYPE orderType = (direction == "BUY") ? ORDER_TYPE_BUY : ORDER_TYPE_SELL;
   double price = (direction == "BUY") ? SymbolInfoDouble(sym, SYMBOL_ASK)
                                       : SymbolInfoDouble(sym, SYMBOL_BID);
   if(entry > 0) price = entry;

   price = NormalizeDouble(price, digits);
   if(sl > 0) sl = NormalizeDouble(sl, digits);
   if(tp > 0) tp = NormalizeDouble(tp, digits);
   if(lotSize <= 0) lotSize = 0.01;

   ENUM_ORDER_TYPE_FILLING fill = GetFillMode(sym);

   MqlTradeRequest req = {};
   MqlTradeResult  res = {};

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
      if(OrderSend(req, res) &&
         (res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_DONE_PARTIAL))
      {
         Print("[VEDD] OPEN: ", direction, " ", sym, " lot=", lotSize, " ticket=", res.deal);
         return true;
      }
      if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
   }
   Print("[VEDD] OPEN FAILED: ", sym, " retcode=", res.retcode, " (", res.comment, ")");
   return false;
}

bool ExecuteClose(string rawSym, string posId, string sigId)
{
   string sym           = NormalizeSymbol(rawSym);
   ulong  targetTicket  = (ulong)StringToInteger(posId);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;

      bool matchTicket = (targetTicket > 0 && ticket == targetTicket);
      bool matchSymbol = (PositionGetString(POSITION_SYMBOL) == sym &&
                          PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER &&
                          targetTicket == 0);
      if(!matchTicket && !matchSymbol) continue;

      string posSym  = PositionGetString(POSITION_SYMBOL);
      int    digits  = (int)SymbolInfoInteger(posSym, SYMBOL_DIGITS);
      ENUM_POSITION_TYPE ptype = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);

      MqlTradeRequest req = {};
      MqlTradeResult  res = {};
      req.action      = TRADE_ACTION_DEAL;
      req.position    = ticket;
      req.symbol      = posSym;
      req.volume      = PositionGetDouble(POSITION_VOLUME);
      req.magic       = MAGIC_NUMBER;
      req.deviation   = SLIPPAGE_POINTS;
      req.type_filling = GetFillMode(posSym);
      req.comment     = "VEDD_CLOSE_" + sigId;

      if(ptype == POSITION_TYPE_BUY) {
         req.type  = ORDER_TYPE_SELL;
         req.price = NormalizeDouble(SymbolInfoDouble(posSym, SYMBOL_BID), digits);
      } else {
         req.type  = ORDER_TYPE_BUY;
         req.price = NormalizeDouble(SymbolInfoDouble(posSym, SYMBOL_ASK), digits);
      }

      for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
      {
         ZeroMemory(res);
         if(OrderSend(req, res) &&
            (res.retcode == TRADE_RETCODE_DONE || res.retcode == TRADE_RETCODE_DONE_PARTIAL))
         {
            Print("[VEDD] CLOSE: ticket=", ticket);
            return true;
         }
         if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
      }
      Print("[VEDD] CLOSE FAILED: ticket=", ticket, " retcode=", res.retcode);
      return false;
   }
   Print("[VEDD] CLOSE: no matching position. sym=", sym, " posId=", posId);
   return false;
}

bool ExecuteModify(string rawSym, string posId, double newSL, double newTP,
                   string modAct, string sigId)
{
   string sym          = NormalizeSymbol(rawSym);
   ulong  targetTicket = (ulong)StringToInteger(posId);

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      if(!PositionSelectByTicket(ticket)) continue;

      bool matchTicket = (targetTicket > 0 && ticket == targetTicket);
      bool matchSymbol = (PositionGetString(POSITION_SYMBOL) == sym &&
                          PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER &&
                          targetTicket == 0);
      if(!matchTicket && !matchSymbol) continue;

      string posSym = PositionGetString(POSITION_SYMBOL);
      int    digits = (int)SymbolInfoInteger(posSym, SYMBOL_DIGITS);
      double useSL  = (newSL > 0) ? NormalizeDouble(newSL, digits) : PositionGetDouble(POSITION_SL);
      double useTP  = (newTP > 0) ? NormalizeDouble(newTP, digits) : PositionGetDouble(POSITION_TP);

      MqlTradeRequest req = {};
      MqlTradeResult  res = {};
      req.action   = TRADE_ACTION_SLTP;
      req.position = ticket;
      req.symbol   = posSym;
      req.sl       = useSL;
      req.tp       = useTP;
      req.magic    = MAGIC_NUMBER;

      for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
      {
         ZeroMemory(res);
         if(OrderSend(req, res) && res.retcode == TRADE_RETCODE_DONE)
         {
            Print("[VEDD] MODIFY: ticket=", ticket, " SL=", useSL, " TP=", useTP);
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
//| Indicator helpers — read one value from a handle safely          |
//+------------------------------------------------------------------+
double IndVal(int handle, int bufIdx = 0)
{
   if(handle == INVALID_HANDLE) return 0.0;
   double buf[];
   ArraySetAsSeries(buf, true);
   if(CopyBuffer(handle, bufIdx, 0, 1, buf) <= 0) return 0.0;
   return SafeDouble(buf[0]);
}

//+------------------------------------------------------------------+
//| ── CHART DATA SENDER ──────────────────────────────────────────── |
//+------------------------------------------------------------------+
void SendChartData()
{
   string          sym = Symbol();
   ENUM_TIMEFRAMES tf  = Period();

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

   int      n = MathMin(CANDLES_TO_SEND, 200);
   MqlRates rates[];
   ArraySetAsSeries(rates, true);
   int copied = CopyRates(sym, tf, 0, n, rates);
   if(copied <= 0) return;

   // ── Candles JSON ────────────────────────────────────────────────
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

   // ── Indicators JSON (MQL5 handle/CopyBuffer API) ─────────────────
   string indJson = "{}";
   if(INCLUDE_INDICATORS)
   {
      // Re-create handles if chart symbol/TF changed since OnInit
      // (handles are symbol+TF specific; OnInit creates them once)
      double rsiVal   = IndVal(g_rsiH,    0);   // RSI main
      double macdMain = IndVal(g_macdH,   0);   // MACD main line
      double macdSig  = IndVal(g_macdH,   1);   // MACD signal line
      double bbUpper  = IndVal(g_bbH,     1);   // Bands upper
      double bbMid    = IndVal(g_bbH,     0);   // Bands middle
      double bbLower  = IndVal(g_bbH,     2);   // Bands lower
      double atrVal   = IndVal(g_atrH,    0);   // ATR
      double ema20    = IndVal(g_ema20H,  0);
      double ema50    = IndVal(g_ema50H,  0);
      double ema200   = IndVal(g_ema200H, 0);

      indJson = StringFormat(
         "{\"rsi\":%.4f,\"macd\":{\"main\":%.6f,\"signal\":%.6f},"
         "\"bb\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f},"
         "\"atr\":%.6f,\"ema20\":%.5f,\"ema50\":%.5f,\"ema200\":%.5f}",
         SafeDouble(rsiVal),
         SafeDouble(macdMain), SafeDouble(macdSig),
         SafeDouble(bbUpper), SafeDouble(bbMid), SafeDouble(bbLower),
         SafeDouble(atrVal),
         SafeDouble(ema20), SafeDouble(ema50), SafeDouble(ema200)
      );
   }

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);
   double spread  = (double)SymbolInfoInteger(sym, SYMBOL_SPREAD) * SymbolInfoDouble(sym, SYMBOL_POINT);
   double ask     = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid     = SymbolInfoDouble(sym, SYMBOL_BID);

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
   Print("[VEDD] Chart data ", StringLen(resp) > 0 ? "sent" : "FAILED", ": ", sym, "/", tfStr,
         " (", copied, " candles)");
}

//+------------------------------------------------------------------+
//| ── HEARTBEAT ──────────────────────────────────────────────────── |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   string body = StringFormat(
      "{\"accountAlias\":\"%s\",\"accountLabel\":\"%s\",\"accountNumber\":\"%s\","
      "\"accountName\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\","
      "\"balance\":%.2f,\"equity\":%.2f,"
      "\"receiveSignals\":%s,\"platform\":\"MT5\",\"symbol\":\"%s\"}",
      JsonEscape(ACCOUNT_ALIAS),
      JsonEscape(g_effectiveLabel),
      JsonEscape(g_accountNumber),
      JsonEscape(g_accountName),
      JsonEscape(g_brokerName),
      JsonEscape(g_serverName),
      bal, eq,
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

void ReportDealToServer(ulong ticket, string action)
{
   if(!HistoryDealSelect(ticket)) return;
   long magic = HistoryDealGetInteger(ticket, DEAL_MAGIC);
   if(magic == MAGIC_NUMBER) return; // skip AI trades

   string sym       = HistoryDealGetString (ticket, DEAL_SYMBOL);
   double volume    = HistoryDealGetDouble (ticket, DEAL_VOLUME);
   double price     = HistoryDealGetDouble (ticket, DEAL_PRICE);
   double sl        = HistoryDealGetDouble (ticket, DEAL_SL);
   double tp        = HistoryDealGetDouble (ticket, DEAL_TP);
   long   dealType  = HistoryDealGetInteger(ticket, DEAL_TYPE);
   string direction = (dealType == DEAL_TYPE_BUY) ? "BUY" : "SELL";
   long   openTime  = HistoryDealGetInteger(ticket, DEAL_TIME);
   string comment   = HistoryDealGetString (ticket, DEAL_COMMENT);

   string body = StringFormat(
      "{\"action\":\"%s\",\"symbol\":\"%s\",\"direction\":\"%s\","
      "\"volume\":%.2f,\"entryPrice\":%.5f,\"stopLoss\":%.5f,\"takeProfit\":%.5f,"
      "\"ticket\":%I64u,\"magic\":%I64d,\"comment\":\"%s\","
      "\"openTime\":%I64d,\"platform\":\"MT5\",\"accountAlias\":\"%s\"}",
      JsonEscape(action),
      JsonEscape(sym),
      direction,
      volume, price, sl, tp,
      ticket, magic,
      JsonEscape(comment),
      openTime,
      JsonEscape(ACCOUNT_ALIAS)
   );
   HttpPost(g_tradeSignalUrl, body);
   MarkReported(ticket);
}

void OnTrade()
{
   if(!ENABLE_TRADE_COPY) return;
   datetime from = TimeCurrent() - 300;
   HistorySelect(from, TimeCurrent());
   int total = HistoryDealsTotal();
   for(int i = total - 1; i >= MathMax(0, total - 10); i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket == 0 || IsAlreadyReported(ticket)) continue;
      long entry = HistoryDealGetInteger(ticket, DEAL_ENTRY);
      ReportDealToServer(ticket, (entry == DEAL_ENTRY_IN) ? "OPEN" : "CLOSE");
   }
}

//+------------------------------------------------------------------+
//| Chart comment                                                     |
//+------------------------------------------------------------------+
void UpdateChartComment()
{
   if(!SHOW_CHART_COMMENT) { Comment(""); return; }

   double bal = AccountInfoDouble(ACCOUNT_BALANCE);
   double eq  = AccountInfoDouble(ACCOUNT_EQUITY);
   string cur = AccountInfoString(ACCOUNT_CURRENCY);
   string tfStr;
   switch(Period())
   {
      case PERIOD_M1:  tfStr="M1";  break; case PERIOD_M5:  tfStr="M5";  break;
      case PERIOD_M15: tfStr="M15"; break; case PERIOD_M30: tfStr="M30"; break;
      case PERIOD_H1:  tfStr="H1";  break; case PERIOD_H4:  tfStr="H4";  break;
      case PERIOD_D1:  tfStr="D1";  break; case PERIOD_W1:  tfStr="W1";  break;
      default:         tfStr="H1";  break;
   }

   string s = "";
   s += "╔══════════════════════════════════════╗\n";
   s += "║   VEDD Combined EA v1.01 — MT5       ║\n";
   s += "╠══════════════════════════════════════╣\n";
   s += "║ Account : " + g_accountName                                + "\n";
   s += "║ Number  : #" + g_accountNumber                             + "\n";
   s += "║ Broker  : " + g_brokerName                                 + "\n";
   s += "║ Server  : " + g_serverName                                 + "\n";
   s += "║ Balance : " + DoubleToString(bal, 2) + " " + cur           + "\n";
   s += "║ Equity  : " + DoubleToString(eq,  2) + " " + cur           + "\n";
   s += "╠══════════════════════════════════════╣\n";
   s += "║ Alias   : " + ACCOUNT_ALIAS                                + "\n";
   s += "║ Chart   : " + Symbol() + " (" + tfStr + ")"                + "\n";
   s += "║ Signals : " + (ENABLE_SIGNALS    ? "ON " : "OFF")
      + "  |  Chart Data: " + (ENABLE_CHART_DATA ? "ON " : "OFF")    + "\n";
   s += "║ Copy    : " + (ENABLE_TRADE_COPY ? "ON " : "OFF")
      + "  |  Heartbeat : " + IntegerToString(HEARTBEAT_SECONDS) + "s" + "\n";
   s += "╠══════════════════════════════════════╣\n";
   s += "║ ★ ONE CHART ONLY — attach to any one ║\n";
   s += "║   chart. Signals execute on all      ║\n";
   s += "║   pairs automatically.               ║\n";
   s += "╚══════════════════════════════════════╝\n";
   Comment(s);
}

//+------------------------------------------------------------------+
//| OnTimer                                                           |
//+------------------------------------------------------------------+
void OnTimer()
{
   datetime now = TimeCurrent();

   if(ENABLE_SIGNALS && now - g_lastSignalPoll >= SIGNAL_POLL_SECONDS)
   {
      g_lastSignalPoll = now;
      PollAndExecuteSignals();
   }
   if(ENABLE_CHART_DATA && now - g_lastChartData >= CHART_DATA_SECONDS)
   {
      g_lastChartData = now;
      SendChartData();
   }
   if(now - g_lastHeartbeat >= HEARTBEAT_SECONDS)
   {
      g_lastHeartbeat = now;
      SendHeartbeat();
   }

   UpdateChartComment();
}

//+------------------------------------------------------------------+
//| OnInit                                                            |
//+------------------------------------------------------------------+
int OnInit()
{
   // Build endpoint URLs
   string base = SERVER_URL;
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
      Alert("[VEDD] ACCOUNT_ALIAS is empty! Enter a unique alias in EA settings.");
      return INIT_PARAMETERS_INCORRECT;
   }

   // Auto-read account info from terminal
   g_accountName   = AccountInfoString(ACCOUNT_NAME);
   g_accountNumber = IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN));
   g_brokerName    = AccountInfoString(ACCOUNT_COMPANY);
   g_serverName    = AccountInfoString(ACCOUNT_SERVER);
   g_effectiveLabel = (StringLen(ACCOUNT_LABEL) > 0) ? ACCOUNT_LABEL : g_accountName;

   // Create indicator handles for the current chart symbol/timeframe
   // These are reused every time SendChartData() runs (every 60s)
   if(INCLUDE_INDICATORS)
   {
      string s = Symbol();
      ENUM_TIMEFRAMES tf = Period();
      g_rsiH    = iRSI(s, tf, 14, PRICE_CLOSE);
      g_macdH   = iMACD(s, tf, 12, 26, 9, PRICE_CLOSE);
      g_bbH     = iBands(s, tf, 20, 0, 2.0, PRICE_CLOSE);
      g_atrH    = iATR(s, tf, 14);
      g_ema20H  = iMA(s, tf, 20,  0, MODE_EMA, PRICE_CLOSE);
      g_ema50H  = iMA(s, tf, 50,  0, MODE_EMA, PRICE_CLOSE);
      g_ema200H = iMA(s, tf, 200, 0, MODE_EMA, PRICE_CLOSE);
   }

   g_trade.SetExpertMagicNumber(MAGIC_NUMBER);
   g_trade.SetDeviationInPoints(SLIPPAGE_POINTS);

   EventSetTimer(1);
   SendHeartbeat();

   Print("[VEDD] MT5 Combined EA v1.01 initialized. Alias=", ACCOUNT_ALIAS,
         " Signals=", ENABLE_SIGNALS, " ChartData=", ENABLE_CHART_DATA,
         " TradeCopy=", ENABLE_TRADE_COPY);
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

   // Release indicator handles
   if(g_rsiH    != INVALID_HANDLE) IndicatorRelease(g_rsiH);
   if(g_macdH   != INVALID_HANDLE) IndicatorRelease(g_macdH);
   if(g_bbH     != INVALID_HANDLE) IndicatorRelease(g_bbH);
   if(g_atrH    != INVALID_HANDLE) IndicatorRelease(g_atrH);
   if(g_ema20H  != INVALID_HANDLE) IndicatorRelease(g_ema20H);
   if(g_ema50H  != INVALID_HANDLE) IndicatorRelease(g_ema50H);
   if(g_ema200H != INVALID_HANDLE) IndicatorRelease(g_ema200H);

   Print("[VEDD] MT5 Combined EA stopped. Reason=", reason);
}
