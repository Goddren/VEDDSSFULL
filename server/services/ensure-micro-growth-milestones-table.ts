// Idempotent boot-time migration for Micro Growth's doubling-milestone
// tracker. Same CREATE TABLE IF NOT EXISTS pattern used by every other
// ensure-*.ts file this session.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "micro_growth_milestones" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL UNIQUE REFERENCES "users"("id"),
  "starting_balance" double precision NOT NULL,
  "current_milestone_base" double precision NOT NULL,
  "doublings_completed" integer NOT NULL DEFAULT 0,
  "last_milestone_hit_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
`;

export async function ensureMicroGrowthMilestonesTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Micro Growth milestones table ensured (micro_growth_milestones) — doubling challenge now survives restarts.');
  } catch (err: any) {
    console.error('[startup] ensureMicroGrowthMilestonesTable failed (non-fatal):', err?.message ?? err);
  }
}
