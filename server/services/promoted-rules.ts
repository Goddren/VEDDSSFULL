// ── Promoted rules: proven shadow lessons become real guards (step 4) ───────
// Engine report follow-up (2026-11-08). Shadow lessons (shadow-lessons.ts)
// have always been advice only. This module lets the owner promote a PROVEN
// "avoid" lesson into a hard entry block — carefully, one at a time — and
// retire it again at any moment.
//
// The bar (the same bar the lessons file set for going live, mirrored for
// losing setups): verdict 'avoid', 50+ practice trades, avg R ≤ −0.2,
// win rate ≤ 40%, and NO winning week in the last 30 days (checked with a
// dedicated weekly query — the lesson aggregates alone don't carry weeks).
// Eligibility is re-verified on the server at promote time; the client
// cannot talk its way past it.
//
// V1 scope: FX engine only, fx_shadow lessons only, dimensions that map
// cleanly onto an entry decision: session, direction, strategy,
// strategy+symbol, strategy+direction, day_type. (h4_aligned is not
// promotable yet — alignment is not computed at the consult point.)
//
// Rules live in runtime_state ('promoted_rules', userId). Retiring keeps
// the record with active=false. Kill switch: PROMOTED_RULES=off disables
// the engine consult (rules remain stored). The consult FAILS OPEN: any
// error means no block — a broken rule store must never silence the engine.

import { pool } from '../db';
import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';
import { computeShadowLessons, type ShadowLesson } from './shadow-lessons';
import { ensureShadowLedger } from './shadow-ledger';

export interface PromotedRule {
  id: string;
  source: string;
  dimension: string;
  key: string;
  trades: number;
  avgR: number;
  winRate: number;
  promotedAt: string;
  active: boolean;
  retiredAt?: string;
}

const SCOPE = 'promoted_rules';
const PROMOTABLE_DIMS = ['session', 'direction', 'strategy', 'strategy+symbol', 'strategy+direction', 'day_type'];
const MIN_TRADES = () => Number(process.env.PROMOTED_RULE_MIN_TRADES ?? 50);
const MAX_AVG_R = () => Number(process.env.PROMOTED_RULE_MAX_AVG_R ?? -0.2);
const MAX_WIN_RATE = () => Number(process.env.PROMOTED_RULE_MAX_WIN_RATE ?? 0.40);

const DIM_EXPR: Record<string, { expr: string; where?: string }> = {
  session: { expr: `session` },
  strategy: { expr: `strategy` },
  'strategy+symbol': { expr: `strategy || ' · ' || symbol` },
  direction: { expr: `direction` },
  day_type: { expr: `day_type`, where: `day_type IS NOT NULL` },
  'strategy+direction': { expr: `strategy || ' · ' || direction` },
};

// ── Storage (in-memory cache over runtime_state; consult path is hot) ──────
const _cache = new Map<number, { at: number; rules: PromotedRule[] }>();
const CACHE_MS = 30_000;

export async function getPromotedRules(userId: number): Promise<PromotedRule[]> {
  const hit = _cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rules;
  let rules: PromotedRule[] = [];
  try {
    const v = await getRuntimeStateStrict(SCOPE, String(userId));
    if (Array.isArray(v)) rules = v;
  } catch { /* empty */ }
  _cache.set(userId, { at: Date.now(), rules });
  return rules;
}

async function storeRules(userId: number, rules: PromotedRule[]): Promise<void> {
  _cache.set(userId, { at: Date.now(), rules });
  saveRuntimeState(SCOPE, String(userId), rules);
}

// ── Eligibility ─────────────────────────────────────────────────────────────
async function hasWinningWeek(userId: number, lesson: ShadowLesson): Promise<boolean> {
  const dim = DIM_EXPR[lesson.dimension];
  if (!dim) return true; // unknown dimension — treat as unprovable, block promotion
  await ensureShadowLedger();
  const { rows } = await pool.query(
    `SELECT avg(r_multiple)::float AS avg_r
       FROM shadow_ledger
      WHERE user_id = $1 AND source = $2 AND ${dim.expr} = $3
        AND closed_at >= now() - interval '30 days' AND r_multiple IS NOT NULL ${dim.where ? `AND ${dim.where}` : ''}
      GROUP BY date_trunc('week', closed_at)`,
    [userId, lesson.source, lesson.key],
  );
  return rows.some((r: any) => Number(r.avg_r) > 0);
}

export interface LessonEligibility { eligible: boolean; reasons: string[] }

