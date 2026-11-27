/**
 * MT5 risk-% position sizing — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-mt5-risk-pct-sizing.ts
 *
 * Why: every MT5 trade was landing at 0.01 lots on a $500K account — the
 * Brain Learning Mode lock (10+ trades AND 60%+ WR to unlock; the brain
 * sits at ~52%) pinned the lot, and even unlocked the chain only ever
 * trimmed an AI/base lot, never sized up from the balance. Chris's
 * directive (Nov 27, 2026): "It needs to be the .5% per trade." These
 * checks pin:
 *
 *   A. Kill switch + config resolution (pure): MT5_RISK_PCT_SIZING=off
 *      disables; riskPercentPerTrade resolves with a 0.5 default and
 *      rejects unusable values back to that default.
 *   B. The sizing formula (pure): lot = floor(riskUSD / (stopPips ×
 *      pipValue)) across EURUSD ($10/pip), USDJPY (quote-converted pip
 *      value), XAUUSD, US30 — using pipUtils' own conventions. The
 *      $500,001 / 20-pip EURUSD case is $2,500.01 risk ≈ 12.50 lots.
 *   C. Floor-rounding (pure): realized risk NEVER exceeds the target
 *      across an equity × stop sweep (0.01 minimum lot excepted); a
 *      widened stop shrinks the lot so $ risk holds constant (the
 *      volatile-SL guard composition); unusable inputs return null so
 *      callers fall back instead of phantom-sizing.
 *   D. Engine wiring (source pins): the risk path bypasses the brain
 *      lock, brain/Kelly multipliers, compounding, dynamic tiers and the
 *      maxLotSize ceiling — while the legacy strings (kill-switch revert),
 *      PAIR LOT BLOCK, RISK CAP resize, drawdown shield and the 5%
 *      Gate 0e backstop all survive untouched.
 *   E. Chart-data wiring (source pins): the EA path reads
 *      riskPercentPerTrade when on (EA override still wins), floors on
 *      the risk path, skips the goal-pace multiplier, and leaves Gate 0e
 *      and the TradeLocker relay exactly as they were.
 *   F. Scope (diff): fan-out sizing module, crypto/Kalshi/Sol sizing
 *      files untouched; sw is vedd-v300.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import {
  mt5RiskPctSizingEnabled,
  resolveRiskPercentPerTrade,
  computeRiskPctLot,
  riskPctSizingLogLine,
  MT5_RISK_PCT_DEFAULT,
} from '../server/services/mt5-risk-sizing';
import { getPipValue, getPipSize } from '../server/utils/pipUtils';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number | null | undefined, b: number, tol = 0.001) => a != null && Math.abs(a - b) < tol;
const read = (p: string) => readFileSync(p, 'utf8');
const engine = read('server/services/live-trading-engine.ts');
const routes = read('server/routes.ts');
const sw = read('client/public/sw.js');

// ── A. Kill switch + config resolution ────────────────────────────────────
check('A1 sizing enabled by default', mt5RiskPctSizingEnabled({} as NodeJS.ProcessEnv) === true);
check('A2 MT5_RISK_PCT_SIZING=off disables', mt5RiskPctSizingEnabled({ MT5_RISK_PCT_SIZING: 'off' } as NodeJS.ProcessEnv) === false);
check('A3 any other value keeps sizing on', mt5RiskPctSizingEnabled({ MT5_RISK_PCT_SIZING: 'on' } as NodeJS.ProcessEnv) === true);
check('A4 default risk % is 0.5', MT5_RISK_PCT_DEFAULT === 0.5
  && resolveRiskPercentPerTrade(undefined) === 0.5
  && resolveRiskPercentPerTrade(null) === 0.5
  && resolveRiskPercentPerTrade({}) === 0.5);
check('A5 configured values honored', resolveRiskPercentPerTrade({ riskPercentPerTrade: 0.5 }) === 0.5
  && resolveRiskPercentPerTrade({ riskPercentPerTrade: 1 }) === 1
  && resolveRiskPercentPerTrade({ riskPercentPerTrade: 2.5 }) === 2.5);
check('A6 unusable values fall back to 0.5', resolveRiskPercentPerTrade({ riskPercentPerTrade: 0 }) === 0.5
  && resolveRiskPercentPerTrade({ riskPercentPerTrade: -1 }) === 0.5
  && resolveRiskPercentPerTrade({ riskPercentPerTrade: 'abc' }) === 0.5
  && resolveRiskPercentPerTrade({ riskPercentPerTrade: 150 }) === 0.5
  && resolveRiskPercentPerTrade({ riskPercentPerTrade: NaN }) === 0.5);

// ── B. Formula across instruments (pipUtils conventions) ──────────────────
{
  // EURUSD: pip 0.0001, $10/pip/lot. $500,001 × 0.5% = $2,500.005 over a
  // 20-pip stop ($200/lot) → 12.50 lots, realized $2,500 ≤ target.
  const r = computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1000, stopLoss: 1.0980 });
  check('B1 EURUSD $500,001 / 20 pips → 12.50 lots', approx(r?.lot, 12.5), `lot=${r?.lot}`);
  check('B2 EURUSD risk target ≈ $2,500', approx(r?.riskUsd, 2500.005, 0.01) && approx(r?.stopPips, 20, 0.01), `riskUsd=${r?.riskUsd} stopPips=${r?.stopPips}`);
  check('B3 EURUSD realized risk ≤ target', r != null && r.realizedRiskUsd <= r.riskUsd + 1e-9, `realized=${r?.realizedRiskUsd}`);
}
{
  // USDJPY: pip 0.01, pip value quote-converted (≈$6.7, NOT the flat $10).
  const pv = getPipValue('USDJPY');
  const r = computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'USDJPY', entryPrice: 150.00, stopLoss: 149.80 });
  const expected = Math.floor((500_001 * 0.005) / (20 * pv) * 100) / 100;
  check('B4 USDJPY uses quote-converted pip value (≠ $10)', pv > 0 && Math.abs(pv - 10) > 0.5, `pipValue=${pv}`);
  check('B5 USDJPY lot matches converted-pip formula', approx(r?.lot, expected) && approx(r?.stopPips, 20, 0.01), `lot=${r?.lot} expected=${expected}`);
}
{
  // XAUUSD: pip 0.1, $10/pip/lot. 20-pip stop → same 12.50 lots.
  const r = computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'XAUUSD', entryPrice: 2400.0, stopLoss: 2398.0 });
  check('B6 XAUUSD $500,001 / 20 pips → 12.50 lots', approx(r?.lot, 12.5) && approx(r?.stopPips, 20, 0.01), `lot=${r?.lot} stopPips=${r?.stopPips}`);
}
{
  // US30: pip 1.0 (1 point), $1/pip/lot. 100-point stop → 25.00 lots.
  const r = computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'US30', entryPrice: 39000, stopLoss: 38900 });
  check('B7 US30 $500,001 / 100 points → 25.00 lots', approx(r?.lot, 25) && approx(r?.pipValuePerLot, 1), `lot=${r?.lot}`);
}
{
  // GBPJPY cross: pip 0.01, JPY-converted value; 30-pip stop.
  const pv = getPipValue('GBPJPY');
  const r = computeRiskPctLot({ equity: 100_000, riskPct: 0.5, symbol: 'GBPJPY', entryPrice: 190.00, stopLoss: 189.70 });
  const expected = Math.floor((100_000 * 0.005) / (30 * pv) * 100) / 100;
  check('B8 GBPJPY lot matches formula at 30 pips', approx(r?.lot, expected) && r != null && r.realizedRiskUsd <= r.riskUsd + 1e-9, `lot=${r?.lot} expected=${expected}`);
}
{
  // A different configured % flows straight through: 1% doubles the size.
  const r = computeRiskPctLot({ equity: 500_001, riskPct: 1, symbol: 'EURUSD', entryPrice: 1.1000, stopLoss: 1.0980 });
  check('B9 riskPct=1 → 25.00 lots (the % is the size)', approx(r?.lot, 25), `lot=${r?.lot}`);
}

// ── C. Floor-rounding + fallback honesty ──────────────────────────────────
{
  let sweepOk = true;
  let worst = '';
  for (const equity of [100, 1_000, 10_000, 100_000, 500_001]) {
    for (const pips of [3, 7, 13, 20, 33, 57, 100, 250]) {
      const stop = 1.1000 - pips * getPipSize('EURUSD');
      const r = computeRiskPctLot({ equity, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1000, stopLoss: stop });
      if (!r) { sweepOk = false; worst = `null at eq=${equity} pips=${pips}`; break; }
      const stepOk = Math.abs(r.lot * 100 - Math.round(r.lot * 100)) < 1e-6;
      if (!stepOk || (!r.minLotApplied && r.realizedRiskUsd > r.riskUsd + 1e-9)) {
        sweepOk = false; worst = `eq=${equity} pips=${pips} lot=${r.lot} realized=${r.realizedRiskUsd} target=${r.riskUsd}`; break;
      }
    }
    if (!sweepOk) break;
  }
  check('C1 sweep: floored to 0.01 step, realized risk never exceeds target', sweepOk, worst);
}
{
  // Widened stop (volatile-SL guard composition): same equity, stop
  // 20 → 40 pips halves the lot and holds $ risk constant.
  const a = computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1000, stopLoss: 1.0980 });
  const b = computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1000, stopLoss: 1.0960 });
  check('C2 widened stop holds $ risk constant (12.50 → 6.25 lots)', approx(a?.lot, 12.5) && approx(b?.lot, 6.25)
    && a != null && b != null && Math.abs(a.realizedRiskUsd - b.realizedRiskUsd) < 1e-6, `a=${a?.lot} b=${b?.lot}`);
}
{
  // Minimum lot: $100 account, 20-pip EURUSD stop → raw 0.0025 → 0.01,
  // flagged so the caller can log it; structural gates govern from there.
  const r = computeRiskPctLot({ equity: 100, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1000, stopLoss: 1.0980 });
  check('C3 tiny account floors at the 0.01 minimum lot (flagged)', approx(r?.lot, 0.01) && r?.minLotApplied === true, `lot=${r?.lot}`);
}
check('C4 unknown equity → null (no phantom sizing)', computeRiskPctLot({ equity: 0, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1, stopLoss: 1.098 }) === null
  && computeRiskPctLot({ equity: -5, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1, stopLoss: 1.098 }) === null);
check('C5 missing/zero stop → null', computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1, stopLoss: null }) === null
  && computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1, stopLoss: 1.1 }) === null
  && computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'EURUSD', entryPrice: null, stopLoss: 1.09 }) === null);
{
  const r = computeRiskPctLot({ equity: 500_001, riskPct: 0.5, symbol: 'EURUSD', entryPrice: 1.1000, stopLoss: 1.0980 })!;
  const line = riskPctSizingLogLine('EURUSD', 0.5, 500_001, r);
  check('C6 log line carries the plain math', line.includes('Sized 12.50 lots') && line.includes('0.5%') && line.includes('$500,001') && line.includes('20-pip stop'), line);
}

// ── D. Engine wiring (processDecision) ────────────────────────────────────
check('D1 engine imports the sizer module', engine.includes("from './mt5-risk-sizing'"));
check('D2 config default is 0.5', engine.includes('riskPercentPerTrade: 0.5'));
check('D3 risk-sized base beats the brain lock', engine.includes('let rawLotBase = riskPctSized ? _riskSized!.lot : (brainLocked ? 0.01 :'));
check('D4 legacy lock line survives (kill-switch revert)', engine.includes('Learning Mode: lot locked at 0.01') && engine.includes('0.01 lot lock lifted — sizing is risk-% based'));
check('D5 brain/Kelly multiplier cannot move the risk size', engine.includes('const brainMult = riskPctSized ? 1.0 :'));
check('D6 Kelly sizing skipped on the risk path', engine.includes("if (!riskPctSized && (sizingMode === 'kelly'"));
check('D7 compounding skipped on the risk path', engine.includes('const compoundedLot = (!riskPctSized && config.enableCompounding)'));
check('D8 dynamic tiers skipped on the risk path', engine.includes('const isDynamicSizingEnabled = !riskPctSized && !brainLocked'));
check('D9 profile/MTF scales skipped on the risk path', engine.includes('if (!riskPctSized) {\n        const _ls = Number((decision as any)._lotScale);'));
check('D10 safeMaxLot ceiling replaced by the risk ceiling', engine.includes('const preCappedLot = riskPctSized ? _multSized : Math.max(0.01, Math.min(_multSized, safeMaxLot));'));
check('D11 maxLotSize hard ceiling skipped on the risk path', engine.includes('if (!riskPctSized && _mlS > 0 && lotSize > _mlS)'));
check('D12 consistency override still applies (floor-rounded)', engine.includes('Math.floor(rawLotBase * consistencyMult * 100) / 100'));
check('D13 sizing log line wired', engine.includes('📐 Risk-% sizing:') && engine.includes('riskPctSizingLogLine('));
check('D14 PAIR LOT BLOCK survives binding + logged', engine.includes('PAIR LOT BLOCK') && engine.includes('Math.min(volCappedLot, _pairHardLot)'));
check('D15 RISK CAP resize survives', engine.includes('🛡️ RISK CAP: resized') && engine.includes('config.maxRiskPerTradePct'));
check('D16 Gate 0e 5% backstop survives as the outer wall', engine.includes('_potentialLoss > _riskBal * 0.05') && engine.includes('RISK BLOCK: per-trade risk'));
check('D17 drawdown shield survives (risk-reducing)', engine.includes('SHIELD SIGNAL') && engine.includes('state.drawdownShieldActive'));
check('D18 AI prompt carries the risk-% sizing note', engine.includes('RISK-% SIZING ACTIVE') && engine.includes('Your suggested lotSize will be overridden by the risk-% math'));

// ── E. Chart-data wiring (routes.ts) ──────────────────────────────────────
check('E1 chart-data reads riskPercentPerTrade when on', routes.includes('_resolveRiskPct(_liveState?.config)') && routes.includes("(_liveState?.config?.riskPerTrade ?? 1.0)"));
check('E2 EA-level override still wins', routes.includes('matchingEA?.riskPercent != null ? matchingEA.riskPercent : liveEngineRiskPct'));
check('E3 risk path floors, legacy path rounds', routes.includes('_mt5RiskOn ? Math.floor(calculatedLots * 100) / 100 : Math.round(calculatedLots * 100) / 100')
  && routes.includes('_mt5RiskOn ? Math.floor(calculatedLotsFb * 100) / 100 : Math.round(calculatedLotsFb * 100) / 100'));
check('E4 goal-pace multiplier skipped while risk sizing is on', (routes.match(/if \(!_mt5RiskOn && goalIntelligenceActive/g) || []).length === 2);
check('E5 Gate 0e untouched in routes', routes.includes('[Gate 0e]') && routes.includes('resized ${mt5Volume}→${_cappedVol} lots to fit 5% per-trade cap'));
check('E6 TradeLocker relay untouched (still legacy riskPerTrade source)', routes.includes('const relayRiskPct: number = _rState?.config?.riskPerTrade ?? 1.0;'));
check('E7 settings endpoint accepts riskPercentPerTrade', routes.includes('riskPercentPerTrade: riskPercentPerTrade !== undefined'));

// ── F. Scope ──────────────────────────────────────────────────────────────
try {
  const out = execSync('git diff --name-only aa157f01...HEAD 2>/dev/null || git diff --name-only HEAD', { encoding: 'utf8' });
  const changed = out.split('\n').map(s => s.trim()).filter(Boolean);
  const forbidden = changed.filter(f =>
    f.endsWith('server/services/fanout-per-account-risk.ts')
    || f.endsWith('server/services/cryptocom-scanner.ts')
    || f.endsWith('server/services/kalshi-perp-small-account.ts')
    || f.endsWith('server/services/kalshi-stock-shadow.ts')
    || f.endsWith('server/services/solana-scanner.ts')
    || f.endsWith('server/services/ai-budget-degrade.ts'));
  check('F1 fan-out / crypto / Kalshi / Sol sizing files untouched', forbidden.length === 0, forbidden.join(','));
} catch (e: any) {
  check('F1 fan-out / crypto / Kalshi / Sol sizing files untouched (git unavailable)', false, String(e?.message || e).slice(0, 120));
}
check('F2 sw is vedd-v300', sw.includes("CACHE_VERSION = 'vedd-v300'"));

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
