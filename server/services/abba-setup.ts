// ABBA week setup: a proposal of engine settings (FX, crypto, Sol, Model 1/2)
// that ABBA builds with the trader in chat → a review (current vs new, risk
// math, warnings) → applied only when the trader taps Confirm.
// Only the fields in the allow-lists below can change, and each is clamped.

import { storage } from '../storage';
import { getEffectiveEngineConfig, isEngineHardHalted, getLiveEngineState, startLiveEngine, updateLiveEngineConfig } from './live-trading-engine';
import { getSolEngineStatus, startSolEngine } from './sol-engine';
import { getFxModelSettings, saveFxModelSettings } from './fx-models';
import { fxShouldPauseForCredits } from './ai-budget-guard';
import { getPeriodReview } from './weekly-review';

type Dir = 'buy_only' | 'sell_only' | 'both';
export interface SetupProposal {
  title: string;
  rationale: string;
  weeklyTarget?: number;
  fx?: { run: boolean; pairs?: string[]; riskPerTrade?: number; maxOpenTrades?: number; minConfidence?: number; maxDailyTrades?: number; directionFilter?: Dir; pairDirectionOverrides?: Record<string, Dir> };
  crypto?: { run: boolean; symbols?: string[]; riskPerTrade?: number; minConfidence?: number; maxDailyTrades?: number; directionFilter?: 'long_only' | 'short_only' | 'both' };
  sol?: { run: boolean; riskPerTradePct?: number; minConfidence?: number; maxDailyTrades?: number };
  models?: { m1DailyCap?: number; m2DailyCap?: number };
}

const clamp = (v: any, lo: number, hi: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined; };
const sym = (s: any) => String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
const DIRS: Dir[] = ['buy_only', 'sell_only', 'both'];
// Hard ceilings ABBA can never propose past, whatever the chat says.
export const MAX_RISK_PCT = 2;

/** Coerce model output into an allow-listed, clamped proposal. */
export function sanitizeProposal(p: any): SetupProposal | null {
  if (!p || typeof p !== 'object') return null;
  const out: SetupProposal = { title: String(p.title || 'Next week plan').slice(0, 120), rationale: String(p.rationale || '').slice(0, 1500) };
  const wt = clamp(p.weeklyTarget, 0, 10_000_000); if (wt) out.weeklyTarget = Math.round(wt);
  if (p.fx && typeof p.fx === 'object') {
    const f = p.fx;
    const pdo = f.pairDirectionOverrides && typeof f.pairDirectionOverrides === 'object'
      ? Object.fromEntries(Object.entries(f.pairDirectionOverrides).map(([k, v]) => [sym(k), v]).filter(([k, v]) => k && DIRS.includes(v as Dir))) as Record<string, Dir>
      : undefined;
    out.fx = {
      run: f.run !== false,
      pairs: Array.isArray(f.pairs) ? f.pairs.map(sym).filter((s: string) => s.length >= 3 && s.length <= 12).slice(0, 15) : undefined,
      riskPerTrade: clamp(f.riskPerTrade, 0.1, MAX_RISK_PCT),
      maxOpenTrades: clamp(f.maxOpenTrades, 1, 10),
      minConfidence: clamp(f.minConfidence, 55, 95),
      maxDailyTrades: clamp(f.maxDailyTrades, 1, 30),
      directionFilter: DIRS.includes(f.directionFilter) ? f.directionFilter : undefined,
      pairDirectionOverrides: pdo && Object.keys(pdo).length ? pdo : undefined,
    };
    if (out.fx.pairs && !out.fx.pairs.length) delete out.fx.pairs;
  }
  if (p.crypto && typeof p.crypto === 'object') {
    const c = p.crypto;
    out.crypto = {
      run: c.run !== false,
      symbols: Array.isArray(c.symbols) ? c.symbols.map(sym).filter(Boolean).slice(0, 10) : undefined,
      riskPerTrade: clamp(c.riskPerTrade, 0.1, MAX_RISK_PCT),
      minConfidence: clamp(c.minConfidence, 55, 95),
      maxDailyTrades: clamp(c.maxDailyTrades, 1, 30),
      directionFilter: ['long_only', 'short_only', 'both'].includes(c.directionFilter) ? c.directionFilter : undefined,
    };
    if (out.crypto.symbols && !out.crypto.symbols.length) delete out.crypto.symbols;
  }
  if (p.sol && typeof p.sol === 'object') {
    out.sol = { run: p.sol.run !== false, riskPerTradePct: clamp(p.sol.riskPerTradePct, 0.1, MAX_RISK_PCT), minConfidence: clamp(p.sol.minConfidence, 55, 95), maxDailyTrades: clamp(p.sol.maxDailyTrades, 1, 50) };
  }
  if (p.models && typeof p.models === 'object') {
    out.models = { m1DailyCap: clamp(p.models.m1DailyCap, 0, 10), m2DailyCap: clamp(p.models.m2DailyCap, 0, 10) };
  }
  return out.fx || out.crypto || out.sol || out.models ? out : null;
}

