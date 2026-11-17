// ─────────────────────────────────────────────────────────────────────────────
// Kalshi SPORTS odds-benchmark SHADOW lane (2026-11-15).
// Recon: research_notes/kalshi-prediction-models-recon-20261115.md §1A.
//
// Model: de-vigged sharp sportsbook odds are the probability benchmark.
//   • Primary source: OddsPapi (free tier includes Pinnacle — the sharp
//     benchmark) — key from env ODDSPAPI_KEY.
//   • Fallback source: The Odds API (free tier, mainstream books, no
//     Pinnacle) — key from env ODDS_API_KEY.
//   • Keys are SECRETS: read from env only, never logged, never printed.
//     NO key configured → the lane IDLES safely (one log line, no trades,
//     no crash) — it is built, visible in the panel, and dormant until
//     Chris adds a key to the server env.
// For every game the lane can STRICTLY match between a book and Kalshi
// (both teams + game window; ambiguous or unmatched = skip, never guess),
// it records an observation (book probability vs Kalshi ask) and Kalshi
// price snapshots, and opens a VIRTUAL position when the de-vigged book
// probability beats Kalshi's ask by ≥ 4 points — the same divergence bar
// as the live engine's sports guard. Positions resolve only from Kalshi's
// posted market result.
//
// SHADOW ONLY, by construction: this module imports NO authenticated
// Kalshi client, NO credential store, NO order path. The only outbound
// calls are public Kalshi market reads and the two odds APIs (keyed by
// env). Positions live in kalshi_sports_shadow_trades / _context (+
// _observations) and feed the shared shadow_ledger as source
// 'kalshi_sports_shadow'. Fail-open everywhere. Kill switch:
// KALSHI_SPORTS_ODDS=off. Owner account only, mirroring the other lanes.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { loopTick } from '../crash-heartbeat';
import { ensureKalshiSportsShadowTables } from './ensure-kalshi-sports-shadow-tables';
import { getKalshiMarketStatus } from './kalshi';
import {
  recordKalshiPriceSnapshots, countKalshiPriceSnapshots, pruneKalshiPriceSnapshots,
  type KalshiPriceSnapshotInput,
} from './kalshi-price-snapshots';
import { accountReplay, accountSimEnabled, type KalshiAccountSimResult } from './kalshi-stock-shadow';

export const LANE = 'kalshi_sports_shadow';
export const STRATEGY = 'sports_odds_benchmark';

export const sportsOddsShadowEnabled = () => process.env.KALSHI_SPORTS_ODDS !== 'off';
const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
/** The divergence bar: de-vigged book probability minus Kalshi ask, in
 *  points — 4 by default, matching the live engine's sports guard. */
export const MIN_DIVERGENCE_PTS = () => num('KALSHI_SPORTS_SHADOW_MIN_DIVERGENCE_PTS', 4);
const MIN_ENTRY_CENTS = () => Math.floor(num('KALSHI_SPORTS_SHADOW_MIN_ENTRY_CENTS', 5));
const MAX_ENTRY_CENTS = () => Math.floor(num('KALSHI_SPORTS_SHADOW_MAX_ENTRY_CENTS', 96));
const SPREAD_MAX_CENTS = () => Math.floor(num('KALSHI_SPORTS_SHADOW_SPREAD_MAX_CENTS', 10));
const MAX_OPEN = () => Math.floor(num('KALSHI_SPORTS_SHADOW_MAX_OPEN', 40));
const MAX_PER_CYCLE = () => Math.floor(num('KALSHI_SPORTS_SHADOW_MAX_PER_CYCLE', 10));
const ODDSPAPI_ODDS_CALL_CAP = () => Math.floor(num('KALSHI_SPORTS_ODDSPAPI_CALL_CAP', 8));
const NOTIONAL_USD = () => num('KALSHI_SPORTS_SHADOW_NOTIONAL_USD', 100);
const EVERY_MS = () => num('KALSHI_SPORTS_SHADOW_EVERY_MIN', 360) * 60_000;

// ── leagues ─────────────────────────────────────────────────────────────────
export interface LeagueConfig {
  key: string;                 // internal league key (stamped on rows)
  kalshiSeries: string;        // Kalshi game-winner series
  oddsApiSportKey: string;     // The Odds API sport key
  oddspapiSportSlug: string;   // slug fragment matched against OddsPapi /sports
}
export const LEAGUES: LeagueConfig[] = [
  { key: 'NFL',   kalshiSeries: 'KXNFLGAME',    oddsApiSportKey: 'americanfootball_nfl',  oddspapiSportSlug: 'american-football' },
  { key: 'NBA',   kalshiSeries: 'KXNBAGAME',    oddsApiSportKey: 'basketball_nba',        oddspapiSportSlug: 'basketball' },
  { key: 'MLB',   kalshiSeries: 'KXMLBGAME',    oddsApiSportKey: 'baseball_mlb',          oddspapiSportSlug: 'baseball' },
  { key: 'NHL',   kalshiSeries: 'KXNHLGAME',    oddsApiSportKey: 'icehockey_nhl',         oddspapiSportSlug: 'ice-hockey' },
  { key: 'NCAAF', kalshiSeries: 'KXNCAAFBGAME', oddsApiSportKey: 'americanfootball_ncaaf', oddspapiSportSlug: 'american-football' },
  { key: 'NCAAB', kalshiSeries: 'KXNCAAMBGAME', oddsApiSportKey: 'basketball_ncaab',      oddspapiSportSlug: 'basketball' },
];

