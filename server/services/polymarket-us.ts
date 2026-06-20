// ─── Polymarket US (CFTC-regulated) API client ───────────────────────────────
// US-accessible regulated exchange at https://api.polymarket.us — NO VPN needed
// (unlike the international clob.polymarket.com which geo-blocks US IPs).
//
// Auth: Ed25519 signatures.
//   X-PM-Access-Key : key id
//   X-PM-Timestamp  : current time in ms (must be within 30s of server)
//   X-PM-Signature  : base64( Ed25519_sign( "{timestamp}{METHOD}{path}", secret ) )
//   secret = base64-decode(secretKey) → first 32 bytes = Ed25519 seed
//
// Credentials are stored encrypted in a JSON sidecar (data/polymarket_us.json),
// keyed by userId — same pattern as kalshi_credentials.json. The secret never
// leaves the server in plaintext.

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { encryptPassword, decryptPassword } from '../tradelocker';

const BASE_URL = 'https://api.polymarket.us';        // authenticated (orders/portfolio)
const GATEWAY_URL = 'https://gateway.polymarket.us'; // public (markets/events/search)
const FILE = path.join(process.cwd(), 'data', 'polymarket_us.json');

export interface PmUsCredentials {
  keyId: string;
  secretEnc: string;   // encrypted secret key
  savedAt: string;
}

