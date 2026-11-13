/**
 * Shadow lesson gates — "all shadow lanes act on their own lessons" —
 * verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-shadow-lessons-gate.ts
 *
 * No database and no broker are touched: the verdict helpers in
 * shadow-lesson-gate.ts are pure and are walked across every threshold
 * (including the rehabilitation direction — a rolling window clearing
 * is what lifts a block), and the wiring is pinned by source checks:
 * every gate consults ONLY its own lane's rows, every gate writes the
 * shared shadow_lesson_blocks audit table before it skips, the FX
 * veto lives in the live recording path only (decideModelIdeas and
 * the 14-day replay stay unbiased), and mastery counting excludes
 * lesson_gate rows exactly like guard_block rows.
 *
 *   A. promotionBarLoser — the platform lesson bar (Sol + FX slices).
 *   B. matchingAvoidBucket — the crypto bucket gate shape.
 *   C. studioDeploymentProvenLosing — the inverted shadow-proof bar.
 *   D. Kill switches default ON and respond to =off.
 *   E. Source pins — per-lane wiring, isolation, audit, replay safety.
 */
import { readFileSync } from 'node:fs';
import {
  promotionBarLoser, matchingAvoidBucket, studioDeploymentProvenLosing,
  solShadowLessonsOn, cryptoShadowLessonsOn, studioShadowLessonsOn, fxModelsLessonGateOn,
  type BucketVerdictStat,
} from '../server/services/shadow-lesson-gate';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── A. promotionBarLoser ────────────────────────────────────────────────
check('A1 dead-on-the-bar blocks', promotionBarLoser({ trades: 50, wins: 20, avgR: -0.2 }) === true);
check('A2 49 trades never blocks', promotionBarLoser({ trades: 49, wins: 0, avgR: -3 }) === false);
check('A3 avgR -0.19 does not block', promotionBarLoser({ trades: 80, wins: 10, avgR: -0.19 }) === false);
check('A4 win rate 41% does not block', promotionBarLoser({ trades: 100, wins: 41, avgR: -0.5 }) === false);
check('A5 win rate exactly 40% blocks', promotionBarLoser({ trades: 100, wins: 40, avgR: -0.5 }) === true);
check('A6 a winning week rehabilitates (weekly clause)', promotionBarLoser({ trades: 60, wins: 10, avgR: -0.6, weeklyR: [-4, -2, 0.3] }) === false);
check('A7 no winning week blocks', promotionBarLoser({ trades: 60, wins: 10, avgR: -0.6, weeklyR: [-4, -2, 0] }) === true);
check('A8 rehabilitation by window roll: old losses age out, sample drops under the bar',
  promotionBarLoser({ trades: 50, wins: 12, avgR: -0.45 }) === true && promotionBarLoser({ trades: 44, wins: 12, avgR: -0.45 }) === false);
check('A9 rehabilitation by recovery: avg R climbs back over -0.2 as the worst weeks exit',
  promotionBarLoser({ trades: 70, wins: 20, avgR: -0.1 }) === false);

// ── B. matchingAvoidBucket ──────────────────────────────────────────────
const stat = (over: Partial<BucketVerdictStat>): BucketVerdictStat => ({
  strategy: 'breakout', dim: 'all', bucket: 'all', n: 30, medianNet: -1.6, winRate: 0.3, verdict: 'avoid', ...over,
});
check('B1 overall avoid condemns any context', matchingAvoidBucket([stat({})], 'breakout', { liquidity: '1-5M' })?.dim === 'all');
check('B2 context-bucket avoid condemns its context',
  matchingAvoidBucket([stat({ dim: 'liquidity', bucket: '<250k' })], 'breakout', { liquidity: '<250k' })?.bucket === '<250k');
check('B3 context-bucket avoid spares other contexts', matchingAvoidBucket([stat({ dim: 'liquidity', bucket: '<250k' })], 'breakout', { liquidity: '1-5M' }) === null);
check('B4 learning verdict never condemns', matchingAvoidBucket([stat({ verdict: 'learning' })], 'breakout', {}) === null);
check('B5 favor verdict never condemns', matchingAvoidBucket([stat({ verdict: 'favor', medianNet: 1.2 })], 'breakout', {}) === null);
check('B6 another strategy’s avoid never condemns', matchingAvoidBucket([stat({ strategy: 'momentum' })], 'breakout', {}) === null);
check('B7 includeAll=false leaves the overall bucket out', matchingAvoidBucket([stat({})], 'breakout', {}, { includeAll: false }) === null);
check('B8 rehabilitation: verdict rolls from avoid to learning → no block',
  matchingAvoidBucket([stat({ verdict: 'learning', medianNet: -0.4 })], 'breakout', {}) === null);

