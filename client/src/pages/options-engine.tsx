import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft, Zap, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle2, XCircle, Trash2, TrendingUp,
  TrendingDown, Radar, Ban, Brain, Swords, BarChart3, Settings2,
} from "lucide-react";

// ── Types mirroring the server schema ───────────────────────────────────────
type AlpacaConnection = {
  id: number;
  apiKeyId: string;
  accountType: 'paper' | 'live';
  isActive: boolean;
  autoExecute: boolean;
  accountId: string | null;
  useRiskPercent: boolean;
  riskPercent: number;
  isPropFirmAccount: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  tradeCount: number;
};

type TastytradeConnection = {
  id: number;
  username: string;
  accountType: 'sandbox' | 'live';
  isActive: boolean;
  autoExecute: boolean;
  accountNumber: string | null;
  useRiskPercent: boolean;
  riskPercent: number;
  isPropFirmAccount: boolean;
  lastConnectedAt: string | null;
  lastError: string | null;
  tradeCount: number;
};

type CryptocomConnection = {
  id: number;
  apiKey: string;
  instrumentType: 'perpetual' | 'future' | 'option';
  isActive: boolean;
  autoExecute: boolean;
  useRiskPercent: boolean;
  riskPercent: number;
  lastConnectedAt: string | null;
  lastError: string | null;
  tradeCount: number;
};

type EngineActivity = {
  id: number;
  symbol: string;
  decision: 'watching' | 'signal' | 'skipped' | 'error';
  reasoning: string;
  score: number | null;
  price: number | null;
  dailyChangePercent: number | null;
  source: string;
  strategy: string | null;
  createdAt: string;
};

type EngineTrade = {
  id: number;
  broker: string;
  underlyingSymbol: string;
  optionSymbol: string;
  strategy: string;
  optionType: 'call' | 'put';
  quantity: number;
  entryPrice: number;
  status: 'open' | 'closed' | 'failed';
  exitPrice: number | null;
  exitReason: string | null;
  realizedPnl: number | null;
  createdAt: string;
  closedAt: string | null;
};

type OptionsEngineConfig = {
  id: number;
  isActive: boolean;
  symbols: string[];
  scanIntervalMs: number;
  strategyMode: string;
  singleStrategyMode: boolean;
  directionFilter: 'calls_only' | 'puts_only' | 'both';
  maxOpenPositions: number;
  maxContractsPerTrade: number;
  riskPerTrade: number;
  minConfidence: number;
  weeklyProfitTarget: number;
  enableCompounding: boolean;
  propFirmMode: boolean;
  propFirmDailyDrawdownLimit: number;
  dailyLossLimit: number;
  dailyProfitTarget: number;
  maxDailyTrades: number;
  executionSource: 'alpaca' | 'tastytrade' | 'auto';
  lockSettings: boolean;
  expiryPreference: '0dte' | 'weekly' | 'monthly' | 'auto';
  minDaysToExpiry: number;
  maxDaysToExpiry: number;
  strikeSelectionMode: 'atm' | 'itm' | 'otm' | 'delta_target';
  targetDelta: number;
  profitTargetPercent: number;
  stopLossPercent: number;
  ivRankMax: number;
  sessionFilterEnabled: boolean;
  avoidLastMinutesBeforeClose: number;
  orbRangeMinutes: number;
  volumeProfileLookbackDays: number;
  breakoutLookbackDays: number;
  orderFlowLookbackBars: number;
  adaptiveScanInterval: boolean;
  enablePyramiding: boolean;
};

type ContractKnowledge = {
  totalTrades: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  riskRewardRatio: number;
  preferredDirection: 'call' | 'put' | 'both';
  callWinRate: number;
  putWinRate: number;
  bestStrategies: string[];
  maxWinStreak: number;
  maxLossStreak: number;
  recommendedContractMultiplier: number;
};

type BrainStatus = {
  learned: boolean;
  lastLearned?: string;
  totalTradesAnalyzed?: number;
  overallWinRate?: number;
  totalProfit?: number;
  symbolsLearned?: number;
  contractKnowledge?: Record<string, ContractKnowledge>;
  learningInsights?: string[];
  lastUpdateAt?: string;
};

type BrainSummary = {
  sourceBreakdown: { strategy: string; trades: number; winRate: number }[];
  topSetups: { symbol: string; strategy: string; trades: number; winRate: number; avgReturnPct: number }[];
  totalClosedLast30d: number;
};

type ConsensusEntry = {
  symbol: string; strategy: string;
  quantVerdict: 'CONFIRM' | 'WATCH' | 'SKIP'; quantScore: number;
  aiVerdict: 'CONFIRM' | 'SKIP'; aiConfidence: number; aiReasoning: string;
  consensus: 'STRONG_CONFIRM' | 'STRONG_SKIP' | 'CAUTION' | 'WATCH';
  tradeAllowed: boolean;
  timestamp: string;
};

type ConsensusData = {
  consensus: ConsensusEntry[];
  summary: { strongConfirm: number; strongSkip: number; caution: number; watch: number };
  updatedAt: string | null;
};

