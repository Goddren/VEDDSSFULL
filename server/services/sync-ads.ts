/**
 * Sync — top-ad style bank for the Content Studio.
 *
 * The Sync button pulls the styles of ads that are working right now in the
 * trading/finance niche and lets the user generate a VEDD version: same
 * STRUCTURE (hook shape, format, setting, CTA shape), never their words,
 * footage, or claims. Profit/payout elements that power some originals are
 * stripped at the mapping layer — the styleNote each entry feeds the script
 * writer describes the safe VEDD version only.
 *
 * Why a bank and not a live scrape: Meta's Ad Library and TikTok's Creative
 * Center bot-block datacenter servers, so the app cannot fetch them live
 * reliably. The bank is researched from those sources and refreshed by
 * editing this file (each entry carries its observation date and signal).
 * Bank researched 2026-11-01. Full research notes live with the PR.
 */

export type SyncReelFormat = 'standard' | 'product-ad' | 'got-milk';

export interface SyncAdStyle {
  id: string;
  sourceBrand: string;
  platform: string;
  title: string;
  /** Structure of the first ~3 seconds. */
  hookPattern: string;
  /** Nearest studio reel format the generator should use. */
  format: SyncReelFormat;
  /** Nearest background preset id (backgrounds.ts), or null = AI picks. */
  backgroundId: string | null;
  ctaPattern: string;
  whyItWorks: string;
  /** Verified runtime/engagement signal, with its date — never invented numbers. */
  signal: string;
  /** Prefilled reel topic when the user taps "Make my version". */
  topicSeed: string;
  /** The instruction the script writer adapts. Structure only, claims stripped. */
  styleNote: string;
  /** Set when the original leans on claims VEDD can't use — shown on the card. */
  caution?: string;
}

