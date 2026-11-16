// ── Trail Brain learning layer ─────────────────────────────────────────────
// The slow half of the Trail Brain (trail-brain.ts): every ~30 minutes —
// the trail-guard-learning rhythm (PR #69) — each group's brain-governed
// closes are scored against the group's own record without the brain,
// and the pure adjustment rule (adjustTrailBrainParams) nudges the
// group's parameters inside their hard clamps. The write lands in
// runtime_state; the real-time layer's next consult (≤30 s cache)
// trades on the new parameters. No deploy, no owner tap, no LLM.
//
// EVIDENCE: closes are attributed by the stamps the adapters write when
// the brain's floor binds (trail_brain_version / trail_brain_group on
// the trade rows). "Brain" stats read stamped closes for the group;
// "baseline" stats read the same group's UNSTAMPED closes over the same
// rolling 90 days (for crypto that baseline includes closes governed by
// promoted trail guards — guards win the trade, and their outcomes are
// legitimately part of the record the brain is compared against).
// Give-back saved is reported as baseline give-back − brain give-back
// in the group's own units wherever both sides are measurable.
//
// FAIL-OPEN, everywhere: a stats error means "no adjustment this pass",
// never an engine error and never a parameter change. A group whose
// record keeps hurting at the loosest clamps goes DORMANT (the brain
// stops governing it; the owner can reset it from the panel) — it never
// loosens past the clamps and never touches entries or sizing.
// Kill switch: TRAIL_BRAIN_LEARNING=off stops adjustment only; the
// real-time layer keeps applying the parameters already learned.

import { pool } from '../db';
import { loadRuntimeState } from './runtime-state';
import {
  adjustTrailBrainParams, defaultTrailBrainParams, ensureTrailBrainColumns, getTrailBrainStore,
  logTrailBrainDecision, saveTrailBrainStore, trailBrainOn, trailBrainUnit,
  type TrailBrainEngine, type TrailBrainEvidence, type TrailBrainGroup,
} from './trail-brain';

export function trailBrainLearningOn(): boolean {
  return process.env.TRAIL_BRAIN_LEARNING !== 'off';
}

const WINDOW_DAYS = 90;
const THROTTLE_MS = 30 * 60_000;

const num = (v: any): number | null => (v == null || isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);

interface Perf { trades: number; avgFinal: number | null; avgGiveback: number | null }
const EMPTY: Perf = { trades: 0, avgFinal: null, avgGiveback: null };

const CRYPTO_FINAL_R = `
  CASE WHEN t.stop_loss IS NULL OR t.exit_price IS NULL THEN NULL
       WHEN lower(t.direction) IN ('long','buy') AND t.entry_price > t.stop_loss
         THEN (t.exit_price - t.entry_price) / (t.entry_price - t.stop_loss)
       WHEN lower(t.direction) IN ('short','sell') AND t.stop_loss > t.entry_price
         THEN (t.entry_price - t.exit_price) / (t.stop_loss - t.entry_price)
       ELSE NULL END`;

/** Brain + baseline stats for one group from its engine's close table.
 *  Never rejects: any failure resolves null ("no verdict this pass"). */
