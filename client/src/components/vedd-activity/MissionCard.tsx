import { useEffect, useRef } from 'react';
import { Link } from 'wouter';
import { CheckCircle, ChevronRight, Lock } from 'lucide-react';

interface MissionCardProps {
  title: string;
  description: string;
  reward: number;
  /** 0–1 */
  progress: number;
  completed: boolean;
  locked?: boolean;
  link?: string;
  category?: 'daily' | 'weekly' | 'streak' | 'special';
  index?: number;
}

const CAT_COLORS: Record<string, { ring: string; bar: string; badge: string }> = {
  daily:   { ring: 'rgba(239,68,68,0.25)',   bar: 'linear-gradient(90deg,#ef4444,#f97316)', badge: 'bg-red-500/15 text-red-400 border-red-500/25' },
  weekly:  { ring: 'rgba(139,92,246,0.25)',  bar: 'linear-gradient(90deg,#8b5cf6,#a78bfa)', badge: 'bg-purple-500/15 text-purple-400 border-purple-500/25' },
  streak:  { ring: 'rgba(249,115,22,0.25)',  bar: 'linear-gradient(90deg,#f97316,#fbbf24)', badge: 'bg-orange-500/15 text-orange-400 border-orange-500/25' },
  special: { ring: 'rgba(251,191,36,0.25)',  bar: 'linear-gradient(90deg,#fbbf24,#f59e0b)', badge: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
};

export function MissionCard({ title, description, reward, progress, completed, locked, link, category = 'daily', index = 0 }: MissionCardProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const colors = CAT_COLORS[category] ?? CAT_COLORS.daily;
  const pct = Math.round(progress * 100);

  useEffect(() => {
    if (!barRef.current) return;
    barRef.current.style.setProperty('--bar-to', `${pct}%`);
    barRef.current.style.animation = 'none';
    void barRef.current.getBoundingClientRect();
    barRef.current.style.animation = `vedd-bar-fill 0.9s ${index * 0.08}s cubic-bezier(0.22,1,0.36,1) forwards`;
  }, [pct, index]);

  const content = (
    <div
      className={`mission-card p-4 select-none ${completed ? 'completed' : ''} ${locked ? 'opacity-40' : ''}`}
      style={{ borderColor: completed ? 'rgba(16,185,129,0.25)' : undefined }}
    >
      <div className="flex items-start gap-3">
        {/* Left: progress ring indicator */}
        <div
          className="shrink-0 mt-0.5 w-9 h-9 rounded-full flex items-center justify-center border-2"
          style={{
            borderColor: completed ? 'rgba(16,185,129,0.6)' : colors.ring,
            background: completed ? 'rgba(16,185,129,0.08)' : 'rgba(255,255,255,0.03)',
          }}
        >
          {locked ? (
            <Lock className="w-3.5 h-3.5 text-gray-600" />
          ) : completed ? (
            <CheckCircle className="w-4 h-4 text-emerald-400" />
          ) : (
            <span className="text-[10px] font-black" style={{ color: '#ef4444' }}>{pct}%</span>
          )}
        </div>

        {/* Right: content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <p className={`text-sm font-bold leading-tight truncate ${completed ? 'text-emerald-400' : 'text-white'}`}>
              {title}
            </p>
            <span className={`shrink-0 text-[9px] font-semibold px-1.5 py-0.5 rounded-full border ${colors.badge}`}>
              {category}
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-tight mb-2 line-clamp-1">{description}</p>

          {/* Progress bar */}
          {!completed && (
            <div className="relative h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div
                ref={barRef}
                className="absolute left-0 top-0 h-full rounded-full"
                style={{ width: 0, background: colors.bar }}
              />
            </div>
          )}
        </div>

        {/* Reward + arrow */}
        <div className="shrink-0 flex flex-col items-end gap-1">
          <span className={`text-sm font-black ${completed ? 'text-emerald-400' : 'text-amber-400'}`}>
            +{reward}
          </span>
          <span className="text-[9px] text-gray-600">VEDD</span>
          {!locked && !completed && (
            <ChevronRight className="w-3 h-3 text-gray-700 mt-0.5" />
          )}
        </div>
      </div>
    </div>
  );

  if (link && !locked && !completed) {
    return <Link href={link}>{content}</Link>;
  }
  return content;
}