// ── pure decision helpers (check-pinned) ────────────────────────────────────
/** Kalshi taker-fee placeholder, same convention as the weather lane:
 *  ≈ 0.07·C·P·(1−P) dollars ⇒ 7·(1−P)% of stake. cost_model='placeholder'. */
export function sportsFeePct(entryPriceFrac: number): number {
  if (!Number.isFinite(entryPriceFrac) || entryPriceFrac <= 0 || entryPriceFrac >= 1) return 0;
  return 7 * (1 - entryPriceFrac);
}
export function sportsSettlementReturnPct(entryCents: number, resultYes: boolean, feePct: number): number {
  const gross = resultYes ? ((100 - entryCents) / entryCents) * 100 : -100;
  return gross - feePct;
}

/** De-vig a two-way market: implied p = 1/decimal; true p = implied /
 *  (sum of implied). Returns [pA, pB] as fractions, or null on bad input. */
export function devigTwoWay(priceA: number, priceB: number): [number, number] | null {
  if (!Number.isFinite(priceA) || !Number.isFinite(priceB) || priceA <= 1 || priceB <= 1) return null;
  const ia = 1 / priceA, ib = 1 / priceB, s = ia + ib;
  if (!(s > 0)) return null;
  return [ia / s, ib / s];
}

/** The lane's entry bar: divergence at/over threshold, ask inside the
 *  tradeable band, spread within cap. */
export function sportsEntryQualifies(args: {
  divergencePts: number; askCents: number; spreadCents: number;
  minDivergencePts: number; minEntryCents: number; maxEntryCents: number; spreadMaxCents: number;
}): boolean {
  return args.divergencePts >= args.minDivergencePts
    && args.askCents >= args.minEntryCents && args.askCents <= args.maxEntryCents
    && args.spreadCents <= args.spreadMaxCents;
}

