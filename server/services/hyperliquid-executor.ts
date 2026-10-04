// Hyperliquid perps execution for the crypto auto-engine. Long AND short.
//
// Every entry is: verify → marketable IOC order → confirm the FILL from the
// exchange response → place an exchange-side reduce-only stop. Every exit is:
// read the live position → reduce-only IOC close → confirm the fill. Nothing is
// booked from a quote, and a position that is already gone is resolved from the
// account's real fills (e.g. the exchange stop fired while the worker was down).
//
// Trading is OFF until the user turns on auto_trade_enabled for the connection.

import { pool } from '../db';
import { decryptApiSecret } from '../cryptocom';
import * as hl from './hyperliquid';

const DDL = `
CREATE TABLE IF NOT EXISTS "hyperliquid_connections" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "label" text,
  "account_address" text NOT NULL,
  "vault_address" text,
  "agent_address" text NOT NULL,
  "encrypted_agent_key" text NOT NULL,
  "is_testnet" boolean NOT NULL DEFAULT false,
  "is_prop_account" boolean NOT NULL DEFAULT true,
  "is_active" boolean NOT NULL DEFAULT true,
  "auto_trade_enabled" boolean NOT NULL DEFAULT false,
  "notional_usd" real NOT NULL DEFAULT 25,
  "leverage" integer NOT NULL DEFAULT 3,
  "stop_loss_pct" real NOT NULL DEFAULT 1.5,
  "take_profit_pct" real NOT NULL DEFAULT 3,
  "symbols" text NOT NULL DEFAULT 'BTC,ETH,SOL',
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "hyperliquid_connections_user_unique" UNIQUE ("user_id")
);
`;

export async function ensureHyperliquidTable(): Promise<void> {
  try {
    await pool.query(DDL);
    console.log('[startup] Hyperliquid connections table ensured (hyperliquid_connections).');
  } catch (err: any) {
    console.error('[startup] ensureHyperliquidTable failed (non-fatal):', err?.message ?? err);
  }
}

export interface HlConnection {
  id: number; userId: number; label: string | null;
  accountAddress: string; vaultAddress: string | null; agentAddress: string;
  isTestnet: boolean; isPropAccount: boolean; isActive: boolean; autoTradeEnabled: boolean;
  notionalUsd: number; leverage: number; stopLossPct: number; takeProfitPct: number; symbols: string[];
}

