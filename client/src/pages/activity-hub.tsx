import { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { StreakRing } from '@/components/vedd-activity/StreakRing';
import { MissionCard } from '@/components/vedd-activity/MissionCard';
import { RewardBurst } from '@/components/vedd-activity/RewardBurst';
import {
  Flame, Zap, Trophy, Shirt, CheckCircle,
  Crown, ChevronRight, Coins, Calendar,
} from 'lucide-react';
import { SiSolana } from 'react-icons/si';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface WalletData { veddBalance: number; totalEarned: number; }
interface StreakData  { currentStreak: number; longestStreak: number; xpPoints: number; tier: string; }
interface CheckinStatus {
  claimed: boolean; currentStreak: number; nextReward: number;
  todayReward: number; recentDays: string[];
}
interface Mission {
  id: string; title: string; description: string; reward: number;
  completedCount: number; requiredCount: number; completed: boolean;
  type: 'daily' | 'weekly'; earnedVedd: number;
}
interface DailyMissionsData { dailyTasks: Mission[]; weeklyTasks: Mission[]; }
interface NfcGarment   { chipUid: string; garmentName: string; tappedToday: boolean; currentStreak: number; }
interface LeaderEntry  { id: number; username: string; fullName: string | null; avatarUrl: string | null; total_vedd: number; }

/* ─── Path map for missions ──────────────────────────────────────────────── */
const MISSION_PATHS: Record<string, string> = {
  daily_analysis:       '/analysis',
  paper_trade:          '/weekly-strategy',
  streak_maintain:      '/streak',
  ambassador_post:      '/ambassador/content-studio',
  sol_scan:             '/solana-scanner',
  community_comment:    '/community',
  referral_share:       '/referral',
  devotional_read:      '/devotional',
  weekly_analysis_goal: '/analysis',
  weekly_trade_goal:    '/weekly-strategy',
  ambassador_recruit:   '/ambassador/recruitment',
};

/* ─── Helper: avatar initials ────────────────────────────────────────────── */
function Avatar({ name, url, size = 32 }: { name?: string | null; url?: string | null; size?: number }) {
  if (url) return (
    <img src={url} alt={name ?? ''} className="rounded-full object-cover" style={{ width: size, height: size }} />
  );
  const initials = (name ?? '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div
      className="rounded-full bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center font-bold text-white shrink-0"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials}
    </div>
  );
}

