/**
 * US30 / NAS100 FX-engine wiring — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-fx-index-orb.ts
 *
 * No database, broker, or market-data calls: everything exercised here is
 * pure (asset-type routing, timestamp units, ORB candle math, pip math,
 * broker alias tables).
 *
 *   A. detectAssetType — US30 and NAS100 (and their common CFD names) must
 *      BOTH route to 'index'. NAS100 used to fall through to 'stock'
 *      (it contains none of the old substrings), which silently routed it
 *      away from the ORB broker-candle path and the index symbol maps.
 *   B. toEpochSeconds — TradeLocker history bars carry MILLISECOND `t`;
 *      every consumer assumes seconds. Magnitude conversion must map ms
 *      to the same instant and leave seconds untouched.
 *   C. ORB state from synthetic index candles — a ~38k US30 and a ~18k
 *      NAS100 series must produce ranges in POINTS (60 / 90), a confirmed
 *      breakout, and an active retest. The same US30 series with raw
 *      millisecond timestamps must produce 'no_range' (the bug), and the
 *      identical series after toEpochSeconds must produce the full state
 *      (the fix, at the ORB boundary).
 *   D. Pip / risk math — pip size 1 and pip value $1 for both indices, so
 *      SL distances and dollar risk come out in points, not in the
 *      10,000x-inflated units a forex formula would produce.
 *   E. Broker symbol maps — the candle-history alias table must know the
 *      names the order path knows (NASDAQ100 / NQ100 / DJI30 / WS30), and
 *      the engine's MT5-cache alias table must cover USTEC / WALLST30.
 */

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const { marketDataService } = await import('../server/market-data/service');
const { toEpochSeconds } = await import('../server/utils/candleNormalize');
const { getPipSize, getPipValue } = await import('../server/utils/pipUtils');
const { TL_CANDLE_SYMBOL_ALIASES } = await import('../server/tradelocker');
const {
  computeOrbStateFromCandles, getNYTime, INDEX_BROKER_ALIASES,
} = await import('../server/services/live-trading-engine');

// ── A. Asset-type routing ────────────────────────────────────────────────────
for (const sym of ['US30', 'NAS100', 'USTEC', 'WS30', 'DJ30', 'US500', 'US100']) {
  check(`A detectAssetType(${sym}) === 'index'`, marketDataService.detectAssetType(sym) === 'index',
    `got '${marketDataService.detectAssetType(sym)}'`);
}
// Routing neighbours must not move.
check("A detectAssetType(EURUSD) === 'forex'", marketDataService.detectAssetType('EURUSD') === 'forex');
check("A detectAssetType(USDJPY) === 'forex'", marketDataService.detectAssetType('USDJPY') === 'forex');
check("A detectAssetType(XAUUSD) === 'forex'", marketDataService.detectAssetType('XAUUSD') === 'forex');
check("A detectAssetType(BTCUSD) === 'crypto'", marketDataService.detectAssetType('BTCUSD') === 'crypto');

// ── B. Timestamp units ───────────────────────────────────────────────────────
const SEC = 1763371800; // 2025-11-17T09:30:00Z — a realistic bar time, seconds
check('B seconds pass through untouched', toEpochSeconds(SEC) === SEC);
check('B milliseconds convert to the same instant', toEpochSeconds(SEC * 1000) === SEC);
check('B millisecond string converts', toEpochSeconds(String(SEC * 1000)) === SEC);
check('B zero stays the no-timestamp sentinel', toEpochSeconds(0) === 0);
check('B garbage collapses to 0', toEpochSeconds('n/a') === 0 && toEpochSeconds(NaN) === 0);

// ── C. ORB state from synthetic index candles ────────────────────────────────
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

// NY wall-clock → UTC ms (9:30 AM is never inside a DST transition window,
// so one correction pass is exact) — same helper as check-sniper-orb.ts.
function nyWallToUtcMs(dateStr: string, h: number, mi: number): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, mo - 1, d, h, mi);
  const got = getNYTime(t);
  t += ((h * 60 + mi) - (got.hour * 60 + got.minute)) * 60000;
  return t;
}
function buildCandles(dateStr: string, spec: Array<[number, number, number, number, number, number]>): Candle[] {
  const oldestFirst = spec.map(([h, mi, o, hi, lo, c]) => ({
    t: Math.floor(nyWallToUtcMs(dateStr, h, mi) / 1000), o, h: hi, l: lo, c, v: 100,
  }));
  for (const c of oldestFirst) {
    if (getNYTime(c.t * 1000).dateStr !== dateStr) throw new Error(`candle date mismatch for ${dateStr}`);
  }
  return [...oldestFirst].reverse(); // newest-first, the OrbCandle contract
}

const DAY = '2026-11-16';

// US30: 9:30–9:45 range 38,060–38,120 (60 points). A closed 10:00 candle's
// body sits fully above the high (BUY breakout); the live 10:05 candle is
// skipped by the lane; price now 38,125, inside the ±25%-of-range retest
// band around 38,120.
const us30 = buildCandles(DAY, [
  [9, 30, 38080, 38120, 38060, 38100],
  [9, 35, 38100, 38110, 38070, 38085],
  [9, 40, 38085, 38095, 38075, 38090],
  [10, 0, 38130, 38170, 38125, 38160],
  [10, 5, 38140, 38145, 38120, 38125], // live candle (skipped for breakout)
]);
const us30State = computeOrbStateFromCandles(us30, 38125, DAY);
check('C US30 range high/low from the 9:30–9:45 bars', us30State.orbHigh === 38120 && us30State.orbLow === 38060,
  `got ${us30State.orbLow}–${us30State.orbHigh}`);
