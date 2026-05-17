import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Link, useLocation } from 'wouter';
import {
  Shirt, Coins, CheckCircle, Clock, XCircle, ExternalLink,
  ChevronRight, Zap, Flame, Trophy, ShoppingBag, Wifi,
  KeyRound, ArrowRight, Sparkles, Star, RefreshCw, Plus,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TokenomicsBanner } from '@/components/vedd-rewards/tokenomics-banner';

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface NfcGarment {
  id: number;
  chipUid: string;
  garmentName: string;
  activatedAt: string;
  totalTaps: number;
  totalEarned: number;
  lastTapAt: string | null;
  currentStreak: number;
  bestStreak: number;
  tappedToday: boolean;
}

interface LegacyClaim {
  id: number;
  productName: string;
  claimCode: string;
  status: string;
  rewardAmount: number;
  submittedAt: string;
}

interface WearStats {
  totalClaims: number;
  totalVeddEarned: number;
  pendingClaims: number;
}

const DAILY_REWARD = 15;
const ACTIVATION_BONUS = 50;

const GARMENT_OPTIONS = [
  'VEDD Classic Tee', 'VEDD Oversized Hoodie', 'VEDD Snapback Cap',
  'VEDD Track Pants', 'VEDD Bomber Jacket', 'VEDD Long Sleeve',
  'VEDD Cargo Shorts', 'VEDD Crewneck Sweatshirt', 'VEDD Zip-Up Hoodie',
  'VEDD Beanie', 'Other VEDD Item',
];

/* ─── Garment Card ───────────────────────────────────────────────────────── */
function GarmentCard({ garment, onTap }: { garment: NfcGarment; onTap: (uid: string) => void }) {
  const streakFire = garment.currentStreak >= 30 ? '🔥🔥🔥' : garment.currentStreak >= 7 ? '🔥🔥' : garment.currentStreak >= 1 ? '🔥' : '';
  const canTap = !garment.tappedToday;
  const bonus = garment.currentStreak >= 30 ? 10 : garment.currentStreak >= 7 ? 5 : 0;
  const todayReward = DAILY_REWARD + bonus;

  return (
    <div className={`rounded-2xl border p-4 transition-all ${
      canTap
        ? 'bg-gradient-to-br from-amber-500/12 to-yellow-500/8 border-amber-500/40 hover:border-amber-500/60'
        : 'bg-gray-900/80 border-gray-800'
    }`}>
      {/* Top row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${canTap ? 'bg-amber-500/20' : 'bg-gray-800'}`}>
            <Shirt className={`w-5 h-5 ${canTap ? 'text-amber-400' : 'text-gray-600'}`} />
          </div>
          <div>
            <p className="text-sm font-bold text-white leading-tight">{garment.garmentName}</p>
            <p className="text-[10px] font-mono text-gray-600 leading-tight">
              {garment.chipUid.length > 12
                ? `${garment.chipUid.slice(0, 6)}…${garment.chipUid.slice(-4)}`
                : garment.chipUid}
            </p>
          </div>
        </div>
        {garment.currentStreak > 0 && (
          <span className="text-xs font-bold text-amber-400">{streakFire} {garment.currentStreak}d</span>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Taps', value: garment.totalTaps },
          { label: 'Earned', value: `${garment.totalEarned.toFixed(0)} V` },
          { label: 'Best', value: `${garment.bestStreak}d` },
        ].map(s => (
          <div key={s.label} className="rounded-lg bg-white/5 py-1.5 text-center">
            <p className="text-white font-bold text-xs">{s.value}</p>
            <p className="text-gray-600 text-[9px]">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tap button */}
      {canTap ? (
        <button
          onClick={() => onTap(garment.chipUid)}
          className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 transition-all text-black font-bold text-sm flex items-center justify-center gap-2"
        >
          <Zap className="w-4 h-4" />
          Tap — Earn +{todayReward} VEDD{bonus > 0 ? ` (+${bonus} streak!)` : ''}
        </button>
      ) : (
        <div className="w-full py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold flex items-center justify-center gap-2">
          <CheckCircle className="w-4 h-4" />
          Tapped today ✓ — Come back tomorrow
        </div>
      )}
    </div>
  );
}

