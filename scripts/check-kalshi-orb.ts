/**
 * Kalshi ORB — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-orb.ts
 *
 * No database, broker, or market-data calls: everything exercised here is
 * pure (the lane's ORB candle math in kalshi-orb.ts, the once-per-day rule,
 * and the main engine's deliberately non-firing ORB registration).
 *
 *   A. Range forms from the 9:30–9:45 ET M5 bars only (pre-9:30 and
 *      9:45+ bars never extend it).
 *   B. No entry before a confirmed full-body breakout close; a wick poke
 *      and a still-live (unclosed) bar do not count.
 *   C. Entry fires only on a retest of the broken level (±25% of range),
 *      long and short, including the exact buffer boundary.
 *   D. Most-recent breakout wins (FX-helper parity), and no entry outside
 *      the 9:30–15:00 ET weekday window.
 *   E. Once per ticker per ET day (orbAlreadyFiredToday + ET day keys,
 *      incl. the UTC-date ≠ ET-date edges and EDT).
 *   F. Main-engine registration: orbSignal is NEUTRAL on any candle set,
 *      so the live-capable engine can never fire an ORB trade.
 */
import { computeKalshiOrbState, orbEntryDirection, orbAlreadyFiredToday, orbEtDayKey, type KalshiOrbBar } from '../server/services/kalshi-orb';
import { orbSignal } from '../server/services/kalshi-strategies';
import { stockOrbEnabled } from '../server/services/kalshi-stock-shadow';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

// ── Synthetic ET day builders ───────────────────────────────────────────────
// Wed Nov 4, 2026 is EST (UTC-5): ET 9:30 = 14:30 UTC.
const NOV4 = Date.UTC(2026, 10, 4, 0, 0, 0);
const bar = (etMin: number, o: number, h: number, l: number, c: number): KalshiOrbBar =>
  ({ t: NOV4 + (etMin + 5 * 60) * 60_000, o, h, l, c }); // ET minute → UTC ms (EST +5h)
const at = (etMin: number) => NOV4 + (etMin + 5 * 60) * 60_000;
const M = (h: number, m: number) => h * 60 + m;

// Range: 9:30–9:45 bars span 100–102. Decoys: a 9:25 bar spiking to 110 and
// a 9:50 bar dipping to 90 must NOT extend the range.
const rangeBars: KalshiOrbBar[] = [
  bar(M(9, 25), 100, 110, 99, 100),
  bar(M(9, 30), 100, 101, 100, 100.5),
  bar(M(9, 35), 100.5, 102, 100.2, 101),
  bar(M(9, 40), 101, 101.5, 100, 100.8),
  bar(M(9, 50), 100.5, 101, 90, 100.5),
];

// A — range formation
{
  const s = computeKalshiOrbState(rangeBars, 100.5, at(M(10, 0)));
  check('A1 range high from 9:30–9:45 only', s.orbHigh === 102, `orbHigh=${s.orbHigh}`);
  check('A2 range low from 9:30–9:45 only', s.orbLow === 100, `orbLow=${s.orbLow}`);
  check('A3 no bars at all → no_range', computeKalshiOrbState([], 100, at(M(10, 0))).phase === 'no_range');
  const flat = computeKalshiOrbState([bar(M(9, 30), 100, 100, 100, 100), bar(M(9, 35), 100, 100, 100, 100)], 100, at(M(10, 0)));
  check('A4 flat range (high == low) → no_range', flat.phase === 'no_range');
}

// B — breakout confirmation rules
{
  const inside = computeKalshiOrbState([...rangeBars, bar(M(10, 0), 100.8, 101.8, 100.4, 101.2)], 101.2, at(M(10, 10)));
  check('B1 inside range → awaiting_breakout, no entry', inside.phase === 'awaiting_breakout' && orbEntryDirection(inside) === null);
  const wick = computeKalshiOrbState([...rangeBars, bar(M(10, 0), 101, 104, 100.5, 101.5)], 101.5, at(M(10, 10)));
  check('B2 wick above range, body inside → no breakout', wick.breakoutDir === null && wick.phase === 'awaiting_breakout');
  const liveBar = bar(M(10, 5), 102.5, 103.5, 102.4, 103.2); // closes 10:10, "now" is 10:07
  const live = computeKalshiOrbState([...rangeBars, liveBar], 103.2, at(M(10, 7)));
  check('B3 unclosed bar body beyond range → ignored', live.breakoutDir === null, `phase=${live.phase}`);
}

