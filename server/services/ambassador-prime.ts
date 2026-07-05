/**
 * VEDD Ambassador Prime — Daily Growth Engine v4
 * Fault-tolerant daily content marketing automation for veddbuild.com
 * Runs at 09:00 UTC daily via setTimeout scheduler
 */
import crypto from 'crypto';
import { db } from '../db';
import {
  ambassadorDailyContent,
  ambassadorRedditInsights,
  ambassadorRunSummary,
  ambassadorWeeklyCalendar,
  ambassadorDailyKpis,
  ambassadorHookVariations,
  ambassadorBonusContent,
  ambassadorCommunityContent,
  ambassadorRunStepLog,
} from '../../shared/schema';
import { eq, desc } from 'drizzle-orm';
import { OpenAI } from 'openai';

// ── Constants ────────────────────────────────────────────────────────────────
const REFERRAL_LINK = 'https://veddbuild.com/auth?ref=DONCHISMKOS@GMAIL.COM511';
const REPORT_EMAIL = 'donchismkos@gmail.com';
const LINKEDIN_AUTHOR_URN = 'urn:li:person:tmH3fnyYMl';
const VEDDBUILD_URL = 'https://veddbuild.com';

// Weekly themes (Mon=0 … Sun=6)
const WEEKLY_THEMES: Record<number, { name: string; angle: string; modules: string[] }> = {
  0: {
    name: 'Monday Momentum',
    angle: 'Start the trading week with an edge — discipline, preparation, morning routines',
    modules: ['Pre-market routine', 'Weekly goal setting', 'Mental priming'],
  },
  1: {
    name: 'Technical Tuesday',
    angle: 'Deep-dive chart patterns, indicators, AI analysis tools',
    modules: ['Pattern recognition', 'AI signal reading', 'Confluence zones'],
  },
  2: {
    name: 'Wealth Wednesday',
    angle: 'Risk management, position sizing, compound growth mindset',
    modules: ['Risk-per-trade sizing', 'Portfolio allocation', 'Drawdown recovery'],
  },
  3: {
    name: 'Throwback Thursday',
    angle: 'Real trade breakdowns, wins, losses, lessons from the trenches',
    modules: ['Trade autopsy', 'Loss to lesson', 'Journal review'],
  },
  4: {
    name: 'Friday Insights',
    angle: 'Week wrap, data patterns, upcoming catalysts',
    modules: ['Weekly review', 'Upcoming events', 'Data-driven edge'],
  },
  5: {
    name: 'Strategy Saturday',
    angle: 'Systems, back-tests, building a trading playbook',
    modules: ['Backtesting', 'Strategy building', 'Rule sets'],
  },
  6: {
    name: 'Success Sunday',
    angle: 'Mindset, success stories, community highlights, week ahead planning',
    modules: ['Success story', 'Community spotlight', 'Week-ahead prep'],
  },
};

// ── Step log helper ───────────────────────────────────────────────────────────
async function logStep(runDate: string, stepName: string, status: 'completed' | 'skipped' | 'failed', error?: string) {
  try {
    await db.insert(ambassadorRunStepLog).values({ runDate, stepName, status, errorMessage: error ?? null });
  } catch {}
}

// ── Twitter OAuth 1.0a ────────────────────────────────────────────────────────
function buildOAuthHeader(method: string, url: string, params: Record<string, string>): string {
  const apiKey = process.env.TWITTER_API_KEY;
  const apiSecret = process.env.TWITTER_API_SECRET;
  const accessToken = process.env.TWITTER_ACCESS_TOKEN;
  const accessSecret = process.env.TWITTER_ACCESS_TOKEN_SECRET;
  if (!apiKey || !apiSecret || !accessToken || !accessSecret) return '';

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: apiKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...params, ...oauthParams };
  const sortedKeys = Object.keys(allParams).sort();
  const paramStr = sortedKeys
    .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(allParams[k])}`)
    .join('&');

  const sigBase = [method.toUpperCase(), encodeURIComponent(url), encodeURIComponent(paramStr)].join('&');
  const sigKey = `${encodeURIComponent(apiSecret)}&${encodeURIComponent(accessSecret)}`;
  const signature = crypto.createHmac('sha1', sigKey).update(sigBase).digest('base64');

  oauthParams['oauth_signature'] = signature;
  const headerValue = Object.keys(oauthParams)
    .sort()
    .map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`)
    .join(', ');
  return `OAuth ${headerValue}`;
}

async function postTweet(text: string): Promise<string | null> {
  try {
    const url = 'https://api.twitter.com/2/tweets';
    const oauthHeader = buildOAuthHeader('POST', url, {});
    if (!oauthHeader) return null;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: oauthHeader,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[ambassador-prime] Twitter post failed:', err);
      return null;
    }
    const data = await res.json() as any;
    return data?.data?.id ?? null;
  } catch (e: any) {
    console.error('[ambassador-prime] Twitter error:', e.message);
    return null;
  }
}

