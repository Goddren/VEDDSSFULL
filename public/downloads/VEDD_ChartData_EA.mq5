//+------------------------------------------------------------------+
//|                                           VEDD_ChartData_EA.mq5 |
//|                              AI Powered Trading Vault           |
//|                  Chart Data Sender + Auto-Trading EA            |
//+------------------------------------------------------------------+
#property copyright "AI Powered Trading Vault"
#property link      "https://aipoweredtradingvault.com"
#property version   "3.20"
#property description "Sends chart data to AI Trading Vault, displays analysis, and auto-trades signals"
#property strict

#include <Trade\Trade.mqh>

//--- Input parameters: Connection
input string   API_URL = "https://your-app-url.replit.app/api/mt5/chart-data";  // Your AI Trading Vault URL (CHANGE THIS!)
input string   API_TOKEN = "";                    // Your API Token from AI Trading Vault
input int      CANDLES_TO_SEND = 50;              // Number of candles to send
input int      SEND_INTERVAL_SECONDS = 60;        // Send interval (seconds)
input bool     INCLUDE_INDICATORS = true;         // Include technical indicators
input bool     SHOW_CHART_COMMENT = true;         // Show analysis on chart
input int      TIMEOUT = 15000;                   // Request timeout (ms)

//--- Input parameters: Multi-Timeframe Analysis
input bool     ENABLE_MULTI_TIMEFRAME = true;     // Enable Multi-Timeframe Analysis (Better AI!)
input bool     INCLUDE_M5 = false;                // Include M5 timeframe (scalping)
input bool     INCLUDE_M15 = true;                // Include M15 timeframe
input bool     INCLUDE_H1 = true;                 // Include H1 timeframe  
input bool     INCLUDE_H4 = true;                 // Include H4 timeframe
input bool     INCLUDE_D1 = false;                // Include D1 timeframe
input bool     INCLUDE_W1 = false;                // Include Weekly timeframe (swing trading)

//--- Input parameters: Auto-Trading
input bool     ENABLE_AUTO_TRADING = false;       // Enable Auto-Trading (CAREFUL!)
input bool     ENABLE_PENDING_ORDERS = false;     // Use pending orders instead of market orders
input double   LOT_SIZE = 0.01;                   // Fixed lot size
input bool     USE_RISK_PERCENT = false;          // Use risk % instead of fixed lot
input double   RISK_PERCENT = 1.0;                // Risk per trade (% of balance)
input int      MIN_CONFIDENCE = 70;               // Minimum signal confidence to trade
input int      MAX_OPEN_TRADES = 1;               // Maximum open trades (this EA)
input double   DAILY_LOSS_LIMIT = 100.0;          // Daily loss limit ($) - 0 to disable
input int      COOLDOWN_SECONDS = 300;            // Cooldown between trades (seconds)
input int      PENDING_EXPIRY_HOURS = 4;          // Pending order expiry (hours)
input int      SLIPPAGE_POINTS = 30;              // Max slippage for market orders
input int      MAGIC_NUMBER = 202501;             // Magic number for EA trades

//--- Global variables
datetime lastSendTime = 0;
int sendCount = 0;
string lastSignal = "";
string lastTrend = "";
int lastConfidence = 0;
string lastPatterns = "";
double lastEntry = 0;
double lastSL = 0;
double lastTP = 0;
bool hasTradePlan = false;

//--- Trading state
datetime lastTradeTime = 0;
string lastExecutedSignal = "";
double dailyLossAccumulated = 0;
datetime dailyLossResetDate = 0;
CTrade trade;

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   if(StringLen(API_TOKEN) == 0)
   {
      Alert("ERROR: Please enter your API Token from AI Trading Vault");
      return(INIT_PARAMETERS_INCORRECT);
   }
   
   trade.SetExpertMagicNumber(MAGIC_NUMBER);
   trade.SetDeviationInPoints(SLIPPAGE_POINTS);
   
   Print("========================================");
   Print("AI Trading Vault - Chart Data EA v3.1");
   Print("Symbol: ", _Symbol);
   Print("Primary Timeframe: ", EnumToString(Period()));
   Print("Candles to send: ", CANDLES_TO_SEND);
   Print("Send interval: ", SEND_INTERVAL_SECONDS, " seconds");
   Print("----------------------------------------");
   Print("MULTI-TIMEFRAME: ", ENABLE_MULTI_TIMEFRAME ? "ENABLED (Better AI!)" : "DISABLED");
   if(ENABLE_MULTI_TIMEFRAME)
   {
      string tfList = "";
      if(INCLUDE_M5) tfList += "M5 ";
      if(INCLUDE_M15) tfList += "M15 ";
      if(INCLUDE_H1) tfList += "H1 ";
      if(INCLUDE_H4) tfList += "H4 ";
      if(INCLUDE_D1) tfList += "D1 ";
      if(INCLUDE_W1) tfList += "W1 ";
      Print("Timeframes: ", tfList);
   }
   Print("----------------------------------------");
   Print("AUTO-TRADING: ", ENABLE_AUTO_TRADING ? "ENABLED" : "DISABLED");
   if(ENABLE_AUTO_TRADING)
   {
      Print("Lot Size: ", USE_RISK_PERCENT ? DoubleToString(RISK_PERCENT, 1) + "% risk" : DoubleToString(LOT_SIZE, 2) + " lots");
      Print("Min Confidence: ", MIN_CONFIDENCE, "%");
      Print("Max Open Trades: ", MAX_OPEN_TRADES);
      Print("Pending Orders: ", ENABLE_PENDING_ORDERS ? "YES" : "NO");
   }
   Print("========================================");
   
   SendChartData();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("Chart Data EA stopped. Total sends: ", sendCount);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   if(TimeCurrent() - lastSendTime >= SEND_INTERVAL_SECONDS)
   {
      SendChartData();
      lastSendTime = TimeCurrent();
   }
   
   if(ENABLE_AUTO_TRADING)
   {
      ManagePendingOrders();
   }
}

