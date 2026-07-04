import OpenAI from 'openai';
import { db } from '../db';
import { leads, leadHunterRuns } from '../../shared/schema';
import { sql, gte, desc } from 'drizzle-orm';
import sgMail from '@sendgrid/mail';

const DIGEST_TO = 'donchismkos@gmail.com';
const DIGEST_CC = 'chris@madetomaximize.com';
const FROM = 'VEDD Lead Hunter <noreply@veddbuild.com>';
const TWITTER_USER_ID = '1479666669366788098';
const LINKEDIN_PERSON_ID = 'tmH3fnyYMl';
const SKIP_USERNAMES = new Set(['donchism44', 'christopherchism', 'donchismkos']);

// ── Types ────────────────────────────────────────────────────────────────────

interface RawLead {
  platform: string;
  username: string;
  post_content: string;
  post_url: string;
  profile_url?: string;
  engagement?: number;
  num_comments?: number;
  follower_count?: number;
  headline?: string;
  subreddit?: string;
  tweet_id?: string;
  activity_id?: string;
  date?: string;
}

interface ScoredLead extends RawLead {
  intent_score: number;
  account_quality: number;
  contact_opportunity: string;
  suggested_reply: string;
  auto_engaged: boolean;
  engagement_type: string;
}

export interface RunResult {
  runId: number;
  totalScraped: number;
  newLeads: number;
  highIntent: number;
  autoEngaged: number;
  platformBreakdown: Record<string, number>;
}

// ── AI client ────────────────────────────────────────────────────────────────

function getAI(): OpenAI | null {
  const groq = process.env.GROQ_API_KEY;
  const oai = process.env.OPENAI_API_KEY;
  if (groq) return new OpenAI({ apiKey: groq, baseURL: 'https://api.groq.com/openai/v1' });
  if (oai) return new OpenAI({ apiKey: oai });
  return null;
}

async function aiChat(messages: { role: 'system' | 'user'; content: string }[]): Promise<string> {
  const ai = getAI();
  if (!ai) return '';
  // Groq: use current fast model. OpenAI: use gpt-4o-mini.
  const model = process.env.GROQ_API_KEY ? 'openai/gpt-oss-20b' : 'gpt-4o-mini';
  try {
    const res = await ai.chat.completions.create({
      model,
      messages,
      max_tokens: 1000,
      temperature: 0.3,
    });
    return res.choices[0]?.message?.content?.trim() || '';
  } catch {
    return '';
  }
}

// ── Apify scraper ────────────────────────────────────────────────────────────

async function apifyScrape(actorId: string, input: object): Promise<any[]> {
  const token = process.env.APIFY_API_TOKEN;
  if (!token) {
    console.log(`[LeadHunter] APIFY_API_TOKEN not set — skipping ${actorId}`);
    return [];
  }
  try {
    const res = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?token=${token}&timeout=90&memory=256`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
        signal: AbortSignal.timeout(100_000),
      }
    );
    if (!res.ok) {
      console.log(`[LeadHunter] Apify ${actorId} HTTP ${res.status}`);
      return [];
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (e: any) {
    console.log(`[LeadHunter] Apify ${actorId} error: ${e.message}`);
    return [];
  }
}

// ── Platform scrapers ────────────────────────────────────────────────────────

async function scrapeReddit(): Promise<RawLead[]> {
  // Uses Reddit's free public JSON API — no API key or Apify needed.
  const subreddits = ['algotrading', 'Forex', 'CryptoCurrency', 'Solana', 'Daytrading', 'stocks'];
  const searches = ['AI+trading+tools', 'chart+analysis+tool', 'trading+software'];
  const all: RawLead[] = [];
  const headers = { 'User-Agent': 'VEDDBuild-LeadHunter/1.0' };

  // Scrape new posts from each subreddit
  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/new.json?limit=25`, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      const posts = data?.data?.children || [];
      for (const { data: p } of posts) {
        if (!p || !p.selftext || p.selftext.length < 30) continue;
        const created = new Date(p.created_utc * 1000);
        const ageHours = (Date.now() - created.getTime()) / 3600000;
        if (ageHours > 48) continue; // only last 48h
        all.push({
          platform: 'Reddit',
          username: p.author || 'unknown',
          post_content: ((p.title || '') + ': ' + (p.selftext || '')).substring(0, 500),
          post_url: `https://www.reddit.com${p.permalink}`,
          subreddit: sub,
          engagement: p.ups || 0,
          num_comments: p.num_comments || 0,
          date: created.toISOString().substring(0, 10),
        });
      }
    } catch { /* skip on timeout */ }
  }

  // Search Reddit for specific trading keywords
  for (const q of searches) {
    try {
      const res = await fetch(`https://www.reddit.com/search.json?q=${q}&sort=new&t=week&limit=20`, { headers, signal: AbortSignal.timeout(15000) });
      if (!res.ok) continue;
      const data = await res.json();
      const posts = data?.data?.children || [];
      for (const { data: p } of posts) {
        if (!p || (p.selftext || '').length < 20) continue;
        all.push({
          platform: 'Reddit',
          username: p.author || 'unknown',
          post_content: ((p.title || '') + ': ' + (p.selftext || '')).substring(0, 500),
          post_url: `https://www.reddit.com${p.permalink}`,
          subreddit: p.subreddit || '',
          engagement: p.ups || 0,
          num_comments: p.num_comments || 0,
          date: new Date(p.created_utc * 1000).toISOString().substring(0, 10),
        });
      }
    } catch { /* skip */ }
  }

  console.log(`[LeadHunter] Reddit (free API): ${all.length} posts`);
  return all;
}

