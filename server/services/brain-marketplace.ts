// Pricing + snapshot-stat helpers for the Brain Data Marketplace. Given a
// seller's raw ai_confirmation_outcomes rows, computes the sellable snapshot
// stats and a suggested VEDD price. See shared/schema.ts's brainDataListings
// table comment for why the snapshot is frozen at listing time.
import type { AiConfirmationOutcome } from '../../shared/schema';

export const MIN_TRADES_TO_LIST = 10;
export const MIN_PRICE_VEDD = 5;
export const MAX_PRICE_VEDD = 500;

export interface ListingStats {
  tradeCount: number;
  distinctPairs: number;
  ageDays: number;
  winRate: number | null;
  oldestTradeAt: Date;
  newestTradeAt: Date;
  suggestedPriceVedd: number;
}

export function clampPrice(n: number): number {
  if (!Number.isFinite(n)) return MIN_PRICE_VEDD;
  return Math.max(MIN_PRICE_VEDD, Math.min(MAX_PRICE_VEDD, Math.round(n)));
}

export function computeListingStats(rows: AiConfirmationOutcome[]): ListingStats {
  const tradeCount = rows.length;
  const distinctPairs = new Set(rows.map(r => (r.symbol || '').toUpperCase())).size;

  const timestamps = rows.map(r => new Date(r.confirmedAt).getTime()).filter(t => !Number.isNaN(t));
  const oldestMs = timestamps.length ? Math.min(...timestamps) : Date.now();
  const newestMs = timestamps.length ? Math.max(...timestamps) : Date.now();
  const oldestTradeAt = new Date(oldestMs);
  const newestTradeAt = new Date(newestMs);
  const ageDays = Math.max(0, Math.round((newestMs - oldestMs) / 86400000));

  const closed = rows.filter(r => r.tradeOutcome && r.tradeOutcome !== 'PENDING');
  const wins = closed.filter(r => r.tradeOutcome === 'WIN');
  const winRate = closed.length > 0 ? wins.length / closed.length : null;

  const ageMultiplier = 1 + Math.min(ageDays / 30, 2.0);
  const pairsMultiplier = 1 + Math.min(distinctPairs * 0.15, 1.5);
  const tradesMultiplier = 1 + Math.min(tradeCount / 50, 2.0);
  const winRateMultiplier = 0.5 + Math.min(winRate ?? 0.5, 1.0);

  const suggestedPriceVedd = clampPrice(5 * ageMultiplier * pairsMultiplier * tradesMultiplier * winRateMultiplier);

  return { tradeCount, distinctPairs, ageDays, winRate, oldestTradeAt, newestTradeAt, suggestedPriceVedd };
}
