// ─────────────────────────────────────────────────────────────────────────────
// FX Model 1 / Model 2 — 14-day REPLAY ("backtest") — Nov 12, 2026
//
// The models have no native replay mode: live, they decide once an hour
// off the live engine's current snapshot, and the decision itself is an
// AI call. This service re-decides the last N days (≤14) hour by hour
// with the CURRENT enriched system (PR #57 context + PR #58 lifts) on
// point-in-time reconstructions of that hour's inputs, then resolves the
// ideas on the real M15 bars that followed. It is a SIMULATION: results
// are labeled as such everywhere and are never the models' real record.
//
// Invariants (do not break):
//   • Replay data lives ONLY in fx_model_replay_runs /
//     fx_model_replay_decisions. Nothing here writes fx_model_decisions,
//     fx_day_regimes, mastery, brain outcomes, shadow lessons, or any
//     marketplace snapshot — hypotheticals never train anything.
//   • POINT-IN-TIME ONLY: every feature for hour H is computed from bars
//     with timestamps < H; resolution reads bars at/after entry only.
//   • SAME DECISION PATH: the prompt, AI call, parsing, validation and
//     vetoes are decideModelIdeas() from fx-models.ts — the live path.
//     Feature objects are assembled by buildModelFeatures() — the same
//     assembly the live cycle uses. Resolution is raceResolveOnBars().
//   • The live market-data cache is limit-blind (keyed symbol:tf:provider):
//     series fetches below snapshot the prior cache entry and restore it
//     immediately, so a 2,000-bar replay fetch can never change the
//     windows the live engine computes over.
//   • Kill switch FX_MODELS_REPLAY=off: start route 404s, runner no-ops.
//
// Known differences from live (also stored on each run's metadata):
//   • Decision instant is the top of the hour; live decides on the first
//     engine scan of the hour, seconds later, off the then-forming candle.
//   • The prompt's track-record lines come from this replay's own
//     resolved-so-far record (point-in-time), not the live record.
//   • ORB for index symbols uses Twelve Data candles; live reads the
//     user's broker feed for indices.
//   • Markov is rebuilt point-in-time from the same 49 confirmed M15
//     bars the live engine builds its matrix from (local build below,
//     parity-checked against markov-chain.buildTransitionMatrix).
//   • ctx.signals is absent — the live FX scan attaches none either.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from '../db';
import { marketDataService } from '../market-data/service';
import { marketDataCache } from '../market-data/cache';
import { computeAllAdvancedIndicators } from '../indicators';
import { classifyCandle, MARKOV_STATES, type MarkovState } from './markov-chain';
import {
  aggregateDailyBars,
  buildModelFeatures,
  computeRangeFeatures,
  decideModelIdeas,
  decisionProvenance,
  d1Summary,
  formatMasteryLines,
  masteryLevel,
  modelsEnrichOn,
  pipSize,
  propSimulate,
  raceResolveOnBars,
  sessionFor,
  type ModelBar,
  type ModelEnrichParts,
  type PropSimResult,
} from './fx-models';

export const fxModelsReplayOn = (): boolean => process.env.FX_MODELS_REPLAY !== 'off';

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// ── Tables (lazy, like the other fx-model tables) ────────────────────────
const DDL = `
CREATE TABLE IF NOT EXISTS fx_model_replay_runs (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  days integer NOT NULL,
  window_start timestamp NOT NULL,
  window_end timestamp NOT NULL,
  status text NOT NULL DEFAULT 'running',
  hours_total integer NOT NULL DEFAULT 0,
  hours_done integer NOT NULL DEFAULT 0,
  decisions_made integer NOT NULL DEFAULT 0,
  ai_calls integer NOT NULL DEFAULT 0,
  pairs jsonb,
  metadata jsonb,
  results jsonb,
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now(),
  completed_at timestamp
);
CREATE INDEX IF NOT EXISTS fx_model_replay_runs_user_idx ON fx_model_replay_runs (user_id, id DESC);
CREATE TABLE IF NOT EXISTS fx_model_replay_decisions (
  id serial PRIMARY KEY,
  run_id integer NOT NULL,
  user_id integer NOT NULL,
  symbol text NOT NULL,
  model text NOT NULL,
  day_type text,
  session text,
  direction text,
  entry_price double precision,
  stop_loss double precision,
  take_profit double precision,
  confidence integer,
  setup text,
  reasoning text,
  context jsonb,
  hour_at timestamp NOT NULL,
  was_excluded_pair boolean NOT NULL DEFAULT false,
  was_blocked_session boolean NOT NULL DEFAULT false,
  old_rules_blocked boolean NOT NULL DEFAULT false,
  result text,
  r_multiple real,
  pips real,
  exit_price double precision,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fx_model_replay_decisions_run_idx ON fx_model_replay_decisions (run_id, id);
`;

