// DXtrade (Devexperts dxsca-web) platform integration for the FX SS AI engine.
// Mirrors the TradeLocker service pattern. PHASE 1 = read-only (login + accounts +
// balances/positions) so we can verify auth and exact field shapes against a live
// Velotrade account BEFORE wiring order placement + engine routing (Phase 2).
//
// API: base like https://dx.velotrade.com/dxsca-web
//   POST /login {username, domain, password} -> { sessionToken }
//   All authed calls send header: Authorization: DXAPI <sessionToken>
//   Session idle timeout ~30 min. Algo/API trading is officially allowed on Velotrade.

import { encryptApiSecret, decryptApiSecret } from './cryptocom';

export { encryptApiSecret, decryptApiSecret };

export interface DxtradeConnInput {
  host: string;        // e.g. https://dx.velotrade.com  (we append /dxsca-web)
  username: string;
  password: string;    // plain (encrypted before storage by the caller/route)
  domain?: string;     // dxsca domain/vendor code, default 'default'
}

/** Extract the first account code from a /users/self response.
 *  Velotrade shape: { userDetails: [ { accounts: [ { account: "default:130000773", ... } ] } ] }
 *  Tolerant of a flat { accounts: [...] } shape and string entries too. */
export function extractAccountCode(usersSelf: any): string | null {
  const ud = usersSelf?.userDetails;
  const detail = Array.isArray(ud) ? ud[0] : (ud ?? usersSelf);
  const accs = detail?.accounts ?? usersSelf?.accounts;
  if (!Array.isArray(accs) || !accs.length) return null;
  const a0 = accs[0];
  return typeof a0 === 'string' ? a0 : (a0?.account ?? a0?.accountCode ?? a0?.code ?? null);
}

/** Normalize a host into the dxsca-web base URL (no trailing slash). */
export function dxBase(host: string): string {
  let h = (host || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(h)) h = `https://${h}`;
  if (!/\/dxsca-web$/i.test(h)) h = `${h}/dxsca-web`;
  return h;
}

export class DxtradeService {
  private base: string;
  private username: string;
  private password: string;
  private domain: string;
  private token: string | null = null;

  constructor(host: string, username: string, password: string, domain = 'default') {
    this.base = dxBase(host);
    this.username = username;
    this.password = password;
    this.domain = domain || 'default';
  }

