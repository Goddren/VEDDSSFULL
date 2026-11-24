/**
 * Kalshi perp Trail Brain R-geometry activation checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-perp-trail-r.ts
 *
 * The defect (traced 2026-11-21): Kalshi perp exits are fixed TP/SL —
 * stop distance slPct ∈ [0.8%, 4%], target at 2R, so a trade's peak
 * gain caps at +8% — while the shared Trail Brain's percent activation
 * defaults to 15% with an 8% hard floor in the kalshi clamps. Zero
 * guided closes resulted: the brain could essentially never arm.
 *
 * The fix under test: the two perp adapters pass a per-trade
 * rActivation override derived from the trade's OWN geometry
 * (arm at +1R of its stop, trail 0.75R, give back ≤1R — the R-lane
 * defaults), so activation/trail/locks scale with the trade. Pinned:
 *
 *   A. Geometry truth table — activation = entry + activationR × stop
 *      distance, for stop 0.8% / 2% / 4% at a 2R target; never above
 *      the target; the 75%-of-target cap binds when RR < 2.
 *   B. Arming — a trade peaking at +5% with a 2% stop ARMS under R
 *      geometry (it cannot under the percent defaults), the lock step
 *      binds at 1.5R, and exitNow fires at the floor.
 *   C. Invariants sweep — the trailed floor never exceeds the trade's
 *      own target and never loosens the original stop, for every
 *      stop size and peak.
 *   D. Other lanes unchanged — no override → the exact same objects
 *      and decision outputs as before this build.
 *   E. Kill switch — KALSHI_PERP_TRAIL_R=off restores percent mode;
 *      env tuning is clamped.
 *   F. Fail-open — unusable geometry yields no override, never a throw.
 *   G. Source pins — both adapters wired, live monitor keeps exactly
 *      one consult, report carries the trailBrain section.
 */
import { readFileSync } from 'node:fs';
import {
  trailBrainDecide, trailBrainStopPrice, trailBrainEffectiveParams,
  defaultTrailBrainParams, kalshiPerpTrailActivation, kalshiPerpTrailROn,
  kalshiPerpTrailRGeometry,
  type TrailBrainParams,
} from '../server/services/trail-brain';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const KALSHI_DEFAULTS = defaultTrailBrainParams('kalshi');
const geom = (slPct: number, rr = 2, entry = 100) =>
  kalshiPerpTrailActivation({ entryPrice: entry, takeProfit: entry * (1 + (rr * slPct) / 100), slPct });

// ── A. Geometry truth table ──────────────────────────────────────────────
for (const slPct of [0.8, 2, 4]) {
  const ov = geom(slPct);
  check(`A slPct=${slPct}: override derived (oneR = stop distance, target = 2R)`,
    !!ov && approx(ov.oneR, slPct) && approx(ov.target ?? -1, 2 * slPct));
  const eff = trailBrainEffectiveParams(KALSHI_DEFAULTS, ov!);
  check(`A slPct=${slPct}: activation = 1.0R in % (= entry + 1× stop distance)`,
    approx(eff.activation, slPct), `activation=${eff.activation}`);
  check(`A slPct=${slPct}: activation price = ${100 * (1 + slPct / 100)} and strictly below the target`,
    approx(100 * (1 + eff.activation / 100), 100 * (1 + slPct / 100)) && eff.activation < 2 * slPct);
  check(`A slPct=${slPct}: trail 0.75R / give-back 1R / lock 1.0R @ 1.5R, all scaled by the stop`,
    approx(eff.trailDist, 0.75 * slPct) && approx(eff.giveBackCap, slPct)
    && eff.lockSteps.length === 1 && approx(eff.lockSteps[0].atPeak, 1.5 * slPct) && approx(eff.lockSteps[0].lock, slPct));
}
{
  // RR below 2 (KALSHI_STOCK_SHADOW_RR is env-tunable): the 75%-of-target
  // cap must bind so activation can never sit at/past the target, and a
  // lock step at/past the target is dropped.
  const ov = geom(2, 1)!;
  const eff = trailBrainEffectiveParams(KALSHI_DEFAULTS, ov);
  check('A RR=1: activation capped at 75% of the target (1.5% on a 2% stop)',
    approx(eff.activation, 1.5), `activation=${eff.activation}`);
  check('A RR=1: lock step at 1.5R sits past the 1R target → dropped', eff.lockSteps.length === 0);
  const ov15 = geom(2, 1.5)!;
  const eff15 = trailBrainEffectiveParams(KALSHI_DEFAULTS, ov15);
  check('A RR=1.5: activation = 1R (2%) under the 75% cap (2.25%)', approx(eff15.activation, 2));
}