let ensured: Promise<void> | null = null;
export function ensureFxModelReplayTables(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(DDL).then(() => undefined).catch((e: any) => {
      console.error('[fx-models-replay] ensure tables failed (non-fatal):', e?.message || e);
      ensured = null;
    });
  }
  return ensured;
}

// ── Pure helpers (exercised directly by scripts/check-fx-models-replay.ts) ──

export const tsMs = (b: { timestamp: any }): number => {
  const raw = Number(b?.timestamp);
  return raw < 1e12 ? raw * 1000 : raw;
};

/** Bars strictly before asOfMs, oldest → newest, optionally the last n. */
export function barsBefore(bars: ModelBar[], asOfMs: number, lastN?: number): ModelBar[] {
  const out = (bars || []).filter((b) => tsMs(b) < asOfMs);
  return lastN && out.length > lastN ? out.slice(out.length - lastN) : out;
}

/**
 * Market-closed mirror of live-trading-engine's fxMarketClosedFor:
 * crypto prefixes never close; everything else is closed Fri 21:00 UTC →
 * Sun 21:00 UTC (all day Saturday).
 */
export function replayMarketClosed(symbol: string, ms: number): boolean {
  if (/^(BTC|ETH|SOL|LTC|XRP|DOGE|ADA|BNB)/i.test(String(symbol || ''))) return false;
  const d = new Date(ms);
  const day = d.getUTCDay(), h = d.getUTCHours();
  return day === 6 || (day === 5 && h >= 21) || (day === 0 && h < 21);
}

/**
 * The transition matrix markov-chain.buildTransitionMatrix would build
 * from these candles — same counts, same Laplace smoothing (+1 per cell),
 * computed locally so the replay never writes the live matrix cache.
 * Parity with the real builder is pinned by the check script.
 */
export function markovMatrixFromCandles(candles: Array<{ open: number; close: number }>): Record<MarkovState, Record<MarkovState, number>> | null {
  if (!candles || candles.length < 5) return null;
  const counts = {} as Record<MarkovState, Record<MarkovState, number>>;
  for (const s of MARKOV_STATES) {
    counts[s] = {} as Record<MarkovState, number>;
    for (const t of MARKOV_STATES) counts[s][t] = 0;
  }
  const states = candles.map((c) => classifyCandle(c.open, c.close));
  let total = 0;
  for (let i = 0; i < states.length - 1; i++) { counts[states[i]][states[i + 1]]++; total++; }
  if (total === 0) return null;
  const prob = {} as Record<MarkovState, Record<MarkovState, number>>;
  for (const from of MARKOV_STATES) {
    const rowTotal = Object.values(counts[from]).reduce((s, v) => s + v, 0);
    const smoothedTotal = rowTotal + MARKOV_STATES.length; // +1 per cell
    prob[from] = {} as Record<MarkovState, number>;
    for (const to of MARKOV_STATES) prob[from][to] = (counts[from][to] + 1) / smoothedTotal;
  }
  return prob;
}

/** compactMarkov's exact output shape, from an as-of matrix + last candle. */
export function compactMarkovAsOf(confirmedM15: ModelBar[]): { state: string; pTrend: number; pChop: number; pBull: number; pBear: number } | null {
  if (!confirmedM15?.length) return null;
  const matrix = markovMatrixFromCandles(confirmedM15.map((b) => ({ open: Number(b.open), close: Number(b.close) })));
  if (!matrix) return null;
  const last = confirmedM15[confirmedM15.length - 1];
  const state = classifyCandle(Number(last.open), Number(last.close));
  const row = matrix[state];
  const r3 = (x: number) => Math.round(x * 1000) / 1000;
  // getMarkovSnapshot rounds each group first; compactMarkov then sums.
  const bull = r3((row.STRONG_BULL || 0) + (row.BULL || 0));
  const bear = r3((row.STRONG_BEAR || 0) + (row.BEAR || 0));
  const neut = r3(row.NEUTRAL || 0);
  return { state, pTrend: r3(bull + bear), pChop: neut, pBull: bull, pBear: bear };
}

