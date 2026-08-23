// Boot-time migration for Gemini (read-only) wallet connections. The API secret
// is stored AES-encrypted in encrypted_api_secret (never plaintext).

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "gemini_connections" (
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
CREATE INDEX IF NOT EXISTS "idx_gemini_connections_user" ON "gemini_connections" ("user_id");
`;

export async function ensureGeminiTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Gemini connections table ensured (gemini_connections) — read-only wallet balances.');
  } catch (err: any) {
    console.error('[startup] ensureGeminiTables failed (non-fatal):', err?.message ?? err);
  }
}
