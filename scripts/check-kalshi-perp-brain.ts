/**
 * Kalshi perp brain + volume-profile filter — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-perp-brain.ts
 *
 * No database, broker, or market-data calls: the gate and the VP veto are
 * pure and are exercised directly on synthetic stats/profiles; the wiring
 * (source isolation, log-before-skip ordering, kill switches, the absence
 * of any regime-classifier the user asked to keep out) is pinned by source
 * checks.
 *
 *   A. Gate verdicts: an 'avoid' bucket blocks; 'favor' and 'learning'
 *      never do; a non-matching bucket or another strategy never does.
 *   B. Thresholds come from the lane's own stats aggregation — 15+ trades
 *      and a median worse than −1% is what makes a bucket 'avoid'; 14
 *      trades, or a median of −0.9%, never blocks.
 *   C. Rehabilitation: when the rolling record improves so the verdict
 *      leaves 'avoid', the same candidate passes again — no human un-ban.
 *   D. VP veto geometry: long inside value pressing into VAH blocks, a
 *      breakout above value does not, mid-value does not; shorts mirror
 *      into VAL; positions classify at the edges exactly as inside.
 *   E. Kill switches: KALSHI_PERP_BRAIN=off / KALSHI_PERP_VP=off flip the
 *      enabled checks the lane consults.
 *   F. Source pins: the brain learns only from perp-lane stats passed in
 *      by the lane (no main-Kalshi-brain imports, no coin fallback), the
 *      block log is written BEFORE the lane skips a blocked candidate,
 *      the 'vp' bucket dimension is wired into the stats, the spec path's
 *      volumeProfileSeries is reused (not re-implemented), and neither
 *      the lane nor the brain references the regime classifier the user
 *      explicitly kept out of this build.
 */
import { readFileSync } from 'node:fs';
import {
  evaluatePerpBrainGate, classifyVpPosition, vpValueEdgeBlock, VP_EDGE_TOL_ATR_MULT,
  perpBrainEnabled, perpVpEnabled, type PerpBucketStatLike,
} from '../server/services/kalshi-perp-brain';
import { aggregateKalshiStats, kalshiBucketsOf } from '../server/services/kalshi-stock-shadow';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const stat = (over: Partial<PerpBucketStatLike>): PerpBucketStatLike => ({
  strategy: 'orb', dim: 'hourEt', bucket: '16-20ET', n: 19, medianNet: -1.8, winRate: 0.3, verdict: 'avoid', ...over,
});
const ORB_CANDIDATE = { ticker: 'KXAAPLPERP1', direction: 'long', hour_et: 17, session_et: 'after_hours' };

// A — gate verdicts
{
  const buckets = kalshiBucketsOf(ORB_CANDIDATE);
  const blocked = evaluatePerpBrainGate([stat({})], 'orb', buckets);
  check('A1 matching avoid bucket blocks', blocked.blocked && blocked.avoid.length === 1);
  const favor = evaluatePerpBrainGate([stat({ verdict: 'favor', medianNet: 1.2 })], 'orb', buckets);
  check('A2 favor never blocks (tags only)', !favor.blocked && favor.favor.length === 1);
  const learning = evaluatePerpBrainGate([stat({ verdict: 'learning', n: 6, medianNet: -3 })], 'orb', buckets);
  check('A3 learning never blocks, even with a bad median', !learning.blocked && learning.avoid.length === 0);
  const otherBucket = evaluatePerpBrainGate([stat({ bucket: '00-04ET' })], 'orb', buckets);
  check('A4 avoid in a different bucket does not block', !otherBucket.blocked);
  const otherStrategy = evaluatePerpBrainGate([stat({ strategy: 'breakout' })], 'orb', buckets);
  check('A5 avoid for another strategy does not block', !otherStrategy.blocked);
  const mixed = evaluatePerpBrainGate([stat({ verdict: 'favor', dim: 'session', bucket: 'after_hours', medianNet: 0.9 }), stat({})], 'orb', buckets);
  check('A6 any single avoid blocks even alongside a favor', mixed.blocked && mixed.favor.length === 1);
  check('A7 empty stats never block', !evaluatePerpBrainGate([], 'orb', buckets).blocked);
}

