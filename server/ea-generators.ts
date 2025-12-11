import { ChartAnalysisResponse } from "@shared/types";

interface TimeframeAnalysisData {
  timeframe: string;
  analysis: ChartAnalysisResponse;
}

/**
 * Detect decimal places for a trading symbol
 * BTC/USD = 2, GBPUSD = 5, EURUSD = 5, USDJPY = 2, XAU/USD = 2, etc.
 */
function getDecimalPlacesForSymbol(symbol: string): number {
  const cleanSymbol = symbol.toUpperCase().replace(/[^A-Z0-9]/g, '');
  
  // Precious metals (2 decimals)
  if (cleanSymbol.includes('XAU') || cleanSymbol.includes('XAG') || 
      cleanSymbol.includes('XPD') || cleanSymbol.includes('XPT')) {
    return 2;
  }
  
  // Cryptocurrencies (typically 2 decimals)
  if (cleanSymbol.includes('BTC') || cleanSymbol.includes('ETH') || 
      cleanSymbol.includes('LTC') || cleanSymbol.includes('XRP')) {
    return 2;
  }
  
  // JPY pairs (2 decimals)
  if (cleanSymbol.includes('JPY')) {
    return 2;
  }
  
  // GBP, CHF, EUR, AUD, NZD, CAD pairs (typically 5 decimals when paired with USD/EUR/GBP)
  if (cleanSymbol.includes('GBPUSD') || cleanSymbol.includes('GBPJPY') ||
      cleanSymbol.includes('EURUSD') || cleanSymbol.includes('EURGBP') ||
      cleanSymbol.includes('EURCHF') || cleanSymbol.includes('AUDUSD') ||
      cleanSymbol.includes('NZDUSD') || cleanSymbol.includes('USDCAD') ||
      cleanSymbol.includes('USDCHF') || cleanSymbol.includes('CADJPY')) {
    return 5;
  }
  
  // Default for most forex pairs (5 decimals)
  return 5;
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
  volumeThreshold?: number;
  tradingDays?: Record<string, boolean>;
  useBreakoutEntry?: boolean;
  breakoutTimeframe?: string;
  breakoutStartHour?: number;
  breakoutStartMinute?: number;
  oneTradePerDay?: boolean;
  // Spread strategy options
  spreadType?: 'convergence' | 'divergence' | 'momentum' | 'correlation';
  baseSymbol?: string;
  hedgeSymbol?: string;
  hedgeRatio?: number;
  expectedCorrelation?: number;
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
  const volumeThreshold = config?.volumeThreshold || 0;
  const tradingDays = config?.tradingDays || {
    Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true
  };
  const useBreakoutEntry = config?.useBreakoutEntry || false;
  const breakoutTimeframe = config?.breakoutTimeframe || 'M5';
  const breakoutStartHour = config?.breakoutStartHour || 0;
  const breakoutStartMinute = config?.breakoutStartMinute || 0;
  const oneTradePerDay = config?.oneTradePerDay || false;
  
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
  
  // Extract candlestick significance from analysis
  const candlestickSignificance = primaryTF.analysis.candlestickSignificance;
  const candlestickSignal = candlestickSignificance?.overallSignal || 'Neutral';
  const candlestickReliability = candlestickSignificance?.reliability || 'Medium';
  const candlestickPatterns = candlestickSignificance?.patterns || [];
  const candlestickPatternsStr = candlestickPatterns
    .map((p: any) => `${p.name} (${p.type}, ${p.significance})`)
    .join(', ') || 'None detected';
  const candlestickKeyObservation = candlestickSignificance?.keyObservation || 'No significant patterns';
  const candlestickTradingImplication = candlestickSignificance?.tradingImplication || 'Continue monitoring';
  
  // Determine if candlestick patterns support trade direction
  const bullishCandlePatterns = candlestickPatterns.filter((p: any) => p.type === 'Bullish');
  const bearishCandlePatterns = candlestickPatterns.filter((p: any) => p.type === 'Bearish');
  const hasBullishCandles = bullishCandlePatterns.length > 0;
  const hasBearishCandles = bearishCandlePatterns.length > 0;
  const candleSignalBullish = candlestickSignal.toLowerCase().includes('buy') || candlestickSignal.toLowerCase().includes('bullish');
  const candleSignalBearish = candlestickSignal.toLowerCase().includes('sell') || candlestickSignal.toLowerCase().includes('bearish');
  
  // Get consensus direction - trust primary timeframe when there's a tie
  const buyCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'BUY').length;
  const sellCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'SELL').length;
  const primaryDirection = primaryTF.analysis.direction?.toUpperCase() || 'NEUTRAL';
  
  // Use consensus if clear majority, otherwise use primary timeframe
  let consensusDirection = 'NEUTRAL';
  if (buyCount > sellCount) {
    consensusDirection = 'BUY';
  } else if (sellCount > buyCount) {
    consensusDirection = 'SELL';
  } else {
    // Tie or no signals: use primary timeframe direction
    consensusDirection = primaryDirection;
  }
  
  const consensusConfidence = Math.max(buyCount, sellCount) / sortedTimeframes.length * 100;
  
  // Parse ATR multiplier as number
  const atrMultiplierValue = primaryTF.analysis.atrStopLoss?.multiplier || 1.5;
  const atrMultiplierBase = typeof atrMultiplierValue === 'number' ? atrMultiplierValue : parseFloat(String(atrMultiplierValue)) || 1.5;

  // Adjust ATR multiplier and risk/reward based on strategy type
  let atrMultiplierNum = atrMultiplierBase;
  let riskRewardRatio = 2.0;
  let minConfirmationBars = 2;
  
  switch(strategyType) {
    case 'scalping':
      // Tight SL, small targets, quick exits
      atrMultiplierNum = atrMultiplierBase * 0.5;  // 0.5-0.75 ATR SL
      riskRewardRatio = 1.0;  // 1:1 RR for quick scalps
      minConfirmationBars = 3;  // Stricter entry
      break;
    case 'day_trading':
      // Medium SL, medium targets
      atrMultiplierNum = atrMultiplierBase;  // 1-1.5 ATR SL (default)
      riskRewardRatio = 2.0;  // 2:1 RR for day trades
      minConfirmationBars = 2;
      break;
    case 'swing_trading':
      // Wider SL, larger targets, hold longer
      atrMultiplierNum = atrMultiplierBase * 1.75;  // 1.75-2.5 ATR SL
      riskRewardRatio = 3.0;  // 3:1 RR for swing trades
      minConfirmationBars = 1;  // Looser entry
      break;
    case 'position_trading':
      // Very wide SL, very large targets, hold days/weeks
      atrMultiplierNum = atrMultiplierBase * 2.5;  // 2.5-3.5 ATR SL
      riskRewardRatio = 4.0;  // 4:1 RR for position trades
      minConfirmationBars = 1;  // Just trend confirmation
      break;
    default:
      atrMultiplierNum = atrMultiplierBase;
      riskRewardRatio = 2.0;
  }

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
   MODE_SINGLE = 0,        // Single trade only
   MODE_PYRAMIDING = 1,    // Add to winning positions
   MODE_GRID = 2,          // Multiple trades at grid levels
   MODE_HEDGING = 3        // Allow opposite positions
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
// IMPORTANT: After this date, re-analyze the chart and generate a new EA
//    Market conditions change, and old analysis may become invalid.
//
// AI ANALYSIS SUMMARY
//========================================================================
// Detected Patterns: ${detectedPatterns || 'None specified'}
// Key Indicators: ${detectedIndicators || 'RSI, MACD, Volume'}
// AI Recommendation: ${consensusDirection} (${consensusConfidence.toFixed(0)}% confidence)
// Entry Point: ${primaryTF.analysis.entryPoint || 'Market'}
// Support Level: ${nearestSupport}
// Resistance Level: ${nearestResistance}
// Stop Loss (AI): ${atrStopLoss}
// Take Profit (AI): ${takeProfit}
// Risk/Reward Ratio: ${primaryTF.analysis.riskRewardRatio || '1:2'}
//
// CANDLESTICK SIGNIFICANCE ANALYSIS
//========================================================================
// Overall Signal: ${candlestickSignal} (${candlestickReliability} Reliability)
// Detected Candlestick Patterns: ${candlestickPatternsStr}
// Key Observation: ${candlestickKeyObservation}
// Trading Implication: ${candlestickTradingImplication}
// Bullish Patterns Found: ${hasBullishCandles ? bullishCandlePatterns.map((p: any) => p.name).join(', ') : 'None'}
// Bearish Patterns Found: ${hasBearishCandles ? bearishCandlePatterns.map((p: any) => p.name).join(', ') : 'None'}
//
// TRADING STRATEGY - HYBRID APPROACH
//========================================================================
// This EA combines AI pattern analysis with technical indicator confirmation:
//
// When AI suggests ${consensusDirection}:
//   - Easier entry requirements (MACD confirmation + reasonable RSI)
//   - Trusts the AI's pattern detection from your chart
//   - Waits for technical indicators to align with AI direction
//
// When AI is neutral/opposite:
//   - Stricter entry requirements (fresh MACD crossover + strong RSI)
//   - Requires clear technical signals to override AI analysis
//
// This hybrid approach gives you the best of both worlds:
// - AI identifies patterns humans might miss
// - Technical indicators confirm entries in real-time
// - Reduces false signals and improves win rate
//========================================================================
//
// LIVE AI REFRESH FEATURE (COMING SOON!)
//========================================================================
// THIS FEATURE IS CURRENTLY DISABLED FOR SECURITY REVIEW
//
// We're working on a DAILY AI REFRESH feature that will:
// - Re-analyze your chart daily with current market prices
// - Detect new patterns that emerge over time
// - Adapt to changing market conditions automatically
// - Pause trading if AI changes direction (safety mode)
// - Cost: ~$1-3 per month per EA
//
// WHY IS IT DISABLED?
// We're implementing proper security measures to protect against:
// - Unauthorized API access
// - Cost abuse and rate limiting
// - Secure token management
// - User authentication and authorization
//
// HOW TO GET EARLY ACCESS:
// 1. Contact support at support@vedd.io
// 2. We'll provide you with a secure API token
// 3. We'll enable the feature for your account
// 4. You'll get detailed setup instructions
//
// EXPECTED LAUNCH: Next update (pending security audit)
//
// FOR NOW: The EA works great with the baked-in AI analysis!
// - Use the validity period (${validityDays} days) as your guide
// - Re-generate a new EA when it expires
// - Each new generation gets fresh AI analysis
//========================================================================

