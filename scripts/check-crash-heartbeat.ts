/**
 * Crash-heartbeat verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-crash-heartbeat.ts
 * (Run with DATABASE_URL unset: persistence is best-effort and must degrade
 * silently against the repo's localhost DB fallback, exactly like the
 * trail-brain checks rely on.)
 *
 * What is pinned:
 *   A. Loop registry — loopTick records name/timestamp/label/count and the
 *      registry snapshot reflects them.
 *   B. Kill switch — CRASH_HEARTBEAT=off disables (read dynamically).
 *   C. Worker witness — startCrashHeartbeat spawns a real worker thread
 *      whose heartbeat file appears, carries workerAt, and records the
 *      main thread's ping in lastMainMessageAt (the blocked-loop signal).
 *   D. Health shape — processHeartbeatHealth exposes current (bootId,
 *      loops incl. the heartbeat's own tick, worker mirror) + previousBoot.
 *   E. Source pins — persistence uses the memory trail's runtime_state
 *      mechanism ('crash_heartbeat'/'latest', captured before overwrite),
 *      cadences are 30s main / 15s worker, the worker writes atomically.
 *   F. Registry wiring — every named loop in the boot/engine paths ticks:
 *      the five required loops plus every 3/4/5/7-minute first-fire cycle
 *      found in the cadence audit of the Nov 16, 2026 crash loop (boots
 *      dying ~4–8 min after start, flat ~224 MB RSS, zero recorded errors).
 *   G. Chain hardening — the suspect self-re-arming chains (futures scan,
 *      FX scan, blog scheduler) re-arm in `finally` and record escaping
 *      errors by name through the process-errors persistence.
 *   H. Boot + health wiring — index.ts starts the heartbeat and uses
 *      safeInterval for the fx-brain check; /api/health exposes
 *      processHeartbeat.
 */
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Point the witness file at a scratch path BEFORE importing the module.
process.env.CRASH_HEARTBEAT_FILE = path.join(tmpdir(), `vedd-check-crash-heartbeat-${process.pid}.json`);
delete process.env.CRASH_HEARTBEAT;

const {
  loopTick, getLoopRegistry, crashHeartbeatEnabled, startCrashHeartbeat,
  readWorkerHeartbeat, processHeartbeatHealth,
} = await import('../server/crash-heartbeat');

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── A. Loop registry ─────────────────────────────────────────────────────────
{
  loopTick('check-loop', 'first');
  loopTick('check-loop');
  loopTick('other-loop', 'x');
  const reg = getLoopRegistry();
  check('A1 loopTick records the loop with a timestamp', !!reg['check-loop'] && typeof reg['check-loop'].lastTickAt === 'string');
  check('A2 tick count accumulates', reg['check-loop']?.ticks === 2);
  check('A3 label survives a later unlabeled tick', reg['check-loop']?.label === 'first');
  check('A4 distinct loops are independent', reg['other-loop']?.ticks === 1);
}

// ── B. Kill switch ───────────────────────────────────────────────────────────
{
  check('B1 enabled by default', crashHeartbeatEnabled() === true);
  process.env.CRASH_HEARTBEAT = 'off';
  check('B2 CRASH_HEARTBEAT=off disables', crashHeartbeatEnabled() === false);
  delete process.env.CRASH_HEARTBEAT;
  check('B3 re-enabled when the switch is removed', crashHeartbeatEnabled() === true);
}

// ── C. Worker witness (real worker thread) ───────────────────────────────────
{
  startCrashHeartbeat();
  await sleep(1200);
  const w = readWorkerHeartbeat();
  check('C1 witness worker writes its heartbeat file', !!w, w ? `workerAt=${w.workerAt}` : 'no record');
  check('C2 witness record carries process uptime', typeof w?.workerUptimeSeconds === 'number');
  check('C3 witness heard the main thread ping (lastMainMessageAt set)', typeof w?.lastMainMessageAt === 'string', `lastMainMessageAt=${w?.lastMainMessageAt ?? 'null'}`);
  const ageMs = w ? Date.now() - new Date(w.workerAt).getTime() : Number.POSITIVE_INFINITY;
  check('C4 witness beat is fresh (its own timer, not the main loop)', ageMs >= 0 && ageMs < 10_000, `age=${Math.round(ageMs)}ms`);
}

// ── D. Health shape ──────────────────────────────────────────────────────────
{
  const h = await processHeartbeatHealth();
  check('D1 health reports enabled + witness state', h.enabled === true && typeof h.witnessFailed === 'boolean');
  check('D2 current snapshot carries bootId + rss', typeof h.current.bootId === 'string' && typeof h.current.rssMB === 'number');
  check('D3 current snapshot includes the heartbeat loop itself', !!h.current.loops['crash-heartbeat']);
  check('D4 current snapshot includes earlier registry ticks', !!h.current.loops['check-loop']);
  check('D5 current snapshot mirrors the worker record', !!h.current.worker && typeof h.current.worker.workerAt === 'string');
  check('D6 previousBoot key is present (null or a record)', 'previousBoot' in h);
}

