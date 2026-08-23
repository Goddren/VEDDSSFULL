// Boot-time migration for connected DeFi (self-custody) wallet addresses. We
// only store the PUBLIC address a user connects via their browser wallet — never
// any private key or seed (self-custody stays in the user's wallet).

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "defi_wallets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "address" text NOT NULL,
  "label" text,
  "wallet_type" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "last_synced_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "defi_wallets_user_address_unique" UNIQUE ("user_id", "address")
);
CREATE INDEX IF NOT EXISTS "idx_defi_wallets_user" ON "defi_wallets" ("user_id");
`;

export async function ensureDefiWalletsTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] DeFi wallets table ensured (defi_wallets) — public addresses only, on-chain read-only.');
  } catch (err: any) {
    console.error('[startup] ensureDefiWalletsTable failed (non-fatal):', err?.message ?? err);
  }
}