/** Prompt track-record lines from the replay's own resolved-so-far rows. */
export function replayMasteryLines(decisions: Array<any>): string {
  const map = new Map<string, { model: string; dayType: string; symbol: string; session: string; trades: number; wins: number; sumR: number }>();
  for (const d of decisions || []) {
    if (!d || d.result == null || d.result === 'NO_TRADE') continue;
    const key = `${d.model}|${d.day_type}|${d.symbol}|${d.session}`;
    const cur = map.get(key) || { model: d.model, dayType: d.day_type, symbol: d.symbol, session: d.session, trades: 0, wins: 0, sumR: 0 };
    cur.trades++;
    if (d.result === 'WIN') cur.wins++;
    cur.sumR += Number(d.r_multiple) || 0;
    map.set(key, cur);
  }
  const slices = Array.from(map.values()).map((s) => {
    const winRate = s.trades ? s.wins / s.trades : 0;
    const avgR = s.trades ? s.sumR / s.trades : 0;
    return { model: s.model, dayType: s.dayType, symbol: s.symbol, session: s.session, trades: s.trades, winRate, avgR, level: masteryLevel(s.trades, winRate, avgR) };
  }).sort((x, y) => y.trades - x.trades);
  return formatMasteryLines(slices);
}

export interface ReplayModelStats { trades: number; wins: number; winRate: number | null; avgR: number | null; totalR: number }
export interface ReplayResults {
  simulation: true;
  perModel: Record<'M1' | 'M2', ReplayModelStats>;
  propSim: Record<'M1' | 'M2', PropSimResult>;
  blockedComparison: { tradesTotal: number; wouldHaveBeenBlocked: number; byModel: Record<'M1' | 'M2', number> };
  openDecisions: number;
  noTradeDecisions: number;
}

/** Final results over a run's decision rows (pure; rows as stored). */
export function computeReplayResults(decisions: Array<any>): ReplayResults {
  const stats = (rows: Array<any>): ReplayModelStats => {
    const trades = rows.length;
    const wins = rows.filter((r) => r.result === 'WIN').length;
    const totalR = rows.reduce((a, r) => a + (Number(r.r_multiple) || 0), 0);
    return {
      trades, wins,
      winRate: trades ? wins / trades : null,
      avgR: trades ? totalR / trades : null,
      totalR: Math.round(totalR * 100) / 100,
    };
  };
  const resolvedTrades = (decisions || []).filter((d) => d && (d.direction === 'BUY' || d.direction === 'SELL') && (d.result === 'WIN' || d.result === 'LOSS' || d.result === 'EXPIRED'));
  const byModel = (m: string) => resolvedTrades.filter((d) => d.model === m);
  const blockedBy = (m: string) => resolvedTrades.filter((d) => d.model === m && d.old_rules_blocked).length;
  return {
    simulation: true,
    perModel: { M1: stats(byModel('M1')), M2: stats(byModel('M2')) },
    propSim: {
      M1: propSimulate(byModel('M1').map((d) => ({ ...d, created_at: d.hour_at ?? d.created_at }))),
      M2: propSimulate(byModel('M2').map((d) => ({ ...d, created_at: d.hour_at ?? d.created_at }))),
    },
    blockedComparison: {
      tradesTotal: resolvedTrades.length,
      wouldHaveBeenBlocked: resolvedTrades.filter((d) => d.old_rules_blocked).length,
      byModel: { M1: blockedBy('M1'), M2: blockedBy('M2') },
    },
    openDecisions: (decisions || []).filter((d) => d && (d.direction === 'BUY' || d.direction === 'SELL') && d.result == null).length,
    noTradeDecisions: (decisions || []).filter((d) => d && d.result === 'NO_TRADE').length,
  };
}

// ── Series loading (cache-preserving) ────────────────────────────────────
interface PairSeries { m15: ModelBar[]; m5: ModelBar[]; h1: ModelBar[]; h4: ModelBar[] }

const CACHE_PROVIDERS = ['twelvedata', 'yahoo-index'];

/**
 * One big historical fetch through the same service barsFor('fx') uses.
 * The shared cache is limit-blind, so the fetch would overwrite the live
 * engine's cache entry with a 2,000-bar series; we snapshot the prior
 * entries (both possible providers) and restore them synchronously the
 * moment the fetch resolves — same microtask turn, so no live read can
 * observe the big series (see the invariant in the header).
 */
