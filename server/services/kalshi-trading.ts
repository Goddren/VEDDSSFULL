/**
 * Kalshi Trading Service
 *
 * CFTC-regulated US prediction market exchange.
 * Uses Kalshi Trade API v2 for authentication and order placement.
 *
 * Auth flow: email+password → JWT token (stored per-user in memory + credential file)
 * Order flow: POST /portfolio/orders with {ticker, side, action, count, type, yes_price}
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { backupDurableFile } from './cred-store';

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';
const KALSHI_PATH_PREFIX = '/trade-api/v2';

const CREDS_FILE = path.join(process.cwd(), 'data', 'kalshi_credentials.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KalshiCredentials {
  authMethod: 'password' | 'apikey';
  // Password auth
  email?: string;
  password?: string;
  // RSA API key auth (for Google-SSO accounts)
  keyId?: string;
  privateKeyPem?: string;
}

interface KalshiSession {
  token: string;
  memberId: string;
  expiresAt: number; // unix ms — Kalshi tokens last ~24h, we refresh after 20h
}

export interface KalshiOrderResult {
  orderId: string;
  ticker: string;
  side: 'yes' | 'no';
  action: 'buy' | 'sell';
  count: number;
  priceInCents: number;
  status: string;
  createdAt: string;
  /** From the V2 create-order response — how many contracts filled
   * immediately on placement. Lets callers skip an extra fill-check
   * round-trip when this already confirms a full/partial fill. */
  filledCount?: number;
}

export interface KalshiBalance {
  balance: number;          // in cents
  availableBalance: number; // cents usable for new orders
}

// ── Credential storage ────────────────────────────────────────────────────────

function loadAllCreds(): Record<string, KalshiCredentials> {
  try {
    if (fs.existsSync(CREDS_FILE)) return JSON.parse(fs.readFileSync(CREDS_FILE, 'utf-8'));
  } catch (e: any) {
    // A corrupted file (partial write, etc.) previously looked identical to
    // "no credentials saved" — every Kalshi feature would silently report
    // paper mode/not-connected with no indication anything was actually wrong.
    console.error('[Kalshi] Credential store is unreadable (corrupted JSON?) — treating as empty:', e?.message);
  }
  return {};
}

