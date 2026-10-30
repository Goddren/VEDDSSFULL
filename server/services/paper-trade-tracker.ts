/**
 * Paper Trade Tracker — AI Training System
 * Records every confirmation AI prediction and tracks real outcomes.
 * Feeds historical accuracy back into future confirmation prompts.
 */
import { db } from '../db';
import { paperTrades } from '../../shared/schema';
import { eq, desc, and, sql, gte } from 'drizzle-orm';
import { candleStart, validEntry, resolveOutcome, type Bar } from './paper-trade-math';

// The chart-data path posts every few minutes, so one AI idea used to be
// written ~33 times an hour. Keep one row per symbol/timeframe/direction per
// candle: this map catches concurrent posts, the DB check catches restarts.
const _lastCandle = new Map<string, number>();

// ─── Create a paper trade from a confirmation result ─────────────────────────
export async function createPaperTrade(data: {
  userId: number;
  symbol: string;
  timeframe: string;
  direction: 'BUY' | 'SELL';
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  aiConfidence: number;
  aiModel?: string;
  aiProvider?: string;
  aiReasoning?: string;
  confluenceScore?: number;
  confluenceGrade?: string;
  githubStrategyUsed?: boolean;
  analysisId?: number;
}) {
  // 5,159 rows (2026-09-07 → 09-09) were written with entry 0, which made every
  // pip and win-rate figure on that data meaningless.
  if (!validEntry(data.entryPrice)) {
    console.warn(`[PaperTrade] Skipped ${data.symbol} ${data.direction}: entry price ${data.entryPrice} is not a real price`);
    return null;
  }
  const start = candleStart(data.timeframe, Date.now());
  const key = `${data.userId}|${data.symbol}|${data.timeframe}|${data.direction}`;
  if (_lastCandle.get(key) === start) return null;
  _lastCandle.set(key, start);
  try {
    const [dupe] = await db.select({ id: paperTrades.id }).from(paperTrades).where(and(
      eq(paperTrades.userId, data.userId), eq(paperTrades.symbol, data.symbol),
      eq(paperTrades.timeframe, data.timeframe), eq(paperTrades.direction, data.direction),
      gte(paperTrades.createdAt, new Date(start)),
    )).limit(1);
    if (dupe) return null;
    const [trade] = await db.insert(paperTrades).values({
      ...data,
      outcome: 'pending',
    }).returning();
    console.log(`[PaperTrade] Created #${trade.id} — ${data.symbol} ${data.direction} @ ${data.entryPrice} (confidence: ${data.aiConfidence}%)`);
    return trade;
  } catch (e) {
    console.error('[PaperTrade] Failed to create:', e);
    return null;
  }
}

// ─── Resolve outcome based on price movement ─────────────────────────────────
// `bars` are recent 5m bars for the symbol: the trade resolves on whichever of
// its stop and target price reached first (paper-trade-math.ts resolveOutcome).
export async function resolvePaperTrade(tradeId: number, currentPrice: number, bars: Bar[] = []) {
  try {
    const [trade] = await db.select().from(paperTrades).where(eq(paperTrades.id, tradeId));
    if (!trade || trade.outcome !== 'pending') return;

    const now = new Date();
    const ageHours = (now.getTime() - trade.createdAt.getTime()) / (1000 * 60 * 60);

    // Update price snapshots
    const updates: any = {};
    if (ageHours >= 1 && !trade.priceAt1h) updates.priceAt1h = currentPrice;
    if (ageHours >= 4 && !trade.priceAt4h) updates.priceAt4h = currentPrice;
    if (ageHours >= 24 && !trade.priceAt24h) updates.priceAt24h = currentPrice;

    const r = resolveOutcome({
      symbol: trade.symbol, direction: trade.direction, entryPrice: trade.entryPrice,
      stopLoss: trade.stopLoss, takeProfit: trade.takeProfit, openedAt: trade.createdAt.getTime(),
    }, bars, currentPrice, now.getTime());
    if (r) {
      updates.outcome = r.outcome;
      updates.pnlPips = r.pnlPips;
      updates.pnlPercent = r.pnlPercent;
      updates.resolvedAt = now;
      if (r.note) updates.notes = r.note;
      const p = r.pnlPips;
      console.log(`[PaperTrade] Resolved #${tradeId} — ${trade.symbol} ${trade.direction}: ${r.outcome.toUpperCase()} (${p == null ? 'n/a' : `${p > 0 ? '+' : ''}${p}`} pips)`);
    }

    if (Object.keys(updates).length > 0) {
      await db.update(paperTrades).set(updates).where(eq(paperTrades.id, tradeId));
    }
  } catch (e) {
    console.error('[PaperTrade] Failed to resolve:', e);
  }
}

