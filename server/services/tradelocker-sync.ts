// ── TradeLocker live balance sync ─────────────────────────────────────────────
// MT5 balances are "live" because the EA pushes account data into an in-memory
// cache (global.mt5AccountData) that the API serves instantly. TradeLocker had no
// equivalent — balances were only pulled on-demand and the dashboard read a stale
// DB field. This service gives TradeLocker the same push-like freshness by running
// a background loop that refreshes balances for recently-active users into
// global.tlAccountData, plus on-demand sync hooks fired when trades open/close.

import { storage } from '../storage';
import { getOrCreateService as tlGetOrCreateService } from '../tradelocker';

// accountId -> Set of open-position ticket ids seen on the previous sync pass.
// Used to detect closures (a ticket that was open last cycle and is gone now)
// without needing a webhook — TradeLocker has no EA-style push, so this is
// the only way to auto-detect a trade closing.
const lastOpenTickets = new Map<string, Set<string>>();

export interface TlLiveAccount {
  accountId: string;
  connectionId: number;
  accountType: string;
  broker: string;
  label: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  currency: string;
  lastUpdated: string; // ISO
  error?: string;
}

// userId -> lastSeenMs. Only users seen recently get background-synced so we
// never hammer the TradeLocker API on behalf of idle accounts.
const activeUsers = new Map<number, number>();
const ACTIVE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const SYNC_INTERVAL_MS = 20 * 1000;       // refresh every 20s
const MIN_RESYNC_GAP_MS = 8 * 1000;       // don't resync the same user faster than this

const lastSyncAt = new Map<number, number>();
const inFlight = new Set<number>();

function cache(): Record<number, Record<string, TlLiveAccount>> {
  (global as any).tlAccountData = (global as any).tlAccountData || {};
  return (global as any).tlAccountData;
}

/** Mark a user as active so the background loop keeps their balances fresh. */
export function markTlUserActive(userId: number): void {
  activeUsers.set(userId, Date.now());
}

/**
 * Auto-log every open/closed TradeLocker trade into aiTradeResults — the same
 * table MT5 trades land in — so the trade feed stays current with zero
 * manual entry. Dedup key mirrors MT5's mt5Ticket pattern: `tl_<accountId>_<positionId>`.
 */
async function syncTradeLockerTrades(userId: number, conn: any, svc: any): Promise<void> {
  const cacheKey = `${userId}:${conn.accountId}`;
  const openPositions = await svc.getPositionsNormalized().catch(() => [] as any[]);
  const currentTickets = new Set<string>(openPositions.map((p: any) => `tl_${conn.accountId}_${p.id}`));

  // New/still-open positions — create if we haven't logged this ticket yet
  for (const p of openPositions) {
    const ticket = `tl_${conn.accountId}_${p.id}`;
    const existing = await storage.getAiTradeResultByTicket(userId, ticket);
    if (existing) continue;
    await storage.createAiTradeResult({
      userId,
      symbol: p.symbol,
      direction: (p.side || '').toUpperCase() === 'SELL' ? 'SELL' : 'BUY',
      entryPrice: p.avgPrice || 0,
      aiConfidence: 0,
      result: 'PENDING',
      source: 'tradelocker_auto',
      connectionId: conn.id,
      mt5Ticket: ticket,
    } as any);
  }

  // Positions that were open last cycle but are gone now → closed. Look up
  // realized P&L from filled orders/closed positions to fill in the outcome.
  const previousTickets = lastOpenTickets.get(cacheKey);
  if (previousTickets) {
    const closedTicketIds = Array.from(previousTickets).filter(t => !currentTickets.has(t));
    if (closedTicketIds.length > 0) {
      const closed = await svc.getClosedPositions().catch(() => [] as any[]);
      const closedById = new Map<string, any>(closed.map((c: any) => [`tl_${conn.accountId}_${c.id}`, c] as [string, any]));
      for (const ticket of closedTicketIds) {
        const existing = await storage.getAiTradeResultByTicket(userId, ticket);
        if (!existing || existing.result !== 'PENDING') continue;
        const match = closedById.get(ticket);
        const profit = match ? match.profit : 0;
        const result = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAKEVEN';
        await storage.updateAiTradeResult(existing.id, userId, {
          result,
          profitLoss: profit,
          closedAt: new Date(),
        } as any);
      }
    }
  }
  lastOpenTickets.set(cacheKey, currentTickets);
}

/**
 * Fetch live balances for all active TradeLocker connections of a user and
 * store them in the in-memory cache. Safe to call frequently — self-throttled.
 */
