/**
 * Strategy Spec — the shared language of the Strategy Wizard.
 *
 * One JSON spec describes a strategy whether it came from a template
 * (source: 'template', a preset that fills this shape) or from the
 * condition builder (source: 'builder', user-composed indicator rules).
 * The same spec drives:
 *   - the deterministic backtester (strategy-backtest.ts)
 *   - the MT5 EA bridge (maps the spec into the existing EA generator)
 *   - the deploy/brain layer (a saved spec is the strategy entity)
 *
 * Conditions compare an indicator series (or price) against a constant,
 * another indicator series, or price — e.g. "RSI(14) crosses_above 30",
 * "EMA(9) crosses_above EMA(21)", "close above Bollinger upper".
 */

export type IndicatorKind =
  | 'EMA' | 'SMA' | 'RSI' | 'MACD' | 'STOCHASTIC' | 'BOLLINGER' | 'ATR'
  | 'VWAP' | 'ADX' | 'CCI' | 'WILLIAMS_R' | 'ICHIMOKU' | 'SUPERTREND' | 'DONCHIAN'
  | 'VOLUME_PROFILE' | 'PIVOTS' | 'ORB' | 'SWINGS' | 'FVG' | 'ORDER_BLOCK';
export type StrategyTimeframe = 'M1' | 'M5' | 'M15' | 'M30' | 'H1' | 'H4' | 'D1';

export interface IndicatorConfig {
  id: string;                 // unique within the spec, referenced by conditions
  kind: IndicatorKind;
  period?: number;            // EMA/SMA/RSI/ATR/Bollinger lookback; stochastic %K period
  fastPeriod?: number;        // MACD
  slowPeriod?: number;        // MACD
  signalPeriod?: number;      // MACD signal / stochastic %D smoothing
  stdDev?: number;            // Bollinger / Supertrend ATR multiplier
  /** EMA/SMA only: smooth another indicator's 'value' series instead of price. */
  sourceId?: string;
  lookbackBars?: number;      // VOLUME_PROFILE: rolling window in bars
  valueAreaPct?: number;      // VOLUME_PROFILE: value area share (e.g. 70)
  pivotLeft?: number;         // SWINGS / FVG / ORDER_BLOCK: pivot confirmation bars
  pivotRight?: number;
  sessionStartHourUtc?: number;   // ORB: opening-range session start (UTC)
  sessionStartMinuteUtc?: number;
  rangeMinutes?: number;          // ORB: opening range length
}

export type ConditionField =
  | 'value' | 'signal' | 'histogram' | 'upper' | 'middle' | 'lower' | 'k' | 'd' | 'price'
  | 'poc' | 'vah' | 'val'
  | 'tenkan' | 'kijun' | 'span_a' | 'span_b'
  | 'plus' | 'minus'
  | 'swing_high' | 'swing_low' | 'or_high' | 'or_low'
  | 'bull_high' | 'bull_low' | 'bear_high' | 'bear_low'
  | 'pp' | 'r1' | 'r2' | 's1' | 's2';
export type ConditionOperator =
  | 'crosses_above' | 'crosses_below' | 'above' | 'below' | 'rising' | 'falling'
  | 'turns_up' | 'turns_down';

export type ConditionCompare =
  | { kind: 'value'; value: number }
  | { kind: 'indicator'; indicatorId: string; field: ConditionField }
  | { kind: 'price' };

export interface Condition {
  /** Indicator config id, or the literal 'price' for the close series. */
  indicatorId: string;
  field: ConditionField;
  operator: ConditionOperator;
  compare: ConditionCompare;  // ignored for rising/falling/turns_*
  /** The condition must hold on this many consecutive bars (incl. current). */
  sustainBars?: number;
  /** For above/below/crosses: the gap past the compare level, in pips. */
  minGapPips?: number;
}

export interface ConditionGroup {
  logic: 'AND' | 'OR';
  conditions: Condition[];
}

export interface StrategyRisk {
  lotSize: number;
  stopLossPips?: number | null;
  takeProfitPips?: number | null;
  stopLossAtrMult?: number | null;    // used when the spec includes an ATR indicator
  takeProfitAtrMult?: number | null;
  trailingStopPips?: number | null;
  maxTradesPerDay?: number | null;
  /** Move the stop to entry (+offset) once price runs this far in profit. */
  breakevenTriggerPips?: number | null;
  breakevenOffsetPips?: number | null;
}

/** Multi-timeframe trend filter: entry groups on the base timeframe only
 *  fire when the filter group — the same indicator ids computed on
 *  resampled higher-timeframe bars — also holds on the last closed HTF bar. */
export interface TrendFilter {
  timeframe: StrategyTimeframe;
  longGroup?: ConditionGroup | null;   // must hold for long entries
  shortGroup?: ConditionGroup | null;  // must hold for short entries
}

