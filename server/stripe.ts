import Stripe from 'stripe';
import { db } from './db';
import { subscriptionPlans, users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { getUncachableStripeClient } from './stripeClient';

// Legacy stripe client for backwards compatibility - prefer getUncachableStripeClient()
export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Get Stripe client (uses Replit connection or falls back to env var)
async function getStripe(): Promise<Stripe> {
  try {
    return await getUncachableStripeClient();
  } catch (e) {
    console.log('Replit Stripe connector not available, falling back to STRIPE_SECRET_KEY:', e instanceof Error ? e.message : 'Unknown error');
    if (stripe) {
      console.log('Using STRIPE_SECRET_KEY environment variable for Stripe');
      return stripe;
    }
    throw new Error('Stripe not configured. Please set STRIPE_SECRET_KEY or configure Stripe connection.');
  }
}

// Create a Stripe customer for user
export async function createStripeCustomer(userId: number, email: string, name?: string) {
  try {
    const stripeClient = await getStripe();
    // Create a new Stripe customer
    const customer = await stripeClient.customers.create({
      email,
      name: name || email,
      metadata: {
        userId: userId.toString(),
      },
    });

    // Update user with Stripe customer ID
    await db
      .update(users)
      .set({
        stripeCustomerId: customer.id,
      })
      .where(eq(users.id, userId));

    return customer;
  } catch (error) {
    console.error('Error creating Stripe customer:', error);
    throw error;
  }
}

// Get or create Stripe customer for a user
export async function getOrCreateStripeCustomer(userId: number, email: string, name?: string) {
  try {
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // If user already has a Stripe customer ID, retrieve the customer
    const stripeClient = await getStripe();
    if (user.stripeCustomerId) {
      const customer = await stripeClient.customers.retrieve(user.stripeCustomerId);
      if (customer.deleted) {
        throw new Error('Stripe customer was deleted');
      }
      return customer;
    }

    // Create a new Stripe customer
    return await createStripeCustomer(userId, email, name);
  } catch (error) {
    console.error('Error getting/creating Stripe customer:', error);
    throw error;
  }
}

// Create a subscription for a user using Stripe Checkout Session
export async function createSubscription(userId: number, planId: number, successUrl?: string, cancelUrl?: string) {
  try {
    const stripeClient = await getStripe();
    
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    // Get plan
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, planId));
    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    // Ensure we have a valid Stripe customer
    if (user.stripeCustomerId) {
      // Verify customer exists in current Stripe account
      try {
        const existingCustomer = await stripeClient.customers.retrieve(user.stripeCustomerId);
        if ((existingCustomer as any).deleted) {
          // Customer was deleted, need to create a new one
          user.stripeCustomerId = null;
        }
      } catch (e: any) {
        // Customer doesn't exist in this Stripe account (likely switched accounts)
        console.log('Stripe customer not found, creating new one:', e.message);
        user.stripeCustomerId = null;
        // Clear the invalid customer ID from the database
        await db.update(users).set({ stripeCustomerId: null }).where(eq(users.id, user.id));
      }
    }
    
    if (!user.stripeCustomerId) {
      if (!user.email) {
        throw new Error('User email is required for creating a customer');
      }
      const customer = await createStripeCustomer(user.id, user.email, user.fullName || undefined);
      user.stripeCustomerId = customer.id;
    }

    // Get or create a Stripe Product and Price if they don't exist
    if (!plan.stripeProductId || !plan.stripePriceId) {
      const product = await stripeClient.products.create({
        name: plan.name,
        description: plan.description || undefined,
        metadata: {
          planId: plan.id.toString(),
        },
      });

      const price = await stripeClient.prices.create({
        product: product.id,
        unit_amount: plan.price,
        currency: 'usd',
        recurring: {
          interval: plan.interval as 'day' | 'week' | 'month' | 'year',
        },
        metadata: {
          planId: plan.id.toString(),
        },
      });

      // Update plan with Stripe IDs
      await db
        .update(subscriptionPlans)
        .set({
          stripeProductId: product.id,
          stripePriceId: price.id,
        })
        .where(eq(subscriptionPlans.id, plan.id));

      plan.stripeProductId = product.id;
      plan.stripePriceId = price.id;
    }

    // Handle free plan differently
    if (plan.price === 0) {
      // Update user with free plan
      await db
        .update(users)
        .set({
          subscriptionPlanId: plan.id,
          subscriptionStatus: 'active',
          subscriptionCurrentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        })
        .where(eq(users.id, userId));

      return { 
        status: 'active', 
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        clientSecret: null,
        checkoutUrl: null,
      };
    }

    // Create a Stripe Checkout Session for paid plans
    const baseUrl = process.env.REPLIT_DOMAINS 
      ? `https://${process.env.REPLIT_DOMAINS.split(',')[0]}`
      : 'http://localhost:5000';
    
    const session = await stripeClient.checkout.sessions.create({
      customer: user.stripeCustomerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: plan.stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl || `${baseUrl}/subscription?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${baseUrl}/subscription?canceled=true`,
      metadata: {
        userId: user.id.toString(),
        planId: plan.id.toString(),
      },
      subscription_data: {
        metadata: {
          userId: user.id.toString(),
          planId: plan.id.toString(),
        },
      },
    });

    return {
      status: 'pending',
      checkoutUrl: session.url,
      sessionId: session.id,
      clientSecret: null,
    };
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
}

