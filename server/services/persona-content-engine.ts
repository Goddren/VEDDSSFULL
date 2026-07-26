/**
 * VEDD Persona Content Engine — Don Chism founder-brand daily content package
 * Separate from the daily Ambassador Prime engine (server/services/ambassador-prime.ts).
 * Runs 3x/week (Mon/Wed/Fri) via setTimeout scheduler. Produces one content
 * day per run, 8 platform-native versions, delivered as a single HTML email
 * to the owner. Database is the source of truth for pillar rotation and the
 * 7-stage documentary story arc.
 */
import { pool } from '../db';
import { OpenAI } from 'openai';

const REFERRAL_LINK = 'https://veddbuild.com/auth?ref=DONCHISMKOS@GMAIL.COM511';
const REPORT_EMAIL = 'donchismkos@gmail.com';

const ARC_STAGES: string[] = [
  'Reintroduce Don',
  'Explain why he disappeared',
  'Show the mission',
  'Document the build',
  'Teach valuable lessons',
  'Introduce VEDD naturally',
  'Invite people to explore the platform if it fits their goals',
];

const PLATFORMS = ['Facebook', 'Instagram Feed', 'Instagram Stories', 'Instagram Reels', 'TikTok', 'Threads', 'X (Twitter)', 'LinkedIn'] as const;
type Platform = typeof PLATFORMS[number];

const BANNED_PHRASES = [
  "it's important to note", "it's worth noting", 'in conclusion', 'furthermore', 'moreover',
  'additionally', 'delve into', 'navigate the landscape', 'leverage', 'robust', 'tapestry',
  'not just x, but y', "in today's fast-paced world",
];

const BRAND_DNA = `You are writing in the first-person voice of Don Chism, Founder and CEO of VEDD
(AI, financial education, and innovation company at veddbuild.com).

Who Don is: a builder, visionary, entrepreneur, and teacher — never a flashy salesperson or guru.
His story is about building freedom. He built VEDD because people deserve greater access to
financial education and modern technology, especially in underserved communities.

Brand values: integrity, consistency, leadership, innovation, faith in hard work, education,
freedom, community, discipline, long-term thinking.

Content philosophy: every piece must answer one question — "Why should someone trust Don?"
Trust comes from honesty, consistency, education, and transparency, never from titles, luxury,
or hype. Every post moves the audience through Awareness → Curiosity → Trust → Community →
Exploration of VEDD. The audience should feel like they are watching a documentary, not a sales
campaign.

Writing style: confident, honest, conversational, hopeful. Never arrogant, overly polished, or
robotic. Avoid buzzwords and clichés. When discussing AI, investing, or trading: focus on
education and transparency, acknowledge that investing and trading involve risk, and never
promise guaranteed profits or "easy money."

VEDD referral link (use only where a CTA naturally warrants it, never with pressure): ${REFERRAL_LINK}

Never use these banned phrases/patterns: ${BANNED_PHRASES.join(', ')}. Also avoid tricolons for
emphasis, symmetric opener-closer constructions, and hedge stacking. Vary sentence length
naturally. Use at most 2 em-dashes per field. Music style must describe mood only, never name
copyrighted songs. Never fabricate engagement numbers or results.`;

// ── AI call helper (OpenRouter free-tier primary — cheapest — OpenAI failover) ─
async function callAI(systemPrompt: string, userPrompt: string, maxTokens = 3000): Promise<string> {
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const orClient = new OpenAI({
        apiKey: orKey, baseURL: 'https://openrouter.ai/api/v1', maxRetries: 2, timeout: 120000,
        defaultHeaders: { 'HTTP-Referer': 'https://veddbuild.com', 'X-Title': 'VEDDBuild' },
      });
      const res = await orClient.chat.completions.create({
        model: 'deepseek/deepseek-chat-v3-0324:free', messages, temperature: 0.8, max_tokens: maxTokens,
      });
      return res.choices[0]?.message?.content?.trim() ?? '';
    } catch (e: any) {
      console.warn('[persona-content] OpenRouter failed — falling back to OpenAI:', e.message);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const client = new OpenAI({ apiKey: apiKey || '', maxRetries: 2, timeout: 120000 });
  const res = await client.chat.completions.create({
    model: 'gpt-4o', messages, temperature: 0.8, max_tokens: maxTokens,
  });
  return res.choices[0]?.message?.content?.trim() ?? '';
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch (e) {
    console.error('[persona-content] JSON parse failed:', (e as Error).message, '— raw:', raw.slice(0, 300));
    return fallback;
  }
}

