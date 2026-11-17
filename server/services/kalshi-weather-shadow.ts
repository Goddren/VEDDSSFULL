// ─────────────────────────────────────────────────────────────────────────────
// Kalshi WEATHER ensemble SHADOW lane (2026-11-15).
// Recon: research_notes/kalshi-prediction-models-recon-20261115.md §2A.
//
// What already existed: kalshi-weather.ts — a LIVE strategy inside the main
// Kalshi engine. Its scanner (scanKalshiWeatherPicks) pulls the GFS ensemble
// from Open-Meteo, computes per-bucket probabilities by member counting, and
// fires REAL orders through the engine's shared fire path. This lane does
// NOT duplicate that model and does NOT touch the live path. It EXTENDS the
// existing module into a shadow lane:
//   • reuses WEATHER_CITIES, fetchEnsembleDailyMax (GFS) and
//     bucketProbFromMembers from kalshi-weather.ts — export-don't-copy;
//   • ADDS the ECMWF IFS ensemble as a second member pool (the recon's
//     GFS+ECMWF pattern) and an NWS point-forecast cross-check for the
//     settlement station (Kalshi settles KXHIGH on NWS station readings);
//   • evaluates EVERY bracket of every configured city's open event, records
//     Kalshi price snapshots for all of them (kalshi-price-snapshots.ts),
//     and opens VIRTUAL positions when the model-vs-market edge clears the
//     same threshold the live engine uses for weather (weatherMinEdgeCents,
//     default 8¢);
//   • resolves positions only from Kalshi's posted market result.
//
// SHADOW ONLY, by construction: this module imports NO authenticated Kalshi
// client, NO credential store, NO order path — there is nothing here that
// could place an order. Positions live in kalshi_weather_shadow_trades /
// _context and feed the shared shadow_ledger as source
// 'kalshi_weather_shadow'. They touch no real balance, no live engine
// state, no daily counts, no brain.
//
// Fail-open everywhere: an Open-Meteo / NWS / Kalshi outage means "no new
// shadow trades this cycle", never a crash. Kill switch:
// KALSHI_WEATHER_ENSEMBLE=off. Runs for the owner account only
// (KALSHI_WEATHER_SHADOW_USER_ID, else first admin), mirroring the
// stock-perp shadow lane.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { loopTick } from '../crash-heartbeat';
import { ensureKalshiWeatherShadowTables } from './ensure-kalshi-weather-shadow-tables';
import {
  WEATHER_CITIES, fetchEnsembleDailyMax, bucketProbFromMembers, type WeatherCity,
} from './kalshi-weather';
import { getKalshiCryptoEvent, getKalshiMarketStatus, type KalshiBTCBracket } from './kalshi';
import {
  recordKalshiPriceSnapshots, countKalshiPriceSnapshots, pruneKalshiPriceSnapshots,
  type KalshiPriceSnapshotInput,
} from './kalshi-price-snapshots';
import { accountReplay, accountSimEnabled, type KalshiAccountSimResult } from './kalshi-stock-shadow';

export const LANE = 'kalshi_weather_shadow';
export const STRATEGY = 'weather_ensemble';

export const weatherEnsembleShadowEnabled = () => process.env.KALSHI_WEATHER_ENSEMBLE !== 'off';
const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };
// The live engine's weather edge threshold (kalshi-engine config
// weatherMinEdgeCents) defaults to 8¢ — the shadow lane uses the same bar.
export const MIN_EDGE_CENTS = () => num('KALSHI_WEATHER_SHADOW_MIN_EDGE_CENTS', 8);
const MIN_ENTRY_CENTS = () => Math.floor(num('KALSHI_WEATHER_SHADOW_MIN_ENTRY_CENTS', 15));
const MAX_ENTRY_CENTS = () => Math.floor(num('KALSHI_WEATHER_SHADOW_MAX_ENTRY_CENTS', 96));
const SPREAD_MAX_CENTS = () => Math.floor(num('KALSHI_WEATHER_SHADOW_SPREAD_MAX_CENTS', 12));
const MAX_BIAS_DEGREES = () => num('KALSHI_WEATHER_SHADOW_MAX_BIAS_DEGREES', 3);
const MAX_OPEN = () => Math.floor(num('KALSHI_WEATHER_SHADOW_MAX_OPEN', 30));
const MAX_PER_EVENT = () => Math.floor(num('KALSHI_WEATHER_SHADOW_MAX_PER_EVENT', 3));
const NOTIONAL_USD = () => num('KALSHI_WEATHER_SHADOW_NOTIONAL_USD', 100);
const EVERY_MS = () => num('KALSHI_WEATHER_SHADOW_EVERY_MIN', 30) * 60_000;
export const ALL_CITY_KEYS = Object.keys(WEATHER_CITIES);

