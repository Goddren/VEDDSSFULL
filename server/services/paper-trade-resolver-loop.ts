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
import type { OHLCVBar } from '../market-data/types';
import { resolvePaperTrade } from './paper-trade-tracker';

const POLL_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

async function pollOnce(): Promise<void> {
  const pending = await db.select().from(paperTrades).where(eq(paperTrades.outcome, 'pending'));
  if (pending.length === 0) return;

  // One bar fetch per unique symbol, reused across all pending trades on that
  // symbol, so a trade can resolve on whichever of its stop and target was hit
  // first. Each 10-minute poll re-checks the last ~5h, so hits are only missed
  // if the server was down for longer than that.
  // The market-data cache is keyed without the limit, so whatever this asks for
  // is what the engine's ORB scan (live-trading-engine.ts, 5m × 60, needs ≥ 6)
  // gets back from the cache too. Keep it at 60: the old limit of 2 could
  // starve that scan.
  const uniqueSymbols = Array.from(new Set(pending.map(t => t.symbol)));
  const barsBySymbol = new Map<string, OHLCVBar[]>();

  for (const symbol of uniqueSymbols) {
    try {
      const assetType = marketDataService.detectAssetType(symbol);
      const result = await marketDataService.fetchMarketData({ symbol, assetType, timeframe: '5m', limit: 60 });
      if (result.bars?.length) barsBySymbol.set(symbol, result.bars);
    } catch (e: any) {
      console.error(`[paper-trade-resolver] Price fetch failed for ${symbol} (non-fatal):`, e.message);
    }
  }

  for (const trade of pending) {
    const bars = barsBySymbol.get(trade.symbol);
    if (!bars) continue;
    await resolvePaperTrade(trade.id, bars[bars.length - 1].close, bars);
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
