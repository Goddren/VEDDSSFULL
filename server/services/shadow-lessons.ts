// ─────────────────────────────────────────────────────────────────────────────
// Shadow lessons (2026-10-30) — step 3 of "shadows → brain add-ons".
//
// Reads the shared shadow ledger (shadow-ledger.ts) and turns it into plain-
// English, evidence-backed lessons with sample sizes, e.g.
//   "FX shadow · session Overlap: 53 trades, 49% wins, +0.70R avg — FAVOR"
// Each engine's AI gets the lessons that apply to it as "what our shadows
// have learned" — ADVICE ONLY at this stage. Turning proven lessons into
// hard gates is step 4 (same bar as going live: 50+ trades, ≥+0.2R avg,
// ≥40% wins, no losing week).
//
// Refreshed lazily at most every SHADOW_LESSONS_TTL_H hours (6) per user and
// stored in runtime_state ('shadow_lessons', userId) so a restart doesn't
// lose them and step 4's dashboard can read them.
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { ensureShadowLedger } from './shadow-ledger';

export interface ShadowLesson {
  source: string;          // fx_shadow | crypto_shadow | crypto_paper | sol_paper
  dimension: string;       // session | strategy | strategy+symbol | direction | day_type | h4_aligned | hour
  key: string;             // e.g. "Overlap", "M2", "M2 · EURUSD", "SHORT"
  trades: number; wins: number; winRate: number; avgR: number; totalR: number;
  verdict: 'favor' | 'avoid';
  strength: 'early' | 'moderate' | 'strong';   // 8–14 / 15–29 / 30+ trades
  text: string;
}

const MIN_TRADES = () => Number(process.env.SHADOW_LESSON_MIN_TRADES ?? 8);
const EDGE_R = () => Number(process.env.SHADOW_LESSON_EDGE_R ?? 0.3);
const TTL_MS = () => Math.max(1, Number(process.env.SHADOW_LESSONS_TTL_H ?? 6)) * 3_600_000;
const SOURCE_LABEL: Record<string, string> = {
  fx_shadow: 'FX shadow models', crypto_shadow: 'Crypto shadow models', crypto_paper: 'Crypto paper engine', sol_paper: 'Sol paper engine',
};
/** Which ledger sources inform which engine's AI. */
const ENGINE_SOURCES: Record<string, string[]> = {
  fx: ['fx_shadow'], crypto: ['crypto_paper', 'crypto_shadow'], sol: ['sol_paper'],
};

const _mem = new Map<number, { at: number; lessons: ShadowLesson[] }>();

export async function computeShadowLessons(userId: number, days = 30): Promise<ShadowLesson[]> {
  await ensureShadowLedger();
  const dims: Array<{ dimension: string; expr: string; where?: string }> = [
    { dimension: 'session', expr: `session` },
    { dimension: 'strategy', expr: `strategy` },
    { dimension: 'strategy+symbol', expr: `strategy || ' · ' || symbol` },
    { dimension: 'direction', expr: `direction` },
    { dimension: 'day_type', expr: `day_type`, where: `day_type IS NOT NULL` },
    { dimension: 'h4_aligned', expr: `CASE WHEN h4_aligned THEN 'with the H4 trend' ELSE 'against the H4 trend' END`, where: `context_reliable AND h4_aligned IS NOT NULL` },
    { dimension: 'strategy+direction', expr: `strategy || ' · ' || direction` },
  ];
  const out: ShadowLesson[] = [];
  for (const d of dims) {
    const { rows } = await pool.query(
      `SELECT source, ${d.expr} AS key, count(*)::int AS trades, count(*) FILTER (WHERE result='WIN')::int AS wins,
              avg(r_multiple)::float AS avg_r, sum(r_multiple)::float AS total_r
         FROM shadow_ledger
        WHERE user_id=$1 AND closed_at >= now() - ($2 || ' days')::interval AND r_multiple IS NOT NULL ${d.where ? `AND ${d.where}` : ''}
        GROUP BY 1,2 HAVING count(*) >= $3`,
      [userId, String(days), MIN_TRADES()],
    );
    for (const r of rows) {
      const avgR = Number(r.avg_r) || 0;
      if (Math.abs(avgR) < EDGE_R() || r.key == null) continue;
      const winRate = r.trades ? r.wins / r.trades : 0;
      const verdict: 'favor' | 'avoid' = avgR > 0 ? 'favor' : 'avoid';
      const strength = r.trades >= 30 ? 'strong' : r.trades >= 15 ? 'moderate' : 'early';
      // Spell out the shadow model ids so the live engines' AI understands them.
      const keyLabel = String(r.key).replace(/\bM1\b/g, 'Model 1 (range)').replace(/\bM2\b/g, 'Model 2 (trend)');
      const label = `${SOURCE_LABEL[r.source] || r.source} · ${d.dimension.replace('+', ' + ').replace('_', ' ')} ${keyLabel}`;
      out.push({
        source: r.source, dimension: d.dimension, key: String(r.key), trades: r.trades, wins: r.wins, winRate, avgR, totalR: Number(r.total_r) || 0,
        verdict, strength,
        text: `${label}: ${r.trades} trades, ${Math.round(winRate * 100)}% wins, ${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R avg → ${verdict === 'favor' ? 'FAVOR' : 'AVOID'} (${strength} evidence)`,
      });
    }
  }
  // Strongest evidence first: more trades, then bigger edge.
  out.sort((a, b) => b.trades - a.trades || Math.abs(b.avgR) - Math.abs(a.avgR));
  return out;
}

/** Cached lessons (recomputed when older than the TTL). Never throws. */
export async function getShadowLessons(userId: number, force = false): Promise<{ at: number; lessons: ShadowLesson[] }> {
  const hit = _mem.get(userId);
  if (!force && hit && Date.now() - hit.at < TTL_MS()) return hit;
  try {
    if (!force) {
      const { getRuntimeStateStrict } = await import('./runtime-state');
      const stored = await getRuntimeStateStrict('shadow_lessons', String(userId)).catch(() => null);
      if (stored && Date.now() - Number(stored.at) < TTL_MS() && Array.isArray(stored.lessons)) {
        _mem.set(userId, stored); return stored;
      }
    }
    const fresh = { at: Date.now(), lessons: await computeShadowLessons(userId) };
    _mem.set(userId, fresh);
    const { saveRuntimeState } = await import('./runtime-state');
    saveRuntimeState('shadow_lessons', String(userId), fresh);
    return fresh;
  } catch (e: any) {
    console.error('[shadow-lessons] compute failed (non-fatal):', e?.message || e);
    return hit || { at: 0, lessons: [] };
  }
}

/**
 * Prompt block for one engine's AI ('' when there's nothing worth saying).
 * Advice only — the engine's own gates still decide.
 */
export async function getShadowLessonsText(userId: number, engine: 'fx' | 'crypto' | 'sol', max = 10): Promise<string> {
  if (process.env.SHADOW_LESSONS === 'off') return '';
  try {
    const { lessons } = await getShadowLessons(userId);
    const mine = lessons.filter((l) => (ENGINE_SOURCES[engine] || []).includes(l.source)).slice(0, max);
    if (!mine.length) return '';
    return `WHAT OUR SHADOW / PAPER TRADING HAS LEARNED (last 30 days, real outcomes — weigh these; don't ignore strong ones):
${mine.map((l) => `- ${l.text}`).join('\n')}
Lean toward setups matching FAVOR lessons and be much more selective with setups matching AVOID lessons. "Early" evidence is a hint, "strong" evidence is reliable.`;
  } catch {
    return '';
  }
}