// ── pure decision helpers (check-pinned) ────────────────────────────────────
/** Kalshi's general taker fee ≈ 0.07 · C · P · (1−P) dollars. As a % of the
 *  stake (C·P dollars) that is 7·(1−P)%. Placeholder cost model, stamped on
 *  every row as cost_model='placeholder' until graded against real fills. */
export function weatherFeePct(entryPriceFrac: number): number {
  if (!Number.isFinite(entryPriceFrac) || entryPriceFrac <= 0 || entryPriceFrac >= 1) return 0;
  return 7 * (1 - entryPriceFrac);
}

/** Net return % of stake for a binary YES bought at entryCents once Kalshi
 *  posts the result: YES → +(100−entry)/entry·100, NO → −100; the entry fee
 *  estimate comes off either way. r_multiple = this / 100 (stake = 1R). */
export function weatherSettlementReturnPct(entryCents: number, resultYes: boolean, feePct: number): number {
  const gross = resultYes ? ((100 - entryCents) / entryCents) * 100 : -100;
  return gross - feePct;
}

/** The lane's entry bar: edge at/over threshold, ask inside the tradeable
 *  band, spread no wider than the live weather scanner allows. */
export function weatherEntryQualifies(args: {
  edgeCents: number; askCents: number; spreadCents: number;
  minEdgeCents: number; minEntryCents: number; maxEntryCents: number; spreadMaxCents: number;
}): boolean {
  return args.edgeCents >= args.minEdgeCents
    && args.askCents >= args.minEntryCents && args.askCents <= args.maxEntryCents
    && args.spreadCents <= args.spreadMaxCents;
}

/** Extract one daily-max value per ensemble member from an Open-Meteo
 *  ensemble payload (hourly temperature_2m + temperature_2m_memberNN series,
 *  times already local to the requested timezone). Pure — check-pinned. */
export function extractMemberDailyMaxima(hourly: Record<string, any> | undefined, targetLocalDate: string): number[] {
  if (!hourly?.time?.length) return [];
  const times: string[] = hourly.time;
  const dayIdx: number[] = [];
  for (let i = 0; i < times.length; i++) if (String(times[i]).slice(0, 10) === targetLocalDate) dayIdx.push(i);
  if (!dayIdx.length) return [];
  const memberKeys = Object.keys(hourly).filter(k => k === 'temperature_2m' || k.startsWith('temperature_2m_member'));
  const members: number[] = [];
  for (const key of memberKeys) {
    const arr = hourly[key] as (number | null)[];
    if (!Array.isArray(arr)) continue;
    let mx = -Infinity;
    for (const i of dayIdx) { const v = arr[i]; if (typeof v === 'number' && v > mx) mx = v; }
    if (mx > -Infinity) members.push(mx);
  }
  return members;
}

/** The NWS daytime forecast high (°F) for a local date from an
 *  api.weather.gov gridpoint forecast payload. Pure — check-pinned. */
export function parseNwsForecastHigh(periods: any[] | undefined, targetLocalDate: string): number | null {
  if (!Array.isArray(periods)) return null;
  for (const p of periods) {
    if (!p?.isDaytime) continue;
    if (String(p.startTime ?? '').slice(0, 10) !== targetLocalDate) continue;
    const t = Number(p.temperature);
    if (!Number.isFinite(t)) return null;
    // NWS US gridpoints report °F; convert defensively if a payload says °C.
    return p.temperatureUnit === 'C' ? (t * 9) / 5 + 32 : t;
  }
  return null;
}

