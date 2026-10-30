// How the autonomous FX engine actually trades (2026-10-30). Fed to the weekly
// plan generators so the plan a user sees matches the live engine: fewer,
// higher-quality trades, realistic targets, the same pairs/sessions it will
// really take. Built from the live settings so it stays in step with them.
import { pairFilterConfig } from './pair-filter';

export function livePlanRulesText(): string {
  let blocked: string[] = [];
  try { blocked = pairFilterConfig().pairs || []; } catch { /* filter unreadable → list nothing */ }
  const breathe = Number(process.env.STOP_HOLD_UNTIL_R ?? 1);
  return `LIVE ENGINE RULES — the autonomous engine follows these; the plan MUST match them:
- SELECTIVE: expect about 1–3 trades per day across all pairs, some days none. Never plan more than 3 trades/day in total or more than 1 per pair per day.
- An entry needs BOTH the H1 and H4 trend pointing the trade's way, a trending (not range) day, and price not stretched (no buys above RSI 70, no sells below 30 — wait for the pullback; ORB retests are exempt).
- Never against the 4-hour structure or Wyckoff phase; never when the 4-hour chart shows no clear structure.
- No new entries 21:00–24:00 UTC, none Friday 21:00 → Sunday 21:00 UTC. Best historical window: the Asian session 00:00–07:00 UTC; then London and the London/New York overlap.
- Pairs: EURUSD and XAUUSD have the best record; USDJPY is not traded in the New York session; ${blocked.length ? `${blocked.join(', ')} ${blocked.length > 1 ? 'are' : 'is'} paused — do not include` : 'no pairs are paused'}.
- Risk 0.5% of the account per trade. Stops are not tightened until a trade is ${breathe > 0 ? `${breathe}R` : '1R'} in profit, so a losing trade costs its full planned stop and a winner runs toward its 2R+ target.
- So a realistic week is a few percent of the account, not a doubling. Set "suggestedTarget" from this — about (trades per week × 40–50% win rate × 2R − losses) × 0.5% risk — and mark the feasibility honestly. Do not plan compounding beyond that.`;
}
