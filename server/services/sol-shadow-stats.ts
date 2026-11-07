// ─────────────────────────────────────────────────────────────────────────────
// Sol shadow context + per-strategy context stats — 2026-11-07.
//
// Every Sol shadow position (all strategies, sol-engine.ts shadow lane) writes
// one row to sol_shadow_context at entry with the market context it was taken
// in, and completes it at close with the exit reason, hold time and gross/
// cost/net result. computeSolShadowStats() rolls closed rows up per
// strategy × context bucket (hour block, liquidity, DEX, momentum, token age,
// buy ratio) and labels each bucket by MEDIAN net % with a minimum sample:
//   favor  : n ≥ MIN_N and median net > +FAVOR_PCT
//   avoid  : n ≥ MIN_N and median net < −AVOID_PCT
//   learning otherwise.
// ADVISORY ONLY: the AI review prompt reads the text and each shadow entry is
// stamped with what the stats said at the time (advice_at_entry), so it can be
// measured later whether following the advice would have helped. Nothing here
// blocks or resizes paper or live entries.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

// The fake RAY/mSOL wins live in sol_engine_positions / sol_brain_outcomes and
// are quarantined there (sol-brain.ts + shadow-ledger.ts, PR #20). This table
// only holds rows written after this lane shipped, so it needs no filter.

const num = (name: string, dflt: number) => { const v = Number(process.env[name]); return Number.isFinite(v) && v > 0 ? v : dflt; };
const MIN_N = () => num('SOL_SHADOW_STATS_MIN_N', 15);
const FAVOR_PCT = () => num('SOL_SHADOW_FAVOR_MEDIAN_PCT', 1);
const AVOID_PCT = () => num('SOL_SHADOW_AVOID_MEDIAN_PCT', 2);