/** Bias guard (same discipline as the live weather scanner): if the ensemble
 *  median disagrees with the market favorite bucket's midpoint by more than
 *  maxBiasDegrees, the "edge" is almost certainly station bias, not
 *  mispricing — the city sits out entries this cycle. */
export function biasGuardBlocks(medianF: number, brackets: KalshiBTCBracket[], maxBiasDegrees: number): { blocked: boolean; favoriteMid: number | null } {
  const fav = brackets
    .filter(b => b.strikeType === 'between' && b.floorStrike != null && b.capStrike != null)
    .reduce<KalshiBTCBracket | null>((best, b) => (b.yesAsk > (best?.yesAsk ?? -1) ? b : best), null);
  if (!fav) return { blocked: false, favoriteMid: null };
  const mid = ((fav.floorStrike ?? 0) + (fav.capStrike ?? 0)) / 2;
  return { blocked: Math.abs(medianF - mid) > maxBiasDegrees, favoriteMid: mid };
}

// ── external data (all public, keyless, fail-soft) ──────────────────────────
export type JsonFetcher = (url: string) => Promise<any>;
const defaultFetcher: JsonFetcher = async (url: string) => {
  const res = await fetch(url, { headers: { 'User-Agent': 'VEDD-Trading-AI/1.0' }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.split('?')[0]}`);
  return res.json();
};

const _ecmwfCache = new Map<string, { members: number[]; ts: number }>();
/** ECMWF IFS ensemble daily-max members for the city's target date. Returns
 *  [] on any failure — the lane proceeds on the GFS pool alone. */
export async function fetchEcmwfDailyMax(city: WeatherCity, targetLocalDate: string, fetcher: JsonFetcher = defaultFetcher): Promise<number[]> {
  const cacheKey = `${city.code}:${targetLocalDate}`;
  const hit = _ecmwfCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < 30 * 60_000) return hit.members;
  const url = `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${city.lat}&longitude=${city.lon}`
    + `&hourly=temperature_2m&models=ecmwf_ifs025&forecast_days=4&temperature_unit=fahrenheit&timezone=${encodeURIComponent(city.tz)}`;
  const data = await fetcher(url);
  const members = extractMemberDailyMaxima(data?.hourly, targetLocalDate);
  if (!members.length) throw new Error('Open-Meteo ECMWF ensemble: no member maxima');
  _ecmwfCache.set(cacheKey, { members, ts: Date.now() });
  return members;
}

const _nwsCache = new Map<string, { high: number | null; ts: number }>();
/** NWS point-forecast high for the settlement station's coordinates.
 *  null on any failure — a missing cross-check never blocks the lane. */
export async function fetchNwsForecastHigh(city: WeatherCity, targetLocalDate: string, fetcher: JsonFetcher = defaultFetcher): Promise<number | null> {
  const cacheKey = `${city.code}:${targetLocalDate}`;
  const hit = _nwsCache.get(cacheKey);
  if (hit && Date.now() - hit.ts < 30 * 60_000) return hit.high;
  let high: number | null = null;
  try {
    const points = await fetcher(`https://api.weather.gov/points/${city.lat},${city.lon}`);
    const forecastUrl = points?.properties?.forecast;
    if (forecastUrl) {
      const fc = await fetcher(String(forecastUrl));
      high = parseNwsForecastHigh(fc?.properties?.periods, targetLocalDate);
    }
  } catch { high = null; }
  _nwsCache.set(cacheKey, { high, ts: Date.now() });
  return high;
}

