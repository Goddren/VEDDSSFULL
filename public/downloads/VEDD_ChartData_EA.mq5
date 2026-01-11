//+------------------------------------------------------------------+
//|                                           VEDD_ChartData_EA.mq5 |
//|                              AI Powered Trading Vault           |
//|                         Chart Data Sender for AI Refresh        |
//+------------------------------------------------------------------+
#property copyright "AI Powered Trading Vault"
#property link      "https://aipoweredtradingvault.com"
#property version   "2.00"
#property description "Sends chart data to AI Trading Vault and displays AI analysis results"
#property strict

//--- Input parameters
input string   API_URL = "https://your-app-url.replit.app/api/mt5/chart-data";  // Your AI Trading Vault URL (CHANGE THIS!)
input string   API_TOKEN = "";                    // Your API Token from AI Trading Vault
input int      CANDLES_TO_SEND = 50;              // Number of candles to send
input int      SEND_INTERVAL_SECONDS = 60;        // Send interval (seconds)
input bool     INCLUDE_INDICATORS = true;         // Include technical indicators
input bool     SHOW_CHART_COMMENT = true;         // Show analysis on chart
input int      TIMEOUT = 15000;                   // Request timeout (ms)

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
   
   Print("========================================");
   Print("AI Trading Vault - Chart Data EA");
   Print("Symbol: ", _Symbol);
   Print("Timeframe: ", EnumToString(Period()));
   Print("Candles to send: ", CANDLES_TO_SEND);
   Print("Send interval: ", SEND_INTERVAL_SECONDS, " seconds");
   Print("========================================");
   
   // Send initial data
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
   // Check if enough time has passed since last send
   if(TimeCurrent() - lastSendTime >= SEND_INTERVAL_SECONDS)
   {
      SendChartData();
      lastSendTime = TimeCurrent();
   }
}

//+------------------------------------------------------------------+
//| Send chart data to AI Trading Vault                              |
//+------------------------------------------------------------------+
bool SendChartData()
{
   // Build OHLCV data array
   string candlesJson = BuildCandlesJson();
   
   // Build indicators data if enabled
   string indicatorsJson = "";
   if(INCLUDE_INDICATORS)
   {
      indicatorsJson = BuildIndicatorsJson();
   }
   
   // Build complete JSON payload
   string jsonPayload = StringFormat(
      "{\"symbol\":\"%s\",\"timeframe\":\"%s\",\"broker\":\"%s\",\"timestamp\":%d,\"candles\":%s%s}",
      _Symbol,
      GetTimeframeString(),
      AccountInfoString(ACCOUNT_COMPANY),
      TimeCurrent(),
      candlesJson,
      INCLUDE_INDICATORS ? ",\"indicators\":" + indicatorsJson : ""
   );
   
   // Convert to char array
   uchar jsonData[];
   StringToCharArray(jsonPayload, jsonData, 0, StringLen(jsonPayload), CP_UTF8);
   
   // Prepare request headers
   string headers = "Content-Type: application/json\r\n";
   headers += "Authorization: Bearer " + API_TOKEN + "\r\n";
   headers += "X-MT5-Symbol: " + _Symbol + "\r\n";
   headers += "X-MT5-Timeframe: " + GetTimeframeString() + "\r\n";
   
   // Response containers
   char resultData[];
   string resultHeaders;
   
   ResetLastError();
   
   // Send HTTP POST request
   int httpCode = WebRequest(
      "POST",
      API_URL,
      headers,
      TIMEOUT,
      jsonData,
      resultData,
      resultHeaders
   );
   
   // Handle response
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
      
      // Parse and display AI analysis
      ParseAndDisplayAnalysis(response);
      
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
   // Use MT5-friendly flat fields (mt5Signal, mt5Confidence, etc.)
   // These are at the top level of the response for reliable parsing
   
   lastSignal = ExtractJsonString(json, "\"mt5Signal\":\"", "\"");
   lastTrend = ExtractJsonString(json, "\"mt5Trend\":\"", "\"");
   lastPatterns = ExtractJsonString(json, "\"mt5Patterns\":\"", "\"");
   
   // Parse confidence (number field)
   string confStr = ExtractJsonNumber(json, "\"mt5Confidence\":");
   lastConfidence = (int)StringToInteger(confStr);
   
   // Check if we have a trade plan
   string hasPlanStr = ExtractJsonString(json, "\"mt5HasTradePlan\":", ",");
   bool hasTradePlan = (StringFind(hasPlanStr, "true") >= 0);
   
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
   
   // Print conversational analysis to Experts tab
   Print("");
   Print("Hey G, VEDD AI here! Just scanned ", _Symbol, " on the ", GetTimeframeString(), " chart.");
   Print("");
   
   // Main signal message
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
   
   // Trend info
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
   
   // Patterns detected
   if(StringLen(lastPatterns) > 0)
   {
      Print("");
      Print("PATTERNS DETECTED: ", lastPatterns);
   }
   
   // Trade plan
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
   
   // Show on chart if enabled
   if(SHOW_CHART_COMMENT)
   {
      UpdateChartComment();
   }
}

//+------------------------------------------------------------------+
//| Update chart comment with latest analysis                        |
//+------------------------------------------------------------------+
void UpdateChartComment()
{
   string commentText = "";
   commentText += "VEDD AI Trading Assistant\n";
   commentText += "------------------------\n";
   
   // Signal with emoji-style indicators
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
   
   // Trend
   if(StringLen(lastTrend) > 0)
   {
      commentText += "Trend: " + lastTrend + "\n";
   }
   
   // Patterns
   if(StringLen(lastPatterns) > 0)
   {
      commentText += "Patterns: " + lastPatterns + "\n";
   }
   
   // Trade plan
   if(lastEntry > 0)
   {
      commentText += "------------------------\n";
      commentText += "Entry: " + DoubleToString(lastEntry, _Digits) + "\n";
      commentText += "SL: " + DoubleToString(lastSL, _Digits) + "\n";
      commentText += "TP: " + DoubleToString(lastTP, _Digits) + "\n";
   }
   
   commentText += "------------------------\n";
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
   
   // Find the end of the number (comma, }, or end of string)
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
   // Calculate RSI (14)
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
   
   // Calculate MACD (12, 26, 9)
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
   
   // Calculate ATR (14)
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
   
   // Calculate Moving Averages
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
   
   // Calculate Bollinger Bands (20, 2)
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
   
   // Get current price info
   double bid = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double ask = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   double spread = (ask - bid) / SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   
   // Build indicators JSON
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
