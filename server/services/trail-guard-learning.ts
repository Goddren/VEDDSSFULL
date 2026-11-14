// ── Trail guards learn their own lessons (2026-11-13) ──────────────────────
// Follow-up to trail guards (PR #31) and the shadow-lesson gates (PR #68):
// a promoted trail guard is itself a hypothesis — "this tighter / frozen
// trail profile is better for this group" — and until now nothing ever
// checked whether the hypothesis held. This module closes that loop.
//
// ATTRIBUTION (written by the consult sites, read here): when a guard's
// profile governs a position's exit evaluation, the close record is
// stamped with the guard's id — cryptocom_engine_trades.trail_guard_id
// for crypto, sol_shadow_context.trail_guard_id for Sol (shadow closes;
// Sol paper closes are not written to sol_shadow_context today, a
// pre-existing gap in the study's Sol arm). Unguarded trades stay
// unstamped, so closes under a guard are exactly countable.
//
// EVALUATION: per ACTIVE guard, trades closed UNDER the guard over a
// rolling 90 days are compared with the group's own PRE-GUARD baseline —
// the trail-study snapshot stored on the guard at promotion time
// (avgFinal / avgGiveback over the 90 days before promotion), or, when
// that snapshot is incomplete, the same metrics recomputed from closes
// before the promotion timestamp. One precise verdict rule:
//
//   UNPROVEN — fewer than MIN_GUARDED closes under the guard, no usable
//              baseline, or mixed evidence. No action, ever.
//   HELPING  — avg giveback under the guard is LOWER than baseline AND
//              avg close is NOT worse than baseline. Guard stays.
//   HURTING  — avg close under the guard is worse than baseline by at
//              least HARM_DELTA (crypto 0.15R · Sol 1.5 percentage
//              points), OR giveback did not improve at all while closes
//              under the guard average negative. The guard RETIRES
//              ITSELF through the same retire path the UI uses, marked
//              retiredBy='lessons', with an audit row in the shared
//              shadow_lesson_blocks table (lane='trail_guard').
//
// Auto-retire is the ONLY automatic action. Nothing here promotes,
// re-promotes, tightens or loosens a guard — promotion stays 100% the
// user's in-app tap, and a retired guard never comes back on its own.
// Kill switch: TRAIL_GUARD_LEARNING=off stops evaluation and retirement
// (the guards themselves, and the attribution stamps, are unaffected).
// Everything fails open: a stats error means "no verdict", never an
// engine error and never a retirement.

import { pool } from '../db';
import { getRuntimeStateStrict, saveRuntimeState, loadRuntimeState } from './runtime-state';
import { getTrailGuards, retireTrailGuard, ensureTrailGuardStampColumns, type TrailGuard } from './trail-guards';
import { ensureSolTrailGuardColumns } from './sol-shadow-stats';
import { logShadowLessonBlock } from './shadow-lesson-gate';

export function trailGuardLearningOn(): boolean {
  return process.env.TRAIL_GUARD_LEARNING !== 'off';
}

const MIN_GUARDED = () => Math.max(1, Math.floor(Number(process.env.TRAIL_GUARD_LEARN_MIN_TRADES ?? 10) || 10));
const WINDOW_DAYS = 90;
const EVAL_SCOPE = 'trail_guard_evals';
const THROTTLE_MS = 30 * 60_000;

/** Harm delta in the group's native units: R for crypto, percentage
 *  points for Sol (whose study metrics are net %). */
export function harmDelta(engine: 'crypto' | 'sol'): number {
  return engine === 'crypto' ? 0.15 : 1.5;
}

export interface GuardPerf {
  trades: number;
  wins: number;
  avgFinal: number | null;    // crypto: final R · sol: avg net %
  avgGiveback: number | null; // peak − final, same units
}

export type GuardVerdict = 'helping' | 'hurting' | 'unproven';

export interface GuardVerdictResult {
  verdict: GuardVerdict;
  reason: string;
}

/**
 * The verdict rule — pure, and the ONLY place it lives. Units are the
 * group's own (R for crypto, % for Sol); `delta` is harmDelta(engine).
 */
