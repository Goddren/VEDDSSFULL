// ── Trail Brain: one continuously-learning trailing-stop brain ─────────────
// Directed by Chris (2026-11-16): "all my engines and shadows need to have
// a strong mental brain for reasoning on trail setups to squeeze the most
// profit out of every trade the fastest we can without losing a lot of
// profit… while the ai is learning the trail knowledge this needs to be
// applied in real time" — crypto hot wallet first, then FX, Sol, and the
// Kalshi perp engine.
//
// This module generalises trail guards (PR #31/#69 — static, owner-promoted
// per-group exit rules that judge themselves every 30 min) into LEARNED
// PARAMETERS that update themselves on the same 30-minute rhythm and apply
// on the very next tick, with no deploy and no owner tap.
//
// TWO LAYERS
// • Real-time layer (this file's trailBrainDecide): deterministic and
//   local — per-tick trail decisions (arm / tighten / lock steps / exit
//   now) computed from the group's learned parameters + live price
//   action. NO LLM runs in the hot loop; the function is pure.
// • Learning layer (trail-brain-learning.ts): every ~30 min it scores the
//   closes the brain governed (attribution stamps, below) against the
//   group's own un-governed baseline and nudges the parameters inside
//   hard clamps — tighter when winners give back too much, looser when
//   the brain is cutting winners short, dormant when it keeps hurting at
//   the loosest settings. Adjustments land in runtime_state and the next
//   consult (≤30 s cache) trades on them.
//
// SAFETY INVARIANTS (pinned by scripts/check-trail-brain.ts)
// • EXIT-ONLY: the brain never opens a position and never changes a size.
//   Adapters may only move a stop tighter or fire an exit the trade's own
//   exit path executes.
// • A brain stop is NEVER wider than the trade's original stop:
//   trailBrainDecide clamps its floor at the caller-supplied stopFloor
//   (the progress value at the original stop: −1 in R units, −slPct in %
//   units) on every call, for every input.
// • FAIL-OPEN: an unreadable store, a missing group, a dormant group or
//   a thrown error all consult as "no brain" — the trade's hard SL/TP
//   and pre-existing exit logic apply unchanged.
// • GUARDS WIN: where a promoted trail guard governs a trade, adapters
//   consult the guard and skip the brain (the brain still learns from
//   the group's record). On FX the equivalent gate is stopHoldUntilR —
//   the brain may not tighten inside the hold window either.
// • SOL IS STRATEGY-KEYED ONLY (Chris's standing rule, 2026-11-15):
//   the Sol consult does not accept a symbol at all — a parameter set
//   built for one token would outlive the token.
//
// KEYING: engine × strategy × condition, stored per user in
// runtime_state ('trail_brain', userId). Condition is the durable
// instrument dimension of the engine: crypto → symbol, FX → pair,
// Kalshi → underlying, Sol → 'all' (strategy only). Units travel with
// the engine: crypto + FX reason in R multiples; Sol + Kalshi in
// percent price move.
//
// KILL SWITCHES: TRAIL_BRAIN=off (master) and TRAIL_BRAIN_FX=off /
// TRAIL_BRAIN_CRYPTO=off / TRAIL_BRAIN_SOL=off / TRAIL_BRAIN_KALSHI=off,
// plus a per-user per-engine toggle from the Guards & Trails panel.
// Every switch fails open to pre-existing exit logic.

import { pool } from '../db';
import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';

export type TrailBrainEngine = 'crypto' | 'fx' | 'sol' | 'kalshi';
export type TrailBrainUnit = 'R' | 'pct';

export interface TrailBrainLockStep { atPeak: number; lock: number }

export interface TrailBrainParams {
  /** Progress (R or %) at which trailing arms. */
  activation: number;
  /** Distance behind the peak once armed. */
  trailDist: number;
  /** Hard give-back cap: the effective distance is min(trailDist, giveBackCap). */
  giveBackCap: number;
  /** Step locks: when the peak reaches atPeak, the floor is at least lock. */
  lockSteps: TrailBrainLockStep[];
}

