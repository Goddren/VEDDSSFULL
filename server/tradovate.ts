// ─── VEDD Tradovate Service ────────────────────────────────────────────────────
// Futures trading connector for Tradovate (used by TOPSTEP, Apex, Bulenox, etc.)
// Mirrors the structure of server/tradelocker.ts

// Re-use the same encryption key/functions from TradeLocker — same AES-256-CBC
export { encryptPassword, decryptPassword } from './tradelocker';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface TradovateAuthRequest {
  name: string;
  password: string;
  appId: string;
  appVersion: string;
  cid: number;
  sec: string;
}

interface TradovateAuthResponse {
  accessToken?: string;
  expirationTime?: string;
  userId?: number;
  p?: string;       // Tradovate returns 'OK' or error code here
  s?: number;       // status code
  i?: number;       // error index
  d?: string;       // error detail
}

export interface TradovateAccountInfo {
  id: number;
  name: string;
  balance: number;
  openPnL: number;
  closedPnL: number;
  equity: number;
  marginUsed: number;
  availableMargin: number;
  currency: string;
}

export interface TradovatePosition {
  id: number;
  contractId: number;
  symbol: string;
  netPos: number;         // positive = long, negative = short
  netPrice: number;
  openPnL: number;
  timeEntered: string;
}

export interface TradovateOrderRequest {
  accountId: number;
  contractId: number;
  symbol: string;
  action: 'Buy' | 'Sell';
  orderQty: number;
  orderType: 'Market' | 'Limit' | 'Stop' | 'StopLimit';
  price?: number;
  stopPrice?: number;
  ifTouchPrice?: number;
  timeInForce?: 'Day' | 'GTC' | 'GTD' | 'IOC' | 'FOK';
  isAutomated?: boolean;
}

export interface TradovateOrderResponse {
  orderId: number;
  status: 'Working' | 'Filled' | 'Rejected' | 'Cancelled' | 'PendingNew';
  message?: string;
}

// ─── Service Class ─────────────────────────────────────────────────────────────

export class TradovateService {
  private baseUrl: string;
  private mdUrl: string;       // market data endpoint
  private accessToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private accountId: number | null = null;
  private username: string = '';
  private password: string = '';
  public onTokenRefresh: ((accessToken: string, expiresAt: Date) => void) | null = null;

  // Contract ID cache: root symbol → { contractId, name, cachedAt }
  private contractCache: Map<string, { contractId: number; name: string; cachedAt: Date }> = new Map();

  constructor(accountType: 'demo' | 'live') {
    if (accountType === 'live') {
      this.baseUrl = 'https://live.tradovateapi.com/v1';
      this.mdUrl = 'https://md.tradovateapi.com/v1';
    } else {
      this.baseUrl = 'https://demo.tradovateapi.com/v1';
      this.mdUrl = 'https://md.tradovateapi.com/v1'; // MD is same for both
    }
  }

  setCredentials(username: string, password: string) {
    this.username = username;
    this.password = password;
  }

  setToken(accessToken: string, expiresAt: Date) {
    this.accessToken = accessToken;
    this.tokenExpiresAt = expiresAt;
  }

  setAccountId(id: number) {
    this.accountId = id;
  }

  private async ensureAuthenticated(): Promise<void> {
    const now = new Date();
    // Re-auth if token is missing or expires within 5 minutes
    if (!this.accessToken || !this.tokenExpiresAt || this.tokenExpiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
      if (!this.username || !this.password) {
        throw new Error('No credentials set for Tradovate re-authentication');
      }
      await this.authenticate(this.username, this.password);
    }
  }

  async authenticate(username: string, password: string): Promise<TradovateAuthResponse> {
    this.username = username;
    this.password = password;

    const body: TradovateAuthRequest = {
      name: username,
      password,
      appId: process.env.TRADOVATE_APP_ID || 'VEDD',
      appVersion: '1.0',
      cid: 0,
      sec: '',
    };

    const response = await fetch(`${this.baseUrl}/auth/accesstokenrequest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tradovate auth HTTP ${response.status}: ${text}`);
    }

    const data: TradovateAuthResponse = await response.json();

    // Tradovate returns { p: 'OK', accessToken, expirationTime } on success
    // or { p: 'error', d: 'error message' } on failure
    if (!data.accessToken || data.p === 'error') {
      throw new Error(data.d || 'Tradovate authentication failed');
    }

