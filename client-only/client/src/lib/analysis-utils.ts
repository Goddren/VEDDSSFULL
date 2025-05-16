import { ChartAnalysis } from "@shared/schema";
import { ChartAnalysisResponse, Pattern, Indicator, SupportResistanceLevel } from "@shared/types";

import { VolatilityData } from '@shared/types';

/**
 * Calculates a volatility score based on chart analysis data and symbol
 * @param analysis The chart analysis data
 * @returns A volatility score from 0-100
 */
export function calculateVolatilityScore(analysis: ChartAnalysis): number {
  // Default medium volatility
  let baseScore = 50;
  
  // Adjust based on currency pair if applicable
  const symbol = analysis.symbol || 'Unknown';
  
  if (symbol.includes("JPY") || symbol.includes("GBP")) {
    // JPY and GBP pairs tend to be more volatile
    baseScore += 10;
  } else if (symbol.includes("CHF") || symbol.includes("EUR")) {
    // CHF and EUR pairs tend to be less volatile
    baseScore -= 5;
  } else if (symbol.includes("BTC") || symbol.includes("ETH") || symbol.includes("XRP")) {
    // Crypto tends to be highly volatile
    baseScore += 20;
  }

  // Adjust based on patterns if available
  const patterns = typeof analysis.patterns === 'string' 
    ? JSON.parse(analysis.patterns as string) 
    : analysis.patterns;
    
  if (Array.isArray(patterns)) {
    patterns.forEach((pattern: any) => {
      if (typeof pattern.name === 'string') {
        // Certain patterns indicate higher volatility
        if (pattern.name.includes("Breakout") || 
            pattern.name.includes("Double") || 
            pattern.name.includes("Triple") ||
            pattern.name.includes("Head") ||
            pattern.name.includes("Flag")) {
          baseScore += 5;
        }
      }
    });
  }
  
  // Adjust based on confidence
  if (analysis.confidence) {
    if (analysis.confidence.includes("High")) {
      baseScore -= 5; // High confidence often means less volatility risk
    } else if (analysis.confidence.includes("Low")) {
      baseScore += 10; // Low confidence often means more volatility risk
    }
  }
  
  // Ensure the score stays within 0-100 range
  return Math.max(0, Math.min(100, baseScore));
}

/**
 * Calculates detailed volatility data based on analysis and trading direction
 * @param analysis The chart analysis data
 * @returns Volatility data object
 */
export function calculateVolatilityData(analysis: ChartAnalysis): VolatilityData {
  // Calculate volatility score first
  const score = calculateVolatilityScore(analysis);
  
  // Calculate ATR based on stop loss and take profit if available
  let atr = 0.0010; // Default ATR
  if (analysis.stopLoss && analysis.price) {
    try {
      const stopLossNum = parseFloat(analysis.stopLoss.replace(/[^0-9.]/g, ''));
      const currentPriceNum = parseFloat(analysis.price.replace(/[^0-9.]/g, ''));
      
      if (!isNaN(stopLossNum) && !isNaN(currentPriceNum)) {
        // Calculate a rough ATR based on stop loss distance
        const slDistance = Math.abs(currentPriceNum - stopLossNum);
        if (slDistance > 0) {
          atr = parseFloat((slDistance / 2).toFixed(5));
        }
      }
    } catch (error) {
      console.log("Error calculating ATR from price values:", error);
    }
  }
  
  // Calculate standard deviation - typically 1.5-2x ATR
  const standardDeviation = parseFloat((atr * 1.5).toFixed(5));
  
  // Calculate price range
  let range = atr * 10; // Default range is 10x ATR
  
  // Historical rank is based on the volatility score
  const historicalRank = score;
  
  // Risk factor is influenced by volatility and direction
  let riskFactor = score;
  if (analysis.direction.toLowerCase() === 'buy') {
    riskFactor = score - 5; // Buying is often slightly less risky in volatile markets
  } else {
    riskFactor = score + 5; // Selling can be more risky in volatile markets
  }
  
  // Adjust risk factor based on confidence
  if (analysis.confidence?.toLowerCase() === 'high') {
    riskFactor -= 10;
  } else if (analysis.confidence?.toLowerCase() === 'low') {
    riskFactor += 10;
  }
  
  // Ensure all values are within valid ranges
  riskFactor = Math.max(0, Math.min(100, riskFactor));
  
  return {
    score,
    atr,
    standardDeviation,
    range,
    historicalRank,
    riskFactor
  };
}

