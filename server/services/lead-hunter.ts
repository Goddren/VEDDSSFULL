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
  try {
    const res = await ai.chat.completions.create({
      model: (ai as any).defaultModel || 'llama-3.1-8b-instant',
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
  try {
    const raw = await apifyScrape('apify/reddit-scraper', {
      searches: ['AI trading tools', 'chart analysis', 'Solana trading', 'MT5 trading'],
      startUrls: [
        { url: 'https://www.reddit.com/r/algotrading/' },
        { url: 'https://www.reddit.com/r/Forex/' },
        { url: 'https://www.reddit.com/r/CryptoCurrency/' },
        { url: 'https://www.reddit.com/r/Solana/' },
        { url: 'https://www.reddit.com/r/Daytrading/' },
      ],
      sort: 'new',
      time: 'day',
      maxItems: 50,
      maxPostCount: 50,
      maxComments: 2,
      skipComments: false,
    });
    const posts = raw.filter(item => item.dataType === 'post');
    return posts.map(p => ({
      platform: 'Reddit',
      username: 'r/' + (p.parsedCommunityName || 'unknown') + '_' + (p.parsedId || p.id || 'post'),
      post_content: ((p.title || '') + ': ' + (p.body || '')).substring(0, 500),
      post_url: p.url || p.link || '',
      subreddit: p.communityName || p.parsedCommunityName || '',
      engagement: p.upVotes || 0,
      num_comments: p.numberOfComments || 0,
      date: (p.createdAt || '').substring(0, 10),
    }));
  } catch (e: any) {
    console.log('[LeadHunter] Reddit error: ' + e.message);
    return [];
  }
}

async function scrapeTwitter(): Promise<RawLead[]> {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) {
    console.log('[LeadHunter] TWITTER_BEARER_TOKEN not set — skipping Twitter');
    return [];
  }
  const queries = [
    '("AI trading tools" OR "chart analysis tool" OR "trading platform" OR "best trading app") -is:retweet lang:en',
    '("Solana trading" OR "trading signals AI" OR "MT5 trading" OR "algo trading") -is:retweet lang:en',
  ];
  const all: RawLead[] = [];
  for (const query of queries) {
    try {
      const url = new URL('https://api.twitter.com/2/tweets/search/recent');
      url.searchParams.set('query', query);
      url.searchParams.set('max_results', '20');
      url.searchParams.set('tweet.fields', 'created_at,public_metrics,author_id,text');
      url.searchParams.set('expansions', 'author_id');
      url.searchParams.set('user.fields', 'username,name,public_metrics');
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) continue;
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
          follower_count: u.public_metrics?.followers_count || 0,
          engagement: (t.public_metrics?.like_count || 0) + (t.public_metrics?.retweet_count || 0),
          num_comments: t.public_metrics?.reply_count || 0,
          date: (t.created_at || '').substring(0, 10),
        });
      }
    } catch (e: any) {
      console.log('[LeadHunter] Twitter query error: ' + e.message);
    }
  }
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
    const fc = lead.follower_count || 0;
    if (fc === 0) return true;
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

// ── AI scoring (Layer 2 + 3) ──────────────────────────────────────────────────

