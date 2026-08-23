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
  ArrowLeft, RefreshCw, Eye, EyeOff, AlertCircle, CheckCircle2, XCircle, Trash2, TrendingUp,
  TrendingDown, Radar, Ban, Brain, Swords, Settings2, Coins,
} from "lucide-react";

// ── Types mirroring the server schema ───────────────────────────────────────
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

type CryptocomEngineConfig = {
  id: number;
  isActive: boolean;
  symbols: string[];
  scanIntervalMs: number;
  strategyMode: 'auto' | 'trend_following' | 'momentum' | 'order_flow' | 'volume_profile' | 'breakout';
  directionFilter: 'long_only' | 'short_only' | 'both';
  maxOpenTrades: number;
  riskPerTrade: number;
  minConfidence: number;
  accountBalance: number;
  leverage: number;
  dailyLossLimit: number;
  dailyProfitTarget: number;
  maxDailyTrades: number;
  lockSettings: boolean;
  aiMode: 'full' | 'economy' | 'rule_based';
  enableAutoExecution: boolean;
  useKellyCriterion: boolean;
  brainLearningMode: boolean;
  drawdownShieldThreshold: number;
  enableCompositeAutonomous: boolean;
  compositeMinEdgeScore: number;
  cryptoBrainEnabled: boolean;
  cryptoBrainGating: boolean;
  ruinGuardEnabled: boolean;
  dailyLossLimitPct: number;
  maxDrawdownLimitPct: number;
  executionVenue: 'cryptocom' | 'coinbase' | 'kraken' | 'gemini';
  cefiAutoTradeEnabled: boolean;
  cefiNotionalUsd: number;
  cefiTakeProfitPct: number;
  cefiStopLossPct: number;
  trailMethod: 'none' | 'fixed_r' | 'stepped_fixed' | 'profit_lock' | 'chandelier' | 'parabolic_sar' | 'r_multiple' | 'swing_structure';
  trailActivationR: number;
  trailFixedR: number;
  trailStepR: number;
  trailProfitLockPct: number;
  trailSarInitialAF: number;
  trailSarMaxAF: number;
  breakevenBufferR: number;
  consistencyEnforcementEnabled: boolean;
  consistencyMinProfitableDays: number;
  consistencyPeriodDays: number;
  maxDailyProfitPctOfTotal: number;
  smartSymbolEscalation: boolean;
  highConfidenceOverride: boolean;
};

type EngineActivity = {
  id: number;
  symbol: string;
  decision: 'watching' | 'signal' | 'skipped' | 'error';
  reasoning: string;
  score: number | null;
  price: number | null;
  dailyChangePercent: number | null;
  strategy: string | null;
  createdAt: string;
};

