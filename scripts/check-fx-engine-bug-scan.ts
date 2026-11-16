/**
 * FX engine bug scan (Nov 2026) — verification checks for the fixes.
 *
 * Run:  node --import tsx/esm scripts/check-fx-engine-bug-scan.ts
 *
 * No database, broker, or market-data calls: everything exercised here is
 * pure (time parsing, pip math, slice keys, candle-time coercion, trail
 * math, price grids, DST offsets).
 *
 *   A. parseNewsEventTime — Finnhub's real full-datetime format parses
 *      (the old HH:MM-only parse NaN'd on it and the whole news blackout
 *      never engaged); bare HH:MM still works; junk returns null. Plus an
 *      end-to-end verdict: a major print 45 min ago blocks the standard
 *      gate (90-min window) but not ORB (30-min window).
 *   B. fxMarketClosedFor — the weekend window follows the ET wall clock
 *      (Fri 17:00 → Sun 17:00 ET) in both EST and EDT weeks.
 *   C. getPipValue / getPipSize — broker letter-suffixed symbols resolve
 *      their quote conversion instead of falling back to a flat $10.
 *   D. Gate-calibration sliceKey — broker-suffixed and clean spellings of
 *      one instrument share a slice.
 *   E. coerceEpochSeconds / normalizeCandle — ms, seconds, numeric-string
 *      and ISO candle times all land in epoch seconds.
 *   F. computeChandelierSL — the no-ATR fallback is 50 pips in the pair's
 *      own pip size (identical to the old values for FX/JPY; sane for
 *      gold/indices instead of ~$0.0075).
 *   G. priceDecimals — oil/gas round onto their real grids, not 5dp.
 *   H. getNYOffset (ICT) — the second Sunday of March is right even when
 *      Mar 1 is a Sunday (Mar 8–14, 2026 was off by an hour).
 *   I. fx-models pipSize — canonical values beyond the default universe.
 */
import { getPipSize, getPipValue } from '../server/utils/pipUtils';
import { sliceKey } from '../server/services/gate-calibration';
import { coerceEpochSeconds, normalizeCandle } from '../server/utils/candleNormalize';
import { priceDecimals, roundToTick } from '../server/tradelocker';
import { getNYOffset } from '../server/utils/ictMacroUtils';
import { pipSize as modelPipSize } from '../server/services/fx-models';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

const {
  parseNewsEventTime, newsBlackoutVerdicts, fxMarketClosedFor, computeChandelierSL,
} = await import('../server/services/live-trading-engine');

// ── A. News event time parsing ─────────────────────────────────────────────
const T_0830 = Date.UTC(2026, 10, 10, 8, 30, 0);
check('A1 Finnhub space datetime', parseNewsEventTime('2026-11-10 08:30:00') === T_0830);
check('A2 ISO datetime', parseNewsEventTime('2026-11-10T08:30:00') === T_0830);
check('A3 ISO with Z', parseNewsEventTime('2026-11-10T08:30:00Z') === T_0830);
check('A4 bare HH:MM pins to today UTC', parseNewsEventTime('08:30', T_0830) === T_0830);
check('A5 empty → null', parseNewsEventTime('') === null);
check('A6 junk → null', parseNewsEventTime('TBD') === null);
check('A7 impossible HH:MM → null', parseNewsEventTime('25:99') === null);
{
  // CPI printed 45 min ago: standard blackout (90m) still on, ORB (30m) off.
  const now = Date.UTC(2026, 10, 10, 13, 15, 0);
  const evMs = parseNewsEventTime('2026-11-10 12:30:00', now);
  const v = evMs != null ? newsBlackoutVerdicts(evMs - now, 'CPI', { widenEnabled: true, majorPostMin: 90, orbPostMin: 30 }) : null;
  check('A8 parsed major print drives verdicts', !!v && v.standard === true && v.orb === false,
    v ? `standard=${v.standard} orb=${v.orb}` : 'no verdict');
}

// ── B. Weekend market-closed window (ET) ───────────────────────────────────
check('B1 EST Sun 21:30 UTC (16:30 ET) closed', fxMarketClosedFor('EURUSD', new Date('2026-01-18T21:30:00Z')) === true);
check('B2 EST Sun 22:30 UTC (17:30 ET) open', fxMarketClosedFor('EURUSD', new Date('2026-01-18T22:30:00Z')) === false);
check('B3 EDT Sun 21:30 UTC (17:30 ET) open', fxMarketClosedFor('EURUSD', new Date('2026-07-19T21:30:00Z')) === false);
check('B4 EDT Fri 21:30 UTC (17:30 ET) closed', fxMarketClosedFor('EURUSD', new Date('2026-07-17T21:30:00Z')) === true);
check('B5 EDT Fri 20:30 UTC (16:30 ET) open', fxMarketClosedFor('EURUSD', new Date('2026-07-17T20:30:00Z')) === false);
check('B6 Saturday closed', fxMarketClosedFor('EURUSD', new Date('2026-07-18T12:00:00Z')) === true);
check('B7 crypto never closed', fxMarketClosedFor('BTCUSD', new Date('2026-07-18T12:00:00Z')) === false);

