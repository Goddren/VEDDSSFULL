//+------------------------------------------------------------------+
//|                                            VEDD_Combined_EA.mq4 |
//|                              VEDD Trading AI                     |
//|         Combined: Signal Receiver + Chart Data + Trade Copier   |
//+------------------------------------------------------------------+
//  v1.01  2026-05-19
//
//  MT4 port of the VEDD Combined EA. Identical features to the MT5
//  version but uses MQL4 trade / history / indicator APIs.
//
//    • Signal Receiver  — polls AI signals every 5 s, executes trades
//    • Chart Data Sender — sends OHLCV + indicators every 60 s
//    • Trade Copier      — detects manual trades, relays to TradeLocker
//    • Heartbeat         — pings dashboard every 30 s (online indicator)
//
//  FOR MT5: download VEDD_Combined_EA.mq5 instead
//+------------------------------------------------------------------+
#property copyright "VEDD Trading AI"
#property link      "https://veddbuild.com"
#property version   "1.01"
#property description "Combined EA (MT4): Signal Receiver + Chart Data + Trade Copier"
#property strict

//====================================================================
//  CONNECTION
//====================================================================
input string  _h0           = "========== CONNECTION ==========";   // *** CONNECTION ***
input string  SERVER_URL    = "https://veddbuild.com";               // Server Base URL (no trailing slash)
input string  API_KEY       = "";                                    // API Key from VEDD Dashboard
input string  ACCOUNT_ALIAS = "mt4_main";                           // Unique alias for this terminal
input string  ACCOUNT_LABEL = "";                                    // Display label — leave blank to auto-read from terminal
input int     TIMEOUT_MS    = 15000;                                 // HTTP Request Timeout (ms)

//====================================================================
//  SIGNAL RECEIVER
//====================================================================
input string  _h1               = "========== SIGNAL RECEIVER =========="; // *** SIGNALS ***
input bool    ENABLE_SIGNALS    = true;                              // Enable AI signal execution
input int     SIGNAL_POLL_SECONDS = 5;                              // How often to poll for signals (s)
input int     RETRY_ATTEMPTS    = 3;                                 // Order send retries on failure
input int     RETRY_DELAY_MS    = 500;                               // Delay between retries (ms)
input int     MAGIC_NUMBER      = 202500;                            // Magic for AI trades (do NOT change)
input int     SLIPPAGE_POINTS   = 30;                                // Max slippage (points)

//====================================================================
//  CHART DATA SENDER
//====================================================================
input string  _h2                = "========== CHART DATA ==========";  // *** CHART DATA ***
input bool    ENABLE_CHART_DATA  = true;                             // Send chart data to AI
input int     CHART_DATA_SECONDS = 60;                               // How often to send chart data (s)
input int     CANDLES_TO_SEND    = 50;                               // Candles per timeframe
input bool    INCLUDE_INDICATORS = true;                             // Include RSI/MACD/BB/ATR/EMA
input string  SYMBOLS_LIST      = "";                                // Pairs to monitor, comma-separated (blank = current chart only)

//====================================================================
//  TRADE COPIER
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
//  Globals — Multi-symbol list
//====================================================================
#define VEDD_MAX_SYM 20
int    g_symCount = 0;
string g_symList[VEDD_MAX_SYM];

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
//  Globals — Signal dedup
//====================================================================
string g_processedIds[500];
int    g_processedCount = 0;

//====================================================================
//  Globals — Trade copier dedup (ticket → int in MT4)
//====================================================================
int  g_reportedTickets[500];
int  g_reportedCount = 0;

//+------------------------------------------------------------------+
//| JSON escape                                                       |
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
//| Safe double for JSON                                              |
//+------------------------------------------------------------------+
double SafeDouble(double v)
{
   if(v == EMPTY_VALUE || v == DBL_MAX || v == -DBL_MAX) return 0.0;
   if(!MathIsValidNumber(v)) return 0.0;
   if(v > 1e15 || v < -1e15) return 0.0;
   string t = DoubleToString(v, 8);
   if(StringFind(t, "nan") >= 0 || StringFind(t, "inf") >= 0 || StringFind(t, "#") >= 0) return 0.0;
   return v;
}