//+------------------------------------------------------------------+
//| Send chart data to AI Trading Vault                              |
//+------------------------------------------------------------------+
bool SendChartData()
{
   string candlesJson = BuildCandlesJson();
   
   string indicatorsJson = "";
   if(INCLUDE_INDICATORS)
   {
      indicatorsJson = BuildIndicatorsJson();
   }
   
   // Build multi-timeframe data if enabled
   string multiTimeframeJson = "";
   if(ENABLE_MULTI_TIMEFRAME)
   {
      multiTimeframeJson = BuildMultiTimeframeJson();
   }
   
   string jsonPayload = StringFormat(
      "{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"broker\":\"%s\",\"timestamp\":%d,\"candles\":%s%s%s,\"multiTimeframe\":%s}",
      _Symbol,
      GetTimeframeString(),
      AccountInfoString(ACCOUNT_COMPANY),
      TimeCurrent(),
      candlesJson,
      INCLUDE_INDICATORS ? ",\"indicators\":" + indicatorsJson : "",
      ENABLE_MULTI_TIMEFRAME ? ",\"multiTimeframeEnabled\":true" : "",
      ENABLE_MULTI_TIMEFRAME ? multiTimeframeJson : "null"
   );
   
   uchar jsonData[];
   StringToCharArray(jsonPayload, jsonData, 0, StringLen(jsonPayload), CP_UTF8);
   
   string headers = "Content-Type: application/json\r\n";
   headers += "Authorization: Bearer " + API_TOKEN + "\r\n";
   headers += "X-MT5-Symbol: " + _Symbol + "\r\n";
   headers += "X-MT5-Timeframe: " + GetTimeframeString() + "\r\n";
   
   char resultData[];
   string resultHeaders;
   
   ResetLastError();
   
   int httpCode = WebRequest(
      "POST",
      API_URL,
      headers,
      TIMEOUT,
      jsonData,
      resultData,
      resultHeaders
   );
   
   if(httpCode == -1)
   {
      int errorCode = GetLastError();
      Print("WebRequest failed. Error code: ", errorCode);
      
      if(errorCode == 4060)
      {
         Alert("ERROR: Please add your AI Trading Vault URL to allowed URLs");
         Alert("Go to: Tools > Options > Expert Advisors > Allow WebRequest");
         Alert("Add URL: ", API_URL);
      }
      else if(errorCode == 4014)
      {
         Print("ERROR: WebRequest not allowed. Check EA permissions.");
      }
      
      return false;
   }
   else if(httpCode == 200 || httpCode == 201)
   {
      string response = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      sendCount++;
      
      ParseAndDisplayAnalysis(response);
      
      if(ENABLE_AUTO_TRADING && hasTradePlan)
      {
         ProcessAutoTrade();
      }
      
      return true;
   }
   else if(httpCode == 401)
   {
      Print("ERROR: Invalid API token. Please check your token in AI Trading Vault.");
      return false;
   }
   else
   {
      string response = CharArrayToString(resultData, 0, WHOLE_ARRAY, CP_UTF8);
      Print("HTTP Error: ", httpCode, " - Response: ", response);
      return false;
   }
}

