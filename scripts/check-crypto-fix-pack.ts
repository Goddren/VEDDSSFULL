/**
 * CRYPTO FIX PACK + FRIENDLIER CRYPTO SECTION — verification.
 *
 * Run:  DATABASE_URL= node --import tsx/esm scripts/check-crypto-fix-pack.ts
 *
 * No database, wallet, RPC, or provider calls: the fix pack's pure
 * helpers (server/services/crypto-fix-pack.ts) and the client display
 * helpers (client/src/lib/crypto-display.ts) are exercised directly,
 * and the monolith wiring (scanner / executors / storage / panels) is
 * pinned by source checks.
 *
 *   A. Fix 1/2 — fail-closed decisions + kill switches.
 *   B. Fix 3 — live cost-floor math, incl. equivalence with the shadow
 *      lane's rule (same shared cost model, shadow file untouched).
 *   C. Fix 4 — real fill price derivation.
 *   D. Fix 5 — gas capture + gas-in-P&L math.
 *   E. Fix 8 — partial-close split math.
 *   F. Fix 9 — quote sanity band math.
 *   G. Fix 7 — drawdown peak merge across restarts.
 *   H. Fix 6 — watch-plan counters persisted to runtime_state; the
 *      summary the panel reads is the async cross-process one.
 *   I. Wiring pins — scanner/executor/swap/storage/schema markers and
 *      every kill switch.
 *   J. UX — status line + budget honesty, plain labels, proc-tag strip,
 *      footnotes, paper readiness, judge empty state, sw vedd-v297.
 */
import { readFileSync } from 'node:fs';
import * as fx from '../server/services/crypto-fix-pack';
import * as disp from '../client/src/lib/crypto-display';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(p, 'utf8');
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const scanner = src('server/services/cryptocom-scanner.ts');
const executor = src('server/services/defi-executor.ts');
const swap = src('server/services/defi-swap.ts');
const storage = src('server/storage.ts');
const schema = src('shared/schema.ts');
const watchPlans = src('server/services/crypto-watch-plans.ts');
const promotions = src('server/services/crypto-shadow-promotions.ts');
const shadow = src('server/services/crypto-shadow.ts');
const enginePage = src('client/src/pages/crypto-engine.tsx');
const paperCard = src('client/src/components/crypto-paper-card.tsx');
const safeguards = src('client/src/components/engine-safeguards-panel.tsx');
const sw = src('client/public/sw.js');

