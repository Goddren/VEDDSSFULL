import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  // Use manual STRIPE_SECRET_KEY from environment
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const publishableKey = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
  
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY not found. Please add your Stripe secret key to secrets.');
  }
  
  if (!publishableKey) {
    throw new Error('VITE_STRIPE_PUBLISHABLE_KEY not found. Please add your Stripe publishable key to secrets.');
  }
  
  console.log('Using manual Stripe keys from environment');
  console.log('Key type:', secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST');
  
  return {
    publishableKey: publishableKey,
    secretKey: secretKey,
  };
}

export async function getUncachableStripeClient() {
  const { secretKey } = await getCredentials();

  return new Stripe(secretKey);
}

export async function getStripePublishableKey() {
  const { publishableKey } = await getCredentials();
  return publishableKey;
}

export async function getStripeSecretKey() {
  const { secretKey } = await getCredentials();
  return secretKey;
}

let stripeSync: any = null;

export async function getStripeSync() {
  if (!stripeSync) {
    try {
      const { StripeSync } = await import('stripe-replit-sync');
      const secretKey = await getStripeSecretKey();
      stripeSync = new StripeSync({
        poolConfig: {
          connectionString: process.env.DATABASE_URL!,
          max: 2,
        },
        stripeSecretKey: secretKey,
      });
    } catch (e) {
      console.warn('[Stripe] stripe-replit-sync not available — Stripe sync disabled (non-Replit environment)');
      stripeSync = null;
    }
  }
  return stripeSync;
}