async function scrapeTwitter(): Promise<RawLead[]> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    console.log('[LeadHunter] TWITTER_BEARER_TOKEN not set — skipping Twitter');
    return [];
  }
  // Note: /2/tweets/search/recent requires Twitter Basic plan ($100/mo).
  // On free tier we get a 402. Try it and fall back gracefully.
  const queries = [
    '("AI trading" OR "chart analysis" OR "algo trading") -is:retweet lang:en',
    '("Solana trading" OR "MT5" OR "forex signals") -is:retweet lang:en',
  ];
  const all: RawLead[] = [];
  for (const query of queries) {
    try {
      const url = new URL('https://api.twitter.com/2/tweets/search/recent');
      url.searchParams.set('query', query);
      url.searchParams.set('max_results', '10');
      url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id,text');
      url.searchParams.set('expansions', 'author_id');
      url.searchParams.set('user.fields', 'username,name,public_metrics');
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (res.status === 402) {
        console.log('[LeadHunter] Twitter search requires paid plan (402) — skipping');
        break;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        console.log(`[LeadHunter] Twitter HTTP ${res.status}: ${JSON.stringify(err).substring(0, 200)}`);
        continue;
      }
      const data = await res.json();
      const tweets = data.data || [];
      const users = data.includes?.users || [];
      const userMap: Record<string, any> = {};
      for (const u of users) userMap[u.id] = u;
      for (const t of tweets) {
        const u = userMap[t.author_id] || {};
        all.push({
          platform: 'X/Twitter',
          username: u.username || 'unknown',
          post_content: t.text || '',
          post_url: `https://x.com/${u.username || '_'}/status/${t.id}`,
          tweet_id: t.id,
          follower_count: u.public_metrics?.followers_count ?? undefined,
          engagement: (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0),
          num_comments: t.public_metrics?.reply_count || 0,
          date: (t.created_at || '').substring(0, 10),
        });
      }
    } catch (e: any) {
      console.log('[LeadHunter] Twitter query error: ' + e.message);
    }
  }
  console.log(`[LeadHunter] Twitter: ${all.length} tweets`);
  return all;
}

// ── StockTwits (free, no API key) ────────────────────────────────────────────

