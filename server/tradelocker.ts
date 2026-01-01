import crypto from 'crypto';

const IV_LENGTH = 16;

function getEncryptionKey(): string {
  const key = process.env.TRADELOCKER_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('TRADELOCKER_ENCRYPTION_KEY environment variable is required for secure password storage');
  }
  if (key.length < 32) {
    throw new Error('TRADELOCKER_ENCRYPTION_KEY must be at least 32 characters');
  }
  return key;
}

interface TradeLockerAuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

interface TradeLockerAccountInfo {
  accountId: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  currency: string;
}

interface TradeLockerOrderRequest {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop';
  quantity: number;
  price?: number;
  stopLoss?: number;
  takeProfit?: number;
}

interface TradeLockerOrderResponse {
  orderId: string;
  status: string;
  filledQuantity?: number;
  filledPrice?: number;
  message?: string;
}

const SALT_LENGTH = 16;

export function encryptPassword(password: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const salt = crypto.randomBytes(SALT_LENGTH);
  const encryptionKey = getEncryptionKey();
  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(password, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return salt.toString('hex') + ':' + iv.toString('hex') + ':' + encrypted;
}

export function decryptPassword(encryptedPassword: string): string {
  const parts = encryptedPassword.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted password format');
  }
  const salt = Buffer.from(parts[0], 'hex');
  const iv = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const encryptionKey = getEncryptionKey();
  const key = crypto.scryptSync(encryptionKey, salt, 32);
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export class TradeLockerService {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiresAt: Date | null = null;
  private accountId: string;
  private serverId: string;
  private accNum: string = '0'; // The account order number (0-indexed: 0, 1, 2...), different from accountId

  constructor(accountType: 'demo' | 'live', accountId: string, serverId: string) {
    this.baseUrl = accountType === 'demo' 
      ? 'https://demo.tradelocker.com/backend-api'
      : 'https://live.tradelocker.com/backend-api';
    this.accountId = accountId;
    this.serverId = serverId;
  }
  
  // Fetch and cache the correct accNum for this account
  // The accNum is returned by the all-accounts endpoint - use that value directly
  async resolveAccNum(): Promise<string> {
    await this.ensureAuthenticated();
    
    try {
      const response = await fetch(`${this.baseUrl}/auth/jwt/all-accounts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[TradeLocker] All accounts response:', JSON.stringify(data));
        if (data.accounts && Array.isArray(data.accounts)) {
          // Find the index of this account in the list (0-indexed for the header)
          const accountIndex = data.accounts.findIndex((acc: any) => 
            acc.id?.toString() === this.accountId || acc.accountId?.toString() === this.accountId
          );
          if (accountIndex >= 0) {
            this.accNum = accountIndex.toString();
            console.log('[TradeLocker] Using 0-indexed accNum:', this.accNum, 'for accountId:', this.accountId);
          } else {
            // Default to "0" for first account
            this.accNum = '0';
            console.log('[TradeLocker] Account not found in list, using default accNum: 0');
          }
        }
      }
    } catch (error) {
      console.log('[TradeLocker] Could not resolve accNum, using default:', this.accNum);
    }
    
    return this.accNum;
  }

  async authenticate(email: string, password: string): Promise<TradeLockerAuthResponse> {
    console.log('[TradeLocker Auth] Attempting authentication:', {
      baseUrl: this.baseUrl,
      email: email,
      serverId: this.serverId,
      accountId: this.accountId
    });
    
    try {
      const response = await fetch(`${this.baseUrl}/auth/jwt/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          server: this.serverId,
        }),
      });

      console.log('[TradeLocker Auth] Response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.log('[TradeLocker Auth] Error response:', errorText);
        throw new Error(`Authentication failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.tokenExpiresAt = new Date(Date.now() + (data.expiresIn || 3600) * 1000);
      
      // Resolve accNum after authentication
      await this.resolveAccNum();

      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn || 3600,
      };
    } catch (error) {
      console.error('TradeLocker authentication error:', error);
      throw error;
    }
  }

  async refreshAccessToken(refreshToken: string): Promise<TradeLockerAuthResponse> {
    try {
      const response = await fetch(`${this.baseUrl}/auth/jwt/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();
      
      this.accessToken = data.accessToken;
      this.refreshToken = data.refreshToken;
      this.tokenExpiresAt = new Date(Date.now() + (data.expiresIn || 3600) * 1000);

      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn || 3600,
      };
    } catch (error) {
      console.error('TradeLocker token refresh error:', error);
      throw error;
    }
  }

  setTokens(accessToken: string, refreshToken: string, expiresAt?: Date) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    this.tokenExpiresAt = expiresAt || null;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (!this.accessToken) {
      throw new Error('Not authenticated. Call authenticate() first.');
    }

    if (this.tokenExpiresAt && new Date() >= this.tokenExpiresAt && this.refreshToken) {
      await this.refreshAccessToken(this.refreshToken);
    }
  }

  async getAccountInfo(): Promise<TradeLockerAccountInfo> {
    await this.ensureAuthenticated();

    try {
      // TradeLocker API: First get all accounts to find our accNum
      console.log('[TradeLocker] Getting all accounts to find accNum for accountId:', this.accountId);
      
      const accountsResponse = await fetch(`${this.baseUrl}/auth/jwt/all-accounts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      
      console.log('[TradeLocker] All accounts response status:', accountsResponse.status);
      if (!accountsResponse.ok) {
        const errorText = await accountsResponse.text();
        console.log('[TradeLocker] All accounts error:', errorText);
        throw new Error(`Failed to get accounts list: ${accountsResponse.status} - ${errorText}`);
      }
      
      const accountsData = await accountsResponse.json();
      console.log('[TradeLocker] Accounts data:', JSON.stringify(accountsData));
      
      // Find the accNum for our accountId
      let accNum = 1;
      if (accountsData.accounts && Array.isArray(accountsData.accounts)) {
        const accountIndex = accountsData.accounts.findIndex((acc: any) => 
          acc.id?.toString() === this.accountId || acc.accountId?.toString() === this.accountId
        );
        if (accountIndex >= 0) {
          accNum = accountIndex + 1;
        }
      }
      
      console.log('[TradeLocker] Using accNum:', accNum, 'for accountId:', this.accountId);
      
      // Now get account details with the correct accNum
      const response = await fetch(`${this.baseUrl}/trade/accounts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': accNum.toString(),
        },
      });

      console.log('[TradeLocker] Account details response status:', response.status);
      if (!response.ok) {
        const errorText = await response.text();
        console.log('[TradeLocker] Account details error:', errorText);
        throw new Error(`Failed to get account info: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[TradeLocker] Account details:', JSON.stringify(data));
      
      // Handle both array and single object responses
      const accountData = Array.isArray(data) ? data[0] : data;
      
      return {
        accountId: accountData?.id?.toString() || this.accountId,
        balance: accountData?.balance || 0,
        equity: accountData?.equity || 0,
        margin: accountData?.margin || 0,
        freeMargin: accountData?.freeMargin || 0,
        currency: accountData?.currency || 'USD',
      };
    } catch (error) {
      console.error('TradeLocker get account info error:', error);
      throw error;
    }
  }

  async getInstruments(): Promise<any[]> {
    await this.ensureAuthenticated();

    try {
      const response = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/instruments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': this.accNum,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get instruments: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('TradeLocker get instruments error:', error);
      throw error;
    }
  }

  async placeOrder(order: TradeLockerOrderRequest): Promise<TradeLockerOrderResponse> {
    await this.ensureAuthenticated();
    
    // Ensure accNum is resolved
    if (this.accNum === '1' && this.accessToken) {
      await this.resolveAccNum();
    }

    try {
      console.log('[TradeLocker] Placing order with accNum:', this.accNum, '(type:', typeof this.accNum, ') accountId:', this.accountId);
      console.log('[TradeLocker] Order details:', order);
      console.log('[TradeLocker] Access token present:', !!this.accessToken);
      
      // First, get the tradableInstrumentId and routeId for this symbol
      console.log('[TradeLocker] Fetching instruments...');
      const instrumentsResponse = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/instruments`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': this.accNum,
        },
      });
      
      console.log('[TradeLocker] Instruments response status:', instrumentsResponse.status);
      if (!instrumentsResponse.ok) {
        const errText = await instrumentsResponse.text();
        console.log('[TradeLocker] Instruments error:', errText);
        throw new Error(`Failed to get instruments: ${instrumentsResponse.status} - ${errText}`);
      }
      
      const instrumentsData = await instrumentsResponse.json();
      console.log('[TradeLocker] Instruments response structure:', Object.keys(instrumentsData));
      
      // Find the instrument matching the symbol
      let tradableInstrumentId: number | null = null;
      let routeId: number | null = null;
      
      // Handle the response format - could be array or object with d property
      const instruments = instrumentsData.d?.instruments || instrumentsData.instruments || instrumentsData;
      const routes = instrumentsData.d?.routes || instrumentsData.routes || [];
      
      if (Array.isArray(instruments)) {
        const instrument = instruments.find((inst: any) => 
          inst.name === order.symbol || 
          inst.symbol === order.symbol ||
          inst.name?.toUpperCase() === order.symbol.toUpperCase() ||
          inst.symbol?.toUpperCase() === order.symbol.toUpperCase()
        );
        if (instrument) {
          tradableInstrumentId = instrument.tradableInstrumentId || instrument.id;
          console.log('[TradeLocker] Found instrument:', instrument.name, 'tradableInstrumentId:', tradableInstrumentId);
        }
      }
      
      // Get TRADE routeId (not INFO)
      if (Array.isArray(routes)) {
        const tradeRoute = routes.find((r: any) => r.name === 'TRADE' || r.type === 'TRADE');
        if (tradeRoute) {
          routeId = tradeRoute.id;
          console.log('[TradeLocker] Found TRADE routeId:', routeId);
        }
      }
      
      if (!tradableInstrumentId) {
        throw new Error(`Instrument not found: ${order.symbol}. Make sure the symbol matches exactly with TradeLocker.`);
      }
      
      if (!routeId) {
        // Default routeId if not found - typically 1 for TRADE
        routeId = 1;
        console.log('[TradeLocker] Using default routeId:', routeId);
      }
      
      // Build the order payload per TradeLocker API spec
      const orderPayload: any = {
        tradableInstrumentId,
        routeId,
        qty: order.quantity,
        side: order.side,
        type: order.type,
        validity: order.type === 'market' ? 'IOC' : 'GTC',
      };
      
      // Add price for limit orders
      if (order.type === 'limit' && order.price) {
        orderPayload.price = order.price;
      }
      
      // Add stop loss if provided
      if (order.stopLoss) {
        orderPayload.stopLoss = order.stopLoss;
        orderPayload.stopLossType = 'absolute';
      }
      
      // Add take profit if provided
      if (order.takeProfit) {
        orderPayload.takeProfit = order.takeProfit;
        orderPayload.takeProfitType = 'absolute';
      }
      
      console.log('[TradeLocker] Order payload:', JSON.stringify(orderPayload));
      
      const response = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': this.accNum,
        },
        body: JSON.stringify(orderPayload),
      });

      const responseText = await response.text();
      console.log('[TradeLocker] Order response status:', response.status, 'body:', responseText);
      
      if (!response.ok) {
        throw new Error(`Order placement failed: ${response.status} - ${responseText}`);
      }

      const data = JSON.parse(responseText);
      return {
        orderId: data.d?.orderId || data.orderId || data.id,
        status: data.s === 'ok' ? 'submitted' : (data.status || 'submitted'),
        filledQuantity: data.filledQuantity,
        filledPrice: data.filledPrice,
        message: data.message,
      };
    } catch (error) {
      console.error('TradeLocker place order error:', error);
      throw error;
    }
  }

  async closePosition(positionId: string): Promise<TradeLockerOrderResponse> {
    await this.ensureAuthenticated();

    try {
      const response = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/positions/${positionId}/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': this.accNum,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Position close failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return {
        orderId: data.orderId || positionId,
        status: 'closed',
        message: data.message,
      };
    } catch (error) {
      console.error('TradeLocker close position error:', error);
      throw error;
    }
  }

  async getPositions(): Promise<any[]> {
    await this.ensureAuthenticated();

    try {
      const response = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/positions`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': this.accNum,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get positions: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('TradeLocker get positions error:', error);
      throw error;
    }
  }
}

export async function executeMT5SignalOnTradeLocker(
  connection: {
    email: string;
    encryptedPassword: string;
    serverId: string;
    accountId: string;
    accountType: string;
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
  },
  signal: {
    action: string;
    symbol: string;
    direction: string;
    volume: number;
    entryPrice?: number;
    stopLoss?: number;
    takeProfit?: number;
  }
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  console.log('[TradeLocker Execute] Starting trade execution:', {
    accountType: connection.accountType,
    accountId: connection.accountId,
    serverId: connection.serverId,
    signal: { action: signal.action, symbol: signal.symbol, direction: signal.direction, volume: signal.volume }
  });
  
  try {
    const service = new TradeLockerService(
      connection.accountType as 'demo' | 'live',
      connection.accountId,
      connection.serverId
    );

    // Always authenticate fresh to ensure accNum is resolved correctly
    console.log('[TradeLocker Execute] Authenticating with credentials');
    const password = decryptPassword(connection.encryptedPassword);
    await service.authenticate(connection.email, password);
    console.log('[TradeLocker Execute] Authentication successful');

    if (signal.action === 'OPEN' || signal.action.toUpperCase() === 'OPEN') {
      console.log('[TradeLocker Execute] Placing order:', {
        symbol: signal.symbol,
        side: signal.direction.toLowerCase(),
        type: 'market',
        quantity: signal.volume,
      });
      const orderResult = await service.placeOrder({
        symbol: signal.symbol,
        side: signal.direction.toLowerCase() as 'buy' | 'sell',
        type: 'market',
        quantity: signal.volume,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
      });
      console.log('[TradeLocker Execute] Order result:', orderResult);

      return {
        success: orderResult.status !== 'rejected',
        orderId: orderResult.orderId,
        error: orderResult.status === 'rejected' ? orderResult.message : undefined,
      };
    } else if (signal.action === 'CLOSE' || signal.action.toUpperCase() === 'CLOSE') {
      console.log('[TradeLocker Execute] Close action requested (not implemented)');
      return {
        success: true,
        error: 'Close by symbol not yet implemented - requires position lookup',
      };
    }

    console.log('[TradeLocker Execute] Unknown action type:', signal.action);
    return { success: false, error: `Unknown action type: ${signal.action}` };
  } catch (error) {
    console.error('[TradeLocker Execute] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
