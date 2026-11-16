/**
 * Crypto shadow promotions — "shadow 'avoid' buckets become live hot-wallet
 * guards" — verification checks (2026-11-15).
 *
 * Run:  node --import tsx/esm scripts/check-crypto-shadow-promotions.ts
 *
 * No database and no broker are touched: the candidate bar is the shadow
 * lane's OWN aggregate() walked across its thresholds, the matcher is
 * pure, the fail-open consult is exercised against the unreachable
 * localhost fallback (DATABASE_URL unset, as in this repo's check setup),
 * and the wiring is pinned by source checks: tap-only promotion (the two
 * POST routes are the only write paths; no timers in the module), the
 * consult sitting in the live DeFi branch before the swap and never in
 * the paper path, the shared audit lane, and the shadow lane's own gate
 * untouched.
 *
 *   A. aggregate() — the avoid bar (n ≥ 15, median net < −1%).
 *   B. matchCryptoPromotion — overall-first matching, retire = no match.
 *   C. Kill switch CRYPTO_SHADOW_PROMOTIONS.
 *   D. Fail-open consult with no reachable store.
 *   E. Source pins — wiring, tap-only, audit, isolation.
 */
import { readFileSync } from 'node:fs';
import { aggregate, type BucketStat } from '../server/services/crypto-shadow';
import {
  matchCryptoPromotion, cryptoShadowPromotionsOn,
  checkCryptoPromotion, hasActiveCryptoPromotion, promoteAllCryptoBuckets,
  type CryptoShadowPromotion,
} from '../server/services/crypto-shadow-promotions';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── A. The bar: the lane's own aggregate() ────────────────────────────────
// Context rows as computeCryptoShadowStats reads them from
// crypto_shadow_context; only net_pct and the bucketed fields matter.
const row = (over: Record<string, any>): Record<string, any> => ({
  strategy: 'momentum', direction: 'long', hour_utc: 13, liquidity_usd: 2_000_000,
  change_24h: 3, atr_pct: 2, htf_aligned: true, btc_change_24h: 0,
  buy_share_h1: 0.6, txns_h1: 150, market_cap_usd: 50e6, token_age_hours: 100,
  net_pct: -2, ...over,
});
const rows = (n: number, over: Record<string, any>) => Array.from({ length: n }, () => row(over));
const allStat = (stats: BucketStat[], strategy = 'momentum') => stats.find((s) => s.strategy === strategy && s.dim === 'all');

check('A1 15 closes at median −2% is avoid', allStat(aggregate(rows(15, {})))?.verdict === 'avoid');
check('A2 14 closes never condemns (n bar)', allStat(aggregate(rows(14, {})))?.verdict === 'learning');
check('A3 median −0.5% is not avoid', allStat(aggregate(rows(15, { net_pct: -0.5 })))?.verdict !== 'avoid');
check('A4 median exactly −1% is not avoid (bar is strictly worse than −1%)', allStat(aggregate(rows(15, { net_pct: -1 })))?.verdict !== 'avoid');
check('A5 median −1.01% is avoid', allStat(aggregate(rows(15, { net_pct: -1.01 })))?.verdict === 'avoid');
{
  // Dim specificity: thin-liquidity trades bleed, deep-liquidity trades
  // profit — the '<250k' bucket is avoid while the strategy overall is not.
  const mixed = [...rows(15, { liquidity_usd: 100_000, net_pct: -3 }), ...rows(15, { liquidity_usd: 2_000_000, net_pct: 1 })];
  const stats = aggregate(mixed);
  check('A6 a single dim bucket can be avoid while the strategy overall is not',
    stats.find((s) => s.dim === 'liquidity' && s.bucket === '<250k')?.verdict === 'avoid'
    && allStat(stats)?.verdict !== 'avoid',
    `overall median ${allStat(stats)?.medianNet}`);
  check('A7 win rate rides along on the stat', stats.find((s) => s.dim === 'liquidity' && s.bucket === '1-5M')?.winRate === 1);
}

