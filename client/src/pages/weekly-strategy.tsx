import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { FeatureToggle } from "@/components/ui/switch";
import {
  ArrowLeft, Target, TrendingUp, DollarSign, BarChart3,
  Calendar, Clock, Shield, Brain, RefreshCw, Trash2,
  CheckCircle, AlertCircle, Zap, ChevronRight, Star,
  Rocket, Flame, ArrowUpRight, Power, XCircle, Lightbulb,
  Newspaper, Radio, Activity, Share2, Loader2, Copy, Download,
  Sparkles, ExternalLink, Settings, ChevronDown, ChevronUp,
  TrendingDown, Crosshair, BookOpen, Swords
} from "lucide-react";
import { SiX, SiFacebook, SiLinkedin } from "react-icons/si";
import VeddLogo from "@/components/ui/vedd-logo";
import { motion, AnimatePresence } from "framer-motion";

const POPULAR_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD",
  "XAUUSD", "GBPJPY", "EURJPY", "EURGBP", "AUDJPY", "CADJPY",
  "US30", "NAS100", "SPX500", "BTCUSD", "ETHUSD"
];

type WeeklyStrategy = {
  hasStrategy: boolean;
  profitTarget?: number;
  pairs?: string[];
  accountBalance?: number;
  riskLevel?: string;
  plan?: any;
  pairStats?: Record<string, any>;
  generatedAt?: string;
  currentProfit?: number;
  progressTrades?: number;
  progressWinRate?: number;
  progressPercentage?: number;
};

