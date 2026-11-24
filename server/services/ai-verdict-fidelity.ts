/**
 * AI verdict fidelity — the model's OWN verdict is binding (2026-11-24).
 *
 * Diagnosis (code trace + signed-in feed read, Nov 24): on the MT5
 * chart-data route's vision path, the pass test read exactly ONE field of
 * the model's parsed verdict — `aiConfidence >= floor`. The prompt contract
 * requires the model to return `confirmed: boolean` and a `direction`, the
 * parser faithfully extracts both — and the gate consulted neither. The
 * only structured veto was smcVerdict === 'PASS'. Production result: two
 * verdicts labelled APPROVED whose model direction was NEUTRAL and whose
 * reasoning text concluded "reject" (deep-reasoning Veteran Judge,
 * gpt-oss-120b, confidence 75 vs the 70 floor). The model's rejection lived
 * exclusively in its free-text reasoning, which no gate reads.
 *
 * This module is the pure decision core for the vision verdict:
 *
 *   aiPasses  = confirmed === true
 *               AND aiDirection === proposed signal (NEUTRAL or the
 *                   opposite direction can never approve)
 *               AND aiConfidence >= passFloor
 *   aiVerdict = 'CONFIRM' only when all three hold (confidence measured
 *               against the consensus verdictBar); a confirmed:false or
 *               direction-vetoed verdict is a SKIP vote regardless of how
 *               high the confidence number is.
 *
 * The breakout path is NOT served by this module: it already keys on
 * `confirmed` and its direction is the engine's own, so its semantics are
 * unchanged. The breakout→vision FALLBACK verdict IS a vision verdict and
 * the route evaluates it here.
 *
 * Kill switch: AI_VERDICT_FIDELITY=off restores the pre-fix semantics
 * (confidence-only pass/verdict) at this single decision point; the veto
 * flags are still computed so telemetry can show what would have vetoed.
 */

export function verdictFidelityEnabled(): boolean {
  return process.env.AI_VERDICT_FIDELITY !== 'off';
}

export interface VisionVerdictInput {
  /** The model's parsed `confirmed` — only the boolean true counts. */
  confirmed: unknown;
  /** The model's parsed direction ('BUY' | 'SELL' | 'NEUTRAL' | …). */
  aiDirection: string | null | undefined;
  /** The model's parsed confidence, post-coercion (0–100). */
  aiConfidence: number;
  /** The proposed signal direction the verdict is judging ('BUY' | 'SELL'). */
  proposedSignal: string;
  /** Floor for aiPasses (the user's AI minimum-confidence setting). */
  passFloor: number;
  /** Bar for the consensus aiVerdict vote (route's consensus bar). */
  verdictBar: number;
  /** Kill-switch state — pass verdictFidelityEnabled(). */
  fidelityOn: boolean;
}

export interface VisionVerdictResult {
  aiPasses: boolean;
  aiVerdict: 'CONFIRM' | 'SKIP';
  /** Direction was NEUTRAL or not equal to the proposed signal. Always
   *  computed (even with the kill switch off) for telemetry/logging. */
  directionVeto: boolean;
  /** The model's `confirmed` was not boolean true. Always computed. */
  confirmedVeto: boolean;
}

export function evaluateVisionVerdict(input: VisionVerdictInput): VisionVerdictResult {
  const direction = String(input.aiDirection || 'NEUTRAL').toUpperCase();
  const proposed = String(input.proposedSignal || '').toUpperCase();
  const directionVeto = direction !== proposed;
  const confirmedVeto = input.confirmed !== true;

  if (!input.fidelityOn) {
    // Pre-fix semantics: confidence is the only field consulted.
    return {
      aiPasses: input.aiConfidence >= input.passFloor,
      aiVerdict: input.aiConfidence >= input.verdictBar ? 'CONFIRM' : 'SKIP',
      directionVeto,
      confirmedVeto,
    };
  }

  const verdictOk = !directionVeto && !confirmedVeto;
  return {
    aiPasses: verdictOk && input.aiConfidence >= input.passFloor,
    aiVerdict: verdictOk && input.aiConfidence >= input.verdictBar ? 'CONFIRM' : 'SKIP',
    directionVeto,
    confirmedVeto,
  };
}
