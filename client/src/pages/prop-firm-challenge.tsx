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
  ChevronUp, ChevronDown, Lock, Unlock
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

        <p className="text-xs text-slate-600 text-center pb-4">
          Dashboard refreshes every 15 seconds. All rules enforce server-side — not just in the UI.
        </p>
      </div>
    </div>
  );
}
