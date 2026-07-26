import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Target, Shield, TrendingUp, TrendingDown, History, AlertTriangle, BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface AccountDetail {
  type: 'mt5' | 'tradelocker' | 'alpaca' | 'tastytrade';
  id: string | number;
  name: string;
  accountType?: string;
  accountId?: string | null;
  connected?: boolean;
  balance: number;
  equity: number;
  currency: string;
  error?: string | null;
  goal: { target: number; progress: number; note?: string };
  risk: {
    useRiskPercent?: boolean; riskPercent?: number; lotMultiplier?: number; gateMode?: string;
    note?: string; pairs?: string[];
  };
  pnl: { daily: number; weekly: number; allTime: number; winRate: number; totalTrades: number };
  dailyBreakdown: { wins: number; losses: number; winAmount: number; lossAmount: number };
  equityCurve: { date: string; cumulativePnl: number }[];
  openTrades: number;
  tradeHistory: { id: number; symbol: string; direction: string; result: string; profitLoss: number; actualPips?: number; closedAt: string }[];
}

function fmtMoney(n: number): string {
  const sign = n >= 0 ? '+' : '';
  return `${sign}$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function AccountDetailPage() {
  const params = useParams<{ type: string; id: string }>();
  const queryClient = useQueryClient();
  const [goalInput, setGoalInput] = useState('');
  const [editingGoal, setEditingGoal] = useState(false);

  const { data, isLoading, error } = useQuery<AccountDetail>({
    queryKey: [`/api/account-detail/${params.type}/${params.id}`],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/account-detail/${params.type}/${params.id}`);
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load account');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const setGoalMutation = useMutation({
    mutationFn: async (target: number) => {
      const res = await apiRequest('PATCH', `/api/tradelocker/connection/${params.id}`, { weeklyProfitTarget: target });
      if (!res.ok) throw new Error('Failed to save goal');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/account-detail/${params.type}/${params.id}`] });
      setEditingGoal(false);
    },
  });

  if (isLoading) {
    return <div className="app-page flex items-center justify-center min-h-[60vh] text-gray-500 text-sm">Loading account…</div>;
  }
  if (error || !data) {
    return (
      <div className="app-page max-w-2xl mx-auto px-4 py-10 text-center">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto mb-3" />
        <p className="text-white font-bold">Couldn't load this account</p>
        <p className="text-gray-500 text-sm mt-1">{(error as Error)?.message || 'Unknown error'}</p>
        <Link href="/dashboard" className="inline-block mt-4 text-indigo-400 text-sm font-semibold">← Back to Dashboard</Link>
      </div>
    );
  }

  const progressColor = data.goal.progress >= 100 ? '#10b981' : data.goal.progress >= 60 ? '#f59e0b' : '#6366f1';

  return (
    <div className="app-page max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
              {data.type === 'mt5' ? 'MT5 Account' : data.type === 'tradelocker' ? 'TradeLocker Account' : data.type === 'alpaca' ? 'Alpaca Account' : 'TastyTrade Account'}
            </p>
            <h1 className="text-xl font-black text-white">{data.name}</h1>
            {data.accountId && <p className="text-[10px] text-gray-600 mt-0.5">ID {data.accountId} · {data.accountType}</p>}
          </div>
          {data.error && (
            <Link href={data.type === 'mt5' ? '/mt5-chart-data' : data.type === 'tradelocker' ? '/webhooks#tradelocker' : '/options-engine'} className="text-[10px] font-bold text-amber-400 border border-amber-500/40 bg-amber-500/10 rounded-full px-2.5 py-1">
              Reconnect →
            </Link>
          )}
        </div>
        {data.error ? (
          <p className="text-xs text-amber-400 mt-2">{data.error}</p>
        ) : (
          <div className="flex items-baseline gap-3 mt-2">
            <p className="text-3xl font-black text-white">{data.currency} {data.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
            {data.equity !== data.balance && <p className="text-xs text-gray-500">Equity {data.equity.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>}
          </div>
        )}
      </div>

      {/* Goal */}
      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-bold text-white flex items-center gap-2"><Target className="w-4 h-4 text-indigo-400" /> Weekly Goal</p>
          {data.type === 'tradelocker' && !editingGoal && (
            <button onClick={() => { setGoalInput(String(data.goal.target || '')); setEditingGoal(true); }} className="text-[10px] font-semibold text-indigo-400">
              {data.goal.target > 0 ? 'Edit' : 'Set goal'}
            </button>
          )}
        </div>
        {editingGoal ? (
          <div className="flex items-center gap-2">
            <input
              type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
              placeholder="e.g. 500" className="flex-1 bg-black/40 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-indigo-500/50"
            />
            <button
              onClick={() => setGoalMutation.mutate(parseFloat(goalInput) || 0)}
              disabled={setGoalMutation.isPending}
              className="text-xs font-bold px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              {setGoalMutation.isPending ? '…' : 'Save'}
            </button>
            <button onClick={() => setEditingGoal(false)} className="text-xs text-gray-500 px-2">Cancel</button>
          </div>
        ) : data.goal.target > 0 ? (
          <>
            <div className="h-2 rounded-full bg-gray-800 overflow-hidden mb-2">
              <div className="h-full rounded-full transition-all" style={{ width: `${data.goal.progress}%`, background: progressColor }} />
            </div>
            <p className="text-xs text-gray-400">{fmtMoney(data.pnl.weekly)} of ${data.goal.target.toFixed(0)} this week ({data.goal.progress}%)</p>
          </>
        ) : (
          <p className="text-xs text-gray-500">No goal set for this account yet.</p>
        )}
        {data.goal.note && <p className="text-[10px] text-gray-600 mt-2">{data.goal.note}</p>}
      </div>

      {/* Risk settings */}
      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <p className="text-sm font-bold text-white flex items-center gap-2 mb-3"><Shield className="w-4 h-4 text-cyan-400" /> Risk Settings</p>
        {data.type === 'tradelocker' ? (
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div><p className="text-gray-500">Sizing mode</p><p className="text-white font-semibold mt-0.5">{data.risk.useRiskPercent ? `${data.risk.riskPercent}% of equity` : `${data.risk.lotMultiplier}x lot multiplier`}</p></div>
            <div><p className="text-gray-500">Gate mode</p><p className="text-white font-semibold mt-0.5 capitalize">{data.risk.gateMode}</p></div>
          </div>
        ) : (
          <p className="text-xs text-gray-500">{data.risk.note}</p>
        )}
      </div>

      {/* P&L */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          { label: 'Today', val: data.pnl.daily },
          { label: 'This Week', val: data.pnl.weekly },
          { label: 'All-Time', val: data.pnl.allTime },
        ].map(m => (
          <div key={m.label} className="rounded-xl border border-gray-700/60 bg-gray-900/50 px-3 py-3 text-center">
            <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">{m.label}</p>
            <p className="text-sm font-black mt-1 flex items-center justify-center gap-1" style={{ color: m.val >= 0 ? '#10b981' : '#ef4444' }}>
              {m.val >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {fmtMoney(m.val)}
            </p>
          </div>
        ))}
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/50 px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Win Rate</p>
          <p className="text-sm font-black text-white mt-1">{data.pnl.winRate}%</p>
          <p className="text-[9px] text-gray-600">{data.pnl.totalTrades} trades</p>
        </div>
      </div>

      {/* Today's win/loss breakdown */}
      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <p className="text-sm font-bold text-white mb-3">Today's Wins &amp; Losses</p>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-3 py-3">
            <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wider">Wins</p>
            <p className="text-lg font-black text-emerald-400 mt-1">{data.dailyBreakdown.wins}</p>
            <p className="text-[10px] text-emerald-500/80 mt-0.5">{fmtMoney(data.dailyBreakdown.winAmount)}</p>
          </div>
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-3">
            <p className="text-[9px] font-bold text-red-400 uppercase tracking-wider">Losses</p>
            <p className="text-lg font-black text-red-400 mt-1">{data.dailyBreakdown.losses}</p>
            <p className="text-[10px] text-red-500/80 mt-0.5">{fmtMoney(data.dailyBreakdown.lossAmount)}</p>
          </div>
        </div>
      </div>

      {/* Balance/P&L chart — anchored to the real account balance when known,
          so the curve reads as the account's actual balance over time instead
          of a cumulative-P&L line starting at $0. */}
      {(() => {
        const hasBalance = !data.error && data.balance > 0;
        const chartData = hasBalance
          ? data.equityCurve.map(pt => ({
              ...pt,
              // balance at that point = current balance minus P&L still to come after it
              balanceAt: Math.round((data.balance - (data.pnl.allTime - pt.cumulativePnl)) * 100) / 100,
            }))
          : data.equityCurve;
        const dataKey = hasBalance ? 'balanceAt' : 'cumulativePnl';
        const label = hasBalance ? 'Balance' : 'Cumulative P&L';
        return (
          <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
            <p className="text-sm font-bold text-white flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-indigo-400" /> {hasBalance ? 'Balance Over Time' : 'P&L Over Time'}
            </p>
            {data.equityCurve.length < 2 ? (
              <p className="text-xs text-gray-500 text-center py-10">Not enough closed trades yet to chart a trend.</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pnlCurveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${v.toLocaleString('en-US')}`} width={60} domain={hasBalance ? ['auto', 'auto'] : undefined} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                    labelFormatter={d => new Date(d).toLocaleString()}
                    formatter={(val: number) => [hasBalance ? `$${val.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : fmtMoney(val), label]}
                  />
                  <Area type="monotone" dataKey={dataKey} stroke="#6366f1" strokeWidth={2} fill="url(#pnlCurveGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        );
      })()}

      {/* Trade history */}
      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <p className="text-sm font-bold text-white flex items-center gap-2 mb-3"><History className="w-4 h-4 text-gray-400" /> Trade History</p>
        {data.tradeHistory.length === 0 ? (
          <p className="text-xs text-gray-500 text-center py-6">No closed trades yet for this account.</p>
        ) : (
          <div className="divide-y divide-gray-800/60 max-h-96 overflow-y-auto">
            {data.tradeHistory.map(t => (
              <div key={t.id} className="flex items-center justify-between py-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`font-bold ${t.result === 'WIN' ? 'text-emerald-400' : t.result === 'LOSS' ? 'text-red-400' : 'text-gray-400'}`}>{t.result}</span>
                  <span className="text-white font-semibold">{t.symbol}</span>
                  <span className="text-gray-500">{t.direction}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">{new Date(t.closedAt).toLocaleDateString()}</span>
                  <span className={`font-bold ${t.profitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtMoney(t.profitLoss)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