// ── LinkedIn posting ─────────────────────────────────────────────────────────
async function postLinkedIn(text: string): Promise<string | null> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: LINKEDIN_AUTHOR_URN,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[ambassador-prime] LinkedIn post failed:', err);
      return null;
    }
    const data = await res.json() as any;
    return data?.id ?? 'posted';
  } catch (e: any) {
    console.error('[ambassador-prime] LinkedIn error:', e.message);
    return null;
  }
}

// ── DALL-E image generation ───────────────────────────────────────────────────
async function generateDalleImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    const openai = new OpenAI({ apiKey, maxRetries: 2, timeout: 60000 });
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
    });
    return res.data[0]?.url ?? null;
  } catch (e: any) {
    console.error('[ambassador-prime] DALL-E error:', e.message);
    return null;
  }
}

// ── Reddit research ──────────────────────────────────────────────────────────
// ── Free Reddit JSON API (no key required) ───────────────────────────────────
async function scrapeRedditInsights(theme: string): Promise<{ posts: any[]; error?: string }> {
  const subreddits = ['Forex', 'Daytrading', 'algotrading', 'Trading', 'stocks'];
  const posts: any[] = [];
  const headers = { 'User-Agent': 'VEDD-Ambassador-Prime/1.0 (trading research bot)' };

  for (const sub of subreddits) {
    try {
      // Reddit's free public JSON API — no token needed
      const url = `https://www.reddit.com/r/${sub}/hot.json?limit=8&raw_json=1`;
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json() as any;
      const children = data?.data?.children ?? [];
      for (const child of children) {
        const p = child.data;
        if (!p || p.stickied) continue;
        posts.push({
          subreddit: sub,
          title: p.title,
          score: p.score,
          num_comments: p.num_comments,
          selftext: (p.selftext ?? '').slice(0, 300),
          url: `https://reddit.com${p.permalink}`,
          dataType: 'post',
        });
      }
    } catch {
      // skip this subreddit on timeout/error
    }
  }
  return { posts };
}

// ── Free RSS news feed scraper (no key required) ─────────────────────────────
async function scrapeNewsRSS(theme: string): Promise<string[]> {
  const headlines: string[] = [];
  const keywords = encodeURIComponent(`trading ${theme.split(' ').slice(0, 2).join(' ')}`);

  const feeds = [
    // Google News RSS — completely free
    `https://news.google.com/rss/search?q=${keywords}+trading+forex&hl=en-US&gl=US&ceid=US:en`,
    // Yahoo Finance RSS
    `https://finance.yahoo.com/news/rssindex`,
  ];

  const headers = { 'User-Agent': 'VEDD-Ambassador-Prime/1.0' };

  for (const feed of feeds) {
    try {
      const res = await fetch(feed, { headers, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const xml = await res.text();
      // Extract <title> tags from RSS — simple regex, no XML parser dependency
      const titles = [...xml.matchAll(/<title><!\[CDATA\[(.+?)\]\]><\/title>|<title>([^<]+)<\/title>/g)]
        .map(m => (m[1] || m[2] || '').trim())
        .filter(t => t && t.length > 20 && !t.toLowerCase().includes('google news'))
        .slice(0, 6);
      headlines.push(...titles);
      if (headlines.length >= 10) break;
    } catch {
      // skip
    }
  }
  return headlines.slice(0, 10);
}

// ── AI helper ────────────────────────────────────────────────────────────────
async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = apiKey ? 'gpt-4o' : 'gpt-4o';
  const client = new OpenAI({ apiKey: apiKey || '', maxRetries: 2, timeout: 90000 });
  const res = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0.7,
    max_tokens: 2000,
  });
  return res.choices[0]?.message?.content?.trim() ?? '';
}

