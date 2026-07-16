// Idempotent boot-time migration for Content Studio's durable media store —
// see shared/schema.ts contentStudioAssets/contentStudioGenerations for why
// this exists (DALL-E/Replicate URLs expire; Render's disk is ephemeral).

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "content_studio_assets" (
  "id" serial PRIMARY KEY,
  "mime_type" text NOT NULL,
  "data" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "content_studio_generations" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "content_type" text NOT NULL,
  "prompt" text,
  "title" text,
  "caption" text,
  "asset_url" text,
  "flattened_asset_url" text,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp NOT NULL DEFAULT now()
);
`;

export async function ensureContentStudioTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Content Studio durable media tables ensured (content_studio_assets/generations).');
  } catch (err: any) {
    console.error('[startup] ensureContentStudioTables failed (non-fatal):', err?.message ?? err);
  }
}