//+------------------------------------------------------------------+
//| HTTP POST  (MT4 WebRequest — requires Tools → Options → Allow)   |
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
//| HTTP GET                                                          |
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
      if(g_processedIds[i] == id) return true;
   return false;
}

void MarkProcessed(string id)
{
   if(g_processedCount >= 499)
   {
      for(int i = 0; i < 498; i++) g_processedIds[i] = g_processedIds[i+1];
      g_processedCount = 498;
   }
   g_processedIds[g_processedCount++] = id;
}

//+------------------------------------------------------------------+
//| Trade copier dedup helpers                                        |
//+------------------------------------------------------------------+
bool IsAlreadyReported(int ticket)
{
   for(int i = 0; i < g_reportedCount; i++)
      if(g_reportedTickets[i] == ticket) return true;
   return false;
}

void MarkReported(int ticket)
{
   if(g_reportedCount >= 499)
   {
      for(int i = 0; i < 498; i++) g_reportedTickets[i] = g_reportedTickets[i+1];
      g_reportedCount = 498;
   }
   g_reportedTickets[g_reportedCount++] = ticket;
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
//| JSON field extractors                                             |
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
      if(action == "OPEN")           ok = ExecuteOpen(symbol, direction, lotSize, entry, sl, tp, id);
      else if(action == "CLOSE")     ok = ExecuteClose(symbol, posId, id);
      else if(action == "MODIFY")    ok = ExecuteModify(symbol, posId, sl, tp, modAct, id);
      else if(action == "CLOSE_ALL") { CloseAllPositions(id); ok = true; }

      MarkProcessed(id);
      ConfirmSignal(id, ok);
   }
}

//+------------------------------------------------------------------+
//| Execute Open (MT4 OrderSend)                                      |
//+------------------------------------------------------------------+
bool ExecuteOpen(string rawSym, string direction, double lotSize,
                 double entry, double sl, double tp, string sigId)
{
   string sym    = NormalizeSymbol(rawSym);
   int    cmd    = (direction == "BUY") ? OP_BUY : OP_SELL;
   int    digits = (int)MarketInfo(sym, MODE_DIGITS);
   double price  = (direction == "BUY") ? MarketInfo(sym, MODE_ASK)
                                        : MarketInfo(sym, MODE_BID);
   if(entry > 0) price = entry;

   price = NormalizeDouble(price, digits);
   if(sl > 0) sl = NormalizeDouble(sl, digits);
   if(tp > 0) tp = NormalizeDouble(tp, digits);
   if(lotSize <= 0) lotSize = 0.01;

   for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
   {
      int ticket = OrderSend(sym, cmd, lotSize, price, SLIPPAGE_POINTS,
                             sl, tp, "VEDD_AI_" + sigId, MAGIC_NUMBER, 0, clrNONE);
      if(ticket > 0)
      {
         Print("[VEDD] OPEN: ", direction, " ", sym, " lot=", lotSize, " ticket=", ticket);
         return true;
      }
      if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
   }
   Print("[VEDD] OPEN FAILED: ", sym, " error=", GetLastError());
   return false;
}

//+------------------------------------------------------------------+
//| Execute Close (MT4 OrderClose)                                    |
//+------------------------------------------------------------------+
bool ExecuteClose(string rawSym, string posId, string sigId)
{
   string sym          = NormalizeSymbol(rawSym);
   int    targetTicket = (int)StringToInteger(posId);

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;

      bool matchTicket = (targetTicket > 0 && OrderTicket() == targetTicket);
      bool matchSymbol = (OrderSymbol() == sym &&
                          OrderMagicNumber() == MAGIC_NUMBER &&
                          targetTicket == 0);
      if(!matchTicket && !matchSymbol) continue;

      double closePrice = (OrderType() == OP_BUY)
                          ? MarketInfo(OrderSymbol(), MODE_BID)
                          : MarketInfo(OrderSymbol(), MODE_ASK);

      for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
      {
         if(OrderClose(OrderTicket(), OrderLots(), closePrice, SLIPPAGE_POINTS, clrNONE))
         {
            Print("[VEDD] CLOSE: ticket=", OrderTicket());
            return true;
         }
         if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
      }
      Print("[VEDD] CLOSE FAILED: ticket=", OrderTicket(), " error=", GetLastError());
      return false;
   }
   Print("[VEDD] CLOSE: no matching position. sym=", sym, " posId=", posId);
   return false;
}

