/**
 * Gate calibration verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-gate-calibration.ts
 *
 * No database and no broker are touched: the aggregation + recommendation
 * rule in gate-calibration.ts is pure and is walked across every sample
 * minimum and both clamps, and the wiring is pinned by source checks — the
 * override consult exists ONLY at the confidence-floor and R:R-exception
 * evaluation sites in processDecision, the new counterfactual kinds are
 * recorded without altering any reject decision, the kill switch gates
 * compute + consult, and the panel renders only on the Guards & Trails page.
 *
 *   A. Band math + aggregation (incl. pair rollup).
 *   B. Eligibility minimums (30 taken + 30 blocked, at/above/below).
 *   C. Floor rule + clamps [60, 90].
 *   D. Sub-1:2 threshold rule + clamps [80, 95] + special cases.
 *   E. resolveGateThresholds precedence (exact → pair → defaults, per field).
 *   F. Kill switch.
 *   G. Source pins (consult isolation, instrumentation, routes, panel, SW).
 */
import { readFileSync } from 'node:fs';
import {
  CONF_BANDS, bandIndexFor, aggregateSlices, recommendForSlice, resolveGateThresholds,
  gateCalibrationOn, sliceKey,
  type TakenRow, type BlockedRow, type SliceStats,
} from '../server/services/gate-calibration';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── Row builders ────────────────────────────────────────────────────────────
function taken(symbol: string, session: string | null, conf: number, n: number, wins: number, rWin = 1.5, rLoss = -1): TakenRow[] {
  const out: TakenRow[] = [];
  for (let i = 0; i < n; i++) {
    const win = i < wins;
    out.push({ symbol, session, confidence: conf, r: win ? rWin : rLoss, win });
  }
  return out;
}
function blocked(symbol: string, session: string | null, guard: string, conf: number, plannedRR: number, n: number, rEach: number): BlockedRow[] {
  const out: BlockedRow[] = [];
  for (let i = 0; i < n; i++) out.push({ symbol, session, guard, confidence: conf, plannedRR, r: rEach, win: rEach > 0, resolved: true });
  return out;
}
function fillerBlocked(symbol: string, session: string | null, n: number): BlockedRow[] {
  return blocked(symbol, session, 'mtf_skip', 75, 2.5, n, 0.1);
}
function sliceOf(t: TakenRow[], b: BlockedRow[], key: string): SliceStats {
  const s = aggregateSlices(t, b).find((x) => x.key === key);
  if (!s) throw new Error(`slice ${key} missing`);
  return s;
}
const EUR = 'EURUSD', LON = 'London';

// ── A. Band math + aggregation ──────────────────────────────────────────────
check('A1 band edges: 69.9<70, 70→70-80, 87.9→80-88, 88→88-95, 95→95+',
  bandIndexFor(69.9) === 0 && bandIndexFor(70) === 1 && bandIndexFor(87.9) === 2 && bandIndexFor(88) === 3 && bandIndexFor(95) === 4 && bandIndexFor(100) === 4);
{
  const s = sliceOf(taken(EUR, LON, 85, 10, 6), [], sliceKey(EUR, LON));
  const band = s.bands.find((b) => b.band === '80-88')!;
  check('A2 band aggregation: n/winRate/avgR', band.n === 10 && band.winRate === 0.6 && band.avgR === 0.5, `n=${band.n} wr=${band.winRate} avgR=${band.avgR}`);
  check('A3 taken totals', s.takenN === 10 && s.takenWinRate === 0.6 && s.takenAvgR === 0.5);
}
{
  const t = [...taken(EUR, LON, 85, 10, 5), ...taken(EUR, 'New York', 85, 8, 4)];
  const roll = sliceOf(t, [], sliceKey(EUR, null));
  check('A4 pair rollup sums session slices', roll.takenN === 18 && roll.session === null);
  check('A5 slice keys', sliceKey(EUR, LON) === 'EURUSD|London' && sliceKey(EUR, null) === 'EURUSD|*');
}
{
  const b = [...blocked(EUR, LON, 'rr_gate_skip', 75, 1.8, 5, -1), ...blocked(EUR, LON, 'rr_gate_skip', 75, 2.5, 5, -1), ...blocked(EUR, LON, 'chase_skip', 75, 1.2, 5, 0.2)];
  const s = sliceOf([], b, sliceKey(EUR, LON));
  check('A6 sub-1:2 pool counts only rr_gate_skip with planned R:R in [1.5, 2)', s.rrSub12N === 5 && s.rrSub12SumR === -5, `n=${s.rrSub12N}`);
  check('A7 blocked totals count every resolved kind', s.blockedN === 15);
  check('A8 per-guard yields', s.guardYields.find((g) => g.guard === 'rr_gate_skip')?.n === 10 && s.guardYields.find((g) => g.guard === 'chase_skip')?.avgR === 0.2);
}

