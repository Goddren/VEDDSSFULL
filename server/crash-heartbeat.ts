// ── Crash-cause hunt: loop registry + heartbeat + worker witness ────────────
// WHY THIS EXISTS (2026-11-16): the production process keeps dying SILENTLY.
// Three deaths on 2026-11-16 alone (~04:39 CT, ~19:00 CT, ~19:05 CT), each
// leaving ZERO recorded process errors (PR #46) and — for the 19:00 boot,
// which lived only ~4–7 minutes — a memory trail (PR #48) peaking at just
// 224 MB, nowhere near the instance limit. With PR #46 the global handlers
// record-and-continue, so a plain JS throw cannot kill this process anymore.
// What remains: (a) an external kill (host/OOM of the instance), (b) a
// BLOCKED event loop (a synchronous spin runs no handler, no timer, no log),
// or (c) a death inside native code. The existing instrumentation cannot
// tell these apart because everything that could report runs on the main
// loop that may itself be the thing that stopped.
//
// WHAT THIS MODULE DOES:
//  1. LOOP REGISTRY — named engine loops record their last tick
//     (loopTick). The heartbeat snapshot names every loop's last tick, so a
//     post-mortem shows WHICH loop stopped first.
//  2. MAIN HEARTBEAT — every ~30s a snapshot {bootId, at, uptimeSeconds,
//     rssMB, loops} is persisted to runtime_state ('crash_heartbeat' /
//     'latest') using the same cross-boot capture discipline as the memory
//     trail: on start, the stored record is captured as previousBoot BEFORE
//     this boot's first persist can overwrite it.
//  3. WORKER WITNESS — a tiny worker thread with its own timer persists
//     its own heartbeat (to a small file on the instance disk, which
//     survives a process restart on the same instance) every ~15s,
//     including the last time it heard from the main thread. After a death:
//       - worker heartbeat kept advancing while its last-main-message froze
//         → the main event loop was BLOCKED;
//       - worker and main stop together → the process died / was killed.
//     The main thread also mirrors the worker's latest record into its DB
//     snapshot whenever it can read it, so the DB copy carries the witness
//     state for as long as the main loop was alive to copy it.
//
//  This instrumentation proves the NEXT death's circumstances. It does not
//  retroactively prove tonight's cause.
//
//  Kill switch: CRASH_HEARTBEAT=off disables the heartbeat interval and the
//  worker (loopTick stays a cheap in-memory record).
//  Discipline (same as process-guards): NOTHING here may throw; every entry
//  point is wrapped; timers are unref'd; persistence is best-effort and
//  silent on failure; a heartbeat failure must never affect boot or trading.

import { Worker } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PROCESS_BOOTED_AT, recordProcessError } from './process-guards';

// ── Loop registry ────────────────────────────────────────────────────────────

export interface LoopTickRecord {
  lastTickAt: string;      // ISO timestamp of the most recent tick
  label: string | null;    // optional short activity label from the latest tick
  ticks: number;           // total ticks recorded this boot
}

const loopRegistry = new Map<string, LoopTickRecord>();

/**
 * Record one tick of a named loop. Called from inside the loop's own
 * callback after its work completes. Never throws; a no-op cost when the
 * heartbeat is disabled (the in-memory record still feeds /api/health).
 */
export function loopTick(name: string, label?: string): void {
  try {
    const prev = loopRegistry.get(name);
    loopRegistry.set(name, {
      lastTickAt: new Date().toISOString(),
      label: label ?? prev?.label ?? null,
      ticks: (prev?.ticks ?? 0) + 1,
    });
  } catch { /* never throw */ }
}

/** Synchronous snapshot of the registry (this boot only). */
export function getLoopRegistry(): Record<string, LoopTickRecord> {
  const out: Record<string, LoopTickRecord> = {};
  try {
    for (const [name, rec] of loopRegistry) out[name] = { ...rec };
  } catch { /* never throw */ }
  return out;
}

// ── Heartbeat records ────────────────────────────────────────────────────────

export interface WorkerHeartbeatRecord {
  workerAt: string;                    // ISO time of the worker's latest beat
  workerUptimeSeconds: number;         // process uptime as seen by the worker
  lastMainMessageAt: string | null;    // last time the worker heard from main
}

