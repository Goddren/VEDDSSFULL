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
  } catch (err: any) {
    console.error('[startup] ensureKalshiEngineConfigTable failed (non-fatal):', err?.message ?? err);
  }
}