export async function syncUserTradeLocker(userId: number, force = false): Promise<TlLiveAccount[]> {
  const now = Date.now();
  if (!force) {
    const last = lastSyncAt.get(userId) || 0;
    if (now - last < MIN_RESYNC_GAP_MS) {
      return Object.values(cache()[userId] || {});
    }
  }
  if (inFlight.has(userId)) {
    return Object.values(cache()[userId] || {});
  }
  inFlight.add(userId);
  try {
    const connections = await storage.getUserTradelockerConnections(userId);
    const active = connections.filter((c: any) => c.isActive);
    const store = cache();
    store[userId] = store[userId] || {};

    // Prune cache entries for connections that are no longer active
    const activeIds = new Set(active.map((c: any) => c.accountId));
    for (const key of Object.keys(store[userId])) {
      if (!activeIds.has(key)) delete store[userId][key];
    }

    // Sequential to avoid concurrent auth storms against the TL API
    for (const conn of active) {
      try {
        const svc = await tlGetOrCreateService(conn);
        const info = await svc.getAccountInfo();
        store[userId][conn.accountId] = {
          accountId: conn.accountId,
          connectionId: conn.id,
          accountType: conn.accountType,
          broker: (conn as any).brokerName || 'TradeLocker',
          label: `TradeLocker – ${conn.email} (${conn.accountType})`,
          balance: info.balance || 0,
          equity: info.equity || 0,
          margin: info.margin || 0,
          freeMargin: info.freeMargin || 0,
          currency: info.currency || 'USD',
          lastUpdated: new Date().toISOString(),
        };
        // Keep the legacy balance cache used for proportional lot sizing in sync
        (global as any).tlAccountBalances = (global as any).tlAccountBalances || {};
        (global as any).tlAccountBalances[userId] = (global as any).tlAccountBalances[userId] || {};
        if (info.balance > 0) (global as any).tlAccountBalances[userId][conn.accountId] = info.balance;

        // Auto-log this account's trades — no manual entry, no EA/webhook
        // needed. TradeLocker has no push mechanism like MT5's EA, so this
        // poll-and-diff is the only way to detect a trade closing.
        await syncTradeLockerTrades(userId, conn, svc).catch(err =>
          console.error(`[TL-sync] Trade auto-log failed for ${conn.accountId} (non-fatal):`, err.message)
        );
      } catch (err: any) {
        const prev = store[userId][conn.accountId];
        store[userId][conn.accountId] = {
          accountId: conn.accountId,
          connectionId: conn.id,
          accountType: conn.accountType,
          broker: (conn as any).brokerName || 'TradeLocker',
          label: `TradeLocker – ${conn.email} (${conn.accountType})`,
          balance: prev?.balance || 0,
          equity: prev?.equity || 0,
          margin: prev?.margin || 0,
          freeMargin: prev?.freeMargin || 0,
          currency: prev?.currency || 'USD',
          lastUpdated: prev?.lastUpdated || new Date(0).toISOString(),
          error: err?.message || 'fetch failed',
        };
      }
    }
    lastSyncAt.set(userId, Date.now());
    return Object.values(store[userId]);
  } finally {
    inFlight.delete(userId);
  }
}

/**
 * Return the cached live accounts for a user, decorated with freshness info.
 * Marks the user active and triggers a background refresh if data is stale.
 */
export function getTlAccountData(userId: number): {
  connected: boolean;
  accounts: (TlLiveAccount & { secondsAgo: number; isConnected: boolean })[];
  totalBalance: number;
  totalEquity: number;
} {
  markTlUserActive(userId);
  const store = cache()[userId] || {};
  const now = Date.now();
  const accounts = Object.values(store).map(a => {
    const secondsAgo = Math.floor((now - new Date(a.lastUpdated).getTime()) / 1000);
    return { ...a, secondsAgo, isConnected: secondsAgo < 120 && !a.error };
  });
  return {
    connected: accounts.some(a => a.isConnected),
    accounts,
    totalBalance: accounts.reduce((s, a) => s + (a.balance || 0), 0),
    totalEquity: accounts.reduce((s, a) => s + (a.equity || 0), 0),
  };
}

/** Fire-and-forget resync — call right after a TradeLocker trade opens/closes. */
export function refreshTlAfterTrade(userId: number): void {
  markTlUserActive(userId);
  syncUserTradeLocker(userId, true).catch(() => {});
}

let started = false;
/** Start the background loop that keeps active users' TL balances live. */
export function startTradeLockerSync(): void {
  if (started) return;
  started = true;
  setInterval(async () => {
    const now = Date.now();
    for (const [userId, seenAt] of activeUsers.entries()) {
      if (now - seenAt > ACTIVE_WINDOW_MS) {
        activeUsers.delete(userId);
        continue;
      }
      try {
        await syncUserTradeLocker(userId);
      } catch { /* per-user failure is non-fatal */ }
    }
  }, SYNC_INTERVAL_MS);
  console.log('[TL-sync] Background TradeLocker balance sync started (20s interval).');
}