//+------------------------------------------------------------------+
//| Parse JSON response and display analysis                         |
//+------------------------------------------------------------------+
void ParseAndDisplayAnalysis(string json)
{
   lastSignal = ExtractJsonString(json, "\"mt5Signal\":\"", "\"");
   lastTrend = ExtractJsonString(json, "\"mt5Trend\":\"", "\"");
   lastPatterns = ExtractJsonString(json, "\"mt5Patterns\":\"", "\"");
   
   string confStr = ExtractJsonNumber(json, "\"mt5Confidence\":");
   lastConfidence = (int)StringToInteger(confStr);
   
   string hasPlanStr = ExtractJsonString(json, "\"mt5HasTradePlan\":", ",");
   hasTradePlan = (StringFind(hasPlanStr, "true") >= 0);
   
   if(hasTradePlan)
   {
      string entryStr = ExtractJsonNumber(json, "\"mt5Entry\":");
      string slStr = ExtractJsonNumber(json, "\"mt5StopLoss\":");
      string tpStr = ExtractJsonNumber(json, "\"mt5TakeProfit\":");
      
      lastEntry = StringToDouble(entryStr);
      lastSL = StringToDouble(slStr);
      lastTP = StringToDouble(tpStr);
   }
   else
   {
      lastEntry = 0;
      lastSL = 0;
      lastTP = 0;
   }
   
   Print("");
   Print("Hey G, VEDD AI here! Just scanned ", _Symbol, " on the ", GetTimeframeString(), " chart.");
   Print("");
   
   if(lastSignal == "BUY")
   {
      Print("Looking BULLISH right now! I'm seeing a ", lastConfidence, "% confidence BUY setup.");
   }
   else if(lastSignal == "SELL")
   {
      Print("Looking BEARISH right now! I'm seeing a ", lastConfidence, "% confidence SELL setup.");
   }
   else
   {
      Print("Market's a bit choppy - I'd stay on the sidelines for now (NEUTRAL).");
   }
   
   if(StringLen(lastTrend) > 0)
   {
      if(StringFind(lastTrend, "STRONG") >= 0)
         Print("The trend is looking strong - ", lastTrend, ". Momentum is on our side!");
      else if(StringFind(lastTrend, "UP") >= 0)
         Print("We're in an uptrend. Bulls are in control.");
      else if(StringFind(lastTrend, "DOWN") >= 0)
         Print("We're in a downtrend. Bears are running the show.");
      else
         Print("Trend: ", lastTrend);
   }
   
   if(StringLen(lastPatterns) > 0)
   {
      Print("");
      Print("PATTERNS DETECTED: ", lastPatterns);
   }
   
   if(lastEntry > 0)
   {
      Print("");
      Print("Here's my trade plan for you:");
      Print("   Entry @ ", DoubleToString(lastEntry, _Digits));
      Print("   Stop Loss @ ", DoubleToString(lastSL, _Digits), " (protect your capital!)");
      Print("   Take Profit @ ", DoubleToString(lastTP, _Digits), " (secure those gains!)");
   }
   
   Print("");
   Print("Stay sharp, trade smart! - VEDD AI (Analysis #", sendCount, ")");
   
   if(SHOW_CHART_COMMENT)
   {
      UpdateChartComment();
   }
}

//+------------------------------------------------------------------+
//| Process auto-trade based on signal                               |
//+------------------------------------------------------------------+
void ProcessAutoTrade()
{
   if(lastConfidence < MIN_CONFIDENCE)
   {
      Print("[AUTO-TRADE] Signal confidence ", lastConfidence, "% below minimum ", MIN_CONFIDENCE, "%. Skipping.");
      return;
   }
   
   if(lastSignal != "BUY" && lastSignal != "SELL")
   {
      Print("[AUTO-TRADE] Signal is NEUTRAL. No trade.");
      return;
   }
   
   if(lastSignal == lastExecutedSignal && (TimeCurrent() - lastTradeTime) < COOLDOWN_SECONDS)
   {
      Print("[AUTO-TRADE] Same signal within cooldown period. Skipping.");
      return;
   }
   
   if(CountOpenTrades() >= MAX_OPEN_TRADES)
   {
      Print("[AUTO-TRADE] Max open trades reached (", MAX_OPEN_TRADES, "). Skipping.");
      return;
   }
   
   // Check for existing pending orders to prevent stacking duplicates
   if(ENABLE_PENDING_ORDERS && HasExistingPendingOrder(lastSignal))
   {
      Print("[AUTO-TRADE] Already have a pending ", lastSignal, " order. Skipping.");
      return;
   }
   
   if(!CheckDailyLossLimit())
   {
      Print("[AUTO-TRADE] Daily loss limit reached. No more trades today.");
      return;
   }
   
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      Print("[AUTO-TRADE] Trading not allowed. Check permissions.");
      return;
   }
   
   double lotSize = CalculateLotSize();
   
   if(ENABLE_PENDING_ORDERS && lastEntry > 0)
   {
      PlacePendingOrder(lotSize);
   }
   else
   {
      PlaceMarketOrder(lotSize);
   }
}

//+------------------------------------------------------------------+
//| Calculate lot size based on settings                             |
//+------------------------------------------------------------------+
double CalculateLotSize()
{
   double lots = LOT_SIZE;
   
   if(USE_RISK_PERCENT && lastSL > 0 && lastEntry > 0)
   {
      double balance = AccountInfoDouble(ACCOUNT_BALANCE);
      double riskAmount = balance * (RISK_PERCENT / 100.0);
      double slDistance = MathAbs(lastEntry - lastSL);
      double tickValue = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_VALUE);
      double tickSize = SymbolInfoDouble(_Symbol, SYMBOL_TRADE_TICK_SIZE);
      
      if(slDistance > 0 && tickValue > 0 && tickSize > 0)
      {
         double slTicks = slDistance / tickSize;
         lots = riskAmount / (slTicks * tickValue);
      }
   }
   
   double minLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MIN);
   double maxLot = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(_Symbol, SYMBOL_VOLUME_STEP);
   
   lots = MathMax(minLot, MathMin(maxLot, lots));
   lots = MathFloor(lots / lotStep) * lotStep;
   
   return NormalizeDouble(lots, 2);
}