async function scrapeStockTwits(): Promise<RawLead[]> {
  // StockTwits public API — no authentication needed for public streams.
  const streams = [
    'https://api.stocktwits.com/api/2/streams/trending.json?limit=30',
    'https://api.stocktwits.com/api/2/streams/symbol/EURUSD.json?limit=20',
    'https://api.stocktwits.com/api/2/streams/symbol/BTCUSD.json?limit=20',
    'https://api.stocktwits.com/api/2/streams/symbol/DJI.json?limit=20',
    'https://api.stocktwits.com/api/2/streams/symbol/SPY.json?limit=20',
  ];
  const all: RawLead[] = [];
  const seen = new Set<string>();

  for (const url of streams) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'VEDDBuild-LeadHunter/1.0' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) {
        console.log(`[LeadHunter] StockTwits ${url} HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const messages = data?.messages || [];
      for (const m of messages) {
        const body = (m.body || '').trim();
        if (body.length < 20) continue;
        const key = String(m.id);
        if (seen.has(key)) continue;
        seen.add(key);
        const username = m.user?.username || 'unknown';
        const followers = m.user?.followers || 0;
        const sentiment = m.entities?.sentiment?.basic || '';
        all.push({
          platform: 'StockTwits',
          username,
          post_content: `[${sentiment || 'Neutral'}] ${body}`.substring(0, 500),
          post_url: `https://stocktwits.com/${username}/message/${m.id}`,
          follower_count: followers,
          engagement: m.likes?.total || 0,
          num_comments: m.reshares?.reshared_count || 0,
          date: (m.created_at || '').substring(0, 10),
        });
      }
    } catch (e: any) {
      console.log('[LeadHunter] StockTwits stream error: ' + e.message);
    }
  }
  console.log(`[LeadHunter] StockTwits: ${all.length} messages`);
  return all;
}

async function scrapeInstagram(): Promise<RawLead[]> {
  try {
    const raw = await apifyScrape('apify/instagram-scraper', {
      directUrls: [
        'https://www.instagram.com/explore/tags/aitrading/',
        'https://www.instagram.com/explore/tags/chartanalysis/',
        'https://www.instagram.com/explore/tags/tradingtools/',
        'https://www.instagram.com/explore/tags/forextrader/',
        'https://www.instagram.com/explore/tags/solanacrypto/',
      ],
      resultsType: 'posts',
      resultsLimit: 20,
      onlyPostsNewerThan: '1 days',
    });
    return raw.map(p => ({
      platform: 'Instagram',
      username: p.ownerUsername || 'unknown',
      post_content: (p.caption || '').substring(0, 500),
      post_url: p.url || '',
      engagement: p.likesCount || 0,
      num_comments: p.commentsCount || 0,
      date: (p.timestamp || '').substring(0, 10),
    }));
  } catch (e: any) {
    console.log('[LeadHunter] Instagram error: ' + e.message);
    return [];
  }
}

async function scrapeLinkedIn(): Promise<RawLead[]> {
  const all: RawLead[] = [];
  for (const keyword of ['AI trading tools', 'chart analysis software']) {
    try {
      const raw = await apifyScrape('apify/linkedin-post-search', {
        keyword,
        limit: 20,
        date_filter: 'past-24h',
      });
      for (const p of raw) {
        all.push({
          platform: 'LinkedIn',
          username: p.author?.headline || 'unknown',
          profile_url: p.author?.profile_url || '',
          post_content: (p.text || '').substring(0, 500),
          post_url: p.post_url || '',
          activity_id: p.activity_id || '',
          engagement: p.stats?.total_reactions || 0,
          num_comments: p.stats?.comments || 0,
          headline: p.author?.headline || '',
          date: (p.posted_at?.date || '').substring(0, 10),
        });
      }
    } catch (e: any) {
      console.log('[LeadHunter] LinkedIn error: ' + e.message);
    }
  }
  return all;
}

async function scrapeFacebook(): Promise<RawLead[]> {
  try {
    const raw = await apifyScrape('apify/facebook-posts-scraper', {
      startUrls: [
        { url: 'https://www.facebook.com/TradingView/' },
        { url: 'https://www.facebook.com/metatrader5/' },
      ],
      resultsLimit: 10,
      onlyPostsNewerThan: '1 days',
    });
    const valid = raw.filter(p => !p.error && p.text);
    return valid.map(p => ({
      platform: 'Facebook',
      username: p.pageName || p.username || 'unknown',
      post_content: (p.text || '').substring(0, 500),
      post_url: p.url || p.postUrl || '',
      engagement: (p.likes || 0) + (p.shares || 0),
      num_comments: p.comments || 0,
      date: (p.time || '').substring(0, 10),
    }));
  } catch (e: any) {
    console.log('[LeadHunter] Facebook error: ' + e.message);
    return [];
  }
}

// ── Bot/spam filter (Layer 1) ─────────────────────────────────────────────────

