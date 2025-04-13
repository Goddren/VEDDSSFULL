import Stripe from 'stripe';
import { db } from './db';
import { subscriptionPlans, users } from '@shared/schema';
import { eq } from 'drizzle-orm';

// Initialize Stripe client if key is available
export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

// Log warning if Stripe is not configured
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('Warning: STRIPE_SECRET_KEY not found. Stripe features will be disabled.');
}

// Create a Stripe customer for user
export async function createStripeCustomer(userId: number, email: string, name?: string) {
  try {
    // Create a new Stripe customer
    const customer = await stripe.customers.create({
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
    if (user.stripeCustomerId) {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
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

// Create a subscription for a user
export async function createSubscription(userId: number, planId: number) {
  try {
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

    // Ensure we have a Stripe customer
    if (!user.stripeCustomerId) {
      if (!user.email) {
        throw new Error('User email is required for creating a customer');
      }
      const customer = await createStripeCustomer(user.id, user.email, user.fullName || undefined);
      user.stripeCustomerId = customer.id;
    }

    // Get or create a Stripe Product and Price if they don't exist
    if (!plan.stripeProductId || !plan.stripePriceId) {
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description,
        metadata: {
          planId: plan.id.toString(),
        },
      });

      const price = await stripe.prices.create({
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
      };
    }

    // Create a subscription with a trial
    const subscription = await stripe.subscriptions.create({
      customer: user.stripeCustomerId,
      items: [
        {
          price: plan.stripePriceId,
        },
      ],
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice'],
      metadata: {
        userId: user.id.toString(),
        planId: plan.id.toString(),
      },
    });

    // Get current_period_end from metadata or use default (30 days)
    const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // First update the user record
    await db
      .update(users)
      .set({
        subscriptionPlanId: plan.id,
        stripeSubscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        subscriptionCurrentPeriodEnd: currentPeriodEnd,
      })
      .where(eq(users.id, userId));
    
    // Get the payment intent details in a separate call if needed
    let clientSecret = null;
    if (subscription.latest_invoice && typeof subscription.latest_invoice !== 'string') {
      const invoice = subscription.latest_invoice;
      if (invoice.payment_intent && typeof invoice.payment_intent !== 'string') {
        clientSecret = invoice.payment_intent.client_secret;
      } else if (invoice.payment_intent) {
        // If we only have the ID, fetch the payment intent
        const paymentIntent = await stripe.paymentIntents.retrieve(invoice.payment_intent as string);
        clientSecret = paymentIntent.client_secret;
      }
    }

    return {
      status: subscription.status,
      currentPeriodEnd: currentPeriodEnd,
      clientSecret: clientSecret,
    };
  } catch (error) {
    console.error('Error creating subscription:', error);
    throw error;
  }
}

// Check if user can perform an action based on their subscription limits
export async function checkUserSubscriptionLimits(userId: number, actionType: 'analysis' | 'social_share') {
  try {
    // Get user with their subscription plan
    const [user] = await db
      .select({
        id: users.id,
        subscriptionPlanId: users.subscriptionPlanId,
        subscriptionStatus: users.subscriptionStatus,
        monthlyAnalysisCount: users.monthlyAnalysisCount,
        monthlySocialShareCount: users.monthlySocialShareCount,
        lastCountReset: users.lastCountReset,
      })
      .from(users)
      .where(eq(users.id, userId));

    if (!user) {
      throw new Error('User not found');
    }

    // If user doesn't have a subscription plan, assign them the free plan (id: 1)
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

    // Get the user's subscription plan
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, user.subscriptionPlanId));

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
    // Get user
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.stripeSubscriptionId) {
      throw new Error('User has no active subscription');
    }

    // Cancel the subscription in Stripe
    const subscription = await stripe.subscriptions.cancel(user.stripeSubscriptionId);

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