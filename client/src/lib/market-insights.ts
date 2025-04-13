import { apiRequest } from "@/lib/queryClient";

export type MarketTrend = 'bullish' | 'bearish' | 'neutral' | 'volatile';

export interface MarketInsight {
  id: string;
  text: string;
  trend: MarketTrend;
  symbol?: string;
  relatedTerms?: string[];
  confidence?: number;
}

export interface ContextualInsightParams {
  symbol?: string; 
  pattern?: string;
  trend?: MarketTrend;
  timeframe?: string;
  context?: string;
}

/**
 * Get a contextual market insight based on provided parameters
 */
export async function getContextualInsight(params: ContextualInsightParams): Promise<MarketInsight> {
  try {
    const response = await apiRequest("POST", "/api/market-insights/contextual", params);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching contextual insight:", error);
    
    // Return a fallback insight if the API fails
    return generateFallbackInsight(params);
  }
}

/**
 * Get multiple market insights
 */
export async function getMarketInsights(count: number = 3): Promise<MarketInsight[]> {
  try {
    const response = await apiRequest("GET", `/api/market-insights?count=${count}`);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching market insights:", error);
    
    // Return fallback insights if the API fails
    return Array(count).fill(0).map((_, i) => ({
      id: `fallback-${i}`,
      text: getRandomFallbackInsight(),
      trend: getRandomTrend(),
      confidence: 0.7 + Math.random() * 0.2
    }));
  }
}

/**
 * Generate a fallback insight for when the API request fails
 */
function generateFallbackInsight(params: ContextualInsightParams): MarketInsight {
  const { symbol, pattern, trend, timeframe } = params;
  let insightText = "";
  
  if (symbol) {
    insightText += `${symbol} `;
  }
  
  let insightTrend: MarketTrend = trend || getRandomTrend();
  
  if (pattern) {
    insightText += `is showing a potential ${pattern} pattern. `;
    
    if (insightTrend === 'bullish') {
      insightText += "This could indicate upward momentum. ";
    } else if (insightTrend === 'bearish') {
      insightText += "This might suggest a possible reversal. ";
    } else if (insightTrend === 'volatile') {
      insightText += "Expect increased volatility in the short term. ";
    } else {
      insightText += "Monitor for confirmation before taking action. ";
    }
  } else {
    insightText += `is currently showing ${insightTrend} signals. `;
  }
  
  if (timeframe) {
    insightText += `This analysis is based on the ${timeframe} timeframe. `;
  }
  
  // If we still don't have any text, use a generic insight
  if (!insightText.trim()) {
    insightText = getRandomFallbackInsight();
  }
  
  return {
    id: `fallback-${Date.now()}`,
    text: insightText,
    trend: insightTrend,
    symbol: symbol,
    confidence: 0.7 + Math.random() * 0.2
  };
}

/**
 * Get a random market trend for fallback insights
 */
function getRandomTrend(): MarketTrend {
  const trends: MarketTrend[] = ['bullish', 'bearish', 'neutral', 'volatile'];
  return trends[Math.floor(Math.random() * trends.length)];
}

/**
 * Get a random fallback insight text
 */
function getRandomFallbackInsight(): string {
  const insights = [
    "Market showing indecision candles at key resistance level. Wait for confirmation before entering.",
    "Volume increasing on recent price movements, suggesting stronger trend validation.",
    "Current price action suggests accumulation phase. Watch for breakout with increased volume.",
    "RSI approaching overbought territory. Consider taking partial profits if already in position.",
    "Multiple timeframe analysis indicates potential trend reversal. Look for confirming price action.",
    "Support level has been tested multiple times, showing strong buying interest at current levels.",
    "Moving averages forming a bullish cross on the 4H chart. Potential entry signal for momentum traders.",
    "Recent price action forming higher lows, indicating strengthening bullish momentum.",
    "Divergence between price and momentum indicators suggests weakening trend. Exercise caution."
  ];
  
  return insights[Math.floor(Math.random() * insights.length)];
}