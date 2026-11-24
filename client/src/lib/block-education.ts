/**
 * Block education — the client mirror of the education metadata on the
 * server INDICATOR_CATALOG (server/services/strategy-spec.ts), extended
 * with the non-indicator blocks the Studio offers (session filter, HTF
 * trend filter, the risk settings) and education-only entries for
 * candlesticks and chart patterns.
 *
 * The Strategy Builder Hub renders ALL of its teaching from this file,
 * and ABBA chat reads the same copy from the server catalog — the check
 * script (scripts/check-strategy-builder-hub.ts) pins the indicator
 * entries here to the server's, field for field, so the two surfaces
 * can never drift apart.
 *
 * Honesty rules: tendencies and failure modes only. No profit promises,
 * no win-rate claims, nothing that says a block "works" as a guarantee.
 * Candlestick and chart-pattern entries are EDUCATION ONLY — the spec
 * has no candle-shape or pattern conditions, so they cannot be added
 * to a draft; the library says so on the card.
 */

export type BlockCategory =
  | 'Trend' | 'Momentum' | 'Volatility' | 'Volume'
  | 'Structure & Patterns' | 'Candlesticks' | 'Filters & Risk';

export interface BlockEducation {
  plainName: string;
  category: BlockCategory;
  whatItIs: string;
  whyItWorks: string;
  whyItFails: string;
  pairsWith: string[];
  searchTerms: string[];
}

export const LIBRARY_CATEGORIES: BlockCategory[] = [
  'Trend', 'Momentum', 'Volatility', 'Volume',
  'Structure & Patterns', 'Candlesticks', 'Filters & Risk',
];

/** Education for every buildable block, keyed by indicator kind for
 *  indicators and by block key for the filter / risk blocks. The
 *  indicator entries MUST mirror the server catalog (pinned by check). */
