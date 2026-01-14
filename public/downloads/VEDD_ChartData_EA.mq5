//+------------------------------------------------------------------+
//|                                           VEDD_ChartData_EA.mq5 |
//|                              AI Powered Trading Vault           |
//|                  Chart Data Sender + Auto-Trading EA            |
//+------------------------------------------------------------------+
#property copyright "AI Powered Trading Vault"
#property link      "https://aipoweredtradingvault.com"
#property version   "3.60"
#property description "Sends chart data to AI Trading Vault with news-aware analysis, smart auto-trading, and active trade management"
#property strict

#include <Trade\Trade.mqh>

//+------------------------------------------------------------------+
//|                    *** CONNECTION SETTINGS ***                   |
//+------------------------------------------------------------------+
input string   _conn_header = "========== API CONNECTION =========="; // *** CONNECTION ***
input string   API_URL = "https://your-app-url.replit.app/api/mt5/chart-data";  // API URL (CHANGE THIS!)
input string   API_TOKEN = "";                    // API Token from AI Trading Vault
input int      CANDLES_TO_SEND = 50;              // Candles to Send
input int      SEND_INTERVAL_SECONDS = 60;        // Send Interval (seconds)
input bool     INCLUDE_INDICATORS = true;         // Include Technical Indicators
input bool     SHOW_CHART_COMMENT = true;         // Show Analysis on Chart
input int      TIMEOUT = 15000;                   // Request Timeout (ms)

//+------------------------------------------------------------------+
//|                    *** TIMEFRAME ANALYSIS ***                    |
//+------------------------------------------------------------------+
input string   _tf_header = "========== TIMEFRAMES =========="; // *** TIMEFRAMES ***
input bool     ENABLE_MULTI_TIMEFRAME = true;     // Enable Multi-Timeframe
input bool     INCLUDE_M5 = false;                // Include M5 (Scalping)
input bool     INCLUDE_M15 = true;                // Include M15 (Short-term)
input bool     INCLUDE_H1 = true;                 // Include H1 (Intraday)
input bool     INCLUDE_H4 = true;                 // Include H4 (Swing)
input bool     INCLUDE_D1 = false;                // Include D1 (Daily)
input bool     INCLUDE_W1 = false;                // Include W1 (Weekly)

//+------------------------------------------------------------------+
//|                    *** RISK MANAGEMENT ***                       |
//+------------------------------------------------------------------+
input string   _risk_header = "========== RISK MANAGEMENT =========="; // *** RISK MANAGEMENT ***
input double   LOT_SIZE = 0.01;                   // Fixed Lot Size
input bool     USE_RISK_PERCENT = false;          // Use Risk % Instead of Fixed Lot
input double   RISK_PERCENT = 1.0;                // Risk Per Trade (% of Balance)
input int      MAX_OPEN_TRADES = 1;               // Max Positions Open at Once
input double   DAILY_LOSS_LIMIT = 100.0;          // Daily Loss Limit ($) - 0=Disable
input int      SLIPPAGE_POINTS = 30;              // Max Slippage (points)
input int      MAGIC_NUMBER = 202501;             // Magic Number (Trade ID)

//+------------------------------------------------------------------+
//|                    *** ENTRY SETTINGS ***                        |
//+------------------------------------------------------------------+
input string   _entry_header = "========== ENTRY SETTINGS =========="; // *** ENTRY SETTINGS ***
input bool     ENABLE_AUTO_TRADING = false;       // Enable Auto-Trading (CAREFUL!)
input int      MIN_CONFIDENCE = 70;               // Min AI Confidence % to Trade
input bool     ENABLE_PENDING_ORDERS = false;     // Use Pending Orders at AI Price
input int      PENDING_EXPIRY_HOURS = 4;          // Pending Order Expiry (hours)
input int      COOLDOWN_SECONDS = 300;            // Seconds Between Trades

//+------------------------------------------------------------------+
//|                *** ALLOWED TRADING TIMEFRAMES ***                |
//+------------------------------------------------------------------+
input string   _atf_header = "========== ALLOWED TRADING TIMEFRAMES =========="; // *** TRADING TIMEFRAMES ***
input bool     TRADE_ON_M1 = false;               // Allow Trading on M1
input bool     TRADE_ON_M5 = true;                // Allow Trading on M5
input bool     TRADE_ON_M15 = true;               // Allow Trading on M15
input bool     TRADE_ON_M30 = true;               // Allow Trading on M30
input bool     TRADE_ON_H1 = true;                // Allow Trading on H1
input bool     TRADE_ON_H4 = true;                // Allow Trading on H4
input bool     TRADE_ON_D1 = false;               // Allow Trading on D1
input bool     TRADE_ON_W1 = false;               // Allow Trading on W1

//+------------------------------------------------------------------+
//|                    *** NEWS FILTER ***                           |
//+------------------------------------------------------------------+
input string   _news_header = "========== NEWS FILTER =========="; // *** NEWS FILTER ***
input bool     NEWS_AWARE_TRADING = true;         // Enable News-Aware Trading
input bool     BLOCK_ON_HIGH_IMPACT = true;       // Block During High-Impact News
input bool     BLOCK_ON_CONFLICTING_NEWS = true;  // Block on Conflicting News
input bool     REQUIRE_ALIGNED_NEWS = false;      // Only Trade When News Aligns
input int      MIN_NEWS_SCORE = 0;                // Min News Score (0-100, 0=Any)