function escHtml(s: string): string {
  return (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── 1. Read rotation + arc state ────────────────────────────────────────────
interface RotationPick {
  pillar: string;
  arcStage: string;
  arcIndex: number;
  loopsCompleted: number;
}

async function pickPillarAndArc(): Promise<RotationPick> {
  const arcRes = await pool.query('SELECT current_index, loops_completed FROM persona_arc_state WHERE id = 1');
  const arcIndex: number = arcRes.rows[0]?.current_index ?? 0;
  const loopsCompleted: number = arcRes.rows[0]?.loops_completed ?? 0;

  const pillarRes = await pool.query(
    `SELECT pillar, times_used, last_used_date FROM persona_pillar_rotation
     ORDER BY times_used ASC, (last_used_date IS NOT NULL), last_used_date ASC, id ASC`
  );
  const pillar = pillarRes.rows[0]?.pillar || 'Building VEDD in public';

  return { pillar, arcStage: ARC_STAGES[arcIndex], arcIndex, loopsCompleted };
}

// ── 2. Shared creative foundation (the "spine") ─────────────────────────────
interface ContentSpine {
  daily_theme: string;
  goal: string;
  core_narrative: string;
  emotional_tone: string;
  visual_concept: string;
  photo_concept: string;
  reel_concept: string;
  shot_list: string;
  b_roll: string;
  voiceover_script: string;
  on_screen_text: string;
  ai_image_prompt: string;
  thumbnail_concept: string;
  editing_style: string;
  music_style: string;
}

async function generateSpine(pillar: string, arcStage: string, contentDate: string): Promise<ContentSpine> {
  const sys = `${BRAND_DNA}\n\nToday's content pillar: "${pillar}". Today's documentary story-arc stage: "${arcStage}".`;
  const user = `Generate today's shared cross-platform creative foundation for ${contentDate} as valid JSON (no markdown fences) with exactly these keys:
daily_theme, goal, core_narrative (Don's message today, first-person, 2-4 sentences), emotional_tone,
visual_concept, photo_concept, reel_concept, shot_list, b_roll, voiceover_script, on_screen_text,
ai_image_prompt (detailed, ready for an image generator), thumbnail_concept, editing_style,
music_style (mood only, never a real song title). Every field is a single string.`;
  const raw = await callAI(sys, user);
  return parseJson<ContentSpine>(raw, {
    daily_theme: pillar, goal: 'Build trust through consistency', core_narrative: '', emotional_tone: 'hopeful',
    visual_concept: '', photo_concept: '', reel_concept: '', shot_list: '', b_roll: '', voiceover_script: '',
    on_screen_text: '', ai_image_prompt: '', thumbnail_concept: '', editing_style: '', music_style: 'warm, hopeful',
  });
}

// ── 3. Platform-native packages (batched single call) ───────────────────────
interface PlatformPackage {
  hook: string; caption_short: string; caption_long: string; cta: string; hashtags: string[];
  story_sequence: string[]; poll_idea: string; comment_prompt: string; pinned_comment: string;
  engagement_strategy: string; best_posting_time: string;
}
type PlatformPackages = Record<Platform, PlatformPackage>;

const PLATFORM_RULES: Record<Platform, string> = {
  'Facebook': 'Warm, community storytelling, 2-4 hashtags, invites comments/shares.',
  'Instagram Feed': 'Strong first line before the fold, line-broken caption, 8-12 hashtags.',
  'Instagram Stories': 'Use story_sequence: 4-6 sequential frames as an array of strings, each frame describing on-frame text + an interactive sticker (poll/question/slider).',
  'Instagram Reels': 'Hook in first 1-2 seconds, caption supports the video, 5-8 hashtags, reference voiceover + on-screen text.',
  'TikTok': 'Raw and native, hook in first 2 seconds, short punchy caption, 4-5 hashtags.',
  'Threads': 'Conversational, text-first, optional 2-4 post mini-thread in caption_long, 0-2 hashtags.',
  'X (Twitter)': 'caption_short MUST be <=280 characters. caption_long is a numbered thread (each line a tweet, each <=280 characters). 1-2 hashtags max.',
  'LinkedIn': 'Professional and reflective, up to ~1300 chars, leadership/lesson angle, NO hashtags inside caption_long/caption_short — list 3-5 hashtags separately in the hashtags array.',
};

function emptyPackage(): PlatformPackage {
  return { hook: '', caption_short: '', caption_long: '', cta: '', hashtags: [], story_sequence: [], poll_idea: '', comment_prompt: '', pinned_comment: '', engagement_strategy: '', best_posting_time: '' };
}

async function generatePlatformPackages(spine: ContentSpine, pillar: string, arcStage: string): Promise<PlatformPackages> {
  const sys = `${BRAND_DNA}\n\nToday's pillar: "${pillar}". Story-arc stage: "${arcStage}".\nShared narrative for today: ${spine.core_narrative}\nGoal: ${spine.goal}\nTone: ${spine.emotional_tone}`;
  const rulesBlock = PLATFORMS.map(p => `- ${p}: ${PLATFORM_RULES[p]}`).join('\n');
  const user = `Adapt the shared narrative above into 8 separate platform-native versions — never reuse the same wording across platforms. Platforms and their format rules:
${rulesBlock}

Return valid JSON (no markdown fences) as an object keyed by exactly these platform names: ${PLATFORMS.map(p => `"${p}"`).join(', ')}.
Each platform's value must have exactly these keys: hook, caption_short, caption_long, cta, hashtags (array of strings, no leading #), story_sequence (array of strings — only meaningfully populated for "Instagram Stories", empty array [] for all other platforms), poll_idea, comment_prompt, pinned_comment, engagement_strategy, best_posting_time.`;
  const raw = await callAI(sys, user, 4000);
  const parsed = parseJson<Partial<PlatformPackages>>(raw, {});
  const result = {} as PlatformPackages;
  for (const p of PLATFORMS) {
    result[p] = { ...emptyPackage(), ...(parsed[p] || {}) };
  }
  return result;
}

// ── 4. Humanize pass + deterministic validation ─────────────────────────────
async function humanizePackages(packages: PlatformPackages): Promise<PlatformPackages> {
  const sys = `${BRAND_DNA}\n\nYou are the editor. Rewrite the drafts below so they read like a real founder wrote them by hand — not more polished, more HUMAN. Vary sentence length naturally. Strip every banned phrase. Keep the same meaning, platform, and structure.`;
  const user = `Here are today's 8 draft platform packages as JSON:\n${JSON.stringify(packages)}\n\nReturn the corrected JSON in the exact same shape (same keys), no markdown fences, no commentary.`;
  const raw = await callAI(sys, user, 4000);
  const parsed = parseJson<Partial<PlatformPackages>>(raw, {});
  const result = { ...packages };
  for (const p of PLATFORMS) {
    if (parsed[p]) result[p] = { ...result[p], ...parsed[p] };
  }
  return validatePackages(result);
}

// Deterministic (non-AI) enforcement of hard character limits — never trust
// the model alone for X's 280-char rule.
function validatePackages(packages: PlatformPackages): PlatformPackages {
  const x = packages['X (Twitter)'];
  if (x) {
    if (x.caption_short && x.caption_short.length > 280) x.caption_short = x.caption_short.slice(0, 277) + '...';
    if (x.caption_long) {
      const lines = x.caption_long.split('\n').filter(Boolean);
      x.caption_long = lines.map(l => (l.length > 280 ? l.slice(0, 277) + '...' : l)).join('\n');
    }
  }
  for (const bad of BANNED_PHRASES) {
    for (const p of PLATFORMS) {
      const pkg = packages[p];
      for (const field of ['hook', 'caption_short', 'caption_long', 'cta'] as const) {
        if (pkg[field] && pkg[field].toLowerCase().includes(bad)) {
          console.warn(`[persona-content] Banned phrase "${bad}" survived humanize pass on ${p}.${field} — leaving as-is (logged for review).`);
        }
      }
    }
  }
  return packages;
}

// ── Community reply templates ───────────────────────────────────────────────
interface ReplyTemplates {
  about_vedd: string[]; skepticism: string[]; welcome_back: string[]; ai_investing_questions: string[]; how_to_start: string[];
}

async function generateReplyTemplates(pillar: string): Promise<ReplyTemplates> {
  const sys = `${BRAND_DNA}\n\nWrite short community reply templates Don can paste as comment replies. Educational and risk-aware for anything about AI/investing/trading — never promise guaranteed profits. Only mention the referral link for people who genuinely ask how to join, and never with pressure.`;
  const user = `Write 2 short reply-template variations each for these 5 categories, as valid JSON (no markdown fences) with keys about_vedd, skepticism, welcome_back, ai_investing_questions, how_to_start — each value an array of exactly 2 strings.`;
  const raw = await callAI(sys, user, 1200);
  return parseJson<ReplyTemplates>(raw, {
    about_vedd: [], skepticism: [], welcome_back: [], ai_investing_questions: [], how_to_start: [],
  });
}

// ── 5. Assemble HTML email ───────────────────────────────────────────────────
function buildEmailHtml(opts: {
  contentDate: string; pillar: string; arcStage: string; arcIndex: number; loopsCompleted: number;
  spine: ContentSpine; packages: PlatformPackages; replies: ReplyTemplates;
}): string {
  const { contentDate, pillar, arcStage, arcIndex, loopsCompleted, spine, packages, replies } = opts;

  const spineRows = ([
    ['Visual concept', spine.visual_concept], ['Photo concept', spine.photo_concept],
    ['Reel concept', spine.reel_concept], ['Shot list', spine.shot_list], ['B-roll', spine.b_roll],
    ['Voiceover script', spine.voiceover_script], ['On-screen text', spine.on_screen_text],
    ['AI image prompt', spine.ai_image_prompt], ['Thumbnail concept', spine.thumbnail_concept],
    ['Editing style', spine.editing_style], ['Music style (mood only)', spine.music_style],
  ] as [string, string][]).map(([label, val]) => `
    <tr><td style="padding:8px;border-bottom:1px solid #222;color:#888;font-size:12px;vertical-align:top;white-space:nowrap;">${escHtml(label)}</td>
        <td style="padding:8px;border-bottom:1px solid #222;font-size:13px;white-space:pre-line;">${escHtml(val)}</td></tr>`).join('');

  const platformBlock = (platform: Platform) => {
    const pkg = packages[platform];
    const rows: [string, string][] = [
      ['Hook', pkg.hook], ['Caption (short)', pkg.caption_short], ['Caption (long)', pkg.caption_long],
      ['CTA', pkg.cta], ['Hashtags', pkg.hashtags.map(h => `#${h}`).join(' ')],
      ['Poll idea', pkg.poll_idea], ['Comment prompt', pkg.comment_prompt], ['Pinned comment', pkg.pinned_comment],
      ['Best posting time', pkg.best_posting_time], ['First 30-min engagement strategy', pkg.engagement_strategy],
    ];
    const storyBlock = pkg.story_sequence.length ? `
      <div style="margin-top:8px;">
        <div style="font-size:12px;color:#888;margin-bottom:4px;">Story sequence</div>
        ${pkg.story_sequence.map((frame, i) => `<div style="font-size:12px;padding:6px 8px;background:#0a0a0a;border-left:2px solid #00d4ff;border-radius:4px;margin-bottom:4px;white-space:pre-line;"><strong style="color:#00d4ff;">Frame ${i + 1}:</strong> ${escHtml(frame)}</div>`).join('')}
      </div>` : '';
    return `
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
      <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:10px;">${escHtml(platform)}</div>
      <table style="width:100%;border-collapse:collapse;">
        ${rows.map(([label, val]) => `<tr><td style="padding:6px 8px;border-bottom:1px solid #1a1a1a;color:#888;font-size:11px;vertical-align:top;white-space:nowrap;">${escHtml(label)}</td><td style="padding:6px 8px;border-bottom:1px solid #1a1a1a;font-size:13px;white-space:pre-line;">${escHtml(val)}</td></tr>`).join('')}
      </table>
      ${storyBlock}
    </div>`;
  };

  const replyBlock = (label: string, arr: string[]) => `
    <div style="margin-bottom:10px;">
      <div style="font-size:12px;font-weight:600;color:#00d4ff;margin-bottom:4px;">${escHtml(label)}</div>
      ${arr.map(v => `<div style="font-size:12px;color:#ccc;padding:6px 8px;background:#0a0a0a;border-radius:4px;margin-bottom:4px;white-space:pre-line;">${escHtml(v)}</div>`).join('')}
    </div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VEDD Persona Content Package — ${contentDate}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;color:#e0e0e0;">
<div style="max-width:760px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #00d4ff33;border-radius:12px;padding:28px;margin-bottom:20px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#00d4ff;margin-bottom:8px;">VEDD Persona Content Engine</div>
    <h1 style="margin:0 0 4px;font-size:24px;font-weight:700;color:#fff;">${escHtml(spine.daily_theme)}</h1>
    <div style="font-size:13px;color:#888;">${contentDate} — Pillar: ${escHtml(pillar)} · Arc stage ${arcIndex + 1}/7: ${escHtml(arcStage)} (loop ${loopsCompleted + 1})</div>
  </div>

  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">Goal</div>
    <div style="font-size:14px;white-space:pre-line;">${escHtml(spine.goal)}</div>
    <div style="font-size:12px;color:#888;text-transform:uppercase;letter-spacing:1px;margin:12px 0 6px;">Core narrative (Don's message today)</div>
    <div style="font-size:14px;white-space:pre-line;">${escHtml(spine.core_narrative)}</div>
  </div>

  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:20px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:10px;">Shared production assets</div>
    <table style="width:100%;border-collapse:collapse;">${spineRows}</table>
  </div>

  ${PLATFORMS.map(platformBlock).join('')}

  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:10px;">Community reply templates</div>
    ${replyBlock('About VEDD', replies.about_vedd)}
    ${replyBlock('Skepticism / scam pushback', replies.skepticism)}
    ${replyBlock('Encouragement / welcome-back', replies.welcome_back)}
    ${replyBlock('AI / investing / trading questions', replies.ai_investing_questions)}
    ${replyBlock('How to start / join', replies.how_to_start)}
  </div>

  <div style="text-align:center;padding:20px;color:#444;font-size:11px;">
    <div>VEDD Persona Content Engine • ${contentDate}</div>
    <div style="margin-top:4px;">Referral link: <a href="${REFERRAL_LINK}" style="color:#00d4ff;">${REFERRAL_LINK}</a></div>
    <div style="margin-top:8px;color:#666;">Investing and trading involve risk, including the possible loss of principal. Nothing in this content is financial advice.</div>
  </div>
</div>
</body></html>`;
}

// ── 6. Send email (SendGrid → Gmail fallback, same pattern as Ambassador Prime) ─
async function sendPersonaContentEmail(subject: string, html: string): Promise<{ success: boolean; reason?: string }> {
  const sgKey = process.env.SENDGRID_API_KEY;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!sgKey && !(gmailUser && gmailPass)) {
    const reason = 'No email channel configured — set SENDGRID_API_KEY or GMAIL_USER + GMAIL_APP_PASSWORD.';
    console.error('[persona-content]', reason);
    return { success: false, reason };
  }

  const sgErrors: string[] = [];
  if (sgKey) {
    try {
      const { default: sgMail } = await import('@sendgrid/mail');
      sgMail.setApiKey(sgKey);
      await sgMail.send({ to: REPORT_EMAIL, from: 'noreply@veddbuild.com', subject, html });
      return { success: true };
    } catch (e: any) {
      const errDetail = e?.response?.body?.errors;
      const detail = Array.isArray(errDetail) && errDetail.length ? errDetail.map((er: any) => er.message).join('; ') : e.message;
      console.error('[persona-content] SendGrid send failed, trying Gmail fallback if configured:', detail);
      sgErrors.push(`SendGrid: ${detail}`);
    }
  }
  if (gmailUser && gmailPass) {
    const { sendGmail } = await import('../messaging');
    const result = await sendGmail(REPORT_EMAIL, subject, 'Full content package is in the HTML body of this email.', html);
    if (result.success) return { success: true };
    sgErrors.push(`Gmail: ${result.error}`);
  }
  const reason = sgErrors.join(' | ') || 'No email channel configured';
  console.error('[persona-content] All email channels failed:', reason);
  return { success: false, reason };
}

// ── 7. Record progress (pillar rotation, arc advance, content_days row) ─────
async function recordProgress(pick: RotationPick, contentDate: string, spine: ContentSpine, emailSent: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO persona_content_days (content_date, pillar, theme, arc_stage, arc_index, goal, platforms_count, email_sent)
     VALUES ($1,$2,$3,$4,$5,$6,8,$7)`,
    [contentDate, pick.pillar, spine.daily_theme, pick.arcStage, pick.arcIndex, spine.goal, emailSent]
  );

  await pool.query(
    `UPDATE persona_pillar_rotation SET times_used = times_used + 1, last_used_date = $1 WHERE pillar = $2`,
    [contentDate, pick.pillar]
  );

  const nextIndex = (pick.arcIndex + 1) % ARC_STAGES.length;
  const wrapped = nextIndex === 0;
  await pool.query(
    `UPDATE persona_arc_state SET current_index = $1, loops_completed = loops_completed + $2 WHERE id = 1`,
    [nextIndex, wrapped ? 1 : 0]
  );
}

// ── Orchestration ────────────────────────────────────────────────────────────
export async function runPersonaContentEngine(trigger: 'scheduler' | 'manual' = 'manual'): Promise<{ success: boolean; reason?: string }> {
  const contentDate = new Date().toISOString().slice(0, 10);
  console.log(`[persona-content] Run started (${trigger}) for ${contentDate}`);
  try {
    const pick = await pickPillarAndArc();
    console.log(`[persona-content] Pillar="${pick.pillar}" arc="${pick.arcStage}" (${pick.arcIndex + 1}/7, loop ${pick.loopsCompleted + 1})`);

    const spine = await generateSpine(pick.pillar, pick.arcStage, contentDate);
    const draftPackages = await generatePlatformPackages(spine, pick.pillar, pick.arcStage);
    const packages = await humanizePackages(draftPackages);
    const replies = await generateReplyTemplates(pick.pillar);

    const html = buildEmailHtml({
      contentDate, pillar: pick.pillar, arcStage: pick.arcStage, arcIndex: pick.arcIndex,
      loopsCompleted: pick.loopsCompleted, spine, packages, replies,
    });
    const subject = `VEDD Content Package - ${contentDate} - ${spine.daily_theme} (${pick.pillar})`;
    const emailResult = await sendPersonaContentEmail(subject, html);

    await recordProgress(pick, contentDate, spine, emailResult.success);

    if (!emailResult.success) {
      console.error('[persona-content] Run completed but email failed:', emailResult.reason);
      return { success: false, reason: emailResult.reason };
    }
    console.log('[persona-content] Run completed and email sent.');
    return { success: true };
  } catch (e: any) {
    console.error('[persona-content] Run failed:', e.message);
    return { success: false, reason: e.message };
  }
}

// ── Scheduler — Monday/Wednesday/Friday, 10:00 UTC (offset from Ambassador
// Prime's 09:00 daily run so the two engines never fire simultaneously) ─────
const TARGET_UTC_DAYS = [1, 3, 5]; // Mon, Wed, Fri

export function startPersonaContentScheduler(): void {
  function scheduleNext() {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(10, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    while (!TARGET_UTC_DAYS.includes(next.getUTCDay())) {
      next.setUTCDate(next.getUTCDate() + 1);
    }
    const delay = next.getTime() - now.getTime();
    console.log(`[persona-content] Next run at ${next.toISOString()} (in ${Math.round(delay / 60000)} min)`);
    setTimeout(async () => {
      try {
        await runPersonaContentEngine('scheduler');
      } catch (e: any) {
        console.error('[persona-content] Scheduler run error:', e.message);
      }
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}