// ── Credential storage ──────────────────────────────────────────────────────
function loadAll(): Record<string, PmUsCredentials> {
  try {
    if (fs.existsSync(FILE)) return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch { /* ignore */ }
  return {};
}
function saveAll(map: Record<string, PmUsCredentials>): void {
  try {
    const dir = path.dirname(FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(map, null, 2));
  } catch { /* ignore */ }
}
export function savePmUsCredentials(userId: number, keyId: string, secretKey: string): void {
  const map = loadAll();
  map[String(userId)] = { keyId: keyId.trim(), secretEnc: encryptPassword(secretKey.trim()), savedAt: new Date().toISOString() };
  saveAll(map);
}
export function loadPmUsCredentials(userId: number): { keyId: string; secret: string } | null {
  const c = loadAll()[String(userId)];
  if (!c) return null;
  try { return { keyId: c.keyId, secret: decryptPassword(c.secretEnc) }; }
  catch { return null; }
}
export function hasPmUsCredentials(userId: number): boolean {
  return !!loadAll()[String(userId)];
}
export function deletePmUsCredentials(userId: number): void {
  const map = loadAll();
  delete map[String(userId)];
  saveAll(map);
}

// ── Ed25519 request signing ──────────────────────────────────────────────────
// Build a Node Ed25519 private key from a 32-byte raw seed by wrapping it in the
// fixed PKCS8 DER prefix, then sign with algorithm=null (Ed25519).
const PKCS8_ED25519_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');

function ed25519KeyFromSecret(secretKeyB64: string): crypto.KeyObject {
  const raw = Buffer.from(secretKeyB64, 'base64');
  const seed = raw.subarray(0, 32); // first 32 bytes = Ed25519 seed
  const der = Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
  return crypto.createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
}

function signHeaders(keyId: string, secret: string, method: string, reqPath: string): Record<string, string> {
  const timestamp = Date.now().toString();
  const message = `${timestamp}${method.toUpperCase()}${reqPath}`;
  const key = ed25519KeyFromSecret(secret);
  const signature = crypto.sign(null, Buffer.from(message, 'utf-8'), key).toString('base64');
  return {
    'X-PM-Access-Key': keyId,
    'X-PM-Timestamp': timestamp,
    'X-PM-Signature': signature,
    'Content-Type': 'application/json',
  };
}

// ── Authenticated request ────────────────────────────────────────────────────
export async function pmUsRequest(
  userId: number,
  method: string,
  reqPath: string,   // e.g. '/v1/portfolio/positions' (leading slash, no domain)
  body?: any,
): Promise<{ ok: boolean; status: number; data: any }> {
  const creds = loadPmUsCredentials(userId);
  if (!creds) return { ok: false, status: 0, data: { error: 'No Polymarket US credentials saved' } };

  const headers = signHeaders(creds.keyId, creds.secret, method, reqPath);
  const init: any = { method: method.toUpperCase(), headers, signal: AbortSignal.timeout(20000) };
  if (body !== undefined) init.body = JSON.stringify(body);

  try {
    const res = await fetch(`${BASE_URL}${reqPath}`, init);
    const text = await res.text();
    let data: any;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
    return { ok: res.ok, status: res.status, data };
  } catch (e: any) {
    return { ok: false, status: 0, data: { error: e?.message || String(e) } };
  }
}

// ── High-level helpers ───────────────────────────────────────────────────────

/** Verify the key works by hitting an authenticated endpoint. */
export async function testPmUsConnection(userId: number): Promise<{ connected: boolean; status: number; detail: any }> {
  // Portfolio positions is a lightweight authenticated GET (per docs auth example path).
  const r = await pmUsRequest(userId, 'GET', '/v1/portfolio/positions');
  return { connected: r.ok, status: r.status, detail: r.data };
}

export async function getPmUsPositions(userId: number) {
  return pmUsRequest(userId, 'GET', '/v1/portfolio/positions');
}

/** Place an order on Polymarket US. body follows the CreateOrderRequest schema. */
export async function placePmUsOrder(userId: number, order: {
  marketSlug: string;
  intent: 'ORDER_INTENT_BUY_LONG' | 'ORDER_INTENT_SELL_LONG' | 'ORDER_INTENT_BUY_SHORT' | 'ORDER_INTENT_SELL_SHORT';
  type: 'ORDER_TYPE_LIMIT' | 'ORDER_TYPE_MARKET';
  quantity: number;
  price?: { value: string; currency: string };
  tif?: string;
}) {
  return pmUsRequest(userId, 'POST', '/v1/orders', order);
}

// ── Public market data (gateway.polymarket.us — no auth) ─────────────────────
const _toNum = (x: any): number => (x && typeof x === 'object' ? parseFloat(x.value) : parseFloat(x)) || 0;

export async function getPmUsMarkets(params: Record<string, string | number> = {}): Promise<any[]> {
  const qs = new URLSearchParams({ active: 'true', closed: 'false', limit: '200', ...(params as any) }).toString();
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/markets?${qs}`, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : (data.markets || []);
  } catch { return []; }
}

/** Find an active crypto market on Polymarket US matching the asset (bitcoin/ethereum). */
export async function findPmUsCryptoMarket(asset = 'bitcoin'): Promise<any | null> {
  const terms = asset === 'bitcoin' ? ['bitcoin', 'btc'] : asset === 'ethereum' ? ['ethereum', 'eth'] : [asset.toLowerCase()];
  const markets = await getPmUsMarkets({ limit: 500 });
  const candidates = markets.filter((m: any) => {
    if (!m.active || m.closed) return false;
    const hay = `${m.title || ''} ${m.question || ''} ${m.slug || ''} ${m.category || ''}`.toLowerCase();
    return terms.some(t => hay.includes(t));
  });
  // Prefer the soonest-resolving so the directional signal has a near-term payoff
  candidates.sort((a: any, b: any) => new Date(a.endDate || 0).getTime() - new Date(b.endDate || 0).getTime());
  return candidates[0] || null;
}

export async function getPmUsBbo(slug: string): Promise<{ bestBid: number; bestAsk: number; currentPx: number } | null> {
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/markets/${encodeURIComponent(slug)}/bbo`, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) return null;
    const d = await res.json();
    const md = d.marketData || d;
    return { bestBid: _toNum(md.bestBid), bestAsk: _toNum(md.bestAsk), currentPx: _toNum(md.currentPx ?? md.lastTradePx ?? md.bestAsk) };
  } catch { return null; }
}
