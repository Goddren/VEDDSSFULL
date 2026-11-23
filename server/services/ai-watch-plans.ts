// ─────────────────────────────────────────────────────────────────────────────
// AI WATCH PLANS (2026-11-23, Chris's design: "the AI should already know the
// pattern it's watching and the candle type that triggers entry").
//
// Replaces the per-setup AI confirmation rhythm on the LIVE FX path
// (POST /api/mt5/chart-data) with a plan-driven one:
//   1. One DEEP analysis per pair produces a structured WATCH PLAN
//      (pattern, direction, entry zone, deterministic trigger, SL/TP sketch,
//      invalidation, bounded expiry) — persisted per user+pair.
//   2. While a plan is live and untriggered, chart-data posts evaluate the
//      trigger DETERMINISTICALLY against the posted candles — zero AI buys.
//   3. When the trigger fires, ONE confirmation is bought and the decision
//      flows through the EXISTING guard chain unchanged. A plan never trades
//      by itself.
//   4. Re-plan only on events (triggered / invalidated / expired / hard
//      structure break) with a per-pair deep-analysis cooldown.
//
// Kill switch: AI_WATCH_PLANS=off → the route behaves exactly as before.
// Fail-safe: any plan-layer failure falls back to the per-setup path.
// ─────────────────────────────────────────────────────────────────────────────

// WIP scaffold — implementation lands in the next commits.
export const watchPlansEnabled = () => process.env.AI_WATCH_PLANS !== 'off';
