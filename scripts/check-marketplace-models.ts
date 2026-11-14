/**
 * Marketplace completion (FX Models + Strategy Studio) — verification.
 *
 * Run:  node --import tsx/esm scripts/check-marketplace-models.ts
 *
 * No database, broker, or market-data calls: every gate exercised here
 * is pure, and the DB-bound paths (listing query, live hand-off, buy
 * route) are pinned by source checks on the exact queries/guards they
 * must contain.
 *
 *   A. Model listings carry the current record only (epoch 2), with
 *      proof + prop-sim; imports preserve epoch and stamp provenance;
 *      legacy snapshots are marked legacy.
 *   B. A purchased epoch-2 slice that clears the own-slice bar is
 *      live-eligible for the buyer; epoch-1/legacy/imperfect are not;
 *      the daily cap is shared across own + imported hand-offs;
 *      provenance is stamped; the kill switch restores own-only.
 *   C. Studio shadow gate: just below / just above every threshold
 *      (count, R-bearing count, avg R, win rate, losing week), the
 *      live path still wins when both qualify, kill switch works.
 *   D. A purchased strategy clone is buyer-owned, provenance-stamped,
 *      identical in trading content, and shadow-deployable; the buy
 *      route checks the package before charging and clones on purchase.
 */
import { readFileSync } from 'node:fs';
import {
  MODELS_EPOCH,
  fxModelListingProof,
  fxModelImportEpoch,
  stampFxModelImportContext,
  importedSliceMeetsBar,
  fxModelDailyCap,
  fxModelDailyCapAllows,
  fxModelProvenanceForSlice,
  sliceMeetsBar,
} from '../server/services/fx-models';
import {
  summarizeStrategyTrades,
  strategyShadowProofEligible,
  strategyMarketplaceProof,
  studioMarketplaceShadowOn,
} from '../server/services/strategy-brain';
import {
  cloneStrategySpecForBuyer,
  purchasedStrategyRecord,
  strategyShadowDeployability,
  type StrategyMarketplacePackage,
} from '../server/services/strategy-marketplace';
import type { StrategySpec } from '../server/services/strategy-spec';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number, b: number, tol = 0.011) => Math.abs(a - b) <= tol;

delete process.env.FX_MODEL_MARKETPLACE_LIVE;
delete process.env.STUDIO_MARKETPLACE_SHADOW;
delete process.env.FX_MODELS_EPOCH;

const fxSrc = readFileSync(new URL('../server/services/fx-models.ts', import.meta.url), 'utf8');
const routesSrc = readFileSync(new URL('../server/routes.ts', import.meta.url), 'utf8');
const buyStart = routesSrc.indexOf('app.post("/api/brain-marketplace/:id/buy"');
const buySeg = routesSrc.slice(buyStart, routesSrc.indexOf('// ── Daily Trade Review', buyStart));