async function fetchSeries(symbol: string, timeframe: '5m' | '15m' | '1h' | '4h', limit: number): Promise<ModelBar[]> {
  const assetType = marketDataService.detectAssetType(symbol);
  const prior = CACHE_PROVIDERS.map((p) => ({ provider: p, entry: marketDataCache.get(symbol, timeframe, p) }));
  const r = await marketDataService.fetchMarketData({ symbol, assetType, timeframe, limit });
  // Synchronous restore — must stay await-free.
  for (const { provider, entry } of prior) {
    if (entry) marketDataCache.set(symbol, timeframe, provider, entry, marketDataCache.getTTLForTimeframe(timeframe));
    else marketDataCache.invalidate(symbol, timeframe, provider);
  }
  const bars = ((r as any)?.bars || []) as ModelBar[];
  return bars
    .map((b) => ({ ...b, timestamp: tsMs(b) }))
    .filter((b) => Number.isFinite(b.timestamp) && b.timestamp > 0)
    .sort((x, y) => x.timestamp - y.timestamp);
}

async function loadSeries(symbol: string, days: number): Promise<PairSeries> {
  const [m15, m5, h1, h4] = await Promise.all([
    fetchSeries(symbol, '15m', days * 96 + 48 * 4 + 120).catch(() => [] as ModelBar[]),
    fetchSeries(symbol, '5m', days * 288 + 240).catch(() => [] as ModelBar[]),
    fetchSeries(symbol, '1h', 1500 + days * 24 + 120).catch(() => [] as ModelBar[]),
    fetchSeries(symbol, '4h', days * 6 + 160).catch(() => [] as ModelBar[]),
  ]);
  return { m15, m5, h1, h4 };
}

// ── As-of feature reconstruction ─────────────────────────────────────────
type Lte = typeof import('./live-trading-engine');
let lteMod: Lte | null = null;
async function lte(): Promise<Lte> {
  if (!lteMod) lteMod = await import('./live-trading-engine');
  return lteMod;
}

/** computeHtfBias over the as-of window: last 49 confirmed bars + a
 *  synthetic partial bar carrying the as-of price (the helper drops the
 *  last bar from its candles and uses only its close, exactly as live). */
function htfBiasAsOf(bars: ModelBar[], asOfMs: number, price: number, engine: Lte): any | null {
  const confirmed = barsBefore(bars, asOfMs, 49);
  if (confirmed.length < 14) return null;
  const partial = { timestamp: asOfMs, open: price, high: price, low: price, close: price, volume: 0 };
  try { return engine.computeHtfBias([...confirmed, partial] as any); } catch { return null; }
}

function d1AsOf(h1: ModelBar[], asOfMs: number, price: number) {
  const win = barsBefore(h1, asOfMs, 1500);
  if (win.length < 24 * 20) return null;
  try { return d1Summary(aggregateDailyBars(win), price, asOfMs); } catch { return null; }
}

/**
 * ORB state as-of hour H, via the shared computeOrbStateFromCandles.
 * Live reads it through getOrbState (null outside 9:30–15:00 ET; formed
 * ranges kept even before a breakout). The candle list is newest-first
 * with a synthetic live head standing in for the in-progress bar the
 * helper skips when scanning for breakouts — the same role the real
 * partial bar plays live.
 */
function orbAsOf(m5: ModelBar[], asOfMs: number, price: number, engine: Lte): any | null {
  const ny = engine.getNYTime(asOfMs);
  const mins = ny.hour * 60 + ny.minute;
  if (mins < 9 * 60 + 30 || mins >= 15 * 60) return null;
  const recent = barsBefore(m5, asOfMs).filter((b) => tsMs(b) >= asOfMs - 26 * HOUR_MS);
  const newestFirst = [...recent].reverse().map((b) => ({
    t: Math.floor(tsMs(b) / 1000), o: Number(b.open), h: Number(b.high), l: Number(b.low), c: Number(b.close), v: Number(b.volume) || 0,
  }));
  const head = { t: Math.floor(asOfMs / 1000), o: price, h: price, l: price, c: price, v: 0 };
  let st: any = null;
  try { st = engine.computeOrbStateFromCandles([head, ...newestFirst] as any, price, ny.dateStr); } catch { return null; }
  if (!st || st.phase === 'no_range' || !(Number(st.orbHigh) > 0)) return null;
  return { phase: st.phase, direction: st.breakoutDir ?? null, rangeHigh: st.orbHigh, rangeLow: st.orbLow, retest: !!st.retestActive };
}

