import crypto from 'crypto';

const IV_LENGTH = 16;

// Default key used when TRADELOCKER_ENCRYPTION_KEY env var is not set.
// Override this in Render → Environment → TRADELOCKER_ENCRYPTION_KEY for production.
const DEFAULT_ENCRYPTION_KEY = 'vedd-tl-default-key-change-me-32chars!!';

function getEncryptionKey(): string {
  const key = process.env.TRADELOCKER_ENCRYPTION_KEY;
  if (!key) {
    console.warn('[TradeLocker] TRADELOCKER_ENCRYPTION_KEY not set — using default key. Set it in your Render environment variables.');
    return DEFAULT_ENCRYPTION_KEY;
  }
  if (key.length < 32) {
    console.warn('[TradeLocker] TRADELOCKER_ENCRYPTION_KEY is too short, padding to 32 chars.');
    return key.padEnd(32, '0');
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

const INSTRUMENT_CACHE_TTL = 10 * 60 * 1000;
const instrumentCache = new Map<string, { tradableInstrumentId: number; routeId: number; cachedAt: number }>();

const serviceCache = new Map<number, { service: TradeLockerService; createdAt: number }>();
const SERVICE_CACHE_TTL = 50 * 60 * 1000;

const RETRY_DELAYS = [1000, 2000];
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

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
  private connectionId: number | null = null;
  private accountDetailsConfig: any[] | null = null; // cached column spec from /trade/config
  onTokenRefresh: ((accessToken: string, refreshToken: string, expiresIn: number) => void) | null = null;
  onReauthenticate: (() => Promise<void>) | null = null;

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
        signal: AbortSignal.timeout(8000),
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

    // Probe only 2 accNums to avoid slow timeout chains
    console.log('[TradeLocker] All-accounts returned empty, probing accNum values...');
    for (const testNum of ['1', '2']) {
      try {
        const testResponse = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/instruments`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'accNum': testNum,
          },
          signal: AbortSignal.timeout(5000),
        });

        if (testResponse.ok) {
          this.accNum = testNum;
          this.accNumResolved = true;
          console.log('[TradeLocker] Probing found valid accNum:', testNum);
          return this.accNum;
        }
        console.log(`[TradeLocker] accNum ${testNum} failed: ${testResponse.status}`);
      } catch (err) {
        console.log(`[TradeLocker] accNum ${testNum} probe error`);
      }
    }

    this.accNum = '1';
    this.accNumResolved = true; // mark resolved so we never probe again for this service instance
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
        signal: AbortSignal.timeout(12000),
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
        signal: AbortSignal.timeout(10000),
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

    const TOKEN_BUFFER = 60 * 1000;
    if (this.tokenExpiresAt && (new Date().getTime() + TOKEN_BUFFER) >= this.tokenExpiresAt.getTime() && this.refreshToken) {
      const result = await this.refreshAccessToken(this.refreshToken);
      if (this.onTokenRefresh) {
        this.onTokenRefresh(result.accessToken, result.refreshToken, result.expiresIn);
      }
    }
  }

  /**
   * Loads & caches the accountDetailsConfig column spec from /trade/config.
   * The /state endpoint returns accountDetailsData as a flat array whose
   * positions map to these columns (by `id`), so we need this to read balance.
   */
  private async loadAccountDetailsConfig(accNum: string): Promise<any[]> {
    if (this.accountDetailsConfig) return this.accountDetailsConfig;
    const res = await fetch(`${this.baseUrl}/trade/config`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        'accNum': accNum,
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`config ${res.status}`);
    const json = await res.json();
    const cols = json?.d?.accountDetailsConfig ?? json?.accountDetailsConfig ?? [];
    this.accountDetailsConfig = cols;
    return cols;
  }

  /** Normalize a label for fuzzy matching: lowercase, strip all non-alphanumerics */
  private normLabel(s: any): string {
    return (s ?? '').toString().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  /** Finds the value in a flat state-data array for a column matching any candidate id/title.
   *  Matching is normalized (case/space/punctuation-insensitive) with exact-first then substring. */
  private pickStateValue(cols: any[], data: any[], candidates: string[]): number | null {
    const normCands = candidates.map(c => this.normLabel(c));
    // Pass 1: exact normalized match on id or title
    for (const cand of normCands) {
      const idx = cols.findIndex((c: any) =>
        this.normLabel(c?.id) === cand || this.normLabel(c?.title) === cand
      );
      if (idx >= 0 && data[idx] != null) {
        const n = parseFloat(data[idx]);
        if (!isNaN(n)) return n;
      }
    }
    // Pass 2: substring match (e.g. title "Account Balance" contains "balance")
    for (const cand of normCands) {
      const idx = cols.findIndex((c: any) => {
        const id = this.normLabel(c?.id), title = this.normLabel(c?.title);
        return (id && (id === cand || id.includes(cand))) || (title && (title === cand || title.includes(cand)));
      });
      if (idx >= 0 && data[idx] != null) {
        const n = parseFloat(data[idx]);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  /** Finds a value in an object-form state payload by normalized key match. */
  private pickObjValue(obj: Record<string, any>, candidates: string[]): number | null {
    const keys = Object.keys(obj);
    const normCands = candidates.map(c => this.normLabel(c));
    for (const cand of normCands) {
      // exact first, then substring
      let k = keys.find(key => this.normLabel(key) === cand);
      if (!k) k = keys.find(key => this.normLabel(key).includes(cand));
      if (k && obj[k] != null) {
        const n = parseFloat(obj[k]);
        if (!isNaN(n)) return n;
      }
    }
    return null;
  }

  async getAccountInfo(): Promise<TradeLockerAccountInfo> {
    await this.ensureAuthenticated();

    // Use the cached accNum resolved during authenticate() — resolve lazily if needed
    if (!this.accNumResolved || this.accNum === '0') {
      await this.resolveAccNum();
    }
    const accNum = this.accNum;
    console.log('[TradeLocker] getAccountInfo using accNum:', accNum, 'for accountId:', this.accountId);

    // ── Primary: /state endpoint mapped via /config columns (live balance/equity) ──
    // Config failure must NOT kill the state fetch — catch it independently.
    try {
      const [cols, stateRes] = await Promise.all([
        this.loadAccountDetailsConfig(accNum).catch((e) => {
          console.log('[TradeLocker] /config columns failed:', e instanceof Error ? e.message : e);
          return [] as any[];
        }),
        fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/state`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'accNum': accNum,
          },
          signal: AbortSignal.timeout(8000),
        }),
      ]);

      if (stateRes.ok) {
        const stateJson = await stateRes.json();
        const raw = stateJson?.d?.accountDetailsData ?? stateJson?.accountDetailsData;

        let balance: number | null = null, equity: number | null = null;
        let usedMargin: number | null = null, freeMargin: number | null = null;

        if (Array.isArray(raw) && raw.length && Array.isArray(cols) && cols.length) {
          // Flat array mapped via column spec
          balance    = this.pickStateValue(cols, raw, ['balance', 'accountbalance']);
          equity     = this.pickStateValue(cols, raw, ['equity', 'projectedbalance']);
          usedMargin = this.pickStateValue(cols, raw, ['marginused', 'usedmargin', 'blockedbalance', 'margin']);
          freeMargin = this.pickStateValue(cols, raw, ['availablefunds', 'marginavailable', 'freemargin']);
        } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          // Object keyed by column id (some TL server versions return this shape)
          balance    = this.pickObjValue(raw, ['balance', 'accountbalance']);
          equity     = this.pickObjValue(raw, ['equity', 'projectedbalance']);
          usedMargin = this.pickObjValue(raw, ['marginused', 'usedmargin', 'blockedbalance', 'margin']);
          freeMargin = this.pickObjValue(raw, ['availablefunds', 'marginavailable', 'freemargin']);
        } else {
          console.log('[TradeLocker] /state shape unexpected — cols:', Array.isArray(cols) ? cols.length : typeof cols, 'data:', Array.isArray(raw) ? `array[${raw.length}]` : typeof raw);
        }

        if (balance != null) {
          console.log('[TradeLocker] getAccountInfo via /state — balance:', balance, 'equity:', equity);
          return {
            accountId:  this.accountId,
            balance,
            equity:     equity ?? balance,
            margin:     usedMargin ?? 0,
            freeMargin: freeMargin ?? equity ?? balance,
            currency:   'USD',
          };
        }
        console.log('[TradeLocker] /state returned but could not map balance; falling back to /accounts list');
      } else {
        console.log('[TradeLocker] /state endpoint status:', stateRes.status, '— falling back to /accounts list');
      }
    } catch (stateErr) {
      console.log('[TradeLocker] /state path failed, falling back to /accounts list:', stateErr instanceof Error ? stateErr.message : stateErr);
    }

    // ── Fallback: /trade/accounts list (unwrap d.accounts, match by accountId) ──
    try {
      const response = await fetch(`${this.baseUrl}/trade/accounts`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': accNum,
        },
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.log('[TradeLocker] Account details error:', errorText);
        throw new Error(`Failed to get account info: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      console.log('[TradeLocker] Account details (list):', JSON.stringify(data));

      // Unwrap the nested { d: { accounts: [...] } } shape (same as resolveAccNum)
      const accounts = Array.isArray(data) ? data : (data.accounts || data.d?.accounts || []);
      const accountData =
        accounts.find((a: any) =>
          a.id?.toString() === this.accountId || a.accountId?.toString() === this.accountId
        ) || accounts[0] || (Array.isArray(data) ? data[0] : data);

      // TradeLocker list rows expose balance under a few possible keys
      const balance = parseFloat(
        accountData?.accountBalance ?? accountData?.balance ?? accountData?.projectedBalance ?? 0
      ) || 0;

      return {
        accountId:  accountData?.id?.toString() || this.accountId,
        balance,
        equity:     parseFloat(accountData?.projectedBalance ?? accountData?.equity ?? balance) || balance,
        margin:     parseFloat(accountData?.usedMargin ?? accountData?.margin ?? 0) || 0,
        freeMargin: parseFloat(accountData?.availableFunds ?? accountData?.freeMargin ?? balance) || balance,
        currency:   accountData?.currency || 'USD',
      };
    } catch (error) {
      console.error('TradeLocker get account info error:', error);
      throw error;
    }
  }

  /** Diagnostic: returns the raw shapes of /config, /state and /accounts for debugging balance issues. */
  async debugAccountState(): Promise<any> {
    await this.ensureAuthenticated();
    if (!this.accNumResolved || this.accNum === '0') await this.resolveAccNum();
    const accNum = this.accNum;
    const hdrs = {
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
      'accNum': accNum,
    };
    const out: any = { accountId: this.accountId, accNum, baseUrl: this.baseUrl };

    try {
      const r = await fetch(`${this.baseUrl}/trade/config`, { method: 'GET', headers: hdrs, signal: AbortSignal.timeout(8000) });
      out.configStatus = r.status;
      if (r.ok) {
        const j = await r.json();
        const cols = j?.d?.accountDetailsConfig ?? j?.accountDetailsConfig ?? [];
        out.configColumns = Array.isArray(cols) ? cols.map((c: any) => ({ id: c?.id, title: c?.title })) : cols;
      }
    } catch (e: any) { out.configError = e?.message ?? String(e); }

    try {
      const r = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/state`, { method: 'GET', headers: hdrs, signal: AbortSignal.timeout(8000) });
      out.stateStatus = r.status;
      if (r.ok) {
        const j = await r.json();
        out.stateData = j?.d?.accountDetailsData ?? j?.accountDetailsData ?? null;
        out.stateDataType = Array.isArray(out.stateData) ? `array[${out.stateData.length}]` : typeof out.stateData;
      } else {
        out.stateBody = (await r.text()).slice(0, 300);
      }
    } catch (e: any) { out.stateError = e?.message ?? String(e); }

    try {
      const r = await fetch(`${this.baseUrl}/trade/accounts`, { method: 'GET', headers: hdrs, signal: AbortSignal.timeout(8000) });
      out.accountsStatus = r.status;
      if (r.ok) {
        const j = await r.json();
        const accts = Array.isArray(j) ? j : (j.accounts || j.d?.accounts || []);
        out.accountsSample = Array.isArray(accts) ? accts.slice(0, 3) : accts;
      }
    } catch (e: any) { out.accountsError = e?.message ?? String(e); }

    return out;
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
        signal: AbortSignal.timeout(10000),
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

    // Resolve accNum only if not yet done (avoids redundant round-trips on every order)
    if (!this.accNumResolved || this.accNum === '0') {
      await this.resolveAccNum();
    }

    try {
      console.log('[TradeLocker] Placing order with accNum:', this.accNum, '(type:', typeof this.accNum, ') accountId:', this.accountId);
      console.log('[TradeLocker] Order details:', order);
      
      let tradableInstrumentId: number | null = null;
      let routeId: number | null = null;

      const instCacheKey = `${this.baseUrl}:${this.accountId}:${order.symbol.toUpperCase()}`;
      const cachedInst = instrumentCache.get(instCacheKey);
      if (cachedInst && Date.now() - cachedInst.cachedAt < INSTRUMENT_CACHE_TTL) {
        tradableInstrumentId = cachedInst.tradableInstrumentId;
        routeId = cachedInst.routeId;
        console.log('[TradeLocker] Instrument cache HIT:', order.symbol, '→ id:', tradableInstrumentId, 'route:', routeId);
      } else {
        console.log('[TradeLocker] Instrument cache MISS — fetching instruments...');
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
        
        const instruments = instrumentsData.d?.instruments || instrumentsData.instruments || instrumentsData;
        const routes = instrumentsData.d?.routes || instrumentsData.routes || [];
        
        if (Array.isArray(instruments)) {
          const sym = order.symbol.toUpperCase();
          const symVariants: string[] = [sym];

          const suffixes = ['.pro', 'm', '.m', '.z', '.a', '.b', '.c', '.r', '_raw', '.ecn', '.stp', '.pro+', 'PRO'];
          for (const sfx of suffixes) {
            symVariants.push(sym + sfx.toUpperCase());
            symVariants.push(sym + sfx);
          }

          const strippedSym = sym.replace(/[._]?(PRO|ECN|STP|RAW|M|Z|A|B|C|R)\+?$/i, '');
          if (strippedSym !== sym) symVariants.push(strippedSym);

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

            const instRoutes: any[] = Array.isArray(matchedInstrument.routes) ? matchedInstrument.routes : [];
            console.log('[TradeLocker] Instrument routes:', JSON.stringify(instRoutes));
            if (instRoutes.length > 0) {
              const tradeRoute = instRoutes.find((r: any) => r.type === 'TRADE' || r.name === 'TRADE')
                ?? instRoutes[0];
              routeId = tradeRoute.id;
              console.log('[TradeLocker] Using routeId', routeId, 'from instrument routes');
            }
          }

          if (Array.isArray(instruments) && instruments.length > 0) {
            const sample = instruments.find((i: any) => (i.name || i.symbol || '').toUpperCase().includes(order.symbol.toUpperCase().slice(0, 3))) || instruments[0];
            console.log('[TradeLocker] Sample instrument structure:', JSON.stringify(sample));
          }
        }

        if (!routeId && Array.isArray(routes) && routes.length > 0) {
          const tradeRoute = routes.find((r: any) => r.name === 'TRADE' || r.type === 'TRADE') ?? routes[0];
          routeId = tradeRoute.id;
          console.log('[TradeLocker] Using routeId', routeId, 'from global routes fallback');
        }

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
          routeId = 1;
          console.warn('[TradeLocker] WARNING: Could not find routeId from instrument or global routes. Defaulting to 1 — may cause "route forbidden".');
        }

        instrumentCache.set(instCacheKey, { tradableInstrumentId, routeId, cachedAt: Date.now() });
        console.log('[TradeLocker] Instrument cached:', order.symbol, '→ id:', tradableInstrumentId, 'route:', routeId);
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
      
      // Add price for limit and stop orders (override the 0)
      if ((order.type === 'limit' || order.type === 'stop') && order.price) {
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
      
      let response: Response | null = null;
      let responseText = '';
      let lastError: Error | null = null;

      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          response = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/orders`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${this.accessToken}`,
              'Content-Type': 'application/json',
              'accNum': this.accNum,
            },
            body: JSON.stringify(orderPayload),
          });

          responseText = await response.text();
          console.log(`[TradeLocker] Order response (attempt ${attempt + 1}): status=${response.status} body=${responseText.substring(0, 300)}`);

          if (response.ok) break;

          if (response.status === 401 && attempt < RETRY_DELAYS.length) {
            console.log('[TradeLocker] 401 on order — forcing full re-auth before retry...');
            try {
              if (this.onReauthenticate) {
                await this.onReauthenticate();
              } else if (this.refreshToken) {
                const result = await this.refreshAccessToken(this.refreshToken);
                if (this.onTokenRefresh) {
                  this.onTokenRefresh(result.accessToken, result.refreshToken, result.expiresIn);
                }
              }
            } catch (authErr) {
              console.log('[TradeLocker] Re-auth failed during 401 retry:', (authErr as Error).message);
            }
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
            continue;
          }

          if (RETRYABLE_STATUSES.has(response.status) && attempt < RETRY_DELAYS.length) {
            console.log(`[TradeLocker] Retryable status ${response.status} — waiting ${RETRY_DELAYS[attempt]}ms before retry ${attempt + 2}...`);
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
            continue;
          }

          throw new Error(`Order placement failed: ${response.status} - ${responseText}`);
        } catch (err) {
          lastError = err as Error;
          if (attempt < RETRY_DELAYS.length && !responseText) {
            console.log(`[TradeLocker] Network error on attempt ${attempt + 1}: ${lastError.message} — retrying in ${RETRY_DELAYS[attempt]}ms...`);
            await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
            continue;
          }
          throw lastError;
        }
      }

      if (!response || !response.ok) {
        throw lastError || new Error('Order placement failed after retries');
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

  /**
   * Fetch OHLCV candlestick bars for a symbol from TradeLocker.
   * Returns candles in ascending time order (oldest first), same shape as MT5 cache:
   * { t, o, h, l, c, v }
   */
  async getCandlesticks(symbol: string, resolutionMinutes: number = 5, fromTs?: number, toTs?: number): Promise<any[]> {
    await this.ensureAuthenticated();
    await this.resolveAccNum();

    // Resolve tradableInstrumentId via instrument lookup (reuse placeOrder cache key)
    const instCacheKey = `${this.baseUrl}:${this.accountId}:${symbol.toUpperCase()}`;
    let tradableInstrumentId: number | null = null;
    const cached = instrumentCache.get(instCacheKey);
    if (cached && Date.now() - cached.cachedAt < INSTRUMENT_CACHE_TTL) {
      tradableInstrumentId = cached.tradableInstrumentId;
    } else {
      const instrResp = await fetch(`${this.baseUrl}/trade/accounts/${this.accountId}/instruments`, {
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', 'accNum': this.accNum },
      });
      if (!instrResp.ok) throw new Error(`TradeLocker instruments error: ${instrResp.status}`);
      const instrData = await instrResp.json();
      const instruments: any[] = instrData.d?.instruments || instrData.instruments || instrData || [];
      const sym = symbol.toUpperCase();
      const ALIASES: Record<string, string[]> = {
        'XAUUSD': ['GOLD', 'XAU/USD'], 'NAS100': ['USTEC', 'US100', 'NDX100'],
        'US30': ['DJ30', 'WALLST30'], 'US500': ['SPX500', 'SP500', 'SPX'],
      };
      const variants = [sym, ...(ALIASES[sym] || [])];
      let matched: any = null;
      for (const v of variants) {
        matched = instruments.find((i: any) => (i.name || i.symbol || '').toUpperCase().replace(/\s/g, '') === v.replace(/\s/g, ''));
        if (matched) break;
      }
      if (!matched) throw new Error(`Instrument not found in TradeLocker: ${symbol}`);
      tradableInstrumentId = matched.tradableInstrumentId || matched.id;
      const routes: any[] = Array.isArray(matched.routes) ? matched.routes : [];
      const routeId = (routes.find((r: any) => r.type === 'TRADE' || r.name === 'TRADE') ?? routes[0])?.id ?? 1;
      instrumentCache.set(instCacheKey, { tradableInstrumentId: tradableInstrumentId!, routeId, cachedAt: Date.now() });
    }

    // TL resolution string: 1, 5, 15, 60, 1D etc.
    const resolution = resolutionMinutes >= 1440 ? '1D' : resolutionMinutes >= 60 ? String(resolutionMinutes / 60) + 'H' : String(resolutionMinutes);
    const now = Math.floor(Date.now() / 1000);
    const startTime = fromTs ?? (now - 86400); // default: last 24h
    const endTime = toTs ?? now;

    const url = `${this.baseUrl}/trade/accounts/${this.accountId}/instruments/${tradableInstrumentId}/history` +
      `?resolution=${resolution}&startTime=${startTime}&endTime=${endTime}`;

    const histResp = await fetch(url, {
      headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', 'accNum': this.accNum },
    });
    if (!histResp.ok) {
      const txt = await histResp.text();
      throw new Error(`TradeLocker history error: ${histResp.status} — ${txt}`);
    }
    const histData = await histResp.json();

    // Normalise to { t, o, h, l, c, v } ascending
    const bars: any[] = histData.d?.bars || histData.bars || histData || [];
    return bars.map((b: any) => ({
      t: b.time ?? b.t ?? b.timestamp ?? 0,
      o: b.open  ?? b.o ?? 0,
      h: b.high  ?? b.h ?? 0,
      l: b.low   ?? b.l ?? 0,
      c: b.close ?? b.c ?? 0,
      v: b.volume ?? b.v ?? 0,
    })).sort((a, b) => a.t - b.t);
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

  /**
   * Fetch filled/closed orders from TradeLocker for a given day.
   * Tries GET /trade/accounts/{id}/orders with status filters.
   * Returns normalised array: { id, symbol, side, profit, closeTime, qty }
   */
  async getFilledOrders(fromTs?: number): Promise<any[]> {
    await this.ensureAuthenticated();
    try {
      // TradeLocker order history endpoint — try with status param first
      const base = `${this.baseUrl}/trade/accounts/${this.accountId}/orders`;
      const params = new URLSearchParams({ status: 'Filled' });
      if (fromTs) params.set('from', String(fromTs));
      const response = await fetch(`${base}?${params.toString()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': this.accNum,
        },
      });
      if (!response.ok) {
        // Some TL instances use lowercase status or different endpoint path
        const response2 = await fetch(`${base}?status=filled`, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'accNum': this.accNum,
          },
        });
        if (!response2.ok) return [];
        const data2 = await response2.json();
        const orders2: any[] = Array.isArray(data2) ? data2 : (data2?.d?.orders || data2?.orders || []);
        return this._normaliseOrders(orders2, fromTs);
      }
      const data = await response.json();
      const orders: any[] = Array.isArray(data) ? data : (data?.d?.orders || data?.orders || []);
      return this._normaliseOrders(orders, fromTs);
    } catch (err) {
      console.error('[TradeLocker] getFilledOrders error:', (err as Error).message);
      return [];
    }
  }

  private _normaliseOrders(orders: any[], fromTs?: number): any[] {
    return orders
      .map((o: any) => ({
        id: o.id || o.orderId || o.positionId,
        symbol: o.instrument || o.symbol || '',
        side: o.side || o.direction || '',
        profit: parseFloat(o.profit ?? o.pnl ?? o.grossProfit ?? 0),
        closeTime: o.closedAt || o.updatedAt || o.timestamp || null,
        qty: o.qty || o.quantity || o.volume || 0,
      }))
      .filter((o: any) => {
        if (!fromTs) return true;
        if (!o.closeTime) return true; // include if no timestamp
        return new Date(o.closeTime).getTime() >= fromTs * 1000;
      });
  }

  /**
   * Fetch CLOSED positions (realized P&L) — tries multiple endpoint patterns.
   * Returns normalized array: { id, symbol, side, profit, openPrice, closePrice, closeTime }
   */
  async getClosedPositions(fromTs?: number): Promise<any[]> {
    await this.ensureAuthenticated();
    const base = `${this.baseUrl}/trade/accounts/${this.accountId}/positions`;
    const tryFetch = async (url: string) => {
      const r = await fetch(url, {
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', 'accNum': this.accNum },
      });
      if (!r.ok) return null;
      const d = await r.json();
      return Array.isArray(d) ? d : (d?.d?.positions || d?.positions || d?.data || null);
    };
    try {
      // Try several common closed-positions endpoint patterns
      const results = await tryFetch(`${base}?status=Closed`) ??
                      await tryFetch(`${base}?status=closed`) ??
                      await tryFetch(`${base}/history`) ??
                      await tryFetch(`${this.baseUrl}/trade/accounts/${this.accountId}/history`) ??
                      [];
      return this._normaliseOrders(results as any[], fromTs);
    } catch (err) {
      console.error('[TradeLocker] getClosedPositions error:', (err as Error).message);
      return [];
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

      const data = await response.json();
      return Array.isArray(data) ? data : (data?.d?.positions || data?.positions || []);
    } catch (error) {
      console.error('TradeLocker get positions error:', error);
      throw error;
    }
  }

  // Normalized open positions — handles BOTH response shapes TradeLocker uses:
  // object rows (named fields) and column-array rows (order defined by
  // /trade/config's positionsConfig). Also maps tradableInstrumentId → symbol
  // via the instruments list so the UI can show real pair names.
  async getPositionsNormalized(): Promise<Array<{
    id: string; symbol: string; side: string; qty: number;
    avgPrice: number; unrealizedPl: number; openDate?: string;
  }>> {
    const raw = await this.getPositions();
    if (!raw || raw.length === 0) return [];

    // Build instrument id → name map (cached instruments fetch)
    let instMap = new Map<string, string>();
    try {
      const instruments = await this.getInstruments();
      for (const inst of instruments) {
        const id = String(inst.tradableInstrumentId ?? inst.id ?? '');
        if (id) instMap.set(id, inst.name || inst.symbol || id);
      }
    } catch { /* symbol names degrade to instrument ids */ }

    const norm = (v: any) => parseFloat(v) || 0;

    if (!Array.isArray(raw[0])) {
      // Object rows
      return raw.map((p: any) => ({
        id: String(p.id ?? p.positionId ?? ''),
        symbol: p.s || p.symbol || instMap.get(String(p.tradableInstrumentId ?? '')) || String(p.tradableInstrumentId ?? ''),
        side: (p.side || '').toString().toLowerCase(),
        qty: norm(p.qty),
        avgPrice: norm(p.avgPrice ?? p.openPrice ?? p.price),
        unrealizedPl: norm(p.unrealizedPl ?? p.unrealizedPnL ?? p.uPnL ?? p.pl),
        openDate: p.openDate || p.createdDate || undefined,
      }));
    }

    // Column-array rows — resolve column order from /trade/config positionsConfig
    let columns: string[] = [];
    try {
      await this.ensureAuthenticated();
      const cfgRes = await fetch(`${this.baseUrl}/trade/config`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${this.accessToken}`, 'Content-Type': 'application/json', 'accNum': this.accNum },
        signal: AbortSignal.timeout(10000),
      });
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        const cols = cfg?.d?.positionsConfig?.columns || cfg?.positionsConfig?.columns || [];
        columns = cols.map((c: any) => String(c.id || c.name || '').toLowerCase());
      }
    } catch { /* fall through to positional defaults below */ }

    const idx = (candidates: string[]) => columns.findIndex(c => candidates.some(k => c.includes(k)));
    const iId = idx(['id']);
    const iInst = idx(['tradableinstrument']);
    const iSide = idx(['side']);
    const iQty = idx(['qty', 'quantity']);
    const iAvg = idx(['avgprice', 'openprice', 'price']);
    const iPl = idx(['unrealized', 'pnl', 'pl']);
    const iDate = idx(['opendate', 'date']);

    return raw.map((row: any[]) => {
      const instId = iInst >= 0 ? String(row[iInst]) : '';
      return {
        id: iId >= 0 ? String(row[iId]) : '',
        symbol: instMap.get(instId) || instId,
        side: iSide >= 0 ? String(row[iSide]).toLowerCase() : '',
        qty: iQty >= 0 ? norm(row[iQty]) : 0,
        avgPrice: iAvg >= 0 ? norm(row[iAvg]) : 0,
        unrealizedPl: iPl >= 0 ? norm(row[iPl]) : 0,
        openDate: iDate >= 0 ? String(row[iDate]) : undefined,
      };
    });
  }

  async modifyPosition(
    positionId: string,
    stopLoss?: number,
    takeProfit?: number
  ): Promise<{ success: boolean; error?: string }> {
    await this.ensureAuthenticated();

    const body: Record<string, number> = {};
    if (typeof stopLoss === 'number' && stopLoss > 0) body.stopLoss = stopLoss;
    if (typeof takeProfit === 'number' && takeProfit > 0) body.takeProfit = takeProfit;

    if (Object.keys(body).length === 0) {
      return { success: false, error: 'No SL or TP provided to modify' };
    }

    const url = `${this.baseUrl}/trade/accounts/${this.accountId}/positions/${positionId}`;
    console.log(`[TradeLocker Modify] PATCH ${url} | SL=${stopLoss} TP=${takeProfit} accNum=${this.accNum}`);

    try {
      const response = await fetch(url, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
          'accNum': this.accNum,
        },
        body: JSON.stringify(body),
      });

      if (response.status === 405) {
        console.log('[TradeLocker Modify] PATCH not supported, trying PUT');
        const putResponse = await fetch(url, {
          method: 'PUT',
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Content-Type': 'application/json',
            'accNum': this.accNum,
          },
          body: JSON.stringify(body),
        });
        if (!putResponse.ok) {
          const errText = await putResponse.text();
          console.log(`[TradeLocker Modify] PUT failed: ${putResponse.status} - ${errText}`);
          return { success: false, error: `Modify failed: ${putResponse.status} - ${errText}` };
        }
        console.log('[TradeLocker Modify] PUT success');
        return { success: true };
      }

      if (!response.ok) {
        const errText = await response.text();
        console.log(`[TradeLocker Modify] PATCH failed: ${response.status} - ${errText}`);
        return { success: false, error: `Modify failed: ${response.status} - ${errText}` };
      }

      console.log('[TradeLocker Modify] PATCH success');
      return { success: true };
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[TradeLocker Modify] Exception:', msg);
      return { success: false, error: msg };
    }
  }
}