/* ─── Day-dot streak calendar ───────────────────────────────────────────── */
function WeekDots({ recentDays }: { recentDays: string[] }) {
  const days = ['M','T','W','T','F','S','S'];
  const today = new Date();
  const dots = days.map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    return { label: days[i], date: d.toISOString().slice(0, 10) };
  });
  return (
    <div className="flex items-center justify-between gap-1">
      {dots.map(({ label, date }) => {
        const done = recentDays.includes(date);
        const isToday = date === today.toISOString().slice(0, 10);
        return (
          <div key={date} className="flex flex-col items-center gap-1">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold transition-all"
              style={{
                background: done ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'rgba(255,255,255,0.05)',
                border: isToday && !done ? '2px solid rgba(239,68,68,0.5)' : '2px solid transparent',
                color: done ? '#fff' : '#6b7280',
                boxShadow: done ? '0 0 8px rgba(239,68,68,0.4)' : 'none',
              }}
            >
              {done ? '✓' : label}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function ActivityHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [burst, setBurst] = useState<{ amount: number } | null>(null);
  const [activeTab, setActiveTab] = useState<'missions' | 'community'>('missions');

  /* ── Queries ── */
  const { data: wallet }  = useQuery<WalletData>({ queryKey: ['/api/wallet/balance'], refetchInterval: 20000 });
  const { data: streak }  = useQuery<StreakData>({ queryKey: ['/api/streak'], refetchInterval: 30000 });
  const { data: checkin, refetch: refetchCheckin } = useQuery<CheckinStatus>({
    queryKey: ['/api/activity/daily-checkin-status'], refetchInterval: 30000,
  });
  const { data: missions } = useQuery<DailyMissionsData>({
    queryKey: ['/api/vedd/daily-missions'], refetchInterval: 60000,
  });
  const { data: garments } = useQuery<NfcGarment[]>({
    queryKey: ['/api/nfc/my-garments'], refetchInterval: 30000,
  });
  const { data: lbData } = useQuery<{ leaderboard: LeaderEntry[] }>({
    queryKey: ['/api/activity/leaderboard'], refetchInterval: 60000,
    enabled: activeTab === 'community',
  });

  /* ── Mutations ── */
  const checkinMut = useMutation({
    mutationFn: () => apiRequest('POST', '/api/activity/daily-checkin', {}),
    onSuccess: async (res) => {
      const data = await res.json();
      setBurst({ amount: data.reward });
      const bonus = data.streakBonus > 0 ? ` (+${data.streakBonus} streak bonus!)` : '';
      toast({ title: `🔥 Day ${data.newStreak} check-in!`, description: `+${data.reward} VEDD earned${bonus}` });
      refetchCheckin();
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
    },
    onError: async (err: any) => {
      let msg = 'Failed';
      try { const d = await err.response?.json(); msg = d?.error || msg; } catch {}
      if (msg.includes('Already')) {
        toast({ title: 'Already checked in today!', description: 'Come back tomorrow 🔥' });
        refetchCheckin();
      }
    },
  });

  const tapNfcMut = useMutation({
    mutationFn: (uid: string) => apiRequest('POST', '/api/nfc/daily-tap', { chipUid: uid }),
    onSuccess: async (res) => {
      const d = await res.json();
      setBurst({ amount: d.rewardAmount });
      queryClient.invalidateQueries({ queryKey: ['/api/nfc/my-garments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wallet/balance'] });
    },
    onError: async (err: any) => {
      let msg = '';
      try { const d = await err.response?.json(); msg = d?.error || ''; } catch {}
      if (msg.includes('tomorrow')) toast({ title: 'Already tapped today', description: 'Come back tomorrow for your NFC reward' });
    },
  });

  /* ── Derived values ── */
  const veddBalance    = wallet?.veddBalance ?? 0;
  const totalEarned    = wallet?.totalEarned ?? 0;
  const streakDays     = streak?.currentStreak ?? 0;
  const xpPoints       = streak?.xpPoints ?? 0;
  const DAILY_CAP      = 200; // VEDD
  const todayEstimate  = Math.min(totalEarned, DAILY_CAP); // server could give exact figure; estimate for now
  const untappedNfc    = (garments ?? []).filter(g => !g.tappedToday);
  const allMissions    = [...(missions?.dailyTasks ?? []), ...(missions?.weeklyTasks ?? [])];
  const completedToday = allMissions.filter(m => m.completed).length;

  const handleBurstDone = useCallback(() => setBurst(null), []);

  const firstName = user?.fullName?.split(' ')[0] ?? user?.username ?? 'Trader';
  const hourNow   = new Date().getHours();
  const greeting  = hourNow < 12 ? 'Good morning' : hourNow < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="min-h-screen bg-[#080B14] text-white pb-28">
      {burst && <RewardBurst amount={burst.amount} onDone={handleBurstDone} />}

      {/* ── Header ── */}
      <div
        className="sticky top-0 z-30 px-4 py-3 flex items-center justify-between"
        style={{ background: 'rgba(8,11,20,0.9)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
      >
        <div>
          <p className="text-[10px] text-gray-600 uppercase tracking-widest">{greeting},</p>
          <p className="text-base font-black text-white leading-tight">{firstName}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)' }}>
            <Zap className="w-3.5 h-3.5 text-red-400" />
            <span className="text-sm font-black text-white">{veddBalance.toFixed(0)}</span>
            <span className="text-[10px] text-red-400 font-semibold">VEDD</span>
          </div>
          <Link href="/vedd-wallet">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <Coins className="w-4 h-4 text-gray-400" />
            </div>
          </Link>
        </div>
      </div>

      <div className="px-4 space-y-5 mt-4">

        {/* ── Earn Ring ── */}
        <div className="flex flex-col items-center py-2">
          <StreakRing
            value={todayEstimate}
            max={DAILY_CAP}
            streak={streakDays}
            size={210}
            animate
          />
          {/* XP + Streak row */}
          <div className="flex items-center gap-5 mt-4">
            <div className="text-center">
              <p className="text-lg font-black text-amber-400">{xpPoints.toLocaleString()}</p>
              <p className="text-[9px] text-gray-600 uppercase tracking-wide">XP</p>
            </div>
            <div className="w-px h-8 bg-gray-800" />
            <div className="text-center">
              <p className="text-lg font-black text-orange-400">{streakDays}</p>
              <p className="text-[9px] text-gray-600 uppercase tracking-wide">Streak</p>
            </div>
            <div className="w-px h-8 bg-gray-800" />
            <div className="text-center">
              <p className="text-lg font-black text-purple-400">{completedToday}</p>
              <p className="text-[9px] text-gray-600 uppercase tracking-wide">Done today</p>
            </div>
          </div>
        </div>

        {/* ── Daily Check-In Card ── */}
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: checkin?.claimed
              ? 'rgba(16,185,129,0.07)'
              : 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(249,115,22,0.08) 100%)',
            border: checkin?.claimed ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(239,68,68,0.3)',
          }}
        >
          <div className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                  style={{ background: checkin?.claimed ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)' }}
                >
                  {checkin?.claimed ? (
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <Flame className="w-6 h-6 vedd-fire" />
                  )}
                </div>
                <div>
                  <p className="font-bold text-white text-sm leading-tight">
                    {checkin?.claimed ? 'Checked In ✓' : "Daily Check-In"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {checkin?.claimed
                      ? `${checkin.currentStreak}-day streak · Keep it going!`
                      : `Day ${(checkin?.currentStreak ?? 0) + 1} · Earn +${checkin?.nextReward ?? 10} VEDD`}
                  </p>
                </div>
              </div>
              {!checkin?.claimed ? (
                <button
                  onClick={() => checkinMut.mutate()}
                  disabled={checkinMut.isPending}
                  className="vedd-tap-bounce shrink-0 px-4 py-2 rounded-xl font-black text-sm text-black transition-all active:scale-95"
                  style={{ background: 'linear-gradient(135deg,#ef4444,#f97316)', boxShadow: '0 4px 16px rgba(239,68,68,0.4)' }}
                >
                  {checkinMut.isPending ? '...' : `+${checkin?.nextReward ?? 10} VEDD`}
                </button>
              ) : (
                <div className="shrink-0 text-right">
                  <p className="text-emerald-400 font-black text-sm">+{checkin?.todayReward} VEDD</p>
                  <p className="text-[9px] text-gray-600">claimed</p>
                </div>
              )}
            </div>
            {/* 7-day dots */}
            <div className="mt-3 pt-3 border-t border-white/5">
              <WeekDots recentDays={checkin?.recentDays ?? []} />
            </div>
          </div>
        </div>

        {/* ── NFC Garment Quick-Tap ── */}
        {untappedNfc.length > 0 && (
          <div
            className="rounded-2xl p-4"
            style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Shirt className="w-4 h-4 text-amber-400" />
                <p className="text-sm font-bold text-white">{untappedNfc.length} garment{untappedNfc.length > 1 ? 's' : ''} ready to tap</p>
              </div>
              <Link href="/clothing">
                <span className="text-xs text-amber-400/70 flex items-center gap-0.5">See all <ChevronRight className="w-3 h-3" /></span>
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {untappedNfc.slice(0, 3).map(g => (
                <button
                  key={g.chipUid}
                  onClick={() => tapNfcMut.mutate(g.chipUid)}
                  disabled={tapNfcMut.isPending}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-xl active:scale-98 transition-all"
                  style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.2)' }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">👕</span>
                    <span className="text-sm font-semibold text-white">{g.garmentName}</span>
                    {g.currentStreak > 0 && <span className="text-xs text-orange-400">🔥{g.currentStreak}d</span>}
                  </div>
                  <span className="text-amber-400 font-black text-sm">+15 VEDD</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Tabs: Missions | Community ── */}
        <div className="flex gap-1 p-1 rounded-xl" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
          {(['missions', 'community'] as const).map(t => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="flex-1 py-2 text-xs font-bold rounded-lg capitalize transition-all"
              style={{
                background: activeTab === t ? 'linear-gradient(135deg,#ef4444,#f97316)' : 'transparent',
                color: activeTab === t ? '#fff' : '#6b7280',
              }}
            >
              {t === 'missions' ? '⚡ Missions' : '🏆 Leaderboard'}
            </button>
          ))}
        </div>

        {/* ── Tab: Missions ── */}
        {activeTab === 'missions' && (
          <div className="space-y-2">
            {/* Daily missions header */}
            <div className="flex items-center justify-between px-1">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Daily</p>
              <p className="text-[10px] text-gray-600">{(missions?.dailyTasks ?? []).filter(m => m.completed).length}/{missions?.dailyTasks?.length ?? 0} done</p>
            </div>
            {(missions?.dailyTasks ?? []).length === 0 && (
              <div className="rounded-2xl p-6 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <p className="text-gray-500 text-sm">Start trading or analysing to unlock daily missions</p>
              </div>
            )}
            {(missions?.dailyTasks ?? []).map((m, i) => (
              <MissionCard
                key={m.id}
                title={m.title}
                description={m.description}
                reward={m.reward}
                progress={m.requiredCount > 0 ? m.completedCount / m.requiredCount : m.completed ? 1 : 0}
                completed={m.completed}
                link={MISSION_PATHS[m.id]}
                category="daily"
                index={i}
              />
            ))}

            {/* Weekly missions */}
            {(missions?.weeklyTasks ?? []).length > 0 && (
              <>
                <div className="flex items-center justify-between px-1 pt-3">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Weekly</p>
                  <p className="text-[10px] text-gray-600">{(missions?.weeklyTasks ?? []).filter(m => m.completed).length}/{missions?.weeklyTasks?.length ?? 0} done</p>
                </div>
                {(missions?.weeklyTasks ?? []).map((m, i) => (
                  <MissionCard
                    key={m.id}
                    title={m.title}
                    description={m.description}
                    reward={m.reward}
                    progress={m.requiredCount > 0 ? m.completedCount / m.requiredCount : m.completed ? 1 : 0}
                    completed={m.completed}
                    link={MISSION_PATHS[m.id]}
                    category="weekly"
                    index={i}
                  />
                ))}
              </>
            )}

            {/* Quick-access more earn routes */}
            <div className="pt-2 grid grid-cols-3 gap-2">
              {[
                { icon: Shirt, label: 'NFC Wear', path: '/clothing', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
                { icon: SiSolana, label: 'SOL Bot', path: '/solana-scanner', color: '#06b6d4', bg: 'rgba(6,182,212,0.1)' },
                { icon: Trophy, label: 'Streak', path: '/streak', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
              ].map(item => (
                <Link key={item.path} href={item.path}>
                  <div
                    className="rounded-xl p-3 flex flex-col items-center gap-1.5 transition-all active:scale-95"
                    style={{ background: item.bg, border: `1px solid ${item.color}22` }}
                  >
                    <item.icon className="w-5 h-5" style={{ color: item.color }} />
                    <span className="text-[10px] font-semibold text-gray-400">{item.label}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Tab: Leaderboard ── */}
        {activeTab === 'community' && (
          <div className="space-y-3">
            <p className="text-[10px] text-gray-600 uppercase tracking-widest px-1">Top earners this week</p>

            {(lbData?.leaderboard ?? []).length === 0 && (
              <div className="rounded-2xl p-8 text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                <Trophy className="w-8 h-8 text-amber-400/40 mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Leaderboard loading…</p>
              </div>
            )}

            {(lbData?.leaderboard ?? []).map((entry, idx) => {
              const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : null;
              const isMe = entry.id === user?.id;
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 p-3 rounded-2xl transition-all"
                  style={{
                    background: isMe ? 'rgba(239,68,68,0.08)' : idx < 3 ? 'rgba(255,255,255,0.04)' : 'transparent',
                    border: isMe ? '1px solid rgba(239,68,68,0.25)' : '1px solid rgba(255,255,255,0.05)',
                  }}
                >
                  <div className="w-6 text-center shrink-0">
                    {medal ? (
                      <span className="text-lg">{medal}</span>
                    ) : (
                      <span className="text-xs text-gray-600 font-bold">{idx + 1}</span>
                    )}
                  </div>
                  <Avatar name={entry.fullName ?? entry.username} url={entry.avatarUrl} size={36} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${isMe ? 'text-red-400' : 'text-white'}`}>
                      {entry.fullName ?? entry.username} {isMe ? '(you)' : ''}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black text-amber-400">{Number(entry.total_vedd).toFixed(0)}</p>
                    <p className="text-[9px] text-gray-600">VEDD</p>
                  </div>
                </div>
              );
            })}

            {/* Social CTA */}
            <div
              className="rounded-2xl p-4 flex items-center justify-between mt-2"
              style={{ background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.2)' }}
            >
              <div>
                <p className="text-sm font-bold text-white">Challenge a friend</p>
                <p className="text-xs text-gray-500">Refer them — earn +10 VEDD when they join</p>
              </div>
              <Link href="/referral">
                <button
                  className="px-3 py-1.5 rounded-xl text-xs font-bold text-white"
                  style={{ background: 'linear-gradient(135deg,#8b5cf6,#a78bfa)' }}
                >
                  Invite
                </button>
              </Link>
            </div>
          </div>
        )}

        {/* ── Today's Summary Footer ── */}
        <div
          className="rounded-2xl p-4"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-center gap-2 mb-3">
            <Calendar className="w-4 h-4 text-gray-500" />
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Today's summary</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Missions done',    value: `${completedToday}/${allMissions.length}`, color: 'text-emerald-400' },
              { label: 'Check-in streak',  value: `${checkin?.currentStreak ?? 0} days 🔥`,  color: 'text-orange-400' },
              { label: 'VEDD balance',     value: `${veddBalance.toFixed(0)}`,               color: 'text-amber-400' },
              { label: 'Lifetime earned',  value: `${totalEarned.toFixed(0)}`,               color: 'text-red-400' },
            ].map(s => (
              <div key={s.label} className="rounded-xl p-3" style={{ background: 'rgba(255,255,255,0.03)' }}>
                <p className={`text-lg font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-600">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