// B — thresholds are the lane's own aggregation, end to end
{
  const rowsFor = (strategy: string, pcts: number[]) => pcts.map((net_pct) => ({
    strategy, ticker: 'KXAAPLPERP1', direction: 'long', session_et: 'after_hours',
    spread_bps: 5, atr_pct: 0.7, funding_rate_at_entry: 0.01, htf_aligned: true, hour_et: 17,
    vp_position: null, net_pct,
  }));
  const losers = aggregateKalshiStats(rowsFor('orb', new Array(15).fill(-1.2)));
  const hourStat = losers.find((s) => s.strategy === 'orb' && s.dim === 'hourEt');
  check('B1 15 closes at median −1.2% aggregate to avoid', hourStat?.verdict === 'avoid', `verdict=${hourStat?.verdict}`);
  check('B2 the aggregated avoid blocks the gate',
    evaluatePerpBrainGate(losers, 'orb', kalshiBucketsOf(ORB_CANDIDATE)).blocked);
  const thin = aggregateKalshiStats(rowsFor('orb', new Array(14).fill(-1.2)));
  check('B3 14 closes stay learning (min sample respected)',
    thin.find((s) => s.dim === 'hourEt')?.verdict === 'learning'
    && !evaluatePerpBrainGate(thin, 'orb', kalshiBucketsOf(ORB_CANDIDATE)).blocked);
  const mild = aggregateKalshiStats(rowsFor('orb', new Array(15).fill(-0.9)));
  check('B4 median −0.9% is not avoid (the −1% bar is respected)',
    mild.find((s) => s.dim === 'hourEt')?.verdict !== 'avoid'
    && !evaluatePerpBrainGate(mild, 'orb', kalshiBucketsOf(ORB_CANDIDATE)).blocked);
}

// C — rehabilitation is automatic: the verdict rolls off, the gate opens
{
  const toxic = aggregateKalshiStats(Array.from({ length: 15 }, () => ({
    strategy: 'orb', ticker: 'KXAAPLPERP1', direction: 'long', session_et: 'after_hours',
    spread_bps: 5, atr_pct: 0.7, funding_rate_at_entry: 0.01, htf_aligned: true, hour_et: 17, vp_position: null, net_pct: -1.5,
  })));
  check('C1 proven-losing bucket blocks while its record stands',
    evaluatePerpBrainGate(toxic, 'orb', kalshiBucketsOf(ORB_CANDIDATE)).blocked);
  // The 60-day window rolls: the same bucket's recent record is now good.
  const healed = aggregateKalshiStats(Array.from({ length: 15 }, () => ({
    strategy: 'orb', ticker: 'KXAAPLPERP1', direction: 'long', session_et: 'after_hours',
    spread_bps: 5, atr_pct: 0.7, funding_rate_at_entry: 0.01, htf_aligned: true, hour_et: 17, vp_position: null, net_pct: 0.8,
  })));
  const gate = evaluatePerpBrainGate(healed, 'orb', kalshiBucketsOf(ORB_CANDIDATE));
  check('C2 same candidate passes once the bucket verdict leaves avoid', !gate.blocked && gate.favor.length >= 1);
}

// D — VP veto geometry (profile: VAL 90, POC 100, VAH 110; ATR 4 → tolerance 1.0)
{
  const profile = { poc: 100, vah: 110, val: 90 };
  const atr = 4;
  check('D0 tolerance is 0.25×ATR', VP_EDGE_TOL_ATR_MULT === 0.25);
  check('D1 position classification', classifyVpPosition(115, 110, 90) === 'above_value'
    && classifyVpPosition(100, 110, 90) === 'inside_value'
    && classifyVpPosition(85, 110, 90) === 'below_value');
  check('D2 exactly at an edge is still inside value',
    classifyVpPosition(110, 110, 90) === 'inside_value' && classifyVpPosition(90, 110, 90) === 'inside_value');
  check('D3 long inside value pressing into VAH blocks (109, 1.0 from the edge)', vpValueEdgeBlock('long', 109, profile, atr));
  check('D4 long mid-value does not block (105)', !vpValueEdgeBlock('long', 105, profile, atr));
  check('D5 long breakout above value does not block (112)', !vpValueEdgeBlock('long', 112, profile, atr));
  check('D6 long at VAH exactly blocks (pressing into the edge)', vpValueEdgeBlock('long', 110, profile, atr));
  check('D7 short inside value pressing into VAL blocks (91)', vpValueEdgeBlock('short', 91, profile, atr));
  check('D8 short mid-value does not block (95)', !vpValueEdgeBlock('short', 95, profile, atr));
  check('D9 short breakdown below value does not block (85)', !vpValueEdgeBlock('short', 85, profile, atr));
  check('D10 degenerate inputs never block', !vpValueEdgeBlock('long', 109, profile, 0)
    && !vpValueEdgeBlock('long', 109, { poc: 100, vah: 90, val: 110 }, atr));
  check('D11 wider ATR widens the pressing zone (107 blocks at ATR 12, tol 3)', vpValueEdgeBlock('long', 107, profile, 12));
}