type TLConnection = {
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
};

export async function getOrCreateService(connection: TLConnection): Promise<TradeLockerService> {
  const connId = connection.id || 0;
  const cached = serviceCache.get(connId);
  if (cached && Date.now() - cached.createdAt < SERVICE_CACHE_TTL) {
    console.log('[TradeLocker] Reusing cached service for connection', connId);
    return cached.service;
  }

  const service = new TradeLockerService(
    connection.accountType as 'demo' | 'live',
    connection.accountId,
    connection.serverId,
    connection.accNum || undefined
  );

  const TOKEN_BUFFER = 60 * 1000;
  const hasValidToken = connection.accessToken &&
    connection.tokenExpiresAt &&
    new Date(connection.tokenExpiresAt).getTime() - TOKEN_BUFFER > Date.now();

  if (hasValidToken) {
    console.log('[TradeLocker] Using cached JWT tokens (expires:', connection.tokenExpiresAt, ')');
    service.setTokens(
      connection.accessToken!,
      connection.refreshToken || '',
      new Date(connection.tokenExpiresAt!)
    );
    // accNum resolved by constructor when connection.accNum is set in DB — no extra network call needed.
    // Methods that need accNum (placeOrder, getAccountInfo) call resolveAccNum() lazily if still unresolved.
  } else if (connection.refreshToken && connection.accessToken) {
    console.log('[TradeLocker] Token expired — attempting refresh...');
    try {
      service.setTokens(connection.accessToken, connection.refreshToken);
      const refreshed = await service.refreshAccessToken(connection.refreshToken);
      await persistTokens(connection, refreshed.accessToken, refreshed.refreshToken, refreshed.expiresIn, service.getResolvedAccNum());
    } catch (refreshErr) {
      console.log('[TradeLocker] Token refresh failed — falling back to full auth');
      const password = decryptPassword(connection.encryptedPassword);
      const authResult = await service.authenticate(connection.email, password);
      await persistTokens(connection, authResult.accessToken, authResult.refreshToken, authResult.expiresIn, service.getResolvedAccNum());
    }
  } else {
    console.log('[TradeLocker] No cached tokens — performing full auth');
    const password = decryptPassword(connection.encryptedPassword);
    const authResult = await service.authenticate(connection.email, password);
    await persistTokens(connection, authResult.accessToken, authResult.refreshToken, authResult.expiresIn, service.getResolvedAccNum());
  }

  // After lazy resolveAccNum completes (e.g. on first placeOrder/getAccountInfo), persist the accNum so
  // future constructor calls skip network resolution entirely.
  if (!connection.accNum && connId) {
    const origResolve = service.resolveAccNum.bind(service);
    service.resolveAccNum = async () => {
      const result = await origResolve();
      if (result && result !== '0' && !connection.accNum) {
        persistTokens(connection, connection.accessToken || '', connection.refreshToken || '', 3600, result).catch(() => {});
      }
      return result;
    };
  }

  service.onTokenRefresh = (accessToken, refreshToken, expiresIn) => {
    persistTokens(connection, accessToken, refreshToken, expiresIn, service.getResolvedAccNum()).catch(() => {});
  };

  service.onReauthenticate = async () => {
    console.log('[TradeLocker] Full re-authentication triggered via callback');
    const password = decryptPassword(connection.encryptedPassword);
    const authResult = await service.authenticate(connection.email, password);
    await persistTokens(connection, authResult.accessToken, authResult.refreshToken, authResult.expiresIn, service.getResolvedAccNum());
  };

  serviceCache.set(connId, { service, createdAt: Date.now() });
  return service;
}

