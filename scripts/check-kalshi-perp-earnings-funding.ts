/**
 * Kalshi perp earnings blackout + funding-extremes fade — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-perp-earnings-funding.ts
 *
 * No live network and no database writes: the earnings cycle is driven
 * through injected fake fetchers, the fade decision is exercised on
 * synthetic funding series, and the wiring (blackout before insert,
 * kill switches, shadow isolation, the regime classifier the user kept
 * out of this lane) is pinned by source checks.
 *
 *   A. ET date helpers: ET-midnight resolution across DST both ways.
 *   B. Window math: report today/tomorrow inside 48h, +3 days outside,
 *      a fully-past report day outside; a 24h window narrows correctly.
 *   C. Nasdaq payload parsing: earliest date per symbol, universe
 *      filter, session hints normalized, malformed payload rejected.
 *   D. Fetch-cycle health: one bad day poisons the snapshot (UNKNOWN,
 *      never "no earnings"); symbols outside the fetched universe read
 *      UNKNOWN; a healthy quiet symbol reads known-none.
 *   E. Blackout + stamp decisions: only a KNOWN date inside the window
 *      blocks; unknown stamps NULL, known-none stamps false.
 *   F. Daily cap: two lookups on the same ET day run ONE fetch cycle.
 *   G. Source-health degradation: a throwing fetcher resolves to
 *      UNKNOWN without throwing, and blocks nothing.
 *   H. Funding percentile math on synthetic series.
 *   I. Fade direction: outer-decile positive fades short, outer-decile
 *      negative fades long, mid/zero never fires, deadband sign guards.
 *   J. Minimum-history gate at 29 vs 30 prints.
 *   K. Book assembly: window exclusion, ticker-vs-lane scope choice.
 *   L. Kill switches: KALSHI_PERP_EARNINGS / KALSHI_FUNDING_FADE.
 *   M. Source pins: blackout logged before the trade insert, brain
 *      reason union, funding_fade reachable only from the shadow lane,
 *      no regime-classifier reference in any lane file.
 */
import { readFileSync, readdirSync } from 'node:fs';
import {
  perpEarningsEnabled, etDateString, addDaysToDateStr, etMidnightUtcMs, earningsDateWithinWindow,
  parseNasdaqEarningsDay, runEarningsFetchCycle, lookupInSnapshot, earningsBlockApplies,
  earningsStampValue, getEarningsInfo, UNKNOWN_LOOKUP, type EarningsDayFetcher,
} from '../server/services/kalshi-earnings-calendar';
import {
  fundingFadeEnabled, fundingQuantile, decideFundingFade, assembleFundingFadeBook, fundingFadeForTicker,
} from '../server/services/kalshi-funding-fade';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

// A — ET date helpers
{
  check('A1 ET midnight in EST is 05:00 UTC', etMidnightUtcMs('2026-11-17') === Date.UTC(2026, 10, 17, 5, 0, 0));
  check('A2 ET midnight in EDT is 04:00 UTC', etMidnightUtcMs('2026-07-15') === Date.UTC(2026, 6, 15, 4, 0, 0));
  check('A3 spring-forward day starts in EST', etMidnightUtcMs('2026-03-08') === Date.UTC(2026, 2, 8, 5, 0, 0));
  check('A4 fall-back day starts in EDT', etMidnightUtcMs('2026-11-01') === Date.UTC(2026, 10, 1, 4, 0, 0));
  check('A5 etDateString resolves the ET date', etDateString(Date.UTC(2026, 10, 14, 2, 0, 0)) === '2026-11-13');
  check('A6 addDays crosses month + year', addDaysToDateStr('2026-12-31', 1) === '2027-01-01' && addDaysToDateStr('2026-11-13', 3) === '2026-11-16');
}

// B — window math (now = Fri Nov 13 2026, 10:00 ET)
{
  const now = Date.UTC(2026, 10, 13, 15, 0, 0);
  check('B1 report today is inside 48h', earningsDateWithinWindow('2026-11-13', now, 48));
  check('B2 report tomorrow is inside 48h', earningsDateWithinWindow('2026-11-14', now, 48));
  check('B3 report +2 days is inside 48h of mid-morning', earningsDateWithinWindow('2026-11-15', now, 48));
  check('B4 report +3 days is outside 48h', !earningsDateWithinWindow('2026-11-16', now, 48));
  check('B5 a fully-past report day is outside', !earningsDateWithinWindow('2026-11-12', now, 48));
  check('B6 a 24h window excludes +2 days, keeps tomorrow', !earningsDateWithinWindow('2026-11-15', now, 24) && earningsDateWithinWindow('2026-11-14', now, 24));
}

