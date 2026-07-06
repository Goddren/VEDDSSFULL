// Shared read/write for Ambassador Prime's weekly market briefing — the
// bridge between the marketing job's research (Reddit + news, aggregated
// weekly pairs across all users) and the trading engine's AI confirmation
// prompt + confidence scoring. See shared/schema.ts's ambassadorMarketBriefing
// table comment for the safety rationale on why confidenceBoost is bounded.
import { db } from '../db';
import { ambassadorMarketBriefing, type AmbassadorMarketBriefing } from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';

export interface BriefingPair {
  symbol: string;
  direction: 'BUY' | 'SELL' | 'BOTH';
  strategyIdea: string;
  confidenceBoost: number; // clamped 0-5 — see MAX_CONFIDENCE_BOOST
  mentionCount: number;
}

export const MAX_CONFIDENCE_BOOST = 5;

export function clampConfidenceBoost(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(MAX_CONFIDENCE_BOOST, Math.round(n)));
}

// Monday of the current UTC week, as YYYY-MM-DD — the natural cadence for a
// "this week's pairs" briefing regardless of which day Ambassador Prime runs.
export function currentWeekStartDate(now: Date = new Date()): string {
  const d = new Date(now);
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d.toISOString().split('T')[0];
}

export async function saveMarketBriefing(weekStartDate: string, narrativeText: string, pairs: BriefingPair[]): Promise<void> {
  const safePairs = pairs.map(p => ({ ...p, confidenceBoost: clampConfidenceBoost(p.confidenceBoost) }));
  await db.insert(ambassadorMarketBriefing)
    .values({ weekStartDate, narrativeText, pairs: safePairs })
    .onConflictDoUpdate({
      target: ambassadorMarketBriefing.weekStartDate,
      set: { narrativeText, pairs: safePairs },
    });
}

export async function getLatestMarketBriefing(): Promise<AmbassadorMarketBriefing | undefined> {
  const [row] = await db.select().from(ambassadorMarketBriefing)
    .orderBy(desc(ambassadorMarketBriefing.weekStartDate)).limit(1);
  return row;
}

// Look up this symbol's briefing entry (normalizes "/" and case), if any.
export function findBriefingPair(briefing: AmbassadorMarketBriefing | undefined, symbol: string): BriefingPair | null {
  if (!briefing) return null;
  const norm = symbol.toUpperCase().replace('/', '');
  const pairs = (briefing.pairs as any[]) || [];
  const match = pairs.find((p: any) => (p.symbol || '').toUpperCase().replace('/', '') === norm);
  return match ?? null;
}
