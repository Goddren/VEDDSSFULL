// Scripture verses and related trading wisdom for daily display
export interface ScriptureWisdom {
  id: number;
  verse: string;
  reference: string;
  tradingWisdom: string;
  theme: 'patience' | 'wisdom' | 'stewardship' | 'integrity' | 'diligence' | 'prudence';
}

export const scriptureWisdomData: ScriptureWisdom[] = [
  {
    id: 1,
    verse: "The plans of the diligent lead to profit as surely as haste leads to poverty.",
    reference: "Proverbs 21:5",
    tradingWisdom: "Successful trading comes from careful planning and patience, not impulsive decisions. Take time to analyze your charts and set clear entry/exit points.",
    theme: "diligence"
  },
  {
    id: 2,
    verse: "The prudent see danger and take refuge, but the simple keep going and pay the penalty.",
    reference: "Proverbs 22:3",
    tradingWisdom: "Wise traders recognize warning signs and protect their capital by setting appropriate stop losses. Risk management is essential for long-term success.",
    theme: "prudence"
  },
  {
    id: 3,
    verse: "Suppose one of you wants to build a tower. Won't you first sit down and estimate the cost to see if you have enough money to complete it?",
    reference: "Luke 14:28",
    tradingWisdom: "Before entering any trade, calculate your risk-reward ratio and ensure you have sufficient capital to withstand temporary drawdowns.",
    theme: "stewardship"
  },
  {
    id: 4,
    verse: "Wealth gained hastily will dwindle, but whoever gathers little by little will increase it.",
    reference: "Proverbs 13:11",
    tradingWisdom: "Consistency and compounding modest gains over time is a more sustainable approach than seeking large, risky trades for quick profits.",
    theme: "patience"
  },
  {
    id: 5,
    verse: "For which of you, desiring to build a tower, does not first sit down and count the cost, whether he has enough to complete it?",
    reference: "Luke 14:28",
    tradingWisdom: "Plan your trades and assess your resources before entering positions. Good traders always know their risk limits and capital requirements.",
    theme: "prudence"
  },
  {
    id: 6,
    verse: "The blessing of the Lord makes rich, and he adds no sorrow with it.",
    reference: "Proverbs 10:22",
    tradingWisdom: "Trade with integrity and ethical principles. Wealth gained through honest, patient work brings true satisfaction rather than anxiety.",
    theme: "integrity"
  },
  {
    id: 7,
    verse: "Steady plodding brings prosperity; hasty speculation brings poverty.",
    reference: "Proverbs 21:5 (TLB)",
    tradingWisdom: "Consistent application of a proven trading strategy outperforms impulsive speculation. Develop your system and stick to it with discipline.",
    theme: "diligence"
  },
  {
    id: 8,
    verse: "The wise have wealth and luxury, but fools spend whatever they get.",
    reference: "Proverbs 21:20 (NLT)",
    tradingWisdom: "Protect your trading capital as a precious resource. Reinvest profits wisely and maintain proper position sizing to ensure longevity.",
    theme: "stewardship"
  },
  {
    id: 9,
    verse: "By wisdom a house is built, and through understanding it is established; through knowledge its rooms are filled with rare and beautiful treasures.",
    reference: "Proverbs 24:3-4",
    tradingWisdom: "Build your trading account through knowledge, understanding market patterns, and the wisdom to apply what you've learned appropriately.",
    theme: "wisdom"
  },
  {
    id: 10,
    verse: "But remember the LORD your God, for it is he who gives you the ability to produce wealth.",
    reference: "Deuteronomy 8:18",
    tradingWisdom: "Maintain humility in both success and failure. Your trading abilities are gifts to be stewarded well, not sources of pride.",
    theme: "stewardship"
  },
  {
    id: 11,
    verse: "Let your eyes look straight ahead; fix your gaze directly before you.",
    reference: "Proverbs 4:25",
    tradingWisdom: "Focus on your trading plan and avoid distractions from market noise or others' opinions. Stay committed to your analysis and strategy.",
    theme: "diligence"
  },
  {
    id: 12,
    verse: "The integrity of the upright guides them, but the unfaithful are destroyed by their duplicity.",
    reference: "Proverbs 11:3",
    tradingWisdom: "Trade with honesty and transparency. A reputation for integrity is more valuable than any single profitable trade.",
    theme: "integrity"
  },
  {
    id: 13,
    verse: "Commit to the LORD whatever you do, and he will establish your plans.",
    reference: "Proverbs 16:3",
    tradingWisdom: "Begin your trading day with prayer and dedication. Align your financial goals with your spiritual values for true fulfillment.",
    theme: "wisdom"
  },
  {
    id: 14,
    verse: "The plans of the diligent lead to profit as surely as haste leads to poverty.",
    reference: "Proverbs 21:5",
    tradingWisdom: "Patience and thorough preparation are rewarded in trading. Impulsive decisions based on emotions often lead to losses.",
    theme: "patience"
  },
  {
    id: 15,
    verse: "Suppose one of you wants to build a tower. Won't you first sit down and estimate the cost to see if you have enough money to complete it?",
    reference: "Luke 14:28",
    tradingWisdom: "Calculate your risk tolerance and position size before entering trades. Proper planning prevents poor performance.",
    theme: "prudence"
  },
  {
    id: 16,
    verse: "All hard work brings a profit, but mere talk leads only to poverty.",
    reference: "Proverbs 14:23",
    tradingWisdom: "Put in the effort to study charts, understand patterns, and refine your strategy. Success comes from disciplined work, not just theory.",
    theme: "diligence"
  },
  {
    id: 17,
    verse: "The fear of the Lord is the beginning of wisdom, and knowledge of the Holy One is understanding.",
    reference: "Proverbs 9:10",
    tradingWisdom: "True wisdom in trading begins with humility and recognizing that markets are ultimately beyond our complete control.",
    theme: "wisdom"
  },
  {
    id: 18,
    verse: "The sluggard craves and gets nothing, but the desires of the diligent are fully satisfied.",
    reference: "Proverbs 13:4",
    tradingWisdom: "Consistently putting in the work to analyze markets and improve your skills will eventually lead to the trading results you desire.",
    theme: "diligence"
  },
  {
    id: 19,
    verse: "Better a little with righteousness than much gain with injustice.",
    reference: "Proverbs 16:8",
    tradingWisdom: "Trading with ethical principles and integrity brings sustainable success, while taking shortcuts can lead to both financial and spiritual losses.",
    theme: "integrity"
  },
  {
    id: 20,
    verse: "Cast your bread upon the waters, for after many days you will find it again.",
    reference: "Ecclesiastes 11:1",
    tradingWisdom: "Investing with patience and a long-term perspective allows compounding to work in your favor. Trust the process over time.",
    theme: "patience"
  },
  {
    id: 21,
    verse: "Dishonest money dwindles away, but whoever gathers money little by little makes it grow.",
    reference: "Proverbs 13:11",
    tradingWisdom: "Building wealth through consistent, honest trading practices yields sustainable results. There are no true shortcuts to trading success.",
    theme: "integrity"
  }
];

/**
 * Gets a scripture wisdom entry based on the date or a specific ID
 * @param id Optional specific ID to retrieve, otherwise uses date-based selection
 * @returns A scripture wisdom entry for the day
 */
export function getScriptureWisdomForToday(id?: number): ScriptureWisdom {
  if (id !== undefined) {
    return scriptureWisdomData.find(item => item.id === id) || scriptureWisdomData[0];
  }
  
  // Use the day of the year to select a scripture
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const diff = (now.getTime() - start.getTime()) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);
  
  // Use the day of year to pick a scripture, cycling through the available data
  const index = dayOfYear % scriptureWisdomData.length;
  return scriptureWisdomData[index];
}