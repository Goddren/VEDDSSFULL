// Supreme Mathematics (Five Percent Nation / NGE) — each calendar day maps to
// one of ten degrees (1-9, then 0), cycling every 10 days of the month. Pure,
// deterministic lookup — no AI generation, no DB row, computed from the date
// the same way every time.

export interface SupremeMathematicsEntry {
  degree: number;
  name: string;
  meaning: string;
  tradingTieIn: string;
}

const DEGREES: Record<number, Omit<SupremeMathematicsEntry, 'degree'>> = {
  1: {
    name: 'Knowledge',
    meaning: 'The foundation of everything that exists. Nothing is built without it first being known.',
    tradingTieIn: 'Know your setup, your levels, and your risk before you know anything else. Knowledge is the base every trade is built on.',
  },
  2: {
    name: 'Wisdom',
    meaning: 'The wise word and wise action — what you do with what you know.',
    tradingTieIn: 'A plan is knowledge. Executing it with discipline, even when it is uncomfortable, is wisdom.',
  },
  3: {
    name: 'Understanding',
    meaning: 'Clarity — seeing all sides of a matter, the fruit of applying knowledge and wisdom together.',
    tradingTieIn: 'A losing trade taken correctly and a winning trade taken recklessly are not the same. Understanding is knowing the difference.',
  },
  4: {
    name: 'Culture / Freedom',
    meaning: 'Your way of life and practice — the freedom that comes from living by your own knowledge of self.',
    tradingTieIn: 'Trade your plan, not someone else\'s. The freedom in this game comes from a process that is actually yours.',
  },
  5: {
    name: 'Power / Refinement',
    meaning: 'The power to bring something into existence, and the refinement needed to wield that power responsibly.',
    tradingTieIn: 'Leverage and position size are power. Refinement is knowing exactly how much of it you can handle before it handles you.',
  },
  6: {
    name: 'Equality',
    meaning: 'Being equal and balanced in your dealings — giving the same energy you expect in return.',
    tradingTieIn: 'Every trade gets the same process, win or lose. No shortcuts on the good days, no revenge on the bad ones.',
  },
  7: {
    name: 'God',
    meaning: 'The Supreme Being — the highest manifestation of self-knowledge, and the summary of everything that came before it.',
    tradingTieIn: 'The version of you that shows up after knowledge, wisdom, understanding, culture, power, and equality have been earned — not skipped.',
  },
  8: {
    name: 'Build / Destroy',
    meaning: 'Constructing something positive, or tearing down what no longer serves growth so something better can be built.',
    tradingTieIn: 'A bad habit, a broken rule, an oversized position — some things in your process need to be destroyed before the next thing can be built.',
  },
  9: {
    name: 'Born',
    meaning: 'The manifestation of a completed cycle — bringing something into reality after moving through 1 through 8.',
    tradingTieIn: 'This is the account, the skill, the discipline you are becoming — not overnight, but one completed cycle at a time.',
  },
  0: {
    name: 'Cipher',
    meaning: 'The whole and the complete circle — everything and nothing at once, the never-ending cycle that starts again.',
    tradingTieIn: 'The market never stops cycling. Neither does the work. Today closes one cipher and opens the next.',
  },
};

/** Day-of-month maps to a degree 1-9, then 0 on the 10th/20th/30th (day % 10). */
export function getSupremeMathematicsDegree(date: Date = new Date()): number {
  return date.getDate() % 10;
}

export function getSupremeMathematicsForDate(date: Date = new Date()): SupremeMathematicsEntry {
  const degree = getSupremeMathematicsDegree(date);
  return { degree, ...DEGREES[degree] };
}
