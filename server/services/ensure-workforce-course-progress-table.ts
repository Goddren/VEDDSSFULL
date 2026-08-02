// Idempotent boot-time migration for the durable Workforce Academy course
// progress mirror. Same CREATE TABLE IF NOT EXISTS pattern used by every
// other ensure-*.ts file this session.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "workforce_course_progress" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id"),
  "course_id" integer NOT NULL,
  "current_lesson" integer NOT NULL DEFAULT 1,
  "progress_pct" integer NOT NULL DEFAULT 0,
  "completed" boolean NOT NULL DEFAULT false,
  "score" integer,
  "enrolled_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  UNIQUE ("user_id", "course_id")
);
`;

export async function ensureWorkforceCourseProgressTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Workforce course progress table ensured (workforce_course_progress) — "where you left off" now survives restarts.');
  } catch (err: any) {
    console.error('[startup] ensureWorkforceCourseProgressTable failed (non-fatal):', err?.message ?? err);
  }
}