// ── Shared account-value resolver for proportional / risk-% lot sizing ────────
// Returns the TL account's balance AND equity, using a short-TTL cache so trade
// sizing always has a real value (live-fetches if the cache is empty/stale).
// This is the single source of truth both the chart-data path (routes.ts) and
// the live engine (live-trading-engine.ts) use to size copied trades.
const TL_VALUE_TTL = 60 * 1000; // 60s — fresh enough for sizing, light on the API
export async function getTLAccountValue(
  userId: number,
  conn: TLConnection,
): Promise<{ balance: number; equity: number }> {
  const g = global as any;
  g.tlAccountBalances = g.tlAccountBalances || {};
  g.tlAccountBalances[userId] = g.tlAccountBalances[userId] || {};
  g.tlAccountEquity = g.tlAccountEquity || {};
  g.tlAccountEquity[userId] = g.tlAccountEquity[userId] || {};
  g.tlAccountValueAt = g.tlAccountValueAt || {};
  g.tlAccountValueAt[userId] = g.tlAccountValueAt[userId] || {};

  const acctId = conn.accountId;
  const cachedBal = g.tlAccountBalances[userId][acctId];
  const cachedEq  = g.tlAccountEquity[userId][acctId];
  const fetchedAt = g.tlAccountValueAt[userId][acctId] || 0;
  const fresh = Date.now() - fetchedAt < TL_VALUE_TTL;

  if (fresh && typeof cachedBal === 'number' && cachedBal > 0) {
    return { balance: cachedBal, equity: (typeof cachedEq === 'number' && cachedEq > 0) ? cachedEq : cachedBal };
  }

  try {
    const svc = await getOrCreateService(conn);
    const info = await svc.getAccountInfo();
    const bal = info.balance || 0;
    const eq  = info.equity || bal;
    if (bal > 0) {
      g.tlAccountBalances[userId][acctId] = bal;
      g.tlAccountEquity[userId][acctId]   = eq;
      g.tlAccountValueAt[userId][acctId]  = Date.now();
      console.log(`[TL value] ${acctId}: balance=$${bal} equity=$${eq} (live-fetched for sizing)`);
      return { balance: bal, equity: eq };
    }
  } catch (e: any) {
    console.warn(`[TL value] live-fetch failed for ${acctId}:`, e?.message ?? e);
  }
  // Fall back to any stale cache we have, else zeros
  return {
    balance: typeof cachedBal === 'number' ? cachedBal : 0,
    equity:  typeof cachedEq === 'number' ? cachedEq : (typeof cachedBal === 'number' ? cachedBal : 0),
  };
}

