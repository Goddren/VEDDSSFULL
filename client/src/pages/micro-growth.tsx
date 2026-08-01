import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
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
  Power, Wifi, WifiOff, ArrowRight, Info, Server,
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

interface DoublingStatus {
  startingBalance: number;
  currentMilestoneBase: number;
  targetBalance: number;
  currentBalance: number;
  progressPct: number;
  doublingsCompleted: number;
  justCompletedDoubling: boolean;
  lastMilestoneHitAt: string | null;
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
  orderType?: 'market' | 'stop_entry' | 'limit_entry';
  pair?: string;
  direction?: 'BUY' | 'SELL';
}

interface VpSignal {
  available: boolean;
  reason?: string;
  poc?: number;
  vah?: number;
  val?: number;
  pocStrength?: number;
  currentPrice?: number;
  timeframe?: string;
  orderType?: 'market' | 'stop_entry' | 'limit_entry';
  direction?: 'BUY' | 'SELL';
  entryNote?: string;
  // Live read from the SS AI Engine's own scan of this symbol (null if the
  // user doesn't have the SS Engine running) — this is how Micro Growth
  // reuses real SS Engine strategy signals instead of running in isolation.
  ssEngineBias?: { direction: 'BUY' | 'SELL' | null; trend: string; rsi: number; agrees: boolean } | null;
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

const FX_PAIRS = ['EURUSD', 'GBPUSD', 'XAUUSD', 'US30', 'NAS100', 'USDJPY', 'GBPJPY'];
// FX closes on weekends — crypto CFDs trade 24/7, so these are the only tradable
// instruments Sat/Sun. Weekend sessions auto-default to these on the server too.
const CRYPTO_PAIRS = ['BTCUSD', 'ETHUSD', 'SOLUSD', 'XRPUSD'];
const ALL_PAIRS = [...FX_PAIRS, ...CRYPTO_PAIRS];
function isWeekendUTC(): boolean {
  const d = new Date().getUTCDay();
  return d === 0 || d === 6;
}

const ORDER_TYPE_META: Record<string, { label: string; color: string; bg: string; emoji: string; desc: string }> = {
  market:      { label: 'MARKET',      color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   emoji: '🟢', desc: 'Enter immediately at current price' },
  stop_entry:  { label: 'STOP ENTRY',  color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  emoji: '🟡', desc: 'Place above/below price — triggers on breakout' },
  limit_entry: { label: 'LIMIT ENTRY', color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', emoji: '🔵', desc: 'Place at key level — triggers on pullback/retest' },
};

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

function fmtPrice(p: number, sym: string): string {
  const digits = sym === 'XAUUSD' ? 2 : sym === 'US30' || sym === 'NAS100' ? 1
    : sym === 'BTCUSD' || sym === 'ETHUSD' ? 2 : sym === 'SOLUSD' || sym === 'XRPUSD' ? 3 : 5;
  return p.toFixed(digits);
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function MicroGrowthPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClientHook = useQueryClient();

  // Engine toggle — persisted to localStorage
  const [engineEnabled, setEngineEnabled] = useState<boolean>(() => {
    try { return localStorage.getItem('micro_growth_enabled') !== 'false'; } catch { return true; }
  });

  // Setup state
  const [balance, setBalance] = useState<number>(25);
  const [balanceInput, setBalanceInput] = useState<string>('25');
  const isWeekend = isWeekendUTC();
  const [selectedPairs, setSelectedPairs] = useState<string[]>(() => isWeekendUTC() ? ['BTCUSD'] : ['EURUSD', 'XAUUSD']);
  const [riskMode, setRiskMode] = useState<RiskMode>('standard');

  // Account connection state
  const [autoForwardMt5, setAutoForwardMt5] = useState<boolean>(() => {
    try { return localStorage.getItem('micro_auto_forward_mt5') === 'true'; } catch { return false; }
  });
  const [showAccountInfo, setShowAccountInfo] = useState(false);

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

  const { data: doubling } = useQuery<DoublingStatus>({
    queryKey: ['/api/micro-growth/doubling-status', balance],
    queryFn: () => apiRequest('GET', `/api/micro-growth/doubling-status?balance=${balance}`).then(r => r.json()),
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  const { data: sessions = [], refetch: refetchSessions } = useQuery<MicroSession[]>({
    queryKey: ['/api/micro-growth/sessions'],
    queryFn: () => apiRequest('GET', '/api/micro-growth/sessions').then(r => r.json()),
    enabled: !!user,
    refetchOnWindowFocus: false,
  });

  // VP signals — refresh every 30s while session is active
  const { data: vpData = {} as Record<string, VpSignal> } = useQuery<Record<string, VpSignal>>({
    queryKey: ['/api/micro-growth/vp-signals', selectedPairs.join(',')],
    queryFn: () =>
      apiRequest('GET', `/api/micro-growth/vp-signals?symbols=${selectedPairs.join(',')}`).then(r => r.json()),
    enabled: !!user && !!activeSessionId,
    refetchInterval: 30000,
    staleTime: 25000,
  });

  // Also fetch VP when not in session so the panel loads before start
  const { data: vpPreview = {} as Record<string, VpSignal> } = useQuery<Record<string, VpSignal>>({
    queryKey: ['/api/micro-growth/vp-preview', selectedPairs.join(',')],
    queryFn: () =>
      apiRequest('GET', `/api/micro-growth/vp-signals?symbols=${selectedPairs.join(',')}`).then(r => r.json()),
    enabled: !!user && !activeSessionId,
    refetchInterval: 60000,
    staleTime: 55000,
  });

  const vpSignals: Record<string, VpSignal> = activeSessionId ? vpData : vpPreview;

  // MT5 tokens
  const { data: mt5Tokens = [] } = useQuery<any[]>({
    queryKey: ['/api/mt5-tokens'],
    queryFn: () => apiRequest('GET', '/api/mt5-tokens').then(r => r.json()),
    enabled: !!user,
    staleTime: 60000,
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

  const dispatchSignalMutation = useMutation({
    mutationFn: (data: any) => apiRequest('POST', '/api/micro-growth/dispatch-signal', data).then(r => r.json()),
    onSuccess: () => toast({ title: '📡 Signal sent to MT5', description: 'Check your EA for the pending order.' }),
    onError: (err: any) => {
      // Surface the server's actual message when available (e.g. the Prop Firm
      // Mode safety block) instead of a generic failure toast.
      let description = 'Live engine may not be running.';
      try {
        const match = String(err?.message || '').match(/\{.*\}/);
        if (match) description = JSON.parse(match[0])?.message || description;
      } catch { /* keep default */ }
      toast({ title: 'Signal Blocked', description, variant: 'destructive' });
    },
  });

  // ── Timer logic ───────────────────────────────────────────────────────────────

  const addActivity = useCallback((
    type: ActivityEntry['type'],
    message: string,
    orderType?: ActivityEntry['orderType'],
    pair?: string,
    direction?: ActivityEntry['direction'],
  ) => {
    const entry: ActivityEntry = {
      time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      type,
      message,
      orderType,
      pair,
      direction,
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

  // Engine on/off toggle
  const toggleEngine = useCallback(() => {
    setEngineEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem('micro_growth_enabled', String(next)); } catch {}
      if (!next) {
        stopTimers();
        setActiveSessionId(null);
        setSessionStartTime(null);
        setTimeLeftMs(0);
        setTradesThisSession(0);
        setPipsThisSession(0);
        setActivity([]);
        setShowResultModal(false);
        setPendingStop(false);
      }
      return next;
    });
  }, [stopTimers]);

  // Signal pulse using VP data when available
  useEffect(() => {
    if (activeSessionId && sessionStartTime) {
      timerRef.current = setInterval(() => {
        const elapsed = Date.now() - sessionStartTime;
        const left = Math.max(0, sessionDurationMs - elapsed);
        setTimeLeftMs(left);
        if (left === 0) handleSessionExpired();
      }, 500);

      signalRef.current = setInterval(() => {
        const pair = selectedPairs[Math.floor(Math.random() * selectedPairs.length)];
        const vp = vpSignals[pair];

        if (vp?.available && vp.orderType) {
          const dir = (vp.direction ?? (Math.random() > 0.5 ? 'BUY' : 'SELL')) as 'BUY' | 'SELL';
          const ot = vp.orderType;
          const meta = ORDER_TYPE_META[ot];
          addActivity(
            'signal',
            `${pair} — ${dir === 'BUY' ? '↑ BUY' : '↓ SELL'} | ${meta.emoji} ${meta.label} | ${vp.entryNote ?? ''}`,
            ot,
            pair,
            dir,
          );
          // Auto-forward to MT5 if enabled
          if (autoForwardMt5 && mt5Tokens.length > 0) {
            dispatchSignalMutation.mutate({
              symbol: pair,
              direction: dir,
              orderType: ot,
              entryPrice: vp.currentPrice,
              slPips: status?.slPips,
              tpPips: status ? parseFloat(status.pipTarget.split('–')[1]) : undefined,
              lotSize: status?.lotSize,
            });
          }
        } else {
          const dir: 'BUY' | 'SELL' = Math.random() > 0.5 ? 'BUY' : 'SELL';
          addActivity('signal', `${pair} — ${dir === 'BUY' ? '↑ BUY' : '↓ SELL'} scalp opportunity | 🟢 MARKET`, 'market', pair, dir);
        }
      }, 60000);
    } else {
      stopTimers();
    }
    return stopTimers;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSessionId, sessionStartTime, sessionDurationMs, selectedPairs, stopTimers, handleSessionExpired]);

  // ── Handlers ─────────────────────────────────────────────────────────────────

  function handleBalanceChange(val: string) {
    setBalanceInput(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 1) setBalance(n);
  }

  // Hard cap: 1-2 pairs only. Small accounts grow fastest by CONCENTRATION —
  // spreading risk across many pairs is exactly what this engine exists to avoid.
  const MAX_SESSION_PAIRS = 2;
  function togglePair(pair: string) {
    setSelectedPairs(prev => {
      if (prev.includes(pair)) return prev.length > 1 ? prev.filter(p => p !== pair) : prev;
      if (prev.length >= MAX_SESSION_PAIRS) {
        toast({ title: `Max ${MAX_SESSION_PAIRS} pairs per session`, description: 'Deselect a pair first — concentration is how small accounts grow fast.' });
        return prev;
      }
      return [...prev, pair];
    });
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
    logMutation.mutate({ sessionId: activeSessionId, pipsGained: pips, tradesCount: trades, pnl, pairs: selectedPairs });
  }

  // ── Derived values ────────────────────────────────────────────────────────────

  const tierColors = TIER_COLORS[status?.tier ?? 1];
  const tierLabel = TIER_LABELS[status?.tier ?? 1];
  const sessionPct = status ? (pipsThisSession / parseFloat(status.pipTarget.split('–')[1])) * 100 : 0;
  const pipTargetMax = status ? parseFloat(status.pipTarget.split('–')[1]) : 5;
  const vpAvailableCount = Object.values(vpSignals).filter(v => v.available).length;

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
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center transition-all"
            style={{
              background: engineEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
              border: engineEnabled ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(255,255,255,0.1)',
            }}
          >
            <TrendingUp className={`w-5 h-5 ${engineEnabled ? 'text-green-400' : 'text-gray-600'}`} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white leading-tight">Micro Account Growth Engine</h1>
            <p className="text-xs text-gray-400">Grow small FX accounts FAST with AI — SS Engine strategies at aggressive risk. Separate from prop-firm accounts.</p>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25">⚠️ HIGH RISK — built for speed</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">🎯 1–2 pairs max per session</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">🌙 Weekends: crypto pairs (BTC/ETH) auto-selected</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/25">🚫 Never runs on prop-firm accounts</span>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { refetchStatus(); refetchSessions(); }} className="text-gray-400 hover:text-white">
              <RefreshCw className="w-4 h-4" />
            </Button>
            <button
              onClick={toggleEngine}
              title={engineEnabled ? 'Disable Engine' : 'Enable Engine'}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all"
              style={{
                background: engineEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.12)',
                border: engineEnabled ? '1px solid rgba(34,197,94,0.4)' : '1px solid rgba(239,68,68,0.35)',
                color: engineEnabled ? '#22c55e' : '#f87171',
              }}
            >
              <Power className="w-3.5 h-3.5" />
              {engineEnabled ? 'ON' : 'OFF'}
            </button>
          </div>
        </div>

        {/* ── Disabled Banner ── */}
        {!engineEnabled && (
          <div className="flex items-center gap-3 rounded-xl px-4 py-4" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
            <Power className="w-5 h-5 text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-red-400">Micro Growth Engine is OFF</p>
              <p className="text-xs text-gray-500 mt-0.5">Enable the engine above to start scalping sessions.</p>
            </div>
            <button onClick={toggleEngine} className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white" style={{ background: 'rgba(34,197,94,0.8)' }}>Enable</button>
          </div>
        )}

        {/* ── Engine content ── */}
        <div className={`space-y-5 transition-opacity ${engineEnabled ? 'opacity-100' : 'opacity-40 pointer-events-none select-none'}`}>

          {/* ── Broker Account Connection Card ── */}
          <Card style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="w-4 h-4 text-cyan-400" />
                Live Broker Account
                {mt5Tokens.length > 0
                  ? <span className="ml-auto flex items-center gap-1 text-xs text-emerald-400"><Wifi className="w-3.5 h-3.5" /> {mt5Tokens.length} API key{mt5Tokens.length !== 1 ? 's' : ''} found</span>
                  : <span className="ml-auto flex items-center gap-1 text-xs text-gray-500"><WifiOff className="w-3.5 h-3.5" /> Not connected</span>
                }
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Connection how-to */}
              <div className="rounded-lg p-3 space-y-2" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.2)' }}>
                <p className="text-xs font-semibold text-cyan-300">How to connect a live account:</p>
                <div className="space-y-1.5 text-[11px] text-gray-400">
                  <div className="flex items-start gap-2">
                    <span className="text-cyan-400 font-bold shrink-0">MT5</span>
                    <span>Go to <strong className="text-gray-300">Profile → MT5 API Keys</strong>, generate a key, then install the VEDD EA in MetaTrader 5. The EA polls for signals automatically.</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="text-purple-400 font-bold shrink-0">TL</span>
                    <span>Use the TradeLocker connection on the <strong className="text-gray-300">Weekly Strategy</strong> page — the Micro Engine shares the same TL session.</span>
                  </div>
                </div>
                <div className="flex gap-2 mt-2">
                  <Link href="/profile">
                    <button className="flex items-center gap-1 text-[10px] bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg px-2.5 py-1.5 transition-colors">
                      MT5 API Keys <ArrowRight className="w-3 h-3" />
                    </button>
                  </Link>
                  <Link href="/weekly-strategy">
                    <button className="flex items-center gap-1 text-[10px] bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg px-2.5 py-1.5 transition-colors">
                      TradeLocker Connect <ArrowRight className="w-3 h-3" />
                    </button>
                  </Link>
                </div>
              </div>

              {/* MT5 tokens list */}
              {mt5Tokens.length > 0 && (
                <div className="space-y-1.5">
                  {mt5Tokens.map((t: any) => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        <span className="text-xs text-white font-medium">{t.name}</span>
                        <span className="text-[10px] text-gray-500 font-mono">{t.token}</span>
                      </div>
                      <span className="text-[10px] text-gray-500">{t.signalCount ?? 0} signals sent</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Auto-forward toggle */}
              <div className="flex items-center justify-between rounded-lg px-3 py-2.5" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div>
                  <p className="text-xs text-white font-medium">Auto-forward signals to MT5</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Each session signal fires immediately to your connected EA</p>
                </div>
                <button
                  onClick={() => {
                    const next = !autoForwardMt5;
                    setAutoForwardMt5(next);
                    try { localStorage.setItem('micro_auto_forward_mt5', String(next)); } catch {}
                  }}
                  disabled={mt5Tokens.length === 0}
                  className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ${autoForwardMt5 && mt5Tokens.length > 0 ? 'bg-cyan-500' : 'bg-gray-700'} ${mt5Tokens.length === 0 ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow ${autoForwardMt5 && mt5Tokens.length > 0 ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
            </CardContent>
          </Card>

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

          {/* ── Doubling Challenge — simple compounding milestones. Same risk
              per trade as the tier table above; this only tracks progress
              toward the next 2x balance checkpoint. ── */}
          {doubling && (
            <Card style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.25)' }}>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm font-semibold text-white">Doubling Challenge</span>
                  </div>
                  <Badge style={{ background: 'rgba(234,179,8,0.15)', color: '#eab308', border: '1px solid rgba(234,179,8,0.3)' }}>
                    {doubling.doublingsCompleted}x doubled
                  </Badge>
                </div>
                <p className="text-xs text-gray-400 mb-3">
                  Started at ${doubling.startingBalance.toFixed(2)} — risk per trade never changes, this just tracks progress toward the next 2x checkpoint.
                </p>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>${doubling.currentMilestoneBase.toFixed(2)}</span>
                  <span className="text-yellow-400">Target: ${doubling.targetBalance.toFixed(2)}</span>
                </div>
                <Progress value={doubling.progressPct} className="h-2" style={{ '--progress-color': '#eab308' } as any} />
                <p className="text-xs text-gray-500 mt-1">{doubling.progressPct}% of the way to doubling #{doubling.doublingsCompleted + 1}</p>
              </CardContent>
            </Card>
          )}

          {/* ── Stats Bar ── */}
          {status && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: DollarSign, label: "Today's P&L", value: fmtPnl(status.todayPnl), color: status.todayPnl >= 0 ? '#22c55e' : '#ef4444' },
                { icon: BarChart3,  label: 'Total P&L',   value: fmtPnl(status.totalPnl), color: status.totalPnl >= 0 ? '#22c55e' : '#ef4444' },
                { icon: Activity,   label: 'Sessions',    value: String(status.sessionCount), color: '#8b5cf6' },
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

          {/* ── Volume Profile Context Card ── */}
          <Card style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-purple-400" />
                Volume Profile — Market Context
                {vpAvailableCount > 0
                  ? <Badge className="ml-auto text-[10px]" style={{ background: 'rgba(139,92,246,0.2)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.35)' }}>{vpAvailableCount}/{selectedPairs.length} live</Badge>
                  : <span className="ml-auto text-[10px] text-gray-600">No MT5 data yet — start MT5 EA to populate</span>
                }
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Order type legend */}
              <div className="flex flex-wrap gap-2 mb-3">
                {Object.entries(ORDER_TYPE_META).map(([key, meta]) => (
                  <div key={key} className="flex items-center gap-1.5 rounded-md px-2 py-1" style={{ background: meta.bg, border: `1px solid ${meta.color}33` }}>
                    <span className="text-[10px]">{meta.emoji}</span>
                    <span className="text-[10px] font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-[9px] text-gray-500 hidden sm:block">— {meta.desc}</span>
                  </div>
                ))}
              </div>

              {/* Per-pair VP rows */}
              {selectedPairs.map(sym => {
                const vp = vpSignals[sym];
                if (!vp?.available) {
                  return (
                    <div key={sym} className="flex items-center justify-between rounded-lg px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="text-xs text-white font-semibold w-20">{sym}</span>
                      <span className="text-[10px] text-gray-600">No data — MT5 EA not sending chart data for this pair</span>
                    </div>
                  );
                }
                const meta = ORDER_TYPE_META[vp.orderType ?? 'market'];
                return (
                  <div key={sym} className="rounded-lg px-3 py-2.5 space-y-2" style={{ background: meta.bg, border: `1px solid ${meta.color}33` }}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white w-20">{sym}</span>
                        <span className="text-[10px]">{meta.emoji}</span>
                        <span className="text-[10px] font-bold" style={{ color: meta.color }}>{meta.label}</span>
                        {vp.direction && (
                          <span className={`text-[10px] font-bold ${vp.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>
                            {vp.direction === 'BUY' ? '↑ BUY' : '↓ SELL'}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] text-gray-500">{vp.timeframe}</span>
                        {vp.pocStrength !== undefined && (
                          <span className="text-[9px] text-purple-400">{vp.pocStrength.toFixed(1)}% at POC</span>
                        )}
                      </div>
                    </div>
                    {/* POC / VAH / VAL bar */}
                    <div className="grid grid-cols-4 gap-1.5 text-center">
                      {[
                        { label: 'Price', val: fmtPrice(vp.currentPrice!, sym), color: '#fff' },
                        { label: 'POC',   val: fmtPrice(vp.poc!,   sym), color: '#a855f7' },
                        { label: 'VAH',   val: fmtPrice(vp.vah!,   sym), color: '#22c55e' },
                        { label: 'VAL',   val: fmtPrice(vp.val!,   sym), color: '#ef4444' },
                      ].map(cell => (
                        <div key={cell.label} className="rounded p-1.5" style={{ background: 'rgba(0,0,0,0.25)' }}>
                          <p className="text-[9px] text-gray-500 uppercase mb-0.5">{cell.label}</p>
                          <p className="text-[11px] font-bold font-mono" style={{ color: cell.color }}>{cell.val}</p>
                        </div>
                      ))}
                    </div>
                    {vp.entryNote && (
                      <p className="text-[10px] text-gray-400 pl-0.5">{vp.entryNote}</p>
                    )}
                    {/* SS AI Engine bias — real signal from the running SS Engine scan, not a copy */}
                    {vp.ssEngineBias && (
                      <div className="flex items-center gap-1.5 pl-0.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold" style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>
                          🧠 SS Engine: {vp.ssEngineBias.trend === 'up' ? '↑ bullish' : vp.ssEngineBias.trend === 'down' ? '↓ bearish' : '— flat'} · RSI {vp.ssEngineBias.rsi?.toFixed(0)}
                        </span>
                        {vp.direction && vp.ssEngineBias.direction && (
                          <span className={`text-[9px] font-bold ${vp.ssEngineBias.agrees ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {vp.ssEngineBias.agrees ? '✓ confirms VP signal' : '⚠ diverges from VP signal'}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>

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

              {!activeSessionId && (
                <>
                  <div>
                    <label className="text-xs text-gray-400 mb-1.5 block">Account Balance ($)</label>
                    <Input
                      type="number" min={1}
                      value={balanceInput}
                      onChange={e => handleBalanceChange(e.target.value)}
                      className="bg-gray-900 border-gray-700 text-white"
                      placeholder="25"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs text-gray-400 block">Pairs to Trade (max {MAX_SESSION_PAIRS})</label>
                      {isWeekend && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/25">🌙 Weekend — FX closed, crypto only</span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {FX_PAIRS.map(pair => (
                        <button
                          key={pair}
                          onClick={() => !isWeekend && togglePair(pair)}
                          disabled={isWeekend}
                          title={isWeekend ? 'FX market closed on weekends' : undefined}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all disabled:cursor-not-allowed"
                          style={{
                            background: selectedPairs.includes(pair) ? 'rgba(139,92,246,0.25)' : 'rgba(255,255,255,0.05)',
                            border: selectedPairs.includes(pair) ? '1px solid rgba(139,92,246,0.6)' : '1px solid rgba(255,255,255,0.1)',
                            color: isWeekend ? '#4b5563' : selectedPairs.includes(pair) ? '#c4b5fd' : '#9ca3af',
                            opacity: isWeekend ? 0.5 : 1,
                          }}
                        >
                          {pair}
                        </button>
                      ))}
                      <div className="w-px self-stretch mx-1" style={{ background: 'rgba(255,255,255,0.1)' }} />
                      {CRYPTO_PAIRS.map(pair => (
                        <button
                          key={pair}
                          onClick={() => togglePair(pair)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                          style={{
                            background: selectedPairs.includes(pair) ? 'rgba(245,158,11,0.22)' : 'rgba(255,255,255,0.05)',
                            border: selectedPairs.includes(pair) ? '1px solid rgba(245,158,11,0.6)' : '1px solid rgba(255,255,255,0.1)',
                            color: selectedPairs.includes(pair) ? '#fbbf24' : '#9ca3af',
                          }}
                        >
                          ◎ {pair}
                        </button>
                      ))}
                    </div>
                  </div>

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
                  <div className="flex items-center justify-between rounded-xl p-4" style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-green-400" />
                      <span className="text-xs text-gray-400">{status.sessionDuration}-min session</span>
                    </div>
                    <span className="text-2xl font-mono font-bold text-green-400">{formatMs(timeLeftMs)}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400">Trades this session</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white">{tradesThisSession}</span>
                      <span className="text-gray-600">/</span>
                      <span className="text-gray-400">{status.maxTrades}</span>
                      <Button
                        variant="ghost" size="sm"
                        onClick={() => { setTradesThisSession(t => Math.min(t + 1, status.maxTrades)); addActivity('pip', `Trade #${tradesThisSession + 1} executed`); }}
                        className="h-6 w-6 p-0 text-green-400 hover:text-green-300"
                      >
                        <Plus className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-400 flex items-center gap-1">
                      <Target className="w-3.5 h-3.5" />Target per trade
                    </span>
                    <span className="text-sm font-semibold text-cyan-400">{status.pipTarget} pips</span>
                  </div>

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
                    disabled={startMutation.isPending || !engineEnabled}
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
                      <ChevronUp className="w-4 h-4 mr-1" />+1 Pip
                    </Button>
                    <Button onClick={handleStopSession} variant="destructive" className="flex-1 h-11">
                      <Square className="w-4 h-4 mr-2" />Stop Session
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
                {activity.map((entry, i) => {
                  const otMeta = entry.orderType ? ORDER_TYPE_META[entry.orderType] : null;
                  return (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-gray-600 flex-shrink-0 font-mono">{entry.time}</span>
                      <div className="flex-1 flex flex-wrap items-center gap-1.5">
                        {otMeta && (
                          <span
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ background: otMeta.bg, color: otMeta.color, border: `1px solid ${otMeta.color}44` }}
                          >
                            {otMeta.emoji} {otMeta.label}
                          </span>
                        )}
                        <span className={
                          entry.type === 'start' ? 'text-green-400' :
                          entry.type === 'signal' ? 'text-yellow-300' :
                          entry.type === 'pip' ? 'text-cyan-400' : 'text-gray-400'
                        }>
                          {entry.type === 'start' ? '▶' : entry.type === 'signal' ? '⚡' : entry.type === 'pip' ? '●' : '·'} {entry.message}
                        </span>
                        {/* Manual dispatch button for signals */}
                        {entry.type === 'signal' && entry.pair && entry.direction && autoForwardMt5 === false && mt5Tokens.length > 0 && (
                          <button
                            onClick={() => dispatchSignalMutation.mutate({
                              symbol: entry.pair,
                              direction: entry.direction,
                              orderType: entry.orderType ?? 'market',
                              lotSize: status?.lotSize,
                              slPips: status?.slPips,
                            })}
                            className="text-[9px] px-1.5 py-0.5 rounded border transition-colors"
                            style={{ borderColor: 'rgba(6,182,212,0.4)', color: '#67e8f9', background: 'rgba(6,182,212,0.08)' }}
                          >
                            → MT5
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                Account Growth
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

        </div>{/* end engine content wrapper */}
      </div>

      {/* ── Result Modal ── */}
      <Dialog open={showResultModal} onOpenChange={open => { if (!open && !logMutation.isPending) setShowResultModal(false); }}>
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
              <Input type="number" value={resultPips} onChange={e => setResultPips(e.target.value)} className="bg-gray-800 border-gray-700 text-white" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Trades Taken</label>
              <Input type="number" value={resultTrades} onChange={e => setResultTrades(e.target.value)} className="bg-gray-800 border-gray-700 text-white" placeholder="0" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Net P&L ($)</label>
              <Input type="number" step="0.01" value={resultPnl} onChange={e => setResultPnl(e.target.value)} className="bg-gray-800 border-gray-700 text-white" placeholder="0.00" />
            </div>
            <Button onClick={handleSubmitResult} disabled={logMutation.isPending} className="w-full bg-green-600 hover:bg-green-700">
              {logMutation.isPending ? 'Saving…' : 'Save Session'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
