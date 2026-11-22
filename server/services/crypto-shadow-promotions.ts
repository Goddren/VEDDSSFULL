// ── Crypto shadow promotions: proven shadow losers become live guards ──────
// (2026-11-15, Chris's directive.) The crypto shadow lane (crypto-shadow.ts)
// grades every strategy × context bucket by MEDIAN net % over a rolling 60
// days, and since PR #68 the lane acts on its own 'avoid' verdicts — inside
// shadow only. The live DeFi hot wallet never saw them: it kept taking the
// exact setups shadow had already proven losing. This module is the bridge,
// mirroring the FX lesson-promotion shape (promoted-rules.ts):
//
//   • candidates = the lane's OWN 'avoid' verdicts — the same bar the
//     shadow gate uses (aggregate() in crypto-shadow.ts: n ≥ 15 resolved
//     closes, median net < −1%, rolling 60 days). No second bar is invented
//     here; if the lane's thresholds move, the candidates move with them.
//   • promotion is the owner's TAP ONLY — one bucket at a time, or every
//     current candidate at once via the bulk tap (promoteAllCryptoBuckets,
//     2026-11-15: one-by-one was "too many to tap through"). Either way the
//     evidence is re-verified server-side at promote time (fresh stats —
//     the client cannot talk its way past the bar): the bulk path runs
//     each candidate through the SAME promoteCryptoBucket below, so a
//     bucket that recovered since the panel loaded is skipped, never
//     promoted, and the batch reports exactly what happened per bucket.
//   • a promoted bucket blocks matching LIVE DeFi hot-wallet entries
//     (cryptocom-scanner's DeFi branch consults before it sizes or swaps).
//     Every block is audited in the shared shadow_lesson_blocks table
//     (lane 'crypto_promotion', throttled like every other lane) and
//     surfaced in the engine activity feed as a skip.
//   • retiring keeps the record with active=false; matching entries flow
//     again immediately. Nothing auto-promotes, ever.
//
// Scope, honestly: the consult lives in the DeFi hot-wallet entry path —
// the venue whose tokens the shadow lane actually studies (its buckets are
// DeFi pool context: liquidity, market cap, token age, order flow). The
// perps / Hyperliquid / CeFi spot arms trade exchange symbols the shadow
// lane never graded, so promotions do not gate them. Paper entries are
// practice and are NOT blocked (they keep generating evidence).
//
// Promotions live in runtime_state ('crypto_shadow_promotions', userId).
// Kill switch: CRYPTO_SHADOW_PROMOTIONS=off makes the consult ignore
// promotions entirely (they remain stored). The consult FAILS OPEN: any
// error means no block — a broken store must never silence the engine.

import { getRuntimeStateStrict, saveRuntimeState } from './runtime-state';
import { computeCryptoShadowStats, computeCryptoShadowAiJudge, type BucketStat, type AiJudgeStat } from './crypto-shadow';

export interface CryptoShadowPromotion {
  id: string;
  strategy: string;
  /** Bucket dimension: 'all' (the whole strategy) or a bucketsOf() dim. */
  dim: string;
  /** Bucket label within the dim ('all' when dim is 'all'). */
  bucket: string;
  /** Evidence snapshot at promotion time. */
  n: number;
  medianNet: number;
  winRate: number;
  promotedAt: string;
  active: boolean;
  retiredAt?: string;
}

export interface CryptoPromotionCandidate extends BucketStat {
  alreadyGuarded: boolean;
}

const SCOPE = 'crypto_shadow_promotions';

export function cryptoShadowPromotionsOn(): boolean {
  return process.env.CRYPTO_SHADOW_PROMOTIONS !== 'off';
}

// ── Storage (in-memory cache over runtime_state; consult path is hot) ──────
const _cache = new Map<number, { at: number; promotions: CryptoShadowPromotion[] }>();
const CACHE_MS = 30_000;

export async function getCryptoPromotions(userId: number): Promise<CryptoShadowPromotion[]> {
  const hit = _cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.promotions;
  let promotions: CryptoShadowPromotion[] = [];
  try {
    const v = await getRuntimeStateStrict(SCOPE, String(userId));
    if (Array.isArray(v)) promotions = v;
  } catch { /* empty */ }
  _cache.set(userId, { at: Date.now(), promotions });
  return promotions;
}

async function storePromotions(userId: number, promotions: CryptoShadowPromotion[]): Promise<void> {
  _cache.set(userId, { at: Date.now(), promotions });
  saveRuntimeState(SCOPE, String(userId), promotions);
}

// ── Candidates ──────────────────────────────────────────────────────────────
/** The lane's 'avoid' verdicts (its own bar — see header), flagged when a
 *  promotion already covers them, plus the stored promotions themselves. */
export async function getCryptoPromotionPanel(userId: number): Promise<{ candidates: CryptoPromotionCandidate[]; promotions: CryptoShadowPromotion[]; aiJudge: AiJudgeStat[] }> {
  const [stats, promotions, aiJudge] = await Promise.all([
    computeCryptoShadowStats(userId), getCryptoPromotions(userId),
    // The AI judge scoreboard rides this panel payload (its section sits
    // directly under this one on Guards & Trails). Evidence only — a
    // judge read failure must never take the promotions panel down.
    computeCryptoShadowAiJudge(userId).catch(() => [] as AiJudgeStat[]),
  ]);
  const activeKeys = new Set(promotions.filter((p) => p.active).map((p) => `${p.strategy}|${p.dim}|${p.bucket}`));
  const candidates = stats
    .filter((s) => s.verdict === 'avoid')
    .map((s) => ({ ...s, alreadyGuarded: activeKeys.has(`${s.strategy}|${s.dim}|${s.bucket}`) }))
    .sort((a, b) => b.n - a.n);
  return { candidates, promotions, aiJudge };
}

