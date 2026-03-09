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
  private accNum: string = '0';
  private accNumResolved: boolean = false;

  constructor(accountType: 'demo' | 'live', accountId: string, serverId: string, cachedAccNum?: string) {
    this.baseUrl = accountType === 'demo' 
      ? 'https://demo.tradelocker.com/backend-api'
      : 'https://live.tradelocker.com/backend-api';
    // Strip any leading # character — it breaks URL path construction in Node.js
    // e.g. "#1991352" → "1991352" so URL becomes /trade/accounts/1991352/... not /trade/accounts/#...
    this.accountId = accountId.replace(/^#/, '').trim();
    if (this.accountId !== accountId) {
      console.log('[TradeLocker] Stripped # prefix from accountId:', accountId, '→', this.accountId);
    }
    this.serverId = serverId;
    if (cachedAccNum && cachedAccNum !== '0') {
      this.accNum = cachedAccNum;
      this.accNumResolved = true;
      console.log('[TradeLocker] Using cached accNum:', cachedAccNum);
    }
  }

  getResolvedAccNum(): string {
    return this.accNum;
  }
  
  async resolveAccNum(): Promise<string> {
    if (this.accNumResolved && this.accNum !== '0') {
      return this.accNum;
    }

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
        console.log('[TradeLocker] All accounts raw response:', JSON.stringify(data));
        
        const accounts = Array.isArray(data) ? data : (data.accounts || data.d?.accounts || []);
        
        if (accounts.length > 0) {
          const account = accounts.find((acc: any) => 
            acc.id?.toString() === this.accountId || 
            acc.accountId?.toString() === this.accountId
          );
          
          if (account && account.accNum !== undefined) {
            this.accNum = account.accNum.toString();
            this.accNumResolved = true;
            console.log('[TradeLocker] Found matching account, using accNum:', this.accNum);
            return this.accNum;
          } else {
            this.accNum = accounts[0].accNum?.toString() ?? '1';
            this.accNumResolved = true;
            console.log('[TradeLocker] Using first account accNum:', this.accNum);
            return this.accNum;
          }
        }
      }
    } catch (error) {
      console.log('[TradeLocker] All-accounts endpoint failed:', error);
    }
    
    console.log('[TradeLocker] All-accounts returned empty, probing accNum values...');
    for (const testNum of ['1', '2', '3', '4', '5']) {
      try {
        const testResponse = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/instruments`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'accNum': testNum,
          },
        });
        
        if (testResponse.ok) {
          this.accNum = testNum;
          this.accNumResolved = true;
          console.log('[TradeLocker] Probing found valid accNum:', testNum);
          return this.accNum;
        } else {
          const errText = await testResponse.text();
          console.log(`[TradeLocker] accNum ${testNum} failed:`, testResponse.status);
        }
      } catch (err) {
        console.log(`[TradeLocker] accNum ${testNum} probe error`);
      }
    }
    
    this.accNum = '1';
    console.log('[TradeLocker] Could not resolve accNum, defaulting to 1');
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
      
      // Find the accNum for our accountId from the response
      const accounts = Array.isArray(accountsData) ? accountsData : (accountsData.accounts || []);
      let accNum = 0;
      
      if (accounts.length > 0) {
        const account = accounts.find((acc: any) => 
          acc.id?.toString() === this.accountId || acc.accountId?.toString() === this.accountId
        );
        if (account && account.accNum !== undefined) {
          accNum = account.accNum;
        } else {
          // Use first account's accNum if not found
          accNum = accounts[0].accNum ?? 0;
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
    
    // Always resolve accNum before placing orders to ensure we have the correct value
    if (this.accessToken) {
      await this.resolveAccNum();
    }

    try {
      console.log('[TradeLocker] Placing order with accNum:', this.accNum, '(type:', typeof this.accNum, ') accountId:', this.accountId);
      console.log('[TradeLocker] Order details:', order);
      
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
        // Build a prioritised list of symbol variants to try:
        // 1. Exact match
        // 2. Common broker suffixes (.pro, m, .m, .z, .a, .b, .c, .r, _raw, .ecn)
        // 3. Strip any trailing suffix from the input symbol and try bare
        // 4. Known aliases (GOLD ↔ XAUUSD, SILVER ↔ XAGUSD, etc.)
        const sym = order.symbol.toUpperCase();
        const symVariants: string[] = [sym];

        // Common broker suffix additions
        const suffixes = ['.pro', 'm', '.m', '.z', '.a', '.b', '.c', '.r', '_raw', '.ecn', '.stp', '.pro+', 'PRO'];
        for (const sfx of suffixes) {
          symVariants.push(sym + sfx.toUpperCase());
          symVariants.push(sym + sfx);
        }

        // Strip trailing suffix from input symbol (e.g. XAUUSD.PRO → XAUUSD)
        const strippedSym = sym.replace(/[._]?(PRO|ECN|STP|RAW|M|Z|A|B|C|R)\+?$/i, '');
        if (strippedSym !== sym) symVariants.push(strippedSym);

        // Known commodity/index aliases
        const ALIASES: Record<string, string[]> = {
          'XAUUSD': ['GOLD', 'XAU/USD', 'GOLD/USD', 'XAUUSD.PRO', 'XAUUSDPRO'],
          'GOLD':   ['XAUUSD', 'XAU/USD'],
          'XAGUSD': ['SILVER', 'XAG/USD'],
          'SILVER': ['XAGUSD', 'XAG/USD'],
          'USOIL':  ['WTI', 'CRUDE', 'OIL', 'USOUSD'],
          'UKOIL':  ['BRENT', 'BRENTOIL'],
          'NAS100': ['USTEC', 'NDX100', 'NASDAQ100', 'US100', 'NQ100'],
          'US500':  ['SPX500', 'SP500', 'US500', 'SPX'],
          'US30':   ['DJ30', 'WALLST30', 'DJI30'],
          'GER40':  ['DAX40', 'DE40', 'GER30', 'GER'],
          'UK100':  ['FTSE100', 'UKX'],
          'JP225':  ['JPN225', 'NIKKEI', 'N225'],
        };
        const knownAliases = ALIASES[sym] || [];
        for (const alias of knownAliases) {
          symVariants.push(alias);
          symVariants.push(alias.replace('/', ''));
        }

        // Deduplicate while preserving order
        const seen = new Set<string>();
        const uniqueVariants = symVariants.filter(v => { if (seen.has(v)) return false; seen.add(v); return true; });

        console.log('[TradeLocker] Trying symbol variants:', uniqueVariants.slice(0, 10));

        let matchedInstrument: any = null;
        for (const variant of uniqueVariants) {
          const found = instruments.find((inst: any) => {
            const instName = (inst.name || inst.symbol || '').toUpperCase().replace(/\s/g, '');
            const instDesc = (inst.description || inst.fullName || '').toUpperCase().replace(/\s/g, '');
            const v = variant.toUpperCase().replace(/\s/g, '');
            return instName === v || instDesc === v;
          });
          if (found) {
            matchedInstrument = found;
            console.log('[TradeLocker] Matched symbol variant:', variant, '→', found.name, 'tradableInstrumentId:', found.tradableInstrumentId || found.id);
            break;
          }
        }

        if (matchedInstrument) {
          tradableInstrumentId = matchedInstrument.tradableInstrumentId || matchedInstrument.id;
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

      // If still not found, log available instrument names to help diagnose
      if (!tradableInstrumentId) {
        const availableNames = Array.isArray(instruments)
          ? instruments.slice(0, 30).map((i: any) => i.name || i.symbol).filter(Boolean).join(', ')
          : 'none';
        throw new Error(
          `Instrument not found: ${order.symbol}. Available symbols (first 30): ${availableNames}. ` +
          `Check the Instruments button on your TradeLocker connection to see exact names.`
        );
      }
      
      if (!routeId) {
        // Default routeId if not found - typically 1 for TRADE
        routeId = 1;
        console.log('[TradeLocker] Using default routeId:', routeId);
      }
      
      // Build the order payload per TradeLocker API spec
      // Note: routeId should be numeric from the routes array, but we also try "TRADE" string as fallback
      const orderPayload: any = {
        tradableInstrumentId,
        routeId: routeId || "TRADE",  // Use numeric routeId or string "TRADE" as fallback
        qty: order.quantity,
        side: order.side,
        type: order.type,
        validity: order.type === 'market' ? 'IOC' : 'GTC',
        price: 0,  // Required field - 0 for market orders
      };
      
      // Add price for limit orders (override the 0)
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
      
      // Check if TradeLocker returned an error in the structured response
      if (data.s !== 'ok') {
        // Capture as much error detail as possible - TradeLocker uses 'errmsg' field
        const errorDetails = [];
        if (data.errmsg) errorDetails.push(data.errmsg);
        if (data.d?.errmsg) errorDetails.push(data.d.errmsg);
        if (data.d?.message) errorDetails.push(data.d.message);
        if (data.d?.messages && Array.isArray(data.d.messages)) errorDetails.push(...data.d.messages);
        if (data.d?.error) errorDetails.push(data.d.error);
        if (data.d?.errorCode) errorDetails.push(`Code: ${data.d.errorCode}`);
        if (data.message) errorDetails.push(data.message);
        if (data.error) errorDetails.push(data.error);
        
        // If still no error details, include the raw response
        const errorMsg = errorDetails.length > 0 
          ? errorDetails.join(' | ') 
          : `Rejected (status: ${data.s}, raw: ${responseText.substring(0, 200)})`;
        
        console.log('[TradeLocker] Order rejected - Full response:', responseText);
        console.log('[TradeLocker] Parsed error:', errorMsg);
        return {
          orderId: '',
          status: 'rejected',
          message: errorMsg,
        };
      }
      
      // Verify we actually got an orderId back
      const orderId = data.d?.orderId || data.d?.id || data.orderId || data.id;
      if (!orderId) {
        console.log('[TradeLocker] No orderId in response:', data);
        return {
          orderId: '',
          status: 'rejected',
          message: 'No order ID returned - order may not have been placed',
        };
      }
      
      console.log('[TradeLocker] Order successfully placed with orderId:', orderId);
      return {
        orderId: orderId.toString(),
        status: 'submitted',
        filledQuantity: data.d?.filledQty || data.filledQuantity,
        filledPrice: data.d?.avgPrice || data.filledPrice,
        message: 'Order placed successfully',
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
    accNum?: string | null;
    accessToken?: string | null;
    refreshToken?: string | null;
    tokenExpiresAt?: Date | null;
    id?: number;
  },
  signal: {
    action: string;
    symbol: string;
    direction: string;
    volume: number;
    entryPrice?: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
    positionId?: string | null;
  }
): Promise<{ success: boolean; orderId?: string; error?: string; message?: string }> {
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
      connection.serverId,
      connection.accNum || undefined
    );

    console.log('[TradeLocker Execute] Authenticating with credentials');
    const password = decryptPassword(connection.encryptedPassword);
    await service.authenticate(connection.email, password);
    console.log('[TradeLocker Execute] Authentication successful');

    const resolvedAccNum = service.getResolvedAccNum();
    if (connection.id && resolvedAccNum && resolvedAccNum !== '0' && resolvedAccNum !== connection.accNum) {
      try {
        const { storage } = await import('./storage');
        await storage.updateTradelockerConnection(connection.id, { accNum: resolvedAccNum } as any);
        console.log('[TradeLocker Execute] Cached accNum:', resolvedAccNum, 'to database');
      } catch (e) {
        console.log('[TradeLocker Execute] Could not cache accNum to database');
      }
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
        stopLoss: signal.stopLoss || undefined,
        takeProfit: signal.takeProfit || undefined,
      });
      console.log('[TradeLocker Execute] Order result:', orderResult);

      return {
        success: orderResult.status !== 'rejected',
        orderId: orderResult.orderId,
        error: orderResult.status === 'rejected' ? orderResult.message : undefined,
      };
    } else if (signal.action === 'CLOSE' || signal.action.toUpperCase() === 'CLOSE') {
      console.log('[TradeLocker Execute] Closing position:', signal.positionId);
      if (!signal.positionId) {
        return { success: false, error: 'Position ID required for close action' };
      }
      const closeResult = await service.closePosition(signal.positionId);
      return {
        success: true,
        orderId: closeResult.orderId,
      };
    } else if (signal.action === 'MODIFY' || signal.action.toUpperCase() === 'MODIFY') {
      console.log('[TradeLocker Execute] Modify action requested (not fully supported by TradeLocker API via position ID)');
      return {
        success: true,
        message: 'Modify signals are primarily handled by MT5 EA. TradeLocker modify skipped.',
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