// ── C. Pip value with broker suffixes ──────────────────────────────────────
check('C1 EURUSDm = $10', getPipValue('EURUSDm') === 10);
check('C2 USDJPYm ≈ $7.14 (fallback 140)', near(getPipValue('USDJPYm'), 1000 / 140, 0.02), `got ${getPipValue('USDJPYm')}`);
check('C3 EURGBPm ≈ $13.60 (fallback GBPUSD 1.36)', near(getPipValue('EURGBPm'), 13.6, 0.05), `got ${getPipValue('EURGBPm')}`);
check('C4 clean USDJPY unchanged', near(getPipValue('USDJPY'), 1000 / 140, 0.02));
check('C5 dotted suffix still fine', getPipValue('EURUSD.pro') === 10);
check('C6 pip sizes', getPipSize('XAGUSD') === 0.001 && getPipSize('USTEC') === 1 && getPipSize('ETHUSD') === 0.01 && getPipSize('USOIL') === 0.01);

// ── D. Gate-calibration slice keys ─────────────────────────────────────────
check('D1 suffixed taken symbol normalises', sliceKey('XAUUSD.PRO', 'London') === 'XAUUSD|London');
check('D2 clean symbol unchanged', sliceKey('EURUSD', 'London') === 'EURUSD|London' && sliceKey('EURUSD', null) === 'EURUSD|*');
check('D3 slash spelling normalises', sliceKey('GBP/JPY', 'New York') === 'GBPJPY|New York');

// ── E. Candle time coercion ────────────────────────────────────────────────
check('E1 ms → s', coerceEpochSeconds(1760000000000) === 1760000000);
check('E2 s stays s', coerceEpochSeconds(1760000000) === 1760000000);
check('E3 numeric string ms → s', coerceEpochSeconds('1760000000000') === 1760000000);
check('E4 ISO string → s', coerceEpochSeconds('2026-11-10T08:30:00Z') === Math.floor(T_0830 / 1000));
{
  const n = normalizeCandle({ t: 1760000000000, open: 1, high: 2, low: 0.5, close: 1.5 });
  check('E5 normalizeCandle coerces t, keeps OHLC', n.t === 1760000000 && n.c === 1.5 && n.o === 1);
}

// ── F. Chandelier fallback distance ────────────────────────────────────────
{
  const buy = { symbol: 'XAUUSD', direction: 'BUY', currentPrice: 2600, sl: 0 };
  const sl = computeChandelierSL(buy, 0, 1.5, { highestHigh: 2600, lowestLow: 0 });
  check('F1 gold fallback = 50 pips × 1.5', near(sl, 2600 - 7.5, 0.001), `got ${sl}`);
  const fx = { symbol: 'EURUSD', direction: 'BUY', currentPrice: 1.1, sl: 0 };
  const slFx = computeChandelierSL(fx, 0, 1.5, { highestHigh: 1.1, lowestLow: 0 });
  check('F2 EURUSD fallback identical to old (0.0050)', near(slFx, 1.1 - 0.0075, 1e-9), `got ${slFx}`);
  const jpy = { symbol: 'USDJPY', direction: 'BUY', currentPrice: 150, sl: 0 };
  const slJpy = computeChandelierSL(jpy, 0, 1.5, { highestHigh: 150, lowestLow: 0 });
  check('F3 USDJPY fallback identical to old (0.50)', near(slJpy, 150 - 0.75, 1e-9), `got ${slJpy}`);
  const slAtr = computeChandelierSL(buy, 3, 1.5, { highestHigh: 2600, lowestLow: 0 });
  check('F4 live ATR wins over fallback', near(slAtr, 2600 - 4.5, 0.001), `got ${slAtr}`);
}

// ── G. TradeLocker price grids ─────────────────────────────────────────────
check('G1 oil 2dp', priceDecimals('USOIL') === 2 && priceDecimals('XTIUSD') === 2);
check('G2 natgas 3dp', priceDecimals('NGAS') === 3);
check('G3 FX/JPY/XAU unchanged', priceDecimals('EURUSD') === 5 && priceDecimals('USDJPY') === 3 && priceDecimals('XAUUSD') === 2);
check('G4 roundToTick oil', roundToTick('USOIL', 65.12345) === 65.12);

// ── H. ICT NY offset / DST ─────────────────────────────────────────────────
check('H1 Mar 9 2026 (DST began Mar 8) = -4', getNYOffset(new Date('2026-03-09T12:00:00Z')) === -4);
check('H2 Mar 6 2026 = -5', getNYOffset(new Date('2026-03-06T12:00:00Z')) === -5);
check('H3 Nov 2 2026 (DST ended Nov 1) = -5', getNYOffset(new Date('2026-11-02T12:00:00Z')) === -5);
check('H4 Oct 30 2026 = -4', getNYOffset(new Date('2026-10-30T12:00:00Z')) === -4);
check('H5 mid-summer/winter', getNYOffset(new Date('2026-07-01T12:00:00Z')) === -4 && getNYOffset(new Date('2026-01-15T12:00:00Z')) === -5);

// ── I. fx-models pipSize ───────────────────────────────────────────────────
check('I1 XAGUSD', modelPipSize('XAGUSD') === 0.001);
check('I2 USTEC', modelPipSize('USTEC') === 1);
check('I3 lowercase ethusd', modelPipSize('ethusd') === 0.01);
check('I4 defaults unchanged', modelPipSize('EURUSD') === 0.0001 && modelPipSize('USDJPY') === 0.01 && modelPipSize('XAUUSD') === 0.1 && modelPipSize('BTCUSD') === 1);

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
