// ─────────────────────────────────────────────────────────────────────────────
// FX engine Model 1 / Model 2 — phase 1 (SHADOW ONLY, never places orders)
//
//   Model 1 "range"  — low-volume / choppy days: fade range edges, quick
//                      1–1.5R targets, 1–3 trades a day.
//   Model 2 "trend"  — volume / expansion days: H4→H1→M15 aligned breakouts
//                      and pullbacks, 2–4R targets, let winners run.
//
// Every scan the engine classifies each pair's DAY TYPE (range / trend /
// mixed) and stores it. Once per H1 candle, one AI call asks BOTH models what
// they would trade on each pair, given the same indicators, structure,
// session and day type. Those ideas are stored as shadow decisions and later
// resolved against real prices (TP or SL first, or expiry), so each model
// builds a measurable track record per pair / session / day type.
//
// Mastery = how much data a model has on a slice × how accurate it has been.
// It is exposed via /api/fx-models/* and fed back into the shadow prompt so
// the models learn from their own record. Nothing here can trade; turning a
// model live is a later, separate step.
//
// Enrichment (Nov 12, 2026, user request): the shadow context ALSO carries
// volume profile (POC/VAH/VAL), the 5-state Markov regime read, the NY
// opening-range (ORB) state (FX only), and the D1 daily trend — plus a
// RECORDED-ONLY alternate regime (regimeAlt) that answers "what would the
// day type be under D1/H1 agreement instead of H1/H4?" from shadow data
// later. regimeAlt never drives autoModel, vetoes, or the live hand-off.
// Kill switch FX_MODELS_ENRICH=off restores the exact pre-enrichment
// context, prompt, and veto behavior.
//
// Epoch + probation + prop-firm sim (Nov 12, 2026, user directives):
//   • EPOCH — the promotion bar (sliceLiveReady) must grade only the
//     CURRENT system. Decisions inserted from this build onward are
//     stamped epoch = MODELS_EPOCH (2); pre-existing rows default to
//     epoch 1. getModelMastery still returns all-time rows for display,
//     but level / ready math uses epoch-filtered stats. Kill switch
//     FX_MODELS_EPOCH=off makes promotion counting all-time again.
//   • LIFTS (probation release) — for the enriched (epoch-2) models,
//     BOTH standing blocks are lifted in the shadow pipeline: the
//     per-model pair exclusions (M1_PAIRS_EXCLUDED / M2_PAIRS_EXCLUDED)
//     and M2's session restriction (M2_SESSIONS) no longer veto ideas.
//     Every decision records its provenance in ctx (wasExcludedPair /
//     wasBlockedSession) so the record shows which ground was formerly
//     blocked. There is NO pair/session hard block on live eligibility:
//     a formerly blocked slice can go live only the normal way — an
//     epoch-2 record clearing the full go-live bar, the user's live
//     toggle, and the daily caps. The epoch reset is the protection.
//     Kill switch FX_MODELS_LIFTS=off restores ALL old behavior (pair
//     vetoes + M2 session veto + the old prompt wording).
//   • PROP-FIRM SIM — propSimulate() replays the epoch-2 shadow record
//     as if traded on a $100,000 prop-firm account (0.5% risk per trade
//     or lower, scaled by confidence and slice accuracy; 2.5% daily
//     loss cap; 6% max loss = blown). A reporting tool only — it is
//     wired into getModelMastery as `propSim`, never into a live path.
//
// Marketplace completion (Nov 12, 2026, user directive):
//   • New model listings snapshot ONLY the current (epoch-2) record and
//     carry its proof + prop-sim summary, so a buyer can see which
//     system produced the record before paying.
//   • A purchased epoch-2 slice can qualify the BUYER's own new shadow
//     idea for the same live hand-off, under the buyer's own live
//     toggle, the buyer's shared M1/M2 daily caps, and every normal
//     engine guard. Pre-epoch-2 snapshots are legacy and never qualify.
//     Kill switch FX_MODEL_MARKETPLACE_LIVE=off restores own-only.
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from '../db';
import { marketDataService } from '../market-data/service';
import { getCachedMatrix, getMarkovSnapshot } from './markov-chain';

export type DayType = 'range' | 'trend' | 'mixed';
export type ModelId = 'M1' | 'M2';

const DDL = `
CREATE TABLE IF NOT EXISTS fx_day_regimes (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  symbol text NOT NULL,
  day date NOT NULL,
  hour_utc smallint NOT NULL,
  session text,
  day_type text NOT NULL,
  auto_model text NOT NULL,
  trend_score real,
  adx_m15 real,
  rel_volume real,
  atr real,
  h1_trend text,
  h4_trend text,
  features jsonb,
  created_at timestamp NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol, day, hour_utc)
);
CREATE TABLE IF NOT EXISTS fx_model_decisions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  symbol text NOT NULL,
  model text NOT NULL,
  mode text NOT NULL DEFAULT 'shadow',
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
  result text,
  r_multiple real,
  pips real,
  exit_price double precision,
  resolved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fx_model_decisions_open_idx ON fx_model_decisions (result, created_at);
CREATE INDEX IF NOT EXISTS fx_model_decisions_user_idx ON fx_model_decisions (user_id, model, created_at);
ALTER TABLE fx_model_decisions ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'own';
ALTER TABLE fx_model_decisions ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'fx';
ALTER TABLE fx_model_decisions ADD COLUMN IF NOT EXISTS epoch integer NOT NULL DEFAULT 1;
ALTER TABLE fx_day_regimes ADD COLUMN IF NOT EXISTS engine text NOT NULL DEFAULT 'fx';
`;

let ensured: Promise<void> | null = null;
export function ensureFxModelTables(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(DDL).then(() => undefined).catch((e: any) => {
      console.error('[fx-models] ensure tables failed (non-fatal):', e?.message || e);
      ensured = null;
    });
  }
  return ensured;
}

export function sessionFor(d = new Date()): string {
  const h = d.getUTCHours();
  if (h >= 12 && h < 16) return 'London/NY overlap';
  if (h >= 7 && h < 12) return 'London';
  if (h >= 16 && h < 21) return 'New York';
  return 'Asian';
}

// ── Candle sources per engine ─────────────────────────────────────────────
// FX reads Twelve Data; the crypto engine registers its own on-chain / venue
// candles (cryptocom-scanner.ts) so the same models run on both. Bars are
// oldest → newest, timestamps in ms or s.
export type ModelBar = { timestamp: number; open: number; high: number; low: number; close: number; volume?: number };
export type BarsFn = (symbol: string, tf: '15m' | '1h' | '4h', n: number) => Promise<ModelBar[]>;
export type ModelEngine = 'fx' | 'crypto';
const barsProviders: Record<string, BarsFn> = {
  fx: async (symbol, tf, n) => {
    const r = await marketDataService.fetchMarketData({ symbol, assetType: marketDataService.detectAssetType(symbol), timeframe: tf, limit: n });
    return (r?.bars || []) as ModelBar[];
  },
};
export function registerBarsProvider(engine: ModelEngine, fn: BarsFn): void { barsProviders[engine] = fn; }
export const barsFor = (engine: string): BarsFn => barsProviders[engine] || barsProviders.fx;

const pipSize = (sym: string) => /JPY/.test(sym) ? 0.01 : /^XAU/.test(sym) ? 0.1 : /^(BTC|ETH)/.test(sym) ? 1 : /^(US30|NAS|SPX|GER|UK1|JP2)/.test(sym) ? 1 : 0.0001;

/**
 * Day type from trend strength, higher-timeframe agreement, volume and
 * session. Higher score = more trend-day-like.
 */
export function classifyDayType(input: {
  adx?: number | null; relVolume?: number | null; h1?: string | null; h4?: string | null; session: string; news?: boolean;
}): { dayType: DayType; autoModel: ModelId; score: number } {
  let s = 0;
  const adx = Number(input.adx);
  if (Number.isFinite(adx)) s += adx >= 25 ? 2 : adx >= 18 ? 1 : 0;
  const h1 = input.h1 || 'NEUTRAL', h4 = input.h4 || 'NEUTRAL';
  if (h1 !== 'NEUTRAL' && h1 === h4) s += 2;
  else if (h1 !== 'NEUTRAL' || h4 !== 'NEUTRAL') s += 1;
  const rv = Number(input.relVolume);
  if (Number.isFinite(rv)) s += rv >= 1.3 ? 1 : rv < 0.8 ? -1 : 0;
  if (input.news) s += 1;
  if (input.session === 'London/NY overlap' || input.session === 'London') s += 1;
  if (input.session === 'Asian') s -= 1;
  const dayType: DayType = s >= 4 ? 'trend' : s <= 1 ? 'range' : 'mixed';
  const autoModel: ModelId = dayType === 'trend' ? 'M2' : dayType === 'range' ? 'M1' : (Number.isFinite(adx) && adx >= 18 ? 'M2' : 'M1');
  return { dayType, autoModel, score: s };
}

// ── Shadow enrichment: VP / Markov / ORB / D1 + recorded-only alt regime ──
export const modelsEnrichOn = (): boolean => process.env.FX_MODELS_ENRICH !== 'off';

// ── Epoch (promotion counts the current system only) ─────────────────────
// Epoch 1 = every decision recorded before this build (including the
// brief enriched-but-unstamped window after PR #57 — those rows carry
// the DB default 1; only rows inserted by this build onward are stamped
// 2). Epoch 2 = decisions made with the enriched context (VP / Markov /
// ORB / D1) under the probation release.
export const MODELS_EPOCH = 2;
/** Kill switch FX_MODELS_EPOCH=off → promotion counting is all-time again. */
export const modelsEpochOn = (): boolean => process.env.FX_MODELS_EPOCH !== 'off';

// ── Lifts (formerly blocked pairs/sessions trade in shadow again) ────────
/** Kill switch FX_MODELS_LIFTS=off → pair vetoes + M2 session veto return. */
export const modelsLiftsOn = (): boolean => process.env.FX_MODELS_LIFTS !== 'off';

/** Kill switch FX_MODEL_MARKETPLACE_LIVE=off → purchased model records
 *  inform the buyer's models again but can never unlock live trading. */
export const fxModelMarketplaceLiveOn = (): boolean => process.env.FX_MODEL_MARKETPLACE_LIVE !== 'off';

/**
 * The lifts apply to the ENRICHED (epoch-2) models only: with
 * FX_MODELS_ENRICH=off the whole pre-enrichment behavior — context,
 * prompt, and vetoes — is restored, exactly as PR #57 documented.
 */
export const liftsActive = (): boolean => modelsEnrichOn() && modelsLiftsOn();

/**
 * Is this pair on the model's (formerly) excluded list? The env lists
 * (FX_M1_EXCLUDED_PAIRS / FX_M2_EXCLUDED_PAIRS) remain the single source
 * of which pairs were blocked per model. FX engine only — the lists were
 * never applied to crypto.
 */
export function isExcludedPair(model: string, symbol: string, engine: ModelEngine = 'fx'): boolean {
  if (engine !== 'fx' || !symbol) return false;
  const sym = String(symbol).toUpperCase();
  if (model === 'M1') return M1_PAIRS_EXCLUDED.includes(sym);
  if (model === 'M2') return M2_PAIRS_EXCLUDED.includes(sym);
  return false;
}

/**
 * Provenance of an idea against the OLD blocks, recorded on every
 * epoch-2 decision's ctx: was this pair formerly excluded for the model,
 * and (M2/FX) was this session formerly blocked? Pure facts — under the
 * lifts neither one vetoes anything.
 */
export function decisionProvenance(model: string, symbol: string, session: string, engine: ModelEngine = 'fx'): { wasExcludedPair: boolean; wasBlockedSession: boolean } {
  return {
    wasExcludedPair: isExcludedPair(model, symbol, engine),
    wasBlockedSession: engine === 'fx' && model === 'M2' && !M2_SESSIONS.includes(session),
  };
}

/**
 * The stats the PROMOTION bar grades: epoch-filtered while the epoch is
 * on (the current system's record only), all-time when FX_MODELS_EPOCH=off.
 * Pure — reads only the slice object getModelMastery produced.
 */
export function promotionStats(s: any): { trades: number; avgR: number; winRate: number; level: string } {
  if (modelsEpochOn()) {
    return {
      trades: Number(s?.epochTrades) || 0,
      avgR: Number(s?.epochAvgR) || 0,
      winRate: Number(s?.epochWinRate) || 0,
      level: String(s?.epochLevel || 'Learning'),
    };
  }
  return {
    trades: Number(s?.trades) || 0,
    avgR: Number(s?.avgR) || 0,
    winRate: Number(s?.winRate) || 0,
    level: String(s?.allTimeLevel || s?.level || 'Learning'),
  };
}

