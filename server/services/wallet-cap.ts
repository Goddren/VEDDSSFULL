// Capped internal-wallet crediting for the gamified earning paths (NFC tap,
// activation, daily check-in, wear-to-earn). Enforces the daily/weekly earning
// caps that previously only existed on the on-chain ambassador path — these
// paths credited the internal wallet directly and bypassed all limits, letting a
// user farm unlimited reward tokens.
//
// Owed payouts (copy-trade profit share, marketplace proceeds) must NOT use this
// — they are money owed, not farmable rewards.

import { and, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db';
import { internalWalletEarnings } from '../../shared/schema';
import { storage } from '../storage';
import { DAILY_VEDD_CAP, WEEKLY_VEDD_CAP } from '../../shared/token-rewards';

export interface CappedCreditResult {
  credited: number;   // amount actually added to the wallet (post-cap)
  requested: number;  // amount that was requested
  capped: boolean;    // true if the request was reduced by a cap
}

async function sumSince(userId: number, since: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${internalWalletEarnings.amount}), 0)` })
    .from(internalWalletEarnings)
    .where(and(eq(internalWalletEarnings.userId, userId), gte(internalWalletEarnings.createdAt, since)));
  return parseFloat(row?.total ?? '0') || 0;
}

/**
 * Credit the internal wallet, clamped to the remaining daily (UTC) and rolling
 * 7-day earning caps. Records the credited amount in the earnings ledger so
 * future cap checks stay accurate. Returns how much was actually credited.
 */
export async function creditWalletWithCap(
  userId: number,
  amount: number,
  source: string,
  isPending = false,
): Promise<CappedCreditResult> {
  const requested = Math.max(0, amount);
  if (requested === 0) return { credited: 0, requested: 0, capped: false };

  const now = new Date();
  const startOfDayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [earnedToday, earnedWeek] = await Promise.all([
    sumSince(userId, startOfDayUtc),
    sumSince(userId, sevenDaysAgo),
  ]);

  const remaining = Math.max(0, Math.min(DAILY_VEDD_CAP - earnedToday, WEEKLY_VEDD_CAP - earnedWeek));
  const credited = Math.min(requested, remaining);

  if (credited <= 0) return { credited: 0, requested, capped: true };

  await storage.addToWalletBalance(userId, credited, isPending);
  await db.insert(internalWalletEarnings).values({ userId, amount: credited, source });

  return { credited, requested, capped: credited < requested };
}
