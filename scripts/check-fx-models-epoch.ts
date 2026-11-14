/**
 * FX Models epoch + lifts + prop-firm sim — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-fx-models-epoch.ts
 *
 * No database, broker, or market-data calls: everything exercised here
 * is pure, or returns before any DB touch (sliceLiveReady's bar check
 * runs ahead of its weekly query; the full weekly check is DB-bound and
 * intentionally not exercised — sliceMeetsBar covers the gate logic).
 *
 *   L. Lifts: with FX_MODELS_LIFTS on (and enrichment on), the M1/M2
 *      pair vetoes AND the M2 session veto stop firing; provenance
 *      flags mark the formerly blocked ground; lifts off (or enrich
 *      off) restores every veto; the M2 prompt scope line follows.
 *   E. Epoch: MODELS_EPOCH = 3 since the AI-regime build (the running
 *      current epoch falls back to 2 with FX_MODELS_AI_REGIME=off —
 *      pinned in check-fx-models-ai-regime.ts), promotionStats grades epoch-filtered
 *      stats while the epoch is on and all-time stats when it is off,
 *      and the bar refuses slices whose epoch record is too thin no
 *      matter how good the all-time record looks. A formerly excluded
 *      pair/session slice with a perfect epoch-2 record MEETS the bar
 *      (no pair/session hard block anywhere in the live path).
 *   S. propSimulate: sizing formula (0.5% cap / 0.1% floor, scaled by
 *      confidence and slice accuracy), R→$ conversion on a
 *      hand-computed example, the 2.5% daily loss cap skipping the
 *      rest of the day, and the 6% max loss blowing the sim.
 */
import { readFileSync } from 'node:fs';
import {
  MODELS_EPOCH,
  currentModelsEpoch,
  modelsEpochOn,
  modelsLiftsOn,
  liftsActive,
  isExcludedPair,
  decisionProvenance,
  promotionStats,
  sliceMeetsBar,
  sliceLiveReady,
  m1Reject,
  m1Candidate,
  m2Reject,
  buildModelsPrompt,
  propSimulate,
  type PropSimDecision,
} from '../server/services/fx-models';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

delete process.env.FX_MODELS_ENRICH;   // enrichment on (default)
delete process.env.FX_MODELS_LIFTS;    // lifts on (default)
delete process.env.FX_MODELS_EPOCH;    // epoch on (default)
delete process.env.FX_M1_EXCLUDED_PAIRS;
delete process.env.FX_M2_EXCLUDED_PAIRS;

