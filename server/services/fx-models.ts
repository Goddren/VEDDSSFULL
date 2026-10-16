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
// ─────────────────────────────────────────────────────────────────────────────

import { pool } from '../db';
import { marketDataService } from '../market-data/service';

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
      const features = {
        price: a?.currentPrice ?? snap.price, m15Trend: snap.trend, rsi: snap.rsi, adx: snap.adx, plusDI: snap.plusDI, minusDI: snap.minusDI,
        atr: snap.atr, relVolume: snap.relativeVolume, volumeTrend: snap.volumeTrend,
        h1: h1 ? { trend: h1.trend, bos: h1.bosChoch?.detected ? h1.bosChoch.description : null, pd: h1.premiumDiscount?.zone, wyckoff: h1.wyckoff?.detected ? h1.wyckoff.phase : null } : null,
        h4: h4 ? { trend: h4.trend, bos: h4.bosChoch?.detected ? h4.bosChoch.description : null, pd: h4.premiumDiscount?.zone, wyckoff: h4.wyckoff?.detected ? h4.wyckoff.phase : null } : null,
        signals: a?.signals ?? a?.strategySignals ?? undefined,
      };
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

    if (pairs.length) await shadowDecide(userId, session, pairs);
    if (Date.now() - lastResolveAt > 15 * 60_000) { lastResolveAt = Date.now(); await resolveShadowDecisions(); }
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
//   • compression: Bollinger width in the bottom half of its recent history
//   • price at an edge (outer 20% of the box), fading back toward the middle
//   • best trigger: a liquidity sweep / false break (wick through the edge,
//     close back inside) — the stop goes beyond the sweep wick
//   • first target the range middle; R:R to the middle at least 1.0
//   • no fades against a trending H4, no M1 on pairs that rarely range
const M1_PAIRS_EXCLUDED = (process.env.FX_M1_EXCLUDED_PAIRS || 'GBPJPY,XAUUSD,BTCUSD,US30,NAS100').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
const rangeCache = new Map<string, { at: number; data: any }>();

export async function rangeFeatures(symbol: string): Promise<any | null> {
  const hit = rangeCache.get(symbol);
  if (hit && Date.now() - hit.at < 30 * 60_000) return hit.data;
  let bars: any[] = [];
  try {
    const r = await marketDataService.fetchMarketData({ symbol, assetType: marketDataService.detectAssetType(symbol), timeframe: '1h', limit: 72 });
    bars = (r?.bars || []).slice(0, -1); // confirmed bars only
  } catch { return null; }
  if (bars.length < 30) return null;
  const ts = (b: any) => (Number(b.timestamp) < 1e12 ? Number(b.timestamp) * 1000 : Number(b.timestamp));
  const box = bars.slice(-24);
  const hi = Math.max(...box.map((b) => b.high)), lo = Math.min(...box.map((b) => b.low));
  const width = hi - lo;
  if (!(width > 0)) return null;
  const tol = width * 0.1;
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
  // Prior UTC day and today's Asian session (00:00–07:00 UTC) highs/lows.
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const prevDay = bars.filter((b) => ts(b) >= t0 - 86_400_000 && ts(b) < t0);
  const asian = bars.filter((b) => ts(b) >= t0 && ts(b) < t0 + 7 * 3_600_000);
  const data = {
    rangeHigh: hi, rangeLow: lo, rangeMid: (hi + lo) / 2, widthPips: width / pipSize(symbol),
    touchesHigh, touchesLow, positionInRangePct: Math.round(posPct), bbWidthPercentile: bbPct,
    sweepHigh, sweepLow,
    prevDayHigh: prevDay.length ? Math.max(...prevDay.map((b) => b.high)) : null,
    prevDayLow: prevDay.length ? Math.min(...prevDay.map((b) => b.low)) : null,
    asianHigh: asian.length ? Math.max(...asian.map((b) => b.high)) : null,
    asianLow: asian.length ? Math.min(...asian.map((b) => b.low)) : null,
    qualifies: touchesHigh >= 2 && touchesLow >= 2 && bbPct <= 50,
  };
  rangeCache.set(symbol, { at: Date.now(), data });
  return data;
}

