/**
 * Continuous improvement loop verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-improvement-loop.ts
 * (Run with DATABASE_URL unset: the store reads/writes are best-effort
 * and must degrade silently — the fail-open consults and the pure
 * state machine are what these checks exercise.)
 *
 * What is pinned:
 *   A. Source wiring — /api/health exports improvementLoop, index.ts
 *      starts the loop, and all four shadow entry paths (Kalshi perp,
 *      Sol, crypto, Studio) consult the throttle next to their own
 *      lesson gates. The service never imports a live-order module.
 *   B. Window math — 14d current vs 14d prior boundaries; accumulator
 *      → WindowStat derivation.
 *   C. Classification — IMPROVING at +0.1R, DEGRADING at −0.15R only
 *      when the win rate has not improved, INSUFFICIENT below the
 *      evidence bars, net-% fallback metric with its own thresholds.
 *   D. Throttle transitions — pause on degrading (shadow lanes only),
 *      no duplicate pause, resume on recovery, resume on 7-day expiry
 *      (and re-pause in the same pass if still degrading), insufficient
 *      evidence never lifts a pause early.
 *   E. Kill switch + fail-open — IMPROVEMENT_LOOP=off disables the
 *      consult and the evaluator; with no database the consult resolves
 *      false and the evaluation resolves null, never throwing.
 *   F. Snapshot shape — buildSnapshot carries windows + trends +
 *      throttle set; appendSnapshot caps history, newest last.
 */
import { readFileSync } from 'node:fs';

delete process.env.DATABASE_URL;
delete process.env.IMPROVEMENT_LOOP;

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passes++; else failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const loop = await import('../server/services/improvement-loop');
type WindowStat = import('../server/services/improvement-loop').WindowStat;
type StrategyTrend = import('../server/services/improvement-loop').StrategyTrend;
type ThrottleEntry = import('../server/services/improvement-loop').ThrottleEntry;

const stat = (trades: number, wins: number, avgR: number | null): WindowStat => ({
  trades, wins, winRate: trades > 0 ? wins / trades : null,
  rTrades: avgR == null ? 0 : trades, avgR, totalR: avgR == null ? null : avgR * trades,
  pctTrades: 0, avgPct: null, totalPct: null,
});
const pctStat = (trades: number, wins: number, avgPct: number | null): WindowStat => ({
  trades, wins, winRate: trades > 0 ? wins / trades : null,
  rTrades: 0, avgR: null, totalR: null,
  pctTrades: avgPct == null ? 0 : trades, avgPct, totalPct: avgPct == null ? null : avgPct * trades,
});
const trend = (engine: string, strategy: string, classification: StrategyTrend['classification'], throttleLane = true): StrategyTrend => ({
  userId: 1, engine, strategy, throttleLane, classification, metric: 'R', delta: 0,
  cur: stat(30, 12, 0), prior: stat(30, 12, 0),
});
const DAY = 24 * 3_600_000;
const NOW = Date.parse('2026-11-21T12:00:00Z');

// ── A. Source wiring ────────────────────────────────────────────────────
{
  const svc = src('../server/services/improvement-loop.ts');
  const routes = src('../server/routes.ts');
  const index = src('../server/index.ts');
  check('A1 /api/health exports the improvementLoop summary',
    routes.includes('improvementLoop:') && routes.includes('getImprovementLoopHealth()'));
  check('A2 index.ts starts the loop at boot', index.includes('startImprovementLoop()'));
  check('A3 Kalshi perp entry consults the throttle',
    src('../server/services/kalshi-stock-shadow.ts').includes("improvementThrottleBlocks(userId, 'kalshi_perp', sig.strategy)"));
  check('A4 Sol shadow entry consults the throttle',
    src('../server/services/sol-engine.ts').includes("improvementThrottleBlocks(userId, 'sol', strat.id)"));
  check('A5 crypto shadow entry consults the throttle',
    src('../server/services/crypto-shadow.ts').includes("improvementThrottleBlocks(userId, 'crypto', strat)"));
  check('A6 Studio shadow entry consults the throttle',
    src('../server/services/strategy-runner.ts').includes("improvementThrottleBlocks(dep.userId, 'studio', impKey)"));
  check('A7 snapshots persist to runtime_state scope improvement_snapshots',
    svc.includes("'improvement_snapshots'") && svc.includes('appendSnapshot'));
  check('A8 the evaluator registers in the loop registry', svc.includes("loopTick('improvement-loop'"));
  check('A9 the service imports no live-order module',
    !svc.includes('kalshi-perp-live') && !svc.includes('placeOrder') && !svc.includes('defi-executor'));
  check('A10 kill switch is read from IMPROVEMENT_LOOP', svc.includes("process.env.IMPROVEMENT_LOOP !== 'off'"));
  check('A11 evaluation reads the shared shadow_ledger view', svc.includes('FROM shadow_ledger'));
}