export const SYNC_AD_STYLES: SyncAdStyle[] = [
  {
    id: 'ai-chart-demo',
    sourceBrand: 'TrendSpider',
    platform: 'YouTube ads',
    title: 'The AI reads your chart',
    hookPattern: 'A plain-English question over a full-screen chart — the AI starts annotating it immediately.',
    format: 'product-ad',
    backgroundId: null,
    ctaPattern: '"Try it on your own chart" — get started',
    whyItWorks: 'The demo IS the pitch: the viewer watches their own tedious manual task done in seconds.',
    signal: 'Active YouTube video-ad funnel (landing page carries video-ad tracking, live Oct 2026).',
    topicSeed: 'Watch VEDD read a messy chart in about two seconds',
    styleNote: 'Structure: open on a full-screen candlestick chart with a plain question a trader would ask about it; the answer appears as the chart gets read — levels marked, structure named. The product demonstrates itself; the presenter (if any) only reacts. End on the invitation to try it on your own chart.',
  },
  {
    id: 'live-morning-room',
    sourceBrand: 'Trade Ideas',
    platform: 'YouTube live',
    title: 'This morning\'s setups, live',
    hookPattern: 'Live cold open — the market is already moving and the host walks the AI\'s overnight setups as they fire.',
    format: 'standard',
    backgroundId: 'podcast-studio',
    ctaPattern: 'Join live / start a trial and watch it work today',
    whyItWorks: 'Proof by routine: "watch it work this morning" beats any polished claim.',
    signal: 'Daily live format documented as ongoing in reviews updated Oct 2026.',
    topicSeed: 'This morning\'s setups — scanned before the bell so you don\'t have to',
    styleNote: 'Structure: morning-briefing energy at a desk with screens; walk through what the brain scanned overnight, setup by setup, in process order (scan → read → risk levels). Never promise any setup wins; the credibility is the routine itself.',
  },
  {
    id: 'news-hook',
    sourceBrand: 'Tickeron',
    platform: 'Native / advertorial',
    title: 'Today\'s headline, already watched',
    hookPattern: 'A breaking market headline, then: the AI was already positioned around it.',
    format: 'product-ad',
    backgroundId: 'night-street',
    ctaPattern: 'See what the bots are watching — explore',
    whyItWorks: 'Borrows the news cycle\'s urgency: the product is relevant TODAY, not generically smart.',
    signal: 'News-reactive pieces published continuously (crawled late Oct 2026).',
    topicSeed: 'The market just moved — here\'s what the brain was already watching',
    styleNote: 'Structure: hook reacts to a market-shock headline in the first line; second beat shows the brain already tracking that theme (watchlist, alerts set); close on staying ready instead of chasing. The original leans on bot performance stats — use NONE: no returns, no win rates, no "positioned to profit."',
    caution: 'Original leans on performance stats — VEDD version strips all numbers.',
  },
  {
    id: 'trader-journey-interview',
    sourceBrand: 'FTMO',
    platform: 'YouTube series',
    title: 'The trader journey interview',
    hookPattern: 'A sit-down interview that opens on the trader\'s story, not the product.',
    format: 'standard',
    backgroundId: 'coffee-shop',
    ctaPattern: '"Become the next one" — start yours',
    whyItWorks: 'A repeatable series turns single stories into a genre: struggle → process → discipline.',
    signal: 'Interview series running for years; dozens of episodes published.',
    topicSeed: 'How I stopped blowing up my plan every Monday — a trader\'s routine',
    styleNote: 'Structure: interview beats — where the trader started, the habit that broke them, the routine that fixed it, what a normal day looks like now. The original\'s hook is a dollar figure — use NO money amounts, payouts, or results; the journey and the discipline are the whole story.',
    caution: 'Original hook is a profit figure — VEDD version tells the journey with zero numbers.',
  },
  {
    id: 'milestone-selfie',
    sourceBrand: 'Prop-firm creators',
    platform: 'TikTok / Reels UGC',
    title: 'The milestone selfie',
    hookPattern: 'First-second milestone reveal, selfie-style: the creator shares a moment they just hit.',
    format: 'standard',
    backgroundId: null,
    ctaPattern: 'Code/link in bio — start yours',
    whyItWorks: 'Reads as a peer\'s genuine life update, not an ad — borrowed authenticity.',
    signal: 'Documented as the dominant prop-firm channel (industry analysis, Sep 2026).',
    topicSeed: 'Day 30 of letting the brain grade every trade — here\'s my routine now',
    styleNote: 'Structure: casual selfie talking head, a PROCESS milestone celebrated in the first line (30 disciplined days, first finished Academy course, first week the plan was followed) with the app shown as part of the routine. The originals celebrate payouts and funded certificates — NEVER show money, payouts, balances, or pass rates; the milestone is the habit, not the money.',
    caution: 'Originals celebrate payouts — VEDD version celebrates process milestones only.',
  },
  {
    id: 'athlete-discipline',
    sourceBrand: 'Topstep',
    platform: 'TV + streaming',
    title: 'Trading as training',
    hookPattern: 'Cinematic athlete preparation with a discipline-over-talent line — trading isn\'t mentioned first.',
    format: 'standard',
    backgroundId: 'gym',
    ctaPattern: 'Soft brand CTA — start training',
    whyItWorks: 'Reframes trading as earned athletic discipline: trust built without promising money.',
    signal: 'National campaign launched Feb 2026 (incl. Super Bowl regional spots), still promoted Oct 2026. No profit claims in the creative.',
    topicSeed: 'Nobody sees the 5 a.m. chart review — trading is training',
    styleNote: 'Structure: training metaphor throughout — warm-up (pre-market review), reps (journaling trades), coach (the brain grading every rep), rest (risk rules that make you stop). Voiceover tone, cinematic and calm. No results talk at all; discipline is the flex.',
  },
  {
    id: 'anti-hype-coach',
    sourceBrand: 'eToro',
    platform: 'Film / social',
    title: 'The coach who hates hype',
    hookPattern: 'A tough coach character blows the whistle and mocks the "financial freedom by Friday" fantasy head-on.',
    format: 'standard',
    backgroundId: 'gym',
    ctaPattern: 'Open the app and look for yourself',
    whyItWorks: 'Names the audience\'s #1 suspicion — that trading ads lie — before they can think it.',
    signal: 'Campaign published May 2026 (Ads of the World).',
    topicSeed: 'Your coach is tired of trading gurus — here\'s the boring truth that works',
    styleNote: 'Structure: parody coach skit — the coach roasts guru promises (no Lambos, no freedom-by-Friday), then prescribes the unglamorous routine: read the chart, size the risk, journal the trade, let the brain grade it. Comedy first, product as the training plan. Never imply returns; sell visibility and process.',
  },
  {
    id: 'comedy-feud',
    sourceBrand: 'Kalshi',
    platform: 'TV + social',
    title: 'The feud (comedy reveal)',
    hookPattern: 'Pure comedy cold open: two rivals feud; the product is invisible until the reveal.',
    format: 'got-milk',
    backgroundId: 'podcast-studio',
    ctaPattern: 'Brand-only end card',
    whyItWorks: 'An abstract product becomes an everyday superpower inside a story people retell.',
    signal: 'Four-minute spot aired Oct 23, 2026 during World Series Game 1; trade coverage Oct 2026.',
    topicSeed: 'Two friends feud over tomorrow\'s forecast — one of them has a secret',
    styleNote: 'Structure: two-character comedy feud over a prediction (weather, a game, a price move) played straight; the loser demands the winner\'s secret; deadpan reveal — he just checks VEDD. Keep it on the comedy; no "edge," no winning claims, brand lands only at the end.',
  },
  {
    id: 'screen-first-demo',
    sourceBrand: 'Coinbase',
    platform: 'TikTok',
    title: 'Screen first, offer last',
    hookPattern: 'Screen-recording cold open — the app itself from frame one, sped up; the offer lands only at the end.',
    format: 'product-ad',
    backgroundId: null,
    ctaPattern: 'Install / start — the offer is the end card',
    whyItWorks: 'Zero friction: the product demonstrates itself; reported click-through peaked on the final-second end card.',
    signal: 'Reported 83.5K likes in 30 days (House of Marketers, updated Oct 12, 2026).',
    topicSeed: 'The whole VEDD flow in 15 seconds: drop a chart, get the read, set the risk',
    styleNote: 'Structure: the phone screen carries the whole ad — chart dropped in, the read appears, risk levels set, engine on. Fast cuts, no presenter face needed. End card carries the only ask: start free. The original used a signup bonus and a rising balance — use NEITHER: neutral feature demo, no growing numbers.',
    caution: 'Original used a bonus + rising balance — VEDD version: feature demo and "start free" only.',
  },
  {
    id: 'creator-confession',
    sourceBrand: 'Mint (Intuit)',
    platform: 'TikTok (creator)',
    title: 'The money-story confession',
    hookPattern: 'A finance creator opens with their own money story, brand unmentioned, in their normal content style.',
    format: 'standard',
    backgroundId: 'coffee-shop',
    ctaPattern: 'Soft caption CTA — try the app',
    whyItWorks: 'Total trust transfer: years of the creator\'s own habit inside a normal post reads as advice, not media.',
    signal: 'Reported 348.9K likes, 688 shares (House of Marketers, updated Oct 12, 2026). No return claims.',
    topicSeed: 'The habit that ended my chart FOMO — I let an AI grade me instead',
    styleNote: 'Structure: personal-confession talking head — a real bad habit first (revenge trading, FOMO entries, no journal), the moment it clicked, the simple routine that replaced it, soft mention of VEDD as the tool inside the routine. Behavior and discipline only — no results, no balances.',
  },
  {
    id: 'two-friends-car',
    sourceBrand: 'Albert',
    platform: 'TikTok',
    title: 'Two friends in a car',
    hookPattern: 'Dialogue cold open, mid-conversation: one friend voices the problem, no intro, no logo.',
    format: 'standard',
    backgroundId: 'car-interior',
    ctaPattern: 'The friend\'s recommendation line IS the CTA',
    whyItWorks: 'Objection and answer are both spoken by peers in a relatable moment — it feels overheard, not sold.',
    signal: 'Reported 50.3K likes, 486 comments, 533 shares in 30 days (House of Marketers, Oct 2026).',
    topicSeed: 'He keeps missing entries at work — his friend puts him on to VEDD',
    styleNote: 'Structure: two-hander skit in a car — friend one complains (missed the move again, charts at work impossible), friend two asks two questions and recommends the fix: the brain watches so you don\'t have to. The recommendation line is the CTA. The original pitched loan terms — no offers or amounts here.',
  },
  {
    id: 'one-feature-tip',
    sourceBrand: 'Robinhood',
    platform: 'TikTok / Instagram UGC',
    title: 'One feature you didn\'t know',
    hookPattern: 'A creator states one thing the app does that you probably didn\'t know, phone in hand.',
    format: 'standard',
    backgroundId: null,
    ctaPattern: 'Creator link — try the feature',
    whyItWorks: 'One feature explained like a tip from a friend — specificity clears the trust barrier polished ads hit.',
    signal: 'Brand listed among active UGC-creator recruiters in a 2026 roundup (crawled Oct 2026); its creator rules ban return claims.',
    topicSeed: 'One thing VEDD does you didn\'t know: it grades every trade you take',
    styleNote: 'Structure: single-feature explainer, phone in hand, plain language — the feature, why it matters in one line, how to find it. Pick ONE feature per video (trade grading, the two-second chart read, the weather engine). No comparisons with named rivals, no return claims.',
  },
];

export function getSyncAdStyle(id?: string | null): SyncAdStyle | null {
  if (!id) return null;
  return SYNC_AD_STYLES.find((s) => s.id === id) ?? null;
}

/** The bank's research date, shown in the UI so nobody mistakes it for a live feed. */
export const SYNC_BANK_REFRESHED = 'November 2026';
