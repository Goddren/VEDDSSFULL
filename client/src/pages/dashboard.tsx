import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { BiBook } from 'react-icons/bi';
import { SiSolana } from 'react-icons/si';
import {
  BarChart2,
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Activity,
  Plus,
  ChevronRight,
  ChevronDown,
  Info,
  Sparkles,
  Trophy,
  AlertTriangle,
  Lightbulb,
  Gamepad as GamepadIcon,
  Smile,
  Zap,
  CalendarCheck,
  Users,
  Coins,
  Video,
  Shirt,
  QrCode,
  Brain,
  Bot,
  Cpu,
  Newspaper,
  Radio,
  ExternalLink,
  Power,
  EyeOff,
  Eye,
  Rocket,
  CheckSquare,
  Copy,
  Target,
  Wallet,
  PenLine,
  X,
  Award,
  GraduationCap,
  RefreshCw,
  Building2,
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import VeddLogo from '@/components/ui/vedd-logo';
import { MarketCalendar } from '@/components/market/market-calendar';
import { TradePerformanceCard, TodayReviewPanel, AiHealthStrip } from '@/components/trade-performance-card';
import { getUserLevel } from '@/lib/achievement-system';
import TradingCoach from '@/components/trading-coach/trading-coach';
import { DailyWisdom } from '@/components/scripture/daily-wisdom';
import { NewsFeed } from '@/components/news/news-feed';
import { ConnectedPairs } from '@/components/mt5/connected-pairs';
import { VeddRewardsPanel } from '@/components/vedd-rewards/vedd-rewards-panel';
import { DailyMissions } from '@/components/vedd-rewards/daily-missions';
import { AISourceBadge } from '@/components/ai/ai-source-badge';
import { AIKeyNudgeBanner } from '@/components/ai/ai-key-nudge-banner';

interface Analysis {
  id: number;
  userId: number;
  imageUrl: string;
  symbol?: string;
  timeframe?: string;
  direction?: string;
  trend?: string;
  confidence?: string;
  createdAt: string;
  isPublic?: boolean;
  shareId?: string;
  notes?: string;
}

// Section visibility helpers
function useSectionToggle(key: string, defaultOpen = true) {
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(`dash_section_${key}`);
    return saved !== null ? saved === 'true' : defaultOpen;
  });
  const toggle = () => {
    setOpen(prev => {
      localStorage.setItem(`dash_section_${key}`, String(!prev));
      return !prev;
    });
  };
  return [open, toggle] as const;
}

// Chart thumbnail with VEDD logo fallback when image fails to load
function ChartThumb({ src }: { src: string }) {
  const [broken, setBroken] = useState(false);
  return broken ? (
    <div className="h-full w-full flex items-center justify-center p-1">
      <VeddLogo height={32} className="opacity-30 object-contain" />
    </div>
  ) : (
    <img
      src={src}
      alt="Chart"
      className="h-full w-full object-cover"
      onError={() => setBroken(true)}
    />
  );
}

// ── Silent record-submission helper — fires once when today's PnL beats stored record ──
function _SubmitRecord({ value, currentRecord }: { value: number; currentRecord: number | null }) {
  useEffect(() => {
    if (currentRecord !== null && value <= currentRecord) return;
    fetch('/api/all-time-record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ value, recordType: 'best_daily_pnl' }),
    }).catch(() => {});
  // Only re-fire when the value changes meaningfully
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Math.floor(value * 100)]);
  return null;
}

function SectionHeader({
  title,
  open,
  onToggle,
  icon: Icon,
  iconClass = 'icon-box-red',
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  icon?: React.ComponentType<{ className?: string }>;
  iconClass?: string;
}) {
  return (
    <button
      onClick={onToggle}
      className="flex items-center justify-between w-full mb-3 group"
    >
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={`icon-box-sm ${iconClass}`}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        )}
        <p className="section-title">{title}</p>
      </div>
      <ChevronDown
        className={`h-4 w-4 text-gray-600 transition-transform group-hover:text-gray-400 ${open ? '' : '-rotate-90'}`}
      />
    </button>
  );
}

