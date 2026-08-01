// Idempotent boot-time migration for durable Micro Growth session history.
// Same CREATE TABLE IF NOT EXISTS pattern used by every other ensure-*.ts
// file this session.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "micro_growth_sessions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "started_at" timestamp NOT NULL,
  "duration_ms" integer NOT NULL,
  "tier" integer NOT NULL,
  "lot_size" double precision NOT NULL,
  "max_trades" integer NOT NULL,
  "pip_target" integer NOT NULL,
  "sl_pips" integer NOT NULL,
  "pairs" jsonb NOT NULL DEFAULT '[]',
  "weekend_crypto_mode" boolean NOT NULL DEFAULT false,
  "status" text NOT NULL DEFAULT 'active',
  "trades_count" integer NOT NULL DEFAULT 0,
  "pips_gained" double precision NOT NULL DEFAULT 0,
  "pnl" double precision NOT NULL DEFAULT 0,
  "completed_at" timestamp
);
CREATE INDEX IF NOT EXISTS "micro_growth_sessions_user_status_idx" ON "micro_growth_sessions" ("user_id", "status");
`;

export async function ensureMicroGrowthSessionsTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Micro Growth sessions table ensured (micro_growth_sessions) — session history now survives restarts.');
  } catch (err: any) {
    console.error('[startup] ensureMicroGrowthSessionsTable failed (non-fatal):', err?.message ?? err);
  }
}
