// ─────────────────────────────────────────────────────────────────────────────
// AI budget DEGRADE-DON'T-BLOCK (2026-11-26).
//
// Chris's correction, verbatim intent: the $2/day AI pool (ai-engine-
// budget.ts) is a SPEND cap, never a trade lock. He wanted lower AI credit
// spend — not engines that refuse to trade when the pool runs dry. Before
// this build, a dry pool hard-blocked lanes: the FX chart-data gate
// rejected every decision with "AI confirmation unavailable (budget) —
// refusing to trade an unverified signal" (all 50 decisions on 2026-11-26),
// the crypto Dual-Vote gate could never reach aiVerdict CONFIRM, and
// Kalshi perp shadow entries starved once watch-plan studies could no
// longer be bought.
//
// THE RULE: when the budget layer REFUSES an AI call — the typed refusal
// only (pool exhausted / reserve held) — the lane degrades to its
// deterministic stack alone, with every existing deterministic gate still
// fully enforced, and the decision stamped honestly as rules-decided.
// Provider/API failures (credits at the provider, auth, rate limit,
// network, unparseable output) are NOT budget refusals: they keep each
// lane's pre-existing handling, untouched by this module.
//
// HONESTY (verdict fidelity, PR #113, is the law): a degraded decision is
// NEVER labelled AI-approved. The raw AI verdict fields stay empty/null,
// no confidence is manufactured or rewritten, and the EA≥85 advisory
// override must not fire in degraded mode. Every degraded decision
// carries AI_BUDGET_DEGRADED_MODE on its durable row plus the human-
// readable AI_BUDGET_DEGRADED_REASON.
//
// Master kill switch: AI_BUDGET_DEGRADE=off restores the pre-build
// block-on-budget behavior on every touched path. Consulted LIVE at each
// call site (never cached), like every other kill switch in this codebase.
// ─────────────────────────────────────────────────────────────────────────────

/** Durable marker stamped on degraded decision / trade / context rows. */
export const AI_BUDGET_DEGRADED_MODE = 'rules_only_budget';

/** Short human-readable label for a degraded decision (log lines and the
 *  live engine's rules-lane activity label). Plain-voice pass 2026-11-26:
 *  every degraded surface speaks the same street-plain language — the
 *  full per-lane sentences are composed by the helpers below. */
export const AI_BUDGET_DEGRADED_REASON = 'AI money tapped out — the playbook ran it solo, no AI';

/** Common opener for the FX degraded decision texts (chart-data gate). */
export const AI_BUDGET_DEGRADED_OPENER = "AI money tapped out for today — the AI didn't touch this one. The playbook (VEDD's built-in rules) ran it by itself.";

/** FX live-engine activity line when a scan degrades to the rules lane. */
export const FX_ENGINE_DEGRADED_ACTIVITY = 'AI money tapped out — the rules ran this whole scan by themselves, no AI. It refills at midnight UTC.';

/** Kalshi perp shadow: the human line recorded on a degraded entry's
 *  context row (next to the unchanged rules_only_budget tag). */
export const KALSHI_PERP_DEGRADED_CONTEXT_LINE = "AI money tapped out — couldn't buy a study, so this entry ran on the strategy's own signal. Playbook rules only.";

/** Master kill switch: AI_BUDGET_DEGRADE=off → block-on-budget (legacy). */
export function aiBudgetDegradeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AI_BUDGET_DEGRADE !== 'off';
}

/**
 * Typed budget refusal on a THROWN error — the shape engineAiBudgetError()
 * (ai-engine-budget.ts) produces: an Error carrying `budgetBlocked: true`
 * and `aiErrorStatus: 'budget'` (status 402). A genuine provider 402 has
 * NEITHER marker (provider errors carry a numeric status only), so this
 * never misfires on provider failures. Duck-typed on purpose: the budget
 * module's markers are the contract, not its class.
 */
export function isBudgetRefusalError(err: any): boolean {
  return !!err && (err.budgetBlocked === true || err.aiErrorStatus === 'budget');
}

/**
 * Typed budget refusal on a RETURNED verdict object — the shape
 * engineAiBudgetVerdict() produces: `{ aiError: true, aiErrorStatus:
 * 'budget', modelUsed: 'ai-budget-gate', ... }`. Provider-error verdicts
 * from the AI client layer carry aiErrorStatus as a NUMBER (or null) —
 * never the string 'budget' — so this is unambiguous.
 */
export function isBudgetRefusalVerdict(verdict: any): boolean {
  return !!verdict && verdict.aiError === true && verdict.aiErrorStatus === 'budget';
}

// ── FX chart-data gate (routes.ts) ─────────────────────────────────────────

