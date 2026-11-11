/**
 * Sniper-ORB + ORB news window — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-sniper-orb.ts
 *
 * No database, broker, or market-data calls: everything exercised here is
 * pure (candle math, news-window math, the rules-score term).
 *
 *   A. computeOrbStateFromCandles — the helper extracted from
 *      runORBAutonomousScan — reproduces the ORIGINAL inline lane logic
 *      exactly: targeted scenarios + 2,000 randomized candle series,
 *      diffed field-by-field against a verbatim copy of the old code.
 *   B. News gate: 45 min after a major CPI print the standard verdict
 *      blocks while the ORB verdict allows (the PR #45 follow-up case);
 *      pre-release + non-major handling identical for both;
 *      ORB_NEWS_SHORTEN=off restores the uniform window;
 *      NEWS_MAJOR_POST_MINUTES_ORB is honored; NEWS_WIDEN=off collapses
 *      both to the pre-#45 behavior.
 *   C. Rules score: the ORB-retest term pays out only on an active retest
 *      in the breakout direction.
 *   D. isOrbOriginDecision: orb_breakout + marked sniper decisions only.
 */
import { scoreFxPair, type RulesInputs } from '../server/services/fx-rules-score';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const {
  computeOrbStateFromCandles, getNYTime,
  newsBlackoutVerdicts, newsGateBlocks, isOrbOriginDecision,
} = await import('../server/services/live-trading-engine');

type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };

// NY wall-clock → UTC ms (9:30 AM is never inside a DST transition window,
// so one correction pass is exact).
function nyWallToUtcMs(dateStr: string, h: number, mi: number): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, mo - 1, d, h, mi);
  const got = getNYTime(t);
  t += ((h * 60 + mi) - (got.hour * 60 + got.minute)) * 60000;
  return t;
}

// Build newest-first M5 candles from an oldest-first spec of NY wall times.
function buildCandles(dateStr: string, spec: Array<[number, number, number, number, number, number]>): Candle[] {
  const oldestFirst = spec.map(([h, mi, o, hi, lo, c]) => ({
    t: Math.floor(nyWallToUtcMs(dateStr, h, mi) / 1000), o, h: hi, l: lo, c, v: 100,
  }));
  // sanity: every candle really lands on the intended NY date
  for (const c of oldestFirst) {
    if (getNYTime(c.t * 1000).dateStr !== dateStr) throw new Error(`candle date mismatch for ${dateStr}`);
  }
  return [...oldestFirst].reverse();
}

// ── A0. Verbatim copy of the ORIGINAL inline lane logic (pre-extraction) ──
// Copied from runORBAutonomousScan as it stood on main bb7933bb (sections
// 3–5: range, breakout, retest). Returns the lane's decision-relevant result.
function referenceLaneLogic(m5BC: Candle[], currentPrice: number, todayKey: string) {
  let orbHigh = 0, orbLow = 0;
  const orbCandles = m5BC.filter(c => {
    if (!c.t) return false;
    const nyC = getNYTime(c.t * 1000);
    return nyC.dateStr === todayKey && nyC.hour === 9 && nyC.minute >= 30 && nyC.minute < 45;
  });
  if (orbCandles.length > 0) {
    orbHigh = Math.max(...orbCandles.map(c => c.h));
    orbLow  = Math.min(...orbCandles.map(c => c.l));
  }
  if (orbHigh === 0 || orbLow === 0 || orbHigh <= orbLow) {
    return { fires: false as const, why: 'no_range' as const };
  }
  const orbRange = orbHigh - orbLow;
  const retestBuffer = orbRange * 0.25;
  let breakoutDir: 'BUY' | 'SELL' | null = null;
  const postORBCandles = m5BC.filter(c => {
    if (!c.t) return false;
    const nyC = getNYTime(c.t * 1000);
    return nyC.dateStr === todayKey && (nyC.hour * 60 + nyC.minute) >= 9 * 60 + 45;
  });
  for (const c of postORBCandles.slice(1)) { // skip the most recent (live)
    const bodyHigh = Math.max(c.o, c.c);
    const bodyLow  = Math.min(c.o, c.c);
    if (bodyLow > orbHigh) { breakoutDir = 'BUY'; break; }
    if (bodyHigh < orbLow) { breakoutDir = 'SELL'; break; }
  }
  if (!breakoutDir) return { fires: false as const, why: 'no_breakout' as const, orbHigh, orbLow, orbRange };
  const isRetestLong = breakoutDir === 'BUY' &&
    currentPrice >= orbHigh - retestBuffer &&
    currentPrice <= orbHigh + retestBuffer;
  const isRetestShort = breakoutDir === 'SELL' &&
    currentPrice >= orbLow - retestBuffer &&
    currentPrice <= orbLow + retestBuffer;
  if (!isRetestLong && !isRetestShort) {
    return { fires: false as const, why: 'no_retest' as const, orbHigh, orbLow, orbRange, breakoutDir };
  }
  return { fires: true as const, why: 'retest' as const, orbHigh, orbLow, orbRange, breakoutDir };
}

