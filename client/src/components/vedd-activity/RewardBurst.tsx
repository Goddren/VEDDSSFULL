import { useEffect, useState } from 'react';

interface RewardBurstProps {
  amount: number;
  label?: string;
  /** Duration in ms before auto-dismiss (default 2400) */
  duration?: number;
  onDone?: () => void;
}

const PARTICLES = [
  { tx: '-40px', ty: '-55px', color: '#ef4444', delay: '0s',    size: 6 },
  { tx: '40px',  ty: '-60px', color: '#fbbf24', delay: '0.05s', size: 5 },
  { tx: '-60px', ty: '-30px', color: '#f97316', delay: '0.02s', size: 7 },
  { tx: '60px',  ty: '-35px', color: '#ef4444', delay: '0.08s', size: 4 },
  { tx: '-25px', ty: '-70px', color: '#fbbf24', delay: '0.03s', size: 5 },
  { tx: '25px',  ty: '-65px', color: '#f97316', delay: '0.06s', size: 6 },
  { tx: '-55px', ty: '-50px', color: '#ef4444', delay: '0.01s', size: 4 },
  { tx: '55px',  ty: '-45px', color: '#fbbf24', delay: '0.07s', size: 5 },
];

export function RewardBurst({ amount, label = 'VEDD', duration = 2400, onDone }: RewardBurstProps) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, duration);
    return () => clearTimeout(t);
  }, [duration, onDone]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none z-[100] flex items-center justify-center"
      aria-live="polite"
    >
      {/* Dim backdrop flash */}
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(239,68,68,0.18) 0%, transparent 70%)',
          animation: 'vedd-burst-in 0.4s ease forwards',
        }}
      />

      {/* Main reward badge */}
      <div
        className="relative vedd-burst flex flex-col items-center"
      >
        {/* Particles */}
        {PARTICLES.map((p, i) => (
          <div
            key={i}
            className="absolute rounded-full"
            style={{
              width: p.size,
              height: p.size,
              background: p.color,
              top: '50%',
              left: '50%',
              marginTop: -(p.size / 2),
              marginLeft: -(p.size / 2),
              ['--tx' as string]: p.tx,
              ['--ty' as string]: p.ty,
              animation: `vedd-particle 0.7s ${p.delay} cubic-bezier(0.22,1,0.36,1) forwards`,
            }}
          />
        ))}

        {/* Badge */}
        <div
          className="relative z-10 px-8 py-4 rounded-3xl flex flex-col items-center gap-0.5"
          style={{
            background: 'linear-gradient(135deg, #0D1117 0%, #1a0a0a 100%)',
            border: '2px solid rgba(239,68,68,0.6)',
            boxShadow: '0 0 48px rgba(239,68,68,0.5), 0 24px 48px rgba(0,0,0,0.7)',
          }}
        >
          <span className="text-[11px] uppercase tracking-[0.2em] text-red-400/70 font-semibold">You earned</span>
          <span className="font-black text-white" style={{ fontSize: 52, lineHeight: 1 }}>
            +{amount}
          </span>
          <span className="text-red-400 font-black text-xl tracking-wide">⚡ {label}</span>
        </div>
      </div>
    </div>
  );
}

/* ── Floating micro-reward (used inline, not full-screen) ── */
interface FloatRewardProps {
  amount: number;
  x?: number;
  y?: number;
}

export function FloatReward({ amount, x = 0, y = 0 }: FloatRewardProps) {
  return (
    <div
      className="vedd-float pointer-events-none absolute font-black text-amber-400 text-sm z-50 whitespace-nowrap"
      style={{ left: x, top: y, textShadow: '0 0 12px rgba(251,191,36,0.8)' }}
    >
      +{amount} VEDD
    </div>
  );
}
