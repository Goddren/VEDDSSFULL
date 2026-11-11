// ── Process crash-hardening ──────────────────────────────────────────────────
// WHY THIS EXISTS (2026-11-10): production crash-looped — the Node process
// exited, Render restarted it, and the ~2-minute reboot left users staring at
// 502/504s. Render's failure emails ("Exited with status 1") for this service
// go back to 2026-10-13. The old handlers in server/index.ts swallowed
// unhandledRejection/uncaughtException but logged only `err.message` — no
// stack, no record, nothing on /api/health — so the killing error could never
// be identified without Render's log stream.
//
// WHAT THIS MODULE DOES:
//  1. Installs global handlers AS EARLY AS POSSIBLE: server/index.ts imports
//     this module FIRST, so its top-level code (install + boot marker) runs
//     before any other app module's side effects.
//  2. Handlers LOG LOUDLY (message + stack), RECORD the error in a ring
//     buffer, best-effort PERSIST the latest one to runtime_state, and DO NOT
//     EXIT.
//
//  DELIBERATE TRADEOFF — read before "fixing": for uncaughtException, Node
//  docs recommend exiting because the process may be in a bad state. We
//  choose the opposite for this app: a possibly-degraded process that keeps
//  serving beats a dead site plus a 2-minute reboot loop, especially when
//  the alternative hides the error entirely. The cost of that choice is why
//  every recorded error is surfaced on /api/health (`processErrors`) — a
//  recorded error is a bug to fix properly, not a state to live in.
//
//  3. safeInterval/safeTimeout: a tiny wrapper for boot-started recurring
//     jobs whose outer callback frame was unguarded. Same period, same
//     first-fire timing — the only change is that an escaping error is
//     recorded under the job's name instead of surfacing as an anonymous
//     unhandled rejection.
//
// NOTHING in here may ever throw: every function is wrapped so a failure
// inside the error path can never become the next crash.

// No imports at module scope on purpose: this module must evaluate before
// anything else in the app, and it must not pull the DB or any service into
// that first moment. runtime-state is loaded lazily (dynamic import) only
// when persisting / reading back.

export interface ProcessErrorRecord {
  type: 'unhandledRejection' | 'uncaughtException' | 'guardedJob';
  message: string;
  stack: string | null; // first lines only — enough to name the culprit
  at: string;           // ISO timestamp
  job?: string;         // safeInterval/safeTimeout job name, when applicable
}

const MAX_RECENT = 10;
const MAX_STACK_LINES = 8;

export const PROCESS_BOOTED_AT = new Date().toISOString();

const recentErrors: ProcessErrorRecord[] = [];
let totalSinceBoot = 0;
let installed = false;

function formatError(err: any): { message: string; stack: string | null } {
  try {
    if (err instanceof Error) {
      const stack = err.stack
        ? err.stack.split('\n').slice(0, MAX_STACK_LINES).join('\n')
        : null;
      return { message: err.message || String(err), stack };
    }
    if (typeof err === 'string') return { message: err, stack: null };
    let message: string;
    try { message = JSON.stringify(err); } catch { message = String(err); }
    return { message: message ?? String(err), stack: null };
  } catch {
    return { message: 'unformattable error', stack: null };
  }
}

/**
 * Record one process-level error: loud log + ring buffer + best-effort
 * persistence of the latest record to runtime_state (scope 'process_errors',
 * key 'latest') so the NEXT boot's /api/health can show what killed the
 * previous process. Never throws, never rejects.
 */
export function recordProcessError(
  type: ProcessErrorRecord['type'],
  err: any,
  job?: string,
): void {
  try {
    const { message, stack } = formatError(err);
    const record: ProcessErrorRecord = {
      type,
      message,
      stack,
      at: new Date().toISOString(),
      ...(job ? { job } : {}),
    };
    totalSinceBoot += 1;
    recentErrors.push(record);
    if (recentErrors.length > MAX_RECENT) recentErrors.shift();

    console.error(
      `[process-guard] ${type}${job ? ` in job "${job}"` : ''} — RECORDED, process kept alive ` +
      `(#${totalSinceBoot} since boot). Fix the cause; do not rely on this net.\n` +
      `  message: ${message}\n` +
      (stack ? `  stack: ${stack.split('\n').join('\n  ')}` : '  stack: (none)'),
    );

    // Best-effort persistence. saveRuntimeState is fire-and-forget and
    // self-guarded (it can never throw or reject into this handler); the
    // dynamic import is additionally wrapped so a load failure is silent.
    try {
      void import('./services/runtime-state')
        .then((m) => {
          try { m.saveRuntimeState('process_errors', 'latest', record); } catch { /* never throw */ }
        })
        .catch(() => { /* never throw */ });
    } catch { /* never throw */ }
  } catch {
    try { console.error('[process-guard] recordProcessError itself failed (suppressed)'); } catch { /* never throw */ }
  }
}

