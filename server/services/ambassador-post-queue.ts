/**
 * Ambassador daily post queue (Phase 1 of the ambassador agent, 2026-10-30).
 *
 * Uses the 44-day Content Flow (ambassador-content-data.ts) as the posting
 * calendar: each day the agent turns that day's lesson into ready-to-post
 * copy for TikTok, Instagram, a Facebook Page and a Facebook group, each with
 * the ambassador's tracked link (/r/:code?p=<postId>) and the disclosure.
 *
 * Nothing is auto-published: the ambassador copies and posts, then marks it
 * posted. Auto-posting (Meta / TikTok / a scheduler) plugs in later.
 *
 * Compliance is enforced in the prompt AND after generation: no income or
 * profit promises, no automated DMs, an affiliate disclosure and a risk line
 * on every post.
 */
import { pool } from '../db';

export const PLATFORMS = ['tiktok', 'instagram', 'facebook_page', 'facebook_group'] as const;
export type Platform = typeof PLATFORMS[number];

export const DISCLOSURE = '#ad — I earn a commission if you join through my link.';
export const RISK_LINE = 'Trading involves risk; past results don\'t guarantee future returns. Not financial advice.';

let _ready: Promise<void> | null = null;
export function ensurePostQueueTables(): Promise<void> {
  if (!_ready) {
    _ready = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS ambassador_post_queue (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        queue_date DATE NOT NULL,
        day_number INTEGER NOT NULL,
        platform TEXT NOT NULL,
        format TEXT,
        hook TEXT,
        body TEXT NOT NULL,
        hashtags TEXT[],
        visual_idea TEXT,
        link TEXT,
        status TEXT NOT NULL DEFAULT 'ready',
        posted_at TIMESTAMPTZ,
        clicks INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE (user_id, queue_date, platform)
      )`);
      // Content Studio link (2026-10-31): the post's branded video.
      await pool.query(`ALTER TABLE ambassador_post_queue ADD COLUMN IF NOT EXISTS video_url TEXT, ADD COLUMN IF NOT EXISTS video_shot TEXT, ADD COLUMN IF NOT EXISTS video_aspect TEXT`);
    })().catch((e) => { _ready = null; throw e; });
  }
  return _ready;
}

/** Which of the 44 days this ambassador is on: one step per queued date, cycling. */
async function nextDayNumber(userId: number, date: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT day_number FROM ambassador_post_queue WHERE user_id=$1 AND queue_date=$2 LIMIT 1`, [userId, date]);
  if (rows[0]) return rows[0].day_number;
  const { rows: r2 } = await pool.query(
    `SELECT count(DISTINCT queue_date)::int n FROM ambassador_post_queue WHERE user_id=$1 AND queue_date < $2`, [userId, date]);
  return ((r2[0]?.n ?? 0) % 44) + 1;
}

