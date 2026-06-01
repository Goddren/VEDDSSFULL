/**
 * VEDD Markov Chain Probability Engine
 *
 * Builds per-symbol transition matrices from historical candle data and uses
 * them to produce a probability-adjusted confidence bonus/penalty for each
 * trade signal.
 *
 * State model (5 states):
 *   STRONG_BULL  – close significantly above open (> +1× threshold)
 *   BULL         – close above open
 *   NEUTRAL      – doji / inside bar
 *   BEAR         – close below open
 *   STRONG_BEAR  – close significantly below open (> -1× threshold)
 *
 * Where "threshold" = 0.06% of close price (adjusts automatically across
 * forex, gold, indices, crypto).
 */

export type MarkovState = 'STRONG_BULL' | 'BULL' | 'NEUTRAL' | 'BEAR' | 'STRONG_BEAR';

export const MARKOV_STATES: MarkovState[] = [
  'STRONG_BULL',
  'BULL',
  'NEUTRAL',
  'BEAR',
  'STRONG_BEAR',
];

export interface TransitionMatrix {
  /** matrix[from][to] = probability (0–1) */
  matrix: Record<MarkovState, Record<MarkovState, number>>;
  /** Raw counts used to build the matrix */
  counts: Record<MarkovState, Record<MarkovState, number>>;
  /** Total transitions observed */
  totalTransitions: number;
  /** How many candles were used */
  candleCount: number;
  /** ISO timestamp when this matrix was computed */
  computedAt: string;
}

export interface MarkovSignal {
  /** Current detected state of the most recent closed candle */
  currentState: MarkovState;
  /** P(next candle is any bullish state | current state) */
  bullishProbability: number;
  /** P(next candle is any bearish state | current state) */
  bearishProbability: number;
  /** P(next candle is neutral | current state) */
  neutralProbability: number;
  /** Confidence adjustment to apply to the trade signal (-10 to +10) */
  confidenceAdjustment: number;
  /** Human-readable reason for the adjustment */
  reason: string;
  /** The full 1-step lookahead probabilities from current state */
  nextStateProbabilities: Record<MarkovState, number>;
  /** 2-step lookahead – probability of still being in a bullish state 2 candles out */
  twoStepBullProbability: number;
  /** 2-step lookahead – probability of still being in a bearish state 2 candles out */
  twoStepBearProbability: number;
}

// In-memory cache: symbol → TransitionMatrix
// Updated on every scan cycle (confirmedBars are passed each time)
const matrixCache: Map<string, TransitionMatrix> = new Map();

// ─── State classifier ─────────────────────────────────────────────────────────

/**
 * Classify a single candle into a Markov state.
 * threshold is expressed as a fraction of the close price (default 0.0006 = 0.06%)
 */
export function classifyCandle(
  open: number,
  close: number,
  threshold = 0.0006,
): MarkovState {
  if (close <= 0 || open <= 0) return 'NEUTRAL';
  const changePct = (close - open) / open;
  const strong = threshold * 2; // 0.12% = strong move
  if (changePct >= strong)  return 'STRONG_BULL';
  if (changePct > 0)        return 'BULL';
  if (changePct <= -strong) return 'STRONG_BEAR';
  if (changePct < 0)        return 'BEAR';
  return 'NEUTRAL';
}

// ─── Matrix builder ───────────────────────────────────────────────────────────

function emptyCountMatrix(): Record<MarkovState, Record<MarkovState, number>> {
  const m = {} as Record<MarkovState, Record<MarkovState, number>>;
  for (const from of MARKOV_STATES) {
    m[from] = {} as Record<MarkovState, number>;
    for (const to of MARKOV_STATES) m[from][to] = 0;
  }
  return m;
}

/**
 * Build (or rebuild) the transition matrix for a symbol from its candle array.
 * @param symbol  - e.g. "EURUSD"
 * @param candles - array of { open, close } ordered oldest → newest
 * @param threshold - optional override for state classifier sensitivity
 */