function isBotOrSpam(lead: RawLead): boolean {
  if (lead.platform === 'X/Twitter') {
    // Only filter if we KNOW the follower count and it's explicitly 0.
    // undefined/null means the API didn't return user expansion data — don't filter those out.
    if (lead.follower_count !== undefined && lead.follower_count !== null && lead.follower_count === 0) return true;
  }
  if (lead.platform === 'Reddit') {
    if ((lead.post_content || '').length < 20) return true;
  }
  return false;
}

// ── Dedup from DB ─────────────────────────────────────────────────────────────

async function getExistingKeys(): Promise<Set<string>> {
  try {
    const rows = await db.execute(
      sql`SELECT DISTINCT (platform || '|' || lower(username)) as dedup_key FROM leads WHERE date >= CURRENT_DATE - INTERVAL '30 days'`
    );
    const set = new Set<string>();
    for (const row of (rows as any).rows || rows) {
      const key = (row as any).dedup_key;
      if (key) set.add(String(key).toLowerCase());
    }
    return set;
  } catch {
    return new Set();
  }
}

// ── VEDD feature map (pain point → feature + URL) ────────────────────────────

const VEDD_FEATURES = [
  { id: 'chart_analysis', name: 'AI Chart Analysis', url: 'https://veddbuild.com/analysis', triggers: ['chart', 'analysis', 'signal', 'entry', 'exit', 'when to buy', 'when to sell', 'reading charts', 'technical'] },
  { id: 'ss_engine', name: 'SS AI Engine (Auto-Trading)', url: 'https://veddbuild.com/weekly-strategy', triggers: ['automated', 'autopilot', 'bot', 'EA', 'algorithm', 'auto', 'passive', 'while I sleep', 'hands-free', 'too busy'] },
  { id: 'weekly_strategy', name: 'Weekly AI Strategy Plan', url: 'https://veddbuild.com/weekly-strategy', triggers: ['strategy', 'plan', 'weekly', 'what pairs', 'which pairs', 'confused', 'don\'t know what to trade'] },
  { id: 'copy_trading', name: 'Copy Trading', url: 'https://veddbuild.com/copy-trading', triggers: ['copy', 'follow', 'mirror', 'beginner', 'learning', 'new to trading', 'just started'] },
  { id: 'sol_scanner', name: 'SOL Scanner', url: 'https://veddbuild.com/solana-scanner', triggers: ['solana', 'sol', 'crypto', 'token', 'memecoin', 'defi', 'blockchain'] },
  { id: 'orb_breakout', name: 'ORB Breakout System', url: 'https://veddbuild.com/orb-breakout', triggers: ['breakout', 'range', 'opening range', 'morning', 'session', 'momentum'] },
  { id: 'prop_firm', name: 'Prop Firm Challenge Mode', url: 'https://veddbuild.com/prop-firm-challenge', triggers: ['prop firm', 'FTMO', 'funded', 'challenge', 'drawdown', 'prop'] },
  { id: 'growth_plan', name: 'Account Growth Plan', url: 'https://veddbuild.com/account-growth-plan', triggers: ['grow', 'compound', 'small account', 'double', 'percentage', 'consistent'] },
  { id: 'platform', name: 'VEDDBuild Platform', url: 'https://veddbuild.com', triggers: ['platform', 'tool', 'software', 'app', 'recommend', 'suggestion', 'looking for'] },
];

// ── AI scoring (Layer 2 + 3) with ambassador brief ────────────────────────────

