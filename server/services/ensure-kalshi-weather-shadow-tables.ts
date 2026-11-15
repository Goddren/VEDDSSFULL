// ─────────────────────────────────────────────────────────────────────────────
// Kalshi WEATHER ensemble SHADOW lane tables (2026-11-15).
// Modeled on ensure-kalshi-perp-shadow-tables.ts (trades + context pair).
// Binary-contract shape instead of perp shape: a shadow position is a YES
// buy at an ask in cents on one KXHIGH bucket; it resolves once, at Kalshi
// settlement, to 100 (YES) or 0 (NO). return_pct is NET of the stamped
// placeholder Kalshi taker-fee estimate; r_multiple = return_pct / 100
// (the whole stake is the unit of risk on a binary bought outright).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

let _ensured: Promise<void> | null = null;
export function ensureKalshiWeatherShadowTables(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS kalshi_weather_shadow_trades (
      id serial PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL DEFAULT 'weather_ensemble',
      city_code text NOT NULL, city_name text NOT NULL, series_ticker text NOT NULL,
      event_ticker text NOT NULL, ticker text NOT NULL, subtitle text,
      strike_type text, target_date text NOT NULL,
      direction text NOT NULL DEFAULT 'LONG',
      entry_price_cents int NOT NULL, entry_bid_cents int, entry_ask_cents int,
      model_prob_pct double precision NOT NULL, edge_cents double precision NOT NULL,
      confidence int, contracts double precision NOT NULL, notional_usd double precision NOT NULL,
      fee_pct double precision NOT NULL DEFAULT 0, cost_model text NOT NULL DEFAULT 'placeholder',
      status text NOT NULL DEFAULT 'open',
      result text, exit_price_cents int, exit_reason text,
      gross_return_pct double precision, return_pct double precision, r_multiple double precision,
      exclude_from_stats boolean NOT NULL DEFAULT false,
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz)`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_weather_shadow_trades_user_status ON kalshi_weather_shadow_trades (user_id, status)`))
      .then(() => pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS kalshi_weather_shadow_trades_open_uniq ON kalshi_weather_shadow_trades (user_id, ticker) WHERE status='open'`))
      .then(() => pool.query(`CREATE TABLE IF NOT EXISTS kalshi_weather_shadow_context (
      trade_id int PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL DEFAULT 'weather_ensemble',
      city_code text NOT NULL, ticker text NOT NULL,
      gfs_members int, ecmwf_members int, total_members int,
      ensemble_median_f double precision, ensemble_mean_f double precision,
      nws_forecast_high_f double precision, nws_agrees boolean,
      model_prob_pct double precision, market_ask_cents int, edge_cents double precision,
      spread_cents int, hour_utc int,
      closed_at timestamptz, exit_reason text, hold_minutes double precision, net_pct double precision)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}
