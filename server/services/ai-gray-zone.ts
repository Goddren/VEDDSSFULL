// ─────────────────────────────────────────────────────────────────────────────
// AI GRAY-ZONE GATING — buy an AI opinion only where it can change the outcome.
//
// WHY: the FX confirmation spend (see ai-engine-budget.ts) is volume, not
// price: 1,666 calls in 3h resolved to 49 distinct setups. PR #101 added the
// verdict cache + the $2/day pool; this module removes the purchases that
// cannot change any decision at all, so the pool stops running dry on
// rubber stamps. It changes WHEN we buy an opinion — never how a trade is
// decided when an opinion is bought, and never the strategies, backtests,
// brains, or learning loops (all deterministic, zero provider calls).
//
// THE DECISION-PATH MAP (POST /api/mt5/chart-data, read from routes.ts):
// The route buys at three sites, all inside the AI-vision-enabled block:
//
//  1. MAIN VISION (getAiVisionConfirmation). The verdict is load-bearing:
//     aiPasses = aiConfidence >= AI_MIN_CONFIDENCE (user floor, default 70);
//     smcVerdict 'PASS' hard-blocks; a high AI confidence RESCUES an
//     EA-below-80 setup via the AI override (only with confluence Grade B+);
//     adjusted SL/TP/entry and the trail recommendation are applied.
//     → A decisive-PASS band does NOT exist: any AI answer can block (low
//       confidence, PASS verdict) and most can rescue. Left ungated.
//     → A decisive-REJECT band DOES exist, proven from the route's own
//       constants (see isDecisiveReject below).
//  2. BREAKOUT (getBreakoutConfirmation). The "AI" verdict is a rubber
//     stamp: the deterministic 7-strategy engine's tiered gate decides
//     BEFORE the call (grade-fail returns without buying), and for
//     gate-approved breakouts the function FORCES confirmed=true over the
//     model's JSON ("the AI JSON cannot veto a passing engine score").
//     SL/TP come from the deterministic ATR ladder (AI overrides are not
//     honoured in breakout mode), the AI's adjustedEntry is never applied
//     in breakout mode, and its remaining outputs (aiConfidence number,
//     reasoning text, breakoutQuality, propFirmVerdict) have no decision
//     consumer in the route — telemetry only. → Gated ENTIRELY: the lane
//     returns the engine-only verdict, the exact shape getBreakout-
//     Confirmation already returns today when no AI client is available.
//  3. BREAKOUT→VISION FALLBACK. Fires only when the breakout engine found
//     0 aligned strategies, and its verdict REPLACES the breakout verdict —
//     it can flip the outcome. → Left ungated.
//
// Inside getAiVisionConfirmation, the below-min-grade block and the
// prop-firm news/daily-buffer blocks already return without buying a call.
//
// KILL SWITCH: AI_GRAY_ZONE=off restores ask-always behavior everywhere —
// the vision path buys as before and the breakout path buys its (ignored)
// confirmation as before.
// ─────────────────────────────────────────────────────────────────────────────

/** Master kill switch for gray-zone gating. Default ON. */
export function aiGrayZoneEnabled(): boolean {
  return process.env.AI_GRAY_ZONE !== 'off';
}

/** The route's AI-gate line for the EA's own confidence:
 *  EA_MIN_CONFIDENCE_FOR_AI_GATE = 80 in the chart-data decision block.
 *  At or above it the EA passes on its own and the AI verdict decides; below
 *  it a trade can only be rescued by the AI override (Grade B+ confluence)
 *  or the advisory override (signal >= ADVISORY_SIGNAL_FLOOR = 85). */
export const GRAY_ZONE_EA_GATE = 80;

/** Confluence grades that can power an AI override in the vision path —
 *  the decision block's override quality floor: _strongGrade =
 *  ['A+', 'A', 'B'].includes(grade). Below B, no override is possible. */
export const GRAY_ZONE_OVERRIDE_GRADES = ['A+', 'A', 'B'];

/** Coerce a proposed confidence exactly as the decision block does for its
 *  advisory-override test: a bare 0–1 fraction is scaled to percent. The
 *  gate uses the coerced value so it can never disagree with the block's
 *  own arithmetic (an uncoerced 0.9 would read as "< 80" here while the
 *  block reads 90 and could advisory-override — that case stays ungated). */
export function coerceEaConfidence(raw: any): number {
  let v = Number(raw) || 0;
  if (v > 0 && v <= 1) v *= 100;
  return v;
}

