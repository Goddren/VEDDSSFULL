// Per-user brain ideas: strategy rules a trader works out with ABBA in chat.
// An idea is a FILTER only — it can block signals or limit them to a scope,
// never open a trade. Ideas start in shadow mode; going live needs a human.
// Each idea is private to its owner (that is what makes a user's brain exclusive).

import { pool } from '../db';
import { sessionFor } from './fx-models';

export const IDEA_SESSIONS = ['Asian', 'London', 'London/NY overlap', 'New York'];
export const IDEA_DAY_TYPES = ['range', 'trend', 'mixed'];
export const IDEA_MODELS = ['M1', 'M2', 'engine'];

export interface IdeaRule {
  action: 'block' | 'only';      // block = skip matching signals; only = skip everything that doesn't match
  symbols: string[];             // empty = every pair
  directions: ('BUY' | 'SELL')[]; // empty = both
  sessions: string[];            // empty = all sessions
  hoursUtc: number[];            // empty = all hours
  dayTypes: string[];            // empty = any day (only checkable on Model 1/2 shadows)
  models: string[];              // empty = all; 'engine' = the live FX engine's own trades
}

export interface IdeaEvidence {
  trades: { matched: number; wouldSkip: number; skipWins: number; skipLosses: number; skipPnl: number; keptPnl: number };
  shadows: { matched: number; wouldSkip: number; skipR: number; keptR: number };
  verdict: string;
}

let ensured: Promise<void> | null = null;
export function ensureBrainIdeasTable(): Promise<void> {
  if (!ensured) {
    ensured = pool.query(`
CREATE TABLE IF NOT EXISTS user_brain_ideas (
  id serial PRIMARY KEY,
  user_id integer NOT NULL,
  title text NOT NULL,
  rule jsonb NOT NULL,
  rationale text,
  evidence jsonb,
  status text NOT NULL DEFAULT 'shadow',
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS user_brain_ideas_user_idx ON user_brain_ideas (user_id, status);`).then(() => undefined)
      .catch((e) => { ensured = null; throw e; });
  }
  return ensured;
}

const norm = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Coerce model/user output into a valid rule. Returns null if nothing usable. */
export function sanitizeRule(r: any): IdeaRule | null {
  if (!r || typeof r !== 'object') return null;
  const arr = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
  const rule: IdeaRule = {
    action: r.action === 'only' ? 'only' : 'block',
    symbols: arr(r.symbols).map(norm).filter((s: string) => s.length >= 3 && s.length <= 12).slice(0, 20),
    directions: arr(r.directions).map((d: any) => String(d).toUpperCase()).filter((d: string) => d === 'BUY' || d === 'SELL') as any,
    sessions: arr(r.sessions).map((s: any) => IDEA_SESSIONS.find((x) => x.toLowerCase() === String(s).toLowerCase())).filter(Boolean) as string[],
    hoursUtc: arr(r.hoursUtc).map((h: any) => Number(h)).filter((h: number) => Number.isInteger(h) && h >= 0 && h <= 23),
    dayTypes: arr(r.dayTypes).map((d: any) => String(d).toLowerCase()).filter((d: string) => IDEA_DAY_TYPES.includes(d)),
    models: arr(r.models).map((m: any) => (/^m?1$/i.test(m) ? 'M1' : /^m?2$/i.test(m) ? 'M2' : String(m).toLowerCase() === 'engine' ? 'engine' : null)).filter(Boolean) as string[],
  };
  // An idea with no conditions at all would block (or allow) everything.
  const hasCondition = rule.symbols.length || rule.directions.length || rule.sessions.length || rule.hoursUtc.length || rule.dayTypes.length;
  return hasCondition ? rule : null;
}