/**
 * One pair's model ctx as-of hour H, rebuilt with the engine's own
 * indicator helpers over the same bar windows the live scan uses
 * (M15: last 49 confirmed bars; HTF: 49 confirmed + current price bar).
 * Returns null when the pair has no usable price at H (live skips it too).
 */
async function buildPairCtxAsOf(symbol: string, asOfMs: number, series: PairSeries, opts: { primaryH1: boolean }, engine: Lte): Promise<{ symbol: string; ctx: any } | null> {
  const confirmed = barsBefore(series.m15, asOfMs, 49);
  if (confirmed.length < 19) return null; // live scan needs a 20-bar fetch (49 confirmed here at most)
  const lastC = confirmed[confirmed.length - 1];
  const price = Number(lastC.close);
  if (!(price > 0)) return null;

  const candles = engine.convertToCandles(confirmed as any);
  const indicators: any = computeAllAdvancedIndicators(candles as any, 0, symbol, 'M15');

  // Snapshot assembly — mirrors scanMarkets in live-trading-engine.ts.
  const adxData = indicators.adx as any;
  const adxRaw = engine.adxOrNull(indicators);
  const adxStrength = adxRaw ?? 0;
  const plusDI = adxData?.plusDI ?? 0;
  const minusDI = adxData?.minusDI ?? 0;
  let trend = 'NEUTRAL';
  if (adxStrength > 20) {
    trend = plusDI > minusDI ? 'BULLISH' : 'BEARISH';
  } else if (adxStrength > 12 && Math.abs(plusDI - minusDI) > 8) {
    trend = plusDI > minusDI ? 'BULLISH' : 'BEARISH';
  }
  const volumeMetrics = engine.computeVolumeMetrics(confirmed as any);
  const snap = {
    price,
    trend,
    rsi: Math.round(indicators.stochastic?.k || 50),
    atr: Math.round((indicators.volatilityContext?.currentATR || 0) * 100000) / 100000,
    adx: adxRaw ?? undefined,
    plusDI,
    minusDI,
    volumeTrend: volumeMetrics.volumeTrend,
    relativeVolume: volumeMetrics.relativeVolume,
  };
  const a = {
    currentPrice: price,
    volumeProfile: indicators.volumeProfile,
    lastConfirmedCandle: { open: Number(lastC.open), close: Number(lastC.close) },
  };

  const h1Bias = htfBiasAsOf(series.h1, asOfMs, price, engine);
  const h4Bias = htfBiasAsOf(series.h4, asOfMs, price, engine);
  const mtf = opts.primaryH1 ? { h1: null, h4: h4Bias } : { h1: h1Bias, h4: h4Bias };

  let enrichParts: ModelEnrichParts | null = null;
  if (modelsEnrichOn()) {
    enrichParts = {
      volumeProfileRaw: indicators.volumeProfile,
      markov: compactMarkovAsOf(confirmed),
      orb: orbAsOf(series.m5, asOfMs, price, engine),
      d1: d1AsOf(series.h1, asOfMs, price),
    };
  }
  const session = sessionFor(new Date(asOfMs));
  const { features, cls } = buildModelFeatures({ a, snap, h1: mtf.h1, h4: mtf.h4, session, enrichParts });
  return { symbol, ctx: { ...features, dayType: cls.dayType, autoModel: cls.autoModel, trendScore: cls.score } };
}

// ── Runner ───────────────────────────────────────────────────────────────
const activeRuns = new Set<number>();

const KNOWN_DIFFERENCES = [
  'Simulation: fresh AI decisions on reconstructed historical context — not the models’ real shadow record.',
  'Decision instant is the top of each hour; live decides on the first engine scan of the hour.',
  'Prompt track-record lines come from this replay’s own resolved-so-far record, not the live record.',
  'ORB for index symbols uses Twelve Data candles; live reads the user’s broker feed for indices.',
  'Markov is rebuilt point-in-time from the same 49 confirmed M15 bars the live engine uses.',
];

export interface PublicReplayRun {
  id: number; days: number;
  windowStart: string; windowEnd: string;
  status: string;
  progress: { hoursDone: number; hoursTotal: number; decisionsMade: number; aiCalls: number };
  pairs: string[];
  knownDifferences: string[];
  results: ReplayResults | null;
  error: string | null;
  createdAt: string; completedAt: string | null;
  simulation: true;
}