export function buildTransitionMatrix(
  symbol: string,
  candles: Array<{ open: number; close: number }>,
  threshold?: number,
): TransitionMatrix {
  if (candles.length < 5) {
    // Not enough data — return a flat/uniform matrix
    const flat = emptyCountMatrix();
    const uniform = emptyCountMatrix();
    for (const from of MARKOV_STATES) {
      for (const to of MARKOV_STATES) uniform[from][to] = 0.2;
    }
    const matrix: TransitionMatrix = {
      matrix: uniform as Record<MarkovState, Record<MarkovState, number>>,
      counts: flat,
      totalTransitions: 0,
      candleCount: candles.length,
      computedAt: new Date().toISOString(),
    };
    matrixCache.set(symbol, matrix);
    return matrix;
  }

  const counts = emptyCountMatrix();
  const states: MarkovState[] = candles.map(c => classifyCandle(c.open, c.close, threshold));

  let totalTransitions = 0;
  for (let i = 0; i < states.length - 1; i++) {
    counts[states[i]][states[i + 1]]++;
    totalTransitions++;
  }

  // Convert counts → probabilities (Laplace smoothing: add 1 to every cell to
  // avoid zero-probability traps on rare but possible transitions)
  const prob = emptyCountMatrix();
  for (const from of MARKOV_STATES) {
    const rowTotal = Object.values(counts[from]).reduce((s, v) => s + v, 0);
    const smoothedTotal = rowTotal + MARKOV_STATES.length; // +1 per cell
    for (const to of MARKOV_STATES) {
      prob[from][to] = (counts[from][to] + 1) / smoothedTotal;
    }
  }

  const result: TransitionMatrix = {
    matrix: prob,
    counts,
    totalTransitions,
    candleCount: candles.length,
    computedAt: new Date().toISOString(),
  };
  matrixCache.set(symbol, result);
  return result;
}

// ─── Probability helpers ──────────────────────────────────────────────────────

function bullishStates(): MarkovState[] { return ['STRONG_BULL', 'BULL']; }
function bearishStates(): MarkovState[] { return ['STRONG_BEAR', 'BEAR']; }

/** Sum the transition probabilities from `fromState` to all states in `toGroup` */
function groupProbability(
  matrix: Record<MarkovState, Record<MarkovState, number>>,
  fromState: MarkovState,
  toGroup: MarkovState[],
): number {
  return toGroup.reduce((sum, to) => sum + (matrix[fromState][to] ?? 0), 0);
}

/**
 * 2-step lookahead: P(ending in toGroup after 2 transitions)
 * = Σ_mid  P(from→mid) × P(mid→toGroup)
 */
function twoStepGroupProbability(
  matrix: Record<MarkovState, Record<MarkovState, number>>,
  fromState: MarkovState,
  toGroup: MarkovState[],
): number {
  let total = 0;
  for (const mid of MARKOV_STATES) {
    const pFromMid = matrix[fromState][mid] ?? 0;
    const pMidToGroup = groupProbability(matrix, mid, toGroup);
    total += pFromMid * pMidToGroup;
  }
  return Math.round(total * 1000) / 1000;
}

// ─── Main API ─────────────────────────────────────────────────────────────────

/**
 * Compute the Markov signal for a given symbol and trade direction.
 *
 * @param symbol    - trading symbol
 * @param direction - 'BUY' or 'SELL'
 * @param candles   - array of confirmed closed candles, oldest first
 */
