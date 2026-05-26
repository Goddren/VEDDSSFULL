import { Link, useLocation } from 'wouter';
import {
  Home, TrendingUp, Zap, Users, Grid3X3, ChevronLeft, LogOut, Flame,
  Settings, History, CreditCard, Award, Newspaper, Clock,
  Briefcase, HelpCircle, BookOpen, GraduationCap, Lightbulb,
  Coins, Webhook, Wallet, DollarSign, Globe, Search, BarChart3,
  LineChart, Scan, Brain, Radio, Rocket, Heart, X,
  FlaskConical, Shield, BarChart2, Lock, Building2, Shirt, MapPin,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';

/* ─── Nav item definitions ────────────────────────── */
const tradingItems = [
  { name: 'ORB Breakout',     path: '/orb-breakout',      icon: Radio,      color: '#22c55e' },
  { name: 'Weekly Strategy',  path: '/weekly-strategy',   icon: TrendingUp, color: '#ef4444' },
  { name: 'Multi-TF EA',      path: '/multi-timeframe',   icon: Clock,      color: '#f59e0b' },
  { name: 'My EAs',           path: '/my-eas',            icon: Briefcase,  color: '#f59e0b' },
  { name: 'Marketplace',      path: '/ea-marketplace',    icon: Zap,        color: '#ef4444' },
  { name: 'Historical',       path: '/historical',        icon: History,    color: '#8b5cf6' },
  { name: 'What If',          path: '/what-if',           icon: Lightbulb,  color: '#06b6d4' },
  { name: 'MT5 Charts',       path: '/mt5-chart-data',    icon: BarChart3,  color: '#06b6d4' },
];

const aiToolItems = [
  { name: 'SOL Scanner', path: '/solana-scanner',     icon: Scan,     color: '#06b6d4' },
  { name: 'Tokenomics',  path: '/vedd-tokenomics',    icon: Coins,    color: '#f59e0b' },
  { name: 'Analysis',    path: '/analysis',           icon: LineChart, color: '#ef4444' },
  { name: 'AI Models',   path: '/ai-trading-models',  icon: Brain,    color: '#8b5cf6' },
  { name: 'Webhooks',    path: '/webhooks',           icon: Webhook,  color: '#3b82f6' },
  { name: 'Live Monitor',path: '/live-monitor',       icon: Radio,    color: '#22c55e' },
];

const communityItems = [
  { name: 'Activity Hub', path: '/activity',                              icon: Flame,       color: '#ef4444' },
  { name: 'Community',    path: '/community',                             icon: Users,       color: '#8b5cf6' },
  { name: 'Free to Pro',  path: '/ambassador/free-path',                  icon: Rocket,      color: '#22c55e' },
  { name: 'Training',     path: '/ambassador-training',                   icon: GraduationCap, color: '#f59e0b' },
  { name: 'Recruit',      path: '/ambassador/recruitment',                icon: Users,       color: '#ef4444' },
  { name: 'Lead Page',    path: '/ambassador/recruitment?tab=leadpages',  icon: Globe,       color: '#3b82f6' },
  { name: 'Soc Scanner',  path: '/ambassador/recruitment?tab=social',     icon: Search,      color: '#ec4899' },
  { name: 'Host Dash',    path: '/host-dashboard',                        icon: Award,       color: '#f59e0b' },
  { name: 'Blog',         path: '/blog',                                  icon: Newspaper,   color: '#22c55e' },
  { name: 'Devotional',   path: '/devotional',                            icon: Heart,       color: '#ef4444' },
  { name: 'Content Studio', path: '/ambassador/content-studio',           icon: Zap,         color: '#a855f7' },
];

const wearItems = [
  { name: 'VEDD Clothing', path: '/vedd-clothing',   icon: Shirt,    color: '#f59e0b' },
  { name: 'Earn Events',   path: '/activity',         icon: Flame,    color: '#ef4444' },
  { name: 'My Location',   path: '/vedd-clothing',    icon: MapPin,   color: '#22c55e' },
];

const ecosystemItems = [
  { name: 'Ecosystem Hub',   path: '/vedd-ecosystem',    icon: Building2,    color: '#6366f1' },
  { name: 'Workforce Acad.', path: '/workforce-academy', icon: GraduationCap, color: '#06b6d4' },
  { name: 'Community Impact',path: '/community-impact',  icon: Users,        color: '#22c55e' },
  { name: 'Impact Dashboard',path: '/impact-dashboard',  icon: BarChart2,    color: '#f59e0b' },
  { name: 'AI Governance',   path: '/ai-governance',     icon: Shield,       color: '#ef4444' },
  { name: 'Innovation Lab',  path: '/innovation-lab',    icon: FlaskConical, color: '#a855f7' },
  { name: 'Compliance',      path: '/compliance',        icon: Lock,         color: '#06b6d4' },
];

const financeItems = [
  { name: 'Growth Plan',    path: '/account-growth',     icon: TrendingUp, color: '#10b981' },
  { name: 'Investments',    path: '/token-investments',  icon: Coins,      color: '#f59e0b' },
  { name: 'VEDD Wallet',    path: '/vedd-wallet',        icon: Wallet,     color: '#8b5cf6' },
  { name: 'Referral Hub',   path: '/referral',           icon: DollarSign, color: '#22c55e' },
  { name: 'Grants',         path: '/grants',             icon: DollarSign, color: '#22c55e' },
  { name: 'Credit Builder', path: '/credit-builder',     icon: Award,      color: '#06b6d4' },
  { name: 'Achievements',   path: '/achievements',       icon: Award,      color: '#f59e0b' },
  { name: 'Pricing',        path: '/subscription',       icon: CreditCard, color: '#ef4444' },
];

/* ─── Tile button ─────────────────────────────────── */
function NavTile({
  name,
  path,
  icon: Icon,
  color,
  isActive,
  onClose,
}: {
  name: string;
  path: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  color: string;
  isActive: boolean;
  onClose: () => void;
}) {
  return (
    <Link href={path}>
      <button
        onClick={onClose}
        className="flex flex-col items-center gap-1.5 w-full p-2 rounded-2xl transition-all active:scale-90"
        style={{
          background: isActive ? `${color}22` : 'rgba(255,255,255,0.04)',
          border: `1.5px solid ${isActive ? color + '66' : 'rgba(255,255,255,0.07)'}`,
        }}
      >
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{
            background: `${color}22`,
            boxShadow: isActive ? `0 0 12px ${color}55` : 'none',
          }}
        >
          <Icon className="h-5 w-5" style={{ color }} />
        </span>
        <span
          className="text-[9px] font-semibold leading-tight text-center line-clamp-2"
          style={{ color: isActive ? color : 'rgba(255,255,255,0.65)' }}
        >
          {name}
        </span>
      </button>
    </Link>
  );
}