function toPublicRun(row: any): PublicReplayRun {
  const meta = row.metadata || {};
  return {
    id: Number(row.id),
    days: Number(row.days),
    windowStart: new Date(row.window_start).toISOString(),
    windowEnd: new Date(row.window_end).toISOString(),
    status: String(row.status),
    progress: {
      hoursDone: Number(row.hours_done) || 0,
      hoursTotal: Number(row.hours_total) || 0,
      decisionsMade: Number(row.decisions_made) || 0,
      aiCalls: Number(row.ai_calls) || 0,
    },
    pairs: Array.isArray(row.pairs) ? row.pairs : [],
    knownDifferences: Array.isArray(meta.knownDifferences) ? meta.knownDifferences : KNOWN_DIFFERENCES,
    results: row.results || null,
    error: row.error || null,
    createdAt: new Date(row.created_at).toISOString(),
    completedAt: row.completed_at ? new Date(row.completed_at).toISOString() : null,
    simulation: true,
  };
}

async function getRunRow(runId: number): Promise<any | null> {
  const { rows } = await pool.query(`SELECT * FROM fx_model_replay_runs WHERE id=$1`, [runId]);
  return rows[0] || null;
}

async function loadRunDecisions(runId: number): Promise<any[]> {
  const { rows } = await pool.query(`SELECT * FROM fx_model_replay_decisions WHERE run_id=$1 ORDER BY id`, [runId]);
  return rows;
}

/** Resolve one stored replay decision in place (DB + memory) when its
 *  outcome is knowable from bars up to nowMs. */
async function resolveReplayDecision(dec: any, m15: ModelBar[], nowMs: number): Promise<boolean> {
  const out = raceResolveOnBars(
    { direction: dec.direction, entry_price: dec.entry_price, stop_loss: dec.stop_loss, take_profit: dec.take_profit, created_at: dec.hour_at },
    barsBefore(m15, nowMs + 1),
    nowMs,
  );
  if (!out) return false;
  const entry = Number(dec.entry_price);
  const risk = Math.abs(entry - Number(dec.stop_loss));
  const move = dec.direction === 'BUY' ? out.exitPrice - entry : entry - out.exitPrice;
  dec.result = out.result;
  dec.exit_price = out.exitPrice;
  dec.r_multiple = risk > 0 ? move / risk : 0;
  dec.pips = risk > 0 ? move / pipSize(dec.symbol) : 0;
  dec.resolved_at = new Date(out.resolvedAtMs).toISOString();
  await pool.query(
    `UPDATE fx_model_replay_decisions SET result=$2, exit_price=$3, r_multiple=$4, pips=$5, resolved_at=$6 WHERE id=$1 AND result IS NULL`,
    [dec.id, out.result, out.exitPrice, dec.r_multiple, dec.pips, new Date(out.resolvedAtMs)],
  ).catch(() => {});
  return true;
}

