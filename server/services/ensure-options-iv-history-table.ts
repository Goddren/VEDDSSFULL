// Idempotent boot-time migration for the options IV-history table. The engine
// has no external historical-IV feed, so it BUILDS its own: one ATM implied-vol
// snapshot per underlying per day, captured whenever a chain is fetched. IV Rank
// is then computed from the trailing ~1 year of these rows (current IV's position
// between its 1yr min and max). Until enough history accrues the premium-selling
// gate falls back to an absolute IV floor. Safe to run every boot.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "options_iv_history" (
  "id" serial PRIMARY KEY NOT NULL,
  "underlying_symbol" text NOT NULL,
  "iv" double precision NOT NULL,
  "observed_date" date NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "options_iv_history_symbol_date_unique" UNIQUE ("underlying_symbol", "observed_date")
);
CREATE INDEX IF NOT EXISTS "idx_options_iv_history_symbol_date" ON "options_iv_history" ("underlying_symbol", "observed_date");
`;

export async function ensureOptionsIvHistoryTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Options IV-history table ensured (options_iv_history) — IV Rank now self-builds from daily ATM IV snapshots.');
  } catch (err: any) {
    console.error('[startup] ensureOptionsIvHistoryTable failed (non-fatal):', err?.message ?? err);
  }
}
