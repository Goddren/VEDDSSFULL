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
input string  SYMBOLS_LIST      = "";                                // Pairs to monitor, comma-separated (blank = current chart only)

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
//  MULTI-TIMEFRAME AI ANALYSIS   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h5                    = "========== MULTI-TF AI ANALYSIS ==========";  // *** AI ANALYSIS TFs ***
input bool    ENABLE_MULTI_TIMEFRAME = true;                         // Enable Multi-TF AI Analysis
input bool    ANALYZE_M5             = false;                        // Analyze M5 (Scalping)
input bool    ANALYZE_M15            = true;                         // Analyze M15 (Short-term)
input bool    ANALYZE_H1             = true;                         // Analyze H1 (Intraday)
input bool    ANALYZE_H4             = true;                         // Analyze H4 (Swing)
input bool    ANALYZE_D1             = false;                        // Analyze D1 (Daily)
input bool    ANALYZE_W1             = false;                        // Analyze W1 (Weekly)

//====================================================================
//  EA SETTINGS / RISK   (ported from VEDD_ChartData_EA — reported to
//  the server via "eaSettings" in the chart-data payload)
//====================================================================
input string  _h6               = "========== EA SETTINGS / RISK ==========";  // *** EA SETTINGS ***
input int     MIN_CONFIDENCE    = 70;                                // Min AI Confidence % to Trade
input double  LOT_SIZE          = 0.01;                              // Fixed Lot Size
input bool    USE_RISK_PERCENT  = false;                             // Use Risk % Instead of Fixed Lot
input double  RISK_PERCENT      = 1.0;                               // Risk Per Trade (% of Balance)
input int     MAX_OPEN_TRADES   = 1;                                 // Max Positions Open at Once (account-wide, all symbols)
input int     TRADING_SESSION   = 0;                                 // Session: 0=Custom,1=London,2=NewYork,3=Tokyo,4=Sydney,5=LDN/NY,6=Auto(AI)

//====================================================================
//  TRAILING STOP   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h7                     = "========== TRAILING STOP ==========";  // *** TRAILING STOP ***
input bool    ENABLE_TRADE_MANAGEMENT = true;                        // Enable Trade Management
input bool    ENABLE_TRAILING_STOP    = true;                        // Enable Trailing Stop
input int     TRAIL_MODE              = 1;                           // Trail Mode (1=Fixed, 2=ATR, 3=BE+Trail)
input int     TRAIL_START_PIPS        = 20;                          // Start Trailing at X Pips Profit
input int     TRAIL_DISTANCE_PIPS     = 15;                          // Trailing Distance (pips)
input double  TRAIL_ATR_MULTIPLIER    = 1.5;                         // ATR Multiplier (Mode 2 Only)

//====================================================================
//  BREAKEVEN   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h8                 = "========== BREAKEVEN ==========";  // *** BREAKEVEN ***
input bool    MOVE_TO_BREAKEVEN   = true;                            // Move SL to Breakeven
input int     BREAKEVEN_PIPS      = 15;                              // Move at X Pips Profit
input int     BREAKEVEN_LOCK_PIPS = 2;                               // Lock in X Pips at Breakeven

//====================================================================
//  MOMENTUM & VOLUME EXIT   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h9                        = "========== MOMENTUM & VOLUME EXIT ==========";  // *** MOMENTUM & VOLUME ***
input bool    ENABLE_MOMENTUM_MANAGEMENT = true;                     // Manage Trades by Momentum
input bool    CLOSE_ON_MOMENTUM_REVERSAL = true;                     // Close if Momentum Reverses
input int     RSI_OVERBOUGHT             = 70;                       // RSI Overbought Level (Close Longs)
input int     RSI_OVERSOLD               = 30;                       // RSI Oversold Level (Close Shorts)
input bool    ENABLE_VOLUME_MANAGEMENT   = true;                     // Manage Trades by Volume
input bool    CLOSE_ON_LOW_VOLUME        = false;                    // Close if Volume Drops
input double  VOLUME_DROP_PERCENT        = 50.0;                     // Close if Volume < X% of Avg

//====================================================================
//  PYRAMIDING (Add to Winners)   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h10                   = "========== PYRAMIDING (Add to Winners) ==========";  // *** PYRAMIDING ***
input bool    ENABLE_PYRAMIDING      = false;                        // Enable Pyramiding
input int     PYRAMID_MAX_POSITIONS  = 3;                            // Max Positions to Stack
input int     PYRAMID_TRIGGER_PIPS   = 30;                           // Add Position Every X Pips Profit
input double  PYRAMID_LOT_MULTIPLIER = 1.0;                          // Lot Multiplier for Each Add
input bool    PYRAMID_MOVE_SL        = true;                         // Move All SL to New Entry
input int     PYRAMID_MIN_CONFIDENCE = 65;                           // Min AI Confidence to Add

//====================================================================
//  GRID TRADING (CAREFUL!)   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h11              = "========== GRID TRADING (CAREFUL!) ==========";  // *** GRID TRADING ***
input bool    ENABLE_GRID       = false;                             // Enable Grid Trading
input int     GRID_LEVELS       = 3;                                 // Number of Grid Levels
input int     GRID_SPACING_PIPS = 20;                                // Pips Between Grid Orders
input double  GRID_LOT_SIZE     = 0.01;                              // Lot Size Per Grid Order
input bool    GRID_HEDGE_MODE   = false;                             // Place Orders Both Directions
input int     GRID_TP_PIPS      = 15;                                // Take Profit Per Grid Order
input int     GRID_MAX_ORDERS   = 6;                                 // Max Total Grid Orders

//====================================================================
//  MARTINGALE (VERY RISKY!)   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h12                    = "========== MARTINGALE (VERY RISKY!) ==========";  // *** MARTINGALE ***
input bool    ENABLE_MARTINGALE       = false;                       // Enable Martingale
input double  MARTINGALE_MULTIPLIER   = 2.0;                         // Lot Multiplier After Loss
input int     MARTINGALE_MAX_LEVEL    = 3;                           // Max Martingale Levels
input bool    MARTINGALE_RESET_ON_WIN = true;                        // Reset to Base Lot After Win

//====================================================================
//  PROP FIRM COMPLIANCE   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h13                    = "========== PROP FIRM COMPLIANCE ==========";  // *** PROP FIRM ***
input bool    PROP_FIRM_MODE          = false;                       // Enable Prop Firm Mode
input double  PROP_DAILY_DD_LIMIT     = 5.0;                         // Daily Drawdown Limit (%)
input double  PROP_MAX_DD_LIMIT       = 10.0;                        // Max Total Drawdown Limit (%)
input double  PROP_DAILY_LOSS_LIMIT   = 4.0;                         // Daily Loss Limit (% of Balance)
input double  PROP_MAX_LOT_SIZE       = 0.5;                         // Max Lot Size Allowed
input int     PROP_MAX_OPEN_TRADES    = 3;                           // Max Simultaneous Positions (account-wide, all symbols)
input bool    PROP_REQUIRE_SL         = true;                        // Require Stop Loss on All Trades
input double  PROP_MIN_RR_RATIO       = 1.5;                         // Min Risk:Reward Ratio
input bool    PROP_NO_NEWS_TRADING    = true;                        // Block Trading During News
input bool    PROP_NO_WEEKEND_HOLDING = true;                        // Close All Before Weekend
input int     PROP_FRIDAY_CLOSE_HOUR  = 20;                          // Friday Close Hour (UTC)

//====================================================================
//  TRADE HISTORY LEARNING   (ported from VEDD_ChartData_EA)
//====================================================================
input string  _h14                   = "========== TRADE HISTORY LEARNING ==========";  // *** HISTORY LEARNING ***
input bool    ENABLE_LEARNING_FILTER = false;                        // Apply AI-Learned Filters
input int     DIRECTION_BIAS         = 0;                            // Direction Bias: 0=Both, 1=BUY Only, 2=SELL Only
input bool    AVOID_HOUR_0  = false; // Avoid Hour 00:00
input bool    AVOID_HOUR_1  = false; // Avoid Hour 01:00
input bool    AVOID_HOUR_2  = false; // Avoid Hour 02:00
input bool    AVOID_HOUR_3  = false; // Avoid Hour 03:00
input bool    AVOID_HOUR_4  = false; // Avoid Hour 04:00
input bool    AVOID_HOUR_5  = false; // Avoid Hour 05:00
input bool    AVOID_HOUR_6  = false; // Avoid Hour 06:00
input bool    AVOID_HOUR_7  = false; // Avoid Hour 07:00
input bool    AVOID_HOUR_8  = false; // Avoid Hour 08:00
input bool    AVOID_HOUR_9  = false; // Avoid Hour 09:00
input bool    AVOID_HOUR_10 = false; // Avoid Hour 10:00
input bool    AVOID_HOUR_11 = false; // Avoid Hour 11:00
input bool    AVOID_HOUR_12 = false; // Avoid Hour 12:00
input bool    AVOID_HOUR_13 = false; // Avoid Hour 13:00
input bool    AVOID_HOUR_14 = false; // Avoid Hour 14:00
input bool    AVOID_HOUR_15 = false; // Avoid Hour 15:00
input bool    AVOID_HOUR_16 = false; // Avoid Hour 16:00
input bool    AVOID_HOUR_17 = false; // Avoid Hour 17:00
input bool    AVOID_HOUR_18 = false; // Avoid Hour 18:00
input bool    AVOID_HOUR_19 = false; // Avoid Hour 19:00
input bool    AVOID_HOUR_20 = false; // Avoid Hour 20:00
input bool    AVOID_HOUR_21 = false; // Avoid Hour 21:00
input bool    AVOID_HOUR_22 = false; // Avoid Hour 22:00
input bool    AVOID_HOUR_23 = false; // Avoid Hour 23:00
input bool    AVOID_MONDAY    = false; // Avoid Monday
input bool    AVOID_TUESDAY   = false; // Avoid Tuesday
input bool    AVOID_WEDNESDAY = false; // Avoid Wednesday
input bool    AVOID_THURSDAY  = false; // Avoid Thursday
input bool    AVOID_FRIDAY    = false; // Avoid Friday
input int     MAX_TRADES_PER_DAY = 10;                               // Max Trades Per Day (0=Unlimited)

