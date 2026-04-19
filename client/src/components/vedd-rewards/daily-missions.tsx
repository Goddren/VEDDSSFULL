import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import { Link } from 'wouter';
import {
  Heart, Users, TrendingUp, BarChart3, Radio, Share2,
  MessageSquare, DollarSign, BookOpen, Star, Calendar,
  Flame, Rocket, Coins, CheckCircle2, Circle, ChevronRight,
  Zap, Lock,
} from 'lucide-react';

/* ─── Types ──────────────────────────────────────────────────────── */
interface Task {
  actionType: string;
  label: string;
  veddReward: number;
  maxCount: number;
  category: 'daily' | 'weekly';
  icon: string;
  description: string;
  completedCount: number;
  earnedVedd: number;
  completed: boolean;
}

interface MissionsData {
  dailyEarned: number;
  weeklyEarned: number;
  dailyCap: number;
  weeklyCap: number;
  devotionalDaysThisWeek: number;
  tasks: Task[];
}

/* ─── Icon map ───────────────────────────────────────────────────── */
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  heart:    Heart,
  users:    Users,
  trending: TrendingUp,
  chart:    BarChart3,
  radio:    Radio,
  share:    Share2,
  chat:     MessageSquare,
  dollar:   DollarSign,
  book:     BookOpen,
  star:     Star,
  calendar: Calendar,
  fire:     Flame,
  rocket:   Rocket,
  coins:    Coins,
};

const ICON_COLORS: Record<string, string> = {
  heart:    'text-red-400',
  users:    'text-purple-400',
  trending: 'text-red-400',
  chart:    'text-cyan-400',
  radio:    'text-green-400',
  share:    'text-blue-400',
  chat:     'text-purple-400',
  dollar:   'text-green-400',
  book:     'text-amber-400',
  star:     'text-yellow-400',
  calendar: 'text-blue-400',
  fire:     'text-orange-400',
  rocket:   'text-green-400',
  coins:    'text-amber-400',
};

const TASK_PATHS: Record<string, string> = {
  devotional_solo:         '/devotional',
  devotional_group:        '/devotional',
  strategy_review:         '/weekly-strategy',
  analysis_view:           '/analysis',
  live_monitor_check:      '/live-monitor',
  blog_share:              '/blog',
  daily_comment:           '/community',
  grant_apply:             '/grants',
  training_module:         '/ambassador-training',
  daily_post:              '/blog',
  event_attendance:        '/community',
  devotional_streak_bonus: '/devotional',
  journey_day_complete:    '/ambassador/free-path',
};

/* ─── Progress Bar ───────────────────────────────────────────────── */
function CapBar({ earned, cap, label, color }: { earned: number; cap: number; label: string; color: string }) {
  const pct = Math.min(100, (earned / cap) * 100);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{label}</span>
        <span className="text-xs font-bold" style={{ color }}>
          {earned} <span className="text-gray-500 font-normal">/ {cap} VEDD</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-gray-800/80 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
    </div>
  );
}

/* ─── Single task row ────────────────────────────────────────────── */
function TaskRow({ task }: { task: Task }) {
  const IconComp = ICONS[task.icon] || Zap;
  const iconColor = ICON_COLORS[task.icon] || 'text-gray-400';
  const path = TASK_PATHS[task.actionType] || '/dashboard';
  const partialDone = task.completedCount > 0 && !task.completed;

  return (
    <Link href={path}>
      <div
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all cursor-pointer
          ${task.completed
            ? 'bg-green-500/08 border border-green-500/20 opacity-75'
            : 'bg-white/03 border border-white/06 hover:bg-white/06 hover:border-white/10'
          }`}
      >
        {/* Icon */}
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0
          ${task.completed ? 'bg-green-500/15' : 'bg-white/06'}`}>
          <IconComp className={`h-4 w-4 ${task.completed ? 'text-green-400' : iconColor}`} />
        </span>

        {/* Label + description */}
        <div className="flex-1 min-w-0">
          <p className={`text-xs font-semibold leading-tight ${task.completed ? 'text-green-300 line-through' : 'text-white'}`}>
            {task.label}
          </p>
          {task.maxCount > 1 && (
            <p className="text-[10px] text-gray-500 mt-0.5">
              {task.completedCount}/{task.maxCount} completed
            </p>
          )}
        </div>

        {/* VEDD badge + check */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {task.completed ? (
            <CheckCircle2 className="h-4 w-4 text-green-400" />
          ) : partialDone ? (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-900/30 px-1.5 py-0.5 rounded">
              +{task.veddReward * task.completedCount} ✓
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-300 bg-amber-900/20 border border-amber-700/30 px-1.5 py-0.5 rounded">
              +{task.veddReward * task.maxCount} VEDD
            </span>
          )}
          {!task.completed && <ChevronRight className="h-3 w-3 text-gray-600" />}
        </div>
      </div>
    </Link>
  );
}

