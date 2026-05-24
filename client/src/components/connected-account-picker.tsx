/**
 * ConnectedAccountPicker
 *
 * A compact selector that lists every account connected to VEDD
 * (MT5 EA accounts + TradeLocker connections).
 *
 * Features:
 *  - Fetches /api/accounts/all on mount
 *  - On selecting a TradeLocker account fetches live balance via
 *    /api/accounts/tradelocker/:id/balance
 *  - MT5 balances come from the EA's push-data (near real-time)
 *  - Persists the last selected account key to localStorage
 *  - Per-account engine settings saved/loaded via localStorage
 *  - Calls onSelect(account) whenever the selection or live balance changes
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RefreshCcw, ChevronDown, Wifi, WifiOff, Monitor, Link } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ConnectedAccount {
  type: 'mt5' | 'tradelocker';
  key: string;           // unique: "mt5_12345" | "tl_42"
  id: string;
  label: string;
  broker: string;
  balance: number;
  equity: number;
  currency: string;
  server?: string;
  accountNumber?: string;
  accountName?: string;
  accountType?: string;  // 'demo' | 'live'
  isConnected: boolean;
  ageSeconds?: number;
  email?: string;        // TradeLocker only
}

export interface AccountEngineSettings {
  riskPerTrade?: number;
  maxLotSize?: number;
  minLotSize?: number;
  weeklyTarget?: number;
  baseLotSize?: number;
  executionSource?: 'mt5' | 'tradelocker' | 'auto';
  direction?: 'buy_only' | 'sell_only' | 'both';
  riskPerTradePct?: number;
  maxDailyTrades?: number;
  stopOrdersEnabled?: boolean;
  // extend freely — stored as JSON
  [key: string]: any;
}

// ─── Per-account settings helpers ────────────────────────────────────────────

const SETTINGS_PREFIX = 'vedd_acct_cfg_';

export function loadAccountSettings(accountKey: string): AccountEngineSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_PREFIX + accountKey);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveAccountSettings(accountKey: string, settings: AccountEngineSettings) {
  try {
    localStorage.setItem(SETTINGS_PREFIX + accountKey, JSON.stringify(settings));
  } catch {}
}

const LAST_ACCOUNT_KEY = 'vedd_last_account_key';

// ─── Component ────────────────────────────────────────────────────────────────

interface ConnectedAccountPickerProps {
  /** Called whenever a new account is selected (or its balance refreshes). */
  onSelect: (account: ConnectedAccount | null) => void;
  /** Override the initial selected key (optional). Falls back to localStorage. */
  defaultAccountKey?: string;
  /** Extra className applied to the trigger button. */
  className?: string;
  /** Compact single-line mode for embedding inside forms */
  compact?: boolean;
  /** Show a label above the picker */
  label?: string;
}

