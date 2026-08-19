/**
 * VEDD Kalshi Weather Engine — KXHIGH daily high-temperature markets.
 *
 * This is the highest-defensibility edge in the Kalshi ecosystem. Documented
 * research (Oalkhadra/prediction-market-trading over 1,911 city-date obs; the
 * suislanchez weather-bot template) shows Kalshi temperature markets
 * systematically OVERPRICE uncertainty (~1.27×) — the crowd pays too much for
 * tail buckets and too little for the favorite. Unlike the 5-min crypto markets
 * (near-efficient, where the account is net-negative), this is a real,
 * repeatable structural mispricing.
 *
 * Method (per city, per day):
 *   1. Kalshi KXHIGH<city> event = mutually-exclusive 2°-wide temperature
 *      buckets + "X or above"/"X or below" tails, each a YES contract priced 1-99¢.
 *   2. Pull the 31-member GFS ensemble (GEFS) daily-max distribution for the
 *      city from Open-Meteo (free, no key). P(bucket) = fraction of ensemble
 *      members whose forecast daily high lands in that bucket. This is a
 *      genuinely calibrated probability, not a point forecast.
 *   3. edge = ourModelProb − marketAsk. Trade the bucket with the biggest
 *      positive edge (the market's mispricing). The ensemble naturally corrects
 *      the crowd's tail-overpricing: our lower P on longshots → no buy; our
 *      higher P on the favorite → buy.
 *
 * Reuses getKalshiCryptoEvent() (series-generic bracket builder) for the Kalshi
 * side and feeds picks into the existing engine's fire path + self-learning brain.
 */

import { getKalshiCryptoEvent, type KalshiBTCBracket } from './kalshi';

// Kalshi KXHIGH series confirmed live (2026-08-19): one open event per city per
// day, same floor/cap/strike_type bracket mechanics as the crypto series.
// Coords target each city's official climate station as closely as Open-Meteo's
// grid allows; exact station siting matters less than the ensemble spread for a
// probability edge, and the brain learns any residual per-city bias over time.
export interface WeatherCity {
  code: string;      // internal tag used as the brain "coin" key (e.g. 'WX-NY')
  series: string;    // Kalshi series ticker
  name: string;
  lat: number;
  lon: number;
  tz: string;        // IANA timezone — the local day the "high" refers to
}

export const WEATHER_CITIES: Record<string, WeatherCity> = {
  NY:   { code: 'WX-NY',   series: 'KXHIGHNY',   name: 'New York City', lat: 40.78, lon: -73.97, tz: 'America/New_York' },
  CHI:  { code: 'WX-CHI',  series: 'KXHIGHCHI',  name: 'Chicago',       lat: 41.79, lon: -87.75, tz: 'America/Chicago' },
  MIA:  { code: 'WX-MIA',  series: 'KXHIGHMIA',  name: 'Miami',         lat: 25.79, lon: -80.29, tz: 'America/New_York' },
  AUS:  { code: 'WX-AUS',  series: 'KXHIGHAUS',  name: 'Austin',        lat: 30.18, lon: -97.68, tz: 'America/Chicago' },
  LAX:  { code: 'WX-LAX',  series: 'KXHIGHLAX',  name: 'Los Angeles',   lat: 33.94, lon: -118.40, tz: 'America/Los_Angeles' },
  DEN:  { code: 'WX-DEN',  series: 'KXHIGHDEN',  name: 'Denver',        lat: 39.85, lon: -104.66, tz: 'America/Denver' },
  PHIL: { code: 'WX-PHIL', series: 'KXHIGHPHIL', name: 'Philadelphia',  lat: 39.87, lon: -75.23, tz: 'America/New_York' },
};

export function isWeatherCity(code: string): boolean {
  const up = code.toUpperCase();
  return !!WEATHER_CITIES[up] || Object.values(WEATHER_CITIES).some(c => c.code === up);
}

// ── Ensemble fetch + cache ────────────────────────────────────────────────────

const ENSEMBLE_TTL_MS = 30 * 60 * 1000; // GEFS updates ~4×/day; 30-min cache is plenty
const _ensembleCache = new Map<string, { members: number[]; targetDate: string; ts: number }>();

/** Format a UTC-ms instant as YYYY-MM-DD in a given IANA timezone. */
function localDateInTz(ms: number, tz: string): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/**
 * Fetch the GFS ensemble daily-max distribution (°F) for `targetLocalDate` in the
 * city. Returns one forecast daily-high per ensemble member (~31 values).
 */
