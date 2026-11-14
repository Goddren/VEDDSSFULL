// ─────────────────────────────────────────────────────────────────────────────
// Gate calibration — measure what the FX engine's two SOFT gates should be
// per pair × session, from the app's own records, recommend tuned values,
// and apply them ONLY on the user's tap, per slice.
//
// THE TWO GATES (both inside processDecision, live-trading-engine.ts):
//   1. Confidence floor — default max(config.minConfidence, 74).
//   2. The R:R gate's high-confidence exception — a sub-1:2 plan needs 88%+.
// HARD SAFETY GATES ARE NEVER CONSULTED OR OVERRIDDEN HERE: daily-loss
// halt, drawdown breaker/shield, per-trade risk cap, max lot, no-SL/no-TP
// blocks, news blackout, brain hard blocks. The override is read at exactly
// those two evaluation sites and nowhere else, and every consult fails open
// to the global defaults on any error or miss.
//
// EVIDENCE (rolling 90 days, per user):
//   TAKEN   — fx_brain_outcomes: ai_confidence, realised_rr (the signed R
//             multiple), result, canonical session. Reliability per
//             confidence band: does "80-88% confidence" actually win like it?
//   BLOCKED — fx_model_decisions source='guard_block' rows scored by the
//             shadow resolver (result + r_multiple): what each guard's
//             rejects WOULD have done. 'rr_gate_skip' and
//             'confidence_floor_skip' counterfactuals are recorded from the
//             deploy of this feature onward — their history starts empty
//             and accumulates; the six older guard kinds reach back to
//             PR #24. Eligibility counts ALL resolved blocked plans in the
//             slice, so slices can qualify on older-guard evidence while
//             the gate-specific kinds accumulate.
//
// RECOMMENDATION RULE (pure — recommendForSlice; min samples are hard):
//   ELIGIBLE only with >= 30 taken trades carrying a confidence AND
//   >= 30 resolved blocked plans in the same slice. Below that the answer
//   is "not enough data" — no recommendation, nothing to apply.
//   (a) confidenceFloor: walk the confidence bands low → high; the first
//       band with n >= 10, win rate >= 50% and avg R > 0 sets the floor to
//       that band's lower edge, clamped to [60, 90]. No qualifying band →
//       no floor recommendation (the slice never shows a confidence level
//       that wins half its trades with positive expectancy).
//   (b) rrHighConfThreshold: from the slice's sub-1:2 rr_gate_skip
//       counterfactuals (planned R:R in [1.5, 2)), the smallest T in
//       {80, 88, 95} where the plans BELOW T aggregate to n >= 10 with
//       avg R < 0 while the plans AT/ABOVE T (when n >= 10) aggregate to
//       avg R >= 0 — below T they lost money, at T they did not. Special
//       cases: if even below-80 is net-positive (n >= 10), recommend 80
//       (the evidence never justifies stricter, loosest clamp wins); if
//       below-95 AND at/above-95 are both net-negative (n >= 10 each),
//       recommend 95; otherwise no threshold recommendation.
//   Pair-only rollup slices (session = null, key "PAIR|*") are computed
//   the same way from pair-wide evidence for pairs whose session slices
//   are thin. Consult precedence: exact pair × session override, then the
//   pair override, then the global defaults — per field.
//
// STORAGE: runtime_state scope 'gate_calibration' (the computed payload)
// and 'gate_overrides' (the user's applied slices), key = user id — the
// trail-guards storage idiom, with the same 30s in-memory cache on the hot
// consult path. Apply/revert audit rows go to shadow_lesson_blocks with
// lane 'gate_calibration' via logShadowLessonBlock.
//
// Kill switch: GATE_CALIBRATION=off disables compute AND consult — the
// engine then runs on pure defaults even if overrides exist.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from '../db';
import { canonSession } from '../utils/session';
import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';
import { logShadowLessonBlock } from './shadow-lesson-gate';