// ── A. Model listings carry the current record ────────────────────────
{
  const row = (over: any = {}): any => ({
    symbol: 'EURUSD', model: 'M1', day_type: 'range', session: 'London',
    direction: 'BUY', confidence: 80, result: 'WIN', r_multiple: 1,
    created_at: '2026-11-10T10:00:00Z', resolved_at: '2026-11-10T11:00:00Z',
    epoch: MODELS_EPOCH, ...over,
  });
  const mixed = [
    ...Array.from({ length: 20 }, () => row()),
    ...Array.from({ length: 15 }, () => row({ epoch: 1, result: 'LOSS', r_multiple: -1 })),
    row({ epoch: undefined }),
  ];
  const proof = fxModelListingProof(mixed);
  check('A1 listing proof counts current-epoch rows only', proof.tradeCount === 20, `got ${proof.tradeCount} of 36 rows`);
  check('A2 a snapshot with pre-epoch rows is marked legacy', proof.legacy === true && proof.epoch === 1);
  check('A3 proof stats grade the current-epoch rows only', proof.avgR === 1 && proof.winRate === 1, `avgR=${proof.avgR} winRate=${proof.winRate}`);
  check('A4 proof is labelled shadow proof with a prop sim attached',
    proof.proofType === 'shadow' && proof.kind === 'fx_model' && !!proof.propSim.M1 && proof.propSim.M1.tradesTaken === 20);

  const currentOnly = fxModelListingProof(Array.from({ length: 25 }, () => row({ r_multiple: 0.5 })));
  check('A5 a pure current-epoch snapshot is the current system record', currentOnly.legacy === false && currentOnly.epoch === MODELS_EPOCH && currentOnly.tradeCount === 25);

  const listingSeg = fxSrc.slice(fxSrc.indexOf('export async function getFxModelListingRows'), fxSrc.indexOf('export function fxModelRowsForStats'));
  check('A6 the listing query itself filters to the current epoch', listingSeg.includes('AND epoch = ${currentModelsEpoch()}') && listingSeg.includes("source='own'"));
  check('A7 the listing minimum counts those epoch-2 rows (route checks rows.length)',
    routesSrc.includes('r.rows.length < fm.FX_MODEL_MIN_TO_LIST'));

  check('A8 import keeps the current epoch and demotes everything else to legacy epoch 1',
    fxModelImportEpoch({ epoch: MODELS_EPOCH }) === MODELS_EPOCH && fxModelImportEpoch({ epoch: 2 }) === 1 && fxModelImportEpoch({ epoch: 1 }) === 1 && fxModelImportEpoch({}) === 1 && fxModelImportEpoch({ epoch: 99 }) === 1);

  const stamped = stampFxModelImportContext({ volumeProfile: { poc: 1.1 } }, { epoch: MODELS_EPOCH }, { sellerId: 7, listingId: 42 });
  check('A9 import stamps marketplace provenance and keeps the original context',
    stamped?.marketplace?.source === 'marketplace_model' && stamped?.marketplace?.sellerId === 7
    && stamped?.marketplace?.listingId === 42 && stamped?.marketplace?.epoch === MODELS_EPOCH
    && (stamped as any)?.volumeProfile?.poc === 1.1, JSON.stringify(stamped));
  const stampedLegacy = stampFxModelImportContext(null, { epoch: 1 }, { sellerId: 7, listingId: 42 });
  check('A10 a legacy snapshot imports stamped with epoch 1 (never live-eligible)',
    stampedLegacy?.marketplace?.epoch === 1);
  // The grant logic was extracted into grantBrainListingToBuyer (shared
  // by the buy AND subscribe routes — marketplace subscriptions PR), so
  // the provenance pin now targets that helper in routes.ts.
  check('A11 the shared buy/subscribe grant passes seller + listing provenance into the model import',
    routesSrc.includes('{ sellerId: listing.sellerId, listingId: listing.id, grantType }')
    && buySeg.includes("grantBrainListingToBuyer(listing, buyerId, 'purchase')"));
}

