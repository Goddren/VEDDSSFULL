// ─────────────────────────────────────────────────────────────────────────────
// Pair / direction blocklist.
//
// WHY: two instruments are mathematically unprofitable on this account, and no
// amount of entry timing or position sizing fixes a negative expectancy. Over
// the full TradeLocker history to 2026-09-23:
//
//   GBPJPY   310 trades   34% WR   avg win  $59   avg loss -$100   -$14,284
//   USDJPY   375 trades   42% WR   avg win $107   avg loss -$108    -$6,339
//
// GBPJPY loses twice as often as it wins AND its winners are smaller than its
// losers — both halves of the edge are inverted. Split by direction:
//
//   GBPJPY SELL  200 trades  25.5% WR     GBPJPY BUY  164 trades  45.7% WR
//
// For contrast the account is carried by EURUSD (+$28,334), BTCUSD (+$20,770)
// and GBPUSD (+$11,853); all-time is +$38,590 at 42.9%, profitable only because
// winners average 1.8x losers. GBPJPY is the single largest drain on that.
//
// Deliberately an EXPLICIT list rather than a rolling statistic: blocking a pair
// stops generating data for it, so a self-computed rule could never release one.
// A human decides what is excluded, and can reverse it without a deploy.
// ─────────────────────────────────────────────────────────────────────────────

function parseList(v: string | undefined): string[] {
  return (v ?? '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
}
const norm = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

// Whole instrument. Default: GBPJPY.
const BLOCKED_PAIRS = parseList(process.env.BLOCKED_PAIRS ?? 'GBPJPY');
// One side only, as SYMBOL:DIRECTION (e.g. "USDJPY:SELL").
const BLOCKED_DIRECTIONS = parseList(process.env.BLOCKED_PAIR_DIRECTIONS ?? '');

export function pairFilterVerdict(symbol: string, direction: string): { blocked: true; reason: string } | null {
  if (process.env.PAIR_FILTER_ENABLED === 'false') return null;
  const sym = norm(symbol);
  const dir = String(direction || '').toUpperCase();

  for (const b of BLOCKED_PAIRS) {
    if (norm(b) === sym) {
      return { blocked: true, reason: `Pair filter: ${sym} is on the blocked list (34% WR over 310 trades, avg win $59 vs avg loss $100)` };
    }
  }
  for (const entry of BLOCKED_DIRECTIONS) {
    const [s, d] = entry.split(':');
    if (s && d && norm(s) === sym && d.toUpperCase() === dir) {
      return { blocked: true, reason: `Pair filter: ${sym} ${dir} is on the blocked list` };
    }
  }
  return null;
}

/** What is currently excluded — for the UI and for logging at boot. */
export function pairFilterConfig() {
  return { enabled: process.env.PAIR_FILTER_ENABLED !== 'false', pairs: BLOCKED_PAIRS, directions: BLOCKED_DIRECTIONS };
}