//====================================================================
//  NEWS FILTER   (ported from VEDD_ChartData_EA — the sentiment/impact
//  analysis itself runs server-side in server/news-service.ts; this EA
//  only consumes the mt5News*/mt5HighImpactAlert fields the server
//  already returns in the /api/mt5/chart-data POST response, the same
//  source VEDD_ChartData_EA's ParseAndDisplayAnalysis() used. See
//  ParseChartDataResponse() below, called from SendChartData().
//  NOTE: BLOCK_ON_MEDIUM_IMPACT, BLOCK_ON_LOW_IMPACT, MINUTES_BEFORE_NEWS,
//  MINUTES_AFTER_NEWS, CLOSE_TRADES_BEFORE_NEWS, and all BLOCK_ON_NFP /
//  FOMC / CPI / GDP / INTEREST_RATE / EMPLOYMENT event-type filters are
//  ported as inputs for settings parity, but — exactly as in the source
//  VEDD_ChartData_EA — they were never wired into any enforcement logic
//  there either (only referenced in OnInit Print/log statements), so
//  none of them gate trading here.
//====================================================================
input string  _h15                     = "========== NEWS FILTER ==========";  // *** NEWS FILTER ***
input bool    NEWS_AWARE_TRADING       = true;                       // Enable News-Aware Trading
input bool    BLOCK_ON_HIGH_IMPACT     = true;                       // Block on HIGH Impact News
input bool    BLOCK_ON_MEDIUM_IMPACT   = false;                      // Block on MEDIUM Impact News
input bool    BLOCK_ON_LOW_IMPACT      = false;                      // Block on LOW Impact News
input int     MINUTES_BEFORE_NEWS      = 30;                         // Stop Trading X Min BEFORE News
input int     MINUTES_AFTER_NEWS       = 15;                         // Resume Trading X Min AFTER News
input bool    CLOSE_TRADES_BEFORE_NEWS = false;                      // Close Open Trades Before News
input bool    BLOCK_ON_CONFLICTING_NEWS = true;                      // Block on Conflicting Sentiment
input bool    REQUIRE_ALIGNED_NEWS     = false;                      // Only Trade When News Aligns
input int     MIN_NEWS_SCORE           = 0;                          // Min News Score (0-100, 0=Any)
input int     MIN_ABSOLUTE_SCORE       = 0;                          // Min Absolute Score (0-100, trades on extremes +/-)
input bool    TRADE_ON_EXTREME_NEWS    = false;                      // Trade ONLY on Extreme News (+/- threshold)
input bool    BLOCK_ON_NFP             = true;                       // Block on Non-Farm Payrolls (NFP)
input bool    BLOCK_ON_FOMC            = true;                       // Block on FOMC/Fed Decisions
input bool    BLOCK_ON_CPI             = true;                       // Block on CPI/Inflation Data
input bool    BLOCK_ON_GDP             = false;                      // Block on GDP Releases
input bool    BLOCK_ON_INTEREST_RATE   = true;                       // Block on Interest Rate Decisions
input bool    BLOCK_ON_EMPLOYMENT      = false;                      // Block on Employment Data

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
//  Globals — Multi-symbol list & per-symbol indicator handles
//====================================================================
#define VEDD_MAX_SYM 20
int    g_symCount = 0;
string g_symList[VEDD_MAX_SYM];

int g_rsiH_a   [VEDD_MAX_SYM];
int g_macdH_a  [VEDD_MAX_SYM];
int g_bbH_a    [VEDD_MAX_SYM];
int g_atrH_a   [VEDD_MAX_SYM];
int g_ema20H_a [VEDD_MAX_SYM];
int g_ema50H_a [VEDD_MAX_SYM];
int g_ema200H_a[VEDD_MAX_SYM];

//====================================================================
//  Globals — Signal / Trade dedup
//====================================================================
struct ProcessedSignal { string id; datetime ts; };
ProcessedSignal g_processed[500];
int g_processedCount = 0;

ulong g_reportedTickets[200];
int   g_reportedCount = 0;

CTrade g_trade;

//====================================================================
//  Globals — Per-symbol AI signal/trade-plan state (parsed in
//  ParseChartDataResponse() from the /api/mt5/chart-data response for
//  that symbol). VEDD_ChartData_EA kept a single set of these
//  (lastSignal/lastConfidence/lastEntry/lastSL/lastTP/trailConfidence/
//  trailATRMultiplier) because it only ever ran on one symbol; this EA
//  is multi-symbol, so each is an array indexed the same as g_symList.
//====================================================================
string g_lastSignal[VEDD_MAX_SYM];
int    g_lastConfidence[VEDD_MAX_SYM];
double g_lastEntry[VEDD_MAX_SYM];
double g_lastSL[VEDD_MAX_SYM];
double g_lastTP[VEDD_MAX_SYM];
int    g_trailConfidence[VEDD_MAX_SYM];
double g_trailATRMultiplier[VEDD_MAX_SYM];

//====================================================================
//  Globals — News context (parsed from the chart-data response; the
//  sentiment/impact analysis itself runs server-side in
//  server/news-service.ts — see NEWS FILTER input section note above)
//====================================================================
string g_lastNewsSentiment   = "";
int    g_lastNewsScore       = 0;
string g_lastNewsAlignment   = "";
string g_lastNewsImpact      = "";
string g_lastHighImpactAlert = "";
bool   g_hasNewsData         = false;

//====================================================================
//  Globals — Prop Firm compliance state (account-wide, not per-symbol:
//  balance/equity/drawdown are account-level figures)
//====================================================================
double   g_propStartingBalance  = 0;
double   g_propDailyHighBalance = 0;
double   g_propMaxEquityReached = 0;
datetime g_propDailyResetTime   = 0;
bool     g_propTradingBlocked   = false;
string   g_propBlockReason      = "";
bool     g_propInitialized      = false;

//====================================================================
//  Globals — Trade History Learning filter state (account-wide: the
//  original's daily trade counter/reset counted trades EA-wide too)
//====================================================================
int      g_dailyTradeCount        = 0;
datetime g_learningDailyResetTime = 0;

//====================================================================
//  Globals — Pyramiding state (per symbol)
//====================================================================
int    g_pyramidPositionCount[VEDD_MAX_SYM];
double g_pyramidLastAddPrice[VEDD_MAX_SYM];

//====================================================================
//  Globals — Martingale state (per symbol — a loss on EURUSD shouldn't
//  double down the next GBPUSD trade)
//====================================================================
int  g_martingaleLevel[VEDD_MAX_SYM];
bool g_lastTradeWasLoss[VEDD_MAX_SYM];

//====================================================================
//  Globals — Grid state (per symbol)
//====================================================================
int g_activeGridOrders[VEDD_MAX_SYM];

//====================================================================
//  Globals — Trading session (resolved per-symbol in ResolveSession(),
//  most recent call's result — used only for the eaSettings JSON report)
//====================================================================
int    g_activeSessionStart = 0;
int    g_activeSessionEnd   = 0;
string g_activeSessionName  = "Custom";
int    g_serverRecommendedSession = -1;

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
//| Open positions / closed trades JSON (ported from VEDD_ChartData_EA
//| so this Combined EA feeds the same GoalTracker + Brain Dashboard
//| pipeline the old EA did — those are driven off closedTrades, and
//| the simpler chart-data payload this EA sent before had no way to
//| populate them at all).
//+------------------------------------------------------------------+
string BuildOpenPositionsJson()
{
   string json = "[";
   bool first = true;
   int total = PositionsTotal();

   for(int i = 0; i < total; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;

      string posSymbol = PositionGetString(POSITION_SYMBOL);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double volume    = PositionGetDouble(POSITION_VOLUME);
      double sl        = PositionGetDouble(POSITION_SL);
      double tp        = PositionGetDouble(POSITION_TP);
      double profit    = PositionGetDouble(POSITION_PROFIT);
      datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
      long magic       = PositionGetInteger(POSITION_MAGIC);
      string comment   = PositionGetString(POSITION_COMMENT);
      double currentPrice = (posType == POSITION_TYPE_BUY) ?
                            SymbolInfoDouble(posSymbol, SYMBOL_BID) :
                            SymbolInfoDouble(posSymbol, SYMBOL_ASK);

      if(!first) json += ",";
      first = false;

      json += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"direction\":\"%s\",\"volume\":%.2f,"
         "\"openPrice\":%.5f,\"currentPrice\":%.5f,\"sl\":%.5f,\"tp\":%.5f,"
         "\"profit\":%.2f,\"openTime\":%d,\"magic\":%d,\"comment\":\"%s\"}",
         ticket, JsonEscape(posSymbol),
         posType == POSITION_TYPE_BUY ? "BUY" : "SELL",
         SafeDouble(volume), SafeDouble(openPrice), SafeDouble(currentPrice),
         SafeDouble(sl), SafeDouble(tp), SafeDouble(profit),
         openTime, magic, JsonEscape(comment)
      );
   }

   json += "]";
   return json;
}

string BuildClosedTradesJson(int lookbackDays = 30)
{
   string json = "[";
   bool first = true;
   datetime startTime = TimeCurrent() - (lookbackDays * 86400);

   if(!HistorySelect(startTime, TimeCurrent()))
      return "[]";

   int totalDeals = HistoryDealsTotal();
   int tradeCount = 0;

   for(int i = totalDeals - 1; i >= 0 && tradeCount < 100; i--)
   {
      ulong dealTicket = HistoryDealGetTicket(i);
      if(dealTicket <= 0) continue;

      ENUM_DEAL_TYPE  dealType  = (ENUM_DEAL_TYPE)HistoryDealGetInteger(dealTicket, DEAL_TYPE);
      ENUM_DEAL_ENTRY dealEntry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(dealTicket, DEAL_ENTRY);

      // Only count closing deals (exits)
      if(dealEntry != DEAL_ENTRY_OUT && dealEntry != DEAL_ENTRY_INOUT) continue;
      if(dealType != DEAL_TYPE_BUY && dealType != DEAL_TYPE_SELL) continue;

      string   symbol     = HistoryDealGetString(dealTicket, DEAL_SYMBOL);
      double   profit     = HistoryDealGetDouble(dealTicket, DEAL_PROFIT);
      double   volume     = HistoryDealGetDouble(dealTicket, DEAL_VOLUME);
      double   price      = HistoryDealGetDouble(dealTicket, DEAL_PRICE);
      datetime dealTime   = (datetime)HistoryDealGetInteger(dealTicket, DEAL_TIME);
      long     magic      = HistoryDealGetInteger(dealTicket, DEAL_MAGIC);
      string   comment    = HistoryDealGetString(dealTicket, DEAL_COMMENT);
      double   commission = HistoryDealGetDouble(dealTicket, DEAL_COMMISSION);
      double   swap       = HistoryDealGetDouble(dealTicket, DEAL_SWAP);

      // Exit BUY = was closing a SELL position, Exit SELL = was closing a BUY position
      string direction = (dealType == DEAL_TYPE_SELL) ? "BUY" : "SELL";

      MqlDateTime dt;
      TimeToStruct(dealTime, dt);
      int closeHour = dt.hour;
      int closeDay  = dt.day_of_week; // 0=Sunday

      if(!first) json += ",";
      first = false;

      json += StringFormat(
         "{\"ticket\":%d,\"symbol\":\"%s\",\"direction\":\"%s\",\"volume\":%.2f,"
         "\"closePrice\":%.5f,\"profit\":%.2f,\"commission\":%.2f,\"swap\":%.2f,"
         "\"closeTime\":%d,\"closeHour\":%d,\"closeDay\":%d,\"magic\":%d,"
         "\"result\":\"%s\",\"comment\":\"%s\"}",
         dealTicket, JsonEscape(symbol), direction, SafeDouble(volume),
         SafeDouble(price), SafeDouble(profit), SafeDouble(commission), SafeDouble(swap),
         dealTime, closeHour, closeDay, magic,
         profit > 0 ? "WIN" : (profit < 0 ? "LOSS" : "BREAKEVEN"),
         JsonEscape(comment)
      );

      tradeCount++;
   }

   json += "]";
   return json;
}