/** Session filter: entries only on bars inside the UTC window. */
export interface SessionFilter {
  startHourUtc: number;   // 0–23
  endHourUtc: number;     // 0–24 (exclusive); wraps midnight when end < start
  daysUtc?: number[];     // 0=Sunday … 6=Saturday; empty = all days
}

/** The FX engine's built-in strategy keys — mirror of ALL_STRATEGY_KEYS in
 *  services/live-trading-engine.ts. Engine strategies join the wizard's
 *  choose list; ones without mechanical rules carry source 'engine' with
 *  empty condition groups and run on the engine's AI analysis when deployed. */
export const ENGINE_STRATEGY_KEYS = [
  'scalping', 'momentum', 'session_breakout', 'aggressive', 'sniper', 'compound',
  'chart_pattern', 'ict_order_blocks', 'ict_fvg', 'ict_liquidity_sweep', 'ict_bos', 'ict_ote',
  'smc_demand_supply', 'asia_range_breakout', 'vwap_mean_reversion', 'news_fade',
  'prop_firm_sniper', 'sunday_gap', 'order_flow',
] as const;
export type EngineStrategyKey = (typeof ENGINE_STRATEGY_KEYS)[number];

export interface StrategySpec {
  name: string;
  source: 'template' | 'builder' | 'engine';
  /** Set when source is 'engine': which FX-engine strategy this entry is. */
  engineStrategyKey?: string;
  templateId?: string;
  symbol: string;
  timeframe: StrategyTimeframe;
  indicators: IndicatorConfig[];
  entryLong: ConditionGroup;
  entryShort: ConditionGroup;
  exitLong?: ConditionGroup | null;
  exitShort?: ConditionGroup | null;
  trendFilter?: TrendFilter | null;
  sessionFilter?: SessionFilter | null;
  risk: StrategyRisk;
  /** Set ONLY on a buyer's cloned copy of a Marketplace strategy
   *  listing: which listing/seller/strategy it came from and which
   *  proof (shadow or live) the seller's record carried. The runner
   *  ignores it; it exists so the copy is honestly labelled forever. */
  marketplace?: {
    purchased: true;
    source: 'marketplace_strategy';
    listingId: number;
    sellerId: number;
    sourceStrategyId: number;
    proofType: 'shadow' | 'live';
    /** 'purchase' (default, permanent) or 'subscription' — a
     *  subscription clone loses deployment access when the buyer's
     *  subscription to the listing lapses (marketplace-subscriptions). */
    grantType?: 'purchase' | 'subscription';
  };
  /** How this strategy came to exist: 'abba' when the user built it by
   *  talking to ABBA (stamped server-side by the ABBA save route only),
   *  'studio' or absent for specs composed in the Studio UI. Display /
   *  provenance metadata — the runner ignores it, same as marketplace. */
  createdVia?: 'abba' | 'studio';
}

/** Plain-language education for one buildable block, shown to the user
 *  at the moment they pick it (Studio library + draft) and available to
 *  ABBA chat from this same source, so both surfaces teach identically.
 *  Factual tendencies + failure modes only — never a performance claim. */
export type BlockCategory =
  | 'Trend' | 'Momentum' | 'Volatility' | 'Volume'
  | 'Structure & Patterns' | 'Candlesticks' | 'Filters & Risk';

export interface BlockEducation {
  /** Friendly name a beginner recognises ("Moving average (EMA)"). */
  plainName: string;
  category: BlockCategory;
  /** What the block is, in one or two plain sentences. */
  whatItIs: string;
  /** Why traders use it — the tendency it tries to capture. */
  whyItWorks: string;
  /** Its known weakness — how it false-signals or gets misused. */
  whyItFails: string;
  /** Catalog keys (indicator kinds or block keys) it combines well with. */
  pairsWith: string[];
  /** Plain words a user might search by ("breakout", "overbought"). */
  searchTerms: string[];
}

