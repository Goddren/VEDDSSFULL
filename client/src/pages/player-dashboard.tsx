import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import { TIER_CONFIG, type UserStreak } from '@shared/schema';
import { DailyMissions } from '@/components/vedd-rewards/daily-missions';
import {
  Flame, Coins, Target, TrendingUp, TrendingDown, Trophy, ChevronRight,
  Zap, BarChart3, Map as MapIcon, Wallet, GraduationCap, Radio, Swords,
} from 'lucide-react';

/* ── VEDD "Player HUD" — a single GTA-style gaming-profile dashboard.
   Pulls only real endpoints (see below); no fabricated numbers. Dark by
   design (this is a takeover surface), gold accents, mobile-first. ── */

const GOLD = '#f5c451';
const fmtUsd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;
const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

export default function PlayerDashboard() {
  const { user } = useAuth();

  const { data: streak } = useQuery<UserStreak>({ queryKey: ['/api/streak'], enabled: !!user });
  const { data: rewards } = useQuery<{ total: number; pending: number; completed: number }>({
    queryKey: ['/api/vedd/rewards/summary'], enabled: !!user, refetchInterval: 120000,
  });
  const { data: summary } = useQuery<any>({ queryKey: ['/api/mt5/daily-summary'], enabled: !!user, refetchInterval: 30000 });
  const { data: strategy } = useQuery<any>({ queryKey: ['/api/weekly-strategy'], enabled: !!user, refetchInterval: 30000 });
  const { data: monitors } = useQuery<any>({ queryKey: ['/api/platform-monitors'], enabled: !!user, refetchInterval: 30000 });

  /* ── Rank / XP (from streak tiers) ── */
  const tier = (streak?.tier as keyof typeof TIER_CONFIG) || 'YG';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.YG;
  const nextCfg = tierCfg.nextTier ? TIER_CONFIG[tierCfg.nextTier as keyof typeof TIER_CONFIG] : null;
  const xp = streak?.xpPoints ?? 0;
  const floorXp = tierCfg.minXP ?? 0;
  const ceilXp = nextCfg ? nextCfg.minXP : floorXp;
  const xpPct = ceilXp > floorXp ? Math.min(100, ((xp - floorXp) / (ceilXp - floorXp)) * 100) : 100;
  const currentStreak = streak?.currentStreak ?? 0;

  /* ── Score: P&L ── */
  const weekProfit = strategy?.currentProfit ?? summary?.weekClosedProfit ?? 0;
  const weeklyTarget = strategy?.profitTarget ?? summary?.weeklyTarget ?? 0;
  const weekPct = weeklyTarget > 0 ? Math.min(100, (weekProfit / weeklyTarget) * 100) : 0;
  const tlDaily = Array.isArray(monitors?.tradelocker)
    ? monitors.tradelocker.reduce((s: number, a: any) => s + (a?.dailyPnl ?? 0), 0) : 0;
  const dailyPnl = (monitors?.mt5?.dailyPnl ?? 0) + tlDaily;
  const todayTrades = summary?.todayTrades ?? 0;
  const todayWinRate = Math.round(summary?.todayWinRate ?? 0);

  /* ── Abba — the mentor line, contextual & honest ── */
  const coach = (() => {
    if (weeklyTarget > 0 && weekProfit >= weeklyTarget) return 'Week target smashed. Now protect it — you owe the account nothing more today.';
    if (dailyPnl < 0) return "Red day. Slow down, take only A-grade setups. Discipline is the trade now.";
    if (todayTrades === 0) return `New day. Target is ${weeklyTarget > 0 ? fmtUsd(weeklyTarget / 5) : 'set in your weekly plan'}. One clean setup — no forcing.`;
    return 'Steady. Stay in your plan, log every trade, let the edge compound.';
  })();

  const plan = strategy?.plan;
  const todayDow = new Date().getDay(); // 0 Sun … 6 Sat; Mon=1

  const displayName = (user as any)?.username || (user as any)?.name || 'Trader';
  const initial = displayName.charAt(0).toUpperCase();

  const card: React.CSSProperties = { background: '#0f141c', border: '1px solid #1e2530', borderRadius: 16 };

  return (
    <div style={{ background: '#070a0f', minHeight: '100vh' }} className="pb-24">
      <div className="max-w-md mx-auto px-3 pt-4 space-y-3">

        {/* ── Player header ── */}
        <div style={{ ...card, background: '#0a0d13' }} className="p-4">
          <div className="flex items-center gap-3">
            <div style={{ background: GOLD, color: '#3a2c05', border: '2px solid #ffe9a8' }}
              className="w-14 h-14 rounded-full flex items-center justify-center text-2xl font-black flex-shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-lg leading-tight truncate">{displayName}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-base leading-none">{tierCfg.icon}</span>
                <span style={{ color: GOLD }} className="text-xs font-bold uppercase tracking-wide">{tierCfg.name}</span>
              </div>
            </div>
            <Link href="/streak">
              <div className="text-center px-2 py-1 rounded-xl" style={{ background: 'rgba(255,157,92,.12)' }}>
                <div className="flex items-center gap-1 justify-center">
                  <Flame className={`w-4 h-4 text-orange-400 ${currentStreak > 0 ? 'animate-pulse' : ''}`} />
                  <span className="text-orange-300 font-black text-lg leading-none">{currentStreak}</span>
                </div>
                <p className="text-[9px] text-orange-400/80 uppercase tracking-wide mt-0.5">streak</p>
              </div>
            </Link>
          </div>

          {/* XP bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Rank XP</span>
              <span className="text-[10px] text-gray-400 font-semibold">
                {xp.toLocaleString()}{nextCfg ? ` / ${ceilXp.toLocaleString()} → ${TIER_CONFIG[tierCfg.nextTier as keyof typeof TIER_CONFIG]?.name}` : ' · max rank'}
              </span>
            </div>
            <div className="h-2.5 rounded-full overflow-hidden" style={{ background: '#141a24' }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${xpPct}%`, background: GOLD }} />
            </div>
          </div>

          {/* Currency chips */}
          <div className="grid grid-cols-2 gap-2 mt-3">
            <Link href="/vedd-wallet">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(245,196,81,.1)', border: '1px solid rgba(245,196,81,.25)' }}>
                <Coins className="w-4 h-4" style={{ color: GOLD }} />
                <div>
                  <p className="text-white font-black text-sm leading-none">{(rewards?.total ?? 0).toLocaleString()}</p>
                  <p className="text-[9px] text-gray-500 uppercase">VEDD coins</p>
                </div>
              </div>
            </Link>
            <Link href="/streak">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(127,119,221,.12)', border: '1px solid rgba(127,119,221,.28)' }}>
                <Trophy className="w-4 h-4 text-indigo-300" />
                <div>
                  <p className="text-white font-black text-sm leading-none">{xp.toLocaleString()}</p>
                  <p className="text-[9px] text-gray-500 uppercase">total XP</p>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* ── Abba mentor line ── */}
        <div style={{ ...card, background: '#0f141c' }} className="p-3 flex items-start gap-2.5">
          <div style={{ background: GOLD, color: '#3a2c05' }} className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm">A</div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: GOLD }}>Abba</p>
            <p className="text-gray-300 text-xs leading-relaxed mt-0.5">{coach}</p>
          </div>
        </div>

        {/* ── Score row: today / week P&L ── */}
        <div className="grid grid-cols-2 gap-2">
          <div style={card} className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              {dailyPnl >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Today</span>
            </div>
            <p className="font-black text-xl leading-none" style={{ color: dailyPnl >= 0 ? '#5ce08a' : '#f87171' }}>{fmtUsd(dailyPnl)}</p>
            <p className="text-[10px] text-gray-500 mt-1">{todayTrades} trades · {todayWinRate}% win</p>
          </div>
          <div style={card} className="p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Target className="w-3.5 h-3.5" style={{ color: GOLD }} />
              <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Week</span>
            </div>
            <p className="font-black text-xl leading-none" style={{ color: weekProfit >= 0 ? '#5ce08a' : '#f87171' }}>{fmtUsd(weekProfit)}</p>
            <div className="h-1.5 rounded-full overflow-hidden mt-2" style={{ background: '#141a24' }}>
              <div className="h-full rounded-full" style={{ width: `${weekPct}%`, background: weekPct >= 100 ? '#5ce08a' : GOLD }} />
            </div>
            <p className="text-[10px] text-gray-500 mt-1">{weeklyTarget > 0 ? `${Math.round(weekPct)}% of ${fmtUsd(weeklyTarget)}` : 'no target set'}</p>
          </div>
        </div>

        {/* ── Weekly map (the "Abba's pointer during the week") ── */}
        <div style={card} className="p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">Week map</span>
            <Link href="/weekly-strategy"><span className="text-[10px] font-semibold flex items-center" style={{ color: GOLD }}>Plan <ChevronRight className="w-3 h-3" /></span></Link>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {DAY_ABBR.map((abbr, i) => {
              const dow = i + 1; // Mon=1
              const isToday = dow === todayDow;
              const isPast = todayDow > dow || todayDow === 0 || todayDow === 6;
              const dayTarget = plan?.weeklyPlan?.[DAY_FULL[i]]?.dailyTarget;
              return (
                <div key={abbr} className="rounded-lg py-2 text-center" style={{
                  background: isToday ? 'rgba(245,196,81,.16)' : '#0b0f16',
                  border: `1px solid ${isToday ? GOLD : '#1e2530'}`,
                  opacity: isPast && !isToday ? 0.5 : 1,
                }}>
                  <p className="text-[10px] font-bold" style={{ color: isToday ? GOLD : '#8b98a8' }}>{abbr}</p>
                  <p className="text-[11px] font-black mt-0.5 text-white">{typeof dayTarget === 'number' ? fmtUsd(dayTarget) : '—'}</p>
                </div>
              );
            })}
          </div>
          {!plan && <p className="text-[10px] text-gray-600 mt-2 text-center">Set a weekly strategy to fill your day-by-day targets.</p>}
        </div>

        {/* ── Missions + Side Quests (real /api/vedd/daily-missions) ── */}
        <div style={card} className="p-3">
          <div className="flex items-center gap-2 mb-3">
            <Swords className="w-4 h-4" style={{ color: GOLD }} />
            <span className="text-sm font-black text-white uppercase tracking-wide">Missions &amp; side quests</span>
          </div>
          <DailyMissions />
        </div>

        {/* ── Quick access dock ── */}
        <div style={card} className="p-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500 block mb-2">Quick access</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { name: 'Strategy', path: '/weekly-strategy', Icon: Target },
              { name: 'Charts', path: '/mt5-chart-data', Icon: BarChart3 },
              { name: 'Live', path: '/live-monitor', Icon: Radio },
              { name: 'Kalshi', path: '/kalshi', Icon: Zap },
              { name: 'Training', path: '/ambassador-training', Icon: GraduationCap },
              { name: 'Wallet', path: '/vedd-wallet', Icon: Wallet },
            ].map(({ name, path, Icon }) => (
              <Link key={name} href={path}>
                <div className="flex flex-col items-center gap-1.5 py-3 rounded-xl" style={{ background: '#0b0f16', border: '1px solid #1e2530' }}>
                  <Icon className="w-5 h-5" style={{ color: GOLD }} />
                  <span className="text-[10px] text-gray-300 font-semibold">{name}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <Link href="/dashboard">
          <div className="text-center py-2.5">
            <span className="text-[11px] text-gray-500 flex items-center justify-center gap-1">
              <MapIcon className="w-3.5 h-3.5" /> Open the full classic dashboard
            </span>
          </div>
        </Link>
      </div>
    </div>
  );
}