export default function WeeklyStrategyPage() {
  const { toast } = useToast();
  const [profitTarget, setProfitTarget] = useState("400");
  const [accountBalance, setAccountBalance] = useState("100");
  const [lotSize, setLotSize] = useState("");
  const [selectedPairs, setSelectedPairs] = useState<string[]>(["XAUUSD", "GBPJPY", "NAS100"]);
  const [pairInput, setPairInput] = useState("");
  const [strategyMode, setStrategyMode] = useState("aggressive");
  const [showConfig, setShowConfig] = useState(false);
  const [showBrain, setShowBrain] = useState(false);
  const [showWeeklyPlan, setShowWeeklyPlan] = useState(false);
  const [liveEngineTab, setLiveEngineTab] = useState<'activity' | 'market' | 'pairs' | 'combos'>('activity');

  const { data: strategy, isLoading } = useQuery<WeeklyStrategy>({
    queryKey: ['/api/weekly-strategy'],
  });

  const { data: liveMode } = useQuery<{ live: boolean; hasStrategy: boolean }>({
    queryKey: ['/api/weekly-strategy/live-mode'],
  });

  const { data: aiLogs = [] } = useQuery<any[]>({
    queryKey: ['/api/ai-confirmation-logs'],
    refetchInterval: 10000,
    enabled: !!strategy?.hasStrategy,
  });

  const toggleLiveMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await apiRequest('POST', '/api/weekly-strategy/live-mode', { enabled });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy/live-mode'] });
      toast({
        title: data.live ? "LIVE MODE ACTIVATED" : "Live Mode Off",
        description: data.message,
        variant: data.live ? "default" : "destructive",
      });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/weekly-strategy/generate', {
        profitTarget: parseFloat(profitTarget),
        pairs: selectedPairs,
        accountBalance: parseFloat(accountBalance),
        riskLevel: 'ai-controlled',
        lotSize: lotSize || undefined,
        strategyMode,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      toast({ title: "VEDD SS AI Plan Ready", description: "Your AI-powered growth strategy is live!" });
    },
    onError: (err: any) => {
      const msg = err.message || "Failed to generate strategy";
      toast({ title: "Strategy Generation Failed", description: msg, variant: "destructive" });
    },
  });

  const updateProgressMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/weekly-strategy/update-progress', {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      setActiveTrades(data.activeTrades || []);
      setUnrealizedPnL(data.unrealizedPnL || 0);
      setLastPositionUpdate(data.lastPositionUpdate || null);
      const activeMsg = data.activeTradeCount > 0 ? ` | ${data.activeTradeCount} active trade(s)` : '';
      toast({ title: "Progress Synced", description: `$${data.currentProfit} closed P&L | $${data.unrealizedPnL || 0} unrealized${activeMsg}` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/weekly-strategy');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      toast({ title: "Plan Cleared", description: "Ready to create a new VEDD SS AI plan" });
    },
  });

  const [activeTrades, setActiveTrades] = useState<any[]>([]);
  const [unrealizedPnL, setUnrealizedPnL] = useState(0);
  const [lastPositionUpdate, setLastPositionUpdate] = useState<string | null>(null);
  const [selectedSignalMode, setSelectedSignalMode] = useState("aggressive");
  const [autoExecuteSignals, setAutoExecuteSignals] = useState(false);

  const { data: brainStatus } = useQuery<any>({
    queryKey: ['/api/vedd-brain/status'],
  });

  const { data: autonomousSignals } = useQuery<any>({
    queryKey: ['/api/vedd-brain/autonomous-signals'],
    enabled: !!brainStatus?.learned,
    refetchInterval: 30000,
  });

  const { data: strategyModes } = useQuery<any>({
    queryKey: ['/api/vedd-brain/strategy-modes'],
  });

  const learnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/vedd-brain/learn', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-brain/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-brain/strategy-modes'] });
      toast({ title: "Brain Updated", description: "AI has learned from all your trade history" });
    },
    onError: (err: any) => {
      toast({ title: "Learning Failed", description: err.message, variant: "destructive" });
    },
  });

  const generateSignalsMutation = useMutation({
    mutationFn: async ({ mode, autoExec }: { mode: string; autoExec: boolean }) => {
      const res = await apiRequest('POST', '/api/vedd-brain/autonomous-signals', { strategyMode: mode, autoExecute: autoExec });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-brain/autonomous-signals'] });
      const executed = data?.executionResults?.filter((r: any) => r.status === 'executed')?.length || 0;
      if (data?.autoExecuted && executed > 0) {
        toast({ title: `${executed} Trade${executed > 1 ? 's' : ''} Executed!`, description: `AI signals auto-executed on TradeLocker` });
      } else {
        toast({ title: "Autonomous Signals Generated", description: "AI generated trade signals from learned patterns" });
      }
    },
    onError: (err: any) => {
      toast({ title: "Signal Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  const [enginePairs, setEnginePairs] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD']);
  const [enginePairInput, setEnginePairInput] = useState('');
  const [engineMode, setEngineMode] = useState('aggressive');
  const [engineMinConf, setEngineMinConf] = useState(65);
  const [engineMaxTrades, setEngineMaxTrades] = useState(5);
  const [engineMaxLotSize, setEngineMaxLotSize] = useState(0.10);
  const [engineInterval, setEngineInterval] = useState(60);
  const [engineWeeklyTarget, setEngineWeeklyTarget] = useState(100);
  const [engineAccountBalance, setEngineAccountBalance] = useState(1000);
  const [engineBaseLotSize, setEngineBaseLotSize] = useState(0.01);
  const [engineCompounding, setEngineCompounding] = useState(true);
  const [enginePropFirmMode, setEnginePropFirmMode] = useState(false);
  const [enginePropFirmDrawdown, setEnginePropFirmDrawdown] = useState(4);

  const { data: liveEngineStatus, refetch: refetchEngine } = useQuery<any>({
    queryKey: ['/api/vedd-live-engine/status'],
    refetchInterval: 5000,
  });

  const { data: liveEngineActivityData } = useQuery<any>({
    queryKey: ['/api/vedd-live-engine/activity'],
    refetchInterval: 5000,
    enabled: liveEngineStatus?.status === 'running',
  });

  const startEngineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/vedd-live-engine/start', {
        pairs: enginePairs,
        strategyMode: engineMode,
        scanIntervalMs: engineInterval * 1000,
        maxOpenTrades: engineMaxTrades,
        minConfidence: engineMinConf,
        maxLotSize: engineMaxLotSize,
        weeklyProfitTarget: engineWeeklyTarget,
        accountBalance: engineAccountBalance,
        baseLotSize: engineBaseLotSize,
        enableCompounding: engineCompounding,
        propFirmMode: enginePropFirmMode,
        propFirmDailyDrawdownLimit: enginePropFirmDrawdown,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-live-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-live-engine/activity'] });
      toast({ title: "VEDD AI Live Engine ACTIVATED", description: "AI is now monitoring markets and trading in real-time" });
    },
    onError: (err: any) => {
      toast({ title: "Engine Start Failed", description: err.message, variant: "destructive" });
    },
  });

  const stopEngineMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/vedd-live-engine/stop', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-live-engine/status'] });
      toast({ title: "Live Engine Stopped" });
    },
  });

  const [shareOpen, setShareOpen] = useState(false);
  const [shareCardUrl, setShareCardUrl] = useState<string | null>(null);
  const [sharePost, setSharePost] = useState('');
  const [selectedSharePlatform, setSelectedSharePlatform] = useState('twitter');

  const shareCardMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/weekly-strategy/share-card', {});
      return res.json();
    },
    onSuccess: (data) => { setShareCardUrl(data.imageUrl); },
    onError: () => { toast({ title: "Card generation failed", variant: "destructive" }); },
  });

  const generatePostMutation = useMutation({
    mutationFn: async (platform: string) => {
      const res = await apiRequest('POST', '/api/weekly-strategy/generate-post', { platform });
      return res.json();
    },
    onSuccess: (data) => { setSharePost(data.post); toast({ title: "AI post generated!" }); },
    onError: () => { toast({ title: "Post generation failed", variant: "destructive" }); },
  });

  const openShareDialog = () => {
    setShareOpen(true);
    setShareCardUrl(null);
    setSharePost('');
    shareCardMutation.mutate();
  };

  const handleShareToNative = (platform: string) => {
    const text = sharePost || `Tracking my trading progress with VEDD SS AI! ${strategy?.progressPercentage || 0}% toward my weekly goal. #VEDDAi #AITrading`;
    const shareUrls: Record<string, string> = {
      twitter: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?quote=${encodeURIComponent(text)}`,
      linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(window.location.href)}&summary=${encodeURIComponent(text)}`,
    };
    if (shareUrls[platform]) window.open(shareUrls[platform], '_blank', 'width=600,height=400');
  };

  const handleCopyPost = async () => {
    const text = sharePost || 'Check out my VEDD SS AI trading progress!';
    await navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard!" });
  };

  const handleDownloadCard = () => {
    if (!shareCardUrl) return;
    const a = document.createElement('a');
    a.href = shareCardUrl;
    a.download = 'vedd-ss-ai-progress.png';
    a.click();
  };

  const togglePair = (pair: string) => {
    setSelectedPairs(prev => prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair]);
  };

  const addEnginePair = () => {
    const pair = enginePairInput.toUpperCase().replace('/', '').trim();
    if (pair && !enginePairs.includes(pair)) {
      setEnginePairs(prev => [...prev, pair]);
      setEnginePairInput('');
    }
  };

  const removeEnginePair = (pair: string) => {
    setEnginePairs(prev => prev.filter(p => p !== pair));
  };

  const addCustomPair = () => {
    const pair = pairInput.toUpperCase().replace('/', '').trim();
    if (pair && !selectedPairs.includes(pair)) {
      setSelectedPairs(prev => [...prev, pair]);
      setPairInput("");
    }
  };

  const isRunning = liveEngineStatus?.status === 'running';
  const tracker = liveEngineStatus?.goalTracker;
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const plan = strategy?.plan;
  const formGrowthMultiplier = accountBalance && profitTarget && parseFloat(accountBalance) > 0
    ? ((parseFloat(accountBalance) + parseFloat(profitTarget)) / parseFloat(accountBalance)).toFixed(1) : '1.0';

  const getPairRating = (symbol: string, data: any) => {
    const wr = data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0;
    if (wr >= 60 && data.pnl > 0) return { label: 'FAVOUR', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (data.trades >= 3 && (wr < 40 || data.pnl < 0)) return { label: 'AVOID', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
    return { label: 'NEUTRAL', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' };
  };

  const getComboRating = (data: any) => {
    const wr = data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0;
    if (wr >= 60 && data.pnl > 0) return { label: 'BEST COMBO', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30' };
    if (data.trades >= 2 && (wr < 40 || data.pnl < 0)) return { label: 'POOR', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/30' };
    return { label: 'NEUTRAL', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' };
  };

  const buildDailyBattlePlan = () => {
    if (!tracker) return null;
    const symbolBd = tracker.symbolBreakdown || {};
    const pairStratBd = tracker.pairStrategyBreakdown || {};
    const phase = tracker.currentPhase || 'warming_up';
    const remaining = tracker.weeklyTarget > 0 ? Math.max(0, tracker.weeklyTarget - tracker.currentProfit) : 0;
    const nowHour = new Date().getUTCHours();
    const session = nowHour >= 7 && nowHour < 12 ? 'London' : nowHour >= 12 && nowHour < 17 ? 'London/NY Overlap' : nowHour >= 17 && nowHour < 21 ? 'New York' : nowHour >= 0 && nowHour < 7 ? 'Asian' : 'Off-Session';

    const favourPairs = Object.entries(symbolBd).filter(([, d]: [string, any]) => {
      const wr = d.trades > 0 ? Math.round((d.wins / d.trades) * 100) : 0;
      return wr >= 60 && d.pnl > 0;
    }).map(([s]) => s);

    const avoidPairs = Object.entries(symbolBd).filter(([, d]: [string, any]) => {
      const wr = d.trades > 0 ? Math.round((d.wins / d.trades) * 100) : 0;
      return d.trades >= 3 && (wr < 40 || d.pnl < 0);
    }).map(([s]) => s);

    const bestCombos = Object.entries(pairStratBd)
      .filter(([, d]: [string, any]) => {
        const wr = d.trades > 0 ? Math.round((d.wins / d.trades) * 100) : 0;
        return wr >= 60 && d.pnl > 0;
      })
      .sort(([, a]: [string, any], [, b]: [string, any]) => b.pnl - a.pnl)
      .slice(0, 3)
      .map(([k]) => k.replace('|', ' + '));

    const riskInstruction =
      phase === 'target_reached' ? 'LOCK IN PROFITS — engine on cruise control, only A+ setups' :
      phase === 'pushing' ? 'PUSH HARD — aggressive entries, compound lot sizes enabled' :
      phase === 'accelerating' ? 'STEP ON IT — medium-high confidence threshold, scale into winners' :
      phase === 'building' ? 'BUILD STEADY — standard risk, stack consistent wins' :
      'WARM UP — conservative approach, 75%+ confidence only, learn the market';

    return { favourPairs, avoidPairs, bestCombos, session, remaining, riskInstruction, phase };
  };

  const battlePlan = buildDailyBattlePlan();

  return (
    <div className="min-h-screen bg-[#0a0b0f] text-white">
      {/* Top nav */}
      <div className="border-b border-gray-800/60 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/mt5-chart-data">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white gap-1">
              <ArrowLeft className="w-4 h-4" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" style={{ display: isRunning ? 'block' : 'none' }} />
            <span className="text-sm font-bold bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">
              VEDD SS AI ENGINE
            </span>
            {isRunning && (
              <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] animate-pulse">LIVE</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {strategy?.hasStrategy && (
            <Button size="sm" variant="ghost" onClick={openShareDialog} className="text-purple-400 gap-1 text-xs">
              <Share2 className="w-3.5 h-3.5" /> Share
            </Button>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">

        {/* ═══════════════════════════════════════════════════════
            HERO ENGINE TOGGLE — ALWAYS FRONT AND CENTER
        ═══════════════════════════════════════════════════════ */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
          <div className={`relative overflow-hidden rounded-2xl border-2 transition-all duration-700 ${
            isRunning
              ? 'border-cyan-500/70 shadow-[0_0_60px_rgba(6,182,212,0.15)]'
              : 'border-gray-700/60'
          }`}>
            {isRunning && (
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/40 via-blue-950/30 to-purple-950/20" />
            )}
            {!isRunning && (
              <div className="absolute inset-0 bg-gradient-to-br from-gray-900/80 to-gray-950/80" />
            )}

            <div className="relative p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center gap-6 md:gap-8">

                {/* Power Button */}
                <div className="flex-shrink-0">
                  <button
                    onClick={() => isRunning ? stopEngineMutation.mutate() : startEngineMutation.mutate()}
                    disabled={startEngineMutation.isPending || stopEngineMutation.isPending}
                    className={`relative w-24 h-24 md:w-28 md:h-28 rounded-full flex items-center justify-center transition-all duration-500 group ${
                      isRunning
                        ? 'bg-cyan-500/20 border-2 border-cyan-400/60 shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:shadow-[0_0_50px_rgba(6,182,212,0.6)]'
                        : 'bg-gray-800/80 border-2 border-gray-600/60 hover:border-gray-400/60 hover:bg-gray-700/80'
                    }`}
                  >
                    {startEngineMutation.isPending || stopEngineMutation.isPending ? (
                      <Loader2 className="w-10 h-10 animate-spin text-cyan-400" />
                    ) : (
                      <Power className={`w-10 h-10 transition-colors duration-300 ${
                        isRunning ? 'text-cyan-400' : 'text-gray-400 group-hover:text-white'
                      }`} />
                    )}
                    {isRunning && (
                      <>
                        <div className="absolute inset-0 rounded-full border-2 border-cyan-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                        <div className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-400 rounded-full border-2 border-gray-900 shadow-lg shadow-emerald-400/50" />
                      </>
                    )}
                  </button>
                </div>

                {/* Engine status text */}
                <div className="flex-1 text-center md:text-left">
                  <div className="flex items-center gap-3 justify-center md:justify-start mb-1">
                    <h1 className={`text-2xl md:text-3xl font-black tracking-tight transition-colors duration-500 ${
                      isRunning ? 'text-cyan-400' : 'text-gray-300'
                    }`}>
                      {isRunning ? 'ENGINE ACTIVE' : 'VEDD SS AI ENGINE'}
                    </h1>
                    {isRunning && liveEngineStatus?.currentlyScanning && (
                      <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px]">
                        <Loader2 className="w-3 h-3 mr-1 animate-spin" /> SCANNING
                      </Badge>
                    )}
                  </div>
                  <p className="text-gray-400 text-sm md:text-base">
                    {isRunning
                      ? `Scanning ${(liveEngineStatus?.config?.pairs || []).length} pairs every ${(liveEngineStatus?.config?.scanIntervalMs || 60000) / 1000}s — Supreme Mathematics in the cipher`
                      : 'Self-learning AI engine. Configure your settings and ignite it to auto-trade in real-time.'}
                  </p>
                  {isRunning && tracker?.weeklyTarget > 0 && (
                    <div className="mt-3 space-y-1 max-w-md">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-400">Weekly Goal: ${tracker.currentProfit?.toFixed(2)} / ${tracker.weeklyTarget}</span>
                        <span className={`font-bold ${
                          tracker.progressPercent >= 100 ? 'text-emerald-400' :
                          tracker.progressPercent >= 75 ? 'text-yellow-400' : 'text-cyan-400'
                        }`}>{tracker.progressPercent}%</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div className={`h-2 rounded-full transition-all duration-700 ${
                          tracker.progressPercent >= 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.5)]' :
                          tracker.progressPercent >= 75 ? 'bg-yellow-500' :
                          tracker.progressPercent >= 50 ? 'bg-cyan-500' : 'bg-purple-500'
                        }`} style={{ width: `${Math.min(100, tracker.progressPercent)}%` }} />
                      </div>
                    </div>
                  )}
                </div>

                {/* Right side — quick stats or action */}
                <div className="flex-shrink-0 flex flex-col items-center gap-3">
                  {isRunning ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: 'Scans', value: liveEngineStatus?.scanCount || 0, color: 'text-blue-400' },
                        { label: 'Signals', value: liveEngineStatus?.signalsGenerated || 0, color: 'text-purple-400' },
                        { label: 'Trades', value: liveEngineStatus?.tradesExecuted || 0, color: 'text-emerald-400' },
                        { label: 'Open', value: liveEngineStatus?.openPositionCount || 0, color: 'text-yellow-400' },
                        { label: 'Wins', value: tracker?.wins || 0, color: 'text-emerald-400' },
                        { label: 'Losses', value: tracker?.losses || 0, color: 'text-red-400' },
                      ].map(s => (
                        <div key={s.label} className="bg-gray-900/60 rounded-lg px-3 py-2 border border-gray-700/40">
                          <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                          <div className="text-[10px] text-gray-500">{s.label}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 text-center">
                      <Button
                        onClick={() => startEngineMutation.mutate()}
                        disabled={startEngineMutation.isPending}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 font-bold px-8 py-3 text-base shadow-lg shadow-cyan-500/20"
                      >
                        {startEngineMutation.isPending ? (
                          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Activating...</>
                        ) : (
                          <><Zap className="w-4 h-4 mr-2" /> Ignite Engine</>
                        )}
                      </Button>
                      <button onClick={() => setShowConfig(!showConfig)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 mx-auto">
                        <Settings className="w-3 h-3" /> Configure Settings
                        {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>
                    </div>
                  )}
                  {isRunning && (
                    <Button size="sm" variant="destructive" onClick={() => stopEngineMutation.mutate()} disabled={stopEngineMutation.isPending} className="gap-1 text-xs">
                      <XCircle className="w-3.5 h-3.5" /> Stop Engine
                    </Button>
                  )}
                </div>
              </div>

              {/* Phase + win rate bar when running */}
              {isRunning && tracker && (
                <div className="mt-4 pt-4 border-t border-gray-700/40 flex flex-wrap gap-3 items-center">
                  <Badge className={`text-xs px-2 py-1 ${
                    tracker.currentPhase === 'target_reached' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                    tracker.currentPhase === 'pushing' ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    tracker.currentPhase === 'accelerating' ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' :
                    tracker.currentPhase === 'cruising' ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30' :
                    tracker.currentPhase === 'building' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                    'bg-gray-500/20 text-gray-400 border-gray-600'
                  }`}>
                    ⚡ {tracker.currentPhase?.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                  <span className="text-xs text-gray-500">{tracker.winRate}% Win Rate</span>
                  {tracker.consecutiveWins > 1 && (
                    <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
                      <Flame className="w-3 h-3 mr-1" /> {tracker.consecutiveWins} win streak | {tracker.compoundMultiplier}x compound
                    </Badge>
                  )}
                  {tracker.consecutiveLosses > 1 && (
                    <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">
                      <AlertCircle className="w-3 h-3 mr-1" /> {tracker.consecutiveLosses} loss streak — lots reduced to {tracker.compoundMultiplier}x
                    </Badge>
                  )}
                  <span className="ml-auto text-xs text-gray-600">
                    Running since {liveEngineStatus?.startedAt ? new Date(liveEngineStatus.startedAt).toLocaleTimeString() : 'N/A'}
                  </span>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════════════
            ENGINE CONFIG (collapsible when stopped, always accessible)
        ═══════════════════════════════════════════════════════ */}
        <AnimatePresence>
          {(!isRunning || showConfig) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="bg-gray-900/60 border-gray-700/60">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2 text-gray-200">
                      <Settings className="w-4 h-4 text-cyan-400" /> Engine Configuration
                    </CardTitle>
                    {isRunning && (
                      <button onClick={() => setShowConfig(false)} className="text-gray-500 hover:text-gray-300">
                        <XCircle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div>
                      <Label className="text-gray-400 text-xs">Account Balance ($)</Label>
                      <Input type="number" value={engineAccountBalance} onChange={e => setEngineAccountBalance(Number(e.target.value))}
                        min={10} step={10} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Weekly Target ($)</Label>
                      <Input type="number" value={engineWeeklyTarget} onChange={e => setEngineWeeklyTarget(Number(e.target.value))}
                        min={0} step={10} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Base Lot Size</Label>
                      <Input type="number" value={engineBaseLotSize} onChange={e => setEngineBaseLotSize(Number(e.target.value))}
                        min={0.01} step={0.01} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Max Lot Size</Label>
                      <Input type="number" value={engineMaxLotSize} onChange={e => setEngineMaxLotSize(Number(e.target.value))}
                        min={0.01} step={0.01} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Min Confidence (%)</Label>
                      <Input type="number" value={engineMinConf} onChange={e => setEngineMinConf(Number(e.target.value))}
                        min={50} max={95} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Max Open Trades</Label>
                      <Input type="number" value={engineMaxTrades} onChange={e => setEngineMaxTrades(Number(e.target.value))}
                        min={1} max={20} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Scan Interval (sec)</Label>
                      <Input type="number" value={engineInterval} onChange={e => setEngineInterval(Number(e.target.value))}
                        min={30} step={30} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
                    </div>
                    <div>
                      <Label className="text-gray-400 text-xs">Strategy Mode</Label>
                      <select value={engineMode} onChange={e => setEngineMode(e.target.value)}
                        className="mt-1 w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-md h-8 px-2">
                        {[
                          { id: 'scalping', name: 'Scalping HFT' },
                          { id: 'momentum', name: 'Momentum Surfing' },
                          { id: 'session_breakout', name: 'Session Breakout' },
                          { id: 'aggressive', name: 'Aggressive Compound' },
                          { id: 'sniper', name: 'Sniper Mode' },
                        ].map(m => <option key={m.id} value={m.id}>{m.name}{enginePropFirmMode && m.id === 'sniper' ? ' (Prop Firm)' : ''}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label className="text-gray-400 text-xs">Trading Pairs</Label>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {enginePairs.map(p => (
                        <Badge key={p} className="bg-cyan-500/10 text-cyan-300 border-cyan-500/30 text-[10px] cursor-pointer hover:bg-red-500/20 hover:text-red-300 hover:border-red-500/30 transition-colors"
                          onClick={() => removeEnginePair(p)}>
                          {p} ×
                        </Badge>
                      ))}
                      <div className="flex gap-1">
                        <Input value={enginePairInput} onChange={e => setEnginePairInput(e.target.value)}
                          placeholder="Add pair..." className="h-6 w-24 bg-gray-800 border-gray-700 text-white text-[10px] px-2"
                          onKeyDown={e => e.key === 'Enter' && addEnginePair()} />
                        <Button size="sm" variant="outline" onClick={addEnginePair} className="h-6 px-2 text-[10px]">+</Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={engineCompounding} onChange={e => setEngineCompounding(e.target.checked)} className="accent-cyan-500" />
                      <span className="text-xs text-gray-400">Auto-compound on win streaks</span>
                    </label>
                    {!isRunning && (
                      <Button onClick={() => startEngineMutation.mutate()} disabled={startEngineMutation.isPending}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 gap-1">
                        {startEngineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Launch Engine
                      </Button>
                    )}
                  </div>
                  <div className={`rounded-xl border p-3 transition-all ${enginePropFirmMode ? 'border-amber-500/60 bg-amber-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer" onClick={() => {
                        const next = !enginePropFirmMode;
                        setEnginePropFirmMode(next);
                        if (next) setEngineMode('sniper');
                      }}>
                        <input type="checkbox" checked={enginePropFirmMode} onChange={() => {}} className="accent-amber-500" />
                        <div>
                          <span className="text-xs font-semibold text-amber-300">Prop Firm Challenge Mode</span>
                          {enginePropFirmMode && (
                            <Badge className="ml-2 bg-amber-500/30 text-amber-300 border-amber-500/50 text-[9px] animate-pulse">CHALLENGE RULES ACTIVE</Badge>
                          )}
                        </div>
                      </label>
                      {enginePropFirmMode && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400">Daily DD Limit:</span>
                          <Input
                            type="number"
                            value={enginePropFirmDrawdown}
                            onChange={e => setEnginePropFirmDrawdown(Number(e.target.value))}
                            min={1} max={10} step={0.5}
                            className="w-16 h-6 bg-gray-800 border-amber-700 text-amber-300 text-[11px] px-1"
                          />
                          <span className="text-[10px] text-gray-400">%</span>
                        </div>
                      )}
                    </div>
                    {enginePropFirmMode && (
                      <p className="text-[10px] text-amber-400/80 mt-1.5">
                        🛡️ 0.5% risk/trade · Max 2 trades · 78%+ confidence · 1:2+ R:R · No scalping · Sniper setups only
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ═══════════════════════════════════════════════════════
            COMMAND CENTER — shown when engine is running
        ═══════════════════════════════════════════════════════ */}
        {isRunning && (
          <>
            {/* Main 2-col grid: Activity Feed + Goal/Market */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

              {/* LEFT: Live Activity Feed — 2/3 width */}
              <div className="lg:col-span-2">
                <Card className="bg-gray-900/60 border-gray-700/60 h-full">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2 text-white">
                        <Brain className="w-4 h-4 text-cyan-400" /> AI Strategy Feed
                        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] animate-pulse">LIVE</Badge>
                      </CardTitle>
                      <div className="flex gap-1">
                        {(['activity', 'market', 'pairs', 'combos'] as const).map(tab => (
                          <button key={tab} onClick={() => setLiveEngineTab(tab)}
                            className={`px-2 py-1 text-[10px] font-medium rounded transition-colors ${
                              liveEngineTab === tab ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' : 'text-gray-500 hover:text-gray-300'
                            }`}>
                            {tab === 'activity' ? 'Live Feed' : tab === 'market' ? 'Market' : tab === 'pairs' ? 'Pair Ratings' : 'Combos'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">

                    {/* LIVE FEED TAB */}
                    {liveEngineTab === 'activity' && (
                      <div className="max-h-[420px] overflow-y-auto space-y-1.5 pr-1">
                        {(liveEngineActivityData?.activity || []).length === 0 ? (
                          <div className="text-center py-10 text-gray-500">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2 text-cyan-400" />
                            <p className="text-sm">Waiting for first scan...</p>
                          </div>
                        ) : (
                          (liveEngineActivityData?.activity || []).map((act: any) => (
                            <motion.div key={act.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                              className={`px-3 py-2.5 rounded-xl text-xs flex items-start gap-2.5 border ${
                                act.type === 'trade_open' ? 'bg-emerald-500/8 border-emerald-500/25' :
                                act.type === 'trade_close' ? 'bg-blue-500/8 border-blue-500/25' :
                                act.type === 'signal' ? 'bg-purple-500/8 border-purple-500/25' :
                                act.type === 'ai_decision' ? 'bg-cyan-500/8 border-cyan-500/25' :
                                act.type === 'error' ? 'bg-red-500/8 border-red-500/25' :
                                'bg-gray-800/30 border-gray-700/20'
                              }`}>
                              <div className="flex-shrink-0 mt-0.5">
                                {act.type === 'trade_open' ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> :
                                 act.type === 'signal' ? <Radio className="w-3.5 h-3.5 text-purple-400" /> :
                                 act.type === 'ai_decision' ? <Brain className="w-3.5 h-3.5 text-cyan-400" /> :
                                 act.type === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-red-400" /> :
                                 act.type === 'scan' ? <RefreshCw className="w-3.5 h-3.5 text-blue-400" /> :
                                 <Activity className="w-3.5 h-3.5 text-gray-400" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                                  {act.symbol && <Badge variant="outline" className="text-[9px] px-1 py-0 border-gray-600 font-mono">{act.symbol}</Badge>}
                                  {act.direction && (
                                    <Badge className={`text-[9px] px-1 py-0 ${act.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>
                                      {act.direction}
                                    </Badge>
                                  )}
                                  {act.confidence && <span className="text-yellow-400 text-[9px] font-bold">{act.confidence}%</span>}
                                  {act.details?.strategy && (
                                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-500/40 text-purple-300">
                                      {act.details.strategy.replace(/_/g, ' ').toUpperCase()}
                                    </Badge>
                                  )}
                                </div>
                                <p className={`leading-snug ${
                                  act.type === 'error' ? 'text-red-300' :
                                  act.type === 'trade_open' ? 'text-emerald-300' :
                                  'text-gray-300'
                                }`}>{act.message}</p>
                                {act.details?.confluences && (
                                  <div className="mt-1 flex flex-wrap gap-1">
                                    {act.details.confluences.slice(0, 3).map((c: string, ci: number) => (
                                      <span key={ci} className="text-[8px] bg-gray-700/60 text-gray-400 px-1.5 py-0.5 rounded">{c}</span>
                                    ))}
                                  </div>
                                )}
                                {act.details?.marketOverview && (
                                  <p className="mt-1 text-[10px] text-cyan-300/80 italic border-l border-cyan-500/30 pl-2">{act.details.marketOverview}</p>
                                )}
                              </div>
                              <span className="text-[9px] text-gray-600 flex-shrink-0 whitespace-nowrap font-mono">
                                {new Date(act.timestamp).toLocaleTimeString()}
                              </span>
                            </motion.div>
                          ))
                        )}
                      </div>
                    )}

                    {/* MARKET DATA TAB */}
                    {liveEngineTab === 'market' && (
                      <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
                        {Object.keys(liveEngineStatus?.marketSnapshot || {}).length === 0 ? (
                          <div className="text-center py-10 text-gray-500 text-sm">No market data yet. Waiting for first scan...</div>
                        ) : (
                          Object.entries(liveEngineStatus.marketSnapshot || {}).map(([sym, data]: [string, any]) => (
                            <div key={sym} className="flex items-center justify-between px-3 py-2.5 bg-gray-800/40 rounded-xl border border-gray-700/30">
                              <div className="flex items-center gap-3">
                                <span className="text-white font-mono text-sm font-bold w-16">{sym}</span>
                                <Badge className={`text-[9px] px-1.5 ${
                                  data.trend === 'BULLISH' ? 'bg-emerald-500/20 text-emerald-400' :
                                  data.trend === 'BEARISH' ? 'bg-red-500/20 text-red-400' :
                                  'bg-gray-500/20 text-gray-400'
                                }`}>{data.trend}</Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs">
                                <span className="text-white font-mono font-bold">{data.price?.toFixed(data.price > 100 ? 2 : 5)}</span>
                                <span className={`font-medium ${data.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                  {data.change >= 0 ? '+' : ''}{data.change}%
                                </span>
                                <span className="text-gray-500">RSI {data.rsi}</span>
                                {data.relativeVolume && (
                                  <Badge className={`text-[8px] px-1 py-0 ${
                                    data.relativeVolume === 'surging' ? 'bg-emerald-500/20 text-emerald-400' :
                                    data.relativeVolume === 'above_average' ? 'bg-blue-500/20 text-blue-400' :
                                    data.relativeVolume === 'dry' ? 'bg-red-500/20 text-red-400' :
                                    'bg-gray-500/20 text-gray-400'
                                  }`}>{data.relativeVolume?.replace('_', ' ')}</Badge>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}

                    {/* PAIR RATINGS TAB */}
                    {liveEngineTab === 'pairs' && (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {Object.keys(tracker?.symbolBreakdown || {}).length === 0 ? (
                          <div className="text-center py-10 text-gray-500">
                            <BarChart3 className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                            <p className="text-sm">No pair data yet. Ratings build up as trades close.</p>
                          </div>
                        ) : (
                          Object.entries(tracker.symbolBreakdown)
                            .sort(([, a]: [string, any], [, b]: [string, any]) => b.pnl - a.pnl)
                            .map(([symbol, data]: [string, any]) => {
                              const wr = data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0;
                              const rating = getPairRating(symbol, data);
                              return (
                                <div key={symbol} className={`px-4 py-3 rounded-xl border ${rating.bg}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <span className="font-mono font-bold text-white text-sm w-16">{symbol}</span>
                                      <Badge className={`text-[10px] px-2 border ${rating.bg} ${rating.color}`}>{rating.label}</Badge>
                                    </div>
                                    <span className={`text-sm font-bold ${data.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {data.pnl >= 0 ? '+' : ''}${data.pnl?.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex items-center gap-3 text-xs text-gray-500">
                                    <span className="text-emerald-400">{data.wins}W</span>
                                    <span className="text-red-400">{data.losses}L</span>
                                    <span>{wr}% WR</span>
                                    <span>{data.trades} trades</span>
                                    {data.bestTrade > 0 && <span className="text-gray-600">Best: +${data.bestTrade?.toFixed(2)}</span>}
                                  </div>
                                  <div className="mt-1.5 w-full bg-gray-800 rounded-full h-1">
                                    <div className={`h-1 rounded-full ${wr >= 60 ? 'bg-emerald-500' : wr >= 40 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                      style={{ width: `${wr}%` }} />
                                  </div>
                                </div>
                              );
                            })
                        )}
                      </div>
                    )}

                    {/* COMBOS TAB */}
                    {liveEngineTab === 'combos' && (
                      <div className="space-y-2 max-h-[420px] overflow-y-auto">
                        {Object.keys(tracker?.pairStrategyBreakdown || {}).length === 0 ? (
                          <div className="text-center py-10 text-gray-500">
                            <Crosshair className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                            <p className="text-sm">No combo data yet. Build up by running trades.</p>
                          </div>
                        ) : (
                          Object.entries(tracker.pairStrategyBreakdown)
                            .sort(([, a]: [string, any], [, b]: [string, any]) => b.pnl - a.pnl)
                            .map(([key, data]: [string, any]) => {
                              const [symbol, strategy] = key.split('|');
                              const wr = data.trades > 0 ? Math.round((data.wins / data.trades) * 100) : 0;
                              const rating = getComboRating(data);
                              return (
                                <div key={key} className={`px-4 py-3 rounded-xl border ${rating.bg}`}>
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="font-mono font-bold text-white text-sm">{symbol}</span>
                                      <span className="text-gray-600">+</span>
                                      <span className="text-xs text-gray-300">{strategy?.replace(/_/g, ' ')}</span>
                                      <Badge className={`text-[9px] px-1.5 border ${rating.bg} ${rating.color}`}>{rating.label}</Badge>
                                    </div>
                                    <span className={`text-sm font-bold ${data.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                      {data.pnl >= 0 ? '+' : ''}${data.pnl?.toFixed(2)}
                                    </span>
                                  </div>
                                  <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                                    <span className="text-emerald-400">{data.wins}W</span>
                                    <span className="text-red-400">{data.losses}L</span>
                                    <span>{wr}% WR</span>
                                    <span>{data.trades} trades</span>
                                  </div>
                                </div>
                              );
                            })
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* RIGHT: Goal tracker + phase + daily stats — 1/3 width */}
              <div className="space-y-4">
                {/* Goal Tracker */}
                <Card className="bg-gray-900/60 border-gray-700/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2 text-white">
                      <Target className="w-4 h-4 text-yellow-400" /> Weekly Goal
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {tracker?.weeklyTarget > 0 ? (
                      <>
                        <div className="text-center py-2">
                          <div className={`text-4xl font-black ${
                            tracker.progressPercent >= 100 ? 'text-emerald-400' :
                            tracker.progressPercent >= 75 ? 'text-yellow-400' : 'text-cyan-400'
                          }`}>{tracker.progressPercent}%</div>
                          <div className="text-gray-400 text-xs mt-1">${tracker.currentProfit?.toFixed(2)} of ${tracker.weeklyTarget}</div>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-3">
                          <div className={`h-3 rounded-full transition-all duration-700 ${
                            tracker.progressPercent >= 100 ? 'bg-emerald-500 shadow-[0_0_10px_rgba(52,211,153,0.4)]' :
                            tracker.progressPercent >= 75 ? 'bg-yellow-500' :
                            tracker.progressPercent >= 50 ? 'bg-cyan-500' : 'bg-purple-500'
                          }`} style={{ width: `${Math.min(100, tracker.progressPercent)}%` }} />
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-gray-800/60 rounded-lg p-2">
                            <div className="text-emerald-400 font-bold text-lg">{tracker.wins}</div>
                            <div className="text-gray-500 text-[10px]">Wins</div>
                          </div>
                          <div className="bg-gray-800/60 rounded-lg p-2">
                            <div className="text-red-400 font-bold text-lg">{tracker.losses}</div>
                            <div className="text-gray-500 text-[10px]">Losses</div>
                          </div>
                          <div className="bg-gray-800/60 rounded-lg p-2">
                            <div className="text-yellow-400 font-bold text-lg">{tracker.winRate}%</div>
                            <div className="text-gray-500 text-[10px]">Win Rate</div>
                          </div>
                        </div>
                        {Object.keys(tracker.dailyPnL || {}).length > 0 && (
                          <div className="border-t border-gray-700/50 pt-2 space-y-1">
                            <div className="text-[10px] text-gray-500 font-semibold">Daily P&L</div>
                            {Object.entries(tracker.dailyPnL).slice(-5).map(([day, pnl]: [string, any]) => (
                              <div key={day} className="flex justify-between text-[10px]">
                                <span className="text-gray-400">{day}</span>
                                <span className={pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}>{pnl >= 0 ? '+' : ''}${pnl?.toFixed(2)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-4 text-gray-500 text-sm">No weekly target set. Configure one in engine settings.</div>
                    )}
                  </CardContent>
                </Card>

                {/* Strategy Performance */}
                {Object.keys(tracker?.strategyBreakdown || {}).length > 0 && (
                  <Card className="bg-gray-900/60 border-gray-700/60">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex items-center gap-2 text-white">
                        <BarChart3 className="w-4 h-4 text-purple-400" /> Strategy Performance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {Object.entries(tracker.strategyBreakdown)
                        .sort(([, a]: [string, any], [, b]: [string, any]) => b.pnl - a.pnl)
                        .map(([strat, data]: [string, any]) => (
                          <div key={strat} className="flex items-center justify-between py-1.5 border-b border-gray-800/60 last:border-0">
                            <div>
                              <span className="text-xs text-gray-300 font-medium">{strat.replace(/_/g, ' ')}</span>
                              <div className="text-[10px] text-gray-600">{data.wins}/{data.trades} wins</div>
                            </div>
                            <span className={`text-xs font-bold ${data.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {data.pnl >= 0 ? '+' : ''}${data.pnl?.toFixed(2)}
                            </span>
                          </div>
                        ))}
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════
                DAILY BATTLE PLAN — AI-generated from live engine data
            ═══════════════════════════════════════════════════════ */}
            {battlePlan && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <Card className="bg-gradient-to-br from-gray-900/80 via-gray-900/60 to-gray-950/80 border-orange-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2 text-white">
                      <Swords className="w-4 h-4 text-orange-400" /> Daily Battle Plan
                      <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">AI Generated</Badge>
                      <span className="text-xs text-gray-500 font-normal ml-2">{battlePlan.session} Session</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">

                      {/* Risk instruction */}
                      <div className={`rounded-xl p-4 border col-span-1 md:col-span-2 ${
                        tracker?.currentPhase === 'target_reached' ? 'bg-emerald-500/10 border-emerald-500/30' :
                        tracker?.currentPhase === 'pushing' ? 'bg-orange-500/10 border-orange-500/30' :
                        'bg-blue-500/10 border-blue-500/30'
                      }`}>
                        <div className="flex items-center gap-2 mb-2">
                          <Shield className={`w-4 h-4 ${
                            tracker?.currentPhase === 'target_reached' ? 'text-emerald-400' :
                            tracker?.currentPhase === 'pushing' ? 'text-orange-400' : 'text-blue-400'
                          }`} />
                          <span className="text-xs font-bold text-gray-300">PHASE INSTRUCTION</span>
                        </div>
                        <p className="text-sm text-white font-medium">{battlePlan.riskInstruction}</p>
                        {battlePlan.remaining > 0 && (
                          <p className="text-xs text-gray-400 mt-2">${battlePlan.remaining.toFixed(2)} remaining to weekly target</p>
                        )}
                      </div>

                      {/* Pairs to favour */}
                      <div className="rounded-xl p-4 bg-emerald-500/8 border border-emerald-500/25">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                          <span className="text-xs font-bold text-emerald-400">FAVOUR TODAY</span>
                        </div>
                        {battlePlan.favourPairs.length > 0 ? (
                          <div className="space-y-1">
                            {battlePlan.favourPairs.map(p => (
                              <div key={p} className="flex items-center gap-1.5">
                                <CheckCircle className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                                <span className="text-sm font-mono font-bold text-white">{p}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">Building performance data...</p>
                        )}
                      </div>

                      {/* Pairs to avoid */}
                      <div className="rounded-xl p-4 bg-red-500/8 border border-red-500/25">
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingDown className="w-4 h-4 text-red-400" />
                          <span className="text-xs font-bold text-red-400">AVOID TODAY</span>
                        </div>
                        {battlePlan.avoidPairs.length > 0 ? (
                          <div className="space-y-1">
                            {battlePlan.avoidPairs.map(p => (
                              <div key={p} className="flex items-center gap-1.5">
                                <XCircle className="w-3 h-3 text-red-400 flex-shrink-0" />
                                <span className="text-sm font-mono font-bold text-white">{p}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">No pairs flagged yet</p>
                        )}
                      </div>
                    </div>

                    {battlePlan.bestCombos.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-700/40">
                        <div className="flex items-center gap-2 mb-2">
                          <Star className="w-3.5 h-3.5 text-yellow-400" />
                          <span className="text-xs font-bold text-yellow-400">BEST COMBOS TO RUN TODAY</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {battlePlan.bestCombos.map(combo => (
                            <Badge key={combo} className="bg-yellow-500/10 text-yellow-300 border-yellow-500/30 text-[10px] font-mono">
                              ⚡ {combo}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Settings toggle when running */}
            {!showConfig && (
              <div className="text-center">
                <button onClick={() => setShowConfig(true)} className="text-xs text-gray-500 hover:text-gray-300 flex items-center gap-1 mx-auto">
                  <Settings className="w-3 h-3" /> Show Engine Settings
                </button>
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════
            VEDD SS AI LIVE MODE (EA Guidance toggle)
        ═══════════════════════════════════════════════════════ */}
        {strategy?.hasStrategy && plan && (
          <Card className={`border transition-all duration-500 ${
            liveMode?.live
              ? 'border-emerald-500/50 bg-gradient-to-r from-emerald-950/30 to-green-950/30'
              : 'border-gray-700/40 bg-gray-900/30'
          }`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`relative p-2.5 rounded-xl ${liveMode?.live ? 'bg-emerald-500/15' : 'bg-gray-800/60'}`}>
                    <Power className={`w-5 h-5 ${liveMode?.live ? 'text-emerald-400' : 'text-gray-500'}`} />
                    {liveMode?.live && <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold text-sm ${liveMode?.live ? 'text-emerald-400' : 'text-gray-400'}`}>VEDD SS AI — EA Guidance</span>
                      {liveMode?.live && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] animate-pulse">LIVE</Badge>}
                    </div>
                    <p className="text-gray-500 text-xs">{liveMode?.live ? 'Guiding your MT5 EA trades in real-time' : 'Toggle to activate AI trade guidance for MT5 EA'}</p>
                  </div>
                </div>
                <FeatureToggle
                  checked={liveMode?.live || false}
                  onCheckedChange={(checked) => toggleLiveMutation.mutate(checked)}
                  activeColor="green" size="lg" showLabel activeLabel="LIVE" inactiveLabel="OFF"
                  disabled={toggleLiveMutation.isPending}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════
            WEEKLY STRATEGY PLAN — collapsed by default
        ═══════════════════════════════════════════════════════ */}
        {strategy?.hasStrategy && plan ? (
          <div className="space-y-3">
            {/* Weekly goal progress */}
            <Card className="bg-gray-900/50 border-gray-700/50">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-orange-400" />
                    <span className="font-semibold text-sm text-white">Weekly Growth Plan</span>
                    <Badge className={`text-[10px] ${
                      plan.feasibility === 'ACHIEVABLE' ? 'bg-emerald-500/20 text-emerald-400' :
                      plan.feasibility === 'AGGRESSIVE' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>{plan.feasibility}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateProgressMutation.mutate()} disabled={updateProgressMutation.isPending} className="text-xs h-7">
                      <RefreshCw className={`w-3 h-3 mr-1 ${updateProgressMutation.isPending ? 'animate-spin' : ''}`} /> Sync
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-400 border-red-500/30 h-7 px-2" onClick={() => deleteMutation.mutate()}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <button onClick={() => setShowWeeklyPlan(!showWeeklyPlan)} className="text-gray-500 hover:text-gray-300">
                      {showWeeklyPlan ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">${strategy.currentProfit || 0} / ${strategy.profitTarget}</span>
                  <span className="text-orange-400 font-bold">{strategy.progressPercentage || 0}%</span>
                </div>
                <Progress value={strategy.progressPercentage || 0} className="h-2" />
              </CardContent>
            </Card>

            <AnimatePresence>
              {showWeeklyPlan && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="space-y-3">

                  {/* Daily Battle Plan from weekly strategy */}
                  <Card className="bg-gray-800/50 border-gray-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-base flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-emerald-400" /> Weekly Day-by-Day Plan
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {dayNames.map(day => {
                        const dayPlan = plan.weeklyPlan?.[day];
                        if (!dayPlan) return null;
                        return (
                          <div key={day} className="bg-gray-900/50 rounded-xl p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <h4 className="text-white font-semibold flex items-center gap-2 text-sm">
                                <ChevronRight className="w-3.5 h-3.5 text-orange-400" />{day}
                              </h4>
                              <div className="flex gap-2">
                                {dayPlan.dailyTarget && <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px]">Target: ${dayPlan.dailyTarget}</Badge>}
                                {dayPlan.projectedBalance && <Badge className="bg-blue-500/20 text-blue-400 text-[10px]">Balance: ${dayPlan.projectedBalance}</Badge>}
                              </div>
                            </div>
                            {(dayPlan.pairs || []).map((p: any, i: number) => (
                              <div key={i} className="bg-gray-800/50 rounded-lg p-3 text-xs space-y-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white font-medium">{p.symbol}</span>
                                    <Badge className={`text-[9px] ${p.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{p.direction}</Badge>
                                    <Badge variant="outline" className="text-[9px] text-gray-400"><Clock className="w-2 h-2 mr-0.5" />{p.session}</Badge>
                                  </div>
                                  <div className="flex gap-3 text-[10px]">
                                    <span className="text-purple-400">{p.confidence}%</span>
                                    <span className="text-gray-400">~{p.estimatedPips} pips</span>
                                    <span className="text-orange-400">{p.lotSize} lots</span>
                                  </div>
                                </div>
                                {p.entryCondition && <p className="text-gray-500 pl-2 border-l-2 border-orange-500/30">{p.entryCondition}</p>}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {/* Risk Management */}
                  {plan.riskManagement && (
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base flex items-center gap-2">
                          <Shield className="w-4 h-4 text-red-400" /> AI Risk Controls
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          {[
                            { label: 'Max Daily Loss', value: `$${plan.riskManagement.maxDailyLoss}`, color: 'text-red-400' },
                            { label: 'Max Daily Trades', value: plan.riskManagement.maxDailyTrades, color: 'text-white' },
                            { label: 'Risk Per Trade', value: `${plan.riskManagement.riskPerTrade}%`, color: 'text-orange-400' },
                            { label: 'Trailing Stop', value: plan.riskManagement.trailingStopMode || 'AI', color: 'text-purple-400' },
                          ].map(item => (
                            <div key={item.label} className="bg-gray-900/50 rounded-lg p-3 text-center">
                              <p className="text-gray-400 text-xs mb-1">{item.label}</p>
                              <p className={`font-bold ${item.color}`}>{item.value}</p>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Pair Rankings */}
                  {plan.pairRankings && (
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base flex items-center gap-2">
                          <Star className="w-4 h-4 text-amber-400" /> AI Pair Rankings
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {plan.pairRankings.map((pr: any, i: number) => (
                            <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg p-3">
                              <div className="flex items-center gap-3">
                                <span className="text-orange-400 font-bold">#{i + 1}</span>
                                <div>
                                  <span className="text-white font-semibold text-sm">{pr.symbol}</span>
                                  <p className="text-gray-500 text-[10px]">Best: {pr.bestDay} / {pr.bestSession}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="text-right">
                                  <p className="text-xs text-white">Score: {pr.overallScore}%</p>
                                  <p className="text-[10px] text-gray-500">{pr.optimalLotSize ? `${pr.optimalLotSize} lots` : `WR: ${pr.winRate}%`}</p>
                                </div>
                                <Badge className={`text-xs ${
                                  pr.recommendation === 'Primary' ? 'bg-emerald-500/20 text-emerald-400' :
                                  pr.recommendation === 'Secondary' ? 'bg-amber-500/20 text-amber-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>{pr.recommendation}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Compound projection */}
                  {plan.compoundGrowth && (
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-white text-base flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-emerald-400" /> Compound Growth Projection
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-5 gap-2">
                          {dayNames.map(day => {
                            const cg = plan.compoundGrowth[day.toLowerCase()];
                            if (!cg) return null;
                            return (
                              <div key={day} className="bg-gray-900/50 rounded-lg p-3 text-center">
                                <p className="text-gray-400 text-xs font-medium">{day.substring(0, 3)}</p>
                                <p className="text-emerald-400 font-bold text-sm">${cg.endBalance}</p>
                                <p className="text-gray-500 text-[10px]">+${(cg.endBalance - cg.startBalance).toFixed(0)}</p>
                              </div>
                            );
                          })}
                        </div>
                        {plan.weeklyProjection && (
                          <div className="grid grid-cols-3 gap-4 text-center mt-3 pt-3 border-t border-gray-700/40">
                            <div><p className="text-red-400 text-xs">Worst</p><p className="text-white font-bold">${plan.weeklyProjection.worstCase}</p></div>
                            <div><p className="text-orange-400 text-xs">Expected</p><p className="text-white font-bold">${plan.weeklyProjection.expected}</p></div>
                            <div><p className="text-emerald-400 text-xs">Best Case</p><p className="text-white font-bold">${plan.weeklyProjection.bestCase}</p></div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : !isLoading && (
          /* Setup Form */
          <Card className="bg-gray-900/60 border-gray-700 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Rocket className="w-5 h-5 text-orange-400" /> Set Your Weekly Growth Target
              </CardTitle>
              <CardDescription>Tell the AI where you want to go. It handles entries, exits, lot sizing, and risk.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label className="text-gray-300 text-sm">Quick Presets</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { balance: '100', target: '400', label: '$100 → $500' },
                    { balance: '100', target: '700', label: '$100 → $800' },
                    { balance: '200', target: '800', label: '$200 → $1,000' },
                  ].map(preset => (
                    <Button key={preset.label} variant="outline" size="sm"
                      className={`text-xs ${accountBalance === preset.balance && profitTarget === preset.target ? 'border-orange-500 text-orange-400 bg-orange-500/10' : 'border-gray-700 text-gray-400'}`}
                      onClick={() => { setAccountBalance(preset.balance); setProfitTarget(preset.target); }}>
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-gray-300 text-sm">Starting Balance ($)</Label>
                  <Input type="number" value={accountBalance} onChange={e => setAccountBalance(e.target.value)} placeholder="100" className="mt-1 bg-gray-900 border-gray-700 text-white" />
                </div>
                <div>
                  <Label className="text-gray-300 text-sm">Profit Target ($)</Label>
                  <Input type="number" value={profitTarget} onChange={e => setProfitTarget(e.target.value)} placeholder="400" className="mt-1 bg-gray-900 border-gray-700 text-white" />
                </div>
              </div>
              {accountBalance && profitTarget && parseFloat(accountBalance) > 0 && (
                <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 rounded-lg p-4 border border-orange-500/20 flex justify-between items-center">
                  <div>
                    <p className="text-gray-400 text-xs">Growth Target</p>
                    <p className="text-white font-bold text-xl">${accountBalance} <ArrowUpRight className="w-4 h-4 inline text-orange-400" /> ${parseFloat(accountBalance) + parseFloat(profitTarget)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs">Multiplier</p>
                    <p className="text-orange-400 font-bold text-xl">{formGrowthMultiplier}x</p>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-gray-300 text-sm">Strategy Mode</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                  {[
                    { id: 'scalping', name: 'Scalping HFT', icon: '⚡', risk: 'HIGH', desc: 'Ultra-fast entries, tight stops, high frequency' },
                    { id: 'momentum', name: 'Momentum', icon: '🌊', risk: 'MED-HIGH', desc: 'Ride strong trending moves with confluence' },
                    { id: 'session_breakout', name: 'Session Breakout', icon: '🚀', risk: 'MEDIUM', desc: 'London/NY open range breakout captures' },
                    { id: 'aggressive', name: 'Aggressive Compound', icon: '🔥', risk: 'EXTREME', desc: 'All strategies, max frequency, compound sizing' },
                    { id: 'sniper', name: 'Sniper Mode', icon: '🎯', risk: 'MEDIUM', desc: 'ICT precision entries, high-quality setups only' },
                    { id: 'prop_firm', name: 'Prop Firm Challenge', icon: '🛡️', risk: 'PROTECTED', desc: 'Challenge-safe rules, 0.5% risk, 1:2+ R:R only' },
                  ].map(mode => (
                    <button key={mode.id} onClick={() => {
                      setStrategyMode(mode.id === 'prop_firm' ? 'sniper' : mode.id);
                      if (mode.id === 'prop_firm') setEnginePropFirmMode(true);
                      else setEnginePropFirmMode(false);
                    }}
                      className={`text-left p-3 rounded-xl border transition-all text-xs ${
                        (mode.id === 'prop_firm' ? enginePropFirmMode : strategyMode === mode.id && !enginePropFirmMode)
                          ? mode.id === 'prop_firm' ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-orange-500 bg-orange-500/10 text-orange-300'
                          : 'border-gray-700 bg-gray-900/50 text-gray-400 hover:border-gray-500'
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span>{mode.icon}</span>
                        <span className="font-semibold">{mode.name}</span>
                      </div>
                      <p className="text-[9px] text-gray-500 mb-1 leading-tight">{mode.desc}</p>
                      <Badge className={`text-[9px] ${
                        mode.risk === 'EXTREME' ? 'bg-red-500/20 text-red-400' :
                        mode.risk === 'HIGH' ? 'bg-orange-500/20 text-orange-400' :
                        mode.risk === 'PROTECTED' ? 'bg-amber-500/20 text-amber-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>{mode.risk}</Badge>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-gray-300 text-sm">Select Pairs</Label>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {POPULAR_PAIRS.map(pair => (
                    <Badge key={pair} className={`cursor-pointer text-xs transition-all ${selectedPairs.includes(pair) ? 'bg-orange-500/30 text-orange-300 border-orange-500/50' : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500'}`}
                      onClick={() => togglePair(pair)}>
                      {selectedPairs.includes(pair) && <CheckCircle className="w-2.5 h-2.5 mr-1" />}{pair}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input value={pairInput} onChange={e => setPairInput(e.target.value)} placeholder="Add custom pair..."
                    className="bg-gray-900 border-gray-700 text-white flex-1 text-sm" onKeyDown={e => e.key === 'Enter' && addCustomPair()} />
                  <Button variant="outline" size="sm" onClick={addCustomPair}>Add</Button>
                </div>
              </div>
              <Button className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold py-5 text-base"
                onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || selectedPairs.length === 0}>
                {generateMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> AI Building Plan...</> : <><Rocket className="w-4 h-4 mr-2" /> Generate Growth Strategy</>}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* ═══════════════════════════════════════════════════════
            SELF-LEARNING BRAIN — collapsible
        ═══════════════════════════════════════════════════════ */}
        <Card className="bg-gradient-to-br from-purple-900/20 to-indigo-900/20 border-purple-500/30">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-400" /> Self-Learning Brain
                {brainStatus?.learned && (
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30 text-[10px]">{brainStatus.totalTradesAnalyzed} trades</Badge>
                )}
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={() => learnMutation.mutate()} disabled={learnMutation.isPending} className="bg-purple-600 hover:bg-purple-500 text-white h-7 text-xs">
                  {learnMutation.isPending ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Learning...</> : <><Brain className="w-3 h-3 mr-1" /> {brainStatus?.learned ? 'Re-Learn' : 'Train Brain'}</>}
                </Button>
                <button onClick={() => setShowBrain(!showBrain)} className="text-gray-500 hover:text-gray-300">
                  {showBrain ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>
            </div>
            {brainStatus?.learned && (
              <div className="grid grid-cols-4 gap-2 mt-2">
                {[
                  { label: 'Win Rate', value: `${brainStatus.overallWinRate}%`, color: 'text-purple-400' },
                  { label: 'Pairs', value: brainStatus.pairsLearned, color: 'text-white' },
                  { label: 'Total P&L', value: `$${brainStatus.totalProfit}`, color: brainStatus.totalProfit >= 0 ? 'text-emerald-400' : 'text-red-400' },
                  { label: 'Analyzed', value: brainStatus.totalTradesAnalyzed, color: 'text-orange-400' },
                ].map(s => (
                  <div key={s.label} className="bg-black/20 rounded-lg p-2 text-center">
                    <p className={`text-base font-bold ${s.color}`}>{s.value}</p>
                    <p className="text-[9px] text-gray-500">{s.label}</p>
                  </div>
                ))}
              </div>
            )}
          </CardHeader>
          <AnimatePresence>
            {showBrain && brainStatus?.learned && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <CardContent className="pt-0 space-y-4">
                  {brainStatus.learningInsights?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-gray-400 font-semibold">Brain Insights:</p>
                      {brainStatus.learningInsights.slice(0, 5).map((insight: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-xs text-gray-300 bg-black/20 rounded p-2">
                          <Lightbulb className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                          {insight}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="border-t border-purple-500/20 pt-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                        <Zap className="w-4 h-4 text-yellow-400" /> Autonomous Signals
                      </h4>
                      <div className="flex gap-2">
                        <select value={selectedSignalMode} onChange={e => setSelectedSignalMode(e.target.value)}
                          className="bg-gray-900 border border-gray-700 text-white text-xs rounded px-2 py-1">
                          {(strategyModes?.modes || []).map((m: any) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                        <Button size="sm" variant="outline" onClick={() => generateSignalsMutation.mutate({ mode: selectedSignalMode, autoExec: autoExecuteSignals })}
                          disabled={generateSignalsMutation.isPending} className="text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10 text-xs h-7">
                          {generateSignalsMutation.isPending ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Generating...</> : <><Zap className="w-3 h-3 mr-1" /> Generate</>}
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between bg-black/30 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Power className={`w-4 h-4 ${autoExecuteSignals ? 'text-emerald-400' : 'text-gray-500'}`} />
                        <span className="text-xs text-gray-300">Auto-Execute on TradeLocker</span>
                        {autoExecuteSignals && <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">LIVE</Badge>}
                      </div>
                      <button onClick={() => setAutoExecuteSignals(!autoExecuteSignals)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${autoExecuteSignals ? 'bg-emerald-600' : 'bg-gray-700'}`}>
                        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${autoExecuteSignals ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    {autonomousSignals?.signals?.length > 0 && (
                      <div className="space-y-2">
                        {autonomousSignals.marketRead && (
                          <div className="bg-black/30 rounded p-2 text-xs text-gray-400 italic flex gap-2">
                            <Brain className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                            {autonomousSignals.marketRead}
                          </div>
                        )}
                        {autonomousSignals.signals.map((sig: any, i: number) => (
                          <div key={i} className={`rounded-xl border p-3 ${sig.direction === 'BUY' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-semibold text-white text-sm">{sig.symbol}</span>
                              <Badge variant="outline" className={`text-[10px] ${sig.direction === 'BUY' ? 'text-emerald-400 border-emerald-500/40' : 'text-red-400 border-red-500/40'}`}>{sig.direction}</Badge>
                              <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">{sig.confidence}%</Badge>
                              <Badge className="bg-gray-500/15 text-gray-400 border-gray-600 text-[10px]">{sig.strategy}</Badge>
                              <span className="ml-auto text-[10px] text-gray-500">{sig.holdTime}</span>
                            </div>
                            <p className="text-xs text-gray-300">{sig.reason}</p>
                            <div className="flex gap-3 text-[10px] text-gray-500 mt-1">
                              {sig.entryZone && <span>Entry: {sig.entryZone}</span>}
                              {sig.stopLoss && <span>SL: {sig.stopLoss}</span>}
                              {sig.takeProfit && <span>TP: {sig.takeProfit}</span>}
                              {sig.lotSize && <span>Lot: {sig.lotSize}</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        {/* ═══════════════════════════════════════════════════════
            EA STRATEGY FEED
        ═══════════════════════════════════════════════════════ */}
        {strategy?.hasStrategy && aiLogs.length > 0 && (
          <Card className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-purple-500/30">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-purple-400" /> MT5 EA Decision Feed
                  {liveMode?.live && <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px] animate-pulse">LIVE</Badge>}
                  <Badge variant="outline" className="text-purple-400 border-purple-500/40 text-[10px]">{aiLogs.length} decisions</Badge>
                </CardTitle>
                <Link href="/mt5-chart-data">
                  <Button variant="ghost" size="sm" className="text-purple-400 text-xs">Full Feed <ChevronRight className="w-3 h-3 ml-1" /></Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2.5 max-h-[350px] overflow-y-auto">
                {aiLogs.slice(0, 8).map((log: any) => (
                  <motion.div key={log.id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                    className={`rounded-xl border p-3 space-y-2 ${
                      log.aiDecision === 'APPROVED' ? 'border-emerald-500/30 bg-emerald-500/5' :
                      log.aiDecision === 'AI_OVERRIDE' ? 'border-blue-500/30 bg-blue-500/5' :
                      log.aiDecision === 'ADJUSTED' ? 'border-amber-500/30 bg-amber-500/5' :
                      log.aiDecision === 'REJECTED' ? 'border-red-500/30 bg-red-500/5' :
                      'border-gray-500/30 bg-gray-500/5'
                    }`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={`text-xs ${
                          log.aiDecision === 'APPROVED' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' :
                          log.aiDecision === 'AI_OVERRIDE' ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                          log.aiDecision === 'ADJUSTED' ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' :
                          log.aiDecision === 'REJECTED' ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                          'bg-gray-500/20 text-gray-400 border-gray-500/30'
                        }`}>{log.aiDecision === 'AI_OVERRIDE' ? 'AI OVERRIDE' : log.aiDecision}</Badge>
                        <span className="font-semibold text-white text-sm">{log.symbol}</span>
                        <Badge variant="outline" className="text-[10px] text-gray-400">{log.timeframe}</Badge>
                      </div>
                      <span className="text-[10px] text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-gray-500">EA:</span>
                      <Badge variant="outline" className={`text-[9px] ${log.proposedSignal === 'BUY' ? 'text-emerald-400 border-emerald-500/40' : 'text-red-400 border-red-500/40'}`}>{log.proposedSignal}</Badge>
                      <span className="text-gray-400">{log.proposedConfidence}%</span>
                      <span className="text-gray-600">→</span>
                      <span className="text-gray-500">AI:</span>
                      <Badge variant="outline" className={`text-[9px] ${log.aiDirection === 'BUY' ? 'text-emerald-400 border-emerald-500/40' : log.aiDirection === 'SELL' ? 'text-red-400 border-red-500/40' : 'text-gray-400 border-gray-500/40'}`}>{log.aiDirection}</Badge>
                      <span className="text-gray-400">{log.aiConfidence}%</span>
                    </div>
                    <div className="bg-black/30 rounded-lg p-2">
                      <p className="text-xs text-gray-400 flex items-start gap-1.5 italic">
                        <Lightbulb className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                        {log.reasoning}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

      </div>

      {/* Share Dialog */}
      <Dialog open={shareOpen} onOpenChange={setShareOpen}>
        <DialogContent className="sm:max-w-lg bg-gray-900 border-gray-700">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-white">
              <VeddLogo height={32} /> Share VEDD SS AI Progress
            </DialogTitle>
            <DialogDescription>Share your AI-powered trading journey with your network.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg overflow-hidden border border-gray-700 bg-gray-800">
              {shareCardMutation.isPending ? (
                <div className="flex items-center justify-center h-48 text-gray-400">
                  <Loader2 className="w-6 h-6 animate-spin mr-2" /> Generating share card...
                </div>
              ) : shareCardUrl ? (
                <div className="relative">
                  <img src={shareCardUrl} alt="VEDD SS AI Progress" className="w-full" />
                  <Button size="sm" variant="outline" onClick={handleDownloadCard} className="absolute top-2 right-2 bg-gray-900/80 border-gray-600 text-white hover:bg-gray-800">
                    <Download className="w-3.5 h-3.5 mr-1" /> Save
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-center h-48 text-gray-500">Card preview</div>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-gray-300 text-sm">Post Caption</Label>
                <Button size="sm" variant="ghost" onClick={() => generatePostMutation.mutate(selectedSharePlatform)}
                  disabled={generatePostMutation.isPending} className="text-purple-400 hover:text-purple-300 text-xs h-7">
                  {generatePostMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}
                  AI Generate
                </Button>
              </div>
              <Textarea value={sharePost} onChange={e => setSharePost(e.target.value)}
                placeholder="Write your post or click 'AI Generate'..."
                className="min-h-[80px] bg-gray-800 border-gray-700 text-white placeholder:text-gray-500" />
              <div className="flex flex-wrap gap-1">
                {['#VEDDAi', '#VEDDSSAI', '#AITrading', '#TradingAI'].map(tag => (
                  <Badge key={tag} variant="outline" className="text-[10px] text-purple-400 border-purple-500/30 cursor-pointer hover:bg-purple-500/10"
                    onClick={() => setSharePost(prev => prev.includes(tag) ? prev : prev + ' ' + tag)}>{tag}</Badge>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" onClick={() => { setSelectedSharePlatform('twitter'); handleShareToNative('twitter'); }} className="bg-black hover:bg-gray-900 text-white gap-2">
                <SiX className="w-4 h-4" /> X (Twitter)
              </Button>
              <Button size="sm" onClick={() => { setSelectedSharePlatform('facebook'); handleShareToNative('facebook'); }} className="bg-blue-600 hover:bg-blue-700 text-white gap-2">
                <SiFacebook className="w-4 h-4" /> Facebook
              </Button>
              <Button size="sm" onClick={() => { setSelectedSharePlatform('linkedin'); handleShareToNative('linkedin'); }} className="bg-blue-700 hover:bg-blue-800 text-white gap-2">
                <SiLinkedin className="w-4 h-4" /> LinkedIn
              </Button>
              <Button size="sm" onClick={handleCopyPost} variant="outline" className="border-gray-600 text-gray-300 gap-2">
                <Copy className="w-4 h-4" /> Copy Text
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
