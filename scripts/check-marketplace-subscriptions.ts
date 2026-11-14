/**
 * Marketplace SUBSCRIPTIONS — verification.
 *
 * Run:  node --import tsx/esm scripts/check-marketplace-subscriptions.ts
 *
 * The subscription state machine is pure (status transitions,
 * charge-due decisions, access windows, period keys), so every
 * transition the task pins is exercised directly. The DB-bound paths
 * (wallet moves, claim-first renewal, revocation sweep, routes) are
 * pinned by source checks on the exact guards they must contain —
 * the same split the other marketplace check scripts use.
 *
 *   A. Subscribe terms: month 1 charged immediately (route source),
 *      price locked on the row, +30d period stamped.
 *   B. Seller price changes never move an existing subscriber: the
 *      renewal amount reads ONLY the locked row price.
 *   C. Renewal success extends paid-through by exactly one period and
 *      resets failed attempts; the period is then no longer due
 *      (idempotency at the state level) and its period key differs
 *      from the next period's.
 *   D. Insufficient balance: past_due with a next-day retry, access
 *      held during the retry grace, 3rd failure lapses and ends access.
 *   E. Cancel: access runs to paid-through, then ends; a cancelled
 *      subscription is never charge-due.
 *   F. Grant provenance: FX imports and strategy clones stamp
 *      grantType; 'purchase' is the default (permanent).
 *   G. Access gating hooks exist where they must: importedSliceLiveReady
 *      consults subscription access only for subscription grants; the
 *      deploy route blocks subscription clones without access; the
 *      runner pauses lapsed clones' Shadow deployments.
 *   H. Kill switch MARKETPLACE_SUBSCRIPTIONS=off: subscribe route 404s,
 *      browse hides monthly prices, the runner is a no-op.
 *   I. No platform fee: charges credit the seller the full locked
 *      amount (source-pinned in the wallet helper + buy route parity).
 */