export function gateCalibrationOn(): boolean {
  return process.env.GATE_CALIBRATION !== 'off';
}

export const GC_WINDOW_DAYS = 90;
export const GC_MIN_TAKEN = 30;
export const GC_MIN_BLOCKED = 30;
export const GC_MIN_BAND_N = 10;
export const GC_FLOOR_CLAMP: [number, number] = [60, 90];
export const GC_RR_CLAMP: [number, number] = [80, 95];
const COMPUTE_TTL_MS = 6 * 60 * 60_000; // panel-driven recompute at most every ~6h
const CAL_SCOPE = 'gate_calibration';
const OVR_SCOPE = 'gate_overrides';

// ── Confidence bands ────────────────────────────────────────────────────────
export interface ConfBand { key: string; lo: number; hi: number | null; edge: number }
export const CONF_BANDS: ConfBand[] = [
  { key: '<70', lo: 0, hi: 70, edge: 60 },
  { key: '70-80', lo: 70, hi: 80, edge: 70 },
  { key: '80-88', lo: 80, hi: 88, edge: 80 },
  { key: '88-95', lo: 88, hi: 95, edge: 88 },
  { key: '95+', lo: 95, hi: null, edge: 95 },
];
export function bandIndexFor(confidence: number): number {
  for (let i = 0; i < CONF_BANDS.length; i++) {
    const b = CONF_BANDS[i];
    if (confidence >= b.lo && (b.hi == null || confidence < b.hi)) return i;
  }
  return CONF_BANDS.length - 1;
}

// ── Pure aggregation ────────────────────────────────────────────────────────
export interface BandStat { band: string; n: number; wins: number; winRate: number | null; sumR: number; avgR: number | null }
export interface TakenRow { symbol: string; session: string | null; confidence: number | null; r: number | null; win: boolean }
export interface BlockedRow { symbol: string; session: string | null; guard: string; confidence: number | null; plannedRR: number | null; r: number | null; win: boolean; resolved: boolean }

function emptyBands(): BandStat[] {
  return CONF_BANDS.map((b) => ({ band: b.key, n: 0, wins: 0, winRate: null, sumR: 0, avgR: null }));
}
function addToBand(bands: BandStat[], confidence: number | null, win: boolean, r: number | null): void {
  if (confidence == null || !Number.isFinite(confidence) || r == null || !Number.isFinite(r)) return;
  const s = bands[bandIndexFor(confidence)];
  s.n++; if (win) s.wins++; s.sumR += r;
}
function finishBands(bands: BandStat[]): BandStat[] {
  for (const s of bands) {
    s.winRate = s.n > 0 ? s.wins / s.n : null;
    s.avgR = s.n > 0 ? s.sumR / s.n : null;
    s.sumR = Math.round(s.sumR * 1000) / 1000;
    if (s.avgR != null) s.avgR = Math.round(s.avgR * 1000) / 1000;
    if (s.winRate != null) s.winRate = Math.round(s.winRate * 1000) / 1000;
  }
  return bands;
}

export interface SliceStats {
  key: string;
  symbol: string;
  session: string | null; // null = pair rollup ("all sessions")
  takenN: number;
  takenWins: number;
  takenWinRate: number | null;
  takenSumR: number;
  takenAvgR: number | null;
  bands: BandStat[];
  blockedN: number; // resolved blocked plans in this slice, all guard kinds
  blockedSumR: number;
  guardYields: Array<{ guard: string; n: number; sumR: number; avgR: number | null }>;
  /** Sub-1:2 R:R-gate counterfactuals only (planned R:R in [1.5, 2)). */
  rrSub12N: number;
  rrSub12SumR: number;
  rrSub12Bands: BandStat[];
}

export function sliceKey(symbol: string, session: string | null): string {
  return `${symbol}|${session ?? '*'}`;
}

