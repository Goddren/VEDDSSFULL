import { ChartAnalysisResponse } from "@shared/types";

interface TimeframeAnalysisData {
  timeframe: string;
  analysis: ChartAnalysisResponse;
}

interface EAConfig {
  strategyType?: string;
  eaName?: string;
  tradeDuration?: string;
  validityDays?: number;
  chartDate?: string;
  useTrailingStop?: boolean;
  trailingStopDistance?: number;
  trailingStopStep?: number;
  multiTradeStrategy?: 'single' | 'pyramiding' | 'grid' | 'hedging';
  maxSimultaneousTrades?: number;
  pyramidingRatio?: number;
}

/**
 * Generate MT5 EA (Expert Advisor) code based on multi-timeframe analysis
 */
export function generateMT5EACode(
  symbol: string,
  timeframes: TimeframeAnalysisData[],
  config?: EAConfig
): string {
  const eaName = config?.eaName || 'Multi-Timeframe Strategy';
  const strategyType = config?.strategyType || 'day_trading';
  const tradeDuration = config?.tradeDuration || 'Variable';
  const validityDays = config?.validityDays || 30;
  const chartDate = config?.chartDate || new Date().toISOString().split('T')[0];
  const useTrailingStop = config?.useTrailingStop !== false;
  const trailingStopDistance = config?.trailingStopDistance || 50;
  const trailingStopStep = config?.trailingStopStep || 10;
  const multiTradeStrategy = config?.multiTradeStrategy || 'single';
  const maxSimultaneousTrades = config?.maxSimultaneousTrades || 1;
  const pyramidingRatio = config?.pyramidingRatio || 0.5;
  
  // Calculate validity date
  const chartDateObj = new Date(chartDate);
  const validityDate = new Date(chartDateObj);
  validityDate.setDate(validityDate.getDate() + validityDays);
  const validityDateStr = validityDate.toISOString().split('T')[0];
  
  // Validate input
  if (!timeframes || timeframes.length === 0) {
    throw new Error('At least one timeframe analysis is required to generate EA code');
  }

  // Sort timeframes from smallest to largest
  const sortedTimeframes = [...timeframes].sort((a, b) => {
    const order = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
    return order.indexOf(a.timeframe) - order.indexOf(b.timeframe);
  });

  const primaryTF = sortedTimeframes[0];
  const higherTFs = sortedTimeframes.slice(1);

  // Extract entry conditions from analyses
  const buyConditions: string[] = [];
  const sellConditions: string[] = [];

  sortedTimeframes.forEach((tf, index) => {
    const tfSafe = tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_'); // Safe variable name
    const isBuy = tf.analysis.direction?.toUpperCase() === 'BUY';
    const isSell = tf.analysis.direction?.toUpperCase() === 'SELL';

    if (isBuy) {
      buyConditions.push(`tf_${tfSafe}_trend_bullish`);
    }
    if (isSell) {
      sellConditions.push(`tf_${tfSafe}_trend_bearish`);
    }
  });

  // Get ATR-based stop loss if available - ensure they're valid strings
  const atrStopLossRaw = primaryTF.analysis.atrStopLoss?.recommended || primaryTF.analysis.stopLoss;
  const atrStopLoss = typeof atrStopLossRaw === 'string' ? atrStopLossRaw : String(atrStopLossRaw || 'Unknown');
  const takeProfitRaw = primaryTF.analysis.takeProfit;
  const takeProfit = typeof takeProfitRaw === 'string' ? takeProfitRaw : String(takeProfitRaw || 'Unknown');
  
  // Extract patterns and indicators from analysis - ensure they're valid strings
  const detectedPatterns = sortedTimeframes
    .flatMap(tf => tf.analysis.patterns || [])
    .map(p => typeof p === 'string' ? p : (p && typeof p.name === 'string' ? p.name : null))
    .filter((p): p is string => typeof p === 'string' && p.length > 0) // only valid strings
    .filter((v, i, a) => a.indexOf(v) === i) // unique patterns
    .join(', ');
  
  const detectedIndicators = sortedTimeframes
    .flatMap(tf => tf.analysis.indicators || [])
    .map(ind => typeof ind === 'string' ? ind : (ind && typeof ind.name === 'string' ? ind.name : null))
    .filter((ind): ind is string => typeof ind === 'string' && ind.length > 0) // only valid strings
    .filter((v, i, a) => a.indexOf(v) === i) // unique indicators
    .join(', ');
  
  // Get consensus direction
  const buyCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'BUY').length;
  const sellCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'SELL').length;
  const consensusDirection = buyCount > sellCount ? 'BUY' : sellCount > buyCount ? 'SELL' : 'NEUTRAL';
  const consensusConfidence = Math.max(buyCount, sellCount) / sortedTimeframes.length * 100;
  
  // Parse ATR multiplier as number
  const atrMultiplierValue = primaryTF.analysis.atrStopLoss?.multiplier || 1.5;
  const atrMultiplierNum = typeof atrMultiplierValue === 'number' ? atrMultiplierValue : parseFloat(String(atrMultiplierValue)) || 1.5;

  // Extract support/resistance levels
  const supportLevels = primaryTF.analysis.supportResistance?.filter((sr: any) => sr.type === 'Support') || [];
  const resistanceLevels = primaryTF.analysis.supportResistance?.filter((sr: any) => sr.type === 'Resistance') || [];
  const nearestSupport = supportLevels.length > 0 ? supportLevels[0].level : 'N/A';
  const nearestResistance = resistanceLevels.length > 0 ? resistanceLevels[0].level : 'N/A';

  // Map strategy type to trading style
  const strategyLabel = {
    'scalping': 'Scalping Strategy',
    'day_trading': 'Day Trading Strategy',
    'swing_trading': 'Swing Trading Strategy',
    'position_trading': 'Position Trading Strategy'
  }[strategyType] || 'Multi-Timeframe Strategy';

  const code = `//+------------------------------------------------------------------+
//|                                              ${eaName}.mq5 |
//|                        Generated by VEDD Chart Analysis Tool    |
//|                                             https://vedd.io     |
//+------------------------------------------------------------------+

//--- ENUMERATIONS (Must be declared FIRST, before any other code)
enum ENUM_MULTI_TRADE_MODE
{
   MODE_SINGLE,        // Single trade only
   MODE_PYRAMIDING,    // Add to winning positions
   MODE_GRID,          // Multiple trades at grid levels
   MODE_HEDGING        // Allow opposite positions
};

#property copyright "Generated by VEDD"
#property link      "https://vedd.io"
#property version   "1.00"
#property description "${eaName}"
#property description "${strategyLabel}"

//========================================================================
// STRATEGY CONFIGURATION
//========================================================================
// Strategy Type: ${strategyLabel}
// Expected Trade Duration: ${tradeDuration}
// Symbol: ${symbol}
// Timeframes analyzed: ${sortedTimeframes.map(tf => tf.timeframe).join(', ')}
//
// EA VALIDITY INFORMATION
//========================================================================
// Chart Analysis Date: ${chartDate}
// EA Valid Until: ${validityDateStr} (${validityDays} days from analysis)
// ⚠️  IMPORTANT: After this date, re-analyze the chart and generate a new EA
//    Market conditions change, and old analysis may become invalid.
//
// AI ANALYSIS SUMMARY
//========================================================================
// Detected Patterns: ${detectedPatterns || 'None specified'}
// Key Indicators: ${detectedIndicators || 'RSI, MACD, Volume'}
// Consensus Direction: ${consensusDirection} (${consensusConfidence.toFixed(0)}% agreement)
// Entry Point: ${primaryTF.analysis.entryPoint || 'Market'}
// Support Level: ${nearestSupport}
// Resistance Level: ${nearestResistance}
// Stop Loss (AI): ${atrStopLoss}
// Take Profit (AI): ${takeProfit}
// Risk/Reward Ratio: ${primaryTF.analysis.riskRewardRatio || '1:2'}
//========================================================================

//--- CUSTOMIZABLE INPUT PARAMETERS
//--- Risk Management
input group "=== Risk Management ==="
input double LotSize = 0.01;                    // Position size (lots)
input bool UseATR_StopLoss = true;              // Use ATR-based stop loss
input double ATR_Multiplier = ${atrMultiplierNum.toFixed(2)};              // ATR multiplier for SL (from AI analysis)
input double RiskRewardRatio = 2.0;             // Risk-reward ratio for TP
input double MaxRiskPercent = 2.0;              // Max risk per trade (% of account)
input double StopLossPips = 50;                 // Fixed SL in pips (if not using ATR)
input double TakeProfitPips = 100;              // Fixed TP in pips (if not using ATR)

//--- Trailing Stop (Profit Protection)
input group "=== Trailing Stop - Lock in Profits ==="
input bool UseTrailingStop = ${useTrailingStop ? 'true' : 'false'};              // Enable trailing stop when in profit
input double TrailingStopDistance = ${trailingStopDistance};       // Distance from current price (pips)
input double TrailingStopStep = ${trailingStopStep};               // Minimum price movement to trail (pips)
input double MinProfitToActivate = 20;          // Min profit (pips) before trailing activates

//--- Technical Indicators
input group "=== Technical Indicators ==="
input int RSI_Period = 14;                      // RSI period
input int RSI_Overbought = 70;                  // RSI overbought threshold
input int RSI_Oversold = 30;                    // RSI oversold threshold
input int MACD_FastEMA = 12;                    // MACD fast EMA period
input int MACD_SlowEMA = 26;                    // MACD slow EMA period
input int MACD_SignalSMA = 9;                   // MACD signal SMA period
input int ATR_Period = 14;                      // ATR period
input int Volume_MA_Period = 20;                // Volume moving average period

//--- Trading Rules
input group "=== Trading Rules ==="
input bool AllowBuyTrades = true;               // Allow BUY trades
input bool AllowSellTrades = true;              // Allow SELL trades
input bool UseVolumeFilter = true;              // Require volume confirmation
input bool UseMultiTimeframeConfirmation = ${sortedTimeframes.length > 1 ? 'true' : 'false'};  // Require multi-timeframe agreement
input int MinTimeframesAgree = ${Math.max(1, Math.floor(sortedTimeframes.length / 2))};                     // Minimum timeframes that must agree
input int MaxOpenTrades = ${maxSimultaneousTrades};                    // Maximum concurrent trades
input int MagicNumber = ${Math.floor(Math.random() * 90000) + 10000};                     // Unique identifier for this EA

//--- Multiple Trade Strategy
input group "=== Multi-Trade Strategy ==="
input ENUM_MULTI_TRADE_MODE MultiTradeMode = ${multiTradeStrategy === 'pyramiding' ? 'MODE_PYRAMIDING' : multiTradeStrategy === 'grid' ? 'MODE_GRID' : multiTradeStrategy === 'hedging' ? 'MODE_HEDGING' : 'MODE_SINGLE'};    // Trading mode
input double PyramidingRatio = ${pyramidingRatio.toFixed(2)};          // Lot multiplier for pyramiding (e.g., 0.5 = half size)
input double GridStepPips = 50;                 // Distance between grid levels (pips)
input bool AllowHedging = ${multiTradeStrategy === 'hedging' ? 'true' : 'false'};                  // Allow simultaneous BUY/SELL positions

//--- Global variables
int rsi_handle, macd_handle, atr_handle;
double rsi_buffer[], macd_main[], macd_signal[], atr_buffer[];
double last_buy_price = 0;    // Track last buy entry for pyramiding
double last_sell_price = 0;   // Track last sell entry for pyramiding

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   //--- Initialize indicators
   rsi_handle = iRSI(_Symbol, PERIOD_CURRENT, RSI_Period, PRICE_CLOSE);
   macd_handle = iMACD(_Symbol, PERIOD_CURRENT, MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, PRICE_CLOSE);
   atr_handle = iATR(_Symbol, PERIOD_CURRENT, 14);
   
   if(rsi_handle == INVALID_HANDLE || macd_handle == INVALID_HANDLE || atr_handle == INVALID_HANDLE)
   {
      Print("Error creating indicators");
      return(INIT_FAILED);
   }
   
   ArraySetAsSeries(rsi_buffer, true);
   ArraySetAsSeries(macd_main, true);
   ArraySetAsSeries(macd_signal, true);
   ArraySetAsSeries(atr_buffer, true);
   
   Print("======================================");
   Print("Multi-Timeframe EA initialized for ${symbol}");
   Print("Analyzing timeframes: ${sortedTimeframes.map(tf => tf.timeframe).join(', ')}");
   Print("AI Detected Patterns: ${detectedPatterns || 'None'}");
   Print("Consensus Direction: ${consensusDirection} (${consensusConfidence.toFixed(0)}%)");
   Print("ATR Stop Loss: ${atrStopLoss}");
   Print("Take Profit Target: ${takeProfit}");
   Print("======================================");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   IndicatorRelease(rsi_handle);
   IndicatorRelease(macd_handle);
   IndicatorRelease(atr_handle);
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   //--- Manage trailing stop for existing positions (every tick)
   if(UseTrailingStop)
      ManageTrailingStop();
   
   //--- Check if a new bar has formed
   static datetime last_bar_time = 0;
   datetime current_bar_time = iTime(_Symbol, PERIOD_CURRENT, 0);
   
   if(current_bar_time == last_bar_time)
      return;
   
   last_bar_time = current_bar_time;
   
   //--- Copy indicator values
   if(CopyBuffer(rsi_handle, 0, 0, 3, rsi_buffer) <= 0) return;
   if(CopyBuffer(macd_handle, 0, 0, 3, macd_main) <= 0) return;
   if(CopyBuffer(macd_handle, 1, 0, 3, macd_signal) <= 0) return;
   if(CopyBuffer(atr_handle, 0, 0, 3, atr_buffer) <= 0) return;
   
   //--- Check multi-timeframe conditions
   bool tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bullish = CheckBullishCondition();
   bool tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bearish = CheckBearishCondition();
   
${higherTFs.map(tf => `   bool tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bullish = CheckHigherTimeframeTrend("${tf.timeframe}", true);
   bool tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bearish = CheckHigherTimeframeTrend("${tf.timeframe}", false);`).join('\n')}
   
   //--- Entry conditions based on multi-timeframe analysis
   bool buy_signal = ${buyConditions.length > 0 ? '(' + buyConditions.join(' && ') + ')' : 'false'};  // ${buyCount} timeframe(s) suggest BUY
   bool sell_signal = ${sellConditions.length > 0 ? '(' + sellConditions.join(' && ') + ')' : 'false'};  // ${sellCount} timeframe(s) suggest SELL
   
   //--- Volume confirmation
   bool volume_confirmed = CheckVolumeConfirmation();
   
   //--- Count existing positions
   int buy_positions = CountPositions(POSITION_TYPE_BUY);
   int sell_positions = CountPositions(POSITION_TYPE_SELL);
   int total_positions = buy_positions + sell_positions;
   
   //--- Execute trades based on multi-trade strategy
   if(buy_signal && volume_confirmed && AllowBuyTrades)
   {
      bool can_open = false;
      double lot_size = LotSize;
      
      switch(MultiTradeMode)
      {
         case MODE_SINGLE:
            can_open = (total_positions == 0);
            break;
            
         case MODE_PYRAMIDING:
            can_open = (buy_positions > 0 && buy_positions < MaxOpenTrades) && CheckPyramidingConditions(true);
            lot_size = buy_positions == 0 ? LotSize : LotSize * PyramidingRatio;
            break;
            
         case MODE_GRID:
            can_open = (buy_positions < MaxOpenTrades) && CheckGridConditions(true);
            break;
            
         case MODE_HEDGING:
            can_open = (total_positions < MaxOpenTrades) && AllowHedging;
            break;
      }
      
      if(can_open || buy_positions == 0)
      {
         double sl = UseATR_StopLoss ? CalculateATR_StopLoss(true) : 0;
         double tp = UseATR_StopLoss ? CalculateATR_TakeProfit(true) : 0;
         OpenBuyPosition(sl, tp, lot_size);
      }
   }
   else if(sell_signal && volume_confirmed && AllowSellTrades)
   {
      bool can_open = false;
      double lot_size = LotSize;
      
      switch(MultiTradeMode)
      {
         case MODE_SINGLE:
            can_open = (total_positions == 0);
            break;
            
         case MODE_PYRAMIDING:
            can_open = (sell_positions > 0 && sell_positions < MaxOpenTrades) && CheckPyramidingConditions(false);
            lot_size = sell_positions == 0 ? LotSize : LotSize * PyramidingRatio;
            break;
            
         case MODE_GRID:
            can_open = (sell_positions < MaxOpenTrades) && CheckGridConditions(false);
            break;
            
         case MODE_HEDGING:
            can_open = (total_positions < MaxOpenTrades) && AllowHedging;
            break;
      }
      
      if(can_open || sell_positions == 0)
      {
         double sl = UseATR_StopLoss ? CalculateATR_StopLoss(false) : 0;
         double tp = UseATR_StopLoss ? CalculateATR_TakeProfit(false) : 0;
         OpenSellPosition(sl, tp, lot_size);
      }
   }
}

//+------------------------------------------------------------------+
//| Check bullish condition on current timeframe                     |
//+------------------------------------------------------------------+
bool CheckBullishCondition()
{
   //--- RSI oversold
   if(rsi_buffer[0] < RSI_Oversold)
      return false;
   
   //--- MACD bullish crossover
   bool macd_bullish = macd_main[0] > macd_signal[0] && macd_main[1] <= macd_signal[1];
   
   //--- Volume increasing (simplified check)
   bool volume_ok = true; // Implement volume check if available
   
   return macd_bullish && volume_ok;
}

//+------------------------------------------------------------------+
//| Check bearish condition on current timeframe                     |
//+------------------------------------------------------------------+
bool CheckBearishCondition()
{
   //--- RSI overbought
   if(rsi_buffer[0] > RSI_Overbought)
      return true;
   
   //--- MACD bearish crossover
   bool macd_bearish = macd_main[0] < macd_signal[0] && macd_main[1] >= macd_signal[1];
   
   return macd_bearish;
}

//+------------------------------------------------------------------+
//| Check higher timeframe trend                                     |
//+------------------------------------------------------------------+
bool CheckHigherTimeframeTrend(string timeframe, bool check_bullish)
{
   ENUM_TIMEFRAMES tf = StringToTimeframe(timeframe);
   int htf_macd = iMACD(_Symbol, tf, MACD_FastEMA, MACD_SlowEMA, MACD_SignalSMA, PRICE_CLOSE);
   double htf_macd_main[], htf_macd_signal[];
   
   ArraySetAsSeries(htf_macd_main, true);
   ArraySetAsSeries(htf_macd_signal, true);
   
   if(CopyBuffer(htf_macd, 0, 0, 2, htf_macd_main) <= 0) return false;
   if(CopyBuffer(htf_macd, 1, 0, 2, htf_macd_signal) <= 0) return false;
   
   IndicatorRelease(htf_macd);
   
   if(check_bullish)
      return htf_macd_main[0] > htf_macd_signal[0];
   else
      return htf_macd_main[0] < htf_macd_signal[0];
}

//+------------------------------------------------------------------+
//| Check volume confirmation                                        |
//+------------------------------------------------------------------+
bool CheckVolumeConfirmation()
{
   long volume[];
   ArraySetAsSeries(volume, true);
   
   if(CopyTickVolume(_Symbol, PERIOD_CURRENT, 0, 3, volume) <= 0)
      return true; // Default to true if volume data unavailable
   
   //--- Current volume should be higher than average of last 2 bars
   return volume[0] > (volume[1] + volume[2]) / 2;
}

//+------------------------------------------------------------------+
//| Calculate ATR-based stop loss                                    |
//+------------------------------------------------------------------+
double CalculateATR_StopLoss(bool is_buy)
{
   double atr = atr_buffer[0];
   double current_price = is_buy ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double stop_distance = atr * ATR_Multiplier;
   
   if(is_buy)
      return NormalizeDouble(current_price - stop_distance, _Digits);
   else
      return NormalizeDouble(current_price + stop_distance, _Digits);
}

//+------------------------------------------------------------------+
//| Calculate ATR-based take profit                                  |
//+------------------------------------------------------------------+
double CalculateATR_TakeProfit(bool is_buy)
{
   double atr = atr_buffer[0];
   double current_price = is_buy ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double profit_distance = atr * ATR_Multiplier * 2; // 2:1 risk-reward
   
   if(is_buy)
      return NormalizeDouble(current_price + profit_distance, _Digits);
   else
      return NormalizeDouble(current_price - profit_distance, _Digits);
}

//+------------------------------------------------------------------+
//| Manage trailing stop for all open positions                      |
//+------------------------------------------------------------------+
void ManageTrailingStop()
{
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      ulong ticket = PositionGetTicket(i);
      if(ticket <= 0) continue;
      
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      
      ENUM_POSITION_TYPE pos_type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      double open_price = PositionGetDouble(POSITION_PRICE_OPEN);
      double current_sl = PositionGetDouble(POSITION_SL);
      double current_price = pos_type == POSITION_TYPE_BUY ? SymbolInfoDouble(_Symbol, SYMBOL_BID) : SymbolInfoDouble(_Symbol, SYMBOL_ASK);
      
      double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
      double trailing_distance = TrailingStopDistance * point;
      double trailing_step = TrailingStopStep * point;
      
      //--- Calculate profit in pips
      double profit_pips = 0;
      if(pos_type == POSITION_TYPE_BUY)
         profit_pips = (current_price - open_price) / point;
      else
         profit_pips = (open_price - current_price) / point;
      
      //--- Only activate trailing stop if profit exceeds minimum threshold
      if(profit_pips < MinProfitToActivate)
         continue;
      
      //--- Calculate new stop loss
      double new_sl = 0;
      if(pos_type == POSITION_TYPE_BUY)
      {
         new_sl = current_price - trailing_distance;
         
         //--- Only move SL if it's better than current and moves by step
         if(new_sl > current_sl && (current_sl == 0 || new_sl - current_sl >= trailing_step))
         {
            MqlTradeRequest request = {};
            MqlTradeResult result = {};
            
            request.action = TRADE_ACTION_SLTP;
            request.position = ticket;
            request.sl = NormalizeDouble(new_sl, _Digits);
            request.tp = PositionGetDouble(POSITION_TP);
            
            if(OrderSend(request, result))
               Print("Trailing stop updated for BUY #", ticket, " New SL: ", new_sl);
         }
      }
      else  // SELL position
      {
         new_sl = current_price + trailing_distance;
         
         //--- Only move SL if it's better than current and moves by step
         if(new_sl < current_sl || current_sl == 0)
         {
            if(current_sl == 0 || current_sl - new_sl >= trailing_step)
            {
               MqlTradeRequest request = {};
               MqlTradeResult result = {};
               
               request.action = TRADE_ACTION_SLTP;
               request.position = ticket;
               request.sl = NormalizeDouble(new_sl, _Digits);
               request.tp = PositionGetDouble(POSITION_TP);
               
               if(OrderSend(request, result))
                  Print("Trailing stop updated for SELL #", ticket, " New SL: ", new_sl);
            }
         }
      }
   }
}

//+------------------------------------------------------------------+
//| Count positions by type                                          |
//+------------------------------------------------------------------+
int CountPositions(ENUM_POSITION_TYPE pos_type)
{
   int count = 0;
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      if((ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE) == pos_type)
         count++;
   }
   return count;
}

//+------------------------------------------------------------------+
//| Check if pyramiding conditions are met                           |
//+------------------------------------------------------------------+
bool CheckPyramidingConditions(bool is_buy)
{
   //--- Get most recent position
   for(int i = PositionsTotal() - 1; i >= 0; i--)
   {
      if(PositionGetTicket(i) <= 0) continue;
      if(PositionGetString(POSITION_SYMBOL) != _Symbol) continue;
      if(PositionGetInteger(POSITION_MAGIC) != MagicNumber) continue;
      
      ENUM_POSITION_TYPE pos_type = (ENUM_POSITION_TYPE)PositionGetInteger(POSITION_TYPE);
      
      if((is_buy && pos_type == POSITION_TYPE_BUY) || (!is_buy && pos_type == POSITION_TYPE_SELL))
      {
         double profit = PositionGetDouble(POSITION_PROFIT);
         //--- Only add to winning positions
         return profit > 0;
      }
   }
   return false;
}

//+------------------------------------------------------------------+
//| Check if grid conditions are met                                 |
//+------------------------------------------------------------------+
bool CheckGridConditions(bool is_buy)
{
   double current_price = is_buy ? SymbolInfoDouble(_Symbol, SYMBOL_ASK) : SymbolInfoDouble(_Symbol, SYMBOL_BID);
   double point = SymbolInfoDouble(_Symbol, SYMBOL_POINT);
   double grid_distance = GridStepPips * point;
   
   //--- Check distance from last position
   double last_position_price = is_buy ? last_buy_price : last_sell_price;
   
   if(last_position_price == 0)
      return true;  // First position
   
   double distance = MathAbs(current_price - last_position_price);
   return distance >= grid_distance;
}

//+------------------------------------------------------------------+
//| Open buy position                                                |
//+------------------------------------------------------------------+
void OpenBuyPosition(double sl, double tp, double lot_size = 0)
{
   if(lot_size == 0)
      lot_size = LotSize;
      
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   double price = SymbolInfoDouble(_Symbol, SYMBOL_ASK);
   
   request.action = TRADE_ACTION_DEAL;
   request.symbol = _Symbol;
   request.volume = lot_size;
   request.type = ORDER_TYPE_BUY;
   request.price = price;
   request.sl = sl;
   request.tp = tp;
   request.deviation = 10;
   request.magic = 123456;
   request.comment = "Multi-TF EA Buy";
   
   if(OrderSend(request, result))
   {
      Print("Buy order opened successfully at ", price, " with lot size: ", lot_size);
      last_buy_price = price;  // Track for grid/pyramiding
   }
   else
      Print("Error opening buy order: ", GetLastError());
}

//+------------------------------------------------------------------+
//| Open sell position                                               |
//+------------------------------------------------------------------+
void OpenSellPosition(double sl, double tp, double lot_size = 0)
{
   if(lot_size == 0)
      lot_size = LotSize;
      
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   double price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   
   request.action = TRADE_ACTION_DEAL;
   request.symbol = _Symbol;
   request.volume = lot_size;
   request.type = ORDER_TYPE_SELL;
   request.price = price;
   request.sl = sl;
   request.tp = tp;
   request.deviation = 10;
   request.magic = 123456;
   request.comment = "Multi-TF EA Sell";
   
   if(OrderSend(request, result))
   {
      Print("Sell order opened successfully at ", price, " with lot size: ", lot_size);
      last_sell_price = price;  // Track for grid/pyramiding
   }
   else
      Print("Error opening sell order: ", GetLastError());
}

//+------------------------------------------------------------------+
//| Convert string to timeframe enum                                 |
//+------------------------------------------------------------------+
ENUM_TIMEFRAMES StringToTimeframe(string tf)
{
   if(tf == "M1") return PERIOD_M1;
   if(tf == "M5") return PERIOD_M5;
   if(tf == "M15") return PERIOD_M15;
   if(tf == "M30") return PERIOD_M30;
   if(tf == "H1") return PERIOD_H1;
   if(tf == "H4") return PERIOD_H4;
   if(tf == "D1") return PERIOD_D1;
   if(tf == "W1") return PERIOD_W1;
   return PERIOD_CURRENT;
}
//+------------------------------------------------------------------+
`;

  return code;
}

