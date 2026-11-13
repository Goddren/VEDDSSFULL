/**
 * Brain Marketplace SUBSCRIPTIONS — the recurring alternative to the
 * one-time purchase (server/routes.ts's /api/brain-marketplace/:id/buy).
 *
 * A listing may carry an optional monthly price in VEDD
 * (brain_data_listings.price_vedd_monthly). Subscribing charges the
 * buyer's internal VEDD wallet immediately and then every 30 days; the
 * seller is credited the FULL amount — the marketplace takes no
 * platform fee on subscriptions, exactly as it takes none on one-time
 * purchases. This deliberately stays on the internal VEDD rail; the USD
 * payment-session flow for platform plans is a different system and is
 * not touched.
 *
 * The subscriber receives EXACTLY what a one-time buy grants (the buy
 * route's grant helper is shared — see routes.ts), stamped
 * grantType='subscription'. Access follows this state machine:
 *
 *   active ──charge fails──▶ past_due ──retry succeeds──▶ active
 *     │                        │ 3rd failed day
 *     │                        ▼
 *     │                      lapsed ── access ends, clones paused
 *     └──cancel──▶ cancelled ── access runs until paid_through_at
 *
 *   · active:    access on.
 *   · past_due:  access stays on during the daily-retry grace (max 3
 *                failed attempts), then the subscription lapses.
 *   · cancelled: no future charges; access until paid_through_at.
 *   · lapsed:    access ends. FX-model slices imported under the
 *                subscription stop qualifying live trades (checked at
 *                hand-off time, importedSliceLiveReady); a strategy
 *                clone from it cannot start new deployments and its
 *                running Shadow deployments are paused (revocation
 *                sweep in the runner). Re-subscribing reactivates the
 *                same row and restores access — nothing is re-imported.
 *
 * A one-time purchase is PERMANENT and is never affected by any of
 * this: imports granted as 'purchase' ignore subscription state, and
 * buying a listing you previously subscribed to upgrades a subscription
 * grant in place (see routes.ts's grant helper).
 *
 * Idempotency: a renewal CLAIMS its period first — one conditional
 * UPDATE that advances paid_through_at/next_charge_at only if
 * next_charge_at still equals the due date the runner read. Only the
 * claim winner moves VEDD; a restarted or duplicated runner pass sees
 * the advanced due date and skips. The claim-first order means the
 * worst crash outcome is a period extended without a charge (never a
 * double charge), and every completed charge leaves a receipt row in
 * brain_marketplace_subscription_charges keyed by a unique period key.
 *
 * Kill switch: MARKETPLACE_SUBSCRIPTIONS=off hides the subscribe
 * option (routes 404 it, listings don't advertise it) and makes the
 * renewal runner a no-op. Existing subscriptions simply stop renewing;
 * one-time buys are untouched.
 */
import { pool } from '../db';
import { storage, InsufficientVeddError } from '../storage';
import { safeInterval, safeTimeout } from '../process-guards';

export const SUBSCRIPTION_PERIOD_DAYS = 30;
export const SUBSCRIPTION_MAX_FAILED_ATTEMPTS = 3;

export type SubscriptionStatus = 'active' | 'past_due' | 'lapsed' | 'cancelled';
export type GrantType = 'purchase' | 'subscription';

export interface SubscriptionRecord {
  id: number;
  listingId: number;
  sellerId: number;
  buyerId: number;
  priceVeddMonthly: number; // locked at (re)subscribe time
  status: SubscriptionStatus;
  startedAt: Date;
  lastChargedAt: Date | null;
  nextChargeAt: Date;
  paidThroughAt: Date;
  failedAttempts: number;
  grantedAt: Date | null;
  accessRevokedAt: Date | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export function subscriptionsEnabled(): boolean {
  return process.env.MARKETPLACE_SUBSCRIPTIONS !== 'off';
}

// ── Pure state machine ───────────────────────────────────────────────────
// Everything below in this section is date arithmetic on plain records —
// no DB, no wallet — so the verification script can pin every transition.

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 86_400_000);
}