export function aggregateSlices(taken: TakenRow[], blocked: BlockedRow[]): SliceStats[] {
  const map = new Map<string, SliceStats & { _guards: Map<string, { n: number; sumR: number }> }>();
  const get = (symbol: string, session: string | null) => {
    const key = sliceKey(symbol, session);
    let s = map.get(key);
    if (!s) {
      s = {
        key, symbol, session,
        takenN: 0, takenWins: 0, takenWinRate: null, takenSumR: 0, takenAvgR: null,
        bands: emptyBands(), blockedN: 0, blockedSumR: 0, guardYields: [],
        rrSub12N: 0, rrSub12SumR: 0, rrSub12Bands: emptyBands(),
        _guards: new Map(),
      };
      map.set(key, s);
    }
    return s;
  };
  // Every row feeds its pair × session slice AND its pair rollup slice.
  const targets = (symbol: string, session: string | null) =>
    session ? [get(symbol, session), get(symbol, null)] : [get(symbol, null)];

  for (const t of taken) {
    if (t.confidence == null || !Number.isFinite(t.confidence) || t.r == null || !Number.isFinite(t.r)) continue;
    for (const s of targets(t.symbol, t.session)) {
      s.takenN++; if (t.win) s.takenWins++; s.takenSumR += t.r;
      addToBand(s.bands, t.confidence, t.win, t.r);
    }
  }
  for (const b of blocked) {
    if (!b.resolved || b.r == null || !Number.isFinite(b.r)) continue;
    for (const s of targets(b.symbol, b.session)) {
      s.blockedN++; s.blockedSumR += b.r;
      const g = s._guards.get(b.guard) ?? { n: 0, sumR: 0 };
      g.n++; g.sumR += b.r; s._guards.set(b.guard, g);
      if (b.guard === 'rr_gate_skip' && b.plannedRR != null && b.plannedRR >= 1.5 && b.plannedRR < 2.0) {
        s.rrSub12N++; s.rrSub12SumR += b.r;
        addToBand(s.rrSub12Bands, b.confidence, b.win, b.r);
      }
    }
  }
  const out: SliceStats[] = [];
  for (const s of Array.from(map.values())) {
    s.takenWinRate = s.takenN > 0 ? Math.round((s.takenWins / s.takenN) * 1000) / 1000 : null;
    s.takenAvgR = s.takenN > 0 ? Math.round((s.takenSumR / s.takenN) * 1000) / 1000 : null;
    s.takenSumR = Math.round(s.takenSumR * 1000) / 1000;
    s.blockedSumR = Math.round(s.blockedSumR * 1000) / 1000;
    s.rrSub12SumR = Math.round(s.rrSub12SumR * 1000) / 1000;
    finishBands(s.bands); finishBands(s.rrSub12Bands);
    s.guardYields = Array.from(s._guards.entries())
      .map(([guard, v]) => ({ guard, n: v.n, sumR: Math.round(v.sumR * 1000) / 1000, avgR: v.n > 0 ? Math.round((v.sumR / v.n) * 1000) / 1000 : null }))
      .sort((a, b2) => b2.n - a.n);
    const { _guards, ...pub } = s;
    out.push(pub);
  }
  return out.sort((a, b) => (b.takenN + b.blockedN) - (a.takenN + a.blockedN));
}

// ── Recommendation rule (pure) ──────────────────────────────────────────────
export interface GateRecommendation {
  confidenceFloor: number | null;
  rrHighConfThreshold: number | null;
  reasons: string[];
}
const clamp = (v: number, [lo, hi]: [number, number]) => Math.max(lo, Math.min(hi, v));

