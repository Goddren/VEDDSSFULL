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
import {
  ArrowLeft, Zap, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle2, XCircle, Trash2, TrendingUp,
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

type OptionsEngineConfig = {
  id: number;
  isActive: boolean;
  symbols: string[];
  scanIntervalMs: number;
  strategyMode: string;
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
          <CardContent>
            {configLoading || !config ? (
              <p className="text-xs text-gray-500">Loading settings...</p>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs text-gray-400">Underlyings to scan (comma-separated)</Label>
                  <Input
                    defaultValue={config.symbols.join(', ')}
                    onBlur={(e) => updateConfigMutation.mutate({ symbols: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) })}
                    className="bg-gray-800 border-gray-700 h-8 text-sm"
                  />
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
                  <Label className="text-xs text-gray-400">Strategy mode</Label>
                  <Select value={config.strategyMode} onValueChange={(v: any) => updateConfigMutation.mutate({ strategyMode: v })}>
                    <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (AI picks)</SelectItem>
                      <SelectItem value="long_call">Long Call</SelectItem>
                      <SelectItem value="long_put">Long Put</SelectItem>
                      <SelectItem value="credit_spread">Credit Spread</SelectItem>
                      <SelectItem value="covered_call">Covered Call</SelectItem>
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
                  <Label className="text-xs text-gray-400">Min AI confidence (0–100)</Label>
                  <Input
                    type="number" min={0} max={100}
                    defaultValue={config.minConfidence}
                    onBlur={(e) => updateConfigMutation.mutate({ minConfidence: parseFloat(e.target.value) })}
                    className="bg-gray-800 border-gray-700 h-8 text-sm"
                  />
                </div>
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

                <div className="md:col-span-2 flex items-center gap-6 flex-wrap pt-2 border-t border-gray-800">
                  <div className="flex items-center gap-2">
                    <Switch checked={config.propFirmMode} onCheckedChange={(v) => updateConfigMutation.mutate({ propFirmMode: v })} />
                    <Label className="text-xs text-gray-300">Prop-firm mode</Label>
                  </div>
                  {config.propFirmMode && (
                    <div className="flex items-center gap-2">
                      <Label className="text-xs text-gray-400 whitespace-nowrap">Daily drawdown limit (%)</Label>
                      <Input
                        type="number" step="0.5" min="0.5" max="20"
                        defaultValue={config.propFirmDailyDrawdownLimit}
                        onBlur={(e) => updateConfigMutation.mutate({ propFirmDailyDrawdownLimit: parseFloat(e.target.value) })}
                        className="bg-gray-800 border-gray-700 h-7 text-xs w-20"
                      />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Switch checked={config.enableCompounding} onCheckedChange={(v) => updateConfigMutation.mutate({ enableCompounding: v })} />
                    <Label className="text-xs text-gray-300">Enable compounding</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch checked={config.lockSettings} onCheckedChange={(v) => updateConfigMutation.mutate({ lockSettings: v })} />
                    <Label className="text-xs text-gray-300">Lock settings (no auto-adjust)</Label>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
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
