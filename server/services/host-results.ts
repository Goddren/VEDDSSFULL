/**
 * Real results for the host dashboard: what a host/ambassador's events and
 * links actually produced. Every number is read from the source tables;
 * nothing is estimated.
 *
 * Attribution: sign-ups are users whose users.referred_by is this host (set at
 * registration from ?ref=CODE). Per event: shared events (schedules with a
 * share link) use exact visits/sign-ups from the event link
 * (event-attribution.ts); catalog events without a link fall back to
 * sign-ups within 72 hours of the event's start.
 * Profit split: VEDD's 30% of recruits' prop-firm net profit
 * (profit-split.ts), shown as the amount owed/collected from the host's recruits.
 */
import { pool } from '../db';

const EVENT_WINDOW_HOURS = 72;

async function safe<T>(q: Promise<{ rows: T[] }>, fallback: T[] = []): Promise<T[]> {
  try { return (await q).rows; } catch (e: any) { if (e?.code === '42P01') return fallback; throw e; }
}

export async function getHostResults(userId: number) {
  const { rows: me } = await pool.query(`SELECT referral_code, COALESCE(referral_credits,0)::int AS credits FROM users WHERE id=$1`, [userId]);
  const code: string | null = me[0]?.referral_code ?? null;

  const funnelSql = (since: string) => `
    SELECT
      (SELECT count(*)::int FROM referral_visits WHERE (referrer_id=$1 OR referral_code=$2) ${since ? `AND visited_at >= ${since}` : ''}) AS visits,
      (SELECT count(*)::int FROM users WHERE referred_by=$1 ${since ? `AND created_at >= ${since}` : ''}) AS signups,
      (SELECT count(*)::int FROM users WHERE referred_by=$1 AND subscription_status IN ('active','trialing') ${since ? `AND created_at >= ${since}` : ''}) AS paid`;
  const [allTime, last30, recruits, posts, regs, schedules] = await Promise.all([
    pool.query(funnelSql(''), [userId, code]),
    pool.query(funnelSql(`now() - interval '30 days'`), [userId, code]),
    safe(pool.query(`SELECT user_id FROM profit_split_enrollments WHERE enrolled_by=$1 AND status='active'`, [userId])),
    safe(pool.query(`SELECT count(*) FILTER (WHERE status='posted')::int AS posted, COALESCE(sum(clicks),0)::int AS clicks FROM ambassador_post_queue WHERE user_id=$1`, [userId]),
      [{ posted: 0, clicks: 0 }] as any),
    safe(pool.query(`SELECT r.event_id, r.role, r.tokens_earned, e.title, e.scheduled_date, e.status, e.event_type
                       FROM ambassador_event_registrations r JOIN ambassador_events e ON e.id=r.event_id
                      WHERE r.user_id=$1 AND r.role IN ('host','co_host','speaker')`, [userId])),
    safe(pool.query(`SELECT id, event_id, title, start_at, status, capacity, current_attendees, share_slug
                       FROM ambassador_event_schedules WHERE host_id=$1`, [userId])),
  ]);

  // Profit split across this host's active recruits.
  let netProfit = 0, owed = 0, collected = 0;
  if (recruits.length) {
    const { getProfitSplitStatus } = await import('./profit-split');
    for (const r of recruits as any[]) {
      const s = await getProfitSplitStatus(r.user_id).catch(() => null);
      if (s) { netProfit += s.netProfit; owed += s.owed; collected += s.paid; }
    }
  }

  // Events: hosted catalog events + the host's own schedules, de-duplicated.
  type Ev = { key: string; title: string; start: string | null; status: string; registered: number; attended: number; rating: number | null; tokens: number; shareSlug?: string | null; scheduleId?: number };
  const events: Ev[] = [];
  for (const r of regs as any[]) {
    const [stats] = await safe(pool.query(
      `SELECT count(*) FILTER (WHERE role='attendee' OR role IS NULL)::int AS registered,
              count(*) FILTER (WHERE status='attended')::int AS attended,
              avg(rating)::float AS rating
         FROM ambassador_event_registrations WHERE event_id=$1`, [r.event_id]), [{ registered: 0, attended: 0, rating: null }] as any);
    events.push({ key: `e${r.event_id}`, title: r.title, start: r.scheduled_date, status: r.status, registered: stats?.registered ?? 0,
      attended: stats?.attended ?? 0, rating: stats?.rating ?? null, tokens: r.tokens_earned ?? 0 });
  }
  for (const s of schedules as any[]) {
    if (s.event_id && events.some((e) => e.key === `e${s.event_id}` && e.start === s.start_at)) continue;
    events.push({ key: `s${s.id}`, title: s.title, start: s.start_at, status: s.status, registered: s.current_attendees ?? 0,
      attended: 0, rating: null, tokens: 0, shareSlug: s.share_slug, scheduleId: s.id });
  }
  const { eventAttribution } = await import('./event-attribution');
  const exact = await eventAttribution(events.filter((e) => e.scheduleId && e.shareSlug).map((e) => e.scheduleId!));
  // Sign-ups from the host's link in the 72h after each event started.
  const withSignups = await Promise.all(events.map(async (e) => {
    const ex = e.scheduleId ? exact.get(e.scheduleId) : undefined;
    if (ex) return { ...e, linkVisits: ex.visits as number | null, signupsAfter: ex.signups as number | null, attribution: 'link' as const };
    if (!e.start || new Date(e.start) > new Date()) return { ...e, linkVisits: null as number | null, signupsAfter: null as number | null, attribution: 'window' as const };
    const { rows } = await pool.query(
      `SELECT count(*)::int n FROM users WHERE referred_by=$1 AND created_at >= $2 AND created_at < $2::timestamptz + interval '${EVENT_WINDOW_HOURS} hours'`,
      [userId, e.start]);
    return { ...e, linkVisits: null as number | null, signupsAfter: rows[0]?.n ?? 0 as number | null, attribution: 'window' as const };
  }));
  withSignups.sort((a, b) => String(b.start ?? '').localeCompare(String(a.start ?? '')));

  const a = allTime.rows[0], m = last30.rows[0];
  const rate = (n: number, d: number) => (d > 0 ? n / d : null);
  return {
    referralCode: code,
    funnel: {
      allTime: { ...a, signupRate: rate(a.signups, a.visits), paidRate: rate(a.paid, a.signups) },
      last30: { ...m, signupRate: rate(m.signups, m.visits), paidRate: rate(m.paid, m.signups) },
    },
    profitSplit: { recruits: recruits.length, netProfit, owedToVedd: owed, collected, pct: 30 },
    content: posts[0] ?? { posted: 0, clicks: 0 },
    credits: me[0]?.credits ?? 0,
    tokensFromEvents: (regs as any[]).reduce((s, r) => s + (r.tokens_earned || 0), 0),
    events: withSignups,
    eventWindowHours: EVENT_WINDOW_HOURS,
  };
}
