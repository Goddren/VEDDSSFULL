// Goal Pace plan — which pairs, sessions and directions to lean on (or avoid)
// to close the weekly goal WITHOUT raising risk or breaking the consistency rule.
//
// Built from real closed trades (last 60 days). One broker fill per account
// would triple-count a signal, so fills are grouped per signal (symbol +
// direction + entry minute) before scoring. Used three ways:
//   1. the live engine's AI prompt (FOCUS / AVOID windows + today's cap),
//   2. the engine's AVOID filter (proven-losing window needs 85%+),
//   3. the Goal Pacing Agent page.
// Nothing here changes lot size, risk per trade or the daily loss limits.

import { sessionForHour, sameSession } from '../utils/session';

export type PaceVerdict = 'FOCUS' | 'OK' | 'AVOID';
export interface PaceWindow {
  symbol: string; session: string; direction: 'BUY' | 'SELL';
  signals: number; wins: number; winRate: number; expectancy: number; pnl: number;
  verdict: PaceVerdict;
}
export interface PacePlan {
  computedAt: string;
  weekTarget: number; weekPnl: number; todayPnl: number; deficit: number;
  daysLeft: number; neededPerDay: number;
  consistencyPct: number; todayCap: number | null;   // max profit today under the consistency rule
  mode: 'AHEAD' | 'ON_PACE' | 'BEHIND' | 'CAPPED';   // CAPPED = deficit can't be closed inside the consistency cap
  windows: PaceWindow[];
}

const SOURCES = ['tradelocker_auto', 'tradelocker', 'mt5_ea', 'dxtrade'];
const TTL_MS = 15 * 60_000;
const plans = new Map<number, PacePlan>();
const loading = new Set<number>();