//+------------------------------------------------------------------+
//| Utility: HTTP POST                                                |
//+------------------------------------------------------------------+
string HttpPost(string url, string jsonBody)
{
   int dummyCode;
   return HttpPostEx(url, jsonBody, dummyCode);
}

// Same as HttpPost, but also hands back the real HTTP status code — needed
// anywhere we actually want to know success vs failure (WebRequest returns a
// positive code for EVERY response it receives, including 401/403/404/500;
// only a true network-level failure returns <= 0). Checking "did we get any
// response text back" instead of the status code was masking auth/route
// errors as if they were successful sends.
string HttpPostEx(string url, string jsonBody, int &httpCode)
{
   char   postData[];
   char   result[];
   string headers = "Content-Type: application/json\r\nX-API-Key: " + API_KEY + "\r\n";
   StringToCharArray(jsonBody, postData);
   int sz = ArraySize(postData);
   if(sz > 0 && postData[sz-1] == 0) ArrayResize(postData, sz - 1);
   string resHeaders;
   httpCode = WebRequest("POST", url, headers, TIMEOUT_MS, postData, result, resHeaders);
   if(httpCode <= 0) return "";
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
//| Find index of a symbol within g_symList (-1 if not monitored)     |
//+------------------------------------------------------------------+
int FindSymIndex(string sym)
{
   for(int i = 0; i < g_symCount; i++)
      if(g_symList[i] == sym) return i;
   return -1;
}

//+------------------------------------------------------------------+
//| Pip value for a symbol (3/5-digit brokers use point*10)           |
//+------------------------------------------------------------------+
double PipValue(string sym)
{
   double point  = SymbolInfoDouble(sym, SYMBOL_POINT);
   int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
   return (digits == 3 || digits == 5) ? point * 10 : point;
}

//+------------------------------------------------------------------+
//| Build JSON object with extended account data (ported from         |
//| VEDD_ChartData_EA's BuildAccountJson) — account-wide, no symbol   |
//| dependency so no adaptation needed here.                          |
//+------------------------------------------------------------------+
string BuildAccountJson()
{
   double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity     = AccountInfoDouble(ACCOUNT_EQUITY);
   double margin     = AccountInfoDouble(ACCOUNT_MARGIN);
   double freeMargin = AccountInfoDouble(ACCOUNT_MARGIN_FREE);
   double profit     = AccountInfoDouble(ACCOUNT_PROFIT);
   double credit     = AccountInfoDouble(ACCOUNT_CREDIT);
   string currency   = JsonEscape(AccountInfoString(ACCOUNT_CURRENCY));
   long   accountNum = AccountInfoInteger(ACCOUNT_LOGIN);
   string accountNm  = JsonEscape(AccountInfoString(ACCOUNT_NAME));
   string server     = JsonEscape(AccountInfoString(ACCOUNT_SERVER));
   int    leverage   = (int)AccountInfoInteger(ACCOUNT_LEVERAGE);

   double marginLevel = 0;
   if(margin > 0) marginLevel = (equity / margin) * 100;

   static double dayStartBalance = 0;
   static datetime lastDayChecked = 0;

   MqlDateTime currentTime;
   TimeToStruct(TimeCurrent(), currentTime);
   datetime currentDayStart = StringToTime(StringFormat("%04d.%02d.%02d 00:00", currentTime.year, currentTime.mon, currentTime.day));

   if(currentDayStart != lastDayChecked)
   {
      dayStartBalance = balance - profit;
      lastDayChecked  = currentDayStart;
   }

   double dailyPnL = balance - dayStartBalance;
   double dailyPnLPercent = 0;
   if(dayStartBalance > 0) dailyPnLPercent = (dailyPnL / dayStartBalance) * 100;

   int openPositions = PositionsTotal();
   int openOrders    = OrdersTotal();

   double totalBuyLots = 0, totalSellLots = 0, unrealizedProfit = 0;
   int    buyPositions = 0, sellPositions = 0;

   for(int i = 0; i < openPositions; i++)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double posLots   = PositionGetDouble(POSITION_VOLUME);
      double posProfit = PositionGetDouble(POSITION_PROFIT);
      unrealizedProfit += posProfit;
      if(posType == POSITION_TYPE_BUY)  { buyPositions++;  totalBuyLots  += posLots; }
      else if(posType == POSITION_TYPE_SELL) { sellPositions++; totalSellLots += posLots; }
   }

   string json = StringFormat(
      "{\"balance\":%.2f,\"equity\":%.2f,\"margin\":%.2f,\"freeMargin\":%.2f,\"profit\":%.2f,\"credit\":%.2f,"
      "\"currency\":\"%s\",\"accountNumber\":%d,\"accountName\":\"%s\",\"server\":\"%s\",\"leverage\":%d,"
      "\"marginLevel\":%.2f,\"dailyPnL\":%.2f,\"dailyPnLPercent\":%.2f,"
      "\"openPositions\":%d,\"pendingOrders\":%d,\"buyPositions\":%d,\"sellPositions\":%d,"
      "\"totalBuyLots\":%.2f,\"totalSellLots\":%.2f,\"unrealizedProfit\":%.2f}",
      SafeDouble(balance), SafeDouble(equity), SafeDouble(margin), SafeDouble(freeMargin), SafeDouble(profit), SafeDouble(credit),
      currency, accountNum, accountNm, server, leverage,
      SafeDouble(marginLevel), SafeDouble(dailyPnL), SafeDouble(dailyPnLPercent),
      openPositions, openOrders, buyPositions, sellPositions,
      SafeDouble(totalBuyLots), SafeDouble(totalSellLots), SafeDouble(unrealizedProfit)
   );
   return json;
}

//+------------------------------------------------------------------+
//| Resolve trading session to start/end hours for a given symbol     |
//| (ported from VEDD_ChartData_EA's ResolveSession — ADAPTED to take  |
//| a symbol parameter instead of reading the global _Symbol, since   |
//| this EA sends chart data for many symbols, each of which may      |
//| resolve to a different Auto-mode session by currency).            |
//+------------------------------------------------------------------+
void ResolveSession(string sym)
{
   int session = TRADING_SESSION;

   if(session == 6 && g_serverRecommendedSession > 0 && g_serverRecommendedSession <= 5)
      session = g_serverRecommendedSession;

   switch(session)
   {
      case 1:
         g_activeSessionStart = 8;  g_activeSessionEnd = 17; g_activeSessionName = "London";
         break;
      case 2:
         g_activeSessionStart = 13; g_activeSessionEnd = 22; g_activeSessionName = "New York";
         break;
      case 3:
         g_activeSessionStart = 0;  g_activeSessionEnd = 9;  g_activeSessionName = "Tokyo";
         break;
      case 4:
         g_activeSessionStart = 22; g_activeSessionEnd = 7;  g_activeSessionName = "Sydney";
         break;
      case 5:
         g_activeSessionStart = 13; g_activeSessionEnd = 17; g_activeSessionName = "LDN/NY Overlap";
         break;
      case 6:
      {
         string s = sym;
         StringToUpper(s);
         if(StringFind(s, "JPY") >= 0)
         {
            g_activeSessionStart = 0; g_activeSessionEnd = 9; g_activeSessionName = "Tokyo (Auto)";
         }
         else if(StringFind(s, "AUD") >= 0 || StringFind(s, "NZD") >= 0)
         {
            g_activeSessionStart = 22; g_activeSessionEnd = 7; g_activeSessionName = "Sydney (Auto)";
         }
         else if(StringFind(s, "EUR") >= 0 || StringFind(s, "GBP") >= 0 || StringFind(s, "CHF") >= 0)
         {
            g_activeSessionStart = 8; g_activeSessionEnd = 17; g_activeSessionName = "London (Auto)";
         }
         else if(StringFind(s, "USD") >= 0 || StringFind(s, "CAD") >= 0)
         {
            g_activeSessionStart = 13; g_activeSessionEnd = 22; g_activeSessionName = "New York (Auto)";
         }
         else
         {
            g_activeSessionStart = 8; g_activeSessionEnd = 20; g_activeSessionName = "Default (Auto)";
         }
         break;
      }
      default:
         g_activeSessionStart = 8;  g_activeSessionEnd = 20; g_activeSessionName = "Custom";
         break;
   }
}

//+------------------------------------------------------------------+
//| Build data for a specific timeframe (ported from                  |
//| VEDD_ChartData_EA's BuildTimeframeData — ADAPTED to take a symbol |
//| parameter instead of _Symbol).                                    |
//+------------------------------------------------------------------+
string BuildTimeframeData(string sym, ENUM_TIMEFRAMES tf)
{
   int candleCount = 30;

   string candlesJson = "[";
   bool first = true;
   for(int i = 0; i < candleCount; i++)
   {
      datetime time = iTime(sym, tf, i);
      if(time == 0) continue;

      double open  = iOpen(sym, tf, i);
      double high  = iHigh(sym, tf, i);
      double low   = iLow(sym, tf, i);
      double close = iClose(sym, tf, i);
      long   volume = iVolume(sym, tf, i);

      if(open == 0 && high == 0 && low == 0 && close == 0) continue;

      if(!first) candlesJson += ",";
      first = false;

      candlesJson += StringFormat(
         "{\"t\":%d,\"o\":%.5f,\"h\":%.5f,\"l\":%.5f,\"c\":%.5f,\"v\":%d}",
         (long)time, SafeDouble(open), SafeDouble(high), SafeDouble(low), SafeDouble(close), volume
      );
   }
   candlesJson += "]";

   int rsiH = iRSI(sym, tf, 14, PRICE_CLOSE);
   double rsi = IndVal(rsiH, 0);
   if(rsiH != INVALID_HANDLE) IndicatorRelease(rsiH);

   int macdH = iMACD(sym, tf, 12, 26, 9, PRICE_CLOSE);
   double macdMain   = IndVal(macdH, 0);
   double macdSignal = IndVal(macdH, 1);
   if(macdH != INVALID_HANDLE) IndicatorRelease(macdH);

   int ema20H = iMA(sym, tf, 20, 0, MODE_EMA, PRICE_CLOSE);
   double ema20 = IndVal(ema20H, 0);
   if(ema20H != INVALID_HANDLE) IndicatorRelease(ema20H);

   int ema50H = iMA(sym, tf, 50, 0, MODE_EMA, PRICE_CLOSE);
   double ema50 = IndVal(ema50H, 0);
   if(ema50H != INVALID_HANDLE) IndicatorRelease(ema50H);

   int sma200H = iMA(sym, tf, 200, 0, MODE_SMA, PRICE_CLOSE);
   double sma200 = IndVal(sma200H, 0);
   if(sma200H != INVALID_HANDLE) IndicatorRelease(sma200H);

   double currentClose = iClose(sym, tf, 0);
   string trend = "NEUTRAL";
   if(currentClose > ema20 && ema20 > ema50) trend = "BULLISH";
   else if(currentClose < ema20 && ema20 < ema50) trend = "BEARISH";
   else if(currentClose > sma200) trend = "ABOVE_SMA200";
   else if(currentClose < sma200) trend = "BELOW_SMA200";

   string json = StringFormat(
      "{\"candles\":%s,\"indicators\":{\"rsi\":%.2f,\"macdMain\":%.5f,\"macdSignal\":%.5f,\"ema20\":%.5f,\"ema50\":%.5f,\"sma200\":%.5f},\"trend\":\"%s\",\"close\":%.5f}",
      candlesJson,
      SafeDouble(rsi),
      SafeDouble(macdMain), SafeDouble(macdSignal),
      SafeDouble(ema20), SafeDouble(ema50), SafeDouble(sma200),
      trend,
      SafeDouble(currentClose)
   );
   return json;
}