export interface TrailBrainEvidence {
  brainTrades: number;
  brainAvgFinal: number | null;
  brainAvgGiveback: number | null;
  baseTrades: number;
  baseAvgFinal: number | null;
  baseAvgGiveback: number | null;
}

export interface TrailBrainGroup {
  key: string;
  engine: TrailBrainEngine;
  strategy: string;
  condition: string;
  unit: TrailBrainUnit;
  params: TrailBrainParams;
  /** Bumped on every learned adjustment; stamped onto governed trades. */
  version: number;
  status: 'active' | 'dormant';
  evidence: (TrailBrainEvidence & { updatedAt: string }) | null;
  lastAdjustment: { at: string; action: string; reason: string } | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrailBrainStore { groups: Record<string, TrailBrainGroup> }

export interface TrailBrainConsult {
  groupKey: string;
  engine: TrailBrainEngine;
  unit: TrailBrainUnit;
  params: TrailBrainParams;
  version: number;
}

const STORE_SCOPE = 'trail_brain';
const SETTINGS_SCOPE = 'trail_brain_settings';
const LOG_SCOPE = 'trail_brain_log';

export function trailBrainUnit(engine: TrailBrainEngine): TrailBrainUnit {
  return engine === 'sol' || engine === 'kalshi' ? 'pct' : 'R';
}

const ENGINE_ENV: Record<TrailBrainEngine, string> = {
  crypto: 'TRAIL_BRAIN_CRYPTO', fx: 'TRAIL_BRAIN_FX', sol: 'TRAIL_BRAIN_SOL', kalshi: 'TRAIL_BRAIN_KALSHI',
};

export function trailBrainOn(engine?: TrailBrainEngine): boolean {
  if (process.env.TRAIL_BRAIN === 'off') return false;
  if (engine && process.env[ENGINE_ENV[engine]] === 'off') return false;
  return true;
}

export function groupKeyFor(engine: TrailBrainEngine, strategy: string, condition: string): string {
  return `${engine}|${strategy || 'all'}|${condition || 'all'}`;
}

// ── Defaults + hard clamps ─────────────────────────────────────────────────
// Defaults are conservative: the trail arms at the same progress the
// engines' own defaults use, at a distance that only binds on real
// give-back. The learner may move parameters ONLY inside these clamps.
export interface TrailBrainClamps {
  activation: [number, number]; trailDist: [number, number]; giveBackCap: [number, number];
  lockAtPeak: [number, number]; step: number; harmDelta: number;
}

export function trailBrainClamps(engine: TrailBrainEngine): TrailBrainClamps {
  switch (engine) {
    case 'sol': return { activation: [8, 40], trailDist: [3, 15], giveBackCap: [5, 25], lockAtPeak: [10, 80], step: 1, harmDelta: 1.5 };
    case 'kalshi': return { activation: [8, 35], trailDist: [2.5, 12], giveBackCap: [4, 20], lockAtPeak: [10, 60], step: 1, harmDelta: 1.5 };
    default: return { activation: [0.5, 3], trailDist: [0.3, 1.5], giveBackCap: [0.4, 2], lockAtPeak: [1, 6], step: 0.1, harmDelta: 0.15 };
  }
}

export function defaultTrailBrainParams(engine: TrailBrainEngine): TrailBrainParams {
  switch (engine) {
    case 'sol': return { activation: 20, trailDist: 8, giveBackCap: 12, lockSteps: [{ atPeak: 30, lock: 8 }, { atPeak: 50, lock: 25 }] };
    case 'kalshi': return { activation: 15, trailDist: 6, giveBackCap: 10, lockSteps: [{ atPeak: 25, lock: 5 }, { atPeak: 40, lock: 15 }] };
    default: return { activation: 1, trailDist: 0.75, giveBackCap: 1, lockSteps: [{ atPeak: 2, lock: 0.5 }, { atPeak: 3, lock: 1.5 }] };
  }
}

const clampNum = (v: number, [lo, hi]: [number, number], fallback: number): number =>
  Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;

/** Force any parameter set inside the engine's hard clamps. Pure. */
export function clampTrailBrainParams(engine: TrailBrainEngine, p: TrailBrainParams): TrailBrainParams {
  const c = trailBrainClamps(engine);
  const d = defaultTrailBrainParams(engine);
  const gap = engine === 'sol' || engine === 'kalshi' ? 1 : 0.1;
  const lockSteps = (Array.isArray(p.lockSteps) ? p.lockSteps : [])
    .filter(s => s && Number.isFinite(s.atPeak) && Number.isFinite(s.lock))
    .map(s => {
      const atPeak = clampNum(s.atPeak, c.lockAtPeak, d.lockSteps[0].atPeak);
      return { atPeak, lock: Math.max(0, Math.min(s.lock, atPeak - gap)) };
    })
    .sort((a, b) => a.atPeak - b.atPeak)
    .slice(0, 4);
  return {
    activation: clampNum(p.activation, c.activation, d.activation),
    trailDist: clampNum(p.trailDist, c.trailDist, d.trailDist),
    giveBackCap: clampNum(p.giveBackCap, c.giveBackCap, d.giveBackCap),
    lockSteps: lockSteps.length ? lockSteps : d.lockSteps,
  };
}

// ── The real-time decision (pure; the ONLY place it lives) ────────────────
export interface TrailBrainDecision {
  /** Peak reached the activation threshold. */
  armed: boolean;
  /** Stop floor in progress units — NEVER below stopFloor. */
  floor: number;
  /** Current progress is at/under the floor: exit now. */
  exitNow: boolean;
  /** The brain's floor is tighter than the original stop — the brain is
   *  actually governing this trade (attribution + logging hang off this). */
  binding: boolean;
}

/**
 * Decide one tick. `peak` / `current` are the trade's progress in the
 * group's units (R multiple, or % price move in the trade's favour);
 * `stopFloor` is the progress value at the trade's ORIGINAL stop
 * (−1 in R units, −slPct in % units). The returned floor is clamped at
 * stopFloor for every input — the brain can tighten a stop, it can
 * never widen one past where the trade started.
 */
export function trailBrainDecide(params: TrailBrainParams, input: { peak: number; current: number; stopFloor: number }): TrailBrainDecision {
  const { peak, current, stopFloor } = input;
  if (!Number.isFinite(peak) || !Number.isFinite(current) || !Number.isFinite(stopFloor) || peak < params.activation) {
    return { armed: false, floor: stopFloor, exitNow: false, binding: false };
  }
  const effDist = Math.min(params.trailDist, params.giveBackCap);
  let floor = peak - effDist;
  for (const s of params.lockSteps) {
    if (peak >= s.atPeak) floor = Math.max(floor, s.lock);
  }
  floor = Math.max(floor, stopFloor);
  return { armed: true, floor, exitNow: current <= floor, binding: floor > stopFloor };
}

/**
 * Price-space helper for the %-unit price lanes (Kalshi shadow + live):
 * the trailed stop price implied by the peak gain so far. Returns null
 * when the brain is not binding (floor at/under the original stop).
 */
export function trailBrainStopPrice(input: {
  direction: string; entryPrice: number; peakGainPct: number; currentGainPct: number; slPct: number; params: TrailBrainParams;
}): { stopPrice: number; floorPct: number; exitNow: boolean } | null {
  const { entryPrice, peakGainPct, currentGainPct, slPct, params } = input;
  if (!(entryPrice > 0) || !(slPct > 0)) return null;
  const d = trailBrainDecide(params, { peak: peakGainPct, current: currentGainPct, stopFloor: -slPct });
  if (!d.binding) return null;
  const short = input.direction === 'short';
  const stopPrice = short ? entryPrice * (1 - d.floor / 100) : entryPrice * (1 + d.floor / 100);
  return { stopPrice, floorPct: d.floor, exitNow: d.exitNow };
}

// ── The learning adjustment (pure; applied by trail-brain-learning.ts) ────
export type TrailBrainAdjustment =
  | { action: 'none'; reason: string }
  | { action: 'tighten' | 'loosen'; params: TrailBrainParams; reason: string }
  | { action: 'dormant'; reason: string };

export const TRAIL_BRAIN_MIN_EVIDENCE = () => Math.max(3, Math.floor(Number(process.env.TRAIL_BRAIN_MIN_TRADES ?? 10) || 10));
const MIN_BASELINE = 5;

/**
 * One learning step for one group, from its evidence snapshot. Pure.
 * Rules, in order: not enough brain-governed closes → watch. Proven
 * harm (brain closes worse than the group's own baseline by the harm
 * delta) → loosen one step; already at the loosest clamps → go dormant
 * rather than keep hurting. Give-back above the group's cap → tighten
 * one step. Otherwise, if the brain is beating the baseline give-back
 * without hurting closes → tighten half a step to squeeze more.
 */
export function adjustTrailBrainParams(engine: TrailBrainEngine, params: TrailBrainParams, ev: TrailBrainEvidence): TrailBrainAdjustment {
  const c = trailBrainClamps(engine);
  const unit = trailBrainUnit(engine);
  const min = TRAIL_BRAIN_MIN_EVIDENCE();
  if (ev.brainTrades < min || ev.brainAvgFinal == null) {
    return { action: 'none', reason: `watching — ${ev.brainTrades}/${min} brain-guided closes so far` };
  }
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(unit === 'R' ? 2 : 1)}${unit === 'R' ? 'R' : '%'}`;
  const hasBase = ev.baseTrades >= MIN_BASELINE && ev.baseAvgFinal != null;
  if (hasBase && ev.brainAvgFinal <= (ev.baseAvgFinal as number) - c.harmDelta) {
    const loosest = params.trailDist >= c.trailDist[1] - 1e-9 && params.activation >= c.activation[1] - 1e-9;
    if (loosest) {
      return { action: 'dormant', reason: `brain-guided closes average ${fmt(ev.brainAvgFinal)} vs ${fmt(ev.baseAvgFinal as number)} before it, and the settings are already at their loosest — the brain stands down for this group` };
    }
    const next = clampTrailBrainParams(engine, {
      ...params,
      trailDist: params.trailDist + c.step,
      activation: params.activation + c.step / 2,
    });
    return { action: 'loosen', params: next, reason: `brain-guided closes average ${fmt(ev.brainAvgFinal)} vs ${fmt(ev.baseAvgFinal as number)} un-guided — winners are being cut short, so the trail loosens one step` };
  }
  if (ev.brainAvgGiveback != null && ev.brainAvgGiveback > params.giveBackCap) {
    const next = clampTrailBrainParams(engine, {
      ...params,
      trailDist: params.trailDist - c.step,
      activation: params.activation - c.step / 2,
    });
    if (next.trailDist === params.trailDist && next.activation === params.activation) {
      return { action: 'none', reason: `give-back ${fmt(ev.brainAvgGiveback)} is over the ${fmt(params.giveBackCap)} cap but the settings are already at their tightest` };
    }
    return { action: 'tighten', params: next, reason: `brain-guided closes give back ${fmt(ev.brainAvgGiveback)} from peak on average, over the ${fmt(params.giveBackCap)} cap — the trail tightens one step` };
  }
  if (hasBase && ev.baseAvgGiveback != null && ev.brainAvgGiveback != null
      && ev.brainAvgGiveback < ev.baseAvgGiveback && ev.brainAvgFinal >= (ev.baseAvgFinal as number)) {
    const next = clampTrailBrainParams(engine, { ...params, trailDist: params.trailDist - c.step / 2 });
    if (next.trailDist === params.trailDist) return { action: 'none', reason: 'the trail is working and already at its tightest useful setting' };
    return { action: 'tighten', params: next, reason: `give-back is down (${fmt(ev.brainAvgGiveback)} vs ${fmt(ev.baseAvgGiveback)}) and closes are not worse — squeezing half a step tighter` };
  }
  return { action: 'none', reason: 'the current settings are holding — no change this pass' };
}

// ── Store (runtime_state, cached like the trail guards) ───────────────────
// The cache records whether the read actually succeeded: an UNREADABLE
// store is not the same as an empty one. Consults fail open on an
// unreadable store (no governing at all — a group the learner stood
// down must not spring back during an outage), while panel/learning
// reads degrade to the empty store.
const _cache = new Map<number, { at: number; store: TrailBrainStore; ok: boolean }>();
const CACHE_MS = 30_000;

async function loadTrailBrainStore(userId: number): Promise<{ store: TrailBrainStore; ok: boolean }> {
  const hit = _cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit;
  let store: TrailBrainStore = { groups: {} };
  let ok = true;
  try {
    const v = await getRuntimeStateStrict(STORE_SCOPE, String(userId));
    if (v && typeof v === 'object' && v.groups && typeof v.groups === 'object') store = v as TrailBrainStore;
  } catch { ok = false; }
  const entry = { at: Date.now(), store, ok };
  _cache.set(userId, entry);
  return entry;
}

export async function getTrailBrainStore(userId: number): Promise<TrailBrainStore> {
  return (await loadTrailBrainStore(userId)).store;
}

export async function saveTrailBrainStore(userId: number, store: TrailBrainStore): Promise<void> {
  _cache.set(userId, { at: Date.now(), store, ok: true });
  saveRuntimeState(STORE_SCOPE, String(userId), store);
}

// ── Per-user per-engine toggles (panel) ────────────────────────────────────
export interface TrailBrainSettings { engines: Partial<Record<TrailBrainEngine, boolean>> }

export async function getTrailBrainSettings(userId: number): Promise<TrailBrainSettings> {
  try {
    const v = await getRuntimeStateStrict(SETTINGS_SCOPE, String(userId));
    if (v && typeof v === 'object' && v.engines) return v as TrailBrainSettings;
  } catch { /* defaults: everything on */ }
  return { engines: {} };
}

export async function saveTrailBrainSettings(userId: number, s: TrailBrainSettings): Promise<void> {
  saveRuntimeState(SETTINGS_SCOPE, String(userId), s);
}

async function userEngineOn(userId: number, engine: TrailBrainEngine): Promise<boolean> {
  const s = await getTrailBrainSettings(userId);
  return s.engines[engine] !== false;
}

// ── Consults (hot path — cached, fail-open) ────────────────────────────────
/**
 * The group's current parameters, or null when the brain must not
 * govern: kill switch off, the user's panel toggle off, the group is
 * dormant, or the store is unreadable. A first consult CREATES the
 * group at the documented defaults so the panel and the learner can
 * see it; creation is fire-and-forget and never blocks the tick.
 */
export async function trailBrainConsult(
  userId: number, engine: TrailBrainEngine, strategy: string, condition: string,
): Promise<TrailBrainConsult | null> {
  if (!trailBrainOn(engine)) return null;
  try {
    if (!(await userEngineOn(userId, engine))) return null;
    const { store, ok } = await loadTrailBrainStore(userId);
    if (!ok) return null; // store unreadable → no governing (fail open)
    const key = groupKeyFor(engine, strategy, condition);
    let g = store.groups[key];
    if (!g) {
      const now = new Date().toISOString();
      g = {
        key, engine, strategy: strategy || 'all', condition: condition || 'all',
        unit: trailBrainUnit(engine), params: defaultTrailBrainParams(engine),
        version: 1, status: 'active', evidence: null, lastAdjustment: null,
        createdAt: now, updatedAt: now,
      };
      store.groups[key] = g;
      void saveTrailBrainStore(userId, store);
    }
    if (g.status === 'dormant') return null;
    return { groupKey: key, engine, unit: g.unit, params: clampTrailBrainParams(engine, g.params), version: g.version };
  } catch { return null; }
}

/**
 * Sol consult — strategy ONLY. There is deliberately no symbol
 * parameter: Sol trail knowledge keys on the strategy's pooled record
 * across tokens, never on a token (Chris's rule, 2026-11-15).
 */
export async function trailBrainSolConsult(userId: number, strategyId: string | null | undefined): Promise<TrailBrainConsult | null> {
  return trailBrainConsult(userId, 'sol', strategyId || 'all', 'all');
}

/** Panel action: forget a group (dormant or not) — it restarts at the
 *  documented defaults on its next consult. */
export async function resetTrailBrainGroup(userId: number, groupKey: string): Promise<boolean> {
  try {
    const store = await getTrailBrainStore(userId);
    if (!store.groups[groupKey]) return false;
    delete store.groups[groupKey];
    await saveTrailBrainStore(userId, store);
    return true;
  } catch { return false; }
}

// ── Attribution stamps ─────────────────────────────────────────────────────
// When the brain's floor binds on a trade, the trade row is stamped
// with the parameter version + group in force, so the learning layer
// can count exactly the closes the brain governed. Lazy additive
// columns per table — the trail-guard pattern (ensure is idempotent,
// memoized, and NEVER rejects: the 2026-11-13 lesson was that a stamp
// column's existence must never depend on a gated code path).
const _colsEnsured = new Map<string, Promise<void>>();
export function ensureTrailBrainColumns(table: string): Promise<void> {
  let p = _colsEnsured.get(table);
  if (!p) {
    p = pool.query(`ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS trail_brain_version integer,
        ADD COLUMN IF NOT EXISTS trail_brain_group text`)
      .then(() => undefined)
      .catch((e: any) => {
        _colsEnsured.delete(table);
        console.error(`[trail-brain] stamp-column ensure failed for ${table} (non-fatal, will retry):`, e?.message || e);
      });
    _colsEnsured.set(table, p);
  }
  return p;
}

const _stamped = new Set<string>();
/** Stamp a trade row as brain-governed. Memoized per process; a failed
 *  stamp never throws and never blocks the engine. */
export async function stampTrailBrainTrade(table: string, id: number | string, consult: TrailBrainConsult): Promise<void> {
  const memo = `${table}:${id}:${consult.version}`;
  if (_stamped.has(memo)) return;
  _stamped.add(memo);
  try {
    await ensureTrailBrainColumns(table);
    await pool.query(
      `UPDATE ${table} SET trail_brain_version = $2, trail_brain_group = $3 WHERE id = $1`,
      [id, consult.version, consult.groupKey]);
  } catch (e: any) {
    _stamped.delete(memo);
    console.error('[trail-brain] stamp failed (non-fatal):', e?.message || e);
  }
}

// ── Decisions log (panel: recent decisions in plain words) ────────────────
export interface TrailBrainDecisionLogEntry {
  at: string; engine: TrailBrainEngine; groupKey: string; version: number; text: string;
}

const _logBuffer = new Map<number, { entries: TrailBrainDecisionLogEntry[]; lastFlush: number }>();

/** Buffer a plain-words decision; flushed to runtime_state in small
 *  batches so the hot path never writes per tick. Display only — the
 *  evidence of record is the trade-row stamps, never this log. */
export function logTrailBrainDecision(userId: number, entry: Omit<TrailBrainDecisionLogEntry, 'at'>): void {
  try {
    let b = _logBuffer.get(userId);
    if (!b) { b = { entries: [], lastFlush: Date.now() }; _logBuffer.set(userId, b); }
    b.entries.push({ ...entry, at: new Date().toISOString() });
    if (b.entries.length > 50) b.entries = b.entries.slice(-50);
    if (b.entries.length >= 5 || Date.now() - b.lastFlush > 60_000) {
      const flush = b.entries.splice(0, b.entries.length);
      b.lastFlush = Date.now();
      void (async () => {
        try {
          const prev = await getRuntimeStateStrict(LOG_SCOPE, String(userId)).catch(() => null);
          const merged = [...(Array.isArray(prev) ? prev : []), ...flush].slice(-40);
          saveRuntimeState(LOG_SCOPE, String(userId), merged);
        } catch { /* display only */ }
      })();
    }
  } catch { /* display only */ }
}

export async function getTrailBrainLog(userId: number): Promise<TrailBrainDecisionLogEntry[]> {
  try {
    const v = await getRuntimeStateStrict(LOG_SCOPE, String(userId));
    const stored = Array.isArray(v) ? (v as TrailBrainDecisionLogEntry[]) : [];
    const pending = _logBuffer.get(userId)?.entries ?? [];
    return [...stored, ...pending].slice(-40).reverse();
  } catch { return []; }
}

// ── FX attribution registry ────────────────────────────────────────────────
// FX closes are written by tradelocker-sync's outcome writer, whose
// ticket namespace differs from the trail loop's merged-position keys —
// so the trail loop records "the brain governed this symbol+direction"
// here (in-memory, 24 h), and the outcome writer stamps the version
// onto the close row when it lands. DX/MT5 closes have no outcome
// writer at all (pre-existing gap); their governed stops are recorded
// in the decisions log at apply time instead.
const _fxGoverned = new Map<string, { version: number; groupKey: string; at: number }>();
const FX_GOVERNED_TTL_MS = 24 * 3_600_000;

export function noteTrailBrainFxGoverned(userId: number, symbol: string, direction: string, consult: TrailBrainConsult): void {
  _fxGoverned.set(`${userId}|${String(symbol).toUpperCase()}|${String(direction).toUpperCase()}`, {
    version: consult.version, groupKey: consult.groupKey, at: Date.now(),
  });
}

export function takeTrailBrainFxAttribution(userId: number, symbol: string, direction: string): { version: number; groupKey: string } | null {
  const k = `${userId}|${String(symbol).toUpperCase()}|${String(direction).toUpperCase()}`;
  const hit = _fxGoverned.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > FX_GOVERNED_TTL_MS) { _fxGoverned.delete(k); return null; }
  return { version: hit.version, groupKey: hit.groupKey };
}

// ── Plain-words summary (panel) ────────────────────────────────────────────
export function trailBrainParamsSummary(engine: TrailBrainEngine, p: TrailBrainParams): string {
  const u = trailBrainUnit(engine) === 'R' ? 'R' : '%';
  const f = (v: number) => `${v}${u}`;
  const locks = p.lockSteps.map(s => `locks ${f(s.lock)} at ${f(s.atPeak)}`).join(', ');
  return `arms at ${f(p.activation)}, trails ${f(p.trailDist)} behind the peak, gives back at most ${f(p.giveBackCap)}${locks ? `, ${locks}` : ''}`;
}

/** Everything the Guards & Trails panel renders for the Trail Brain. */
export async function getTrailBrainReport(userId: number) {
  const [store, settings, log] = await Promise.all([
    getTrailBrainStore(userId), getTrailBrainSettings(userId), getTrailBrainLog(userId),
  ]);
  const engines = (['crypto', 'fx', 'sol', 'kalshi'] as TrailBrainEngine[]).map(engine => ({
    engine,
    envOn: trailBrainOn(engine),
    userOn: settings.engines[engine] !== false,
    on: trailBrainOn(engine) && settings.engines[engine] !== false,
  }));
  const groups = Object.values(store.groups)
    .sort((a, b) => a.engine.localeCompare(b.engine) || a.key.localeCompare(b.key))
    .map(g => ({ ...g, paramsSummary: trailBrainParamsSummary(g.engine, g.params) }));
  return { engines, groups, decisions: log };
}
