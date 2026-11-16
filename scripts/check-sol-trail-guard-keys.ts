/**
 * Sol trail guards are STRATEGY-keyed, never per-token — verification
 * checks (2026-11-15, Chris's directive).
 *
 * Run:  node --import tsx/esm scripts/check-sol-trail-guard-keys.ts
 *
 * Why: Sol tokens are routinely pump-and-dump — a trail guard built for
 * one token is a guard for something that may not exist next week. The
 * durable evidence is the strategy's pooled record across tokens (the
 * same reasoning the PR #68 Sol lesson gate uses). Before this change
 * the trail-guard candidate list ALSO drew from the study's per-symbol
 * Sol grouping, so a token could become a guard, and the Sol consult
 * would match it by symbol.
 *
 * No database is touched: candidatesFrom and matchGuard are pure and
 * are walked directly, and the wiring (candidate sources, the promote
 * refusal, the consult's matching shape, the learning baseline's group
 * column) is pinned by source checks.
 *
 *   A. candidatesFrom — strategy groups aggregate; crypto unchanged.
 *   B. matchGuard — the consult's call shape makes token guards inert.
 *   C. Source pins — candidate sources, promote refusal, kill switch.
 */
import { readFileSync } from 'node:fs';
import { candidatesFrom, matchGuard, promoteAllTrailGuards, type TrailGuard } from '../server/services/trail-guards';
import type { TrailGroup } from '../server/services/trail-study';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const group = (over: Partial<TrailGroup>): TrailGroup => ({
  key: 'strat_x', trades: 25, winRate: 0.4, avgFinal: -1, avgPeak: 8,
  avgGiveback: 9, trailExitShare: 0.1, verdict: null, ...over,
});
const none = new Set<string>();

// ── A. candidatesFrom ─────────────────────────────────────────────────────
// The study's strategy grouping (GROUP BY strategy_id in trail-study.ts)
// pools every token the strategy traded: two tokens' closes (15 + 10)
// arrive as ONE group of 25 under the strategy's key — and produce
// exactly one candidate, keyed by the strategy, never by either token.
{
  const out = candidatesFrom('sol', 'strategy', [group({})], none);
  check('A1 aggregated strategy group (25 closes across tokens) yields one candidate', out.length === 1, `got ${out.length}`);
  check('A2 the candidate key is the strategy, not a token', out[0]?.key === 'strat_x' && out[0]?.dimension === 'strategy');
  check('A3 the candidate carries the pooled trade count', out[0]?.trades === 25);
  check('A4 giveback over the Sol bar makes it a tighten candidate', out[0]?.action === 'tighten');
}
check('A5 under the 10-trade bar, no candidate', candidatesFrom('sol', 'strategy', [group({ trades: 9 })], none).length === 0);
check('A6 lock_profile still reachable for a proven Sol strategy group',
  candidatesFrom('sol', 'strategy', [group({ avgGiveback: 3, trailExitShare: 0.35, avgFinal: 2 })], none)[0]?.action === 'lock_profile');
check('A7 crypto SYMBOL groups still produce candidates (crypto unchanged)',
  candidatesFrom('crypto', 'symbol', [group({ key: 'ETHUSDT', avgGiveback: 1.2 })], none).length === 1);
check('A8 crypto strategy groups still produce candidates',
  candidatesFrom('crypto', 'strategy', [group({ key: 'momentum', avgGiveback: 1.2 })], none).length === 1);

// ── B. matchGuard under the consult's call shape ──────────────────────────
const guard = (over: Partial<TrailGuard>): TrailGuard => ({
  id: 'tg_test', engine: 'sol', dimension: 'strategy', key: 'strat_x', action: 'tighten',
  trades: 25, avgFinal: -1, avgPeak: 8, avgGiveback: 9, trailExitShare: 0.1,
  profile: { breakevenAtPct: 5, partialAtPct: 12, trailDistPct: 5 }, profileSummary: 'test',
  promotedAt: new Date().toISOString(), active: true, ...over,
} as TrailGuard);
// solTrailGuardFor consults with symbol = null (strategy-only matching).
check('B1 a Sol strategy guard governs any token (symbol not consulted)',
  matchGuard([guard({})], 'sol', 'strat_x', null)?.id === 'tg_test');
check('B2 a stored per-TOKEN Sol guard can never govern an exit',
  matchGuard([guard({ dimension: 'symbol', key: 'PUMPTOKEN' })], 'sol', 'strat_x', null) === null);
check('B3 a retired Sol strategy guard does not govern',
  matchGuard([guard({ active: false })], 'sol', 'strat_x', null) === null);