//+------------------------------------------------------------------+
//| Build multi-timeframe analysis data for a symbol (ported from     |
//| VEDD_ChartData_EA's BuildMultiTimeframeJson — ADAPTED to take a    |
//| symbol parameter, see BuildTimeframeData above).                  |
//+------------------------------------------------------------------+
string BuildMultiTimeframeJson(string sym)
{
   string json = "{";
   bool first = true;

   if(ANALYZE_M5)  { if(!first) json += ","; json += "\"M5\":"  + BuildTimeframeData(sym, PERIOD_M5);  first = false; }
   if(ANALYZE_M15) { if(!first) json += ","; json += "\"M15\":" + BuildTimeframeData(sym, PERIOD_M15); first = false; }
   if(ANALYZE_H1)  { if(!first) json += ","; json += "\"H1\":"  + BuildTimeframeData(sym, PERIOD_H1);  first = false; }
   if(ANALYZE_H4)  { if(!first) json += ","; json += "\"H4\":"  + BuildTimeframeData(sym, PERIOD_H4);  first = false; }
   if(ANALYZE_D1)  { if(!first) json += ","; json += "\"D1\":"  + BuildTimeframeData(sym, PERIOD_D1);  first = false; }
   if(ANALYZE_W1)  { if(!first) json += ","; json += "\"W1\":"  + BuildTimeframeData(sym, PERIOD_W1);  first = false; }

   json += "}";
   return json;
}

//+------------------------------------------------------------------+
//| Parse the /api/mt5/chart-data response for AI signal/trade-plan   |
//| and news fields (ported from VEDD_ChartData_EA's                  |
//| ParseAndDisplayAnalysis — ADAPTED: only the field-extraction half  |
//| is ported (this EA doesn't locally decide trades off chart data,  |
//! it executes signals polled separately via PollAndExecuteSignals), |
//| and results are stored per-symbol via symIdx instead of in single |
//| globals, since this EA is multi-symbol.                           |
//+------------------------------------------------------------------+
void ParseChartDataResponse(int symIdx, string resp)
{
   if(StringLen(resp) == 0 || symIdx < 0) return;
   int endPos = StringLen(resp);

   g_lastSignal[symIdx] = ExtractString(resp, "mt5Signal", 0, endPos);
   string confStr = ExtractNumber(resp, "mt5Confidence", 0, endPos);
   g_lastConfidence[symIdx] = (int)StringToInteger(confStr);

   string entryStr = ExtractNumber(resp, "mt5Entry", 0, endPos);
   string slStr    = ExtractNumber(resp, "mt5StopLoss", 0, endPos);
   string tpStr    = ExtractNumber(resp, "mt5TakeProfit", 0, endPos);
   g_lastEntry[symIdx] = StringToDouble(entryStr);
   g_lastSL[symIdx]    = StringToDouble(slStr);
   g_lastTP[symIdx]    = StringToDouble(tpStr);

   string trailConfStr = ExtractNumber(resp, "mt5TrailConfidence", 0, endPos);
   g_trailConfidence[symIdx] = (StringLen(trailConfStr) > 0) ? (int)StringToInteger(trailConfStr) : 0;
   string trailAtrStr = ExtractNumber(resp, "mt5TrailATRMultiplier", 0, endPos);
   g_trailATRMultiplier[symIdx] = (StringLen(trailAtrStr) > 0) ? StringToDouble(trailAtrStr) : 1.5;

   string recSessionStr = ExtractNumber(resp, "mt5RecommendedSession", 0, endPos);
   if(StringLen(recSessionStr) > 0)
   {
      int recSession = (int)StringToInteger(recSessionStr);
      if(recSession > 0 && recSession <= 5) g_serverRecommendedSession = recSession;
   }

   // News context: account/market-wide, not per-symbol — mirrors the source
   // EA, which also kept a single set of news globals (news sentiment isn't
   // computed per-symbol server-side either). Last symbol processed in the
   // OnTimer loop wins, same "last write" semantics the single-chart EA had
   // implicitly (it only ever had one symbol to begin with).
   g_lastNewsSentiment   = ExtractString(resp, "mt5NewsSentiment", 0, endPos);
   g_lastNewsAlignment   = ExtractString(resp, "mt5NewsAlignment", 0, endPos);
   g_lastNewsImpact      = ExtractString(resp, "mt5NewsImpact", 0, endPos);
   g_lastHighImpactAlert = ExtractString(resp, "mt5HighImpactAlert", 0, endPos);
   string newsScoreStr   = ExtractNumber(resp, "mt5NewsScore", 0, endPos);
   if(StringLen(newsScoreStr) > 0 && StringLen(g_lastNewsSentiment) > 0)
   {
      g_lastNewsScore = (int)StringToInteger(newsScoreStr);
      g_hasNewsData   = true;
   }
   else
   {
      g_hasNewsData = false;
   }
}

//+------------------------------------------------------------------+
//| Count all open positions carrying this EA's magic number, across  |
//| every monitored symbol (ADAPTATION: VEDD_ChartData_EA's           |
//| CountOpenTrades() filtered by magic AND _Symbol since it only     |
//| ever ran on one chart/symbol. This EA is multi-symbol and         |
//| MAX_OPEN_TRADES / PROP_MAX_OPEN_TRADES are account-wide risk caps, |
//| so the count must span all symbols, not just one.)                |
//+------------------------------------------------------------------+
int CountAllOpenTradesByMagic()
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER) count++;
   }
   return count;
}

//+------------------------------------------------------------------+
//| Check Prop Firm compliance — returns true if trading allowed      |
//| (ported from VEDD_ChartData_EA's CheckPropFirmCompliance —         |
//| ADAPTED: uses CountAllOpenTradesByMagic() instead of a             |
//| single-symbol CountOpenTrades(), see note above).                  |
//+------------------------------------------------------------------+
bool CheckPropFirmCompliance()
{
   if(!PROP_FIRM_MODE) return true;

   double balance = AccountInfoDouble(ACCOUNT_BALANCE);
   double equity  = AccountInfoDouble(ACCOUNT_EQUITY);

   if(!g_propInitialized)
   {
      g_propStartingBalance  = balance;
      g_propDailyHighBalance = balance;
      g_propMaxEquityReached = balance;
      g_propDailyResetTime   = TimeCurrent();
      g_propInitialized      = true;
   }

   MqlDateTime dt, resetDt;
   TimeToStruct(TimeCurrent(), dt);
   TimeToStruct(g_propDailyResetTime, resetDt);

   if(dt.day_of_year != resetDt.day_of_year)
   {
      g_propDailyHighBalance = balance;
      g_propDailyResetTime   = TimeCurrent();
      g_propTradingBlocked   = false;
      g_propBlockReason      = "";
      Print("[PROP FIRM] New day - Daily limits reset. High balance: ", DoubleToString(g_propDailyHighBalance, 2));
   }

   if(equity > g_propMaxEquityReached) g_propMaxEquityReached = equity;
   if(balance > g_propDailyHighBalance) g_propDailyHighBalance = balance;

   double dailyDD = ((g_propDailyHighBalance - equity) / g_propDailyHighBalance) * 100.0;
   if(dailyDD >= PROP_DAILY_DD_LIMIT)
   {
      g_propTradingBlocked = true;
      g_propBlockReason = StringFormat("Daily DD %.2f%% >= %.1f%% limit", dailyDD, PROP_DAILY_DD_LIMIT);
      Print("[PROP FIRM] BLOCKED: ", g_propBlockReason);
      return false;
   }

   double maxDD = ((g_propStartingBalance - equity) / g_propStartingBalance) * 100.0;
   if(maxDD >= PROP_MAX_DD_LIMIT)
   {
      g_propTradingBlocked = true;
      g_propBlockReason = StringFormat("Max DD %.2f%% >= %.1f%% limit", maxDD, PROP_MAX_DD_LIMIT);
      Print("[PROP FIRM] BLOCKED: ", g_propBlockReason);
      return false;
   }

   double dailyLoss = ((g_propDailyHighBalance - balance) / g_propDailyHighBalance) * 100.0;
   if(dailyLoss >= PROP_DAILY_LOSS_LIMIT)
   {
      g_propTradingBlocked = true;
      g_propBlockReason = StringFormat("Daily Loss %.2f%% >= %.1f%% limit", dailyLoss, PROP_DAILY_LOSS_LIMIT);
      Print("[PROP FIRM] BLOCKED: ", g_propBlockReason);
      return false;
   }

   int openTrades = CountAllOpenTradesByMagic();
   if(openTrades >= PROP_MAX_OPEN_TRADES)
   {
      g_propBlockReason = StringFormat("Max trades %d reached", PROP_MAX_OPEN_TRADES);
      return false;
   }

   if(PROP_NO_WEEKEND_HOLDING && dt.day_of_week == 5 && dt.hour >= PROP_FRIDAY_CLOSE_HOUR)
   {
      g_propBlockReason = "Friday close time - no new trades before weekend";
      return false;
   }

   g_propTradingBlocked = false;
   g_propBlockReason = "";
   return true;
}

