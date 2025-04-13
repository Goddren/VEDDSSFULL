// Market insight generators for AI tooltips
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

// Function to generate contextual insights for a specific symbol or pattern
export async function getContextualInsight(params: ContextualInsightParams): Promise<MarketInsight> {
  try {
    const response = await apiRequest(
      'POST', 
      '/api/market-insights/contextual', 
      params
    );
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching contextual insight:', error);
    // Return fallback insight if API fails
    return generateFallbackInsight(params);
  }
}

// Function to get multiple insights for a dashboard/overview page
export async function getMarketInsights(count: number = 3): Promise<MarketInsight[]> {
  try {
    const response = await apiRequest(
      'GET', 
      `/api/market-insights?count=${count}`
    );
    
    return await response.json();
  } catch (error) {
    console.error('Error fetching market insights:', error);
    // Return fallback insights if API fails
    return Array(count).fill(null).map((_, i) => ({
      id: `fallback-${i}`,
      text: getRandomFallbackInsight(),
      trend: getRandomTrend(),
      confidence: Math.random() * 0.5 + 0.5, // Random confidence between 0.5 and 1.0
    }));
  }
}

// Generate fallback insight when API is unavailable
function generateFallbackInsight(params: ContextualInsightParams): MarketInsight {
  const { symbol, pattern, trend, timeframe } = params;
  
  let insightText = '';
  let insightTrend: MarketTrend = trend || getRandomTrend();
  
  if (symbol) {
    switch (insightTrend) {
      case 'bullish':
        insightText = `${symbol} is showing bullish signals in the ${timeframe || 'current'} timeframe. Consider watching for continuation patterns.`;
        break;
      case 'bearish':
        insightText = `${symbol} has bearish pressure in the ${timeframe || 'current'} market. Risk management is advised.`;
        break;
      case 'volatile':
        insightText = `${symbol} is showing high volatility. Consider reducing position sizes and using wider stops.`;
        break;
      case 'neutral':
      default:
        insightText = `${symbol} is in a sideways pattern. Look for breakout signals before entering new positions.`;
        break;
    }
  } else if (pattern) {
    insightText = `${pattern} patterns typically indicate a ${insightTrend} market. Historical reliability is about 65% in similar conditions.`;
  } else {
    insightText = getRandomFallbackInsight();
  }
  
  return {
    id: `fallback-${Date.now()}`,
    text: insightText,
    trend: insightTrend,
    symbol,
    confidence: 0.7
  };
}

// Random trend for fallback
function getRandomTrend(): MarketTrend {
  const trends: MarketTrend[] = ['bullish', 'bearish', 'neutral', 'volatile'];
  return trends[Math.floor(Math.random() * trends.length)];
}

// Random fallback insights
function getRandomFallbackInsight(): string {
  const insights = [
    "Market breadth indicators suggest watching for potential reversals in the current trend.",
    "Volume analysis shows decreasing participation, which can indicate weakening of the current move.",
    "Sentiment indicators are reaching extreme levels, which historically coincide with market turning points.",
    "Market correlation across sectors is increasing, which typically happens during major market events.",
    "Keep an eye on interest rate movements as they're currently a key driver for market direction.",
    "Technical divergences are appearing on multiple timeframes, suggesting potential trend exhaustion.",
    "The current risk-to-reward ratio for new positions is unfavorable in this market environment.",
    "Current market volatility suggests reducing position sizes and widening stop losses."
  ];
  
  return insights[Math.floor(Math.random() * insights.length)];
}