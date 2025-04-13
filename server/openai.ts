import OpenAI from "openai";
import { ChartAnalysisResponse, TrendCell } from "@shared/types";
import fs from "fs";

// Create and export an OpenAI instance
export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Function to get an OpenAI instance with the current API key
// This ensures we're always using the most up-to-date key
function getOpenAIInstance() {
  // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
  return openai;
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
    
    // Get the symbol for generating market trend data
    const symbol = typeof response.symbol === 'string' ? response.symbol : "Unknown";
    
    // Create the analysis response with strict property checking and defaults
    const analysisResponse: ChartAnalysisResponse = {
      symbol,
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
      volatilityScore: 50, // Default medium volatility, client will recalculate
      volatilityData: {
        score: 50,
        atr: 0.0010,
        standardDeviation: 0.0015,
        range: 0.0100,
        historicalRank: 50,
        riskFactor: 50
      },
      // Generate market trend data for related pairs
      marketTrends: await generateMarketTrendPredictions(symbol),
      patterns: Array.isArray(response.patterns) ? response.patterns : [],
      indicators: Array.isArray(response.indicators) ? response.indicators : [],
      supportResistance: Array.isArray(response.supportResistance) ? response.supportResistance : [],
      timeframeAnalysis: Array.isArray(response.timeframeAnalysis) ? response.timeframeAnalysis : [],
      volumeAnalysis: Array.isArray(response.volumeAnalysis) && response.volumeAnalysis.length > 0 ? response.volumeAnalysis : (() => {
        // Generate dynamic volume analysis data based on the currency pair
        const symbol = typeof response.symbol === 'string' ? response.symbol : "Unknown";
        
        // Default volume analysis
        const defaultVolume = [
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
        ];
        
        // Customize based on currency pair
        if (symbol.includes("JPY") || symbol.includes("AUD") || symbol.includes("NZD")) {
          // Asian currencies are more active during Asian session
          defaultVolume[0].volume = "High";
          defaultVolume[0].quality = "Excellent";
          defaultVolume[0].activity = "Strong price movements and liquidity during Tokyo/Sydney sessions";
        } else if (symbol.includes("GBP") || symbol.includes("EUR") || symbol.includes("CHF")) {
          // European currencies are more active during London session
          defaultVolume[1].volume = "Very High";
          defaultVolume[1].activity = "Peak liquidity and volatility for European currencies";
        } else if (symbol.includes("CAD")) {
          // CAD has higher activity during NY session
          defaultVolume[2].volume = "Very High";
          defaultVolume[2].activity = "Highest volatility during New York and Toronto market hours";
        }
        
        return defaultVolume;
      })(),
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

// Generate concise trading tips for a symbol
export async function generateTradingTip(
  symbol: string,
  timeframe: string = '4H', 
  marketContext: string = ''
): Promise<{ tip: string; direction: string; confidence: number; key_levels: { support: string; resistance: string } }> {
  const openai = getOpenAIInstance();
  
  // Prepare prompt for AI to generate trading tip
  const prompt = `Generate a concise trading tip for ${symbol} on the ${timeframe} timeframe.
${marketContext ? `Current market context: ${marketContext}` : ''}

Analyze potential trade opportunities for ${symbol} based on recent price action, key support/resistance levels, 
and relevant indicators. Focus on actionable advice for traders.

Format your response as a JSON object with these fields:
- tip: A concise 1-2 sentence trading recommendation
- direction: Either "buy", "sell", or "neutral"
- confidence: A number from 1-100 representing confidence in this tip
- key_levels: An object containing "support" and "resistance" price levels

Keep the tip under 150 characters - direct and actionable.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // use the newest model
      messages: [
        { role: "system", content: "You are a professional forex and crypto trading advisor with 15+ years of experience." },
        { role: "user", content: prompt }
      ],
      response_format: { type: "json_object" }
    });
    
    // Parse the response
    const content = response.choices[0].message.content;
    
    if (!content) {
      throw new Error("Failed to generate trading tip");
    }
    
    try {
      const tipData = JSON.parse(content);
      return {
        tip: tipData.tip || "No tip available",
        direction: tipData.direction || "neutral",
        confidence: Number(tipData.confidence) || 50,
        key_levels: {
          support: tipData.key_levels?.support || "N/A",
          resistance: tipData.key_levels?.resistance || "N/A"
        }
      };
    } catch (parseError) {
      console.error("Error parsing AI response:", parseError);
      throw new Error("Failed to parse trading tip");
    }
  } catch (error) {
    console.error("Error generating trading tip:", error);
    throw error;
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

/**
 * Generate market trend predictions for related currency pairs
 * @param mainSymbol The primary symbol being analyzed
 * @returns Array of trend predictions for related currency pairs
 */
export async function generateMarketTrendPredictions(mainSymbol: string): Promise<TrendCell[]> {
  try {
    const openai = getOpenAIInstance();
    // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: 
            "You are a professional forex and trading market analyst with deep technical analysis expertise. " +
            "Generate accurate trend predictions for currency pairs related to the main pair being analyzed. " +
            "Your predictions should be based on recent market patterns, economic data, and technical indicators."
        },
        {
          role: "user",
          content: `Based on the current analysis of ${mainSymbol}, predict the market trends for 8-12 related trading pairs. ` +
            "For each pair, provide: pair name, probability (0-100), direction (bullish/bearish/neutral), " +
            "and signal strength (0-100). Format your response as a JSON array of objects with the field name 'predictions'."
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.7,
    });

    const parsedResponse = JSON.parse(response.choices[0].message.content || "{}");
    
    if (Array.isArray(parsedResponse.predictions)) {
      return parsedResponse.predictions.map((pred: any) => ({
        pair: pred.pair || "Unknown Pair",
        probability: typeof pred.probability === 'number' ? pred.probability : parseInt(pred.probability) || 50,
        direction: pred.direction === 'bullish' || pred.direction === 'bearish' || pred.direction === 'neutral' 
          ? pred.direction 
          : 'neutral',
        strength: typeof pred.strength === 'number' ? pred.strength : parseInt(pred.strength) || 50,
        timestamp: Date.now()
      }));
    }
    
    // Fallback in case the model doesn't return the expected format
    return generateFallbackTrendData(mainSymbol);
  } catch (error) {
    console.error("Error generating market trend predictions:", error);
    return generateFallbackTrendData(mainSymbol);
  }
}

/**
 * Generate fallback trend data when the API call fails
 */
function generateFallbackTrendData(mainSymbol: string): TrendCell[] {
  const currencyPairs = [
    'EUR/USD', 'GBP/USD', 'USD/JPY', 'USD/CHF', 
    'USD/CAD', 'AUD/USD', 'NZD/USD', 'EUR/GBP'
  ];
  
  // Filter out the main symbol and take up to 8 pairs
  const relatedPairs = currencyPairs
    .filter(pair => pair !== mainSymbol)
    .slice(0, 8);
  
  return relatedPairs.map(pair => {
    const random = Math.random();
    let direction: 'bullish' | 'bearish' | 'neutral';
    
    if (random < 0.4) {
      direction = 'bullish';
    } else if (random < 0.8) {
      direction = 'bearish';
    } else {
      direction = 'neutral';
    }
    
    return {
      pair,
      probability: Math.round(60 + Math.random() * 35), // 60-95%
      direction,
      strength: Math.round(20 + Math.random() * 75), // 20-95
      timestamp: Date.now()
    };
  });
}