//+------------------------------------------------------------------+
//| Close all EA positions before the weekend (ported from            |
//| VEDD_ChartData_EA's PropFirmWeekendClose — this one already       |
//| filtered only by magic number, not by _Symbol, so it was already  |
//| multi-symbol-safe and needed no adaptation beyond using g_trade).  |
//+------------------------------------------------------------------+
void PropFirmWeekendClose()
{
   if(!PROP_FIRM_MODE || !PROP_NO_WEEKEND_HOLDING) return;

   MqlDateTime dt;
   TimeCurrent(dt);

   if(dt.day_of_week == 5 && dt.hour >= PROP_FRIDAY_CLOSE_HOUR)
   {
      int total = PositionsTotal();
      for(int i = total - 1; i >= 0; i--)
      {
         ulong ticket = PositionGetTicket(i);
         if(PositionSelectByTicket(ticket))
         {
            if(PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER)
            {
               Print("[PROP FIRM] Closing position before weekend: ", PositionGetString(POSITION_SYMBOL));
               g_trade.PositionClose(ticket);
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Check trade Risk:Reward ratio (ported from VEDD_ChartData_EA's    |
//| CheckMinRiskReward — ADAPTED to take entry/sl/tp as parameters     |
//| instead of reading globals, since each AI signal here already     |
//| carries its own levels).                                          |
//+------------------------------------------------------------------+
bool CheckMinRiskReward(double entry, double sl, double tp)
{
   if(!PROP_FIRM_MODE || PROP_MIN_RR_RATIO <= 0) return true;
   if(entry <= 0 || sl <= 0 || tp <= 0) return true;

   double risk   = MathAbs(entry - sl);
   double reward = MathAbs(tp - entry);
   if(risk <= 0) return true;

   double rr = reward / risk;
   if(rr < PROP_MIN_RR_RATIO)
   {
      Print("[PROP FIRM] R:R ratio ", DoubleToString(rr, 2), " < min ", DoubleToString(PROP_MIN_RR_RATIO, 2));
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| Check Trade History Learning filters (ported from                 |
//| VEDD_ChartData_EA's CheckLearningFilters — ADAPTED to take the     |
//| signal's direction as a parameter instead of reading a global      |
//| lastSignal; hour/day/count logic is otherwise account-wide and     |
//| symbol-agnostic exactly as in the source EA).                     |
//+------------------------------------------------------------------+
bool CheckLearningFilters(string direction, string &blockReason)
{
   if(!ENABLE_LEARNING_FILTER) return true;

   MqlDateTime dt;
   TimeToStruct(TimeCurrent(), dt);

   MqlDateTime resetDt;
   TimeToStruct(g_learningDailyResetTime, resetDt);
   if(dt.day_of_year != resetDt.day_of_year)
   {
      g_dailyTradeCount = 0;
      g_learningDailyResetTime = TimeCurrent();
      Print("[LEARNING] New day - Daily trade count reset");
   }

   if(DIRECTION_BIAS == 1 && direction == "SELL")
   {
      blockReason = "Learning Filter: BUY Only mode - SELL signal blocked";
      return false;
   }
   if(DIRECTION_BIAS == 2 && direction == "BUY")
   {
      blockReason = "Learning Filter: SELL Only mode - BUY signal blocked";
      return false;
   }

   if(MAX_TRADES_PER_DAY > 0 && g_dailyTradeCount >= MAX_TRADES_PER_DAY)
   {
      blockReason = "Learning Filter: Max trades per day (" + IntegerToString(MAX_TRADES_PER_DAY) + ") reached";
      return false;
   }

   int hour = dt.hour;
   bool hourBlocked = false;
   switch(hour)
   {
      case 0: hourBlocked = AVOID_HOUR_0; break;   case 1: hourBlocked = AVOID_HOUR_1; break;
      case 2: hourBlocked = AVOID_HOUR_2; break;   case 3: hourBlocked = AVOID_HOUR_3; break;
      case 4: hourBlocked = AVOID_HOUR_4; break;   case 5: hourBlocked = AVOID_HOUR_5; break;
      case 6: hourBlocked = AVOID_HOUR_6; break;   case 7: hourBlocked = AVOID_HOUR_7; break;
      case 8: hourBlocked = AVOID_HOUR_8; break;   case 9: hourBlocked = AVOID_HOUR_9; break;
      case 10: hourBlocked = AVOID_HOUR_10; break; case 11: hourBlocked = AVOID_HOUR_11; break;
      case 12: hourBlocked = AVOID_HOUR_12; break; case 13: hourBlocked = AVOID_HOUR_13; break;
      case 14: hourBlocked = AVOID_HOUR_14; break; case 15: hourBlocked = AVOID_HOUR_15; break;
      case 16: hourBlocked = AVOID_HOUR_16; break; case 17: hourBlocked = AVOID_HOUR_17; break;
      case 18: hourBlocked = AVOID_HOUR_18; break; case 19: hourBlocked = AVOID_HOUR_19; break;
      case 20: hourBlocked = AVOID_HOUR_20; break; case 21: hourBlocked = AVOID_HOUR_21; break;
      case 22: hourBlocked = AVOID_HOUR_22; break; case 23: hourBlocked = AVOID_HOUR_23; break;
   }
   if(hourBlocked)
   {
      blockReason = "Learning Filter: Hour " + IntegerToString(hour) + ":00 is in avoid list";
      return false;
   }

   int dayOfWeek = dt.day_of_week;
   bool dayBlocked = false;
   switch(dayOfWeek)
   {
      case 1: dayBlocked = AVOID_MONDAY; break;
      case 2: dayBlocked = AVOID_TUESDAY; break;
      case 3: dayBlocked = AVOID_WEDNESDAY; break;
      case 4: dayBlocked = AVOID_THURSDAY; break;
      case 5: dayBlocked = AVOID_FRIDAY; break;
   }
   if(dayBlocked)
   {
      string dayNames[] = {"Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"};
      blockReason = "Learning Filter: " + dayNames[dayOfWeek] + " is in avoid list";
      return false;
   }

   return true;
}

//+------------------------------------------------------------------+
//| Increment daily trade count (ported from VEDD_ChartData_EA)       |
//+------------------------------------------------------------------+
void IncrementDailyTradeCount()
{
   if(ENABLE_LEARNING_FILTER)
   {
      g_dailyTradeCount++;
      Print("[LEARNING] Trade count: ", g_dailyTradeCount, "/", MAX_TRADES_PER_DAY);
   }
}

//+------------------------------------------------------------------+
//| Check if news conditions allow trading (ported from                |
//| VEDD_ChartData_EA's ShouldAutoTradeWithNews — ADAPTED to take the  |
//| signal direction as a parameter instead of a global lastSignal;    |
//| reads g_lastNewsSentiment/g_hasNewsData/etc, which are populated   |
//| by ParseChartDataResponse() from the same server-computed fields   |
//| the source EA used. See NEWS FILTER input section note for what   |
//| is genuinely local vs. server-computed.)                          |
//+------------------------------------------------------------------+
bool ShouldAutoTradeWithNews(string direction, string &reason)
{
   if(PROP_FIRM_MODE && PROP_NO_NEWS_TRADING && g_hasNewsData)
   {
      if(StringLen(g_lastHighImpactAlert) > 0 || g_lastNewsImpact == "HIGH" || g_lastNewsImpact == "MEDIUM")
      {
         reason = "Prop Firm Mode - No trading during news events";
         return false;
      }
   }

   if(!NEWS_AWARE_TRADING) return true;

   if(BLOCK_ON_HIGH_IMPACT && StringLen(g_lastHighImpactAlert) > 0)
   {
      reason = "High-impact news event imminent";
      return false;
   }

   if(g_hasNewsData)
   {
      if(BLOCK_ON_CONFLICTING_NEWS && g_lastNewsAlignment == "conflicting")
      {
         reason = "News CONFLICTS with " + direction + " signal";
         return false;
      }

      if(REQUIRE_ALIGNED_NEWS && g_lastNewsAlignment != "aligned")
      {
         reason = "News not aligned (need bullish/bearish confirmation)";
         return false;
      }

      if(MIN_NEWS_SCORE > 0 && g_lastNewsScore < MIN_NEWS_SCORE)
      {
         reason = "News score " + IntegerToString(g_lastNewsScore) + " below minimum " + IntegerToString(MIN_NEWS_SCORE);
         return false;
      }

      if(MIN_ABSOLUTE_SCORE > 0)
      {
         int absScore = MathAbs(g_lastNewsScore);
         if(absScore < MIN_ABSOLUTE_SCORE)
         {
            reason = "News score " + IntegerToString(g_lastNewsScore) + " not extreme enough (need +/-" + IntegerToString(MIN_ABSOLUTE_SCORE) + ")";
            return false;
         }
      }

      if(TRADE_ON_EXTREME_NEWS)
      {
         int threshold = (MIN_ABSOLUTE_SCORE > 0) ? MIN_ABSOLUTE_SCORE : 50;
         int absScore = MathAbs(g_lastNewsScore);
         if(absScore < threshold)
         {
            reason = "Waiting for extreme news (current: " + IntegerToString(g_lastNewsScore) + ", need +/-" + IntegerToString(threshold) + ")";
            return false;
         }
      }
   }
   else if(REQUIRE_ALIGNED_NEWS)
   {
      reason = "No news data available (required for aligned trading)";
      return false;
   }

   return true;
}

//+------------------------------------------------------------------+
//| Combined pre-trade risk/compliance filter gate for an AI-provided  |
//| OPEN signal — mirrors how VEDD_ChartData_EA's ProcessAutoTrade()   |
//| gated its own local entry logic (Prop Firm / R:R / SL-required /   |
//| Learning Filter / News Filter checks, in the same order).          |
//+------------------------------------------------------------------+
bool PassesPreTradeFilters(string direction, double entry, double sl, double tp, string &reason)
{
   if(!CheckPropFirmCompliance())
   {
      reason = "Prop Firm: " + g_propBlockReason;
      return false;
   }
   if(PROP_FIRM_MODE && PROP_REQUIRE_SL && sl <= 0)
   {
      reason = "Prop Firm: Stop Loss required but not set";
      return false;
   }
   if(!CheckMinRiskReward(entry, sl, tp))
   {
      reason = "Prop Firm: R:R ratio below minimum " + DoubleToString(PROP_MIN_RR_RATIO, 2);
      return false;
   }
   string learningReason = "";
   if(!CheckLearningFilters(direction, learningReason))
   {
      reason = learningReason;
      return false;
   }
   string newsReason = "";
   if(!ShouldAutoTradeWithNews(direction, newsReason))
   {
      reason = newsReason;
      return false;
   }
   return true;
}

//+------------------------------------------------------------------+
//| MARTINGALE — lot size after applying the multiplier (ported from  |
//| VEDD_ChartData_EA's GetMartingaleLotSize — ADAPTED: state is       |
//| tracked per symbol via symIdx/g_martingaleLevel[] instead of a     |
//| single global level, so a loss on one pair doesn't double the lot |
//| on an unrelated pair).                                             |
//+------------------------------------------------------------------+
double GetMartingaleLotSize(string sym, int symIdx, double baseLot)
{
   if(!ENABLE_MARTINGALE || symIdx < 0) return baseLot;

   if(HistorySelect(TimeCurrent() - 86400, TimeCurrent()))
   {
      int totalDeals = HistoryDealsTotal();
      for(int i = totalDeals - 1; i >= 0; i--)
      {
         ulong ticket = HistoryDealGetTicket(i);
         if(ticket <= 0) continue;
         if(HistoryDealGetInteger(ticket, DEAL_MAGIC) != MAGIC_NUMBER) continue;
         if(HistoryDealGetString(ticket, DEAL_SYMBOL) != sym) continue;

         ENUM_DEAL_ENTRY entry = (ENUM_DEAL_ENTRY)HistoryDealGetInteger(ticket, DEAL_ENTRY);
         if(entry == DEAL_ENTRY_OUT)
         {
            double profit = HistoryDealGetDouble(ticket, DEAL_PROFIT);
            if(profit < 0)
            {
               g_lastTradeWasLoss[symIdx] = true;
               if(g_martingaleLevel[symIdx] < MARTINGALE_MAX_LEVEL) g_martingaleLevel[symIdx]++;
            }
            else if(profit > 0 && MARTINGALE_RESET_ON_WIN)
            {
               g_martingaleLevel[symIdx] = 0;
               g_lastTradeWasLoss[symIdx] = false;
            }
            break;
         }
      }
   }

   double martingaleLot = baseLot * MathPow(MARTINGALE_MULTIPLIER, g_martingaleLevel[symIdx]);
   if(g_martingaleLevel[symIdx] > 0)
      Print("[MARTINGALE] ", sym, " level ", g_martingaleLevel[symIdx], " - lot: ", DoubleToString(martingaleLot, 2));
   return martingaleLot;
}

//+------------------------------------------------------------------+
//| Calculate a pyramid-add lot size (ported from                     |
//| VEDD_ChartData_EA's CalculateLotSize — ADAPTED to take a symbol +  |
//| symIdx so risk-% sizing uses that symbol's own last known AI      |
//| entry/SL (g_lastEntry/g_lastSL) instead of single globals).        |
//+------------------------------------------------------------------+
double CalculateLotSize(string sym, int symIdx)
{
   double lots  = LOT_SIZE;
   double entry = (symIdx >= 0) ? g_lastEntry[symIdx] : 0;
   double sl    = (symIdx >= 0) ? g_lastSL[symIdx]    : 0;

   if(USE_RISK_PERCENT && sl > 0 && entry > 0)
   {
      double balance    = AccountInfoDouble(ACCOUNT_BALANCE);
      double riskAmount = balance * (RISK_PERCENT / 100.0);
      double slDistance = MathAbs(entry - sl);
      double tickValue  = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_VALUE);
      double tickSize   = SymbolInfoDouble(sym, SYMBOL_TRADE_TICK_SIZE);

      if(slDistance > 0 && tickValue > 0 && tickSize > 0)
      {
         double slTicks = slDistance / tickSize;
         lots = riskAmount / (slTicks * tickValue);
      }
   }

   if(ENABLE_MARTINGALE) lots = GetMartingaleLotSize(sym, symIdx, lots);

   if(PROP_FIRM_MODE && lots > PROP_MAX_LOT_SIZE)
      lots = PROP_MAX_LOT_SIZE;

   double minLot  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MIN);
   double maxLot  = SymbolInfoDouble(sym, SYMBOL_VOLUME_MAX);
   double lotStep = SymbolInfoDouble(sym, SYMBOL_VOLUME_STEP);

   lots = MathMax(minLot, MathMin(maxLot, lots));
   lots = MathFloor(lots / lotStep) * lotStep;

   return NormalizeDouble(lots, 2);
}

//+------------------------------------------------------------------+
//| Move all pyramid position stops to the newest entry level         |
//| (ported from VEDD_ChartData_EA's MovePyramidStops — ADAPTED to    |
//| filter by an explicit symbol parameter instead of _Symbol).       |
//+------------------------------------------------------------------+
void MovePyramidStops(string sym, ENUM_POSITION_TYPE direction, double newSLLevel)
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MAGIC_NUMBER) continue;
      if(PositionGetString(POSITION_SYMBOL) != sym) continue;

      double currentTP = PositionGetDouble(POSITION_TP);
      g_trade.PositionModify(ticket, newSLLevel, currentTP);
   }
   Print("[PYRAMID] ", sym, ": all stops moved to ", newSLLevel);
}

//+------------------------------------------------------------------+
//| PYRAMIDING — check for opportunity to add to a winning position   |
//| for one monitored symbol (ported from VEDD_ChartData_EA's         |
//| CheckPyramidOpportunity — ADAPTED to operate on one symbol out of  |
//| g_symList at a time, filtering positions/history by that symbol   |
//| and reading that symbol's own g_lastSignal/g_lastConfidence/       |
//| g_lastEntry/g_lastSL/g_lastTP instead of single globals).          |
//+------------------------------------------------------------------+
void CheckPyramidOpportunity(int symIdx)
{
   if(!ENABLE_PYRAMIDING) return;
   string sym = g_symList[symIdx];
   double pipValue = PipValue(sym);

   int posCount = 0;
   double bestProfitPips = 0;
   ENUM_POSITION_TYPE currentDirection = POSITION_TYPE_BUY;

   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MAGIC_NUMBER) continue;
      if(PositionGetString(POSITION_SYMBOL) != sym) continue;

      posCount++;
      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      currentDirection = posType;

      double currentBid = SymbolInfoDouble(sym, SYMBOL_BID);
      double currentAsk = SymbolInfoDouble(sym, SYMBOL_ASK);
      double profitPips = 0;
      if(posType == POSITION_TYPE_BUY) profitPips = (currentBid - openPrice) / pipValue;
      else                              profitPips = (openPrice - currentAsk) / pipValue;

      if(profitPips > bestProfitPips) bestProfitPips = profitPips;
   }

   g_pyramidPositionCount[symIdx] = posCount;

   if(posCount == 0 || posCount >= PYRAMID_MAX_POSITIONS) return;
   if(g_lastConfidence[symIdx] < PYRAMID_MIN_CONFIDENCE) return;
   if(bestProfitPips < PYRAMID_TRIGGER_PIPS * posCount) return;

   if((currentDirection == POSITION_TYPE_BUY  && g_lastSignal[symIdx] != "BUY") ||
      (currentDirection == POSITION_TYPE_SELL && g_lastSignal[symIdx] != "SELL"))
      return;

   string learningReason = "";
   if(!CheckLearningFilters(g_lastSignal[symIdx], learningReason))
   {
      Print("[PYRAMID] ", sym, ": ", learningReason);
      return;
   }

   double baseLot = CalculateLotSize(sym, symIdx);
   double pyramidLot = NormalizeDouble(baseLot * MathPow(PYRAMID_LOT_MULTIPLIER, posCount), 2);

   Print("[PYRAMID] ", sym, ": adding position #", posCount + 1, " — profit ", DoubleToString(bestProfitPips, 1), " pips, lot ", pyramidLot);

   double sl = g_lastSL[symIdx] > 0 ? g_lastSL[symIdx] : 0;
   double tp = g_lastTP[symIdx] > 0 ? g_lastTP[symIdx] : 0;
   string comment = "VEDD Pyramid #" + IntegerToString(posCount + 1);

   bool result = false;
   double addPrice = 0;
   if(currentDirection == POSITION_TYPE_BUY)
   {
      addPrice = SymbolInfoDouble(sym, SYMBOL_ASK);
      result = g_trade.Buy(pyramidLot, sym, addPrice, sl, tp, comment);
   }
   else
   {
      addPrice = SymbolInfoDouble(sym, SYMBOL_BID);
      result = g_trade.Sell(pyramidLot, sym, addPrice, sl, tp, comment);
   }

   if(result)
   {
      Print("[PYRAMID] ", sym, ": stack #", posCount + 1, " opened");
      g_pyramidLastAddPrice[symIdx] = addPrice;
      IncrementDailyTradeCount();
      if(PYRAMID_MOVE_SL) MovePyramidStops(sym, currentDirection, addPrice);
   }
}

//+------------------------------------------------------------------+
//| GRID TRADING — manage grid orders for one monitored symbol        |
//| (ported from VEDD_ChartData_EA's ManageGridOrders — ADAPTED to    |
//| operate on one symbol out of g_symList at a time instead of       |
//| _Symbol, and to use per-symbol g_activeGridOrders[]/              |
//| g_lastSignal[] state).                                             |
//+------------------------------------------------------------------+
void ManageGridOrders(int symIdx)
{
   if(!ENABLE_GRID) return;
   string sym = g_symList[symIdx];

   string learningReason = "";
   if(!CheckLearningFilters(g_lastSignal[symIdx], learningReason)) return;

   double pipValue   = PipValue(sym);
   double currentBid = SymbolInfoDouble(sym, SYMBOL_BID);
   double currentAsk = SymbolInfoDouble(sym, SYMBOL_ASK);
   int    digits     = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);

   g_activeGridOrders[symIdx] = 0;
   for(int i = OrdersTotal() - 1; i >= 0; i--)
   {
      ulong ticket = OrderGetTicket(i);
      if(ticket > 0 && OrderSelect(ticket))
      {
         if(OrderGetInteger(ORDER_MAGIC) == MAGIC_NUMBER + 100 && OrderGetString(ORDER_SYMBOL) == sym)
            g_activeGridOrders[symIdx]++;
      }
   }
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) == MAGIC_NUMBER + 100 && PositionGetString(POSITION_SYMBOL) == sym)
         g_activeGridOrders[symIdx]++;
   }

   if(g_activeGridOrders[symIdx] >= GRID_MAX_ORDERS) return;
   if(g_lastSignal[symIdx] != "BUY" && g_lastSignal[symIdx] != "SELL") return;

   double spacing = GRID_SPACING_PIPS * pipValue;
   double tp      = GRID_TP_PIPS * pipValue;
   datetime expiry = TimeCurrent() + 86400;

   MqlTradeRequest request = {};
   MqlTradeResult  result  = {};

   for(int level = 1; level <= GRID_LEVELS && g_activeGridOrders[symIdx] < GRID_MAX_ORDERS; level++)
   {
      if(g_lastSignal[symIdx] == "BUY" || GRID_HEDGE_MODE)
      {
         double buyPrice = NormalizeDouble(currentAsk - (spacing * level), digits);
         double buyTP    = NormalizeDouble(buyPrice + tp, digits);

         request.action      = TRADE_ACTION_PENDING;
         request.symbol      = sym;
         request.volume      = GRID_LOT_SIZE;
         request.type        = ORDER_TYPE_BUY_LIMIT;
         request.price       = buyPrice;
         request.sl          = 0;
         request.tp          = buyTP;
         request.deviation   = SLIPPAGE_POINTS;
         request.magic       = MAGIC_NUMBER + 100;
         request.comment     = "VEDD Grid BUY L" + IntegerToString(level);
         request.type_time   = ORDER_TIME_SPECIFIED;
         request.expiration  = expiry;

         if(OrderSend(request, result) && result.retcode == TRADE_RETCODE_DONE)
         {
            Print("[GRID] ", sym, ": BUY level ", level, " set @ ", buyPrice);
            g_activeGridOrders[symIdx]++;
         }
      }

      if(g_lastSignal[symIdx] == "SELL" || GRID_HEDGE_MODE)
      {
         double sellPrice = NormalizeDouble(currentBid + (spacing * level), digits);
         double sellTP    = NormalizeDouble(sellPrice - tp, digits);

         request.action      = TRADE_ACTION_PENDING;
         request.symbol      = sym;
         request.volume      = GRID_LOT_SIZE;
         request.type        = ORDER_TYPE_SELL_LIMIT;
         request.price       = sellPrice;
         request.sl          = 0;
         request.tp          = sellTP;
         request.deviation   = SLIPPAGE_POINTS;
         request.magic       = MAGIC_NUMBER + 100;
         request.comment     = "VEDD Grid SELL L" + IntegerToString(level);
         request.type_time   = ORDER_TIME_SPECIFIED;
         request.expiration  = expiry;

         if(OrderSend(request, result) && result.retcode == TRADE_RETCODE_DONE)
         {
            Print("[GRID] ", sym, ": SELL level ", level, " set @ ", sellPrice);
            g_activeGridOrders[symIdx]++;
         }
      }
   }

   if(g_activeGridOrders[symIdx] > 0)
      Print("[GRID] ", sym, ": ", g_activeGridOrders[symIdx], " grid orders active.");
}