// Phrases that promise money or describe automated outreach; rewritten out
// even if the model slips them in.
const BANNED: Array<[RegExp, string]> = [
  [/\b(guaranteed?|risk[- ]free|can'?t lose|easy money|passive income|get rich|financial freedom)\b/gi, ''],
  [/\$\s?\d[\d,]*(\.\d+)?\s*(\/|per|a)\s*(day|week|month)/gi, ''],
  [/\b(make|earn|made|earned)\s+\$\s?\d[\d,]*/gi, 'learn'],
  [/\bDM me\b/gi, 'comment below'],
];
export function sanitizePost(text: string): string {
  let s = String(text || '');
  for (const [re, rep] of BANNED) s = s.replace(re, rep);
  return s.replace(/[ \t]{2,}/g, ' ').trim();
}

function finalBody(body: string, link: string, platform: Platform): string {
  const linkLine = platform === 'tiktok' || platform === 'instagram' ? `Link in bio: ${link}` : link;
  return `${sanitizePost(body)}\n\n${linkLine}\n\n${DISCLOSURE}\n${RISK_LINE}`;
}

export interface QueueOptions { baseUrl: string; referralCode: string; date?: string; dayNumber?: number; regenerate?: boolean }

export async function getQueue(userId: number, date: string) {
  await ensurePostQueueTables();
  const { rows } = await pool.query(
    `SELECT * FROM ambassador_post_queue WHERE user_id=$1 AND queue_date=$2 ORDER BY array_position($3::text[], platform)`,
    [userId, date, PLATFORMS as unknown as string[]]);
  return rows;
}

export async function buildDailyQueue(userId: number, opts: QueueOptions) {
  await ensurePostQueueTables();
  const date = opts.date || new Date().toISOString().slice(0, 10);
  const existing = await getQueue(userId, date);
  if (existing.length && !opts.regenerate) return existing;

  const dayNumber = opts.dayNumber && opts.dayNumber >= 1 && opts.dayNumber <= 44 ? opts.dayNumber : await nextDayNumber(userId, date);
  const { ambassadorContentCurriculum } = await import('../ambassador-content-data');
  const lesson = ambassadorContentCurriculum.find((l) => l.dayNumber === dayNumber);
  if (!lesson) throw new Error(`No lesson for day ${dayNumber}`);

  const prompt = `Day ${lesson.dayNumber} of the VEDD AI 44-day ambassador plan: "${lesson.title}".
Trading topic: ${lesson.tradingTopic}
Lesson: ${lesson.tradingLesson}
Scripture: ${lesson.scriptureReference} — "${lesson.scriptureText}"
Devotional: ${lesson.devotionalMessage}
Guidance: ${lesson.contentPrompt}
Suggested hashtags: ${lesson.suggestedHashtags.join(' ')}

Write one post per platform, teaching the lesson in the ambassador's own voice and ending with a soft call to try VEDD AI.
RULES (strict): no income, profit or earnings claims or numbers; no "guaranteed", "risk-free", "passive income"; never invite DMs or describe sending DMs; no fake results. Do NOT add a link, disclosure or risk line (added automatically).

Return JSON only:
{"tiktok":{"hook":"on-screen text for the first 2 seconds, max 8 words","spokenHook":"0-3s: one punchy line said to camera","beat1":"3-15s: the problem or idea, 1-2 spoken sentences","beat2":"15-30s: the lesson with one concrete example, 2-3 spoken sentences","cta":"30-40s: one soft line to try VEDD AI","overlays":["2-3 short on-screen text overlays"],"caption":"one line plus a question","hashtags":["..."],"visualIdea":"shot list: what to film for each beat"},
HOOK (0-3s): one punchy line
BEAT 1 (3-15s): the problem or the idea
BEAT 2 (15-30s): the lesson, one concrete example
CTA (30-40s): one soft line to try VEDD AI
ON-SCREEN TEXT: 2-3 short overlays
CAPTION: one line plus a question","hashtags":["..."],"visualIdea":"shot list: what to film for each beat"},
 "instagram":{"format":"carousel|reel|post","hook":"...","body":"caption","hashtags":["..."],"visualIdea":"..."},
 "facebook_page":{"hook":"...","body":"post","hashtags":["..."],"visualIdea":"..."},
 "facebook_group":{"hook":"...","body":"conversation-starter post for a trading group, value first, no hard sell","hashtags":[],"visualIdea":"..."}}`;

  const { getUniversalAIClientForUser } = await import('../openai');
  const ai = await getUniversalAIClientForUser(userId);
  const completion = await ai.chat.completions.create({
    model: (ai as any).defaultModel || 'gpt-4o',
    messages: [
      { role: 'system', content: 'You write compliant social media content for VEDD AI ambassadors. Valid JSON only, no markdown fences.' },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 2500,
  });
  const raw = (completion.choices[0]?.message?.content || '{}').replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
  const out = JSON.parse(raw || '{}');

  // Keep posts that are posted or already have clicks; their links are live.
  await pool.query(`DELETE FROM ambassador_post_queue WHERE user_id=$1 AND queue_date=$2 AND status='ready' AND clicks = 0`, [userId, date]);
  for (const platform of PLATFORMS) {
    const p = out[platform];
    // TikTok: the model returns each beat separately; we assemble the script so
    // the layout never depends on the model following formatting instructions.
    if (platform === 'tiktok' && p && (p.beat1 || p.spokenHook)) {
      const overlays = Array.isArray(p.overlays) ? p.overlays.filter(Boolean).join(' / ') : '';
      p.body = [
        p.spokenHook && `HOOK (0-3s): ${p.spokenHook}`,
        p.beat1 && `BEAT 1 (3-15s): ${p.beat1}`,
        p.beat2 && `BEAT 2 (15-30s): ${p.beat2}`,
        p.cta && `CTA (30-40s): ${p.cta}`,
        overlays && `ON-SCREEN TEXT: ${overlays}`,
        p.caption && `CAPTION: ${p.caption}`,
      ].filter(Boolean).join('\n\n');
    }
    if (!p?.body) continue;
    const { rows } = await pool.query(
      `INSERT INTO ambassador_post_queue (user_id, queue_date, day_number, platform, format, hook, body, hashtags, visual_idea)
       VALUES ($1,$2,$3,$4,$5,$6,'',$7,$8)
       ON CONFLICT (user_id, queue_date, platform) DO NOTHING RETURNING id`,
      [userId, date, dayNumber, platform, p.format || null, sanitizePost(p.hook || ''),
       (Array.isArray(p.hashtags) && p.hashtags.length ? p.hashtags : lesson.suggestedHashtags).slice(0, 8),
       p.visualIdea || null]);
    if (!rows[0]) continue; // already posted today for this platform
    const link = `${opts.baseUrl}/r/${encodeURIComponent(opts.referralCode)}?p=${rows[0].id}`;
    await pool.query(`UPDATE ambassador_post_queue SET body=$2, link=$3 WHERE id=$1`, [rows[0].id, finalBody(p.body, link, platform), link]);
  }
  ensureDayBlogDraft(dayNumber, userId).catch(() => {});
  return getQueue(userId, date);
}

export async function markPosted(userId: number, id: number, posted = true) {
  await ensurePostQueueTables();
  const { rowCount } = await pool.query(
    `UPDATE ambassador_post_queue SET status=$3, posted_at=CASE WHEN $3='posted' THEN now() ELSE NULL END WHERE id=$1 AND user_id=$2`,
    [id, userId, posted ? 'posted' : 'ready']);
  return (rowCount ?? 0) > 0;
}

/** Called from /r/:code?p=<id>; only counts when the post belongs to that code's owner. */
export async function recordPostClick(postId: number, referralUserId: number | null) {
  if (!postId || !referralUserId) return;
  await ensurePostQueueTables();
  await pool.query(`UPDATE ambassador_post_queue SET clicks = clicks + 1 WHERE id=$1 AND user_id=$2`, [postId, referralUserId]);
}

export async function getPostStats(userId: number) {
  await ensurePostQueueTables();
  const [{ rows: byPlatform }, { rows: byDay }, { rows: tot }] = await Promise.all([
    pool.query(`SELECT platform, count(*) FILTER (WHERE status='posted')::int posted, COALESCE(sum(clicks),0)::int clicks
                  FROM ambassador_post_queue WHERE user_id=$1 GROUP BY 1 ORDER BY 3 DESC`, [userId]),
    pool.query(`SELECT day_number, COALESCE(sum(clicks),0)::int clicks FROM ambassador_post_queue
                 WHERE user_id=$1 GROUP BY 1 HAVING sum(clicks) > 0 ORDER BY 2 DESC LIMIT 5`, [userId]),
    pool.query(`SELECT count(DISTINCT queue_date) FILTER (WHERE status='posted')::int days_posted,
                       count(*) FILTER (WHERE status='posted')::int posts, COALESCE(sum(clicks),0)::int clicks
                  FROM ambassador_post_queue WHERE user_id=$1`, [userId]),
  ]);
  return { totals: tot[0], byPlatform, topDays: byDay };
}

// ─── Content Studio link: video on tap + the day's blog article ─────────────

const VIDEO_ASPECT: Record<string, '9:16' | '4:5'> = { tiktok: '9:16', instagram: '9:16', facebook_page: '4:5', facebook_group: '4:5' };

/** Renders a branded video for one queued post, from that day's lesson. Costs a Replicate render, so only on tap. */
export async function makePostVideo(userId: number, postId: number, aspect?: '9:16' | '1:1' | '4:5' | '16:9') {
  await ensurePostQueueTables();
  const { rows } = await pool.query(`SELECT * FROM ambassador_post_queue WHERE id=$1 AND user_id=$2`, [postId, userId]);
  const post = rows[0];
  if (!post) throw new Error('Post not found');
  const { ambassadorContentCurriculum } = await import('../ambassador-content-data');
  const lesson = ambassadorContentCurriculum.find((l) => l.dayNumber === post.day_number);
  const idea = [
    lesson && `Trading lesson: ${lesson.tradingTopic}. ${lesson.tradingLesson}`,
    post.hook && `Hook: ${post.hook}`,
    post.visual_idea && `Visual idea: ${post.visual_idea}`,
  ].filter(Boolean).join('\n');
  const { renderContentVideo } = await import('./content-video');
  const video = await renderContentVideo(idea, { userId, aspect: aspect || VIDEO_ASPECT[post.platform] || '9:16' });
  if (!video) throw new Error("The video couldn't be made right now. Please try again in a minute.");
  await pool.query(`UPDATE ambassador_post_queue SET video_url=$2, video_shot=$3, video_aspect=$4 WHERE id=$1`, [postId, video.url, video.shot, video.aspect]);
  if (video.persisted) {
    const { storage } = await import('../storage');
    await storage.createContentStudioGeneration({
      userId, contentType: 'video', prompt: idea, title: post.hook || null, caption: post.body, assetUrl: video.url,
      metadata: { provider: video.provider, shot: video.shot, aspect: video.aspect, branded: video.branded, day: post.day_number, platform: post.platform },
    } as any).catch(() => {});
  }
  return video;
}

const dayTag = (n: number) => `lesson-day-${n}`;
const blogInFlight = new Set<number>();

export async function getDayBlog(dayNumber: number) {
  const { rows } = await pool.query(
    `SELECT id, title, slug, excerpt, is_published FROM blog_posts WHERE tags @> $1::jsonb ORDER BY id DESC LIMIT 1`,
    [JSON.stringify([dayTag(dayNumber)])]);
  return rows[0] ?? null;
}

/**
 * One blog article per lesson day, shared by every ambassador, saved as an
 * unpublished DRAFT for the owner to review and publish. Fire-and-forget.
 */
export async function ensureDayBlogDraft(dayNumber: number, userId: number): Promise<void> {
  if (blogInFlight.has(dayNumber)) return;
  blogInFlight.add(dayNumber);
  try {
    if (await getDayBlog(dayNumber)) return;
    const { ambassadorContentCurriculum } = await import('../ambassador-content-data');
    const lesson = ambassadorContentCurriculum.find((l) => l.dayNumber === dayNumber);
    if (!lesson) return;
    const { generateVeddBlogPost } = await import('../openai');
    const topic = `${lesson.tradingTopic}: ${lesson.title}. Teach this lesson clearly for newer traders: ${lesson.tradingLesson} `
      + `Include one practical example and how VEDD AI helps with it. No income or profit promises; include a short risk note.`;
    const g = await generateVeddBlogPost(topic, userId);
    const { storage } = await import('../storage');
    await storage.createBlogPost({
      ...g, slug: `${g.slug}-day-${dayNumber}`.slice(0, 120),
      tags: [...(g.tags || []), dayTag(dayNumber), '44-day-plan'],
      isPublished: false, isFeatured: false, aiGenerated: true,
    } as any);
    console.log(`[post-queue] Day ${dayNumber} blog draft saved for review: "${g.title}"`);
  } catch (e: any) {
    console.error(`[post-queue] Day ${dayNumber} blog draft failed:`, e?.message || e);
  } finally {
    blogInFlight.delete(dayNumber);
  }
}