// C — Nasdaq payload parsing
{
  const payload = {
    data: {
      rows: [
        { symbol: 'NVDA', time: 'time-after-hours', name: 'NVIDIA Corporation' },
        { symbol: 'ZZZZ', time: 'time-premarket', name: 'Not In Universe' },
        { symbol: 'AAPL', time: 'time-not-supplied', name: 'Apple Inc.' },
      ],
    },
  };
  const parsed = parseNasdaqEarningsDay(payload, '2026-11-17', new Set(['AAPL', 'NVDA']));
  check('C1 in-universe symbols parsed with the day date', parsed?.NVDA?.date === '2026-11-17' && parsed?.AAPL?.date === '2026-11-17');
  check('C2 out-of-universe symbols dropped', parsed != null && !('ZZZZ' in parsed));
  check('C3 session hint kept, not-supplied normalized to null', parsed?.NVDA?.time === 'time-after-hours' && parsed?.AAPL?.time === null);
  check('C4 malformed payload (no rows array) rejected', parseNasdaqEarningsDay({ data: {} }, '2026-11-17', new Set(['AAPL'])) === null);
  check('C5 empty rows is a valid quiet day', JSON.stringify(parseNasdaqEarningsDay({ data: { rows: [] } }, '2026-11-17', new Set(['AAPL']))) === '{}');
}

// D — fetch-cycle health semantics
{
  const good: EarningsDayFetcher = async (d) => ({
    data: { rows: d === '2026-11-16' || d === '2026-11-14' ? [{ symbol: 'NVDA', time: 'time-after-hours' }] : [] },
  });
  const snap = await runEarningsFetchCycle(['AAPL', 'NVDA'], '2026-11-13', good);
  check('D1 a clean cycle is healthy with 4 days covered', snap.healthy && snap.days.length === 4);
  const nvda = lookupInSnapshot(snap, 'NVDA');
  check('D2 earliest earnings date wins across the window', nvda.known && nvda.date === '2026-11-14');
  const aapl = lookupInSnapshot(snap, 'AAPL');
  check('D3 a covered symbol with no rows reads known-none', aapl.known && aapl.date === null);
  check('D4 a symbol outside the fetched universe reads UNKNOWN', !lookupInSnapshot(snap, 'TSLA').known);

  const oneBad: EarningsDayFetcher = async (d) => {
    if (d === '2026-11-15') throw new Error('boom');
    return { data: { rows: [] } };
  };
  const snapBad = await runEarningsFetchCycle(['AAPL'], '2026-11-13', oneBad);
  check('D5 one failed day poisons the whole snapshot', !snapBad.healthy && !lookupInSnapshot(snapBad, 'AAPL').known);
  const malformed: EarningsDayFetcher = async () => ({ nope: true });
  const snapMal = await runEarningsFetchCycle(['AAPL'], '2026-11-13', malformed);
  check('D6 malformed days poison the snapshot the same way', !snapMal.healthy && !lookupInSnapshot(snapMal, 'AAPL').known);
}

// E — blackout + stamp decisions
{
  const now = Date.UTC(2026, 10, 13, 15, 0, 0);
  const inWin = { known: true, date: '2026-11-14', time: null } as const;
  const outWin = { known: true, date: '2026-11-20', time: null } as const;
  const none = { known: true, date: null, time: null } as const;
  check('E1 known date inside the window blocks', earningsBlockApplies(inWin, now, 48));
  check('E2 known date outside the window does not block', !earningsBlockApplies(outWin, now, 48));
  check('E3 known-none never blocks', !earningsBlockApplies(none, now, 48));
  check('E4 UNKNOWN never blocks', !earningsBlockApplies(UNKNOWN_LOOKUP, now, 48));
  check('E5 stamp: unknown -> null', earningsStampValue(UNKNOWN_LOOKUP, now) === null);
  check('E6 stamp: known-none -> false', earningsStampValue(none, now) === false);
  check('E7 stamp: date inside 48h -> true', earningsStampValue(inWin, now) === true);
  check('E8 stamp: date beyond 48h -> false', earningsStampValue(outWin, now) === false);
}

