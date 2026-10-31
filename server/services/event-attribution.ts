/**
 * Per-event referral attribution. Event share links are
 * /event/:slug?action=register&ref=CODE; the public event page reports the
 * slug with the visit and at sign-up (and /auth carries it on from
 * sessionStorage), so each visit/sign-up is credited to the exact event
 * schedule instead of a time window.
 */
import { pool } from '../db';

let ready: Promise<void> | null = null;
export function ensureEventAttributionTables(): Promise<void> {
  return (ready ??= pool.query(`
    CREATE TABLE IF NOT EXISTS referral_event_visits (
      id SERIAL PRIMARY KEY,
      schedule_id INTEGER NOT NULL,
      referral_code TEXT,
      visited_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS referral_event_visits_schedule ON referral_event_visits(schedule_id);
    CREATE TABLE IF NOT EXISTS referral_event_signups (
      user_id INTEGER PRIMARY KEY,
      schedule_id INTEGER NOT NULL,
      referrer_id INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS referral_event_signups_schedule ON referral_event_signups(schedule_id);
  `).then(() => undefined).catch((e) => { ready = null; throw e; }));
}

async function scheduleIdForSlug(slug: unknown): Promise<number | null> {
  if (typeof slug !== 'string' || !slug.trim() || slug.length > 200) return null;
  const { rows } = await pool.query(`SELECT id FROM ambassador_event_schedules WHERE share_slug=$1 LIMIT 1`, [slug.trim()]);
  return rows[0]?.id ?? null;
}

export async function recordEventVisit(slug: unknown, referralCode: unknown): Promise<void> {
  const id = await scheduleIdForSlug(slug);
  if (!id) return;
  await ensureEventAttributionTables();
  await pool.query(`INSERT INTO referral_event_visits (schedule_id, referral_code) VALUES ($1,$2)`,
    [id, typeof referralCode === 'string' ? referralCode.slice(0, 100) : null]);
}

export async function recordEventSignup(userId: number, slug: unknown, referrerId: number | null): Promise<void> {
  const id = await scheduleIdForSlug(slug);
  if (!id) return;
  await ensureEventAttributionTables();
  await pool.query(`INSERT INTO referral_event_signups (user_id, schedule_id, referrer_id) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING`,
    [userId, id, referrerId]);
}

/** visits / sign-ups per schedule id. */
export async function eventAttribution(scheduleIds: number[]): Promise<Map<number, { visits: number; signups: number }>> {
  const out = new Map<number, { visits: number; signups: number }>();
  if (!scheduleIds.length) return out;
  await ensureEventAttributionTables();
  const [{ rows: v }, { rows: s }] = await Promise.all([
    pool.query(`SELECT schedule_id, count(*)::int n FROM referral_event_visits WHERE schedule_id = ANY($1) GROUP BY 1`, [scheduleIds]),
    pool.query(`SELECT schedule_id, count(*)::int n FROM referral_event_signups WHERE schedule_id = ANY($1) GROUP BY 1`, [scheduleIds]),
  ]);
  for (const id of scheduleIds) out.set(id, { visits: 0, signups: 0 });
  for (const r of v) out.get(r.schedule_id)!.visits = r.n;
  for (const r of s) out.get(r.schedule_id)!.signups = r.n;
  return out;
}
