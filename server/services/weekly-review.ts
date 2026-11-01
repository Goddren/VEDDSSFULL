// Weekly (or monthly) review for ABBA: one read of how the last period went —
// P&L vs goal, by pair / session / weekday, what the gates blocked, how the
// Model 1/2 + crypto + Sol shadows did, and how the trader's brain ideas would
// have changed it. ABBA opens the planning conversation from this.

import { pool } from '../db';
import { sessionFor } from './fx-models';

type Bucket = { key: string; trades: number; wins: number; losses: number; pnl: number; winRate: number };
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function bucketize(rows: any[], keyOf: (r: any) => string): Bucket[] {
  const m = new Map<string, Bucket>();
  for (const r of rows) {
    const k = keyOf(r);
    const b = m.get(k) || { key: k, trades: 0, wins: 0, losses: 0, pnl: 0, winRate: 0 };
    b.trades++; b.pnl += Number(r.profit_loss) || 0;
    if (r.result === 'WIN') b.wins++; else if (r.result === 'LOSS') b.losses++;
    m.set(k, b);
  }
  return Array.from(m.values()).map((b) => ({ ...b, pnl: Math.round(b.pnl * 100) / 100, winRate: b.trades ? Math.round((b.wins / b.trades) * 100) : 0 }))
    .sort((a, b) => b.pnl - a.pnl);
}

export interface PeriodReview {
  period: 'week' | 'month'; from: string; to: string;
  goal: { weeklyTarget: number | null; hit: boolean | null };
  totals: { trades: number; wins: number; losses: number; winRate: number; pnl: number; bestDay: string | null; worstDay: string | null };
  byPair: Bucket[]; bySession: Bucket[]; byWeekday: Bucket[];
  gateBlocks: { total: number; top: { reason: string; n: number }[] };
  shadows: { engine: string; strategy: string; trades: number; winRate: number; sumR: number }[];
  ideas: { title: string; status: string; verdict: string }[];
}

export async function getPeriodReview(userId: number, period: 'week' | 'month' = 'week', offset = 1): Promise<PeriodReview> {
  // offset 1 = the last full period, 0 = the current one so far.
  const now = new Date();
  let from: Date, to: Date;
  if (period === 'week') {
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
    from = new Date(monday.getTime() - offset * 7 * 86400000);
    to = new Date(from.getTime() + 7 * 86400000);
  } else {
    from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset + 1, 1));
  }
  if (to > now) to = now;

  const q = (sql: string, params: any[]) => pool.query(sql, params).then((r) => r.rows).catch(() => [] as any[]);
  const [trades, blocks, shadows, goalRows, ideas] = await Promise.all([
    q(`SELECT symbol, direction, result, profit_loss, created_at, COALESCE(closed_at, created_at) AS closed
       FROM ai_trade_results WHERE user_id = $1 AND result IN ('WIN','LOSS','BREAKEVEN')
       AND COALESCE(closed_at, created_at) >= $2 AND COALESCE(closed_at, created_at) < $3`, [userId, from, to]),
    // The gate re-logs the same block on every scan, so count distinct hours per pair + pattern.
    q(`SELECT symbol || ' ' || COALESCE(pattern_value, dimension, '') AS reason,
       count(DISTINCT date_trunc('hour', blocked_at))::int n
       FROM fx_brain_gate_blocks WHERE user_id = $1 AND blocked_at >= $2 AND blocked_at < $3
       GROUP BY 1 ORDER BY n DESC LIMIT 6`, [userId, from, to]),
    q(`SELECT engine, strategy, count(*)::int trades, round(100.0 * avg((result = 'WIN')::int))::int win_rate,
       round(sum(COALESCE(r_multiple, 0))::numeric, 1)::float sum_r
       FROM shadow_ledger WHERE user_id = $1 AND opened_at >= $2 AND opened_at < $3 GROUP BY 1, 2 ORDER BY 1, 2`, [userId, from, to]),
    q(`SELECT profit_target FROM weekly_strategies WHERE user_id = $1 ORDER BY (is_active IS TRUE) DESC, id DESC LIMIT 1`, [userId]),
    q(`SELECT title, status, evidence->>'verdict' AS verdict FROM user_brain_ideas WHERE user_id = $1 AND status <> 'retired' ORDER BY id DESC LIMIT 10`, [userId]),
  ]);

  const byDay = bucketize(trades, (r) => new Date(r.closed).toISOString().slice(0, 10));
  const wins = trades.filter((r) => r.result === 'WIN').length;
  const losses = trades.filter((r) => r.result === 'LOSS').length;
  const pnl = Math.round(trades.reduce((s, r) => s + (Number(r.profit_loss) || 0), 0) * 100) / 100;
  const weeklyTarget = goalRows[0]?.profit_target != null ? Number(goalRows[0].profit_target) : null;
  const target = weeklyTarget == null ? null : period === 'month' ? weeklyTarget * 4 : weeklyTarget;

  return {
    period, from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
    goal: { weeklyTarget, hit: target == null ? null : pnl >= target },
    totals: { trades: trades.length, wins, losses, winRate: trades.length ? Math.round((wins / trades.length) * 100) : 0, pnl,
      bestDay: byDay[0] ? `${byDay[0].key} ${byDay[0].pnl >= 0 ? '+' : ''}$${byDay[0].pnl}` : null,
      worstDay: byDay.length ? `${byDay[byDay.length - 1].key} ${byDay[byDay.length - 1].pnl >= 0 ? '+' : ''}$${byDay[byDay.length - 1].pnl}` : null },
    byPair: bucketize(trades, (r) => String(r.symbol).toUpperCase()),
    bySession: bucketize(trades, (r) => sessionFor(new Date(r.created_at))),
    byWeekday: bucketize(trades, (r) => DAYS[new Date(r.created_at).getUTCDay()]),
    gateBlocks: { total: blocks.reduce((s: number, b: any) => s + b.n, 0), top: blocks.map((b: any) => ({ reason: String(b.reason || '').slice(0, 120), n: b.n })) },
    shadows: shadows.map((s: any) => ({ engine: s.engine, strategy: s.strategy, trades: s.trades, winRate: s.win_rate, sumR: s.sum_r })),
    ideas: ideas.map((i: any) => ({ title: i.title, status: i.status, verdict: i.verdict || '' })),
  };
}

