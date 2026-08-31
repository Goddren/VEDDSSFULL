// Boot migration for DXtrade (Velotrade) platform connections on the FX SS AI
// engine. Stores host + username + AES-encrypted password + dxsca domain. No
// keys/passwords are ever returned to the client.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "dxtrade_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "host" text NOT NULL,
  "username" text NOT NULL,
  "encrypted_password" text NOT NULL,
  "domain" text NOT NULL DEFAULT 'default',
  "account_code" text,
  "label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_connected_at" timestamp,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL
);
`;

const ALTERS = `
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "auto_trade_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "use_risk_percent" boolean NOT NULL DEFAULT true;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "risk_percent" double precision NOT NULL DEFAULT 1.0;
-- Parity with tradelocker_connections: per-connection sizing + prop-firm + consistency.
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "lot_multiplier" double precision NOT NULL DEFAULT 1.0;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "is_prop_firm_account" boolean NOT NULL DEFAULT false;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "prop_firm_name" text;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "prop_firm_account_size" double precision;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "weekly_profit_target" double precision;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "consistency_enabled" boolean NOT NULL DEFAULT false;
ALTER TABLE "dxtrade_connections" ADD COLUMN IF NOT EXISTS "consistency_threshold_pct" double precision;
`;

export async function ensureDxtradeTables(): Promise<void> {
  try {
    await pool.query(DDL);
    await pool.query(ALTERS);
    console.log('[startup] DXtrade connections table ensured (dxtrade_connections).');
  } catch (err: any) {
    console.error('[startup] ensureDxtradeTables failed (non-fatal):', err?.message ?? err);
  }
}