/** Does a signal fall inside the idea's scope? */
export function ruleMatches(rule: IdeaRule, s: { symbol: string; direction?: string | null; at: Date; dayType?: string | null; model: string }): boolean {
  if (rule.models.length && !rule.models.includes(s.model)) return false;
  if (rule.symbols.length && !rule.symbols.includes(norm(s.symbol))) return false;
  if (rule.directions.length && !rule.directions.includes(String(s.direction || '').toUpperCase() as any)) return false;
  if (rule.sessions.length && !rule.sessions.includes(sessionFor(s.at))) return false;
  if (rule.hoursUtc.length && !rule.hoursUtc.includes(s.at.getUTCHours())) return false;
  if (rule.dayTypes.length && (!s.dayType || !rule.dayTypes.includes(s.dayType))) return false;
  return true;
}

/** Would this idea skip the signal? 'only' ideas skip everything outside their scope (within the models they cover). */
export function ruleSkips(rule: IdeaRule, s: Parameters<typeof ruleMatches>[1]): boolean {
  if (rule.action === 'block') return ruleMatches(rule, s);
  if (rule.models.length && !rule.models.includes(s.model)) return false;
  return !ruleMatches(rule, s);
}

/** Replay the idea over the user's closed trades and resolved Model 1/2 shadows. */
export async function backtestIdea(userId: number, rule: IdeaRule, window?: { from: Date; to: Date }): Promise<IdeaEvidence> {
  const from = window?.from ?? new Date(Date.now() - 365 * 86400000);
  const to = window?.to ?? new Date();
  const shadowFrom = window?.from ?? new Date(Date.now() - 180 * 86400000);
  const [trades, shadows] = await Promise.all([
    pool.query(`SELECT symbol, direction, result, profit_loss, created_at FROM ai_trade_results
      WHERE user_id = $1 AND result IN ('WIN','LOSS','BREAKEVEN') AND created_at >= $2 AND created_at < $3
      ORDER BY created_at DESC LIMIT 3000`, [userId, from, to]),
    pool.query(`SELECT symbol, direction, model, day_type, r_multiple, created_at FROM fx_model_decisions
      WHERE user_id = $1 AND engine = 'fx' AND r_multiple IS NOT NULL AND created_at >= $2 AND created_at < $3
      ORDER BY created_at DESC LIMIT 5000`, [userId, shadowFrom, to]),
  ]);
  const t = { matched: 0, wouldSkip: 0, skipWins: 0, skipLosses: 0, skipPnl: 0, keptPnl: 0 };
  for (const r of trades.rows) {
    const sig = { symbol: r.symbol, direction: r.direction, at: new Date(r.created_at), model: 'engine' };
    if (ruleMatches(rule, sig)) t.matched++;
    const pnl = Number(r.profit_loss) || 0;
    if (ruleSkips(rule, sig)) {
      t.wouldSkip++; t.skipPnl += pnl;
      if (r.result === 'WIN') t.skipWins++; else if (r.result === 'LOSS') t.skipLosses++;
    } else t.keptPnl += pnl;
  }
  const sh = { matched: 0, wouldSkip: 0, skipR: 0, keptR: 0 };
  for (const r of shadows.rows) {
    const sig = { symbol: r.symbol, direction: r.direction, at: new Date(r.created_at), dayType: r.day_type, model: r.model };
    if (ruleMatches(rule, sig)) sh.matched++;
    const R = Number(r.r_multiple) || 0;
    if (ruleSkips(rule, sig)) { sh.wouldSkip++; sh.skipR += R; } else sh.keptR += R;
  }
  t.skipPnl = Math.round(t.skipPnl * 100) / 100; t.keptPnl = Math.round(t.keptPnl * 100) / 100;
  sh.skipR = Math.round(sh.skipR * 10) / 10; sh.keptR = Math.round(sh.keptR * 10) / 10;

  const parts: string[] = [];
  if (t.wouldSkip) parts.push(`would have skipped ${t.wouldSkip} real trades (${t.skipWins}W/${t.skipLosses}L, ${t.skipPnl >= 0 ? '+' : '-'}$${Math.abs(t.skipPnl).toFixed(2)})`);
  if (sh.wouldSkip) parts.push(`${sh.wouldSkip} Model 1/2 shadow trades (${sh.skipR >= 0 ? '+' : ''}${sh.skipR}R)`);
  let verdict: string;
  if (!parts.length) verdict = 'No past trades fall under this idea yet, so shadow mode will be the first real test.';
  else {
    const helps = t.skipPnl < 0 || (t.wouldSkip === 0 && sh.skipR < 0);
    const hurts = t.skipPnl > 0 || (t.wouldSkip === 0 && sh.skipR > 0);
    verdict = `This idea ${parts.join(' and ')}. `
      + (helps ? 'Those were net losers, so history backs it.' : hurts ? 'Those were net winners, so history says it would have cost you.' : 'Those roughly broke even.')
      + ((t.wouldSkip + sh.wouldSkip) < 20 ? ' Small sample: treat it as a hunch until shadow mode adds more.' : '');
  }
  return { trades: t, shadows: sh, verdict };
}

