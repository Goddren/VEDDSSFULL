// Micro Growth's "doubling challenge" — durable per-user milestone tracker.
// See shared/schema.ts's microGrowthMilestones comment for why this is a pure
// goal-tracking layer (not a martingale sizing scheme): risk per trade stays
// governed by the existing MICRO_TIERS lot-size table the whole time.

import { pool } from '../db';

export interface DoublingStatus {
  startingBalance: number;
  currentMilestoneBase: number;
  targetBalance: number;
  currentBalance: number;
  progressPct: number;
  doublingsCompleted: number;
  justCompletedDoubling: boolean;
  lastMilestoneHitAt: string | null;
}

/**
 * Reads (initializing on first call) and advances this user's doubling
 * challenge against their current balance. Crossing the target (2x the
 * current milestone base) locks in a completed doubling and rolls the base
 * forward to that target, so the next leg is toward 4x the original start.
 */
export async function getOrAdvanceDoublingStatus(userId: number, currentBalance: number): Promise<DoublingStatus> {
  const { rows } = await pool.query(
    `SELECT starting_balance, current_milestone_base, doublings_completed, last_milestone_hit_at
     FROM micro_growth_milestones WHERE user_id = $1`,
    [userId]
  );

  let startingBalance: number;
  let currentMilestoneBase: number;
  let doublingsCompleted: number;
  let lastMilestoneHitAt: string | null;
  let justCompletedDoubling = false;

  if (rows.length === 0) {
    // First time this user has checked their doubling status — anchor the
    // challenge to whatever balance they're looking at right now.
    startingBalance = currentBalance;
    currentMilestoneBase = currentBalance;
    doublingsCompleted = 0;
    lastMilestoneHitAt = null;
    await pool.query(
      `INSERT INTO micro_growth_milestones (user_id, starting_balance, current_milestone_base, doublings_completed)
       VALUES ($1, $2, $3, 0)`,
      [userId, startingBalance, currentMilestoneBase]
    );
  } else {
    const row = rows[0];
    startingBalance = Number(row.starting_balance);
    currentMilestoneBase = Number(row.current_milestone_base);
    doublingsCompleted = row.doublings_completed;
    lastMilestoneHitAt = row.last_milestone_hit_at;

    // Roll forward through every doubling the balance has actually cleared —
    // handles a big jump (e.g. checking back after a strong week) correctly
    // instead of only ever advancing one milestone at a time.
    while (currentBalance >= currentMilestoneBase * 2) {
      currentMilestoneBase *= 2;
      doublingsCompleted += 1;
      justCompletedDoubling = true;
    }

    if (justCompletedDoubling) {
      lastMilestoneHitAt = new Date().toISOString();
      await pool.query(
        `UPDATE micro_growth_milestones
         SET current_milestone_base = $1, doublings_completed = $2, last_milestone_hit_at = now(), updated_at = now()
         WHERE user_id = $3`,
        [currentMilestoneBase, doublingsCompleted, userId]
      );
    }
  }

  const targetBalance = currentMilestoneBase * 2;
  const progressPct = Math.max(0, Math.min(100, Math.round(((currentBalance - currentMilestoneBase) / (targetBalance - currentMilestoneBase)) * 100)));

  return {
    startingBalance, currentMilestoneBase, targetBalance, currentBalance,
    progressPct, doublingsCompleted, justCompletedDoubling, lastMilestoneHitAt,
  };
}

/** Restart the challenge from a new starting balance (e.g. after a withdrawal or deliberate reset). */
export async function resetDoublingChallenge(userId: number, newStartingBalance: number): Promise<void> {
  await pool.query(
    `INSERT INTO micro_growth_milestones (user_id, starting_balance, current_milestone_base, doublings_completed, last_milestone_hit_at)
     VALUES ($1, $2, $2, 0, NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       starting_balance = $2, current_milestone_base = $2, doublings_completed = 0, last_milestone_hit_at = NULL, updated_at = now()`,
    [userId, newStartingBalance]
  );
}
