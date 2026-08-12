import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/use-auth';
import { TIER_CONFIG, type UserStreak } from '@shared/schema';
import { Flame, Coins, ArrowRight, Zap } from 'lucide-react';

/* ── VEDD "Load-in" — the GTA-style cinematic takeover shown once per day on
   login. Greets the player, shows rank/target/mission, then drops them into
   the Player HUD (/vault). Built on the same real endpoints, dismissible. ── */

const GOLD = '#f5c451';
const fmtUsd = (n: number) => `${n < 0 ? '-' : ''}$${Math.abs(Math.round(n)).toLocaleString()}`;

export default function VaultLoadIn() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);

  const uid = (user as any)?.id;
  const todayStr = new Date().toISOString().slice(0, 10);
  const flagKey = uid ? `vedd_loadin_${uid}_${todayStr}` : '';

  useEffect(() => {
    if (!uid) return;
    try {
      if (!localStorage.getItem(flagKey)) setShow(true);
    } catch { /* localStorage blocked — just don't show */ }
  }, [uid, flagKey]);

  useEffect(() => {
    if (show) requestAnimationFrame(() => setMounted(true));
  }, [show]);

  const { data: streak } = useQuery<UserStreak>({ queryKey: ['/api/streak'], enabled: show && !!uid });
  const { data: rewards } = useQuery<any>({ queryKey: ['/api/vedd/rewards/summary'], enabled: show && !!uid });
  const { data: summary } = useQuery<any>({ queryKey: ['/api/mt5/daily-summary'], enabled: show && !!uid });
  const { data: strategy } = useQuery<any>({ queryKey: ['/api/weekly-strategy'], enabled: show && !!uid });
  const { data: missions } = useQuery<any>({ queryKey: ['/api/vedd/daily-missions'], enabled: show && !!uid });

  if (!show || !uid) return null;

  const tier = (streak?.tier as keyof typeof TIER_CONFIG) || 'YG';
  const tierCfg = TIER_CONFIG[tier] || TIER_CONFIG.YG;
  const nextCfg = tierCfg.nextTier ? TIER_CONFIG[tierCfg.nextTier as keyof typeof TIER_CONFIG] : null;
  const xp = streak?.xpPoints ?? 0;
  const floorXp = tierCfg.minXP ?? 0;
  const ceilXp = nextCfg ? nextCfg.minXP : floorXp;
  const xpPct = ceilXp > floorXp ? Math.min(100, ((xp - floorXp) / (ceilXp - floorXp)) * 100) : 100;
  const currentStreak = streak?.currentStreak ?? 0;

  const weeklyTarget = strategy?.profitTarget ?? summary?.weeklyTarget ?? 0;
  const dailyTarget = summary?.dailyTarget ?? strategy?.dailyTarget ?? (weeklyTarget > 0 ? weeklyTarget / 5 : 0);

  const displayName = (user as any)?.username || (user as any)?.name || 'Trader';
  const hour = new Date().getHours();
  const partOfDay = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening';
  const dayName = new Date().toLocaleDateString(undefined, { weekday: 'long' });

  const primaryMission = Array.isArray(missions?.tasks)
    ? missions.tasks.find((t: any) => t.category === 'daily' && !t.completed)
    : null;

  const abbaLine = dailyTarget > 0
    ? `${partOfDay}, ${displayName}. Today's target is ${fmtUsd(dailyTarget)}. One clean setup — I'll flag it.`
    : `${partOfDay}, ${displayName}. Set your weekly plan and I'll walk the week with you.`;

  const dismiss = (go: boolean) => {
    try { localStorage.setItem(flagKey, '1'); } catch { /* ignore */ }
    setMounted(false);
    setTimeout(() => { setShow(false); if (go) navigate('/vault'); }, 220);
  };

  return (
    <div
      onClick={() => dismiss(false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'radial-gradient(120% 90% at 50% 0%, #131b26 0%, #070a0f 60%, #04060a 100%)',
        opacity: mounted ? 1 : 0, transition: 'opacity .25s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16, overflowY: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 380, color: '#e7ecf3', textAlign: 'center',
          transform: mounted ? 'translateY(0) scale(1)' : 'translateY(16px) scale(.97)',
          transition: 'transform .3s cubic-bezier(.2,.8,.2,1)',
        }}
      >
        {/* Context chips */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 20 }}>
          <span style={{ background: 'rgba(245,196,81,.14)', color: GOLD, fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 20, letterSpacing: 1 }}>{dayName.toUpperCase()}</span>
          <span style={{ background: '#141a24', color: '#c2cdda', fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span>{tierCfg.icon}</span>{tierCfg.name}
          </span>
        </div>

        {/* Wordmark */}
        <div style={{ fontSize: 46, fontWeight: 900, letterSpacing: 6, color: GOLD, lineHeight: 1 }}>VEDD</div>
        <div style={{ fontSize: 11, letterSpacing: 4, color: '#61748a', marginTop: 8, marginBottom: 22 }}>THE VAULT IS RUNNING</div>

        {/* Abba greeting */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: '#0f141c', border: '1px solid #1e2530', borderRadius: 14, padding: 12, textAlign: 'left', marginBottom: 16 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: GOLD, color: '#3a2c05', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900 }}>A</div>
          <div>
            <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, marginBottom: 2 }}>Abba</div>
            <div style={{ fontSize: 13, color: '#c2cdda', lineHeight: 1.5 }}>{abbaLine}</div>
          </div>
        </div>

        {/* XP + streak row */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, background: '#0f141c', border: '1px solid #1e2530', borderRadius: 12, padding: 10, textAlign: 'left' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <span style={{ fontSize: 10, color: '#61748a', letterSpacing: 1, fontWeight: 700 }}>RANK XP</span>
              <span style={{ fontSize: 10, color: '#9fb0c3' }}>{xp.toLocaleString()}{nextCfg ? ` / ${ceilXp.toLocaleString()}` : ''}</span>
            </div>
            <div style={{ height: 6, background: '#141a24', borderRadius: 6, overflow: 'hidden' }}>
              <div style={{ width: `${xpPct}%`, height: '100%', background: GOLD, transition: 'width .8s ease' }} />
            </div>
          </div>
          <div style={{ background: 'rgba(255,157,92,.12)', border: '1px solid rgba(255,157,92,.25)', borderRadius: 12, padding: '10px 14px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Flame className="w-4 h-4 text-orange-400" />
              <span style={{ color: '#ffb489', fontWeight: 900, fontSize: 16, lineHeight: 1 }}>{currentStreak}</span>
            </div>
            <span style={{ fontSize: 9, color: '#c98f6d', textTransform: 'uppercase', marginTop: 3 }}>streak</span>
          </div>
        </div>

        {/* Primary mission */}
        {primaryMission && (
          <div style={{ background: '#0f141c', border: '1px solid #2a3543', borderRadius: 12, padding: 12, marginBottom: 8, textAlign: 'left' }}>
            <div style={{ fontSize: 10, letterSpacing: 1, color: '#61748a', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 5 }}><Zap className="w-3 h-3" style={{ color: GOLD }} /> TODAY'S MISSION</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#e7ecf3' }}>{primaryMission.label}</span>
              <span style={{ color: '#5ce08a', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>+{primaryMission.veddReward * primaryMission.maxCount} VEDD</span>
            </div>
          </div>
        )}

        {/* VEDD coins */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, color: '#9fb0c3', fontSize: 12, margin: '14px 0 18px' }}>
          <Coins className="w-4 h-4" style={{ color: GOLD }} />
          <span style={{ color: '#e7ecf3', fontWeight: 700 }}>{(rewards?.total ?? 0).toLocaleString()}</span> VEDD in your vault
        </div>

        {/* CTA */}
        <button
          onClick={() => dismiss(true)}
          style={{ width: '100%', background: GOLD, color: '#3a2c05', fontWeight: 900, fontSize: 15, padding: '13px', borderRadius: 14, border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}
        >
          Enter the vault <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => dismiss(false)}
          style={{ marginTop: 12, background: 'none', border: 'none', color: '#61748a', fontSize: 12, cursor: 'pointer' }}
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
