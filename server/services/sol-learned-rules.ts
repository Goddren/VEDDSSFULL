// Sol "learned rules" (2026-11-08) — defaults drawn from the first ~46 closed
// shadow trades (11-07 → 11-08, net of costs):
//   • losers were entered on a FALLING hour (avg 1h change −6.9%), winners on a
//     rising one (+137%) → block entries when the 1h change is negative;
//   • stop-outs averaged −29% net → cap the stop at 15%;
//   • stop-outs had been up ~+9% first → breakeven floor from +8%;
//   • max-hold exits peaked +20.8% and gave it all back (+0.7%) → take half off
//     at +15% and trail the rest 8% under the peak;
//   • momentum_surfer / trend_rider / breakout_hunter / order_flow_scalper won
//     0 of 10 → paused for paper/live entries (they keep trading in shadow so
//     the evidence keeps building).
// Applies to shadow + paper. Live gets only the stricter ENTRY filters (falling
// hour, paused strategies) — live stops/exits are unchanged.
// Kill switch: SOL_LEARNED_RULES=off. Each knob has its own env override.

const num = (n: string, d: number) => {
  const v = Number(process.env[n]);
  return Number.isFinite(v) && v >= 0 ? v : d;
};

export function solLearnedRulesOn(): boolean {
  return process.env.SOL_LEARNED_RULES !== 'off';
}

export const SOL_LR = {
  get maxSlPct() { return num('SOL_MAX_SL_PCT', 15); },
  get breakevenAtPct() { return num('SOL_BREAKEVEN_AT_PCT', 8); },
  get partialAtPct() { return num('SOL_PARTIAL_AT_PCT', 15); },
  get partialFraction() { return Math.min(1, num('SOL_PARTIAL_FRACTION', 0.5)); },
  get trailDistPct() { return num('SOL_TRAIL_DIST_PCT', 8); },
  /** Minimum 1h price change to enter (default 0 = no falling tokens). */
  get min1hChangePct() { return Number.isFinite(Number(process.env.SOL_MIN_1H_CHANGE_PCT)) && process.env.SOL_MIN_1H_CHANGE_PCT !== undefined && process.env.SOL_MIN_1H_CHANGE_PCT !== '' ? Number(process.env.SOL_MIN_1H_CHANGE_PCT) : 0; },
};

const DEFAULT_PAUSED = 'momentum_surfer,trend_rider,breakout_hunter,order_flow_scalper';

export function pausedSolStrategies(): Set<string> {
  const raw = process.env.SOL_PAUSED_STRATEGIES ?? DEFAULT_PAUSED;
  return new Set(raw.split(',').map(s => s.trim()).filter(Boolean));
}

export function isSolStrategyPaused(id: string): boolean {
  return solLearnedRulesOn() && pausedSolStrategies().has(id);
}

/** True when the token's last-hour move is too weak/falling to enter. */
export function isFallingEntry(priceChange1h: number | null | undefined): boolean {
  if (!solLearnedRulesOn()) return false;
  if (priceChange1h == null || !Number.isFinite(priceChange1h)) return false;
  return priceChange1h < SOL_LR.min1hChangePct;
}

export function cappedSlPct(slPct: number): number {
  if (!solLearnedRulesOn()) return slPct;
  return slPct > 0 ? Math.min(slPct, SOL_LR.maxSlPct) : SOL_LR.maxSlPct;
}

export interface LearnedExitState {
  entryPrice: number;
  peakPrice?: number;
  /** % gain locked on the partial already taken, or undefined. */
  partialGainPct?: number;
  breakevenActive?: boolean;
}

export type LearnedExitDecision =
  | { action: 'hold'; partialJustTaken?: number; breakevenJustSet?: boolean }
  | { action: 'exit'; reason: 'breakeven' | 'trail'; blendedGainPct: number };

/**
 * Pure exit step for the learned rules. Mutates nothing — the caller stores
 * partialGainPct / breakevenActive from the returned flags.
 * blendedGainPct = what the whole position made, counting the half sold at the
 * partial. Callers use it as the gross % for the close (and for TP / SL / max
 * hold closes after a partial, call blendGain()).
 */
export interface LearnedExitOverrides { breakevenAtPct?: number; partialAtPct?: number; trailDistPct?: number; }

export function learnedExitStep(s: LearnedExitState, currentPrice: number, ov?: LearnedExitOverrides): LearnedExitDecision {
  const partialAtPct = ov?.partialAtPct ?? SOL_LR.partialAtPct;
  const breakevenAtPct = ov?.breakevenAtPct ?? SOL_LR.breakevenAtPct;
  const trailDistPct = ov?.trailDistPct ?? SOL_LR.trailDistPct;
  const gain = ((currentPrice - s.entryPrice) / s.entryPrice) * 100;
  const peak = Math.max(s.peakPrice ?? s.entryPrice, currentPrice);
  const peakGain = ((peak - s.entryPrice) / s.entryPrice) * 100;
  let partialJustTaken: number | undefined;
  let breakevenJustSet = false;
  let partial = s.partialGainPct;
  if (partial == null && gain >= partialAtPct) { partial = gain; partialJustTaken = gain; }
  let be = !!s.breakevenActive;
  if (!be && peakGain >= breakevenAtPct) { be = true; breakevenJustSet = true; }
  // Trail only once the partial is banked.
  if (partial != null && partialJustTaken == null) {
    const floor = Math.max(peak * (1 - trailDistPct / 100), s.entryPrice);
    if (currentPrice <= floor) return { action: 'exit', reason: 'trail', blendedGainPct: blendGain(gain, partial) };
  }
  if (be && partial == null && currentPrice <= s.entryPrice) {
    return { action: 'exit', reason: 'breakeven', blendedGainPct: gain };
  }
  return { action: 'hold', partialJustTaken, breakevenJustSet };
}

/** Whole-position gain when a partial was taken at partialGainPct. */
export function blendGain(gainPct: number, partialGainPct?: number): number {
  if (partialGainPct == null) return gainPct;
  const f = SOL_LR.partialFraction;
  return f * partialGainPct + (1 - f) * gainPct;
}