/**
 * Install the global handlers. Idempotent. Called automatically at module
 * scope below — importing this module IS installing the guards, which is
 * what makes "import it first in server/index.ts" sufficient.
 */
export function installProcessGuards(): void {
  if (installed) return;
  installed = true;
  process.on('unhandledRejection', (reason: any) => {
    recordProcessError('unhandledRejection', reason);
  });
  process.on('uncaughtException', (err: any) => {
    recordProcessError('uncaughtException', err);
  });
  console.log(
    `[boot] process started pid=${process.pid} at=${new Date().toISOString()} — ` +
    'process guards installed: unhandledRejection/uncaughtException are logged + recorded on /api/health, never exit.',
  );
}

installProcessGuards();

/** Synchronous in-memory view for /api/health (this boot only). */
export function getProcessErrors(): {
  bootedAt: string;
  totalSinceBoot: number;
  lastError: ProcessErrorRecord | null;
  recent: ProcessErrorRecord[];
} {
  return {
    bootedAt: PROCESS_BOOTED_AT,
    totalSinceBoot,
    lastError: recentErrors.length ? recentErrors[recentErrors.length - 1] : null,
    recent: [...recentErrors].reverse(),
  };
}

/**
 * Full /api/health view: this boot's records PLUS the latest persisted
 * record from runtime_state — which, after a crash + restart, is the
 * previous process's last recorded error (the prime suspect). Best-effort:
 * any read failure degrades to the in-memory view. Never throws.
 */
export async function processErrorsHealth(): Promise<
  ReturnType<typeof getProcessErrors> & { persistedLastError: ProcessErrorRecord | null }
> {
  const base = getProcessErrors();
  let persistedLastError: ProcessErrorRecord | null = null;
  try {
    const { getRuntimeStateStrict } = await import('./services/runtime-state');
    const v = await getRuntimeStateStrict('process_errors', 'latest');
    if (v && typeof v === 'object' && typeof v.at === 'string' && typeof v.message === 'string') {
      persistedLastError = v as ProcessErrorRecord;
    }
  } catch { /* best-effort only */ }
  return { ...base, persistedLastError };
}

// ── Memory trail ─────────────────────────────────────────────────────────────
// WHY THIS EXISTS (2026-11-10, follow-up to PR #46): the crash loop kept
// going after PR #46 shipped, and on the 23:36 CT death that night
// processErrors was COMPLETELY EMPTY — totalSinceBoot 0, lastError null,
// persistedLastError null. The global handlers above catch JS errors; a
// process killed by the host at the instance memory limit (SIGKILL) runs no
// handler and leaves no error record at all. An empty error recorder plus a
// dead process points AWAY from a catchable code error and TOWARD an
// external kill — memory being the leading suspect (this codebase has OOM
// history: see the crypto-cron header — the in-process scanner "accumulates
// memory over ~2h and OOMs the whole Render instance").
//
// So: sample process.memoryUsage() every 60s (first sample at boot), keep the
// last 30 samples in memory, and best-effort persist the trail to
// runtime_state ('process_memory'/'latest') so it survives the death it is
// trying to explain. On boot, BEFORE this process's first persist can
// overwrite the stored record, capture it as previousBoot — after a death +
// restart, /api/health `processMemory.previousBoot` shows how high the dead
// process's memory climbed and the exact moment its trail stops.
//
// HOW TO READ A DEATH FROM IT: previousBoot.peakRssMB near the instance's
// RAM ceiling + previousBoot.lastSampleAt seconds before the new process's
// bootedAt = killed at the memory limit. A flat/low trail that stops hours
// after boot argues for something else (host eviction, deploy, manual
// restart) — check lastSampleAt against the new boot time first.
//
// Kill switch: PROCESS_MEMORY_TRAIL=off disables sampling + persistence.
// Discipline (same as the error path above): NOTHING here may throw, the
// interval is unref'd so it never keeps a process alive on its own, and a
// persistence failure is silent.