// ── Promote / retire (tap-only; eligibility re-verified at promote time) ────
export async function promoteCryptoBucket(userId: number, sel: { strategy: string; dim: string; bucket: string }): Promise<{ ok: boolean; promotion?: CryptoShadowPromotion; status?: number; error?: string }> {
  // Fresh stats on purpose: promotion re-verifies the evidence the way
  // promoted-rules.ts re-verifies FX lessons at tap time.
  const stats = await computeCryptoShadowStats(userId, true);
  const stat = stats.find((s) => s.strategy === sel.strategy && s.dim === sel.dim && s.bucket === sel.bucket);
  if (!stat || stat.verdict !== 'avoid') {
    return { ok: false, status: 422, error: 'That shadow bucket no longer qualifies (its rolling 60-day record changed since the list was built). Refresh and check the current numbers.' };
  }
  const promotions = await getCryptoPromotions(userId);
  if (promotions.some((p) => p.active && p.strategy === sel.strategy && p.dim === sel.dim && p.bucket === sel.bucket)) {
    return { ok: false, status: 409, error: 'An active guard already covers this bucket.' };
  }
  const promotion: CryptoShadowPromotion = {
    id: `csp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    strategy: stat.strategy, dim: stat.dim, bucket: stat.bucket,
    n: stat.n, medianNet: stat.medianNet, winRate: stat.winRate,
    promotedAt: new Date().toISOString(), active: true,
  };
  await storePromotions(userId, [...promotions, promotion]);
  return { ok: true, promotion };
}

export interface CryptoBulkSkip { strategy: string; dim: string; bucket: string; reason: string }
export interface CryptoBulkResult {
  ok: boolean; status?: number; error?: string;
  promoted: CryptoShadowPromotion[]; skipped: CryptoBulkSkip[];
  promotedCount: number; skippedCount: number;
}

/**
 * The bulk tap: promote EVERY current candidate in one action. This is a
 * loop over the single-promote path, not a second implementation — each
 * candidate goes through promoteCryptoBucket, which re-verifies the
 * bucket against FRESH stats and refuses (422) a bucket that no longer
 * qualifies and (409) one already guarded; both land in `skipped` with
 * the single path's own reason. The batch is the owner's one explicit
 * tap, so there is no per-bucket confirmation — and no per-bucket
 * shortcut either. Kill switch off → the batch is unavailable (with the
 * switch off the consult ignores promotions entirely, so bulk-creating
 * inert guards would only mislead).
 */
export async function promoteAllCryptoBuckets(userId: number): Promise<CryptoBulkResult> {
  const empty = { promoted: [] as CryptoShadowPromotion[], skipped: [] as CryptoBulkSkip[], promotedCount: 0, skippedCount: 0 };
  if (!cryptoShadowPromotionsOn()) {
    return { ok: false, status: 403, error: 'Crypto shadow promotions are switched off (CRYPTO_SHADOW_PROMOTIONS=off) — bulk promotion is unavailable.', ...empty };
  }
  const { candidates } = await getCryptoPromotionPanel(userId);
  const promoted: CryptoShadowPromotion[] = [];
  const skipped: CryptoBulkSkip[] = [];
  for (const c of candidates) {
    const out = await promoteCryptoBucket(userId, { strategy: c.strategy, dim: c.dim, bucket: c.bucket });
    if (out.ok && out.promotion) promoted.push(out.promotion);
    else skipped.push({ strategy: c.strategy, dim: c.dim, bucket: c.bucket, reason: out.error ?? 'That bucket could not be promoted.' });
  }
  return { ok: true, promoted, skipped, promotedCount: promoted.length, skippedCount: skipped.length };
}

export async function retireCryptoPromotion(userId: number, id: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  const promotions = await getCryptoPromotions(userId);
  const p = promotions.find((x) => x.id === id);
  if (!p) return { ok: false, status: 404, error: 'Guard not found.' };
  p.active = false;
  p.retiredAt = new Date().toISOString();
  await storePromotions(userId, promotions);
  return { ok: true };
}

// ── Engine consult (hot path — cached, fail-open) ───────────────────────────
/**
 * Pure matcher, the same shape as the shadow gate's matchingAvoidBucket:
 * the strategy's OVERALL promotion (dim 'all') condemns any context;
 * otherwise a promotion condemns only entries whose own bucket for that
 * dim matches. Retired promotions never match. Exported for the check
 * script.
 */
export function matchCryptoPromotion(promotions: CryptoShadowPromotion[], strategy: string, buckets: Record<string, string>): CryptoShadowPromotion | null {
  const act = promotions.filter((p) => p.active && p.strategy === strategy);
  if (!act.length) return null;
  const all = act.find((p) => p.dim === 'all');
  if (all) return all;
  return act.find((p) => buckets[p.dim] === p.bucket) ?? null;
}

/** Cheap pre-check so the entry path only builds bucket context when a
 *  promotion could actually bite for this strategy. Fail-open. */
export async function hasActiveCryptoPromotion(userId: number, strategy: string): Promise<boolean> {
  if (!cryptoShadowPromotionsOn()) return false;
  try {
    return (await getCryptoPromotions(userId)).some((p) => p.active && p.strategy === strategy);
  } catch { return false; }
}

/**
 * The live consult: returns the promotion that blocks this entry, or
 * null. Kill switch off → null. Any error → null (fail open).
 */
export async function checkCryptoPromotion(userId: number, strategy: string, buckets: Record<string, string>): Promise<CryptoShadowPromotion | null> {
  if (!cryptoShadowPromotionsOn()) return null;
  try {
    return matchCryptoPromotion(await getCryptoPromotions(userId), strategy, buckets);
  } catch { return null; }
}
