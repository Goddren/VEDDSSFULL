/**
 * Kalshi perp EXACT cost accounting — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-perp-exact-costs.ts
 *
 * No network, no database: the shared cost module
 * (server/services/kalshi-perp-costs.ts) is exercised directly on
 * synthetic prints/payloads, and the lane wiring (era stamps, kill
 * switch, estimate fallback marking, live-lane fee deduction) is pinned
 * by source checks against the lane files.
 *
 *   A. Fee math: published tier-0 schedule (12 bps taker / 5 bps maker
 *      on notional), charged on BOTH legs — taker round trip 24 bps,
 *      maker round trip 10 bps; per-leg USD fees.
 *   B. Fee-tier payload parsing: bps and decimal shapes, base tier =
 *      highest taker, garbage → null → published fallback with the
 *      source stated ('api' vs 'published'), never silent.
 *   C. Funding normalization: the 0.01% deadband pays exactly 0
 *      (boundary inclusive above), the ±2% cap clamps exactly.
 *   D. Funding accrual from ACTUAL prints: window discipline (prints
 *      at/before open or watermark never double-count, future prints
 *      never count), sign convention (long pays when rate > 0), and
 *      accrual across a 4pm ET print on synthetic data.
 *   E. Print boundary + estimate fallback: lastFundingPrintMs across
 *      weekends and DST; the fail-soft rule fires only when the
 *      historical read failed AND a print was crossed.
 *   F. Annualization convention (the ~9× trap): mean over ALL
 *      intervals, zeros included — never charging-intervals-only.
 *   G. Kill switch: KALSHI_PERP_EXACT_COSTS=off flips
 *      exactCostsEnabled() dynamically.
 *   H. Module purity: the shared module imports no DB, no fetch, no
 *      authenticated client — the shadow lane's no-credentials
 *      invariant survives importing it.
 *   I. Lane wiring (source pins): era stamps, funding_model marking,
 *      estimate column, live-lane shared accounting.
 */
import { readFileSync } from 'node:fs';
import {
  exactCostsEnabled, COST_MODEL_EXACT, COST_MODEL_LEGACY,
  PUBLISHED_FEE_SCHEDULE, parseFeeTiersPayload, resolveFeeSchedule, feeUsd, roundTripCostBps,
  FUNDING_DEADBAND, FUNDING_CAP, normalizeFundingRate, fundingPnlUsd, accrueFundingFromPrints,
  lastFundingPrintMs, fundingPrintCrossedMs, fundingFallbackApplies, annualizedFundingPct,
} from '../server/services/kalshi-perp-costs';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const read = (p: string) => readFileSync(p, 'utf8');

// ── A. fee math, both sides ─────────────────────────────────────────────────
{
  check('A1 published schedule is tier-0 12/5', PUBLISHED_FEE_SCHEDULE.takerBps === 12 && PUBLISHED_FEE_SCHEDULE.makerBps === 5 && PUBLISHED_FEE_SCHEDULE.source === 'published');
  check('A2 taker round trip is 24 bps (open AND close)', roundTripCostBps(PUBLISHED_FEE_SCHEDULE) === 24);
  check('A3 maker round trip is 10 bps', roundTripCostBps(PUBLISHED_FEE_SCHEDULE, 'maker', 'maker') === 10);
  check('A4 mixed taker-open/maker-close is 17 bps', roundTripCostBps(PUBLISHED_FEE_SCHEDULE, 'taker', 'maker') === 17);
  check('A5 taker fee on $250 notional is $0.30 per leg', near(feeUsd(250, PUBLISHED_FEE_SCHEDULE, 'taker'), 0.30));
  check('A6 maker fee on $250 notional is $0.125 per leg', near(feeUsd(250, PUBLISHED_FEE_SCHEDULE, 'maker'), 0.125));
  check('A7 taker round trip on $250 is $0.60', near(2 * feeUsd(250, PUBLISHED_FEE_SCHEDULE, 'taker'), 0.60));
  check('A8 zero/negative notional pays no fee', feeUsd(0, PUBLISHED_FEE_SCHEDULE, 'taker') === 0 && feeUsd(-5, PUBLISHED_FEE_SCHEDULE, 'taker') === 0);
}