check('C US30 range is 60 POINTS', us30State.range === 60, `got ${us30State.range}`);
check('C US30 breakout is BUY', us30State.breakoutDir === 'BUY', `got ${us30State.breakoutDir}`);
check('C US30 phase is retest at 38,125', us30State.phase === 'retest' && us30State.retestActive,
  `got ${us30State.phase}`);

// NAS100: 9:30–9:45 range 18,000–18,090 (90 points). Closed 10:00 body fully
// below the low (SELL breakout); price 17,995 inside the retest band.
const nas100 = buildCandles(DAY, [
  [9, 30, 18040, 18090, 18010, 18060],
  [9, 35, 18060, 18080, 18000, 18020],
  [9, 40, 18020, 18050, 18005, 18030],
  [10, 0, 17990, 17995, 17950, 17960],
  [10, 5, 17980, 18000, 17970, 17995], // live candle (skipped for breakout)
]);
const nasState = computeOrbStateFromCandles(nas100, 17995, DAY);
check('C NAS100 range high/low from the 9:30–9:45 bars', nasState.orbHigh === 18090 && nasState.orbLow === 18000,
  `got ${nasState.orbLow}–${nasState.orbHigh}`);
check('C NAS100 range is 90 POINTS', nasState.range === 90, `got ${nasState.range}`);
check('C NAS100 breakout is SELL', nasState.breakoutDir === 'SELL', `got ${nasState.breakoutDir}`);
check('C NAS100 phase is retest at 17,995', nasState.phase === 'retest' && nasState.retestActive,
  `got ${nasState.phase}`);

// The bug, pinned: the same US30 series with TradeLocker-style MILLISECOND
// timestamps produces no range at all (every bar lands in the year ~57000,
// none match today) — the silent failure this PR removes.
const us30Ms = us30.map(c => ({ ...c, t: c.t * 1000 }));
const msState = computeOrbStateFromCandles(us30Ms, 38125, DAY);
check('C raw millisecond bars yield no_range (the bug)', msState.phase === 'no_range',
  `got ${msState.phase}`);
// The fix, pinned at the ORB boundary: after magnitude normalisation the
// identical series yields the identical state.
const us30Fixed = us30Ms.map(c => ({ ...c, t: toEpochSeconds(c.t) }));
const fixedState = computeOrbStateFromCandles(us30Fixed, 38125, DAY);
check('C normalised ms bars reproduce the seconds state',
  fixedState.phase === 'retest' && fixedState.range === 60 && fixedState.breakoutDir === 'BUY',
  `got phase=${fixedState.phase} range=${fixedState.range} dir=${fixedState.breakoutDir}`);

// ── D. Pip / risk math in points ─────────────────────────────────────────────
check('D getPipSize(US30) === 1', getPipSize('US30') === 1);
check('D getPipSize(NAS100) === 1', getPipSize('NAS100') === 1);
check('D getPipValue(US30) === $1', getPipValue('US30') === 1);
check('D getPipValue(NAS100) === $1', getPipValue('NAS100') === 1);

// The autonomous lane's own construction on the US30 state above: SL sits
// 10% of the range beyond the far side, TP1 at 2R. In pips (= points) those
// distances must be tens of points — a forex-style formula would report
// hundreds of thousands and blow every risk cap downstream.
const orbRange = us30State.range;
const slDist = orbRange + orbRange * 0.1;
const slPips = slDist / getPipSize('US30');
check('D ORB SL distance is 66 pips (points) for a 60-point range', slPips === 66, `got ${slPips}`);
check('D ORB SL distance is plausible for an index (< 1000, > 10)', slPips > 10 && slPips < 1000);
const riskAtMaxLot = 0.10 * slPips * getPipValue('US30');
check('D risk at the 0.10 max lot is $6.60', Math.abs(riskAtMaxLot - 6.6) < 1e-9, `got $${riskAtMaxLot}`);
// Range width as the AI prompt now reports it: range / pipSize, not * 10000.
check('D prompt range width is 60 pips, not 600000',
  Math.round(orbRange / getPipSize('US30')) === 60 && Math.round(orbRange * 10000) === 600000);

// ── E. Broker symbol maps ────────────────────────────────────────────────────
check('E engine MT5-cache aliases: NAS100 covers USTEC + NASDAQ100',
  INDEX_BROKER_ALIASES.NAS100.includes('USTEC') && INDEX_BROKER_ALIASES.NAS100.includes('NASDAQ100'));
check('E engine MT5-cache aliases: US30 covers WALLST30 + WS30',
  INDEX_BROKER_ALIASES.US30.includes('WALLST30') && INDEX_BROKER_ALIASES.US30.includes('WS30'));
check('E TL candle aliases: NAS100 covers NASDAQ100 + NQ100 (order-path parity)',
  TL_CANDLE_SYMBOL_ALIASES.NAS100.includes('NASDAQ100') && TL_CANDLE_SYMBOL_ALIASES.NAS100.includes('NQ100'));
check('E TL candle aliases: US30 covers DJI30 + WS30 (order-path parity)',
  TL_CANDLE_SYMBOL_ALIASES.US30.includes('DJI30') && TL_CANDLE_SYMBOL_ALIASES.US30.includes('WS30'));
check('E TL candle aliases still cover USTEC / DJ30 / WALLST30',
  TL_CANDLE_SYMBOL_ALIASES.NAS100.includes('USTEC') &&
  TL_CANDLE_SYMBOL_ALIASES.US30.includes('DJ30') &&
  TL_CANDLE_SYMBOL_ALIASES.US30.includes('WALLST30'));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
