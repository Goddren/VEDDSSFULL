import crypto from 'crypto';

const IV_LENGTH = 16;
const SALT_LENGTH = 16;

// Default key used when CRYPTOCOM_ENCRYPTION_KEY env var is not set.
// Override this in Render → Environment → CRYPTOCOM_ENCRYPTION_KEY for production.
const DEFAULT_ENCRYPTION_KEY = 'vedd-cryptocom-default-key-change-32ch';

function getEncryptionKey(): string {
  const key = process.env.CRYPTOCOM_ENCRYPTION_KEY;
  if (!key) {
    console.warn('[Crypto.com] CRYPTOCOM_ENCRYPTION_KEY not set — using default key. Set it in your Render environment variables.');
    return DEFAULT_ENCRYPTION_KEY;
  }
  if (key.length < 32) {
    console.warn('[Crypto.com] CRYPTOCOM_ENCRYPTION_KEY is too short, padding to 32 chars.');
    return key.padEnd(32, '0');
  }
  return key;
}

export function encryptApiSecret(secret: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(getEncryptionKey(), salt, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

export function decryptApiSecret(encrypted: string): string {
  const parts = encrypted.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted secret format');
  const [saltHex, ivHex, data] = parts;
  const key = crypto.scryptSync(getEncryptionKey(), Buffer.from(saltHex, 'hex'), 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface CryptocomAccountInfo {
  balance: number;
  equity: number;
  availableBalance: number;
  currency: string;
}

export interface CryptocomOrderRequest {
  instrumentName: string;   // e.g. 'BTCUSD-PERP', or an options instrument name where regionally available
  side: 'BUY' | 'SELL';
  quantity: number;
  type: 'MARKET' | 'LIMIT';
  price?: number;
}

export interface CryptocomOrderResponse {
  orderId: string;
  status: string;
}

// Crypto.com Exchange API v1 — HMAC-SHA256 signed requests, no OAuth/login page.
// Docs: https://exchange-docs.crypto.com/exchange/v1/rest-ws/index.html
export class CryptoComService {
  private baseUrl = 'https://api.crypto.com/exchange/v1';
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private sign(method: string, id: number, params: Record<string, any>, nonce: number): string {
    const paramString = Object.keys(params).sort().map(k => `${k}${typeof params[k] === 'object' ? JSON.stringify(params[k]) : params[k]}`).join('');
    const sigPayload = `${method}${id}${this.apiKey}${paramString}${nonce}`;
    return crypto.createHmac('sha256', this.apiSecret).update(sigPayload).digest('hex');
  }

  private async call(method: string, params: Record<string, any> = {}): Promise<any> {
    const id = Date.now();
    const nonce = Date.now();
    const sig = this.sign(method, id, params, nonce);
    const body = { id, method, api_key: this.apiKey, params, nonce, sig };

    const response = await fetch(`${this.baseUrl}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Crypto.com API failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    if (data.code !== undefined && data.code !== 0) {
      throw new Error(`Crypto.com error ${data.code}: ${data.message || 'Unknown error'}`);
    }
    return data.result;
  }

  // "Authenticate" = verify the key/secret pair works before storing it.
  async authenticate(): Promise<CryptocomAccountInfo> {
    return this.getAccountInfo();
  }

  async getAccountInfo(): Promise<CryptocomAccountInfo> {
    const result = await this.call('private/user-balance');
    const account = result?.data?.[0];
    if (!account) throw new Error('Crypto.com returned no account balance data');
    return {
      balance: parseFloat(account.total_cash_balance ?? '0'),
      equity: parseFloat(account.total_balance ?? '0'),
      availableBalance: parseFloat(account.total_available_balance ?? '0'),
      currency: 'USD',
    };
  }

  async placeOrder(order: CryptocomOrderRequest): Promise<CryptocomOrderResponse> {
    const result = await this.call('private/create-order', {
      instrument_name: order.instrumentName,
      side: order.side,
      type: order.type,
      quantity: String(order.quantity),
      ...(order.type === 'LIMIT' && order.price ? { price: String(order.price) } : {}),
    });
    return {
      orderId: String(result?.order_id ?? ''),
      status: result?.status ?? 'unknown',
    };
  }
}