export async function currentSettings(userId: number) {
  const fx = getEffectiveEngineConfig(userId);
  const fxState = getLiveEngineState(userId);
  const crypto: any = await storage.getUserCryptocomEngineConfig(userId).catch(() => null);
  const sol: any = getSolEngineStatus(userId);
  const models: any = await getFxModelSettings(userId).catch(() => ({}));
  return {
    fx: { running: fxState?.status === 'running', pairs: fx.pairs, riskPerTrade: fx.riskPerTrade, maxOpenTrades: fx.maxOpenTrades, minConfidence: fx.minConfidence,
      maxDailyTrades: fx.maxDailyTrades, directionFilter: fx.directionFilter, pairDirectionOverrides: fx.pairDirectionOverrides || {}, weeklyProfitTarget: fx.weeklyProfitTarget },
    crypto: crypto ? { running: !!crypto.isActive, symbols: crypto.symbols, riskPerTrade: crypto.riskPerTrade, minConfidence: crypto.minConfidence, maxDailyTrades: crypto.maxDailyTrades, directionFilter: crypto.directionFilter } : null,
    sol: { running: !!sol?.running, riskPerTradePct: sol?.config?.riskPerTradePct, minConfidence: sol?.config?.minConfidence, maxDailyTrades: sol?.config?.maxDailyTrades },
    models: { live: !!models.live, m1DailyCap: models.m1DailyCap, m2DailyCap: models.m2DailyCap },
  };
}

type Change = { engine: string; field: string; from: any; to: any; riskUp?: boolean };
const show = (v: any) => (v == null ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? Object.entries(v).map(([k, x]) => `${k}:${x}`).join(', ') || '—' : String(v));

