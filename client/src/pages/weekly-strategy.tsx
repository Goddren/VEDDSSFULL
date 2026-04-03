import { useState, useEffect } from "react";
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
  const [profitMode, setProfitMode] = useState<'dollar'|'percent'>('dollar');
  const [profitPercent, setProfitPercent] = useState("20");
  const [accountBalance, setAccountBalance] = useState("100");
  const [autoBalanceSource, setAutoBalanceSource] = useState<string | null>(null);
  const [lotSize, setLotSize] = useState("");
  const [selectedPairs, setSelectedPairs] = useState<string[]>(["XAUUSD", "GBPJPY", "NAS100"]);
  const [pairInput, setPairInput] = useState("");
  const [strategyMode, setStrategyMode] = useState("aggressive");
  const [riskLevel, setRiskLevel] = useState<'conservative'|'moderate'|'aggressive'>('moderate');
  const [tradingDays, setTradingDays] = useState<string[]>(['Monday','Tuesday','Wednesday','Thursday','Friday']);
  const [pairDayAssignments, setPairDayAssignments] = useState<Record<string,string[]>>({});
  const [smartEscalation, setSmartEscalation] = useState(false);
  const [highConfidenceOverride, setHighConfidenceOverride] = useState(true);
  const [confirmationModel, setConfirmationModel] = useState<string>('gpt-4o');
  const [showPinPairs, setShowPinPairs] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showBrain, setShowBrain] = useState(false);
  const [showWeeklyPlan, setShowWeeklyPlan] = useState(false);
  const [liveEngineTab, setLiveEngineTab] = useState<'activity' | 'market' | 'pairs' | 'combos'>('activity');
  const [activeTab, setActiveTab] = useState<'plan'|'config'|'brain'|'engine'|'monitor'>('plan');

  // Deep-link support: ?tab=engine, ?tab=monitor, etc.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['plan','config','brain','engine','monitor'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, []);

  const { data: strategy, isLoading } = useQuery<WeeklyStrategy>({
    queryKey: ['/api/weekly-strategy'],
    refetchInterval: 30000, // refresh strategy display every 30s
  });

  const { data: liveMode } = useQuery<{ live: boolean; hasStrategy: boolean }>({
    queryKey: ['/api/weekly-strategy/live-mode'],
  });

  const { data: aiLogs = [] } = useQuery<any[]>({
    queryKey: ['/api/ai-confirmation-logs'],
    refetchInterval: 10000,
    enabled: !!strategy?.hasStrategy,
  });

  const { data: brainSummary, isLoading: brainLoading } = useQuery<any[]>({
    queryKey: ['/api/brain/summary'],
    refetchInterval: 120000,
  });

  // Auto-detect connected account balance (MT5 or TradeLocker)
  const { data: mt5AccountData } = useQuery<any>({
    queryKey: ['/api/mt5/account-data'],
    refetchInterval: 30000,
  });
  const { data: tlConnection } = useQuery<any>({
    queryKey: ['/api/tradelocker/connection'],
  });

  // Pre-fill balance from connected account whenever data arrives
  useEffect(() => {
    const mt5Balance = mt5AccountData?.accounts?.[0]?.balance ?? (mt5AccountData?.connected ? mt5AccountData?.balance : null);
    const tlBalance = (tlConnection as any)?.accountBalance ?? (tlConnection as any)?.balance ?? null;
    if (mt5Balance && mt5Balance > 0) {
      setAccountBalance(String(Math.round(mt5Balance * 100) / 100));
      setAutoBalanceSource('MT5');
    } else if (tlBalance && tlBalance > 0) {
      setAccountBalance(String(Math.round(tlBalance * 100) / 100));
      setAutoBalanceSource('TradeLocker');
    }
  }, [mt5AccountData, tlConnection]);

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
        riskLevel,
        lotSize: lotSize || undefined,
        strategyMode,
        tradingDays,
        pairDayAssignments,
        smartEscalation,
        highConfidenceOverride,
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
    mutationFn: async (silent?: boolean) => {
      const res = await apiRequest('POST', '/api/weekly-strategy/update-progress', {});
      const data = await res.json();
      return { ...data, silent };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      setActiveTrades(data.activeTrades || []);
      setUnrealizedPnL(data.unrealizedPnL || 0);
      setLastPositionUpdate(data.lastPositionUpdate || null);
      if (!data.silent) {
        const activeMsg = data.activeTradeCount > 0 ? ` | ${data.activeTradeCount} active trade(s)` : '';
        toast({ title: "Progress Synced", description: `$${data.currentProfit} closed P&L | $${data.unrealizedPnL || 0} unrealized${activeMsg}` });
      }
    },
  });

  // Auto-sync progress every 60 seconds when a strategy is active (silent — no toast)
  useEffect(() => {
    if (!strategy?.hasStrategy) return;
    updateProgressMutation.mutate(true); // immediate silent sync on mount
    const interval = setInterval(() => {
      updateProgressMutation.mutate(true);
    }, 60000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strategy?.hasStrategy]);

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

  // Load available vision models + user's current model preference
  const { data: aiModelsData } = useQuery<any>({
    queryKey: ['/api/ai-trading-models'],
  });
  const visionModels = (aiModelsData?.availableModels || []).filter((m: any) => !m.textOnly);

  // Load & sync user's saved model preference
  useQuery<any>({
    queryKey: ['/api/ai-trading-models/config'],
    onSuccess: (data: any) => {
      if (data?.selectedModel) setConfirmationModel(data.selectedModel);
    },
  } as any);

  const setModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      const res = await apiRequest('POST', '/api/ai-trading-models/set-model', { modelId });
      return res.json();
    },
    onSuccess: () => toast({ title: "Model Updated", description: `2nd confirmation now uses ${confirmationModel}` }),
  });

  const handleSetConfirmationModel = (modelId: string) => {
    setConfirmationModel(modelId);
    setModelMutation.mutate(modelId);
  };

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
  const [enginePyramiding, setEnginePyramiding] = useState(false);
  const [engineKellyCriterion, setEngineKellyCriterion] = useState(false);
  const [engineDrawdownShield, setEngineDrawdownShield] = useState(true);
  const [engineShieldThreshold, setEngineShieldThreshold] = useState(3);
  const [engineAdaptiveScan, setEngineAdaptiveScan] = useState(true);
  const [engineDailyLossLimit, setEngineDailyLossLimit] = useState(5);
  const [engineTrailMethod, setEngineTrailMethod] = useState<'staged_volume' | 'chandelier' | 'r_multiple' | 'swing_structure' | 'parabolic_sar' | 'none' | 'fixed_pip' | 'profit_lock' | 'stepped_fixed'>('staged_volume');
  const [engineTrailFixedPips, setEngineTrailFixedPips] = useState(20);
  const [engineTrailStepPips, setEngineTrailStepPips] = useState(10);
  const [engineTrailProfitLockPct, setEngineTrailProfitLockPct] = useState(60);
  const [engineTrailActivationPips, setEngineTrailActivationPips] = useState(15);
  const [engineTrailSarInitialAF, setEngineTrailSarInitialAF] = useState(0.02);
  const [engineTrailSarMaxAF, setEngineTrailSarMaxAF] = useState(0.20);
  const [engineRiskPerTrade, setEngineRiskPerTrade] = useState(1);
  const [engineBreakevenBufferPips, setEngineBreakevenBufferPips] = useState(5);
  const [trailCalcOpen, setTrailCalcOpen] = useState(false);

  const [engineAiMode, setEngineAiMode] = useState<'full' | 'economy' | 'rule_based'>('full');

  const [kellyMode, setKellyMode] = useState(false);
  const [preKellySnapshot, setPreKellySnapshot] = useState<{
    mode: string; minConf: number; trailMethod: string;
    pyramiding: boolean; compounding: boolean; kellyCriterion: boolean;
  } | null>(null);

  const applyKellyPreset = (on: boolean) => {
    if (on) {
      setPreKellySnapshot({
        mode: engineMode, minConf: engineMinConf, trailMethod: engineTrailMethod,
        pyramiding: enginePyramiding, compounding: engineCompounding, kellyCriterion: engineKellyCriterion,
      });
      setEngineKellyCriterion(true);
      setEngineTrailMethod('r_multiple');
      setEngineMode('sniper');
      setEngineMinConf(72);
      setEnginePyramiding(false);
      setEngineCompounding(false);
      setKellyMode(true);
    } else {
      if (preKellySnapshot) {
        setEngineMode(preKellySnapshot.mode);
        setEngineMinConf(preKellySnapshot.minConf);
        setEngineTrailMethod(preKellySnapshot.trailMethod as typeof engineTrailMethod);
        setEnginePyramiding(preKellySnapshot.pyramiding);
        setEngineCompounding(preKellySnapshot.compounding);
        setEngineKellyCriterion(preKellySnapshot.kellyCriterion);
      } else {
        setEngineKellyCriterion(false);
        setEngineTrailMethod('staged_volume');
        setEngineMode('aggressive');
        setEngineMinConf(65);
        setEnginePyramiding(false);
        setEngineCompounding(true);
      }
      setKellyMode(false);
      setPreKellySnapshot(null);
    }
  };

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
        enablePyramiding: enginePyramiding,
        useKellyCriterion: engineKellyCriterion,
        drawdownShieldThreshold: engineDrawdownShield ? engineShieldThreshold : 0,
        adaptiveScanInterval: engineAdaptiveScan,
        dailyLossLimit: engineDailyLossLimit,
        riskPerTrade: engineRiskPerTrade,
        trailMethod: engineTrailMethod,
        breakevenBufferPips: engineBreakevenBufferPips,
        trailFixedPips: engineTrailFixedPips,
        trailStepPips: engineTrailStepPips,
        trailProfitLockPct: engineTrailProfitLockPct,
        trailActivationPips: engineTrailActivationPips,
        trailSarInitialAF: engineTrailSarInitialAF,
        trailSarMaxAF: engineTrailSarMaxAF,
        aiMode: engineAiMode,
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

  const emergencyStopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/vedd-live-engine/emergency-stop', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-live-engine/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-live-engine/activity'] });
      toast({
        title: "EMERGENCY STOP EXECUTED",
        description: "CLOSE ALL signal sent to MT5 EA. All positions will be closed immediately.",
        variant: "destructive",
      });
    },
    onError: (err: any) => {
      toast({ title: "Emergency Stop Failed", description: err.message, variant: "destructive" });
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

        {/* ─── Weekly Plan Progress (always visible at top) ── */}
        {strategy?.hasStrategy && (
          <div className="rounded-xl bg-gradient-to-r from-gray-900/80 to-gray-900/60 border border-gray-800 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-400" />
                <span className="text-white font-semibold text-sm">Weekly Growth Plan</span>
                {plan?.feasibility && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                    plan.feasibility === 'ACHIEVABLE' ? 'bg-emerald-500/20 text-emerald-400' :
                    plan.feasibility === 'AGGRESSIVE' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>{plan.feasibility}</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-400">${(strategy.currentProfit || 0).toFixed(2)} / ${strategy.profitTarget}</span>
                <span className="text-orange-400 font-bold text-sm">{strategy.progressPercentage || 0}%</span>
              </div>
            </div>
            <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${Math.min(100, strategy.progressPercentage || 0)}%`,
                  background: (strategy.progressPercentage || 0) >= 100
                    ? 'linear-gradient(90deg,#10b981,#34d399)'
                    : (strategy.progressPercentage || 0) >= 60
                    ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                    : 'linear-gradient(90deg,#dc2626,#ef4444)'
                }}
              />
            </div>
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
              <span>{strategy.progressTrades ?? 0} trades</span>
              <span>{strategy.progressWinRate ?? 0}% win rate</span>
              {liveMode?.live && <span className="text-emerald-400 animate-pulse">● EA Guidance LIVE</span>}
            </div>
          </div>
        )}

        {/* ─── Tab Navigation ──────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-gray-900/60 border border-gray-800 rounded-xl mb-6 overflow-x-auto">
          {([
            { id: 'plan',    label: '1. Weekly Plan',    emoji: '📅' },
            { id: 'config',  label: '2. AI Config',      emoji: '⚙️' },
            { id: 'brain',   label: '3. Brain Dashboard', emoji: '🧠' },
            { id: 'engine',  label: '4. Live Engine',    emoji: '⚡' },
            { id: 'monitor', label: '5. Session Monitor', emoji: '📊' },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center ${
                activeTab === tab.id
                  ? 'bg-red-600 text-white shadow-lg'
                  : 'text-gray-400 hover:text-white hover:bg-gray-800'
              }`}
            >
              <span>{tab.emoji}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ─── Tab: Weekly Plan ─────────────────────────────── */}
        {activeTab === 'plan' && (
          <>

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
                    <div className="flex flex-col gap-2 items-center">
                      <Button size="sm" variant="destructive" onClick={() => stopEngineMutation.mutate()} disabled={stopEngineMutation.isPending || emergencyStopMutation.isPending} className="gap-1 text-xs">
                        <XCircle className="w-3.5 h-3.5" /> Stop Engine
                      </Button>
                      <button
                        onClick={() => {
                          if (window.confirm('EMERGENCY STOP: This will immediately close ALL open positions on your MT5 account and halt the engine. Are you sure?')) {
                            emergencyStopMutation.mutate();
                          }
                        }}
                        disabled={emergencyStopMutation.isPending}
                        className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white border-2 border-red-400/60 shadow-lg shadow-red-500/30 animate-pulse hover:animate-none transition-all disabled:opacity-50"
                      >
                        {emergencyStopMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <AlertCircle className="w-3 h-3" />
                        )}
                        🚨 CLOSE ALL & HALT
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Daily loss halted warning */}
              {liveEngineStatus?.dailyLossHalted && (
                <div className="mt-3 mx-0 flex items-center gap-3 rounded-xl border-2 border-red-500/70 bg-red-950/40 px-4 py-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-red-400 font-bold text-sm">Daily Loss Limit Hit — Engine Halted</p>
                    <p className="text-red-400/70 text-xs">CLOSE ALL signal sent to MT5 EA at {liveEngineStatus.dailyLossHaltedAt ? new Date(liveEngineStatus.dailyLossHaltedAt).toLocaleTimeString() : 'N/A'}. Restart engine tomorrow.</p>
                  </div>
                </div>
              )}

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
                      <Label className="text-gray-400 text-xs">Risk Per Trade (%)</Label>
                      <Input type="number" value={engineRiskPerTrade} onChange={e => setEngineRiskPerTrade(Math.min(10, Math.max(0.1, Number(e.target.value))))}
                        min={0.1} max={10} step={0.1} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
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
                      <Label className="text-gray-400 text-xs flex items-center gap-1">
                        Min Confidence (%)
                        {kellyMode && <span className="text-amber-400 text-[9px] font-bold">⚡ Kelly</span>}
                      </Label>
                      <Input type="number" value={engineMinConf} onChange={e => !kellyMode && setEngineMinConf(Number(e.target.value))}
                        min={50} max={95} readOnly={kellyMode}
                        className={`mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm ${kellyMode ? 'opacity-70 cursor-not-allowed border-amber-700/50' : ''}`} />
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
                      <Label className="text-gray-400 text-xs flex items-center gap-1">
                        Strategy Mode
                        {kellyMode && <span className="text-amber-400 text-[9px] font-bold">⚡ Kelly</span>}
                      </Label>
                      <select value={engineMode} onChange={e => !kellyMode && setEngineMode(e.target.value)}
                        disabled={kellyMode}
                        className={`mt-1 w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-md h-8 px-2 ${kellyMode ? 'opacity-70 cursor-not-allowed border-amber-700/50' : ''}`}>
                        {[
                          { id: 'scalping', name: 'Scalping HFT' },
                          { id: 'momentum', name: 'Momentum Surfing' },
                          { id: 'session_breakout', name: 'Session Breakout' },
                          { id: 'aggressive', name: 'Aggressive Compound' },
                          { id: 'sniper', name: 'Sniper Mode' },
                        ].map(m => <option key={m.id} value={m.id}>{m.name}{enginePropFirmMode && m.id === 'sniper' ? ' (Prop Firm)' : ''}</option>)}
                      </select>
                    </div>
                    <div>
                      <Label className="text-red-400 text-xs font-semibold flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" /> Daily Loss Limit (%)
                      </Label>
                      <Input type="number" value={engineDailyLossLimit} onChange={e => setEngineDailyLossLimit(Number(e.target.value))}
                        min={1} max={20} step={0.5} className="mt-1 bg-gray-800 border-red-900/50 text-white h-8 text-sm" />
                      <p className="text-[10px] text-red-400/70 mt-0.5">Auto-closes all trades + halts engine</p>
                    </div>
                  </div>

                  {/* ── AI Mode Selector ── */}
                  <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-gray-300">AI Mode — Cost Control</span>
                      {engineAiMode === 'economy' && <span className="text-[9px] bg-green-500/20 text-green-300 border border-green-500/40 rounded px-1.5 py-0.5 font-medium">COST REDUCED</span>}
                      {engineAiMode === 'rule_based' && <span className="text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded px-1.5 py-0.5 font-medium">ZERO API COST</span>}
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { id: 'full' as const, label: 'Full AI', sub: 'GPT-4o / your provider', color: 'blue' },
                        { id: 'economy' as const, label: 'Economy', sub: 'Groq — free tier', color: 'green' },
                        { id: 'rule_based' as const, label: 'Rule-Based', sub: 'No API calls', color: 'amber' },
                      ].map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setEngineAiMode(opt.id)}
                          className={`rounded-lg border p-2 text-left transition-all ${
                            engineAiMode === opt.id
                              ? opt.color === 'blue' ? 'border-blue-500/60 bg-blue-500/15'
                              : opt.color === 'green' ? 'border-green-500/60 bg-green-500/15'
                              : 'border-amber-500/60 bg-amber-500/15'
                              : 'border-gray-700 bg-gray-800/30 hover:border-gray-600'
                          }`}
                        >
                          <div className={`text-[11px] font-semibold ${
                            engineAiMode === opt.id
                              ? opt.color === 'blue' ? 'text-blue-300'
                              : opt.color === 'green' ? 'text-green-300'
                              : 'text-amber-300'
                              : 'text-gray-300'
                          }`}>{opt.label}</div>
                          <div className="text-[9px] text-gray-500 mt-0.5">{opt.sub}</div>
                        </button>
                      ))}
                    </div>
                    <p className="text-[10px] text-gray-500">
                      {engineAiMode === 'full' && 'Best quality. Uses your active AI provider for every scan cycle.'}
                      {engineAiMode === 'economy' && '💚 Routes all scans to Groq Llama 3.3-70b (free tier). Add GROQ_API_KEY for activation. Pre-filter + cache still apply.'}
                      {engineAiMode === 'rule_based' && '⚙️ Zero API calls. Pure server-side indicator consensus — RSI, MACD, Stochastic, ADX, VWAP, OBV, candle patterns. Great for strategy testing.'}
                    </p>
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
                    <label className={`flex items-center gap-2 ${kellyMode ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input type="checkbox" checked={engineCompounding} onChange={e => !kellyMode && setEngineCompounding(e.target.checked)} disabled={kellyMode} className="accent-cyan-500" />
                      <span className="text-xs text-gray-400">Auto-compound on win streaks</span>
                      {kellyMode && <span className="text-amber-400 text-[9px] font-bold">⚡ Kelly</span>}
                    </label>
                    {!isRunning && (
                      <Button onClick={() => startEngineMutation.mutate()} disabled={startEngineMutation.isPending}
                        className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 gap-1">
                        {startEngineMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                        Launch Engine
                      </Button>
                    )}
                  </div>

                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/5 p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-semibold text-purple-300">Trail Strategy</span>
                      {engineTrailMethod !== 'staged_volume' && engineTrailMethod !== 'none' && !kellyMode && (
                        <span className="text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded px-1.5 py-0.5 font-medium">SERVER-SIDE MATH</span>
                      )}
                      {engineTrailMethod === 'none' && (
                        <span className="text-[9px] bg-red-500/20 text-red-400 border border-red-500/40 rounded px-1.5 py-0.5 font-medium">NO TRAIL</span>
                      )}
                      {kellyMode && <span className="text-amber-400 text-[9px] font-bold">⚡ Kelly</span>}
                    </div>
                    <select
                      value={engineTrailMethod}
                      onChange={e => !kellyMode && setEngineTrailMethod(e.target.value as typeof engineTrailMethod)}
                      disabled={kellyMode}
                      className={`w-full bg-gray-800 border border-purple-500/30 text-white text-xs rounded-md h-8 px-2 ${kellyMode ? 'opacity-70 cursor-not-allowed border-amber-700/50' : ''}`}
                    >
                      <optgroup label="── AI-Managed ──">
                        <option value="staged_volume">Staged Volume Trail — default: volume-aware staged pips</option>
                      </optgroup>
                      <optgroup label="── Server-Side Math ──">
                        <option value="chandelier">Chandelier Exit — institutional: ATR×multiplier from swing extreme</option>
                        <option value="r_multiple">R-Multiple Ladder — prop firm: lock in R multiples (1R→BE, 2R→+1R…)</option>
                        <option value="swing_structure">Swing High/Low — price action: trail behind S/R structure</option>
                        <option value="parabolic_sar">Parabolic SAR — Wilder's classic accelerating stop</option>
                        <option value="fixed_pip">Fixed Pip Trail — maintain exact X-pip gap from price peak</option>
                        <option value="profit_lock">Profit Lock % — never give back more than X% of peak profit</option>
                        <option value="stepped_fixed">Stepped Trail — fixed pip trail in N-pip chunks only</option>
                      </optgroup>
                      <optgroup label="── No Protection ──">
                        <option value="none">No Trail — hold to full TP, SL never adjusted</option>
                      </optgroup>
                    </select>
                    <p className="text-[10px] text-purple-300/60">
                      {engineTrailMethod === 'staged_volume' && 'AI manages trail SL — breakeven at 15p, trail from 40p, volume-adjusted distance.'}
                      {engineTrailMethod === 'chandelier' && 'Server tracks highest high/lowest low since entry. SL = peak ± ATR × multiplier. Ratchets only in your favour.'}
                      {engineTrailMethod === 'r_multiple' && 'Server locks in risk-reward increments: 1R profit → move to entry + buffer pips, 2R → +1R, 3R → +2R, and so on.'}
                      {engineTrailMethod === 'swing_structure' && 'Server trails SL to just below the nearest support (longs) or above nearest resistance (shorts) each scan.'}
                      {engineTrailMethod === 'parabolic_sar' && 'Server computes SAR each scan cycle. Starts slow, accelerates as trade runs in your favour. Tracked per position.'}
                      {engineTrailMethod === 'fixed_pip' && `Server keeps SL exactly ${engineTrailFixedPips} pips from the price peak (highest high for buys, lowest low for sells). Ratchets only in your favour.`}
                      {engineTrailMethod === 'profit_lock' && `Server ensures SL is always set so at least ${engineTrailProfitLockPct}% of peak profit is locked in. As trade runs further, the lock-in floor moves up.`}
                      {engineTrailMethod === 'stepped_fixed' && `Fixed pip trail that only moves SL in ${engineTrailStepPips}-pip chunks. Reduces micro-adjustments and broker rejections vs continuous trail.`}
                      {engineTrailMethod === 'none' && 'No stop adjustment whatsoever. Positions run to full TP or original SL. AI will not output trail actions.'}
                    </p>

                    {/* No Trail warning */}
                    {engineTrailMethod === 'none' && (
                      <div className="mt-1 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[10px] text-amber-400">
                        Original SL is the only protection. Ensure your TP targets are realistic and your SL is properly placed before starting the engine.
                      </div>
                    )}

                    {/* Universal Trail Activation Pips — all server-side methods */}
                    {['chandelier', 'r_multiple', 'swing_structure', 'parabolic_sar', 'fixed_pip', 'profit_lock', 'stepped_fixed'].includes(engineTrailMethod) && (
                      <div className="mt-1 flex items-center gap-2 bg-purple-500/10 border border-purple-500/25 rounded-lg px-3 py-2">
                        <div className="flex-1">
                          <div className="text-[10px] font-semibold text-purple-300">Trail Activation (pips in profit)</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">Trail won't activate until the position reaches this profit threshold</div>
                        </div>
                        <input
                          type="number"
                          value={engineTrailActivationPips}
                          onChange={e => setEngineTrailActivationPips(Math.min(100, Math.max(0, Number(e.target.value))))}
                          min={0} max={100} step={1}
                          className="w-14 h-7 bg-gray-800 border border-purple-600 text-purple-300 text-xs px-2 rounded text-center font-bold"
                        />
                        <span className="text-[10px] text-gray-400">pips</span>
                      </div>
                    )}

                    {/* R-Multiple: breakeven buffer pips */}
                    {engineTrailMethod === 'r_multiple' && (
                      <div className="mt-1 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">
                        <div className="flex-1">
                          <div className="text-[10px] font-semibold text-emerald-300">1R Breakeven Buffer (pips)</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">Adds X pips above entry at 1R — turns flat breakeven closes into small winners</div>
                        </div>
                        <input
                          type="number"
                          value={engineBreakevenBufferPips}
                          onChange={e => setEngineBreakevenBufferPips(Math.min(20, Math.max(0, Number(e.target.value))))}
                          min={0} max={20} step={1}
                          className="w-14 h-7 bg-gray-800 border border-emerald-600 text-emerald-300 text-xs px-2 rounded text-center font-bold"
                        />
                        <span className="text-[10px] text-gray-400">pips</span>
                      </div>
                    )}

                    {/* Fixed Pip Trail / Stepped Fixed: pip distance */}
                    {(engineTrailMethod === 'fixed_pip' || engineTrailMethod === 'stepped_fixed') && (
                      <div className="mt-1 space-y-1.5">
                        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/25 rounded-lg px-3 py-2">
                          <div className="flex-1">
                            <div className="text-[10px] font-semibold text-blue-300">Trail Distance (pips)</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">Gap maintained between price peak and SL</div>
                          </div>
                          <input
                            type="number"
                            value={engineTrailFixedPips}
                            onChange={e => setEngineTrailFixedPips(Math.min(200, Math.max(5, Number(e.target.value))))}
                            min={5} max={200} step={5}
                            className="w-14 h-7 bg-gray-800 border border-blue-600 text-blue-300 text-xs px-2 rounded text-center font-bold"
                          />
                          <span className="text-[10px] text-gray-400">pips</span>
                        </div>
                        {engineTrailMethod === 'stepped_fixed' && (
                          <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/25 rounded-lg px-3 py-2">
                            <div className="flex-1">
                              <div className="text-[10px] font-semibold text-blue-300">Step Size (pips)</div>
                              <div className="text-[10px] text-gray-500 mt-0.5">Minimum improvement before SL moves — prevents micro-adjustments</div>
                            </div>
                            <input
                              type="number"
                              value={engineTrailStepPips}
                              onChange={e => setEngineTrailStepPips(Math.min(50, Math.max(1, Number(e.target.value))))}
                              min={1} max={50} step={1}
                              className="w-14 h-7 bg-gray-800 border border-blue-600 text-blue-300 text-xs px-2 rounded text-center font-bold"
                            />
                            <span className="text-[10px] text-gray-400">pips</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Profit Lock %: lock percentage */}
                    {engineTrailMethod === 'profit_lock' && (
                      <div className="mt-1 flex items-center gap-2 bg-green-500/10 border border-green-500/25 rounded-lg px-3 py-2">
                        <div className="flex-1">
                          <div className="text-[10px] font-semibold text-green-300">Profit Lock %</div>
                          <div className="text-[10px] text-gray-500 mt-0.5">Server ensures at least this % of peak profit is locked in at all times</div>
                        </div>
                        <input
                          type="number"
                          value={engineTrailProfitLockPct}
                          onChange={e => setEngineTrailProfitLockPct(Math.min(90, Math.max(10, Number(e.target.value))))}
                          min={10} max={90} step={5}
                          className="w-14 h-7 bg-gray-800 border border-green-600 text-green-300 text-xs px-2 rounded text-center font-bold"
                        />
                        <span className="text-[10px] text-gray-400">%</span>
                      </div>
                    )}

                    {/* Parabolic SAR: configurable AF */}
                    {engineTrailMethod === 'parabolic_sar' && (
                      <div className="mt-1 space-y-1.5">
                        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-2">
                          <div className="flex-1">
                            <div className="text-[10px] font-semibold text-orange-300">Initial AF</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">Starting acceleration factor — lower = slower start (0.01–0.05)</div>
                          </div>
                          <input
                            type="number"
                            value={engineTrailSarInitialAF}
                            onChange={e => setEngineTrailSarInitialAF(Math.min(0.05, Math.max(0.01, Number(e.target.value))))}
                            min={0.01} max={0.05} step={0.01}
                            className="w-16 h-7 bg-gray-800 border border-orange-600 text-orange-300 text-xs px-2 rounded text-center font-bold"
                          />
                        </div>
                        <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/25 rounded-lg px-3 py-2">
                          <div className="flex-1">
                            <div className="text-[10px] font-semibold text-orange-300">Max AF</div>
                            <div className="text-[10px] text-gray-500 mt-0.5">Maximum acceleration factor — lower = wider SAR (0.10–0.40)</div>
                          </div>
                          <input
                            type="number"
                            value={engineTrailSarMaxAF}
                            onChange={e => setEngineTrailSarMaxAF(Math.min(0.40, Math.max(0.10, Number(e.target.value))))}
                            min={0.10} max={0.40} step={0.05}
                            className="w-16 h-7 bg-gray-800 border border-orange-600 text-orange-300 text-xs px-2 rounded text-center font-bold"
                          />
                        </div>
                      </div>
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

                  {/* ── Auto-Pyramid Winners ── */}
                  <div className={`rounded-xl border p-3 transition-all ${kellyMode ? 'opacity-60' : ''} ${enginePyramiding ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <label className={`flex items-center gap-2 ${kellyMode ? 'cursor-not-allowed' : 'cursor-pointer'}`} onClick={() => !kellyMode && setEnginePyramiding(p => !p)}>
                      <input type="checkbox" checked={enginePyramiding} onChange={() => {}} disabled={kellyMode} className="accent-emerald-500" />
                      <div>
                        <span className="text-xs font-semibold text-emerald-300">Auto-Pyramid Winners</span>
                        {enginePyramiding && !kellyMode && <Badge className="ml-2 bg-emerald-500/30 text-emerald-300 border-emerald-500/50 text-[9px]">SCALING ON</Badge>}
                        {kellyMode && <span className="ml-2 text-amber-400 text-[9px] font-bold">⚡ Kelly OFF</span>}
                      </div>
                    </label>
                    {enginePyramiding && (
                      <p className="text-[10px] text-emerald-400/80 mt-1.5">📈 Adds 50% lot at +15 pips profit, parent SL moves to breakeven. Max 2 layers.</p>
                    )}
                  </div>

                  {/* ── Kelly Mode Preset ── */}
                  <div className={`rounded-xl border p-3 transition-all ${kellyMode ? 'border-amber-400/70 bg-amber-500/10' : 'border-gray-600/60 bg-gray-800/40'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">⚡</span>
                        <span className={`text-xs font-bold ${kellyMode ? 'text-amber-300' : 'text-gray-300'}`}>Kelly Mode — Complete System</span>
                        {kellyMode && <Badge className="bg-amber-500/30 text-amber-200 border-amber-500/50 text-[9px] animate-pulse">KELLY SYSTEM LIVE</Badge>}
                      </div>
                      <button
                        onClick={() => applyKellyPreset(!kellyMode)}
                        className={`text-[10px] font-semibold px-3 py-1 rounded-md border transition-all ${
                          kellyMode
                            ? 'border-amber-500/60 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                            : 'border-gray-600 bg-gray-700/60 text-gray-300 hover:bg-gray-700 hover:text-white'
                        }`}
                      >
                        {kellyMode ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400 mb-2.5">
                      One toggle configures all 6 settings for optimal Kelly performance. Restores your previous settings when deactivated.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {[
                        { label: 'Kelly Criterion Sizing', value: 'ON', active: kellyMode },
                        { label: 'Trail: R-Multiple Ladder', value: 'locked', active: kellyMode },
                        { label: 'Mode: Sniper', value: 'quality entries', active: kellyMode },
                        { label: 'Min Confidence', value: '72%', active: kellyMode },
                        { label: 'Auto-Pyramid', value: 'OFF', active: kellyMode },
                        { label: 'Streak Compounding', value: 'OFF', active: kellyMode },
                      ].map(item => (
                        <div key={item.label} className={`flex items-center gap-1.5 text-[10px] rounded px-2 py-1 ${item.active ? 'bg-amber-500/10 text-amber-200' : 'bg-gray-800/60 text-gray-500'}`}>
                          <span>{item.active ? '✓' : '○'}</span>
                          <span className="flex-1">{item.label}</span>
                          <span className={`font-semibold ${item.active ? 'text-amber-300' : 'text-gray-600'}`}>{item.value}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-amber-400/60 mt-2">⚠ Kelly sizing activates after 5+ trades per strategy. Uses base lot size until then.</p>
                  </div>

                  {/* ── Kelly Criterion Sizing ── */}
                  <div className={`rounded-xl border p-3 transition-all ${engineKellyCriterion ? 'border-blue-500/60 bg-blue-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => { if (!kellyMode) setEngineKellyCriterion(k => !k); }}>
                      <input type="checkbox" checked={engineKellyCriterion} onChange={() => {}} className="accent-blue-500" />
                      <div>
                        <span className="text-xs font-semibold text-blue-300">Kelly Criterion Sizing</span>
                        {engineKellyCriterion && <Badge className="ml-2 bg-blue-500/30 text-blue-300 border-blue-500/50 text-[9px]">SMART LOTS</Badge>}
                      </div>
                    </label>
                    {engineKellyCriterion && (
                      <p className="text-[10px] text-blue-400/80 mt-1.5">📐 Lot sizes auto-calculated from your per-strategy win rate and R:R history. Smarter than fixed sizing.</p>
                    )}
                  </div>

                  {/* ── Dual-Mode Arbitration Notice ── */}
                  {enginePyramiding && engineKellyCriterion && (
                    <div className="rounded-xl border border-purple-500/50 bg-purple-500/10 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-purple-300 text-sm">🧠</span>
                        <span className="text-xs font-bold text-purple-200">Smart Arbitration Mode Active</span>
                        <Badge className="ml-auto bg-purple-500/30 text-purple-300 border-purple-500/50 text-[9px]">AI DECIDES</Badge>
                      </div>
                      <p className="text-[10px] text-purple-300/80 leading-relaxed">
                        Both Pyramid + Kelly are on. The AI engine will automatically choose per trade:
                      </p>
                      <div className="mt-1.5 space-y-1">
                        <div className="flex items-start gap-1.5">
                          <span className="text-[10px] text-emerald-400 font-bold mt-px">ADX ≥ 25</span>
                          <span className="text-[10px] text-gray-300">— Trending market: Kelly sets the base lot, pyramid adds to winners at +15 pips</span>
                        </div>
                        <div className="flex items-start gap-1.5">
                          <span className="text-[10px] text-blue-400 font-bold mt-px">ADX &lt; 25</span>
                          <span className="text-[10px] text-gray-300">— Ranging market: Kelly only, pyramiding suppressed to protect capital</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ── Drawdown Shield ── */}
                  <div className={`rounded-xl border p-3 transition-all ${engineDrawdownShield ? 'border-orange-500/60 bg-orange-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 cursor-pointer" onClick={() => setEngineDrawdownShield(d => !d)}>
                        <input type="checkbox" checked={engineDrawdownShield} onChange={() => {}} className="accent-orange-500" />
                        <div>
                          <span className="text-xs font-semibold text-orange-300">Drawdown Shield</span>
                          {engineDrawdownShield && <Badge className="ml-2 bg-orange-500/30 text-orange-300 border-orange-500/50 text-[9px]">PROTECTING</Badge>}
                        </div>
                      </label>
                      {engineDrawdownShield && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-gray-400">Trigger at:</span>
                          <input
                            type="number"
                            value={engineShieldThreshold}
                            onChange={e => setEngineShieldThreshold(Number(e.target.value))}
                            min={1} max={10} step={0.5}
                            className="w-14 h-6 bg-gray-800 border border-orange-700 text-orange-300 text-[11px] px-1 rounded"
                          />
                          <span className="text-[10px] text-gray-400">% DD</span>
                        </div>
                      )}
                    </div>
                    {engineDrawdownShield && (
                      <p className="text-[10px] text-orange-400/80 mt-1.5">🛡️ Auto-switches to Sniper-only if session drops {engineShieldThreshold}% from peak. Protects your gains.</p>
                    )}
                  </div>

                  {/* ── Adaptive Scan Speed ── */}
                  <div className={`rounded-xl border p-3 transition-all ${engineAdaptiveScan ? 'border-violet-500/60 bg-violet-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => setEngineAdaptiveScan(a => !a)}>
                      <input type="checkbox" checked={engineAdaptiveScan} onChange={() => {}} className="accent-violet-500" />
                      <div>
                        <span className="text-xs font-semibold text-violet-300">Adaptive Scan Speed</span>
                        {engineAdaptiveScan && <Badge className="ml-2 bg-violet-500/30 text-violet-300 border-violet-500/50 text-[9px]">AUTO-FREQ</Badge>}
                      </div>
                    </label>
                    {engineAdaptiveScan && (
                      <p className="text-[10px] text-violet-400/80 mt-1.5">⚡ 15s during London/NY overlap, 30s active sessions, 90s overnight. Catches more setups during peak hours.</p>
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
                      <CardTitle className="text-base flex items-center gap-2 text-white flex-wrap">
                        <Brain className="w-4 h-4 text-cyan-400" /> AI Strategy Feed
                        <Badge className="bg-cyan-500/20 text-cyan-400 border-cyan-500/30 text-[10px] animate-pulse">LIVE</Badge>
                        {liveEngineStatus?.drawdownShieldActive && (
                          <Badge className="bg-amber-500/30 text-amber-300 border-amber-500/50 text-[10px] animate-pulse">🛡️ SHIELD ON</Badge>
                        )}
                        {liveEngineStatus?.strategyPerformanceWeights && (() => {
                          const hot = Object.entries(liveEngineStatus.strategyPerformanceWeights).filter(([, v]) => (v as number) >= 1.5);
                          return hot.length > 0 ? (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">🔥 {hot.length} HOT</Badge>
                          ) : null;
                        })()}
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

                {/* Trail Efficiency Calculator */}
                {(() => {
                  const bal = liveEngineStatus?.config?.accountBalance || engineAccountBalance;
                  const risk = liveEngineStatus?.config?.riskPerTrade || engineRiskPerTrade;
                  const target = liveEngineStatus?.config?.weeklyProfitTarget || engineWeeklyTarget;
                  if (bal <= 0 || target <= 0 || risk <= 0) return null;
                  const riskDollar = bal * risk / 100;
                  const targetDollar = target;
                  const bufPips = liveEngineStatus?.config?.breakevenBufferPips ?? engineBreakevenBufferPips;
                  // Assume avg SL = 20 pips, so buffer profit = (bufPips/20) * riskDollar
                  const approxSlPips = 20;
                  const bufProfit = bufPips > 0 ? (bufPips / approxSlPips) * riskDollar : 0;
                  const rows = [
                    { label: `1R + ${bufPips}p buffer`, profit: bufProfit },
                    { label: '2R', profit: riskDollar },
                    { label: '3R', profit: riskDollar * 2 },
                    { label: '4R', profit: riskDollar * 3 },
                  ];
                  return (
                    <Card className="bg-gray-900/60 border-yellow-500/20">
                      <button
                        className="w-full text-left"
                        onClick={() => setTrailCalcOpen(o => !o)}
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center justify-between text-white">
                            <span className="flex items-center gap-2">
                              <span className="text-yellow-400">📐</span> Trail Efficiency Calculator
                            </span>
                            {trailCalcOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                          </CardTitle>
                        </CardHeader>
                      </button>
                      {trailCalcOpen && (
                        <CardContent className="pt-0 space-y-3">
                          <div className="text-[10px] text-gray-400">
                            Based on <span className="text-white font-semibold">${bal.toLocaleString()}</span> balance · <span className="text-white font-semibold">{risk}% risk</span> = <span className="text-emerald-400 font-bold">${riskDollar.toFixed(2)} / trade</span> · Target: <span className="text-yellow-400 font-bold">${targetDollar}</span>
                          </div>
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-gray-500 border-b border-gray-700/50">
                                <th className="text-left pb-1.5 font-semibold">Trail closes at</th>
                                <th className="text-right pb-1.5 font-semibold">Profit locked</th>
                                <th className="text-right pb-1.5 font-semibold">Trades to goal</th>
                              </tr>
                            </thead>
                            <tbody>
                              {rows.map((row, i) => {
                                const tradesNeeded = row.profit > 0 ? Math.ceil(targetDollar / row.profit) : '∞';
                                const isFirst = i === 0;
                                return (
                                  <tr key={row.label} className="border-b border-gray-800/50">
                                    <td className={`py-1.5 font-medium ${isFirst ? 'text-emerald-400' : 'text-gray-300'}`}>{row.label}</td>
                                    <td className={`py-1.5 text-right ${isFirst ? 'text-emerald-400' : 'text-cyan-400'}`}>
                                      {row.profit > 0 ? `~$${row.profit.toFixed(2)}` : <span className="text-gray-500">—</span>}
                                    </td>
                                    <td className={`py-1.5 text-right font-bold ${isFirst ? 'text-amber-400' : typeof tradesNeeded === 'number' && tradesNeeded <= 20 ? 'text-emerald-400' : 'text-gray-400'}`}>
                                      {tradesNeeded}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                          <p className="text-[10px] text-gray-500 italic border-t border-gray-700/50 pt-2">
                            Trail is insurance — aim for TP, let trail protect gains on reversals. 2R+ closes are where the account grows fastest.
                          </p>
                        </CardContent>
                      )}
                    </Card>
                  );
                })()}

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
                    {/* Inline model selector */}
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className="text-gray-600 text-[10px]">Model:</span>
                      <select
                        className="bg-gray-800 border border-gray-700 text-gray-300 text-[10px] rounded px-2 py-0.5 focus:outline-none focus:border-blue-500"
                        value={confirmationModel}
                        onChange={e => handleSetConfirmationModel(e.target.value)}
                      >
                        {visionModels.length > 0 ? visionModels.map((m: any) => (
                          <option key={m.id} value={m.id}>{m.name}</option>
                        )) : (
                          <>
                            <option value="gpt-4o">GPT-4o</option>
                            <option value="gpt-4o-mini">GPT-4o Mini</option>
                            <option value="meta-llama/llama-4-scout-17b-16e-instruct">Llama 4 Scout</option>
                          </>
                        )}
                      </select>
                      <span className="text-[10px] text-blue-400">✓ vision</span>
                    </div>
                  </div>
                </div>
                <FeatureToggle
                  checked={liveMode?.live || false}
                  onCheckedChange={(checked) => toggleLiveMutation.mutate(checked)}
                  activeColor="green" size="lg" showLabel activeLabel="LIVE" inactiveLabel="OFF"
                  disabled={toggleLiveMutation.isPending}
                />
              </div>

              {/* ── AI Thinking Panel (visible when LIVE) ──────── */}
              {liveMode?.live && (
                <div className="mt-4 pt-4 border-t border-emerald-500/20">
                  <p className="text-emerald-400 text-xs font-semibold uppercase tracking-wide mb-3 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse inline-block" />
                    What the AI is thinking right now
                  </p>

                  {/* Latest AI log entry expanded */}
                  {aiLogs && aiLogs.length > 0 ? (
                    <div className="space-y-3">
                      {/* Most recent decision */}
                      {(() => {
                        const latest = aiLogs[0];
                        const isApproved = latest?.decision === 'CONFIRMED' || latest?.decision === 'APPROVED' || latest?.decision === 'AI_OVERRIDE';
                        const isRejected = latest?.decision === 'REJECTED' || latest?.decision === 'BLOCKED';
                        return (
                          <div className={`rounded-xl p-3 border ${isApproved ? 'border-emerald-500/30 bg-emerald-900/20' : isRejected ? 'border-red-500/30 bg-red-900/20' : 'border-gray-700/50 bg-gray-800/40'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-bold text-sm">{latest.symbol}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${latest.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{latest.direction}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isApproved ? 'bg-emerald-500/20 text-emerald-300' : isRejected ? 'bg-red-500/20 text-red-300' : 'bg-gray-700 text-gray-400'}`}>{latest.decision}</span>
                                {/* Model indicator badge */}
                                {(latest.modelUsed || latest.providerUsed) && (
                                  <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" /></svg>
                                    {latest.modelUsed || latest.providerUsed?.toUpperCase()}
                                  </span>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-white font-bold text-sm">{latest.aiConfidence ?? latest.confidence ?? '—'}%</p>
                                <p className="text-gray-500 text-[10px]">AI confidence</p>
                              </div>
                            </div>

                            {/* Confluence grade + score */}
                            {(latest.confluenceGrade || latest.confluenceScore !== undefined) && (
                              <div className="flex items-center gap-3 mb-2">
                                {latest.confluenceGrade && (
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                    latest.confluenceGrade.startsWith('A') ? 'bg-emerald-500/20 text-emerald-400' :
                                    latest.confluenceGrade === 'B' ? 'bg-blue-500/20 text-blue-400' :
                                    'bg-gray-700 text-gray-400'
                                  }`}>Grade {latest.confluenceGrade}</span>
                                )}
                                {latest.confluenceScore !== undefined && (
                                  <span className="text-gray-400 text-xs">Score {latest.confluenceScore}/12</span>
                                )}
                                {latest.session && (
                                  <span className="text-gray-500 text-xs">{latest.session} session</span>
                                )}
                              </div>
                            )}

                            {/* AI reasoning */}
                            {latest.reasoning && (
                              <p className="text-gray-300 text-xs leading-relaxed bg-gray-900/50 rounded-lg p-2 mb-2">{latest.reasoning}</p>
                            )}

                            {/* Key factors */}
                            <div className="flex flex-wrap gap-1.5">
                              {latest.ictMacroValid !== undefined && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${latest.ictMacroValid ? 'bg-emerald-900/40 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>ICT Macro {latest.ictMacroValid ? '✓' : '✗'}</span>
                              )}
                              {latest.smcVerdict && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${latest.smcVerdict === 'CONFIRM' ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-800 text-gray-500'}`}>SMC {latest.smcVerdict}</span>
                              )}
                              {latest.adxValue && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">ADX {Math.round(latest.adxValue)}</span>
                              )}
                              {latest.rsiValue && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">RSI {Math.round(latest.rsiValue)}</span>
                              )}
                              {latest.htfAligned !== undefined && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded ${latest.htfAligned ? 'bg-emerald-900/40 text-emerald-400' : 'bg-gray-800 text-gray-500'}`}>HTF {latest.htfAligned ? 'Aligned ✓' : 'Diverging ✗'}</span>
                              )}
                            </div>
                          </div>
                        );
                      })()}

                      {/* Recent decisions feed */}
                      {aiLogs.length > 1 && (
                        <div>
                          <p className="text-gray-600 text-[10px] uppercase tracking-wide mb-1.5">Recent decisions</p>
                          <div className="space-y-1">
                            {aiLogs.slice(1, 5).map((log: any, i: number) => {
                              const approved = log.decision === 'CONFIRMED' || log.decision === 'APPROVED' || log.decision === 'AI_OVERRIDE';
                              const rejected = log.decision === 'REJECTED' || log.decision === 'BLOCKED';
                              return (
                                <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${approved ? 'bg-emerald-400' : rejected ? 'bg-red-400' : 'bg-gray-500'}`} />
                                    <span className="text-white font-medium">{log.symbol}</span>
                                    <span className={log.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{log.direction}</span>
                                    <span className="text-gray-500">{log.decision}</span>
                                  </div>
                                  <div className="flex items-center gap-2 text-gray-500">
                                    {log.confluenceGrade && <span className="font-bold text-gray-400">{log.confluenceGrade}</span>}
                                    <span>{log.aiConfidence ?? log.confidence ?? '—'}%</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="bg-gray-800/40 rounded-xl p-4 text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" style={{ animationDelay: '0.4s' }} />
                      </div>
                      <p className="text-gray-400 text-sm">AI is monitoring markets...</p>
                      <p className="text-gray-600 text-xs mt-1">Waiting for EA signals to evaluate. Decisions will appear here as trades are analysed.</p>
                    </div>
                  )}
                </div>
              )}
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
                        // Show "No Trading Day" card for skipped days
                        if (!dayPlan) {
                          return (
                            <div key={day} className="bg-gray-900/30 border border-gray-800 rounded-xl p-3 flex items-center gap-3 opacity-50">
                              <ChevronRight className="w-3.5 h-3.5 text-gray-600" />
                              <span className="text-gray-600 text-sm font-medium">{day}</span>
                              <span className="text-gray-700 text-xs">— No Trading Day</span>
                            </div>
                          );
                        }
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
                                    <span className="text-white font-medium flex items-center gap-1">
                                      {(pairDayAssignments[day] || []).includes(p.symbol) && <span title="Pinned to this day">📌</span>}
                                      {p.symbol}
                                    </span>
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

              {/* ── Account Balance (auto-detected) ────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-gray-300 text-sm">Account Balance ($)</Label>
                  {autoBalanceSource && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      ✓ Auto-detected from {autoBalanceSource}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    value={accountBalance}
                    onChange={e => { setAccountBalance(e.target.value); setAutoBalanceSource(null); }}
                    placeholder="e.g. 1000"
                    className="bg-gray-900 border-gray-700 text-white pr-20"
                  />
                  {autoBalanceSource && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-emerald-400">Live</span>
                  )}
                </div>
                {!autoBalanceSource && (
                  <p className="text-gray-600 text-xs mt-1">Connect MT5 or TradeLocker to auto-fill your live balance</p>
                )}
              </div>

              {/* ── Profit Target ($ or %) ──────────────────────── */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-gray-300 text-sm">Profit Target</Label>
                  <div className="flex bg-gray-800 rounded-lg p-0.5">
                    <button
                      onClick={() => {
                        setProfitMode('dollar');
                        if (profitPercent && accountBalance && parseFloat(accountBalance) > 0) {
                          setProfitTarget(String(Math.round(parseFloat(accountBalance) * parseFloat(profitPercent) / 100)));
                        }
                      }}
                      className={`text-xs px-3 py-1 rounded-md transition-all ${profitMode === 'dollar' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >$ Dollar</button>
                    <button
                      onClick={() => {
                        setProfitMode('percent');
                        if (profitTarget && accountBalance && parseFloat(accountBalance) > 0) {
                          setProfitPercent(String(Math.round(parseFloat(profitTarget) / parseFloat(accountBalance) * 100)));
                        }
                      }}
                      className={`text-xs px-3 py-1 rounded-md transition-all ${profitMode === 'percent' ? 'bg-orange-600 text-white' : 'text-gray-400 hover:text-white'}`}
                    >% Percent</button>
                  </div>
                </div>
                {profitMode === 'dollar' ? (
                  <Input
                    type="number"
                    value={profitTarget}
                    onChange={e => {
                      setProfitTarget(e.target.value);
                      if (accountBalance && parseFloat(accountBalance) > 0 && parseFloat(e.target.value) > 0) {
                        setProfitPercent(String(Math.round(parseFloat(e.target.value) / parseFloat(accountBalance) * 100)));
                      }
                    }}
                    placeholder="e.g. 200"
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                ) : (
                  <div className="relative">
                    <Input
                      type="number"
                      value={profitPercent}
                      onChange={e => {
                        setProfitPercent(e.target.value);
                        if (accountBalance && parseFloat(accountBalance) > 0 && parseFloat(e.target.value) > 0) {
                          setProfitTarget(String(Math.round(parseFloat(accountBalance) * parseFloat(e.target.value) / 100)));
                        }
                      }}
                      placeholder="e.g. 20"
                      className="bg-gray-900 border-gray-700 text-white pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">%</span>
                  </div>
                )}
                {profitMode === 'percent' && profitTarget && parseFloat(profitTarget) > 0 && (
                  <p className="text-orange-400 text-xs mt-1">= ${parseFloat(profitTarget).toFixed(2)} profit in dollar terms</p>
                )}
                {profitMode === 'dollar' && profitPercent && parseFloat(profitPercent) > 0 && (
                  <p className="text-orange-400 text-xs mt-1">= {parseFloat(profitPercent).toFixed(1)}% of your account</p>
                )}
              </div>

              {/* ── Goal Summary + Pip Value + Risk Warning ─────── */}
              {accountBalance && profitTarget && parseFloat(accountBalance) > 0 && parseFloat(profitTarget) > 0 && (() => {
                const bal = parseFloat(accountBalance);
                const target = parseFloat(profitTarget);
                const pct = (target / bal * 100).toFixed(1);
                const multiplier = ((bal + target) / bal).toFixed(2);

                // Pip value estimate (rough avg across common pairs)
                // XAUUSD: ~$1/pip per 0.01 lot → $10/pip per 0.1 lot
                // GBPUSD/EURUSD: ~$1/pip per 0.01 lot
                // Assume 0.01 lot base, 10 pips avg profit per trade
                const estLot = Math.max(0.01, bal * 0.01 / 100); // 1% risk sizing
                const pipValuePerLot = 10; // $10 per pip for standard 0.1 lot on most pairs
                const avgPipsPerTrade = 20;
                const estPipValue = estLot * pipValuePerLot;
                const tradesNeeded = Math.ceil(target / (avgPipsPerTrade * estPipValue));
                const pipsForGoal = Math.round(target / estPipValue);

                // Risk scenarios
                const risk1pct = bal * 0.01;
                const risk2pct = bal * 0.02;
                const drawdownWarning = parseFloat(pct) > 50;
                const drawdownCaution = parseFloat(pct) > 20;

                return (
                  <div className="space-y-3">
                    {/* Goal card */}
                    <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 rounded-xl p-4 border border-orange-500/20">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <p className="text-gray-400 text-xs mb-1">Goal</p>
                          <p className="text-white font-bold">${bal.toFixed(0)} → ${(bal + target).toFixed(0)}</p>
                          <p className="text-orange-400 text-xs">+{pct}%</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs mb-1">Multiplier</p>
                          <p className="text-orange-400 font-bold text-lg">{multiplier}x</p>
                        </div>
                        <div>
                          <p className="text-gray-400 text-xs mb-1">~Trades Needed</p>
                          <p className="text-white font-bold">{tradesNeeded}</p>
                          <p className="text-gray-500 text-xs">@ 20 pips avg</p>
                        </div>
                      </div>
                    </div>

                    {/* Pip value breakdown */}
                    <div className="bg-blue-900/20 border border-blue-500/20 rounded-xl p-3">
                      <p className="text-blue-300 text-xs font-semibold mb-2 flex items-center gap-1.5">📐 Pip Value Needed</p>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-gray-900/60 rounded-lg p-2">
                          <p className="text-gray-500">Total pips to goal</p>
                          <p className="text-white font-bold">{pipsForGoal} pips</p>
                          <p className="text-gray-600 text-[10px]">at {estLot} lot size</p>
                        </div>
                        <div className="bg-gray-900/60 rounded-lg p-2">
                          <p className="text-gray-500">Pip value</p>
                          <p className="text-white font-bold">${estPipValue.toFixed(2)}/pip</p>
                          <p className="text-gray-600 text-[10px]">at {estLot} lot</p>
                        </div>
                        <div className="bg-gray-900/60 rounded-lg p-2">
                          <p className="text-gray-500">Per-day target</p>
                          <p className="text-white font-bold">${(target / 5).toFixed(2)}</p>
                          <p className="text-gray-600 text-[10px]">spread over 5 days</p>
                        </div>
                        <div className="bg-gray-900/60 rounded-lg p-2">
                          <p className="text-gray-500">Pips/day needed</p>
                          <p className="text-white font-bold">{Math.round(pipsForGoal / 5)} pips</p>
                          <p className="text-gray-600 text-[10px]">across selected pairs</p>
                        </div>
                      </div>
                    </div>

                    {/* Risk warning */}
                    <div className={`rounded-xl p-3 border ${drawdownWarning ? 'bg-red-900/30 border-red-500/40' : drawdownCaution ? 'bg-amber-900/20 border-amber-500/30' : 'bg-gray-900/40 border-gray-700/40'}`}>
                      <p className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${drawdownWarning ? 'text-red-400' : drawdownCaution ? 'text-amber-400' : 'text-gray-400'}`}>
                        {drawdownWarning ? '⚠️ HIGH RISK WARNING' : drawdownCaution ? '⚠️ Moderate Risk' : '✓ Risk Overview'}
                      </p>
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div className="bg-gray-900/60 rounded-lg p-2 text-center">
                          <p className="text-gray-500 text-[10px] mb-0.5">1% Risk/Trade</p>
                          <p className="text-white font-medium">${risk1pct.toFixed(2)}</p>
                          <p className="text-gray-600 text-[10px]">max loss/trade</p>
                        </div>
                        <div className="bg-gray-900/60 rounded-lg p-2 text-center">
                          <p className="text-gray-500 text-[10px] mb-0.5">2% Risk/Trade</p>
                          <p className="text-amber-400 font-medium">${risk2pct.toFixed(2)}</p>
                          <p className="text-gray-600 text-[10px]">max loss/trade</p>
                        </div>
                        <div className="bg-gray-900/60 rounded-lg p-2 text-center">
                          <p className="text-gray-500 text-[10px] mb-0.5">5-Loss Streak</p>
                          <p className="text-red-400 font-medium">-${(risk2pct * 5).toFixed(2)}</p>
                          <p className="text-gray-600 text-[10px]">at 2% risk</p>
                        </div>
                      </div>
                      {drawdownWarning && (
                        <p className="text-red-300 text-[10px] mt-2 leading-relaxed">⚠️ A {pct}% target requires very aggressive trading. Losses can exceed this amount. Consider splitting into multiple weeks or using Prop Firm mode for discipline.</p>
                      )}
                      {drawdownCaution && !drawdownWarning && (
                        <p className="text-amber-300 text-[10px] mt-2 leading-relaxed">A {pct}% target is achievable but requires consistent execution. Use 1–2% risk per trade to protect capital on losing streaks.</p>
                      )}
                    </div>
                  </div>
                );
              })()}
              {/* ── Risk Level Selector ──────────────────────────── */}
              <div>
                <Label className="text-gray-300 text-sm mb-2 block">Risk Level</Label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'conservative', label: 'Conservative', icon: '🟢', sub: '0.5% risk/trade · 1.5% max loss', color: 'emerald' },
                    { id: 'moderate',     label: 'Moderate',     icon: '🟡', sub: '1–1.5% risk/trade · 2.5% max', color: 'amber' },
                    { id: 'aggressive',   label: 'Aggressive',   icon: '🔴', sub: '2–3% risk/trade · 5% max loss', color: 'red' },
                  ] as const).map(r => (
                    <button key={r.id} onClick={() => setRiskLevel(r.id)}
                      className={`text-left p-3 rounded-xl border transition-all ${
                        riskLevel === r.id
                          ? r.color === 'emerald' ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'
                          : r.color === 'amber'   ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                          : 'border-red-500 bg-red-500/10 text-red-300'
                          : 'border-gray-700 bg-gray-900/50 text-gray-400 hover:border-gray-500'
                      }`}>
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-base">{r.icon}</span>
                        <span className="font-semibold text-xs">{r.label}</span>
                      </div>
                      <p className="text-[9px] text-gray-500 leading-tight">{r.sub}</p>
                    </button>
                  ))}
                </div>
                {riskLevel === 'aggressive' && (
                  <div className="mt-2 p-2 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-xs flex items-start gap-2">
                    <span className="mt-0.5">⚠️</span>
                    <span>Aggressive mode compounds losses quickly — only suitable for funded or experienced accounts. Ensure you can absorb a 5% single-day drawdown.</span>
                  </div>
                )}
              </div>

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
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-gray-300 text-sm">Select Pairs <span className="text-gray-500 font-normal">(pick 1 or more — all optional)</span></Label>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${selectedPairs.length > 0 ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-800 text-gray-500'}`}>
                    {selectedPairs.length} selected
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {POPULAR_PAIRS.map(pair => (
                    <Badge key={pair} className={`cursor-pointer text-xs transition-all select-none ${selectedPairs.includes(pair) ? 'bg-orange-500/30 text-orange-300 border-orange-500/50' : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500'}`}
                      onClick={() => togglePair(pair)}>
                      {selectedPairs.includes(pair) && <CheckCircle className="w-2.5 h-2.5 mr-1" />}{pair}
                    </Badge>
                  ))}
                </div>
                {selectedPairs.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {selectedPairs.map(p => (
                      <span key={p} className="inline-flex items-center gap-1 text-xs bg-orange-900/30 text-orange-300 border border-orange-500/30 rounded-md px-2 py-0.5">
                        {p}
                        <button onClick={() => togglePair(p)} className="text-orange-500 hover:text-orange-200 ml-0.5">×</button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 mt-2">
                  <Input value={pairInput} onChange={e => setPairInput(e.target.value)} placeholder="Add custom pair (e.g. BTCUSD)..."
                    className="bg-gray-900 border-gray-700 text-white flex-1 text-sm" onKeyDown={e => e.key === 'Enter' && addCustomPair()} />
                  <Button variant="outline" size="sm" onClick={addCustomPair}>Add</Button>
                </div>
                <p className="text-gray-600 text-xs mt-1">The AI will generate a daily plan for each selected pair. You can add any pair your broker supports.</p>
              </div>
              {/* ── Trading Schedule ────────────────────────────── */}
              <div>
                <Label className="text-gray-300 text-sm mb-2 block">Trading Schedule <span className="text-gray-500 font-normal">(tap to toggle days off)</span></Label>
                <div className="flex gap-2 flex-wrap">
                  {(['Monday','Tuesday','Wednesday','Thursday','Friday'] as const).map(day => {
                    const active = tradingDays.includes(day);
                    return (
                      <button key={day} onClick={() => setTradingDays(prev =>
                        prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
                      )}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                          active ? 'bg-orange-500/20 border-orange-500/50 text-orange-300' : 'bg-gray-900/60 border-gray-700 text-gray-600 line-through'
                        }`}>
                        {day.slice(0,3)}
                      </button>
                    );
                  })}
                </div>
                {tradingDays.length < 5 && (
                  <p className="text-gray-500 text-xs mt-1.5">
                    {5 - tradingDays.length} day{5 - tradingDays.length > 1 ? 's' : ''} skipped — AI won't generate trades for those days.
                  </p>
                )}

                {/* Pin pairs to specific days — optional advanced section */}
                <button
                  onClick={() => setShowPinPairs(p => !p)}
                  className="mt-3 flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                >
                  <span className="text-base">{showPinPairs ? '▾' : '▸'}</span>
                  Advanced: Pin pairs to specific days (optional)
                </button>

                {showPinPairs && tradingDays.length > 0 && selectedPairs.length > 0 && (
                  <div className="mt-3 grid gap-3" style={{ gridTemplateColumns: `repeat(${tradingDays.length}, minmax(0, 1fr))` }}>
                    {tradingDays.map(day => (
                      <div key={day} className="bg-gray-900/60 border border-gray-700 rounded-xl p-2">
                        <p className="text-gray-400 text-[10px] font-semibold mb-2 text-center">{day.slice(0,3)}</p>
                        <div className="flex flex-col gap-1">
                          {selectedPairs.map(pair => {
                            const pinned = (pairDayAssignments[day] || []).includes(pair);
                            return (
                              <button key={pair} onClick={() => {
                                setPairDayAssignments(prev => {
                                  const current = prev[day] || [];
                                  const updated = pinned ? current.filter(p => p !== pair) : [...current, pair];
                                  return { ...prev, [day]: updated };
                                });
                              }}
                                className={`text-[9px] px-1.5 py-1 rounded-md border text-left transition-all flex items-center gap-1 ${
                                  pinned ? 'bg-orange-500/20 border-orange-500/40 text-orange-300' : 'border-gray-700 text-gray-500 hover:border-gray-500'
                                }`}>
                                {pinned && <span>📌</span>}{pair}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {showPinPairs && Object.values(pairDayAssignments).some(v => v.length > 0) && (
                  <p className="text-orange-400 text-xs mt-2">📌 Pinned pairs will only trade on their assigned days. Leave blank to let AI decide.</p>
                )}
              </div>

              {/* ── AI Engine Intelligence Toggles ─────────────── */}
              <div className="rounded-xl border border-gray-700 bg-gray-900/50 p-4 space-y-3">
                <p className="text-gray-300 text-sm font-semibold flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" /> AI Engine Intelligence Options
                </p>

                {/* Smart Pair Escalation */}
                <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-800/60 border border-gray-700/50">
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">Smart Pair Escalation</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      AI uses Brain win-rate data to rank your pairs by accuracy. Starts with highest-accuracy pairs and unlocks more mid-week only if the account is growing and accuracy holds. Automatically tightens back down if a losing streak hits.
                    </p>
                    {smartEscalation && (
                      <p className="text-purple-400 text-xs mt-1 font-medium">✓ Active — Brain data will rank and gate your pairs each day</p>
                    )}
                  </div>
                  <button
                    onClick={() => setSmartEscalation(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${smartEscalation ? 'bg-purple-600' : 'bg-gray-600'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${smartEscalation ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                {/* High Confidence Override */}
                <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-gray-800/60 border border-gray-700/50">
                  <div className="flex-1">
                    <p className="text-white text-sm font-medium">High Confidence Override <span className="text-amber-400 text-xs font-normal ml-1">(85%+ EA &amp; AI)</span></p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      When BOTH the EA signal confidence AND the AI second-opinion confidence reach 85% or above, that trade is allowed to fire from <strong className="text-white">any pair in your full pool</strong> — even if it's not today's assigned pair. Only the highest-conviction setups get through.
                    </p>
                    {highConfidenceOverride && (
                      <p className="text-amber-400 text-xs mt-1 font-medium">✓ Active — 85%+ dual-confirmation trades will fire from any pair</p>
                    )}
                  </div>
                  <button
                    onClick={() => setHighConfidenceOverride(v => !v)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${highConfidenceOverride ? 'bg-amber-500' : 'bg-gray-600'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${highConfidenceOverride ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              <Button className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold py-5 text-base"
                onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || selectedPairs.length === 0 || tradingDays.length === 0}>
                {generateMutation.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> AI Building Plan...</> : <><Rocket className="w-4 h-4 mr-2" /> Generate Growth Strategy</>}
              </Button>
              {tradingDays.length === 0 && (
                <p className="text-red-400 text-xs text-center -mt-3">Select at least 1 trading day</p>
              )}
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
            MT5 EA FULL SETUP GUIDE
        ═══════════════════════════════════════════════════════ */}
        <Card className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-cyan-500/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Settings className="w-4 h-4 text-cyan-400" /> MT5 EA Setup Guide
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Required for Auto-Trading</Badge>
            </CardTitle>
            <CardDescription className="text-gray-400 text-xs">
              Two EAs work together to power the VEDD AI Live Engine. Both must be running at the same time.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* How they work together */}
            <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20 text-xs text-gray-300 leading-relaxed">
              <p className="text-cyan-400 font-semibold mb-1 flex items-center gap-1.5"><Activity className="w-3.5 h-3.5" /> How the two EAs work together</p>
              <p>The <span className="text-cyan-300 font-medium">Chart Data EA</span> feeds live market data to the AI. The <span className="text-purple-300 font-medium">Signal Receiver EA</span> picks up the AI's trade decisions and executes them on your broker. Neither can do the full job alone — both must stay running simultaneously.</p>
              <div className="mt-2 flex items-center gap-2 text-gray-400 text-[11px] flex-wrap">
                <span className="px-2 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">Chart Data EA</span>
                <span>→ sends candles + open positions to AI</span>
                <span>→</span>
                <span className="px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">VEDD AI analyzes</span>
                <span>→</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Signal Receiver EA</span>
                <span>→ executes on MT5</span>
              </div>
            </div>

            {/* EA 1 — Chart Data EA */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-cyan-500/20 border border-cyan-500/40 text-cyan-400 text-[11px] font-bold flex items-center justify-center">1</span>
                <p className="text-sm font-semibold text-cyan-300">Chart Data EA — one per pair you want traded</p>
              </div>
              <div className="ml-7 space-y-2 text-xs text-gray-300">
                <p className="text-gray-400">Attach this to a chart for <span className="text-white font-medium">each pair</span> the engine should trade. If you want to trade XAUUSD, EURUSD, and GBPUSD — you need three charts, each with the Chart Data EA running on it.</p>
                <div className="bg-gray-900/60 rounded-lg p-3 space-y-1 border border-gray-700/50">
                  <p className="text-gray-400 font-medium mb-1.5">Setup steps:</p>
                  <p>1. Go to <span className="text-cyan-400 font-medium">MT5 Chart Data</span> page (top menu) to download the Chart Data EA</p>
                  <p>2. Copy the file to: <span className="text-white font-mono text-[11px]">MT5 → File → Open Data Folder → MQL5 → Experts</span></p>
                  <p>3. Restart MT5, then open a chart for each pair you want to trade</p>
                  <p>4. Drag the Chart Data EA onto each chart, enter your Server URL and API Key</p>
                  <p>5. Enable <span className="text-cyan-400">Allow WebRequest</span> in MT5 Options → Expert Advisors</p>
                </div>
                <div className="flex items-start gap-1.5 text-amber-300 bg-amber-500/5 border border-amber-500/20 rounded-lg p-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  <p>Example: Trading 5 pairs = 5 separate charts, each with the Chart Data EA attached and running</p>
                </div>
              </div>
            </div>

            {/* EA 2 — Signal Receiver EA */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-purple-500/20 border border-purple-500/40 text-purple-400 text-[11px] font-bold flex items-center justify-center">2</span>
                <p className="text-sm font-semibold text-purple-300">Signal Receiver EA — just one, on any chart</p>
              </div>
              <div className="ml-7 space-y-2 text-xs text-gray-300">
                <p className="text-gray-400">This EA only needs to be on <span className="text-white font-medium">one chart</span> — it doesn't matter which pair. It polls the VEDD AI every 5 seconds and executes signals across all your pairs automatically. Most users attach it to an EURUSD M1 chart.</p>
                <div className="bg-gray-900/60 rounded-lg p-3 space-y-1 border border-gray-700/50">
                  <p className="text-gray-400 font-medium mb-1.5">Setup steps:</p>
                  <p>1. Download the EA using the button below</p>
                  <p>2. Copy to: <span className="text-white font-mono text-[11px]">MT5 → File → Open Data Folder → MQL5 → Experts</span></p>
                  <p>3. Restart MT5, open any chart (e.g. EURUSD M1)</p>
                  <p>4. Drag the Signal Receiver EA onto that chart</p>
                  <p>5. Enter your <span className="text-purple-400 font-medium">Server URL</span> (your .replit.app URL) and <span className="text-purple-400 font-medium">API Key</span> from the MT5 API Token section below</p>
                  <p>6. Enable <span className="text-cyan-400">Allow WebRequest</span> if not already done</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-1">
                  <a
                    href="/downloads/VEDD_Signal_Receiver_EA.mq5"
                    download="VEDD_Signal_Receiver_EA.mq5"
                    className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-bold text-xs shadow-lg shadow-purple-500/20 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Signal Receiver EA
                  </a>
                  <Link href="/mt5-chart-data">
                    <Button variant="outline" size="sm" className="text-xs border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/10 w-full sm:w-auto">
                      <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Get Chart Data EA
                    </Button>
                  </Link>
                </div>
              </div>
            </div>

            {/* Summary table */}
            <div className="rounded-xl border border-gray-700/50 overflow-hidden text-xs">
              <div className="bg-gray-900/80 px-3 py-2 text-gray-400 font-medium border-b border-gray-700/50">Quick Reference</div>
              <div className="divide-y divide-gray-700/30">
                <div className="grid grid-cols-3 px-3 py-2 text-gray-500 text-[11px] font-medium bg-gray-900/40">
                  <span>EA</span><span>How many</span><span>Which chart</span>
                </div>
                <div className="grid grid-cols-3 px-3 py-2 items-center">
                  <span className="text-cyan-400 font-medium">Chart Data EA</span>
                  <span className="text-white">One per pair</span>
                  <span className="text-gray-400">Each pair's chart</span>
                </div>
                <div className="grid grid-cols-3 px-3 py-2 items-center">
                  <span className="text-purple-400 font-medium">Signal Receiver EA</span>
                  <span className="text-white">Just one</span>
                  <span className="text-gray-400">Any chart (e.g. EURUSD M1)</span>
                </div>
              </div>
            </div>

            {/* Critical warning */}
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-red-300 space-y-1">
                <p className="font-bold">Keep both EAs running at all times</p>
                <p>If the Chart Data EA goes offline, the AI has no market data and stops generating signals. If the Signal Receiver EA goes offline, signals queue up on the server but never reach your broker. If your MT5 terminal closes, open positions stay on the broker but the AI cannot manage or close them.</p>
              </div>
            </div>

          </CardContent>
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

          </>
        )}

        {/* ─── Tab: AI Config ──────────────────────────────── */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-bold text-lg mb-1 flex items-center gap-2">⚙️ AI Signal Configuration</h2>
              <p className="text-gray-400 text-sm mb-6">Your ICT/SMC grade requirements and breakout thresholds automatically tighten as your account grows — protecting gains as the balance increases.</p>

              {/* Account-tier display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">Current Account Tier</p>
                  <p className="text-white font-bold text-xl">Growth Phase</p>
                  <p className="text-gray-500 text-xs mt-1">ICT minimum grade: B+ · Account $1k–$5k</p>
                </div>
                <div className="bg-gray-800/60 rounded-xl p-4 border border-gray-700">
                  <p className="text-gray-400 text-xs mb-1">Breakout Mode</p>
                  <p className="text-white font-bold text-xl">Grade B/C Allowed</p>
                  <p className="text-gray-500 text-xs mt-1">Grade C permitted during London/NY sessions with 2+ strategy votes</p>
                </div>
              </div>

              {/* Tier progression */}
              <div className="mb-6">
                <p className="text-sm text-gray-300 font-medium mb-3">Strictness Progression (auto)</p>
                <div className="space-y-2">
                  {[
                    { range: '< $1,000', phase: 'Learning Phase', grade: 'C+', color: 'emerald', note: 'Looser — maximise learning data' },
                    { range: '$1k – $5k', phase: 'Growth Phase', grade: 'B+', color: 'blue', note: 'Standard ICT/SMC thresholds' },
                    { range: '$5k – $20k', phase: 'Protection Phase', grade: 'A', color: 'amber', note: 'Tighter — protecting gains' },
                    { range: '$20k+', phase: 'Capital Preservation', grade: 'A+', color: 'red', note: 'Strictest — capital comes first' },
                  ].map((tier, i) => (
                    <div key={i} className="flex items-center gap-3 bg-gray-800/40 rounded-lg px-3 py-2.5">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded bg-${tier.color}-500/20 text-${tier.color}-400 min-w-[28px] text-center`}>{tier.grade}</span>
                      <div className="flex-1">
                        <span className="text-white text-sm font-medium">{tier.phase}</span>
                        <span className="text-gray-500 text-xs ml-2">{tier.range}</span>
                      </div>
                      <span className="text-gray-500 text-xs hidden md:block">{tier.note}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Strategy injection info */}
              <div className="bg-gradient-to-r from-blue-900/30 to-indigo-900/20 border border-blue-500/20 rounded-xl p-4">
                <p className="text-white font-semibold text-sm mb-2">📚 2nd Confirmation Strategy Library</p>
                <p className="text-gray-400 text-xs mb-3">The 2nd confirmation AI now evaluates every trade against 8 proven profitable strategies plus your own historical winning patterns from the brain.</p>
                <div className="flex flex-wrap gap-2">
                  {['ICT AMD Kill Zone','SMC OB Raid','VWAP Bounce','Breaker Block','FVG Fill','Overlap Momentum','PDH/PDL Sweep','ICT Macro HTF'].map(s => (
                    <span key={s} className="text-xs bg-blue-900/40 text-blue-300 border border-blue-700/40 rounded-md px-2 py-1">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Tab: Brain Dashboard ────────────────────────── */}
        {activeTab === 'brain' && (
          <div className="space-y-6">
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-bold text-lg mb-1 flex items-center gap-2">🧠 Brain Dashboard</h2>
              <p className="text-gray-400 text-sm mb-6">Your AI brain learns from every trade across all sources. The more trades it sees, the more accurately it calibrates the 2nd confirmation AI.</p>

              {brainLoading ? (
                <div className="text-center py-12 text-gray-500">Loading brain data...</div>
              ) : !brainSummary?.length ? (
                <div className="text-center py-12">
                  <p className="text-gray-400 mb-2">No brain data yet</p>
                  <p className="text-gray-500 text-sm">The brain needs completed trades to learn from. Take some trades with the EA, breakout mode, or 2nd confirmation enabled.</p>
                </div>
              ) : (
                <>
                  {/* Source breakdown */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
                    {(['ai_confirmation','breakout','ea_only','manual_mt5'] as const).map(src => {
                      const srcData = brainSummary.filter((r: any) => r.tradeSource === src);
                      const total = srcData.reduce((a: number, b: any) => a + b.tradeCount, 0);
                      const wins = srcData.reduce((a: number, b: any) => a + (b.wins || Math.round(b.tradeCount * b.winRate / 100)), 0);
                      const wr = total > 0 ? Math.round((wins/total)*100) : 0;
                      const label = src === 'ai_confirmation' ? '2nd Confirm' : src === 'breakout' ? 'Breakout' : src === 'ea_only' ? 'EA Only' : 'Manual';
                      return (
                        <div key={src} className="bg-gray-800/60 rounded-xl p-3 border border-gray-700 text-center">
                          <p className="text-2xl font-bold text-white">{total}</p>
                          <p className="text-xs text-gray-400 mb-1">{label} Trades</p>
                          <p className={`text-sm font-semibold ${wr >= 60 ? 'text-emerald-400' : wr >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{wr}% WR</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Top winning setups table */}
                  <div>
                    <p className="text-sm text-gray-300 font-medium mb-3">Top Performing Setups (last 30 days)</p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-gray-500 text-xs border-b border-gray-800">
                            <th className="text-left pb-2">Symbol</th>
                            <th className="text-left pb-2">Source</th>
                            <th className="text-left pb-2">Grade</th>
                            <th className="text-right pb-2">Trades</th>
                            <th className="text-right pb-2">Win Rate</th>
                            <th className="text-right pb-2">Avg Pips</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800/50">
                          {brainSummary.slice(0, 15).map((row: any, i: number) => (
                            <tr key={i} className="text-gray-300">
                              <td className="py-2 font-medium text-white">{row.symbol}</td>
                              <td className="py-2">
                                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">
                                  {row.tradeSource === 'ai_confirmation' ? 'AI' : row.tradeSource === 'breakout' ? '🔥 Breakout' : row.tradeSource === 'ea_only' ? 'EA' : 'Manual'}
                                </span>
                              </td>
                              <td className="py-2">
                                <span className={`text-xs font-bold ${row.confluenceGrade?.startsWith('A') ? 'text-emerald-400' : row.confluenceGrade === 'B' ? 'text-blue-400' : 'text-gray-400'}`}>{row.confluenceGrade ?? 'N/A'}</span>
                              </td>
                              <td className="py-2 text-right">{row.tradeCount}</td>
                              <td className={`py-2 text-right font-medium ${row.winRate >= 60 ? 'text-emerald-400' : row.winRate >= 45 ? 'text-amber-400' : 'text-red-400'}`}>{row.winRate}%</td>
                              <td className={`py-2 text-right ${row.avgPips > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{row.avgPips > 0 ? '+' : ''}{row.avgPips}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ─── Tab: Live Engine ────────────────────────────── */}
        {activeTab === 'engine' && (
          <div className="space-y-4">
            <div className="bg-amber-900/20 border border-amber-500/30 rounded-xl p-4 mb-4">
              <p className="text-amber-300 text-sm font-medium">💡 The Live Engine tab has moved here from the separate page. All your engine settings are connected to your weekly plan — profit target and pairs are pre-filled from Step 1.</p>
              <a href="/live-monitor" className="text-amber-400 underline text-xs mt-1 inline-block">→ Still accessible at the dedicated Live Monitor page</a>
            </div>
            {/* Re-embed engine controls from the existing content on this page by re-using the same engine start/stop JSX */}
            {/* Find in the existing JSX the section that has the "Start VEDD AI Live Engine" button and engine config fields */}
            {/* Move or duplicate that section here */}
            <p className="text-gray-400 text-center py-8 text-sm">Engine controls are available below in the Weekly Plan tab. Use <strong>Tab 1 (Weekly Plan)</strong> → scroll down to the engine section, or visit the <a href="/live-monitor" className="text-red-400 underline">Live Monitor page</a> for real-time activity feed.</p>
          </div>
        )}

        {/* ─── Tab: Session Monitor ────────────────────────── */}
        {activeTab === 'monitor' && (
          <div className="space-y-4">
            {/* Import and embed WeeklyProgressWidget here */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-6">
              <h2 className="text-white font-bold text-lg mb-4 flex items-center gap-2">📊 Session Monitor</h2>
              <p className="text-gray-400 text-sm mb-6">Live progress toward your weekly plan. All stats auto-refresh every 60 seconds.</p>
              {/* Inline progress display */}
              {strategy && (
                <div className="space-y-4">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-400">Weekly Profit Progress</span>
                    <span className="text-white font-bold">{strategy.progressPercentage ?? 0}%</span>
                  </div>
                  <div className="h-4 bg-gray-800 rounded-full overflow-hidden mb-4">
                    <div className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-red-600 to-rose-400"
                      style={{ width: `${Math.min(100, strategy.progressPercentage ?? 0)}%` }} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-800/60 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-white">{strategy.progressTrades ?? 0}</p>
                      <p className="text-xs text-gray-400 mt-1">Total Trades</p>
                    </div>
                    <div className="bg-gray-800/60 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-emerald-400">{strategy.progressWinRate ?? 0}%</p>
                      <p className="text-xs text-gray-400 mt-1">Win Rate</p>
                    </div>
                    <div className="bg-gray-800/60 rounded-xl p-4 text-center">
                      <p className="text-2xl font-bold text-amber-400">${(strategy.currentProfit ?? 0).toFixed(2)}</p>
                      <p className="text-xs text-gray-400 mt-1">vs ${strategy.profitTarget?.toFixed(2)} target</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-800 text-center">
                    <a href="/live-monitor" className="text-red-400 underline text-sm">→ Open full Live Monitor for real-time trade feed</a>
                  </div>
                </div>
              )}
            </div>
          </div>
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