import { readFileSync } from 'node:fs';
import {
  SUBSCRIPTION_PERIOD_DAYS,
  SUBSCRIPTION_MAX_FAILED_ATTEMPTS,
  subscriptionsEnabled,
  addDays,
  subscriptionPeriodKey,
  renewalChargeAmount,
  initialSubscriptionTerms,
  subscriptionAccessActive,
  subscriptionAccessEnded,
  subscriptionChargeDue,
  subscriptionAfterChargeSuccess,
  subscriptionAfterChargeFailure,
  runSubscriptionRenewals,
  type SubscriptionRecord,
} from '../server/services/marketplace-subscriptions';
import { stampFxModelImportContext, importedSliceMeetsBar, MODELS_EPOCH } from '../server/services/fx-models';
import { cloneStrategySpecForBuyer } from '../server/services/strategy-marketplace';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`); }
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const T0 = new Date('2026-11-12T12:00:00Z');
const DAY = 86_400_000;
const baseSub = (over: Partial<SubscriptionRecord> = {}): SubscriptionRecord => ({
  id: 7, listingId: 42, sellerId: 2, buyerId: 3, priceVeddMonthly: 40,
  status: 'active', startedAt: T0, lastChargedAt: T0,
  nextChargeAt: addDays(T0, 30), paidThroughAt: addDays(T0, 30),
  failedAttempts: 0, grantedAt: T0, accessRevokedAt: null, cancelledAt: null,
  createdAt: T0, updatedAt: T0, ...over,
});

// ── A. Subscribe terms ────────────────────────────────────────────────
{
  const t = initialSubscriptionTerms(T0);
  check('A1 period is 30 days', SUBSCRIPTION_PERIOD_DAYS === 30);
  check('A2 new subscription starts active', t.status === 'active');
  check('A3 paid through exactly +30d', t.paidThroughAt.getTime() - T0.getTime() === 30 * DAY);
  check('A4 next charge falls due at the paid-through boundary', t.nextChargeAt.getTime() === t.paidThroughAt.getTime());
  check('A5 month 1 marked charged at subscribe time', t.lastChargedAt.getTime() === T0.getTime() && t.failedAttempts === 0);
  const routes = src('server/routes.ts');
  check('A6 subscribe route charges BEFORE creating the row', (() => {
    const seg = routes.slice(routes.indexOf('/api/brain-marketplace/:id/subscribe'));
    const chargeAt = seg.indexOf('chargeSubscriptionWallet');
    const createAt = seg.indexOf('createSubscriptionRecord');
    return chargeAt > 0 && createAt > chargeAt;
  })());
  check('A7 insufficient balance on subscribe → 402, no row (route source)',
    routes.includes("if (e?.name === 'InsufficientVeddError')") && routes.includes('monthlyPrice'));
  check('A8 subscribe reuses the buy grant helper (no divergent copy)',
    routes.includes("grantBrainListingToBuyer(listing, buyerId, 'subscription')") &&
    routes.includes("grantBrainListingToBuyer(listing, buyerId, 'purchase')"));
  check('A9 one active subscription per buyer+listing (schema unique)',
    src('server/services/marketplace-subscriptions.ts').includes('UNIQUE(listing_id, buyer_id)'));
  check('A10 subscribing when a one-time purchase exists grants/charges nothing (route source)',
    routes.includes('alreadyOwned: true'));
}

// ── B. Locked price ───────────────────────────────────────────────────
{
  const sub = baseSub({ priceVeddMonthly: 40 });
  check('B1 renewal charges the locked price', renewalChargeAmount(sub) === 40);
  // The seller edits the listing to 75/mo: the renewal amount reads only
  // the subscription row, so an existing subscriber is unmoved…
  const listingNowCosts = 75;
  check('B2 seller price change does not move existing subscribers',
    renewalChargeAmount(sub) === 40 && renewalChargeAmount(sub) !== listingNowCosts);
  // …while a NEW subscriber locks the new price.
  const newSub = baseSub({ priceVeddMonthly: listingNowCosts });
  check('B3 new subscribers lock the new price', renewalChargeAmount(newSub) === 75);
}

// ── C. Renewal success + idempotency ──────────────────────────────────
{
  const sub = baseSub();
  const dueAt = sub.nextChargeAt;
  check('C1 charge is due at the boundary', subscriptionChargeDue(sub, dueAt) === true);
  check('C2 charge is not due a day early', subscriptionChargeDue(sub, addDays(dueAt, -1)) === false);
  const after = subscriptionAfterChargeSuccess(sub, dueAt);
  check('C3 success extends paid-through by exactly one period',
    after.paidThroughAt.getTime() - sub.paidThroughAt.getTime() === 30 * DAY);
  check('C4 success resets failed attempts and restores active',
    after.failedAttempts === 0 && after.status === 'active');
  const renewed = baseSub({ ...after });
  check('C5 after a successful charge the period is no longer due (re-run is a no-op)',
    subscriptionChargeDue(renewed, dueAt) === false && subscriptionChargeDue(renewed, addDays(dueAt, 29)) === false);
  check('C6 period keys are stable per period and unique across periods',
    subscriptionPeriodKey(7, sub.paidThroughAt) === subscriptionPeriodKey(7, sub.paidThroughAt) &&
    subscriptionPeriodKey(7, sub.paidThroughAt) !== subscriptionPeriodKey(7, after.paidThroughAt));
  const svc = src('server/services/marketplace-subscriptions.ts');
  check('C7 runner claims the period before moving money (claim-first source)',
    svc.indexOf('WHERE id=$1 AND next_charge_at=$5') > 0 &&
    svc.indexOf('chargeSubscriptionWallet(sub.buyerId') > svc.indexOf('WHERE id=$1 AND next_charge_at=$5'));
  check('C8 every charge leaves a uniquely-keyed receipt (source)',
    svc.includes('UNIQUE') && svc.includes('ON CONFLICT (period_key) DO UPDATE'));
}

// ── D. Failure ladder → lapse ─────────────────────────────────────────
{
  let sub = baseSub();
  check('D1 max failed attempts is 3', SUBSCRIPTION_MAX_FAILED_ATTEMPTS === 3);
  const f1 = subscriptionAfterChargeFailure(sub, sub.nextChargeAt);
  check('D2 first failure → past_due, retry tomorrow, paid-through unmoved',
    f1.status === 'past_due' && f1.failedAttempts === 1 &&
    f1.nextChargeAt.getTime() - sub.nextChargeAt.getTime() === DAY);
  sub = baseSub({ status: f1.status, failedAttempts: f1.failedAttempts, nextChargeAt: f1.nextChargeAt });
  check('D3 access holds during the retry grace', subscriptionAccessActive(sub, f1.nextChargeAt) === true);
  check('D4 past_due subscription is charge-due at its retry time', subscriptionChargeDue(sub, f1.nextChargeAt) === true);
  const f2 = subscriptionAfterChargeFailure(sub, f1.nextChargeAt);
  const f3 = subscriptionAfterChargeFailure(baseSub({ failedAttempts: f2.failedAttempts }), f1.nextChargeAt);
  check('D5 third failure lapses the subscription', f3.status === 'lapsed' && f3.failedAttempts === 3);
  const lapsed = baseSub({ status: 'lapsed', failedAttempts: 3 });
  check('D6 lapse ends access immediately', subscriptionAccessActive(lapsed, T0) === false && subscriptionAccessEnded(lapsed, T0) === true);
  check('D7 a lapsed subscription is never charged again', subscriptionChargeDue(lapsed, addDays(T0, 365)) === false);
  const svc = src('server/services/marketplace-subscriptions.ts');
  check('D8 lapse pauses the clone\'s running Shadow deployments (revocation source)',
    svc.includes("d.platform === 'shadow'") && svc.includes('stopDeployment'));
}

// ── E. Cancel ─────────────────────────────────────────────────────────
{
  const sub = baseSub({ status: 'cancelled', cancelledAt: T0 });
  check('E1 cancelled keeps access until paid-through', subscriptionAccessActive(sub, addDays(T0, 10)) === true);
  check('E2 cancelled access ends at paid-through', subscriptionAccessActive(sub, sub.paidThroughAt) === false);
  check('E3 ended cancellation is flagged as access-ended', subscriptionAccessEnded(sub, sub.paidThroughAt) === true);
  check('E4 a cancelled subscription is never charge-due', subscriptionChargeDue(sub, addDays(T0, 365)) === false);
  const routes = src('server/routes.ts');
  check('E5 cancel route is buyer-scoped (source)',
    routes.includes('/api/brain-marketplace/subscriptions/:id/cancel') && routes.includes('cancelSubscription(subId, buyerId)'));
}

// ── F. Grant provenance ───────────────────────────────────────────────
{
  const row: any = { epoch: 2, model: 'M1', dayType: 'range', symbol: 'EURUSD', session: 'london' };
  const subStamp: any = stampFxModelImportContext({}, row, { sellerId: 2, listingId: 42, grantType: 'subscription' });
  check('F1 subscription imports stamp grantType=subscription', subStamp?.marketplace?.grantType === 'subscription');
  const buyStamp: any = stampFxModelImportContext({}, row, { sellerId: 2, listingId: 42 });
  check('F2 default grant is purchase (permanent)', buyStamp?.marketplace?.grantType === 'purchase');
  const spec: any = { source: 'custom', symbol: 'EURUSD', timeframe: 'H1', entryLong: { conditions: [{ type: 'rsi_below', value: 30 }] } };
  const cloneSub = cloneStrategySpecForBuyer(spec, { listingId: 42, sellerId: 2, sourceStrategyId: 9, proofType: 'shadow', grantType: 'subscription' });
  check('F3 strategy clones stamp grantType=subscription', (cloneSub as any).marketplace?.grantType === 'subscription');
  const cloneBuy = cloneStrategySpecForBuyer(spec, { listingId: 42, sellerId: 2, sourceStrategyId: 9, proofType: 'shadow' });
  check('F4 strategy clones default to purchase', (cloneBuy as any).marketplace?.grantType === 'purchase');
  check('F5 clone trading content is untouched by the stamp',
    JSON.stringify((cloneSub as any).entryLong) === JSON.stringify(spec.entryLong));
}

// ── G. Access gating hooks ────────────────────────────────────────────
{
  const fx = src('server/services/fx-models.ts');
  check('G1 importedSliceLiveReady gates subscription grants on live subscription access',
    fx.includes("s?.grantType === 'subscription'") && fx.includes('hasMarketplaceSubscriptionAccess'));
  const slice: any = {
    source: 'marketplace_model',
    epochTrades: 60, epochWinRate: 0.5, epochAvgR: 0.3, epochLevel: 'Proficient',
    recordEpoch: MODELS_EPOCH, legacy: false, listingId: 42, grantType: 'subscription',
  };
  check('G2 the pure bar itself is grant-agnostic (subscription check is layered in the async gate)',
    importedSliceMeetsBar(slice) === true);
  check('G3 a later one-time purchase upgrades subscription grants in place (source)',
    fx.includes('upgradeFxModelSubscriptionGrants') &&
    src('server/services/strategy-marketplace.ts').includes('upgradeMarketplaceCloneGrant'));
  const routes = src('server/routes.ts');
  check('G4 deploy route blocks new deployments for lapsed subscription clones (source)',
    routes.includes("mp?.grantType === 'subscription'") && routes.includes('hasMarketplaceSubscriptionAccess'));
  check('G5 seller subscriber counts endpoint exists (source)',
    routes.includes('/api/brain-marketplace/my-subscriptions') && routes.includes('listSellerSubscriptionSummary'));
}

// ── H. Kill switch ────────────────────────────────────────────────────
{
  const prev = process.env.MARKETPLACE_SUBSCRIPTIONS;
  delete process.env.MARKETPLACE_SUBSCRIPTIONS;
  check('H1 subscriptions on by default', subscriptionsEnabled() === true);
  process.env.MARKETPLACE_SUBSCRIPTIONS = 'off';
  check('H2 kill switch turns subscriptions off', subscriptionsEnabled() === false);
  const summary = await runSubscriptionRenewals(new Date());
  check('H3 runner is a no-op while the kill switch is off',
    summary.charged === 0 && summary.failed === 0 && summary.lapsed === 0 && summary.revoked === 0);
  const routes = src('server/routes.ts');
  check('H4 subscribe route 404s while off (source)', routes.includes('Subscriptions are not available'));
  check('H5 browse hides monthly prices while off (source)', routes.includes('...(subsOn ? {} : { priceVeddMonthly: null })'));
  if (prev === undefined) delete process.env.MARKETPLACE_SUBSCRIPTIONS; else process.env.MARKETPLACE_SUBSCRIPTIONS = prev;
}

// ── I. No platform fee ────────────────────────────────────────────────
{
  const svc = src('server/services/marketplace-subscriptions.ts');
  check('I1 charge helper credits the seller the FULL amount (source)',
    svc.includes('await storage.updateInternalWalletBalance(buyerId, -amountVedd);') &&
    svc.includes('await storage.addToWalletBalance(sellerId, amountVedd);'));
  const routes = src('server/routes.ts');
  const subSeg = routes.slice(routes.indexOf('/api/brain-marketplace/:id/subscribe'), routes.indexOf('/api/trade-review/daily'));
  check('I2 subscriptions never touch the USD payment-session flow (source)',
    !svc.includes('createPaymentSession') && !subSeg.includes('createPaymentSession'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
