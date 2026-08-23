// Idempotent boot-time migration for the Crypto.com engine's self-learning
// brain feature store (mirrors kalshi_brain_outcomes / options_brain_outcomes).
// One durable row per closed trade so the brain relearns across restarts.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "crypto_brain_outcomes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "symbol" text NOT NULL,
  "strategy" text NOT NULL,
  "direction" text NOT NULL,
  "entry_confidence" double precision,
  "return_pct" double precision,
  "hour_utc" integer,
  "holding_minutes" integer,
  "exit_reason" text,
  "result" text NOT NULL,
  "profit_loss" double precision NOT NULL DEFAULT 0,
  "source" text NOT NULL DEFAULT 'live',
  "closed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_crypto_brain_outcomes_user_symbol" ON "crypto_brain_outcomes" ("user_id", "symbol");
`;

export async function ensureCryptoBrainTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Crypto brain feature store ensured (crypto_brain_outcomes) — per-trade learning now durable.');
  } catch (err: any) {
    console.error('[startup] ensureCryptoBrainTable failed (non-fatal):', err?.message ?? err);
  }
}