const money = (n: number) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
const line = (b: Bucket) => `${b.key} ${b.trades}t ${b.winRate}%WR ${money(b.pnl)}`;

export function reviewText(r: PeriodReview): string {
  const t = r.totals;
  const goal = r.goal.weeklyTarget == null ? 'no weekly goal set'
    : `goal ${r.period === 'month' ? '$' + (r.goal.weeklyTarget * 4) + ' (4x weekly)' : '$' + r.goal.weeklyTarget} → ${r.goal.hit ? 'HIT' : 'missed'}`;
  return [
    `${r.period.toUpperCase()} ${r.from} to ${r.to}: ${t.trades} trades, ${t.wins}W/${t.losses}L (${t.winRate}%), ${money(t.pnl)}; ${goal}. Best day ${t.bestDay || 'n/a'}, worst ${t.worstDay || 'n/a'}.`,
    r.byPair.length ? `By pair: ${r.byPair.slice(0, 8).map(line).join(' | ')}` : 'No closed trades in this period.',
    r.bySession.length ? `By session: ${r.bySession.map(line).join(' | ')}` : '',
    r.byWeekday.length ? `By weekday: ${r.byWeekday.map(line).join(' | ')}` : '',
    r.gateBlocks.total ? `Brain gate (losing pair+session combos it kept them out of, in hours blocked): ${r.gateBlocks.top.map((b) => `${b.reason} ${b.n}h`).join('; ')}` : 'Brain gate blocked nothing.',
    r.shadows.length ? `Shadow/paper: ${r.shadows.map((s) => `${s.engine} ${s.strategy} ${s.trades}t ${s.winRate}%WR ${s.sumR >= 0 ? '+' : ''}${s.sumR}R`).join(' | ')}` : 'No shadow trades resolved.',
    r.ideas.length ? `Their brain ideas: ${r.ideas.map((i) => `"${i.title}" [${i.status}] ${i.verdict}`).join(' | ')}` : '',
  ].filter(Boolean).join('\n');
}

/** Both the last full week and the week so far, for ABBA's context. */
export async function reviewContextText(userId: number): Promise<string> {
  try {
    const [last, current, lastMonth] = await Promise.all([
      getPeriodReview(userId, 'week', 1), getPeriodReview(userId, 'week', 0), getPeriodReview(userId, 'month', 1)]);
    return `LAST WEEK\n${reviewText(last)}\n\nTHIS WEEK SO FAR\n${reviewText(current)}\n\nLAST MONTH\n${reviewText(lastMonth)}`;
  } catch (e: any) { return `Review unavailable (${e?.message || 'error'}).`; }
}
