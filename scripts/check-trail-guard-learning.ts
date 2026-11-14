/**
 * Trail-guard self-learning verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-trail-guard-learning.ts
 *
 * No database and no broker are touched: the verdict rule in
 * trail-guard-learning.ts is pure and is walked across every threshold,
 * and the wiring is pinned by source checks — retirement goes through
 * the REAL retire path marked retiredBy='lessons', no auto-promote path
 * exists in the learning module, attribution stamps are written only
 * where a guard actually governs an exit evaluation, the kill switch
 * gates evaluation only, and stats errors cannot retire (fail open).
 *
 *   A. evaluateGuardPerformance — verdict math at/above/below thresholds.
 *   B. harmDelta — native units per engine.
 *   C. Kill switch.
 *   D. Source pins — retire path, no auto-promote, attribution, fail-open.
 *   E. Column-existence lifecycle — the 2026-11-13 production failure
 *      `column "trail_guard_id" does not exist`: the columns were added
 *      to the Drizzle schema (so every storage.ts query on
 *      cryptocom_engine_trades names them) but were only CREATED by an
 *      ensure coupled to the guard-gated stamp path. Pins: every
 *      read/write path awaits its table's ensure first, both ensures
 *      are idempotent + memoized + non-rejecting, a boot warm-up runs
 *      them, and a stats read with no reachable database resolves null
 *      (fail open) instead of rejecting. Section E's runtime pins rely
 *      on the repo's localhost DB fallback refusing connections — run
 *      with DATABASE_URL/PGHOST unset, as in this repo's check setup.
 */
import { readFileSync } from 'node:fs';
import {
  evaluateGuardPerformance, harmDelta, trailGuardLearningOn, guardedStats,
  type GuardPerf,
} from '../server/services/trail-guard-learning';
import { ensureTrailGuardStampColumns, type TrailGuard } from '../server/services/trail-guards';
import { ensureSolTrailGuardColumns } from '../server/services/sol-shadow-stats';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const perf = (over: Partial<GuardPerf>): GuardPerf => ({ trades: 20, wins: 10, avgFinal: 0, avgGiveback: 0, ...over });
const CR = { minTrades: 10, delta: harmDelta('crypto'), unit: 'R' };

// ── A. Verdict math ──────────────────────────────────────────────────────
check('A1 unproven below the min-trades bar (9/10)',
  evaluateGuardPerformance(perf({ trades: 9, avgFinal: -5, avgGiveback: 9 }), perf({ avgFinal: 1, avgGiveback: 0.5 }), CR).verdict === 'unproven');
check('A2 judged at exactly the min-trades bar (10/10)',
  evaluateGuardPerformance(perf({ trades: 10, avgFinal: -5, avgGiveback: 9 }), perf({ avgFinal: 1, avgGiveback: 0.5 }), CR).verdict === 'hurting');
check('A3 helping: giveback down, closes not worse',
  evaluateGuardPerformance(perf({ avgFinal: 0.5, avgGiveback: 0.6 }), perf({ avgFinal: 0.4, avgGiveback: 1.1 }), CR).verdict === 'helping');
check('A4 helping requires giveback improvement (equal giveback + better closes = unproven/mixed)',
  evaluateGuardPerformance(perf({ avgFinal: 0.9, avgGiveback: 1.1 }), perf({ avgFinal: 0.4, avgGiveback: 1.1 }), CR).verdict === 'unproven');
check('A5 hurting rule 1: closes worse by exactly the harm delta (boundary, <=)',
  evaluateGuardPerformance(perf({ avgFinal: 0.25, avgGiveback: 0.2 }), perf({ avgFinal: 0.4, avgGiveback: 1.1 }), CR).verdict === 'hurting');
check('A6 just inside the harm delta with better giveback = unproven, not hurting',
  evaluateGuardPerformance(perf({ avgFinal: 0.26, avgGiveback: 0.2 }), perf({ avgFinal: 0.4, avgGiveback: 1.1 }), CR).verdict === 'unproven');
check('A7 hurting rule 2: giveback not improved at all while closes average negative',
  evaluateGuardPerformance(perf({ avgFinal: -0.05, avgGiveback: 1.2 }), perf({ avgFinal: 0.1, avgGiveback: 1.1 }), CR).verdict === 'hurting');
check('A8 rule 2 needs negative closes: unimproved giveback but positive closes = unproven',
  evaluateGuardPerformance(perf({ avgFinal: 0.05, avgGiveback: 1.2 }), perf({ avgFinal: 0.1, avgGiveback: 1.1 }), CR).verdict === 'unproven');
check('A9 no baseline = unproven, however bad the guarded record',
  evaluateGuardPerformance(perf({ avgFinal: -9, avgGiveback: 9 }), null, CR).verdict === 'unproven');