export function recommendForSlice(s: SliceStats): GateRecommendation | null {
  if (s.takenN < GC_MIN_TAKEN || s.blockedN < GC_MIN_BLOCKED) return null;
  const reasons: string[] = [];

  // (a) confidence floor: lowest band that actually wins.
  let confidenceFloor: number | null = null;
  for (let i = 0; i < CONF_BANDS.length; i++) {
    const b = s.bands[i];
    if (b.n >= GC_MIN_BAND_N && b.winRate != null && b.winRate >= 0.5 && b.avgR != null && b.avgR > 0) {
      confidenceFloor = clamp(CONF_BANDS[i].edge, GC_FLOOR_CLAMP);
      reasons.push(`At ${b.band}% confidence this slice wins ${(b.winRate * 100).toFixed(0)}% (n=${b.n}, avg ${b.avgR >= 0 ? '+' : ''}${b.avgR.toFixed(2)}R) — the lowest band that wins half its trades with positive expectancy.`);
      break;
    }
  }
  if (confidenceFloor == null) reasons.push('No confidence band wins half its trades with positive expectancy — no floor recommendation.');

  // (b) sub-1:2 high-confidence threshold, from rr_gate_skip counterfactuals.
  let rrHighConfThreshold: number | null = null;
  const bands = s.rrSub12Bands;
  const aggBelow = (t: number) => {
    let n = 0, sumR = 0;
    for (let i = 0; i < bands.length; i++) {
      // A plan counts as "below T" when its band's top edge is <= T.
      const top = CONF_BANDS[i].hi ?? Number.POSITIVE_INFINITY;
      if (top <= t) { n += bands[i].n; sumR += bands[i].sumR; }
    }
    return { n, avgR: n > 0 ? sumR / n : null };
  };
  const aggAtAbove = (t: number) => {
    let n = 0, sumR = 0;
    for (let i = 0; i < bands.length; i++) {
      const top = CONF_BANDS[i].hi ?? Number.POSITIVE_INFINITY;
      if (top > t) { n += bands[i].n; sumR += bands[i].sumR; }
    }
    return { n, avgR: n > 0 ? sumR / n : null };
  };
  if (s.rrSub12N >= GC_MIN_BAND_N) {
    for (const t of [80, 88, 95]) {
      const below = aggBelow(t), above = aggAtAbove(t);
      if (below.n >= GC_MIN_BAND_N && below.avgR != null && below.avgR < 0 && (above.n < GC_MIN_BAND_N || (above.avgR != null && above.avgR >= 0))) {
        rrHighConfThreshold = clamp(t, GC_RR_CLAMP);
        reasons.push(`Sub-1:2 trades the R:R gate turned away below ${t}% confidence would have lost money (avg ${below.avgR.toFixed(2)}R, n=${below.n}) — keep the exception at ${t}% or higher.`);
        break;
      }
    }
    if (rrHighConfThreshold == null) {
      const below80 = aggBelow(80);
      const below95 = aggBelow(95), above95 = aggAtAbove(95);
      if (below80.n >= GC_MIN_BAND_N && below80.avgR != null && below80.avgR >= 0) {
        rrHighConfThreshold = GC_RR_CLAMP[0];
        reasons.push(`Even the sub-1:2 trades turned away below 80% confidence would have made money (avg +${below80.avgR.toFixed(2)}R, n=${below80.n}) — the exception can loosen to 80%.`);
      } else if (below95.n >= GC_MIN_BAND_N && below95.avgR != null && below95.avgR < 0 && above95.n >= GC_MIN_BAND_N && above95.avgR != null && above95.avgR < 0) {
        rrHighConfThreshold = GC_RR_CLAMP[1];
        reasons.push('Sub-1:2 trades lost money at every confidence level scored — only the very highest confidence (95%) should ever take them.');
      }
    }
  }
  if (rrHighConfThreshold == null && s.rrSub12N >= GC_MIN_BAND_N) {
    reasons.push('Sub-1:2 counterfactual evidence is mixed — no threshold recommendation.');
  }
  if (confidenceFloor == null && rrHighConfThreshold == null) return null;
  return { confidenceFloor, rrHighConfThreshold, reasons };
}