export const BLOCK_EDUCATION: Record<string, BlockEducation> = {
  EMA: {
    plainName: 'Moving average — EMA (fast-reacting)', category: 'Trend',
    whatItIs: 'A moving average that weights recent prices more heavily, so it hugs price closer than a simple average.',
    whyItWorks: 'In a persistent trend, price tends to stay on one side of its EMA and pullbacks often stall near it — so "which side of the EMA" and EMA crosses can keep a strategy trading with the move instead of against it.',
    whyItFails: 'In a sideways market the EMA flattens and price whips across it, producing repeated false crosses. It also lags: entries come after the move has already started.',
    pairsWith: ['ADX', 'RSI', 'SUPERTREND'], searchTerms: ['trend', 'moving average', 'crossover', 'golden cross', 'fast average'],
  },
  SMA: {
    plainName: 'Moving average — SMA (classic 50/200)', category: 'Trend',
    whatItIs: 'The plain average of the last N closes. The 50 and 200 SMAs are the most-watched trend lines in trading.',
    whyItWorks: 'A slow, smooth line gives an objective read of the bigger trend: above it, traders bias long; below it, bias short. Because so many traders watch the same levels, reactions near them can be self-fulfilling.',
    whyItFails: 'It lags even more than an EMA, so trend flips are confirmed late, and in ranges price saws through it in both directions.',
    pairsWith: ['EMA', 'ADX', 'DONCHIAN'], searchTerms: ['trend', 'moving average', '200 day', 'slow average', 'death cross'],
  },
  RSI: {
    plainName: 'RSI — momentum & overbought/oversold', category: 'Momentum',
    whatItIs: 'An oscillator from 0 to 100 comparing recent gains to recent losses. By convention, above 70 is "overbought" and below 30 is "oversold".',
    whyItWorks: 'Momentum extremes often coincide with exhaustion, so RSI turning back out of an extreme can mark a snap-back; holding above or below 50 is also a quick trend-strength read.',
    whyItFails: 'In a strong trend RSI can stay overbought or oversold for a long time — fading it early means fighting the trend. The 70/30 levels are conventions, not walls.',
    pairsWith: ['EMA', 'BOLLINGER', 'VWAP'], searchTerms: ['overbought', 'oversold', 'momentum', 'reversal', 'divergence', 'oscillator'],
  },
  MACD: {
    plainName: 'MACD — momentum shifts', category: 'Momentum',
    whatItIs: 'The difference between a fast and a slow EMA, plotted with its own signal line and a histogram — a trend/momentum hybrid.',
    whyItWorks: 'Crosses of the signal line capture momentum changing direction, and the histogram shows acceleration building or fading before the cross happens.',
    whyItFails: 'It is built from moving averages, so it lags and whipsaws in ranges; crosses near the zero line are especially noisy.',
    pairsWith: ['ADX', 'EMA', 'BOLLINGER'], searchTerms: ['momentum', 'crossover', 'histogram', 'signal line', 'trend change'],
  },
  STOCHASTIC: {
    plainName: 'Stochastic — fast momentum timer', category: 'Momentum',
    whatItIs: 'An oscillator (0–100) showing where the close sits inside the recent high–low range, as %K with its smoothed %D line.',
    whyItWorks: 'A sensitive momentum read — traders use %K/%D crosses out of the extreme zones to time pullback entries inside an existing trend.',
    whyItFails: 'Very twitchy: in a trend it pins at 100 or 0 and produces many false crosses, especially on low timeframes.',
    pairsWith: ['EMA', 'RSI', 'SUPERTREND'], searchTerms: ['overbought', 'oversold', 'momentum', 'timing', 'pullback', 'oscillator'],
  },
  BOLLINGER: {
    plainName: 'Bollinger Bands — stretch & squeeze', category: 'Volatility',
    whatItIs: 'A moving average with bands set a number of standard deviations away, so the bands widen when volatility expands and squeeze tight when it contracts.',
    whyItWorks: 'Band touches mark statistically stretched prices, and a hard squeeze (very narrow bands) often comes before a volatility expansion and breakout.',
    whyItFails: 'In a strong trend price can "walk the band" for many bars — a band touch by itself is not a reversal signal.',
    pairsWith: ['RSI', 'ATR', 'DONCHIAN'], searchTerms: ['volatility', 'bands', 'squeeze', 'breakout', 'stretched', 'mean reversion'],
  },
  ATR: {
    plainName: 'ATR — the volatility ruler', category: 'Volatility',
    whatItIs: 'How much price typically moves per bar, in price units. A ruler for volatility — it says nothing about direction.',
    whyItWorks: 'Stops and targets sized as ATR multiples adapt to the pair and timeframe, instead of one fixed pip number being too tight on a wild pair and too wide on a quiet one.',
    whyItFails: 'It cannot time or direct a trade, and a multiple that fits a quiet week can be far too tight when a news spike hits.',
    pairsWith: ['SUPERTREND', 'DONCHIAN', 'BOLLINGER'], searchTerms: ['volatility', 'stop size', 'position', 'range', 'risk'],
  },
  VWAP: {
    plainName: 'VWAP — the day\'s fair price', category: 'Volume',
    whatItIs: 'The volume-weighted average price for the day, resetting each day — the benchmark institutions often judge executions against.',
    whyItWorks: 'Intraday price stretched far from VWAP tends to get pulled back toward it, and holding above or below VWAP is a quick read on which side is in control today.',
    whyItFails: 'Only meaningful intraday — it resets daily, and FX feeds carry tick volume rather than true exchange volume, so it is an approximation.',
    pairsWith: ['RSI', 'ORB', 'PIVOTS'], searchTerms: ['intraday', 'fair value', 'mean reversion', 'session', 'volume'],
  },
  ADX: {
    plainName: 'ADX — is there a real trend?', category: 'Trend',
    whatItIs: 'Measures trend STRENGTH from 0 to 100 regardless of direction; the +DI/−DI lines show which side is stronger.',
    whyItWorks: 'Mostly used as a filter: trend systems often only take entries when ADX says a real trend exists (commonly above 20–25), skipping the chop where they bleed.',
    whyItFails: 'ADX lags — it rises after a trend is underway and can stay high into exhaustion. It never tells direction by itself.',
    pairsWith: ['EMA', 'SUPERTREND', 'MACD'], searchTerms: ['trend strength', 'filter', 'chop', 'ranging', 'trend or range'],
  },
  CCI: {
    plainName: 'CCI — momentum vs the average', category: 'Momentum',
    whatItIs: 'An oscillator comparing price to its statistical average, scaled so most readings sit between −100 and +100.',
    whyItWorks: 'Crosses of the ±100 lines flag momentum surges and stretched prices; traders use it for trend pullback entries and to spot momentum diverging from price.',
    whyItFails: 'It is unbounded and jumpy — in strong trends it camps beyond ±100 and early counter-trend entries get run over.',
    pairsWith: ['EMA', 'RSI', 'BOLLINGER'], searchTerms: ['momentum', 'overbought', 'oversold', 'divergence', 'oscillator'],
  },
  WILLIAMS_R: {
    plainName: 'Williams %R — short-term extremes', category: 'Momentum',
    whatItIs: 'A fast oscillator (from −100 to 0) showing where the close sits in the recent range; −20 and −80 mark the conventional extreme zones.',
    whyItWorks: 'A quick read on short-term exhaustion — turns out of an extreme zone can time snap-backs and the end of a pullback.',
    whyItFails: 'Extremely sensitive: in a trend it camps in the extreme zone and fires repeated premature counter-trend signals.',
    pairsWith: ['RSI', 'EMA', 'STOCHASTIC'], searchTerms: ['overbought', 'oversold', 'momentum', 'snap back', 'oscillator'],
  },
  ICHIMOKU: {
    plainName: 'Ichimoku — a whole trend system', category: 'Trend',
    whatItIs: 'A complete trend framework in one indicator: the Tenkan and Kijun lines plus the Kumo cloud, all built from mid-point averages.',
    whyItWorks: 'Price above the cloud with Tenkan above Kijun stacks several trend confirmations at once, and the cloud itself acts as a support/resistance zone.',
    whyItFails: 'Slow by design (a 52-period backbone) — it confirms trends late and turns muddy in range-bound markets.',
    pairsWith: ['ADX', 'RSI', 'DONCHIAN'], searchTerms: ['trend', 'cloud', 'kumo', 'system', 'support resistance'],
  },
  SUPERTREND: {
    plainName: 'Supertrend — trend line + trailing stop', category: 'Trend',
    whatItIs: 'An ATR-based line that sits below price in uptrends and above price in downtrends, flipping side when the trend breaks.',
    whyItWorks: 'One clear rule — stay with the trade while price is on the right side of the line — and the line doubles as a trailing stop level that adapts to volatility.',
    whyItFails: 'Flips whipsaw in sideways markets, and every flip happens only after price has already moved against you by roughly the ATR distance.',
    pairsWith: ['ADX', 'ATR', 'EMA'], searchTerms: ['trend', 'trailing stop', 'flip', 'atr'],
  },
  DONCHIAN: {
    plainName: 'Donchian channel — breakout boundaries', category: 'Trend',
    whatItIs: 'The highest high and lowest low of the last N bars as a channel — the boundaries the original Turtle traders used for breakouts.',
    whyItWorks: 'A break of the channel is an objective "new extreme" signal: the method needs no prediction, it just reacts when price does something it has not done in N bars.',
    whyItFails: 'Most breakouts inside ranges are false — the approach accepts many small losses while waiting for a few long trends, and gives back open profit waiting for the middle-line exit.',
    pairsWith: ['ATR', 'ADX', 'EMA'], searchTerms: ['breakout', 'turtle', 'channel', 'new high', 'trend'],
  },
  VOLUME_PROFILE: {
    plainName: 'Volume Profile — where trading happened', category: 'Volume',
    whatItIs: 'A map of how much volume traded at each price: the POC (the most-traded price) and the Value Area holding about 70% of volume, edged by the VAH and VAL.',
    whyItWorks: 'Price tends to be drawn to heavily traded prices (fair value) and to move quickly through thinly traded gaps; value-area edges are watched as support and resistance.',
    whyItFails: 'FX volume is one feed\'s tick volume, not the whole market, and the levels shift with the lookback window — treat them as zones, not exact lines.',
    pairsWith: ['VWAP', 'SWINGS', 'ATR'], searchTerms: ['volume', 'poc', 'value area', 'support resistance', 'fair value', 'auction'],
  },
  PIVOTS: {
    plainName: 'Pivot points — daily reference levels', category: 'Structure & Patterns',
    whatItIs: 'Classic floor-trader levels (the pivot point PP, resistances R1/R2, supports S1/S2) calculated from the prior day\'s high, low and close.',
    whyItWorks: 'They are widely watched intraday reference levels — many traders place stops and targets around them, which can make price reactions there partly self-fulfilling.',
    whyItFails: 'The levels are fixed all day and ignore the current day\'s structure; in a strong trend price runs straight through them.',
    pairsWith: ['VWAP', 'ORB', 'RSI'], searchTerms: ['support resistance', 'levels', 'intraday', 'daily', 'floor trader'],
  },
  ORB: {
    plainName: 'Opening Range Breakout (ORB)', category: 'Structure & Patterns',
    whatItIs: 'The high and low of the first minutes after a session open (the opening range); entries trigger on a break of that range.',
    whyItWorks: 'Session opens concentrate overnight orders and fresh money, so a decisive break of the opening range often sets the session\'s direction early.',
    whyItFails: 'False breakouts are the classic trap — price pokes out of the range, triggers breakout entries, then reverses back inside. A very wide range also leaves no sensible place for a stop.',
    pairsWith: ['VWAP', 'ATR', 'VOLUME_PROFILE'], searchTerms: ['breakout', 'opening range', 'session open', 'new york', 'london'],
  },
  SWINGS: {
    plainName: 'Swing highs & lows — market structure', category: 'Structure & Patterns',
    whatItIs: 'Confirmed turning points (pivots) on the chart — the landmarks for breaks of structure, support/resistance and stop placement.',
    whyItWorks: 'Structure is the backbone of most discretionary systems: a close through the last swing level is an objective change in the short-term trend.',
    whyItFails: 'A pivot only confirms after later bars print, so the level arrives late by design; in choppy markets swings form and break constantly.',
    pairsWith: ['FVG', 'ORDER_BLOCK', 'DONCHIAN'], searchTerms: ['structure', 'break of structure', 'bos', 'support resistance', 'pivot', 'swing'],
  },
  FVG: {
    plainName: 'Fair Value Gap (FVG) — price imbalance', category: 'Structure & Patterns',
    whatItIs: 'An ICT concept: a three-candle imbalance where a strong move leaves a price zone barely traded. The gap\'s top and bottom edges are tracked as levels.',
    whyItWorks: 'Price often revisits imbalances, so a retest of the gap can offer an entry in the direction of the original move, with the far edge as a natural invalidation.',
    whyItFails: 'Not every gap gets revisited, and gaps standing against a strong trend get run straight through. On FX this is a candle-pattern proxy, not exchange order data.',
    pairsWith: ['SWINGS', 'ORDER_BLOCK', 'EMA'], searchTerms: ['ict', 'imbalance', 'gap', 'retest', 'smart money'],
  },
  ORDER_BLOCK: {
    plainName: 'Order Block (ICT) — institutional zone', category: 'Structure & Patterns',
    whatItIs: 'An ICT concept: the last opposing candle before a strong displacement move, treated as the zone where large orders plausibly executed.',
    whyItWorks: 'The first retest of a fresh block is watched for a reaction in the displacement direction — the idea is that unfilled interest remains at that zone.',
    whyItFails: 'Blocks are everywhere if you look loosely — quality depends entirely on the displacement that followed, and old, repeatedly retested blocks lose their meaning.',
    pairsWith: ['FVG', 'SWINGS', 'VOLUME_PROFILE'], searchTerms: ['ict', 'order block', 'zone', 'supply demand', 'smart money', 'retest'],
  },

  // ── Filters (added from the Filters card / library) ────────────────
  SESSION_FILTER: {
    plainName: 'Session filter — trade only certain hours', category: 'Filters & Risk',
    whatItIs: 'A gate that only allows entries inside a set UTC time window, on chosen days of the week.',
    whyItWorks: 'Pairs behave differently by session — London and New York hours bring the volume and cleaner moves for most FX strategies, while the thin hours between sessions tend to chop sideways.',
    whyItFails: 'It cannot rescue a weak entry rule, and a window set in UTC does not move with your local clock across daylight-saving changes.',
    pairsWith: ['ORB', 'VWAP', 'PIVOTS'], searchTerms: ['session', 'hours', 'london', 'new york', 'time filter', 'when to trade'],
  },
  TREND_FILTER: {
    plainName: 'Higher-timeframe trend filter', category: 'Filters & Risk',
    whatItIs: 'A gate on a higher timeframe: your entry rules only fire when the same indicators, computed on (say) H4, also agree with the trade direction.',
    whyItWorks: 'Trading with the bigger trend removes a whole class of counter-trend losses — it is the single most common improvement traders make to a noisy entry rule.',
    whyItFails: 'It delays entries and blocks some good counter-trend setups — and if the filter rules contradict the entry rules, the strategy simply never trades.',
    pairsWith: ['EMA', 'SUPERTREND', 'ADX'], searchTerms: ['higher timeframe', 'htf', 'trend filter', 'multi timeframe', 'mtf', 'confirmation'],
  },

  // ── Risk blocks (set in the Risk & Sizing card) ────────────────────
  STOP_LOSS: {
    plainName: 'Stop loss — your pre-set max loss', category: 'Filters & Risk',
    whatItIs: 'The price where a losing trade is closed automatically, set in pips or as an ATR multiple. It is decided before entry, not during the trade.',
    whyItWorks: 'It caps the damage when a single idea is wrong, which is what keeps a normal string of losses survivable.',
    whyItFails: 'Too tight and ordinary noise stops you out before the idea can play out; too wide and one loss erases many wins. A stop is protection, not an edge by itself.',
    pairsWith: ['ATR', 'TAKE_PROFIT', 'MAX_TRADES_PER_DAY'], searchTerms: ['stop', 'risk', 'exit', 'protection', 'loss limit'],
  },
  TAKE_PROFIT: {
    plainName: 'Take profit — your pre-set target', category: 'Filters & Risk',
    whatItIs: 'The price where a winning trade is closed automatically, locking in the target gain, set in pips or as an ATR multiple.',
    whyItWorks: 'It forces a plan for winners before entry and, together with the stop, defines the reward-to-risk math the whole strategy is judged by.',
    whyItFails: 'A fixed target caps your best trades — and a target closer than the stop means the strategy must win at a very high rate just to break even, before costs.',
    pairsWith: ['STOP_LOSS', 'ATR', 'TRAILING_STOP'], searchTerms: ['target', 'take profit', 'reward', 'exit', 'rr'],
  },
  TRAILING_STOP: {
    plainName: 'Trailing stop — let winners run, protected', category: 'Filters & Risk',
    whatItIs: 'A stop that follows price as the trade moves in your favor, locking in more of the gain the further price runs.',
    whyItWorks: 'It lets a trend run while guaranteeing the trade cannot give everything back — the exit adapts instead of being fixed at entry.',
    whyItFails: 'Ordinary pullbacks inside a trend trigger it; a trail set too tight turns would-be big winners into small ones.',
    pairsWith: ['SUPERTREND', 'DONCHIAN', 'BREAKEVEN'], searchTerms: ['trailing', 'trail', 'lock in', 'let winners run'],
  },
  BREAKEVEN: {
    plainName: 'Breakeven move — risk off the table', category: 'Filters & Risk',
    whatItIs: 'Once a trade is a set number of pips in profit, the stop moves to the entry price (plus a small offset) so the trade can no longer turn into a loser.',
    whyItWorks: 'It converts open risk into a free look at further upside once the trade has proven itself a little.',
    whyItFails: 'Price frequently retests the entry area — a breakeven stop is often tagged by ordinary noise just before the real move.',
    pairsWith: ['STOP_LOSS', 'TRAILING_STOP'], searchTerms: ['breakeven', 'risk free', 'move stop', 'protect'],
  },
  MAX_TRADES_PER_DAY: {
    plainName: 'Max trades per day — the overtrading brake', category: 'Filters & Risk',
    whatItIs: 'A daily cap on how many trades the strategy may open.',
    whyItWorks: 'It stops overtrading spirals and caps how much damage a misfiring rule set can do in a single day.',
    whyItFails: 'The cap can also block the day\'s best setup in the afternoon after a morning of noise trades used it up.',
    pairsWith: ['STOP_LOSS', 'SESSION_FILTER'], searchTerms: ['cap', 'limit', 'overtrading', 'per day', 'discipline'],
  },
};

