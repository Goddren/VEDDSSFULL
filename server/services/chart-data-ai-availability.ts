/**
 * Chart-data AI availability — is the AI layer of POST /api/mt5/chart-data
 * allowed to run for this user? (PR #111, "AI awake" fixes.)
 *
 * History: the 2026-10-16 credit saver keyed the route's whole AI layer
 * (confirmations, the verdict cache, the gray-zone gate, and later the
 * PR #108 watch-plan hook) off the Render env flag
 * CHART_DATA_AUTOTRADE_ENABLED. That flag was created for a different job —
 * it gates the route's TradeLocker fan-out EXECUTION (the 2026-10-13
 * oversized-order incident) — and it was never set in production, so the AI
 * layer has been unreachable since 2026-10-16 even for users whose EA is
 * enabled and posting: zero AI checks, zero watch plans, zero cache hits.
 *
 * The re-key: the AI layer is available when
 *   - the env flag is on (CHART_DATA_AUTOTRADE_ENABLED=true), OR
 *   - the explicit override is on (CHART_DATA_AI_WHEN_OFF=true), OR
 *   - the user's own EA switch is on — the EA kill switch the chart-data
 *     route itself reads at its head (global mt5EaEnabled[userId],
 *     default enabled; a disabled EA's posts are 403'd before they can
 *     reach the AI layer at all).
 *
 * When none hold, the saver's original behavior stands exactly: no AI spend
 * for a user whose EA is off. Kill switch: CHART_DATA_AI_SETTINGS_KEY=off
 * restores env-only keying (the settings input is ignored).
 *
 * This module is pure (plus one env read) so the decision can be pinned by
 * scripts/check-ai-awake-fixes.ts without a server or a database.
 */

export interface ChartDataAiAvailabilityInputs {
  /** CHART_DATA_AUTOTRADE_ENABLED === 'true' || CHART_DATA_AI_WHEN_OFF === 'true' */
  envEnabled: boolean;
  /** CHART_DATA_AI_SETTINGS_KEY === 'off' — kill switch: env-only keying. */
  settingsKeyOff: boolean;
  /** The user's EA kill switch as read at the chart-data route head. */
  eaEnabled: boolean;
}

export function chartDataAiEnabled(inputs: ChartDataAiAvailabilityInputs): boolean {
  if (inputs.envEnabled) return true;
  if (inputs.settingsKeyOff) return false;
  return inputs.eaEnabled === true;
}

/** Kill-switch read, at call time so ops can flip it without a code change. */
export function chartDataAiSettingsKeyOff(): boolean {
  return process.env.CHART_DATA_AI_SETTINGS_KEY === 'off';
}