// ── Threshold resolution (pure; used by the engine consult) ────────────────
export interface GateValues { confidenceFloor: number | null; rrHighConfThreshold: number | null }
export function resolveGateThresholds(
  exact: GateValues | null,
  pair: GateValues | null,
  defaults: { confidenceFloor: number; rrHighConfThreshold: number },
): { confidenceFloor: number; rrHighConfThreshold: number } {
  return {
    confidenceFloor: exact?.confidenceFloor ?? pair?.confidenceFloor ?? defaults.confidenceFloor,
    rrHighConfThreshold: exact?.rrHighConfThreshold ?? pair?.rrHighConfThreshold ?? defaults.rrHighConfThreshold,
  };
}

// ── Overrides: storage + hot consult (trail-guards idiom) ──────────────────
export interface AppliedOverride extends GateValues {
  appliedAt: string;
  statsSnapshot?: unknown;
}
interface OverridesState { slices: Record<string, AppliedOverride>; history: Array<{ at: string; action: 'apply' | 'revert'; key: string }> }

const _ovrCache = new Map<number, { at: number; state: OverridesState }>();
const OVR_CACHE_MS = 30_000;

async function loadOverrides(userId: number): Promise<OverridesState> {
  const hit = _ovrCache.get(userId);
  if (hit && Date.now() - hit.at < OVR_CACHE_MS) return hit.state;
  let state: OverridesState = { slices: {}, history: [] };
  try {
    const v = await getRuntimeStateStrict(OVR_SCOPE, String(userId));
    if (v && typeof v === 'object' && v.slices && typeof v.slices === 'object') {
      state = { slices: v.slices, history: Array.isArray(v.history) ? v.history : [] };
    }
  } catch { /* empty — fail open to defaults */ }
  _ovrCache.set(userId, { at: Date.now(), state });
  return state;
}

function storeOverrides(userId: number, state: OverridesState): void {
  _ovrCache.set(userId, { at: Date.now(), state });
  saveRuntimeState(OVR_SCOPE, String(userId), state);
}

/**
 * Engine consult — the ONLY runtime read of the overrides. Returns the
 * exact-slice and pair-rollup overrides separately; the caller resolves
 * precedence with resolveGateThresholds against its own defaults. Fails
 * open (both null) on kill switch, miss, or any error.
 */
export async function getGateCalibrationOverridesFor(
  userId: number,
  symbol: string,
  session: string | null,
): Promise<{ exact: GateValues | null; pair: GateValues | null }> {
  if (!gateCalibrationOn()) return { exact: null, pair: null };
  try {
    const state = await loadOverrides(userId);
    const pick = (o?: AppliedOverride): GateValues | null =>
      o ? { confidenceFloor: o.confidenceFloor ?? null, rrHighConfThreshold: o.rrHighConfThreshold ?? null } : null;
    return {
      exact: session ? pick(state.slices[sliceKey(symbol, session)]) : null,
      pair: pick(state.slices[sliceKey(symbol, null)]),
    };
  } catch {
    return { exact: null, pair: null };
  }
}

// ── Compute ─────────────────────────────────────────────────────────────────
export interface CalibrationPayload {
  enabled: boolean;
  computedAt: string | null;
  windowDays: number;
  slices: Array<SliceStats & { recommendation: GateRecommendation | null }>;
  thinSlices: number;
  guardYields: Array<{ guard: string; n: number; sumR: number; avgR: number | null }>;
  overrides: Record<string, AppliedOverride>;
}