// ── B. Buyer trades a purchased model ─────────────────────────────────
{
  const importedSlice = (over: any = {}): any => ({
    model: 'M1', dayType: 'range', symbol: 'EURUSD', session: 'London',
    source: 'marketplace_model', listingId: 42, sellerId: 7, recordEpoch: MODELS_EPOCH, legacy: false,
    trades: 64, wins: 32, winRate: 0.5, avgR: 0.3, totalR: 19.2,
    level: 'Proficient', allTimeLevel: 'Proficient',
    epochTrades: 60, epochWins: 30, epochWinRate: 0.5, epochAvgR: 0.3, epochTotalR: 18, epochLevel: 'Proficient',
    ...over,
  });
  check('B1 a perfect imported current-epoch slice meets the live bar', importedSliceMeetsBar(importedSlice()) === true);
  check('B2 the same slice as an OWN slice meets the same bar (one bar for both)',
    sliceMeetsBar({ ...importedSlice(), source: 'own' }) === true);
  check('B3 an epoch-1 imported slice is not eligible', importedSliceMeetsBar(importedSlice({ recordEpoch: 1, legacy: true })) === false);
  check('B4 an imported slice with no listing provenance is legacy and not eligible',
    importedSliceMeetsBar(importedSlice({ listingId: null, legacy: true })) === false);
  check('B5 an imported slice below the trade count is not eligible',
    importedSliceMeetsBar(importedSlice({ epochTrades: 49 })) === false);
  check('B6 an imported slice below avg R is not eligible',
    importedSliceMeetsBar(importedSlice({ epochAvgR: 0.19 })) === false);
  check('B7 an imported slice below win rate is not eligible',
    importedSliceMeetsBar(importedSlice({ epochWinRate: 0.39 })) === false);
  check('B8 an imported slice below the mastery level is not eligible',
    importedSliceMeetsBar(importedSlice({ epochLevel: 'Developing' })) === false);

  const prov = fxModelProvenanceForSlice(importedSlice());
  check('B9 provenance for a marketplace hand-off carries source, seller and listing',
    prov.source === 'marketplace_model' && prov.sellerId === 7 && prov.listingId === 42, JSON.stringify(prov));

  const settings: any = { live: true, m1DailyCap: 3, m2DailyCap: 2 };
  check('B10 daily caps read from the buyer settings (M1 3 / M2 2)',
    fxModelDailyCap('M1', settings) === 3 && fxModelDailyCap('M2', settings) === 2);
  check('B11 shared cap: 1 own + 1 imported M1 hand-off still fits the cap of 3',
    fxModelDailyCapAllows(1 + 1, 'M1', settings) === true);
  check('B12 shared cap: 2 own + 1 imported M1 hand-off hits the cap of 3 — no extra allowance',
    fxModelDailyCapAllows(2 + 1, 'M1', settings) === false);
  check('B13 shared cap: 1 own + 1 imported M2 hand-off hits the cap of 2',
    fxModelDailyCapAllows(1 + 1, 'M2', settings) === false);
  check('B14 shared cap: imported hand-offs alone cannot exceed the cap either',
    fxModelDailyCapAllows(0 + 2, 'M2', settings) === false && fxModelDailyCapAllows(0 + 1, 'M2', settings) === true);

  const goLiveSeg = fxSrc.slice(fxSrc.indexOf('export async function maybeGoLive'), fxSrc.indexOf('// ── Crypto engine cycle'));
  check('B15 maybeGoLive consults imported slices through the same readiness path',
    goLiveSeg.includes('importedSliceLiveReady') && goLiveSeg.includes('mastery.importedSlices'));
  check('B16 maybeGoLive still requires the buyer live toggle and the auto model',
    goLiveSeg.includes('if (!settings.live) return') && goLiveSeg.includes('idea.model !== idea.autoModel'));
  check('B17 the cap claim counts every live/live_pending decision (own + imported share one pool)',
    goLiveSeg.includes("mode IN ('live','live_pending')") && goLiveSeg.includes('fxModelDailyCapAllows'));
  check('B18 a placed marketplace trade is stamped with its provenance on the decision record',
    goLiveSeg.includes('marketplaceProvenance: provenance') && goLiveSeg.includes('fxModelProvenanceForSlice'));
  check('B19 the trade still goes through submitFxModelTrade (every engine guard applies)',
    goLiveSeg.includes('submitFxModelTrade'));

  process.env.FX_MODEL_MARKETPLACE_LIVE = 'off';
  check('B20 kill switch off: imported slices can never qualify', importedSliceMeetsBar(importedSlice()) === false);
  check('B21 kill switch off: own slices are graded exactly as before',
    sliceMeetsBar({ ...importedSlice(), source: 'own' }) === true);
  delete process.env.FX_MODEL_MARKETPLACE_LIVE;
  check('B22 kill switch restored: imported eligibility returns', importedSliceMeetsBar(importedSlice()) === true);
}

