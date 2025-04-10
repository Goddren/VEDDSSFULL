import { ChartAnalysis } from "@shared/schema";
import { ChartAnalysisResponse, Pattern, Indicator, SupportResistanceLevel } from "@shared/types";

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
    patterns: patterns,
    indicators: indicators,
    supportResistance: supportResistance,
    timeframeAnalysis: timeframeAnalysis,
    volumeAnalysis: volumeAnalysis,
    recommendation: analysis.recommendation || "No specific recommendation available",
    steps: []
  };
}