async function fetchEvidence(userId: number): Promise<{ taken: TakenRow[]; blocked: BlockedRow[] }> {
  const [takenRes, blockedRes] = await Promise.all([
    pool.query(
      `SELECT symbol, session, hour_utc, ai_confidence, realised_rr, result
         FROM fx_brain_outcomes
        WHERE user_id = $1 AND closed_at > now() - ($2 || ' days')::interval`,
      [userId, String(GC_WINDOW_DAYS)],
    ).catch(() => ({ rows: [] as any[] })),
    pool.query(
      `SELECT symbol, session, created_at, confidence, entry_price, stop_loss, take_profit,
              result, r_multiple, context->>'guard' AS guard
         FROM fx_model_decisions
        WHERE user_id = $1 AND source = 'guard_block' AND mode = 'blocked'
          AND created_at > now() - ($2 || ' days')::interval`,
      [userId, String(GC_WINDOW_DAYS)],
    ).catch(() => ({ rows: [] as any[] })),
  ]);
  const taken: TakenRow[] = takenRes.rows.map((r: any) => ({
    symbol: String(r.symbol),
    session: canonSession(r.session, r.hour_utc != null ? Number(r.hour_utc) : null),
    confidence: r.ai_confidence != null ? Number(r.ai_confidence) : null,
    r: r.realised_rr != null ? Number(r.realised_rr) : null,
    win: String(r.result).toUpperCase() === 'WIN',
  }));
  const blocked: BlockedRow[] = blockedRes.rows.map((r: any) => {
    const entry = Number(r.entry_price), sl = Number(r.stop_loss), tp = Number(r.take_profit);
    const plannedRR = entry > 0 && sl > 0 && tp > 0 && Math.abs(entry - sl) > 0
      ? Math.abs(tp - entry) / Math.abs(entry - sl) : null;
    const created = r.created_at ? new Date(r.created_at) : null;
    return {
      symbol: String(r.symbol),
      session: canonSession(r.session, created ? created.getUTCHours() : null),
      guard: String(r.guard ?? 'unknown'),
      confidence: r.confidence != null ? Number(r.confidence) : null,
      plannedRR,
      r: r.r_multiple != null ? Number(r.r_multiple) : null,
      win: String(r.result ?? '').toUpperCase() === 'WIN',
      resolved: ['WIN', 'LOSS', 'EXPIRED'].includes(String(r.result ?? '').toUpperCase()),
    };
  });
  return { taken, blocked };
}

export async function computeGateCalibration(userId: number): Promise<CalibrationPayload | null> {
  if (!gateCalibrationOn()) return null;
  try {
    const { taken, blocked } = await fetchEvidence(userId);
    const slices = aggregateSlices(taken, blocked);
    // Global per-guard yields across all slices (panel context line).
    const byGuard = new Map<string, { n: number; sumR: number }>();
    for (const b of blocked) {
      if (!b.resolved || b.r == null) continue;
      const g = byGuard.get(b.guard) ?? { n: 0, sumR: 0 };
      g.n++; g.sumR += b.r; byGuard.set(b.guard, g);
    }
    const payload: CalibrationPayload = {
      enabled: true,
      computedAt: new Date().toISOString(),
      windowDays: GC_WINDOW_DAYS,
      slices: slices.map((s) => ({ ...s, recommendation: recommendForSlice(s) })),
      thinSlices: 0,
      guardYields: Array.from(byGuard.entries())
        .map(([guard, v]) => ({ guard, n: v.n, sumR: Math.round(v.sumR * 1000) / 1000, avgR: v.n > 0 ? Math.round((v.sumR / v.n) * 1000) / 1000 : null }))
        .sort((a, b) => b.n - a.n),
      overrides: {},
    };
    // Slices with almost no evidence are counted, not rendered one by one.
    payload.thinSlices = payload.slices.filter((s) => s.takenN < 10 && s.blockedN < 10).length;
    payload.slices = payload.slices.filter((s) => s.takenN >= 10 || s.blockedN >= 10);
    const state = await loadOverrides(userId);
    payload.overrides = state.slices;
    saveRuntimeState(CAL_SCOPE, String(userId), payload);
    return payload;
  } catch (e: any) {
    console.error('[gate-calibration] compute failed (non-fatal):', e?.message || e);
    return null;
  }
}

