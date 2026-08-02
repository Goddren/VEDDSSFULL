// ── TradeLocker live balance sync ─────────────────────────────────────────────
// MT5 balances are "live" because the EA pushes account data into an in-memory
// cache (global.mt5AccountData) that the API serves instantly. TradeLocker had no
// equivalent — balances were only pulled on-demand and the dashboard read a stale
// DB field. This service gives TradeLocker the same push-like freshness by running
// a background loop that refreshes balances for recently-active users into
// global.tlAccountData, plus on-demand sync hooks fired when trades open/close.

import { storage } from '../storage';
import { getOrCreateService as tlGetOrCreateService } from '../tradelocker';
import { recordRealizedPnl } from './prop-firm-consistency';

// accountId -> Set of open-position ticket ids seen on the previous sync pass.
// Used to detect closures (a ticket that was open last cycle and is gone now)
// without needing a webhook — TradeLocker has no EA-style push, so this is
// the only way to auto-detect a trade closing.
const lastOpenTickets = new Map<string, Set<string>>();

// Per-connection throttle for the order-history reconciliation. The poll-and-diff
// above only catches a close if we saw the position OPEN in a prior in-memory
// cycle — so closes that happen across a deploy (memory wiped) or between polls
// are missed forever. This reconciliation pulls the broker's real ordersHistory
// and backfills ANY closed trade the DB is missing, independent of what we saw
// open. Throttled to keep it gentle on the login/API rate limit.
const lastOutcomeReconcile = new Map<string, number>();
const OUTCOME_RECONCILE_MS = 5 * 60 * 1000; // every 5 min per connection

