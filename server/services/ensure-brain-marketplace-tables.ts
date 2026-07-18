// Idempotent boot-time migration for the Brain Data Marketplace. Mirrors the
// CREATE TABLE IF NOT EXISTS pattern used by every other ensure-*.ts file
// this session (ensure-ambassador-prime-tables.ts, ensure-blog-tables.ts) —
// safe to run every boot, no interactive drizzle-kit push required.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "brain_data_listings" (
  "id" serial PRIMARY KEY NOT NULL,
  "seller_id" integer NOT NULL REFERENCES "users"("id"),
  "title" text NOT NULL,
  "description" text,
  "price_vedd" integer NOT NULL,
  "suggested_price_vedd" integer NOT NULL,
  "snapshot_data" jsonb NOT NULL,
  "trade_count" integer NOT NULL,
  "distinct_pairs" integer NOT NULL,
  "age_days" integer NOT NULL,
  "win_rate" real,
  "oldest_trade_at" timestamp NOT NULL,
  "newest_trade_at" timestamp NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "purchase_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "brain_data_purchases" (
  "id" serial PRIMARY KEY NOT NULL,
  "listing_id" integer NOT NULL REFERENCES "brain_data_listings"("id"),
  "seller_id" integer NOT NULL REFERENCES "users"("id"),
  "buyer_id" integer NOT NULL REFERENCES "users"("id"),
  "price_vedd_paid" integer NOT NULL,
  "trades_imported" integer NOT NULL,
  "purchased_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE("listing_id", "buyer_id")
);

ALTER TABLE "brain_data_listings" ADD COLUMN IF NOT EXISTS "source_category" text NOT NULL DEFAULT 'forex';
`;

export async function ensureBrainMarketplaceTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Brain Data Marketplace tables ensured (brain_data_listings, brain_data_purchases).');
  } catch (err: any) {
    console.error('[startup] ensureBrainMarketplaceTables failed (non-fatal):', err?.message ?? err);
  }
}