export const INDICATOR_CATALOG: Array<{
  kind: IndicatorKind; label: string; fields: ConditionField[]; defaults: Partial<IndicatorConfig>;
  education: BlockEducation;
}> = [
  { kind: 'EMA', label: 'Exponential Moving Average', fields: ['value'], defaults: { period: 21 }, education: {
    plainName: 'Moving average — EMA (fast-reacting)', category: 'Trend',
    whatItIs: 'A moving average that weights recent prices more heavily, so it hugs price closer than a simple average.',
    whyItWorks: 'In a persistent trend, price tends to stay on one side of its EMA and pullbacks often stall near it — so "which side of the EMA" and EMA crosses can keep a strategy trading with the move instead of against it.',
    whyItFails: 'In a sideways market the EMA flattens and price whips across it, producing repeated false crosses. It also lags: entries come after the move has already started.',
    pairsWith: ['ADX', 'RSI', 'SUPERTREND'], searchTerms: ['trend', 'moving average', 'crossover', 'golden cross', 'fast average'],
  } },
  { kind: 'SMA', label: 'Simple Moving Average', fields: ['value'], defaults: { period: 50 }, education: {
    plainName: 'Moving average — SMA (classic 50/200)', category: 'Trend',
    whatItIs: 'The plain average of the last N closes. The 50 and 200 SMAs are the most-watched trend lines in trading.',
    whyItWorks: 'A slow, smooth line gives an objective read of the bigger trend: above it, traders bias long; below it, bias short. Because so many traders watch the same levels, reactions near them can be self-fulfilling.',
    whyItFails: 'It lags even more than an EMA, so trend flips are confirmed late, and in ranges price saws through it in both directions.',
    pairsWith: ['EMA', 'ADX', 'DONCHIAN'], searchTerms: ['trend', 'moving average', '200 day', 'slow average', 'death cross'],
  } },
  { kind: 'RSI', label: 'Relative Strength Index', fields: ['value'], defaults: { period: 14 }, education: {
    plainName: 'RSI — momentum & overbought/oversold', category: 'Momentum',
    whatItIs: 'An oscillator from 0 to 100 comparing recent gains to recent losses. By convention, above 70 is "overbought" and below 30 is "oversold".',
    whyItWorks: 'Momentum extremes often coincide with exhaustion, so RSI turning back out of an extreme can mark a snap-back; holding above or below 50 is also a quick trend-strength read.',
    whyItFails: 'In a strong trend RSI can stay overbought or oversold for a long time — fading it early means fighting the trend. The 70/30 levels are conventions, not walls.',
    pairsWith: ['EMA', 'BOLLINGER', 'VWAP'], searchTerms: ['overbought', 'oversold', 'momentum', 'reversal', 'divergence', 'oscillator'],
  } },
  { kind: 'MACD', label: 'MACD', fields: ['value', 'signal', 'histogram'], defaults: { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 }, education: {
    plainName: 'MACD — momentum shifts', category: 'Momentum',
    whatItIs: 'The difference between a fast and a slow EMA, plotted with its own signal line and a histogram — a trend/momentum hybrid.',
    whyItWorks: 'Crosses of the signal line capture momentum changing direction, and the histogram shows acceleration building or fading before the cross happens.',
    whyItFails: 'It is built from moving averages, so it lags and whipsaws in ranges; crosses near the zero line are especially noisy.',
    pairsWith: ['ADX', 'EMA', 'BOLLINGER'], searchTerms: ['momentum', 'crossover', 'histogram', 'signal line', 'trend change'],
  } },
  { kind: 'STOCHASTIC', label: 'Stochastic Oscillator', fields: ['k', 'd'], defaults: { period: 14, signalPeriod: 3 }, education: {
    plainName: 'Stochastic — fast momentum timer', category: 'Momentum',
    whatItIs: 'An oscillator (0–100) showing where the close sits inside the recent high–low range, as %K with its smoothed %D line.',
    whyItWorks: 'A sensitive momentum read — traders use %K/%D crosses out of the extreme zones to time pullback entries inside an existing trend.',
    whyItFails: 'Very twitchy: in a trend it pins at 100 or 0 and produces many false crosses, especially on low timeframes.',
    pairsWith: ['EMA', 'RSI', 'SUPERTREND'], searchTerms: ['overbought', 'oversold', 'momentum', 'timing', 'pullback', 'oscillator'],
  } },
  { kind: 'BOLLINGER', label: 'Bollinger Bands', fields: ['upper', 'middle', 'lower'], defaults: { period: 20, stdDev: 2 }, education: {
    plainName: 'Bollinger Bands — stretch & squeeze', category: 'Volatility',
    whatItIs: 'A moving average with bands set a number of standard deviations away, so the bands widen when volatility expands and squeeze tight when it contracts.',
    whyItWorks: 'Band touches mark statistically stretched prices, and a hard squeeze (very narrow bands) often comes before a volatility expansion and breakout.',
    whyItFails: 'In a strong trend price can "walk the band" for many bars — a band touch by itself is not a reversal signal.',
    pairsWith: ['RSI', 'ATR', 'DONCHIAN'], searchTerms: ['volatility', 'bands', 'squeeze', 'breakout', 'stretched', 'mean reversion'],
  } },
  { kind: 'ATR', label: 'Average True Range', fields: ['value'], defaults: { period: 14 }, education: {
    plainName: 'ATR — the volatility ruler', category: 'Volatility',
    whatItIs: 'How much price typically moves per bar, in price units. A ruler for volatility — it says nothing about direction.',
    whyItWorks: 'Stops and targets sized as ATR multiples adapt to the pair and timeframe, instead of one fixed pip number being too tight on a wild pair and too wide on a quiet one.',
    whyItFails: 'It cannot time or direct a trade, and a multiple that fits a quiet week can be far too tight when a news spike hits.',
    pairsWith: ['SUPERTREND', 'DONCHIAN', 'BOLLINGER'], searchTerms: ['volatility', 'stop size', 'position', 'range', 'risk'],
  } },
  { kind: 'VWAP', label: 'VWAP (daily reset)', fields: ['value'], defaults: {}, education: {
    plainName: 'VWAP — the day\'s fair price', category: 'Volume',
    whatItIs: 'The volume-weighted average price for the day, resetting each day — the benchmark institutions often judge executions against.',
    whyItWorks: 'Intraday price stretched far from VWAP tends to get pulled back toward it, and holding above or below VWAP is a quick read on which side is in control today.',
    whyItFails: 'Only meaningful intraday — it resets daily, and FX feeds carry tick volume rather than true exchange volume, so it is an approximation.',
    pairsWith: ['RSI', 'ORB', 'PIVOTS'], searchTerms: ['intraday', 'fair value', 'mean reversion', 'session', 'volume'],
  } },
  { kind: 'ADX', label: 'ADX (trend strength)', fields: ['value', 'plus', 'minus'], defaults: { period: 14 }, education: {
    plainName: 'ADX — is there a real trend?', category: 'Trend',
    whatItIs: 'Measures trend STRENGTH from 0 to 100 regardless of direction; the +DI/−DI lines show which side is stronger.',
    whyItWorks: 'Mostly used as a filter: trend systems often only take entries when ADX says a real trend exists (commonly above 20–25), skipping the chop where they bleed.',
    whyItFails: 'ADX lags — it rises after a trend is underway and can stay high into exhaustion. It never tells direction by itself.',
    pairsWith: ['EMA', 'SUPERTREND', 'MACD'], searchTerms: ['trend strength', 'filter', 'chop', 'ranging', 'trend or range'],
  } },
  { kind: 'CCI', label: 'CCI', fields: ['value'], defaults: { period: 20 }, education: {
    plainName: 'CCI — momentum vs the average', category: 'Momentum',
    whatItIs: 'An oscillator comparing price to its statistical average, scaled so most readings sit between −100 and +100.',
    whyItWorks: 'Crosses of the ±100 lines flag momentum surges and stretched prices; traders use it for trend pullback entries and to spot momentum diverging from price.',
    whyItFails: 'It is unbounded and jumpy — in strong trends it camps beyond ±100 and early counter-trend entries get run over.',
    pairsWith: ['EMA', 'RSI', 'BOLLINGER'], searchTerms: ['momentum', 'overbought', 'oversold', 'divergence', 'oscillator'],
  } },
  { kind: 'WILLIAMS_R', label: 'Williams %R', fields: ['value'], defaults: { period: 14 }, education: {
    plainName: 'Williams %R — short-term extremes', category: 'Momentum',
    whatItIs: 'A fast oscillator (from −100 to 0) showing where the close sits in the recent range; −20 and −80 mark the conventional extreme zones.',
    whyItWorks: 'A quick read on short-term exhaustion — turns out of an extreme zone can time snap-backs and the end of a pullback.',
    whyItFails: 'Extremely sensitive: in a trend it camps in the extreme zone and fires repeated premature counter-trend signals.',
    pairsWith: ['RSI', 'EMA', 'STOCHASTIC'], searchTerms: ['overbought', 'oversold', 'momentum', 'snap back', 'oscillator'],
  } },
  { kind: 'ICHIMOKU', label: 'Ichimoku Cloud', fields: ['tenkan', 'kijun', 'span_a', 'span_b'], defaults: { period: 9, fastPeriod: 26, slowPeriod: 52 }, education: {
    plainName: 'Ichimoku — a whole trend system', category: 'Trend',
    whatItIs: 'A complete trend framework in one indicator: the Tenkan and Kijun lines plus the Kumo cloud, all built from mid-point averages.',
    whyItWorks: 'Price above the cloud with Tenkan above Kijun stacks several trend confirmations at once, and the cloud itself acts as a support/resistance zone.',
    whyItFails: 'Slow by design (a 52-period backbone) — it confirms trends late and turns muddy in range-bound markets.',
    pairsWith: ['ADX', 'RSI', 'DONCHIAN'], searchTerms: ['trend', 'cloud', 'kumo', 'system', 'support resistance'],
  } },
  { kind: 'SUPERTREND', label: 'Supertrend', fields: ['value'], defaults: { period: 10, stdDev: 3 }, education: {
    plainName: 'Supertrend — trend line + trailing stop', category: 'Trend',
    whatItIs: 'An ATR-based line that sits below price in uptrends and above price in downtrends, flipping side when the trend breaks.',
    whyItWorks: 'One clear rule — stay with the trade while price is on the right side of the line — and the line doubles as a trailing stop level that adapts to volatility.',
    whyItFails: 'Flips whipsaw in sideways markets, and every flip happens only after price has already moved against you by roughly the ATR distance.',
    pairsWith: ['ADX', 'ATR', 'EMA'], searchTerms: ['trend', 'trailing stop', 'flip', 'atr'],
  } },
  { kind: 'DONCHIAN', label: 'Donchian Channel', fields: ['upper', 'middle', 'lower'], defaults: { period: 20 }, education: {
    plainName: 'Donchian channel — breakout boundaries', category: 'Trend',
    whatItIs: 'The highest high and lowest low of the last N bars as a channel — the boundaries the original Turtle traders used for breakouts.',
    whyItWorks: 'A break of the channel is an objective "new extreme" signal: the method needs no prediction, it just reacts when price does something it has not done in N bars.',
    whyItFails: 'Most breakouts inside ranges are false — the approach accepts many small losses while waiting for a few long trends, and gives back open profit waiting for the middle-line exit.',
    pairsWith: ['ATR', 'ADX', 'EMA'], searchTerms: ['breakout', 'turtle', 'channel', 'new high', 'trend'],
  } },
  { kind: 'VOLUME_PROFILE', label: 'Volume Profile (POC / Value Area)', fields: ['poc', 'vah', 'val'], defaults: { lookbackBars: 100, valueAreaPct: 70 }, education: {
    plainName: 'Volume Profile — where trading happened', category: 'Volume',
    whatItIs: 'A map of how much volume traded at each price: the POC (the most-traded price) and the Value Area holding about 70% of volume, edged by the VAH and VAL.',
    whyItWorks: 'Price tends to be drawn to heavily traded prices (fair value) and to move quickly through thinly traded gaps; value-area edges are watched as support and resistance.',
    whyItFails: 'FX volume is one feed\'s tick volume, not the whole market, and the levels shift with the lookback window — treat them as zones, not exact lines.',
    pairsWith: ['VWAP', 'SWINGS', 'ATR'], searchTerms: ['volume', 'poc', 'value area', 'support resistance', 'fair value', 'auction'],
  } },
  { kind: 'PIVOTS', label: 'Daily Pivot Points', fields: ['pp', 'r1', 'r2', 's1', 's2'], defaults: {}, education: {
    plainName: 'Pivot points — daily reference levels', category: 'Structure & Patterns',
    whatItIs: 'Classic floor-trader levels (the pivot point PP, resistances R1/R2, supports S1/S2) calculated from the prior day\'s high, low and close.',
    whyItWorks: 'They are widely watched intraday reference levels — many traders place stops and targets around them, which can make price reactions there partly self-fulfilling.',
    whyItFails: 'The levels are fixed all day and ignore the current day\'s structure; in a strong trend price runs straight through them.',
    pairsWith: ['VWAP', 'ORB', 'RSI'], searchTerms: ['support resistance', 'levels', 'intraday', 'daily', 'floor trader'],
  } },
  { kind: 'ORB', label: 'Opening Range (ORB)', fields: ['or_high', 'or_low'], defaults: { sessionStartHourUtc: 14, sessionStartMinuteUtc: 30, rangeMinutes: 30 }, education: {
    plainName: 'Opening Range Breakout (ORB)', category: 'Structure & Patterns',
    whatItIs: 'The high and low of the first minutes after a session open (the opening range); entries trigger on a break of that range.',
    whyItWorks: 'Session opens concentrate overnight orders and fresh money, so a decisive break of the opening range often sets the session\'s direction early.',
    whyItFails: 'False breakouts are the classic trap — price pokes out of the range, triggers breakout entries, then reverses back inside. A very wide range also leaves no sensible place for a stop.',
    pairsWith: ['VWAP', 'ATR', 'VOLUME_PROFILE'], searchTerms: ['breakout', 'opening range', 'session open', 'new york', 'london'],
  } },
  { kind: 'SWINGS', label: 'Swing Highs / Lows (structure)', fields: ['swing_high', 'swing_low'], defaults: { pivotLeft: 3, pivotRight: 3 }, education: {
    plainName: 'Swing highs & lows — market structure', category: 'Structure & Patterns',
    whatItIs: 'Confirmed turning points (pivots) on the chart — the landmarks for breaks of structure, support/resistance and stop placement.',
    whyItWorks: 'Structure is the backbone of most discretionary systems: a close through the last swing level is an objective change in the short-term trend.',
    whyItFails: 'A pivot only confirms after later bars print, so the level arrives late by design; in choppy markets swings form and break constantly.',
    pairsWith: ['FVG', 'ORDER_BLOCK', 'DONCHIAN'], searchTerms: ['structure', 'break of structure', 'bos', 'support resistance', 'pivot', 'swing'],
  } },
  { kind: 'FVG', label: 'Fair Value Gaps (ICT)', fields: ['bull_high', 'bull_low', 'bear_high', 'bear_low'], defaults: { lookbackBars: 100 }, education: {
    plainName: 'Fair Value Gap (FVG) — price imbalance', category: 'Structure & Patterns',
    whatItIs: 'An ICT concept: a three-candle imbalance where a strong move leaves a price zone barely traded. The gap\'s top and bottom edges are tracked as levels.',
    whyItWorks: 'Price often revisits imbalances, so a retest of the gap can offer an entry in the direction of the original move, with the far edge as a natural invalidation.',
    whyItFails: 'Not every gap gets revisited, and gaps standing against a strong trend get run straight through. On FX this is a candle-pattern proxy, not exchange order data.',
    pairsWith: ['SWINGS', 'ORDER_BLOCK', 'EMA'], searchTerms: ['ict', 'imbalance', 'gap', 'retest', 'smart money'],
  } },
  { kind: 'ORDER_BLOCK', label: 'Order Blocks (ICT)', fields: ['bull_high', 'bull_low', 'bear_high', 'bear_low'], defaults: { lookbackBars: 100, pivotLeft: 5 }, education: {
    plainName: 'Order Block (ICT) — institutional zone', category: 'Structure & Patterns',
    whatItIs: 'An ICT concept: the last opposing candle before a strong displacement move, treated as the zone where large orders plausibly executed.',
    whyItWorks: 'The first retest of a fresh block is watched for a reaction in the displacement direction — the idea is that unfilled interest remains at that zone.',
    whyItFails: 'Blocks are everywhere if you look loosely — quality depends entirely on the displacement that followed, and old, repeatedly retested blocks lose their meaning.',
    pairsWith: ['FVG', 'SWINGS', 'VOLUME_PROFILE'], searchTerms: ['ict', 'order block', 'zone', 'supply demand', 'smart money', 'retest'],
  } },
];