/** THE decisive-reject test for the vision path. With the EA's (coerced)
 *  confidence below the 80 gate AND confluence below Grade B, the decision
 *  block's outcome is REJECT for EVERY verdict the AI could return:
 *   - aiPasses path: overrideTooWeak = (aiPasses && !eaPasses) &&
 *     !(strongGrade && enoughAligned); grade < B makes strongGrade false
 *     (alignedVotes is unset on the vision path, so enoughAligned falls
 *     back to strongGrade) → any AI pass is "too weak" and blocked; an AI
 *     fail blocks directly.
 *   - advisory override: requires coerced signal >= 85 — excluded, since
 *     the coerced confidence is < 80.
 *   - smcVerdict PASS: only ever blocks; its absence changes nothing.
 *  So the purchase cannot change the trade decision, and skipping it is
 *  outcome-identical. The synthesized verdict below is shaped so the
 *  downstream block reaches that same REJECT through its normal logic. */
export function isDecisiveReject(eaConfidenceCoerced: number, confluenceGrade: string): boolean {
  return eaConfidenceCoerced < GRAY_ZONE_EA_GATE
    && !GRAY_ZONE_OVERRIDE_GRADES.includes(String(confluenceGrade).toUpperCase());
}

/** The verdict the vision path proceeds with when a purchase is skipped as
 *  decisive-reject. NOT a model opinion and never labelled as one:
 *  modelUsed 'ai-gray-zone-gate' keeps it distinguishable in the decision
 *  feed and the confirmation-outcome rows the learning loop reads (the row
 *  still records the REJECTED outcome, with the server's own confluence
 *  score/grade — the same values getAiVisionConfirmation would have
 *  computed and attached). aiError is deliberately unset: this is not a
 *  failed call, and the block treats errored verdicts differently. */
export function decisiveRejectVerdict(args: {
  eaConfidence: number; confluenceGrade: string; confluenceScore: number;
}): any {
  return {
    confirmed: false,
    aiDirection: 'NEUTRAL',
    aiConfidence: 0,
    reasoning: `AI call skipped by the gray-zone gate — decisive rule outcome: EA confidence ${Math.round(args.eaConfidence)}% is below the ${GRAY_ZONE_EA_GATE}% AI-gate line and confluence grade ${args.confluenceGrade} is below B, so no AI verdict could change this decision (an AI override requires Grade B or better; the advisory override requires a ≥85% signal). The rules reject on their own; no AI credit was spent.`,
    confluenceScore: args.confluenceScore,
    confluenceGrade: args.confluenceGrade,
    smcVerdict: null,
    modelUsed: 'ai-gray-zone-gate',
    providerUsed: 'gray-zone',
    grayZoneSkipped: 'decisive_reject',
  };
}

// ── Counters (telemetry for /api/health, alongside aiEngineBudget) ─────────
// asked = a confirmation purchase actually made at a gated site;
// skippedDecisivePass / skippedDecisiveReject = purchases avoided because
// the rules had already decided. In-process, per UTC day, like the budget
// counters' in-memory core; a restart resets them (they are observability,
// not a cap, so no persistence is warranted).

interface GrayZoneDay { day: string; asked: number; skippedDecisivePass: number; skippedDecisiveReject: number }

const byUser = new Map<number, GrayZoneDay>();

function utcDay(): string {
  return new Date().toISOString().slice(0, 10);
}

function current(userId: number): GrayZoneDay {
  const day = utcDay();
  let s = byUser.get(userId);
  if (!s || s.day !== day) {
    s = { day, asked: 0, skippedDecisivePass: 0, skippedDecisiveReject: 0 };
    byUser.set(userId, s);
  }
  return s;
}

/** Record one AI confirmation purchase at a gated site. */
export function noteGrayZoneAsked(userId: number): void {
  current(userId).asked += 1;
}

/** Record one purchase skipped because the outcome was already decided. */
export function noteGrayZoneSkip(userId: number, kind: 'decisive_pass' | 'decisive_reject'): void {
  const s = current(userId);
  if (kind === 'decisive_pass') s.skippedDecisivePass += 1;
  else s.skippedDecisiveReject += 1;
}

/** Platform-wide view for /api/health: today's gated-site purchases vs
 *  purchases the gate made unnecessary. */
export function aiGrayZoneSummary(): {
  enabled: boolean; asked: number; skippedDecisivePass: number; skippedDecisiveReject: number; skippedTotal: number;
} {
  const day = utcDay();
  let asked = 0, skippedDecisivePass = 0, skippedDecisiveReject = 0;
  byUser.forEach((s) => {
    if (s.day !== day) return;
    asked += s.asked;
    skippedDecisivePass += s.skippedDecisivePass;
    skippedDecisiveReject += s.skippedDecisiveReject;
  });
  return {
    enabled: aiGrayZoneEnabled(),
    asked,
    skippedDecisivePass,
    skippedDecisiveReject,
    skippedTotal: skippedDecisivePass + skippedDecisiveReject,
  };
}