check('A10 baseline without avgFinal = unproven',
  evaluateGuardPerformance(perf({ avgFinal: -9, avgGiveback: 9 }), perf({ avgFinal: null, avgGiveback: 1 }), CR).verdict === 'unproven');
check('A11 guarded closes without measurable results = unproven',
  evaluateGuardPerformance(perf({ avgFinal: null, avgGiveback: null }), perf({ avgFinal: 0.4, avgGiveback: 1.1 }), CR).verdict === 'unproven');
check('A12 Sol units: 1.4-point drop is inside the Sol harm delta (1.5), 1.5 is hurting',
  evaluateGuardPerformance(perf({ avgFinal: 0.6, avgGiveback: 2 }), perf({ avgFinal: 2, avgGiveback: 9 }), { minTrades: 10, delta: harmDelta('sol'), unit: '%' }).verdict === 'unproven'
  && evaluateGuardPerformance(perf({ avgFinal: 0.5, avgGiveback: 2 }), perf({ avgFinal: 2, avgGiveback: 9 }), { minTrades: 10, delta: harmDelta('sol'), unit: '%' }).verdict === 'hurting');

// ── B. Harm delta ────────────────────────────────────────────────────────
check('B1 crypto harm delta is 0.15R', harmDelta('crypto') === 0.15);
check('B2 Sol harm delta is 1.5 percentage points', harmDelta('sol') === 1.5);

// ── C. Kill switch ───────────────────────────────────────────────────────
check('C1 learning on by default', trailGuardLearningOn() === true);
process.env.TRAIL_GUARD_LEARNING = 'off';
check('C2 TRAIL_GUARD_LEARNING=off disables learning', trailGuardLearningOn() === false);
delete process.env.TRAIL_GUARD_LEARNING;

// ── D. Source pins ───────────────────────────────────────────────────────
const learning = src('../server/services/trail-guard-learning.ts');
const guards = src('../server/services/trail-guards.ts');
const scanner = src('../server/services/cryptocom-scanner.ts');
const solEngine = src('../server/services/sol-engine.ts');
const solStats = src('../server/services/sol-shadow-stats.ts');
const routes = src('../server/routes.ts');
const panel = src('../client/src/components/engine-safeguards-panel.tsx');

check('D1 retirement goes through the real retire path, marked lessons',
  /retireTrailGuard\(userId, guard\.id, 'lessons', reason\)/.test(learning));
check('D2 retire path defaults to user (the UI retire is unchanged)',
  /retiredBy: 'user' \| 'lessons' = 'user'/.test(guards) && /retireTrailGuard\(\(req\.user as User\)\.id, String\(id\)\)/.test(routes));
check('D3 the learning module contains NO promote path (promotion stays the user tap)',
  !/promoteTrailGuard/.test(learning) && !/storeGuards/.test(learning));
check('D4 audit rows go to the shared table with lane trail_guard',
  /lane: 'trail_guard'/.test(learning) && /logShadowLessonBlock/.test(learning));
check('D5 kill switch gates the evaluation loop',
  /if \(!trailGuardLearningOn\(\)\) return;/.test(learning));