export function describeRule(rule: IdeaRule): string {
  const scope = [
    rule.models.length ? rule.models.map((m) => (m === 'engine' ? 'live engine' : m === 'M1' ? 'Model 1' : 'Model 2')).join('/') : null,
    rule.symbols.length ? rule.symbols.join(', ') : 'all pairs',
    rule.directions.length ? rule.directions.join('/') : null,
    rule.sessions.length ? rule.sessions.join('/') + ' session' : null,
    rule.hoursUtc.length ? `hours ${rule.hoursUtc.join(',')} UTC` : null,
    rule.dayTypes.length ? rule.dayTypes.join('/') + ' days' : null,
  ].filter(Boolean).join(', ');
  return rule.action === 'block' ? `Skip signals on: ${scope}` : `Only take signals on: ${scope}`;
}

export async function listIdeas(userId: number) {
  await ensureBrainIdeasTable();
  const { rows } = await pool.query(`SELECT id, title, rule, rationale, evidence, status, created_at FROM user_brain_ideas
    WHERE user_id = $1 AND status <> 'retired' ORDER BY created_at DESC LIMIT 50`, [userId]);
  return rows.map((r) => ({ ...r, summary: describeRule(r.rule) }));
}

export async function saveIdea(userId: number, title: string, rule: IdeaRule, rationale: string) {
  await ensureBrainIdeasTable();
  const evidence = await backtestIdea(userId, rule);
  const { rows } = await pool.query(`INSERT INTO user_brain_ideas (user_id, title, rule, rationale, evidence)
    VALUES ($1, $2, $3, $4, $5) RETURNING id, title, rule, rationale, evidence, status, created_at`,
  [userId, title.slice(0, 120), JSON.stringify(rule), rationale.slice(0, 1000), JSON.stringify(evidence)]);
  return { ...rows[0], summary: describeRule(rows[0].rule) };
}

/** Owner can pause, resume or retire. 'approved' (live) is deliberately not settable here. */
export async function setIdeaStatus(userId: number, id: number, status: 'shadow' | 'paused' | 'retired') {
  await ensureBrainIdeasTable();
  const { rowCount } = await pool.query(`UPDATE user_brain_ideas SET status = $3, updated_at = now()
    WHERE id = $1 AND user_id = $2 AND status <> 'approved'`, [id, userId, status]);
  return (rowCount || 0) > 0;
}

/** One line per active idea for ABBA's context. */
export async function ideasContextText(userId: number): Promise<string> {
  try {
    const ideas = await listIdeas(userId);
    if (!ideas.length) return 'None yet.';
    return ideas.slice(0, 10).map((i: any) => `#${i.id} "${i.title}" [${i.status}] ${i.summary}. Backtest: ${i.evidence?.verdict || 'n/a'}`).join('\n');
  } catch { return 'Unavailable.'; }
}

// ── What-if: which single change would have turned the period's loss into profit? ──
// Tries block rules built from the period's own trades (each pair, session,
// pair+session, pair+direction, direction), replays the period without them,
// then checks the same rule over the prior 90 days so a one-week fluke isn't
// sold as an edge.
export interface WhatIf { rule: IdeaRule; summary: string; periodSkipped: number; periodSaved: number; periodPnlAfter: number; ninetyDaySaved: number; ninetyDaySkipped: number; robust: boolean }