    // Parse expiry — Tradovate returns ISO timestamp string
    const expiresAt = data.expirationTime ? new Date(data.expirationTime) : new Date(Date.now() + 75 * 60 * 1000);
    this.accessToken = data.accessToken;
    this.tokenExpiresAt = expiresAt;

    if (this.onTokenRefresh) {
      this.onTokenRefresh(data.accessToken, expiresAt);
    }

    return data;
  }

  private async get<T>(path: string): Promise<T> {
    await this.ensureAuthenticated();
    const response = await fetch(`${this.baseUrl}${path}`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tradovate GET ${path} failed (${response.status}): ${text}`);
    }
    return response.json();
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    await this.ensureAuthenticated();
    const response = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Tradovate POST ${path} failed (${response.status}): ${text}`);
    }
    return response.json();
  }

  async getAccounts(): Promise<TradovateAccountInfo[]> {
    const accounts = await this.get<any[]>('/account/list');
    return accounts.map(a => ({
      id: a.id,
      name: a.name,
      balance: a.cashBalance ?? 0,
      openPnL: a.openPnL ?? 0,
      closedPnL: a.closedPnL ?? 0,
      equity: (a.cashBalance ?? 0) + (a.openPnL ?? 0),
      marginUsed: a.initialMargin ?? 0,
      availableMargin: a.availableFunds ?? 0,
      currency: 'USD',
    }));
  }

  async getAccount(): Promise<TradovateAccountInfo> {
    const accounts = await this.getAccounts();
    if (accounts.length === 0) throw new Error('No Tradovate accounts found');
    if (this.accountId) {
      const match = accounts.find(a => a.id === this.accountId);
      if (match) return match;
    }
    return accounts[0];
  }

  async getPositions(): Promise<TradovatePosition[]> {
    const positions = await this.get<any[]>('/position/list');
    return positions.filter(p => p.netPos !== 0).map(p => ({
      id: p.id,
      contractId: p.contractId,
      symbol: p.contract?.name || String(p.contractId),
      netPos: p.netPos,
      netPrice: p.netPrice ?? 0,
      openPnL: p.openPnL ?? 0,
      timeEntered: p.timestamp || new Date().toISOString(),
    }));
  }

  async getFills(limit: number = 100): Promise<any[]> {
    const fills = await this.get<any[]>('/fill/list');
    return fills.slice(0, limit);
  }

  async resolveContractId(rootSymbol: string): Promise<{ contractId: number; name: string }> {
    // Check cache (10-minute TTL)
    const cached = this.contractCache.get(rootSymbol.toUpperCase());
    if (cached && Date.now() - cached.cachedAt.getTime() < 10 * 60 * 1000) {
      return { contractId: cached.contractId, name: cached.name };
    }

    await this.ensureAuthenticated();
    const response = await fetch(`${this.baseUrl}/contract/suggest?t=${rootSymbol}&l=5`, {
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Accept': 'application/json' },
    });
    if (!response.ok) throw new Error(`Failed to resolve contract for ${rootSymbol}`);
    const contracts: any[] = await response.json();

    // Pick front-month (nearest non-expired)
    const active = contracts
      .filter((c: any) => !c.expired && c.name)
      .sort((a: any, b: any) => {
        const da = a.expirationDate ? new Date(a.expirationDate).getTime() : Infinity;
        const db = b.expirationDate ? new Date(b.expirationDate).getTime() : Infinity;
        return da - db;
      });

    if (active.length === 0) throw new Error(`No active contracts found for ${rootSymbol}`);
    const frontMonth = active[0];
    const result = { contractId: frontMonth.id, name: frontMonth.name };

    this.contractCache.set(rootSymbol.toUpperCase(), { ...result, cachedAt: new Date() });
    return result;
  }

  async placeOrder(order: TradovateOrderRequest): Promise<TradovateOrderResponse> {
    const body = {
      accountId: order.accountId,
      contractId: order.contractId,
      action: order.action,
      orderQty: order.orderQty,
      orderType: order.orderType,
      price: order.price,
      stopPrice: order.stopPrice,
      timeInForce: order.timeInForce || 'Day',
      isAutomated: true,
    };

    const result = await this.post<any>('/order/placeorder', body);

    if (result.failureReason) {
      throw new Error(`Order rejected: ${result.failureReason}`);
    }

    return {
      orderId: result.orderId || result.id,
      status: result.orderStatus || 'Working',
      message: result.errorMessage,
    };
  }

  async cancelOrder(orderId: number): Promise<boolean> {
    try {
      await this.post('/order/cancelorder', { orderId });
      return true;
    } catch {
      return false;
    }
  }

  async liquidatePosition(accountId: number, contractId: number): Promise<boolean> {
    try {
      await this.post('/order/liquidateposition', { accountId, contractId, isAutomated: true });
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Service Cache (same pattern as TradeLocker) ───────────────────────────────

const serviceCache: Map<string, { service: TradovateService; cachedAt: Date }> = new Map();
const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

function getCacheKey(userId: number, accountType: string): string {
  return `${userId}:${accountType}`;
}

export async function getOrCreateTradovateService(
  userId: number,
  username: string,
  encryptedPassword: string,
  accountType: string,
  accountId: string | null,
  cachedToken?: string | null,
  tokenExpiresAt?: Date | null,
): Promise<TradovateService> {
  const cacheKey = getCacheKey(userId, accountType);
  const cached = serviceCache.get(cacheKey);

  if (cached && Date.now() - cached.cachedAt.getTime() < CACHE_TTL_MS) {
    return cached.service;
  }

  const { decryptPassword } = await import('./tradelocker');
  const password = decryptPassword(encryptedPassword);
  const svc = new TradovateService(accountType as 'demo' | 'live');
  svc.setCredentials(username, password);

  if (accountId) svc.setAccountId(parseInt(accountId, 10));

  // Use cached token if still valid (>5 min remaining)
  if (cachedToken && tokenExpiresAt && tokenExpiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    svc.setToken(cachedToken, tokenExpiresAt);
  } else {
    // Authenticate fresh
    await svc.authenticate(username, password);
  }

  serviceCache.set(cacheKey, { service: svc, cachedAt: new Date() });
  return svc;
}

// ─── Signal Execution (top-level exported function) ───────────────────────────

export async function executeFuturesSignal(
  connection: {
    id?: number;
    username: string;
    encryptedPassword: string;
    accountType: string;
    accountId: string | null;
    accessToken?: string | null;
    tokenExpiresAt?: Date | null;
    userId?: number;
  },
  signal: {
    action: 'OPEN' | 'CLOSE';
    symbol: string;
    direction: 'BUY' | 'SELL';
    contracts: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
  }
): Promise<{ success: boolean; orderId?: number; error?: string }> {
  try {
    const { decryptPassword } = await import('./tradelocker');
    const password = decryptPassword(connection.encryptedPassword);

    const svc = await getOrCreateTradovateService(
      connection.userId || 0,
      connection.username,
      connection.encryptedPassword,
      connection.accountType,
      connection.accountId,
      connection.accessToken,
      connection.tokenExpiresAt,
    );

    // Resolve front-month contract
    const { contractId, name: contractName } = await svc.resolveContractId(signal.symbol);

    // Get account ID
    const account = await svc.getAccount();
    const accountId = account.id;

    if (signal.action === 'CLOSE') {
      const closed = await svc.liquidatePosition(accountId, contractId);
      return { success: closed };
    }

    // Place OPEN order
    const order: TradovateOrderRequest = {
      accountId,
      contractId,
      symbol: contractName,
      action: signal.direction === 'BUY' ? 'Buy' : 'Sell',
      orderQty: signal.contracts,
      orderType: 'Market',
      timeInForce: 'Day',
    };

    const result = await svc.placeOrder(order);

    // If SL/TP provided, place bracket orders (separate stop orders)
    if (result.orderId && (signal.stopLoss || signal.takeProfit)) {
      // Bracket orders: place protective stop and limit after fill
      // NinjaTrader/Tradovate handles these as OCO bracket via placeorder with brackets
      // For Phase 1 — log the levels, implement bracket order in Phase 2
      console.log(`[Tradovate] Order ${result.orderId} filled. SL: ${signal.stopLoss}, TP: ${signal.takeProfit} — bracket implementation in Phase 2`);
    }

    return { success: true, orderId: result.orderId };
  } catch (error: any) {
    console.error('[Tradovate] executeFuturesSignal error:', error);
    return { success: false, error: error.message || 'Unknown error' };
  }
}
