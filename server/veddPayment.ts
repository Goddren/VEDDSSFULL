import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const VEDD_TOKEN_MINT = process.env.VEDD_TOKEN_MINT || 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
const RECEIVER_WALLET = process.env.VEDD_RECEIVER_WALLET || 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

// VEDD Token Pricing (as of Dec 2024)
// Rate: 1000 VEDD = $0.0036 USD (0.000027664 SOL)
// 1 USD = ~277,778 VEDD
const VEDD_PER_USD = 277778;

// Plan prices in USD - All monthly plans $149.99, Lifetime $999
// VEDD amounts calculated to match exact USD equivalent
// Rounded to nearest 100 VEDD for cleaner amounts
const PLAN_PRICES_VEDD: Record<string, number> = {
  'starter': Math.round((149.99 * VEDD_PER_USD) / 100) * 100,   // ~41,663,700 VEDD ($149.99)
  'standard': Math.round((149.99 * VEDD_PER_USD) / 100) * 100,  // ~41,663,700 VEDD ($149.99)
  'premium': Math.round((149.99 * VEDD_PER_USD) / 100) * 100,   // ~41,663,700 VEDD ($149.99)
  'lifetime': Math.round((999 * VEDD_PER_USD) / 100) * 100,     // ~277,500,200 VEDD ($999)
};

interface PaymentSession {
  id: string;
  planName: string;
  userId: number;
  veddAmount: number;
  receiverWallet: string;
  status: 'pending' | 'completed' | 'failed' | 'expired';
  createdAt: Date;
  expiresAt: Date;
  transactionSignature?: string;
}

const paymentSessions: Map<string, PaymentSession> = new Map();

export function generatePaymentId(): string {
  return `vedd_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export function createPaymentSession(
  planName: string,
  userId: number
): PaymentSession {
  const normalizedPlan = planName.toLowerCase();
  const veddAmount = PLAN_PRICES_VEDD[normalizedPlan];
  
  if (!veddAmount) {
    throw new Error(`Invalid plan: ${planName}. Valid plans: starter, premium, lifetime`);
  }

  const session: PaymentSession = {
    id: generatePaymentId(),
    planName: normalizedPlan,
    userId,
    veddAmount,
    receiverWallet: RECEIVER_WALLET,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };

  paymentSessions.set(session.id, session);
  return session;
}

export function getPaymentSession(sessionId: string): PaymentSession | undefined {
  return paymentSessions.get(sessionId);
}

export async function verifyVeddPayment(
  sessionId: string,
  transactionSignature: string
): Promise<{ verified: boolean; error?: string }> {
  const session = paymentSessions.get(sessionId);
  
  if (!session) {
    return { verified: false, error: 'Payment session not found' };
  }

  if (session.status === 'completed') {
    return { verified: true };
  }

  if (session.status === 'expired' || new Date() > session.expiresAt) {
    session.status = 'expired';
    return { verified: false, error: 'Payment session expired' };
  }

  try {
    const connection = new Connection(SOLANA_RPC, 'confirmed');
    
    const tx = await connection.getTransaction(transactionSignature, {
      maxSupportedTransactionVersion: 0,
    });

    if (!tx) {
      return { verified: false, error: 'Transaction not found on Solana network' };
    }

    if (tx.meta?.err) {
      return { verified: false, error: 'Transaction failed on Solana network' };
    }

    session.status = 'completed';
    session.transactionSignature = transactionSignature;
    
    return { verified: true };
  } catch (error) {
    console.error('Error verifying VEDD payment:', error);
    return { verified: false, error: 'Failed to verify transaction' };
  }
}

export function getVeddPrices(): Record<string, number> {
  return { ...PLAN_PRICES_VEDD };
}

export function getReceiverWallet(): string {
  return RECEIVER_WALLET;
}

export function getTokenMint(): string {
  return VEDD_TOKEN_MINT;
}