// ── strict team matching (check-pinned) ─────────────────────────────────────
/** Lowercase, alnum-only, single-spaced team name. */
export function normalizeTeamName(s: string): string {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
/** A Kalshi team label (yes_sub_title — often truncated, e.g. "Washington",
 *  "Los Angeles R") matches a book team name when one normalized name is a
 *  prefix of the other. Too-short labels never match. */
export function kalshiTeamMatches(kalshiLabel: string, bookTeam: string): boolean {
  const a = normalizeTeamName(kalshiLabel), b = normalizeTeamName(bookTeam);
  if (a.length < 3 || b.length < 3) return false;
  return b.startsWith(a) || a.startsWith(b);
}

export interface KalshiGameSide { ticker: string; teamLabel: string; yesBid: number; yesAsk: number; lastPrice: number; volume: number }
export interface KalshiGame {
  eventTicker: string; seriesTicker: string; league: string;
  sides: [KalshiGameSide, KalshiGameSide];
  closeTime: string;
}
export interface BookGame {
  source: 'oddspapi' | 'oddsapi';
  league: string;
  bookmaker: string;
  commenceTime: string;   // ISO
  sides: [{ team: string; priceDec: number }, { team: string; priceDec: number }];
}

/** STRICT match: a Kalshi game matches a book game only when BOTH Kalshi
 *  team labels match DISTINCT book teams AND the game windows agree
 *  (Kalshi close vs book commence within 36h). Returns the matched book
 *  game only when EXACTLY ONE candidate qualifies — ambiguity is a skip. */
export function matchKalshiGame(game: KalshiGame, bookGames: BookGame[]): BookGame | null {
  const closeMs = new Date(game.closeTime).getTime();
  const candidates: BookGame[] = [];
  for (const bg of bookGames) {
    if (bg.league !== game.league) continue;
    const startMs = new Date(bg.commenceTime).getTime();
    if (!Number.isFinite(closeMs) || !Number.isFinite(startMs)) continue;
    if (Math.abs(closeMs - startMs) > 36 * 3600_000) continue;
    const [k0, k1] = game.sides;
    const direct = kalshiTeamMatches(k0.teamLabel, bg.sides[0].team) && kalshiTeamMatches(k1.teamLabel, bg.sides[1].team);
    const crossed = kalshiTeamMatches(k0.teamLabel, bg.sides[1].team) && kalshiTeamMatches(k1.teamLabel, bg.sides[0].team);
    if (direct || crossed) candidates.push(bg);
  }
  return candidates.length === 1 ? candidates[0] : null;
}
/** Which book side a Kalshi side corresponds to (0/1), or -1. */
export function bookSideIndexFor(game: KalshiGame, sideIdx: 0 | 1, bg: BookGame): number {
  const label = game.sides[sideIdx].teamLabel;
  if (kalshiTeamMatches(label, bg.sides[0].team)) return 0;
  if (kalshiTeamMatches(label, bg.sides[1].team)) return 1;
  return -1;
}

// ── book payload normalizers (pure, check-pinned) ───────────────────────────
const BOOK_PREFERENCE = ['pinnacle', 'draftkings', 'fanduel', 'betmgm', 'bet365', 'williamhill_us', 'betrivers', 'espnbet'];
/** The Odds API v4 sport-odds payload → BookGames. Prefers Pinnacle when
 *  present (it isn't on The Odds API), else the preference order, else the
 *  first book carrying an h2h market. */
export function normalizeOddsApiPayload(payload: any, league: string): BookGame[] {
  if (!Array.isArray(payload)) return [];
  const out: BookGame[] = [];
  for (const ev of payload) {
    const home = String(ev?.home_team ?? ''), away = String(ev?.away_team ?? '');
    const commence = String(ev?.commence_time ?? '');
    if (!home || !away || !commence) continue;
    const books = Array.isArray(ev?.bookmakers) ? ev.bookmakers : [];
    const withH2h = books.filter((b: any) => Array.isArray(b?.markets) && b.markets.some((m: any) => m?.key === 'h2h'));
    if (!withH2h.length) continue;
    const chosen = [...withH2h].sort((a: any, b: any) => {
      const ia = BOOK_PREFERENCE.indexOf(String(a?.key ?? '')), ib = BOOK_PREFERENCE.indexOf(String(b?.key ?? ''));
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })[0];
    const h2h = chosen.markets.find((m: any) => m?.key === 'h2h');
    const priceOf = (team: string) => {
      const o = (h2h?.outcomes ?? []).find((x: any) => String(x?.name ?? '') === team);
      const p = Number(o?.price);
      return Number.isFinite(p) && p > 1 ? p : null;
    };
    const hp = priceOf(home), ap = priceOf(away);
    if (hp == null || ap == null) continue;
    out.push({
      source: 'oddsapi', league, bookmaker: String(chosen.key ?? 'unknown'), commenceTime: commence,
      sides: [{ team: home, priceDec: hp }, { team: away, priceDec: ap }],
    });
  }
  return out;
}

/** OddsPapi v4 moneyline extraction from one fixture's /odds payload.
 *  `marketNames` maps marketId → catalog name; the moneyline market is the
 *  one named like 'moneyline' / 'ml' / 'match winner'. Outcomes are keyed
 *  by outcomeId; outcome names (when the payload carries them) must name
 *  the fixture's two participants — anything else is a skip (null). */
export function extractOddsPapiMoneyline(
  fixture: { participant1Name?: string; participant2Name?: string },
  oddsPayload: any,
  marketNames: Map<string, string>,
  preferredBook = 'pinnacle',
): { bookmaker: string; sides: [{ team: string; priceDec: number }, { team: string; priceDec: number }] } | null {
  const t1 = String(fixture?.participant1Name ?? ''), t2 = String(fixture?.participant2Name ?? '');
  if (!t1 || !t2) return null;
  const books = oddsPayload?.bookmakerOdds;
  if (!books || typeof books !== 'object') return null;
  const slugs = Object.keys(books);
  const slug = slugs.includes(preferredBook) ? preferredBook : slugs[0];
  if (!slug) return null;
  const markets = books[slug]?.markets;
  if (!markets || typeof markets !== 'object') return null;
  for (const [marketId, market] of Object.entries<any>(markets)) {
    const name = (marketNames.get(marketId) ?? '').toLowerCase();
    const isMl = name === 'ml' || name.includes('moneyline') || name.includes('money line') || name.includes('match winner') || name.includes('full time result');
    if (!isMl) continue;
    const outcomes = (market as any)?.outcomes;
    if (!outcomes || typeof outcomes !== 'object') continue;
    const entries = Object.entries<any>(outcomes);
    if (entries.length !== 2) continue;
    const priceOf = (entry: any): number | null => {
      const p = Number(entry?.players?.['0']?.price);
      return Number.isFinite(p) && p > 1 ? p : null;
    };
    // Name outcomes when the payload names them; otherwise the two
    // outcomes map to the two participants in order — and ONLY in order
    // when no name contradicts it.
    const named = entries.map(([, o]) => String(o?.name ?? o?.outcomeName ?? ''));
    let sides: [{ team: string; priceDec: number }, { team: string; priceDec: number }] | null = null;
    if (named.every((n) => n)) {
      const i1 = named.findIndex((n) => kalshiTeamMatches(n, t1) || kalshiTeamMatches(t1, n));
      const i2 = named.findIndex((n) => kalshiTeamMatches(n, t2) || kalshiTeamMatches(t2, n));
      if (i1 < 0 || i2 < 0 || i1 === i2) return null;
      const p1 = priceOf(entries[i1][1]), p2 = priceOf(entries[i2][1]);
      if (p1 == null || p2 == null) return null;
      sides = [{ team: t1, priceDec: p1 }, { team: t2, priceDec: p2 }];
    } else {
      const p1 = priceOf(entries[0][1]), p2 = priceOf(entries[1][1]);
      if (p1 == null || p2 == null) return null;
      sides = [{ team: t1, priceDec: p1 }, { team: t2, priceDec: p2 }];
    }
    return { bookmaker: slug, sides };
  }
  return null;
}

// ── external data (fail-soft) ───────────────────────────────────────────────
export type JsonFetcher = (url: string) => Promise<any>;
const defaultFetcher: JsonFetcher = async (url: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'VEDD-Trading-AI/1.0', Accept: 'application/json' }, signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.split('?')[0]}`);
  return res.json();
};
const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const dollarsToCents = (v: any): number => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? Math.round(n * 100) : 0; };

/** Open Kalshi game-winner markets for one series, grouped into 2-sided
 *  games. Events with ≠2 active markets are skipped (not moneyline pairs). */
export async function fetchKalshiGames(league: LeagueConfig, fetcher: JsonFetcher = defaultFetcher): Promise<KalshiGame[]> {
  const data = await fetcher(`${KALSHI_BASE}/markets?series_ticker=${league.kalshiSeries}&status=open&limit=1000`);
  const markets = Array.isArray(data?.markets) ? data.markets : [];
  const byEvent = new Map<string, any[]>();
  for (const m of markets) {
    if (m?.status !== 'active' && m?.status !== 'open') continue;
    const ev = String(m?.event_ticker ?? '');
    if (!ev) continue;
    (byEvent.get(ev) ?? byEvent.set(ev, []).get(ev)!).push(m);
  }
  const games: KalshiGame[] = [];
  for (const [eventTicker, ms] of Array.from(byEvent.entries())) {
    if (ms.length !== 2) continue;
    const side = (m: any): KalshiGameSide => {
      const bid = dollarsToCents(m.yes_bid_dollars), ask = dollarsToCents(m.yes_ask_dollars), last = dollarsToCents(m.last_price_dollars);
      return {
        ticker: String(m.ticker), teamLabel: String(m.yes_sub_title ?? ''),
        yesBid: bid, yesAsk: ask, lastPrice: last, volume: parseFloat(m.volume_fp ?? '0') || 0,
      };
    };
    const sides = ms.map(side) as [KalshiGameSide, KalshiGameSide];
    if (!sides[0].teamLabel || !sides[1].teamLabel) continue;
    games.push({
      eventTicker, seriesTicker: league.kalshiSeries, league: league.key, sides,
      closeTime: String(ms[0].close_time ?? ms[1].close_time ?? ''),
    });
  }
  return games;
}

/** Best YES price estimate for a side, mirroring kalshi.ts buildBrackets:
 *  last trade, else bid/ask mid, else 100 − no-side (not available here). */
export function kalshiYesPriceCents(s: KalshiGameSide): number {
  if (s.lastPrice > 0) return s.lastPrice;
  if (s.yesBid > 0 && s.yesAsk > 0) return Math.round((s.yesBid + s.yesAsk) / 2);
  return Math.max(s.yesBid, s.yesAsk);
}

// ── odds sources ────────────────────────────────────────────────────────────
export function configuredOddsSource(): 'oddspapi' | 'oddsapi' | null {
  if (process.env.ODDSPAPI_KEY) return 'oddspapi';
  if (process.env.ODDS_API_KEY) return 'oddsapi';
  return null;
}

async function fetchOddsApiGames(league: LeagueConfig, fetcher: JsonFetcher): Promise<BookGame[]> {
  const key = process.env.ODDS_API_KEY as string;
  const url = `https://api.the-odds-api.com/v4/sports/${league.oddsApiSportKey}/odds/?apiKey=${encodeURIComponent(key)}&regions=us&markets=h2h&oddsFormat=decimal`;
  return normalizeOddsApiPayload(await fetcher(url), league.key);
}

