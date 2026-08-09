/**
 * Kalshi self-learning brain.
 *
 * Mirrors the FX/options brains (server/services/options-brain.ts): a derived
 * model recomputed from the durable per-trade feature store
 * (kalshi_brain_outcomes) after every closed trade — win OR loss. It learns
 * which coins / bracket types / confidence & edge bands / hours actually win for
 * THIS account, and exposes two bounded knobs the engine consumes:
 *
 *   - kalshiBrainValueWeight()  → multiplies a bracket's value score (reweight)
 *   - kalshiBrainSizeMultiplier()→ scales contract count, Kelly-clamped (size)
 *
 * Reweight-and-size only: the brain never hard-blocks a trade (that's a later,
 * opt-in "gating" phase). The DB outcomes are the source of truth; the computed
 * brain is an in-memory cache (safe to lose — it just relearns from the rows).
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { kalshiBrainOutcomes, aiTradeResults } from '../../shared/schema';

const MIN_TRADES_FOR_COIN = 10;   // per-coin sample floor before sizing/weighting leans on it
const REFRESH_TTL_MS = 60 * 1000; // recompute at most once a minute per user unless forced

export interface KalshiBucketStat { trades: number; wins: number; winRate: number; }
export interface KalshiCoinKnowledge {
  totalTrades: number; wins: number; losses: number; winRate: number;
  totalPnl: number; avgWin: number; avgLoss: number; riskReward: number;
  byStrikeType: Record<string, KalshiBucketStat>;
  byConfidenceBand: Record<string, KalshiBucketStat>;
  byEdgeBand: Record<string, KalshiBucketStat>;
  byHour: Record<string, KalshiBucketStat>;
  bestStrikeType: string | null;
  recommendedSizeMultiplier: number; // 0.25–1.5
  valueScoreWeight: number;          // 0.7–1.3
}
export interface KalshiBrain {
  userId: number;
  lastLearned: string;
  totalTrades: number;
  overallWinRate: number;
  totalPnl: number;
  coinKnowledge: Record<string, KalshiCoinKnowledge>;
  insights: string[];
}

// In-memory cache (per process). Rebuilt from DB; never the source of truth.
const _cache = new Map<number, { brain: KalshiBrain; at: number }>();

function _band(n: number, size: number): string {
  const lo = Math.floor(n / size) * size;
  return `${lo}-${lo + size}`;
}
function _bump(map: Record<string, KalshiBucketStat>, key: string, win: boolean) {
  const s = (map[key] ??= { trades: 0, wins: 0, winRate: 0 });
  s.trades++; if (win) s.wins++;
  s.winRate = Math.round((s.wins / s.trades) * 100);
}
function coinFromTicker(ticker: string): string {
  const t = ticker.replace(/^KALSHI:/, '').toUpperCase();
  for (const c of ['BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'GOLD']) if (t.includes(c)) return c;
  return 'BTC';
}

/** Kelly-ish size multiplier from win rate and reward:risk, clamped 0.25–1.5. */
function _sizeMultiplier(winRate: number, rr: number, trades: number): number {
  if (trades < MIN_TRADES_FOR_COIN) return 1.0;
  const w = winRate / 100;
  const r = rr > 0 ? rr : 1;
  const kelly = w - (1 - w) / r; // fraction of edge
  return Math.max(0.25, Math.min(1.5, 1 + kelly)); // 1.0 = neutral
}
/** Value-score weight from coin win rate, clamped 0.7–1.3 (matches the old consensus mapping). */
function _valueWeight(winRate: number, trades: number): number {
  if (trades < 5) return 1.0;
  return Math.round((0.7 + (winRate / 100) * 0.6) * 100) / 100;
}

/** One-time seed from historical ai_trade_results (source='kalshi') when the
 *  feature store is empty, so the brain starts smart instead of blank. Old rows
 *  lack confidence/edge, so only coin/strategy/direction/result/pnl/hour seed. */
