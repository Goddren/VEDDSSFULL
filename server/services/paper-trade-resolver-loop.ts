/**
 * Background loop that resolves pending Paper Trade AI Journal entries
 * (paper-trade-tracker.ts's resolvePaperTrade) against live prices. Without
 * this loop, every paper trade sits in 'pending' forever — resolvePaperTrade
 * existed but was never called anywhere.
 */
import { db } from '../db';
import { paperTrades } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { marketDataService } from '../market-data/service';
import { resolvePaperTrade } from './paper-trade-tracker';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes — trades only resolve at 1h/4h/24h anyway

async function pollOnce(): Promise<void> {
  const pending = await db.select().from(paperTrades).where(eq(paperTrades.outcome, 'pending'));
  if (pending.length === 0) return;

  // One price lookup per unique symbol, reused across all pending trades on that symbol
  const uniqueSymbols = Array.from(new Set(pending.map(t => t.symbol)));
  const priceBySymbol = new Map<string, number>();

  for (const symbol of uniqueSymbols) {
    try {
      const assetType = marketDataService.detectAssetType(symbol);
      const result = await marketDataService.fetchMarketData({ symbol, assetType, timeframe: '5m', limit: 2 });
      const lastBar = result.bars?.[result.bars.length - 1];
      if (lastBar) priceBySymbol.set(symbol, lastBar.close);
    } catch (e: any) {
      console.error(`[paper-trade-resolver] Price fetch failed for ${symbol} (non-fatal):`, e.message);
    }
  }

  for (const trade of pending) {
    const price = priceBySymbol.get(trade.symbol);
    if (price === undefined) continue;
    await resolvePaperTrade(trade.id, price);
  }
}

export function startPaperTradeResolverLoop(): void {
  console.log(`[paper-trade-resolver] Background paper-trade resolver loop started (${POLL_INTERVAL_MS / 60000}min interval).`);
  setInterval(() => {
    pollOnce().catch(e => console.error('[paper-trade-resolver] Poll error:', e.message));
  }, POLL_INTERVAL_MS);
  // Run once shortly after boot too, so pending trades don't wait a full interval
  setTimeout(() => {
    pollOnce().catch(e => console.error('[paper-trade-resolver] Initial poll error:', e.message));
  }, 30_000);
}
