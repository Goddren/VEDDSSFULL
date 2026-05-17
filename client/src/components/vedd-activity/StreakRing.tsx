import { useEffect, useRef } from 'react';

interface StreakRingProps {
  /** Current value (e.g. VEDD earned today) */
  value: number;
  /** Maximum value (daily cap) */
  max: number;
  /** Streak day count */
  streak: number;
  /** Size in px (default 200) */
  size?: number;
  /** Animated on mount */
  animate?: boolean;
}

const RADIUS = 82;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function StreakRing({ value, max, streak, size = 200, animate = true }: StreakRingProps) {
  const progress = max > 0 ? Math.min(value / max, 1) : 0;
  const offset = CIRCUMFERENCE - progress * CIRCUMFERENCE;
  const pathRef = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!animate || !pathRef.current) return;
    pathRef.current.style.setProperty('--ring-from', `${CIRCUMFERENCE}`);
    pathRef.current.style.setProperty('--ring-to', `${offset}`);
    pathRef.current.style.animation = 'none';
    // Force reflow
    void pathRef.current.getBoundingClientRect();
    pathRef.current.style.animation = 'vedd-ring-fill 1.2s cubic-bezier(0.22,1,0.36,1) forwards';
  }, [value, max, offset, animate]);

  const pct = Math.round(progress * 100);
  const viewBox = 200;
  const cx = viewBox / 2;
  const cy = viewBox / 2;

  return (
    <div className="activity-ring-wrap" style={{ width: size, height: size }}>
      <svg
        className="activity-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${viewBox} ${viewBox}`}
      >
        {/* Outer glow ring (decorative) */}
        <circle
          cx={cx} cy={cy} r={RADIUS + 14}
          fill="none"
          stroke="rgba(239,68,68,0.06)"
          strokeWidth={1}
        />
        {/* Track */}
        <circle
          cx={cx} cy={cy} r={RADIUS}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {/* Progress fill */}
        <circle
          ref={pathRef}
          cx={cx} cy={cy} r={RADIUS}
          fill="none"
          stroke="url(#vedd-ring-grad)"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={animate ? CIRCUMFERENCE : offset}
          className={progress > 0 ? 'vedd-ring-pulse' : ''}
        />
        {/* Inner streak ring (dimmer) */}
        <circle
          cx={cx} cy={cy} r={RADIUS - 22}
          fill="none"
          stroke="rgba(249,115,22,0.12)"
          strokeWidth={4}
        />
        {/* Gradient definition */}
        <defs>
          <linearGradient id="vedd-ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%"   stopColor="#ef4444" />
            <stop offset="50%"  stopColor="#f97316" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
      </svg>

      {/* Center content */}
      <div
        className="absolute flex flex-col items-center justify-center pointer-events-none"
        style={{ width: size, height: size, top: 0, left: 0 }}
      >
        <span className="text-[10px] uppercase tracking-[0.15em] text-gray-600 font-semibold mb-0.5">earned today</span>
        <span className="font-black text-white leading-none" style={{ fontSize: size * 0.17 }}>
          {value.toFixed(0)}
        </span>
        <span className="text-[11px] font-bold text-red-400 tracking-wide">VEDD</span>
        <div className="flex items-center gap-1 mt-1.5">
          <span className="vedd-fire text-sm">🔥</span>
          <span className="text-xs font-bold text-orange-400">{streak}d</span>
        </div>
        <span className="text-[9px] text-gray-600 mt-0.5">{pct}% of daily cap</span>
      </div>
    </div>
  );
}