// ── C. Studio shadow proof gate ───────────────────────────────────────
{
  const shadowStats = (over: any = {}): any => ({
    trades: 30, wins: 15, losses: 15, winRate: 0.5, netPnl: 100, netR: 7.5,
    rTrades: 30, avgR: 0.25,
    recentWeeklyR: [
      { weekStart: '2026-11-09', trades: 10, r: 2 },
      { weekStart: '2026-11-16', trades: 5, r: 1 },
    ],
    openTrades: 0, bySymbol: {}, exitReasons: {}, firstTradeAt: null, lastTradeAt: null,
    ...over,
  });
  check('C1 a shadow record above every threshold is eligible', strategyShadowProofEligible(shadowStats()) === true);
  check('C2 29 shadow trades is not eligible', strategyShadowProofEligible(shadowStats({ trades: 29 })) === false);
  check('C3 29 R-bearing trades is not eligible (the avg R would overstate the record)',
    strategyShadowProofEligible(shadowStats({ rTrades: 29 })) === false);
  check('C4 avg R just below +0.2 is not eligible', strategyShadowProofEligible(shadowStats({ avgR: 0.19 })) === false);
  check('C5 avg R exactly +0.2 is eligible', strategyShadowProofEligible(shadowStats({ avgR: 0.2 })) === true);
  check('C6 win rate just below 40% is not eligible', strategyShadowProofEligible(shadowStats({ winRate: 0.39 })) === false);
  check('C7 win rate exactly 40% is eligible', strategyShadowProofEligible(shadowStats({ winRate: 0.4 })) === true);
  check('C8 one losing week in the last two is not eligible',
    strategyShadowProofEligible(shadowStats({ recentWeeklyR: [{ weekStart: '2026-11-09', trades: 10, r: -0.01 }] })) === false);
  check('C9 no trades in the last two weeks means no losing week (older proof still counts)',
    strategyShadowProofEligible(shadowStats({ recentWeeklyR: [] })) === true);
  check('C10 a missing R record is not eligible', strategyShadowProofEligible(shadowStats({ avgR: null })) === false);
  check('C11 the gate honours an explicit off', strategyShadowProofEligible(shadowStats(), { shadowOn: false }) === false);

  const liveStats = (trades: number): any => ({ ...shadowStats(), trades, rTrades: trades });
  const both = strategyMarketplaceProof(liveStats(12), shadowStats());
  check('C12 when both paths qualify, the listing is labelled Proven live', both.listable === true && both.proofType === 'live' && both.shadowEligible === true);
  const shadowOnly = strategyMarketplaceProof(liveStats(9), shadowStats());
  check('C13 shadow-only proof lists as Proven in shadow', shadowOnly.listable === true && shadowOnly.proofType === 'shadow' && shadowOnly.liveEligible === false);
  const neither = strategyMarketplaceProof(liveStats(9), shadowStats({ avgR: 0.1 }));
  check('C14 neither path qualifying means not listable', neither.listable === false && neither.proofType === null);

  process.env.STUDIO_MARKETPLACE_SHADOW = 'off';
  check('C15 kill switch off: shadow proof never lists, live path untouched',
    studioMarketplaceShadowOn() === false
    && strategyMarketplaceProof(liveStats(9), shadowStats()).listable === false
    && strategyMarketplaceProof(liveStats(10), shadowStats()).proofType === 'live');
  delete process.env.STUDIO_MARKETPLACE_SHADOW;
  check('C16 kill switch restored: shadow path returns', strategyShadowProofEligible(shadowStats()) === true);

  // Integration: the gate reads the brain's real summarizer output.
  const NOW = new Date('2026-11-16T12:00:00Z'); // a Monday
  const T = (over: any): any => ({
    status: 'closed', pnl: 10, r_multiple: 1.2, mode: 'shadow', symbol: 'EURUSD',
    exit_reason: 'take_profit', closed_at: '2026-10-20T10:00:00Z', opened_at: '2026-10-20T09:00:00Z', ...over,
  });
  const rows: any[] = [
    ...Array.from({ length: 14 }, () => T({})),
    ...Array.from({ length: 14 }, () => T({ pnl: -5, r_multiple: -0.8 })),
    T({ closed_at: '2026-11-16T09:00:00Z' }),                    // current week: +1.2R
    T({ pnl: -5, r_multiple: -0.8, closed_at: '2026-11-16T10:00:00Z' }), // current week: −0.8R → week nets +0.4R
  ];
  const s = summarizeStrategyTrades(rows, NOW);
  check('C17 summarizer: 30 shadow trades, 30 with R, avg exactly +0.20R',
    s.shadow.trades === 30 && s.shadow.rTrades === 30 && s.shadow.avgR != null && approx(s.shadow.avgR, 0.2, 0.001),
    `trades=${s.shadow.trades} rTrades=${s.shadow.rTrades} avgR=${s.shadow.avgR}`);
  check('C18 summarizer: the current week nets +0.4R (no losing week)',
    s.shadow.recentWeeklyR.length === 1 && approx(s.shadow.recentWeeklyR[0].r, 0.4, 0.001), JSON.stringify(s.shadow.recentWeeklyR));
  check('C19 the summarized record passes the shadow gate', strategyShadowProofEligible(s.shadow) === true);
  const worse = rows.map((r: any, i: number) => (i === 0 ? { ...r, r_multiple: -1 } : r));
  const s2 = summarizeStrategyTrades(worse, NOW);
  check('C20 one trade flipped deep negative drops avg R below the bar and the gate refuses',
    s2.shadow.avgR != null && s2.shadow.avgR < 0.2 && strategyShadowProofEligible(s2.shadow) === false, `avgR=${s2.shadow.avgR}`);
  check('C21 shadow rows never inflate the live layer or listableTrades',
    s.live.trades === 0 && s.listableTrades === 0);
}

