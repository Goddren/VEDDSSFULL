// Idempotent boot-time migration for the FX engine's self-learning feature store
// (mirrors kalshi_brain_outcomes / options_brain_outcomes / crypto_brain_outcomes).
//
// WHY THIS EXISTS: every other engine had a durable per-trade feature store and
// FX — the engine with the most money on it — did not. It relied on
// ai_confirmation_outcomes, where of 1,202 closed rows only 3 carried the setup
// that produced them. The system could learn "GBPJPY loses" but never "GBPJPY
// loses when ADX is under 20 in the Asian session", because the conditions were
// discarded at close.
//
// One row per closed FX trade, holding BOTH halves: what the setup looked like
// at entry, and what it did. That is the minimum needed to find patterns that
// repeat per pair rather than per trade.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "fx_brain_outcomes" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "symbol" text NOT NULL,
  "direction" text NOT NULL,
  "timeframe" text,

  -- WHEN: the strongest predictor in this account's history
  "hour_utc" integer,
  "session" text,
  "day_of_week" integer,

  -- SETUP: what the engine saw at entry
  "adx_value" double precision,
  "rsi_value" double precision,
  "macd_direction" text,
  "atr_value" double precision,
  "confluence_grade" text,
  "confluence_score" double precision,
  "smc_verdict" text,
  "ict_macro_valid" boolean,
  "htf_aligned" boolean,
  "ea_confidence" double precision,
  "ai_confidence" double precision,
  "strategy_mode" text,

  -- EXECUTION: plan vs reality
  "entry_price" double precision,
  "exit_price" double precision,
  "stop_loss" double precision,
  "take_profit" double precision,
  "planned_rr" double precision,
  "realised_rr" double precision,
  "lot_size" double precision,

  -- RESULT
  "result" text NOT NULL,
  "profit_loss" double precision NOT NULL DEFAULT 0,
  "profit_loss_pips" double precision,
  "holding_minutes" integer,
  "exit_reason" text,

  -- EXCURSION: the highest-value fields in any trade-outcome store, and the ones
  -- that answer the two questions this engine actually has.
  --   MAE (worst unrealised point) on WINNERS says how close the stop came to
  --       being hit — high MAE on winners means the stop is too tight, which is
  --       exactly the 20-pip/0-7-minute problem measured on 2026-09-22.
  --   MFE (best unrealised point) on LOSERS says how much open profit was handed
  --       back — high MFE on losers means exits are too late or targets too far.
  -- Together they separate "bad entry" from "bad exit", which win rate alone
  -- cannot do. Duration-to-extreme tells you the holding period that actually
  -- pays: the live book wins 93.4% on trades held over 4 hours.
  "mae_price" double precision,          -- worst adverse PRICE distance from entry
  "mfe_price" double precision,          -- best favourable PRICE distance from entry
  "mae_pnl" double precision,            -- worst unrealised P&L seen
  "mfe_pnl" double precision,            -- best unrealised P&L seen
  "minutes_to_mae" integer,
  "minutes_to_mfe" integer,
  -- EXECUTION QUALITY: a 2.7-pip adverse fill cost 18% of the planned R:R on
  -- 2026-09-23 and nothing recorded it.
  "entry_slippage" double precision,     -- signed: negative = filled worse than planned
  "planned_entry" double precision,
  "spread_at_entry" double precision,
  "commission" double precision,
  "swap" double precision,
  -- CONTEXT at entry, for regime and tilt analysis
  "equity_at_entry" double precision,
  "open_positions_at_entry" integer,
  "consecutive_losses_before" integer,
  "connection_id" integer,
  "account_id" text,
  "ticket" text,
  "source" text NOT NULL DEFAULT 'live',
  "closed_at" timestamp DEFAULT now() NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_fx_brain_user_symbol" ON "fx_brain_outcomes" ("user_id", "symbol");
CREATE INDEX IF NOT EXISTS "idx_fx_brain_closed" ON "fx_brain_outcomes" ("closed_at");
-- One row per closed position: the sync is a poller and re-reads the same close
-- on overlapping cycles, so without this a single trade would be learned twice.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_fx_brain_ticket" ON "fx_brain_outcomes" ("user_id", "ticket") WHERE "ticket" IS NOT NULL;
`;

export async function ensureFxBrainTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] FX brain feature store ensured (fx_brain_outcomes) — per-trade condition learning now durable.');
  } catch (err: any) {
    console.error('[startup] ensureFxBrainTable failed (non-fatal):', err?.message ?? err);
  }
}
