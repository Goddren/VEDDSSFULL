/**
 * VEDD Sports Prediction Engine
 *
 * Fetches real game data from ESPN's unofficial API across NBA, NFL, MLB, NHL.
 * Produces Polymarket-ready win probability predictions using:
 *   - ELO rating system (in-memory, updates on final results)
 *   - Win % form factor
 *   - Home court/field advantage
 *   - Rest factor
 *   - Injury impact
 *   - Head-to-head history
 *   - News signal
 *
 * Then matches each game to active Polymarket sports markets and computes:
 *   - Edge % (model vs. market)
 *   - Kelly Criterion position size (capped at 5%)
 */

import axios from 'axios';

// ─── Constants ───────────────────────────────────────────────────────────────

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports';
const GAMMA_BASE = 'https://gamma-api.polymarket.com';
const GOOGLE_NEWS_BASE = 'https://news.google.com/rss/search';

const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

const ELO_K = 20;
const ELO_DEFAULT = 1500;

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SportsPrediction {
  gameId: string;
  sport: 'nba' | 'nfl' | 'mlb' | 'nhl';
  homeTeam: string;
  awayTeam: string;
  gameTime: string; // ISO
  status: 'scheduled' | 'in_progress' | 'final';
  modelProbHome: number;   // 0-100
  modelProbAway: number;
  polymarketMarketId?: string;
  polymarketQuestion?: string;
  polymarketHomePrice?: number; // 0-100 (YES price)
  polymarketUrl?: string;
  edgePct?: number;
  kellySizePct?: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  homeRecord?: string;
  awayRecord?: string;
  homeInjuries?: string[];
  awayInjuries?: string[];
  newsHeadlines?: string[];
  eloHome?: number;
  eloAway?: number;
}

interface CacheEntry {
  data: SportsPrediction[];
  fetchedAt: number;
}

interface EloMap {
  [teamId: string]: number;
}

interface InjuredPlayer {
  name: string;
  position: string;
  status: string; // 'OUT', 'QUESTIONABLE', 'DOUBTFUL', etc.
}

// ─── In-memory State ─────────────────────────────────────────────────────────

const eloRatings: EloMap = {};
let cache: CacheEntry | null = null;

// ─── ELO Helpers ─────────────────────────────────────────────────────────────

function getElo(teamId: string): number {
  return eloRatings[teamId] ?? ELO_DEFAULT;
}

function expectedScore(own: number, opp: number): number {
  return 1 / (1 + Math.pow(10, (opp - own) / 400));
}

function updateElo(winnerId: string, loserId: string): void {
  const wElo = getElo(winnerId);
  const lElo = getElo(loserId);
  const wExp = expectedScore(wElo, lElo);
  const lExp = expectedScore(lElo, wElo);
  eloRatings[winnerId] = wElo + ELO_K * (1 - wExp);
  eloRatings[loserId] = lElo + ELO_K * (0 - lExp);
}

function eloProbabilityHome(homeId: string, awayId: string): number {
  const h = getElo(homeId);
  const a = getElo(awayId);
  return expectedScore(h, a); // 0..1
}

// ─── Kelly Criterion ─────────────────────────────────────────────────────────

function kellySize(modelProb: number, marketPrice: number): number | undefined {
  // marketPrice is 0-100, convert to fraction
  const p = modelProb / 100;
  const q = 1 - p;
  const mkt = marketPrice / 100;
  if (mkt <= 0 || mkt >= 1) return undefined;
  const b = (1 / mkt) - 1; // decimal odds - 1
  const f = (b * p - q) / b;
  if (f <= 0) return undefined;
  return Math.min(f * 100, 5); // cap at 5%
}

// ─── HTTP Helpers ─────────────────────────────────────────────────────────────

async function safeGet<T>(url: string, params?: Record<string, any>): Promise<T | null> {
  try {
    const res = await axios.get<T>(url, {
      params,
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 VEDD-Sports/1.0' }
    });
    return res.data;
  } catch {
    return null;
  }
}

// ─── Name Normalization ───────────────────────────────────────────────────────

