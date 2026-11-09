// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp SHADOW lane tables (Phase 1, 2026-11-08).
// Modeled line-for-line on crypto_shadow_trades / crypto_shadow_context
// (crypto-shadow.ts) with the perp-specific additions the recon called for:
// touch prices at entry, contracts + cost model stamping, cumulative funding,
// a funding watermark, and an exclude_from_stats flag for corporate-action
// closes (a return booked across a split/dividend is fiction, not evidence).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

let _ensured: Promise<void> | null = null;
export function ensureKalshiPerpShadowTables(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS kalshi_perp_shadow_trades (
      id serial PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL, ticker text NOT NULL, underlying text NOT NULL,
      direction text NOT NULL,
      entry_price double precision NOT NULL, entry_bid double precision, entry_ask double precision,
      stop_loss double precision NOT NULL, take_profit double precision NOT NULL,
      sl_pct double precision NOT NULL, contracts double precision NOT NULL, notional_usd double precision NOT NULL,
      cost_bps double precision NOT NULL, cost_model text NOT NULL DEFAULT 'placeholder',
      funding_accrued_usd double precision NOT NULL DEFAULT 0, funding_through_ms bigint NOT NULL DEFAULT 0,
      score real, max_hours double precision NOT NULL, status text NOT NULL DEFAULT 'open',
      exit_price double precision, exit_reason text, gross_return_pct double precision, return_pct double precision,
      r_multiple double precision, peak_gain_pct double precision, exclude_from_stats boolean NOT NULL DEFAULT false,
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz)`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_perp_shadow_trades_user_status ON kalshi_perp_shadow_trades (user_id, status)`))
      .then(() => pool.query(`CREATE TABLE IF NOT EXISTS kalshi_perp_shadow_context (
      trade_id int PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL, ticker text NOT NULL, direction text NOT NULL,
      spread_bps double precision, volume_24h_usd double precision, open_interest double precision,
      atr_pct double precision, h1_trend text, h4_trend text, htf_aligned boolean,
      funding_rate_at_entry double precision, session_et text, hour_utc int, hour_et int, day_of_week int,
      earnings_within_48h boolean, corporate_action_pending boolean, live_gate_blocked boolean,
      leverage_estimate double precision, tags text[], advice_at_entry text,
      closed_at timestamptz, exit_reason text, hold_minutes double precision, net_pct double precision, funding_paid_usd double precision)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}