function rowToConn(r: any): HlConnection {
  return {
    id: r.id, userId: r.user_id, label: r.label,
    accountAddress: r.account_address, vaultAddress: r.vault_address, agentAddress: r.agent_address,
    isTestnet: !!r.is_testnet, isPropAccount: !!r.is_prop_account, isActive: !!r.is_active, autoTradeEnabled: !!r.auto_trade_enabled,
    notionalUsd: Number(r.notional_usd) || 25, leverage: Number(r.leverage) || 1,
    stopLossPct: Number(r.stop_loss_pct) || 1.5, takeProfitPct: Number(r.take_profit_pct) || 3,
    symbols: String(r.symbols || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
  };
}

export async function getHyperliquidConnection(userId: number): Promise<HlConnection | null> {
  const { rows } = await pool.query(`SELECT * FROM hyperliquid_connections WHERE user_id=$1 AND is_active=true LIMIT 1`, [userId]).catch(() => ({ rows: [] as any[] }));
  return rows[0] ? rowToConn(rows[0]) : null;
}

async function loadCreds(userId: number): Promise<{ conn: HlConnection; creds: hl.HlCreds } | null> {
  const { rows } = await pool.query(`SELECT * FROM hyperliquid_connections WHERE user_id=$1 AND is_active=true LIMIT 1`, [userId]);
  if (!rows[0]) return null;
  const conn = rowToConn(rows[0]);
  return { conn, creds: { agentKey: decryptApiSecret(rows[0].encrypted_agent_key), accountAddress: conn.accountAddress, vaultAddress: conn.vaultAddress, testnet: conn.isTestnet } };
}

/** Engine symbols for Hyperliquid are 'HL:<COIN>' so candles/prices route here. */
export const HL_PREFIX = 'HL:';
export function hlCoin(symbol: string): string {
  let s = String(symbol || '').toUpperCase();
  if (s.startsWith(HL_PREFIX)) return s.slice(HL_PREFIX.length);
  s = s.replace(/-PERP$/, '').replace(/[-_/]?(USDT|USDC|USD)$/, '');
  const alias: Record<string, string> = { WETH: 'ETH', WBTC: 'BTC', CBBTC: 'BTC' };
  return alias[s] ?? s;
}

// A short per-user cache so the monitor's "is the position still there?" check
// does not hit the API once per trade per cycle.
const acctCache = new Map<number, { at: number; acct: hl.HlAccount }>();
async function readAccount(userId: number, testnet: boolean, user: string, maxAgeMs = 15_000): Promise<hl.HlAccount> {
  const hit = acctCache.get(userId);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.acct;
  const acct = await hl.getAccount(testnet, user);
  acctCache.set(userId, { at: Date.now(), acct });
  return acct;
}

export async function hlAccountValue(userId: number): Promise<number | null> {
  const c = await getHyperliquidConnection(userId);
  if (!c) return null;
  const a = await readAccount(userId, c.isTestnet, hl.tradedAddress(c)).catch(() => null);
  return a ? a.accountValue : null;
}

export async function hlMid(userId: number, symbol: string): Promise<number | null> {
  const c = await getHyperliquidConnection(userId);
  return hl.getMid(c?.isTestnet ?? false, hlCoin(symbol));
}

/** true = open on the exchange, false = definitely gone, null = couldn't read. */
export async function hlPositionOpen(userId: number, symbol: string, direction: 'long' | 'short'): Promise<boolean | null> {
  const c = await getHyperliquidConnection(userId);
  if (!c) return null;
  const a = await readAccount(userId, c.isTestnet, hl.tradedAddress(c)).catch(() => null);
  if (!a) return null;
  const coin = hlCoin(symbol);
  const p = a.positions.find((x) => x.coin.toUpperCase() === coin);
  return !!p && (direction === 'long' ? p.szi > 0 : p.szi < 0);
}

export interface HlEntryResult {
  ok: boolean; skipped?: boolean; reason?: string; connectionId?: number;
  coin?: string; qty?: number; entryPrice?: number; orderId?: string;
  stopLoss?: number; takeProfit?: number; stopPlaced?: boolean; notionalUsd?: number; testnet?: boolean;
}

export async function hyperliquidEntry(userId: number, symbol: string, direction: 'BUY' | 'SELL', riskMultiplier: number): Promise<HlEntryResult> {
  const loaded = await loadCreds(userId);
  if (!loaded) return { ok: false, skipped: true, reason: 'no active Hyperliquid connection' };
  const { conn, creds } = loaded;
  if (!conn.autoTradeEnabled) return { ok: false, skipped: true, reason: 'Hyperliquid auto-trade is OFF for this account' };
  const coin = hlCoin(symbol);
  if (!conn.symbols.includes(coin)) return { ok: false, skipped: true, reason: `${coin} isn't in this account's Hyperliquid symbol list (${conn.symbols.join(', ')})` };

  const asset = (await hl.getMeta(conn.isTestnet)).get(coin);
  if (!asset || asset.isDelisted) return { ok: false, skipped: true, reason: `${coin} isn't a tradeable Hyperliquid perp` };

  const user = hl.tradedAddress(conn);
  const acct = await readAccount(userId, conn.isTestnet, user, 0);
  // One position per coin, checked on the EXCHANGE (covers manual trades and
  // anything the DB doesn't know about) as well as in our own trade table.
  if (acct.positions.some((p) => p.coin.toUpperCase() === coin)) {
    return { ok: false, skipped: true, reason: `already holding a ${coin} position on Hyperliquid — not adding another` };
  }
  const held = await pool.query(
    `SELECT 1 FROM cryptocom_engine_trades WHERE user_id=$1 AND venue='hyperliquid' AND status IN ('open','closing') AND symbol=$2 LIMIT 1`,
    [userId, HL_PREFIX + coin],
  ).catch(() => null);
  if (!held || held.rows.length) return { ok: false, skipped: true, reason: held ? `already tracking an open ${coin} trade` : `couldn't verify existing positions — skipping to be safe` };

  const leverage = Math.max(1, Math.min(conn.leverage, asset.maxLeverage));
  const notional = conn.notionalUsd * (riskMultiplier < 1 ? riskMultiplier : 1);
  if (notional < 11) return { ok: false, skipped: true, reason: `order value $${notional.toFixed(2)} is below Hyperliquid's $10 minimum` };
  const marginNeeded = notional / leverage;
  if (acct.withdrawable < marginNeeded * 1.1) {
    return { ok: false, skipped: true, reason: `insufficient margin: $${acct.withdrawable.toFixed(2)} available, trade needs ~$${marginNeeded.toFixed(2)} at ${leverage}x` };
  }

  const mid = await hl.getMid(conn.isTestnet, coin);
  if (!mid) return { ok: false, reason: `no Hyperliquid mid price for ${coin}` };
  const size = hl.roundSize(notional / mid, asset.szDecimals);
  if (!(size > 0)) return { ok: false, skipped: true, reason: `size rounds to 0 for ${coin}` };

  // Isolated margin caps what one position can lose to its own margin.
  try {
    await hl.updateLeverage(creds, asset.index, leverage, false);
  } catch (e: any) {
    return { ok: false, reason: `couldn't set ${leverage}x isolated leverage — ${e?.message ?? e}` };
  }

  const isBuy = direction === 'BUY';
  const fill = await hl.marketOrder(creds, asset, isBuy, size, mid, false);
  acctCache.delete(userId);
  if (!fill.filled || !(fill.totalSz > 0) || !(fill.avgPx > 0)) {
    return { ok: false, reason: fill.error ? `order not filled — ${fill.error}` : 'order not filled (IOC expired unfilled)' };
  }

  const isLong = isBuy;
  const stopLoss = fill.avgPx * (isLong ? 1 - conn.stopLossPct / 100 : 1 + conn.stopLossPct / 100);
  const takeProfit = fill.avgPx * (isLong ? 1 + conn.takeProfitPct / 100 : 1 - conn.takeProfitPct / 100);
  let stopPlaced = false;
  let stopNote = '';
  try {
    const sl = await hl.placeStopLoss(creds, asset, isLong, fill.totalSz, stopLoss);
    stopPlaced = sl.resting || sl.filled;
    if (!stopPlaced) stopNote = sl.error ?? 'unknown';
  } catch (e: any) { stopNote = e?.message ?? String(e); }
  if (!stopPlaced) console.error(`[hyperliquid] ${coin} filled but the exchange stop was NOT placed (${stopNote}) — the engine monitor is the only stop for this position`);

  return {
    ok: true, connectionId: conn.id, coin, qty: fill.totalSz, entryPrice: fill.avgPx, orderId: String(fill.oid ?? ''),
    stopLoss, takeProfit, stopPlaced, reason: stopPlaced ? undefined : `exchange stop not placed: ${stopNote}`,
    notionalUsd: fill.totalSz * fill.avgPx, testnet: conn.isTestnet,
  };
}

async function cancelCoinStops(creds: hl.HlCreds, asset: hl.HlAsset): Promise<void> {
  const orders = await hl.getOpenOrders(creds.testnet, hl.tradedAddress(creds)).catch(() => []);
  const mine = orders.filter((o: any) => String(o.coin).toUpperCase() === asset.name.toUpperCase() && o.reduceOnly && o.isTrigger);
  if (mine.length) await hl.cancelOrders(creds, mine.map((o: any) => ({ a: asset.index, o: Number(o.oid) }))).catch((e: any) =>
    console.error(`[hyperliquid] couldn't cancel leftover ${asset.name} stop orders: ${e?.message ?? e}`));
}

export interface HlExitResult { ok: boolean; exitPrice: number; reason?: string; phantom?: boolean; closedOnExchange?: boolean }

export async function hyperliquidExit(userId: number, trade: { symbol: string; direction: string; quantity: number; createdAt?: any }): Promise<HlExitResult> {
  const loaded = await loadCreds(userId);
  if (!loaded) return { ok: false, exitPrice: 0, reason: 'no active Hyperliquid connection' };
  const { conn, creds } = loaded;
  const coin = hlCoin(trade.symbol);
  const asset = (await hl.getMeta(conn.isTestnet)).get(coin);
  if (!asset) return { ok: false, exitPrice: 0, reason: `${coin} not found in Hyperliquid meta` };
  const user = hl.tradedAddress(conn);
  const isLong = trade.direction === 'long';

  const acct = await readAccount(userId, conn.isTestnet, user, 0);
  const pos = acct.positions.find((p) => p.coin.toUpperCase() === coin);
  const held = pos && (isLong ? pos.szi > 0 : pos.szi < 0) ? Math.abs(pos.szi) : 0;

  if (held <= 0) {
    // Gone from the exchange — most likely the exchange stop fired. Book it at
    // the REAL closing fills, never at a guessed price.
    const since = trade.createdAt ? new Date(trade.createdAt).getTime() : Date.now() - 7 * 86400e3;
    const fills = await hl.getFillsSince(conn.isTestnet, user, since).catch(() => null);
    const closes = (fills ?? []).filter((f: any) => String(f.coin).toUpperCase() === coin && String(f.dir || '').startsWith('Close') && String(f.dir).includes(isLong ? 'Long' : 'Short'));
    const sz = closes.reduce((s: number, f: any) => s + Number(f.sz || 0), 0);
    if (sz > 0) {
      const px = closes.reduce((s: number, f: any) => s + Number(f.px) * Number(f.sz), 0) / sz;
      await cancelCoinStops(creds, asset);
      return { ok: true, exitPrice: px, closedOnExchange: true };
    }
    return { ok: false, exitPrice: 0, phantom: fills !== null, reason: fills === null ? 'couldn\'t read Hyperliquid fills' : `no ${coin} ${isLong ? 'long' : 'short'} on Hyperliquid and no closing fill found since entry` };
  }

  const qty = Math.min(held, trade.quantity);
  const mid = await hl.getMid(conn.isTestnet, coin);
  if (!mid) return { ok: false, exitPrice: 0, reason: `no Hyperliquid mid price for ${coin}` };
  const fill = await hl.marketOrder(creds, asset, !isLong, qty, mid, true);
  acctCache.delete(userId);
  if (!fill.filled || !(fill.totalSz > 0)) return { ok: false, exitPrice: 0, reason: fill.error ? `close not filled — ${fill.error}` : 'close not filled (IOC expired)' };
  if (fill.totalSz < qty * 0.999) {
    // Partial: leave the trade open so the next cycle closes the remainder.
    return { ok: false, exitPrice: fill.avgPx, reason: `close only partly filled (${fill.totalSz} of ${qty}) — retrying the rest next cycle` };
  }
  await cancelCoinStops(creds, asset);
  return { ok: true, exitPrice: fill.avgPx };
}