export default function ConnectedAccountPicker({
  onSelect,
  defaultAccountKey,
  className,
  compact = false,
  label,
}: ConnectedAccountPickerProps) {
  const [selectedKey, setSelectedKey] = useState<string | null>(() => {
    return defaultAccountKey ?? localStorage.getItem(LAST_ACCOUNT_KEY) ?? null;
  });
  const [liveBalance, setLiveBalance] = useState<{ balance: number; equity: number; currency: string } | null>(null);
  const [fetchingBalance, setFetchingBalance] = useState(false);
  const didAutoSelect = useRef(false);

  // ── Fetch all accounts ─────────────────────────────────────────────────────
  const { data, isLoading, refetch } = useQuery<{ accounts: ConnectedAccount[] }>({
    queryKey: ['/api/accounts/all'],
    queryFn: () => apiRequest('GET', '/api/accounts/all').then(r => r.json()),
    refetchInterval: 60_000,
  });

  const accounts = data?.accounts ?? [];
  const selectedAccount = accounts.find(a => a.key === selectedKey) ?? null;

  // ── Auto-select first connected account on first load ─────────────────────
  useEffect(() => {
    if (didAutoSelect.current || accounts.length === 0) return;
    if (selectedKey && accounts.find(a => a.key === selectedKey)) return; // already valid
    const first = accounts.find(a => a.isConnected) ?? accounts[0];
    if (first) {
      didAutoSelect.current = true;
      setSelectedKey(first.key);
    }
  }, [accounts, selectedKey]);

  // ── Fetch live balance for TradeLocker on selection ───────────────────────
  const fetchTLBalance = useCallback(async (account: ConnectedAccount) => {
    if (account.type !== 'tradelocker') return;
    setFetchingBalance(true);
    try {
      const res = await apiRequest('GET', `/api/accounts/tradelocker/${account.id}/balance`);
      if (res.ok) {
        const info = await res.json();
        setLiveBalance({ balance: info.balance, equity: info.equity, currency: info.currency });
      }
    } catch {
      // silent — keep showing stale / 0
    } finally {
      setFetchingBalance(false);
    }
  }, []);

  // ── When selected account changes ─────────────────────────────────────────
  useEffect(() => {
    if (!selectedAccount) return;
    setLiveBalance(null);
    localStorage.setItem(LAST_ACCOUNT_KEY, selectedAccount.key);

    if (selectedAccount.type === 'tradelocker') {
      fetchTLBalance(selectedAccount);
    } else {
      // MT5: use cached balance directly
      setLiveBalance({
        balance: selectedAccount.balance,
        equity: selectedAccount.equity,
        currency: selectedAccount.currency,
      });
    }
  }, [selectedAccount?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Notify parent whenever live balance is resolved ───────────────────────
  useEffect(() => {
    if (!selectedAccount) { onSelect(null); return; }
    const enriched: ConnectedAccount = {
      ...selectedAccount,
      ...(liveBalance ? {
        balance: liveBalance.balance,
        equity: liveBalance.equity,
        currency: liveBalance.currency,
      } : {}),
    };
    onSelect(enriched);
  }, [selectedAccount?.key, liveBalance]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Helpers ────────────────────────────────────────────────────────────────
  const handleSelect = (account: ConnectedAccount) => {
    setSelectedKey(account.key);
  };

  const handleRefresh = (e: React.MouseEvent) => {
    e.stopPropagation();
    refetch();
    if (selectedAccount?.type === 'tradelocker') fetchTLBalance(selectedAccount);
    else if (selectedAccount?.type === 'mt5') {
      setLiveBalance({ balance: selectedAccount.balance, equity: selectedAccount.equity, currency: selectedAccount.currency });
    }
  };

  const displayBalance = liveBalance?.balance ?? selectedAccount?.balance ?? 0;
  const displayCurrency = liveBalance?.currency ?? selectedAccount?.currency ?? 'USD';
  const displayEquity  = liveBalance?.equity ?? selectedAccount?.equity ?? 0;

  const accountIcon = (type: 'mt5' | 'tradelocker') =>
    type === 'mt5'
      ? <Monitor className="w-3.5 h-3.5 shrink-0" />
      : <Link className="w-3.5 h-3.5 shrink-0" />;

  const statusDot = (connected: boolean, type: 'mt5' | 'tradelocker') => (
    <span className={cn(
      'inline-flex items-center gap-1 text-[10px]',
      connected ? 'text-emerald-400' : 'text-gray-500'
    )}>
      {connected
        ? <Wifi className="w-3 h-3" />
        : <WifiOff className="w-3 h-3" />}
      {connected ? (type === 'mt5' ? 'Live' : 'Connected') : 'Offline'}
    </span>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return <Skeleton className={cn('h-10 w-full rounded-lg', className)} />;
  }

  if (accounts.length === 0) {
    return (
      <div className={cn('flex items-center gap-2 text-xs text-gray-500 bg-gray-800/50 rounded-lg px-3 py-2 border border-gray-700', className)}>
        <WifiOff className="w-4 h-4" />
        <span>No accounts connected — add MT5 EA or TradeLocker in Settings</span>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <p className="text-xs text-gray-400">{label}</p>}
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className={cn(
                'flex-1 justify-between text-left h-auto border-gray-700 bg-gray-800/70 hover:bg-gray-800',
                compact ? 'py-1.5 px-3' : 'py-2 px-3'
              )}
            >
              {selectedAccount ? (
                <div className="flex items-center gap-2 min-w-0">
                  {accountIcon(selectedAccount.type)}
                  <div className="min-w-0">
                    <p className={cn('font-medium truncate', compact ? 'text-xs' : 'text-sm')}>
                      {selectedAccount.label}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {fetchingBalance ? (
                        <span className="text-[10px] text-gray-500 animate-pulse">Fetching balance…</span>
                      ) : (
                        <span className={cn('font-mono font-semibold', compact ? 'text-[11px]' : 'text-xs', displayBalance > 0 ? 'text-emerald-400' : 'text-gray-400')}>
                          {displayCurrency} {displayBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                      {!compact && statusDot(selectedAccount.isConnected, selectedAccount.type)}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-gray-400">Select account…</span>
              )}
              <ChevronDown className="w-4 h-4 ml-2 shrink-0 text-gray-500" />
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="start" className="w-80 bg-gray-900 border-gray-700">
            {/* MT5 */}
            {accounts.filter(a => a.type === 'mt5').length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Monitor className="w-3 h-3" /> MT5 Accounts
                </DropdownMenuLabel>
                {accounts.filter(a => a.type === 'mt5').map(acct => (
                  <DropdownMenuItem
                    key={acct.key}
                    className={cn(
                      'flex items-center justify-between cursor-pointer',
                      acct.key === selectedKey && 'bg-cyan-500/10 text-cyan-300'
                    )}
                    onClick={() => handleSelect(acct)}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{acct.label}</span>
                      <span className="text-[10px] text-gray-500">{acct.server} · #{acct.accountNumber}</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-3">
                      <span className="text-xs font-mono font-semibold text-emerald-400">
                        {acct.currency} {acct.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                      {statusDot(acct.isConnected, 'mt5')}
                    </div>
                  </DropdownMenuItem>
                ))}
                {accounts.filter(a => a.type === 'tradelocker').length > 0 && <DropdownMenuSeparator className="bg-gray-700" />}
              </>
            )}

            {/* TradeLocker */}
            {accounts.filter(a => a.type === 'tradelocker').length > 0 && (
              <>
                <DropdownMenuLabel className="text-xs text-gray-500 flex items-center gap-1.5">
                  <Link className="w-3 h-3" /> TradeLocker Accounts
                </DropdownMenuLabel>
                {accounts.filter(a => a.type === 'tradelocker').map(acct => (
                  <DropdownMenuItem
                    key={acct.key}
                    className={cn(
                      'flex items-center justify-between cursor-pointer',
                      acct.key === selectedKey && 'bg-cyan-500/10 text-cyan-300'
                    )}
                    onClick={() => handleSelect(acct)}
                  >
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium truncate">{acct.label}</span>
                      <span className="text-[10px] text-gray-500">{acct.server} · {acct.accountType}</span>
                    </div>
                    <div className="flex flex-col items-end shrink-0 ml-3">
                      <Badge variant="outline" className="text-[9px] border-blue-500/40 text-blue-400 py-0">
                        {acct.accountType?.toUpperCase()}
                      </Badge>
                      {statusDot(acct.isConnected, 'tradelocker')}
                    </div>
                  </DropdownMenuItem>
                ))}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Refresh button */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 border border-gray-700 bg-gray-800/50 hover:bg-gray-800 shrink-0"
          onClick={handleRefresh}
          disabled={fetchingBalance}
          title="Refresh balance"
        >
          <RefreshCcw className={cn('w-3.5 h-3.5', fetchingBalance && 'animate-spin')} />
        </Button>
      </div>

      {/* Equity sub-line when not compact */}
      {!compact && selectedAccount && displayEquity > 0 && (
        <p className="text-[10px] text-gray-600 pl-1">
          Equity: {displayCurrency} {displayEquity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          {selectedAccount.type === 'mt5' && selectedAccount.ageSeconds != null && (
            <> · Updated {selectedAccount.ageSeconds < 60
              ? `${selectedAccount.ageSeconds}s ago`
              : `${Math.round(selectedAccount.ageSeconds / 60)}m ago`}
            </>
          )}
        </p>
      )}
    </div>
  );
}