/** The unique key of the period that STARTS at periodStart. Every retry
 *  of the same period shares the key, so the period can be charged —
 *  and receipted — exactly once. */
export function subscriptionPeriodKey(subscriptionId: number, periodStart: Date): string {
  return `${subscriptionId}:${periodStart.toISOString().slice(0, 10)}`;
}

/** What a renewal charges: the price locked on the subscription row.
 *  The listing's current price is never consulted after subscribe time. */
export function renewalChargeAmount(sub: Pick<SubscriptionRecord, 'priceVeddMonthly'>): number {
  return sub.priceVeddMonthly;
}

/** Terms stamped when a subscription starts (or a lapsed one is
 *  reactivated): month 1 is charged immediately, the next charge is
 *  due exactly one period later, and access is paid through that date. */
export function initialSubscriptionTerms(now: Date): {
  status: SubscriptionStatus; lastChargedAt: Date; paidThroughAt: Date; nextChargeAt: Date; failedAttempts: number;
} {
  const paidThroughAt = addDays(now, SUBSCRIPTION_PERIOD_DAYS);
  return { status: 'active', lastChargedAt: now, paidThroughAt, nextChargeAt: paidThroughAt, failedAttempts: 0 };
}

/** Is the buyer inside their access window right now? */
export function subscriptionAccessActive(
  sub: Pick<SubscriptionRecord, 'status' | 'paidThroughAt' | 'failedAttempts'>,
  now: Date,
): boolean {
  switch (sub.status) {
    case 'active': return true;
    // Retry grace: the runner is still trying to collect, so access
    // holds until the final failed attempt lapses the subscription.
    case 'past_due': return sub.failedAttempts < SUBSCRIPTION_MAX_FAILED_ATTEMPTS;
    case 'cancelled': return now.getTime() < sub.paidThroughAt.getTime();
    case 'lapsed': return false;
    default: return false;
  }
}

/** Access has ENDED (as opposed to never started): drives the
 *  revocation sweep that pauses lapsed strategy clones. */
export function subscriptionAccessEnded(
  sub: Pick<SubscriptionRecord, 'status' | 'paidThroughAt' | 'failedAttempts'>,
  now: Date,
): boolean {
  if (sub.status === 'lapsed') return true;
  if (sub.status === 'cancelled') return now.getTime() >= sub.paidThroughAt.getTime();
  if (sub.status === 'past_due') return sub.failedAttempts >= SUBSCRIPTION_MAX_FAILED_ATTEMPTS;
  return false;
}

/** Should the runner attempt a charge for this subscription now? */
export function subscriptionChargeDue(
  sub: Pick<SubscriptionRecord, 'status' | 'nextChargeAt'>,
  now: Date,
): boolean {
  return (sub.status === 'active' || sub.status === 'past_due') && sub.nextChargeAt.getTime() <= now.getTime();
}

/** Patch after a successful charge: a full new period is added on top
 *  of the previously paid-through date (access was continuous through
 *  any retry grace, so the buyer is charged for continuous service),
 *  attempts reset, and the next charge falls due at the new boundary. */
export function subscriptionAfterChargeSuccess(
  sub: Pick<SubscriptionRecord, 'paidThroughAt'>,
  now: Date,
): { status: SubscriptionStatus; failedAttempts: number; lastChargedAt: Date; paidThroughAt: Date; nextChargeAt: Date } {
  const paidThroughAt = addDays(sub.paidThroughAt, SUBSCRIPTION_PERIOD_DAYS);
  return { status: 'active', failedAttempts: 0, lastChargedAt: now, paidThroughAt, nextChargeAt: paidThroughAt };
}

/** Patch after a failed charge (insufficient VEDD): past_due with a
 *  retry tomorrow; the failure that reaches the cap lapses the
 *  subscription on the spot. paidThroughAt never moves on a failure. */