function localDateInTz(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
function medianOf(vals: number[]): number {
  const s = [...vals].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : 0;
}

// ── cycle ───────────────────────────────────────────────────────────────────
export interface WeatherShadowCycleResult {
  opened: number; resolved: number; snapshots: number; cities: number;
  reasons: string[]; at: string;
}
let _lastCycle: WeatherShadowCycleResult | null = null;
export function lastWeatherShadowCycle(): WeatherShadowCycleResult | null { return _lastCycle; }

export async function runKalshiWeatherShadowCycle(userId: number): Promise<WeatherShadowCycleResult> {
  const result: WeatherShadowCycleResult = { opened: 0, resolved: 0, snapshots: 0, cities: 0, reasons: [], at: new Date().toISOString() };
  if (!weatherEnsembleShadowEnabled()) { result.reasons.push('disabled (KALSHI_WEATHER_ENSEMBLE=off)'); _lastCycle = result; return result; }
  await ensureKalshiWeatherShadowTables();

  result.resolved = await resolveWeatherShadowTrades(userId).catch(() => 0);
  await pruneKalshiPriceSnapshots().catch(() => -1);

  const { rows: openCountRows } = await pool.query(
    `SELECT count(*)::int AS n FROM kalshi_weather_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  let openTotal = Number(openCountRows[0]?.n ?? 0);

  for (const key of ALL_CITY_KEYS) {
    const city = WEATHER_CITIES[key];
    try {
      const event = await getKalshiCryptoEvent(city.series);
      if (!event.brackets.length) { result.reasons.push(`${city.name}: no open ${city.series} brackets`); continue; }
      result.cities++;

      const targetDate = localDateInTz(new Date(event.closeTime).getTime() - 6 * 3600_000, city.tz);

      // Member pools: GFS from the existing live module; ECMWF added here.
      // Either pool failing alone never blocks the other.
      let gfs: number[] = [];
      try { gfs = await fetchEnsembleDailyMax(city, targetDate); } catch (e: any) { result.reasons.push(`${city.name}: GFS ensemble unavailable (${e.message})`); }
      let ecmwf: number[] = [];
      try { ecmwf = await fetchEcmwfDailyMax(city, targetDate); } catch { /* GFS-only cycle */ }
      const members = [...gfs, ...ecmwf];
      const nwsHigh = await fetchNwsForecastHigh(city, targetDate).catch(() => null);

      // Snapshot EVERY bracket of the evaluated event first — the grading
      // evidence exists whether or not a trade opens (recon §5C).
      const openedTickers = new Set<string>();
      const snapRows: KalshiPriceSnapshotInput[] = event.brackets.map(b => ({
        lane: LANE, userId, marketTicker: b.ticker, eventTicker: event.eventTicker, seriesTicker: city.series,
        yesBidCents: b.yesBid, yesAskCents: b.yesAsk, lastPriceCents: b.yesProbability, volume: b.volume, kind: 'interval' as const,
      }));

      if (!members.length) {
        result.reasons.push(`${city.name}: no ensemble members from either model — snapshots only`);
        result.snapshots += await recordKalshiPriceSnapshots(snapRows);
        continue;
      }

      const median = medianOf(members);
      const mean = members.reduce((a, b) => a + b, 0) / members.length;
      const guard = biasGuardBlocks(median, event.brackets, MAX_BIAS_DEGREES());

      // Evaluate every bracket; open the best qualifying edges (cap per event).
      const candidates: Array<{ b: KalshiBTCBracket; probPct: number; edge: number; spread: number }> = [];
      for (const b of event.brackets) {
        if (!b.hasLiquidity) continue;
        const ask = b.yesAsk > 0 ? b.yesAsk : b.yesProbability;
        const spread = b.yesBid > 0 ? ask - b.yesBid : SPREAD_MAX_CENTS() + 1;
        const probPct = Math.round(bucketProbFromMembers(members, b) * 100);
        const edge = probPct - ask;
        if (!guard.blocked && weatherEntryQualifies({
          edgeCents: edge, askCents: ask, spreadCents: spread,
          minEdgeCents: MIN_EDGE_CENTS(), minEntryCents: MIN_ENTRY_CENTS(),
          maxEntryCents: MAX_ENTRY_CENTS(), spreadMaxCents: SPREAD_MAX_CENTS(),
        })) candidates.push({ b, probPct, edge, spread });
      }
      candidates.sort((a, z) => z.edge - a.edge);

      let openedHere = 0;
      if (!guard.blocked) {
        for (const c of candidates) {
          if (openedHere >= MAX_PER_EVENT() || openTotal >= MAX_OPEN()) break;
          const { rows: dup } = await pool.query(
            `SELECT id FROM kalshi_weather_shadow_trades WHERE user_id=$1 AND ticker=$2 AND status='open'`, [userId, c.b.ticker]);
          if (dup.length) continue;
          const ask = c.b.yesAsk > 0 ? c.b.yesAsk : c.b.yesProbability;
          const feePct = weatherFeePct(ask / 100);
          const notional = NOTIONAL_USD();
          const contracts = notional / (ask / 100);
          const ins = await pool.query(
            `INSERT INTO kalshi_weather_shadow_trades
               (user_id, strategy, city_code, city_name, series_ticker, event_ticker, ticker, subtitle, strike_type, target_date,
                entry_price_cents, entry_bid_cents, entry_ask_cents, model_prob_pct, edge_cents, confidence,
                contracts, notional_usd, fee_pct, cost_model)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,'placeholder')
             ON CONFLICT (user_id, ticker) WHERE status='open' DO NOTHING RETURNING id`,
            [userId, STRATEGY, city.code, city.name, city.series, event.eventTicker, c.b.ticker, c.b.subtitle, c.b.strikeType,
             targetDate, ask, c.b.yesBid || null, c.b.yesAsk || null, c.probPct, c.edge,
             null, contracts, notional, feePct]).catch(() => ({ rows: [] as any[] }));
          const tradeId = ins.rows[0]?.id;
          if (!tradeId) continue;
          openedTickers.add(c.b.ticker);
          await pool.query(
            `INSERT INTO kalshi_weather_shadow_context
               (trade_id, user_id, strategy, city_code, ticker, gfs_members, ecmwf_members, total_members,
                ensemble_median_f, ensemble_mean_f, nws_forecast_high_f, nws_agrees,
                model_prob_pct, market_ask_cents, edge_cents, spread_cents, hour_utc)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) ON CONFLICT (trade_id) DO NOTHING`,
            [tradeId, userId, STRATEGY, city.code, c.b.ticker, gfs.length, ecmwf.length, members.length,
             median, mean, nwsHigh, nwsHigh == null ? null : Math.abs(nwsHigh - median) <= 2,
             c.probPct, ask, c.edge, c.spread, new Date().getUTCHours()]).catch(() => {});
          openedHere++; openTotal++; result.opened++;
        }
      }

      // Re-stamp this cycle's opened markets as decision snapshots.
      for (const s of snapRows) if (openedTickers.has(s.marketTicker)) s.kind = 'decision';
      result.snapshots += await recordKalshiPriceSnapshots(snapRows);

      result.reasons.push(guard.blocked
        ? `${city.name}: SKIP entries — ensemble median ${median.toFixed(1)}°F vs market favorite mid ${guard.favoriteMid?.toFixed(1)}°F (> ${MAX_BIAS_DEGREES()}° bias guard); snapshots recorded`
        : `${city.name}: ${members.length} members (GFS ${gfs.length} + ECMWF ${ecmwf.length})${nwsHigh != null ? `, NWS high ${nwsHigh}°F` : ''} → ${openedHere} shadow open(s), best edge ${candidates[0] ? `+${candidates[0].edge}¢` : 'none'}`);
    } catch (err: any) {
      result.reasons.push(`${city.name}: ${err.message}`);
    }
  }

  _lastCycle = result;
  return result;
}

// ── resolver ────────────────────────────────────────────────────────────────
/** Close open shadow positions from Kalshi's posted result. A market that
 *  closed without a result 72h+ after entry is expired (excluded from
 *  stats) rather than left frozen open forever. */
export async function resolveWeatherShadowTrades(userId: number): Promise<number> {
  await ensureKalshiWeatherShadowTables();
  const { rows } = await pool.query(
    `SELECT id, ticker, event_ticker, series_ticker, entry_price_cents, fee_pct, opened_at
       FROM kalshi_weather_shadow_trades WHERE user_id=$1 AND status='open'`, [userId]);
  let closed = 0;
  for (const t of rows) {
    try {
      const st = await getKalshiMarketStatus(String(t.ticker));
      if (!st) continue;
      if (st.result === 'yes' || st.result === 'no') {
        const yes = st.result === 'yes';
        const ret = weatherSettlementReturnPct(Number(t.entry_price_cents), yes, Number(t.fee_pct) || 0);
        const gross = yes ? ((100 - Number(t.entry_price_cents)) / Number(t.entry_price_cents)) * 100 : -100;
        await pool.query(
          `UPDATE kalshi_weather_shadow_trades
              SET status='closed', result=$2, exit_price_cents=$3, exit_reason='settlement',
                  gross_return_pct=$4, return_pct=$5, r_multiple=$6, closed_at=now()
            WHERE id=$1 AND status='open'`,
          [t.id, st.result, yes ? 100 : 0, gross, ret, ret / 100]);
        await pool.query(
          `UPDATE kalshi_weather_shadow_context
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
          `UPDATE kalshi_weather_shadow_trades
              SET status='expired', exit_reason='no_result_72h', exclude_from_stats=true, closed_at=now()
            WHERE id=$1 AND status='open'`, [t.id]);
        closed++;
      }
    } catch { /* fail-soft per position */ }
  }
  return closed;
}

