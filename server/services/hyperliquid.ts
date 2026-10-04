// Hyperliquid perpetuals client — info reads, L1 action signing, orders.
//
// Auth model: the engine NEVER holds the account's main wallet key. The user
// creates an "API wallet" (agent) on app.hyperliquid.xyz → More → API, approves
// it for their account, and pastes the agent's key here. An agent key can place
// and cancel orders for the account but CANNOT withdraw or transfer funds.
//
// Signing follows the official Python SDK (hyperliquid-python-sdk, signing.py):
//   hash = keccak256( msgpack(action) ‖ nonce(u64 BE) ‖ vaultFlag[‖ vault] )
//   sign EIP-712 Agent{ source: 'a'|'b', connectionId: hash }
//   domain { name:'Exchange', version:'1', chainId:1337, verifyingContract:0x0 }
// msgpack key ORDER matters (it is part of the hash), so every action object
// below is built with keys in the SDK's exact order.

import { Wallet, keccak256, getBytes, Signature } from 'ethers';

const MAINNET_URL = 'https://api.hyperliquid.xyz';
const TESTNET_URL = 'https://api.hyperliquid-testnet.xyz';

export interface HlCreds {
  agentKey: string;          // decrypted API-wallet private key
  accountAddress: string;    // the account whose funds are traded (master)
  vaultAddress?: string | null; // sub-account / vault, when trading one
  testnet: boolean;
}

function baseUrl(testnet: boolean) { return testnet ? TESTNET_URL : MAINNET_URL; }

/** The address whose balance and positions the engine trades. */
export function tradedAddress(c: { accountAddress: string; vaultAddress?: string | null }) {
  return (c.vaultAddress || c.accountAddress).toLowerCase();
}

async function post(testnet: boolean, path: '/info' | '/exchange', body: any): Promise<any> {
  const r = await fetch(baseUrl(testnet) + path, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000),
  });
  const text = await r.text();
  let j: any;
  try { j = JSON.parse(text); } catch { throw new Error(`Hyperliquid ${path} HTTP ${r.status}: ${text.slice(0, 200)}`); }
  if (!r.ok) throw new Error(`Hyperliquid ${path} HTTP ${r.status}: ${text.slice(0, 200)}`);
  return j;
}

export const info = (testnet: boolean, body: any) => post(testnet, '/info', body);

// ── Market data ───────────────────────────────────────────────────────────────

export interface HlAsset { name: string; index: number; szDecimals: number; maxLeverage: number; onlyIsolated: boolean; isDelisted: boolean }

const metaCache = new Map<string, { at: number; assets: Map<string, HlAsset> }>();
export async function getMeta(testnet: boolean): Promise<Map<string, HlAsset>> {
  const key = testnet ? 't' : 'm';
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.assets;
  const j = await info(testnet, { type: 'meta' });
  const assets = new Map<string, HlAsset>();
  (j?.universe ?? []).forEach((u: any, i: number) => {
    assets.set(String(u.name).toUpperCase(), {
      name: u.name, index: i, szDecimals: Number(u.szDecimals) || 0,
      maxLeverage: Number(u.maxLeverage) || 1, onlyIsolated: !!u.onlyIsolated, isDelisted: !!u.isDelisted,
    });
  });
  if (!assets.size) throw new Error('Hyperliquid meta returned no assets');
  metaCache.set(key, { at: Date.now(), assets });
  return assets;
}

export async function getMid(testnet: boolean, coin: string): Promise<number | null> {
  const j = await info(testnet, { type: 'allMids' }).catch(() => null);
  const asset = (await getMeta(testnet).catch(() => null))?.get(coin.toUpperCase());
  const v = Number(j?.[asset?.name ?? coin]);
  return v > 0 ? v : null;
}

const HL_INTERVAL_MS: Record<string, number> = { '1m': 60e3, '5m': 300e3, '15m': 900e3, '30m': 1800e3, '1h': 3600e3, '4h': 14400e3, '1d': 86400e3 };

/** OHLCV bars, oldest first — the same shape every engine strategy consumes. */
export async function getCandles(coin: string, timeframe: string, count: number, testnet = false) {
  const interval = HL_INTERVAL_MS[timeframe] ? timeframe : '5m';
  const endTime = Date.now();
  const startTime = endTime - HL_INTERVAL_MS[interval] * (count + 2);
  const asset = (await getMeta(testnet)).get(coin.toUpperCase());
  const j = await info(testnet, { type: 'candleSnapshot', req: { coin: asset?.name ?? coin, interval, startTime, endTime } });
  if (!Array.isArray(j)) return [];
  return j.slice(-count).map((b: any) => ({ t: Number(b.t), o: Number(b.o), h: Number(b.h), l: Number(b.l), c: Number(b.c), v: Number(b.v) }));
}

// ── Account reads ─────────────────────────────────────────────────────────────

export interface HlPosition { coin: string; szi: number; entryPx: number; unrealizedPnl: number; liquidationPx: number | null; leverage: number | null }
export interface HlAccount { accountValue: number; withdrawable: number; marginUsed: number; positions: HlPosition[] }