function saveAllCreds(map: Record<string, KalshiCredentials>): void {
  try {
    const dir = path.dirname(CREDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const content = JSON.stringify(map, null, 2);
    fs.writeFileSync(CREDS_FILE, content);
    backupDurableFile('kalshi_credentials.json', content); // durable DB mirror (survives deploys)
  } catch { /* ignore */ }
}

export function saveKalshiCredentials(userId: number, creds: KalshiCredentials): void {
  const map = loadAllCreds();
  map[String(userId)] = creds;
  saveAllCreds(map);
}

/**
 * Normalize a pasted RSA private key into valid PEM:
 *  - strip surrounding quotes / BOM / whitespace
 *  - convert literal "\n" (and "\r\n") escapes into real newlines
 *  - if the body got flattened onto one line, re-wrap base64 at 64 chars
 * Throws a clear error if the result isn't a parseable private key.
 */
function normalizePrivateKey(raw: string): string {
  let pem = (raw ?? '').trim();
  // Strip wrapping quotes a copy/paste may add
  if ((pem.startsWith('"') && pem.endsWith('"')) || (pem.startsWith("'") && pem.endsWith("'"))) {
    pem = pem.slice(1, -1).trim();
  }
  // Convert escaped newlines to real ones
  if (pem.includes('\\n')) pem = pem.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n');
  pem = pem.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // If header/body/footer ended up on one line, rebuild with proper wrapping
  const headerMatch = pem.match(/-----BEGIN ([A-Z ]+?)-----/);
  const footerMatch = pem.match(/-----END ([A-Z ]+?)-----/);
  if (headerMatch && footerMatch && !pem.includes('\n')) {
    const label = headerMatch[1];
    const body = pem
      .replace(/-----BEGIN [A-Z ]+?-----/, '')
      .replace(/-----END [A-Z ]+?-----/, '')
      .replace(/\s+/g, '');
    const wrapped = body.match(/.{1,64}/g)?.join('\n') ?? body;
    pem = `-----BEGIN ${label}-----\n${wrapped}\n-----END ${label}-----`;
  }
  pem = pem.trim();

  // Validate it actually parses as a private key (clear error if not)
  try {
    crypto.createPrivateKey(pem);
  } catch {
    throw new Error('Private key is not a valid RSA PEM. Paste the full contents of the key file Kalshi gave you, including the "-----BEGIN ... PRIVATE KEY-----" and "-----END ... PRIVATE KEY-----" lines.');
  }
  return pem;
}

export function saveKalshiApiKey(userId: number, keyId: string, privateKeyPem: string): void {
  const normalized = normalizePrivateKey(privateKeyPem);
  const map = loadAllCreds();
  map[String(userId)] = { authMethod: 'apikey', keyId: keyId.trim(), privateKeyPem: normalized };
  saveAllCreds(map);
  _sessions.delete(userId); // clear any stale JWT session
}

export function loadKalshiCredentials(userId: number): KalshiCredentials | null {
  return loadAllCreds()[String(userId)] ?? null;
}

export function deleteKalshiCredentials(userId: number): void {
  const map = loadAllCreds();
  delete map[String(userId)];
  saveAllCreds(map);
  _sessions.delete(userId);
}

// ── Session management (in-memory, password auth only) ───────────────────────

const _sessions = new Map<number, KalshiSession>();

async function getOrRefreshToken(userId: number, creds: KalshiCredentials): Promise<string> {
  const existing = _sessions.get(userId);
  if (existing && Date.now() < existing.expiresAt) return existing.token;

  const res = await fetch(`${KALSHI_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text();
    // Kalshi removed email/password API login — /login now 404s on the
    // current api.elections.kalshi.com host. Direct users to the API Key flow.
    if (res.status === 404) {
      throw new Error('Kalshi no longer supports email/password API login. Please connect using an API Key instead (Kalshi → Settings → API Keys → kalshi.com/account/api).');
    }
    throw new Error(`Kalshi login failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  const token: string = data.token ?? data.access_token;
  const memberId: string = data.member_id ?? '';
  if (!token) throw new Error('Kalshi login response missing token field');

  const session: KalshiSession = { token, memberId, expiresAt: Date.now() + 20 * 60 * 60 * 1000 };
  _sessions.set(userId, session);
  return token;
}

// ── RSA signing for API key auth ──────────────────────────────────────────────

function signKalshiRequest(privateKeyPem: string, timestampMs: number, method: string, endpoint: string): string {
  // Kalshi signs `timestampMs + METHOD + /trade-api/v2 + path`.
  // Strip any query string — the signature covers the path only.
  const pathOnly = endpoint.split('?')[0];
  const message = String(timestampMs) + method.toUpperCase() + KALSHI_PATH_PREFIX + pathOnly;
  const sign = crypto.createSign('sha256');
  sign.update(message);
  sign.end();
  // Kalshi REQUIRES RSASSA-PSS with SHA-256 and digest-length salt — NOT the
  // default PKCS#1 v1.5. Wrong padding → 401 "invalid signature".
  return sign.sign(
    {
      key: privateKeyPem,
      padding: crypto.constants.RSA_PKCS1_PSS_PADDING,
      saltLength: crypto.constants.RSA_PSS_SALTLEN_DIGEST,
    },
    'base64',
  );
}

// ── Auth header builder (handles both methods) ────────────────────────────────

async function getAuthHeaders(userId: number, method: string, endpoint: string): Promise<Record<string, string>> {
  const creds = loadKalshiCredentials(userId);
  if (!creds) throw new Error('No Kalshi credentials saved for this account');

  const base: Record<string, string> = { 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' };

  if (creds.authMethod === 'apikey' && creds.keyId && creds.privateKeyPem) {
    const ts = Date.now();
    const sig = signKalshiRequest(creds.privateKeyPem, ts, method, endpoint);
    return {
      ...base,
      'KALSHI-ACCESS-KEY': creds.keyId,
      'KALSHI-ACCESS-TIMESTAMP': String(ts),
      'KALSHI-ACCESS-SIGNATURE': sig,
    };
  }

  // Password auth → JWT
  const token = await getOrRefreshToken(userId, creds);
  return { ...base, 'Authorization': `Bearer ${token}` };
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function kalshiGet<T>(userId: number, endpoint: string): Promise<T> {
  const headers = await getAuthHeaders(userId, 'GET', endpoint);
  const res = await fetch(`${KALSHI_BASE}${endpoint}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kalshi GET ${endpoint} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function kalshiPost<T>(userId: number, endpoint: string, body: object): Promise<T> {
  const headers = await getAuthHeaders(userId, 'POST', endpoint);
  const res = await fetch(`${KALSHI_BASE}${endpoint}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Kalshi POST ${endpoint} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Test credentials (both password and API key) and return account info if valid */
export async function testKalshiCredentials(userId: number): Promise<{ valid: boolean; memberId?: string; balance?: number; error?: string }> {
  try {
    const data = await kalshiGet<any>(userId, '/portfolio/balance');
    const balance = data.balance ?? 0;
    const session = _sessions.get(userId);
    const creds = loadKalshiCredentials(userId);
    const memberId = session?.memberId ?? (creds?.keyId ? `API Key: ${creds.keyId.slice(0, 8)}…` : undefined);
    return { valid: true, memberId, balance };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function getKalshiBalance(userId: number): Promise<KalshiBalance> {
  const data = await kalshiGet<any>(userId, '/portfolio/balance');
  return {
    balance:          data.balance ?? 0,
    availableBalance: data.available_balance ?? data.balance ?? 0,
  };
}

/**
 * Kalshi deprecated POST /portfolio/orders (confirmed live: returns HTTP 410
 * "deprecated_v1_order_endpoint" for every order — this was silently failing
 * every real live-mode order attempt). The replacement, POST
 * /portfolio/events/orders ("Create Order V2"), is a structurally different
 * API, confirmed against Kalshi's live OpenAPI spec (docs.kalshi.com/openapi.yaml):
 *  - No more separate side('yes'|'no') + action('buy'|'sell'): a single
 *    YES-perspective book, side is just 'bid' (buy YES) or 'ask' (sell YES).
 *    Selling YES ≡ buying NO at (1-price), but the API always quotes YES.
 *  - count/price are now fixed-point DECIMAL STRINGS, not integers — count
 *    like "5", price in DOLLARS like "0.56" (not 56 cents).
 *  - time_in_force and self_trade_prevention_type are now required fields
 *    with no implicit default.
 * This engine only ever trades the YES side (never opens a NO position) —
 * side='no' is rejected rather than silently mistranslated.
 */
export async function placeKalshiOrder(
  userId: number,
  ticker: string,
  side: 'yes' | 'no',
  action: 'buy' | 'sell',
  count: number,
  priceInCents: number,
): Promise<KalshiOrderResult> {
  if (side === 'no') {
    throw new Error('placeKalshiOrder: NO-side orders are not supported (this engine only trades YES; the V2 API expresses NO as selling YES at 1-price, not implemented since it is never used)');
  }
  const bookSide: 'bid' | 'ask' = action === 'buy' ? 'bid' : 'ask';
  const payload = {
    ticker,
    side: bookSide,
    count: String(count),
    price: (priceInCents / 100).toFixed(2),
    time_in_force: 'good_till_canceled',
    self_trade_prevention_type: 'taker_at_cross',
  };

  const data = await kalshiPost<any>(userId, '/portfolio/events/orders', payload);
  const fillCount = parseFloat(data.fill_count ?? '0') || 0;
  const remainingCount = parseFloat(data.remaining_count ?? String(count)) || 0;

  return {
    orderId:      data.order_id ?? 'unknown',
    ticker,
    side,
    action,
    count:        Math.round(fillCount + remainingCount),
    priceInCents: priceInCents,
    status:       remainingCount === 0 ? 'executed' : 'resting',
    createdAt:    new Date().toISOString(),
    filledCount:  fillCount,
  };
}

export async function getKalshiPositions(userId: number): Promise<any[]> {
  const data = await kalshiGet<any>(userId, '/portfolio/positions?limit=100');
  return data.positions ?? data.market_positions ?? [];
}

export async function getKalshiOrders(userId: number, status = 'resting'): Promise<any[]> {
  const data = await kalshiGet<any>(userId, `/portfolio/orders?status=${status}&limit=50`);
  return data.orders ?? [];
}

export async function cancelKalshiOrder(userId: number, orderId: string): Promise<boolean> {
  // DELETE /portfolio/orders/{id} was also retired alongside order creation —
  // confirmed against the live spec, cancellation now only exists at
  // /portfolio/events/orders/{id} ("Cancel Order V2").
  try {
    const headers = await getAuthHeaders(userId, 'DELETE', `/portfolio/events/orders/${orderId}`);
    await fetch(`${KALSHI_BASE}/portfolio/events/orders/${orderId}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch { return false; }
}

// ─────────────────────────────────────────────────────────────────────────────
// Margin (perpetual futures) AUTHENTICATED client — 2026-11-15.
//
// The perps exchange is a separate host (external-api.kalshi.com prod /
// external-api.demo.kalshi.co demo — perpHost() in kalshi-perps.ts is the
// single host switch for BOTH public data and these authenticated calls),
// but it uses the SAME auth as event contracts: the RSA signer above signs
// `timestamp + METHOD + /trade-api/v2 + path`, and margin paths live under
// that same prefix, so getAuthHeaders() covers /margin/* unchanged. This
// section deliberately reuses the per-user credential store — there is NO
// second credential path for perps. (Kalshi's own SDKs suggest separate
// perps keys; if the stored key is not margin-authorized, /margin/enabled
// answers false and the live lane fails closed — see kalshi-perp-live.ts.)
//
// Order shape (POST /margin/orders, from Kalshi's perps OpenAPI + docs,
// verified 2026-11-15): required ticker, client_order_id (REQUIRED — the
// server's idempotency key; a duplicate returns 409 order_already_exists),
// side 'bid'|'ask', count + price as fixed-point STRINGS, time_in_force,
// self_trade_prevention_type. price is always required — a "market" order
// is a marketable limit (price at/through the touch) with
// immediate_or_cancel. reduce_only orders must be IOC or FOK.
// ─────────────────────────────────────────────────────────────────────────────
import { perpHost } from './kalshi-perps';
import { parseFeeTiersPayload, type PerpFeeSchedule } from './kalshi-perp-costs';

const fpNum = (v: any): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : null;
};

async function kalshiMarginGet<T>(userId: number, endpoint: string): Promise<T> {
  const headers = await getAuthHeaders(userId, 'GET', endpoint);
  const res = await fetch(`${perpHost()}${endpoint}`, { headers, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kalshi margin GET ${endpoint} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// ── /margin/enabled ─────────────────────────────────────────────────────────
/** Parse the /margin/enabled payload. ONLY an explicit true counts — any
 *  other shape (missing field, string, nested junk) reads as NOT enabled. */
export function parseMarginEnabled(data: any): boolean {
  if (data === true) return true;
  if (!data || typeof data !== 'object') return false;
  return data.enabled === true || data.margin_enabled === true || data.is_enabled === true;
}

/** Is margin trading enabled for this account? THROWS on transport/HTTP
 *  error — callers must fail closed (an unreadable answer is not a yes). */
export async function getKalshiMarginEnabled(userId: number): Promise<boolean> {
  const data = await kalshiMarginGet<any>(userId, '/margin/enabled');
  return parseMarginEnabled(data);
}

// ── /margin/balance ─────────────────────────────────────────────────────────
export interface KalshiMarginBalance {
  cashUsd: number | null;
  positionValueUsd: number | null;
  /** cash + position value, or the account's own reported equity figure. */
  equityUsd: number | null;
  maintenanceMarginUsd: number | null;
}

function pickFp(obj: any, keys: string[]): number | null {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of keys) { const v = fpNum(obj[k]); if (v != null) return v; }
  return null;
}

/** Normalize the /margin/balance payload (flat, wrapped, or per-subaccount
 *  shapes all occur across Kalshi API generations). Unparseable → nulls;
 *  callers treat a null equity as "cannot size" and fail closed. */
export function normalizeMarginBalance(data: any): KalshiMarginBalance {
  let src: any = data?.balance ?? data ?? null;
  if (Array.isArray(data?.subaccounts)) {
    src = data.subaccounts.find((s: any) => Number(s?.subaccount ?? 0) === 0) ?? data.subaccounts[0] ?? src;
  } else if (data && typeof data === 'object' && data['0'] && typeof data['0'] === 'object') {
    src = data['0'];
  }
  const cashUsd = pickFp(src, ['cash_balance', 'cash', 'available_cash', 'available_balance', 'balance']);
  const positionValueUsd = pickFp(src, ['position_value', 'positions_value', 'market_value', 'position_notional_value']);
  const reportedEquity = pickFp(src, ['portfolio_value', 'equity', 'total_equity', 'account_value', 'net_liquidation_value']);
  const equityUsd = reportedEquity ?? (cashUsd != null && positionValueUsd != null ? cashUsd + positionValueUsd : cashUsd);
  const maintenanceMarginUsd = pickFp(src, ['maintenance_margin', 'maintenance_margin_requirement', 'maintenance_requirement']);
  return { cashUsd, positionValueUsd, equityUsd, maintenanceMarginUsd };
}

export async function getKalshiMarginBalance(userId: number): Promise<KalshiMarginBalance> {
  const data = await kalshiMarginGet<any>(userId, '/margin/balance');
  return normalizeMarginBalance(data);
}

// ── /margin/positions ───────────────────────────────────────────────────────
export interface KalshiMarginPosition {
  ticker: string;
  /** Signed contracts: + long, − short (Kalshi's own position sign, or
   *  derived from an explicit side field when the count is unsigned). */
  contracts: number;
  entryPrice: number | null;
  unrealizedPnlUsd: number | null;
  subaccount: number | null;
}

export function normalizeMarginPosition(raw: any): KalshiMarginPosition | null {
  if (!raw || typeof raw !== 'object') return null;
  const ticker = String(raw.ticker ?? raw.market_ticker ?? '');
  if (!ticker) return null;
  let contracts = fpNum(raw.position_fp ?? raw.position ?? raw.contracts ?? raw.quantity ?? raw.count);
  if (contracts == null) return null;
  const sideRaw = String(raw.side ?? raw.direction ?? '').toLowerCase();
  if (contracts > 0 && (sideRaw === 'ask' || sideRaw === 'short' || sideRaw === 'sell')) contracts = -contracts;
  if (contracts === 0) return null;
  return {
    ticker,
    contracts,
    entryPrice: fpNum(raw.average_entry_price ?? raw.entry_price ?? raw.avg_entry_price ?? raw.average_price),
    unrealizedPnlUsd: fpNum(raw.unrealized_pnl ?? raw.unrealized_pnl_usd ?? raw.unrealized_profit_loss),
    subaccount: raw.subaccount != null && Number.isFinite(Number(raw.subaccount)) ? Number(raw.subaccount) : null,
  };
}

export function normalizeMarginPositions(data: any): KalshiMarginPosition[] {
  const list: any[] = Array.isArray(data) ? data : (data?.positions ?? data?.market_positions ?? []);
  return list.map(normalizeMarginPosition).filter((p: KalshiMarginPosition | null): p is KalshiMarginPosition => !!p);
}

/** The account's open margin positions (primary subaccount rows when the
 *  payload identifies subaccounts). THROWS on transport/HTTP error. */
export async function getKalshiMarginPositions(userId: number): Promise<KalshiMarginPosition[]> {
  const data = await kalshiMarginGet<any>(userId, '/margin/positions');
  const all = normalizeMarginPositions(data);
  const primary = all.filter((p) => p.subaccount == null || p.subaccount === 0);
  return primary.length || !all.length ? primary : all;
}

// ── /margin/orders ──────────────────────────────────────────────────────────
export interface KalshiMarginOrder {
  orderId: string;
  clientOrderId: string | null;
  ticker: string;
  side: string;
  status: string;
  fillCount: number;
  remainingCount: number;
  avgFillPrice: number | null;
}

export function normalizeMarginOrder(raw: any): KalshiMarginOrder | null {
  if (!raw || typeof raw !== 'object') return null;
  const orderId = String(raw.order_id ?? raw.id ?? '');
  if (!orderId) return null;
  return {
    orderId,
    clientOrderId: raw.client_order_id != null ? String(raw.client_order_id) : null,
    ticker: String(raw.ticker ?? ''),
    side: String(raw.side ?? ''),
    status: String(raw.status ?? ''),
    fillCount: fpNum(raw.fill_count) ?? 0,
    remainingCount: fpNum(raw.remaining_count) ?? 0,
    avgFillPrice: fpNum(raw.average_fill_price ?? raw.avg_fill_price),
  };
}

export async function getKalshiMarginOrders(userId: number, limit = 100): Promise<KalshiMarginOrder[]> {
  const data = await kalshiMarginGet<any>(userId, `/margin/orders?limit=${Math.max(1, Math.min(200, Math.floor(limit)))}`);
  const list: any[] = Array.isArray(data) ? data : (data?.orders ?? []);
  return list.map(normalizeMarginOrder).filter((o: KalshiMarginOrder | null): o is KalshiMarginOrder => !!o);
}

/** Reconciliation lookup: find a previously-placed order by the
 *  client_order_id we sent. Returns null when no such order exists in the
 *  recent order list — the caller treats "not found" as evidence (not
 *  proof) the original POST never landed. THROWS on transport error. */
export async function findKalshiMarginOrderByClientId(userId: number, clientOrderId: string): Promise<KalshiMarginOrder | null> {
  const orders = await getKalshiMarginOrders(userId, 200);
  return orders.find((o) => o.clientOrderId === clientOrderId) ?? null;
}

export async function cancelKalshiMarginOrder(userId: number, orderId: string): Promise<boolean> {
  try {
    const headers = await getAuthHeaders(userId, 'DELETE', `/margin/orders/${orderId}`);
    const res = await fetch(`${perpHost()}/margin/orders/${orderId}`, {
      method: 'DELETE', headers, signal: AbortSignal.timeout(8000),
    });
    return res.ok;
  } catch { return false; }
}

// ── order placement ─────────────────────────────────────────────────────────
export interface MarginOrderBodyInput {
  ticker: string;
  clientOrderId: string;
  side: 'bid' | 'ask';
  /** Whole contracts (stock perps trade whole contracts). */
  count: number;
  /** Limit price in dollars (perp price units). Marketable by construction:
   *  entries price at the touch, exits price through it. */
  price: number;
  /** Market tick size for price rounding (from the market payload). */
  tickSize?: number | null;
  reduceOnly?: boolean;
}

/** Fixed-point dollar string for a price, rounded to the market tick. */
export function formatMarginPrice(price: number, tickSize?: number | null): string {
  const tick = tickSize != null && tickSize > 0 ? tickSize : 0.0001;
  const decimals = Math.min(6, Math.max(0, Math.round(-Math.log10(tick))));
  const rounded = Math.round(price / tick) * tick;
  return rounded.toFixed(decimals);
}

/** Build the POST /margin/orders body. Pure — the check scripts pin it. */
export function buildMarginOrderBody(input: MarginOrderBodyInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    ticker: input.ticker,
    client_order_id: input.clientOrderId,
    side: input.side,
    count: String(Math.max(1, Math.floor(input.count))),
    price: formatMarginPrice(input.price, input.tickSize),
    time_in_force: 'immediate_or_cancel',
    self_trade_prevention_type: 'taker_at_cross',
  };
  if (input.reduceOnly) body.reduce_only = true;
  return body;
}

export type MarginOrderOutcome =
  | { outcome: 'responded'; orderId: string; fillCount: number; remainingCount: number; avgFillPrice: number | null }
  | { outcome: 'rejected'; status: number; code: string; message: string }
  | { outcome: 'ambiguous'; status: number | null; error: string };

/** Classify an HTTP result for an order POST. 2xx with an order_id is a
 *  response; a 4xx with a parseable error body is a business rejection (the
 *  order was refused — Kalshi's codes name the cause, incl.
 *  order_already_exists); EVERYTHING else (timeout, 5xx, unparseable) is
 *  ambiguous — the order may or may not exist, and the caller MUST
 *  reconcile by client_order_id before any retry. */
export function classifyMarginOrderHttp(status: number | null, data: any): 'responded' | 'rejected' | 'ambiguous' {
  if (status != null && status >= 200 && status < 300 && data && typeof data === 'object' && (data.order_id || data.order?.order_id)) return 'responded';
  if (status != null && status >= 400 && status < 500 && data && typeof data === 'object') return 'rejected';
  return 'ambiguous';
}

/**
 * Place a margin order. NEVER throws for transport/HTTP outcomes — the
 * discriminated outcome is the safety contract (see classifyMarginOrderHttp).
 * Throws only when no credentials exist (a programming/config error the
 * caller must surface, not an order outcome).
 */
export async function placeKalshiMarginOrder(userId: number, input: MarginOrderBodyInput): Promise<MarginOrderOutcome> {
  const body = buildMarginOrderBody(input);
  const headers = await getAuthHeaders(userId, 'POST', '/margin/orders');
  let status: number | null = null;
  let data: any = null;
  let transportError = '';
  try {
    const res = await fetch(`${perpHost()}/margin/orders`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    status = res.status;
    const text = await res.text().catch(() => '');
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  } catch (e: any) {
    transportError = e?.message ?? String(e);
  }
  const cls = classifyMarginOrderHttp(status, data);
  if (cls === 'responded') {
    const o = data.order ?? data;
    return {
      outcome: 'responded',
      orderId: String(o.order_id ?? ''),
      fillCount: fpNum(o.fill_count) ?? 0,
      remainingCount: fpNum(o.remaining_count) ?? 0,
      avgFillPrice: fpNum(o.average_fill_price ?? o.avg_fill_price),
    };
  }
  if (cls === 'rejected') {
    const err = data.error ?? data;
    return {
      outcome: 'rejected',
      status: status ?? 0,
      code: String(err?.code ?? ''),
      message: String(err?.message ?? err?.details ?? `HTTP ${status}`).slice(0, 300),
    };
  }
  return { outcome: 'ambiguous', status, error: transportError || `unparseable or error response (HTTP ${status})` };
}

/** Recent fills for a ticker (close journaling: find the real exit price).
 *  Fail-soft by design — returns [] on any error; callers journal the close
 *  with an unknown price rather than inventing one. */
export async function getKalshiMarginFills(userId: number, ticker: string, limit = 50): Promise<any[]> {
  try {
    const data = await kalshiMarginGet<any>(userId, `/margin/fills?ticker=${encodeURIComponent(ticker)}&limit=${Math.max(1, Math.min(100, Math.floor(limit)))}`);
    return Array.isArray(data) ? data : (data?.fills ?? []);
  } catch { return []; }
}

/**
 * The account's own funding payments for a ticker over a window, summed
 * and signed from the HOLDER's side (positive = received, per Kalshi's
 * funding_amount convention), from GET /margin/funding_history (ticker +
 * inclusive UTC date range required). Returns null when the read fails or
 * a non-empty payload has no parseable amounts — callers journal the close
 * without funding rather than guessing a number. An empty history is a
 * real $0 (no funding events crossed), not an unknown.
 */
export async function getKalshiMarginFundingHistoryUsd(userId: number, ticker: string, fromMs: number, toMs: number): Promise<number | null> {
  try {
    const qs = new URLSearchParams({
      ticker,
      start_date: new Date(fromMs).toISOString(),
      end_date: new Date(toMs).toISOString(),
    });
    const data = await kalshiMarginGet<any>(userId, `/margin/funding_history?${qs.toString()}`);
    const list: any[] = Array.isArray(data) ? data : (data?.funding_history ?? data?.history ?? []);
    let sum = 0;
    let parsed = 0;
    for (const e of list) {
      const v = fpNum(e?.funding_amount ?? e?.amount ?? e?.payment_amount);
      if (v != null) { sum += v; parsed++; }
    }
    if (list.length && !parsed) return null;
    return sum;
  } catch { return null; }
}

// ── /margin/fee_tiers ─────────────────────────────────────────────────────
const _feeTierCache = new Map<number, { at: number; schedule: PerpFeeSchedule | null }>();
const FEE_TIER_TTL_MS = 10 * 60_000;

/**
 * The account's Kalshi perp fee schedule from GET /margin/fee_tiers,
 * parsed by the shared kalshi-perp-costs module (base tier = highest
 * taker; bps or decimal shapes). NEVER throws and returns null on any
 * failure or unparseable payload — callers fall back to the published
 * tier-0 schedule via resolveFeeSchedule(), with the source stated.
 * Cached per user for 10 minutes (fee tiers change rarely; a stale
 * schedule inside the TTL is the documented trade-off).
 */
export async function getKalshiMarginFeeTiers(userId: number): Promise<PerpFeeSchedule | null> {
  const hit = _feeTierCache.get(userId);
  if (hit && Date.now() - hit.at < FEE_TIER_TTL_MS) return hit.schedule;
  let schedule: PerpFeeSchedule | null = null;
  try {
    const data = await kalshiMarginGet<any>(userId, '/margin/fee_tiers');
    schedule = parseFeeTiersPayload(data);
  } catch { schedule = null; }
  _feeTierCache.set(userId, { at: Date.now(), schedule });
  return schedule;
}