// ── bucket stats ────────────────────────────────────────────────────────────
export interface WeatherBucketStat { strategy: string; dim: string; bucket: string; n: number; medianNet: number; winRate: number; verdict: 'favor' | 'avoid' | 'learning' }
export function weatherBucketsOf(c: {
  city_code?: string | null; edge_cents?: number | null; model_prob_pct?: number | null;
  total_members?: number | null; nws_agrees?: boolean | null;
}): Record<string, string> {
  const b: Record<string, string> = {};
  if (c.city_code) b.city = c.city_code;
  if (c.edge_cents != null) b.edge = c.edge_cents < 12 ? '8-12c' : c.edge_cents < 20 ? '12-20c' : '20c+';
  if (c.model_prob_pct != null) b.prob = c.model_prob_pct < 40 ? '<40%' : c.model_prob_pct < 60 ? '40-60%' : c.model_prob_pct < 80 ? '60-80%' : '80%+';
  if (c.total_members != null) b.pool = c.total_members >= 60 ? 'gfs+ecmwf' : 'gfs_only';
  if (c.nws_agrees != null) b.nws = c.nws_agrees ? 'agrees' : 'differs';
  return b;
}
function quantile(s: number[], q: number) { if (!s.length) return 0; const p = (s.length - 1) * q, lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); }
export function aggregateWeatherStats(rows: any[]): WeatherBucketStat[] {
  const g = new Map<string, number[]>();
  for (const r of rows) {
    const v = Number(r.net_pct); if (!Number.isFinite(v)) continue;
    for (const [dim, bucket] of Object.entries({ ...weatherBucketsOf(r), all: 'all' })) {
      const k = `${STRATEGY}|${dim}|${bucket}`; (g.get(k) ?? g.set(k, []).get(k)!).push(v);
    }
  }
  return Array.from(g.entries()).map(([k, v]) => {
    const [strategy, dim, bucket] = k.split('|'); const s = v.slice().sort((a, b) => a - b); const med = quantile(s, 0.5);
    const verdict: WeatherBucketStat['verdict'] = s.length >= 15 ? (med > 0.5 ? 'favor' : med < -1 ? 'avoid' : 'learning') : 'learning';
    return { strategy, dim, bucket, n: s.length, medianNet: med, winRate: s.filter((x) => x > 0).length / s.length, verdict };
  });
}