// ── Content generation (Batch 1) ─────────────────────────────────────────────
async function generateBatch1(theme: typeof WEEKLY_THEMES[0], redditContext: string, dayOfWeek: number): Promise<{
  tweets: string[];
  hookA: string; hookB: string; hookC: string;
  reelScript: string;
  storyIdea: string;
  communityPrompt: string;
  imagePrompt: string;
}> {
  const sys = `You are VEDD's daily growth ambassador. VEDD (veddbuild.com) is an AI-powered trading analysis platform. Your job is to generate high-converting social media content that drives traders to sign up.
Always include the referral link: ${REFERRAL_LINK}
Theme today: ${theme.name} — ${theme.angle}`;

  const raw = await callAI(sys, `Generate today's Batch 1 content as valid JSON:
Reddit context: ${redditContext}

Return this exact JSON structure (no markdown, raw JSON only):
{
  "tweet1": "engaging tweet under 270 chars with referral link",
  "tweet2": "different angle tweet under 270 chars with referral link",
  "tweet3": "data/stat tweet under 270 chars with referral link",
  "hookA": "curiosity hook variation A (1 punchy line)",
  "hookB": "pain-point hook variation B (1 punchy line)",
  "hookC": "social proof hook variation C (1 punchy line)",
  "ctaA": "CTA for hook A",
  "ctaB": "CTA for hook B",
  "ctaC": "CTA for hook C",
  "reelScript": "30-second reel script 3-act: Hook / Value / CTA. Include referral link in CTA.",
  "storyIdea": "IG story concept: what to show, what to say, swipe-up text",
  "communityPrompt": "engaging question to post in trading communities to spark discussion + subtly mention VEDD",
  "imagePrompt": "DALL-E prompt for a professional trading/finance themed image for today's theme: ${theme.name}"
}`);

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      tweets: [parsed.tweet1, parsed.tweet2, parsed.tweet3].filter(Boolean),
      hookA: parsed.hookA ?? '',
      hookB: parsed.hookB ?? '',
      hookC: parsed.hookC ?? '',
      reelScript: parsed.reelScript ?? '',
      storyIdea: parsed.storyIdea ?? '',
      communityPrompt: parsed.communityPrompt ?? '',
      imagePrompt: parsed.imagePrompt ?? `Professional trading dashboard with AI charts, theme: ${theme.name}`,
    };
  } catch {
    return {
      tweets: [`🚀 ${theme.angle} — VEDD makes it easy. ${REFERRAL_LINK}`],
      hookA: `Are you trading blind?`, hookB: `Most traders fail because of this one thing.`, hookC: `10,000+ traders trust VEDD AI.`,
      reelScript: `Hook: Are you leaving money on the table?\nValue: VEDD AI analyzes your trades in real-time.\nCTA: Start free at ${REFERRAL_LINK}`,
      storyIdea: `Show a live VEDD chart → swipe up for free trial`,
      communityPrompt: `What's your biggest challenge with trade timing? VEDD AI helped me solve this — ${REFERRAL_LINK}`,
      imagePrompt: `Professional AI trading dashboard, dark theme, financial charts, futuristic`,
    };
  }
}

// ── Content generation (Batch 2) ─────────────────────────────────────────────
async function generateBatch2(theme: typeof WEEKLY_THEMES[0], redditContext: string): Promise<{
  linkedinPost1: string;
  linkedinPost2: string;
  igCaption1: string;
  igCaption2: string;
  igCaption3: string;
  bonusContent: string;
}> {
  const sys = `You are VEDD's LinkedIn & Instagram content strategist. VEDD (veddbuild.com) is an AI-powered trading platform. Generate professional, high-engagement content.
Always include the referral link: ${REFERRAL_LINK}
Theme: ${theme.name} — ${theme.angle}`;

  const raw = await callAI(sys, `Generate Batch 2 content as valid JSON (no markdown):
Reddit insights: ${redditContext}

{
  "linkedinPost1": "LinkedIn article-style post 150-200 words professional tone with hook, value, referral link",
  "linkedinPost2": "LinkedIn carousel teaser post: '5 things traders using AI get right...' format with referral link",
  "igCaption1": "Instagram caption with emojis, hashtags (10-15 relevant ones), referral link in bio note",
  "igCaption2": "Instagram caption motivational angle with hashtags and referral link",
  "igCaption3": "Instagram caption educational tip with hashtags and referral link",
  "bonusContent": "Day-specific bonus: ${theme.name} — a bonus tip, poll idea, or community challenge"
}`);

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      linkedinPost1: parsed.linkedinPost1 ?? '',
      linkedinPost2: parsed.linkedinPost2 ?? '',
      igCaption1: parsed.igCaption1 ?? '',
      igCaption2: parsed.igCaption2 ?? '',
      igCaption3: parsed.igCaption3 ?? '',
      bonusContent: parsed.bonusContent ?? '',
    };
  } catch {
    const base = `${theme.angle}\n\nDiscover how VEDD AI gives you the edge: ${REFERRAL_LINK}`;
    return {
      linkedinPost1: `${theme.name}: ${base}`,
      linkedinPost2: `5 things top traders do differently — VEDD AI tracks them all. ${REFERRAL_LINK}`,
      igCaption1: `📈 ${theme.angle}\n\n${REFERRAL_LINK}\n\n#trading #forex #daytrading #AI #VEDD`,
      igCaption2: `💪 ${theme.name} energy. Let VEDD AI handle the analysis. ${REFERRAL_LINK}`,
      igCaption3: `🎯 Pro tip: ${theme.modules[0]}. VEDD makes this automatic. ${REFERRAL_LINK}`,
      bonusContent: `Bonus: ${theme.name} challenge — post your trading goal for the week!`,
    };
  }
}