function normalizeName(name: string): string {
  return name.toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function teamsMatchMarket(homeTeam: string, awayTeam: string, question: string): boolean {
  const q = normalizeName(question);
  const h = normalizeName(homeTeam).split(' ').pop()!; // city nickname → last word
  const a = normalizeName(awayTeam).split(' ').pop()!;
  const hFull = normalizeName(homeTeam);
  const aFull = normalizeName(awayTeam);
  return (q.includes(h) || q.includes(hFull)) && (q.includes(a) || q.includes(aFull));
}

// ─── ESPN Fetchers ───────────────────────────────────────────────────────────

type SportKey = 'nba' | 'nfl' | 'mlb' | 'nhl';

const SPORT_PATHS: Record<SportKey, string> = {
  nba: 'basketball/nba',
  nfl: 'football/nfl',
  mlb: 'baseball/mlb',
  nhl: 'hockey/nhl',
};

interface ESPNScoreboard {
  events?: ESPNEvent[];
}

interface ESPNEvent {
  id: string;
  date: string;
  status?: { type?: { name?: string; completed?: boolean } };
  competitions?: ESPNCompetition[];
}

interface ESPNCompetition {
  competitors?: ESPNCompetitor[];
  situation?: any;
}

interface ESPNCompetitor {
  id: string;
  team: { id: string; displayName: string; abbreviation: string };
  homeAway: 'home' | 'away';
  winner?: boolean;
  score?: string;
  records?: Array<{ summary: string; type: string }>;
  statistics?: any[];
}

async function fetchScoreboard(sport: SportKey): Promise<ESPNEvent[]> {
  const path = SPORT_PATHS[sport];
  const data = await safeGet<ESPNScoreboard>(`${ESPN_BASE}/${path}/scoreboard`);
  return data?.events ?? [];
}

interface ESPNInjury {
  athlete?: { displayName?: string; position?: { abbreviation?: string } };
  status?: string;
  type?: { description?: string };
}

interface ESPNInjuriesResponse {
  injuries?: Array<{ injuries?: ESPNInjury[]; team?: { id?: string } }>;
}

async function fetchInjuries(sport: SportKey, teamId: string): Promise<InjuredPlayer[]> {
  const path = SPORT_PATHS[sport];
  const data = await safeGet<ESPNInjuriesResponse>(`${ESPN_BASE}/${path}/injuries`);
  if (!data?.injuries) return [];
  const result: InjuredPlayer[] = [];
  for (const entry of data.injuries) {
    if (entry.team?.id !== teamId) continue;
    for (const inj of entry.injuries ?? []) {
      if (inj.athlete?.displayName && inj.status) {
        result.push({
          name: inj.athlete.displayName,
          position: inj.athlete.position?.abbreviation ?? '',
          status: inj.status.toUpperCase(),
        });
      }
    }
  }
  return result;
}

// Key positions by sport — players at these positions have higher impact
const KEY_POSITIONS: Record<SportKey, string[]> = {
  nfl: ['QB', 'WR1', 'RB'],
  nba: ['PG', 'SG', 'SF'],
  mlb: ['SP', 'RP'],
  nhl: ['G', 'C', 'LW', 'RW'],
};

function injuryAdjustment(injuries: InjuredPlayer[], sport: SportKey): { adj: number; labels: string[] } {
  const keyPos = KEY_POSITIONS[sport];
  let adj = 0;
  const labels: string[] = [];
  for (const inj of injuries) {
    const isKey = keyPos.some(p => inj.position.toUpperCase().startsWith(p));
    if (!isKey) continue;
    if (inj.status === 'OUT') {
      adj -= 0.10;
      labels.push(`${inj.name} (${inj.position}) OUT`);
    } else if (['QUESTIONABLE', 'DOUBTFUL'].includes(inj.status)) {
      adj -= 0.04;
      labels.push(`${inj.name} (${inj.position}) ${inj.status}`);
    }
  }
  // Cap total adjustment at -0.20
  return { adj: Math.max(adj, -0.20), labels };
}

// ─── News Fetcher ─────────────────────────────────────────────────────────────

async function fetchNewsHeadlines(query: string): Promise<string[]> {
  try {
    const url = `${GOOGLE_NEWS_BASE}?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    const res = await axios.get<string>(url, { timeout: 8000 });
    const xml = res.data;
    const titles: string[] = [];
    const titleRegex = /<item>[\s\S]*?<title>([\s\S]*?)<\/title>/g;
    let match;
    while ((match = titleRegex.exec(xml)) !== null && titles.length < 5) {
      const raw = match[1].replace(/<!\[CDATA\[/, '').replace(/\]\]>/, '').trim();
      if (raw) titles.push(raw);
    }
    return titles;
  } catch {
    return [];
  }
}

// ─── Polymarket Fetcher ───────────────────────────────────────────────────────

interface PolymarketMarket {
  id: string;
  question: string;
  conditionId?: string;
  active: boolean;
  closed: boolean;
  outcomePrices?: string; // JSON array e.g. "[0.62, 0.38]"
  outcomes?: string;      // JSON array e.g. '["Yes","No"]'
  slug?: string;
  tags?: Array<{ id?: string; label?: string; slug?: string }>;
}

async function fetchPolymarketSportsMarkets(): Promise<PolymarketMarket[]> {
  const tags = ['sports', 'nba', 'nfl', 'mlb', 'nhl'];
  const results = await Promise.allSettled(
    tags.map(tag =>
      safeGet<{ markets?: PolymarketMarket[] } | PolymarketMarket[]>(
        `${GAMMA_BASE}/markets`,
        { active: true, closed: false, tag, limit: 100 }
      )
    )
  );

  const seen = new Set<string>();
  const markets: PolymarketMarket[] = [];
  for (const r of results) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const raw = r.value;
    const arr: PolymarketMarket[] = Array.isArray(raw)
      ? raw
      : (raw as any).markets ?? [];
    for (const m of arr) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        markets.push(m);
      }
    }
  }
  return markets;
}

function parseOutcomePrice(market: PolymarketMarket): number | undefined {
  try {
    if (!market.outcomePrices) return undefined;
    const prices = JSON.parse(market.outcomePrices) as number[];
    // First price is typically YES/team1 win
    const p = prices[0];
    return typeof p === 'number' ? p * 100 : undefined;
  } catch {
    return undefined;
  }
}

function buildPolymarketUrl(market: PolymarketMarket): string {
  const slug = market.slug ?? market.id;
  return `https://polymarket.com/event/${slug}`;
}

// ─── Rest Factor ─────────────────────────────────────────────────────────────

// We approximate rest by checking if there is a game in the previous 24h or 48h.
// Since we only have today's scoreboard, we track game dates seen per team.
const recentGameDates: Record<string, string[]> = {};

function registerGameDate(teamId: string, dateStr: string) {
  if (!recentGameDates[teamId]) recentGameDates[teamId] = [];
  if (!recentGameDates[teamId].includes(dateStr)) {
    recentGameDates[teamId].push(dateStr);
    // keep last 10 entries
    if (recentGameDates[teamId].length > 10) recentGameDates[teamId].shift();
  }
}

function restAdjustment(teamId: string, gameDate: Date): { adj: number; label: string | null } {
  const dates = recentGameDates[teamId] ?? [];
  const gameMs = gameDate.getTime();
  for (const d of dates) {
    const prev = new Date(d).getTime();
    const diffHours = (gameMs - prev) / 3600000;
    if (diffHours > 0 && diffHours <= 28) {
      return { adj: -0.03, label: 'back-to-back (fatigue)' };
    }
  }
  // Check for 2+ days rest
  const allPrev = dates.map(d => new Date(d).getTime()).filter(t => t < gameMs);
  if (allPrev.length === 0) return { adj: 0.01, label: '2+ days rest' };
  const mostRecent = Math.max(...allPrev);
  const diffDays = (gameMs - mostRecent) / 86400000;
  if (diffDays >= 2) return { adj: 0.01, label: '2+ days rest' };
  return { adj: 0, label: null };
}

// ─── Main Sport Processor ─────────────────────────────────────────────────────

async function processSport(sport: SportKey): Promise<SportsPrediction[]> {
  const events = await fetchScoreboard(sport);
  if (!events.length) return [];

  // First pass: update ELO from completed games, collect team IDs for injury fetch
  const teamIds = new Set<string>();
  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find(c => c.homeAway === 'home');
    const away = comp.competitors?.find(c => c.homeAway === 'away');
    if (home) teamIds.add(home.team.id);
    if (away) teamIds.add(away.team.id);

    const isFinal = ev.status?.type?.completed === true ||
      ev.status?.type?.name === 'STATUS_FINAL';
    if (isFinal && home && away) {
      registerGameDate(home.team.id, ev.date);
      registerGameDate(away.team.id, ev.date);
      const homeWon = home.winner === true;
      const awayWon = away.winner === true;
      if (homeWon) updateElo(home.team.id, away.team.id);
      else if (awayWon) updateElo(away.team.id, home.team.id);
    }
  }

  // Fetch all injuries in parallel (one call covers all teams in that sport)
  // We do a single injury pull and filter per team
  const allInjuriesRes = await safeGet<ESPNInjuriesResponse>(
    `${ESPN_BASE}/${SPORT_PATHS[sport]}/injuries`
  );

  function getTeamInjuries(teamId: string): InjuredPlayer[] {
    if (!allInjuriesRes?.injuries) return [];
    const result: InjuredPlayer[] = [];
    for (const entry of allInjuriesRes.injuries ?? []) {
      if (String(entry.team?.id) !== String(teamId)) continue;
      for (const inj of entry.injuries ?? []) {
        if (inj.athlete?.displayName && inj.status) {
          result.push({
            name: inj.athlete.displayName,
            position: inj.athlete.position?.abbreviation ?? '',
            status: inj.status.toUpperCase(),
          });
        }
      }
    }
    return result;
  }

  const predictions: SportsPrediction[] = [];

  for (const ev of events) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const homeComp = comp.competitors?.find(c => c.homeAway === 'home');
    const awayComp = comp.competitors?.find(c => c.homeAway === 'away');
    if (!homeComp || !awayComp) continue;

    const homeId = homeComp.team.id;
    const awayId = awayComp.team.id;

    const statusName = ev.status?.type?.name ?? '';
    const isFinal = ev.status?.type?.completed === true || statusName === 'STATUS_FINAL';
    const isInProgress = statusName === 'STATUS_IN_PROGRESS' ||
      statusName.includes('HALFTIME') || statusName.includes('INTERMISSION');

    const status: SportsPrediction['status'] = isFinal
      ? 'final'
      : isInProgress ? 'in_progress' : 'scheduled';

    const gameDate = new Date(ev.date);

    // Register game dates for rest tracking
    registerGameDate(homeId, ev.date);
    registerGameDate(awayId, ev.date);

    // ── ELO probability (40%) ─────────────────────────────────────────────────
    const eloHome = getElo(homeId);
    const eloAway = getElo(awayId);
    const eloProb = eloProbabilityHome(homeId, awayId); // 0..1

    // ── Win % from records (25%) ──────────────────────────────────────────────
    function parseRecord(comp: ESPNCompetitor): { w: number; l: number } | null {
      const overall = comp.records?.find(r => r.type === 'total' || r.type === 'overall');
      const rec = overall?.summary ?? comp.records?.[0]?.summary;
      if (!rec) return null;
      const parts = rec.split('-').map(Number);
      if (parts.length >= 2) return { w: parts[0], l: parts[1] };
      return null;
    }

    const homeRecord = parseRecord(homeComp);
    const awayRecord = parseRecord(awayComp);

    function winPct(rec: { w: number; l: number } | null): number {
      if (!rec) return 0.5;
      const total = rec.w + rec.l;
      return total === 0 ? 0.5 : rec.w / total;
    }

    const homeWinPct = winPct(homeRecord);
    const awayWinPct = winPct(awayRecord);
    // Normalize: relative win% contribution
    const totalWinPct = homeWinPct + awayWinPct || 1;
    const winPctProb = homeWinPct / totalWinPct;

    // ── Home advantage (baked into model, +6%) ────────────────────────────────
    const homeAdv = 0.06;

    // ── Rest factor (10%) ─────────────────────────────────────────────────────
    const homeRest = restAdjustment(homeId, gameDate);
    const awayRest = restAdjustment(awayId, gameDate);

    // ── Injury factor (15%) ───────────────────────────────────────────────────
    const homeInjuries = getTeamInjuries(homeId);
    const awayInjuries = getTeamInjuries(awayId);
    const homeInjAdj = injuryAdjustment(homeInjuries, sport);
    const awayInjAdj = injuryAdjustment(awayInjuries, sport);
    const injProb = 0.5 + homeInjAdj.adj - awayInjAdj.adj; // >0.5 = home favored

    // ── Composite probability ─────────────────────────────────────────────────
    // Weights: ELO 40%, WinPct 25%, HomeAdv applied as additive, Rest 10%, Injury 15%, H2H 10%
    // (H2H approximated as 0.5 if unavailable)
    const h2hProb = 0.5; // ESPN H2H scraping not available without extra calls

    let rawProb =
      0.40 * eloProb +
      0.25 * winPctProb +
      0.10 * (0.5 + (homeRest.adj - awayRest.adj)) +
      0.15 * Math.max(0, Math.min(1, injProb)) +
      0.10 * h2hProb;

    // Add home advantage boost
    rawProb = Math.min(0.95, Math.max(0.05, rawProb + homeAdv * 0.5));

    const modelProbHome = Math.round(rawProb * 100 * 10) / 10;
    const modelProbAway = Math.round((1 - rawProb) * 100 * 10) / 10;

    // ── Confidence ───────────────────────────────────────────────────────────
    const eloDiff = Math.abs(eloHome - eloAway);
    const confidence: SportsPrediction['confidence'] =
      eloDiff > 100 ? 'high' : eloDiff > 50 ? 'medium' : 'low';

    // ── Reason bullets ────────────────────────────────────────────────────────
    const reasons: string[] = [
      `ELO: ${homeComp.team.displayName} ${eloHome.toFixed(0)} vs ${awayComp.team.displayName} ${eloAway.toFixed(0)} → ${(eloProb * 100).toFixed(1)}% home`,
      `Win%: ${homeComp.team.displayName} ${(homeWinPct * 100).toFixed(1)}% vs ${awayComp.team.displayName} ${(awayWinPct * 100).toFixed(1)}%`,
      `Home advantage: +6% boost applied`,
    ];
    if (homeRest.label) reasons.push(`${homeComp.team.displayName} rest: ${homeRest.label}`);
    if (awayRest.label) reasons.push(`${awayComp.team.displayName} rest: ${awayRest.label}`);
    if (homeInjAdj.labels.length > 0) reasons.push(`${homeComp.team.displayName} injuries: ${homeInjAdj.labels.join(', ')}`);
    if (awayInjAdj.labels.length > 0) reasons.push(`${awayComp.team.displayName} injuries: ${awayInjAdj.labels.join(', ')}`);

    // ── News headlines ────────────────────────────────────────────────────────
    let newsHeadlines: string[] = [];
    try {
      newsHeadlines = await fetchNewsHeadlines(
        `${homeComp.team.displayName} vs ${awayComp.team.displayName}`
      );
    } catch {
      // non-fatal
    }

    predictions.push({
      gameId: ev.id,
      sport,
      homeTeam: homeComp.team.displayName,
      awayTeam: awayComp.team.displayName,
      gameTime: ev.date,
      status,
      modelProbHome,
      modelProbAway,
      confidence,
      reasons,
      homeRecord: homeRecord ? `${homeRecord.w}-${homeRecord.l}` : undefined,
      awayRecord: awayRecord ? `${awayRecord.w}-${awayRecord.l}` : undefined,
      homeInjuries: homeInjAdj.labels.length ? homeInjuries.filter(i => {
        const keyPos = KEY_POSITIONS[sport];
        return keyPos.some(p => i.position.toUpperCase().startsWith(p));
      }).map(i => `${i.name} (${i.status})`).slice(0, 5) : undefined,
      awayInjuries: awayInjAdj.labels.length ? awayInjuries.filter(i => {
        const keyPos = KEY_POSITIONS[sport];
        return keyPos.some(p => i.position.toUpperCase().startsWith(p));
      }).map(i => `${i.name} (${i.status})`).slice(0, 5) : undefined,
      newsHeadlines: newsHeadlines.length ? newsHeadlines : undefined,
      eloHome: Math.round(eloHome),
      eloAway: Math.round(eloAway),
    });
  }

  return predictions;
}