// ─── Get accuracy stats for AI prompt injection ───────────────────────────────
export async function getAIAccuracyContext(userId: number, symbol?: string): Promise<string> {
  try {
    const conditions = [eq(paperTrades.userId, userId)];
    if (symbol) {
      const cleanSymbol = symbol.replace(/[^A-Z0-9]/gi, '').toUpperCase();
      conditions.push(sql`UPPER(REPLACE(${paperTrades.symbol}, '/', '')) = ${cleanSymbol}`);
    }

    const trades = await db.select().from(paperTrades)
      .where(and(...conditions))
      .orderBy(desc(paperTrades.createdAt))
      .limit(50);

    const resolved = trades.filter(t => t.outcome !== 'pending');
    if (resolved.length < 3) return ''; // Not enough data yet

    const wins = resolved.filter(t => t.outcome === 'win').length;
    const losses = resolved.filter(t => t.outcome === 'loss').length;
    const total = resolved.length;
    const winRate = Math.round((wins / total) * 100);

    // Find patterns in losses
    const lossedBuys = resolved.filter(t => t.outcome === 'loss' && t.direction === 'BUY').length;
    const lossedSells = resolved.filter(t => t.outcome === 'loss' && t.direction === 'SELL').length;
    const avgLossConfidence = resolved
      .filter(t => t.outcome === 'loss')
      .reduce((sum, t) => sum + (t.aiConfidence || 0), 0) / (losses || 1);

    const avgWinConfidence = resolved
      .filter(t => t.outcome === 'win')
      .reduce((sum, t) => sum + (t.aiConfidence || 0), 0) / (wins || 1);

    const symbolLabel = symbol ? `on ${symbol}` : 'overall';

    let context = `\n## YOUR HISTORICAL PAPER TRADE ACCURACY ${symbolLabel.toUpperCase()}
- Total recorded trades: ${total} | Win rate: ${winRate}% (${wins}W / ${losses}L)
- Avg confidence on WINS: ${Math.round(avgWinConfidence)}% | On LOSSES: ${Math.round(avgLossConfidence)}%`;

    if (lossedBuys > lossedSells * 1.5) {
      context += `\n⚠ PATTERN: BUY signals have been losing more often — be extra cautious on bullish calls`;
    } else if (lossedSells > lossedBuys * 1.5) {
      context += `\n⚠ PATTERN: SELL signals have been losing more often — be extra cautious on bearish calls`;
    }

    if (avgLossConfidence > avgWinConfidence) {
      context += `\n⚠ PATTERN: High confidence signals have been losing — consider being more conservative`;
    }

    if (winRate < 40) {
      context += `\n🔴 ACCURACY ALERT: Win rate is low (${winRate}%). Increase confirmation requirements.`;
    } else if (winRate > 65) {
      context += `\n🟢 STRONG ACCURACY: Win rate is ${winRate}%. Current strategy is performing well.`;
    }

    // Last 5 trades summary
    const last5 = resolved.slice(0, 5);
    const last5Summary = last5.map(t =>
      `${t.direction} ${t.symbol} @ ${t.entryPrice} → ${t.outcome?.toUpperCase()} (${t.pnlPips ? (t.pnlPips > 0 ? '+' : '') + t.pnlPips + ' pips' : 'N/A'})`
    ).join('\n  ');
    context += `\n\nLast ${last5.length} trades:\n  ${last5Summary}`;

    return context;
  } catch (e) {
    console.error('[PaperTrade] Failed to get accuracy context:', e);
    return '';
  }
}

// ─── Get stats for frontend ───────────────────────────────────────────────────
export async function getPaperTradeStats(userId: number) {
  try {
    const trades = await db.select().from(paperTrades)
      .where(eq(paperTrades.userId, userId))
      .orderBy(desc(paperTrades.createdAt));

    const resolved = trades.filter(t => t.outcome !== 'pending');
    const wins = resolved.filter(t => t.outcome === 'win');
    const losses = resolved.filter(t => t.outcome === 'loss');
    const pending = trades.filter(t => t.outcome === 'pending');

    // Per-symbol stats
    const symbolStats: Record<string, { wins: number; losses: number; total: number }> = {};
    for (const t of resolved) {
      if (!symbolStats[t.symbol]) symbolStats[t.symbol] = { wins: 0, losses: 0, total: 0 };
      symbolStats[t.symbol].total++;
      if (t.outcome === 'win') symbolStats[t.symbol].wins++;
      if (t.outcome === 'loss') symbolStats[t.symbol].losses++;
    }

    // Per-model stats
    const modelStats: Record<string, { wins: number; losses: number; total: number }> = {};
    for (const t of resolved) {
      const key = t.aiModel || 'unknown';
      if (!modelStats[key]) modelStats[key] = { wins: 0, losses: 0, total: 0 };
      modelStats[key].total++;
      if (t.outcome === 'win') modelStats[key].wins++;
      if (t.outcome === 'loss') modelStats[key].losses++;
    }

    return {
      total: trades.length,
      resolved: resolved.length,
      pending: pending.length,
      wins: wins.length,
      losses: losses.length,
      winRate: resolved.length > 0 ? Math.round((wins.length / resolved.length) * 100) : 0,
      totalPnlPips: resolved.reduce((sum, t) => sum + (t.pnlPips || 0), 0),
      symbolStats,
      modelStats,
      recentTrades: trades.slice(0, 20),
    };
  } catch (e) {
    console.error('[PaperTrade] Failed to get stats:', e);
    return null;
  }
}