// ── L. Lifts ───────────────────────────────────────────────────────────────
{
  check('L0 exclusion lists are the env defaults',
    isExcludedPair('M1', 'GBPJPY') && isExcludedPair('M1', 'XAUUSD') && isExcludedPair('M1', 'BTCUSD')
    && isExcludedPair('M1', 'US30') && isExcludedPair('M1', 'NAS100') && !isExcludedPair('M1', 'EURUSD')
    && isExcludedPair('M2', 'USDJPY') && !isExcludedPair('M2', 'GBPJPY') && !isExcludedPair('M2', 'USDJPY', 'crypto'));

  const m2Ctx = { h1: { trend: 'BULLISH', pd: 'DISCOUNT' }, h4: { trend: 'BULLISH' }, adx: 20 };
  check('L1 lifts on: M2 USDJPY in London passes the pair check',
    m2Reject('USDJPY', 'BUY', 150, 149.5, 151.5, m2Ctx, 'London') === null);
  check('L2 lifts on: M2 USDJPY in Asian passes BOTH pair and session checks (records as a trade)',
    m2Reject('USDJPY', 'BUY', 150, 149.5, 151.5, m2Ctx, 'Asian') === null);
  check('L3 provenance: USDJPY/Asian is flagged wasExcludedPair + wasBlockedSession',
    JSON.stringify(decisionProvenance('M2', 'USDJPY', 'Asian')) === JSON.stringify({ wasExcludedPair: true, wasBlockedSession: true }));
  check('L4 provenance: EURUSD/London is clean; M1 GBPJPY flags pair only',
    JSON.stringify(decisionProvenance('M2', 'EURUSD', 'London')) === JSON.stringify({ wasExcludedPair: false, wasBlockedSession: false })
    && JSON.stringify(decisionProvenance('M1', 'GBPJPY', 'Asian')) === JSON.stringify({ wasExcludedPair: true, wasBlockedSession: false }));

  const range = { qualifies: true, positionInRangePct: 80, rangeHigh: 190.5, rangeLow: 189.5, rangeMid: 190, touchesHigh: 3, touchesLow: 3, bbWidthPercentile: 40 };
  const m1Ctx = { h4: { trend: 'NEUTRAL' }, range, price: 190.3 };
  check('L5 lifts on: M1 GBPJPY with a qualified range passes',
    m1Reject('GBPJPY', 'SELL', 190.3, 190.6, m1Ctx) === null);
  check('L6 lifts on: M1 GBPJPY other rules still fire (unqualified range vetoes)',
    (m1Reject('GBPJPY', 'SELL', 190.3, 190.6, { ...m1Ctx, range: { ...range, qualifies: false } }) || '').startsWith('no qualified range'));
  check('L7 lifts on: M1 GBPJPY gets a server-checked candidate',
    m1Candidate('GBPJPY', m1Ctx)?.direction === 'SELL');
  check('L8 lifts on: M2 non-scope rules still fire in a lifted session (BUY at premium vetoes)',
    m2Reject('USDJPY', 'BUY', 150, 149.5, 151.5, { ...m2Ctx, h1: { trend: 'BULLISH', pd: 'PREMIUM' } }, 'Asian') === 'BUY at H1 premium');

  process.env.FX_MODELS_LIFTS = 'off';
  check('L9 lifts off: M2 USDJPY pair veto returns', m2Reject('USDJPY', 'BUY', 150, 149.5, 151.5, m2Ctx, 'London') === 'USDJPY excluded from trend model');
  check('L10 lifts off: M2 session veto returns for a clean pair',
    (m2Reject('EURUSD', 'BUY', 1.1, 1.095, 1.115, { h1: { trend: 'BULLISH', pd: 'DISCOUNT' }, h4: { trend: 'BULLISH' }, adx: 20 }, 'Asian') || '').includes('session'));
  check('L11 lifts off: M1 GBPJPY pair veto returns', m1Reject('GBPJPY', 'SELL', 190.3, 190.6, m1Ctx) === 'GBPJPY excluded from range model');
  check('L12 lifts off: M1 GBPJPY candidate suppressed again', m1Candidate('GBPJPY', m1Ctx) === null);
  delete process.env.FX_MODELS_LIFTS;

  process.env.FX_MODELS_ENRICH = 'off';
  check('L13 enrich off: lifts inactive, M2 USDJPY vetoed again',
    liftsActive() === false && m2Reject('USDJPY', 'BUY', 150, 149.5, 151.5, m2Ctx, 'London') === 'USDJPY excluded from trend model');
  delete process.env.FX_MODELS_ENRICH;
  check('L14 switches default on', modelsLiftsOn() === true && liftsActive() === true);

  const pairs = [{ symbol: 'USDJPY', ctx: { price: 150 } }];
  const lifted = buildModelsPrompt('fx', 'Asian', pairs, '', true);
  check('L15 lifted prompt: any session / any pair, no self-censor wording',
    lifted.includes('ANY session and any pair') && lifted.includes('USDJPY') && !lifted.includes('never on USDJPY') && !lifted.includes('Only in London'));
  process.env.FX_MODELS_LIFTS = 'off';
  const legacy = buildModelsPrompt('fx', 'Asian', pairs, '', true);
  check('L16 lifts-off prompt: legacy scope line byte-anchored',
    legacy.includes('Only in London / London/NY overlap sessions, never on USDJPY') && legacy.includes('otherwise Model 2 says NONE'));
  delete process.env.FX_MODELS_LIFTS;
  const unenriched = buildModelsPrompt('fx', 'Asian', pairs, '', false);
  check('L17 enrich-off prompt: legacy scope line too',
    unenriched.includes('Only in London / London/NY overlap sessions, never on USDJPY'));
}