// ── B. Arming simulation ─────────────────────────────────────────────────
{
  const base = { direction: 'long', entryPrice: 100, slPct: 2, params: KALSHI_DEFAULTS };
  const before = trailBrainStopPrice({ ...base, peakGainPct: 5, currentGainPct: 5 });
  check('B pre-fix behaviour pinned: peak +5% / 2% stop does NOT arm on percent defaults (15%)', before === null);
  const ov = geom(2)!;
  const armed = trailBrainStopPrice({ ...base, peakGainPct: 5, currentGainPct: 5, rActivation: ov });
  check('B R geometry: peak +5% / 2% stop ARMS — floor 3.5% (peak − 0.75R trail), stop 103.5',
    !!armed && approx(armed.floorPct, 3.5) && approx(armed.stopPrice, 103.5) && !armed.exitNow,
    armed ? `floor=${armed.floorPct} stop=${armed.stopPrice}` : 'null');
  const exited = trailBrainStopPrice({ ...base, peakGainPct: 5, currentGainPct: 3.5, rActivation: ov });
  check('B exitNow fires when current gives back to the floor', !!exited && exited.exitNow);
  const atArm = trailBrainStopPrice({ ...base, peakGainPct: 2, currentGainPct: 2, rActivation: ov });
  check('B exactly at +1R the floor locks +0.5R (stop 100.5) and binds',
    !!atArm && approx(atArm.floorPct, 0.5) && approx(atArm.stopPrice, 100.5));
  const belowArm = trailBrainStopPrice({ ...base, peakGainPct: 1.9, currentGainPct: 1.9, rActivation: ov });
  check('B just below +1R: not armed, no trailed stop', belowArm === null);
  const lockCase = trailBrainStopPrice({ ...base, peakGainPct: 3, currentGainPct: 3, rActivation: ov });
  check('B at 1.5R peak the lock step binds: floor 2% (1R locked) over the 1.5% trail floor',
    !!lockCase && approx(lockCase.floorPct, 2) && approx(lockCase.stopPrice, 102),
    lockCase ? `floor=${lockCase.floorPct}` : 'null');
  const short = trailBrainStopPrice({ direction: 'short', entryPrice: 100, peakGainPct: 3, currentGainPct: 3, slPct: 2, params: KALSHI_DEFAULTS, rActivation: kalshiPerpTrailActivation({ entryPrice: 100, takeProfit: 96, slPct: 2 })! });
  check('B short side mirrors: floor 2% → stop 98', !!short && approx(short.floorPct, 2) && approx(short.stopPrice, 98));
}

// ── C. Invariant sweep ───────────────────────────────────────────────────
{
  let ok = true; let detail = '';
  for (const slPct of [0.8, 1.5, 2, 3, 4]) {
    const ov = geom(slPct)!;
    const eff = trailBrainEffectiveParams(KALSHI_DEFAULTS, ov);
    if (eff.activation > 0.75 * 2 * slPct + 1e-9) { ok = false; detail = `activation above 75% of target at slPct=${slPct}`; }
    for (let peak = 0; peak <= 3 * 2 * slPct; peak += 0.25) {
      const d = trailBrainDecide(eff, { peak, current: peak, stopFloor: -slPct, floorCap: ov.target });
      if (d.floor > 2 * slPct + 1e-9) { ok = false; detail = `floor ${d.floor} > target ${2 * slPct} at slPct=${slPct} peak=${peak}`; }
      if (d.floor < -slPct - 1e-9) { ok = false; detail = `floor ${d.floor} loosens the stop at slPct=${slPct} peak=${peak}`; }
    }
  }
  check('C floor never exceeds the trade target, never loosens the original stop (5 stop sizes × peak sweep)', ok, detail);
}

// ── D. Other lanes unchanged ─────────────────────────────────────────────
{
  const cryptoParams: TrailBrainParams = { activation: 1, trailDist: 0.75, giveBackCap: 1, lockSteps: [{ atPeak: 2, lock: 0.5 }] };
  check('D no override → effective params are the SAME object (no copy, no change)',
    trailBrainEffectiveParams(cryptoParams) === cryptoParams);
  check('D unusable override (oneR 0 / NaN) → same object, fail-open',
    trailBrainEffectiveParams(cryptoParams, { ...kalshiPerpTrailRGeometry(), oneR: 0 }) === cryptoParams
    && trailBrainEffectiveParams(cryptoParams, { ...kalshiPerpTrailRGeometry(), oneR: NaN }) === cryptoParams);
  const d1 = trailBrainDecide(cryptoParams, { peak: 0.9, current: 0.9, stopFloor: -1 });
  check('D R-lane decide below activation unchanged', !d1.armed && d1.floor === -1 && !d1.binding);
  const d2 = trailBrainDecide(cryptoParams, { peak: 2, current: 1.4, stopFloor: -1 });
  check('D R-lane decide at 2R peak: floor 1.25 (lock step 0.5 does not bind), no exit',
    d2.armed && approx(d2.floor, 1.25) && !d2.exitNow && d2.binding, `floor=${d2.floor}`);
  const d3 = trailBrainDecide(cryptoParams, { peak: 2, current: 1.25, stopFloor: -1 });
  check('D R-lane decide exit at the floor unchanged', d3.exitNow);
  const pct = { activation: 15, trailDist: 6, giveBackCap: 10, lockSteps: [] as { atPeak: number; lock: number }[] };
  const long = trailBrainStopPrice({ direction: 'long', entryPrice: 100, peakGainPct: 20, currentGainPct: 18, slPct: 4, params: pct });
  const shortP = trailBrainStopPrice({ direction: 'short', entryPrice: 100, peakGainPct: 20, currentGainPct: 18, slPct: 4, params: pct });
  check('D percent stopPrice without override unchanged (long 114 / short 86)',
    !!long && approx(long.stopPrice, 114) && !!shortP && approx(shortP.stopPrice, 86));
}

