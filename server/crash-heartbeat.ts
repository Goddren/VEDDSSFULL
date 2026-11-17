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
//
// ── STALL CAPTURE (follow-up, 2026-11-17) ────────────────────────────────────
//  The heartbeat's FIRST witnessed death (boot 2026-11-17T12:51:36Z) proved
//  the failure mode: the main loop's last heartbeat persisted at 12:55:13Z
//  (~3.6 min into the boot, RSS ~249 MB, zero process errors) while the
//  worker witness kept beating until 12:58:28Z and Render restarted the
//  instance at 12:58:35Z. Verdict: EVENT-LOOP BLOCK — some synchronous work
//  on the main thread froze everything in the early-startup window. PR #98
//  told us WHEN and THAT it blocks; this layer captures WHAT it blocks in:
//   4. STALL DETECTION — the main thread now pings the witness every ~1s
//      (the lag-monitor tick below). When the worker sees no ping for
//      > STALL_THRESHOLD_MS (20s), it declares a stall and captures.
//   5. FROZEN-THREAD CAPTURE — at boot (when enabled) the main thread opens
//      a Node inspector server bound to 127.0.0.1 on an ephemeral port and
//      hands its URL to the worker. The V8 inspector agent runs on its own
//      thread, so it answers even while the main loop is blocked. On a
//      stall the worker connects over a minimal built-in WebSocket client
//      and runs the sampling Profiler (~8s) — top functions by self-sample
//      count name the blocking code. Fallback: Debugger.pause call frames.
//      The full profile + aggregated summary persist to an instance-disk
//      stall file beside the witness file; the next boot captures it as
//      previousBoot.lastStall, and the live boot surfaces it as lastStall.
//   6. LAG BREADCRUMBS — a 1s drift monitor on the main thread records lag
//      spikes ≥2s (timestamp, lag, most recent loop ticks) into a ring
//      carried in the heartbeat snapshot, catching shorter self-healing
//      stalls the 20s threshold never sees.
//  Kill switch: CRASH_STALL_CAPTURE=off disables the inspector, the lag
//  monitor and worker stall detection (witness + heartbeat keep running);
//  CRASH_HEARTBEAT=off still disables everything.

import { Worker } from 'node:worker_threads';
import * as inspector from 'node:inspector';
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
    loopRegistry.forEach((rec, name) => { out[name] = { ...rec }; });
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
  lagSpikes: LagSpikeRecord[];          // event-loop lag breadcrumbs this boot
  lastStall: StallHealthView | null;    // latest captured stall this boot
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
  refreshCurrentStall();
  return {
    bootId: PROCESS_BOOTED_AT,
    at: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    rssMB,
    loops: getLoopRegistry(),
    worker: readWorkerHeartbeat(),
    lagSpikes: getLagSpikes(),
    lastStall: toStallHealthView(currentStall),
  };
}

// ── Stall capture: records, profile aggregation, lag breadcrumbs ─────────────

export interface StallTopFunction {
  function: string;   // function name ('(anonymous)' when V8 reports none)
  file: string;       // script URL with any file:// prefix stripped
  line: number;       // 1-based line of the function definition
  samples: number;    // self-sample count (0 for debugger call-frame captures)
}

export interface StallCaptureRecord {
  bootId: string;                        // boot the stall belongs to
  stallStartedAt: string;                // last main-thread ping before the silence
  detectedAt: string;                    // when the witness declared the stall
  capturedAt: string | null;
  resumedAt: string | null;              // set when the main thread pinged again
  durationSeconds: number | null;        // null while the stall is still open
  captureMethod: 'profiler' | 'debugger' | 'none';
  topFunctions: StallTopFunction[];
  profile?: unknown;                     // full CPU profile — disk record only, never health/DB
}

export interface StallHealthView {
  detectedAt: string;
  stallStartedAt: string;
  durationSeconds: number | 'ongoing';   // 'ongoing' = never resumed (e.g. the boot died in it)
  topFunctions: StallTopFunction[];
  captureMethod: 'profiler' | 'debugger' | 'none';
}

export interface LagSpikeRecord {
  at: string;
  lagMs: number;
  recentLoops: Array<{ name: string; lastTickAt: string }>; // freshest loops at spike time
}

