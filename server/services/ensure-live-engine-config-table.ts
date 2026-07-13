// Idempotent boot-time migration creating the durable mirror of the FX SS AI
// Engine's LiveEngineConfig. Same CREATE TABLE IF NOT EXISTS pattern used by
// every other ensure-*.ts file this session. Without this table,
// propFirmMode/consistency-rule settings live only in an in-memory
// Record<userId, EngineState> and silently reset to defaults (OFF) on every
// server restart or deploy — a real risk gap for anyone relying on it for
// prop-firm compliance.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "live_engine_configs" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "config" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
`;

export async function ensureLiveEngineConfigTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Live Engine config table ensured (live_engine_configs) — propFirmMode/consistency-rule settings now survive restarts.');
  } catch (err: any) {
    console.error('[startup] ensureLiveEngineConfigTable failed (non-fatal):', err?.message ?? err);
  }
}