/**
 * Converts a ChartAnalysis database model to a ChartAnalysisResponse type
 * that's compatible with the analysis-result component
 */
export function convertToChartAnalysisResponse(analysis: ChartAnalysis): ChartAnalysisResponse {
  if (!analysis) {
    throw new Error("Cannot convert undefined or null analysis");
  }

  // Parse JSON fields if they're stored as strings
  let patterns: Pattern[] = [];
  try {
    patterns = typeof analysis.patterns === 'string' 
      ? JSON.parse(analysis.patterns as string) 
      : (analysis.patterns || []);
  } catch (e) {
    console.error("Error parsing patterns", e);
  }
    
  let indicators: Indicator[] = [];
  try {
    indicators = typeof analysis.indicators === 'string' 
      ? JSON.parse(analysis.indicators as string) 
      : (analysis.indicators || []);
  } catch (e) {
    console.error("Error parsing indicators", e);
  }
    
  let supportResistance: SupportResistanceLevel[] = [];
  try {
    supportResistance = typeof analysis.supportResistance === 'string' 
      ? JSON.parse(analysis.supportResistance as string) 
      : (analysis.supportResistance || []);
  } catch (e) {
    console.error("Error parsing support/resistance", e);
  }

  // Create default time frame analysis
  const timeframeAnalysis = [
    {
      timeframe: analysis.timeframe || "Unknown",
      trend: analysis.trend || "Neutral"
    }
  ];

  // Create default volume analysis based on currency pair
  const symbol = analysis.symbol || "Unknown";
  const volumeAnalysis = [
    {
      period: "Asian Session",
      volume: symbol.includes("JPY") || symbol.includes("AUD") || symbol.includes("NZD") ? "High" : "Medium",
      activity: symbol.includes("JPY") ? "Strong JPY movements" : "Moderate activity",
      quality: symbol.includes("JPY") || symbol.includes("AUD") || symbol.includes("NZD") ? "Good" : "Average"
    },
    {
      period: "European Session",
      volume: symbol.includes("EUR") || symbol.includes("GBP") || symbol.includes("CHF") ? "High" : "Medium",
      activity: symbol.includes("EUR") || symbol.includes("GBP") ? "Strong volatility" : "Normal trading conditions",
      quality: symbol.includes("EUR") || symbol.includes("GBP") || symbol.includes("CHF") ? "Excellent" : "Good"
    },
    {
      period: "US Session",
      volume: symbol.includes("USD") || symbol.includes("CAD") ? "High" : "Medium",
      activity: symbol.includes("USD") ? "Peak USD trading volume" : "Standard trading volume",
      quality: symbol.includes("USD") || symbol.includes("CAD") ? "Excellent" : "Good"
    }
  ];

  // Calculate volatility data
  const volatilityScore = calculateVolatilityScore(analysis);
  const volatilityData = calculateVolatilityData(analysis);

  // Convert the database model to the response format
  return {
    symbol: analysis.symbol || "Unknown",
    timeframe: analysis.timeframe || "Unknown",
    currentPrice: analysis.price || "Unknown",
    direction: analysis.direction,
    trend: analysis.trend,
    confidence: analysis.confidence,
    entryPoint: analysis.entryPoint,
    exitPoint: analysis.exitPoint,
    stopLoss: analysis.stopLoss,
    takeProfit: analysis.takeProfit,
    riskRewardRatio: analysis.riskRewardRatio || "Unknown",
    potentialPips: analysis.potentialPips || "Unknown",
    volatilityScore,
    volatilityData,
    patterns: patterns,
    indicators: indicators,
    supportResistance: supportResistance,
    timeframeAnalysis: timeframeAnalysis,
    volumeAnalysis: volumeAnalysis,
    recommendation: analysis.recommendation || "No specific recommendation available",
    steps: []
  };
}