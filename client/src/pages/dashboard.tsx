import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation } from '@tanstack/react-query';
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
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import VeddLogo from '@/components/ui/vedd-logo';
import { MarketCalendar } from '@/components/market/market-calendar';
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
  const [showFaithContent, setShowFaithContent] = useState<boolean>(true);

  const [showManualTradeDialog, setShowManualTradeDialog] = useState(false);

  // Section toggles — persisted in localStorage
  const [showStats, toggleStats] = useSectionToggle('stats');
  const [showAICenter, toggleAICenter] = useSectionToggle('ai_center');
  const [showTradingTools, toggleTradingTools] = useSectionToggle('trading_tools');
  const [showAIData, toggleAIData] = useSectionToggle('ai_data');
  const [showCommunity, toggleCommunity] = useSectionToggle('community');
  const [showFinance, toggleFinance] = useSectionToggle('finance');
  const [showEvents, toggleEvents] = useSectionToggle('events');
  const [showRewards, toggleRewards] = useSectionToggle('rewards');
  const [showMarket, toggleMarket] = useSectionToggle('market');
  const [showCoach, toggleCoach] = useSectionToggle('coach');

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
  
  const { data: analyses = [], isLoading, isError } = useQuery<Analysis[]>({
    queryKey: ['/api/analyses'],
  });
  
  // Get user achievements
  const { data: userAchievements = [] } = useQuery({
    queryKey: ['/api/user-achievements'],
    enabled: !!user
  });
  
  // Get all achievements
  const { data: achievements = [] } = useQuery({
    queryKey: ['/api/achievements'],
    enabled: !!user
  });
  
  // Get user profile for accuracy/winRate data
  const { data: userProfile } = useQuery<{ winRate?: number; tradeGrade?: number }>({
    queryKey: ['/api/profile', user?.id],
    enabled: !!user?.id
  });
  
  // Get user's registered events
  const { data: registeredEventsData } = useQuery<{ events: Array<{ event: { id: number; title: string; description: string; scheduledDate: string | null; status: string } }> }>({
    queryKey: ['/api/ambassador/community/my-events'],
    enabled: !!user
  });
  
  // Get host stats if user is a host
  const { data: hostStats } = useQuery<{ totalEventsHosted: number; upcomingEvents: number; hostTier: string; tokensEarned: number }>({
    queryKey: ['/api/ambassador/host/stats'],
    enabled: !!user
  });
  
  // Get events user is hosting
  const { data: hostedEventsData } = useQuery<Array<{ id: number; title: string; description: string; scheduledDate: string | null; status: string; attendeeCount?: number }>>({
    queryKey: ['/api/ambassador/host/my-events'],
    enabled: !!user
  });

  const { data: wearStats } = useQuery<{ totalClaims: number; totalVeddEarned: number; pendingClaims: number }>({
    queryKey: ['/api/wear-to-earn/stats'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // AI engine status queries
  const { data: ssEngineStatus } = useQuery<{ status: string; running?: boolean }>({
    queryKey: ['/api/vedd-live-engine/status'],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: solEngineStatus } = useQuery<{ running: boolean; autoTradeMode: string; autoTradeEnabled: boolean; liveTradeEnabled: boolean }>({
    queryKey: ['/api/sol-engine/status'],
    enabled: !!user,
    refetchInterval: 15000,
  });

  const { data: brainStatus } = useQuery<{ learned: boolean; totalTradesAnalyzed?: number; pairsLearned?: number }>({
    queryKey: ['/api/vedd-live-engine/brain-status'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  const { data: breakoutStatus } = useQuery<{ active: boolean; monitored?: number }>({
    queryKey: ['/api/mt5/breakout-status'],
    enabled: !!user,
    refetchInterval: 60000,
  });

  // Ambassador journey — current day + today's actions (ambassadors only)
  const { data: ambassadorJourney } = useQuery<{
    currentDay: number; streak: number; tokensEarned: number; isComplete: boolean;
    todayActions?: { postIdea: string; commentTarget: string; dmScript: string; focus: string };
    nextMilestone?: { day: number; reward: string };
  }>({
    queryKey: ['/api/ambassador/journey'],
    enabled: !!(user?.isAmbassador || (user as any)?.role === 'admin'),
  });

  // Daily & weekly P&L summary (works even without a strategy / SS AI)
  const { data: dailySummary } = useQuery<{
    todayClosedProfit: number; todayTotalProfit: number; todayTrades: number; todayWinRate: number;
    weekClosedProfit: number; weekTrades: number; weekWinRate: number;
    unrealizedPnL: number; openPositions: number;
    weeklyTarget: number; dailyTarget: number; weekProgressPct: number; dayProgressPct: number;
    hasStrategy: boolean;
  }>({
    queryKey: ['/api/mt5/daily-summary'],
    enabled: !!user,
    refetchInterval: 30000,
  });

  // Weekly strategy — same source the weekly plan page uses for live progress
  const { data: activeStrategy, refetch: refetchStrategy } = useQuery<{
    profitTarget: number; currentProfit: number; progressPercentage: number; hasStrategy: boolean;
    todayClosedProfit?: number; todayTotalProfit?: number; dailyTarget?: number;
    dayProgressPct?: number; unrealizedPnL?: number; openPositions?: number;
    todayTrades?: number; todayWinRate?: number;
  }>({
    queryKey: ['/api/weekly-strategy'],
    enabled: !!user,
    refetchInterval: 30000,
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
    if (!activeStrategy?.hasStrategy) return;
    syncProgressMutation.mutate();
    const interval = setInterval(() => syncProgressMutation.mutate(), 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeStrategy?.hasStrategy]);

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

  // TradeLocker connection + balance
  const { data: tlConnection } = useQuery<any>({
    queryKey: ['/api/tradelocker/connection'],
    enabled: !!user,
    refetchInterval: 60000,
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
    const b = (tlConnection as any)?.accountBalance ?? (tlConnection as any)?.balance ?? null;
    return b && b > 0 ? b : null;
  }, [tlConnection]);

  const tlEquity: number | null = React.useMemo(() => {
    return (tlConnection as any)?.equity ?? null;
  }, [tlConnection]);

  // Derive AI tool states
  const ssEngineRunning = ssEngineStatus?.status === 'running';
  const solEngineRunning = solEngineStatus?.running ?? false;
  const solAutoTradeMode = solEngineStatus?.autoTradeMode ?? 'off';
  const solLiveActive = solAutoTradeMode === 'live';
  const solPaperActive = solAutoTradeMode === 'paper';
  const brainLearned = brainStatus?.learned ?? false;
  const bothLiveActive = ssEngineRunning && solLiveActive;

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

  return (
    <div className="app-page">

      {/* ── Greeting Header ──────────────────────────────────────────────── */}
      <div className="px-4 md:px-6 pt-5 pb-3 container mx-auto">
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

      <div className="container mx-auto px-4 md:px-6">
        <AIKeyNudgeBanner />

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
                {tlBalance !== null && (
                  <Link href="/weekly-strategy">
                    <div className="flex-shrink-0 smart-card px-3 py-2 flex items-center gap-2 cursor-pointer hover:border-red-500/30 transition-colors min-w-[140px]">
                      <div className="icon-box-sm icon-box-purple">
                        <Wallet className="h-3.5 w-3.5" />
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 font-medium">TradeLocker</p>
                        <p className="text-white font-bold text-sm leading-none">${tlBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        {tlEquity != null && tlEquity !== tlBalance && (
                          <p className={`text-[10px] mt-0.5 ${tlEquity >= tlBalance ? 'text-emerald-400' : 'text-red-400'}`}>
                            Eq ${tlEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                )}
              </div>
            )}

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
                    width: `${Math.min(100, weekProgressPct)}%`,
                    background: weekProgressPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' :
                                weekProgressPct >= 60  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
                                                         'linear-gradient(90deg,#ef4444,#f87171)',
                  }} />
                </div>
                <div className="flex gap-3 text-[10px] text-gray-500 mt-1">
                  <span>{dailySummary?.weekTrades ?? 0} trades</span>
                  <span>{dailySummary?.weekWinRate ?? 0}% wins</span>
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
                <span>{dailySummary?.weekTrades ?? 0} trades this week</span>
                <span>{dailySummary?.weekWinRate ?? 0}% win rate</span>
                {!dailySummary?.hasStrategy && <span className="text-amber-400/70">Set up weekly plan →</span>}
              </div>
            </div>
          </Link>

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
                <div className="flex items-start gap-2.5">
                  <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 rounded-lg px-2 py-1 shrink-0 mt-0.5">POST</span>
                  <p className="text-gray-300 text-xs leading-relaxed">{ambassadorJourney.todayActions.postIdea}</p>
                </div>
                <div className="flex items-start gap-2.5">
                  <span className="text-[10px] font-bold text-blue-400 bg-blue-500/10 rounded-lg px-2 py-1 shrink-0 mt-0.5">DM</span>
                  <p className="text-gray-300 text-xs leading-relaxed">{ambassadorJourney.todayActions.dmScript}</p>
                </div>
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
              <Link href="/news-alerts" className="block">
                <div className="rounded-2xl border p-3 h-full cursor-pointer transition-all hover:scale-[1.02] bg-rose-500/10 border-rose-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="icon-tile-sm bg-rose-500/20">
                      <Newspaper className="h-4 w-4 text-rose-400" />
                    </div>
                    <span className="status-pill status-pill-live">LIVE</span>
                  </div>
                  <p className="text-white text-xs font-semibold">News & Events</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Sentiment alerts</p>
                </div>
              </Link>
              <Link href="/volatility-meter" className="block">
                <div className="rounded-2xl border p-3 h-full cursor-pointer transition-all hover:scale-[1.02] bg-cyan-500/10 border-cyan-500/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="icon-tile-sm bg-cyan-500/20">
                      <Radio className="h-4 w-4 text-cyan-400" />
                    </div>
                    <span className="status-pill status-pill-live">ON</span>
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
            <Link href="/solana-scanner" className="device-tile device-tile-cyan">
              <div className="flex items-center justify-between">
                <div className="icon-box icon-box-cyan">
                  <SiSolana className="h-5 w-5" />
                </div>
                <span className={`status-pill ${solEngineRunning ? 'status-online' : 'status-offline'}`} style={{ fontSize: '10px', padding: '2px 7px' }}>{solEngineRunning ? 'Live' : 'Idle'}</span>
              </div>
              <div>
                <p className="text-white font-semibold text-sm">SOL Scanner</p>
                <p className="text-gray-500 text-xs mt-0.5">Solana signals</p>
              </div>
            </Link>
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
          // Trigger a fresh progress sync so the weekly bar updates immediately
          syncProgressMutation.mutate();
        }}
      />
    </div>
  );
};

export default Dashboard;