export async function fetchEnsembleDailyMax(city: WeatherCity, targetLocalDate: string): Promise<number[]> {
  const cacheKey = `${city.code}:${targetLocalDate}`;
  const hit = _ensembleCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < ENSEMBLE_TTL_MS) return hit.members;

  const url = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${city.lat}&longitude=${city.lon}`
    + `&hourly=temperature_2m&models=gfs025&forecast_days=4&temperature_unit=fahrenheit&timezone=${encodeURIComponent(city.tz)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'VEDD-Trading-AI/1.0' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`Open-Meteo ensemble ${res.status}`);
  const data = await res.json() as { hourly?: Record<string, any> };
  const hourly = data.hourly;
  if (!hourly?.time?.length) throw new Error('Open-Meteo ensemble: no hourly data');

  const times: string[] = hourly.time;
  // Timezone was requested, so times are already local ("2026-08-19T13:00").
  const dayIdx: number[] = [];
  for (let i = 0; i < times.length; i++) if (times[i].slice(0, 10) === targetLocalDate) dayIdx.push(i);
  if (!dayIdx.length) throw new Error(`Open-Meteo ensemble: target day ${targetLocalDate} not in forecast window`);

  // Each member is a series "temperature_2m" (control) + "temperature_2m_memberNN".
  const memberKeys = Object.keys(hourly).filter(k => k === 'temperature_2m' || k.startsWith('temperature_2m_member'));
  const members: number[] = [];
  for (const key of memberKeys) {
    const arr = hourly[key] as (number | null)[];
    let mx = -Infinity;
    for (const i of dayIdx) { const v = arr[i]; if (typeof v === 'number' && v > mx) mx = v; }
    if (mx > -Infinity) members.push(mx);
  }
  if (!members.length) throw new Error('Open-Meteo ensemble: no member maxima computed');

  _ensembleCache.set(cacheKey, { members, targetDate: targetLocalDate, ts: Date.now() });
  return members;
}

// ── Bucket probability from the ensemble ──────────────────────────────────────

/**
 * P(this bracket resolves YES) = fraction of ensemble members whose ROUNDED
 * daily high falls in the bracket. Kalshi settles on the official integer high,
 * so we round each member's forecast max to the nearest degree before classifying.
 *   between  floor..cap  → YES if floor ≤ round(max) ≤ cap
 *   greater  (floor F)   → YES if round(max) > F      ("F+1 or above")
 *   less     (cap C)     → YES if round(max) < C      ("C-1 or below")
 */
export function bucketProbFromMembers(members: number[], b: KalshiBTCBracket): number {
  if (!members.length) return 0;
  let yes = 0;
  for (const m of members) {
    const r = Math.round(m);
    let win = false;
    if (b.strikeType === 'between') {
      win = b.floorStrike != null && b.capStrike != null && r >= b.floorStrike && r <= b.capStrike;
    } else if (b.strikeType === 'greater' || b.strikeType === 'greater_or_equal') {
      win = b.floorStrike != null && (b.strikeType === 'greater' ? r > b.floorStrike : r >= b.floorStrike);
    } else if (b.strikeType === 'less' || b.strikeType === 'less_or_equal') {
      win = b.capStrike != null && (b.strikeType === 'less' ? r < b.capStrike : r <= b.capStrike);
    }
    if (win) yes++;
  }
  return yes / members.length;
}

/** Ensemble spread as a rough confidence signal — a tight ensemble (all members
 *  agree) is a higher-confidence forecast than a wide one. Returns 0-100. */
function ensembleConfidence(members: number[]): number {
  if (members.length < 3) return 50;
  const mean = members.reduce((a, b) => a + b, 0) / members.length;
  const sd = Math.sqrt(members.reduce((s, x) => s + (x - mean) ** 2, 0) / members.length);
  // SD of ~1°F → very confident (~90); ~5°F → low (~50)
  return Math.round(Math.max(50, Math.min(95, 95 - (sd - 1) * 9)));
}

// ── Value-pick scanner ────────────────────────────────────────────────────────

export interface WeatherValuePick {
  city: string;            // display name
  cityCode: string;        // WX-XX brain key
  ticker: string;
  subtitle: string;
  strikeType: string;
  marketAskCents: number;
  modelProbPct: number;    // ensemble probability
  edgePct: number;         // modelProb − ask
  valueScore: number;
  confidence: number;      // ensemble-spread confidence
  targetDate: string;
  rationale: string;
}

export interface WeatherScanResult {
  picks: WeatherValuePick[];
  perCityReasons: string[];
  scannedAt: string;
}

/**
 * Scan the given cities' KXHIGH events for the biggest positive-edge buckets.
 * `minEntryCents` / `minEdgeCents` are passed from the engine config.
 */
