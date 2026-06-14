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

const KALSHI_BASE = 'https://api.elections.kalshi.com/trade-api/v2';

const CREDS_FILE = path.join(process.cwd(), 'data', 'kalshi_credentials.json');

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KalshiCredentials {
  email: string;
  password: string;
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
  } catch { /* ignore */ }
  return {};
}

function saveAllCreds(map: Record<string, KalshiCredentials>): void {
  try {
    const dir = path.dirname(CREDS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CREDS_FILE, JSON.stringify(map, null, 2));
  } catch { /* ignore */ }
}

export function saveKalshiCredentials(userId: number, creds: KalshiCredentials): void {
  const map = loadAllCreds();
  map[String(userId)] = creds;
  saveAllCreds(map);
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

// ── Session management (in-memory) ────────────────────────────────────────────

const _sessions = new Map<number, KalshiSession>();

async function getOrRefreshToken(userId: number): Promise<string> {
  const existing = _sessions.get(userId);
  if (existing && Date.now() < existing.expiresAt) return existing.token;

  const creds = loadKalshiCredentials(userId);
  if (!creds) throw new Error('No Kalshi credentials saved for this account');

  const res = await fetch(`${KALSHI_BASE}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    body: JSON.stringify({ email: creds.email, password: creds.password }),
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kalshi login failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json() as any;
  const token: string = data.token ?? data.access_token;
  const memberId: string = data.member_id ?? '';
  if (!token) throw new Error('Kalshi login response missing token field');

  const session: KalshiSession = { token, memberId, expiresAt: Date.now() + 20 * 60 * 60 * 1000 }; // 20 h
  _sessions.set(userId, session);
  return token;
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function kalshiGet<T>(token: string, endpoint: string): Promise<T> {
  const res = await fetch(`${KALSHI_BASE}${endpoint}`, {
    headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Kalshi GET ${endpoint} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function kalshiPost<T>(token: string, endpoint: string, body: object): Promise<T> {
  const res = await fetch(`${KALSHI_BASE}${endpoint}`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'VEDD-Trading-AI/1.0' },
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

/** Test credentials and return the member ID if valid */
export async function testKalshiCredentials(userId: number): Promise<{ valid: boolean; memberId?: string; balance?: number; error?: string }> {
  try {
    const token = await getOrRefreshToken(userId);
    const data = await kalshiGet<any>(token, '/portfolio/balance');
    const balance = data.balance ?? 0;
    const session = _sessions.get(userId);
    return { valid: true, memberId: session?.memberId, balance };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function getKalshiBalance(userId: number): Promise<KalshiBalance> {
  const token = await getOrRefreshToken(userId);
  const data = await kalshiGet<any>(token, '/portfolio/balance');
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
  const token = await getOrRefreshToken(userId);

  const payload = {
    ticker,
    action,
    side,
    count,
    type: 'limit',
    // Kalshi uses yes_price for limit orders
    ...(side === 'yes' ? { yes_price: priceInCents } : { no_price: priceInCents }),
  };

  const data = await kalshiPost<any>(token, '/portfolio/orders', payload);
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
  const token = await getOrRefreshToken(userId);
  const data = await kalshiGet<any>(token, '/portfolio/positions?limit=100');
  return data.positions ?? data.market_positions ?? [];
}

export async function getKalshiOrders(userId: number, status = 'resting'): Promise<any[]> {
  const token = await getOrRefreshToken(userId);
  const data = await kalshiGet<any>(token, `/portfolio/orders?status=${status}&limit=50`);
  return data.orders ?? [];
}

export async function cancelKalshiOrder(userId: number, orderId: string): Promise<boolean> {
  const token = await getOrRefreshToken(userId);
  try {
    await fetch(`${KALSHI_BASE}/portfolio/orders/${orderId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'VEDD-Trading-AI/1.0' },
      signal: AbortSignal.timeout(8000),
    });
    return true;
  } catch { return false; }
}
