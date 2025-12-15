import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  // PRIORITY 1: Always use STRIPE_SECRET_KEY if provided (most reliable)
  if (process.env.STRIPE_SECRET_KEY) {
    const key = process.env.STRIPE_SECRET_KEY.trim();
    console.log('Using STRIPE_SECRET_KEY environment variable');
    console.log('Key length:', key.length);
    console.log('Key starts with:', key.substring(0, 12));
    console.log('Key ends with:', key.substring(key.length - 4));
    return {
      publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
      secretKey: key,
    };
  }

  // PRIORITY 2: Try Replit connector as fallback
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  
  if (!hostname) {
    throw new Error('No Stripe configuration available. Please set STRIPE_SECRET_KEY.');
  }
  
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found. Please set STRIPE_SECRET_KEY.');
  }

  const connectorName = 'stripe';
  const isProduction = process.env.REPLIT_DEPLOYMENT === '1';
  const targetEnvironment = isProduction ? 'production' : 'development';

  try {
    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set('include_secrets', 'true');
    url.searchParams.set('connector_names', connectorName);
    url.searchParams.set('environment', targetEnvironment);

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    });

    const data = await response.json();
    
    connectionSettings = data.items?.[0];

    if (!connectionSettings || (!connectionSettings.settings?.publishable || !connectionSettings.settings?.secret)) {
      throw new Error(`Stripe ${targetEnvironment} connection not found`);
    }

    return {
      publishableKey: connectionSettings.settings.publishable,
      secretKey: connectionSettings.settings.secret,
    };
  } catch (error) {
    console.error('Stripe connector error:', error instanceof Error ? error.message : 'Unknown error');
    throw new Error('Stripe not configured. Please set STRIPE_SECRET_KEY.');
  }
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
    const { StripeSync } = await import('stripe-replit-sync');
    const secretKey = await getStripeSecretKey();

    stripeSync = new StripeSync({
      poolConfig: {
        connectionString: process.env.DATABASE_URL!,
        max: 2,
      },
      stripeSecretKey: secretKey,
    });
  }
  return stripeSync;
}
