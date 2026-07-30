// Idempotent boot-time migration for the durable Dual-Vote Consensus feed.
// Same CREATE TABLE IF NOT EXISTS pattern used by every other ensure-*.ts
// file this session. Without this table, the Options/Crypto.com engines'
// consensus panels live only in an in-memory Record<userId, entry[]> that's
// wiped on every server restart/deploy, showing "No signals processed yet"
// until the next scan cycle happens to run.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "engine_consensus_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "engine" text NOT NULL,
  "symbol" text NOT NULL,
  "strategy" text NOT NULL,
  "quant_verdict" text NOT NULL,
  "quant_score" double precision NOT NULL DEFAULT 0,
  "ai_verdict" text NOT NULL,
  "ai_confidence" double precision NOT NULL DEFAULT 0,
  "ai_reasoning" text NOT NULL DEFAULT '',
  "consensus" text NOT NULL,
  "trade_allowed" boolean NOT NULL DEFAULT false,
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("user_id", "engine", "symbol")
);
`;

export async function ensureEngineConsensusTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Engine consensus table ensured (engine_consensus_log) — Dual-Vote Consensus panels now survive restarts.');
  } catch (err: any) {
    console.error('[startup] ensureEngineConsensusTable failed (non-fatal):', err?.message ?? err);
  }
}