// ── E. Kill switch + env tuning ──────────────────────────────────────────
{
  const saved = { ...process.env };
  try {
    process.env.KALSHI_PERP_TRAIL_R = 'off';
    check('E kill switch off: kalshiPerpTrailROn() false', !kalshiPerpTrailROn());
    check('E kill switch off: no override is built (adapters fall back to percent mode)',
      kalshiPerpTrailActivation({ entryPrice: 100, takeProfit: 104, slPct: 2 }) === null);
    const pctMode = trailBrainStopPrice({ direction: 'long', entryPrice: 100, peakGainPct: 5, currentGainPct: 5, slPct: 2, params: KALSHI_DEFAULTS });
    check('E kill switch off: peak +5% / 2% stop is back to never arming', pctMode === null);
    delete process.env.KALSHI_PERP_TRAIL_R;
    process.env.KALSHI_PERP_TRAIL_ACTIVATION_R = '1.25';
    check('E env tuning: KALSHI_PERP_TRAIL_ACTIVATION_R=1.25 honoured', approx(kalshiPerpTrailRGeometry().activationR, 1.25));
    process.env.KALSHI_PERP_TRAIL_ACTIVATION_R = '99';
    check('E env tuning: absurd activation clamped to 1.5R', approx(kalshiPerpTrailRGeometry().activationR, 1.5));
    process.env.KALSHI_PERP_TRAIL_ACTIVATION_R = 'abc';
    check('E env tuning: non-numeric activation falls back to the 1.0R default', approx(kalshiPerpTrailRGeometry().activationR, 1.0));
  } finally {
    for (const k of ['KALSHI_PERP_TRAIL_R', 'KALSHI_PERP_TRAIL_ACTIVATION_R', 'KALSHI_PERP_TRAIL_DIST_R', 'KALSHI_PERP_TRAIL_GIVEBACK_R']) {
      if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
    }
  }
  check('E env restored: R mode back on with defaults', kalshiPerpTrailROn() && approx(kalshiPerpTrailRGeometry().activationR, 1.0));
}

// ── F. Fail-open ─────────────────────────────────────────────────────────
{
  check('F garbage geometry → null override, never a throw',
    kalshiPerpTrailActivation({ entryPrice: 0, takeProfit: 104, slPct: 2 }) === null
    && kalshiPerpTrailActivation({ entryPrice: 100, takeProfit: 104, slPct: 0 }) === null
    && kalshiPerpTrailActivation({ entryPrice: 100, takeProfit: -5, slPct: 2 }) === null
    && kalshiPerpTrailActivation({ entryPrice: 100, takeProfit: 100, slPct: 2 }) === null
    && kalshiPerpTrailActivation({ entryPrice: NaN, takeProfit: 104, slPct: 2 }) === null);
  check('F stopPrice with an override but slPct 0 → null (existing guard intact)',
    trailBrainStopPrice({ direction: 'long', entryPrice: 100, peakGainPct: 5, currentGainPct: 5, slPct: 0, params: KALSHI_DEFAULTS, rActivation: geom(2)! }) === null);
}

// ── G. Source pins ───────────────────────────────────────────────────────
{
  const shadow = src('../server/services/kalshi-stock-shadow.ts');
  const live = src('../server/services/kalshi-perp-live.ts');
  const brain = src('../server/services/trail-brain.ts');
  check('G1 shadow resolver passes the R activation override',
    /rActivation: kalshiPerpTrailActivation\(/.test(shadow));
  check('G2 live exit monitor passes the R activation override',
    /rActivation: kalshiPerpTrailActivation\(/.test(live));
  check('G3 live monitor keeps exactly ONE trailBrainConsult (entry gates untouched)',
    (live.match(/await trailBrainConsult/g) || []).length === 1);
  check('G4 kill switch read lives in the brain module',
    brain.includes("process.env.KALSHI_PERP_TRAIL_R !== 'off'"));
  check('G5 shadow report carries the trailBrain section with guided-close counts',
    shadow.includes('trailBrain: KalshiPerpTrailBrainReport') && shadow.includes("exit_reason = 'trail'") && shadow.includes('trail_brain_version IS NOT NULL'));
  check('G6 attribution stamps untouched at both adapters',
    shadow.includes("stampTrailBrainTrade('kalshi_perp_shadow_trades'") && live.includes("stampTrailBrainTrade('kalshi_perp_live_trades'"));
}

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
