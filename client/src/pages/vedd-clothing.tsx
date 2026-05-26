import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/hooks/use-auth';
import {
  Shirt, Coins, CheckCircle, Wifi, Zap, ShoppingBag, ExternalLink,
  Plus, RefreshCw, Copy, Bell, X, Lock, TrendingUp, ArrowRight,
  Sparkles, KeyRound, ChevronDown, ChevronUp, Star, Radio,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// ─── Demo Mode ────────────────────────────────────────────────────────────────
// Set false to connect to live DB. True uses mock data so page never goes blank.
const DEMO_MODE = false;

const DEMO_GARMENTS = [
  { id: 1, chipUid: 'NFC001', garmentName: 'VEDD Origin Hoodie', garmentCode: 'VEDD-001-HOODIE',
    icon: '👕', dropName: 'Genesis Drop', sizeInfo: 'L', totalTaps: 18, totalEarned: 864,
    referralEarn: 120, currentStreak: 5, bestStreak: 12, tappedToday: false,
    activatedAt: new Date(Date.now() - 30 * 86400000).toISOString() },
  { id: 2, chipUid: 'NFC002', garmentName: 'VEDD Gods Tee', garmentCode: 'VEDD-002-TEE',
    icon: '👔', dropName: 'Limited Run', sizeInfo: 'M', totalTaps: 9, totalEarned: 432,
    referralEarn: 240, currentStreak: 2, bestStreak: 7, tappedToday: true,
    activatedAt: new Date(Date.now() - 15 * 86400000).toISOString() },
];
const DEMO_EARN_EVENTS = [
  { id: 1, type: 'nfc_tap', label: 'Hoodie NFC Tap — ✈️ Traveling', location: 'Atlanta, GA', amount: 150, distanceMiles: 743.2, createdAt: new Date().toISOString() },
  { id: 2, type: 'referral_join', label: 'Referral Joined', location: 'via your link', amount: 120, distanceMiles: null, createdAt: new Date(Date.now() - 86400000).toISOString() },
  { id: 3, type: 'nfc_tap', label: 'Tee NFC Tap — 🌆 Cross Town', location: 'Broken Arrow, OK', amount: 72, distanceMiles: 18.4, createdAt: new Date(Date.now() - 172800000).toISOString() },
  { id: 4, type: 'referral_subscribe', label: 'Referral Subscribed', location: 'Trading plan', amount: 240, distanceMiles: null, createdAt: new Date(Date.now() - 259200000).toISOString() },
];
const DEMO_POPUP_SHOWN: number[] = [];

// ─── Types ────────────────────────────────────────────────────────────────────
interface ExtendedGarment {
  id: number;
  chipUid: string;
  garmentName: string;
  garmentCode: string;
  icon: string;
  dropName: string;
  sizeInfo: string;
  totalTaps: number;
  totalEarned: number;
  referralEarn: number;
  currentStreak: number;
  bestStreak: number;
  tappedToday: boolean;
  activatedAt: string;
}
interface EarnEvent {
  id: number;
  type: string;
  label: string;
  location?: string;
  distanceMiles?: number | null;
  amount: number;
  createdAt: string;
}
interface Notification {
  id: string;
  tag: 'garment' | 'trading' | 'token' | 'referral';
  title: string;
  body: string;
  time: Date;
  read: boolean;
  action?: { label: string; href: string };
}

// ─── Popup definitions ────────────────────────────────────────────────────────
const POPUP_DEFS = [
  {
    index: 0,
    offsetReal: 4 * 3600 * 1000,
    offsetDemo: 7 * 1000,
    eyebrow: '// 4-Hour Check-In — Signal Alert',
    badge: '📡 Live Signal Detected',
    step: 1,
    title: 'You Just Missed A Live Setup.',
    body: 'EUR/USD ICT Smart Money bullish setup fired on the 4H. VEDD trading members got the alert and the EA executed automatically. This happens daily. You could be in every one.',
    stats: ['4H Timeframe', 'ICT Strategy', 'Auto Execution'],
    cta: 'UNLOCK TRADING — $47/MO',
    ctaHref: '/subscription',
    dismiss: "I'll catch the next one",
    tag: 'trading' as const,
  },
  {
    index: 1,
    offsetReal: 8 * 3600 * 1000,
    offsetDemo: 14 * 1000,
    eyebrow: '// 8-Hour Check-In — Token Alert',
    badge: '🪙 Early Window Open',
    step: 2,
    title: 'Your Referrals Are Earning $VEDD.',
    body: "You've earned tokens through garments and referrals. Now own a piece of the ecosystem itself. $VEDD is live on Solana. Early holders unlock priority access to every drop and feature.",
    stats: ['SOL Chain', '1B Supply', 'You Are Early'],
    cta: 'BUY $VEDD ON PUMP.FUN',
    ctaHref: 'https://pump.fun', // [REPLACE: pump.fun/$VEDD token URL]
    dismiss: 'Buy later',
    tag: 'token' as const,
  },
  {
    index: 2,
    offsetReal: 24 * 3600 * 1000,
    offsetDemo: 22 * 1000,
    eyebrow: '// 24-Hour Mark — Time to Go Deeper',
    badge: '🤖 AI Ready for You',
    step: 3,
    title: 'Let AI Cast Your Net.',
    body: "You've been in the ecosystem 24 hours. Your clothes are earning. Your referral link is live. The last piece is letting AI trade for you automatically — forex and crypto, 24/7, while you live your life.",
    stats: ['$47/mo', '24/7 AI Active', 'Auto Execution'],
    cta: 'START TRADING NOW',
    ctaHref: '/subscription', // [REPLACE: veddbuild.com/subscribe]
    dismiss: 'Not yet',
    tag: 'trading' as const,
  },
];

// ─── Distance reward tiers (mirrors server logic) ────────────────────────────
const DISTANCE_TIERS = [
  { maxMiles: 0.5,  amount: 15,  tier: 'Home',        emoji: '🏠', color: 'text-gray-400' },
  { maxMiles: 3,    amount: 30,  tier: 'Nearby',      emoji: '🚶', color: 'text-blue-400' },
  { maxMiles: 10,   amount: 48,  tier: 'Out & About', emoji: '🚗', color: 'text-amber-400' },
  { maxMiles: 30,   amount: 72,  tier: 'Cross Town',  emoji: '🌆', color: 'text-orange-400' },
  { maxMiles: 100,  amount: 100, tier: 'Road Trip',   emoji: '🛣️', color: 'text-emerald-400' },
  { maxMiles: Infinity, amount: 150, tier: 'Traveling', emoji: '✈️', color: 'text-purple-400' },
];

function getTier(miles: number | null) {
  if (miles === null) return { amount: 48, tier: 'Standard', emoji: '📍', color: 'text-amber-400' };
  return DISTANCE_TIERS.find(t => miles < t.maxMiles) ?? DISTANCE_TIERS[DISTANCE_TIERS.length - 1];
}

// Client-side GPS capture — returns {lat, lon} or null if denied/unavailable
function getCurrentPosition(): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => resolve(null),
      { timeout: 6000, maximumAge: 60000 }
    );
  });
}

