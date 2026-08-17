// Idempotent boot migration for the Ambassador Profit Split Program:
// VEDD takes a % (default 30%) of a user's prop-firm net profit INSTEAD of a
// paid subscription. Same CREATE TABLE IF NOT EXISTS pattern as the other
// ensure-*.ts files.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "profit_split_enrollments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "pct" double precision NOT NULL DEFAULT 30,
  "status" text NOT NULL DEFAULT 'active',   -- 'active' | 'ended'
  "enrolled_by" integer,                      -- recruiting ambassador's user id (nullable)
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "profit_split_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "amount" double precision NOT NULL,         -- USD collected toward what's owed
  "note" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "profit_split_payments_user_idx" ON "profit_split_payments" ("user_id");
`;

export async function ensureProfitSplitTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Profit Split tables ensured (profit_split_enrollments, profit_split_payments) — ambassador 30% prop-firm profit-split program.');
  } catch (err: any) {
    console.error('[startup] ensureProfitSplitTables failed (non-fatal):', err?.message ?? err);
  }
}
