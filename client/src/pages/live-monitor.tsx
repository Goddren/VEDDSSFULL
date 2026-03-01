import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Brain,
  Radio,
  Circle,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronRight,
  Target,
  Shield,
  ArrowUpRight,
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';
import { formatDistanceToNow } from 'date-fns';
import { useState, useEffect } from 'react';

interface SolStatus {
  running: boolean;
  activityFeed: Array<{ type: string; message: string; timestamp: string }>;
  weeklyGoal?: { currentSol: number; targetSol: number; progressPct: number };
  lastScanAt?: string;
  activeStrategy?: string;
  activeStrategies?: string[];
  lastAgentConsensus?: { recommendation: string; confidence: number; reasoning: string } | null;
  currentPortfolioValue?: number;
}

interface SolPositions {
  paperPositions: Array<{ symbol: string; gainPct: number; status: string; mode: string; entryPrice: number; currentPrice: number }>;
  livePositions: Array<{ symbol: string; gainPct: number; status: string; mode: string; entryPrice: number; currentPrice: number }>;
  autoTradeEnabled: boolean;
  liveTradeEnabled: boolean;
  autoTradeStats: { totalTrades: number; wins: number; losses: number; totalPnlPct: number };
}

interface EaActivity {
  activity: Array<{ type: string; message: string; timestamp: string; symbol?: string; direction?: string; pnl?: number }>;
}

interface EaStatus {
  status?: string;
  running?: boolean;
  phase?: string;
  weeklyProgress?: { currentProfit: number; targetProfit: number; progressPct: number };
  openTrades?: number;
  currentBalance?: number;
  todayPnl?: number;
  activePairs?: string[];
  strategy?: string;
}

const POLL_INTERVAL = 5000;

function PulsingDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />}
      <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${active ? 'bg-emerald-500' : 'bg-gray-600'}`} />
    </span>
  );
}

function ActivityRow({ entry }: { entry: { type: string; message: string; timestamp: string } }) {
  const color =
    entry.type === 'signal' || entry.type === 'live_signal' ? 'text-emerald-400' :
    entry.type === 'paper_buy' || entry.type === 'live_buy' ? 'text-blue-400' :
    entry.type === 'paper_sell' || entry.type === 'live_sell' ? 'text-rose-400' :
    entry.type === 'shield' ? 'text-amber-400' :
    entry.type === 'goal' ? 'text-purple-400' :
    entry.type === 'trigger' ? 'text-cyan-400' :
    'text-gray-400';

  return (
    <div className="flex gap-2 py-1.5 border-b border-gray-800/40 last:border-0">
      <span className={`text-[10px] leading-4 shrink-0 mt-0.5 ${color}`}>▸</span>
      <span className="text-[11px] text-gray-300 leading-4 flex-1">{entry.message}</span>
      <span className="text-[9px] text-gray-600 shrink-0 mt-0.5">
        {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true }).replace('about ', '').replace(' ago', '')}
      </span>
    </div>
  );
}

function PositionRow({ pos }: { pos: { symbol: string; gainPct?: number; status: string; mode: string; entryPrice?: number; currentPrice?: number } }) {
  const gain = pos.gainPct ?? 0;
  const isPos = gain >= 0;
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-800/40 last:border-0">
      <div className="flex items-center gap-2">
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${pos.mode === 'live' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
        <span className="text-[11px] font-mono text-gray-200">{pos.symbol}</span>
        <span className={`text-[9px] px-1 rounded ${pos.mode === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'}`}>
          {pos.mode}
        </span>
      </div>
      <span className={`text-[11px] font-bold ${isPos ? 'text-emerald-400' : 'text-red-400'}`}>
        {isPos ? '+' : ''}{gain.toFixed(2)}%
      </span>
    </div>
  );
}