/* ─── Section header ──────────────────────────────── */
function SectionLabel({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 px-1 pt-3 pb-1">
      <span className="text-[10px] font-bold uppercase tracking-widest text-gray-500">{label}</span>
      <div className="flex-1 h-px bg-gray-800" />
    </div>
  );
}

/* ─── Main component ──────────────────────────────── */
export function MobileBottomNav() {
  const [location] = useLocation();
  const [open, setOpen] = useState(false);
  const { user, logoutMutation } = useAuth();

  /* Touch-swipe to open/close */
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);

  /* Open with right-edge swipe (swipe LEFT from right side) */
  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = Math.abs(e.changedTouches[0].clientY - touchStartY.current);
      const fromRightEdge = touchStartX.current > window.innerWidth - 32;
      // Swipe left from right edge → open
      if (!open && fromRightEdge && dx < -40 && dy < 60) {
        setOpen(true);
      }
      // Swipe right while panel open → close
      if (open && dx > 60 && dy < 80) {
        setOpen(false);
      }
    };
    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [open]);

  /* Lock body scroll when open */
  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const authPages = ['/', '/login', '/register', '/forgot-password'];
  if (authPages.includes(location) || !user) return null;

  const isActive = (path: string) =>
    location === path || location.startsWith(path.split('?')[0]);

  const close = () => setOpen(false);

  const tabs = [
    { name: 'Home',    path: '/dashboard',            Icon: Home       },
    { name: 'Trading', path: '/weekly-strategy',       Icon: TrendingUp },
    { name: 'Wear',    path: '/vedd-clothing',         Icon: Shirt      },
    { name: 'MT5',     path: '/mt5-chart-data',        Icon: BarChart3  },
    { name: 'Grow',    path: '/ambassador/recruitment', Icon: Users      },
  ];

  return (
    <>
      {/* ── Backdrop ── */}
      {open && (
        <div
          onClick={close}
          className="fixed inset-0 z-40 md:hidden"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)' }}
        />
      )}

      {/* ── Side Panel ── */}
      <div
        ref={panelRef}
        className="fixed top-0 right-0 h-full z-50 md:hidden flex flex-col"
        style={{
          width: '78vw',
          maxWidth: 320,
          background: '#080B14',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          transform: open ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.28s cubic-bezier(0.32,0.72,0,1)',
          willChange: 'transform',
          boxShadow: open ? '-12px 0 48px rgba(0,0,0,0.7)' : 'none',
        }}
      >
        {/* Panel header */}
        <div
          className="flex items-center justify-between px-4 pt-10 pb-3 flex-shrink-0"
          style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div>
            <p className="text-white font-bold text-base tracking-tight">Quick Nav</p>
            <p className="text-[10px] text-gray-500 mt-0.5">Flick right to close</p>
          </div>
          <button
            onClick={close}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}
          >
            <X className="w-4 h-4 text-gray-300" />
          </button>
        </div>

        {/* Scrollable tile grid */}
        <div
          className="flex-1 overflow-y-auto px-3 pb-4"
          style={{ paddingBottom: 110 }}
        >
          <SectionLabel label="Trading" />
          <div className="grid grid-cols-3 gap-2">
            {tradingItems.map(item => (
              <NavTile key={item.path} {...item} isActive={isActive(item.path)} onClose={close} />
            ))}
          </div>

          <SectionLabel label="AI Tools" />
          <div className="grid grid-cols-3 gap-2">
            {aiToolItems.map(item => (
              <NavTile key={item.path} {...item} isActive={isActive(item.path)} onClose={close} />
            ))}
          </div>

          <SectionLabel label="Wear & Earn" />
          {/* VEDD Clothing hero tile — full width */}
          <Link href="/vedd-clothing">
            <button
              onClick={close}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl mb-2 transition-all active:scale-95"
              style={{
                background: isActive('/vedd-clothing')
                  ? 'rgba(245,158,11,0.18)'
                  : 'linear-gradient(135deg,rgba(245,158,11,0.14) 0%,rgba(239,68,68,0.10) 100%)',
                border: `1.5px solid ${isActive('/vedd-clothing') ? 'rgba(245,158,11,0.6)' : 'rgba(245,158,11,0.28)'}`,
              }}
            >
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(245,158,11,0.22)', boxShadow: '0 0 14px rgba(245,158,11,0.35)' }}
              >
                <Shirt className="w-5 h-5" style={{ color: '#f59e0b' }} />
              </span>
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-white leading-tight">VEDD Clothing</p>
                <p className="text-[10px] text-amber-400/80 mt-0.5">NFC Tap · GPS Rewards · $VEDD Earn</p>
              </div>
              <span
                className="text-[9px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: 'rgba(245,158,11,0.25)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)' }}
              >
                LIVE
              </span>
            </button>
          </Link>

          <SectionLabel label="Community" />
          <div className="grid grid-cols-3 gap-2">
            {communityItems.map(item => (
              <NavTile key={item.path} {...item} isActive={isActive(item.path)} onClose={close} />
            ))}
          </div>

          <SectionLabel label="Finance" />
          <div className="grid grid-cols-3 gap-2">
            {financeItems.map(item => (
              <NavTile key={item.path} {...item} isActive={isActive(item.path)} onClose={close} />
            ))}
          </div>

          <SectionLabel label="Grant Ecosystem" />
          <div className="grid grid-cols-3 gap-2">
            {ecosystemItems.map(item => (
              <NavTile key={item.path} {...item} isActive={isActive(item.path)} onClose={close} />
            ))}
          </div>

          {/* Settings + Logout row */}
          <div className="mt-3 space-y-2">
            <Link href="/profile">
              <button
                onClick={close}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl transition-all active:scale-95"
                style={{ background: 'rgba(59,130,246,0.1)', border: '1.5px solid rgba(59,130,246,0.25)' }}
              >
                <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.2)' }}>
                  <Settings className="w-4 h-4 text-blue-400" />
                </span>
                <span className="text-sm font-semibold text-white">Settings / Profile</span>
              </button>
            </Link>
            <button
              onClick={() => { logoutMutation.mutate(); close(); }}
              className="flex items-center gap-3 w-full px-4 py-3 rounded-2xl transition-all active:scale-95"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1.5px solid rgba(239,68,68,0.25)' }}
            >
              <span className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.2)' }}>
                <LogOut className="w-4 h-4 text-red-400" />
              </span>
              <span className="text-sm font-semibold text-red-400">Log Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Pull tab (always visible on right edge when panel closed) ── */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed z-40 md:hidden flex flex-col items-center justify-center gap-0.5"
          style={{
            right: 0,
            top: '50%',
            transform: 'translateY(-50%)',
            width: 22,
            height: 64,
            background: 'linear-gradient(180deg,#ef4444 0%,#8b5cf6 100%)',
            borderRadius: '10px 0 0 10px',
            boxShadow: '-4px 0 16px rgba(139,92,246,0.4)',
          }}
          aria-label="Open navigation"
        >
          <ChevronLeft className="w-3 h-3 text-white opacity-90" />
          <div className="w-0.5 h-4 rounded-full bg-white/30" />
        </button>
      )}

      {/* ── Tab Bar ── */}
      <nav className="tab-bar md:hidden">
        {tabs.map(({ name, path, Icon }) => {
          const active = location === path || (path === '/dashboard' && location === '/');
          return (
            <Link key={path} href={path}>
              <button className={`tab-item ${active ? 'active' : ''}`}>
                <span className="tab-icon-wrap"><Icon className="h-[18px] w-[18px]" /></span>
                <span className="tab-lbl">{name}</span>
              </button>
            </Link>
          );
        })}

        {/* More → opens side panel */}
        <button
          onClick={() => setOpen(true)}
          className={`tab-item ${open ? 'active' : ''}`}
        >
          <span className="tab-icon-wrap"><Grid3X3 className="h-[18px] w-[18px]" /></span>
          <span className="tab-lbl">More</span>
        </button>
      </nav>
    </>
  );
}
