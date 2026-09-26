// ─────────────────────────────────────────────────────────────────────────────
// Weekend boost — shift emphasis toward crypto and Sol Friday through Sunday.
//
// WHY: most FX pairs close for the weekend (Friday ~21:00-22:00 UTC through
// Sunday ~21:00-22:00 UTC) and Friday's own session tends to produce thin,
// unpredictable pre-weekend moves rather than clean setups. Crypto and Sol
// trade 24/7 and are unaffected by any of that, so the user wants them to
// carry more of the week's activity specifically across this window rather
// than the account sitting mostly idle once FX quiets down.
//
// Scope, deliberately: Friday 00:00 UTC through Sunday 23:59:59 UTC. That is
// simpler and more conservative than trying to pin the exact FX close/reopen
// minute, and it matches what was actually asked for — "Friday into the
// weekend" — rather than a narrower window that might miss part of it.
//
// Applied as a lowered confidence floor + a position-size multiplier, read
// once per scan cycle by each engine. Both are env-tunable (same pattern as
// pair-filter.ts / hour-filter.ts / pair-daily-stop.ts from this same
// project) rather than a new DB column, so this can be turned off or retuned
// without a migration.
// ─────────────────────────────────────────────────────────────────────────────

const ENABLED = process.env.WEEKEND_BOOST_ENABLED !== 'false';
// Points shaved off the confidence floor during the boost window. Bounded by
// a hard floor below (never below 50) regardless of how this is configured —
// a boost is not a license to trade on a coin flip.
const CONF_DELTA = Number(process.env.WEEKEND_BOOST_CONF_DELTA ?? 5);
const CONF_HARD_FLOOR = 50;
// Position-size multiplier during the boost window (1.0 = no change).
const SIZE_MULT = Number(process.env.WEEKEND_BOOST_SIZE_MULT ?? 1.3);

export function isWeekendBoostWindow(d: Date = new Date()): boolean {
  const day = d.getUTCDay(); // 0=Sun, 5=Fri, 6=Sat
  return day === 5 || day === 6 || day === 0;
}

export function weekendBoostActive(d: Date = new Date()): boolean {
  return ENABLED && isWeekendBoostWindow(d);
}

/** Apply the confidence-floor reduction. Pass-through when the boost isn't active. */
export function boostedMinConfidence(minConfidence: number, d: Date = new Date()): number {
  if (!weekendBoostActive(d)) return minConfidence;
  return Math.max(CONF_HARD_FLOOR, minConfidence - CONF_DELTA);
}

/** The size multiplier to apply this cycle. 1.0 when the boost isn't active. */
export function weekendBoostSizeMultiplier(d: Date = new Date()): number {
  return weekendBoostActive(d) ? SIZE_MULT : 1;
}

/** Human-readable note for activity logs when the boost is actually doing something. */
export function weekendBoostNote(d: Date = new Date()): string {
  if (!weekendBoostActive(d)) return '';
  return ` 🚀 Weekend boost active (conf floor -${CONF_DELTA}, size ×${SIZE_MULT.toFixed(2)}) — FX is closed/thin, more weight on this engine.`;
}