const TIMEFRAMES: StrategyTimeframe[] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];
const OPERATORS: ConditionOperator[] = ['crosses_above', 'crosses_below', 'above', 'below', 'rising', 'falling', 'turns_up', 'turns_down'];
const FIELDS: ConditionField[] = [
  'value', 'signal', 'histogram', 'upper', 'middle', 'lower', 'k', 'd', 'price',
  'poc', 'vah', 'val', 'tenkan', 'kijun', 'span_a', 'span_b', 'plus', 'minus',
  'swing_high', 'swing_low', 'or_high', 'or_low',
  'bull_high', 'bull_low', 'bear_high', 'bear_low', 'pp', 'r1', 'r2', 's1', 's2',
];

export const TF_MINUTES: Record<StrategyTimeframe, number> = {
  M1: 1, M5: 5, M15: 15, M30: 30, H1: 60, H4: 240, D1: 1440,
};

function isNum(x: any, min: number, max: number): x is number {
  return typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;
}

function validateGroup(g: any, indicatorIds: Set<string>, label: string, allowEmpty = false): string | null {
  if (!g || (g.logic !== 'AND' && g.logic !== 'OR')) return `${label}: logic must be AND or OR`;
  const min = allowEmpty ? 0 : 1;
  if (!Array.isArray(g.conditions) || g.conditions.length < min || g.conditions.length > 6) {
    return `${label}: needs ${min}–6 conditions`;
  }
  for (const c of g.conditions as Condition[]) {
    if (c.indicatorId !== 'price' && !indicatorIds.has(c.indicatorId)) {
      return `${label}: unknown indicator "${c.indicatorId}"`;
    }
    if (!FIELDS.includes(c.field)) return `${label}: bad field "${c.field}"`;
    if (!OPERATORS.includes(c.operator)) return `${label}: bad operator "${c.operator}"`;
    if (c.sustainBars !== undefined && !isNum(c.sustainBars, 1, 50)) return `${label}: sustainBars out of range`;
    if (c.minGapPips !== undefined && !isNum(c.minGapPips, 0, 100000)) return `${label}: minGapPips out of range`;
    const cmp = c.compare;
    if (!cmp || !['value', 'indicator', 'price'].includes(cmp.kind)) return `${label}: bad compare target`;
    if (cmp.kind === 'value' && !isNum(cmp.value, -1e9, 1e9)) return `${label}: compare value must be a number`;
    if (cmp.kind === 'indicator' && cmp.indicatorId !== 'price' && !indicatorIds.has(cmp.indicatorId)) {
      return `${label}: unknown compare indicator "${cmp.indicatorId}"`;
    }
  }
  return null;
}