//+------------------------------------------------------------------+
//|                    *** TRAILING STOP ***                         |
//+------------------------------------------------------------------+
input string   _trail_header = "========== TRAILING STOP =========="; // *** TRAILING STOP ***
input bool     ENABLE_TRADE_MANAGEMENT = true;    // Enable Trade Management
input bool     ENABLE_TRAILING_STOP = true;       // Enable Trailing Stop
input int      TRAIL_MODE = 1;                    // Trail Mode (1=Fixed, 2=ATR, 3=BE+Trail)
input int      TRAIL_START_PIPS = 20;             // Start Trailing at X Pips Profit
input int      TRAIL_DISTANCE_PIPS = 15;          // Trailing Distance (pips)
input double   TRAIL_ATR_MULTIPLIER = 1.5;        // ATR Multiplier (Mode 2 Only)

//+------------------------------------------------------------------+
//|                    *** BREAKEVEN ***                             |
//+------------------------------------------------------------------+
input string   _be_header = "========== BREAKEVEN =========="; // *** BREAKEVEN ***
input bool     MOVE_TO_BREAKEVEN = true;          // Move SL to Breakeven
input int      BREAKEVEN_PIPS = 15;               // Move at X Pips Profit
input int      BREAKEVEN_LOCK_PIPS = 2;           // Lock in X Pips at Breakeven

//+------------------------------------------------------------------+
//|                 *** MOMENTUM & VOLUME EXIT ***                   |
//+------------------------------------------------------------------+
input string   _mom_header = "========== MOMENTUM & VOLUME EXIT =========="; // *** MOMENTUM & VOLUME ***
input bool     ENABLE_MOMENTUM_MANAGEMENT = true; // Manage Trades by Momentum
input bool     CLOSE_ON_MOMENTUM_REVERSAL = true; // Close if Momentum Reverses
input int      RSI_OVERBOUGHT = 70;               // RSI Overbought Level (Close Longs)
input int      RSI_OVERSOLD = 30;                 // RSI Oversold Level (Close Shorts)
input bool     ENABLE_VOLUME_MANAGEMENT = true;   // Manage Trades by Volume
input bool     CLOSE_ON_LOW_VOLUME = false;       // Close if Volume Drops
input double   VOLUME_DROP_PERCENT = 50.0;        // Close if Volume < X% of Avg

//+------------------------------------------------------------------+
//|                    *** PYRAMIDING ***                            |
//+------------------------------------------------------------------+
input string   _pyr_header = "========== PYRAMIDING (Add to Winners) =========="; // *** PYRAMIDING ***
input bool     ENABLE_PYRAMIDING = false;         // Enable Pyramiding
input int      PYRAMID_MAX_POSITIONS = 3;         // Max Positions to Stack
input int      PYRAMID_TRIGGER_PIPS = 30;         // Add Position Every X Pips Profit
input double   PYRAMID_LOT_MULTIPLIER = 1.0;      // Lot Multiplier for Each Add
input bool     PYRAMID_MOVE_SL = true;            // Move All SL to New Entry
input int      PYRAMID_MIN_CONFIDENCE = 65;       // Min AI Confidence to Add

//+------------------------------------------------------------------+
//|                    *** GRID TRADING ***                          |
//+------------------------------------------------------------------+
input string   _grid_header = "========== GRID TRADING (CAREFUL!) =========="; // *** GRID TRADING ***
input bool     ENABLE_GRID = false;               // Enable Grid Trading
input int      GRID_LEVELS = 3;                   // Number of Grid Levels
input int      GRID_SPACING_PIPS = 20;            // Pips Between Grid Orders
input double   GRID_LOT_SIZE = 0.01;              // Lot Size Per Grid Order
input bool     GRID_HEDGE_MODE = false;           // Place Orders Both Directions
input int      GRID_TP_PIPS = 15;                 // Take Profit Per Grid Order
input int      GRID_MAX_ORDERS = 6;               // Max Total Grid Orders

//+------------------------------------------------------------------+
//|                    *** MARTINGALE ***                            |
//+------------------------------------------------------------------+
input string   _mart_header = "========== MARTINGALE (VERY RISKY!) =========="; // *** MARTINGALE ***
input bool     ENABLE_MARTINGALE = false;         // Enable Martingale
input double   MARTINGALE_MULTIPLIER = 2.0;       // Lot Multiplier After Loss
input int      MARTINGALE_MAX_LEVEL = 3;          // Max Martingale Levels
input bool     MARTINGALE_RESET_ON_WIN = true;    // Reset to Base Lot After Win

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

//--- News context variables
string lastNewsSentiment = "";
int lastNewsScore = 0;
string lastNewsAlignment = "";
string lastNewsImpact = "";
string lastHighImpactAlert = "";
bool hasNewsData = false;

//--- Trading state
datetime lastTradeTime = 0;
string lastExecutedSignal = "";
double dailyLossAccumulated = 0;
datetime dailyLossResetDate = 0;
CTrade trade;

//--- Pyramiding state
int pyramidPositionCount = 0;
double pyramidLastAddPrice = 0;

//--- Martingale state
int martingaleLevel = 0;
double martingaleCurrentLot = 0;
bool lastTradeWasLoss = false;