async function executeRun(runId: number): Promise<void> {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);
  try {
    if (!fxModelsReplayOn()) {
      await pool.query(`UPDATE fx_model_replay_runs SET status='failed', error='Replay is off (FX_MODELS_REPLAY=off)', updated_at=now() WHERE id=$1`, [runId]).catch(() => {});
      return;
    }
    const run = await getRunRow(runId);
    if (!run || run.status !== 'running') return;
    const userId = Number(run.user_id);
    const days = Math.max(1, Math.min(14, Number(run.days) || 14));
    const startMs = new Date(run.window_start).getTime();
    const endMs = new Date(run.window_end).getTime();
    const hoursTotal = Math.max(1, Math.round((endMs - startMs) / HOUR_MS));

    const engine = await lte();
    const config: any = engine.getEffectiveEngineConfig(userId);
    const pairs: string[] = ((config?.pairs || []) as any[]).slice(0, 8).map((s) => String(s)).filter(Boolean);
    const primaryH1 = (config?.primaryTimeframe || 'M15') === 'H1';
    let everyH = 1;
    try {
      const lvl = await (await import('./ai-level')).getAiLevel(userId);
      everyH = Math.max(1, Number(lvl?.fxModelsEveryH) || 1);
    } catch { /* default hourly */ }

    await pool.query(
      `UPDATE fx_model_replay_runs SET pairs=$2::jsonb, metadata=$3::jsonb, updated_at=now() WHERE id=$1`,
      [runId, JSON.stringify(pairs), JSON.stringify({ knownDifferences: KNOWN_DIFFERENCES, everyH, primaryTimeframe: primaryH1 ? 'H1' : 'M15', enrichOn: modelsEnrichOn() })],
    ).catch(() => {});

    // Historical series, fetched once per pair (cache-preserving).
    const seriesByPair = new Map<string, PairSeries>();
    await Promise.all(pairs.map(async (symbol) => {
      seriesByPair.set(symbol, await loadSeries(symbol, days).catch(() => ({ m15: [], m5: [], h1: [], h4: [] } as PairSeries)));
    }));

    const decisions: any[] = await loadRunDecisions(runId);
    let aiCalls = Number(run.ai_calls) || 0;
    let decisionsMade = Number(run.decisions_made) || 0;
    let failedHours = 0;

    const startIdx = Math.min(Number(run.hours_done) || 0, hoursTotal);
    for (let idx = startIdx; idx < hoursTotal; idx++) {
      const H = startMs + idx * HOUR_MS;
      const hourDate = new Date(H);
      const session = sessionFor(hourDate);
      try {
        // Point-in-time resolution first: outcomes knowable by H feed the
        // prompt's track record for this hour (and only those).
        for (const dec of decisions) {
          if (dec.result == null && (dec.direction === 'BUY' || dec.direction === 'SELL')) {
            const s = seriesByPair.get(dec.symbol);
            if (s) await resolveReplayDecision(dec, s.m15, H).catch(() => {});
          }
        }
        if (hourDate.getUTCHours() % everyH === 0) {
          const openPairs = pairs.filter((s) => !replayMarketClosed(s, H));
          const built = (await Promise.all(openPairs.map((symbol) =>
            buildPairCtxAsOf(symbol, H, seriesByPair.get(symbol)!, { primaryH1 }, engine).catch(() => null),
          ))).filter(Boolean) as Array<{ symbol: string; ctx: any }>;
          if (built.length) {
            // Range per pair, as-of H — fed through the shared decision
            // path's range hook (identical math to live rangeFeatures).
            const rangeBySymbol = new Map<string, any>();
            for (const p of built) {
              const s = seriesByPair.get(p.symbol)!;
              rangeBySymbol.set(p.symbol, computeRangeFeatures(barsBefore(s.h1, H, 71), p.symbol, H));
            }
            const res = await decideModelIdeas(userId, session, built, 'fx', {
              masteryLines: replayMasteryLines(decisions),
              rangeFor: async (symbol: string) => rangeBySymbol.get(symbol) ?? null,
            });
            aiCalls += res.aiCalls;
            if (res.paused) throw new Error('AI budget guard paused the replay (credits) — run stopped; the hours already decided are kept.');
            if (res.failed) failedHours++;
            for (const o of res.outcomes) {
              const prov = decisionProvenance(o.model, o.symbol, session, 'fx');
              const oldBlocked = o.isTrade && (prov.wasExcludedPair || prov.wasBlockedSession);
              const ctxJson = JSON.stringify({ ...o.storedCtx, replay: { runId, hourAt: hourDate.toISOString(), simulation: true } });
              const ins = await pool.query(
                `INSERT INTO fx_model_replay_decisions (run_id, user_id, symbol, model, day_type, session, direction, entry_price, stop_loss, take_profit, confidence, setup, reasoning, context, hour_at, was_excluded_pair, was_blocked_session, old_rules_blocked, result)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15,$16,$17,$18,$19) RETURNING id`,
                [runId, userId, o.symbol, o.model, o.dayType, session, o.direction, o.entry, o.stopLoss, o.takeProfit,
                  o.confidence, o.setup, o.reasoning, ctxJson, hourDate,
                  prov.wasExcludedPair, prov.wasBlockedSession, oldBlocked, o.isTrade ? null : 'NO_TRADE'],
              ).catch(() => null);
              decisionsMade++;
              decisions.push({
                id: ins?.rows?.[0]?.id ?? null, run_id: runId, user_id: userId, symbol: o.symbol, model: o.model,
                day_type: o.dayType, session, direction: o.direction, entry_price: o.entry, stop_loss: o.stopLoss,
                take_profit: o.takeProfit, confidence: o.confidence, hour_at: hourDate.toISOString(),
                was_excluded_pair: prov.wasExcludedPair, was_blocked_session: prov.wasBlockedSession,
                old_rules_blocked: oldBlocked, result: o.isTrade ? null : 'NO_TRADE', r_multiple: null, resolved_at: null,
              });
            }
          }
        }
      } catch (e: any) {
        if (String(e?.message || '').includes('budget guard paused')) throw e;
        console.error(`[fx-models-replay] run ${runId} hour ${hourDate.toISOString()} failed (continuing):`, e?.message || e);
      }
      // Checkpoint — a restart resumes from the next hour.
      await pool.query(
        `UPDATE fx_model_replay_runs SET hours_done=$2, ai_calls=$3, decisions_made=$4, updated_at=now() WHERE id=$1`,
        [runId, idx + 1, aiCalls, decisionsMade],
      ).catch(() => {});
    }

    // Final resolution pass against everything knowable by now.
    const nowMs = Date.now();
    for (const dec of decisions) {
      if (dec.result == null && (dec.direction === 'BUY' || dec.direction === 'SELL')) {
        const s = seriesByPair.get(dec.symbol);
        if (s) await resolveReplayDecision(dec, s.m15, nowMs).catch(() => {});
      }
    }

    const results = computeReplayResults(decisions);
    await pool.query(
      `UPDATE fx_model_replay_runs SET status='complete', results=$2::jsonb, ai_calls=$3, decisions_made=$4,
         metadata = COALESCE(metadata, '{}'::jsonb) || $5::jsonb, completed_at=now(), updated_at=now() WHERE id=$1`,
      [runId, JSON.stringify(results), aiCalls, decisionsMade, JSON.stringify({ failedHours })],
    );
  } catch (e: any) {
    console.error(`[fx-models-replay] run ${runId} failed:`, e?.message || e);
    await pool.query(
      `UPDATE fx_model_replay_runs SET status='failed', error=$2, updated_at=now() WHERE id=$1`,
      [runId, String(e?.message || e).slice(0, 500)],
    ).catch(() => {});
  } finally {
    activeRuns.delete(runId);
  }
}