//--- CUSTOMIZABLE INPUT PARAMETERS
//--- Risk Management
input group "=== Risk Management ==="
input double LotSize = 0.01;                    // Position size (lots)
input bool UseATR_StopLoss = true;              // Use ATR-based stop loss
input double ATR_Multiplier = ${atrMultiplierNum.toFixed(2)};              // ATR multiplier for SL (from AI analysis)
input double RiskRewardRatio = ${riskRewardRatio.toFixed(1)};             // Risk-reward ratio for TP (auto-set: ${strategyType})
input double MaxRiskPercent = 2.0;              // Max risk per trade (% of account)
input double StopLossPips = 50;                 // Fixed SL in pips (if not using ATR)
input double TakeProfitPips = 100;              // Fixed TP in pips (if not using ATR)

//--- Trailing Stop (Profit Protection)
input group "=== Trailing Stop - Lock in Profits ==="
input bool UseTrailingStop = ${useTrailingStop ? 'true' : 'false'};              // Enable trailing stop when in profit
input double TrailingStopDistance = ${trailingStopDistance};       // Distance from current price (pips)
input double TrailingStopStep = ${trailingStopStep};               // Minimum price movement to trail (pips)
input double MinProfitToActivate = ${strategyType === 'scalping' ? '5' : strategyType === 'swing_trading' ? '50' : '20'};          // Min profit (pips) before trailing activates

//--- Technical Indicators
input group "=== Technical Indicators ==="
input int RSI_Period = ${strategyType === 'scalping' ? '7' : '14'};                      // RSI period (shorter for scalping)
input int RSI_Overbought = ${strategyType === 'scalping' ? '75' : '70'};                  // RSI overbought (higher for scalping=less trades)
input int RSI_Oversold = ${strategyType === 'scalping' ? '25' : '30'};                    // RSI oversold (lower for scalping)
input int MACD_FastEMA = 12;                    // MACD fast EMA period
input int MACD_SlowEMA = 26;                    // MACD slow EMA period
input int MACD_SignalSMA = 9;                   // MACD signal SMA period

//--- Candlestick Pattern Recognition
input group "=== Candlestick Pattern Recognition ==="
input bool UseCandlestickPatterns = true;       // Enable candlestick pattern confirmation
input bool RequireCandleConfirmation = false;   // Require candlestick pattern to match direction
input double DojiThreshold = 0.1;               // Doji body/range ratio threshold (0.0-1.0)
input double EngulfingMinRatio = 1.5;           // Min ratio for engulfing pattern
input bool DetectDoji = true;                   // Detect Doji patterns
input bool DetectHammer = true;                 // Detect Hammer/Hanging Man
input bool DetectEngulfing = true;              // Detect Engulfing patterns
input bool DetectMorningStar = true;            // Detect Morning/Evening Star
input int ATR_Period = ${strategyType === 'scalping' ? '7' : '14'};                      // ATR period (shorter for scalping)
input int Volume_MA_Period = ${strategyType === 'position_trading' ? '50' : '20'};                // Volume moving average period

//--- Trading Rules
input group "=== Trading Rules ==="
input bool AllowBuyTrades = true;               // Allow BUY trades
input bool AllowSellTrades = true;              // Allow SELL trades
input bool UseVolumeFilter = ${strategyType === 'scalping' ? 'true' : 'false'};             // Require volume confirmation (stricter for scalping)
input bool UseMultiTimeframeConfirmation = ${strategyType === 'position_trading' ? 'true' : 'false'};  // Use multiple timeframes for confirmation
input int MinTimeframesAgree = ${Math.max(1, Math.floor(sortedTimeframes.length / 2))};                     // Minimum timeframes that must agree
input int MaxOpenTrades = ${maxSimultaneousTrades};                    // Maximum concurrent trades
input int MagicNumber = ${Math.floor(Math.random() * 90000) + 10000};                     // Unique identifier for this EA

//--- Breakout Entry Strategy
input group "=== Breakout Entry Strategy ==="
input bool UseBreakoutEntry = ${useBreakoutEntry ? 'true' : 'false'};            // Enable breakout entry on custom timeframe
input string BreakoutTimeframe = "${breakoutTimeframe}";  // Timeframe for breakout detection (M1, M5, M15, M30, H1, H4, D1)
input int BreakoutStartHour = ${breakoutStartHour};       // Hour to start placing breakout trades (24-hour format)
input int BreakoutStartMinute = ${breakoutStartMinute};   // Minute to start placing breakout trades
input bool OneTradePerDay = ${oneTradePerDay ? 'true' : 'false'};  // Only allow 1 trade per day
input double BreakoutBuffer = 0;                // Buffer pips above high/below low (0 = at exact level, positive = above/below)
input int BreakoutConfirmationBars = 2;         // Number of confirmed bars to validate breakout
input bool RequireBreakoutVolume = true;        // Require volume confirmation on breakout

//--- Trading Hours (Peak Volume Times) - OPTIONAL
input group "=== Trading Hours (Peak Volume) - OPTIONAL ==="
input bool UseTradeHours = false;               // Enable to only trade during peak hours (disabled by default)
input int StartHour_1 = 8;                      // London Open (08:00 GMT)
input int EndHour_1 = 12;                       // Until Noon GMT
input int StartHour_2 = 13;                     // US/London Overlap (13:00 GMT)
input int EndHour_2 = 17;                       // Until 17:00 GMT (best liquidity)
input bool AllowAsianSession = false;           // Also trade Asian session (00:00-07:00 GMT) when trading hours enabled

//--- Volume and Day Filters
input group "=== Volume & Day Filters - OPTIONAL ==="
input double VolumeThreshold = ${volumeThreshold};    // Volume threshold (% of average). 0 = disabled, 100 = match average
input bool AllowMonday = ${tradingDays.Monday};
input bool AllowTuesday = ${tradingDays.Tuesday};
input bool AllowWednesday = ${tradingDays.Wednesday};
input bool AllowThursday = ${tradingDays.Thursday};
input bool AllowFriday = ${tradingDays.Friday};
input bool AllowSaturday = ${tradingDays.Saturday};
input bool AllowSunday = ${tradingDays.Sunday};

//--- Multiple Trade Strategy
input group "=== Multi-Trade Strategy ==="
input ENUM_MULTI_TRADE_MODE MultiTradeMode = ${multiTradeStrategy === 'pyramiding' ? 'MODE_PYRAMIDING' : multiTradeStrategy === 'grid' ? 'MODE_GRID' : multiTradeStrategy === 'hedging' ? 'MODE_HEDGING' : 'MODE_SINGLE'};    // Trading mode
input double PyramidingRatio = ${pyramidingRatio.toFixed(2)};          // Lot multiplier for pyramiding (e.g., 0.5 = half size)
input double GridStepPips = 50;                 // Distance between grid levels (pips)
input bool AllowHedging = ${multiTradeStrategy === 'hedging' ? 'true' : 'false'};                  // Allow simultaneous BUY/SELL positions

//--- Live AI Refresh (Daily Real-Time Analysis)
input group "=== AI Live Refresh (Costs ~$1-3/month) ==="
input bool EnableLiveRefresh = false;           // DISABLED - Contact support to enable
input string RefreshAPIURL = "https://YOUR_REPLIT_DOMAIN/api/ea/refresh-analysis";  // API endpoint URL (get from support)
input string RefreshAPIKey = "FEATURE_DISABLED_CONTACT_SUPPORT";  // Contact support for secure token
input int RefreshIntervalHours = 24;            // Hours between refreshes (24 = once per day)
input bool PauseOnDirectionChange = true;       // Pause trading if AI changes direction

//--- First Trade Setup (Use AI-Generated Entry/SL/TP)
input group "=== First Trade - AI Setup ==="
input bool UseFirstTradeSetup = true;           // Place first trade immediately with AI setup
input double FirstTradeEntry = 0;               // AI entry point (0 = use market entry)
input double FirstTradeStopLoss = 0;            // AI stop loss level
input double FirstTradeTakeProfit = 0;          // AI take profit level

//--- Global variables
int rsi_handle, macd_handle, atr_handle;
double rsi_buffer[], macd_main[], macd_signal[], atr_buffer[];
double last_buy_price = 0;    // Track last buy entry for pyramiding
double last_sell_price = 0;   // Track last sell entry for pyramiding
datetime last_refresh_time = 0;  // Track last API refresh
string current_ai_direction = "${consensusDirection}";  // Current AI recommendation
int current_ai_confidence = ${Math.round(consensusConfidence)};  // Current confidence level
bool trading_paused = false;  // Trading pause status
bool rsi_ok = false, macd_ok = false, atr_ok = false;  // Indicator status flags
bool first_trade_placed = false;  // Track if first trade has been placed
datetime last_trade_day = 0;  // Track last trade day for one-trade-per-day limit
int daily_trade_count = 0;  // Count trades opened today

//--- Candlestick Pattern Variables (from AI Analysis)
bool ai_bullish_candles = ${hasBullishCandles ? 'true' : 'false'};  // AI detected bullish patterns
bool ai_bearish_candles = ${hasBearishCandles ? 'true' : 'false'};  // AI detected bearish patterns
string ai_candle_signal = "${candlestickSignal}";  // Overall candlestick signal
string ai_candle_reliability = "${candlestickReliability}";  // Pattern reliability

//--- Candlestick Pattern Enumeration
enum CANDLE_PATTERN
{
   PATTERN_NONE = 0,
   PATTERN_DOJI = 1,
   PATTERN_HAMMER = 2,
   PATTERN_INVERTED_HAMMER = 3,
   PATTERN_HANGING_MAN = 4,
   PATTERN_SHOOTING_STAR = 5,
   PATTERN_BULLISH_ENGULFING = 6,
   PATTERN_BEARISH_ENGULFING = 7,
   PATTERN_MORNING_STAR = 8,
   PATTERN_EVENING_STAR = 9,
   PATTERN_BULLISH_HARAMI = 10,
   PATTERN_BEARISH_HARAMI = 11
};

//+------------------------------------------------------------------+
//| Expert initialization function                                   |
//+------------------------------------------------------------------+
int OnInit()
{
   // Auto-detect decimal places for this symbol
   int detected_digits = GetDecimalPlaces();
   Print("Auto-detected decimal places for ${symbol}: ", detected_digits);
   
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
   Print("Decimal Places: ", detected_digits, " (Auto-detected for ${symbol})");
   Print("--------------------------------------");
   Print("Live AI Refresh: ", EnableLiveRefresh ? "ENABLED" : "DISABLED");
   if(EnableLiveRefresh)
   {
      if(RefreshAPIKey == "YOUR_API_KEY_HERE")
      {
         Print("WARNING: Replace 'YOUR_API_KEY_HERE' with your actual API key!");
         Print("Trading will be PAUSED until you set a valid API key.");
         trading_paused = true;
      }
      else
      {
         Print("Refresh Interval: Every ", RefreshIntervalHours, " hours");
         EventSetTimer(RefreshIntervalHours * 3600);  // Set timer for API refresh
      }
   }
   Print("======================================");
   return(INIT_SUCCEEDED);
}