export default function LiveMonitorPage() {
  const { user } = useAuth();
  const [lastRefresh, setLastRefresh] = useState(new Date());

  const { data: solStatus } = useQuery<SolStatus>({
    queryKey: ['/api/sol-engine/status'],
    refetchInterval: POLL_INTERVAL,
    enabled: !!user,
  });

  const { data: solPositions } = useQuery<SolPositions>({
    queryKey: ['/api/sol-engine/auto-positions'],
    refetchInterval: POLL_INTERVAL,
    enabled: !!user,
  });

  const { data: eaStatus } = useQuery<EaStatus>({
    queryKey: ['/api/vedd-live-engine/status'],
    refetchInterval: POLL_INTERVAL,
    enabled: !!user,
  });

  const { data: eaActivity } = useQuery<EaActivity>({
    queryKey: ['/api/vedd-live-engine/activity'],
    refetchInterval: POLL_INTERVAL,
    enabled: !!user,
  });

  useEffect(() => {
    const interval = setInterval(() => setLastRefresh(new Date()), POLL_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  const solRunning = solStatus?.running ?? false;
  const eaRunning = eaStatus?.running ?? (eaStatus?.status === 'running');

  const openSolPositions = [
    ...(solPositions?.paperPositions?.filter(p => p.status === 'open') ?? []),
    ...(solPositions?.livePositions?.filter(p => p.status === 'open') ?? []),
  ];

  const solActivity = solStatus?.activityFeed?.slice(0, 8) ?? [];
  const eaActivityFeed = eaActivity?.activity?.slice(0, 8) ?? [];
  const solStats = solPositions?.autoTradeStats;
  const solWinRate = solStats && solStats.totalTrades > 0
    ? Math.round((solStats.wins / solStats.totalTrades) * 100) : 0;

  const anyOnline = solRunning || eaRunning;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* Header bar */}
      <div className="sticky top-0 z-20 bg-gray-950/95 backdrop-blur border-b border-gray-800 px-3 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className={`w-4 h-4 ${anyOnline ? 'text-emerald-400' : 'text-gray-600'}`} />
            <span className="text-sm font-bold text-white">VEDD Live Monitor</span>
          </div>
          <div className="flex items-center gap-2">
            {anyOnline
              ? <span className="flex items-center gap-1 text-[10px] text-emerald-400"><Wifi className="w-3 h-3" /> Live</span>
              : <span className="flex items-center gap-1 text-[10px] text-gray-500"><WifiOff className="w-3 h-3" /> Offline</span>
            }
            <span className="text-[9px] text-gray-600">
              {formatDistanceToNow(lastRefresh, { addSuffix: true })}
            </span>
          </div>
        </div>
      </div>

      <div className="flex-1 px-3 py-3 space-y-3 max-w-lg mx-auto w-full">

        {/* Engine Status Chips */}
        <div className="grid grid-cols-2 gap-2">
          {/* Sol Engine */}
          <div className={`rounded-xl border px-3 py-2.5 ${solRunning ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-gray-800 bg-gray-900/50'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <PulsingDot active={solRunning} />
              <span className="text-[11px] font-bold text-gray-200">Sol Engine</span>
            </div>
            <p className={`text-[10px] ${solRunning ? 'text-emerald-400' : 'text-gray-600'}`}>
              {solRunning ? `▸ ${solStatus?.activeStrategy?.replace(/_/g, ' ') || 'scanning'}` : 'stopped'}
            </p>
            {solRunning && solStatus?.lastScanAt && (
              <p className="text-[9px] text-gray-600 mt-0.5">
                scanned {formatDistanceToNow(new Date(solStatus.lastScanAt), { addSuffix: true }).replace('about ', '')}
              </p>
            )}
          </div>

          {/* EA Engine */}
          <div className={`rounded-xl border px-3 py-2.5 ${eaRunning ? 'border-blue-500/30 bg-blue-500/5' : 'border-gray-800 bg-gray-900/50'}`}>
            <div className="flex items-center gap-1.5 mb-1">
              <PulsingDot active={eaRunning} />
              <span className="text-[11px] font-bold text-gray-200">EA Engine</span>
            </div>
            <p className={`text-[10px] ${eaRunning ? 'text-blue-400' : 'text-gray-600'}`}>
              {eaRunning ? `▸ ${eaStatus?.phase || eaStatus?.strategy || 'running'}` : 'stopped'}
            </p>
            {eaRunning && eaStatus?.openTrades !== undefined && (
              <p className="text-[9px] text-gray-600 mt-0.5">{eaStatus.openTrades} open trade{eaStatus.openTrades !== 1 ? 's' : ''}</p>
            )}
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-4 gap-1.5">
          {[
            {
              label: 'Sol Trades',
              value: solStats?.totalTrades ?? 0,
              color: 'text-white',
            },
            {
              label: 'Win Rate',
              value: `${solWinRate}%`,
              color: solWinRate >= 60 ? 'text-emerald-400' : solWinRate >= 40 ? 'text-yellow-400' : 'text-red-400',
            },
            {
              label: 'Total P&L',
              value: solStats ? `${solStats.totalPnlPct >= 0 ? '+' : ''}${solStats.totalPnlPct.toFixed(1)}%` : '—',
              color: (solStats?.totalPnlPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400',
            },
            {
              label: 'Open',
              value: openSolPositions.length,
              color: openSolPositions.length > 0 ? 'text-blue-400' : 'text-gray-500',
            },
          ].map(s => (
            <div key={s.label} className="rounded-lg bg-gray-900 border border-gray-800 p-2 text-center">
              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
              <p className="text-[9px] text-gray-600 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Sol Weekly Goal */}
        {solStatus?.weeklyGoal && solStatus.weeklyGoal.targetSol > 0 && (
          <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Target className="w-3 h-3 text-purple-400" />
                <span className="text-[11px] font-semibold text-purple-300">Weekly Sol Goal</span>
              </div>
              <span className="text-[11px] font-bold text-purple-400">
                {solStatus.weeklyGoal.currentSol.toFixed(3)} / {solStatus.weeklyGoal.targetSol} SOL
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-purple-500 to-violet-400 transition-all"
                style={{ width: `${Math.min(100, solStatus.weeklyGoal.progressPct)}%` }}
              />
            </div>
            <p className="text-[9px] text-purple-500/70 mt-1">{(solStatus.weeklyGoal.progressPct ?? 0).toFixed(1)}% complete</p>
          </div>
        )}

        {/* EA Weekly Goal */}
        {eaStatus?.weeklyProgress && eaStatus.weeklyProgress.targetProfit > 0 && (
          <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2.5">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Target className="w-3 h-3 text-blue-400" />
                <span className="text-[11px] font-semibold text-blue-300">Weekly EA Goal</span>
              </div>
              <span className="text-[11px] font-bold text-blue-400">
                ${eaStatus.weeklyProgress.currentProfit.toFixed(2)} / ${eaStatus.weeklyProgress.targetProfit}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all"
                style={{ width: `${Math.min(100, eaStatus.weeklyProgress.progressPct)}%` }}
              />
            </div>
            <div className="flex justify-between mt-1">
              <p className="text-[9px] text-blue-500/70">{(eaStatus.weeklyProgress.progressPct ?? 0).toFixed(1)}% complete</p>
              {eaStatus.phase && <p className="text-[9px] text-blue-500/70 capitalize">{eaStatus.phase.replace(/_/g, ' ')}</p>}
            </div>
          </div>
        )}

        {/* AI Consensus (Sol) */}
        {solStatus?.lastAgentConsensus && (
          <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5">
            <div className="flex items-center gap-1.5 mb-1.5">
              <Brain className="w-3 h-3 text-cyan-400" />
              <span className="text-[11px] font-semibold text-cyan-300">Sol AI Consensus</span>
              <span className={`ml-auto text-[10px] font-bold px-1.5 rounded ${
                solStatus.lastAgentConsensus.recommendation === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' :
                solStatus.lastAgentConsensus.recommendation === 'SELL' ? 'bg-red-500/20 text-red-400' :
                'bg-gray-700/50 text-gray-400'
              }`}>
                {solStatus.lastAgentConsensus.recommendation} {solStatus.lastAgentConsensus.confidence}%
              </span>
            </div>
            {solStatus.lastAgentConsensus.reasoning && (
              <p className="text-[10px] text-gray-400 leading-relaxed">{solStatus.lastAgentConsensus.reasoning.slice(0, 100)}{solStatus.lastAgentConsensus.reasoning.length > 100 ? '...' : ''}</p>
            )}
          </div>
        )}

        {/* Open Positions */}
        {openSolPositions.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/70">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800">
              <Activity className="w-3 h-3 text-gray-400" />
              <span className="text-[11px] font-semibold text-gray-300">Open Positions ({openSolPositions.length})</span>
            </div>
            <div className="px-3 py-1">
              {openSolPositions.map((pos, i) => (
                <PositionRow key={i} pos={pos} />
              ))}
            </div>
          </div>
        )}

        {/* Sol Engine Activity Feed */}
        {solActivity.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/70">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <SiSolana className="w-3 h-3 text-emerald-400" />
                <span className="text-[11px] font-semibold text-gray-300">Sol Engine Feed</span>
              </div>
              <Link href="/solana-scanner">
                <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
                  open <ChevronRight className="w-2.5 h-2.5" />
                </span>
              </Link>
            </div>
            <div className="px-3 py-1">
              {solActivity.map((entry, i) => (
                <ActivityRow key={i} entry={entry} />
              ))}
            </div>
          </div>
        )}

        {/* EA Engine Activity Feed */}
        {eaActivityFeed.length > 0 && (
          <div className="rounded-xl border border-gray-800 bg-gray-900/70">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-800">
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-blue-400" />
                <span className="text-[11px] font-semibold text-gray-300">EA Engine Feed</span>
              </div>
              <Link href="/weekly-strategy">
                <span className="text-[9px] text-gray-600 flex items-center gap-0.5">
                  open <ChevronRight className="w-2.5 h-2.5" />
                </span>
              </Link>
            </div>
            <div className="px-3 py-1">
              {eaActivityFeed.map((entry, i) => (
                <ActivityRow key={i} entry={{ type: entry.type, message: entry.message, timestamp: entry.timestamp }} />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!solRunning && !eaRunning && solActivity.length === 0 && eaActivityFeed.length === 0 && (
          <div className="text-center py-12 space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-gray-900 border border-gray-800 flex items-center justify-center mx-auto">
              <Radio className="w-7 h-7 text-gray-700" />
            </div>
            <p className="text-sm text-gray-400 font-medium">No engines running</p>
            <p className="text-xs text-gray-600">Start the Sol Engine or EA Engine to see live updates here</p>
            <div className="flex gap-2 justify-center mt-2">
              <Link href="/solana-scanner">
                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 border border-emerald-500/30 rounded-lg px-3 py-1.5">
                  <SiSolana className="w-3 h-3" /> Sol Scanner
                </span>
              </Link>
              <Link href="/weekly-strategy">
                <span className="inline-flex items-center gap-1 text-xs text-blue-400 border border-blue-500/30 rounded-lg px-3 py-1.5">
                  <Zap className="w-3 h-3" /> EA Engine
                </span>
              </Link>
            </div>
          </div>
        )}

        {/* Add to Home Screen tip */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2.5">
          <p className="text-[10px] text-gray-500 text-center">
            📱 <span className="text-gray-400 font-medium">Add to home screen</span> — tap Share → "Add to Home Screen" in Safari / Chrome → get instant widget access
          </p>
        </div>

        {/* Quick nav */}
        <div className="grid grid-cols-2 gap-2 pb-4">
          <Link href="/solana-scanner">
            <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <SiSolana className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px] text-gray-300">Sol Scanner</span>
              </div>
              <ChevronRight className="w-3 h-3 text-gray-600" />
            </div>
          </Link>
          <Link href="/weekly-strategy">
            <div className="flex items-center justify-between rounded-xl border border-gray-800 bg-gray-900 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-blue-400" />
                <span className="text-[11px] text-gray-300">EA Engine</span>
              </div>
              <ChevronRight className="w-3 h-3 text-gray-600" />
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
