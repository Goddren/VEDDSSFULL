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

  constructor(accountType: 'demo' | 'live', accountId: string, serverId: string) {
    this.baseUrl = accountType === 'demo' 
      ? 'https://demo.tradelocker.com/backend-api'
      : 'https://live.tradelocker.com/backend-api';
    this.accountId = accountId;
    this.serverId = serverId;
  }

  async authenticate(email: string, password: string): Promise<TradeLockerAuthResponse> {
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

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Authentication failed: ${response.status} - ${errorText}`);
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
      const response = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get account info: ${response.status}`);
      }

      const data = await response.json();
      return {
        accountId: data.id || this.accountId,
        balance: data.balance || 0,
        equity: data.equity || 0,
        margin: data.margin || 0,
        freeMargin: data.freeMargin || 0,
        currency: data.currency || 'USD',
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

    try {
      const response = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/orders`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          instrumentId: order.symbol,
          side: order.side,
          type: order.type,
          quantity: order.quantity,
          price: order.price,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Order placement failed: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      return {
        orderId: data.orderId || data.id,
        status: data.status || 'submitted',
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

    if (connection.accessToken && connection.refreshToken) {
      console.log('[TradeLocker Execute] Using existing tokens');
      service.setTokens(
        connection.accessToken,
        connection.refreshToken,
        connection.tokenExpiresAt || undefined
      );
    } else {
      console.log('[TradeLocker Execute] Authenticating with credentials');
      const password = decryptPassword(connection.encryptedPassword);
      await service.authenticate(connection.email, password);
      console.log('[TradeLocker Execute] Authentication successful');
    }

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