export function validateStrategySpec(x: any): { ok: true; spec: StrategySpec } | { ok: false; error: string } {
  if (!x || typeof x !== 'object') return { ok: false, error: 'spec must be an object' };
  const s = x as StrategySpec;
  if (typeof s.name !== 'string' || !s.name.trim() || s.name.length > 80) return { ok: false, error: 'name is required (max 80 chars)' };
  if (s.source !== 'template' && s.source !== 'builder' && s.source !== 'engine') return { ok: false, error: "source must be 'template', 'builder' or 'engine'" };
  const isEngineNative = s.source === 'engine';
  if (isEngineNative && !(ENGINE_STRATEGY_KEYS as readonly string[]).includes(s.engineStrategyKey ?? '')) {
    return { ok: false, error: 'engine source needs a valid engineStrategyKey' };
  }
  if (typeof s.symbol !== 'string' || !/^[A-Za-z0-9./_-]{3,15}$/.test(s.symbol)) return { ok: false, error: 'bad symbol' };
  if (!TIMEFRAMES.includes(s.timeframe)) return { ok: false, error: 'bad timeframe' };
  if (!Array.isArray(s.indicators) || s.indicators.length > 10) return { ok: false, error: 'indicators: max 10' };

  const ids = new Set<string>();
  for (const ind of s.indicators) {
    if (!ind.id || typeof ind.id !== 'string' || ids.has(ind.id)) return { ok: false, error: 'indicator ids must be unique strings' };
    ids.add(ind.id);
    if (!INDICATOR_CATALOG.some((c) => c.kind === ind.kind)) return { ok: false, error: `bad indicator kind "${ind.kind}"` };
    if (ind.period !== undefined && !isNum(ind.period, 1, 500)) return { ok: false, error: 'indicator period out of range' };
    if (ind.fastPeriod !== undefined && !isNum(ind.fastPeriod, 1, 500)) return { ok: false, error: 'fastPeriod out of range' };
    if (ind.slowPeriod !== undefined && !isNum(ind.slowPeriod, 1, 500)) return { ok: false, error: 'slowPeriod out of range' };
    if (ind.signalPeriod !== undefined && !isNum(ind.signalPeriod, 1, 100)) return { ok: false, error: 'signalPeriod out of range' };
    if (ind.stdDev !== undefined && !isNum(ind.stdDev, 0.1, 10)) return { ok: false, error: 'stdDev out of range' };
    if (ind.sourceId !== undefined && (typeof ind.sourceId !== 'string' || ind.sourceId === ind.id)) return { ok: false, error: 'sourceId must name another indicator' };
    if (ind.lookbackBars !== undefined && !isNum(ind.lookbackBars, 10, 1000)) return { ok: false, error: 'lookbackBars out of range' };
    if (ind.valueAreaPct !== undefined && !isNum(ind.valueAreaPct, 10, 100)) return { ok: false, error: 'valueAreaPct out of range' };
    if (ind.pivotLeft !== undefined && !isNum(ind.pivotLeft, 1, 50)) return { ok: false, error: 'pivotLeft out of range' };
    if (ind.pivotRight !== undefined && !isNum(ind.pivotRight, 1, 50)) return { ok: false, error: 'pivotRight out of range' };
    if (ind.sessionStartHourUtc !== undefined && !isNum(ind.sessionStartHourUtc, 0, 23)) return { ok: false, error: 'sessionStartHourUtc out of range' };
    if (ind.sessionStartMinuteUtc !== undefined && !isNum(ind.sessionStartMinuteUtc, 0, 59)) return { ok: false, error: 'sessionStartMinuteUtc out of range' };
    if (ind.rangeMinutes !== undefined && !isNum(ind.rangeMinutes, 1, 720)) return { ok: false, error: 'rangeMinutes out of range' };
  }
  for (const ind of s.indicators) {
    if (ind.sourceId !== undefined && !ids.has(ind.sourceId)) return { ok: false, error: `sourceId "${ind.sourceId}" is not an indicator` };
    if (ind.sourceId !== undefined && ind.kind !== 'EMA' && ind.kind !== 'SMA') return { ok: false, error: 'only EMA/SMA can smooth another indicator' };
  }

  for (const [label, g] of [['entryLong', s.entryLong], ['entryShort', s.entryShort]] as const) {
    const err = validateGroup(g, ids, label, isEngineNative);
    if (err) return { ok: false, error: err };
  }
  for (const [label, g] of [['exitLong', s.exitLong], ['exitShort', s.exitShort]] as const) {
    if (g == null) continue;
    const err = validateGroup(g, ids, label);
    if (err) return { ok: false, error: err };
  }

  if (s.trendFilter != null) {
    const tf = s.trendFilter;
    if (!TIMEFRAMES.includes(tf.timeframe)) return { ok: false, error: 'trendFilter: bad timeframe' };
    if (TF_MINUTES[tf.timeframe] <= TF_MINUTES[s.timeframe]) {
      return { ok: false, error: 'trendFilter timeframe must be HIGHER than the strategy timeframe' };
    }
    if (tf.timeframe === 'D1' && s.timeframe !== 'H4' && s.timeframe !== 'H1') {
      // resampling needs an integer bar ratio; D1 from intraday is fine (24h buckets)
    }
    for (const [label, g] of [['trendFilter.long', tf.longGroup], ['trendFilter.short', tf.shortGroup]] as const) {
      if (g == null) continue;
      const err = validateGroup(g, ids, label);
      if (err) return { ok: false, error: err };
    }
    if (!tf.longGroup?.conditions?.length && !tf.shortGroup?.conditions?.length) {
      return { ok: false, error: 'trendFilter needs at least one filter group' };
    }
  }
  if (s.sessionFilter != null) {
    const sf = s.sessionFilter;
    if (!isNum(sf.startHourUtc, 0, 23) || !isNum(sf.endHourUtc, 0, 24)) return { ok: false, error: 'sessionFilter hours out of range' };
    if (sf.daysUtc !== undefined && (!Array.isArray(sf.daysUtc) || sf.daysUtc.some((d) => !isNum(d, 0, 6)))) {
      return { ok: false, error: 'sessionFilter days must be 0–6' };
    }
  }

  const r = s.risk;
  if (!r || !isNum(r.lotSize, 0.01, 50)) return { ok: false, error: 'risk.lotSize must be 0.01–50' };
  for (const k of ['stopLossPips', 'takeProfitPips', 'trailingStopPips', 'breakevenTriggerPips', 'breakevenOffsetPips'] as const) {
    if (r[k] != null && !isNum(r[k], 0, 100000)) return { ok: false, error: `risk.${k} out of range` };
  }
  for (const k of ['stopLossAtrMult', 'takeProfitAtrMult'] as const) {
    if (r[k] != null && !isNum(r[k], 0, 100)) return { ok: false, error: `risk.${k} out of range` };
  }
  if (r.maxTradesPerDay != null && !isNum(r.maxTradesPerDay, 1, 1000)) return { ok: false, error: 'risk.maxTradesPerDay out of range' };
  if ((r.stopLossAtrMult != null || r.takeProfitAtrMult != null) && !s.indicators.some((i) => i.kind === 'ATR')) {
    return { ok: false, error: 'ATR-based stops need an ATR indicator in the spec' };
  }
  if (!isEngineNative && r.stopLossPips == null && r.stopLossAtrMult == null && r.takeProfitPips == null && r.takeProfitAtrMult == null) {
    return { ok: false, error: 'a strategy needs at least a stop loss or a take profit' };
  }

  return { ok: true, spec: { ...s, symbol: s.symbol.toUpperCase(), name: s.name.trim() } };
}