// ── Analyze Reddit insights ───────────────────────────────────────────────────
async function analyzeRedditInsights(posts: any[], theme: string): Promise<{ insights: string[]; context: string }> {
  if (!posts.length) return { insights: [], context: 'No Reddit data available.' };

  const sample = posts.slice(0, 10).map((p: any) => `[${p.subreddit}] "${p.title}" (${p.score} upvotes)`).join('\n');
  const sys = 'You are a trading community analyst extracting marketing insights.';

  const raw = await callAI(sys, `Analyze these Reddit posts for a trading platform ambassador. Theme: ${theme}
Posts:
${sample}

Return JSON: { "insights": ["insight 1", "insight 2", "insight 3"], "context": "2-sentence synthesis for content generation" }`);

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return { insights: parsed.insights ?? [], context: parsed.context ?? sample };
  } catch {
    return { insights: [], context: sample.slice(0, 500) };
  }
}

// ── Main run function ─────────────────────────────────────────────────────────
export async function runAmbassadorPrime(triggeredBy = 'scheduler'): Promise<{
  success: boolean;
  runDate: string;
  summary: string;
  completedSteps: string[];
  skippedSteps: string[];
  errors: string[];
}> {
  const now = new Date();
  const runDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
  const dayOfWeek = now.getUTCDay(); // 0=Sun, 1=Mon … 6=Sat (JS), we want Mon=0
  const themeDayIndex = (dayOfWeek + 6) % 7; // Convert: Mon=0 … Sun=6
  const theme = WEEKLY_THEMES[themeDayIndex] ?? WEEKLY_THEMES[0];
  const dayName = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][dayOfWeek];

  console.log(`[ambassador-prime] Starting run for ${runDate} (${dayName}) — theme: ${theme.name}`);

  const completedSteps: string[] = [];
  const skippedSteps: string[] = [];
  const errors: string[] = [];

  let tweetsPosted = 0;
  let linkedinPosts = 0;
  let igCaptionsGenerated = 0;
  let imageGenerated = false;
  let imageUrl: string | null = null;
  let redditInsightsCount = 0;
  let engagementOpportunities = 0;
  let batch1: Awaited<ReturnType<typeof generateBatch1>> | null = null;
  let batch2: Awaited<ReturnType<typeof generateBatch2>> | null = null;

  // ── Step 1: Free Research (Reddit JSON + News RSS — no API keys needed) ─────
  let redditContext = 'No community data available.';
  let redditPosts: any[] = [];
  let newsHeadlines: string[] = [];
  try {
    // Run Reddit and news scraping in parallel — both free, no keys
    const [redditResult, headlines] = await Promise.all([
      scrapeRedditInsights(theme.angle),
      scrapeNewsRSS(theme.angle),
    ]);

    redditPosts = redditResult.posts;
    newsHeadlines = headlines;

    const analysis = await analyzeRedditInsights(redditPosts, theme.angle);
    redditInsightsCount = analysis.insights.length;
    engagementOpportunities = redditPosts.length;

    // Build combined context: Reddit + news headlines
    const newsSnippet = newsHeadlines.length
      ? `\nToday's market headlines: ${newsHeadlines.slice(0, 5).join(' | ')}`
      : '';
    redditContext = analysis.context + newsSnippet;

    for (const insight of analysis.insights) {
      await db.insert(ambassadorRedditInsights).values({
        runDate,
        subreddit: 'aggregated',
        insight,
        engagementOpportunity: redditContext.slice(0, 200),
      });
    }
    completedSteps.push('Free Research (Reddit + News RSS)');
    await logStep(runDate, 'Free Research (Reddit + News RSS)', 'completed');
  } catch (e: any) {
    errors.push(`Research: ${e.message}`);
    skippedSteps.push('Free Research');
    await logStep(runDate, 'Free Research (Reddit + News RSS)', 'failed', e.message);
  }

  // ── Step 2: Batch 1 AI Content Generation ─────────────────────────────────
  try {
    batch1 = await generateBatch1(theme, redditContext, themeDayIndex);
    completedSteps.push('Batch 1 AI Generation');
    await logStep(runDate, 'Batch 1 AI Generation', 'completed');
  } catch (e: any) {
    errors.push(`Batch 1 AI: ${e.message}`);
    skippedSteps.push('Batch 1 AI Generation');
    await logStep(runDate, 'Batch 1 AI Generation', 'failed', e.message);
  }

  // ── Step 3: Batch 2 AI Content Generation ─────────────────────────────────
  try {
    batch2 = await generateBatch2(theme, redditContext);
    completedSteps.push('Batch 2 AI Generation');
    await logStep(runDate, 'Batch 2 AI Generation', 'completed');
  } catch (e: any) {
    errors.push(`Batch 2 AI: ${e.message}`);
    skippedSteps.push('Batch 2 AI Generation');
    await logStep(runDate, 'Batch 2 AI Generation', 'failed', e.message);
  }

  // ── Step 4: DALL-E Image ───────────────────────────────────────────────────
  try {
    const imagePrompt = batch1?.imagePrompt ?? `Professional trading AI dashboard, ${theme.name} theme, dark background`;
    imageUrl = await generateDalleImage(imagePrompt);
    if (imageUrl) {
      imageGenerated = true;
      completedSteps.push('DALL-E Image Generation');
      await logStep(runDate, 'DALL-E Image Generation', 'completed');
    } else {
      const skipReason = !process.env.OPENAI_API_KEY
        ? 'OPENAI_API_KEY not set in server environment — DALL-E image generation requires it'
        : 'DALL-E returned no image URL (check server logs for the API error)';
      errors.push(`Image: ${skipReason}`);
      skippedSteps.push('DALL-E Image Generation');
      await logStep(runDate, 'DALL-E Image Generation', 'skipped', skipReason);
    }
  } catch (e: any) {
    errors.push(`DALL-E: ${e.message}`);
    skippedSteps.push('DALL-E Image Generation');
    await logStep(runDate, 'DALL-E Image Generation', 'failed', e.message);
  }

  // ── Step 5: Twitter (auto-post if keys set, otherwise save as ready-to-post) ─
  if (batch1?.tweets.length) {
    const hasTwitterKeys = !!(process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN);
    for (const tweet of batch1.tweets) {
      try {
        const postId = hasTwitterKeys ? await postTweet(tweet) : null;
        const status = postId ? 'posted' : 'ready_to_post';
        if (postId) tweetsPosted++;
        await db.insert(ambassadorDailyContent).values({
          runDate, platform: 'twitter', postType: 'tweet',
          contentText: tweet, postId: postId ?? undefined, status, referralLink: REFERRAL_LINK,
        });
      } catch (e: any) {
        errors.push(`Tweet: ${e.message}`);
        // Still save content even if posting failed
        await db.insert(ambassadorDailyContent).values({
          runDate, platform: 'twitter', postType: 'tweet',
          contentText: tweet, status: 'ready_to_post', referralLink: REFERRAL_LINK,
        }).catch(() => {});
      }
    }
    const label = hasTwitterKeys ? 'Twitter Posting' : 'Twitter Content (ready to post)';
    completedSteps.push(label);
    await logStep(runDate, label, 'completed');
  } else {
    skippedSteps.push('Twitter Content');
    await logStep(runDate, 'Twitter Content', 'skipped', 'No tweets generated');
  }

  // ── Step 6: Hook Variations DB Save ──────────────────────────────────────
  if (batch1) {
    try {
      for (const [v, hook, cta] of [
        ['A', batch1.hookA, ''],
        ['B', batch1.hookB, ''],
        ['C', batch1.hookC, ''],
      ] as [string, string, string][]) {
        await db.insert(ambassadorHookVariations).values({ runDate, variation: v, hookText: hook, ctaText: cta });
      }
      // Reel script
      await db.insert(ambassadorDailyContent).values({
        runDate, platform: 'instagram', postType: 'reel_script',
        contentText: batch1.reelScript, status: 'generated', referralLink: REFERRAL_LINK,
      });
      // Story idea
      await db.insert(ambassadorDailyContent).values({
        runDate, platform: 'instagram', postType: 'story',
        contentText: batch1.storyIdea, status: 'generated', referralLink: REFERRAL_LINK,
      });
      completedSteps.push('Hook Variations & Reel');
      await logStep(runDate, 'Hook Variations & Reel', 'completed');
    } catch (e: any) {
      errors.push(`Hook variations: ${e.message}`);
      skippedSteps.push('Hook Variations & Reel');
    }
  }

  // ── Step 7: LinkedIn Posting ──────────────────────────────────────────────
  if (batch2) {
    for (const [idx, post] of [[1, batch2.linkedinPost1], [2, batch2.linkedinPost2]] as [number, string][]) {
      try {
        const hasLinkedIn = !!process.env.LINKEDIN_ACCESS_TOKEN;
        const postId = hasLinkedIn ? await postLinkedIn(post) : null;
        const status = postId ? 'posted' : 'ready_to_post';
        if (postId) linkedinPosts++;
        await db.insert(ambassadorDailyContent).values({
          runDate, platform: 'linkedin', postType: `post_${idx}`,
          contentText: post, postId: postId ?? undefined, status, referralLink: REFERRAL_LINK,
        });
      } catch (e: any) {
        errors.push(`LinkedIn post ${idx}: ${e.message}`);
        await db.insert(ambassadorDailyContent).values({
          runDate, platform: 'linkedin', postType: `post_${idx}`,
          contentText: post, status: 'ready_to_post', referralLink: REFERRAL_LINK,
        }).catch(() => {});
      }
    }
    const hasLinkedIn = !!process.env.LINKEDIN_ACCESS_TOKEN;
    const liLabel = hasLinkedIn ? 'LinkedIn Posting' : 'LinkedIn Content (ready to post)';
    completedSteps.push(liLabel);
    await logStep(runDate, liLabel, 'completed');
  }

  // ── Step 8: Instagram Captions & Batch 2 content ─────────────────────────
  if (batch2) {
    try {
      for (const [idx, cap] of [
        [1, batch2.igCaption1],
        [2, batch2.igCaption2],
        [3, batch2.igCaption3],
      ] as [number, string][]) {
        await db.insert(ambassadorDailyContent).values({
          runDate, platform: 'instagram', postType: `caption_${idx}`,
          contentText: cap, status: 'generated', referralLink: REFERRAL_LINK,
        });
        igCaptionsGenerated++;
      }
      // Bonus content
      await db.insert(ambassadorBonusContent).values({
        runDate, dayOfWeek: dayName, contentType: 'bonus_tip', contentText: batch2.bonusContent,
      });
      completedSteps.push('Instagram Captions');
      await logStep(runDate, 'Instagram Captions', 'completed');
    } catch (e: any) {
      errors.push(`IG captions: ${e.message}`);
      skippedSteps.push('Instagram Captions');
      await logStep(runDate, 'Instagram Captions', 'failed', e.message);
    }
  }

  // ── Step 9: Community Content ─────────────────────────────────────────────
  if (batch1?.communityPrompt) {
    try {
      await db.insert(ambassadorCommunityContent).values({
        runDate, contentType: 'community_prompt', contentText: batch1.communityPrompt,
      });
      completedSteps.push('Community Content');
      await logStep(runDate, 'Community Content', 'completed');
    } catch (e: any) {
      errors.push(`Community content: ${e.message}`);
    }
  }

  // ── Step 10: Consolidated DB writes (summary + KPIs) ─────────────────────
  try {
    await db.insert(ambassadorRunSummary).values({
      runDate,
      tweetsPosted,
      linkedinPosts,
      igCaptionsGenerated,
      redditPostsScraped: redditPosts.length,
      emailSent: false,
      imageGenerated,
      dayTheme: theme.name,
    }).onConflictDoNothing();

    await db.insert(ambassadorDailyKpis).values({
      runDate,
      subscriberGrowthPosts: tweetsPosted + linkedinPosts,
      referralLinksIncluded: tweetsPosted + linkedinPosts + igCaptionsGenerated,
      totalPostsPublished: tweetsPosted + linkedinPosts,
      estimatedReach: (tweetsPosted * 500) + (linkedinPosts * 800),
      redditInsightsCount,
      engagementOpportunities,
      moduleTopic: theme.modules[0] ?? theme.name,
    }).onConflictDoNothing();

    // Update weekly calendar
    const calRows = await db.select().from(ambassadorWeeklyCalendar).limit(1);
    if (calRows.length === 0) {
      await db.insert(ambassadorWeeklyCalendar).values({
        currentWeekNumber: 1, lastRunDate: runDate, lastRunDayOfWeek: dayName, totalRuns: 1,
      });
    } else {
      await db.update(ambassadorWeeklyCalendar)
        .set({ lastRunDate: runDate, lastRunDayOfWeek: dayName, totalRuns: (calRows[0].totalRuns ?? 0) + 1 });
    }
    completedSteps.push('DB Summary & KPIs');
    await logStep(runDate, 'DB Summary & KPIs', 'completed');
  } catch (e: any) {
    errors.push(`DB writes: ${e.message}`);
    skippedSteps.push('DB Summary & KPIs');
    await logStep(runDate, 'DB Summary & KPIs', 'failed', e.message);
  }

  // ── Step 11: Email Report ─────────────────────────────────────────────────
  const hasTwitterKeys = !!(process.env.TWITTER_API_KEY && process.env.TWITTER_ACCESS_TOKEN);
  const hasLinkedInKey = !!process.env.LINKEDIN_ACCESS_TOKEN;
  const emailSuccess = await sendAmbassadorPrimeReport({
    runDate, dayName, theme,
    tweetsPosted, linkedinPosts, igCaptionsGenerated,
    redditInsightsCount, engagementOpportunities, imageGenerated, imageUrl,
    newsHeadlines,
    hasTwitterKeys, hasLinkedInKey,
    tweets: batch1?.tweets ?? [],
    linkedinPost1: batch2?.linkedinPost1 ?? '',
    linkedinPost2: batch2?.linkedinPost2 ?? '',
    igCaptions: [batch2?.igCaption1 ?? '', batch2?.igCaption2 ?? '', batch2?.igCaption3 ?? ''],
    hooks: { A: batch1?.hookA ?? '', B: batch1?.hookB ?? '', C: batch1?.hookC ?? '' },
    reelScript: batch1?.reelScript ?? '',
    storyIdea: batch1?.storyIdea ?? '',
    bonusContent: batch2?.bonusContent ?? '',
    communityPrompt: batch1?.communityPrompt ?? '',
    completedSteps, skippedSteps, errors,
  });

  if (emailSuccess) {
    await db.update(ambassadorRunSummary).set({ emailSent: true }).where(eq(ambassadorRunSummary.runDate, runDate));
    completedSteps.push('Email Report');
    await logStep(runDate, 'Email Report', 'completed');
  } else {
    errors.push('Email report failed to send');
    await logStep(runDate, 'Email Report', 'failed', 'SendGrid error or missing key');
  }

  const success = emailSuccess;
  const summary = `${theme.name} | ${tweetsPosted} tweets posted | ${linkedinPosts} LinkedIn | ${igCaptionsGenerated} IG captions | ${completedSteps.length} steps completed`;
  console.log(`[ambassador-prime] Run complete: ${summary}`);
  return { success, runDate, summary, completedSteps, skippedSteps, errors };
}