export function subscriptionAfterChargeFailure(
  sub: Pick<SubscriptionRecord, 'failedAttempts'>,
  now: Date,
): { status: SubscriptionStatus; failedAttempts: number; nextChargeAt: Date } {
  const failedAttempts = sub.failedAttempts + 1;
  if (failedAttempts >= SUBSCRIPTION_MAX_FAILED_ATTEMPTS) {
    return { status: 'lapsed', failedAttempts, nextChargeAt: now };
  }
  return { status: 'past_due', failedAttempts, nextChargeAt: addDays(now, 1) };
}

// ── Tables ───────────────────────────────────────────────────────────────

let tablesReady: Promise<void> | null = null;
export function ensureMarketplaceSubscriptionTables(): Promise<void> {
  return (tablesReady ??= (async () => {
    await pool.query(`ALTER TABLE brain_data_listings ADD COLUMN IF NOT EXISTS price_vedd_monthly INTEGER`);
    await pool.query(`CREATE TABLE IF NOT EXISTS brain_marketplace_subscriptions (
      id SERIAL PRIMARY KEY,
      listing_id INTEGER NOT NULL REFERENCES brain_data_listings(id),
      seller_id INTEGER NOT NULL REFERENCES users(id),
      buyer_id INTEGER NOT NULL REFERENCES users(id),
      price_vedd_monthly INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_charged_at TIMESTAMPTZ,
      next_charge_at TIMESTAMPTZ NOT NULL,
      paid_through_at TIMESTAMPTZ NOT NULL,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      granted_at TIMESTAMPTZ,
      access_revoked_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(listing_id, buyer_id)
    )`);
    await pool.query(`CREATE TABLE IF NOT EXISTS brain_marketplace_subscription_charges (
      id SERIAL PRIMARY KEY,
      subscription_id INTEGER NOT NULL REFERENCES brain_marketplace_subscriptions(id),
      period_key TEXT NOT NULL UNIQUE,
      amount_vedd INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'charged',
      charged_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  })().catch((e) => { tablesReady = null; throw e; }));
}

function rowToSubscription(r: any): SubscriptionRecord {
  const d = (v: any) => (v == null ? null : v instanceof Date ? v : new Date(v));
  return {
    id: Number(r.id),
    listingId: Number(r.listing_id),
    sellerId: Number(r.seller_id),
    buyerId: Number(r.buyer_id),
    priceVeddMonthly: Number(r.price_vedd_monthly),
    status: r.status as SubscriptionStatus,
    startedAt: d(r.started_at)!,
    lastChargedAt: d(r.last_charged_at),
    nextChargeAt: d(r.next_charge_at)!,
    paidThroughAt: d(r.paid_through_at)!,
    failedAttempts: Number(r.failed_attempts) || 0,
    grantedAt: d(r.granted_at),
    accessRevokedAt: d(r.access_revoked_at),
    cancelledAt: d(r.cancelled_at),
    createdAt: d(r.created_at)!,
    updatedAt: d(r.updated_at)!,
  };
}

// ── Reads ────────────────────────────────────────────────────────────────

export async function getSubscriptionByListingAndBuyer(listingId: number, buyerId: number): Promise<SubscriptionRecord | null> {
  await ensureMarketplaceSubscriptionTables();
  const { rows } = await pool.query(
    `SELECT * FROM brain_marketplace_subscriptions WHERE listing_id=$1 AND buyer_id=$2`,
    [listingId, buyerId],
  ).catch(() => ({ rows: [] as any[] }));
  return rows.length ? rowToSubscription(rows[0]) : null;
}

export async function getSubscriptionById(id: number): Promise<SubscriptionRecord | null> {
  await ensureMarketplaceSubscriptionTables();
  const { rows } = await pool.query(
    `SELECT * FROM brain_marketplace_subscriptions WHERE id=$1`, [id],
  ).catch(() => ({ rows: [] as any[] }));
  return rows.length ? rowToSubscription(rows[0]) : null;
}

/** The access question every gate asks: does this buyer currently have
 *  subscription access to this listing? One-time purchases are not
 *  subscriptions and are never answered here. */
export async function hasMarketplaceSubscriptionAccess(buyerId: number, listingId: number, now = new Date()): Promise<boolean> {
  const sub = await getSubscriptionByListingAndBuyer(listingId, buyerId).catch(() => null);
  return !!sub && subscriptionAccessActive(sub, now);
}

export async function listBuyerSubscriptions(buyerId: number): Promise<Array<SubscriptionRecord & { listingTitle: string; sourceCategory: string }>> {
  await ensureMarketplaceSubscriptionTables();
  const { rows } = await pool.query(
    `SELECT s.*, l.title AS listing_title, l.source_category
       FROM brain_marketplace_subscriptions s
       JOIN brain_data_listings l ON l.id = s.listing_id
      WHERE s.buyer_id=$1 ORDER BY s.created_at DESC`,
    [buyerId],
  ).catch(() => ({ rows: [] as any[] }));
  return rows.map((r: any) => ({ ...rowToSubscription(r), listingTitle: r.listing_title, sourceCategory: r.source_category }));
}

/** Seller-side read: per listing, how many subscribers are in an
 *  access-active state and how much VEDD/month their locked prices sum
 *  to. Lapsed and fully-ended cancelled subscriptions don't count. */
export async function listSellerSubscriptionSummary(sellerId: number, now = new Date()): Promise<Array<{
  listingId: number; listingTitle: string; activeSubscribers: number; monthlyVedd: number;
}>> {
  await ensureMarketplaceSubscriptionTables();
  const { rows } = await pool.query(
    `SELECT s.*, l.title AS listing_title
       FROM brain_marketplace_subscriptions s
       JOIN brain_data_listings l ON l.id = s.listing_id
      WHERE s.seller_id=$1`,
    [sellerId],
  ).catch(() => ({ rows: [] as any[] }));
  const byListing = new Map<number, { listingId: number; listingTitle: string; activeSubscribers: number; monthlyVedd: number }>();
  for (const r of rows) {
    const sub = rowToSubscription(r);
    if (!subscriptionAccessActive(sub, now)) continue;
    const cur = byListing.get(sub.listingId) ?? { listingId: sub.listingId, listingTitle: r.listing_title, activeSubscribers: 0, monthlyVedd: 0 };
    cur.activeSubscribers += 1;
    cur.monthlyVedd += sub.priceVeddMonthly;
    byListing.set(sub.listingId, cur);
  }
  return Array.from(byListing.values());
}

// ── Wallet charges ───────────────────────────────────────────────────────

/** Move one subscription payment: atomic debit of the buyer, full
 *  credit to the seller (no platform fee). Throws InsufficientVeddError
 *  when the buyer's balance can't cover it — in that case nothing moved. */
export async function chargeSubscriptionWallet(buyerId: number, sellerId: number, amountVedd: number): Promise<void> {
  await storage.updateInternalWalletBalance(buyerId, -amountVedd);
  await storage.addToWalletBalance(sellerId, amountVedd);
}

async function recordSubscriptionCharge(subscriptionId: number, periodKey: string, amountVedd: number, status: 'charged' | 'failed'): Promise<void> {
  await pool.query(
    `INSERT INTO brain_marketplace_subscription_charges (subscription_id, period_key, amount_vedd, status)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (period_key) DO UPDATE SET status=EXCLUDED.status, amount_vedd=EXCLUDED.amount_vedd, charged_at=now()`,
    [subscriptionId, periodKey, amountVedd, status],
  ).catch(() => {});
}

// ── Lifecycle writes (called by the subscribe/cancel routes) ────────────

/** Insert a brand-new subscription AFTER its first month was charged.
 *  The row records the locked price and the first paid period. */
export async function createSubscriptionRecord(input: {
  listingId: number; sellerId: number; buyerId: number; priceVeddMonthly: number; now: Date;
}): Promise<SubscriptionRecord> {
  await ensureMarketplaceSubscriptionTables();
  const t = initialSubscriptionTerms(input.now);
  const { rows } = await pool.query(
    `INSERT INTO brain_marketplace_subscriptions
       (listing_id, seller_id, buyer_id, price_vedd_monthly, status, last_charged_at, next_charge_at, paid_through_at, failed_attempts)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [input.listingId, input.sellerId, input.buyerId, input.priceVeddMonthly, t.status,
     t.lastChargedAt, t.nextChargeAt, t.paidThroughAt, t.failedAttempts],
  );
  const sub = rowToSubscription(rows[0]);
  await recordSubscriptionCharge(sub.id, subscriptionPeriodKey(sub.id, input.now), input.priceVeddMonthly, 'charged');
  return sub;
}

/** Reactivate a LAPSED subscription in place: month 1 is charged by
 *  the caller first; the locked price becomes the listing's CURRENT
 *  monthly price (a fresh subscribe decision), access that was revoked
 *  is un-revoked, and the grant is NOT reapplied (granted_at stays). */
export async function reactivateSubscription(sub: SubscriptionRecord, priceVeddMonthly: number, now: Date): Promise<SubscriptionRecord> {
  await ensureMarketplaceSubscriptionTables();
  const t = initialSubscriptionTerms(now);
  const { rows } = await pool.query(
    `UPDATE brain_marketplace_subscriptions
        SET price_vedd_monthly=$2, status=$3, last_charged_at=$4, next_charge_at=$5,
            paid_through_at=$6, failed_attempts=0, access_revoked_at=NULL, cancelled_at=NULL, updated_at=now()
      WHERE id=$1 RETURNING *`,
    [sub.id, priceVeddMonthly, t.status, t.lastChargedAt, t.nextChargeAt, t.paidThroughAt],
  );
  const next = rowToSubscription(rows[0]);
  await recordSubscriptionCharge(next.id, subscriptionPeriodKey(next.id, now), priceVeddMonthly, 'charged');
  return next;
}

/** Resume a CANCELLED subscription that is still inside its paid
 *  window: no charge — the buyer already paid through paidThroughAt —
 *  renewals simply resume from that boundary. */
export async function resumeSubscription(sub: SubscriptionRecord): Promise<SubscriptionRecord> {
  await ensureMarketplaceSubscriptionTables();
  const { rows } = await pool.query(
    `UPDATE brain_marketplace_subscriptions
        SET status='active', cancelled_at=NULL, next_charge_at=paid_through_at, updated_at=now()
      WHERE id=$1 RETURNING *`,
    [sub.id],
  );
  return rowToSubscription(rows[0]);
}

export async function markSubscriptionGranted(sub: SubscriptionRecord, now: Date): Promise<void> {
  await pool.query(
    `UPDATE brain_marketplace_subscriptions SET granted_at=$2, updated_at=now() WHERE id=$1 AND granted_at IS NULL`,
    [sub.id, now],
  ).catch(() => {});
}

/** Cancel: no future charges. Access continues to paidThroughAt (the
 *  state machine answers that); the revocation sweep enforces the end. */
export async function cancelSubscription(id: number, buyerId: number, now = new Date()): Promise<SubscriptionRecord | null> {
  await ensureMarketplaceSubscriptionTables();
  const { rows } = await pool.query(
    `UPDATE brain_marketplace_subscriptions
        SET status='cancelled', cancelled_at=$3, updated_at=now()
      WHERE id=$1 AND buyer_id=$2 AND status IN ('active','past_due') RETURNING *`,
    [id, buyerId, now],
  );
  return rows.length ? rowToSubscription(rows[0]) : null;
}

// ── Renewal runner ───────────────────────────────────────────────────────

type RenewalOutcome = 'charged' | 'failed' | 'lapsed' | 'skipped' | 'listing-inactive';

/** Process one due subscription. The period is CLAIMED first (see the
 *  header comment) so concurrent/restarted passes can never charge a
 *  period twice; a failed debit rolls the claim back into the failure
 *  transition, so the buyer is never charged for a period they didn't
 *  get and never gets a period they weren't charged for — except the
 *  documented crash window between claim and debit. */
export async function processDueSubscription(sub: SubscriptionRecord, now = new Date()): Promise<RenewalOutcome> {
  await ensureMarketplaceSubscriptionTables();
  const listing = await storage.getBrainListing(sub.listingId).catch(() => undefined);
  if (!listing || !listing.isActive) {
    // The seller retired the listing: stop billing for it. Access runs
    // to the already-paid boundary, like a cancellation.
    await pool.query(
      `UPDATE brain_marketplace_subscriptions SET status='cancelled', cancelled_at=$2, updated_at=now()
        WHERE id=$1 AND status IN ('active','past_due')`,
      [sub.id, now],
    ).catch(() => {});
    return 'listing-inactive';
  }

  const periodKey = subscriptionPeriodKey(sub.id, sub.paidThroughAt);
  const success = subscriptionAfterChargeSuccess(sub, now);
  const claim = await pool.query(
    `UPDATE brain_marketplace_subscriptions
        SET status='active', failed_attempts=0, last_charged_at=$2,
            paid_through_at=$3, next_charge_at=$4, updated_at=now()
      WHERE id=$1 AND next_charge_at=$5 AND status IN ('active','past_due') RETURNING id`,
    [sub.id, success.lastChargedAt, success.paidThroughAt, success.nextChargeAt, sub.nextChargeAt],
  ).catch(() => ({ rows: [] as any[] }));
  if (!claim.rows.length) return 'skipped'; // another pass already took this period

  try {
    await chargeSubscriptionWallet(sub.buyerId, sub.sellerId, renewalChargeAmount(sub));
  } catch (e: any) {
    if (e?.name === 'InsufficientVeddError' || e instanceof InsufficientVeddError) {
      // Nothing moved — roll the claim back into the failure state.
      const failure = subscriptionAfterChargeFailure(sub, now);
      await pool.query(
        `UPDATE brain_marketplace_subscriptions
            SET status=$2, failed_attempts=$3, next_charge_at=$4,
                paid_through_at=$5, last_charged_at=$6, updated_at=now()
          WHERE id=$1`,
        [sub.id, failure.status, failure.failedAttempts, failure.nextChargeAt, sub.paidThroughAt, sub.lastChargedAt],
      ).catch(() => {});
      await recordSubscriptionCharge(sub.id, periodKey, renewalChargeAmount(sub), 'failed');
      return failure.status === 'lapsed' ? 'lapsed' : 'failed';
    }
    // A non-balance error after a successful claim: leave the claim in
    // place (period extended, charge outcome unknown) rather than risk
    // a double charge on the next pass; the receipt gap is auditable.
    console.error(`[marketplace-subscriptions] charge error for subscription ${sub.id} (period ${periodKey}):`, e?.message ?? e);
    return 'skipped';
  }
  await recordSubscriptionCharge(sub.id, periodKey, renewalChargeAmount(sub), 'charged');
  return 'charged';
}

/** Enforce an ended subscription's access loss for strategy clones:
 *  running SHADOW deployments of the buyer's subscription-granted
 *  clone are paused (the deployment status mechanism), and new
 *  deployments are blocked at the deploy route by the same access
 *  check. Broker deployments are NOT force-stopped — stopping halts
 *  entries in this app by user action; a lapsed subscription flags the
 *  clone and blocks new deployments instead. FX-model access needs no
 *  sweep: eligibility is computed at hand-off time. */
export async function revokeSubscriptionAccess(sub: SubscriptionRecord): Promise<void> {
  try {
    const sm = await import('./strategy-marketplace');
    const clones = await sm.findMarketplaceCloneStrategies(sub.buyerId, sub.listingId);
    const subscriptionClones = clones.filter((c) => c.grantType === 'subscription');
    if (subscriptionClones.length) {
      const deps = await import('./strategy-deployments');
      for (const clone of subscriptionClones) {
        const mine = await deps.listDeployments(sub.buyerId, clone.strategyId);
        for (const d of mine) {
          if (d.status === 'running' && d.platform === 'shadow') {
            await deps.stopDeployment(sub.buyerId, d.id).catch(() => {});
          }
        }
      }
    }
  } catch (e: any) {
    console.error(`[marketplace-subscriptions] revocation sweep failed for subscription ${sub.id}:`, e?.message ?? e);
  }
  await pool.query(
    `UPDATE brain_marketplace_subscriptions SET access_revoked_at=now(), updated_at=now() WHERE id=$1`,
    [sub.id],
  ).catch(() => {});
}

/** One runner pass: renew everything due, then enforce every access
 *  loss that hasn't been enforced yet. Safe to call any time — the
 *  claim in processDueSubscription makes repeat passes no-ops. */
export async function runSubscriptionRenewals(now = new Date()): Promise<{ charged: number; failed: number; lapsed: number; skipped: number; revoked: number }> {
  const summary = { charged: 0, failed: 0, lapsed: 0, skipped: 0, revoked: 0 };
  if (!subscriptionsEnabled()) return summary;
  await ensureMarketplaceSubscriptionTables();
  const { rows } = await pool.query(
    `SELECT * FROM brain_marketplace_subscriptions
      WHERE status IN ('active','past_due') AND next_charge_at <= $1
      ORDER BY next_charge_at ASC LIMIT 200`,
    [now],
  ).catch(() => ({ rows: [] as any[] }));
  for (const r of rows) {
    const sub = rowToSubscription(r);
    if (!subscriptionChargeDue(sub, now)) { summary.skipped++; continue; }
    try {
      const outcome = await processDueSubscription(sub, now);
      if (outcome === 'charged') summary.charged++;
      else if (outcome === 'failed') summary.failed++;
      else if (outcome === 'lapsed') summary.lapsed++;
      else summary.skipped++;
    } catch (e: any) {
      summary.skipped++;
      console.error(`[marketplace-subscriptions] renewal failed for subscription ${sub.id}:`, e?.message ?? e);
    }
  }
  const ended = await pool.query(
    `SELECT * FROM brain_marketplace_subscriptions
      WHERE access_revoked_at IS NULL AND status IN ('lapsed','cancelled','past_due') LIMIT 200`,
  ).catch(() => ({ rows: [] as any[] }));
  for (const r of ended.rows) {
    const sub = rowToSubscription(r);
    if (!subscriptionAccessEnded(sub, now)) continue;
    await revokeSubscriptionAccess(sub);
    summary.revoked++;
  }
  if (summary.charged || summary.failed || summary.lapsed || summary.revoked) {
    console.log(`[marketplace-subscriptions] renewal pass: ${JSON.stringify(summary)}`);
  }
  return summary;
}

let runnerStarted = false;
export function startMarketplaceSubscriptionRunner(): void {
  if (runnerStarted) return;
  runnerStarted = true;
  if (!subscriptionsEnabled()) {
    console.log('[marketplace-subscriptions] disabled via MARKETPLACE_SUBSCRIPTIONS=off — runner not started.');
    return;
  }
  // First pass shortly after boot (catches anything that fell due
  // while the process was down), then an hourly tick. Charges are
  // daily-due by construction; the hourly tick only bounds the delay,
  // and the per-period claim makes extra passes harmless.
  safeTimeout('marketplace-subscription-renewals-boot', 90_000, () => runSubscriptionRenewals());
  safeInterval('marketplace-subscription-renewals', 60 * 60 * 1000, () => runSubscriptionRenewals());
  console.log('[marketplace-subscriptions] renewal runner started (hourly tick, 30-day periods).');
}