async function main(): Promise<void> {
  // ── A. Fail-closed decisions ──────────────────────────────────────────
  check('A1 consensus throw → NOT allowed by default', fx.consensusThrowAllowsTrade({}) === false);
  check('A2 CRYPTO_CONSENSUS_FAIL_CLOSED=off restores allow-on-throw', fx.consensusThrowAllowsTrade({ CRYPTO_CONSENSUS_FAIL_CLOSED: 'off' }) === true);
  check('A3 promotion consult error → skip by default', fx.promotionErrorSkipsEntry({}) === true);
  check('A4 CRYPTO_PROMOTION_FAIL_CLOSED=off restores fail-open', fx.promotionErrorSkipsEntry({ CRYPTO_PROMOTION_FAIL_CLOSED: 'off' }) === false);

  // ── B. Cost floor ─────────────────────────────────────────────────────
  // $25 notional, 300bps round trip → cost $0.75, floor at 3× = $2.25.
  const below = fx.evaluateCostFloor({ stopPct: 5, roundTripBps: 300, mult: 3, notionalUsd: 25 });
  check('B1 stop $1.25 < 3× cost $2.25 → refused', below.pass === false && approx(below.stopUsd, 1.25) && approx(below.roundTripCostUsd, 0.75) && approx(below.floorUsd, 2.25));
  const above = fx.evaluateCostFloor({ stopPct: 10, roundTripBps: 300, mult: 3, notionalUsd: 25 });
  check('B2 stop $2.50 ≥ floor $2.25 → passes', above.pass === true && approx(above.stopUsd, 2.5));
  const edge = fx.evaluateCostFloor({ stopPct: 9, roundTripBps: 300, mult: 3, notionalUsd: 25 });
  check('B3 stop exactly at the floor passes (shadow rule is strict <)', edge.pass === true && approx(edge.stopUsd, edge.floorUsd));
  const off = fx.evaluateCostFloor({ stopPct: 0.1, roundTripBps: 300, mult: 0, notionalUsd: 25 });
  check('B4 mult 0 disables the floor (shadow semantics)', off.pass === true && off.floorUsd === 0);
  // Equivalence with the shadow lane's own comparison for a sweep of values.
  let equiv = true;
  for (const slPct of [0.5, 2, 4.9, 5, 5.1, 12]) {
    for (const bps of [80, 167, 300, 640]) {
      const shadowSkips = slPct < 3 * bps / 100;
      const liveSkips = !fx.evaluateCostFloor({ stopPct: slPct, roundTripBps: bps, mult: 3, notionalUsd: 25 }).pass;
      if (shadowSkips !== liveSkips) equiv = false;
    }
  }
  check('B5 live floor ≡ shadow rule across a value sweep', equiv);
  check('B6 shadow lane still uses its original rule + the shared cost model',
    shadow.includes('slPct < floorMult * costBps / 100') && shadow.includes("import('./paper-costs')") && scanner.includes("import('./paper-costs')"));

  // ── C. Fill price ─────────────────────────────────────────────────────
  check('C1 fill = spent ÷ received', fx.fillPriceFromSwap(25, 0.5, 60) === 50);
  check('C2 unknown received qty → hint fallback', fx.fillPriceFromSwap(25, 0, 60) === 60 && fx.fillPriceFromSwap(0, 3, 60) === 60);

  // ── D. Gas in P&L ─────────────────────────────────────────────────────
  check('D1 gas USD = native × price', fx.gasUsdFromNative(0.01, 3000) === 30);
  check('D2 unknown gas or price → undefined (not 0)', fx.gasUsdFromNative(null, 3000) === undefined && fx.gasUsdFromNative(0.01, null) === undefined && fx.gasUsdFromNative(undefined, 0) === undefined);
  check('D3 realized P&L nets round-trip gas', fx.realizedPnlAfterGas(100, 5, 3, true) === 92);
  check('D4 kill switch off → gross math', fx.realizedPnlAfterGas(100, 5, 3, false) === 100);
  check('D5 missing gas counts as 0 (historical rows)', fx.realizedPnlAfterGas(100, null, undefined, true) === 100);
  check('D6 gas can turn a small win into the true small loss', fx.realizedPnlAfterGas(2, 1.5, 1.5, true) === -1);

  // ── E. Partial close ──────────────────────────────────────────────────
  const part = fx.partialCloseSplit(10, 4);
  check('E1 sold 4 of 10 → book 4, park 6', part.isPartial && part.bookedQty === 4 && part.remainderQty === 6);
  const full = fx.partialCloseSplit(10, 10);
  check('E2 sold all → full close', !full.isPartial && full.bookedQty === 10 && full.remainderQty === 0);
  const unknown = fx.partialCloseSplit(10, null);
  check('E3 sold qty unknown → full close (legacy)', !unknown.isPartial && unknown.bookedQty === 10);
  const over = fx.partialCloseSplit(10, 12);
  check('E4 sold ≥ held → full close, never negative remainder', !over.isPartial && over.remainderQty === 0);

  // ── F. Quote band ─────────────────────────────────────────────────────
  check('F1 band = slippage + 2%', fx.quoteBandLimitPct(100) === 3 && fx.quoteBandLimitPct(0) === 2 && fx.quoteBandLimitPct(250) === 4.5);
  check('F2 deviation math', approx(fx.quoteDeviationPct(103, 100), 3) && approx(fx.quoteDeviationPct(97, 100), 3) && fx.quoteDeviationPct(100, 100) === 0);
  check('F3 unusable prices → infinite deviation (refuse)', fx.quoteDeviationPct(0, 100) === Infinity && fx.quoteDeviationPct(100, 0) === Infinity);
  check('F4 a 2.9% quote inside a 3% band passes; 3.1% refuses', fx.quoteDeviationPct(102.9, 100) <= fx.quoteBandLimitPct(100) && fx.quoteDeviationPct(103.1, 100) > fx.quoteBandLimitPct(100));

  // ── G. Peak merge ─────────────────────────────────────────────────────
  check('G1 stored peak survives a restart', fx.mergePeakEquity(120, null, 100) === 120);
  check('G2 in-process peak counts', fx.mergePeakEquity(null, 110, 100) === 110);
  check('G3 equity is the floor', fx.mergePeakEquity(null, null, 100) === 100 && fx.mergePeakEquity(90, 95, 100) === 100);
  check('G4 garbage stored value ignored', fx.mergePeakEquity(NaN as any, null, 50) === 50);

  // ── H. Watch-plan reporting ───────────────────────────────────────────
  check('H1 counters persist to runtime_state next to the plan blob',
    watchPlans.includes("['crypto_watch_plans', `${userId}:counters`") && watchPlans.includes('persistCryptoWatchPlanCounters'));
  check('H2 async summary reads the persisted counters cross-process',
    watchPlans.includes('export async function cryptoWatchPlansSummaryAsync') && watchPlans.includes("getRuntimeStateStrict('crypto_watch_plans', `${userId}:counters`)"));
  check('H3 panel payload uses the async summary (sync fallback only)',
    promotions.includes('cryptoWatchPlansSummaryAsync(userId)'));
  check('H4 counters persist on plan resolution too, not just creation',
    watchPlans.includes('resolveCryptoWatchPlanInner') && watchPlans.includes('persistCryptoWatchPlanCounters(userId)'));

  // ── I. Wiring pins ────────────────────────────────────────────────────
  check('I1 scanner: consensus throw is fail-closed with a durable skip row',
    scanner.includes('consensusThrowAllowsTrade') && scanner.includes('consensus check FAILED') && scanner.includes('fail-closed'));
  check('I2 scanner: promotion consult error skips with a durable row',
    scanner.includes('promotionErrorSkipsEntry') && scanner.includes('promoted-guard check FAILED'));
  check('I3 scanner: live cost floor before defiEntryBuy, kill-switched',
    scanner.includes('evaluateCostFloor') && scanner.includes("process.env.CRYPTO_LIVE_COST_FLOOR !== 'off'") && scanner.includes('cost floor: stop $'));
  check('I4 scanner: entry gas persisted on both DeFi trade creates',
    (scanner.split('entryGasUsd: (r as any).gasUsd ?? null').length - 1) === 2);
  check('I5 scanner: close books sold qty only + parks the remainder',
    scanner.includes('partialCloseSplit') && scanner.includes('correctCryptocomEngineTradeQuantityForClose') && scanner.includes("status: 'needs_reconciliation'"));
  check('I6 scanner: realized P&L is gas-adjusted at close, kill-switched',
    scanner.includes('realizedPnlAfterGas') && scanner.includes("process.env.CRYPTO_GAS_IN_PNL !== 'off'") && scanner.includes('exitGasUsd'));
  check('I7 scanner: drawdown peak loads/saves runtime_state',
    scanner.includes("'crypto_peak_equity'") && scanner.includes('mergePeakEquity') && scanner.includes('saveRuntimeState'));
  check('I8 executor: entry price is the real fill, hint kept alongside',
    executor.includes('fillPriceFromSwap') && executor.includes('hintPrice'));
  check('I9 executor/swap: quote band checked before broadcast, kill-switched',
    executor.includes("process.env.CRYPTO_QUOTE_BAND !== 'off'") && swap.includes('quoteDeviationPct') && swap.includes('maxPriceDeviationPct'));
  check('I10 swap layer: FallbackProvider when two RPCs exist, gas captured',
    swap.includes('ethers.FallbackProvider') && swap.includes('rpcUrlsFor') && swap.includes('gasNative'));
  check('I11 storage: gas columns ensured + close accepts exit gas + quantity correction is claim-scoped',
    storage.includes('ensureCryptoTradeGasColumns') && storage.includes('ADD COLUMN IF NOT EXISTS') && storage.includes('correctCryptocomEngineTradeQuantityForClose') && storage.includes("eq(cryptocomEngineTrades.status, 'closing')"));
  check('I12 schema carries the gas columns', schema.includes('entryGasUsd') && schema.includes('exitGasUsd'));
  check('I13 every kill switch named in one place',
    ['CRYPTO_CONSENSUS_FAIL_CLOSED', 'CRYPTO_PROMOTION_FAIL_CLOSED', 'CRYPTO_LIVE_COST_FLOOR', 'CRYPTO_QUOTE_BAND', 'CRYPTO_GAS_IN_PNL'].every(k => src('server/services/crypto-fix-pack.ts').includes(k) || scanner.includes(k) || executor.includes(k)));

  // ── J. UX ─────────────────────────────────────────────────────────────
  check('J1 proc tags stripped (leading, mid-text, none)', disp.stripProcTags('[proc:ab12] hello') === 'hello' && disp.stripProcTags('a [proc:x9] b') === 'a b' && disp.stripProcTags('plain') === 'plain' && disp.stripProcTags(null) === '');
  check('J2 verdict codenames → plain words', disp.verdictPlain('STRONG_CONFIRM') === 'Strong yes' && disp.verdictPlain('STRONG_SKIP') === 'Strong no' && disp.verdictPlain('CAUTION') === 'Borderline' && disp.verdictPlain('WATCH') === 'Watching');
  check('J3 explainer line', disp.CONSENSUS_EXPLAINER === 'Both the strategy score and the AI must agree before real money moves.');
  check('J4 budget exhaustion detected from vote/feed text',
    disp.isBudgetExhaustedText('AI call failed (402 Insufficient credits)') === true
    && disp.isBudgetExhaustedText('AI budget used up for today') === true
    && disp.isBudgetExhaustedText('scanning 12 tokens, all quiet') === false
    && disp.isBudgetExhaustedText(null) === false);
  check('J5 slippage percent label', disp.slippagePctLabel(100) === '1%' && disp.slippagePctLabel(250) === '2.5%' && disp.slippagePctLabel(0) === '0%');
  check('J6 status panel: honest line incl. budget wording + checklist + one wallet figure',
    enginePage.includes('Not trading — AI budget used up for today (resets 00:00 UTC)')
    && enginePage.includes('data-testid="crypto-status-panel"')
    && enginePage.includes('DeFi hot wallet ≈')
    && enginePage.includes('Most recent skip:'));
  check('J7 hero no longer claims hunting when budget is gone', enginePage.includes("budgetHit ? 'Not trading — AI budget used up for today' : 'Live · hunting setups'"));
  check('J8 plain labels: slippage, sizing balance, both daily-loss fields',
    enginePage.includes('Slippage tolerance') && !enginePage.includes('>Slippage bps<')
    && enginePage.includes('Balance the engine uses for position sizing — set by you')
    && enginePage.includes('Daily loss % — Ruin Guard hard halt')
    && enginePage.includes('Daily loss limit (% of account — everyday entry gate)'));
  check('J9 glosses: brain gating + composite in plain words',
    enginePage.includes('stops feeding proven losers') && enginePage.includes('combined score to clear the bar'));
  check('J10 rotation explained in one line (server setting, no fake toggle)',
    enginePage.includes('Rotation: when a strong new signal can’t be funded'));
  check('J11 P&L footnotes present (hero + DeFi snapshot)',
    enginePage.includes('Live P&L includes swap fees, slippage and network gas.') && enginePage.includes('Includes swap fees, slippage and network gas.'));
  check('J12 reasoning rendered through the proc-tag strip in feed + consensus',
    enginePage.includes('{stripProcTags(a.reasoning)}') && enginePage.includes('{stripProcTags(c.aiReasoning)}'));
  check('J13 paper readiness shows all four conditions, bar = conditions met',
    paperCard.includes('conditions') && paperCard.includes('No losing week') && paperCard.includes('metCount / conds.length'));
  check('J14 shadow comparability footnote on the paper card',
    paperCard.includes('Shadow trades model costs their own way — the two aren'));
  check('J15 judge empty state only when no scored rows exist',
    safeguards.includes('(Number(s.n) || 0) > 0') && safeguards.includes('The judge is collecting evidence'));
  check('J16 watch-plans panel renders payload values (no hard-coded 0 state)',
    safeguards.includes('{wp.activePlans} plans live') && safeguards.includes('{wp.entriesViaPlan} entries via plan today'));
  check('J17 sw bumped to vedd-v297', sw.includes("CACHE_VERSION = 'vedd-v297'"));

  console.log(`\n${total - failures}/${total} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error('check crashed:', e); process.exit(1); });