//--- Grid state
int activeGridOrders = 0;

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
   Print("PEACE GOD! VEDD AI Chart Data EA v3.60");
   Print("Knowledge Born - Smart Trade Management Active");
   Print("========================================");
   Print("CIPHER: ", _Symbol, " | ", EnumToString(Period()));
   Print("Candles: ", CANDLES_TO_SEND, " | Interval: ", SEND_INTERVAL_SECONDS, "s");
   Print("----------------------------------------");
   Print("MULTI-TIMEFRAME (Understanding All Degrees): ", ENABLE_MULTI_TIMEFRAME ? "ACTIVE" : "OFF");
   if(ENABLE_MULTI_TIMEFRAME)
   {
      string tfList = "";
      if(INCLUDE_M5) tfList += "M5 ";
      if(INCLUDE_M15) tfList += "M15 ";
      if(INCLUDE_H1) tfList += "H1 ";
      if(INCLUDE_H4) tfList += "H4 ";
      if(INCLUDE_D1) tfList += "D1 ";
      if(INCLUDE_W1) tfList += "W1 ";
      Print("Degrees of Time: ", tfList);
   }
   Print("----------------------------------------");
   Print("AUTO-BUILD (Auto-Trading): ", ENABLE_AUTO_TRADING ? "ACTIVE" : "OFF");
   if(ENABLE_AUTO_TRADING)
   {
      Print("Power (Lots): ", USE_RISK_PERCENT ? DoubleToString(RISK_PERCENT, 1) + "% risk" : DoubleToString(LOT_SIZE, 2));
      Print("Min Understanding (Confidence): ", MIN_CONFIDENCE, "%");
      Print("Max Ciphers Open: ", MAX_OPEN_TRADES);
      Print("Pending Wisdom: ", ENABLE_PENDING_ORDERS ? "YES" : "NO");
      Print("----------------------------------------");
      string allowedTF = "";
      if(TRADE_ON_M1) allowedTF += "M1 ";
      if(TRADE_ON_M5) allowedTF += "M5 ";
      if(TRADE_ON_M15) allowedTF += "M15 ";
      if(TRADE_ON_M30) allowedTF += "M30 ";
      if(TRADE_ON_H1) allowedTF += "H1 ";
      if(TRADE_ON_H4) allowedTF += "H4 ";
      if(TRADE_ON_D1) allowedTF += "D1 ";
      if(TRADE_ON_W1) allowedTF += "W1 ";
      Print("ALLOWED TRADING TIMEFRAMES: ", allowedTF);
      Print("----------------------------------------");
      Print("NEWS WISDOM (News-Aware): ", NEWS_AWARE_TRADING ? "ACTIVE" : "OFF");
      if(NEWS_AWARE_TRADING)
      {
         Print("  Block High-Impact (Major Shakes): ", BLOCK_ON_HIGH_IMPACT ? "YES" : "NO");
         Print("  Block Conflicting Wisdom: ", BLOCK_ON_CONFLICTING_NEWS ? "YES" : "NO");
         Print("  Require Aligned Knowledge: ", REQUIRE_ALIGNED_NEWS ? "YES" : "NO");
         if(MIN_NEWS_SCORE > 0) Print("  Min News Power: ", MIN_NEWS_SCORE);
      }
      Print("----------------------------------------");
      Print("TRADE REFINEMENT (Active Management): ", ENABLE_TRADE_MANAGEMENT ? "ACTIVE" : "OFF");
      if(ENABLE_TRADE_MANAGEMENT)
      {
         if(ENABLE_TRAILING_STOP)
         {
            string trailType = TRAIL_MODE == 1 ? "Fixed" : (TRAIL_MODE == 2 ? "ATR-Wisdom" : "Breakeven+Trail");
            Print("  Trailing (Lock the Cipher): ", trailType);
            Print("  Trail Start: ", TRAIL_START_PIPS, " | Distance: ", TRAIL_DISTANCE_PIPS);
         }
         if(MOVE_TO_BREAKEVEN)
            Print("  Breakeven (Secure the Equality): At ", BREAKEVEN_PIPS, " lock ", BREAKEVEN_LOCK_PIPS);
         if(ENABLE_MOMENTUM_MANAGEMENT)
            Print("  Momentum (Energy Flow): RSI ", RSI_OVERBOUGHT, "/", RSI_OVERSOLD);
         if(ENABLE_VOLUME_MANAGEMENT && CLOSE_ON_LOW_VOLUME)
            Print("  Volume (Power Check): Close if < ", VOLUME_DROP_PERCENT, "% avg");
      }
      Print("----------------------------------------");
      Print("PYRAMIDING (Stack the Power): ", ENABLE_PYRAMIDING ? "ACTIVE" : "OFF");
      if(ENABLE_PYRAMIDING)
      {
         Print("  Max Stacks: ", PYRAMID_MAX_POSITIONS, " | Trigger: ", PYRAMID_TRIGGER_PIPS, " pips");
         Print("  Lot Multiplier: ", PYRAMID_LOT_MULTIPLIER, "x");
      }
      Print("----------------------------------------");
      Print("GRID TRADING (The Matrix): ", ENABLE_GRID ? "ACTIVE" : "OFF");
      if(ENABLE_GRID)
      {
         Print("  Levels: ", GRID_LEVELS, " | Spacing: ", GRID_SPACING_PIPS, " pips");
         Print("  Hedge Mode: ", GRID_HEDGE_MODE ? "YES (both ways)" : "NO (signal only)");
      }
      Print("----------------------------------------");
      Print("MARTINGALE (Double or Nothing): ", ENABLE_MARTINGALE ? "ACTIVE - BE CAREFUL!" : "OFF");
      if(ENABLE_MARTINGALE)
      {
         Print("  Multiplier: ", MARTINGALE_MULTIPLIER, "x | Max Level: ", MARTINGALE_MAX_LEVEL);
      }
   }
   Print("========================================");
   Print("Word is Bond. Now Let's Build!");
   
   SendChartData();
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   Print("Peace! Cipher Complete. Total Knowledge Dropped: ", sendCount);
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
      
      if(ENABLE_TRADE_MANAGEMENT)
      {
         ManageOpenTrades();
      }
      
      if(ENABLE_PYRAMIDING)
      {
         CheckPyramidOpportunity();
      }
      
      if(ENABLE_GRID)
      {
         ManageGridOrders();
      }
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
   
   // Extract news context (uses mt5-prefixed flat fields from API)
   lastNewsSentiment = ExtractJsonString(json, "\"mt5NewsSentiment\":\"", "\"");
   lastNewsAlignment = ExtractJsonString(json, "\"mt5NewsAlignment\":\"", "\"");
   lastNewsImpact = ExtractJsonString(json, "\"mt5NewsImpact\":\"", "\"");
   lastHighImpactAlert = ExtractJsonString(json, "\"mt5HighImpactAlert\":\"", "\"");
   
   string newsScoreStr = ExtractJsonNumber(json, "\"mt5NewsScore\":");
   if(StringLen(newsScoreStr) > 0 && StringLen(lastNewsSentiment) > 0)
   {
      lastNewsScore = (int)StringToInteger(newsScoreStr);
      hasNewsData = true;
   }
   else
   {
      hasNewsData = false;
   }
   
   Print("");
   Print("PEACE GOD/EARTH! VEDD AI droppin' Knowledge on ", _Symbol, " (", GetTimeframeString(), ")");
   Print("");
   
   if(lastSignal == "BUY")
   {
      Print("KNOWLEDGE (1): This cipher is BUILDING UP! ", lastConfidence, "% Understanding on a BUY.");
      Print("The Gods are in control - bulls movin' with POWER!");
   }
   else if(lastSignal == "SELL")
   {
      Print("WISDOM (2): This cipher is BREAKIN' DOWN! ", lastConfidence, "% Understanding on a SELL.");
      Print("Time to let the bears do the KNOWLEDGE - downside power manifesting!");
   }
   else
   {
      Print("UNDERSTANDING (3): The cipher ain't clear yet - NEUTRAL zone.");
      Print("No rush G - wait for the EQUALITY (6) before you BUILD.");
   }
   
   if(StringLen(lastTrend) > 0)
   {
      if(StringFind(lastTrend, "STRONG") >= 0)
         Print("POWER (5): Trend is STRONG! ", lastTrend, " - Momentum is BORN!");
      else if(StringFind(lastTrend, "UP") >= 0)
         Print("CULTURE (4): Uptrend active - the cipher risin' with FREEDOM!");
      else if(StringFind(lastTrend, "DOWN") >= 0)
         Print("BUILD/DESTROY (8): Downtrend active - destruction before new BORN.");
      else
         Print("Trend Status: ", lastTrend);
   }
   
   if(StringLen(lastPatterns) > 0)
   {
      Print("");
      Print("DIVINE PATTERNS MANIFESTED: ", lastPatterns);
   }
   
   if(lastEntry > 0)
   {
      Print("");
      Print("THE TRADE MATHEMATICS (Plan for EQUALITY):");
      Print("   BORN (9) Entry @ ", DoubleToString(lastEntry, _Digits));
      Print("   CIPHER (0) SL @ ", DoubleToString(lastSL, _Digits), " - Protect your POWER!");
      Print("   GOD (7) TP @ ", DoubleToString(lastTP, _Digits), " - Manifest those gains!");
   }
   
   // Display news context if available
   if(hasNewsData)
   {
      Print("");
      Print("NEWS WISDOM (Word on the Street):");
      Print("   Sentiment: ", lastNewsSentiment, " | Power Score: ", lastNewsScore, "/100");
      if(StringLen(lastNewsAlignment) > 0)
      {
         if(lastNewsAlignment == "aligned")
            Print("   EQUALITY (6): News ALIGNS with the Knowledge - Word is Bond!");
         else if(lastNewsAlignment == "conflicting")
            Print("   WARNING: News CONFLICTS - Mixed wisdom, tread lightly!");
         else
            Print("   News neutral - neither building nor destroying.");
      }
      if(StringLen(lastNewsImpact) > 0)
      {
         Print("   Impact Level: ", lastNewsImpact);
      }
   }
   
   // High impact news warning
   if(StringLen(lastHighImpactAlert) > 0)
   {
      Print("");
      Print("*** KNOWLEDGE ALERT: ", lastHighImpactAlert, " ***");
   }
   
   Print("");
   Print("PEACE! Stay RIGHTEOUS, trade with UNDERSTANDING! - VEDD AI (Drop #", sendCount, ")");
   
   if(SHOW_CHART_COMMENT)
   {
      UpdateChartComment();
   }
}