/**
 * The execution floor a degraded FX decision must clear on EA confidence
 * ALONE — the same 74% hard floor the live engine enforces downstream
 * (HARD_CONFIDENCE_FLOOR) and full-mode TradeLocker accounts apply per
 * connection. Below it, a degraded decision is still blocked and the
 * block reason names the floor.
 */
export const FX_DEGRADED_EA_FLOOR = 74;

/**
 * The deterministic stack that decides an FX chart-data post when the AI
 * confirmation was budget-refused. Pure — the route calls this and the
 * check suite pins it. ALL of these must hold:
 *   • the quant rules agent CONFIRMs on its own (score ≥ its CONFIRM bar);
 *   • EA confidence meets the 74% execution floor on its own;
 *   • no deterministic structure conflict (opposite-direction BOS/CHOCH).
 * Brain guards, R:R, Gate 0 family, session filters and the fan-out gate
 * live outside this decision and run unchanged downstream.
 */
export function fxBudgetDegradedDecision(input: {
  quantVerdict: string;
  quantScore?: number | null;
  eaConfidence: number;
  confluenceConflicts: boolean;
}): { allowed: boolean; blockReason: string } {
  // blockReason is the FULL displayed text (plain-voice pass 2026-11-26):
  // the degraded decision's reasoning stands alone in the feed — the
  // budget gate's own verdict text is never appended to it.
  if (input.quantVerdict !== 'CONFIRM') {
    const score = typeof input.quantScore === 'number' ? ` (${input.quantScore})` : '';
    if (input.quantVerdict === 'WATCH') {
      return { allowed: false, blockReason: `${AI_BUDGET_DEGRADED_OPENER} Playbook says WATCH${score} — that's a 'hold on, not yet,' not a green light. We sitting this one out till it looks right. AI money's back at midnight UTC.` };
    }
    return { allowed: false, blockReason: `${AI_BUDGET_DEGRADED_OPENER} Playbook says ${input.quantVerdict}${score} — that's a straight pass. No trade — we not forcing nothing. AI money's back at midnight UTC.` };
  }
  if (!(input.eaConfidence >= FX_DEGRADED_EA_FLOOR)) {
    return { allowed: false, blockReason: `${AI_BUDGET_DEGRADED_OPENER} The setup only scored ${input.eaConfidence}% confidence and it needs ${FX_DEGRADED_EA_FLOOR}% to play. Too weak — we not forcing it. No trade. AI money's back at midnight UTC.` };
  }
  if (input.confluenceConflicts) {
    return { allowed: false, blockReason: `${AI_BUDGET_DEGRADED_OPENER} The chart's moving one way and the signal's saying another — they fighting each other. Playbook said nah. No trade. AI money's back at midnight UTC.` };
  }
  return { allowed: true, blockReason: '' };
}

/**
 * The displayed reasoning for a degraded FX decision the rules ALLOWED
 * (quant CONFIRM + EA at/above the floor + no structure conflict — the
 * fxBudgetDegradedDecision gate above). Plain voice, stands alone: it
 * replaces the budget gate's verdict text on the approval record.
 */
export function fxBudgetDegradedGoText(eaConfidence: number): string {
  return `${AI_BUDGET_DEGRADED_OPENER} And it said GO. The setup came in at ${eaConfidence}% confidence, over the ${FX_DEGRADED_EA_FLOOR}% it needs to play. Trade's on — just know this is the playbook's call, not the AI's. AI money's back at midnight UTC.`;
}

// ── Crypto Dual-Vote gate (cryptocom-scanner.ts) ───────────────────────────

/**
 * The deterministic side of the crypto Dual-Vote gate when the AI vote
 * was budget-refused: the quant/strategy score must CONFIRM on its own
 * (quantVerdictFromScore: score ≥ 65). The "both must agree" rule applies
 * only when the AI actually voted. Every other deterministic gate (brain
 * guards incl. promoted shadow guards, cost floor, safety/risk gates)
 * runs downstream unchanged.
 */
export function cryptoBudgetDegradedAllowed(quantVerdict: string): boolean {
  return quantVerdict === 'CONFIRM';
}

/**
 * The displayed reasoning for a degraded crypto consensus row (plain
 * voice, stands alone — it replaces the budget error text the AI
 * confirmation carried, never appends to it). GO when the quant score
 * confirmed on its own; a plain pass otherwise.
 */
export function cryptoBudgetDegradedText(quantVerdict: string, score: number): string {
  return quantVerdict === 'CONFIRM'
    ? `AI money tapped out — the scanner ran this one by itself, no AI second look. Scanner said GO (${score}). This entry is all scanner, no AI.`
    : `AI money tapped out — the scanner ran this one by itself, no AI second look. Scanner said pass (${score}). No trade.`;
}