export async function whatIfAnalysis(userId: number, from: Date, to: Date, limit = 5): Promise<{ periodPnl: number; trades: number; options: WhatIf[] }> {
  const { rows } = await pool.query(`SELECT symbol, direction, result, profit_loss, created_at FROM ai_trade_results
    WHERE user_id = $1 AND result IN ('WIN','LOSS','BREAKEVEN') AND COALESCE(closed_at, created_at) >= $2 AND COALESCE(closed_at, created_at) < $3`, [userId, from, to]);
  const periodPnl = Math.round(rows.reduce((s, r) => s + (Number(r.profit_loss) || 0), 0) * 100) / 100;
  if (!rows.length) return { periodPnl, trades: 0, options: [] };

  const keys = new Map<string, any>();
  const add = (r: any) => { const k = JSON.stringify(r); if (!keys.has(k)) keys.set(k, r); };
  for (const t of rows) {
    const s = norm(t.symbol), d = String(t.direction).toUpperCase(), sess = sessionFor(new Date(t.created_at));
    add({ action: 'block', symbols: [s] });
    add({ action: 'block', sessions: [sess] });
    add({ action: 'block', symbols: [s], sessions: [sess] });
    add({ action: 'block', symbols: [s], directions: [d] });
    add({ action: 'block', directions: [d] });
  }
  const before90 = new Date(from.getTime() - 90 * 86400000);
  const scored: WhatIf[] = [];
  for (const raw of Array.from(keys.values())) {
    const rule = sanitizeRule({ ...raw, models: ['engine'] });
    if (!rule) continue;
    let skipped = 0, saved = 0;
    for (const t of rows) {
      if (ruleSkips(rule, { symbol: t.symbol, direction: t.direction, at: new Date(t.created_at), model: 'engine' })) { skipped++; saved -= Number(t.profit_loss) || 0; }
    }
    // Must remove at least 2 trades and recover real money in the period.
    if (skipped < 2 || saved <= 0) continue;
    scored.push({ rule, summary: describeRule(rule), periodSkipped: skipped, periodSaved: Math.round(saved * 100) / 100,
      periodPnlAfter: Math.round((periodPnl + saved) * 100) / 100, ninetyDaySaved: 0, ninetyDaySkipped: 0, robust: false });
  }
  scored.sort((a, b) => b.periodSaved - a.periodSaved);
  const top = scored.slice(0, limit * 2);
  for (const w of top) {
    const ev = await backtestIdea(userId, w.rule, { from: before90, to: from });
    w.ninetyDaySkipped = ev.trades.wouldSkip;
    w.ninetyDaySaved = Math.round(-ev.trades.skipPnl * 100) / 100;
    w.robust = ev.trades.wouldSkip >= 5 && w.ninetyDaySaved > 0;
  }
  // Prefer changes that also held up over the prior 90 days.
  top.sort((a, b) => Number(b.robust) - Number(a.robust) || b.periodSaved - a.periodSaved);
  return { periodPnl, trades: rows.length, options: top.slice(0, limit) };
}

export function whatIfText(label: string, w: Awaited<ReturnType<typeof whatIfAnalysis>>): string {
  if (!w.trades) return `${label}: no closed trades.`;
  if (!w.options.length) return `${label}: ${w.trades} trades, ${w.periodPnl >= 0 ? '+' : '-'}$${Math.abs(w.periodPnl)}. No single filter would have helped.`;
  return `${label}: ${w.trades} trades, ${w.periodPnl >= 0 ? '+' : '-'}$${Math.abs(w.periodPnl)}. Single changes that would have helped (replayed on real trades):\n`
    + w.options.map((o, i) => `${i + 1}. ${o.summary} → skips ${o.periodSkipped} trades, saves $${o.periodSaved}, period ends ${o.periodPnlAfter >= 0 ? '+' : '-'}$${Math.abs(o.periodPnlAfter)}. Prior 90 days: ${o.ninetyDaySkipped} trades, ${o.ninetyDaySaved >= 0 ? 'saved' : 'would have COST'} $${Math.abs(o.ninetyDaySaved)} → ${o.robust ? 'HELD UP' : 'did NOT hold up (likely a fluke)'}.`).join('\n');
}
