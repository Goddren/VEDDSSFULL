import OpenAI from "openai";
import { ChartAnalysisResponse } from "@shared/types";
import fs from "fs";

// Function to get an OpenAI instance with the current API key
// This ensures we're always using the most up-to-date key
function getOpenAIInstance() {
  // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Function to test if OpenAI API key is valid
export async function testOpenAIApiKey(): Promise<boolean> {
  try {
    const openai = getOpenAIInstance();
    const response = await openai.models.list();
    return response.data.length > 0;
  } catch (error) {
    console.error("Error validating OpenAI API key:", error);
    return false;
  }
}

export async function analyzeChartImage(base64Image: string): Promise<ChartAnalysisResponse> {
  try {
    const openai = getOpenAIInstance();
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are an expert trading chart analyst. Analyze the trading chart image and provide detailed analysis.
          Identify patterns, technical indicators, support/resistance levels, and market trends.
          Determine if the chart suggests a BUY or SELL signal, whether the trend is bullish or bearish,
          and recommend entry points, exit points, stop loss, and take profit levels.
          
          Additionally, analyze volume patterns and provide insights on the best trading times for this pair:
          - Identify if there are clear volume patterns visible in different trading sessions
          - Determine which trading sessions (Asian, London, New York) show the most volume for this pair
          - Assess the quality of trading opportunities during each session
          - Provide specific advice on optimal times to trade based on volume
          
          VERY IMPORTANT: Return the analysis in valid JSON format with all required properties.
          Even if you cannot determine some information, include placeholder values rather than omitting properties.
          For numeric fields where you cannot determine a value, use a string representation (e.g., "Unknown").
          All properties in the response schema are required.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this trading chart in detail and provide the following information in structured JSON format:

{
  "symbol": string,           // Name of the trading pair or symbol (e.g. "EURUSD", "BTCUSD")
  "timeframe": string,        // Chart timeframe (e.g. "1H", "4H", "1D")
  "currentPrice": string,     // Current price visible on the chart
  "direction": string,        // "BUY" or "SELL" signal
  "trend": string,            // "Bullish" or "Bearish"
  "confidence": string,       // "Low", "Medium", or "High"
  "entryPoint": string,       // Suggested entry price
  "exitPoint": string,        // Suggested exit price
  "stopLoss": string,         // Suggested stop loss level
  "takeProfit": string,       // Suggested take profit level
  "riskRewardRatio": string,  // Risk-to-reward ratio (e.g. "1:2", "1:3")
  "potentialPips": string,    // Potential pips/points in the trade
  "patterns": [               // Array of identified chart patterns
    {
      "name": string,         // Pattern name (e.g. "Double Top", "Head and Shoulders")
      "description": string,  // Brief description
      "strength": string,     // "Weak", "Moderate", "Strong"
      "type": string,         // "Reversal", "Continuation", etc.
      "details": string       // Additional details about the pattern
    }
  ],
  "indicators": [             // Array of technical indicators
    {
      "name": string,         // Indicator name (e.g. "RSI", "MACD")
      "type": string,         // Type of indicator (e.g. "Oscillator", "Trend")
      "signal": string,       // "Bullish", "Bearish", "Neutral"
      "details": string       // Additional details about the indicator
    }
  ],
  "supportResistance": [      // Array of support and resistance levels
    {
      "type": string,         // "Support" or "Resistance"
      "strength": string,     // "Weak", "Moderate", "Strong"
      "level": string         // Price level
    }
  ],
  "timeframeAnalysis": [      // Analysis across different timeframes
    {
      "timeframe": string,    // Timeframe (e.g. "1H", "4H", "1D")
      "trend": string         // "Bullish" or "Bearish" on that timeframe
    }
  ],
  "volumeAnalysis": [         // Analysis of volume patterns and best trading times
    {
      "period": string,       // Time period (e.g. "Asian Session", "London Session", "New York Session") 
      "volume": string,       // "Low", "Medium", "High" volume level
      "activity": string,     // Description of market activity during this period
      "quality": string       // Quality of trading opportunities ("Poor", "Average", "Excellent")
    }
  ],
  "recommendation": string,   // Overall trading recommendation
  "steps": string[]           // Array of actionable steps to take
}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 4000,
      response_format: { type: "json_object" }
    });

    // Log the raw response for debugging
    console.log("OpenAI JSON Response:", visionResponse.choices[0].message.content);
    
    // Parse the response
    const contentStr = visionResponse.choices[0].message.content as string;
    let response;
    
    try {
      response = JSON.parse(contentStr);
      console.log("Parsed response successfully");
    } catch (parseError) {
      console.error("Failed to parse JSON response:", parseError);
      console.log("Response content:", contentStr);
      // If parsing failed, create a default response structure
      response = {};
    }
    
    // Create the analysis response with strict property checking and defaults
    const analysisResponse: ChartAnalysisResponse = {
      symbol: typeof response.symbol === 'string' ? response.symbol : "Unknown",
      timeframe: typeof response.timeframe === 'string' ? response.timeframe : "Unknown",
      currentPrice: typeof response.currentPrice === 'string' ? response.currentPrice : "Unknown",
      direction: typeof response.direction === 'string' ? response.direction : "Unknown",
      trend: typeof response.trend === 'string' ? response.trend : "Unknown",
      confidence: typeof response.confidence === 'string' ? response.confidence : "Medium",
      entryPoint: typeof response.entryPoint === 'string' ? response.entryPoint : "Unknown",
      exitPoint: typeof response.exitPoint === 'string' ? response.exitPoint : "Unknown",
      stopLoss: typeof response.stopLoss === 'string' ? response.stopLoss : "Unknown",
      takeProfit: typeof response.takeProfit === 'string' ? response.takeProfit : "Unknown", 
      riskRewardRatio: typeof response.riskRewardRatio === 'string' ? response.riskRewardRatio : "Unknown",
      potentialPips: typeof response.potentialPips === 'string' ? response.potentialPips : "Unknown",
      patterns: Array.isArray(response.patterns) ? response.patterns : [],
      indicators: Array.isArray(response.indicators) ? response.indicators : [],
      supportResistance: Array.isArray(response.supportResistance) ? response.supportResistance : [],
      timeframeAnalysis: Array.isArray(response.timeframeAnalysis) ? response.timeframeAnalysis : [],
      volumeAnalysis: Array.isArray(response.volumeAnalysis) ? response.volumeAnalysis : [
        {
          period: "Asian Session",
          volume: "Medium",
          activity: "Moderate price action with occasional breakouts during Tokyo open",
          quality: "Average"
        },
        {
          period: "London Session",
          volume: "High",
          activity: "Increased volatility and liquidity as European markets open",
          quality: "Excellent"
        },
        {
          period: "New York Session",
          volume: "High",
          activity: "Peak trading volume when both European and US markets are active",
          quality: "Excellent"
        }
      ],
      recommendation: typeof response.recommendation === 'string' ? response.recommendation : "No recommendation available",
      steps: Array.isArray(response.steps) ? response.steps : []
    };
    
    return analysisResponse;
  } catch (error) {
    console.error("Error analyzing chart:", error);
    if (error instanceof Error) {
      throw error; // Preserve the original error and stack trace
    } else {
      throw new Error("Failed to analyze chart image");
    }
  }
}

export async function extractTextFromImage(base64Image: string): Promise<string> {
  try {
    const openai = getOpenAIInstance();
    const visionResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract all text visible in this trading chart image. Focus on price values, indicators, timeframes, and any other relevant information."
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ],
        },
      ],
      max_tokens: 1000,
    });

    return visionResponse.choices[0].message.content || "";
  } catch (error) {
    console.error("Error extracting text from image:", error);
    if (error instanceof Error) {
      throw error; // Preserve the original error and stack trace
    } else {
      throw new Error("Failed to extract text from image");
    }
  }
}
