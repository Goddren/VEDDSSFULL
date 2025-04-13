export interface TradingTip {
  id: string;
  category: string;
  content: string;
}

export const TRADING_TIPS: TradingTip[] = [
  // Risk Management Tips
  {
    id: "risk-1",
    category: "Risk Management",
    content: "Never risk more than 1-2% of your account on a single trade to protect your capital during losing streaks."
  },
  {
    id: "risk-2",
    category: "Risk Management",
    content: "Always set a stop loss before entering a trade to define your maximum acceptable loss."
  },
  {
    id: "risk-3",
    category: "Risk Management",
    content: "Consider reducing your position size during periods of high market volatility."
  },
  {
    id: "risk-4",
    category: "Risk Management",
    content: "Use trailing stops to protect profits while allowing winning trades to continue running."
  },
  {
    id: "risk-5",
    category: "Risk Management",
    content: "Before entering a trade, calculate your risk-to-reward ratio. Aim for at least 1:2 (risk:reward) to maintain profitability even with more losing trades than winners."
  },
  
  // Technical Analysis Tips
  {
    id: "tech-1",
    category: "Technical Analysis",
    content: "Confluence of multiple indicators increases the reliability of a trading signal."
  },
  {
    id: "tech-2",
    category: "Technical Analysis",
    content: "Price action is more important than indicators. Indicators are derived from price and lag behind."
  },
  {
    id: "tech-3",
    category: "Technical Analysis",
    content: "Higher timeframe trends take precedence over lower timeframe signals."
  },
  {
    id: "tech-4",
    category: "Technical Analysis",
    content: "Focus on support and resistance levels where price has reacted multiple times in the past."
  },
  {
    id: "tech-5",
    category: "Technical Analysis",
    content: "Look for divergences between price and oscillators (like RSI or MACD) to identify potential reversals."
  },
  
  // Trading Psychology Tips
  {
    id: "psych-1",
    category: "Trading Psychology",
    content: "Keep a trading journal to track your decisions, emotions, and results. Review it regularly to identify patterns and improve."
  },
  {
    id: "psych-2",
    category: "Trading Psychology",
    content: "Avoid revenge trading after a loss. Take a break if you're feeling emotional about a trade."
  },
  {
    id: "psych-3",
    category: "Trading Psychology",
    content: "Stick to your trading plan. Impulsive decisions often lead to losses."
  },
  {
    id: "psych-4",
    category: "Trading Psychology",
    content: "Celebrate your process, not just your profits. Following your system correctly is more important than occasional lucky wins."
  },
  {
    id: "psych-5",
    category: "Trading Psychology",
    content: "Fear and greed are the two biggest enemies of successful trading. Learn to recognize when these emotions are affecting your decisions."
  },
  
  // Pattern Recognition Tips
  {
    id: "pattern-1",
    category: "Pattern Recognition",
    content: "Head and shoulders patterns are more reliable when they form after an extended trend."
  },
  {
    id: "pattern-2",
    category: "Pattern Recognition",
    content: "Double tops and bottoms often signal strong potential reversals, especially on higher timeframes."
  },
  {
    id: "pattern-3",
    category: "Pattern Recognition",
    content: "Bullish engulfing candles are more significant when they occur at support levels after a downtrend."
  },
  {
    id: "pattern-4",
    category: "Pattern Recognition",
    content: "Triangle patterns typically continue the prior trend about 70% of the time."
  },
  {
    id: "pattern-5",
    category: "Pattern Recognition",
    content: "The longer a pattern takes to form, the more significant its breakout is likely to be."
  },
  
  // Market Structure Tips
  {
    id: "struct-1",
    category: "Market Structure",
    content: "An uptrend is defined by higher highs and higher lows. A downtrend shows lower highs and lower lows."
  },
  {
    id: "struct-2",
    category: "Market Structure",
    content: "The first break of market structure often indicates a potential trend reversal or significant pullback."
  },
  {
    id: "struct-3",
    category: "Market Structure",
    content: "Price tends to respect previous structure levels, using former resistance as new support and vice versa."
  },
  {
    id: "struct-4",
    category: "Market Structure",
    content: "Range-bound markets typically have clear upper resistance and lower support boundaries with price oscillating between them."
  },
  {
    id: "struct-5",
    category: "Market Structure",
    content: "Liquidity tends to exist beyond significant swing points. Price often moves to capture this liquidity before reversing."
  },
  
  // Trading Strategy Tips
  {
    id: "strat-1",
    category: "Trading Strategy",
    content: "Trend following strategies work best in trending markets, while range strategies excel in consolidation phases."
  },
  {
    id: "strat-2",
    category: "Trading Strategy",
    content: "Consider using breakout strategies during periods of low volatility as they often precede sharp price movements."
  },
  {
    id: "strat-3",
    category: "Trading Strategy",
    content: "Adjust your trading approach based on market conditions rather than trying to apply the same strategy in all environments."
  },
  {
    id: "strat-4",
    category: "Trading Strategy",
    content: "Scaling in and out of positions can help manage risk and maximize profits in trending markets."
  },
  {
    id: "strat-5",
    category: "Trading Strategy",
    content: "Patience is a strategy. Sometimes the best trade is no trade, especially in unclear market conditions."
  }
];

/**
 * Get a random trading tip from a specific category
 */
export function getRandomTipByCategory(category: string): TradingTip | undefined {
  const categoryTips = TRADING_TIPS.filter(tip => tip.category === category);
  if (categoryTips.length === 0) return undefined;
  
  const randomIndex = Math.floor(Math.random() * categoryTips.length);
  return categoryTips[randomIndex];
}

/**
 * Get all tips from a specific category
 */
export function getTipsByCategory(category: string): TradingTip[] {
  return TRADING_TIPS.filter(tip => tip.category === category);
}

/**
 * Get a specific tip by ID
 */
export function getTipById(id: string): TradingTip | undefined {
  return TRADING_TIPS.find(tip => tip.id === id);
}

/**
 * Get all available categories
 */
export function getAllCategories(): string[] {
  const categories = new Set<string>();
  TRADING_TIPS.forEach(tip => categories.add(tip.category));
  return Array.from(categories);
}