// ── Prop-firm simulation of the shadow record ────────────────────────────
// Replays RESOLVED shadow decisions chronologically (by resolved_at,
// falling back to created_at) as if each had been traded on a $100,000
// prop-firm account. This is the AI-chosen sizing the user asked for:
// "0.5% a trade or lower depending on the trade and accuracy":
//
//   riskPct = BASE (0.5%) × confidenceFactor × accuracyFactor, floored
//             at 0.1% and capped at 0.5% of the CURRENT balance, where
//     confidenceFactor = clamp(confidence / 100, 0.4, 1)   (missing
//                        confidence is treated as 50 → 0.5)
//     accuracyFactor   = clamp(slice win rate, 0.5, 1) once the slice
//                        (model × day type × pair × session) has ≥10
//                        prior resolved trades in this replay, else 0.75
//   $ P&L of a trade = risk$ × its R multiple.
//
// Prop-firm guardrails: a daily loss cap (default 2.5% of the day-start
// balance — the user's 2–3% band; env PROP_SIM_DAILY_CAP_PCT) skips the
// rest of that day's trades once hit, and a 6% max loss from the $100k
// start (env PROP_SIM_MAX_LOSS_PCT) ends the sim (blown). Pure function:
// no DB, no clock of its own (timestamps come from the decisions).
export interface PropSimDecision {
  model?: string; day_type?: string; dayType?: string; symbol?: string; session?: string;
  confidence?: number | null; r_multiple?: number | null; rMultiple?: number | null;
  result?: string | null; created_at?: any; resolved_at?: any; id?: number;
}
export interface PropSimTradeDetail {
  at: string; day: string; sliceKey: string; confidence: number | null;
  riskPct: number; riskDollars: number; r: number; pnl: number; balanceAfter: number;
  skipped: boolean; skipReason?: string;
}
export interface PropSimResult {
  startBalance: number; endBalance: number; totalReturnPct: number;
  tradesTaken: number; tradesSkipped: number; skippedByDailyCap: number;
  blown: boolean; blownAt: string | null; worstDayPct: number; daysActive: number;
  detail?: PropSimTradeDetail[];
}
export interface PropSimOpts {
  startBalance?: number; baseRiskPct?: number; minRiskPct?: number; maxRiskPct?: number;
  dailyCapPct?: number; maxLossPct?: number; includeDetail?: boolean;
}

const clampNum = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const round2 = (x: number) => Math.round(x * 100) / 100;