let _ensured: Promise<void> | null = null;
export function ensureSolShadowContextTable(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS sol_shadow_context (
      id serial PRIMARY KEY, user_id int NOT NULL, position_id text NOT NULL UNIQUE,
      strategy_id text NOT NULL, symbol text NOT NULL, mint text, dex text,
      liquidity_usd double precision, price_change_1h double precision, price_change_24h double precision,
      buy_ratio_1h double precision, buy_ratio_24h double precision, volume_24h double precision,
      market_cap_usd double precision, token_age_hours double precision,
      hour_utc int, session text, day_of_week int,
      signal text, confidence double precision, risk_level text,
      whale_score double precision, sentiment_score double precision, tokenomics_score double precision,
      tags text[], advice_at_entry text,
      entry_price double precision, size_sol double precision, cost_pct double precision,
      opened_at timestamptz NOT NULL DEFAULT now(),
      closed_at timestamptz, exit_reason text, hold_minutes double precision,
      gross_pct double precision, net_pct double precision, peak_gain_pct double precision)`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS sol_shadow_context_user_closed ON sol_shadow_context (user_id, closed_at)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

export interface SolShadowEntryContext {
  userId: number; positionId: string; strategyId: string; symbol: string; mint?: string | null; dex?: string | null;
  liquidityUsd?: number | null; priceChange1h?: number | null; priceChange24h?: number | null;
  buyRatio1h?: number | null; buyRatio24h?: number | null; volume24h?: number | null;
  marketCapUsd?: number | null; tokenAgeHours?: number | null;
  signal?: string | null; confidence?: number | null; riskLevel?: string | null;
  whaleScore?: number | null; sentimentScore?: number | null; tokenomicsScore?: number | null;
  entryPrice: number; sizeSol: number; costPct?: number | null; openedAt?: Date;
}

export function sessionOf(hourUtc: number): string {
  if (hourUtc < 7) return 'Asian';
  if (hourUtc < 12) return 'London';
  if (hourUtc < 16) return 'Overlap';
  if (hourUtc < 21) return 'New York';
  return 'Late';
}

/** Simple pattern tags derived from the scan data (the analyzer computes no chart patterns). */
export function deriveTags(c: Pick<SolShadowEntryContext, 'priceChange1h' | 'priceChange24h' | 'buyRatio1h' | 'buyRatio24h' | 'liquidityUsd' | 'tokenAgeHours'>): string[] {
  const t: string[] = [];
  const h1 = c.priceChange1h ?? 0, d1 = c.priceChange24h ?? 0;
  const br = c.buyRatio1h ?? c.buyRatio24h ?? 0.5;
  if (h1 >= 40) t.push('hot_hour');
  if (d1 >= 100) t.push('overextended');
  if (d1 <= -4 && br > 0.6) t.push('dip_accumulation');
  if (br > 0.65) t.push('buyers_dominant');
  if (br < 0.45) t.push('sellers_dominant');
  if ((c.liquidityUsd ?? 0) > 0 && (c.liquidityUsd ?? 0) < 25_000) t.push('thin_pool');
  if (c.tokenAgeHours != null && c.tokenAgeHours < 24) t.push('new_token');
  return t;
}

// ── Buckets (shared by stats and by the live lookup) ────────────────────────
type Ctx = { hour_utc?: number | null; liquidity_usd?: number | null; dex?: string | null; price_change_1h?: number | null; price_change_24h?: number | null; token_age_hours?: number | null; buy_ratio_1h?: number | null; buy_ratio_24h?: number | null };
export function bucketsOf(c: Ctx): Record<string, string> {
  const b: Record<string, string> = {};
  if (c.hour_utc != null) { const s = Math.floor(c.hour_utc / 4) * 4; b.hour = `${String(s).padStart(2, '0')}-${String(s + 4).padStart(2, '0')}UTC`; }
  const liq = c.liquidity_usd ?? 0;
  if (liq > 0) b.liquidity = liq < 25_000 ? '<25k' : liq < 100_000 ? '25-100k' : liq < 500_000 ? '100-500k' : '500k+';
  if (c.dex) b.dex = c.dex.toLowerCase();
  const m = c.price_change_1h ?? null;
  if (m != null) b.momentum1h = m < -10 ? '<-10%' : m < 0 ? '-10-0%' : m < 10 ? '0-10%' : m < 40 ? '10-40%' : '40%+';
  const d = c.price_change_24h ?? null;
  if (d != null) b.change24h = d < -10 ? '<-10%' : d < 10 ? '-10-10%' : d < 50 ? '10-50%' : '50%+';
  const age = c.token_age_hours ?? null;
  if (age != null) b.age = age < 24 ? '<1d' : age < 168 ? '1-7d' : '7d+';
  const br = c.buy_ratio_1h ?? c.buy_ratio_24h ?? null;
  if (br != null) b.buyRatio = br < 0.5 ? '<50%' : br < 0.6 ? '50-60%' : br < 0.7 ? '60-70%' : '70%+';
  return b;
}

export interface SolShadowBucketStat { strategy: string; dim: string; bucket: string; n: number; medianNet: number; p25: number; p75: number; winRate: number; verdict: 'favor' | 'avoid' | 'learning' }

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function aggregate(rows: Array<Ctx & { strategy_id: string; net_pct: number }>): SolShadowBucketStat[] {
  const groups = new Map<string, number[]>();
  for (const r of rows) {
    if (r.net_pct == null || !Number.isFinite(Number(r.net_pct))) continue;
    const bs = { ...bucketsOf(r), all: 'all' };
    for (const [dim, bucket] of Object.entries(bs)) {
      const k = `${r.strategy_id}|${dim}|${bucket}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(Number(r.net_pct));
    }
  }
  const out: SolShadowBucketStat[] = [];
  for (const [k, v] of Array.from(groups.entries())) {
    const [strategy, dim, bucket] = k.split('|');
    const s = v.slice().sort((a, b) => a - b);
    const med = quantile(s, 0.5);
    const verdict = s.length >= MIN_N() ? (med > FAVOR_PCT() ? 'favor' : med < -AVOID_PCT() ? 'avoid' : 'learning') : 'learning';
    out.push({ strategy, dim, bucket, n: s.length, medianNet: med, p25: quantile(s, 0.25), p75: quantile(s, 0.75), winRate: s.filter((x) => x > 0).length / s.length, verdict });
  }
  return out.sort((a, b) => b.n - a.n);
}

// ── Writes (non-fatal; shadow bookkeeping must never break a scan) ──────────
export async function recordSolShadowEntry(c: SolShadowEntryContext, adviceAtEntry: string | null): Promise<void> {
  try {
    await ensureSolShadowContextTable();
    const at = c.openedAt ?? new Date();
    const hour = at.getUTCHours();
    await pool.query(
      `INSERT INTO sol_shadow_context (user_id, position_id, strategy_id, symbol, mint, dex, liquidity_usd, price_change_1h, price_change_24h,
         buy_ratio_1h, buy_ratio_24h, volume_24h, market_cap_usd, token_age_hours, hour_utc, session, day_of_week, signal, confidence,
         risk_level, whale_score, sentiment_score, tokenomics_score, tags, advice_at_entry, entry_price, size_sol, cost_pct, opened_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29)
       ON CONFLICT (position_id) DO NOTHING`,
      [c.userId, c.positionId, c.strategyId, c.symbol, c.mint ?? null, c.dex ?? null, c.liquidityUsd ?? null, c.priceChange1h ?? null, c.priceChange24h ?? null,
       c.buyRatio1h ?? null, c.buyRatio24h ?? null, c.volume24h ?? null, c.marketCapUsd ?? null, c.tokenAgeHours ?? null, hour, sessionOf(hour), at.getUTCDay(),
       c.signal ?? null, c.confidence ?? null, c.riskLevel ?? null, c.whaleScore ?? null, c.sentimentScore ?? null, c.tokenomicsScore ?? null,
       deriveTags(c), adviceAtEntry, c.entryPrice, c.sizeSol, c.costPct ?? null, at]);
  } catch (e: any) { console.error('[sol-shadow-stats] entry write failed (non-fatal):', e?.message ?? e); }
}

