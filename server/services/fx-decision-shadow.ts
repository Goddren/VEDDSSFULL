// ── FX decision shadow: AI lane vs rules lane ───────────────────────────────
// Logs both lanes' picks on every scan, resolves each pick against real M15
// bars (first touch of SL/TP, 24h timeout, spread cost subtracted in R) and
// serves the comparison report. Never trades; every write is fire-and-forget
// and swallows errors so it cannot change the engine's behaviour.
import { pool } from '../db';
import { barsFor } from './fx-models';

const DDL = `
CREATE TABLE IF NOT EXISTS fx_decision_shadow (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  scan_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  symbol text,
  session text,
  hour_utc smallint,
  lane text NOT NULL,
  mode text NOT NULL,
  acted boolean NOT NULL DEFAULT false,
  picked boolean NOT NULL DEFAULT false,
  ai_status text,
  direction text,
  score real,
  terms jsonb,
  entry real, sl real, tp real,
  gate_result text,
  resolved_at timestamptz,
  outcome text,
  r_multiple real,
  mfe_r real,
  mae_r real
);
CREATE INDEX IF NOT EXISTS fx_decision_shadow_user_idx ON fx_decision_shadow (user_id, created_at);
CREATE INDEX IF NOT EXISTS fx_decision_shadow_open_idx ON fx_decision_shadow (created_at) WHERE resolved_at IS NULL AND picked;
`;

let ensured: Promise<void> | null = null;
export function ensureDecisionShadowTable(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(DDL).then(() => undefined).catch((e: any) => {
      console.error('[fx-decision-shadow] ensure table failed (non-fatal):', e?.message || e);
      ensured = null;
    });
  }
  return ensured;
}

export interface ShadowRow {
  userId: number; scanId: string; lane: 'ai' | 'rules'; mode: string;
  symbol?: string | null; session?: string | null; hourUtc?: number;
  acted?: boolean; picked?: boolean; aiStatus?: string | null;
  direction?: string | null; score?: number | null; terms?: any;
  entry?: number | null; sl?: number | null; tp?: number | null; gateResult?: string | null;
}

// Non-picks are only kept for calibration: one per user+symbol+direction per 15 min.
const _seen = new Map<string, number>();
const NONPICK_DEDUPE_MS = 15 * 60_000;

