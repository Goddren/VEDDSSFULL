// ─── VEDD Moomoo / Futu OpenD Service ──────────────────────────────────────────
// Moomoo (Futu) broker integration for futures trading.
//
// Futu's OpenD daemon communicates over a local TCP socket. This service
// connects to OpenD via its LongPort HTTP/WebSocket gateway when available,
// and falls back to paper-trading mode when no connection is configured.
//
// Setup: Install OpenD from https://openapi.futunn.com/futu-api-doc/en/
//        Set env var MOOMOO_OPEND_URL=http://127.0.0.1:11111 (default OpenD port)
//        Set env var MOOMOO_ACCOUNT_ID=your_account_id
//        Set env var MOOMOO_PAPER_MODE=true to force paper trading

export interface MoomooOrderRequest {
  symbol: string;        // e.g. "NQ", "ES", "GC" — mapped to Futu codes
  direction: 'BUY' | 'SELL';
  contracts: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface MoomooOrderResult {
  success: boolean;
  orderId?: string;
  error?: string;
  isPaper?: boolean;
}

export interface MoomooAccountInfo {
  accountId: string;
  balance: number;
  equity: number;
  unrealizedPnl: number;
  marginUsed: number;
  availableMargin: number;
  currency: string;
  isPaper: boolean;
}

export interface MoomooConnection {
  accountId: string;
  isPaper: boolean;
  openDUrl: string;
}

// ── Symbol mapping: VEDD symbols → Futu/Moomoo contract codes ────────────────
// Moomoo uses standard CME codes with their own notation
const FUTU_SYMBOL_MAP: Record<string, string> = {
  NQ:  'NQmain',
  MNQ: 'MNQmain',
  ES:  'ESmain',
  MES: 'MESmain',
  YM:  'YMmain',
  MYM: 'MYMmain',
  RTY: 'RTYmain',
  M2K: 'M2Kmain',
  GC:  'GCmain',
  MGC: 'MGCmain',
  SI:  'SImain',
  CL:  'CLmain',
  MCL: 'MCLmain',
  NG:  'NGmain',
};

function toFutuSymbol(symbol: string): string {
  return FUTU_SYMBOL_MAP[symbol] || symbol;
}

// ── Per-user service instances ────────────────────────────────────────────────

const moomooServices: Map<number, MoomooService> = new Map();

export function getMoomooService(userId: number): MoomooService | null {
  return moomooServices.get(userId) || null;
}

export function getOrCreateMoomooService(userId: number, connection: MoomooConnection): MoomooService {
  const existing = moomooServices.get(userId);
  if (existing) {
    existing.updateConnection(connection);
    return existing;
  }
  const svc = new MoomooService(connection);
  moomooServices.set(userId, svc);
  return svc;
}

export function removeMoomooService(userId: number): void {
  moomooServices.delete(userId);
}

// ── MoomooService class ───────────────────────────────────────────────────────

export class MoomooService {
  private connection: MoomooConnection;
  private connected = false;
  private orderCounter = 1000;

  constructor(connection: MoomooConnection) {
    this.connection = connection;
  }

  updateConnection(connection: MoomooConnection): void {
    this.connection = connection;
  }

  isConnected(): boolean {
    return this.connected;
  }

  isPaperMode(): boolean {
    return this.connection.isPaper || process.env.MOOMOO_PAPER_MODE === 'true';
  }

  // Test connectivity to OpenD or enable paper mode
  async connect(): Promise<{ success: boolean; error?: string; isPaper: boolean }> {
    if (this.isPaperMode()) {
      this.connected = true;
      return { success: true, isPaper: true };
    }

    try {
      const url = this.connection.openDUrl || process.env.MOOMOO_OPEND_URL || 'http://127.0.0.1:11111';
      const res = await fetch(`${url}/v1/user/check`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        this.connected = true;
        return { success: true, isPaper: false };
      }
      throw new Error(`OpenD returned ${res.status}`);
    } catch (err: any) {
      // If OpenD isn't running, auto-fall back to paper mode
      console.warn('[Moomoo] OpenD unreachable — switching to paper mode:', err.message);
      this.connection.isPaper = true;
      this.connected = true;
      return { success: true, isPaper: true, error: `OpenD offline — paper mode active` };
    }
  }

  async getAccountInfo(): Promise<MoomooAccountInfo> {
    const isPaper = this.isPaperMode();

    if (isPaper) {
      // Paper mode: return simulated account
      return {
        accountId: this.connection.accountId || 'PAPER',
        balance: 50000,
        equity: 50000,
        unrealizedPnl: 0,
        marginUsed: 0,
        availableMargin: 50000,
        currency: 'USD',
        isPaper: true,
      };
    }

    try {
      const url = this.connection.openDUrl || process.env.MOOMOO_OPEND_URL || 'http://127.0.0.1:11111';
      const res = await fetch(`${url}/v1/accinfo/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acc_id: parseInt(this.connection.accountId) || 0, acc_type: 1, currency: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`OpenD ${res.status}`);
      const data = await res.json();
      const info = data?.s2c?.acc_info_list?.[0];
      if (!info) throw new Error('No account info returned');
      return {
        accountId: this.connection.accountId,
        balance: info.cash || 0,
        equity: info.net_asset_val || 0,
        unrealizedPnl: info.unrealized_pl || 0,
        marginUsed: info.margin_call_margin || 0,
        availableMargin: info.avl_withdrawal_amount || 0,
        currency: 'USD',
        isPaper: false,
      };
    } catch (err: any) {
      throw new Error(`Moomoo account info failed: ${err.message}`);
    }
  }

  async placeOrder(req: MoomooOrderRequest): Promise<MoomooOrderResult> {
    const isPaper = this.isPaperMode();
    const futuSymbol = toFutuSymbol(req.symbol);
    const orderId = `MM${++this.orderCounter}`;

    if (isPaper) {
      // Simulate order acceptance
      console.log(`[Moomoo Paper] ${req.direction} ${req.contracts} ${futuSymbol} | SL=${req.stopLoss ?? 'N/A'} TP=${req.takeProfit ?? 'N/A'}`);
      return { success: true, orderId: `${orderId}_PAPER`, isPaper: true };
    }

    try {
      const url = this.connection.openDUrl || process.env.MOOMOO_OPEND_URL || 'http://127.0.0.1:11111';
      const body = {
        header: { req_id: orderId },
        acc_id: parseInt(this.connection.accountId) || 0,
        sec_type: 5, // futures
        code: futuSymbol,
        trd_side: req.direction === 'BUY' ? 1 : 2,
        order_type: 2,  // market order
        qty: req.contracts,
        price: 0,       // market price
        trd_env: 1,     // real trading
        remark: 'VEDD_AUTO',
      };

      const res = await fetch(`${url}/v1/trade/place_order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) throw new Error(`OpenD ${res.status}`);
      const data = await res.json();
      const orderNum = data?.s2c?.order_id?.toString();
      if (!orderNum) throw new Error(data?.retMsg || 'No order ID returned');
      return { success: true, orderId: orderNum, isPaper: false };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async cancelOrder(orderId: string): Promise<{ success: boolean; error?: string }> {
    if (this.isPaperMode()) return { success: true };

    try {
      const url = this.connection.openDUrl || process.env.MOOMOO_OPEND_URL || 'http://127.0.0.1:11111';
      const res = await fetch(`${url}/v1/trade/modify_order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: parseInt(orderId) || 0, modify_order_op: 1, trd_env: 1 }),
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) throw new Error(`OpenD ${res.status}`);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