/** Server-side Model 1 rules. Returns null when the idea passes, else the reason it fails. */
export function m1Reject(symbol: string, dir: string, entry: number, sl: number, ctx: any): string | null {
  const r = ctx?.range;
  if (M1_PAIRS_EXCLUDED.includes(symbol)) return `${symbol} excluded from range model`;
  if (!r) return 'range data unavailable';
  if (!r.qualifies) return `no qualified range (touches ${r.touchesHigh}/${r.touchesLow}, BB width pct ${r.bbWidthPercentile})`;
  const atTop = r.positionInRangePct >= 80, atBottom = r.positionInRangePct <= 20;
  if (dir === 'SELL' && !atTop) return `SELL not at range top (${r.positionInRangePct}%)`;
  if (dir === 'BUY' && !atBottom) return `BUY not at range bottom (${r.positionInRangePct}%)`;
  const h4 = ctx?.h4?.trend;
  if ((dir === 'SELL' && h4 === 'BULLISH') || (dir === 'BUY' && h4 === 'BEARISH')) return `fading a trending H4 (${h4})`;
  const risk = Math.abs(entry - sl);
  const toMid = Math.abs(r.rangeMid - entry);
  if (!(risk > 0) || toMid / risk < 1) return `R:R to range middle ${(toMid / (risk || 1)).toFixed(2)} < 1`;
  return null;
}

