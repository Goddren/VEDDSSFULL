/**
 * Kalshi WEATHER ensemble SHADOW lane — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-weather-shadow.ts
 *
 * No live network and no database writes: ensemble/NWS payload parsing is
 * exercised on synthetic payloads, the member-counting probability reuses
 * the live module's own bucketProbFromMembers, and the shadow isolation
 * (no order path reachable), snapshot recording, and kill switch are
 * pinned by source checks.
 *
 *   A. Member counting: synthetic brackets vs known member pools.
 *   B. ECMWF payload extraction: daily maxima per member, day filtering.
 *   C. NWS parse: daytime high for the target date only, °C guard.
 *   D. Fee + settlement math: win/loss returns, fee % of stake.
 *   E. Entry bar: edge threshold (8¢ = the live engine's weather default),
 *      ask band, spread cap — boundaries on both sides.
 *   F. Bias guard: median-vs-favorite disagreement blocks, agreement passes.
 *   G. Kill switch: KALSHI_WEATHER_ENSEMBLE=off disables the lane.
 *   H. Source pins: lane imports no order path / no authenticated client;
 *      snapshots recorded for every evaluated bracket; resolver closes
 *      only from Kalshi's posted result; ledger arm present; panel wired.
 */
import { readFileSync } from 'node:fs';
import { bucketProbFromMembers } from '../server/services/kalshi-weather';
import {
  weatherEnsembleShadowEnabled, MIN_EDGE_CENTS, extractMemberDailyMaxima, parseNwsForecastHigh,
  weatherFeePct, weatherSettlementReturnPct, weatherEntryQualifies, biasGuardBlocks,
} from '../server/services/kalshi-weather-shadow';
import type { KalshiBTCBracket } from '../server/services/kalshi';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

const bracket = (partial: Partial<KalshiBTCBracket>): KalshiBTCBracket => ({
  ticker: 'T', subtitle: '', strikeType: 'between', floorStrike: null, capStrike: null,
  yesProbability: 50, noProb: 50, hasLiquidity: true, volume: 100, yesAsk: 50, yesBid: 49, ...partial,
});

// A — member counting (the lane's probability IS the live module's counter)
{
  const members = [70, 71, 72, 73, 74, 75, 76, 77, 78, 79]; // 10 members, highs 70–79
  check('A1 between bucket counts members inside the range',
    approx(bucketProbFromMembers(members, bracket({ strikeType: 'between', floorStrike: 72, capStrike: 73 })), 0.2));
  check('A2 greater tail counts members strictly above the floor',
    approx(bucketProbFromMembers(members, bracket({ strikeType: 'greater', floorStrike: 77 })), 0.2));
  check('A3 less tail counts members strictly below the cap',
    approx(bucketProbFromMembers(members, bracket({ strikeType: 'less', capStrike: 72 })), 0.2));
  check('A4 members are rounded before classifying (Kalshi settles on integer highs)',
    approx(bucketProbFromMembers([71.6], bracket({ strikeType: 'between', floorStrike: 72, capStrike: 72 })), 1));
  check('A5 empty pool is 0, never NaN', bucketProbFromMembers([], bracket({})) === 0);
}

// B — ECMWF-style payload extraction
{
  const hourly: Record<string, any> = {
    time: ['2026-11-16T00:00', '2026-11-16T13:00', '2026-11-16T23:00', '2026-11-17T13:00'],
    temperature_2m: [50, 66, 55, 99],
    temperature_2m_member01: [48, 61, 52, 98],
    temperature_2m_member02: [null, null, null, null],
    precipitation: [0, 0, 0, 0],
  };
  const members = extractMemberDailyMaxima(hourly, '2026-11-16');
  check('B1 one daily max per member with data', members.length === 2, `got ${members.length}`);
  check('B2 maxima are per-day (the 99° next-day value is excluded)', members.includes(66) && members.includes(61) && !members.includes(99));
  check('B3 all-null member contributes nothing', !members.some((m) => !Number.isFinite(m)));
  check('B4 missing day yields an empty pool', extractMemberDailyMaxima(hourly, '2026-12-25').length === 0);
}

// C — NWS parse
{
  const periods = [
    { startTime: '2026-11-16T06:00:00-05:00', isDaytime: true, temperature: 67, temperatureUnit: 'F' },
    { startTime: '2026-11-16T18:00:00-05:00', isDaytime: false, temperature: 49, temperatureUnit: 'F' },
    { startTime: '2026-11-17T06:00:00-05:00', isDaytime: true, temperature: 71, temperatureUnit: 'F' },
  ];
  check('C1 picks the target date daytime high', parseNwsForecastHigh(periods, '2026-11-16') === 67);
  check('C2 ignores the night period of the same date', parseNwsForecastHigh(periods, '2026-11-16') !== 49);
  check('C3 unknown date is null, not a guess', parseNwsForecastHigh(periods, '2026-11-20') === null);
  check('C4 °C payloads are converted', parseNwsForecastHigh([{ startTime: '2026-11-16T06:00:00-05:00', isDaytime: true, temperature: 20, temperatureUnit: 'C' }], '2026-11-16') === 68);
}