// ── B. matchCryptoPromotion ───────────────────────────────────────────────
const promo = (over: Partial<CryptoShadowPromotion>): CryptoShadowPromotion => ({
  id: 'csp_test', strategy: 'momentum', dim: 'all', bucket: 'all',
  n: 20, medianNet: -2.4, winRate: 0.3, promotedAt: new Date().toISOString(), active: true, ...over,
});
check('B1 overall promotion blocks any context', matchCryptoPromotion([promo({})], 'momentum', { liquidity: '1-5M' })?.dim === 'all');
check('B2 dim promotion blocks its bucket', matchCryptoPromotion([promo({ dim: 'liquidity', bucket: '<250k' })], 'momentum', { liquidity: '<250k' })?.bucket === '<250k');
check('B3 dim promotion spares other buckets', matchCryptoPromotion([promo({ dim: 'liquidity', bucket: '<250k' })], 'momentum', { liquidity: '1-5M' }) === null);
check('B4 retired promotion never blocks', matchCryptoPromotion([promo({ active: false })], 'momentum', {}) === null);
check('B5 another strategy’s promotion never blocks', matchCryptoPromotion([promo({ strategy: 'breakout' })], 'momentum', {}) === null);
check('B6 overall beats a dim match (broader condemnation first)',
  matchCryptoPromotion([promo({ id: 'dim', dim: 'liquidity', bucket: '<250k' }), promo({ id: 'all' })], 'momentum', { liquidity: '<250k' })?.id === 'all');
check('B7 no promotions, no block', matchCryptoPromotion([], 'momentum', { liquidity: '<250k' }) === null);

// ── C. Kill switch ────────────────────────────────────────────────────────
delete process.env.CRYPTO_SHADOW_PROMOTIONS;
check('C1 promotions default ON', cryptoShadowPromotionsOn() === true);
process.env.CRYPTO_SHADOW_PROMOTIONS = 'off';
check('C2 CRYPTO_SHADOW_PROMOTIONS=off disables', cryptoShadowPromotionsOn() === false);
delete process.env.CRYPTO_SHADOW_PROMOTIONS;

// ── D. Fail-open consult (no reachable store) ─────────────────────────────
{
  const hit = await checkCryptoPromotion(1, 'momentum', { liquidity: '<250k' }).then((v) => v, () => 'rejected' as const);
  check('D1 consult resolves null (never rejects) with the store unreachable', hit === null);
  const has = await hasActiveCryptoPromotion(1, 'momentum').then((v) => v, () => 'rejected' as const);
  check('D2 pre-check resolves false (never rejects) with the store unreachable', has === false);
  process.env.CRYPTO_SHADOW_PROMOTIONS = 'off';
  const off = await checkCryptoPromotion(1, 'momentum', {}).then((v) => v, () => 'rejected' as const);
  check('D3 kill switch short-circuits the consult to null', off === null);
  delete process.env.CRYPTO_SHADOW_PROMOTIONS;
}

// ── E. Source pins ────────────────────────────────────────────────────────
const mod = src('../server/services/crypto-shadow-promotions.ts');
const scanner = src('../server/services/cryptocom-scanner.ts');
const routes = src('../server/routes.ts');
const shadowLane = src('../server/services/crypto-shadow.ts');
const gate = src('../server/services/shadow-lesson-gate.ts');
const panel = src('../client/src/components/engine-safeguards-panel.tsx');
const page = src('../client/src/pages/guards-trails.tsx');

check('E1 promotions live in their own runtime_state scope', mod.includes("const SCOPE = 'crypto_shadow_promotions'"));
check('E2 no timers in the module — nothing can auto-promote', !/setInterval|setTimeout/.test(mod));
check('E3 promote re-verifies against FRESH stats', mod.includes('computeCryptoShadowStats(userId, true)') && mod.includes("stat.verdict !== 'avoid'"));
check('E4 candidates are the lane’s avoid verdicts only', mod.includes("s.verdict === 'avoid'"));
check('E5 consult checks the kill switch and fails open', mod.includes('export async function checkCryptoPromotion') && /checkCryptoPromotion[\s\S]{0,400}catch \{ return null; \}/.test(mod));
check('E6 audit lane exists in the shared audit table types', gate.includes("'crypto_promotion'"));
check('E7 scanner consults before the swap is attempted',
  scanner.includes('hasActiveCryptoPromotion(userId, result.strategy)')
  && scanner.indexOf('checkCryptoPromotion(userId, result.strategy') > -1
  && scanner.indexOf('checkCryptoPromotion(userId, result.strategy') < scanner.indexOf('defiEntryBuy'));