async function persistTokens(
  connection: TLConnection,
  accessToken: string,
  refreshToken: string,
  expiresIn: number,
  accNum: string
): Promise<void> {
  if (!connection.id) return;
  try {
    const { storage } = await import('./storage');
    await storage.updateTradelockerConnection(connection.id, {
      accessToken,
      refreshToken,
      tokenExpiresAt: new Date(Date.now() + expiresIn * 1000),
      accNum: accNum !== '0' ? accNum : undefined,
    } as any);
    console.log('[TradeLocker] Persisted tokens to DB for connection', connection.id);
  } catch (e) {
    console.log('[TradeLocker] Could not persist tokens to DB');
  }
}

export async function warmTradeLockerConnection(connection: TLConnection): Promise<{ success: boolean; error?: string }> {
  try {
    console.log('[TradeLocker Warm] Pre-warming connection for account', connection.accountId);
    await getOrCreateService(connection);
    console.log('[TradeLocker Warm] Connection pre-warmed successfully');
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    console.error('[TradeLocker Warm] Pre-warm failed:', msg);
    return { success: false, error: msg };
  }
}

export async function executeMT5SignalOnTradeLocker(
  connection: TLConnection,
  signal: {
    action: string;
    symbol: string;
    direction: string;
    volume: number;
    entryPrice?: number;
    stopLoss?: number | null;
    takeProfit?: number | null;
    positionId?: string | null;
    /** 'market' = immediate fill | 'stop_entry' = BUY/SELL STOP at entryPrice | 'limit_entry' = BUY/SELL LIMIT at entryPrice */
    orderType?: 'market' | 'stop_entry' | 'limit_entry';
  }
): Promise<{ success: boolean; orderId?: string; error?: string; message?: string }> {
  console.log('[TradeLocker Execute] Starting trade execution:', {
    accountType: connection.accountType,
    accountId: connection.accountId,
    serverId: connection.serverId,
    signal: { action: signal.action, symbol: signal.symbol, direction: signal.direction, volume: signal.volume }
  });
  
  try {
    const service = await getOrCreateService(connection);

    if (signal.action === 'OPEN' || signal.action.toUpperCase() === 'OPEN') {
      // Resolve TL order type from signal's orderType field
      const tlOrderType: 'market' | 'limit' | 'stop' =
        signal.orderType === 'limit_entry' ? 'limit' :
        signal.orderType === 'stop_entry'  ? 'stop'  : 'market';

      // stop/limit orders require a price — if missing fall back to market
      const usePrice = (tlOrderType !== 'market') && signal.entryPrice && signal.entryPrice > 0
        ? signal.entryPrice : undefined;
      const resolvedType = usePrice ? tlOrderType : 'market';

      console.log('[TradeLocker Execute] Placing order:', {
        symbol: signal.symbol,
        side: signal.direction.toLowerCase(),
        type: resolvedType,
        price: usePrice,
        quantity: signal.volume,
      });
      const orderResult = await service.placeOrder({
        symbol: signal.symbol,
        side: signal.direction.toLowerCase() as 'buy' | 'sell',
        type: resolvedType,
        quantity: signal.volume,
        price: usePrice,
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
      if (!signal.positionId) {
        return { success: false, error: 'Position ID required for modify action' };
      }
      console.log('[TradeLocker Execute] Modifying position:', {
        positionId: signal.positionId,
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
      });
      const modifyResult = await service.modifyPosition(
        signal.positionId,
        signal.stopLoss != null ? signal.stopLoss : undefined,
        signal.takeProfit != null ? signal.takeProfit : undefined,
      );
      console.log('[TradeLocker Execute] Modify result:', modifyResult);
      return {
        success: modifyResult.success,
        error: modifyResult.error,
      };
    }

    console.log('[TradeLocker Execute] Unknown action type:', signal.action);
    return { success: false, error: `Unknown action type: ${signal.action}` };
  } catch (error) {
    console.error('[TradeLocker Execute] Error:', error);
    if (connection.id) serviceCache.delete(connection.id);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
