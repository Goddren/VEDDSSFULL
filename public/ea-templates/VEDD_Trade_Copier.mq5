//+------------------------------------------------------------------+
//|                                          VEDD_Trade_Copier.mq5   |
//|                                    Copyright 2024, VEDD AI       |
//|                                    https://vedd.ai               |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, VEDD AI"
#property link      "https://vedd.ai"
#property version   "1.00"
#property description "Sends trade signals to VEDD AI for relay to TradeLocker and other platforms"
#property strict

//--- Input parameters
input string   WebhookURL = "https://your-replit-url.repl.co/api/mt5-signal";  // VEDD AI Webhook URL
input string   APIKey = "";                    // Your VEDD AI API Key (from Settings)
input bool     SendOnOpen = true;              // Send signal when trade opens
input bool     SendOnClose = true;             // Send signal when trade closes
input bool     SendOnModify = true;            // Send signal when trade modified
input int      RetryAttempts = 3;              // Number of retry attempts
input int      RetryDelayMs = 1000;            // Delay between retries (ms)

//--- Global variables
int lastPositionCount = 0;
datetime lastCheck = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("VEDD Trade Copier initialized");
   Print("Webhook URL: ", WebhookURL);
   
   if(StringLen(APIKey) == 0)
   {
      Print("WARNING: No API Key configured. Signals will not be authenticated.");
   }
   
   lastPositionCount = PositionsTotal();
   lastCheck = TimeCurrent();
   
   EventSetTimer(1);
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                   |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();
   Print("VEDD Trade Copier stopped. Reason: ", reason);
}

//+------------------------------------------------------------------+
//| Timer function - checks for position changes                       |
//+------------------------------------------------------------------+
void OnTimer()
{
   CheckPositions();
}

//+------------------------------------------------------------------+
//| Trade event function                                               |
//+------------------------------------------------------------------+
void OnTrade()
{
   CheckPositions();
}

//+------------------------------------------------------------------+
//| Check for new, closed, or modified positions                       |
//+------------------------------------------------------------------+
void CheckPositions()
{
   int currentCount = PositionsTotal();
   
   if(SendOnOpen && currentCount > lastPositionCount)
   {
      for(int i = currentCount - 1; i >= lastPositionCount; i--)
      {
         if(PositionSelectByTicket(PositionGetTicket(i)))
         {
            SendSignal("OPEN");
         }
      }
   }
   
   lastPositionCount = currentCount;
}

//+------------------------------------------------------------------+
//| Send signal to VEDD AI webhook                                     |
//+------------------------------------------------------------------+
bool SendSignal(string action)
{
   if(StringLen(WebhookURL) == 0)
   {
      Print("Error: Webhook URL not configured");
      return false;
   }
   
   string symbol = PositionGetString(POSITION_SYMBOL);
   long positionType = PositionGetInteger(POSITION_TYPE);
   double volume = PositionGetDouble(POSITION_VOLUME);
   double openPrice = PositionGetDouble(POSITION_PRICE_OPEN);
   double stopLoss = PositionGetDouble(POSITION_SL);
   double takeProfit = PositionGetDouble(POSITION_TP);
   long ticket = PositionGetInteger(POSITION_TICKET);
   long magic = PositionGetInteger(POSITION_MAGIC);
   string comment = PositionGetString(POSITION_COMMENT);
   datetime openTime = (datetime)PositionGetInteger(POSITION_TIME);
   
   string direction = (positionType == POSITION_TYPE_BUY) ? "BUY" : "SELL";
   
   string jsonPayload = StringFormat(
      "{"
      "\"action\":\"%s\","
      "\"symbol\":\"%s\","
      "\"direction\":\"%s\","
      "\"volume\":%.2f,"
      "\"entryPrice\":%.5f,"
      "\"stopLoss\":%.5f,"
      "\"takeProfit\":%.5f,"
      "\"ticket\":%d,"
      "\"magic\":%d,"
      "\"comment\":\"%s\","
      "\"openTime\":\"%s\","
      "\"platform\":\"MT5\","
      "\"timestamp\":\"%s\""
      "}",
      action,
      symbol,
      direction,
      volume,
      openPrice,
      stopLoss,
      takeProfit,
      ticket,
      magic,
      comment,
      TimeToString(openTime, TIME_DATE|TIME_SECONDS),
      TimeToString(TimeCurrent(), TIME_DATE|TIME_SECONDS)
   );
   
   Print("Sending signal: ", jsonPayload);
   
   for(int attempt = 1; attempt <= RetryAttempts; attempt++)
   {
      if(SendHTTPRequest(jsonPayload))
      {
         Print("Signal sent successfully on attempt ", attempt);
         return true;
      }
      
      if(attempt < RetryAttempts)
      {
         Print("Retry attempt ", attempt, " failed. Waiting ", RetryDelayMs, "ms...");
         Sleep(RetryDelayMs);
      }
   }
   
   Print("Failed to send signal after ", RetryAttempts, " attempts");
   return false;
}

//+------------------------------------------------------------------+
//| Send HTTP POST request                                             |
//+------------------------------------------------------------------+
bool SendHTTPRequest(string jsonPayload)
{
   char postData[];
   char result[];
   string headers;
   string resultHeaders;
   int timeout = 5000;
   
   StringToCharArray(jsonPayload, postData, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(postData, ArraySize(postData) - 1);
   
   headers = "Content-Type: application/json\r\n";
   if(StringLen(APIKey) > 0)
   {
      headers += "X-VEDD-API-Key: " + APIKey + "\r\n";
   }
   
   ResetLastError();
   
   int response = WebRequest(
      "POST",
      WebhookURL,
      headers,
      timeout,
      postData,
      result,
      resultHeaders
   );
   
   if(response == -1)
   {
      int error = GetLastError();
      Print("WebRequest error: ", error);
      
      if(error == 4014)
      {
         Print("Error 4014: Add '", WebhookURL, "' to Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL");
      }
      
      return false;
   }
   
   string resultString = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   Print("Server response (", response, "): ", resultString);
   
   return (response >= 200 && response < 300);
}

//+------------------------------------------------------------------+
//| Tick function (optional processing)                                |
//+------------------------------------------------------------------+
void OnTick()
{
}
//+------------------------------------------------------------------+
