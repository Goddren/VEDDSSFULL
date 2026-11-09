// ─── Account aggregator (ABBA Phase B) ──────────────────────────────────────
// ONE canonical, secret-free, per-user read of every connected account,
// assembled from the existing caches / storage rows / read-only service
// calls. STRICTLY READ-ONLY by construction:
//   - no broker login is triggered (DXtrade is read from the snapshot cache
//     the connections route maintains — a live login there can also WRITE a
//     backfilled account code, so it is never called from here);
//   - no sync is triggered (a TradeLocker sync persists reconciled trades —
//     here the background-sync CACHE is read; a cold cache reports stale/
//     unknown, never $0);
//   - live reads that do happen (Alpaca / TastyTrade / Crypto.com / Kalshi)
//     are the same read-only authenticate/balance calls their own routes
//     make, each behind a timeout.
// A source that cannot be read produces an explicit unknown/stale entry (or
// a pack-level unknown) — never a dropped row, never a fabricated figure.
// Balances are NEVER summed across accounts here: unlike accounts (live /
// demo / paper / prop, different currencies) must not collapse into one
// headline number. A clearly-labeled USD subtotal of fresh USD balances is
// computed by the caller only if wanted.

import { storage } from '../storage';
import { pool } from '../db';

export type AccountFreshness = 'ok' | 'stale' | 'error' | 'unknown';

export interface AccountSnapshot {
  id: string;                    // stable per-user id, e.g. "dxtrade:3"
  provider: string;              // 'MT5' | 'TradeLocker' | 'DXtrade' | …
  kind: 'broker' | 'exchange' | 'wallet' | 'prediction';
  label: string;
  accountType: 'live' | 'demo' | 'paper' | 'prop' | 'unknown';
  currency: string | null;
  balance: number | null;        // null = not readable right now (see status)
  equity: number | null;
  unrealizedPnl: number | null;
  openPositions: number | null;
  connected: boolean;
  status: AccountFreshness;
  asOf: string | null;           // ISO timestamp of the figure's source
  ageSeconds: number | null;
  source: string;                // where the figure came from
  note?: string;
}

const READ_TIMEOUT_MS = 6_000;

function withTimeout<T>(p: Promise<T>, ms = READ_TIMEOUT_MS): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('read timed out')), ms)),
  ]);
}

function ageOf(iso: string | number | Date | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso as any).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 1000));
}

function maskTail(v: unknown): string {
  const s = String(v ?? '');
  if (s.length <= 4) return s;
  return `…${s.slice(-4)}`;
}

