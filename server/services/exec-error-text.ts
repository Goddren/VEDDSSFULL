// exec-error-text.ts — turn a raw stored execution error into a short,
// human-readable status line. Stored errors can embed internal call chains
// ("executeMT5SignalOnTradeLocker <- process.processTicksAndRejections |
// position …"), which the Account Execution Status card used to render raw.
// Display surfaces must never show internal call chains — the full text stays
// in the trade log for debugging; only the cleaned line leaves the server.

const GENERIC = "Execution error — details in the trade log";

// Tokens that mark a string as an internal call chain / stack fragment rather
// than a human message.
const INTERNAL_TOKENS = [
  "process.",
  "processTicksAndRejections",
  "at Object.",
  "at async",
  "node:internal",
  "<-",
  "(MODIFY by",
];

export function humanizeExecError(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = String(raw).trim();
  if (!s) return null;
  // Anything carrying a call-chain/stack marker ANYWHERE is internals —
  // generic line. (Checked on the raw string: cutting first would leave a
  // bare executor name like "executeMT5SignalOnTradeLocker" behind.)
  if (INTERNAL_TOKENS.some((t) => s.includes(t))) return GENERIC;
  // Cut anything appended after the internal-detail separators.
  const pipe = s.indexOf(" | ");
  if (pipe >= 0) s = s.slice(0, pipe);
  s = s.replace(/\s+/g, " ").trim();
  // Still looks like internals (a camelCase executor identifier being
  // invoked) → generic line instead of leaking it.
  if (!s || /[a-z][a-zA-Z]*[A-Z][a-zA-Z]*\(/.test(s)) {
    return GENERIC;
  }
  return s.length > 120 ? s.slice(0, 117).trimEnd() + "…" : s;
}