/** No main-thread ping for this long ⇒ the witness declares a stall. */
export const STALL_THRESHOLD_MS = 20_000;
/** How long the worker samples the frozen thread's profiler. */
export const STALL_CAPTURE_MS = 8_000;
const STALL_CHECK_MS = 2_000;   // worker-side cadence for checking ping silence
const LAG_CHECK_MS = 1_000;     // main-thread drift monitor cadence (also the witness ping)
const LAG_SPIKE_MS = 2_000;     // drift at/above this is recorded as a breadcrumb
const LAG_RING_MAX = 20;
const STALL_TOP_LIMIT = 20;

/** Kill switch: CRASH_STALL_CAPTURE=off (CRASH_HEARTBEAT=off disables all). */
export function stallCaptureEnabled(): boolean {
  try { return crashHeartbeatEnabled() && process.env.CRASH_STALL_CAPTURE !== 'off'; } catch { return true; }
}

function stallThresholdMs(): number {
  try {
    const v = parseInt(process.env.CRASH_STALL_THRESHOLD_MS ?? '', 10);
    if (Number.isFinite(v) && v >= 500) return v;
  } catch { /* fall through */ }
  return STALL_THRESHOLD_MS;
}

function stallCaptureMs(): number {
  try {
    const v = parseInt(process.env.CRASH_STALL_CAPTURE_MS ?? '', 10);
    if (Number.isFinite(v) && v >= 500) return v;
  } catch { /* fall through */ }
  return STALL_CAPTURE_MS;
}

export function stallFilePath(): string {
  try {
    const fromEnv = process.env.CRASH_STALL_FILE;
    if (fromEnv && fromEnv.trim()) return fromEnv.trim();
  } catch { /* fall through */ }
  const wf = workerFilePath();
  return wf.endsWith('.json') ? `${wf.slice(0, -'.json'.length)}-stall.json` : `${wf}-stall.json`;
}

/**
 * Aggregate a V8 CPU profile into top functions by SELF-sample count.
 * Pure and exported for the check script's fixture test. The witness worker
 * carries a compact copy of this exact logic (it is a self-contained eval
 * script and cannot import) — keep the two in step.
 */
