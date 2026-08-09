// Monthly ambassador tier-credit stipend. Grants each ambassador their tier's
// monthlyCredits (from shared/token-rewards.ts) once per calendar month.
//
// Follows the app's setTimeout self-rescheduling scheduler pattern (no cron).
// A daily tick attempts the grant, but a per-month marker row (tier_grant_log)
// claimed via INSERT ... ON CONFLICT makes the actual payout happen EXACTLY ONCE
// per calendar month — safe across restarts and overlapping ticks (granting real
// credits twice would be a liability).

import { db, pool } from '../db';
import { referrals } from '../../shared/schema';
import { sql } from 'drizzle-orm';
import { storage } from '../storage';
import { resolveAmbassadorTier } from '../../shared/token-rewards';

let _timer: ReturnType<typeof setTimeout> | null = null;
const TICK_MS = 24 * 60 * 60 * 1000; // daily (well under setTimeout's ~24.8-day max)

async function ensureMarkerTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tier_grant_log (
      month text PRIMARY KEY,
      granted_at timestamp NOT NULL DEFAULT now(),
      ambassadors_credited integer NOT NULL DEFAULT 0
    )
  `);
}

async function grantMonthlyTierCreditsOncePerMonth(): Promise<void> {
  const now = new Date();
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;

  // Claim this month. If the row already exists, another tick/instance already
  // granted — skip. This is the idempotency guard.
  const claim = await pool.query(
    `INSERT INTO tier_grant_log(month) VALUES($1) ON CONFLICT (month) DO NOTHING RETURNING month`,
    [monthKey],
  );
  if (claim.rowCount === 0) return;

  try {
    const rows = await db.select({ referrerId: referrals.referrerId, cnt: sql<number>`count(*)` })
      .from(referrals)
      .where(sql`${referrals.status} in ('completed','credited')`)
      .groupBy(referrals.referrerId);

    let credited = 0;
    for (const r of rows) {
      const tier = resolveAmbassadorTier(Number(r.cnt));
      if (tier && tier.monthlyCredits > 0 && r.referrerId != null) {
        await storage.addReferralCredits(r.referrerId, tier.monthlyCredits);
        credited++;
      }
    }
    await pool.query(`UPDATE tier_grant_log SET ambassadors_credited = $1 WHERE month = $2`, [credited, monthKey]);
    console.log(`[TierCredits] ${monthKey}: granted monthly tier credits to ${credited} ambassador(s).`);
  } catch (e: any) {
    console.error('[TierCredits] monthly grant failed:', e?.message ?? e);
  }
}

function scheduleNext(): void {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(async () => {
    await grantMonthlyTierCreditsOncePerMonth().catch(() => {});
    scheduleNext();
  }, TICK_MS);
}

export async function startTierCreditScheduler(): Promise<void> {
  try {
    await ensureMarkerTable();
    // Attempt once shortly after boot (idempotent via the month marker), then daily.
    await grantMonthlyTierCreditsOncePerMonth().catch(() => {});
    scheduleNext();
    console.log('[TierCredits] Monthly tier-credit scheduler started (daily tick, once-per-month grant).');
  } catch (e: any) {
    console.error('[TierCredits] scheduler start failed (non-fatal):', e?.message ?? e);
  }
}
