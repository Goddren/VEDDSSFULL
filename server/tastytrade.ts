import crypto from 'crypto';

const IV_LENGTH = 16;
const SALT_LENGTH = 16;

// Default key used when TASTYTRADE_ENCRYPTION_KEY env var is not set.
// Override this in Render → Environment → TASTYTRADE_ENCRYPTION_KEY for production.
const DEFAULT_ENCRYPTION_KEY = 'vedd-tasty-default-key-change-me-32ch!!';

function getEncryptionKey(): string {
  const key = process.env.TASTYTRADE_ENCRYPTION_KEY;
  if (!key) {
    console.warn('[TastyTrade] TASTYTRADE_ENCRYPTION_KEY not set — using default key. Set it in your Render environment variables.');
    return DEFAULT_ENCRYPTION_KEY;
  }
  if (key.length < 32) {
    console.warn('[TastyTrade] TASTYTRADE_ENCRYPTION_KEY is too short, padding to 32 chars.');
    return key.padEnd(32, '0');
  }
  return key;
}

export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const key = crypto.scryptSync(getEncryptionKey(), salt, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

export function decryptPassword(encryptedPassword: string): string {
  const parts = encryptedPassword.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted password format');
  const [saltHex, ivHex, data] = parts;
  const key = crypto.scryptSync(getEncryptionKey(), Buffer.from(saltHex, 'hex'), 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(ivHex, 'hex'));
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface TastyTradeSessionResponse {
  sessionToken: string;
  rememberToken?: string;
  expiresIn: number; // seconds — TastyTrade sessions last 24h
}

export interface TastyTradeAccountInfo {
  accountNumber: string;
  balance: number;       // cash balance
  equity: number;         // net liquidating value
  buyingPower: number;
  optionBuyingPower: number;
  currency: string;
}

export interface TastyTradeOptionContract {
  symbol: string;           // OCC-style symbol
  underlyingSymbol: string;
  expirationDate: string;
  strikePrice: number;
  type: 'call' | 'put';
  bid?: number;
  ask?: number;
  lastPrice?: number;
  impliedVolatility?: number;
  openInterest?: number;
}

export interface TastyTradeOrderRequest {
  optionSymbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  type: 'market' | 'limit';
  limitPrice?: number;
  timeInForce?: 'day' | 'gtc';
}

export interface TastyTradeOrderResponse {
  orderId: string;
  status: string;
}

const RETRY_DELAYS = [1000, 2000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class TastyTradeService {
  private baseUrl: string;
  private username: string;
  private password: string;
  private sessionToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private accountNumber: string | null = null;

  constructor(accountType: 'sandbox' | 'live', username: string, password: string) {
    // 'cert' is TastyTrade's sandbox/certification environment
    this.baseUrl = accountType === 'sandbox'
      ? 'https://api.cert.tastyworks.com'
      : 'https://api.tastyworks.com';
    this.username = username;
    this.password = password;
  }

  getResolvedAccountNumber(): string | null {
    return this.accountNumber;
  }

  setSession(sessionToken: string, expiresAt?: Date) {
    this.sessionToken = sessionToken;
    this.tokenExpiresAt = expiresAt || null;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.sessionToken && this.tokenExpiresAt && this.tokenExpiresAt.getTime() - Date.now() > 60000) {
      return;
    }
    await this.login();
  }

  private async request(path: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    await this.ensureAuthenticated();
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        'Authorization': this.sessionToken || '',
        'Content-Type': 'application/json',
        ...(init.headers || {}),
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok && RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_DELAYS.length) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      return this.request(path, init, attempt + 1);
    }
    return response;
  }

  async login(): Promise<TastyTradeSessionResponse> {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: this.username, password: this.password, 'remember-me': true }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TastyTrade login failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    const token = data.data?.['session-token'];
    if (!token) throw new Error('TastyTrade login response missing session-token');
    this.sessionToken = token;
    // TastyTrade sessions are valid for 24h
    this.tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return {
      sessionToken: token,
      rememberToken: data.data?.['remember-token'],
      expiresIn: 24 * 60 * 60,
    };
  }

  // "Authenticate" = log in, then resolve + verify the first account works.
  async authenticate(): Promise<TastyTradeAccountInfo> {
    await this.login();
    const info = await this.getAccountInfo();
    this.accountNumber = info.accountNumber;
    return info;
  }

  async getAccountInfo(): Promise<TastyTradeAccountInfo> {
    const accountsRes = await this.request('/customers/me/accounts');
    if (!accountsRes.ok) {
      const text = await accountsRes.text();
      throw new Error(`TastyTrade accounts fetch failed: ${accountsRes.status} - ${text}`);
    }
    const accountsData = await accountsRes.json();
    const items = accountsData.data?.items || [];
    if (items.length === 0) throw new Error('TastyTrade account has no linked brokerage accounts');
    const accountNumber = items[0].account['account-number'];

    const balancesRes = await this.request(`/accounts/${accountNumber}/balances`);
    if (!balancesRes.ok) {
      const text = await balancesRes.text();
      throw new Error(`TastyTrade balances fetch failed: ${balancesRes.status} - ${text}`);
    }
    const balances = (await balancesRes.json()).data;
    return {
      accountNumber,
      balance: parseFloat(balances['cash-balance'] ?? '0'),
      equity: parseFloat(balances['net-liquidating-value'] ?? '0'),
      buyingPower: parseFloat(balances['derivative-buying-power'] ?? balances['equity-buying-power'] ?? '0'),
      optionBuyingPower: parseFloat(balances['derivative-buying-power'] ?? '0'),
      currency: 'USD',
    };
  }

  async getOptionsChain(underlyingSymbol: string): Promise<TastyTradeOptionContract[]> {
    const response = await this.request(`/option-chains/${encodeURIComponent(underlyingSymbol)}/nested`);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TastyTrade options chain fetch failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    const expirations = data.data?.items?.[0]?.expirations || [];
    const contracts: TastyTradeOptionContract[] = [];
    for (const exp of expirations) {
      for (const strike of exp.strikes || []) {
        if (strike.call) {
          contracts.push({
            symbol: strike.call,
            underlyingSymbol,
            expirationDate: exp['expiration-date'],
            strikePrice: parseFloat(strike['strike-price']),
            type: 'call',
          });
        }
        if (strike.put) {
          contracts.push({
            symbol: strike.put,
            underlyingSymbol,
            expirationDate: exp['expiration-date'],
            strikePrice: parseFloat(strike['strike-price']),
            type: 'put',
          });
        }
      }
    }
    return contracts;
  }

  async placeOrder(order: TastyTradeOrderRequest): Promise<TastyTradeOrderResponse> {
    if (!this.accountNumber) throw new Error('TastyTrade account not resolved — call authenticate() first');
    const response = await this.request(`/accounts/${this.accountNumber}/orders`, {
      method: 'POST',
      body: JSON.stringify({
        'order-type': order.type === 'market' ? 'Market' : 'Limit',
        'time-in-force': order.timeInForce === 'gtc' ? 'GTC' : 'Day',
        ...(order.type === 'limit' && order.limitPrice ? { price: order.limitPrice, 'price-effect': order.side === 'buy' ? 'Debit' : 'Credit' } : {}),
        legs: [{
          'instrument-type': 'Equity Option',
          symbol: order.optionSymbol,
          quantity: order.quantity,
          action: order.side === 'buy' ? 'Buy to Open' : 'Sell to Close',
        }],
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`TastyTrade order placement failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    return {
      orderId: String(data.data?.order?.id ?? ''),
      status: data.data?.order?.status ?? 'unknown',
    };
  }
}