//+------------------------------------------------------------------+
//| Check if news conditions allow trading                           |
//+------------------------------------------------------------------+
bool ShouldAutoTradeWithNews(string &reason)
{
   // Skip news checks if feature is disabled
   if(!NEWS_AWARE_TRADING)
   {
      return true;
   }
   
   // Check for high-impact news alert
   if(BLOCK_ON_HIGH_IMPACT && StringLen(lastHighImpactAlert) > 0)
   {
      reason = "High-impact news event imminent";
      return false;
   }
   
   // If we have news data, apply additional checks
   if(hasNewsData)
   {
      // Block if news conflicts with signal
      if(BLOCK_ON_CONFLICTING_NEWS && lastNewsAlignment == "conflicting")
      {
         reason = "News CONFLICTS with " + lastSignal + " signal";
         return false;
      }
      
      // Require aligned news if setting enabled
      if(REQUIRE_ALIGNED_NEWS && lastNewsAlignment != "aligned")
      {
         reason = "News not aligned (need bullish/bearish confirmation)";
         return false;
      }
      
      // Check minimum news score
      if(MIN_NEWS_SCORE > 0 && lastNewsScore < MIN_NEWS_SCORE)
      {
         reason = "News score " + IntegerToString(lastNewsScore) + " below minimum " + IntegerToString(MIN_NEWS_SCORE);
         return false;
      }
   }
   else if(REQUIRE_ALIGNED_NEWS)
   {
      // If we require aligned news but have no news data, block
      reason = "No news data available (required for aligned trading)";
      return false;
   }
   
   return true;
}