// F — one fetch cycle per ET day (counting fetcher)
{
  let calls = 0;
  const counting: EarningsDayFetcher = async () => { calls++; return { data: { rows: [] } }; };
  const now = Date.UTC(2026, 11, 20, 15, 0, 0); // ET 2026-12-20
  const a = await getEarningsInfo('AAPL', ['AAPL'], now, counting);
  const after1 = calls;
  const b = await getEarningsInfo('AAPL', ['AAPL'], now, counting);
  check('F1 first lookup runs exactly one 4-day cycle', after1 === 4, `${after1} fetches`);
  check('F2 second lookup the same ET day fetches nothing more', calls === 4, `${calls} fetches`);
  check('F3 lookups from the shared cycle are known', a.known && b.known);
}

// G — source-health degradation through the lane-facing lookup
{
  const down: EarningsDayFetcher = async () => { throw new Error('source down'); };
  const now = Date.UTC(2026, 11, 21, 15, 0, 0); // ET 2026-12-21 — a fresh cycle day
  const info = await getEarningsInfo('AAPL', ['AAPL'], now, down);
  check('G1 a throwing source resolves UNKNOWN without throwing', !info.known);
  check('G2 and blocks nothing', !earningsBlockApplies(info, now, 48));
}

// H — funding percentile math
{
  const s = Array.from({ length: 100 }, (_, i) => i + 1);
  check('H1 p10 of 1..100 is 10.9', Math.abs(fundingQuantile(s, 0.1) - 10.9) < 1e-9);
  check('H2 p90 of 1..100 is 90.1', Math.abs(fundingQuantile(s, 0.9) - 90.1) < 1e-9);
  check('H3 single-element and empty series are safe', fundingQuantile([7], 0.9) === 7 && fundingQuantile([], 0.5) === 0);
}

// I — fade direction on both tails
{
  const dist = Array.from({ length: 100 }, (_, i) => (i - 50) / 10_000); // -0.0050 .. +0.0049
  const top = decideFundingFade(0.0049, dist, 'lane', 30);
  check('I1 top-decile positive funding fades SHORT', top?.direction === 'short' && top.n === 100);
  const bottom = decideFundingFade(-0.005, dist, 'lane', 30);
  check('I2 bottom-decile negative funding fades LONG', bottom?.direction === 'long');
  check('I3 a mid-distribution rate never fires', decideFundingFade(0.001, dist, 'lane', 30) === null);
  check('I4 a zero rate never fires', decideFundingFade(0, dist, 'lane', 30) === null);
  const deadbandTop = [...Array(95).fill(0), ...Array(5).fill(-0.001)];
  check('I5 sign guard: p90 of 0 is not a crowded long', decideFundingFade(0.001, deadbandTop, 'lane', 30) === null);
  const deadbandBottom = [...Array(95).fill(0), ...Array(5).fill(0.001)];
  check('I6 sign guard: p10 of 0 is not a crowded short', decideFundingFade(-0.001, deadbandBottom, 'lane', 30) === null);
}

// J — minimum-history gate
{
  const dist29 = Array.from({ length: 29 }, (_, i) => (i - 14) / 10_000);
  check('J1 29 prints cannot fire even at the extreme', decideFundingFade(0.0014, dist29, 'ticker', 30) === null);
  const dist30 = [...dist29, 0.0015];
  check('J2 30 prints can fire', decideFundingFade(0.0015, dist30, 'ticker', 30)?.direction === 'short');
  check('J3 no history for the ticker means no signal', decideFundingFade(null, dist30, 'ticker', 30) === null);
}

// K — book assembly + scope selection
{
  const now = Date.UTC(2026, 10, 13, 15, 0, 0);
  const day = 24 * 3_600_000;
  const aHist = Array.from({ length: 35 }, (_, i) => ({ fundingTimeMs: now - (35 - i) * day, rate: (i - 17) / 10_000 }));
  const bHist = [
    { fundingTimeMs: now - 100 * day, rate: 0.02 }, // stale — outside the 90d window
    { fundingTimeMs: now - 2 * day, rate: 0.001 },
    { fundingTimeMs: now - 1 * day, rate: 0.001 },
    { fundingTimeMs: now, rate: 0.006 },
  ];
  const book = assembleFundingFadeBook(new Map([['KXAAA', aHist], ['KXBBB', bHist]]), now, 90);
  check('K1 stale prints are excluded from series + pool', book.byTicker.get('KXBBB')!.series.length === 3 && book.pool.length === 38, `pool=${book.pool.length}`);
  check('K2 latest rate is the most recent print regardless of window', book.byTicker.get('KXBBB')!.latestRate === 0.006);
  const aSig = fundingFadeForTicker('KXAAA', book, 30);
  check('K3 a deep own history is judged on the ticker scope', aSig?.scope === 'ticker' && aSig?.direction === 'short');
  const bSig = fundingFadeForTicker('KXBBB', book, 30);
  check('K4 a thin history falls back to the lane pool', bSig?.scope === 'lane' && bSig?.direction === 'short');
  check('K5 an unknown ticker gets no signal', fundingFadeForTicker('KXZZZ', book, 30) === null);
}