// ── B. Eligibility minimums ─────────────────────────────────────────────────
{
  const t29 = taken(EUR, LON, 85, 29, 20);
  check('B1 29 taken + 40 blocked → no recommendation', recommendForSlice(sliceOf(t29, fillerBlocked(EUR, LON, 40), sliceKey(EUR, LON))) === null);
  const t30 = taken(EUR, LON, 85, 30, 20);
  check('B2 30 taken + 29 blocked → no recommendation', recommendForSlice(sliceOf(t30, fillerBlocked(EUR, LON, 29), sliceKey(EUR, LON))) === null);
  const rec = recommendForSlice(sliceOf(t30, fillerBlocked(EUR, LON, 30), sliceKey(EUR, LON)));
  check('B3 30 taken + 30 blocked → recommendation exists', rec !== null && rec.confidenceFloor === 80, `floor=${rec?.confidenceFloor}`);
}

// ── C. Floor rule + clamps ──────────────────────────────────────────────────
{
  // 70-80 band loses (8/20 wins), 80-88 wins (11/20) → floor = 80.
  const t = [...taken(EUR, LON, 75, 20, 8), ...taken(EUR, LON, 85, 20, 11)];
  const rec = recommendForSlice(sliceOf(t, fillerBlocked(EUR, LON, 30), sliceKey(EUR, LON)));
  check('C1 lowest WINNING band sets the floor', rec?.confidenceFloor === 80, `floor=${rec?.confidenceFloor}`);
}
{
  // <70 band wins (9/15) but needs total taken >= 30: pad with a losing 80-88 band.
  const t = [...taken(EUR, LON, 65, 15, 9), ...taken(EUR, LON, 85, 20, 8)];
  const rec = recommendForSlice(sliceOf(t, fillerBlocked(EUR, LON, 30), sliceKey(EUR, LON)));
  check('C2 clamp low: <70 band winning → floor 60', rec?.confidenceFloor === 60, `floor=${rec?.confidenceFloor}`);
}
{
  // Only the 95+ band wins → its edge (95) clamps to 90.
  const t = [...taken(EUR, LON, 75, 12, 4), ...taken(EUR, LON, 97, 35, 21)];
  const rec = recommendForSlice(sliceOf(t, fillerBlocked(EUR, LON, 30), sliceKey(EUR, LON)));
  check('C3 clamp high: only 95+ winning → floor 90', rec?.confidenceFloor === 90, `floor=${rec?.confidenceFloor}`);
}
{
  // Eligible but no band wins half → no floor; with no RR evidence either → null overall.
  const t = [...taken(EUR, LON, 75, 20, 8), ...taken(EUR, LON, 85, 20, 9)];
  check('C4 no winning band + no RR evidence → null', recommendForSlice(sliceOf(t, fillerBlocked(EUR, LON, 30), sliceKey(EUR, LON))) === null);
}
{
  // A qualifying band with n < 10 must NOT set the floor.
  const t = [...taken(EUR, LON, 75, 9, 9), ...taken(EUR, LON, 85, 25, 10)];
  check('C5 band n=9 is too thin to set the floor', recommendForSlice(sliceOf(t, fillerBlocked(EUR, LON, 30), sliceKey(EUR, LON))) === null);
}

