// Idempotent boot-time migration that brings EXISTING production DB rows in line
// with shared/token-rewards.ts (the single source of truth). The seed.ts edits
// only affect fresh seeds; this updates rows already in the database:
//   - renames the dead 'referral_subscribes' reward-config key to the one the
//     code actually uses ('referral_subscription'),
//   - realigns every reward-config base_amount to the canonical value,
//   - realigns subscription_plans prices to the credit prices ($49.95/$149.99/$999.99).
// Safe to run on every boot: each statement is a no-op once already applied.

import { pool } from '../db';
import { TOKEN_REWARDS, SUBSCRIPTION_PRICE_CENTS } from '../../shared/token-rewards';

export async function ensureTokenomicsMigration(): Promise<void> {
  try {
    // 1. Rename the dead key only if the target doesn't already exist.
    await pool.query(`
      UPDATE vedd_reward_config SET action_type = 'referral_subscription'
      WHERE action_type = 'referral_subscribes'
        AND NOT EXISTS (SELECT 1 FROM vedd_reward_config WHERE action_type = 'referral_subscription')
    `);

    // 2. Realign base_amount for every canonical action (only updates existing rows).
    const canonical: [string, number][] = [
      ['daily_post', TOKEN_REWARDS.daily_post],
      ['daily_comment', TOKEN_REWARDS.daily_comment],
      ['referral_signup', TOKEN_REWARDS.referral_signup],
      ['referral_subscription', TOKEN_REWARDS.referral_subscription],
      ['challenge_completion', TOKEN_REWARDS.challenge_completion],
      ['event_hosting', TOKEN_REWARDS.event_hosting],
      ['event_attendance', TOKEN_REWARDS.event_attendance],
      ['journey_day_complete', TOKEN_REWARDS.journey_day_complete],
      ['journey_completion_bonus', TOKEN_REWARDS.journey_completion_bonus],
      ['referral_profit_share', TOKEN_REWARDS.referral_profit_share],
      ['wear_to_earn', TOKEN_REWARDS.wear_to_earn],
    ];
    for (const [action, amount] of canonical) {
      await pool.query(
        `UPDATE vedd_reward_config SET base_amount = $1, updated_at = now() WHERE action_type = $2 AND base_amount <> $1`,
        [amount, action],
      );
    }

    // 3. Realign subscription plan prices (old rounded cents → exact credit prices).
    await pool.query(`UPDATE subscription_plans SET price = $1 WHERE price = 5000`, [SUBSCRIPTION_PRICE_CENTS.starter]);
    await pool.query(`UPDATE subscription_plans SET price = $1 WHERE price = 15000`, [SUBSCRIPTION_PRICE_CENTS.premium]);
    await pool.query(`UPDATE subscription_plans SET price = $1 WHERE price = 100000`, [SUBSCRIPTION_PRICE_CENTS.yearly]);

    console.log('[startup] Tokenomics migration applied — reward config + plan prices aligned to shared/token-rewards.ts.');
  } catch (err: any) {
    console.error('[startup] ensureTokenomicsMigration failed (non-fatal):', err?.message ?? err);
  }
}