  /** Authenticate and cache the session token. Throws on failure. */
  async login(): Promise<string> {
    const res = await fetch(`${this.base}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ username: this.username, domain: this.domain, password: this.password }),
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`DXtrade login ${res.status}: ${text.slice(0, 200)}`);
    let token = '';
    try { token = JSON.parse(text)?.sessionToken || ''; } catch { /* token may be header-only */ }
    if (!token) token = res.headers.get('authorization')?.replace(/^DXAPI\s+/i, '') || '';
    if (!token) throw new Error('DXtrade login succeeded but no sessionToken returned');
    this.token = token;
    return token;
  }

  private async authed(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.token) await this.login();
    const doFetch = () => fetch(`${this.base}${path}`, {
      ...init,
      headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', 'Authorization': `DXAPI ${this.token}`, ...(init.headers || {}) },
      signal: AbortSignal.timeout(20000),
    });
    let res = await doFetch();
    if (res.status === 401) { // session expired → re-login once
      this.token = null;
      await this.login();
      res = await doFetch();
    }
    return res;
  }

  /** Current user + their accounts. dxsca exposes this at /users/self (there is no
   *  bare /accounts list endpoint — that path 404s). Account codes look like
   *  'default:12345' and appear in the returned `accounts` array. */
  async getAccounts(): Promise<any> {
    const res = await this.authed('/users/self');
    const text = await res.text();
    if (!res.ok) throw new Error(`DXtrade users/self ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  /** Portfolio (positions + balances) for one account. Falls back across the two
   *  common dxsca shapes. Returns the raw payload too so we can lock field names. */
  async getPortfolio(accountCode: string): Promise<any> {
    let res = await this.authed(`/accounts/${encodeURIComponent(accountCode)}/portfolio`);
    if (res.status === 404) res = await this.authed(`/accounts/${encodeURIComponent(accountCode)}/positions`);
    const text = await res.text();
    if (!res.ok) throw new Error(`DXtrade portfolio ${res.status}: ${text.slice(0, 200)}`);
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  /** Account metrics/balance (equity, balance) for one account. Tolerant of shape. */
  async getMetrics(accountCode: string): Promise<any> {
    const res = await this.authed(`/accounts/${encodeURIComponent(accountCode)}/metrics`);
    const text = await res.text();
    if (!res.ok) return { error: `metrics ${res.status}` };
    try { return JSON.parse(text); } catch { return { raw: text }; }
  }

  /**
   * Place an order on an account. dxsca-web: POST /accounts/{accountCode}/orders.
   * Velotrade-documented body fields: instrument, side, type, quantity,
   * positionEffect, tif. We add a unique orderCode (client id / idempotency) and
   * only include optional legs (SL/TP) when provided. Returns the raw response so
   * callers can inspect status; throws on a non-2xx HTTP.
   */
  async placeOrder(accountCode: string, o: {
    instrument: string;               // e.g. 'EUR/USD'
    side: 'BUY' | 'SELL';
    quantity: number;
    type?: 'MARKET' | 'LIMIT' | 'STOP';
    limitPrice?: number;
    positionEffect?: 'OPEN' | 'CLOSE';
    tif?: 'GTC' | 'DAY' | 'IOC' | 'FOK';
    stopLoss?: number;                // optional protective stop price
    takeProfit?: number;              // optional protective take-profit price
    orderCode?: string;
  }): Promise<any> {
    const body: any = {
      orderCode: o.orderCode || `vedd-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      instrument: o.instrument,
      side: o.side,
      type: o.type || 'MARKET',
      quantity: o.quantity,
      positionEffect: o.positionEffect || 'OPEN',
      tif: o.tif || 'GTC',
    };
    if (o.type === 'LIMIT' && o.limitPrice != null) body.limitPrice = o.limitPrice;
    if (o.stopLoss != null) body.stopLoss = o.stopLoss;
    if (o.takeProfit != null) body.takeProfit = o.takeProfit;
    const res = await this.authed(`/accounts/${encodeURIComponent(accountCode)}/orders`, {
      method: 'POST', body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`DXtrade order ${res.status}: ${text.slice(0, 300)}`);
    let data: any; try { data = JSON.parse(text); } catch { data = { raw: text }; }
    return { ...data, _sent: body };
  }

  /** Close (or reduce) a position by placing an opposite-side market order. */
  async closePosition(accountCode: string, instrument: string, side: 'BUY' | 'SELL', quantity: number): Promise<any> {
    const opposite = side === 'BUY' ? 'SELL' : 'BUY';
    return this.placeOrder(accountCode, { instrument, side: opposite, quantity, type: 'MARKET', positionEffect: 'CLOSE' });
  }

  /** Search tradable instruments (dxsca /instruments/query). Used to discover the
   *  exact symbol format for this broker (Velotrade). Tries a couple of param
   *  shapes and returns the raw payload. */
  async getInstruments(query = ''): Promise<any> {
    const attempts = query
      ? [`/instruments/query?text=${encodeURIComponent(query)}`, `/instruments/query?symbol=${encodeURIComponent(query)}`, `/instruments/query?symbols=${encodeURIComponent(query)}`]
      : ['/instruments/query'];
    let last = '';
    for (const path of attempts) {
      const res = await this.authed(path);
      const text = await res.text();
      if (res.ok) { try { return JSON.parse(text); } catch { return { raw: text }; } }
      last = `${res.status}: ${text.slice(0, 150)}`;
    }
    throw new Error(`DXtrade instruments ${last}`);
  }

  /** One-shot connectivity check used by the connect/test routes. */
  async verify(): Promise<{ ok: boolean; accounts?: any; error?: string }> {
    try {
      await this.login();
      const accounts = await this.getAccounts();
      return { ok: true, accounts };
    } catch (e: any) {
      return { ok: false, error: e?.message ?? String(e) };
    }
  }
}