// ── C. studioDeploymentProvenLosing ─────────────────────────────────────
check('C1 clearly losing pauses', studioDeploymentProvenLosing({ rTrades: 30, wins: 12, avgR: -0.2 }) === true);
check('C2 29 R-bearing closes never pauses', studioDeploymentProvenLosing({ rTrades: 29, wins: 0, avgR: -3 }) === false);
check('C3 merely unproven (avg -0.1) never pauses', studioDeploymentProvenLosing({ rTrades: 60, wins: 20, avgR: -0.1 }) === false);
check('C4 win rate 41% never pauses', studioDeploymentProvenLosing({ rTrades: 50, wins: 21, avgR: -0.5 }) === false);
check('C5 no R record never pauses', studioDeploymentProvenLosing({ rTrades: 0, wins: 0, avgR: null }) === false);
check('C6 rehabilitation: window rolls, sample drops under 30 → no pause',
  studioDeploymentProvenLosing({ rTrades: 30, wins: 5, avgR: -0.9 }) === true && studioDeploymentProvenLosing({ rTrades: 24, wins: 5, avgR: -0.9 }) === false);

// ── D. kill switches ────────────────────────────────────────────────────
check('D1 all four gates default ON', solShadowLessonsOn() && cryptoShadowLessonsOn() && studioShadowLessonsOn() && fxModelsLessonGateOn());
process.env.SOL_SHADOW_LESSONS = 'off'; process.env.CRYPTO_SHADOW_LESSONS = 'off';
process.env.STUDIO_SHADOW_LESSONS = 'off'; process.env.FX_MODELS_LESSON_GATE = 'off';
check('D2 =off disables each gate', !solShadowLessonsOn() && !cryptoShadowLessonsOn() && !studioShadowLessonsOn() && !fxModelsLessonGateOn());
delete process.env.SOL_SHADOW_LESSONS; delete process.env.CRYPTO_SHADOW_LESSONS;
delete process.env.STUDIO_SHADOW_LESSONS; delete process.env.FX_MODELS_LESSON_GATE;

// ── E. source pins ──────────────────────────────────────────────────────
const gate = src('../server/services/shadow-lesson-gate.ts');
const sol = src('../server/services/sol-engine.ts');
const crypto = src('../server/services/crypto-shadow.ts');
const runner = src('../server/services/strategy-runner.ts');
const deployments = src('../server/services/strategy-deployments.ts');
const fx = src('../server/services/fx-models.ts');
const replay = src('../server/services/fx-models-replay.ts');

check('E1 shared audit table exists', gate.includes('CREATE TABLE IF NOT EXISTS shadow_lesson_blocks'));
check('E2 Sol gate reads the ledger sol_shadow arm only', gate.includes("source='sol_shadow'") && gate.includes('FROM shadow_ledger'));
check('E3 Sol gate wired per strategy (never per token)', sol.includes('getSolShadowLessonVerdicts') && sol.includes('lessonVerdicts?.get(strat.id)'));
check('E4 Sol gate audits its blocks', sol.includes("lane: 'sol_shadow'") && sol.includes('logShadowLessonBlock'));
check('E5 Crypto gate matches on the lane’s own bucket stats', crypto.includes('matchingAvoidBucket(stats, strat, bucketsOf(ctx)') && crypto.includes("lane: 'crypto_shadow'"));
check('E6 Studio gate graded per deployment from its own shadow rows',
  runner.includes("mode='shadow' AND status='closed'") && runner.includes('deployment_id=$1') && runner.includes('studioDeploymentProvenLosing'));
check('E7 Studio pause marker is a deployment field, not the error path',
  deployments.includes('lesson_paused_at') && deployments.includes('setDeploymentLessonPause') && runner.includes("lane: 'studio_shadow'"));
check('E8 FX gate reads own-source rows only', fx.includes("source='own' AND result IN ('WIN','LOSS','EXPIRED')") && fx.includes('getDeadSlices'));
check('E9 FX veto writes the Stage-B blocked shape', fx.includes("'blocked'") && fx.includes("'lesson_gate'") && fx.includes("guard: 'lesson_gate'"));
check('E10 mastery counting excludes lesson_gate exactly like guard_block', fx.includes("source NOT IN ('guard_block','lesson_gate')"));
const decideBody = fx.slice(fx.indexOf('export async function decideModelIdeas'), fx.indexOf('function formatMasteryLines'));
check('E11 decideModelIdeas carries NO lesson veto (shared path stays unbiased)',
  !decideBody.includes('lesson_gate') && !decideBody.includes('getDeadSlices') && !decideBody.includes('logShadowLessonBlock'));
check('E12 the 14-day replay has NO lesson veto', !replay.includes('lesson_gate') && !replay.includes('getDeadSlices') && !replay.includes('logShadowLessonBlock'));
check('E13 every lane gate checks its kill switch',
  sol.includes('solShadowLessonsOn()') && crypto.includes('cryptoShadowLessonsOn()') && runner.includes('studioShadowLessonsOn()') && fx.includes('fxModelsLessonGateOn()'));
check('E14 block logger throttles duplicate audit rows', gate.includes('SHADOW_LESSON_BLOCK_LOG_THROTTLE_MIN') && gate.includes('NOT EXISTS'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL PASS');
process.exit(failures ? 1 : 0);