// D — fee + settlement math
{
  check('D1 fee at a 50¢ entry is 3.5% of stake', approx(weatherFeePct(0.5), 3.5));
  check('D2 fee shrinks as price rises (90¢ → 0.7%)', approx(weatherFeePct(0.9), 0.7));
  check('D3 a YES at 40¢ nets (150% gross − 4.2% fee)', approx(weatherSettlementReturnPct(40, true, weatherFeePct(0.4)), 150 - 4.2));
  check('D4 a NO at 40¢ loses the stake plus the entry fee', approx(weatherSettlementReturnPct(40, false, weatherFeePct(0.4)), -100 - 4.2));
  check('D5 r-multiple convention: return/100 (stake = 1R)', approx(weatherSettlementReturnPct(50, true, 0) / 100, 1));
}

// E — entry bar
{
  const base = { minEdgeCents: 8, minEntryCents: 15, maxEntryCents: 96, spreadMaxCents: 12 };
  check('E1 the lane default edge bar is 8¢ — the live engine weatherMinEdgeCents default', MIN_EDGE_CENTS() === 8);
  check('E2 edge exactly at the bar qualifies', weatherEntryQualifies({ ...base, edgeCents: 8, askCents: 50, spreadCents: 3 }));
  check('E3 edge 1¢ under the bar does not', !weatherEntryQualifies({ ...base, edgeCents: 7, askCents: 50, spreadCents: 3 }));
  check('E4 ask below the entry floor does not', !weatherEntryQualifies({ ...base, edgeCents: 20, askCents: 14, spreadCents: 3 }));
  check('E5 ask above the entry cap does not', !weatherEntryQualifies({ ...base, edgeCents: 20, askCents: 97, spreadCents: 3 }));
  check('E6 a wide spread does not', !weatherEntryQualifies({ ...base, edgeCents: 20, askCents: 50, spreadCents: 13 }));
}

// F — bias guard
{
  const brackets = [
    bracket({ strikeType: 'between', floorStrike: 70, capStrike: 71, yesAsk: 55 }),
    bracket({ strikeType: 'between', floorStrike: 72, capStrike: 73, yesAsk: 30 }),
  ];
  check('F1 median near the favorite mid passes', biasGuardBlocks(70.8, brackets, 3).blocked === false);
  check('F2 median 4° from the favorite mid blocks', biasGuardBlocks(74.5, brackets, 3).blocked === true);
  check('F3 no between brackets → no block (nothing to disagree with)', biasGuardBlocks(90, [bracket({ strikeType: 'greater', floorStrike: 88 })], 3).blocked === false);
}

// G — kill switch
{
  const prev = process.env.KALSHI_WEATHER_ENSEMBLE;
  delete process.env.KALSHI_WEATHER_ENSEMBLE;
  check('G1 lane enabled by default', weatherEnsembleShadowEnabled() === true);
  process.env.KALSHI_WEATHER_ENSEMBLE = 'off';
  check('G2 KALSHI_WEATHER_ENSEMBLE=off disables the lane', weatherEnsembleShadowEnabled() === false);
  if (prev === undefined) delete process.env.KALSHI_WEATHER_ENSEMBLE; else process.env.KALSHI_WEATHER_ENSEMBLE = prev;
}

// H — source pins
{
  const lane = readFileSync(new URL('../server/services/kalshi-weather-shadow.ts', import.meta.url), 'utf8');
  const recorder = readFileSync(new URL('../server/services/kalshi-price-snapshots.ts', import.meta.url), 'utf8');
  const ledger = readFileSync(new URL('../server/services/shadow-ledger.ts', import.meta.url), 'utf8');
  const routes = readFileSync(new URL('../server/routes.ts', import.meta.url), 'utf8');
  const index = readFileSync(new URL('../server/index.ts', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../client/src/pages/kalshi.tsx', import.meta.url), 'utf8');

  const forbidden = ['kalshi-trading', 'createOrder', 'placeKalshi', 'kalshi-credentials', 'decryptApiSecret'];
  check('H1 lane imports no order path / credential store', forbidden.every((f) => !lane.includes(f)),
    forbidden.filter((f) => lane.includes(f)).join(','));
  check('H2 recorder imports no order path either', forbidden.every((f) => !recorder.includes(f)));
  check('H3 lane reuses the live module (export-don\'t-copy)',
    lane.includes("from './kalshi-weather'") && lane.includes('bucketProbFromMembers') && lane.includes('fetchEnsembleDailyMax'));
  check('H4 every evaluated bracket is snapshotted (snapshot pass precedes entries)',
    lane.indexOf('recordKalshiPriceSnapshots(snapRows)') > lane.indexOf('const snapRows'));
  check('H5 resolver closes only from Kalshi\'s posted result',
    lane.includes("st.result === 'yes' || st.result === 'no'") && lane.includes('getKalshiMarketStatus'));
  check('H6 shadow ledger carries the weather arm', ledger.includes("'kalshi_weather_shadow'") && ledger.includes('kalshi_weather_shadow_trades'));
  check('H7 panel route registered', routes.includes('"/api/kalshi-weather-shadow"'));
  check('H8 lane started at boot', index.includes('startKalshiWeatherShadow()'));
  check('H9 panel rendered on the Kalshi page', page.includes('KalshiWeatherShadowPanel'));
  check('H10 kill switch gates the cycle', lane.includes("process.env.KALSHI_WEATHER_ENSEMBLE !== 'off'"));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures) process.exit(1);
