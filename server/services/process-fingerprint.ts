// ─────────────────────────────────────────────────────────────────────────────
// One fingerprint per running Node process, computed once at first import and
// cached for the process's lifetime (module-level const, not per-call).
//
// WHY THIS EXISTS: spent a long stretch 2026-09-27 trying to prove/disprove a
// stale process still running old crypto-confirmation code purely by
// INFERRING it from database output shape (blank reasoning, old FX/ICT
// vocabulary) -- which works but is slow and never fully conclusive, since a
// model can also just partially ignore a prompt instruction and produce
// FX-flavored language from the CURRENT code. Direct queryable access to
// Postgres exists; direct access to Render's own log stream does not. So
// instead of a log line only visible in a UI, this stamps every consensus row
// with WHICH OS process (pid) and WHEN IT BOOTED produced it -- answerable
// with a SQL query, no cross-referencing required.
// ─────────────────────────────────────────────────────────────────────────────

export const PROCESS_BOOT_ID = `pid${process.pid}@${new Date().toISOString()}`;