//+------------------------------------------------------------------+
//| Expert deinitialization function                                 |
//+------------------------------------------------------------------+
void OnDeinit(const int reason)
{
   EventKillTimer();  // Stop timer
   IndicatorRelease(rsi_handle);
   IndicatorRelease(macd_handle);
   IndicatorRelease(atr_handle);
}

//+------------------------------------------------------------------+
//| Timer function - Refresh AI analysis periodically                |
//+------------------------------------------------------------------+
void OnTimer()
{
   if(!EnableLiveRefresh) return;
   if(RefreshAPIKey == "YOUR_API_KEY_HERE") return;  // Skip if API key not set
   
   Print("======================================");
   Print("REFRESHING AI ANALYSIS...");
   Print("Time since last refresh: ", (int)((TimeCurrent() - last_refresh_time) / 3600), " hours");
   
   // Call the refresh function
   RefreshAIAnalysis();
}

//+------------------------------------------------------------------+
//| Refresh AI Analysis via API call                                 |
//+------------------------------------------------------------------+
void RefreshAIAnalysis()
{
   // Get current price data
   MqlRates rates[];
   if(CopyRates(_Symbol, PERIOD_CURRENT, 0, 1, rates) <= 0)
   {
      Print("Error: Could not get current price data");
      return;
   }
   
   double current_price = SymbolInfoDouble(_Symbol, SYMBOL_BID);
   
   // Prepare JSON request body
   string json_body = StringFormat(
      "{\\"symbol\\":\\"%s\\",\\"timeframe\\":\\"${primaryTF.timeframe}\\",\\"priceData\\":{\\"currentPrice\\":%.5f,\\"open\\":%.5f,\\"high\\":%.5f,\\"low\\":%.5f},\\"originalDirection\\":\\"%s\\",\\"apiKey\\":\\"%s\\"}",
      _Symbol,
      current_price,
      rates[0].open,
      rates[0].high,
      rates[0].low,
      current_ai_direction,
      RefreshAPIKey
   );
   
   // Prepare HTTP request
   char post_data[];
   char result[];
   string headers;
   string result_headers;
   
   StringToCharArray(json_body, post_data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(post_data, ArraySize(post_data) - 1);  // Remove null terminator
   
   headers = "Content-Type: application/json\\r\\n";
   
   // Make WebRequest
   ResetLastError();
   int res = WebRequest(
      "POST",
      RefreshAPIURL,
      headers,
      30000,  // 30 second timeout
      post_data,
      result,
      result_headers
   );
   
   if(res == -1)
   {
      int error_code = GetLastError();
      Print("WebRequest Error: ", error_code);
      Print("Make sure the URL is whitelisted in MT5 settings:");
      Print("   Tools → Options → Expert Advisors → Allow WebRequest for listed URL");
      Print("   Add: ", RefreshAPIURL);
      return;
   }
   
   if(res != 200)
   {
      Print("API returned error code: ", res);
      return;
   }
   
   // Parse JSON response
   string response = CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8);
   Print("Received AI refresh response - OK");
   
   // Extract direction and confidence (simple string parsing)
   string new_direction = ExtractJSONValue(response, "direction");
   string confidence_str = ExtractJSONValue(response, "confidence");
   string direction_changed = ExtractJSONValue(response, "directionChanged");
   string warning = ExtractJSONValue(response, "warning");
   
   int new_confidence = (int)StringToInteger(confidence_str);
   
   Print("--------------------------------------");
   Print("FRESH AI ANALYSIS:");
   Print("   Original: ", current_ai_direction, " (", current_ai_confidence, "%)");
   Print("   Updated:  ", new_direction, " (", new_confidence, "%)");
   Print("   Changed:  ", direction_changed);
   if(warning != "") Print("   WARNING: ", warning);
   Print("======================================");
   
   // Check if direction changed
   if(direction_changed == "true" || new_direction != current_ai_direction)
   {
      Print("🚨 AI DIRECTION CHANGED!");
      Print("   Old: ", current_ai_direction, " → New: ", new_direction);
      
      if(PauseOnDirectionChange)
      {
         trading_paused = true;
         Print("TRADING PAUSED - AI changed its mind!");
         Print("   Review the new analysis and resume manually if needed");
         Print("   Set PauseOnDirectionChange=false to auto-adapt");
      }
      else
      {
         Print("Auto-adapting to new AI direction...");
         current_ai_direction = new_direction;
         current_ai_confidence = new_confidence;
      }
   }
   else
   {
      Print("AI confirms original direction - continuing - OK");
      current_ai_confidence = new_confidence;  // Update confidence
   }
   
   last_refresh_time = TimeCurrent();
}

