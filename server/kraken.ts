// Kraken READ-ONLY client — Phase 2 (Kraken). Reads account balances via
// Kraken's private REST API (API key + HMAC-SHA512 request signing). No order
// placement — read-only balances only. The API secret is AES-encrypted at rest
// via the shared secret store.

import crypto from 'crypto';
import { encryptApiSecret, decryptApiSecret } from './cryptocom';

export { encryptApiSecret, decryptApiSecret };

const API_HOST = 'https://api.kraken.com';

export interface KrakenBalance { currency: string; total: number; usdValue?: number | null; }
export interface KrakenAccountSummary { balances: KrakenBalance[]; totalUsd: number; }

// Kraken uses legacy asset codes (XXBT, XETH, ZUSD, …). Normalize the common
// ones to plain tickers for display + USD valuation.
function normalizeAsset(code: string): string {
  const c = code.toUpperCase().replace(/\.(S|F|M)$/, ''); // strip staking/earn suffixes (.S/.F/.M)
  const map: Record<string, string> = { XXBT: 'BTC', XBT: 'BTC', XETH: 'ETH', XXRP: 'XRP', XLTC: 'LTC', XXDG: 'DOGE', XDG: 'DOGE', ZUSD: 'USD', ZEUR: 'EUR', ZGBP: 'GBP', XXLM: 'XLM', XETC: 'ETC', XZEC: 'ZEC' };
  if (map[c]) return map[c];
  // Generic: strip a single leading X/Z on 4-letter codes (XSOL→SOL etc.)
  if (c.length === 4 && (c[0] === 'X' || c[0] === 'Z')) return c.slice(1);
  return c;
}

export class KrakenService {
  private apiKey: string;
  private secret: string;

  constructor(apiKey: string, secret: string) {
    this.apiKey = apiKey;
    this.secret = secret;
  }

  private sign(path: string, nonce: string, postData: string): string {
    // API-Sign = HMAC-SHA512(path + SHA256(nonce + postData), base64(secret))
    const sha256 = crypto.createHash('sha256').update(nonce + postData).digest();
    const message = Buffer.concat([Buffer.from(path, 'utf8'), sha256]);
    const key = Buffer.from(this.secret, 'base64');
    return crypto.createHmac('sha512', key).update(message).digest('base64');
  }

  private async privatePost(endpoint: string): Promise<any> {
    const path = `/0/private/${endpoint}`;
    const nonce = String(Date.now() * 1000);
    const body = new URLSearchParams({ nonce });
    const postData = body.toString();
    const res = await fetch(`${API_HOST}${path}`, {
      method: 'POST',
      headers: {
        'API-Key': this.apiKey,
        'API-Sign': this.sign(path, nonce, postData),
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'VEDD/1.0',
      },
      body: postData,
      signal: AbortSignal.timeout(12000),
    });
    const data = await res.json();
    if (data?.error?.length) throw new Error(`Kraken: ${data.error.join(', ')}`);
    return data?.result ?? {};
  }

  /** Read-only: account balances, valued in USD via the public price layer. */
  async getBalances(): Promise<KrakenAccountSummary> {
    const raw = await this.privatePost('Balance'); // { XXBT: "0.5", ZUSD: "100.0", ... }
    const merged = new Map<string, number>();
    for (const [code, valStr] of Object.entries(raw)) {
      const amt = parseFloat(String(valStr));
      if (!isFinite(amt) || amt <= 0) continue;
      const cur = normalizeAsset(code);
      merged.set(cur, (merged.get(cur) ?? 0) + amt);
    }
    const balances: KrakenBalance[] = Array.from(merged, ([currency, total]) => ({ currency, total }));

    let totalUsd = 0;
    try {
      const { getAggregatedQuote } = await import('./services/crypto-market-data');
      for (const b of balances) {
        if (b.currency === 'USD' || b.currency === 'USDC' || b.currency === 'USDT') { b.usdValue = b.total; totalUsd += b.total; continue; }
        const q = await getAggregatedQuote(b.currency).catch(() => null);
        const px = q?.best?.price ?? null;
        b.usdValue = px != null ? Math.round(b.total * px * 100) / 100 : null;
        if (b.usdValue) totalUsd += b.usdValue;
      }
    } catch { /* pricing best-effort */ }

    balances.sort((a, b) => (b.usdValue ?? 0) - (a.usdValue ?? 0));
    return { balances, totalUsd: Math.round(totalUsd * 100) / 100 };
  }

  async test(): Promise<{ ok: true; assetCount: number }> {
    const raw = await this.privatePost('Balance');
    return { ok: true, assetCount: Object.keys(raw).length };
  }
}
