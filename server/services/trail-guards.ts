// ── Trail guards: proven trail lessons become real exit rules ───────────────
// Follow-up to the trail study (2026-11-08). The study shows, per pair and
// per strategy, how trailing stops performed. This module lets the owner
// promote a PROVEN pattern into a trail guard — a per-group trail profile
// the engines must use for that pair/strategy — and retire it at any time.
//
// Two actions, both evidence-gated and re-verified server-side at promote
// time (the client cannot talk its way past the bar):
// • tighten — the group gives back too much from its peak (crypto ≥ 1.0R
//   avg giveback, Sol ≥ 8% avg giveback, 10+ closed trades). The guard
//   applies a tighter trail profile to that group.
// • lock_profile — trailing demonstrably works for the group (trail exits
//   common and closes positive on average, 10+ trades). The guard freezes
//   the trail profile currently in force for that group, so a later global
//   loosening cannot quietly un-protect it.
//
// Scope: guards change EXIT management only (trail activation/distance/
// breakeven/partial knobs) — never entries, never sizing. Crypto applies in
// monitorOpenPositions' R-multiple trailing; Sol applies as overrides to
// the learned-rules exit step (paper + shadow — live Sol exits are
// unchanged, same boundary as the learned rules themselves).
//
// SOL KEYING (2026-11-15, Chris's directive): Sol guards key on STRATEGY
// ONLY — never on the token. Sol tokens are routinely pump-and-dump: a
// guard built for one token is a guard for something that may not exist
// next week, while the strategy's pooled record across tokens is the
// durable evidence (the same reasoning the PR #68 Sol lesson gate uses:
// per-token gating is forbidden by design there too). So Sol candidates
// come only from the study's strategy grouping (which aggregates closes
// across every token the strategy traded), the promote endpoint refuses
// a Sol symbol selection outright, and the Sol consult matches strategy
// guards only — a stored per-token Sol guard, if one ever existed, can
// no longer govern an exit. Crypto keeps its symbol dimension: crypto
// pairs are durable instruments, and that behavior is unchanged. (The
// trail study still DISPLAYS Sol per-symbol stats for observation; they
// simply can no longer become guards.)
//
// Guards live in runtime_state ('trail_guards', userId). Retiring keeps the
// record with active=false. Kill switch: TRAIL_GUARDS=off disables both
// consults (guards remain stored). Consults FAIL OPEN: any error means the
// engine uses its normal settings.

import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';
import { trailStudyReport, type TrailGroup } from './trail-study';
import { SOL_LR } from './sol-learned-rules';
import { pool } from '../db';

export interface CryptoTrailProfile {
  method: string; activationR: number; fixedR: number; stepR: number;
  profitLockPct: number; sarInitialAF: number; sarMaxAF: number; breakevenBufferR: number;
}
export interface SolTrailProfile { breakevenAtPct: number; partialAtPct: number; trailDistPct: number; }

export interface TrailGuard {
  id: string;
  engine: 'crypto' | 'sol';
  dimension: 'strategy' | 'symbol';
  key: string;
  action: 'tighten' | 'lock_profile';
  trades: number;
  avgFinal: number | null;
  avgPeak: number | null;
  avgGiveback: number | null;
  trailExitShare: number | null;
  profile: CryptoTrailProfile | SolTrailProfile;
  profileSummary: string;
  promotedAt: string;
  active: boolean;
  retiredAt?: string;
  /** Who retired the guard: the user's own tap ('user', the default for
   *  every guard retired before self-learning existed) or the guard's own
   *  track record ('lessons' — trail-guard-learning.ts auto-retire). */
  retiredBy?: 'user' | 'lessons';
  /** Why the lessons loop retired it (present only when retiredBy='lessons'). */
  retireReason?: string;
}

export interface TrailCandidate {
  engine: 'crypto' | 'sol';
  dimension: 'strategy' | 'symbol';
  key: string;
  action: 'tighten' | 'lock_profile';
  trades: number;
  avgFinal: number | null;
  avgPeak: number | null;
  avgGiveback: number | null;
  trailExitShare: number | null;
  reason: string;
  alreadyGuarded: boolean;
}

const SCOPE = 'trail_guards';
const MIN_TRADES = () => Number(process.env.TRAIL_GUARD_MIN_TRADES ?? 10);
const CRYPTO_GIVEBACK_R = 1.0;
const SOL_GIVEBACK_PCT = 8;