//+------------------------------------------------------------------+
//| Extract value from JSON string (simple parser)                   |
//+------------------------------------------------------------------+
string ExtractJSONValue(string json, string key)
{
   string search = "\\"" + key + "\\":\\"";
   int start = StringFind(json, search);
   if(start == -1)
   {
      // Try without quotes (for numbers/booleans)
      search = "\\"" + key + "\\":";
      start = StringFind(json, search);
      if(start == -1) return "";
      start += StringLen(search);
      int end = StringFind(json, ",", start);
      if(end == -1) end = StringFind(json, "}", start);
      return StringSubstr(json, start, end - start);
   }
   start += StringLen(search);
   int end = StringFind(json, "\\"", start);
   return StringSubstr(json, start, end - start);
}

//+------------------------------------------------------------------+
//| Place first trade with AI-generated setup (PENDING ORDER)        |
//+------------------------------------------------------------------+
void PlaceFirstTradeWithAISetup()
{
   Print("======================================");
   Print("PLACING FIRST TRADE AS PENDING ORDER");
   Print("Entry (Trigger): ", FirstTradeEntry, " | SL: ", FirstTradeStopLoss, " | TP: ", FirstTradeTakeProfit);
   Print("Direction: ", current_ai_direction);
   Print("======================================");
   
   if(FirstTradeEntry <= 0)
   {
      Print("ERROR: FirstTradeEntry must be greater than 0 for pending order");
      return;
   }
   
   MqlTradeRequest request = {};
   MqlTradeResult result = {};
   
   bool is_buy = (current_ai_direction == "BUY");
   
   request.action = TRADE_ACTION_PENDING;
   request.symbol = _Symbol;
   request.volume = LotSize;
   request.price = FirstTradeEntry;
   request.sl = FirstTradeStopLoss;
   request.tp = FirstTradeTakeProfit;
   request.deviation = 10;
   request.magic = MagicNumber;
   
   if(is_buy && AllowBuyTrades)
   {
      request.type = ORDER_TYPE_BUY_STOP;
      request.comment = "First Trade - AI BUY STOP";
      
      if(OrderSend(request, result))
      {
         Print("Pending BUY STOP order placed at ", FirstTradeEntry, " with SL: ", FirstTradeStopLoss, " TP: ", FirstTradeTakeProfit);
         Print("Order Ticket: ", result.order);
      }
      else
      {
         Print("ERROR placing pending BUY STOP: ", GetLastError());
      }
   }
   else if(!is_buy && AllowSellTrades)
   {
      request.type = ORDER_TYPE_SELL_STOP;
      request.comment = "First Trade - AI SELL STOP";
      
      if(OrderSend(request, result))
      {
         Print("Pending SELL STOP order placed at ", FirstTradeEntry, " with SL: ", FirstTradeStopLoss, " TP: ", FirstTradeTakeProfit);
         Print("Order Ticket: ", result.order);
      }
      else
      {
         Print("ERROR placing pending SELL STOP: ", GetLastError());
      }
   }
   else
   {
      Print("First trade blocked - check trading permissions");
   }
}

//+------------------------------------------------------------------+
//| Expert tick function                                             |
//+------------------------------------------------------------------+
void OnTick()
{
   //--- Manage trailing stop for existing positions (every tick)
   if(UseTrailingStop)
      ManageTrailingStop();
   
   //--- Place first trade with AI setup if enabled and not yet placed
   if(UseFirstTradeSetup && !first_trade_placed && (FirstTradeEntry > 0 || FirstTradeStopLoss > 0))
   {
      PlaceFirstTradeWithAISetup();
      first_trade_placed = true;
      return;  // Skip normal trading logic on first trade
   }
   
   //--- Check if a new bar has formed
   static datetime last_bar_time = 0;
   datetime current_bar_time = iTime(_Symbol, PERIOD_CURRENT, 0);
   
   if(current_bar_time == last_bar_time)
      return;
   
   last_bar_time = current_bar_time;
   
   //--- Copy indicator values (handle potential failures gracefully)
   rsi_ok = CopyBuffer(rsi_handle, 0, 0, 3, rsi_buffer) > 0;
   macd_ok = CopyBuffer(macd_handle, 0, 0, 3, macd_main) > 0 && CopyBuffer(macd_handle, 1, 0, 3, macd_signal) > 0;
   atr_ok = CopyBuffer(atr_handle, 0, 0, 3, atr_buffer) > 0;
   
   //--- Check multi-timeframe conditions
   bool tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bullish = CheckBullishCondition();
   bool tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bearish = CheckBearishCondition();
   
${higherTFs.map(tf => `   bool tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bullish = CheckHigherTimeframeTrend("${tf.timeframe}", true);
   bool tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bearish = CheckHigherTimeframeTrend("${tf.timeframe}", false);`).join('\n')}
   
   //--- Entry conditions based on multi-timeframe analysis
   // Note: If multi-timeframe confirmation is disabled, use current timeframe signals only
   bool buy_signal, sell_signal;
   
   if(UseMultiTimeframeConfirmation)
   {
      // Require multiple timeframes to agree
      ${buyConditions.length > 0 ? 
        `buy_signal = (${buyConditions.join(' && ')});  // ${buyCount} timeframe(s) suggest BUY` : 
        `buy_signal = tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bullish;  // Using primary timeframe only`}
      ${sellConditions.length > 0 ? 
        `sell_signal = (${sellConditions.join(' && ')});  // ${sellCount} timeframe(s) suggest SELL` : 
        `sell_signal = tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bearish;  // Using primary timeframe only`}
   }
   else
   {
      // Use primary timeframe signals only (more trades)
      buy_signal = tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bullish;
      sell_signal = tf_${sortedTimeframes[0].timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_trend_bearish;
   }
   
   //--- Volume confirmation (only when enabled)
   bool volume_confirmed = !UseVolumeFilter || CheckVolumeConfirmation();
   
   //--- Check if within trading hours (peak volume times)
   bool in_trading_hours = !UseTradeHours || IsInTradingHours();
   
   //--- Count existing positions
   int buy_positions = CountPositions(POSITION_TYPE_BUY);
   int sell_positions = CountPositions(POSITION_TYPE_SELL);
   int total_positions = buy_positions + sell_positions;
   
   //--- Debug info (printed every new bar)
   static int bar_count = 0;
   bar_count++;
   if(bar_count % 10 == 0)  // Print every 10 bars to avoid spam
   {
      Print("========== HYBRID EA STATUS (Bar ", bar_count, ") ==========");
      if(EnableLiveRefresh)
      {
         Print("LIVE AI STATUS:");
         Print("  - Current Direction: ", current_ai_direction, " (", current_ai_confidence, "%)");
         Print("  - Trading Status: ", trading_paused ? "PAUSED" : "ACTIVE");
         Print("");
      }
      Print("AI ANALYSIS (Original):");
      Print("  - Direction: ${consensusDirection} (${consensusConfidence.toFixed(0)}% confidence)");
      Print("  - Patterns: ${detectedPatterns || 'None'}");
      Print("");
      Print("TECHNICAL INDICATORS:");
      Print("  - RSI: ", DoubleToString(rsi_buffer[0], 2), 
            " | MACD: ", DoubleToString(macd_main[0], 5),
            " vs Signal: ", DoubleToString(macd_signal[0], 5));
      Print("  - MACD Position: ", (macd_main[0] > macd_signal[0] ? "BULLISH UP" : "BEARISH DOWN"));
      Print("");
      Print("TRADE SIGNALS:");
      Print("  - BUY Signal: ", buy_signal, " | SELL Signal: ", sell_signal);
      Print("  - Volume OK: ", volume_confirmed, " | Multi-TF: ", UseMultiTimeframeConfirmation);
      Print("");
      Print("POSITIONS:");
      Print("  - BUY: ", buy_positions, " | SELL: ", sell_positions, " | Total: ", total_positions);
      Print("  - Mode: ", MultiTradeMode, " | Max: ", MaxOpenTrades);
      Print("====================================================");
   }
   
   //--- Check if trading is paused due to AI direction change
   if(trading_paused)
   {
      static int pause_warning_count = 0;
      pause_warning_count++;
      if(pause_warning_count % 100 == 0)  // Print occasionally
      {
         Print("TRADING PAUSED - AI direction changed");
         Print("   Set trading_paused = false manually to resume");
      }
      return;  // Skip all trading logic
   }
   
   //--- Execute trades based on multi-trade strategy
   if(buy_signal && AllowBuyTrades && IsTradingDayAllowed() && CheckVolumeThreshold() && CheckStartTimeAllowed() && CheckDailyTradeLimit())
   {
      bool can_open = false;
      double lot_size = LotSize;
      
      switch(MultiTradeMode)
      {
         case MODE_SINGLE:
            can_open = (total_positions == 0);
            break;
            
         case MODE_PYRAMIDING:
            // Allow first trade OR pyramiding additional trades
            if(buy_positions == 0)
            {
               can_open = true;
               lot_size = LotSize;
            }
            else if(buy_positions < MaxOpenTrades && CheckPyramidingConditions(true))
            {
               can_open = true;
               lot_size = LotSize * PyramidingRatio;
            }
            break;
            
         case MODE_GRID:
            // Allow first trade OR grid trades if conditions met
            if(buy_positions == 0)
               can_open = true;
            else
               can_open = (buy_positions < MaxOpenTrades) && CheckGridConditions(true);
            break;
            
         case MODE_HEDGING:
            can_open = (total_positions < MaxOpenTrades) && AllowHedging;
            break;
      }
      
      if(can_open)
      {
         double sl = UseATR_StopLoss ? CalculateATR_StopLoss(true) : 0;
         double tp = UseATR_StopLoss ? CalculateATR_TakeProfit(true) : 0;
         OpenBuyPosition(sl, tp, lot_size);
      }
   }
   else if(sell_signal && AllowSellTrades && IsTradingDayAllowed() && CheckVolumeThreshold() && CheckStartTimeAllowed() && CheckDailyTradeLimit())
   {
      bool can_open = false;
      double lot_size = LotSize;
      
      switch(MultiTradeMode)
      {
         case MODE_SINGLE:
            can_open = (total_positions == 0);
            break;
            
         case MODE_PYRAMIDING:
            // Allow first trade OR pyramiding additional trades
            if(sell_positions == 0)
            {
               can_open = true;
               lot_size = LotSize;
            }
            else if(sell_positions < MaxOpenTrades && CheckPyramidingConditions(false))
            {
               can_open = true;
               lot_size = LotSize * PyramidingRatio;
            }
            break;
            
         case MODE_GRID:
            // Allow first trade OR grid trades if conditions met
            if(sell_positions == 0)
               can_open = true;
            else
               can_open = (sell_positions < MaxOpenTrades) && CheckGridConditions(false);
            break;
            
         case MODE_HEDGING:
            can_open = (total_positions < MaxOpenTrades) && AllowHedging;
            break;
      }
      
      if(can_open)
      {
         double sl = UseATR_StopLoss ? CalculateATR_StopLoss(false) : 0;
         double tp = UseATR_StopLoss ? CalculateATR_TakeProfit(false) : 0;
         OpenSellPosition(sl, tp, lot_size);
      }
   }
}

//+------------------------------------------------------------------+
//| Check bullish condition on current timeframe                     |
//| STRENGTH-BASED ENTRY: Adjusts requirements based on timeframe    |
//| confidence level (high=light check, low=strict check)            |
//+------------------------------------------------------------------+
bool CheckBullishCondition()
{
   //--- AI RECOMMENDATION: ${consensusDirection === 'BUY' ? 'BULLISH OK' : consensusDirection === 'SELL' ? 'BEARISH' : 'NEUTRAL'}
   //--- Detected Patterns: ${detectedPatterns || 'None'}
   //--- Confidence: ${consensusConfidence.toFixed(0)}%
   
   bool ai_suggests_buy = ${consensusDirection === 'BUY' ? 'true' : 'false'};  // Based on chart pattern analysis
   
   if(!ai_suggests_buy) return false;  // Only trade if AI says BUY
   
   // STRENGTH-BASED ENTRY REQUIREMENTS
   int confidence = current_ai_confidence;
   
   // Candlestick pattern check (optional confirmation)
   bool candle_ok = !RequireCandleConfirmation || HasBullishCandlePattern();
   
   if(confidence >= 80)
   {
      // HIGH CONFIDENCE (80%+): Light confirmation needed
      // RSI just needs to not be extremely overbought
      if(rsi_ok)
         return (rsi_buffer[0] < 80) && candle_ok;
      return candle_ok;
   }
   else if(confidence >= 50)
   {
      // MEDIUM CONFIDENCE (50-79%): Standard confirmation required
      // RSI should be neutral-to-bullish AND MACD should be bullish
      bool rsi_check = true;
      if(rsi_ok)
         rsi_check = (rsi_buffer[0] < 75);  // Stricter RSI: < 75
      
      bool macd_check = true;
      if(macd_ok)
         macd_check = (macd_main[0] > macd_signal[0]);  // MACD must be bullish
      
      return rsi_check && macd_check && candle_ok;
   }
   else
   {
      // LOW CONFIDENCE (<50%): Strict confirmation ALL required
      // RSI oversold (opportunity), MACD bullish crossover, volume confirmation
      bool rsi_check = true;
      if(rsi_ok)
         rsi_check = (rsi_buffer[0] < 50);  // Very strict RSI: < 50
      
      bool macd_check = true;
      if(macd_ok)
         macd_check = (macd_main[0] > macd_signal[0]);  // MACD must be bullish
      
      bool volume_check = CheckVolumeConfirmation();  // Volume must confirm
      
      // For low confidence, candlestick patterns provide extra confirmation
      bool candle_boost = HasBullishCandlePattern();
      
      return rsi_check && macd_check && volume_check && candle_boost;
   }
}

//+------------------------------------------------------------------+
//| Check bearish condition on current timeframe                     |
//| STRENGTH-BASED ENTRY: Adjusts requirements based on timeframe    |
//| confidence level (high=light check, low=strict check)            |
//+------------------------------------------------------------------+
bool CheckBearishCondition()
{
   //--- AI RECOMMENDATION: ${consensusDirection === 'SELL' ? 'BEARISH OK' : consensusDirection === 'BUY' ? 'BULLISH' : 'NEUTRAL'}
   //--- Confidence Level: Uses strength-based entry requirements
   
   bool ai_suggests_sell = ${consensusDirection === 'SELL' ? 'true' : 'false'};  // Based on chart pattern analysis
   
   if(!ai_suggests_sell) return false;  // Only trade if AI says SELL
   
   // STRENGTH-BASED ENTRY REQUIREMENTS
   int confidence = current_ai_confidence;
   
   // Candlestick pattern check (optional confirmation)
   bool candle_ok = !RequireCandleConfirmation || HasBearishCandlePattern();
   
   if(confidence >= 80)
   {
      // HIGH CONFIDENCE (80%+): Light confirmation needed
      // RSI just needs to not be extremely oversold
      if(rsi_ok)
         return (rsi_buffer[0] > 20) && candle_ok;
      return candle_ok;
   }
   else if(confidence >= 50)
   {
      // MEDIUM CONFIDENCE (50-79%): Standard confirmation required
      // RSI should be neutral-to-bearish AND MACD should be bearish
      bool rsi_check = true;
      if(rsi_ok)
         rsi_check = (rsi_buffer[0] > 25);  // Stricter RSI: > 25
      
      bool macd_check = true;
      if(macd_ok)
         macd_check = (macd_main[0] < macd_signal[0]);  // MACD must be bearish
      
      return rsi_check && macd_check && candle_ok;
   }
   else
   {
      // LOW CONFIDENCE (<50%): Strict confirmation ALL required
      // RSI overbought (opportunity), MACD bearish crossover, volume confirmation
      bool rsi_check = true;
      if(rsi_ok)
         rsi_check = (rsi_buffer[0] > 50);  // Very strict RSI: > 50
      
      bool macd_check = true;
      if(macd_ok)
         macd_check = (macd_main[0] < macd_signal[0]);  // MACD must be bearish
      
      bool volume_check = CheckVolumeConfirmation();  // Volume must confirm
      
      // For low confidence, candlestick patterns provide extra confirmation
      bool candle_boost = HasBearishCandlePattern();
      
      return rsi_check && macd_check && volume_check && candle_boost;
   }
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
//| CANDLESTICK PATTERN DETECTION FUNCTIONS                          |
//+------------------------------------------------------------------+

//+------------------------------------------------------------------+
//| Detect Doji Pattern (small body, long wicks)                     |
//+------------------------------------------------------------------+
bool IsDoji(int shift = 0)
{
   if(!DetectDoji) return false;
   
   double open = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double close = iClose(_Symbol, PERIOD_CURRENT, shift);
   double high = iHigh(_Symbol, PERIOD_CURRENT, shift);
   double low = iLow(_Symbol, PERIOD_CURRENT, shift);
   
   double body = MathAbs(close - open);
   double range = high - low;
   
   if(range == 0) return false;
   return (body / range) < DojiThreshold;
}

//+------------------------------------------------------------------+
//| Detect Hammer Pattern (bullish reversal)                         |
//+------------------------------------------------------------------+
bool IsHammer(int shift = 0)
{
   if(!DetectHammer) return false;
   
   double open = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double close = iClose(_Symbol, PERIOD_CURRENT, shift);
   double high = iHigh(_Symbol, PERIOD_CURRENT, shift);
   double low = iLow(_Symbol, PERIOD_CURRENT, shift);
   
   double body = MathAbs(close - open);
   double range = high - low;
   double upper_wick = high - MathMax(open, close);
   double lower_wick = MathMin(open, close) - low;
   
   if(range == 0 || body == 0) return false;
   
   // Hammer: small body at top, long lower wick (2x body min)
   return (lower_wick >= body * 2) && (upper_wick <= body * 0.5) && (close >= open);
}

//+------------------------------------------------------------------+
//| Detect Inverted Hammer (bullish reversal)                        |
//+------------------------------------------------------------------+
bool IsInvertedHammer(int shift = 0)
{
   if(!DetectHammer) return false;
   
   double open = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double close = iClose(_Symbol, PERIOD_CURRENT, shift);
   double high = iHigh(_Symbol, PERIOD_CURRENT, shift);
   double low = iLow(_Symbol, PERIOD_CURRENT, shift);
   
   double body = MathAbs(close - open);
   double upper_wick = high - MathMax(open, close);
   double lower_wick = MathMin(open, close) - low;
   
   if(body == 0) return false;
   
   // Inverted Hammer: small body at bottom, long upper wick
   return (upper_wick >= body * 2) && (lower_wick <= body * 0.5);
}

//+------------------------------------------------------------------+
//| Detect Shooting Star (bearish reversal)                          |
//+------------------------------------------------------------------+
bool IsShootingStar(int shift = 0)
{
   if(!DetectHammer) return false;
   
   double open = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double close = iClose(_Symbol, PERIOD_CURRENT, shift);
   double high = iHigh(_Symbol, PERIOD_CURRENT, shift);
   double low = iLow(_Symbol, PERIOD_CURRENT, shift);
   
   double body = MathAbs(close - open);
   double upper_wick = high - MathMax(open, close);
   double lower_wick = MathMin(open, close) - low;
   
   if(body == 0) return false;
   
   // Shooting Star: small body at bottom, long upper wick, close < open (bearish)
   return (upper_wick >= body * 2) && (lower_wick <= body * 0.5) && (close < open);
}

//+------------------------------------------------------------------+
//| Detect Bullish Engulfing Pattern                                 |
//+------------------------------------------------------------------+
bool IsBullishEngulfing(int shift = 0)
{
   if(!DetectEngulfing) return false;
   
   double curr_open = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double curr_close = iClose(_Symbol, PERIOD_CURRENT, shift);
   double prev_open = iOpen(_Symbol, PERIOD_CURRENT, shift + 1);
   double prev_close = iClose(_Symbol, PERIOD_CURRENT, shift + 1);
   
   double curr_body = MathAbs(curr_close - curr_open);
   double prev_body = MathAbs(prev_close - prev_open);
   
   if(prev_body == 0) return false;
   
   // Current bar is bullish, previous bar is bearish
   bool curr_bullish = (curr_close > curr_open);
   bool prev_bearish = (prev_close < prev_open);
   
   // Current body engulfs previous body
   bool engulfs = (curr_body >= prev_body * EngulfingMinRatio) && 
                  (curr_open <= prev_close) && (curr_close >= prev_open);
   
   return curr_bullish && prev_bearish && engulfs;
}

//+------------------------------------------------------------------+
//| Detect Bearish Engulfing Pattern                                 |
//+------------------------------------------------------------------+
bool IsBearishEngulfing(int shift = 0)
{
   if(!DetectEngulfing) return false;
   
   double curr_open = iOpen(_Symbol, PERIOD_CURRENT, shift);
   double curr_close = iClose(_Symbol, PERIOD_CURRENT, shift);
   double prev_open = iOpen(_Symbol, PERIOD_CURRENT, shift + 1);
   double prev_close = iClose(_Symbol, PERIOD_CURRENT, shift + 1);
   
   double curr_body = MathAbs(curr_close - curr_open);
   double prev_body = MathAbs(prev_close - prev_open);
   
   if(prev_body == 0) return false;
   
   // Current bar is bearish, previous bar is bullish
   bool curr_bearish = (curr_close < curr_open);
   bool prev_bullish = (prev_close > prev_open);
   
   // Current body engulfs previous body
   bool engulfs = (curr_body >= prev_body * EngulfingMinRatio) && 
                  (curr_open >= prev_close) && (curr_close <= prev_open);
   
   return curr_bearish && prev_bullish && engulfs;
}

//+------------------------------------------------------------------+
//| Check for bullish candlestick patterns                           |
//+------------------------------------------------------------------+
bool HasBullishCandlePattern()
{
   if(!UseCandlestickPatterns) return true;  // If disabled, always pass
   
   // Check AI-detected patterns first
   if(ai_bullish_candles) return true;
   
   // Then check real-time patterns
   if(IsHammer(1)) return true;           // Hammer on previous bar
   if(IsInvertedHammer(1)) return true;   // Inverted hammer on previous bar
   if(IsBullishEngulfing(1)) return true; // Bullish engulfing pattern
   
   // Doji at support could signal reversal (neutral but usable)
   if(IsDoji(1)) return true;
   
   return false;
}

//+------------------------------------------------------------------+
//| Check for bearish candlestick patterns                           |
//+------------------------------------------------------------------+
bool HasBearishCandlePattern()
{
   if(!UseCandlestickPatterns) return true;  // If disabled, always pass
   
   // Check AI-detected patterns first
   if(ai_bearish_candles) return true;
   
   // Then check real-time patterns
   if(IsShootingStar(1)) return true;     // Shooting star on previous bar
   if(IsBearishEngulfing(1)) return true; // Bearish engulfing pattern
   
   // Doji at resistance could signal reversal (neutral but usable)
   if(IsDoji(1)) return true;
   
   return false;
}

//+------------------------------------------------------------------+
//| Get current candlestick pattern name (for logging)               |
//+------------------------------------------------------------------+
string GetCandlePatternName()
{
   if(IsHammer(1)) return "Hammer";
   if(IsInvertedHammer(1)) return "Inverted Hammer";
   if(IsShootingStar(1)) return "Shooting Star";
   if(IsBullishEngulfing(1)) return "Bullish Engulfing";
   if(IsBearishEngulfing(1)) return "Bearish Engulfing";
   if(IsDoji(1)) return "Doji";
   return "None";
}

//+------------------------------------------------------------------+
//| Check if current time is within trading hours (peak volume)      |
//+------------------------------------------------------------------+
bool IsInTradingHours()
{
   if(!UseTradeHours) return true;  // Trading allowed all hours if disabled
   
   MqlDateTime now;
   TimeToStruct(TimeCurrent(), now);
   int current_hour = now.hour;
   
   // London session (08:00-12:00 GMT)
   if(current_hour >= StartHour_1 && current_hour < EndHour_1)
      return true;
   
   // US/London overlap (13:00-17:00 GMT) - BEST LIQUIDITY
   if(current_hour >= StartHour_2 && current_hour < EndHour_2)
      return true;
   
   // Asian session (00:00-07:00 GMT) - only if enabled
   if(AllowAsianSession && current_hour >= 0 && current_hour < 8)
      return true;
   
   return false;  // Outside trading hours
}

//+------------------------------------------------------------------+
//| Check if current day is allowed for trading                      |
//+------------------------------------------------------------------+
bool IsTradingDayAllowed()
{
   MqlDateTime now;
   TimeToStruct(TimeCurrent(), now);
   int day_of_week = now.day_of_week;  // 0=Sunday, 1=Monday, ..., 6=Saturday
   
   if(day_of_week == 0) return AllowSunday;
   if(day_of_week == 1) return AllowMonday;
   if(day_of_week == 2) return AllowTuesday;
   if(day_of_week == 3) return AllowWednesday;
   if(day_of_week == 4) return AllowThursday;
   if(day_of_week == 5) return AllowFriday;
   if(day_of_week == 6) return AllowSaturday;
   
   return false;
}

//+------------------------------------------------------------------+
//| Auto-detect decimal places for the trading symbol                |
//| BTC/USD=2, GBPUSD=5, EURUSD=5, USDJPY=2, XAU/USD=2, etc.         |
//+------------------------------------------------------------------+
int GetDecimalPlaces()
{
   string symbol = _Symbol;
   
   // Precious metals (2 decimals)
   if(StringFind(symbol, "XAU") == 0 || StringFind(symbol, "XAG") == 0 ||
      StringFind(symbol, "XPD") == 0 || StringFind(symbol, "XPT") == 0)
   {
      return 2;
   }
   
   // Cryptocurrencies (2 decimals)
   if(StringFind(symbol, "BTC") != -1 || StringFind(symbol, "ETH") != -1 ||
      StringFind(symbol, "LTC") != -1 || StringFind(symbol, "XRP") != -1)
   {
      return 2;
   }
   
   // JPY pairs (2 decimals)
   if(StringFind(symbol, "JPY") != -1)
   {
      return 2;
   }
   
   // GBP, CHF, EUR, AUD, NZD, CAD (5 decimals)
   if(StringFind(symbol, "GBPUSD") != -1 || StringFind(symbol, "GBPJPY") != -1 ||
      StringFind(symbol, "EURUSD") != -1 || StringFind(symbol, "EURGBP") != -1 ||
      StringFind(symbol, "EURCHF") != -1 || StringFind(symbol, "AUDUSD") != -1 ||
      StringFind(symbol, "NZDUSD") != -1 || StringFind(symbol, "USDCAD") != -1 ||
      StringFind(symbol, "USDCHF") != -1 || StringFind(symbol, "CADJPY") != -1)
   {
      return 5;
   }
   
   // Default for most forex (5 decimals)
   return 5;
}

//+------------------------------------------------------------------+
//| Check volume threshold - requires current volume above threshold |
//+------------------------------------------------------------------+
bool CheckVolumeThreshold()
{
   if(VolumeThreshold <= 0) return true;  // Disabled - allow trading
   
   long volume[];
   ArraySetAsSeries(volume, true);
   
   if(CopyTickVolume(_Symbol, PERIOD_CURRENT, 0, 21, volume) < 21)
      return true;  // Not enough data - allow trading
   
   // Calculate average volume (last 20 bars)
   long volume_sum = 0;
   for(int i = 1; i <= 20; i++)
      volume_sum += volume[i];
   
   long avg_volume = volume_sum / 20;
   long required_volume = (long)(avg_volume * VolumeThreshold / 100);
   
   // Current volume must be >= required volume
   return volume[0] >= required_volume;
}

//+------------------------------------------------------------------+
//| Get pip value for the current pair (handles different decimal formats)
//| GBPUSD = 0.0001, XAU/USD = 0.01, BTC = varies, etc.
//+------------------------------------------------------------------+
double GetPipValue()
{
   string symbol = _Symbol;
   
   // Metal pairs (XAU, XAG, XPD, XPT) have 2 decimal places
   if(StringFind(symbol, "XAU") == 0 || StringFind(symbol, "XAG") == 0 ||
      StringFind(symbol, "XPD") == 0 || StringFind(symbol, "XPT") == 0)
   {
      return 0.01;  // Metals: 1 pip = 0.01
   }
   
   // Cryptocurrency pairs (BTC, ETH, etc.) typically have 2 decimals
   if(StringFind(symbol, "BTC") != -1 || StringFind(symbol, "ETH") != -1 ||
      StringFind(symbol, "LTC") != -1 || StringFind(symbol, "XRP") != -1)
   {
      return 0.01;  // Crypto: 1 pip = 0.01
   }
   
   // Standard forex pairs (EURUSD, GBPUSD, USDJPY, etc.) have 4 decimals
   // JPY pairs are exception (2 decimals) but USDJPY is 2 decimals
   if(StringFind(symbol, "JPY") != -1)
   {
      return 0.01;  // JPY pairs: 1 pip = 0.01
   }
   
   // Default for all other pairs: standard 4 decimal forex
   return 0.0001;  // Standard forex: 1 pip = 0.0001
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
   request.magic = MagicNumber;
   request.comment = "Multi-TF EA Buy";
   
   if(OrderSend(request, result))
   {
      Print("Buy order opened successfully at ", price, " with lot size: ", lot_size);
      last_buy_price = price;  // Track for grid/pyramiding
      
      // Track for one-trade-per-day limit
      datetime current_time = TimeCurrent();
      if(last_trade_day != current_time / 86400)
      {
         daily_trade_count = 0;
         last_trade_day = current_time / 86400;
      }
      daily_trade_count++;
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
   request.magic = MagicNumber;
   request.comment = "Multi-TF EA Sell";
   
   if(OrderSend(request, result))
   {
      // Track for one-trade-per-day limit
      datetime current_time = TimeCurrent();
      if(last_trade_day != current_time / 86400)
      {
         daily_trade_count = 0;
         last_trade_day = current_time / 86400;
      }
      daily_trade_count++;
      Print("Sell order opened successfully at ", price, " with lot size: ", lot_size);
      last_sell_price = price;  // Track for grid/pyramiding
   }
   else
      Print("Error opening sell order: ", GetLastError());
}

//+------------------------------------------------------------------+
//| Check if start time allowed for breakout trades                  |
//+------------------------------------------------------------------+
bool CheckStartTimeAllowed()
{
   if(!UseBreakoutEntry)
      return true;  // No time restriction if breakout disabled
      
   datetime current_time = TimeCurrent();
   MqlDateTime time_struct;
   TimeToStruct(current_time, time_struct);
   
   int current_hour = time_struct.hour;
   int current_minute = time_struct.min;
   int start_minutes = BreakoutStartHour * 60 + BreakoutStartMinute;
   int current_minutes = current_hour * 60 + current_minute;
   
   return current_minutes >= start_minutes;
}

//+------------------------------------------------------------------+
//| Check daily trade limit                                          |
//+------------------------------------------------------------------+
bool CheckDailyTradeLimit()
{
   if(!OneTradePerDay)
      return true;  // No limit if disabled
      
   // Reset counter if new day
   datetime current_time = TimeCurrent();
   int current_day = current_time / 86400;
   
   if(last_trade_day != current_day)
   {
      daily_trade_count = 0;
      last_trade_day = current_day;
   }
   
   return daily_trade_count < 1;
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
  const volumeThreshold = config?.volumeThreshold || 0;
  const tradingDays = config?.tradingDays || {
    Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true
  };
  const useBreakoutEntry = config?.useBreakoutEntry || false;
  const breakoutTimeframe = config?.breakoutTimeframe || 'M5';
  const breakoutStartHour = config?.breakoutStartHour || 0;
  const breakoutStartMinute = config?.breakoutStartMinute || 0;
  const oneTradePerDay = config?.oneTradePerDay || false;
  
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
  
  // Extract candlestick significance from analysis (TradingView)
  const tvCandlestickSignificance = primaryTF.analysis.candlestickSignificance;
  const tvCandlestickSignal = tvCandlestickSignificance?.overallSignal || 'Neutral';
  const tvCandlestickReliability = tvCandlestickSignificance?.reliability || 'Medium';
  const tvCandlestickPatterns = tvCandlestickSignificance?.patterns || [];
  const tvCandlestickPatternsStr = tvCandlestickPatterns
    .map((p: any) => `${p.name} (${p.type})`)
    .join(', ') || 'None detected';
  const tvHasBullishCandles = tvCandlestickPatterns.filter((p: any) => p.type === 'Bullish').length > 0;
  const tvHasBearishCandles = tvCandlestickPatterns.filter((p: any) => p.type === 'Bearish').length > 0;
  
  // Get consensus - trust primary timeframe when there's a tie
  const buyCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'BUY').length;
  const sellCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'SELL').length;
  const primaryDirection = primaryTF.analysis.direction?.toUpperCase() || 'NEUTRAL';
  
  // Use consensus if clear majority, otherwise use primary timeframe
  let consensusDirection = 'NEUTRAL';
  if (buyCount > sellCount) {
    consensusDirection = 'BUY';
  } else if (sellCount > buyCount) {
    consensusDirection = 'SELL';
  } else {
    // Tie or no signals: use primary timeframe direction
    consensusDirection = primaryDirection;
  }
  
  const consensusConfidence = Math.max(buyCount, sellCount) / sortedTimeframes.length * 100;
  
  const entryPoint = primaryTF.analysis.entryPoint || 'Market';
  const stopLossRaw = primaryTF.analysis.atrStopLoss?.recommended || primaryTF.analysis.stopLoss;
  const stopLoss = typeof stopLossRaw === 'string' ? stopLossRaw : String(stopLossRaw || 'Not specified');
  const takeProfitRaw = primaryTF.analysis.takeProfit;
  const takeProfit = typeof takeProfitRaw === 'string' ? takeProfitRaw : String(takeProfitRaw || 'Not specified');
  const riskReward = primaryTF.analysis.riskRewardRatio || '2:1';

  // Detect decimal places for this symbol
  const decimalPlaces = getDecimalPlacesForSymbol(symbol);

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
// Decimal Places: ${decimalPlaces} (Auto-detected)
// Timeframes Analyzed: ${sortedTimeframes.map(tf => tf.timeframe).join(', ')}
//
// EA VALIDITY INFORMATION
// ========================================================================
// Chart Analysis Date: ${chartDate}
// EA Valid Until: ${validityDateStr} (${validityDays} days from analysis)
// IMPORTANT: After this date, re-analyze the chart and generate a new strategy
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
//
// CANDLESTICK SIGNIFICANCE ANALYSIS
// ========================================================================
// Overall Signal: ${tvCandlestickSignal} (${tvCandlestickReliability} Reliability)
// Detected Patterns: ${tvCandlestickPatternsStr}
// Bullish Patterns: ${tvHasBullishCandles ? 'Yes' : 'None'}
// Bearish Patterns: ${tvHasBearishCandles ? 'Yes' : 'None'}
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

// === CANDLESTICK PATTERN DETECTION ===
use_candle_patterns = input.bool(true, "Use Candlestick Patterns", group="Candlestick Patterns", tooltip="Enhance entries with candlestick pattern confirmation")
require_candle_confirm = input.bool(false, "Require Candle Confirmation", group="Candlestick Patterns", tooltip="Only enter if candlestick pattern matches direction")
doji_threshold = input.float(0.1, "Doji Body/Range Threshold", minval=0.01, maxval=0.5, step=0.01, group="Candlestick Patterns")
engulfing_ratio = input.float(1.5, "Engulfing Min Ratio", minval=1.1, maxval=3.0, step=0.1, group="Candlestick Patterns")

// AI-detected candlestick patterns from analysis
ai_bullish_candles = ${tvHasBullishCandles}  // AI detected bullish patterns: ${tvCandlestickPatternsStr}
ai_bearish_candles = ${tvHasBearishCandles}  // AI detected bearish patterns

// Real-time candlestick pattern detection
body = math.abs(close - open)
range_size = high - low
upper_wick = high - math.max(open, close)
lower_wick = math.min(open, close) - low

// Previous bar values
prev_body = math.abs(close[1] - open[1])
prev_open = open[1]
prev_close = close[1]

// Doji pattern (small body relative to range)
is_doji = range_size > 0 ? (body / range_size) < doji_threshold : false

// Hammer pattern (bullish reversal)
is_hammer = body > 0 and lower_wick >= body * 2 and upper_wick <= body * 0.5 and close >= open

// Shooting Star pattern (bearish reversal)
is_shooting_star = body > 0 and upper_wick >= body * 2 and lower_wick <= body * 0.5 and close < open

// Bullish Engulfing pattern
is_bullish_engulfing = close > open and prev_close < prev_open and body >= prev_body * engulfing_ratio and open <= prev_close and close >= prev_open

// Bearish Engulfing pattern
is_bearish_engulfing = close < open and prev_close > prev_open and body >= prev_body * engulfing_ratio and open >= prev_close and close <= prev_open

// Combined candlestick signals
bullish_candle = use_candle_patterns ? (ai_bullish_candles or is_hammer[1] or is_bullish_engulfing[1] or is_doji[1]) : true
bearish_candle = use_candle_patterns ? (ai_bearish_candles or is_shooting_star[1] or is_bearish_engulfing[1] or is_doji[1]) : true

// Apply candlestick confirmation requirement
candle_ok_buy = require_candle_confirm ? bullish_candle : true
candle_ok_sell = require_candle_confirm ? bearish_candle : true

// Entry Conditions (${buyCount} timeframe(s) suggest BUY, ${sellCount} suggest SELL)
buy_signal = (${sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'BUY').map(tf => `tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_bullish`).join(' and ') || 'false'})
sell_signal = (${sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'SELL').map(tf => `tf_${tf.timeframe.replace(/[^a-zA-Z0-9]/g, '_')}_bearish`).join(' and ') || 'false'})

buy_condition = allow_buy and buy_signal and volume_confirmed and rsi < rsi_overbought and candle_ok_buy
sell_condition = allow_sell and sell_signal and volume_confirmed and rsi > rsi_oversold and candle_ok_sell

// Plot candlestick pattern signals
plotshape(is_hammer, "Hammer", shape.arrowup, location.belowbar, color.new(color.green, 50), size=size.tiny, display=display.pane)
plotshape(is_shooting_star, "Shooting Star", shape.arrowdown, location.abovebar, color.new(color.red, 50), size=size.tiny, display=display.pane)
plotshape(is_bullish_engulfing, "Bullish Engulf", shape.circle, location.belowbar, color.new(color.lime, 30), size=size.tiny, display=display.pane)
plotshape(is_bearish_engulfing, "Bearish Engulf", shape.circle, location.abovebar, color.new(color.maroon, 30), size=size.tiny, display=display.pane)

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

/**
 * Generate TradeLocker Node.js API code for automated trading
 */
export function generateTradeLockerCode(
  symbol: string,
  timeframes: TimeframeAnalysisData[],
  config?: EAConfig
): string {
  const eaName = config?.eaName || 'Multi-Timeframe Strategy';
  const strategyType = config?.strategyType || 'day_trading';
  const validityDays = config?.validityDays || 30;
  const chartDate = config?.chartDate || new Date().toISOString().split('T')[0];
  const volumeThreshold = config?.volumeThreshold || 0;
  const tradingDays = config?.tradingDays || {
    Monday: true, Tuesday: true, Wednesday: true, Thursday: true, Friday: true, Saturday: true, Sunday: true
  };

  const chartDateObj = new Date(chartDate);
  const validityDate = new Date(chartDateObj);
  validityDate.setDate(validityDate.getDate() + validityDays);
  const validityDateStr = validityDate.toISOString().split('T')[0];

  const sortedTimeframes = [...timeframes].sort((a, b) => {
    const order = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1', 'W1'];
    return order.indexOf(a.timeframe) - order.indexOf(b.timeframe);
  });

  const primaryTF = sortedTimeframes[0];

  const buyCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'BUY').length;
  const sellCount = sortedTimeframes.filter(tf => tf.analysis.direction?.toUpperCase() === 'SELL').length;
  const primaryDirection = primaryTF.analysis.direction?.toUpperCase() || 'NEUTRAL';
  
  let consensusDirection = 'NEUTRAL';
  if (buyCount > sellCount) {
    consensusDirection = 'BUY';
  } else if (sellCount > buyCount) {
    consensusDirection = 'SELL';
  } else {
    consensusDirection = primaryDirection;
  }
  
  const consensusConfidence = Math.max(buyCount, sellCount) / sortedTimeframes.length * 100;

  const detectedPatterns = sortedTimeframes
    .flatMap(tf => tf.analysis.patterns || [])
    .map(p => typeof p === 'string' ? p : (p && typeof p.name === 'string' ? p.name : null))
    .filter((p): p is string => typeof p === 'string' && p.length > 0)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ');

  const stopLoss = primaryTF.analysis.stopLoss || 'ATR-based';
  const takeProfit = primaryTF.analysis.takeProfit || 'AI Target';

  const tfListStr = sortedTimeframes.map(tf => tf.timeframe).join(', ');
  const tfTableStr = sortedTimeframes.map((tf, i) => 
    `  ${i+1}. ${tf.timeframe}: ${tf.analysis.direction} (${tf.analysis.confidence || 'N/A'}% confidence)`
  ).join('\n');

  const decimalPlaces = getDecimalPlacesForSymbol(symbol);

  const code = `/**
 * TradeLocker Automated Trading Strategy
 * Generated by VEDD Chart Analysis Tool - https://vedd.io
 * 
 * Strategy: ${eaName}
 * Symbol: ${symbol}
 * Decimal Places: ${decimalPlaces} (Auto-detected)
 * Direction: ${consensusDirection} (${consensusConfidence.toFixed(0)}% confidence)
 * Valid Until: ${validityDateStr}
 * 
 * SETUP INSTRUCTIONS:
 * 1. Save this file as: strategy.js
 * 2. Install axios: npm install axios
 * 3. Replace YOUR_API_KEY with TradeLocker API key
 * 4. Replace YOUR_ACCOUNT_ID with account ID
 * 5. Run: node strategy.js
 */

const axios = require('axios');

const API_KEY = 'YOUR_API_KEY';
const ACCOUNT_ID = 'YOUR_ACCOUNT_ID';
const API_URL = 'https://api.tradelocker.com/v1';
const SYMBOL = '${symbol}';
const STRATEGY_NAME = '${eaName}';
const DECIMAL_PLACES = ${decimalPlaces};  // Auto-detected decimal precision

// Helper function to round prices to correct decimal places
function roundPrice(price, decimals = DECIMAL_PLACES) {
  const multiplier = Math.pow(10, decimals);
  return Math.round(price * multiplier) / multiplier;
}

// ===== CONFIGURATION =====
const config = {
  symbol: SYMBOL,
  decimalPlaces: DECIMAL_PLACES,
  direction: '${consensusDirection}',
  confidence: ${consensusConfidence.toFixed(0)},
  lotSize: 0.01,
  stopLoss: '${stopLoss}',
  takeProfit: '${takeProfit}',
  trailingStop: 50,
  maxOpenTrades: 1,
  tradingEnabled: false  // Set to true to enable live trading
};

// ===== MULTI-TIMEFRAME ANALYSIS RESULTS =====
const timeframes = [
${tfTableStr}
];

const analysis = {
  consensusDirection: '${consensusDirection}',
  confidence: ${consensusConfidence.toFixed(0)},
  patterns: '${detectedPatterns || 'None detected'}',
  entryPoint: '${primaryTF.analysis.entryPoint || 'Market entry'}',
  timeframeCount: ${sortedTimeframes.length}
};

// ===== API HELPER FUNCTIONS =====
function getApiUrl(endpoint) {
  return API_URL + endpoint;
}

function getHeaders() {
  return {
    'Authorization': 'Bearer ' + API_KEY,
    'Content-Type': 'application/json'
  };
}

// ===== TRADING FUNCTIONS =====

async function getAccountBalance() {
  try {
    const response = await axios.get(getApiUrl('/accounts/' + ACCOUNT_ID + '/balance'), { headers: getHeaders() });
    console.log('Account Balance:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error getting account balance:', error.message);
    return null;
  }
}

async function getCurrentPrice() {
  try {
    const response = await axios.get(getApiUrl('/quotes/' + SYMBOL), { headers: getHeaders() });
    const price = response.data.bid || response.data.ask;
    console.log('Current ' + SYMBOL + ' price:', price);
    return price;
  } catch (error) {
    console.error('Error getting current price:', error.message);
    return null;
  }
}

async function openTrade(direction, stopLoss, takeProfit) {
  if (!config.tradingEnabled) {
    console.log('Trading is DISABLED. Set tradingEnabled = true to execute trades.');
    return null;
  }
  
  try {
    const orderData = {
      symbol: SYMBOL,
      side: direction === 'BUY' ? 'buy' : 'sell',
      type: 'market',
      volume: config.lotSize,
      stopLoss: parseFloat(stopLoss),
      takeProfit: parseFloat(takeProfit),
      comment: STRATEGY_NAME + ' - ' + direction
    };

    const response = await axios.post(getApiUrl('/trading/orders'), orderData, { headers: getHeaders() });
    console.log('Trade opened - OK:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error opening trade:', error.message);
    return null;
  }
}

async function getOpenTrades() {
  try {
    const response = await axios.get(getApiUrl('/accounts/' + ACCOUNT_ID + '/trades?status=open'), { headers: getHeaders() });
    console.log('Open Trades:', response.data);
    return response.data || [];
  } catch (error) {
    console.error('Error fetching open trades:', error.message);
    return [];
  }
}

async function closeTrade(tradeId) {
  try {
    const response = await axios.post(getApiUrl('/trading/orders/' + tradeId + '/close'), {}, { headers: getHeaders() });
    console.log('Trade closed - OK:', response.data);
    return response.data;
  } catch (error) {
    console.error('Error closing trade:', error.message);
    return null;
  }
}

// ===== MAIN STRATEGY EXECUTION =====

async function executeStrategy() {
  console.log('\\n' + '='.repeat(60));
  console.log('VEDD AI Trading Strategy Bot');
  console.log('='.repeat(60));
  console.log('Strategy: ' + STRATEGY_NAME);
  console.log('Symbol: ' + SYMBOL);
  console.log('Direction: ' + analysis.consensusDirection + ' (' + analysis.confidence + '% confidence)');
  console.log('Patterns: ' + analysis.patterns);
  console.log('Timeframes Analyzed: ' + analysis.timeframeCount);
  console.log('='.repeat(60) + '\\n');
  
  const currentPrice = await getCurrentPrice();
  if (!currentPrice) {
    console.error('ERROR: Cannot get current price. Exiting.');
    return;
  }
  
  const openTrades = await getOpenTrades();
  const hasOpenPosition = openTrades.length > 0;
  
  console.log('Open Positions: ' + openTrades.length);
  
  if (analysis.consensusDirection === 'BUY' && !hasOpenPosition) {
    console.log('BUY signal detected - opening trade...');
    await openTrade('BUY', config.stopLoss, config.takeProfit);
  } else if (analysis.consensusDirection === 'BUY' && hasOpenPosition) {
    console.log('BUY signal but position already open');
  }
  
  if (analysis.consensusDirection === 'SELL' && !hasOpenPosition) {
    console.log('SELL signal detected - opening trade...');
    await openTrade('SELL', config.stopLoss, config.takeProfit);
  } else if (analysis.consensusDirection === 'SELL' && hasOpenPosition) {
    console.log('SELL signal but position already open');
  }
  
  if (analysis.consensusDirection === 'NEUTRAL') {
    console.log('NEUTRAL - No clear direction. No action taken.');
  }
  
  console.log('\\nStrategy execution completed.');
}

// ===== RUN BOT =====
console.log('Starting TradeLocker Strategy Bot...');
executeStrategy().catch(error => {
  console.error('FATAL ERROR:', error);
  process.exit(1);
});

module.exports = { config, analysis, timeframes, getAccountBalance, getCurrentPrice, openTrade, closeTrade, getOpenTrades, executeStrategy };
`;
  return code;
}