const _papiSportsCache = { at: 0, map: new Map<string, number>() };
async function oddspapiSportId(league: LeagueConfig, fetcher: JsonFetcher): Promise<number | null> {
  if (Date.now() - _papiSportsCache.at > 24 * 3600_000) {
    const key = process.env.ODDSPAPI_KEY as string;
    const sports = await fetcher(`https://api.oddspapi.io/v4/sports?apiKey=${encodeURIComponent(key)}`);
    const list = Array.isArray(sports) ? sports : sports?.data ?? [];
    const map = new Map<string, number>();
    for (const s of list) {
      const slug = String(s?.slug ?? s?.name ?? '').toLowerCase();
      const id = Number(s?.id ?? s?.sportId);
      if (slug && Number.isFinite(id)) map.set(slug, id);
    }
    _papiSportsCache.map = map; _papiSportsCache.at = Date.now();
  }
  for (const [slug, id] of Array.from(_papiSportsCache.map.entries())) if (slug.includes(league.oddspapiSportSlug)) return id;
  return null;
}

async function fetchOddsPapiGames(league: LeagueConfig, fetcher: JsonFetcher, oddsCallBudget: { left: number }): Promise<BookGame[]> {
  const key = process.env.ODDSPAPI_KEY as string;
  const sportId = await oddspapiSportId(league, fetcher);
  if (sportId == null) return [];
  const from = new Date(Date.now() - 12 * 3600_000).toISOString();
  const to = new Date(Date.now() + 4 * 24 * 3600_000).toISOString();
  const fx = await fetcher(`https://api.oddspapi.io/v4/fixtures?sportId=${sportId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&apiKey=${encodeURIComponent(key)}`);
  const fixtures = (Array.isArray(fx) ? fx : fx?.data ?? []).filter((f: any) => f?.hasOdds !== false);
  // Market-name catalog (one call per league per day, cached in-process).
  const catKey = `cat:${sportId}`;
  let names = _papiCatalogCache.get(catKey);
  if (!names) {
    names = new Map<string, string>();
    try {
      const cat = await fetcher(`https://api.oddspapi.io/v4/markets?sportId=${sportId}&apiKey=${encodeURIComponent(key)}`);
      const list = Array.isArray(cat) ? cat : cat?.data ?? cat?.markets ?? [];
      for (const m of list) { const id = String(m?.id ?? m?.marketId ?? ''); if (id) names.set(id, String(m?.name ?? '')); }
    } catch { /* catalog optional — extractor falls back to named outcomes */ }
    _papiCatalogCache.set(catKey, names);
  }
  const out: BookGame[] = [];
  for (const f of fixtures) {
    if (oddsCallBudget.left <= 0) break;
    const fixtureId = String(f?.fixtureId ?? f?.id ?? '');
    if (!fixtureId) continue;
    oddsCallBudget.left--;
    try {
      const odds = await fetcher(`https://api.oddspapi.io/v4/odds?fixtureId=${encodeURIComponent(fixtureId)}&apiKey=${encodeURIComponent(key)}`);
      const ml = extractOddsPapiMoneyline(f, odds?.data ?? odds, names);
      if (!ml) continue;
      out.push({
        source: 'oddspapi', league: league.key, bookmaker: ml.bookmaker,
        commenceTime: String(f?.startTime ?? f?.commenceTime ?? ''), sides: ml.sides,
      });
    } catch { /* one bad fixture never blocks the league */ }
  }
  return out;
}
const _papiCatalogCache = new Map<string, Map<string, string>>();

