import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Shield, TrendingUp, TrendingDown, Clock, Target, AlertTriangle,
  CheckCircle2, XCircle, Calendar, Zap, BarChart2, Play, Pause,
  ChevronUp, ChevronDown, Lock, Unlock, Brain, Activity,
  Bot, Server, Layers, BookOpen, Sparkles, BarChart, ChevronRight
} from 'lucide-react';

interface DashboardData {
  active: boolean;
  propFirmMode: boolean;
  balance: number;
  todayPnL: number;
  todayPnLPct: number;
  dailyLossLimitPct: number;
  dailyLossLimitDollar: number;
  dailyLossUsedPct: number;
  dailyLossHalted: boolean;
  dailyProfitHalted: boolean;
  dailyProfitTargetPct: number;
  dailyProfitTargetDollar: number | null;
  drawdownShieldActive: boolean;
  sessionFilterEnabled: boolean;
  inSessionWindow: boolean;
  consistencyEnforcementEnabled: boolean;
  consistencyMinProfitableDays: number;
  consistencyPeriodDays: number;
  maxDailyProfitPctOfTotal: number;
  deepReasoningMode: boolean;
  profitableDays: number;
  totalTradingDays: number;
  daysRemaining: number;
  daysNeeded: number;
  riskMultiplier: number;
  dailyPnLHistory: Record<string, number>;
  periodKeys: string[];
  engineStatus: string;
  scanCount: number;
  tradesExecuted: number;
  openPositionCount: number;
}

function pct(value: number, decimals = 1) {
  return `${value >= 0 ? '+' : ''}${value.toFixed(decimals)}%`;
}