// ── E. Epoch ───────────────────────────────────────────────────────────────
{
  check('E1 MODELS_EPOCH is 3 (AI-regime build) and the running current epoch matches', MODELS_EPOCH === 3 && currentModelsEpoch() === 3);
  check('E2 epoch on by default', modelsEpochOn() === true);

  const mixed = {
    model: 'M1', dayType: 'range', symbol: 'EURUSD', session: 'London',
    trades: 120, avgR: 0.5, winRate: 0.6, allTimeLevel: 'Master',
    epochTrades: 10, epochAvgR: -0.1, epochWinRate: 0.3, epochLevel: 'Learning',
  };
  const on = promotionStats(mixed);
  check('E3 promotionStats (epoch on) grades the epoch record',
    on.trades === 10 && on.avgR === -0.1 && on.winRate === 0.3 && on.level === 'Learning', JSON.stringify(on));
  check('E4 thin epoch record fails the bar despite a stellar all-time record', sliceMeetsBar(mixed) === false);
  check('E5 sliceLiveReady refuses the thin-epoch slice before any DB touch',
    await sliceLiveReady(1, mixed) === false);

  process.env.FX_MODELS_EPOCH = 'off';
  const off = promotionStats(mixed);
  check('E6 promotionStats (epoch off) grades all-time again',
    off.trades === 120 && off.avgR === 0.5 && off.winRate === 0.6 && off.level === 'Master', JSON.stringify(off));
  check('E7 epoch off: the same slice meets the bar on its all-time record', sliceMeetsBar(mixed) === true);
  delete process.env.FX_MODELS_EPOCH;

  const perfectFormerlyBlocked = {
    model: 'M2', dayType: 'trend', symbol: 'USDJPY', session: 'Asian',
    trades: 64, avgR: 0.38, winRate: 0.56, allTimeLevel: 'Proficient',
    epochTrades: 60, epochAvgR: 0.35, epochWinRate: 0.55, epochLevel: 'Proficient',
  };
  check('E8 formerly excluded pair + blocked session with a perfect current-epoch record MEETS the bar (no hard block)',
    sliceMeetsBar(perfectFormerlyBlocked) === true);
  const src = readFileSync(new URL('../server/services/fx-models.ts', import.meta.url), 'utf8');
  const goLiveSeg = src.slice(src.indexOf('export async function maybeGoLive'), src.indexOf('submitFxModelTrade'));
  check('E9 maybeGoLive has no pair/session hard block (eligibility is the bar + toggle + caps only)',
    !goLiveSeg.includes('isExcludedPair') && !goLiveSeg.includes('M2_SESSIONS'));
  check('E10 shadowDecide stamps the running current epoch on insert', src.includes('context, result, engine, epoch') && src.includes('currentModelsEpoch()]'));
}

