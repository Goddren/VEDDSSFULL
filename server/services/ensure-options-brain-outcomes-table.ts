// Idempotent boot-time migration for the Options AI Engine brain feature store.
// Same CREATE TABLE IF NOT EXISTS pattern as the other ensure-*.ts files.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "options_brain_outcomes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "underlying_symbol" text NOT NULL,
  "option_type" text NOT NULL,
  "strategy" text NOT NULL,
  "direction" text,
  "entry_confidence" double precision,
  "return_pct" double precision,
  "hour_utc" integer,
  "holding_minutes" integer,
  "exit_reason" text,
  "result" text NOT NULL,
  "profit_loss" double precision NOT NULL,
  "contracts" integer,
  "source" text NOT NULL DEFAULT 'live',
  "closed_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "options_brain_outcomes_user_idx" ON "options_brain_outcomes" ("user_id");
`;

export async function ensureOptionsBrainOutcomesTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Options brain feature store ensured (options_brain_outcomes) — options brain is now durable + sellable on the marketplace.');
  } catch (err: any) {
    console.error('[startup] ensureOptionsBrainOutcomesTable failed (non-fatal):', err?.message ?? err);
  }
}