export async function recordSolShadowClose(o: { positionId: string; exitReason: string; holdMinutes: number; grossPct: number | null; netPct: number | null; peakGainPct: number | null }): Promise<void> {
  try {
    await ensureSolShadowContextTable();
    await pool.query(
      `UPDATE sol_shadow_context SET closed_at=now(), exit_reason=$2, hold_minutes=$3, gross_pct=$4, net_pct=$5, peak_gain_pct=$6
        WHERE position_id=$1 AND closed_at IS NULL`,
      [o.positionId, o.exitReason, o.holdMinutes, o.grossPct, o.netPct, o.peakGainPct]);
  } catch (e: any) { console.error('[sol-shadow-stats] close write failed (non-fatal):', e?.message ?? e); }
}

// ── Reads (cached ~15 min per user) ─────────────────────────────────────────
const _cache = new Map<number, { at: number; stats: SolShadowBucketStat[] }>();
export async function computeSolShadowStats(userId: number, force = false): Promise<SolShadowBucketStat[]> {
  const hit = _cache.get(userId);
  if (!force && hit && Date.now() - hit.at < 15 * 60_000) return hit.stats;
  await ensureSolShadowContextTable();
  const { rows } = await pool.query(
    `SELECT strategy_id, hour_utc, liquidity_usd, dex, price_change_1h, price_change_24h, token_age_hours, buy_ratio_1h, buy_ratio_24h, net_pct
       FROM sol_shadow_context
      WHERE user_id=$1 AND closed_at IS NOT NULL AND net_pct IS NOT NULL AND closed_at >= now() - interval '60 days'`, [userId]);
  const stats = aggregate(rows);
  _cache.set(userId, { at: Date.now(), stats });
  return stats;
}

/** Verdicts for one strategy in one context, e.g. "avoid: liquidity <25k (n=22, median −6.1%)". */
export function adviceFor(stats: SolShadowBucketStat[], strategyId: string, ctx: Ctx): { verdict: 'favor' | 'avoid' | 'learning'; reasons: string[] } {
  const bs = bucketsOf(ctx);
  const hits = stats.filter((s) => s.strategy === strategyId && s.verdict !== 'learning' && bs[s.dim] === s.bucket);
  const fmt = (s: SolShadowBucketStat) => `${s.verdict}: ${s.dim} ${s.bucket} (n=${s.n}, median ${s.medianNet >= 0 ? '+' : ''}${s.medianNet.toFixed(1)}%)`;
  const avoid = hits.filter((s) => s.verdict === 'avoid'), favor = hits.filter((s) => s.verdict === 'favor');
  // Any avoid outweighs favors: the cautious read while this is advisory.
  const verdict = avoid.length ? 'avoid' : favor.length ? 'favor' : 'learning';
  return { verdict, reasons: [...avoid, ...favor].map(fmt) };
}

/** Prompt block for the Sol AI review: the strongest favor/avoid buckets. */
export async function getSolShadowStatsText(userId: number, max = 12): Promise<string> {
  try {
    const stats = (await computeSolShadowStats(userId)).filter((s) => s.verdict !== 'learning' && s.dim !== 'all');
    if (!stats.length) return '';
    const top = stats.sort((a, b) => Math.abs(b.medianNet) * Math.sqrt(b.n) - Math.abs(a.medianNet) * Math.sqrt(a.n)).slice(0, max);
    return `SOL SHADOW EVIDENCE (virtual trades of every strategy, net of costs, judged by MEDIAN; advice only):\n` +
      top.map((s) => `- ${s.strategy} ${s.verdict.toUpperCase()} when ${s.dim}=${s.bucket}: n=${s.n}, median ${s.medianNet >= 0 ? '+' : ''}${s.medianNet.toFixed(1)}%, win ${(s.winRate * 100).toFixed(0)}%`).join('\n');
  } catch { return ''; }
}