// L — kill switches
{
  const savedE = process.env.KALSHI_PERP_EARNINGS;
  const savedF = process.env.KALSHI_FUNDING_FADE;
  delete process.env.KALSHI_PERP_EARNINGS; delete process.env.KALSHI_FUNDING_FADE;
  check('L1 both features default ON', perpEarningsEnabled() && fundingFadeEnabled());
  process.env.KALSHI_PERP_EARNINGS = 'off'; process.env.KALSHI_FUNDING_FADE = 'off';
  check('L2 KALSHI_PERP_EARNINGS=off disables the blackout', !perpEarningsEnabled());
  check('L3 KALSHI_FUNDING_FADE=off disables the fade', !fundingFadeEnabled());
  if (savedE === undefined) delete process.env.KALSHI_PERP_EARNINGS; else process.env.KALSHI_PERP_EARNINGS = savedE;
  if (savedF === undefined) delete process.env.KALSHI_FUNDING_FADE; else process.env.KALSHI_FUNDING_FADE = savedF;
}

// M — source pins
{
  const lane = readFileSync(new URL('../server/services/kalshi-stock-shadow.ts', import.meta.url), 'utf8');
  const brain = readFileSync(new URL('../server/services/kalshi-perp-brain.ts', import.meta.url), 'utf8');
  const earn = readFileSync(new URL('../server/services/kalshi-earnings-calendar.ts', import.meta.url), 'utf8');
  const fade = readFileSync(new URL('../server/services/kalshi-funding-fade.ts', import.meta.url), 'utf8');
  check('M1 lane pushes the funding_fade signal into the shared entry machinery', lane.includes("strategy: 'funding_fade'") && lane.includes('fundingFadeForTicker'));
  check('M2 lane logs the blackout with the earnings reason', lane.includes("reason: 'earnings'") && lane.includes('earningsBlockApplies'));
  check('M3 the blackout is consulted BEFORE the trade insert', lane.indexOf("reason: 'earnings'") < lane.indexOf('INSERT INTO kalshi_perp_shadow_trades') && lane.indexOf('earningsBlockApplies') < lane.indexOf('INSERT INTO kalshi_perp_shadow_trades'));
  check('M4 the context stamp uses the real lookup, not the old null', lane.includes('earningsStampValue') && !lane.includes('null, pendingCa.has(mkt.ticker)'));
  check('M5 brain block-reason union carries earnings', brain.includes("'brain_avoid' | 'vp_edge' | 'earnings'"));
  check('M6 earnings source is the Nasdaq public calendar', earn.includes('api.nasdaq.com/api/calendar/earnings'));
  check('M7 neither new module touches the authenticated Kalshi client', !earn.includes('kalshi-trading') && !fade.includes('kalshi-trading'));
  check('M8 the lane still imports no authenticated Kalshi client', !lane.includes("from './kalshi-trading'"));
  const offenders: string[] = [];
  for (const f of readdirSync(new URL('../server/services/', import.meta.url))) {
    if (!f.endsWith('.ts')) continue;
    if (f === 'kalshi-stock-shadow.ts' || f === 'kalshi-funding-fade.ts') continue;
    if (readFileSync(new URL(`../server/services/${f}`, import.meta.url), 'utf8').includes('funding_fade')) offenders.push(f);
  }
  check('M9 funding_fade is reachable only from the shadow lane + its module', offenders.length === 0, offenders.join(','));
  const markov = /markov/i;
  check('M10 no regime-classifier reference in any lane file (user kept it out)',
    !markov.test(lane) && !markov.test(brain) && !markov.test(earn) && !markov.test(fade));
}

console.log(`\n${total - failures}/${total} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