async function shadowDecide(userId: number, session: string, pairs: Array<{ symbol: string; ctx: any }>): Promise<void> {
  try {
    const { fxShouldPauseForCredits } = await import('./ai-budget-guard');
    if (fxShouldPauseForCredits()) return;
  } catch { /* guard unavailable: continue */ }
  let ai: any;
  try {
    const { getUniversalAIClientForUser } = await import('../openai');
    ai = await getUniversalAIClientForUser(userId);
  } catch { return; }

  for (const p of pairs) p.ctx.range = await rangeFeatures(p.symbol).catch(() => null);
  const mastery = await getModelMastery(userId).catch(() => null);
  const masteryLines = (mastery?.slices || []).filter((m: any) => m.trades >= 5).slice(0, 20)
    .map((m: any) => `${m.model} ${m.dayType} ${m.symbol} ${m.session}: ${m.trades} trades, WR ${(m.winRate * 100).toFixed(0)}%, avg ${m.avgR.toFixed(2)}R (${m.level})`).join('\n');

  const prompt = `You run TWO FX trading models side by side. For EACH pair below, say what each model would trade RIGHT NOW (or NONE).

MODEL 1 (range / low-volume days) — only when ctx.range.qualifies is true:
  • Trade ONLY at an edge: SELL when positionInRangePct >= 80, BUY when <= 20. Never the middle.
  • Best trigger is a liquidity sweep (sweepHigh/sweepLow true: wick through the edge, close back inside). Also valid: rejection at prevDay/Asian high/low that sits on the edge, RSI stretched at the edge.
  • Stop beyond the sweep wick / range edge plus a small buffer. First target = rangeMid (must be >= 1.0R), runner to the opposite edge.
  • Never fade a trending H4, never trade a range during London open (07:00-08:00 UTC) or NY open (12:30-13:30 UTC) when breakouts start, max 1-3 trades a day.
  • If the range does not qualify, Model 1 says NONE.
MODEL 2 (trend / volume days): trade only in the H4+H1 direction — breakouts with volume or pullbacks to structure in London/New York. Target 2-4R, stop beyond the last H1 swing. Skip if H4 and H1 disagree.
Both models use every input: trend, ADX/DI, RSI, volume, BOS/CHOCH, Wyckoff, premium/discount, session and the day type. Reason toward the best risk-adjusted trade of the day; NONE is a valid, often correct answer.

Session: ${session}
${masteryLines ? `Your own track record so far (use it — lean on what has worked, avoid what has not):\n${masteryLines}\n` : ''}
PAIRS:
${pairs.map((p) => `${p.symbol}: ${JSON.stringify(p.ctx)}`).join('\n')}

Respond ONLY with JSON:
{"ideas":[{"symbol":"EURUSD","model":"M1","direction":"BUY|SELL|NONE","entry":1.0,"stopLoss":1.0,"takeProfit":1.0,"confidence":0-100,"setup":"short name","reason":"one sentence"}]}
Give exactly one M1 and one M2 entry per pair.`;

  let content = '';
  try {
    const resp = await ai.chat.completions.create({
      model: ai.defaultModel || 'gpt-4o-mini',
      messages: [{ role: 'system', content: 'You are a disciplined FX analyst. Valid JSON only.' }, { role: 'user', content: prompt }],
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
    const near = price > 0 && Math.abs(entry - price) / price < 0.003;
    let isTrade = (dir === 'BUY' || dir === 'SELL') && valid && near;
    let ruleNote = '';
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
      const why = m1Reject(sym, dir, price, sl, ctx);
      if (why) { isTrade = false; ruleNote = `M1 rule: ${why}`; }
    }
    if (isTrade && model === 'M2') {
      const want = dir === 'BUY' ? 'BULLISH' : 'BEARISH';
      if (ctx?.h1?.trend !== want || ctx?.h4?.trend !== want) { isTrade = false; ruleNote = `M2 rule: H1 ${ctx?.h1?.trend ?? 'n/a'} / H4 ${ctx?.h4?.trend ?? 'n/a'} not both ${want}`; }
    }
    const ins = await pool.query(
      `INSERT INTO fx_model_decisions (user_id, symbol, model, mode, day_type, session, direction, entry_price, stop_loss, take_profit, confidence, setup, reasoning, context, result)
       VALUES ($1,$2,$3,'shadow',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14) RETURNING id`,
      [userId, sym, model, ctx.dayType, session, isTrade ? dir : 'NONE', isTrade ? price : null, isTrade ? sl : null, isTrade ? tp : null,
        Math.max(0, Math.min(100, Math.round(Number(i?.confidence) || 0))), String(i?.setup || '').slice(0, 80), (ruleNote ? `[${ruleNote}] ` : '') + String(i?.reason || '').slice(0, 500),
        JSON.stringify(ctx), isTrade ? null : 'NO_TRADE'],
    ).catch(() => null);
    if (isTrade && ins?.rows?.[0]?.id) {
      await maybeGoLive(userId, {
        id: ins.rows[0].id, symbol: sym, model, dayType: ctx.dayType, autoModel: ctx.autoModel, session, direction: dir,
        entry: price, stopLoss: sl, takeProfit: tp, confidence: Math.round(Number(i?.confidence) || 0),
        setup: String(i?.setup || ''), reason: String(i?.reason || ''),
      }).catch((e: any) => console.error('[fx-models] live hand-off failed (non-fatal):', e?.message || e));
    }
  }
}

/** Walk open shadow trades forward on 15m bars: TP or SL first wins; 48h expiry. */
export async function resolveShadowDecisions(): Promise<void> {
  const { rows } = await pool.query(
    `SELECT id, symbol, direction, entry_price, stop_loss, take_profit, created_at FROM fx_model_decisions
      WHERE result IS NULL AND direction IN ('BUY','SELL') AND created_at < now() - interval '15 minutes'
      ORDER BY created_at LIMIT 40`,
  );
  const bySym = new Map<string, any[]>();
  for (const r of rows) { const a = bySym.get(r.symbol) || []; a.push(r); bySym.set(r.symbol, a); }
  for (const [symbol, list] of Array.from(bySym.entries())) {
    let bars: any[] = [];
    try {
      const res = await marketDataService.fetchMarketData({ symbol, assetType: marketDataService.detectAssetType(symbol), timeframe: '15m', limit: 200 });
      bars = res?.bars || [];
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
        exit = Number(bars[bars.length - 1]?.close) || entry;
        result = 'EXPIRED';
      }
      if (!result) continue;
      const move = buy ? exit - entry : entry - exit;
      await pool.query(
        `UPDATE fx_model_decisions SET result=$2, exit_price=$3, r_multiple=$4, pips=$5, resolved_at=now() WHERE id=$1 AND result IS NULL`,
        [r.id, result, exit, move / risk, move / pipSize(symbol)],
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
  return { model: model === 'M1' || model === 'M2' ? model : null, dayType: ['range', 'trend', 'mixed'].includes(dayType || '') ? dayType : null, symbols };
}

/** Seller's own resolved ideas for a bundle scope + the stats the marketplace needs. */
export async function getFxModelListingRows(userId: number, filter: string[] | null | undefined): Promise<{ rows: any[]; avgR: number; masteryScore: number; level: string }> {
  await ensureFxModelTables();
  const { model, dayType, symbols } = parseFxModelScope(filter);
  const { rows } = await pool.query(
    `SELECT symbol, model, day_type, session, direction, entry_price, stop_loss, take_profit, confidence, setup, reasoning, context,
            result, r_multiple, pips, exit_price, created_at, resolved_at
       FROM fx_model_decisions
      WHERE user_id=$1 AND source='own' AND result IN ('WIN','LOSS','EXPIRED')
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
  return { rows, avgR, masteryScore, level: masteryLevel(n, winRate, avgR) };
}

/** Marketplace stat shape: EXPIRED counts as a win only if it closed in profit. */
export function fxModelRowsForStats(rows: any[]) {
  return rows.map((r) => ({
    symbol: r.symbol, confirmedAt: r.resolved_at || r.created_at,
    tradeOutcome: r.result === 'WIN' || (r.result === 'EXPIRED' && Number(r.r_multiple) > 0) ? 'WIN' : 'LOSS',
  }));
}

/** Merge a purchased bundle into the buyer's model history (never resellable). */
export async function importFxModelSnapshot(buyerId: number, snapshot: any[]): Promise<number> {
  await ensureFxModelTables();
  let n = 0;
  for (const r of snapshot || []) {
    await pool.query(
      `INSERT INTO fx_model_decisions (user_id, symbol, model, mode, day_type, session, direction, entry_price, stop_loss, take_profit,
         confidence, setup, reasoning, context, result, r_multiple, pips, exit_price, resolved_at, created_at, source)
       VALUES ($1,$2,$3,'purchased',$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,'purchased_brain')`,
      [buyerId, r.symbol, r.model, r.day_type, r.session, r.direction, r.entry_price, r.stop_loss, r.take_profit, r.confidence,
        r.setup, r.reasoning, JSON.stringify(r.context ?? null), r.result, r.r_multiple, r.pips, r.exit_price,
        r.resolved_at ? new Date(r.resolved_at) : null, r.created_at ? new Date(r.created_at) : new Date()],
    ).then(() => { n++; }).catch(() => {});
  }
  return n;
}

// ── Phase 4: live trading for PROVEN scopes only ─────────────────────────
// OFF by default (per user, toggled in the brain panel). When on, an idea is
// sent to the engine only if ALL hold:
//   • it is the model the day type calls for (range → M1, trend → M2)
//   • that exact slice (model × day type × pair × session) is Proficient or
//     Master — 50+ resolved ideas with a positive average R
//   • the model's live daily cap isn't used up (M1: 3, M2: 2 by default)
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

/** Which live-eligible slices exist right now (for the panel). */
export async function liveEligibleSlices(userId: number): Promise<any[]> {
  const m = await getModelMastery(userId);
  return m.slices.filter((s: any) => LIVE_LEVELS.includes(s.level));
}

async function maybeGoLive(userId: number, idea: {
  id: number; symbol: string; model: ModelId; dayType: DayType; autoModel: ModelId; session: string; direction: string;
  entry: number; stopLoss: number; takeProfit: number; confidence: number; setup: string; reason: string;
}): Promise<void> {
  const settings = await getFxModelSettings(userId);
  if (!settings.live) return;
  if (idea.model !== idea.autoModel) return; // only the model the day type calls for
  // Live eligibility counts ONLY the user's own record — purchased bundles
  // inform the models but can never unlock real-money trading.
  const mastery = await getModelMastery(userId, { ownOnly: true });
  const slice = mastery.slices.find((s: any) => s.model === idea.model && s.dayType === idea.dayType && s.symbol === idea.symbol && s.session === idea.session);
  if (!slice || !LIVE_LEVELS.includes(slice.level)) return;
  const cap = idea.model === 'M1' ? settings.m1DailyCap : settings.m2DailyCap;
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
  const { submitFxModelTrade } = await import('./live-trading-engine');
  const placed = await submitFxModelTrade(userId, {
    model: idea.model, symbol: idea.symbol, direction: idea.direction, confidence: idea.confidence,
    entryPrice: idea.entry, stopLoss: idea.stopLoss, takeProfit: idea.takeProfit,
    reason: `${idea.model === 'M1' ? 'Model 1 · Range' : 'Model 2 · Trend'} [${slice.level}, ${slice.trades} ideas, ${(slice.winRate * 100).toFixed(0)}% WR, ${slice.avgR >= 0 ? '+' : ''}${slice.avgR.toFixed(2)}R] ${idea.setup}: ${idea.reason}`.slice(0, 500),
  }).catch(() => false);
  // Only a trade the engine actually placed uses the cap; otherwise release it.
  await pool.query(`UPDATE fx_model_decisions SET mode=$2 WHERE id=$1`, [idea.id, placed ? 'live' : 'shadow']).catch(() => {});
}

export function masteryLevel(trades: number, winRate: number, avgR: number): string {
  if (trades < 20) return 'Learning';
  if (trades < 50) return avgR > 0 ? 'Developing' : 'Developing (negative)';
  if (trades < 150) return avgR > 0 ? 'Proficient' : 'Unproven';
  return avgR > 0.2 && winRate >= 0.45 ? 'Master' : avgR > 0 ? 'Proficient' : 'Unproven';
}

/** Per model × day type × pair × session: data volume, accuracy, expectancy, level. */
export async function getModelMastery(userId: number, opts: { ownOnly?: boolean } = {}): Promise<{ models: any[]; slices: any[] }> {
  await ensureFxModelTables();
  const agg = async (group: string) => (await pool.query(
    `SELECT ${group}, COUNT(*)::int AS trades,
            COUNT(*) FILTER (WHERE result='WIN')::int AS wins,
            COALESCE(AVG(r_multiple),0)::float AS avg_r,
            COALESCE(SUM(r_multiple),0)::float AS total_r
       FROM fx_model_decisions
      WHERE user_id=$1 AND result IN ('WIN','LOSS','EXPIRED')${opts.ownOnly ? " AND source='own'" : ''}
      GROUP BY ${group} ORDER BY trades DESC`, [userId])).rows;
  const shape = (r: any) => {
    const winRate = r.trades ? r.wins / r.trades : 0;
    // Mastery score 0-100: half data volume (caps at 150 trades), half accuracy-adjusted expectancy.
    const dataPart = Math.min(1, r.trades / 150) * 50;
    const edgePart = Math.max(0, Math.min(1, (r.avg_r + 0.5) / 1.5)) * 50;
    return {
      model: r.model, dayType: r.day_type, symbol: r.symbol, session: r.session,
      trades: r.trades, wins: r.wins, winRate, avgR: r.avg_r, totalR: r.total_r,
      masteryScore: Math.round(dataPart + edgePart), level: masteryLevel(r.trades, winRate, r.avg_r),
    };
  };
  return {
    models: (await agg('model')).map(shape),
    slices: (await agg('model, day_type, symbol, session')).map(shape),
  };
}
