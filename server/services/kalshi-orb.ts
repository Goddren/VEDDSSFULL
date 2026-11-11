// ─────────────────────────────────────────────────────────────────────────────
// ORB (Opening Range Breakout) for the Kalshi stock-perp SHADOW lane.
//
// Pure candle math — no DB, no market-data calls, no imports — so the lane
// (kalshi-stock-shadow.ts) and scripts/check-kalshi-orb.ts exercise the
// exact same code. Parameters deliberately mirror the app's canonical ORB
// implementations (the FX engine's computeOrbStateFromCandles in
// live-trading-engine.ts, PR #52, and the Strategy Studio spec ORB):
//   • opening range = 9:30–9:45 AM America/New_York (equity session open —
//     the anchor for stock perps), built from M5 bars aggregated from the
//     lane's native 1-minute Kalshi candles;
//   • breakout = a CLOSED M5 bar whose full body closed beyond the range;
//   • entry only on a RETEST of the broken level, price within ±25% of
//     the range of that level;
//   • trading window 9:30–15:00 ET, weekdays only; once per ticker per
//     ET day (enforced by the lane via orbAlreadyFiredToday below).
//
// A lane-local implementation (rather than importing the FX helper) because
// the shapes differ: the FX helper consumes newest-first M5 candles with
// second timestamps plus an FX-specific NY-date key, while perp candles are
// oldest-first with ms timestamps and the lane already works in ET parts.
// The math and parameters are identical; check-kalshi-orb.ts pins them.
// ─────────────────────────────────────────────────────────────────────────────

export interface KalshiOrbBar { t: number; o: number; h: number; l: number; c: number } // t = bar START, ms epoch

export interface KalshiOrbState {
  orbHigh: number;            // 0 when no valid range yet
  orbLow: number;
  range: number;
  breakoutDir: 'long' | 'short' | null;
  retestActive: boolean;
  phase: 'no_range' | 'awaiting_breakout' | 'breakout' | 'retest';
  inWindow: boolean;          // 9:30–15:00 ET on a weekday, today ET
  currentPrice: number;
}

const etDateFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' });
const etPartsFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit', weekday: 'short' });

/** ET calendar-day key (YYYY-MM-DD) for a timestamp — the once-per-day unit. */
export function orbEtDayKey(tsMs: number): string {
  const parts = etDateFmt.formatToParts(new Date(tsMs));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  return `${g('year')}-${g('month')}-${g('day')}`;
}

function etMinutesAndDow(tsMs: number): { minutes: number; dow: number } {
  const parts = etPartsFmt.formatToParts(new Date(tsMs));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const dowMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { minutes: (Number(g('hour')) % 24) * 60 + Number(g('minute')), dow: dowMap[g('weekday')] ?? 0 };
}

export const ORB_OPEN_MIN_ET = 9 * 60 + 30;   // 9:30 AM ET
export const ORB_RANGE_END_MIN_ET = 9 * 60 + 45; // 9:45 AM ET
export const ORB_CLOSE_MIN_ET = 15 * 60;      // 3:00 PM ET
export const ORB_RETEST_BUFFER = 0.25;        // ±25% of range around the broken level

/**
 * Pure ORB state from OLDEST-FIRST M5 bars (the lane aggregates its native
 * 1-minute perp candles ×5). Only bars from today's ET date are considered;
 * a bar counts as CLOSED once its 5 minutes have fully elapsed by `nowMs`
 * (the FX lane's live-candle skip, expressed by close time). Breakout scan
 * takes the most recent qualifying bar — the same rule as the FX helper.
 */
export function computeKalshiOrbState(m5Bars: KalshiOrbBar[], currentPrice: number, nowMs: number): KalshiOrbState {
  const todayKey = orbEtDayKey(nowMs);
  const { minutes: nowMin, dow } = etMinutesAndDow(nowMs);
  const inWindow = dow >= 1 && dow <= 5 && nowMin >= ORB_OPEN_MIN_ET && nowMin < ORB_CLOSE_MIN_ET;
  const none: KalshiOrbState = { orbHigh: 0, orbLow: 0, range: 0, breakoutDir: null, retestActive: false, phase: 'no_range', inWindow, currentPrice };

  const todays = m5Bars.filter((b) => b.t > 0 && orbEtDayKey(b.t) === todayKey);
  const rangeBars = todays.filter((b) => {
    const m = etMinutesAndDow(b.t).minutes;
    return m >= ORB_OPEN_MIN_ET && m < ORB_RANGE_END_MIN_ET;
  });
  if (!rangeBars.length) return none;
  const orbHigh = Math.max(...rangeBars.map((b) => b.h));
  const orbLow = Math.min(...rangeBars.map((b) => b.l));
  if (!(orbHigh > orbLow) || !(orbLow > 0)) return none;

  const range = orbHigh - orbLow;
  const retestBuffer = range * ORB_RETEST_BUFFER;

  // Breakout: most recent CLOSED post-range bar whose full body closed
  // beyond the range (scan newest → oldest, first match wins — as FX).
  let breakoutDir: 'long' | 'short' | null = null;
  const postBars = todays.filter((b) => etMinutesAndDow(b.t).minutes >= ORB_RANGE_END_MIN_ET && b.t + 5 * 60_000 <= nowMs);
  for (let i = postBars.length - 1; i >= 0; i--) {
    const b = postBars[i];
    const bodyHigh = Math.max(b.o, b.c), bodyLow = Math.min(b.o, b.c);
    if (bodyLow > orbHigh) { breakoutDir = 'long'; break; }
    if (bodyHigh < orbLow) { breakoutDir = 'short'; break; }
  }
  if (!breakoutDir) return { ...none, orbHigh, orbLow, range, phase: 'awaiting_breakout' };

  const isRetestLong = breakoutDir === 'long' && currentPrice >= orbHigh - retestBuffer && currentPrice <= orbHigh + retestBuffer;
  const isRetestShort = breakoutDir === 'short' && currentPrice >= orbLow - retestBuffer && currentPrice <= orbLow + retestBuffer;
  const retestActive = isRetestLong || isRetestShort;
  return { orbHigh, orbLow, range, breakoutDir, retestActive, phase: retestActive ? 'retest' : 'breakout', inWindow, currentPrice };
}

/** The lane's entry rule: fire only on an in-window retest. */
export function orbEntryDirection(state: KalshiOrbState): 'long' | 'short' | null {
  return state.inWindow && state.phase === 'retest' ? state.breakoutDir : null;
}

/** Once per ticker per ET day: has an 'orb' trade already opened today (ET)? */
export function orbAlreadyFiredToday(prior: Array<{ ticker: string; openedAtMs: number }>, ticker: string, nowMs: number): boolean {
  const key = orbEtDayKey(nowMs);
  return prior.some((p) => p.ticker === ticker && orbEtDayKey(p.openedAtMs) === key);
}
