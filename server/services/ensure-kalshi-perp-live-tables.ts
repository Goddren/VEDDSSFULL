// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp LIVE lane tables (2026-11-15).
//
// kalshi_perp_live_trades is the lane's durable position journal — one row
// per shadow position mirrored live (shadow_trade_id UNIQUE is the
// idempotency anchor: a shadow trade can be mirrored at most once, ever).
// Rows are created BEFORE the entry order is sent (status 'pending_entry')
// so a crash mid-order never loses the intent; reconciliation resolves the
// outcome against Kalshi before anything is retried.
//
// kalshi_perp_live_orders is the order-intent audit trail: every order the
// lane attempts, with the client_order_id sent (the exchange's idempotency
// key) and the classified outcome — responded / rejected / ambiguous /
// reconciled. An 'ambiguous' row is the lane's memory that an order MIGHT
// exist; it blocks any fresh order for the same intent until reconciliation
// proves what happened.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';

let _ensured: Promise<void> | null = null;
export function ensureKalshiPerpLiveTables(): Promise<void> {
  if (!_ensured) {
    _ensured = pool.query(`CREATE TABLE IF NOT EXISTS kalshi_perp_live_trades (
      id serial PRIMARY KEY, user_id int NOT NULL,
      shadow_trade_id int NOT NULL UNIQUE,
      strategy text NOT NULL, ticker text NOT NULL, underlying text NOT NULL,
      direction text NOT NULL,
      contracts double precision NOT NULL DEFAULT 0,
      entry_price double precision, stop_loss double precision NOT NULL, take_profit double precision NOT NULL,
      sl_pct double precision NOT NULL, notional_usd double precision NOT NULL DEFAULT 0,
      max_hours double precision NOT NULL,
      entry_order_id text, entry_client_order_id text,
      status text NOT NULL DEFAULT 'pending_entry',
      exit_price double precision, exit_reason text,
      gross_pnl_usd double precision, funding_usd double precision, net_pnl_usd double precision,
      return_pct double precision, r_multiple double precision,
      opened_at timestamptz, closed_at timestamptz,
      last_reconciled_at timestamptz, notes text,
      created_at timestamptz NOT NULL DEFAULT now())`)
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_perp_live_trades_user_status ON kalshi_perp_live_trades (user_id, status)`))
      .then(() => pool.query(`CREATE TABLE IF NOT EXISTS kalshi_perp_live_orders (
      id serial PRIMARY KEY, user_id int NOT NULL, live_trade_id int,
      kind text NOT NULL, client_order_id text NOT NULL UNIQUE,
      order_id text, ticker text NOT NULL, side text NOT NULL,
      count double precision NOT NULL, price double precision NOT NULL,
      status text NOT NULL DEFAULT 'sending',
      fill_count double precision, remaining_count double precision, avg_fill_price double precision,
      error text, reconcile_attempts int NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`))
      .then(() => pool.query(`CREATE INDEX IF NOT EXISTS kalshi_perp_live_orders_trade ON kalshi_perp_live_orders (live_trade_id)`))
      .then(() => undefined)
      .catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}