//+------------------------------------------------------------------+
//| Check if current timeframe is allowed for trading                 |
//+------------------------------------------------------------------+
bool IsTimeframeAllowed()
{
   ENUM_TIMEFRAMES tf = Period();
   
   switch(tf)
   {
      case PERIOD_M1:  return TRADE_ON_M1;
      case PERIOD_M5:  return TRADE_ON_M5;
      case PERIOD_M15: return TRADE_ON_M15;
      case PERIOD_M30: return TRADE_ON_M30;
      case PERIOD_H1:  return TRADE_ON_H1;
      case PERIOD_H4:  return TRADE_ON_H4;
      case PERIOD_D1:  return TRADE_ON_D1;
      case PERIOD_W1:  return TRADE_ON_W1;
      default:         return true;  // Allow other timeframes by default
   }
}

//+------------------------------------------------------------------+
//| Process auto-trade based on signal                               |
//+------------------------------------------------------------------+
void ProcessAutoTrade()
{
   // TIMEFRAME CHECK - Only trade on allowed timeframes
   if(!IsTimeframeAllowed())
   {
      Print("[BUILD] Timeframe ", EnumToString(Period()), " not allowed for trading. Skipping.");
      return;
   }
   
   if(lastConfidence < MIN_CONFIDENCE)
   {
      Print("[BUILD] Understanding too low (", lastConfidence, "% < ", MIN_CONFIDENCE, "%). Can't BUILD yet.");
      return;
   }
   
   if(lastSignal != "BUY" && lastSignal != "SELL")
   {
      Print("[BUILD] Cipher is NEUTRAL - no BUILD or DESTROY signal. Patience.");
      return;
   }
   
   // NEWS-AWARE TRADING CHECK
   string newsBlockReason = "";
   if(!ShouldAutoTradeWithNews(newsBlockReason))
   {
      Print("[BUILD] NEWS WISDOM BLOCKED: ", newsBlockReason);
      Print("[BUILD] Signal was ", lastSignal, " @ ", lastConfidence, "% - wait for EQUALITY.");
      return;
   }
   
   // Log positive news confirmation if applicable
   if(NEWS_AWARE_TRADING && hasNewsData && lastNewsAlignment == "aligned")
   {
      Print("[BUILD] WORD IS BOND! News ALIGNS with ", lastSignal, " - ", lastNewsSentiment);
   }
   
   if(lastSignal == lastExecutedSignal && (TimeCurrent() - lastTradeTime) < COOLDOWN_SECONDS)
   {
      Print("[BUILD] Same Knowledge within cooldown. Can't stack the cipher.");
      return;
   }
   
   if(CountOpenTrades() >= MAX_OPEN_TRADES)
   {
      Print("[BUILD] Max ciphers open (", MAX_OPEN_TRADES, "). Handle current POWER first.");
      return;
   }
   
   // Check for existing pending orders to prevent stacking duplicates
   if(ENABLE_PENDING_ORDERS && HasExistingPendingOrder(lastSignal))
   {
      Print("[BUILD] Already got pending ", lastSignal, " wisdom in the queue.");
      return;
   }
   
   if(!CheckDailyLossLimit())
   {
      Print("[BUILD] Daily DESTROY limit hit. Protect the cipher - no more trades today.");
      return;
   }
   
   if(!TerminalInfoInteger(TERMINAL_TRADE_ALLOWED) || !MQLInfoInteger(MQL_TRADE_ALLOWED))
   {
      Print("[BUILD] Trading not ALLOWED. Check your PERMISSIONS, G.");
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
   
   // Apply martingale multiplier if enabled
   if(ENABLE_MARTINGALE)
   {
      lots = GetMartingaleLotSize(lots);
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
      Print("[BUILD] BORN (9)! Cipher MANIFESTED - ", lastSignal, " ", lots, " lots @ ", trade.ResultPrice());
      Print("[BUILD] CIPHER protection @ ", sl, " | GOD level TP @ ", tp);
      Print("[BUILD] Word is Bond - the MATHEMATICS are set. Peace!");
      lastTradeTime = TimeCurrent();
      lastExecutedSignal = lastSignal;
   }
   else
   {
      Print("[BUILD] DESTROYED! Error: ", trade.ResultRetcode(), " - ", trade.ResultRetcodeDescription());
      Print("[BUILD] The cipher didn't complete - we'll try again.");
   }
}

//+------------------------------------------------------------------+
//| Place pending order                                              |
//+------------------------------------------------------------------+
void PlacePendingOrder(double lots)
{
   if(lastEntry <= 0)
   {
      Print("[BUILD] No BORN (9) entry price yet. Going straight to market BUILD.");
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
      Print("[BUILD] PENDING WISDOM SET! ", EnumToString(orderType));
      Print("[BUILD] BORN @ ", price, " | CIPHER @ ", sl, " | GOD @ ", tp);
      Print("[BUILD] Knowledge expires: ", TimeToString(expiry));
      lastTradeTime = TimeCurrent();
      lastExecutedSignal = lastSignal;
   }
   else
   {
      Print("[BUILD] PENDING WISDOM REJECTED! Error: ", tradeResult.retcode, " - ", GetRetcodeDescription(tradeResult.retcode));
      Print("[BUILD] No rush - we'll drop the Knowledge again next signal.");
   }
}

//+------------------------------------------------------------------+
//| Manage open trades - trailing stop, momentum, volume             |
//+------------------------------------------------------------------+
void ManageOpenTrades()
{
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   // Calculate pip value based on broker digit precision
   // 3 or 5 digit brokers use point*10, 2 or 4 digit use point
   double pipValue = (_Digits == 3 || _Digits == 5) ? point * 10 : point;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      
      if(PositionGetInteger(POSITION_MAGIC) != MAGIC_NUMBER) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);
      double positionVolume = PositionGetDouble(POSITION_VOLUME);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      
      double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double currentPrice = (posType == POSITION_TYPE_BUY) ? currentBid : currentAsk;
      
      // Calculate profit in pips
      double profitPips = 0;
      if(posType == POSITION_TYPE_BUY)
         profitPips = (currentBid - openPrice) / pipValue;
      else
         profitPips = (openPrice - currentAsk) / pipValue;
      
      // 1. MOMENTUM MANAGEMENT - Check if momentum reversed
      if(ENABLE_MOMENTUM_MANAGEMENT && CLOSE_ON_MOMENTUM_REVERSAL)
      {
         double rsi = GetCurrentRSI();
         bool shouldClose = false;
         string reason = "";
         
         if(posType == POSITION_TYPE_BUY && rsi >= RSI_OVERBOUGHT)
         {
            shouldClose = true;
            reason = "RSI overbought (" + DoubleToString(rsi, 1) + ")";
         }
         else if(posType == POSITION_TYPE_SELL && rsi <= RSI_OVERSOLD)
         {
            shouldClose = true;
            reason = "RSI oversold (" + DoubleToString(rsi, 1) + ")";
         }
         
         // Also check MACD reversal
         double macdMain, macdSignal;
         GetCurrentMACD(macdMain, macdSignal);
         
         if(posType == POSITION_TYPE_BUY && macdMain < macdSignal && profitPips > 10)
         {
            shouldClose = true;
            reason = "MACD bearish crossover";
         }
         else if(posType == POSITION_TYPE_SELL && macdMain > macdSignal && profitPips > 10)
         {
            shouldClose = true;
            reason = "MACD bullish crossover";
         }
         
         if(shouldClose && profitPips > 5) // Only close if in profit
         {
            Print("[REFINEMENT] KNOWLEDGE says close now: ", reason, " - securing the cipher!");
            trade.PositionClose(ticket);
            continue;
         }
      }
      
      // 2. VOLUME MANAGEMENT - Check if volume dropped
      if(ENABLE_VOLUME_MANAGEMENT && CLOSE_ON_LOW_VOLUME)
      {
         double avgVolume = GetAverageVolume(20);
         long currentVolume = iVolume(_Symbol, PERIOD_CURRENT, 0);
         
         if(avgVolume > 0 && currentVolume < avgVolume * (VOLUME_DROP_PERCENT / 100.0))
         {
            if(profitPips > 5) // Only close if in profit
            {
               Print("[REFINEMENT] POWER dropping! Volume ", currentVolume, " < ", (int)(avgVolume * VOLUME_DROP_PERCENT / 100), " - exit now!");
               trade.PositionClose(ticket);
               continue;
            }
         }
      }
      
      // 3. BREAKEVEN - Move SL to breakeven
      if(MOVE_TO_BREAKEVEN && profitPips >= BREAKEVEN_PIPS)
      {
         double newSL = 0;
         if(posType == POSITION_TYPE_BUY)
         {
            newSL = NormalizeDouble(openPrice + (BREAKEVEN_LOCK_PIPS * pipValue), _Digits);
            if(currentSL < newSL)
            {
               if(trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] EQUALITY secured! Breakeven + ", BREAKEVEN_LOCK_PIPS, " - can't lose now!");
            }
         }
         else // SELL
         {
            newSL = NormalizeDouble(openPrice - (BREAKEVEN_LOCK_PIPS * pipValue), _Digits);
            if(currentSL > newSL || currentSL == 0)
            {
               if(trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] EQUALITY secured! Breakeven + ", BREAKEVEN_LOCK_PIPS, " - can't lose now!");
            }
         }
      }
      
      // 4. TRAILING STOP
      if(ENABLE_TRAILING_STOP && profitPips >= TRAIL_START_PIPS)
      {
         double trailDistance = 0;
         
         // Calculate trail distance based on mode
         if(TRAIL_MODE == 1) // Fixed
         {
            trailDistance = TRAIL_DISTANCE_PIPS * pipValue;
         }
         else if(TRAIL_MODE == 2) // ATR-based
         {
            double atr = GetCurrentATR();
            trailDistance = atr * TRAIL_ATR_MULTIPLIER;
         }
         else if(TRAIL_MODE == 3) // Breakeven + Trail
         {
            trailDistance = TRAIL_DISTANCE_PIPS * pipValue;
         }
         
         double newSL = 0;
         if(posType == POSITION_TYPE_BUY)
         {
            newSL = NormalizeDouble(currentBid - trailDistance, _Digits);
            if(newSL > currentSL && newSL > openPrice)
            {
               if(trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] Trail LOCKING profits @ ", newSL, " - BORN to WIN!");
            }
         }
         else // SELL
         {
            newSL = NormalizeDouble(currentAsk + trailDistance, _Digits);
            if((newSL < currentSL || currentSL == 0) && newSL < openPrice)
            {
               if(trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] Trail LOCKING profits @ ", newSL, " - BORN to WIN!");
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Get current RSI value                                            |
//+------------------------------------------------------------------+
double GetCurrentRSI()
{
   double rsi = 50; // Default neutral
   int rsiHandle = iRSI(_Symbol, PERIOD_CURRENT, 14, PRICE_CLOSE);
   if(rsiHandle != INVALID_HANDLE)
   {
      double rsiBuffer[];
      ArraySetAsSeries(rsiBuffer, true);
      if(CopyBuffer(rsiHandle, 0, 0, 1, rsiBuffer) > 0)
         rsi = rsiBuffer[0];
      IndicatorRelease(rsiHandle);
   }
   return rsi;
}

//+------------------------------------------------------------------+
//| Get current MACD values                                          |
//+------------------------------------------------------------------+
void GetCurrentMACD(double &macdMain, double &macdSignal)
{
   macdMain = 0;
   macdSignal = 0;
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
      IndicatorRelease(macdHandle);
   }
}

//+------------------------------------------------------------------+
//| Get current ATR value                                            |
//+------------------------------------------------------------------+
double GetCurrentATR()
{
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
   return atr;
}

//+------------------------------------------------------------------+
//| Get average volume over N bars                                   |
//+------------------------------------------------------------------+
double GetAverageVolume(int bars)
{
   double totalVolume = 0;
   for(int i = 1; i <= bars; i++)
   {
      totalVolume += (double)iVolume(_Symbol, PERIOD_CURRENT, i);
   }
   return bars > 0 ? totalVolume / bars : 0;
}

//+------------------------------------------------------------------+
//| PYRAMIDING - Check for opportunity to add to winning position    |
//+------------------------------------------------------------------+
void CheckPyramidOpportunity()
{
   if(!ENABLE_PYRAMIDING) return;
   
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double pipValue = (_Digits == 3 || _Digits == 5) ? point * 10 : point;
   
   // Count our current positions
   int posCount = 0;
   double bestProfitPips = 0;
   double baseOpenPrice = 0;
   ENUM_POSITION_TYPE currentDirection = POSITION_TYPE_BUY;
   
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MAGIC_NUMBER) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      
      posCount++;
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      currentDirection = posType;
      
      if(posCount == 1) baseOpenPrice = openPrice;
      
      double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      double profitPips = 0;
      
      if(posType == POSITION_TYPE_BUY)
         profitPips = (currentBid - openPrice) / pipValue;
      else
         profitPips = (openPrice - currentAsk) / pipValue;
      
      if(profitPips > bestProfitPips) bestProfitPips = profitPips;
   }
   
   pyramidPositionCount = posCount;
   
   // Check if we should add
   if(posCount == 0 || posCount >= PYRAMID_MAX_POSITIONS) return;
   if(lastConfidence < PYRAMID_MIN_CONFIDENCE) return;
   if(bestProfitPips < PYRAMID_TRIGGER_PIPS * posCount) return;
   
   // Check direction matches
   if((currentDirection == POSITION_TYPE_BUY && lastSignal != "BUY") ||
      (currentDirection == POSITION_TYPE_SELL && lastSignal != "SELL"))
      return;
   
   // Calculate pyramid lot size
   double baseLot = CalculateLotSize();
   double pyramidLot = NormalizeDouble(baseLot * MathPow(PYRAMID_LOT_MULTIPLIER, posCount), 2);
   
   // Place the pyramid order
   Print("[PYRAMID] STACKING POWER! Adding position #", posCount + 1);
   Print("[PYRAMID] Current profit: ", DoubleToString(bestProfitPips, 1), " pips | Adding ", pyramidLot, " lots");
   
   double sl = lastSL > 0 ? lastSL : 0;
   double tp = lastTP > 0 ? lastTP : 0;
   string comment = "VEDD Pyramid #" + IntegerToString(posCount + 1);
   
   bool result = false;
   if(currentDirection == POSITION_TYPE_BUY)
   {
      double price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      result = trade.Buy(pyramidLot, _Symbol, price, sl, tp, comment);
   }
   else
   {
      double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
      result = trade.Sell(pyramidLot, _Symbol, price, sl, tp, comment);
   }
   
   if(result)
   {
      Print("[PYRAMID] BORN! Stack #", posCount + 1, " MANIFESTED - Building POWER!");
      pyramidLastAddPrice = (currentDirection == POSITION_TYPE_BUY) ? 
                           SymbolInfoDouble(_Symbol, SYMBOL_ASK) : 
                           SymbolInfoDouble(_Symbol, SYMBOL_BID);
      
      // Move all SL to new entry if enabled
      if(PYRAMID_MOVE_SL)
      {
         MovePyramidStops(currentDirection, pyramidLastAddPrice);
      }
   }
}

//+------------------------------------------------------------------+
//| Move all pyramid position stops to new entry level               |
//+------------------------------------------------------------------+
void MovePyramidStops(ENUM_POSITION_TYPE direction, double newSLLevel)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MAGIC_NUMBER) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      
      double currentTP = PositionGetDouble(POSITION_TP);
      trade.PositionModify(ticket, newSLLevel, currentTP);
   }
   Print("[PYRAMID] All stops moved to EQUALITY @ ", newSLLevel);
}