// ── report (panel) ──────────────────────────────────────────────────────────
export interface KalshiWeatherShadowReport {
  enabled: boolean;
  strategy: string;
  minEdgeCents: number;
  summary: {
    openCount: number; closedCount: number; wins: number; winRate: number | null;
    avgReturnPct: number | null; avgR: number | null; estNetPnlUsd: number;
    snapshots: number; lastOpenedAt: string | null; lastClosedAt: string | null;
  };
  // $100-account illustration over the window's closes, replayed with the
  // stock-perp lane's shared accountReplay. Absent when
  // KALSHI_ACCOUNT_SIM=off (the client then hides the block).
  accountSim?: KalshiAccountSimResult;
  byCity: Array<{ city_code: string; city_name: string; trades: number; wins: number; win_rate: number | null; avg_return_pct: number | null; est_net_pnl_usd: number }>;
  openPositions: any[];
  recentCloses: any[];
  bucketStats: WeatherBucketStat[];
  lastCycle: WeatherShadowCycleResult | null;
}

export async function getKalshiWeatherShadowReport(userId: number, days = 30): Promise<KalshiWeatherShadowReport> {
  const windowDays = Number.isFinite(days) ? Math.max(1, Math.min(365, Math.floor(days))) : 30;
  await ensureKalshiWeatherShadowTables();
  const validWhere = `user_id=$1 AND status='closed' AND exclude_from_stats IS NOT TRUE
    AND return_pct IS NOT NULL AND closed_at >= now() - ($2::int * interval '1 day')`;
  const simOn = accountSimEnabled();
  const [summaryRes, byCityRes, openRes, recentRes, statsRows, snapshots, closesRes] = await Promise.all([
    pool.query(
      `SELECT (SELECT count(*)::int FROM kalshi_weather_shadow_trades WHERE user_id=$1 AND status='open') AS open_count,
         count(*)::int AS closed_count,
         (count(*) FILTER (WHERE return_pct > 0))::int AS wins,
         CASE WHEN count(*) > 0 THEN (count(*) FILTER (WHERE return_pct > 0))::float / count(*)::float END AS win_rate,
         avg(return_pct)::float AS avg_return_pct, avg(r_multiple)::float AS avg_r,
         COALESCE(sum(notional_usd * return_pct / 100), 0)::float AS est_net_pnl_usd,
         (SELECT max(opened_at) FROM kalshi_weather_shadow_trades WHERE user_id=$1) AS last_opened_at,
         max(closed_at) AS last_closed_at
       FROM kalshi_weather_shadow_trades WHERE ${validWhere}`, [userId, windowDays]),
    pool.query(
      `SELECT city_code, city_name, count(*)::int AS trades,
         (count(*) FILTER (WHERE return_pct > 0))::int AS wins,
         ((count(*) FILTER (WHERE return_pct > 0))::float / count(*)::float) AS win_rate,
         avg(return_pct)::float AS avg_return_pct,
         COALESCE(sum(notional_usd * return_pct / 100), 0)::float AS est_net_pnl_usd
       FROM kalshi_weather_shadow_trades WHERE ${validWhere} GROUP BY city_code, city_name ORDER BY trades DESC`,
      [userId, windowDays]),
    pool.query(
      `SELECT t.id, t.city_code, t.city_name, t.ticker, t.subtitle, t.target_date, t.entry_price_cents,
         t.model_prob_pct, t.edge_cents, t.contracts, t.notional_usd, t.opened_at,
         c.ensemble_median_f, c.nws_forecast_high_f, c.total_members
       FROM kalshi_weather_shadow_trades t LEFT JOIN kalshi_weather_shadow_context c ON c.trade_id = t.id
       WHERE t.user_id=$1 AND t.status='open' ORDER BY t.opened_at DESC LIMIT 30`, [userId]),
    pool.query(
      `SELECT t.id, t.city_code, t.city_name, t.ticker, t.subtitle, t.target_date, t.entry_price_cents,
         t.result, t.return_pct, t.r_multiple, t.exit_reason, t.closed_at, c.model_prob_pct, c.edge_cents
       FROM kalshi_weather_shadow_trades t LEFT JOIN kalshi_weather_shadow_context c ON c.trade_id = t.id
       WHERE t.user_id=$1 AND t.status='closed' AND t.exclude_from_stats IS NOT TRUE AND t.return_pct IS NOT NULL
         AND t.closed_at >= now() - ($2::int * interval '1 day')
       ORDER BY t.closed_at DESC LIMIT 10`, [userId, windowDays]),
    pool.query(
      `SELECT c.city_code, c.edge_cents, c.model_prob_pct, c.total_members, c.nws_agrees, c.net_pct
       FROM kalshi_weather_shadow_context c JOIN kalshi_weather_shadow_trades t ON t.id = c.trade_id
       WHERE c.user_id=$1 AND c.closed_at IS NOT NULL AND c.net_pct IS NOT NULL AND t.exclude_from_stats IS NOT TRUE
         AND c.closed_at >= now() - interval '60 days'`, [userId]),
    countKalshiPriceSnapshots(LANE, userId),
    // Every valid close in the window, oldest first, for the $100-account
    // replay (the recent-closes list above is capped at 10 — never reuse
    // it). Same validWhere, so excluded rows stay excluded. Only read
    // when the account view is on (KALSHI_ACCOUNT_SIM).
    simOn
      ? pool.query(
        `SELECT return_pct::float AS return_pct
         FROM kalshi_weather_shadow_trades
         WHERE ${validWhere}
         ORDER BY closed_at ASC, id ASC`, [userId, windowDays])
      : Promise.resolve(null),
  ]);
  const s = summaryRes.rows[0] || {};
  // $100-account replay over the window's closes in close order — the
  // stock-perp lane's shared helper and semantics: each close moves the
  // WHOLE running balance by that trade's net return_pct.
  const accountSim = simOn
    ? accountReplay((((closesRes as any)?.rows || []) as any[]).map((r: any) => Number(r.return_pct)))
    : undefined;
  return {
    enabled: weatherEnsembleShadowEnabled(),
    strategy: STRATEGY,
    minEdgeCents: MIN_EDGE_CENTS(),
    ...(accountSim ? { accountSim } : {}),
    summary: {
      openCount: Number(s.open_count ?? 0), closedCount: Number(s.closed_count ?? 0),
      wins: Number(s.wins ?? 0), winRate: s.win_rate == null ? null : Number(s.win_rate),
      avgReturnPct: s.avg_return_pct == null ? null : Number(s.avg_return_pct),
      avgR: s.avg_r == null ? null : Number(s.avg_r),
      estNetPnlUsd: Number(s.est_net_pnl_usd ?? 0),
      snapshots, lastOpenedAt: s.last_opened_at ?? null, lastClosedAt: s.last_closed_at ?? null,
    },
    byCity: byCityRes.rows.map((r: any) => ({
      city_code: r.city_code, city_name: r.city_name, trades: Number(r.trades), wins: Number(r.wins),
      win_rate: r.win_rate == null ? null : Number(r.win_rate),
      avg_return_pct: r.avg_return_pct == null ? null : Number(r.avg_return_pct),
      est_net_pnl_usd: Number(r.est_net_pnl_usd ?? 0),
    })),
    openPositions: openRes.rows,
    recentCloses: recentRes.rows,
    bucketStats: aggregateWeatherStats(statsRows.rows),
    lastCycle: _lastCycle,
  };
}

