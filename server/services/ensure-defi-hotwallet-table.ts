// Boot migration for the DeFi auto-trade HOT WALLET. Unlike defi_wallets (public
// address only, read-only), this stores an AES-encrypted PRIVATE KEY so the
// engine can sign + broadcast swaps unattended. HIGH-RISK by nature: use a
// dedicated burner wallet funded with a small, capped amount — never a main wallet.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "defi_hot_wallets" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "address" text NOT NULL,
  "encrypted_private_key" text NOT NULL,
  "label" text,
  "chain" text NOT NULL DEFAULT 'base',
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "defi_hot_wallets_user_unique" UNIQUE ("user_id")
);
`;

export async function ensureDefiHotWalletTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] DeFi hot-wallet table ensured (defi_hot_wallets) — encrypted key for unattended swaps.');
  } catch (err: any) {
    console.error('[startup] ensureDefiHotWalletTable failed (non-fatal):', err?.message ?? err);
  }
}