// ─── Home Setup Modal ─────────────────────────────────────────────────────────
function HomeSetupModal({ onSet, onSkip, loading }: {
  onSet: () => void;
  onSkip: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[70] flex items-end" onClick={onSkip}>
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg mx-auto bg-gray-950 border border-amber-500/25 rounded-t-2xl p-6 pb-8 animate-in slide-in-from-bottom duration-300"
        onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5" />
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-2xl">🏠</div>
          <div>
            <p className="text-white font-black text-base leading-tight">Set Your Home Location</p>
            <p className="text-gray-500 text-xs mt-0.5">Required once to unlock distance rewards</p>
          </div>
        </div>
        <p className="text-sm text-gray-400 mb-5 leading-relaxed">
          VEDD pays you more $VEDD the farther you are from home when you tap. Set your home location now so the distance reward kicks in.
        </p>

        {/* Tier preview */}
        <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3 mb-5 space-y-1.5">
          <p className="text-[10px] text-gray-600 font-mono tracking-widest mb-2">// DISTANCE REWARD TIERS</p>
          {DISTANCE_TIERS.map(t => (
            <div key={t.tier} className="flex items-center justify-between text-xs">
              <span className="text-gray-400">{t.emoji} {t.tier}</span>
              <span className={`font-bold ${t.color}`}>+{t.amount} $VEDD</span>
            </div>
          ))}
        </div>

        <Button onClick={onSet} disabled={loading}
          className="w-full bg-amber-500 hover:bg-amber-400 text-black font-black py-3 rounded-xl text-sm tracking-wide mb-3">
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin mr-2" /> Getting location…</>
            : '📍 Use My Current Location as Home'}
        </Button>
        <button onClick={onSkip} className="block w-full text-center text-xs text-gray-600 hover:text-gray-400 transition-colors">
          Skip for now — earn standard 48 $VEDD
        </button>
      </div>
    </div>
  );
}

