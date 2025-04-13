import { Request, Response } from "express";
import { openai } from "./openai";

type MarketTrend = 'bullish' | 'bearish' | 'neutral' | 'volatile';

interface MarketInsight {
  id: string;
  text: string;
  trend: MarketTrend;
  symbol?: string;
  relatedTerms?: string[];
  confidence?: number;
}

interface ContextualInsightParams {
  symbol?: string; 
  pattern?: string;
  trend?: MarketTrend;
  timeframe?: string;
  context?: string;
}

/**
 * Generate a contextual market insight based on provided parameters
 */
export async function generateContextualInsight(params: ContextualInsightParams): Promise<MarketInsight> {
  const { symbol = "The market", pattern, trend, timeframe, context } = params;
  
  try {
    // Build the prompt based on provided parameters
    let prompt = `Generate a concise and insightful trading analysis for ${symbol}`;
    
    if (pattern) {
      prompt += ` focusing on the ${pattern} pattern`;
    }
    
    if (timeframe) {
      prompt += ` on the ${timeframe} timeframe`;
    }
    
    if (context) {
      prompt += ` with this additional context: ${context}`;
    }
    
    prompt += `. Determine if the market is bullish, bearish, neutral, or volatile based on the analysis.`;
    prompt += ` Provide a confidence score between 0 and 1.`;
    prompt += ` Format the response as a JSON object with these fields: { "text": "the insight text", "trend": "bullish|bearish|neutral|volatile", "confidence": 0.XX }`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system", 
          content: "You are a professional market analyst specialized in technical analysis. Provide accurate, actionable trading insights that are concise and specific."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
    
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }
    
    const parsed = JSON.parse(content);
    
    // Ensure the trend is one of the allowed values
    const validTrends: MarketTrend[] = ['bullish', 'bearish', 'neutral', 'volatile'];
    const marketTrend = validTrends.includes(parsed.trend as MarketTrend) 
      ? parsed.trend as MarketTrend 
      : trend || 'neutral';
    
    return {
      id: `insight-${Date.now()}`,
      text: parsed.text,
      trend: marketTrend,
      symbol: symbol,
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
      relatedTerms: parsed.relatedTerms || []
    };
  } catch (error) {
    console.error("Error generating contextual market insight:", error);
    
    // Return a basic insight if AI generation fails
    return {
      id: `fallback-${Date.now()}`,
      text: `Analysis for ${symbol}: Always confirm signals with additional indicators before making trading decisions.`,
      trend: trend || 'neutral',
      symbol: symbol,
      confidence: 0.7
    };
  }
}

/**
 * Generate multiple market insights
 */
export async function generateMarketInsights(count: number = 3): Promise<MarketInsight[]> {
  try {
    const prompt = `Generate ${count} different market insights for various trading instruments (forex, crypto, stocks, indices). For each insight, determine if the trend is bullish, bearish, neutral, or volatile, and provide a confidence score between 0 and 1. Format the response as a JSON array of objects, each with these fields: { "symbol": "the instrument", "text": "the insight text", "trend": "bullish|bearish|neutral|volatile", "confidence": 0.XX }`;
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        {
          role: "system", 
          content: "You are a professional market analyst specialized in technical analysis. Provide accurate, actionable trading insights that are concise and specific."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });
    
    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }
    
    const parsed = JSON.parse(content);
    
    if (!Array.isArray(parsed) && parsed.insights && Array.isArray(parsed.insights)) {
      return parsed.insights.map((insight: any, index: number) => ({
        id: `insight-${Date.now()}-${index}`,
        text: insight.text,
        trend: insight.trend,
        symbol: insight.symbol,
        confidence: insight.confidence,
        relatedTerms: insight.relatedTerms || []
      }));
    } else if (Array.isArray(parsed)) {
      return parsed.map((insight: any, index: number) => ({
        id: `insight-${Date.now()}-${index}`,
        text: insight.text,
        trend: insight.trend,
        symbol: insight.symbol,
        confidence: insight.confidence,
        relatedTerms: insight.relatedTerms || []
      }));
    }
    
    throw new Error("Invalid response format from OpenAI");
  } catch (error) {
    console.error("Error generating market insights:", error);
    
    // Return some basic insights if AI generation fails
    const fallbackInsights: MarketInsight[] = [
      {
        id: `fallback-${Date.now()}-1`,
        symbol: "EUR/USD",
        text: "Monitor key support and resistance levels for potential breakout opportunities.",
        trend: "neutral",
        confidence: 0.8
      },
      {
        id: `fallback-${Date.now()}-2`,
        symbol: "BTC/USD",
        text: "Watch for volume confirmation on recent price movements to validate trend strength.",
        trend: "bullish",
        confidence: 0.75
      },
      {
        id: `fallback-${Date.now()}-3`,
        symbol: "S&P 500",
        text: "Consider multiple timeframe analysis to identify the dominant market trend.",
        trend: "bearish",
        confidence: 0.7
      }
    ];
    
    return fallbackInsights.slice(0, count);
  }
}

/**
 * Handler for contextual insight API endpoint
 */
export async function contextualInsightHandler(req: Request, res: Response) {
  try {
    const params: ContextualInsightParams = req.body;
    const insight = await generateContextualInsight(params);
    res.json(insight);
  } catch (error) {
    console.error("Error in contextual insight handler:", error);
    res.status(500).json({ error: "Failed to generate contextual insight" });
  }
}

/**
 * Handler for market insights API endpoint
 */
export async function marketInsightsHandler(req: Request, res: Response) {
  try {
    const count = req.query.count ? parseInt(req.query.count as string) : 3;
    const insights = await generateMarketInsights(count);
    res.json(insights);
  } catch (error) {
    console.error("Error in market insights handler:", error);
    res.status(500).json({ error: "Failed to generate market insights" });
  }
}