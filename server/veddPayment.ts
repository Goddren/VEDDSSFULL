import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const VEDD_TOKEN_MINT = process.env.VEDD_TOKEN_MINT || 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
const RECEIVER_WALLET = process.env.VEDD_RECEIVER_WALLET || 'Ch7WbPBy5XjL1UULwWYwh75DsVdXhFUVXtiNvNGopump';
const SOLANA_RPC = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

const DEXSCREENER_URL = `https://api.dexscreener.com/latest/dex/tokens/${VEDD_TOKEN_MINT}`;

// Cache price for 60 seconds
let priceCache: { veddPerUsd: number; fetchedAt: number } | null = null;

async function getLiveVeddPerUsd(): Promise<number> {
  // Use cache if fresh
  if (priceCache && Date.now() - priceCache.fetchedAt < 60_000) {
    return priceCache.veddPerUsd;
  }
  try {
    const res = await fetch(DEXSCREENER_URL);
    if (!res.ok) throw new Error('DexScreener unavailable');
    const data = await res.json();
    const pair = data?.pairs?.[0];
    if (pair?.priceUsd && parseFloat(pair.priceUsd) > 0) {
      const veddPerUsd = 1 / parseFloat(pair.priceUsd);
      priceCache = { veddPerUsd, fetchedAt: Date.now() };
      console.log(`[VEDD Payment] Live price fetched: $${pair.priceUsd}/VEDD → ${Math.round(veddPerUsd).toLocaleString()} VEDD/$1`);
      return veddPerUsd;
    }
    throw new Error('Invalid price data');
  } catch (err) {
    console.warn('[VEDD Payment] Price fetch failed, using fallback:', err);
    // Fallback: use last cache or hardcoded fallback
    if (priceCache) return priceCache.veddPerUsd;
    return 1 / 0.00000244; // ~409,836 VEDD per $1 at $0.00000244
  }
}

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

export async function createPaymentSession(
  planName: string,
  userId: number,
  priceUsd: number
): Promise<PaymentSession> {
  const veddPerUsd = await getLiveVeddPerUsd();
  // Round to nearest 1000 VEDD for cleaner amounts
  const veddAmount = Math.round((priceUsd * veddPerUsd) / 1000) * 1000;

  const session: PaymentSession = {
    id: generatePaymentId(),
    planName: planName.toLowerCase(),
    userId,
    veddAmount,
    receiverWallet: RECEIVER_WALLET,
    status: 'pending',
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  };

  paymentSessions.set(session.id, session);
  console.log(`[VEDD Payment] Session created: ${planName} = ${veddAmount.toLocaleString()} VEDD ($${priceUsd})`);
  return session;
}

export async function getPriceInfo(): Promise<{ veddPerUsd: number; priceUsd: number; source: string }> {
  const veddPerUsd = await getLiveVeddPerUsd();
  return {
    veddPerUsd: Math.round(veddPerUsd),
    priceUsd: 1 / veddPerUsd,
    source: priceCache ? 'live' : 'fallback',
  };
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

export function getReceiverWallet(): string {
  return RECEIVER_WALLET;
}

export function getTokenMint(): string {
  return VEDD_TOKEN_MINT;
}