export async function trailBrainGroupEvidence(userId: number, g: TrailBrainGroup): Promise<TrailBrainEvidence | null> {
  try {
    let brain: Perf = EMPTY, base: Perf = EMPTY;
    if (g.engine === 'crypto') {
      // Two close tables feed one group: the live engine's trades and
      // the all-strategy shadow lane's (same group key, same R units —
      // the shadow resolver converts through each trade's own stop %).
      // SUM/COUNT pairs so the two sources merge exactly.
      await ensureTrailBrainColumns('cryptocom_engine_trades');
      await ensureTrailBrainColumns('crypto_shadow_trades');
      interface Sums { trades: number; sumFinal: number; nFinal: number; sumGb: number; nGb: number }
      const zero: Sums = { trades: 0, sumFinal: 0, nFinal: 0, sumGb: 0, nGb: 0 };
      const toSums = (r: any): Sums => ({
        trades: Number(r?.trades) || 0, sumFinal: Number(r?.sum_final) || 0, nFinal: Number(r?.n_final) || 0,
        sumGb: Number(r?.sum_gb) || 0, nGb: Number(r?.n_gb) || 0,
      });
      const merge = (a: Sums, b: Sums): Perf => ({
        trades: a.trades + b.trades,
        avgFinal: (a.nFinal + b.nFinal) > 0 ? num((a.sumFinal + b.sumFinal) / (a.nFinal + b.nFinal)) : null,
        avgGiveback: (a.nGb + b.nGb) > 0 ? num((a.sumGb + b.sumGb) / (a.nGb + b.nGb)) : null,
      });
      const liveBrain = await pool.query(
        `SELECT COUNT(*)::int AS trades, SUM(${CRYPTO_FINAL_R}) AS sum_final, COUNT(${CRYPTO_FINAL_R})::int AS n_final,
                SUM(CASE WHEN t.peak_r_multiple > 0 THEN t.peak_r_multiple - ${CRYPTO_FINAL_R} END) AS sum_gb,
                COUNT(CASE WHEN t.peak_r_multiple > 0 THEN 1 END)::int AS n_gb
           FROM cryptocom_engine_trades t
          WHERE t.user_id = $1 AND t.trail_brain_group = $3 AND t.status = 'closed'
            AND t.closed_at >= now() - ($2 || ' days')::interval`,
        [userId, String(WINDOW_DAYS), g.key]).then(r => toSums(r.rows[0]));
      const liveBase = await pool.query(
        `SELECT COUNT(*)::int AS trades, SUM(${CRYPTO_FINAL_R}) AS sum_final, COUNT(${CRYPTO_FINAL_R})::int AS n_final,
                SUM(CASE WHEN t.peak_r_multiple > 0 THEN t.peak_r_multiple - ${CRYPTO_FINAL_R} END) AS sum_gb,
                COUNT(CASE WHEN t.peak_r_multiple > 0 THEN 1 END)::int AS n_gb
           FROM cryptocom_engine_trades t
          WHERE t.user_id = $1 AND t.strategy = $3 AND t.symbol = $4 AND t.trail_brain_version IS NULL AND t.status = 'closed'
            AND t.closed_at >= now() - ($2 || ' days')::interval`,
        [userId, String(WINDOW_DAYS), g.strategy, g.condition]).then(r => toSums(r.rows[0]));
      const shadowBrain = await pool.query(
        `SELECT COUNT(*)::int AS trades, SUM(r_multiple) AS sum_final, COUNT(r_multiple)::int AS n_final,
                SUM(CASE WHEN peak_gain_pct IS NOT NULL AND sl_pct > 0 THEN peak_gain_pct / sl_pct - r_multiple END) AS sum_gb,
                COUNT(CASE WHEN peak_gain_pct IS NOT NULL AND sl_pct > 0 AND r_multiple IS NOT NULL THEN 1 END)::int AS n_gb
           FROM crypto_shadow_trades
          WHERE user_id = $1 AND trail_brain_group = $3 AND status = 'closed'
            AND closed_at >= now() - ($2 || ' days')::interval`,
        [userId, String(WINDOW_DAYS), g.key]).then(r => toSums(r.rows[0]));
      const shadowBase = await pool.query(
        `SELECT COUNT(*)::int AS trades, SUM(r_multiple) AS sum_final, COUNT(r_multiple)::int AS n_final,
                SUM(CASE WHEN peak_gain_pct IS NOT NULL AND sl_pct > 0 THEN peak_gain_pct / sl_pct - r_multiple END) AS sum_gb,
                COUNT(CASE WHEN peak_gain_pct IS NOT NULL AND sl_pct > 0 AND r_multiple IS NOT NULL THEN 1 END)::int AS n_gb
           FROM crypto_shadow_trades
          WHERE user_id = $1 AND strategy = $3 AND symbol = $4 AND trail_brain_version IS NULL AND status = 'closed'
            AND closed_at >= now() - ($2 || ' days')::interval`,
        [userId, String(WINDOW_DAYS), g.strategy, g.condition]).then(r => toSums(r.rows[0]));
      void zero;
      brain = merge(liveBrain, shadowBrain);
      base = merge(liveBase, shadowBase);
    } else if (g.engine === 'fx') {
      await ensureTrailBrainColumns('fx_brain_outcomes');
      const peakR = `CASE WHEN entry_price IS NULL OR stop_loss IS NULL OR mfe_price IS NULL OR ABS(entry_price - stop_loss) <= 0 THEN NULL
                           ELSE mfe_price / ABS(entry_price - stop_loss) END`;
      const q = async (where: string, params: any[]): Promise<Perf> => {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS trades, AVG(realised_rr) AS avg_final,
                  AVG(CASE WHEN ${peakR} > 0 THEN ${peakR} - realised_rr END) AS avg_giveback
             FROM fx_brain_outcomes WHERE ${where}`, params);
        const r = rows[0] ?? {};
        return { trades: Number(r.trades) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
      };
      brain = await q(`user_id = $1 AND trail_brain_group = $2 AND closed_at >= now() - ($3 || ' days')::interval`,
        [userId, g.key, String(WINDOW_DAYS)]);
      base = await q(`user_id = $1 AND strategy_mode = $2 AND symbol = $3 AND trail_brain_version IS NULL AND closed_at >= now() - ($4 || ' days')::interval`,
        [userId, g.strategy, g.condition, String(WINDOW_DAYS)]);
    } else if (g.engine === 'sol' && g.strategy === 'sol_follower') {
      // The follower lane's closes live in their own table; peak gain is
      // derived from the persisted peak price. One group for the whole
      // lane — never per token, never per wallet.
      await ensureTrailBrainColumns('sol_follower_positions');
      const q = async (where: string, params: any[]): Promise<Perf> => {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS trades, AVG(net_pct) AS avg_final,
                  AVG(CASE WHEN peak_price IS NOT NULL AND entry_price > 0 AND gross_pct IS NOT NULL
                           THEN ((peak_price - entry_price) / entry_price) * 100 - gross_pct END) AS avg_giveback
             FROM sol_follower_positions WHERE ${where}`, params);
        const r = rows[0] ?? {};
        return { trades: Number(r.trades) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
      };
      brain = await q(`user_id = $1 AND trail_brain_group = $2 AND status = 'closed' AND closed_at >= now() - ($3 || ' days')::interval`,
        [userId, g.key, String(WINDOW_DAYS)]);
      base = await q(`user_id = $1 AND trail_brain_version IS NULL AND status = 'closed' AND closed_at >= now() - ($2 || ' days')::interval`,
        [userId, String(WINDOW_DAYS)]);
    } else if (g.engine === 'sol') {
      await ensureTrailBrainColumns('sol_shadow_context');
      const q = async (where: string, params: any[]): Promise<Perf> => {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS trades, AVG(net_pct) AS avg_final,
                  AVG(CASE WHEN peak_gain_pct IS NOT NULL AND gross_pct IS NOT NULL THEN peak_gain_pct - gross_pct END) AS avg_giveback
             FROM sol_shadow_context WHERE ${where}`, params);
        const r = rows[0] ?? {};
        return { trades: Number(r.trades) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
      };
      // Strategy-keyed ONLY — the baseline is the strategy's pooled
      // record across every token, never a per-token slice.
      brain = await q(`user_id = $1 AND trail_brain_group = $2 AND closed_at IS NOT NULL AND closed_at >= now() - ($3 || ' days')::interval`,
        [userId, g.key, String(WINDOW_DAYS)]);
      base = await q(`user_id = $1 AND strategy_id = $2 AND trail_brain_version IS NULL AND closed_at IS NOT NULL AND closed_at >= now() - ($3 || ' days')::interval`,
        [userId, g.strategy, String(WINDOW_DAYS)]);
    } else {
      // kalshi — the perp SHADOW lane's closes are the proof record; the
      // live lane's governed closes carry the same stamps and are
      // counted by the panel, but parameter learning runs on shadow
      // evidence (the lane the promotion bar reads).
      await ensureTrailBrainColumns('kalshi_perp_shadow_trades');
      const q = async (where: string, params: any[]): Promise<Perf> => {
        const { rows } = await pool.query(
          `SELECT COUNT(*)::int AS trades, AVG(return_pct) AS avg_final,
                  AVG(CASE WHEN peak_gain_pct IS NOT NULL AND gross_return_pct IS NOT NULL THEN peak_gain_pct - gross_return_pct END) AS avg_giveback
             FROM kalshi_perp_shadow_trades WHERE ${where}
               AND exclude_from_stats IS NOT TRUE AND (return_pct IS NULL OR abs(return_pct) <= 100)`, params);
        const r = rows[0] ?? {};
        return { trades: Number(r.trades) || 0, avgFinal: num(r.avg_final), avgGiveback: num(r.avg_giveback) };
      };
      brain = await q(`user_id = $1 AND trail_brain_group = $2 AND status = 'closed' AND closed_at >= now() - ($3 || ' days')::interval`,
        [userId, g.key, String(WINDOW_DAYS)]);
      base = await q(`user_id = $1 AND strategy = $2 AND underlying = $3 AND trail_brain_version IS NULL AND status = 'closed' AND closed_at >= now() - ($4 || ' days')::interval`,
        [userId, g.strategy, g.condition, String(WINDOW_DAYS)]);
    }
    return {
      brainTrades: brain.trades, brainAvgFinal: brain.avgFinal, brainAvgGiveback: brain.avgGiveback,
      baseTrades: base.trades, baseAvgFinal: base.avgFinal, baseAvgGiveback: base.avgGiveback,
    };
  } catch (e: any) {
    console.error(`[trail-brain] evidence read failed for group ${g.key} (non-fatal):`, e?.message || e);
    return null;
  }
}

/** Group keys with stamped closes that have no store record (e.g. the
 *  store row was reset while trades were open) — re-registered at
 *  defaults so their evidence keeps accumulating. */
async function stampedGroupKeys(userId: number): Promise<string[]> {
  const tables: Array<[string, string]> = [
    ['cryptocom_engine_trades', `status = 'closed'`],
    ['crypto_shadow_trades', `status = 'closed'`],
    ['fx_brain_outcomes', `1 = 1`],
    ['sol_shadow_context', `closed_at IS NOT NULL`],
    ['sol_follower_positions', `status = 'closed'`],
    ['kalshi_perp_shadow_trades', `status = 'closed'`],
  ];
  const keys = new Set<string>();
  for (const [table, extra] of tables) {
    try {
      await ensureTrailBrainColumns(table);
      const { rows } = await pool.query(
        `SELECT DISTINCT trail_brain_group AS k FROM ${table} WHERE user_id = $1 AND trail_brain_group IS NOT NULL AND ${extra}`, [userId]);
      for (const r of rows) if (r.k) keys.add(String(r.k));
    } catch { /* fail open per table */ }
  }
  return Array.from(keys);
}

function groupFromKey(key: string): TrailBrainGroup | null {
  const [engine, strategy, condition] = key.split('|');
  if (!engine || !['crypto', 'fx', 'sol', 'kalshi'].includes(engine)) return null;
  const e = engine as TrailBrainEngine;
  const now = new Date().toISOString();
  return {
    key, engine: e, strategy: strategy || 'all', condition: condition || 'all',
    unit: trailBrainUnit(e),
    params: defaultTrailBrainParams(e),
    version: 1, status: 'active', evidence: null, lastAdjustment: null,
    createdAt: now, updatedAt: now,
  };
}

// ── The loop ───────────────────────────────────────────────────────────────
const _lastRun = new Map<number, number>();

export async function runTrailBrainLearningForUser(userId: number, force = false): Promise<void> {
  if (!trailBrainLearningOn() || !trailBrainOn()) return;
  const last = _lastRun.get(userId) ?? 0;
  if (!force && Date.now() - last < THROTTLE_MS) return;
  _lastRun.set(userId, Date.now());
  try {
    const store = await getTrailBrainStore(userId);
    for (const key of await stampedGroupKeys(userId)) {
      if (!store.groups[key]) {
        const g = groupFromKey(key);
        if (g) store.groups[key] = g;
      }
    }
    let changed = false;
    for (const g of Object.values(store.groups)) {
      try {
        const ev = await trailBrainGroupEvidence(userId, g);
        if (!ev) continue; // unreadable stats = no verdict, no change
        g.evidence = { ...ev, updatedAt: new Date().toISOString() };
        changed = true;
        if (g.status === 'dormant') continue;
        const adj = adjustTrailBrainParams(g.engine, g.params, ev);
        if (adj.action === 'tighten' || adj.action === 'loosen') {
          g.params = adj.params;
          g.version += 1;
          g.lastAdjustment = { at: new Date().toISOString(), action: adj.action, reason: adj.reason };
          g.updatedAt = new Date().toISOString();
          logTrailBrainDecision(userId, { engine: g.engine, groupKey: g.key, version: g.version, text: `Learned: ${adj.reason}` });
          console.log(`[trail-brain] user ${userId} group ${g.key}: ${adj.action} → v${g.version} — ${adj.reason}`);
        } else if (adj.action === 'dormant') {
          g.status = 'dormant';
          g.lastAdjustment = { at: new Date().toISOString(), action: 'dormant', reason: adj.reason };
          g.updatedAt = new Date().toISOString();
          logTrailBrainDecision(userId, { engine: g.engine, groupKey: g.key, version: g.version, text: `Stood down: ${adj.reason}` });
          console.log(`[trail-brain] user ${userId} group ${g.key}: DORMANT — ${adj.reason}`);
        }
      } catch (e: any) {
        console.error(`[trail-brain] learning failed for group ${g.key} (non-fatal):`, e?.message || e);
      }
    }
    if (changed) await saveTrailBrainStore(userId, store);
  } catch (e: any) {
    console.error('[trail-brain] user learning failed (non-fatal):', e?.message || e);
  }
}

/** Periodic sweep over every user with a Trail Brain store (watchdog
 *  idiom: delayed start, 30-min interval, unref'd, never throws). */
let _started = false;
export function startTrailBrainLearning(): void {
  if (_started) return;
  _started = true;
  // Boot warm-up: create the stamp columns NOW so their existence never
  // depends on a brain-gated path running first (the 2026-11-13 lesson).
  for (const t of ['cryptocom_engine_trades', 'fx_brain_outcomes', 'sol_shadow_context', 'kalshi_perp_shadow_trades', 'kalshi_perp_live_trades', 'crypto_shadow_trades', 'sol_follower_positions']) {
    void ensureTrailBrainColumns(t);
  }
  const sweep = async () => {
    if (!trailBrainLearningOn()) return;
    try {
      const rows = await loadRuntimeState('trail_brain');
      for (const row of rows) {
        const userId = Number(row.key);
        if (!Number.isFinite(userId)) continue;
        await runTrailBrainLearningForUser(userId);
      }
    } catch (e: any) {
      console.error('[trail-brain] sweep failed (non-fatal):', e?.message || e);
    }
  };
  setTimeout(() => { void sweep(); }, 7 * 60_000).unref?.();
  setInterval(() => { void sweep(); }, THROTTLE_MS).unref?.();
  console.log('[trail-brain] learning started — trail parameters re-scored every 30 min.');
}
