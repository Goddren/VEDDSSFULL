/**
 * VEDD Composite Edge Signal
 *
 * Fuses Markov chain (price-action probability) with Polymarket (crowd-wisdom
 * prediction market sentiment) into a single, calibrated confidence adjustment.
 *
 * Philosophy:
 *   – When BOTH signals agree  → amplify the adjustment (1.5× multiplier)
 *   – When they disagree       → cancel each other out (net ~0)
 *   – When only one is present → use it at face value
 *
 * The composite adjustment is capped at ±15 to protect the hard confidence
 * floor in the engine.
 *
 * For non-crypto symbols, Polymarket is skipped and only Markov is used.
 */

import { getMarkovSignal, getCachedMatrix, classifyCandle, type MarkovSignal } from './markov-chain';
import { getPolymarketBTCSentiment, type PolymarketBTCSentiment } from './polymarket';

export interface CompositeEdgeSignal {
  /** Final confidence adjustment to apply (-15 to +15) */
  confidenceAdjustment: number;

  /** Human-readable summary for the activity feed */
  reason: string;

  /** Markov component */
  markov: {
    currentState: string;
    bullP: number;
    bearP: number;
    adjustment: number;
    available: boolean;
  };

  /** Polymarket component (null for non-crypto) */
  polymarket: {
    overallBullishScore: number;
    sentimentLabel: string;
    adjustment: number;
    marketCount: number;
    fromCache: boolean;
    available: boolean;
  } | null;

  /**
   * Alignment rating:
   *   'strong_agree'   – both signals point same direction strongly
   *   'agree'          – both lean same direction
   *   'neutral'        – mixed or absent signals
   *   'disagree'       – signals point opposite directions
   *   'strong_disagree'– both signals strongly oppose each other
   */
  alignment: 'strong_agree' | 'agree' | 'neutral' | 'disagree' | 'strong_disagree';

  /** Composite edge score 0–100 (50 = neutral) */
  compositeEdgeScore: number;

