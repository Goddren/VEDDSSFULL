// Idempotent boot-time migration for the Persona Content Engine (Don Chism /
// VEDD founder-brand, 3x/week, 8-platform). Mirrors the CREATE TABLE IF NOT
// EXISTS pattern used elsewhere in server/services/ensure-*.ts — new tables
// are not reliably created by the automatic db:push -- --force step alone.

import { pool } from '../db';

const PILLARS = [
  'Building VEDD in public',
  'Entrepreneurship',
  'AI/tech education',
  'Financial education',
  'Leadership',
  'Personal development',
  'Community impact',
  'Founder journey',
  'Behind-the-scenes',
  'Family/life balance/purpose',
];

const DDL = `
CREATE TABLE IF NOT EXISTS "persona_pillar_rotation" (
  "id" serial PRIMARY KEY NOT NULL,
  "pillar" text NOT NULL UNIQUE,
  "times_used" integer DEFAULT 0 NOT NULL,
  "last_used_date" varchar(20)
);

CREATE TABLE IF NOT EXISTS "persona_arc_state" (
  "id" integer PRIMARY KEY NOT NULL,
  "current_index" integer DEFAULT 0 NOT NULL,
  "loops_completed" integer DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS "persona_content_days" (
  "id" serial PRIMARY KEY NOT NULL,
  "content_date" varchar(20) NOT NULL,
  "pillar" text NOT NULL,
  "theme" text NOT NULL,
  "arc_stage" text NOT NULL,
  "arc_index" integer NOT NULL,
  "goal" text,
  "platforms_count" integer DEFAULT 8 NOT NULL,
  "email_sent" boolean DEFAULT false,
  "created_at" timestamp DEFAULT now()
);
`;

export async function ensurePersonaContentTables(): Promise<void> {
  await pool.query(DDL);

  // Seed the 10 pillars once — ON CONFLICT DO NOTHING keeps this idempotent
  // across every boot without ever resetting times_used/last_used_date.
  for (const pillar of PILLARS) {
    await pool.query(
      `INSERT INTO "persona_pillar_rotation" ("pillar") VALUES ($1) ON CONFLICT ("pillar") DO NOTHING`,
      [pillar]
    );
  }

  // Seed the single arc_state row (id=1) if missing.
  await pool.query(
    `INSERT INTO "persona_arc_state" ("id", "current_index", "loops_completed") VALUES (1, 0, 0) ON CONFLICT ("id") DO NOTHING`
  );
}