export async function buildAccountSnapshots(userId: number): Promise<{ accounts: AccountSnapshot[]; unknowns: string[] }> {
  const accounts: AccountSnapshot[] = [];
  const unknowns: string[] = [];
  const now = Date.now();

  // ── MT5 (EA-push in-memory cache only — cold cache = unknown) ────────────
  try {
    const cache = (global as any).mt5AccountData?.[userId];
    if (cache) {
      const entries: Array<[string, any]> = cache.lastUpdated ? [['default', cache]] : Object.entries(cache);
      for (const [k, a] of entries) {
        if (!a?.lastUpdated) continue;
        const age = ageOf(a.lastUpdated);
        accounts.push({
          id: `mt5:${a.accountNumber || k}`, provider: 'MT5', kind: 'broker',
          label: a.broker ? `${a.broker} #${a.accountNumber || ''}` : 'MT5 account',
          accountType: 'live', currency: a.currency || 'USD',
          balance: a.balance ?? null, equity: a.equity ?? null,
          unrealizedPnl: a.profit ?? null, openPositions: a.openPositions ?? null,
          connected: (age ?? Infinity) < 300,
          status: (age ?? Infinity) < 300 ? 'ok' : 'stale',
          asOf: new Date(a.lastUpdated).toISOString(), ageSeconds: age,
          source: 'MT5 EA push cache',
        });
      }
    }
  } catch { unknowns.push('MT5 account cache could not be read'); }

  // ── TradeLocker (background-sync cache only — never triggers a sync) ────
  try {
    const conns = await storage.getUserTradelockerConnections(userId);
    const { getTlAccountData } = await import('./tradelocker-sync');
    const live = getTlAccountData(userId);
    const liveById: Record<string, any> = {};
    for (const a of live.accounts || []) liveById[String(a.accountId)] = a;
    for (const c of conns) {
      if (!c.isActive) continue;
      const l = liveById[String(c.accountId)];
      const age = l ? (typeof l.secondsAgo === 'number' ? l.secondsAgo : null) : ageOf(c.lastConnectedAt);
      accounts.push({
        id: `tradelocker:${c.id}`, provider: 'TradeLocker', kind: 'broker',
        label: `TradeLocker ${c.accNum || c.accountId} (${c.accountType})`,
        accountType: c.accountType === 'demo' ? 'demo' : 'live',
        currency: l?.currency || 'USD',
        balance: l ? (l.balance ?? null) : null,
        equity: l ? (l.equity ?? null) : null,
        unrealizedPnl: l ? ((l.equity ?? 0) - (l.balance ?? 0)) : null,
        openPositions: null,
        connected: l ? !!l.isConnected : (age ?? Infinity) < 86_400,
        status: l ? ((age ?? 0) < 900 ? 'ok' : 'stale') : 'unknown',
        asOf: l && age != null ? new Date(now - age * 1000).toISOString() : (c.lastConnectedAt ? new Date(c.lastConnectedAt).toISOString() : null),
        ageSeconds: age,
        source: 'TradeLocker sync cache',
        note: l ? undefined : 'No live balance in the sync cache yet — open the TradeLocker page once to refresh it.',
      });
    }
  } catch { unknowns.push('TradeLocker accounts could not be read'); }

  // ── DXtrade (snapshot cache only — the connections route's live login can
  //    write a backfilled account code, so it is never triggered here) ─────
  try {
    const { rows } = await pool.query(
      `SELECT id, username, label, is_active, last_connected_at, is_prop_firm_account FROM dxtrade_connections WHERE user_id = $1 ORDER BY id`,
      [userId],
    );
    const snapCache = (global as any).dxtradeAccountData?.[userId] || {};
    for (const c of rows) {
      if (!c.is_active) continue;
      const snap = snapCache[c.id];
      const age = snap?.updatedAt ? Math.floor((now - snap.updatedAt) / 1000) : ageOf(c.last_connected_at);
      accounts.push({
        id: `dxtrade:${c.id}`, provider: 'DXtrade', kind: 'broker',
        label: c.label || `DXtrade ${c.username}`,
        accountType: c.is_prop_firm_account ? 'prop' : 'live',
        currency: 'USD',
        balance: snap ? (snap.balance ?? null) : null,
        equity: null,
        unrealizedPnl: null,
        openPositions: snap ? (snap.openPositions ?? null) : null,
        connected: !!snap && (age ?? Infinity) < 900,
        status: snap ? ((age ?? Infinity) < 900 ? 'ok' : 'stale') : 'unknown',
        asOf: snap?.updatedAt ? new Date(snap.updatedAt).toISOString() : (c.last_connected_at ? new Date(c.last_connected_at).toISOString() : null),
        ageSeconds: age,
        source: 'DXtrade snapshot cache',
        note: snap ? undefined : 'Balance snapshot not fetched yet this session — open the DXtrade connections page once to populate it.',
      });
    }
  } catch { /* table may not exist in this deployment — no DXtrade accounts */ }

  // ── Alpaca / TastyTrade (options brokers — same read-only authenticate
  //    call their balances route makes) ────────────────────────────────────
  try {
    const [alpacaConns, tastyConns] = await Promise.all([
      storage.getUserAlpacaConnections(userId),
      storage.getUserTastytradeConnections(userId),
    ]);
    for (const conn of alpacaConns) {
      try {
        const { AlpacaService, decryptApiSecret } = await import('../alpaca');
        const svc = new AlpacaService(conn.accountType as 'paper' | 'live', conn.apiKeyId, decryptApiSecret(conn.encryptedApiSecret));
        const info: any = await withTimeout(svc.authenticate());
        accounts.push({
          id: `alpaca:${conn.id}`, provider: 'Alpaca', kind: 'broker',
          label: `Alpaca (${conn.accountType})`,
          accountType: conn.accountType === 'paper' ? 'paper' : 'live',
          currency: info.currency || 'USD', balance: info.balance ?? null, equity: info.equity ?? null,
          unrealizedPnl: null, openPositions: null, connected: true, status: 'ok',
          asOf: new Date().toISOString(), ageSeconds: 0, source: 'Alpaca account read',
        });
      } catch {
        accounts.push({
          id: `alpaca:${conn.id}`, provider: 'Alpaca', kind: 'broker',
          label: `Alpaca (${conn.accountType})`,
          accountType: conn.accountType === 'paper' ? 'paper' : 'live',
          currency: 'USD', balance: null, equity: null, unrealizedPnl: null, openPositions: null,
          connected: false, status: 'error', asOf: null, ageSeconds: null,
          source: 'Alpaca account read', note: 'Balance read failed — the connection may need attention.',
        });
      }
    }
    for (const conn of tastyConns) {
      try {
        const { TastyTradeService, decryptPassword } = await import('../tastytrade');
        const svc = new TastyTradeService(conn.accountType as 'sandbox' | 'live', conn.username, decryptPassword(conn.encryptedPassword));
        const info: any = await withTimeout(svc.authenticate());
        accounts.push({
          id: `tastytrade:${conn.id}`, provider: 'TastyTrade', kind: 'broker',
          label: `TastyTrade ${maskTail(conn.username)} (${conn.accountType})`,
          accountType: conn.accountType === 'sandbox' ? 'paper' : 'live',
          currency: info.currency || 'USD', balance: info.balance ?? null, equity: info.equity ?? null,
          unrealizedPnl: null, openPositions: null, connected: true, status: 'ok',
          asOf: new Date().toISOString(), ageSeconds: 0, source: 'TastyTrade account read',
        });
      } catch {
        accounts.push({
          id: `tastytrade:${conn.id}`, provider: 'TastyTrade', kind: 'broker',
          label: `TastyTrade (${conn.accountType})`,
          accountType: conn.accountType === 'sandbox' ? 'paper' : 'live',
          currency: 'USD', balance: null, equity: null, unrealizedPnl: null, openPositions: null,
          connected: false, status: 'error', asOf: null, ageSeconds: null,
          source: 'TastyTrade account read', note: 'Balance read failed — the connection may need attention.',
        });
      }
    }
  } catch { unknowns.push('Options broker accounts could not be read'); }

  // ── Tradovate (futures — connection row; no safe cached balance) ─────────
  try {
    const tv = await storage.getUserTradovateConnection(userId);
    if (tv) {
      accounts.push({
        id: `tradovate:${tv.id}`, provider: 'Tradovate', kind: 'broker',
        label: `Tradovate ${maskTail((tv as any).username)}`,
        accountType: (tv as any).isDemo ? 'demo' : 'live',
        currency: 'USD', balance: null, equity: null, unrealizedPnl: null, openPositions: null,
        connected: !!(tv as any).isActive, status: 'unknown',
        asOf: null, ageSeconds: null, source: 'Tradovate connection record',
        note: 'Connected for the futures engine; balance is not read into a shared cache.',
      });
    }
  } catch { /* no Tradovate connection */ }

  // ── Crypto.com (read-only account call, same as its balance route) ───────
  try {
    const conns = await storage.getUserCryptocomConnections(userId);
    for (const conn of conns) {
      if (!(conn as any).isActive) continue;
      try {
        const { CryptoComService, decryptApiSecret } = await import('../cryptocom');
        const svc = new CryptoComService(conn.apiKey, decryptApiSecret(conn.encryptedApiSecret));
        const info: any = await withTimeout(svc.getAccountInfo());
        accounts.push({
          id: `cryptocom:${conn.id}`, provider: 'Crypto.com', kind: 'exchange',
          label: 'Crypto.com Exchange',
          accountType: 'live', currency: info.currency || 'USD',
          balance: info.balance ?? null, equity: info.equity ?? null,
          unrealizedPnl: null, openPositions: null, connected: true, status: 'ok',
          asOf: new Date().toISOString(), ageSeconds: 0, source: 'Crypto.com account read',
        });
      } catch {
        accounts.push({
          id: `cryptocom:${conn.id}`, provider: 'Crypto.com', kind: 'exchange',
          label: 'Crypto.com Exchange',
          accountType: 'live', currency: 'USD', balance: null, equity: null,
          unrealizedPnl: null, openPositions: null, connected: false, status: 'error',
          asOf: null, ageSeconds: null, source: 'Crypto.com account read',
          note: 'Balance read failed — the connection may need attention.',
        });
      }
    }
  } catch { /* no Crypto.com connection */ }

  // ── Coinbase / Gemini / Kraken (connection rows; venue balances live behind
  //    per-venue routes with no shared read model yet → explicit unknown) ──
  for (const [table, provider] of [['coinbase_connections', 'Coinbase'], ['gemini_connections', 'Gemini'], ['kraken_connections', 'Kraken'], ['hyperliquid_connections', 'Hyperliquid']] as const) {
    try {
      const { rows } = await pool.query(`SELECT id FROM ${table} WHERE user_id = $1 ORDER BY id`, [userId]);
      for (const r of rows) {
        accounts.push({
          id: `${provider.toLowerCase()}:${r.id}`, provider, kind: 'exchange',
          label: provider, accountType: 'live', currency: 'USD',
          balance: null, equity: null, unrealizedPnl: null, openPositions: null,
          connected: true, status: 'unknown', asOf: null, ageSeconds: null,
          source: `${provider} connection record`,
          note: 'Connection exists; its balance is not yet part of the shared account read.',
        });
      }
    } catch { /* table may not exist in this deployment */ }
  }

  // ── DeFi wallets (rows + on-chain read for EVM addresses) ────────────────
  try {
    const { rows } = await pool.query(`SELECT id, wallet_address, chain FROM defi_wallets WHERE user_id = $1 ORDER BY id LIMIT 5`, [userId]);
    for (const w of rows) {
      let balance: number | null = null;
      let status: AccountFreshness = 'unknown';
      try {
        const { getOnchainBalances } = await import('./onchain-balances');
        const sum: any = await withTimeout(getOnchainBalances(w.wallet_address), 8_000);
        balance = typeof sum?.totalUsd === 'number' ? sum.totalUsd : null;
        status = balance != null ? 'ok' : 'unknown';
      } catch { status = 'error'; }
      accounts.push({
        id: `defi:${w.id}`, provider: 'DeFi Wallet', kind: 'wallet',
        label: `Wallet ${maskTail(w.wallet_address)}${w.chain ? ` (${w.chain})` : ''}`,
        accountType: 'live', currency: 'USD', balance, equity: balance,
        unrealizedPnl: null, openPositions: null, connected: true, status,
        asOf: status === 'ok' ? new Date().toISOString() : null, ageSeconds: status === 'ok' ? 0 : null,
        source: 'On-chain balance read',
        note: status === 'ok' ? undefined : 'On-chain balance could not be read right now.',
      });
    }
  } catch { /* no DeFi wallets table/rows */ }

  // ── Sol engine server wallet (public address + SOL balance only — the
  //    status service never exposes key material) ───────────────────────────
  try {
    const { getServerWalletStatus } = await import('./sol-engine');
    const st: any = await withTimeout(getServerWalletStatus(userId));
    if (st && (st.hasServerWallet || st.walletAddress)) {
      accounts.push({
        id: 'sol:server-wallet', provider: 'Solana', kind: 'wallet',
        label: `Sol engine wallet ${st.walletAddress ? maskTail(st.walletAddress) : ''}`.trim(),
        accountType: 'live', currency: 'SOL',
        balance: typeof st.balanceSol === 'number' ? st.balanceSol : null,
        equity: null, unrealizedPnl: null, openPositions: null,
        connected: true, status: typeof st.balanceSol === 'number' ? 'ok' : 'unknown',
        asOf: new Date().toISOString(), ageSeconds: 0, source: 'Sol server-wallet status',
      });
    }
  } catch { /* no server wallet configured */ }

  // ── Kalshi (service-level balance read; credentials never leave the
  //    kalshi-trading service) ──────────────────────────────────────────────
  try {
    const { loadKalshiCredentials, getKalshiBalance } = await import('./kalshi-trading');
    if (loadKalshiCredentials(userId)) {
      try {
        const bal: any = await withTimeout(getKalshiBalance(userId));
        accounts.push({
          id: 'kalshi:account', provider: 'Kalshi', kind: 'prediction',
          label: 'Kalshi', accountType: 'live', currency: 'USD',
          balance: typeof bal?.balance === 'number' ? bal.balance : null,
          equity: null, unrealizedPnl: null, openPositions: null,
          connected: true, status: typeof bal?.balance === 'number' ? 'ok' : 'unknown',
          asOf: new Date().toISOString(), ageSeconds: 0, source: 'Kalshi balance read',
        });
      } catch {
        accounts.push({
          id: 'kalshi:account', provider: 'Kalshi', kind: 'prediction',
          label: 'Kalshi', accountType: 'live', currency: 'USD',
          balance: null, equity: null, unrealizedPnl: null, openPositions: null,
          connected: false, status: 'error', asOf: null, ageSeconds: null,
          source: 'Kalshi balance read', note: 'Balance read failed — saved credentials may need attention.',
        });
      }
    }
  } catch { /* no Kalshi credentials */ }

  // ── Polymarket (identity wallet on the user record; no balance read) ─────
  try {
    const user: any = await storage.getUser(userId);
    const addr = user?.polymarketWalletAddress || user?.walletAddress;
    if (addr) {
      accounts.push({
        id: 'polymarket:wallet', provider: 'Polymarket', kind: 'prediction',
        label: `Polymarket wallet ${maskTail(addr)}`,
        accountType: 'live', currency: 'USD', balance: null, equity: null,
        unrealizedPnl: null, openPositions: null, connected: true, status: 'unknown',
        asOf: null, ageSeconds: null, source: 'User wallet record',
        note: 'Wallet linked; balance is held in the Polymarket engine state, not a shared read.',
      });
    }
  } catch { /* no wallet on record */ }

  return { accounts, unknowns };
}