function dollar(value: number) {
  return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toFixed(0)}`;
}

function StatusRing({ used, label, color }: { used: number; label: string; color: string }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(used / 100, 1) * circ;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={r} fill="none" stroke="#1e293b" strokeWidth="8" />
        <circle
          cx="44" cy="44" r={r} fill="none"
          stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 44 44)"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
        <text x="44" y="48" textAnchor="middle" fontSize="14" fontWeight="700" fill="white">
          {Math.round(used)}%
        </text>
      </svg>
      <span className="text-xs text-slate-400 text-center leading-tight">{label}</span>
    </div>
  );
}

function ConsistencyCalendar({ periodKeys, history, minProfitableDays }: {
  periodKeys: string[];
  history: Record<string, number>;
  minProfitableDays: number;
}) {
  if (!periodKeys.length) return (
    <p className="text-sm text-slate-500 text-center py-4">No trading days recorded yet. Start the engine to begin tracking.</p>
  );
  return (
    <div className="grid grid-cols-5 gap-2">
      {periodKeys.map((date, i) => {
        const pnl = history[date] ?? 0;
        const win = pnl > 0;
        const lose = pnl < 0;
        return (
          <div
            key={date}
            title={`${date}: ${dollar(pnl)}`}
            className={`rounded-lg p-2 text-center border ${
              win ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : lose ? 'bg-red-500/15 border-red-500/40 text-red-300'
                : 'bg-slate-800/60 border-slate-700 text-slate-500'
            }`}
          >
            <div className="text-[10px] text-slate-500 mb-1">Day {i + 1}</div>
            <div className={`text-xs font-bold ${win ? 'text-emerald-400' : lose ? 'text-red-400' : 'text-slate-500'}`}>
              {win ? '✓' : lose ? '✗' : '—'}
            </div>
            <div className="text-[9px] mt-0.5 font-mono" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {pnl !== 0 ? dollar(pnl) : '—'}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function PropFirmChallengePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showSettings, setShowSettings] = useState(false);
  const [form, setForm] = useState({
    challengeSessionFilterEnabled: false,
    consistencyEnforcementEnabled: false,
    consistencyMinProfitableDays: 10,
    consistencyPeriodDays: 15,
    dailyProfitTarget: 2,
    propFirmDailyDrawdownLimit: 4,
    maxDailyProfitPctOfTotal: 0,
    deepReasoningMode: false,
  });

  const { data: mindData, refetch: refetchMind } = useQuery<any>({
    queryKey: ['/api/engine/mind-state'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/engine/mind-state');
      return res.json();
    },
    refetchInterval: 10000,
    enabled: !!user,
  });

  const { data: brainData, refetch: refetchBrain } = useQuery<any>({
    queryKey: ['/api/engine/brain-snapshot'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/engine/brain-snapshot');
      return res.json();
    },
    refetchInterval: 30000,
    enabled: !!user,
  });

  const tradingModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await apiRequest('PATCH', '/api/engine/trading-mode', { mode });
      return res.json();
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/engine/brain-snapshot'] });
      toast({ title: `Trading mode set: ${result.tradingMode === 'server_ai' ? 'Server AI Only' : result.tradingMode === 'ea_only' ? 'EA Only' : 'Both Active'}`, description: result.tradingMode === 'server_ai' ? 'Server AI will manage all trades. EA in MT5 can be removed from charts.' : result.tradingMode === 'ea_only' ? 'Server AI signals suppressed. MT5 EA trades autonomously.' : 'Both Server AI and MT5 EA are active simultaneously.' });
    },
  });

  const { data, isLoading, refetch } = useQuery<DashboardData>({
    queryKey: ['/api/prop-firm-challenge/dashboard'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/prop-firm-challenge/dashboard');
      const d = await res.json();
      if (d.active) {
        setForm(f => ({
          ...f,
          challengeSessionFilterEnabled: d.sessionFilterEnabled,
          consistencyEnforcementEnabled: d.consistencyEnforcementEnabled,
          consistencyMinProfitableDays: d.consistencyMinProfitableDays,
          consistencyPeriodDays: d.consistencyPeriodDays,
          dailyProfitTarget: d.dailyProfitTargetPct || 2,
          propFirmDailyDrawdownLimit: d.dailyLossLimitPct,
          maxDailyProfitPctOfTotal: d.maxDailyProfitPctOfTotal || 0,
          deepReasoningMode: d.deepReasoningMode || false,
        }));
      }
      return d;
    },
    refetchInterval: 15000,
    enabled: !!user,
  });

  const configMutation = useMutation({
    mutationFn: async (updates: typeof form) => {
      const res = await apiRequest('POST', '/api/prop-firm-challenge/config', updates);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Challenge settings saved', description: 'Engine updated with new prop firm rules.' });
      queryClient.invalidateQueries({ queryKey: ['/api/prop-firm-challenge/dashboard'] });
      refetch();
    },
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  if (isLoading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-slate-400 animate-pulse">Loading challenge dashboard…</div>
    </div>
  );

  if (!data?.active) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <Card className="bg-slate-900 border-slate-700 max-w-md w-full text-center p-8">
        <Shield className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Engine Not Running</h2>
        <p className="text-slate-400 text-sm mb-6">Start the live trading engine to use the Prop Firm Challenge Dashboard.</p>
        <Button onClick={() => window.location.href = '/live-monitor'} className="bg-blue-600 hover:bg-blue-700">
          Go to Live Monitor
        </Button>
      </Card>
    </div>
  );

  const d = data;
  const lossBarColor = d.dailyLossHalted ? '#ef4444' : d.dailyLossUsedPct > 70 ? '#f97316' : '#22c55e';
  const consistencyPct = d.consistencyPeriodDays > 0
    ? (d.profitableDays / d.consistencyMinProfitableDays) * 100
    : 0;
  const progressToProfitPct = d.dailyProfitTargetPct > 0
    ? Math.min(100, (Math.max(0, d.todayPnLPct) / d.dailyProfitTargetPct) * 100)
    : 0;

  const statusBadge = d.dailyLossHalted
    ? { label: 'LOSS LIMIT HIT', color: 'bg-red-500/20 text-red-400 border-red-500/40' }
    : d.dailyProfitHalted
    ? { label: 'TARGET REACHED', color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' }
    : d.drawdownShieldActive
    ? { label: 'SHIELD ACTIVE', color: 'bg-amber-500/20 text-amber-400 border-amber-500/40' }
    : d.engineStatus === 'running'
    ? { label: 'RUNNING', color: 'bg-blue-500/20 text-blue-400 border-blue-500/40' }
    : { label: d.engineStatus.toUpperCase(), color: 'bg-slate-700/50 text-slate-400 border-slate-600' };

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight">Prop Firm Challenge Dashboard</h1>
              <p className="text-xs text-slate-400">Forex &amp; Futures — Challenge Rules Enforcement</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Badge className={`border text-xs px-3 py-1 ${statusBadge.color}`}>{statusBadge.label}</Badge>
            {!d.propFirmMode && (
              <Badge className="border border-amber-500/40 bg-amber-500/10 text-amber-400 text-xs">
                ⚠ Prop Firm Mode Off
              </Badge>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowSettings(s => !s)}
              className="border-slate-700 text-slate-300 hover:bg-slate-800">
              {showSettings ? 'Hide Settings' : 'Settings'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => refetch()}
              className="border-slate-700 text-slate-300 hover:bg-slate-800">
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">

        {/* Settings Panel */}
        {showSettings && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-white">Challenge Configuration</CardTitle>
              <CardDescription className="text-slate-400">
                These settings apply on top of the live engine. Enable Prop Firm Mode in the Live Monitor first.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="grid sm:grid-cols-2 gap-5">
                <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-white">Session Filter</Label>
                      <p className="text-xs text-slate-400 mt-0.5">Only trade London–NY overlap (13:00–17:00 UTC)</p>
                    </div>
                    <Switch
                      checked={form.challengeSessionFilterEnabled}
                      onCheckedChange={v => setForm(f => ({ ...f, challengeSessionFilterEnabled: v }))}
                    />
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <div className={`w-2 h-2 rounded-full ${d.inSessionWindow ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                    <span className={d.inSessionWindow ? 'text-emerald-400' : 'text-slate-500'}>
                      {d.inSessionWindow ? 'Session window is open right now' : 'Outside session window (13:00–17:00 UTC)'}
                    </span>
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-white">Consistency Enforcement</Label>
                      <p className="text-xs text-slate-400 mt-0.5">Reduce risk when profitable day quota is at risk</p>
                    </div>
                    <Switch
                      checked={form.consistencyEnforcementEnabled}
                      onCheckedChange={v => setForm(f => ({ ...f, consistencyEnforcementEnabled: v }))}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs text-slate-400">Min Profitable Days</Label>
                      <Input
                        type="number" min={1} max={30}
                        value={form.consistencyMinProfitableDays}
                        onChange={e => setForm(f => ({ ...f, consistencyMinProfitableDays: parseInt(e.target.value) || 10 }))}
                        className="mt-1 bg-slate-900 border-slate-600 text-white text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-slate-400">Period (days)</Label>
                      <Input
                        type="number" min={5} max={60}
                        value={form.consistencyPeriodDays}
                        onChange={e => setForm(f => ({ ...f, consistencyPeriodDays: parseInt(e.target.value) || 15 }))}
                        className="mt-1 bg-slate-900 border-slate-600 text-white text-sm h-8"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <Label className="text-sm font-semibold text-white">Daily Profit Target</Label>
                  <p className="text-xs text-slate-400">Engine hard-stops when this % gain is reached — protects your winning day</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={0} max={20} step={0.5}
                      value={form.dailyProfitTarget}
                      onChange={e => setForm(f => ({ ...f, dailyProfitTarget: parseFloat(e.target.value) || 0 }))}
                      className="bg-slate-900 border-slate-600 text-white text-sm h-8 w-24"
                    />
                    <span className="text-slate-400 text-sm">% of account per day</span>
                    <span className="text-xs text-slate-500">(0 = disabled)</span>
                  </div>
                </div>

                <div className="space-y-2 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <Label className="text-sm font-semibold text-white">Max Daily Drawdown</Label>
                  <p className="text-xs text-slate-400">Hard stop triggered when daily loss exceeds this — engine halts and closes all</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={1} max={10} step={0.5}
                      value={form.propFirmDailyDrawdownLimit}
                      onChange={e => setForm(f => ({ ...f, propFirmDailyDrawdownLimit: parseFloat(e.target.value) || 4 }))}
                      className="bg-slate-900 border-slate-600 text-white text-sm h-8 w-24"
                    />
                    <span className="text-slate-400 text-sm">% of account per day</span>
                  </div>
                </div>

                <div className="space-y-2 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <Label className="text-sm font-semibold text-white">Max Single-Day Profit (Consistency Rule)</Label>
                  <p className="text-xs text-slate-400">Halts new trades once today's profit reaches this % of your total challenge profit — protects payout eligibility on firms with a consistency rule</p>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number" min={0} max={100} step={5}
                      value={form.maxDailyProfitPctOfTotal}
                      onChange={e => setForm(f => ({ ...f, maxDailyProfitPctOfTotal: parseFloat(e.target.value) || 0 }))}
                      className="bg-slate-900 border-slate-600 text-white text-sm h-8 w-24"
                    />
                    <span className="text-slate-400 text-sm">% of total profit</span>
                    <span className="text-xs text-slate-500">(0 = disabled)</span>
                  </div>
                </div>

                <div className="space-y-3 p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm font-semibold text-white flex items-center gap-1.5">
                        <Brain className="w-3.5 h-3.5 text-purple-400" /> Deep Reasoning Mode
                      </Label>
                      <p className="text-xs text-slate-400 mt-0.5">Runs a Bull Case → Bear Case → Veteran-Judge debate (30-year-trader persona, real reasoning model) before every confirmation instead of one fast pass. Higher conviction, slower and more expensive per trade.</p>
                    </div>
                    <Switch
                      checked={form.deepReasoningMode}
                      onCheckedChange={v => setForm(f => ({ ...f, deepReasoningMode: v }))}
                    />
                  </div>
                </div>
              </div>
              <Button
                onClick={() => configMutation.mutate(form)}
                disabled={configMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700 text-white"
              >
                {configMutation.isPending ? 'Saving…' : 'Save Challenge Settings'}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Alert banners */}
        {d.dailyLossHalted && (
          <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
            <XCircle className="w-5 h-5 text-red-400 shrink-0" />
            <div>
              <p className="text-red-300 font-semibold text-sm">Daily Loss Limit Hit — Engine Halted</p>
              <p className="text-red-400/70 text-xs">All new trades are blocked for the rest of today. Come back tomorrow.</p>
            </div>
          </div>
        )}
        {d.dailyProfitHalted && (
          <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-xl">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <div>
              <p className="text-emerald-300 font-semibold text-sm">Daily Profit Target Reached — Engine Stopped</p>
              <p className="text-emerald-400/70 text-xs">Today's gains are locked in. The engine will resume scanning tomorrow.</p>
            </div>
          </div>
        )}
        {d.drawdownShieldActive && !d.dailyLossHalted && (
          <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl">
            <Shield className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <p className="text-amber-300 font-semibold text-sm">Drawdown Shield Active — Sniper Mode Only</p>
              <p className="text-amber-400/70 text-xs">Risk capped at 0.25%, minimum 80% confidence, prop_firm_sniper strategy only until session recovers.</p>
            </div>
          </div>
        )}
        {d.consistencyEnforcementEnabled && d.daysNeeded > 0 && d.daysRemaining <= d.daysNeeded + 1 && (
          <div className="flex items-center gap-3 p-4 bg-orange-500/10 border border-orange-500/30 rounded-xl">
            <AlertTriangle className="w-5 h-5 text-orange-400 shrink-0" />
            <div>
              <p className="text-orange-300 font-semibold text-sm">Consistency Alert — Risk Reduced to 25%</p>
              <p className="text-orange-400/70 text-xs">
                Need {d.daysNeeded} more profitable days in {d.daysRemaining} remaining days.
                Risk is capped at 25% of normal lot size to protect the consistency requirement.
              </p>
            </div>
          </div>
        )}

        {/* Gauge row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-700 p-4 flex flex-col items-center gap-3">
            <StatusRing
              used={d.dailyLossUsedPct}
              label="Daily Loss Used"
              color={lossBarColor}
            />
            <div className="text-center">
              <p className="text-xs text-slate-500">Limit: {d.dailyLossLimitPct}% ({dollar(-d.dailyLossLimitDollar)})</p>
              <p className={`text-sm font-bold ${d.todayPnL < 0 ? 'text-red-400' : 'text-emerald-400'}`}>
                Today: {dollar(d.todayPnL)}
              </p>
            </div>
          </Card>

          <Card className="bg-slate-900 border-slate-700 p-4 flex flex-col items-center gap-3">
            <StatusRing
              used={progressToProfitPct}
              label="Daily Profit Target"
              color="#8b5cf6"
            />
            <div className="text-center">
              <p className="text-xs text-slate-500">
                Target: {d.dailyProfitTargetPct > 0 ? `${d.dailyProfitTargetPct}%` : 'Not set'}
              </p>
              <p className="text-sm font-bold text-purple-400">
                {d.todayPnLPct > 0 ? pct(d.todayPnLPct) : '—'}
              </p>
            </div>
          </Card>

          <Card className="bg-slate-900 border-slate-700 p-4 flex flex-col items-center gap-3">
            <StatusRing
              used={consistencyPct}
              label="Consistency Progress"
              color="#3b82f6"
            />
            <div className="text-center">
              <p className="text-xs text-slate-500">
                {d.profitableDays}/{d.consistencyMinProfitableDays} profitable days
              </p>
              <p className="text-sm font-bold text-blue-400">
                {d.daysRemaining} days left
              </p>
            </div>
          </Card>

          <Card className="bg-slate-900 border-slate-700 p-4 flex flex-col items-center justify-center gap-3">
            <div className="text-center space-y-2">
              <div className="flex items-center justify-center gap-2">
                <div className={`w-3 h-3 rounded-full ${d.sessionFilterEnabled ? (d.inSessionWindow ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600') : 'bg-slate-700'}`} />
                <span className="text-xs text-slate-400">Session Filter</span>
              </div>
              <p className={`text-sm font-bold ${d.sessionFilterEnabled ? (d.inSessionWindow ? 'text-emerald-400' : 'text-slate-500') : 'text-slate-600'}`}>
                {d.sessionFilterEnabled ? (d.inSessionWindow ? 'OPEN' : 'CLOSED') : 'OFF'}
              </p>
              <p className="text-[10px] text-slate-600">13:00–17:00 UTC</p>
            </div>
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-2">
                <div className={`w-3 h-3 rounded-full ${d.riskMultiplier < 1 ? 'bg-orange-400' : 'bg-slate-700'}`} />
                <span className="text-xs text-slate-400">Risk Override</span>
              </div>
              <p className={`text-sm font-bold ${d.riskMultiplier < 1 ? 'text-orange-400' : 'text-slate-600'}`}>
                {d.riskMultiplier < 1 ? `${Math.round(d.riskMultiplier * 100)}%` : 'NORMAL'}
              </p>
            </div>
          </Card>
        </div>

        {/* Stat chips */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Engine Scans', value: d.scanCount.toLocaleString(), icon: Zap, color: 'text-blue-400' },
            { label: 'Trades Executed', value: d.tradesExecuted.toLocaleString(), icon: BarChart2, color: 'text-purple-400' },
            { label: 'Open Positions', value: d.openPositionCount.toString(), icon: Play, color: 'text-emerald-400' },
            { label: 'Account Balance', value: `$${d.balance.toLocaleString()}`, icon: TrendingUp, color: 'text-amber-400' },
          ].map((s) => (
            <Card key={s.label} className="bg-slate-900 border-slate-700 p-4">
              <div className="flex items-center gap-2 mb-1">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-slate-500">{s.label}</span>
              </div>
              <p className={`text-xl font-bold ${s.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
            </Card>
          ))}
        </div>

        {/* Challenge calendar */}
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-blue-400" />
                <CardTitle className="text-base text-white">Challenge Calendar</CardTitle>
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-emerald-500/60 inline-block" />Profit day</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-red-500/60 inline-block" />Loss day</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded bg-slate-700 inline-block" />No trades</span>
              </div>
            </div>
            {d.consistencyEnforcementEnabled && (
              <CardDescription className="text-slate-400 text-xs">
                Consistency rule: {d.profitableDays} of {d.consistencyMinProfitableDays} required profitable days
                ({d.totalTradingDays} of {d.consistencyPeriodDays} period days used, {d.daysRemaining} remaining)
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <ConsistencyCalendar
              periodKeys={d.periodKeys}
              history={d.dailyPnLHistory}
              minProfitableDays={d.consistencyMinProfitableDays}
            />
          </CardContent>
        </Card>

        {/* Rules reference */}
        <Card className="bg-slate-900 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              Challenge Rules Active
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              {[
                { label: 'Max Risk Per Trade', value: d.propFirmMode ? '0.5%' : 'Standard', active: d.propFirmMode },
                { label: 'Max Open Trades', value: d.propFirmMode ? '2' : 'Unlimited', active: d.propFirmMode },
                { label: 'Min Confidence', value: d.propFirmMode ? '78%' : `${60}%`, active: d.propFirmMode },
                { label: 'Min R:R Ratio', value: d.propFirmMode ? '1:2' : 'Standard', active: d.propFirmMode },
                { label: 'Preferred Strategy', value: 'Prop Firm Sniper', active: d.propFirmMode },
                { label: 'News Blocking', value: 'Auto-enforced', active: true },
                { label: 'Session Filter', value: d.challengeSessionFilterEnabled ? 'London–NY only' : 'Off', active: d.sessionFilterEnabled },
                { label: 'Consistency Guard', value: d.consistencyEnforcementEnabled ? `${d.consistencyMinProfitableDays}/${d.consistencyPeriodDays} days` : 'Off', active: d.consistencyEnforcementEnabled },
                { label: 'Daily Loss Limit', value: `${d.dailyLossLimitPct}% (${dollar(-d.dailyLossLimitDollar)})`, active: true },
                { label: 'Daily Profit Stop', value: d.dailyProfitTargetPct > 0 ? `${d.dailyProfitTargetPct}%` : 'Not set', active: d.dailyProfitTargetPct > 0 },
                { label: 'Drawdown Shield', value: d.drawdownShieldActive ? 'ACTIVE — 0.25% risk' : 'On standby', active: d.drawdownShieldActive },
                { label: 'Post-Loss Direction Lock', value: '45 min (90 min after 2 losses)', active: true },
              ].map(r => (
                <div key={r.label} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400">{r.label}</span>
                  <span className={`font-medium text-right ${r.active ? 'text-white' : 'text-slate-600'}`}>{r.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Engine Mind State */}
        {mindData?.active && mindData?.mindState && (
          <Card className="bg-slate-900 border-slate-700">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-400" />
                  Engine Mind — Live Session Intelligence
                </CardTitle>
                {mindData.mindState.coolOffActive && (
                  <Badge className="bg-orange-500/20 border-orange-500/40 text-orange-300 text-xs border">
                    ⏸ Cool-off: {mindData.mindState.coolOffRemainingMin}m remaining
                  </Badge>
                )}
              </div>
              <CardDescription className="text-slate-400 text-xs">
                The engine autonomously updates its own rules after every trade — no user input required.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Session stats row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Session Wins', value: mindData.mindState.sessionWins, color: 'text-emerald-400' },
                  { label: 'Session Losses', value: mindData.mindState.sessionLosses, color: 'text-red-400' },
                  { label: 'Win Rate', value: `${(mindData.mindState.sessionWinRate * 100).toFixed(0)}%`, color: mindData.mindState.sessionWinRate >= 0.55 ? 'text-emerald-400' : mindData.mindState.sessionWinRate >= 0.40 ? 'text-amber-400' : 'text-red-400' },
                  { label: 'Confidence Floor', value: `${mindData.mindState.adaptedConfidenceFloor}%`, color: mindData.mindState.adaptedConfidenceFloor > mindData.mindState.configuredConfidenceFloor ? 'text-orange-400' : 'text-slate-300' },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800/60 border border-slate-700 rounded-lg p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                    <p className={`text-xl font-bold ${s.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                  </div>
                ))}
              </div>

              {/* Blocked strategies */}
              {mindData.mindState.blockedStrategies?.length > 0 && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <p className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5" /> Auto-Blocked Strategies (COLD weight ≤ 0.3)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mindData.mindState.blockedStrategies.map((s: string) => (
                      <span key={s} className="px-2 py-1 bg-red-500/20 rounded text-xs text-red-300 font-mono">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Soft-blocked pairs */}
              {mindData.mindState.softBlockedPairs?.length > 0 && (
                <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                  <p className="text-xs font-semibold text-orange-400 mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5" /> Soft-Blocked Pairs (90%+ confidence required)
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {mindData.mindState.softBlockedPairs.map((b: any) => (
                      <span key={b.sym} className="px-2 py-1 bg-orange-500/20 rounded text-xs text-orange-300">
                        {b.sym} — {b.remainingMin}m left
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Per-pair session performance */}
              {Object.keys(mindData.mindState.pairSessionWins || {}).length > 0 || Object.keys(mindData.mindState.pairSessionLosses || {}).length > 0 ? (
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2">Pair Performance This Session</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Array.from(new Set([
                      ...Object.keys(mindData.mindState.pairSessionWins || {}),
                      ...Object.keys(mindData.mindState.pairSessionLosses || {}),
                    ])).map((pair: string) => {
                      const w = mindData.mindState.pairSessionWins?.[pair] || 0;
                      const l = mindData.mindState.pairSessionLosses?.[pair] || 0;
                      const wr = w + l > 0 ? w / (w + l) : 0;
                      return (
                        <div key={pair} className="bg-slate-800/60 border border-slate-700 rounded-lg p-2.5 text-center">
                          <p className="text-xs font-mono font-bold text-white mb-1">{pair}</p>
                          <p className="text-[10px] text-slate-500">{w}W / {l}L</p>
                          <p className={`text-xs font-bold mt-0.5 ${wr >= 0.6 ? 'text-emerald-400' : wr >= 0.4 ? 'text-amber-400' : 'text-red-400'}`}>
                            {(wr * 100).toFixed(0)}%
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Adaptation log */}
              {mindData.mindState.adaptationLog?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 mb-2 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-violet-400" />
                    Recent Autonomous Decisions
                  </p>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {mindData.mindState.adaptationLog.map((entry: string, i: number) => (
                      <div key={i} className="flex gap-2 text-xs p-2 bg-slate-800/40 rounded border border-slate-700/50">
                        <span className="text-violet-400 shrink-0">🧠</span>
                        <span className="text-slate-300">{entry}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Trading Mode Selector ── */}
        <Card id="trading-mode" className="bg-[#1a1a2e] border border-slate-700/60 shadow-lg scroll-mt-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              Trading Mode
              <Badge className="ml-auto text-xs bg-cyan-900/40 text-cyan-300 border-cyan-700/50">
                {brainData?.tradingMode === 'ea_only' ? 'EA Only' : brainData?.tradingMode === 'both' ? 'Both Active' : 'Server AI Only'}
              </Badge>
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Choose whether the VEDD Server AI, your MT5 EA, or both control trade execution.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              {[
                { mode: 'server_ai', icon: Server, label: 'Server AI Only', desc: 'Recommended. AI engine fires trades. Remove EA from MT5 charts.', color: 'emerald' },
                { mode: 'ea_only', icon: Bot, label: 'EA Only', desc: 'Server AI is silenced. MT5 EA trades on its own built-in logic.', color: 'amber' },
                { mode: 'both', icon: Layers, label: 'Both Active', desc: 'Advanced. Server AI + MT5 EA trade simultaneously.', color: 'violet' },
              ].map(({ mode, icon: Icon, label, desc, color }) => {
                const active = (brainData?.tradingMode ?? 'server_ai') === mode;
                const borderCls = active
                  ? color === 'emerald' ? 'border-emerald-500 bg-emerald-900/20' : color === 'amber' ? 'border-amber-500 bg-amber-900/20' : 'border-violet-500 bg-violet-900/20'
                  : 'border-slate-700 bg-slate-800/30 hover:border-slate-500';
                const iconCls = color === 'emerald' ? 'text-emerald-400' : color === 'amber' ? 'text-amber-400' : 'text-violet-400';
                return (
                  <button
                    key={mode}
                    onClick={() => tradingModeMutation.mutate(mode)}
                    disabled={tradingModeMutation.isPending}
                    className={`rounded-xl border p-3 text-left transition-all ${borderCls}`}
                  >
                    <Icon className={`w-5 h-5 mb-1.5 ${iconCls}`} />
                    <p className="text-xs font-semibold text-slate-200 leading-tight mb-1">{label}</p>
                    <p className="text-[10px] text-slate-400 leading-tight">{desc}</p>
                    {active && <span className={`mt-2 inline-block text-[9px] font-bold uppercase tracking-wider ${iconCls}`}>● Active</span>}
                  </button>
                );
              })}
            </div>
            {brainData?.tradingMode === 'ea_only' && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-900/20 border border-amber-700/40 text-xs text-amber-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Server AI news block, HTF gate, and brain enforcement are all inactive in EA-only mode. The EA trades by its own rules only.</span>
              </div>
            )}
            {brainData?.tradingMode === 'both' && (
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-violet-900/20 border border-violet-700/40 text-xs text-violet-300">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                <span>Both systems will open trades independently — watch for position overlap and double exposure on the same pair.</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Brain Intelligence Panel ── */}
        <Card id="brain" className="bg-[#0f1629] border border-violet-700/40 shadow-lg scroll-mt-20">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400 animate-pulse" />
              AI Brain Intelligence
              {brainData?.trained ? (
                <Badge className="ml-auto text-xs bg-violet-900/50 text-violet-300 border-violet-600/50 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Learning Active
                </Badge>
              ) : (
                <Badge className="ml-auto text-xs bg-slate-800 text-slate-400 border-slate-600/50">
                  Awaiting trades
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              The brain analyzes every trade, builds pair-by-pair knowledge, and self-enforces based on what it learns. The more trades, the smarter it gets.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* ── Latest brain update banner ── */}
            {brainData?.lastUpdateAt && brainData?.lastUpdateChanges?.length > 0 && (
              <div className="bg-violet-950/40 border border-violet-700/50 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-semibold text-violet-300 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                  Latest Brain Update — {new Date(brainData.lastUpdateAt).toLocaleTimeString()}
                </p>
                {brainData.lastUpdateChanges.map((change: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
                    <ChevronRight className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />
                    <span>{change}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Brain stats row */}
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: 'Trades Analyzed', value: brainData?.totalTradesAnalyzed ?? 0, color: 'text-violet-300' },
                { label: 'Pairs Learned', value: brainData?.pairsLearned ?? 0, color: 'text-cyan-300' },
                { label: 'Overall Win Rate', value: brainData?.trained ? `${brainData.overallWinRate}%` : '—', color: (brainData?.overallWinRate ?? 0) >= 55 ? 'text-emerald-400' : (brainData?.overallWinRate ?? 0) >= 45 ? 'text-amber-400' : 'text-red-400' },
                { label: 'Total Profit', value: brainData?.trained ? `$${(brainData.totalProfit ?? 0).toFixed(2)}` : '—', color: (brainData?.totalProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="bg-slate-800/40 rounded-lg p-2.5 text-center border border-slate-700/40">
                  <p className={`text-base font-bold ${color}`}>{value}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-tight">{label}</p>
                </div>
              ))}
            </div>

            {/* ── EA Second Opinion (shown when EA-only or Both mode) ── */}
            {(brainData?.tradingMode === 'ea_only' || brainData?.tradingMode === 'both') && (
              <div className="border border-cyan-700/50 bg-cyan-950/20 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-cyan-300 flex items-center gap-1.5">
                  <Brain className="w-3.5 h-3.5" />
                  Server AI Second Opinion
                  <Badge className="ml-auto text-[9px] bg-cyan-900/50 text-cyan-400 border-cyan-700/50">
                    {brainData.tradingMode === 'ea_only' ? 'EA Active — AI watching' : 'Both running'}
                  </Badge>
                </p>
                {brainData?.lastAutonomousSignals ? (
                  <>
                    <p className="text-[10px] text-slate-400 italic">
                      "{brainData.lastAutonomousSignals.marketRead || 'Analyzing market conditions…'}"
                    </p>
                    <div className="space-y-2">
                      {(brainData.lastAutonomousSignals.signals || []).slice(0, 5).map((sig: any, i: number) => {
                        const isLong = sig.direction === 'BUY';
                        return (
                          <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg border text-xs ${isLong ? 'bg-emerald-950/30 border-emerald-800/40' : 'bg-red-950/30 border-red-800/40'}`}>
                            <div className="shrink-0 text-center w-10">
                              <p className={`font-bold text-sm ${isLong ? 'text-emerald-400' : 'text-red-400'}`}>{isLong ? '↑' : '↓'}</p>
                              <p className="text-[9px] text-slate-400">{sig.direction}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <span className="font-semibold text-slate-200">{sig.symbol}</span>
                                <span className={`text-xs font-bold ${sig.confidence >= 75 ? 'text-emerald-400' : 'text-amber-400'}`}>{sig.confidence}%</span>
                              </div>
                              <p className="text-[10px] text-slate-400 truncate mt-0.5">{sig.reason}</p>
                              <div className="flex gap-2 mt-1 text-[9px] text-slate-500">
                                {sig.entryZone && <span>Entry: {sig.entryZone}</span>}
                                {sig.stopLoss && <span>SL: {sig.stopLoss}</span>}
                                {sig.takeProfit && <span>TP: {sig.takeProfit}</span>}
                                {sig.holdTime && <span>Hold: {sig.holdTime}</span>}
                              </div>
                            </div>
                            {brainData.tradingMode === 'ea_only' && (
                              <div className="shrink-0 text-[9px] text-slate-600 text-right">
                                <span>Suppressed</span><br/>
                                <span>(EA mode)</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-slate-600">
                      Generated: {new Date(brainData.lastAutonomousSignals.generatedAt).toLocaleTimeString()} · Brain confidence: {brainData.lastAutonomousSignals.brainConfidence}%
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-slate-500 italic">
                    Brain signals generate automatically after each retrain. Start the engine and complete a few trades to see AI recommendations here.
                  </p>
                )}
              </div>
            )}

            {/* Learning thresholds indicator */}
            <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/30 space-y-2">
              <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-violet-400" /> Brain Learning Thresholds
              </p>
              <div className="space-y-1.5">
                {[
                  { label: 'Session blocking', needed: 3 },
                  { label: 'Hour blocking', needed: 3 },
                  { label: 'Direction bias (soft)', needed: 15 },
                  { label: 'Direction bias (hard block)', needed: 30 },
                ].map(({ label, needed }) => {
                  const tradesPerPair = brainData?.totalTradesAnalyzed && brainData?.pairsLearned > 0
                    ? Math.round(brainData.totalTradesAnalyzed / brainData.pairsLearned)
                    : 0;
                  const pct = Math.min(100, Math.round((tradesPerPair / needed) * 100));
                  const reached = tradesPerPair >= needed;
                  return (
                    <div key={label} className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${reached ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[10px] text-slate-300">{label}</span>
                          <span className="text-[10px] text-slate-500">{needed} trades/pair</span>
                        </div>
                        <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${reached ? 'bg-emerald-500' : 'bg-violet-600'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      {reached && <CheckCircle2 className="w-3 h-3 text-emerald-400 shrink-0" />}
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-500 mt-1">
                Avg ~{brainData?.pairsLearned > 0 ? Math.round((brainData?.totalTradesAnalyzed ?? 0) / brainData.pairsLearned) : 0} trades per pair · Brain always open to new data — every trade refines its knowledge
              </p>
            </div>

            {/* What the brain has learned — insights */}
            {brainData?.learningInsights?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" /> What the Brain Has Learned
                </p>
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {brainData.learningInsights.map((insight: string, i: number) => (
                    <div key={i} className="flex gap-2 text-xs p-2 bg-violet-950/30 rounded-lg border border-violet-800/30">
                      <span className="text-violet-400 shrink-0">💡</span>
                      <span className="text-slate-300">{insight}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Per-pair knowledge grid */}
            {brainData?.pairKnowledge && Object.keys(brainData.pairKnowledge).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
                  <BarChart className="w-3.5 h-3.5 text-cyan-400" /> Pair Knowledge Base
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(brainData.pairKnowledge).map(([pair, k]: [string, any]) => {
                    const wrColor = k.winRate >= 60 ? 'text-emerald-400' : k.winRate >= 45 ? 'text-amber-400' : 'text-red-400';
                    const dirColor = k.preferredDirection === 'BUY' ? 'text-emerald-400' : k.preferredDirection === 'SELL' ? 'text-red-400' : 'text-slate-400';
                    return (
                      <div key={pair} className="bg-slate-800/40 rounded-lg p-2.5 border border-slate-700/30 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-200">{pair}</span>
                          <span className={`text-xs font-bold ${wrColor}`}>{k.winRate}%</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 ${dirColor}`}>
                            {k.preferredDirection === 'BOTH' ? '⇅ Both' : k.preferredDirection === 'BUY' ? '↑ BUY bias' : '↓ SELL bias'}
                          </span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400">
                            {k.totalTrades} trades
                          </span>
                        </div>
                        {k.topSessions?.length > 0 && (
                          <p className="text-[9px] text-slate-500">
                            Best: {k.topSessions[0].session} ({k.topSessions[0].winRate}% WR)
                          </p>
                        )}
                        {k.bestStrategies?.length > 0 && (
                          <p className="text-[9px] text-cyan-600 truncate">
                            🧠 {k.bestStrategies.slice(0, 2).join(' · ')}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Recent enforcement decisions */}
            {brainData?.recentEnforcementLog?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
                  <Shield className="w-3.5 h-3.5 text-orange-400" /> Recent Brain Enforcement Decisions
                </p>
                <div className="space-y-1.5 max-h-36 overflow-y-auto">
                  {brainData.recentEnforcementLog.slice(0, 8).map((log: any, i: number) => (
                    <div key={i} className={`flex gap-2 text-xs p-2 rounded-lg border ${log.rule === 'pass' ? 'bg-emerald-950/20 border-emerald-800/30' : 'bg-orange-950/20 border-orange-800/30'}`}>
                      <span className="shrink-0">{log.rule === 'pass' ? '✅' : '🚫'}</span>
                      <span className="text-slate-300">{log.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Last retrained */}
            {brainData?.lastLearned && (
              <p className="text-[10px] text-slate-600 flex items-center gap-1">
                <Activity className="w-3 h-3" />
                Last retrained: {new Date(brainData.lastLearned).toLocaleTimeString()} · Retrains every 30 min + after every trade · Always open to new data
              </p>
            )}

            {!brainData?.trained && (
              <div className="text-center py-4">
                <Brain className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No trade data yet. The brain will begin learning automatically after your first trade closes.</p>
                <p className="text-[10px] text-slate-600 mt-1">Start the engine and take a few trades to activate learning.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-slate-600 text-center pb-4">
          Dashboard refreshes every 15 seconds. All rules enforce server-side — not just in the UI.
        </p>
      </div>
    </div>
  );
}
