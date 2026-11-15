// ─────────────────────────────────────────────────────────────────────────────
// Kalshi SPORTS odds-benchmark SHADOW lane tables (2026-11-15).
// Modeled on ensure-kalshi-weather-shadow-tables.ts (trades + context pair)
// plus an observations table: every strictly-matched game the lane evaluates
// (traded or not) with the book's de-vigged probability next to Kalshi's
// ask — the book+Kalshi snapshot record that makes the benchmark gradeable.
//
// Binary shape: a shadow position is a YES buy at an ask in cents on one
// team's game-winner market; it resolves once, at Kalshi settlement, to 100
// (YES) or 0 (NO). return_pct is NET of the stamped placeholder Kalshi
// taker-fee estimate; r_multiple = return_pct / 100 (whole stake = 1R).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

let _ensured: Promise<void> | null = null;
export function ensureKalshiSportsShadowTables(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS kalshi_sports_shadow_trades (
      id serial PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL DEFAULT 'sports_odds_benchmark',
      league text NOT NULL, series_ticker text NOT NULL,
      event_ticker text NOT NULL, ticker text NOT NULL, team text NOT NULL, opponent text,
      direction text NOT NULL DEFAULT 'LONG',
      entry_price_cents int NOT NULL, entry_bid_cents int, entry_ask_cents int,
      book_prob_pct double precision NOT NULL, divergence_cents double precision NOT NULL,
      bookmaker text, odds_source text, confidence int,
      contracts double precision NOT NULL, notional_usd double precision NOT NULL,
      fee_pct double precision NOT NULL DEFAULT 0, cost_model text NOT NULL DEFAULT 'placeholder',
      commence_time timestamptz,
      status text NOT NULL DEFAULT 'open',
      result text, exit_price_cents int, exit_reason text,
      gross_return_pct double precision, return_pct double precision, r_multiple double precision,
      exclude_from_stats boolean NOT NULL DEFAULT false,
      opened_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz)`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_sports_shadow_trades_user_status ON kalshi_sports_shadow_trades (user_id, status)`))
      .then(() => pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS kalshi_sports_shadow_trades_open_uniq ON kalshi_sports_shadow_trades (user_id, ticker) WHERE status='open'`))
      .then(() => pool.query(`CREATE TABLE IF NOT EXISTS kalshi_sports_shadow_context (
      trade_id int PRIMARY KEY, user_id int NOT NULL, strategy text NOT NULL DEFAULT 'sports_odds_benchmark',
      league text NOT NULL, ticker text NOT NULL,
      book_home_price_dec double precision, book_away_price_dec double precision,
      book_prob_pct double precision, market_ask_cents int, divergence_cents double precision,
      spread_cents int, bookmaker text, odds_source text, hour_utc int,
      closed_at timestamptz, exit_reason text, hold_minutes double precision, net_pct double precision)`))
      .then(() => pool.query(`CREATE TABLE IF NOT EXISTS kalshi_sports_shadow_observations (
      id serial PRIMARY KEY, user_id int NOT NULL, league text NOT NULL,
      event_ticker text NOT NULL, market_ticker text NOT NULL, team text NOT NULL,
      book_prob_pct double precision, kalshi_ask_cents int, divergence_cents double precision,
      bookmaker text, odds_source text, commence_time timestamptz,
      captured_at timestamptz NOT NULL DEFAULT now())`))
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_sports_shadow_obs_time ON kalshi_sports_shadow_observations (captured_at)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}