export function aggregateCpuProfile(profile: any, limit: number = STALL_TOP_LIMIT): StallTopFunction[] {
  try {
    const nodes: any[] = Array.isArray(profile?.nodes) ? profile.nodes : [];
    const counts = new Map<number, number>();
    for (const n of nodes) {
      if (n && typeof n.id === 'number' && typeof n.hitCount === 'number' && n.hitCount > 0) {
        counts.set(n.id, n.hitCount);
      }
    }
    if (counts.size === 0 && Array.isArray(profile?.samples)) {
      for (const id of profile.samples) {
        if (typeof id === 'number') counts.set(id, (counts.get(id) ?? 0) + 1);
      }
    }
    const byFn = new Map<string, StallTopFunction>();
    for (const n of nodes) {
      const c = counts.get(n?.id) ?? 0;
      if (!c) continue;
      const cf = n.callFrame ?? {};
      const fn = typeof cf.functionName === 'string' && cf.functionName ? cf.functionName : '(anonymous)';
      const file = (typeof cf.url === 'string' ? cf.url : '').replace(/^file:\/\//, '');
      const line = (typeof cf.lineNumber === 'number' ? cf.lineNumber : -1) + 1;
      const key = `${fn}|${file}|${line}`;
      const prev = byFn.get(key);
      if (prev) prev.samples += c;
      else byFn.set(key, { function: fn, file, line, samples: c });
    }
    return [...byFn.values()].sort((a, b) => b.samples - a.samples).slice(0, limit);
  } catch { return []; }
}

// ── Lag breadcrumbs (main thread) ────────────────────────────────────────────

const lagSpikes: LagSpikeRecord[] = [];

export function getLagSpikes(): LagSpikeRecord[] {
  try {
    return lagSpikes.map((s) => ({ ...s, recentLoops: s.recentLoops.map((r) => ({ ...r })) }));
  } catch { return []; }
}

function recordLagSpike(lagMs: number): void {
  try {
    const recentLoops = [...loopRegistry.entries()]
      .map(([name, rec]) => ({ name, lastTickAt: rec.lastTickAt }))
      .sort((a, b) => (a.lastTickAt < b.lastTickAt ? 1 : -1))
      .slice(0, 5);
    lagSpikes.push({ at: new Date().toISOString(), lagMs: Math.round(lagMs), recentLoops });
    while (lagSpikes.length > LAG_RING_MAX) lagSpikes.shift();
  } catch { /* never throw */ }
}

// ── Stall records (disk file written by the witness worker) ──────────────────

let previousBootStall: StallCaptureRecord | null = null;
let currentStall: StallCaptureRecord | null = null;

function sanitizeStallRecord(v: any): StallCaptureRecord | null {
  try {
    if (!v || typeof v !== 'object') return null;
    if (typeof v.bootId !== 'string' || typeof v.stallStartedAt !== 'string' || typeof v.detectedAt !== 'string') return null;
    const topFunctions: StallTopFunction[] = Array.isArray(v.topFunctions)
      ? v.topFunctions
          .filter((f: any) => !!f && typeof f === 'object')
          .slice(0, STALL_TOP_LIMIT)
          .map((f: any) => ({
            function: typeof f.function === 'string' ? f.function : '(anonymous)',
            file: typeof f.file === 'string' ? f.file : '',
            line: typeof f.line === 'number' ? f.line : 0,
            samples: typeof f.samples === 'number' ? f.samples : 0,
          }))
      : [];
    return {
      bootId: v.bootId,
      stallStartedAt: v.stallStartedAt,
      detectedAt: v.detectedAt,
      capturedAt: typeof v.capturedAt === 'string' ? v.capturedAt : null,
      resumedAt: typeof v.resumedAt === 'string' ? v.resumedAt : null,
      durationSeconds: typeof v.durationSeconds === 'number' ? v.durationSeconds : null,
      captureMethod: v.captureMethod === 'profiler' || v.captureMethod === 'debugger' ? v.captureMethod : 'none',
      topFunctions,
    };
  } catch { return null; }
}

/** Read the instance-disk stall file (latest episode of whichever boot wrote it). */
export function readStallRecord(): StallCaptureRecord | null {
  try {
    return sanitizeStallRecord(JSON.parse(readFileSync(stallFilePath(), 'utf8')));
  } catch { return null; }
}

function refreshCurrentStall(): void {
  try {
    const rec = readStallRecord();
    if (rec && rec.bootId === PROCESS_BOOTED_AT) currentStall = rec;
  } catch { /* never throw */ }
}

export function toStallHealthView(rec: StallCaptureRecord | null): StallHealthView | null {
  if (!rec) return null;
  try {
    let durationSeconds: number | 'ongoing' = 'ongoing';
    if (typeof rec.durationSeconds === 'number') {
      durationSeconds = rec.durationSeconds;
    } else if (rec.resumedAt) {
      const d = Math.round(((new Date(rec.resumedAt).getTime() - new Date(rec.stallStartedAt).getTime()) / 1000) * 10) / 10;
      if (Number.isFinite(d) && d >= 0) durationSeconds = d;
    }
    return {
      detectedAt: rec.detectedAt,
      stallStartedAt: rec.stallStartedAt,
      durationSeconds,
      topFunctions: rec.topFunctions,
      captureMethod: rec.captureMethod,
    };
  } catch { return null; }
}

// ── Inspector (frozen-thread capture endpoint) ───────────────────────────────
// Opened on the MAIN thread at boot, localhost + ephemeral port only. The
// inspector agent lives on its own thread, so the worker can profile a main
// thread whose event loop is fully blocked. Render exposes only the app's
// public HTTP port; this listener is reachable from inside the instance
// only (the witness worker is exactly that).

let inspectorUrl: string | null = null;

function openInspectorIfEnabled(): void {
  try {
    if (!stallCaptureEnabled()) return;
    try {
      const existing = inspector.url();
      if (existing) { inspectorUrl = existing; return; }
    } catch { /* fall through to open */ }
    inspector.open(0, '127.0.0.1', false);
    const url = inspector.url();
    if (url) inspectorUrl = url;
  } catch (err: any) {
    try { console.error('[crash-heartbeat] inspector open failed (non-fatal):', err?.message ?? err); } catch { /* never throw */ }
  }
}

/** The inspector WebSocket URL handed to the witness worker (null when off). */
export function getInspectorUrl(): string | null {
  return inspectorUrl;
}

// ── Lag monitor (main thread): drift breadcrumbs + the 1s witness ping ───────

let lagMonitorStarted = false;

function startLagMonitor(): void {
  try {
    if (lagMonitorStarted) return;
    lagMonitorStarted = true;
    let last = Date.now();
    const timer = setInterval(() => {
      try {
        const now = Date.now();
        const lag = now - last - LAG_CHECK_MS;
        last = now;
        if (lag >= LAG_SPIKE_MS) recordLagSpike(lag);
        pingWitness();
      } catch { /* never throw */ }
    }, LAG_CHECK_MS);
    try { timer.unref(); } catch { /* never throw */ }
  } catch { /* never throw */ }
}

// ── Worker witness ───────────────────────────────────────────────────────────
// Plain-JS eval worker: no file to bundle, no imports beyond Node builtins.
// It writes atomically (tmp + rename) so a reader never sees a torn record.

const WORKER_SOURCE = `
'use strict';
const { parentPort, workerData } = require('node:worker_threads');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');
let lastMainMessageAt = null;
let lastMainMessageMs = 0;
let stallEpisode = null;
let capturedRecord = null;
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
function writeStallFile(rec) {
  try {
    const tmp = workerData.stallFile + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(rec));
    fs.renameSync(tmp, workerData.stallFile);
  } catch (e) { /* never throw */ }
}
function sleepMs(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function withTimeout(p, ms, label) {
  return Promise.race([p, new Promise(function (_, rej) {
    setTimeout(function () { rej(new Error('timeout: ' + label)); }, ms);
  })]);
}
function stripFileUrl(u) { return (typeof u === 'string' ? u : '').replace(/^file:\\/\\//, ''); }
// Compact copy of the main module's aggregateCpuProfile (this eval worker is
// self-contained and cannot import). Keep the two in step.
function aggregateProfileWorker(profile, limit) {
  try {
    const nodes = (profile && Array.isArray(profile.nodes)) ? profile.nodes : [];
    const counts = new Map();
    for (const n of nodes) {
      if (n && typeof n.id === 'number' && typeof n.hitCount === 'number' && n.hitCount > 0) counts.set(n.id, n.hitCount);
    }
    if (counts.size === 0 && profile && Array.isArray(profile.samples)) {
      for (const id of profile.samples) { if (typeof id === 'number') counts.set(id, (counts.get(id) || 0) + 1); }
    }
    const byFn = new Map();
    for (const n of nodes) {
      const c = counts.get(n && n.id) || 0;
      if (!c) continue;
      const cf = n.callFrame || {};
      const fn = (typeof cf.functionName === 'string' && cf.functionName) ? cf.functionName : '(anonymous)';
      const file = stripFileUrl(cf.url);
      const line = (typeof cf.lineNumber === 'number' ? cf.lineNumber : -1) + 1;
      const k = fn + '|' + file + '|' + line;
      const prev = byFn.get(k);
      if (prev) prev.samples += c; else byFn.set(k, { function: fn, file: file, line: line, samples: c });
    }
    return Array.from(byFn.values()).sort(function (a, b) { return b.samples - a.samples; }).slice(0, limit);
  } catch (e) { return []; }
}
// Minimal WebSocket client (Node builtins only) for the inspector protocol:
// HTTP upgrade handshake, masked client frames, fragmented-message reassembly.
function createCdpClient(url) {
  return new Promise(function (resolve, reject) {
    const m = /^ws:\\/\\/([^:\\/]+):(\\d+)(\\/.*)$/.exec(url);
    if (!m) { reject(new Error('unparseable inspector url')); return; }
    const host = m[1];
    const port = parseInt(m[2], 10);
    const pathQ = m[3];
    const key = crypto.randomBytes(16).toString('base64');
    const socket = net.connect(port, host);
    let settled = false;
    let upgraded = false;
    let buf = Buffer.alloc(0);
    let fragParts = [];
    let nextId = 1;
    const pending = new Map();
    const eventSubs = [];
    function failAll(err) {
      for (const p of pending.values()) { try { p.rej(err); } catch (e) {} }
      pending.clear();
    }
    function sendText(text) {
      const payload = Buffer.from(text, 'utf8');
      const mask = crypto.randomBytes(4);
      let header;
      if (payload.length < 126) { header = Buffer.alloc(2); header[1] = 0x80 | payload.length; }
      else if (payload.length < 65536) { header = Buffer.alloc(4); header[1] = 0x80 | 126; header.writeUInt16BE(payload.length, 2); }
      else { header = Buffer.alloc(10); header[1] = 0x80 | 127; header.writeBigUInt64BE(BigInt(payload.length), 2); }
      header[0] = 0x81;
      const masked = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) masked[i] = payload[i] ^ mask[i % 4];
      socket.write(Buffer.concat([header, mask, masked]));
    }
    function onMessage(text) {
      let msg;
      try { msg = JSON.parse(text); } catch (e) { return; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.rej(new Error((msg.error && msg.error.message) || 'cdp error'));
        else p.res(msg.result);
        return;
      }
      if (msg.method) {
        for (const s of eventSubs.slice()) { if (s.method === msg.method) { try { s.fn(msg.params); } catch (e) {} } }
      }
    }
    function drainFrames() {
      for (;;) {
        if (buf.length < 2) return;
        const b0 = buf[0];
        const b1 = buf[1];
        const fin = (b0 & 0x80) !== 0;
        const opcode = b0 & 0x0f;
        let len = b1 & 0x7f;
        let off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.slice(off, off + len);
        buf = buf.slice(off + len);
        if (opcode === 9) {
          try {
            const h = Buffer.from([0x8a, 0x80]);
            socket.write(Buffer.concat([h, crypto.randomBytes(4)]));
          } catch (e) {}
          continue;
        }
        if (opcode === 8) { try { socket.destroy(); } catch (e) {} return; }
        if (opcode === 1 || opcode === 0) {
          fragParts.push(payload);
          if (fin) {
            const full = Buffer.concat(fragParts).toString('utf8');
            fragParts = [];
            onMessage(full);
          }
        }
      }
    }
    const client = {
      call: function (method, params) {
        return new Promise(function (res2, rej2) {
          const id = nextId++;
          pending.set(id, { res: res2, rej: rej2 });
          try { sendText(JSON.stringify({ id: id, method: method, params: params || {} })); }
          catch (e) { pending.delete(id); rej2(e); }
        });
      },
      waitEvent: function (method, timeoutMs) {
        return new Promise(function (res2) {
          const sub = { method: method, fn: null };
          const timer = setTimeout(function () {
            const i = eventSubs.indexOf(sub);
            if (i >= 0) eventSubs.splice(i, 1);
            res2(null);
          }, timeoutMs);
          sub.fn = function (params) {
            clearTimeout(timer);
            const i = eventSubs.indexOf(sub);
            if (i >= 0) eventSubs.splice(i, 1);
            res2(params);
          };
          eventSubs.push(sub);
        });
      },
      close: function () { try { socket.destroy(); } catch (e) {} },
    };
    socket.on('connect', function () {
      try {
        socket.write(
          'GET ' + pathQ + ' HTTP/1.1\\r\\n' +
          'Host: ' + host + ':' + port + '\\r\\n' +
          'Upgrade: websocket\\r\\n' +
          'Connection: Upgrade\\r\\n' +
          'Sec-WebSocket-Key: ' + key + '\\r\\n' +
          'Sec-WebSocket-Version: 13\\r\\n\\r\\n');
      } catch (e) {}
    });
    socket.on('data', function (chunk) {
      try {
        buf = Buffer.concat([buf, chunk]);
        if (!upgraded) {
          const idx = buf.indexOf('\\r\\n\\r\\n');
          if (idx === -1) return;
          const head = buf.slice(0, idx).toString('utf8');
          if (!/^HTTP\\/1\\.1 101/.test(head)) {
            if (!settled) { settled = true; reject(new Error('inspector upgrade refused')); }
            try { socket.destroy(); } catch (e) {}
            return;
          }
          upgraded = true;
          buf = buf.slice(idx + 4);
          if (!settled) { settled = true; resolve(client); }
        }
        drainFrames();
      } catch (e) { /* never throw */ }
    });
    socket.on('error', function (err) {
      if (!settled) { settled = true; reject(err); }
      failAll(err);
    });
    socket.on('close', function () { failAll(new Error('cdp socket closed')); });
  });
}
async function captureStall(ep) {
  const record = {
    bootId: workerData.bootId,
    stallStartedAt: ep.stallStartedAt,
    detectedAt: ep.detectedAt,
    capturedAt: null,
    resumedAt: null,
    durationSeconds: null,
    captureMethod: 'none',
    topFunctions: [],
    profile: null,
  };
  const pingMsAtStart = lastMainMessageMs;
  let client = null;
  try {
    client = await withTimeout(createCdpClient(workerData.inspectorUrl), 10000, 'connect');
    try {
      await withTimeout(client.call('Profiler.enable'), 5000, 'Profiler.enable');
      try { await withTimeout(client.call('Profiler.setSamplingInterval', { interval: 1000 }), 5000, 'setSamplingInterval'); } catch (e) {}
      await withTimeout(client.call('Profiler.start'), 5000, 'Profiler.start');
      await sleepMs(workerData.stallCaptureMs);
      const res = await withTimeout(client.call('Profiler.stop'), 10000, 'Profiler.stop');
      if (res && res.profile) {
        record.profile = res.profile;
        record.topFunctions = aggregateProfileWorker(res.profile, 20);
        record.captureMethod = 'profiler';
      }
    } catch (e) { /* fall through to the debugger route */ }
    if (record.captureMethod === 'none') {
      try {
        await withTimeout(client.call('Debugger.enable'), 5000, 'Debugger.enable');
        const pausedP = client.waitEvent('Debugger.paused', 6000);
        await withTimeout(client.call('Debugger.pause'), 5000, 'Debugger.pause');
        const paused = await pausedP;
        if (paused && Array.isArray(paused.callFrames) && paused.callFrames.length) {
          record.topFunctions = paused.callFrames.slice(0, 20).map(function (f) {
            return {
              function: (f && f.functionName) || '(anonymous)',
              file: stripFileUrl(f && f.url),
              line: ((f && f.location && typeof f.location.lineNumber === 'number') ? f.location.lineNumber : -1) + 1,
              samples: 0,
            };
          });
          record.captureMethod = 'debugger';
        }
        try { await client.call('Debugger.resume'); } catch (e) {}
        try { await client.call('Debugger.disable'); } catch (e) {}
      } catch (e) { /* capture stays 'none' — the stall record itself still persists */ }
    }
  } catch (e) { /* capture stays 'none' */ }
  try { if (client) client.close(); } catch (e) {}
  try {
    if (lastMainMessageMs > pingMsAtStart && lastMainMessageAt) {
      record.resumedAt = lastMainMessageAt;
      const d = Math.round(((new Date(lastMainMessageAt).getTime() - new Date(ep.stallStartedAt).getTime()) / 1000) * 10) / 10;
      if (isFinite(d) && d >= 0) record.durationSeconds = d;
    }
  } catch (e) {}
  record.capturedAt = new Date().toISOString();
  capturedRecord = record;
  writeStallFile(record);
}
function closeStallEpisodeIfOpen() {
  try {
    if (capturedRecord && !capturedRecord.resumedAt && lastMainMessageAt) {
      capturedRecord.resumedAt = lastMainMessageAt;
      const startMs = new Date(capturedRecord.stallStartedAt).getTime();
      const endMs = new Date(lastMainMessageAt).getTime();
      if (isFinite(startMs) && isFinite(endMs) && endMs >= startMs) {
        capturedRecord.durationSeconds = Math.round(((endMs - startMs) / 1000) * 10) / 10;
      }
      writeStallFile(capturedRecord);
    }
    if (capturedRecord && capturedRecord.resumedAt) stallEpisode = null;
  } catch (e) { /* never throw */ }
}
function checkStall() {
  try {
    if (!workerData.inspectorUrl) return;
    if (!lastMainMessageMs) return;
    if (stallEpisode) return;
    if (Date.now() - lastMainMessageMs > workerData.stallThresholdMs) {
      stallEpisode = { stallStartedAt: lastMainMessageAt, detectedAt: new Date().toISOString() };
      captureStall(stallEpisode).catch(function () {});
    }
  } catch (e) { /* never throw */ }
}
if (parentPort) {
  parentPort.on('message', () => {
    lastMainMessageAt = new Date().toISOString();
    lastMainMessageMs = Date.now();
    closeStallEpisodeIfOpen();
    beat();
  });
}
beat();
setInterval(beat, workerData.intervalMs);
setInterval(checkStall, workerData.stallCheckMs);
`;

let witnessWorker: Worker | null = null;
let witnessFailed = false;

function startWitnessWorker(): void {
  try {
    const w = new Worker(WORKER_SOURCE, {
      eval: true,
      workerData: {
        file: workerFilePath(),
        intervalMs: WORKER_BEAT_MS,
        stallFile: stallFilePath(),
        bootId: PROCESS_BOOTED_AT,
        inspectorUrl: stallCaptureEnabled() ? inspectorUrl : null,
        stallThresholdMs: stallThresholdMs(),
        stallCaptureMs: stallCaptureMs(),
        stallCheckMs: STALL_CHECK_MS,
      },
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

    // Same discipline for the dead boot's stall record: capture it before
    // this boot's worker can overwrite the stall file with a new episode.
    try {
      const rec = readStallRecord();
      if (rec && rec.bootId !== PROCESS_BOOTED_AT) previousBootStall = rec;
    } catch { /* never throw */ }

    previousBootCapture = (async () => {
      try {
        const { getRuntimeStateStrict } = await import('./services/runtime-state');
        const v = await getRuntimeStateStrict('crash_heartbeat', 'latest');
        if (isSnapshot(v) && v.bootId !== PROCESS_BOOTED_AT) {
          previousBootMain = v;
        }
      } catch { /* best-effort only — previousBoot stays null */ }
    })();

    // Open the inspector BEFORE spawning the witness so its URL can ride
    // along in workerData; start the lag monitor so the witness gets its
    // ~1s ping cadence (the stall-detection signal).
    openInspectorIfEnabled();
    startWitnessWorker();
    if (stallCaptureEnabled()) startLagMonitor();
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
 *  - previousBoot.lastStall (and lastStall for this boot) names the code a
 *    stall was captured in: topFunctions[0] is the hottest function the
 *    sampling profiler saw on the frozen thread; captureMethod says how
 *    the capture was taken ('profiler' | 'debugger' | 'none').
 * Never throws.
 */
export async function processHeartbeatHealth(): Promise<{
  enabled: boolean;
  witnessFailed: boolean;
  current: CrashHeartbeatSnapshot;
  lastStall: StallHealthView | null;
  previousBoot: {
    main: CrashHeartbeatSnapshot | null;
    worker: WorkerHeartbeatRecord | null;
    lastStall: StallHealthView | null;
  } | null;
}> {
  try { await previousBootCapture; } catch { /* best-effort only */ }
  refreshCurrentStall();
  return {
    enabled: crashHeartbeatEnabled(),
    witnessFailed,
    current: buildSnapshot(),
    lastStall: toStallHealthView(currentStall),
    previousBoot: (previousBootMain || previousBootWorker || previousBootStall)
      ? {
          main: previousBootMain,
          worker: previousBootWorker,
          // The dead boot's stall summary comes from the worker-written
          // disk record (the frozen main loop never persisted again);
          // fall back to whatever its last DB snapshot carried.
          lastStall: toStallHealthView(previousBootStall) ?? previousBootMain?.lastStall ?? null,
        }
      : null,
  };
}

/** Test hook: record a guarded-job error through the shared recorder. */
export function noteGuardedLoopError(job: string, err: any): void {
  try { recordProcessError('guardedJob', err, job); } catch { /* never throw */ }
}
