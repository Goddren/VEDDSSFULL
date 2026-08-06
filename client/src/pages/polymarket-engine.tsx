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
  BarChart2, BarChart3, Info, Shield, Eye, EyeOff,
  AlertTriangle, KeyRound, Brain,
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
  coin?: "BTC" | "ETH" | "SOL" | "XRP" | "DOGE";
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
    symbols: string[];
    contractsPerTrade: number;
    maxOpenTrades: number;
    cooldownMinutes: number;
    minConfidence: number;
    requireAlignedHourly: boolean;
    requireConfluence: boolean;
    strategy: "momentum" | "volume_profile" | "markov" | "order_flow" | "ensemble" | "auto";
    autoTradeValuePicks: boolean;
    minValueScore: number;
    takeProfitCents: number;
    stopLossCents: number;
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

// ── AI Prediction Review panel — best options to WIN, ranked by the AI ─────────
function AiPredictionReviewPanel() {
  const { data, refetch, isFetching } = useQuery<{
    kalshiPicks: any[];
    strategyStats: Array<{ strategy: string; winRate: number; trades: number; totalPnl: number }>;
    engines: { kalshi: any; polymarketUs: any };
    aiReview: null | {
      topPicks: Array<{ market: string; winProbability: number; whyItWins: string; strategy: string; suggestedStakeUsd: number; riskNote: string }>;
      overallRead: string;
      bestStrategyNow: string;
    };
  }>({
    queryKey: ["/api/predictions/ai-review"],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
  });

  const review = data?.aiReview;
  return (
    <div className="mb-3 bg-violet-950/30 border border-violet-700/40 rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5 text-violet-400" />
          <span className="text-[11px] font-bold text-violet-300">AI Review — Best Options to Win</span>
          <span className="text-[8px] text-gray-500">Kalshi + Polymarket · edge + track record</span>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="text-[9px] text-violet-300 hover:text-violet-100 px-2 py-0.5 bg-violet-500/10 border border-violet-500/25 rounded disabled:opacity-50"
        >
          {isFetching ? "Reviewing…" : "↻ Review"}
        </button>
      </div>

      {!data ? (
        <p className="text-[9px] text-gray-500">Running AI review of live markets…</p>
      ) : !review || !review.topPicks?.length ? (
        <p className="text-[9px] text-gray-500">
          {data.kalshiPicks?.length
            ? "No high-probability edge right now — the AI recommends waiting rather than forcing a trade. Picks refresh every 5 min."
            : "No live picks available yet — start the Kalshi engine or wait for the next market window."}
        </p>
      ) : (
        <>
          {review.overallRead && <p className="text-[9px] text-gray-400 mb-2 leading-snug">{review.overallRead}</p>}
          <div className="space-y-1.5">
            {review.topPicks.slice(0, 5).map((p, i) => (
              <div key={i} className="bg-black/30 rounded-lg px-2.5 py-2 border border-violet-800/30">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-gray-100 truncate">{p.market}</span>
                  <span className={`text-[10px] font-black flex-shrink-0 ${p.winProbability >= 75 ? "text-emerald-400" : p.winProbability >= 60 ? "text-amber-400" : "text-gray-400"}`}>
                    {p.winProbability}% win
                  </span>
                </div>
                <p className="text-[8px] text-gray-400 leading-snug mt-0.5">{p.whyItWins}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">{p.strategy}</span>
                  {p.suggestedStakeUsd > 0 && <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300">stake ~${Math.round(p.suggestedStakeUsd)}</span>}
                  {p.riskNote && <span className="text-[8px] text-gray-500">{p.riskNote}</span>}
                </div>
              </div>
            ))}
          </div>
          {review.bestStrategyNow && (
            <p className="text-[8px] text-violet-300/80 mt-2">⚡ Strategy with the edge right now: {review.bestStrategyNow}</p>
          )}
        </>
      )}
    </div>
  );
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
  // Which coins' hourly bracket markets to scan (was BTC-only) — empty array
  // means "untouched this session", falls back to the saved server config.
  const [kalshiCfgSymbols, setKalshiCfgSymbols] = useState<string[]>([]);
  const [kalshiCfgContracts, setKalshiCfgContracts] = useState("");
  const [kalshiCfgMaxTrades, setKalshiCfgMaxTrades] = useState("");
  const [kalshiCfgCooldown, setKalshiCfgCooldown]   = useState("");
  const [kalshiCfgConfidence, setKalshiCfgConfidence] = useState("");
  const [kalshiCfgStrategy, setKalshiCfgStrategy] = useState<"" | "momentum" | "volume_profile" | "markov" | "order_flow" | "ensemble" | "auto">("");
  const [kalshiCfgAutoValue, setKalshiCfgAutoValue] = useState<boolean | null>(null);
  const [kalshiCfgConfluence, setKalshiCfgConfluence] = useState<boolean | null>(null);
  const [kalshiCfgMinScore, setKalshiCfgMinScore]   = useState("");
  const [kalshiCfgTakeProfit, setKalshiCfgTakeProfit] = useState("");
  const [kalshiCfgStopLoss, setKalshiCfgStopLoss]   = useState("");

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

  // High-value / high-accuracy bracket picks (all strategies + value model)
  const { data: kalshiValuePicks, refetch: refetchValuePicks, isFetching: valuePicksLoading } = useQuery<{
    consensus: { direction: string; confidence: number; agreement: number; reasons: string[] };
    btcPrice: number;
    eventTicker: string | null;
    minutesToClose: number | null;
    picks: Array<{ ticker: string; subtitle: string; strikeType: string; marketAskCents: number; modelProbPct: number; edgePct: number; valueScore: number; confidence: number; agreement: number; rationale: string }>;
    scannedAt: string;
  }>({
    queryKey: ["/api/kalshi/value-picks"],
    refetchInterval: 60000,
    enabled: !!user,
  });

  // Per-strategy win-rate / P&L history (learning loop)
  const { data: kalshiPerf } = useQuery<{
    byStrategy: Array<{ strategy: string; trades: number; wins: number; losses: number; breakeven: number; totalPnl: number; winRate: number; lastResult: string | null }>;
    totals: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
  }>({
    queryKey: ["/api/kalshi/performance"],
    refetchInterval: 30000,
    enabled: !!user,
  });

  // Live per-strategy scan (signal + accuracy) — drives "Auto (Best)" mode
  const { data: kalshiStratScan, isFetching: stratScanLoading, refetch: refetchStratScan } = useQuery<{
    rows: Array<{ strategy: string; label: string; direction: string; confidence: number; reason: string; winRate: number; decidedTrades: number; totalPnl: number; selectScore: number; selected: boolean }>;
    selected: string | null;
    btcPrice: number;
    scannedAt: string;
  }>({
    queryKey: ["/api/kalshi/strategy-scan"],
    refetchInterval: 60000,
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
    if (kalshiCfgSymbols.length) patch.symbols = kalshiCfgSymbols;
    if (kalshiCfgContracts)  patch.contractsPerTrade = Number(kalshiCfgContracts);
    if (kalshiCfgMaxTrades)  patch.maxOpenTrades     = Number(kalshiCfgMaxTrades);
    if (kalshiCfgCooldown)   patch.cooldownMinutes   = Number(kalshiCfgCooldown);
    if (kalshiCfgConfidence) patch.minConfidence     = Number(kalshiCfgConfidence);
    if (kalshiCfgStrategy)   patch.strategy          = kalshiCfgStrategy;
    if (kalshiCfgAutoValue !== null) patch.autoTradeValuePicks = kalshiCfgAutoValue;
    if (kalshiCfgConfluence !== null) patch.requireConfluence = kalshiCfgConfluence;
    if (kalshiCfgMinScore)   patch.minValueScore     = Number(kalshiCfgMinScore);
    if (kalshiCfgTakeProfit) patch.takeProfitCents   = Number(kalshiCfgTakeProfit);
    if (kalshiCfgStopLoss)   patch.stopLossCents     = Number(kalshiCfgStopLoss);
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

  // ── Polymarket US (no-VPN) connection ──────────────────────────────────────
  const [pmUsKeyId, setPmUsKeyId] = useState("");
  const [pmUsSecret, setPmUsSecret] = useState("");
  const [pmUsShowForm, setPmUsShowForm] = useState(false);
  const { data: pmUsStatus, refetch: refetchPmUs } = useQuery<{ configured: boolean; connected?: boolean; status?: number; detail?: any }>({
    queryKey: ["/api/polymarket-us/status"],
    refetchInterval: 60000,
    enabled: !!user,
  });
  const savePmUsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/polymarket-us/credentials", { keyId: pmUsKeyId, secretKey: pmUsSecret }).then(r => r.json()),
    onSuccess: (data: any) => {
      toast({ title: data.connected ? "Polymarket US connected ✅" : "Saved — connection check", description: data.message });
      setPmUsSecret(""); setPmUsKeyId(""); setPmUsShowForm(false);
      refetchPmUs();
    },
    onError: (e: any) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  // ── Polymarket US ENGINE (same strategies as Kalshi) ───────────────────────
  const { data: pmUsEngine } = useQuery<any>({
    queryKey: ["/api/polymarket-us-engine/status"], refetchInterval: 8000, enabled: !!user,
  });
  const [pmUsEngStrat, setPmUsEngStrat] = useState<string>("");
  const pmUsEngAct = (action: "start" | "stop" | "scan") =>
    apiRequest("POST", `/api/polymarket-us-engine/${action}`).then(() => queryClient.invalidateQueries({ queryKey: ["/api/polymarket-us-engine/status"] }));
  const pmUsEngSaveStrat = (strategy: string) => {
    setPmUsEngStrat(strategy);
    apiRequest("PUT", "/api/polymarket-us-engine/config", { strategy }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/polymarket-us-engine/status"] }));
  };

  // ── Sports Predictions ────────────────────────────────────────────────────
  const [sportFilter, setSportFilter] = useState<string>("all");
  const [showSports, setShowSports] = useState(true);
  const [showSportsConfig, setShowSportsConfig] = useState(false);
  const [sportsMinEdge, setSportsMinEdge] = useState("");
  const [sportsStake, setSportsStake] = useState("");
  const [sportsMaxPos, setSportsMaxPos] = useState("");
  const [sportsMinConf, setSportsMinConf] = useState<"high"|"medium">("high");

  const { data: sportsPredictions, isFetching: sportsLoading } = useQuery<any[]>({
    queryKey: ["/api/sports/predictions"],
    refetchInterval: 15 * 60 * 1000,
    staleTime: 14 * 60 * 1000,
    enabled: !!user,
  });
  const { data: sportsEngine, refetch: refetchSportsEngine } = useQuery<any>({
    queryKey: ["/api/sports-engine/status"],
    refetchInterval: 10000,
    enabled: !!user,
  });
  const refreshSportsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sports/refresh").then(r => r.json()),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/sports/predictions"] }); toast({ title: "Sports predictions refreshed" }); },
  });
  const startSportsEngineMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sports-engine/start").then(r => r.json()),
    onSuccess: () => { refetchSportsEngine(); toast({ title: "Sports engine started" }); },
  });
  const stopSportsEngineMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sports-engine/stop").then(r => r.json()),
    onSuccess: () => { refetchSportsEngine(); toast({ title: "Sports engine stopped" }); },
  });
  const scanSportsMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/sports-engine/scan").then(r => r.json()),
    onSuccess: (d: any) => { refetchSportsEngine(); toast({ title: d.fired > 0 ? `${d.fired} trade(s) opened!` : "Scan complete — no trades", description: d.reason }); },
  });
  const saveSportsConfigMutation = useMutation({
    mutationFn: (cfg: any) => apiRequest("PUT", "/api/sports-engine/config", cfg).then(r => r.json()),
    onSuccess: () => { refetchSportsEngine(); setShowSportsConfig(false); toast({ title: "Sports engine config saved" }); },
  });
  const closeSportsTradeMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/sports-engine/trades/${id}/close`).then(r => r.json()),
    onSuccess: () => refetchSportsEngine(),
  });

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

        {/* ── Polymarket US (CFTC-regulated, NO VPN) connection ──────────────── */}
        <div className="rounded-xl p-4" style={{ background: "rgba(16,185,129,0.07)", border: "1.5px solid rgba(16,185,129,0.3)" }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🇺🇸</span>
              <h2 className="text-sm font-bold text-emerald-300">Polymarket US — No VPN</h2>
              {pmUsStatus?.configured && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${pmUsStatus.connected ? "bg-emerald-500/20 text-emerald-300" : "bg-amber-500/20 text-amber-300"}`}>
                  {pmUsStatus.connected ? "CONNECTED" : `CHECK (HTTP ${pmUsStatus.status ?? "?"})`}
                </span>
              )}
            </div>
            <button onClick={() => setPmUsShowForm(v => !v)} className="text-[10px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded px-2 py-1">
              {pmUsStatus?.configured ? "Update key" : "Connect"}
            </button>
          </div>
          <p className="text-[10px] text-gray-400 mb-2">
            Connect the regulated <span className="text-emerald-300">api.polymarket.us</span> exchange with your API key — works from the US with no VPN. Read-only is safe; trading runs through your own key.
          </p>
          {pmUsShowForm && (
            <div className="space-y-2 bg-black/25 rounded-lg p-2.5">
              <p className="text-[9px] text-gray-500">Get these in the Polymarket US app/site → Settings → API. Your secret is encrypted on the server.</p>
              <input value={pmUsKeyId} onChange={e => setPmUsKeyId(e.target.value)} placeholder="Key ID"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5" />
              <input value={pmUsSecret} onChange={e => setPmUsSecret(e.target.value)} placeholder="Secret Key" type="password" autoComplete="off"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5" />
              <button onClick={() => savePmUsMutation.mutate()} disabled={savePmUsMutation.isPending || !pmUsKeyId.trim() || !pmUsSecret.trim()}
                className="w-full bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 text-xs font-bold rounded-lg py-2 disabled:opacity-50">
                {savePmUsMutation.isPending ? "Connecting…" : "Save & Test Connection"}
              </button>
            </div>
          )}
        </div>

        {/* ── Polymarket US Auto-Trade Engine (same strategies as Kalshi) ────── */}
        <div className={`rounded-xl p-4 ${pmUsEngine?.isRunning ? "border-emerald-600/60" : "border-emerald-800/40"}`} style={{ background: "rgba(16,185,129,0.05)", border: "1.5px solid rgba(16,185,129,0.25)" }}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Activity className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-white">Polymarket US Engine</h2>
              <span className="text-[9px] text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 rounded">No VPN</span>
              {pmUsEngine && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${pmUsEngine.isPaperMode ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                  {pmUsEngine.isPaperMode ? "PAPER" : "LIVE"}
                </span>
              )}
              {pmUsEngine?.isRunning && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">● RUNNING</span>}
            </div>
          </div>

          {/* Strategy selector — same options as Kalshi */}
          <label className="text-[9px] text-gray-400 block mb-1">Strategy (shared with Kalshi)</label>
          <div className="grid grid-cols-3 gap-1.5 mb-3">
            {(["auto", "ensemble", "momentum", "volume_profile", "markov", "order_flow"] as const).map(k => {
              const active = (pmUsEngStrat || pmUsEngine?.config?.strategy || "ensemble") === k;
              const lbl = k === "auto" ? "🤖 Auto" : k === "volume_profile" ? "Vol Profile" : k === "order_flow" ? "Order Flow" : k === "ensemble" ? "AI Ensemble ★" : k.charAt(0).toUpperCase() + k.slice(1);
              return (
                <button key={k} onClick={() => pmUsEngSaveStrat(k)}
                  className={`rounded-lg px-1.5 py-1.5 text-[10px] font-bold border ${active ? "bg-emerald-600/40 border-emerald-500/50 text-emerald-100" : "bg-gray-800/60 border-gray-700/60 text-gray-400"}`}>
                  {lbl}
                </button>
              );
            })}
          </div>

          {/* Controls */}
          <div className="flex gap-2 mb-2">
            {pmUsEngine?.isRunning ? (
              <button onClick={() => pmUsEngAct("stop")} className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/20 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg py-2.5">
                <Square className="w-3.5 h-3.5" />Stop
              </button>
            ) : (
              <button onClick={() => pmUsEngAct("start")} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs font-bold rounded-lg py-2.5">
                <Play className="w-3.5 h-3.5" />Start Engine
              </button>
            )}
            <button onClick={() => pmUsEngAct("scan")} className="flex items-center gap-1.5 bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg px-3 py-2.5">
              <RefreshCw className="w-3.5 h-3.5" />Scan
            </button>
          </div>

          {pmUsEngine?.lastScanResult && (
            <p className="text-[10px] text-gray-400 bg-black/20 rounded-lg px-2 py-1.5">{pmUsEngine.lastScanResult}</p>
          )}

          {(pmUsEngine?.openTrades?.length ?? 0) > 0 && (
            <div className="mt-2 space-y-1">
              {pmUsEngine.openTrades.map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-[10px] bg-black/25 rounded px-2 py-1">
                  <span className="text-gray-200 truncate max-w-[55%]">{t.title}</span>
                  <span className={`font-bold ${t.side === "yes" ? "text-emerald-400" : "text-red-400"}`}>{t.side.toUpperCase()} {t.entryPriceCents}¢</span>
                  <span className={`font-bold ${t.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{t.unrealizedPnl >= 0 ? "+" : ""}${t.unrealizedPnl?.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[8px] text-gray-600 mt-2">Runs the exact Kalshi strategies on the regulated Polymarket US exchange. Auto-trades crypto markets when available; idle (live) if none are listed yet. {pmUsEngine?.isPaperMode && "PAPER until your API key connects above."}</p>
        </div>

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
                  {kalshiEngineState.config.strategy === "auto" ? "🤖 Auto (Best)" : kalshiEngineState.config.strategy === "ensemble" ? "AI Ensemble" : kalshiEngineState.config.strategy === "volume_profile" ? "Vol Profile" : kalshiEngineState.config.strategy === "markov" ? "Markov" : kalshiEngineState.config.strategy === "order_flow" ? "Order Flow" : "Momentum"}
                </span>
              )}
            </div>
            <button onClick={() => setShowKalshiConfig(v => !v)} className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white px-2 py-1 bg-gray-800/60 rounded-lg">
              <Settings className="w-3 h-3" />
              {showKalshiConfig ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          </div>

          {/* ── AI Review — best options to WIN (Kalshi + Polymarket) ────────── */}
          <AiPredictionReviewPanel />

          {/* ── High-Value Picks (all strategies + value model) ─────────────── */}
          <div className="mb-3 bg-emerald-950/30 border border-emerald-800/40 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-[11px] font-bold text-emerald-300">High-Value Picks</span>
                <span className="text-[8px] text-gray-500">all strategies · edge-ranked</span>
              </div>
              <button
                onClick={() => refetchValuePicks()}
                disabled={valuePicksLoading}
                className="text-[9px] text-emerald-400 hover:text-emerald-200 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded disabled:opacity-50"
              >
                {valuePicksLoading ? "Scanning…" : "↻ Rescan"}
              </button>
            </div>

            {kalshiValuePicks?.consensus && (
              <div className="flex items-center gap-2 mb-2 text-[9px] flex-wrap">
                <span className={`px-1.5 py-0.5 rounded font-bold ${kalshiValuePicks.consensus.direction === "BUY" ? "bg-emerald-500/20 text-emerald-300" : kalshiValuePicks.consensus.direction === "SELL" ? "bg-red-500/20 text-red-300" : "bg-gray-500/20 text-gray-400"}`}>
                  Consensus: {kalshiValuePicks.consensus.direction}
                </span>
                <span className="text-gray-400">{Math.round(kalshiValuePicks.consensus.agreement * 100)}% agree · {kalshiValuePicks.consensus.confidence}% conf</span>
                {kalshiValuePicks.minutesToClose != null && (
                  <span className="text-gray-500">· closes in {kalshiValuePicks.minutesToClose}m</span>
                )}
              </div>
            )}

            {!kalshiValuePicks?.picks?.length ? (
              <p className="text-[10px] text-gray-500 py-1">
                {valuePicksLoading ? "Analyzing brackets across all strategies…" : "No positive-edge picks right now — strategies don't see a mispriced bracket. Rescans every 60s."}
              </p>
            ) : (
              <div className="space-y-1.5">
                {kalshiValuePicks.picks.map((p) => (
                  <div key={p.ticker} className="flex items-center justify-between gap-2 bg-gray-900/50 border border-gray-800/60 rounded-lg px-2.5 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-semibold text-white truncate">{p.subtitle}</p>
                      <p className="text-[8px] text-gray-500 truncate">{p.rationale}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="text-right">
                        <p className="text-[8px] text-gray-500">Edge</p>
                        <p className="text-[11px] font-bold text-emerald-400">+{p.edgePct}¢</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] text-gray-500">Model/Mkt</p>
                        <p className="text-[10px] font-mono text-gray-300">{p.modelProbPct}%/{p.marketAskCents}¢</p>
                      </div>
                      <span className="text-[9px] font-black px-1.5 py-1 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/25">
                        {p.valueScore}
                      </span>
                    </div>
                  </div>
                ))}
                <p className="text-[8px] text-gray-600 pt-0.5">Score = edge × agreement × confidence × learned win rate. Enable auto-trade in config to fire the top pick automatically.</p>
              </div>
            )}
          </div>

          {/* ── Strategy Performance (learning loop) ─────────────────────────── */}
          {(kalshiPerf?.byStrategy?.length ?? 0) > 0 && (
            <div className="mb-3 bg-indigo-950/30 border border-indigo-800/40 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-[11px] font-bold text-indigo-300">Strategy Win Rate</span>
                  <span className="text-[8px] text-gray-500">tracked over time · survives restarts</span>
                </div>
                {kalshiPerf && (
                  <span className="text-[9px] text-gray-400">
                    Overall {kalshiPerf.totals.winRate}% · {kalshiPerf.totals.wins}W/{kalshiPerf.totals.losses}L ·{" "}
                    <span className={kalshiPerf.totals.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
                      {kalshiPerf.totals.totalPnl >= 0 ? "+" : ""}${fmt(kalshiPerf.totals.totalPnl)}
                    </span>
                  </span>
                )}
              </div>
              <div className="space-y-1">
                {kalshiPerf!.byStrategy.map(st => {
                  const label = st.strategy === "volume_profile" ? "Vol Profile" : st.strategy === "order_flow" ? "Order Flow" : st.strategy === "consensus" ? "Value (consensus)" : st.strategy.charAt(0).toUpperCase() + st.strategy.slice(1);
                  return (
                    <div key={st.strategy} className="flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-gray-300 font-medium w-28 truncate">{label}</span>
                      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${st.winRate}%`, background: st.winRate >= 55 ? "#34d399" : st.winRate >= 45 ? "#fbbf24" : "#f87171" }} />
                      </div>
                      <span className="text-gray-400 w-9 text-right">{st.winRate}%</span>
                      <span className="text-gray-500 w-14 text-right">{st.wins}W/{st.losses}L</span>
                      <span className={`w-14 text-right font-bold ${st.totalPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{st.totalPnl >= 0 ? "+" : ""}${fmt(st.totalPnl)}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[8px] text-gray-600 mt-1.5">Win rate feeds back into value-pick scoring once a strategy has 5+ decided trades — proven strategies get prioritized.</p>
            </div>
          )}

          {/* Credential setup */}
          {!kalshiAccount?.connected ? (
            <div>
              {kalshiAccount?.error && !showKalshiSetup ? (
                // Credentials ARE saved but the check failed — a network blip,
                // rate limit, or Kalshi outage looks identical at the API layer
                // to bad credentials. Previously this collapsed into the same
                // "Connect Kalshi Account" onboarding screen as never-having-
                // connected at all, discarding the real error and making a
                // fully-connected user think their account was disconnected.
                // Show the actual error with a retry instead of implying they
                // need to re-enter keys.
                <div className="bg-amber-950/30 border border-amber-700/40 rounded-xl p-3 space-y-2">
                  <p className="text-[10px] font-bold text-amber-300 flex items-center gap-1.5">
                    <KeyRound className="w-3 h-3" /> Kalshi check failed — account may still be connected
                  </p>
                  <p className="text-[9px] text-amber-400/80 leading-relaxed break-words">{kalshiAccount.error}</p>
                  <div className="flex gap-2">
                    <button onClick={() => refetchKalshiAccount()} className="flex-1 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-200 text-xs font-bold rounded-lg py-2">
                      Retry check
                    </button>
                    <button onClick={() => setShowKalshiSetup(true)} className="text-xs text-gray-500 px-3">Re-enter key instead</button>
                  </div>
                </div>
              ) : !showKalshiSetup ? (
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
                    {/* Auto (Best) — full-width, picks best strategy by accuracy */}
                    {(() => {
                      const active = (kalshiCfgStrategy || kalshiEngineState?.config.strategy || "momentum") === "auto";
                      return (
                        <button
                          onClick={() => setKalshiCfgStrategy("auto")}
                          className={`w-full mb-1.5 rounded-lg px-2 py-2 text-center border transition-colors ${active ? "bg-emerald-600/40 border-emerald-500/60 text-emerald-100" : "bg-gray-800/60 border-gray-700/60 text-gray-400 hover:text-gray-200"}`}
                        >
                          <span className="block text-[10px] font-bold leading-tight">🤖 Auto (Best) — AI picks the strongest strategy</span>
                          <span className="block text-[8px] text-gray-400 leading-tight mt-0.5">Scans all 4 each cycle · trades whichever has the best live confidence × accuracy</span>
                        </button>
                      );
                    })()}
                    <div className="grid grid-cols-2 gap-1.5">
                      {([
                        { key: "ensemble",       label: "AI Ensemble", sub: "multi-factor + regime filter ★" },
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

                  {/* Symbol selector — which coins' hourly bracket markets to scan.
                      Was BTC-only; SOL sometimes has no currently-open hourly event
                      (skipped that cycle, not an error) so it's still offered. */}
                  <div className="mb-3">
                    <label className="text-[9px] text-gray-400 block mb-1">Coins to Trade</label>
                    <div className="grid grid-cols-5 gap-1.5">
                      {(["BTC", "ETH", "SOL", "XRP", "DOGE"] as const).map(coin => {
                        const current = kalshiCfgSymbols.length ? kalshiCfgSymbols : (kalshiEngineState?.config.symbols ?? ["BTC"]);
                        const active = current.includes(coin);
                        return (
                          <button
                            key={coin}
                            onClick={() => {
                              const base = kalshiCfgSymbols.length ? kalshiCfgSymbols : (kalshiEngineState?.config.symbols ?? ["BTC"]);
                              const next = base.includes(coin) ? base.filter(c => c !== coin) : [...base, coin];
                              setKalshiCfgSymbols(next.length ? next : ["BTC"]);
                            }}
                            className={`rounded-lg px-1.5 py-2 text-center border transition-colors ${active ? "bg-amber-600/40 border-amber-500/50 text-amber-200" : "bg-gray-800/60 border-gray-700/60 text-gray-400 hover:text-gray-200"}`}
                          >
                            <span className="block text-[10px] font-bold leading-tight">{coin}</span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[8px] text-gray-500 leading-snug mt-1">Engine scans each selected coin's hourly bracket market every cycle and trades the first one that clears every gate.</p>
                  </div>

                  {/* Confluence requirement */}
                  <label className="flex items-center justify-between cursor-pointer mb-3 bg-black/20 rounded-lg px-2.5 py-2">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-300">Require multi-strategy confluence</span>
                      <p className="text-[8px] text-gray-500 leading-snug mt-0.5">Only trade when ≥60% of strategies agree on direction. Strongly reduces losses from single-strategy whipsaws.</p>
                    </div>
                    <input
                      type="checkbox"
                      checked={kalshiCfgConfluence ?? kalshiEngineState?.config.requireConfluence ?? true}
                      onChange={e => setKalshiCfgConfluence(e.target.checked)}
                      className="accent-emerald-500 w-4 h-4 flex-shrink-0 ml-2"
                    />
                  </label>

                  {/* Compounding growth mode */}
                  <div className="mb-3 bg-black/20 rounded-lg px-2.5 py-2 border border-amber-500/20">
                    <label className="flex items-center justify-between cursor-pointer">
                      <div>
                        <span className="text-[10px] font-bold text-amber-300">📈 Compounding Growth Mode</span>
                        <p className="text-[8px] text-gray-500 leading-snug mt-0.5">Stake a % of your growing bankroll instead of a fixed contract count — wins automatically raise the next stake to grow the account fast.</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={(kalshiEngineState?.config as any)?.compounding ?? false}
                        onChange={e => saveKalshiConfigMutation.mutate({ compounding: e.target.checked })}
                        className="accent-amber-500 w-4 h-4 flex-shrink-0 ml-2"
                      />
                    </label>
                    {(kalshiEngineState?.config as any)?.compounding && (
                      <div className="flex items-center gap-3 mt-2">
                        <label className="text-[9px] text-gray-400">Risk per trade
                          <select
                            value={(kalshiEngineState?.config as any)?.riskPctPerTrade ?? 5}
                            onChange={e => saveKalshiConfigMutation.mutate({ riskPctPerTrade: parseInt(e.target.value) })}
                            className="ml-1.5 bg-gray-800 border border-gray-700 text-white rounded px-1.5 py-0.5 text-[9px]"
                          >
                            {[2, 3, 5, 8, 10, 15, 20].map(p => <option key={p} value={p}>{p}%</option>)}
                          </select>
                        </label>
                        <label className="text-[9px] text-gray-400">Starting bankroll $
                          <input
                            type="number" min={10} step={10}
                            defaultValue={(kalshiEngineState?.config as any)?.startingBankroll ?? 100}
                            onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v >= 10) saveKalshiConfigMutation.mutate({ startingBankroll: v }); }}
                            className="ml-1.5 w-16 bg-gray-800 border border-gray-700 text-white rounded px-1.5 py-0.5 text-[9px]"
                          />
                        </label>
                      </div>
                    )}
                  </div>

                  {/* Live strategy scan — the "column of scans per strategy" comparison */}
                  <div className="mb-3 bg-black/30 border border-gray-800/60 rounded-lg p-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold text-gray-300">Live Strategy Scan</span>
                      <button onClick={() => refetchStratScan()} disabled={stratScanLoading}
                        className="text-[9px] text-gray-400 hover:text-white px-1.5 py-0.5 bg-gray-800/60 rounded disabled:opacity-50">
                        {stratScanLoading ? "Scanning…" : "↻"}
                      </button>
                    </div>
                    {!kalshiStratScan?.rows?.length ? (
                      <p className="text-[9px] text-gray-500">Scanning all strategies…</p>
                    ) : (
                      <div className="space-y-1">
                        {kalshiStratScan.rows.map(r => (
                          <div key={r.strategy} className={`flex items-center justify-between gap-2 px-2 py-1 rounded ${r.selected ? "bg-emerald-500/15 border border-emerald-500/30" : "bg-gray-900/40"}`}>
                            <div className="flex items-center gap-1.5 min-w-0">
                              {r.selected && <span className="text-[8px] text-emerald-400 font-bold">★</span>}
                              <span className="text-[10px] text-gray-200 font-medium w-20 truncate">{r.label}</span>
                            </div>
                            <span className={`text-[9px] font-bold w-12 text-center ${r.direction === "BUY" ? "text-emerald-400" : r.direction === "SELL" ? "text-red-400" : "text-gray-500"}`}>{r.direction}</span>
                            <span className="text-[9px] text-gray-400 w-10 text-right">{r.confidence}%</span>
                            <span className="text-[9px] text-gray-500 w-16 text-right">{r.decidedTrades > 0 ? `${r.winRate}% acc` : "no hist"}</span>
                            <span className="text-[9px] font-bold text-indigo-300 w-8 text-right">{r.selectScore}</span>
                          </div>
                        ))}
                        <p className="text-[8px] text-gray-600 pt-0.5">★ = the pick "Auto (Best)" would trade now. Score = live confidence blended with historical accuracy (needs 3+ trades to weight accuracy).</p>
                      </div>
                    )}
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

                  {/* ── Auto-trade value picks + auto-exit ─────────────────── */}
                  <div className="mt-3 pt-3 border-t border-indigo-800/40">
                    <label className="flex items-center justify-between cursor-pointer mb-2">
                      <span className="text-[10px] font-bold text-emerald-300">Auto-trade High-Value Picks</span>
                      <input
                        type="checkbox"
                        checked={kalshiCfgAutoValue ?? kalshiEngineState?.config.autoTradeValuePicks ?? false}
                        onChange={e => setKalshiCfgAutoValue(e.target.checked)}
                        className="accent-emerald-500 w-4 h-4"
                      />
                    </label>
                    <p className="text-[8px] text-gray-500 mb-2 leading-snug">
                      When ON, the engine auto-buys the top edge-ranked pick (all-strategy consensus) instead of the single strategy above — and manages the exit below.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      {([
                        { label: "Min score",   val: kalshiCfgMinScore,   set: setKalshiCfgMinScore,   ph: String(kalshiEngineState?.config.minValueScore ?? 8) },
                        { label: "Take-profit ¢", val: kalshiCfgTakeProfit, set: setKalshiCfgTakeProfit, ph: String(kalshiEngineState?.config.takeProfitCents ?? 90) },
                        { label: "Stop-loss ¢",  val: kalshiCfgStopLoss,   set: setKalshiCfgStopLoss,   ph: String(kalshiEngineState?.config.stopLossCents ?? 25) },
                      ] as const).map(f => (
                        <div key={f.label}>
                          <label className="text-[9px] text-gray-400 block mb-0.5">{f.label}</label>
                          <input type="number" value={f.val} placeholder={f.ph}
                            onChange={e => (f.set as any)(e.target.value)}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5" />
                        </div>
                      ))}
                    </div>
                    <p className="text-[8px] text-gray-600 mt-1.5">Take-profit/Stop-loss close positions early at the contract price (¢). Set to 0 to disable and hold to settlement.</p>
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
                      <div className="grid grid-cols-4 gap-1.5 mt-2">
                        <div><p className="text-[8px] text-gray-500">Entry</p><p className="text-[10px] font-bold text-white">{t.entryPriceCents}¢</p></div>
                        <div><p className="text-[8px] text-gray-500">Now</p><p className="text-[10px] font-bold text-white">{t.currentPriceCents}¢</p></div>
                        <div><p className="text-[8px] text-gray-500">P&L</p><p className={`text-[10px] font-bold ${t.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>{t.unrealizedPnl >= 0 ? "+" : ""}${fmt(t.unrealizedPnl)}</p></div>
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

        {/* ── Sports Prediction Engine ──────────────────────────────────────── */}
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(168,85,247,0.07)", border: "1.5px solid rgba(168,85,247,0.3)" }}>
          <button
            className="w-full flex items-center justify-between px-4 py-3"
            onClick={() => setShowSports(v => !v)}
          >
            <div className="flex items-center gap-2">
              <span className="text-base">🏆</span>
              <div className="text-left">
                <h2 className="text-sm font-bold text-purple-300">Sports Prediction Agent</h2>
                <p className="text-[10px] text-gray-500">ELO · Kelly · Injury · Form · News · Polymarket Edge</p>
              </div>
              {sportsPredictions && sportsPredictions.length > 0 && (
                <span className="ml-2 text-[9px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded-full">
                  {sportsPredictions.filter((g: any) => (g.edgePct ?? 0) >= 3).length} edge picks
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={e => { e.stopPropagation(); refreshSportsMutation.mutate(); }}
                disabled={refreshSportsMutation.isPending || sportsLoading}
                className="p-1 rounded hover:bg-purple-500/20 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-purple-400 ${refreshSportsMutation.isPending || sportsLoading ? "animate-spin" : ""}`} />
              </button>
              {showSports ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </div>
          </button>

          {showSports && (
            <div className="px-4 pb-4 space-y-3">
              {/* Sport filter tabs */}
              <div className="flex gap-1.5 flex-wrap">
                {(["all","nba","nfl","mlb","nhl"] as const).map(s => (
                  <button key={s} onClick={() => setSportFilter(s)}
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full border transition-colors ${
                      sportFilter === s
                        ? "bg-purple-500/30 border-purple-500/60 text-purple-200"
                        : "bg-gray-800/60 border-gray-700 text-gray-500 hover:text-gray-300"
                    }`}>
                    {s === "all" ? "All Sports" : s.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 text-[9px] text-gray-500 flex-wrap">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Edge ≥ 3% — bet YES</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Edge ≤ -3% — bet NO</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-600" />No edge / no market</span>
              </div>

              {/* ── Auto-Trade Engine Controls ─────────────────────────────── */}
              <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(0,0,0,0.3)", border: "1px solid rgba(168,85,247,0.25)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${sportsEngine?.isRunning ? "bg-emerald-400 animate-pulse" : "bg-gray-600"}`} />
                    <span className="text-[11px] font-bold text-gray-300">
                      Auto-Trade Engine — {sportsEngine?.isRunning ? (sportsEngine?.config?.paperMode ? "PAPER" : "LIVE") : "STOPPED"}
                    </span>
                    {sportsEngine?.isRunning && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${sportsEngine?.config?.paperMode ? "bg-amber-500/20 text-amber-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                        {sportsEngine?.config?.paperMode ? "Paper" : "Live"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setShowSportsConfig(v => !v)} className="text-[9px] text-gray-500 hover:text-gray-300 border border-gray-700 rounded px-1.5 py-0.5">
                      <Settings className="w-2.5 h-2.5 inline mr-0.5" />Config
                    </button>
                    {sportsEngine?.isRunning ? (
                      <button onClick={() => stopSportsEngineMutation.mutate()} disabled={stopSportsEngineMutation.isPending}
                        className="text-[10px] bg-red-500/20 border border-red-500/40 text-red-300 px-2 py-1 rounded-lg font-bold disabled:opacity-50">
                        <Square className="w-2.5 h-2.5 inline mr-0.5" />Stop
                      </button>
                    ) : (
                      <button onClick={() => startSportsEngineMutation.mutate()} disabled={startSportsEngineMutation.isPending}
                        className="text-[10px] bg-purple-500/20 border border-purple-500/40 text-purple-300 px-2 py-1 rounded-lg font-bold disabled:opacity-50">
                        <Play className="w-2.5 h-2.5 inline mr-0.5" />Start
                      </button>
                    )}
                    <button onClick={() => scanSportsMutation.mutate()} disabled={scanSportsMutation.isPending}
                      className="text-[10px] bg-gray-700/50 border border-gray-600 text-gray-300 px-2 py-1 rounded-lg disabled:opacity-50">
                      {scanSportsMutation.isPending ? <RefreshCw className="w-2.5 h-2.5 inline animate-spin" /> : "Scan Now"}
                    </button>
                  </div>
                </div>

                {/* Config values summary */}
                {sportsEngine?.config && !showSportsConfig && (
                  <div className="flex gap-3 text-[9px] text-gray-500">
                    <span>Edge ≥ {sportsEngine.config.minEdgePct}%</span>
                    <span>·</span>
                    <span>Conf: {sportsEngine.config.minConfidence}</span>
                    <span>·</span>
                    <span>${sportsEngine.config.stakePerGame}/game</span>
                    <span>·</span>
                    <span>Max {sportsEngine.config.maxOpenTrades} open</span>
                    <span>·</span>
                    <span>Every {sportsEngine.config.cooldownMinutes}m</span>
                  </div>
                )}

                {/* Config panel */}
                {showSportsConfig && (
                  <div className="space-y-2 pt-1 border-t border-gray-800">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[9px] text-gray-500">Min Edge %</label>
                        <input value={sportsMinEdge} onChange={e => setSportsMinEdge(e.target.value)}
                          placeholder={String(sportsEngine?.config?.minEdgePct ?? 4)}
                          className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white" />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-500">Stake / Game ($)</label>
                        <input value={sportsStake} onChange={e => setSportsStake(e.target.value)}
                          placeholder={String(sportsEngine?.config?.stakePerGame ?? 10)}
                          className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white" />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-500">Max Open Positions</label>
                        <input value={sportsMaxPos} onChange={e => setSportsMaxPos(e.target.value)}
                          placeholder={String(sportsEngine?.config?.maxOpenTrades ?? 5)}
                          className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white" />
                      </div>
                      <div>
                        <label className="text-[9px] text-gray-500">Min Confidence</label>
                        <select value={sportsMinConf} onChange={e => setSportsMinConf(e.target.value as any)}
                          className="w-full mt-0.5 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-[11px] text-white">
                          <option value="high">High only</option>
                          <option value="medium">Medium + High</option>
                        </select>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <label className="text-[9px] text-gray-400 flex items-center gap-1.5">
                        <input type="checkbox" checked={sportsEngine?.config?.paperMode ?? true}
                          onChange={e => saveSportsConfigMutation.mutate({ paperMode: e.target.checked })}
                          className="w-3 h-3 accent-purple-500" />
                        Paper mode (simulate only)
                      </label>
                      <button onClick={() => saveSportsConfigMutation.mutate({
                        minEdgePct: sportsMinEdge ? parseFloat(sportsMinEdge) : undefined,
                        stakePerGame: sportsStake ? parseFloat(sportsStake) : undefined,
                        maxOpenTrades: sportsMaxPos ? parseInt(sportsMaxPos) : undefined,
                        minConfidence: sportsMinConf,
                      })} disabled={saveSportsConfigMutation.isPending}
                        className="text-[10px] bg-purple-600/30 border border-purple-500/40 text-purple-200 px-3 py-1 rounded-lg font-bold disabled:opacity-50">
                        Save
                      </button>
                    </div>
                  </div>
                )}

                {/* Last scan result */}
                {sportsEngine?.lastScanResult && (
                  <p className="text-[9px] text-gray-500 border-t border-gray-800 pt-1.5">
                    Last: {sportsEngine.lastScanResult}
                  </p>
                )}

                {/* P&L summary */}
                {(sportsEngine?.openTrades?.length > 0 || sportsEngine?.totalRealizedPnl !== 0) && (
                  <div className="flex gap-4 pt-1 border-t border-gray-800">
                    <div>
                      <div className="text-[9px] text-gray-500">Unrealized P&L</div>
                      <div className={`text-[12px] font-bold ${(sportsEngine?.totalUnrealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {(sportsEngine?.totalUnrealizedPnl ?? 0) >= 0 ? "+" : ""}${(sportsEngine?.totalUnrealizedPnl ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500">Realized P&L</div>
                      <div className={`text-[12px] font-bold ${(sportsEngine?.totalRealizedPnl ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                        {(sportsEngine?.totalRealizedPnl ?? 0) >= 0 ? "+" : ""}${(sportsEngine?.totalRealizedPnl ?? 0).toFixed(2)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[9px] text-gray-500">Open</div>
                      <div className="text-[12px] font-bold text-purple-300">{sportsEngine?.openTrades?.length ?? 0}</div>
                    </div>
                  </div>
                )}

                {/* Open positions */}
                {sportsEngine?.openTrades?.length > 0 && (
                  <div className="space-y-1.5 pt-1 border-t border-gray-800">
                    <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Open Positions</div>
                    {sportsEngine.openTrades.map((t: any) => (
                      <div key={t.id} className="flex items-center justify-between bg-black/30 rounded-lg px-2.5 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-bold text-white truncate">{t.predictedTeam} wins</div>
                          <div className="text-[9px] text-gray-500">{t.sport.toUpperCase()} · {t.side.toUpperCase()} · ${t.stake} stake · Edge {t.entryEdgePct.toFixed(1)}%</div>
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                          <div className={`text-[11px] font-bold ${t.unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {t.unrealizedPnl >= 0 ? "+" : ""}${t.unrealizedPnl.toFixed(2)}
                          </div>
                          <button onClick={() => closeSportsTradeMutation.mutate(t.id)}
                            className="text-[9px] text-red-400 border border-red-500/30 rounded px-1.5 py-0.5 hover:bg-red-500/10">
                            Close
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Game cards */}
              {sportsLoading && !sportsPredictions ? (
                <div className="text-center py-8 text-gray-500 text-[11px]">
                  <div className="animate-spin w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full mx-auto mb-2" />
                  Gathering player stats, injuries, ELO ratings, and Polymarket markets…
                </div>
              ) : !sportsPredictions || sportsPredictions.length === 0 ? (
                <div className="text-center py-6 text-gray-600 text-[11px]">
                  No upcoming games found. Hit ↻ to refresh.
                </div>
              ) : (
                sportsPredictions
                  .filter((g: any) => sportFilter === "all" || g.sport === sportFilter)
                  .sort((a: any, b: any) => Math.abs(b.edgePct ?? 0) - Math.abs(a.edgePct ?? 0))
                  .map((game: any) => {
                    const edge = game.edgePct ?? 0;
                    const kelly = game.kellySizePct ?? 0;
                    const hasMarket = !!game.polymarketMarketId;
                    const edgeColor = edge >= 3 ? "#10b981" : edge <= -3 ? "#ef4444" : "#6b7280";
                    const edgeBg = edge >= 3 ? "rgba(16,185,129,0.1)" : edge <= -3 ? "rgba(239,68,68,0.1)" : "rgba(0,0,0,0.2)";
                    const edgeBorder = edge >= 3 ? "rgba(16,185,129,0.3)" : edge <= -3 ? "rgba(239,68,68,0.3)" : "rgba(55,65,81,0.5)";
                    const sportEmoji: Record<string, string> = { nba:"🏀", nfl:"🏈", mlb:"⚾", nhl:"🏒" };

                    return (
                      <div key={game.gameId} className="rounded-xl p-3 space-y-2.5" style={{ background: edgeBg, border: `1.5px solid ${edgeBorder}` }}>
                        {/* Header row */}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{sportEmoji[game.sport] ?? "🏆"}</span>
                            <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">{game.sport}</span>
                            <span className={`text-[9px] px-1 py-0.5 rounded ${
                              game.confidence === "high" ? "bg-emerald-500/20 text-emerald-400" :
                              game.confidence === "medium" ? "bg-amber-500/20 text-amber-400" :
                              "bg-gray-700 text-gray-500"
                            }`}>{game.confidence} confidence</span>
                          </div>
                          <span className="text-[9px] text-gray-600">
                            {game.gameTime ? new Date(game.gameTime).toLocaleString("en-US", { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "TBD"}
                          </span>
                        </div>

                        {/* Teams + probabilities */}
                        <div className="flex items-center gap-2">
                          <div className="flex-1 text-center">
                            <div className="text-[11px] font-bold text-white">{game.awayTeam}</div>
                            {game.awayRecord && <div className="text-[9px] text-gray-500">{game.awayRecord}</div>}
                            <div className="text-lg font-black mt-0.5" style={{ color: game.modelProbAway >= 50 ? "#10b981" : "#9ca3af" }}>
                              {game.modelProbAway}%
                            </div>
                          </div>
                          <div className="text-xs font-black text-gray-600">@</div>
                          <div className="flex-1 text-center">
                            <div className="text-[11px] font-bold text-white">{game.homeTeam}</div>
                            {game.homeRecord && <div className="text-[9px] text-gray-500">{game.homeRecord}</div>}
                            <div className="text-lg font-black mt-0.5" style={{ color: game.modelProbHome >= 50 ? "#10b981" : "#9ca3af" }}>
                              {game.modelProbHome}%
                            </div>
                          </div>
                        </div>

                        {/* Probability bar */}
                        <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                          <div className="h-full rounded-full" style={{
                            width: `${game.modelProbHome}%`,
                            background: "linear-gradient(90deg, #10b981, #6ee7b7)"
                          }} />
                        </div>

                        {/* Market + edge row */}
                        {hasMarket && (
                          <div className="flex items-center justify-between bg-black/30 rounded-lg px-2.5 py-2">
                            <div>
                              <div className="text-[9px] text-gray-500 mb-0.5">Polymarket Price (Home YES)</div>
                              <div className="text-[11px] font-bold text-white">{game.polymarketHomePrice?.toFixed(1)}%</div>
                            </div>
                            <div className="text-center">
                              <div className="text-[9px] text-gray-500 mb-0.5">Edge</div>
                              <div className="text-[13px] font-black" style={{ color: edgeColor }}>
                                {edge >= 0 ? "+" : ""}{edge.toFixed(1)}%
                              </div>
                            </div>
                            <div className="text-center">
                              <div className="text-[9px] text-gray-500 mb-0.5">Kelly Size</div>
                              <div className="text-[11px] font-bold text-purple-300">{kelly.toFixed(1)}%</div>
                            </div>
                            {game.polymarketUrl && (
                              <a href={game.polymarketUrl} target="_blank" rel="noopener noreferrer"
                                className="text-[9px] bg-purple-500/20 border border-purple-500/40 text-purple-300 px-2 py-1 rounded-lg flex items-center gap-1 hover:bg-purple-500/30 transition-colors">
                                Trade <ExternalLink className="w-2.5 h-2.5" />
                              </a>
                            )}
                          </div>
                        )}
                        {!hasMarket && (
                          <div className="text-[9px] text-gray-600 text-center py-1">No Polymarket market found for this game</div>
                        )}

                        {/* AI reasoning */}
                        {game.reasons && game.reasons.length > 0 && (
                          <div className="space-y-0.5">
                            {game.reasons.slice(0, 4).map((r: string, i: number) => (
                              <div key={i} className="text-[9px] text-gray-400 flex items-start gap-1">
                                <span className="text-purple-500 mt-0.5 flex-shrink-0">•</span>
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Injuries */}
                        {((game.homeInjuries?.length > 0) || (game.awayInjuries?.length > 0)) && (
                          <div className="flex gap-3 text-[9px]">
                            {game.awayInjuries?.length > 0 && (
                              <div className="flex-1">
                                <span className="text-amber-400 font-bold">{game.awayTeam} OUT: </span>
                                <span className="text-gray-400">{game.awayInjuries.slice(0,3).join(", ")}</span>
                              </div>
                            )}
                            {game.homeInjuries?.length > 0 && (
                              <div className="flex-1">
                                <span className="text-amber-400 font-bold">{game.homeTeam} OUT: </span>
                                <span className="text-gray-400">{game.homeInjuries.slice(0,3).join(", ")}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* News headlines */}
                        {game.newsHeadlines?.length > 0 && (
                          <div className="text-[9px] text-gray-500 italic border-t border-gray-800 pt-1.5">
                            📰 {game.newsHeadlines[0]}
                          </div>
                        )}
                      </div>
                    );
                  })
              )}

              <p className="text-[9px] text-gray-600 text-center pt-1">
                AI model: ELO (40%) · Win % (25%) · Rest (10%) · Injuries (15%) · H2H (10%) · Kelly position sizing · Not financial advice
              </p>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