check('E8 the consult never runs for paper entries', /Promoted crypto shadow lessons[\s\S]{0,1200}?if \(!\(cfg as any\)\._paper\) \{/.test(scanner));
check('E9 blocks are audited and surfaced as skips',
  scanner.includes("lane: 'crypto_promotion'") && scanner.includes('entry blocked by a promoted shadow lesson'));
check('E10 live context is built with the shadow lane’s own bucketsOf', scanner.includes("const { bucketsOf, oldestFirst, trendOf, pctChange } = await import('./crypto-shadow')"));
check('E11 the three routes exist and only they write',
  routes.includes('app.get("/api/engine/crypto-shadow-promotions"')
  && routes.includes('app.post("/api/engine/crypto-shadow-promotions"')
  && routes.includes('app.post("/api/engine/crypto-shadow-promotions/retire"')
  && routes.includes('promoteCryptoBucket') && routes.includes('retireCryptoPromotion'));
check('E12 shadow lane behavior unchanged (its own gate intact)',
  shadowLane.includes('cryptoShadowLessonsOn()') && shadowLane.includes('matchingAvoidBucket(stats, strat, bucketsOf(ctx), { includeAll: true })'));
check('E13 panel + page wiring', panel.includes('"/api/engine/crypto-shadow-promotions"') && page.includes('<CryptoShadowPromotionsPanel />'));

// ── F. Bulk promotion (one tap for every current candidate) ──────────────
// The batch is a loop over the single-promote path: same fresh-stats
// re-verification per bucket, recovered/already-guarded buckets skipped
// with the single path's own reasons, summary counts from the arrays.
// The kill switch is checked before any store access, so F1 is exact
// even with no database reachable.
{
  process.env.CRYPTO_SHADOW_PROMOTIONS = 'off';
  const blocked = await promoteAllCryptoBuckets(1);
  check('F1 kill switch blocks the batch (403, nothing promoted or skipped)',
    blocked.ok === false && blocked.status === 403 && blocked.promotedCount === 0 && blocked.skippedCount === 0
    && blocked.promoted.length === 0 && blocked.skipped.length === 0);
  delete process.env.CRYPTO_SHADOW_PROMOTIONS;
}
const bulkBody = mod.slice(mod.indexOf('export async function promoteAllCryptoBuckets'), mod.indexOf('export async function retireCryptoPromotion'));
check('F2 bulk takes the CURRENT candidate list from the panel builder', bulkBody.includes('getCryptoPromotionPanel(userId)'));
check('F3 bulk promotes through the SAME single-promote path (no forked write)',
  bulkBody.includes('promoteCryptoBucket(userId') && !bulkBody.includes('storePromotions'));
check('F4 summary counts are the array lengths (no invented numbers)',
  bulkBody.includes('promotedCount: promoted.length') && bulkBody.includes('skippedCount: skipped.length'));
check('F5 skips carry the single path’s own refusal reason',
  bulkBody.includes('reason: out.error ??'));
check('F6 kill switch is checked before the candidate list is built',
  bulkBody.indexOf('cryptoShadowPromotionsOn()') > -1 && bulkBody.indexOf('cryptoShadowPromotionsOn()') < bulkBody.indexOf('getCryptoPromotionPanel'));
check('F7 the bulk route exists and delegates to the service',
  routes.includes('app.post("/api/engine/crypto-shadow-promotions/promote-all"') && routes.includes('promoteAllCryptoBuckets'));
check('F8 panel wires the bulk button + verbatim result rendering',
  panel.includes('"/api/engine/crypto-shadow-promotions/promote-all"') && panel.includes('Make all') && panel.includes('bulkResult.skipped.map'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
