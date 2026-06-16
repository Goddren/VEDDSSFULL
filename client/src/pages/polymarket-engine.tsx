import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Play, Square, RefreshCw, Settings, X,
  ChevronDown, ChevronUp, Wallet, ExternalLink,
  TrendingUp, TrendingDown, Activity, Zap, Clock,
  BarChart2, Info, Shield, Eye, EyeOff,
  AlertTriangle, KeyRound,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface BTC5MinPrediction {
  direction: "BUY" | "SELL" | "NEUTRAL";
  confidence: number;
  currentPrice: number;
  priceChange5m: number;
  priceChange1h: number;
  rsi: number;
  macdSignal: "bullish" | "bearish" | "neutral";
  macdHistogram: number;
  ema9: number;
  ema21: number;
  ema50: number;
  volumeTrend: "rising" | "falling" | "flat";
  supportLevel: number;
  resistanceLevel: number;
  reasons: string[];
  fetchedAt: string;
  fromCache: boolean;
  symbol: string;
  source?: string;          // 'binance' | 'coinbase'
  error?: string;
}

interface PolymarketMarket {
  id: string;
  question: string;
  yesProbability: number;
  noProbability: number;
  volume: number;
  endDate: string | null;
  direction: "bullish" | "bearish" | "neutral";
  livePrice?: boolean;
  msUntilEnd?: number | null;
}

interface PolymarketData {
  overallBullishScore: number;
  sentimentLabel: string;
  markets: PolymarketMarket[];
  fromCache: boolean;
  livePrices?: boolean;
  error?: string;
}

interface KalshiBracket {
  ticker: string;
  subtitle: string;
  strikeType: "greater" | "less" | "between";
  floorStrike: number | null;
  capStrike: number | null;
  yesProbability: number;
  noProb: number;
  hasLiquidity: boolean;
  volume: number;
  yesAsk: number;
  yesBid: number;
}

interface KalshiEvent {
  eventTicker: string | null;
  title: string;
  closeTime: string | null;
  msUntilClose: number;
  brackets: KalshiBracket[];
  nearestBracket: KalshiBracket | null;
  consensusBracket: KalshiBracket | null;
  totalVolume: number;
  hasActiveLiquidity: boolean;
  fetchedAt: string;
  fromCache: boolean;
  error?: string;
}

interface KalshiTradeRecord {
  id: string;
  ticker: string;
  subtitle: string;
  entryPriceCents: number;
  currentPriceCents: number;
  count: number;
  stake: number;
  unrealizedPnl: number;
  realizedPnl?: number;
  signal: { direction: "BUY" | "SELL"; confidence: number; btcPrice: number };
  openedAt: string;
  closedAt?: string;
  status: "open" | "closed" | "expired";
  paper: boolean;
}

interface KalshiEngineState {
  isRunning: boolean;
  isPaperMode: boolean;
  lastScanAt: string | null;
  lastScanResult: string | null;
  openTrades: KalshiTradeRecord[];
  closedTrades: KalshiTradeRecord[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  config: {
    contractsPerTrade: number;
    maxOpenTrades: number;
    cooldownMinutes: number;
    minConfidence: number;
    requireAlignedHourly: boolean;
    strategy: "momentum" | "volume_profile" | "markov" | "order_flow";
  };
}

interface KalshiAccount {
  connected: boolean;
  memberId?: string;
  balance?: number;
  error?: string;
}


interface PolymarketPosition {
  id: string;
  market: { id: string; question: string; endDate: string | null };
  side: "YES" | "NO";
  direction: "BUY" | "SELL";
  entryProbability: number;
  currentProbability: number;
  stake: number;
  currentValue: number;
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  openedAt: string;
  signal: { bullishScore: number; sentimentLabel: string; direction: string };
  status: "open" | "closed" | "resolved";
  closedAt?: string;
  closedProbability?: number;
  realizedPnl?: number;
}

interface EngineState {
  isRunning: boolean;
  lastScanAt: string | null;
  lastScanResult: string | null;
  openPositions: PolymarketPosition[];
  closedPositions: PolymarketPosition[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  config: {
    minBullishScore: number;
    minBearishScore: number;
    stakePerTrade: number;
    maxOpenPositions: number;
    cooldownMinutes: number;
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number, dec = 2) =>
  n.toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });

const fmtPrice = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

const pnlColor = (n: number) =>
  n > 0 ? "text-emerald-400" : n < 0 ? "text-red-400" : "text-gray-400";

const pnlBg = (n: number) =>
  n > 0 ? "bg-emerald-500/10 border-emerald-500/20"
        : n < 0 ? "bg-red-500/10 border-red-500/20"
        : "bg-gray-800/40 border-gray-700/40";

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

function fmtTimeUntil(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "soon";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) { const m = totalMin % 60; return m > 0 ? `${h}h ${m}m` : `${h}h`; }
  return `${Math.floor(h / 24)}d`;
}