export async function buildSetupReview(userId: number, p: SetupProposal) {
  const cur = await currentSettings(userId);
  const changes: Change[] = [];
  const diff = (engine: string, field: string, from: any, to: any, riskUp = false) => {
    if (to === undefined) return;
    if (JSON.stringify(from ?? null) === JSON.stringify(to)) return;
    changes.push({ engine, field, from: show(from), to: show(to), riskUp });
  };
  if (p.fx) {
    diff('FX', 'Engine', cur.fx.running ? 'running' : 'stopped', p.fx.run ? 'running' : 'stopped');
    diff('FX', 'Pairs', cur.fx.pairs, p.fx.pairs);
    diff('FX', 'Risk per trade %', cur.fx.riskPerTrade, p.fx.riskPerTrade, (p.fx.riskPerTrade ?? 0) > (cur.fx.riskPerTrade ?? 0));
    diff('FX', 'Max open trades', cur.fx.maxOpenTrades, p.fx.maxOpenTrades, (p.fx.maxOpenTrades ?? 0) > (cur.fx.maxOpenTrades ?? 0));
    diff('FX', 'Min confidence', cur.fx.minConfidence, p.fx.minConfidence);
    diff('FX', 'Max trades / day', cur.fx.maxDailyTrades || 'unlimited', p.fx.maxDailyTrades, !!cur.fx.maxDailyTrades && (p.fx.maxDailyTrades ?? 0) > cur.fx.maxDailyTrades);
    diff('FX', 'Direction', cur.fx.directionFilter, p.fx.directionFilter);
    diff('FX', 'Per-pair direction', cur.fx.pairDirectionOverrides, p.fx.pairDirectionOverrides);
  }
  if (p.weeklyTarget) diff('Goal', 'Weekly profit target $', cur.fx.weeklyProfitTarget, p.weeklyTarget);
  // The plan itself becomes this week's active weekly plan, so confirming it always does something.
  const activePlan: any = await storage.getActiveWeeklyStrategy(userId).catch(() => undefined);
  const activeTitle = activePlan?.plan?.abbaSetup?.title || (activePlan ? 'existing plan' : 'none');
  if (p.title) diff('Plan', 'Active weekly plan', activeTitle, p.title);
  if (p.crypto) {
    const c = cur.crypto || ({} as any);
    diff('Crypto', 'Engine', c.running ? 'running' : 'stopped', p.crypto.run ? 'running' : 'stopped');
    diff('Crypto', 'Symbols', c.symbols, p.crypto.symbols);
    diff('Crypto', 'Risk per trade %', c.riskPerTrade, p.crypto.riskPerTrade, (p.crypto.riskPerTrade ?? 0) > (c.riskPerTrade ?? 0));
    diff('Crypto', 'Min confidence', c.minConfidence, p.crypto.minConfidence);
    diff('Crypto', 'Max trades / day', c.maxDailyTrades || 'unlimited', p.crypto.maxDailyTrades);
    diff('Crypto', 'Direction', c.directionFilter, p.crypto.directionFilter);
  }
  if (p.sol) {
    diff('Sol', 'Engine', cur.sol.running ? 'running' : 'stopped', p.sol.run ? 'running' : 'stopped');
    diff('Sol', 'Risk per trade %', cur.sol.riskPerTradePct, p.sol.riskPerTradePct, (p.sol.riskPerTradePct ?? 0) > (cur.sol.riskPerTradePct ?? 0));
    diff('Sol', 'Min confidence', cur.sol.minConfidence, p.sol.minConfidence);
    diff('Sol', 'Max trades / day', cur.sol.maxDailyTrades || 'unlimited', p.sol.maxDailyTrades);
  }
  if (p.models) {
    diff('Model 1/2', 'Model 1 daily cap', cur.models.m1DailyCap, p.models.m1DailyCap);
    diff('Model 1/2', 'Model 2 daily cap', cur.models.m2DailyCap, p.models.m2DailyCap);
  }

  // Risk math (FX): worst realistic day and what the goal needs.
  const fxRisk = p.fx?.riskPerTrade ?? cur.fx.riskPerTrade ?? 1;
  const fxDaily = p.fx?.maxDailyTrades ?? cur.fx.maxDailyTrades ?? 0;
  const balance = Number((getLiveEngineState(userId) as any)?.config?.accountBalance || getEffectiveEngineConfig(userId).accountBalance || 0);
  const target = p.weeklyTarget ?? cur.fx.weeklyProfitTarget ?? 0;
  const math = {
    balance: balance || null,
    worstDayLossPct: fxDaily ? Math.round(fxRisk * fxDaily * 10) / 10 : null,
    worstDayLossUsd: balance && fxDaily ? Math.round(balance * fxRisk * fxDaily / 100) : null,
    targetPerDay: target ? Math.round(target / 5) : null,
    targetPctOfBalance: balance && target ? Math.round((target / balance) * 1000) / 10 : null,
  };

  const warnings: string[] = [];
  const blockers: string[] = [];
  if (p.fx?.run && isEngineHardHalted(userId)) blockers.push('FX engine is halted today (daily loss limit or emergency stop). It stays off until tomorrow: that halt protects the account.');
  if ((p.fx?.run || p.crypto?.run) && fxShouldPauseForCredits()) blockers.push('AI credits are out, so engines are paused. Top up the AI provider first.');
  if (p.fx?.run) {
    const [tl, mt5] = await Promise.all([
      storage.getUserTradelockerConnections(userId).catch(() => [] as any[]),
      Promise.resolve((global as any).mt5AccountData?.[userId]),
    ]);
    if (!tl.some((c: any) => c.isActive) && !mt5) blockers.push('No active broker connection for FX (TradeLocker or MT5). Connect one first.');
  }
  if (changes.some((c) => c.riskUp)) warnings.push('This plan RAISES risk on at least one engine. Make sure that is what you want.');
  if (math.worstDayLossPct && math.worstDayLossPct > 6) warnings.push(`If every FX trade on a max-trades day hits its stop, that is a ${math.worstDayLossPct}% day.`);
  if (math.targetPctOfBalance && math.targetPctOfBalance > 10) warnings.push(`The weekly target is ${math.targetPctOfBalance}% of the balance. That pace needs outsized risk; a smaller goal is safer.`);
  try {
    const week = await getPeriodReview(userId, 'week', 0);
    if (target && week.totals.pnl < 0 && changes.some((c) => c.riskUp)) warnings.push(`You're ${week.totals.pnl < 0 ? 'down' : 'up'} $${Math.abs(week.totals.pnl)} this week. Raising risk to catch up is how accounts get blown.`);
  } catch { /* review is advisory */ }
  if (p.models?.m2DailyCap) warnings.push('Model 2 has a negative shadow record (about -51R last month). Its cap only matters if Model 1/2 live mode is on, which this plan does not change.');

  return { proposal: p, current: cur, changes, math, warnings, blockers, canApply: blockers.length === 0 && changes.length > 0 };
}