/** Education-only entries: candlestick shapes. The StrategySpec has no
 *  candle-shape conditions, so these CANNOT be added to a draft — the
 *  library teaches them (with the app's own diagrams) and says plainly
 *  what the closest buildable ideas are. */
export interface LearnOnlyEntry {
  key: string;
  /** Key into patternDiagrams (client/src/components/candlestick-diagrams.tsx). */
  diagram: string;
  education: BlockEducation;
  /** Plain-words note on the closest thing the builder CAN express. */
  closestBuildable: string;
}

export const CANDLE_EDUCATION: LearnOnlyEntry[] = [
  {
    key: 'DOJI', diagram: 'doji',
    education: {
      plainName: 'Doji — indecision candle', category: 'Candlesticks',
      whatItIs: 'A candle whose open and close are nearly equal, leaving a small body with wicks — buyers and sellers fought that bar to a draw.',
      whyItWorks: 'After a one-way run of candles, a doji can mark momentum stalling: neither side could push further, which is worth attention at a key level.',
      whyItFails: 'On its own it predicts nothing — dojis appear constantly in the middle of trends and ranges. Context (the level, the trend, the next candle) is the signal; the doji is just the flag.',
      pairsWith: ['SWINGS', 'RSI'], searchTerms: ['candle', 'candlestick', 'indecision', 'doji', 'stalling'],
    },
    closestBuildable: 'The builder has no candle-shape conditions. Traders express the same idea with a SWINGS level plus an RSI turn (turns up / turns down) at that level.',
  },
  {
    key: 'HAMMER', diagram: 'hammer',
    education: {
      plainName: 'Hammer — rejection of lower prices', category: 'Candlesticks',
      whatItIs: 'A candle with a long lower wick and a small body near the top: price was pushed down hard and bought back within the same bar.',
      whyItWorks: 'At a support level after a decline, it shows sellers tried and were rejected — the first hint the downside is exhausted.',
      whyItFails: 'The identical shape inside a range means little, and many traders wait for a strong following close as confirmation — the hammer alone is not the entry.',
      pairsWith: ['SWINGS', 'PIVOTS'], searchTerms: ['candle', 'candlestick', 'hammer', 'reversal', 'rejection', 'pin bar'],
    },
    closestBuildable: 'Not a builder condition. The closest mechanical version: price crossing back above a SWINGS swing low (the liquidity-sweep reclaim the ICT preset uses).',
  },
  {
    key: 'ENGULFING', diagram: 'engulfing',
    education: {
      plainName: 'Engulfing candle — one-bar takeover', category: 'Candlesticks',
      whatItIs: 'A candle whose body completely covers the previous candle\'s body — a decisive one-bar change of control between buyers and sellers.',
      whyItWorks: 'At an extreme or a watched level it can mark the moment the other side actually took over, not just slowed down.',
      whyItFails: 'Engulfing candles also occur mid-trend as ordinary pullbacks. Size relative to recent volatility (ATR) and location matter more than the shape itself.',
      pairsWith: ['ATR', 'SWINGS'], searchTerms: ['candle', 'candlestick', 'engulfing', 'reversal', 'takeover'],
    },
    closestBuildable: 'Not a builder condition. Traders approximate it with momentum turns (RSI / MACD crossing) after price reaches a SWINGS or Volume Profile level.',
  },
  {
    key: 'MORNING_STAR', diagram: 'morningStar',
    education: {
      plainName: 'Morning Star — three-candle bottom', category: 'Candlesticks',
      whatItIs: 'A three-candle sequence at lows: a strong down candle, a small indecision candle, then a strong up candle closing deep into the first.',
      whyItWorks: 'It strings the whole reversal story into one readable pattern — exhaustion, a pause, then buyers taking control.',
      whyItFails: 'It needs a genuine preceding decline and a convincing third candle; loose definitions find "stars" everywhere, including mid-range noise.',
      pairsWith: ['RSI', 'SWINGS'], searchTerms: ['candle', 'candlestick', 'morning star', 'reversal', 'bottom'],
    },
    closestBuildable: 'Not a builder condition. A mechanical cousin: RSI crossing up out of oversold while price holds above a swing low.',
  },
];

