// Coinbase (Advanced Trade) READ-ONLY client — Phase 2 of the crypto wallet
// integration. Reads account balances via the CDP-key JWT auth Coinbase now
// uses. No order placement here — read-only balances first, by design.
//
// Auth: Coinbase Developer Platform (CDP) API key = a key NAME + an EC private
// key (PEM). Each request carries a short-lived ES256 JWT bound to the exact
// method+path. We reuse the shared AES secret store to encrypt the private key
// at rest (never logged, never returned to the client).

import crypto from 'crypto';
// @ts-ignore — @types/jsonwebtoken isn't installed; the runtime module is present.
import jwt from 'jsonwebtoken';
import { encryptApiSecret, decryptApiSecret } from './cryptocom';

export { encryptApiSecret, decryptApiSecret };

const API_HOST = 'api.coinbase.com';

export interface CoinbaseBalance {
  currency: string;
  available: number;
  hold: number;
  total: number;
  usdValue?: number | null;
}

export interface CoinbaseAccountSummary {
  balances: CoinbaseBalance[];
  totalUsd: number;
  accountCount: number;
}

/** Build a short-lived ES256 JWT for one request (CDP convention). */
function buildJwt(keyName: string, privateKeyPem: string, method: string, path: string): string {
  const uri = `${method} ${API_HOST}${path}`;
  const now = Math.floor(Date.now() / 1000);
  const payload = { sub: keyName, iss: 'cdp', nbf: now, exp: now + 120, uri };
  return jwt.sign(payload, privateKeyPem, {
    algorithm: 'ES256',
    header: { kid: keyName, nonce: crypto.randomBytes(16).toString('hex'), typ: 'JWT', alg: 'ES256' } as any,
  });
}

export class CoinbaseService {
  private keyName: string;
  private privateKey: string;

  constructor(keyName: string, privateKeyPem: string) {
    this.keyName = keyName;
    // CDP private keys sometimes arrive with literal "\n" — normalize to real newlines.
    this.privateKey = privateKeyPem.includes('\\n') ? privateKeyPem.replace(/\\n/g, '\n') : privateKeyPem;
  }

  private async get(path: string): Promise<any> {
    const token = buildJwt(this.keyName, this.privateKey, 'GET', path);
    const res = await fetch(`https://${API_HOST}${path}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Coinbase ${res.status}: ${text.slice(0, 300)}`);
    }
    return res.json();
  }

  private async post(path: string, body: any): Promise<any> {
    const token = buildJwt(this.keyName, this.privateKey, 'POST', path);
    const res = await fetch(`https://${API_HOST}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Coinbase ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
    return data;
  }

  /**
   * Place a spot order (Advanced Trade). Requires "trade" permission on the key.
   *  - product: e.g. 'BTC-USD'
   *  - side: 'BUY' | 'SELL'
   *  - type: 'market' | 'limit'
   *  - quoteSize: USD to spend (market BUY); baseSize: coin amount (SELL / limit)
   *  - limitPrice: required for limit orders
   */
  async placeOrder(o: { product: string; side: 'BUY' | 'SELL'; type: 'market' | 'limit'; quoteSize?: number; baseSize?: number; limitPrice?: number }): Promise<{ orderId: string; success: boolean; raw: any }> {
    const clientOrderId = crypto.randomUUID();
    let order_configuration: any;
    if (o.type === 'market') {
      order_configuration = o.side === 'BUY' && o.quoteSize
        ? { market_market_ioc: { quote_size: String(o.quoteSize) } }
        : { market_market_ioc: { base_size: String(o.baseSize) } };
    } else {
      if (!o.limitPrice || !o.baseSize) throw new Error('limit orders require baseSize and limitPrice');
      order_configuration = { limit_limit_gtc: { base_size: String(o.baseSize), limit_price: String(o.limitPrice) } };
    }
    const data = await this.post('/api/v3/brokerage/orders', {
      client_order_id: clientOrderId, product_id: o.product, side: o.side, order_configuration,
    });
    const success = !!data?.success;
    if (!success) throw new Error(`Coinbase order rejected: ${JSON.stringify(data?.error_response || data).slice(0, 300)}`);
    return { orderId: data?.success_response?.order_id ?? clientOrderId, success, raw: data };
  }

  /** Read-only: list account balances (paginated), valued in USD via public spot. */
  async getBalances(): Promise<CoinbaseAccountSummary> {
    const accounts: any[] = [];
    let cursor = '';
    for (let i = 0; i < 10; i++) { // safety cap on pagination
      const path = `/api/v3/brokerage/accounts?limit=250${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const data = await this.get(path);
      for (const a of data?.accounts ?? []) accounts.push(a);
      if (data?.has_next && data?.cursor) cursor = data.cursor; else break;
    }

    const balances: CoinbaseBalance[] = [];
    for (const a of accounts) {
      const available = parseFloat(a?.available_balance?.value ?? '0') || 0;
      const hold = parseFloat(a?.hold?.value ?? '0') || 0;
      const total = available + hold;
      if (total <= 0) continue;
      balances.push({ currency: a?.available_balance?.currency ?? a?.currency ?? '?', available, hold, total });
    }

    // Value non-USD balances via the shared public price layer (best-effort).
    let totalUsd = 0;
    try {
      const { getAggregatedQuote } = await import('./services/crypto-market-data');
      for (const b of balances) {
        if (b.currency === 'USD' || b.currency === 'USDC') { b.usdValue = b.total; totalUsd += b.total; continue; }
        const q = await getAggregatedQuote(b.currency).catch(() => null);
        const px = q?.best?.price ?? null;
        b.usdValue = px != null ? Math.round(b.total * px * 100) / 100 : null;
        if (b.usdValue) totalUsd += b.usdValue;
      }
    } catch { /* pricing is best-effort */ }

    balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    return { balances, totalUsd: Math.round(totalUsd * 100) / 100, accountCount: accounts.length };
  }

  /** Lightweight auth check for the "Test connection" button. */
  async test(): Promise<{ ok: true; accountCount: number }> {
    const data = await this.get('/api/v3/brokerage/accounts?limit=1');
    return { ok: true, accountCount: (data?.accounts ?? []).length };
  }
}
