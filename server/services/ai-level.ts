// AI usage level — one per-user switch that turns AI call frequency up or down
// across the engines (2026-10-19). Stored in runtime_state ('ai_level', userId)
// so the web service AND the crypto worker read the same value.
//
//   eco      — about half the AI calls: slower FX scans, longer AI-answer reuse,
//              models less often. Cheapest; may react later to fast moves.
//   balanced — the behaviour before this setting existed (default).
//   turbo    — more frequent AI: faster scans, fresher answers. Highest cost.
//
// Safety gates, stops and risk limits are NOT affected — only how often the AI
// is asked.

export type AiLevel = 'eco' | 'balanced' | 'turbo';
export interface AiLevelParams {
  level: AiLevel;
  scanMult: number;          // × FX engine scan interval
  cacheMs: number;           // FX engine reuses an AI answer this long…
  cachePips: number;         // …while price moved less than this
  fxModelsEveryH: number;    // FX Model 1/2 idea pass every N hours
  cryptoSkipMemoryMin: number; // crypto: remember an AI SKIP this long
  cryptoModelsEveryH: number;  // crypto Model 1/2 idea pass every N hours
}

export const AI_LEVELS: Record<AiLevel, AiLevelParams> = {
  eco: { level: 'eco', scanMult: 2, cacheMs: 5 * 60_000, cachePips: 8, fxModelsEveryH: 2, cryptoSkipMemoryMin: 120, cryptoModelsEveryH: 4 },
  balanced: { level: 'balanced', scanMult: 1, cacheMs: 60_000, cachePips: 3, fxModelsEveryH: 1, cryptoSkipMemoryMin: 60, cryptoModelsEveryH: 2 },
  turbo: { level: 'turbo', scanMult: 0.67, cacheMs: 30_000, cachePips: 1.5, fxModelsEveryH: 1, cryptoSkipMemoryMin: 30, cryptoModelsEveryH: 1 },
};

const cache = new Map<number, { at: number; level: AiLevel }>();

/** Synchronous read (hot paths); refreshes from the DB in the background every 60s. */
export function getAiLevelSync(userId: number): AiLevelParams {
  const hit = cache.get(userId);
  if (!hit || Date.now() - hit.at > 60_000) void refresh(userId);
  return AI_LEVELS[hit?.level ?? 'balanced'];
}
export async function getAiLevel(userId: number): Promise<AiLevelParams> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < 60_000) return AI_LEVELS[hit.level];
  return AI_LEVELS[await refresh(userId)];
}
async function refresh(userId: number): Promise<AiLevel> {
  try {
    const { getRuntimeStateStrict } = await import('./runtime-state');
    const v = await getRuntimeStateStrict('ai_level', String(userId));
    const level: AiLevel = v?.level === 'eco' || v?.level === 'turbo' ? v.level : 'balanced';
    cache.set(userId, { at: Date.now(), level });
    return level;
  } catch {
    const prev = cache.get(userId)?.level ?? 'balanced';
    cache.set(userId, { at: Date.now(), level: prev });
    return prev;
  }
}
export async function setAiLevel(userId: number, level: AiLevel): Promise<AiLevelParams> {
  const { pool } = await import('../db');
  const { ensureRuntimeStateTable } = await import('./runtime-state');
  await ensureRuntimeStateTable();
  await pool.query(
    `INSERT INTO runtime_state (scope, key, value, updated_at) VALUES ('ai_level', $1, $2::jsonb, now())
     ON CONFLICT (scope, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [String(userId), JSON.stringify({ level })],
  );
  cache.set(userId, { at: Date.now(), level });
  return AI_LEVELS[level];
}