/** Education-only entries: chart patterns (also covered by the Strategy
 *  Wizard's pattern templates — the Studio spec cannot express them). */
export const PATTERN_EDUCATION: LearnOnlyEntry[] = [
  {
    key: 'HEAD_AND_SHOULDERS', diagram: 'headShoulders',
    education: {
      plainName: 'Head & Shoulders — topping pattern', category: 'Structure & Patterns',
      whatItIs: 'Three peaks where the middle (the head) is highest, over a shared "neckline" — a classic picture of a trend running out of buyers.',
      whyItWorks: 'Each failed push to a new high shows momentum draining; a break of the neckline confirms the balance actually flipped.',
      whyItFails: 'Shoulders are rarely as tidy as the textbook drawing, and apparent patterns fail mid-formation all the time — the neckline break is the tradable event, not the shape.',
      pairsWith: ['SWINGS', 'DONCHIAN'], searchTerms: ['pattern', 'head and shoulders', 'reversal', 'top', 'neckline'],
    },
    closestBuildable: 'Patterns are the Strategy Wizard\'s templates, not Studio conditions. The mechanical cousin here: SWINGS break-of-structure (a close through the last swing low).',
  },
  {
    key: 'DOUBLE_TOP', diagram: 'doubleTop',
    education: {
      plainName: 'Double Top / Double Bottom', category: 'Structure & Patterns',
      whatItIs: 'Price tests the same high (or low) twice and fails both times, with a dip (or rally) in between.',
      whyItWorks: 'A level that rejects price twice has proven sellers (or buyers) defending it; the break of the in-between swing confirms the turn.',
      whyItFails: 'Plenty of double tops are just pauses before the trend resumes through the level — the second test succeeding is exactly the false signal.',
      pairsWith: ['SWINGS', 'PIVOTS'], searchTerms: ['pattern', 'double top', 'double bottom', 'reversal', 'level'],
    },
    closestBuildable: 'Not a Studio condition. Approximated with SWINGS: entries on a close back through the swing between the two tests.',
  },
  {
    key: 'FLAG_PENNANT', diagram: 'flagPennant',
    education: {
      plainName: 'Flag / Pennant — trend pause', category: 'Structure & Patterns',
      whatItIs: 'A sharp move (the pole) followed by a tight, drifting consolidation (the flag) — a pause inside a trend rather than a reversal.',
      whyItWorks: 'The tight range shows the move is being absorbed, not reversed; a break in the trend\'s direction resumes the original momentum.',
      whyItFails: 'Flags drift into ranges and break the wrong way often enough that the pole\'s strength and the breakout\'s follow-through do the real work.',
      pairsWith: ['DONCHIAN', 'BOLLINGER'], searchTerms: ['pattern', 'flag', 'pennant', 'continuation', 'breakout'],
    },
    closestBuildable: 'Not a Studio condition. The Donchian breakout preset trades the same idea mechanically: a break of the recent range.',
  },
  {
    key: 'CUP_HANDLE', diagram: 'cupHandle',
    education: {
      plainName: 'Cup & Handle — rounded base', category: 'Structure & Patterns',
      whatItIs: 'A long, rounded recovery back to a prior high (the cup), a small pullback (the handle), then a breakout — mostly a stock-chart pattern over weeks.',
      whyItWorks: 'The slow base shakes out weak holders gradually, so the eventual breakout starts from a cleared supply zone.',
      whyItFails: 'It forms over weeks to months — on intraday FX timeframes the "cups" found are mostly noise wearing a costume.',
      pairsWith: ['DONCHIAN', 'SMA'], searchTerms: ['pattern', 'cup and handle', 'base', 'breakout'],
    },
    closestBuildable: 'Not a Studio condition, and a poor fit for intraday FX. A Donchian or swing breakout is the honest mechanical version.',
  },
  {
    key: 'TRIANGLE', diagram: 'triangle',
    education: {
      plainName: 'Triangle — coiling range', category: 'Structure & Patterns',
      whatItIs: 'Converging highs and lows squeezing price into a point — a volatility coil as buyers and sellers meet in the middle.',
      whyItWorks: 'The coil stores energy: whichever side finally breaks the boundary often travels, because stops and breakout entries cluster just outside it.',
      whyItFails: 'Triangles fake-break in both directions before resolving; the first poke out is wrong often enough that many traders wait for a retest.',
      pairsWith: ['BOLLINGER', 'ATR'], searchTerms: ['pattern', 'triangle', 'coil', 'squeeze', 'breakout'],
    },
    closestBuildable: 'Not a Studio condition. Bollinger squeeze (narrow bands) + a Donchian break is the mechanical expression of the same coil-and-break idea.',
  },
  {
    key: 'WEDGE', diagram: 'wedge',
    education: {
      plainName: 'Wedge — tiring trend', category: 'Structure & Patterns',
      whatItIs: 'A trend moving in converging lines — each push goes a shorter distance than the last, like a car running out of fuel uphill.',
      whyItWorks: 'The shrinking pushes show the trend\'s energy draining before price actually turns, giving an early reversal warning.',
      whyItFails: 'Wedges can extend far longer than expected, and "tiring" trends regularly fire one more strong push before turning.',
      pairsWith: ['RSI', 'MACD'], searchTerms: ['pattern', 'wedge', 'rising wedge', 'falling wedge', 'exhaustion'],
    },
    closestBuildable: 'Not a Studio condition. Momentum divergence is the classic companion idea — RSI/MACD weakening while price pushes (read in the oscillator entries above).',
  },
];

/** Plain-name lookup used across the Hub (health lines, library, draft). */
export function plainNameOf(key: string): string {
  return BLOCK_EDUCATION[key]?.plainName
    ?? CANDLE_EDUCATION.find((c) => c.key === key)?.education.plainName
    ?? PATTERN_EDUCATION.find((p) => p.key === key)?.education.plainName
    ?? key;
}