/**
 * Generate TradingView Pine Script code based on multi-timeframe analysis
 */
export function generateTradingViewCode(
  symbol: string,
  timeframes: TimeframeAnalysisData[],
  config?: EAConfig
): string {
  const eaName = config?.eaName || 'Multi-Timeframe Strategy';
  const strategyType = config?.strategyType || 'day_trading';
  const tradeDuration = config?.tradeDuration || 'Variable';
  const validityDays = config?.validityDays || 30;
  const chartDate = config?.chartDate || new Date().toISOString().split('T')[0];
  const useTrailingStop = config?.useTrailingStop !== false;
  const trailingStopDistance = config?.trailingStopDistance || 50;
  const trailingStopStep = config?.trailingStopStep || 10;
  const multiTradeStrategy = config?.multiTradeStrategy || 'single';
  const maxSimultaneousTrades = config?.maxSimultaneousTrades || 1;
  const pyramidingRatio = config?.pyramidingRatio || 0.5;
  
  // Calculate validity date
  const chartDateObj = new Date(chartDate);
  const validityDate = new Date(chartDateObj);
  validityDate.setDate(validityDate.getDate() + validityDays);
  const validityDateStr = validityDate.toISOString().split('T')[0];

  const sortedTimeframes = [...timeframes].sort((a, b) => {
    const order = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
    return order.indexOf(a.timeframe) - order.indexOf(b.timeframe);
  });

  const primaryTF = sortedTimeframes[0];
  const atrStopLoss = primaryTF.analysis.atrStopLoss?.atrValue || "0.0010";
  const atrMultiplierValue = primaryTF.analysis.atrStopLoss?.multiplier || 1.5;
  const atrMultiplierNum = typeof atrMultiplierValue === 'number' ? atrMultiplierValue : parseFloat(String(atrMultiplierValue)) || 1.5;
  
  // Extract support/resistance levels
  const supportLevels = primaryTF.analysis.supportResistance?.filter((sr: any) => sr.type === 'Support') || [];
  const resistanceLevels = primaryTF.analysis.supportResistance?.filter((sr: any) => sr.type === 'Resistance') || [];
  const nearestSupport = supportLevels.length > 0 ? supportLevels[0].level : 'N/A';
  const nearestResistance = resistanceLevels.length > 0 ? resistanceLevels[0].level : 'N/A';

  // Map strategy type to trading style
  const strategyLabel = {
    'scalping': 'Scalping Strategy',
    'day_trading': 'Day Trading Strategy',
    'swing_trading': 'Swing Trading Strategy',
    'position_trading': 'Position Trading Strategy'
  }[strategyType] || 'Multi-Timeframe Strategy';
  
  // Extract patterns and indicators from analysis - ensure they're valid strings
  const detectedPatterns = sortedTimeframes
    .flatMap(tf => tf.analysis.patterns || [])
    .map(p => typeof p === 'string' ? p : (p && typeof p.name === 'string' ? p.name : null))
    .filter((p): p is string => typeof p === 'string' && p.length > 0) // only valid strings
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
  
  const detectedIndicators = sortedTimeframes
    .flatMap(tf => tf.analysis.indicators || [])
    .map(ind => typeof ind === 'string' ? ind : (ind && typeof ind.name === 'string' ? ind.name : null))
    .filter((ind): ind is string => typeof ind === 'string' && ind.length > 0) // only valid strings
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');
  
  // Get consensus
  const buyCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'BUY').length;
  const sellCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'SELL').length;
  const consensusDirection = buyCount > sellCount ? 'BUY' : sellCount > buyCount ? 'SELL' : 'NEUTRAL';
  const consensusConfidence = Math.max(buyCount, sellCount) / sortedTimeframes.length * 100;
  
  const entryPoint = primaryTF.analysis.entryPoint || 'Market';
  const stopLossRaw = primaryTF.analysis.atrStopLoss?.recommended || primaryTF.analysis.stopLoss;
  const stopLoss = typeof stopLossRaw === 'string' ? stopLossRaw : String(stopLossRaw || 'Not specified');
  const takeProfitRaw = primaryTF.analysis.takeProfit;
  const takeProfit = typeof takeProfitRaw === 'string' ? takeProfitRaw : String(takeProfitRaw || 'Not specified');
  const riskReward = primaryTF.analysis.riskRewardRatio || '2:1';

  const code = `//@version=5
strategy("${eaName} - ${symbol}", overlay=true, default_qty_type=strategy.percent_of_equity, default_qty_value=10, process_orders_on_close=true, pyramiding=${maxSimultaneousTrades})

// ========================================================================
// GENERATED BY VEDD CHART ANALYSIS TOOL
// https://vedd.io
// 
// STRATEGY CONFIGURATION
// ========================================================================
// Strategy Type: ${strategyLabel}
// Expected Trade Duration: ${tradeDuration}
// Symbol: ${symbol}
// Timeframes Analyzed: ${sortedTimeframes.map(tf => tf.timeframe).join(', ')}
//
// EA VALIDITY INFORMATION
// ========================================================================
// Chart Analysis Date: ${chartDate}
// EA Valid Until: ${validityDateStr} (${validityDays} days from analysis)
// ⚠️  IMPORTANT: After this date, re-analyze the chart and generate a new strategy
//    Market conditions change, and old analysis may become invalid.
//
// AI ANALYSIS SUMMARY
// ========================================================================
// Detected Patterns: ${detectedPatterns || 'None specified'}
// Key Indicators: ${detectedIndicators || 'RSI, MACD, Volume, ATR'}
// Consensus Direction: ${consensusDirection} (${consensusConfidence.toFixed(0)}% agreement)
// Entry Point: ${entryPoint}
// Support Level: ${nearestSupport}
// Resistance Level: ${nearestResistance}
// Stop Loss (AI): ${stopLoss}
// Take Profit (AI): ${takeProfit}
// Risk:Reward Ratio: ${riskReward}
// ========================================================================

// === RISK MANAGEMENT ===
lot_size = input.float(0.01, "Position Size (Lots)", minval=0.01, step=0.01, group="Risk Management")
use_atr_sl = input.bool(true, "Use ATR-based Stop Loss", group="Risk Management", tooltip="AI recommends ATR-based stops for dynamic risk management")
atr_multiplier = input.float(${atrMultiplierNum.toFixed(2)}, "ATR Multiplier for SL", minval=0.5, step=0.1, group="Risk Management", tooltip="From AI analysis")
risk_reward_ratio = input.float(2.0, "Risk:Reward Ratio", minval=1.0, step=0.5, group="Risk Management")
max_risk_percent = input.float(2.0, "Max Risk per Trade (%)", minval=0.5, maxval=10.0, step=0.5, group="Risk Management")

// === TRAILING STOP (Profit Protection) ===
use_trailing_stop = input.bool(${useTrailingStop}, "Enable Trailing Stop", group="Trailing Stop", tooltip="Lock in profits as price moves in your favor")
trailing_stop_pips = input.float(${trailingStopDistance}, "Trailing Distance (pips)", minval=10, step=5, group="Trailing Stop")
min_profit_activate = input.float(${trailingStopStep}, "Min Profit to Activate (pips)", minval=5, step=5, group="Trailing Stop")

// === MULTI-TRADE STRATEGY ===
multi_trade_mode = input.string("${multiTradeStrategy}", "Strategy Mode", options=["single", "pyramiding", "grid", "hedging"], group="Multi-Trade Strategy", tooltip="Note: Pine Script handles pyramiding via built-in strategy settings")
max_open_trades = input.int(${maxSimultaneousTrades}, "Max Simultaneous Trades", minval=1, maxval=10, group="Multi-Trade Strategy")
pyramiding_ratio = input.float(${pyramidingRatio}, "Pyramiding Lot Multiplier", minval=0.1, maxval=2.0, step=0.1, group="Multi-Trade Strategy", tooltip="For pyramiding mode: lot size multiplier for additional positions")

// === TECHNICAL INDICATORS ===
rsi_period = input.int(14, "RSI Period", minval=1, group="Technical Indicators")
rsi_overbought = input.int(70, "RSI Overbought Level", minval=50, maxval=100, group="Technical Indicators")
rsi_oversold = input.int(30, "RSI Oversold Level", minval=0, maxval=50, group="Technical Indicators")
macd_fast = input.int(12, "MACD Fast EMA", minval=1, group="Technical Indicators")
macd_slow = input.int(26, "MACD Slow EMA", minval=1, group="Technical Indicators")
macd_signal = input.int(9, "MACD Signal SMA", minval=1, group="Technical Indicators")
atr_period = input.int(14, "ATR Period", minval=1, group="Technical Indicators")
volume_ma_period = input.int(20, "Volume MA Period", minval=1, group="Technical Indicators")

// === TRADING RULES ===
allow_buy = input.bool(true, "Allow BUY Trades", group="Trading Rules")
allow_sell = input.bool(true, "Allow SELL Trades", group="Trading Rules")
use_volume_filter = input.bool(true, "Require Volume Confirmation", group="Trading Rules")
min_timeframes_agree = input.int(${Math.max(1, Math.floor(sortedTimeframes.length / 2))}, "Min Timeframes Agreement", minval=1, maxval=${sortedTimeframes.length}, group="Trading Rules")

// Indicator Calculations
rsi = ta.rsi(close, rsi_period)
[macd_line, signal_line, _] = ta.macd(close, macd_fast, macd_slow, macd_signal)
atr = ta.atr(atr_period)
volume_ma = ta.sma(volume, volume_ma_period)

// Multi-Timeframe Analysis
${sortedTimeframes.map((tf, index) => {
  // Proper Pine Script timeframe mapping
  const tfPineMap: Record<string, string> = {
    'M1': '1', 'M5': '5', 'M15': '15', 'M30': '30',
    'H1': '60', 'H4': '240',
    'D1': 'D', 'W1': 'W'
  };
  const tfPine = tfPineMap[tf.timeframe] || tf.timeframe;
  const tfSafe = tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_');
  const isBuy = tf.analysis.direction?.toUpperCase() === 'BUY';
  const isSell = tf.analysis.direction?.toUpperCase() === 'SELL';
  
  return `// ${tf.timeframe} Timeframe${isBuy ? ' - BUY signal' : isSell ? ' - SELL signal' : ''}