// ── Email report builder ──────────────────────────────────────────────────────
async function sendAmbassadorPrimeReport(data: {
  runDate: string; dayName: string; theme: typeof WEEKLY_THEMES[0];
  tweetsPosted: number; linkedinPosts: number; igCaptionsGenerated: number;
  redditInsightsCount: number; engagementOpportunities: number;
  imageGenerated: boolean; imageUrl: string | null;
  newsHeadlines: string[];
  hasTwitterKeys: boolean; hasLinkedInKey: boolean;
  tweets: string[]; linkedinPost1: string; linkedinPost2: string;
  igCaptions: string[]; hooks: { A: string; B: string; C: string };
  reelScript: string; storyIdea: string; bonusContent: string; communityPrompt: string;
  completedSteps: string[]; skippedSteps: string[]; errors: string[];
}): Promise<boolean> {
  const sgKey = process.env.SENDGRID_API_KEY;
  if (!sgKey) return false;

  const noApiMode = !data.hasTwitterKeys && !data.hasLinkedInKey;
  const tweetLabel = data.hasTwitterKeys ? 'Tweet' : '🐦 Copy & post to Twitter';

  const tweetRows = data.tweets.map((t, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #222;color:#aaa;font-size:12px;">${tweetLabel} ${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #222;font-size:13px;">${escHtml(t)}</td>
    </tr>`).join('');

  const igRows = data.igCaptions.map((c, i) => `
    <tr>
      <td style="padding:8px;border-bottom:1px solid #222;color:#aaa;font-size:12px;">Caption ${i + 1}</td>
      <td style="padding:8px;border-bottom:1px solid #222;font-size:13px;">${escHtml(c.slice(0, 200))}…</td>
    </tr>`).join('');

  const stepsBadge = (steps: string[], color: string) =>
    steps.map(s => `<span style="display:inline-block;margin:2px;padding:3px 8px;background:${color}22;border:1px solid ${color};border-radius:4px;font-size:11px;color:${color};">${s}</span>`).join(' ');

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>VEDD Ambassador Prime — ${data.runDate}</title></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:'Segoe UI',Arial,sans-serif;color:#e0e0e0;">
<div style="max-width:720px;margin:0 auto;padding:24px;">
  <div style="background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #00d4ff33;border-radius:12px;padding:28px;margin-bottom:20px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#00d4ff;margin-bottom:8px;">VEDD Ambassador Prime</div>
    <h1 style="margin:0 0 4px;font-size:26px;font-weight:700;color:#fff;">${data.theme.name}</h1>
    <div style="font-size:13px;color:#888;">${data.dayName}, ${data.runDate} — Daily Growth Report</div>
  </div>

  <!-- No-API mode banner -->
  ${noApiMode ? `
  <div style="background:rgba(249,115,22,.1);border:1px solid rgba(249,115,22,.3);border-radius:8px;padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:12px;font-weight:700;color:#f97316;margin-bottom:4px;">📋 Copy-Paste Mode — All content ready to post manually</div>
    <div style="font-size:12px;color:#aaa;">No Twitter/LinkedIn API keys detected. Content is generated and emailed to you — just copy each section below and paste directly into the platform.</div>
  </div>` : ''}

  <!-- News headlines -->
  ${data.newsHeadlines.length ? `
  <div style="background:#111;border:1px solid #1a2a1a;border-radius:8px;padding:14px 16px;margin-bottom:16px;">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#3fb950;margin-bottom:8px;">📰 Today's Market Headlines (Free RSS)</div>
    ${data.newsHeadlines.map(h => `<div style="font-size:12px;color:#ccc;padding:4px 0;border-bottom:1px solid #1a1a1a;">${escHtml(h)}</div>`).join('')}
  </div>` : ''}

  <!-- KPI Row -->
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:20px;">
    ${[
      ['🐦', data.hasTwitterKeys ? 'Tweets Posted' : 'Tweets Generated', data.hasTwitterKeys ? data.tweetsPosted : data.tweets?.length ?? 0],
      ['💼', data.hasLinkedInKey ? 'LinkedIn Posted' : 'LinkedIn Generated', data.hasLinkedInKey ? data.linkedinPosts : 2],
      ['📸', 'IG Captions', data.igCaptionsGenerated],
      ['🔍', 'Reddit Posts', data.engagementOpportunities],
      ['📰', 'News Headlines', data.newsHeadlines.length],
      ['🖼️', 'Image Generated', data.imageGenerated ? 'Yes' : 'No'],
    ].map(([icon, label, val]) => `
    <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;text-align:center;">
      <div style="font-size:22px;margin-bottom:6px;">${icon}</div>
      <div style="font-size:22px;font-weight:700;color:#00d4ff;">${val}</div>
      <div style="font-size:11px;color:#666;margin-top:4px;">${label}</div>
    </div>`).join('')}
  </div>

  <!-- Steps -->
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:12px;color:#888;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px;">Completed Steps</div>
    <div>${stepsBadge(data.completedSteps, '#00d4ff')}</div>
    ${data.skippedSteps.length ? `<div style="margin-top:8px;">${stepsBadge(data.skippedSteps, '#888')}</div>` : ''}
    ${data.errors.length ? `<div style="margin-top:8px;font-size:11px;color:#ff4444;">Errors: ${data.errors.map(escHtml).join(' | ')}</div>` : ''}
  </div>

  ${data.imageUrl ? `<div style="margin-bottom:16px;"><img src="${data.imageUrl}" alt="Generated" style="width:100%;border-radius:8px;border:1px solid #333;"></div>` : ''}

  <!-- Tweets -->
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:12px;">🐦 Tweets</div>
    <table style="width:100%;border-collapse:collapse;">${tweetRows}</table>
  </div>

  <!-- LinkedIn -->
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:12px;">💼 LinkedIn Posts</div>
    <div style="font-size:13px;color:#ccc;margin-bottom:12px;padding:10px;background:#0a0a0a;border-radius:6px;white-space:pre-wrap;">${escHtml(data.linkedinPost1.slice(0, 300))}…</div>
    <div style="font-size:13px;color:#ccc;padding:10px;background:#0a0a0a;border-radius:6px;white-space:pre-wrap;">${escHtml(data.linkedinPost2.slice(0, 300))}…</div>
  </div>

  <!-- IG Captions -->
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:12px;">📸 Instagram Captions</div>
    <table style="width:100%;border-collapse:collapse;">${igRows}</table>
  </div>

  <!-- Hook Variations -->
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:12px;">🎣 Hook Variations (A/B/C Test)</div>
    ${['A','B','C'].map(v => `<div style="margin-bottom:8px;padding:8px;background:#0a0a0a;border-left:3px solid #00d4ff;border-radius:4px;font-size:13px;"><strong style="color:#00d4ff;">${v}:</strong> ${escHtml(data.hooks[v as 'A'|'B'|'C'])}</div>`).join('')}
  </div>

  <!-- Reel + Story -->
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:8px;">🎬 Reel Script</div>
    <div style="font-size:12px;color:#ccc;white-space:pre-wrap;padding:8px;background:#0a0a0a;border-radius:4px;">${escHtml(data.reelScript)}</div>
    <div style="font-size:13px;font-weight:600;color:#fff;margin:12px 0 8px;">📱 Story Idea</div>
    <div style="font-size:12px;color:#ccc;padding:8px;background:#0a0a0a;border-radius:4px;">${escHtml(data.storyIdea)}</div>
  </div>

  <!-- Community + Bonus -->
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:8px;">💬 Community Prompt</div>
    <div style="font-size:12px;color:#ccc;padding:8px;background:#0a0a0a;border-radius:4px;">${escHtml(data.communityPrompt)}</div>
    <div style="font-size:13px;font-weight:600;color:#fff;margin:12px 0 8px;">🎁 Bonus Content (${data.dayName})</div>
    <div style="font-size:12px;color:#ccc;padding:8px;background:#0a0a0a;border-radius:4px;">${escHtml(data.bonusContent)}</div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding:20px;color:#444;font-size:11px;">
    <div>VEDD Ambassador Prime • ${data.runDate}</div>
    <div style="margin-top:4px;">Referral link: <a href="${REFERRAL_LINK}" style="color:#00d4ff;">${REFERRAL_LINK}</a></div>
  </div>
</div>
</body></html>`;

  try {
    const { default: sgMail } = await import('@sendgrid/mail');
    sgMail.setApiKey(sgKey);
    await sgMail.send({
      to: REPORT_EMAIL,
      from: 'noreply@veddbuild.com',
      subject: `VEDD Ambassador Prime — ${data.theme.name} (${data.runDate})`,
      html,
    });
    return true;
  } catch (e: any) {
    console.error('[ambassador-prime] Email send error:', e.message);
    return false;
  }
}

function escHtml(s: string): string {
  return (s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
export function startAmbassadorPrimeScheduler() {
  function scheduleNext() {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(9, 0, 0, 0); // 09:00 UTC daily
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    console.log(`[ambassador-prime] Next run at ${next.toISOString()} (in ${Math.round(delay / 60000)} min)`);
    setTimeout(async () => {
      try {
        await runAmbassadorPrime('scheduler');
      } catch (e: any) {
        console.error('[ambassador-prime] Scheduler run error:', e.message);
      }
      scheduleNext();
    }, delay);
  }
  scheduleNext();
}