//+------------------------------------------------------------------+
//| Place market order                                               |
//+------------------------------------------------------------------+
void PlaceMarketOrder(double lots)
{
   double sl = lastSL > 0 ? lastSL : 0;
   double tp = lastTP > 0 ? lastTP : 0;
   string comment = "VEDD AI " + lastSignal + " " + IntegerToString(lastConfidence) + "%";
   
   bool result = false;
   
   if(lastSignal == "BUY")
   {
      double price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      result = trade.Buy(lots, _Symbol, price, sl, tp, comment);
   }
   else if(lastSignal == "SELL")
   {
      double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      result = trade.Sell(lots, _Symbol, price, sl, tp, comment);
   }
   
   if(result)
   {
      Print("[AUTO-TRADE] SUCCESS! ", lastSignal, " ", lots, " lots @ ", trade.ResultPrice());
      Print("[AUTO-TRADE] SL: ", sl, " | TP: ", tp);
      lastTradeTime = TimeCurrent();
      lastExecutedSignal = lastSignal;
   }
   else
   {
      Print("[AUTO-TRADE] FAILED! Error: ", trade.ResultRetcode(), " - ", trade.ResultRetcodeDescription());
   }
}

//+------------------------------------------------------------------+
//| Place pending order                                              |
//+------------------------------------------------------------------+
void PlacePendingOrder(double lots)
{
   if(lastEntry <= 0)
   {
      Print("[AUTO-TRADE] No entry price for pending order. Using market order.");
      PlaceMarketOrder(lots);
      return;
   }
   
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double sl = lastSL > 0 ? lastSL : 0;
   double tp = lastTP > 0 ? lastTP : 0;
   string comment = "VEDD AI Pending " + lastSignal;
   datetime expiry = TimeCurrent() + PENDING_EXPIRY_HOURS * 3600;
   
   ENUM_ORDER_TYPE orderType;
   double price = lastEntry;
   bool result = false;
   
   if(lastSignal == "BUY")
   {
      if(lastEntry > currentAsk)
         orderType = ORDER_TYPE_BUY_STOP;
      else if(lastEntry < currentAsk)
         orderType = ORDER_TYPE_BUY_LIMIT;
      else
      {
         PlaceMarketOrder(lots);
         return;
      }
   }
   else if(lastSignal == "SELL")
   {
      if(lastEntry < currentBid)
         orderType = ORDER_TYPE_SELL_STOP;
      else if(lastEntry > currentBid)
         orderType = ORDER_TYPE_SELL_LIMIT;
      else
      {
         PlaceMarketOrder(lots);
         return;
      }
   }
   else
   {
      return;
   }
   
   MqlTradeRequest request = {};
   MqlTradeResult tradeResult = {};
   
   request.action = TRADE_ACTION_PENDING;
   request.symbol = _Symbol;
   request.volume = lots;
   request.type = orderType;
   request.price = NormalizeDouble(price, _Digits);
   request.sl = NormalizeDouble(sl, _Digits);
   request.tp = NormalizeDouble(tp, _Digits);
   request.deviation = SLIPPAGE_POINTS;
   request.magic = MAGIC_NUMBER;
   request.comment = comment;
   request.type_time = ORDER_TIME_SPECIFIED;
   request.expiration = expiry;
   
   result = OrderSend(request, tradeResult);
   
   if(result && tradeResult.retcode == TRADE_RETCODE_DONE)
   {
      Print("[AUTO-TRADE] PENDING ORDER PLACED! ", EnumToString(orderType));
      Print("[AUTO-TRADE] Entry: ", price, " | SL: ", sl, " | TP: ", tp);
      Print("[AUTO-TRADE] Expires: ", TimeToString(expiry));
      lastTradeTime = TimeCurrent();
      lastExecutedSignal = lastSignal;
   }
   else
   {
      Print("[AUTO-TRADE] PENDING ORDER FAILED! Error: ", tradeResult.retcode, " - ", GetRetcodeDescription(tradeResult.retcode));
      Print("[AUTO-TRADE] Will retry on next signal. NOT falling back to market order for safety.");
   }
}