export interface CrashHeartbeatSnapshot {
  bootId: string;                      // PROCESS_BOOTED_AT of the writing boot
  at: string;                          // ISO time the snapshot was taken
  uptimeSeconds: number;
  rssMB: number;
  loops: Record<string, LoopTickRecord>;
  worker: WorkerHeartbeatRecord | null; // witness state mirrored at snapshot time
}

const HEARTBEAT_MS = 30_000;
const WORKER_BEAT_MS = 15_000;

/** Kill switch: CRASH_HEARTBEAT=off. Read dynamically so it can be pinned. */
export function crashHeartbeatEnabled(): boolean {
  try { return process.env.CRASH_HEARTBEAT !== 'off'; } catch { return true; }
}

function toMB(bytes: number): number {
  return Math.round((bytes / 1_048_576) * 10) / 10;
}

function workerFilePath(): string {
  try {
    const fromEnv = process.env.CRASH_HEARTBEAT_FILE;
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  } catch { /* fall through */ }
  return path.join(tmpdir(), 'vedd-crash-heartbeat-worker.json');
}

function isWorkerRecord(v: any): v is WorkerHeartbeatRecord {
  return !!v && typeof v === 'object' && typeof v.workerAt === 'string';
}

/** Read the worker witness file (latest beat of whichever boot wrote it). */
export function readWorkerHeartbeat(): WorkerHeartbeatRecord | null {
  try {
    const raw = readFileSync(workerFilePath(), 'utf8');
    const v = JSON.parse(raw);
    if (isWorkerRecord(v)) {
      return {
        workerAt: v.workerAt,
        workerUptimeSeconds: typeof v.workerUptimeSeconds === 'number' ? v.workerUptimeSeconds : 0,
        lastMainMessageAt: typeof v.lastMainMessageAt === 'string' ? v.lastMainMessageAt : null,
      };
    }
  } catch { /* missing/unreadable file → no witness record */ }
  return null;
}

function buildSnapshot(): CrashHeartbeatSnapshot {
  let rssMB = 0;
  try { rssMB = toMB(process.memoryUsage().rss); } catch { /* keep 0 */ }
  return {
    bootId: PROCESS_BOOTED_AT,
    at: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    rssMB,
    loops: getLoopRegistry(),
    worker: readWorkerHeartbeat(),
  };
}

// ── Worker witness ───────────────────────────────────────────────────────────
// Plain-JS eval worker: no file to bundle, no imports beyond Node builtins.
// It writes atomically (tmp + rename) so a reader never sees a torn record.

const WORKER_SOURCE = `
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
let lastMainMessageAt = null;
if (parentPort) {
  parentPort.on('message', () => { lastMainMessageAt = new Date().toISOString(); });
}
function beat() {
  try {
    const rec = {
      workerAt: new Date().toISOString(),
      workerUptimeSeconds: Math.round(process.uptime()),
      lastMainMessageAt: lastMainMessageAt,
    };
    const tmp = workerData.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec));
    fs.renameSync(tmp, workerData.file);
  } catch (e) { /* the witness must never throw */ }
}
beat();
setInterval(beat, workerData.intervalMs);
`;

let witnessWorker: Worker | null = null;
let witnessFailed = false;

function startWitnessWorker(): void {
  try {
    const w = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: { file: workerFilePath(), intervalMs: WORKER_BEAT_MS },
    });
    try { w.unref(); } catch { /* never throw */ }
    w.on('error', (err: any) => {
      witnessFailed = true;
      try { console.error('[crash-heartbeat] witness worker error (non-fatal):', err?.message ?? err); } catch { /* never throw */ }
    });
    w.on('exit', (code: number) => {
      if (code !== 0) witnessFailed = true;
    });
    witnessWorker = w;
    pingWitness();
  } catch (err: any) {
    witnessFailed = true;
    try { console.error('[crash-heartbeat] witness worker failed to start (non-fatal):', err?.message ?? err); } catch { /* never throw */ }
  }
}

function pingWitness(): void {
  try { witnessWorker?.postMessage({ at: Date.now() }); } catch { /* never throw */ }
}

// ── Persistence + previous-boot capture (memory-trail discipline) ────────────

