/**
 * Stall-capture verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-stall-capture.ts
 * (Run with DATABASE_URL unset: heartbeat persistence is best-effort and
 * must degrade silently, exactly like the crash-heartbeat checks rely on.)
 *
 * What is pinned:
 *   A. Kill switches + constants — CRASH_STALL_CAPTURE=off and
 *      CRASH_HEARTBEAT=off both disable capture (read dynamically);
 *      production defaults are a 20s stall threshold and an 8s profile.
 *   B. Profile aggregator — top functions by self-sample count, merged
 *      across nodes, file:// stripped, 0-based lines made 1-based, and
 *      the samples-array fallback when hitCount is absent.
 *   C. Source pins — inspector bound to 127.0.0.1 on an ephemeral port,
 *      worker-side stall detection, Profiler route + Debugger fallback,
 *      stall file beside the witness file, health wiring for lastStall.
 *   D. Runtime shape — startCrashHeartbeat opens the inspector on
 *      localhost and health carries lastStall + the lag-spike ring.
 *   E. Lag breadcrumbs — a ~3.6s main-thread block records a ≥2s lag
 *      spike (and stays under the test stall threshold, so no capture).
 *   F. FORCED STALL (the real proof) — the main loop is busy-blocked for
 *      ~25s in distinctively named functions; the witness worker must
 *      detect the stall and capture the frozen thread, and the captured
 *      top functions must NAME the blocking function. Health must then
 *      surface it as lastStall with a numeric duration.
 *
 * Test timing uses env overrides (threshold 6s, capture 3s) with generous
 * margins; production values stay pinned by section A/C.
 */
import { readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Point the witness/stall files at scratch paths and shrink the capture
// timings BEFORE importing the module.
process.env.CRASH_HEARTBEAT_FILE = path.join(tmpdir(), `vedd-check-stall-capture-${process.pid}.json`);
process.env.CRASH_STALL_THRESHOLD_MS = '6000';
process.env.CRASH_STALL_CAPTURE_MS = '3000';
delete process.env.CRASH_HEARTBEAT;
delete process.env.CRASH_STALL_CAPTURE;
delete process.env.CRASH_STALL_FILE;

const {
  stallCaptureEnabled, crashHeartbeatEnabled, startCrashHeartbeat,
  aggregateCpuProfile, toStallHealthView, readStallRecord, stallFilePath,
  getInspectorUrl, processHeartbeatHealth,
  STALL_THRESHOLD_MS, STALL_CAPTURE_MS,
} = await import('../server/crash-heartbeat');

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── A. Kill switches + production constants ──────────────────────────────────
{
  check('A1 stall capture enabled by default', stallCaptureEnabled() === true);
  process.env.CRASH_STALL_CAPTURE = 'off';
  check('A2 CRASH_STALL_CAPTURE=off disables capture', stallCaptureEnabled() === false);
  delete process.env.CRASH_STALL_CAPTURE;
  process.env.CRASH_HEARTBEAT = 'off';
  check('A3 CRASH_HEARTBEAT=off disables capture too', stallCaptureEnabled() === false && crashHeartbeatEnabled() === false);
  delete process.env.CRASH_HEARTBEAT;
  check('A4 re-enabled when the switches are removed', stallCaptureEnabled() === true);
  check('A5 production stall threshold is 20s', STALL_THRESHOLD_MS === 20_000);
  check('A6 production profile capture is 8s', STALL_CAPTURE_MS === 8_000);
}

// ── B. Profile aggregator (synthetic fixture) ────────────────────────────────
{
  const fixture = {
    nodes: [
      { id: 1, callFrame: { functionName: '(root)', url: '', lineNumber: -1 }, hitCount: 0 },
      { id: 2, callFrame: { functionName: 'busyFn', url: 'file:///app/server/engine.ts', lineNumber: 41 }, hitCount: 90 },
      { id: 3, callFrame: { functionName: 'helper', url: 'file:///app/server/util.ts', lineNumber: 9 }, hitCount: 10 },
      { id: 4, callFrame: { functionName: 'busyFn', url: 'file:///app/server/engine.ts', lineNumber: 41 }, hitCount: 5 },
      { id: 5, callFrame: { functionName: '', url: 'file:///app/server/anon.ts', lineNumber: 0 }, hitCount: 3 },
    ],
    samples: [],
    timeDeltas: [],
  };
  const agg = aggregateCpuProfile(fixture);
  check('B1 hottest function first, nodes merged by name+file+line', agg[0]?.function === 'busyFn' && agg[0]?.samples === 95, JSON.stringify(agg[0]));
  check('B2 file:// prefix stripped', agg[0]?.file === '/app/server/engine.ts');
  check('B3 line made 1-based', agg[0]?.line === 42);
  check('B4 sorted descending by samples', agg.length >= 2 && agg[0].samples >= agg[1].samples);
  check('B5 empty V8 name becomes (anonymous)', agg.some((f) => f.function === '(anonymous)' && f.samples === 3));

  const noHitCounts = {
    nodes: [
      { id: 2, callFrame: { functionName: 'busyFn', url: 'file:///x.ts', lineNumber: 0 } },
      { id: 3, callFrame: { functionName: 'helper', url: 'file:///y.ts', lineNumber: 0 } },
    ],
    samples: [2, 2, 2, 3],
    timeDeltas: [1000, 1000, 1000, 1000],
  };
  const agg2 = aggregateCpuProfile(noHitCounts);
  check('B6 samples-array fallback when hitCount is absent', agg2[0]?.function === 'busyFn' && agg2[0]?.samples === 3, JSON.stringify(agg2[0]));
  check('B7 garbage profile aggregates to empty', Array.isArray(aggregateCpuProfile(null)) && aggregateCpuProfile(null).length === 0);
}

// ── C. Source pins ───────────────────────────────────────────────────────────
{
  const s = src('../server/crash-heartbeat.ts');
  check('C1 stall threshold constant pinned at 20s', s.includes('export const STALL_THRESHOLD_MS = 20_000'));
  check('C2 capture duration constant pinned at 8s', s.includes('export const STALL_CAPTURE_MS = 8_000'));
  check('C3 inspector bound to 127.0.0.1 on an ephemeral port', s.includes("inspector.open(0, '127.0.0.1', false)"));
  check('C4 stall-capture kill switch honored', s.includes("process.env.CRASH_STALL_CAPTURE !== 'off'"));
  check('C5 worker receives the inspector URL + thresholds', s.includes('inspectorUrl: stallCaptureEnabled() ? inspectorUrl : null') && s.includes('stallThresholdMs: stallThresholdMs()'));
  check('C6 worker declares a stall on ping silence', s.includes('function checkStall()') && s.includes('workerData.stallThresholdMs'));
  check('C7 capture route is the sampling Profiler', s.includes("client.call('Profiler.start')") && s.includes("client.call('Profiler.stop')"));
  check('C8 fallback route is Debugger.pause', s.includes("client.call('Debugger.pause')") && s.includes('Debugger.paused'));
  check('C9 stall file lives beside the witness file', s.includes("-stall.json") && s.includes('stallFile: stallFilePath()'));
  check('C10 lag monitor records spikes at the 2s threshold', s.includes('const LAG_SPIKE_MS = 2_000') && s.includes('recordLagSpike(lag)'));
  check('C11 snapshot carries lag spikes + last stall', s.includes('lagSpikes: getLagSpikes()') && s.includes('lastStall: toStallHealthView(currentStall)'));
  check('C12 health exposes lastStall (current) and previousBoot.lastStall', s.includes('lastStall: toStallHealthView(currentStall)') && s.includes('toStallHealthView(previousBootStall)'));
  check('C13 previous boot stall captured before overwrite (bootId guard)', s.includes('rec.bootId !== PROCESS_BOOTED_AT'));
  check('C14 main thread pings the witness from the lag monitor', s.includes('pingWitness();'));
}

// ── G. Stall health view mapping (the previousBoot semantics) ────────────────
{
  const dead = toStallHealthView({
    bootId: 'some-dead-boot', stallStartedAt: '2026-11-17T12:55:13.000Z', detectedAt: '2026-11-17T12:55:34.000Z',
    capturedAt: '2026-11-17T12:55:43.000Z', resumedAt: null, durationSeconds: null,
    captureMethod: 'profiler', topFunctions: [{ function: 'spin', file: '/x.ts', line: 1, samples: 7000 }],
  });
  check('G1 a never-resumed stall reads as ongoing', dead?.durationSeconds === 'ongoing');
  check('G2 view carries method + top functions', dead?.captureMethod === 'profiler' && dead?.topFunctions[0]?.function === 'spin');
  const resumed = toStallHealthView({
    bootId: 'b', stallStartedAt: '2026-11-17T12:00:00.000Z', detectedAt: '2026-11-17T12:00:21.000Z',
    capturedAt: '2026-11-17T12:00:30.000Z', resumedAt: '2026-11-17T12:00:45.000Z', durationSeconds: null,
    captureMethod: 'debugger', topFunctions: [],
  });
  check('G3 a resumed stall computes its duration', resumed?.durationSeconds === 45, `got ${resumed?.durationSeconds}`);
  check('G4 null record maps to null view', toStallHealthView(null) === null);
}

// ── D. Runtime shape: inspector + health ─────────────────────────────────────
{
  startCrashHeartbeat();
  await sleep(1500);
  const url = getInspectorUrl();
  check('D1 inspector opened on localhost with an ephemeral port', !!url && /^ws:\/\/127\.0\.0\.1:\d+\//.test(url), url ?? 'null');
  check('D2 stall file path derives beside the witness file', stallFilePath().endsWith('-stall.json'), stallFilePath());
  const h = await processHeartbeatHealth();
  check('D3 health carries the lastStall key (null before any stall)', 'lastStall' in h && h.lastStall === null);
  check('D4 current snapshot carries the lag-spike ring', Array.isArray(h.current.lagSpikes));
  check('D5 current snapshot carries lastStall', 'lastStall' in h.current);
}

// ── E. Lag breadcrumbs ───────────────────────────────────────────────────────
function busyWait(ms: number): void {
  const end = Date.now() + ms;
  let x = 0;
  while (Date.now() < end) { x += Math.sqrt(Math.abs(x) + 1.7); }
  (globalThis as any).__lagSink = x;
}
{
  busyWait(3600); // ~2.6s of measured drift — a spike, but under the 6s test stall threshold
  await sleep(1500); // let the drift monitor tick and record
  const h = await processHeartbeatHealth();
  const spike = h.current.lagSpikes[h.current.lagSpikes.length - 1];
  check('E1 the block recorded a lag spike', !!spike, `spikes=${h.current.lagSpikes.length}`);
  check('E2 spike lag is at least the 2s threshold', (spike?.lagMs ?? 0) >= 2000, `lagMs=${spike?.lagMs}`);
  check('E3 spike carries the freshest loop ticks as breadcrumbs', Array.isArray(spike?.recentLoops) && spike.recentLoops.length > 0);
  check('E4 no stall was captured for a sub-threshold block', h.lastStall === null && !existsSync(stallFilePath()));
}

// ── F. FORCED STALL — the worker must capture the blocking function ─────────
// The spinner is RECURSIVE on purpose: TurboFan fully inlines small
// non-recursive helpers into the anonymous module top-level frame (the
// profile then names nothing), while a self-recursive function is never
// inlined and keeps its named frame — the same shape as real blocking
// code sitting in a deep service call stack.
function stallCaptureSpinRecursive(depth: number): number {
  if (depth > 0) return stallCaptureSpinRecursive(depth - 1);
  let x = 0;
  for (let i = 0; i < 50_000; i++) x += Math.sqrt(i + 1.7);
  return x;
}
function stallCaptureForcedBlocker(ms: number): number {
  const end = Date.now() + ms;
  let total = 0;
  while (Date.now() < end) total += stallCaptureSpinRecursive(40);
  return total;
}
{
  (globalThis as any).__stallCaptureSink = stallCaptureForcedBlocker(25_000);
  // The main loop was frozen ~25s; the worker should have detected the
  // stall (>6s silence), profiled the frozen thread for 3s, and written
  // the stall file mid-block. Poll generously for the record + closure.
  let rec = readStallRecord();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    rec = readStallRecord();
    if (rec && rec.topFunctions.some((f) => f.function.includes('stallCapture'))) break;
    await sleep(1000);
    rec = readStallRecord();
  }
  check('F1 witness wrote a stall record for the forced stall', !!rec, rec ? `method=${rec.captureMethod}` : 'no record');
  check('F2 capture method is profiler or debugger (not none)', rec?.captureMethod === 'profiler' || rec?.captureMethod === 'debugger', `method=${rec?.captureMethod}`);
  check(
    'F3 captured top functions NAME the blocking function',
    !!rec && rec.topFunctions.some((f) => f.function.includes('stallCapture')),
    rec ? `top=${rec.topFunctions.slice(0, 3).map((f) => `${f.function}(${f.samples})`).join(', ')}` : 'no record',
  );
  // The full profile lives only in the raw disk record (readStallRecord
  // deliberately strips it so it can never leak into health/DB views).
  let rawProfile: unknown = null;
  try { rawProfile = JSON.parse(readFileSync(stallFilePath(), 'utf8'))?.profile ?? null; } catch { /* handled below */ }
  check('F4 record carries the full profile when the profiler route won', rec?.captureMethod !== 'profiler' || !!rawProfile, rec?.captureMethod ?? '');

  let view = (await processHeartbeatHealth()).lastStall;
  const deadline2 = Date.now() + 30_000;
  while (Date.now() < deadline2 && typeof view?.durationSeconds !== 'number') {
    await sleep(1000);
    view = (await processHeartbeatHealth()).lastStall;
  }
  check('F5 health surfaces the stall as lastStall naming the blocker',
    !!view && view.topFunctions.some((f) => f.function.includes('stallCapture')),
    view ? `top=${view.topFunctions[0]?.function}` : 'no view');
  check('F6 episode closed with a numeric duration after resume',
    typeof view?.durationSeconds === 'number' && (view.durationSeconds as number) >= 15,
    `duration=${view?.durationSeconds}`);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