//+------------------------------------------------------------------+
//| Check if we have an existing pending order for this direction    |
//+------------------------------------------------------------------+
bool HasExistingPendingOrder(string direction)
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket > 0 && OrderSelect(ticket))
      {
         if(OrderGetInteger(ORDER_MAGIC) == MAGIC_NUMBER &&
            OrderGetString(ORDER_SYMBOL) == _Symbol)
         {
            ENUM_ORDER_TYPE orderType = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
            bool isBuyPending = (orderType == ORDER_TYPE_BUY_LIMIT || orderType == ORDER_TYPE_BUY_STOP);
            bool isSellPending = (orderType == ORDER_TYPE_SELL_LIMIT || orderType == ORDER_TYPE_SELL_STOP);
            
            if((direction == "BUY" && isBuyPending) || (direction == "SELL" && isSellPending))
            {
               return true;
            }
         }
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Get retcode description                                          |
//+------------------------------------------------------------------+
string GetRetcodeDescription(uint retcode)
{
   switch(retcode)
   {
      case TRADE_RETCODE_REQUOTE: return "Requote";
      case TRADE_RETCODE_REJECT: return "Rejected";
      case TRADE_RETCODE_CANCEL: return "Canceled";
      case TRADE_RETCODE_PLACED: return "Placed";
      case TRADE_RETCODE_DONE: return "Done";
      case TRADE_RETCODE_DONE_PARTIAL: return "Partial";
      case TRADE_RETCODE_ERROR: return "Error";
      case TRADE_RETCODE_TIMEOUT: return "Timeout";
      case TRADE_RETCODE_INVALID: return "Invalid request";
      case TRADE_RETCODE_INVALID_VOLUME: return "Invalid volume";
      case TRADE_RETCODE_INVALID_PRICE: return "Invalid price";
      case TRADE_RETCODE_INVALID_STOPS: return "Invalid stops";
      case TRADE_RETCODE_TRADE_DISABLED: return "Trade disabled";
      case TRADE_RETCODE_MARKET_CLOSED: return "Market closed";
      case TRADE_RETCODE_NO_MONEY: return "No money";
      case TRADE_RETCODE_PRICE_CHANGED: return "Price changed";
      case TRADE_RETCODE_PRICE_OFF: return "No quotes";
      case TRADE_RETCODE_INVALID_EXPIRATION: return "Invalid expiration";
      case TRADE_RETCODE_ORDER_CHANGED: return "Order changed";
      case TRADE_RETCODE_TOO_MANY_REQUESTS: return "Too many requests";
      default: return "Unknown (" + IntegerToString(retcode) + ")";
   }
}

//+------------------------------------------------------------------+
//| Count open trades by this EA                                     |
//+------------------------------------------------------------------+
int CountOpenTrades()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionSelectByTicket(PositionGetTicket(i)))
      {
         if(PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER && 
            PositionGetString(POSITION_SYMBOL) == _Symbol)
         {
            count++;
         }
      }
   }
   return count;
}

//+------------------------------------------------------------------+
//| Check and update daily loss limit                                |
//+------------------------------------------------------------------+
bool CheckDailyLossLimit()
{
   if(DAILY_LOSS_LIMIT <= 0) return true;
   
   MqlDateTime now;
   TimeCurrent(now);
   datetime today = StringToTime(StringFormat("%04d.%02d.%02d", now.year, now.mon, now.day));
   
   if(today != dailyLossResetDate)
   {
      dailyLossAccumulated = 0;
      dailyLossResetDate = today;
   }
   
   datetime todayStart = today;
   datetime todayEnd = today + 86400;
   
   HistorySelect(todayStart, todayEnd);
   
   double todayPnL = 0;
   for(int i = HistoryDealsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = HistoryDealGetTicket(i);
      if(ticket > 0)
      {
         if(HistoryDealGetInteger(ticket, DEAL_MAGIC) == MAGIC_NUMBER &&
            HistoryDealGetString(ticket, DEAL_SYMBOL) == _Symbol)
         {
            todayPnL += HistoryDealGetDouble(ticket, DEAL_PROFIT);
         }
      }
   }
   
   if(todayPnL < -DAILY_LOSS_LIMIT)
   {
      return false;
   }
   
   return true;
}