// E — kill switches
{
  const b0 = process.env.KALSHI_PERP_BRAIN, v0 = process.env.KALSHI_PERP_VP;
  delete process.env.KALSHI_PERP_BRAIN; delete process.env.KALSHI_PERP_VP;
  check('E1 brain + VP on by default', perpBrainEnabled() === true && perpVpEnabled() === true);
  process.env.KALSHI_PERP_BRAIN = 'off';
  check('E2 KALSHI_PERP_BRAIN=off disables the gate', perpBrainEnabled() === false);
  process.env.KALSHI_PERP_VP = 'off';
  check('E3 KALSHI_PERP_VP=off disables the VP filter', perpVpEnabled() === false);
  if (b0 === undefined) delete process.env.KALSHI_PERP_BRAIN; else process.env.KALSHI_PERP_BRAIN = b0;
  if (v0 === undefined) delete process.env.KALSHI_PERP_VP; else process.env.KALSHI_PERP_VP = v0;
}

// F — source pins
{
  const brain = readFileSync(new URL('../server/services/kalshi-perp-brain.ts', import.meta.url), 'utf8');
  const lane = readFileSync(new URL('../server/services/kalshi-stock-shadow.ts', import.meta.url), 'utf8');
  const backtest = readFileSync(new URL('../server/services/strategy-backtest.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../client/src/components/kalshi-shadow-panel.tsx', import.meta.url), 'utf8');
  check('F1 brain service has no main-Kalshi-brain dependency',
    !/kalshi-brain|coinFromTicker/.test(brain));
  check('F2 brain service queries only its own block table',
    brain.includes('kalshi_perp_brain_blocks')
    && !/(FROM|INTO|UPDATE|JOIN) kalshi_perp_shadow/.test(brain));
  check('F3 lane consults the gate with the lane-computed stats',
    lane.includes('evaluatePerpBrainGate(stats, sig.strategy, kalshiBucketsOf(ctx))'));
  const gateAt = lane.indexOf('evaluatePerpBrainGate(stats');
  const insertAt = lane.indexOf('INSERT INTO kalshi_perp_shadow_trades', gateAt);
  const gateSegment = gateAt >= 0 ? lane.slice(gateAt, insertAt > gateAt ? insertAt : gateAt + 4000) : '';
  check('F4 blocks are logged BEFORE the blocked candidate is skipped',
    gateSegment.includes('await logPerpBrainBlocks') && gateSegment.includes('continue'));
  check('F5 VP skips are logged with the vp_edge reason', lane.includes("reason: 'vp_edge'"));
  check('F6 vp bucket dimension is wired into the stats machinery',
    lane.includes('b.vp = c.vp_position') && lane.includes('c.vp_position'));
  check('F7 VP context is recorded on the trade context row',
    lane.includes('vp_poc, vp_vah, vp_val, vp_position'));
  check('F8 the spec-path volumeProfileSeries is reused, not re-implemented',
    backtest.includes('export function volumeProfileSeries') && lane.includes('volumeProfileSeries'));
  check('F9 kill switches gate the lane paths',
    lane.includes('if (perpBrainEnabled())') && lane.includes('perpVpEnabled()'));
  check('F10 the regime classifier the user kept out is absent from lane + brain',
    !/markov/i.test(lane) && !/markov/i.test(brain));
  check('F11 panel renders the perp-brain section + plain-words summary',
    panel.includes('Perp brain') && panel.includes('blocks lift on their own as old results age out of the 60-day window'));
  check('F12 report payload carries the perpBrain summary', lane.includes('perpBrain,'));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
