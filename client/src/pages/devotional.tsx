import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest } from '@/lib/queryClient';
import {
  BookOpen,
  Clock,
  Star,
  Users,
  Flame,
  Trophy,
  Heart,
  Share2,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Coins,
  Loader2,
  RefreshCw,
  MessageSquare,
  Play,
  CheckCircle2,
  ArrowRight,
  Shield,
  Sparkles,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Devotional {
  id: number;
  date: string;
  title: string;
  theme: string;
  scripture: string;
  scripture_text: string;
  reflection: string;
  prayer_points: string[];
  affirmation: string;
  trading_tie_in: string;
  minimum_minutes: number;
}

interface DevotionalStats {
  totalCompleted: number;
  groupCompleted: number;
  totalVeddEarned: number;
  streak: number;
  lastCompletedAt: string | null;
  todaySession: {
    id: number;
    is_completed: boolean;
    is_group_session: boolean;
    group_invite_code?: string;
    reward_amount: number;
    duration_seconds: number;
  } | null;
}

interface LeaderboardEntry {
  username: string;
  user_id: number;
  completions: number;
  vedd_earned: number;
  group_completions: number;
}

// ─── Timer Component ──────────────────────────────────────────────────────────

function DevotionalTimer({
  minimumMinutes,
  onComplete,
  sessionId,
}: {
  minimumMinutes: number;
  onComplete: (durationSeconds: number) => void;
  sessionId: number;
}) {
  const [seconds, setSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const minSeconds = minimumMinutes * 60;
  const progress = Math.min((seconds / minSeconds) * 100, 100);
  const ready = seconds >= minSeconds;

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${rem.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setStarted(true);
    setRunning(true);
  };

  const handleComplete = () => {
    setRunning(false);
    onComplete(seconds);
  };

  if (!started) {
    return (
      <div className="text-center py-6">
        <p className="text-gray-400 text-sm mb-4">
          Press Start when you're ready. The timer runs while you read — complete after {minimumMinutes} minutes to earn your reward.
        </p>
        <Button
          onClick={handleStart}
          className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white px-8 py-3 text-lg"
        >
          <Play className="h-5 w-5 mr-2" />
          Begin Devotional
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Timer display */}
      <div className="flex items-center justify-center gap-4">
        <div className={`text-4xl font-mono font-bold ${running ? 'text-white' : 'text-gray-400'}`}>
          {formatTime(seconds)}
        </div>
        <div className="text-gray-500 text-sm">
          / {formatTime(minSeconds)} min
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-800 rounded-full h-3 overflow-hidden">
        <div
          className={`h-3 rounded-full transition-all duration-1000 ${
            ready
              ? 'bg-gradient-to-r from-emerald-500 to-emerald-400'
              : 'bg-gradient-to-r from-red-600 to-rose-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>{ready ? '✅ Minimum time reached!' : `${formatTime(minSeconds - seconds)} remaining`}</span>
        <button
          onClick={() => setRunning(!running)}
          className="text-gray-400 hover:text-white text-xs underline"
        >
          {running ? 'Pause' : 'Resume'}
        </button>
      </div>

      {/* Complete button */}
      <Button
        onClick={handleComplete}
        disabled={!ready}
        className={`w-full py-3 text-base font-semibold transition-all ${
          ready
            ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-700 hover:to-emerald-600 text-white shadow-lg shadow-emerald-500/30'
            : 'bg-gray-800 text-gray-500 cursor-not-allowed'
        }`}
      >
        {ready ? (
          <>
            <CheckCircle2 className="h-5 w-5 mr-2" />
            Complete Devotional & Claim Reward
          </>
        ) : (
          `Complete (available in ${formatTime(minSeconds - seconds)})`
        )}
      </Button>
    </div>
  );
}

// ─── Group Join/Create Panel ──────────────────────────────────────────────────

function GroupPanel({
  devotionalId,
  onGroupJoined,
}: {
  devotionalId: number;
  onGroupJoined: (groupId: number, inviteCode: string) => void;
}) {
  const { user } = useAuth();
  const isAmbassador = !!(user as any)?.isAmbassador;
  const isAdmin = !!(user as any)?.isAdmin;
  const [tab, setTab] = useState<'join' | 'create'>('join');
  const [inviteCode, setInviteCode] = useState('');
  const [city, setCity] = useState('');
  const [groupInfo, setGroupInfo] = useState<any>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const lookupMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await fetch(`/api/devotionals/groups/${code}`);
      if (!res.ok) { const j = await res.json(); throw new Error(j.error); }
      return res.json();
    },
    onSuccess: (data) => setGroupInfo(data),
    onError: (e: any) => setError(e.message),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/devotionals/groups', { devotionalId, city });
      return res.json();
    },
    onSuccess: (data) => {
      setGroupInfo(data);
    },
    onError: (e: any) => setError(e.message),
  });

  const handleCopyCode = async () => {
    if (!groupInfo?.invite_code) return;
    await navigator.clipboard.writeText(groupInfo.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleJoin = () => {
    if (groupInfo) onGroupJoined(groupInfo.id, groupInfo.invite_code);
  };

  return (
    <div className="bg-gray-900/80 border border-purple-800/40 rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Users className="h-5 w-5 text-purple-400" />
        <h3 className="font-semibold text-white">Group Devotional</h3>
        <Badge className="bg-purple-900/40 text-purple-300 border-purple-700 text-xs">2× VEDD Reward</Badge>
      </div>
      <p className="text-sm text-gray-400">
        Join or create a group session with local ambassadors. Completing together doubles your VEDD reward (150 vs 75).
      </p>

      {/* Tab switcher */}
      {(isAmbassador || isAdmin) && (
        <div className="flex gap-2">
          <button
            onClick={() => { setTab('join'); setError(''); setGroupInfo(null); }}
            className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${tab === 'join' ? 'bg-purple-800/50 text-purple-300' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
          >
            Join Group
          </button>
          <button
            onClick={() => { setTab('create'); setError(''); setGroupInfo(null); }}
            className={`flex-1 py-1.5 rounded text-sm font-medium transition-colors ${tab === 'create' ? 'bg-purple-800/50 text-purple-300' : 'bg-gray-800 text-gray-500 hover:text-gray-300'}`}
          >
            Create Group
          </button>
        </div>
      )}

      {/* Join tab */}
      {tab === 'join' && (
        <div className="space-y-3">
          {!groupInfo ? (
            <>
              <Input
                value={inviteCode}
                onChange={e => { setInviteCode(e.target.value.toUpperCase()); setError(''); }}
                placeholder="Enter 6-digit invite code (e.g. ABC123)"
                maxLength={6}
                className="bg-gray-800 border-gray-700 text-white uppercase tracking-widest text-center font-mono text-lg"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Button
                onClick={() => lookupMutation.mutate(inviteCode)}
                disabled={inviteCode.length < 6 || lookupMutation.isPending}
                className="w-full bg-purple-700 hover:bg-purple-600 text-white"
              >
                {lookupMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Look Up Group'}
              </Button>
            </>
          ) : (
            <div className="bg-purple-900/20 border border-purple-700/40 rounded p-3 space-y-2">
              <p className="text-white font-semibold">{groupInfo.devotional_title || groupInfo.title}</p>
              <p className="text-sm text-gray-400">
                Host: <span className="text-purple-300">{groupInfo.host_name}</span>
                {groupInfo.city && <> · {groupInfo.city}</>}
              </p>
              <p className="text-sm text-gray-400">
                Participants: <span className="text-white">{groupInfo.participant_count}</span>
              </p>
              <div className="flex gap-2">
                <Button onClick={handleJoin} className="flex-1 bg-emerald-700 hover:bg-emerald-600 text-white">
                  Join This Group
                </Button>
                <Button onClick={() => setGroupInfo(null)} variant="outline" size="sm" className="border-gray-600 text-gray-300">
                  Back
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create tab (ambassadors only) */}
      {tab === 'create' && (isAmbassador || isAdmin) && (
        <div className="space-y-3">
          {!groupInfo ? (
            <>
              <Input
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Your city (optional, e.g. Atlanta)"
                className="bg-gray-800 border-gray-700 text-white"
              />
              {error && <p className="text-red-400 text-sm">{error}</p>}
              <Button
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending}
                className="w-full bg-purple-700 hover:bg-purple-600 text-white"
              >
                {createMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create Group Session'}
              </Button>
            </>
          ) : (
            <div className="bg-purple-900/20 border border-purple-700/40 rounded p-4 space-y-3 text-center">
              <p className="text-gray-400 text-sm">Share this code with your local ambassadors:</p>
              <div className="text-4xl font-mono font-bold text-purple-300 tracking-widest">
                {groupInfo.invite_code}
              </div>
              <Button
                onClick={handleCopyCode}
                variant="outline"
                size="sm"
                className={`border-gray-600 text-gray-300 hover:bg-gray-800 ${copied ? 'border-emerald-600 text-emerald-400' : ''}`}
              >
                {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                {copied ? 'Copied!' : 'Copy Code'}
              </Button>
              <Button onClick={handleJoin} className="w-full bg-emerald-700 hover:bg-emerald-600 text-white">
                Start as Host
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Reward Toast ─────────────────────────────────────────────────────────────

function RewardToast({ amount, isGroup }: { amount: number; isGroup: boolean }) {
  return (
    <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 bg-gradient-to-r from-emerald-900 to-emerald-800 border border-emerald-500/50 rounded-2xl px-6 py-4 shadow-2xl shadow-emerald-500/30 text-center animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="text-3xl mb-1">🙏</div>
      <p className="text-emerald-300 font-bold text-lg">Devotional Complete!</p>
      {amount > 0 && (
        <p className="text-white text-sm mt-1">
          <span className="text-yellow-400 font-bold">+{amount} VEDD</span> earned
          {isGroup && <span className="text-purple-300 ml-1">(2× group bonus!)</span>}
        </p>
      )}
    </div>
  );
}

// ─── Main Devotional Page ─────────────────────────────────────────────────────

export default function DevotionalPage() {
  const { user } = useAuth();
  const isAmbassador = !!(user as any)?.isAmbassador;
  const isAdmin = !!(user as any)?.isAdmin;
  const queryClient = useQueryClient();

  const [sessionId, setSessionId] = useState<number | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [activeGroupCode, setActiveGroupCode] = useState<string | null>(null);
  const [showGroupPanel, setShowGroupPanel] = useState(false);
  const [showAffirmation, setShowAffirmation] = useState(false);
  const [showPrayer, setShowPrayer] = useState(false);
  const [showTradingTie, setShowTradingTie] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);
  const [completionResult, setCompletionResult] = useState<{ amount: number; isGroup: boolean } | null>(null);

  // Fetch today's devotional
  const { data: devotional, isLoading: devLoading, isError: devError, refetch: refetchDev } = useQuery<Devotional>({
    queryKey: ['/api/devotionals/today'],
    queryFn: async () => {
      const res = await fetch('/api/devotionals/today');
      if (!res.ok) throw new Error('Failed to load devotional');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  // Fetch user stats
  const { data: stats, refetch: refetchStats } = useQuery<DevotionalStats>({
    queryKey: ['/api/devotionals/my-stats'],
    queryFn: async () => {
      if (!user) return null;
      const res = await fetch('/api/devotionals/my-stats', { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch leaderboard
  const { data: leaderboard = [] } = useQuery<LeaderboardEntry[]>({
    queryKey: ['/api/devotionals/leaderboard'],
    queryFn: async () => {
      const res = await fetch('/api/devotionals/leaderboard');
      return res.json();
    },
  });

  const startSessionMutation = useMutation({
    mutationFn: async ({ devotionalId, groupId }: { devotionalId: number; groupId?: number }) => {
      const res = await apiRequest('POST', '/api/devotionals/sessions/start', {
        devotionalId,
        groupId: groupId || null,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ sId, durationSeconds }: { sId: number; durationSeconds: number }) => {
      const res = await apiRequest('POST', `/api/devotionals/sessions/${sId}/complete`, { durationSeconds });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/devotionals/my-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/devotionals/leaderboard'] });
      setCompletionResult({ amount: data.rewardAmount || 0, isGroup: !!activeGroupId });
      setTimeout(() => setCompletionResult(null), 4000);
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/devotionals/generate', {});
      return res.json();
    },
    onSuccess: () => refetchDev(),
  });

  const handleStartDevotional = () => {
    if (!devotional) return;
    startSessionMutation.mutate({ devotionalId: devotional.id, groupId: activeGroupId || undefined });
  };

  const handleGroupJoined = (groupId: number, inviteCode: string) => {
    setActiveGroupId(groupId);
    setActiveGroupCode(inviteCode);
    setShowGroupPanel(false);
  };

  const handleComplete = (durationSeconds: number) => {
    if (!sessionId) return;
    completeMutation.mutate({ sId: sessionId, durationSeconds });
  };

  const todayCompleted = stats?.todaySession?.is_completed;
  const todayReward = stats?.todaySession?.reward_amount || 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-gray-950 to-black">
      {/* Reward toast */}
      {completionResult && (
        <RewardToast amount={completionResult.amount} isGroup={completionResult.isGroup} />
      )}

      <div className="max-w-3xl mx-auto px-4 py-10 sm:px-6">

        {/* ── Header ── */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 bg-red-900/20 border border-red-800/40 rounded-full px-4 py-1.5 mb-4">
            <BookOpen className="h-4 w-4 text-red-400" />
            <span className="text-red-400 text-sm font-medium">Daily Devotional</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold text-white mb-2">
            VEDD{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-rose-400">
              Devotional
            </span>
          </h1>
          <p className="text-gray-400 max-w-xl mx-auto text-sm">
            Build the mindset of a champion. Faith, discipline, and community — the foundation of every great trader and ambassador.
          </p>
        </div>

        {/* ── Stats Row (logged-in users) ── */}
        {user && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {[
              { label: 'Day Streak', value: stats.streak, icon: <Flame className="h-4 w-4 text-orange-400" />, color: 'text-orange-400' },
              { label: 'Completed', value: stats.totalCompleted, icon: <CheckCircle2 className="h-4 w-4 text-emerald-400" />, color: 'text-emerald-400' },
              { label: 'Group Sessions', value: stats.groupCompleted, icon: <Users className="h-4 w-4 text-purple-400" />, color: 'text-purple-400' },
              { label: 'VEDD Earned', value: stats.totalVeddEarned, icon: <Coins className="h-4 w-4 text-yellow-400" />, color: 'text-yellow-400' },
            ].map(s => (
              <div key={s.label} className="bg-black/50 border border-gray-800 rounded-lg p-3 text-center">
                <div className="flex justify-center mb-1">{s.icon}</div>
                <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
                <div className="text-gray-500 text-xs">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* ── Loading / Error ── */}
        {devLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-red-400" />
          </div>
        )}

        {devError && (
          <div className="text-center py-12">
            <p className="text-gray-400 mb-4">Could not load today's devotional.</p>
            <Button onClick={() => refetchDev()} variant="outline" className="border-gray-700 text-gray-300">
              <RefreshCw className="h-4 w-4 mr-2" /> Try Again
            </Button>
          </div>
        )}

        {devotional && (
          <div className="space-y-6">

            {/* ── Today's Devotional Card ── */}
            <div className="bg-black/60 backdrop-blur-sm border border-gray-800 rounded-xl overflow-hidden">

              {/* Card header */}
              <div className="bg-gradient-to-r from-red-900/40 to-rose-900/20 border-b border-gray-800 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className="bg-red-900/50 text-red-300 border-red-700 text-xs uppercase tracking-wide">
                        {devotional.theme}
                      </Badge>
                      <span className="text-gray-500 text-xs">
                        {new Date(devotional.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                      </span>
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-white">{devotional.title}</h2>
                  </div>
                  {isAdmin && (
                    <Button
                      onClick={() => generateMutation.mutate()}
                      disabled={generateMutation.isPending}
                      size="sm"
                      variant="ghost"
                      className="text-gray-500 hover:text-gray-300 shrink-0"
                      title="Regenerate today's devotional"
                    >
                      {generateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
              </div>

              <div className="p-5 space-y-6">

                {/* Scripture */}
                <div className="bg-gray-900/60 border border-gray-700/50 rounded-lg p-4">
                  <p className="text-xs text-red-400 font-semibold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" /> Scripture
                  </p>
                  <blockquote className="text-gray-200 italic text-lg leading-relaxed">
                    "{devotional.scripture_text}"
                  </blockquote>
                  <cite className="text-red-400 text-sm font-semibold mt-2 block">— {devotional.scripture}</cite>
                </div>

                {/* Reflection */}
                <div>
                  <p className="text-xs text-gray-500 font-semibold uppercase tracking-wider mb-3">Reflection</p>
                  <div className="text-gray-300 leading-relaxed whitespace-pre-line text-sm md:text-base">
                    {devotional.reflection}
                  </div>
                </div>

                {/* Prayer Points */}
                <div className="border border-gray-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowPrayer(!showPrayer)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-900/50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                      <Heart className="h-4 w-4 text-pink-400" /> Prayer Points
                    </span>
                    {showPrayer ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                  </button>
                  {showPrayer && (
                    <div className="px-4 pb-4 space-y-2">
                      {(devotional.prayer_points || []).map((point, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <span className="text-pink-400 mt-0.5">🙏</span>
                          <span>{point}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Daily Affirmation */}
                <div className="border border-gray-800 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setShowAffirmation(!showAffirmation)}
                    className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-900/50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-white flex items-center gap-2">
                      <Star className="h-4 w-4 text-yellow-400" /> Daily Affirmation
                    </span>
                    {showAffirmation ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                  </button>
                  {showAffirmation && (
                    <div className="px-4 pb-4">
                      <p className="text-yellow-300 text-lg font-semibold italic text-center py-2">
                        "{devotional.affirmation}"
                      </p>
                      <p className="text-gray-500 text-xs text-center">Speak this aloud. Own it.</p>
                    </div>
                  )}
                </div>

                {/* Trading Tie-In */}
                {devotional.trading_tie_in && (
                  <div className="border border-gray-800 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setShowTradingTie(!showTradingTie)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-900/50 transition-colors"
                    >
                      <span className="text-sm font-semibold text-white flex items-center gap-2">
                        <ArrowRight className="h-4 w-4 text-blue-400" /> Trading Mindset Application
                      </span>
                      {showTradingTie ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
                    </button>
                    {showTradingTie && (
                      <div className="px-4 pb-4">
                        <p className="text-blue-300 text-sm leading-relaxed">{devotional.trading_tie_in}</p>
                      </div>
                    )}
                  </div>
                )}

              </div>
            </div>

            {/* ── Already Completed Banner ── */}
            {todayCompleted && (
              <div className="bg-emerald-900/20 border border-emerald-700/40 rounded-xl p-5 text-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                <h3 className="text-white font-bold text-lg mb-1">Today's Devotional Complete! 🙏</h3>
                <p className="text-gray-400 text-sm">
                  {todayReward > 0
                    ? `You earned ${todayReward} VEDD for today's session.`
                    : 'You completed today's devotional.'}
                </p>
                <p className="text-gray-500 text-xs mt-2">Come back tomorrow for a new devotional & reward.</p>
              </div>
            )}

            {/* ── Session Area (not yet started/completed) ── */}
            {!todayCompleted && user && (
              <div className="bg-black/60 border border-gray-800 rounded-xl p-5 space-y-5">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-red-400" />
                  Complete Today's Devotional
                </h3>

                {/* Reward info */}
                <div className="grid grid-cols-2 gap-3">
                  <div className={`rounded-lg p-3 border text-center ${
                    activeGroupId
                      ? 'bg-gray-900/50 border-gray-700/40 opacity-50'
                      : 'bg-gray-900/80 border-gray-700'
                  }`}>
                    <Coins className="h-5 w-5 text-yellow-400 mx-auto mb-1" />
                    <p className="text-white font-bold">75 VEDD</p>
                    <p className="text-gray-500 text-xs">Solo reward</p>
                  </div>
                  <div className={`rounded-lg p-3 border text-center ${
                    activeGroupId
                      ? 'bg-purple-900/30 border-purple-700/60 ring-1 ring-purple-500/30'
                      : 'bg-gray-900/50 border-gray-700/40'
                  }`}>
                    <Users className="h-5 w-5 text-purple-400 mx-auto mb-1" />
                    <p className="text-white font-bold">150 VEDD</p>
                    <p className="text-gray-500 text-xs">Group reward (2×)</p>
                    {activeGroupId && (
                      <Badge className="mt-1 bg-purple-900/40 text-purple-300 border-purple-700 text-xs">Active</Badge>
                    )}
                  </div>
                </div>

                {/* Group session controls */}
                {(isAmbassador || isAdmin) && !sessionId && (
                  <div>
                    {activeGroupId ? (
                      <div className="flex items-center justify-between bg-purple-900/20 border border-purple-700/40 rounded-lg px-3 py-2">
                        <span className="text-sm text-purple-300 flex items-center gap-2">
                          <Users className="h-4 w-4" />
                          Group session active — Code: <span className="font-mono font-bold">{activeGroupCode}</span>
                        </span>
                        <button
                          onClick={() => { setActiveGroupId(null); setActiveGroupCode(null); }}
                          className="text-gray-500 hover:text-gray-300 text-xs underline"
                        >
                          Leave
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setShowGroupPanel(!showGroupPanel)}
                        className="w-full flex items-center justify-center gap-2 border border-purple-700/40 text-purple-400 hover:bg-purple-900/20 rounded-lg py-2 text-sm font-medium transition-colors"
                      >
                        <Users className="h-4 w-4" />
                        {showGroupPanel ? 'Hide Group Options' : 'Join/Create Group Session (+75 VEDD bonus)'}
                      </button>
                    )}

                    {showGroupPanel && !activeGroupId && (
                      <div className="mt-3">
                        <GroupPanel devotionalId={devotional.id} onGroupJoined={handleGroupJoined} />
                      </div>
                    )}
                  </div>
                )}

                {/* Timer / Start */}
                {!sessionId ? (
                  <div className="text-center">
                    <Button
                      onClick={handleStartDevotional}
                      disabled={startSessionMutation.isPending}
                      className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white px-8 py-3 text-base"
                    >
                      {startSessionMutation.isPending
                        ? <Loader2 className="h-5 w-5 animate-spin" />
                        : <><Play className="h-5 w-5 mr-2" /> Start Session</>}
                    </Button>
                    <p className="text-gray-500 text-xs mt-2">
                      Minimum {devotional.minimum_minutes} minutes required to earn your reward.
                    </p>
                  </div>
                ) : (
                  <>
                    <DevotionalTimer
                      minimumMinutes={devotional.minimum_minutes}
                      sessionId={sessionId}
                      onComplete={handleComplete}
                    />
                    {completeMutation.isError && (
                      <p className="text-red-400 text-sm text-center">
                        {(completeMutation.error as Error).message}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Non-logged-in CTA */}
            {!user && (
              <div className="bg-black/60 border border-gray-800 rounded-xl p-6 text-center">
                <Shield className="h-10 w-10 text-red-400 mx-auto mb-3" />
                <h3 className="text-white font-bold text-lg mb-2">Log in to earn VEDD rewards</h3>
                <p className="text-gray-400 text-sm mb-4">Ambassadors earn 75–150 VEDD per completed devotional. Join the community.</p>
                <a href="/auth">
                  <Button className="bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 text-white">
                    Sign In / Join VEDD
                  </Button>
                </a>
              </div>
            )}

            {/* ── Community Leaderboard ── */}
            {leaderboard.length > 0 && (
              <div className="bg-black/60 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold flex items-center gap-2 mb-4">
                  <Trophy className="h-5 w-5 text-yellow-400" />
                  This Month's Top Devotional Community
                </h3>
                <div className="space-y-2">
                  {leaderboard.map((entry, idx) => (
                    <div
                      key={entry.user_id}
                      className={`flex items-center gap-3 p-2.5 rounded-lg ${
                        idx === 0 ? 'bg-yellow-900/20 border border-yellow-700/30' :
                        idx === 1 ? 'bg-gray-800/60 border border-gray-700/30' :
                        idx === 2 ? 'bg-orange-900/10 border border-orange-700/20' :
                        'bg-gray-900/30'
                      }`}
                    >
                      <span className={`font-bold text-sm w-6 text-center ${
                        idx === 0 ? 'text-yellow-400' :
                        idx === 1 ? 'text-gray-300' :
                        idx === 2 ? 'text-orange-400' : 'text-gray-500'
                      }`}>
                        {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                      </span>
                      <span className="flex-1 text-white text-sm font-medium">{entry.username}</span>
                      <span className="text-gray-400 text-xs">{entry.completions} days</span>
                      {parseInt(String(entry.group_completions)) > 0 && (
                        <span className="text-purple-400 text-xs flex items-center gap-1">
                          <Users className="h-3 w-3" />{entry.group_completions}
                        </span>
                      )}
                      <span className="text-yellow-400 text-xs font-semibold">{entry.vedd_earned} VEDD</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Rewards explainer (ambassadors) ── */}
            {(isAmbassador || isAdmin) && (
              <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Coins className="h-5 w-5 text-yellow-400" />
                  How Devotional Rewards Work
                </h3>
                <div className="grid sm:grid-cols-2 gap-3 text-sm">
                  {[
                    { title: 'Solo Session', reward: '75 VEDD', desc: 'Complete 5+ minutes alone. Daily limit: 1/day.', color: 'text-yellow-400' },
                    { title: 'Group Session', reward: '150 VEDD', desc: 'Join with a local ambassador. Code required. 2× reward.', color: 'text-purple-400' },
                    { title: 'Streak Bonus', reward: '×1.1', desc: 'Consecutive days multiply your streak multiplier.', color: 'text-orange-400' },
                    { title: 'Community Impact', reward: 'Leaderboard', desc: 'Top devotional participants rank on the community board.', color: 'text-blue-400' },
                  ].map(r => (
                    <div key={r.title} className="bg-black/40 border border-gray-800 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-white font-medium text-xs">{r.title}</span>
                        <span className={`font-bold text-sm ${r.color}`}>{r.reward}</span>
                      </div>
                      <p className="text-gray-500 text-xs">{r.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  );
}