/** Panel read: stored payload, recomputed when missing or ~6h stale. */
export async function getGateCalibrationPanel(userId: number): Promise<CalibrationPayload> {
  const overrides = (await loadOverrides(userId)).slices;
  if (!gateCalibrationOn()) {
    return { enabled: false, computedAt: null, windowDays: GC_WINDOW_DAYS, slices: [], thinSlices: 0, guardYields: [], overrides };
  }
  let stored: CalibrationPayload | null = null;
  try {
    const v = await getRuntimeStateStrict(CAL_SCOPE, String(userId));
    if (v && typeof v === 'object' && Array.isArray(v.slices)) stored = v as CalibrationPayload;
  } catch { /* recompute below */ }
  const stale = !stored?.computedAt || Date.now() - new Date(stored.computedAt).getTime() > COMPUTE_TTL_MS;
  if (stored && !stale) return { ...stored, overrides };
  const fresh = await computeGateCalibration(userId);
  if (fresh) return fresh;
  if (stored) return { ...stored, overrides };
  return { enabled: true, computedAt: null, windowDays: GC_WINDOW_DAYS, slices: [], thinSlices: 0, guardYields: [], overrides };
}

// ── Apply / revert (the user's tap only) ────────────────────────────────────
export async function applyGateCalibration(
  userId: number,
  symbol: string,
  session: string | null,
): Promise<{ ok: boolean; status: number; error?: string; overrides?: Record<string, AppliedOverride> }> {
  if (!gateCalibrationOn()) return { ok: false, status: 409, error: 'Gate calibration is off (GATE_CALIBRATION=off).' };
  const panel = await getGateCalibrationPanel(userId);
  const key = sliceKey(symbol, session);
  const slice = panel.slices.find((s) => s.key === key);
  if (!slice?.recommendation) {
    return { ok: false, status: 404, error: `No current recommendation for ${symbol} · ${session ?? 'all sessions'} — not enough scored evidence yet.` };
  }
  const state = await loadOverrides(userId);
  const override: AppliedOverride = {
    confidenceFloor: slice.recommendation.confidenceFloor,
    rrHighConfThreshold: slice.recommendation.rrHighConfThreshold,
    appliedAt: new Date().toISOString(),
    statsSnapshot: {
      computedAt: panel.computedAt, takenN: slice.takenN, blockedN: slice.blockedN,
      takenWinRate: slice.takenWinRate, takenAvgR: slice.takenAvgR, reasons: slice.recommendation.reasons,
    },
  };
  state.slices[key] = override;
  state.history = [...(state.history ?? []), { at: override.appliedAt, action: 'apply' as const, key }].slice(-50);
  storeOverrides(userId, state);
  await logShadowLessonBlock({
    lane: 'gate_calibration', userId, strategyKey: key, bucket: 'apply',
    n: slice.takenN, winRate: slice.takenWinRate, avgR: slice.takenAvgR,
    reason: `User applied gate calibration for ${symbol} · ${session ?? 'all sessions'}: confidence floor ${override.confidenceFloor ?? 'default'}, sub-1:2 needs ${override.rrHighConfThreshold ?? 'default'}% (was global defaults).`,
  });
  return { ok: true, status: 200, overrides: state.slices };
}

export async function revertGateCalibration(
  userId: number,
  symbol: string,
  session: string | null,
): Promise<{ ok: boolean; status: number; error?: string; overrides?: Record<string, AppliedOverride> }> {
  const key = sliceKey(symbol, session);
  const state = await loadOverrides(userId);
  const existing = state.slices[key];
  if (!existing) return { ok: false, status: 404, error: `No applied override for ${symbol} · ${session ?? 'all sessions'}.` };
  delete state.slices[key];
  state.history = [...(state.history ?? []), { at: new Date().toISOString(), action: 'revert' as const, key }].slice(-50);
  storeOverrides(userId, state);
  await logShadowLessonBlock({
    lane: 'gate_calibration', userId, strategyKey: key, bucket: 'revert',
    n: null, winRate: null, avgR: null,
    reason: `User reverted gate calibration for ${symbol} · ${session ?? 'all sessions'} (floor ${existing.confidenceFloor ?? 'default'}, sub-1:2 ${existing.rrHighConfThreshold ?? 'default'}%) — slice is back on the global defaults.`,
  });
  return { ok: true, status: 200, overrides: state.slices };
}