async function scoreLeads(rawLeads: RawLead[]): Promise<ScoredLead[]> {
  if (rawLeads.length === 0) return [];
  const ai = getAI();
  if (!ai) {
    return rawLeads.map(l => ({
      ...l,
      intent_score: 5,
      account_quality: 5,
      contact_opportunity: JSON.stringify({ pain_point: 'Unknown', vedd_feature: 'VEDDBuild Platform', vedd_url: 'https://veddbuild.com', opener: 'Hey, saw your post and thought VEDDBuild might help.', talking_points: ['AI-powered trading platform', 'Auto-execution engine', 'Free to start'] }),
      suggested_reply: '',
      auto_engaged: false,
      engagement_type: '',
    }));
  }

  const scored: ScoredLead[] = [];
  const batch = rawLeads.slice(0, 50);
  for (const lead of batch) {
    try {
      const prompt = `You are an ambassador coach for VEDDBuild (veddbuild.com) — an AI trading platform with these features:
- AI Chart Analysis (/analysis): reads charts, gives buy/sell signals
- SS AI Engine (/weekly-strategy): auto-executes trades while you sleep, MT5 integration
- Weekly Strategy Plan (/weekly-strategy): AI-generated weekly trading plan by pair
- Copy Trading (/copy-trading): follow top traders automatically
- SOL Scanner (/solana-scanner): finds Solana crypto opportunities
- ORB Breakout (/orb-breakout): morning range breakout system
- Prop Firm Challenge Mode (/prop-firm-challenge): pass FTMO/funded challenges
- Account Growth Plan (/account-growth-plan): compound small accounts systematically

Analyze this ${lead.platform} post and return a JSON ambassador brief:
Username: ${lead.username}
Content: ${lead.post_content}
Followers: ${lead.follower_count || 'N/A'}

Return ONLY valid JSON (no markdown, no explanation):
{
  "account_quality": <1-10>,
  "intent_score": <1-10: 10=actively asking for tool/solution, 7-9=frustrated with current tools, 4-6=general trading discussion, 1-3=generic interest>,
  "pain_point": "<one sentence: what specific problem or frustration is this person expressing?>",
  "vedd_feature": "<name of the ONE VEDDBuild feature that most directly solves their problem>",
  "vedd_url": "<full URL to that feature, e.g. https://veddbuild.com/analysis>",
  "opener": "<natural first message to send — address their specific pain, sound human not salesy, 1-2 sentences. For score <4: no VEDD mention. For 4-6: subtle bridge. For 7+: reference VEDDBuild naturally>",
  "talking_points": ["<point 1 connecting their pain to the VEDD feature>", "<point 2>", "<point 3>"],
  "suggested_reply": "<full outreach message that flows: acknowledge their pain → introduce the solution → invite them. ${lead.platform === 'X/Twitter' ? 'Under 250 chars.' : '3-5 sentences.'} Never say DM me or check this out.>"
}`;

      const raw = await aiChat([{ role: 'user', content: prompt }]);
      let parsed: any = {};
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      } catch { /* ignore parse errors */ }

      const brief = {
        pain_point: parsed.pain_point || '',
        vedd_feature: parsed.vedd_feature || 'VEDDBuild Platform',
        vedd_url: parsed.vedd_url || 'https://veddbuild.com',
        opener: parsed.opener || '',
        talking_points: Array.isArray(parsed.talking_points) ? parsed.talking_points : [],
      };

      scored.push({
        ...lead,
        intent_score: Math.min(10, Math.max(1, parseInt(parsed.intent_score) || 5)),
        account_quality: Math.min(10, Math.max(1, parseInt(parsed.account_quality) || 5)),
        contact_opportunity: JSON.stringify(brief),
        suggested_reply: parsed.suggested_reply || '',
        auto_engaged: false,
        engagement_type: '',
      });
    } catch {
      scored.push({
        ...lead,
        intent_score: 5,
        account_quality: 5,
        contact_opportunity: JSON.stringify({ pain_point: '', vedd_feature: 'VEDDBuild Platform', vedd_url: 'https://veddbuild.com', opener: '', talking_points: [] }),
        suggested_reply: '',
        auto_engaged: false,
        engagement_type: '',
      });
    }
  }
  return scored;
}

// ── Auto-engagement ───────────────────────────────────────────────────────────

async function engageTwitter(lead: ScoredLead): Promise<string> {
  const token = process.env.TWITTER_ACCESS_TOKEN;
  if (!token || !lead.tweet_id) return '';
  try {
    // Like the tweet
    await fetch(`https://api.twitter.com/2/users/${TWITTER_USER_ID}/likes`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tweet_id: lead.tweet_id }),
    });
    // Try reply if we have one
    if (lead.suggested_reply) {
      await fetch('https://api.twitter.com/2/tweets', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: lead.suggested_reply, reply: { in_reply_to_tweet_id: lead.tweet_id } }),
      });
      return 'Like + Reply';
    }
    return 'Like';
  } catch { return ''; }
}