// ── E. Persistence + cadence source pins ─────────────────────────────────────
{
  const s = src('../server/crash-heartbeat.ts');
  check('E1 persists via runtime_state save (memory-trail mechanism)', s.includes("saveRuntimeState('crash_heartbeat', 'latest'"));
  check('E2 previous boot captured via strict read of the same key', s.includes("getRuntimeStateStrict('crash_heartbeat', 'latest')"));
  check('E3 previous boot is captured before overwrite (bootId guard)', s.includes('v.bootId !== PROCESS_BOOTED_AT'));
  check('E4 main heartbeat cadence is 30s', s.includes('const HEARTBEAT_MS = 30_000'));
  check('E5 worker cadence is 15s', s.includes('const WORKER_BEAT_MS = 15_000'));
  check('E6 worker thread is spawned', s.includes('new Worker('));
  check('E7 worker writes atomically (tmp + rename)', s.includes('writeFileSync') && s.includes('renameSync'));
  check('E8 worker records last-main-message (blocked-loop discriminator)', s.includes('lastMainMessageAt'));
  check('E9 kill switch honored in start', s.includes("process.env.CRASH_HEARTBEAT !== 'off'") && s.includes('if (!crashHeartbeatEnabled())'));
  check('E10 guarded-loop errors route to the process-errors recorder', s.includes("recordProcessError('guardedJob'"));
}

// ── F. Registry wiring across the boot/engine paths ──────────────────────────
{
  const wiring: Array<[string, string]> = [
    ['../server/services/futures-scanner.ts', 'futures-scanner'],
    ['../server/services/live-trading-engine.ts', 'fx-engine-scan'],
    ['../server/services/live-trading-engine.ts', 'fx-position-monitor'],
    ['../server/services/blog-scheduler.ts', 'blog-scheduler'],
    ['../server/services/engine-watchdog.ts', 'engine-watchdog'],
    ['../server/crash-heartbeat.ts', 'crash-heartbeat'],
    ['../server/index.ts', 'fx-brain-health'],
    ['../server/services/kalshi-stock-shadow.ts', 'kalshi-stock-shadow'],
    ['../server/services/kalshi-weather-shadow.ts', 'kalshi-weather-shadow'],
    ['../server/services/kalshi-sports-shadow.ts', 'kalshi-sports-shadow'],
    ['../server/services/kalshi-perp-live.ts', 'kalshi-perp-live'],
    ['../server/services/trail-brain-learning.ts', 'trail-brain-learning'],
    ['../server/services/social-autopilot.ts', 'social-autopilot'],
    ['../server/services/sol-follower.ts', 'sol-follower'],
    ['../server/services/sol-engine.ts', 'sol-engine'],
    ['../server/services/cryptocom-scanner.ts', 'crypto-scanner'],
    ['../server/services/strategy-runner.ts', 'strategy-runner'],
    ['../server/services/options-scanner.ts', 'options-scanner'],
    ['../server/services/dxtrade-sync.ts', 'dxtrade-sync'],
    ['../server/services/tradelocker-sync.ts', 'tradelocker-sync'],
    ['../server/services/fx-paper-monitor.ts', 'fx-paper-monitor'],
    ['../server/services/paper-trade-resolver-loop.ts', 'paper-trade-resolver'],
    ['../server/services/prop-firm-consistency-audit-loop.ts', 'prop-firm-consistency-audit'],
    ['../server/services/kalshi-engine.ts', 'kalshi-engine'],
    ['../server/services/polymarket-autonomous-engine.ts', 'polymarket-autonomous'],
    ['../server/services/polymarket-us-engine.ts', 'polymarket-us'],
  ];
  for (const [file, name] of wiring) {
    check(`F ${name} ticks the registry (${file.split('/').pop()})`, src(file).includes(`loopTick('${name}'`));
  }
}

// ── G. Suspect chains re-arm in finally + record by name ────────────────────
{
  const fut = src('../server/services/futures-scanner.ts');
  const futChain = fut.slice(fut.indexOf('function scheduleNextScan'), fut.indexOf('// ── Public API'));
  check('G1 futures chain re-arms in finally', futChain.includes('finally') && futChain.includes('scheduleNextScan(userId)'));
  check('G2 futures chain records escaping errors by name', futChain.includes("recordProcessError('guardedJob', err, 'futures-scanner')"));
  check('G3 futures first-scan kick starts the chain from finally', fut.includes(".finally(() => scheduleNextScan(config.userId))"));

  const fx = src('../server/services/live-trading-engine.ts');
  const fxChain = fx.slice(fx.indexOf('function scheduleScan'), fx.indexOf('// ── Sunday Gap Scanner'));
  check('G4 FX scan chain re-arms in finally', fxChain.includes('finally') && fxChain.includes('scheduleScan(userId)'));
  check('G5 FX scan chain records escaping errors by name', fxChain.includes("recordProcessError('guardedJob', err, 'fx-engine-scan')"));
  check('G6 FX engine start chain records + still starts scheduleScan on failure', fx.includes("recordProcessError('guardedJob', err, 'fx-engine-start')"));

  const blog = src('../server/services/blog-scheduler.ts');
  check('G7 blog scheduler re-arms in finally', blog.includes('finally') && blog.includes('scheduleNext();'));
  check('G8 blog scheduler records escaping errors by name', blog.includes("recordProcessError('guardedJob', err, 'blog-scheduler')"));
}

// ── H. Boot + health wiring ──────────────────────────────────────────────────
{
  const idx = src('../server/index.ts');
  check('H1 boot starts the crash heartbeat', idx.includes('startCrashHeartbeat()'));
  check('H2 fx-brain check runs on safeInterval', idx.includes("safeInterval('fx-brain-health'"));
  const routes = src('../server/routes.ts');
  check('H3 /api/health exposes processHeartbeat', routes.includes('processHeartbeat:') && routes.includes('processHeartbeatHealth'));
  const hb = src('../server/crash-heartbeat.ts');
  check('H4 health view carries previousBoot (main + worker)', hb.includes('previousBoot') && hb.includes('previousBootMain') && hb.includes('previousBootWorker'));
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