// ── cycle ───────────────────────────────────────────────────────────────────
export interface SportsShadowCycleResult {
  opened: number; resolved: number; snapshots: number; matched: number; evaluated: number;
  source: string | null; reasons: string[]; at: string;
}
let _lastCycle: SportsShadowCycleResult | null = null;
export function lastSportsShadowCycle(): SportsShadowCycleResult | null { return _lastCycle; }

export async function runKalshiSportsShadowCycle(userId: number): Promise<SportsShadowCycleResult> {
  const result: SportsShadowCycleResult = {
    opened: 0, resolved: 0, snapshots: 0, matched: 0, evaluated: 0,
    source: configuredOddsSource(), reasons: [], at: new Date().toISOString(),
  };
  if (!sportsOddsShadowEnabled()) { result.reasons.push('disabled (KALSHI_SPORTS_ODDS=off)'); _lastCycle = result; return result; }
  await ensureKalshiSportsShadowTables();

  result.resolved = await resolveSportsShadowTrades(userId).catch(() => 0);
  await pruneKalshiPriceSnapshots().catch(() => -1);

  const source = configuredOddsSource();
  if (!source) {
    result.reasons.push('idle — no odds API key configured (ODDSPAPI_KEY / ODDS_API_KEY); lane is built and dormant');
    _lastCycle = result;
    return result;
  }

  const { rows: openCountRows } = await pool.query(
    `SELECT count(*)::int AS n FROM kalshi_sports_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  let openTotal = Number(openCountRows[0]?.n ?? 0);
  const oddsBudget = { left: ODDSPAPI_ODDS_CALL_CAP() };
  const now = Date.now();

  for (const league of LEAGUES) {
    try {
      const games = await fetchKalshiGames(league).catch((e: any) => {
        result.reasons.push(`${league.key}: Kalshi markets unavailable (${e.message})`);
        return [] as KalshiGame[];
      });
      if (!games.length) continue;
      const bookGames = source === 'oddspapi'
        ? await fetchOddsPapiGames(league, defaultFetcher, oddsBudget).catch(() => [] as BookGame[])
        : await fetchOddsApiGames(league, defaultFetcher).catch(() => [] as BookGame[]);
      if (!bookGames.length) { result.reasons.push(`${league.key}: no book games returned (${source})`); continue; }

      for (const game of games) {
        result.evaluated++;
        const bg = matchKalshiGame(game, bookGames);
        if (!bg) continue;   // unmatched or ambiguous — skip, never guess
        result.matched++;
        const probs = devigTwoWay(bg.sides[0].priceDec, bg.sides[1].priceDec);
        if (!probs) continue;
        const startMs = new Date(bg.commenceTime).getTime();
        if (Number.isFinite(startMs) && startMs < now - 15 * 60_000) continue;  // pre-game benchmark only

        const snapRows: KalshiPriceSnapshotInput[] = [];
        const openedTickers = new Set<string>();
        for (const sideIdx of [0, 1] as const) {
          const side = game.sides[sideIdx];
          const bi = bookSideIndexFor(game, sideIdx, bg);
          if (bi < 0) continue;
          const bookProbPct = probs[bi] * 100;
          const ask = side.yesAsk > 0 ? side.yesAsk : kalshiYesPriceCents(side);
          const spread = side.yesBid > 0 ? ask - side.yesBid : SPREAD_MAX_CENTS() + 1;
          const divergence = bookProbPct - ask;

          await pool.query(
            `INSERT INTO kalshi_sports_shadow_observations
               (user_id, league, event_ticker, market_ticker, team, book_prob_pct, kalshi_ask_cents, divergence_cents, bookmaker, odds_source, commence_time)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [userId, league.key, game.eventTicker, side.ticker, bg.sides[bi].team, bookProbPct, ask, divergence,
             bg.bookmaker, bg.source, Number.isFinite(startMs) ? new Date(startMs).toISOString() : null]).catch(() => {});
          snapRows.push({
            lane: LANE, userId, marketTicker: side.ticker, eventTicker: game.eventTicker, seriesTicker: game.seriesTicker,
            yesBidCents: side.yesBid, yesAskCents: side.yesAsk, lastPriceCents: side.lastPrice, volume: side.volume, kind: 'interval',
          });

          if (!sportsEntryQualifies({
            divergencePts: divergence, askCents: ask, spreadCents: spread,
            minDivergencePts: MIN_DIVERGENCE_PTS(), minEntryCents: MIN_ENTRY_CENTS(),
            maxEntryCents: MAX_ENTRY_CENTS(), spreadMaxCents: SPREAD_MAX_CENTS(),
          })) continue;
          if (result.opened >= MAX_PER_CYCLE() || openTotal >= MAX_OPEN()) continue;
          const { rows: dup } = await pool.query(
            `SELECT id FROM kalshi_sports_shadow_trades WHERE user_id=$1 AND ticker=$2 AND status='open'`, [userId, side.ticker]);
          if (dup.length) continue;
          const feePct = sportsFeePct(ask / 100);
          const notional = NOTIONAL_USD();
          const ins = await pool.query(
            `INSERT INTO kalshi_sports_shadow_trades
               (user_id, strategy, league, series_ticker, event_ticker, ticker, team, opponent,
                entry_price_cents, entry_bid_cents, entry_ask_cents, book_prob_pct, divergence_cents,
                bookmaker, odds_source, contracts, notional_usd, fee_pct, cost_model, commence_time)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'placeholder',$19)
             ON CONFLICT (user_id, ticker) WHERE status='open' DO NOTHING RETURNING id`,
            [userId, STRATEGY, league.key, game.seriesTicker, game.eventTicker, side.ticker, bg.sides[bi].team,
             bg.sides[bi === 0 ? 1 : 0].team, ask, side.yesBid || null, side.yesAsk || null, bookProbPct, divergence,
             bg.bookmaker, bg.source, notional / (ask / 100), notional, feePct,
             Number.isFinite(startMs) ? new Date(startMs).toISOString() : null]).catch(() => ({ rows: [] as any[] }));
          const tradeId = ins.rows[0]?.id;
          if (!tradeId) continue;
          openedTickers.add(side.ticker);
          await pool.query(
            `INSERT INTO kalshi_sports_shadow_context
               (trade_id, user_id, strategy, league, ticker, book_home_price_dec, book_away_price_dec,
                book_prob_pct, market_ask_cents, divergence_cents, spread_cents, bookmaker, odds_source, hour_utc)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (trade_id) DO NOTHING`,
            [tradeId, userId, STRATEGY, league.key, side.ticker, bg.sides[0].priceDec, bg.sides[1].priceDec,
             bookProbPct, ask, divergence, spread, bg.bookmaker, bg.source, new Date().getUTCHours()]).catch(() => {});
          openTotal++; result.opened++;
        }
        for (const s of snapRows) if (openedTickers.has(s.marketTicker)) s.kind = 'decision';
        result.snapshots += await recordKalshiPriceSnapshots(snapRows);
      }
      result.reasons.push(`${league.key}: ${games.length} Kalshi games, ${bookGames.length} book games (${source}/${bookGames[0]?.bookmaker ?? '—'})`);
    } catch (err: any) {
      result.reasons.push(`${league.key}: ${err.message}`);
    }
  }

  _lastCycle = result;
  return result;
}