// C — retest entries (range 100–102, buffer = 25% of 2 = 0.5)
const upBreak = bar(M(10, 0), 102.3, 103.4, 102.2, 103.1); // full body above 102
{
  const far = computeKalshiOrbState([...rangeBars, upBreak], 103.1, at(M(10, 10)));
  check('C1 breakout, price extended → breakout phase, no entry', far.phase === 'breakout' && far.breakoutDir === 'long' && orbEntryDirection(far) === null);
  const retest = computeKalshiOrbState([...rangeBars, upBreak], 102.3, at(M(10, 10)));
  check('C2 price back at broken level → retest, entry long', retest.phase === 'retest' && orbEntryDirection(retest) === 'long');
  const edge = computeKalshiOrbState([...rangeBars, upBreak], 102.5, at(M(10, 10)));
  check('C3 retest at exact +25% buffer edge → active', edge.retestActive === true);
  const beyond = computeKalshiOrbState([...rangeBars, upBreak], 102.52, at(M(10, 10)));
  check('C4 retest beyond buffer → inactive', beyond.retestActive === false);
  const dnBreak = bar(M(10, 0), 99.7, 99.9, 98.6, 98.9); // full body below 100
  const short = computeKalshiOrbState([...rangeBars, dnBreak], 99.8, at(M(10, 10)));
  check('C5 short breakout + retest → entry short', short.phase === 'retest' && orbEntryDirection(short) === 'short');
}

// D — most-recent breakout + session window
{
  const flip = computeKalshiOrbState([...rangeBars, upBreak, bar(M(11, 0), 99.6, 99.8, 98.4, 98.7)], 99.9, at(M(11, 10)));
  check('D1 later opposite breakout flips direction', flip.breakoutDir === 'short' && orbEntryDirection(flip) === 'short');
  const late = computeKalshiOrbState([...rangeBars, upBreak], 102.3, at(M(15, 30)));
  check('D2 retest shape after 15:00 ET → inWindow false, no entry', late.inWindow === false && orbEntryDirection(late) === null);
  const early = computeKalshiOrbState(rangeBars, 100.5, at(M(9, 20)));
  check('D3 before 9:30 ET → inWindow false', early.inWindow === false);
  const sat = computeKalshiOrbState([...rangeBars, upBreak], 102.3, Date.UTC(2026, 10, 7, 15, 30)); // Sat Nov 7, 10:30 ET
  check('D4 Saturday → inWindow false, no entry', sat.inWindow === false && orbEntryDirection(sat) === null);
}

// E — once per ticker per ET day
{
  const now = at(M(10, 30));
  check('E1 same ticker, opened earlier today ET → fired', orbAlreadyFiredToday([{ ticker: 'KXAAPLP', openedAtMs: at(M(9, 55)) }], 'KXAAPLP', now) === true);
  check('E2 different ticker → not fired', orbAlreadyFiredToday([{ ticker: 'KXAAPLP', openedAtMs: at(M(9, 55)) }], 'KXMSFTP', now) === false);
  check('E3 opened yesterday ET → not fired', orbAlreadyFiredToday([{ ticker: 'KXAAPLP', openedAtMs: at(M(9, 55)) - 24 * 3_600_000 }], 'KXAAPLP', now) === false);
  check('E4 opened 00:30 ET today (pre-open) still counts', orbAlreadyFiredToday([{ ticker: 'KXAAPLP', openedAtMs: at(M(0, 30)) }], 'KXAAPLP', now) === true);
  check('E5 day key: 04:30 UTC = 23:30 ET prior day (EST)', orbEtDayKey(Date.UTC(2026, 10, 4, 4, 30)) === '2026-11-03', orbEtDayKey(Date.UTC(2026, 10, 4, 4, 30)));
  check('E6 day key: 05:30 UTC = 00:30 ET same day (EST)', orbEtDayKey(Date.UTC(2026, 10, 4, 5, 30)) === '2026-11-04');
  check('E7 day key under EDT: 03:30 UTC = 23:30 ET prior day', orbEtDayKey(Date.UTC(2026, 6, 8, 3, 30)) === '2026-07-07', orbEtDayKey(Date.UTC(2026, 6, 8, 3, 30)));
  check('E8 day key under EDT: 04:30 UTC = 00:30 ET same day', orbEtDayKey(Date.UTC(2026, 6, 8, 4, 30)) === '2026-07-08');
  const jul8 = (etMin: number) => Date.UTC(2026, 6, 8, 0, 0, 0) + (etMin + 4 * 60) * 60_000; // EDT = UTC-4
  const julState = computeKalshiOrbState(
    [0, 5, 10].map((off) => ({ t: jul8(M(9, 30) + off), o: 200, h: 202, l: 200, c: 201 })),
    201, jul8(M(10, 0)));
  check('E9 range forms correctly under EDT', julState.orbHigh === 202 && julState.orbLow === 200 && julState.inWindow === true);
}

// F — main-engine stub + lane kill switch
{
  const candles = Array.from({ length: 100 }, (_, i) => ({ timestamp: i * 300, open: 100, high: 101, low: 99, close: 100, volume: 1 })) as any;
  const sig = orbSignal(candles);
  check('F1 engine orbSignal is NEUTRAL', sig.direction === 'NEUTRAL' && sig.strategy === 'orb');
  check('F2 engine orbSignal carries no confidence', sig.confidence === 0);
  delete process.env.KALSHI_STOCK_ORB;
  check('F3 lane ORB on by default', stockOrbEnabled() === true);
  process.env.KALSHI_STOCK_ORB = 'off';
  check('F4 KALSHI_STOCK_ORB=off disables lane ORB', stockOrbEnabled() === false);
  delete process.env.KALSHI_STOCK_ORB;
}

console.log(`\n${total - failures}/${total} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