async function engageLinkedIn(lead: ScoredLead): Promise<string> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  if (!token || !lead.activity_id || !lead.suggested_reply) return '';
  try {
    const urn = encodeURIComponent(`urn:li:activity:${lead.activity_id}`);
    const res = await fetch(`https://api.linkedin.com/v2/socialActions/${urn}/comments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        actor: `urn:li:person:${LINKEDIN_PERSON_ID}`,
        message: { text: lead.suggested_reply },
      }),
    });
    return res.ok ? 'Comment' : '';
  } catch { return ''; }
}

// ── Email digest ──────────────────────────────────────────────────────────────

async function sendDigest(
  scored: ScoredLead[],
  platformBreakdown: Record<string, number>,
  dedupStats: { totalScraped: number; duplicatesRemoved: number; newLeads: number },
  errors: string[]
) {
  const key = process.env.SENDGRID_API_KEY;
  if (!key) { console.log('[LeadHunter] No email key, skipping digest'); return; }
  sgMail.setApiKey(key);

  const highIntent = scored.filter(l => l.intent_score >= 7);
  const medIntent = scored.filter(l => l.intent_score >= 4 && l.intent_score < 7);
  const top10 = [...highIntent, ...medIntent].slice(0, 10);

  const intentBadge = (score: number) => {
    const bg = score >= 7 ? '#16a34a' : score >= 4 ? '#d97706' : '#6b7280';
    return `<span style="background:${bg};color:#fff;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;">${score}/10</span>`;
  };

  const parseBrief = (l: ScoredLead) => {
    try { return JSON.parse(l.contact_opportunity || '{}'); } catch { return {}; }
  };

  const leadsCards = top10.map(l => {
    const brief = parseBrief(l);
    const points = (brief.talking_points || []).map((p: string) => `<li style="margin-bottom:4px;color:#d1d5db;">${p}</li>`).join('');
    return `
    <div style="background:#0a0f1a;border:1px solid #1a1f2e;border-radius:12px;padding:16px;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
        <span style="font-size:12px;font-weight:700;color:#9ca3af;background:#1a1f2e;padding:3px 10px;border-radius:20px;">${l.platform}</span>
        <span style="font-size:13px;font-weight:700;color:#fff;">${l.username}</span>
        ${l.post_url ? `<a href="${l.post_url}" style="margin-left:auto;color:#60a5fa;font-size:11px;">View post →</a>` : ''}
        <span style="margin-left:${l.post_url ? '0' : 'auto'};">${intentBadge(l.intent_score)}</span>
      </div>
      <p style="margin:0 0 10px;font-size:12px;color:#9ca3af;font-style:italic;">"${(l.post_content || '').substring(0, 140)}…"</p>
      ${brief.pain_point ? `<p style="margin:0 0 8px;font-size:12px;"><span style="color:#F0D269;font-weight:700;">Pain: </span><span style="color:#d1d5db;">${brief.pain_point}</span></p>` : ''}
      ${brief.vedd_feature ? `<p style="margin:0 0 8px;font-size:12px;"><span style="color:#F0D269;font-weight:700;">Send to: </span><a href="${brief.vedd_url || 'https://veddbuild.com'}" style="color:#60a5fa;">${brief.vedd_feature}</a></p>` : ''}
      ${brief.opener ? `<div style="background:#0f1a2e;border-left:3px solid #F0D269;padding:8px 12px;border-radius:0 6px 6px 0;margin-bottom:8px;"><p style="margin:0 0 4px;font-size:10px;color:#F0D269;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Opener</p><p style="margin:0;font-size:12px;color:#e5e7eb;">${brief.opener}</p></div>` : ''}
      ${points ? `<ul style="margin:0 0 8px;padding-left:16px;font-size:12px;">${points}</ul>` : ''}
      ${l.suggested_reply ? `<div style="background:#0f2010;border-left:3px solid #16a34a;padding:8px 12px;border-radius:0 6px 6px 0;"><p style="margin:0 0 4px;font-size:10px;color:#6ee7b7;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;">Full Outreach Message</p><p style="margin:0;font-size:12px;color:#e5e7eb;">${l.suggested_reply}</p></div>` : ''}
    </div>`;
  }).join('');

  const breakdown = Object.entries(platformBreakdown).map(
    ([p, c]) => `<span style="margin-right:12px;font-size:13px;color:#d1d5db;"><strong style="color:#F0D269;">${c}</strong> ${p}</span>`
  ).join('');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080B14;color:#e5e7eb;max-width:700px;margin:0 auto;padding:40px 32px;border-radius:16px;">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px;">
    <div style="width:40px;height:40px;background:linear-gradient(135deg,#F0D269,#d4a800);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🎯</div>
    <div>
      <h1 style="color:#fff;font-size:20px;font-weight:900;margin:0;">VEDD Lead Hunter</h1>
      <p style="color:#6b7280;font-size:13px;margin:0;">Ambassador brief — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:28px;">
    ${[
      ['Scraped', dedupStats.totalScraped, '#6b7280'],
      ['New Leads', dedupStats.newLeads, '#3b82f6'],
      ['High Intent', highIntent.length, '#16a34a'],
    ].map(([label, val, color]) => `
      <div style="background:#0f1420;border:1px solid #1a1f2e;border-radius:12px;padding:16px;text-align:center;">
        <div style="font-size:26px;font-weight:900;color:${color};">${val}</div>
        <div style="font-size:11px;color:#6b7280;margin-top:4px;">${label}</div>
      </div>`).join('')}
  </div>

  <div style="background:#0f1420;border:1px solid #1a1f2e;border-radius:12px;padding:16px;margin-bottom:24px;">
    <h3 style="color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 10px;">Platform Breakdown</h3>
    <div>${breakdown}</div>
    <div style="margin-top:10px;font-size:12px;color:#6b7280;">
      Pipeline: ${dedupStats.totalScraped} scraped → ${dedupStats.totalScraped - dedupStats.duplicatesRemoved} after dedup → ${scored.length} verified → ${highIntent.length} high-intent
    </div>
  </div>

  <h3 style="color:#fff;font-size:14px;font-weight:700;margin:0 0 4px;">Ambassador Briefs — Top ${top10.length} Leads</h3>
  <p style="color:#6b7280;font-size:12px;margin:0 0 16px;">Each card shows the lead's pain, which VEDD feature solves it, your opener, and the full outreach message.</p>
  ${leadsCards}

  ${errors.length > 0 ? `<div style="background:#1a0a0a;border:1px solid #7f1d1d;border-radius:8px;padding:12px;margin-bottom:24px;font-size:12px;color:#fca5a5;">${errors.join('<br/>')}</div>` : ''}

  <hr style="border:none;border-top:1px solid #1a1f2e;margin:24px 0;"/>
  <p style="color:#4b5563;font-size:12px;margin:0;">VEDD Lead Hunter · veddbuild.com · View all leads at <a href="https://veddbuild.com/lead-hunter" style="color:#F0D269;">veddbuild.com/lead-hunter</a></p>
</div>`;

  try {
    await sgMail.send({
      to: DIGEST_TO,
      cc: DIGEST_CC,
      from: FROM,
      subject: `VEDD Lead Hunter — ${highIntent.length} high-intent leads today`,
      html,
    });
    console.log('[LeadHunter] Digest sent to ' + DIGEST_TO);
  } catch (e: any) {
    console.error('[LeadHunter] Digest email error:', e?.response?.body ?? e?.message);
  }
}

// ── Main run ──────────────────────────────────────────────────────────────────

export async function runLeadHunter(): Promise<RunResult> {
  console.log('[LeadHunter] Starting run...');
  const today = new Date().toISOString().substring(0, 10);
  const errors: string[] = [];

  // Create run record
  let runId = 0;
  try {
    const [run] = await db.insert(leadHunterRuns).values({ date: today, status: 'running' }).returning();
    runId = run.id;
  } catch (e: any) {
    console.log('[LeadHunter] Could not create run record: ' + e.message);
    errors.push('DB run record failed: ' + e.message);
  }

  // Scrape all platforms in parallel
  const [redditLeads, twitterLeads, stocktwitsLeads, igLeads, liLeads, fbLeads] = await Promise.all([
    scrapeReddit().catch(e => { errors.push('Reddit: ' + e.message); return [] as RawLead[]; }),
    scrapeTwitter().catch(e => { errors.push('Twitter: ' + e.message); return [] as RawLead[]; }),
    scrapeStockTwits().catch(e => { errors.push('StockTwits: ' + e.message); return [] as RawLead[]; }),
    scrapeInstagram().catch(e => { errors.push('Instagram: ' + e.message); return [] as RawLead[]; }),
    scrapeLinkedIn().catch(e => { errors.push('LinkedIn: ' + e.message); return [] as RawLead[]; }),
    scrapeFacebook().catch(e => { errors.push('Facebook: ' + e.message); return [] as RawLead[]; }),
  ]);

  const platformBreakdown: Record<string, number> = {
    Reddit: redditLeads.length,
    'X/Twitter': twitterLeads.length,
    StockTwits: stocktwitsLeads.length,
    Instagram: igLeads.length,
    LinkedIn: liLeads.length,
    Facebook: fbLeads.length,
  };

  const allLeads = [...redditLeads, ...twitterLeads, ...stocktwitsLeads, ...igLeads, ...liLeads, ...fbLeads];
  console.log(`[LeadHunter] Scraped ${allLeads.length} total leads`);

  // Dedup against DB
  const existingKeys = await getExistingKeys();
  const newRaw = allLeads.filter(l => {
    const key = (l.platform + '|' + l.username).toLowerCase();
    return !existingKeys.has(key) && !SKIP_USERNAMES.has(l.username.toLowerCase());
  });
  const dupeCount = allLeads.length - newRaw.length;
  console.log(`[LeadHunter] ${dupeCount} dupes removed → ${newRaw.length} new leads`);

  // Layer 1: bot/spam filter
  const cleanLeads = newRaw.filter(l => !isBotOrSpam(l));
  console.log(`[LeadHunter] ${cleanLeads.length} after bot filter`);

  // Layers 2+3: AI score + reply generation
  const scored = await scoreLeads(cleanLeads);
  const highIntent = scored.filter(l => l.intent_score >= 7);
  console.log(`[LeadHunter] ${highIntent.length} high-intent leads`);

  // No auto-engagement — ambassadors use the brief to engage personally

  // Store in DB
  let storedCount = 0;
  for (const lead of scored) {
    try {
      const id = (lead.platform + '_' + (lead.post_url || lead.username)).substring(0, 499);
      await db.insert(leads).values({
        id,
        date: today,
        platform: lead.platform,
        username: lead.username,
        profileUrl: lead.profile_url || null,
        postContent: lead.post_content || null,
        postUrl: lead.post_url || null,
        intentScore: lead.intent_score,
        accountQuality: lead.account_quality,
        contactOpportunity: lead.contact_opportunity || null,
        status: 'New',
        subreddit: lead.subreddit || null,
        followerCount: lead.follower_count || 0,
        headline: lead.headline || null,
        engagementStats: JSON.stringify({ engagement: lead.engagement, comments: lead.num_comments }),
        suggestedReply: lead.suggested_reply || null,
        autoEngaged: lead.auto_engaged,
        engagementType: lead.engagement_type || null,
      }).onConflictDoNothing();
      storedCount++;
    } catch (e: any) {
      console.log('[LeadHunter] Insert error: ' + e.message);
    }
  }

  // Update run record
  try {
    await db.update(leadHunterRuns).set({
      status: 'completed',
      totalScraped: allLeads.length,
      newLeads: newRaw.length,
      highIntent: highIntent.length,
      autoEngagedCount: 0,
      platformBreakdown: JSON.stringify(platformBreakdown),
      errorLog: errors.length > 0 ? errors.join('\n') : null,
      completedAt: new Date(),
    }).where(sql`id = ${runId}`);
  } catch { /* non-critical */ }

  // Send digest
  await sendDigest(
    scored,
    platformBreakdown,
    { totalScraped: allLeads.length, duplicatesRemoved: dupeCount, newLeads: newRaw.length },
    errors
  );

  console.log(`[LeadHunter] Run complete. Stored ${storedCount} leads.`);
  return {
    runId,
    totalScraped: allLeads.length,
    newLeads: newRaw.length,
    highIntent: highIntent.length,
    autoEngaged: 0,
    platformBreakdown,
  };
}

// ── Daily scheduler (8am UTC) ─────────────────────────────────────────────────

export function startLeadHunterScheduler(): void {
  const scheduleNext = () => {
    const now = new Date();
    const next = new Date();
    next.setUTCHours(8, 0, 0, 0);
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    const delay = next.getTime() - now.getTime();
    console.log(`[LeadHunter] Next run scheduled in ${Math.round(delay / 60000)}min`);
    setTimeout(async () => {
      try { await runLeadHunter(); } catch (e: any) { console.error('[LeadHunter] Scheduled run error:', e.message); }
      scheduleNext();
    }, delay);
  };
  scheduleNext();
}