/* ─── NFC Scanner Component ──────────────────────────────────────────────── */
function NfcScanner({ onScan }: { onScan: (uid: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');
  const [manualUid, setManualUid] = useState('');
  const [showManual, setShowManual] = useState(false);
  const { toast } = useToast();

  const startScan = async () => {
    setError('');
    // @ts-ignore — NDEFReader is Chrome/Android only
    if (!('NDEFReader' in window)) {
      setShowManual(true);
      return;
    }
    try {
      setScanning(true);
      // @ts-ignore
      const ndef = new NDEFReader();
      await ndef.scan();
      // @ts-ignore
      ndef.addEventListener('reading', ({ serialNumber }: { serialNumber: string }) => {
        setScanning(false);
        const uid = serialNumber.replace(/:/g, '').toUpperCase();
        onScan(uid);
      });
      // @ts-ignore
      ndef.addEventListener('readingerror', () => {
        setScanning(false);
        setError('Could not read chip — try again');
      });
    } catch (e: any) {
      setScanning(false);
      if (e.name === 'NotAllowedError') {
        setError('NFC permission denied — please allow NFC access');
      } else {
        setShowManual(true);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* NFC tap area */}
      <button
        onClick={startScan}
        disabled={scanning}
        className={`w-full rounded-2xl border-2 border-dashed p-8 flex flex-col items-center gap-3 transition-all ${
          scanning
            ? 'border-amber-500/60 bg-amber-500/10 animate-pulse'
            : 'border-amber-500/30 hover:border-amber-500/60 bg-amber-500/5'
        }`}
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center ${scanning ? 'bg-amber-500/30' : 'bg-amber-500/15'}`}>
          <Wifi className={`w-8 h-8 text-amber-400 ${scanning ? 'animate-bounce' : ''}`} />
        </div>
        <div className="text-center">
          <p className="font-bold text-white text-sm">
            {scanning ? 'Hold your phone near the chip…' : 'Tap to Scan NFC Chip'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {scanning ? 'Keep device still' : 'Android Chrome · Works with any VEDD NFC garment'}
          </p>
        </div>
      </button>

      {error && <p className="text-sm text-red-400 text-center">{error}</p>}

      {/* Manual entry toggle */}
      <button
        onClick={() => setShowManual(v => !v)}
        className="w-full text-center text-xs text-gray-500 hover:text-amber-400 transition-colors flex items-center justify-center gap-1"
      >
        <KeyRound className="w-3 h-3" />
        {showManual ? 'Hide' : 'Enter chip code manually'} (iOS / fallback)
      </button>

      {showManual && (
        <div className="space-y-2">
          <input
            type="text"
            value={manualUid}
            onChange={e => setManualUid(e.target.value.toUpperCase())}
            placeholder="e.g. 04AB2C8F3D1200 or VEDDXXXXXX"
            className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none text-sm font-mono tracking-wider"
          />
          <p className="text-xs text-gray-600">Find the code printed on your garment tag or from the QR on the tag</p>
          <Button
            onClick={() => { if (manualUid.trim().length >= 4) { onScan(manualUid.trim()); setManualUid(''); setShowManual(false); } }}
            disabled={manualUid.trim().length < 4}
            className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold"
          >
            Continue with this code
          </Button>
        </div>
      )}
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */
export default function VeddClothingPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [tab, setTab] = useState<'garments' | 'activate' | 'legacy'>('garments');
  const [selectedGarmentName, setSelectedGarmentName] = useState('VEDD Classic Tee');
  const [pendingUid, setPendingUid] = useState<string | null>(null);
  const [rewardAnim, setRewardAnim] = useState<{ amount: number; streak: number } | null>(null);

  // ── Handle deep-link: /clothing?nfc={uid}
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const nfcUid = params.get('nfc');
    if (nfcUid && nfcUid.length >= 4) {
      setPendingUid(nfcUid.replace(/[:\s]/g, '').toUpperCase());
      setTab('activate');
    }
  }, [location]);

  // ── Queries
  const { data: garments = [], refetch: refetchGarments } = useQuery<NfcGarment[]>({
    queryKey: ['/api/nfc/my-garments'],
    refetchInterval: 30000,
  });

  const { data: stats } = useQuery<WearStats>({
    queryKey: ['/api/wear-to-earn/stats'],
    refetchInterval: 60000,
  });

  const { data: legacyClaims } = useQuery<LegacyClaim[]>({
    queryKey: ['/api/wear-to-earn/claims'],
  });

  // ── Total earned across both systems
  const nfcTotalEarned = garments.reduce((s, g) => s + g.totalEarned, 0);
  const legacyTotalEarned = stats?.totalVeddEarned || 0;
  const grandTotal = nfcTotalEarned + legacyTotalEarned;

  // ── Mutations
  const activateMutation = useMutation({
    mutationFn: ({ uid, name }: { uid: string; name: string }) =>
      apiRequest('POST', '/api/nfc/activate', { chipUid: uid, garmentName: name }),
    onSuccess: async (res) => {
      const data = await res.json();
      setRewardAnim({ amount: data.rewardAmount, streak: 1 });
      toast({ title: `🎽 Garment Activated!`, description: `+${data.rewardAmount} VEDD added to your wallet` });
      setPendingUid(null);
      setTab('garments');
      refetchGarments();
      queryClient.invalidateQueries({ queryKey: ['/api/wear-to-earn/stats'] });
      setTimeout(() => setRewardAnim(null), 3000);
    },
    onError: async (err: any) => {
      let msg = 'Activation failed';
      try { const d = await err.response?.json(); msg = d?.error || msg; } catch {}
      // If already owned by this user, switch to garments tab
      if (msg.includes('already own')) {
        toast({ title: 'Already yours!', description: 'This garment is already in your collection' });
        setTab('garments');
        setPendingUid(null);
      } else {
        toast({ title: 'Activation Failed', description: msg, variant: 'destructive' });
      }
    },
  });

  const tapMutation = useMutation({
    mutationFn: (uid: string) => apiRequest('POST', '/api/nfc/daily-tap', { chipUid: uid }),
    onSuccess: async (res) => {
      const data = await res.json();
      setRewardAnim({ amount: data.rewardAmount, streak: data.newStreak });
      const streakMsg = data.streakBonus > 0 ? ` (+${data.streakBonus} streak bonus 🔥)` : '';
      toast({ title: `⚡ +${data.rewardAmount} VEDD Earned!`, description: `${data.garmentName} · ${data.newStreak}-day streak${streakMsg}` });
      refetchGarments();
      queryClient.invalidateQueries({ queryKey: ['/api/wear-to-earn/stats'] });
      setTimeout(() => setRewardAnim(null), 3000);
    },
    onError: async (err: any) => {
      let msg = 'Tap failed';
      try { const d = await err.response?.json(); msg = d?.error || msg; } catch {}
      if (msg.includes('tomorrow')) {
        toast({ title: 'Already tapped today!', description: 'Come back tomorrow for your next reward', variant: 'default' });
        refetchGarments();
      } else {
        toast({ title: 'Error', description: msg, variant: 'destructive' });
      }
    },
  });

  const handleScan = (uid: string) => {
    // Check if user already owns this chip
    const owned = garments.find(g => g.chipUid === uid.replace(/[:\s-]/g, '').toUpperCase());
    if (owned) {
      if (!owned.tappedToday) {
        tapMutation.mutate(uid);
      } else {
        toast({ title: 'Already tapped today', description: 'Come back tomorrow for your next reward' });
      }
      return;
    }
    // New chip — go to activate flow
    setPendingUid(uid);
    setTab('activate');
  };

  const handleActivate = () => {
    if (!pendingUid) return;
    activateMutation.mutate({ uid: pendingUid, name: selectedGarmentName });
  };

  const canTapCount = garments.filter(g => !g.tappedToday).length;
  const totalStreaks = garments.reduce((s, g) => s + g.currentStreak, 0);

  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* ── Reward animation overlay ── */}
      {rewardAnim && (
        <div className="fixed inset-0 pointer-events-none z-50 flex items-center justify-center">
          <div className="animate-bounce bg-amber-500 text-black font-black text-3xl px-8 py-4 rounded-3xl shadow-2xl shadow-amber-500/50">
            +{rewardAnim.amount} VEDD ⚡
          </div>
        </div>
      )}

      {/* ── Hero ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-amber-950/30 to-gray-900 border-b border-amber-500/20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
        <div className="relative max-w-2xl mx-auto px-4 py-10 text-center">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Shirt className="w-8 h-8 text-amber-400" />
            </div>
          </div>
          <h1 className="text-3xl font-black mb-2 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 bg-clip-text text-transparent">
            Wear. Tap. Earn.
          </h1>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-5">
            Every VEDD garment has an NFC chip inside. Tap it daily to earn <span className="text-amber-400 font-bold">{DAILY_REWARD} VEDD</span> straight to your wallet — no approval needed.
          </p>

          {/* Summary stats */}
          {(garments.length > 0 || grandTotal > 0) && (
            <div className="flex items-center justify-center gap-6 mt-4">
              <div className="text-center">
                <p className="text-2xl font-black text-amber-400">{garments.length}</p>
                <p className="text-[10px] text-gray-600 uppercase tracking-wide">Garments</p>
              </div>
              <div className="w-px h-8 bg-gray-800" />
              <div className="text-center">
                <p className="text-2xl font-black text-yellow-400">{grandTotal.toFixed(0)}</p>
                <p className="text-[10px] text-gray-600 uppercase tracking-wide">VEDD Earned</p>
              </div>
              <div className="w-px h-8 bg-gray-800" />
              <div className="text-center">
                <p className="text-2xl font-black text-orange-400">{totalStreaks}</p>
                <p className="text-[10px] text-gray-600 uppercase tracking-wide">Streak Days</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── Tab bar ── */}
        <div className="flex gap-1 p-1 rounded-xl bg-gray-900 border border-gray-800">
          {([
            { id: 'garments' as const, label: 'My Garments', badge: canTapCount > 0 ? canTapCount : undefined },
            { id: 'activate' as const, label: 'Activate / Scan', badge: undefined },
            { id: 'legacy' as const, label: 'Legacy Claims', badge: undefined },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all relative ${
                tab === t.id ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t.label}
              {t.badge !== undefined && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══ TAB: MY GARMENTS ══ */}
        {tab === 'garments' && (
          <div className="space-y-4">
            {/* Reward rate banner */}
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/8 p-3 flex items-center gap-3">
              <Coins className="w-5 h-5 text-amber-400 shrink-0" />
              <div className="flex-1 text-xs">
                <span className="text-amber-400 font-bold">{DAILY_REWARD} VEDD/day</span>
                <span className="text-gray-400"> per garment · </span>
                <span className="text-orange-400 font-semibold">+5 VEDD</span>
                <span className="text-gray-400"> at 7-day streak · </span>
                <span className="text-red-400 font-semibold">+10 VEDD</span>
                <span className="text-gray-400"> at 30-day streak</span>
              </div>
              <span className="text-[9px] text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">Instant · No approval</span>
            </div>

            {garments.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-amber-500/20 bg-amber-500/5 p-10 text-center">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                  <Wifi className="w-7 h-7 text-amber-400/50" />
                </div>
                <p className="text-white font-bold mb-1">No garments yet</p>
                <p className="text-sm text-gray-500 mb-5">Tap your VEDD garment's NFC chip or enter the code on the tag</p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <button
                    onClick={() => setTab('activate')}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-sm transition-colors"
                  >
                    <Wifi className="w-4 h-4" />
                    Activate My Garment
                  </button>
                  <a
                    href="https://replit.com/@goddren/VeddVerse?s=app"
                    target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-amber-500/40 text-amber-400 font-semibold text-sm transition-colors hover:border-amber-500/70"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Shop VEDD Clothing
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
            ) : (
              <>
                {/* Tap all ready button */}
                {canTapCount > 1 && (
                  <button
                    onClick={() => {
                      const untapped = garments.filter(g => !g.tappedToday);
                      untapped.forEach(g => tapMutation.mutate(g.chipUid));
                    }}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-black font-bold text-sm flex items-center justify-center gap-2 transition-all"
                  >
                    <Zap className="w-4 h-4" />
                    Tap All {canTapCount} Ready Garments — Earn +{canTapCount * DAILY_REWARD}+ VEDD
                  </button>
                )}

                <div className="grid gap-3">
                  {garments.map(g => (
                    <GarmentCard key={g.id} garment={g} onTap={uid => tapMutation.mutate(uid)} />
                  ))}
                </div>

                {/* Add another garment */}
                <button
                  onClick={() => setTab('activate')}
                  className="w-full py-3 rounded-xl border border-dashed border-amber-500/25 hover:border-amber-500/50 text-amber-400/60 hover:text-amber-400 text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Activate another garment
                </button>
              </>
            )}
          </div>
        )}

        {/* ══ TAB: ACTIVATE / SCAN ══ */}
        {tab === 'activate' && (
          <div className="space-y-5">
            <Card className="bg-gray-900 border-amber-500/20">
              <CardHeader className="border-b border-gray-800 pb-4">
                <CardTitle className="flex items-center gap-2 text-amber-400 text-base">
                  <Wifi className="w-5 h-5" />
                  Activate Your VEDD Garment
                </CardTitle>
                <p className="text-xs text-gray-500 mt-1">
                  First time? Tap your NFC chip to claim ownership and earn <span className="text-amber-400 font-semibold">{ACTIVATION_BONUS} VEDD</span> activation bonus.
                  Then earn <span className="text-amber-400 font-semibold">{DAILY_REWARD} VEDD/day</span> every time you tap.
                </p>
              </CardHeader>
              <CardContent className="pt-5 space-y-5">

                {/* If we have a pending UID from deep-link or scan */}
                {pendingUid ? (
                  <div className="space-y-4">
                    <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4">
                      <p className="text-xs text-gray-400 mb-1">Chip detected</p>
                      <p className="font-mono font-bold text-amber-400 text-sm break-all">{pendingUid}</p>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-300 mb-2">
                        What garment is this chip in?
                      </label>
                      <select
                        value={selectedGarmentName}
                        onChange={e => setSelectedGarmentName(e.target.value)}
                        className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-white focus:outline-none text-sm"
                      >
                        {GARMENT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <Sparkles className="w-5 h-5 text-emerald-400 shrink-0" />
                      <div>
                        <p className="text-emerald-400 font-bold text-sm">+{ACTIVATION_BONUS} VEDD activation bonus</p>
                        <p className="text-xs text-gray-500">Credited instantly to your wallet · Then {DAILY_REWARD} VEDD/day every time you tap</p>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setPendingUid(null)}
                        className="flex-1 border-gray-700"
                      >
                        Rescan
                      </Button>
                      <Button
                        onClick={handleActivate}
                        disabled={activateMutation.isPending}
                        className="flex-1 bg-amber-500 hover:bg-amber-400 text-black font-bold"
                      >
                        {activateMutation.isPending
                          ? <span className="flex items-center gap-2"><RefreshCw className="w-4 h-4 animate-spin" /> Activating…</span>
                          : <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> Activate & Earn {ACTIVATION_BONUS} VEDD</span>}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <NfcScanner onScan={handleScan} />
                )}
              </CardContent>
            </Card>

            {/* How NFC works explainer */}
            <div className="rounded-xl border border-gray-800 bg-gray-900/50 p-4 space-y-3">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">How it works</p>
              {[
                { icon: ShoppingBag, color: 'text-amber-400', bg: 'bg-amber-500/10', step: '1', title: 'Get a VEDD garment', desc: 'Every piece in the first drop includes a built-in NFC chip — no external tag, no QR required.' },
                { icon: Wifi, color: 'text-blue-400', bg: 'bg-blue-500/10', step: '2', title: 'Tap the chip', desc: 'Hold your phone near the NFC chip (usually at the hem or collar label). iOS opens a Safari link automatically. Android Chrome can scan in-app.' },
                { icon: Coins, color: 'text-emerald-400', bg: 'bg-emerald-500/10', step: '3', title: 'Earn VEDD every day', desc: `First tap ever: +${ACTIVATION_BONUS} VEDD. Every day after: +${DAILY_REWARD} VEDD. 7-day streak: +5 bonus. 30-day streak: +10 bonus. Straight to your wallet.` },
              ].map(s => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                    <s.icon className={`w-4 h-4 ${s.color}`} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">{s.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ══ TAB: LEGACY CLAIMS ══ */}
        {tab === 'legacy' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 text-center">Old QR-code claims from before NFC chips. These require admin approval.</p>

            {legacyClaims && legacyClaims.length > 0 ? (
              <Card className="bg-gray-900 border-gray-800">
                <CardContent className="py-3">
                  <div className="space-y-3">
                    {legacyClaims.map(claim => (
                      <div key={claim.id} className="flex items-center justify-between py-2 border-b border-gray-800/60 last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                            <Shirt className="w-4 h-4 text-amber-400" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">{claim.productName}</p>
                            <p className="text-xs text-gray-500 font-mono">{claim.claimCode}</p>
                            <p className="text-xs text-gray-700">{formatDistanceToNow(new Date(claim.submittedAt), { addSuffix: true })}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-amber-400 font-bold text-sm">+{claim.rewardAmount} VEDD</span>
                          <Badge className={`flex items-center gap-1 text-xs border ${
                            claim.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                            claim.status === 'pending'  ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                                                         'bg-red-500/20 text-red-400 border-red-500/30'
                          }`}>
                            {claim.status === 'approved' ? <CheckCircle className="w-3 h-3" /> : claim.status === 'pending' ? <Clock className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            {claim.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-10">
                <p className="text-gray-500">No legacy claims</p>
              </div>
            )}
          </div>
        )}

        {/* ── Footer link ── */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <Coins className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-white">More ways to earn VEDD</p>
              <p className="text-xs text-gray-500">Trade, refer friends, create EAs and more</p>
            </div>
          </div>
          <Link href="/vedd-tokenomics">
            <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:text-white">
              View All <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>

      </div>
    </div>
  );
}
