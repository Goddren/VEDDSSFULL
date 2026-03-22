/**
 * Paper Trade Tracker — AI Training System
 * Records every confirmation AI prediction and tracks real outcomes.
 * Feeds historical accuracy back into future confirmation prompts.
 */
import { db } from '../db';
import { paperTrades } from '../../shared/schema';
import { eq, desc, and, sql } from 'drizzle-orm';

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
  try {
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
export async function resolvePaperTrade(tradeId: number, currentPrice: number) {
  try {
    const [trade] = await db.select().from(paperTrades).where(eq(paperTrades.id, tradeId));
    if (!trade || trade.outcome !== 'pending') return;

    const now = new Date();
    const ageHours = (now.getTime() - trade.createdAt.getTime()) / (1000 * 60 * 60);

    // Update price snapshots
    const updates: any = {};
    if (ageHours >= 1 && !trade.priceAt1h) updates.priceAt1h = currentPrice;
    if (ageHours >= 4 && !trade.priceAt4h) updates.priceAt4h = currentPrice;
    if (ageHours >= 24 && !trade.priceAt24h) {
      updates.priceAt24h = currentPrice;

      // Determine outcome at 24h
      const entry = trade.entryPrice;
      const priceDiff = trade.direction === 'BUY'
        ? currentPrice - entry
        : entry - currentPrice;

      const pnlPips = Math.round(priceDiff * 10000) / 10; // forex pips approx
      const pnlPercent = (priceDiff / entry) * 100;

      let outcome: 'win' | 'loss' | 'breakeven' = 'breakeven';
      if (trade.takeProfit && trade.stopLoss) {
        const tpDist = Math.abs(trade.takeProfit - entry);
        const slDist = Math.abs(trade.stopLoss - entry);
        if (priceDiff >= tpDist * 0.5) outcome = 'win';
        else if (priceDiff <= -slDist * 0.5) outcome = 'loss';
      } else {
        if (pnlPips > 5) outcome = 'win';
        else if (pnlPips < -5) outcome = 'loss';
      }

      updates.outcome = outcome;
      updates.pnlPips = pnlPips;
      updates.pnlPercent = pnlPercent;
      updates.resolvedAt = now;

      console.log(`[PaperTrade] Resolved #${tradeId} — ${trade.symbol} ${trade.direction}: ${outcome.toUpperCase()} (${pnlPips > 0 ? '+' : ''}${pnlPips} pips)`);
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