export function getMarkovSignal(
  symbol: string,
  direction: 'BUY' | 'SELL',
  candles: Array<{ open: number; close: number }>,
): MarkovSignal {
  // Rebuild matrix from current candles every call
  // (the engine calls this once per signal, not on every candle)
  const tm = buildTransitionMatrix(symbol, candles);
  const matrix = tm.matrix;

  // Current state = last confirmed candle
  const lastCandle = candles[candles.length - 1];
  const currentState = classifyCandle(lastCandle.open, lastCandle.close);

  const nextStateProbabilities = { ...matrix[currentState] };

  const bullP  = groupProbability(matrix, currentState, bullishStates());
  const bearP  = groupProbability(matrix, currentState, bearishStates());
  const neutP  = groupProbability(matrix, currentState, ['NEUTRAL']);
  const bull2P = twoStepGroupProbability(matrix, currentState, bullishStates());
  const bear2P = twoStepGroupProbability(matrix, currentState, bearishStates());

  // ── Confidence adjustment logic ────────────────────────────────────────────
  // Compare the Markov alignment probability vs the base rate (50%).
  // We use a graduated scale so strong alignment gives bigger bonuses.

  let confidenceAdjustment = 0;
  let reason = '';

  const alignP  = direction === 'BUY' ? bullP  : bearP;
  const align2P = direction === 'BUY' ? bull2P : bear2P;
  const opposP  = direction === 'BUY' ? bearP  : bullP;

  if (alignP >= 0.70) {
    // Very strong Markov alignment
    confidenceAdjustment = +8;
    reason = `Markov: ${Math.round(alignP * 100)}% probability of ${direction === 'BUY' ? 'bullish' : 'bearish'} next state (strong alignment) +8%`;
  } else if (alignP >= 0.58) {
    confidenceAdjustment = +5;
    reason = `Markov: ${Math.round(alignP * 100)}% alignment with ${direction} direction +5%`;
  } else if (alignP >= 0.48) {
    // Slight alignment — small bonus
    confidenceAdjustment = +2;
    reason = `Markov: marginal ${Math.round(alignP * 100)}% alignment with ${direction} +2%`;
  } else if (opposP >= 0.70) {
    // Very strong Markov contradiction
    confidenceAdjustment = -10;
    reason = `Markov CONFLICT: ${Math.round(opposP * 100)}% probability of ${direction === 'BUY' ? 'bearish' : 'bullish'} next state — strong opposing signal -10%`;
  } else if (opposP >= 0.58) {
    confidenceAdjustment = -6;
    reason = `Markov conflict: ${Math.round(opposP * 100)}% opposing probability — reduces confidence -6%`;
  } else if (opposP >= 0.48) {
    confidenceAdjustment = -3;
    reason = `Markov mild conflict: ${Math.round(opposP * 100)}% opposing probability -3%`;
  } else {
    confidenceAdjustment = 0;
    reason = `Markov neutral: ${Math.round(alignP * 100)}% align / ${Math.round(opposP * 100)}% oppose — no adjustment`;
  }

  // Extra check: 2-step lookahead confirms the direction
  if (confidenceAdjustment > 0 && align2P >= 0.55) {
    confidenceAdjustment = Math.min(10, confidenceAdjustment + 2);
    reason += ` | 2-step ${Math.round(align2P * 100)}% ✓`;
  } else if (confidenceAdjustment < 0 && bear2P >= 0.55 && direction === 'BUY') {
    confidenceAdjustment = Math.max(-12, confidenceAdjustment - 2);
    reason += ` | 2-step bearish ${Math.round(bear2P * 100)}% ✗`;
  }

  return {
    currentState,
    bullishProbability:      Math.round(bullP  * 1000) / 1000,
    bearishProbability:      Math.round(bearP  * 1000) / 1000,
    neutralProbability:      Math.round(neutP  * 1000) / 1000,
    confidenceAdjustment,
    reason,
    nextStateProbabilities,
    twoStepBullProbability:  bull2P,
    twoStepBearProbability:  bear2P,
  };
}

/**
 * Return the cached matrix for a symbol (if any).
 * Used by the API route to display probability data without re-computing.
 */
export function getCachedMatrix(symbol: string): TransitionMatrix | null {
  return matrixCache.get(symbol) ?? null;
}

/**
 * Return current state + 1-step probabilities from the cached matrix.
 * If no matrix is cached, returns null.
 */
export function getMarkovSnapshot(
  symbol: string,
  lastCandle: { open: number; close: number } | null,
): {
  currentState: MarkovState;
  bullishProbability: number;
  bearishProbability: number;
  neutralProbability: number;
  nextStateProbabilities: Record<MarkovState, number>;
  matrix: TransitionMatrix;
} | null {
  const tm = matrixCache.get(symbol);
  if (!tm || !lastCandle) return null;

  const currentState = classifyCandle(lastCandle.open, lastCandle.close);
  const row = tm.matrix[currentState];
  const bullP = groupProbability(tm.matrix, currentState, bullishStates());
  const bearP = groupProbability(tm.matrix, currentState, bearishStates());
  const neutP = groupProbability(tm.matrix, currentState, ['NEUTRAL']);

  return {
    currentState,
    bullishProbability:  Math.round(bullP * 1000) / 1000,
    bearishProbability:  Math.round(bearP * 1000) / 1000,
    neutralProbability:  Math.round(neutP * 1000) / 1000,
    nextStateProbabilities: { ...row },
    matrix: tm,
  };
}

/** All symbols that have a cached matrix (for dashboard display) */
export function getAllCachedSymbols(): string[] {
  return Array.from(matrixCache.keys());
}
