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
          and recommend entry points, exit points, stop loss, and take profit levels. Return your analysis in JSON format.`
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Analyze this trading chart in detail and provide the following information in JSON format:\n"
                + "- Symbol and timeframe if visible\n"
                + "- Current price\n"
                + "- Market direction (BUY or SELL)\n"
                + "- Market trend (Bullish or Bearish)\n"
                + "- Confidence level (Low, Medium, High)\n"
                + "- Entry point\n"
                + "- Exit point\n"
                + "- Stop loss level\n"
                + "- Take profit level\n"
                + "- Risk/reward ratio\n"
                + "- Potential pips\n"
                + "- Patterns identified (array of objects with name, description, strength, type, details)\n"
                + "- Technical indicators (array of objects with name, type, signal, details)\n"
                + "- Support/resistance levels (array of objects with type, strength, level)\n"
                + "- Timeframe analysis (array of objects with timeframe and trend)\n"
                + "- Trading recommendation (text)\n"
                + "- Actionable steps (array of strings)"
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

    const response = JSON.parse(visionResponse.choices[0].message.content as string);
    
    return {
      symbol: response.symbol || "Unknown",
      timeframe: response.timeframe || "Unknown",
      currentPrice: response.currentPrice || "Unknown",
      direction: response.direction || "Unknown",
      trend: response.trend || "Unknown",
      confidence: response.confidence || "Medium",
      entryPoint: response.entryPoint || "Unknown",
      exitPoint: response.exitPoint || "Unknown",
      stopLoss: response.stopLoss || "Unknown",
      takeProfit: response.takeProfit || "Unknown", 
      riskRewardRatio: response.riskRewardRatio || "Unknown",
      potentialPips: response.potentialPips || "Unknown",
      patterns: response.patterns || [],
      indicators: response.indicators || [],
      supportResistance: response.supportResistance || [],
      timeframeAnalysis: response.timeframeAnalysis || [],
      recommendation: response.recommendation || "No recommendation available",
      steps: response.steps || []
    };
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
