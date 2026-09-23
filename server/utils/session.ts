// ─────────────────────────────────────────────────────────────────────────────
// Canonical FX session labels.
//
// WHY THIS EXISTS: the brain STORES sessions as 'Asian' | 'London' | 'NY' |
// 'Late' (runBrainLearning's sessions array), while every gate that reads it
// computes 'Asian' | 'London' | 'New York' | 'Late NY'. So
//
//     k.topSessions.find(s => s.session === 'New York')
//
// never matched, and the brain's session rule was structurally dead for
// 13:00-24:00 UTC — the entire New York session, where this account does most
// of its damage. Gate 2e had never blocked a single trade in its lifetime:
// zero rows in mt5_confirm_diag with a 'Brain:' gate_block, all-time.
//
// Compare through canonSession() on BOTH sides rather than by string equality.
// Deliberately does NOT change what the brain stores: other consumers read
// those labels, and a lookup-side fix cannot break them.
// ─────────────────────────────────────────────────────────────────────────────

export type CanonicalSession = 'Asian' | 'London' | 'New York' | 'Late NY';

/** Session for a UTC hour. The single definition — do not re-derive inline. */
export function sessionForHour(hourUtc: number): CanonicalSession {
  const h = Number(hourUtc);
  if (!isFinite(h)) return 'Asian';
  return h < 7 ? 'Asian' : h < 13 ? 'London' : h < 20 ? 'New York' : 'Late NY';
}

/**
 * Normalise any spelling the codebase has ever used to one canonical label.
 * Falls back to the hour when the value is missing or unrecognised.
 */
export function canonSession(value: any, hourUtc?: number | null): CanonicalSession | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'ny' || raw === 'new york' || raw === 'newyork' || raw === 'new-york') return 'New York';
  if (raw === 'late' || raw === 'late ny' || raw === 'latency' || raw === 'late-ny' || raw === 'lateny') return 'Late NY';
  if (raw === 'asian' || raw === 'asia' || raw === 'tokyo') return 'Asian';
  if (raw === 'london' || raw === 'europe' || raw === 'eu') return 'London';
  if (hourUtc == null || !isFinite(Number(hourUtc))) return null;
  return sessionForHour(Number(hourUtc));
}

/** True when two session labels mean the same session, whatever their spelling. */
export function sameSession(a: any, b: any): boolean {
  const ca = canonSession(a);
  const cb = canonSession(b);
  return ca != null && cb != null && ca === cb;
}