function statesMatch(m5BC: Candle[], price: number, dateStr: string): boolean {
  const ref = referenceLaneLogic(m5BC, price, dateStr);
  const st = computeOrbStateFromCandles(m5BC, price, dateStr);
  if (ref.why === 'no_range') return st.phase === 'no_range' && st.orbHigh === 0 && st.retestActive === false;
  if (st.orbHigh !== ref.orbHigh || st.orbLow !== ref.orbLow || st.range !== ref.orbRange) return false;
  if (ref.why === 'no_breakout') return st.phase === 'awaiting_breakout' && st.breakoutDir === null && st.retestActive === false;
  if (st.breakoutDir !== ref.breakoutDir) return false;
  if (ref.why === 'no_retest') return st.phase === 'breakout' && st.retestActive === false;
  return st.phase === 'retest' && st.retestActive === true;
}

// ── A1. Targeted scenarios (EST date) ─────────────────────────────────────
const D = '2026-11-10'; // Tuesday, EST
const rangeCandles: Array<[number, number, number, number, number, number]> = [
  [9, 30, 1.1000, 1.1010, 1.0998, 1.1005],
  [9, 35, 1.1005, 1.1012, 1.1000, 1.1008],
  [9, 40, 1.1008, 1.1011, 1.1001, 1.1006],
]; // → orbHigh 1.1012, orbLow 1.0998, range 0.0014, buffer 0.00035

{
  const candles = buildCandles(D, [
    ...rangeCandles,
    [9, 45, 1.1006, 1.1010, 1.1002, 1.1007],
    [9, 50, 1.1015, 1.1026, 1.1014, 1.1025], // full-body close above orbHigh → BUY breakout
    [9, 55, 1.1020, 1.1022, 1.1010, 1.1011], // live candle (skipped by breakout scan)
  ]);
  const st = computeOrbStateFromCandles(candles, 1.1011, D);
  check('A1 BUY breakout + retest', st.phase === 'retest' && st.breakoutDir === 'BUY' && st.retestActive,
    `phase=${st.phase} dir=${st.breakoutDir}`);
  check('A1 helper == reference', statesMatch(candles, 1.1011, D));
  const far = computeOrbStateFromCandles(candles, 1.1050, D);
  check('A2 breakout, price ran away → no retest', far.phase === 'breakout' && far.retestActive === false);
  check('A2 helper == reference', statesMatch(candles, 1.1050, D));
}
{
  const candles = buildCandles(D, [
    ...rangeCandles,
    [9, 45, 1.1006, 1.1010, 1.1002, 1.1007],
    [9, 50, 1.0995, 1.0997, 1.0984, 1.0986], // full-body close below orbLow → SELL breakout
    [9, 55, 1.0992, 1.1001, 1.0990, 1.0999],
  ]);
  const st = computeOrbStateFromCandles(candles, 1.0999, D);
  check('A3 SELL breakout + retest', st.phase === 'retest' && st.breakoutDir === 'SELL' && st.retestActive);
  check('A3 helper == reference', statesMatch(candles, 1.0999, D));
}
{
  const candles = buildCandles(D, [
    ...rangeCandles,
    [9, 45, 1.1006, 1.1010, 1.1002, 1.1007],
    [9, 50, 1.1007, 1.1011, 1.1001, 1.1005], // body stays inside the range
    [9, 55, 1.1005, 1.1009, 1.1000, 1.1004],
  ]);
  const st = computeOrbStateFromCandles(candles, 1.1004, D);
  check('A4 no breakout yet', st.phase === 'awaiting_breakout' && st.breakoutDir === null);
  check('A4 helper == reference', statesMatch(candles, 1.1004, D));
}
{
  // Wick pierces the range but the BODY closes inside → not a breakout.
  const candles = buildCandles(D, [
    ...rangeCandles,
    [9, 45, 1.1006, 1.1010, 1.1002, 1.1007],
    [9, 50, 1.1008, 1.1030, 1.1006, 1.1010],
    [9, 55, 1.1010, 1.1012, 1.1004, 1.1006],
  ]);
  const st = computeOrbStateFromCandles(candles, 1.1006, D);
  check('A5 wick-only pierce is not a breakout', st.phase === 'awaiting_breakout');
  check('A5 helper == reference', statesMatch(candles, 1.1006, D));
}
{
  // Only ONE post-9:45 candle and it is the live one → slice(1) skips it.
  const candles = buildCandles(D, [
    ...rangeCandles,
    [9, 45, 1.1015, 1.1026, 1.1014, 1.1025],
  ]);
  const st = computeOrbStateFromCandles(candles, 1.1020, D);
  check('A6 live candle alone cannot confirm a breakout', st.phase === 'awaiting_breakout');
  check('A6 helper == reference', statesMatch(candles, 1.1020, D));
}
{
  const candles = buildCandles(D, [
    [10, 0, 1.1000, 1.1010, 1.0998, 1.1005],
    [10, 5, 1.1005, 1.1012, 1.1000, 1.1008],
  ]);
  const st = computeOrbStateFromCandles(candles, 1.1008, D);
  check('A7 no 9:30 candles → no_range', st.phase === 'no_range' && st.orbHigh === 0);
  check('A7 helper == reference', statesMatch(candles, 1.1008, D));
}

