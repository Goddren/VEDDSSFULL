import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Play, Square, RefreshCw, Settings, X,
  ChevronDown, ChevronUp, Wallet, ExternalLink, Wifi, WifiOff, Clock,
  TrendingUp, TrendingDown, Activity,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

interface PolymarketMarket {
  id: string;
  question: string;
  yesProbability: number;
  noProbability: number;
  volume: number;
  endDate: string | null;
  closed: boolean;
  direction: "bullish" | "bearish" | "neutral";
  outcomes: string[];
  livePrice?: boolean;
  msUntilEnd?: number | null;
}

interface LiveBTCData {
  overallBullishScore: number;
  sentimentLabel: string;
  markets: PolymarketMarket[];
  fetchedAt: string;
  fromCache: boolean;
  livePrices?: boolean;
  cacheExpiresIn?: number;
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
  isPaperMode: boolean;
  lastScanAt: string | null;
  lastTradeAt: string | null;
  lastScanResult: string | null;
  openPositions: PolymarketPosition[];
  closedPositions: PolymarketPosition[];
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  tradesOpened: number;
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

/** Format milliseconds into "Xh Ym" or "Xd" or "< 1h" */
function fmtTimeUntil(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "soon";
  const totalMin = Math.floor(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  if (h < 24) {
    const m = totalMin % 60;
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(h / 24);
  return `${d}d`;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PolymarketEnginePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showConfig, setShowConfig] = useState(false);
  const [secondsSinceFetch, setSecondsSinceFetch] = useState(0);

  // Config form state
  const [cfgBullish, setCfgBullish]   = useState("");
  const [cfgBearish, setCfgBearish]   = useState("");
  const [cfgStake, setCfgStake]       = useState("");
  const [cfgMaxPos, setCfgMaxPos]     = useState("");
  const [cfgCooldown, setCfgCooldown] = useState("");

  // ── Live BTC data — polls every 30 s ──────────────────────────────────────
  const { data: liveData, isLoading: liveLoading, dataUpdatedAt, refetch: refetchLive, isError: liveError } =
    useQuery<LiveBTCData>({
      queryKey: ["/api/polymarket/btc-live"],
      refetchInterval: 30_000,
      staleTime: 0,
      retry: 2,
      enabled: !!user,
    });

  // ── Tick the "seconds since fetch" counter ────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsSinceFetch(Math.floor((Date.now() - (dataUpdatedAt ?? Date.now())) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [dataUpdatedAt]);

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

  // ── Mutations ──────────────────────────────────────────────────────────────

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/polymarket-engine/start").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      toast({ title: "Polymarket Engine started" });
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
      toast({
        title: data.fired ? "Position opened!" : "Scan complete — no trade",
        description: data.reason,
      });
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

  // ── Handlers ───────────────────────────────────────────────────────────────

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

  // ── Derived values ─────────────────────────────────────────────────────────

  const isRunning      = state?.isRunning ?? false;
  const openCount      = state?.openPositions.length ?? 0;
  const closedCount    = state?.closedPositions.length ?? 0;
  const totalPnl       = (state?.totalRealizedPnl ?? 0) + (state?.totalUnrealizedPnl ?? 0);

  const bullishScore   = liveData?.overallBullishScore ?? 50;
  const sentimentLabel = liveData?.sentimentLabel ?? "Neutral";
  const markets        = liveData?.markets ?? [];
  const isLive         = liveData?.livePrices ?? false;

  const sentimentColor =
    bullishScore >= 70 ? "text-emerald-400" :
    bullishScore >= 55 ? "text-green-400"   :
    bullishScore <= 30 ? "text-red-400"     :
    bullishScore <= 45 ? "text-orange-400"  : "text-gray-400";

  // Connection status indicator
  const connectionStatus = liveError
    ? "error"
    : liveLoading
    ? "connecting"
    : secondsSinceFetch > 60
    ? "stale"
    : "live";

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
          <span className="text-lg">🏦</span>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">Polymarket Engine</h1>
            <p className="text-[10px] text-gray-500 mt-0.5">5-Min BTC Predictions · Live CLOB Feed</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* Live connection indicator */}
          <div className="flex items-center gap-1.5">
            {connectionStatus === "live" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-emerald-400 font-bold">LIVE</span>
                {isLive && <span className="text-[9px] text-emerald-500">CLOB</span>}
              </>
            ) : connectionStatus === "stale" ? (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] text-amber-400">{secondsSinceFetch}s ago</span>
              </>
            ) : connectionStatus === "connecting" ? (
              <>
                <RefreshCw className="w-3 h-3 text-gray-400 animate-spin" />
                <span className="text-[10px] text-gray-400">Connecting…</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3 h-3 text-red-400" />
                <span className="text-[10px] text-red-400">Offline</span>
              </>
            )}
          </div>
          {isRunning ? (
            <span className="flex items-center gap-1 text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              ACTIVE
            </span>
          ) : (
            <span className="text-[10px] bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">STOPPED</span>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* ── Paper Mode Banner ────────────────────────────────────────────── */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">📋</span>
          <div>
            <p className="text-xs font-bold text-amber-300">Paper Trading Mode — No wallet needed</p>
            <p className="text-[10px] text-amber-200/70 mt-0.5">
              Tracks real Polymarket YES/NO positions using live CLOB prices. P&L is simulated. Live execution needs{' '}
              <span className="text-emerald-300 font-semibold">USDC on Polygon</span>.{' '}
              <a href="https://polymarket.com/deposit" target="_blank" rel="noopener noreferrer" className="text-purple-300 underline underline-offset-2">Deposit</a>{' '}
              or{' '}
              <a href="https://wallet.polygon.technology/polygon/bridge" target="_blank" rel="noopener noreferrer" className="text-purple-300 underline underline-offset-2">Bridge</a>.
            </p>
          </div>
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
                <p className="text-[10px] text-gray-500">Required for live execution — USDC on Polygon</p>
              </div>
              <ExternalLink className="w-4 h-4 text-purple-400 shrink-0" />
            </button>
          </Link>
        )}

        {/* ── Live BTC Predictions ─────────────────────────────────────────── */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">BTC Prediction Markets</h2>
              <span className="text-[9px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded">via Polymarket</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[9px] text-gray-500">
                {liveData?.fromCache ? `stale ${secondsSinceFetch}s` : `live ${secondsSinceFetch}s ago`}
              </span>
              <button
                onClick={() => refetchLive()}
                disabled={liveLoading}
                className="p-1 rounded hover:bg-gray-800 transition-colors"
                title="Force refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 text-gray-400 ${liveLoading ? "animate-spin" : ""}`} />
              </button>
            </div>
          </div>

          {/* Overall sentiment bar */}
          <div className="flex items-center justify-between mb-2">
            <div>
              <p className="text-[9px] text-gray-400 uppercase mb-0.5">Overall BTC Sentiment</p>
              <p className={`text-base font-black ${sentimentColor}`}>{sentimentLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-400">Bullish score</p>
              <p className={`text-2xl font-black ${sentimentColor}`}>{bullishScore}%</p>
            </div>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden mb-4">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                bullishScore >= 60 ? "bg-emerald-500" : bullishScore <= 40 ? "bg-red-500" : "bg-gray-500"
              }`}
              style={{ width: `${bullishScore}%` }}
            />
          </div>

          {/* Live market list */}
          {liveLoading && markets.length === 0 ? (
            <div className="flex items-center justify-center py-6 gap-2 text-gray-500">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-xs">Connecting to Polymarket CLOB…</span>
            </div>
          ) : liveError && markets.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-4 text-center">
              <WifiOff className="w-5 h-5 text-red-400" />
              <p className="text-xs text-red-300">Cannot reach Polymarket</p>
              <button onClick={() => refetchLive()} className="text-[10px] text-gray-400 underline">Retry</button>
            </div>
          ) : markets.length === 0 ? (
            <p className="text-xs text-gray-500 text-center py-4">No active BTC prediction markets found</p>
          ) : (
            <div className="space-y-2">
              {markets.slice(0, 5).map((m, i) => {
                const endingSoon = m.msUntilEnd != null && m.msUntilEnd < 3 * 60 * 60 * 1000; // < 3h
                return (
                  <div
                    key={m.id || i}
                    className={`rounded-xl border p-3 ${
                      m.direction === "bullish"
                        ? "bg-emerald-950/30 border-emerald-800/30"
                        : "bg-red-950/30 border-red-800/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <p className="text-[10px] text-gray-200 leading-snug flex-1">{m.question}</p>
                      <div className="flex flex-col items-end gap-0.5 shrink-0">
                        {m.livePrice && (
                          <span className="text-[8px] bg-emerald-500/20 text-emerald-400 px-1 rounded font-bold">CLOB</span>
                        )}
                        <span className={`text-[8px] px-1 rounded font-bold ${
                          m.direction === "bullish"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {m.direction === "bullish" ? "↑ BULL" : "↓ BEAR"}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      {/* YES probability */}
                      <div className="bg-black/30 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-gray-500 mb-0.5">YES</p>
                        <p className={`text-sm font-black ${
                          m.yesProbability >= 60 ? "text-emerald-400"
                          : m.yesProbability <= 40 ? "text-red-400"
                          : "text-gray-300"
                        }`}>{m.yesProbability}%</p>
                        <div className="h-0.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${m.yesProbability >= 50 ? "bg-emerald-500" : "bg-red-500"}`}
                            style={{ width: `${m.yesProbability}%` }}
                          />
                        </div>
                      </div>

                      {/* NO probability */}
                      <div className="bg-black/30 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-gray-500 mb-0.5">NO</p>
                        <p className={`text-sm font-black ${
                          m.noProbability >= 60 ? "text-red-400"
                          : m.noProbability <= 40 ? "text-emerald-400"
                          : "text-gray-300"
                        }`}>{m.noProbability}%</p>
                        <div className="h-0.5 bg-gray-800 rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full bg-red-500" style={{ width: `${m.noProbability}%` }} />
                        </div>
                      </div>

                      {/* Volume + time until end */}
                      <div className="bg-black/30 rounded-lg p-2 text-center">
                        <p className="text-[8px] text-gray-500 mb-0.5">Volume</p>
                        <p className="text-xs font-bold text-white">
                          ${m.volume >= 1_000_000
                            ? `${(m.volume / 1_000_000).toFixed(1)}M`
                            : m.volume >= 1_000
                            ? `${(m.volume / 1_000).toFixed(0)}K`
                            : m.volume.toFixed(0)}
                        </p>
                        {m.msUntilEnd != null && (
                          <p className={`text-[8px] mt-0.5 ${endingSoon ? "text-amber-400 font-bold" : "text-gray-500"}`}>
                            <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                            {fmtTimeUntil(m.msUntilEnd)}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* CLOB live prices note */}
          {isLive && (
            <p className="text-[9px] text-emerald-500/70 text-center mt-3">
              Prices sourced from Polymarket CLOB order book · updates every 30s
            </p>
          )}
        </div>

        {/* ── Engine Controls ───────────────────────────────────────────────── */}
        <div className={`bg-gray-900/60 border rounded-xl p-4 ${isRunning ? "border-emerald-700/40" : "border-gray-800"}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🤖</span>
              <h2 className="text-sm font-bold text-white">Engine Controls</h2>
            </div>
            <button
              onClick={openConfigPanel}
              className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-white transition-colors px-2 py-1 bg-gray-800/60 rounded-lg"
            >
              <Settings className="w-3 h-3" />
              Config
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
              <p className="text-[9px] text-gray-500">Total P&L</p>
              <p className={`text-sm font-bold ${pnlColor(totalPnl)}`}>
                {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            {isRunning ? (
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg py-2.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />Stop Engine
              </button>
            ) : (
              <button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg py-2.5 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />Start Engine
              </button>
            )}
            <button
              onClick={() => scanMutation.mutate()}
              disabled={scanMutation.isPending}
              className="flex items-center gap-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/30 text-purple-300 text-xs font-semibold rounded-lg px-3 py-2.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${scanMutation.isPending ? "animate-spin" : ""}`} />
              Scan Now
            </button>
          </div>

          {state?.lastScanAt && (
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <p className="text-[9px] text-gray-500">Last scan: {timeAgo(state.lastScanAt)}</p>
              {state.lastScanResult && (
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{state.lastScanResult}</p>
              )}
            </div>
          )}

          {showConfig && (
            <div className="mt-3 bg-black/30 rounded-xl p-3 border border-gray-700/40">
              <p className="text-[10px] font-bold text-gray-300 mb-3">Engine Configuration</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: "Min Bullish %", val: cfgBullish, set: setCfgBullish, hint: "BUY threshold" },
                  { label: "Min Bearish %", val: cfgBearish, set: setCfgBearish, hint: "SELL threshold" },
                  { label: "Stake / trade ($)", val: cfgStake, set: setCfgStake, hint: "USDC per position" },
                  { label: "Max positions", val: cfgMaxPos, set: setCfgMaxPos, hint: "concurrent" },
                  { label: "Cooldown (min)", val: cfgCooldown, set: setCfgCooldown, hint: "between trades" },
                ] as const).map(f => (
                  <div key={f.label}>
                    <label className="text-[9px] text-gray-400 block mb-0.5">{f.label}</label>
                    <input
                      type="number"
                      value={f.val}
                      onChange={e => (f.set as any)(e.target.value)}
                      placeholder={f.hint}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg text-xs text-white px-2 py-1.5"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={saveConfig}
                disabled={configMutation.isPending}
                className="w-full mt-3 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-lg py-2 transition-colors"
              >
                Save Config
              </button>
            </div>
          )}
        </div>

        {/* ── Open Positions ────────────────────────────────────────────────── */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <h2 className="text-sm font-bold text-white">Open Positions</h2>
              {openCount > 0 && <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">{openCount}</Badge>}
            </div>
            {openCount > 0 && (
              <button
                onClick={() => closeAllMutation.mutate()}
                disabled={closeAllMutation.isPending}
                className="text-[10px] text-red-400/70 hover:text-red-400 transition-colors"
              >
                Close all
              </button>
            )}
          </div>

          {openCount === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm">No open positions</p>
              <p className="text-gray-600 text-[10px] mt-1">
                {isRunning
                  ? `Watching for sentiment ≥ ${state?.config.minBullishScore}% bullish or bearish…`
                  : "Start the engine to begin scanning."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {state!.openPositions.map(pos => (
                <div key={pos.id} className={`border rounded-xl p-3 ${pnlBg(pos.unrealizedPnl)}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-[10px] text-gray-300 leading-tight line-clamp-2 flex-1">{pos.market.question}</p>
                    <button
                      onClick={() => closePosMutation.mutate(pos.id)}
                      className="shrink-0 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div>
                      <p className="text-[8px] text-gray-500">Side</p>
                      <p className={`text-[10px] font-bold ${pos.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>
                        {pos.side} {pos.direction === "BUY" ? "📈" : "📉"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500">Entry</p>
                      <p className="text-[10px] font-bold text-white">{pos.entryProbability}%</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500">Now</p>
                      <p className={`text-[10px] font-bold ${
                        pos.currentProbability > pos.entryProbability ? "text-emerald-400"
                        : pos.currentProbability < pos.entryProbability ? "text-red-400"
                        : "text-white"
                      }`}>{pos.currentProbability}%</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500">P&L</p>
                      <p className={`text-[10px] font-bold ${pnlColor(pos.unrealizedPnl)}`}>
                        {pos.unrealizedPnl >= 0 ? "+" : ""}{fmt(pos.unrealizedPnl)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[8px] text-gray-600 mt-1.5">
                    Stake ${fmt(pos.stake)} · {pos.signal.sentimentLabel} ({pos.signal.bullishScore}%) · {timeAgo(pos.openedAt)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>

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
                  <p className="text-[10px] text-gray-300 leading-tight mb-2 line-clamp-1">{pos.market.question}</p>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div><p className="text-[8px] text-gray-500">Side</p><p className={`text-[10px] font-bold ${pos.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{pos.side}</p></div>
                    <div><p className="text-[8px] text-gray-500">Entry</p><p className="text-[10px] text-gray-300">{pos.entryProbability}%</p></div>
                    <div><p className="text-[8px] text-gray-500">Exit</p><p className="text-[10px] text-gray-300">{pos.closedProbability}%</p></div>
                    <div>
                      <p className="text-[8px] text-gray-500">P&L</p>
                      <p className={`text-[10px] font-bold ${pnlColor(pos.realizedPnl ?? 0)}`}>
                        {(pos.realizedPnl ?? 0) >= 0 ? "+" : ""}{fmt(pos.realizedPnl ?? 0)}
                      </p>
                    </div>
                  </div>
                  <p className="text-[8px] text-gray-600 mt-1.5">
                    {pos.status === "resolved" ? "✅ Resolved" : "Closed"} {pos.closedAt ? timeAgo(pos.closedAt) : ""}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
