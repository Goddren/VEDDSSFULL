import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity, TrendingUp, TrendingDown, Play, Square,
  RefreshCw, Zap, AlertCircle, AlertTriangle, CheckCircle2, Clock,
  BarChart3, Brain, Swords, Settings2, Radar,
  Wifi, Trash2, ChevronDown, ChevronUp, Info, ShieldCheck, Layers,
} from "lucide-react";

const DEFAULT_SYMBOLS = ["NQ", "ES", "YM", "GC", "CL", "MNQ", "MES"];

const PROP_FIRM_NAMES: Record<string, string> = {
  TOPSTEP: 'Topstep',
  APEX: 'Apex Trader Funding',
  BULENOX: 'Bulenox',
  EARN2TRADE: 'Earn2Trade',
  TAKEPROFITTRADER: 'Take Profit Trader',
};

const ACCOUNT_SIZES = [10000, 25000, 50000, 100000, 150000, 250000, 300000];

function directionColor(dir: string) {
  if (dir === "BUY" || dir === "LONG") return "text-green-400";
  if (dir === "SELL" || dir === "SHORT") return "text-red-400";
  return "text-gray-400";
}

function confidenceBadge(confidence: number) {
  if (confidence >= 80) return "bg-green-600 text-white";
  if (confidence >= 65) return "bg-yellow-600 text-white";
  return "bg-gray-600 text-white";
}

function activityIcon(type: string) {
  if (type === "signal") return <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  if (type === "error") return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (type === "scan") return <RefreshCw className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  if (type === "trade_open") return <Activity className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
}