export async function lessonEligibility(userId: number, lesson: ShadowLesson, rules: PromotedRule[]): Promise<LessonEligibility> {
  const reasons: string[] = [];
  if (lesson.source !== 'fx_shadow') reasons.push('v1 promotes FX lessons only');
  if (lesson.verdict !== 'avoid') reasons.push('only proven losing setups (AVOID lessons) can be promoted');
  if (!PROMOTABLE_DIMS.includes(lesson.dimension)) reasons.push(`the ${lesson.dimension} dimension cannot be checked at entry yet`);
  if (lesson.trades < MIN_TRADES()) reasons.push(`needs ${MIN_TRADES()}+ practice trades (has ${lesson.trades})`);
  if (lesson.avgR > MAX_AVG_R()) reasons.push(`needs avg R ≤ ${MAX_AVG_R()} (is ${lesson.avgR.toFixed(2)})`);
  if (lesson.winRate > MAX_WIN_RATE()) reasons.push(`needs win rate ≤ ${Math.round(MAX_WIN_RATE() * 100)}% (is ${Math.round(lesson.winRate * 100)}%)`);
  if (rules.some((r) => r.active && r.source === lesson.source && r.dimension === lesson.dimension && r.key === lesson.key)) {
    reasons.push('already a guard');
  }
  if (reasons.length === 0) {
    try {
      if (await hasWinningWeek(userId, lesson)) reasons.push('had a winning week in the last 30 days');
    } catch { reasons.push('weekly check failed — cannot verify'); }
  }
  return { eligible: reasons.length === 0, reasons };
}

/** FX lessons with their promotion eligibility, for the panel. */
export async function getPromotableLessons(userId: number): Promise<{ lessons: Array<ShadowLesson & { eligibility: LessonEligibility }>; rules: PromotedRule[] }> {
  const [lessons, rules] = await Promise.all([computeShadowLessons(userId), getPromotedRules(userId)]);
  const fx = lessons.filter((l) => l.source === 'fx_shadow');
  const withEligibility = await Promise.all(fx.map(async (l) => ({ ...l, eligibility: await lessonEligibility(userId, l, rules) })));
  return { lessons: withEligibility, rules };
}

// ── Promote / retire ────────────────────────────────────────────────────────
export async function promoteLesson(userId: number, sel: { source: string; dimension: string; key: string }): Promise<{ ok: boolean; rule?: PromotedRule; reasons?: string[] }> {
  const lessons = await computeShadowLessons(userId);
  const lesson = lessons.find((l) => l.source === sel.source && l.dimension === sel.dimension && l.key === sel.key);
  if (!lesson) return { ok: false, reasons: ['lesson not found in the current 30-day evidence'] };
  const rules = await getPromotedRules(userId);
  const elig = await lessonEligibility(userId, lesson, rules);
  if (!elig.eligible) return { ok: false, reasons: elig.reasons };
  const rule: PromotedRule = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    source: lesson.source, dimension: lesson.dimension, key: lesson.key,
    trades: lesson.trades, avgR: lesson.avgR, winRate: lesson.winRate,
    promotedAt: new Date().toISOString(), active: true,
  };
  await storeRules(userId, [...rules, rule]);
  return { ok: true, rule };
}

export async function retireRule(userId: number, id: string): Promise<{ ok: boolean }> {
  const rules = await getPromotedRules(userId);
  const next = rules.map((r) => r.id === id ? { ...r, active: false, retiredAt: new Date().toISOString() } : r);
  if (!next.some((r) => r.id === id)) return { ok: false };
  await storeRules(userId, next);
  return { ok: true };
}

// ── Engine consult ──────────────────────────────────────────────────────────
export interface EntryContext { strategy?: string | null; symbol?: string | null; direction?: string | null; session?: string | null; dayType?: string | null }

const normSym = (s: string) => s.toUpperCase().replace('/', '');

export async function checkPromotedRules(userId: number, ctx: EntryContext): Promise<PromotedRule | null> {
  if (process.env.PROMOTED_RULES === 'off') return null;
  const rules = (await getPromotedRules(userId)).filter((r) => r.active);
  if (!rules.length) return null;
  const dir = (ctx.direction || '').toUpperCase();
  const strat = ctx.strategy || '';
  const sym = ctx.symbol ? normSym(ctx.symbol) : '';
  for (const r of rules) {
    switch (r.dimension) {
      case 'session': if (ctx.session && r.key === ctx.session) return r; break;
      case 'direction': if (dir && r.key === dir) return r; break;
      case 'strategy': if (strat && r.key === strat) return r; break;
      case 'strategy+symbol': if (strat && sym && r.key === `${strat} · ${sym}`) return r; break;
      case 'strategy+direction': if (strat && dir && r.key === `${strat} · ${dir}`) return r; break;
      case 'day_type': if (ctx.dayType && r.key === ctx.dayType) return r; break;
    }
  }
  return null;
}
