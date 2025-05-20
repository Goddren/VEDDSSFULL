interface ScriptureWisdom {
  verse: string;
  reference: string;
  tradingWisdom: string;
}

export const scriptureWisdom: ScriptureWisdom[] = [
  {
    verse: "Do not be anxious about anything, but in every situation, by prayer and petition, with thanksgiving, present your requests to God.",
    reference: "Philippians 4:6",
    tradingWisdom: "Anxiety leads to poor trading decisions. Approach the market with a calm and clear mind, giving thanks for both wins and lessons from losses."
  },
  {
    verse: "Plans fail for lack of counsel, but with many advisers they succeed.",
    reference: "Proverbs 15:22",
    tradingWisdom: "Never rely solely on your own analysis. Seek wisdom from various sources and perspectives before making trading decisions."
  },
  {
    verse: "The plans of the diligent lead to profit as surely as haste leads to poverty.",
    reference: "Proverbs 21:5",
    tradingWisdom: "Rushing into trades often leads to losses. Take time for thorough analysis and develop a solid trading plan before entering the market."
  },
  {
    verse: "Wealth gained hastily will dwindle, but whoever gathers little by little will increase it.",
    reference: "Proverbs 13:11",
    tradingWisdom: "Consistent, disciplined trading with proper risk management builds wealth more reliably than chasing quick gains."
  },
  {
    verse: "The wise store up knowledge, but the mouth of a fool invites ruin.",
    reference: "Proverbs 10:14",
    tradingWisdom: "Continually educate yourself about market principles. Knowledge compounds over time and leads to better trading decisions."
  },
  {
    verse: "For which of you, desiring to build a tower, does not first sit down and count the cost, whether he has enough to complete it?",
    reference: "Luke 14:28",
    tradingWisdom: "Always calculate your risk before entering a trade. Know your position size and potential loss before committing your capital."
  },
  {
    verse: "But remember the LORD your God, for it is he who gives you the ability to produce wealth.",
    reference: "Deuteronomy 8:18",
    tradingWisdom: "Stay humble in success and remember that market opportunities are blessings. Practice gratitude regardless of outcomes."
  },
  {
    verse: "A faithful person will be richly blessed, but one eager to get rich will not go unpunished.",
    reference: "Proverbs 28:20",
    tradingWisdom: "Patience and consistency are virtues in trading. Avoid the temptation to overtrade or take excessive risks for quick profits."
  },
  {
    verse: "Be still, and know that I am God.",
    reference: "Psalm 46:10",
    tradingWisdom: "Sometimes the best trade is no trade. Patience during unclear market conditions preserves capital for better opportunities."
  },
  {
    verse: "The heart of the discerning acquires knowledge, for the ears of the wise seek it out.",
    reference: "Proverbs 18:15",
    tradingWisdom: "Remain a student of the markets. Listen to various perspectives and continually refine your trading approach based on new information."
  },
  {
    verse: "Commit to the LORD whatever you do, and he will establish your plans.",
    reference: "Proverbs 16:3",
    tradingWisdom: "Start each trading day with prayer and reflection. Align your trading goals with your greater purpose and values."
  },
  {
    verse: "In their hearts humans plan their course, but the LORD establishes their steps.",
    reference: "Proverbs 16:9",
    tradingWisdom: "Have a trading plan but remain flexible. The market often moves in unexpected ways, so adapt when necessary while maintaining discipline."
  },
  {
    verse: "The prudent see danger and take refuge, but the simple keep going and pay the penalty.",
    reference: "Proverbs 22:3",
    tradingWisdom: "Pay attention to warning signs in the market. Be willing to exit trades when conditions change, rather than hoping for recovery."
  },
  {
    verse: "For God has not given us a spirit of fear, but of power and of love and of a sound mind.",
    reference: "2 Timothy 1:7",
    tradingWisdom: "Trade with confidence and emotional control. Fear and greed are the enemies of sound trading decisions."
  },
  {
    verse: "There is a time for everything, and a season for every activity under the heavens.",
    reference: "Ecclesiastes 3:1",
    tradingWisdom: "Markets go through different cycles and seasons. Adapt your strategy to current market conditions rather than forcing trades."
  }
];

export function getDailyScripture(): ScriptureWisdom {
  const today = new Date();
  const startOfYear = new Date(today.getFullYear(), 0, 0);
  const diff = today.getTime() - startOfYear.getTime();
  const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
  const index = dayOfYear % scriptureWisdom.length;
  return scriptureWisdom[index];
}