// ── D. Sub-1:2 threshold rule ───────────────────────────────────────────────
const quietTaken = () => taken(EUR, LON, 85, 35, 14); // 40% wins → no floor rec interference
{
  // Below 80 loses, at/above 80 fine → 80.
  const b = [...blocked(EUR, LON, 'rr_gate_skip', 75, 1.8, 12, -1), ...blocked(EUR, LON, 'rr_gate_skip', 90, 1.8, 10, 0.5), ...fillerBlocked(EUR, LON, 10)];
  const rec = recommendForSlice(sliceOf(quietTaken(), b, sliceKey(EUR, LON)));
  check('D1 below-80 negative, above fine → 80', rec?.rrHighConfThreshold === 80, `thr=${rec?.rrHighConfThreshold}`);
}
{
  // Below 80 positive, 80-88 drags below-88 negative, 88+ fine → 88 (loop beats the loosen special case).
  const b = [...blocked(EUR, LON, 'rr_gate_skip', 75, 1.8, 10, 0.3), ...blocked(EUR, LON, 'rr_gate_skip', 84, 1.8, 12, -1.5), ...blocked(EUR, LON, 'rr_gate_skip', 90, 1.8, 10, 0.5), ...fillerBlocked(EUR, LON, 5)];
  const rec = recommendForSlice(sliceOf(quietTaken(), b, sliceKey(EUR, LON)));
  check('D2 turns negative only under 88 → 88', rec?.rrHighConfThreshold === 88, `thr=${rec?.rrHighConfThreshold}`);
}
{
  // Negative at every level → 95.
  const b = [...blocked(EUR, LON, 'rr_gate_skip', 75, 1.8, 10, -1), ...blocked(EUR, LON, 'rr_gate_skip', 84, 1.8, 10, -1), ...blocked(EUR, LON, 'rr_gate_skip', 90, 1.8, 10, -1), ...blocked(EUR, LON, 'rr_gate_skip', 97, 1.8, 10, -0.5), ...fillerBlocked(EUR, LON, 2)];
  const rec = recommendForSlice(sliceOf(quietTaken(), b, sliceKey(EUR, LON)));
  check('D3 negative everywhere → 95', rec?.rrHighConfThreshold === 95, `thr=${rec?.rrHighConfThreshold}`);
}
{
  // Positive everywhere testable → loosen to the clamp floor 80.
  const b = [...blocked(EUR, LON, 'rr_gate_skip', 75, 1.8, 12, 0.4), ...blocked(EUR, LON, 'rr_gate_skip', 84, 1.8, 10, 0.2), ...blocked(EUR, LON, 'rr_gate_skip', 90, 1.8, 10, 0.3), ...fillerBlocked(EUR, LON, 5)];
  const rec = recommendForSlice(sliceOf(quietTaken(), b, sliceKey(EUR, LON)));
  check('D4 positive everywhere → loosen to 80', rec?.rrHighConfThreshold === 80, `thr=${rec?.rrHighConfThreshold}`);
}
{
  // Only 9 sub-1:2 counterfactuals → no threshold recommendation.
  const b = [...blocked(EUR, LON, 'rr_gate_skip', 75, 1.8, 9, -1), ...fillerBlocked(EUR, LON, 30)];
  const rec = recommendForSlice(sliceOf(quietTaken(), b, sliceKey(EUR, LON)));
  check('D5 thin sub-1:2 evidence → no threshold rec', rec === null || rec.rrHighConfThreshold === null, `thr=${rec?.rrHighConfThreshold}`);
}

// ── E. Resolution precedence ────────────────────────────────────────────────
{
  const dflt = { confidenceFloor: 74, rrHighConfThreshold: 88 };
  check('E1 exact wins per field, pair fills the rest',
    JSON.stringify(resolveGateThresholds({ confidenceFloor: 80, rrHighConfThreshold: null }, { confidenceFloor: 70, rrHighConfThreshold: 95 }, dflt)) === JSON.stringify({ confidenceFloor: 80, rrHighConfThreshold: 95 }));
  check('E2 no overrides → pure defaults',
    JSON.stringify(resolveGateThresholds(null, null, dflt)) === JSON.stringify(dflt));
  check('E3 pair-only override',
    JSON.stringify(resolveGateThresholds(null, { confidenceFloor: null, rrHighConfThreshold: 80 }, dflt)) === JSON.stringify({ confidenceFloor: 74, rrHighConfThreshold: 80 }));
}

