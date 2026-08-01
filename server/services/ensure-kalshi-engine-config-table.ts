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
  } catch (err: any) {
    console.error('[startup] ensureKalshiEngineConfigTable failed (non-fatal):', err?.message ?? err);
  }
}