// ── B. fee-tier payload parsing + source ────────────────────────────────────
{
  const bpsShape = parseFeeTiersPayload({ fee_tiers: [{ taker_fee_bps: 8, maker_fee_bps: 3 }, { taker_fee_bps: 12, maker_fee_bps: 5 }] });
  check('B1 bps payload parses, base tier = highest taker', bpsShape?.takerBps === 12 && bpsShape?.makerBps === 5 && bpsShape?.source === 'api');
  const decShape = parseFeeTiersPayload({ tiers: [{ taker_fee: 0.0012, maker_fee: 0.0005 }] });
  check('B2 decimal-fraction payload parses to the same bps', decShape?.takerBps === 12 && decShape?.makerBps === 5);
  const arrShape = parseFeeTiersPayload([{ taker_bps: '12', maker_bps: '5' }]);
  check('B3 bare-array + string values parse', arrShape?.takerBps === 12 && arrShape?.makerBps === 5);
  check('B4 garbage payload parses to null', parseFeeTiersPayload({ hello: 'world' }) === null && parseFeeTiersPayload(null) === null && parseFeeTiersPayload({ fee_tiers: [{ taker_fee_bps: 9999 }] }) === null);
  const fb = resolveFeeSchedule(null);
  check('B5 fallback is the published schedule, source stated', fb.source === 'published' && fb.takerBps === 12 && fb.makerBps === 5);
  const api = resolveFeeSchedule(bpsShape);
  check('B6 api schedule wins when present, source stated', api.source === 'api' && api.takerBps === 12);
}

// ── C. deadband + cap, applied exactly ──────────────────────────────────────
{
  check('C1 constants: deadband 0.01%, cap 2%', FUNDING_DEADBAND === 0.0001 && FUNDING_CAP === 0.02);
  check('C2 inside deadband pays exactly 0', normalizeFundingRate(0.00009) === 0 && normalizeFundingRate(-0.00009) === 0 && normalizeFundingRate(0) === 0);
  check('C3 at the deadband boundary the rate passes', normalizeFundingRate(0.0001) === 0.0001 && normalizeFundingRate(-0.0001) === -0.0001);
  check('C4 ordinary rates pass through untouched', normalizeFundingRate(0.005) === 0.005 && normalizeFundingRate(-0.0137) === -0.0137);
  check('C5 beyond the cap clamps to ±2% exactly', normalizeFundingRate(0.05) === 0.02 && normalizeFundingRate(-0.5) === -0.02);
  check('C6 non-finite rates normalize to 0', normalizeFundingRate(NaN) === 0 && normalizeFundingRate(Infinity) === 0);
  check('C7 normalization is idempotent', normalizeFundingRate(normalizeFundingRate(0.05)) === 0.02 && normalizeFundingRate(normalizeFundingRate(0.00009)) === 0);
}

