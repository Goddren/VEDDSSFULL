// Sol engine self-learning brain — a faithful mirror of crypto-brain.ts.
// A derived model recomputed from the durable per-trade feature store
// (sol_brain_outcomes) after every close. Learns which tokens / strategies /
// hours actually win for THIS account and exposes bounded knobs the engine uses:
//   - solBrainSizeMultiplier() → scales entry sizing (Kelly-clamped)
//   - solBrainGate()           → hard-block of proven-losing setups (live-only)
// Reweight-and-size is always on (bounded, neutral until enough data); gating is
// wired on by default in the engine. The DB rows are the source of truth; the
// computed brain is a cache. Long-only (Sol is spot) — direction is always 'long'.

import { pool } from '../db';

const MIN_TRADES = 10;
const REFRESH_TTL_MS = 60 * 1000;

// Lazy table guard — ensures the feature store exists even if the boot ensure
// (server/index.ts) has not run yet. Idempotent; runs at most once per process.
let _ensured = false;
async function ensureTable(): Promise<void> {
  if (_ensured) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "sol_brain_outcomes" (
        "id" serial PRIMARY KEY NOT NULL,
        "user_id" integer NOT NULL,
        "symbol" text NOT NULL,
        "strategy" text NOT NULL,
        "direction" text NOT NULL,
        "entry_confidence" double precision,
        "return_pct" double precision,
        "hour_utc" integer,
        "holding_minutes" integer,
        "exit_reason" text,
        "result" text NOT NULL,
        "profit_loss" double precision NOT NULL DEFAULT 0,
        "source" text NOT NULL DEFAULT 'live',
        "closed_at" timestamp DEFAULT now() NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL
      );
      CREATE INDEX IF NOT EXISTS "idx_sol_brain_outcomes_user_symbol" ON "sol_brain_outcomes" ("user_id", "symbol");
    `);
    _ensured = true;
  } catch (err: any) {
    console.error('[sol-brain] ensureTable failed (non-fatal):', err?.message ?? err);
  }
}

interface Bucket { trades: number; wins: number; winRate: number; }
interface SymbolKnowledge {
  totalTrades: number; wins: number; losses: number; winRate: number;
  totalPnl: number; avgWin: number; avgLoss: number; riskReward: number;
  byStrategy: Record<string, Bucket>; byHour: Record<string, Bucket>;
  bestStrategy: string | null; recommendedSizeMultiplier: number;
}
export interface SolBrain {
  userId: number; lastLearned: string; totalTrades: number; overallWinRate: number; totalPnl: number;
  symbolKnowledge: Record<string, SymbolKnowledge>; insights: string[];
}

const _cache = new Map<number, { brain: SolBrain; at: number }>();

function bump(map: Record<string, Bucket>, key: string, win: boolean) {
  const s = (map[key] ??= { trades: 0, wins: 0, winRate: 0 });
  s.trades++; if (win) s.wins++; s.winRate = Math.round((s.wins / s.trades) * 100);
}
function sizeMult(winRate: number, rr: number, trades: number): number {
  if (trades < MIN_TRADES) return 1.0;
  const w = winRate / 100, r = rr > 0 ? rr : 1;
  const kelly = w - (1 - w) / r;
  return Math.max(0.25, Math.min(1.5, 1 + kelly));
}

/** One-time seed from sol_engine_positions closed rows when the store is empty.
 *  sol_engine_positions has no strategy/realized-pnl columns — only close_pnl_pct
 *  (gain %), token_symbol, closed_at, mode — so we seed strategy='unknown',
 *  direction='long', and use close_pnl_pct as the profit_loss proxy. */
async function backfillIfEmpty(userId: number): Promise<void> {
  const { rows } = await pool.query(`SELECT count(*)::int n FROM sol_brain_outcomes WHERE user_id=$1`, [userId]);
  if (rows[0].n > 0) return;
  const { rows: trades } = await pool.query(
    `SELECT token_symbol, close_pnl_pct, closed_at FROM sol_engine_positions
     WHERE user_id=$1 AND status='closed' AND close_pnl_pct IS NOT NULL ORDER BY closed_at DESC LIMIT 1000`, [userId]);
  if (!trades.length) return;
  for (const t of trades) {
    const pnl = Number(t.close_pnl_pct) || 0;
    const d = t.closed_at ? new Date(t.closed_at) : new Date();
    await pool.query(
      `INSERT INTO sol_brain_outcomes (user_id, symbol, strategy, direction, result, profit_loss, return_pct, hour_utc, source, closed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'backfill',$9)`,
      [userId, t.token_symbol || 'UNKNOWN', 'unknown', 'long', pnl > 0 ? 'WIN' : pnl < 0 ? 'LOSS' : 'BREAKEVEN', pnl, pnl, d.getUTCHours(), d]
    ).catch(() => {});
  }
}

export async function learnFromSolTrades(userId: number): Promise<SolBrain> {
  await ensureTable();
  await backfillIfEmpty(userId).catch(() => {});
  const { rows } = await pool.query(
    `SELECT symbol, strategy, direction, result, profit_loss, hour_utc FROM sol_brain_outcomes
     WHERE user_id=$1 ORDER BY closed_at DESC LIMIT 2000`, [userId]);

  const symbols: Record<string, SymbolKnowledge> = {};
  const winSum: Record<string, number> = {}, winN: Record<string, number> = {}, lossSum: Record<string, number> = {}, lossN: Record<string, number> = {};
  let totalWins = 0, totalDecided = 0, totalPnl = 0;
  for (const r of rows) {
    const sym = r.symbol || 'UNKNOWN';
    const k = (symbols[sym] ??= { totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0, riskReward: 0, byStrategy: {}, byHour: {}, bestStrategy: null, recommendedSizeMultiplier: 1.0 });
    const pnl = Number(r.profit_loss) || 0;
    const win = r.result === 'WIN', loss = r.result === 'LOSS';
    k.totalTrades++; k.totalPnl += pnl; totalPnl += pnl;
    if (win) { k.wins++; totalWins++; winSum[sym] = (winSum[sym] ?? 0) + pnl; winN[sym] = (winN[sym] ?? 0) + 1; }
    if (loss) { k.losses++; lossSum[sym] = (lossSum[sym] ?? 0) + Math.abs(pnl); lossN[sym] = (lossN[sym] ?? 0) + 1; }
    if (win || loss) totalDecided++;
    if (r.strategy) bump(k.byStrategy, r.strategy, win);
    if (r.hour_utc != null) bump(k.byHour, String(r.hour_utc), win);
  }
  for (const [sym, k] of Object.entries(symbols)) {
    const decided = k.wins + k.losses;
    k.winRate = decided ? Math.round((k.wins / decided) * 100) : 0;
    k.avgWin = winN[sym] ? winSum[sym] / winN[sym] : 0;
    k.avgLoss = lossN[sym] ? lossSum[sym] / lossN[sym] : 0;
    k.riskReward = k.avgLoss > 0 ? k.avgWin / k.avgLoss : (k.avgWin > 0 ? 2 : 1);
    k.recommendedSizeMultiplier = sizeMult(k.winRate, k.riskReward, decided);
    let best: string | null = null, bestWr = -1;
    for (const [s, b] of Object.entries(k.byStrategy)) if (b.trades >= 3 && b.winRate > bestWr) { best = s; bestWr = b.winRate; }
    k.bestStrategy = best;
  }
  const insights: string[] = [];
  for (const [sym, k] of Object.entries(symbols)) {
    if (k.wins + k.losses >= MIN_TRADES) insights.push(`${sym}: ${k.winRate}% WR over ${k.wins + k.losses} → sizing ×${k.recommendedSizeMultiplier}${k.bestStrategy ? `, best on ${k.bestStrategy}` : ''}.`);
    else insights.push(`${sym}: still learning (${k.wins + k.losses}/${MIN_TRADES}).`);
  }
  const brain: SolBrain = { userId, lastLearned: new Date().toISOString(), totalTrades: rows.length, overallWinRate: totalDecided ? Math.round((totalWins / totalDecided) * 100) : 0, totalPnl: Math.round(totalPnl * 100) / 100, symbolKnowledge: symbols, insights };
  _cache.set(userId, { brain, at: Date.now() });
  return brain;
}

export async function getOrRefreshSolBrain(userId: number, force = false): Promise<SolBrain> {
  const hit = _cache.get(userId);
  if (!force && hit && Date.now() - hit.at < REFRESH_TTL_MS) return hit.brain;
  return learnFromSolTrades(userId);
}

/** Size multiplier for a symbol (0.25–1.5, 1.0 neutral). Cache-only. */
export function solBrainSizeMultiplier(userId: number, symbol: string): number {
  const k = _cache.get(userId)?.brain?.symbolKnowledge[symbol];
  return k ? k.recommendedSizeMultiplier : 1.0;
}

/** Gating (hard-block): skip symbols/strategies/hours proven to lose. */
export function solBrainGate(userId: number, symbol: string, strategy?: string | null, hourUtc?: number | null): { blocked: boolean; reason: string } {
  const k = _cache.get(userId)?.brain?.symbolKnowledge[symbol];
  if (!k) return { blocked: false, reason: '' };
  const decided = k.wins + k.losses;
  if (decided >= 15 && k.winRate < 35) return { blocked: true, reason: `🧠 Sol brain: ${symbol} ${k.winRate}% WR over ${decided} — skipping symbol` };
  if (strategy) { const st = k.byStrategy[strategy]; if (st && st.trades >= 8 && st.winRate < 30) return { blocked: true, reason: `🧠 Sol brain: ${symbol}/${strategy} ${st.winRate}% WR over ${st.trades} — skipping` }; }
  if (hourUtc != null) { const h = k.byHour[String(hourUtc)]; if (h && h.trades >= 8 && h.winRate < 30) return { blocked: true, reason: `🧠 Sol brain: ${symbol} @ ${hourUtc}:00 UTC ${h.winRate}% WR over ${h.trades} — skipping this hour` }; }
  return { blocked: false, reason: '' };
}

/** Record one closed trade into the feature store, then relearn. Long-only. */
export async function recordSolBrainOutcome(o: {
  userId: number; symbol: string; strategy: string; direction: string; entryConfidence?: number | null;
  returnPct?: number | null; holdingMinutes?: number | null; exitReason?: string | null; profitLoss: number;
}): Promise<void> {
  try {
    await ensureTable();
    await pool.query(
      `INSERT INTO sol_brain_outcomes (user_id, symbol, strategy, direction, entry_confidence, return_pct, hour_utc, holding_minutes, exit_reason, result, profit_loss, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'live')`,
      [o.userId, o.symbol, o.strategy || 'unknown', o.direction || 'long', o.entryConfidence ?? null, o.returnPct ?? null,
       new Date().getUTCHours(), o.holdingMinutes ?? null, o.exitReason ?? null,
       o.profitLoss > 0 ? 'WIN' : o.profitLoss < 0 ? 'LOSS' : 'BREAKEVEN', o.profitLoss]
    );
    await learnFromSolTrades(o.userId);
  } catch (err: any) {
    console.error('[sol-brain] recordSolBrainOutcome failed (non-fatal):', err?.message ?? err);
  }
}
