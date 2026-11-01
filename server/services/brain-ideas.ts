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
export async function backtestIdea(userId: number, rule: IdeaRule): Promise<IdeaEvidence> {
  const [trades, shadows] = await Promise.all([
    pool.query(`SELECT symbol, direction, result, profit_loss, created_at FROM ai_trade_results
      WHERE user_id = $1 AND result IN ('WIN','LOSS','BREAKEVEN') AND created_at > now() - interval '365 days'
      ORDER BY created_at DESC LIMIT 3000`, [userId]),
    pool.query(`SELECT symbol, direction, model, day_type, r_multiple, created_at FROM fx_model_decisions
      WHERE user_id = $1 AND engine = 'fx' AND r_multiple IS NOT NULL AND created_at > now() - interval '180 days'
      ORDER BY created_at DESC LIMIT 5000`, [userId]),
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