//+------------------------------------------------------------------+
//| GRID TRADING - Manage grid orders                                |
//+------------------------------------------------------------------+
void ManageGridOrders()
{
   if(!ENABLE_GRID) return;
   
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double pipValue = (_Digits == 3 || _Digits == 5) ? point * 10 : point;
   double currentBid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   // Count existing grid orders
   activeGridOrders = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket > 0 && OrderSelect(ticket))
      {
         if(OrderGetInteger(ORDER_MAGIC) == MAGIC_NUMBER + 100 &&
            OrderGetString(ORDER_SYMBOL) == _Symbol)
         {
            activeGridOrders++;
         }
      }
   }
   
   // Also count grid positions
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER + 100 &&
         PositionGetString(POSITION_SYMBOL) == _Symbol)
      {
         activeGridOrders++;
      }
   }
   
   // Don't place more if at max
   if(activeGridOrders >= GRID_MAX_ORDERS) return;
   
   // Only place grid on valid signals
   if(lastSignal != "BUY" && lastSignal != "SELL") return;
   
   // Place grid levels based on signal direction
   double spacing = GRID_SPACING_PIPS * pipValue;
   double tp = GRID_TP_PIPS * pipValue;
   datetime expiry = TimeCurrent() + 86400; // 24 hours
   
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   for(int level = 1; level <= GRID_LEVELS && activeGridOrders < GRID_MAX_ORDERS; level++)
   {
      // Place in signal direction
      if(lastSignal == "BUY" || GRID_HEDGE_MODE)
      {
         double buyPrice = NormalizeDouble(currentAsk - (spacing * level), _Digits);
         double buyTP = NormalizeDouble(buyPrice + tp, _Digits);
         
         request.action = TRADE_ACTION_PENDING;
         request.symbol = _Symbol;
         request.volume = GRID_LOT_SIZE;
         request.type = ORDER_TYPE_BUY_LIMIT;
         request.price = buyPrice;
         request.sl = 0;
         request.tp = buyTP;
         request.deviation = SLIPPAGE_POINTS;
         request.magic = MAGIC_NUMBER + 100;
         request.comment = "VEDD Grid BUY L" + IntegerToString(level);
         request.type_time = ORDER_TIME_SPECIFIED;
         request.expiration = expiry;
         
         if(OrderSend(request, result) && result.retcode == TRADE_RETCODE_DONE)
         {
            Print("[GRID] Matrix BUY level ", level, " set @ ", buyPrice);
            activeGridOrders++;
         }
      }
      
      if(lastSignal == "SELL" || GRID_HEDGE_MODE)
      {
         double sellPrice = NormalizeDouble(currentBid + (spacing * level), _Digits);
         double sellTP = NormalizeDouble(sellPrice - tp, _Digits);
         
         request.action = TRADE_ACTION_PENDING;
         request.symbol = _Symbol;
         request.volume = GRID_LOT_SIZE;
         request.type = ORDER_TYPE_SELL_LIMIT;
         request.price = sellPrice;
         request.sl = 0;
         request.tp = sellTP;
         request.deviation = SLIPPAGE_POINTS;
         request.magic = MAGIC_NUMBER + 100;
         request.comment = "VEDD Grid SELL L" + IntegerToString(level);
         request.type_time = ORDER_TIME_SPECIFIED;
         request.expiration = expiry;
         
         if(OrderSend(request, result) && result.retcode == TRADE_RETCODE_DONE)
         {
            Print("[GRID] Matrix SELL level ", level, " set @ ", sellPrice);
            activeGridOrders++;
         }
      }
   }
   
   if(activeGridOrders > 0)
      Print("[GRID] THE MATRIX is set! ", activeGridOrders, " grid orders active.");
}

