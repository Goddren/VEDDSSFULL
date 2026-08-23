// Boot-time migration for Kraken (read-only) wallet connections. The API secret
// is stored AES-encrypted in encrypted_api_secret (never plaintext).

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "kraken_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "api_key" text NOT NULL,
  "encrypted_api_secret" text NOT NULL,
  "label" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_connected_at" timestamp,
  "last_error" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "idx_kraken_connections_user" ON "kraken_connections" ("user_id");
`;

export async function ensureKrakenTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Kraken connections table ensured (kraken_connections) — read-only wallet balances.');
  } catch (err: any) {
    console.error('[startup] ensureKrakenTables failed (non-fatal):', err?.message ?? err);
  }
}