async function scoreLeads(rawLeads: RawLead[]): Promise<ScoredLead[]> {
  if (rawLeads.length === 0) return [];
  const ai = getAI();
  if (!ai) {
    return rawLeads.map(l => ({
      ...l,
      intent_score: 5,
      account_quality: 5,
      contact_opportunity: 'Unknown',
      suggested_reply: '',
      auto_engaged: false,
      engagement_type: '',
    }));
  }

  const scored: ScoredLead[] = [];
  const batch = rawLeads.slice(0, 50); // cap at 50 for cost
  for (const lead of batch) {
    try {
      const prompt = `You are a lead qualification AI for VEDDBuild (veddbuild.com) — an AI trading platform.

Analyze this social media post and return JSON only:
Platform: ${lead.platform}
Username: ${lead.username}
Content: ${lead.post_content}
Followers: ${lead.follower_count || 'N/A'}
Engagement: ${lead.engagement || 0}

Return ONLY valid JSON (no markdown):
{
  "account_quality": <1-10, 10=definitely real active person>,
  "intent_score": <1-10: 10=actively asking for tool recommendations, 7-9=frustrated with current tools, 4-6=discussing trading generally, 1-3=generic trading interest>,
  "contact_opportunity": "<one sentence on why/how to reach them>",
  "suggested_reply": "<platform-appropriate reply. For score 1-3: genuine engagement no VEDD mention. For 4-6: subtle. For 7+: mention VEDDBuild or veddbuild.com naturally. Under 250 chars for Twitter. NEVER say 'check this out' or 'DM me'.>"
}`;

      const raw = await aiChat([{ role: 'user', content: prompt }]);
      let parsed: any = {};
      try {
        const match = raw.match(/\{[\s\S]*\}/);
        parsed = match ? JSON.parse(match[0]) : {};
      } catch { /* ignore parse errors */ }

      scored.push({
        ...lead,
        intent_score: Math.min(10, Math.max(1, parseInt(parsed.intent_score) || 5)),
        account_quality: Math.min(10, Math.max(1, parseInt(parsed.account_quality) || 5)),
        contact_opportunity: parsed.contact_opportunity || '',
        suggested_reply: parsed.suggested_reply || '',
        auto_engaged: false,
        engagement_type: '',
      });
    } catch {
      scored.push({
        ...lead,
        intent_score: 5,
        account_quality: 5,
        contact_opportunity: '',
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
  autoEngagedLeads: ScoredLead[],
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

  const leadsTable = top10.map(l => `
    <tr style="border-bottom:1px solid #1a1f2e;">
      <td style="padding:8px 6px;font-size:12px;color:#9ca3af;">${l.platform}</td>
      <td style="padding:8px 6px;font-size:12px;color:#fff;">${l.username}</td>
      <td style="padding:8px 6px;">${intentBadge(l.intent_score)}</td>
      <td style="padding:8px 6px;font-size:11px;color:#d1d5db;max-width:280px;">${(l.post_content || '').substring(0, 120)}…</td>
      <td style="padding:8px 6px;font-size:11px;color:#F0D269;">${(l.suggested_reply || '').substring(0, 100)}${l.suggested_reply?.length > 100 ? '…' : ''}</td>
    </tr>`).join('');

  const engageTable = autoEngagedLeads.length > 0 ? autoEngagedLeads.map(l => `
    <tr style="border-bottom:1px solid #1a1f2e;">
      <td style="padding:6px;font-size:12px;color:#9ca3af;">${l.platform}</td>
      <td style="padding:6px;font-size:12px;color:#fff;">${l.username}</td>
      <td style="padding:6px;font-size:12px;color:#F0D269;">${l.engagement_type}</td>
      <td style="padding:6px;">${intentBadge(l.intent_score)}</td>
    </tr>`).join('') : '<tr><td colspan="4" style="padding:12px;color:#6b7280;font-size:12px;text-align:center;">No auto-engagements this run</td></tr>';

  const breakdown = Object.entries(platformBreakdown).map(
    ([p, c]) => `<span style="margin-right:12px;font-size:13px;color:#d1d5db;"><strong style="color:#F0D269;">${c}</strong> ${p}</span>`
  ).join('');

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080B14;color:#e5e7eb;max-width:700px;margin:0 auto;padding:40px 32px;border-radius:16px;">
  <div style="display:flex;align-items:center;gap:12px;margin-bottom:32px;">
    <div style="width:40px;height:40px;background:linear-gradient(135deg,#F0D269,#d4a800);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🎯</div>
    <div>
      <h1 style="color:#fff;font-size:20px;font-weight:900;margin:0;">VEDD Lead Hunter</h1>
      <p style="color:#6b7280;font-size:13px;margin:0;">Daily digest — ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:28px;">
    ${[
      ['Scraped', dedupStats.totalScraped, '#6b7280'],
      ['New Leads', dedupStats.newLeads, '#3b82f6'],
      ['High Intent', highIntent.length, '#16a34a'],
      ['Auto-Engaged', autoEngagedLeads.length, '#F0D269'],
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

  <h3 style="color:#fff;font-size:14px;font-weight:700;margin:0 0 12px;">Auto-Engagements</h3>
  <div style="overflow-x:auto;margin-bottom:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:2px solid #1a1f2e;">
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Platform</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">User</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Action</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Score</th>
      </tr></thead>
      <tbody>${engageTable}</tbody>
    </table>
  </div>

  <h3 style="color:#fff;font-size:14px;font-weight:700;margin:0 0 12px;">Top Leads + Suggested Replies</h3>
  <div style="overflow-x:auto;margin-bottom:24px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:2px solid #1a1f2e;">
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Platform</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Username</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Intent</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Post</th>
        <th style="padding:8px 6px;text-align:left;font-size:11px;color:#6b7280;font-weight:600;">Suggested Reply</th>
      </tr></thead>
      <tbody>${leadsTable}</tbody>
    </table>
  </div>

  ${errors.length > 0 ? `<div style="background:#1a0a0a;border:1px solid #7f1d1d;border-radius:8px;padding:12px;margin-bottom:24px;font-size:12px;color:#fca5a5;">${errors.join('<br/>')}</div>` : ''}

  <hr style="border:none;border-top:1px solid #1a1f2e;margin:24px 0;"/>
  <p style="color:#4b5563;font-size:12px;margin:0;">VEDD Lead Hunter · veddbuild.com · Powered by AI</p>
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
  const [redditLeads, twitterLeads, igLeads, liLeads, fbLeads] = await Promise.all([
    scrapeReddit().catch(e => { errors.push('Reddit: ' + e.message); return [] as RawLead[]; }),
    scrapeTwitter().catch(e => { errors.push('Twitter: ' + e.message); return [] as RawLead[]; }),
    scrapeInstagram().catch(e => { errors.push('Instagram: ' + e.message); return [] as RawLead[]; }),
    scrapeLinkedIn().catch(e => { errors.push('LinkedIn: ' + e.message); return [] as RawLead[]; }),
    scrapeFacebook().catch(e => { errors.push('Facebook: ' + e.message); return [] as RawLead[]; }),
  ]);

  if (fbLeads.length === 0) errors.push('Facebook: no data (expected — most pages are private)');

  const platformBreakdown: Record<string, number> = {
    Reddit: redditLeads.length,
    'X/Twitter': twitterLeads.length,
    Instagram: igLeads.length,
    LinkedIn: liLeads.length,
    Facebook: fbLeads.length,
  };

  const allLeads = [...redditLeads, ...twitterLeads, ...igLeads, ...liLeads, ...fbLeads];
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

  // Auto-engage high-intent leads
  const autoEngagedLeads: ScoredLead[] = [];
  for (const lead of highIntent.slice(0, 10)) {
    let engType = '';
    if (lead.platform === 'X/Twitter' && lead.tweet_id) {
      engType = await engageTwitter(lead);
    } else if (lead.platform === 'LinkedIn' && lead.activity_id) {
      engType = await engageLinkedIn(lead);
    }
    if (engType) {
      lead.auto_engaged = true;
      lead.engagement_type = engType;
      autoEngagedLeads.push(lead);
    }
  }

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
      autoEngagedCount: autoEngagedLeads.length,
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
    autoEngagedLeads,
    errors
  );

  console.log(`[LeadHunter] Run complete. Stored ${storedCount} leads.`);
  return {
    runId,
    totalScraped: allLeads.length,
    newLeads: newRaw.length,
    highIntent: highIntent.length,
    autoEngaged: autoEngagedLeads.length,
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
