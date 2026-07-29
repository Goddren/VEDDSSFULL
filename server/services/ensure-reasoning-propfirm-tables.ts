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

-- TEMP read-only diagnostic: one row per MT5 chart-data POST that reaches the
-- second-opinion region, capturing exactly where the flow stops (signal gate /
-- vision-enabled / AI call fired / returned / errored). No trades triggered.
-- Remove after diagnosing why ai_confirmation_outcomes records nothing.
CREATE TABLE IF NOT EXISTS "mt5_confirm_diag" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer,
  "symbol" text,
  "timeframe" text,
  "signal" text,
  "confidence" real,
  "gate_passed" boolean,
  "vision_enabled" boolean,
  "stage" text,
  "decision" text,
  "model" text,
  "err" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
ALTER TABLE "mt5_confirm_diag" ADD COLUMN IF NOT EXISTS "buy_votes" real;
ALTER TABLE "mt5_confirm_diag" ADD COLUMN IF NOT EXISTS "sell_votes" real;
ALTER TABLE "mt5_confirm_diag" ADD COLUMN IF NOT EXISTS "neutral_reason" text;

-- Per-account FTMO-style consistency cap (null = platform default 20%).
ALTER TABLE "tradelocker_connections" ADD COLUMN IF NOT EXISTS "consistency_threshold_pct" double precision;
-- Per-account opt-out — some prop firms don't enforce a consistency rule.
ALTER TABLE "tradelocker_connections" ADD COLUMN IF NOT EXISTS "consistency_enabled" boolean NOT NULL DEFAULT true;

-- Durable daily realized-P&L ledger — replaces the in-memory-only
-- challengeDailyPnL map (wiped on every deploy/restart) as the source of truth
-- for the consistency ratio (today's profit / total profit).
CREATE TABLE IF NOT EXISTS "prop_firm_daily_pnl" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "connection_id" integer NOT NULL,
  "connection_type" text NOT NULL DEFAULT 'tradelocker',
  "trade_date" text NOT NULL,
  "realized_pnl" double precision NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("connection_id", "connection_type", "trade_date")
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
