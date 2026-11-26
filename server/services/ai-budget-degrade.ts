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

/** Human-readable reason every degraded decision carries, verbatim. */
export const AI_BUDGET_DEGRADED_REASON = 'no AI (budget out) — rules decided';

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
  if (input.quantVerdict !== 'CONFIRM') {
    const score = typeof input.quantScore === 'number' ? ` (${input.quantScore})` : '';
    return { allowed: false, blockReason: `quant rules verdict ${input.quantVerdict}${score} is not CONFIRM` };
  }
  if (!(input.eaConfidence >= FX_DEGRADED_EA_FLOOR)) {
    return { allowed: false, blockReason: `EA confidence ${input.eaConfidence}% is below the ${FX_DEGRADED_EA_FLOOR}% execution floor` };
  }
  if (input.confluenceConflicts) {
    return { allowed: false, blockReason: 'deterministic structure check conflicts with the signal direction' };
  }
  return { allowed: true, blockReason: '' };
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