// ── A8. Randomized differential fuzz (EST + EDT dates) ────────────────────
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
{
  const rnd = mulberry32(20261111);
  let mismatches = 0;
  const phases = new Set<string>();
  for (let iter = 0; iter < 2000; iter++) {
    const dateStr = iter % 2 === 0 ? '2026-11-10' : '2026-06-15'; // EST / EDT
    const base = 1.05 + rnd() * 0.4;
    const spec: Array<[number, number, number, number, number, number]> = [];
    const mk = (h: number, mi: number, center: number, spread: number) => {
      const o = center + (rnd() - 0.5) * spread;
      const c = center + (rnd() - 0.5) * spread;
      const hi = Math.max(o, c) + rnd() * spread * 0.6;
      const lo = Math.min(o, c) - rnd() * spread * 0.6;
      spec.push([h, mi, o, hi, lo, c]);
    };
    for (const mi of [30, 35, 40]) mk(9, mi, base, 0.002);
    const nPost = Math.floor(rnd() * 9); // 0–8 post-range candles
    for (let k = 0; k < nPost; k++) {
      const mins = 45 + k * 5;
      mk(9 + Math.floor(mins / 60), mins % 60, base + (rnd() - 0.42) * 0.006, 0.003);
    }
    const candles = buildCandles(dateStr, spec);
    const price = base + (rnd() - 0.45) * 0.006;
    phases.add(computeOrbStateFromCandles(candles, price, dateStr).phase);
    if (!statesMatch(candles, price, dateStr)) {
      mismatches++;
      if (mismatches <= 3) console.log('  fuzz mismatch at iter', iter, JSON.stringify({ dateStr, price }));
    }
  }
  check('A8 fuzz: helper == reference on 2000 randomized series', mismatches === 0, `mismatches=${mismatches}`);
  check('A8 fuzz covered every phase', ['no_range', 'awaiting_breakout', 'breakout', 'retest'].every(p => phases.has(p as any) || p === 'no_range'),
    `phases seen: ${[...phases].join(', ')}`);
}