export interface ProcessMemorySample {
  at: string;            // ISO timestamp
  uptimeSeconds: number; // process.uptime() at sample time
  rssMB: number;         // resident set size — the number the host OOM-killer watches
  heapUsedMB: number;
  heapTotalMB: number;
  externalMB: number;
}

export interface ProcessMemoryBootRecord {
  bootedAt: string;
  pid: number;
  samples: ProcessMemorySample[]; // last 10 samples of that boot
  peakRssMB: number;
  lastSampleAt: string | null;
}

const MEMORY_SAMPLE_MS = 60_000;
const MEMORY_RING_MAX = 30;
const MEMORY_PERSIST_SAMPLES = 10;
const MEMORY_WARN_THRESHOLDS_MB = [400, 700];

const memorySamples: ProcessMemorySample[] = [];
let memoryPeakRssMB = 0;
let previousBootRecord: ProcessMemoryBootRecord | null = null;
let memoryTrailActive = false;
let memoryTrailStarted = false;
const memoryWarnedThresholds = new Set<number>();
// Resolved once the boot-time capture of the previous boot's stored record
// has finished (or failed). Persists chain onto it so a fresh boot can never
// overwrite the previous boot's trail before it has been read.
let previousBootCapture: Promise<void> = Promise.resolve();

function toMB(bytes: number): number {
  return Math.round((bytes / 1_048_576) * 10) / 10;
}

function takeMemorySample(): ProcessMemorySample | null {
  try {
    const m = process.memoryUsage();
    return {
      at: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      rssMB: toMB(m.rss),
      heapUsedMB: toMB(m.heapUsed),
      heapTotalMB: toMB(m.heapTotal),
      externalMB: toMB(m.external),
    };
  } catch {
    return null;
  }
}

function currentBootRecord(): ProcessMemoryBootRecord {
  const samples = memorySamples.slice(-MEMORY_PERSIST_SAMPLES);
  return {
    bootedAt: PROCESS_BOOTED_AT,
    pid: process.pid,
    samples,
    peakRssMB: memoryPeakRssMB,
    lastSampleAt: samples.length ? samples[samples.length - 1].at : null,
  };
}

/**
 * Best-effort persistence of the current trail to runtime_state
 * ('process_memory'/'latest'). Chained onto the boot capture so the previous
 * boot's record is always read before this boot overwrites it. Same
 * self-guarded lazy-import pattern as recordProcessError: never throws,
 * never rejects, a DB failure is silent.
 */
function persistMemoryTrail(): void {
  try {
    void previousBootCapture
      .then(() => {
        try {
          void import('./services/runtime-state')
            .then((m) => {
              try { m.saveRuntimeState('process_memory', 'latest', currentBootRecord()); } catch { /* never throw */ }
            })
            .catch(() => { /* never throw */ });
        } catch { /* never throw */ }
      })
      .catch(() => { /* never throw */ });
  } catch { /* never throw */ }
}

/**
 * One sample cycle: sample → ring buffer → peak → threshold warnings →
 * persist. Exported for testability; the 60s interval calls this. No-op when
 * the trail is disabled. Never throws.
 */
export function sampleMemoryNow(): void {
  try {
    if (!memoryTrailActive) return;
    const sample = takeMemorySample();
    if (!sample) return;
    memorySamples.push(sample);
    if (memorySamples.length > MEMORY_RING_MAX) memorySamples.shift();
    if (sample.rssMB > memoryPeakRssMB) memoryPeakRssMB = sample.rssMB;

    for (const threshold of MEMORY_WARN_THRESHOLDS_MB) {
      if (sample.rssMB >= threshold && !memoryWarnedThresholds.has(threshold)) {
        memoryWarnedThresholds.add(threshold);
        try {
          console.warn(
            `[process-guards] RSS crossed ${threshold}MB — if this process dies next, ` +
            'suspect the instance memory limit',
          );
        } catch { /* never throw */ }
      }
    }

    persistMemoryTrail();
  } catch { /* never throw */ }
}