//+------------------------------------------------------------------+
//| Execute Modify (MT4 OrderModify)                                  |
//+------------------------------------------------------------------+
bool ExecuteModify(string rawSym, string posId, double newSL, double newTP,
                   string modAct, string sigId)
{
   string sym          = NormalizeSymbol(rawSym);
   int    targetTicket = (int)StringToInteger(posId);

   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;

      bool matchTicket = (targetTicket > 0 && OrderTicket() == targetTicket);
      bool matchSymbol = (OrderSymbol() == sym &&
                          OrderMagicNumber() == MAGIC_NUMBER &&
                          targetTicket == 0);
      if(!matchTicket && !matchSymbol) continue;

      int    digits = (int)MarketInfo(OrderSymbol(), MODE_DIGITS);
      double useSL  = (newSL > 0) ? NormalizeDouble(newSL, digits) : OrderStopLoss();
      double useTP  = (newTP > 0) ? NormalizeDouble(newTP, digits) : OrderTakeProfit();

      for(int attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++)
      {
         if(OrderModify(OrderTicket(), OrderOpenPrice(), useSL, useTP, 0, clrNONE))
         {
            Print("[VEDD] MODIFY: ticket=", OrderTicket(), " SL=", useSL, " TP=", useTP);
            return true;
         }
         if(attempt < RETRY_ATTEMPTS) Sleep(RETRY_DELAY_MS);
      }
      Print("[VEDD] MODIFY FAILED: ticket=", OrderTicket(), " error=", GetLastError());
      return false;
   }
   return false;
}

