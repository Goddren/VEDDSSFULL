// Idempotent boot-time migration adding FX SS AI Engine parity columns to
// options_engine_configs — trailing stops, Drawdown Shield, Kelly Criterion,
// Brain Learning Mode, prop-firm presets + consistency rule, Copy Mode,
// Volatile Cap, Goal Tracker, scheduling, and AI intelligence extras. Same
// ADD COLUMN IF NOT EXISTS pattern used by every other ensure-*.ts file.

import { pool } from '../db';

const DDL = `
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "ai_mode" text NOT NULL DEFAULT 'full';
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "use_kelly_criterion" boolean NOT NULL DEFAULT false;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "brain_learning_mode" boolean NOT NULL DEFAULT true;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "drawdown_shield_threshold" double precision NOT NULL DEFAULT 3.0;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "copy_mode" text NOT NULL DEFAULT 'proportional';
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "volatile_cap_mode" text NOT NULL DEFAULT 'risk_scaled';

ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trail_method" text NOT NULL DEFAULT 'none';
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trail_activation_pct" double precision NOT NULL DEFAULT 20;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trail_fixed_pct" double precision NOT NULL DEFAULT 15;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trail_step_pct" double precision NOT NULL DEFAULT 10;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trail_profit_lock_pct" double precision NOT NULL DEFAULT 60;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trail_sar_initial_af" double precision NOT NULL DEFAULT 0.02;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trail_sar_max_af" double precision NOT NULL DEFAULT 0.20;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "breakeven_buffer_pct" double precision NOT NULL DEFAULT 10;

ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "prop_firm_preset" text NOT NULL DEFAULT 'CUSTOM';
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "prop_firm_allow_overnight_holds" boolean NOT NULL DEFAULT true;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "consistency_enforcement_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "consistency_min_profitable_days" integer NOT NULL DEFAULT 10;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "consistency_period_days" integer NOT NULL DEFAULT 15;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "max_daily_profit_pct_of_total" double precision NOT NULL DEFAULT 0;

ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "weekly_profit_target_is_percent" boolean NOT NULL DEFAULT true;

ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "trading_days_of_week" jsonb NOT NULL DEFAULT '[1,2,3,4,5]';
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "symbol_day_schedule" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "symbol_direction_overrides" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "symbol_contract_overrides" jsonb NOT NULL DEFAULT '{}';

ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "smart_symbol_escalation" boolean NOT NULL DEFAULT false;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "high_confidence_override" boolean NOT NULL DEFAULT false;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "enable_composite_autonomous" boolean NOT NULL DEFAULT false;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "composite_min_edge_score" double precision NOT NULL DEFAULT 72;

ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "peak_pnl_percent" double precision NOT NULL DEFAULT 0;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "trail_armed" boolean NOT NULL DEFAULT false;

ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "max_spread_pct" double precision NOT NULL DEFAULT 8;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "min_open_interest" integer NOT NULL DEFAULT 50;

ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "entry_confidence" double precision;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "dte" integer;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "iv_at_entry" double precision;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "underlying_price_at_entry" double precision;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "bid_ask_spread_pct" double precision;

-- Premium-selling (defined-risk credit spread) mode
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_short_delta" double precision NOT NULL DEFAULT 0.16;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_width_dollars" double precision NOT NULL DEFAULT 5;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_dte" integer NOT NULL DEFAULT 35;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_dte_min" integer NOT NULL DEFAULT 25;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_dte_max" integer NOT NULL DEFAULT 50;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_min_iv" double precision NOT NULL DEFAULT 0.25;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_profit_take_pct" double precision NOT NULL DEFAULT 50;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_stop_multiple" double precision NOT NULL DEFAULT 2;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_risk_pct" double precision NOT NULL DEFAULT 2;
ALTER TABLE "options_engine_configs" ADD COLUMN IF NOT EXISTS "credit_spread_min_credit_pct" double precision NOT NULL DEFAULT 20;

ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "spread_type" text;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "long_leg_symbol" text;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "net_credit" double precision;
ALTER TABLE "options_engine_trades" ADD COLUMN IF NOT EXISTS "max_loss_per_spread" double precision;
`;

export async function ensureOptionsEngineParityColumns(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Options Engine FX-parity columns ensured (trailing stops, Drawdown Shield, Kelly, Brain Learning Mode, prop-firm presets + consistency rule, Copy Mode, Volatile Cap, Goal Tracker, scheduling, AI intelligence extras, liquidity filter, per-trade confidence/DTE/IV/spread).');
  } catch (err: any) {
    console.error('[startup] ensureOptionsEngineParityColumns failed (non-fatal):', err?.message ?? err);
  }
}