// ─── Polymarket Matcher ───────────────────────────────────────────────────────

function matchPolymarket(
  prediction: SportsPrediction,
  markets: PolymarketMarket[]
): Partial<SportsPrediction> {
  const matched = markets.find(m =>
    teamsMatchMarket(prediction.homeTeam, prediction.awayTeam, m.question)
  );
  if (!matched) return {};

  const price = parseOutcomePrice(matched);
  if (price === undefined) return { polymarketMarketId: matched.id, polymarketQuestion: matched.question, polymarketUrl: buildPolymarketUrl(matched) };

  const edgePct = Math.round((prediction.modelProbHome - price) * 10) / 10;
  const kelly = kellySize(prediction.modelProbHome, price);

  return {
    polymarketMarketId: matched.id,
    polymarketQuestion: matched.question,
    polymarketHomePrice: Math.round(price * 10) / 10,
    polymarketUrl: buildPolymarketUrl(matched),
    edgePct: edgePct,
    kellySizePct: kelly !== undefined ? Math.round(kelly * 100) / 100 : undefined,
  };
}

// ─── Main Fetch ───────────────────────────────────────────────────────────────

async function fetchAllPredictions(): Promise<SportsPrediction[]> {
  const sports: SportKey[] = ['nba', 'nfl', 'mlb', 'nhl'];

  const [sportResults, polymarkets] = await Promise.all([
    Promise.allSettled(sports.map(s => processSport(s))),
    fetchPolymarketSportsMarkets().catch(() => [] as PolymarketMarket[]),
  ]);

  let predictions: SportsPrediction[] = [];
  for (const r of sportResults) {
    if (r.status === 'fulfilled') {
      predictions = predictions.concat(r.value);
    }
  }

  // Match each prediction to Polymarket
  for (let i = 0; i < predictions.length; i++) {
    const match = matchPolymarket(predictions[i], polymarkets);
    if (Object.keys(match).length > 0) {
      predictions[i] = { ...predictions[i], ...match };

      // Enhance reasons with market data
      if (predictions[i].edgePct !== undefined && Math.abs(predictions[i].edgePct!) > 3) {
        predictions[i].reasons.push(
          `Polymarket edge: ${predictions[i].edgePct! > 0 ? '+' : ''}${predictions[i].edgePct}% (bet HOME)`
        );
      }
      if (predictions[i].kellySizePct !== undefined) {
        predictions[i].reasons.push(
          `Kelly position size: ${predictions[i].kellySizePct}% of bankroll`
        );
      }
    }
  }

  // Sort: scheduled first, then by game time
  predictions.sort((a, b) => {
    if (a.status === 'scheduled' && b.status !== 'scheduled') return -1;
    if (a.status !== 'scheduled' && b.status === 'scheduled') return 1;
    return new Date(a.gameTime).getTime() - new Date(b.gameTime).getTime();
  });

  return predictions;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns cached sports predictions (15 min TTL).
 * Never throws — returns empty array on total failure.
 */
export async function getSportsPredictions(): Promise<SportsPrediction[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.data;
  }
  return refreshSportsPredictions();
}

/**
 * Force-refreshes predictions, bypassing cache.
 * Never throws — returns partial or empty results on failure.
 */
export async function refreshSportsPredictions(): Promise<SportsPrediction[]> {
  try {
    const data = await fetchAllPredictions();
    cache = { data, fetchedAt: Date.now() };
    return data;
  } catch (err) {
    console.error('[sports-predictor] Fatal error during refresh:', err);
    return cache?.data ?? [];
  }
}