export function trailGuardsOn(): boolean {
  return process.env.TRAIL_GUARDS !== 'off';
}

// ── Storage (in-memory cache over runtime_state; consult path is hot) ──────
const _cache = new Map<number, { at: number; guards: TrailGuard[] }>();
const CACHE_MS = 30_000;

export async function getTrailGuards(userId: number): Promise<TrailGuard[]> {
  const hit = _cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.guards;
  let guards: TrailGuard[] = [];
  try {
    const v = await getRuntimeStateStrict(SCOPE, String(userId));
    if (Array.isArray(v)) guards = v;
  } catch { /* empty */ }
  _cache.set(userId, { at: Date.now(), guards });
  return guards;
}

async function storeGuards(userId: number, guards: TrailGuard[]): Promise<void> {
  _cache.set(userId, { at: Date.now(), guards });
  saveRuntimeState(SCOPE, String(userId), guards);
}

// ── Profiles ────────────────────────────────────────────────────────────────
async function currentCryptoProfile(userId: number): Promise<CryptoTrailProfile> {
  const rows = await pool.query(
    `SELECT trail_method, trail_activation_r, trail_fixed_r, trail_step_r, trail_profit_lock_pct,
            trail_sar_initial_af, trail_sar_max_af, breakeven_buffer_r
       FROM cryptocom_engine_configs WHERE user_id = $1`, [userId]).then(r => r.rows).catch(() => []);
  const c = rows[0];
  return {
    method: c?.trail_method ?? 'none',
    activationR: Number(c?.trail_activation_r ?? 1),
    fixedR: Number(c?.trail_fixed_r ?? 0.5),
    stepR: Number(c?.trail_step_r ?? 0.5),
    profitLockPct: Number(c?.trail_profit_lock_pct ?? 60),
    sarInitialAF: Number(c?.trail_sar_initial_af ?? 0.02),
    sarMaxAF: Number(c?.trail_sar_max_af ?? 0.20),
    breakevenBufferR: Number(c?.breakeven_buffer_r ?? 0),
  };
}

function tightenCryptoProfile(base: CryptoTrailProfile): CryptoTrailProfile {
  return {
    ...base,
    method: base.method === 'none' ? 'fixed_r' : base.method,
    activationR: Math.min(base.activationR, 0.75),
    fixedR: Math.min(base.fixedR, 0.4),
    stepR: Math.min(base.stepR, 0.4),
    profitLockPct: Math.max(base.profitLockPct, 70),
  };
}

function currentSolProfile(): SolTrailProfile {
  return { breakevenAtPct: SOL_LR.breakevenAtPct, partialAtPct: SOL_LR.partialAtPct, trailDistPct: SOL_LR.trailDistPct };
}

function tightenSolProfile(): SolTrailProfile {
  return { breakevenAtPct: 5, partialAtPct: 12, trailDistPct: 5 };
}

function profileSummary(engine: 'crypto' | 'sol', p: CryptoTrailProfile | SolTrailProfile): string {
  if (engine === 'crypto') {
    const c = p as CryptoTrailProfile;
    return `${c.method}, arms at ${c.activationR}R, fixed ${c.fixedR}R / step ${c.stepR}R / locks ${c.profitLockPct}%`;
  }
  const s = p as SolTrailProfile;
  return `breakeven +${s.breakevenAtPct}%, half off +${s.partialAtPct}%, trail ${s.trailDistPct}% under peak`;
}