// ── B. Window math ──────────────────────────────────────────────────────
{
  const b = loop.windowBounds(NOW, 14);
  check('B1 curEnd is now', b.curEnd === NOW);
  check('B2 curStart is 14d before now', b.curStart === NOW - 14 * DAY);
  check('B3 priorStart is 28d before now', b.priorStart === NOW - 28 * DAY);
  const acc = loop.emptyAccum();
  loop.addToAccum(acc, { trades: 10, wins: 4, rTrades: 10, sumR: 2.5, pctTrades: 10, sumPct: 5 });
  loop.addToAccum(acc, { trades: 5, wins: 1, rTrades: 5, sumR: -0.5, pctTrades: 0, sumPct: 0 });
  const s = loop.accumToStat(acc);
  check('B4 accumulators merge counts', s.trades === 15 && s.wins === 5 && s.rTrades === 15);
  check('B5 avg R derives from summed R', s.avgR != null && Math.abs(s.avgR - 2 / 15) < 1e-9, `avgR=${s.avgR}`);
  check('B6 win rate derives from wins/trades', s.winRate != null && Math.abs(s.winRate - 5 / 15) < 1e-9);
  check('B7 empty stat has null averages', (() => { const e = loop.emptyWindowStat(); return e.avgR === null && e.winRate === null && e.trades === 0; })());
}

// ── C. Classification ───────────────────────────────────────────────────
{
  const th = loop.defaultClassifyThresholds();
  check('C1 delta exactly +0.1R is IMPROVING',
    loop.classifyTrend(stat(25, 10, 0.3), stat(10, 4, 0.2), th).classification === 'improving');
  check('C2 delta +0.09R is FLAT',
    loop.classifyTrend(stat(25, 10, 0.29), stat(10, 4, 0.2), th).classification === 'flat');
  check('C3 delta −0.15R with win rate down is DEGRADING',
    loop.classifyTrend(stat(25, 10, -0.1), stat(10, 5, 0.05), th).classification === 'degrading');
  check('C4 delta −0.30R but win rate improved is NOT degrading',
    loop.classifyTrend(stat(25, 15, -0.2), stat(10, 4, 0.1), th).classification === 'flat');
  check('C5 current window below 20 metric trades is INSUFFICIENT',
    loop.classifyTrend(stat(19, 8, -0.9), stat(30, 12, 0.5), th).classification === 'insufficient');
  check('C6 prior window below 5 metric trades is INSUFFICIENT',
    loop.classifyTrend(stat(30, 8, -0.9), stat(4, 2, 0.5), th).classification === 'insufficient');
  check('C7 no metric in either window is INSUFFICIENT with metric null',
    (() => { const c = loop.classifyTrend(stat(30, 8, null), stat(30, 12, null), th); return c.classification === 'insufficient' && c.metric === null; })());
  check('C8 net-% fallback: +1.0% delta is IMPROVING on the pct metric',
    (() => { const c = loop.classifyTrend(pctStat(30, 12, 2.0), pctStat(30, 12, 1.0), th); return c.classification === 'improving' && c.metric === 'pct'; })());
  check('C9 net-% fallback: −1.0% delta with win rate down is DEGRADING',
    loop.classifyTrend(pctStat(30, 10, -1.0), pctStat(30, 15, 0.0), th).classification === 'degrading');
  check('C10 net-% fallback: −0.5% delta is FLAT (below the 0.75 pct bar)',
    loop.classifyTrend(pctStat(30, 10, -0.5), pctStat(30, 15, 0.0), th).classification === 'flat');
  check('C11 R is preferred over pct when both exist',
    (() => {
      const cur: WindowStat = { ...stat(30, 12, 0.5), pctTrades: 30, avgPct: -5, totalPct: -150 };
      const prior: WindowStat = { ...stat(30, 12, 0.2), pctTrades: 30, avgPct: 5, totalPct: 150 };
      const c = loop.classifyTrend(cur, prior, th);
      return c.metric === 'R' && c.classification === 'improving';
    })());
}

