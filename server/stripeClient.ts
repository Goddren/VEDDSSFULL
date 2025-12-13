import Stripe from 'stripe';

let connectionSettings: any;

async function getCredentials() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  
  // Try environment variable first as fallback
  if (!hostname) {
    if (process.env.STRIPE_SECRET_KEY) {
      console.log('Using STRIPE_SECRET_KEY environment variable (no connector hostname)');
      return {
        publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
        secretKey: process.env.STRIPE_SECRET_KEY,
      };
    }
    throw new Error('No Stripe configuration available');
  }
  
  const xReplitToken = process.env.REPL_IDENTITY
    ? 'repl ' + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? 'depl ' + process.env.WEB_REPL_RENEWAL
      : null;

  if (!xReplitToken) {
    if (process.env.STRIPE_SECRET_KEY) {
      console.log('Using STRIPE_SECRET_KEY environment variable (no replit token)');
      return {
        publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
        secretKey: process.env.STRIPE_SECRET_KEY,
      };
    }
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
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

    if (!connectionSettings || (!connectionSettings.settings.publishable || !connectionSettings.settings.secret)) {
      // Fall back to environment variable
      if (process.env.STRIPE_SECRET_KEY) {
        console.log(`Stripe ${targetEnvironment} connector not found, falling back to STRIPE_SECRET_KEY`);
        return {
          publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
          secretKey: process.env.STRIPE_SECRET_KEY,
        };
      }
      throw new Error(`Stripe ${targetEnvironment} connection not found`);
    }

    return {
      publishableKey: connectionSettings.settings.publishable,
      secretKey: connectionSettings.settings.secret,
    };
  } catch (error) {
    // Fall back to environment variable on any error
    if (process.env.STRIPE_SECRET_KEY) {
      console.log('Stripe connector error, falling back to STRIPE_SECRET_KEY:', error instanceof Error ? error.message : 'Unknown error');
      return {
        publishableKey: process.env.VITE_STRIPE_PUBLISHABLE_KEY || '',
        secretKey: process.env.STRIPE_SECRET_KEY,
      };
    }
    throw error;
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