// Check if user can perform an action based on their subscription limits
export async function checkUserSubscriptionLimits(userId: number, actionType: 'analysis' | 'social_share') {
  try {
    const MEMBERSHIP_PLAN_MAP: Record<string, string> = {
      basic: 'Starter',
      pro: 'Premium',
      elite: 'Yearly',
    };

    const [user] = await db
      .select({
        id: users.id,
        subscriptionPlanId: users.subscriptionPlanId,
        subscriptionStatus: users.subscriptionStatus,
        monthlyAnalysisCount: users.monthlyAnalysisCount,
        monthlySocialShareCount: users.monthlySocialShareCount,
        lastCountReset: users.lastCountReset,
        membershipTier: users.membershipTier,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    if (!user.subscriptionPlanId) {
      await db
        .update(users)
        .set({
          subscriptionPlanId: 1,
          subscriptionStatus: 'active',
        })
        .where(eq(users.id, userId));
      user.subscriptionPlanId = 1;
      user.subscriptionStatus = 'active';
    }

    let plan;

    if (user.membershipTier && user.membershipTier !== 'none') {
      const equivalentPlanName = MEMBERSHIP_PLAN_MAP[user.membershipTier];
      if (equivalentPlanName) {
        const [tokenPlan] = await db
          .select()
          .from(subscriptionPlans)
          .where(eq(subscriptionPlans.name, equivalentPlanName));
        if (tokenPlan) {
          plan = tokenPlan;
        }
      }
    }

    if (!plan) {
      const [dbPlan] = await db
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, user.subscriptionPlanId));
      plan = dbPlan;
    }

    if (!plan) {
      throw new Error('Subscription plan not found');
    }

    // Check if it's time to reset the monthly counts
    const now = new Date();
    const lastReset = user.lastCountReset ? new Date(user.lastCountReset) : null;
    const resetNeeded = !lastReset || now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();

    if (resetNeeded) {
      // Reset monthly counts
      await db
        .update(users)
        .set({
          monthlyAnalysisCount: 0,
          monthlySocialShareCount: 0,
          lastCountReset: now,
        })
        .where(eq(users.id, userId));

      // Update local variables
      user.monthlyAnalysisCount = 0;
      user.monthlySocialShareCount = 0;
      user.lastCountReset = now;
    }

    // Check limits based on action type
    let allowed = false;
    let currentCount = 0;
    let limit = 0;

    if (actionType === 'analysis') {
      currentCount = user.monthlyAnalysisCount || 0;
      limit = plan.analysisLimit;
      allowed = currentCount < limit;

      // If allowed, increment the analysis count
      if (allowed) {
        await db
          .update(users)
          .set({
            monthlyAnalysisCount: (user.monthlyAnalysisCount || 0) + 1,
          })
          .where(eq(users.id, userId));
      }
    } else if (actionType === 'social_share') {
      currentCount = user.monthlySocialShareCount || 0;
      limit = plan.socialShareLimit;
      allowed = currentCount < limit;

      // If allowed, increment the social share count
      if (allowed) {
        await db
          .update(users)
          .set({
            monthlySocialShareCount: (user.monthlySocialShareCount || 0) + 1,
          })
          .where(eq(users.id, userId));
      }
    }

    return {
      allowed,
      currentCount,
      limit,
      planName: plan.name,
      planId: plan.id,
    };
  } catch (error) {
    console.error(`Error checking ${actionType} limits:`, error);
    throw error;
  }
}

// Cancel a user's subscription
export async function cancelSubscription(userId: number) {
  try {
    const stripeClient = await getStripe();
    
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.stripeSubscriptionId) {
      throw new Error('User has no active subscription');
    }

    // Cancel the subscription in Stripe
    const subscription = await stripeClient.subscriptions.cancel(user.stripeSubscriptionId);

    // Update user with subscription status
    await db
      .update(users)
      .set({
        subscriptionStatus: subscription.status,
      })
      .where(eq(users.id, userId));

    return {
      status: subscription.status,
    };
  } catch (error) {
    console.error('Error cancelling subscription:', error);
    throw error;
  }
}

// Get all subscription plans
export async function getSubscriptionPlans() {
  try {
    return await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.isActive, true));
  } catch (error) {
    console.error('Error getting subscription plans:', error);
    throw error;
  }
}

// Get a user's subscription
export async function getUserSubscription(userId: number) {
  try {
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.subscriptionPlanId) {
      return null;
    }

    // Get plan
    const [plan] = await db.select().from(subscriptionPlans).where(eq(subscriptionPlans.id, user.subscriptionPlanId));
    if (!plan) {
      return null;
    }

    return {
      planId: plan.id,
      planName: plan.name,
      status: user.subscriptionStatus,
      currentPeriodEnd: user.subscriptionCurrentPeriodEnd,
      stripeSubscriptionId: user.stripeSubscriptionId,
      monthlyAnalysisCount: user.monthlyAnalysisCount || 0,
      monthlySocialShareCount: user.monthlySocialShareCount || 0,
      analysisLimit: plan.analysisLimit,
      socialShareLimit: plan.socialShareLimit,
    };
  } catch (error) {
    console.error('Error getting user subscription:', error);
    throw error;
  }
}