async function _backfillIfEmpty(userId: number): Promise<void> {
  const [{ n }] = await db.select({ n: sql<number>`count(*)` })
    .from(kalshiBrainOutcomes).where(eq(kalshiBrainOutcomes.userId, userId));
  if (Number(n) > 0) return;

  const rows = await db.select().from(aiTradeResults)
    .where(and(eq(aiTradeResults.userId, userId), eq(aiTradeResults.source, 'kalshi')))
    .orderBy(desc(aiTradeResults.closedAt)).limit(1000);
  if (!rows.length) return;

  const seed = rows.filter(r => r.closedAt).map(r => {
    const strat = (r.notes ?? '').split(':')[0].trim() || 'unknown';
    const d = new Date(r.closedAt as any);
    return {
      userId,
      coin: coinFromTicker(r.symbol),
      timeframe: 'hourly',
      strategy: strat,
      direction: r.direction === 'SELL' ? 'SELL' : 'BUY',
      strikeType: null,
      entryPriceCents: r.entryPrice != null ? Math.round(r.entryPrice * 100) : null,
      confidence: r.aiConfidence ?? null,
      edgePct: null, valueScore: null, modelProbPct: null, agreement: null,
      hourUtc: d.getUTCHours(),
      holdingMinutes: null,
      exitReason: null,
      result: r.result ?? (Number(r.profitLoss) > 0 ? 'WIN' : Number(r.profitLoss) < 0 ? 'LOSS' : 'BREAKEVEN'),
      profitLoss: Number(r.profitLoss ?? 0),
      source: 'backfill' as const,
      closedAt: d,
    };
  });
  if (seed.length) await db.insert(kalshiBrainOutcomes).values(seed);
}