  /** Whether Polymarket data was used */
  usedPolymarket: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CRYPTO_REGEX = /BTC|ETH|SOL|XRP|BNB|CRYPTO|DOGE|ADA|MATIC|LINK/i;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function alignmentLabel(markovAdj: number, polyAdj: number | null): CompositeEdgeSignal['alignment'] {
  const mSign = Math.sign(markovAdj);
  const pSign = polyAdj !== null ? Math.sign(polyAdj) : 0;

  if (pSign === 0) {
    // Polymarket not available — go by Markov strength alone
    if (Math.abs(markovAdj) >= 8) return markovAdj > 0 ? 'strong_agree' : 'strong_disagree';
    if (Math.abs(markovAdj) >= 4) return markovAdj > 0 ? 'agree' : 'disagree';
    return 'neutral';
  }

  const bothStrong = Math.abs(markovAdj) >= 5 && Math.abs(polyAdj ?? 0) >= 4;
  if (mSign === pSign && bothStrong) return mSign > 0 ? 'strong_agree' : 'strong_disagree';
  if (mSign === pSign) return mSign > 0 ? 'agree' : 'disagree';
  if (mSign !== pSign && bothStrong) return 'strong_disagree';
  return 'neutral';
}

function compositeEdgeScore(markovBullP: number, polyBullScore: number | null): number {
  if (polyBullScore === null) {
    // No Polymarket — use Markov alone, scaled from probability to 0–100
    return clamp(Math.round(markovBullP), 0, 100);
  }
  // Blend 50/50 — both signals carry equal weight
  const blended = (markovBullP + polyBullScore) / 2;
  return clamp(Math.round(blended), 0, 100);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Compute the composite edge signal for a trade.
 *
 * @param symbol     – e.g. "EURUSD", "BTCUSD"
 * @param direction  – 'BUY' or 'SELL'
 * @param candles    – confirmed closed candles for Markov (oldest → newest)
 */
export async function getCompositeEdgeSignal(
  symbol: string,
  direction: 'BUY' | 'SELL',
  candles: Array<{ open: number; close: number }>,
): Promise<CompositeEdgeSignal> {
  // ── 1. Markov signal ──────────────────────────────────────────────────────
  let markovSignal: MarkovSignal | null = null;
  try {
    if (candles.length > 0) {
      markovSignal = getMarkovSignal(symbol, direction, candles);
    }
  } catch { /* non-fatal */ }

  const markovAdj  = markovSignal?.confidenceAdjustment ?? 0;
  const markovBullP = markovSignal
    ? Math.round(markovSignal.bullishProbability * 100)
    : 50;

  // ── 2. Polymarket signal (crypto only) ────────────────────────────────────
  let polySentiment: PolymarketBTCSentiment | null = null;
  const isCrypto = CRYPTO_REGEX.test(symbol);

  if (isCrypto) {
    try {
      polySentiment = await getPolymarketBTCSentiment(direction);
    } catch { /* non-fatal — degrade gracefully */ }
  }

  const polyAdj        = polySentiment?.confidenceAdjustment ?? null;
  const polyBullScore  = polySentiment?.overallBullishScore  ?? null;

  // ── 3. Fusion ─────────────────────────────────────────────────────────────
  let finalAdjustment: number;

  if (polyAdj === null) {
    // Crypto with no Polymarket data, or non-crypto — Markov only
    finalAdjustment = markovAdj;
  } else {
    const mSign = Math.sign(markovAdj);
    const pSign = Math.sign(polyAdj);

    if (mSign === pSign && mSign !== 0) {
      // Both agree → amplify by up to 50%, then add the smaller signal on top
      const larger  = Math.abs(markovAdj) >= Math.abs(polyAdj) ? markovAdj : polyAdj;
      const smaller = Math.abs(markovAdj) <  Math.abs(polyAdj) ? markovAdj : polyAdj;
      finalAdjustment = Math.round(larger * 1.5) + Math.round(smaller * 0.4);
    } else if (mSign !== pSign && mSign !== 0 && pSign !== 0) {
      // They disagree — net out, keep a small residual from the stronger one
      const strongerAdj = Math.abs(markovAdj) >= Math.abs(polyAdj) ? markovAdj : polyAdj;
      finalAdjustment = Math.round(strongerAdj * 0.3); // 70% cancellation
    } else {
      // One is neutral (0) — just use the other
      finalAdjustment = markovAdj + (polyAdj ?? 0);
    }
  }

  // Hard cap at ±15
  finalAdjustment = clamp(finalAdjustment, -15, 15);

  // ── 4. Metadata ───────────────────────────────────────────────────────────
  const align    = alignmentLabel(markovAdj, polyAdj);
  const edgeScore = compositeEdgeScore(markovBullP, polyBullScore);

  // ── 5. Reason string ──────────────────────────────────────────────────────
  const adjText  = finalAdjustment > 0 ? `+${finalAdjustment}%` : `${finalAdjustment}%`;
  const alignEmoji = {
    strong_agree:    '🔥',
    agree:           '✅',
    neutral:         '🔸',
    disagree:        '⚠️',
    strong_disagree: '🚫',
  }[align];

  let reason = `${alignEmoji} Composite Edge [${symbol}]`;

  if (polySentiment) {
    reason += ` | Markov ${markovBullP}% bull (${markovAdj > 0 ? '+' : ''}${markovAdj}%)`;
    reason += ` | Polymarket ${polySentiment.sentimentLabel} ${polySentiment.overallBullishScore}% (${polyAdj! > 0 ? '+' : ''}${polyAdj}%)`;
    reason += ` | Combined: ${adjText}`;

    if (align === 'strong_agree') {
      reason += ' — BOTH signals confirm direction (amplified)';
    } else if (align === 'disagree' || align === 'strong_disagree') {
      reason += ' — signals conflict (dampened)';
    }
  } else if (markovSignal) {
    reason += ` | Markov: ${markovSignal.reason}`;
    if (isCrypto) reason += ' | Polymarket: unavailable';
  }

  return {
    confidenceAdjustment: finalAdjustment,
    reason,
    markov: {
      currentState: markovSignal?.currentState ?? 'NEUTRAL',
      bullP:        markovBullP,
      bearP:        markovSignal ? Math.round(markovSignal.bearishProbability * 100) : 50,
      adjustment:   markovAdj,
      available:    markovSignal !== null,
    },
    polymarket: polySentiment ? {
      overallBullishScore: polySentiment.overallBullishScore,
      sentimentLabel:      polySentiment.sentimentLabel,
      adjustment:          polyAdj!,
      marketCount:         polySentiment.markets.length,
      fromCache:           polySentiment.fromCache,
      available:           true,
    } : isCrypto ? {
      overallBullishScore: 50,
      sentimentLabel:      'Neutral',
      adjustment:          0,
      marketCount:         0,
      fromCache:           false,
      available:           false,
    } : null,
    alignment:          align,
    compositeEdgeScore: edgeScore,
    usedPolymarket:     polySentiment !== null,
  };
}

/**
 * Alignment label display helpers for the UI
 */
export const ALIGNMENT_LABELS: Record<CompositeEdgeSignal['alignment'], { label: string; color: string; emoji: string }> = {
  strong_agree:    { label: 'Strong Agree',    color: 'text-emerald-400', emoji: '🔥' },
  agree:           { label: 'Agree',           color: 'text-green-400',   emoji: '✅' },
  neutral:         { label: 'Neutral',         color: 'text-gray-400',    emoji: '🔸' },
  disagree:        { label: 'Disagree',        color: 'text-orange-400',  emoji: '⚠️' },
  strong_disagree: { label: 'Strong Conflict', color: 'text-red-400',     emoji: '🚫' },
};
