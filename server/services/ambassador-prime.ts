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
  devotionals,
  weeklyStrategies,
} from '../../shared/schema';
import { eq, desc, sql as drizzleSql } from 'drizzle-orm';
import { OpenAI } from 'openai';
import { saveMarketBriefing, currentWeekStartDate, clampConfidenceBoost, type BriefingPair } from './ambassador-market-briefing';
import { generateContentImage } from './image-generation';

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
async function scrapeNewsRSS(theme: string, pairSymbols: string[] = []): Promise<string[]> {
  const headlines: string[] = [];
  const keywords = encodeURIComponent(`trading ${theme.split(' ').slice(0, 2).join(' ')}`);

  const feeds = [
    // Google News RSS — completely free
    `https://news.google.com/rss/search?q=${keywords}+trading+forex&hl=en-US&gl=US&ceid=US:en`,
    // Yahoo Finance RSS
    `https://finance.yahoo.com/news/rssindex`,
    // Pair-specific search — grounds the research in this week's ACTUAL
    // pairs (from the weekly plan) instead of only the generic theme angle.
    ...pairSymbols.slice(0, 3).map(sym =>
      `https://news.google.com/rss/search?q=${encodeURIComponent(sym)}+forex&hl=en-US&gl=US&ceid=US:en`
    ),
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

// OpenRouter (free DeepSeek tier) is now the app-wide default primary — cheapest
// option, matching the same default used by every engine's universal AI client
// in openai.ts. OpenAI is the failover, only used if OpenRouter errors or no
// OPENROUTER_API_KEY is configured at all.
async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
  const messages = [
    { role: 'system' as const, content: systemPrompt },
    { role: 'user' as const, content: userPrompt },
  ];
  const orKey = process.env.OPENROUTER_API_KEY;
  if (orKey) {
    try {
      const orClient = new OpenAI({
        apiKey: orKey,
        baseURL: 'https://openrouter.ai/api/v1',
        maxRetries: 2,
        timeout: 90000,
        defaultHeaders: { 'HTTP-Referer': 'https://veddbuild.com', 'X-Title': 'VEDDBuild' },
      });
      const res = await orClient.chat.completions.create({
        model: 'deepseek/deepseek-chat-v3-0324:free', messages, temperature: 0.7, max_tokens: 2000,
      });
      return res.choices[0]?.message?.content?.trim() ?? '';
    } catch (e: any) {
      console.warn('[ambassador-prime] OpenRouter failed — falling back to OpenAI:', e.message);
    }
  }

  const apiKey = process.env.OPENAI_API_KEY;
  const client = new OpenAI({ apiKey: apiKey || '', maxRetries: 2, timeout: 90000 });
  const res = await client.chat.completions.create({
    model: 'gpt-4o', messages, temperature: 0.7, max_tokens: 2000,
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

// ── Weekly Market Briefing ────────────────────────────────────────────────────
// Ties Ambassador Prime's content to the actual pairs traders picked for the
// week, and feeds the resulting narrative + per-pair conviction back into the
// SS AI Engine's confirmation prompt (see ambassador-market-briefing.ts and
// its usage in openai.ts's buildConfirmationPrompt).

interface WeeklyPairTally { symbol: string; direction: 'BUY' | 'SELL' | 'BOTH'; mentionCount: number }

// Aggregates across EVERY user's ACTIVE weekly plan, read from the
// persisted weekly_strategies table — not just one account, and not the
// volatile global.mt5WeeklyStrategies in-memory cache (which this function
// used to read). That cache only gets populated when a user actively loads
// their weekly-strategy page during the CURRENT server process, so right
// after any deploy/restart it's empty and the briefing had no content even
// though real weekly plans existed in the database the whole time.
async function aggregateWeeklyPairs(): Promise<WeeklyPairTally[]> {
  const activePlans = await db.select().from(weeklyStrategies).where(eq(weeklyStrategies.isActive, true));
  const tally: Record<string, { symbol: string; directions: Record<string, number>; mentionCount: number }> = {};

  for (const row of activePlans) {
    const weeklyPlan = (row.plan as any)?.weeklyPlan;
    if (!weeklyPlan) continue;
    for (const day of Object.keys(weeklyPlan)) {
      const pairs = weeklyPlan[day]?.pairs || [];
      for (const p of pairs) {
        const sym = (p.symbol || '').toUpperCase().replace('/', '');
        // USD-quoted pairs only (EURUSD, GBPUSD, XAUUSD, etc.) — Ambassador
        // Prime's content is scoped to USD majors, not cross-pairs (EURGBP),
        // indices (US30), or other non-USD instruments the weekly plan may
        // also include.
        if (!sym || !sym.includes('USD')) continue;
        if (!tally[sym]) tally[sym] = { symbol: p.symbol, directions: {}, mentionCount: 0 };
        tally[sym].mentionCount++;
        const dir = (p.direction || 'BOTH').toUpperCase();
        tally[sym].directions[dir] = (tally[sym].directions[dir] || 0) + 1;
      }
    }
  }

  console.log(`[ambassador-prime] Weekly plan check: ${activePlans.length} active plan(s) reviewed, ${Object.keys(tally).length} distinct USD pair(s) found.`);

  return Object.values(tally)
    .sort((a, b) => b.mentionCount - a.mentionCount)
    .slice(0, 8) // top 8 most-featured pairs this week — keeps the AI prompt focused
    .map(t => {
      const bestDir = Object.entries(t.directions).sort((a, b) => b[1] - a[1])[0]?.[0] as 'BUY' | 'SELL' | 'BOTH' | undefined;
      return { symbol: t.symbol, direction: bestDir || 'BOTH', mentionCount: t.mentionCount };
    });
}

async function generateWeeklyBriefing(redditContext: string, weeklyPairs: WeeklyPairTally[]): Promise<{ narrativeText: string; pairs: BriefingPair[] }> {
  if (weeklyPairs.length === 0) {
    return { narrativeText: 'No weekly pairs selected across active accounts yet — check back once weekly plans are generated.', pairs: [] };
  }

  const pairsList = weeklyPairs.map(p => `${p.symbol} (${p.direction}, featured ${p.mentionCount}x this week)`).join(', ');
  const sys = `You are VEDD's market analyst, writing for traders using VEDD AI Trading Vault (veddbuild.com). Be specific and grounded — no generic hype.`;
  const raw = await callAI(sys, `This week's most-featured trading pairs across VEDD users: ${pairsList}
Community + news context: ${redditContext}

Return valid JSON (no markdown):
{
  "narrative": "2-3 paragraph story explaining what's driving these pairs this week, referencing the community/news context naturally — this becomes both marketing copy and market context for the AI trading engine",
  "pairs": [
    { "symbol": "EURUSD", "strategyIdea": "1-sentence VEDD-specific strategy angle for this pair this week", "confidenceBoost": 0 }
  ]
}
confidenceBoost is an integer 0-5: how much extra conviction this week's research adds to trades on that pair (0 = neutral/no edge found, 5 = strongly supportive catalyst). Be conservative — most pairs should be 0-2. One "pairs" entry per pair listed above, using the exact symbol given.`);

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const parsedPairs: any[] = Array.isArray(parsed.pairs) ? parsed.pairs : [];
    const pairs: BriefingPair[] = weeklyPairs.map(wp => {
      const match = parsedPairs.find((p: any) => (p.symbol || '').toUpperCase().replace('/', '') === wp.symbol.toUpperCase().replace('/', ''));
      return {
        symbol: wp.symbol,
        direction: wp.direction,
        strategyIdea: match?.strategyIdea || '',
        confidenceBoost: clampConfidenceBoost(Number(match?.confidenceBoost) || 0),
        mentionCount: wp.mentionCount,
      };
    });
    return { narrativeText: parsed.narrative || pairsList, pairs };
  } catch {
    return {
      narrativeText: `This week's featured pairs across VEDD: ${pairsList}.`,
      pairs: weeklyPairs.map(wp => ({ symbol: wp.symbol, direction: wp.direction, strategyIdea: '', confidenceBoost: 0, mentionCount: wp.mentionCount })),
    };
  }
}

// ── Trade Devotional ───────────────────────────────────────────────────────────
// Reuses the same devotionals table the /api/devotionals/today route reads —
// whichever caller (a user opening the Devotional page, or this job) runs
// first for the day generates it; the unique `date` constraint + insert
// conflict handling keeps it idempotent either way.
async function getOrCreateTodayDevotional(today: string) {
  const [existing] = await db.select().from(devotionals).where(eq(devotionals.date, today)).limit(1);
  if (existing) return existing;
  try {
    const { generateDailyDevotional } = await import('../openai');
    const generated = await generateDailyDevotional(today);
    await db.insert(devotionals).values({ date: today, ...generated } as any).onConflictDoNothing();
    const [inserted] = await db.select().from(devotionals).where(eq(devotionals.date, today)).limit(1);
    return inserted ?? null;
  } catch (e: any) {
    console.error('[ambassador-prime] Devotional generation failed:', e.message);
    return null;
  }
}

// ── Weekly Results Stats ──────────────────────────────────────────────────────
// Real, aggregated (not cherry-picked) trading performance over the last 7
// days — the basis for the "Results" post's social proof, and honest even
// when the number isn't flattering.
//
// This previously read ONLY ai_trade_results, which is populated exclusively
// by Kalshi, Polymarket, MT5-EA-push confirmations, and an activity-gated
// TradeLocker auto-sync poller. Any week where real trades processed through
// the futures/crypto.com/options engines, paper trading, FX paper trading,
// or copy trading — all of which log to their own separate tables — showed
// up as "0 trades" here even though trading genuinely happened, producing a
// false "building in public, no trades this week" post. This now unions
// every table that actually represents closed trading activity.
async function computeWeeklyResultsStats(): Promise<{ totalTrades: number; wins: number; winRate: number; totalPips: number; topSymbol: string | null }> {
  try {
    const rows = await db.execute(drizzleSql`
      WITH combined AS (
        SELECT symbol, (result = 'WIN') AS is_win, closed_at
        FROM ai_trade_results
        WHERE closed_at >= NOW() - INTERVAL '7 days' AND result IS NOT NULL
        UNION ALL
        SELECT symbol, (realized_pnl > 0) AS is_win, closed_at
        FROM futures_engine_trades
        WHERE status = 'closed' AND closed_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT symbol, (realized_pnl > 0) AS is_win, closed_at
        FROM cryptocom_engine_trades
        WHERE status = 'closed' AND closed_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT underlying_symbol AS symbol, (realized_pnl > 0) AS is_win, closed_at
        FROM options_engine_trades
        WHERE status = 'closed' AND closed_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT symbol, (outcome = 'win') AS is_win, resolved_at AS closed_at
        FROM paper_trades
        WHERE outcome IS NOT NULL AND outcome != 'pending' AND resolved_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT pair AS symbol, (pnl > 0) AS is_win, closed_at
        FROM fx_paper_trades
        WHERE status = 'closed' AND closed_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT pair AS symbol, (pnl > 0) AS is_win, closed_at
        FROM copy_trade_logs
        WHERE status = 'closed' AND closed_at >= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT symbol, (realized_pnl > 0) AS is_win, created_at AS closed_at
        FROM tradovate_trade_logs
        WHERE action = 'CLOSE' AND status = 'executed' AND created_at >= NOW() - INTERVAL '7 days'
      ),
      tradelocker_only AS (
        SELECT COUNT(*) AS cnt
        FROM tradelocker_trade_logs
        WHERE action = 'CLOSE' AND status = 'executed' AND created_at >= NOW() - INTERVAL '7 days'
      )
      SELECT
        (SELECT COUNT(*) FROM combined) AS known_outcome_trades,
        (SELECT COUNT(*) FILTER (WHERE is_win) FROM combined) AS wins,
        (SELECT cnt FROM tradelocker_only) AS tradelocker_only_count,
        COALESCE((SELECT SUM(profit_loss_pips) FROM ai_trade_results WHERE closed_at >= NOW() - INTERVAL '7 days' AND result IS NOT NULL), 0) AS total_pips,
        (SELECT symbol FROM combined GROUP BY symbol ORDER BY COUNT(*) FILTER (WHERE is_win) DESC LIMIT 1) AS top_symbol
    `);
    const row: any = (rows as any)[0]?.[0] ?? (rows as any).rows?.[0] ?? {};
    const knownOutcomeTrades = parseInt(row.known_outcome_trades) || 0;
    const wins = parseInt(row.wins) || 0;
    const tradelockerOnlyCount = parseInt(row.tradelocker_only_count) || 0;
    return {
      totalTrades: knownOutcomeTrades + tradelockerOnlyCount,
      wins,
      winRate: knownOutcomeTrades > 0 ? Math.round((wins / knownOutcomeTrades) * 1000) / 10 : 0,
      totalPips: parseFloat(row.total_pips) || 0,
      topSymbol: row.top_symbol || null,
    };
  } catch (e: any) {
    console.error('[ambassador-prime] computeWeeklyResultsStats failed:', e.message);
    return { totalTrades: 0, wins: 0, winRate: 0, totalPips: 0, topSymbol: null };
  }
}

// ── Extra content: Knowledge / Results / Update posts ────────────────────────
async function generateExtraPosts(
  theme: typeof WEEKLY_THEMES[0],
  redditContext: string,
  results: { totalTrades: number; wins: number; winRate: number; totalPips: number; topSymbol: string | null },
  devotional: { affirmation?: string; tradingTieIn?: string | null; theme?: string } | null
): Promise<{ knowledgePost: string; resultsPost: string; updatePost: string }> {
  const resultsLine = results.totalTrades > 0
    ? `This week across VEDD: ${results.totalTrades} closed trades, ${results.winRate}% win rate, ${results.totalPips >= 0 ? '+' : ''}${results.totalPips.toFixed(0)} pips${results.topSymbol ? `, ${results.topSymbol} led the board` : ''}.`
    : 'No closed trades recorded yet this week — be honest, don\'t fabricate a number.';
  const devotionalLine = devotional
    ? `Today's devotional theme: "${devotional.theme}". Affirmation: "${devotional.affirmation}". Trading tie-in: ${devotional.tradingTieIn || 'discipline and patience compound over time'}.`
    : 'No devotional available today.';

  const sys = `You are VEDD's content strategist writing three distinct short-form posts for veddbuild.com. Always include the referral link: ${REFERRAL_LINK}. Theme: ${theme.name} — ${theme.angle}. Never invent statistics — use only the real numbers given.`;
  const raw = await callAI(sys, `Context:
${redditContext}

Real weekly results (use exactly as given, do not embellish): ${resultsLine}
Devotional context: ${devotionalLine}
This week's educational module: ${theme.modules[0]}

Return valid JSON (no markdown):
{
  "knowledgePost": "An educational post teaching one concrete concept from '${theme.modules[0]}' — practical, not generic motivational fluff.",
  "resultsPost": "A social-proof post built ONLY from the real results line above. If totalTrades is 0, write an honest 'building in public' post instead of pretending there's a result.",
  "updatePost": "A forward-looking platform update: what VEDD is focused on this week and a concrete goal for the days ahead. Can reference the devotional's trading tie-in naturally."
}`);

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      knowledgePost: parsed.knowledgePost || '',
      resultsPost: parsed.resultsPost || resultsLine,
      updatePost: parsed.updatePost || '',
    };
  } catch {
    return {
      knowledgePost: `Today's lesson: ${theme.modules[0]}. Master this, and VEDD's AI handles the rest. ${REFERRAL_LINK}`,
      resultsPost: `${resultsLine} ${REFERRAL_LINK}`,
      updatePost: `This week's focus: ${theme.name}. ${REFERRAL_LINK}`,
    };
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
  let devotionalPost = '';
  let knowledgePost = '';
  let resultsPost = '';
  let updatePost = '';

  // ── Step 0: Check the Weekly Plan FIRST ───────────────────────────────────
  // Read this week's actual USD-pair selections from every user's ACTIVE
  // weekly plan (persisted in the weekly_strategies table) before running
  // any research — so the Reddit/news scans below are grounded in the real
  // pairs being traded, not just the generic day theme.
  let weeklyPairs: WeeklyPairTally[] = [];
  try {
    weeklyPairs = await aggregateWeeklyPairs();
    completedSteps.push('Weekly Plan Review');
    await logStep(runDate, 'Weekly Plan Review', 'completed',
      weeklyPairs.length > 0 ? `Found ${weeklyPairs.length} featured pair(s): ${weeklyPairs.map(p => p.symbol).join(', ')}` : undefined);
  } catch (e: any) {
    errors.push(`Weekly Plan Review: ${e.message}`);
    skippedSteps.push('Weekly Plan Review');
    await logStep(runDate, 'Weekly Plan Review', 'failed', e.message);
  }

  // ── Step 1: Free Research (Reddit JSON + News RSS — no API keys needed) ─────
  let redditContext = 'No community data available.';
  let redditPosts: any[] = [];
  let newsHeadlines: string[] = [];
  try {
    // Run Reddit and news scraping in parallel — both free, no keys.
    // News RSS now also searches this week's actual pair symbols.
    const [redditResult, headlines] = await Promise.all([
      scrapeRedditInsights(theme.angle),
      scrapeNewsRSS(theme.angle, weeklyPairs.map(p => p.symbol)),
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

  // ── Step 1.5: Weekly Market Briefing ──────────────────────────────────────
  // Tells the story of the USD pairs checked in Step 0, using the pair-
  // informed research above, and persists it so the SS AI Engine's
  // confirmation prompt (openai.ts) can read the narrative and apply each
  // pair's (small, bounded) confidenceBoost.
  try {
    const briefing = await generateWeeklyBriefing(redditContext, weeklyPairs);
    await saveMarketBriefing(currentWeekStartDate(now), briefing.narrativeText, briefing.pairs);
    // Fold the briefing narrative into redditContext so Batch 1/2 content
    // naturally references this week's actual pairs, not just the day's theme.
    if (weeklyPairs.length > 0) {
      redditContext = `${redditContext}\n\nThis week's featured VEDD pairs: ${briefing.narrativeText}`;
    }
    completedSteps.push('Weekly Market Briefing');
    await logStep(runDate, 'Weekly Market Briefing', 'completed');
  } catch (e: any) {
    errors.push(`Weekly Briefing: ${e.message}`);
    skippedSteps.push('Weekly Market Briefing');
    await logStep(runDate, 'Weekly Market Briefing', 'failed', e.message);
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

  // ── Step 3.5: Devotional + Knowledge + Results + Update Posts ────────────
  try {
    const devotional = await getOrCreateTodayDevotional(runDate);
    const results = await computeWeeklyResultsStats();
    const extra = await generateExtraPosts(theme, redditContext, results, devotional as any);

    knowledgePost = extra.knowledgePost;
    resultsPost = extra.resultsPost;
    updatePost = extra.updatePost;
    if (devotional) {
      devotionalPost = `${devotional.affirmation}\n\n${devotional.tradingTieIn || devotional.reflection}\n\n${REFERRAL_LINK}`;
    }

    const rows: Array<{ postType: string; text: string }> = [
      ...(devotionalPost ? [{ postType: 'devotional_post', text: devotionalPost }] : []),
      { postType: 'knowledge_post', text: knowledgePost },
      { postType: 'results_post', text: resultsPost },
      { postType: 'update_post', text: updatePost },
    ];
    for (const r of rows) {
      await db.insert(ambassadorDailyContent).values({
        runDate, platform: 'multi', postType: r.postType,
        contentText: r.text, status: 'generated', referralLink: REFERRAL_LINK,
      });
    }
    completedSteps.push('Devotional/Knowledge/Results/Update Posts');
    await logStep(runDate, 'Devotional/Knowledge/Results/Update Posts', 'completed');
  } catch (e: any) {
    errors.push(`Extra posts: ${e.message}`);
    skippedSteps.push('Devotional/Knowledge/Results/Update Posts');
    await logStep(runDate, 'Devotional/Knowledge/Results/Update Posts', 'failed', e.message);
  }

  // ── Step 4: Image generation (DALL-E, falling back to Replicate FLUX) ──────
  if (!batch1) {
    // Batch 1 failed upstream — there's no real image prompt to work from, so
    // don't burn an image-gen call on a generic fallback prompt unrelated to
    // today's actual content.
    skippedSteps.push('Image Generation');
    await logStep(runDate, 'Image Generation', 'skipped', 'skipped: upstream failure (Batch 1 AI Generation failed — no image prompt available)');
  } else {
    try {
      const generated = await generateContentImage(batch1.imagePrompt);
      imageUrl = generated?.url ?? null;
      if (generated) {
        imageGenerated = true;
        completedSteps.push('Image Generation');
        await logStep(runDate, 'Image Generation', 'completed', `provider: ${generated.provider}`);
      } else {
        const skipReason = !process.env.OPENAI_API_KEY && !process.env.REPLICATE_API_TOKEN
          ? 'Neither OPENAI_API_KEY nor REPLICATE_API_TOKEN set — image generation requires at least one'
          : 'Both DALL-E and Replicate FLUX failed to return an image URL (check server logs for the API error)';
        errors.push(`Image: ${skipReason}`);
        skippedSteps.push('Image Generation');
        await logStep(runDate, 'Image Generation', 'skipped', skipReason);
      }
    } catch (e: any) {
      errors.push(`Image: ${e.message}`);
      skippedSteps.push('Image Generation');
      await logStep(runDate, 'Image Generation', 'failed', e.message);
    }
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
    const reason = !batch1
      ? 'skipped: upstream failure (Batch 1 AI Generation failed — no content available)'
      : 'No tweets generated by Batch 1 AI (parsed 0 tweets)';
    skippedSteps.push('Twitter Content');
    await logStep(runDate, 'Twitter Content', 'skipped', reason);
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

  // Backfill today's generated image onto every daily/bonus/community content
  // row for this run — done as one pass at the end so insert ordering across
  // steps (some of which run before Step 4's image generation) doesn't matter.
  if (imageUrl) {
    try {
      await db.update(ambassadorDailyContent).set({ imageUrl }).where(eq(ambassadorDailyContent.runDate, runDate));
      await db.update(ambassadorBonusContent).set({ imageUrl }).where(eq(ambassadorBonusContent.runDate, runDate));
      await db.update(ambassadorCommunityContent).set({ imageUrl }).where(eq(ambassadorCommunityContent.runDate, runDate));
    } catch (e: any) {
      console.error('[ambassador-prime] Backfilling imageUrl onto content rows failed (non-fatal):', e.message);
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
  const emailResult = await sendAmbassadorPrimeReport({
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
    devotionalPost, knowledgePost, resultsPost, updatePost,
    completedSteps, skippedSteps, errors,
  });

  if (emailResult.success) {
    await db.update(ambassadorRunSummary).set({ emailSent: true }).where(eq(ambassadorRunSummary.runDate, runDate));
    completedSteps.push('Email Report');
    await logStep(runDate, 'Email Report', 'completed');
  } else {
    errors.push(`Email report failed to send: ${emailResult.reason ?? 'Unknown error'}`);
    await logStep(runDate, 'Email Report', 'failed', emailResult.reason ?? 'Unknown SendGrid error');
  }

  const success = emailResult.success;
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
  devotionalPost: string; knowledgePost: string; resultsPost: string; updatePost: string;
  completedSteps: string[]; skippedSteps: string[]; errors: string[];
}): Promise<{ success: boolean; reason?: string }> {
  const sgKey = process.env.SENDGRID_API_KEY;
  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;
  if (!sgKey && !(gmailUser && gmailPass)) {
    const reason = 'No email channel configured — set SENDGRID_API_KEY (requires a verified sender/domain), or GMAIL_USER + GMAIL_APP_PASSWORD for a free no-domain-verification alternative (create an App Password at myaccount.google.com/apppasswords).';
    console.error('[ambassador-prime]', reason);
    return { success: false, reason };
  }

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

  <!-- Devotional / Knowledge / Results / Update -->
  ${[
    ['🙏', 'Trade Devotional', data.devotionalPost],
    ['📚', 'Knowledge Post', data.knowledgePost],
    ['📊', 'Results Post', data.resultsPost],
    ['📢', 'Update Post', data.updatePost],
  ].filter(([, , text]) => !!text).map(([icon, label, text]) => `
  <div style="background:#111;border:1px solid #222;border-radius:8px;padding:16px;margin-bottom:16px;">
    <div style="font-size:13px;font-weight:600;color:#fff;margin-bottom:8px;">${icon} ${label}</div>
    <div style="font-size:12px;color:#ccc;white-space:pre-wrap;padding:8px;background:#0a0a0a;border-radius:4px;">${escHtml(text)}</div>
  </div>`).join('')}

  <!-- Footer -->
  <div style="text-align:center;padding:20px;color:#444;font-size:11px;">
    <div>VEDD Ambassador Prime • ${data.runDate}</div>
    <div style="margin-top:4px;">Referral link: <a href="${REFERRAL_LINK}" style="color:#00d4ff;">${REFERRAL_LINK}</a></div>
  </div>
</div>
</body></html>`;

  const subject = `VEDD Ambassador Prime — ${data.theme.name} (${data.runDate})`;
  const sgErrors: string[] = [];

  if (sgKey) {
    try {
      const { default: sgMail } = await import('@sendgrid/mail');
      sgMail.setApiKey(sgKey);
      await sgMail.send({ to: REPORT_EMAIL, from: 'noreply@veddbuild.com', subject, html });
      return { success: true };
    } catch (e: any) {
      // SendGrid returns structured per-error detail in e.response.body.errors —
      // e.message alone is often just "Unauthorized" or "Bad Request", not
      // useful for diagnosing e.g. an unverified sender identity.
      const errDetail = e?.response?.body?.errors;
      const detail = Array.isArray(errDetail) && errDetail.length
        ? errDetail.map((er: any) => er.message).join('; ')
        : e.message;
      console.error('[ambassador-prime] SendGrid send failed, trying Gmail fallback if configured:', detail);
      sgErrors.push(`SendGrid: ${detail}`);
    }
  }

  // Free fallback — no domain verification required, just a Gmail account +
  // App Password (myaccount.google.com/apppasswords). Tried when SendGrid
  // isn't configured, or as a fallback when it just failed above.
  if (gmailUser && gmailPass) {
    const { sendGmail } = await import('../messaging');
    const plainSummary = `${data.theme.name} — ${data.dayName}, ${data.runDate}\n\n` +
      `Tweets: ${data.tweetsPosted}/${data.tweets.length} | LinkedIn: ${data.linkedinPosts} | IG captions: ${data.igCaptionsGenerated}\n` +
      `Completed steps: ${data.completedSteps.join(', ') || 'none'}\n` +
      `Skipped steps: ${data.skippedSteps.join(', ') || 'none'}\n` +
      (data.errors.length ? `Errors: ${data.errors.join(' | ')}\n` : '') +
      `\nFull report is in the HTML body of this email.`;
    const result = await sendGmail(REPORT_EMAIL, subject, plainSummary, html);
    if (result.success) return { success: true };
    sgErrors.push(`Gmail: ${result.error}`);
  }

  const reason = sgErrors.join(' | ') || 'No email channel configured';
  console.error('[ambassador-prime] All email channels failed:', reason);
  return { success: false, reason };
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