export function evaluateGuardPerformance(
  guarded: GuardPerf,
  baseline: GuardPerf | null,
  opts: { minTrades: number; delta: number; unit: string },
): GuardVerdictResult {
  const { minTrades, delta, unit } = opts;
  if (guarded.trades < minTrades) {
    return { verdict: 'unproven', reason: `watching — ${guarded.trades}/${minTrades} trades closed under this guard so far` };
  }
  if (!baseline || baseline.avgFinal == null) {
    return { verdict: 'unproven', reason: 'no usable pre-guard baseline to judge against yet' };
  }
  if (guarded.avgFinal == null) {
    return { verdict: 'unproven', reason: 'guarded closes carry no measurable result yet' };
  }
  const fmt = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}${unit}`;
  // HURTING, rule 1: closes under the guard are materially worse.
  if (guarded.avgFinal <= baseline.avgFinal - delta) {
    return {
      verdict: 'hurting',
      reason: `closes under this guard average ${fmt(guarded.avgFinal)} vs ${fmt(baseline.avgFinal)} before it — worse by ${Math.abs(guarded.avgFinal - baseline.avgFinal).toFixed(2)}${unit} over ${guarded.trades} trades`,
    };
  }
  // HURTING, rule 2: the guard's whole point (less giveback) did not
  // materialise, and the closes it governed lost money on average.
  if (baseline.avgGiveback != null && guarded.avgGiveback != null
      && guarded.avgGiveback >= baseline.avgGiveback && guarded.avgFinal < 0) {
    return {
      verdict: 'hurting',
      reason: `giveback did not improve (${guarded.avgGiveback.toFixed(2)}${unit} under the guard vs ${baseline.avgGiveback.toFixed(2)}${unit} before) and closes average ${fmt(guarded.avgFinal)} over ${guarded.trades} trades`,
    };
  }
  // HELPING: less giveback AND closes not worse than before.
  if (baseline.avgGiveback != null && guarded.avgGiveback != null
      && guarded.avgGiveback < baseline.avgGiveback && guarded.avgFinal >= baseline.avgFinal) {
    return {
      verdict: 'helping',
      reason: `giveback ${guarded.avgGiveback.toFixed(2)}${unit} vs ${baseline.avgGiveback.toFixed(2)}${unit} before, closes ${fmt(guarded.avgFinal)} vs ${fmt(baseline.avgFinal)} — the guard is earning its keep`,
    };
  }
  return { verdict: 'unproven', reason: 'mixed evidence so far — no clear verdict yet' };
}

// ── Stats (same formulas as trail-study.ts, scoped to one guard) ──────────
const FINAL_R = `
  CASE WHEN t.stop_loss IS NULL OR t.exit_price IS NULL THEN NULL
       WHEN lower(t.direction) IN ('long','buy') AND t.entry_price > t.stop_loss
         THEN (t.exit_price - t.entry_price) / (t.entry_price - t.stop_loss)
       WHEN lower(t.direction) IN ('short','sell') AND t.stop_loss > t.entry_price
         THEN (t.entry_price - t.exit_price) / (t.stop_loss - t.entry_price)
       ELSE NULL END`;

const num = (v: any): number | null => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

/**
 * Closes under the guard. Awaits the per-table stamp-column ensure
 * before naming trail_guard_id, and NEVER rejects: any failure (ensure
 * or query — e.g. the columns genuinely cannot be created) resolves
 * null, which the evaluation loop reads as "no verdict this pass"
 * rather than a fabricated 0-trade record. Exported for the check
 * script's fail-open pin.
 */
export async function guardedStats(userId: number, guard: TrailGuard): Promise<GuardPerf | null> {
  try {
    if (guard.engine === 'crypto') {
      await ensureTrailGuardStampColumns();
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS trades,
                COUNT(*) FILTER (WHERE realized_pnl > 0)::int AS wins,
                AVG(${FINAL_R}) AS avg_final,
                AVG(CASE WHEN peak_r_multiple > 0 THEN peak_r_multiple - ${FINAL_R} END) AS avg_giveback
           FROM cryptocom_engine_trades t
          WHERE user_id = $1 AND trail_guard_id = $2 AND status = 'closed'
            AND closed_at >= now() - ($3 || ' days')::interval AND closed_at >= $4`,
        [userId, guard.id, String(WINDOW_DAYS), guard.promotedAt]);
      const r = rows[0] ?? {};
      return { trades: Number(r.trades) || 0, wins: Number(r.wins) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
    }
    await ensureSolTrailGuardColumns();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS trades,
              COUNT(*) FILTER (WHERE net_pct > 0)::int AS wins,
              AVG(net_pct) AS avg_final,
              AVG(CASE WHEN peak_gain_pct IS NOT NULL AND gross_pct IS NOT NULL THEN peak_gain_pct - gross_pct END) AS avg_giveback
         FROM sol_shadow_context
        WHERE user_id = $1 AND trail_guard_id = $2 AND closed_at IS NOT NULL
          AND closed_at >= now() - ($3 || ' days')::interval AND closed_at >= $4`,
      [userId, guard.id, String(WINDOW_DAYS), guard.promotedAt]);
    const r = rows[0] ?? {};
    return { trades: Number(r.trades) || 0, wins: Number(r.wins) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
  } catch (e: any) {
    console.error(`[trail-guard-learning] guarded stats failed for guard ${guard.id} (non-fatal):`, e?.message || e);
    return null;
  }
}

/** Pre-guard baseline recomputed from closes before promotion — only used
 *  when the promotion-time snapshot stored on the guard is incomplete.
 *  Never rejects (same fail-open contract as guardedStats). The crypto
 *  query runs on cryptocom_engine_trades, so it awaits the stamp-column
 *  ensure first even though it never names the columns itself. */
export async function computedBaseline(userId: number, guard: TrailGuard): Promise<GuardPerf | null> {
  const groupCol = guard.dimension === 'strategy'
    ? (guard.engine === 'crypto' ? 'strategy' : 'strategy_id')
    : 'symbol';
  try {
    if (guard.engine === 'crypto') {
      await ensureTrailGuardStampColumns();
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS trades,
                COUNT(*) FILTER (WHERE realized_pnl > 0)::int AS wins,
                AVG(${FINAL_R}) AS avg_final,
                AVG(CASE WHEN peak_r_multiple > 0 THEN peak_r_multiple - ${FINAL_R} END) AS avg_giveback
           FROM cryptocom_engine_trades t
          WHERE user_id = $1 AND ${groupCol} = $2 AND status = 'closed'
            AND closed_at < $3 AND closed_at >= $3::timestamptz - ($4 || ' days')::interval`,
        [userId, guard.key, guard.promotedAt, String(WINDOW_DAYS)]);
      const r = rows[0] ?? {};
      if ((Number(r.trades) || 0) < 5) return null;
      return { trades: Number(r.trades) || 0, wins: Number(r.wins) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
    }
    await ensureSolTrailGuardColumns();
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS trades,
              COUNT(*) FILTER (WHERE net_pct > 0)::int AS wins,
              AVG(net_pct) AS avg_final,
              AVG(CASE WHEN peak_gain_pct IS NOT NULL AND gross_pct IS NOT NULL THEN peak_gain_pct - gross_pct END) AS avg_giveback
         FROM sol_shadow_context
        WHERE user_id = $1 AND ${groupCol} = $2 AND closed_at IS NOT NULL
          AND closed_at < $3 AND closed_at >= $3::timestamptz - ($4 || ' days')::interval`,
      [userId, guard.key, guard.promotedAt, String(WINDOW_DAYS)]);
    const r = rows[0] ?? {};
    if ((Number(r.trades) || 0) < 5) return null;
    return { trades: Number(r.trades) || 0, wins: Number(r.wins) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
  } catch (e: any) {
    console.error(`[trail-guard-learning] baseline stats failed for guard ${guard.id} (non-fatal):`, e?.message || e);
    return null;
  }
}

async function baselineFor(userId: number, guard: TrailGuard): Promise<GuardPerf | null> {
  // Primary: the trail-study snapshot stored on the guard at promotion —
  // by construction the group's own pre-guard record.
  if (guard.avgFinal != null) {
    return { trades: guard.trades, wins: 0, avgFinal: guard.avgFinal, avgGiveback: guard.avgGiveback };
  }
  return computedBaseline(userId, guard);
}

// ── Evaluation records (persisted for the panel) ───────────────────────────
export interface TrailGuardEvaluation {
  guardId: string;
  verdict: GuardVerdict;
  reason: string;
  guardedTrades: number;
  minTrades: number;
  guardedAvgFinal: number | null;
  guardedAvgGiveback: number | null;
  baselineAvgFinal: number | null;
  baselineAvgGiveback: number | null;
  evaluatedAt: string;
}

export async function getTrailGuardEvaluations(userId: number): Promise<Record<string, TrailGuardEvaluation>> {
  try {
    const v = await getRuntimeStateStrict(EVAL_SCOPE, String(userId));
    return (v && typeof v === 'object') ? v as Record<string, TrailGuardEvaluation> : {};
  } catch { return {}; }
}

// ── The loop ───────────────────────────────────────────────────────────────
const _lastEval = new Map<number, number>();

/**
 * Evaluate every active guard for one user; auto-retire the proven-harmful
 * ones through the real retire path. Throttled to once per
 * THROTTLE_MS per user unless forced. Never throws.
 */
export async function evaluateTrailGuardsForUser(userId: number, force = false): Promise<void> {
  if (!trailGuardLearningOn()) return;
  const last = _lastEval.get(userId) ?? 0;
  if (!force && Date.now() - last < THROTTLE_MS) return;
  _lastEval.set(userId, Date.now());
  try {
    const guards = (await getTrailGuards(userId)).filter(g => g.active);
    if (!guards.length) return;
    const evals = await getTrailGuardEvaluations(userId);
    let changed = false;
    for (const guard of guards) {
      try {
        const [guarded, baseline] = await Promise.all([
          guardedStats(userId, guard),
          baselineFor(userId, guard),
        ]);
        // Stats unreadable this pass (DB hiccup, columns unfixable):
        // no verdict and NO eval record — never overwrite a real
        // verdict with a fabricated "watching 0/N" line.
        if (!guarded) continue;
        const unit = guard.engine === 'crypto' ? 'R' : '%';
        const { verdict, reason } = evaluateGuardPerformance(guarded, baseline, {
          minTrades: MIN_GUARDED(), delta: harmDelta(guard.engine), unit,
        });
        evals[guard.id] = {
          guardId: guard.id, verdict, reason,
          guardedTrades: guarded.trades, minTrades: MIN_GUARDED(),
          guardedAvgFinal: guarded.avgFinal, guardedAvgGiveback: guarded.avgGiveback,
          baselineAvgFinal: baseline?.avgFinal ?? null, baselineAvgGiveback: baseline?.avgGiveback ?? null,
          evaluatedAt: new Date().toISOString(),
        };
        changed = true;
        if (verdict === 'hurting') {
          const out = await retireTrailGuard(userId, guard.id, 'lessons', reason);
          if (out.ok) {
            await logShadowLessonBlock({
              lane: 'trail_guard', userId,
              strategyKey: guard.id,
              bucket: `${guard.engine} · ${guard.dimension} · ${guard.key} · ${guard.action}`,
              n: guarded.trades,
              winRate: guarded.trades ? guarded.wins / guarded.trades : null,
              avgR: guard.engine === 'crypto' ? guarded.avgFinal : null,
              medianPct: guard.engine === 'sol' ? guarded.avgFinal : null,
              reason: `Trail guard auto-retired by its own record: ${reason}`,
            });
            console.log(`[trail-guard-learning] user ${userId}: guard ${guard.id} (${guard.engine} ${guard.dimension} ${guard.key}) auto-retired — ${reason}`);
          }
        }
      } catch (e: any) {
        // Fail open: a stats error is "no verdict", never a retirement.
        console.error(`[trail-guard-learning] eval failed for guard ${guard.id} (non-fatal):`, e?.message || e);
      }
    }
    if (changed) saveRuntimeState(EVAL_SCOPE, String(userId), evals);
  } catch (e: any) {
    console.error('[trail-guard-learning] user eval failed (non-fatal):', e?.message || e);
  }
}

/** Periodic sweep over every user holding guards (watchdog idiom:
 *  delayed start, 30-min interval, unref'd, never throws). Idempotent. */
let _started = false;
export function startTrailGuardLearning(): void {
  if (_started) return;
  _started = true;
  // Boot warm-up: create the trail-guard stamp columns NOW, in this
  // process, instead of waiting for a guard-gated path that may never
  // run. The crypto columns are named by every Drizzle query on
  // cryptocom_engine_trades (PR #69 put them in the schema), so their
  // existence must not depend on a guard ever being promoted — that
  // coupling is what produced the 2026-11-13 "column trail_guard_id
  // does not exist" cluster. Both ensures are idempotent, memoized and
  // non-rejecting, so this fire-and-forget is safe.
  void ensureTrailGuardStampColumns();
  void ensureSolTrailGuardColumns();
  const sweep = async () => {
    if (!trailGuardLearningOn()) return;
    try {
      const rows = await loadRuntimeState('trail_guards');
      for (const row of rows) {
        const userId = Number(row.key);
        if (!Number.isFinite(userId)) continue;
        if (Array.isArray(row.value) && row.value.some((g: any) => g && g.active)) {
          await evaluateTrailGuardsForUser(userId);
        }
      }
    } catch (e: any) {
      console.error('[trail-guard-learning] sweep failed (non-fatal):', e?.message || e);
    }
  };
  setTimeout(() => { void sweep(); }, 6 * 60_000).unref?.();
  setInterval(() => { void sweep(); }, THROTTLE_MS).unref?.();
  console.log('[trail-guard-learning] started — trail guards judged against their own record every 30 min.');
}