//+------------------------------------------------------------------+
//| Average tick volume over N bars for a symbol (ported from         |
//| VEDD_ChartData_EA's GetAverageVolume — ADAPTED to take a symbol    |
//| parameter instead of _Symbol).                                    |
//+------------------------------------------------------------------+
double GetAverageVolume(string sym, int bars)
{
   double total = 0;
   for(int i = 1; i <= bars; i++)
      total += (double)iVolume(sym, Period(), i);
   return bars > 0 ? total / bars : 0;
}

//+------------------------------------------------------------------+
//| Manage all open EA positions — trailing stop (3 modes), breakeven, |
//| momentum/volume-based exits (ported from VEDD_ChartData_EA's       |
//| ManageOpenTrades — ADAPTATION: the source EA looped PositionsTotal |
//| but filtered to POSITION_SYMBOL == _Symbol since it only ran on    |
//| one chart. This EA is multi-symbol, so it filters by MAGIC_NUMBER  |
//| only and reads each position's own symbol via                     |
//| PositionGetString(POSITION_SYMBOL) plus that symbol's own          |
//| persistent indicator handles (g_rsiH_a/g_macdH_a/g_atrH_a, created |
//| once per symbol in OnInit) instead of _Symbol-bound indicators.)   |
//+------------------------------------------------------------------+
void ManageAllOpenTrades()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MAGIC_NUMBER) continue;

      string sym = PositionGetString(POSITION_SYMBOL);
      int    idx = FindSymIndex(sym);
      int    digits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      double pipValue = PipValue(sym);

      double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
      double currentSL = PositionGetDouble(POSITION_SL);
      double currentTP = PositionGetDouble(POSITION_TP);
      ENUM_POSITION_TYPE posType = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);

      double currentBid = SymbolInfoDouble(sym, SYMBOL_BID);
      double currentAsk = SymbolInfoDouble(sym, SYMBOL_ASK);

      double profitPips = 0;
      if(posType == POSITION_TYPE_BUY) profitPips = (currentBid - openPrice) / pipValue;
      else                              profitPips = (openPrice - currentAsk) / pipValue;

      int    tConf = (idx >= 0) ? g_trailConfidence[idx]    : 0;
      double tMult = (idx >= 0) ? g_trailATRMultiplier[idx] : 0;

      // 1. MOMENTUM MANAGEMENT
      if(ENABLE_MOMENTUM_MANAGEMENT && CLOSE_ON_MOMENTUM_REVERSAL && idx >= 0)
      {
         double rsi = IndVal(g_rsiH_a[idx], 0);
         if(rsi == 0) rsi = 50;
         bool shouldClose = false;
         string reason = "";

         if(posType == POSITION_TYPE_BUY && rsi >= RSI_OVERBOUGHT)
         {
            shouldClose = true; reason = "RSI overbought (" + DoubleToString(rsi, 1) + ")";
         }
         else if(posType == POSITION_TYPE_SELL && rsi <= RSI_OVERSOLD)
         {
            shouldClose = true; reason = "RSI oversold (" + DoubleToString(rsi, 1) + ")";
         }

         double macdMain   = IndVal(g_macdH_a[idx], 0);
         double macdSignal = IndVal(g_macdH_a[idx], 1);
         if(posType == POSITION_TYPE_BUY && macdMain < macdSignal && profitPips > 10)
         {
            shouldClose = true; reason = "MACD bearish crossover";
         }
         else if(posType == POSITION_TYPE_SELL && macdMain > macdSignal && profitPips > 10)
         {
            shouldClose = true; reason = "MACD bullish crossover";
         }

         if(shouldClose && profitPips > 5)
         {
            Print("[REFINEMENT] ", sym, ": closing on momentum reversal - ", reason);
            g_trade.PositionClose(ticket);
            continue;
         }
      }

      // 2. VOLUME MANAGEMENT
      if(ENABLE_VOLUME_MANAGEMENT && CLOSE_ON_LOW_VOLUME)
      {
         double avgVolume = GetAverageVolume(sym, 20);
         long   currentVolume = iVolume(sym, Period(), 0);

         if(avgVolume > 0 && currentVolume < avgVolume * (VOLUME_DROP_PERCENT / 100.0) && profitPips > 5)
         {
            Print("[REFINEMENT] ", sym, ": closing on low volume (", currentVolume, " < ", (int)(avgVolume * VOLUME_DROP_PERCENT / 100), ")");
            g_trade.PositionClose(ticket);
            continue;
         }
      }

      // 3. BREAKEVEN
      if(MOVE_TO_BREAKEVEN && profitPips >= BREAKEVEN_PIPS)
      {
         double newSL = 0;
         if(posType == POSITION_TYPE_BUY)
         {
            newSL = NormalizeDouble(openPrice + (BREAKEVEN_LOCK_PIPS * pipValue), digits);
            if(currentSL < newSL)
            {
               if(g_trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] ", sym, ": breakeven + ", BREAKEVEN_LOCK_PIPS, " locked");
            }
         }
         else
         {
            newSL = NormalizeDouble(openPrice - (BREAKEVEN_LOCK_PIPS * pipValue), digits);
            if(currentSL > newSL || currentSL == 0)
            {
               if(g_trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] ", sym, ": breakeven + ", BREAKEVEN_LOCK_PIPS, " locked");
            }
         }
      }

      // 4. TRAILING STOP (with AI confidence-aware adjustments)
      if(ENABLE_TRAILING_STOP && profitPips >= TRAIL_START_PIPS)
      {
         double trailDistance = 0;

         if(TRAIL_MODE == 1)
         {
            trailDistance = TRAIL_DISTANCE_PIPS * pipValue;
         }
         else if(TRAIL_MODE == 2)
         {
            double atr = (idx >= 0) ? IndVal(g_atrH_a[idx], 0) : 0;
            double effectiveMultiplier = TRAIL_ATR_MULTIPLIER;
            if(tConf > 0 && tMult > 0) effectiveMultiplier = tMult;
            trailDistance = atr * effectiveMultiplier;
         }
         else if(TRAIL_MODE == 3)
         {
            trailDistance = TRAIL_DISTANCE_PIPS * pipValue;
         }

         if(tConf > 0)
         {
            if(tConf < 45) trailDistance *= 0.8;
            else if(tConf > 75) trailDistance *= 1.1;
         }

         double newSL = 0;
         if(posType == POSITION_TYPE_BUY)
         {
            newSL = NormalizeDouble(currentBid - trailDistance, digits);
            if(newSL > currentSL && newSL > openPrice)
            {
               if(g_trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] ", sym, ": trail locking profits @ ", newSL);
            }
         }
         else
         {
            newSL = NormalizeDouble(currentAsk + trailDistance, digits);
            if((newSL < currentSL || currentSL == 0) && newSL < openPrice)
            {
               if(g_trade.PositionModify(ticket, newSL, currentTP))
                  Print("[REFINEMENT] ", sym, ": trail locking profits @ ", newSL);
            }
         }
      }
   }
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
      if(action == "OPEN")
      {
         // Pre-trade risk/compliance gate — ported from VEDD_ChartData_EA's
         // ProcessAutoTrade() filter chain (Prop Firm / R:R / SL-required /
         // Learning Filter / News Filter), applied here since this EA's
         // trades originate from polled AI signals rather than a local
         // ProcessAutoTrade() decision.
         string filterReason = "";
         if(!PassesPreTradeFilters(direction, entry, sl, tp, filterReason))
         {
            Print("[VEDD] Signal OPEN blocked by risk filters: ", filterReason);
            ok = false;
         }
         else
         {
            ok = ExecuteOpen(symbol, direction, lotSize, entry, sl, tp, id);
            if(ok) IncrementDailyTradeCount();
         }
      }
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

   // MARTINGALE — ADAPTATION: VEDD_ChartData_EA only applied martingale
   // inside its own local CalculateLotSize(), used solely by its local
   // ProcessAutoTrade(). This EA's OPEN trades come from a server-provided
   // lotSize instead, so the multiplier is applied here, directly to the
   // signal's lot, right before the order is built.
   if(ENABLE_MARTINGALE)
   {
      int symIdx = FindSymIndex(sym);
      lotSize = GetMartingaleLotSize(sym, symIdx, lotSize);
   }
   // Prop Firm max lot size cap (ported from VEDD_ChartData_EA's CalculateLotSize)
   if(PROP_FIRM_MODE && lotSize > PROP_MAX_LOT_SIZE)
   {
      Print("[PROP FIRM] Lot size ", DoubleToString(lotSize, 2), " capped to ", DoubleToString(PROP_MAX_LOT_SIZE, 2));
      lotSize = PROP_MAX_LOT_SIZE;
   }

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
void SendChartData(int symIdx)
{
   string          sym = g_symList[symIdx];
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
      double rsiVal   = IndVal(g_rsiH_a   [symIdx], 0);   // RSI main
      double macdMain = IndVal(g_macdH_a  [symIdx], 0);   // MACD main line
      double macdSig  = IndVal(g_macdH_a  [symIdx], 1);   // MACD signal line
      double bbUpper  = IndVal(g_bbH_a    [symIdx], 1);   // Bands upper
      double bbMid    = IndVal(g_bbH_a    [symIdx], 0);   // Bands middle
      double bbLower  = IndVal(g_bbH_a    [symIdx], 2);   // Bands lower
      double atrVal   = IndVal(g_atrH_a   [symIdx], 0);   // ATR
      double ema20    = IndVal(g_ema20H_a [symIdx], 0);
      double ema50    = IndVal(g_ema50H_a [symIdx], 0);
      double ema200   = IndVal(g_ema200H_a[symIdx], 0);

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

   double spread  = (double)SymbolInfoInteger(sym, SYMBOL_SPREAD) * SymbolInfoDouble(sym, SYMBOL_POINT);
   double ask     = SymbolInfoDouble(sym, SYMBOL_ASK);
   double bid     = SymbolInfoDouble(sym, SYMBOL_BID);

   // Account-wide (not per-symbol) data the server needs to drive
   // GoalTracker and the Brain Dashboard's win/loss resolution — this EA
   // used to send none of this, so those two features looked dead even
   // when connectivity itself was fine.
   string openPositionsJson = BuildOpenPositionsJson();
   string closedTradesJson  = BuildClosedTradesJson(30);

   // Multi-timeframe AI analysis data (ported from VEDD_ChartData_EA)
   string multiTimeframeJson = ENABLE_MULTI_TIMEFRAME ? BuildMultiTimeframeJson(sym) : "null";

   // Extended account object (ported from VEDD_ChartData_EA's BuildAccountJson)
   string accountJson = BuildAccountJson();

   // Full eaSettings object (ported from VEDD_ChartData_EA — MIN_CONFIDENCE/
   // LOT_SIZE/USE_RISK_PERCENT/RISK_PERCENT/MAX_OPEN_TRADES/TRADING_SESSION
   // are new inputs added for this section; autoTradingEnabled maps to this
   // EA's existing ENABLE_SIGNALS since there is no separate ENABLE_AUTO_TRADING
   // input here — signal execution IS the auto-trading path in this EA)
   ResolveSession(sym);
   string eaSettingsJson = StringFormat(
      "{\"minConfidence\":%d,\"lotSize\":%.2f,\"useRiskPercent\":%s,\"riskPercent\":%.2f,\"maxOpenTrades\":%d,"
      "\"autoTradingEnabled\":%s,\"tradingSession\":%d,\"sessionName\":\"%s\",\"sessionStart\":%d,\"sessionEnd\":%d}",
      MIN_CONFIDENCE,
      LOT_SIZE,
      USE_RISK_PERCENT ? "true" : "false",
      RISK_PERCENT,
      MAX_OPEN_TRADES,
      ENABLE_SIGNALS ? "true" : "false",
      TRADING_SESSION,
      g_activeSessionName,
      g_activeSessionStart,
      g_activeSessionEnd
   );

   string body = StringFormat(
      "{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"broker\":\"%s\",\"timestamp\":%d,\"candles\":%s,"
      "\"indicators\":%s,"
      "\"multiTimeframeEnabled\":%s,\"multiTimeframe\":%s,"
      "\"account\":%s,"
      "\"market\":{\"ask\":%.5f,\"bid\":%.5f,\"spread\":%.5f},"
      "\"openPositions\":%s,\"closedTrades\":%s,\"eaSettings\":%s,"
      "\"accountAlias\":\"%s\",\"platform\":\"MT5\"}",
      JsonEscape(sym), tfStr, JsonEscape(AccountInfoString(ACCOUNT_COMPANY)), TimeCurrent(), candlesJson,
      indJson,
      ENABLE_MULTI_TIMEFRAME ? "true" : "false", multiTimeframeJson,
      accountJson,
      SafeDouble(ask), SafeDouble(bid), SafeDouble(spread),
      openPositionsJson, closedTradesJson, eaSettingsJson,
      JsonEscape(ACCOUNT_ALIAS)
   );

   int    httpCode;
   string resp = HttpPostEx(g_chartDataUrl, body, httpCode);
   if(httpCode == 200 || httpCode == 201)
   {
      Print("[VEDD] Chart data sent: ", sym, "/", tfStr, " (", copied, " candles)");
      // Parse the AI signal/trade-plan + news fields out of the response
      // (ported from VEDD_ChartData_EA's ParseAndDisplayAnalysis, see
      // ParseChartDataResponse for what was and wasn't carried over)
      ParseChartDataResponse(symIdx, resp);

      // Report the AI's actual analysis to the Experts log per pair — the
      // source EA (VEDD_ChartData_EA) printed this after every send via
      // ParseAndDisplayAnalysis; this EA parsed the same fields into
      // g_lastSignal/g_lastConfidence/etc. but never displayed them.
      if(symIdx >= 0)
      {
         Print("[VEDD] ", sym, "/", tfStr, " AI Signal: ", g_lastSignal[symIdx], " (", g_lastConfidence[symIdx], "% confidence)");
         if(g_lastEntry[symIdx] > 0)
         {
            int symDigits = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
            Print("[VEDD] ", sym, " Trade Plan — Entry: ", DoubleToString(g_lastEntry[symIdx], symDigits),
                  " | SL: ", DoubleToString(g_lastSL[symIdx], symDigits),
                  " | TP: ", DoubleToString(g_lastTP[symIdx], symDigits));
         }
         if(g_trailConfidence[symIdx] > 0)
            Print("[VEDD] ", sym, " Trailing Confidence: ", g_trailConfidence[symIdx], "% (ATR x", DoubleToString(g_trailATRMultiplier[symIdx], 2), ")");
      }
      if(g_hasNewsData)
         Print("[VEDD] News — Sentiment: ", g_lastNewsSentiment, " | Alignment: ", g_lastNewsAlignment,
               " | Impact: ", g_lastNewsImpact, " | Score: ", g_lastNewsScore,
               StringLen(g_lastHighImpactAlert) > 0 ? (" | ALERT: " + g_lastHighImpactAlert) : "");
   }
   else if(httpCode <= 0)
   {
      Print("[VEDD] Chart data FAILED (network error, code ", httpCode, ") — check Tools > Options > Expert Advisors > Allow WebRequest for: ", g_chartDataUrl);
   }
   else
   {
      Print("[VEDD] Chart data REJECTED by server — HTTP ", httpCode, " for ", sym, "/", tfStr, ". Response: ", resp);
      if(httpCode == 401) Print("[VEDD] HTTP 401 = your API_KEY doesn't match any active token in AI Trading Vault. Re-copy it from the MT5 Chart Data setup page.");
   }
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
      for(int i = 0; i < g_symCount; i++)
         SendChartData(i);
   }
   if(now - g_lastHeartbeat >= HEARTBEAT_SECONDS)
   {
      g_lastHeartbeat = now;
      SendHeartbeat();
   }

   UpdateChartComment();
}