export async function getAccount(testnet: boolean, user: string): Promise<HlAccount> {
  const j = await info(testnet, { type: 'clearinghouseState', user });
  if (!j || !j.marginSummary) throw new Error('Hyperliquid returned no account state');
  const positions: HlPosition[] = (j.assetPositions ?? []).map((ap: any) => ap.position).filter(Boolean).map((p: any) => ({
    coin: String(p.coin), szi: Number(p.szi) || 0, entryPx: Number(p.entryPx) || 0,
    unrealizedPnl: Number(p.unrealizedPnl) || 0,
    liquidationPx: p.liquidationPx != null ? Number(p.liquidationPx) : null,
    leverage: p.leverage?.value != null ? Number(p.leverage.value) : null,
  })).filter((p: HlPosition) => p.szi !== 0);
  return {
    accountValue: Number(j.marginSummary.accountValue) || 0,
    withdrawable: Number(j.withdrawable) || 0,
    marginUsed: Number(j.marginSummary.totalMarginUsed) || 0,
    positions,
  };
}

export async function getOpenOrders(testnet: boolean, user: string): Promise<any[]> {
  const j = await info(testnet, { type: 'frontendOpenOrders', user });
  return Array.isArray(j) ? j : [];
}

export async function getFillsSince(testnet: boolean, user: string, startTime: number): Promise<any[]> {
  const j = await info(testnet, { type: 'userFillsByTime', user, startTime });
  return Array.isArray(j) ? j : [];
}

/** What Hyperliquid thinks an address is: 'agent' (with its master), 'user', 'missing', … */
export async function getUserRole(testnet: boolean, user: string): Promise<{ role: string; master?: string }> {
  const j = await info(testnet, { type: 'userRole', user }).catch(() => null);
  return { role: String(j?.role ?? 'unknown'), master: j?.data?.user };
}

export function agentAddress(agentKey: string): string {
  return new Wallet(agentKey.trim()).address;
}

// ── Wire formatting (mirrors the SDK's float_to_wire / price rounding) ────────

export function floatToWire(x: number): string {
  let s = x.toFixed(8);
  if (Math.abs(Number(s) - x) >= 1e-12) {
    throw new Error(`floatToWire would round ${x}`);
  }
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0' || s === '') s = '0';
  return s;
}

/** Perp price: ≤5 significant figures and ≤(6 − szDecimals) decimals; integers always valid. */
export function roundPrice(px: number, szDecimals: number): number {
  if (Number.isInteger(px)) return px;
  const sig = Number(px.toPrecision(5));
  const dec = Math.max(0, 6 - szDecimals);
  return Number(sig.toFixed(dec));
}

/** Size floored to the asset's lot (never round a size UP past what was intended). */
export function roundSize(sz: number, szDecimals: number): number {
  const f = 10 ** szDecimals;
  return Math.floor(sz * f + 1e-9) / f;
}

// ── msgpack (only the types Hyperliquid actions use) ──────────────────────────