// ── D. Throttle transitions ─────────────────────────────────────────────
{
  const pause = (engine: string, strategy: string, pausedUntilMs: number): ThrottleEntry => ({
    userId: 1, engine, strategy,
    pausedAt: new Date(NOW - DAY).toISOString(), pausedUntil: new Date(pausedUntilMs).toISOString(),
    reason: 'test pause',
  });
  const deg = trend('kalshi_perp', 'momentum', 'degrading');
  const r1 = loop.nextThrottleState([], [deg], NOW, 7);
  check('D1 degrading shadow strategy gets paused',
    r1.entries.length === 1 && r1.transitions.length === 1 && r1.transitions[0].type === 'pause');
  check('D2 pause lasts exactly the pause window (7d)',
    r1.entries.length === 1 && Date.parse(r1.entries[0].pausedUntil) === NOW + 7 * DAY);
  const r2 = loop.nextThrottleState([], [trend('fx', 'model1', 'degrading', false)], NOW, 7);
  check('D3 degrading NON-throttle lane (fx) is never paused', r2.entries.length === 0 && r2.transitions.length === 0);
  const existing = [pause('kalshi_perp', 'momentum', NOW + 3 * DAY)];
  const r3 = loop.nextThrottleState(existing, [deg], NOW, 7);
  check('D4 still-degrading + unexpired pause is kept with no transition',
    r3.entries.length === 1 && r3.transitions.length === 0);
  const r4 = loop.nextThrottleState(existing, [trend('kalshi_perp', 'momentum', 'flat')], NOW, 7);
  check('D5 recovered trend resumes the pause early',
    r4.entries.length === 0 && r4.transitions.length === 1 && r4.transitions[0].type === 'resume_recovery');
  const r5 = loop.nextThrottleState([pause('sol', 'dip_sniper', NOW - 1000)], [], NOW, 7);
  check('D6 expired pause with no fresh trend resumes on expiry',
    r5.entries.length === 0 && r5.transitions.length === 1 && r5.transitions[0].type === 'resume_expired');
  const r6 = loop.nextThrottleState([pause('kalshi_perp', 'momentum', NOW - 1000)], [deg], NOW, 7);
  check('D7 expired + still degrading resumes AND re-pauses in the same pass',
    r6.entries.length === 1 && r6.transitions.some((t) => t.type === 'resume_expired') && r6.transitions.some((t) => t.type === 'pause'));
  const r7 = loop.nextThrottleState(existing, [trend('kalshi_perp', 'momentum', 'insufficient')], NOW, 7);
  check('D8 insufficient evidence never lifts a pause early',
    r7.entries.length === 1 && r7.transitions.length === 0);
  const r8 = loop.nextThrottleState([], [trend('crypto', 'momentum', 'improving'), trend('studio', 'My Strat', 'flat')], NOW, 7);
  check('D9 improving/flat trends never pause anything', r8.entries.length === 0 && r8.transitions.length === 0);
}

// ── E. Kill switch + fail-open (no database in this process) ────────────
{
  check('E1 loop is on by default', loop.improvementLoopOn() === true);
  process.env.IMPROVEMENT_LOOP = 'off';
  check('E2 IMPROVEMENT_LOOP=off turns the loop off', loop.improvementLoopOn() === false);
  check('E3 consult returns false while the kill switch is off',
    (await loop.improvementThrottleBlocks(1, 'sol', 'dip_sniper')) === false);
  check('E4 evaluator is a no-op while the kill switch is off',
    (await loop.runImprovementEvaluation(NOW)) === null);
  delete process.env.IMPROVEMENT_LOOP;
  check('E5 consult FAILS OPEN with no database (resolves false, never throws)',
    (await loop.improvementThrottleBlocks(1, 'kalshi_perp', 'momentum')) === false);
  check('E6 evaluator fails soft with no database (resolves null)',
    (await loop.runImprovementEvaluation(NOW)) === null);
  const health = await loop.getImprovementLoopHealth();
  check('E7 health summary degrades to an empty shape with no database',
    health.enabled === true && health.lastEvaluationAt === null && health.throttleCount === 0);
}

// ── F. Snapshot shape ───────────────────────────────────────────────────
{
  const bounds = loop.windowBounds(NOW, 14);
  const trends = [trend('kalshi_perp', 'momentum', 'degrading'), trend('sol', 'dip_sniper', 'improving')];
  const throttled: ThrottleEntry[] = [{
    userId: 1, engine: 'kalshi_perp', strategy: 'momentum',
    pausedAt: new Date(NOW).toISOString(), pausedUntil: new Date(NOW + 7 * DAY).toISOString(), reason: 'r',
  }];
  const snap = loop.buildSnapshot(NOW, bounds, trends, throttled);
  check('F1 snapshot carries its evaluation time + both windows',
    snap.at === new Date(NOW).toISOString() && snap.curStart === new Date(bounds.curStart).toISOString()
    && snap.priorStart === new Date(bounds.priorStart).toISOString() && snap.priorEnd === snap.curStart);
  check('F2 snapshot carries trends and the throttle set',
    snap.strategies.length === 2 && snap.throttled.length === 1 && snap.strategies[0].classification === 'degrading');
  check('F3 snapshot survives a JSON round-trip (runtime_state jsonb shape)',
    (() => { const rt = JSON.parse(JSON.stringify(snap)); return rt.strategies[1].cur.avgR === 0 && rt.throttled[0].strategy === 'momentum'; })());
  let hist: import('../server/services/improvement-loop').ImprovementSnapshot[] = [];
  for (let i = 0; i < 5; i++) hist = loop.appendSnapshot(hist, { ...snap, at: new Date(NOW + i * 1000).toISOString() }, 3);
  check('F4 appendSnapshot caps history at the cap, newest last',
    hist.length === 3 && hist[2].at === new Date(NOW + 4000).toISOString() && hist[0].at === new Date(NOW + 2000).toISOString());
}

console.log(`\ncheck-improvement-loop: ${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