void CloseAllPositions(string sigId)
{
   int tickets[];
   int count = 0;
   ArrayResize(tickets, OrdersTotal());
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      tickets[count++] = OrderTicket();
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
//| ── CHART DATA SENDER (MQL4 indicator API) ─────────────────────── |
//+------------------------------------------------------------------+
void SendChartData(string sym)
{
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

   // ── Candles ───────────────────────────────────────────────────
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

   // ── Indicators (MQL4 — direct value return) ───────────────────
   string indJson = "{}";
   if(INCLUDE_INDICATORS)
   {
      double rsiVal   = iRSI (sym, tf, 14, PRICE_CLOSE, 0);
      double macdMain = iMACD(sym, tf, 12, 26, 9, PRICE_CLOSE, MODE_MAIN,   0);
      double macdSig  = iMACD(sym, tf, 12, 26, 9, PRICE_CLOSE, MODE_SIGNAL, 0);
      double bbUpper  = iBands(sym, tf, 20, 2.0, 0, PRICE_CLOSE, MODE_UPPER, 0);
      double bbMid    = iBands(sym, tf, 20, 2.0, 0, PRICE_CLOSE, MODE_MAIN,  0);
      double bbLower  = iBands(sym, tf, 20, 2.0, 0, PRICE_CLOSE, MODE_LOWER, 0);
      double atrVal   = iATR (sym, tf, 14, 0);
      double ema20    = iMA  (sym, tf, 20,  0, MODE_EMA, PRICE_CLOSE, 0);
      double ema50    = iMA  (sym, tf, 50,  0, MODE_EMA, PRICE_CLOSE, 0);
      double ema200   = iMA  (sym, tf, 200, 0, MODE_EMA, PRICE_CLOSE, 0);

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

   double balance = AccountBalance();
   double equity  = AccountEquity();
   double spread  = MarketInfo(sym, MODE_SPREAD) * MarketInfo(sym, MODE_POINT);
   double ask     = MarketInfo(sym, MODE_ASK);
   double bid     = MarketInfo(sym, MODE_BID);

   string body = StringFormat(
      "{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"candles\":%s,"
      "\"indicators\":%s,"
      "\"account\":{\"balance\":%.2f,\"equity\":%.2f},"
      "\"market\":{\"ask\":%.5f,\"bid\":%.5f,\"spread\":%.5f},"
      "\"accountAlias\":\"%s\",\"platform\":\"MT4\"}",
      JsonEscape(sym), tfStr, candlesJson,
      indJson,
      balance, equity,
      SafeDouble(ask), SafeDouble(bid), SafeDouble(spread),
      JsonEscape(ACCOUNT_ALIAS)
   );

   string resp = HttpPost(g_chartDataUrl, body);
   Print("[VEDD] Chart data ", StringLen(resp) > 0 ? "sent" : "FAILED", ": ",
         sym, "/", tfStr, " (", copied, " candles)");
}

//+------------------------------------------------------------------+
//| ── HEARTBEAT ──────────────────────────────────────────────────── |
//+------------------------------------------------------------------+
void SendHeartbeat()
{
   string body = StringFormat(
      "{\"accountAlias\":\"%s\",\"accountLabel\":\"%s\",\"accountNumber\":\"%s\","
      "\"accountName\":\"%s\",\"broker\":\"%s\",\"server\":\"%s\","
      "\"balance\":%.2f,\"equity\":%.2f,"
      "\"receiveSignals\":%s,\"platform\":\"MT4\",\"symbol\":\"%s\"}",
      JsonEscape(ACCOUNT_ALIAS),
      JsonEscape(g_effectiveLabel),
      JsonEscape(g_accountNumber),
      JsonEscape(g_accountName),
      JsonEscape(g_brokerName),
      JsonEscape(g_serverName),
      AccountBalance(), AccountEquity(),
      RECEIVE_SIGNALS_FLAG ? "true" : "false",
      JsonEscape(Symbol())
   );
   HttpPost(g_heartbeatUrl, body);
}

//+------------------------------------------------------------------+
//| ── TRADE COPIER (timer-based history scan, no OnTrade in MT4) ── |
//+------------------------------------------------------------------+
void CheckAndReportNewTrades()
{
   if(!ENABLE_TRADE_COPY) return;

   datetime from = TimeCurrent() - 300; // last 5 minutes window

   // ── Report newly opened market positions ──────────────────────
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_TRADES)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      if(OrderMagicNumber() == MAGIC_NUMBER) continue;  // skip AI trades
      int ticket = OrderTicket();
      if(IsAlreadyReported(ticket)) continue;
      if(OrderOpenTime() < from) continue;               // too old — already reported previously
      ReportOrderToServer(ticket, "OPEN");
   }

   // ── Report recently closed positions ──────────────────────────
   int histTotal = OrdersHistoryTotal();
   for(int i = histTotal - 1; i >= MathMax(0, histTotal - 30); i--)
   {
      if(!OrderSelect(i, SELECT_BY_POS, MODE_HISTORY)) continue;
      if(OrderType() != OP_BUY && OrderType() != OP_SELL) continue;
      if(OrderMagicNumber() == MAGIC_NUMBER) continue;
      int ticket = OrderTicket();
      if(IsAlreadyReported(ticket)) continue;
      if(OrderCloseTime() < from) continue;
      ReportOrderToServer(ticket, "CLOSE");
   }
}

void ReportOrderToServer(int ticket, string action)
{
   if(!OrderSelect(ticket, SELECT_BY_TICKET)) return;

   string sym       = OrderSymbol();
   double volume    = OrderLots();
   double price     = (action == "OPEN") ? OrderOpenPrice()  : OrderClosePrice();
   double sl        = OrderStopLoss();
   double tp        = OrderTakeProfit();
   string direction = (OrderType() == OP_BUY) ? "BUY" : "SELL";
   int    magic     = OrderMagicNumber();
   string comment   = OrderComment();
   long   openTime  = (long)OrderOpenTime();

   string body = StringFormat(
      "{\"action\":\"%s\",\"symbol\":\"%s\",\"direction\":\"%s\","
      "\"volume\":%.2f,\"entryPrice\":%.5f,\"stopLoss\":%.5f,\"takeProfit\":%.5f,"
      "\"ticket\":%d,\"magic\":%d,\"comment\":\"%s\","
      "\"openTime\":%d,\"platform\":\"MT4\",\"accountAlias\":\"%s\"}",
      JsonEscape(action),
      JsonEscape(sym),
      direction,
      volume, price, sl, tp,
      ticket, magic,
      JsonEscape(comment),
      (int)openTime,
      JsonEscape(ACCOUNT_ALIAS)
   );
   HttpPost(g_tradeSignalUrl, body);
   MarkReported(ticket);
}

