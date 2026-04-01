import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Target, CheckCircle2, Clock } from 'lucide-react';

interface WeeklyProgressWidgetProps {
  compact?: boolean;
  className?: string;
}

interface WeeklyStrategy {
  profitTarget?: number;
  currentProfit?: number;
  progressTrades?: number;
  progressWinRate?: number;
  progressPercentage?: number;
  plan?: {
    weeklyPlan?: Record<string, {
      pairs?: Array<{ symbol: string; maxTrades?: number; direction?: string }>;
      dailyTarget?: number;
    }>;
  };
}

export function WeeklyProgressWidget({ compact = false, className = '' }: WeeklyProgressWidgetProps) {
  const { data: strategy } = useQuery<WeeklyStrategy>({
    queryKey: ['/api/weekly-strategy'],
    refetchInterval: 60000,
  });

  if (!strategy?.profitTarget) {
    return compact ? null : (
      <div className={`rounded-xl bg-gray-900/50 border border-gray-800 p-4 text-center text-gray-500 text-sm ${className}`}>
        No active weekly plan — <a href="/weekly-strategy" className="text-red-400 underline">generate one</a>
      </div>
    );
  }

  const pct = strategy.progressPercentage ?? 0;
  const currentProfit = strategy.currentProfit ?? 0;
  const target = strategy.profitTarget ?? 0;
  const winRate = strategy.progressWinRate ?? 0;
  const trades = strategy.progressTrades ?? 0;

  // Today's day name
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayName = days[new Date().getDay()];
  const todayPlan = strategy.plan?.weeklyPlan?.[todayName];
  const todayPairs = todayPlan?.pairs ?? [];

  if (compact) {
    return (
      <div className={`flex items-center gap-3 bg-gray-900/80 border border-gray-800 rounded-lg px-3 py-2 ${className}`}>
        <TrendingUp className="h-4 w-4 text-red-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs text-gray-400 truncate">Weekly Goal</span>
            <span className="text-xs font-bold text-white">{pct}%</span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(100, pct)}%`,
                background: pct >= 100 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#dc2626'
              }}
            />
          </div>
        </div>
        <span className="text-xs text-gray-400 shrink-0">${currentProfit.toFixed(0)}/${target.toFixed(0)}</span>
      </div>
    );
  }

  return (
    <div className={`rounded-xl bg-gradient-to-br from-gray-900 to-gray-900/80 border border-gray-800 p-5 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Target className="h-5 w-5 text-red-400" />
          <span className="text-white font-semibold">Weekly Progress</span>
        </div>
        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${pct >= 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
          {pct >= 100 ? '✓ TARGET HIT' : `${pct}% to goal`}
        </span>
      </div>

      {/* Main progress bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs text-gray-400 mb-1.5">
          <span>Profit Progress</span>
          <span>${currentProfit.toFixed(2)} / ${target.toFixed(2)}</span>
        </div>
        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: pct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' : pct >= 60 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#dc2626,#ef4444)'
            }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-white">{trades}</p>
          <p className="text-xs text-gray-400">Trades</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-emerald-400">{winRate}%</p>
          <p className="text-xs text-gray-400">Win Rate</p>
        </div>
        <div className="bg-gray-800/60 rounded-lg p-2.5 text-center">
          <p className="text-lg font-bold text-amber-400">{todayPlan?.dailyTarget ? `$${todayPlan.dailyTarget}` : '—'}</p>
          <p className="text-xs text-gray-400">Today's Target</p>
        </div>
      </div>

      {/* Today's pairs */}
      {todayPairs.length > 0 && (
        <div>
          <p className="text-xs text-gray-500 mb-2">Today ({todayName}) — Active Pairs</p>
          <div className="flex flex-wrap gap-2">
            {todayPairs.map((p, i) => (
              <span key={i} className="text-xs bg-gray-800 border border-gray-700 rounded-md px-2 py-1 text-gray-300">
                {p.symbol} <span className={p.direction === 'BUY' ? 'text-emerald-400' : p.direction === 'SELL' ? 'text-red-400' : 'text-gray-400'}>{p.direction}</span>
                {p.maxTrades && <span className="text-gray-500 ml-1">max {p.maxTrades}</span>}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