check('B4 crypto symbol guards still match by symbol (crypto consult unchanged)',
  matchGuard([guard({ engine: 'crypto', dimension: 'symbol', key: 'ETHUSDT' })], 'crypto', null, 'ETHUSDT')?.key === 'ETHUSDT');
check('B5 a Sol strategy guard never governs a crypto position',
  matchGuard([guard({})], 'crypto', 'strat_x', null) === null);

// ── C. Source pins ────────────────────────────────────────────────────────
const tg = src('../server/services/trail-guards.ts');
const tl = src('../server/services/trail-guard-learning.ts');
const ts = src('../server/services/trail-study.ts');
const solEngine = src('../server/services/sol-engine.ts');

check('C1 no Sol symbol candidates are built', !tg.includes("candidatesFrom('sol', 'symbol'"));
check('C2 crypto symbol candidates are still built', tg.includes("candidatesFrom('crypto', 'symbol', report.crypto.bySymbol, guarded)"));
check('C3 Sol candidates come from the strategy grouping', tg.includes("candidatesFrom('sol', 'strategy', report.sol.byStrategy, guarded)"));
check('C4 the study strategy grouping aggregates across tokens (GROUP BY strategy_id)', ts.includes("solAgg('strategy_id')"));
check('C5 promote refuses a Sol symbol selection outright', tg.includes("sel.engine === 'sol' && sel.dimension === 'symbol'") && tg.includes('Sol trail guards key on strategy only'));
check('C6 the Sol consult matches with symbol = null', /solTrailGuardFor[\s\S]{0,900}?matchGuard\(await getTrailGuards\(userId\), 'sol', strategyId, null\)/.test(tg));
check('C7 kill switch intact: the Sol consult still checks TRAIL_GUARDS first', /solTrailGuardFor[\s\S]{0,300}?trailGuardsOn\(\)/.test(tg) && tg.includes("process.env.TRAIL_GUARDS !== 'off'"));
check('C8 learning baselines group Sol by strategy unconditionally', tl.includes("guard.engine === 'sol' || guard.dimension === 'strategy'"));
check('C9 engine call sites unchanged (both consults still pass strategy + symbol in)',
  (solEngine.match(/solTrailGuardFor\(userId, pos\.strategyId, pos\.symbol\)/g) || []).length === 2);

// ── D. Bulk promotion (one tap for every current candidate) ─────────────
// The batch loops the single-promote path over the SAME candidate list
// the panel shows — which by construction (C1/C3) contains no Sol symbol
// selection — and promoteTrailGuard would refuse one anyway (C5). The
// kill switch is checked before any store access, so D1 is exact even
// with no database reachable.
const routes = src('../server/routes.ts');
const panel = src('../client/src/components/engine-safeguards-panel.tsx');
const bulkBody = tg.slice(tg.indexOf('export async function promoteAllTrailGuards'), tg.indexOf('export async function retireTrailGuard'));
check('D2 bulk takes the CURRENT candidate list', bulkBody.includes('getTrailGuardCandidates(userId)'));
check('D3 bulk promotes through the SAME single-promote path (no forked write)',
  bulkBody.includes('promoteTrailGuard(userId') && !bulkBody.includes('storeGuards'));
check('D4 bulk passes each candidate’s OWN selection through (no constructed selections)',
  bulkBody.includes('engine: c.engine, dimension: c.dimension, key: c.key, action: c.action') && !bulkBody.includes("'symbol'"));
check('D5 summary counts are the array lengths (no invented numbers)',
  bulkBody.includes('promotedCount: promoted.length') && bulkBody.includes('skippedCount: skipped.length'));
check('D6 kill switch is checked before the candidate list is built',
  bulkBody.indexOf('trailGuardsOn()') > -1 && bulkBody.indexOf('trailGuardsOn()') < bulkBody.indexOf('getTrailGuardCandidates'));
check('D7 the bulk route exists and delegates to the service',
  routes.includes('app.post("/api/engine/trail-guards/promote-all"') && routes.includes('promoteAllTrailGuards'));
check('D8 panel wires the bulk button + verbatim result rendering',
  panel.includes('"/api/engine/trail-guards/promote-all"') && panel.includes('Make all') && panel.includes('bulkResult.skipped.map'));

(async () => {
  process.env.TRAIL_GUARDS = 'off';
  const blocked = await promoteAllTrailGuards(1);
  check('D1 kill switch blocks the batch (403, nothing promoted or skipped)',
    blocked.ok === false && blocked.status === 403 && blocked.promotedCount === 0 && blocked.skippedCount === 0
    && blocked.promoted.length === 0 && blocked.skipped.length === 0);
  delete process.env.TRAIL_GUARDS;

  console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
  process.exit(failures ? 1 : 0);
})();
