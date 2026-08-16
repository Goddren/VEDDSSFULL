// Idempotent boot-time migration for the durable Kalshi engine config mirror.
// Same CREATE TABLE IF NOT EXISTS pattern used by every other ensure-*.ts
// file this session.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "kalshi_engine_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "config" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
`;

export async function ensureKalshiEngineConfigTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Kalshi engine config table ensured (kalshi_engine_configs) — coin selection/strategy/risk settings now survive restarts.');

    // One-time value migration: the old default minValueScore=8 was too strict and
    // stopped accounts from finding any qualifying bracket ("below threshold" / "no
    // positive-edge bracket"). Lower any persisted 8 → 5 (the new default) so existing
    // accounts resume trading without manually editing the /kalshi hub setting.
    // Idempotent: only rows still sitting at the old 8 are touched.
    try {
      const res = await pool.query(
        `UPDATE "kalshi_engine_configs"
            SET "config" = jsonb_set("config", '{minValueScore}', '5'::jsonb),
                "updated_at" = now()
          WHERE ("config"->>'minValueScore') = '8'`
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`[startup] Kalshi minValueScore migration: lowered ${res.rowCount} persisted config(s) from 8 → 5 (old over-strict default).`);
      }
    } catch (mErr: any) {
      console.error('[startup] Kalshi minValueScore migration failed (non-fatal):', mErr?.message ?? mErr);
    }

    // One-time protections migration: turn ON the brain gating (hard-blocks
    // proven-losing setups) and Ruin Guard (daily-loss/drawdown circuit breaker)
    // for existing accounts — they were built but shipped OFF, so bad setups were
    // never blocked. Runs ONCE per config (protectionsMigrated marker) so it never
    // fights a user who later turns a protection back off in the /kalshi hub.
    try {
      const res = await pool.query(
        `UPDATE "kalshi_engine_configs"
            SET "config" = "config" || '{"kalshiBrainGating":true,"ruinGuardEnabled":true,"protectionsMigrated":true}'::jsonb,
                "updated_at" = now()
          WHERE ("config"->>'protectionsMigrated') IS NULL`
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`[startup] Kalshi protections migration: enabled brain gating + Ruin Guard on ${res.rowCount} existing config(s).`);
      }
    } catch (pErr: any) {
      console.error('[startup] Kalshi protections migration failed (non-fatal):', pErr?.message ?? pErr);
    }

    // One-time daily-trade-cap migration: give existing accounts a 10 trades/UTC-day
    // throttle (overtrading was multiplying losers). Separate marker so it applies
    // regardless of the protections marker, and only once.
    try {
      const res = await pool.query(
        `UPDATE "kalshi_engine_configs"
            SET "config" = "config" || '{"maxTradesPerDay":10,"tradeCapMigrated":true}'::jsonb,
                "updated_at" = now()
          WHERE ("config"->>'tradeCapMigrated') IS NULL`
      );
      if (res.rowCount && res.rowCount > 0) {
        console.log(`[startup] Kalshi trade-cap migration: set maxTradesPerDay=10 on ${res.rowCount} existing config(s).`);
      }
    } catch (cErr: any) {
      console.error('[startup] Kalshi trade-cap migration failed (non-fatal):', cErr?.message ?? cErr);
    }
  } catch (err: any) {
    console.error('[startup] ensureKalshiEngineConfigTable failed (non-fatal):', err?.message ?? err);
  }
}
