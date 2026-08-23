// Boot-time migration for Coinbase (read-only) wallet connections. The EC
// private key is stored AES-encrypted in encrypted_api_secret (never plaintext).

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "coinbase_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "api_key_name" text NOT NULL,
  "encrypted_api_secret" text NOT NULL,
  "label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_connected_at" timestamp,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_coinbase_connections_user" ON "coinbase_connections" ("user_id");
`;

export async function ensureCoinbaseTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Coinbase connections table ensured (coinbase_connections) — read-only wallet balances.');
  } catch (err: any) {
    console.error('[startup] ensureCoinbaseTables failed (non-fatal):', err?.message ?? err);
  }
}