/**
 * Start the memory trail: capture the previous boot's persisted record
 * (before any persist from this boot can overwrite it), take the boot
 * sample, then sample every 60s on an unref'd interval. Idempotent; called
 * automatically at module scope below. Kill switch:
 * PROCESS_MEMORY_TRAIL=off. Never throws.
 */
export function startMemoryTrail(): void {
  try {
    if (memoryTrailStarted) return;
    memoryTrailStarted = true;
    if (process.env.PROCESS_MEMORY_TRAIL === 'off') return;
    memoryTrailActive = true;

    previousBootCapture = (async () => {
      try {
        const { getRuntimeStateStrict } = await import('./services/runtime-state');
        const v = await getRuntimeStateStrict('process_memory', 'latest');
        if (
          v && typeof v === 'object' &&
          typeof v.bootedAt === 'string' &&
          v.bootedAt !== PROCESS_BOOTED_AT &&
          Array.isArray(v.samples)
        ) {
          previousBootRecord = {
            bootedAt: v.bootedAt,
            pid: typeof v.pid === 'number' ? v.pid : 0,
            samples: v.samples,
            peakRssMB: typeof v.peakRssMB === 'number' ? v.peakRssMB : 0,
            lastSampleAt: typeof v.lastSampleAt === 'string' ? v.lastSampleAt : null,
          };
        }
      } catch { /* best-effort only — previousBoot stays null */ }
    })();

    // First sample at boot (its persist chains onto the capture above).
    sampleMemoryNow();

    const timer = setInterval(sampleMemoryNow, MEMORY_SAMPLE_MS);
    try { timer.unref(); } catch { /* never throw */ }
  } catch { /* never throw */ }
}

startMemoryTrail();

/** Synchronous in-memory view of the memory trail (this boot + previous boot). */
export function getProcessMemory(): {
  current: { rssMB: number; heapUsedMB: number; heapTotalMB: number } | null;
  peakRssMB: number;
  samples: ProcessMemorySample[];
  previousBoot: {
    bootedAt: string;
    lastSampleAt: string | null;
    peakRssMB: number;
    samples: ProcessMemorySample[];
  } | null;
} {
  const latest = memorySamples.length ? memorySamples[memorySamples.length - 1] : null;
  return {
    current: latest
      ? { rssMB: latest.rssMB, heapUsedMB: latest.heapUsedMB, heapTotalMB: latest.heapTotalMB }
      : null,
    peakRssMB: memoryPeakRssMB,
    samples: memorySamples.slice(-MEMORY_PERSIST_SAMPLES),
    previousBoot: previousBootRecord
      ? {
          bootedAt: previousBootRecord.bootedAt,
          lastSampleAt: previousBootRecord.lastSampleAt,
          peakRssMB: previousBootRecord.peakRssMB,
          samples: previousBootRecord.samples,
        }
      : null,
  };
}

/**
 * Full /api/health view of the memory trail. Waits (briefly, best-effort)
 * for the boot-time capture of the previous boot's record so a health check
 * right after a restart doesn't race it. Never throws.
 */
export async function processMemoryHealth(): Promise<ReturnType<typeof getProcessMemory>> {
  try { await previousBootCapture; } catch { /* best-effort only */ }
  return getProcessMemory();
}

/**
 * setInterval whose callback cannot escape: a throw/rejection is recorded
 * under `name` (type 'guardedJob') instead of surfacing as an anonymous
 * unhandled rejection. Period and first-fire timing are exactly
 * setInterval's — no behavior change for a callback that doesn't throw.
 */
export function safeInterval(
  name: string,
  ms: number,
  fn: () => unknown,
): ReturnType<typeof setInterval> {
  return setInterval(() => {
    Promise.resolve()
      .then(fn)
      .catch((e: any) => recordProcessError('guardedJob', e, name));
  }, ms);
}

/** setTimeout twin of safeInterval — same timing, errors recorded by name. */
export function safeTimeout(
  name: string,
  ms: number,
  fn: () => unknown,
): ReturnType<typeof setTimeout> {
  return setTimeout(() => {
    Promise.resolve()
      .then(fn)
      .catch((e: any) => recordProcessError('guardedJob', e, name));
  }, ms);
}
