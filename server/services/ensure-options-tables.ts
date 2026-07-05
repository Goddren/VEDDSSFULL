// Idempotent boot-time migration for the Options AI Engine + Crypto.com tables.
// Runs CREATE TABLE IF NOT EXISTS on startup so a fresh deploy self-provisions
// these tables without an interactive `drizzle-kit push`. Safe to run every boot.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "alpaca_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "api_key_id" text NOT NULL,
  "encrypted_api_secret" text NOT NULL,
  "account_type" text NOT NULL DEFAULT 'paper',
  "is_active" boolean NOT NULL DEFAULT true,
  "auto_execute" boolean NOT NULL DEFAULT false,
  "account_id" text,
  "last_connected_at" timestamp,
  "last_error" text,
  "trade_count" integer NOT NULL DEFAULT 0,
  "use_risk_percent" boolean NOT NULL DEFAULT true,
  "risk_percent" double precision NOT NULL DEFAULT 1.0,
  "is_prop_firm_account" boolean NOT NULL DEFAULT false,
  "prop_firm_name" text,
  "prop_firm_account_size" double precision,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "tastytrade_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "username" text NOT NULL,
  "encrypted_password" text NOT NULL,
  "account_type" text NOT NULL DEFAULT 'sandbox',
  "is_active" boolean NOT NULL DEFAULT true,
  "auto_execute" boolean NOT NULL DEFAULT false,
  "account_number" text,
  "session_token" text,
  "token_expires_at" timestamp,
  "last_connected_at" timestamp,
  "last_error" text,
  "trade_count" integer NOT NULL DEFAULT 0,
  "use_risk_percent" boolean NOT NULL DEFAULT true,
  "risk_percent" double precision NOT NULL DEFAULT 1.0,
  "is_prop_firm_account" boolean NOT NULL DEFAULT false,
  "prop_firm_name" text,
  "prop_firm_account_size" double precision,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "cryptocom_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "api_key" text NOT NULL,
  "encrypted_api_secret" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "auto_execute" boolean NOT NULL DEFAULT false,
  "instrument_type" text NOT NULL DEFAULT 'perpetual',
  "use_risk_percent" boolean NOT NULL DEFAULT true,
  "risk_percent" double precision NOT NULL DEFAULT 1.0,
  "last_connected_at" timestamp,
  "last_error" text,
  "trade_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "options_engine_configs" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "is_active" boolean NOT NULL DEFAULT false,
  "symbols" jsonb NOT NULL DEFAULT '["SPY","QQQ","AAPL","TSLA","NVDA"]',
  "scan_interval_ms" integer NOT NULL DEFAULT 60000,
  "strategy_mode" text NOT NULL DEFAULT 'auto',
  "direction_filter" text NOT NULL DEFAULT 'both',
  "max_open_positions" integer NOT NULL DEFAULT 3,
  "max_contracts_per_trade" integer NOT NULL DEFAULT 1,
  "risk_per_trade" double precision NOT NULL DEFAULT 1.0,
  "min_confidence" double precision NOT NULL DEFAULT 70,
  "weekly_profit_target" double precision NOT NULL DEFAULT 5.0,
  "account_balance" double precision NOT NULL DEFAULT 0,
  "enable_compounding" boolean NOT NULL DEFAULT false,
  "prop_firm_mode" boolean NOT NULL DEFAULT false,
  "prop_firm_daily_drawdown_limit" double precision NOT NULL DEFAULT 4.0,
  "daily_loss_limit" double precision NOT NULL DEFAULT 5.0,
  "daily_profit_target" double precision NOT NULL DEFAULT 0,
  "max_daily_trades" integer NOT NULL DEFAULT 0,
  "execution_source" text NOT NULL DEFAULT 'auto',
  "lock_settings" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE TABLE IF NOT EXISTS "options_engine_activity" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "symbol" text NOT NULL,
  "decision" text NOT NULL,
  "reasoning" text NOT NULL,
  "score" double precision,
  "price" double precision,
  "daily_change_percent" double precision,
  "source" text NOT NULL DEFAULT 'alpaca',
  "created_at" timestamp DEFAULT now() NOT NULL
);
`;

export async function ensureOptionsTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Options-engine broker tables ensured (alpaca/tastytrade/cryptocom/options_engine_configs/options_engine_activity).');
  } catch (err: any) {
    console.error('[startup] ensureOptionsTables failed (non-fatal):', err?.message ?? err);
  }
}