// ─── Earn type config ─────────────────────────────────────────────────────────
const EARN_TYPE_CONFIG: Record<string, { icon: string; color: string; bg: string }> = {
  nfc_tap:            { icon: '📡', color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  referral_join:      { icon: '🔱', color: 'text-blue-400',    bg: 'bg-blue-500/10' },
  referral_subscribe: { icon: '💎', color: 'text-purple-400',  bg: 'bg-purple-500/10' },
  activation:         { icon: '⚡', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  default:            { icon: '🪙', color: 'text-yellow-400',  bg: 'bg-yellow-500/10' },
};

// ─── NFC Scanner sub-component ────────────────────────────────────────────────
function NfcScanner({ onScan }: { onScan: (uid: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);

  const startScan = async () => {
    setError('');
    // @ts-ignore
    if (!('NDEFReader' in window)) { setShowManual(true); return; }
    try {
      setScanning(true);
      // @ts-ignore
      const ndef = new NDEFReader();
      await ndef.scan();
      // @ts-ignore
      ndef.addEventListener('reading', ({ serialNumber }: any) => {
        setScanning(false);
        onScan(serialNumber.replace(/:/g, '').toUpperCase());
      });
      // @ts-ignore
      ndef.addEventListener('readingerror', () => { setScanning(false); setError('Could not read chip — try again'); });
    } catch (e: any) {
      setScanning(false);
      if (e.name === 'NotAllowedError') setError('NFC permission denied');
      else setShowManual(true);
    }
  };

  return (
    <div className="space-y-4">
      <button onClick={startScan} disabled={scanning}
        className={`w-full rounded-2xl border-2 border-dashed p-8 flex flex-col items-center gap-3 transition-all ${
          scanning ? 'border-amber-500/60 bg-amber-500/10 animate-pulse' : 'border-amber-500/30 hover:border-amber-500/60 bg-amber-500/5'}`}>
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${scanning ? 'bg-amber-500/30' : 'bg-amber-500/15'}`}>
          <Wifi className={`w-8 h-8 text-amber-400 ${scanning ? 'animate-bounce' : ''}`} />
        </div>
        <div className="text-center">
          <p className="font-bold text-white text-sm">{scanning ? 'Hold your phone near the chip…' : 'Tap to Scan NFC Chip'}</p>
          <p className="text-xs text-gray-500 mt-1">{scanning ? 'Keep device still' : 'Android Chrome · Any VEDD NFC garment'}</p>
        </div>
      </button>
      {error && <p className="text-sm text-red-400 text-center">{error}</p>}
      <button onClick={() => setShowManual(v => !v)}
        className="w-full text-center text-xs text-gray-500 hover:text-amber-400 transition-colors flex items-center justify-center gap-1">
        <KeyRound className="w-3 h-3" />
        {showManual ? 'Hide' : 'Enter code manually'} (iOS / fallback)
      </button>
      {showManual && (
        <div className="space-y-2">
          <input type="text" value={manual} onChange={e => setManual(e.target.value.toUpperCase())}
            placeholder="e.g. VEDD-001-HOODIE or NFC UID"
            className="w-full bg-gray-900 border border-gray-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none text-sm font-mono tracking-wider" />
          <Button onClick={() => { if (manual.trim().length >= 4) { onScan(manual.trim()); setManual(''); setShowManual(false); } }}
            disabled={manual.trim().length < 4}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold">
            Continue with this code
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Garment Card (extended) ──────────────────────────────────────────────────
function GarmentCard({ g, onTap, isPending, liveDistMiles }: {
  g: ExtendedGarment; onTap: () => void; isPending: boolean;
  liveDistMiles: number | null;
}) {
  const streak = g.currentStreak;
  const fire = streak >= 30 ? '🔥🔥🔥' : streak >= 7 ? '🔥🔥' : streak >= 1 ? '🔥' : '';
  const liveTier = getTier(liveDistMiles);

  return (
    <div className={`relative rounded-2xl border p-4 transition-all ${
      !g.tappedToday
        ? 'bg-gradient-to-br from-amber-500/10 to-yellow-500/6 border-amber-500/30 hover:border-amber-500/50'
        : 'bg-gray-900/70 border-gray-800'}`}>
      {/* NFC badge */}
      <div className="absolute top-3 right-3 flex items-center gap-1 bg-amber-500/15 border border-amber-500/30 rounded-full px-2 py-0.5">
        <Radio className="w-3 h-3 text-amber-400" />
        <span className="text-[9px] font-bold text-amber-400 tracking-widest">NFC</span>
      </div>

      {/* Earning pulse */}
      <div className="absolute bottom-3 left-4 flex items-center gap-1">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-[9px] text-emerald-400 font-semibold">Earning Now</span>
      </div>

      {/* Top row */}
      <div className="flex items-start gap-3 mb-3 pr-16">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-2xl ${!g.tappedToday ? 'bg-amber-500/15' : 'bg-gray-800'}`}>
          {g.icon}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white leading-tight truncate">{g.garmentName}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{g.dropName}</span>
            <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded-full">{g.sizeInfo}</span>
            {streak > 0 && <span className="text-[10px] text-orange-400">{fire} {streak}d</span>}
          </div>
          <p className="text-[9px] font-mono text-gray-600 mt-0.5">{g.garmentCode}</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-10">
        {[
          { label: '$VEDD Earned', value: g.totalEarned.toFixed(0) },
          { label: 'Taps', value: g.totalTaps },
          { label: 'Referrals', value: Math.round((g.referralEarn || 0) / 120) },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-white/5 py-1.5 px-1 text-center">
            <p className="text-white font-bold text-xs">{s.value}</p>
            <p className="text-gray-600 text-[9px] leading-tight">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tap button */}
      {!g.tappedToday ? (
        <button onClick={onTap} disabled={isPending}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-black font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
          {isPending
            ? <><RefreshCw className="w-4 h-4 animate-spin" /> Tapping…</>
            : <><Zap className="w-4 h-4" /> {liveTier.emoji} Tap — Earn +{liveTier.amount} $VEDD</>}
        </button>
      ) : (
        <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4" /> Tapped today ✓ — Come back tomorrow
        </div>
      )}
    </div>
  );
}

// ─── Earn row with scroll reveal ──────────────────────────────────────────────
function EarnRow({ event, visible }: { event: EarnEvent; visible: boolean }) {
  const cfg = EARN_TYPE_CONFIG[event.type] ?? EARN_TYPE_CONFIG.default;
  const tier = event.distanceMiles != null ? getTier(event.distanceMiles) : null;

  return (
    <div className={`flex items-center gap-3 py-2.5 px-3 rounded-xl transition-all duration-500 ${
      visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
    } hover:bg-white/5`}>
      <div className={`w-9 h-9 rounded-xl ${cfg.bg} flex items-center justify-center text-lg shrink-0`}>
        {tier ? tier.emoji : cfg.icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-xs font-semibold truncate">{event.label}</p>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {event.location && <p className="text-gray-500 text-[10px] truncate">{event.location}</p>}
          {event.distanceMiles != null && (
            <span className={`text-[9px] font-bold ${tier?.color ?? 'text-gray-500'}`}>
              {event.distanceMiles.toFixed(1)} mi away
            </span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <p className="text-amber-400 font-bold text-sm">+{event.amount}</p>
        <p className="text-gray-600 text-[9px]">{formatDistanceToNow(new Date(event.createdAt), { addSuffix: true })}</p>
      </div>
    </div>
  );
}

// ─── Popup overlay ────────────────────────────────────────────────────────────
function PopupSheet({ def, onDismiss }: {
  def: typeof POPUP_DEFS[0];
  onDismiss: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end" onClick={onDismiss}>
      {/* Blur overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      {/* Sheet */}
      <div
        className="relative w-full max-w-lg mx-auto bg-gray-950 border border-amber-500/20 rounded-t-2xl p-6 pb-8 animate-in slide-in-from-bottom duration-300"
        onClick={e => e.stopPropagation()}>

        {/* Progress dots */}
        <div className="flex gap-1.5 justify-center mb-4">
          {[0, 1, 2].map(i => (
            <div key={i} className={`h-1.5 rounded-full transition-all ${
              i === def.step - 1 ? 'w-6 bg-amber-400' : i < def.step - 1 ? 'w-3 bg-amber-400/50' : 'w-3 bg-gray-700'
            }`} />
          ))}
        </div>

        <p className="text-[10px] font-mono text-amber-400/60 tracking-widest mb-2">{def.eyebrow}</p>
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1 mb-4">
          <span className="text-xs font-semibold text-amber-300">{def.badge}</span>
        </div>

        <h2 className="text-xl font-black text-white mb-3 leading-tight">{def.title}</h2>
        <p className="text-sm text-gray-400 mb-4 leading-relaxed">{def.body}</p>

        {/* Stat pills */}
        <div className="flex gap-2 flex-wrap mb-5">
          {def.stats.map(s => (
            <span key={s} className="text-[10px] font-bold text-white bg-white/8 border border-white/10 rounded-full px-2.5 py-1">
              {s}
            </span>
          ))}
        </div>

        {/* CTA */}
        <a href={def.ctaHref} target={def.ctaHref.startsWith('http') ? '_blank' : undefined} rel="noopener noreferrer"
          className="block w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm tracking-widest text-center transition-colors mb-3">
          {def.cta}
        </a>
        <button onClick={onDismiss} className="block w-full text-center text-xs text-gray-500 hover:text-white transition-colors py-1">
          {def.dismiss}
        </button>
      </div>
    </div>
  );
}

// ─── Notification Panel ───────────────────────────────────────────────────────
function NotificationPanel({ notifications, onClose, onRead }: {
  notifications: Notification[];
  onClose: () => void;
  onRead: (id: string) => void;
}) {
  const unread = notifications.filter(n => !n.read).length;
  const tagColor: Record<string, string> = {
    garment: 'border-amber-500',
    trading: 'border-green-500',
    token: 'border-blue-400',
    referral: 'border-purple-400',
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-80 h-full bg-gray-950 border-l border-gray-800 overflow-y-auto animate-in slide-in-from-right duration-300"
        onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="text-white font-bold text-sm">Notifications</span>
            {unread > 0 && <span className="w-5 h-5 rounded-full bg-amber-500 text-black text-[9px] font-black flex items-center justify-center">{unread}</span>}
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 space-y-2">
          {notifications.length === 0 && (
            <p className="text-gray-500 text-xs text-center py-8">No notifications yet</p>
          )}
          {notifications.map(n => (
            <div key={n.id} onClick={() => onRead(n.id)}
              className={`p-3 rounded-xl bg-gray-900 border-l-2 cursor-pointer hover:bg-gray-800 transition-colors ${tagColor[n.tag] ?? 'border-gray-600'}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                  n.tag === 'garment' ? 'bg-amber-500/15 text-amber-400' :
                  n.tag === 'trading' ? 'bg-green-500/15 text-green-400' :
                  n.tag === 'token' ? 'bg-blue-500/15 text-blue-400' : 'bg-purple-500/15 text-purple-400'
                }`}>{n.tag}</span>
                {!n.read && <div className="w-2 h-2 rounded-full bg-amber-400 mt-0.5 shrink-0" />}
              </div>
              <p className="text-white text-xs font-semibold leading-snug">{n.title}</p>
              <p className="text-gray-500 text-[10px] mt-0.5 leading-snug">{n.body}</p>
              <p className="text-gray-600 text-[9px] mt-1">{formatDistanceToNow(n.time, { addSuffix: true })}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function VeddClothingPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // ── UI state
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [showActivate, setShowActivate] = useState(false);
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState('VEDD Classic Tee');
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedDrop, setSelectedDrop] = useState('Genesis Drop');
  const [activePopup, setActivePopup] = useState<typeof POPUP_DEFS[0] | null>(null);
  const [rewardAnim, setRewardAnim] = useState<{ amount: number; tier: string; emoji: string } | null>(null);
  const [visibleRows, setVisibleRows] = useState<Set<number>>(new Set());
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const earnRowRefs = useRef<(HTMLDivElement | null)[]>([]);

  // ── GPS / distance state
  const [currentPos, setCurrentPos] = useState<{ lat: number; lon: number } | null>(null);
  const [posLoading, setPosLoading] = useState(false);
  const [showHomeSetup, setShowHomeSetup] = useState(false);
  const [settingHome, setSettingHome] = useState(false);
  const [pendingTapUid, setPendingTapUid] = useState<string | null>(null); // uid waiting for home setup

  // ── Intersection observer for earn history scroll reveal
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            const idx = earnRowRefs.current.indexOf(entry.target as HTMLDivElement);
            if (idx !== -1) setVisibleRows(prev => new Set([...prev, idx]));
          }
        });
      },
      { threshold: 0.1 }
    );
    earnRowRefs.current.forEach(el => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // ── Handle deep-link ?nfc= param
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nfc = params.get('nfc');
    if (nfc && nfc.length >= 4) {
      setPendingUid(nfc.replace(/[:\s]/g, '').toUpperCase());
      setShowActivate(true);
    }
  }, []);

  // ── Queries
  const { data: garments = [] } = useQuery<ExtendedGarment[]>({
    queryKey: ['/api/vedd-clothing/garments'],
    enabled: !DEMO_MODE,
    select: data => data,
  });
  const displayGarments: ExtendedGarment[] = DEMO_MODE ? DEMO_GARMENTS : garments;

  const { data: earnEvents = [] } = useQuery<EarnEvent[]>({
    queryKey: ['/api/vedd-clothing/earn-events'],
    enabled: !DEMO_MODE,
  });
  const displayEvents: EarnEvent[] = DEMO_MODE ? DEMO_EARN_EVENTS : earnEvents;

  const { data: shownPopups = [] } = useQuery<number[]>({
    queryKey: ['/api/vedd-clothing/popup-sequence'],
    enabled: !DEMO_MODE,
  });
  const displayShownPopups: number[] = DEMO_MODE ? DEMO_POPUP_SHOWN : shownPopups;

  const { data: currentUser } = useQuery<any>({ queryKey: ['/api/user'] });
  const { data: homeData, refetch: refetchHome } = useQuery<{
    homeSet: boolean; lat: number | null; lon: number | null;
  }>({
    queryKey: ['/api/vedd-clothing/home'],
    enabled: !DEMO_MODE,
  });
  const referralCode = currentUser?.username || currentUser?.referralCode || user?.username || '';
  const referralLink = `${window.location.origin}/auth?ref=${referralCode}`;

  // ── Timed popup sequence
  const popupShownRef = useRef(new Set<number>(displayShownPopups));
  const markPopupShown = useCallback(async (idx: number) => {
    if (!DEMO_MODE) {
      try {
        await apiRequest('POST', '/api/vedd-clothing/popup-sequence', { sequence_index: idx });
      } catch {}
    }
    popupShownRef.current.add(idx);
    queryClient.invalidateQueries({ queryKey: ['/api/vedd-clothing/popup-sequence'] });
  }, []);

  useEffect(() => {
    const firstLogin = currentUser?.createdAt ? new Date(currentUser.createdAt).getTime() : Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    POPUP_DEFS.forEach(def => {
      if (popupShownRef.current.has(def.index)) return;
      const offset = DEMO_MODE ? def.offsetDemo : def.offsetReal;
      const fireAt = firstLogin + offset;
      const delay = Math.max(1000, fireAt - Date.now());

      const t = setTimeout(() => {
        if (popupShownRef.current.has(def.index)) return;
        // Add notification first
        const notif: Notification = {
          id: `popup-${def.index}-${Date.now()}`,
          tag: def.tag,
          title: def.title,
          body: def.body.slice(0, 80) + '…',
          time: new Date(),
          read: false,
        };
        setNotifications(prev => [notif, ...prev]);
        // Flash bell, then show popup after 800ms
        setTimeout(() => {
          setActivePopup(def);
          markPopupShown(def.index);
        }, 800);
      }, delay);
      timers.push(t);
    });

    return () => timers.forEach(clearTimeout);
  }, [currentUser, markPopupShown]);

  // ── Set-home mutation
  const setHomeMutation = useMutation({
    mutationFn: (coords: { lat: number; lon: number }) =>
      apiRequest('POST', '/api/vedd-clothing/set-home', coords),
    onSuccess: () => {
      refetchHome();
      toast({ title: '🏠 Home location saved!', description: 'Distance rewards are now active on every tap.' });
    },
  });

  // ── Handle "set home" from modal
  const handleSetHome = useCallback(async () => {
    setSettingHome(true);
    const pos = await getCurrentPosition();
    setSettingHome(false);
    if (!pos) {
      toast({ title: 'Could not get location', description: 'Please allow location access and try again.', variant: 'destructive' });
      return;
    }
    setCurrentPos(pos);
    await setHomeMutation.mutateAsync(pos);
    setShowHomeSetup(false);
    // Now fire the pending tap if one was waiting
    if (pendingTapUid) {
      const uid = pendingTapUid;
      setPendingTapUid(null);
      tapWithGps(uid, pos);
    }
  }, [pendingTapUid]);

  // ── Core tap function (GPS-aware)
  const tapWithGps = useCallback(async (uid: string, overridePos?: { lat: number; lon: number } | null) => {
    // Get fresh GPS position
    setPosLoading(true);
    const pos = overridePos !== undefined ? overridePos : await getCurrentPosition();
    setPosLoading(false);
    setCurrentPos(pos);

    const body: Record<string, any> = { nfc_uid: uid };
    if (pos) { body.lat = pos.lat; body.lon = pos.lon; }

    try {
      const res = await apiRequest('POST', '/api/vedd-clothing/tap', body);
      const data = await res.json();
      setRewardAnim({ amount: data.tokensEarned, tier: data.tier || 'Standard', emoji: data.emoji || '📍' });
      const distLabel = data.distanceMiles != null ? ` · ${data.emoji} ${data.distanceMiles.toFixed(1)} mi away` : '';
      toast({ title: `⚡ +${data.tokensEarned} $VEDD Earned!`, description: `${data.garmentName}${distLabel} · ${data.newStreak}d streak 🔥` });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-clothing/garments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-clothing/earn-events'] });
      setTimeout(() => setRewardAnim(null), 3000);
    } catch (err: any) {
      let msg = 'Tap failed';
      try { const d = await err.response?.json(); msg = d?.error || msg; } catch {}
      if (msg.includes('tomorrow')) {
        toast({ title: 'Already tapped today!', description: 'Come back tomorrow for more $VEDD' });
      } else {
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-clothing/garments'] });
    }
  }, []);

  // ── Tap mutation (wraps tapWithGps — checks home setup first)
  const tapMutation = useMutation({
    mutationFn: async (uid: string) => {
      // If home not set yet, show the setup modal (unless DEMO_MODE)
      if (!DEMO_MODE && homeData && !homeData.homeSet) {
        setPendingTapUid(uid);
        setShowHomeSetup(true);
        return; // halted — will resume after home is set or skipped
      }
      await tapWithGps(uid);
    },
    onError: () => {},
  });

  // ── Activate mutation (uses existing /api/nfc/activate)
  const activateMutation = useMutation({
    mutationFn: ({ uid, name }: { uid: string; name: string }) =>
      apiRequest('POST', '/api/nfc/activate', { chipUid: uid, garmentName: name }),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({ title: '🎽 Garment Activated!', description: `+${data.rewardAmount} $VEDD added to your wallet` });
      setPendingUid(null); setShowActivate(false);
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-clothing/garments'] });
    },
    onError: async (err: any) => {
      let msg = 'Activation failed';
      try { const d = await err.response?.json(); msg = d?.error || msg; } catch {}
      if (msg.includes('already own')) { setPendingUid(null); setShowActivate(false); toast({ title: 'Already yours!', description: 'Already in your collection — tap to earn daily' }); }
      else toast({ title: 'Activation Failed', description: msg, variant: 'destructive' });
    },
  });

  const handleScan = (uid: string) => {
    const owned = displayGarments.find(g => g.chipUid === uid.toUpperCase() || g.garmentCode === uid.toUpperCase());
    if (owned) {
      if (!owned.tappedToday) tapMutation.mutate(uid);
      else toast({ title: 'Already tapped today', description: 'Come back tomorrow!' });
      setShowActivate(false);
      return;
    }
    setPendingUid(uid);
  };

  const copyReferralLink = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      toast({ title: '🔱 Referral link copied — cast your net', description: referralLink });
    });
  };

  const totalVedd = displayGarments.reduce((s, g) => s + (g.totalEarned || 0) + (g.referralEarn || 0), 0);
  const totalTaps = displayGarments.reduce((s, g) => s + g.totalTaps, 0);
  const unreadCount = notifications.filter(n => !n.read).length;

  // Live distance preview (haversine — mirrors server, for display only)
  const liveDistMiles: number | null = (() => {
    if (DEMO_MODE) return 18.4; // demo shows "Cross Town"
    if (!currentPos || !homeData?.lat || !homeData?.lon) return null;
    const toRad = (d: number) => d * Math.PI / 180;
    const R = 3958.8;
    const dLat = toRad(currentPos.lat - homeData.lat);
    const dLon = toRad(currentPos.lon - homeData.lon);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(homeData.lat)) * Math.cos(toRad(currentPos.lat)) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10;
  })();
  const liveTier = getTier(liveDistMiles);

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white overflow-x-hidden">

      {/* ── GRAIN OVERLAY ─────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-[999] opacity-[0.035]"
        style={{ background: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='1'/%3E%3C/svg%3E\")" }} />

      {/* ── REWARD ANIMATION ──────────────────────────────────────────────── */}
      {rewardAnim && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="animate-bounce bg-amber-500 text-black font-black text-2xl px-8 py-4 rounded-3xl shadow-2xl shadow-amber-500/50 text-center">
            <div>+{rewardAnim.amount} $VEDD ⚡</div>
            <div className="text-sm font-bold mt-1 opacity-80">{rewardAnim.emoji} {rewardAnim.tier}</div>
          </div>
        </div>
      )}

      {/* ── HOME SETUP MODAL ──────────────────────────────────────────────── */}
      {showHomeSetup && (
        <HomeSetupModal
          loading={settingHome}
          onSet={handleSetHome}
          onSkip={() => {
            setShowHomeSetup(false);
            const uid = pendingTapUid;
            setPendingTapUid(null);
            if (uid) tapWithGps(uid, null); // tap without distance
          }}
        />
      )}

      {/* ── POPUP SEQUENCE ────────────────────────────────────────────────── */}
      {activePopup && (
        <PopupSheet def={activePopup} onDismiss={() => setActivePopup(null)} />
      )}

      {/* ── NOTIFICATION PANEL ────────────────────────────────────────────── */}
      {showNotifPanel && (
        <NotificationPanel
          notifications={notifications}
          onClose={() => setShowNotifPanel(false)}
          onRead={(id) => setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
          1. TOP NAV (sticky)
         ═══════════════════════════════════════════════════════════════════ */}
      <div className="sticky top-0 z-40 bg-gray-950/95 backdrop-blur-sm border-b border-gray-800/60">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link href="/">
            <span className="font-black text-xl tracking-widest text-amber-400" style={{ fontFamily: 'system-ui, sans-serif', letterSpacing: '0.15em' }}>
              VEDD
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowNotifPanel(true)} className="relative p-2 rounded-xl hover:bg-white/5 transition-colors">
              <Bell className="w-5 h-5 text-gray-400" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
              )}
            </button>
            <Link href="/profile">
              <div className="w-8 h-8 rounded-full bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
                <span className="text-amber-400 font-black text-xs">
                  {(user?.username || user?.email || 'V')[0].toUpperCase()}
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 pb-24 space-y-6">

        {/* ══════════════════════════════════════════════════════════════════
            2. HERO
           ═════════════════════════════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-2xl mt-4 bg-gradient-to-br from-gray-900 via-amber-950/20 to-gray-900 border border-amber-500/15 p-6">
          {/* Top border glow */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/60 to-transparent" />
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-amber-500/5 blur-3xl -translate-y-1/2 translate-x-1/2" />

          <p className="text-[10px] font-mono text-amber-400/50 tracking-[0.3em] mb-2">// VEDD CLOTHING ECOSYSTEM</p>
          <h1 className="text-3xl font-black leading-tight mb-1 text-white">
            WEAR THE CULTURE.<br />
            <span className="text-amber-400">EARN THE CIPHER.</span>
          </h1>
          <p className="text-sm text-gray-500 mb-5 max-w-sm">
            Every VEDD garment is a broadcasting node. NFC chips turn street fashion into a live advertising network — and rewards you for wearing it.
          </p>

          {/* Stat pills */}
          <div className="flex gap-2 flex-wrap">
            {[
              { label: '$VEDD Balance', value: `${totalVedd.toFixed(0)}` },
              { label: 'Garments Active', value: `${displayGarments.length}` },
              { label: 'Referrals', value: `${Math.round(totalVedd / 120)}` },
              { label: 'NFC Taps', value: `${totalTaps}` },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-1.5 bg-white/5 border border-white/8 rounded-full px-3 py-1.5">
                <span className="text-amber-400 font-black text-xs">{s.value}</span>
                <span className="text-gray-500 text-[10px]">{s.label}</span>
              </div>
            ))}
            {/* Live distance tier pill */}
            {(liveDistMiles !== null || DEMO_MODE) && (
              <div className={`flex items-center gap-1.5 border rounded-full px-3 py-1.5 ${liveTier.color} border-current/20 bg-current/5`} style={{ color: 'inherit' }}>
                <span className="font-black text-xs">{liveTier.emoji} {liveTier.tier}</span>
                <span className="text-[10px] opacity-70">+{liveTier.amount} $VEDD</span>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            3. GARMENTS
           ═════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-black text-white tracking-wide">MY WARDROBE</h2>
              <p className="text-[10px] text-gray-600">Each garment = a live ad node earning $VEDD</p>
            </div>
            <button onClick={() => setShowActivate(v => !v)}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/25 rounded-xl px-3 py-1.5 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add Garment
            </button>
          </div>

          {/* Activate panel (collapsible) */}
          {showActivate && (
            <div className="mb-4 rounded-2xl border border-amber-500/20 bg-gray-900/80 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-amber-400" />
                  <span className="text-sm font-bold text-amber-400">Activate Garment</span>
                </div>
                <button onClick={() => { setShowActivate(false); setPendingUid(null); }}
                  className="text-gray-500 hover:text-white transition-colors"><X className="w-4 h-4" /></button>
              </div>
              {pendingUid ? (
                <div className="space-y-3">
                  <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3">
                    <p className="text-xs text-gray-400 mb-0.5">Chip detected</p>
                    <p className="font-mono font-bold text-amber-400 text-sm break-all">{pendingUid}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Garment type</label>
                      <select value={selectedName} onChange={e => setSelectedName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500/50 rounded-xl px-3 py-2 text-white text-xs focus:outline-none">
                        {['VEDD Classic Tee','VEDD Oversized Hoodie','VEDD Snapback Cap','VEDD Track Pants','VEDD Bomber Jacket','VEDD Long Sleeve','VEDD Crewneck','VEDD Zip-Up Hoodie','VEDD Beanie','Other VEDD Item']
                          .map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-gray-500 mb-1">Size</label>
                      <select value={selectedSize} onChange={e => setSelectedSize(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500/50 rounded-xl px-3 py-2 text-white text-xs focus:outline-none">
                        {['XS','S','M','L','XL','2XL','One Size'].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
                    <p className="text-xs text-emerald-400 font-semibold">+50 $VEDD activation bonus — credited instantly</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setPendingUid(null)} className="flex-1 border-gray-700 text-xs h-9">Rescan</Button>
                    <Button onClick={() => activateMutation.mutate({ uid: pendingUid!, name: selectedName })}
                      disabled={activateMutation.isPending} className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs h-9">
                      {activateMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Activate & Earn 50 $VEDD'}
                    </Button>
                  </div>
                </div>
              ) : (
                <NfcScanner onScan={handleScan} />
              )}
            </div>
          )}

          {displayGarments.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 p-10 text-center">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4 text-3xl">👕</div>
              <p className="text-white font-bold mb-1">No garments yet</p>
              <p className="text-sm text-gray-500 mb-5">Tap your VEDD garment's NFC chip or enter the code on the tag</p>
              <div className="flex flex-col gap-3">
                <button onClick={() => setShowActivate(true)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors">
                  <Wifi className="w-4 h-4" /> Activate My Garment
                </button>
                <a href="https://vedd.store" target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl border border-amber-500/40 text-amber-400 font-semibold text-sm transition-colors hover:border-amber-500/70">
                  <ShoppingBag className="w-4 h-4" /> Shop VEDD Clothing <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {/* ── Live distance preview ── */}
              {(() => {
                if (!homeData?.homeSet && !DEMO_MODE) return (
                  <button onClick={() => setShowHomeSetup(true)}
                    className="w-full flex items-center gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-4 py-2.5 mb-2 hover:bg-amber-500/15 transition-colors">
                    <span className="text-lg">📍</span>
                    <div className="flex-1 text-left">
                      <p className="text-amber-400 text-xs font-bold">Set home to unlock distance rewards</p>
                      <p className="text-gray-600 text-[10px]">Earn up to 150 $VEDD when you tap far from home</p>
                    </div>
                    <span className="text-[10px] text-amber-400 font-bold">SET UP →</span>
                  </button>
                );
                if (currentPos && homeData?.lat && homeData?.lon) {
                  const dist = Math.sqrt(
                    (currentPos.lat - homeData.lat) ** 2 * 12321 +
                    (currentPos.lon - homeData.lon) ** 2 * 7921
                  ); // rough, server calculates exact
                  return null; // server does exact math — just show the stored tier on success
                }
                return null;
              })()}

              {/* Tap all button */}
              {displayGarments.filter(g => !g.tappedToday).length > 1 && (
                <button
                  onClick={() => displayGarments.filter(g => !g.tappedToday).forEach(g => tapMutation.mutate(g.chipUid))}
                  disabled={tapMutation.isPending}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all">
                  <Zap className="w-4 h-4" />
                  Tap All {displayGarments.filter(g => !g.tappedToday).length} Ready — Earn +{displayGarments.filter(g => !g.tappedToday).length * 48} $VEDD
                </button>
              )}
              {displayGarments.map(g => (
                <GarmentCard key={g.id} g={g} onTap={() => tapMutation.mutate(g.chipUid)} isPending={tapMutation.isPending || posLoading} liveDistMiles={liveDistMiles} />
              ))}
              <button onClick={() => setShowActivate(v => !v)}
                className="w-full py-3 rounded-xl border border-dashed border-amber-500/20 hover:border-amber-500/40 text-amber-400/60 hover:text-amber-400 text-xs font-semibold flex items-center justify-center gap-2 transition-all">
                <Plus className="w-3.5 h-3.5" /> Activate another garment
              </button>
            </div>
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            4. EARN HISTORY
           ═════════════════════════════════════════════════════════════════ */}
        {displayEvents.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-black text-white tracking-wide">EARN HISTORY</h2>
                <p className="text-[10px] text-gray-600">Last 30 days of $VEDD earned</p>
              </div>
              <span className="text-xs font-bold text-amber-400">
                +{displayEvents.reduce((s, e) => s + e.amount, 0)} total
              </span>
            </div>
            <div className="rounded-2xl border border-gray-800 bg-gray-900/50 divide-y divide-gray-800/50">
              {displayEvents.map((event, idx) => (
                <div key={event.id} ref={el => { earnRowRefs.current[idx] = el; }}>
                  <EarnRow event={event} visible={visibleRows.has(idx)} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            5. LOCKED AI TRADING (upsell teaser)
           ═════════════════════════════════════════════════════════════════ */}
        <section className="relative overflow-hidden rounded-2xl border border-gray-700/50">
          {/* Blurred fake chart background */}
          <div className="h-48 bg-gradient-to-br from-gray-900 via-emerald-950/20 to-gray-900 relative overflow-hidden">
            {/* Animated glow sweep on top border */}
            <div className="absolute inset-x-0 top-0 h-0.5 overflow-hidden">
              <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-amber-500 to-transparent animate-[shimmer_2s_linear_infinite]" />
            </div>
            {/* Fake chart lines (CSS art) */}
            <svg className="absolute inset-0 w-full h-full blur-sm opacity-40" viewBox="0 0 400 100" preserveAspectRatio="none">
              <polyline points="0,70 40,60 80,65 120,40 160,45 200,25 240,30 280,20 320,35 360,25 400,15"
                fill="none" stroke="#10b981" strokeWidth="2" />
              <polyline points="0,80 40,75 80,78 120,55 160,60 200,45 240,50 280,38 320,50 360,42 400,30"
                fill="none" stroke="#10b981" strokeWidth="1" opacity="0.5" />
            </svg>
            {/* Lock overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                <Lock className="w-6 h-6 text-amber-400" />
              </div>
              <div className="text-center">
                <p className="text-white font-black text-base">AI Trading — Members Only</p>
                <p className="text-gray-400 text-xs mt-0.5">EUR/USD · Gold · Crypto · 24/7 Auto Execution</p>
              </div>
              <div className="flex gap-3 text-[10px] text-gray-500">
                <span>📈 4H & 1H signals</span>
                <span>🤖 ICT strategy AI</span>
                <span>⚡ Auto EA</span>
              </div>
            </div>
          </div>
          <div className="bg-gray-900 border-t border-gray-800 p-4 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-sm">Unlock AI Trading</p>
              <p className="text-gray-500 text-xs">Live signals + EA auto-execution for your MT5</p>
            </div>
            <Link href="/subscription">
              <button className="flex items-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-black text-xs px-4 py-2.5 rounded-xl transition-colors tracking-wide whitespace-nowrap">
                $47/MO <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </Link>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            6. REFERRAL CARD — "Cast Your Net"
           ═════════════════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-950/30 to-gray-900 p-5">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" style={{ position: 'relative' }} />
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[10px] font-mono text-amber-400/50 tracking-widest mb-1">// REFERRAL SYSTEM</p>
              <h2 className="text-lg font-black text-white">Cast Your Net 🔱</h2>
              <p className="text-xs text-gray-500 mt-0.5">+120 $VEDD for every person who joins through your link</p>
            </div>
            <div className="w-10 h-10 rounded-2xl bg-amber-500/15 border border-amber-500/25 flex items-center justify-center text-xl">
              🔱
            </div>
          </div>

          {/* Live referral link */}
          <div className="flex items-center gap-2 bg-black/40 border border-amber-500/20 rounded-xl p-3 mb-4">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-gray-600 mb-0.5">Your referral link</p>
              <p className="text-amber-400 text-xs font-mono truncate">{referralLink}</p>
            </div>
            <button onClick={copyReferralLink}
              className="shrink-0 p-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/20 transition-colors">
              <Copy className="w-4 h-4 text-amber-400" />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            {[
              { label: 'Per Sign-Up', value: '+120 $V' },
              { label: 'Per Subscribe', value: '+240 $V' },
              { label: 'Your Code', value: referralCode || '—' },
            ].map(s => (
              <div key={s.label} className="rounded-xl bg-black/30 p-2 text-center border border-white/5">
                <p className="text-amber-400 font-bold text-xs">{s.value}</p>
                <p className="text-gray-600 text-[9px]">{s.label}</p>
              </div>
            ))}
          </div>

          <button onClick={copyReferralLink}
            className="w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-black text-sm tracking-wide transition-colors">
            Copy Referral Link — Cast Your Net 🔱
          </button>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            7. CULTURE + TECH INFO STRIP
           ═════════════════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-gray-800 bg-gray-900/40 p-5 space-y-4">
          <p className="text-[10px] font-mono text-gray-600 tracking-widest">// WHAT THIS IS</p>
          <div className="grid grid-cols-1 gap-3">
            {[
              { icon: '📡', title: 'Clothing as Broadcast', desc: 'Every garment carries an NFC chip — a mini antenna that turns your outfit into a live ad node earning $VEDD whenever it\'s tapped.' },
              { icon: '🎨', title: 'Street Fashion + Tech', desc: 'VEDD merges street fashion culture, digital identity, and blockchain rewards. Wear the art. Earn the cipher.' },
              { icon: '🌐', title: 'Community Gateway', desc: 'Your clothes are your on-ramp. From NFC taps to AI trading signals — every tap pulls people deeper into the VEDD ecosystem.' },
              { icon: '⚡', title: '48 $VEDD Per Tap', desc: 'Each NFC tap earns 48 $VEDD instantly — no approval, no waiting. Stack taps, stack referrals, unlock trading.' },
            ].map(item => (
              <div key={item.title} className="flex items-start gap-3">
                <span className="text-xl w-8 shrink-0">{item.icon}</span>
                <div>
                  <p className="text-white font-bold text-xs mb-0.5">{item.title}</p>
                  <p className="text-gray-500 text-[11px] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Shop link ── */}
        <a href="https://vedd.store" target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-between w-full rounded-2xl border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 p-4 transition-colors group">
          <div className="flex items-center gap-3">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-white font-bold text-sm">Shop VEDD Clothing</p>
              <p className="text-gray-500 text-xs">Get your NFC-chipped garment — join the culture</p>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-amber-400/50 group-hover:text-amber-400 transition-colors" />
        </a>

      </div>

      {/* ── DEMO MODE banner ── */}
      {DEMO_MODE && (
        <div className="fixed bottom-20 left-4 right-4 max-w-sm mx-auto bg-amber-500 text-black text-xs font-bold rounded-xl px-4 py-2 text-center z-50 shadow-lg">
          DEMO MODE — Set DEMO_MODE = false to connect live DB
        </div>
      )}
    </div>
  );
}
