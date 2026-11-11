// ── FX rules score (no-AI decision lane) ─────────────────────────────────────
// Deterministic 0–99 confidence for one FX pair, built only from signals the
// live engine already computes. It produces the SAME decision shape the AI
// does, so every downstream gate in processDecision applies unchanged — the
// score simply lands in decision.confidence and meets the existing
// minConfidence / adapted-floor / small-account / HTF-90% rules.
//
// Pure: no I/O. The engine gathers the inputs (rulesInputsFor in
// live-trading-engine.ts) and the shadow module logs the result.
//
// Weights are priors from 90 days of ai_trade_results (2026-11-07 design):
//   trend day + H1&H4 aligned 46% WR vs mixed day + aligned 19%;
//   partial alignment 0/13; M15 ADX 18–25 → 35+ = 21% → 39% WR;
//   AI confidence 90–95 won only 31.6% (−$4.1k) — it was never calibrated.
// Refit from fx_decision_shadow before switching; override live via
// FX_RULES_WEIGHTS (JSON, partial) without a deploy.

export type FxDecisionMode = 'ai' | 'rules' | 'hybrid';

export function fxDecisionMode(): FxDecisionMode {
  const m = String(process.env.FX_DECISION_MODE || 'ai').toLowerCase();
  return m === 'rules' || m === 'hybrid' ? m : 'ai';
}
export const fxRulesShadowOn = () => String(process.env.FX_RULES_SHADOW || 'on').toLowerCase() !== 'off';

/** Score a pick must reach to count as the rules lane's decision. */
export function fxRulesMinScore(configMin?: number): number {
  const env = Number(process.env.FX_RULES_MIN_SCORE);
  if (process.env.FX_RULES_MIN_SCORE && Number.isFinite(env)) return env;
  return Number(configMin) > 0 ? Number(configMin) : 70;
}

export const DEFAULT_RULES_WEIGHTS = {
  base: 50,
  votePerExtra: 6,      // per vote above 3 (4→6, 5→12, 6→18, 7+→24)
  voteCap: 24,
  dayTrend: 8, dayMixed: -8, dayRange: -15,
  mtfBoth: 10, mtfNeutral: -5, mtfPartial: -10, mtfOpposed: -20,
  adx35: 6, adx25: 0, adx18: -4, adxLow: -10,
  m15Conflict: -10,
  sniperHigh: 4, confluenceMet: 4, confluenceShort: -8,
  orbRetest: 6,         // confirmed ORB breakout + active retest, pick direction == breakout direction
  brainCap: 10,         // |pair×session/hour/direction edge| / 2, capped
  paceFocus: 5,
  modelAgree: 5, modelOppose: -5,
};
export type RulesWeights = typeof DEFAULT_RULES_WEIGHTS;

let _wCache: { raw: string; w: RulesWeights } | null = null;
export function rulesWeights(): RulesWeights {
  const raw = process.env.FX_RULES_WEIGHTS || '';
  if (_wCache && _wCache.raw === raw) return _wCache.w;
  let w: RulesWeights = { ...DEFAULT_RULES_WEIGHTS };
  if (raw) {
    try {
      const o = JSON.parse(raw);
      for (const k of Object.keys(w) as (keyof RulesWeights)[]) {
        if (typeof o?.[k] === 'number' && Number.isFinite(o[k])) w[k] = o[k];
      }
    } catch { /* bad JSON → defaults */ }
  }
  _wCache = { raw, w };
  return w;
}

export interface RulesInputs {
  symbol: string;
  bull: number; bear: number;                  // countIndicatorAlignment
  dayType: 'trend' | 'mixed' | 'range' | null;
  h1: string | null; h4: string | null;        // BULLISH | BEARISH | NEUTRAL | null
  adx: number | null;                          // adxOrNull — unknown scores 0
  m15Trend: string | null;
  strategy: string; strategyPriority: string; minConfluences: number;
  brainEdge: number | null;                    // pp vs pair baseline, shadow-blended (null = thin data)
  brainFail: string | null;                    // a FAILS condition this pick sits in
  pace: 'FOCUS' | 'OK' | 'AVOID' | null;
  model: { direction: string; avgR: number; n: number } | null;  // latest M1/M2 idea this hour
  newsSoon: boolean;
  relVolume: number | null;
  orbRetest?: boolean;                          // price is retesting the broken ORB level now
  orbDirection?: 'BUY' | 'SELL' | null;         // confirmed ORB breakout direction
}

export interface RulesScore {
  symbol: string;
  direction: 'BUY' | 'SELL';
  score: number;
  terms: Record<string, number>;
  skip: string | null;                         // hard skip → no decision regardless of score
}

export function scoreFxPair(i: RulesInputs, w: RulesWeights = rulesWeights()): RulesScore {
  const direction: 'BUY' | 'SELL' = i.bull >= i.bear ? 'BUY' : 'SELL';
  const votes = Math.max(i.bull, i.bear);
  const want = direction === 'BUY' ? 'BULLISH' : 'BEARISH';
  const against = direction === 'BUY' ? 'BEARISH' : 'BULLISH';
  const t: Record<string, number> = { base: w.base };

  t.votes = Math.min(w.voteCap, Math.max(0, votes - 3) * w.votePerExtra);

  t.day = i.dayType === 'trend' ? w.dayTrend : i.dayType === 'mixed' ? w.dayMixed : i.dayType === 'range' ? w.dayRange : 0;

  const h1 = i.h1 || 'NEUTRAL', h4 = i.h4 || 'NEUTRAL';
  if (h1 === want && h4 === want) t.mtf = w.mtfBoth;
  else if (h1 === against && h4 === against) t.mtf = w.mtfOpposed;
  else if (h1 === against || h4 === against) t.mtf = w.mtfPartial;
  else t.mtf = w.mtfNeutral;

  t.adx = i.adx == null ? 0 : i.adx >= 35 ? w.adx35 : i.adx >= 25 ? w.adx25 : i.adx >= 18 ? w.adx18 : w.adxLow;

  t.m15 = i.m15Trend === against ? w.m15Conflict : 0;

  t.sniper = (i.strategyPriority === 'high' ? w.sniperHigh : 0)
    + (i.minConfluences > 0 ? (votes >= i.minConfluences ? w.confluenceMet : w.confluenceShort) : 0);

  // ORB confluence: an active retest of a confirmed opening-range breakout
  // only counts when the pick trades WITH the breakout, never against it.
  t.orb = i.orbRetest && i.orbDirection === direction ? w.orbRetest : 0;

  t.brain = i.brainEdge == null ? 0 : Math.max(-w.brainCap, Math.min(w.brainCap, i.brainEdge / 2));

  t.pace = i.pace === 'FOCUS' ? w.paceFocus : 0;

  t.model = !i.model || i.model.n < 20 || !(i.model.avgR > 0) ? 0
    : String(i.model.direction).toUpperCase() === direction ? w.modelAgree : w.modelOppose;

  const raw = Object.values(t).reduce((a, b) => a + b, 0);
  const score = Math.max(0, Math.min(99, Math.round(raw)));

  let skip: string | null = null;
  if (!i.h1 && !i.h4) skip = 'no_htf_data';                // fail closed after a deploy reset
  else if (i.newsSoon) skip = 'high_impact_news';
  else if (i.pace === 'AVOID') skip = 'pace_avoid';
  else if (i.brainFail) skip = `brain_fails:${i.brainFail}`;
  else if (i.relVolume != null && i.relVolume < 0.5 && votes < 5) skip = 'dry_volume';

  return { symbol: i.symbol, direction, score, terms: t, skip };
}