/** Bars of warmup the slowest indicator in the spec needs before bar 0 can be evaluated. */
export function specWarmupBars(spec: StrategySpec): number {
  let w = 2;
  for (const ind of spec.indicators) {
    const need =
      ind.kind === 'MACD' ? (ind.slowPeriod ?? 26) + (ind.signalPeriod ?? 9)
      : ind.kind === 'STOCHASTIC' ? (ind.period ?? 14) + (ind.signalPeriod ?? 3)
      : ind.kind === 'ICHIMOKU' ? (ind.slowPeriod ?? 52) + (ind.fastPeriod ?? 26)
      : ind.kind === 'VOLUME_PROFILE' || ind.kind === 'FVG' || ind.kind === 'ORDER_BLOCK' ? (ind.lookbackBars ?? 100)
      : ind.kind === 'SWINGS' ? (ind.pivotLeft ?? 3) + (ind.pivotRight ?? 3) + 10
      : ind.kind === 'ORB' || ind.kind === 'PIVOTS' || ind.kind === 'VWAP' ? 2
      : (ind.period ?? 14);
    w = Math.max(w, need + 2);
  }
  // A higher-timeframe filter consumes base bars at the TF ratio.
  if (spec.trendFilter) {
    const ratio = Math.max(1, Math.round(TF_MINUTES[spec.trendFilter.timeframe] / TF_MINUTES[spec.timeframe]));
    let htfWarm = 2;
    for (const ind of spec.indicators) {
      const need = ind.kind === 'MACD' ? (ind.slowPeriod ?? 26) + (ind.signalPeriod ?? 9) : (ind.period ?? 14);
      htfWarm = Math.max(htfWarm, need + 2);
    }
    w = Math.max(w, htfWarm * ratio + ratio);
  }
  return w;
}
