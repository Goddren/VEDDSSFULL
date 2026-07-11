// Idempotent boot-time migration adding image-URL columns to content tables
// so blog/devotional/Ambassador Prime content can store a generated on-brand
// image (DALL-E/FLUX via server/services/image-generation.ts). Same
// ADD COLUMN IF NOT EXISTS pattern used by every other ensure-*.ts file this
// session — safe to run every boot, no interactive drizzle-kit push required.

import { pool } from '../db';

const DDL = `
ALTER TABLE "devotionals" ADD COLUMN IF NOT EXISTS "hero_image" text;
ALTER TABLE "ambassador_daily_content" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "ambassador_bonus_content" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "ambassador_community_content" ADD COLUMN IF NOT EXISTS "image_url" text;
`;

export async function ensureContentImageColumns(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Content image columns ensured (devotionals.hero_image, ambassador_daily_content/bonus_content/community_content.image_url).');
  } catch (err: any) {
    console.error('[startup] ensureContentImageColumns failed (non-fatal):', err?.message ?? err);
  }
}
