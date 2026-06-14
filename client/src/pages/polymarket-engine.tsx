import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Square, RefreshCw, Settings, TrendingUp, TrendingDown, X, ChevronDown, ChevronUp } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  n > 0 ? "bg-emerald-500/10 border-emerald-500/20" : n < 0 ? "bg-red-500/10 border-red-500/20" : "bg-gray-800/40 border-gray-700/40";

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PolymarketEnginePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [showConfig, setShowConfig] = useState(false);

  // Config form state
  const [cfgBullish, setCfgBullish]   = useState("");
  const [cfgBearish, setCfgBearish]   = useState("");
  const [cfgStake, setCfgStake]       = useState("");
  const [cfgMaxPos, setCfgMaxPos]     = useState("");
  const [cfgCooldown, setCfgCooldown] = useState("");

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: state, isLoading } = useQuery<EngineState>({
    queryKey: ["/api/polymarket-engine/status"],
    refetchInterval: 8000,
    enabled: !!user,
  });

  const { data: polyData } = useQuery<any>({
    queryKey: ["/api/polymarket/btc"],
    refetchInterval: 5 * 60 * 1000,
    enabled: !!user,
  });

  // ── Mutations ──────────────────────────────────────────────────────────────

  const startMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/polymarket-engine/start").then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/polymarket-engine/status"] });
      toast({ title: "Polymarket Engine started", description: "Scanning Polymarket prediction markets every 5 min." });
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
        title: data.fired ? "Position opened on Polymarket!" : "Scan complete — no trade",
        description: data.reason,
        variant: data.fired ? "default" : "default",
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
  const bullishScore   = polyData?.overallBullishScore ?? 50;
  const sentimentLabel = polyData?.sentimentLabel ?? "Neutral";

  const sentimentColor =
    bullishScore >= 70 ? "text-emerald-400" :
    bullishScore >= 55 ? "text-green-400"   :
    bullishScore <= 30 ? "text-red-400"     :
    bullishScore <= 45 ? "text-orange-400"  : "text-gray-400";

  const sentimentBorder =
    bullishScore >= 70 ? "border-emerald-700/40" :
    bullishScore <= 30 ? "border-red-700/40"     : "border-gray-800";

  return (
    <div className="min-h-screen bg-gray-950 text-white pb-24">

      {/* ── Header ─────────────────────────────────────────────────────── */}
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
            <p className="text-[10px] text-gray-500 mt-0.5">Prediction Market · BTC · Separate from Forex Engine</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
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

        {/* ── Paper Mode Banner ───────────────────────────────────────── */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
          <span className="text-lg mt-0.5">📋</span>
          <div>
            <p className="text-xs font-bold text-amber-300">Paper Trading Mode — No wallet needed</p>
            <p className="text-[10px] text-amber-200/70 mt-0.5">
              Tracks real Polymarket YES/NO positions using live probabilities. P&L is simulated — no USDC is spent. When you're ready for live execution, Polymarket uses <span className="text-emerald-300 font-semibold">USDC on Polygon</span> (not BTC, not POLY token) with a tiny MATIC gas fee.{' '}
              Get USDC:{' '}
              <a href="https://polymarket.com/deposit" target="_blank" rel="noopener noreferrer" className="text-purple-300 underline underline-offset-2 hover:text-purple-200">Polymarket Deposit</a>
              {' '}(card/Apple Pay) or{' '}
              <a href="https://wallet.polygon.technology/polygon/bridge" target="_blank" rel="noopener noreferrer" className="text-purple-300 underline underline-offset-2 hover:text-purple-200">Polygon Bridge</a>
              {' '}(from Ethereum).
            </p>
          </div>
        </div>

        {/* ── Polymarket Sentiment ────────────────────────────────────── */}
        <div className={`bg-gray-900/60 border ${sentimentBorder} rounded-xl p-4`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📊</span>
              <h2 className="text-sm font-bold text-white">Live BTC Sentiment</h2>
              <span className="text-[9px] text-gray-500">via Polymarket</span>
            </div>
            <span className="text-[9px] text-gray-500">{polyData?.fromCache ? "cached" : "live"}</span>
          </div>

          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[9px] text-gray-400 uppercase mb-0.5">Overall Sentiment</p>
              <p className={`text-lg font-black ${sentimentColor}`}>{sentimentLabel}</p>
            </div>
            <div className="text-right">
              <p className="text-[9px] text-gray-400">Bullish score</p>
              <p className={`text-3xl font-black ${sentimentColor}`}>{bullishScore}%</p>
            </div>
          </div>

          <div className="h-2 bg-gray-800 rounded-full overflow-hidden mb-2">
            <div
              className={`h-full rounded-full transition-all ${bullishScore >= 60 ? "bg-emerald-500" : bullishScore <= 40 ? "bg-red-500" : "bg-gray-500"}`}
              style={{ width: `${bullishScore}%` }}
            />
          </div>

          {/* Top markets */}
          {polyData?.markets?.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {polyData.markets.slice(0, 3).map((m: any, i: number) => (
                <div key={i} className="flex items-center gap-2 bg-black/20 rounded-lg px-2.5 py-1.5">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.direction === "bullish" ? "bg-emerald-400" : "bg-red-400"}`} />
                  <p className="text-[10px] text-gray-300 flex-1 truncate">{m.question}</p>
                  <span className={`text-[10px] font-bold shrink-0 ${m.yesProbability >= 60 ? "text-emerald-400" : m.yesProbability <= 40 ? "text-red-400" : "text-gray-400"}`}>
                    {m.yesProbability}% YES
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Engine Controls ─────────────────────────────────────────── */}
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

          {/* Stats row */}
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

          {/* Start / Stop / Scan */}
          <div className="flex gap-2 mb-3">
            {isRunning ? (
              <button
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-xs font-bold rounded-lg py-2.5 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop Engine
              </button>
            ) : (
              <button
                onClick={() => startMutation.mutate()}
                disabled={startMutation.isPending}
                className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 text-xs font-bold rounded-lg py-2.5 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Start Engine
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

          {/* Last scan info */}
          {state?.lastScanAt && (
            <div className="bg-black/20 rounded-lg px-3 py-2">
              <p className="text-[9px] text-gray-500">Last scan: {timeAgo(state.lastScanAt)}</p>
              {state.lastScanResult && (
                <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">{state.lastScanResult}</p>
              )}
            </div>
          )}

          {/* Config panel */}
          {showConfig && (
            <div className="mt-3 bg-black/30 rounded-xl p-3 border border-gray-700/40">
              <p className="text-[10px] font-bold text-gray-300 mb-3">Engine Configuration</p>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { label: "Min Bullish %", val: cfgBullish, set: setCfgBullish, hint: "BUY threshold" },
                  { label: "Min Bearish %", val: cfgBearish, set: setCfgBearish, hint: "SELL threshold" },
                  { label: "Stake / trade ($)", val: cfgStake, set: setCfgStake, hint: "USDC per position" },
                  { label: "Max positions", val: cfgMaxPos, set: setCfgMaxPos, hint: "concurrent positions" },
                  { label: "Cooldown (min)", val: cfgCooldown, set: setCfgCooldown, hint: "minutes between trades" },
                ] as const).map(f => (
                  <div key={f.label} className="col-span-1">
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

        {/* ── Open Positions ──────────────────────────────────────────── */}
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="text-base">📈</span>
              <h2 className="text-sm font-bold text-white">Open Positions</h2>
              {openCount > 0 && (
                <Badge className="text-[9px] bg-purple-500/20 text-purple-300 border-purple-500/30">{openCount}</Badge>
              )}
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
                {isRunning ? `Waiting for sentiment ≥ ${state?.config.minBullishScore}% bullish or bearish...` : "Start the engine to begin scanning."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {state!.openPositions.map(pos => (
                <div key={pos.id} className={`border rounded-xl p-3 ${pnlBg(pos.unrealizedPnl)}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-gray-300 leading-tight line-clamp-2">{pos.market.question}</p>
                    </div>
                    <button
                      onClick={() => closePosMutation.mutate(pos.id)}
                      className="shrink-0 p-1 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 transition-colors"
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
                      <p className={`text-[10px] font-bold ${pos.currentProbability > pos.entryProbability ? "text-emerald-400" : pos.currentProbability < pos.entryProbability ? "text-red-400" : "text-white"}`}>
                        {pos.currentProbability}%
                      </p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500">P&L</p>
                      <p className={`text-[10px] font-bold ${pnlColor(pos.unrealizedPnl)}`}>
                        {pos.unrealizedPnl >= 0 ? "+" : ""}{fmt(pos.unrealizedPnl)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-2">
                    <p className="text-[9px] text-gray-500">
                      Stake: ${fmt(pos.stake)} · Signal: {pos.signal.sentimentLabel} ({pos.signal.bullishScore}%)
                    </p>
                    <p className={`text-[9px] font-bold ${pnlColor(pos.unrealizedPnlPct)}`}>
                      {pos.unrealizedPnlPct >= 0 ? "+" : ""}{fmt(pos.unrealizedPnlPct, 1)}%
                    </p>
                  </div>

                  <p className="text-[8px] text-gray-600 mt-1">Opened {timeAgo(pos.openedAt)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Closed Positions ────────────────────────────────────────── */}
        {closedCount > 0 && (
          <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">📋</span>
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
                    <div>
                      <p className="text-[8px] text-gray-500">Side</p>
                      <p className={`text-[10px] font-bold ${pos.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{pos.side}</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500">Entry</p>
                      <p className="text-[10px] text-gray-300">{pos.entryProbability}%</p>
                    </div>
                    <div>
                      <p className="text-[8px] text-gray-500">Exit</p>
                      <p className="text-[10px] text-gray-300">{pos.closedProbability}%</p>
                    </div>
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

        {/* ── How it works ────────────────────────────────────────────── */}
        <div className="bg-gray-900/40 border border-gray-800/60 rounded-xl p-4">
          <h3 className="text-xs font-bold text-gray-300 mb-3">📋 How it works</h3>
          <div className="space-y-3">
            {[
              {
                n: 1,
                icon: "📊",
                title: "Polymarket BTC markets are read every 5 min",
                desc: "The engine fetches all active BTC prediction markets from Polymarket and computes a volume-weighted bullish sentiment score (0–100%).",
              },
              {
                n: 2,
                icon: "⚡",
                title: "Signal threshold checked",
                desc: `When sentiment reaches your threshold (default ≥${state?.config.minBullishScore ?? 70}% bullish or ≥${state?.config.minBearishScore ?? 70}% bearish), the engine fires.`,
              },
              {
                n: 3,
                icon: "🎯",
                title: "Best market selected",
                desc: "The engine picks the highest-volume prediction market on Polymarket that matches the signal direction and hasn't been entered yet.",
              },
              {
                n: 4,
                icon: "🏦",
                title: "Position opened on Polymarket",
                desc: `A YES position is opened on the selected Polymarket prediction market at the current probability. The engine tracks real P&L as YES probability moves — completely separate from your forex engine.`,
                highlight: true,
              },
            ].map(s => (
              <div key={s.n} className={`flex gap-3 ${s.highlight ? "bg-purple-500/10 border border-purple-500/20 rounded-xl p-2.5" : ""}`}>
                <div className="flex flex-col items-center gap-1 shrink-0">
                  <span className="w-6 h-6 rounded-full bg-purple-600/30 text-purple-400 text-[10px] font-bold flex items-center justify-center">{s.n}</span>
                  <span className="text-base">{s.icon}</span>
                </div>
                <div>
                  <p className={`text-[11px] font-semibold ${s.highlight ? "text-purple-300" : "text-gray-300"}`}>{s.title}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-3 bg-gray-800/40 rounded-lg px-3 py-2">
            <p className="text-[10px] text-gray-400">
              <span className="text-purple-400 font-semibold">Note:</span> This engine is completely independent from the forex live engine on the Weekly Strategy page.
              It operates only on Polymarket BTC prediction markets — not TradeLocker, not MT5.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
