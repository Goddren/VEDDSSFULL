// Idempotent boot-time migration for Ambassador Prime (Daily Growth Engine v4).
// These 7 tables are defined in shared/schema.ts but were never migrated into
// the database — every /api/ambassador-prime/* query 500'd with
// "relation does not exist", which is why the page always showed empty/no
// data. Mirrors the CREATE TABLE IF NOT EXISTS pattern used elsewhere in
// server/services/ensure-*.ts.

import { pool } from '../db';

const DDL = `
CREATE TABLE IF NOT EXISTS "ambassador_run_summary" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL UNIQUE,
  "tweets_posted" integer DEFAULT 0,
  "linkedin_posts" integer DEFAULT 0,
  "ig_captions_generated" integer DEFAULT 0,
  "reddit_posts_scraped" integer DEFAULT 0,
  "email_sent" boolean DEFAULT false,
  "image_generated" boolean DEFAULT false,
  "day_theme" varchar(100),
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_weekly_calendar" (
  "id" serial PRIMARY KEY NOT NULL,
  "current_week_number" integer DEFAULT 1,
  "last_run_date" varchar(20),
  "last_run_day_of_week" varchar(20),
  "total_runs" integer DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "ambassador_daily_kpis" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL UNIQUE,
  "subscriber_growth_posts" integer DEFAULT 0,
  "referral_links_included" integer DEFAULT 0,
  "total_posts_published" integer DEFAULT 0,
  "estimated_reach" integer DEFAULT 0,
  "reddit_insights_count" integer DEFAULT 0,
  "engagement_opportunities" integer DEFAULT 0,
  "module_topic" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_hook_variations" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL,
  "variation" varchar(5),
  "hook_text" text,
  "cta_text" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_bonus_content" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL,
  "day_of_week" varchar(20),
  "content_type" varchar(50),
  "content_text" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_community_content" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL,
  "content_type" varchar(50),
  "content_text" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_run_step_log" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL,
  "step_name" varchar(100) NOT NULL,
  "status" varchar(20) DEFAULT 'completed',
  "error_message" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_daily_content" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL,
  "platform" varchar(50) NOT NULL,
  "post_type" varchar(50),
  "content_text" text,
  "post_id" varchar(255),
  "status" varchar(50) DEFAULT 'generated',
  "referral_link" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_reddit_insights" (
  "id" serial PRIMARY KEY NOT NULL,
  "run_date" varchar(20) NOT NULL,
  "subreddit" varchar(100),
  "insight" text,
  "engagement_opportunity" text,
  "created_at" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "ambassador_market_briefing" (
  "id" serial PRIMARY KEY NOT NULL,
  "week_start_date" varchar(20) NOT NULL UNIQUE,
  "narrative_text" text NOT NULL,
  "pairs" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp DEFAULT now() NOT NULL
);
`;

export async function ensureAmbassadorPrimeTables(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Ambassador Prime tables ensured (run_summary, daily_content, daily_kpis, hook_variations, bonus_content, community_content, reddit_insights, run_step_log, weekly_calendar, market_briefing).');
  } catch (err: any) {
    console.error('[startup] ensureAmbassadorPrimeTables failed (non-fatal):', err?.message ?? err);
  }
}
