// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp AI JUDGE (2026-11-22, Chris's ask: "why doesn't Kalshi
// use the AI brain?" — built as a JUDGE, not a gate).
//
// Every shadow candidate that has passed ALL existing gates (perp brain,
// VP veto, earnings blackout, liquidity, caps) and is about to open gets
// ONE AI verdict — approve / reject / unsure + confidence + one-line
// reason — recorded on the trade's context row and scored later against
// the outcome (panel scoreboard). The verdict NEVER blocks, sizes, or
// otherwise affects the entry in this build: gating is a later decision
// that needs this scoreboard's evidence first.
//
// Fail-open both directions: any AI failure (402, budget block, timeout,
// bad JSON) records verdict 'no_verdict' with the failure class and the
// entry proceeds exactly as today. Only candidates that actually open are
// judged — blocked candidates are never judged (cost guard).
//
// Kill switch: KALSHI_PERP_AI_JUDGE=off → no judge calls, no verdicts.
// ─────────────────────────────────────────────────────────────────────────────

// WIP scaffold — implementation lands in the next commits.
export const kalshiPerpAiJudgeEnabled = () => process.env.KALSHI_PERP_AI_JUDGE !== 'off';