tf_${tfSafe}_macd = request.security(syminfo.tickerid, "${tfPine}", macd_line)
tf_${tfSafe}_signal = request.security(syminfo.tickerid, "${tfPine}", signal_line)
tf_${tfSafe}_bullish = tf_${tfSafe}_macd > tf_${tfSafe}_signal
tf_${tfSafe}_bearish = tf_${tfSafe}_macd < tf_${tfSafe}_signal`;
}).join('\n\n')}

// Volume Confirmation
volume_confirmed = use_volume_filter ? volume > volume_ma : true

// Entry Conditions (${buyCount} timeframe(s) suggest BUY, ${sellCount} suggest SELL)
buy_signal = (${sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'BUY').map(tf => `tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_bullish`).join(' and ') || 'false'})
sell_signal = (${sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'SELL').map(tf => `tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_bearish`).join(' and ') || 'false'})

buy_condition = allow_buy and buy_signal and volume_confirmed and rsi < rsi_overbought
sell_condition = allow_sell and sell_signal and volume_confirmed and rsi > rsi_oversold

// ATR-based Stop Loss and Take Profit
atr_stop_distance = atr * atr_multiplier
atr_tp_distance = atr * atr_multiplier * risk_reward_ratio

// Execute Trades with Trailing Stop
if buy_condition and strategy.position_size == 0
    stop_loss = use_atr_sl ? close - atr_stop_distance : na
    take_profit = use_atr_sl ? close + atr_tp_distance : na
    strategy.entry("Long", strategy.long, comment="${strategyLabel} BUY")
    if use_atr_sl and use_trailing_stop
        // Trailing stop that activates after minimum profit
        trail_offset = trailing_stop_pips * syminfo.mintick * 10
        strategy.exit("Exit Long", "Long", stop=stop_loss, limit=take_profit, trail_offset=trail_offset, comment="Trailing TP/SL")
    else if use_atr_sl
        strategy.exit("Exit Long", "Long", stop=stop_loss, limit=take_profit, comment="TP/SL")

if sell_condition and strategy.position_size == 0
    stop_loss = use_atr_sl ? close + atr_stop_distance : na
    take_profit = use_atr_sl ? close - atr_tp_distance : na
    strategy.entry("Short", strategy.short, comment="${strategyLabel} SELL")
    if use_atr_sl and use_trailing_stop
        // Trailing stop that activates after minimum profit
        trail_offset = trailing_stop_pips * syminfo.mintick * 10
        strategy.exit("Exit Short", "Short", stop=stop_loss, limit=take_profit, trail_offset=trail_offset, comment="Trailing TP/SL")
    else if use_atr_sl
        strategy.exit("Exit Short", "Short", stop=stop_loss, limit=take_profit, comment="TP/SL")

// Plot Indicators
plot(rsi, "RSI", color=color.blue)
hline(rsi_overbought, "Overbought", color=color.red, linestyle=hline.style_dashed)
hline(rsi_oversold, "Oversold", color=color.green, linestyle=hline.style_dashed)

// Plot Buy/Sell Signals
plotshape(buy_condition, "Buy Signal", shape.triangleup, location.belowbar, color.green, size=size.small)
plotshape(sell_condition, "Sell Signal", shape.triangledown, location.abovebar, color.red, size=size.small)

// ============================================================================
// STRATEGY NOTES:
// - This strategy combines ${sortedTimeframes.length} timeframes: ${sortedTimeframes.map(tf => tf.timeframe).join(', ')}
// - AI detected patterns: ${detectedPatterns || 'Standard technical patterns'}
// - Consensus direction: ${consensusDirection} with ${consensusConfidence.toFixed(0)}% agreement
// - Uses ATR-based stops with ${atrStopLoss} average range
// - Entry point: ${entryPoint}
// - Stop loss: ${stopLoss}
// - Take profit: ${takeProfit}
// - Risk-Reward Ratio: ${riskReward}
// - Includes volume and momentum confirmation (RSI, MACD)
// 
// TIMEFRAME BREAKDOWN:
${sortedTimeframes.map(tf => `//   ${tf.timeframe}: ${tf.analysis.direction || 'N/A'} - Confidence: ${tf.analysis.confidence || 'N/A'} - Trend: ${tf.analysis.trend || 'N/A'}`).join('\n')}
// ============================================================================
`;

  return code;
}