type EngineTrade = {
  id: number;
  symbol: string;
  strategy: string;
  direction: 'long' | 'short';
  quantity: number;
  entryPrice: number;
  status: 'open' | 'closed' | 'failed';
  exitPrice: number | null;
  exitReason: string | null;
  realizedPnl: number | null;
  createdAt: string;
  closedAt: string | null;
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

export default function CryptoEnginePage() {
  const { toast } = useToast();

  const [showCryptocomForm, setShowCryptocomForm] = useState(false);
  const [showCryptocomSecret, setShowCryptocomSecret] = useState(false);
  const [cryptocomForm, setCryptocomForm] = useState({ apiKey: '', apiSecret: '', instrumentType: 'perpetual' as 'perpetual' | 'future' | 'option', autoExecute: false });

  // ── Coinbase (read-only wallet) ──────────────────────────────────────────
  const [showCbForm, setShowCbForm] = useState(false);
  const [cbForm, setCbForm] = useState({ apiKeyName: '', privateKey: '', label: '' });
  const { data: cbData, isLoading: cbLoading } = useQuery<any>({
    queryKey: ['/api/coinbase/balances'],
    queryFn: async () => (await apiRequest('GET', '/api/coinbase/balances')).json(),
    retry: false,
  });
  const cbConnect = useMutation({
    mutationFn: async () => { const r = await apiRequest('POST', '/api/coinbase/connect', cbForm); if (!r.ok) throw new Error((await r.json()).error || 'Failed'); return r.json(); },
    onSuccess: () => { setCbForm({ apiKeyName: '', privateKey: '', label: '' }); setShowCbForm(false); queryClient.invalidateQueries({ queryKey: ['/api/coinbase/balances'] }); },
  });

  // Coinbase order ticket
  const [cbOrder, setCbOrder] = useState({ product: 'BTC-USD', side: 'BUY' as 'BUY' | 'SELL', type: 'market' as 'market' | 'limit', amount: '', limitPrice: '' });
  const [cbConfirm, setCbConfirm] = useState(false);
  const cbPlace = useMutation({
    mutationFn: async () => {
      const body: any = { product: cbOrder.product, side: cbOrder.side, type: cbOrder.type, confirm: true };
      if (cbOrder.type === 'market' && cbOrder.side === 'BUY') body.quoteSize = Number(cbOrder.amount);
      else body.baseSize = Number(cbOrder.amount);
      if (cbOrder.type === 'limit') body.limitPrice = Number(cbOrder.limitPrice);
      const r = await apiRequest('POST', '/api/coinbase/order', body);
      if (!r.ok) throw new Error((await r.json()).error || 'Order failed'); return r.json();
    },
    onSuccess: () => { setCbConfirm(false); setCbOrder(p => ({ ...p, amount: '', limitPrice: '' })); queryClient.invalidateQueries({ queryKey: ['/api/coinbase/balances'] }); },
  });

  // ── Kraken (read-only wallet) ────────────────────────────────────────────
  const [showKrForm, setShowKrForm] = useState(false);
  const [krForm, setKrForm] = useState({ apiKey: '', apiSecret: '', label: '' });
  const { data: krData, isLoading: krLoading } = useQuery<any>({
    queryKey: ['/api/kraken/balances'],
    queryFn: async () => (await apiRequest('GET', '/api/kraken/balances')).json(),
    retry: false,
  });
  const krConnect = useMutation({
    mutationFn: async () => { const r = await apiRequest('POST', '/api/kraken/connect', krForm); if (!r.ok) throw new Error((await r.json()).error || 'Failed'); return r.json(); },
    onSuccess: () => { setKrForm({ apiKey: '', apiSecret: '', label: '' }); setShowKrForm(false); queryClient.invalidateQueries({ queryKey: ['/api/kraken/balances'] }); },
  });

  // Kraken order ticket
  const [krOrder, setKrOrder] = useState({ pair: 'XBTUSD', type: 'buy' as 'buy' | 'sell', ordertype: 'market' as 'market' | 'limit', volume: '', price: '' });
  const [krConfirm, setKrConfirm] = useState(false);
  const krPlace = useMutation({
    mutationFn: async () => {
      const body: any = { pair: krOrder.pair, type: krOrder.type, ordertype: krOrder.ordertype, volume: Number(krOrder.volume), confirm: true };
      if (krOrder.ordertype === 'limit') body.price = Number(krOrder.price);
      const r = await apiRequest('POST', '/api/kraken/order', body);
      if (!r.ok) throw new Error((await r.json()).error || 'Order failed'); return r.json();
    },
    onSuccess: () => { setKrConfirm(false); setKrOrder(p => ({ ...p, volume: '', price: '' })); queryClient.invalidateQueries({ queryKey: ['/api/kraken/balances'] }); },
  });

  // ── Gemini (read-only wallet) ────────────────────────────────────────────
  const [showGmForm, setShowGmForm] = useState(false);
  const [gmForm, setGmForm] = useState({ apiKey: '', apiSecret: '', label: '' });
  const { data: gmData, isLoading: gmLoading } = useQuery<any>({
    queryKey: ['/api/gemini/balances'],
    queryFn: async () => (await apiRequest('GET', '/api/gemini/balances')).json(),
    retry: false,
  });
  const gmConnect = useMutation({
    mutationFn: async () => { const r = await apiRequest('POST', '/api/gemini/connect', gmForm); if (!r.ok) throw new Error((await r.json()).error || 'Failed'); return r.json(); },
    onSuccess: () => { setGmForm({ apiKey: '', apiSecret: '', label: '' }); setShowGmForm(false); queryClient.invalidateQueries({ queryKey: ['/api/gemini/balances'] }); },
  });

  // Gemini order ticket (limit-only; IOC = market-like)
  const [gmOrder, setGmOrder] = useState({ symbol: 'btcusd', side: 'buy' as 'buy' | 'sell', amount: '', price: '', ioc: true });
  const [gmConfirm, setGmConfirm] = useState(false);
  const gmPlace = useMutation({
    mutationFn: async () => {
      const r = await apiRequest('POST', '/api/gemini/order', { symbol: gmOrder.symbol, side: gmOrder.side, amount: Number(gmOrder.amount), price: Number(gmOrder.price), immediateOrCancel: gmOrder.ioc, confirm: true });
      if (!r.ok) throw new Error((await r.json()).error || 'Order failed'); return r.json();
    },
    onSuccess: () => { setGmConfirm(false); setGmOrder(p => ({ ...p, amount: '', price: '' })); queryClient.invalidateQueries({ queryKey: ['/api/gemini/balances'] }); },
  });

  // ── DeFi self-custody wallet (MetaMask / browser wallets, on-chain) ──────
  const [dfManual, setDfManual] = useState('');
  const [dfMsg, setDfMsg] = useState<string | null>(null);
  const { data: dfData, isLoading: dfLoading } = useQuery<any>({
    queryKey: ['/api/defi/balances'],
    queryFn: async () => (await apiRequest('GET', '/api/defi/balances')).json(),
    retry: false,
  });
  const dfSave = useMutation({
    mutationFn: async (payload: { address: string; walletType?: string }) => {
      const r = await apiRequest('POST', '/api/defi/connect', payload);
      if (!r.ok) throw new Error((await r.json()).error || 'Failed'); return r.json();
    },
    onSuccess: () => { setDfManual(''); setDfMsg(null); queryClient.invalidateQueries({ queryKey: ['/api/defi/balances'] }); },
    onError: (e: any) => setDfMsg(e.message),
  });
  const dfRemove = useMutation({
    mutationFn: async (id: number) => (await apiRequest('DELETE', `/api/defi/wallet/${id}`)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/defi/balances'] }),
  });
  const connectBrowserWallet = async () => {
    const eth = (typeof window !== 'undefined' ? (window as any).ethereum : null);
    if (!eth) { setDfMsg('No browser wallet found. Install MetaMask, use WalletConnect below, or paste an address to watch it.'); return; }
    try {
      setDfMsg('Approve the connection in your wallet…');
      const accounts = await eth.request({ method: 'eth_requestAccounts' });
      const address = accounts?.[0];
      if (!address) { setDfMsg('No account returned by the wallet.'); return; }
      const walletType = eth.isMetaMask ? 'MetaMask' : eth.isCoinbaseWallet ? 'Coinbase Wallet' : 'Browser wallet';
      dfSave.mutate({ address, walletType });
    } catch (e: any) { setDfMsg(e?.message || 'Wallet connection rejected.'); }
  };

  const [wcConnecting, setWcConnecting] = useState(false);
  const [wcQr, setWcQr] = useState<string | null>(null);
  const [wcUri, setWcUri] = useState<string | null>(null);
  const connectWalletConnect = async () => {
    try {
      setWcConnecting(true); setWcQr(null); setWcUri(null);
      setDfMsg('Loading WalletConnect…');
      const cfg = await (await apiRequest('GET', '/api/defi/walletconnect-config')).json();
      if (!cfg?.projectId) { setDfMsg('WalletConnect isn’t configured yet — set WALLETCONNECT_PROJECT_ID in the server env (free at cloud.reown.com), then reload.'); return; }
      const { EthereumProvider } = await import('@walletconnect/ethereum-provider');
      const provider: any = await EthereumProvider.init({
        projectId: cfg.projectId,
        chains: [1],
        optionalChains: [8453, 42161, 10, 137],
        showQrModal: false, // we render our own QR + link — more reliable than the bundled modal
        metadata: {
          name: 'VEDD', description: 'VEDD Trading Vault',
          url: typeof window !== 'undefined' ? window.location.origin : 'https://veddbuild.com',
          icons: ['https://veddbuild.com/icons/icon-192x192.png'],
        },
      });
      if (provider.session) { try { await provider.disconnect(); } catch { /* ignore */ } }
      // The pairing URI arrives via this event — render it as a QR + copyable link.
      provider.on('display_uri', async (uri: string) => {
        setWcUri(uri);
        // @ts-ignore — no @types/qrcode; runtime module is present.
        try { const QR: any = (await import('qrcode')).default; setWcQr(await QR.toDataURL(uri, { width: 240, margin: 1 })); } catch { /* URI/link still shown */ }
        setDfMsg('Scan the QR, or tap “Open in wallet” on mobile, then approve.');
      });
      let accts: string[] = [];
      try { accts = await provider.enable(); } catch (e: any) {
        setDfMsg(e?.message?.match(/reject|close|cancel/i) ? 'Connection cancelled in the wallet.' : (e?.message || 'WalletConnect handshake failed.'));
        return;
      }
      const address = accts?.[0] || provider.accounts?.[0] || (await provider.request({ method: 'eth_accounts' }).catch(() => []))?.[0];
      if (!address) { setDfMsg('Connected, but no account was returned. Reopen the wallet and approve account access.'); return; }
      setDfMsg('Wallet connected ✓ loading balances…');
      dfSave.mutate({ address, walletType: 'WalletConnect' });
    } catch (e: any) {
      setDfMsg(e?.message || 'WalletConnect connection failed.');
    } finally { setWcConnecting(false); setWcQr(null); setWcUri(null); }
  };

  // ── Crypto.com connection ────────────────────────────────────────────────
  const { data: cryptocomConnections = [], isLoading: cryptocomLoading } = useQuery<CryptocomConnection[]>({
    queryKey: ['/api/cryptocom/connections'],
    refetchInterval: 30000,
    staleTime: 0,
  });

  const createCryptocomMutation = useMutation({
    mutationFn: async (data: typeof cryptocomForm) => (await apiRequest('POST', '/api/cryptocom/connection', data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      setCryptocomForm({ apiKey: '', apiSecret: '', instrumentType: 'perpetual', autoExecute: false });
      setShowCryptocomForm(false);
      toast({ title: "Crypto.com connected", description: "Account linked for perpetuals execution." });
    },
    onError: (error: any) => toast({ title: "Crypto.com connection failed", description: extractErrorMsg(error), variant: "destructive" }),
  });

  const updateCryptocomMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CryptocomConnection> }) => (await apiRequest('PATCH', `/api/cryptocom/connection/${id}`, data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      toast({ title: "Settings updated" });
    },
  });

  const deleteCryptocomMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest('DELETE', `/api/cryptocom/connection/${id}`)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      toast({ title: "Connection removed" });
    },
  });

  const testCryptocomMutation = useMutation({
    mutationFn: async (id: number) => (await apiRequest('POST', `/api/cryptocom/test/${id}`)).json(),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom/connections'] });
      toast(data.success
        ? { title: "Crypto.com connection OK", description: `Available balance: $${Number(data.account?.availableBalance ?? 0).toLocaleString()}` }
        : { title: "Test failed", description: data.error, variant: "destructive" });
    },
  });

  // ── Engine config — full FX SS AI Engine parity ─────────────────────────
  const { data: config, isLoading: configLoading } = useQuery<CryptocomEngineConfig>({
    queryKey: ['/api/cryptocom-engine/config'],
    enabled: cryptocomConnections.length > 0,
  });
  const updateConfigMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => (await apiRequest('PATCH', '/api/cryptocom-engine/config', data)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/cryptocom-engine/config'] });
      toast({ title: "Crypto.com AI Engine updated" });
    },
  });

  // ── Live decision feed ───────────────────────────────────────────────────
  const { data: activityData, isLoading: activityLoading, refetch: refetchActivity } = useQuery<{ activity: EngineActivity[] }>({
    queryKey: ['/api/cryptocom-engine/activity'],
    refetchInterval: config?.isActive ? 15000 : false,
  });
  const activity = activityData?.activity ?? [];

  // ── Executed trades ──────────────────────────────────────────────────────
  const { data: tradesData, isLoading: tradesLoading } = useQuery<{ open: EngineTrade[]; recent: EngineTrade[] }>({
    queryKey: ['/api/cryptocom-engine/trades'],
    refetchInterval: config?.isActive ? 15000 : false,
  });
  const openTrades = tradesData?.open ?? [];
  const closedTrades = (tradesData?.recent ?? []).filter(t => t.status !== 'open');

  // ── Dual-Vote Consensus ──────────────────────────────────────────────────
  const { data: consensusData, isLoading: consensusLoading } = useQuery<ConsensusData>({
    queryKey: ['/api/cryptocom-engine/consensus'],
    refetchInterval: config?.isActive ? 15000 : false,
  });

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-4xl mx-auto px-4 pt-6">
        <Link href="/options-engine" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to AI Trading Engines
        </Link>

        <div className="flex items-center gap-2.5 mb-1">
          <Coins className="w-6 h-6 text-amber-400" />
          <h1 className="text-xl font-bold">Crypto.com Perpetuals AI Engine</h1>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Full FX SS AI Engine parity for crypto perpetuals — pick your tokens, strategy, and risk per trade, then watch the live decision feed.
        </p>

        <Tabs defaultValue="setup" className="w-full">
          <TabsList className="grid grid-cols-3 mb-6">
            <TabsTrigger value="setup" className="flex items-center gap-1.5"><Settings2 className="w-3.5 h-3.5" /> Setup & Config</TabsTrigger>
            <TabsTrigger value="consensus" className="flex items-center gap-1.5"><Swords className="w-3.5 h-3.5" /> Consensus</TabsTrigger>
            <TabsTrigger value="feed" className="flex items-center gap-1.5"><Radar className="w-3.5 h-3.5" /> Live Feed</TabsTrigger>
          </TabsList>

          {/* ══════════════════════ SETUP & CONFIG ══════════════════════ */}
          <TabsContent value="setup" className="mt-0 space-y-6">
            {/* Coinbase read-only wallet */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Coinbase Wallet</span>
                  <Badge variant="outline" className="text-[10px] border-blue-700 text-blue-400">Read-only balances</Badge>
                </CardTitle>
                <CardDescription>Connect a Coinbase CDP API key (key name + EC private key) to see balances. Read-only — no trading. Your private key is encrypted at rest and never shown again.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {cbData?.connections?.length > 0 && (
                  <div className="rounded-lg border border-blue-800/40 bg-blue-500/[0.06] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-blue-300">Total ≈ ${(cbData.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-gray-500">{cbLoading ? 'refreshing…' : 'live'}</span>
                    </div>
                    {cbData.connections.map((c: any) => (
                      <div key={c.id} className="mb-2">
                        {c.error ? <p className="text-[11px] text-red-400">Error: {c.error}</p> : (
                          <div className="space-y-1">
                            {(c.balances ?? []).slice(0, 8).map((b: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-gray-300 font-medium">{b.currency}</span>
                                <span className="text-gray-400 font-mono">{b.total.toLocaleString(undefined, { maximumFractionDigits: 6 })}{b.usdValue != null && <span className="text-gray-500"> · ${b.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}</span>
                              </div>
                            ))}
                            {(c.balances ?? []).length === 0 && <p className="text-[11px] text-gray-500">No non-zero balances.</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {cbData?.connections?.length > 0 && !cbData.connections[0]?.error && (
                  <div className="rounded-lg border border-blue-800/30 bg-black/20 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-blue-300">Trade (spot)</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Product (BTC-USD)" value={cbOrder.product} onChange={(e) => setCbOrder(p => ({ ...p, product: e.target.value.toUpperCase() }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                      <select value={cbOrder.side} onChange={(e) => setCbOrder(p => ({ ...p, side: e.target.value as any }))} className="bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2"><option value="BUY">Buy</option><option value="SELL">Sell</option></select>
                      <select value={cbOrder.type} onChange={(e) => setCbOrder(p => ({ ...p, type: e.target.value as any }))} className="bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2"><option value="market">Market</option><option value="limit">Limit</option></select>
                      <Input placeholder={cbOrder.type === 'market' && cbOrder.side === 'BUY' ? 'USD to spend' : 'Coin amount'} value={cbOrder.amount} onChange={(e) => setCbOrder(p => ({ ...p, amount: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                      {cbOrder.type === 'limit' && <Input placeholder="Limit price" value={cbOrder.limitPrice} onChange={(e) => setCbOrder(p => ({ ...p, limitPrice: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm col-span-2" />}
                    </div>
                    {cbPlace.isError && <p className="text-[11px] text-red-400">{(cbPlace.error as Error)?.message}</p>}
                    {cbPlace.isSuccess && <p className="text-[11px] text-emerald-400">Order placed ✓</p>}
                    {!cbConfirm ? (
                      <button onClick={() => setCbConfirm(true)} disabled={!cbOrder.amount} className={`w-full text-sm font-bold py-1.5 rounded-lg ${cbOrder.side === 'BUY' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-white disabled:opacity-50`}>{cbOrder.side} {cbOrder.product}</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => cbPlace.mutate()} disabled={cbPlace.isPending} className="flex-1 text-sm font-bold py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white">{cbPlace.isPending ? 'Placing…' : `Confirm ${cbOrder.side} ${cbOrder.amount}${cbOrder.type === 'market' && cbOrder.side === 'BUY' ? ' USD' : ''}`}</button>
                        <button onClick={() => setCbConfirm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-600">Live order on your Coinbase account — requires "trade" permission on the key.</p>
                  </div>
                )}
                {!showCbForm ? (
                  <button onClick={() => setShowCbForm(true)} className="text-sm text-blue-400 hover:text-blue-300">+ Connect Coinbase (read-only)</button>
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="API key name (organizations/…/apiKeys/…)" value={cbForm.apiKeyName} onChange={(e) => setCbForm(p => ({ ...p, apiKeyName: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    <textarea placeholder="EC private key (-----BEGIN EC PRIVATE KEY----- …)" value={cbForm.privateKey} onChange={(e) => setCbForm(p => ({ ...p, privateKey: e.target.value }))} rows={4} className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono text-white" />
                    <Input placeholder="Label (optional)" value={cbForm.label} onChange={(e) => setCbForm(p => ({ ...p, label: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    {cbConnect.isError && <p className="text-[11px] text-red-400">{(cbConnect.error as Error)?.message}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => cbConnect.mutate()} disabled={cbConnect.isPending || !cbForm.apiKeyName || !cbForm.privateKey} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60">{cbConnect.isPending ? 'Verifying…' : 'Connect'}</button>
                      <button onClick={() => setShowCbForm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
                    </div>
                    <p className="text-[10px] text-gray-500">Create a read-only CDP key at coinbase.com → Developer Platform. Grant only "view" permissions.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Kraken read-only wallet */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Kraken Wallet</span>
                  <Badge variant="outline" className="text-[10px] border-violet-700 text-violet-400">Read-only balances</Badge>
                </CardTitle>
                <CardDescription>Connect a Kraken API key (key + private key) with "Query Funds" permission only. Read-only — no trading. Your secret is encrypted at rest.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {krData?.connections?.length > 0 && (
                  <div className="rounded-lg border border-violet-800/40 bg-violet-500/[0.06] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-violet-300">Total ≈ ${(krData.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-gray-500">{krLoading ? 'refreshing…' : 'live'}</span>
                    </div>
                    {krData.connections.map((c: any) => (
                      <div key={c.id}>
                        {c.error ? <p className="text-[11px] text-red-400">Error: {c.error}</p> : (
                          <div className="space-y-1">
                            {(c.balances ?? []).slice(0, 8).map((b: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-gray-300 font-medium">{b.currency}</span>
                                <span className="text-gray-400 font-mono">{b.total.toLocaleString(undefined, { maximumFractionDigits: 6 })}{b.usdValue != null && <span className="text-gray-500"> · ${b.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}</span>
                              </div>
                            ))}
                            {(c.balances ?? []).length === 0 && <p className="text-[11px] text-gray-500">No non-zero balances.</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {krData?.connections?.length > 0 && !krData.connections[0]?.error && (
                  <div className="rounded-lg border border-violet-800/30 bg-black/20 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-violet-300">Trade</p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Pair (XBTUSD)" value={krOrder.pair} onChange={(e) => setKrOrder(p => ({ ...p, pair: e.target.value.toUpperCase() }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                      <select value={krOrder.type} onChange={(e) => setKrOrder(p => ({ ...p, type: e.target.value as any }))} className="bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2"><option value="buy">Buy</option><option value="sell">Sell</option></select>
                      <select value={krOrder.ordertype} onChange={(e) => setKrOrder(p => ({ ...p, ordertype: e.target.value as any }))} className="bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2"><option value="market">Market</option><option value="limit">Limit</option></select>
                      <Input placeholder="Volume (coin)" value={krOrder.volume} onChange={(e) => setKrOrder(p => ({ ...p, volume: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                      {krOrder.ordertype === 'limit' && <Input placeholder="Limit price" value={krOrder.price} onChange={(e) => setKrOrder(p => ({ ...p, price: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm col-span-2" />}
                    </div>
                    {krPlace.isError && <p className="text-[11px] text-red-400">{(krPlace.error as Error)?.message}</p>}
                    {krPlace.isSuccess && <p className="text-[11px] text-emerald-400">Order placed ✓</p>}
                    {!krConfirm ? (
                      <button onClick={() => setKrConfirm(true)} disabled={!krOrder.volume} className={`w-full text-sm font-bold py-1.5 rounded-lg ${krOrder.type === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-white disabled:opacity-50`}>{krOrder.type.toUpperCase()} {krOrder.pair}</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => krPlace.mutate()} disabled={krPlace.isPending} className="flex-1 text-sm font-bold py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white">{krPlace.isPending ? 'Placing…' : `Confirm ${krOrder.type} ${krOrder.volume}`}</button>
                        <button onClick={() => setKrConfirm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-600">Live order on your Kraken account — requires "Create & modify orders" permission.</p>
                  </div>
                )}
                {!showKrForm ? (
                  <button onClick={() => setShowKrForm(true)} className="text-sm text-violet-400 hover:text-violet-300">+ Connect Kraken (read-only)</button>
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="API key" value={krForm.apiKey} onChange={(e) => setKrForm(p => ({ ...p, apiKey: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    <Input placeholder="Private key (base64 secret)" value={krForm.apiSecret} onChange={(e) => setKrForm(p => ({ ...p, apiSecret: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    <Input placeholder="Label (optional)" value={krForm.label} onChange={(e) => setKrForm(p => ({ ...p, label: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    {krConnect.isError && <p className="text-[11px] text-red-400">{(krConnect.error as Error)?.message}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => krConnect.mutate()} disabled={krConnect.isPending || !krForm.apiKey || !krForm.apiSecret} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white disabled:opacity-60">{krConnect.isPending ? 'Verifying…' : 'Connect'}</button>
                      <button onClick={() => setShowKrForm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
                    </div>
                    <p className="text-[10px] text-gray-500">Create an API key at kraken.com → Settings → API. Enable only "Query Funds".</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Gemini read-only wallet */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Gemini Wallet</span>
                  <Badge variant="outline" className="text-[10px] border-teal-700 text-teal-400">Read-only balances</Badge>
                </CardTitle>
                <CardDescription>Connect a Gemini API key (key + secret) with "Auditor" (read-only) scope. No trading. Your secret is encrypted at rest.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {gmData?.connections?.length > 0 && (
                  <div className="rounded-lg border border-teal-800/40 bg-teal-500/[0.06] p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-teal-300">Total ≈ ${(gmData.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-gray-500">{gmLoading ? 'refreshing…' : 'live'}</span>
                    </div>
                    {gmData.connections.map((c: any) => (
                      <div key={c.id}>
                        {c.error ? <p className="text-[11px] text-red-400">Error: {c.error}</p> : (
                          <div className="space-y-1">
                            {(c.balances ?? []).slice(0, 8).map((b: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-gray-300 font-medium">{b.currency}</span>
                                <span className="text-gray-400 font-mono">{b.total.toLocaleString(undefined, { maximumFractionDigits: 6 })}{b.usdValue != null && <span className="text-gray-500"> · ${b.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}</span>
                              </div>
                            ))}
                            {(c.balances ?? []).length === 0 && <p className="text-[11px] text-gray-500">No non-zero balances.</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {gmData?.connections?.length > 0 && !gmData.connections[0]?.error && (
                  <div className="rounded-lg border border-teal-800/30 bg-black/20 p-3 space-y-2">
                    <p className="text-[11px] font-bold text-teal-300">Trade <span className="text-gray-500 font-normal">(limit — Gemini is limit-only)</span></p>
                    <div className="grid grid-cols-2 gap-2">
                      <Input placeholder="Symbol (btcusd)" value={gmOrder.symbol} onChange={(e) => setGmOrder(p => ({ ...p, symbol: e.target.value.toLowerCase() }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                      <select value={gmOrder.side} onChange={(e) => setGmOrder(p => ({ ...p, side: e.target.value as any }))} className="bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2"><option value="buy">Buy</option><option value="sell">Sell</option></select>
                      <Input placeholder="Amount (coin)" value={gmOrder.amount} onChange={(e) => setGmOrder(p => ({ ...p, amount: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                      <Input placeholder="Limit price" value={gmOrder.price} onChange={(e) => setGmOrder(p => ({ ...p, price: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    </div>
                    <label className="flex items-center gap-2 text-[11px] text-gray-400"><input type="checkbox" checked={gmOrder.ioc} onChange={(e) => setGmOrder(p => ({ ...p, ioc: e.target.checked }))} /> Immediate-or-cancel (fill now at/through the price, like market)</label>
                    {gmPlace.isError && <p className="text-[11px] text-red-400">{(gmPlace.error as Error)?.message}</p>}
                    {gmPlace.isSuccess && <p className="text-[11px] text-emerald-400">Order placed ✓</p>}
                    {!gmConfirm ? (
                      <button onClick={() => setGmConfirm(true)} disabled={!gmOrder.amount || !gmOrder.price} className={`w-full text-sm font-bold py-1.5 rounded-lg ${gmOrder.side === 'buy' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-red-600 hover:bg-red-500'} text-white disabled:opacity-50`}>{gmOrder.side.toUpperCase()} {gmOrder.symbol.toUpperCase()}</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={() => gmPlace.mutate()} disabled={gmPlace.isPending} className="flex-1 text-sm font-bold py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white">{gmPlace.isPending ? 'Placing…' : `Confirm ${gmOrder.side} ${gmOrder.amount} @ ${gmOrder.price}`}</button>
                        <button onClick={() => setGmConfirm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
                      </div>
                    )}
                    <p className="text-[10px] text-gray-600">Live order on your Gemini account — requires "Trading" scope on the key.</p>
                  </div>
                )}
                {!showGmForm ? (
                  <button onClick={() => setShowGmForm(true)} className="text-sm text-teal-400 hover:text-teal-300">+ Connect Gemini (read-only)</button>
                ) : (
                  <div className="space-y-2">
                    <Input placeholder="API key (account-…)" value={gmForm.apiKey} onChange={(e) => setGmForm(p => ({ ...p, apiKey: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    <Input placeholder="API secret" value={gmForm.apiSecret} onChange={(e) => setGmForm(p => ({ ...p, apiSecret: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    <Input placeholder="Label (optional)" value={gmForm.label} onChange={(e) => setGmForm(p => ({ ...p, label: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                    {gmConnect.isError && <p className="text-[11px] text-red-400">{(gmConnect.error as Error)?.message}</p>}
                    <div className="flex gap-2">
                      <button onClick={() => gmConnect.mutate()} disabled={gmConnect.isPending || !gmForm.apiKey || !gmForm.apiSecret} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-60">{gmConnect.isPending ? 'Verifying…' : 'Connect'}</button>
                      <button onClick={() => setShowGmForm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
                    </div>
                    <p className="text-[10px] text-gray-500">Create an API key at gemini.com → Settings → API. Use "Auditor" (read-only) scope.</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* DeFi self-custody wallet (on-chain, read-only) */}
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>DeFi Wallet</span>
                  <Badge variant="outline" className="text-[10px] border-orange-700 text-orange-400">On-chain · read-only</Badge>
                </CardTitle>
                <CardDescription>Connect MetaMask or a browser wallet (or paste any address to watch). Reads native + major token balances across Ethereum, Base, Arbitrum, Optimism & Polygon. Self-custody — only your public address is stored, never keys.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {dfData?.wallets?.length > 0 && (
                  <div className="rounded-lg border border-orange-800/40 bg-orange-500/[0.06] p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold text-orange-300">Total ≈ ${(dfData.totalUsd ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <span className="text-[10px] text-gray-500">{dfLoading ? 'syncing…' : 'on-chain'}</span>
                    </div>
                    {dfData.wallets.map((w: any) => (
                      <div key={w.id} className="border-t border-orange-800/20 pt-2 first:border-0 first:pt-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[11px] font-mono text-gray-400">{w.address?.slice(0, 6)}…{w.address?.slice(-4)}</span>
                          <button onClick={() => dfRemove.mutate(w.id)} className="text-[10px] text-gray-600 hover:text-red-400">remove</button>
                        </div>
                        {w.error ? <p className="text-[11px] text-red-400">{w.error}</p> : (
                          <div className="space-y-1">
                            {(w.holdings ?? []).slice(0, 12).map((h: any, i: number) => (
                              <div key={i} className="flex items-center justify-between text-xs">
                                <span className="text-gray-300 font-medium">{h.symbol} <span className="text-gray-600 text-[10px]">{h.chain}</span></span>
                                <span className="text-gray-400 font-mono">{h.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}{h.usdValue != null && <span className="text-gray-500"> · ${h.usdValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>}</span>
                              </div>
                            ))}
                            {(w.holdings ?? []).length === 0 && <p className="text-[11px] text-gray-500">No balances found on the scanned chains.</p>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={connectBrowserWallet} disabled={dfSave.isPending} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white disabled:opacity-60">
                    {dfSave.isPending ? 'Connecting…' : 'Connect MetaMask / browser wallet'}
                  </button>
                  <button onClick={connectWalletConnect} disabled={wcConnecting || dfSave.isPending} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-[#3b99fc] hover:bg-[#2f86e0] text-white disabled:opacity-60">
                    {wcConnecting ? 'Opening…' : 'WalletConnect (mobile)'}
                  </button>
                </div>
                {(wcQr || wcUri) && (
                  <div className="rounded-lg border border-[#3b99fc]/30 bg-[#3b99fc]/[0.06] p-3 flex flex-col items-center gap-2">
                    {wcQr && <img src={wcQr} alt="WalletConnect QR" className="w-44 h-44 rounded-lg bg-white p-1" />}
                    <p className="text-[11px] text-gray-400 text-center">Scan with your wallet app, or on mobile:</p>
                    <div className="flex gap-2">
                      {wcUri && <a href={wcUri} className="text-xs font-bold px-3 py-1.5 rounded-lg bg-[#3b99fc] text-white">Open in wallet</a>}
                      {wcUri && <button onClick={() => navigator.clipboard?.writeText(wcUri)} className="text-xs px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300">Copy link</button>}
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <Input placeholder="…or paste any 0x address to watch" value={dfManual} onChange={(e) => setDfManual(e.target.value)} className="bg-gray-800 border-gray-700 h-8 text-sm font-mono" />
                  <button onClick={() => dfManual && dfSave.mutate({ address: dfManual.trim(), walletType: 'Watched' })} disabled={dfSave.isPending || !dfManual} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-300 disabled:opacity-60 shrink-0">Add</button>
                </div>
                {dfMsg && <p className="text-[11px] text-amber-400">{dfMsg}</p>}
                <p className="text-[10px] text-gray-500">Scans Ethereum, Base, Arbitrum, Optimism &amp; Polygon. With an Alchemy key set (ALCHEMY_API_KEY) it shows EVERY token you hold; otherwise native coins + majors (USDC/USDT/DAI/WBTC) via public RPCs.</p>
              </CardContent>
            </Card>

            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span>Crypto.com Connection</span>
                  <Badge variant="outline" className="text-[10px] border-amber-700 text-amber-400">API Key + Secret</Badge>
                </CardTitle>
                <CardDescription>HMAC-signed API Key + Secret Key — no OAuth, no broker login page.</CardDescription>
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
                          <p className="text-[10px] text-gray-500 uppercase">{conn.instrumentType} · {conn.tradeCount} trades</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {conn.lastError ? (
                            <XCircle className="w-4 h-4 text-red-400" />
                          ) : conn.lastConnectedAt ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : null}
                        </div>
                      </div>
                      {conn.lastError && <p className="text-[10px] text-red-400">{conn.lastError}</p>}
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`cryptocomAuto-${conn.id}`}
                          checked={conn.autoExecute}
                          onCheckedChange={(c) => updateCryptocomMutation.mutate({ id: conn.id, data: { autoExecute: c === true } })}
                        />
                        <Label htmlFor={`cryptocomAuto-${conn.id}`} className="text-xs text-gray-300">Auto-execute</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button size="sm" variant="outline" className="h-7 text-xs flex-1" onClick={() => testCryptocomMutation.mutate(conn.id)} disabled={testCryptocomMutation.isPending}>
                          {testCryptocomMutation.isPending ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : null}Test
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-xs text-red-400 border-red-900" onClick={() => deleteCryptocomMutation.mutate(conn.id)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}

                {!showCryptocomForm ? (
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs" onClick={() => setShowCryptocomForm(true)}>
                    + Connect Crypto.com Account
                  </Button>
                ) : (
                  <div className="p-3 bg-gray-800/30 border border-gray-700 rounded-lg space-y-3">
                    <Input
                      placeholder="API Key"
                      value={cryptocomForm.apiKey}
                      onChange={(e) => setCryptocomForm(p => ({ ...p, apiKey: e.target.value }))}
                      className="bg-gray-800 border-gray-700 h-8 text-sm"
                    />
                    <div className="relative">
                      <Input
                        type={showCryptocomSecret ? 'text' : 'password'}
                        placeholder="API Secret"
                        value={cryptocomForm.apiSecret}
                        onChange={(e) => setCryptocomForm(p => ({ ...p, apiSecret: e.target.value }))}
                        className="bg-gray-800 border-gray-700 h-8 text-sm pr-9"
                      />
                      <button type="button" onClick={() => setShowCryptocomSecret(v => !v)} className="absolute right-2 top-1.5 text-gray-500">
                        {showCryptocomSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <Select value={cryptocomForm.instrumentType} onValueChange={(v: any) => setCryptocomForm(p => ({ ...p, instrumentType: v }))}>
                      <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="perpetual">Perpetual</SelectItem>
                        <SelectItem value="future">Future</SelectItem>
                        <SelectItem value="option">Option (region-dependent)</SelectItem>
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2">
                      <Checkbox id="cryptocomAutoNew" checked={cryptocomForm.autoExecute} onCheckedChange={(c) => setCryptocomForm(p => ({ ...p, autoExecute: c === true }))} />
                      <Label htmlFor="cryptocomAutoNew" className="text-xs text-gray-300">Auto-execute</Label>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => createCryptocomMutation.mutate(cryptocomForm)}
                        disabled={!cryptocomForm.apiKey || !cryptocomForm.apiSecret || createCryptocomMutation.isPending}
                        className="flex-1 bg-gradient-to-r from-amber-600 to-orange-600 h-8 text-sm"
                      >
                        {createCryptocomMutation.isPending ? (<><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Connecting...</>) : 'Connect Account'}
                      </Button>
                      <Button variant="outline" className="h-8 text-sm" onClick={() => setShowCryptocomForm(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {cryptocomConnections.length === 0 ? (
              <div className="flex items-start gap-2 bg-amber-900/20 border border-amber-700/40 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-200/80">Connect a Crypto.com account above before configuring the AI engine.</p>
              </div>
            ) : configLoading || !config ? (
              <p className="text-xs text-gray-500">Loading engine settings...</p>
            ) : (
              <>
                <Card className="bg-gray-900 border-gray-800">
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span>AI Auto-Trading Engine</span>
                      <Switch
                        checked={config.isActive}
                        onCheckedChange={(v) => updateConfigMutation.mutate({ isActive: v, enableAutoExecution: v })}
                      />
                    </CardTitle>
                    <CardDescription>
                      {config.isActive ? 'Active' : 'Paused'} — scanning {config.symbols.length} token{config.symbols.length === 1 ? '' : 's'} every {Math.round(config.scanIntervalMs / 1000)}s. Also requires "Auto-execute" on the connection above.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {/* ── Tokens & Strategy ── */}
                    <div>
                      <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wide mb-3">Tokens & Strategy</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2 md:col-span-2">
                          <Label className="text-xs text-gray-400">Perpetuals to scan (comma-separated)</Label>
                          <Input
                            defaultValue={config.symbols.join(', ')}
                            onBlur={(e) => updateConfigMutation.mutate({ symbols: e.target.value.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) })}
                            placeholder="BTCUSD-PERP, ETHUSD-PERP, SOLUSD-PERP"
                            className="bg-gray-800 border-gray-700 h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Strategy</Label>
                          <Select value={config.strategyMode} onValueChange={(v: any) => updateConfigMutation.mutate({ strategyMode: v })}>
                            <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="auto">Auto — run all, take the best signal</SelectItem>
                              <SelectItem value="trend_following">Trend Following</SelectItem>
                              <SelectItem value="momentum">Momentum</SelectItem>
                              <SelectItem value="order_flow">Order Flow / CVD Proxy</SelectItem>
                              <SelectItem value="volume_profile">Volume Profile (POC / Value Area)</SelectItem>
                              <SelectItem value="breakout">Breakout (N-period high/low)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Direction filter</Label>
                          <Select value={config.directionFilter} onValueChange={(v: any) => updateConfigMutation.mutate({ directionFilter: v })}>
                            <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="both">Long & Short</SelectItem>
                              <SelectItem value="long_only">Long Only</SelectItem>
                              <SelectItem value="short_only">Short Only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Scan interval (seconds)</Label>
                          <Input type="number" value={Math.round(config.scanIntervalMs / 1000)} onChange={(e) => updateConfigMutation.mutate({ scanIntervalMs: Math.max(30, Number(e.target.value)) * 1000 })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">AI mode</Label>
                          <Select value={config.aiMode} onValueChange={(v: any) => updateConfigMutation.mutate({ aiMode: v })}>
                            <SelectTrigger className="h-8 bg-gray-800 border-gray-700 text-sm"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="full">Full AI reasoning</SelectItem>
                              <SelectItem value="economy">Economy (fewer AI calls)</SelectItem>
                              <SelectItem value="rule_based">Rule-based only (no AI cost)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    {/* ── Execution venue routing ── */}
                    <div>
                      <h4 className="text-[11px] font-bold text-blue-400 uppercase tracking-wide mb-3">Execution Venue</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Where to place orders</Label>
                          <select value={config.executionVenue} onChange={(e) => updateConfigMutation.mutate({ executionVenue: e.target.value })} className="w-full bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2">
                            <option value="cryptocom">Crypto.com (perps — full engine)</option>
                            <option value="coinbase">Coinbase (spot, long-only)</option>
                            <option value="kraken">Kraken (spot, long-only)</option>
                            <option value="gemini">Gemini (spot, long-only)</option>
                          </select>
                        </div>
                        {config.executionVenue !== 'cryptocom' && (
                          <>
                            <div className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2">
                              <div><Label className="text-xs text-white">Enable live CeFi auto-trade</Label><p className="text-[10px] text-gray-500">Auto-places REAL spot orders on {config.executionVenue}</p></div>
                              <Switch checked={config.cefiAutoTradeEnabled} onCheckedChange={(v) => updateConfigMutation.mutate({ cefiAutoTradeEnabled: v })} />
                            </div>
                            <div className="space-y-1"><Label className="text-[11px] text-gray-400">USD per entry</Label><Input type="number" defaultValue={config.cefiNotionalUsd} onBlur={(e) => updateConfigMutation.mutate({ cefiNotionalUsd: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" /></div>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Take profit %</Label><Input type="number" step="0.5" defaultValue={config.cefiTakeProfitPct} onBlur={(e) => updateConfigMutation.mutate({ cefiTakeProfitPct: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" /></div>
                              <div className="space-y-1"><Label className="text-[11px] text-gray-400">Stop loss %</Label><Input type="number" step="0.5" defaultValue={config.cefiStopLossPct} onBlur={(e) => updateConfigMutation.mutate({ cefiStopLossPct: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" /></div>
                            </div>
                            <p className="text-[10px] text-gray-500 md:col-span-2">Spot is long-only (BUY signals only). Requires a connected {config.executionVenue} key with trade permission. Start with a small "USD per entry".</p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* ── Engine Intelligence & Safety (parity with FX/Kalshi/Options) ── */}
                    <div>
                      <h4 className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide mb-3">Engine Intelligence & Safety</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
                          <div><Label className="text-xs text-white">Self-learning brain</Label><p className="text-[10px] text-gray-500">Reweights sizing by per-symbol win rate</p></div>
                          <Switch checked={config.cryptoBrainEnabled} onCheckedChange={(v) => updateConfigMutation.mutate({ cryptoBrainEnabled: v })} />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
                          <div><Label className="text-xs text-white">Brain gating</Label><p className="text-[10px] text-gray-500">Hard-block proven-losing symbols/hours</p></div>
                          <Switch checked={config.cryptoBrainGating} onCheckedChange={(v) => updateConfigMutation.mutate({ cryptoBrainGating: v })} />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/20 px-3 py-2">
                          <div><Label className="text-xs text-white">Composite autonomous</Label><p className="text-[10px] text-gray-500">Trade multi-strategy consensus</p></div>
                          <Switch checked={config.enableCompositeAutonomous} onCheckedChange={(v) => updateConfigMutation.mutate({ enableCompositeAutonomous: v })} />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs text-gray-400">Composite min edge score</Label>
                          <Input type="number" min={50} max={100} defaultValue={config.compositeMinEdgeScore} onBlur={(e) => updateConfigMutation.mutate({ compositeMinEdgeScore: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-red-500/25 bg-red-500/[0.05] px-3 py-2">
                          <div><Label className="text-xs text-white">Ruin Guard</Label><p className="text-[10px] text-gray-500">Hard halt on daily-loss / drawdown limit</p></div>
                          <Switch checked={config.ruinGuardEnabled} onCheckedChange={(v) => updateConfigMutation.mutate({ ruinGuardEnabled: v })} />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1"><Label className="text-[11px] text-gray-400">Daily loss %</Label><Input type="number" step="0.5" defaultValue={config.dailyLossLimitPct} onBlur={(e) => updateConfigMutation.mutate({ dailyLossLimitPct: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" /></div>
                          <div className="space-y-1"><Label className="text-[11px] text-gray-400">Max DD %</Label><Input type="number" step="0.5" defaultValue={config.maxDrawdownLimitPct} onBlur={(e) => updateConfigMutation.mutate({ maxDrawdownLimitPct: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" /></div>
                        </div>
                      </div>
                    </div>

                    {/* ── Risk & Sizing ── */}
                    <div>
                      <h4 className="text-[11px] font-bold text-amber-400 uppercase tracking-wide mb-3">Risk & Sizing</h4>
                      <div className="grid md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Risk per trade (% of account)</Label>
                          <Input type="number" step="0.1" value={config.riskPerTrade} onChange={(e) => updateConfigMutation.mutate({ riskPerTrade: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Leverage</Label>
                          <Input type="number" step="0.5" value={config.leverage} onChange={(e) => updateConfigMutation.mutate({ leverage: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Account balance (for sizing)</Label>
                          <Input type="number" value={config.accountBalance} onChange={(e) => updateConfigMutation.mutate({ accountBalance: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Min confidence to trade (%)</Label>
                          <Input type="number" value={config.minConfidence} onChange={(e) => updateConfigMutation.mutate({ minConfidence: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Max open trades</Label>
                          <Input type="number" value={config.maxOpenTrades} onChange={(e) => updateConfigMutation.mutate({ maxOpenTrades: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Max daily trades (0 = unlimited)</Label>
                          <Input type="number" value={config.maxDailyTrades} onChange={(e) => updateConfigMutation.mutate({ maxDailyTrades: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Daily loss limit (% of account)</Label>
                          <Input type="number" step="0.5" value={config.dailyLossLimit} onChange={(e) => updateConfigMutation.mutate({ dailyLossLimit: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs text-gray-400">Daily profit target $ (0 = off)</Label>
                          <Input type="number" value={config.dailyProfitTarget} onChange={(e) => updateConfigMutation.mutate({ dailyProfitTarget: Number(e.target.value) })} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                      </div>
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
                      <Switch checked={config.brainLearningMode} onCheckedChange={(v) => updateConfigMutation.mutate({ brainLearningMode: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Kelly Criterion Sizing</Label>
                      <Switch checked={config.useKellyCriterion} onCheckedChange={(v) => updateConfigMutation.mutate({ useKellyCriterion: v })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Drawdown Shield Threshold %</Label>
                      <Input type="number" step="0.5" value={config.drawdownShieldThreshold} onChange={(e) => updateConfigMutation.mutate({ drawdownShieldThreshold: Number(e.target.value) })} className="bg-gray-800 border-gray-700" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Trailing Stop Method</Label>
                      <Select value={config.trailMethod} onValueChange={(v: any) => updateConfigMutation.mutate({ trailMethod: v })}>
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
                      <Input type="number" step="0.1" value={config.trailActivationR} onChange={(e) => updateConfigMutation.mutate({ trailActivationR: Number(e.target.value) })} className="bg-gray-800 border-gray-700" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Trail Distance (R)</Label>
                      <Input type="number" step="0.1" value={config.trailFixedR} onChange={(e) => updateConfigMutation.mutate({ trailFixedR: Number(e.target.value) })} className="bg-gray-800 border-gray-700" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Consistency Rule Enforcement</Label>
                      <Switch checked={config.consistencyEnforcementEnabled} onCheckedChange={(v) => updateConfigMutation.mutate({ consistencyEnforcementEnabled: v })} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Max Daily Profit % of Total (0=off)</Label>
                      <Input type="number" value={config.maxDailyProfitPctOfTotal} onChange={(e) => updateConfigMutation.mutate({ maxDailyProfitPctOfTotal: Number(e.target.value) })} className="bg-gray-800 border-gray-700" />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Smart Symbol Escalation</Label>
                      <Switch checked={config.smartSymbolEscalation} onCheckedChange={(v) => updateConfigMutation.mutate({ smartSymbolEscalation: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">High Confidence Override</Label>
                      <Switch checked={config.highConfidenceOverride} onCheckedChange={(v) => updateConfigMutation.mutate({ highConfidenceOverride: v })} />
                    </div>
                    <div className="flex items-center justify-between">
                      <Label className="text-xs">Lock Settings (prevent AI from changing them)</Label>
                      <Switch checked={config.lockSettings} onCheckedChange={(v) => updateConfigMutation.mutate({ lockSettings: v })} />
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ══════════════════════ CONSENSUS ══════════════════════ */}
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
                                  <TrendingUp className="w-3 h-3" /> Quant: {c.quantVerdict} ({c.quantScore}/100)
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

          {/* ══════════════════════ LIVE FEED ══════════════════════ */}
          <TabsContent value="feed" className="mt-0">
            <Card className="bg-gray-900 border-gray-800">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-amber-400" /> Executed Trades
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
                                <p className="text-sm font-bold text-white">{t.symbol} <span className="text-xs font-normal text-gray-400 uppercase">{t.direction}</span></p>
                                <p className="text-[10px] text-gray-500">{t.quantity}x @ ${t.entryPrice.toFixed(2)} · {t.strategy.replace('_', ' ')}</p>
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
                                <p className="text-sm font-bold text-white">{t.symbol} <span className="text-xs font-normal text-gray-400 uppercase">{t.direction}</span></p>
                                <p className="text-[10px] text-gray-500">{t.quantity}x · entry ${t.entryPrice.toFixed(2)} → exit ${t.exitPrice?.toFixed(2) ?? '—'} · {t.exitReason?.replace('_', ' ') ?? t.status}</p>
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

            <Card className="bg-gray-900 border-gray-800 mt-6">
              <CardHeader>
                <CardTitle className="text-base flex items-center justify-between">
                  <span className="flex items-center gap-2"><Radar className="w-4 h-4 text-amber-400" /> Live Feed</span>
                  <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => refetchActivity()}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                </CardTitle>
                <CardDescription>
                  {config?.isActive
                    ? 'What the engine is scanning right now and why it is (or isn\'t) acting — refreshes every 15s.'
                    : 'Activate the engine in Setup & Config to start scanning.'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <p className="text-xs text-gray-500">Loading feed...</p>
                ) : activity.length === 0 ? (
                  <p className="text-xs text-gray-500">
                    {config?.isActive ? 'No scans yet — the first cycle runs within a couple minutes of activation.' : 'No activity yet.'}
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