export async function applySetup(userId: number, p: SetupProposal) {
  const review = await buildSetupReview(userId, p);
  if (!review.canApply) return { ok: false, review, applied: [] as string[], error: review.blockers[0] || 'Nothing to change.' };
  const applied: string[] = [];
  const errors: string[] = [];

  if (p.fx) {
    try {
      const upd: any = {};
      for (const k of ['pairs', 'riskPerTrade', 'maxOpenTrades', 'minConfidence', 'maxDailyTrades', 'directionFilter', 'pairDirectionOverrides'] as const) {
        if ((p.fx as any)[k] !== undefined) upd[k] = (p.fx as any)[k];
      }
      if (p.weeklyTarget) upd.weeklyProfitTarget = p.weeklyTarget;
      const running = getLiveEngineState(userId)?.status === 'running';
      if (p.fx.run && !running) { startLiveEngine(userId, { ...getEffectiveEngineConfig(userId), ...upd }); applied.push('FX engine started with the new settings'); }
      else {
        updateLiveEngineConfig(userId, upd); applied.push(running ? 'FX settings updated (engine running)' : 'FX settings saved (engine stays off)');
        if (!p.fx.run && running) errors.push('FX is running and the plan says off. Stop it from the engine page if you want it off; ABBA does not stop engines.');
      }
    } catch (e: any) { errors.push(`FX: ${e.message}`); }
  }
  if (p.crypto) {
    try {
      const upd: any = {};
      for (const k of ['symbols', 'riskPerTrade', 'minConfidence', 'maxDailyTrades', 'directionFilter'] as const) {
        if ((p.crypto as any)[k] !== undefined) upd[k] = (p.crypto as any)[k];
      }
      if (p.crypto.run) upd.isActive = true;
      await storage.upsertCryptocomEngineConfig(userId, upd);
      applied.push(p.crypto.run ? 'Crypto engine on with the new settings' : 'Crypto settings saved');
    } catch (e: any) { errors.push(`Crypto: ${e.message}`); }
  }
  if (p.sol) {
    try {
      const st: any = getSolEngineStatus(userId);
      if (p.sol.run) {
        // startSolEngine takes the full config; keep what's set unless the plan changes it.
        await startSolEngine(userId, {
          ...(st?.config || {}),
          ...(p.sol.riskPerTradePct !== undefined ? { riskPerTradePct: p.sol.riskPerTradePct } : {}),
          ...(p.sol.minConfidence !== undefined ? { minConfidence: p.sol.minConfidence } : {}),
          ...(p.sol.maxDailyTrades !== undefined ? { maxDailyTrades: p.sol.maxDailyTrades } : {}),
        });
        applied.push(st?.running ? 'Sol engine restarted with the new settings' : 'Sol engine started');
      } else applied.push('Sol left as is');
    } catch (e: any) { errors.push(`Sol: ${e.message}`); }
  }
  if (p.title) {
    try {
      const prev: any = await storage.getActiveWeeklyStrategy(userId).catch(() => undefined);
      const weekStart = new Date(); weekStart.setUTCHours(0, 0, 0, 0);
      const dow = weekStart.getUTCDay(); // plans made on the weekend are for the coming week
      weekStart.setUTCDate(weekStart.getUTCDate() + (dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow));
      const balance = Number(getEffectiveEngineConfig(userId).accountBalance || prev?.accountBalance || 0);
      await storage.saveWeeklyStrategy(userId, {
        profitTarget: p.weeklyTarget ?? prev?.profitTarget ?? Number(getEffectiveEngineConfig(userId).weeklyProfitTarget || 0),
        accountBalance: balance,
        pairs: p.fx?.pairs || prev?.pairs || getEffectiveEngineConfig(userId).pairs || [],
        riskLevel: prev?.riskLevel || 'ai-controlled',
        lotSize: prev?.lotSize || 'auto',
        plan: { ...(prev?.plan || {}), abbaGenerated: true, abbaSetup: { title: p.title, rationale: p.rationale, proposal: p, appliedAt: new Date().toISOString() } },
        pairStats: prev?.pairStats || null,
        generatedAt: new Date().toISOString(),
        weekStart: weekStart.toISOString().slice(0, 10),
      });
      applied.push(`Weekly plan "${p.title}" is now your active plan`);
    } catch (e: any) { errors.push(`Weekly plan: ${e.message}`); }
  }
  if (p.models && (p.models.m1DailyCap !== undefined || p.models.m2DailyCap !== undefined)) {
    try {
      const cur: any = await getFxModelSettings(userId);
      await saveFxModelSettings(userId, { ...cur, ...(p.models.m1DailyCap !== undefined ? { m1DailyCap: p.models.m1DailyCap } : {}), ...(p.models.m2DailyCap !== undefined ? { m2DailyCap: p.models.m2DailyCap } : {}) });
      applied.push('Model 1/2 daily caps saved (live mode unchanged)');
    } catch (e: any) { errors.push(`Models: ${e.message}`); }
  }
  return { ok: errors.length === 0, applied, errors, review };
}