/**
 * Generate Spread Trading EA (Pair Trading Strategy)
 * Trades two correlated instruments simultaneously for hedged strategies
 */
export function generateSpreadEACode(
  baseSymbol: string,
  hedgeSymbol: string,
  timeframes: TimeframeAnalysisData[],
  config?: EAConfig
): string {
  const eaName = config?.eaName || `${baseSymbol} vs ${hedgeSymbol} Spread`;
  const spreadType = config?.spreadType || 'convergence';
  const hedgeRatio = config?.hedgeRatio || 1.0;
  const expectedCorrelation = config?.expectedCorrelation || 0.85;
  const strategyType = config?.strategyType || 'day_trading';
  const validityDays = config?.validityDays || 30;
  const chartDate = config?.chartDate || new Date().toISOString().split('T')[0];

  const chartDateObj = new Date(chartDate);
  const validityDate = new Date(chartDateObj);
  validityDate.setDate(validityDate.getDate() + validityDays);
  const validityDateStr = validityDate.toISOString().split('T')[0];

  const spreadTypeDesc = {
    'convergence': 'Trade convergence of two correlated pairs to their mean',
    'divergence': 'Trade divergence when correlation breaks down',
    'momentum': 'Trade momentum in spread ratio movement',
    'correlation': 'Trade changes in correlation strength'
  }[spreadType] || 'Pair trading strategy';

  return `//+------------------------------------------------------------------+
//|                              ${eaName}.mq5 |
//|                 SPREAD/PAIR TRADING STRATEGY (Hedged)               |
//|                        Generated by VEDD Chart Analysis Tool         |
//+------------------------------------------------------------------+

#property copyright "Generated by VEDD"
#property link      "https://vedd.io"
#property version   "2.00"
#property description "${eaName}"
#property description "Spread Trading - ${spreadType}"

//--- SPREAD CONFIGURATION
//========================================================================
// Base Symbol: ${baseSymbol}
// Hedge Symbol: ${hedgeSymbol}
// Spread Type: ${spreadType}
// Description: ${spreadTypeDesc}
// Hedge Ratio: ${hedgeRatio}:1 (${hedgeSymbol} to ${baseSymbol})
// Expected Correlation: ${(expectedCorrelation * 100).toFixed(0)}%
// EA Valid Until: ${validityDateStr}
//========================================================================

//--- INPUTS
input group "=== Spread Configuration ==="
input string BASE_SYMBOL = "${baseSymbol}";
input string HEDGE_SYMBOL = "${hedgeSymbol}";
input ENUM_SPREAD_TYPE SPREAD_MODE = SPREAD_${spreadType.toUpperCase()};
input double HEDGE_RATIO = ${hedgeRatio};
input double EXPECTED_CORRELATION = ${expectedCorrelation};

input group "=== Risk Management ==="
input double BASE_LOT_SIZE = 0.01;
input double CORRELATION_THRESHOLD = 0.70;  // Min correlation to trade
input double MAX_SPREAD_DEVIATION = 2.0;    // Max deviation in pips
input double CONVERGENCE_TARGET = 0.5;      // Target convergence in pips

input group "=== Stop Loss & Take Profit ==="
input bool USE_SPREAD_SL = true;
input double SPREAD_SL_PIPS = 50;
input double SPREAD_TP_PIPS = 100;

//--- ENUMERATIONS
enum ENUM_SPREAD_TYPE {
  SPREAD_CONVERGENCE = 0,  // Trade pairs moving toward each other
  SPREAD_DIVERGENCE = 1,   // Trade pairs moving apart
  SPREAD_MOMENTUM = 2,     // Trade spread ratio momentum
  SPREAD_CORRELATION = 3   // Trade correlation changes
};

//--- GLOBAL VARIABLES
double base_bid, base_ask, hedge_bid, hedge_ask;
double current_spread, spread_ma;
double correlation_value = ${expectedCorrelation};
int base_position = 0, hedge_position = 0;
static int bar_count = 0;

//+------------------------------------------------------------------+
//| Calculate current spread between two symbols                     |
//+------------------------------------------------------------------+
double CalculateSpread(double base_price, double hedge_price) {
  // Spread = (Base Price - Hedge Price) normalized
  return base_price - (hedge_price * HEDGE_RATIO);
}

//+------------------------------------------------------------------+
//| Check if correlation has changed (risk management)               |
//+------------------------------------------------------------------+
bool CheckCorrelationHealth() {
  // In live trading, use correlation calculation from market data
  // For now: static check against expected correlation
  double current_correlation = correlation_value;
  
  if (current_correlation < CORRELATION_THRESHOLD) {
    Print("WARNING: Correlation dropped below threshold: ", current_correlation);
    return false;  // Don't trade if correlation is too weak
  }
  return true;
}

//+------------------------------------------------------------------+
//| Generate entry signal based on spread type                       |
//+------------------------------------------------------------------+
bool CheckSpreadSignal(bool &is_convergence_signal) {
  if (!CheckCorrelationHealth()) return false;
  
  current_spread = CalculateSpread(base_bid, hedge_bid);
  spread_ma = iMA(_Symbol, PERIOD_CURRENT, 20, 0, MODE_SMA, 0);
  
  bool signal = false;
  
  switch(SPREAD_MODE) {
    case SPREAD_CONVERGENCE:
      // Long spread if price > MA (expect convergence downward)
      // Short spread if price < MA (expect convergence upward)
      is_convergence_signal = true;
      signal = (MathAbs(current_spread - spread_ma) > CONVERGENCE_TARGET);
      break;
      
    case SPREAD_DIVERGENCE:
      // Trade when spread breaks out from MA
      signal = (current_spread > spread_ma + MAX_SPREAD_DEVIATION ||
                current_spread < spread_ma - MAX_SPREAD_DEVIATION);
      break;
      
    case SPREAD_MOMENTUM:
      // Trade momentum in spread changes
      signal = true;  // Calculate momentum delta
      break;
      
    case SPREAD_CORRELATION:
      // Trade when correlation changes
      signal = true;  // Check correlation change rate
      break;
  }
  
  return signal;
}

//+------------------------------------------------------------------+
//| Open spread trade (LONG: Long Base + Short Hedge)                |
//+------------------------------------------------------------------+
void OpenSpreadLong() {
  // Buy Base Symbol
  MqlTradeRequest buy_base = {};
  buy_base.action = TRADE_ACTION_DEAL;
  buy_base.symbol = BASE_SYMBOL;
  buy_base.type = ORDER_TYPE_BUY;
  buy_base.volume = BASE_LOT_SIZE;
  buy_base.price = SymbolInfoDouble(BASE_SYMBOL, SYMBOL_ASK);
  buy_base.sl = USE_SPREAD_SL ? buy_base.price - (SPREAD_SL_PIPS * SymbolInfoDouble(BASE_SYMBOL, SYMBOL_POINT)) : 0;
  buy_base.tp = buy_base.price + (SPREAD_TP_PIPS * SymbolInfoDouble(BASE_SYMBOL, SYMBOL_POINT));
  buy_base.comment = "Spread LONG";
  
  // Short Hedge Symbol
  MqlTradeRequest sell_hedge = {};
  sell_hedge.action = TRADE_ACTION_DEAL;
  sell_hedge.symbol = HEDGE_SYMBOL;
  sell_hedge.type = ORDER_TYPE_SELL;
  sell_hedge.volume = BASE_LOT_SIZE * HEDGE_RATIO;
  sell_hedge.price = SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_BID);
  sell_hedge.sl = USE_SPREAD_SL ? sell_hedge.price + (SPREAD_SL_PIPS * SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_POINT)) : 0;
  sell_hedge.tp = sell_hedge.price - (SPREAD_TP_PIPS * SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_POINT));
  sell_hedge.comment = "Spread LONG Hedge";
  
  MqlTradeResult base_result = {}, hedge_result = {};
  OrderSend(buy_base, base_result);
  OrderSend(sell_hedge, hedge_result);
  
  Print("Spread LONG opened: Buy ", BASE_SYMBOL, " @ ", buy_base.price, " | Sell ", HEDGE_SYMBOL, " @ ", sell_hedge.price);
}

//+------------------------------------------------------------------+
//| Open spread trade (SHORT: Short Base + Long Hedge)               |
//+------------------------------------------------------------------+
void OpenSpreadShort() {
  // Short Base Symbol
  MqlTradeRequest sell_base = {};
  sell_base.action = TRADE_ACTION_DEAL;
  sell_base.symbol = BASE_SYMBOL;
  sell_base.type = ORDER_TYPE_SELL;
  sell_base.volume = BASE_LOT_SIZE;
  sell_base.price = SymbolInfoDouble(BASE_SYMBOL, SYMBOL_BID);
  sell_base.sl = USE_SPREAD_SL ? sell_base.price + (SPREAD_SL_PIPS * SymbolInfoDouble(BASE_SYMBOL, SYMBOL_POINT)) : 0;
  sell_base.tp = sell_base.price - (SPREAD_TP_PIPS * SymbolInfoDouble(BASE_SYMBOL, SYMBOL_POINT));
  sell_base.comment = "Spread SHORT";
  
  // Long Hedge Symbol
  MqlTradeRequest buy_hedge = {};
  buy_hedge.action = TRADE_ACTION_DEAL;
  buy_hedge.symbol = HEDGE_SYMBOL;
  buy_hedge.type = ORDER_TYPE_BUY;
  buy_hedge.volume = BASE_LOT_SIZE * HEDGE_RATIO;
  buy_hedge.price = SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_ASK);
  buy_hedge.sl = USE_SPREAD_SL ? buy_hedge.price - (SPREAD_SL_PIPS * SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_POINT)) : 0;
  buy_hedge.tp = buy_hedge.price + (SPREAD_TP_PIPS * SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_POINT));
  buy_hedge.comment = "Spread SHORT Hedge";
  
  MqlTradeResult base_result = {}, hedge_result = {};
  OrderSend(sell_base, base_result);
  OrderSend(buy_hedge, hedge_result);
  
  Print("Spread SHORT opened: Sell ", BASE_SYMBOL, " @ ", sell_base.price, " | Buy ", HEDGE_SYMBOL, " @ ", buy_hedge.price);
}

//+------------------------------------------------------------------+
//| Main trading function                                             |
//+------------------------------------------------------------------+
void OnTick() {
  base_bid = SymbolInfoDouble(BASE_SYMBOL, SYMBOL_BID);
  base_ask = SymbolInfoDouble(BASE_SYMBOL, SYMBOL_ASK);
  hedge_bid = SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_BID);
  hedge_ask = SymbolInfoDouble(HEDGE_SYMBOL, SYMBOL_ASK);
  
  bar_count++;
  if (bar_count % 50 == 0) {
    Print("========================================");
    Print("SPREAD TRADING - ", eaName);
    Print("Base Symbol (", BASE_SYMBOL, "): Bid=", base_bid, " Ask=", base_ask);
    Print("Hedge Symbol (", HEDGE_SYMBOL, "): Bid=", hedge_bid, " Ask=", hedge_ask);
    Print("Spread: ", current_spread, " | Correlation: ", correlation_value);
    Print("========================================");
  }
  
  bool is_convergence = false;
  if (CheckSpreadSignal(is_convergence)) {
    if (is_convergence && current_spread > spread_ma) {
      OpenSpreadLong();
    } else if (!is_convergence && current_spread < spread_ma) {
      OpenSpreadShort();
    }
  }
}
`;
}
