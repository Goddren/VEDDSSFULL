// Idempotent boot-time migration for the Kalshi self-learning brain's per-trade
// feature store. Same CREATE TABLE IF NOT EXISTS pattern as the other
// ensure-*.ts files. Indexed by (user_id, coin) since the brain reads a user's
// history grouped by coin on every recompute.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "kalshi_brain_outcomes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "coin" text NOT NULL,
  "timeframe" text NOT NULL,
  "strategy" text NOT NULL,
  "direction" text NOT NULL,
  "strike_type" text,
  "entry_price_cents" integer,
  "confidence" double precision,
  "edge_pct" double precision,
  "value_score" double precision,
  "model_prob_pct" double precision,
  "agreement" double precision,
  "hour_utc" integer,
  "holding_minutes" integer,
  "exit_reason" text,
  "result" text NOT NULL,
  "profit_loss" double precision NOT NULL,
  "source" text NOT NULL DEFAULT 'live',
  "closed_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_kalshi_brain_outcomes_user_coin" ON "kalshi_brain_outcomes" ("user_id", "coin");
`;

export async function ensureKalshiBrainTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Kalshi brain table ensured (kalshi_brain_outcomes) — per-trade learning features now persist.');
  } catch (err: any) {
    console.error('[startup] ensureKalshiBrainTables failed (non-fatal):', err?.message ?? err);
  }
}
