// Collection of trading tips organized by category

export interface TradingTip {
  id: string;
  category: string;
  content: string;
}

export const TRADING_TIPS: TradingTip[] = [
  // Risk Management Tips
  {
    id: "rm-1",
    category: "risk-management",
    content: "Never risk more than 1-2% of your account on any single trade. This protects your capital during losing streaks."
  },
  {
    id: "rm-2",
    category: "risk-management",
    content: "Always set a stop loss before entering a trade. This defines your maximum risk and prevents emotional decisions during market volatility."
  },
  {
    id: "rm-3",
    category: "risk-management",
    content: "Aim for a risk-reward ratio of at least 1:2. This means your potential profit should be at least twice your potential loss."
  },
  {
    id: "rm-4",
    category: "risk-management",
    content: "Consider reducing your position size during periods of high market volatility to account for wider stop losses."
  },
  {
    id: "rm-5",
    category: "risk-management",
    content: "Avoid having too many correlated positions open at once. Diversify across different markets or trading pairs."
  },
  {
    id: "rm-6",
    category: "risk-management",
    content: "Track your maximum drawdown and set limits. If you reach your maximum acceptable drawdown, take a break and reassess your strategy."
  },
  {
    id: "rm-7",
    category: "risk-management",
    content: "Never use all your available margin. Always keep a safety buffer to withstand market swings."
  },

  // Trading Psychology Tips
  {
    id: "psy-1",
    category: "psychology",
    content: "Fear and greed are your biggest enemies in trading. Develop a trading plan and stick to it to avoid emotional decisions."
  },
  {
    id: "psy-2",
    category: "psychology",
    content: "Accept that losses are part of trading. Focus on your process rather than individual trade outcomes."
  },
  {
    id: "psy-3",
    category: "psychology",
    content: "Keep a trading journal to track your emotions along with your trades. Look for patterns in your psychological state and trading results."
  },
  {
    id: "psy-4",
    category: "psychology",
    content: "Avoid revenge trading after a loss. Take a break, clear your mind, and return to your trading plan."
  },
  {
    id: "psy-5",
    category: "psychology",
    content: "Practice mindfulness or meditation before trading sessions to maintain emotional equilibrium."
  },
  {
    id: "psy-6",
    category: "psychology",
    content: "Don't constantly check your open trades. Set alerts for important price levels and focus on other activities."
  },
  {
    id: "psy-7",
    category: "psychology",
    content: "Remember that consistency is more important than occasional big wins. Aim for steady progress rather than home runs."
  },

  // Technical Analysis Tips
  {
    id: "ta-1",
    category: "technical-analysis",
    content: "Multiple timeframe analysis provides a more complete market picture. Start with higher timeframes to identify the trend, then use lower timeframes for entry."
  },
  {
    id: "ta-2",
    category: "technical-analysis",
    content: "Price action often precedes indicator signals. Learn to read candlestick patterns and chart formations for early market insights."
  },
  {
    id: "ta-3",
    category: "technical-analysis",
    content: "Look for confluence of multiple indicators or signals rather than relying on just one. The more confirmation, the stronger the signal."
  },
  {
    id: "ta-4",
    category: "technical-analysis",
    content: "Support and resistance levels often become more significant when tested multiple times."
  },
  {
    id: "ta-5",
    category: "technical-analysis",
    content: "Volume often confirms price movements. Strong volume during a move suggests stronger conviction and potential continuation."
  },
  {
    id: "ta-6",
    category: "technical-analysis",
    content: "Fibonacci retracement levels (especially 38.2%, 50%, and 61.8%) often provide good entry points during pullbacks in a trend."
  },
  {
    id: "ta-7",
    category: "technical-analysis",
    content: "Moving averages can act as dynamic support and resistance levels. The 50, 100, and 200 period MAs are widely watched by traders."
  },

  // Fundamentals Tips
  {
    id: "fund-1",
    category: "fundamentals",
    content: "Major economic releases like Non-Farm Payrolls, Interest Rate Decisions, and GDP reports can create significant volatility. Be cautious trading around these events."
  },
  {
    id: "fund-2",
    category: "fundamentals",
    content: "Use an economic calendar to track upcoming news events that might impact your trades."
  },
  {
    id: "fund-3",
    category: "fundamentals",
    content: "Understand how different currencies are affected by interest rates. Currencies from countries with higher interest rates often appreciate against those with lower rates."
  },
  {
    id: "fund-4",
    category: "fundamentals",
    content: "Central bank policy statements often provide clues about future economic decisions that can impact currency pairs."
  },
  {
    id: "fund-5",
    category: "fundamentals",
    content: "Consider the broader geopolitical landscape when trading. Political instability often leads to risk-off sentiment and affects certain currency pairs."
  },
  {
    id: "fund-6",
    category: "fundamentals",
    content: "Remember that markets are forward-looking. They often react to expectations rather than the actual data."
  },
  {
    id: "fund-7",
    category: "fundamentals",
    content: "Commodity prices can significantly impact commodity-linked currencies like AUD, CAD, and NZD."
  },

  // Trading Discipline Tips
  {
    id: "disc-1",
    category: "discipline",
    content: "Create a detailed trading plan and follow it consistently. This should include entry/exit criteria, risk parameters, and time frames."
  },
  {
    id: "disc-2",
    category: "discipline",
    content: "Set specific trading hours and stick to them. Not every market hour is optimal for your strategy."
  },
  {
    id: "disc-3",
    category: "discipline",
    content: "Before each trade, write down your entry, stop loss, take profit, and reason for taking the trade. This enforces accountability."
  },
  {
    id: "disc-4",
    category: "discipline",
    content: "Regularly review and assess your trades. Learning from both winners and losers improves your future decision-making."
  },
  {
    id: "disc-5",
    category: "discipline",
    content: "Take regular breaks from trading to maintain mental clarity and prevent burnout."
  },
  {
    id: "disc-6",
    category: "discipline",
    content: "Avoid changing your strategy too frequently. Give it enough time and trades to properly evaluate its effectiveness."
  },
  {
    id: "disc-7",
    category: "discipline",
    content: "Don't chase the market. If you miss an entry, wait patiently for the next opportunity rather than entering at unfavorable levels."
  }
];

// Function to get a random tip from a specific category
export function getRandomTipByCategory(category: string): TradingTip | undefined {
  const categoryTips = TRADING_TIPS.filter(tip => tip.category === category);
  if (categoryTips.length === 0) return undefined;
  
  const randomIndex = Math.floor(Math.random() * categoryTips.length);
  return categoryTips[randomIndex];
}

// Function to get all tips for a category
export function getTipsByCategory(category: string): TradingTip[] {
  return TRADING_TIPS.filter(tip => tip.category === category);
}

// Function to get a tip by ID
export function getTipById(id: string): TradingTip | undefined {
  return TRADING_TIPS.find(tip => tip.id === id);
}

// Function to get all available categories
export function getAllCategories(): string[] {
  return [...new Set(TRADING_TIPS.map(tip => tip.category))];
}