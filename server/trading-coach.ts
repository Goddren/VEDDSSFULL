import { Request, Response } from 'express';
import { openai } from './openai';
import { getRandomTipByCategory, getTipsByCategory, getAllCategories } from './data/trading-tips';

// Generate an AI response to a trading question
export async function generateCoachResponse(
  message: string,
  personality: 'friendly' | 'professional' | 'casual' = 'professional'
): Promise<string> {
  try {
    // Get personality instructions
    const personalityInstructions = {
      friendly: `
        You're a friendly and enthusiastic trading coach who loves to explain concepts
        in a simple, encouraging way. Use casual language, emoji, and positive encouragement.
        Keep your responses concise but engaging.
      `,
      professional: `
        You're a professional trading coach with years of experience. Provide detailed,
        technically accurate advice using formal language. Be concise but thorough in your
        explanations.
      `,
      casual: `
        You're a casual, energetic trading coach who speaks in a relaxed way. Use slang,
        trading jargon, and keep things conversational. Your tone is motivational but
        laid-back.
      `
    };

    // Configure the system message based on personality
    const systemMessage = `
      ${personalityInstructions[personality]}
      
      You are an AI trading coach specializing in technical analysis of financial charts.
      Your expertise is in identifying patterns, providing trading strategies, and analyzing
      market conditions.
      
      When answering questions:
      1. Focus on providing actionable advice for traders
      2. Explain technical concepts in a way that matches your personality
      3. If you don't know something, admit it rather than making up information
      4. Keep responses under 250 words to be concise and useful
      5. When discussing trading, emphasize risk management principles
      
      Remember that trading involves risk and make sure to include appropriate disclaimers
      when giving specific advice.
    `;

    // Get OpenAI response
    const response = await openai.chat.completions.create({
      model: "gpt-4o", // the newest OpenAI model is "gpt-4o" which was released May 13, 2024. do not change this unless explicitly requested by the user
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: message }
      ],
      max_tokens: 600,
      temperature: personality === 'professional' ? 0.5 : 0.7,
    });

    return response.choices[0].message.content || "I'm sorry, I couldn't generate a response at this time.";
  } catch (error) {
    console.error("Error generating coach response:", error);
    return "Sorry, I'm having trouble connecting to my knowledge base right now. Please try again in a moment.";
  }
}

// Handle requests for the trading coach chat
export async function tradingCoachHandler(req: Request, res: Response) {
  try {
    const { message, personality = 'professional' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: "Message is required" });
    }
    
    const response = await generateCoachResponse(message, personality);
    
    res.json({ response });
  } catch (error) {
    console.error("Error in trading coach handler:", error);
    res.status(500).json({ error: "Failed to process trading coach request" });
  }
}

// Handle requests for trading tips
export async function tradingTipsHandler(req: Request, res: Response) {
  try {
    // Get category from query params, or return all tips
    const { category } = req.query;
    
    if (category && typeof category === 'string') {
      const tips = getTipsByCategory(category);
      res.json(tips);
    } else {
      // Get all categories and randomly select a few tips from each
      const categories = getAllCategories();
      const allTips = categories.flatMap(cat => getTipsByCategory(cat));
      res.json(allTips);
    }
  } catch (error) {
    console.error("Error in trading tips handler:", error);
    res.status(500).json({ error: "Failed to retrieve trading tips" });
  }
}