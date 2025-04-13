import { OpenAI } from "openai";
import type { Request, Response } from "express";

// Constants
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

// OpenAI instance
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Generate contextual market insights based on parameters
export async function generateContextualInsight(params: ContextualInsightParams): Promise<MarketInsight> {
  const { symbol, pattern, trend, timeframe, context } = params;
  
  try {
    // Build prompt based on available parameters
    let prompt = "Generate a concise, expert-level trading insight";
    
    if (symbol) prompt += ` for ${symbol}`;
    if (pattern) prompt += ` regarding ${pattern} patterns`;
    if (trend) prompt += ` in a ${trend} market context`;
    if (timeframe) prompt += ` for the ${timeframe} timeframe`;
    if (context) prompt += `. Additional context: ${context}`;
    
    prompt += `. The insight should be concise (30-50 words), technically accurate, and provide actionable trading information. Format as JSON with fields: text (the insight), trend (bullish, bearish, neutral, or volatile), and confidence (0.0-1.0).`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are an expert trading analyst AI with deep knowledge of technical analysis, market psychology, and trading strategies."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.2
    });

    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }
    
    const parsedResponse = JSON.parse(content);
    
    // Validate that we have the expected fields
    if (!parsedResponse.text || !parsedResponse.trend) {
      throw new Error("Invalid response format from OpenAI");
    }
    
    return {
      id: `insight-${Date.now()}`,
      text: parsedResponse.text,
      trend: parsedResponse.trend as MarketTrend,
      symbol,
      confidence: parsedResponse.confidence || 0.8,
      relatedTerms: parsedResponse.relatedTerms || []
    };
  } catch (error) {
    console.error("Error generating contextual insight:", error);
    throw error;
  }
}

// Generate generic market insights
export async function generateMarketInsights(count: number = 3): Promise<MarketInsight[]> {
  try {
    const prompt = `Generate ${count} diverse trading insights for different market conditions and assets. 
    Each insight should be concise (30-50 words), technically accurate, and provide actionable information.
    Format as a JSON array with objects having fields: text (the insight), trend (bullish, bearish, neutral, or volatile), 
    symbol (optional), and confidence (0.0-1.0).`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
      messages: [
        {
          role: "system",
          content: "You are an expert trading analyst AI with deep knowledge of technical analysis, market psychology, and trading strategies."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.3
    });

    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }
    
    const parsedResponse = JSON.parse(content);
    
    // Ensure we have an array of insights
    if (!Array.isArray(parsedResponse.insights)) {
      throw new Error("Invalid response format from OpenAI");
    }
    
    // Process and return the insights with generated IDs
    return parsedResponse.insights.map((insight: any, index: number) => ({
      id: `insight-${Date.now()}-${index}`,
      text: insight.text,
      trend: insight.trend as MarketTrend,
      symbol: insight.symbol,
      confidence: insight.confidence || 0.8,
      relatedTerms: insight.relatedTerms || []
    }));
  } catch (error) {
    console.error("Error generating market insights:", error);
    throw error;
  }
}

// API handler for contextual insights
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

// API handler for multiple market insights
export async function marketInsightsHandler(req: Request, res: Response) {
  try {
    const count = parseInt(req.query.count as string) || 3;
    const insights = await generateMarketInsights(count);
    res.json(insights);
  } catch (error) {
    console.error("Error in market insights handler:", error);
    res.status(500).json({ error: "Failed to generate market insights" });
  }
}