// ── resolver ────────────────────────────────────────────────────────────────
/** Close open shadow positions from Kalshi's posted result. A market closed
 *  without a result 72h+ after entry expires excluded from stats. */
export async function resolveSportsShadowTrades(userId: number): Promise<number> {
  await ensureKalshiSportsShadowTables();
  const { rows } = await pool.query(
    `SELECT id, ticker, event_ticker, series_ticker, entry_price_cents, fee_pct, opened_at
       FROM kalshi_sports_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  let closed = 0;
  for (const t of rows) {
    try {
      const st = await getKalshiMarketStatus(String(t.ticker));
      if (!st) continue;
      if (st.result === 'yes' || st.result === 'no') {
        const yes = st.result === 'yes';
        const ret = sportsSettlementReturnPct(Number(t.entry_price_cents), yes, Number(t.fee_pct) || 0);
        const gross = yes ? ((100 - Number(t.entry_price_cents)) / Number(t.entry_price_cents)) * 100 : -100;
        await pool.query(
          `UPDATE kalshi_sports_shadow_trades
              SET status='closed', result=$2, exit_price_cents=$3, exit_reason='settlement',
                  gross_return_pct=$4, return_pct=$5, r_multiple=$6, closed_at=now()
            WHERE id=$1 AND status='open'`,
          [t.id, st.result, yes ? 100 : 0, gross, ret, ret / 100]);
        await pool.query(
          `UPDATE kalshi_sports_shadow_context
              SET closed_at=now(), exit_reason='settlement',
                  hold_minutes=extract(epoch from (now() - $2::timestamptz)) / 60, net_pct=$3
            WHERE trade_id=$1`,
          [t.id, t.opened_at, ret]).catch(() => {});
        await recordKalshiPriceSnapshots([{
          lane: LANE, userId, marketTicker: String(t.ticker), eventTicker: t.event_ticker, seriesTicker: t.series_ticker,
          yesBidCents: st.yesBid, yesAskCents: st.yesAsk, lastPriceCents: st.lastPrice, kind: 'settlement',
        }]);
        closed++;
      } else if ((st.status === 'closed' || st.status === 'finalized')
        && Date.now() - new Date(t.opened_at).getTime() > 72 * 3600_000) {
        await pool.query(
          `UPDATE kalshi_sports_shadow_trades
              SET status='expired', exit_reason='no_result_72h', exclude_from_stats=true, closed_at=now()
            WHERE id=$1 AND status='open'`, [t.id]);
        closed++;
      }
    } catch { /* fail-soft per position */ }
  }
  return closed;
}

// ── bucket stats ────────────────────────────────────────────────────────────
export interface SportsBucketStat { strategy: string; dim: string; bucket: string; n: number; medianNet: number; winRate: number; verdict: 'favor' | 'avoid' | 'learning' }
export function sportsBucketsOf(c: {
  league?: string | null; odds_source?: string | null; bookmaker?: string | null;
  divergence_cents?: number | null; book_prob_pct?: number | null;
}): Record<string, string> {
  const b: Record<string, string> = {};
  if (c.league) b.league = c.league;
  if (c.odds_source) b.source = c.odds_source;
  if (c.bookmaker) b.book = c.bookmaker;
  if (c.divergence_cents != null) b.divergence = c.divergence_cents < 6 ? '4-6pts' : c.divergence_cents < 10 ? '6-10pts' : '10pts+';
  if (c.book_prob_pct != null) b.prob = c.book_prob_pct < 40 ? '<40%' : c.book_prob_pct < 60 ? '40-60%' : c.book_prob_pct < 80 ? '60-80%' : '80%+';
  return b;
}
function quantile(s: number[], q: number) { if (!s.length) return 0; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
export function aggregateSportsStats(rows: any[]): SportsBucketStat[] {
  const g = new Map<string, number[]>();
  for (const r of rows) {
    const v = Number(r.net_pct); if (!Number.isFinite(v)) continue;
    for (const [dim, bucket] of Object.entries({ ...sportsBucketsOf(r), all: 'all' })) {
      const k = `${STRATEGY}|${dim}|${bucket}`; (g.get(k) ?? g.set(k, []).get(k)!).push(v);
    }
  }
  return Array.from(g.entries()).map(([k, v]) => {
    const [strategy, dim, bucket] = k.split('|'); const s = v.slice().sort((a, b) => a - b); const med = quantile(s, 0.5);
    const verdict: SportsBucketStat['verdict'] = s.length >= 15 ? (med > 0.5 ? 'favor' : med < -1 ? 'avoid' : 'learning') : 'learning';
    return { strategy, dim, bucket, n: s.length, medianNet: med, winRate: s.filter((x) => x > 0).length / s.length, verdict };
  });
}

// ── report (panel) ──────────────────────────────────────────────────────────
export interface KalshiSportsShadowReport {
  enabled: boolean;
  strategy: string;
  minDivergencePts: number;
  activation: { oddspapiKeyConfigured: boolean; oddsApiKeyConfigured: boolean; activeSource: 'oddspapi' | 'oddsapi' | null };
  summary: {
    openCount: number; closedCount: number; wins: number; winRate: number | null;
    avgReturnPct: number | null; avgR: number | null; estNetPnlUsd: number;
    snapshots: number; observations: number; lastOpenedAt: string | null; lastClosedAt: string | null;
  };
  // $100-account illustration over the window's closes, replayed with the
  // stock-perp lane's shared accountReplay. Absent when
  // KALSHI_ACCOUNT_SIM=off (the client then hides the block). Present with
  // zero trades while the lane is dormant — the panel renders the $100
  // start state instead of hiding it.
  accountSim?: KalshiAccountSimResult;
  byLeague: Array<{ league: string; trades: number; wins: number; win_rate: number | null; avg_return_pct: number | null; est_net_pnl_usd: number }>;
  openPositions: any[];
  recentCloses: any[];
  bucketStats: SportsBucketStat[];
  lastCycle: SportsShadowCycleResult | null;
}

export async function getKalshiSportsShadowReport(userId: number, days = 30): Promise<KalshiSportsShadowReport> {
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(365, Math.floor(days))) : 30;
  await ensureKalshiSportsShadowTables();
  const validWhere = `user_id=$1 AND status='closed' AND exclude_from_stats IS NOT TRUE
    AND return_pct IS NOT NULL AND closed_at >= now() - ($2::int * interval '1 day')`;
  const simOn = accountSimEnabled();
  const [summaryRes, byLeagueRes, openRes, recentRes, statsRows, snapshots, obsRes, closesRes] = await Promise.all([
    pool.query(
      `SELECT (SELECT count(*)::int FROM kalshi_sports_shadow_trades WHERE user_id=$1 AND status='open') AS open_count,
         count(*)::int AS closed_count,
         (count(*) FILTER (WHERE return_pct > 0))::int AS wins,
         CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE return_pct > 0))::float / count(*)::float END AS win_rate,
         avg(return_pct)::float AS avg_return_pct, avg(r_multiple)::float AS avg_r,
         COALESCE(sum(notional_usd * return_pct / 100), 0)::float AS est_net_pnl_usd,
         (SELECT max(opened_at) FROM kalshi_sports_shadow_trades WHERE user_id=$1) AS last_opened_at,
         max(closed_at) AS last_closed_at
       FROM kalshi_sports_shadow_trades WHERE ${validWhere}`, [userId, windowDays]),
    pool.query(
      `SELECT league, count(*)::int AS trades,
         (count(*) FILTER (WHERE return_pct > 0))::int AS wins,
         ((count(*) FILTER (WHERE return_pct > 0))::float / count(*)::float) AS win_rate,
         avg(return_pct)::float AS avg_return_pct,
         COALESCE(sum(notional_usd * return_pct / 100), 0)::float AS est_net_pnl_usd
       FROM kalshi_sports_shadow_trades WHERE ${validWhere} GROUP BY league ORDER BY trades DESC`,
      [userId, windowDays]),
    pool.query(
      `SELECT t.id, t.league, t.team, t.opponent, t.ticker, t.entry_price_cents,
         t.book_prob_pct, t.divergence_cents, t.bookmaker, t.odds_source, t.contracts, t.notional_usd, t.opened_at, t.commence_time
       FROM kalshi_sports_shadow_trades t
       WHERE t.user_id=$1 AND t.status='open' ORDER BY t.opened_at DESC LIMIT 30`, [userId]),
    pool.query(
      `SELECT t.id, t.league, t.team, t.opponent, t.ticker, t.entry_price_cents,
         t.result, t.return_pct, t.r_multiple, t.exit_reason, t.closed_at, t.book_prob_pct, t.divergence_cents
       FROM kalshi_sports_shadow_trades t
       WHERE t.user_id=$1 AND t.status='closed' AND t.exclude_from_stats IS NOT TRUE AND t.return_pct IS NOT NULL
         AND t.closed_at >= now() - ($2::int * interval '1 day')
       ORDER BY t.closed_at DESC LIMIT 10`, [userId, windowDays]),
    pool.query(
      `SELECT c.league, c.odds_source, c.bookmaker, c.divergence_cents, c.book_prob_pct, c.net_pct
       FROM kalshi_sports_shadow_context c JOIN kalshi_sports_shadow_trades t ON t.id = c.trade_id
       WHERE c.user_id=$1 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL AND t.exclude_from_stats IS NOT TRUE
         AND c.closed_at >= now() - interval '60 days'`, [userId]),
    countKalshiPriceSnapshots(LANE, userId),
    pool.query(`SELECT count(*)::int AS n FROM kalshi_sports_shadow_observations WHERE user_id=$1`, [userId]).catch(() => ({ rows: [{ n: 0 }] })),
    // Every valid close in the window, oldest first, for the $100-account
    // replay (the recent-closes list above is capped at 10 — never reuse
    // it). Same validWhere, so excluded rows stay excluded. Only read
    // when the account view is on (KALSHI_ACCOUNT_SIM).
    simOn
      ? pool.query(
        `SELECT return_pct::float AS return_pct
         FROM kalshi_sports_shadow_trades
         WHERE ${validWhere}
         ORDER BY closed_at ASC, id ASC`, [userId, windowDays])
      : Promise.resolve(null),
  ]);
  const s = summaryRes.rows[0] || {};
  // $100-account replay over the window's closes in close order — the
  // stock-perp lane's shared helper and semantics: each close moves the
  // WHOLE running balance by that trade's net return_pct. With no closes
  // (the lane is dormant until an odds key is added) the replay returns
  // the untouched $100 start, which the panel renders as the start state.
  const accountSim = simOn
    ? accountReplay((((closesRes as any)?.rows || []) as any[]).map((r: any) => Number(r.return_pct)))
    : undefined;
  return {
    enabled: sportsOddsShadowEnabled(),
    strategy: STRATEGY,
    minDivergencePts: MIN_DIVERGENCE_PTS(),
    activation: {
      oddspapiKeyConfigured: !!process.env.ODDSPAPI_KEY,
      oddsApiKeyConfigured: !!process.env.ODDS_API_KEY,
      activeSource: configuredOddsSource(),
    },
    ...(accountSim ? { accountSim } : {}),
    summary: {
      openCount: Number(s.open_count ?? 0), closedCount: Number(s.closed_count ?? 0),
      wins: Number(s.wins ?? 0), winRate: s.win_rate == null ? null : Number(s.win_rate),
      avgReturnPct: s.avg_return_pct == null ? null : Number(s.avg_return_pct),
      avgR: s.avg_r == null ? null : Number(s.avg_r),
      estNetPnlUsd: Number(s.est_net_pnl_usd ?? 0),
      snapshots, observations: Number(obsRes.rows[0]?.n ?? 0),
      lastOpenedAt: s.last_opened_at ?? null, lastClosedAt: s.last_closed_at ?? null,
    },
    byLeague: byLeagueRes.rows.map((r: any) => ({
      league: r.league, trades: Number(r.trades), wins: Number(r.wins),
      win_rate: r.win_rate == null ? null : Number(r.win_rate),
      avg_return_pct: r.avg_return_pct == null ? null : Number(r.avg_return_pct),
      est_net_pnl_usd: Number(r.est_net_pnl_usd ?? 0),
    })),
    openPositions: openRes.rows,
    recentCloses: recentRes.rows,
    bucketStats: aggregateSportsStats(statsRows.rows),
    lastCycle: _lastCycle,
  };
}

// ── boot wiring (mirrors the other Kalshi shadow lanes) ─────────────────────
let _ownerId: number | null = null;
async function resolveOwnerUserId(): Promise<number | null> {
  if (_ownerId) return _ownerId;
  const env = Number(process.env.KALSHI_SPORTS_SHADOW_USER_ID);
  if (Number.isFinite(env) && env > 0) { _ownerId = env; return _ownerId; }
  try {
    const { rows } = await pool.query(`SELECT id FROM users WHERE is_admin = true ORDER BY id LIMIT 1`);
    _ownerId = rows[0]?.id ?? 1;
  } catch { _ownerId = 1; }
  return _ownerId;
}

let _started = false;
let _idleLogged = false;
/** Start the lane tick. Idempotent; never throws. With no odds key the lane
 *  logs ONE idle line and stays dormant-but-visible (report still serves). */
export function startKalshiSportsShadow(): void {
  if (_started) return;
  _started = true;
  if (!sportsOddsShadowEnabled()) { console.log('[kalshi-sports-shadow] disabled (KALSHI_SPORTS_ODDS=off).'); return; }
  if (!configuredOddsSource() && !_idleLogged) {
    _idleLogged = true;
    console.log('[kalshi-sports-shadow] idle — no odds API key configured (ODDSPAPI_KEY / ODDS_API_KEY). Lane is built and visible; add a free key to activate.');
  }
  const tick = async () => {
    try {
      const uid = await resolveOwnerUserId();
      if (uid) await runKalshiSportsShadowCycle(uid);
      loopTick('kalshi-sports-shadow');
    } catch (e: any) { console.error('[kalshi-sports-shadow] tick failed (non-fatal):', e?.message ?? e); }
  };
  setTimeout(tick, 5 * 60_000).unref?.();
  setInterval(tick, EVERY_MS()).unref?.();
  console.log('[kalshi-sports-shadow] started — SHADOW lane on de-vigged book odds vs public Kalshi prices (no Kalshi credentials, no orders).');
}