//+------------------------------------------------------------------+
//| MARTINGALE - Calculate lot size with martingale                  |
//+------------------------------------------------------------------+
double GetMartingaleLotSize(double baseLot)
{
   if(!ENABLE_MARTINGALE) return baseLot;
   
   // Check last trade result
   if(HistorySelect(TimeCurrent() - 86400, TimeCurrent()))
   {
      int totalDeals = HistoryDealsTotal();
      for(int i = totalDeals - 1; i >= 0; i--)
      {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket <= 0) continue;
         if(HistoryDealGetInteger(ticket, DEAL_MAGIC) != MAGIC_NUMBER) continue;
         if(HistoryDealGetString(ticket, DEAL_SYMBOL) != _Symbol) continue;
         
         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT)
         {
            double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
            if(profit < 0)
            {
               lastTradeWasLoss = true;
               if(martingaleLevel < MARTINGALE_MAX_LEVEL)
                  martingaleLevel++;
            }
            else if(profit > 0 && MARTINGALE_RESET_ON_WIN)
            {
               martingaleLevel = 0;
               lastTradeWasLoss = false;
            }
            break;
         }
      }
   }
   
   double martingaleLot = baseLot * MathPow(MARTINGALE_MULTIPLIER, martingaleLevel);
   
   if(martingaleLevel > 0)
   {
      Print("[MARTINGALE] Level ", martingaleLevel, " - DOUBLING DOWN! Lot: ", DoubleToString(martingaleLot, 2));
   }
   
   return martingaleLot;
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
                  Print("[BUILD] Cancelled pending wisdom - signal FLIPPED. New KNOWLEDGE incoming!");
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
   
   // News section
   if(hasNewsData)
   {
      commentText += "------------------------------\n";
      commentText += "NEWS: " + lastNewsSentiment + " (" + IntegerToString(lastNewsScore) + ")\n";
      if(StringLen(lastNewsAlignment) > 0)
      {
         if(lastNewsAlignment == "aligned")
            commentText += ">> News CONFIRMS signal <<\n";
         else if(lastNewsAlignment == "conflicting")
            commentText += "!! News CONFLICTS - Caution !!\n";
      }
   }
   
   // High impact alert
   if(StringLen(lastHighImpactAlert) > 0)
   {
      commentText += "------------------------------\n";
      commentText += "!! NEWS ALERT !!\n";
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