// Throttle DB writes of the balance snapshot (don't write every 20s sync).
const lastBalancePersist = new Map<string, { at: number; balance: number }>();
const BALANCE_PERSIST_MS = 60 * 1000;

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
      // Keyed by positionId — matches the ticket format used when the position
      // was first logged as PENDING (`tl_<accountId>_<positionId>`). Previously
      // this was keyed by the exit order's own id, which never matched the
      // PENDING ticket, so every close silently fell back to profit=0/BREAKEVEN.
      const closedById = new Map<string, any>(closed.map((c: any) => [`tl_${conn.accountId}_${c.positionId}`, c] as [string, any]));
      for (const ticket of closedTicketIds) {
        const existing = await storage.getAiTradeResultByTicket(userId, ticket);
        if (!existing || existing.result !== 'PENDING') continue;
        const match = closedById.get(ticket);
        const profit = match ? match.profit : 0;
        const result = profit > 0 ? 'WIN' : profit < 0 ? 'LOSS' : 'BREAKEVEN';
        await storage.updateAiTradeResult(existing.id, userId, {
          result,
          profitLoss: profit,
          closedAt: match?.closeTime ? new Date(match.closeTime) : new Date(),
        } as any);
        const dStr = match?.closeTime ? new Date(match.closeTime).toISOString().slice(0, 10) : undefined;
        await recordRealizedPnl(userId, conn.id, 'tradelocker', profit, dStr);
        // Resolve any matching PENDING 2nd-confirmation record so the Brain
        // Dashboard reflects real TradeLocker outcomes — previously this only
        // happened for MT5 closed trades, so an account trading exclusively on
        // TradeLocker (like this account) never had a single confirmation
        // resolve to WIN/LOSS, no matter how many real trades closed.
        try {
          await storage.resolveConfirmationOutcome(userId, existing.symbol, existing.direction, result, null);
        } catch { /* non-critical */ }
      }
    }
  }
  lastOpenTickets.set(cacheKey, currentTickets);

  // ── Order-history reconciliation (throttled) ────────────────────────────
  // Reliable backfill of closed trades regardless of whether we observed them
  // open. This is what keeps the closed-trades feed + realized P&L current
  // across deploys and fast open→close cycles that poll-and-diff misses.
  const lastRecon = lastOutcomeReconcile.get(cacheKey) || 0;
  if (Date.now() - lastRecon >= OUTCOME_RECONCILE_MS) {
    lastOutcomeReconcile.set(cacheKey, Date.now());
    try {
      const fromTs = Math.floor((Date.now() - 14 * 24 * 3600 * 1000) / 1000); // last 14 days
      const closedTrades = await svc.getClosedTradesWithPnl(fromTs).catch(() => [] as any[]);
      for (const o of closedTrades) {
        const rawProfit = o.profit ?? o.pnl ?? o.realizedPnl ?? o.realizedPnL ?? o.grossProfit ?? null;
        const p = typeof rawProfit === 'number' ? rawProfit : parseFloat(rawProfit || '');
        if (!isFinite(p) || p === 0) continue; // zero P&L = not actually closed
        const tk = o.positionId ? `tl_${conn.accountId}_${o.positionId}` : `tl_${o.id || o.orderId}`;
        if (!tk || tk === 'tl_undefined') continue;
        const reconDateStr = o.closeTime ? new Date(o.closeTime).toISOString().slice(0, 10) : undefined;
        const reconResult = p > 0 ? 'WIN' : 'LOSS';
        const existing = await storage.getAiTradeResultByTicket(userId, tk);
        if (existing) {
          if (existing.result === 'PENDING' || (existing as any).connectionId == null) {
            await storage.updateAiTradeResult(existing.id, userId, {
              result: reconResult,
              profitLoss: p,
              connectionId: conn.id,
              closedAt: o.closeTime ? new Date(o.closeTime) : new Date(),
            } as any).catch(() => {});
            if (existing.result === 'PENDING') {
              await recordRealizedPnl(userId, conn.id, 'tradelocker', p, reconDateStr);
              try {
                await storage.resolveConfirmationOutcome(userId, existing.symbol, existing.direction, reconResult, null);
              } catch { /* non-critical */ }
            }
          }
          continue;
        }
        const reconDirection = /sell|short/i.test(o.side || '') ? 'SELL' : 'BUY';
        const reconSymbol = (o.symbol || 'UNKNOWN').toUpperCase().replace('/', '');
        await storage.createAiTradeResult({
          userId,
          symbol: reconSymbol,
          direction: reconDirection,
          entryPrice: o.openPrice || 0,
          exitPrice: o.closePrice || 0,
          aiConfidence: 0,
          result: reconResult,
          profitLoss: p,
          source: 'tradelocker',
          connectionId: conn.id,
          mt5Ticket: tk,
          notes: 'TradeLocker closed position (auto-reconciled)',
          closedAt: o.closeTime ? new Date(o.closeTime) : new Date(),
        } as any).catch(() => {});
        await recordRealizedPnl(userId, conn.id, 'tradelocker', p, reconDateStr);
        try {
          await storage.resolveConfirmationOutcome(userId, reconSymbol, reconDirection, reconResult, null);
        } catch { /* non-critical */ }
      }
    } catch (err: any) {
      console.error(`[TL-sync] Outcome reconciliation failed for ${conn.accountId} (non-fatal):`, err?.message);
    }
  }
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

    // Cold-start hydration: seed the cache from each account's last-known DB
    // balance so the UI shows the real figure immediately (across a deploy or
    // while the first live fetch / re-auth is in flight) instead of $0.
    for (const conn of active) {
      if (store[userId][conn.accountId]) continue;
      const lb = (conn as any).lastBalance;
      if (lb != null) {
        store[userId][conn.accountId] = {
          accountId: conn.accountId,
          connectionId: conn.id,
          accountType: conn.accountType,
          broker: (conn as any).brokerName || 'TradeLocker',
          label: `TradeLocker – ${conn.email} (${conn.accountType})`,
          balance: lb || 0,
          equity: (conn as any).lastEquity ?? lb ?? 0,
          margin: 0,
          freeMargin: 0,
          currency: 'USD',
          lastUpdated: (conn as any).lastBalanceAt ? new Date((conn as any).lastBalanceAt).toISOString() : new Date(0).toISOString(),
        };
      }
    }

    // Sequential to avoid concurrent auth storms against the TL API
    for (const conn of active) {
      try {
        const svc = await tlGetOrCreateService(conn);
        const info = await svc.getAccountInfo();

        // A live successful fetch proves the connection is healthy right now —
        // clear out any stale lastError so it doesn't linger in the UI forever.
        // Previously nothing ever cleared this field on success, so an old
        // transient failure (e.g. a since-fixed code path that used to
        // propagate raw broker error pages into lastError) could sit there
        // indefinitely and keep showing as a current problem on the Weekly
        // Strategy execution-diagnostics panel long after it stopped being one.
        if ((conn as any).lastError) {
          storage.updateTradelockerConnection(conn.id, { lastError: null } as any).catch(() => {});
        }

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
        // Keep the legacy balance cache used for proportional lot sizing in sync.
        // Always overwrite (even with 0) — a genuinely-zeroed account should size
        // to 0, not silently keep sizing off a stale prior positive balance.
        (global as any).tlAccountBalances = (global as any).tlAccountBalances || {};
        (global as any).tlAccountBalances[userId] = (global as any).tlAccountBalances[userId] || {};
        (global as any).tlAccountBalances[userId][conn.accountId] = info.balance || 0;

        // Persist the balance snapshot to the DB (throttled) so it survives
        // restarts and is shown while a future re-auth is in flight.
        if (info.balance > 0) {
          const pk = `${userId}:${conn.accountId}`;
          const prevPersist = lastBalancePersist.get(pk);
          const changed = !prevPersist || Math.abs(prevPersist.balance - info.balance) > 0.01;
          if (changed && (!prevPersist || Date.now() - prevPersist.at > BALANCE_PERSIST_MS)) {
            lastBalancePersist.set(pk, { at: Date.now(), balance: info.balance });
            storage.updateTradelockerConnection(conn.id, {
              lastBalance: info.balance,
              lastEquity: info.equity || info.balance,
              lastBalanceAt: new Date(),
            } as any).catch(() => {});
          }
        }

        // Auto-log this account's trades — no manual entry, no EA/webhook
        // needed. TradeLocker has no push mechanism like MT5's EA, so this
        // poll-and-diff is the only way to detect a trade closing.
        await syncTradeLockerTrades(userId, conn, svc).catch(err =>
          console.error(`[TL-sync] Trade auto-log failed for ${conn.accountId} (non-fatal):`, err.message)
        );
      } catch (err: any) {
        const prev = store[userId][conn.accountId];
        const msg: string = err?.message || 'fetch failed';
        // A 429 / login-rate-limit / cooldown is TRANSIENT — the broker is just
        // throttling us for a few seconds. Surfacing it as a hard `error` flips
        // the account to "disconnected" and shows "429 Too Many Requests" on the
        // webhooks page even though we hold a perfectly good last-known balance.
        // So for rate-limit errors, keep the last successful entry untouched
        // (balance stays visible, freshness reflects real age) and just skip
        // this cycle. Only genuine failures (bad creds, etc.) set `error`.
        const isRateLimit = err?.status === 429 || /429|rate.?limit|too many requests|cooling down/i.test(msg);
        if (isRateLimit && prev && !prev.error) {
          // leave prev entry as-is; the background loop retries after cooldown
          continue;
        }
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
          // Don't show a scary 429 to the user — if we have any last-known
          // balance, present a soft "refreshing" note instead of a hard error.
          error: isRateLimit
            ? (prev?.balance ? undefined : 'Reconnecting to TradeLocker…')
            : msg,
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
    for (const [userId, seenAt] of Array.from(activeUsers.entries())) {
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
