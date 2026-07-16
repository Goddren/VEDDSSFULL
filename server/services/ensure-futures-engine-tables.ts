// Idempotent boot-time migration creating the Futures AI Engine's persisted
// tables (futures_engine_configs, futures_engine_activity, futures_engine_trades)
// — mirrors ensure-options-engine-parity-columns.ts's pattern, but these are
// brand-new tables (the scanner previously had zero DB persistence at all).

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "futures_engine_configs" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "is_active" boolean NOT NULL DEFAULT false,
  "symbols" jsonb NOT NULL DEFAULT '["NQ","ES","GC","CL"]',
  "scan_interval_ms" integer NOT NULL DEFAULT 120000,
  "strategy_mode" text NOT NULL DEFAULT 'auto',
  "single_strategy_mode" boolean NOT NULL DEFAULT false,
  "direction_filter" text NOT NULL DEFAULT 'both',
  "max_open_trades" integer NOT NULL DEFAULT 3,
  "max_contracts_per_trade" integer NOT NULL DEFAULT 1,
  "risk_per_trade" double precision NOT NULL DEFAULT 1.0,
  "min_confidence" double precision NOT NULL DEFAULT 70,
  "weekly_profit_target" double precision NOT NULL DEFAULT 5.0,
  "account_balance" double precision NOT NULL DEFAULT 50000,
  "enable_compounding" boolean NOT NULL DEFAULT false,
  "prop_firm_mode" boolean NOT NULL DEFAULT false,
  "prop_firm_daily_drawdown_limit" double precision NOT NULL DEFAULT 2.0,
  "daily_loss_limit" double precision NOT NULL DEFAULT 3.0,
  "daily_profit_target" double precision NOT NULL DEFAULT 0,
  "max_daily_trades" integer NOT NULL DEFAULT 0,
  "execution_source" text NOT NULL DEFAULT 'auto',
  "lock_settings" boolean NOT NULL DEFAULT false,
  "ai_mode" text NOT NULL DEFAULT 'full',
  "enable_auto_execution" boolean NOT NULL DEFAULT false,
  "use_kelly_criterion" boolean NOT NULL DEFAULT false,
  "brain_learning_mode" boolean NOT NULL DEFAULT true,
  "drawdown_shield_threshold" double precision NOT NULL DEFAULT 3.0,
  "copy_mode" text NOT NULL DEFAULT 'proportional',
  "volatile_cap_mode" text NOT NULL DEFAULT 'risk_scaled',
  "trail_method" text NOT NULL DEFAULT 'none',
  "trail_activation_r" double precision NOT NULL DEFAULT 1.0,
  "trail_fixed_r" double precision NOT NULL DEFAULT 0.5,
  "trail_step_r" double precision NOT NULL DEFAULT 0.5,
  "trail_profit_lock_pct" double precision NOT NULL DEFAULT 60,
  "trail_sar_initial_af" double precision NOT NULL DEFAULT 0.02,
  "trail_sar_max_af" double precision NOT NULL DEFAULT 0.20,
  "breakeven_buffer_r" double precision NOT NULL DEFAULT 0.1,
  "prop_firm_preset" text NOT NULL DEFAULT 'CUSTOM',
  "prop_firm_allow_overnight_holds" boolean NOT NULL DEFAULT false,
  "consistency_enforcement_enabled" boolean NOT NULL DEFAULT false,
  "consistency_min_profitable_days" integer NOT NULL DEFAULT 10,
  "consistency_period_days" integer NOT NULL DEFAULT 15,
  "max_daily_profit_pct_of_total" double precision NOT NULL DEFAULT 0,
  "weekly_profit_target_is_percent" boolean NOT NULL DEFAULT true,
  "trading_days_of_week" jsonb NOT NULL DEFAULT '[1,2,3,4,5]',
  "symbol_day_schedule" jsonb NOT NULL DEFAULT '{}',
  "symbol_direction_overrides" jsonb NOT NULL DEFAULT '{}',
  "symbol_contract_overrides" jsonb NOT NULL DEFAULT '{}',
  "smart_symbol_escalation" boolean NOT NULL DEFAULT false,
  "high_confidence_override" boolean NOT NULL DEFAULT false,
  "enable_composite_autonomous" boolean NOT NULL DEFAULT false,
  "composite_min_edge_score" double precision NOT NULL DEFAULT 72,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "futures_engine_activity" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "symbol" text NOT NULL,
  "decision" text NOT NULL,
  "reasoning" text NOT NULL,
  "score" double precision,
  "price" double precision,
  "daily_change_percent" double precision,
  "source" text NOT NULL DEFAULT 'tradovate',
  "strategy" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "futures_engine_trades" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "connection_id" integer NOT NULL,
  "broker" text NOT NULL DEFAULT 'tradovate',
  "symbol" text NOT NULL,
  "strategy" text NOT NULL,
  "direction" text NOT NULL,
  "contracts" integer NOT NULL,
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
`;

export async function ensureFuturesEngineTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Futures Engine tables ensured (futures_engine_configs/activity/trades — FX-parity persisted config, trailing stops, Kelly, Brain Learning Mode, Drawdown Shield, consistency rule, scheduling).');
  } catch (err: any) {
    console.error('[startup] ensureFuturesEngineTables failed (non-fatal):', err?.message ?? err);
  }
}