// ── boot wiring (mirrors the stock-perp shadow lane's starter shape) ────────
let _ownerId: number | null = null;
async function resolveOwnerUserId(): Promise<number | null> {
  if (_ownerId) return _ownerId;
  const env = Number(process.env.KALSHI_WEATHER_SHADOW_USER_ID);
  if (Number.isFinite(env) && env > 0) { _ownerId = env; return _ownerId; }
  try {
    const { rows } = await pool.query(`SELECT id FROM users WHERE is_admin = true ORDER BY id LIMIT 1`);
    _ownerId = rows[0]?.id ?? 1;
  } catch { _ownerId = 1; }
  return _ownerId;
}

let _started = false;
/** Start the lane tick (evaluate + resolve every 30 min by default). Idempotent; never throws. */
export function startKalshiWeatherShadow(): void {
  if (_started) return;
  _started = true;
  if (!weatherEnsembleShadowEnabled()) { console.log('[kalshi-weather-shadow] disabled (KALSHI_WEATHER_ENSEMBLE=off).'); return; }
  const tick = async () => {
    try {
      const uid = await resolveOwnerUserId();
      if (uid) await runKalshiWeatherShadowCycle(uid);
      loopTick('kalshi-weather-shadow');
    } catch (e: any) { console.error('[kalshi-weather-shadow] tick failed (non-fatal):', e?.message ?? e); }
  };
  setTimeout(tick, 4 * 60_000).unref?.();
  setInterval(tick, EVERY_MS()).unref?.();
  console.log('[kalshi-weather-shadow] started — SHADOW lane on Open-Meteo ensembles + public Kalshi data (no credentials, no orders).');
}