export function logDecisionShadow(r: ShadowRow): void {
  if (!r.picked && r.symbol) {
    const k = `${r.userId}|${r.lane}|${r.symbol}|${r.direction}`;
    const last = _seen.get(k) || 0;
    if (Date.now() - last < NONPICK_DEDUPE_MS) return;
    _seen.set(k, Date.now());
    if (_seen.size > 5000) _seen.clear();
  }
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  void ensureDecisionShadowTable().then(() => pool.query(
    `INSERT INTO fx_decision_shadow (user_id, scan_id, symbol, session, hour_utc, lane, mode, acted, picked, ai_status,
       direction, score, terms, entry, sl, tp, gate_result)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
    [r.userId, r.scanId, r.symbol ?? null, r.session ?? null, r.hourUtc ?? new Date().getUTCHours(), r.lane, r.mode,
     !!r.acted, !!r.picked, r.aiStatus ?? null, r.direction ?? null, num(r.score),
     r.terms == null ? null : JSON.stringify(r.terms), num(r.entry), num(r.sl), num(r.tp), r.gateResult ?? null],
  )).catch(() => {});
}

// ── Resolver ─────────────────────────────────────────────────────────────────
const costPrice = (sym: string) => {
  const s = sym.toUpperCase();
  const env = Number(process.env.FX_SHADOW_COST_PIPS);
  const pips = Number.isFinite(env) && process.env.FX_SHADOW_COST_PIPS ? env : /^XAU/.test(s) ? 3.5 : 1.5;
  const pip = /JPY/.test(s) ? 0.01 : /^XAU/.test(s) ? 0.1 : 0.0001;
  return pips * pip;
};

let lastResolveAt = 0;
let lastPruneAt = 0;
let resolving = false;

/** Throttled (every 15 min); call once per scan. Never throws. */
export async function resolveDecisionShadow(): Promise<void> {
  if (resolving || Date.now() - lastResolveAt < 15 * 60_000) return;
  resolving = true; lastResolveAt = Date.now();
  try {
    await ensureDecisionShadowTable();
    if (Date.now() - lastPruneAt > 24 * 3_600_000) {
      lastPruneAt = Date.now();
      await pool.query(`DELETE FROM fx_decision_shadow WHERE created_at < now() - interval '60 days'`).catch(() => {});
    }
    // Nothing to price: no levels. Close them out so they leave the queue.
    await pool.query(
      `UPDATE fx_decision_shadow SET resolved_at = now(), outcome = 'unpriced'
        WHERE resolved_at IS NULL AND picked AND (entry IS NULL OR sl IS NULL OR tp IS NULL OR entry = sl)`,
    ).catch(() => {});
    const { rows } = await pool.query(
      `SELECT id, symbol, direction, entry, sl, tp, created_at FROM fx_decision_shadow
        WHERE resolved_at IS NULL AND picked AND created_at < now() - interval '15 minutes'
        ORDER BY created_at LIMIT 120`,
    );
    const bySym = new Map<string, any[]>();
    for (const r of rows) { const a = bySym.get(r.symbol) || []; a.push(r); bySym.set(r.symbol, a); }
    for (const [symbol, list] of Array.from(bySym.entries()).slice(0, 6)) { // cap data-API calls per run
      let bars: any[] = [];
      try { bars = await barsFor('fx')(symbol, '15m', 200); } catch { continue; }
      if (!bars.length) continue;
      const cost = costPrice(symbol);
      for (const r of list) {
        const t0 = new Date(r.created_at).getTime();
        const entry = Number(r.entry), sl = Number(r.sl), tp = Number(r.tp);
        const risk = Math.abs(entry - sl);
        if (!(risk > 0)) continue;
        const buy = String(r.direction).toUpperCase() === 'BUY';
        let outcome: string | null = null, exit = 0, mfe = 0, mae = 0, lastClose = entry;
        const horizon = t0 + 24 * 3_600_000;
        for (const b of bars) {
          const ts = Number(b.timestamp) < 1e12 ? Number(b.timestamp) * 1000 : Number(b.timestamp);
          if (ts < t0) continue;
          if (ts > horizon) break;
          lastClose = Number(b.close) || lastClose;
          const fav = buy ? b.high - entry : entry - b.low;
          const adv = buy ? entry - b.low : b.high - entry;
          mfe = Math.max(mfe, fav / risk); mae = Math.max(mae, adv / risk);
          const hitSl = buy ? b.low <= sl : b.high >= sl;
          const hitTp = buy ? b.high >= tp : b.low <= tp;
          if (hitSl) { outcome = 'sl'; exit = sl; break; }      // same-bar ambiguity → stop (conservative)
          if (hitTp) { outcome = 'tp'; exit = tp; break; }
        }
        if (!outcome && Date.now() > horizon) { outcome = 'timeout'; exit = lastClose; }
        if (!outcome) continue;
        const move = (buy ? exit - entry : entry - exit) - cost;
        await pool.query(
          `UPDATE fx_decision_shadow SET resolved_at = now(), outcome = $2, r_multiple = $3, mfe_r = $4, mae_r = $5
            WHERE id = $1 AND resolved_at IS NULL`,
          [r.id, outcome, move / risk, mfe, mae],
        ).catch(() => {});
      }
    }
  } catch (e: any) {
    console.error('[fx-decision-shadow] resolve failed (non-fatal):', e?.message || e);
  } finally {
    resolving = false;
  }
}

// ── Report ───────────────────────────────────────────────────────────────────
export async function decisionShadowReport(userId: number, days = 14): Promise<any> {
  await ensureDecisionShadowTable();
  const d = Math.max(1, Math.min(90, Math.floor(Number(days) || 14)));
  const q = (sql: string) => pool.query(sql, [userId, d]).then(r => r.rows);
  const W = `user_id = $1 AND created_at > now() - ($2 || ' days')::interval`;
  const [coverage, lanes, agreement, disagreement, deciles, bySession, byPair] = await Promise.all([
    q(`SELECT count(DISTINCT scan_id) scans,
              count(DISTINCT scan_id) FILTER (WHERE lane='ai' AND (ai_status LIKE 'failed%' OR ai_status = 'timeout')) ai_failed_scans,
              count(DISTINCT scan_id) FILTER (WHERE lane='rules' AND acted) rules_acted_scans
         FROM fx_decision_shadow WHERE ${W}`),
    q(`SELECT lane, count(*) FILTER (WHERE picked) picks,
              count(*) FILTER (WHERE picked AND gate_result = 'filled') filled,
              count(*) FILTER (WHERE picked AND outcome IN ('tp','sl','timeout')) resolved,
              round(100.0 * avg((r_multiple > 0)::int) FILTER (WHERE outcome IN ('tp','sl','timeout')), 1) win_rate,
              round(avg(r_multiple) FILTER (WHERE outcome IN ('tp','sl','timeout'))::numeric, 3) avg_r,
              round(sum(r_multiple) FILTER (WHERE outcome IN ('tp','sl','timeout'))::numeric, 2) total_r
         FROM fx_decision_shadow WHERE ${W} GROUP BY lane`),
    q(`WITH p AS (SELECT scan_id, symbol,
                         max(direction) FILTER (WHERE lane='ai')    ai_dir,
                         max(direction) FILTER (WHERE lane='rules') rules_dir
                    FROM fx_decision_shadow WHERE ${W} AND picked GROUP BY 1,2)
       SELECT count(*) pair_scans,
              count(*) FILTER (WHERE ai_dir = rules_dir) agree,
              count(*) FILTER (WHERE ai_dir IS NOT NULL AND rules_dir IS NULL) ai_only,
              count(*) FILTER (WHERE rules_dir IS NOT NULL AND ai_dir IS NULL) rules_only,
              count(*) FILTER (WHERE ai_dir <> rules_dir) opposite
         FROM p`),
    q(`WITH p AS (SELECT scan_id, symbol, lane, r_multiple, outcome,
                         count(*) OVER (PARTITION BY scan_id, symbol) lanes_here
                    FROM fx_decision_shadow WHERE ${W} AND picked)
       SELECT lane || '_only' slice, count(*) n,
              round(avg(r_multiple) FILTER (WHERE outcome IN ('tp','sl','timeout'))::numeric, 3) avg_r
         FROM p WHERE lanes_here = 1 GROUP BY lane`),
    q(`SELECT lane, width_bucket(score, 0, 100, 10) decile, count(*) n,
              round(100.0 * avg((r_multiple > 0)::int), 1) win_rate, round(avg(r_multiple)::numeric, 3) avg_r
         FROM fx_decision_shadow WHERE ${W} AND picked AND outcome IN ('tp','sl','timeout') GROUP BY 1,2 ORDER BY 1,2`),
    q(`SELECT lane, session, direction, count(*) n, round(avg(r_multiple)::numeric, 3) avg_r
         FROM fx_decision_shadow WHERE ${W} AND picked AND outcome IN ('tp','sl','timeout') GROUP BY 1,2,3 ORDER BY 1,2,3`),
    q(`SELECT lane, symbol, count(*) n, round(sum(r_multiple)::numeric, 2) total_r
         FROM fx_decision_shadow WHERE ${W} AND picked AND outcome IN ('tp','sl','timeout') GROUP BY 1,2 ORDER BY 1,3 DESC`),
  ]);
  return { days: d, coverage: coverage[0], lanes, agreement: agreement[0], disagreement, deciles, bySession, byPair };
}