// ── F. Kill switch ──────────────────────────────────────────────────────────
{
  delete process.env.GATE_CALIBRATION;
  check('F1 on by default', gateCalibrationOn() === true);
  process.env.GATE_CALIBRATION = 'off';
  check('F2 GATE_CALIBRATION=off disables', gateCalibrationOn() === false);
  delete process.env.GATE_CALIBRATION;
}

// ── G. Source pins ──────────────────────────────────────────────────────────
{
  const engine = src('../server/services/live-trading-engine.ts');
  const count = (hay: string, needle: string) => hay.split(needle).length - 1;
  check('G1 rr_gate_skip recorded at both R:R reject branches', count(engine, "recordBlockedTrade(userId, 'rr_gate_skip'") === 2);
  check('G2 confidence_floor_skip recorded at both floor rejects (adapted + hard)', count(engine, "recordBlockedTrade(userId, 'confidence_floor_skip'") === 2);
  check('G3 consult called exactly once (floor site resolves both thresholds)',
    count(engine, 'getGateCalibrationOverridesFor') === 2 && count(engine, 'resolveGateThresholds') === 2,
    `consult=${count(engine, 'getGateCalibrationOverridesFor')} resolve=${count(engine, 'resolveGateThresholds')}`);
  check('G4 R:R gate still rejects below 1.5 and uses the resolved threshold',
    engine.includes('if (rr < 1.5) {') && engine.includes('adjustedConfidence < _rrHiConf') && engine.includes('const _rrHiConf = _gcThresholds.rrHighConfThreshold;'));
  // Every new recordBlockedTrade call is immediately followed by the same
  // reject return as before — recording never alters the decision.
  let returnsIntact = true;
  for (const kind of ['rr_gate_skip', 'confidence_floor_skip']) {
    let idx = 0;
    while ((idx = engine.indexOf(`recordBlockedTrade(userId, '${kind}'`, idx)) !== -1) {
      const after = engine.slice(idx, idx + 700);
      if (!/state\.signalsGenerated\+\+;\s*\n\s*return;/.test(after)) returnsIntact = false;
      idx += 10;
    }
  }
  check('G5 every instrumentation call still ends in the original reject return', returnsIntact);

  const gc = src('../server/services/gate-calibration.ts');
  check('G6 calibration service never touches hard-gate machinery',
    !gc.includes('dailyLossLimit') && !gc.includes('marginLevel') && !gc.includes('maxDrawdown') && !gc.includes('newsBlackout'));
  check('G7 overrides persist in runtime_state gate_overrides + audit lane',
    gc.includes("OVR_SCOPE = 'gate_overrides'") && gc.includes("lane: 'gate_calibration'"));
  const ge = src('../server/services/guard-events.ts');
  check('G8 recordBlockedTrade stores session + plannedRR in context',
    ge.includes('plannedRR') && ge.includes('canonSession') && ge.includes('session, direction, entry_price'));
  const routes = src('../server/routes.ts');
  check('G9 routes exist (GET + apply + revert)',
    routes.includes('"/api/engine/gate-calibration"') && routes.includes('"/api/engine/gate-calibration/apply"') && routes.includes('"/api/engine/gate-calibration/revert"'));
  const gate = src('../server/services/shadow-lesson-gate.ts');
  check('G10 audit lane union includes gate_calibration', gate.includes("'gate_calibration'"));
  const guardsPage = src('../client/src/pages/guards-trails.tsx');
  const weekly = src('../client/src/pages/weekly-strategy.tsx');
  check('G11 panel renders on Guards & Trails ONLY', guardsPage.includes('GateCalibrationPanel') && !weekly.includes('GateCalibrationPanel'));
  check('G12 service worker bumped past vedd-v265 (v266 by the FX-models AI-regime build)', src('../client/public/sw.js').includes("vedd-v266"));
  check('G13 band table has the five specified bands', CONF_BANDS.map((b) => b.key).join(',') === '<70,70-80,80-88,88-95,95+');
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