let previousBootMain: CrashHeartbeatSnapshot | null = null;
let previousBootWorker: WorkerHeartbeatRecord | null = null;
let previousBootCapture: Promise<void> = Promise.resolve();
let started = false;

function isSnapshot(v: any): v is CrashHeartbeatSnapshot {
  return !!v && typeof v === 'object' && typeof v.bootId === 'string' && typeof v.at === 'string';
}

function persistSnapshot(): void {
  try {
    const snapshot = buildSnapshot();
    void previousBootCapture
      .then(() => {
        try {
          void import('./services/runtime-state')
            .then((m) => {
              try { m.saveRuntimeState('crash_heartbeat', 'latest', snapshot); } catch { /* never throw */ }
            })
            .catch(() => { /* never throw */ });
        } catch { /* never throw */ }
      })
      .catch(() => { /* never throw */ });
  } catch { /* never throw */ }
}

function heartbeatCycle(): void {
  try {
    loopTick('crash-heartbeat', 'persist');
    pingWitness();
    persistSnapshot();
  } catch { /* never throw */ }
}

/**
 * Start the crash heartbeat: capture the previous boot's records (DB
 * snapshot + witness file) BEFORE this boot can overwrite either, take the
 * first snapshot, spawn the witness worker, then persist every ~30s on an
 * unref'd interval. Idempotent. Kill switch CRASH_HEARTBEAT=off. Never
 * throws — a failure here must never affect boot or trading.
 */
export function startCrashHeartbeat(): void {
  try {
    if (started) return;
    started = true;
    if (!crashHeartbeatEnabled()) {
      try { console.log('[crash-heartbeat] disabled via CRASH_HEARTBEAT=off — registry only, no heartbeat, no witness worker.'); } catch { /* never throw */ }
      return;
    }

    // Capture the DEAD boot's witness file synchronously, before the new
    // worker's first beat (immediate) can overwrite it.
    previousBootWorker = readWorkerHeartbeat();

    previousBootCapture = (async () => {
      try {
        const { getRuntimeStateStrict } = await import('./services/runtime-state');
        const v = await getRuntimeStateStrict('crash_heartbeat', 'latest');
        if (isSnapshot(v) && v.bootId !== PROCESS_BOOTED_AT) {
          previousBootMain = v;
        }
      } catch { /* best-effort only — previousBoot stays null */ }
    })();

    startWitnessWorker();
    heartbeatCycle();

    const timer = setInterval(heartbeatCycle, HEARTBEAT_MS);
    try { timer.unref(); } catch { /* never throw */ }
    try { console.log('[crash-heartbeat] started — main snapshot every 30s, witness worker every 15s; /api/health exposes processHeartbeat.'); } catch { /* never throw */ }
  } catch { /* never throw */ }
}

/**
 * Full /api/health view: this boot's live snapshot PLUS the previous boot's
 * final records. HOW TO READ A DEATH FROM IT:
 *  - previousBoot.worker.workerAt kept advancing past
 *    previousBoot.worker.lastMainMessageAt (and past previousBoot.main.at)
 *    → the main event loop was BLOCKED before the death.
 *  - previousBoot.worker and previousBoot.main stop at ~the same moment
 *    → the whole process died / was killed externally.
 *  - previousBoot.main.loops names each loop's last tick — the loop whose
 *    lastTickAt is oldest is the first thing that stopped.
 * Never throws.
 */
export async function processHeartbeatHealth(): Promise<{
  enabled: boolean;
  witnessFailed: boolean;
  current: CrashHeartbeatSnapshot;
  previousBoot: { main: CrashHeartbeatSnapshot | null; worker: WorkerHeartbeatRecord | null } | null;
}> {
  try { await previousBootCapture; } catch { /* best-effort only */ }
  return {
    enabled: crashHeartbeatEnabled(),
    witnessFailed,
    current: buildSnapshot(),
    previousBoot: (previousBootMain || previousBootWorker)
      ? { main: previousBootMain, worker: previousBootWorker }
      : null,
  };
}

/** Test hook: record a guarded-job error through the shared recorder. */
export function noteGuardedLoopError(job: string, err: any): void {
  try { recordProcessError('guardedJob', err, job); } catch { /* never throw */ }
}