export default function OptionsEnginePage() {
  const { toast } = useToast();

  const [showAlpacaForm, setShowAlpacaForm] = useState(false);
  const [showTastyForm, setShowTastyForm] = useState(false);
  const [showAlpacaSecret, setShowAlpacaSecret] = useState(false);
  const [showTastyPassword, setShowTastyPassword] = useState(false);

  const [alpacaForm, setAlpacaForm] = useState({ apiKeyId: '', apiSecret: '', accountType: 'paper' as 'paper' | 'live', autoExecute: false });
  const [tastyForm, setTastyForm] = useState({ username: '', password: '', accountType: 'sandbox' as 'sandbox' | 'live', autoExecute: false });
  const [showCryptocomForm, setShowCryptocomForm] = useState(false);
  const [showCryptocomSecret, setShowCryptocomSecret] = useState(false);
  const [cryptocomForm, setCryptocomForm] = useState({ apiKey: '', apiSecret: '', instrumentType: 'perpetual' as 'perpetual' | 'future' | 'option', autoExecute: false });

  // ── Alpaca ──────────────────────────────────────────────────────────────
  const { data: alpacaConnections = [], isLoading: alpacaLoading } = useQuery<AlpacaConnection[]>({
    queryKey: ['/api/alpaca/connections'],
    refetchInterval: 30000,
    staleTime: 0,
  });

  const createAlpacaMutation = useMutation({
    mutationFn: async (data: typeof alpacaForm) => {
      const res = await apiRequest('POST', '/api/alpaca/connection', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alpaca/connections'] });
      setAlpacaForm({ apiKeyId: '', apiSecret: '', accountType: 'paper', autoExecute: false });
      setShowAlpacaForm(false);
      toast({ title: "Alpaca connected", description: "Account linked for options execution." });
    },
    onError: (error: any) => {
      toast({ title: "Alpaca connection failed", description: extractErrorMsg(error), variant: "destructive" });
    },
  });

  const updateAlpacaMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AlpacaConnection> }) => {
      const res = await apiRequest('PATCH', `/api/alpaca/connection/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alpaca/connections'] });
      toast({ title: "Settings updated" });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const deleteAlpacaMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/alpaca/connection/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alpaca/connections'] });
      toast({ title: "Connection removed" });
    },
  });

  const testAlpacaMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/alpaca/test/${id}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/alpaca/connections'] });
      toast(data.success
        ? { title: "Alpaca connection OK", description: `Buying power: $${Number(data.account?.buyingPower ?? 0).toLocaleString()}` }
        : { title: "Test failed", description: data.error, variant: "destructive" });
    },
  });

  // ── TastyTrade ──────────────────────────────────────────────────────────
  const { data: tastyConnections = [], isLoading: tastyLoading } = useQuery<TastytradeConnection[]>({
    queryKey: ['/api/tastytrade/connections'],
    refetchInterval: 30000,
    staleTime: 0,
  });

  const createTastyMutation = useMutation({
    mutationFn: async (data: typeof tastyForm) => {
      const res = await apiRequest('POST', '/api/tastytrade/connection', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tastytrade/connections'] });
      setTastyForm({ username: '', password: '', accountType: 'sandbox', autoExecute: false });
      setShowTastyForm(false);
      toast({ title: "TastyTrade connected", description: "Account linked for options execution." });
    },
    onError: (error: any) => {
      toast({ title: "TastyTrade connection failed", description: extractErrorMsg(error), variant: "destructive" });
    },
  });

  const updateTastyMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<TastytradeConnection> }) => {
      const res = await apiRequest('PATCH', `/api/tastytrade/connection/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tastytrade/connections'] });
      toast({ title: "Settings updated" });
    },
  });

  const deleteTastyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/tastytrade/connection/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tastytrade/connections'] });
      toast({ title: "Connection removed" });
    },
  });

  const testTastyMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/tastytrade/test/${id}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/tastytrade/connections'] });
      toast(data.success
        ? { title: "TastyTrade connection OK", description: `Buying power: $${Number(data.account?.buyingPower ?? 0).toLocaleString()}` }
        : { title: "Test failed", description: data.error, variant: "destructive" });
    },
  });

  // ── Crypto.com (separate crypto-derivatives bucket) ────────────────────────
  const { data: cryptocomConnections = [], isLoading: cryptocomLoading } = useQuery<CryptocomConnection[]>({
    queryKey: ['/api/cryptocom/connections'],
    refetchInterval: 30000,
    staleTime: 0,
  });

  const createCryptocomMutation = useMutation({
    mutationFn: async (data: typeof cryptocomForm) => {
      const res = await apiRequest('POST', '/api/cryptocom/connection', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      setCryptocomForm({ apiKey: '', apiSecret: '', instrumentType: 'perpetual', autoExecute: false });
      setShowCryptocomForm(false);
      toast({ title: "Crypto.com connected", description: "Account linked for crypto-derivatives execution." });
    },
    onError: (error: any) => {
      toast({ title: "Crypto.com connection failed", description: extractErrorMsg(error), variant: "destructive" });
    },
  });

  const updateCryptocomMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CryptocomConnection> }) => {
      const res = await apiRequest('PATCH', `/api/cryptocom/connection/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      toast({ title: "Settings updated" });
    },
  });

  const deleteCryptocomMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/cryptocom/connection/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      toast({ title: "Connection removed" });
    },
  });

  const testCryptocomMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/cryptocom/test/${id}`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      toast(data.success
        ? { title: "Crypto.com connection OK", description: `Available balance: $${Number(data.account?.availableBalance ?? 0).toLocaleString()}` }
        : { title: "Test failed", description: data.error, variant: "destructive" });
    },
  });

  // ── Engine config ───────────────────────────────────────────────────────
  const { data: config, isLoading: configLoading } = useQuery<OptionsEngineConfig>({
    queryKey: ['/api/options-engine/config'],
  });

  // ── Live scan/decision feed — what the engine is seeing and why ───────────
  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useQuery<{ activity: EngineActivity[] }>({
    queryKey: ['/api/options-engine/activity'],
    refetchInterval: config?.isActive ? 15000 : false,
  });
  const activity = activityData?.activity ?? [];

  // ── Executed trades — open positions + recent history ─────────────────────
  const { data: tradesData, isLoading: tradesLoading } = useQuery<{ open: EngineTrade[]; recent: EngineTrade[] }>({
    queryKey: ['/api/options-engine/trades'],
    refetchInterval: config?.isActive ? 15000 : false,
  });
  const openTrades = tradesData?.open ?? [];
  const closedTrades = (tradesData?.recent ?? []).filter(t => t.status !== 'open');

  const updateConfigMutation = useMutation({
    mutationFn: async (data: Partial<OptionsEngineConfig>) => {
      const res = await apiRequest('PATCH', '/api/options-engine/config', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/options-engine/config'] });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  const totalConnections = alpacaConnections.length + tastyConnections.length;

  // ── Self-Learning Brain ─────────────────────────────────────────────────
  const { data: brainStatus, isLoading: brainLoading } = useQuery<BrainStatus>({
    queryKey: ['/api/options-brain/status'],
    refetchInterval: 60000,
  });
  const { data: brainSummary, isLoading: brainSummaryLoading } = useQuery<BrainSummary>({
    queryKey: ['/api/options-brain/summary'],
    refetchInterval: 120000,
  });
  const learnMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/options-brain/learn');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/options-brain/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/options-brain/summary'] });
      toast({ title: "Brain updated", description: "Re-learned from the latest trade history." });
    },
    onError: (error: any) => toast({ title: "Error", description: error.message, variant: "destructive" }),
  });

  // ── Dual-Vote Consensus ──────────────────────────────────────────────────
  const { data: consensusData, isLoading: consensusLoading } = useQuery<ConsensusData>({
    queryKey: ['/api/options-engine/consensus'],
    refetchInterval: 15000,
  });

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-16">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon" className="text-gray-400"><ArrowLeft className="w-5 h-5" /></Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
              Options AI Engine
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              AI-driven options trading — connect a broker, set your risk, let the engine scan and execute.
            </p>
          </div>
        </div>

        <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3 mb-6">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/80">
            Alpaca, TastyTrade, and Crypto.com are live now. Moomoo options trading works via your existing{' '}
            <Link href="/futures-connect" className="underline">Moomoo OpenD connection</Link>. Fidelity has no public
            trading API and cannot be automated. NinjaTrader is a futures-only platform — it doesn't support equity
            options at all, so it isn't part of this engine. Charles Schwab, Webull, and Interactive Brokers remain on
            the roadmap — each needs broker-specific developer approval before it can connect the same way.
          </p>
        </div>

        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid grid-cols-4 mb-6">
            <TabsTrigger value="setup" className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Setup & Config</TabsTrigger>
            <TabsTrigger value="brain" className="flex items-center gap-1.5"><Brain className="w-3.5 h-3.5" /> Brain</TabsTrigger>
            <TabsTrigger value="consensus" className="flex items-center gap-1.5"><Swords className="w-3.5 h-3.5" /> Consensus</TabsTrigger>
            <TabsTrigger value="feed" className="flex items-center gap-1.5"><Radar className="w-3.5 h-3.5" /> Live Feed</TabsTrigger>
          </TabsList>

          <TabsContent value="setup" className="mt-0">
        {/* ── Broker connections ── */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          {/* Alpaca */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Alpaca</span>
                <Badge variant="outline" className="text-[10px] border-emerald-700 text-emerald-400">Options supported</Badge>
              </CardTitle>
              <CardDescription>API Key ID + Secret Key — no OAuth, no broker login page.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alpacaLoading ? (
                <p className="text-xs text-gray-500">Loading...</p>
              ) : (
                alpacaConnections.map((conn) => (
                  <div key={conn.id} className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{conn.apiKeyId.slice(0, 8)}••••</p>
                        <p className="text-[10px] text-gray-500 uppercase">{conn.accountType} · {conn.accountId || 'unresolved'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {conn.lastError ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : conn.lastConnectedAt ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : null}
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => testAlpacaMutation.mutate(conn.id)} disabled={testAlpacaMutation.isPending}>
                          <RefreshCw className={`w-3.5 h-3.5 ${testAlpacaMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" onClick={() => deleteAlpacaMutation.mutate(conn.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {conn.lastError && <p className="text-[10px] text-red-400">{conn.lastError}</p>}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-400">Auto-execute</Label>
                      <Switch checked={conn.autoExecute} onCheckedChange={(v) => updateAlpacaMutation.mutate({ id: conn.id, data: { autoExecute: v } })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-400 whitespace-nowrap">Risk % / trade</Label>
                      <Input
                        type="number" step="0.1" min="0.05" max="20"
                        defaultValue={conn.riskPercent}
                        onBlur={(e) => updateAlpacaMutation.mutate({ id: conn.id, data: { riskPercent: parseFloat(e.target.value) } })}
                        className="h-7 text-xs bg-gray-900 border-gray-700 w-20"
                      />
                    </div>
                  </div>
                ))
              )}

              {!showAlpacaForm ? (
                <Button variant="outline" onClick={() => setShowAlpacaForm(true)} className="w-full border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20">
                  <Zap className="w-4 h-4 mr-2" />{alpacaConnections.length === 0 ? 'Connect Alpaca Account' : 'Add Another Account'}
                </Button>
              ) : (
                <div className="space-y-3 p-3 bg-emerald-900/10 border border-emerald-700/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="text-emerald-400 font-semibold text-sm">Connect Alpaca</h4>
                    <Button variant="ghost" size="sm" onClick={() => setShowAlpacaForm(false)} className="text-gray-500 h-6 px-2">✕</Button>
                  </div>
                  <p className="text-[11px] text-gray-400">Find these under Alpaca dashboard → API Keys. Your secret is encrypted at rest.</p>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-300">API Key ID</Label>
                    <Input
                      placeholder="PK..."
                      value={alpacaForm.apiKeyId}
                      onChange={(e) => setAlpacaForm(p => ({ ...p, apiKeyId: e.target.value }))}
                      className="bg-gray-900 border-gray-700 h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Secret Key</Label>
                    <div className="relative">
                      <Input
                        type={showAlpacaSecret ? "text" : "password"}
                        placeholder="Your Alpaca secret key"
                        value={alpacaForm.apiSecret}
                        onChange={(e) => setAlpacaForm(p => ({ ...p, apiSecret: e.target.value }))}
                        className="bg-gray-900 border-gray-700 h-8 text-sm pr-9"
                      />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-2" onClick={() => setShowAlpacaSecret(!showAlpacaSecret)}>
                        {showAlpacaSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-300">Account:</Label>
                      <Select value={alpacaForm.accountType} onValueChange={(v: 'paper' | 'live') => setAlpacaForm(p => ({ ...p, accountType: v }))}>
                        <SelectTrigger className="w-24 h-7 bg-gray-900 border-gray-700 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paper">Paper</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="alpacaAuto" checked={alpacaForm.autoExecute} onCheckedChange={(c) => setAlpacaForm(p => ({ ...p, autoExecute: c === true }))} />
                      <Label htmlFor="alpacaAuto" className="text-xs text-gray-300">Auto-execute</Label>
                    </div>
                  </div>
                  <Button
                    onClick={() => createAlpacaMutation.mutate(alpacaForm)}
                    disabled={!alpacaForm.apiKeyId || !alpacaForm.apiSecret || createAlpacaMutation.isPending}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 h-8 text-sm"
                  >
                    {createAlpacaMutation.isPending ? (<><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Connecting...</>) : 'Connect Account'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* TastyTrade */}
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>TastyTrade</span>
                <Badge variant="outline" className="text-[10px] border-emerald-700 text-emerald-400">Options-focused</Badge>
              </CardTitle>
              <CardDescription>Username + password session login (sandbox or live).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {tastyLoading ? (
                <p className="text-xs text-gray-500">Loading...</p>
              ) : (
                tastyConnections.map((conn) => (
                  <div key={conn.id} className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{conn.username}</p>
                        <p className="text-[10px] text-gray-500 uppercase">{conn.accountType} · {conn.accountNumber || 'unresolved'}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {conn.lastError ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : conn.lastConnectedAt ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : null}
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => testTastyMutation.mutate(conn.id)} disabled={testTastyMutation.isPending}>
                          <RefreshCw className={`w-3.5 h-3.5 ${testTastyMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" onClick={() => deleteTastyMutation.mutate(conn.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {conn.lastError && <p className="text-[10px] text-red-400">{conn.lastError}</p>}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-400">Auto-execute</Label>
                      <Switch checked={conn.autoExecute} onCheckedChange={(v) => updateTastyMutation.mutate({ id: conn.id, data: { autoExecute: v } })} />
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-400 whitespace-nowrap">Risk % / trade</Label>
                      <Input
                        type="number" step="0.1" min="0.05" max="20"
                        defaultValue={conn.riskPercent}
                        onBlur={(e) => updateTastyMutation.mutate({ id: conn.id, data: { riskPercent: parseFloat(e.target.value) } })}
                        className="h-7 text-xs bg-gray-900 border-gray-700 w-20"
                      />
                    </div>
                  </div>
                ))
              )}

              {!showTastyForm ? (
                <Button variant="outline" onClick={() => setShowTastyForm(true)} className="w-full border-emerald-700/50 text-emerald-400 hover:bg-emerald-900/20">
                  <Zap className="w-4 h-4 mr-2" />{tastyConnections.length === 0 ? 'Connect TastyTrade Account' : 'Add Another Account'}
                </Button>
              ) : (
                <div className="space-y-3 p-3 bg-emerald-900/10 border border-emerald-700/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="text-emerald-400 font-semibold text-sm">Connect TastyTrade</h4>
                    <Button variant="ghost" size="sm" onClick={() => setShowTastyForm(false)} className="text-gray-500 h-6 px-2">✕</Button>
                  </div>
                  <p className="text-[11px] text-gray-400">Your password is encrypted and never shown again. Use Sandbox to test without risking funds.</p>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Username</Label>
                    <Input
                      placeholder="your TastyTrade username"
                      value={tastyForm.username}
                      onChange={(e) => setTastyForm(p => ({ ...p, username: e.target.value }))}
                      className="bg-gray-900 border-gray-700 h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Password</Label>
                    <div className="relative">
                      <Input
                        type={showTastyPassword ? "text" : "password"}
                        placeholder="Your TastyTrade password"
                        value={tastyForm.password}
                        onChange={(e) => setTastyForm(p => ({ ...p, password: e.target.value }))}
                        className="bg-gray-900 border-gray-700 h-8 text-sm pr-9"
                      />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-2" onClick={() => setShowTastyPassword(!showTastyPassword)}>
                        {showTastyPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-300">Account:</Label>
                      <Select value={tastyForm.accountType} onValueChange={(v: 'sandbox' | 'live') => setTastyForm(p => ({ ...p, accountType: v }))}>
                        <SelectTrigger className="w-28 h-7 bg-gray-900 border-gray-700 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sandbox">Sandbox</SelectItem>
                          <SelectItem value="live">Live</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="tastyAuto" checked={tastyForm.autoExecute} onCheckedChange={(c) => setTastyForm(p => ({ ...p, autoExecute: c === true }))} />
                      <Label htmlFor="tastyAuto" className="text-xs text-gray-300">Auto-execute</Label>
                    </div>
                  </div>
                  <Button
                    onClick={() => createTastyMutation.mutate(tastyForm)}
                    disabled={!tastyForm.username || !tastyForm.password || createTastyMutation.isPending}
                    className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 h-8 text-sm"
                  >
                    {createTastyMutation.isPending ? (<><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Connecting...</>) : 'Connect Account'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Crypto.com — separate crypto-derivatives bucket, kept apart from ── */}
        {/* ── the equity options engine above (perpetuals/futures, not options) ── */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-400 mb-2 uppercase tracking-wide">Crypto Derivatives (separate bucket)</h2>
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader>
              <CardTitle className="text-base flex items-center justify-between">
                <span>Crypto.com Exchange</span>
                <Badge variant="outline" className="text-[10px] border-amber-700 text-amber-400">Perpetuals / futures — not equity options</Badge>
              </CardTitle>
              <CardDescription>API Key + Secret Key. Crypto.com doesn't offer traditional options — this connects perpetuals/futures execution, kept distinct from the equity engine above.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {cryptocomLoading ? (
                <p className="text-xs text-gray-500">Loading...</p>
              ) : (
                cryptocomConnections.map((conn) => (
                  <div key={conn.id} className="p-3 bg-gray-800/50 border border-gray-700 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">{conn.apiKey.slice(0, 8)}••••</p>
                        <p className="text-[10px] text-gray-500 uppercase">{conn.instrumentType}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {conn.lastError ? (
                          <XCircle className="w-4 h-4 text-red-400" />
                        ) : conn.lastConnectedAt ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        ) : null}
                        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => testCryptocomMutation.mutate(conn.id)} disabled={testCryptocomMutation.isPending}>
                          <RefreshCw className={`w-3.5 h-3.5 ${testCryptocomMutation.isPending ? 'animate-spin' : ''}`} />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" onClick={() => deleteCryptocomMutation.mutate(conn.id)}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                    {conn.lastError && <p className="text-[10px] text-red-400">{conn.lastError}</p>}
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-gray-400">Auto-execute</Label>
                      <Switch checked={conn.autoExecute} onCheckedChange={(v) => updateCryptocomMutation.mutate({ id: conn.id, data: { autoExecute: v } })} />
                    </div>
                  </div>
                ))
              )}

              {!showCryptocomForm ? (
                <Button variant="outline" onClick={() => setShowCryptocomForm(true)} className="w-full border-amber-700/50 text-amber-400 hover:bg-amber-900/20">
                  <Zap className="w-4 h-4 mr-2" />{cryptocomConnections.length === 0 ? 'Connect Crypto.com Account' : 'Add Another Account'}
                </Button>
              ) : (
                <div className="space-y-3 p-3 bg-amber-900/10 border border-amber-700/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="text-amber-400 font-semibold text-sm">Connect Crypto.com</h4>
                    <Button variant="ghost" size="sm" onClick={() => setShowCryptocomForm(false)} className="text-gray-500 h-6 px-2">✕</Button>
                  </div>
                  <p className="text-[11px] text-gray-400">Find these under Crypto.com Exchange → Settings → API Keys.</p>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-300">API Key</Label>
                    <Input
                      value={cryptocomForm.apiKey}
                      onChange={(e) => setCryptocomForm(p => ({ ...p, apiKey: e.target.value }))}
                      className="bg-gray-900 border-gray-700 h-8 text-sm"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-gray-300">Secret Key</Label>
                    <div className="relative">
                      <Input
                        type={showCryptocomSecret ? "text" : "password"}
                        value={cryptocomForm.apiSecret}
                        onChange={(e) => setCryptocomForm(p => ({ ...p, apiSecret: e.target.value }))}
                        className="bg-gray-900 border-gray-700 h-8 text-sm pr-9"
                      />
                      <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full px-2" onClick={() => setShowCryptocomSecret(!showCryptocomSecret)}>
                        {showCryptocomSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </Button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-300">Instrument:</Label>
                      <Select value={cryptocomForm.instrumentType} onValueChange={(v: any) => setCryptocomForm(p => ({ ...p, instrumentType: v }))}>
                        <SelectTrigger className="w-28 h-7 bg-gray-900 border-gray-700 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="perpetual">Perpetual</SelectItem>
                          <SelectItem value="future">Future</SelectItem>
                          <SelectItem value="option">Option (region-dependent)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox id="cryptocomAuto" checked={cryptocomForm.autoExecute} onCheckedChange={(c) => setCryptocomForm(p => ({ ...p, autoExecute: c === true }))} />
                      <Label htmlFor="cryptocomAuto" className="text-xs text-gray-300">Auto-execute</Label>
                    </div>
                  </div>
                  <Button
                    onClick={() => createCryptocomMutation.mutate(cryptocomForm)}
                    disabled={!cryptocomForm.apiKey || !cryptocomForm.apiSecret || createCryptocomMutation.isPending}
                    className="w-full bg-gradient-to-r from-amber-600 to-orange-600 h-8 text-sm"
                  >
                    {createCryptocomMutation.isPending ? (<><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Connecting...</>) : 'Connect Account'}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Engine settings (mirrors the Forex SS AI Engine's config shape) ── */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span>Engine Settings</span>
              {config && (
                <Switch
                  checked={config.isActive}
                  onCheckedChange={(v) => updateConfigMutation.mutate({ isActive: v })}
                  disabled={totalConnections === 0}
                />
              )}
            </CardTitle>
            <CardDescription>
              {totalConnections === 0
                ? 'Connect a broker above before activating the engine.'
                : `${config?.isActive ? 'Active' : 'Paused'} — scanning ${config?.symbols?.length ?? 0} symbols.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {configLoading || !config ? (
              <p className="text-xs text-gray-500">Loading settings...</p>
            ) : (
              <>
                {/* ── Watchlist & Strategy ── */}
                <div>
                  <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide mb-3">Watchlist & Strategy</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2 md:col-span-2">
                      <Label className="text-xs text-gray-400">Underlyings to scan (comma-separated)</Label>
                      <Input
                        defaultValue={config.symbols.join(', ')}
                        onBlur={(e) => updateConfigMutation.mutate({ symbols: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Strategy</Label>
                      <Select value={config.strategyMode} onValueChange={(v: any) => updateConfigMutation.mutate({ strategyMode: v })}>
                        <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto — run all, take the best signal</SelectItem>
                          <SelectItem value="orb">Opening Range Breakout</SelectItem>
                          <SelectItem value="volume_profile">Volume Profile (POC / Value Area)</SelectItem>
                          <SelectItem value="breakout">N-Day High/Low Breakout</SelectItem>
                          <SelectItem value="momentum">Daily Momentum</SelectItem>
                          <SelectItem value="order_flow">Order Flow / CVD Proxy (Scalp)</SelectItem>
                          <SelectItem value="long_call">Long Call (manual)</SelectItem>
                          <SelectItem value="long_put">Long Put (manual)</SelectItem>
                          <SelectItem value="credit_spread">Credit Spread (roadmap)</SelectItem>
                          <SelectItem value="covered_call">Covered Call (roadmap)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Direction filter</Label>
                      <Select value={config.directionFilter} onValueChange={(v: any) => updateConfigMutation.mutate({ directionFilter: v })}>
                        <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="both">Calls + Puts</SelectItem>
                          <SelectItem value="calls_only">Calls only</SelectItem>
                          <SelectItem value="puts_only">Puts only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Strategy-specific parameters */}
                    {(config.strategyMode === 'orb' || config.strategyMode === 'auto') && (
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">ORB range (minutes)</Label>
                        <Input
                          type="number" min={5} max={60}
                          defaultValue={config.orbRangeMinutes}
                          onBlur={(e) => updateConfigMutation.mutate({ orbRangeMinutes: parseInt(e.target.value, 10) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    )}
                    {(config.strategyMode === 'volume_profile' || config.strategyMode === 'auto') && (
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Volume profile lookback (days)</Label>
                        <Input
                          type="number" min={3} max={60}
                          defaultValue={config.volumeProfileLookbackDays}
                          onBlur={(e) => updateConfigMutation.mutate({ volumeProfileLookbackDays: parseInt(e.target.value, 10) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    )}
                    {(config.strategyMode === 'breakout' || config.strategyMode === 'auto') && (
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Breakout lookback (days)</Label>
                        <Input
                          type="number" min={5} max={120}
                          defaultValue={config.breakoutLookbackDays}
                          onBlur={(e) => updateConfigMutation.mutate({ breakoutLookbackDays: parseInt(e.target.value, 10) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    )}
                    {(config.strategyMode === 'order_flow' || config.strategyMode === 'auto') && (
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Order flow lookback (5-min bars)</Label>
                        <Input
                          type="number" min={10} max={100}
                          defaultValue={config.orderFlowLookbackBars}
                          onBlur={(e) => updateConfigMutation.mutate({ orderFlowLookbackBars: parseInt(e.target.value, 10) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                        <p className="text-[10px] text-gray-500">Uses a volume-delta proxy (no tick-level order flow available) + VWAP + market-structure imbalance to read buyer/seller pressure.</p>
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      <Switch checked={config.singleStrategyMode} onCheckedChange={(v) => updateConfigMutation.mutate({ singleStrategyMode: v })} disabled={config.strategyMode !== 'auto'} />
                      <Label className="text-xs text-gray-300">Single-strategy mode (no mixing, Auto only)</Label>
                    </div>
                  </div>
                </div>

                {/* ── Options Contract Preferences ── */}
                <div className="pt-4 border-t border-gray-800">
                  <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide mb-3">Options Contract Preferences</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Expiry preference</Label>
                      <Select value={config.expiryPreference} onValueChange={(v: any) => updateConfigMutation.mutate({ expiryPreference: v })}>
                        <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (within min/max range)</SelectItem>
                          <SelectItem value="0dte">0DTE (same-day)</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Strike selection</Label>
                      <Select value={config.strikeSelectionMode} onValueChange={(v: any) => updateConfigMutation.mutate({ strikeSelectionMode: v })}>
                        <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="atm">At-the-money</SelectItem>
                          <SelectItem value="itm">In-the-money</SelectItem>
                          <SelectItem value="otm">Out-of-the-money</SelectItem>
                          <SelectItem value="delta_target">Target delta</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {config.strikeSelectionMode === 'delta_target' && (
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Target delta (0.05–0.95)</Label>
                        <Input
                          type="number" step="0.05" min="0.05" max="0.95"
                          defaultValue={config.targetDelta}
                          onBlur={(e) => updateConfigMutation.mutate({ targetDelta: parseFloat(e.target.value) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Days to expiry (min–max)</Label>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number" min={0} max={365}
                          defaultValue={config.minDaysToExpiry}
                          onBlur={(e) => updateConfigMutation.mutate({ minDaysToExpiry: parseInt(e.target.value, 10) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                        <span className="text-gray-500 text-xs">to</span>
                        <Input
                          type="number" min={1} max={365}
                          defaultValue={config.maxDaysToExpiry}
                          onBlur={(e) => updateConfigMutation.mutate({ maxDaysToExpiry: parseInt(e.target.value, 10) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Profit target (% of premium)</Label>
                      <Input
                        type="number" min={5} max={500}
                        defaultValue={config.profitTargetPercent}
                        onBlur={(e) => updateConfigMutation.mutate({ profitTargetPercent: parseFloat(e.target.value) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Stop loss (% of premium)</Label>
                      <Input
                        type="number" min={5} max={100}
                        defaultValue={config.stopLossPercent}
                        onBlur={(e) => updateConfigMutation.mutate({ stopLossPercent: parseFloat(e.target.value) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Max IV rank to enter (0–100)</Label>
                      <Input
                        type="number" min={0} max={100}
                        defaultValue={config.ivRankMax}
                        onBlur={(e) => updateConfigMutation.mutate({ ivRankMax: parseFloat(e.target.value) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Position Sizing & Confidence ── */}
                <div className="pt-4 border-t border-gray-800">
                  <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide mb-3">Position Sizing & Confidence</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Execution source</Label>
                      <Select value={config.executionSource} onValueChange={(v: any) => updateConfigMutation.mutate({ executionSource: v })}>
                        <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="auto">Auto (any connected)</SelectItem>
                          <SelectItem value="alpaca">Alpaca only</SelectItem>
                          <SelectItem value="tastytrade">TastyTrade only</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Max open positions</Label>
                      <Input
                        type="number" min={1} max={20}
                        defaultValue={config.maxOpenPositions}
                        onBlur={(e) => updateConfigMutation.mutate({ maxOpenPositions: parseInt(e.target.value, 10) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Max contracts / trade</Label>
                      <Input
                        type="number" min={1} max={50}
                        defaultValue={config.maxContractsPerTrade}
                        onBlur={(e) => updateConfigMutation.mutate({ maxContractsPerTrade: parseInt(e.target.value, 10) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Risk per trade (%)</Label>
                      <Input
                        type="number" step="0.1" min="0.1" max="20"
                        defaultValue={config.riskPerTrade}
                        onBlur={(e) => updateConfigMutation.mutate({ riskPerTrade: parseFloat(e.target.value) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Min confidence score (0–100)</Label>
                      <Input
                        type="number" min={0} max={100}
                        defaultValue={config.minConfidence}
                        onBlur={(e) => updateConfigMutation.mutate({ minConfidence: parseFloat(e.target.value) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Session & Safety ── */}
                <div className="pt-4 border-t border-gray-800">
                  <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide mb-3">Session & Safety</h4>
                  <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Daily loss limit (%, 0 = off)</Label>
                      <Input
                        type="number" step="0.5" min="0" max="50"
                        defaultValue={config.dailyLossLimit}
                        onBlur={(e) => updateConfigMutation.mutate({ dailyLossLimit: parseFloat(e.target.value) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-400">Max daily trades (0 = unlimited)</Label>
                      <Input
                        type="number" min={0} max={100}
                        defaultValue={config.maxDailyTrades}
                        onBlur={(e) => updateConfigMutation.mutate({ maxDailyTrades: parseInt(e.target.value, 10) })}
                        className="bg-gray-800 border-gray-700 h-8 text-sm"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={config.sessionFilterEnabled} onCheckedChange={(v) => updateConfigMutation.mutate({ sessionFilterEnabled: v })} />
                      <Label className="text-xs text-gray-300">Session filter (skip volatile open/pin-risk close)</Label>
                    </div>
                    {config.sessionFilterEnabled && (
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Avoid last N minutes before close</Label>
                        <Input
                          type="number" min={0} max={60}
                          defaultValue={config.avoidLastMinutesBeforeClose}
                          onBlur={(e) => updateConfigMutation.mutate({ avoidLastMinutesBeforeClose: parseInt(e.target.value, 10) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <Switch checked={config.propFirmMode} onCheckedChange={(v) => updateConfigMutation.mutate({ propFirmMode: v })} />
                      <Label className="text-xs text-gray-300">Prop-firm mode</Label>
                    </div>
                    {config.propFirmMode && (
                      <div className="space-y-2">
                        <Label className="text-xs text-gray-400">Daily drawdown limit (%)</Label>
                        <Input
                          type="number" step="0.5" min="0.5" max="20"
                          defaultValue={config.propFirmDailyDrawdownLimit}
                          onBlur={(e) => updateConfigMutation.mutate({ propFirmDailyDrawdownLimit: parseFloat(e.target.value) })}
                          className="bg-gray-800 border-gray-700 h-8 text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Acceleration ── */}
                <div className="pt-4 border-t border-gray-800">
                  <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide mb-3">Acceleration</h4>
                  <div className="flex items-center gap-6 flex-wrap">
                    <div className="flex items-center gap-2">
                      <Switch checked={config.enableCompounding} onCheckedChange={(v) => updateConfigMutation.mutate({ enableCompounding: v })} />
                      <Label className="text-xs text-gray-300">Enable compounding</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={config.adaptiveScanInterval} onCheckedChange={(v) => updateConfigMutation.mutate({ adaptiveScanInterval: v })} />
                      <Label className="text-xs text-gray-300">Adaptive scan interval</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={config.enablePyramiding} onCheckedChange={(v) => updateConfigMutation.mutate({ enablePyramiding: v })} />
                      <Label className="text-xs text-gray-300">Enable pyramiding</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={config.lockSettings} onCheckedChange={(v) => updateConfigMutation.mutate({ lockSettings: v })} />
                      <Label className="text-xs text-gray-300">Lock settings (no auto-adjust)</Label>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

          </TabsContent>

          <TabsContent value="brain" className="mt-0 space-y-6">
            {/* ── Self-Learning Brain ── */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-400" /> Self-Learning Brain
                    {brainStatus?.learned && (
                      <Badge variant="outline" className="text-[10px] font-mono">{brainStatus.totalTradesAnalyzed} trades</Badge>
                    )}
                  </span>
                  <Button size="sm" onClick={() => learnMutation.mutate()} disabled={learnMutation.isPending}>
                    {learnMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Brain className="w-3.5 h-3.5 mr-1.5" />}
                    {brainStatus?.learned ? 'Re-Learn' : 'Train Brain'}
                  </Button>
                </CardTitle>
                <CardDescription>Learns per-underlying win rate, direction bias, best hours, and best strategies from your closed trade history — same self-learning system as the FX SS AI Engine.</CardDescription>
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
                        <p className="text-[10px] uppercase tracking-wide text-gray-500">Underlyings</p>
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

                    {brainStatus.contractKnowledge && Object.keys(brainStatus.contractKnowledge).length > 0 && (
                      <div className="space-y-1.5">
                        <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Per-Underlying Knowledge</h4>
                        <div className="space-y-2">
                          {Object.entries(brainStatus.contractKnowledge).map(([symbol, k]) => (
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

            {/* ── Source breakdown + top setups (last 30 days) ── */}
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
                          <p className="text-[10px] uppercase tracking-wide text-gray-500">{s.strategy.replace('_', ' ')}</p>
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
                              <th className="text-right font-medium py-1.5">Avg Return</th>
                            </tr>
                          </thead>
                          <tbody>
                            {brainSummary.topSetups.map((s, i) => (
                              <tr key={i} className="border-b border-gray-800/50">
                                <td className="py-1.5 pr-3 font-bold text-white">{s.symbol}</td>
                                <td className="py-1.5 pr-3 text-gray-400">{s.strategy.replace('_', ' ')}</td>
                                <td className="py-1.5 pr-3 text-right font-mono text-gray-400">{s.trades}</td>
                                <td className={`py-1.5 pr-3 text-right font-mono font-bold ${s.winRate >= 60 ? 'text-emerald-400' : s.winRate >= 40 ? 'text-amber-400' : 'text-red-400'}`}>{s.winRate}%</td>
                                <td className={`py-1.5 text-right font-mono ${s.avgReturnPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{s.avgReturnPct >= 0 ? '+' : ''}{s.avgReturnPct.toFixed(1)}%</td>
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

          <TabsContent value="consensus" className="mt-0">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <Swords className="w-4 h-4 text-purple-400" /> Dual-Vote Consensus
                  </span>
                  {consensusData?.updatedAt && (
                    <span className="text-[10px] text-gray-500 font-normal">Last signal: {new Date(consensusData.updatedAt).toLocaleTimeString()}</span>
                  )}
                </CardTitle>
                <CardDescription>Quant Rules Agent + AI Agent — both must agree to fire a trade (unless the engine is set to rule-based mode).</CardDescription>
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
                                  <span className="text-[10px] text-gray-500">{c.strategy.replace('_', ' ')}</span>
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
                                <span className={c.tradeAllowed ? 'text-emerald-400' : 'text-red-400'}>
                                  {c.tradeAllowed ? '✓ Allowed' : '✗ Blocked'}
                                </span>
                              </div>
                              {c.aiReasoning && <p className="text-[10px] text-gray-500 mt-1 leading-relaxed">{c.aiReasoning}</p>}
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

          <TabsContent value="feed" className="mt-0">
        {/* ── Executed trades — open positions + recent history ── */}
        <Card className="bg-gray-900 border-gray-800 mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-400" /> Executed Trades
            </CardTitle>
            <CardDescription>Real orders placed by the engine when a signal fires with Auto-execute on.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tradesLoading ? (
              <p className="text-xs text-gray-500">Loading trades...</p>
            ) : (
              <>
                <div>
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Open ({openTrades.length})</h4>
                  {openTrades.length === 0 ? (
                    <p className="text-xs text-gray-500">No open positions.</p>
                  ) : (
                    <div className="space-y-2">
                      {openTrades.map(t => (
                        <div key={t.id} className="p-2.5 rounded-lg border border-emerald-700/20 bg-emerald-900/5 flex items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-bold text-white">{t.underlyingSymbol} <span className="text-xs font-normal text-gray-400">{t.optionSymbol}</span></p>
                            <p className="text-[10px] text-gray-500">{t.quantity}x {t.optionType} @ ${t.entryPrice.toFixed(2)} · {t.strategy.replace('_', ' ')} · {t.broker}</p>
                          </div>
                          <span className="text-[10px] text-gray-500 shrink-0">{new Date(t.createdAt).toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-2">Recent Closed</h4>
                  {closedTrades.length === 0 ? (
                    <p className="text-xs text-gray-500">No closed trades yet.</p>
                  ) : (
                    <div className="space-y-2 max-h-[280px] overflow-y-auto">
                      {closedTrades.map(t => (
                        <div key={t.id} className={`p-2.5 rounded-lg border flex items-center justify-between gap-2 ${(t.realizedPnl ?? 0) >= 0 ? 'border-emerald-700/20 bg-emerald-900/5' : 'border-red-700/20 bg-red-900/5'}`}>
                          <div>
                            <p className="text-sm font-bold text-white">{t.underlyingSymbol} <span className="text-xs font-normal text-gray-400">{t.optionSymbol}</span></p>
                            <p className="text-[10px] text-gray-500">{t.quantity}x {t.optionType} · entry ${t.entryPrice.toFixed(2)} → exit ${t.exitPrice?.toFixed(2) ?? '—'} · {t.exitReason?.replace('_', ' ') ?? t.status}</p>
                          </div>
                          <span className={`text-sm font-mono font-bold shrink-0 ${(t.realizedPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.realizedPnl != null ? `${t.realizedPnl >= 0 ? '+' : ''}$${t.realizedPnl.toFixed(2)}` : '—'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Live decision feed — what the engine is seeing and why ── */}
        <Card className="bg-gray-900 border-gray-800 mt-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Radar className="w-4 h-4 text-emerald-400" /> Live Feed</span>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => refetchActivity()}>
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </CardTitle>
            <CardDescription>
              {config?.isActive
                ? 'What the engine is scanning right now and why it is (or isn\'t) acting — refreshes every 15s.'
                : 'Activate the engine above to start scanning. Rule-based on momentum today; AI-driven strategy scoring is next.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activityLoading ? (
              <p className="text-xs text-gray-500">Loading feed...</p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-gray-500">
                {config?.isActive ? 'No scans yet — the first cycle runs within a minute of activation.' : 'No activity yet.'}
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto">
                {activity.map((a) => {
                  const cfg = {
                    signal: { icon: TrendingUp, color: 'text-emerald-400', border: 'border-emerald-700/30', bg: 'bg-emerald-900/10' },
                    watching: { icon: Eye, color: 'text-blue-400', border: 'border-blue-700/20', bg: 'bg-gray-800/40' },
                    skipped: { icon: Ban, color: 'text-gray-500', border: 'border-gray-700/20', bg: 'bg-gray-800/20' },
                    error: { icon: AlertCircle, color: 'text-red-400', border: 'border-red-700/30', bg: 'bg-red-900/10' },
                  }[a.decision];
                  const Icon = cfg.icon;
                  return (
                    <div key={a.id} className={`p-2.5 rounded-lg border ${cfg.border} ${cfg.bg}`}>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                          <span className="text-sm font-bold text-white">{a.symbol}</span>
                          {a.strategy && <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/5 text-gray-400">{a.strategy.replace('_', ' ')}</span>}
                          {a.price != null && <span className="text-xs font-mono text-gray-400">${a.price.toFixed(2)}</span>}
                          {a.dailyChangePercent != null && (
                            <span className={`text-xs font-mono flex items-center gap-0.5 ${a.dailyChangePercent >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {a.dailyChangePercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {a.dailyChangePercent >= 0 ? '+' : ''}{a.dailyChangePercent.toFixed(2)}%
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-gray-500 shrink-0">{new Date(a.createdAt).toLocaleTimeString()}</span>
                      </div>
                      <p className="text-xs text-gray-400 leading-relaxed">{a.reasoning}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function extractErrorMsg(error: any): string {
  let msg = error?.message || 'Connection failed';
  try {
    const jsonStart = msg.indexOf('{');
    if (jsonStart !== -1) {
      const parsed = JSON.parse(msg.slice(jsonStart));
      msg = parsed.error || parsed.message || msg;
    }
  } catch {}
  return msg;
}