// ── Candidates (derived from the trail study; eligibility lives here) ──────
// Exported for the check script (check-sol-trail-guard-keys.ts), same
// pattern as trail-guard-learning.ts exporting its stats readers.
export function candidatesFrom(engine: 'crypto' | 'sol', dimension: 'strategy' | 'symbol', groups: TrailGroup[], guarded: Set<string>): TrailCandidate[] {
  const out: TrailCandidate[] = [];
  for (const g of groups) {
    if (g.trades < MIN_TRADES()) continue;
    const givebackBar = engine === 'crypto' ? CRYPTO_GIVEBACK_R : SOL_GIVEBACK_PCT;
    const lockShare = engine === 'crypto' ? 0.25 : 0.30;
    const lockFinal = engine === 'crypto' ? 0.3 : 0;
    const id = `${engine}:${dimension}:${g.key}`;
    if (g.avgGiveback != null && g.avgGiveback >= givebackBar) {
      out.push({
        engine, dimension, key: g.key, action: 'tighten', trades: g.trades,
        avgFinal: g.avgFinal, avgPeak: g.avgPeak, avgGiveback: g.avgGiveback, trailExitShare: g.trailExitShare,
        reason: engine === 'crypto'
          ? `Gives back ${g.avgGiveback}R from peak on average over ${g.trades} trades — a tighter trail fits.`
          : `Gives back ${g.avgGiveback}% from peak on average over ${g.trades} trades — a tighter trail fits.`,
        alreadyGuarded: guarded.has(`${id}:tighten`),
      });
    } else if (g.trailExitShare != null && g.trailExitShare >= lockShare && g.avgFinal != null && g.avgFinal >= lockFinal) {
      out.push({
        engine, dimension, key: g.key, action: 'lock_profile', trades: g.trades,
        avgFinal: g.avgFinal, avgPeak: g.avgPeak, avgGiveback: g.avgGiveback, trailExitShare: g.trailExitShare,
        reason: `Trailing works here — ${Math.round(g.trailExitShare * 100)}% of exits are trail exits, closing ${g.avgFinal}${engine === 'crypto' ? 'R' : '%'} on average. Lock the profile in for this group.`,
        alreadyGuarded: guarded.has(`${id}:lock_profile`),
      });
    }
  }
  return out;
}

export async function getTrailGuardCandidates(userId: number) {
  const [report, guards] = await Promise.all([trailStudyReport(userId, 90), getTrailGuards(userId)]);
  const guarded = new Set(guards.filter(g => g.active).map(g => `${g.engine}:${g.dimension}:${g.key}:${g.action}`));
  const candidates = [
    ...candidatesFrom('crypto', 'strategy', report.crypto.byStrategy, guarded),
    ...candidatesFrom('crypto', 'symbol', report.crypto.bySymbol, guarded),
    // Sol: strategy grouping ONLY (see SOL KEYING in the header) — the
    // bySymbol study groups are display-only and never become candidates,
    // so a Sol candidate's record aggregates across all of the strategy's
    // tokens by construction (the study groups by strategy_id).
    ...candidatesFrom('sol', 'strategy', report.sol.byStrategy, guarded),
  ];
  return { candidates, guards };
}