function kick(runId: number): void {
  void executeRun(runId).catch((e: any) => console.error('[fx-models-replay] runner error:', e?.message || e));
}

/**
 * Start a replay for the user (or return the one already running — one
 * active run per user; a finished run is superseded by the new one).
 */
export async function startFxModelReplay(userId: number, daysRaw: number): Promise<{ run: PublicReplayRun; started: boolean }> {
  await ensureFxModelReplayTables();
  const days = Math.max(1, Math.min(14, Math.floor(Number(daysRaw) || 14)));
  const { rows: existing } = await pool.query(
    `SELECT * FROM fx_model_replay_runs WHERE user_id=$1 AND status='running' ORDER BY id DESC LIMIT 1`, [userId],
  );
  if (existing[0]) {
    kick(Number(existing[0].id)); // resume if this process isn't running it
    return { run: toPublicRun(existing[0]), started: false };
  }
  const endMs = Math.floor(Date.now() / HOUR_MS) * HOUR_MS;
  const startMs = endMs - days * DAY_MS;
  const hoursTotal = Math.round((endMs - startMs) / HOUR_MS);
  const { rows } = await pool.query(
    `INSERT INTO fx_model_replay_runs (user_id, days, window_start, window_end, status, hours_total, metadata)
     VALUES ($1,$2,$3,$4,'running',$5,$6::jsonb) RETURNING *`,
    [userId, days, new Date(startMs), new Date(endMs), hoursTotal, JSON.stringify({ knownDifferences: KNOWN_DIFFERENCES })],
  );
  const run = rows[0];
  kick(Number(run.id));
  return { run: toPublicRun(run), started: true };
}

/** Latest run for the user (resuming it first if it was left running). */
export async function getLatestFxModelReplay(userId: number): Promise<PublicReplayRun | null> {
  await ensureFxModelReplayTables();
  const { rows } = await pool.query(
    `SELECT * FROM fx_model_replay_runs WHERE user_id=$1 ORDER BY id DESC LIMIT 1`, [userId],
  );
  const run = rows[0];
  if (!run) return null;
  if (run.status === 'running' && fxModelsReplayOn()) kick(Number(run.id));
  return toPublicRun(run);
}

/** Boot hook: resume any run a restart interrupted (checkpoints make
 *  this continue from the next unprocessed hour, never restart it). */
export async function resumeFxModelReplayRuns(): Promise<void> {
  if (!fxModelsReplayOn()) return;
  try {
    await ensureFxModelReplayTables();
    const { rows } = await pool.query(`SELECT id FROM fx_model_replay_runs WHERE status='running' ORDER BY id`);
    for (const r of rows) kick(Number(r.id));
    if (rows.length) console.log(`[fx-models-replay] resumed ${rows.length} interrupted run(s)`);
  } catch (e: any) {
    console.error('[fx-models-replay] resume scan failed (non-fatal):', e?.message || e);
  }
}