export function propSimulate(decisions: PropSimDecision[], opts: PropSimOpts = {}): PropSimResult {
  const startBalance = Number(opts.startBalance) > 0 ? Number(opts.startBalance) : 100_000;
  const baseRiskPct = Number(opts.baseRiskPct) > 0 ? Number(opts.baseRiskPct) : 0.5;
  const minRiskPct = Number.isFinite(Number(opts.minRiskPct)) ? Number(opts.minRiskPct) : 0.1;
  const maxRiskPct = Number(opts.maxRiskPct) > 0 ? Number(opts.maxRiskPct) : baseRiskPct;
  const dailyCapPct = Number(opts.dailyCapPct) > 0 ? Number(opts.dailyCapPct)
    : (Number(process.env.PROP_SIM_DAILY_CAP_PCT) > 0 ? Number(process.env.PROP_SIM_DAILY_CAP_PCT) : 2.5);
  const maxLossPct = Number(opts.maxLossPct) > 0 ? Number(opts.maxLossPct)
    : (Number(process.env.PROP_SIM_MAX_LOSS_PCT) > 0 ? Number(process.env.PROP_SIM_MAX_LOSS_PCT) : 6);

  const tsOf = (d: PropSimDecision): number => {
    const t = new Date(d?.resolved_at ?? d?.created_at ?? 0).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  // Only resolved trades replay: WIN / LOSS / EXPIRED with a real R.
  // NO_TRADE rows and still-open ideas are skipped entirely.
  const rows = (decisions || []).filter((d) => {
    const r = Number(d?.r_multiple ?? d?.rMultiple);
    if (!Number.isFinite(r)) return false;
    if (d?.result == null) return true;
    const res = String(d.result).toUpperCase();
    return res === 'WIN' || res === 'LOSS' || res === 'EXPIRED';
  }).slice().sort((a, b) => (tsOf(a) - tsOf(b))
    || (new Date(a?.created_at ?? 0).getTime() - new Date(b?.created_at ?? 0).getTime())
    || ((Number(a?.id) || 0) - (Number(b?.id) || 0)));

  let balance = startBalance;
  let curDay: string | null = null;
  let dayStartBalance = startBalance;
  let dayPnl = 0;
  let worstDayPct = 0;
  let tradesTaken = 0;
  let skippedByDailyCap = 0;
  let blown = false;
  let blownAt: string | null = null;
  const activeDays = new Set<string>();
  const slicePrior = new Map<string, { n: number; wins: number }>();
  const detail: PropSimTradeDetail[] = [];
  const blowLine = startBalance * (1 - maxLossPct / 100);
  const closeDay = () => {
    if (curDay && dayStartBalance > 0) worstDayPct = Math.min(worstDayPct, (dayPnl / dayStartBalance) * 100);
  };

  for (const d of rows) {
    if (blown) break; // sim over: later trades are not processed at all
    const ts = tsOf(d);
    const day = new Date(ts).toISOString().slice(0, 10);
    if (day !== curDay) { closeDay(); curDay = day; dayStartBalance = balance; dayPnl = 0; }
    const r = Number(d?.r_multiple ?? d?.rMultiple);
    const sliceKey = `${d?.model || ''}|${d?.day_type ?? d?.dayType ?? ''}|${String(d?.symbol || '').toUpperCase()}|${d?.session || ''}`;
    const confRaw = Number(d?.confidence);
    const confidence = Number.isFinite(confRaw) ? confRaw : null;

    // Daily loss cap already hit → this trade (and the rest of today) is skipped.
    if (dayPnl <= -(dailyCapPct / 100) * dayStartBalance + 1e-9) {
      skippedByDailyCap++;
      if (opts.includeDetail) detail.push({ at: new Date(ts).toISOString(), day, sliceKey, confidence, riskPct: 0, riskDollars: 0, r, pnl: 0, balanceAfter: balance, skipped: true, skipReason: 'daily loss cap' });
      continue;
    }

    const prior = slicePrior.get(sliceKey) || { n: 0, wins: 0 };
    const confFactor = clampNum((confidence ?? 50) / 100, 0.4, 1);
    const accFactor = prior.n >= 10 ? clampNum(prior.wins / prior.n, 0.5, 1) : 0.75;
    const riskPct = clampNum(baseRiskPct * confFactor * accFactor, minRiskPct, maxRiskPct);
    const riskDollars = balance * (riskPct / 100);
    const pnl = riskDollars * r;
    balance += pnl;
    dayPnl += pnl;
    tradesTaken++;
    activeDays.add(day);
    prior.n++;
    if (r > 0) prior.wins++;
    slicePrior.set(sliceKey, prior);
    if (opts.includeDetail) {
      detail.push({
        at: new Date(ts).toISOString(), day, sliceKey, confidence,
        riskPct: Math.round(riskPct * 1e6) / 1e6, riskDollars: round2(riskDollars),
        r, pnl: round2(pnl), balanceAfter: round2(balance), skipped: false,
      });
    }
    if (balance <= blowLine) { blown = true; blownAt = day; }
  }
  closeDay();

  const out: PropSimResult = {
    startBalance,
    endBalance: round2(balance),
    totalReturnPct: round2(((balance - startBalance) / startBalance) * 100),
    tradesTaken,
    tradesSkipped: skippedByDailyCap,
    skippedByDailyCap,
    blown,
    blownAt,
    worstDayPct: round2(worstDayPct),
    daysActive: activeDays.size,
  };
  if (opts.includeDetail) out.detail = detail;
  return out;
}

/**
 * Alternate regime experiment (RECORDED ONLY): the exact classifyDayType
 * scorecard with the D1 trend substituted for H4 — "what would today be
 * under D1/H1 agreement?" Stored as ctx.regimeAlt on every enriched cycle
 * so the shadow record can later say whether D1/H1 would have beaten
 * H1/H4. Never used for autoModel, vetoes, or the live hand-off.
 */
export function altClassifyD1H1(input: {
  adx?: number | null; relVolume?: number | null; d1?: string | null; h1?: string | null; session: string; news?: boolean;
}): { dayType: DayType; autoModel: ModelId; score: number } {
  return classifyDayType({ adx: input.adx, relVolume: input.relVolume, h1: input.h1, h4: input.d1, session: input.session, news: input.news });
}

/**
 * Compact volume profile from the engine's indicators.volumeProfile shape
 * ({ poc, vah, val, ... } from server/indicators.ts). Null when the true
 * profile (POC/VAH/VAL) or a usable price is missing.
 */
export function compactVolumeProfile(vp: any, price: number): {
  poc: number; vah: number; val: number; pricePos: 'above VA' | 'in VA' | 'below VA'; distToPocPct: number;
} | null {
  const poc = Number(vp?.poc), vah = Number(vp?.vah), val = Number(vp?.val), px = Number(price);
  if (!(poc > 0) || !(vah > 0) || !(val > 0) || !(px > 0)) return null;
  const pricePos = px > vah ? 'above VA' : px < val ? 'below VA' : 'in VA';
  return { poc, vah, val, pricePos, distToPocPct: Math.round(((px - poc) / poc) * 10000) / 100 };
}

/**
 * Compact Markov read from the CACHED transition matrix only — never builds
 * a matrix here (that happens in the engine's signal path). pTrend is the
 * next-step probability mass on any directional state (BULL/STRONG_BULL or
 * BEAR/STRONG_BEAR); pChop is the mass on staying NEUTRAL. Null when no
 * matrix is cached for the symbol yet.
 */
export function compactMarkov(symbol: string, lastCandle: { open: number; close: number } | null): {
  state: string; pTrend: number; pChop: number; pBull: number; pBear: number;
} | null {
  try {
    let lc = lastCandle;
    if (!lc) {
      const hist = getCachedMatrix(symbol)?.candleHistory;
      if (hist?.length) lc = hist[hist.length - 1];
    }
    if (!lc) return null;
    const snap = getMarkovSnapshot(symbol, lc);
    if (!snap) return null;
    const r3 = (x: number) => Math.round(x * 1000) / 1000;
    return {
      state: snap.currentState,
      pTrend: r3(snap.bullishProbability + snap.bearishProbability),
      pChop: r3(snap.neutralProbability),
      pBull: r3(snap.bullishProbability),
      pBear: r3(snap.bearishProbability),
    };
  } catch { return null; }
}

/** Aggregate H1 bars (oldest → newest, ts in ms or s) into UTC daily bars. */
export function aggregateDailyBars(h1Bars: ModelBar[]): ModelBar[] {
  const byDay = new Map<number, ModelBar>();
  for (const b of h1Bars || []) {
    const raw = Number(b?.timestamp);
    if (!Number.isFinite(raw)) continue;
    const ts = raw < 1e12 ? raw * 1000 : raw;
    const day = Math.floor(ts / 86_400_000);
    const cur = byDay.get(day);
    if (!cur) {
      byDay.set(day, { timestamp: day * 86_400_000, open: Number(b.open), high: Number(b.high), low: Number(b.low), close: Number(b.close), volume: Number(b.volume) || 0 });
    } else {
      cur.high = Math.max(cur.high, Number(b.high));
      cur.low = Math.min(cur.low, Number(b.low));
      cur.close = Number(b.close);
      cur.volume = (cur.volume || 0) + (Number(b.volume) || 0);
    }
  }
  return Array.from(byDay.entries()).sort((x, y) => x[0] - y[0]).map(([, v]) => v);
}

/**
 * D1 summary from daily bars: trend from the file's EMA20/50 barTrend() over
 * CONFIRMED (completed) UTC days only, plus whether the live price sits
 * above the daily EMA20. Null with fewer than 20 confirmed days.
 */
export function d1Summary(daily: ModelBar[], price: number): { trend: string; priceAbove: boolean | null } | null {
  const todayKey = Math.floor(Date.now() / 86_400_000);
  const confirmed = (daily || []).filter((d) => Math.floor(Number(d.timestamp) / 86_400_000) < todayKey);
  if (confirmed.length < 20) return null;
  const closes = confirmed.map((d) => Number(d.close));
  const e20 = emaLast(closes, 20);
  const px = Number(price);
  const priceAbove = px > 0 ? (Number.isFinite(e20) && e20 > 0 ? px > e20 : px > closes[closes.length - 1]) : null;
  return { trend: barTrend(confirmed), priceAbove };
}

const d1CtxCache = new Map<string, { at: number; data: { trend: string; priceAbove: boolean | null } | null }>();

/**
 * D1 context for a symbol, cached 30 min per engine|symbol. Fetches ~1500
 * H1 bars (≈62 days → ~61 confirmed daily bars): barTrend() needs 50+
 * daily closes for its EMA50, so the ~500 bars that suffice elsewhere
 * (≈20 days) would leave D1 permanently NEUTRAL. Any failure → null.
 */
export async function d1Features(symbol: string, engine: ModelEngine = 'fx', price?: number): Promise<{ trend: string; priceAbove: boolean | null } | null> {
  const ck = `${engine}|${symbol}`;
  const hit = d1CtxCache.get(ck);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;
  let data: { trend: string; priceAbove: boolean | null } | null = null;
  try {
    const h1 = await barsFor(engine)(symbol, '1h', 1500);
    data = d1Summary(aggregateDailyBars(h1 || []), Number(price));
  } catch { data = null; }
  d1CtxCache.set(ck, { at: Date.now(), data });
  return data;
}

const orbCtxCache = new Map<string, { at: number; data: any }>();

/**
 * Compact ORB context (FX only), 60s-cached like the engine's own sniper
 * ORB cache. Dynamic import: live-trading-engine already dynamically
 * imports this module, so a static import would close a cycle.
 * getOrbState returns null outside the 9:30–15:00 ET window; a formed
 * range with no breakout yet is kept (phase 'awaiting_breakout').
 */
async function orbContext(userId: number, symbol: string): Promise<{
  phase: string; direction: 'BUY' | 'SELL' | null; rangeHigh: number; rangeLow: number; retest: boolean;
} | null> {
  const ck = `${userId}|${symbol}`;
  const hit = orbCtxCache.get(ck);
  if (hit && Date.now() - hit.at < 60_000) return hit.data;
  let data: any = null;
  try {
    const { getOrbState } = await import('./live-trading-engine');
    const st: any = await getOrbState(userId, symbol).catch(() => null);
    if (st && st.phase !== 'no_range' && Number(st.orbHigh) > 0) {
      data = { phase: st.phase, direction: st.breakoutDir ?? null, rangeHigh: st.orbHigh, rangeLow: st.orbLow, retest: !!st.retestActive };
    }
  } catch { data = null; }
  orbCtxCache.set(ck, { at: Date.now(), data });
  return data;
}

const lastShadowCandle = new Map<string, number>();
let lastResolveAt = 0;

/**
 * Called once per engine scan (leader only). Never throws, never trades.
 */
export async function runFxModelsCycle(userId: number, ctx: {
  marketAnalysis: Record<string, any>;
  snapshot: Record<string, any>;
  mtf: (symbol: string) => { h1: any | null; h4: any | null };
}): Promise<void> {
  if (process.env.FX_MODELS_SHADOW === 'off') return;
  try {
    await ensureFxModelTables();
    const now = new Date();
    const session = sessionFor(now);
    const day = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const pairs: Array<{ symbol: string; ctx: any }> = [];

    for (const [symbol, a] of Object.entries(ctx.marketAnalysis || {})) {
      const snap = ctx.snapshot?.[symbol] || {};
      const { h1, h4 } = ctx.mtf(symbol);
      const cls = classifyDayType({ adx: snap.adx, relVolume: snap.relativeVolume, h1: h1?.trend, h4: h4?.trend, session });
      const features: Record<string, any> = {
        price: a?.currentPrice ?? snap.price, m15Trend: snap.trend, rsi: snap.rsi, adx: snap.adx, plusDI: snap.plusDI, minusDI: snap.minusDI,
        atr: Number(snap.atr) > 0 ? snap.atr : null, // 0 means "not computed", never tell the AI ATR is zero
        relVolume: snap.relativeVolume, volumeTrend: snap.volumeTrend,
        h1: h1 ? { trend: h1.trend, bos: h1.bosChoch?.detected ? h1.bosChoch.description : null, pd: h1.premiumDiscount?.zone, wyckoff: h1.wyckoff?.detected ? h1.wyckoff.phase : null } : null,
        h4: h4 ? { trend: h4.trend, bos: h4.bosChoch?.detected ? h4.bosChoch.description : null, pd: h4.premiumDiscount?.zone, wyckoff: h4.wyckoff?.detected ? h4.wyckoff.phase : null } : null,
        signals: a?.signals ?? a?.strategySignals ?? undefined,
      };
      if (modelsEnrichOn()) {
        // Enriched shadow context (VP / Markov / ORB / D1 + alt regime).
        // Keys exist only when enrichment is on, so FX_MODELS_ENRICH=off
        // keeps the stored features byte-identical to the pre-enrichment shape.
        const px = Number(features.price);
        features.volumeProfile = compactVolumeProfile(a?.volumeProfile, px);
        features.markov = compactMarkov(symbol, a?.lastConfirmedCandle ?? null);
        const [orb, d1] = await Promise.all([
          orbContext(userId, symbol).catch(() => null),
          d1Features(symbol, 'fx', px).catch(() => null),
        ]);
        features.orb = orb;
        features.d1 = d1;
        const alt = altClassifyD1H1({ adx: snap.adx, relVolume: snap.relativeVolume, d1: d1?.trend, h1: h1?.trend, session });
        features.regimeAlt = { basis: 'D1/H1', dayType: alt.dayType, autoModel: alt.autoModel, score: alt.score };
      }
      await pool.query(
        `INSERT INTO fx_day_regimes (user_id, symbol, day, hour_utc, session, day_type, auto_model, trend_score, adx_m15, rel_volume, atr, h1_trend, h4_trend, features)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb)
         ON CONFLICT (user_id, symbol, day, hour_utc) DO UPDATE SET day_type=EXCLUDED.day_type, auto_model=EXCLUDED.auto_model,
           trend_score=EXCLUDED.trend_score, adx_m15=EXCLUDED.adx_m15, rel_volume=EXCLUDED.rel_volume, atr=EXCLUDED.atr,
           h1_trend=EXCLUDED.h1_trend, h4_trend=EXCLUDED.h4_trend, features=EXCLUDED.features`,
        [userId, symbol, day, hour, session, cls.dayType, cls.autoModel, cls.score, num(snap.adx), num(snap.relativeVolume), num(snap.atr), h1?.trend ?? null, h4?.trend ?? null, JSON.stringify(features)],
      ).catch(() => {});
      const candle = Math.floor(now.getTime() / 3_600_000);
      const key = `${userId}|${symbol}`;
      if (lastShadowCandle.get(key) !== candle && Number(features.price) > 0) {
        lastShadowCandle.set(key, candle);
        pairs.push({ symbol, ctx: { ...features, dayType: cls.dayType, autoModel: cls.autoModel, trendScore: cls.score } });
      }
    }

    let _fxEvery = 1;
    try { _fxEvery = (await (await import('./ai-level')).getAiLevel(userId)).fxModelsEveryH; } catch { /* default hourly */ }
    if (pairs.length && hour % _fxEvery === 0) await shadowDecide(userId, session, pairs);
    if (Date.now() - lastResolveAt > 15 * 60_000) { lastResolveAt = Date.now(); await resolveShadowDecisions('fx'); }
  } catch (e: any) {
    console.error('[fx-models] cycle failed (non-fatal):', e?.message || e);
  }
}

function num(x: any): number | null { const n = Number(x); return Number.isFinite(n) ? n : null; }

// ── Range-day toolkit for Model 1 ────────────────────────────────────────
// Range trading loses when it fades a market that is actually trending or
// about to break out (the earlier quick-trade losses). Model 1 therefore only
// trades a range that is MEASURED, not guessed:
//   • a defined box: 24 H1 bars, both edges touched at least twice
//   • compression: Bollinger width in the bottom 65% of its recent history
//   • price at an edge (outer 25% of the box), fading back toward the middle
//   • best trigger: a liquidity sweep / false break (wick through the edge,
//     close back inside) — the stop goes beyond the sweep wick
//   • first target the range middle; R:R to the middle at least 1.0
//   • no fades against a trending H4, no M1 on pairs that rarely range
const M1_PAIRS_EXCLUDED = (process.env.FX_M1_EXCLUDED_PAIRS || 'GBPJPY,XAUUSD,BTCUSD,US30,NAS100').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const rangeCache = new Map<string, { at: number; data: any }>();

export async function rangeFeatures(symbol: string, engine: ModelEngine = 'fx'): Promise<any | null> {
  const ck = `${engine}|${symbol}`;
  const hit = rangeCache.get(ck);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;
  let bars: any[] = [];
  try {
    bars = (await barsFor(engine)(symbol, '1h', 72)).slice(0, -1); // confirmed bars only
  } catch { return null; }
  if (bars.length < 30) return null;
  const ts = (b: any) => (Number(b.timestamp) < 1e12 ? Number(b.timestamp) * 1000 : Number(b.timestamp));
  const box = bars.slice(-24);
  const hi = Math.max(...box.map((b) => b.high)), lo = Math.min(...box.map((b) => b.low));
  const width = hi - lo;
  if (!(width > 0)) return null;
  // Loosened 2026-10-21 (was 10% touch band, BB pct ≤ 50, 80/20 edges):
  // Model 1 took 0 of 463 shadow ideas in 5 days, so it had no record to
  // learn from. Shadow-only effect — live still needs the go-live bar below.
  const tol = width * 0.15;
  const touchesHigh = box.filter((b) => b.high >= hi - tol).length;
  const touchesLow = box.filter((b) => b.low <= lo + tol).length;
  const last = bars[bars.length - 1];
  const price = Number(last.close);
  const posPct = ((price - lo) / width) * 100;
  // Liquidity sweep on the last confirmed bar vs the box before it.
  const prior = bars.slice(-25, -1);
  const pHi = Math.max(...prior.map((b) => b.high)), pLo = Math.min(...prior.map((b) => b.low));
  const sweepHigh = last.high > pHi && last.close < pHi;
  const sweepLow = last.low < pLo && last.close > pLo;
  // Bollinger width (20) now vs its last 40 values → percentile.
  const closes = bars.map((b) => Number(b.close));
  const bw = (i: number) => { const w = closes.slice(i - 20, i); const m = w.reduce((a, c) => a + c, 0) / 20; const sd = Math.sqrt(w.reduce((a, c) => a + (c - m) ** 2, 0) / 20); return m > 0 ? (4 * sd) / m : 0; };
  const widths: number[] = [];
  for (let i = Math.max(20, closes.length - 40); i <= closes.length; i++) widths.push(bw(i));
  const nowW = widths[widths.length - 1];
  const bbPct = Math.round((widths.filter((w) => w <= nowW).length / widths.length) * 100);
  // H1 ATR(14) on confirmed bars. The engine's M15 snapshot ATR is always 0
  // (computeAllAdvancedIndicators is called with currentATR=0), so the models
  // had no volatility input at all.
  const trs = bars.slice(-15).map((b, i, a) => i === 0 ? b.high - b.low : Math.max(b.high - b.low, Math.abs(b.high - a[i - 1].close), Math.abs(b.low - a[i - 1].close))).slice(1);
  const atrH1 = trs.reduce((s, x) => s + x, 0) / trs.length;
  // Prior UTC day and today's Asian session (00:00–07:00 UTC) highs/lows.
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const prevDay = bars.filter((b) => ts(b) >= t0 - 86_400_000 && ts(b) < t0);
  const asian = bars.filter((b) => ts(b) >= t0 && ts(b) < t0 + 7 * 3_600_000);
  const data = {
    rangeHigh: hi, rangeLow: lo, rangeMid: (hi + lo) / 2, widthPips: width / pipSize(symbol),
    touchesHigh, touchesLow, positionInRangePct: Math.round(posPct), bbWidthPercentile: bbPct,
    sweepHigh, sweepLow, atrH1: Number(atrH1.toPrecision(5)),
    prevDayHigh: prevDay.length ? Math.max(...prevDay.map((b) => b.high)) : null,
    prevDayLow: prevDay.length ? Math.min(...prevDay.map((b) => b.low)) : null,
    asianHigh: asian.length ? Math.max(...asian.map((b) => b.high)) : null,
    asianLow: asian.length ? Math.min(...asian.map((b) => b.low)) : null,
    qualifies: touchesHigh >= 2 && touchesLow >= 2 && bbPct <= 65,
  };
  rangeCache.set(ck, { at: Date.now(), data });
  return data;
}

// ── Model 2 trend rules (FX, shadow record 2026-10-17 → 10-27, 219 trades, −47R) ──
//   • sessions: London + London/NY overlap only (Asian −42R, New York −39R)
//   • no BUY at H1 premium / SELL at H1 discount (BUY at premium alone −51R)
//   • no entries with M15 ADX ≥ 30 — the trend is already stretched (−48R)
//   • target at least 3R from the live price (<2R −51R, ≥3R +34R)
//   • not on pairs that bleed under this model (USDJPY −30R)
const M2_PAIRS_EXCLUDED = (process.env.FX_M2_EXCLUDED_PAIRS || 'USDJPY').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const M2_SESSIONS = (process.env.FX_M2_SESSIONS || 'London,London/NY overlap').split(',').map((x) => x.trim()).filter(Boolean);
const M2_MAX_ADX = Number(process.env.FX_M2_MAX_ADX) || 30;
const M2_MIN_RR = Number(process.env.FX_M2_MIN_RR) || 3;

/** Server-side Model 2 rules. Returns null when the idea passes, else the reason it fails. */
export function m2Reject(symbol: string, dir: string, entry: number, sl: number, tp: number, ctx: any, session: string, engine: ModelEngine = 'fx'): string | null {
  const want = dir === 'BUY' ? 'BULLISH' : 'BEARISH';
  if (ctx?.h1?.trend !== want || ctx?.h4?.trend !== want) return `H1 ${ctx?.h1?.trend ?? 'n/a'} / H4 ${ctx?.h4?.trend ?? 'n/a'} not both ${want}`;
  if (engine !== 'fx') return null;
  // Lifts (Nov 12, 2026): for the enriched models BOTH the pair check
  // and the session check below are lifted — formerly blocked pairs and
  // sessions record shadow trades instead of vetoes. All other Model 2
  // rules (premium/discount, ADX, 3R target) still apply everywhere.
  // FX_MODELS_LIFTS=off (or FX_MODELS_ENRICH=off) restores both vetoes.
  if (M2_PAIRS_EXCLUDED.includes(symbol) && !liftsActive()) return `${symbol} excluded from trend model`;
  if (!M2_SESSIONS.includes(session) && !liftsActive()) return `${session} session (Model 2 trades ${M2_SESSIONS.join(' / ')} only)`;
  const pd = ctx?.h1?.pd;
  if (dir === 'BUY' && pd === 'PREMIUM') return 'BUY at H1 premium';
  if (dir === 'SELL' && pd === 'DISCOUNT') return 'SELL at H1 discount';
  const adx = Number(ctx?.adx);
  if (Number.isFinite(adx) && adx >= M2_MAX_ADX) return `ADX ${adx.toFixed(0)} ≥ ${M2_MAX_ADX} (trend already stretched)`;
  const risk = Math.abs(entry - sl);
  const rr = risk > 0 ? Math.abs(tp - entry) / risk : 0;
  if (rr < M2_MIN_RR - 1e-6) return `target ${rr.toFixed(2)}R < ${M2_MIN_RR}R`; // epsilon: 0.03/0.01 is 2.9999… in floats
  return null;
}

/** Server-side Model 1 rules. Returns null when the idea passes, else the reason it fails. */
export function m1Reject(symbol: string, dir: string, entry: number, sl: number, ctx: any, engine: ModelEngine = 'fx'): string | null {
  const r = ctx?.range;
  // Lifts (Nov 12, 2026): the pair check is lifted for the enriched
  // models; every other Model 1 rule below still applies to those pairs.
  // FX_MODELS_LIFTS=off (or FX_MODELS_ENRICH=off) restores this veto.
  if (engine === 'fx' && M1_PAIRS_EXCLUDED.includes(symbol) && !liftsActive()) return `${symbol} excluded from range model`;
  if (!r) return 'range data unavailable';
  if (!r.qualifies) return `no qualified range (touches ${r.touchesHigh}/${r.touchesLow}, BB width pct ${r.bbWidthPercentile})`;
  const atTop = r.positionInRangePct >= 75, atBottom = r.positionInRangePct <= 25;
  if (dir === 'SELL' && !atTop) return `SELL not at range top (${r.positionInRangePct}%)`;
  if (dir === 'BUY' && !atBottom) return `BUY not at range bottom (${r.positionInRangePct}%)`;
  const h4 = ctx?.h4?.trend;
  if ((dir === 'SELL' && h4 === 'BULLISH') || (dir === 'BUY' && h4 === 'BEARISH')) return `fading a trending H4 (${h4})`;
  // Enrichment veto (Nov 12, 2026 — the ONE veto added with the enrichment):
  // never fade INTO an active confirmed ORB breakout. A range fade against a
  // live NY opening-range breakout is the classic range-day blow-up. Behind
  // FX_MODELS_ENRICH like the rest of the enrichment.
  if (engine === 'fx' && modelsEnrichOn()) {
    const orb = ctx?.orb;
    if (orb && (orb.phase === 'breakout' || orb.phase === 'retest') && (orb.direction === 'BUY' || orb.direction === 'SELL')) {
      if ((dir === 'BUY' && orb.direction === 'SELL') || (dir === 'SELL' && orb.direction === 'BUY')) return 'ORB breakout active against the fade';
    }
  }
  const risk = Math.abs(entry - sl);
  const toMid = Math.abs(r.rangeMid - entry);
  if (!(risk > 0) || toMid / risk < 1) return `R:R to range middle ${(toMid / (risk || 1)).toFixed(2)} < 1`;
  return null;
}

/**
 * The Model 1 setup the server has already checked, so the AI does not have
 * to re-derive it. Replay of qualified edges 10-21 → 10-28: edges WITH the H4
 * trend hit target 12 / stop 4, but the AI took only 5 of 22 — about 9 times it
 * answered "Range does not qualify" on a range that did. Edges AGAINST the H4
 * hit target 10 / stop 22, so the never-fade-H4 rule stays: those get no
 * candidate here and m1Reject still refuses them.
 */
export function m1Candidate(symbol: string, ctx: any, engine: ModelEngine = 'fx'): {
  direction: 'BUY' | 'SELL'; edge: 'top' | 'bottom'; h4: string; sweep: boolean; stopRef: number; target: number; rrToMidEst: number;
} | null {
  const r = ctx?.range;
  if (!r?.qualifies) return null;
  // Formerly excluded pairs get server-checked candidates too under the
  // lifts — otherwise the release would never produce an M1 record.
  if (engine === 'fx' && M1_PAIRS_EXCLUDED.includes(symbol) && !liftsActive()) return null;
  const atTop = r.positionInRangePct >= 75, atBottom = r.positionInRangePct <= 25;
  if (!atTop && !atBottom) return null;
  const direction = atTop ? 'SELL' : 'BUY';
  if (engine === 'crypto' && direction === 'SELL') return null; // crypto is long-only
  const h4 = ctx?.h4?.trend || 'NEUTRAL';
  if ((direction === 'SELL' && h4 === 'BULLISH') || (direction === 'BUY' && h4 === 'BEARISH')) return null;
  // Estimate only: stop 10% of the box beyond the edge (the AI sets the real stop).
  const width = r.rangeHigh - r.rangeLow;
  const price = Number(ctx?.price);
  const stopRef = atTop ? r.rangeHigh + 0.1 * width : r.rangeLow - 0.1 * width;
  const risk = Math.abs(price - stopRef);
  const rrToMidEst = price > 0 && risk > 0 ? Math.abs(r.rangeMid - price) / risk : 0;
  return {
    direction, edge: atTop ? 'top' : 'bottom', h4, sweep: !!(atTop ? r.sweepHigh : r.sweepLow),
    stopRef: Number(stopRef.toPrecision(6)), target: Number(Number(r.rangeMid).toPrecision(6)), rrToMidEst: Math.round(rrToMidEst * 100) / 100,
  };
}

/**
 * Enrichment guidance spliced into the models prompt when enrichment is on.
 * Written against the enriched ctx fields (volumeProfile / orb / markov /
 * d1); the same wording the check script asserts on. FX gets the ORB line;
 * crypto has no opening range.
 */
function enrichmentGuidance(engine: ModelEngine): string {
  const lines = [
    'ENRICHED CONTEXT (per pair below; a field is null when that feed is unavailable \u2014 ignore nulls):',
    '  \u2022 ctx.volumeProfile \u2014 POC is the price with the most traded volume (a magnet); VAH/VAL bound the value area (~70% of volume). Model 1: prefer fades from the value-area edges (VAH/VAL) and thin low-volume nodes back toward the POC \u2014 treat the POC like the range middle. Model 2: breakouts that push through a low-volume node, and pullbacks that hold at the POC / VAH / VAL, are valid trend setups.',
    ...(engine === 'fx' ? [
      '  \u2022 ctx.orb \u2014 the NY opening range (9:30\u20139:45 ET) when live: phase "breakout"/"retest" with a direction is a CONFIRMED opening-range breakout. Model 1: NEVER fade against an active confirmed ORB breakout \u2014 stand aside on that pair (the server vetoes it too). Model 2: a confirmed ORB breakout + retest inside the NY window is a valid trend setup \u2014 trade the breakout direction, stop beyond the far side of the range.',
    ] : []),
    '  \u2022 ctx.markov \u2014 5-state Markov regime read: state now, pTrend = chance the next step is a directional state, pChop = chance it stays NEUTRAL. Regime evidence, not a signal: do not force Model 2 trend trades when Markov is NEUTRAL with high pChop; a directional Markov state backs the model that agrees with it.',
    '  \u2022 ctx.d1 \u2014 the daily (D1) trend is the SENIOR bias (priceAbove = live price vs the daily EMA20). Prefer trades WITH the D1 trend; when an idea fights D1, say so in its "reason".',
  ];
  return lines.join('\n') + '\n';
}

/**
 * The shadow-decide prompt. With enriched=false (FX_MODELS_ENRICH=off) this
 * returns the pre-enrichment prompt byte for byte; with enrichment on, the
 * changes are the guidance block spliced in immediately before the
 * "Both models use every input" paragraph, plus — while the lifts are on
 * (FX_MODELS_LIFTS) — the Model 2 scope line: any session, any pair, no
 * self-censoring over the formerly blocked ground. Lifts off → the
 * legacy scope line returns byte for byte.
 */
export function buildModelsPrompt(engine: ModelEngine, session: string, pairs: Array<{ symbol: string; ctx: any }>, masteryLines: string, enriched: boolean = modelsEnrichOn()): string {
  const liftsPrompt = enriched && modelsLiftsOn();
  const m2ScopeLine = liftsPrompt
    ? `  \u2022 Sessions and pairs: Model 2 may trade ANY session and any pair${M2_PAIRS_EXCLUDED.length ? ` \u2014 including ${M2_PAIRS_EXCLUDED.join(', ')} and the Asian / New York sessions, which were blocked until now` : ''}. Judge each idea on today's merits; the poor October record in those places is history in the track record below, not a rule.`
    : `  \u2022 Only in ${M2_SESSIONS.join(' / ')} sessions${M2_PAIRS_EXCLUDED.length ? `, never on ${M2_PAIRS_EXCLUDED.join(', ')}` : ''} \u2014 otherwise Model 2 says NONE.`;
  const base = `You run TWO ${engine === 'crypto' ? 'CRYPTO (24/7 on-chain tokens)' : 'FX'} trading models side by side. For EACH ${engine === 'crypto' ? 'token' : 'pair'} below, say what each model would trade RIGHT NOW (or NONE).
${engine === 'crypto' ? 'Crypto notes: markets never close; "sessions" are when US/EU volume is highest (London/NY hours give the cleanest trends). The live venue is spot DeFi (long-only): give BUY or NONE only — never SELL. Thin tokens wick hard — stops must sit beyond real structure, not inside noise.\n' : ''}
MODEL 1 (range / low-volume days) — only when ctx.range.qualifies is true:
  • Trade ONLY at an edge: SELL when positionInRangePct >= 75, BUY when <= 25. Never the middle.
  • Best trigger is a liquidity sweep (sweepHigh/sweepLow true: wick through the edge, close back inside). Also valid: rejection at prevDay/Asian high/low that sits on the edge, RSI stretched at the edge.
  • Stop beyond the sweep wick / range edge plus a small buffer. First target = rangeMid (must be >= 1.0R), runner to the opposite edge.
  • Never fade a trending H4, never trade a range during London open (07:00-08:00 UTC) or NY open (12:30-13:30 UTC) when breakouts start, max 1-3 trades a day.
  • ctx.range.m1Candidate is the setup the server has ALREADY checked: the range qualifies, price is at an edge, and that edge does not fight the H4. When it is set, Model 1 TAKES that trade — its direction, entry at the current price, stop beyond the edge / sweep wick (stopRef is a guide), first target rangeMid — unless you name a specific, concrete reason in "reason" (e.g. "London open window", "H1 just closed outside the box", "R:R to rangeMid under 1 with a sensible stop"). "Range does not qualify" or "position does not qualify" are never valid reasons when m1Candidate is set.
  • When ctx.range.m1Candidate is null, Model 1 says NONE.
MODEL 2 (trend / volume days): trade only in the H4+H1 direction — breakouts with volume or pullbacks to structure. Target ${engine === 'fx' ? `${M2_MIN_RR}R or more` : '2-4R'}, stop beyond the last H1 swing. Skip if H4 and H1 disagree.
${engine === 'fx' ? `${m2ScopeLine}
  • Buy pullbacks into H1 discount/equilibrium, sell rallies into H1 premium/equilibrium; never BUY at H1 premium or SELL at H1 discount (that is chasing).
  • Skip when ADX is ${M2_MAX_ADX} or higher — the move is already stretched; the best entries come while ADX is building (about 20-30).
  • The target must be at least ${M2_MIN_RR}R from the current price; if the next structure is closer, say NONE.
  • ctx.range.atrH1 is the H1 ATR(14) — use it to judge how far price normally moves in an hour when placing the stop and target.
` : ''}Both models use every input: trend, ADX/DI, RSI, volume, BOS/CHOCH, Wyckoff, premium/discount, session and the day type. Reason toward the best risk-adjusted trade of the day; NONE is a valid, often correct answer.

Session: ${session}
${masteryLines ? `Your own track record so far (use it — lean on what has worked, avoid what has not):\n${masteryLines}\n` : ''}
PAIRS:
${pairs.map((p) => `${p.symbol}: ${JSON.stringify(p.ctx)}`).join('\n')}

Respond ONLY with JSON:
{"ideas":[{"symbol":"EURUSD","model":"M1","direction":"BUY|SELL|NONE","entry":1.0,"stopLoss":1.0,"takeProfit":1.0,"confidence":0-100,"setup":"short name","reason":"one sentence"}]}
Give exactly one M1 and one M2 entry per pair.`;
  if (!enriched) return base;
  return base.replace('Both models use every input', `${enrichmentGuidance(engine)}Both models use every input`);
}

async function shadowDecide(userId: number, session: string, pairs: Array<{ symbol: string; ctx: any }>, engine: ModelEngine = 'fx'): Promise<void> {
  try {
    const { fxShouldPauseForCredits } = await import('./ai-budget-guard');
    if (fxShouldPauseForCredits()) return;
  } catch { /* guard unavailable: continue */ }
  let ai: any;
  try {
    const { getUniversalAIClientForUser } = await import('../openai');
    ai = await getUniversalAIClientForUser(userId);
  } catch { return; }

  for (const p of pairs) {
    const range = await rangeFeatures(p.symbol, engine).catch(() => null);
    // Copy, never mutate: rangeFeatures returns a cached object shared across cycles.
    p.ctx.range = range ? { ...range } : null;
    if (p.ctx.range) p.ctx.range.m1Candidate = m1Candidate(p.symbol, p.ctx, engine);
  }
  const mastery = await getModelMastery(userId, { engine }).catch(() => null);
  const masteryLines = (mastery?.slices || []).filter((m: any) => m.trades >= 5).slice(0, 20)
    .map((m: any) => `${m.model} ${m.dayType} ${m.symbol} ${m.session}: ${m.trades} trades, WR ${(m.winRate * 100).toFixed(0)}%, avg ${m.avgR.toFixed(2)}R (${m.level})`).join('\n');

  const prompt = buildModelsPrompt(engine, session, pairs, masteryLines);

  let content = '';
  try {
    const resp = await ai.chat.completions.create({
      model: ai.defaultModel || 'gpt-4o-mini',
      messages: [{ role: 'system', content: `You are a disciplined ${engine === 'crypto' ? 'crypto' : 'FX'} analyst. Valid JSON only.` }, { role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      max_tokens: 1800,
      temperature: 0.2,
    });
    content = resp?.choices?.[0]?.message?.content || '';
  } catch (e: any) {
    try { const { noteAiBudgetError } = await import('./ai-budget-guard'); noteAiBudgetError(e); } catch { /* ignore */ }
    return;
  }
  let ideas: any[] = [];
  try { ideas = JSON.parse(content.slice(content.indexOf('{'), content.lastIndexOf('}') + 1))?.ideas || []; } catch { return; }

  const byPair = new Map(pairs.map((p) => [p.symbol.toUpperCase(), p.ctx]));
  for (const i of ideas) {
    const sym = String(i?.symbol || '').toUpperCase().replace('/', '');
    const model = i?.model === 'M1' || i?.model === 'M2' ? i.model : null;
    const ctx = byPair.get(sym);
    if (!ctx || !model) continue;
    const dir = String(i?.direction || 'NONE').toUpperCase();
    const entry = Number(i?.entry), sl = Number(i?.stopLoss), tp = Number(i?.takeProfit);
    const valid = (dir === 'BUY' && sl < entry && tp > entry) || (dir === 'SELL' && sl > entry && tp < entry);
    const price = Number(ctx.price);
    // Ideas far from the live price are not tradeable now — record as NONE.
    const near = price > 0 && Math.abs(entry - price) / price < (engine === 'crypto' ? 0.01 : 0.003);
    let isTrade = (dir === 'BUY' || dir === 'SELL') && valid && near;
    let ruleNote = '';
    // Crypto is long-only (spot DeFi); its shadow SELLs went 3W/12L.
    if (engine === 'crypto' && dir === 'SELL') { isTrade = false; ruleNote = 'crypto is long-only'; }
    // The idea is recorded/traded at the LIVE price with the AI's stop and
    // target, so they must still sit on the right sides of that price and the
    // risk must stay close to what the AI planned (0.5x-1.5x).
    if (isTrade) {
      const sidesOk = dir === 'BUY' ? (sl < price && tp > price) : (sl > price && tp < price);
      const planned = Math.abs(entry - sl), actual = Math.abs(price - sl);
      const ratio = planned > 0 ? actual / planned : 0;
      if (!sidesOk) { isTrade = false; ruleNote = `stop/target on the wrong side of live price ${price}`; }
      else if (!(ratio >= 0.5 && ratio <= 1.5)) { isTrade = false; ruleNote = `risk at live price is ${ratio.toFixed(2)}x the planned risk`; }
    }
    if (isTrade && model === 'M1') {
      const why = m1Reject(sym, dir, price, sl, ctx, engine);
      if (why) { isTrade = false; ruleNote = `M1 rule: ${why}`; }
    }
    if (isTrade && model === 'M2') {
      const why = m2Reject(sym, dir, price, sl, tp, ctx, session, engine);
      if (why) { isTrade = false; ruleNote = `M2 rule: ${why}`; }
    }
    // Epoch stamp + old-block provenance ride on every decision from
    // this build onward. The stored ctx is a per-idea copy (the pair
    // ctx is shared across both models' ideas for that pair).
    const prov = decisionProvenance(model, sym, session, engine);
    const storedCtx = {
      ...ctx, epoch: MODELS_EPOCH, enrichOn: modelsEnrichOn(),
      ...(prov.wasExcludedPair ? { wasExcludedPair: true } : {}),
      ...(prov.wasBlockedSession ? { wasBlockedSession: true } : {}),
    };
    const ins = await pool.query(
      `INSERT INTO fx_model_decisions (user_id, symbol, model, mode, day_type, session, direction, entry_price, stop_loss, take_profit, confidence, setup, reasoning, context, result, engine, epoch)
       VALUES ($1,$2,$3,'shadow',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16) RETURNING id`,
      [userId, sym, model, ctx.dayType, session, isTrade ? dir : 'NONE', isTrade ? price : null, isTrade ? sl : null, isTrade ? tp : null,
        Math.max(0, Math.min(100, Math.round(Number(i?.confidence) || 0))), String(i?.setup || '').slice(0, 80), (ruleNote ? `[${ruleNote}] ` : '') + String(i?.reason || '').slice(0, 500),
        JSON.stringify(storedCtx), isTrade ? null : 'NO_TRADE', engine, MODELS_EPOCH],
    ).catch(() => null);
    // Crypto models are shadow-only for now; only FX ideas can be handed live.
    if (engine === 'fx' && isTrade && ins?.rows?.[0]?.id) {
      await maybeGoLive(userId, {
        id: ins.rows[0].id, symbol: sym, model, dayType: ctx.dayType, autoModel: ctx.autoModel, session, direction: dir,
        entry: price, stopLoss: sl, takeProfit: tp, confidence: Math.round(Number(i?.confidence) || 0),
        setup: String(i?.setup || ''), reason: String(i?.reason || ''),
      }).catch((e: any) => console.error('[fx-models] live hand-off failed (non-fatal):', e?.message || e));
    }
  }
}

/** Walk open shadow trades forward on 15m bars: TP or SL first wins; 48h expiry. */
export async function resolveShadowDecisions(engine: ModelEngine = 'fx', userId?: number): Promise<void> {
  // Rows nothing can price (token left the universe, no candles) would block
  // the oldest-first queue forever: expire them at 48h at entry price.
  await pool.query(
    `UPDATE fx_model_decisions SET result='EXPIRED', exit_price=entry_price, r_multiple=0, pips=0, resolved_at=now()
      WHERE engine = $1 AND result IS NULL AND direction IN ('BUY','SELL') AND created_at < now() - interval '50 hours'`,
    [engine === 'crypto' ? 'crypto' : 'fx'],
  ).catch(() => {});
  const { rows } = await pool.query(
    `SELECT id, symbol, direction, entry_price, stop_loss, take_profit, created_at FROM fx_model_decisions
      WHERE engine = '${engine === 'crypto' ? 'crypto' : 'fx'}' ${userId ? `AND user_id = ${Math.floor(Number(userId))}` : ''} AND result IS NULL AND direction IN ('BUY','SELL') AND created_at < now() - interval '15 minutes'
      ORDER BY created_at LIMIT 40`,
  );
  const bySym = new Map<string, any[]>();
  for (const r of rows) { const a = bySym.get(r.symbol) || []; a.push(r); bySym.set(r.symbol, a); }
  for (const [symbol, list] of Array.from(bySym.entries())) {
    let bars: any[] = [];
    try {
      bars = await barsFor(engine)(symbol, '15m', 200);
    } catch { continue; }
    if (!bars.length) continue;
    for (const r of list) {
      const t0 = new Date(r.created_at).getTime();
      const entry = Number(r.entry_price), sl = Number(r.stop_loss), tp = Number(r.take_profit);
      const risk = Math.abs(entry - sl);
      if (!(risk > 0)) continue;
      const buy = r.direction === 'BUY';
      let result: string | null = null, exit = 0;
      for (const b of bars) {
        const ts = Number(b.timestamp) < 1e12 ? Number(b.timestamp) * 1000 : Number(b.timestamp);
        if (ts < t0) continue;
        const hitSl = buy ? b.low <= sl : b.high >= sl;
        const hitTp = buy ? b.high >= tp : b.low <= tp;
        if (hitSl) { result = 'LOSS'; exit = sl; break; } // same-bar ambiguity → assume the stop (conservative)
        if (hitTp) { result = 'WIN'; exit = tp; break; }
      }
      if (!result && Date.now() - t0 > 48 * 3_600_000) {
        // Score at the 48h mark, not whenever the resolver gets to it.
        const cutoff = t0 + 48 * 3_600_000;
        const atCut = bars.filter((b) => (Number(b.timestamp) < 1e12 ? Number(b.timestamp) * 1000 : Number(b.timestamp)) <= cutoff);
        exit = Number(atCut[atCut.length - 1]?.close) || Number(bars[bars.length - 1]?.close) || entry;
        result = 'EXPIRED';
      }
      if (!result) continue;
      const move = buy ? exit - entry : entry - exit;
      await pool.query(
        `UPDATE fx_model_decisions SET result=$2, exit_price=$3, r_multiple=$4, pips=$5, resolved_at=now() WHERE id=$1 AND result IS NULL`,
        [r.id, result, exit, move / risk, engine === 'crypto' ? (entry > 0 ? (move / entry) * 100 : 0) : move / pipSize(symbol)],
      ).catch(() => {});
    }
  }
}

// ── Brain marketplace bundles (phase 3) ──────────────────────────────────
// A bundle is a frozen snapshot of a seller's RESOLVED model ideas, scoped by
// pair and optionally by model (M1/M2) and day type. Scope tokens ride in the
// listing's existing symbol_filter array as "MODEL:M1" / "DAY:range" so the
// marketplace's relist-in-place logic keeps working unchanged. Purchased rows
// are tagged source='purchased_brain': they feed the buyer's models and
// mastery, but can never be resold.
export const FX_MODEL_MIN_TO_LIST = 20;

export function parseFxModelScope(filter: string[] | null | undefined) {
  const f = (filter || []).map((x) => String(x).trim().toUpperCase()).filter(Boolean);
  const model = f.find((x) => x.startsWith('MODEL:'))?.slice(6) || null;
  const dayType = f.find((x) => x.startsWith('DAY:'))?.slice(4)?.toLowerCase() || null;
  const symbols = f.filter((x) => !x.includes(':'));
  const engine: ModelEngine = f.includes('ENGINE:CRYPTO') ? 'crypto' : 'fx';
  return { model: model === 'M1' || model === 'M2' ? model : null, dayType: ['range', 'trend', 'mixed'].includes(dayType || '') ? dayType : null, symbols, engine };
}

export interface FxModelListingProof {
  kind: 'fx_model';
  /** Model ideas are forward SHADOW decisions resolved against real prices. */
  proofType: 'shadow';
  /** The record's system epoch. New listings are always MODELS_EPOCH. */
  epoch: number;
  /** True when a stored snapshot contains any pre-current-system rows. */
  legacy: boolean;
  tradeCount: number;
  winRate: number | null;
  avgR: number | null;
  propSim: Record<'M1' | 'M2', PropSimResult>;
}

/**
 * Proof summary for a model snapshot, graded ONLY on current-system
 * (epoch-2) rows. Pure and exported so listing cards, the listing route,
 * and the check script all read the same numbers. Snapshots frozen
 * before the epoch existed have no epoch on their rows: they report
 * epoch 1 / legacy and contribute no current-system trades.
 */
export function fxModelListingProof(rows: any[]): FxModelListingProof {
  const list = Array.isArray(rows) ? rows : [];
  const current = list.filter((r: any) => Number(r?.epoch) === MODELS_EPOCH);
  const statRows = fxModelRowsForStats(current);
  const wins = statRows.filter((r: any) => r.tradeOutcome === 'WIN').length;
  const tradeCount = current.length;
  const epochs = list.map((r: any) => Number(r?.epoch)).filter((n: number) => Number.isFinite(n) && n > 0);
  const byModel: Record<'M1' | 'M2', any[]> = { M1: [], M2: [] };
  for (const r of current) { if (r?.model === 'M1' || r?.model === 'M2') byModel[r.model as 'M1' | 'M2'].push(r); }
  return {
    kind: 'fx_model',
    proofType: 'shadow',
    epoch: current.length === list.length && list.length > 0 ? MODELS_EPOCH : (epochs.length ? Math.min(...epochs) : 1),
    legacy: list.length > 0 && current.length !== list.length,
    tradeCount,
    winRate: tradeCount ? wins / tradeCount : null,
    avgR: tradeCount ? current.reduce((a: number, r: any) => a + (Number(r.r_multiple) || 0), 0) / tradeCount : null,
    propSim: { M1: propSimulate(byModel.M1), M2: propSimulate(byModel.M2) },
  };
}

/** Seller's own resolved ideas for a bundle scope + the stats the marketplace needs. */
export async function getFxModelListingRows(userId: number, filter: string[] | null | undefined): Promise<{ rows: any[]; avgR: number; masteryScore: number; level: string; epoch: number; proof: FxModelListingProof }> {
  await ensureFxModelTables();
  const { model, dayType, symbols, engine } = parseFxModelScope(filter);
  const { rows } = await pool.query(
    `SELECT symbol, model, day_type, session, direction, entry_price, stop_loss, take_profit, confidence, setup, reasoning, context,
            result, r_multiple, pips, exit_price, created_at, resolved_at, engine, epoch
       FROM fx_model_decisions
      WHERE user_id=$1 AND source='own' AND engine='${engine}' AND result IN ('WIN','LOSS','EXPIRED')
        AND epoch = ${MODELS_EPOCH}
        AND ($2::text IS NULL OR model=$2) AND ($3::text IS NULL OR day_type=$3)
        AND (cardinality($4::text[]) = 0 OR symbol = ANY($4::text[]))
      ORDER BY created_at DESC LIMIT 3000`,
    [userId, model, dayType, symbols],
  );
  const n = rows.length;
  const wins = rows.filter((r: any) => r.result === 'WIN').length;
  const avgR = n ? rows.reduce((a: number, r: any) => a + (Number(r.r_multiple) || 0), 0) / n : 0;
  const winRate = n ? wins / n : 0;
  const masteryScore = Math.round(Math.min(1, n / 150) * 50 + Math.max(0, Math.min(1, (avgR + 0.5) / 1.5)) * 50);
  return { rows, avgR, masteryScore, level: masteryLevel(n, winRate, avgR), epoch: MODELS_EPOCH, proof: fxModelListingProof(rows) };
}

/** Marketplace stat shape: EXPIRED counts as a win only if it closed in profit. */
export function fxModelRowsForStats(rows: any[]) {
  return rows.map((r) => ({
    symbol: r.symbol, confirmedAt: r.resolved_at || r.created_at,
    tradeOutcome: r.result === 'WIN' || (r.result === 'EXPIRED' && Number(r.r_multiple) > 0) ? 'WIN' : 'LOSS',
  }));
}

export interface FxModelImportProvenance {
  sellerId?: number | null;
  listingId?: number | null;
  /** How the buyer received this record: a one-time 'purchase'
   *  (permanent) or a marketplace 'subscription' (access follows the
   *  subscription — see importedSliceLiveReady). Defaults to purchase. */
  grantType?: 'purchase' | 'subscription';
}

/** The epoch an imported row keeps: current-system rows stay epoch 2;
 *  anything older (or unstamped) is imported as legacy epoch 1. */
export function fxModelImportEpoch(row: any): number {
  return Number(row?.epoch) === MODELS_EPOCH ? MODELS_EPOCH : 1;
}

/**
 * Stamp marketplace provenance onto an imported row's context. Pure —
 * the check script pins the exact shape the live-eligibility queries
 * read back (`context.marketplace.listingId`).
 */
export function stampFxModelImportContext(context: any, row: any, provenance?: FxModelImportProvenance): Record<string, any> | null {
  let base: Record<string, any> = {};
  if (context && typeof context === 'object' && !Array.isArray(context)) base = { ...context };
  else if (typeof context === 'string' && context.trim()) {
    try { const parsed = JSON.parse(context); if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) base = { ...parsed }; } catch { /* keep the row importable */ }
  }
  const listingId = Number(provenance?.listingId);
  const sellerId = Number(provenance?.sellerId);
  if (Number.isFinite(listingId) && listingId > 0) {
    base.marketplace = {
      source: 'marketplace_model',
      sellerId: Number.isFinite(sellerId) && sellerId > 0 ? sellerId : null,
      listingId,
      epoch: fxModelImportEpoch(row),
      grantType: provenance?.grantType === 'subscription' ? 'subscription' : 'purchase',
    };
  }
  return Object.keys(base).length ? base : null;
}

/** Merge a purchased bundle into the buyer's model history (never resellable). */
export async function importFxModelSnapshot(buyerId: number, snapshot: any[], provenance?: FxModelImportProvenance): Promise<number> {
  await ensureFxModelTables();
  let n = 0;
  for (const r of snapshot || []) {
    await pool.query(
      `INSERT INTO fx_model_decisions (user_id, symbol, model, mode, day_type, session, direction, entry_price, stop_loss, take_profit,
         confidence, setup, reasoning, context, result, r_multiple, pips, exit_price, resolved_at, created_at, source, engine, epoch)
       VALUES ($1,$2,$3,'purchased',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,'purchased_brain',$20,$21)`,
      [buyerId, r.symbol, r.model, r.day_type, r.session, r.direction, r.entry_price, r.stop_loss, r.take_profit, r.confidence,
        r.setup, r.reasoning, JSON.stringify(stampFxModelImportContext(r.context, r, provenance)), r.result, r.r_multiple, r.pips, r.exit_price,
        r.resolved_at ? new Date(r.resolved_at) : null, r.created_at ? new Date(r.created_at) : new Date(), r.engine === 'crypto' ? 'crypto' : 'fx',
        fxModelImportEpoch(r)],
    ).then(() => { n++; }).catch(() => {});
  }
  return n;
}

// ── Phase 4: live trading for PROVEN scopes only ─────────────────────────
// OFF by default (per user, toggled in the brain panel). When on, an idea is
// sent to the engine only if ALL hold:
//   • it is the model the day type calls for (range → M1, trend → M2)
//   • that exact slice (model × day type × pair × session) is Proficient or
//     Master AND clears the go-live bar (sliceLiveReady): 50+ resolved
//     ideas, avg R ≥ +0.2, win rate ≥ 40%, no losing week in the last two.
//     The proving record may be the user's own — or, since the marketplace
//     completion, a purchased epoch-2 record for the same slice
//     (importedSliceLiveReady; FX_MODEL_MARKETPLACE_LIVE=off disables).
//   • the model's live daily cap isn't used up (M1: 3, M2: 2 by default),
//     shared across own-proven and marketplace-proven hand-offs
// It then goes through the engine's normal processDecision path, so the
// confidence floor, cooldowns, daily caps, MTF rule (M2), news/session
// gates, risk guard, lot caps, leader check and logging all still apply.
// M1 skips only the strict H1+H4 entry rule — its own range rules replace it.
export interface FxModelSettings { live: boolean; m1DailyCap: number; m2DailyCap: number }
const DEFAULT_SETTINGS: FxModelSettings = { live: false, m1DailyCap: 3, m2DailyCap: 2 };
const LIVE_LEVELS = ['Proficient', 'Master'];

export async function getFxModelSettings(userId: number): Promise<FxModelSettings> {
  try {
    const { getRuntimeStateStrict } = await import('./runtime-state');
    const v = await getRuntimeStateStrict('fx_models', String(userId));
    return { ...DEFAULT_SETTINGS, ...(v || {}) };
  } catch {
    return { ...DEFAULT_SETTINGS }; // unreadable → live stays OFF
  }
}
export async function saveFxModelSettings(userId: number, patch: Partial<FxModelSettings>): Promise<FxModelSettings> {
  const cur = await getFxModelSettings(userId);
  const next: FxModelSettings = {
    live: typeof patch.live === 'boolean' ? patch.live : cur.live,
    m1DailyCap: clampInt(patch.m1DailyCap ?? cur.m1DailyCap, 0, 5),
    m2DailyCap: clampInt(patch.m2DailyCap ?? cur.m2DailyCap, 0, 5),
  };
  const { pool: p } = await import('../db');
  const { ensureRuntimeStateTable } = await import('./runtime-state');
  await ensureRuntimeStateTable();
  await p.query(
    `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ('fx_models', $1, $2::jsonb, now())
     ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [String(userId), JSON.stringify(next)],
  );
  return next;
}
function clampInt(n: any, lo: number, hi: number) { const x = Math.round(Number(n)); return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : lo; }

// ── Go-live bar (tightened 2026-10-21, user decision) ─────────────────────
// "Proficient" alone (50+ ideas, avg R > 0) can be luck. A slice must ALSO
// have avg R ≥ +0.2, win rate ≥ 40%, and no losing week in its last two
// calendar weeks (each week with resolved ideas must sum to ≥ 0R).
const GO_LIVE = { minTrades: 50, minAvgR: 0.2, minWinRate: 0.4 };

/**
 * The non-DB half of the go-live bar, graded on promotionStats (epoch-2
 * record while the epoch is on). Pure and exported for the check script.
 * NOTE: there is deliberately NO pair/session block here — under the
 * lifts a formerly excluded pair or blocked session becomes eligible
 * exactly this way, by clearing the same bar as everything else.
 */
export function sliceMeetsBar(s: any): boolean {
  const p = promotionStats(s);
  if (!LIVE_LEVELS.includes(p.level)) return false;
  return p.trades >= GO_LIVE.minTrades && p.avgR >= GO_LIVE.minAvgR && p.winRate >= GO_LIVE.minWinRate;
}

export async function sliceLiveReady(userId: number, s: any): Promise<boolean> {
  if (!sliceMeetsBar(s)) return false;
  const { rows } = await pool.query(
    `SELECT date_trunc('week', created_at) AS wk, SUM(r_multiple)::float AS r
       FROM fx_model_decisions
      WHERE user_id=$1 AND engine='fx' AND source='own' AND result IN ('WIN','LOSS','EXPIRED')
        AND model=$2 AND day_type=$3 AND symbol=$4 AND session=$5
        ${modelsEpochOn() ? `AND epoch = ${MODELS_EPOCH}` : ''}
        AND created_at >= date_trunc('week', now()) - interval '7 days'
      GROUP BY 1`,
    [userId, s.model, s.dayType, s.symbol, s.session],
  );
  return rows.every((r: any) => Number(r.r) >= 0);
}

/**
 * The non-DB half of the PURCHASED-slice bar: exactly the own-slice bar
 * (sliceMeetsBar, graded on the imported record's epoch stats), plus
 * marketplace provenance — the slice must come from a known listing,
 * must be a current-system (epoch-2) record, and the marketplace live
 * path must not be killed. Pure and exported for the check script.
 */
export function importedSliceMeetsBar(s: any): boolean {
  if (!fxModelMarketplaceLiveOn()) return false;
  if (!s || s.source !== 'marketplace_model' || s.legacy) return false;
  if (!(Number(s.listingId) > 0)) return false;
  if (Number(s.recordEpoch ?? s.epoch) !== MODELS_EPOCH) return false;
  return sliceMeetsBar(s);
}

/** Full purchased-slice readiness: the bar above + no losing week in
 *  the last two calendar weeks, graded on the imported rows of THIS
 *  listing only (mirrors sliceLiveReady's window for own slices). */
export async function importedSliceLiveReady(userId: number, s: any): Promise<boolean> {
  if (!importedSliceMeetsBar(s)) return false;
  // Subscription-granted records are rented, not owned: the slice only
  // qualifies while the buyer's subscription to that listing is in its
  // access window (active, retry grace, or cancelled-but-paid-through).
  // One-time purchases carry grantType 'purchase' and never hit this.
  if (s?.grantType === 'subscription') {
    const subs = await import('./marketplace-subscriptions');
    if (!subs.subscriptionsEnabled()) return false;
    if (!(await subs.hasMarketplaceSubscriptionAccess(userId, Number(s.listingId)))) return false;
  }
  const { rows } = await pool.query(
    `SELECT date_trunc('week', created_at) AS wk, SUM(r_multiple)::float AS r
       FROM fx_model_decisions
      WHERE user_id=$1 AND engine='fx' AND source='purchased_brain' AND epoch = ${MODELS_EPOCH}
        AND model=$2 AND day_type=$3 AND symbol=$4 AND session=$5
        AND context->'marketplace'->>'listingId' = $6
        AND created_at >= date_trunc('week', now()) - interval '7 days'
        AND result IN ('WIN','LOSS','EXPIRED')
      GROUP BY 1`,
    [userId, s.model, s.dayType, s.symbol, s.session, String(s.listingId)],
  );
  return rows.every((r: any) => Number(r.r) >= 0);
}

/**
 * Convert a subscription-granted import into a permanent purchase
 * grant, in place: called by the buy route when a buyer who previously
 * SUBSCRIBED to a listing now buys it outright. Rows keep their record
 * (nothing is re-imported); only the grant marker changes, so
 * importedSliceLiveReady stops consulting subscription state.
 */
export async function upgradeFxModelSubscriptionGrants(buyerId: number, listingId: number): Promise<number> {
  await ensureFxModelTables();
  const r = await pool.query(
    `UPDATE fx_model_decisions
        SET context = jsonb_set(context, '{marketplace,grantType}', '"purchase"')
      WHERE user_id=$1 AND engine='fx' AND source='purchased_brain'
        AND context->'marketplace'->>'listingId' = $2
        AND context->'marketplace'->>'grantType' = 'subscription'`,
    [buyerId, String(listingId)],
  ).catch(() => ({ rowCount: 0 }));
  return r.rowCount ?? 0;
}

/** Provenance recorded on a live trade that a purchased slice unlocked. */
export function fxModelProvenanceForSlice(s: any): { source: 'marketplace_model'; sellerId: number | null; listingId: number } {
  return {
    source: 'marketplace_model',
    sellerId: Number(s?.sellerId) > 0 ? Number(s.sellerId) : null,
    listingId: Number(s?.listingId),
  };
}

/** The buyer's per-model daily cap (M1 3 / M2 2 by default). One cap is
 *  shared by own-proven and marketplace-proven hand-offs alike: the
 *  count maybeGoLive claims against is every live/live_pending model
 *  decision the buyer has today, whichever record unlocked it. */
export function fxModelDailyCap(model: ModelId, settings: FxModelSettings): number {
  const raw = model === 'M1' ? settings?.m1DailyCap : settings?.m2DailyCap;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n > 0 ? n : 0;
}
export function fxModelDailyCapAllows(claimsToday: number, model: ModelId, settings: FxModelSettings): boolean {
  return Number(claimsToday) < fxModelDailyCap(model, settings);
}

/** Which live-eligible slices exist right now (for the panel). */
export async function liveEligibleSlices(userId: number): Promise<any[]> {
  const m = await getModelMastery(userId, { ownOnly: true });
  const out: any[] = [];
  for (const s of m.slices) if (await sliceLiveReady(userId, s)) out.push(s);
  if (fxModelMarketplaceLiveOn()) {
    for (const s of m.importedSlices) if (await importedSliceLiveReady(userId, s)) out.push(s);
  }
  return out;
}

export async function maybeGoLive(userId: number, idea: {
  id: number; symbol: string; model: ModelId; dayType: DayType; autoModel: ModelId; session: string; direction: string;
  entry: number; stopLoss: number; takeProfit: number; confidence: number; setup: string; reason: string;
}): Promise<void> {
  const settings = await getFxModelSettings(userId);
  if (!settings.live) return;
  if (idea.model !== idea.autoModel) return; // only the model the day type calls for
  // Live eligibility: the user's OWN record first (as always). Since the
  // marketplace completion, a PURCHASED current-system slice that clears
  // the same bar can also qualify the buyer's own new idea — the idea
  // itself is always the buyer's, made now, and it still passes every
  // gate below and in the engine. Kill switch FX_MODEL_MARKETPLACE_LIVE
  // =off restores the own-only rule exactly.
  const mastery = await getModelMastery(userId, { ownOnly: true });
  const matches = (s: any) => s.model === idea.model && s.dayType === idea.dayType && s.symbol === idea.symbol && s.session === idea.session;
  const ownSlice = mastery.slices.find(matches);
  const ownReady = !!ownSlice && await sliceLiveReady(userId, ownSlice);
  const importedSlice = ownReady ? null : (mastery.importedSlices || []).find(matches) || null;
  const importedReady = !!importedSlice && await importedSliceLiveReady(userId, importedSlice);
  if (!ownReady && !importedReady) return;
  const slice: any = ownReady ? ownSlice : importedSlice;
  const provenance = importedReady ? fxModelProvenanceForSlice(importedSlice) : null;
  const cap = fxModelDailyCap(idea.model, settings);
  // Shared-cap precheck (the atomic claim below is the authority): the
  // count is ALL of today's live/live_pending decisions for this model,
  // own-proven and marketplace-proven alike — neither path gets its own
  // allowance.
  const { rows: usedRows } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM fx_model_decisions WHERE user_id=$1 AND model=$2 AND mode IN ('live','live_pending') AND created_at >= date_trunc('day', now())`,
    [userId, idea.model],
  ).catch(() => ({ rows: [{ n: 0 }] as any[] }));
  if (!fxModelDailyCapAllows(Number(usedRows[0]?.n) || 0, idea.model, settings)) return;
  // Claim a cap slot atomically (per-user advisory lock serialises claims).
  const client = await pool.connect();
  let claimed = false;
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(918273700, $1)', [userId]);
    const { rows } = await client.query(
      `SELECT COUNT(*)::int AS n FROM fx_model_decisions WHERE user_id=$1 AND model=$2 AND mode IN ('live','live_pending') AND created_at >= date_trunc('day', now())`,
      [userId, idea.model],
    );
    if (Number(rows[0]?.n) < cap) {
      await client.query(`UPDATE fx_model_decisions SET mode='live_pending' WHERE id=$1`, [idea.id]);
      claimed = true;
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
  if (!claimed) return;
  const stats = promotionStats(slice);
  const { submitFxModelTrade } = await import('./live-trading-engine');
  const placed = await submitFxModelTrade(userId, {
    model: idea.model, symbol: idea.symbol, direction: idea.direction, confidence: idea.confidence,
    entryPrice: idea.entry, stopLoss: idea.stopLoss, takeProfit: idea.takeProfit,
    reason: `${idea.model === 'M1' ? 'Model 1 · Range' : 'Model 2 · Trend'} [${stats.level}, ${stats.trades} current-system ideas, ${(stats.winRate * 100).toFixed(0)}% WR, ${stats.avgR >= 0 ? '+' : ''}${stats.avgR.toFixed(2)}R]${provenance ? ` [Marketplace model · listing #${provenance.listingId}${provenance.sellerId ? ` · seller #${provenance.sellerId}` : ''}]` : ''} ${idea.setup}: ${idea.reason}`.slice(0, 500),
  }).catch(() => false);
  // Only a trade the engine actually placed uses the cap; otherwise release it.
  await pool.query(`UPDATE fx_model_decisions SET mode=$2 WHERE id=$1`, [idea.id, placed ? 'live' : 'shadow']).catch(() => {});
  // A placed marketplace-proven trade carries its provenance on the
  // decision record itself, so the journal/ABBA can always answer
  // "which purchased record unlocked this trade?"
  if (placed && provenance) {
    await pool.query(
      `UPDATE fx_model_decisions SET context = COALESCE(context, '{}'::jsonb) || $2::jsonb WHERE id=$1`,
      [idea.id, JSON.stringify({ marketplaceProvenance: provenance })],
    ).catch(() => {});
  }
}

// ── Crypto engine cycle (shadow only) ─────────────────────────────────────
// Called once per crypto scan (worker/cron). Computes each token's day type
// from its own candles, records it, and once per H1 candle per token asks
// both models for their idea. Ideas resolve on the same candles.
const emaLast = (xs: number[], n: number) => { if (xs.length < n) return NaN; const k = 2 / (n + 1); let e = xs.slice(0, n).reduce((a, c) => a + c, 0) / n; for (const x of xs.slice(n)) e = x * k + e * (1 - k); return e; };
function barTrend(bars: ModelBar[]): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const c = bars.map((b) => Number(b.close));
  const e20 = emaLast(c, 20), e50 = emaLast(c, 50), last = c[c.length - 1];
  if (!(e20 > 0) || !(e50 > 0)) return 'NEUTRAL';
  if (e20 > e50 && last > e20) return 'BULLISH';
  if (e20 < e50 && last < e20) return 'BEARISH';
  return 'NEUTRAL';
}
function adx14(bars: ModelBar[]): number | null {
  if (bars.length < 30) return null;
  let tr = 0, pdm = 0, mdm = 0; const dxs: number[] = [];
  for (let i = 1; i < bars.length; i++) {
    const h = bars[i].high, l = bars[i].low, pc = bars[i - 1].close;
    const up = h - bars[i - 1].high, dn = bars[i - 1].low - l;
    const t = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    tr = tr - tr / 14 + t; pdm = pdm - pdm / 14 + (up > dn && up > 0 ? up : 0); mdm = mdm - mdm / 14 + (dn > up && dn > 0 ? dn : 0);
    if (i >= 14 && tr > 0) { const pdi = (100 * pdm) / tr, mdi = (100 * mdm) / tr; dxs.push(pdi + mdi > 0 ? (100 * Math.abs(pdi - mdi)) / (pdi + mdi) : 0); }
  }
  const last = dxs.slice(-14);
  return last.length ? last.reduce((a, c) => a + c, 0) / last.length : null;
}

export async function runCryptoModelsCycle(userId: number, symbols: string[]): Promise<void> {
  if (process.env.CRYPTO_MODELS_SHADOW === 'off') return;
  // Crypto day types change slowly: run every N hours (default 2) to halve AI cost.
  let _lvlEvery = 2;
  try { _lvlEvery = (await (await import('./ai-level')).getAiLevel(userId)).cryptoModelsEveryH; } catch { /* default */ }
  const everyH = Math.max(1, Number(process.env.CRYPTO_MODELS_EVERY_HOURS ?? _lvlEvery));
  if (new Date().getUTCHours() % everyH !== 0) { await resolveShadowDecisions('crypto', userId).catch(() => {}); return; }
  try {
    await ensureFxModelTables();
    const fetchBars = barsFor('crypto');
    const now = new Date();
    const session = sessionFor(now);
    const day = now.toISOString().slice(0, 10);
    const hour = now.getUTCHours();
    const candle = Math.floor(now.getTime() / 3_600_000);
    const maxTokens = Math.max(1, Number(process.env.CRYPTO_MODELS_MAX_TOKENS ?? 8));
    const pairs: Array<{ symbol: string; ctx: any }> = [];
    // The crypto scan runs as a short-lived cron process, so "already asked
    // this hour" must come from the DB, not memory (else an AI call every run).
    // An hour's attempt is marked by its regime row (written before the AI
    // call), so a failed/unparseable AI pass is not retried every cron run.
    const done = new Set<string>((await pool.query(
      `SELECT DISTINCT symbol FROM fx_day_regimes WHERE engine='crypto' AND user_id=$1 AND day = (now() at time zone 'utc')::date AND hour_utc = extract(hour from now() at time zone 'utc')`, [userId],
    ).catch(() => ({ rows: [] as any[] }))).rows.map((r: any) => String(r.symbol)));
    const perRun = Math.max(1, Number(process.env.CRYPTO_MODELS_PER_RUN ?? 3)); // spread candle load over the hour
    let fetched = 0;
    for (const symbol of symbols.slice(0, maxTokens)) {
      const key = `crypto|${userId}|${symbol}`;
      if (done.has(symbol.toUpperCase()) || lastShadowCandle.get(key) === candle) continue; // once per H1 candle per token
      if (fetched >= perRun) break;
      fetched++;
      let h1: ModelBar[] = [], h4: ModelBar[] = [];
      try { h1 = (await fetchBars(symbol, '1h', 80)).slice(0, -1); h4 = (await fetchBars(symbol, '4h', 80)).slice(0, -1); } catch { continue; }
      if (h1.length < 55) continue;
      const price = Number(h1[h1.length - 1].close);
      const vols = h1.map((b) => Number(b.volume) || 0);
      const avgVol = vols.slice(-21, -1).reduce((a, c) => a + c, 0) / 20;
      const relVolume = avgVol > 0 ? vols[vols.length - 1] / avgVol : null;
      const adx = adx14(h1);
      const t1 = barTrend(h1), t4 = h4.length >= 55 ? barTrend(h4) : 'NEUTRAL';
      const cls = classifyDayType({ adx, relVolume, h1: t1, h4: t4, session });
      const features: Record<string, any> = { price, adx, relVolume, h1: { trend: t1 }, h4: { trend: t4 } };
      if (modelsEnrichOn()) {
        // Same enrichment as the FX cycle, from what crypto has: Markov from
        // the cached matrix (last confirmed H1 bar as the state candle) and
        // D1 from its own candles. No volume-profile feed exists in this
        // cycle, so the field is present but null; ORB is FX-only.
        const lastH1 = h1[h1.length - 1];
        features.volumeProfile = null;
        features.markov = compactMarkov(symbol, lastH1 ? { open: Number(lastH1.open), close: Number(lastH1.close) } : null);
        const d1 = await d1Features(symbol, 'crypto', price).catch(() => null);
        features.d1 = d1;
        const alt = altClassifyD1H1({ adx, relVolume, d1: d1?.trend, h1: t1, session });
        features.regimeAlt = { basis: 'D1/H1', dayType: alt.dayType, autoModel: alt.autoModel, score: alt.score };
      }
      await pool.query(
        `INSERT INTO fx_day_regimes (user_id, symbol, day, hour_utc, session, day_type, auto_model, trend_score, adx_m15, rel_volume, atr, h1_trend, h4_trend, features, engine)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NULL,$11,$12,$13::jsonb,'crypto')
         ON CONFLICT (user_id, symbol, day, hour_utc) DO UPDATE SET day_type=EXCLUDED.day_type, auto_model=EXCLUDED.auto_model, trend_score=EXCLUDED.trend_score,
           adx_m15=EXCLUDED.adx_m15, rel_volume=EXCLUDED.rel_volume, h1_trend=EXCLUDED.h1_trend, h4_trend=EXCLUDED.h4_trend, features=EXCLUDED.features, engine='crypto'`,
        [userId, symbol, day, hour, session, cls.dayType, cls.autoModel, cls.score, num(adx), num(relVolume), t1, t4, JSON.stringify(features)],
      ).catch(() => {});
      lastShadowCandle.set(key, candle);
      pairs.push({ symbol, ctx: { ...features, dayType: cls.dayType, autoModel: cls.autoModel, trendScore: cls.score } });
    }
    if (pairs.length) await shadowDecide(userId, session, pairs, 'crypto');
    await resolveShadowDecisions('crypto', userId); // this user's candles/chain only
  } catch (e: any) {
    console.error('[crypto-models] cycle failed (non-fatal):', e?.message || e);
  }
}

export function masteryLevel(trades: number, winRate: number, avgR: number): string {
  if (trades < 20) return 'Learning';
  if (trades < 50) return avgR > 0 ? 'Developing' : 'Developing (negative)';
  if (trades < 150) return avgR > 0 ? 'Proficient' : 'Unproven';
  return avgR > 0.2 && winRate >= 0.45 ? 'Master' : avgR > 0 ? 'Proficient' : 'Unproven';
}

/** Per model × day type × pair × session: data volume, accuracy, expectancy, level. */
export async function getModelMastery(userId: number, opts: { ownOnly?: boolean; engine?: ModelEngine } = {}): Promise<{ models: any[]; slices: any[]; importedSlices: any[]; propSim: Record<'M1' | 'M2', PropSimResult> }> {
  const _eng = opts.engine === 'crypto' ? 'crypto' : 'fx';
  await ensureFxModelTables();
  const agg = async (group: string) => (await pool.query(
    `SELECT ${group}, COUNT(*)::int AS trades,
            COUNT(*) FILTER (WHERE result='WIN')::int AS wins,
            COALESCE(AVG(r_multiple),0)::float AS avg_r,
            COALESCE(SUM(r_multiple),0)::float AS total_r,
            COUNT(*) FILTER (WHERE epoch = ${MODELS_EPOCH})::int AS epoch_trades,
            COUNT(*) FILTER (WHERE epoch = ${MODELS_EPOCH} AND result='WIN')::int AS epoch_wins,
            COALESCE(AVG(r_multiple) FILTER (WHERE epoch = ${MODELS_EPOCH}),0)::float AS epoch_avg_r,
            COALESCE(SUM(r_multiple) FILTER (WHERE epoch = ${MODELS_EPOCH}),0)::float AS epoch_total_r
       FROM fx_model_decisions
      WHERE user_id=$1 AND engine='${_eng}' AND result IN ('WIN','LOSS','EXPIRED') AND source <> 'guard_block'${opts.ownOnly ? " AND source='own'" : ''}
      GROUP BY ${group} ORDER BY trades DESC`, [userId])).rows;
  const shape = (r: any) => {
    const winRate = r.trades ? r.wins / r.trades : 0;
    const epochWinRate = r.epoch_trades ? r.epoch_wins / r.epoch_trades : 0;
    // Mastery score 0-100: half data volume (caps at 150 trades), half accuracy-adjusted expectancy.
    const dataPart = Math.min(1, r.trades / 150) * 50;
    const edgePart = Math.max(0, Math.min(1, (r.avg_r + 0.5) / 1.5)) * 50;
    const allTimeLevel = masteryLevel(r.trades, winRate, r.avg_r);
    const epochLevel = masteryLevel(r.epoch_trades, epochWinRate, r.epoch_avg_r);
    return {
      model: r.model, dayType: r.day_type, symbol: r.symbol, session: r.session,
      trades: r.trades, wins: r.wins, winRate, avgR: r.avg_r, totalR: r.total_r,
      masteryScore: Math.round(dataPart + edgePart),
      // `level` is the PROMOTION level: epoch-filtered while the epoch is
      // on (allTimeLevel keeps the all-time figure for display).
      level: modelsEpochOn() ? epochLevel : allTimeLevel,
      allTimeLevel, epochLevel,
      epochTrades: r.epoch_trades, epochWins: r.epoch_wins, epochWinRate, epochAvgR: r.epoch_avg_r, epochTotalR: r.epoch_total_r,
      // Provenance: this slice's pair was on the model's formerly
      // excluded list (its record may include formerly blocked sessions
      // too — see wasBlockedSession on individual decisions).
      wasExcludedPair: isExcludedPair(r.model, r.symbol, _eng),
    };
  };
  // Purchased model records, grouped by the listing they came from —
  // one seller's snapshot is graded as its own slice set, never blended
  // with another purchase. Rows whose snapshot predates the current
  // system (epoch < 2) or carries no listing provenance are `legacy`
  // and can never qualify a buyer for live trading.
  const importedAgg = _eng === 'fx' ? (await pool.query(
    `SELECT model, day_type, symbol, session,
            context->'marketplace'->>'listingId' AS listing_id,
            context->'marketplace'->>'sellerId' AS seller_id,
            MAX(context->'marketplace'->>'grantType') AS grant_type,
            MIN(epoch)::int AS min_epoch, MAX(epoch)::int AS max_epoch,
            COUNT(*)::int AS trades,
            COUNT(*) FILTER (WHERE result='WIN')::int AS wins,
            COALESCE(AVG(r_multiple),0)::float AS avg_r,
            COALESCE(SUM(r_multiple),0)::float AS total_r,
            COUNT(*) FILTER (WHERE epoch = ${MODELS_EPOCH})::int AS epoch_trades,
            COUNT(*) FILTER (WHERE epoch = ${MODELS_EPOCH} AND result='WIN')::int AS epoch_wins,
            COALESCE(AVG(r_multiple) FILTER (WHERE epoch = ${MODELS_EPOCH}),0)::float AS epoch_avg_r,
            COALESCE(SUM(r_multiple) FILTER (WHERE epoch = ${MODELS_EPOCH}),0)::float AS epoch_total_r
       FROM fx_model_decisions
      WHERE user_id=$1 AND engine='fx' AND result IN ('WIN','LOSS','EXPIRED') AND source='purchased_brain'
      GROUP BY model, day_type, symbol, session, listing_id, seller_id ORDER BY trades DESC`, [userId]).catch(() => ({ rows: [] as any[] }))).rows : [];
  const importedSlices = importedAgg.map((r: any) => {
    const listingId = Number(r.listing_id) > 0 ? Number(r.listing_id) : null;
    const recordEpoch = Number(r.min_epoch) === Number(r.max_epoch) ? Number(r.min_epoch) : null;
    return {
      ...shape(r),
      source: 'marketplace_model',
      sellerId: Number(r.seller_id) > 0 ? Number(r.seller_id) : null,
      listingId,
      recordEpoch,
      // 'subscription' when ANY row of this listing's record is still
      // rented (a later one-time purchase upgrades rows to 'purchase';
      // MAX() picks 'subscription' over 'purchase' alphabetically, so a
      // partially-upgraded record stays gated until fully converted).
      grantType: r.grant_type === 'subscription' ? 'subscription' : 'purchase',
      legacy: !(recordEpoch === MODELS_EPOCH && listingId != null),
    };
  });
  // Prop-firm simulation over the CURRENT system's own resolved record
  // (epoch-filtered while the epoch is on; all-time when it is off).
  // Formerly blocked pairs/sessions are included — it is a report on the
  // shadow record, not a live path.
  const simRows = (await pool.query(
    `SELECT model, day_type, symbol, session, confidence, r_multiple, created_at, resolved_at
       FROM fx_model_decisions
      WHERE user_id=$1 AND engine='${_eng}' AND source='own' AND result IN ('WIN','LOSS','EXPIRED')
        ${modelsEpochOn() ? `AND epoch = ${MODELS_EPOCH}` : ''}
      ORDER BY COALESCE(resolved_at, created_at), created_at`, [userId]).catch(() => ({ rows: [] as any[] }))).rows;
  const byModel: Record<string, any[]> = { M1: [], M2: [] };
  for (const r of simRows) { if (byModel[r.model]) byModel[r.model].push(r); }
  return {
    models: (await agg('model')).map(shape),
    slices: (await agg('model, day_type, symbol, session')).map(shape),
    importedSlices,
    propSim: { M1: propSimulate(byModel.M1), M2: propSimulate(byModel.M2) },
  };
}