// ── Promote / retire ────────────────────────────────────────────────────────
export async function promoteTrailGuard(userId: number, sel: { engine: 'crypto' | 'sol'; dimension: 'strategy' | 'symbol'; key: string; action: 'tighten' | 'lock_profile' }) {
  // Sol guards are strategy-keyed only (see SOL KEYING in the header):
  // refuse a per-token selection outright rather than letting it fall
  // through to a generic "no longer qualifies" — the answer is never.
  if (sel.engine === 'sol' && sel.dimension === 'symbol') {
    return { ok: false as const, status: 422, error: 'Sol trail guards key on strategy only — a guard for one token would outlive the token. Promote the strategy group instead.' };
  }
  const { candidates, guards } = await getTrailGuardCandidates(userId);
  const cand = candidates.find(c => c.engine === sel.engine && c.dimension === sel.dimension && c.key === sel.key && c.action === sel.action);
  if (!cand) return { ok: false as const, status: 422, error: 'That trail lesson no longer qualifies (evidence changed since the list was built). Refresh and check the current numbers.' };
  if (cand.alreadyGuarded) return { ok: false as const, status: 409, error: 'An active guard already covers this group and action.' };

  let profile: CryptoTrailProfile | SolTrailProfile;
  if (sel.engine === 'crypto') {
    const base = await currentCryptoProfile(userId);
    if (sel.action === 'lock_profile' && base.method === 'none') {
      return { ok: false as const, status: 422, error: 'Trailing is off in your crypto settings right now — there is no active profile to lock in.' };
    }
    profile = sel.action === 'tighten' ? tightenCryptoProfile(base) : base;
  } else {
    profile = sel.action === 'tighten' ? tightenSolProfile() : currentSolProfile();
  }

  const guard: TrailGuard = {
    id: `tg_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    engine: sel.engine, dimension: sel.dimension, key: sel.key, action: sel.action,
    trades: cand.trades, avgFinal: cand.avgFinal, avgPeak: cand.avgPeak,
    avgGiveback: cand.avgGiveback, trailExitShare: cand.trailExitShare,
    profile, profileSummary: profileSummary(sel.engine, profile),
    promotedAt: new Date().toISOString(), active: true,
  };
  await storeGuards(userId, [...guards, guard]);
  return { ok: true as const, guard };
}

export interface TrailBulkSkip { engine: 'crypto' | 'sol'; dimension: 'strategy' | 'symbol'; key: string; action: 'tighten' | 'lock_profile'; reason: string }
export interface TrailBulkResult {
  ok: boolean; status?: number; error?: string;
  promoted: TrailGuard[]; skipped: TrailBulkSkip[];
  promotedCount: number; skippedCount: number;
}

/**
 * The bulk tap (2026-11-15: one-by-one was "too many to tap through"):
 * promote EVERY current candidate in one action. A loop over the
 * single-promote path, not a second implementation — each candidate
 * goes through promoteTrailGuard, which re-derives the candidate list
 * and re-verifies the evidence, refusing (422) a lesson that no longer
 * qualifies and (409) one already guarded; both land in `skipped` with
 * the single path's own reason. Sol safety holds by construction twice
 * over: the candidate list never contains a Sol symbol selection (see
 * SOL KEYING above), and promoteTrailGuard refuses one outright anyway.
 * Guards created here are ordinary guard records written by the same
 * promote path — no marker, no special case — so the self-learning loop
 * (trail-guard-learning.ts) attributes and judges them exactly like
 * singly-promoted guards. Kill switch off → the batch is unavailable.
 */
export async function promoteAllTrailGuards(userId: number): Promise<TrailBulkResult> {
  const empty = { promoted: [] as TrailGuard[], skipped: [] as TrailBulkSkip[], promotedCount: 0, skippedCount: 0 };
  if (!trailGuardsOn()) {
    return { ok: false, status: 403, error: 'Trail guards are switched off (TRAIL_GUARDS=off) — bulk promotion is unavailable.', ...empty };
  }
  const { candidates } = await getTrailGuardCandidates(userId);
  const promoted: TrailGuard[] = [];
  const skipped: TrailBulkSkip[] = [];
  for (const c of candidates) {
    const out = await promoteTrailGuard(userId, { engine: c.engine, dimension: c.dimension, key: c.key, action: c.action });
    if (out.ok) promoted.push(out.guard);
    else skipped.push({ engine: c.engine, dimension: c.dimension, key: c.key, action: c.action, reason: out.error });
  }
  return { ok: true, promoted, skipped, promotedCount: promoted.length, skippedCount: skipped.length };
}

export async function retireTrailGuard(userId: number, id: string, retiredBy: 'user' | 'lessons' = 'user', retireReason?: string) {
  const guards = await getTrailGuards(userId);
  const g = guards.find(x => x.id === id);
  if (!g) return { ok: false as const, status: 404, error: 'Guard not found.' };
  g.active = false;
  g.retiredAt = new Date().toISOString();
  g.retiredBy = retiredBy;
  if (retireReason) g.retireReason = retireReason;
  await storeGuards(userId, guards);
  return { ok: true as const, guard: g };
}

// ── Consults (hot path — cached, fail-open) ─────────────────────────────────
// Exported for the check script (check-sol-trail-guard-keys.ts).
export function matchGuard(guards: TrailGuard[], engine: 'crypto' | 'sol', strategy: string | null | undefined, symbol: string | null | undefined): TrailGuard | null {
  const active = guards.filter(g => g.active && g.engine === engine);
  const strat = strategy ? active.find(g => g.dimension === 'strategy' && g.key === strategy) : undefined;
  const sym = symbol ? active.find(g => g.dimension === 'symbol' && g.key === symbol) : undefined;
  if (strat && sym) return strat.action === 'tighten' ? strat : sym.action === 'tighten' ? sym : strat;
  return strat ?? sym ?? null;
}

export async function cryptoTrailProfileFor(userId: number, strategy: string | null | undefined, symbol: string | null | undefined): Promise<CryptoTrailProfile | null> {
  const g = await cryptoTrailGuardFor(userId, strategy, symbol);
  return g ? (g.profile as CryptoTrailProfile) : null;
}

export async function solTrailOverridesFor(userId: number, strategyId: string | null | undefined, symbol: string | null | undefined): Promise<SolTrailProfile | null> {
  const g = await solTrailGuardFor(userId, strategyId, symbol);
  return g ? (g.profile as SolTrailProfile) : null;
}

/** The guard itself (not just its profile) when one governs this group —
 *  the consult sites use this for attribution: a trade whose exit was
 *  governed by a guard gets stamped with the guard's identity so the
 *  guard's own record can be counted later (trail-guard-learning.ts).
 *  Same matching and fail-open semantics as the profile consults. */
export async function cryptoTrailGuardFor(userId: number, strategy: string | null | undefined, symbol: string | null | undefined): Promise<TrailGuard | null> {
  if (!trailGuardsOn()) return null;
  try {
    return matchGuard(await getTrailGuards(userId), 'crypto', strategy, symbol);
  } catch { return null; }
}

export async function solTrailGuardFor(userId: number, strategyId: string | null | undefined, symbol: string | null | undefined): Promise<TrailGuard | null> {
  if (!trailGuardsOn()) return null;
  try {
    // Strategy-only matching (see SOL KEYING in the header): the symbol
    // argument is accepted so the engine's call sites stay as they are,
    // but it is deliberately NOT matched — a per-token Sol guard can
    // never govern an exit, however it got stored.
    return matchGuard(await getTrailGuards(userId), 'sol', strategyId, null);
  } catch { return null; }
}

// ── Attribution stamps (crypto) ─────────────────────────────────────────────
// When a guard's profile governs a crypto trade's exit evaluation, the
// trade row is stamped with the guard's id/action and a snapshot of the
// profile in force. Additive nullable columns, lazily added — the same
// rows the trail study reads, so closes under a guard are countable
// without touching the study. Unguarded trades stay unstamped; a stamp
// write never throws and never blocks the monitor.
let _colsEnsured: Promise<void> | null = null;
/**
 * Create the three stamp columns on cryptocom_engine_trades if missing.
 *
 * These columns are load-bearing beyond the stamp itself: PR #69 added
 * them to the Drizzle schema (shared/schema.ts), so EVERY storage.ts
 * query on cryptocom_engine_trades — full selects, INSERT/UPDATE …
 * RETURNING — names them, whether or not any guard exists. The original
 * version of this ensure only ran from the stamp writer (which fires
 * only when a promoted guard governs a trade) and from the learning
 * loop's own reads, so on an install where no guard was ever promoted
 * the ALTER never executed and the Drizzle reads failed with
 * `column "trail_guard_id" does not exist` (production, 2026-11-13
 * 21:04–21:08 UTC). Every read/write path for this table now awaits
 * this ensure first (storage.ts, the stamp, the learning reads, plus a
 * boot warm-up in startTrailGuardLearning).
 *
 * Idempotent (ADD COLUMN IF NOT EXISTS), memoized per process, and
 * NEVER rejecting: on failure it logs, resets the memo so the next call
 * retries, and resolves — an ensure failure must not become a new gate
 * in front of hot engine paths; the caller's query then succeeds (the
 * usual case: the columns already exist) or fails exactly as it would
 * have without the ensure.
 */
export function ensureTrailGuardStampColumns(): Promise<void> {
  if (!_colsEnsured) {
    _colsEnsured = pool.query(`ALTER TABLE cryptocom_engine_trades
        ADD COLUMN IF NOT EXISTS trail_guard_id text,
        ADD COLUMN IF NOT EXISTS trail_guard_action text,
        ADD COLUMN IF NOT EXISTS trail_guard_profile jsonb`)
      .then(() => undefined)
      .catch((e: any) => {
        _colsEnsured = null;
        console.error('[trail-guards] stamp-column ensure failed (non-fatal, will retry):', e?.message || e);
      });
  }
  return _colsEnsured;
}

const _stamped = new Map<string, string>();
export async function stampCryptoTradeTrailGuard(userId: number, tradeId: number, guard: TrailGuard): Promise<void> {
  const memoKey = `${userId}:${tradeId}`;
  const stampKey = `${guard.id}:${guard.action}`;
  if (_stamped.get(memoKey) === stampKey) return;
  try {
    await ensureTrailGuardStampColumns();
    await pool.query(
      `UPDATE cryptocom_engine_trades SET trail_guard_id = $2, trail_guard_action = $3, trail_guard_profile = $4::jsonb
        WHERE id = $1 AND user_id = $5`,
      [tradeId, guard.id, guard.action, JSON.stringify(guard.profile), userId]);
    _stamped.set(memoKey, stampKey);
  } catch (e: any) {
    console.error('[trail-guards] stamp failed (non-fatal):', e?.message || e);
  }
}