function packInto(out: number[], v: any): void {
  if (v === null || v === undefined) { out.push(0xc0); return; }
  if (v === true) { out.push(0xc3); return; }
  if (v === false) { out.push(0xc2); return; }
  if (typeof v === 'number') {
    if (!Number.isInteger(v) || v < 0) throw new Error(`msgpack: unsupported number ${v}`);
    if (v < 0x80) out.push(v);
    else if (v < 0x100) out.push(0xcc, v);
    else if (v < 0x10000) out.push(0xcd, v >> 8, v & 0xff);
    else if (v < 0x100000000) out.push(0xce, (v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
    else { const b = BigInt(v); out.push(0xcf); for (let i = 7; i >= 0; i--) out.push(Number((b >> BigInt(i * 8)) & BigInt(255))); }
    return;
  }
  if (typeof v === 'string') {
    const bytes = Array.from(new TextEncoder().encode(v));
    const n = bytes.length;
    if (n < 32) out.push(0xa0 | n);
    else if (n < 0x100) out.push(0xd9, n);
    else out.push(0xda, n >> 8, n & 0xff);
    out.push(...bytes);
    return;
  }
  if (Array.isArray(v)) {
    if (v.length < 16) out.push(0x90 | v.length); else out.push(0xdc, v.length >> 8, v.length & 0xff);
    for (const x of v) packInto(out, x);
    return;
  }
  if (typeof v === 'object') {
    const keys = Object.keys(v).filter((k) => v[k] !== undefined);
    if (keys.length < 16) out.push(0x80 | keys.length); else out.push(0xde, keys.length >> 8, keys.length & 0xff);
    for (const k of keys) { packInto(out, k); packInto(out, v[k]); }
    return;
  }
  throw new Error(`msgpack: unsupported type ${typeof v}`);
}

export function msgpack(v: any): Uint8Array { const out: number[] = []; packInto(out, v); return Uint8Array.from(out); }

export function actionHash(action: any, vaultAddress: string | null | undefined, nonce: number): string {
  const body = msgpack(action);
  const tail: number[] = [];
  const n = BigInt(nonce);
  for (let i = 7; i >= 0; i--) tail.push(Number((n >> BigInt(i * 8)) & BigInt(255)));
  if (!vaultAddress) tail.push(0);
  else { tail.push(1); tail.push(...Array.from(getBytes(vaultAddress))); }
  const data = new Uint8Array(body.length + tail.length);
  data.set(body, 0); data.set(tail, body.length);
  return keccak256(data);
}

let lastNonce = 0;
function nextNonce(): number { const n = Math.max(Date.now(), lastNonce + 1); lastNonce = n; return n; }

async function signL1(c: HlCreds, action: any, nonce: number) {
  const vault = c.vaultAddress || null;
  const connectionId = actionHash(action, vault, nonce);
  const wallet = new Wallet(c.agentKey.trim());
  const sig = await wallet.signTypedData(
    { name: 'Exchange', version: '1', chainId: 1337, verifyingContract: '0x0000000000000000000000000000000000000000' },
    { Agent: [{ name: 'source', type: 'string' }, { name: 'connectionId', type: 'bytes32' }] },
    { source: c.testnet ? 'b' : 'a', connectionId },
  );
  const s = Signature.from(sig);
  return { r: s.r, s: s.s, v: s.v };
}

async function exchange(c: HlCreds, action: any): Promise<any> {
  const nonce = nextNonce();
  const signature = await signL1(c, action, nonce);
  const j = await post(c.testnet, '/exchange', { action, nonce, signature, vaultAddress: c.vaultAddress || null });
  if (j?.status !== 'ok') throw new Error(`Hyperliquid rejected ${action.type}: ${typeof j?.response === 'string' ? j.response : JSON.stringify(j).slice(0, 300)}`);
  return j.response;
}

// ── Actions ───────────────────────────────────────────────────────────────────

export async function updateLeverage(c: HlCreds, asset: number, leverage: number, isCross: boolean) {
  return exchange(c, { type: 'updateLeverage', asset, isCross, leverage: Math.max(1, Math.floor(leverage)) });
}

export interface HlOrderResult { filled: boolean; resting: boolean; totalSz: number; avgPx: number; oid: number | null; error?: string }

function parseStatus(resp: any): HlOrderResult {
  const st = resp?.data?.statuses?.[0];
  if (st?.filled) return { filled: true, resting: false, totalSz: Number(st.filled.totalSz) || 0, avgPx: Number(st.filled.avgPx) || 0, oid: st.filled.oid ?? null };
  if (st?.resting) return { filled: false, resting: true, totalSz: 0, avgPx: 0, oid: st.resting.oid ?? null };
  return { filled: false, resting: false, totalSz: 0, avgPx: 0, oid: null, error: st?.error ? String(st.error) : `unexpected order status ${JSON.stringify(st ?? resp).slice(0, 200)}` };
}

/**
 * Marketable IOC limit order — Hyperliquid has no true market order; the SDK's
 * market_open does exactly this (mid ± slippage, Ioc). Unfilled remainder is
 * cancelled by the exchange, never left resting.
 */
export async function marketOrder(c: HlCreds, a: HlAsset, isBuy: boolean, size: number, refPx: number, reduceOnly: boolean, slippage = 0.01): Promise<HlOrderResult> {
  const px = roundPrice(refPx * (isBuy ? 1 + slippage : 1 - slippage), a.szDecimals);
  const sz = roundSize(size, a.szDecimals);
  if (!(sz > 0)) return { filled: false, resting: false, totalSz: 0, avgPx: 0, oid: null, error: `size rounds to 0 at ${a.szDecimals} decimals` };
  const order = { a: a.index, b: isBuy, p: floatToWire(px), s: floatToWire(sz), r: reduceOnly, t: { limit: { tif: 'Ioc' } } };
  return parseStatus(await exchange(c, { type: 'order', orders: [order], grouping: 'na' }));
}

/** Exchange-side reduce-only stop: a market trigger that lives on Hyperliquid, so the
 *  position stays protected even if the engine/worker is down. */
export async function placeStopLoss(c: HlCreds, a: HlAsset, positionIsLong: boolean, size: number, triggerPx: number): Promise<HlOrderResult> {
  const trig = roundPrice(triggerPx, a.szDecimals);
  // The closing side is the opposite of the position. Its limit price is a wide
  // worst-case bound so the triggered market order is not left unfilled.
  const isBuy = !positionIsLong;
  const limitPx = roundPrice(trig * (isBuy ? 1.1 : 0.9), a.szDecimals);
  const order = {
    a: a.index, b: isBuy, p: floatToWire(limitPx), s: floatToWire(roundSize(size, a.szDecimals)), r: true,
    t: { trigger: { isMarket: true, triggerPx: floatToWire(trig), tpsl: 'sl' } },
  };
  return parseStatus(await exchange(c, { type: 'order', orders: [order], grouping: 'na' }));
}

export async function cancelOrders(c: HlCreds, cancels: Array<{ a: number; o: number }>) {
  if (!cancels.length) return null;
  return exchange(c, { type: 'cancel', cancels: cancels.map((x) => ({ a: x.a, o: x.o })) });
}
