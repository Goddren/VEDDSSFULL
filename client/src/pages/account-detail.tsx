import { useState } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { ArrowLeft, Target, Shield, TrendingUp, TrendingDown, History, AlertTriangle, BarChart3, Gauge, Info } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { fmtMoney as fmtMoneyShared } from '@/lib/utils';
import { Switch } from '@/components/ui/switch';

interface ConsistencyStatus {
  isPropFirmAccount: boolean;
  defaultThresholdPct: number;
  enabled: boolean;
  thresholdPct: number;
  todayPnl: number;
  totalPositivePnl: number;
  ratioPct: number;
  status: 'safe' | 'warning' | 'breached' | 'disabled';
  sizeMultiplier: number;
  hardBlocked: boolean;
  guidance: string;
  maxDayPnl?: number;
  maxDayRatioPct?: number;
  dilutionActive?: boolean;
  plan?: {
    passing: boolean;
    thresholdPct: number;
    totalPositivePnl: number;
    maxDayPnl: number;
    maxDayDate: string | null;
    maxDayRatioPct: number;
    targetTotalPnl: number;
    additionalProfitNeeded: number;
    safeDailyProfitCap: number;
    estDaysNeeded: number;
    growthMultiple: number;
    feasibility: 'passing' | 'achievable' | 'hard' | 'unrealistic';
    recommendation: string;
    summary: string;
  };
}

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