function timeAgo(ts: string | number) {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

type FuturesEngineConfig = {
  id: number;
  isActive: boolean;
  symbols: string[];
  scanIntervalMs: number;
  minConfidence: number;
  maxOpenTrades: number;
  riskPerTrade: number;
  accountBalance: number;
  aiMode: 'full' | 'economy' | 'rule_based';
  directionFilter: 'long_only' | 'short_only' | 'both';
  dailyLossLimit: number;
  dailyProfitTarget: number;
  maxDailyTrades: number;
  propFirmMode: boolean;
  propFirmDailyDrawdownLimit: number;
  enableAutoExecution: boolean;
  useKellyCriterion: boolean;
  brainLearningMode: boolean;
  drawdownShieldThreshold: number;
  trailMethod: string;
  trailActivationR: number;
  trailFixedR: number;
  consistencyEnforcementEnabled: boolean;
  consistencyMinProfitableDays: number;
  consistencyPeriodDays: number;
  maxDailyProfitPctOfTotal: number;
  smartSymbolEscalation: boolean;
  highConfidenceOverride: boolean;
  enableCompositeAutonomous: boolean;
  compositeMinEdgeScore: number;
};

type BrainStatus = {
  learned: boolean;
  totalTradesAnalyzed?: number;
  overallWinRate?: number;
  totalProfit?: number;
  symbolsLearned?: number;
  symbolKnowledge?: Record<string, {
    totalTrades: number; winRate: number; riskRewardRatio: number;
    preferredDirection: 'long' | 'short' | 'both'; bestStrategies: string[];
  }>;
  learningInsights?: string[];
};

type BrainSummary = {
  sourceBreakdown: { strategy: string; trades: number; winRate: number }[];
  topSetups: { symbol: string; strategy: string; trades: number; winRate: number; avgR: number }[];
  totalClosedLast30d: number;
};

type ConsensusEntry = {
  symbol: string; strategy: string;
  quantVerdict: 'CONFIRM' | 'WATCH' | 'SKIP'; quantScore: number;
  aiVerdict: 'CONFIRM' | 'SKIP'; aiConfidence: number;
  consensus: 'STRONG_CONFIRM' | 'STRONG_SKIP' | 'CAUTION' | 'WATCH';
  tradeAllowed: boolean; timestamp: string;
};

type ConsensusData = {
  consensus: ConsensusEntry[];
  summary: { strongConfirm: number; strongSkip: number; caution: number; watch: number };
  updatedAt: string | null;
};

export default function FuturesEnginePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // ── Broker connection (Tradovate) ─────────────────────────────────────────
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<'demo' | 'live'>('demo');
  const [propFirmPreset, setPropFirmPreset] = useState('TOPSTEP');
  const [propFirmAccountSize, setPropFirmAccountSize] = useState(50000);
  const [showRulesTable, setShowRulesTable] = useState(false);
  const [calcSymbol, setCalcSymbol] = useState('NQ');
  const [calcRisk, setCalcRisk] = useState('1');
  const [calcEntry, setCalcEntry] = useState('');
  const [calcSL, setCalcSL] = useState('');
  const [calcResult, setCalcResult] = useState<any>(null);

  const { data: apiStatus } = useQuery<{ configured: boolean; message: string }>({
    queryKey: ['/api/tradovate/api-status'],
  });
  const { data: connection, isLoading: connLoading } = useQuery<any>({
    queryKey: ['/api/tradovate/connection'],
  });
  const { data: accountData, refetch: refetchAccount } = useQuery<any>({
    queryKey: ['/api/tradovate/account'],
    enabled: !!connection?.connected,
    refetchInterval: 30000,
  });
  const { data: positions } = useQuery<any>({
    queryKey: ['/api/tradovate/positions'],
    enabled: !!connection?.connected,
    refetchInterval: 10000,
  });
  const { data: instrumentsData } = useQuery<any>({
    queryKey: ['/api/futures/instruments'],
  });
  const { data: presetsData } = useQuery<any>({
    queryKey: ['/api/futures/prop-firm-presets'],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/tradovate/connection', {
        username, password, accountType, propFirmPreset, propFirmAccountSize,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tradovate/connection'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tradovate/account'] });
      toast({ title: "Tradovate Connected", description: "Futures account connected successfully" });
      setPassword('');
    },
    onError: (err: any) => {
      let msg = err.message || 'Connection failed';
      try {
        const jsonStart = msg.indexOf('{');
        if (jsonStart !== -1) {
          const parsed = JSON.parse(msg.slice(jsonStart));
          msg = parsed.error || msg;
        }
      } catch {}
      toast({ title: "Connection Failed", description: msg, variant: "destructive" });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/tradovate/connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tradovate/connection'] });
      toast({ title: "Disconnected", description: "Tradovate connection removed" });
    },
  });

  const calcContractSize = async () => {
    if (!calcEntry || !calcSL) return;
    const res = await apiRequest('POST', '/api/futures/contract-size', {
      symbol: calcSymbol,
      accountBalance: accountData?.account?.balance || 50000,
      riskPercent: parseFloat(calcRisk),
      entryPrice: parseFloat(calcEntry),
      stopLossPrice: parseFloat(calcSL),
    });
    setCalcResult(await res.json());
  };

  const dd = accountData?.drawdownStatus;
  const account = accountData?.account;
  const selectedPreset = presetsData?.presets?.find((p: any) => p.id === propFirmPreset);
  const selectedRulesRow = selectedPreset?.rulesTable?.find((r: any) => r.accountSize === propFirmAccountSize);

  const verdictColor: Record<string, string> = {
    SAFE: 'text-emerald-400', WARNING: 'text-amber-400', DANGER: 'text-red-400', BREACHED: 'text-red-500',
  };
  const verdictBg: Record<string, string> = {
    SAFE: 'border-emerald-500/30 bg-emerald-900/20', WARNING: 'border-amber-500/30 bg-amber-900/20',
    DANGER: 'border-red-500/30 bg-red-900/20', BREACHED: 'border-red-600/50 bg-red-900/30',
  };

  // ── Engine (scanner) ───────────────────────────────────────────────────────
  const { data: config, isLoading: configLoading } = useQuery<FuturesEngineConfig>({
    queryKey: ["/api/futures-engine/config"],
  });

  const [form, setForm] = useState<Partial<FuturesEngineConfig>>({});
  useEffect(() => { if (config) setForm(config); }, [config?.id]);

  const { data: status, isLoading: statusLoading } = useQuery<any>({
    queryKey: ["/api/tradovate/scanner/status"],
    refetchInterval: 5000,
  });
  const { data: signalsData } = useQuery<any>({
    queryKey: ["/api/tradovate/scanner/signals"],
    refetchInterval: 5000,
  });
  const { data: activitiesData } = useQuery<any>({
    queryKey: ["/api/tradovate/scanner/activities"],
    refetchInterval: 5000,
  });
  const { data: brainStatus, isLoading: brainLoading } = useQuery<BrainStatus>({
    queryKey: ["/api/futures-brain/status"],
    refetchInterval: 60000,
  });
  const { data: brainSummary, isLoading: brainSummaryLoading } = useQuery<BrainSummary>({
    queryKey: ["/api/futures-brain/summary"],
    refetchInterval: 120000,
  });
  const { data: consensusData, isLoading: consensusLoading } = useQuery<ConsensusData>({
    queryKey: ["/api/futures-engine/consensus"],
    refetchInterval: 15000,
  });

  const learnMutation = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/futures-brain/learn")).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/futures-brain/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/futures-brain/summary"] });
      toast({ title: "Brain updated", description: "Re-learned from the latest trade history." });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data: Partial<FuturesEngineConfig>) => (await apiRequest("PATCH", "/api/futures-engine/config", data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/futures-engine/config"] });
      toast({ title: "Settings saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tradovate/scanner/start", form);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tradovate/scanner/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/futures-engine/config"] });
      toast({ title: "Futures Scanner Started", description: "AI is now scanning the markets" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tradovate/scanner/stop", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tradovate/scanner/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/futures-engine/config"] });
      toast({ title: "Scanner Stopped" });
    },
  });

  const isRunning = status?.running === true;
  const signals: any[] = signalsData?.signals || [];
  const activities: any[] = activitiesData?.activities || [];
  const symPerf: Record<string, any> = status?.symbolPerformance || {};

  const set = (key: keyof FuturesEngineConfig, value: any) => setForm(f => ({ ...f, [key]: value }));

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Futures AI Engine
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Connect Tradovate (TOPSTEP, Apex, Bulenox & more), configure the AI scanner, then trade — paper (demo) or live.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isRunning ? "bg-green-900/50 text-green-400 border border-green-700" : "bg-gray-800 text-gray-400 border border-gray-700"}`}>
            <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            {isRunning ? "Live Scanning" : "Scanner Off"}
          </div>
          {isRunning ? (
            <Button variant="destructive" size="sm" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
              <Square className="w-4 h-4 mr-2" /> Stop
            </Button>
          ) : (
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700" onClick={() => startMutation.mutate()} disabled={startMutation.isPending || statusLoading || !connection?.connected}>
              <Play className="w-4 h-4 mr-2" /> Start Scanner
            </Button>
          )}
        </div>
      </div>

      {!connection?.connected && !connLoading && (
        <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80">Connect a Tradovate account below before starting the scanner.</p>
        </div>
      )}

      {status?.dailyLossHalted && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Daily loss limit or drawdown rule reached — scanner halted for today to protect your account.
        </div>
      )}

      <Tabs defaultValue="setup" className="w-full">
        <TabsList className="grid grid-cols-4 mb-6">
          <TabsTrigger value="setup" className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Setup & Config</TabsTrigger>
          <TabsTrigger value="brain" className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Brain</TabsTrigger>
          <TabsTrigger value="consensus" className="flex items-center gap-1.5"><Swords className="w-3.5 h-3.5" /> Consensus</TabsTrigger>
          <TabsTrigger value="feed" className="flex items-center gap-1.5"><Radar className="w-3.5 h-3.5" /> Live Feed</TabsTrigger>
        </TabsList>

        {/* ── Setup & Config ── */}
        <TabsContent value="setup" className="mt-0 space-y-4">

          {/* ── Broker connection ── */}
          {!connection?.connected ? (
            <Card className="bg-gray-900/60 border-gray-700">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Wifi className="h-5 w-5 text-blue-400" /> Connect Tradovate Account
                </CardTitle>
                <CardDescription className="text-gray-400">
                  Demo accounts are free on tradovate.com — perfect for prop firm challenges or just testing strategies risk-free.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {apiStatus && !apiStatus.configured ? (
                  <div className="p-3 rounded-lg bg-amber-900/20 border border-amber-500/30 text-xs text-amber-300">
                    <span className="font-semibold">⏳ Tradovate API integration coming soon.</span>{' '}
                    Our team is finalising the API connection. Check back shortly — you will not need to configure anything yourself.
                  </div>
                ) : (
                  <div className="p-3 rounded-lg bg-emerald-900/20 border border-emerald-500/20 text-xs text-emerald-300">
                    <span className="font-semibold">✓ API ready.</span>{' '}
                    Just enter your Tradovate username and password below — VEDD handles the API connection automatically. No technical setup needed.
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Tradovate Username</label>
                    <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="your@email.com"
                      className="bg-gray-800 border-gray-700 text-white" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Password</label>
                    <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                      className="bg-gray-800 border-gray-700 text-white" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Account Type</label>
                    <div className="flex gap-2">
                      {(['demo', 'live'] as const).map(t => (
                        <button key={t} onClick={() => setAccountType(t)}
                          className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${accountType === t ? 'border-blue-500 bg-blue-500/15 text-blue-400' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>
                          {t === 'demo' ? '📊 Demo' : '🔴 Live'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Prop Firm</label>
                    <Select value={propFirmPreset} onValueChange={setPropFirmPreset}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PROP_FIRM_NAMES).map(([id, name]) => (
                          <SelectItem key={id} value={id}>{name}</SelectItem>
                        ))}
                        <SelectItem value="CUSTOM">Custom / No Preset</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 mb-1 block">Account Size</label>
                    <Select value={String(propFirmAccountSize)} onValueChange={v => setPropFirmAccountSize(Number(v))}>
                      <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ACCOUNT_SIZES.map(s => (
                          <SelectItem key={s} value={String(s)}>${s.toLocaleString()}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedRulesRow && (
                  <div className="rounded-xl bg-blue-900/20 border border-blue-500/20 p-3 grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <p className="text-red-400 font-bold text-sm">${selectedRulesRow.dailyLossLimit.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs">Daily Loss Limit</p>
                    </div>
                    <div className="text-center">
                      <p className="text-amber-400 font-bold text-sm">${selectedRulesRow.trailingMaxDrawdown.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs">Trailing Max DD</p>
                    </div>
                    <div className="text-center">
                      <p className="text-emerald-400 font-bold text-sm">${selectedRulesRow.profitTarget.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs">Profit Target</p>
                    </div>
                  </div>
                )}

                <Button
                  onClick={() => connectMutation.mutate()}
                  disabled={!username || !password || connectMutation.isPending || (apiStatus !== undefined && !apiStatus.configured)}
                  className="w-full bg-blue-600 hover:bg-blue-700">
                  {connectMutation.isPending ? 'Connecting...' : 'Connect Tradovate'}
                </Button>
                <div className="text-center">
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    className="text-xs text-gray-600 hover:text-gray-400 underline"
                    disabled={disconnectMutation.isPending}
                  >
                    Having trouble? Reset previous connection attempt
                  </button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="border-blue-500/30 bg-gradient-to-r from-blue-950/30 to-cyan-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                      <span className="text-blue-400 font-bold text-sm">TRADOVATE CONNECTED</span>
                      <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
                        {connection.accountType?.toUpperCase()}
                      </Badge>
                      {connection.propFirmPreset && (
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                          {PROP_FIRM_NAMES[connection.propFirmPreset] || connection.propFirmPreset}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" onClick={() => refetchAccount()} className="text-gray-400 hover:text-white h-7 px-2">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => disconnectMutation.mutate()} className="text-red-400 hover:text-red-300 h-7 px-2">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {account && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                        <p className="text-white font-bold text-lg">${account.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                        <p className="text-gray-500 text-xs">Account Balance</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                        <p className={`font-bold text-lg ${account.openPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {account.openPnL >= 0 ? '+' : ''}${account.openPnL?.toFixed(2)}
                        </p>
                        <p className="text-gray-500 text-xs">Open P&L</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                        <p className={`font-bold text-lg ${account.closedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {account.closedPnL >= 0 ? '+' : ''}${account.closedPnL?.toFixed(2)}
                        </p>
                        <p className="text-gray-500 text-xs">Closed P&L Today</p>
                      </div>
                      <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                        <p className="text-cyan-400 font-bold text-lg">${account.availableMargin?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                        <p className="text-gray-500 text-xs">Available Margin</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {dd && (
                <Card className={`border ${verdictBg[dd.verdict] || 'border-gray-700 bg-gray-900/50'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck className={`h-5 w-5 ${verdictColor[dd.verdict]}`} />
                        <span className="text-white font-bold text-sm">Prop Firm Risk Monitor</span>
                        <Badge className={`text-[10px] ${dd.verdict === 'SAFE' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : dd.verdict === 'BREACHED' ? 'bg-red-600/30 text-red-300 border-red-600/30' : dd.verdict === 'DANGER' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                          {dd.verdict}
                        </Badge>
                      </div>
                      {dd.verdictReason && <p className="text-xs text-gray-400">{dd.verdictReason}</p>}
                    </div>

                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Trailing Drawdown Buffer</span>
                          <span className={verdictColor[dd.verdict]}>${dd.distanceToFloor?.toFixed(0)} remaining (floor: ${dd.drawdownFloor?.toFixed(0)})</span>
                        </div>
                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${dd.verdict === 'SAFE' ? 'bg-emerald-500' : dd.verdict === 'WARNING' ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`}
                            style={{ width: `${Math.min(100, dd.distanceToFloorPct || 0)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Daily Loss Budget</span>
                          <span>${dd.dailyLossRemaining?.toFixed(0)} of ${dd.dailyLossLimit?.toFixed(0)} remaining</span>
                        </div>
                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${dd.dailyLossUsedPct < 50 ? 'bg-emerald-500' : dd.dailyLossUsedPct < 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                            style={{ width: `${Math.min(100, dd.dailyLossUsedPct || 0)}%` }} />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-400 mb-1">
                          <span>Profit Target Progress</span>
                          <span className="text-emerald-400">${dd.profitGained?.toFixed(2)} / ${dd.profitTarget?.toFixed(0)} ({dd.progressToTarget?.toFixed(1)}%)</span>
                        </div>
                        <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                            style={{ width: `${Math.min(100, dd.progressToTarget || 0)}%` }} />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {positions?.positions?.length > 0 && (
                <Card className="bg-gray-900/60 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-white text-sm flex items-center gap-2">
                      <Activity className="h-4 w-4 text-blue-400" /> Open Positions ({positions.positions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {positions.positions.map((pos: any) => (
                        <div key={pos.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-mono font-bold text-sm">{pos.symbol}</span>
                            <Badge className={`text-[10px] ${pos.netPos > 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                              {pos.netPos > 0 ? 'LONG' : 'SHORT'} {Math.abs(pos.netPos)}
                            </Badge>
                          </div>
                          <div className="text-right">
                            <p className={`font-bold text-sm ${pos.openPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {pos.openPnL >= 0 ? '+' : ''}${pos.openPnL?.toFixed(2)}
                            </p>
                            <p className="text-gray-500 text-xs">@ {pos.netPrice}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {/* ── Engine settings ── */}
          {configLoading ? (
            <p className="text-xs text-gray-500">Loading settings...</p>
          ) : (
            <>
              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-base">Core Settings</CardTitle>
                  <CardDescription>Symbols, sizing, and confidence — persisted, not lost on restart.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Symbols (comma-separated)</Label>
                    <Input
                      value={(form.symbols ?? DEFAULT_SYMBOLS).join(', ')}
                      onChange={e => set('symbols', e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean))}
                      className="bg-gray-800 border-gray-700"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">AI Mode</Label>
                    <Select value={form.aiMode ?? 'full'} onValueChange={v => set('aiMode', v)}>
                      <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full (best model)</SelectItem>
                        <SelectItem value="economy">Economy (cost-saving)</SelectItem>
                        <SelectItem value="rule_based">Rule-Based (no AI calls)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Direction Filter</Label>
                    <Select value={form.directionFilter ?? 'both'} onValueChange={v => set('directionFilter', v)}>
                      <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="both">Both</SelectItem>
                        <SelectItem value="long_only">Long Only</SelectItem>
                        <SelectItem value="short_only">Short Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Min Confidence %</Label>
                    <Input type="number" value={form.minConfidence ?? 70} onChange={e => set('minConfidence', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max Open Trades</Label>
                    <Input type="number" value={form.maxOpenTrades ?? 3} onChange={e => set('maxOpenTrades', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Risk % per Trade</Label>
                    <Input type="number" step="0.1" value={form.riskPerTrade ?? 1} onChange={e => set('riskPerTrade', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Account Balance $</Label>
                    <Input type="number" value={form.accountBalance ?? 50000} onChange={e => set('accountBalance', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max Daily Trades (0=unlimited)</Label>
                    <Input type="number" value={form.maxDailyTrades ?? 0} onChange={e => set('maxDailyTrades', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Daily Loss Limit % (0=disabled)</Label>
                    <Input type="number" value={form.dailyLossLimit ?? 3} onChange={e => set('dailyLossLimit', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Daily Profit Target % (0=disabled)</Label>
                    <Input type="number" value={form.dailyProfitTarget ?? 0} onChange={e => set('dailyProfitTarget', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Auto-Execute Trades</Label>
                    <Switch checked={form.enableAutoExecution ?? false} onCheckedChange={v => set('enableAutoExecution', v)} />
                  </div>
                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs">Prop Firm Mode</Label>
                    <Switch checked={form.propFirmMode ?? false} onCheckedChange={v => set('propFirmMode', v)} />
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-gray-900 border-gray-800">
                <CardHeader>
                  <CardTitle className="text-base">FX SS AI Engine Parity Settings</CardTitle>
                  <CardDescription>Kelly sizing, Brain Learning Mode, Drawdown Shield, R-multiple trailing stops, consistency rule.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Brain Learning Mode</Label>
                    <Switch checked={form.brainLearningMode ?? true} onCheckedChange={v => set('brainLearningMode', v)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Kelly Criterion Sizing</Label>
                    <Switch checked={form.useKellyCriterion ?? false} onCheckedChange={v => set('useKellyCriterion', v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Drawdown Shield Threshold %</Label>
                    <Input type="number" value={form.drawdownShieldThreshold ?? 3} onChange={e => set('drawdownShieldThreshold', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Prop-Firm Daily Drawdown Limit %</Label>
                    <Input type="number" value={form.propFirmDailyDrawdownLimit ?? 2} onChange={e => set('propFirmDailyDrawdownLimit', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Trailing Stop Method</Label>
                    <Select value={form.trailMethod ?? 'none'} onValueChange={v => set('trailMethod', v)}>
                      <SelectTrigger className="bg-gray-800 border-gray-700"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (static SL/TP)</SelectItem>
                        <SelectItem value="fixed_r">Fixed R</SelectItem>
                        <SelectItem value="stepped_fixed">Stepped Fixed</SelectItem>
                        <SelectItem value="profit_lock">Profit Lock</SelectItem>
                        <SelectItem value="chandelier">Chandelier</SelectItem>
                        <SelectItem value="parabolic_sar">Parabolic SAR</SelectItem>
                        <SelectItem value="r_multiple">R-Multiple</SelectItem>
                        <SelectItem value="swing_structure">Swing Structure</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Trail Activation (R)</Label>
                    <Input type="number" step="0.1" value={form.trailActivationR ?? 1.0} onChange={e => set('trailActivationR', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Trail Distance (R)</Label>
                    <Input type="number" step="0.1" value={form.trailFixedR ?? 0.5} onChange={e => set('trailFixedR', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Consistency Rule Enforcement</Label>
                    <Switch checked={form.consistencyEnforcementEnabled ?? false} onCheckedChange={v => set('consistencyEnforcementEnabled', v)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Max Daily Profit % of Total (0=off)</Label>
                    <Input type="number" value={form.maxDailyProfitPctOfTotal ?? 0} onChange={e => set('maxDailyProfitPctOfTotal', Number(e.target.value))} className="bg-gray-800 border-gray-700" />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Smart Symbol Escalation</Label>
                    <Switch checked={form.smartSymbolEscalation ?? false} onCheckedChange={v => set('smartSymbolEscalation', v)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">High Confidence Override</Label>
                    <Switch checked={form.highConfidenceOverride ?? false} onCheckedChange={v => set('highConfidenceOverride', v)} />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label className="text-xs">Composite Autonomous Entries</Label>
                    <Switch checked={form.enableCompositeAutonomous ?? false} onCheckedChange={v => set('enableCompositeAutonomous', v)} />
                  </div>
                </CardContent>
              </Card>

              <Button onClick={() => saveConfigMutation.mutate(form)} disabled={saveConfigMutation.isPending}>
                {saveConfigMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                Save Settings
              </Button>
            </>
          )}

          {/* ── Prop Firm Rules Table ── */}
          <Card className="bg-gray-900/60 border-gray-700">
            <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowRulesTable(!showRulesTable)}>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Info className="h-4 w-4 text-purple-400" /> Prop Firm Rules Reference
                </CardTitle>
                {showRulesTable ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </div>
            </CardHeader>
            {showRulesTable && presetsData?.presets && (
              <CardContent>
                <div className="space-y-4">
                  {presetsData.presets.map((preset: any) => (
                    <div key={preset.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-white font-bold text-sm">{preset.name}</span>
                        {preset.allowOvernightHolds && <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">Overnight ✓</Badge>}
                        {preset.allowWeekendHolds && <Badge className="text-[10px] bg-purple-500/20 text-purple-400 border-purple-500/30">Weekend ✓</Badge>}
                        {preset.consistencyRule && <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Consistency Rule</Badge>}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs text-gray-400">
                          <thead>
                            <tr className="border-b border-gray-700">
                              <th className="text-left py-1 pr-3">Account</th>
                              <th className="text-right py-1 pr-3 text-red-400">Daily Loss</th>
                              <th className="text-right py-1 pr-3 text-amber-400">Max DD</th>
                              <th className="text-right py-1 text-emerald-400">Target</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preset.rulesTable?.map((row: any) => (
                              <tr key={row.accountSize} className="border-b border-gray-800/50">
                                <td className="py-1 pr-3 font-mono">${row.accountSize.toLocaleString()}</td>
                                <td className="py-1 pr-3 text-right text-red-400 font-mono">${row.dailyLossLimit.toLocaleString()}</td>
                                <td className="py-1 pr-3 text-right text-amber-400 font-mono">${row.trailingMaxDrawdown.toLocaleString()}</td>
                                <td className="py-1 text-right text-emerald-400 font-mono">${row.profitTarget.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {preset.consistencyRule && <p className="text-xs text-amber-400/70 mt-1">⚠️ {preset.consistencyRule}</p>}
                    </div>
                  ))}
                </div>
              </CardContent>
            )}
          </Card>

          {/* ── Contract Size Calculator ── */}
          <Card className="bg-gray-900/60 border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" /> Contract Size Calculator
              </CardTitle>
              <CardDescription className="text-gray-400 text-xs">
                Calculate how many contracts to trade based on your risk tolerance
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Symbol</label>
                  <Select value={calcSymbol} onValueChange={setCalcSymbol}>
                    <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {instrumentsData?.instruments?.map((inst: any) => (
                        <SelectItem key={inst.symbol} value={inst.symbol}>
                          {inst.symbol} — {inst.description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Risk %</label>
                  <Input value={calcRisk} onChange={e => setCalcRisk(e.target.value)} type="number" min="0.1" max="5" step="0.1"
                    className="bg-gray-800 border-gray-700 text-white text-xs" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Entry Price</label>
                  <Input value={calcEntry} onChange={e => setCalcEntry(e.target.value)} type="number" placeholder="e.g. 19500"
                    className="bg-gray-800 border-gray-700 text-white text-xs" />
                </div>
                <div>
                  <label className="text-xs text-gray-400 mb-1 block">Stop Loss Price</label>
                  <Input value={calcSL} onChange={e => setCalcSL(e.target.value)} type="number" placeholder="e.g. 19450"
                    className="bg-gray-800 border-gray-700 text-white text-xs" />
                </div>
              </div>
              <Button size="sm" onClick={calcContractSize} className="bg-cyan-600 hover:bg-cyan-700 mb-3">
                Calculate
              </Button>
              {calcResult && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <p className="text-white font-bold text-xl">{calcResult.contracts}</p>
                    <p className="text-gray-500 text-xs">Contracts</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <p className="text-red-400 font-bold text-xl">${calcResult.dollarRisk?.toFixed(2)}</p>
                    <p className="text-gray-500 text-xs">Max Dollar Risk</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <p className="text-cyan-400 font-bold text-xl">{calcResult.ticks}</p>
                    <p className="text-gray-500 text-xs">SL Distance (ticks)</p>
                  </div>
                  {calcResult.instrument && (
                    <div className="col-span-3 bg-blue-900/20 border border-blue-500/20 rounded-lg p-2 text-xs text-gray-400">
                      <span className="font-mono">{calcResult.instrument.symbol}</span> — Tick: ${calcResult.instrument.tickValue} | Point Value: ${calcResult.instrument.pointValue} | Exchange: {calcResult.instrument.exchange}
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Brain ── */}
        <TabsContent value="brain" className="mt-0 space-y-6">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" /> Self-Learning Brain
                  {brainStatus?.learned && <Badge variant="outline" className="text-[10px] font-mono">{brainStatus.totalTradesAnalyzed} trades</Badge>}
                </span>
                <Button size="sm" onClick={() => learnMutation.mutate()} disabled={learnMutation.isPending}>
                  {learnMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Brain className="w-3.5 h-3.5 mr-1.5" />}
                  {brainStatus?.learned ? 'Re-Learn' : 'Train Brain'}
                </Button>
              </CardTitle>
              <CardDescription>Learns per-symbol win rate, direction bias, best hours, and best strategies from closed trade history.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {brainLoading ? (
                <p className="text-xs text-gray-500">Loading brain status...</p>
              ) : !brainStatus?.learned ? (
                <p className="text-xs text-gray-500">No brain data yet — click "Train Brain" once you have a few closed trades.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Win Rate</p>
                      <p className={`text-lg font-bold font-mono ${(brainStatus.overallWinRate ?? 0) >= 60 ? 'text-emerald-400' : (brainStatus.overallWinRate ?? 0) >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{brainStatus.overallWinRate}%</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Symbols</p>
                      <p className="text-lg font-bold font-mono text-white">{brainStatus.symbolsLearned}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Total P&L</p>
                      <p className={`text-lg font-bold font-mono ${(brainStatus.totalProfit ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{(brainStatus.totalProfit ?? 0) >= 0 ? '+' : ''}${(brainStatus.totalProfit ?? 0).toFixed(2)}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Analyzed</p>
                      <p className="text-lg font-bold font-mono text-white">{brainStatus.totalTradesAnalyzed}</p>
                    </div>
                  </div>

                  {brainStatus.learningInsights && brainStatus.learningInsights.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Learning Insights</h4>
                      {brainStatus.learningInsights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                          <Brain className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
                          <span>{insight}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {brainStatus.symbolKnowledge && Object.keys(brainStatus.symbolKnowledge).length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Per-Symbol Knowledge</h4>
                      <div className="space-y-2">
                        {Object.entries(brainStatus.symbolKnowledge).map(([symbol, k]) => (
                          <div key={symbol} className="p-2.5 rounded-lg border border-gray-700/40 bg-gray-800/30 flex items-center justify-between gap-2">
                            <div>
                              <p className="text-sm font-bold text-white">{symbol} <span className="text-[10px] font-normal text-gray-500">{k.totalTrades} trades</span></p>
                              <p className="text-[10px] text-gray-500">
                                {k.preferredDirection !== 'both' ? `${k.preferredDirection.toUpperCase()} bias` : 'No direction bias'} · RR {k.riskRewardRatio.toFixed(1)} · {k.bestStrategies.join(', ') || '—'}
                              </p>
                            </div>
                            <span className={`text-sm font-mono font-bold shrink-0 ${k.winRate >= 60 ? 'text-emerald-400' : k.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{k.winRate}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-purple-400" /> Brain Dashboard</CardTitle>
              <CardDescription>Strategy breakdown and top-performing setups from the last 30 days of closed trades.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {brainSummaryLoading ? (
                <p className="text-xs text-gray-500">Loading...</p>
              ) : !brainSummary || brainSummary.totalClosedLast30d === 0 ? (
                <p className="text-xs text-gray-500">No closed trades in the last 30 days yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {brainSummary.sourceBreakdown.map(s => (
                      <div key={s.strategy} className="p-3 rounded-lg bg-gray-800/50 border border-gray-700/50">
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">{s.strategy.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-gray-400">{s.trades} trades</p>
                        <p className={`text-sm font-bold font-mono ${s.winRate >= 60 ? 'text-emerald-400' : s.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{s.winRate}%</p>
                      </div>
                    ))}
                  </div>
                  <div>
                    <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Top Performing Setups</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-500 border-b border-gray-800">
                            <th className="text-left font-medium py-1.5 pr-3">Symbol</th>
                            <th className="text-left font-medium py-1.5 pr-3">Strategy</th>
                            <th className="text-right font-medium py-1.5 pr-3">Trades</th>
                            <th className="text-right font-medium py-1.5 pr-3">Win Rate</th>
                            <th className="text-right font-medium py-1.5">Avg R</th>
                          </tr>
                        </thead>
                        <tbody>
                          {brainSummary.topSetups.map((s, i) => (
                            <tr key={i} className="border-b border-gray-800/50">
                              <td className="py-1.5 pr-3 font-bold text-white">{s.symbol}</td>
                              <td className="py-1.5 pr-3 text-gray-400">{s.strategy.replace(/_/g, ' ')}</td>
                              <td className="py-1.5 pr-3 text-right font-mono text-gray-400">{s.trades}</td>
                              <td className={`py-1.5 pr-3 text-right font-mono font-bold ${s.winRate >= 60 ? 'text-emerald-400' : s.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{s.winRate}%</td>
                              <td className={`py-1.5 text-right font-mono ${s.avgR >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.avgR >= 0 ? '+' : ''}{s.avgR.toFixed(2)}R</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Consensus ── */}
        <TabsContent value="consensus" className="mt-0">
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span className="flex items-center gap-2"><Swords className="w-4 h-4 text-purple-400" /> Dual-Vote Consensus</span>
                {consensusData?.updatedAt && <span className="text-[10px] text-gray-500 font-normal">Last signal: {new Date(consensusData.updatedAt).toLocaleTimeString()}</span>}
              </CardTitle>
              <CardDescription>Quant Rules Agent + AI Agent — both must agree to fire a trade (unless rule-based mode).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {consensusLoading ? (
                <p className="text-xs text-gray-500">Loading...</p>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="p-2.5 rounded-lg bg-emerald-900/10 border border-emerald-700/30 text-center">
                      <p className="text-lg font-bold text-emerald-400">{consensusData?.summary.strongConfirm ?? 0}</p>
                      <p className="text-[9px] uppercase tracking-wide text-gray-500">✅ Strong Confirm</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-amber-900/10 border border-amber-700/30 text-center">
                      <p className="text-lg font-bold text-amber-400">{consensusData?.summary.caution ?? 0}</p>
                      <p className="text-[9px] uppercase tracking-wide text-gray-500">⚠️ Caution</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-cyan-900/10 border border-cyan-700/30 text-center">
                      <p className="text-lg font-bold text-cyan-400">{consensusData?.summary.watch ?? 0}</p>
                      <p className="text-[9px] uppercase tracking-wide text-gray-500">👁️ Watch</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-red-900/10 border border-red-700/30 text-center">
                      <p className="text-lg font-bold text-red-400">{consensusData?.summary.strongSkip ?? 0}</p>
                      <p className="text-[9px] uppercase tracking-wide text-gray-500">🚫 Strong Skip</p>
                    </div>
                  </div>

                  {!consensusData || consensusData.consensus.length === 0 ? (
                    <div className="text-center py-8">
                      <Swords className="w-8 h-8 text-gray-700 mx-auto mb-2" />
                      <p className="text-xs text-gray-500">No signals processed yet — consensus appears as soon as the engine sees a qualifying signal.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto">
                      {consensusData.consensus.slice(0, 10).map((c, i) => {
                        const labelColor = {
                          STRONG_CONFIRM: 'border-emerald-700/40 bg-emerald-900/5',
                          STRONG_SKIP: 'border-red-700/40 bg-red-900/5',
                          CAUTION: 'border-amber-700/40 bg-amber-900/5',
                          WATCH: 'border-cyan-700/40 bg-cyan-900/5',
                        }[c.consensus];
                        const badgeColor = {
                          STRONG_CONFIRM: 'text-emerald-400 bg-emerald-900/20',
                          STRONG_SKIP: 'text-red-400 bg-red-900/20',
                          CAUTION: 'text-amber-400 bg-amber-900/20',
                          WATCH: 'text-cyan-400 bg-cyan-900/20',
                        }[c.consensus];
                        return (
                          <div key={i} className={`p-2.5 rounded-lg border ${labelColor}`}>
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="text-sm font-bold text-white">{c.symbol}</span>
                                <span className="text-[10px] text-gray-500">{c.strategy.replace(/_/g, ' ')}</span>
                                <span className={`text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${badgeColor}`}>{c.consensus.replace('_', ' ')}</span>
                              </div>
                              <span className="text-[10px] text-gray-500 shrink-0">{new Date(c.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <div className="flex items-center gap-3 text-[11px]">
                              <span className={`flex items-center gap-1 ${c.quantVerdict === 'CONFIRM' ? 'text-emerald-400' : c.quantVerdict === 'SKIP' ? 'text-red-400' : 'text-amber-400'}`}>
                                <BarChart3 className="w-3 h-3" /> Quant: {c.quantVerdict} ({c.quantScore}/100)
                              </span>
                              <span className={`flex items-center gap-1 ${c.aiVerdict === 'CONFIRM' ? 'text-emerald-400' : 'text-red-400'}`}>
                                <Brain className="w-3 h-3" /> AI: {c.aiVerdict} ({c.aiConfidence}%)
                              </span>
                              <span className={c.tradeAllowed ? 'text-emerald-400' : 'text-red-400'}>{c.tradeAllowed ? '✓ Allowed' : '✗ Blocked'}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Live Feed ── */}
        <TabsContent value="feed" className="mt-0 space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <p className="text-gray-400 text-xs mb-1">Total Scans</p>
                <p className="text-2xl font-bold text-white">{status?.scanCount ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <p className="text-gray-400 text-xs mb-1">Signals Generated</p>
                <p className="text-2xl font-bold text-yellow-400">{signals.length}</p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <p className="text-gray-400 text-xs mb-1">Wins / Losses</p>
                <p className="text-2xl font-bold">
                  <span className="text-green-400">{status?.wins ?? 0}</span>
                  <span className="text-gray-500"> / </span>
                  <span className="text-red-400">{status?.losses ?? 0}</span>
                </p>
              </CardContent>
            </Card>
            <Card className="bg-gray-900 border-gray-800">
              <CardContent className="p-4">
                <p className="text-gray-400 text-xs mb-1">Last Scan</p>
                <p className="text-sm font-medium text-white">{status?.lastScanAt ? timeAgo(status.lastScanAt) : "—"}</p>
              </CardContent>
            </Card>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" /> AI Signals
                  {signals.length > 0 && <Badge className="ml-auto bg-yellow-600 text-white text-xs">{signals.length}</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {signals.length === 0 ? (
                  <div className="px-4 pb-4 text-center text-gray-500 text-sm py-8">
                    {isRunning ? "Scanning… signals will appear here" : "Start the scanner to see signals"}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
                    {signals.map((sig: any, i: number) => (
                      <div key={sig.id || i} className="px-4 py-3 hover:bg-gray-800/40 transition-colors">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {sig.direction === "BUY" || sig.direction === "LONG"
                              ? <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
                              : <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />}
                            <div>
                              <span className="font-bold text-white">{sig.symbol}</span>
                              <span className={`ml-2 font-semibold ${directionColor(sig.direction)}`}>{sig.direction}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceBadge(sig.confidence)}`}>{sig.confidence}%</span>
                            <span className="text-gray-500 text-xs">{timeAgo(sig.timestamp)}</span>
                          </div>
                        </div>
                        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                          <div><span className="text-gray-500">Entry </span><span className="text-white font-medium">{sig.entryPrice ?? "—"}</span></div>
                          <div><span className="text-gray-500">SL </span><span className="text-red-400 font-medium">{sig.stopLoss ?? "—"}</span></div>
                          <div><span className="text-gray-500">TP </span><span className="text-green-400 font-medium">{sig.takeProfit ?? "—"}</span></div>
                        </div>
                        {sig.reason && <p className="mt-1.5 text-xs text-gray-400 leading-snug">{sig.reason}</p>}
                        {sig.strategy && <p className="mt-1 text-xs text-purple-400">{sig.strategy}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><Activity className="w-4 h-4 text-blue-400" /> Activity Log</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {activities.length === 0 ? (
                  <div className="px-4 pb-4 text-center text-gray-500 text-sm py-8">No activity yet</div>
                ) : (
                  <div className="divide-y divide-gray-800/60 max-h-96 overflow-y-auto">
                    {activities.map((act: any, i: number) => (
                      <div key={i} className="px-4 py-2.5 flex items-start gap-2">
                        {activityIcon(act.type)}
                        <div className="flex-1 min-w-0"><p className="text-sm text-gray-300 leading-snug">{act.message}</p></div>
                        <span className="text-gray-600 text-xs shrink-0 flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(act.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {Object.keys(symPerf).length > 0 && (
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2"><BarChart3 className="w-4 h-4 text-blue-400" /> Symbol Performance (session)</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {Object.entries(symPerf).map(([sym, perf]: [string, any]) => {
                    const total = (perf.wins || 0) + (perf.losses || 0);
                    const wr = total > 0 ? Math.round((perf.wins / total) * 100) : 0;
                    const avgR = total > 0 ? (perf.totalR || 0) / total : 0;
                    return (
                      <div key={sym} className="bg-gray-800/60 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-white">{sym}</span>
                          <span className={`text-xs font-medium ${wr >= 60 ? "text-green-400" : wr >= 45 ? "text-yellow-400" : "text-red-400"}`}>{wr}% WR</span>
                        </div>
                        <div className="flex gap-3 text-xs text-gray-400">
                          <span><span className="text-green-400">{perf.wins || 0}W</span> / <span className="text-red-400">{perf.losses || 0}L</span></span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Avg R: {avgR >= 0 ? '+' : ''}{avgR.toFixed(2)}</div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {isRunning && status?.config?.symbols && (
            <div className="flex flex-wrap gap-2">
              <span className="text-gray-500 text-sm">Scanning:</span>
              {status.config.symbols.map((s: string) => (
                <Badge key={s} variant="outline" className="border-purple-700 text-purple-300 text-xs">{s}</Badge>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
