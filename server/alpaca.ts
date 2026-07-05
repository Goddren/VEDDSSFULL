import crypto from 'crypto';

const IV_LENGTH = 16;
const SALT_LENGTH = 16;

// Default key used when ALPACA_ENCRYPTION_KEY env var is not set.
// Override this in Render → Environment → ALPACA_ENCRYPTION_KEY for production.
const DEFAULT_ENCRYPTION_KEY = 'vedd-alpaca-default-key-change-me-32ch!!';

function getEncryptionKey(): string {
  const key = process.env.ALPACA_ENCRYPTION_KEY;
  if (!key) {
    console.warn('[Alpaca] ALPACA_ENCRYPTION_KEY not set — using default key. Set it in your Render environment variables.');
    return DEFAULT_ENCRYPTION_KEY;
  }
  if (key.length < 32) {
    console.warn('[Alpaca] ALPACA_ENCRYPTION_KEY is too short, padding to 32 chars.');
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

export interface AlpacaAccountInfo {
  accountId: string;
  balance: number;      // cash
  equity: number;
  buyingPower: number;
  optionsBuyingPower: number;
  currency: string;
  status: string;
  optionsTradingLevel: number;
}

export interface AlpacaOptionContract {
  symbol: string;          // OCC symbol, e.g. AAPL240621C00195000
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

export interface AlpacaOrderRequest {
  optionSymbol: string;    // OCC symbol
  side: 'buy' | 'sell';
  quantity: number;        // number of contracts
  type: 'market' | 'limit';
  limitPrice?: number;
  timeInForce?: 'day' | 'gtc';
}

export interface AlpacaOrderResponse {
  orderId: string;
  status: string;
  filledQty?: number;
  filledAvgPrice?: number;
}

const RETRY_DELAYS = [1000, 2000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export class AlpacaService {
  private baseUrl: string;
  private dataUrl = 'https://data.alpaca.markets';
  private apiKeyId: string;
  private apiSecret: string;
  private accountId: string | null = null;

  constructor(accountType: 'paper' | 'live', apiKeyId: string, apiSecret: string) {
    this.baseUrl = accountType === 'paper'
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';
    this.apiKeyId = apiKeyId;
    this.apiSecret = apiSecret;
  }

  getResolvedAccountId(): string | null {
    return this.accountId;
  }

  private headers(): Record<string, string> {
    return {
      'APCA-API-KEY-ID': this.apiKeyId,
      'APCA-API-SECRET-KEY': this.apiSecret,
      'Content-Type': 'application/json',
    };
  }

  private async request(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
    const response = await fetch(url, {
      ...init,
      headers: { ...this.headers(), ...(init.headers || {}) },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok && RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_DELAYS.length) {
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
      return this.request(url, init, attempt + 1);
    }
    return response;
  }

  // Alpaca has no login step — keys are sent on every request. "Authenticate"
  // here means: verify the key/secret pair actually works before we store it.
  async authenticate(): Promise<AlpacaAccountInfo> {
    const info = await this.getAccountInfo();
    this.accountId = info.accountId;
    return info;
  }

  async getAccountInfo(): Promise<AlpacaAccountInfo> {
    const response = await this.request(`${this.baseUrl}/v2/account`, { method: 'GET' });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Alpaca account fetch failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    return {
      accountId: data.account_number || data.id,
      balance: parseFloat(data.cash ?? '0'),
      equity: parseFloat(data.equity ?? '0'),
      buyingPower: parseFloat(data.buying_power ?? '0'),
      optionsBuyingPower: parseFloat(data.options_buying_power ?? data.buying_power ?? '0'),
      currency: data.currency || 'USD',
      status: data.status || 'UNKNOWN',
      optionsTradingLevel: data.options_trading_level ?? 0,
    };
  }

  async getOptionsChain(underlyingSymbol: string): Promise<AlpacaOptionContract[]> {
    const response = await this.request(
      `${this.dataUrl}/v1beta1/options/snapshots/${encodeURIComponent(underlyingSymbol)}?limit=200`,
      { method: 'GET' },
    );
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Alpaca options chain fetch failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    const snapshots = data.snapshots || {};
    return Object.entries(snapshots).map(([symbol, snap]: [string, any]) => {
      const parsed = parseOccSymbol(symbol, underlyingSymbol);
      return {
        symbol,
        underlyingSymbol,
        expirationDate: parsed.expirationDate,
        strikePrice: parsed.strikePrice,
        type: parsed.type,
        bid: snap.latestQuote?.bp,
        ask: snap.latestQuote?.ap,
        lastPrice: snap.latestTrade?.p,
        impliedVolatility: snap.impliedVolatility,
        openInterest: snap.openInterest,
      } as AlpacaOptionContract;
    });
  }

  async placeOrder(order: AlpacaOrderRequest): Promise<AlpacaOrderResponse> {
    const response = await this.request(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      body: JSON.stringify({
        symbol: order.optionSymbol,
        qty: order.quantity,
        side: order.side,
        type: order.type,
        time_in_force: order.timeInForce || 'day',
        ...(order.type === 'limit' && order.limitPrice ? { limit_price: order.limitPrice } : {}),
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Alpaca order placement failed: ${response.status} - ${text}`);
    }
    const data = await response.json();
    return {
      orderId: data.id,
      status: data.status,
      filledQty: data.filled_qty ? parseFloat(data.filled_qty) : undefined,
      filledAvgPrice: data.filled_avg_price ? parseFloat(data.filled_avg_price) : undefined,
    };
  }
}

// OCC option symbol format: {root}{YYMMDD}{C|P}{strike*1000, 8 digits}
function parseOccSymbol(occSymbol: string, underlyingSymbol: string): { expirationDate: string; strikePrice: number; type: 'call' | 'put' } {
  const rest = occSymbol.slice(underlyingSymbol.length);
  const dateStr = rest.slice(0, 6);
  const typeChar = rest.charAt(6);
  const strikeStr = rest.slice(7);
  const yy = dateStr.slice(0, 2), mm = dateStr.slice(2, 4), dd = dateStr.slice(4, 6);
  return {
    expirationDate: `20${yy}-${mm}-${dd}`,
    strikePrice: parseInt(strikeStr || '0', 10) / 1000,
    type: typeChar === 'P' ? 'put' : 'call',
  };
}