// Signed P&L formatter (shared canonical formatter, signed variant)
const fmtMoney = (n: number): string => fmtMoneyShared(n, { signed: true });

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

  const [editingThreshold, setEditingThreshold] = useState(false);
  const [thresholdInput, setThresholdInput] = useState('');

  const { data: consistency } = useQuery<ConsistencyStatus>({
    queryKey: [`/api/tradelocker/connection/${params.id}/consistency`],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/tradelocker/connection/${params.id}/consistency`);
      if (!res.ok) throw new Error('Failed to load consistency status');
      return res.json();
    },
    enabled: params.type === 'tradelocker',
    refetchInterval: 20000,
  });

  const setThresholdMutation = useMutation({
    mutationFn: async (pct: number) => {
      const res = await apiRequest('PATCH', `/api/tradelocker/connection/${params.id}`, { consistencyThresholdPct: pct });
      if (!res.ok) throw new Error('Failed to save consistency threshold');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tradelocker/connection/${params.id}/consistency`] });
      setEditingThreshold(false);
    },
  });

  const setEnabledMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest('PATCH', `/api/tradelocker/connection/${params.id}`, { consistencyEnabled: enabled });
      if (!res.ok) throw new Error('Failed to update consistency rule');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tradelocker/connection/${params.id}/consistency`] });
    },
  });

  const backfillMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/tradelocker/connection/${params.id}/backfill-consistency`, {});
      if (!res.ok) throw new Error('Failed to recalculate from broker');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/tradelocker/connection/${params.id}/consistency`] });
    },
  });

  const [showConsistencyInfo, setShowConsistencyInfo] = useState(false);

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
            <p className="text-3xl font-black text-white">{fmtMoneyShared(data.balance, { currency: data.currency })}</p>
            {data.equity !== data.balance && <p className="text-xs text-gray-500">Equity {fmtMoneyShared(data.equity, { currency: data.currency })}</p>}
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

      {/* Consistency Monitor — FTMO-style: no single day's profit may exceed
          a set % of total profit. Prop-firm accounts only. Toggleable per
          account since not every prop firm enforces this rule. */}
      {consistency?.isPropFirmAccount && (() => {
        const isOff = consistency.status === 'disabled';
        const statusColor = isOff ? '#6b7280' : consistency.status === 'breached' ? '#ef4444' : consistency.status === 'warning' ? '#f59e0b' : '#10b981';
        const statusLabel = isOff ? 'Off' : consistency.status === 'breached' ? 'Breached' : consistency.status === 'warning' ? 'Warning' : 'Safe';
        const barPct = Math.min(100, (consistency.ratioPct / consistency.thresholdPct) * 100);
        return (
          <div className="rounded-2xl border border-gray-700/60 bg-gray-900/50 p-5">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-white flex items-center gap-2">
                  <Gauge className="w-4 h-4" style={{ color: statusColor }} /> Consistency Monitor
                </p>
                <button onClick={() => setShowConsistencyInfo(v => !v)} className="text-gray-500 hover:text-gray-300">
                  <Info className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-1 rounded-full" style={{ color: statusColor, background: `${statusColor}1a`, border: `1px solid ${statusColor}40` }}>
                  {statusLabel}
                </span>
                <Switch
                  checked={!isOff}
                  onCheckedChange={v => setEnabledMutation.mutate(v)}
                  disabled={setEnabledMutation.isPending}
                />
              </div>
            </div>

            {showConsistencyInfo && (
              <div className="rounded-lg bg-black/30 border border-gray-800/80 px-3 py-2.5 mt-2 mb-3">
                <p className="text-[11px] text-gray-400 leading-relaxed">
                  <span className="font-bold text-gray-300">Why this exists:</span> many prop firms (FTMO-style rules) will deny a payout — even after you hit the profit target — if one single day accounts for too much of your total profit. It's their way of proving your results come from a repeatable process, not one lucky day.
                  <br /><br />
                  <span className="font-bold text-gray-300">How VEDD handles it:</span> as today's profit approaches the cap, new trade sizes on this account automatically shrink. If today's profit actually reaches the cap, new trades are blocked on this account until the next trading day — nothing already banked is touched, and the ratio naturally comes back down as future days add to your total profit.
                  <br /><br />
                  <span className="font-bold text-gray-300">Not every firm has this rule</span> — use the switch above to turn it off for accounts where it doesn't apply. Full walkthrough: Workforce Academy → VEDD Platform Power Features → "Passing Prop Firm Challenges."
                </p>
              </div>
            )}

            {isOff ? (
              <p className="text-xs text-gray-500 py-1">{consistency.guidance}</p>
            ) : (
              <>
                <div className="h-2 rounded-full bg-gray-800 overflow-hidden mb-2 mt-2">
                  <div className="h-full rounded-full transition-all" style={{ width: `${barPct}%`, background: statusColor }} />
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Today's profit is <span className="font-bold text-white">{consistency.ratioPct.toFixed(1)}%</span> of total realized profit — cap is <span className="font-bold text-white">{consistency.thresholdPct}%</span>
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs mb-3">
                  <div><p className="text-gray-500">Today's P&amp;L</p><p className="text-white font-semibold mt-0.5">{fmtMoney(consistency.todayPnl)}</p></div>
                  <div><p className="text-gray-500">Total profit (all-time)</p><p className="text-white font-semibold mt-0.5">{fmtMoney(consistency.totalPositivePnl)}</p></div>
                  {typeof consistency.maxDayPnl === 'number' && (
                    <div><p className="text-gray-500">Biggest day</p><p className="text-white font-semibold mt-0.5">{fmtMoney(consistency.maxDayPnl)} <span className="text-gray-500">({(consistency.maxDayRatioPct ?? 0).toFixed(1)}%)</span></p></div>
                  )}
                </div>

                <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-gray-800/60 bg-black/20 px-3 py-2">
                  <p className="text-[10px] text-gray-500 leading-snug">Numbers not matching your prop firm? VEDD only counts trades it placed. Pull your broker's full closed-trade history to match the firm's ratio.</p>
                  <button
                    onClick={() => backfillMutation.mutate()}
                    disabled={backfillMutation.isPending}
                    className="shrink-0 text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-60"
                  >
                    {backfillMutation.isPending ? 'Syncing…' : 'Sync from broker'}
                  </button>
                </div>
                {backfillMutation.isError && <p className="text-[10px] text-red-400 mb-2">Sync failed — try again in a moment.</p>}
                {backfillMutation.isSuccess && <p className="text-[10px] text-emerald-400 mb-2">Recalculated from broker history ✓</p>}

                <p className="text-[11px] text-gray-500 mb-3">{consistency.guidance}</p>

                {consistency.plan && !consistency.plan.passing && consistency.plan.maxDayPnl > 0 && (
                  <div className={`mb-3 rounded-xl border p-3 ${consistency.plan.feasibility === 'unrealistic' ? 'border-red-500/40 bg-red-500/[0.08]' : 'border-amber-500/30 bg-amber-500/[0.07]'}`}>
                    <p className={`text-[11px] font-bold mb-2 ${consistency.plan.feasibility === 'unrealistic' ? 'text-red-300' : 'text-amber-300'}`}>
                      {consistency.plan.feasibility === 'unrealistic' ? '⚠️ Reset recommended — dilution impractical' : 'Path to pass consistency'}
                    </p>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      <div><p className="text-gray-500">Biggest day</p><p className="text-white font-semibold mt-0.5">{fmtMoney(consistency.plan.maxDayPnl)} <span className="text-amber-400">({consistency.plan.maxDayRatioPct.toFixed(1)}%)</span></p></div>
                      <div><p className="text-gray-500">Cap</p><p className="text-white font-semibold mt-0.5">{consistency.plan.thresholdPct}%</p></div>
                      <div><p className="text-gray-500">Total profit needed</p><p className="text-white font-semibold mt-0.5">{fmtMoney(consistency.plan.targetTotalPnl)}</p></div>
                      <div><p className="text-gray-500">More profit to add</p><p className="text-emerald-400 font-semibold mt-0.5">{fmtMoney(consistency.plan.additionalProfitNeeded)}</p></div>
                      <div><p className="text-gray-500">Safe per-day cap</p><p className="text-white font-semibold mt-0.5">{fmtMoney(consistency.plan.safeDailyProfitCap)}/day</p></div>
                      <div><p className="text-gray-500">Est. days / growth</p><p className="text-white font-semibold mt-0.5">~{consistency.plan.estDaysNeeded}d · {consistency.plan.growthMultiple}×</p></div>
                    </div>
                    <p className={`text-[10px] mt-2 leading-snug ${consistency.plan.feasibility === 'unrealistic' ? 'text-red-200/80' : 'text-amber-200/70'}`}>
                      {consistency.plan.recommendation}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-gray-800/60">
                  <p className="text-[10px] text-gray-600">Cap for this account</p>
                  {editingThreshold ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="number" value={thresholdInput} onChange={e => setThresholdInput(e.target.value)}
                        placeholder={`${consistency.defaultThresholdPct}`} className="w-16 bg-black/40 border border-gray-700 rounded-lg px-2 py-1 text-xs text-white outline-none focus:border-indigo-500/50"
                      />
                      <span className="text-xs text-gray-500">%</span>
                      <button
                        onClick={() => setThresholdMutation.mutate(parseFloat(thresholdInput) || consistency.defaultThresholdPct)}
                        disabled={setThresholdMutation.isPending}
                        className="text-xs font-bold px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white"
                      >
                        {setThresholdMutation.isPending ? '…' : 'Save'}
                      </button>
                      <button onClick={() => setEditingThreshold(false)} className="text-xs text-gray-500 px-1">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setThresholdInput(String(consistency.thresholdPct)); setEditingThreshold(true); }}
                      className="text-xs font-bold text-indigo-400"
                    >
                      {consistency.thresholdPct}% — Edit
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        );
      })()}

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
