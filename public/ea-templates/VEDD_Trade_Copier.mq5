//+------------------------------------------------------------------+
//|                                          VEDD_Trade_Copier.mq5   |
//|                                    Copyright 2024, VEDD AI       |
//|                                    https://vedd.ai               |
//+------------------------------------------------------------------+
#property copyright "Copyright 2024, VEDD AI"
#property link      "https://vedd.ai"
#property version   "1.10"
#property description "Sends trade signals to VEDD AI for relay to TradeLocker and other platforms"
#property description "With advanced filtering by magic number, symbol, and direction"
#property strict

//--- Input parameters - Connection
input string   WebhookURL = "https://your-replit-url.repl.co/api/mt5-signal";  // VEDD AI Webhook URL
input string   APIKey = "";                    // Your VEDD AI API Key (from Settings)

//--- Input parameters - Signal Types
input bool     SendOnOpen = true;              // Send signal when trade opens
input bool     SendOnClose = true;             // Send signal when trade closes
input bool     SendOnModify = true;            // Send signal when trade modified

//--- Input parameters - Filtering
input string   FilterSymbols = "";             // Filter symbols (comma-separated, empty=all)
input string   FilterMagicNumbers = "";        // Filter magic numbers (comma-separated, empty=all)
input bool     FilterBuyOnly = false;          // Only copy BUY trades
input bool     FilterSellOnly = false;         // Only copy SELL trades

//--- Input parameters - Lot Size Filter (Beginner Friendly)
enum ENUM_LOT_FILTER
{
   LOT_FILTER_ALL = 0,        // Copy ALL trade sizes
   LOT_FILTER_MICRO = 1,      // Micro lots only (0.01-0.09)
   LOT_FILTER_MINI = 2,       // Mini lots only (0.10-0.99)
   LOT_FILTER_STANDARD = 3,   // Standard lots only (1.0+)
   LOT_FILTER_SMALL = 4,      // Small trades (under 0.5 lots)
   LOT_FILTER_LARGE = 5,      // Large trades (0.5 lots and above)
   LOT_FILTER_CUSTOM = 6      // Custom range (use Min/Max below)
};
input ENUM_LOT_FILTER LotSizeFilter = LOT_FILTER_ALL;  // Lot Size Filter
input double   CustomMinLots = 0.0;            // Custom Min Lots (only if Custom selected)
input double   CustomMaxLots = 0.0;            // Custom Max Lots (only if Custom selected)

//--- Input parameters - Network
input int      RetryAttempts = 3;              // Number of retry attempts
input int      RetryDelayMs = 1000;            // Delay between retries (ms)

//--- Global variables
int lastPositionCount = 0;
datetime lastCheck = 0;
string allowedSymbols[];
long allowedMagics[];
int symbolCount = 0;
int magicCount = 0;