// ── Manual Trade Dialog ──────────────────────────────────────────────────────
function ManualTradeDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState('BUY');
  const [result, setResult] = useState('WIN');
  const [profitLoss, setProfitLoss] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!symbol.trim()) { setError('Symbol is required'); return; }
    const pl = parseFloat(profitLoss);
    if (isNaN(pl)) { setError('Enter a valid profit/loss amount'); return; }
    setSaving(true); setError('');
    try {
      // entryPrice is optional for manual — use 0 as placeholder
      await apiRequest('POST', '/api/mt5/manual-trade', {
        symbol: symbol.trim().toUpperCase(),
        direction,
        entryPrice: 0,
        profitLoss: result === 'LOSS' ? -Math.abs(pl) : result === 'WIN' ? Math.abs(pl) : 0,
        result,
        notes,
        closedAt: new Date().toISOString(),
      });
      setSymbol(''); setDirection('BUY'); setResult('WIN'); setProfitLoss(''); setNotes('');
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to save trade');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-[#0f0f0f] border border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <PenLine className="h-4 w-4 text-amber-400" /> Log Manual Trade
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Pair / Symbol</label>
            <Input
              value={symbol}
              onChange={e => setSymbol(e.target.value.toUpperCase())}
              placeholder="e.g. EURUSD, XAUUSD, US30"
              className="bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-600 h-9 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">Direction</label>
              <Select value={direction} onValueChange={setDirection}>
                <SelectTrigger className="bg-[#1a1a1a] border-white/10 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BUY">BUY</SelectItem>
                  <SelectItem value="SELL">SELL</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[11px] text-gray-400 mb-1 block">Result</label>
              <Select value={result} onValueChange={setResult}>
                <SelectTrigger className="bg-[#1a1a1a] border-white/10 h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WIN">WIN</SelectItem>
                  <SelectItem value="LOSS">LOSS</SelectItem>
                  <SelectItem value="BREAKEVEN">BREAKEVEN</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Profit / Loss ($)</label>
            <Input
              type="number"
              value={profitLoss}
              onChange={e => setProfitLoss(e.target.value)}
              placeholder="e.g. 45.50"
              className="bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-600 h-9 text-sm"
            />
          </div>
          <div>
            <label className="text-[11px] text-gray-400 mb-1 block">Notes (optional)</label>
            <Input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g. Manual scalp on NFP"
              className="bg-[#1a1a1a] border-white/10 text-white placeholder:text-gray-600 h-9 text-sm"
            />
          </div>
          {error && <p className="text-red-400 text-[11px]">{error}</p>}
          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose} className="flex-1 border-white/10 text-gray-400 h-9">
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
              className="flex-1 h-9 bg-gradient-to-r from-red-600 to-purple-600 text-white border-0 font-semibold"
            >
              {saving ? 'Saving...' : 'Save Trade'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [showFaithContent, setShowFaithContent] = useState<boolean>(true);

  const [showManualTradeDialog, setShowManualTradeDialog] = useState(false);
  const [showFeaturesHub, setShowFeaturesHub] = useState(false);

  // Section toggles — persisted in localStorage
  const [showStats, toggleStats] = useSectionToggle('stats');
  const [showAICenter, toggleAICenter] = useSectionToggle('ai_center');
  const [showTradingTools, toggleTradingTools] = useSectionToggle('trading_tools');
  const [showAIData, toggleAIData] = useSectionToggle('ai_data');
  const [showCommunity, toggleCommunity] = useSectionToggle('community');
  const [showFinance, toggleFinance] = useSectionToggle('finance');
  const [showEvents, toggleEvents] = useSectionToggle('events');
  const [showRewards, toggleRewards] = useSectionToggle('rewards');
  const [showCerts, toggleCerts] = useSectionToggle('certs');
  const [showMarket, toggleMarket] = useSectionToggle('market');
  const [showCoach, toggleCoach] = useSectionToggle('coach');

  // Ambassador to-do checkboxes — persisted to localStorage, auto-clear at midnight
  const [ambassadorTodos, setAmbassadorTodos] = useState<{ post: boolean; dm: boolean; comment: boolean }>(() => {
    try {
      const saved = localStorage.getItem('ambassador_todos');
      if (!saved) return { post: false, dm: false, comment: false };
      const { date, todos } = JSON.parse(saved);
      if (date !== new Date().toISOString().slice(0, 10)) return { post: false, dm: false, comment: false };
      return todos;
    } catch { return { post: false, dm: false, comment: false }; }
  });
  const toggleAmbassadorTodo = (key: 'post' | 'dm' | 'comment') => {
    setAmbassadorTodos(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try { localStorage.setItem('ambassador_todos', JSON.stringify({ date: new Date().toISOString().slice(0, 10), todos: next })); } catch {}
      return next;
    });
  };

  // Initialize faith content preference from localStorage
  useEffect(() => {
    const savedPreference = localStorage.getItem('faithBasedContent');
    if (savedPreference !== null) {
      setShowFaithContent(savedPreference === 'true');
    }
  }, []);

  // Save faith content preference to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('faithBasedContent', String(showFaithContent));
  }, [showFaithContent]);
  
  const [quickStatsUpdatedAt, setQuickStatsUpdatedAt] = useState<Date>(new Date());

  const { data: analyses = [], isLoading, isError } = useQuery<Analysis[]>({
    queryKey: ['/api/analyses'],
    refetchInterval: 90000,   // refresh quick stats every 90s
    onSuccess: () => setQuickStatsUpdatedAt(new Date()),
  });

  // All-time record (best daily PnL) — only updates when new value exceeds stored
  const { data: allTimeRecord } = useQuery<{ value: number | null; achievedAt: string | null }>({
    queryKey: ['/api/all-time-record', 'best_daily_pnl'],
    queryFn: () => fetch('/api/all-time-record?type=best_daily_pnl', { credentials: 'include' }).then(r => r.json()),
    enabled: !!user,
    refetchInterval: 90000,
  });

  // Get user achievements
  const { data: userAchievements = [] } = useQuery({
    queryKey: ['/api/user-achievements'],
    enabled: !!user,
    refetchInterval: 300000,   // refresh every 5 min — achievements rarely change
  });

  // Get all achievements
  const { data: achievements = [] } = useQuery({
    queryKey: ['/api/achievements'],
    enabled: !!user,
    refetchInterval: 300000,
  });

  // Get user profile for accuracy/winRate data
  const { data: userProfile } = useQuery<{ winRate?: number; tradeGrade?: number }>({
    queryKey: ['/api/profile', user?.id],
    enabled: !!user?.id,
    refetchInterval: 90000,   // refresh every 90s with quick stats
  });

  // Get user's registered events
  const { data: registeredEventsData } = useQuery<{ events: Array<{ event: { id: number; title: string; description: string; scheduledDate: string | null; status: string } }> }>({
    queryKey: ['/api/ambassador/community/my-events'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // Get host stats if user is a host
  const { data: hostStats } = useQuery<{ totalEventsHosted: number; upcomingEvents: number; hostTier: string; tokensEarned: number }>({
    queryKey: ['/api/ambassador/host/stats'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // Get events user is hosting
  const { data: hostedEventsData } = useQuery<Array<{ id: number; title: string; description: string; scheduledDate: string | null; status: string; attendeeCount?: number }>>({
    queryKey: ['/api/ambassador/host/my-events'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: wearStats } = useQuery<{ totalClaims: number; totalVeddEarned: number; pendingClaims: number }>({
    queryKey: ['/api/wear-to-earn/stats'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // Workforce Academy certificates
  const { data: certData } = useQuery<{ certificates: Array<{ certId: string; title: string; score: number; date: string; courseId: number; ceuHours?: number; grantFrameworks?: string[] }> }>({
    queryKey: ['/api/workforce/certificates'],
    enabled: !!user,
    refetchInterval: 300000,   // refresh every 5 min — certs rarely change
  });
  const dashCerts = certData?.certificates ?? [];

  // AI engine status queries
  const { data: ssEngineStatus } = useQuery<{ status: string; running?: boolean }>({
    queryKey: ['/api/vedd-live-engine/status'],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: solEngineStatus } = useQuery<{
    running: boolean; autoTradeMode: string; autoTradeEnabled: boolean; liveTradeEnabled: boolean;
    weeklyGoal?: { currentProfitSol: number; targetSol: number; phase: string; winStreak: number };
    paperPortfolioValue?: number; paperBaseCapital?: number; currentPortfolioValue?: number;
  }>({
    queryKey: ['/api/sol-engine/status'],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: solAutoPositions } = useQuery<{
    autoTradeStats: { totalTrades: number; wins: number; losses: number; totalPnlPct: number; bestTradePct: number; worstTradePct: number };
    livePositions: Array<{ symbol: string; status: string; strategyId: string }>;
    paperPositions: Array<{ symbol: string; status: string }>;
  }>({
    queryKey: ['/api/sol-engine/auto-positions'],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: solWalletStatus } = useQuery<{
    hasServerWallet: boolean; walletAddress?: string; balanceSol?: number;
  }>({
    queryKey: ['/api/sol-engine/server-wallet-status'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: brainStatus } = useQuery<{ learned: boolean; totalTradesAnalyzed?: number; pairsLearned?: number; lastLearned?: string }>({
    queryKey: ['/api/vedd-live-engine/brain-status'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Decision feed — live 8s refresh
  const { data: decisionFeed } = useQuery<any>({
    queryKey: ['/api/mt5/decision-feed'],
    refetchInterval: 8000,
    staleTime: 0,
    enabled: !!user,
  });

  // Weekly guidance — brain-powered goal acceleration + week issues
  const { data: weeklyGuidance } = useQuery<any>({
    queryKey: ['/api/vedd-brain/weekly-guidance'],
    refetchInterval: 60000,
    staleTime: 0,
    enabled: !!user,
  });

  const { data: breakoutStatus } = useQuery<{ active: boolean; monitored?: number }>({
    queryKey: ['/api/mt5/breakout-status'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  const { data: polyEngineStatus, refetch: refetchPoly } = useQuery<{ isRunning: boolean; isPaperMode?: boolean; totalRealizedPnl?: number; openPositions?: any[]; closedPositions?: any[] }>({
    queryKey: ['/api/polymarket-engine/status'],
    enabled: !!user,
    refetchInterval: 20000,
  });

  const { data: kalshiEngineStatus, refetch: refetchKalshi } = useQuery<{ isRunning: boolean; isPaperMode?: boolean; totalRealizedPnl?: number; openTrades?: any[]; closedTrades?: any[] }>({
    queryKey: ['/api/kalshi/engine/status'],
    enabled: !!user,
    refetchInterval: 20000,
  });

  // Daily devotional — Bible verse + trading tie-in
  const { data: dailyDevotional } = useQuery<{
    title: string; theme: string; scripture: string; scripture_text: string;
    reflection: string; trading_tie_in: string; affirmation: string;
  }>({
    queryKey: ['/api/devotionals/today'],
    enabled: !!user,
    staleTime: 1000 * 60 * 60, // cache 1 hr — only generates once per day
    refetchInterval: false,
  });

  // Ambassador journey — current day + today's actions (ambassadors only)
  const { data: ambassadorJourney } = useQuery<{
    currentDay: number; streak: number; tokensEarned: number; isComplete: boolean;
    todayActions?: { postIdea: string; commentTarget: string; dmScript: string; focus: string };
    nextMilestone?: { day: number; reward: string };
  }>({
    queryKey: ['/api/ambassador/journey'],
    enabled: !!(user?.isAmbassador || (user as any)?.role === 'admin'),
    refetchInterval: 120000,   // refresh every 2 min
  });

  // Streak / XP / rank data
  const { data: streakData } = useQuery<{ currentStreak: number; longestStreak: number; xpPoints: number; tier: string; tierProgress: number }>({
    queryKey: ['/api/streak'],
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });

  // Daily check-in status
  const { data: checkinStatus, refetch: refetchCheckin } = useQuery<{ claimed: boolean; nextReward: number; currentStreak: number; todayReward?: number }>({
    queryKey: ['/api/activity/daily-checkin-status'],
    enabled: !!user,
    staleTime: 60 * 1000,
  });
  const checkinMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/activity/daily-checkin').then(r => r.json()),
    onSuccess: () => { refetchCheckin(); queryClient.invalidateQueries({ queryKey: ['/api/streak'] }); },
  });

  // Daily & weekly P&L summary (works even without a strategy / SS AI)
  const { data: dailySummary } = useQuery<{
    todayClosedProfit: number; todayTotalProfit: number; todayTrades: number; todayWins: number; todayLosses: number; todayWinRate: number;
    weekClosedProfit: number; weekTrades: number; weekWins: number; weekLosses: number; weekWinRate: number;
    bestTrade: number; worstTrade: number;
    unrealizedPnL: number; openPositions: number;
    weeklyTarget: number; dailyTarget: number; weekProgressPct: number; dayProgressPct: number;
    hasStrategy: boolean;
    allTimeTrades: number; allTimeWins: number; allTimeLosses: number; allTimeBreakeven: number;
    allTimePnL: number; allTimeWinRate: number;
  }>({
    queryKey: ['/api/mt5/daily-summary'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Weekly strategy — same source the weekly plan page uses for live progress
  const { data: activeStrategy, refetch: refetchStrategy } = useQuery<{
    profitTarget: number; currentProfit: number; progressPercentage: number; hasStrategy: boolean;
    pairs?: string[]; riskLevel?: string; strategyMode?: string;
    todayClosedProfit?: number; todayTotalProfit?: number; dailyTarget?: number;
    dayProgressPct?: number; unrealizedPnL?: number; openPositions?: number;
    todayTrades?: number; todayWinRate?: number;
  }>({
    queryKey: ['/api/weekly-strategy'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Economic calendar tied to active strategy pairs (next 3 days, high-impact only)
  const strategyPairs = activeStrategy?.pairs ?? [];
  const calendarPair = strategyPairs[0] ?? 'EURUSD';
  const { data: econCalendar } = useQuery<{ events: Array<{
    id: string; title: string; date: string; time: string; impact: string;
    currency: string; country: string; forecast?: string; previous?: string;
    description?: string; affectedPairs?: string[];
  }> }>({
    queryKey: ['/api/economic-calendar', calendarPair],
    queryFn: () => fetch(`/api/economic-calendar?symbol=${calendarPair}&days=3`).then(r => r.json()),
    enabled: !!user,
    refetchInterval: 300000,
    staleTime: 240000,
  });

  // Market news for primary strategy pair
  const { data: pairNews } = useQuery<{ news: Array<{ headline: string; sentiment: string; url?: string; source?: string; datetime?: number }> }>({
    queryKey: ['/api/news/pair', calendarPair],
    queryFn: () => fetch(`/api/news/pair/${calendarPair}`).then(r => r.json()),
    enabled: !!user,
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
  });

  // Live today's profit — updated by the sync mutation below
  const [liveToday, setLiveToday] = React.useState<{
    todayClosedProfit: number; unrealizedPnL: number; dailyTarget: number;
    dayProgressPct: number; todayTrades: number; todayWinRate: number; openPositions: number;
  } | null>(null);

  // Silent update-progress call every 30s when strategy exists — keeps today's profit live
  const syncProgressMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/weekly-strategy/update-progress', { silent: true });
      return res.json();
    },
    onSuccess: (data: any) => {
      // Capture today's values from the sync response directly — no extra GET needed
      setLiveToday({
        todayClosedProfit: data.todayClosedProfit ?? 0,
        unrealizedPnL:     data.unrealizedPnL     ?? 0,
        dailyTarget:       data.dailyTarget        ?? 0,
        dayProgressPct:    data.dailyProgressClosed ?? 0,
        todayTrades:       data.todayTrades        ?? 0,
        todayWinRate:      data.todayWinRate       ?? 0,
        openPositions:     data.activeTradeCount   ?? 0,
      });
      refetchStrategy();
    },
  });

  React.useEffect(() => {
    if (!user) return;
    syncProgressMutation.mutate();
    const interval = setInterval(() => syncProgressMutation.mutate(), 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Fusebox engine toggle mutations
  const killAllMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/trading/kill-all').then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['/api/vedd-live-engine/status'] }); refetchPoly(); refetchKalshi(); },
  });
  const polyToggleMutation = useMutation({
    mutationFn: (start: boolean) => apiRequest('POST', start ? '/api/polymarket-engine/start' : '/api/polymarket-engine/stop').then(r => r.json()),
    onSuccess: () => refetchPoly(),
  });
  const kalshiToggleMutation = useMutation({
    mutationFn: (start: boolean) => apiRequest('POST', start ? '/api/kalshi/engine/start' : '/api/kalshi/engine/stop').then(r => r.json()),
    onSuccess: () => refetchKalshi(),
  });

  // Merge: prefer strategy's live progress over daily-summary recalc when available
  const weekProgressPct   = activeStrategy?.progressPercentage ?? dailySummary?.weekProgressPct ?? 0;
  const weekClosedProfit  = activeStrategy?.currentProfit      ?? dailySummary?.weekClosedProfit ?? 0;
  const weeklyTarget      = activeStrategy?.profitTarget       ?? dailySummary?.weeklyTarget     ?? 0;
  // Today's profit — prefer live sync values, then daily-summary fallback
  const todayClosedProfit = liveToday?.todayClosedProfit ?? dailySummary?.todayClosedProfit ?? 0;
  const unrealizedPnL     = liveToday?.unrealizedPnL     ?? dailySummary?.unrealizedPnL     ?? 0;
  const dayProgressPct    = liveToday?.dayProgressPct    ?? dailySummary?.dayProgressPct    ?? 0;
  const dailyTarget       = liveToday?.dailyTarget       ?? dailySummary?.dailyTarget       ?? 0;
  const todayTrades       = liveToday?.todayTrades       ?? dailySummary?.todayTrades       ?? 0;
  const todayWinRate      = liveToday?.todayWinRate      ?? dailySummary?.todayWinRate      ?? 0;
  const openPositions     = liveToday?.openPositions     ?? dailySummary?.openPositions     ?? 0;

  // MT5 account balance(s)
  const { data: mt5AccountData } = useQuery<any>({
    queryKey: ['/api/mt5/account-data'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // MT5 balance history for chart
  const { data: balanceHistory } = useQuery<{
    series: { date: string; balance: number }[];
    currentBalance: number; totalPnL: number; totalTrades: number;
  }>({
    queryKey: ['/api/mt5/balance-history'],
    enabled: !!user,
    refetchInterval: 120000,
  });

  // Markov chain probability overview — updated each engine scan cycle
  const { data: markovData } = useQuery<{ overview: any[]; count: number }>({
    queryKey: ['/api/markov/overview'],
    enabled: !!user && ssEngineStatus?.status === 'running',
    refetchInterval: 15000,
    staleTime: 0,
  });

  // Polymarket BTC sentiment — cached 5 min on server, poll every 5 min
  const { data: polymarketData } = useQuery<any>({
    queryKey: ['/api/polymarket/btc'],
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  // TradeLocker connections — all active accounts (multi-account support)
  const { data: tlConnectionsAll = [] } = useQuery<any[]>({
    queryKey: ['/api/tradelocker/connections'],
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 0,
  });
  // Legacy single alias for components that still use tlConnection
  const tlConnection = tlConnectionsAll[0] ?? null;

  // Live TradeLocker balances (kept fresh by the server background sync, like MT5)
  const { data: tlLive } = useQuery<{
    connected: boolean;
    totalBalance: number;
    totalEquity: number;
    accounts: Array<{ accountId: string; connectionId: number; accountType: string; balance: number; equity: number; currency: string; secondsAgo: number; isConnected: boolean; error?: string }>;
  }>({
    queryKey: ['/api/tradelocker/account-data'],
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 0,
  });

  // TradeLocker recent trade results
  const { data: tlTrades } = useQuery<any[]>({
    queryKey: ['/api/tradelocker/trades'],
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 0,
    select: (data) => (Array.isArray(data) ? data.slice(0, 20) : []),
  });

  // Platform Monitors — per-platform balance + daily + weekly P&L
  const { data: platformMonitors } = useQuery<{
    mt5: { balance: number; equity: number; dailyPnl: number; weeklyPnl: number; isOnline: boolean } | null;
    tradelocker: Array<{ id: number; email: string; accountId: string; accountType: string; accountName?: string; balance: number; equity: number; unrealizedPnl: number; dailyPnl: number; weeklyPnl: number; openTrades: number; error?: string }>;
    solana: { balanceSol: number; dailyPnlSol: number; weeklyPnlSol: number; weeklyTargetSol: number; openPositions: number; isRunning: boolean; autoTradeMode: string; phase: string; winStreak: number } | null;
    polymarket: { isRunning: boolean; openPositions: number; totalUnrealizedPnl: number; totalRealizedPnl: number; dailyRealizedPnl: number; weeklyRealizedPnl: number; tradesOpened: number } | null;
  }>({
    queryKey: ['/api/platform-monitors'],
    enabled: !!user,
    refetchInterval: 30000,
    staleTime: 0,
  });

  // Derive account balances for header display
  const mt5Accounts: Array<{ label: string; balance: number; equity?: number }> = React.useMemo(() => {
    if (!mt5AccountData) return [];
    if (Array.isArray(mt5AccountData?.accounts)) {
      return mt5AccountData.accounts.map((a: any, i: number) => ({
        label: a.name || a.login || `MT5 #${i + 1}`,
        balance: a.balance ?? 0,
        equity: a.equity,
      }));
    }
    if (mt5AccountData?.balance != null) {
      return [{ label: 'MT5', balance: mt5AccountData.balance, equity: mt5AccountData.equity }];
    }
    return [];
  }, [mt5AccountData]);

  const tlBalance: number | null = React.useMemo(() => {
    // Prefer live totals from the background-sync cache; fall back to stale DB value
    if (tlLive && tlLive.totalBalance > 0) return tlLive.totalBalance;
    const b = (tlConnection as any)?.accountBalance ?? (tlConnection as any)?.balance ?? null;
    return b && b > 0 ? b : null;
  }, [tlLive, tlConnection]);

  const tlEquity: number | null = React.useMemo(() => {
    if (tlLive && tlLive.totalEquity > 0) return tlLive.totalEquity;
    return (tlConnection as any)?.equity ?? null;
  }, [tlLive, tlConnection]);

  // Derive AI tool states
  const ssEngineRunning = ssEngineStatus?.status === 'running';
  const solEngineRunning = solEngineStatus?.running ?? false;
  const solAutoTradeMode = solEngineStatus?.autoTradeMode ?? 'off';
  const solLiveActive = solAutoTradeMode === 'live';
  const solPaperActive = solAutoTradeMode === 'paper';
  const brainLearned = brainStatus?.learned ?? false;
  const bothLiveActive = ssEngineRunning && solLiveActive;
  const breakoutMonitorOn = breakoutStatus?.active ?? false;

  // Filter to only upcoming and live registered events
  const upcomingEvents = React.useMemo(() => {
    if (!registeredEventsData?.events) return [];
    const now = new Date();
    return registeredEventsData.events
      .filter(reg => {
        // Always show live events
        if (reg.event.status === 'live') return true;
        if (!reg.event.scheduledDate) return false;
        const eventDate = new Date(reg.event.scheduledDate);
        return eventDate >= now && reg.event.status === 'scheduled';
      })
      .sort((a, b) => {
        // Live events first
        if (a.event.status === 'live' && b.event.status !== 'live') return -1;
        if (b.event.status === 'live' && a.event.status !== 'live') return 1;
        return 0;
      })
      .slice(0, 5);
  }, [registeredEventsData]);
  
  // Filter to only upcoming hosted events
  const upcomingHostedEvents = React.useMemo(() => {
    if (!hostedEventsData) return [];
    const now = new Date();
    return hostedEventsData
      .filter(event => {
        if (!event.scheduledDate) return false;
        const eventDate = new Date(event.scheduledDate);
        return eventDate >= now && event.status === 'scheduled';
      })
      .slice(0, 3);
  }, [hostedEventsData]);
  
  // Calculate total achievement points (for UserLevel component)
  const totalAchievementPoints = React.useMemo(() => {
    if (!userAchievements || !Array.isArray(userAchievements) || !achievements || !Array.isArray(achievements)) {
      return 0;
    }
    
    return userAchievements
      .filter((ua: any) => ua.isCompleted)
      .reduce((total: number, ua: any) => {
        const achievement = achievements.find((a: any) => a.id === ua.achievementId);
        if (achievement) {
          return total + achievement.points;
        }
        return total;
      }, 0);
  }, [userAchievements, achievements]);
  
  // Calculate stats
  const totalAnalyses = analyses.length;
  const buySignals = analyses.filter((a) => a.direction?.toLowerCase() === 'buy').length;
  const sellSignals = analyses.filter((a) => a.direction?.toLowerCase() === 'sell').length;
  
  // Calculate accuracy rate from user profile or analyses
  const accuracyRate = React.useMemo(() => {
    // First try to use winRate from user profile
    if (userProfile?.winRate && userProfile.winRate > 0) {
      return Math.round(userProfile.winRate);
    }
    // If no profile data, calculate from analyses with high confidence
    if (analyses.length === 0) return 0;
    const highConfidenceAnalyses = analyses.filter((a) => {
      const conf = a.confidence?.toLowerCase();
      return conf === 'high' || conf === 'very high' || conf === 'strong';
    });
    if (analyses.length > 0) {
      return Math.round((highConfidenceAnalyses.length / analyses.length) * 100);
    }
    return 0;
  }, [analyses, userProfile]);
  
  // Get the most recent analyses
  const recentAnalyses = analyses.slice(0, 5);
  
  // Greeting based on time of day
  const greeting = React.useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const displayName = user?.fullName?.split(' ')[0] || user?.username || 'Trader';

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  // Derived live values for motherboard
  const mt5LiveAcct   = mt5AccountData?.accounts?.[0];
  const liveBalance   = mt5LiveAcct?.connected ? (mt5LiveAcct.balance ?? 0) : (platformMonitors?.mt5?.balance ?? 0);
  const liveDailyPnl  = mt5LiveAcct?.connected ? (mt5LiveAcct.dailyPnL ?? mt5LiveAcct.profit ?? 0) : (todayClosedProfit + unrealizedPnL);
  const liveWeeklyPnl = platformMonitors?.mt5?.weeklyPnl ?? weekClosedProfit;
  const weekGoalPct   = Math.min(100, weekProgressPct);
  const dayGoalPct    = Math.min(100, dayProgressPct);
  const tlLiveAccts   = platformMonitors?.tradelocker ?? [];

  return (
    <div className="app-page">

      {/* ══════════════════════════════════════════════════════════════════
          VEDD COMMAND CENTER — gamified motherboard header
      ══════════════════════════════════════════════════════════════════ */}
      <div style={{ background: 'linear-gradient(180deg,#0b0e1a 0%,#080B14 100%)', borderBottom: '1px solid rgba(255,255,255,0.06)' }} className="px-4 md:px-6 pt-5 pb-4">
        <div className="container mx-auto">

          {/* Row 1: greeting + engine status */}
          <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-black text-white leading-tight">
                  {greeting}, {displayName}
                </h1>
                {streakData && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black border"
                    style={{
                      background: streakData.tier === 'OG' ? 'rgba(239,68,68,0.12)' : streakData.tier === 'Elite' ? 'rgba(168,85,247,0.12)' : streakData.tier === 'Pro' ? 'rgba(59,130,246,0.12)' : streakData.tier === 'Rising' ? 'rgba(234,179,8,0.12)' : 'rgba(34,197,94,0.12)',
                      borderColor: streakData.tier === 'OG' ? 'rgba(239,68,68,0.35)' : streakData.tier === 'Elite' ? 'rgba(168,85,247,0.35)' : streakData.tier === 'Pro' ? 'rgba(59,130,246,0.35)' : streakData.tier === 'Rising' ? 'rgba(234,179,8,0.35)' : 'rgba(34,197,94,0.35)',
                      color: streakData.tier === 'OG' ? '#f87171' : streakData.tier === 'Elite' ? '#c084fc' : streakData.tier === 'Pro' ? '#60a5fa' : streakData.tier === 'Rising' ? '#fbbf24' : '#4ade80',
                    }}>
                    {streakData.tier}
                    {streakData.currentStreak > 0 && <span className="text-amber-400 ml-1">🔥{streakData.currentStreak}</span>}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-gray-500 mt-0.5">
                {dateStr} · VEDD Command Center
                {streakData && streakData.xpPoints > 0 && <span className="text-gray-600"> · {streakData.xpPoints.toLocaleString()} XP</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap justify-end flex-shrink-0">
              <span className="hidden sm:block"><AISourceBadge /></span>
              {/* Daily check-in button */}
              {checkinStatus && !checkinStatus.claimed && (
                <button
                  onClick={() => checkinMutation.mutate()}
                  disabled={checkinMutation.isPending}
                  className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border border-amber-500/40 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 transition-all active:scale-95 whitespace-nowrap"
                >
                  {checkinMutation.isPending ? '…' : `✓ +${checkinStatus.nextReward} VEDD`}
                </button>
              )}
              {checkinStatus?.claimed && (
                <span className="flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border border-emerald-500/30 bg-emerald-500/10 text-emerald-500">
                  ✓ In
                </span>
              )}
              <div className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold border ${ssEngineRunning ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ssEngineRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                <span className="whitespace-nowrap">{ssEngineRunning ? 'LIVE' : 'OFF'}</span>
              </div>
              {/* Explore Features button — desktop prominent, mobile compact */}
              <button
                onClick={() => setShowFeaturesHub(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:border-red-500/60 transition-all active:scale-95 whitespace-nowrap"
              >
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5"/><path d="M4 6h4M6 4v4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                <span className="hidden sm:inline">Explore Features</span>
                <span className="sm:hidden">Features</span>
              </button>
            </div>
          </div>

          {/* Row 2: Live account balance cards */}
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide mb-3">
            {mt5LiveAcct?.connected && (
              <div className="flex-shrink-0 rounded-xl border border-indigo-500/25 bg-indigo-500/8 px-3 py-2.5 min-w-[140px]" style={{ background: 'rgba(99,102,241,0.07)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-wider">MT5 Live</span>
                </div>
                <p className="text-base font-black text-white leading-none">{mt5LiveAcct.currency ?? 'USD'} {liveBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {mt5LiveAcct.equity !== mt5LiveAcct.balance && <p className="text-[10px] text-gray-500 mt-0.5">Equity {(mt5LiveAcct.equity ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>}
              </div>
            )}
            {tlLiveAccts.filter(t => !t.error).map((t: any) => (
              <div key={t.id} className="flex-shrink-0 rounded-xl border border-cyan-500/25 px-3 py-2.5 min-w-[140px]" style={{ background: 'rgba(6,182,212,0.07)' }}>
                <div className="flex items-center gap-1 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-[9px] font-bold text-cyan-300 uppercase tracking-wider">{t.brokerName ?? t.accountType?.toUpperCase() ?? 'TL'}</span>
                </div>
                <p className="text-base font-black text-white leading-none">{t.currency ?? 'USD'} {(t.balance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                {t.openTrades > 0 && <p className="text-[10px] text-cyan-400 mt-0.5">{t.openTrades} open</p>}
              </div>
            ))}
            {!mt5LiveAcct?.connected && tlLiveAccts.length === 0 && (
              <div className="flex-shrink-0 rounded-xl border border-gray-700 px-3 py-2.5 min-w-[160px] bg-gray-900/40">
                <p className="text-[10px] text-gray-500">No live accounts connected</p>
                <p className="text-[9px] text-gray-600 mt-0.5">Connect MT5 EA or TradeLocker →</p>
              </div>
            )}
          </div>

          {/* Goal achieved banner — shows when daily or weekly target hit */}
          {(dayGoalPct >= 100 || weekGoalPct >= 100) && (
            <div className="rounded-xl px-4 py-2.5 flex items-center gap-2.5 mb-2"
              style={{ background: 'linear-gradient(90deg,rgba(16,185,129,0.15),rgba(5,150,105,0.08))', border: '1px solid rgba(16,185,129,0.3)' }}>
              <span className="text-lg">🏆</span>
              <div>
                <p className="text-emerald-400 font-black text-xs leading-tight">
                  {weekGoalPct >= 100 && dayGoalPct >= 100 ? 'WEEKLY + DAILY GOAL SMASHED!' : weekGoalPct >= 100 ? 'WEEKLY GOAL SMASHED!' : 'DAILY GOAL SMASHED!'}
                </p>
                <p className="text-emerald-500/70 text-[10px]">Exceptional trading — protect your profits now</p>
              </div>
              <span className="ml-auto text-emerald-400 font-black text-sm">+${weekClosedProfit.toFixed(0)}</span>
            </div>
          )}

          {/* Row 3: Goal rings + P&L meters */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Weekly Goal Ring */}
            {(() => {
              const now = new Date();
              const dayOfWeek = now.getDay(); // 0=Sun, 5=Fri (trading week ends Fri)
              const tradingDaysLeft = dayOfWeek === 0 ? 5 : Math.max(0, 5 - dayOfWeek);
              const ringColor = weekGoalPct >= 100 ? '#10b981' : weekGoalPct >= 60 ? '#f59e0b' : '#6366f1';
              return (
                <div className="rounded-xl border border-gray-700/60 bg-gray-900/50 px-3 py-3 flex flex-col items-center">
                  <div className="relative">
                    <svg width="56" height="56" viewBox="0 0 56 56">
                      <circle cx="28" cy="28" r="23" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                      <circle cx="28" cy="28" r="23" fill="none"
                        stroke={ringColor}
                        strokeWidth="5" strokeLinecap="round"
                        strokeDasharray={`${(weekGoalPct / 100) * 144.5} 144.5`}
                        transform="rotate(-90 28 28)" />
                      <text x="28" y="32" textAnchor="middle" fill="white" fontSize="11" fontWeight="700">{weekGoalPct.toFixed(0)}%</text>
                    </svg>
                    {weekGoalPct >= 100 && (
                      <span className="absolute -top-1 -right-1 text-[10px]">🏆</span>
                    )}
                  </div>
                  <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Week Goal</p>
                  <p className="text-[10px] text-white font-semibold">${weekClosedProfit >= 0 ? '+' : ''}{weekClosedProfit.toFixed(0)} / ${weeklyTarget.toFixed(0)}</p>
                  <p className="text-[9px] mt-0.5" style={{ color: tradingDaysLeft <= 1 ? '#f87171' : '#6b7280' }}>
                    {tradingDaysLeft === 0 ? 'Week ends today' : `${tradingDaysLeft}d left`}
                  </p>
                </div>
              );
            })()}

            {/* Daily P&L */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/50 px-3 py-3 flex flex-col items-center">
              <svg width="56" height="56" viewBox="0 0 56 56">
                <circle cx="28" cy="28" r="23" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5" />
                <circle cx="28" cy="28" r="23" fill="none"
                  stroke={liveDailyPnl >= 0 ? '#10b981' : '#ef4444'}
                  strokeWidth="5" strokeLinecap="round"
                  strokeDasharray={`${Math.min(100, Math.abs(dayGoalPct)) / 100 * 144.5} 144.5`}
                  transform="rotate(-90 28 28)" />
                <text x="28" y="32" textAnchor="middle" fill={liveDailyPnl >= 0 ? '#10b981' : '#ef4444'} fontSize="9" fontWeight="700">{liveDailyPnl >= 0 ? '+' : ''}{liveDailyPnl.toFixed(1)}</text>
              </svg>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-1">Daily P&L</p>
              <p className="text-[10px] font-semibold" style={{ color: liveDailyPnl >= 0 ? '#10b981' : '#ef4444' }}>
                {liveDailyPnl >= 0 ? '▲' : '▼'} ${Math.abs(liveDailyPnl).toFixed(2)}
              </p>
            </div>

            {/* Today's trades */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/50 px-3 py-3 flex flex-col items-center justify-center">
              <p className="text-2xl font-black text-white">{todayTrades}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mt-0.5">Trades Today</p>
              {todayWinRate > 0 && <p className="text-[10px] font-semibold text-emerald-400 mt-1">{todayWinRate.toFixed(0)}% W/R</p>}
              {openPositions > 0 && <p className="text-[9px] text-cyan-400">{openPositions} open</p>}
            </div>

            {/* Rank / XP + Engine pulses */}
            <div className="rounded-xl border border-gray-700/60 bg-gray-900/50 px-3 py-3 flex flex-col justify-between">
              {streakData ? (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[9px] font-black uppercase tracking-wider"
                      style={{ color: streakData.tier === 'OG' ? '#f87171' : streakData.tier === 'Elite' ? '#c084fc' : streakData.tier === 'Pro' ? '#60a5fa' : streakData.tier === 'Rising' ? '#fbbf24' : '#4ade80' }}>
                      {streakData.tier}
                    </span>
                    {streakData.currentStreak > 0 && <span className="text-[9px] text-amber-400">🔥 {streakData.currentStreak}d</span>}
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-1.5">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${streakData.tierProgress ?? 0}%`,
                        background: streakData.tier === 'OG' ? 'linear-gradient(90deg,#ef4444,#f87171)' : streakData.tier === 'Elite' ? 'linear-gradient(90deg,#a855f7,#c084fc)' : streakData.tier === 'Pro' ? 'linear-gradient(90deg,#3b82f6,#60a5fa)' : streakData.tier === 'Rising' ? 'linear-gradient(90deg,#eab308,#fbbf24)' : 'linear-gradient(90deg,#22c55e,#4ade80)',
                      }} />
                  </div>
                  <p className="text-[9px] text-gray-600">{streakData.xpPoints.toLocaleString()} XP</p>
                </>
              ) : (
                <p className="text-[9px] text-gray-600 text-center">Log in daily to earn XP</p>
              )}
              <div className="mt-2 space-y-1">
                <div className={`flex items-center gap-1 text-[9px] font-bold ${ssEngineRunning ? 'text-emerald-400' : 'text-gray-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${ssEngineRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-700'}`} />
                  SS AI {ssEngineRunning ? 'ON' : 'OFF'}
                </div>
                <div className={`flex items-center gap-1 text-[9px] font-bold ${solEngineRunning ? 'text-violet-400' : 'text-gray-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${solEngineRunning ? 'bg-violet-400 animate-pulse' : 'bg-gray-700'}`} />
                  SOL {solEngineRunning ? 'ON' : 'OFF'}
                </div>
                <div className={`flex items-center gap-1 text-[9px] font-bold ${breakoutMonitorOn ? 'text-amber-400' : 'text-gray-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${breakoutMonitorOn ? 'bg-amber-400 animate-pulse' : 'bg-gray-700'}`} />
                  ORB {breakoutMonitorOn ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Greeting Header (now just date strip) ─────────────────────── */}
      <div className="px-4 md:px-6 pt-3 pb-1 container mx-auto" style={{ display: 'none' }}>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black text-white">
              {greeting}, {displayName}
            </h1>
            <p className="stat-lbl mt-0.5">{dateStr}</p>
          </div>
          <div className="flex items-center gap-3">
            <AISourceBadge />
            <div className="flex items-center gap-1.5">
              <span className={ssEngineRunning ? 'live-pulse' : 'live-pulse-red'} />
              <span className={`text-xs font-semibold ${ssEngineRunning ? 'text-emerald-400' : 'text-gray-500'}`}>
                {ssEngineRunning ? 'LIVE' : 'IDLE'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          DESKTOP QUICK-ACCESS GRID — visible on md+ only
      ══════════════════════════════════════════════════════════════════ */}
      <div className="hidden md:block container mx-auto px-6 pt-4 pb-1">
        <div className="grid grid-cols-8 gap-2">
          {[
            { label: 'Chart Analysis', icon: '📊', path: '/analysis', color: '#ef4444' },
            { label: 'SS AI Engine', icon: '⚡', path: '/weekly-strategy', color: '#10b981', dot: ssEngineRunning },
            { label: 'ORB Breakout', icon: '🎯', path: '/orb-breakout', color: '#f59e0b' },
            { label: 'Abba AI', icon: '🧠', path: '/abba', color: '#a855f7' },
            { label: 'Copy Trading', icon: '📋', path: '/copy-trading', color: '#6366f1' },
            { label: 'Multi-TF', icon: '🔬', path: '/multi-timeframe', color: '#22d3ee' },
            { label: 'EA Marketplace', icon: '🤖', path: '/ea-marketplace', color: '#fb923c' },
            { label: 'My EAs', icon: '💾', path: '/my-eas', color: '#84cc16' },
          ].map(item => (
            <Link key={item.path} href={item.path}>
              <div className="rounded-xl border border-gray-800 bg-gray-900/50 px-2 py-2.5 flex flex-col items-center gap-1.5 cursor-pointer hover:border-gray-600 hover:bg-gray-800/60 transition-all group relative">
                {item.dot && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                <span className="text-lg leading-none">{item.icon}</span>
                <span className="text-[9px] font-bold text-gray-400 group-hover:text-white text-center leading-tight transition-colors">{item.label}</span>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="container mx-auto px-4 md:px-6">
        <AIKeyNudgeBanner />

        {/* ══════════════════════════════════════════════════════════════════
            MARKET NEWS STRIP — latest headlines for active pair
        ══════════════════════════════════════════════════════════════════ */}
        {pairNews?.news && pairNews.news.length > 0 && (
          <div className="mb-4 rounded-2xl border border-gray-700/40 bg-gray-900/40 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-800/60">
              <span className="text-[9px] font-black uppercase tracking-widest text-gray-400">📰 {calendarPair} News</span>
              <span className="ml-auto text-[9px] text-gray-600">{pairNews.news.length} headlines</span>
            </div>
            <div className="divide-y divide-gray-800/40">
              {pairNews.news.slice(0, 3).map((item: any, i: number) => (
                <a key={i} href={item.url ?? '#'} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-2.5 px-3 py-2 hover:bg-gray-800/30 transition-colors">
                  <span className={`flex-shrink-0 w-1 h-full self-stretch rounded-full mt-1 ${item.sentiment === 'bullish' || item.sentiment === 'positive' ? 'bg-emerald-500' : item.sentiment === 'bearish' || item.sentiment === 'negative' ? 'bg-red-500' : 'bg-gray-600'}`} style={{ minHeight: 10 }} />
                  <p className="text-[11px] text-gray-300 leading-snug line-clamp-2">{item.headline}</p>
                  {item.source && <span className="text-[9px] text-gray-600 flex-shrink-0 ml-auto">{item.source}</span>}
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            FUSEBOX — per-engine kill panel
        ══════════════════════════════════════════════════════════════════ */}
        <div className="mb-4 rounded-2xl border border-gray-700/50 bg-gray-900/60 p-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-lg bg-red-500/15 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="#ef4444" strokeWidth="1.5"/><path d="M6 3v3l2 1" stroke="#ef4444" strokeWidth="1.2" strokeLinecap="round"/></svg>
              </div>
              <span className="text-xs font-bold text-white uppercase tracking-wider">Engine Fusebox</span>
            </div>
            <button
              onClick={() => killAllMutation.mutate()}
              disabled={killAllMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/15 border border-red-500/30 text-red-400 text-[11px] font-bold hover:bg-red-500/25 transition-colors active:scale-95"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              {killAllMutation.isPending ? 'STOPPING…' : 'KILL ALL'}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* SS AI Engine */}
            <Link href="/weekly-strategy">
              <div className={`rounded-xl border p-2.5 cursor-pointer transition-all hover:scale-[1.02] ${ssEngineRunning ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-gray-700 bg-gray-800/40'}`} style={ssEngineRunning ? { background: 'rgba(16,185,129,0.07)' } : {}}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">SS AI</span>
                  <span className={`w-2 h-2 rounded-full ${ssEngineRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                </div>
                <p className={`text-xs font-black ${ssEngineRunning ? 'text-emerald-400' : 'text-gray-500'}`}>{ssEngineRunning ? 'LIVE' : 'OFF'}</p>
                <p className="text-[9px] text-gray-600 mt-0.5">Tap to configure</p>
              </div>
            </Link>
            {/* Polymarket */}
            <div
              onClick={() => polyToggleMutation.mutate(!polyEngineStatus?.isRunning)}
              className={`rounded-xl border p-2.5 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${polyEngineStatus?.isRunning ? 'border-violet-500/30' : 'border-gray-700 bg-gray-800/40'}`}
              style={polyEngineStatus?.isRunning ? { background: 'rgba(139,92,246,0.07)' } : {}}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Polymarket</span>
                <span className={`w-2 h-2 rounded-full ${polyEngineStatus?.isRunning ? 'bg-violet-400 animate-pulse' : 'bg-gray-600'}`} />
              </div>
              <p className={`text-xs font-black ${polyEngineStatus?.isRunning ? 'text-violet-400' : 'text-gray-500'}`}>
                {polyToggleMutation.isPending ? '…' : polyEngineStatus?.isRunning ? 'LIVE' : 'OFF'}
              </p>
              {polyEngineStatus?.isRunning && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[9px] text-gray-500">{polyEngineStatus.openPositions?.length ?? 0} open</p>
                  {(polyEngineStatus.totalRealizedPnl ?? 0) !== 0 && (
                    <p className={`text-[9px] font-semibold ${(polyEngineStatus.totalRealizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(polyEngineStatus.totalRealizedPnl ?? 0) >= 0 ? '+' : ''}${(polyEngineStatus.totalRealizedPnl ?? 0).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
              {!polyEngineStatus?.isRunning && <p className="text-[9px] text-gray-600 mt-0.5">{polyEngineStatus?.isPaperMode !== false ? 'Paper mode' : 'Live mode'}</p>}
            </div>
            {/* Kalshi */}
            <div
              onClick={() => kalshiToggleMutation.mutate(!kalshiEngineStatus?.isRunning)}
              className={`rounded-xl border p-2.5 cursor-pointer transition-all hover:scale-[1.02] active:scale-[0.98] ${kalshiEngineStatus?.isRunning ? 'border-cyan-500/30' : 'border-gray-700 bg-gray-800/40'}`}
              style={kalshiEngineStatus?.isRunning ? { background: 'rgba(6,182,212,0.07)' } : {}}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Kalshi</span>
                <span className={`w-2 h-2 rounded-full ${kalshiEngineStatus?.isRunning ? 'bg-cyan-400 animate-pulse' : 'bg-gray-600'}`} />
              </div>
              <p className={`text-xs font-black ${kalshiEngineStatus?.isRunning ? 'text-cyan-400' : 'text-gray-500'}`}>
                {kalshiToggleMutation.isPending ? '…' : kalshiEngineStatus?.isRunning ? 'LIVE' : 'OFF'}
              </p>
              {kalshiEngineStatus?.isRunning && (
                <div className="mt-1 space-y-0.5">
                  <p className="text-[9px] text-gray-500">{kalshiEngineStatus.openTrades?.length ?? 0} open</p>
                  {(kalshiEngineStatus.totalRealizedPnl ?? 0) !== 0 && (
                    <p className={`text-[9px] font-semibold ${(kalshiEngineStatus.totalRealizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(kalshiEngineStatus.totalRealizedPnl ?? 0) >= 0 ? '+' : ''}${(kalshiEngineStatus.totalRealizedPnl ?? 0).toFixed(2)}
                    </p>
                  )}
                </div>
              )}
              {!kalshiEngineStatus?.isRunning && <p className="text-[9px] text-gray-600 mt-0.5">{kalshiEngineStatus?.isPaperMode !== false ? 'Paper mode' : 'Live mode'}</p>}
            </div>
            {/* Breakout Scanner */}
            <Link href="/weekly-strategy">
              <div className={`rounded-xl border p-2.5 cursor-pointer transition-all hover:scale-[1.02] ${breakoutMonitorOn ? 'border-amber-500/30' : 'border-gray-700 bg-gray-800/40'}`} style={breakoutMonitorOn ? { background: 'rgba(245,158,11,0.07)' } : {}}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">Scanner</span>
                  <span className={`w-2 h-2 rounded-full ${breakoutMonitorOn ? 'bg-amber-400 animate-pulse' : 'bg-gray-600'}`} />
                </div>
                <p className={`text-xs font-black ${breakoutMonitorOn ? 'text-amber-400' : 'text-gray-500'}`}>{breakoutMonitorOn ? 'ON' : 'OFF'}</p>
                <p className="text-[9px] text-gray-600 mt-0.5">Breakout monitor</p>
              </div>
            </Link>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            DAILY BIBLE TRADER WISDOM
        ══════════════════════════════════════════════════════════════════ */}
        {dailyDevotional && (
          <div className="mb-4 rounded-2xl border border-amber-500/20 p-3" style={{ background: 'rgba(245,158,11,0.04)' }}>
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.15)' }}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 1h8v10H2V1z" stroke="#f59e0b" strokeWidth="1.2"/><path d="M4 4h4M4 6h4M4 8h2" stroke="#f59e0b" strokeWidth="1" strokeLinecap="round"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-xs font-black text-white">{dailyDevotional.title || 'Daily Trader Wisdom'}</span>
                {dailyDevotional.theme && <span className="ml-2 text-[10px] text-amber-400/70">{dailyDevotional.theme}</span>}
              </div>
              <Link href="/devotional">
                <span className="text-[9px] text-gray-600 hover:text-amber-400 transition-colors">Full →</span>
              </Link>
            </div>
            {/* Scripture */}
            {dailyDevotional.scripture_text && (
              <div className="rounded-xl border border-amber-500/15 px-3 py-2.5 mb-2" style={{ background: 'rgba(245,158,11,0.07)' }}>
                <p className="text-[11px] text-amber-100 leading-relaxed italic">"{dailyDevotional.scripture_text}"</p>
                <p className="text-[10px] text-amber-400 font-semibold mt-1">{dailyDevotional.scripture}</p>
              </div>
            )}
            {/* Trading tie-in */}
            {dailyDevotional.trading_tie_in && (
              <div className="rounded-xl border border-gray-700/50 bg-gray-800/40 px-3 py-2 mb-2">
                <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">Trading Application</p>
                <p className="text-[11px] text-gray-300 leading-relaxed">{dailyDevotional.trading_tie_in}</p>
              </div>
            )}
            {/* Affirmation */}
            {dailyDevotional.affirmation && (
              <p className="text-[10px] text-amber-400/60 italic text-center px-2">{dailyDevotional.affirmation}</p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            DAILY DEVOTION + AMBASSADOR TO-DOS
        ══════════════════════════════════════════════════════════════════ */}
        {ambassadorJourney && !ambassadorJourney.isComplete && (
          <div className="mb-4 rounded-2xl border border-indigo-500/20 bg-indigo-500/5 p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-500/20 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1l1.5 3 3.5.5-2.5 2.4.6 3.5L6 9l-3.1 1.4.6-3.5L1 4.5 4.5 4z" stroke="#818cf8" strokeWidth="1.2" fill="none"/></svg>
              </div>
              <div>
                <span className="text-xs font-black text-white">Day {ambassadorJourney.currentDay} Mission</span>
                {ambassadorJourney.streak > 0 && <span className="ml-2 text-[10px] text-amber-400">🔥 {ambassadorJourney.streak}-day streak</span>}
              </div>
              <span className="ml-auto text-[10px] font-bold text-indigo-400">{ambassadorJourney.tokensEarned} VEDD</span>
            </div>
            {ambassadorJourney.todayActions ? (
              <div className="space-y-2">
                {ambassadorJourney.todayActions.focus && (
                  <div className="rounded-xl bg-indigo-500/10 border border-indigo-500/15 px-3 py-2">
                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5">Today's Focus</p>
                    <p className="text-[11px] text-gray-200 leading-relaxed">{ambassadorJourney.todayActions.focus}</p>
                  </div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ambassadorJourney.todayActions.postIdea && (
                    <button onClick={() => toggleAmbassadorTodo('post')}
                      className={`rounded-xl border px-3 py-2 text-left transition-opacity w-full ${ambassadorTodos.post ? 'opacity-50 bg-emerald-900/10 border-emerald-800/30' : 'bg-gray-800/60 border-gray-700/50'}`}>
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                        {ambassadorTodos.post ? '✓' : '○'} 📣 Post Idea
                      </p>
                      <p className={`text-[10px] leading-relaxed line-clamp-3 ${ambassadorTodos.post ? 'line-through text-gray-600' : 'text-gray-300'}`}>{ambassadorJourney.todayActions.postIdea}</p>
                    </button>
                  )}
                  {ambassadorJourney.todayActions.dmScript && (
                    <button onClick={() => toggleAmbassadorTodo('dm')}
                      className={`rounded-xl border px-3 py-2 text-left transition-opacity w-full ${ambassadorTodos.dm ? 'opacity-50 bg-blue-900/10 border-blue-800/30' : 'bg-gray-800/60 border-gray-700/50'}`}>
                      <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-0.5">
                        {ambassadorTodos.dm ? '✓' : '○'} 💬 DM Script
                      </p>
                      <p className={`text-[10px] leading-relaxed line-clamp-3 ${ambassadorTodos.dm ? 'line-through text-gray-600' : 'text-gray-300'}`}>{ambassadorJourney.todayActions.dmScript}</p>
                    </button>
                  )}
                </div>
                {ambassadorJourney.nextMilestone && (
                  <p className="text-[10px] text-gray-600 pt-0.5">Next milestone: Day {ambassadorJourney.nextMilestone.day} → <span className="text-indigo-400">{ambassadorJourney.nextMilestone.reward}</span></p>
                )}
              </div>
            ) : (
              <p className="text-[11px] text-gray-500">Today's mission content loading…</p>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            ECONOMIC CALENDAR — high-impact events for active pairs
        ══════════════════════════════════════════════════════════════════ */}
        {econCalendar && econCalendar.events && econCalendar.events.filter(e => e.impact === 'high' || e.impact === 'High').length > 0 && (
          <div className="mb-4 rounded-2xl border border-rose-500/20 p-3" style={{ background: 'rgba(239,68,68,0.03)' }}>
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.15)' }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="1" y="2" width="10" height="9" rx="1.5" stroke="#f87171" strokeWidth="1.2"/><path d="M4 1v2M8 1v2M1 5h10" stroke="#f87171" strokeWidth="1.2" strokeLinecap="round"/></svg>
                </div>
                <span className="text-xs font-black text-white">High-Impact Events</span>
                <span className="text-[10px] text-rose-400 font-semibold">
                  {strategyPairs.slice(0, 3).join(' · ') || calendarPair}
                </span>
              </div>
              <Link href="/market-insights">
                <span className="text-[9px] text-gray-600 hover:text-rose-400 transition-colors">All →</span>
              </Link>
            </div>
            <div className="space-y-1.5">
              {econCalendar.events
                .filter(e => e.impact === 'high' || e.impact === 'High')
                .slice(0, 4)
                .map((ev, i) => {
                  const isToday = ev.date === new Date().toISOString().split('T')[0];
                  return (
                    <div key={ev.id ?? i} className={`rounded-xl border px-3 py-2 flex items-start gap-2.5 ${isToday ? 'border-rose-500/30 bg-rose-500/7' : 'border-gray-700/50 bg-gray-800/30'}`} style={isToday ? { background: 'rgba(239,68,68,0.07)' } : {}}>
                      <div className="flex-shrink-0 mt-0.5">
                        <div className={`w-2 h-2 rounded-full ${isToday ? 'bg-rose-400 animate-pulse' : 'bg-gray-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[11px] font-bold text-white">{ev.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-rose-500/20 text-rose-400">HIGH</span>
                          {isToday && <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500/20 text-amber-400">TODAY</span>}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-gray-500">{ev.time}</span>
                          <span className="text-[10px] text-gray-600">{ev.currency} · {ev.country}</span>
                        </div>
                        {(ev.forecast || ev.previous) && (
                          <div className="flex gap-3 mt-0.5">
                            {ev.forecast && <span className="text-[9px] text-cyan-400">Fcst: {ev.forecast}</span>}
                            {ev.previous && <span className="text-[9px] text-gray-600">Prev: {ev.previous}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
            <p className="text-[9px] text-gray-700 mt-2 text-center">Avoid entering trades 15 min before/after high-impact events</p>
          </div>
        )}

        {/* ── Account Balances + Weekly Goal Strip ─────────────────────── */}
        {(mt5Accounts.length > 0 || tlBalance !== null || dailySummary?.weeklyTarget) && (
          <div className="mb-4 space-y-2">
            {/* Account balances row */}
            {(mt5Accounts.length > 0 || tlBalance !== null) && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {mt5Accounts.map((acc, i) => (
                  <Link key={i} href="/mt5-chart-data">
                    <div className="flex-shrink-0 smart-card px-3 py-2 flex items-center gap-2 cursor-pointer hover:border-red-500/30 transition-colors min-w-[140px]">
                      <div className="icon-box-sm icon-box-cyan">
                        <Wallet className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 font-medium">{acc.label}</p>
                        <p className="text-white font-bold text-sm leading-none">${acc.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {acc.equity != null && acc.equity !== acc.balance && (
                          <p className={`text-[10px] mt-0.5 ${acc.equity >= acc.balance ? 'text-emerald-400' : 'text-red-400'}`}>
                            Eq ${acc.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
                {tlConnectionsAll.filter((c: any) => c.isActive).map((c: any) => (
                  <Link key={c.id} href="/webhooks#tradelocker">
                    <div className="flex-shrink-0 smart-card px-3 py-2 flex items-center gap-2 cursor-pointer hover:border-cyan-500/30 transition-colors min-w-[140px]">
                      <div className="icon-box-sm icon-box-purple">
                        <Building2 className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-cyan-400 font-bold text-xs leading-tight">
                            {c.brokerName || c.serverId || 'TradeLocker'}
                          </p>
                          <span className={`text-[9px] font-bold px-1 rounded ${c.accountType === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {c.accountType?.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[10px] text-gray-500 truncate max-w-[100px] mt-0.5">{c.email}</p>
                        {c.lotMultiplier && c.lotMultiplier !== 1 && (
                          <p className="text-[9px] text-amber-400">×{c.lotMultiplier} lots</p>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* ── Platform Monitors ─────────────────────────────────────── */}
            {platformMonitors && (
              <div className="space-y-1.5">
                {/* Section label */}
                <div className="flex items-center gap-2 px-0.5 pt-1">
                  <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Platform Monitors</span>
                  <div className="flex-1 h-px bg-gray-800" />
                </div>

                {/* MT5 */}
                {platformMonitors.mt5 && (
                  <Link href="/mt5-chart-data">
                    <div className="smart-card px-3 py-2.5 cursor-pointer hover:border-cyan-500/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${platformMonitors.mt5.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                          <span className="text-xs font-bold text-white">MT5</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${platformMonitors.mt5.isOnline ? 'bg-emerald-500/20 text-emerald-400' : 'bg-gray-700 text-gray-500'}`}>
                            {platformMonitors.mt5.isOnline ? 'ONLINE' : 'OFFLINE'}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-white">${platformMonitors.mt5.balance.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px]">
                        <span className="text-gray-500">Equity: <span className="text-gray-300">${platformMonitors.mt5.equity.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span></span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">Today: <span className={platformMonitors.mt5.dailyPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{platformMonitors.mt5.dailyPnl >= 0 ? '+' : ''}${platformMonitors.mt5.dailyPnl.toFixed(2)}</span></span>
                          <span className="text-gray-500">Week: <span className={platformMonitors.mt5.weeklyPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{platformMonitors.mt5.weeklyPnl >= 0 ? '+' : ''}${platformMonitors.mt5.weeklyPnl.toFixed(2)}</span></span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}

                {/* TradeLocker — one card per account */}
                {platformMonitors.tradelocker.map((acc) => (
                  <Link key={acc.id} href="/webhooks#tradelocker">
                    <div className="smart-card px-3 py-2.5 cursor-pointer hover:border-purple-500/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400 flex-shrink-0" />
                          <span className="text-xs font-bold text-white truncate max-w-[120px]">{(acc as any).brokerName || acc.accountName || 'TradeLocker'}</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold flex-shrink-0 ${acc.accountType === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                            {acc.accountType?.toUpperCase()}
                          </span>
                        </div>
                        {acc.error ? (
                          <span className="text-[9px] text-red-400">Auth error</span>
                        ) : (
                          <span className="text-sm font-bold text-white">${acc.balance.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</span>
                        )}
                      </div>
                      {!acc.error && (
                        <div className="flex items-center justify-between mt-1.5 text-[10px]">
                          <span className="text-gray-500">Eq: <span className="text-gray-300">${acc.equity.toFixed(2)}</span> · Open: <span className="text-gray-300">{acc.openTrades}</span> · Unreal: <span className={acc.unrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{acc.unrealizedPnl >= 0 ? '+' : ''}${acc.unrealizedPnl.toFixed(2)}</span></span>
                          <div className="flex items-center gap-3">
                            <span className="text-gray-500">Today: <span className={acc.dailyPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{acc.dailyPnl >= 0 ? '+' : ''}${acc.dailyPnl.toFixed(2)}</span></span>
                            <span className="text-gray-500">Week: <span className={acc.weeklyPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{acc.weeklyPnl >= 0 ? '+' : ''}${acc.weeklyPnl.toFixed(2)}</span></span>
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                ))}

                {/* TradeLocker recent trades — shown when TL is connected */}
                {tlConnectionsAll.length > 0 && (
                  <div className="smart-card px-3 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-semibold text-purple-300 uppercase tracking-wide">TL Recent Trades</span>
                      <span className="text-[9px] text-gray-500">{tlTrades?.length ?? 0} records</span>
                    </div>
                    {!tlTrades || tlTrades.length === 0 ? (
                      <p className="text-[10px] text-gray-600 text-center py-1">No trades synced yet — trades appear within 30s of closing</p>
                    ) : (
                      <div className="space-y-1">
                        {tlTrades.slice(0, 8).map((t: any, i: number) => {
                          const pnl = typeof t.profitLoss === 'number' ? t.profitLoss : parseFloat(t.profitLoss ?? '0');
                          const dir = (t.action || t.direction || '').toUpperCase();
                          const isBuy = dir.includes('BUY') || dir.includes('LONG') || dir.includes('buy');
                          const result = t.result || t.status || '';
                          const isWin = result === 'WIN' || pnl > 0;
                          const isLoss = result === 'LOSS' || (pnl < 0 && result !== 'PENDING' && result !== 'open');
                          const isPending = result === 'PENDING' || result === 'open' || result === 'executed';
                          return (
                            <div key={t.id || i} className="flex items-center justify-between text-[10px]">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className={`text-[9px] font-bold px-1 rounded flex-shrink-0 ${isBuy ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{isBuy ? 'B' : 'S'}</span>
                                <span className="text-gray-300 font-medium truncate">{(t.symbol || 'UNKNOWN').toUpperCase()}</span>
                                {isPending && <span className="text-[9px] text-amber-400">open</span>}
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {!isPending && (
                                  <span className={`font-semibold ${isWin ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-gray-400'}`}>
                                    {pnl >= 0 ? '+' : ''}${pnl.toFixed(2)}
                                  </span>
                                )}
                                <span className="text-gray-600 text-[9px]">{t.closedAt || t.createdAt ? new Date(t.closedAt || t.createdAt).toLocaleDateString('en-US', {month:'numeric',day:'numeric'}) : ''}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {/* Solana */}
                {platformMonitors.solana && (
                  <Link href="/solana-scanner">
                    <div className="smart-card px-3 py-2.5 cursor-pointer hover:border-purple-500/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${platformMonitors.solana.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                          <span className="text-xs font-bold text-white">Solana</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${platformMonitors.solana.isRunning ? 'bg-purple-500/20 text-purple-300' : 'bg-gray-700 text-gray-500'}`}>
                            {platformMonitors.solana.isRunning ? platformMonitors.solana.autoTradeMode.toUpperCase() : 'OFF'}
                          </span>
                        </div>
                        <span className="text-sm font-bold text-white">{platformMonitors.solana.balanceSol.toFixed(4)} SOL</span>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px]">
                        <span className="text-gray-500">
                          Phase: <span className="text-purple-300 capitalize">{platformMonitors.solana.phase}</span>
                          {platformMonitors.solana.winStreak > 0 && <span className="text-amber-400 ml-1">🔥{platformMonitors.solana.winStreak}</span>}
                        </span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">Today: <span className={platformMonitors.solana.dailyPnlSol >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{platformMonitors.solana.dailyPnlSol >= 0 ? '+' : ''}{platformMonitors.solana.dailyPnlSol.toFixed(4)} SOL</span></span>
                          <span className="text-gray-500">Week: <span className={platformMonitors.solana.weeklyPnlSol >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{platformMonitors.solana.weeklyPnlSol >= 0 ? '+' : ''}{platformMonitors.solana.weeklyPnlSol.toFixed(4)} SOL</span></span>
                        </div>
                      </div>
                      {platformMonitors.solana.weeklyTargetSol > 0 && (
                        <div className="mt-1.5">
                          <div className="w-full h-1 rounded-full bg-gray-800">
                            <div className="h-1 rounded-full bg-purple-500" style={{ width: `${Math.min((platformMonitors.solana.weeklyPnlSol / platformMonitors.solana.weeklyTargetSol) * 100, 100)}%` }} />
                          </div>
                          <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                            <span>Weekly goal</span>
                            <span>{((platformMonitors.solana.weeklyPnlSol / platformMonitors.solana.weeklyTargetSol) * 100).toFixed(0)}% of {platformMonitors.solana.weeklyTargetSol.toFixed(2)} SOL</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                )}

                {/* Polymarket */}
                {platformMonitors.polymarket && (
                  <Link href="/polymarket-engine">
                    <div className="smart-card px-3 py-2.5 cursor-pointer hover:border-violet-500/30 transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${platformMonitors.polymarket.isRunning ? 'bg-violet-400 animate-pulse' : 'bg-gray-600'}`} />
                          <span className="text-xs font-bold text-white">Polymarket</span>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-semibold ${platformMonitors.polymarket.isRunning ? 'bg-violet-500/20 text-violet-300' : 'bg-gray-700 text-gray-500'}`}>
                            {platformMonitors.polymarket.isRunning ? 'RUNNING' : 'OFF'}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className={`text-sm font-bold ${platformMonitors.polymarket.totalRealizedPnl + platformMonitors.polymarket.totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {(platformMonitors.polymarket.totalRealizedPnl + platformMonitors.polymarket.totalUnrealizedPnl) >= 0 ? '+' : ''}${(platformMonitors.polymarket.totalRealizedPnl + platformMonitors.polymarket.totalUnrealizedPnl).toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1.5 text-[10px]">
                        <span className="text-gray-500">Open: <span className="text-gray-300">{platformMonitors.polymarket.openPositions}</span> · Trades: <span className="text-gray-300">{platformMonitors.polymarket.tradesOpened}</span> · Unreal: <span className={platformMonitors.polymarket.totalUnrealizedPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{platformMonitors.polymarket.totalUnrealizedPnl >= 0 ? '+' : ''}${platformMonitors.polymarket.totalUnrealizedPnl.toFixed(2)}</span></span>
                        <div className="flex items-center gap-3">
                          <span className="text-gray-500">Today: <span className={platformMonitors.polymarket.dailyRealizedPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{platformMonitors.polymarket.dailyRealizedPnl >= 0 ? '+' : ''}${platformMonitors.polymarket.dailyRealizedPnl.toFixed(2)}</span></span>
                          <span className="text-gray-500">Week: <span className={platformMonitors.polymarket.weeklyRealizedPnl >= 0 ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>{platformMonitors.polymarket.weeklyRealizedPnl >= 0 ? '+' : ''}${platformMonitors.polymarket.weeklyRealizedPnl.toFixed(2)}</span></span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            )}

            {/* ── MT5 Balance Chart ─────────────────────────────────────── */}
            {balanceHistory && balanceHistory.series.length >= 1 && (
              <div className="smart-card px-3 pt-3 pb-2 mb-0">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <Activity className="h-3.5 w-3.5 text-violet-400" />
                    <span className="text-xs font-semibold text-white">Account Balance</span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className={`font-bold ${(balanceHistory.totalPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(balanceHistory.totalPnL ?? 0) >= 0 ? '+' : ''}${(balanceHistory.totalPnL ?? 0).toFixed(2)} P&L
                    </span>
                    <span className="text-white font-bold">${(balanceHistory.currentBalance ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={70}>
                  <AreaChart data={balanceHistory.series} margin={{ top: 2, right: 2, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={((balanceHistory.totalPnL ?? 0) >= 0) ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={((balanceHistory.totalPnL ?? 0) >= 0) ? '#10b981' : '#ef4444'} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" hide />
                    <YAxis hide domain={['auto', 'auto']} />
                    <Tooltip
                      contentStyle={{ background: '#0d1226', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 11 }}
                      labelStyle={{ color: '#9ca3af' }}
                      formatter={(v: number) => [`$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, 'Balance']}
                      labelFormatter={(l: string) => new Date(l).toLocaleDateString()}
                    />
                    <Area type="monotone" dataKey="balance" stroke={(balanceHistory.totalPnL ?? 0) >= 0 ? '#10b981' : '#ef4444'} strokeWidth={2} fill="url(#balGrad)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>{balanceHistory.series[0]?.date ? new Date(balanceHistory.series[0].date).toLocaleDateString() : ''}</span>
                  <span>{balanceHistory.totalTrades} trades tracked</span>
                  <span>Today</span>
                </div>
              </div>
            )}

            {/* ── All-Time Record ─────────────────────────────────────── */}
            <div className="smart-card px-3 pt-3 pb-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <Trophy className="h-3.5 w-3.5 text-amber-400" />
                  <span className="text-xs font-semibold text-white">All-Time Record</span>
                  <span className="text-[10px] text-gray-500">best single day</span>
                </div>
                {allTimeRecord?.achievedAt && (
                  <span className="text-[10px] text-gray-600">
                    set {new Date(allTimeRecord.achievedAt).toLocaleDateString([], { month: 'short', day: 'numeric', year: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="flex items-end gap-3">
                <div>
                  <p className={`text-2xl font-black leading-none ${allTimeRecord?.value != null && allTimeRecord.value > 0 ? 'text-amber-400' : 'text-gray-600'}`}>
                    {allTimeRecord?.value != null
                      ? `$${allTimeRecord.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    {allTimeRecord?.value != null && allTimeRecord.value > 0
                      ? 'Record is set — beat it to update'
                      : 'No record yet — trade to set one'}
                  </p>
                </div>
                {allTimeRecord?.value != null && allTimeRecord.value > 0 && (
                  <div className="ml-auto">
                    <div className="w-8 h-8 rounded-xl bg-amber-500/15 flex items-center justify-center">
                      <Trophy className="h-4 w-4 text-amber-400" />
                    </div>
                  </div>
                )}
              </div>
              {/* Auto-submit today's closed PnL to check if it breaks the record */}
              {(platformMonitors?.mt5?.dailyPnl ?? 0) > 0 && (() => {
                const todayPnl = (platformMonitors?.mt5?.dailyPnl ?? 0) +
                  (platformMonitors?.tradelocker?.reduce((s: number, a: any) => s + (a.dailyPnl || 0), 0) ?? 0);
                return todayPnl > 0 ? (
                  <_SubmitRecord value={todayPnl} currentRecord={allTimeRecord?.value ?? null} />
                ) : null;
              })()}
            </div>

            {/* Weekly goal progress bar */}
            {weeklyTarget > 0 ? (
              <div className="smart-card px-3 py-2.5">
                <div className="flex items-center justify-between mb-1.5">
                  <Link href="/weekly-strategy" className="flex items-center gap-1.5 text-xs font-semibold text-white hover:text-yellow-400 transition-colors">
                    <Target className="h-3.5 w-3.5 text-yellow-400" /> Weekly Goal
                  </Link>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-gray-400">
                      <span className={`font-bold ${weekClosedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        ${weekClosedProfit.toFixed(2)}
                      </span>
                      <span className="text-gray-600"> / </span>
                      <span className="text-white">${weeklyTarget}</span>
                      <span className="text-gray-500 ml-1.5">{weekProgressPct}%</span>
                    </span>
                    <button
                      onClick={() => setShowManualTradeDialog(true)}
                      className="flex items-center gap-1 text-[10px] font-medium text-amber-400 hover:text-amber-300 bg-amber-400/10 hover:bg-amber-400/20 border border-amber-400/20 rounded px-1.5 py-0.5 transition-colors"
                      title="Log a manual trade"
                    >
                      <PenLine className="h-2.5 w-2.5" /> Log Trade
                    </button>
                  </div>
                </div>
                <div className="prog-track">
                  <div className="prog-fill" style={{
                    width: `${Math.max(0, Math.min(100, weekProgressPct))}%`,
                    background: weekProgressPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' :
                                weekProgressPct >= 60  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                                                         'linear-gradient(90deg,#ef4444,#f87171)',
                  }} />
                </div>
                <div className="flex gap-3 text-[10px] text-gray-500 mt-1">
                  <span className="text-emerald-400/80">{dailySummary?.weekWins ?? 0}W</span>
                  <span className="text-red-400/80">{dailySummary?.weekLosses ?? 0}L</span>
                  <span>{dailySummary?.weekWinRate ?? 0}% win rate</span>
                  {weekProgressPct < 100 && <span className="text-amber-400/70 ml-auto">${Math.max(0, weeklyTarget - weekClosedProfit).toFixed(2)} to go</span>}
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Link href="/weekly-strategy" className="flex-1">
                  <div className="smart-card px-3 py-2.5 cursor-pointer hover:border-amber-500/30 transition-colors flex items-center gap-2">
                    <Target className="h-4 w-4 text-amber-400 shrink-0" />
                    <span className="text-amber-400/80 text-xs font-medium">Set your weekly profit goal →</span>
                  </div>
                </Link>
                <button
                  onClick={() => setShowManualTradeDialog(true)}
                  className="smart-card px-3 py-2.5 flex items-center gap-1.5 text-[11px] font-medium text-amber-400 hover:border-amber-500/30 transition-colors"
                >
                  <PenLine className="h-3.5 w-3.5" /> Log Trade
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Hero Status Card ─────────────────────────────────────────── */}
        <div className="hero-card mb-5">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="icon-box-lg icon-box-red">
                <Bot className="h-6 w-6" />
              </div>
              <div>
                <p className="text-white font-black text-base leading-tight">VEDD AI ENGINE</p>
                <p className="stat-lbl">Autonomous trading system</p>
              </div>
            </div>
            <span className={`status-pill ${ssEngineRunning ? 'status-online' : 'status-offline'}`}>
              {ssEngineRunning ? (
                <>
                  <span className="live-pulse" />
                  ACTIVE
                </>
              ) : 'OFFLINE'}
            </span>
          </div>

          {/* Today + Weekly P&L — always shows from MT5 data, no strategy required */}
          <Link href="/weekly-strategy">
            <div className="rounded-2xl p-3 mb-3 cursor-pointer hover:opacity-90 transition-opacity" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-white text-xs font-semibold">Today's Profit</p>
                <span className="flex items-center gap-1">
                  {dailyTarget > 0 && (
                    <span className="text-[10px] text-gray-500">target ${dailyTarget.toFixed(0)}</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                </span>
              </div>
              <div className="flex items-end gap-2 mb-2">
                <span className={`text-2xl font-black leading-none ${todayClosedProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {`${todayClosedProfit >= 0 ? '+' : ''}$${Math.abs(todayClosedProfit).toFixed(2)}`}
                </span>
                {unrealizedPnL !== 0 && (
                  <span className="text-xs text-yellow-400/70 mb-0.5">
                    {unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)} open
                  </span>
                )}
              </div>
              {dailyTarget > 0 && (
                <div className="prog-track mb-1.5">
                  <div className="prog-fill" style={{
                    width: `${dayProgressPct}%`,
                    background: dayProgressPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' :
                                dayProgressPct >= 60  ? 'linear-gradient(90deg,#06b6d4,#22d3ee)' :
                                                        'linear-gradient(90deg,#ef4444,#f87171)',
                  }} />
                </div>
              )}
              <div className="flex gap-3 text-[11px] text-gray-500">
                <span>{todayTrades} trades</span>
                <span>{todayWinRate}% wins</span>
                {openPositions > 0 ? <span className="text-yellow-400/70">{openPositions} open</span> : null}
              </div>
            </div>
          </Link>

          {/* Weekly Goal bar */}
          <Link href="/weekly-strategy">
            <div className="rounded-2xl p-3 mb-4 cursor-pointer hover:opacity-90 transition-opacity" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-white text-xs font-semibold">Weekly Goal</p>
                <span className="text-[10px] text-gray-500">
                  {weeklyTarget > 0 ? `$${weekClosedProfit.toFixed(2)} / $${weeklyTarget}` : 'No target set'}
                </span>
              </div>
              <div className="prog-track mb-1.5">
                <div className="prog-fill" style={{
                  width: `${Math.min(100, weekProgressPct)}%`,
                  background: weekProgressPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' :
                              weekProgressPct >= 60  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                                                       'linear-gradient(90deg,#ef4444,#f87171)',
                }} />
              </div>
              <div className="flex gap-3 text-[11px] text-gray-500">
                <span className="text-emerald-400/80">+{dailySummary?.weekWins ?? 0}W</span>
                <span className="text-red-400/80">-{dailySummary?.weekLosses ?? 0}L</span>
                <span>{dailySummary?.weekWinRate ?? 0}% win rate</span>
                {dailySummary?.bestTrade != null && dailySummary.bestTrade > 0 && <span className="text-emerald-400/60 ml-auto">Best: +${dailySummary.bestTrade.toFixed(2)}</span>}
                {!dailySummary?.hasStrategy && <span className="text-amber-400/70">Set up weekly plan →</span>}
              </div>
            </div>
          </Link>

          {/* ── VEDD SS AI EA Guidance ──────────────────────────────────── */}
          {weeklyGuidance && (
            <div className="bg-gray-900/60 border border-purple-700/30 rounded-xl p-4 mb-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  VEDD SS AI EA Guidance
                  {weeklyGuidance.aiPathActive && (
                    <span className="text-[9px] bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded px-1.5 py-0.5 font-bold">
                      {weeklyGuidance.aiPathType} PATH
                    </span>
                  )}
                </h3>
                <span className="text-[10px] text-gray-600">{new Date(weeklyGuidance.lastUpdated).toLocaleTimeString()}</span>
              </div>

              {weeklyGuidance.goalAcceleration && (
                <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 mb-3">
                  <p className="text-orange-300 text-xs font-semibold mb-1">Goal Acceleration</p>
                  <p className="text-gray-300 text-xs leading-relaxed">{weeklyGuidance.goalAcceleration}</p>
                </div>
              )}

              {weeklyGuidance.weeklyIssues?.length > 0 && (
                <div className="mb-3">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">This Week's Issues</p>
                  <div className="space-y-1">
                    {weeklyGuidance.weeklyIssues.slice(0, 3).map((issue: string, i: number) => (
                      <div key={i} className="flex items-start gap-2 bg-red-500/8 border border-red-500/20 rounded px-2.5 py-1.5">
                        <span className="text-red-400 text-xs mt-0.5 shrink-0">•</span>
                        <p className="text-gray-300 text-xs leading-snug">{issue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 mb-3">
                {weeklyGuidance.topPairs?.length > 0 && (
                  <div className="bg-emerald-500/8 border border-emerald-500/20 rounded-lg p-2">
                    <p className="text-[10px] text-emerald-400 font-semibold mb-1">Focus Pairs</p>
                    <div className="flex flex-wrap gap-1">
                      {weeklyGuidance.topPairs.map((p: string) => (
                        <span key={p} className="text-[10px] bg-emerald-500/20 text-emerald-300 rounded px-1.5 py-0.5 font-mono">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {weeklyGuidance.avoidPairs?.length > 0 && (
                  <div className="bg-red-500/8 border border-red-500/20 rounded-lg p-2">
                    <p className="text-[10px] text-red-400 font-semibold mb-1">Avoid This Week</p>
                    <div className="flex flex-wrap gap-1">
                      {weeklyGuidance.avoidPairs.map((p: string) => (
                        <span key={p} className="text-[10px] bg-red-500/20 text-red-300 rounded px-1.5 py-0.5 font-mono">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {weeklyGuidance.brainInsights?.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Brain Insights</p>
                  <div className="space-y-1">
                    {weeklyGuidance.brainInsights.slice(0, 3).map((insight: string, i: number) => (
                      <p key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                        <span className="text-purple-500 shrink-0">›</span>{insight}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {!weeklyGuidance.weeklyIssues?.length && !weeklyGuidance.goalAcceleration && (
                <p className="text-gray-600 text-xs text-center py-2">Run brain learning and log trades to get guidance</p>
              )}
            </div>
          )}

          {/* ── MT5 / TL Decision Feed ──────────────────────────────────── */}
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden mb-4">
            <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
              <h3 className="text-white font-bold text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-400" />
                MT5 / TL Decision Feed
                {(decisionFeed?.openCount ?? 0) > 0 && (
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 animate-pulse">
                    ● {decisionFeed.openCount} OPEN
                  </span>
                )}
              </h3>
              <div className="flex items-center gap-2">
                {(decisionFeed?.unrealizedPnL ?? 0) !== 0 && (
                  <span className={`text-xs font-bold ${(decisionFeed?.unrealizedPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(decisionFeed?.unrealizedPnL ?? 0) >= 0 ? '+' : ''}${(decisionFeed?.unrealizedPnL ?? 0).toFixed(2)} unrealized
                  </span>
                )}
                <span className="text-[10px] text-gray-600">Live · 8s</span>
              </div>
            </div>

            {(!decisionFeed?.events?.length) ? (
              <div className="px-4 py-6 text-center">
                <Activity className="w-8 h-8 mx-auto text-gray-700 mb-2" />
                <p className="text-gray-600 text-xs">Waiting for trades from MT5 and TradeLocker…</p>
                <p className="text-gray-700 text-[10px] mt-1">Trades appear here as they execute</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-800/50 max-h-72 overflow-y-auto">
                {decisionFeed.events.slice(0, 15).map((ev: any) => {
                  const typeColor = ev.type === 'TRADE' ? (ev.result === 'WIN' ? 'text-emerald-400' : ev.result === 'LOSS' ? 'text-red-400' : 'text-gray-400')
                    : ev.type === 'OPEN' ? 'text-yellow-400'
                    : ev.type === 'BLOCKED' ? 'text-red-500'
                    : ev.type === 'SIGNAL' ? 'text-purple-400'
                    : 'text-gray-500';
                  const typeBg = ev.type === 'TRADE' ? (ev.result === 'WIN' ? 'bg-emerald-500/10' : ev.result === 'LOSS' ? 'bg-red-500/10' : 'bg-gray-700/20')
                    : ev.type === 'OPEN' ? 'bg-yellow-500/10'
                    : ev.type === 'BLOCKED' ? 'bg-red-500/10'
                    : 'bg-purple-500/10';
                  const typeLabel = ev.type === 'OPEN' ? 'OPEN' : ev.type === 'BLOCKED' ? 'BLOCKED' : ev.type === 'SIGNAL' ? 'SIGNAL' : ev.result || ev.type;
                  return (
                    <div key={ev.id} className={`flex items-center gap-3 px-4 py-2.5 ${typeBg}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-xs font-bold font-mono">{ev.symbol}</span>
                          <span className={`text-[10px] font-bold ${ev.direction === 'BUY' ? 'text-emerald-400' : ev.direction === 'SELL' ? 'text-red-400' : 'text-gray-400'}`}>{ev.direction}</span>
                          {ev.confidence != null && <span className="text-[10px] text-gray-500">{ev.confidence}%</span>}
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${typeColor}`}>{typeLabel}</span>
                        </div>
                        {ev.reason && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{ev.reason}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        {ev.profit != null && (
                          <p className={`text-xs font-bold ${ev.profit > 0 ? 'text-emerald-400' : ev.profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {ev.profit > 0 ? '+' : ''}${ev.profit.toFixed(2)}
                          </p>
                        )}
                        <p className="text-[9px] text-gray-600">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Unified Trade Performance (MT5 + TradeLocker, live) ───────── */}
          <div className="mb-4 space-y-3">
            <AiHealthStrip />
            <TradePerformanceCard />
            <TodayReviewPanel />
          </div>

          {/* ── Self-Learning Brain Card ─────────────────────────────────── */}
          {brainStatus && (
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 flex items-center gap-3 mb-4">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${brainStatus.learned ? 'bg-purple-500/20' : 'bg-gray-800'}`}>
                <Brain className={`w-4 h-4 ${brainStatus.learned ? 'text-purple-400' : 'text-gray-600'}`} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold">
                  Self-Learning Brain
                  {brainStatus.learned ? (
                    <span className="ml-2 text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full">ACTIVE</span>
                  ) : (
                    <span className="ml-2 text-[9px] bg-gray-700 text-gray-500 px-1.5 py-0.5 rounded-full">NOT TRAINED</span>
                  )}
                </p>
                <p className="text-gray-500 text-[10px] mt-0.5">
                  {brainStatus.learned
                    ? `${brainStatus.totalTradesAnalyzed ?? 0} trades analyzed · ${Array.isArray(brainStatus.pairsLearned) ? brainStatus.pairsLearned.length : (brainStatus.pairsLearned ?? 0)} pairs`
                    : 'Go to Weekly Strategy → Brain tab to train'
                  }
                </p>
              </div>
              {brainStatus.learned && brainStatus.lastLearned && (
                <span className="text-[9px] text-gray-600 shrink-0">
                  {Math.round((Date.now() - new Date(brainStatus.lastLearned).getTime()) / 60000)}m ago
                </span>
              )}
            </div>
          )}

          {/* ── SS AI Engine All-Time Scoreboard ──────────────────────── */}
          {(dailySummary?.allTimeTrades ?? 0) > 0 && (
            <div className="rounded-2xl p-3 mb-4" style={{ background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.18)' }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-pulse" />
                  <p className="text-white text-xs font-semibold">SS AI Engine — All-Time Record</p>
                </div>
                <span className={`text-xs font-bold ${(dailySummary?.allTimePnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {(dailySummary?.allTimePnL ?? 0) >= 0 ? '+' : ''}${(dailySummary?.allTimePnL ?? 0).toFixed(2)}
                </span>
              </div>
              {/* Win / Loss / Breakeven bar */}
              <div className="flex h-2 rounded-full overflow-hidden mb-2 gap-0.5">
                {(dailySummary?.allTimeWins ?? 0) > 0 && (
                  <div className="rounded-l-full" style={{
                    width: `${Math.round(((dailySummary?.allTimeWins ?? 0) / (dailySummary?.allTimeTrades ?? 1)) * 100)}%`,
                    background: 'linear-gradient(90deg,#10b981,#34d399)'
                  }} />
                )}
                {(dailySummary?.allTimeBreakeven ?? 0) > 0 && (
                  <div style={{
                    width: `${Math.round(((dailySummary?.allTimeBreakeven ?? 0) / (dailySummary?.allTimeTrades ?? 1)) * 100)}%`,
                    background: '#6b7280'
                  }} />
                )}
                {(dailySummary?.allTimeLosses ?? 0) > 0 && (
                  <div className="rounded-r-full" style={{
                    width: `${Math.round(((dailySummary?.allTimeLosses ?? 0) / (dailySummary?.allTimeTrades ?? 1)) * 100)}%`,
                    background: 'linear-gradient(90deg,#ef4444,#f87171)'
                  }} />
                )}
              </div>
              {/* Stats row */}
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-white text-sm font-bold">{dailySummary?.allTimeTrades ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Trades</p>
                </div>
                <div>
                  <p className="text-emerald-400 text-sm font-bold">{dailySummary?.allTimeWins ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Wins</p>
                </div>
                <div>
                  <p className="text-red-400 text-sm font-bold">{dailySummary?.allTimeLosses ?? 0}</p>
                  <p className="text-[10px] text-gray-500">Losses</p>
                </div>
                <div>
                  <p className="text-violet-400 text-sm font-bold">{dailySummary?.allTimeWinRate ?? 0}%</p>
                  <p className="text-[10px] text-gray-500">Win Rate</p>
                </div>
              </div>
              {/* Today snapshot */}
              {(dailySummary?.todayTrades ?? 0) > 0 && (
                <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">Today</span>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-emerald-400">+{dailySummary?.todayWins ?? 0}W</span>
                    <span className="text-red-400">-{dailySummary?.todayLosses ?? 0}L</span>
                    <span className={`font-semibold ${(dailySummary?.todayClosedProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(dailySummary?.todayClosedProfit ?? 0) >= 0 ? '+' : ''}${(dailySummary?.todayClosedProfit ?? 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
              {/* Unrealized open positions */}
              {(dailySummary?.unrealizedPnL ?? 0) !== 0 && (
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-[10px] text-gray-500">{dailySummary?.openPositions ?? 0} open position{(dailySummary?.openPositions ?? 0) !== 1 ? 's' : ''}</span>
                  <span className={`text-[10px] font-semibold ${(dailySummary?.unrealizedPnL ?? 0) >= 0 ? 'text-yellow-400' : 'text-orange-400'}`}>
                    Unrealized: {(dailySummary?.unrealizedPnL ?? 0) >= 0 ? '+' : ''}${(dailySummary?.unrealizedPnL ?? 0).toFixed(2)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Markov Probability Card — shown when engine is running ── */}
          {ssEngineStatus?.status === 'running' && markovData && markovData.overview.length > 0 && (
            <Link href="/weekly-strategy?tab=monitor">
              <div className="rounded-2xl p-3 mb-4 cursor-pointer hover:border-purple-500/40 transition-colors" style={{ background: 'rgba(168,85,247,0.05)', border: '1px solid rgba(168,85,247,0.2)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                    <p className="text-white text-xs font-semibold">🎲 Markov Probability</p>
                  </div>
                  <span className="text-[10px] text-purple-400 font-bold">{markovData.overview.length} pairs</span>
                </div>
                <div className="space-y-1">
                  {markovData.overview.slice(0, 4).map((m: any) => {
                    const edge = m.bullishProbability - m.bearishProbability;
                    const bias = edge >= 10 ? 'text-emerald-400' : edge <= -10 ? 'text-red-400' : 'text-gray-400';
                    const stateIcon =
                      m.currentState === 'STRONG_BULL' ? '▲▲' :
                      m.currentState === 'BULL'        ? '▲' :
                      m.currentState === 'STRONG_BEAR' ? '▼▼' :
                      m.currentState === 'BEAR'        ? '▼' : '─';
                    return (
                      <div key={m.symbol} className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400 font-mono w-16">{m.symbol}</span>
                        <span className={`w-5 text-center font-bold ${bias}`}>{stateIcon}</span>
                        <div className="flex-1 mx-2 h-1.5 bg-gray-800 rounded-full overflow-hidden flex">
                          <div className="h-full bg-emerald-500/70 rounded-l-full" style={{ width: `${m.bullishProbability}%` }} />
                          <div className="h-full bg-red-500/70 rounded-r-full" style={{ width: `${m.bearishProbability}%` }} />
                        </div>
                        <span className={`font-bold w-10 text-right ${bias}`}>{edge > 0 ? '+' : ''}{edge}%</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Link>
          )}

          {/* ── Polymarket BTC Sentiment Card ─────────────────────────────── */}
          {polymarketData && !polymarketData.error && polymarketData.markets?.length > 0 && (
            <a href="https://polymarket.com/markets/crypto/bitcoin" target="_blank" rel="noopener noreferrer">
              <div className="rounded-2xl p-3 mb-4 cursor-pointer hover:border-yellow-500/40 transition-colors" style={{ background: 'rgba(234,179,8,0.05)', border: '1px solid rgba(234,179,8,0.2)' }}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">🏦</span>
                    <p className="text-white text-xs font-semibold">Polymarket BTC Sentiment</p>
                  </div>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    polymarketData.overallBullishScore >= 60 ? 'bg-emerald-500/20 text-emerald-400' :
                    polymarketData.overallBullishScore <= 40 ? 'bg-red-500/20 text-red-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>{polymarketData.sentimentLabel}</span>
                </div>
                {/* Sentiment bar */}
                <div className="relative h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
                  <div className="absolute left-0 top-0 h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-700"
                    style={{ width: `${polymarketData.overallBullishScore}%` }} />
                  <div className="absolute left-1/2 top-0 h-full w-px bg-gray-600" />
                </div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-2">
                  <span>Bearish</span>
                  <span className={`font-bold ${polymarketData.overallBullishScore >= 55 ? 'text-emerald-400' : polymarketData.overallBullishScore <= 45 ? 'text-red-400' : 'text-gray-300'}`}>
                    {polymarketData.overallBullishScore}% Bullish
                  </span>
                  <span>Bullish</span>
                </div>
                {/* Top 3 markets */}
                <div className="space-y-1">
                  {polymarketData.markets.slice(0, 3).map((m: any) => (
                    <div key={m.id} className="flex items-center justify-between text-[11px]">
                      <span className="text-gray-400 truncate flex-1 mr-2" style={{ maxWidth: '65%' }}>{m.question}</span>
                      <span className={`font-bold shrink-0 ${m.direction === 'bullish' ? (m.yesProbability >= 55 ? 'text-emerald-400' : 'text-gray-400') : (m.yesProbability >= 55 ? 'text-red-400' : 'text-gray-400')}`}>
                        {m.yesProbability}% YES
                      </span>
                    </div>
                  ))}
                </div>
                <p className="text-[9px] text-gray-600 mt-1.5 text-right">
                  {polymarketData.markets.length} active markets · {polymarketData.fromCache ? 'cached' : 'live'} · polymarket.com ↗
                </p>
              </div>
            </a>
          )}

          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Analyses', value: isLoading ? '--' : String(totalAnalyses), color: 'text-white' },
              { label: 'Win Rate', value: isLoading ? '--' : `${accuracyRate}%`, color: 'text-emerald-400' },
              { label: 'Grade', value: userProfile?.tradeGrade ? String(userProfile.tradeGrade) : '--', color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={`stat-num-sm ${s.color}`}>{s.value}</p>
                <p className="stat-lbl mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* ── Ambassador Daily Action Reminder ─────────────────────────── */}
        {ambassadorJourney && !ambassadorJourney.isComplete && (
          <div className="mb-5 rounded-2xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.08) 0%, rgba(5,150,105,0.05) 100%)', border: '1px solid rgba(16,185,129,0.2)' }}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(16,185,129,0.1)' }}>
              <div className="flex items-center gap-2.5">
                <div className="icon-box-sm" style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.3)' }}>
                  <Rocket className="h-3.5 w-3.5 text-emerald-400" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">Day {ambassadorJourney.currentDay} — Today's Mission</p>
                  <p className="text-emerald-400/70 text-[11px]">{ambassadorJourney.streak > 0 ? `🔥 ${ambassadorJourney.streak}-day streak` : 'Free Path to Pro'} · {ambassadorJourney.tokensEarned} VEDD earned</p>
                </div>
              </div>
              <Link href="/ambassador/free-path">
                <button className="text-xs font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-1.5 hover:bg-emerald-500/20 transition-all flex items-center gap-1">
                  <CheckSquare className="h-3 w-3" /> Go
                </button>
              </Link>
            </div>
            {ambassadorJourney.todayActions ? (
              <div className="px-4 py-3 space-y-2">
                {([
                  { key: 'post' as const, label: 'POST', color: 'text-emerald-400', bg: 'bg-emerald-500/10', text: ambassadorJourney.todayActions.postIdea },
                  { key: 'dm' as const,   label: 'DM',   color: 'text-blue-400',    bg: 'bg-blue-500/10',    text: ambassadorJourney.todayActions.dmScript },
                  { key: 'comment' as const, label: 'FOCUS', color: 'text-amber-400', bg: 'bg-amber-500/10', text: ambassadorJourney.todayActions.focus },
                ]).map(({ key, label, color, bg, text }) => (
                  <button key={key}
                    onClick={() => toggleAmbassadorTodo(key)}
                    className={`w-full flex items-start gap-2.5 text-left transition-opacity ${ambassadorTodos[key] ? 'opacity-50' : ''}`}
                  >
                    <span className={`text-[10px] font-bold ${color} ${bg} rounded-lg px-2 py-1 shrink-0 mt-0.5 flex items-center gap-1`}>
                      {ambassadorTodos[key] ? '✓' : '○'} {label}
                    </span>
                    <p className={`text-xs leading-relaxed ${ambassadorTodos[key] ? 'line-through text-gray-600' : 'text-gray-300'}`}>{text}</p>
                  </button>
                ))}
                {Object.values(ambassadorTodos).every(Boolean) && (
                  <p className="text-[11px] text-emerald-400 font-bold pt-1">🎯 All done today! Streak maintained.</p>
                )}
                {ambassadorJourney.nextMilestone && (
                  <p className="text-[11px] text-gray-500 pt-1">Next milestone: Day {ambassadorJourney.nextMilestone.day} → {ambassadorJourney.nextMilestone.reward}</p>
                )}
              </div>
            ) : (
              <div className="px-4 py-3">
                <p className="text-gray-400 text-xs">Keep growing your audience and sharing your story today.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Quick Stats Row ───────────────────────────────────────────── */}
        <SectionHeader title="Quick Stats" open={showStats} onToggle={toggleStats} icon={BarChart2} iconClass="icon-box-red" />
        {showStats && (
        <div className="flex items-center gap-1 px-0.5 mb-1.5">
          <RefreshCw className="h-2.5 w-2.5 text-gray-600" />
          <span className="text-[10px] text-gray-600">
            Updated {quickStatsUpdatedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · refreshes every 90s
          </span>
        </div>
        )}
        {showStats && <div className="h-scroll mb-5">
          {/* Win Rate */}
          <div className="smart-card p-4 min-w-[130px] text-center">
            <p className="stat-lbl mb-2">Win Rate</p>
            <p className="stat-num text-grad-red" data-testid="text-accuracy-rate">
              {isLoading ? '--' : `${accuracyRate}%`}
            </p>
            <div className="prog-track mt-3">
              <div className="prog-fill bg-gradient-to-r from-rose-500 to-red-400" style={{ width: `${accuracyRate}%` }} />
            </div>
          </div>

          {/* Trade Grade */}
          <div className="smart-card p-4 min-w-[130px] text-center">
            <p className="stat-lbl mb-2">Trade Grade</p>
            <p className="stat-num text-grad-gold">
              {userProfile?.tradeGrade ? `${userProfile.tradeGrade}` : '--'}
            </p>
          </div>

          {/* Analyses Run */}
          <div className="smart-card p-4 min-w-[130px] text-center">
            <p className="stat-lbl mb-2">Analyses</p>
            <p className="stat-num text-grad-cyan">
              {isLoading ? '--' : totalAnalyses}
            </p>
          </div>

          {/* Achievements */}
          <div className="smart-card p-4 min-w-[130px] text-center">
            <p className="stat-lbl mb-2">Achievements</p>
            <p className="stat-num" style={{ background: 'linear-gradient(135deg,#c084fc,#a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
              {Array.isArray(userAchievements) ? userAchievements.filter((ua: any) => ua.isCompleted).length : 0}
            </p>
          </div>

          {/* Level badge */}
          {totalAchievementPoints > 0 && (
            <div className="smart-card p-4 min-w-[150px] text-center">
              <p className="stat-lbl mb-2">Trader Level</p>
              <p className="stat-num text-emerald-400">Lv.{getUserLevel(totalAchievementPoints).level}</p>
              <p className="text-[10px] text-gray-500 mt-1">{getUserLevel(totalAchievementPoints).title}</p>
              <div className="prog-track mt-2">
                <div className="prog-fill bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${getUserLevel(totalAchievementPoints).progress}%` }} />
              </div>
            </div>
          )}
        </div>}

        {/* ── AI Command Center ─────────────────────────────────────────── */}
        <SectionHeader title="AI Command Center" open={showAICenter} onToggle={toggleAICenter} icon={Cpu} iconClass="icon-box-purple" />
        {showAICenter && <div className="smart-card mb-5 overflow-hidden">
          <div className="flex items-center justify-between px-5 pt-4 pb-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-3">
              <div className="icon-box-sm icon-box-purple">
                <Cpu className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="text-white font-semibold text-sm">AI Command Center</p>
                <p className="stat-lbl">Live autonomous engines</p>
              </div>
            </div>
            <Link href="/weekly-strategy">
              <span className="text-xs font-medium rounded-xl px-3 py-1.5 bg-violet-500/10 text-violet-400 hover:bg-violet-500/15 transition-all cursor-pointer inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" /> Settings
              </span>
            </Link>
          </div>
          <div className="p-4">
            {bothLiveActive && (
              <div className="mb-3 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
                <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
                <p className="text-amber-300 text-xs">Both live engines active — SS Engine (Forex) and Sol Engine (Solana) trade different markets.</p>
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <Link href="/weekly-strategy" className="block">
                <div className={`rounded-2xl border p-3 h-full cursor-pointer transition-all hover:scale-[1.02] ${ssEngineRunning ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-white/[0.02] border-white/08'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`icon-tile-sm ${ssEngineRunning ? 'bg-emerald-500/20' : 'bg-white/5'}`}>
                      <Bot className={`h-4 w-4 ${ssEngineRunning ? 'text-emerald-400' : 'text-gray-500'}`} />
                    </div>
                    <span className={`status-pill ${ssEngineRunning ? 'status-pill-live' : 'status-pill-off'}`}>{ssEngineRunning ? 'ON' : 'IDLE'}</span>
                  </div>
                  <p className="text-white text-xs font-semibold">SS AI Engine</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Forex auto-trader</p>
                </div>
              </Link>
              <Link href="/weekly-strategy" className="block">
                <div className={`rounded-2xl border p-3 h-full cursor-pointer transition-all hover:scale-[1.02] ${brainLearned ? 'bg-violet-500/10 border-violet-500/30' : 'bg-white/[0.02] border-white/08'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`icon-tile-sm ${brainLearned ? 'bg-violet-500/20' : 'bg-white/5'}`}>
                      <Brain className={`h-4 w-4 ${brainLearned ? 'text-violet-400' : 'text-gray-500'}`} />
                    </div>
                    <span className={`status-pill ${brainLearned ? 'status-pill-live' : 'status-pill-warning'}`}>{brainLearned ? `${brainStatus?.pairsLearned ?? 0}P` : 'LRN'}</span>
                  </div>
                  <p className="text-white text-xs font-semibold">VEDD Brain</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Self-learning signals</p>
                </div>
              </Link>
              <Link href="/solana-scanner" className="block">
                <div className={`rounded-2xl border p-3 h-full cursor-pointer transition-all hover:scale-[1.02] ${solLiveActive ? 'bg-blue-500/10 border-blue-500/30' : solPaperActive ? 'bg-amber-500/10 border-amber-500/30' : 'bg-white/[0.02] border-white/08'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`icon-tile-sm ${solLiveActive ? 'bg-blue-500/20' : solPaperActive ? 'bg-amber-500/20' : 'bg-white/5'}`}>
                      <SiSolana className={`h-4 w-4 ${solLiveActive ? 'text-blue-400' : solPaperActive ? 'text-amber-400' : 'text-gray-500'}`} />
                    </div>
                    <span className={`status-pill ${solLiveActive ? 'status-pill-live' : solPaperActive ? 'status-pill-warning' : 'status-pill-off'}`}>{solLiveActive ? 'LIVE' : solPaperActive ? 'PAPER' : 'IDLE'}</span>
                  </div>
                  <p className="text-white text-xs font-semibold">Sol Engine</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Solana auto-trader</p>
                </div>
              </Link>
              <Link href="/market-sentiment" className="block">
                <div className={`rounded-2xl border p-3 h-full cursor-pointer transition-all hover:scale-[1.02] ${ssEngineRunning ? 'bg-rose-500/10 border-rose-500/30' : 'bg-white/[0.02] border-white/08'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`icon-tile-sm ${ssEngineRunning ? 'bg-rose-500/20' : 'bg-white/5'}`}>
                      <Newspaper className={`h-4 w-4 ${ssEngineRunning ? 'text-rose-400' : 'text-gray-500'}`} />
                    </div>
                    <span className={`status-pill ${ssEngineRunning ? 'status-pill-live' : 'status-pill-warning'}`}>{ssEngineRunning ? 'LIVE' : 'IDLE'}</span>
                  </div>
                  <p className="text-white text-xs font-semibold">News & Events</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Sentiment alerts</p>
                </div>
              </Link>
              <Link href="/volatility-meter" className="block">
                <div className={`rounded-2xl border p-3 h-full cursor-pointer transition-all hover:scale-[1.02] ${breakoutMonitorOn ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-white/[0.02] border-white/08'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className={`icon-tile-sm ${breakoutMonitorOn ? 'bg-cyan-500/20' : 'bg-white/5'}`}>
                      <Radio className={`h-4 w-4 ${breakoutMonitorOn ? 'text-cyan-400' : 'text-gray-500'}`} />
                    </div>
                    <span className={`status-pill ${breakoutMonitorOn ? 'status-pill-live' : 'status-pill-off'}`}>{breakoutMonitorOn ? 'ON' : 'IDLE'}</span>
                  </div>
                  <p className="text-white text-xs font-semibold">Breakout Monitor</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Session breakouts</p>
                </div>
              </Link>
            </div>
          </div>
        </div>}

        {/* ── Feature Tiles Grid ────────────────────────────────────────── */}
        <div className="mb-5">
          <SectionHeader title="Trading Tools" open={showTradingTools} onToggle={toggleTradingTools} icon={TrendingUp} iconClass="icon-box-red" />
          {showTradingTools && <div className="grid grid-cols-2 gap-3 mb-5">
            <Link href="/analysis" className="device-tile device-tile-red">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-red">
                  <BarChart2 className="h-5 w-5" />
                </div>
                <span className="status-pill status-offline" style={{ fontSize: '10px', padding: '2px 7px' }}>Active</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Analysis</p>
                <p className="text-gray-500 text-xs mt-0.5">AI chart analysis</p>
              </div>
            </Link>
            <Link href="/weekly-strategy" className="device-tile device-tile-red">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-red">
                  <TrendingUp className="h-5 w-5" />
                </div>
                <span className={`status-pill ${ssEngineRunning ? 'status-online' : 'status-offline'}`} style={{ fontSize: '10px', padding: '2px 7px' }}>{ssEngineRunning ? 'Live' : 'Idle'}</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Weekly Strategy</p>
                <p className="text-gray-500 text-xs mt-0.5">SS AI engine</p>
              </div>
            </Link>
            <Link href="/multi-timeframe" className="device-tile device-tile-amber">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-amber">
                  <Clock className="h-5 w-5" />
                </div>
                <span className="status-pill status-offline" style={{ fontSize: '10px', padding: '2px 7px' }}>—</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Multi-TF EA</p>
                <p className="text-gray-500 text-xs mt-0.5">Multi-timeframe EAs</p>
              </div>
            </Link>
            <Link href="/ea-marketplace" className="device-tile device-tile-amber">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-amber">
                  <Zap className="h-5 w-5" />
                </div>
                <span className="status-pill status-offline" style={{ fontSize: '10px', padding: '2px 7px' }}>—</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Marketplace</p>
                <p className="text-gray-500 text-xs mt-0.5">EA marketplace</p>
              </div>
            </Link>
          </div>}

          <SectionHeader title="AI & Data" open={showAIData} onToggle={toggleAIData} icon={Brain} iconClass="icon-box-cyan" />
          {showAIData && <div className="grid grid-cols-2 gap-3 mb-5">

            {/* ── SOL Bot Wallet Live Monitor (full-width) ── */}
            <div className="col-span-2">
              <Link href="/solana-scanner">
                <div className={`rounded-2xl border p-3 cursor-pointer transition-all hover:scale-[1.01] ${
                  solWalletStatus?.hasServerWallet
                    ? 'bg-emerald-500/8 border-emerald-500/35'
                    : 'bg-cyan-500/8 border-cyan-500/25'
                }`}>
                  {/* Header row */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="icon-box icon-box-cyan" style={{ width: 30, height: 30 }}>
                        <SiSolana className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-white font-semibold text-sm leading-tight">SOL Bot Monitor</p>
                        {solWalletStatus?.hasServerWallet && solWalletStatus.walletAddress ? (
                          <p className="text-[10px] font-mono text-emerald-400/80 leading-tight">
                            {solWalletStatus.walletAddress.slice(0, 6)}…{solWalletStatus.walletAddress.slice(-5)}
                          </p>
                        ) : (
                          <p className="text-[10px] text-gray-500 leading-tight">No bot wallet connected</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {solWalletStatus?.hasServerWallet && typeof solWalletStatus.balanceSol === 'number' && (
                        <div className="text-right">
                          <p className="text-emerald-400 font-bold text-sm leading-tight">{solWalletStatus.balanceSol.toFixed(4)} SOL</p>
                          <p className="text-[9px] text-gray-500 leading-tight">wallet balance</p>
                        </div>
                      )}
                      <span className={`status-pill ${solEngineRunning && solLiveActive ? 'status-online' : solEngineRunning ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'status-offline'}`}
                        style={{ fontSize: '10px', padding: '2px 7px' }}>
                        {solEngineRunning && solLiveActive ? '● Live' : solEngineRunning ? '◐ Paper' : '○ Idle'}
                      </span>
                    </div>
                  </div>

                  {/* Stats grid */}
                  {solAutoPositions?.autoTradeStats ? (() => {
                    const stats = solAutoPositions.autoTradeStats;
                    const winRate = stats.totalTrades > 0 ? Math.round((stats.wins / stats.totalTrades) * 100) : 0;
                    const weeklyProfit = solEngineStatus?.weeklyGoal?.currentProfitSol ?? 0;
                    const openLive = (solAutoPositions.livePositions || []).filter(p => p.status === 'open').length;
                    const openPaper = (solAutoPositions.paperPositions || []).filter(p => p.status === 'open').length;
                    const totalPnl = stats.totalPnlPct;
                    return (
                      <div>
                        <div className="grid grid-cols-4 gap-2 mb-2">
                          <div className="rounded-lg bg-white/5 p-2 text-center">
                            <p className="text-white font-bold text-sm">{stats.totalTrades}</p>
                            <p className="text-gray-500 text-[9px]">Trades</p>
                          </div>
                          <div className="rounded-lg bg-white/5 p-2 text-center">
                            <p className={`font-bold text-sm ${winRate >= 60 ? 'text-emerald-400' : winRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{winRate}%</p>
                            <p className="text-gray-500 text-[9px]">Win Rate</p>
                          </div>
                          <div className="rounded-lg bg-white/5 p-2 text-center">
                            <p className={`font-bold text-sm ${totalPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(1)}%
                            </p>
                            <p className="text-gray-500 text-[9px]">Total P&L</p>
                          </div>
                          <div className="rounded-lg bg-white/5 p-2 text-center">
                            <p className={`font-bold text-sm ${weeklyProfit >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
                              {weeklyProfit >= 0 ? '+' : ''}{weeklyProfit.toFixed(3)}
                            </p>
                            <p className="text-gray-500 text-[9px]">Wk SOL</p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] text-gray-400">
                              <span className="text-emerald-400 font-semibold">{stats.wins}W</span>
                              {' / '}
                              <span className="text-red-400 font-semibold">{stats.losses}L</span>
                            </span>
                            {openLive > 0 && (
                              <span className="text-[10px] text-amber-400">● {openLive} live open</span>
                            )}
                            {openPaper > 0 && (
                              <span className="text-[10px] text-cyan-400/70">◐ {openPaper} paper open</span>
                            )}
                            {stats.bestTradePct > 0 && (
                              <span className="text-[10px] text-gray-500">best +{stats.bestTradePct.toFixed(1)}%</span>
                            )}
                          </div>
                          <span className="text-[10px] text-cyan-400/60 flex items-center gap-1">
                            Open <ChevronRight className="h-3 w-3" />
                          </span>
                        </div>
                      </div>
                    );
                  })() : (
                    <div className="flex items-center justify-between">
                      <p className="text-gray-500 text-xs">
                        {solWalletStatus?.hasServerWallet
                          ? 'Start the engine to begin auto-trading'
                          : 'Add your bot wallet in SOL Scanner to enable auto-trading'}
                      </p>
                      <span className="text-[10px] text-cyan-400/60 flex items-center gap-1">
                        Open <ChevronRight className="h-3 w-3" />
                      </span>
                    </div>
                  )}
                </div>
              </Link>
            </div>
            <Link href="/mt5-chart-data" className="device-tile device-tile-cyan">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-cyan">
                  <Activity className="h-5 w-5" />
                </div>
                <span className="status-pill status-offline" style={{ fontSize: '10px', padding: '2px 7px' }}>—</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">MT5 Data</p>
                <p className="text-gray-500 text-xs mt-0.5">Live chart data</p>
              </div>
            </Link>
            <Link href="/what-if" className="device-tile device-tile-purple">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-purple">
                  <Lightbulb className="h-5 w-5" />
                </div>
                <span className="status-pill status-offline" style={{ fontSize: '10px', padding: '2px 7px' }}>—</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">What If</p>
                <p className="text-gray-500 text-xs mt-0.5">Scenario analysis</p>
              </div>
            </Link>
            <Link href="/historical" className="device-tile device-tile-purple">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-purple">
                  <Info className="h-5 w-5" />
                </div>
                <span className="status-pill status-offline" style={{ fontSize: '10px', padding: '2px 7px' }}>—</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">Historical</p>
                <p className="text-gray-500 text-xs mt-0.5">Past analyses</p>
              </div>
            </Link>
          </div>}

          <SectionHeader title="Community & Growth" open={showCommunity} onToggle={toggleCommunity} icon={Users} iconClass="icon-box-purple" />
          {showCommunity && <div className="smart-card mb-5">
            {[
              { href: '/community', icon: Users, color: 'icon-box-purple', name: 'Community', desc: 'Traders hub' },
              { href: '/ambassador/recruitment', icon: Sparkles, color: 'icon-box-purple', name: 'Ambassador', desc: 'Recruitment hub' },
              { href: '/referral', icon: Smile, color: 'icon-box-amber', name: 'Referral Hub', desc: 'Earn referrals' },
              { href: '/ambassador/recruitment?tab=leadpages', icon: Power, color: 'icon-box-amber', name: 'My Lead Page', desc: 'Custom lead page' },
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="list-row">
                  <span className={`icon-box-sm ${item.color}`}>
                    <item.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold">{item.name}</p>
                    <p className="text-gray-500 text-xs">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-600 shrink-0" />
                </div>
              </Link>
            ))}
          </div>}

          <SectionHeader title="Finance" open={showFinance} onToggle={toggleFinance} icon={Coins} iconClass="icon-box-amber" />
          {showFinance && <div className="smart-card mb-5">
            {[
              { href: '/token-investments', icon: Coins, color: 'icon-box-amber', name: 'Token Invest', desc: 'Token investments' },
              { href: '/vedd-wallet', icon: CalendarCheck, color: 'icon-box-green', name: 'Wallet', desc: 'VEDD wallet' },
              { href: '/achievements', icon: Trophy, color: 'icon-box-green', name: 'Achievements', desc: 'Your rewards' },
              { href: '/grants', icon: Newspaper, color: 'icon-box-blue', name: 'Grants & Funding', desc: 'Funding opportunities' },
              ...((user as any)?.isAdmin ? [{ href: '/admin/vedd-pool', icon: Coins, color: 'icon-box-purple', name: 'Token Distribution', desc: 'Admin: verify & send VEDD' }] : []),
            ].map((item) => (
              <Link key={item.href} href={item.href}>
                <div className="list-row">
                  <span className={`icon-box-sm ${item.color}`}>
                    <item.icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold">{item.name}</p>
                    <p className="text-gray-500 text-xs">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-600 shrink-0" />
                </div>
              </Link>
            ))}
          </div>}
        </div>

        {/* ── MT5 Pairs + Recent Analyses ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          {/* Connected Pairs */}
          <div className="smart-card p-4">
            <p className="stat-lbl mb-3">Connected MT5 Pairs</p>
            <ConnectedPairs />
          </div>

          {/* Recent Analyses */}
          <div className="smart-card p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="stat-lbl">Recent Analyses</p>
              <Link href="/historical">
                <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white text-xs rounded-xl h-7 px-3 border border-white/05 hover:border-rose-500/30 hover:bg-rose-500/10">
                  View All <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
            {isLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-white/10 border-t-rose-500 rounded-full animate-spin" />
              </div>
            ) : analyses?.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <BarChart2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No analyses yet</p>
                <Link href="/analysis">
                  <Button size="sm" className="mt-3 bg-rose-500/20 text-rose-400 border border-rose-500/30 hover:bg-rose-500/30 rounded-xl">
                    <Plus className="h-3 w-3 mr-1" /> Analyze Chart
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                {recentAnalyses.slice(0, 3).map((analysis) => (
                  <Link key={analysis.id} href={`/analysis/${analysis.id}`}>
                    <div className="flex items-center gap-3 p-3 rounded-2xl bg-white/[0.02] border border-white/05 hover:bg-white/[0.05] hover:border-rose-500/20 transition-all cursor-pointer group">
                      <div className="h-12 w-12 rounded-xl overflow-hidden border border-white/08 shrink-0 bg-gray-900 flex items-center justify-center">
                        <ChartThumb src={analysis.imageUrl} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-white text-sm font-medium truncate">{analysis.symbol || 'Unknown'}</span>
                          <span className={`status-pill ${analysis.direction?.toLowerCase() === 'buy' ? 'status-pill-live' : 'status-pill-warning'}`}>
                            {analysis.direction}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs mt-0.5">{analysis.timeframe} · {new Date(analysis.createdAt).toLocaleDateString()}</p>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-rose-400 transition-colors shrink-0" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Events section ────────────────────────────────────────────── */}
        <SectionHeader title="Events" open={showEvents} onToggle={toggleEvents} icon={CalendarCheck} iconClass="icon-box-amber" />
        {showEvents && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          {/* Upcoming Events */}
          <div className="smart-card p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="icon-tile-sm bg-amber-500/15">
                  <CalendarCheck className="h-4 w-4 text-amber-400" />
                </div>
                <p className="text-white text-sm font-semibold">Upcoming Events</p>
              </div>
              <Link href="/ambassador-training">
                <Button variant="ghost" size="sm" className="text-amber-400 text-xs hover:bg-amber-500/10 rounded-xl h-7 px-3">Browse</Button>
              </Link>
            </div>
            {upcomingEvents.length > 0 ? (
              <div className="space-y-2">
                {upcomingEvents.map((reg) => (
                  <div key={reg.event.id} className={`p-3 rounded-2xl border transition-colors ${reg.event.status === 'live' ? 'bg-red-500/08 border-red-500/30' : 'bg-white/[0.02] border-white/05'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {reg.event.status === 'live' && (
                            <span className="status-pill status-pill-live animate-pulse">LIVE</span>
                          )}
                          <h4 className="text-white text-sm font-medium truncate">{reg.event.title}</h4>
                        </div>
                        {reg.event.scheduledDate && (
                          <p className="text-gray-500 text-xs mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(reg.event.scheduledDate).toLocaleDateString()} · {new Date(reg.event.scheduledDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                      </div>
                      {reg.event.status === 'live' ? (
                        <Button size="sm" className="bg-red-600 hover:bg-red-500 text-white shrink-0 rounded-xl text-xs"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/ambassador/events/${reg.event.id}/stream`, { credentials: 'include' });
                              const data = await res.json();
                              if (data.meetingLink) window.open(data.meetingLink, '_blank');
                              else alert('Meeting link not available yet.');
                            } catch { alert('Failed to get stream link.'); }
                          }}>
                          <Video className="h-3 w-3 mr-1" /> Join
                        </Button>
                      ) : (
                        <span className="status-pill status-pill-live shrink-0">Registered</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <CalendarCheck className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No upcoming events</p>
              </div>
            )}
          </div>

          {/* Host Status */}
          <div className="smart-card p-4">
            {hostStats && (hostStats.totalEventsHosted > 0 || hostStats.upcomingEvents > 0) ? (
              <>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="icon-tile-sm bg-amber-500/15">
                      <Trophy className="h-4 w-4 text-amber-400" />
                    </div>
                    <div>
                      <p className="text-white text-sm font-semibold">Community Host</p>
                      <span className="status-pill status-pill-live text-[10px]">{hostStats.hostTier}</span>
                    </div>
                  </div>
                  <Link href="/host-dashboard">
                    <Button size="sm" className="bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 rounded-xl text-xs">Dashboard</Button>
                  </Link>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white/[0.03] rounded-2xl p-3 text-center">
                    <p className="text-xl font-bold text-amber-400">{hostStats.totalEventsHosted}</p>
                    <p className="stat-lbl text-[10px] mt-1">Events Hosted</p>
                  </div>
                  <div className="bg-white/[0.03] rounded-2xl p-3 text-center">
                    <p className="text-xl font-bold text-emerald-400">{hostStats.tokensEarned}</p>
                    <p className="stat-lbl text-[10px] mt-1">VEDD Earned</p>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 mb-3">
                  <div className="icon-tile-sm bg-purple-500/15">
                    <Video className="h-4 w-4 text-purple-400" />
                  </div>
                  <p className="text-white text-sm font-semibold">Event Recordings</p>
                </div>
                {registeredEventsData?.events?.some(reg => reg.event.status === 'completed') ? (
                  <div className="space-y-2">
                    {registeredEventsData.events.filter(reg => reg.event.status === 'completed').slice(0, 3).map((reg) => (
                      <div key={`rec-${reg.event.id}`} className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.02] border border-white/05">
                        <span className="text-white text-sm truncate flex-1 mr-2">{reg.event.title}</span>
                        <Button size="sm" variant="outline" className="border-purple-500/40 text-purple-300 hover:bg-purple-500/20 rounded-xl text-xs shrink-0"
                          onClick={async () => {
                            try {
                              const res = await fetch(`/api/ambassador/events/${reg.event.id}/recording`, { credentials: 'include' });
                              const data = await res.json();
                              if (data.recordingUrl) window.open(data.recordingUrl, '_blank');
                              else alert('Recording not available yet.');
                            } catch { alert('Recording not available yet.'); }
                          }}>
                          <Video className="h-3 w-3 mr-1" /> Watch
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <Video className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No recordings yet</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>}

        {/* ── Rewards + Clothing ────────────────────────────────────────── */}
        <SectionHeader title="Rewards & Clothing" open={showRewards} onToggle={toggleRewards} icon={Trophy} iconClass="icon-box-amber" />
        {showRewards && <div className="space-y-5 mb-6">
          {/* Daily Missions full-width */}
          <div className="smart-card p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="icon-tile-sm bg-amber-500/15">
                <Coins className="h-4 w-4 text-amber-400" />
              </div>
              <div>
                <p className="text-white text-sm font-semibold">Daily & Weekly Missions</p>
                <p className="text-[11px] text-gray-500">Complete tasks to earn VEDD tokens</p>
              </div>
            </div>
            <DailyMissions />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="smart-card p-4">
            <VeddRewardsPanel />
          </div>
          <div className="smart-card p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="icon-tile-sm bg-amber-500/15">
                <Shirt className="h-4 w-4 text-amber-400" />
              </div>
              <p className="text-white text-sm font-semibold">VEDD Clothing Rewards</p>
            </div>
            {wearStats && wearStats.totalClaims > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: 'Items', value: wearStats.totalClaims, color: 'text-amber-400' },
                    { label: 'VEDD Earned', value: `${wearStats.totalVeddEarned}`, color: 'text-yellow-400' },
                    { label: 'Pending', value: wearStats.pendingClaims, color: 'text-blue-400' },
                  ].map(s => (
                    <div key={s.label} className="text-center p-2 rounded-2xl bg-white/[0.03] border border-white/05">
                      <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
                      <p className="stat-lbl text-[10px] mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
                <Link href="/vedd-clothing">
                  <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold rounded-xl">
                    <QrCode className="w-3 h-3 mr-2" /> Claim Another Item
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="text-center py-3 space-y-3">
                <div className="icon-tile mx-auto bg-amber-500/10 border border-amber-500/15">
                  <Shirt className="w-6 h-6 text-amber-400/60" />
                </div>
                <div>
                  <p className="text-sm text-gray-300 font-medium">Earn 50 VEDD per item</p>
                  <p className="text-xs text-gray-500 mt-1">Buy VEDD clothing and scan the QR code</p>
                </div>
                <div className="flex gap-2">
                  <Link href="/vedd-clothing" className="flex-1">
                    <Button size="sm" className="w-full bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded-xl">
                      <QrCode className="w-3 h-3 mr-1" /> Scan Tag
                    </Button>
                  </Link>
                  <a href="https://replit.com/@goddren/VeddVerse?s=app" target="_blank" rel="noopener noreferrer" className="flex-1">
                    <Button size="sm" variant="outline" className="w-full border-amber-500/30 text-amber-400 text-xs hover:border-amber-500 rounded-xl">Shop</Button>
                  </a>
                </div>
              </div>
            )}
          </div>
          </div>{/* end inner grid */}
        </div>}

        {/* ── My Certifications ─────────────────────────────────────────── */}
        <SectionHeader title={`My Certifications${dashCerts.length > 0 ? ` (${dashCerts.length})` : ''}`} open={showCerts} onToggle={toggleCerts} icon={Award} iconClass="icon-box-amber" />
        {showCerts && (
          <div className="smart-card p-4 mb-6">
            {dashCerts.length === 0 ? (
              <div className="text-center py-8 space-y-3">
                <div className="icon-tile mx-auto bg-amber-500/10 border border-amber-500/15">
                  <GraduationCap className="w-6 h-6 text-amber-400/60" />
                </div>
                <div>
                  <p className="text-sm text-gray-300 font-medium">No certificates yet</p>
                  <p className="text-xs text-gray-500 mt-1">Complete a Workforce Academy course and pass the assessment to earn certificates</p>
                </div>
                <Link href="/workforce-academy">
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs rounded-xl">
                    <GraduationCap className="w-3 h-3 mr-1" /> Go to Academy
                  </Button>
                </Link>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
                  {dashCerts.map(cert => (
                    <div key={cert.certId} className="flex items-start gap-3 p-3 rounded-xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/8 transition-all">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center flex-shrink-0">
                        <Award className="w-5 h-5 text-amber-400" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-white leading-tight truncate">{cert.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] text-amber-400 font-mono">{cert.score}%</span>
                          <span className="text-[10px] text-gray-500">{new Date(cert.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                          {cert.ceuHours && <span className="text-[10px] text-indigo-400">{cert.ceuHours} CEU hrs</span>}
                        </div>
                        {cert.grantFrameworks && cert.grantFrameworks.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {cert.grantFrameworks.slice(0, 3).map(f => (
                              <span key={f} className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-400 border border-indigo-500/20">{f}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/workforce-academy">
                  <Button variant="outline" size="sm" className="w-full border-amber-500/25 text-amber-400 hover:bg-amber-500/10 text-xs rounded-xl">
                    <GraduationCap className="w-3 h-3 mr-1.5" /> View All Certificates & Earn More
                  </Button>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* ── Market + News ─────────────────────────────────────────────── */}
        <SectionHeader title="Market & News" open={showMarket} onToggle={toggleMarket} icon={Newspaper} iconClass="icon-box-blue" />
        {showMarket && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
          <div className="smart-card p-4">
            <MarketCalendar />
          </div>
          <div className="smart-card p-4">
            <NewsFeed showSentiment={true} maxItems={5} compact={false} />
          </div>
        </div>}

        {/* ── Daily Wisdom + Trading Coach ─────────────────────────────── */}
        {showFaithContent && (
          <div className="smart-card p-4 mb-6">
            <div className="flex justify-between items-center mb-3">
              <p className="stat-lbl">Daily Scripture Wisdom</p>
              <Button variant="ghost" size="sm" onClick={() => setShowFaithContent(false)}
                className="h-7 text-xs text-gray-400 rounded-xl px-3 border border-white/05 hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-white">Hide</Button>
            </div>
            <DailyWisdom />
          </div>
        )}
        {!showFaithContent && (
          <div className="smart-card p-4 mb-6">
            <Button variant="outline" onClick={() => setShowFaithContent(true)}
              className="w-full flex items-center justify-center bg-white/[0.02] border-white/08 text-white hover:bg-blue-600/20 hover:border-blue-500/40 transition-colors rounded-xl">
              <BiBook className="h-4 w-4 mr-2" /> Show Scripture Wisdom
            </Button>
          </div>
        )}

        <SectionHeader title="Trading Coach" open={showCoach} onToggle={toggleCoach} icon={Lightbulb} iconClass="icon-box-amber" />
        {showCoach && <div className="smart-card p-4 mb-6">
          {/* ABBA Personal AI Card */}
          <div className="rounded-2xl overflow-hidden mb-4" style={{ background: 'linear-gradient(135deg, #0a0a14 0%, #130a0a 100%)', border: '1px solid rgba(220,38,38,0.4)' }}>
            <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: '1px solid rgba(220,38,38,0.15)', background: 'rgba(220,38,38,0.06)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-[10px] font-bold tracking-widest text-red-400 uppercase">New Feature</span>
              <span className="ml-auto text-[10px] text-gray-600">Personal AI</span>
            </div>
            <div className="px-3 py-3 flex items-center gap-3">
              {/* Mini Arc Reactor */}
              <div className="relative w-10 h-10 flex-shrink-0">
                <div className="absolute inset-0 rounded-full animate-ping opacity-30" style={{ background: 'radial-gradient(circle, rgba(220,38,38,0.4) 0%, transparent 70%)' }} />
                <div className="absolute inset-0 rounded-full" style={{ background: 'linear-gradient(135deg, #1a0a0a 0%, #0d0d1a 100%)', border: '1.5px solid rgba(220,38,38,0.5)' }} />
                <div className="absolute rounded-full" style={{ inset: 3, border: '1px solid rgba(220,38,38,0.7)', boxShadow: '0 0 6px rgba(220,38,38,0.5)' }} />
                <div className="absolute rounded-full" style={{ inset: 12, background: 'radial-gradient(circle, #dc2626 0%, #7c3aed 100%)', boxShadow: '0 0 8px rgba(220,38,38,0.9)' }} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-base font-black tracking-widest" style={{ background: 'linear-gradient(90deg, #ef4444, #a855f7)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>ABBA</span>
                  <span className="text-[9px] bg-red-500 text-white px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">AI</span>
                </div>
                <p className="text-[11px] text-gray-500">Your personal fund manager AI — ask about pace, entries, or create a plan.</p>
              </div>
            </div>
            <div className="px-3 pb-3 grid grid-cols-3 gap-1.5">
              {[
                { label: 'Am I on pace?', icon: Target },
                { label: 'Best entry?', icon: TrendingUp },
                { label: 'Create plan', icon: Brain },
              ].map(({ label, icon: Icon }) => (
                <button
                  key={label}
                  onClick={() => window.dispatchEvent(new CustomEvent('open-ABBA'))}
                  className="flex flex-col items-center gap-1 py-2 px-1 rounded-xl text-center transition-all"
                  style={{ background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = 'rgba(220,38,38,0.4)')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(220,38,38,0.15)')}
                >
                  <Icon className="h-3.5 w-3.5 text-red-400" />
                  <span className="text-[10px] text-gray-400 font-medium leading-tight">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="h-[500px]">
            <TradingCoach personality="friendly" />
          </div>
        </div>}

        {/* ── Quick Actions ─────────────────────────────────────────────── */}
        <div className="smart-card p-4 mb-6">
          <p className="stat-lbl mb-3">Quick Actions</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {[
              { label: 'MT5 Copier', href: '/webhooks', color: 'text-blue-400', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
              { label: 'New Analysis', href: '/analysis', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
              { label: 'Volatility', href: '/volatility-meter', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' },
              { label: 'Pred. Game', href: '/market-trend-game', color: 'text-purple-400', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
              { label: 'Upgrade', href: '/subscription', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
            ].map(item => (
              <Link key={item.href} href={item.href}>
                <Button variant="outline" className={`w-full rounded-xl text-xs ${item.color} ${item.bg} ${item.border} hover:opacity-80 transition-all`}>
                  {item.label}
                </Button>
              </Link>
            ))}
          </div>
        </div>

      </div>

      {/* Manual Trade Dialog */}
      <ManualTradeDialog
        open={showManualTradeDialog}
        onClose={() => setShowManualTradeDialog(false)}
        onSaved={() => {
          syncProgressMutation.mutate();
        }}
      />

      {/* ══════════════════════════════════════════════════════════════════
          FEATURES HUB OVERLAY — full app navigation in one place
      ══════════════════════════════════════════════════════════════════ */}
      {showFeaturesHub && (
        <div className="fixed inset-0 z-50 flex items-start md:items-center justify-center md:justify-end" onClick={() => setShowFeaturesHub(false)}>
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Drawer panel — drops from the TOP on mobile so it's thumb-reachable and never hidden behind the tab bar */}
          <div
            className="relative z-10 w-full md:w-[420px] md:h-full md:max-h-screen overflow-y-auto rounded-b-3xl md:rounded-none md:rounded-l-3xl border-b md:border-b-0 md:border-l border-gray-700/60"
            style={{ background: '#0D1117', maxHeight: '88vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-4 border-b border-gray-800" style={{ background: '#0D1117' }}>
              <div>
                <h2 className="text-white font-black text-base">All Features</h2>
                <p className="text-gray-500 text-xs mt-0.5">Everything VEDD has to offer</p>
              </div>
              <button onClick={() => setShowFeaturesHub(false)} className="w-8 h-8 rounded-xl bg-gray-800 hover:bg-gray-700 flex items-center justify-center transition-colors">
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {[
                {
                  label: '🤖 AI Analysis', color: '#ef4444',
                  items: [
                    { name: 'Chart Analysis', path: '/analysis', desc: 'AI reads your charts', icon: '📊' },
                    { name: 'Multi-Timeframe', path: '/multi-timeframe', desc: 'Cross-TF confirmation', icon: '🔬' },
                    { name: 'Historical', path: '/historical', desc: 'Past analysis library', icon: '📚' },
                    { name: 'What-If Analysis', path: '/what-if', desc: 'Scenario simulator', icon: '🔮' },
                    { name: 'Market Insights', path: '/market-insights', desc: 'AI market read', icon: '🌐' },
                  ]
                },
                {
                  label: '⚡ Trading Engines', color: '#10b981',
                  items: [
                    { name: 'VEDD SS Engine', path: '/weekly-strategy', desc: 'AI forex engine', icon: '⚡', live: ssEngineRunning },
                    { name: 'ORB Breakout', path: '/orb-breakout', desc: 'Open-range scanner', icon: '🎯', live: breakoutMonitorOn },
                    { name: 'Abba AI Strategist', path: '/abba', desc: 'Weekly planning AI', icon: '🧠' },
                    { name: 'Copy Trading', path: '/copy-trading', desc: 'Mirror top traders', icon: '📋' },
                    { name: 'Solana Scanner', path: '/solana-scanner', desc: 'SOL token AI', icon: '◎' },
                    { name: 'Futures Connect', path: '/futures-connect', desc: 'Futures trading', icon: '📈' },
                  ]
                },
                {
                  label: '🤖 EAs & Bots', color: '#f59e0b',
                  items: [
                    { name: 'My EAs', path: '/my-eas', desc: 'Your saved expert advisors', icon: '💾' },
                    { name: 'EA Marketplace', path: '/ea-marketplace', desc: 'Download community EAs', icon: '🛒' },
                    { name: 'AI Trading Models', path: '/ai-trading-models', desc: 'AI-generated strategies', icon: '🧮' },
                    { name: 'Live Monitor', path: '/live-monitor', desc: 'Real-time engine watch', icon: '📡' },
                    { name: 'TradeLocker Accounts', path: '/webhooks#tradelocker', desc: 'Direct execution accounts', icon: '🔗' },
                    { name: 'Webhooks', path: '/webhooks', desc: 'Signal automation', icon: '🪝' },
                    { name: 'Mobile Alerts', path: '/mobile-alerts', desc: 'Push notifications', icon: '🔔' },
                  ]
                },
                {
                  label: '💰 Grow & Earn', color: '#a855f7',
                  items: [
                    { name: 'VEDD Wallet', path: '/vedd-wallet', desc: 'Your VEDD token balance', icon: '💎' },
                    { name: 'Account Growth', path: '/account-growth', desc: 'Growth plan builder', icon: '📈' },
                    { name: 'Referral Hub', path: '/referral', desc: 'Earn by referring', icon: '🎁' },
                    { name: 'Achievements', path: '/achievements', desc: 'Unlock badges', icon: '🏆' },
                    { name: 'Activity Hub', path: '/activity', desc: 'Daily missions & XP', icon: '🎮' },
                    { name: 'Streak Tracker', path: '/streak', desc: 'Daily login streaks', icon: '🔥' },
                  ]
                },
                {
                  label: '🌐 Community', color: '#22d3ee',
                  items: [
                    { name: 'Community', path: '/community', desc: 'Trader network', icon: '👥' },
                    { name: 'Social Hub', path: '/social-hub', desc: 'Share & engage', icon: '📱' },
                    { name: 'Blog', path: '/blog', desc: 'Trading insights', icon: '📝' },
                    { name: 'Market Sentiment', path: '/market-sentiment', desc: 'Crowd signal', icon: '🌡️' },
                  ]
                },
                {
                  label: '📚 Learn', color: '#84cc16',
                  items: [
                    { name: 'Daily Devotional', path: '/devotional', desc: 'Faith & trading wisdom', icon: '✝️' },
                    { name: 'Training Calendar', path: '/training-calendar', desc: 'Structured learning', icon: '📅' },
                    { name: 'Ambassador Training', path: '/ambassador-training', desc: '44-day challenge', icon: '🌟' },
                    { name: 'Workforce Academy', path: '/workforce-academy', desc: 'Earn certificates', icon: '🎓' },
                  ]
                },
              ].map(section => (
                <div key={section.label}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-2" style={{ color: section.color }}>{section.label}</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {section.items.map(item => (
                      <Link key={item.path} href={item.path}>
                        <div
                          onClick={() => setShowFeaturesHub(false)}
                          className="flex items-center gap-2.5 rounded-xl border border-gray-800 bg-gray-900/40 px-3 py-2.5 cursor-pointer hover:border-gray-600 hover:bg-gray-800/60 transition-all group"
                        >
                          <span className="text-base flex-shrink-0">{item.icon}</span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1">
                              <p className="text-xs font-semibold text-white group-hover:text-white leading-tight truncate">{item.name}</p>
                              {(item as any).live && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />}
                            </div>
                            <p className="text-[9px] text-gray-500 leading-tight truncate">{item.desc}</p>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}

              {/* Settings row */}
              <div className="pt-1 border-t border-gray-800 flex gap-2">
                {[
                  { name: 'Profile', path: '/profile', icon: '👤' },
                  { name: 'AI API Keys', path: '/ai-api-keys', icon: '🔑' },
                  { name: 'Subscription', path: '/subscription', icon: '💳' },
                  { name: 'MT5 Data', path: '/mt5-chart-data', icon: '📉' },
                ].map(item => (
                  <Link key={item.path} href={item.path}>
                    <div
                      onClick={() => setShowFeaturesHub(false)}
                      className="flex-1 flex flex-col items-center gap-1 rounded-xl border border-gray-800 bg-gray-900/30 px-3 py-2 cursor-pointer hover:border-gray-600 transition-all"
                    >
                      <span className="text-sm">{item.icon}</span>
                      <span className="text-[9px] text-gray-500 font-medium text-center">{item.name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;