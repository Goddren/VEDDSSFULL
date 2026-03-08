import crypto from 'crypto';
import { db } from './db';
import { subscriptionPlans, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const LS_API_KEY = process.env.LEMONSQUEEZY_API_KEY || '';
const LS_BASE_URL = 'https://api.lemonsqueezy.com/v1';
const LS_STORE_ID = '310446';
const LS_WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET || '';

function lsHeaders() {
  return {
    'Authorization': `Bearer ${LS_API_KEY}`,
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/vnd.api+json',
  };
}

export async function lsGetStoreInfo() {
  const res = await fetch(`${LS_BASE_URL}/stores/${LS_STORE_ID}`, { headers: lsHeaders() });
  return res.json();
}

export async function lsGetProducts() {
  const res = await fetch(`${LS_BASE_URL}/products?filter[store_id]=${LS_STORE_ID}`, { headers: lsHeaders() });
  return res.json();
}

export async function lsGetVariants() {
  const res = await fetch(`${LS_BASE_URL}/variants?filter[store_id]=${LS_STORE_ID}&page[size]=50`, { headers: lsHeaders() });
  return res.json();
}

export async function lsCreateCheckout(variantId: string, userEmail: string, userName: string, userId: number, planId: number) {
  const body = {
    data: {
      type: 'checkouts',
      attributes: {
        checkout_data: {
          email: userEmail,
          name: userName,
          custom: {
            user_id: userId.toString(),
            plan_id: planId.toString(),
          },
        },
        checkout_options: {
          dark: true,
          logo: true,
          button_color: '#f59e0b',
        },
        product_options: {
          redirect_url: `${process.env.APP_URL || 'https://vedd.lemonsqueezy.com'}/subscription?payment=success`,
          receipt_button_text: 'Return to VEDD AI',
          receipt_link_url: `${process.env.APP_URL || 'https://vedd.lemonsqueezy.com'}/subscription`,
          receipt_thank_you_note: 'Thank you for subscribing to VEDD AI Trading Vault! Your subscription is now active.',
        },
      },
      relationships: {
        store: {
          data: { type: 'stores', id: LS_STORE_ID },
        },
        variant: {
          data: { type: 'variants', id: variantId },
        },
      },
    },
  };

  const res = await fetch(`${LS_BASE_URL}/checkouts`, {
    method: 'POST',
    headers: lsHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Lemon Squeezy checkout error: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export async function lsGetSubscription(subscriptionId: string) {
  const res = await fetch(`${LS_BASE_URL}/subscriptions/${subscriptionId}`, { headers: lsHeaders() });
  return res.json();
}

export async function lsCancelSubscription(subscriptionId: string) {
  const res = await fetch(`${LS_BASE_URL}/subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: lsHeaders(),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(`Lemon Squeezy cancel error: ${JSON.stringify(err)}`);
  }

  return res.json();
}

export function lsVerifyWebhook(rawBody: Buffer, signature: string): boolean {
  if (!LS_WEBHOOK_SECRET) return true;
  const hmac = crypto.createHmac('sha256', LS_WEBHOOK_SECRET);
  hmac.update(rawBody);
  const digest = hmac.digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(signature, 'hex'));
  } catch {
    return false;
  }
}

export async function lsHandleWebhookEvent(event: any) {
  const eventName = event.meta?.event_name;
  const data = event.data;
  const customData = event.meta?.custom_data;

  console.log('[LemonSqueezy webhook]', eventName);

  if (!data || !customData) return { handled: false };

  const userId = customData.user_id ? parseInt(customData.user_id) : null;
  const planId = customData.plan_id ? parseInt(customData.plan_id) : null;

  if (!userId) return { handled: false };

  switch (eventName) {
    case 'order_created':
    case 'subscription_created': {
      const attrs = data.attributes;
      const lsSubscriptionId = data.id;
      const lsCustomerId = attrs?.customer_id?.toString() || null;
      const status = attrs?.status || 'active';
      const renewsAt = attrs?.renews_at ? new Date(attrs.renews_at) : null;

      await db.update(users).set({
        lsSubscriptionId,
        lsCustomerId,
        subscriptionPlanId: planId || undefined,
        subscriptionStatus: status === 'active' ? 'active' : status,
        subscriptionCurrentPeriodEnd: renewsAt || undefined,
      }).where(eq(users.id, userId));

      console.log(`[LS] User ${userId} subscribed to plan ${planId}, ls_subscription_id=${lsSubscriptionId}`);
      return { handled: true, action: 'subscribed' };
    }

    case 'subscription_updated': {
      const attrs = data.attributes;
      const status = attrs?.status || 'active';
      const renewsAt = attrs?.renews_at ? new Date(attrs.renews_at) : null;

      await db.update(users).set({
        subscriptionStatus: status,
        subscriptionCurrentPeriodEnd: renewsAt || undefined,
      }).where(eq(users.id, userId));

      return { handled: true, action: 'updated' };
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      await db.update(users).set({
        subscriptionStatus: 'canceled',
        subscriptionPlanId: 1,
        lsSubscriptionId: null,
      }).where(eq(users.id, userId));

      return { handled: true, action: 'cancelled' };
    }

    case 'subscription_payment_success': {
      const attrs = data.attributes;
      const renewsAt = attrs?.renews_at ? new Date(attrs.renews_at) : null;
      await db.update(users).set({
        subscriptionStatus: 'active',
        subscriptionCurrentPeriodEnd: renewsAt || undefined,
      }).where(eq(users.id, userId));
      return { handled: true, action: 'payment_success' };
    }

    case 'subscription_payment_failed': {
      await db.update(users).set({
        subscriptionStatus: 'past_due',
      }).where(eq(users.id, userId));
      return { handled: true, action: 'payment_failed' };
    }

    default:
      return { handled: false, eventName };
  }
}

export async function lsSetPlanVariantId(planId: number, variantId: string) {
  await db.update(subscriptionPlans)
    .set({ lsVariantId: variantId })
    .where(eq(subscriptionPlans.id, planId));
}

export async function lsGetPlanVariants(): Promise<Record<number, string | null>> {
  const plans = await db.select({
    id: subscriptionPlans.id,
    lsVariantId: subscriptionPlans.lsVariantId,
  }).from(subscriptionPlans);

  return Object.fromEntries(plans.map(p => [p.id, p.lsVariantId ?? null]));
}