/** Recompute the brain from the durable feature store and cache it. */
export async function learnFromKalshiTrades(userId: number): Promise<KalshiBrain> {
  await _backfillIfEmpty(userId).catch(() => {});
  const rows = await db.select().from(kalshiBrainOutcomes)
    .where(eq(kalshiBrainOutcomes.userId, userId))
    .orderBy(desc(kalshiBrainOutcomes.closedAt)).limit(2000);

  const coins: Record<string, KalshiCoinKnowledge> = {};
  const winSum: Record<string, number> = {}, winN: Record<string, number> = {};
  const lossSum: Record<string, number> = {}, lossN: Record<string, number> = {};
  let totalWins = 0, totalDecided = 0, totalPnl = 0;

  for (const r of rows) {
    const coin = r.coin || 'BTC';
    const k = (coins[coin] ??= {
      totalTrades: 0, wins: 0, losses: 0, winRate: 0, totalPnl: 0, avgWin: 0, avgLoss: 0, riskReward: 0,
      byStrikeType: {}, byConfidenceBand: {}, byEdgeBand: {}, byHour: {},
      bestStrikeType: null, recommendedSizeMultiplier: 1.0, valueScoreWeight: 1.0,
    });
    const pnl = Number(r.profitLoss ?? 0);
    const win = r.result === 'WIN';
    const loss = r.result === 'LOSS';
    k.totalTrades++; k.totalPnl += pnl; totalPnl += pnl;
    if (win) { k.wins++; totalWins++; winSum[coin] = (winSum[coin] ?? 0) + pnl; winN[coin] = (winN[coin] ?? 0) + 1; }
    if (loss) { k.losses++; lossSum[coin] = (lossSum[coin] ?? 0) + Math.abs(pnl); lossN[coin] = (lossN[coin] ?? 0) + 1; }
    if (win || loss) totalDecided++;

    if (r.strikeType) _bump(k.byStrikeType, r.strikeType, win);
    if (r.confidence != null) _bump(k.byConfidenceBand, _band(r.confidence, 10), win);
    if (r.edgePct != null) _bump(k.byEdgeBand, _band(r.edgePct, 5), win);
    if (r.hourUtc != null) _bump(k.byHour, String(r.hourUtc), win);
  }

  for (const [coin, k] of Object.entries(coins)) {
    const decided = k.wins + k.losses;
    k.winRate = decided ? Math.round((k.wins / decided) * 100) : 0;
    k.avgWin = winN[coin] ? winSum[coin] / winN[coin] : 0;
    k.avgLoss = lossN[coin] ? lossSum[coin] / lossN[coin] : 0;
    k.riskReward = k.avgLoss > 0 ? k.avgWin / k.avgLoss : (k.avgWin > 0 ? 2 : 1);
    k.recommendedSizeMultiplier = _sizeMultiplier(k.winRate, k.riskReward, decided);
    k.valueScoreWeight = _valueWeight(k.winRate, decided);
    // Best bracket type = highest win rate with ≥3 samples
    let best: string | null = null, bestWr = -1;
    for (const [t, s] of Object.entries(k.byStrikeType)) if (s.trades >= 3 && s.winRate > bestWr) { best = t; bestWr = s.winRate; }
    k.bestStrikeType = best;
  }

  const insights: string[] = [];
  for (const [coin, k] of Object.entries(coins)) {
    if (k.wins + k.losses >= MIN_TRADES_FOR_COIN) {
      insights.push(`${coin}: ${k.winRate}% win rate over ${k.wins + k.losses} trades → sizing ×${k.recommendedSizeMultiplier}, value ×${k.valueScoreWeight}.`);
      if (k.bestStrikeType) insights.push(`${coin}: best on "${k.bestStrikeType}" brackets.`);
    } else {
      insights.push(`${coin}: still learning (${k.wins + k.losses}/${MIN_TRADES_FOR_COIN} decided) — neutral sizing.`);
    }
  }

  const brain: KalshiBrain = {
    userId,
    lastLearned: new Date().toISOString(),
    totalTrades: rows.length,
    overallWinRate: totalDecided ? Math.round((totalWins / totalDecided) * 100) : 0,
    totalPnl: Math.round(totalPnl * 100) / 100,
    coinKnowledge: coins,
    insights,
  };
  _cache.set(userId, { brain, at: Date.now() });
  return brain;
}

/** Cached brain, recomputed if stale/missing. */
export async function getOrRefreshKalshiBrain(userId: number, force = false): Promise<KalshiBrain> {
  const hit = _cache.get(userId);
  if (!force && hit && Date.now() - hit.at < REFRESH_TTL_MS) return hit.brain;
  return learnFromKalshiTrades(userId);
}

/** Synchronous read of the cached brain (null if not warmed yet). Engine warms
 *  it async at scan start, then reads it inside the sync scoring loop. */
export function cachedKalshiBrain(userId: number): KalshiBrain | null {
  return _cache.get(userId)?.brain ?? null;
}

/** Size multiplier for a coin (0.25–1.5, 1.0 neutral). Reads cache only. */
export function kalshiBrainSizeMultiplier(userId: number, coin: string): number {
  const b = _cache.get(userId)?.brain;
  const k = b?.coinKnowledge[coin];
  return k ? k.recommendedSizeMultiplier : 1.0;
}

/** Value-score weight for a bracket (≈0.6–1.4). Combines the coin weight with a
 *  bracket-type nudge when that bracket has enough samples. Reads cache only. */
export function kalshiBrainValueWeight(userId: number, coin: string, strikeType?: string | null): number {
  const k = _cache.get(userId)?.brain?.coinKnowledge[coin];
  if (!k) return 1.0;
  let w = k.valueScoreWeight;
  if (strikeType) {
    const st = k.byStrikeType[strikeType];
    if (st && st.trades >= 5) w *= (0.85 + (st.winRate / 100) * 0.3); // 0.85–1.15 nudge
  }
  return Math.max(0.6, Math.min(1.4, Math.round(w * 100) / 100));
}