// ── B. News gate windows ──────────────────────────────────────────────────
const MIN = 60000;
const CPI = 'Consumer Price Index (CPI) m/m';
{
  // The required case: 45 min after a major CPI print.
  const v = newsBlackoutVerdicts(-45 * MIN, CPI);
  check('B1 standard verdict blocks 45m after CPI (90m window)', v.standard === true);
  check('B2 ORB verdict allows 45m after CPI (30m window)', v.orb === false);
  const ctx: any = { highImpactSoon: v.standard, highImpactSoonOrb: v.orb };
  check('B3 gate blocks a normal strategy decision', newsGateBlocks(ctx, false) === true);
  check('B4 gate allows an orb_breakout decision', newsGateBlocks(ctx, isOrbOriginDecision({ strategy: 'orb_breakout' })) === false);
  check('B5 gate allows a marked prop_firm_sniper decision', newsGateBlocks(ctx, isOrbOriginDecision({ strategy: 'prop_firm_sniper', orbSetup: true })) === false);
  check('B6 gate still blocks an UNMARKED sniper decision', newsGateBlocks(ctx, isOrbOriginDecision({ strategy: 'sniper' })) === true);
}
{
  const v20 = newsBlackoutVerdicts(-20 * MIN, CPI);
  check('B7 20m after CPI: both verdicts block', v20.standard === true && v20.orb === true);
  const v29 = newsBlackoutVerdicts(-29 * MIN, CPI);
  const v31 = newsBlackoutVerdicts(-31 * MIN, CPI);
  check('B8 ORB window boundary: blocked at 29m, clear at 31m', v29.orb === true && v31.orb === false);
  const vPre = newsBlackoutVerdicts(60 * MIN, CPI); // 1h BEFORE the print
  check('B9 pre-release window identical (both block)', vPre.standard === true && vPre.orb === true);
  const vFar = newsBlackoutVerdicts(150 * MIN, CPI); // 2.5h before → outside 2h pre-window
  check('B10 outside the 2h pre-window: both clear', vFar.standard === false && vFar.orb === false);
}
{
  // Non-major high-impact event: 5-min post window for everyone.
  const v45 = newsBlackoutVerdicts(-45 * MIN, 'Durable Goods Orders m/m');
  check('B11 non-major at +45m: both clear', v45.standard === false && v45.orb === false);
  const v3 = newsBlackoutVerdicts(-3 * MIN, 'Durable Goods Orders m/m');
  check('B12 non-major at +3m: both block', v3.standard === true && v3.orb === true);
  // ADP is explicitly never major-tier (PR #45 rule).
  const vAdp = newsBlackoutVerdicts(-45 * MIN, 'ADP Nonfarm Employment Change');
  check('B13 ADP at +45m: both clear (never major)', vAdp.standard === false && vAdp.orb === false);
  // FOMC afternoon case from the brief.
  const vFomc = newsBlackoutVerdicts(-45 * MIN, 'Federal Funds Rate');
  check('B14 FOMC at +45m: standard blocks, ORB allows', vFomc.standard === true && vFomc.orb === false);
}
{
  process.env.ORB_NEWS_SHORTEN = 'off';
  const v = newsBlackoutVerdicts(-45 * MIN, CPI);
  check('B15 ORB_NEWS_SHORTEN=off → uniform 90m (ORB blocks too)', v.orb === true && v.standard === true);
  delete process.env.ORB_NEWS_SHORTEN;

  process.env.NEWS_MAJOR_POST_MINUTES_ORB = '120';
  const v2 = newsBlackoutVerdicts(-45 * MIN, CPI);
  check('B16 NEWS_MAJOR_POST_MINUTES_ORB=120 → ORB blocks at +45m', v2.orb === true);
  delete process.env.NEWS_MAJOR_POST_MINUTES_ORB;

  process.env.NEWS_WIDEN = 'off';
  const v3 = newsBlackoutVerdicts(-45 * MIN, CPI);
  check('B17 NEWS_WIDEN=off → pre-#45 behavior for everyone', v3.standard === false && v3.orb === false);
  delete process.env.NEWS_WIDEN;

  check('B18 no context → gate open (fail-open, as today)', newsGateBlocks(undefined, true) === false && newsGateBlocks(null, false) === false);
  const legacyCtx: any = { highImpactSoon: true }; // no ORB field → fall back to standard
  check('B19 context without ORB verdict falls back to standard', newsGateBlocks(legacyCtx, true) === true);
}

// ── C. Rules-score ORB term ───────────────────────────────────────────────
{
  const base: RulesInputs = {
    symbol: 'EURUSD', bull: 5, bear: 2, dayType: 'trend',
    h1: 'BULLISH', h4: 'BULLISH', adx: 30, m15Trend: 'BULLISH',
    strategy: 'sniper', strategyPriority: 'high', minConfluences: 4,
    brainEdge: null, brainFail: null, pace: null, model: null,
    newsSoon: false, relVolume: 1.2,
  };
  const noOrb = scoreFxPair({ ...base });
  const withOrb = scoreFxPair({ ...base, orbRetest: true, orbDirection: 'BUY' });
  const againstOrb = scoreFxPair({ ...base, orbRetest: true, orbDirection: 'SELL' });
  const noRetest = scoreFxPair({ ...base, orbRetest: false, orbDirection: 'BUY' });
  check('C1 retest in breakout direction pays +6', withOrb.terms.orb === 6 && withOrb.score === noOrb.score + 6,
    `orb term=${withOrb.terms.orb}, score ${noOrb.score}→${withOrb.score}`);
  check('C2 retest AGAINST the pick direction pays 0', againstOrb.terms.orb === 0 && againstOrb.score === noOrb.score);
  check('C3 breakout without an active retest pays 0', noRetest.terms.orb === 0 && noRetest.score === noOrb.score);
  check('C4 no ORB inputs → term 0 (score unchanged)', noOrb.terms.orb === 0);
}

// ── D. ORB-origin marker ──────────────────────────────────────────────────
{
  check('D1 orb_breakout is ORB-origin', isOrbOriginDecision({ strategy: 'orb_breakout' }) === true);
  check('D2 marked sniper is ORB-origin', isOrbOriginDecision({ strategy: 'sniper', orbSetup: true }) === true);
  check('D3 marked prop_firm_sniper is ORB-origin', isOrbOriginDecision({ strategy: 'prop_firm_sniper', orbSetup: true }) === true);
  check('D4 unmarked sniper is not', isOrbOriginDecision({ strategy: 'sniper' }) === false);
  check('D5 marker on a non-sniper label does not count', isOrbOriginDecision({ strategy: 'momentum', orbSetup: true }) === false);
  check('D6 plain momentum is not', isOrbOriginDecision({ strategy: 'momentum' }) === false);
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures ? 1 : 0);
