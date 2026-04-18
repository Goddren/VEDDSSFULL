import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
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
} from 'lucide-react';
import { MarketCalendar } from '@/components/market/market-calendar';
import { getUserLevel } from '@/lib/achievement-system';
import TradingCoach from '@/components/trading-coach/trading-coach';
import { DailyWisdom } from '@/components/scripture/daily-wisdom';
import { NewsFeed } from '@/components/news/news-feed';
import { ConnectedPairs } from '@/components/mt5/connected-pairs';
import { VeddRewardsPanel } from '@/components/vedd-rewards/vedd-rewards-panel';
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

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const [showFaithContent, setShowFaithContent] = useState<boolean>(true);

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
    refetchInterval: 60000,
  });

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
                  {dailySummary?.hasStrategy && dailySummary.dailyTarget > 0 && (
                    <span className="text-[10px] text-gray-500">target ${dailySummary.dailyTarget.toFixed(0)}</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-gray-600" />
                </span>
              </div>
              <div className="flex items-end gap-2 mb-2">
                <span className={`text-2xl font-black leading-none ${(dailySummary?.todayClosedProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {dailySummary ? `${(dailySummary.todayClosedProfit ?? 0) >= 0 ? '+' : ''}$${Math.abs(dailySummary.todayClosedProfit ?? 0).toFixed(2)}` : '--'}
                </span>
                {(dailySummary?.unrealizedPnL ?? 0) !== 0 && (
                  <span className="text-xs text-yellow-400/70 mb-0.5">
                    {(dailySummary!.unrealizedPnL) >= 0 ? '+' : ''}${dailySummary!.unrealizedPnL.toFixed(2)} open
                  </span>
                )}
              </div>
              {dailySummary?.dailyTarget && dailySummary.dailyTarget > 0 && (
                <div className="prog-track mb-1.5">
                  <div className="prog-fill" style={{
                    width: `${dailySummary.dayProgressPct}%`,
                    background: dailySummary.dayProgressPct >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' :
                                dailySummary.dayProgressPct >= 60  ? 'linear-gradient(90deg,#06b6d4,#22d3ee)' :
                                                                      'linear-gradient(90deg,#ef4444,#f87171)',
                  }} />
                </div>
              )}
              <div className="flex gap-3 text-[11px] text-gray-500">
                <span>{dailySummary?.todayTrades ?? 0} trades</span>
                <span>{dailySummary?.todayWinRate ?? 0}% wins</span>
                {dailySummary?.openPositions ? <span className="text-yellow-400/70">{dailySummary.openPositions} open</span> : null}
              </div>
            </div>
          </Link>

          {/* Weekly Goal bar */}
          <Link href="/weekly-strategy">
            <div className="rounded-2xl p-3 mb-4 cursor-pointer hover:opacity-90 transition-opacity" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-white text-xs font-semibold">Weekly Goal</p>
                <span className="text-[10px] text-gray-500">
                  {dailySummary?.weeklyTarget ? `$${(dailySummary.weekClosedProfit ?? 0).toFixed(2)} / $${dailySummary.weeklyTarget}` : 'No target set'}
                </span>
              </div>
              <div className="prog-track mb-1.5">
                <div className="prog-fill" style={{
                  width: `${dailySummary?.weekProgressPct ?? 0}%`,
                  background: (dailySummary?.weekProgressPct ?? 0) >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)' :
                              (dailySummary?.weekProgressPct ?? 0) >= 60  ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' :
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
                      <div className="h-12 w-12 rounded-xl overflow-hidden border border-white/08 shrink-0">
                        <img src={analysis.imageUrl} alt="Chart" className="h-full w-full object-cover" />
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
        {showRewards && <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
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
    </div>
  );
};

export default Dashboard;