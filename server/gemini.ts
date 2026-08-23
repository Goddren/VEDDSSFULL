// Gemini READ-ONLY client — Phase 2 (Gemini). Reads account balances via
// Gemini's private REST API (API key + HMAC-SHA384 payload signing). No order
// placement — read-only balances only. Secret AES-encrypted at rest.

import crypto from 'crypto';
import { encryptApiSecret, decryptApiSecret } from './cryptocom';

export { encryptApiSecret, decryptApiSecret };

const API_HOST = 'https://api.gemini.com';

export interface GeminiBalance { currency: string; total: number; usdValue?: number | null; }
export interface GeminiAccountSummary { balances: GeminiBalance[]; totalUsd: number; }

export class GeminiService {
  private apiKey: string;
  private secret: string;

  constructor(apiKey: string, secret: string) {
    this.apiKey = apiKey;
    this.secret = secret;
  }

  private async privatePost(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const nonce = Date.now();
    const payload = { request: endpoint, nonce, ...params };
    const b64 = Buffer.from(JSON.stringify(payload)).toString('base64');
    const signature = crypto.createHmac('sha384', this.secret).update(b64).digest('hex');
    const res = await fetch(`${API_HOST}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        'Content-Length': '0',
        'X-GEMINI-APIKEY': this.apiKey,
        'X-GEMINI-PAYLOAD': b64,
        'X-GEMINI-SIGNATURE': signature,
        'Cache-Control': 'no-cache',
        'User-Agent': 'VEDD/1.0',
      },
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    if (!res.ok || data?.result === 'error') {
      throw new Error(`Gemini: ${data?.reason || data?.message || res.status}`);
    }
    return data;
  }

  /** Read-only: account balances, valued in USD via the public price layer. */
  async getBalances(): Promise<GeminiAccountSummary> {
    const raw = await this.privatePost('/v1/balances'); // [{ currency, amount, available }]
    const balances: GeminiBalance[] = [];
    for (const b of Array.isArray(raw) ? raw : []) {
      const amt = parseFloat(b?.amount ?? '0');
      if (!isFinite(amt) || amt <= 0) continue;
      balances.push({ currency: String(b?.currency ?? '?').toUpperCase(), total: amt });
    }

    let totalUsd = 0;
    try {
      const { getAggregatedQuote } = await import('./services/crypto-market-data');
      for (const b of balances) {
        if (b.currency === 'USD' || b.currency === 'USDC' || b.currency === 'GUSD' || b.currency === 'USDT') { b.usdValue = b.total; totalUsd += b.total; continue; }
        const q = await getAggregatedQuote(b.currency).catch(() => null);
        const px = q?.best?.price ?? null;
        b.usdValue = px != null ? Math.round(b.total * px * 100) / 100 : null;
        if (b.usdValue) totalUsd += b.usdValue;
      }
    } catch { /* pricing best-effort */ }

    balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    return { balances, totalUsd: Math.round(totalUsd * 100) / 100 };
  }

  /**
   * Place an order. Requires "Trading" scope on the key. Gemini's API is
   * limit-only ("exchange limit"); a market-style fill is an immediate-or-cancel
   * limit at an aggressive price. Caller supplies the limit price either way.
   *  - symbol: e.g. 'btcusd'
   *  - side: 'buy' | 'sell'
   *  - amount: base amount (coin)
   *  - price: limit price (required by Gemini)
   *  - immediateOrCancel: true = market-like (fills now or cancels the rest)
   */
  async placeOrder(o: { symbol: string; side: 'buy' | 'sell'; amount: number; price: number; immediateOrCancel?: boolean }): Promise<{ orderId: string; executedAmount: number; isLive: boolean; raw: any }> {
    if (!o.price) throw new Error('Gemini requires a limit price (its API is limit-only)');
    const params: Record<string, any> = {
      symbol: o.symbol.toLowerCase(), amount: String(o.amount), price: String(o.price), side: o.side, type: 'exchange limit',
    };
    if (o.immediateOrCancel) params.options = ['immediate-or-cancel'];
    const data = await this.privatePost('/v1/order/new', params);
    return { orderId: String(data?.order_id ?? ''), executedAmount: parseFloat(data?.executed_amount ?? '0') || 0, isLive: !!data?.is_live, raw: data };
  }

  async test(): Promise<{ ok: true; assetCount: number }> {
    const raw = await this.privatePost('/v1/balances');
    return { ok: true, assetCount: Array.isArray(raw) ? raw.length : 0 };
  }
}