function weekStart(): Date {
  const now = new Date();
  const d = new Date(now);
  d.setUTCHours(21, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  if (d > now) d.setUTCDate(d.getUTCDate() - 7);
  return d;
}

/** Trading days left this week including today (Mon–Fri). */
function tradingDaysLeft(): number {
  const dow = new Date().getUTCDay(); // 0 Sun … 6 Sat
  if (dow === 6) return 5;
  if (dow === 0) return 5;
  return 6 - dow;
}

export async function computePacePlan(userId: number, cfg: { weeklyProfitTarget?: number; maxDailyProfitPctOfTotal?: number; pairs?: string[] }): Promise<PacePlan> {
  const { pool } = await import('../db');
  const pairs = (cfg.pairs || []).map(p => String(p).toUpperCase().replace('/', ''));
  const sig = await pool.query(
    `SELECT upper(replace(symbol,'/','')) symbol, upper(direction) direction,
            extract(hour from min(created_at))::int h, sum(profit_loss) pnl
       FROM ai_trade_results
      WHERE user_id=$1 AND source = ANY($2) AND result IN ('WIN','LOSS')
        AND created_at > now() - interval '60 days' AND coalesce(entry_price,0) > 0
      GROUP BY 1, 2, date_trunc('minute', created_at)`,
    [userId, SOURCES]);
  const agg = new Map<string, { s: string; sess: string; d: 'BUY' | 'SELL'; n: number; w: number; pnl: number }>();
  for (const r of sig.rows) {
    if (r.direction !== 'BUY' && r.direction !== 'SELL') continue;
    if (pairs.length && !pairs.includes(r.symbol)) continue;
    const sess = sessionForHour(r.h);
    const k = `${r.symbol}|${sess}|${r.direction}`;
    const a = agg.get(k) || { s: r.symbol, sess, d: r.direction, n: 0, w: 0, pnl: 0 };
    a.n++; if (Number(r.pnl) > 0) a.w++; a.pnl += Number(r.pnl) || 0;
    agg.set(k, a);
  }
  const windows: PaceWindow[] = Array.from(agg.values()).map(a => {
    const winRate = Math.round((a.w / a.n) * 100);
    const expectancy = Math.round((a.pnl / a.n) * 100) / 100;
    const verdict: PaceVerdict =
      a.n >= 5 && winRate >= 50 && expectancy > 0 ? 'FOCUS'
      : a.n >= 6 && winRate < 35 && expectancy < 0 ? 'AVOID'
      : 'OK';
    return { symbol: a.s, session: a.sess, direction: a.d, signals: a.n, wins: a.w, winRate, expectancy, pnl: Math.round(a.pnl), verdict };
  }).sort((x, y) => y.expectancy - x.expectancy);

  const ws = weekStart();
  const wk = await pool.query(
    `SELECT coalesce(sum(profit_loss),0) week,
            coalesce(sum(profit_loss) FILTER (WHERE coalesce(closed_at, created_at) >= date_trunc('day', now())),0) today
       FROM ai_trade_results
      WHERE user_id=$1 AND source = ANY($2) AND result IN ('WIN','LOSS','BREAKEVEN')
        AND coalesce(closed_at, created_at) >= $3 AND coalesce(entry_price,0) > 0`,
    [userId, SOURCES, ws]);
  const weekPnl = Math.round(Number(wk.rows[0]?.week) || 0);
  const todayPnl = Math.round(Number(wk.rows[0]?.today) || 0);
  const weekTarget = Number(cfg.weeklyProfitTarget) || 0;
  const deficit = Math.max(0, weekTarget - weekPnl);
  const daysLeft = tradingDaysLeft();
  const neededPerDay = Math.round(deficit / Math.max(1, daysLeft));
  const consistencyPct = Number(cfg.maxDailyProfitPctOfTotal) || 0;
  // No single day may exceed X% of total profit; against the weekly target that
  // is at most X% of the target in one day.
  const todayCap = consistencyPct > 0 && weekTarget > 0 ? Math.round(weekTarget * consistencyPct / 100) : null;
  const mode: PacePlan['mode'] =
    weekTarget > 0 && deficit <= 0 ? 'AHEAD'
    : todayCap != null && neededPerDay > todayCap ? 'CAPPED'
    : weekTarget > 0 && weekPnl >= weekTarget * (1 - daysLeft / 5) ? 'ON_PACE'
    : 'BEHIND';
  return { computedAt: new Date().toISOString(), weekTarget, weekPnl, todayPnl, deficit, daysLeft, neededPerDay, consistencyPct, todayCap, mode, windows };
}

/** Cached plan (sync); refreshes in the background every 15 min. */
export function getPacePlan(userId: number, cfg: Parameters<typeof computePacePlan>[1]): PacePlan | null {
  const p = plans.get(userId);
  if ((!p || Date.now() - Date.parse(p.computedAt) > TTL_MS) && !loading.has(userId)) {
    loading.add(userId);
    computePacePlan(userId, cfg).then(r => plans.set(userId, r)).catch(() => {}).finally(() => loading.delete(userId));
  }
  return p || null;
}

export function paceWindowFor(plan: PacePlan | null, symbol: string, direction: string, hourUtc = new Date().getUTCHours()): PaceWindow | null {
  if (!plan) return null;
  const sym = String(symbol || '').toUpperCase().replace('/', '');
  const sess = sessionForHour(hourUtc);
  return plan.windows.find(w => w.symbol === sym && w.direction === String(direction).toUpperCase() && sameSession(w.session, sess)) || null;
}

/** Prompt block for the live engine's AI. */
export function pacePromptSection(plan: PacePlan | null): string {
  if (!plan) return '';
  const sess = sessionForHour(new Date().getUTCHours());
  const fmt = (w: PaceWindow) => `${w.symbol} ${w.direction} (${w.winRate}% over ${w.signals}, $${w.expectancy}/signal)`;
  const now = plan.windows.filter(w => sameSession(w.session, sess));
  const focus = now.filter(w => w.verdict === 'FOCUS').slice(0, 6).map(fmt);
  const avoid = now.filter(w => w.verdict === 'AVOID').slice(-6).map(fmt);
  const later = plan.windows.filter(w => w.verdict === 'FOCUS' && !sameSession(w.session, sess)).slice(0, 5)
    .map(w => `${w.symbol} ${w.direction} in ${w.session}`);
  return `
GOAL PACE AGENT (week $${plan.weekPnl} / $${plan.weekTarget}, ${plan.mode}; need ~$${plan.neededPerDay}/day over ${plan.daysLeft} day(s); today $${plan.todayPnl}${plan.todayCap != null ? `, consistency cap $${plan.todayCap} today` : ''}):
- Current session: ${sess}. Prefer these proven windows: ${focus.join('; ') || 'none with enough history'}.
- Proven losers this session (need 85%+ or skip): ${avoid.join('; ') || 'none'}.
${later.length ? `- Best windows later: ${later.join('; ')}.\n` : ''}- Catch up by picking BETTER windows, never by bigger size: risk per trade, daily loss limit and the consistency cap are fixed.${plan.mode === 'CAPPED' ? ' The goal cannot be closed inside the consistency cap this week — aim for the cap, not the full deficit.' : ''}${plan.mode === 'AHEAD' ? ' Goal reached — only A+ setups.' : ''}
`;
}