export async function scanKalshiWeatherPicks(
  cityCodes: string[],
  opts: { minEntryCents?: number; minEdgeCents?: number; spreadMaxCents?: number; limit?: number; maxBiasDegrees?: number; biasOffsets?: Record<string, number> } = {},
): Promise<WeatherScanResult> {
  const minEntry = opts.minEntryCents ?? 15;   // weather favorites are cheaper than crypto; a lower floor than crypto is fine
  const minEdge = opts.minEdgeCents ?? 8;      // research edge threshold for weather
  const spreadMax = opts.spreadMaxCents ?? 12;
  const limit = opts.limit ?? 5;
  // Bias guard: raw GFS 2m temperature carries a station-specific bias vs the
  // official ASOS/station reading Kalshi settles on (confirmed live 2026-08-19 —
  // the model ran ~3-4°F warm vs the market's favorite in NY/MIA/LAX). An
  // apparent "edge" that comes from a large model-vs-market disagreement is
  // almost always that uncalibrated bias, NOT a real mispricing. Skip a city
  // whenever the ensemble median disagrees with the market's favorite bucket by
  // more than this many degrees, until the per-city offset is learned from
  // settled outcomes (biasOffsets, applied below).
  const maxBias = opts.maxBiasDegrees ?? 3;
  const biasOffsets = opts.biasOffsets ?? {};

  const picks: WeatherValuePick[] = [];
  const perCityReasons: string[] = [];

  for (const raw of cityCodes) {
    const key = raw.toUpperCase().replace(/^WX-?/, '');
    const city = WEATHER_CITIES[key];
    if (!city) { perCityReasons.push(`${raw}: unknown weather city`); continue; }

    try {
      const event = await getKalshiCryptoEvent(city.series);
      if (!event.brackets.length) { perCityReasons.push(`${city.name}: no open ${city.series} brackets`); continue; }

      // Kalshi strike_date is the day-after 05:00Z close; the "high" is for the
      // local calendar day it lands in — subtract 6h so we land safely inside it.
      const strikeMs = new Date(event.closeTime).getTime();
      const targetDate = localDateInTz(strikeMs - 6 * 3600_000, city.tz);

      // Apply the learned per-city bias correction to every member (0 until the
      // brain has enough settled outcomes to estimate the station offset).
      const offset = biasOffsets[city.code] ?? 0;
      const members = (await fetchEnsembleDailyMax(city, targetDate)).map(m => m + offset);
      const conf = ensembleConfidence(members);

      // ── Bias-disagreement guard ──────────────────────────────────────────
      const sorted = [...members].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      // Market favorite = highest-priced 'between' bucket (the crowd's expected high).
      const favBucket = event.brackets
        .filter(b => b.strikeType === 'between' && b.floorStrike != null && b.capStrike != null)
        .reduce<KalshiBTCBracket | null>((best, b) => (b.yesAsk > (best?.yesAsk ?? -1) ? b : best), null);
      if (favBucket) {
        const favMid = ((favBucket.floorStrike ?? 0) + (favBucket.capStrike ?? 0)) / 2;
        const disagree = Math.abs(median - favMid);
        if (disagree > maxBias) {
          perCityReasons.push(`${city.name}: SKIP — model median ${median.toFixed(1)}°F disagrees with market favorite "${favBucket.subtitle}" by ${disagree.toFixed(1)}°F (> ${maxBias}° bias guard; needs calibration${offset ? `, offset ${offset > 0 ? '+' : ''}${offset}°` : ''})`);
          continue;
        }
      }

      let cityBest: WeatherValuePick | null = null;
      for (const b of event.brackets) {
        if (!b.hasLiquidity) continue;
        const ask = b.yesAsk > 0 ? b.yesAsk : b.yesProbability;
        if (ask < minEntry || ask >= 97) continue;
        const spread = b.yesBid > 0 ? ask - b.yesBid : spreadMax + 1;
        if (spread > spreadMax) continue;

        const modelProbPct = Math.round(bucketProbFromMembers(members, b) * 100);
        const edgePct = modelProbPct - ask;
        if (edgePct < minEdge) continue;

        // Value score: edge, tilted toward more-likely (favorite) outcomes and
        // scaled by ensemble confidence. Same spirit as the crypto scanner.
        const probW = 0.6 + (modelProbPct / 100) * 0.4;
        const confW = 0.5 + (conf / 100) * 0.5;
        const valueScore = Math.round(edgePct * probW * confW * 10) / 10;

        const pick: WeatherValuePick = {
          city: city.name, cityCode: city.code, ticker: b.ticker, subtitle: b.subtitle,
          strikeType: b.strikeType, marketAskCents: ask, modelProbPct, edgePct, valueScore,
          confidence: conf, targetDate,
          rationale: `${city.name} ${targetDate}: GEFS ensemble ${modelProbPct}% vs market ${ask}¢ → +${edgePct}¢ edge on "${b.subtitle}" (${members.length} members, spread-conf ${conf}%).`,
        };
        picks.push(pick);
        if (!cityBest || pick.valueScore > cityBest.valueScore) cityBest = pick;
      }

      perCityReasons.push(cityBest
        ? `${city.name}: best +${cityBest.edgePct}¢ edge on "${cityBest.subtitle}" (score ${cityBest.valueScore})`
        : `${city.name}: no positive-edge bucket (ensemble agrees with the market)`);
    } catch (err: any) {
      perCityReasons.push(`${city.name}: ${err.message}`);
    }
  }

  picks.sort((a, b) => b.valueScore - a.valueScore);
  return { picks: picks.slice(0, limit), perCityReasons, scannedAt: new Date().toISOString() };
}
