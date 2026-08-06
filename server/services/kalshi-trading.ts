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

export async function placeKalshiOrder(
  userId: number,
  ticker: string,
  side: 'yes' | 'no',
  action: 'buy' | 'sell',
  count: number,
  priceInCents: number,
): Promise<KalshiOrderResult> {
  const payload = {
    ticker,
    action,
    side,
    count,
    type: 'limit',
    ...(side === 'yes' ? { yes_price: priceInCents } : { no_price: priceInCents }),
  };

  const data = await kalshiPost<any>(userId, '/portfolio/orders', payload);
  const order = data.order ?? data;

  return {
    orderId:     order.order_id ?? order.id ?? 'unknown',
    ticker:      order.ticker ?? ticker,
    side:        order.side ?? side,
    action:      order.action ?? action,
    count:       order.count ?? count,
    priceInCents: priceInCents,
    status:      order.status ?? 'resting',
    createdAt:   order.created_time ?? new Date().toISOString(),
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
  try {
    const headers = await getAuthHeaders(userId, 'DELETE', `/portfolio/orders/${orderId}`);
    await fetch(`${KALSHI_BASE}/portfolio/orders/${orderId}`, {
      method: 'DELETE',
      headers,
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch { return false; }
}