//+------------------------------------------------------------------+
//| OnTick — trade management + risk/compliance subsystems ported from|
//| VEDD_ChartData_EA's OnTick (Prop Firm weekend-close/compliance,    |
//| trailing/breakeven/momentum/volume management, pyramiding, grid). |
//| ADAPTATION: the source EA gated all of this behind                |
//| ENABLE_AUTO_TRADING (its local auto-trading master switch). This   |
//| EA has no equivalent single switch — its trades are driven by      |
//| polled AI signals (ENABLE_SIGNALS) rather than local decisions —   |
//| so each subsystem here is gated only by its own ENABLE_* input,    |
//| same as the source EA's inner checks, and loops every monitored    |
//| symbol (g_symList) instead of running once for _Symbol.            |
//+------------------------------------------------------------------+
void OnTick()
{
   // Prop Firm: weekend close + continuous compliance monitoring (account-wide)
   PropFirmWeekendClose();
   if(PROP_FIRM_MODE) CheckPropFirmCompliance();

   if(ENABLE_TRADE_MANAGEMENT)
      ManageAllOpenTrades();

   if(ENABLE_PYRAMIDING)
      for(int i = 0; i < g_symCount; i++)
         CheckPyramidOpportunity(i);

   if(ENABLE_GRID)
      for(int i = 0; i < g_symCount; i++)
         ManageGridOrders(i);
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

   // Tolerate a full endpoint URL pasted into the base field (e.g.
   // "https://veddbuild.com/api/mt5/chart-data"). This EA appends the API path
   // itself, so without stripping we'd build ".../api/mt5/chart-data/api/mt5/
   // chart-data" and every request 404s. Cut anything from "/api/" onward.
   int _apiPos = StringFind(base, "/api/");
   if(_apiPos > 8) // keep scheme+host (https://host)
   {
      Print("[VEDD] SERVER_URL contained an API path — normalized base to: ", StringSubstr(base, 0, _apiPos));
      base = StringSubstr(base, 0, _apiPos);
   }

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

   // Create indicator handles for each monitored symbol
   if(INCLUDE_INDICATORS)
   {
      ENUM_TIMEFRAMES tf = Period();
      for(int i = 0; i < g_symCount; i++)
      {
         string s        = g_symList[i];
         g_rsiH_a   [i] = iRSI  (s, tf, 14, PRICE_CLOSE);
         g_macdH_a  [i] = iMACD (s, tf, 12, 26, 9, PRICE_CLOSE);
         g_bbH_a    [i] = iBands(s, tf, 20, 0, 2.0, PRICE_CLOSE);
         g_atrH_a   [i] = iATR  (s, tf, 14);
         g_ema20H_a [i] = iMA   (s, tf, 20,  0, MODE_EMA, PRICE_CLOSE);
         g_ema50H_a [i] = iMA   (s, tf, 50,  0, MODE_EMA, PRICE_CLOSE);
         g_ema200H_a[i] = iMA   (s, tf, 200, 0, MODE_EMA, PRICE_CLOSE);
      }
   }

   g_trade.SetExpertMagicNumber(MAGIC_NUMBER);
   g_trade.SetDeviationInPoints(SLIPPAGE_POINTS);

   // Prop Firm / Learning Filter state init (ported from VEDD_ChartData_EA's
   // OnInit — CheckPropFirmCompliance() also lazily self-initializes via
   // g_propInitialized as a safety net if PROP_FIRM_MODE is toggled on later)
   if(PROP_FIRM_MODE)
   {
      g_propStartingBalance  = AccountInfoDouble(ACCOUNT_BALANCE);
      g_propDailyHighBalance = g_propStartingBalance;
      g_propMaxEquityReached = g_propStartingBalance;
      g_propDailyResetTime   = TimeCurrent();
      g_propTradingBlocked   = false;
      g_propBlockReason      = "";
      g_propInitialized      = true;
      Print("[VEDD] Prop Firm Mode: starting balance = ", DoubleToString(g_propStartingBalance, 2));
   }
   if(ENABLE_LEARNING_FILTER)
   {
      g_learningDailyResetTime = TimeCurrent();
      g_dailyTradeCount = 0;
   }

   EventSetTimer(1);
   SendHeartbeat();

   Print("[VEDD] MT5 Combined EA v1.01 initialized. Alias=", ACCOUNT_ALIAS,
         " Signals=", ENABLE_SIGNALS, " ChartData=", ENABLE_CHART_DATA,
         " TradeCopy=", ENABLE_TRADE_COPY,
         " TradeMgmt=", ENABLE_TRADE_MANAGEMENT, " PropFirm=", PROP_FIRM_MODE,
         " LearningFilter=", ENABLE_LEARNING_FILTER, " NewsAware=", NEWS_AWARE_TRADING,
         " Pyramiding=", ENABLE_PYRAMIDING, " Grid=", ENABLE_GRID, " Martingale=", ENABLE_MARTINGALE);
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

   // Release all per-symbol indicator handles
   for(int i = 0; i < g_symCount; i++)
   {
      if(g_rsiH_a   [i] != INVALID_HANDLE) IndicatorRelease(g_rsiH_a   [i]);
      if(g_macdH_a  [i] != INVALID_HANDLE) IndicatorRelease(g_macdH_a  [i]);
      if(g_bbH_a    [i] != INVALID_HANDLE) IndicatorRelease(g_bbH_a    [i]);
      if(g_atrH_a   [i] != INVALID_HANDLE) IndicatorRelease(g_atrH_a   [i]);
      if(g_ema20H_a [i] != INVALID_HANDLE) IndicatorRelease(g_ema20H_a [i]);
      if(g_ema50H_a [i] != INVALID_HANDLE) IndicatorRelease(g_ema50H_a [i]);
      if(g_ema200H_a[i] != INVALID_HANDLE) IndicatorRelease(g_ema200H_a[i]);
   }

   Print("[VEDD] MT5 Combined EA stopped. Reason=", reason);
}
