import { useQuery } from '@tanstack/react-query';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';

// Live open TradeLocker positions across all connected accounts — including
// losing trades — with per-trade unrealized P/L. Polls every 15s.

interface TlPosition {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  avgPrice: number;
  unrealizedPl: number;
  openDate?: string;
}

interface TlPositionsResponse {
  accounts: Array<{
    connectionId: number;
    accountId: string;
    accountType: string;
    broker: string;
    positions: TlPosition[];
    error?: string;
  }>;
  totalUnrealizedPl: number;
}

export function TlOpenPositions({ compact = false }: { compact?: boolean }) {
  const { data, isLoading, isFetching, refetch } = useQuery<TlPositionsResponse>({
    queryKey: ['/api/tradelocker/positions'],
    refetchInterval: 15000,
    staleTime: 0,
  });

  const accounts = data?.accounts ?? [];
  const allPositions = accounts.flatMap(a =>
    a.positions.map(p => ({ ...p, broker: a.broker, accountId: a.accountId, accountType: a.accountType }))
  );
  const totalPl = data?.totalUnrealizedPl ?? 0;
  const hasError = accounts.some(a => a.error);

  if (!isLoading && accounts.length === 0) return null; // no TL connections — hide entirely

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-200">Open Trades (TradeLocker)</h3>
          {allPositions.length > 0 && (
            <span className={`text-xs font-bold font-mono ${totalPl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {totalPl >= 0 ? '+' : ''}{totalPl.toFixed(2)} USD
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          className="p-1.5 rounded-md hover:bg-white/10 text-gray-500"
          aria-label="Refresh positions"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-500">Loading positions…</p>
      ) : allPositions.length === 0 ? (
        <p className="text-xs text-gray-500">
          No open positions{hasError ? ' — one or more accounts failed to sync, retrying…' : ''}
        </p>
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-xs min-w-[480px]">
            <thead>
              <tr className="text-gray-500 text-left border-b border-gray-800">
                <th className="py-1.5 pr-3 font-medium">Symbol</th>
                <th className="py-1.5 pr-3 font-medium">Side</th>
                <th className="py-1.5 pr-3 font-medium text-right">Lots</th>
                <th className="py-1.5 pr-3 font-medium text-right">Entry</th>
                <th className="py-1.5 pr-3 font-medium text-right">P/L</th>
                {!compact && <th className="py-1.5 font-medium">Account</th>}
              </tr>
            </thead>
            <tbody>
              {allPositions.map((p, i) => (
                <tr key={`${p.accountId}-${p.id}-${i}`} className="border-b border-gray-800/50">
                  <td className="py-1.5 pr-3 font-semibold text-gray-200">{p.symbol}</td>
                  <td className="py-1.5 pr-3">
                    <span className={`inline-flex items-center gap-1 font-bold uppercase ${p.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.side === 'buy' ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {p.side || '—'}
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-300">{p.qty}</td>
                  <td className="py-1.5 pr-3 text-right font-mono text-gray-300">{p.avgPrice || '—'}</td>
                  <td className={`py-1.5 pr-3 text-right font-mono font-bold ${p.unrealizedPl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {p.unrealizedPl >= 0 ? '+' : ''}{p.unrealizedPl.toFixed(2)}
                  </td>
                  {!compact && (
                    <td className="py-1.5 text-gray-500">
                      {p.broker} · {p.accountId} <span className="uppercase text-[10px]">({p.accountType})</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