//+------------------------------------------------------------------+
//| Manage pending orders (cancel old, update on signal change)      |
//+------------------------------------------------------------------+
void ManagePendingOrders()
{
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket > 0 && OrderSelect(ticket))
      {
         if(OrderGetInteger(ORDER_MAGIC) == MAGIC_NUMBER &&
            OrderGetString(ORDER_SYMBOL) == _Symbol)
         {
            ENUM_ORDER_TYPE orderType = (ENUM_ORDER_TYPE)OrderGetInteger(ORDER_TYPE);
            bool isBuyPending = (orderType == ORDER_TYPE_BUY_LIMIT || orderType == ORDER_TYPE_BUY_STOP);
            bool isSellPending = (orderType == ORDER_TYPE_SELL_LIMIT || orderType == ORDER_TYPE_SELL_STOP);
            
            if((isBuyPending && lastSignal == "SELL") || (isSellPending && lastSignal == "BUY"))
            {
               if(trade.OrderDelete(ticket))
               {
                  Print("[AUTO-TRADE] Cancelled pending order due to signal flip.");
               }
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Update chart comment with latest analysis                        |
//+------------------------------------------------------------------+
void UpdateChartComment()
{
   string commentText = "";
   commentText += "VEDD AI Trading Assistant v3.0\n";
   commentText += "------------------------------\n";
   
   if(lastSignal == "BUY")
   {
      commentText += ">> BULLISH - BUY <<\n";
      commentText += "Confidence: " + IntegerToString(lastConfidence) + "%\n";
   }
   else if(lastSignal == "SELL")
   {
      commentText += ">> BEARISH - SELL <<\n";
      commentText += "Confidence: " + IntegerToString(lastConfidence) + "%\n";
   }
   else
   {
      commentText += "-- NEUTRAL (Wait) --\n";
   }
   
   if(StringLen(lastTrend) > 0)
   {
      commentText += "Trend: " + lastTrend + "\n";
   }
   
   if(StringLen(lastPatterns) > 0)
   {
      commentText += "Patterns: " + lastPatterns + "\n";
   }
   
   if(lastEntry > 0)
   {
      commentText += "------------------------------\n";
      commentText += "Entry: " + DoubleToString(lastEntry, _Digits) + "\n";
      commentText += "SL: " + DoubleToString(lastSL, _Digits) + "\n";
      commentText += "TP: " + DoubleToString(lastTP, _Digits) + "\n";
   }
   
   commentText += "------------------------------\n";
   if(ENABLE_AUTO_TRADING)
   {
      commentText += "AUTO-TRADE: ON\n";
      commentText += "Open Trades: " + IntegerToString(CountOpenTrades()) + "/" + IntegerToString(MAX_OPEN_TRADES) + "\n";
   }
   else
   {
      commentText += "AUTO-TRADE: OFF\n";
   }
   
   commentText += TimeToString(TimeCurrent(), TIME_MINUTES);
   
   Comment(commentText);
}

//+------------------------------------------------------------------+
//| Extract string value from JSON                                   |
//+------------------------------------------------------------------+
string ExtractJsonString(string json, string startTag, string endTag)
{
   int startPos = StringFind(json, startTag);
   if(startPos < 0) return "";
   
   startPos += StringLen(startTag);
   int endPos = StringFind(json, endTag, startPos);
   if(endPos < 0) return "";
   
   return StringSubstr(json, startPos, endPos - startPos);
}

//+------------------------------------------------------------------+
//| Extract numeric value from JSON (handles comma or } as delimiter)|
//+------------------------------------------------------------------+
string ExtractJsonNumber(string json, string startTag)
{
   int startPos = StringFind(json, startTag);
   if(startPos < 0) return "0";
   
   startPos += StringLen(startTag);
   
   int endComma = StringFind(json, ",", startPos);
   int endBrace = StringFind(json, "}", startPos);
   
   int endPos = -1;
   if(endComma >= 0 && endBrace >= 0)
      endPos = MathMin(endComma, endBrace);
   else if(endComma >= 0)
      endPos = endComma;
   else if(endBrace >= 0)
      endPos = endBrace;
   else
      return "0";
   
   string numStr = StringSubstr(json, startPos, endPos - startPos);
   StringTrimLeft(numStr);
   StringTrimRight(numStr);
   
   return numStr;
}

//+------------------------------------------------------------------+
//| Build JSON array of candles                                      |
//+------------------------------------------------------------------+
string BuildCandlesJson()
{
   string json = "[";
   
   for(int i = 0; i < CANDLES_TO_SEND; i++)
   {
      datetime time = iTime(_Symbol, PERIOD_CURRENT, i);
      double open = iOpen(_Symbol, PERIOD_CURRENT, i);
      double high = iHigh(_Symbol, PERIOD_CURRENT, i);
      double low = iLow(_Symbol, PERIOD_CURRENT, i);
      double close = iClose(_Symbol, PERIOD_CURRENT, i);
      long volume = iVolume(_Symbol, PERIOD_CURRENT, i);
      
      json += StringFormat(
         "{\"t\":%d,\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%d}",
         time, open, high, low, close, volume
      );
      
      if(i < CANDLES_TO_SEND - 1) json += ",";
   }
   
   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Build JSON object with technical indicators                      |
//+------------------------------------------------------------------+
string BuildIndicatorsJson()
{
   double rsi = 0;
   int rsiHandle = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE);
   if(rsiHandle != INVALID_HANDLE)
   {
      double rsiBuffer[];
      ArraySetAsSeries(rsiBuffer, true);
      if(CopyBuffer(rsiHandle, 0, 0, 1, rsiBuffer) > 0)
         rsi = rsiBuffer[0];
      IndicatorRelease(rsiHandle);
   }
   
   double macdMain = 0, macdSignal = 0, macdHist = 0;
   int macdHandle = iMACD(_Symbol, PERIOD_CURRENT, 12, 26, 9, PRICE_CLOSE);
   if(macdHandle != INVALID_HANDLE)
   {
      double macdMainBuffer[], macdSignalBuffer[];
      ArraySetAsSeries(macdMainBuffer, true);
      ArraySetAsSeries(macdSignalBuffer, true);
      if(CopyBuffer(macdHandle, 0, 0, 1, macdMainBuffer) > 0)
         macdMain = macdMainBuffer[0];
      if(CopyBuffer(macdHandle, 1, 0, 1, macdSignalBuffer) > 0)
         macdSignal = macdSignalBuffer[0];
      macdHist = macdMain - macdSignal;
      IndicatorRelease(macdHandle);
   }
   
   double atr = 0;
   int atrHandle = iATR(_Symbol, PERIOD_CURRENT, 14);
   if(atrHandle != INVALID_HANDLE)
   {
      double atrBuffer[];
      ArraySetAsSeries(atrBuffer, true);
      if(CopyBuffer(atrHandle, 0, 0, 1, atrBuffer) > 0)
         atr = atrBuffer[0];
      IndicatorRelease(atrHandle);
   }
   
   double ema20 = 0, ema50 = 0, sma200 = 0;
   
   int ema20Handle = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_EMA, PRICE_CLOSE);
   if(ema20Handle != INVALID_HANDLE)
   {
      double buffer[];
      ArraySetAsSeries(buffer, true);
      if(CopyBuffer(ema20Handle, 0, 0, 1, buffer) > 0)
         ema20 = buffer[0];
      IndicatorRelease(ema20Handle);
   }
   
   int ema50Handle = iMA(_Symbol, PERIOD_CURRENT, 50, 0, MODE_EMA, PRICE_CLOSE);
   if(ema50Handle != INVALID_HANDLE)
   {
      double buffer[];
      ArraySetAsSeries(buffer, true);
      if(CopyBuffer(ema50Handle, 0, 0, 1, buffer) > 0)
         ema50 = buffer[0];
      IndicatorRelease(ema50Handle);
   }
   
   int sma200Handle = iMA(_Symbol, PERIOD_CURRENT, 200, 0, MODE_SMA, PRICE_CLOSE);
   if(sma200Handle != INVALID_HANDLE)
   {
      double buffer[];
      ArraySetAsSeries(buffer, true);
      if(CopyBuffer(sma200Handle, 0, 0, 1, buffer) > 0)
         sma200 = buffer[0];
      IndicatorRelease(sma200Handle);
   }
   
   double bbUpper = 0, bbMiddle = 0, bbLower = 0;
   int bbHandle = iBands(_Symbol, PERIOD_CURRENT, 20, 0, 2, PRICE_CLOSE);
   if(bbHandle != INVALID_HANDLE)
   {
      double upperBuffer[], middleBuffer[], lowerBuffer[];
      ArraySetAsSeries(upperBuffer, true);
      ArraySetAsSeries(middleBuffer, true);
      ArraySetAsSeries(lowerBuffer, true);
      if(CopyBuffer(bbHandle, 1, 0, 1, upperBuffer) > 0)
         bbUpper = upperBuffer[0];
      if(CopyBuffer(bbHandle, 0, 0, 1, middleBuffer) > 0)
         bbMiddle = middleBuffer[0];
      if(CopyBuffer(bbHandle, 2, 0, 1, lowerBuffer) > 0)
         bbLower = lowerBuffer[0];
      IndicatorRelease(bbHandle);
   }
   
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double spread = (ask - bid) / SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   
   string json = StringFormat(
      "{\"rsi\":%.2f,\"macd\":{\"main\":%.5f,\"signal\":%.5f,\"histogram\":%.5f},\"atr\":%.5f,\"ema20\":%.5f,\"ema50\":%.5f,\"sma200\":%.5f,\"bollingerBands\":{\"upper\":%.5f,\"middle\":%.5f,\"lower\":%.5f},\"price\":{\"bid\":%.5f,\"ask\":%.5f,\"spread\":%.1f}}",
      rsi,
      macdMain, macdSignal, macdHist,
      atr,
      ema20, ema50, sma200,
      bbUpper, bbMiddle, bbLower,
      bid, ask, spread
   );
   
   return json;
}

//+------------------------------------------------------------------+
//| Build multi-timeframe analysis data                              |
//+------------------------------------------------------------------+
string BuildMultiTimeframeJson()
{
   string json = "{";
   bool first = true;
   
   // Build data for each enabled timeframe
   if(INCLUDE_M5)
   {
      if(!first) json += ",";
      json += "\"M5\":" + BuildTimeframeData(PERIOD_M5);
      first = false;
   }
   
   if(INCLUDE_M15)
   {
      if(!first) json += ",";
      json += "\"M15\":" + BuildTimeframeData(PERIOD_M15);
      first = false;
   }
   
   if(INCLUDE_H1)
   {
      if(!first) json += ",";
      json += "\"H1\":" + BuildTimeframeData(PERIOD_H1);
      first = false;
   }
   
   if(INCLUDE_H4)
   {
      if(!first) json += ",";
      json += "\"H4\":" + BuildTimeframeData(PERIOD_H4);
      first = false;
   }
   
   if(INCLUDE_D1)
   {
      if(!first) json += ",";
      json += "\"D1\":" + BuildTimeframeData(PERIOD_D1);
      first = false;
   }
   
   if(INCLUDE_W1)
   {
      if(!first) json += ",";
      json += "\"W1\":" + BuildTimeframeData(PERIOD_W1);
      first = false;
   }
   
   json += "}";
   return json;
}

//+------------------------------------------------------------------+
//| Build data for a specific timeframe                              |
//+------------------------------------------------------------------+
string BuildTimeframeData(ENUM_TIMEFRAMES tf)
{
   int candleCount = 30; // Fewer candles for additional timeframes
   
   // Get candles
   string candlesJson = "[";
   for(int i = 0; i < candleCount; i++)
   {
      datetime time = iTime(_Symbol, tf, i);
      double open = iOpen(_Symbol, tf, i);
      double high = iHigh(_Symbol, tf, i);
      double low = iLow(_Symbol, tf, i);
      double close = iClose(_Symbol, tf, i);
      long volume = iVolume(_Symbol, tf, i);
      
      candlesJson += StringFormat(
         "{\"t\":%d,\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%d}",
         time, open, high, low, close, volume
      );
      
      if(i < candleCount - 1) candlesJson += ",";
   }
   candlesJson += "]";
   
   // Calculate indicators for this timeframe
   double rsi = 0;
   int rsiHandle = iRSI(_Symbol, tf, 14, PRICE_CLOSE);
   if(rsiHandle != INVALID_HANDLE)
   {
      double rsiBuffer[];
      ArraySetAsSeries(rsiBuffer, true);
      if(CopyBuffer(rsiHandle, 0, 0, 1, rsiBuffer) > 0)
         rsi = rsiBuffer[0];
      IndicatorRelease(rsiHandle);
   }
   
   double macdMain = 0, macdSignal = 0;
   int macdHandle = iMACD(_Symbol, tf, 12, 26, 9, PRICE_CLOSE);
   if(macdHandle != INVALID_HANDLE)
   {
      double macdMainBuffer[], macdSignalBuffer[];
      ArraySetAsSeries(macdMainBuffer, true);
      ArraySetAsSeries(macdSignalBuffer, true);
      if(CopyBuffer(macdHandle, 0, 0, 1, macdMainBuffer) > 0)
         macdMain = macdMainBuffer[0];
      if(CopyBuffer(macdHandle, 1, 0, 1, macdSignalBuffer) > 0)
         macdSignal = macdSignalBuffer[0];
      IndicatorRelease(macdHandle);
   }
   
   double ema20 = 0, ema50 = 0, sma200 = 0;
   
   int ema20Handle = iMA(_Symbol, tf, 20, 0, MODE_EMA, PRICE_CLOSE);
   if(ema20Handle != INVALID_HANDLE)
   {
      double buffer[];
      ArraySetAsSeries(buffer, true);
      if(CopyBuffer(ema20Handle, 0, 0, 1, buffer) > 0)
         ema20 = buffer[0];
      IndicatorRelease(ema20Handle);
   }
   
   int ema50Handle = iMA(_Symbol, tf, 50, 0, MODE_EMA, PRICE_CLOSE);
   if(ema50Handle != INVALID_HANDLE)
   {
      double buffer[];
      ArraySetAsSeries(buffer, true);
      if(CopyBuffer(ema50Handle, 0, 0, 1, buffer) > 0)
         ema50 = buffer[0];
      IndicatorRelease(ema50Handle);
   }
   
   int sma200Handle = iMA(_Symbol, tf, 200, 0, MODE_SMA, PRICE_CLOSE);
   if(sma200Handle != INVALID_HANDLE)
   {
      double buffer[];
      ArraySetAsSeries(buffer, true);
      if(CopyBuffer(sma200Handle, 0, 0, 1, buffer) > 0)
         sma200 = buffer[0];
      IndicatorRelease(sma200Handle);
   }
   
   // Determine trend for this timeframe
   double currentClose = iClose(_Symbol, tf, 0);
   string trend = "NEUTRAL";
   if(currentClose > ema20 && ema20 > ema50)
      trend = "BULLISH";
   else if(currentClose < ema20 && ema20 < ema50)
      trend = "BEARISH";
   else if(currentClose > sma200)
      trend = "ABOVE_SMA200";
   else if(currentClose < sma200)
      trend = "BELOW_SMA200";
   
   // Build JSON for this timeframe
   string json = StringFormat(
      "{\"candles\":%s,\"indicators\":{\"rsi\":%.2f,\"macdMain\":%.5f,\"macdSignal\":%.5f,\"ema20\":%.5f,\"ema50\":%.5f,\"sma200\":%.5f},\"trend\":\"%s\",\"close\":%.5f}",
      candlesJson,
      rsi,
      macdMain, macdSignal,
      ema20, ema50, sma200,
      trend,
      currentClose
   );
   
   return json;
}

//+------------------------------------------------------------------+
//| Convert timeframe enum to string                                 |
//+------------------------------------------------------------------+
string GetTimeframeString()
{
   switch(Period())
   {
      case PERIOD_M1:  return "M1";
      case PERIOD_M5:  return "M5";
      case PERIOD_M15: return "M15";
      case PERIOD_M30: return "M30";
      case PERIOD_H1:  return "H1";
      case PERIOD_H4:  return "H4";
      case PERIOD_D1:  return "D1";
      case PERIOD_W1:  return "W1";
      case PERIOD_MN1: return "MN1";
      default: return EnumToString(Period());
   }
}
//+------------------------------------------------------------------+