//+------------------------------------------------------------------+
//| Chart comment                                                     |
//+------------------------------------------------------------------+
void UpdateChartComment()
{
   if(!SHOW_CHART_COMMENT) { Comment(""); return; }
   string cur = AccountCurrency();
   double bal = AccountBalance();
   double eq  = AccountEquity();
   string s = "";
   s += "╔══════════════════════════════════════╗\n";
   s += "║   VEDD Combined EA v1.01 — MT4       ║\n";
   s += "╠══════════════════════════════════════╣\n";
   s += "║ Account : " + g_accountName + "\n";
   s += "║ Number  : #" + g_accountNumber + "\n";
   s += "║ Broker  : " + g_brokerName + "\n";
   s += "║ Server  : " + g_serverName + "\n";
   s += "║ Balance : " + DoubleToString(bal, 2) + " " + cur + "\n";
   s += "║ Equity  : " + DoubleToString(eq,  2) + " " + cur + "\n";
   s += "╠══════════════════════════════════════╣\n";
   s += "║ Alias   : " + ACCOUNT_ALIAS + "\n";
   s += "║ Signals : " + (ENABLE_SIGNALS    ? "ON " : "OFF") + "\n";
   s += "║ Chart   : " + (ENABLE_CHART_DATA ? "ON " : "OFF") + "\n";
   s += "║ Copy    : " + (ENABLE_TRADE_COPY ? "ON " : "OFF") + "\n";
   s += "║ Symbol  : " + Symbol() + "\n";
   s += "╠══════════════════════════════════════╣\n";
   s += "║ ★ ONE CHART ONLY — signals execute   ║\n";
   s += "║   on all pairs automatically.        ║\n";
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
      for(int i = 0; i < g_symCount; i++)
         SendChartData(g_symList[i]);
   }
   if(now - g_lastHeartbeat >= HEARTBEAT_SECONDS)
   {
      g_lastHeartbeat = now;
      SendHeartbeat();
   }

   // MT4 has no OnTrade() — poll history each timer tick
   CheckAndReportNewTrades();

   UpdateChartComment();
}

//+------------------------------------------------------------------+
//| OnInit                                                            |
//+------------------------------------------------------------------+
int OnInit()
{
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

   // Build symbol list — blank SYMBOLS_LIST means current chart only
   if(StringLen(SYMBOLS_LIST) == 0)
   {
      g_symList[0] = Symbol();
      g_symCount   = 1;
   }
   else
   {
      string parts[];
      int cnt = StringSplit(SYMBOLS_LIST, ',', parts);
      g_symCount = 0;
      for(int k = 0; k < cnt && g_symCount < VEDD_MAX_SYM; k++)
      {
         StringTrimLeft(parts[k]); StringTrimRight(parts[k]);
         if(StringLen(parts[k]) > 0) { g_symList[g_symCount] = parts[k]; g_symCount++; }
      }
      if(g_symCount == 0) { g_symList[0] = Symbol(); g_symCount = 1; }
   }

   // Auto-read account info from terminal
   g_accountName    = AccountName();
   g_accountNumber  = IntegerToString(AccountNumber());
   g_brokerName     = AccountCompany();
   g_serverName     = AccountServer();
   g_effectiveLabel = (StringLen(ACCOUNT_LABEL) > 0) ? ACCOUNT_LABEL : g_accountName;

   EventSetTimer(1);
   SendHeartbeat();

   Print("[VEDD] MT4 Combined EA v1.01 initialized. Alias=", ACCOUNT_ALIAS,
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
   Print("[VEDD] MT4 Combined EA stopped. Reason=", reason);
}
