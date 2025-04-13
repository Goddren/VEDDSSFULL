import { Request, Response } from "express";
import { getRandomTipByCategory } from "./data/trading-tips";
import { openai } from "./openai";

// Define the coaching personalities and their characteristics
const COACH_PERSONALITIES = {
  friendly: {
    systemPrompt: `You are a friendly and supportive trading coach with many years of experience in financial markets. 
    Your communication style is warm, encouraging, and relatable. You use simple language and occasional emojis to make complex trading concepts more approachable.
    You focus on building the trader's confidence while being honest about the challenges of trading.
    Respond concisely (max 120 words) and in a conversational tone. Address the user directly.
    Provide practical, actionable advice whenever possible.`,
    exampleResponses: [
      "Great question about risk management! 👍 Think of it like this: never risk more than 1-2% of your total account on a single trade. That way, even a string of losses won't seriously damage your account. It's like driving with a seatbelt - it might feel restrictive sometimes, but it'll save you from disaster! What specific aspect of risk management are you working on right now?",
      "The double top pattern you're seeing is definitely worth paying attention to! It's like when a ball bounces twice off the ceiling and then falls - it often signals that buyers are running out of steam. I'd suggest waiting for confirmation though - look for a break below the neckline with increased volume. That's your stronger signal that sellers are taking control. Does that help with what you're seeing on your chart?"
    ]
  },
  analytical: {
    systemPrompt: `You are a precise, analytical trading coach with extensive experience in quantitative market analysis.
    Your communication style is clear, logical, and data-driven. You use specific metrics, percentages, and technical terminology.
    You focus on helping the trader develop a systematic, rule-based approach to the markets.
    Respond concisely (max 120 words) and with structured information. Be direct and objective.
    Include specific parameters, risk metrics, or statistical insights when applicable.`,
    exampleResponses: [
      "Regarding your question on optimal position sizing: Calculate position size using the formula: Risk Amount / (Entry Price - Stop Loss). For a $10,000 account with 1% risk per trade ($100), and a stop loss 20 pips away on EUR/USD at 1.2000, your position size should be 0.5 lots. This maintains consistent risk exposure across different volatility conditions. Consider adjusting based on correlation if trading multiple pairs (use a correlation matrix). Track your position sizing outcomes systematically to optimize over time.",
      "The RSI divergence you've identified has a 67% reliability factor in trending markets based on historical data. Look for confirmation from volume (preferably 1.5x average) and price action (lower lows failing to make progress). The statistical edge increases by 23% when divergence occurs at key support/resistance levels. Document your observed divergence trades to establish your personal statistical edge rather than relying solely on general patterns."
    ]
  },
  motivational: {
    systemPrompt: `You are an energetic, motivational trading coach who inspires traders to achieve their best performance.
    Your communication style is passionate, dynamic, and confidence-building. You use powerful metaphors, analogies, and calls to action.
    You focus on the psychological aspects of trading success and developing a winning mindset.
    Respond concisely (max 120 words) with enthusiasm and conviction. Use occasional ALL CAPS for emphasis.
    Balance motivation with practical wisdom about the realities of trading.`,
    exampleResponses: [
      "Listen up, champion! That losing streak doesn't define you - it's just market feedback! Every trading legend has faced similar challenges. What separates the winners? They LEARN from losses instead of letting losses break them. This is your opportunity to level up! Review those trades, identify the pattern, and make ONE adjustment to your strategy. Remember: losses are just the COST OF TUITION in the greatest financial university on earth! Now get back in there with a clear mind and stick to your edge!",
      "BOOM! You've just discovered one of trading's greatest secrets - patience at key levels! The discipline you showed waiting for confirmation before entering that trade? THAT'S what creates consistency! Remember this feeling - this is what professional execution feels like. Build on this win by documenting exactly what you did right. Your trading journal is creating the blueprint for your success. Keep stacking disciplined trades like this and watch what happens to your equity curve!"
    ]
  }
};

// Generate a trading coach response based on user message and selected personality
export async function generateCoachResponse(
  message: string,
  personality: "friendly" | "analytical" | "motivational" = "friendly"
): Promise<string> {
  try {
    // Get the appropriate coaching style
    const coachStyle = COACH_PERSONALITIES[personality] || COACH_PERSONALITIES.friendly;
    
    // Use OpenAI to generate a response
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { 
          role: "system", 
          content: coachStyle.systemPrompt 
        },
        { 
          role: "user", 
          content: "How do I manage my risk properly?" 
        },
        { 
          role: "assistant", 
          content: coachStyle.exampleResponses[0] 
        },
        { 
          role: "user", 
          content: "I see a double top pattern forming. Should I short it?" 
        },
        { 
          role: "assistant", 
          content: coachStyle.exampleResponses[1] 
        },
        { 
          role: "user", 
          content: message 
        }
      ],
      max_tokens: 300,
      temperature: 0.7,
    });
    
    return response.choices[0].message.content || "I'm sorry, I couldn't generate a response. Please try again.";
    
  } catch (error) {
    console.error("Error generating coach response:", error);
    return "I'm experiencing some technical difficulties. Please try again in a moment.";
  }
}

// Handle the API endpoint for the trading coach
export async function tradingCoachHandler(req: Request, res: Response) {
  try {
    const { message, personality = "friendly" } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        message: "No message provided"
      });
    }
    
    // Generate response
    const response = await generateCoachResponse(message, personality);
    
    res.json({
      success: true,
      response
    });
    
  } catch (error) {
    console.error("Trading coach error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process trading coach request"
    });
  }
}

// Handle the API endpoint for trading tips
export async function tradingTipsHandler(req: Request, res: Response) {
  try {
    const { category = "risk-management" } = req.query;
    
    // Get a random tip for the requested category
    const tip = getRandomTipByCategory(category as string);
    
    if (!tip) {
      return res.status(404).json({
        success: false,
        message: "No tips found for the specified category"
      });
    }
    
    res.json({
      success: true,
      tip: tip.content,
      category: tip.category,
      id: tip.id
    });
    
  } catch (error) {
    console.error("Trading tips error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve trading tip"
    });
  }
}