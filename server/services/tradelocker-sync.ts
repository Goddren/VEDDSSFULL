// ── TradeLocker live balance sync ─────────────────────────────────────────────
// MT5 balances are "live" because the EA pushes account data into an in-memory
// cache (global.mt5AccountData) that the API serves instantly. TradeLocker had no
// equivalent — balances were only pulled on-demand and the dashboard read a stale
// DB field. This service gives TradeLocker the same push-like freshness by running
// a background loop that refreshes balances for recently-active users into
// global.tlAccountData, plus on-demand sync hooks fired when trades open/close.

import { storage } from '../storage';
import { getOrCreateService as tlGetOrCreateService } from '../tradelocker';

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