// ── D. accrual from actual prints ───────────────────────────────────────────
{
  // Monday 2026-11-16, 16:00 ET (EST) = 21:00 UTC.
  const print = Date.UTC(2026, 10, 16, 21, 0);
  const opened = print - 2 * 3_600_000;
  const prints = [{ fundingTimeMs: print, rate: 0.001, markPrice: 100 }];
  const long = accrueFundingFromPrints({ direction: 'long', contracts: 10, openedMs: opened, throughMs: opened, nowMs: print + 3_600_000, prints });
  check('D1 long pays rate × mark × contracts across the print', near(long.deltaUsd, -1.0), `delta=${long.deltaUsd}`);
  check('D2 watermark advances to the print', long.throughMs === print && long.applied === 1);
  const short = accrueFundingFromPrints({ direction: 'short', contracts: 10, openedMs: opened, throughMs: opened, nowMs: print + 3_600_000, prints });
  check('D3 short receives what the long pays', near(short.deltaUsd, 1.0));
  const again = accrueFundingFromPrints({ direction: 'long', contracts: 10, openedMs: opened, throughMs: long.throughMs, nowMs: print + 7_200_000, prints });
  check('D4 re-accrual past the watermark is a no-op (no double count)', again.deltaUsd === 0 && again.applied === 0);
  const before = accrueFundingFromPrints({ direction: 'long', contracts: 10, openedMs: print + 3_600_000, throughMs: 0, nowMs: print + 7_200_000, prints });
  check('D5 a print before the position opened never counts', before.deltaUsd === 0 && before.applied === 0);
  const future = accrueFundingFromPrints({ direction: 'long', contracts: 10, openedMs: opened, throughMs: opened, nowMs: print - 1, prints });
  check('D6 a print that has not landed yet never counts', future.deltaUsd === 0 && future.applied === 0);
  const dead = accrueFundingFromPrints({ direction: 'long', contracts: 10, openedMs: opened, throughMs: opened, nowMs: print + 3_600_000, prints: [{ fundingTimeMs: print, rate: 0.00005, markPrice: 100 }] });
  check('D7 a deadband print accrues exactly 0 but still advances the watermark', dead.deltaUsd === 0 && dead.throughMs === print && dead.applied === 1);
  const capped = accrueFundingFromPrints({ direction: 'long', contracts: 10, openedMs: opened, throughMs: opened, nowMs: print + 3_600_000, prints: [{ fundingTimeMs: print, rate: 0.09, markPrice: 100 }] });
  check('D8 an over-cap print accrues at the 2% cap', near(capped.deltaUsd, -20.0), `delta=${capped.deltaUsd}`);
  check('D9 fundingPnlUsd sign convention', fundingPnlUsd('long', 0.001, 200, 5) === -1 && fundingPnlUsd('short', 0.001, 200, 5) === 1 && fundingPnlUsd('long', -0.001, 200, 5) === 1);
}

// ── E. print boundary + estimate fallback ───────────────────────────────────
{
  const monPrint = Date.UTC(2026, 10, 16, 21, 0);   // Mon 16:00 ET (EST)
  const friPrint = Date.UTC(2026, 10, 13, 21, 0);   // Fri 16:00 ET (EST)
  check('E1 Monday after the print → Monday print', lastFundingPrintMs(monPrint + 3_600_000) === monPrint);
  check('E2 Monday before the print → Friday print (weekend has none)', lastFundingPrintMs(monPrint - 3_600_000) === friPrint);
  check('E3 Sunday → Friday print', lastFundingPrintMs(Date.UTC(2026, 10, 15, 12, 0)) === friPrint);
  check('E4 DST: spring-forward Monday print is 16:00 EDT = 20:00 UTC', lastFundingPrintMs(Date.UTC(2026, 2, 9, 21, 0)) === Date.UTC(2026, 2, 9, 20, 0));
  check('E5 crossed print is reported', fundingPrintCrossedMs(friPrint, monPrint + 3_600_000) === monPrint);
  check('E6 no crossed print when the watermark covers it', fundingPrintCrossedMs(monPrint, monPrint + 3_600_000) === null);
  check('E7 fallback fires only on failed read + crossed print', fundingFallbackApplies(false, friPrint, monPrint + 3_600_000) === true
    && fundingFallbackApplies(true, friPrint, monPrint + 3_600_000) === false
    && fundingFallbackApplies(false, monPrint, monPrint + 3_600_000) === false);
}

