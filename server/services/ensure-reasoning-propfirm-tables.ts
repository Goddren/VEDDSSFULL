// Idempotent boot-time migration for the Deep Reasoning Mode reasoning trail
// columns and the persisted prop-firm challenge phase table. Same
// CREATE/ALTER ... IF NOT EXISTS pattern used by every other ensure-*.ts file
// this session — safe to run every boot, no interactive drizzle-kit push required.

import { pool } from '../db';

const DDL = `
ALTER TABLE "ai_confirmation_outcomes" ADD COLUMN IF NOT EXISTS "reasoning_text" text;
ALTER TABLE "ai_confirmation_outcomes" ADD COLUMN IF NOT EXISTS "bull_case" text;
ALTER TABLE "ai_confirmation_outcomes" ADD COLUMN IF NOT EXISTS "bear_case" text;
ALTER TABLE "ai_confirmation_outcomes" ADD COLUMN IF NOT EXISTS "deep_reasoning_used" boolean DEFAULT false;

CREATE TABLE IF NOT EXISTS "prop_firm_account_state" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "connection_id" integer NOT NULL,
  "connection_type" text NOT NULL DEFAULT 'tradelocker',
  "phase" text NOT NULL DEFAULT 'phase1',
  "phase_start_balance" real NOT NULL,
  "profit_target" real,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("connection_id", "connection_type")
);
`;

export async function ensureReasoningPropFirmTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Reasoning + prop firm phase tables ensured (ai_confirmation_outcomes reasoning columns, prop_firm_account_state).');
  } catch (err: any) {
    console.error('[startup] ensureReasoningPropFirmTables failed (non-fatal):', err?.message ?? err);
  }
}
