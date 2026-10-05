// ─────────────────────────────────────────────────────────────────────────────
// XAUUSD-specific trade management.
//
// Measured 2026-10-05 over the last 30 days of XAUUSD signals (9 setups,
// replayed against 15-minute gold bars with the futures→spot basis removed):
//
//   • Gold typically runs 40–110 points in the trade's favour, then reverses
//     all the way to the 75-point stop before the 150-point target. Holding to
//     target: 1 win / 8 losses, −387 points.
//   • Locking the stop at +20 once the trade is +40, then trailing 20 behind
//     the peak (target kept at 150): 6 wins / 3 losses, −1 point. Same as a
//     half-off-at-+40 rule (−30) without needing a partial close.
//   • The 2026-10-04 SELL opened at 22:26 UTC, a minute after gold's Sunday
//     open, and four accounts were closed ~10s later for −$154 — the opening
//     spread, not a market move.
//
// So, for XAUUSD only:
//   1. No new entries from 21:00 to 22:30 UTC (gold's daily break + the first
//      30 minutes after it reopens, when spreads are widest).
//   2. The engine's own early exits (AI position management, reversal exit)
//      can't close a gold position younger than 10 minutes. The broker-side
//      stop-loss still protects it the whole time.
//   3. Profit lock: at +40 points move the stop to +20, then trail 20 behind
//      the best price. The stop only ever tightens.
//
// Each rule can be switched off with an env var; thresholds are env-tunable.
// ─────────────────────────────────────────────────────────────────────────────

const ENTRY_BLOCK_ON = () => process.env.XAU_OPEN_BLOCK_ENABLED !== 'false';
const BLOCK_START_MIN = Number(process.env.XAU_OPEN_BLOCK_START_MIN_UTC ?? 21 * 60);      // 21:00
const BLOCK_END_MIN = Number(process.env.XAU_OPEN_BLOCK_END_MIN_UTC ?? 22 * 60 + 30);    // 22:30

const MIN_HOLD_ON = () => process.env.XAU_MIN_HOLD_ENABLED !== 'false';
const MIN_HOLD_MS = Number(process.env.XAU_MIN_HOLD_MINUTES ?? 10) * 60_000;

export const XAU_LOCK_ON = () => process.env.XAU_PROFIT_LOCK_ENABLED !== 'false';
export const XAU_LOCK_ACTIVATE_PTS = Number(process.env.XAU_LOCK_ACTIVATE_PTS ?? 40);
export const XAU_LOCK_AT_PTS = Number(process.env.XAU_LOCK_AT_PTS ?? 20);
export const XAU_TRAIL_PTS = Number(process.env.XAU_TRAIL_PTS ?? 20);
/** Ounces per 1.0 lot — confirmed from live fills (−$51.45 on 0.07 lot = 7.35 pts). */
export const XAU_CONTRACT_SIZE = Number(process.env.XAU_CONTRACT_SIZE ?? 100);

export function isXau(symbol: string | null | undefined): boolean {
  return /^XAU/i.test(String(symbol || '').replace(/[^A-Za-z]/g, ''));
}

/** Rule 1 — returns a block reason during gold's spread window, else null. */
export function xauEntryBlock(symbol: string, now = new Date()): string | null {
  if (!ENTRY_BLOCK_ON() || !isXau(symbol)) return null;
  const m = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (m >= BLOCK_START_MIN && m < BLOCK_END_MIN) {
    const fmt = (x: number) => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
    return `XAUUSD spread window: no gold entries ${fmt(BLOCK_START_MIN)}–${fmt(BLOCK_END_MIN)} UTC (daily break + reopen, widest spreads)`;
  }
  return null;
}

/**
 * Rule 2 — true when an ENGINE-initiated close of this gold position should be
 * held off because it opened less than the minimum hold ago. `openedAt` accepts
 * ms, seconds or an ISO string; an unknown open time never blocks a close.
 */
export function xauTooYoungToClose(symbol: string, openedAt: number | string | null | undefined): boolean {
  if (!MIN_HOLD_ON() || !isXau(symbol) || openedAt == null || openedAt === '') return false;
  let ms = typeof openedAt === 'number' ? openedAt : new Date(openedAt).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return false;
  if (ms < 1e12) ms *= 1000; // seconds → ms
  return Date.now() - ms < MIN_HOLD_MS;
}

/**
 * Rule 3 — the stop (as points in the trade's favour from entry) the profit
 * lock wants, given the best favourable move so far. null = not active yet.
 */
export function xauLockStopPts(peakFavPts: number): number | null {
  if (!XAU_LOCK_ON() || !(peakFavPts >= XAU_LOCK_ACTIVATE_PTS)) return null;
  return Math.max(XAU_LOCK_AT_PTS, peakFavPts - XAU_TRAIL_PTS);
}