// ── F. annualization — the trap ─────────────────────────────────────────────
{
  const series = [...Array(40).fill(0.001), ...Array(325).fill(0)];
  const honest = annualizedFundingPct(series);
  const chargingOnly = 0.001 * 365 * 100; // 36.5% — the trap figure
  check('F1 annualization is the mean over ALL intervals × 365', near(honest, 4.0, 1e-6), `got ${honest}`);
  check('F2 the honest figure is ~9× below the charging-only figure', honest < chargingOnly / 5, `${honest} vs ${chargingOnly}`);
  check('F3 empty series annualizes to 0', annualizedFundingPct([]) === 0);
  check('F4 deadband prints contribute their true value: zero', near(annualizedFundingPct([0.00005, 0.00005]), 0));
}

// ── G. kill switch ──────────────────────────────────────────────────────────
{
  const saved = process.env.KALSHI_PERP_EXACT_COSTS;
  delete process.env.KALSHI_PERP_EXACT_COSTS;
  check('G1 exact costs default ON', exactCostsEnabled() === true);
  process.env.KALSHI_PERP_EXACT_COSTS = 'off';
  check('G2 KALSHI_PERP_EXACT_COSTS=off disables', exactCostsEnabled() === false);
  if (saved == null) delete process.env.KALSHI_PERP_EXACT_COSTS; else process.env.KALSHI_PERP_EXACT_COSTS = saved;
  check('G3 era stamps are exact_v1 / placeholder', COST_MODEL_EXACT === 'exact_v1' && COST_MODEL_LEGACY === 'placeholder');
}

// ── H. module purity ────────────────────────────────────────────────────────
{
  const mod = read('server/services/kalshi-perp-costs.ts');
  check('H1 shared module imports nothing', !/^\s*import\s/m.test(mod));
  check('H2 shared module touches no DB, no fetch, no credentials', !mod.includes('fetch(') && !mod.includes('pool.') && !mod.includes('require(') && !mod.includes('process.env.KALSHI_API'));
}

// ── I. lane wiring (source pins) ────────────────────────────────────────────
{
  const shadow = read('server/services/kalshi-stock-shadow.ts');
  const shadowTables = read('server/services/ensure-kalshi-perp-shadow-tables.ts');
  const live = read('server/services/kalshi-perp-live.ts');
  const liveTables = read('server/services/ensure-kalshi-perp-live-tables.ts');
  const trading = read('server/services/kalshi-trading.ts');

  check('I1 shadow lane imports the shared cost module', shadow.includes("from './kalshi-perp-costs'"));
  check('I2 shadow lane still imports NO authenticated client', !shadow.includes('kalshi-trading'));
  check('I3 entry stamps the era: exact_v1 when on, placeholder when off', shadow.includes('COST_MODEL_EXACT') && shadow.includes("cost_model") && shadow.includes('exactCostsEnabled()'));
  check('I4 entry cost floor uses the stamped round-trip cost', shadow.includes('slPct < 3 * (costBps / 100)'));
  check('I5 shadow accrual routes through the shared print accrual', shadow.includes('accrueFundingFromPrints'));
  check('I6 shadow trades carry funding_model + funding_estimate_usd columns', shadowTables.includes('funding_model') && shadowTables.includes('funding_estimate_usd'));
  check('I7 estimate-funded closes are stamped visibly', shadow.includes("fundingModel = 'estimate'") && shadow.includes('fundingFallbackApplies'));
  check('I8 reconciled closes are stamped actual', shadow.includes("fundingModel = 'actual'"));
  check('I9 live lane imports the shared cost module', live.includes("from './kalshi-perp-costs'"));
  check('I10 live closes deduct shared-math fees', live.includes('feeUsd(') && live.includes('feesUsd'));
  check('I11 live trades carry fees_usd + cost_model columns', liveTables.includes('fees_usd') && liveTables.includes('cost_model'));
  check('I12 authenticated fee-tier read lives in kalshi-trading', trading.includes("'/margin/fee_tiers'") && trading.includes('parseFeeTiersPayload'));
  check('I13 live lane resolves its schedule via the trading client + shared resolver', live.includes('getKalshiMarginFeeTiers') && live.includes('resolveFeeSchedule'));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