//+------------------------------------------------------------------+
//| Expert initialization function                                     |
//+------------------------------------------------------------------+
int OnInit()
{
   Print("===========================================");
   Print("VEDD Trade Copier v1.10 initialized");
   Print("===========================================");
   Print("Webhook URL: ", WebhookURL);
   
   if(StringLen(APIKey) == 0)
   {
      Print("WARNING: No API Key configured. Signals will not be authenticated.");
   }
   
   // Parse symbol filter
   if(StringLen(FilterSymbols) > 0)
   {
      symbolCount = ParseSymbolFilter(FilterSymbols, allowedSymbols);
      Print("Symbol filter active: ", symbolCount, " symbols allowed");
      for(int i = 0; i < symbolCount; i++)
         Print("  - ", allowedSymbols[i]);
   }
   else
   {
      Print("Symbol filter: ALL symbols allowed");
   }
   
   // Parse magic number filter
   if(StringLen(FilterMagicNumbers) > 0)
   {
      magicCount = ParseMagicFilter(FilterMagicNumbers, allowedMagics);
      Print("Magic filter active: ", magicCount, " magic numbers allowed");
      for(int i = 0; i < magicCount; i++)
         Print("  - ", allowedMagics[i]);
   }
   else
   {
      Print("Magic filter: ALL magic numbers allowed");
   }
   
   // Direction filter
   if(FilterBuyOnly && FilterSellOnly)
   {
      Print("WARNING: Both BuyOnly and SellOnly enabled - no trades will be copied!");
   }
   else if(FilterBuyOnly)
   {
      Print("Direction filter: BUY trades only");
   }
   else if(FilterSellOnly)
   {
      Print("Direction filter: SELL trades only");
   }
   
   // Lot size filter
   switch(LotSizeFilter)
   {
      case LOT_FILTER_ALL:      Print("Lot filter: ALL sizes"); break;
      case LOT_FILTER_MICRO:    Print("Lot filter: Micro lots (0.01-0.09)"); break;
      case LOT_FILTER_MINI:     Print("Lot filter: Mini lots (0.10-0.99)"); break;
      case LOT_FILTER_STANDARD: Print("Lot filter: Standard lots (1.0+)"); break;
      case LOT_FILTER_SMALL:    Print("Lot filter: Small trades (under 0.5)"); break;
      case LOT_FILTER_LARGE:    Print("Lot filter: Large trades (0.5+)"); break;
      case LOT_FILTER_CUSTOM:   Print("Lot filter: Custom (", CustomMinLots, " - ", CustomMaxLots, ")"); break;
   }
   
   lastPositionCount = PositionsTotal();
   lastCheck = TimeCurrent();
   
   EventSetTimer(1);
   Print("===========================================");
   
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Parse comma-separated symbol filter                                |
//+------------------------------------------------------------------+
int ParseSymbolFilter(string filter, string &result[])
{
   string temp[];
   int count = StringSplit(filter, ',', temp);
   ArrayResize(result, count);
   
   for(int i = 0; i < count; i++)
   {
      result[i] = StringTrimLeft(StringTrimRight(temp[i]));
      StringToUpper(result[i]);
   }
   
   return count;
}

//+------------------------------------------------------------------+
//| Parse comma-separated magic number filter                          |
//+------------------------------------------------------------------+
int ParseMagicFilter(string filter, long &result[])
{
   string temp[];
   int count = StringSplit(filter, ',', temp);
   ArrayResize(result, count);
   
   for(int i = 0; i < count; i++)
   {
      result[i] = StringToInteger(StringTrimLeft(StringTrimRight(temp[i])));
   }
   
   return count;
}

//+------------------------------------------------------------------+
//| Check if symbol is allowed                                         |
//+------------------------------------------------------------------+
bool IsSymbolAllowed(string symbol)
{
   if(symbolCount == 0)
      return true;
   
   string upperSymbol = symbol;
   StringToUpper(upperSymbol);
   
   for(int i = 0; i < symbolCount; i++)
   {
      if(StringFind(upperSymbol, allowedSymbols[i]) >= 0)
         return true;
   }
   
   return false;
}

//+------------------------------------------------------------------+
//| Check if magic number is allowed                                   |
//+------------------------------------------------------------------+
bool IsMagicAllowed(long magic)
{
   if(magicCount == 0)
      return true;
   
   for(int i = 0; i < magicCount; i++)
   {
      if(allowedMagics[i] == magic)
         return true;
   }
   
   return false;
}

//+------------------------------------------------------------------+
//| Check if position passes all filters                               |
//+------------------------------------------------------------------+
bool PassesFilters(string symbol, long magic, long posType, double volume)
{
   // Symbol filter
   if(!IsSymbolAllowed(symbol))
   {
      Print("Filtered out: Symbol ", symbol, " not in allowed list");
      return false;
   }
   
   // Magic filter
   if(!IsMagicAllowed(magic))
   {
      Print("Filtered out: Magic ", magic, " not in allowed list");
      return false;
   }
   
   // Direction filter
   if(FilterBuyOnly && posType != POSITION_TYPE_BUY)
   {
      Print("Filtered out: Not a BUY trade");
      return false;
   }
   if(FilterSellOnly && posType != POSITION_TYPE_SELL)
   {
      Print("Filtered out: Not a SELL trade");
      return false;
   }
   
   // Lot size filter
   if(!PassesLotFilter(volume))
   {
      return false;
   }
   
   return true;
}

//+------------------------------------------------------------------+
//| Check if volume passes the lot size filter                        |
//+------------------------------------------------------------------+
bool PassesLotFilter(double volume)
{
   switch(LotSizeFilter)
   {
      case LOT_FILTER_ALL:
         return true;
         
      case LOT_FILTER_MICRO:
         if(volume < 0.01 || volume >= 0.10)
         {
            Print("Filtered out: ", volume, " lots is not a micro lot (0.01-0.09)");
            return false;
         }
         return true;
         
      case LOT_FILTER_MINI:
         if(volume < 0.10 || volume >= 1.0)
         {
            Print("Filtered out: ", volume, " lots is not a mini lot (0.10-0.99)");
            return false;
         }
         return true;
         
      case LOT_FILTER_STANDARD:
         if(volume < 1.0)
         {
            Print("Filtered out: ", volume, " lots is not a standard lot (1.0+)");
            return false;
         }
         return true;
         
      case LOT_FILTER_SMALL:
         if(volume >= 0.5)
         {
            Print("Filtered out: ", volume, " lots is not a small trade (under 0.5)");
            return false;
         }
         return true;
         
      case LOT_FILTER_LARGE:
         if(volume < 0.5)
         {
            Print("Filtered out: ", volume, " lots is not a large trade (0.5+)");
            return false;
         }
         return true;
         
      case LOT_FILTER_CUSTOM:
         if(CustomMinLots > 0 && volume < CustomMinLots)
         {
            Print("Filtered out: ", volume, " lots below custom minimum ", CustomMinLots);
            return false;
         }
         if(CustomMaxLots > 0 && volume > CustomMaxLots)
         {
            Print("Filtered out: ", volume, " lots above custom maximum ", CustomMaxLots);
            return false;
         }
         return true;
   }
   
   return true;
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
            string symbol = PositionGetString(POSITION_SYMBOL);
            long magic = PositionGetInteger(POSITION_MAGIC);
            long posType = PositionGetInteger(POSITION_TYPE);
            double volume = PositionGetDouble(POSITION_VOLUME);
            
            if(PassesFilters(symbol, magic, posType, volume))
            {
               SendSignal("OPEN");
            }
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
   
   StringToCharArray(jsonPayload, postData, 0, StringLen(jsonPayload));
   ArrayResize(postData, StringLen(jsonPayload));
   
   headers = "Content-Type: application/json\r\n";
   if(StringLen(APIKey) > 0)
   {
      headers += "X-API-Key: " + APIKey + "\r\n";
   }
   
   ResetLastError();
   
   int timeout = 5000;
   int res = WebRequest(
      "POST",
      WebhookURL,
      headers,
      timeout,
      postData,
      result,
      resultHeaders
   );
   
   if(res == -1)
   {
      int error = GetLastError();
      Print("WebRequest error: ", error);
      
      if(error == 4060)
      {
         Print("ERROR: WebRequest not allowed for URL: ", WebhookURL);
         Print("Please add this URL to Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL");
      }
      
      return false;
   }
   
   string response = CharArrayToString(result);
   Print("Response (", res, "): ", response);
   
   return (res >= 200 && res < 300);
}
//+------------------------------------------------------------------+
