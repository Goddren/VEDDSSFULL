// Idempotent boot-time migration for the Crypto.com Perpetuals AI Engine —
// previously "Auto-execute" on cryptocom_connections was a dead toggle with
// no scanner/strategy engine behind it at all.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "cryptocom_engine_configs" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "is_active" boolean NOT NULL DEFAULT false,
  "symbols" jsonb NOT NULL DEFAULT '["BTCUSD-PERP","ETHUSD-PERP","SOLUSD-PERP"]',
  "scan_interval_ms" integer NOT NULL DEFAULT 120000,
  "strategy_mode" text NOT NULL DEFAULT 'auto',
  "direction_filter" text NOT NULL DEFAULT 'both',
  "max_open_trades" integer NOT NULL DEFAULT 3,
  "risk_per_trade" double precision NOT NULL DEFAULT 1.0,
  "min_confidence" double precision NOT NULL DEFAULT 70,
  "account_balance" double precision NOT NULL DEFAULT 1000,
  "leverage" double precision NOT NULL DEFAULT 3,
  "daily_loss_limit" double precision NOT NULL DEFAULT 5.0,
  "daily_profit_target" double precision NOT NULL DEFAULT 0,
  "max_daily_trades" integer NOT NULL DEFAULT 0,
  "lock_settings" boolean NOT NULL DEFAULT false,
  "ai_mode" text NOT NULL DEFAULT 'full',
  "enable_auto_execution" boolean NOT NULL DEFAULT false,
  "use_kelly_criterion" boolean NOT NULL DEFAULT false,
  "brain_learning_mode" boolean NOT NULL DEFAULT true,
  "drawdown_shield_threshold" double precision NOT NULL DEFAULT 3.0,
  "trail_method" text NOT NULL DEFAULT 'none',
  "trail_activation_r" double precision NOT NULL DEFAULT 1.0,
  "trail_fixed_r" double precision NOT NULL DEFAULT 0.5,
  "trail_step_r" double precision NOT NULL DEFAULT 0.5,
  "trail_profit_lock_pct" double precision NOT NULL DEFAULT 60,
  "trail_sar_initial_af" double precision NOT NULL DEFAULT 0.02,
  "trail_sar_max_af" double precision NOT NULL DEFAULT 0.20,
  "breakeven_buffer_r" double precision NOT NULL DEFAULT 0.1,
  "consistency_enforcement_enabled" boolean NOT NULL DEFAULT false,
  "consistency_min_profitable_days" integer NOT NULL DEFAULT 10,
  "consistency_period_days" integer NOT NULL DEFAULT 15,
  "max_daily_profit_pct_of_total" double precision NOT NULL DEFAULT 0,
  "smart_symbol_escalation" boolean NOT NULL DEFAULT false,
  "high_confidence_override" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cryptocom_engine_activity" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "symbol" text NOT NULL,
  "decision" text NOT NULL,
  "reasoning" text NOT NULL,
  "score" double precision,
  "price" double precision,
  "daily_change_percent" double precision,
  "source" text NOT NULL DEFAULT 'cryptocom',
  "strategy" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "cryptocom_engine_trades" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "connection_id" integer NOT NULL,
  "symbol" text NOT NULL,
  "strategy" text NOT NULL,
  "direction" text NOT NULL,
  "quantity" double precision NOT NULL,
  "entry_price" double precision NOT NULL,
  "stop_loss" double precision,
  "take_profit" double precision,
  "entry_order_id" text,
  "entry_reasoning" text,
  "status" text NOT NULL DEFAULT 'open',
  "exit_price" double precision,
  "exit_order_id" text,
  "exit_reason" text,
  "realized_pnl" double precision,
  "closed_at" timestamp,
  "peak_r_multiple" double precision NOT NULL DEFAULT 0,
  "trail_armed" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Parity columns (composite entries, self-learning brain, ruin guard)
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "enable_composite_autonomous" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "composite_min_edge_score" double precision NOT NULL DEFAULT 72;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "crypto_brain_enabled" boolean NOT NULL DEFAULT true;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "crypto_brain_gating" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "ruin_guard_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "daily_loss_limit_pct" double precision NOT NULL DEFAULT 5;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "max_drawdown_limit_pct" double precision NOT NULL DEFAULT 10;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "execution_venue" text NOT NULL DEFAULT 'cryptocom';
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_auto_trade_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_notional_usd" double precision NOT NULL DEFAULT 25;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_take_profit_pct" double precision NOT NULL DEFAULT 3;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "cefi_stop_loss_pct" double precision NOT NULL DEFAULT 2;
ALTER TABLE "cryptocom_engine_trades" ADD COLUMN IF NOT EXISTS "venue" text NOT NULL DEFAULT 'cryptocom';
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_auto_trade_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_chain" text NOT NULL DEFAULT 'base';
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_notional_usd" double precision NOT NULL DEFAULT 25;
ALTER TABLE "cryptocom_engine_configs" ADD COLUMN IF NOT EXISTS "defi_slippage_bps" integer NOT NULL DEFAULT 100;
`;

export async function ensureCryptocomEngineTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Crypto.com Engine tables ensured (cryptocom_engine_configs/activity/trades).');
  } catch (err: any) {
    console.error('[startup] ensureCryptocomEngineTables failed (non-fatal):', err?.message ?? err);
  }
}