function findNearestBracket(brackets: KalshiBracket[], btcPrice: number): KalshiBracket | null {
  if (!brackets.length) return null;
  return brackets.reduce((best, b) => {
    const mid = (b.floorStrike != null && b.capStrike != null)
      ? (b.floorStrike + b.capStrike) / 2
      : b.floorStrike ?? b.capStrike ?? 0;
    const bestMid = (best.floorStrike != null && best.capStrike != null)
      ? (best.floorStrike + best.capStrike) / 2
      : best.floorStrike ?? best.capStrike ?? 0;
    return Math.abs(mid - btcPrice) < Math.abs(bestMid - btcPrice) ? b : best;
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PolymarketEnginePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showConfig, setShowConfig] = useState(false);
  const [showPolymarkets, setShowPolymarkets] = useState(false);
  const [secondsAge, setSecondsAge] = useState(0);

  const [cfgBullish, setCfgBullish]   = useState("");
  const [cfgBearish, setCfgBearish]   = useState("");
  const [cfgStake, setCfgStake]       = useState("");
  const [cfgMaxPos, setCfgMaxPos]     = useState("");
  const [cfgCooldown, setCfgCooldown] = useState("");

  // Kalshi credential state
  const [showKalshiSetup, setShowKalshiSetup] = useState(false);
  const [kalshiAuthMode, setKalshiAuthMode]   = useState<"password" | "apikey">("apikey");
  const [kalshiEmail, setKalshiEmail]         = useState("");
  const [kalshiPassword, setKalshiPassword]   = useState("");
  const [showKalshiPw, setShowKalshiPw]       = useState(false);
  const [kalshiKeyId, setKalshiKeyId]         = useState("");
  const [kalshiPrivateKey, setKalshiPrivateKey] = useState("");
  const [showKalshiConfig, setShowKalshiConfig] = useState(false);
  const [gisReady, setGisReady]               = useState(false);
  const [googleEmailPrefilled, setGoogleEmailPrefilled] = useState(false);
  const googleBtnRef                          = useRef<HTMLDivElement>(null);
  const [kalshiCfgContracts, setKalshiCfgContracts] = useState("");
  const [kalshiCfgMaxTrades, setKalshiCfgMaxTrades] = useState("");
  const [kalshiCfgCooldown, setKalshiCfgCooldown]   = useState("");
  const [kalshiCfgConfidence, setKalshiCfgConfidence] = useState("");
  const [kalshiCfgStrategy, setKalshiCfgStrategy] = useState<"" | "momentum" | "volume_profile" | "markov" | "order_flow">("");

  // Polymarket live key state
  const [showPolyKeySetup, setShowPolyKeySetup] = useState(false);
  const [polyPrivateKey, setPolyPrivateKey]     = useState("");
  const [showPolyKey, setShowPolyKey]           = useState(false);


  // ── Public app config (Google Client ID, etc.) ───────────────────────────
  const { data: appConfig } = useQuery<{ googleClientId: string | null }>({
    queryKey: ["/api/config"],
    staleTime: Infinity,
  });

  // Load Google Identity Services when setup panel is open and client ID is configured
  useEffect(() => {
    const clientId = appConfig?.googleClientId;
    if (!clientId || !showKalshiSetup) return;
    if ((window as any).google?.accounts?.id) { initGIS(clientId); return; }
    const script = document.createElement('script');
    script.id = 'gis-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => initGIS(clientId);
    document.head.appendChild(script);
  }, [appConfig?.googleClientId, showKalshiSetup]);

  function initGIS(clientId: string) {
    (window as any).google?.accounts.id.initialize({
      client_id: clientId,
      callback: (resp: { credential: string }) => {
        try {
          const payload = JSON.parse(atob(resp.credential.split('.')[1]));
          if (payload.email) {
            setKalshiEmail(payload.email);
            setGoogleEmailPrefilled(true);
          }
        } catch { /* ignore decode errors */ }
      },
      cancel_on_tap_outside: true,
    });
    setGisReady(true);
  }

  // Render the native Google Sign-In button into the ref'd div
  useEffect(() => {
    if (!gisReady || !googleBtnRef.current) return;
    (window as any).google?.accounts.id.renderButton(googleBtnRef.current, {
      theme: 'filled_black',
      size: 'large',
      text: 'signin_with',
      width: googleBtnRef.current.offsetWidth || 320,
    });
  }, [gisReady, showKalshiSetup]);

  // Scroll to the Kalshi panel when arriving via the "Kalshi P&L" nav (#kalshi)
  useEffect(() => {
    if (typeof window === "undefined" || window.location.hash !== "#kalshi") return;
    const t = setTimeout(() => {
      document.getElementById("kalshi")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 400);
    return () => clearTimeout(t);
  }, []);

  // ── 5-min BTC prediction — Binance feed, US-legal ─────────────────────────
  const {
    data: btcPred,
    isLoading: btcLoading,
    isError: btcError,
    dataUpdatedAt,
    refetch: refetchBTC,
  } = useQuery<BTC5MinPrediction>({
    queryKey: ["/api/btc/5min-prediction"],
    refetchInterval: 30_000,
    staleTime: 0,
    retry: 2,
    enabled: !!user,
  });

  // ── Kalshi CFTC-regulated BTC markets ────────────────────────────────────
  const { data: kalshiData } = useQuery<KalshiEvent>({
    queryKey: ["/api/kalshi/btc"],
    refetchInterval: 120_000,
    staleTime: 60_000,
    retry: 1,
    enabled: !!user,
  });

  // ── Polymarket near-term BTC markets (supplemental context) ───────────────
  const { data: polyData } = useQuery<PolymarketData>({
    queryKey: ["/api/polymarket/btc-live"],
    refetchInterval: 60_000,
    staleTime: 0,
    retry: 1,
    enabled: !!user,
  });

  // ── Engine status ─────────────────────────────────────────────────────────
  const { data: state } = useQuery<EngineState>({
    queryKey: ["/api/polymarket-engine/status"],
    refetchInterval: 8000,
    enabled: !!user,
  });

  const { data: savedWallet } = useQuery<{ address: string } | null>({
    queryKey: ["/api/user/polymarket-wallet"],
    enabled: !!user,
  });

  // ── Kalshi engine ─────────────────────────────────────────────────────────
  const { data: kalshiEngineState, refetch: refetchKalshiEngine } = useQuery<KalshiEngineState>({
    queryKey: ["/api/kalshi/engine/status"],
    refetchInterval: 8000,
    enabled: !!user,
  });

  const { data: kalshiAccount, refetch: refetchKalshiAccount } = useQuery<KalshiAccount>({
    queryKey: ["/api/kalshi/account"],
    staleTime: 30_000,
    enabled: !!user,
  });

  const { data: polyKeyStatus, refetch: refetchPolyKeyStatus } = useQuery<{ saved: boolean; maskedKey: string | null }>({
    queryKey: ["/api/user/polymarket-private-key"],
    enabled: !!user,
  });

  // Live age counter
  useEffect(() => {
    const id = setInterval(() => {
      setSecondsAge(Math.floor((Date.now() - (dataUpdatedAt ?? Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/polymarket-engine/start").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      toast({ title: "Engine started" });
    },
  });
  const stopMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/polymarket-engine/stop").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      toast({ title: "Engine stopped" });
    },
  });
  const scanMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/polymarket-engine/scan").then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      toast({ title: data.fired ? "Position opened!" : "Scan complete — no trade", description: data.reason });
    },
  });
  const configMutation = useMutation({
    mutationFn: (cfg: any) => apiRequest("PUT", "/api/polymarket-engine/config", cfg).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      setShowConfig(false);
      toast({ title: "Config saved" });
    },
  });
  const closePosMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/polymarket-engine/positions/${id}/close`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] }),
  });
  const closeAllMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/polymarket-engine/positions/close-all").then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      toast({ title: `Closed ${data.closed} position(s)` });
    },
  });

  // Kalshi mutations
  const saveKalshiCredsMutation = useMutation({
    mutationFn: (body: { email: string; password: string }) =>
      apiRequest("POST", "/api/kalshi/credentials", body).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Kalshi login failed", description: data.error, variant: "destructive" }); return; }
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] });
      setShowKalshiSetup(false);
      setKalshiPassword("");
      toast({ title: "Kalshi connected!", description: `Balance: ${data.balance ?? 0}¢` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const saveKalshiApiKeyMutation = useMutation({
    mutationFn: (body: { keyId: string; privateKeyPem: string }) =>
      apiRequest("POST", "/api/kalshi/apikey", body).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "API Key failed", description: data.error, variant: "destructive" }); return; }
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] });
      setShowKalshiSetup(false);
      setKalshiKeyId(""); setKalshiPrivateKey("");
      toast({ title: "Kalshi connected via API Key!", description: `Balance: $${((data.balance ?? 0) / 100).toFixed(2)}` });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const disconnectKalshiMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/kalshi/credentials").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/account"] });
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] });
      toast({ title: "Kalshi disconnected" });
    },
  });

  const startKalshiMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kalshi/engine/start").then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }); toast({ title: "Kalshi engine started" }); },
  });
  const stopKalshiMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kalshi/engine/stop").then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }); toast({ title: "Kalshi engine stopped" }); },
  });
  const scanKalshiMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kalshi/engine/scan").then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] });
      toast({ title: data.fired ? "Kalshi trade opened!" : "Kalshi scan — no trade", description: data.reason });
    },
  });
  const saveKalshiConfigMutation = useMutation({
    mutationFn: (cfg: any) => apiRequest("PUT", "/api/kalshi/engine/config", cfg).then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }); setShowKalshiConfig(false); toast({ title: "Config saved" }); },
  });
  const closeKalshiTradeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/kalshi/engine/trades/${id}/close`).then(r => r.json()),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }),
  });

  // Polymarket private key + live mode mutations
  const savePolyKeyMutation = useMutation({
    mutationFn: (privateKey: string) => apiRequest("POST", "/api/user/polymarket-private-key", { privateKey }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      refetchPolyKeyStatus();
      setShowPolyKeySetup(false);
      setPolyPrivateKey("");
      toast({ title: "Private key saved" });
    },
  });
  const deletePolyKeyMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", "/api/user/polymarket-private-key").then(r => r.json()),
    onSuccess: () => { refetchPolyKeyStatus(); toast({ title: "Private key removed" }); },
  });
  const toggleLiveModeMutation = useMutation({
    mutationFn: (enabled: boolean) => apiRequest("POST", "/api/polymarket-engine/live-mode", { enabled }).then(r => r.json()),
    onSuccess: (data) => {
      if (data.error) { toast({ title: "Error", description: data.error, variant: "destructive" }); return; }
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      toast({ title: data.liveMode ? "Live mode ON — real CLOB orders" : "Live mode OFF — paper trading" });
    },
  });

  const saveKalshiConfig = () => {
    const patch: any = {};
    if (kalshiCfgContracts)  patch.contractsPerTrade = Number(kalshiCfgContracts);
    if (kalshiCfgMaxTrades)  patch.maxOpenTrades     = Number(kalshiCfgMaxTrades);
    if (kalshiCfgCooldown)   patch.cooldownMinutes   = Number(kalshiCfgCooldown);
    if (kalshiCfgConfidence) patch.minConfidence     = Number(kalshiCfgConfidence);
    if (kalshiCfgStrategy)   patch.strategy          = kalshiCfgStrategy;
    if (!Object.keys(patch).length) return;
    saveKalshiConfigMutation.mutate(patch);
  };


  const saveConfig = () => {
    const patch: any = {};
    if (cfgBullish)  patch.minBullishScore  = Number(cfgBullish);
    if (cfgBearish)  patch.minBearishScore  = Number(cfgBearish);
    if (cfgStake)    patch.stakePerTrade    = Number(cfgStake);
    if (cfgMaxPos)   patch.maxOpenPositions = Number(cfgMaxPos);
    if (cfgCooldown) patch.cooldownMinutes  = Number(cfgCooldown);
    if (!Object.keys(patch).length) return;
    configMutation.mutate(patch);
  };
  const openConfigPanel = () => {
    if (state) {
      setCfgBullish(String(state.config.minBullishScore));
      setCfgBearish(String(state.config.minBearishScore));
      setCfgStake(String(state.config.stakePerTrade));
      setCfgMaxPos(String(state.config.maxOpenPositions));
      setCfgCooldown(String(state.config.cooldownMinutes));
    }
    setShowConfig(v => !v);
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const isRunning   = state?.isRunning ?? false;
  const openCount   = state?.openPositions.length ?? 0;
  const closedCount = state?.closedPositions.length ?? 0;
  const totalPnl    = (state?.totalRealizedPnl ?? 0) + (state?.totalUnrealizedPnl ?? 0);

  const dir        = btcPred?.direction ?? "NEUTRAL";
  const confidence = btcPred?.confidence ?? 50;

  const dirColor =
    dir === "BUY"  ? "text-emerald-400" :
    dir === "SELL" ? "text-red-400"     : "text-gray-400";

  const dirBg =
    dir === "BUY"  ? "from-emerald-900/40 to-emerald-800/20 border-emerald-700/40" :
    dir === "SELL" ? "from-red-900/40 to-red-800/20 border-red-700/40"             :
    "from-gray-800/40 to-gray-900/20 border-gray-700/40";

  const dirIcon =
    dir === "BUY"  ? <TrendingUp  className="w-5 h-5 text-emerald-400" /> :
    dir === "SELL" ? <TrendingDown className="w-5 h-5 text-red-400" />    :
    <Activity className="w-5 h-5 text-gray-400" />;

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-24">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gray-900/80 border-b border-gray-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 backdrop-blur">
        <Link href="/weekly-strategy">
          <button className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
            <ArrowLeft className="w-4 h-4 text-gray-400" />
          </button>
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-lg">📊</span>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">BTC 5-Min Prediction</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">Binance live feed · US-accessible · 30 s refresh</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="flex items-center gap-1 text-[10px]">
            <span className={`w-2 h-2 rounded-full ${secondsAge < 35 ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
            <span className={secondsAge < 35 ? "text-emerald-400" : "text-amber-400"}>
              {secondsAge < 35 ? "LIVE" : `${secondsAge}s`}
            </span>
          </span>
          {isRunning ? (
            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />ACTIVE
            </span>
          ) : (
            <span className="text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">STOPPED</span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* ── US-legal notice ──────────────────────────────────────────────── */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-base">🇺🇸</span>
          <p className="text-[10px] text-blue-200/80">
            <span className="font-bold text-blue-300">US-accessible.</span>{' '}
            Price predictions use the Binance public API — no geo-restriction, no account required.
            Polymarket prediction markets below are supplemental context only.
          </p>
        </div>

        {/* ── PRIMARY: 5-Min BTC Prediction ───────────────────────────────── */}
        <div className={`bg-gradient-to-br ${dirBg} border rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">5-Min BTC Prediction</h2>
              <span className="text-[9px] text-gray-500 bg-gray-800/60 px-1.5 py-0.5 rounded">
                {btcPred?.source === "coinbase" ? "Coinbase BTC-USD" : "Binance BTCUSDT"}
              </span>
            </div>
            <button
              onClick={() => refetchBTC()}
              disabled={btcLoading}
              className="p-1 rounded hover:bg-gray-800/60 transition-colors"
              title="Refresh now"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${btcLoading ? "animate-spin" : ""}`} />
            </button>
          </div>

          {btcLoading && !btcPred ? (
            <div className="flex items-center justify-center py-8 gap-2 text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-xs">Fetching live BTC data…</span>
            </div>
          ) : btcError || btcPred?.error ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <p className="text-red-300 text-xs">Could not reach price feed (Binance + Coinbase) — check connection</p>
              <button onClick={() => refetchBTC()} className="text-[10px] text-gray-400 underline">Retry</button>
            </div>
          ) : btcPred ? (
            <>
              {/* Direction + price row */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center bg-gray-900/60 border ${
                    dir === "BUY" ? "border-emerald-500/40" : dir === "SELL" ? "border-red-500/40" : "border-gray-700/40"
                  }`}>
                    {dirIcon}
                    <span className={`text-xs font-black ml-0.5 ${dirColor}`}>{dir}</span>
                  </div>
                  <div>
                    <p className="text-[9px] text-gray-400">Confidence</p>
                    <p className={`text-2xl font-black ${dirColor}`}>{confidence}%</p>
                    <div className="w-24 h-1.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          dir === "BUY" ? "bg-emerald-500" : dir === "SELL" ? "bg-red-500" : "bg-gray-500"
                        }`}
                        style={{ width: `${confidence}%` }}
                      />
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-400 mb-0.5">BTC Price</p>
                  <p className="text-xl font-black text-white">${fmtPrice(btcPred.currentPrice)}</p>
                  <p className={`text-[10px] font-bold ${btcPred.priceChange5m >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {btcPred.priceChange5m >= 0 ? "▲" : "▼"} {Math.abs(btcPred.priceChange5m).toFixed(3)}% (5m)
                  </p>
                  <p className={`text-[9px] ${btcPred.priceChange1h >= 0 ? "text-emerald-400/70" : "text-red-400/70"}`}>
                    {btcPred.priceChange1h >= 0 ? "+" : ""}{btcPred.priceChange1h.toFixed(2)}% (1h)
                  </p>
                </div>
              </div>

              {/* Technical signals grid */}
              <div className="grid grid-cols-3 gap-2 mb-3">
                {/* RSI */}
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <p className="text-[8px] text-gray-500 mb-0.5">RSI(14)</p>
                  <p className={`text-sm font-bold ${
                    btcPred.rsi >= 70 ? "text-red-400" : btcPred.rsi <= 30 ? "text-emerald-400" :
                    btcPred.rsi >= 55 ? "text-emerald-300" : "text-orange-300"
                  }`}>{btcPred.rsi}</p>
                  <p className="text-[8px] text-gray-600">
                    {btcPred.rsi >= 70 ? "Overbought" : btcPred.rsi <= 30 ? "Oversold" : btcPred.rsi >= 50 ? "Bullish" : "Bearish"}
                  </p>
                </div>

                {/* MACD */}
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <p className="text-[8px] text-gray-500 mb-0.5">MACD</p>
                  <p className={`text-sm font-bold ${btcPred.macdSignal === "bullish" ? "text-emerald-400" : "text-red-400"}`}>
                    {btcPred.macdSignal === "bullish" ? "▲" : "▼"}{Math.abs(btcPred.macdHistogram).toFixed(0)}
                  </p>
                  <p className="text-[8px] text-gray-600 capitalize">{btcPred.macdSignal}</p>
                </div>

                {/* Volume */}
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <p className="text-[8px] text-gray-500 mb-0.5">Volume</p>
                  <p className={`text-sm font-bold ${
                    btcPred.volumeTrend === "rising" ? "text-emerald-400" :
                    btcPred.volumeTrend === "falling" ? "text-red-400" : "text-gray-400"
                  }`}>
                    {btcPred.volumeTrend === "rising" ? "↑" : btcPred.volumeTrend === "falling" ? "↓" : "→"}
                  </p>
                  <p className="text-[8px] text-gray-600 capitalize">{btcPred.volumeTrend}</p>
                </div>
              </div>

              {/* EMA levels */}
              <div className="flex items-center gap-2 mb-3 bg-black/20 rounded-lg px-3 py-2">
                <BarChart2 className="w-3 h-3 text-gray-500 shrink-0" />
                <div className="flex items-center gap-3 text-[10px]">
                  <span className={btcPred.currentPrice > btcPred.ema9 ? "text-emerald-400" : "text-red-400"}>
                    EMA9 <span className="font-bold">${fmtPrice(btcPred.ema9)}</span>
                  </span>
                  <span className={btcPred.currentPrice > btcPred.ema21 ? "text-emerald-400" : "text-red-400"}>
                    EMA21 <span className="font-bold">${fmtPrice(btcPred.ema21)}</span>
                  </span>
                  <span className={btcPred.currentPrice > btcPred.ema50 ? "text-emerald-400" : "text-red-400"}>
                    EMA50 <span className="font-bold">${fmtPrice(btcPred.ema50)}</span>
                  </span>
                </div>
              </div>

              {/* S/R levels */}
              <div className="flex items-center gap-3 mb-3 text-[10px]">
                <div className="flex-1 bg-emerald-900/20 border border-emerald-700/30 rounded-lg px-3 py-1.5 text-center">
                  <p className="text-[8px] text-gray-500">Support (20-bar)</p>
                  <p className="font-bold text-emerald-400">${fmtPrice(btcPred.supportLevel)}</p>
                </div>
                <div className="flex-1 bg-red-900/20 border border-red-700/30 rounded-lg px-3 py-1.5 text-center">
                  <p className="text-[8px] text-gray-500">Resistance (20-bar)</p>
                  <p className="font-bold text-red-400">${fmtPrice(btcPred.resistanceLevel)}</p>
                </div>
              </div>

              {/* Signal reasons */}
              <div className="space-y-1">
                {btcPred.reasons.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dir === "BUY" ? "bg-emerald-400" : dir === "SELL" ? "bg-red-400" : "bg-gray-500"}`} />
                    <p className="text-[10px] text-gray-300">{r}</p>
                  </div>
                ))}
              </div>

              <p className="text-[9px] text-gray-600 text-center mt-2">
                Updated {timeAgo(btcPred.fetchedAt)} · {btcPred.source === "coinbase" ? "Coinbase BTC-USD" : "Binance BTCUSDT"} 5m · {btcPred.fromCache ? "cached" : "live"}
              </p>
            </>
          ) : null}
        </div>

        {/* ── Kalshi CFTC-regulated BTC Markets ───────────────────────────── */}
        {kalshiData && !kalshiData.error && kalshiData.eventTicker ? (() => {
          const nearestBracket = btcPred?.currentPrice
            ? findNearestBracket(kalshiData.brackets, btcPred.currentPrice)
            : kalshiData.nearestBracket;
          const consensus = kalshiData.consensusBracket;
          const topBrackets = kalshiData.brackets.slice(0, 5);
          return (
            <div className="bg-indigo-950/40 border border-indigo-700/30 rounded-xl p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-indigo-400" />
                  <h2 className="text-sm font-bold text-white">Kalshi BTC Markets</h2>
                  <span className="text-[9px] text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded">
                    CFTC-Regulated · US-Legal
                  </span>
                </div>
                {kalshiData.msUntilClose > 0 && (
                  <span className="text-[9px] text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    closes {fmtTimeUntil(kalshiData.msUntilClose)}
                  </span>
                )}
              </div>

              <p className="text-[10px] text-indigo-200/60 mb-3 leading-snug">{kalshiData.title}</p>

              {/* Liquidity warning */}
              {!kalshiData.hasActiveLiquidity && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
                  <p className="text-[9px] text-amber-300/80">
                    Market opened — AMM placeholder prices only. Probabilities reflect no real trading yet.
                    Values will update as traders participate.
                  </p>
                </div>
              )}

              {/* Nearest bracket to current BTC price */}
              {nearestBracket && btcPred?.currentPrice && (
                <div className="bg-indigo-900/30 border border-indigo-600/30 rounded-lg px-3 py-2 mb-3">
                  <p className="text-[8px] text-indigo-400/70 mb-1">Bracket nearest to current BTC price (${fmtPrice(btcPred.currentPrice)})</p>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-indigo-200 font-semibold">{nearestBracket.subtitle}</p>
                    <span className={`text-xs font-black ${
                      nearestBracket.yesProbability >= 50 ? "text-indigo-300" : "text-gray-400"
                    }`}>{nearestBracket.yesProbability}%</span>
                  </div>
                  {/* Mini probability bar */}
                  <div className="w-full h-1 bg-gray-800 rounded-full mt-1.5 overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${nearestBracket.yesProbability}%` }} />
                  </div>
                </div>
              )}

              {/* Top probability brackets */}
              {topBrackets.length > 0 && (
                <div className="space-y-1">
                  {topBrackets.map((b, i) => (
                    <div key={b.ticker} className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-1.5">
                      <span className="text-[8px] text-gray-600 w-4">{i + 1}</span>
                      <p className="text-[9px] text-gray-300 flex-1 truncate">{b.subtitle}</p>
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-1 bg-gray-800 rounded-full overflow-hidden">
                          <div className="h-full bg-indigo-500/70 rounded-full" style={{ width: `${b.yesProbability}%` }} />
                        </div>
                        <span className={`text-[10px] font-bold w-7 text-right ${
                          b.yesProbability >= 50 ? "text-indigo-300" : "text-gray-500"
                        }`}>{b.yesProbability}%</span>
                        {b.hasLiquidity && (
                          <span className="text-[8px] text-emerald-400/60">●</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <p className="text-[9px] text-gray-600 text-center mt-2">
                {kalshiData.hasActiveLiquidity
                  ? `Vol: ${kalshiData.totalVolume.toLocaleString()} contracts`
                  : "No trading volume yet"
                } · {timeAgo(kalshiData.fetchedAt)} · {kalshiData.fromCache ? "cached" : "live"}
              </p>
            </div>
          );
        })() : kalshiData?.error ? (
          <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl px-4 py-3">
            <p className="text-[10px] text-gray-500 text-center">Kalshi unavailable: {kalshiData.error}</p>
          </div>
        ) : null}

        {/* ── Kalshi Auto-Trading Engine ────────────────────────────────────── */}
        <div id="kalshi" className={`scroll-mt-20 bg-indigo-950/50 border rounded-xl p-4 ${kalshiEngineState?.isRunning ? "border-indigo-600/60" : "border-indigo-800/40"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Shield className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white">Kalshi Auto-Trader</h2>
              <span className="text-[9px] text-indigo-300 bg-indigo-500/20 border border-indigo-500/30 px-1.5 py-0.5 rounded">CFTC · US-Legal</span>
              {kalshiEngineState && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${kalshiEngineState.isPaperMode ? "bg-amber-500/20 text-amber-300 border border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"}`}>
                  {kalshiEngineState.isPaperMode ? "PAPER" : "LIVE"}
                </span>
              )}
              {kalshiEngineState?.config.strategy && (
                <span className="text-[9px] text-purple-300 bg-purple-500/20 border border-purple-500/30 px-1.5 py-0.5 rounded">
                  {kalshiEngineState.config.strategy === "volume_profile" ? "Vol Profile" : kalshiEngineState.config.strategy === "markov" ? "Markov" : kalshiEngineState.config.strategy === "order_flow" ? "Order Flow" : "Momentum"}
                </span>
              )}
            </div>
            <button onClick={() => setShowKalshiConfig(v => !v)} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white px-2 py-1 bg-gray-800/60 rounded-lg">
              <Settings className="w-3 h-3" />
              {showKalshiConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* Credential setup */}
          {!kalshiAccount?.connected ? (
            <div>
              {!showKalshiSetup ? (
                <button
                  onClick={() => setShowKalshiSetup(true)}
                  className="w-full flex items-center gap-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-dashed border-indigo-600/40 text-indigo-300 text-xs rounded-xl px-4 py-3"
                >
                  <KeyRound className="w-4 h-4 shrink-0" />
                  <div className="text-left">
                    <p className="font-bold">Connect Kalshi Account</p>
                    <p className="text-[9px] text-indigo-400/70">Required for live trading — CFTC-regulated, US-legal</p>
                  </div>
                </button>
              ) : (
                <div className="space-y-2 bg-black/20 rounded-xl p-3">
                  {/* Kalshi discontinued email/password API login — API Key is the only supported method */}
                  <p className="text-[10px] font-bold text-indigo-300 flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3" /> Connect with Kalshi API Key
                  </p>
                  <div className="bg-indigo-950/40 border border-indigo-800/40 rounded-lg px-3 py-2 text-[9px] text-indigo-300/80 leading-relaxed space-y-1">
                    <p>Kalshi only supports API-key access (works with Google sign-in too). One-time setup:</p>
                    <ol className="list-decimal list-inside space-y-0.5 text-indigo-300/70">
                      <li>Open{" "}
                        <a href="https://kalshi.com/account/api" target="_blank" rel="noopener noreferrer" className="text-indigo-400 underline font-bold">kalshi.com/account/api</a>
                        {" "}and sign in (Google is fine)
                      </li>
                      <li>Click <span className="text-indigo-200 font-semibold">Create API Key</span> — Kalshi shows a <span className="text-indigo-200 font-semibold">Key ID</span> and downloads a <span className="text-indigo-200 font-semibold">private key</span> file</li>
                      <li>Paste both below (open the .key/.pem file in any text editor for the private key)</li>
                    </ol>
                  </div>
                  <input
                    type="text"
                    placeholder="Key ID (UUID from Kalshi dashboard)"
                    value={kalshiKeyId}
                    onChange={e => setKalshiKeyId(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg text-xs text-white px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono"
                  />
                  <textarea
                    placeholder={"-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"}
                    value={kalshiPrivateKey}
                    onChange={e => setKalshiPrivateKey(e.target.value)}
                    rows={4}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg text-[10px] text-white px-3 py-2 focus:outline-none focus:border-indigo-500 font-mono resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveKalshiApiKeyMutation.mutate({ keyId: kalshiKeyId, privateKeyPem: kalshiPrivateKey })}
                      disabled={saveKalshiApiKeyMutation.isPending || !kalshiKeyId || !kalshiPrivateKey}
                      className="flex-1 bg-indigo-600/40 hover:bg-indigo-600/60 border border-indigo-500/40 text-indigo-300 text-xs font-bold rounded-lg py-2 disabled:opacity-50"
                    >
                      {saveKalshiApiKeyMutation.isPending ? "Verifying…" : "Connect with API Key"}
                    </button>
                    <button onClick={() => { setShowKalshiSetup(false); setKalshiKeyId(""); setKalshiPrivateKey(""); }} className="text-xs text-gray-500 px-3">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Account summary */}
              <div className="flex items-center justify-between bg-indigo-900/20 border border-indigo-700/30 rounded-xl px-3 py-2">
                <div>
                  <p className="text-[9px] text-indigo-400/70">Kalshi Account</p>
                  <p className="text-xs font-bold text-indigo-200">{kalshiAccount.memberId ?? "Connected"}</p>
                </div>
                <div className="text-right">
                  <p className="text-[9px] text-gray-500">Balance</p>
                  <p className="text-xs font-bold text-white">{kalshiAccount.balance != null ? `$${(kalshiAccount.balance / 100).toFixed(2)}` : "—"}</p>
                </div>
                <button onClick={() => disconnectKalshiMutation.mutate()} className="text-[9px] text-red-400/70 hover:text-red-400 ml-2">Disconnect</button>
              </div>

              {/* Engine stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <p className="text-[8px] text-gray-500">Open</p>
                  <p className="text-sm font-bold text-white">{kalshiEngineState?.openTrades.length ?? 0}</p>
                </div>
                <div className="bg-black/30 rounded-lg p-2 text-center">
                  <p className="text-[8px] text-gray-500">Closed</p>
                  <p className="text-sm font-bold text-white">{kalshiEngineState?.closedTrades.length ?? 0}</p>
                </div>
                <div className={`rounded-lg p-2 text-center border ${pnlBg((kalshiEngineState?.totalRealizedPnl ?? 0) + (kalshiEngineState?.totalUnrealizedPnl ?? 0))}`}>
                  <p className="text-[8px] text-gray-500">P&L</p>
                  <p className={`text-sm font-bold ${pnlColor((kalshiEngineState?.totalRealizedPnl ?? 0) + (kalshiEngineState?.totalUnrealizedPnl ?? 0))}`}>
                    {((kalshiEngineState?.totalRealizedPnl ?? 0) + (kalshiEngineState?.totalUnrealizedPnl ?? 0)) >= 0 ? "+" : ""}
                    ${fmt((kalshiEngineState?.totalRealizedPnl ?? 0) + (kalshiEngineState?.totalUnrealizedPnl ?? 0))}
                  </p>
                </div>
              </div>

              {/* Engine controls */}
              <div className="flex gap-2">
                {kalshiEngineState?.isRunning ? (
                  <button onClick={() => stopKalshiMutation.mutate()} disabled={stopKalshiMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg py-2.5">
                    <Square className="w-3.5 h-3.5" />Stop
                  </button>
                ) : (
                  <button onClick={() => startKalshiMutation.mutate()} disabled={startKalshiMutation.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-indigo-400 text-xs font-bold rounded-lg py-2.5">
                    <Play className="w-3.5 h-3.5" />Start Engine
                  </button>
                )}
                <button onClick={() => scanKalshiMutation.mutate()} disabled={scanKalshiMutation.isPending}
                  className="flex items-center gap-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg px-3 py-2.5">
                  <RefreshCw className={`w-3.5 h-3.5 ${scanKalshiMutation.isPending ? "animate-spin" : ""}`} />Scan
                </button>
              </div>

              {kalshiEngineState?.lastScanAt && (
                <div className="bg-black/20 rounded-lg px-3 py-2">
                  <p className="text-[9px] text-gray-500">Last scan: {timeAgo(kalshiEngineState.lastScanAt)}</p>
                  {kalshiEngineState.lastScanResult && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{kalshiEngineState.lastScanResult}</p>}
                </div>
              )}

              {/* Config panel */}
              {showKalshiConfig && (
                <div className="bg-black/30 rounded-xl p-3 border border-gray-700/40">
                  <p className="text-[10px] font-bold text-indigo-300 mb-3">Kalshi Engine Config</p>

                  {/* Strategy selector */}
                  <div className="mb-3">
                    <label className="text-[9px] text-gray-400 block mb-1">Auto-Trade Strategy</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { key: "momentum",       label: "Momentum",    sub: "RSI/MACD/EMA" },
                        { key: "volume_profile", label: "Vol Profile", sub: "POC / value area" },
                        { key: "markov",         label: "Markov",      sub: "state transitions" },
                        { key: "order_flow",     label: "Order Flow",  sub: "CVD / delta / absorption" },
                      ] as const).map(opt => {
                        const active = (kalshiCfgStrategy || kalshiEngineState?.config.strategy || "momentum") === opt.key;
                        return (
                          <button
                            key={opt.key}
                            onClick={() => setKalshiCfgStrategy(opt.key)}
                            className={`rounded-lg px-1.5 py-2 text-center border transition-colors ${active ? "bg-indigo-600/40 border-indigo-500/50 text-indigo-200" : "bg-gray-800/60 border-gray-700/60 text-gray-400 hover:text-gray-200"}`}
                          >
                            <span className="block text-[10px] font-bold leading-tight">{opt.label}</span>
                            <span className="block text-[8px] text-gray-500 leading-tight mt-0.5">{opt.sub}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { label: "Contracts/trade", val: kalshiCfgContracts, set: setKalshiCfgContracts, ph: String(kalshiEngineState?.config.contractsPerTrade ?? 5) },
                      { label: "Max open trades", val: kalshiCfgMaxTrades,  set: setKalshiCfgMaxTrades,  ph: String(kalshiEngineState?.config.maxOpenTrades ?? 3) },
                      { label: "Cooldown (min)",   val: kalshiCfgCooldown,   set: setKalshiCfgCooldown,   ph: String(kalshiEngineState?.config.cooldownMinutes ?? 20) },
                      { label: "Min confidence %", val: kalshiCfgConfidence, set: setKalshiCfgConfidence, ph: String(kalshiEngineState?.config.minConfidence ?? 60) },
                    ] as const).map(f => (
                      <div key={f.label}>
                        <label className="text-[9px] text-gray-400 block mb-0.5">{f.label}</label>
                        <input type="number" value={f.val} placeholder={f.ph}
                          onChange={e => (f.set as any)(e.target.value)}
                          className="w-full bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5" />
                      </div>
                    ))}
                  </div>
                  <button onClick={saveKalshiConfig} disabled={saveKalshiConfigMutation.isPending}
                    className="w-full mt-3 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 text-xs font-bold rounded-lg py-2">
                    Save Config
                  </button>
                </div>
              )}

              {/* Open Kalshi trades */}
              {(kalshiEngineState?.openTrades.length ?? 0) > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold text-indigo-300">Open Kalshi Trades</p>
                  {kalshiEngineState!.openTrades.map(t => (
                    <div key={t.id} className="bg-black/30 border border-indigo-800/40 rounded-xl p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] text-gray-200 leading-snug truncate">{t.subtitle}</p>
                          <p className={`text-[9px] font-bold mt-0.5 ${t.signal.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                            {t.signal.direction} signal · {t.signal.confidence}% conf · BTC ${fmtPrice(t.signal.btcPrice)}
                          </p>
                        </div>
                        <button onClick={() => closeKalshiTradeMutation.mutate(t.id)} className="shrink-0 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-2">
                        <div><p className="text-[8px] text-gray-500">Entry</p><p className="text-[10px] font-bold text-white">{t.entryPriceCents}¢</p></div>
                        <div><p className="text-[8px] text-gray-500">Contracts</p><p className="text-[10px] font-bold text-white">{t.count}</p></div>
                        <div><p className="text-[8px] text-gray-500">Stake</p><p className="text-[10px] font-bold text-white">${fmt(t.stake)}</p></div>
                      </div>
                      {!t.paper && <p className="text-[8px] text-emerald-400/70 mt-1.5">● LIVE ORDER</p>}
                      {t.paper  && <p className="text-[8px] text-amber-400/70 mt-1.5">○ PAPER</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Polymarket Live Mode (VPN) ────────────────────────────────────── */}
        <div className="bg-gray-900/50 border border-gray-800/60 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-bold text-white">Polymarket Live Mode</h2>
            <span className="text-[9px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">VPN Required (US)</span>
            {!(state?.isRunning) ? null : (
              <span className={`text-[9px] px-1.5 py-0.5 rounded ml-auto ${!(state as any)?.isPaperMode ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-gray-700 text-gray-400"}`}>
                {!(state as any)?.isPaperMode ? "LIVE" : "PAPER"}
              </span>
            )}
          </div>
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2 mb-3">
            <p className="text-[9px] text-amber-200/80 leading-snug">
              Polymarket is geo-blocked for US IPs. Use a <strong className="text-amber-300">VPN</strong> connecting outside the US before enabling live mode.
              Your Polygon private key signs CLOB orders directly — never shared, stored on-server only.
            </p>
          </div>

          {/* Private key setup */}
          {!polyKeyStatus?.saved ? (
            !showPolyKeySetup ? (
              <button onClick={() => setShowPolyKeySetup(true)}
                className="w-full flex items-center gap-2 bg-gray-800/60 hover:bg-gray-800 border border-dashed border-gray-700 text-gray-400 text-xs rounded-xl px-4 py-2.5">
                <KeyRound className="w-4 h-4 shrink-0" />
                <div className="text-left">
                  <p className="font-semibold text-gray-300">Save Polygon Private Key</p>
                  <p className="text-[9px] text-gray-600">Required to sign live CLOB orders on Polymarket</p>
                </div>
              </button>
            ) : (
              <div className="space-y-2 bg-black/20 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  <p className="text-[9px] text-amber-300/80">Private key stored on VEDD server. Use a dedicated trading-only wallet with limited USDC.</p>
                </div>
                <div className="relative">
                  <input
                    type={showPolyKey ? "text" : "password"}
                    placeholder="0x... (64-char hex private key)"
                    value={polyPrivateKey}
                    onChange={e => setPolyPrivateKey(e.target.value)}
                    className="w-full bg-gray-900 border border-gray-700 rounded-lg text-xs text-white px-3 py-2 pr-9 font-mono focus:outline-none focus:border-amber-500"
                  />
                  <button onClick={() => setShowPolyKey(v => !v)} className="absolute right-2.5 top-2.5 text-gray-500 hover:text-gray-300">
                    {showPolyKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => savePolyKeyMutation.mutate(polyPrivateKey)}
                    disabled={savePolyKeyMutation.isPending || !polyPrivateKey}
                    className="flex-1 bg-amber-600/20 hover:bg-amber-600/30 border border-amber-500/30 text-amber-300 text-xs font-bold rounded-lg py-2 disabled:opacity-50"
                  >
                    {savePolyKeyMutation.isPending ? "Saving…" : "Save Key"}
                  </button>
                  <button onClick={() => setShowPolyKeySetup(false)} className="text-xs text-gray-500 px-3">Cancel</button>
                </div>
              </div>
            )
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between bg-gray-800/40 border border-gray-700/40 rounded-xl px-3 py-2">
                <div>
                  <p className="text-[9px] text-gray-500">Private key saved</p>
                  <p className="text-[10px] text-gray-300 font-mono">{polyKeyStatus.maskedKey}</p>
                </div>
                <button onClick={() => deletePolyKeyMutation.mutate()} className="text-[9px] text-red-400/70 hover:text-red-400">Remove</button>
              </div>
              <button
                onClick={() => toggleLiveModeMutation.mutate(!(state as any)?.isPaperMode === false)}
                disabled={toggleLiveModeMutation.isPending}
                className={`w-full text-xs font-bold rounded-xl py-2.5 border transition-colors ${
                  !(state as any)?.isPaperMode
                    ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400 hover:bg-red-500/20 hover:border-red-500/30 hover:text-red-400"
                    : "bg-gray-800/40 border-gray-700 text-gray-400 hover:bg-emerald-500/10 hover:border-emerald-500/20 hover:text-emerald-400"
                }`}
              >
                {!(state as any)?.isPaperMode ? "Live Mode ON — click to disable" : "Enable Live Mode (VPN required)"}
              </button>
            </div>
          )}
        </div>

        {/* ── Wallet ───────────────────────────────────────────────────────── */}
        {savedWallet?.address ? (
          <div className="flex items-center gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-4 py-3">
            <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-emerald-300">Polygon Wallet Connected</p>
              <p className="text-[10px] text-gray-400 font-mono truncate">{savedWallet.address.slice(0, 8)}…{savedWallet.address.slice(-6)}</p>
            </div>
            <Link href="/polymarket-wallet">
              <button className="flex items-center gap-1 text-[10px] text-emerald-400 shrink-0">
                Manage <ExternalLink className="w-3 h-3" />
              </button>
            </Link>
          </div>
        ) : (
          <Link href="/polymarket-wallet">
            <button className="w-full flex items-center gap-3 bg-purple-500/10 border border-purple-500/30 border-dashed rounded-xl px-4 py-3 hover:bg-purple-500/15 transition-colors">
              <Wallet className="w-4 h-4 text-purple-400 shrink-0" />
              <div className="flex-1 text-left">
                <p className="text-xs font-bold text-purple-300">Connect Polygon Wallet</p>
                <p className="text-[10px] text-gray-500">Required for Polymarket live execution — USDC on Polygon</p>
              </div>
              <ExternalLink className="w-4 h-4 text-purple-400 shrink-0" />
            </button>
          </Link>
        )}

        {/* ── Engine Controls ───────────────────────────────────────────────── */}
        <div className={`bg-gray-900/60 border rounded-xl p-4 ${isRunning ? "border-emerald-700/40" : "border-gray-800"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <h2 className="text-sm font-bold text-white">Prediction Engine</h2>
              <span className="text-[9px] text-gray-500 bg-gray-800/60 px-1.5 py-0.5 rounded">Polymarket</span>
            </div>
            <button
              onClick={openConfigPanel}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white px-2 py-1 bg-gray-800/60 rounded-lg"
            >
              <Settings className="w-3 h-3" />Config
              {showConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-black/30 rounded-lg p-2 text-center">
              <p className="text-[9px] text-gray-500">Open</p>
              <p className="text-sm font-bold text-white">{openCount}</p>
            </div>
            <div className="bg-black/30 rounded-lg p-2 text-center">
              <p className="text-[9px] text-gray-500">Closed</p>
              <p className="text-sm font-bold text-white">{closedCount}</p>
            </div>
            <div className={`rounded-lg p-2 text-center border ${pnlBg(totalPnl)}`}>
              <p className="text-[9px] text-gray-500">P&L</p>
              <p className={`text-sm font-bold ${pnlColor(totalPnl)}`}>{totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}</p>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            {isRunning ? (
              <button onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg py-2.5">
                <Square className="w-3.5 h-3.5" />Stop Engine
              </button>
            ) : (
              <button onClick={() => startMutation.mutate()} disabled={startMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg py-2.5">
                <Play className="w-3.5 h-3.5" />Start Engine
              </button>
            )}
            <button onClick={() => scanMutation.mutate()} disabled={scanMutation.isPending}
              className="flex items-center gap-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg px-3 py-2.5">
              <RefreshCw className={`w-3.5 h-3.5 ${scanMutation.isPending ? "animate-spin" : ""}`} />Scan Now
            </button>
          </div>

          {state?.lastScanAt && (
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <p className="text-[9px] text-gray-500">Last scan: {timeAgo(state.lastScanAt)}</p>
              {state.lastScanResult && <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{state.lastScanResult}</p>}
            </div>
          )}

          {showConfig && (
            <div className="mt-3 bg-black/30 rounded-xl p-3 border border-gray-700/40">
              <p className="text-[10px] font-bold text-gray-300 mb-3">Engine Config</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: "Min Bullish %", val: cfgBullish, set: setCfgBullish },
                  { label: "Min Bearish %", val: cfgBearish, set: setCfgBearish },
                  { label: "Stake ($)", val: cfgStake, set: setCfgStake },
                  { label: "Max positions", val: cfgMaxPos, set: setCfgMaxPos },
                  { label: "Cooldown (min)", val: cfgCooldown, set: setCfgCooldown },
                ] as const).map(f => (
                  <div key={f.label}>
                    <label className="text-[9px] text-gray-400 block mb-0.5">{f.label}</label>
                    <input type="number" value={f.val} onChange={e => (f.set as any)(e.target.value)}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5" />
                  </div>
                ))}
              </div>
              <button onClick={saveConfig} disabled={configMutation.isPending}
                className="w-full mt-3 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-lg py-2">
                Save Config
              </button>
            </div>
          )}
        </div>

        {/* ── Open Positions ────────────────────────────────────────────────── */}
        {openCount > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-purple-400" />
                <h2 className="text-sm font-bold text-white">Open Positions</h2>
                <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">{openCount}</Badge>
              </div>
              <button onClick={() => closeAllMutation.mutate()} disabled={closeAllMutation.isPending}
                className="text-[10px] text-red-400/70 hover:text-red-400">Close all</button>
            </div>
            <div className="space-y-2">
              {state!.openPositions.map(pos => (
                <div key={pos.id} className={`border rounded-xl p-3 ${pnlBg(pos.unrealizedPnl)}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-[10px] text-gray-300 leading-tight line-clamp-2 flex-1">{pos.market.question}</p>
                    <button onClick={() => closePosMutation.mutate(pos.id)} className="shrink-0 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400"><X className="w-3 h-3" /></button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div><p className="text-[8px] text-gray-500">Side</p><p className={`text-[10px] font-bold ${pos.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{pos.side}</p></div>
                    <div><p className="text-[8px] text-gray-500">Entry</p><p className="text-[10px] font-bold text-white">{pos.entryProbability}%</p></div>
                    <div><p className="text-[8px] text-gray-500">Now</p><p className={`text-[10px] font-bold ${pos.currentProbability > pos.entryProbability ? "text-emerald-400" : "text-red-400"}`}>{pos.currentProbability}%</p></div>
                    <div><p className="text-[8px] text-gray-500">P&L</p><p className={`text-[10px] font-bold ${pnlColor(pos.unrealizedPnl)}`}>{pos.unrealizedPnl >= 0 ? "+" : ""}{fmt(pos.unrealizedPnl)}</p></div>
                  </div>
                  <p className="text-[8px] text-gray-600 mt-1.5">Stake ${fmt(pos.stake)} · {timeAgo(pos.openedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Closed Positions ─────────────────────────────────────────────── */}
        {closedCount > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-bold text-white">Position History</h2>
              <Badge className="text-[9px] bg-gray-700 text-gray-400">{closedCount}</Badge>
              <span className={`ml-auto text-xs font-bold ${pnlColor(state!.totalRealizedPnl)}`}>
                Realized: {state!.totalRealizedPnl >= 0 ? "+" : ""}{fmt(state!.totalRealizedPnl)}
              </span>
            </div>
            <div className="space-y-2">
              {state!.closedPositions.slice(0, 10).map(pos => (
                <div key={pos.id} className="bg-black/20 border border-gray-800/60 rounded-xl p-3">
                  <p className="text-[10px] text-gray-300 mb-2 line-clamp-1">{pos.market.question}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div><p className="text-[8px] text-gray-500">Side</p><p className={`text-[10px] font-bold ${pos.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{pos.side}</p></div>
                    <div><p className="text-[8px] text-gray-500">Entry</p><p className="text-[10px] text-gray-300">{pos.entryProbability}%</p></div>
                    <div><p className="text-[8px] text-gray-500">Exit</p><p className="text-[10px] text-gray-300">{pos.closedProbability}%</p></div>
                    <div><p className="text-[8px] text-gray-500">P&L</p><p className={`text-[10px] font-bold ${pnlColor(pos.realizedPnl ?? 0)}`}>{(pos.realizedPnl ?? 0) >= 0 ? "+" : ""}{fmt(pos.realizedPnl ?? 0)}</p></div>
                  </div>
                  <p className="text-[8px] text-gray-600 mt-1.5">{pos.status === "resolved" ? "✅ Resolved" : "Closed"} {pos.closedAt ? timeAgo(pos.closedAt) : ""}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Polymarket near-term markets (supplemental, collapsible) ──────── */}
        <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowPolymarkets(v => !v)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-800/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-500" />
              <span className="text-xs font-bold text-gray-400">Polymarket BTC Markets (supplemental)</span>
              <span className="text-[9px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">Not US-accessible</span>
            </div>
            {showPolymarkets ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
          </button>

          {showPolymarkets && (
            <div className="px-4 pb-4 space-y-2">
              <p className="text-[9px] text-gray-500 pb-1">
                Near-term BTC price markets (≤30 days). Polymarket is not available to US residents.
                Use as supplemental market sentiment only.
              </p>
              {!polyData || polyData.markets.length === 0 ? (
                <p className="text-[10px] text-gray-600 text-center py-3">
                  {polyData?.error ? "Polymarket unavailable" : "No near-term BTC markets found"}
                </p>
              ) : (
                polyData.markets.slice(0, 5).map((m, i) => (
                  <div key={m.id || i} className="bg-black/30 border border-gray-800/60 rounded-lg p-3">
                    <p className="text-[10px] text-gray-300 mb-2 leading-snug">{m.question}</p>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-bold ${m.yesProbability >= 60 ? "text-emerald-400" : m.yesProbability <= 40 ? "text-red-400" : "text-gray-300"}`}>
                        YES {m.yesProbability}%
                      </span>
                      <span className="text-[10px] text-gray-500">·</span>
                      <span className="text-[10px] text-gray-400">NO {m.noProbability}%</span>
                      <span className="text-[10px] text-gray-500">·</span>
                      <span className={`text-[9px] ${m.direction === "bullish" ? "text-emerald-500" : "text-red-500"}`}>
                        {m.direction === "bullish" ? "↑ bull" : "↓ bear"}
                      </span>
                      {m.msUntilEnd != null && (
                        <>
                          <span className="text-[10px] text-gray-500">·</span>
                          <span className="text-[9px] text-gray-500 flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />{fmtTimeUntil(m.msUntilEnd)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
