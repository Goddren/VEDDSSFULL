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
  delta?: number;
}

export interface AlpacaPosition {
  symbol: string;
  qty: number;
  side: 'long' | 'short';
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  assetClass: string; // 'us_option' | 'us_equity'
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

// One leg of a multi-leg (mleg) options order — used for defined-risk credit
// spreads. position_intent must be explicit on each leg so the broker knows it's
// an opening/closing spread (and applies spread margin, not naked margin).
export interface AlpacaMultiLegLeg {
  optionSymbol: string;                 // OCC symbol
  side: 'buy' | 'sell';
  ratioQty: number;                     // 1 for a standard vertical
  positionIntent: 'buy_to_open' | 'sell_to_open' | 'buy_to_close' | 'sell_to_close';
}

export interface AlpacaMultiLegOrderRequest {
  legs: AlpacaMultiLegLeg[];
  quantity: number;                     // number of spreads
  // Signed net limit price per Alpaca's mleg convention: NEGATIVE = net credit
  // you receive (opening a credit spread), POSITIVE = net debit you pay
  // (closing it / debit spreads). Rounded to the penny by the caller.
  netLimitPrice: number;
  timeInForce?: 'day' | 'gtc';
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

  // Real-time-ish market snapshot (latest trade + today's/yesterday's daily bar)
  // for the underlying — used by the options scanner to explain what it's
  // seeing (price, momentum) without needing a full options-chain pull for
  // every symbol on every scan cycle.
  async getSnapshot(symbol: string): Promise<{ price: number; prevClose: number; dailyChangePercent: number } | null> {
    const response = await this.request(
      `${this.dataUrl}/v2/stocks/${encodeURIComponent(symbol)}/snapshot`,
      { method: 'GET' },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const price = data.latestTrade?.p ?? data.dailyBar?.c;
    const prevClose = data.prevDailyBar?.c;
    if (!price || !prevClose) return null;
    return {
      price,
      prevClose,
      dailyChangePercent: ((price - prevClose) / prevClose) * 100,
    };
  }

  // OHLCV bars — the real data source behind ORB (intraday bars since open),
  // Volume Profile (intraday bars across N days), and Breakout (daily bars
  // over a lookback window) strategies. timeframe examples: '1Min', '5Min', '1Day'.
  async getBars(symbol: string, timeframe: string, start: Date, end: Date, limit = 1000): Promise<Array<{
    t: string; o: number; h: number; l: number; c: number; v: number; vw: number; n: number;
  }>> {
    const params = new URLSearchParams({
      timeframe,
      start: start.toISOString(),
      end: end.toISOString(),
      limit: String(limit),
      adjustment: 'raw',
      feed: 'iex', // free/paper-compatible data feed
    });
    const response = await this.request(
      `${this.dataUrl}/v2/stocks/${encodeURIComponent(symbol)}/bars?${params.toString()}`,
      { method: 'GET' },
    );
    if (!response.ok) return [];
    const data = await response.json();
    const bars = data.bars || [];
    // vw (VWAP) and n (trade count) are already in Alpaca's raw bar payload —
    // surfaced here (previously dropped) so strategies can use VWAP as a
    // fair-value reference and trade count as a volume-delta/aggression proxy
    // without needing tick-level order-flow data.
    return bars.map((b: any) => ({ t: b.t, o: b.o, h: b.h, l: b.l, c: b.c, v: b.v, vw: b.vw ?? b.c, n: b.n ?? 0 }));
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
        delta: snap.greeks?.delta,
      } as AlpacaOptionContract;
    });
  }

  // Fast single-contract quote — used to price an existing open position for
  // exit management without re-pulling the entire chain every check cycle.
  async getOptionQuote(optionSymbol: string): Promise<{ bid: number; ask: number; mid: number } | null> {
    const response = await this.request(
      `${this.dataUrl}/v1beta1/options/quotes/latest?symbols=${encodeURIComponent(optionSymbol)}`,
      { method: 'GET' },
    );
    if (!response.ok) return null;
    const data = await response.json();
    const q = data.quotes?.[optionSymbol];
    if (!q) return null;
    const bid = q.bp ?? 0, ask = q.ap ?? 0;
    if (!bid && !ask) return null;
    return { bid, ask, mid: (bid + ask) / 2 || ask || bid };
  }

  async getPositions(): Promise<AlpacaPosition[]> {
    const response = await this.request(`${this.baseUrl}/v2/positions`, { method: 'GET' });
    if (!response.ok) return [];
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map((p: any) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      side: p.side,
      avgEntryPrice: parseFloat(p.avg_entry_price),
      currentPrice: parseFloat(p.current_price ?? p.avg_entry_price),
      marketValue: parseFloat(p.market_value ?? '0'),
      unrealizedPl: parseFloat(p.unrealized_pl ?? '0'),
      assetClass: p.asset_class,
    }));
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

  // Place a multi-leg (mleg) options order — defined-risk credit/debit spreads.
  // Requires Alpaca options trading level 3. All legs fill together or not at all
  // (no legging risk), and the broker applies spread margin off the defined max
  // loss rather than naked-short margin.
  async placeMultiLegOrder(order: AlpacaMultiLegOrderRequest): Promise<AlpacaOrderResponse> {
    const response = await this.request(`${this.baseUrl}/v2/orders`, {
      method: 'POST',
      body: JSON.stringify({
        order_class: 'mleg',
        qty: String(order.quantity),
        type: 'limit',
        time_in_force: order.timeInForce || 'day',
        limit_price: order.netLimitPrice.toFixed(2),
        legs: order.legs.map(l => ({
          symbol: l.optionSymbol,
          ratio_qty: String(l.ratioQty),
          side: l.side,
          position_intent: l.positionIntent,
        })),
      }),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Alpaca multi-leg order failed: ${response.status} - ${text}`);
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
export function parseOccSymbol(occSymbol: string, underlyingSymbol: string): { expirationDate: string; strikePrice: number; type: 'call' | 'put' } {
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