check('D6 fail open: a per-guard stats error is caught and never retires',
  /eval failed for guard/.test(learning) && /catch \(e: any\) \{\s*\n\s*\/\/ Fail open/.test(learning));
check('D7 verdicts persist to runtime_state trail_guard_evals',
  /EVAL_SCOPE = 'trail_guard_evals'/.test(learning) && /saveRuntimeState\(EVAL_SCOPE/.test(learning));
check('D8 crypto stamp: written from the monitor only when a guard governs',
  /if \(tgGuard\) void stampCryptoTradeTrailGuard\(userId, trade\.id, tgGuard\)/.test(scanner)
  && /ADD COLUMN IF NOT EXISTS trail_guard_id/.test(guards));
check('D9 crypto consult returns the guard (identity), profile consult delegates',
  /export async function cryptoTrailGuardFor/.test(guards) && /export async function solTrailGuardFor/.test(guards));
check('D10 Sol stamp: context columns exist and the close write carries the guard',
  /ADD COLUMN IF NOT EXISTS trail_guard_id/.test(solStats) && /trailGuardId: pos\.trailGuardId/.test(solEngine));
check('D11 Sol live exits untouched: guard consult appears only in paper + shadow monitors (2 sites)',
  (solEngine.match(/solTrailGuardFor\(userId, pos\.strategyId, pos\.symbol\)/g) || []).length === 2);
check('D12 panel renders the self-check line and the retired-by-lessons list',
  /Self-check:/.test(panel) && /Retired by their own record/.test(panel) && /retiredBy === "lessons"/.test(panel));
check('D13 panel endpoint attaches evaluations',
  /out\.evaluations = await learning\.getTrailGuardEvaluations/.test(routes));
check('D14 sweep enumerates only users holding guards, watchdog idiom',
  /loadRuntimeState\('trail_guards'\)/.test(learning) && /setInterval/.test(learning));

// ── E. Column-existence lifecycle (2026-11-13 trail_guard_id failure) ────
const storage = src('../server/storage.ts');
check('E1 storage: every cryptocom_engine_trades method awaits the stamp-column ensure first',
  /import \{ ensureTrailGuardStampColumns \} from "\.\/services\/trail-guards";/.test(storage)
  && (storage.match(/await ensureTrailGuardStampColumns\(\);/g) || []).length >= 15,
  `${(storage.match(/await ensureTrailGuardStampColumns\(\);/g) || []).length} ensured methods`);
check('E2 learning reads await the per-table ensure before naming trail_guard_id (both engines)',
  /await ensureTrailGuardStampColumns\(\);\s*\n\s*const \{ rows \} = await pool\.query\([\s\S]{0,900}?trail_guard_id = \$2/.test(learning)
  && /await ensureSolTrailGuardColumns\(\);\s*\n\s*const \{ rows \} = await pool\.query\([\s\S]{0,900}?trail_guard_id = \$2/.test(learning));
check('E3 learning no longer couples its Sol reads to the whole-table ensure',
  !/ensureSolShadowContextTable/.test(learning) && /ensureSolTrailGuardColumns/.test(learning));
check('E4 both ensures are non-rejecting by construction (catch logs + resets memo, never rethrows)',
  /stamp-column ensure failed \(non-fatal, will retry\)/.test(guards) && !/catch\(\(e\) => \{ _colsEnsured = null; throw e; \}\)/.test(guards)
  && /trail-guard column ensure failed \(non-fatal, will retry\)/.test(solStats) && /_trailColsEnsured = null;/.test(solStats));
check('E5 both ensures are idempotent + memoized',
  (guards.match(/ADD COLUMN IF NOT EXISTS trail_guard/g) || []).length === 3 && /let _colsEnsured/.test(guards)
  && (solStats.match(/ADD COLUMN IF NOT EXISTS trail_guard/g) || []).length >= 3 && /let _trailColsEnsured/.test(solStats));
check('E6 boot warm-up: startTrailGuardLearning fires both ensures immediately',
  /void ensureTrailGuardStampColumns\(\);\s*\n\s*void ensureSolTrailGuardColumns\(\);/.test(learning));
check('E7 the loop writes NO eval record when guarded stats are unreadable (null = skip)',
  /if \(!guarded\) continue;/.test(learning));

// Runtime pins — no database is reachable in the check environment
// (localhost fallback refuses), which is exactly the degraded state the
// fail-open contract exists for: ensures must RESOLVE, reads must
// resolve null, and nothing may reject.
const fakeGuard: TrailGuard = {
  id: 'check-guard', engine: 'crypto', dimension: 'strategy', key: 'check',
  action: 'tighten', trades: 0, avgFinal: null, avgPeak: null, avgGiveback: null,
  trailExitShare: null,
  profile: { method: 'fixed_r', activationR: 1, fixedR: 0.5, stepR: 0.5, profitLockPct: 50, sarInitialAF: 0.02, sarMaxAF: 0.2, breakevenBufferR: 0 },
  profileSummary: 'check', promotedAt: new Date(0).toISOString(), active: true,
};
(async () => {
  let e8 = true;
  try { await ensureTrailGuardStampColumns(); await ensureTrailGuardStampColumns(); await ensureTrailGuardStampColumns(); }
  catch { e8 = false; }
  check('E8 crypto ensure resolves (never rejects) with no reachable database, repeatedly', e8);
  let e9 = true;
  try { await ensureSolTrailGuardColumns(); await ensureSolTrailGuardColumns(); }
  catch { e9 = false; }
  check('E9 Sol ensure resolves (never rejects) with no reachable database, repeatedly', e9);
  const cryptoRead = await guardedStats(1, fakeGuard).then(v => v === null ? 'null' : 'value', () => 'rejected');
  check('E10 crypto guarded-stats read degrades fail-open (resolves null, never rejects)', cryptoRead === 'null', cryptoRead);
  const solRead = await guardedStats(1, { ...fakeGuard, engine: 'sol' }).then(v => v === null ? 'null' : 'value', () => 'rejected');
  check('E11 Sol guarded-stats read degrades fail-open (resolves null, never rejects)', solRead === 'null', solRead);

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
  process.exit(failures ? 1 : 0);
})();
