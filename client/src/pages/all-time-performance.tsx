import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Trophy, TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtMoney as fmtMoneyShared } from '@/lib/utils';

const fmtMoney = (n: number): string => fmtMoneyShared(n, { signed: true });

interface EnginePnlPoint {
  engine: 'mt5' | 'tradelocker' | 'options' | 'cryptocom' | 'futures';
  pnl: number;
  trades: number;
}
interface DailyPerformance {
  date: string;
  total: number;
  byEngine: EnginePnlPoint[];
}
interface AllTimePerformance {
  allTimeTotal: number;
  totalTrades: number;
  biggestDay: DailyPerformance | null;
  dailyHistory: DailyPerformance[];
  byEngineAllTime: EnginePnlPoint[];
}

const ENGINE_LABEL: Record<string, string> = {
  mt5: 'MT5', tradelocker: 'TradeLocker', options: 'Options', cryptocom: 'Crypto.com', futures: 'Futures',
};

export default function AllTimePerformancePage() {
  const { data, isLoading, error } = useQuery<AllTimePerformance>({
    queryKey: ['/api/performance/all-time'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/performance/all-time');
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to load performance data');
      return res.json();
    },
    refetchInterval: 60000,
  });

  if (isLoading) {
    return <div className="app-page flex items-center justify-center min-h-[60vh] text-gray-500 text-sm">Loading all-time performance…</div>;
  }
  if (error || !data) {
    return (
      <div className="app-page max-w-2xl mx-auto px-4 py-10 text-center">
        <p className="text-white font-bold">Couldn't load performance data</p>
        <p className="text-gray-500 text-sm mt-1">{(error as Error)?.message || 'Unknown error'}</p>
        <Link href="/dashboard" className="inline-block mt-4 text-indigo-400 text-sm font-semibold">← Back to Dashboard</Link>
      </div>
    );
  }

  const chartData = data.dailyHistory.map(d => ({ date: d.date, total: d.total }));

  return (
    <div className="app-page max-w-2xl mx-auto px-4 py-6 space-y-4">
      <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-300">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
      </Link>

      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">All-Time Performance</p>
        <h1 className="text-xl font-black text-white mb-1">Every connected account, combined</h1>
        <p className="text-xs text-gray-500">MT5, TradeLocker, Options, Crypto.com, and Futures — every closed trade on record.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-gray-700/60 bg-gray-900/50 px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">All-Time Total</p>
          <p className="text-lg font-black mt-1 flex items-center justify-center gap-1" style={{ color: data.allTimeTotal >= 0 ? '#10b981' : '#ef4444' }}>
            {data.allTimeTotal >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {fmtMoney(data.allTimeTotal)}
          </p>
          <p className="text-[9px] text-gray-600 mt-0.5">{data.totalTrades} trades</p>
        </div>
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 px-3 py-3 text-center">
          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider flex items-center justify-center gap-1">
            <Trophy className="w-3 h-3" /> Biggest Day
          </p>
          {data.biggestDay ? (
            <>
              <p className="text-lg font-black text-amber-400 mt-1">{fmtMoney(data.biggestDay.total)}</p>
              <p className="text-[9px] text-amber-500/80 mt-0.5">{new Date(data.biggestDay.date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
            </>
          ) : (
            <p className="text-xs text-gray-500 mt-2">No closed trades yet</p>
          )}
        </div>
      </div>

      {data.biggestDay && data.biggestDay.byEngine.length > 0 && (
        <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
          <p className="text-sm font-bold text-white mb-3">Biggest Day — Breakdown</p>
          <div className="space-y-2">
            {data.biggestDay.byEngine.map(e => (
              <div key={e.engine} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{ENGINE_LABEL[e.engine] || e.engine} <span className="text-gray-600">({e.trades} trades)</span></span>
                <span className={`font-bold ${e.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtMoney(e.pnl)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <p className="text-sm font-bold text-white mb-3">All-Time by Engine</p>
        <div className="space-y-2">
          {data.byEngineAllTime.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No closed trades yet.</p>
          ) : (
            [...data.byEngineAllTime].sort((a, b) => b.pnl - a.pnl).map(e => (
              <div key={e.engine} className="flex items-center justify-between text-xs">
                <span className="text-gray-400">{ENGINE_LABEL[e.engine] || e.engine} <span className="text-gray-600">({e.trades} trades)</span></span>
                <span className={`font-bold ${e.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtMoney(e.pnl)}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
        <p className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <BarChart3 className="w-4 h-4 text-indigo-400" /> Daily P&amp;L — Combined
        </p>
        {chartData.length < 2 ? (
          <p className="text-xs text-gray-500 text-center py-10">Not enough closed-trade days yet to chart a trend.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="allTimeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tickFormatter={d => new Date(d + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} tick={{ fill: '#6b7280', fontSize: 10 }} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${v.toLocaleString('en-US')}`} width={60} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#9ca3af' }}
                labelFormatter={d => new Date(d + 'T00:00:00Z').toLocaleDateString()}
                formatter={(val: number) => [fmtMoney(val), 'Combined P&L']}
              />
              <Area type="monotone" dataKey="total" stroke="#6366f1" strokeWidth={2} fill="url(#allTimeGrad)" dot={false} activeDot={{ r: 4, fill: '#6366f1' }} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
