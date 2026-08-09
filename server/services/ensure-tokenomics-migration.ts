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

    // 2. Upsert every canonical action from the source of truth: realign existing
    //    base_amounts AND create rows that were advertised but never configured
    //    (devotional/training/etc. that previously paid 0).
    for (const [action, amount] of Object.entries(TOKEN_REWARDS)) {
      await pool.query(
        `INSERT INTO vedd_reward_config (action_type, base_amount, is_active)
         VALUES ($1, $2, true)
         ON CONFLICT (action_type) DO UPDATE SET base_amount = EXCLUDED.base_amount, updated_at = now()`,
        [action, amount],
      );
    }

    // 3. Realign subscription plan prices (old rounded cents → exact credit prices).
    await pool.query(`UPDATE subscription_plans SET price = $1 WHERE price = 5000`, [SUBSCRIPTION_PRICE_CENTS.starter]);
    await pool.query(`UPDATE subscription_plans SET price = $1 WHERE price = 15000`, [SUBSCRIPTION_PRICE_CENTS.premium]);
    await pool.query(`UPDATE subscription_plans SET price = $1 WHERE price = 100000`, [SUBSCRIPTION_PRICE_CENTS.yearly]);

    // 4. Ensure the unique index on transfer-job idempotency keys exists — the
    //    deterministic per-reward keys + onConflictDoNothing dedupe in
    //    vedd-token-service.ts depend on it to prevent double transfers. Old keys
    //    carried a timestamp so there are no duplicates to block its creation.
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "vedd_transfer_jobs_idempotency_key_uniq" ON "vedd_transfer_jobs" ("idempotency_key")`);

    console.log('[startup] Tokenomics migration applied — reward config + plan prices aligned to shared/token-rewards.ts.');
  } catch (err: any) {
    console.error('[startup] ensureTokenomicsMigration failed (non-fatal):', err?.message ?? err);
  }
}