/* ─── Main component ─────────────────────────────────────────────── */
export function DailyMissions() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery<MissionsData>({
    queryKey: ['/api/vedd/daily-missions'],
    enabled: !!user,
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/vedd/daily-missions');
      return res.json();
    },
    refetchInterval: 60_000,
  });

  if (isLoading || !data) {
    return (
      <div className="space-y-2 animate-pulse">
        {[1,2,3,4].map(i => (
          <div key={i} className="h-10 bg-white/05 rounded-xl" />
        ))}
      </div>
    );
  }

  const daily  = data.tasks.filter(t => t.category === 'daily');
  const weekly = data.tasks.filter(t => t.category === 'weekly');
  const dailyDone  = daily.filter(t => t.completed).length;
  const weeklyDone = weekly.filter(t => t.completed).length;
  const dailyHit   = data.dailyEarned >= data.dailyCap;
  const weeklyHit  = data.weeklyEarned >= data.weeklyCap;

  // Max possible daily/weekly VEDD from tasks
  const maxDaily  = daily.reduce((s, t) => s + t.veddReward * t.maxCount, 0);
  const maxWeekly = weekly.reduce((s, t) => s + t.veddReward * t.maxCount, 0);

  return (
    <div className="space-y-4">
      {/* Cap bars */}
      <div className="space-y-2.5 bg-gray-900/50 border border-white/06 rounded-xl p-3">
        <CapBar
          earned={data.dailyEarned}
          cap={data.dailyCap}
          label="Today's VEDD"
          color={dailyHit ? '#22c55e' : '#f59e0b'}
        />
        <CapBar
          earned={data.weeklyEarned}
          cap={data.weeklyCap}
          label="This Week's VEDD"
          color={weeklyHit ? '#22c55e' : '#8b5cf6'}
        />
        {data.devotionalDaysThisWeek > 0 && (
          <div className="flex items-center gap-1.5 pt-1">
            <Flame className="h-3.5 w-3.5 text-orange-400" />
            <span className="text-[11px] text-gray-400">
              Devotional streak: <span className="text-orange-300 font-bold">{data.devotionalDaysThisWeek}/7 days</span>
              {data.devotionalDaysThisWeek >= 5 && <span className="text-green-400 ml-1">🎉 Bonus unlocked!</span>}
            </span>
          </div>
        )}
        {(dailyHit || weeklyHit) && (
          <div className="flex items-center gap-1.5 text-[11px] text-green-400 font-semibold">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {dailyHit ? 'Daily cap reached — great work!' : 'Weekly cap reached — amazing!'}
          </div>
        )}
      </div>

      {/* Daily tasks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Daily Tasks
          </p>
          <span className="text-[10px] text-amber-400 font-semibold">
            {dailyDone}/{daily.length} done · up to {maxDaily} VEDD
          </span>
        </div>
        <div className="space-y-1.5">
          {daily.map(t => <TaskRow key={t.actionType} task={t} />)}
        </div>
      </div>

      {/* Weekly tasks */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500">
            Weekly Tasks
          </p>
          <span className="text-[10px] text-purple-400 font-semibold">
            {weeklyDone}/{weekly.length} done · up to {maxWeekly} VEDD
          </span>
        </div>
        <div className="space-y-1.5">
          {weekly.map(t => <TaskRow key={t.actionType} task={t} />)}
        </div>
      </div>

      <p className="text-[10px] text-gray-600 text-center">
        Max <span className="text-amber-400 font-semibold">{data.dailyCap} VEDD/day</span> · <span className="text-purple-400 font-semibold">{data.weeklyCap} VEDD/week</span> · Resets midnight / Monday
      </p>
    </div>
  );
}
