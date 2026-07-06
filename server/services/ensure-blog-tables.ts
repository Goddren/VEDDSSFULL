// Idempotent boot-time migration for blog lead-gen infra. Mirrors
// ensure-options-tables.ts's pattern — runs CREATE TABLE IF NOT EXISTS on
// startup so a fresh deploy self-provisions without an interactive
// `drizzle-kit push`. Safe to run every boot.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "blog_newsletter_subscribers" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL UNIQUE,
  "referral_code" text,
  "source_slug" text,
  "status" text NOT NULL DEFAULT 'subscribed',
  "subscribed_at" timestamp DEFAULT now() NOT NULL,
  "unsubscribed_at" timestamp
);
`;

export async function ensureBlogTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Blog lead-gen tables ensured (blog_newsletter_subscribers).');
  } catch (err: any) {
    console.error('[startup] ensureBlogTables failed (non-fatal):', err?.message ?? err);
  }
}
