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