// ── S. propSimulate ────────────────────────────────────────────────────────
{
  const d = (over: Partial<PropSimDecision>): PropSimDecision => ({
    model: 'M1', day_type: 'range', symbol: 'EURUSD', session: 'London',
    confidence: 100, r_multiple: 1, result: 'WIN',
    created_at: '2026-11-02T10:00:00Z', resolved_at: '2026-11-02T11:00:00Z', ...over,
  });

  // Hand-computed: A) conf 100, +2R → risk 0.5×1×0.75 = 0.375% of 100000
  // = $375 → +$750 → 100750. B) conf 50, −1R → 0.5×0.5×0.75 = 0.1875%
  // of 100750 = $188.91 → 100561.09.
  const s1 = propSimulate([
    d({ r_multiple: 2 }),
    d({ confidence: 50, r_multiple: -1, result: 'LOSS', resolved_at: '2026-11-02T15:00:00Z' }),
  ], { includeDetail: true });
  check('S1 hand-computed replay: end balance $100,561.09', s1.endBalance === 100561.09, `got ${s1.endBalance}`);
  check('S2 sizing follows confidence (0.375% then 0.1875%)',
    s1.detail?.[0].riskPct === 0.375 && s1.detail?.[1].riskPct === 0.1875,
    JSON.stringify(s1.detail?.map((x) => x.riskPct)));
  check('S3 two trades taken, none skipped, one active day',
    s1.tradesTaken === 2 && s1.tradesSkipped === 0 && s1.daysActive === 1 && s1.blown === false);

  // Floor: 10 straight losses (conf 0) on separate days, then trade 11
  // sees slice WR 0 over ≥10 priors → 0.5 × 0.4 × 0.5 = 0.1% floor.
  const floorRows: PropSimDecision[] = [];
  for (let i = 0; i < 11; i++) {
    const day = `2026-11-${String(1 + i).padStart(2, '0')}T10:00:00Z`;
    floorRows.push(d({ confidence: 0, r_multiple: i < 10 ? -0.1 : 1, result: i < 10 ? 'LOSS' : 'WIN', created_at: day, resolved_at: day }));
  }
  const sFloor = propSimulate(floorRows, { includeDetail: true });
  check('S4 sizing floor is 0.1% for a cold, inaccurate slice', sFloor.detail?.[10].riskPct === 0.1, `got ${sFloor.detail?.[10].riskPct}`);

  // Cap: 10 straight wins (conf 100), trade 11 sees WR 1.0 → 0.5% cap.
  const capRows: PropSimDecision[] = [];
  for (let i = 0; i < 11; i++) {
    const day = `2026-11-${String(1 + i).padStart(2, '0')}T10:00:00Z`;
    capRows.push(d({ confidence: 100, r_multiple: 0.1, result: 'WIN', created_at: day, resolved_at: day }));
  }
  const sCap = propSimulate(capRows, { includeDetail: true });
  check('S5 sizing cap is 0.5% for a hot, accurate slice', sCap.detail?.[10].riskPct === 0.5, `got ${sCap.detail?.[10].riskPct}`);

  // Daily cap: 12 losses in one day, each a fresh slice (risk stays
  // 0.375% of balance): after 7, the day is −2.60% → trades 8–12 skip;
  // a next-day trade is taken again.
  const dayRows: PropSimDecision[] = [];
  for (let i = 0; i < 12; i++) {
    dayRows.push(d({ symbol: `SYM${i}`, r_multiple: -1, result: 'LOSS', created_at: '2026-11-03T10:00:00Z', resolved_at: `2026-11-03T${String(10 + i).padStart(2, '0')}:00:00Z` }));
  }
  dayRows.push(d({ symbol: 'NEXT', r_multiple: 1, result: 'WIN', created_at: '2026-11-04T10:00:00Z', resolved_at: '2026-11-04T11:00:00Z' }));
  const sDay = propSimulate(dayRows);
  check('S6 daily cap 2.5%: 7 taken on the day, 5 skipped, next day trades again',
    sDay.tradesTaken === 8 && sDay.skippedByDailyCap === 5 && sDay.tradesSkipped === 5 && sDay.daysActive === 2,
    JSON.stringify({ taken: sDay.tradesTaken, skipped: sDay.skippedByDailyCap, days: sDay.daysActive }));
  check('S7 worst day ≈ −2.6%', approx(sDay.worstDayPct, -2.6, 0.05), `got ${sDay.worstDayPct}`);

  // Blown: daily cap lifted via opts so only the 6% max loss binds.
  // 0.375% losses compound: balance crosses $94,000 at trade 17.
  const blowRows: PropSimDecision[] = [];
  for (let i = 0; i < 30; i++) {
    const day = `2026-11-${String(1 + i).padStart(2, '0')}T10:00:00Z`;
    blowRows.push(d({ symbol: `B${i}`, r_multiple: -1, result: 'LOSS', created_at: day, resolved_at: day }));
  }
  const sBlow = propSimulate(blowRows, { dailyCapPct: 100 });
  check('S8 6% max loss blows the sim at trade 17 and stops it',
    sBlow.blown === true && sBlow.tradesTaken === 17 && sBlow.endBalance < 94000 && sBlow.blownAt === '2026-11-17',
    JSON.stringify({ blown: sBlow.blown, taken: sBlow.tradesTaken, end: sBlow.endBalance, at: sBlow.blownAt }));

  const sSkip = propSimulate([
    d({ result: 'NO_TRADE', r_multiple: 0 }),
    d({ result: null, r_multiple: null }),
    d({ result: 'EXPIRED', r_multiple: 0.5 }),
  ]);
  check('S9 NO_TRADE and unresolved rows never replay; EXPIRED with R does',
    sSkip.tradesTaken === 1 && sSkip.endBalance > 100000, JSON.stringify({ taken: sSkip.tradesTaken, end: sSkip.endBalance }));

  const sEmpty = propSimulate([]);
  check('S10 empty record: $100k start, nothing taken, not blown',
    sEmpty.startBalance === 100000 && sEmpty.endBalance === 100000 && sEmpty.tradesTaken === 0 && sEmpty.blown === false);
}

console.log(`\n${total - failures}/${total} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
