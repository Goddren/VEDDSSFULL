import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  TrendingUp, Target, Zap, Clock, Play, Square, ChevronUp, BarChart3,
  Activity, DollarSign, Trophy, AlertTriangle, CheckCircle2, Plus, RefreshCw,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MicroStatus {
  tier: number;
  balance: number;
  lotSize: number;
  maxTrades: number;
  pipTarget: string;
  slPips: number;
  sessionDuration: number;
  todayPnl: number;
  totalPnl: number;
  sessionCount: number;
  nextTierBalance: number | null;
  progressPct: number;
}

interface MicroSession {
  id: string;
  userId: number;
  startedAt: string;
  durationMs: number;
  tier: number;
  lotSize: number;
  maxTrades: number;
  pipTarget: number;
  slPips: number;
  pairs: string[];
  status: 'active' | 'completed' | 'stopped';
  tradesCount: number;
  pipsGained: number;
  pnl: number;
  completedAt?: string;
}

interface ActivityEntry {
  time: string;
  type: 'start' | 'signal' | 'pip' | 'info';
  message: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_COLORS: Record<number, { accent: string; bg: string; border: string }> = {
  1: { accent: '#22c55e', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.3)'  },
  2: { accent: '#10b981', bg: 'rgba(16,185,129,0.08)',  border: 'rgba(16,185,129,0.3)' },
  3: { accent: '#06b6d4', bg: 'rgba(6,182,212,0.08)',   border: 'rgba(6,182,212,0.3)'  },
  4: { accent: '#3b82f6', bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.3)' },
  5: { accent: '#8b5cf6', bg: 'rgba(139,92,246,0.08)',  border: 'rgba(139,92,246,0.3)' },
  6: { accent: '#a855f7', bg: 'rgba(168,85,247,0.08)',  border: 'rgba(168,85,247,0.3)' },
  7: { accent: '#ec4899', bg: 'rgba(236,72,153,0.08)',  border: 'rgba(236,72,153,0.3)' },
};

const TIER_LABELS: Record<number, string> = {
  1: 'Micro Starter',
  2: 'Micro Builder',
  3: 'Micro Grower',
  4: 'Small Account',
  5: 'Mid-Tier',
  6: 'Upper Mid',
  7: 'Full Scale',
};

const RISK_MODES = [
  { id: 'conservative', label: 'Conservative', desc: 'Lower pip range' },
  { id: 'standard',     label: 'Standard',     desc: 'Midpoint targets' },
  { id: 'aggressive',   label: 'Aggressive',   desc: 'Upper pip range' },
] as const;
type RiskMode = 'conservative' | 'standard' | 'aggressive';

const ALL_PAIRS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'NAS100', 'USDJPY', 'GBPJPY'];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatMs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function fmtPnl(v: number): string {
  const sign = v >= 0 ? '+' : '';
  return `${sign}$${v.toFixed(2)}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MicroGrowthPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClientHook = useQueryClient();

  // Setup state
  const [balance, setBalance] = useState<number>(25);
  const [balanceInput, setBalanceInput] = useState<string>('25');
  const [selectedPairs, setSelectedPairs] = useState<string[]>(['EURUSD', 'XAUUSD']);
  const [riskMode, setRiskMode] = useState<RiskMode>('standard');

  // Session state
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<number | null>(null);
  const [sessionDurationMs, setSessionDurationMs] = useState<number>(0);
  const [timeLeftMs, setTimeLeftMs] = useState<number>(0);
  const [tradesThisSession, setTradesThisSession] = useState<number>(0);
  const [pipsThisSession, setPipsThisSession] = useState<number>(0);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Result modal state
  const [showResultModal, setShowResultModal] = useState<boolean>(false);
  const [resultPips, setResultPips] = useState<string>('0');
  const [resultTrades, setResultTrades] = useState<string>('0');
  const [resultPnl, setResultPnl] = useState<string>('0');
  const [pendingStop, setPendingStop] = useState<boolean>(false);

  // ── Queries ─────────────────────────────────────────────────────────────────

  const { data: status, refetch: refetchStatus } = useQuery<MicroStatus>({
    queryKey: ['/api/micro-growth/status', balance],
    queryFn: () => apiRequest('GET', `/api/micro-growth/status?balance=${balance}`).then(r => r.json()),
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const { data: sessions = [], refetch: refetchSessions } = useQuery<MicroSession[]>({
    queryKey: ['/api/micro-growth/sessions'],
    queryFn: () => apiRequest('GET', '/api/micro-growth/sessions').then(r => r.json()),
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const startMutation = useMutation({
    mutationFn: (data: { balance: number; pairs: string[] }) =>
      apiRequest('POST', '/api/micro-growth/start-session', data).then(r => r.json()),
    onSuccess: (data: { sessionId: string; session: MicroSession }) => {
      setActiveSessionId(data.sessionId);
      const dur = data.session.durationMs;
      setSessionDurationMs(dur);
      setSessionStartTime(Date.now());
      setTimeLeftMs(dur);
      setTradesThisSession(0);
      setPipsThisSession(0);
      addActivity('start', `Session started — Tier ${data.session.tier} | ${data.session.lotSize} lots | Target ${status?.pipTarget ?? '?'} pips`);
      toast({ title: 'Session started!', description: `${Math.round(dur / 60000)}-min scalping session is live.` });
    },
    onError: () => toast({ title: 'Error', description: 'Could not start session.', variant: 'destructive' }),
  });

  const logMutation = useMutation({
    mutationFn: (data: { sessionId: string; pipsGained: number; tradesCount: number; pnl: number; pairs: string[] }) =>
      apiRequest('POST', '/api/micro-growth/log-session', data).then(r => r.json()),
    onSuccess: () => {
      setActiveSessionId(null);
      setSessionStartTime(null);
      setTimeLeftMs(0);
      setTradesThisSession(0);
      setPipsThisSession(0);
      setActivity([]);
      setShowResultModal(false);
      refetchStatus();
      refetchSessions();
      queryClientHook.invalidateQueries({ queryKey: ['/api/micro-growth/sessions'] });
      toast({ title: 'Session logged!', description: 'Great work. Check your session history below.' });
    },
    onError: () => toast({ title: 'Error', description: 'Could not log session.', variant: 'destructive' }),
  });

  // ── Timer logic ───────────────────────────────────────────────────────────────

  const addActivity = useCallback((type: ActivityEntry['type'], message: string) => {
    const entry: ActivityEntry = {
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message,
    };
    setActivity(prev => [entry, ...prev].slice(0, 20));
  }, []);

  const stopTimers = useCallback(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (signalRef.current) { clearInterval(signalRef.current); signalRef.current = null; }
  }, []);

  const handleSessionExpired = useCallback(() => {
    stopTimers();
    addActivity('info', 'Session timer expired. Log your results.');
    setPendingStop(true);
    setShowResultModal(true);
  }, [stopTimers, addActivity]);

  useEffect(() => {
    if (activeSessionId && sessionStartTime) {
      // Countdown timer — tick every 500ms
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - sessionStartTime;
        const left = Math.max(0, sessionDurationMs - elapsed);
        setTimeLeftMs(left);
        if (left === 0) {
          handleSessionExpired();
        }
      }, 500);

      // Trade signal pulse every 60s
      signalRef.current = setInterval(() => {
        const pair = selectedPairs[Math.floor(Math.random() * selectedPairs.length)];
        const dir = Math.random() > 0.5 ? 'LONG' : 'SHORT';
        const emoji = dir === 'LONG' ? '↑' : '↓';
        addActivity('signal', `Signal fired on ${pair} — ${emoji} ${dir} scalp opportunity`);
      }, 60000);
    } else {
      stopTimers();
    }
    return stopTimers;
  }, [activeSessionId, sessionStartTime, sessionDurationMs, selectedPairs, stopTimers, handleSessionExpired, addActivity]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleBalanceChange(val: string) {
    setBalanceInput(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 1) setBalance(n);
  }

  function togglePair(pair: string) {
    setSelectedPairs(prev =>
      prev.includes(pair) ? (prev.length > 1 ? prev.filter(p => p !== pair) : prev) : [...prev, pair]
    );
  }

  function handleStartSession() {
    if (activeSessionId) return;
    startMutation.mutate({ balance, pairs: selectedPairs });
  }

  function handleStopSession() {
    stopTimers();
    setTimeLeftMs(0);
    addActivity('info', 'Session manually stopped. Log your results.');
    setPendingStop(true);
    setShowResultModal(true);
  }

  function handleSubmitResult() {
    if (!activeSessionId) return;
    const pips = parseFloat(resultPips) || 0;
    const trades = parseInt(resultTrades) || 0;
    const pnl = parseFloat(resultPnl) || 0;
    logMutation.mutate({
      sessionId: activeSessionId,
      pipsGained: pips,
      tradesCount: trades,
      pnl,
      pairs: selectedPairs,
    });
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const tierColors = TIER_COLORS[status?.tier ?? 1];
  const tierLabel = TIER_LABELS[status?.tier ?? 1];
  const sessionPct = status ? (pipsThisSession / parseFloat(status.pipTarget.split('–')[1])) * 100 : 0;
  const pipTargetMax = status ? parseFloat(status.pipTarget.split('–')[1]) : 5;

  // Growth chart data from session history
  const chartData = (() => {
    const sorted = [...sessions].reverse();
    let running = balance - sorted.reduce((acc, s) => acc + (s.pnl ?? 0), 0);
    const pts: { session: number; balance: number }[] = [{ session: 0, balance: Math.max(25, running) }];
    sorted.forEach((s, i) => {
      running += (s.pnl ?? 0);
      pts.push({ session: i + 1, balance: parseFloat(running.toFixed(2)) });
    });
    return pts;
  })();

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-24">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* ── Page Header ── */}
        <div className="flex items-center gap-3 pt-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)' }}>
            <TrendingUp className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Micro Account Growth Engine</h1>
            <p className="text-xs text-gray-400">Scalp your way from $25 → $500+ with tier-based sessions</p>
          </div>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => { refetchStatus(); refetchSessions(); }} className="text-gray-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* ── Tier Card ── */}
        {status && (
          <Card style={{ background: tierColors.bg, border: `1px solid ${tierColors.border}` }}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge style={{ background: tierColors.accent + '22', color: tierColors.accent, border: `1px solid ${tierColors.accent}44` }}>
                      Tier {status.tier}
                    </Badge>
                    <span className="text-sm font-semibold text-white">{tierLabel}</span>
                  </div>
                  <p className="text-xs text-gray-400">${status.balance >= 500 ? '500+' : `${[25,50,100,150,250,350,500][status.tier - 1]}–${[49,99,149,249,349,499,'∞'][status.tier - 1]}`} balance range</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold" style={{ color: tierColors.accent }}>${balance.toFixed(2)}</p>
                  <p className="text-xs text-gray-400">current balance</p>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Lot Size', value: status.lotSize },
                  { label: 'Max Trades', value: status.maxTrades },
                  { label: 'Pip Target', value: status.pipTarget },
                  { label: 'SL Pips', value: status.slPips },
                ].map(item => (
                  <div key={item.label} className="text-center rounded-lg p-2" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-base font-bold text-white">{item.value}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{item.label}</p>
                  </div>
                ))}
              </div>

              {/* Progress to next tier */}
              {status.nextTierBalance && (
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                    <span>Progress to Tier {status.tier + 1}</span>
                    <span style={{ color: tierColors.accent }}>Next tier at ${status.nextTierBalance}</span>
                  </div>
                  <Progress value={status.progressPct} className="h-2" style={{ '--progress-color': tierColors.accent } as any} />
                  <p className="text-xs text-gray-500 mt-1">{status.progressPct}% to next tier unlock</p>
                </div>
              )}
              {!status.nextTierBalance && (
                <div className="flex items-center gap-2 mt-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  <span className="text-sm text-yellow-400 font-semibold">Maximum tier reached!</span>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── Stats Bar ── */}
        {status && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: DollarSign, label: "Today's P&L", value: fmtPnl(status.todayPnl), color: status.todayPnl >= 0 ? '#22c55e' : '#ef4444' },
              { icon: BarChart3, label: 'Total P&L', value: fmtPnl(status.totalPnl), color: status.totalPnl >= 0 ? '#22c55e' : '#ef4444' },
              { icon: Activity, label: 'Sessions', value: String(status.sessionCount), color: '#8b5cf6' },
            ].map(item => (
              <Card key={item.label} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: item.color + '18' }}>
                    <item.icon className="w-4 h-4" style={{ color: item.color }} />
                  </div>
                  <div>
                    <p className="text-base font-bold leading-tight" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-[10px] text-gray-500">{item.label}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Session Setup / Controls ── */}
        <Card style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              Session Controls
              {activeSessionId && (
                <Badge className="ml-auto animate-pulse" style={{ background: 'rgba(34,197,94,0.2)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.4)' }}>
                  LIVE
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Balance input — only shown when no active session */}
            {!activeSessionId && (
              <>
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Account Balance ($)</label>
                  <Input
                    type="number"
                    min={1}
                    value={balanceInput}
                    onChange={e => handleBalanceChange(e.target.value)}
                    className="bg-gray-900 border-gray-700 text-white"
                    placeholder="25"
                  />
                </div>

                {/* Pairs selector */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Pairs to Trade</label>
                  <div className="flex flex-wrap gap-2">
                    {ALL_PAIRS.map(pair => (
                      <button
                        key={pair}
                        onClick={() => togglePair(pair)}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                        style={{
                          background: selectedPairs.includes(pair) ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                          border: selectedPairs.includes(pair) ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                          color: selectedPairs.includes(pair) ? '#c4b5fd' : '#9ca3af',
                        }}
                      >
                        {pair}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Risk mode */}
                <div>
                  <label className="text-xs text-gray-400 mb-1.5 block">Risk Mode</label>
                  <div className="grid grid-cols-3 gap-2">
                    {RISK_MODES.map(mode => (
                      <button
                        key={mode.id}
                        onClick={() => setRiskMode(mode.id)}
                        className="text-xs p-2.5 rounded-lg text-center transition-all"
                        style={{
                          background: riskMode === mode.id ? 'rgba(59,130,246,0.2)' : 'rgba(255,255,255,0.04)',
                          border: riskMode === mode.id ? '1px solid rgba(59,130,246,0.5)' : '1px solid rgba(255,255,255,0.08)',
                          color: riskMode === mode.id ? '#93c5fd' : '#6b7280',
                        }}
                      >
                        <p className="font-semibold">{mode.label}</p>
                        <p className="text-[10px] mt-0.5 opacity-70">{mode.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Active session info */}
            {activeSessionId && status && (
              <div className="space-y-3">
                {/* Countdown */}
                <div className="flex items-center justify-between rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-green-400" />
                    <span className="text-xs text-gray-400">{status.sessionDuration}-min session</span>
                  </div>
                  <span className="text-2xl font-mono font-bold text-green-400">{formatMs(timeLeftMs)}</span>
                </div>

                {/* Trades counter */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400">Trades this session</span>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold text-white">{tradesThisSession}</span>
                    <span className="text-gray-600">/</span>
                    <span className="text-gray-400">{status.maxTrades}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { setTradesThisSession(t => Math.min(t + 1, status.maxTrades)); addActivity('pip', `Trade #${tradesThisSession + 1} executed`); }}
                      className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                {/* Pip target */}
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 flex items-center gap-1">
                    <Target className="w-3.5 h-3.5" />
                    Target per trade
                  </span>
                  <span className="text-sm font-semibold text-cyan-400">{status.pipTarget} pips</span>
                </div>

                {/* Pip progress */}
                <div>
                  <div className="flex justify-between text-xs text-gray-400 mb-1">
                    <span>Pips this session</span>
                    <span className="text-green-400 font-semibold">{pipsThisSession} / {pipTargetMax}</span>
                  </div>
                  <Progress value={Math.min(100, sessionPct)} className="h-1.5" />
                </div>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3">
              {!activeSessionId ? (
                <Button
                  onClick={handleStartSession}
                  disabled={startMutation.isPending}
                  className="flex-1 bg-green-600 hover:bg-green-700 text-white font-semibold h-11"
                >
                  <Play className="w-4 h-4 mr-2" />
                  {startMutation.isPending ? 'Starting…' : 'Start Session'}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => { setPipsThisSession(p => p + 1); addActivity('pip', `+1 pip captured (total: ${pipsThisSession + 1})`); }}
                    className="flex-1 border-cyan-700 text-cyan-400 hover:bg-cyan-900/20"
                  >
                    <ChevronUp className="w-4 h-4 mr-1" />
                    +1 Pip
                  </Button>
                  <Button
                    onClick={handleStopSession}
                    variant="destructive"
                    className="flex-1 h-11"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    Stop Session
                  </Button>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* ── Live Feed ── */}
        {activeSessionId && activity.length > 0 && (
          <Card style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-green-400" />
                Live Session Feed
              </CardTitle>
            </CardHeader>
            <CardContent className="p-3 space-y-1.5">
              {activity.map((entry, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <span className="text-gray-600 flex-shrink-0 font-mono">{entry.time}</span>
                  <span className={
                    entry.type === 'start' ? 'text-green-400' :
                    entry.type === 'signal' ? 'text-yellow-400' :
                    entry.type === 'pip' ? 'text-cyan-400' :
                    'text-gray-400'
                  }>
                    {entry.type === 'start' ? '▶' : entry.type === 'signal' ? '⚡' : entry.type === 'pip' ? '●' : '·'} {entry.message}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ── Session History ── */}
        {sessions.length > 0 && (
          <Card style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-purple-400" />
                Session History
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                      {['Date/Time', 'Tier', 'Trades', 'Pips', 'P&L', 'Status'].map(h => (
                        <th key={h} className="px-3 py-2.5 text-left text-gray-500 font-semibold uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.slice(0, 10).map((s, i) => (
                      <tr key={s.id} className="transition-colors" style={{ borderBottom: i < 9 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                        <td className="px-3 py-2.5 text-gray-400">{fmtDate(s.startedAt)}</td>
                        <td className="px-3 py-2.5">
                          <Badge style={{ background: TIER_COLORS[s.tier]?.accent + '18', color: TIER_COLORS[s.tier]?.accent, border: `1px solid ${TIER_COLORS[s.tier]?.accent}33` }}>
                            T{s.tier}
                          </Badge>
                        </td>
                        <td className="px-3 py-2.5 text-white font-medium">{s.tradesCount}</td>
                        <td className="px-3 py-2.5 text-cyan-400 font-medium">{s.pipsGained}</td>
                        <td className="px-3 py-2.5 font-medium" style={{ color: s.pnl >= 0 ? '#22c55e' : '#ef4444' }}>{fmtPnl(s.pnl)}</td>
                        <td className="px-3 py-2.5">
                          {s.pipsGained > 0
                            ? <CheckCircle2 className="w-4 h-4 text-green-400" />
                            : <AlertTriangle className="w-4 h-4 text-yellow-500" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals row */}
              <div className="px-4 py-3 flex gap-6" style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <p className="text-[10px] text-gray-500">Total Sessions</p>
                  <p className="text-sm font-bold text-white">{sessions.length}</p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Avg Pips/Session</p>
                  <p className="text-sm font-bold text-cyan-400">
                    {sessions.length > 0 ? (sessions.reduce((a, s) => a + s.pipsGained, 0) / sessions.length).toFixed(1) : '0'}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-gray-500">Total P&L</p>
                  <p className="text-sm font-bold" style={{ color: (status?.totalPnl ?? 0) >= 0 ? '#22c55e' : '#ef4444' }}>
                    {fmtPnl(status?.totalPnl ?? 0)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Growth Chart ── */}
        <Card style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-purple-400" />
              Account Growth Projection
            </CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length < 2 ? (
              <div className="flex flex-col items-center justify-center h-32 text-gray-600 text-sm gap-2">
                <TrendingUp className="w-8 h-8 opacity-30" />
                <p>Complete your first session to see the growth chart</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="session" label={{ value: 'Session #', position: 'insideBottom', offset: -2, style: { fontSize: 10, fill: '#6b7280' } }} tick={{ fill: '#6b7280', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={v => `$${v}`} width={50} />
                  <Tooltip
                    contentStyle={{ background: '#111827', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={(val: number) => [`$${val.toFixed(2)}`, 'Balance']}
                  />
                  <ReferenceLine y={500} stroke="#8b5cf6" strokeDasharray="4 4" label={{ value: '$500 Target', fill: '#8b5cf6', fontSize: 10 }} />
                  <Area type="monotone" dataKey="balance" stroke="#22c55e" strokeWidth={2} fill="url(#growthGrad)" dot={false} activeDot={{ r: 4, fill: '#22c55e' }} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

      </div>

      {/* ── Result Modal ── */}
      <Dialog open={showResultModal} onOpenChange={open => { if (!open && !logMutation.isPending) { setShowResultModal(false); } }}>
        <DialogContent className="bg-gray-900 border-gray-700 text-white max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-400" />
              Log Session Results
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Total Pips Gained</label>
              <Input
                type="number"
                value={resultPips}
                onChange={e => setResultPips(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Trades Taken</label>
              <Input
                type="number"
                value={resultTrades}
                onChange={e => setResultTrades(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Net P&L ($)</label>
              <Input
                type="number"
                step="0.01"
                value={resultPnl}
                onChange={e => setResultPnl(e.target.value)}
                className="bg-gray-800 border-gray-700 text-white"
                placeholder="0.00"
              />
            </div>
            <Button
              onClick={handleSubmitResult}
              disabled={logMutation.isPending}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {logMutation.isPending ? 'Saving…' : 'Save Session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