// ── D. Purchased strategy clone ───────────────────────────────────────
{
  const spec: StrategySpec = {
    name: 'EMA Cross Proof', source: 'builder', symbol: 'EURUSD', timeframe: 'M15',
    indicators: [
      { id: 'emaFast', kind: 'EMA', period: 9 },
      { id: 'emaSlow', kind: 'EMA', period: 21 },
    ],
    entryLong: { logic: 'AND', conditions: [{ indicatorId: 'emaFast', field: 'value', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } }] },
    entryShort: { logic: 'AND', conditions: [{ indicatorId: 'emaFast', field: 'value', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } }] },
    exitLong: null, exitShort: null,
    risk: { lotSize: 0.1, stopLossPips: 20, takeProfitPips: 40 },
  };
  const pkg: StrategyMarketplacePackage = {
    listingId: 99, sellerId: 7, sourceStrategyId: 55,
    spec, proofType: 'shadow', proofStats: { trades: 30, avgR: 0.25, winRate: 0.5 },
  };
  const record = purchasedStrategyRecord(123, pkg);
  check('D1 the purchased record is owned by the buyer', record.userId === 123 && record.name === spec.name);
  check('D2 the clone is stamped purchased with seller + listing + source strategy + proof type',
    record.spec.marketplace?.purchased === true && record.spec.marketplace?.source === 'marketplace_strategy'
    && record.spec.marketplace?.listingId === 99 && record.spec.marketplace?.sellerId === 7
    && record.spec.marketplace?.sourceStrategyId === 55 && record.spec.marketplace?.proofType === 'shadow',
    JSON.stringify(record.spec.marketplace));
  const { marketplace: _stamp, ...cloneTrading } = record.spec as any;
  check('D3 the clone trading content is identical to the seller spec',
    JSON.stringify(cloneTrading) === JSON.stringify(spec));
  check('D4 the clone is a deep copy — editing it cannot touch the seller spec',
    record.spec !== spec && record.spec.indicators !== spec.indicators
    && (() => { (record.spec.indicators[0] as any).period = 99; return (spec.indicators[0] as any).period === 9; })());
  check('D5 the clone is deployable to Shadow under the deployment route rules',
    strategyShadowDeployability(record.spec).ok === true);
  check('D6 an engine-native spec is honestly NOT shadow-deployable',
    strategyShadowDeployability({ ...spec, source: 'engine', engineStrategyKey: 'sniper', entryLong: { logic: 'AND', conditions: [] }, entryShort: { logic: 'AND', conditions: [] } }).ok === false);
  check('D7 a spec with no entry rules is not shadow-deployable',
    strategyShadowDeployability({ ...spec, entryLong: { logic: 'AND', conditions: [] }, entryShort: { logic: 'AND', conditions: [] } }).ok === false);
  const direct = cloneStrategySpecForBuyer(spec, { listingId: 5, sellerId: 6, sourceStrategyId: 7, proofType: 'live' });
  check('D8 a live-proven clone carries the live proof label', direct.marketplace?.proofType === 'live');

  // Package preflight now lives in preflightBrainListingGrant, called by
  // BOTH money-moving routes before any wallet debit (subscriptions PR).
  check('D9 the strategy package is verified BEFORE any wallet debit (no charge without a package)',
    routesSrc.includes('getStrategyMarketplacePackage')
    && buySeg.indexOf('preflightBrainListingGrant') > 0
    && buySeg.indexOf('preflightBrainListingGrant') < buySeg.indexOf('updateInternalWalletBalance'));
  check('D10 the shared grant clones the strategy for the buyer on purchase/subscribe',
    routesSrc.includes('clonePurchasedStrategy(buyerId, listing.id, grantType)')
    && routesSrc.includes("listing.sourceCategory === 'wizard_strategy'"));
  const listSeg = routesSrc.slice(routesSrc.indexOf('app.post("/api/strategy-wizard/spec-strategies/:id/list-brain"'), routesSrc.indexOf('app.get("/api/strategy-wizard/spec-strategies"'));
  check('D11 the Studio list route records the deployable package for spec strategies',
    listSeg.includes('recordStrategyMarketplacePackage') && listSeg.includes("'wizard_strategy'"));
  check('D12 the Studio list route snapshots only the proving layer',
    listSeg.includes("isShadow ? (t as any).mode === 'shadow' : (t as any).mode !== 'shadow'"));
}

console.log(`\n${total - failures}/${total} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
