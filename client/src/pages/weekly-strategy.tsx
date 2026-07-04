import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/hooks/use-auth";
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
  TrendingDown, Crosshair, BookOpen, Swords,
  Webhook, ArrowDownRight, Minus, Send,
  Navigation, ToggleLeft, ToggleRight, Play as PlayIcon
} from "lucide-react";
import { SiX, SiFacebook, SiLinkedin } from "react-icons/si";
import VeddLogo from "@/components/ui/vedd-logo";
import { motion, AnimatePresence } from "framer-motion";
import ConnectedAccountPicker, {
  loadAccountSettings,
  saveAccountSettings,
  type ConnectedAccount,
} from "@/components/connected-account-picker";
import { TradePerformanceCard, TodayReviewPanel } from "@/components/trade-performance-card";

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

function useSectionToggle(pageKey: string, key: string, defaultOpen = true) {
  const [open, setOpen] = useState<boolean>(() => {
    const saved = localStorage.getItem(`${pageKey}_section_${key}`);
    return saved !== null ? saved === 'true' : defaultOpen;
  });
  const toggle = () => setOpen(prev => {
    localStorage.setItem(`${pageKey}_section_${key}`, String(!prev));
    return !prev;
  });
  return [open, toggle] as const;
}

// ─── ORB Weekly Panel types ───────────────────────────────────────────────────

type ORBPairPhase =
  | "PRE_MARKET" | "BUILDING" | "RANGE_SET"
  | "BREAKOUT_LONG" | "BREAKOUT_SHORT"
  | "RETEST_LONG" | "RETEST_SHORT"
  | "TRADE_TAKEN" | "WINDOW_CLOSED";

interface ORBPairState {
  symbol: string;
  orbHigh: number;
  orbLow: number;
  currentPrice: number;
  phase: ORBPairPhase;
  tradeDirection?: "LONG" | "SHORT";
  entryPrice?: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  aiScore?: number;
  aiNote?: string;
  tradeTaken: boolean;
  autoMode: boolean;
  mt5Status?: "connected" | "no_data" | "error" | "idle";
  lastUpdated?: string;
  preMarketBias?: "bullish" | "bearish" | "neutral";
  detectedPattern?: string | null;
}

const ORB_PHASE_CFG: Record<ORBPairPhase, { label: string; color: string }> = {
  PRE_MARKET:     { label: "Pre-Market",      color: "#6b7280" },
  BUILDING:       { label: "Building Range",  color: "#f59e0b" },
  RANGE_SET:      { label: "Range Set",       color: "#06b6d4" },
  BREAKOUT_LONG:  { label: "🚀 Breakout ↑",   color: "#22c55e" },
  BREAKOUT_SHORT: { label: "🔻 Breakout ↓",   color: "#ef4444" },
  RETEST_LONG:    { label: "⚡ Retest LONG",   color: "#22c55e" },
  RETEST_SHORT:   { label: "⚡ Retest SHORT",  color: "#ef4444" },
  TRADE_TAKEN:    { label: "✅ Trade Taken",   color: "#8b5cf6" },
  WINDOW_CLOSED:  { label: "Window Closed",   color: "#374151" },
};

function getORBClockPhase(): ORBPairPhase {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const est = new Date(utc + -5 * 3600000);
  const h = est.getHours(); const m = est.getMinutes();
  if (h < 9 || (h === 9 && m < 30)) return "PRE_MARKET";
  if (h === 9 && m < 45) return "BUILDING";
  if (h < 14) return "RANGE_SET";
  return "WINDOW_CLOSED";
}

function calcORBLevels(dir: "LONG" | "SHORT", entry: number, orbHigh: number, orbLow: number) {
  const range = orbHigh - orbLow;
  if (dir === "LONG") {
    const stop = orbLow - range * 0.1;
    const risk = entry - stop;
    return { stopLoss: +stop.toFixed(2), target1: +(entry + risk * 2).toFixed(2), target2: +(entry + risk * 3).toFixed(2) };
  } else {
    const stop = orbHigh + range * 0.1;
    const risk = stop - entry;
    return { stopLoss: +stop.toFixed(2), target1: +(entry - risk * 2).toFixed(2), target2: +(entry - risk * 3).toFixed(2) };
  }
}

// ─── ORB Weekly Panel ─────────────────────────────────────────────────────────

function ORBWeeklyPanel({ pairs }: { pairs: string[] }) {
  const { toast } = useToast();
  const [pairStates, setPairStates] = useState<Record<string, ORBPairState>>({});
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [stopOrderPair, setStopOrderPair] = useState<ORBPairState | null>(null);
  const autoFiredRef = useRef<Set<string>>(new Set());
  const autoAnalyzingRef = useRef<Set<string>>(new Set());

  // Sync pairs list: add new pairs, keep existing state
  useEffect(() => {
    setPairStates(prev => {
      const next = { ...prev };
      // Add new pairs
      pairs.forEach(sym => {
        if (!next[sym]) {
          next[sym] = {
            symbol: sym, orbHigh: 0, orbLow: 0, currentPrice: 0,
            phase: getORBClockPhase(), tradeTaken: false, autoMode: false,
          };
        }
      });
      // Remove pairs no longer selected
      Object.keys(next).forEach(sym => { if (!pairs.includes(sym)) delete next[sym]; });
      return next;
    });
  }, [pairs]);

  function updatePair(sym: string, patch: Partial<ORBPairState>) {
    setPairStates(prev => ({ ...prev, [sym]: { ...prev[sym], ...patch } }));
  }

  // SS AI Bot mutation
  const analyzeMutation = useMutation({
    mutationFn: async (pair: ORBPairState) => {
      const res = await apiRequest("POST", "/api/orb/analyze", {
        symbol: pair.symbol, orbHigh: pair.orbHigh, orbLow: pair.orbLow,
        orbRange: pair.orbHigh - pair.orbLow,
        orbRangePct: pair.orbHigh > 0 ? ((pair.orbHigh - pair.orbLow) / pair.currentPrice) * 100 : 0,
        currentPrice: pair.currentPrice, phase: pair.phase,
        tradeDirection: pair.tradeDirection,
      });
      if (!res.ok) throw new Error("AI failed");
      return res.json() as Promise<{ score: number; verdict: string; note: string; checks: any[] }>;
    },
    onSuccess: (data, pair) => {
      updatePair(pair.symbol, { aiScore: data.score, aiNote: data.note });
      autoAnalyzingRef.current.delete(pair.symbol);
      setAnalyzingId(null);
      toast({
        title: `🤖 SS AI Bot: ${data.verdict}`,
        description: `${pair.symbol} scored ${data.score}/100`,
        variant: data.score >= 70 ? "default" : "destructive",
      });
    },
    onError: (_, pair) => {
      autoAnalyzingRef.current.delete(pair.symbol);
      setAnalyzingId(null);
      toast({ title: "AI analysis failed", variant: "destructive" });
    },
  });

  // MT5 polling
  const pollMT5Pair = useCallback(async (sym: string) => {
    const pair = pairStates[sym];
    if (!pair) return;
    try {
      const res = await apiRequest("GET", `/api/orb/mt5-live/${encodeURIComponent(sym)}`);
      if (!res.ok) { updatePair(sym, { mt5Status: "error" }); return; }
      const data = await res.json() as {
        currentPrice: number; orbHigh: number | null; orbLow: number | null;
        foundOrbCandle: boolean;
        preMarketBias?: "bullish" | "bearish" | "neutral";
        detectedPattern?: string | null;
      };
      if (!data.currentPrice) { updatePair(sym, { mt5Status: "no_data" }); return; }

      const patch: Partial<ORBPairState> = {
        mt5Status: "connected", currentPrice: data.currentPrice,
        lastUpdated: new Date().toLocaleTimeString() + " (MT5)",
      };
      if (data.foundOrbCandle && data.orbHigh && data.orbLow) {
        patch.orbHigh = data.orbHigh;
        patch.orbLow = data.orbLow;
      }
      // Auto-fill pre-market bias and candlestick pattern from MT5 candle data
      if (data.preMarketBias) patch.preMarketBias = data.preMarketBias;
      if (data.detectedPattern) patch.detectedPattern = data.detectedPattern;

      const high = patch.orbHigh ?? pair.orbHigh;
      const low = patch.orbLow ?? pair.orbLow;
      const curr = data.currentPrice;

      if (high > 0 && low > 0 && !pair.tradeTaken) {
        let newPhase = pair.phase;
        if (curr > high * 1.001 && pair.phase !== "BREAKOUT_LONG" && pair.phase !== "RETEST_LONG") {
          newPhase = "BREAKOUT_LONG"; patch.tradeDirection = "LONG";
          patch.entryPrice = curr; Object.assign(patch, calcORBLevels("LONG", curr, high, low));
          patch.aiScore = undefined; autoFiredRef.current.delete(sym);
        } else if (curr < low * 0.999 && pair.phase !== "BREAKOUT_SHORT" && pair.phase !== "RETEST_SHORT") {
          newPhase = "BREAKOUT_SHORT"; patch.tradeDirection = "SHORT";
          patch.entryPrice = curr; Object.assign(patch, calcORBLevels("SHORT", curr, high, low));
          patch.aiScore = undefined; autoFiredRef.current.delete(sym);
        } else if (curr >= high * 0.998 && curr <= high * 1.002 && pair.phase === "BREAKOUT_LONG") {
          newPhase = "RETEST_LONG"; patch.entryPrice = curr;
          Object.assign(patch, calcORBLevels("LONG", curr, high, low));
        } else if (curr >= low * 0.998 && curr <= low * 1.002 && pair.phase === "BREAKOUT_SHORT") {
          newPhase = "RETEST_SHORT"; patch.entryPrice = curr;
          Object.assign(patch, calcORBLevels("SHORT", curr, high, low));
        }
        if (newPhase !== pair.phase) {
          patch.phase = newPhase;
          toast({ title: `📡 MT5: ${sym} → ${ORB_PHASE_CFG[newPhase].label}`, description: "Phase auto-detected" });
        }
        const effectivePhase = patch.phase ?? pair.phase;
        const isRetest = effectivePhase === "RETEST_LONG" || effectivePhase === "RETEST_SHORT";
        if (isRetest && pair.aiScore === undefined && !autoAnalyzingRef.current.has(sym)) {
          autoAnalyzingRef.current.add(sym);
          setAnalyzingId(sym);
          toast({ title: `🤖 Auto-analyzing ${sym}…`, description: "Retest detected via MT5" });
          analyzeMutation.mutate({ ...pair, ...patch } as ORBPairState);
        }
      }
      updatePair(sym, patch);
    } catch { updatePair(sym, { mt5Status: "error" }); }
  }, [pairStates, toast, analyzeMutation]);

  // 30-second auto-poll interval
  useEffect(() => {
    const interval = setInterval(() => {
      Object.values(pairStates).filter(p => p.autoMode && !p.tradeTaken).forEach(p => pollMT5Pair(p.symbol));
    }, 30000);
    return () => clearInterval(interval);
  }, [pairStates, pollMT5Pair]);

  // Auto-fire webhook when score ≥ 70 at retest in auto mode
  useEffect(() => {
    Object.values(pairStates).forEach(pair => {
      if (!pair.autoMode || pair.tradeTaken || autoFiredRef.current.has(pair.symbol)) return;
      const isRetest = pair.phase === "RETEST_LONG" || pair.phase === "RETEST_SHORT";
      if (isRetest && (pair.aiScore ?? 0) >= 70) {
        autoFiredRef.current.add(pair.symbol);
        autoAnalyzingRef.current.delete(pair.symbol);
        apiRequest("POST", "/api/orb/fire-webhook", {
          symbol: pair.symbol, orbHigh: pair.orbHigh, orbLow: pair.orbLow,
          currentPrice: pair.currentPrice, phase: pair.phase,
          tradeDirection: pair.tradeDirection, aiScore: pair.aiScore,
          entryPrice: pair.entryPrice, stopLoss: pair.stopLoss,
          target1: pair.target1, target2: pair.target2,
        }).catch(() => {});
        toast({ title: `🚀 Auto-Webhook: ${pair.symbol}`, description: `Retest + SS AI ${pair.aiScore}/100 — signal fired!` });
      }
    });
  }, [pairStates]);

  function toggleAutoMode(sym: string) {
    const pair = pairStates[sym];
    if (!pair) return;
    const enabling = !pair.autoMode;
    updatePair(sym, { autoMode: enabling, mt5Status: enabling ? "idle" : undefined });
    if (enabling) {
      toast({ title: `⚡ MT5 Auto-Fill: ${sym}`, description: "Polling live data every 30s" });
      setTimeout(() => pollMT5Pair(sym), 500);
    } else {
      autoFiredRef.current.delete(sym);
      autoAnalyzingRef.current.delete(sym);
    }
  }

  function logTrade(sym: string) {
    updatePair(sym, { tradeTaken: true, phase: "TRADE_TAKEN" });
    const pair = pairStates[sym];
    toast({ title: `✅ ${sym} trade logged`, description: `${pair?.tradeDirection ?? ""} — done for today` });
  }

  function fireWebhook(sym: string) {
    const pair = pairStates[sym];
    if (!pair) return;
    apiRequest("POST", "/api/orb/fire-webhook", {
      symbol: sym, orbHigh: pair.orbHigh, orbLow: pair.orbLow,
      currentPrice: pair.currentPrice, phase: pair.phase,
      tradeDirection: pair.tradeDirection, aiScore: pair.aiScore,
      entryPrice: pair.entryPrice, stopLoss: pair.stopLoss,
      target1: pair.target1, target2: pair.target2,
    }).then(r => {
      if (r.ok) toast({ title: `📡 Webhook fired: ${sym}`, description: "Signal sent to connected EA/bot" });
      else toast({ title: "Webhook failed", variant: "destructive" });
    }).catch(() => toast({ title: "Webhook failed", variant: "destructive" }));
  }

  const pairList = pairs.filter(p => pairStates[p]);
  const tradedCount = pairList.filter(p => pairStates[p]?.tradeTaken).length;
  const retestCount = pairList.filter(p => pairStates[p]?.phase === "RETEST_LONG" || pairStates[p]?.phase === "RETEST_SHORT").length;
  const mt5LiveCount = pairList.filter(p => pairStates[p]?.mt5Status === "connected").length;

  if (pairList.length === 0) {
    return (
      <div className="p-3 rounded-xl text-center text-xs text-gray-500 border border-dashed border-white/10 mt-3">
        Select pairs above to track them in the ORB engine
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-3">
      {/* Mini stats */}
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: "Pairs Tracked", value: pairList.length, color: "#6366f1" },
          { label: "MT5 Live", value: mt5LiveCount, color: "#22c55e" },
          { label: "Retest Alerts", value: retestCount, color: "#f59e0b" },
          { label: "Trades Taken", value: tradedCount, color: "#8b5cf6" },
        ].map(({ label, value, color }) => (
          <div key={label} className="p-2 rounded-xl text-center border" style={{ background: color + "0d", borderColor: color + "30" }}>
            <p className="text-lg font-black" style={{ color }}>{value}</p>
            <p className="text-[9px] text-gray-500 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Per-pair cards */}
      <div className="grid sm:grid-cols-2 gap-2">
        {pairList.map(sym => {
          const pair = pairStates[sym];
          if (!pair) return null;
          const cfg = ORB_PHASE_CFG[pair.phase];
          const isRetest = pair.phase === "RETEST_LONG" || pair.phase === "RETEST_SHORT";
          const isAnalyzing = analyzingId === sym;

          return (
            <div key={sym} className="rounded-xl border p-3 space-y-2"
              style={{ background: "linear-gradient(135deg, #0a0e1f, #0d1229)", borderColor: cfg.color + "40" }}>

              {/* Header row */}
              <div className="flex items-center gap-2">
                <span className="font-black text-white text-sm">{sym}</span>
                {pair.tradeDirection === "LONG"
                  ? <ArrowUpRight className="w-3.5 h-3.5 text-green-400" />
                  : pair.tradeDirection === "SHORT"
                  ? <ArrowDownRight className="w-3.5 h-3.5 text-red-400" />
                  : <Minus className="w-3.5 h-3.5 text-gray-600" />}
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: cfg.color + "20", color: cfg.color }}>{cfg.label}</span>
                {isRetest && <span className="text-[8px] font-black px-1.5 py-0.5 rounded-full animate-pulse" style={{ background: "rgba(34,197,94,0.25)", color: "#22c55e" }}>ENTRY ZONE</span>}
                {pair.autoMode && (
                  <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full ml-auto animate-pulse"
                    style={{
                      background: pair.mt5Status === "connected" ? "rgba(34,197,94,0.2)" : "rgba(245,158,11,0.2)",
                      color: pair.mt5Status === "connected" ? "#4ade80" : "#fbbf24",
                    }}>
                    {pair.mt5Status === "connected" ? "⚡ LIVE" : "⏳ SYNC"}
                  </span>
                )}
                {/* MT5 auto toggle */}
                <button
                  onClick={() => toggleAutoMode(sym)}
                  title={pair.autoMode ? "Disable MT5 auto-fill" : "Enable MT5 auto-fill"}
                  className="w-6 h-6 rounded-md flex items-center justify-center ml-auto transition-colors"
                  style={{
                    background: pair.autoMode ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
                    border: pair.autoMode ? "1px solid rgba(34,197,94,0.4)" : "1px solid transparent",
                    color: pair.autoMode ? "#4ade80" : "#6b7280",
                  }}>
                  <Activity className="w-3 h-3" />
                </button>
              </div>

              {/* Price levels */}
              {pair.orbHigh > 0 && (
                <div className="grid grid-cols-4 gap-1 text-center">
                  {[
                    { l: "ORB H", v: pair.orbHigh, c: "#f59e0b" },
                    { l: "ORB L", v: pair.orbLow,  c: "#f59e0b" },
                    { l: "Stop",  v: pair.stopLoss, c: "#ef4444" },
                    { l: "T1",    v: pair.target1,  c: "#22c55e" },
                  ].map(({ l, v, c }) => (
                    <div key={l} className="p-1 rounded-md" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <p className="text-[7px] uppercase" style={{ color: c }}>{l}</p>
                      <p className="text-[10px] font-bold text-white">{v ? v.toFixed(2) : "—"}</p>
                    </div>
                  ))}
                </div>
              )}
              {pair.currentPrice > 0 && (
                <p className="text-[9px] text-gray-500 text-center">Current: <span className="text-white font-semibold">{pair.currentPrice.toFixed(2)}</span>
                  {pair.lastUpdated && <span className="ml-1 text-gray-600">· {pair.lastUpdated}</span>}
                </p>
              )}
              {/* Pre-market bias + detected pattern row */}
              {(pair.preMarketBias || pair.detectedPattern) && (
                <div className="flex items-center gap-2 flex-wrap">
                  {pair.preMarketBias && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: pair.preMarketBias === "bullish" ? "rgba(34,197,94,0.15)" : pair.preMarketBias === "bearish" ? "rgba(239,68,68,0.15)" : "rgba(107,114,128,0.15)",
                        color: pair.preMarketBias === "bullish" ? "#4ade80" : pair.preMarketBias === "bearish" ? "#f87171" : "#9ca3af",
                      }}>
                      {pair.preMarketBias === "bullish" ? "📈" : pair.preMarketBias === "bearish" ? "📉" : "➖"} {pair.preMarketBias} bias
                    </span>
                  )}
                  {pair.detectedPattern && (
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{ background: "rgba(245,158,11,0.15)", color: "#fbbf24" }}>
                      🕯 {pair.detectedPattern}
                    </span>
                  )}
                </div>
              )}

              {/* AI score bar */}
              {pair.aiScore !== undefined && (
                <div className="space-y-1">
                  <div className="flex justify-between text-[9px]">
                    <span style={{ color: pair.aiScore >= 70 ? "#4ade80" : "#f87171" }}>SS AI Bot: {pair.aiScore}/100</span>
                    <span className="text-gray-500">{pair.aiScore >= 70 ? "✅ Trade eligible" : "❌ Below threshold"}</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pair.aiScore}%`, background: pair.aiScore >= 70 ? "#22c55e" : "#ef4444" }} />
                  </div>
                  {pair.aiNote && <p className="text-[8px] text-gray-600 italic">{pair.aiNote}</p>}
                </div>
              )}

              {/* Action buttons */}
              {!pair.tradeTaken ? (
                <div className="flex gap-1.5">
                  <button
                    onClick={() => { setAnalyzingId(sym); analyzeMutation.mutate(pair); }}
                    disabled={isAnalyzing || !pair.orbHigh}
                    className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-semibold transition-colors disabled:opacity-40"
                    style={{ background: "rgba(139,92,246,0.15)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }}>
                    {isAnalyzing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Radio className="w-3 h-3" />}
                    {isAnalyzing ? "Analyzing…" : "SS AI Bot"}
                  </button>
                  {isRetest && (
                    <button
                      onClick={() => logTrade(sym)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold"
                      style={{
                        background: pair.tradeDirection === "LONG" ? "linear-gradient(135deg,#16a34a,#15803d)" : "linear-gradient(135deg,#dc2626,#b91c1c)",
                        color: "white",
                      }}>
                      {pair.tradeDirection === "LONG" ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                      Log {pair.tradeDirection ?? "Trade"}
                    </button>
                  )}
                  {(pair.aiScore ?? 0) >= 70 && isRetest && (
                    <button
                      onClick={() => fireWebhook(sym)}
                      className="w-8 flex items-center justify-center rounded-lg transition-colors"
                      style={{ background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.4)", color: "#fbbf24" }}
                      title="Fire webhook signal">
                      <Send className="w-3 h-3" />
                    </button>
                  )}
                  {(isRetest || pair.phase === "BREAKOUT_LONG" || pair.phase === "BREAKOUT_SHORT") && pair.orbHigh > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10 h-7 px-2"
                      onClick={() => setStopOrderPair(pairStates[sym])}
                    >
                      <Target className="h-3 w-3 mr-1" />
                      Stop Order
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-semibold"
                  style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)", color: "#c4b5fd" }}>
                  <CheckCircle className="w-3 h-3" /> Trade Taken — Done For Today
                </div>
              )}

              {/* Manual price override (if auto mode is off) */}
              {!pair.autoMode && (
                <details className="text-[9px]">
                  <summary className="text-gray-600 cursor-pointer hover:text-gray-400 transition-colors">✏ Manual entry</summary>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    {[
                      { label: "ORB High", key: "orbHigh" as const, placeholder: "e.g. 39250" },
                      { label: "ORB Low",  key: "orbLow"  as const, placeholder: "e.g. 39100" },
                      { label: "Price",    key: "currentPrice" as const, placeholder: "e.g. 39310" },
                    ].map(({ label, key, placeholder }) => (
                      <div key={key}>
                        <p className="text-gray-600 mb-0.5">{label}</p>
                        <input
                          type="number"
                          defaultValue={pair[key] || ""}
                          placeholder={placeholder}
                          className="w-full bg-white/5 border border-white/10 rounded px-1.5 py-1 text-white text-[9px] focus:outline-none focus:border-indigo-500/50"
                          onBlur={e => {
                            const val = parseFloat(e.target.value);
                            if (val > 0) {
                              const updated = { ...pair, [key]: val };
                              if (updated.orbHigh > 0 && updated.orbLow > 0 && updated.currentPrice > 0) {
                                const h = updated.orbHigh; const l = updated.orbLow; const c = updated.currentPrice;
                                let phase: ORBPairPhase = "RANGE_SET";
                                let dir: "LONG" | "SHORT" | undefined;
                                let levels = {};
                                if (c > h * 1.001) { phase = "BREAKOUT_LONG"; dir = "LONG"; levels = calcORBLevels("LONG", c, h, l); }
                                else if (c < l * 0.999) { phase = "BREAKOUT_SHORT"; dir = "SHORT"; levels = calcORBLevels("SHORT", c, h, l); }
                                else if (c >= h * 0.998 && c <= h * 1.002 && pair.phase === "BREAKOUT_LONG") { phase = "RETEST_LONG"; dir = "LONG"; levels = calcORBLevels("LONG", c, h, l); }
                                else if (c >= l * 0.998 && c <= l * 1.002 && pair.phase === "BREAKOUT_SHORT") { phase = "RETEST_SHORT"; dir = "SHORT"; levels = calcORBLevels("SHORT", c, h, l); }
                                updatePair(sym, { [key]: val, phase, tradeDirection: dir, entryPrice: dir ? c : undefined, ...levels, aiScore: undefined, lastUpdated: new Date().toLocaleTimeString() });
                              } else {
                                updatePair(sym, { [key]: val });
                              }
                            }
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[9px] text-gray-600 text-center">
        ⚡ Tap the activity icon on any pair to enable MT5 auto-fill · SS AI Bot auto-runs at retest · Webhook fires automatically when score ≥ 70
      </p>

      {/* Stop Order Modal */}
      {stopOrderPair && (
        <Dialog open={!!stopOrderPair} onOpenChange={() => setStopOrderPair(null)}>
          <DialogContent className="bg-gray-950 border-white/10 text-white max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Target className="w-4 h-4 text-amber-400" />
                Set Stop Order — {stopOrderPair.symbol}
              </DialogTitle>
              <DialogDescription className="text-gray-500 text-xs">
                Pre-filled from ORB levels. Adjust lot size before placing.
              </DialogDescription>
            </DialogHeader>
            <StopOrderFormInline
              pair={stopOrderPair}
              onClose={() => setStopOrderPair(null)}
              toast={toast}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StopOrderFormInline({ pair, onClose, toast }: { pair: ORBPairState; onClose: () => void; toast: ReturnType<typeof useToast>['toast'] }) {
  const [lotSize, setLotSize] = useState("0.01");
  const isLong = pair.tradeDirection === "LONG";
  const direction = isLong ? "BUY_STOP" : "SELL_STOP";
  const triggerPrice = pair.entryPrice || (isLong ? pair.orbHigh : pair.orbLow) || 0;
  const stopLoss = pair.stopLoss || 0;
  const breakoutLevel = isLong ? pair.orbHigh : pair.orbLow;

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stop-orders", {
        symbol: pair.symbol,
        direction,
        triggerPrice,
        stopLoss,
        lotSize: parseFloat(lotSize) || 0.01,
        breakoutLevel,
      });
      if (!res.ok) throw new Error("Failed to place stop order");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stop Order placed!", description: `${pair.symbol} ${direction} @ ${triggerPrice}` });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to place stop order", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-4 pt-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">Direction</Label>
          <div className="mt-1 px-3 py-2 rounded-lg text-sm font-bold"
            style={{ background: isLong ? "rgba(34,197,94,0.15)" : "rgba(239,68,68,0.15)", color: isLong ? "#4ade80" : "#f87171" }}>
            {direction}
          </div>
        </div>
        <div>
          <Label className="text-xs text-gray-400">Symbol</Label>
          <div className="mt-1 px-3 py-2 rounded-lg text-sm font-bold text-white bg-white/5">{pair.symbol}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">Trigger Price</Label>
          <div className="mt-1 px-3 py-2 rounded-lg text-sm text-white bg-white/5">{triggerPrice || "—"}</div>
        </div>
        <div>
          <Label className="text-xs text-gray-400">Stop Loss</Label>
          <div className="mt-1 px-3 py-2 rounded-lg text-sm text-red-400 bg-white/5">{stopLoss || "—"}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs text-gray-400">Breakout Level</Label>
          <div className="mt-1 px-3 py-2 rounded-lg text-sm text-amber-400 bg-white/5">{breakoutLevel || "—"}</div>
        </div>
        <div>
          <Label className="text-xs text-gray-400">Lot Size</Label>
          <Input
            type="number"
            value={lotSize}
            onChange={e => setLotSize(e.target.value)}
            className="mt-1 bg-white/5 border-white/10 text-white text-sm h-9"
            step="0.01"
            min="0.01"
          />
        </div>
      </div>
      <Button
        onClick={() => placeOrderMutation.mutate()}
        disabled={placeOrderMutation.isPending}
        className="w-full font-bold"
        style={{ background: "rgba(251,191,36,0.2)", border: "1px solid rgba(251,191,36,0.4)", color: "#fbbf24" }}
      >
        {placeOrderMutation.isPending ? <RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> : <Target className="w-3.5 h-3.5 mr-2" />}
        Place Stop Order
      </Button>
    </div>
  );
}

// ─── Setup Checklist Component ────────────────────────────────────────────────

interface SetupChecklistProps {
  growthPlan: any;
  profitTarget: string;
  selectedPairs: string[];
  liveEngineStatus: any;
  strategy: any;
  liveMode: any;
}

function SetupChecklist({ growthPlan, profitTarget, selectedPairs, liveEngineStatus, strategy, liveMode }: SetupChecklistProps) {
  const steps = [
    {
      num: 1,
      title: "Account Growth Plan",
      desc: "Link your growth plan to auto-set risk & trade limits",
      // done when growthPlan object exists (user has visited & saved the page)
      // previously checked growthPlan?.plan (sub-object) which was null even after setup
      done: !!growthPlan,
      link: "/account-growth",
      linkLabel: "Set Up",
    },
    {
      num: 2,
      title: "Set Weekly Target",
      desc: "Enter your weekly profit goal ($)",
      done: parseFloat(profitTarget) > 0,
      scrollTo: "profit-target-section",
      linkLabel: "Set Target",
    },
    {
      num: 3,
      title: "Select Pairs",
      desc: "Choose which pairs to trade this week",
      done: selectedPairs.length > 0,
      scrollTo: "pairs-section",
      linkLabel: "Select Pairs",
    },
    {
      num: 4,
      title: "Engine Settings",
      desc: "Configure risk per trade, max trades, strategy mode",
      done: liveEngineStatus?.status === 'running' || liveEngineStatus?.status === 'idle',
      scrollTo: "engine-settings-section",
      linkLabel: "Configure",
    },
    {
      num: 5,
      title: "Generate Strategy",
      desc: "Run the SS AI to build this week's plan",
      done: !!strategy?.hasStrategy,
      scrollTo: "generate-section",
      linkLabel: "Generate",
    },
    {
      num: 6,
      title: "Activate SS AI Live",
      desc: "Turn on the AI confirmation bot",
      done: !!liveMode?.live,
      scrollTo: "live-mode-section",
      linkLabel: "Activate",
    },
  ];

  const completedCount = steps.filter(s => s.done).length;
  const allDone = completedCount === steps.length;

  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('setup_checklist_collapsed');
    if (saved !== null) return saved === 'true';
    return allDone;
  });

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem('setup_checklist_collapsed', String(next));
  };

  // Determine step state: done, next (first incomplete), locked
  const firstIncompleteIndex = steps.findIndex(s => !s.done);

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-[rgba(255,255,255,0.03)] overflow-hidden mb-4">
      {/* Header / Progress bar */}
      <button
        onClick={toggleCollapsed}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-sm font-bold text-white whitespace-nowrap">
            {allDone ? "✅ Setup Complete" : `⚡ Setup Guide — ${completedCount}/6 complete`}
          </span>
          {/* Progress bar */}
          <div className="flex-1 min-w-0 max-w-48">
            <div className="h-1.5 rounded-full bg-gray-700/60 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${allDone ? 'bg-emerald-500' : 'bg-amber-500'}`}
                style={{ width: `${(completedCount / 6) * 100}%` }}
              />
            </div>
          </div>
          <span className={`text-xs font-semibold ${allDone ? 'text-emerald-400' : 'text-amber-400'}`}>
            {Math.round((completedCount / 6) * 100)}%
          </span>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ml-3 shrink-0 ${collapsed ? '' : 'rotate-180'}`} />
      </button>

      {/* Steps list */}
      {!collapsed && (
        <div className="px-4 pb-4 space-y-2">
          {steps.map((step, i) => {
            const isDone = step.done;
            const isNext = !isDone && i === firstIncompleteIndex;
            const isLocked = !isDone && !isNext;

            return (
              <div
                key={step.num}
                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                  isDone
                    ? 'border-emerald-500/20 bg-emerald-500/5'
                    : isNext
                    ? 'border-amber-500/40 bg-amber-500/8 ring-1 ring-amber-500/20'
                    : 'border-gray-700/30 bg-gray-800/15 opacity-50'
                }`}
              >
                {/* Number badge */}
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                  isDone
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : isNext
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'bg-gray-700/40 text-gray-600'
                }`}>
                  {isDone ? '✓' : step.num}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-xs font-bold truncate ${
                      isDone ? 'text-emerald-300' : isNext ? 'text-amber-200' : 'text-gray-600'
                    }`}>
                      {step.title}
                    </p>
                    {isDone && <span className="text-[9px] text-emerald-500 font-semibold shrink-0">Done</span>}
                    {isNext && <span className="text-[9px] bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full font-bold shrink-0">DO THIS NOW</span>}
                    {isLocked && <span className="text-[9px] text-gray-600 shrink-0">🔒</span>}
                  </div>
                  <p className={`text-[10px] mt-0.5 truncate ${
                    isDone ? 'text-gray-500' : isNext ? 'text-gray-300' : 'text-gray-700'
                  }`}>
                    {step.desc}
                  </p>
                </div>

                {/* Action button */}
                {isNext && step.link && (
                  <a
                    href={step.link}
                    className="shrink-0 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    {step.linkLabel} →
                  </a>
                )}
                {isNext && step.scrollTo && (
                  <button
                    onClick={() => document.getElementById(step.scrollTo!)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                    className="shrink-0 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap"
                  >
                    {step.linkLabel} ↓
                  </button>
                )}
                {isDone && step.link && (
                  <a href={step.link} className="shrink-0 text-[10px] text-gray-600 hover:text-gray-400 transition-colors whitespace-nowrap">
                    Open
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WeeklyStrategyPage() {
  const { user } = useAuth();
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
  const [highConfidenceOverride, setHighConfidenceOverride] = useState(false);
  const [confirmationModel, setConfirmationModel] = useState<string>('gpt-4o');
  const [showPinPairs, setShowPinPairs] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [showBrain, setShowBrain] = useState(false);
  const [showWeeklyPlan, setShowWeeklyPlan] = useState(false);

  const [showStrategyPerf, toggleStrategyPerf] = useSectionToggle("weekly", "strategy_perf", true);
  const [showDailyBattle, toggleDailyBattle] = useSectionToggle("weekly", "daily_battle", true);
  const [showAiRisk, toggleAiRisk] = useSectionToggle("weekly", "ai_risk", true);
  const [showAiPairs, toggleAiPairs] = useSectionToggle("weekly", "ai_pairs", true);
  const [showCompound, toggleCompound] = useSectionToggle("weekly", "compound", true);
  const [showEaSetup, toggleEaSetup] = useSectionToggle("weekly", "ea_setup", false);
  const [showBrainSection, toggleBrainSection] = useSectionToggle("weekly", "brain", true);
  const [liveEngineTab, setLiveEngineTab] = useState<'activity' | 'market' | 'pairs' | 'combos'>('activity');
  const [activeTab, setActiveTab] = useState<'plan'|'config'|'brain'|'engine'|'monitor'|'pacing'|'paper'>('plan');
  const [paperBalanceInput, setPaperBalanceInput] = useState("");
  const [paperEditingBalance, setPaperEditingBalance] = useState(false);
  const [pacingResult, setPacingResult] = useState<any>(null);
  const [pacingLoading, setPacingLoading] = useState(false);
  const [aiPathStatus, setAiPathStatus] = useState<any>(null);
  const [aiPathLoading, setAiPathLoading] = useState(false);

  // Deep-link support: ?tab=engine, ?tab=monitor, etc.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && ['plan','config','brain','engine','monitor','pacing','paper'].includes(tab)) {
      setActiveTab(tab as any);
    }
  }, []);

  // Load AI path status when pacing tab is opened
  useEffect(() => {
    if (activeTab === 'pacing') {
      apiRequest('GET', '/api/goal-pacing/ai-path-status')
        .then(r => r.json())
        .then(data => setAiPathStatus(data))
        .catch(() => {});
    }
  }, [activeTab]);

  const { data: growthPlan } = useQuery<any>({
    queryKey: ['/api/growth-plan'],
    staleTime: 0,          // always consider stale — re-fetch on return to page
    refetchOnMount: true,  // force fetch every mount so setup guide reflects saved plan
  });

  const { data: strategy, isLoading } = useQuery<WeeklyStrategy>({
    queryKey: ['/api/weekly-strategy'],
    refetchInterval: 15000, // refresh strategy display every 15s for live profit
    staleTime: 0,
  });

  const { data: liveMode } = useQuery<{ live: boolean; hasStrategy: boolean }>({
    queryKey: ['/api/weekly-strategy/live-mode'],
    refetchInterval: 30000,  // refresh live-mode toggle status every 30s
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

  const { data: ssConsensusData } = useQuery<{ consensus: any[]; summary: any; updatedAt: string | null }>({
    queryKey: ['/api/ss-engine/consensus'],
    refetchInterval: 15000,
  });

  // Auto-detect connected account balance (MT5 or TradeLocker)
  const { data: mt5AccountData } = useQuery<any>({
    queryKey: ['/api/mt5/account-data'],
    refetchInterval: 30000,
  });
  const { data: tlConnection } = useQuery<any>({
    queryKey: ['/api/tradelocker/connection'],
    refetchInterval: 30000,
    staleTime: 0,
  });
  // All active TL connections — used in engine section
  const { data: tlConnectionsEngine = [] } = useQuery<any[]>({
    queryKey: ['/api/tradelocker/connections'],
    refetchInterval: 30000,
    staleTime: 0,
  });
  const activeTLEngineConns = tlConnectionsEngine.filter((c: any) => c.isActive);

  // Live TL account balance — served from the server background-sync cache
  // (kept fresh like MT5), so totals update live including on trade open/close.
  const { data: tlAccountBalance } = useQuery<any>({
    queryKey: ['/api/tradelocker/account-data'],
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  // Execution diagnostics — which accounts are actually firing trades
  const { data: execStatus, refetch: refetchExecStatus } = useQuery<any>({
    queryKey: ['/api/tradelocker/exec-status'],
    refetchInterval: 30000,
    staleTime: 0,
  });

  // Live TL trade history — syncs closed positions + bot logs on every fetch
  const { data: tlTrades = [] } = useQuery<any[]>({
    queryKey: ['/api/tradelocker/trades'],
    enabled: activeTLEngineConns.length > 0,
    refetchInterval: 15000,
    staleTime: 0,
    select: (d) => (Array.isArray(d) ? d.slice(0, 20) : []),
  });

  // Markov chain probability data — updated every scan cycle
  const { data: markovOverview } = useQuery<{ overview: any[]; count: number }>({
    queryKey: ['/api/markov/overview'],
    refetchInterval: 15000,
    staleTime: 0,
    enabled: !!user,
  });

  // Polymarket BTC sentiment — 5 min cache on server
  const { data: polymarketSentiment } = useQuery<any>({
    queryKey: ['/api/polymarket/btc'],
    enabled: !!user,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
  });

  // Composite Edge — Markov × Polymarket fused signal for BTC
  // Note: liveEngineStatus is declared lower in the component — use !!user only here;
  // the refetchInterval keeps it fresh once the engine is running
  const { data: btcComposite } = useQuery<any>({
    queryKey: ['/api/composite-edge/BTCUSD'],
    enabled: !!user,
    refetchInterval: 15000,
    staleTime: 0,
  });

  // ── Connected account selector (must be declared before the balance-sync useEffect below) ──
  const [selectedEngineAccount, setSelectedEngineAccount] = useState<ConnectedAccount | null>(null);

  // Pre-fill balance from connected account whenever data arrives
  // Priority: TL live equity > MT5 live > TL DB connection field
  // Skip entirely if user has already made an explicit account selection.
  useEffect(() => {
    if (selectedEngineAccount) return;

    const mt5Balance = mt5AccountData?.accounts?.[0]?.balance ?? (mt5AccountData?.connected ? mt5AccountData?.balance : null);
    // Use live equity from the dedicated balance endpoint (sum of all active TL accounts)
    const tlLiveBalance = tlAccountBalance?.totalEquity && tlAccountBalance.totalEquity > 0
      ? tlAccountBalance.totalEquity
      : (tlAccountBalance?.totalBalance || null);
    // Fallback to DB connection field if live fetch not yet available
    const tlFallback = (tlConnection as any)?.accountBalance ?? (tlConnection as any)?.balance ?? null;
    const tlBalance = tlLiveBalance ?? tlFallback;

    if (tlBalance && tlBalance > 0) {
      setAccountBalance(String(Math.round(tlBalance * 100) / 100));
      setAutoBalanceSource(tlLiveBalance ? 'TradeLocker (Live)' : 'TradeLocker');
      // Sync engine config balance — TL live balance auto-fills the engine config field
      setEngineAccountBalance(prev => prev > 0 ? prev : Math.round(tlBalance * 100) / 100);
    } else if (mt5Balance && mt5Balance > 0) {
      setAccountBalance(String(Math.round(mt5Balance * 100) / 100));
      setAutoBalanceSource('MT5');
      // Sync engine config balance when MT5 is the source
      setEngineAccountBalance(prev => prev > 0 ? prev : Math.round(mt5Balance * 100) / 100);
    }
  }, [selectedEngineAccount, mt5AccountData, tlConnection, tlAccountBalance]);

  // Note: engine account balance is synced by ConnectedAccountPicker OR the auto-detect above

  // ── FX Paper Trading queries ─────────────────────────────────────────────────
  const { data: paperAccount, refetch: refetchPaperAccount } = useQuery<any>({
    queryKey: ['/api/fx-paper/account'],
    refetchInterval: activeTab === 'paper' ? 10000 : false,
  });
  const { data: paperTrades = [], refetch: refetchPaperTrades } = useQuery<any[]>({
    queryKey: ['/api/fx-paper/trades'],
    refetchInterval: activeTab === 'paper' ? 10000 : false,
  });

  const togglePaperMutation = useMutation({
    mutationFn: async (isEnabled: boolean) => {
      const res = await apiRequest('POST', '/api/fx-paper/account', { isEnabled });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fx-paper/account'] });
    },
  });

  const savePaperBalanceMutation = useMutation({
    mutationFn: async (balance: number) => {
      const res = await apiRequest('POST', '/api/fx-paper/account', { balance, isEnabled: paperAccount?.isEnabled ?? false });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fx-paper/account'] });
      setPaperEditingBalance(false);
      toast({ title: "Paper balance updated" });
    },
  });

  const closePaperTradeMutation = useMutation({
    mutationFn: async ({ id, exitPrice, pnl, pnlPips }: { id: number; exitPrice: number; pnl: number; pnlPips?: number }) => {
      const res = await apiRequest('PATCH', `/api/fx-paper/trades/${id}`, { exitPrice, pnl, pnlPips });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fx-paper/trades'] });
      queryClient.invalidateQueries({ queryKey: ['/api/fx-paper/account'] });
      toast({ title: "Paper trade closed" });
    },
  });

  const clearPaperHistoryMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/fx-paper/trades', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/fx-paper/trades'] });
      toast({ title: "Closed trade history cleared" });
    },
  });

  const openPaperTrades = (paperTrades as any[]).filter((t: any) => t.status === 'open');
  const closedPaperTrades = (paperTrades as any[]).filter((t: any) => t.status === 'closed');
  const runningPnl = openPaperTrades.reduce((sum: number, t: any) => sum + (t.pnl ?? 0), 0);

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
      if (data.pairDailyStats) setPairDailyStats(data.pairDailyStats);
      // Store daily progress data
      if (data.dailyTarget !== undefined) {
        setDailyTarget(data.dailyTarget);
        setTodayClosedProfit(data.todayClosedProfit || 0);
        setTodayTotalProfit(data.todayTotalProfit || 0);
        setDailyProgressClosed(data.dailyProgressClosed || 0);
        setDailyProgressTotal(data.dailyProgressTotal || 0);
        setTodayTrades(data.todayTrades || 0);
        setTodayWinRate(data.todayWinRate || 0);
      }
      if (!data.silent) {
        const activeMsg = data.activeTradeCount > 0 ? ` | ${data.activeTradeCount} active trade(s)` : '';
        toast({ title: "Progress Synced", description: `Today: $${data.todayClosedProfit?.toFixed(2) || 0} | Week: $${data.currentProfit} | ${data.unrealizedPnL || 0} unrealized${activeMsg}` });
      }
    },
  });

  // Auto-sync progress every 30 seconds when a strategy is active (silent — no toast)
  // Was 60s — halved so today's profit and weekly goal bars update faster
  useEffect(() => {
    if (!strategy?.hasStrategy) return;
    updateProgressMutation.mutate(true); // immediate silent sync on mount
    const interval = setInterval(() => {
      updateProgressMutation.mutate(true);
    }, 30000);
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
  const [pairDailyStats, setPairDailyStats] = useState<Record<string, any>>({});
  const [selectedSignalModes, setSelectedSignalModes] = useState<string[]>(["aggressive"]);
  const [autoExecuteSignals, setAutoExecuteSignals] = useState(false);

  // Daily progress tracking
  const [dailyTarget, setDailyTarget] = useState(0);
  const [todayClosedProfit, setTodayClosedProfit] = useState(0);
  const [todayTotalProfit, setTodayTotalProfit] = useState(0);
  const [dailyProgressClosed, setDailyProgressClosed] = useState(0);
  const [dailyProgressTotal, setDailyProgressTotal] = useState(0);
  const [todayTrades, setTodayTrades] = useState(0);
  const [todayWinRate, setTodayWinRate] = useState(0);

  // Load available vision models + user's current model preference
  const { data: aiModelsData } = useQuery<any>({
    queryKey: ['/api/ai-trading-models'],
  });
  const visionModels = (aiModelsData?.availableModels || []).filter((m: any) => !m.textOnly);

  // Load user's saved model preference — must use useEffect, not onSuccess (deprecated in RQ v5)
  const { data: savedModelPref } = useQuery<any>({
    queryKey: ['/api/ai-model-preference'],
    staleTime: 0,
    refetchOnMount: true,
  });
  useEffect(() => {
    if (savedModelPref?.model) setConfirmationModel(savedModelPref.model);
  }, [savedModelPref?.model]);

  const setModelMutation = useMutation({
    mutationFn: async (modelId: string) => {
      // Correct endpoint: /api/ai-model-preference (not /ai-trading-models/set-model which doesn't exist)
      const res = await apiRequest('POST', '/api/ai-model-preference', { model: modelId });
      return res.json();
    },
    onSuccess: (_, modelId) => toast({ title: "Model Updated", description: `2nd confirmation now uses ${modelId}` }),
    onError: () => toast({ title: "Model save failed", description: "Could not save model preference", variant: "destructive" }),
  });

  const handleSetConfirmationModel = (modelId: string) => {
    setConfirmationModel(modelId);
    setModelMutation.mutate(modelId);
  };

  const { data: brainStatus } = useQuery<any>({
    queryKey: ['/api/vedd-brain/status'],
    refetchInterval: 15000,  // auto-refresh so accuracy % and trade count stay live
    staleTime: 0,
  });

  const { data: autonomousSignals } = useQuery<any>({
    queryKey: ['/api/vedd-brain/autonomous-signals'],
    enabled: !!brainStatus?.learned,
    refetchInterval: 30000,
  });

  const { data: strategyModes } = useQuery<any>({
    queryKey: ['/api/vedd-brain/strategy-modes'],
  });

  const { data: weeklyScan, isLoading: scanLoading, refetch: runWeeklyScan } = useQuery<any>({
    queryKey: ['/api/vedd-brain/weekly-scan'],
    enabled: false, // manual trigger only
    staleTime: 5 * 60 * 1000, // cache for 5 min
  });

  const [showWeeklyScan, setShowWeeklyScan] = useState(false);
  const [showEnforcementLog, setShowEnforcementLog] = useState(false);

  const { data: enforcementLog } = useQuery<any>({
    queryKey: ['/api/vedd-brain/enforcement-log'],
    enabled: !!brainStatus?.learned,
    refetchInterval: 60000,
  });

  const { data: trailingStopSetting } = useQuery<any>({
    queryKey: ['/api/user/trailing-stop-setting'],
    enabled: !!brainStatus?.learned,
  });

  // Economic calendar for active strategy pairs
  const strategyPairs: string[] = strategy?.pairs ?? [];
  const calendarSymbol = strategyPairs[0] ?? 'EURUSD';
  const { data: econEvents } = useQuery<{ events: any[] }>({
    queryKey: ['/api/economic-calendar', calendarSymbol],
    queryFn: () => fetch(`/api/economic-calendar?symbol=${calendarSymbol}&days=2`).then(r => r.json()),
    staleTime: 5 * 60 * 1000,
    refetchInterval: 10 * 60 * 1000,
    enabled: !!user,
  });
  const highImpactEvents = (econEvents?.events ?? []).filter((e: any) => e.impact === 'high').slice(0, 4);

  // Helper: color-code brain freshness
  const getBrainFreshnessColor = (lastLearned: string | undefined) => {
    if (!lastLearned) return 'bg-gray-400';
    const diffMins = (Date.now() - new Date(lastLearned).getTime()) / 60000;
    if (diffMins < 35) return 'bg-emerald-400'; // fresh (within 30min auto-cycle)
    if (diffMins < 120) return 'bg-yellow-400';  // slightly stale
    return 'bg-red-400';                          // needs re-learn
  };
  const getBrainFreshnessLabel = (lastLearned: string | undefined) => {
    if (!lastLearned) return 'Never';
    const diffMins = (Date.now() - new Date(lastLearned).getTime()) / 60000;
    const hrs = Math.floor(diffMins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ${hrs % 24}h ago`;
    if (hrs > 0) return `${hrs}h ${Math.floor(diffMins % 60)}m ago`;
    if (diffMins >= 1) return `${Math.floor(diffMins)}m ago`;
    return 'just now';
  };

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
    mutationFn: async ({ modes, autoExec, minConf }: { modes: string[]; autoExec: boolean; minConf: number }) => {
      const res = await apiRequest('POST', '/api/vedd-brain/autonomous-signals', {
        strategyModes: modes,
        strategyMode: modes[0] || 'aggressive',
        autoExecute: autoExec,
        minConfidence: minConf,
        // Engine settings — all user-configured values flow through to execution
        enginePairs: enginePairs.length > 0 ? enginePairs : undefined,
        engineRiskPerTrade,
        engineAccountBalance,
        engineMaxLotSize,
        engineBaseLotSize,
        engineMaxTrades,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/vedd-brain/autonomous-signals'] });
      const executed = data?.executionResults?.filter((r: any) => r.status === 'executed')?.length || 0;
      const modesLabel = (data?.strategyModes || [data?.strategyMode]).filter(Boolean).join(' + ');
      if (data?.autoExecuted && executed > 0) {
        toast({ title: `${executed} Trade${executed > 1 ? 's' : ''} Executed!`, description: `AI signals auto-executed on TradeLocker (${modesLabel})` });
        // Brain re-learns server-side after 4s — refresh status after 6s to pick up updated counts
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ['/api/vedd-brain/status'] });
        }, 6000);
      } else {
        const signalCount = data?.signals?.length || 0;
        toast({ title: `${signalCount} Signal${signalCount !== 1 ? 's' : ''} Generated`, description: `Scanned ${(data?.strategyModes || []).length || 1} strateg${(data?.strategyModes?.length || 1) === 1 ? 'y' : 'ies'}: ${modesLabel}` });
      }
    },
    onError: (err: any) => {
      toast({ title: "Signal Generation Failed", description: err.message, variant: "destructive" });
    },
  });

  const [enginePairs, setEnginePairs] = useState<string[]>(['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD']);
  const [pairLotOverrides, setPairLotOverrides] = useState<Record<string, string>>({});

  const [enginePairInput, setEnginePairInput] = useState('');
  const [engineMode, setEngineMode] = useState('aggressive');
  const [engineMinConf, setEngineMinConf] = useState(65);
  const [engineMaxTrades, setEngineMaxTrades] = useState(5);
  const [engineMaxDailyTrades, setEngineMaxDailyTrades] = useState(0); // 0 = unlimited
  const [engineMaxLotSize, setEngineMaxLotSize] = useState(0.10);
  const [engineInterval, setEngineInterval] = useState(60);
  const [engineWeeklyTarget, setEngineWeeklyTarget] = useState(100);
  const [engineAccountBalance, setEngineAccountBalance] = useState(1000);
  const [engineExecutionSource, setEngineExecutionSource] = useState<'auto' | 'mt5' | 'tradelocker'>('auto');
  const [engineBaseLotSize, setEngineBaseLotSize] = useState(0.01);
  const [engineCompounding, setEngineCompounding] = useState(true);
  const [enginePropFirmMode, setEnginePropFirmMode] = useState(false);
  const [enginePropFirmDrawdown, setEnginePropFirmDrawdown] = useState(4);
  const [propFirmPreset, setPropFirmPreset] = useState<'FTMO'|'MFF'|'THE5ERS'|'FUNDED_NEXT'|'CUSTOM'>('FTMO');
  const [propFirmTotalDrawdown, setPropFirmTotalDrawdown] = useState(10);
  const [propFirmProfitTarget, setPropFirmProfitTarget] = useState(10);
  const [propFirmMinTradingDays, setPropFirmMinTradingDays] = useState(4);
  const [propFirmConsistencyRule, setPropFirmConsistencyRule] = useState(true);
  const [propFirmAllowOvernight, setPropFirmAllowOvernight] = useState(false);
  const [enginePyramiding, setEnginePyramiding] = useState(false);
  const [engineKellyCriterion, setEngineKellyCriterion] = useState(false);
  const [engineBrainLearningMode, setEngineBrainLearningMode] = useState(true);
  const [engineDrawdownShield, setEngineDrawdownShield] = useState(true);
  const [engineShieldThreshold, setEngineShieldThreshold] = useState(3);
  const [engineAdaptiveScan, setEngineAdaptiveScan] = useState(true);
  const [engineDailyLossLimit, setEngineDailyLossLimit] = useState(5);
  const [engineDailyProfitTarget, setEngineDailyProfitTarget] = useState(0);
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

  // Backtest state
  const [backtestOpen, setBacktestOpen] = useState(false);
  const [backtestPair, setBacktestPair] = useState('XAUUSD');
  const [backtestPeriod, setBacktestPeriod] = useState(90);
  const [backtestTP, setBacktestTP] = useState(2.5);
  const [backtestSL, setBacktestSL] = useState(1.2);
  const [backtestResult, setBacktestResult] = useState<any>(null);
  const [backtestLoading, setBacktestLoading] = useState(false);
  const [backtestTradeLogOpen, setBacktestTradeLogOpen] = useState(false);

  const [engineAiMode, setEngineAiMode] = useState<'full' | 'economy' | 'rule_based'>('full');
  const [engineVolatileCapMode, setEngineVolatileCapMode] = useState<'risk_scaled' | 'user_only'>('risk_scaled');
  const [engineCopyMode, setEngineCopyMode] = useState<'proportional' | 'multiplier'>('proportional');
  // Settings lock: engine never auto-adjusts risk/lots/pairs after user configures
  const [engineLockSettings, setEngineLockSettings] = useState(false);
  // Smart escalation: engine unlocks more pairs as account grows
  const [engineSmartEscalation, setEngineSmartEscalation] = useState(false);
  // High-confidence override: allow trades outside plan when EA+AI both ≥85%
  const [engineHighConfOverride, setEngineHighConfOverride] = useState(false);
  // Strategy lock: only the selected strategy fires — no mixing
  const [engineSingleStrategyMode, setEngineSingleStrategyMode] = useState(false);
  // Multiple trades per strategy per day: false = one trade max per strategy per day
  const [engineAllowMultipleTrades, setEngineAllowMultipleTrades] = useState(true);
  // ORB Autonomous: 9:30 AM breakout+retest fires trades directly
  const [engineORBAutonomous, setEngineORBAutonomous] = useState(true);
  // Composite Autonomous: Markov×Polymarket fires crypto trades independently of AI
  const [engineCompositeAutonomous, setEngineCompositeAutonomous] = useState(true);
  const [engineCompositeMinEdge, setEngineCompositeMinEdge] = useState(72);

  // ── Per-account settings: handlers (placed after all useState declarations) ─
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEngineAccountSelected = useCallback((account: ConnectedAccount | null) => {
    setSelectedEngineAccount(account);
    if (!account) return;
    if (account.balance > 0) setEngineAccountBalance(Math.round(account.balance * 100) / 100);
    setEngineExecutionSource(account.type === 'mt5' ? 'mt5' : 'tradelocker');
    const saved = loadAccountSettings(account.key);
    if (saved.riskPerTrade   != null) setEngineRiskPerTrade(saved.riskPerTrade);
    if (saved.maxLotSize     != null) setEngineMaxLotSize(saved.maxLotSize);
    if (saved.weeklyTarget   != null) setEngineWeeklyTarget(saved.weeklyTarget);
    if (saved.baseLotSize    != null) setEngineBaseLotSize(saved.baseLotSize);
    if (saved.interval       != null) setEngineInterval(saved.interval);
    if (saved.minConf        != null) setEngineMinConf(saved.minConf);
    if (saved.maxTrades      != null) setEngineMaxTrades(saved.maxTrades);
    if (saved.maxDailyTrades   != null) setEngineMaxDailyTrades(saved.maxDailyTrades);
    if (saved.dailyProfitTarget != null) setEngineDailyProfitTarget(saved.dailyProfitTarget);
    if (saved.compounding    != null) setEngineCompounding(saved.compounding);
    if (saved.drawdownShield != null) setEngineDrawdownShield(saved.drawdownShield);
    if (saved.shieldThreshold!= null) setEngineShieldThreshold(saved.shieldThreshold);
    if (saved.adaptiveScan   != null) setEngineAdaptiveScan(saved.adaptiveScan);
    if (saved.propFirmMode   != null) setEnginePropFirmMode(saved.propFirmMode);
    if (saved.aiMode         != null) setEngineAiMode(saved.aiMode);
    if (saved.volatileCapMode != null) setEngineVolatileCapMode(saved.volatileCapMode);
    if (saved.copyMode        != null) setEngineCopyMode(saved.copyMode);
    if (saved.accountBalance != null) setEngineAccountBalance(saved.accountBalance);
    if (saved.pairLotOverrides != null) setPairLotOverrides(saved.pairLotOverrides);
  }, [setEngineAccountBalance, setEngineExecutionSource, setEngineRiskPerTrade,
      setEngineMaxLotSize, setEngineWeeklyTarget, setEngineBaseLotSize, setEngineInterval,
      setEngineMinConf, setEngineMaxTrades, setEngineCompounding, setEngineDrawdownShield,
      setEngineShieldThreshold, setEngineAdaptiveScan, setEnginePropFirmMode, setEngineAiMode,
      setEngineVolatileCapMode, setEngineCopyMode]);

  const queueSaveAccountSettings = useCallback(() => {
    if (!selectedEngineAccount) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveAccountSettings(selectedEngineAccount.key, {
        riskPerTrade: engineRiskPerTrade, maxLotSize: engineMaxLotSize,
        weeklyTarget: engineWeeklyTarget, baseLotSize: engineBaseLotSize,
        interval: engineInterval, minConf: engineMinConf, maxTrades: engineMaxTrades,
        maxDailyTrades: engineMaxDailyTrades,
        compounding: engineCompounding, drawdownShield: engineDrawdownShield,
        shieldThreshold: engineShieldThreshold, adaptiveScan: engineAdaptiveScan,
        propFirmMode: enginePropFirmMode, aiMode: engineAiMode,
        volatileCapMode: engineVolatileCapMode,
        copyMode: engineCopyMode,
        accountBalance: engineAccountBalance,
        pairLotOverrides,
        dailyProfitTarget: engineDailyProfitTarget,
      });
    }, 800);
  }, [selectedEngineAccount, engineRiskPerTrade, engineMaxLotSize, engineWeeklyTarget,
      engineBaseLotSize, engineInterval, engineMinConf, engineMaxTrades, engineMaxDailyTrades, engineCompounding,
      engineDrawdownShield, engineShieldThreshold, engineAdaptiveScan, enginePropFirmMode,
      engineAiMode, engineVolatileCapMode, engineCopyMode, engineAccountBalance]);

  useEffect(() => { queueSaveAccountSettings(); }, [queueSaveAccountSettings]);
  // ── End per-account settings ──────────────────────────────────────────────

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
        maxDailyTrades: engineMaxDailyTrades,
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
        brainLearningMode: engineBrainLearningMode,
        drawdownShieldThreshold: engineDrawdownShield ? engineShieldThreshold : 0,
        adaptiveScanInterval: engineAdaptiveScan,
        dailyLossLimit: engineDailyLossLimit,
        dailyProfitTarget: engineDailyProfitTarget,
        lockSettings: engineLockSettings,
        singleStrategyMode: engineSingleStrategyMode,
        allowMultipleTrades: engineAllowMultipleTrades,
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
        executionBroker: engineExecutionSource,
        enableORBAutonomous: engineORBAutonomous,
        enableCompositeAutonomous: engineCompositeAutonomous,
        compositeMinEdgeScore: engineCompositeMinEdge,
        copyMode: engineCopyMode,
        volatileCapMode: engineVolatileCapMode,
        pairLotOverrides: Object.fromEntries(
          Object.entries(pairLotOverrides)
            .map(([k, v]) => [k, parseFloat(v)])
            .filter(([, v]) => (v as number) > 0)
        ),
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

  // Prop firm presets — known firm rules built-in
  const PROP_FIRM_PRESETS: Record<string, { daily: number; total: number; target: number; minDays: number; riskPct: number; overnight: boolean; consistency: boolean }> = {
    FTMO:         { daily: 5,   total: 10, target: 10, minDays: 4, riskPct: 1,   overnight: false, consistency: true  },
    MFF:          { daily: 5,   total: 10, target: 8,  minDays: 3, riskPct: 0.5, overnight: false, consistency: true  },
    THE5ERS:      { daily: 4,   total: 8,  target: 6,  minDays: 0, riskPct: 0.5, overnight: true,  consistency: false },
    FUNDED_NEXT:  { daily: 5,   total: 10, target: 10, minDays: 5, riskPct: 1,   overnight: false, consistency: true  },
    CUSTOM:       { daily: enginePropFirmDrawdown, total: propFirmTotalDrawdown, target: propFirmProfitTarget, minDays: propFirmMinTradingDays, riskPct: engineRiskPerTrade, overnight: propFirmAllowOvernight, consistency: propFirmConsistencyRule },
  };

  const applyPropFirmPreset = (preset: keyof typeof PROP_FIRM_PRESETS) => {
    const p = PROP_FIRM_PRESETS[preset];
    if (!p) return;
    setPropFirmPreset(preset as any);
    setEnginePropFirmDrawdown(p.daily);
    setPropFirmTotalDrawdown(p.total);
    setPropFirmProfitTarget(p.target);
    setPropFirmMinTradingDays(p.minDays);
    setEngineRiskPerTrade(p.riskPct);
    setPropFirmAllowOvernight(p.overnight);
    setPropFirmConsistencyRule(p.consistency);
    if (preset !== 'CUSTOM') setEngineMode('sniper');
    // Save to server immediately so the enforcement layer picks it up
    apiRequest('POST', '/api/prop-firm-context', {
      enabled: true,
      firmPreset: preset,
      maxDailyDrawdownPct: p.daily,
      maxTotalDrawdownPct: p.total,
      profitTargetPct: p.target,
      minTradingDays: p.minDays,
      riskPerTradePct: p.riskPct,
      allowOvernightHolds: p.overnight,
      consistencyRule: p.consistency,
      currentDailyPnlPct: 0,
      currentTotalPnlPct: 0,
    }).catch(() => {});
  };

  const savePropFirmContextMutation = useMutation({
    mutationFn: async (ctx: any) => {
      const res = await apiRequest('POST', '/api/prop-firm-context', ctx);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: '🛡️ Prop Firm Rules Saved', description: 'Risk guard is now active on all TradeLocker accounts' });
    },
  });

  const { data: propFirmContext } = useQuery<any>({
    queryKey: ['/api/prop-firm-context'],
    refetchInterval: 30000,
  });

  // Weekly guidance — brain-powered goal acceleration
  const { data: weeklyGuidance } = useQuery<any>({
    queryKey: ['/api/vedd-brain/weekly-guidance'],
    refetchInterval: 60000,
    staleTime: 0,
    enabled: !!user,
  });

  // Decision feed — live 8s
  const { data: decisionFeed } = useQuery<any>({
    queryKey: ['/api/mt5/decision-feed'],
    refetchInterval: 8000,
    staleTime: 0,
    enabled: !!user,
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

  const runBacktestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/vedd-live-engine/backtest', {
        pair: backtestPair,
        strategyMode: engineMode,
        periodDays: backtestPeriod,
        accountBalance: engineAccountBalance,
        riskPerTrade: engineRiskPerTrade,
        tpPct: backtestTP,
        slPct: backtestSL,
        minConfidence: engineMinConf,
      });
      return res.json();
    },
    onSuccess: (data) => {
      setBacktestResult(data);
      if (data.error) toast({ title: 'Backtest failed', description: data.error, variant: 'destructive' });
      else toast({ title: '✅ Backtest complete', description: `${data.stats?.totalTrades} trades · ${data.stats?.winRate?.toFixed(1)}% win rate · ${data.stats?.totalPnlPct >= 0 ? '+' : ''}${data.stats?.totalPnlPct?.toFixed(2)}%` });
    },
    onError: (err: any) => {
      const msg = err?.message || '';
      const isNoData = msg.toLowerCase().includes('insufficient') || msg.toLowerCase().includes('data');
      toast({
        title: 'Backtest failed',
        description: isNoData
          ? 'No historical data available. Connect your MT5 EA and load chart data for this pair first, then retry.'
          : (msg || 'Server error — check your connection'),
        variant: 'destructive',
      });
    },
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
    setPairLotOverrides(prev => { const n = { ...prev }; delete n[pair]; return n; });
  };

  const savePairLotOverride = (pair: string, val: string) => {
    const num = parseFloat(val);
    const clean = !val || isNaN(num) || num <= 0 ? 0 : Math.round(num * 100) / 100;
    setPairLotOverrides(prev => ({ ...prev, [pair]: clean > 0 ? String(clean) : '' }));
    const overrides: Record<string, number> = {};
    enginePairs.forEach(p => {
      const v = p === pair ? clean : parseFloat(pairLotOverrides[p] || '0');
      if (v > 0) overrides[p] = v;
    });
    apiRequest('PATCH', '/api/vedd-live-engine/config', { pairLotOverrides: overrides }).catch(() => {});
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
      phase === 'target_reached' ? '🔒 LOCK IN PROFITS — preservation mode only, A+ setups 90%+ confidence, minimum lots' :
      phase === 'pushing'        ? '🛡️ REDUCE RISK — you\'re 80%+ done, protect the gains. Smaller lots, only sniper/ICT setups, no scalping' :
      phase === 'accelerating'   ? '⚡ SCALE UP — 25%+ done, maintain quality standards, 3-5 trades max per session' :
      phase === 'building'       ? '📈 BUILD STEADY — standard risk, stack consistent wins, don\'t force trades' :
      '🌡️ WARM UP — conservative approach, 82%+ confidence only, learn the market conditions this week';

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

        {/* ─── Progress Meters (always visible at top) ── */}
        {strategy?.hasStrategy && (
          <div className="rounded-xl bg-gradient-to-r from-gray-900/80 to-gray-900/60 border border-gray-800 px-4 py-4 space-y-4">

            {/* TODAY'S DAILY METER — PRIMARY */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="text-white font-semibold text-sm">Today's Profit</span>
                  <span className="text-[10px] text-gray-500 font-mono">
                    {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-400">
                    ${todayClosedProfit.toFixed(2)}
                    {todayTotalProfit > todayClosedProfit && (
                      <span className="text-yellow-400/70"> (+${(todayTotalProfit - todayClosedProfit).toFixed(2)} open)</span>
                    )}
                    {' '}/ ${dailyTarget > 0 ? dailyTarget.toFixed(2) : ((strategy.profitTarget || 0) / 5).toFixed(2)}
                  </span>
                  <span className={`font-bold text-sm ${
                    dailyProgressClosed >= 100 ? 'text-emerald-400' :
                    dailyProgressClosed >= 60 ? 'text-cyan-400' :
                    dailyProgressClosed >= 30 ? 'text-yellow-400' : 'text-red-400'
                  }`}>{dailyProgressClosed}%</span>
                </div>
              </div>
              {/* Progress track with two overlaid bars */}
              <div className="relative h-3.5 bg-gray-800 rounded-full overflow-hidden">
                {/* Unrealized (open) progress — background layer */}
                {dailyProgressTotal > dailyProgressClosed && (
                  <div
                    className="absolute top-0 left-0 h-full rounded-full opacity-40 transition-all duration-700"
                    style={{
                      width: `${Math.min(100, dailyProgressTotal)}%`,
                      background: 'linear-gradient(90deg,#f59e0b,#fbbf24)',
                    }}
                  />
                )}
                {/* Closed (realized) progress — foreground layer */}
                <div
                  className="absolute top-0 left-0 h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, dailyProgressClosed)}%`,
                    background: dailyProgressClosed >= 100
                      ? 'linear-gradient(90deg,#10b981,#34d399)'
                      : dailyProgressClosed >= 60
                      ? 'linear-gradient(90deg,#06b6d4,#22d3ee)'
                      : dailyProgressClosed >= 30
                      ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                      : 'linear-gradient(90deg,#dc2626,#ef4444)',
                  }}
                />
              </div>
              <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
                <span>{todayTrades} trade{todayTrades !== 1 ? 's' : ''} today</span>
                <span>{todayWinRate}% win rate</span>
                {todayTotalProfit > todayClosedProfit && (
                  <span className="text-yellow-400/60">● {(dailyProgressTotal - dailyProgressClosed)}% unrealized</span>
                )}
                {dailyProgressClosed >= 100 && (
                  <span className="text-emerald-400 font-semibold">✓ Daily target hit!</span>
                )}
              </div>
            </div>

            {/* WEEKLY METER — SECONDARY */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-3.5 h-3.5 text-orange-400" />
                  <span className="text-gray-300 font-medium text-xs">Weekly Goal</span>
                  {plan?.feasibility && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                      plan.feasibility === 'ACHIEVABLE' ? 'bg-emerald-500/20 text-emerald-400' :
                      plan.feasibility === 'AGGRESSIVE' ? 'bg-orange-500/20 text-orange-400' :
                      'bg-red-500/20 text-red-400'
                    }`}>{plan.feasibility}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-gray-500">${(strategy.currentProfit || 0).toFixed(2)} / ${strategy.profitTarget}</span>
                  <span className="text-orange-400 font-semibold text-xs">{strategy.progressPercentage || 0}%</span>
                </div>
              </div>
              <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, strategy.progressPercentage || 0)}%`,
                    background: (strategy.progressPercentage || 0) >= 100
                      ? 'linear-gradient(90deg,#10b981,#34d399)'
                      : (strategy.progressPercentage || 0) >= 60
                      ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                      : 'linear-gradient(90deg,#dc2626,#ef4444)',
                  }}
                />
              </div>
              <div className="flex items-center gap-4 mt-1 text-[11px] text-gray-500">
                <span>{strategy.progressTrades ?? 0} trades this week</span>
                <span>{strategy.progressWinRate ?? 0}% win rate</span>
                {liveMode?.live && <span className="text-emerald-400 animate-pulse">● EA LIVE</span>}
              </div>
            </div>

          </div>
        )}

        {/* ─── High-Impact Economic Events Strip ────────────── */}
        {highImpactEvents.length > 0 && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-950/10 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">⚡ High-Impact Events</span>
              <span className="text-[9px] text-gray-500">— Avoid entering 15 min before/after</span>
              {strategyPairs.length > 0 && (
                <div className="flex gap-1 ml-auto">
                  {strategyPairs.slice(0, 3).map(p => (
                    <span key={p} className="text-[9px] bg-rose-500/10 border border-rose-500/20 text-rose-300 px-1.5 py-0.5 rounded-full font-mono">{p}</span>
                  ))}
                </div>
              )}
            </div>
            {highImpactEvents.map((ev: any, i: number) => {
              const isToday = ev.date === new Date().toISOString().split('T')[0];
              return (
                <div key={i} className="flex items-center gap-2 text-[10px]">
                  {isToday && <span className="bg-rose-500 text-white text-[8px] font-black px-1 py-0.5 rounded uppercase">TODAY</span>}
                  <span className="text-gray-400 font-mono">{ev.time}</span>
                  <span className="text-white font-medium flex-1 truncate">{ev.title}</span>
                  {ev.currency && <span className="text-rose-300 font-mono">{ev.currency}</span>}
                  {ev.forecast && <span className="text-gray-500">F: {ev.forecast}</span>}
                  {ev.previous && <span className="text-gray-600">P: {ev.previous}</span>}
                </div>
              );
            })}
          </div>
        )}

        {/* ─── Tab Navigation ──────────────────────────────── */}
        <div className="flex gap-1 p-1 bg-gray-900/60 border border-gray-800 rounded-xl mb-6 overflow-x-auto">
          {([
            { id: 'plan',    label: '1. Weekly Plan',    emoji: '📅' },
            { id: 'config',  label: '2. AI Config',      emoji: '⚙️' },
            { id: 'brain',   label: '3. Brain',          emoji: '🧠' },
            { id: 'engine',  label: '4. Live Engine',    emoji: '⚡' },
            { id: 'monitor', label: '5. Monitor',        emoji: '📊' },
            { id: 'pacing',  label: '6. Goal Pacing',    emoji: '🎯' },
            { id: 'paper',   label: '7. Paper Trading',  emoji: '📝' },
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

        {/* ─── Setup Checklist ─────────────────────────────── */}
        <SetupChecklist
          growthPlan={growthPlan}
          profitTarget={profitTarget}
          selectedPairs={selectedPairs}
          liveEngineStatus={liveEngineStatus}
          strategy={strategy}
          liveMode={liveMode}
        />

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
              {liveEngineStatus?.dailyLossHalted && !liveEngineStatus?.dailyProfitHalted && (
                <div className="mt-3 mx-0 flex items-center gap-3 rounded-xl border-2 border-red-500/70 bg-red-950/40 px-4 py-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <div>
                    <p className="text-red-400 font-bold text-sm">Daily Loss Limit Hit — Engine Halted</p>
                    <p className="text-red-400/70 text-xs">CLOSE ALL signal sent to MT5 EA at {liveEngineStatus.dailyLossHaltedAt ? new Date(liveEngineStatus.dailyLossHaltedAt).toLocaleTimeString() : 'N/A'}. Restart engine tomorrow.</p>
                  </div>
                </div>
              )}

              {/* Daily profit target hit banner */}
              {liveEngineStatus?.dailyProfitHalted && (
                <div className="mt-3 mx-0 flex items-center gap-3 rounded-xl border-2 border-emerald-500/70 bg-emerald-950/40 px-4 py-3">
                  <span className="text-2xl flex-shrink-0">🏆</span>
                  <div>
                    <p className="text-emerald-400 font-bold text-sm">Daily Profit Target Hit — Engine Locked</p>
                    <p className="text-emerald-400/70 text-xs">Gains protected at {liveEngineStatus.dailyProfitHaltedAt ? new Date(liveEngineStatus.dailyProfitHaltedAt).toLocaleTimeString() : 'N/A'}. CLOSE ALL sent to MT5. No new trades until tomorrow. Well done.</p>
                  </div>
                </div>
              )}

              {/* Connected TradeLocker accounts row — shows when engine is running */}
              {isRunning && activeTLEngineConns.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-700/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Active TradeLocker Accounts</span>
                    <span className="text-[10px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded-full font-bold">{activeTLEngineConns.length}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {activeTLEngineConns.map((c: any) => (
                      <div key={c.id} className="flex items-center gap-1.5 bg-gray-800/60 border border-cyan-700/25 rounded-lg px-2.5 py-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${c.isActive ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                        <span className="text-xs text-white font-medium">{c.email}</span>
                        <span className={`text-[9px] px-1 py-0.5 rounded font-bold ${c.accountType === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {c.accountType?.toUpperCase()}
                        </span>
                        {c.lotMultiplier && c.lotMultiplier !== 1 && (
                          <span className={`text-[9px] font-mono font-bold ${c.lotMultiplier > 1 ? 'text-amber-400' : 'text-blue-400'}`}>×{c.lotMultiplier}</span>
                        )}
                      </div>
                    ))}
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
                    <div className="col-span-2 md:col-span-4">
                      <ConnectedAccountPicker
                        label="Trading Account"
                        onSelect={handleEngineAccountSelected}
                        className="w-full"
                      />
                      {selectedEngineAccount && (
                        <p className="text-[10px] text-gray-600 mt-1">
                          {selectedEngineAccount.type === 'mt5'
                            ? `MT5 – signals sent to EA for execution. Balance auto-synced from ${selectedEngineAccount.broker}.`
                            : `TradeLocker – trades execute directly via API. Live balance fetched on connect.`}
                          {selectedEngineAccount.key && <span className="ml-1 text-cyan-700">Settings auto-saved per account.</span>}
                        </p>
                      )}
                    </div>
                  <div>
                      <Label className="text-gray-400 text-xs">Primary / Reference Balance ($)</Label>
                      <Input type="number" value={engineAccountBalance} onChange={e => setEngineAccountBalance(Number(e.target.value))}
                        min={10} step={10} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm"
                        placeholder="e.g. 100000 for $100k" />
                      <p className="text-[10px] text-gray-500 mt-0.5">Used for proportional lot sizing — each TL account scales lots relative to this balance</p>
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
                      <Label className="text-gray-400 text-xs">Max Daily Trades <span className="text-gray-600">(0 = unlimited)</span></Label>
                      <Input type="number" value={engineMaxDailyTrades}
                        onChange={async e => {
                          const v = Math.max(0, Number(e.target.value));
                          setEngineMaxDailyTrades(v);
                          try { await apiRequest('PATCH', '/api/vedd-live-engine/config', { maxDailyTrades: v }); } catch { /* engine may not be running yet — applied on start */ }
                        }}
                        min={0} max={100} className="mt-1 bg-gray-800 border-gray-700 text-white h-8 text-sm" />
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
                    <div>
                      <Label className="text-emerald-400 text-xs font-semibold flex items-center gap-1">
                        <span>🏆</span> Daily Profit Target (%)
                      </Label>
                      <Input type="number" value={engineDailyProfitTarget} onChange={e => setEngineDailyProfitTarget(Number(e.target.value))}
                        min={0} max={200} step={1} className="mt-1 bg-gray-800 border-emerald-900/50 text-white h-8 text-sm" />
                      <p className="text-[10px] text-emerald-400/70 mt-0.5">Stop trading + close all when gain % hit (0 = off)</p>
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
                  {/* ── ORB Autonomous toggle ────────────────────────────────────── */}
                  <div className="rounded-lg border border-green-500/20 bg-green-500/5 p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[11px] font-semibold text-green-300">📈 ORB Auto-Trade</span>
                          <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/30 rounded px-1.5 py-0.5">9:30 AM Breakout</span>
                        </div>
                        <p className="text-[9px] text-gray-500 mt-0.5">
                          Detects opening range breakout + retest during 9:30 AM–2:00 PM EST. Fires one trade per pair per day when SS AI Bot scores ≥ 70.
                        </p>
                      </div>
                      <button
                        onClick={() => setEngineORBAutonomous(v => !v)}
                        className={`ml-3 w-10 h-5 rounded-full relative transition-colors shrink-0 ${engineORBAutonomous ? 'bg-green-500' : 'bg-gray-700'}`}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${engineORBAutonomous ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Composite Auto-Trade moved to its own section below Composite Edge card */}

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-gray-400 text-xs">Trading Pairs</Label>
                      <span className="text-[9px] text-gray-600">Lot = hard block per pair (blank = engine default)</span>
                    </div>
                    <div className="mt-1 space-y-1">
                      {enginePairs.map(p => (
                        <div key={p} className="flex items-center gap-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(6,182,212,0.06)', border: '1px solid rgba(6,182,212,0.15)' }}>
                          <span className="text-cyan-300 text-[10px] font-mono font-bold w-16 flex-shrink-0">{p}</span>
                          <div className="flex items-center gap-1 flex-1">
                            <span className="text-[9px] text-gray-500 flex-shrink-0">Max lot:</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0.01"
                              value={pairLotOverrides[p] ?? ''}
                              onChange={e => setPairLotOverrides(prev => ({ ...prev, [p]: e.target.value }))}
                              onBlur={e => savePairLotOverride(p, e.target.value)}
                              onKeyDown={e => e.key === 'Enter' && savePairLotOverride(p, (e.target as HTMLInputElement).value)}
                              placeholder="auto"
                              className="h-5 w-16 bg-gray-900 border-gray-700 text-white text-[10px] px-1.5"
                            />
                            {pairLotOverrides[p] && parseFloat(pairLotOverrides[p]) > 0 && (
                              <span className="text-[8px] text-amber-400 font-bold flex-shrink-0">🔒 LOCKED</span>
                            )}
                          </div>
                          <button onClick={() => removeEnginePair(p)} className="text-gray-600 hover:text-red-400 text-xs flex-shrink-0 px-1">×</button>
                        </div>
                      ))}
                      <div className="flex gap-1 items-center pt-0.5">
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
                  {/* ── Prop Firm Challenge Mode — full panel ── */}
                  <div className={`rounded-xl border transition-all ${enginePropFirmMode ? 'border-amber-500/60 bg-amber-500/8' : 'border-gray-700 bg-gray-900/30'}`}>
                    <div className="p-3">
                      <div className="flex items-center justify-between mb-2">
                        <label className="flex items-center gap-2 cursor-pointer" onClick={() => {
                          const next = !enginePropFirmMode;
                          setEnginePropFirmMode(next);
                          if (next) { setEngineMode('sniper'); if (propFirmPreset !== 'CUSTOM') applyPropFirmPreset(propFirmPreset); }
                          apiRequest('POST', '/api/prop-firm-mode', { enabled: next }).catch(() => {});
                        }}>
                          <input type="checkbox" checked={enginePropFirmMode} onChange={() => {}} className="accent-amber-500" />
                          <div>
                            <span className="text-xs font-semibold text-amber-300">🛡️ Prop Firm Mode</span>
                            {enginePropFirmMode && (
                              <Badge className="ml-2 bg-amber-500/30 text-amber-300 border-amber-500/50 text-[9px] animate-pulse">CHALLENGE RULES ACTIVE</Badge>
                            )}
                          </div>
                        </label>
                        {propFirmContext?.currentDailyPnlPct !== undefined && enginePropFirmMode && (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-gray-400">Today:</span>
                            <span className={`text-[11px] font-bold ${(propFirmContext.currentDailyPnlPct ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                              {((propFirmContext.currentDailyPnlPct ?? 0) >= 0 ? '+' : '')}{(propFirmContext.currentDailyPnlPct ?? 0).toFixed(2)}%
                            </span>
                            <span className="text-gray-600 text-[10px]">/ -{enginePropFirmDrawdown}% limit</span>
                          </div>
                        )}
                      </div>

                      {enginePropFirmMode && (
                        <>
                          {/* Firm preset selector */}
                          <div className="mb-3">
                            <p className="text-[10px] text-gray-400 mb-1.5 uppercase tracking-wide">Select your firm</p>
                            <div className="grid grid-cols-5 gap-1">
                              {(['FTMO','MFF','THE5ERS','FUNDED_NEXT','CUSTOM'] as const).map(f => (
                                <button
                                  key={f}
                                  onClick={() => applyPropFirmPreset(f)}
                                  className={`text-[9px] font-bold py-1.5 rounded-lg border transition-all ${
                                    propFirmPreset === f
                                      ? 'bg-amber-500/30 border-amber-500/70 text-amber-300'
                                      : 'bg-gray-800/60 border-gray-700 text-gray-400 hover:border-gray-500'
                                  }`}
                                >
                                  {f === 'FUNDED_NEXT' ? 'FN' : f === 'THE5ERS' ? '5ERS' : f}
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Rules grid */}
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Daily DD limit</p>
                              <div className="flex items-center gap-1">
                                <Input type="number" value={enginePropFirmDrawdown}
                                  onChange={e => { setEnginePropFirmDrawdown(Number(e.target.value)); setPropFirmPreset('CUSTOM'); }}
                                  min={1} max={10} step={0.5}
                                  className="h-7 bg-gray-800 border-amber-700/40 text-amber-300 text-xs px-2" />
                                <span className="text-gray-400 text-[10px]">%</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Total DD limit</p>
                              <div className="flex items-center gap-1">
                                <Input type="number" value={propFirmTotalDrawdown}
                                  onChange={e => { setPropFirmTotalDrawdown(Number(e.target.value)); setPropFirmPreset('CUSTOM'); }}
                                  min={1} max={20} step={0.5}
                                  className="h-7 bg-gray-800 border-amber-700/40 text-amber-300 text-xs px-2" />
                                <span className="text-gray-400 text-[10px]">%</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Profit target</p>
                              <div className="flex items-center gap-1">
                                <Input type="number" value={propFirmProfitTarget}
                                  onChange={e => { setPropFirmProfitTarget(Number(e.target.value)); setPropFirmPreset('CUSTOM'); }}
                                  min={1} max={20} step={0.5}
                                  className="h-7 bg-gray-800 border-amber-700/40 text-amber-300 text-xs px-2" />
                                <span className="text-gray-400 text-[10px]">%</span>
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-gray-500 mb-0.5">Risk / trade</p>
                              <div className="flex items-center gap-1">
                                <Input type="number" value={engineRiskPerTrade}
                                  onChange={e => { setEngineRiskPerTrade(Number(e.target.value)); setPropFirmPreset('CUSTOM'); }}
                                  min={0.1} max={3} step={0.1}
                                  className="h-7 bg-gray-800 border-amber-700/40 text-amber-300 text-xs px-2" />
                                <span className="text-gray-400 text-[10px]">%</span>
                              </div>
                            </div>
                          </div>

                          {/* Toggle rules */}
                          <div className="flex flex-wrap gap-2 mb-3">
                            <button onClick={() => { setPropFirmConsistencyRule(v => !v); setPropFirmPreset('CUSTOM'); }}
                              className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border transition-all ${propFirmConsistencyRule ? 'bg-blue-500/20 border-blue-500/50 text-blue-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
                              <span>{propFirmConsistencyRule ? '✓' : '○'}</span> Consistency rule
                            </button>
                            <button onClick={() => { setPropFirmAllowOvernight(v => !v); setPropFirmPreset('CUSTOM'); }}
                              className={`flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-md border transition-all ${propFirmAllowOvernight ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
                              <span>{propFirmAllowOvernight ? '✓' : '○'}</span> Overnight holds
                            </button>
                          </div>

                          {/* Rule summary */}
                          <div className="bg-amber-950/30 border border-amber-700/20 rounded-lg p-2 text-[10px] text-amber-400/80 space-y-0.5">
                            <p>🛡️ <strong>Active rules:</strong> Daily DD -{enginePropFirmDrawdown}% hard stop · Total DD -{propFirmTotalDrawdown}% · {engineRiskPerTrade}% risk/trade</p>
                            <p>🎯 <strong>Challenge target:</strong> +{propFirmProfitTarget}% · Min {propFirmMinTradingDays} trading days · Sniper mode only · 1:2+ R:R required</p>
                            {!propFirmAllowOvernight && <p>🌙 <strong>No overnight holds</strong> — trades auto-blocked after 21:00 UTC</p>}
                            {propFirmConsistencyRule && <p>📊 <strong>Consistency rule:</strong> No single day &gt;30% of total target profit</p>}
                          </div>

                          <button
                            onClick={() => savePropFirmContextMutation.mutate({
                              enabled: true, firmPreset: propFirmPreset,
                              maxDailyDrawdownPct: enginePropFirmDrawdown,
                              maxTotalDrawdownPct: propFirmTotalDrawdown,
                              profitTargetPct: propFirmProfitTarget,
                              minTradingDays: propFirmMinTradingDays,
                              riskPerTradePct: engineRiskPerTrade,
                              allowOvernightHolds: propFirmAllowOvernight,
                              consistencyRule: propFirmConsistencyRule,
                              currentDailyPnlPct: propFirmContext?.currentDailyPnlPct ?? 0,
                              currentTotalPnlPct: propFirmContext?.currentTotalPnlPct ?? 0,
                            })}
                            disabled={savePropFirmContextMutation.isPending}
                            className="mt-2 w-full text-[11px] font-semibold py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 rounded-lg transition-all"
                          >
                            {savePropFirmContextMutation.isPending ? 'Saving…' : '💾 Save Prop Firm Rules to Server'}
                          </button>
                        </>
                      )}

                      {!enginePropFirmMode && (
                        <p className="text-[10px] text-gray-500 mt-1">Enable to load prop firm rules — daily DD limit, risk cap, overnight block, consistency enforcement. Pre-built for FTMO, MFF, The5ers, and Funded Next.</p>
                      )}
                    </div>
                  </div>

                  {/* Volatile Pair Cap Mode */}
                  <div className={`rounded-xl border p-3 transition-all ${engineVolatileCapMode === 'risk_scaled' ? 'border-emerald-500/60 bg-emerald-500/8' : 'border-orange-500/60 bg-orange-500/10'}`}>
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => {
                      const next = engineVolatileCapMode === 'risk_scaled' ? 'user_only' : 'risk_scaled';
                      setEngineVolatileCapMode(next);
                    }}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={engineVolatileCapMode === 'risk_scaled'} onChange={() => {}} className="accent-emerald-500" />
                        <div>
                          <p className="text-sm font-semibold text-white">Volatile Pair Risk Cap</p>
                          <p className="text-xs text-gray-400">
                            {engineVolatileCapMode === 'risk_scaled'
                              ? 'Engine caps Gold/BTC/Index lots to 1.5% account risk'
                              : 'Your lot size settings used as-is — no engine override'}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${engineVolatileCapMode === 'risk_scaled' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-orange-500/20 text-orange-300'}`}>
                        {engineVolatileCapMode === 'risk_scaled' ? 'PROTECTED' : 'USER ONLY'}
                      </span>
                    </div>
                    {engineVolatileCapMode === 'risk_scaled' && (
                      <div className="mt-2 text-[11px] text-emerald-300/70 leading-relaxed border-t border-emerald-500/20 pt-2">
                        Max lot = (Balance × 1.5%) ÷ (SL floor × pip value). Scales with your account size automatically.
                      </div>
                    )}
                    {engineVolatileCapMode === 'user_only' && (
                      <div className="mt-2 text-[11px] text-orange-300/70 leading-relaxed border-t border-orange-500/20 pt-2">
                        ⚠️ Engine will NOT override your lot size on Gold, BTC, or indices. You are fully responsible for position sizing.
                      </div>
                    )}
                  </div>

                  {/* ── Copy Mode: Proportional vs Multiplier ── */}
                  <div className={`rounded-xl border p-3 transition-all ${engineCopyMode === 'proportional' ? 'border-blue-500/60 bg-blue-500/8' : 'border-gray-700 bg-gray-900/30'}`}>
                    <div className="flex items-center justify-between cursor-pointer" onClick={() => {
                      const next = engineCopyMode === 'proportional' ? 'multiplier' : 'proportional';
                      setEngineCopyMode(next);
                    }}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={engineCopyMode === 'proportional'} onChange={() => {}} className="accent-blue-500" />
                        <div>
                          <p className="text-sm font-semibold text-white">Proportional Copy Sizing</p>
                          <p className="text-xs text-gray-400">
                            {engineCopyMode === 'proportional'
                              ? 'Each TL account trades lots proportional to its own balance'
                              : 'Each TL account uses its fixed lot multiplier setting'}
                          </p>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${engineCopyMode === 'proportional' ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400'}`}>
                        {engineCopyMode === 'proportional' ? 'PROPORTIONAL' : 'MULTIPLIER'}
                      </span>
                    </div>
                    {engineCopyMode === 'proportional' && (
                      <div className="mt-2 text-[11px] text-blue-300/70 leading-relaxed border-t border-blue-500/20 pt-2">
                        Formula: acctLot = (TL account balance ÷ reference balance) × base lot. A $50k account copying a $10k engine signal gets 5× the lots automatically.
                      </div>
                    )}
                    {engineCopyMode === 'multiplier' && (
                      <div className="mt-2 text-[11px] text-gray-400 leading-relaxed border-t border-gray-700/40 pt-2">
                        Uses the manual lot multiplier set per TradeLocker account (e.g. ×2.0). Set these in the TradeLocker Connections page.
                      </div>
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

                  {/* ── Brain Learning Mode Toggle ── */}
                  <div className={`rounded-xl border p-3 transition-all ${engineBrainLearningMode ? 'border-blue-500/60 bg-blue-500/10' : 'border-gray-700 bg-gray-900/30'}`}>
                    <label className="flex items-center gap-2 cursor-pointer" onClick={() => setEngineBrainLearningMode(p => !p)}>
                      <input type="checkbox" checked={engineBrainLearningMode} onChange={() => {}} className="accent-blue-500" />
                      <div>
                        <span className="text-xs font-semibold text-blue-300">🧠 Brain Learning Mode</span>
                        {engineBrainLearningMode && <Badge className="ml-2 bg-blue-500/30 text-blue-200 border-blue-500/50 text-[9px]">LOCKED AT 0.01</Badge>}
                        {!engineBrainLearningMode && <Badge className="ml-2 bg-gray-600/30 text-gray-300 border-gray-500/50 text-[9px]">FULL SIZING</Badge>}
                      </div>
                    </label>
                    <p className="text-[10px] text-blue-400/80 mt-1.5">
                      {engineBrainLearningMode
                        ? '🔒 Lot size locked at 0.01 while AI learns. Auto-unlocks to full risk sizing once brain hits 10+ trades & 65%+ win rate.'
                        : '⚡ Full risk-based lot sizing active immediately. Disable only if brain is already trained.'}
                    </p>
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
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base flex items-center gap-2 text-white">
                          <BarChart3 className="w-4 h-4 text-purple-400" /> Strategy Performance
                        </CardTitle>
                        <button onClick={toggleStrategyPerf} className="text-gray-500 hover:text-white transition-colors">
                          <ChevronDown className={`h-4 w-4 transition-transform ${showStrategyPerf ? '' : '-rotate-90'}`} />
                        </button>
                      </div>
                    </CardHeader>
                    {showStrategyPerf && <CardContent className="space-y-1.5">
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
                    </CardContent>}
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
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base flex items-center gap-2 text-white">
                        <Swords className="w-4 h-4 text-orange-400" /> Daily Battle Plan
                        <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/30 text-[10px]">AI Generated</Badge>
                        <span className="text-xs text-gray-500 font-normal ml-2">{battlePlan.session} Session</span>
                      </CardTitle>
                      <button onClick={toggleDailyBattle} className="text-gray-500 hover:text-white transition-colors">
                        <ChevronDown className={`h-4 w-4 transition-transform ${showDailyBattle ? '' : '-rotate-90'}`} />
                      </button>
                    </div>
                  </CardHeader>
                  {showDailyBattle && <CardContent>
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
                  </CardContent>}
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
        {strategy?.hasStrategy && (
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
                        const isApproved = latest?.aiDecision === 'APPROVED' || latest?.aiDecision === 'AI_OVERRIDE' || latest?.aiDecision === 'ADJUSTED';
                        const isRejected = latest?.aiDecision === 'REJECTED';
                        return (
                          <div className={`rounded-xl p-3 border ${isApproved ? 'border-emerald-500/30 bg-emerald-900/20' : isRejected ? 'border-red-500/30 bg-red-900/20' : 'border-gray-700/50 bg-gray-800/40'}`}>
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-white font-bold text-sm">{latest.symbol}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${latest.proposedSignal === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'}`}>{latest.proposedSignal}</span>
                                <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${isApproved ? 'bg-emerald-500/20 text-emerald-300' : isRejected ? 'bg-red-500/20 text-red-300' : 'bg-gray-700 text-gray-400'}`}>{latest.aiDecision}</span>
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
                              const approved = log.aiDecision === 'APPROVED' || log.aiDecision === 'AI_OVERRIDE' || log.aiDecision === 'ADJUSTED';
                              const rejected = log.aiDecision === 'REJECTED';
                              return (
                                <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-1.5 text-xs">
                                  <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${approved ? 'bg-emerald-400' : rejected ? 'bg-red-400' : 'bg-gray-500'}`} />
                                    <span className="text-white font-medium">{log.symbol}</span>
                                    <span className={log.proposedSignal === 'BUY' ? 'text-emerald-400' : 'text-red-400'}>{log.proposedSignal}</span>
                                    <span className="text-gray-500">{log.aiDecision}</span>
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
            ACTIVE STRATEGY STATUS PANEL
        ═══════════════════════════════════════════════════════ */}
        {strategy?.hasStrategy && plan && (() => {
          // Derive today's active pairs from the plan
          const todayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });
          const todayPlanPairs = plan.weeklyPlan?.[todayName]?.pairs || [];
          const activePairs = todayPlanPairs.length > 0 ? todayPlanPairs : (plan.weeklyPlan?.Monday?.pairs || []);
          const displayDay = todayPlanPairs.length > 0 ? todayName : 'Monday';
          const planMaxTrades = (plan as any).maxTradesPerDay ?? null;
          const pairMaxTrades = activePairs.length > 0 ? (activePairs[0]?.maxTrades ?? planMaxTrades) : planMaxTrades;
          const effectiveMaxTrades = pairMaxTrades ?? 1;
          const riskPct = riskLevel === 'conservative' ? '0.5–1%' : riskLevel === 'moderate' ? '1–2%' : '2–3%';
          const liveModeOn = liveMode?.live ?? false;

          return (
            <Card className="bg-gray-900/60 border-gray-700/60">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${liveModeOn ? 'bg-emerald-400 animate-pulse' : 'bg-gray-500'}`} />
                    <span className="text-white font-semibold text-sm">Active Strategy Status</span>
                    <Badge className={`text-[10px] ${liveModeOn ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-gray-700/50 text-gray-400 border-gray-600/30'}`}>
                      {liveModeOn ? 'VEDD LIVE' : 'STANDBY'}
                    </Badge>
                  </div>
                  <span className="text-gray-500 text-xs">{displayDay}</span>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  {/* Max trades per day */}
                  <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                    <div className="text-xl font-black text-white">{effectiveMaxTrades}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Max trades/day</div>
                    <div className="text-[9px] text-cyan-400 mt-0.5">per pair</div>
                  </div>
                  {/* Risk per trade — live from engine setting */}
                  <div className={`rounded-lg p-3 text-center ${enginePropFirmMode ? 'bg-amber-950/40 border border-amber-700/30' : 'bg-gray-800/60'}`}>
                    <div className={`text-xl font-black ${enginePropFirmMode ? 'text-amber-400' : 'text-emerald-400'}`}>{engineRiskPerTrade}%</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Risk / trade</div>
                    <div className="text-[9px] mt-0.5">
                      {enginePropFirmMode
                        ? <span className="text-amber-400">🛡️ {propFirmPreset} rules</span>
                        : <span className="text-gray-500">{riskPct} tier</span>}
                    </div>
                  </div>
                  {/* Active pairs count */}
                  <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                    <div className="text-xl font-black text-purple-400">{activePairs.length}</div>
                    <div className="text-[10px] text-gray-400 mt-0.5">Pairs today</div>
                    <div className="text-[9px] text-gray-500 mt-0.5">from plan</div>
                  </div>
                </div>

                {/* Per-pair breakdown */}
                {activePairs.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-gray-500 text-[10px] uppercase tracking-wide">Today's Pairs ({displayDay})</p>
                    {activePairs.map((p: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-gray-800/40 rounded-lg px-3 py-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${p.direction === 'BUY' ? 'bg-emerald-400' : p.direction === 'SELL' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                          <span className="text-white font-semibold">{p.symbol}</span>
                          <Badge className={`text-[9px] ${p.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : p.direction === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{p.direction}</Badge>
                          {p.session && <span className="text-gray-500">{p.session}</span>}
                        </div>
                        <div className="flex items-center gap-2 text-gray-400">
                          <span className="text-[10px]">Max {p.maxTrades ?? effectiveMaxTrades} trade{(p.maxTrades ?? effectiveMaxTrades) === 1 ? '' : 's'}</span>
                          {p.lotSize && <span className="text-cyan-400 font-medium">{p.lotSize}L</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!liveModeOn && (
                  <div className="mt-3 flex items-center gap-2 bg-yellow-950/30 border border-yellow-700/30 rounded-lg px-3 py-2">
                    <span className="text-yellow-400 text-xs">⚠️</span>
                    <span className="text-yellow-400/80 text-xs">VEDD Live Mode is OFF — trade caps are still enforced server-side. Enable live mode to boost plan alignment signals.</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()}

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
                    <Button size="sm" variant="outline" onClick={() => updateProgressMutation.mutate(false)} disabled={updateProgressMutation.isPending} className="text-xs h-7">
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
                            {(dayPlan.pairs || []).map((p: any, i: number) => {
                              const sym = (p.symbol || '').toUpperCase().replace('/', '');
                              const stats = pairDailyStats[sym];
                              const isToday = day === new Date().toLocaleDateString('en-US', { weekday: 'long' });
                              const dailyTarget = dayPlan.dailyTarget || 0;
                              const pairTargetShare = dayPlan.pairs?.length > 0 ? dailyTarget / dayPlan.pairs.length : 0;
                              const todayProfit = stats?.profitToday || 0;
                              const todayProgress = pairTargetShare > 0 ? Math.min(100, Math.round((todayProfit / pairTargetShare) * 100)) : 0;
                              const hasOpenTrade = stats?.openLots > 0;
                              return (
                              <div key={i} className={`rounded-lg p-3 text-xs space-y-2 border ${
                                hasOpenTrade ? 'bg-blue-950/40 border-blue-700/40' :
                                isToday && stats?.tradesToday > 0 ? 'bg-gray-800/70 border-gray-700/60' :
                                'bg-gray-800/50 border-gray-700/30'
                              }`}>
                                {/* Row 1: symbol + direction + session + confidence */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-white font-semibold flex items-center gap-1">
                                      {(pairDayAssignments[day] || []).includes(p.symbol) && <span title="Pinned to this day">📌</span>}
                                      {p.symbol}
                                    </span>
                                    <Badge className={`text-[9px] ${p.direction === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : p.direction === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>{p.direction}</Badge>
                                    <Badge variant="outline" className="text-[9px] text-gray-400"><Clock className="w-2 h-2 mr-0.5" />{p.session}</Badge>
                                    {hasOpenTrade && <Badge className="text-[9px] bg-blue-500/20 text-blue-300 border-blue-500/40 animate-pulse">● OPEN {stats.openLots}L</Badge>}
                                  </div>
                                  <div className="flex gap-3 text-[10px]">
                                    <span className="text-purple-400">{p.confidence}%</span>
                                    <span className="text-gray-400">~{p.estimatedPips} pips</span>
                                    <span className="text-orange-400 font-medium">{p.lotSize} lots</span>
                                  </div>
                                </div>

                                {/* Row 2: live trade stats for today */}
                                {isToday && stats && (
                                  <div className="grid grid-cols-4 gap-1.5 pt-1 border-t border-gray-700/50">
                                    <div className="bg-gray-900/60 rounded p-1.5 text-center">
                                      <p className="text-[9px] text-gray-500 mb-0.5">Trades Today</p>
                                      <p className="text-white font-bold text-xs">{stats.tradesToday}</p>
                                    </div>
                                    <div className="bg-gray-900/60 rounded p-1.5 text-center">
                                      <p className="text-[9px] text-gray-500 mb-0.5">W / L</p>
                                      <p className="text-xs font-bold">
                                        <span className="text-emerald-400">{stats.winsToday}</span>
                                        <span className="text-gray-600"> / </span>
                                        <span className="text-red-400">{stats.lossesToday}</span>
                                      </p>
                                    </div>
                                    <div className="bg-gray-900/60 rounded p-1.5 text-center">
                                      <p className="text-[9px] text-gray-500 mb-0.5">Win Rate</p>
                                      <p className={`text-xs font-bold ${stats.winRateToday >= 60 ? 'text-emerald-400' : stats.winRateToday >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                                        {stats.tradesToday > 0 ? `${stats.winRateToday}%` : '—'}
                                      </p>
                                    </div>
                                    <div className="bg-gray-900/60 rounded p-1.5 text-center">
                                      <p className="text-[9px] text-gray-500 mb-0.5">P&L Today</p>
                                      <p className={`text-xs font-bold ${todayProfit > 0 ? 'text-emerald-400' : todayProfit < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                        {todayProfit > 0 ? '+' : ''}${todayProfit.toFixed(2)}
                                      </p>
                                    </div>
                                  </div>
                                )}

                                {/* Row 3: daily target progress bar (today only) */}
                                {isToday && pairTargetShare > 0 && (
                                  <div>
                                    <div className="flex justify-between text-[9px] text-gray-500 mb-0.5">
                                      <span>Daily target: ${pairTargetShare.toFixed(0)}</span>
                                      <span className={todayProgress >= 100 ? 'text-emerald-400 font-bold' : 'text-gray-400'}>{todayProgress}%</span>
                                    </div>
                                    <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                                      <div className="h-full rounded-full transition-all duration-500"
                                        style={{
                                          width: `${Math.max(0, todayProgress)}%`,
                                          background: todayProgress >= 100 ? '#10b981' : todayProgress >= 60 ? '#f59e0b' : '#ef4444'
                                        }} />
                                    </div>
                                  </div>
                                )}

                                {/* Row 4: week totals (collapsed, shown for all days) */}
                                {stats && stats.tradesWeek > 0 && (
                                  <div className="flex items-center gap-3 text-[9px] text-gray-500 pt-0.5">
                                    <span>Week: <span className="text-white">{stats.tradesWeek} trades</span></span>
                                    <span><span className="text-emerald-400">{stats.winsWeek}W</span> / <span className="text-red-400">{stats.lossesWeek}L</span></span>
                                    <span className={stats.profitWeek >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                                      {stats.profitWeek >= 0 ? '+' : ''}${stats.profitWeek.toFixed(2)}
                                    </span>
                                    {hasOpenTrade && <span className={`${stats.openProfit >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>
                                      Open: {stats.openProfit >= 0 ? '+' : ''}${stats.openProfit.toFixed(2)}
                                    </span>}
                                  </div>
                                )}

                                {p.entryCondition && <p className="text-gray-500 pl-2 border-l-2 border-orange-500/30">{p.entryCondition}</p>}
                              </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {/* Risk Management */}
                  {plan.riskManagement && (
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-white text-base flex items-center gap-2">
                            <Shield className="w-4 h-4 text-red-400" /> AI Risk Controls
                          </CardTitle>
                          <button onClick={toggleAiRisk} className="text-gray-500 hover:text-white transition-colors">
                            <ChevronDown className={`h-4 w-4 transition-transform ${showAiRisk ? '' : '-rotate-90'}`} />
                          </button>
                        </div>
                      </CardHeader>
                      {showAiRisk && <CardContent>
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
                      </CardContent>}
                    </Card>
                  )}

                  {/* Pair Rankings */}
                  {plan.pairRankings && (
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-white text-base flex items-center gap-2">
                            <Star className="w-4 h-4 text-amber-400" /> AI Pair Rankings
                          </CardTitle>
                          <button onClick={toggleAiPairs} className="text-gray-500 hover:text-white transition-colors">
                            <ChevronDown className={`h-4 w-4 transition-transform ${showAiPairs ? '' : '-rotate-90'}`} />
                          </button>
                        </div>
                      </CardHeader>
                      {showAiPairs && <CardContent>
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
                      </CardContent>}
                    </Card>
                  )}

                  {/* Compound projection */}
                  {plan.compoundGrowth && (
                    <Card className="bg-gray-800/50 border-gray-700">
                      <CardHeader className="pb-2">
                        <div className="flex items-center justify-between">
                          <CardTitle className="text-white text-base flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-emerald-400" /> Compound Growth Projection
                          </CardTitle>
                          <button onClick={toggleCompound} className="text-gray-500 hover:text-white transition-colors">
                            <ChevronDown className={`h-4 w-4 transition-transform ${showCompound ? '' : '-rotate-90'}`} />
                          </button>
                        </div>
                      </CardHeader>
                      {showCompound && <CardContent>
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
                      </CardContent>}
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
                    { id: 'orb_breakout', name: 'ORB 9:30 Breakout', icon: '📈', risk: 'MEDIUM', desc: '9:30 open range · 15-min range · 6-min breakout · retest entry · SS AI Bot required' },
                  ].map(mode => (
                    <button key={mode.id} onClick={() => {
                      setStrategyMode(mode.id === 'prop_firm' ? 'sniper' : mode.id);
                      if (mode.id === 'prop_firm') setEnginePropFirmMode(true);
                      else setEnginePropFirmMode(false);
                    }}
                      className={`text-left p-3 rounded-xl border transition-all text-xs ${
                        (mode.id === 'prop_firm' ? enginePropFirmMode : strategyMode === mode.id && !enginePropFirmMode)
                          ? mode.id === 'orb_breakout' ? 'border-green-500 bg-green-500/10 text-green-300'
                          : mode.id === 'prop_firm' ? 'border-amber-500 bg-amber-500/10 text-amber-300'
                          : 'border-orange-500 bg-orange-500/10 text-orange-300'
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
                        mode.id === 'orb_breakout' ? 'bg-green-500/20 text-green-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }`}>{mode.risk}</Badge>
                      {mode.id === 'orb_breakout' && (
                        <p className="text-[8px] text-green-500 mt-1 font-semibold">SS AI Bot · 1 trade/pair/day</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {/* ── Strategy Lock Controls ────────────────────────── */}
              <div className="rounded-xl border border-gray-700 bg-gray-900/40 p-3 space-y-3">
                <p className="text-[11px] font-bold text-gray-300 uppercase tracking-wider">Strategy Execution Rules</p>

                {/* Settings Lock — master override that freezes all auto-adjustments */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">🔐 Lock My Settings</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Engine never auto-adjusts your risk, lot size, or pairs</p>
                  </div>
                  <button
                    onClick={() => setEngineLockSettings(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${engineLockSettings ? 'bg-red-500' : 'bg-gray-700'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${engineLockSettings ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>
                {engineLockSettings && (
                  <p className="text-[10px] text-red-400 font-medium">🔐 Locked — your configured lot size, pairs, and risk % are final. No AI overrides.</p>
                )}

                {/* Strategy Lock */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-white">🔒 Strategy Lock</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">Only the selected strategy fires — block all others</p>
                  </div>
                  <button
                    onClick={() => setEngineSingleStrategyMode(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${engineSingleStrategyMode ? 'bg-orange-500' : 'bg-gray-700'}`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${engineSingleStrategyMode ? 'translate-x-4' : 'translate-x-1'}`} />
                  </button>
                </div>
                {engineSingleStrategyMode && (
                  <div className="flex items-center justify-between pl-3 border-l-2 border-orange-500/40">
                    <div>
                      <p className="text-xs font-semibold text-white">📅 Multiple Trades</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{engineAllowMultipleTrades ? 'Unlimited trades per day on this strategy' : 'One trade maximum per day on this strategy'}</p>
                    </div>
                    <button
                      onClick={() => setEngineAllowMultipleTrades(v => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${engineAllowMultipleTrades ? 'bg-teal-500' : 'bg-gray-700'}`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${engineAllowMultipleTrades ? 'translate-x-4' : 'translate-x-1'}`} />
                    </button>
                  </div>
                )}
                {engineSingleStrategyMode && (
                  <p className="text-[10px] text-orange-400 font-medium">Active: Only <span className="font-bold">{strategyMode.replace('_', ' ').toUpperCase()}</span> signals will fire{!engineAllowMultipleTrades ? ' · 1 trade/day max' : ''}</p>
                )}
              </div>

              {/* ── ORB Mode callout ─────────────────────────────── */}
              {strategyMode === 'orb_breakout' && (
                <div className="rounded-xl border overflow-hidden" style={{ background: "rgba(34,197,94,0.05)", borderColor: "rgba(34,197,94,0.3)" }}>
                  {/* Header */}
                  <div className="p-4 pb-2">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">📈</span>
                      <span className="text-sm font-bold text-green-300">ORB 9:30 Breakout — Live Engine</span>
                      <a href="/orb-breakout" className="ml-auto text-[10px] text-green-400 underline font-semibold">Full ORB Scanner →</a>
                    </div>
                    <div className="space-y-1.5 text-[11px] text-gray-300">
                      <p>📅 <span className="text-white font-semibold">Session:</span> NYSE open only — 9:30 AM EST. No trades outside this window.</p>
                      <p>⏱ <span className="text-white font-semibold">Range:</span> First 15-min candle (9:30–9:45 AM) defines Opening Range High and Low.</p>
                      <p>📊 <span className="text-white font-semibold">Entry:</span> 6-min candle full-body close above/below range → wait for <strong className="text-green-300">retest</strong> → confirm pattern.</p>
                      <p>🤖 <span className="text-white font-semibold">SS AI Bot:</span> Required before every entry. Minimum score <strong className="text-green-300">70/100</strong> to take trade.</p>
                      <p>🛡 <span className="text-white font-semibold">Rule:</span> <strong className="text-white">One trade per instrument per day.</strong> After first entry — done for that pair.</p>
                      <p>🎯 <span className="text-white font-semibold">Targets:</span> T1 = 2:1 R:R (scale 50%), T2 = 3:1 R:R. Move stop to break-even after T1.</p>
                      <p className="text-[10px] text-green-400">⚡ <strong>MT5 Auto-Fill:</strong> Tap the activity icon on any pair card below to connect your MT5 live feed — ORB levels, phase detection, SS AI Bot, and webhook signals all run automatically.</p>
                    </div>
                  </div>
                  {/* Live panel — uses selected pairs */}
                  <div className="px-4 pb-4 border-t border-green-500/10 pt-3">
                    <p className="text-[10px] font-bold text-green-400 uppercase tracking-wider mb-2">Live ORB Engine — Selected Pairs</p>
                    <ORBWeeklyPanel pairs={selectedPairs} />
                  </div>
                </div>
              )}

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
                <button onClick={toggleBrainSection} className="text-gray-500 hover:text-white transition-colors">
                  <ChevronDown className={`h-4 w-4 transition-transform ${showBrainSection ? '' : '-rotate-90'}`} />
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
            {brainStatus?.learned && brainStatus?.lastLearned && (
              <div className="flex items-center justify-between mt-1.5">
                <p className="text-[10px] text-gray-500 flex items-center gap-1">
                  <span className={`inline-block w-1.5 h-1.5 rounded-full animate-pulse ${getBrainFreshnessColor(brainStatus.lastLearned)}`} />
                  <span className={
                    getBrainFreshnessColor(brainStatus.lastLearned) === 'bg-emerald-400' ? 'text-emerald-400' :
                    getBrainFreshnessColor(brainStatus.lastLearned) === 'bg-yellow-400' ? 'text-yellow-400' : 'text-red-400'
                  }>
                    Updated {getBrainFreshnessLabel(brainStatus.lastLearned)}
                  </span>
                  {getBrainFreshnessColor(brainStatus.lastLearned) === 'bg-red-400' && (
                    <span className="text-red-400 text-[9px]">— click Re-Learn</span>
                  )}
                </p>
                <span className="text-[9px] text-gray-600">Auto-refreshes every 30min</span>
              </div>
            )}
            {/* Trailing Stop Recommendation Banner */}
            {brainStatus?.learned && trailingStopSetting?.trailingStop === false &&
              Object.values(brainStatus?.pairKnowledge || {}).some((pk: any) => pk.avgWinPips > 25 && pk.topSessions?.length > 0) && (
              <div className="mt-2 flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg px-3 py-2">
                <TrendingUp className="w-3.5 h-3.5 text-yellow-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-yellow-300 font-semibold">Trailing Stop Disabled — Missing Profit</p>
                  <p className="text-[10px] text-yellow-400/80 mt-0.5">
                    Your brain shows {Object.entries(brainStatus.pairKnowledge as Record<string, any>)
                      .filter(([, pk]) => pk.avgWinPips > 25)
                      .map(([sym]) => sym).slice(0, 3).join(', ')} averaging {Math.round(
                      Math.max(...Object.values(brainStatus.pairKnowledge as Record<string, any>).map((pk: any) => pk.avgWinPips || 0))
                    )} pip wins — a trailing stop would capture more on trend moves.
                  </p>
                </div>
                <Link href="/profile">
                  <button className="text-[10px] bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/30 rounded px-2 py-1 whitespace-nowrap transition-colors">
                    Enable →
                  </button>
                </Link>
              </div>
            )}
          </CardHeader>
          <AnimatePresence>
            {showBrainSection && brainStatus?.learned && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                <CardContent className="pt-0 space-y-4">
                  {/* Unified live performance story — MT5 + TradeLocker closed trades */}
                  <TradePerformanceCard />
                  <TodayReviewPanel className="mt-3" />
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

                  {/* ── Enforcement Log — shows what the guard blocked and why ── */}
                  {enforcementLog?.log?.length > 0 && (
                    <div className="space-y-1">
                      <button
                        onClick={() => setShowEnforcementLog(v => !v)}
                        className="flex items-center gap-1.5 text-xs text-orange-400 hover:text-orange-300 font-semibold w-full text-left"
                      >
                        <Shield className="w-3.5 h-3.5" />
                        Blocked Signals ({enforcementLog.log.length})
                        <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showEnforcementLog ? '' : '-rotate-90'}`} />
                      </button>
                      {showEnforcementLog && (
                        <div className="space-y-1 max-h-40 overflow-y-auto">
                          {enforcementLog.log.slice(-8).reverse().map((entry: any, i: number) => (
                            <div key={i} className="flex items-start gap-2 text-[11px] bg-orange-500/10 border border-orange-500/20 rounded p-1.5">
                              <XCircle className="w-3 h-3 text-orange-400 mt-0.5 flex-shrink-0" />
                              <div>
                                <span className="text-orange-300 font-medium">{entry.symbol || '?'} {entry.direction || ''}</span>
                                <span className="text-gray-400 ml-1">— {entry.reason}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── Weekly Scan button + results ── */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400 font-semibold flex items-center gap-1.5">
                        <BarChart3 className="w-3.5 h-3.5 text-cyan-400" /> Weekly Trade Scan
                      </p>
                      <button
                        onClick={() => { runWeeklyScan(); setShowWeeklyScan(true); }}
                        disabled={scanLoading}
                        className="flex items-center gap-1 text-[11px] bg-cyan-600/20 hover:bg-cyan-600/30 border border-cyan-500/30 text-cyan-400 rounded px-2 py-1 transition-colors"
                      >
                        {scanLoading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Activity className="w-3 h-3" />}
                        {scanLoading ? 'Scanning...' : weeklyScan ? 'Re-Scan' : 'Run Scan'}
                      </button>
                    </div>

                    {weeklyScan && showWeeklyScan && (
                      <div className="space-y-2 bg-black/30 rounded-lg p-3 border border-cyan-500/20">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          {[
                            { label: 'Week W/L', value: `${weeklyScan.wins}W / ${weeklyScan.losses}L`, color: weeklyScan.weeklyWinRate >= 55 ? 'text-emerald-400' : 'text-red-400' },
                            { label: 'Win Rate', value: `${weeklyScan.weeklyWinRate}%`, color: weeklyScan.weeklyWinRate >= 55 ? 'text-emerald-400' : weeklyScan.weeklyWinRate >= 45 ? 'text-yellow-400' : 'text-red-400' },
                            { label: 'Net P&L', value: `$${weeklyScan.netPnL}`, color: weeklyScan.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400' },
                          ].map(s => (
                            <div key={s.label} className="bg-black/20 rounded p-1.5">
                              <p className={`text-sm font-bold ${s.color}`}>{s.value}</p>
                              <p className="text-[9px] text-gray-500">{s.label}</p>
                            </div>
                          ))}
                        </div>

                        {weeklyScan.scanInsights?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-cyan-400 font-semibold uppercase tracking-wider">Scan Insights</p>
                            {weeklyScan.scanInsights.map((ins: string, i: number) => (
                              <p key={i} className="text-[11px] text-gray-300 flex items-start gap-1.5">
                                <span className="text-cyan-400 mt-0.5">›</span>{ins}
                              </p>
                            ))}
                          </div>
                        )}

                        {weeklyScan.blockedPatterns?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-orange-400 font-semibold uppercase tracking-wider">Blocked Signals This Week</p>
                            {weeklyScan.blockedPatterns.map((bp: string, i: number) => (
                              <p key={i} className="text-[11px] text-orange-300 flex items-start gap-1.5">
                                <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />{bp}
                              </p>
                            ))}
                          </div>
                        )}

                        {weeklyScan.trailingOpportunities?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-yellow-400 font-semibold uppercase tracking-wider">Trailing Stop Opportunities</p>
                            {weeklyScan.trailingOpportunities.map((op: string, i: number) => (
                              <p key={i} className="text-[11px] text-yellow-300 flex items-start gap-1.5">
                                <TrendingUp className="w-3 h-3 mt-0.5 flex-shrink-0" />{op}
                              </p>
                            ))}
                          </div>
                        )}

                        {weeklyScan.accuracyImprovements?.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider">AI Accuracy Improvements</p>
                            {weeklyScan.accuracyImprovements.map((imp: string, i: number) => (
                              <p key={i} className="text-[11px] text-purple-300 flex items-start gap-1.5">
                                <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />{imp}
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Per-pair breakdown */}
                        {Object.keys(weeklyScan.pairAnalysis || {}).length > 0 && (
                          <div className="space-y-1">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider">Pair Breakdown</p>
                            <div className="space-y-1">
                              {Object.entries(weeklyScan.pairAnalysis).map(([sym, pa]: any) => (
                                <div key={sym} className="flex items-center justify-between bg-black/20 rounded px-2 py-1">
                                  <span className="text-[11px] font-medium text-white w-20">{sym}</span>
                                  <span className={`text-[11px] font-bold ${pa.winRate >= 55 ? 'text-emerald-400' : pa.winRate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>{pa.winRate}%</span>
                                  <span className="text-[10px] text-gray-500">{pa.wins}W/{pa.losses}L</span>
                                  <span className={`text-[10px] ${pa.netPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>${pa.netPnL}</span>
                                  {pa.trailingOpportunity && <TrendingUp className="w-3 h-3 text-yellow-400" />}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <p className="text-[9px] text-gray-600 text-right">
                          Scanned: {weeklyScan.period} · Scan triggers brain re-learn
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-purple-500/20 pt-3 space-y-3">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-sm font-semibold text-white flex items-center gap-2">
                          <Zap className="w-4 h-4 text-yellow-400" /> Autonomous Signals
                        </h4>
                        <Button size="sm" variant="outline"
                          onClick={() => generateSignalsMutation.mutate({ modes: selectedSignalModes, autoExec: autoExecuteSignals, minConf: engineMinConf })}
                          disabled={generateSignalsMutation.isPending || selectedSignalModes.length === 0}
                          className="text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/10 text-xs h-7">
                          {generateSignalsMutation.isPending
                            ? <><RefreshCw className="w-3 h-3 mr-1 animate-spin" /> Scanning {selectedSignalModes.length > 1 ? `${selectedSignalModes.length} modes` : ''}...</>
                            : <><Zap className="w-3 h-3 mr-1" /> Generate</>}
                        </Button>
                      </div>
                      {/* Confidence threshold — mirrors the engine Min Confidence setting */}
                      <div className="flex items-center justify-between bg-black/20 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400">Min Confidence Gate</span>
                          <span className="text-[10px] text-gray-600">(matches engine setting)</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={engineMinConf}
                            min={50} max={95}
                            onChange={e => { setEngineMinConf(Number(e.target.value)); queueSaveAccountSettings(); }}
                            className="w-14 bg-gray-800 border border-gray-700 text-white text-xs rounded px-2 py-1 text-center"
                          />
                          <span className="text-[11px] text-gray-400">%</span>
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            engineMinConf >= 80 ? 'bg-emerald-500/20 text-emerald-400' :
                            engineMinConf >= 70 ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {engineMinConf >= 80 ? 'Strict' : engineMinConf >= 70 ? 'Moderate' : 'Loose'}
                          </span>
                        </div>
                      </div>
                      {/* Multi-strategy toggle chips */}
                      <div className="space-y-1">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Scan strategies (select multiple):</p>
                        <div className="flex flex-wrap gap-1.5">
                          {(strategyModes?.modes || [
                            { id: 'scalping', name: 'Scalping' },
                            { id: 'momentum', name: 'Momentum' },
                            { id: 'session_breakout', name: 'Breakout' },
                            { id: 'aggressive', name: 'Aggressive' },
                            { id: 'sniper', name: 'Sniper' },
                            { id: 'orb', name: 'ORB' },
                          ]).map((m: any) => {
                            const isSelected = selectedSignalModes.includes(m.id);
                            return (
                              <button
                                key={m.id}
                                onClick={() => setSelectedSignalModes(prev =>
                                  prev.includes(m.id) ? prev.filter(x => x !== m.id) : [...prev, m.id]
                                )}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all ${
                                  isSelected
                                    ? 'bg-yellow-500/20 border-yellow-500/60 text-yellow-300'
                                    : 'bg-gray-800/60 border-gray-700/50 text-gray-500 hover:text-gray-300 hover:border-gray-600'
                                }`}
                              >
                                {m.name}
                                {isSelected && <span className="ml-1 text-yellow-400">✓</span>}
                              </button>
                            );
                          })}
                        </div>
                        {selectedSignalModes.length > 1 && (
                          <p className="text-[10px] text-yellow-500/70">
                            AI will scan {selectedSignalModes.length} strategies simultaneously and merge the best signals
                          </p>
                        )}
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

                    {/* ── Account Execution Diagnostics ── */}
                    {execStatus?.accounts?.length > 0 && (
                      <div className="rounded-xl border border-gray-700/50 bg-black/20 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider">
                            Account Execution Status
                          </span>
                          <button onClick={() => refetchExecStatus()} className="text-gray-600 hover:text-gray-400">
                            <RefreshCw className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="space-y-2">
                          {execStatus.accounts.map((acct: any) => (
                            <div key={acct.id} className={`rounded-lg p-2.5 border ${acct.inActiveTlConns ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-red-500/20 bg-red-500/5'}`}>
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${acct.inActiveTlConns ? 'bg-emerald-400' : 'bg-red-400'}`} />
                                  <span className="text-xs text-white font-medium">{acct.accountId}</span>
                                  <Badge className={`text-[9px] border-0 ${acct.accountType === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                                    {acct.accountType?.toUpperCase()}
                                  </Badge>
                                  {acct.lotMultiplier !== 1 && (
                                    <span className="text-[9px] font-mono text-amber-400">×{acct.lotMultiplier}</span>
                                  )}
                                </div>
                                <div className="flex gap-3 text-[10px]">
                                  <span className="text-emerald-400">{acct.todayExecuted}✓</span>
                                  {acct.todayFailed > 0 && <span className="text-red-400">{acct.todayFailed}✗</span>}
                                </div>
                              </div>
                              {acct.blockedReasons.length > 0 && (
                                <div className="mt-1 space-y-0.5">
                                  {acct.blockedReasons.map((r: string, i: number) => (
                                    <p key={i} className="text-[10px] text-red-400 flex items-start gap-1">
                                      <AlertCircle className="w-3 h-3 shrink-0 mt-0.5" />{r}
                                    </p>
                                  ))}
                                </div>
                              )}
                              {acct.lastTrade && (
                                <p className="text-[10px] text-gray-500 mt-1">
                                  Last: {acct.lastTrade.symbol} {acct.lastTrade.direction} — {acct.lastTrade.status}
                                  {acct.lastTrade.error ? ` (${acct.lastTrade.error})` : ''}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {autonomousSignals?.signals?.length > 0 && (
                      <div className="space-y-2">
                        {/* Multi-strategy scan summary */}
                        {autonomousSignals.strategiesScanned?.length > 1 && (
                          <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                            <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" />
                            <span className="text-[11px] text-yellow-300">
                              Scanned <strong>{autonomousSignals.strategiesScanned.length}</strong> strategies simultaneously: {autonomousSignals.strategiesScanned.map((m: string) => m.charAt(0).toUpperCase() + m.slice(1)).join(', ')} — showing best signal per pair
                            </span>
                          </div>
                        )}
                        {autonomousSignals.marketRead && (
                          <div className="bg-black/30 rounded p-2 text-xs text-gray-400 italic flex gap-2">
                            <Brain className="w-3.5 h-3.5 text-purple-400 mt-0.5 flex-shrink-0" />
                            {autonomousSignals.marketRead}
                          </div>
                        )}
                        {autonomousSignals.signals.map((sig: any, i: number) => (
                          <div key={i} className={`rounded-xl border p-3 ${sig.direction === 'BUY' ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5'}`}>
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-white text-sm">{sig.symbol}</span>
                              <Badge variant="outline" className={`text-[10px] ${sig.direction === 'BUY' ? 'text-emerald-400 border-emerald-500/40' : 'text-red-400 border-red-500/40'}`}>{sig.direction}</Badge>
                              <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/30 text-[10px]">{sig.confidence}%</Badge>
                              <Badge className="bg-gray-500/15 text-gray-400 border-gray-600 text-[10px]">{sig.strategy}</Badge>
                              {/* Order type badge */}
                              {sig.orderType === 'stop_entry' && (
                                <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30 text-[10px]">⬆ STOP ENTRY</Badge>
                              )}
                              {sig.orderType === 'limit_entry' && (
                                <Badge className="bg-cyan-500/15 text-cyan-400 border-cyan-500/30 text-[10px]">⬇ LIMIT ENTRY</Badge>
                              )}
                              {(!sig.orderType || sig.orderType === 'market') && (
                                <Badge className="bg-gray-500/10 text-gray-500 border-gray-700 text-[10px]">MARKET</Badge>
                              )}
                              {sig.sourceMode && sig.sourceMode !== sig.strategy && (
                                <Badge className="bg-yellow-500/10 text-yellow-500/80 border-yellow-500/20 text-[10px]">via {sig.sourceMode}</Badge>
                              )}
                              <span className="ml-auto text-[10px] text-gray-500">{sig.holdTime}</span>
                            </div>
                            <p className="text-xs text-gray-300">{sig.reason}</p>
                            <div className="flex gap-3 text-[10px] text-gray-500 mt-1 flex-wrap">
                              {sig.entryPrice && sig.orderType !== 'market' && (
                                <span className={sig.orderType === 'stop_entry' ? 'text-orange-400/70' : 'text-cyan-400/70'}>
                                  {sig.orderType === 'stop_entry' ? '⬆ Trigger' : '⬇ Fill'}: {sig.entryPrice}
                                </span>
                              )}
                              {!sig.entryPrice && sig.entryZone && <span>Zone: {sig.entryZone}</span>}
                              {sig.stopLoss && <span>SL: {sig.stopLoss}</span>}
                              {sig.takeProfit && <span>TP: {sig.takeProfit}</span>}
                              {sig.lotSize && <span>Lot: {sig.lotSize}</span>}
                            </div>
                            {sig.vpContext && (
                              <div className="mt-1 text-[10px] text-violet-400/80 bg-violet-500/5 border border-violet-500/20 rounded px-2 py-1 flex items-start gap-1">
                                <span className="shrink-0">📊 VP:</span>
                                <span>{sig.vpContext}</span>
                              </div>
                            )}
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
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-400" /> MT5 EA Setup Guide
                <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">Required for Auto-Trading</Badge>
              </CardTitle>
              <button onClick={toggleEaSetup} className="text-gray-500 hover:text-white transition-colors">
                <ChevronDown className={`h-4 w-4 transition-transform ${showEaSetup ? '' : '-rotate-90'}`} />
              </button>
            </div>
            <CardDescription className="text-gray-400 text-xs">
              Two EAs work together to power the VEDD AI Live Engine. Both must be running at the same time.
            </CardDescription>
          </CardHeader>
          {showEaSetup && <CardContent className="space-y-5">

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

          </CardContent>}
        </Card>

        {/* ═══════════════════════════════════════════════════════
            EA STRATEGY FEED
        ═══════════════════════════════════════════════════════ */}
        {strategy?.hasStrategy && (
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
              {aiLogs.length === 0 && (
                <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
                  <div className="w-8 h-8 rounded-full bg-purple-500/10 border border-purple-500/30 flex items-center justify-center">
                    <BookOpen className="w-4 h-4 text-purple-400/50" />
                  </div>
                  <p className="text-gray-400 text-sm font-medium">Waiting for signals</p>
                  <p className="text-gray-600 text-xs max-w-xs">
                    AI 2nd opinion decisions appear here once your MT5 EA sends chart data. Make sure your EA is attached and VEDD Live Mode is on.
                  </p>
                  {!liveMode?.live && (
                    <Badge className="bg-yellow-500/10 text-yellow-400 border-yellow-500/30 text-[10px] mt-1">
                      ⚠️ Live Mode is OFF — toggle it above to start receiving signals
                    </Badge>
                  )}
                </div>
              )}
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

          {/* ── Weekly Goal Acceleration Insights (Plan Tab) ── */}
          {weeklyGuidance && (
            <div className="space-y-3 mt-4">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-orange-400" />
                <h3 className="text-white font-bold text-sm">Goal Acceleration This Week</h3>
              </div>

              {weeklyGuidance.goalAcceleration && (
                <div className="bg-orange-950/30 border border-orange-500/30 rounded-xl p-3">
                  <p className="text-orange-300 text-xs font-semibold mb-1">Pace Analysis</p>
                  <p className="text-gray-300 text-xs leading-relaxed">{weeklyGuidance.goalAcceleration}</p>
                </div>
              )}

              {weeklyGuidance.weeklyIssues?.length > 0 && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Issues Detected This Week</p>
                  <div className="space-y-1.5">
                    {weeklyGuidance.weeklyIssues.map((issue: string, i: number) => (
                      <div key={i} className="flex items-start gap-2">
                        <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                        <p className="text-xs text-gray-300 leading-snug">{issue}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                {weeklyGuidance.topPairs?.length > 0 && (
                  <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3">
                    <p className="text-[10px] text-emerald-400 font-semibold mb-2">Best Pairs This Week</p>
                    <div className="flex flex-wrap gap-1">
                      {weeklyGuidance.topPairs.map((p: string) => (
                        <span key={p} className="text-[10px] bg-emerald-500/20 text-emerald-300 rounded px-1.5 py-0.5 font-mono font-bold">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
                {weeklyGuidance.avoidPairs?.length > 0 && (
                  <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-3">
                    <p className="text-[10px] text-red-400 font-semibold mb-2">Avoid This Week</p>
                    <div className="flex flex-wrap gap-1">
                      {weeklyGuidance.avoidPairs.map((p: string) => (
                        <span key={p} className="text-[10px] bg-red-500/20 text-red-300 rounded px-1.5 py-0.5 font-mono">{p}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {weeklyGuidance.pairOptimalConfs?.length > 0 && (
                <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
                  <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Brain-Calibrated Confidence Gates</p>
                  <div className="flex flex-wrap gap-1.5">
                    {weeklyGuidance.pairOptimalConfs.map((c: string, i: number) => (
                      <span key={i} className="text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/20 rounded px-2 py-0.5 font-mono">{c}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          </>
        )}

        {/* ─── Tab: AI Config ──────────────────────────────── */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            {/* ── Apply to Live Engine Button ── */}
            {isRunning && (
              <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-emerald-300 text-xs font-semibold">Engine is running — settings apply immediately</p>
                  <p className="text-gray-500 text-[10px] mt-0.5">Click to push all current config changes to the live engine</p>
                </div>
                <Button
                  size="sm"
                  onClick={async () => {
                    try {
                      await apiRequest('PATCH', '/api/vedd-live-engine/config', {
                        pairs: enginePairs,
                        strategyMode: engineMode,
                        minConfidence: engineMinConf,
                        maxOpenTrades: engineMaxTrades,
                        maxLotSize: engineMaxLotSize,
                        scanIntervalSeconds: engineInterval,
                        weeklyProfitTarget: engineWeeklyTarget,
                        accountBalance: engineAccountBalance,
                        riskPerTrade: engineRiskPerTrade,
                        baseLotSize: engineBaseLotSize,
                        compounding: engineCompounding,
                        drawdownShield: engineDrawdownShield,
                        shieldThreshold: engineShieldThreshold,
                        adaptiveScan: engineAdaptiveScan,
                        brainLearningMode: engineBrainLearningMode,
                        propFirmMode: enginePropFirmMode,
                        aiMode: engineAiMode,
                        volatileCapMode: engineVolatileCapMode,
                        copyMode: engineCopyMode,
                        trailMethod: engineTrailMethod,
                        dailyLossLimit: engineDailyLossLimit,
                        dailyProfitTarget: engineDailyProfitTarget,
                        lockSettings: engineLockSettings,
                        singleStrategyMode: engineSingleStrategyMode,
                        allowMultipleTrades: engineAllowMultipleTrades,
                      });
                      toast({ title: '✅ Engine Updated', description: 'All config changes pushed to the running engine.' });
                    } catch (e: any) {
                      toast({ title: 'Update failed', description: e?.message, variant: 'destructive' });
                    }
                  }}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0 gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5" />
                  Apply to Engine
                </Button>
              </div>
            )}
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

            {/* ── Weekly Goal Acceleration Insights ── */}
            {weeklyGuidance && (
              <div className="space-y-3 mt-4">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-orange-400" />
                  <h3 className="text-white font-bold text-sm">Goal Acceleration This Week</h3>
                </div>

                {weeklyGuidance.goalAcceleration && (
                  <div className="bg-orange-950/30 border border-orange-500/30 rounded-xl p-3">
                    <p className="text-orange-300 text-xs font-semibold mb-1">Pace Analysis</p>
                    <p className="text-gray-300 text-xs leading-relaxed">{weeklyGuidance.goalAcceleration}</p>
                  </div>
                )}

                {weeklyGuidance.weeklyIssues?.length > 0 && (
                  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Issues Detected This Week</p>
                    <div className="space-y-1.5">
                      {weeklyGuidance.weeklyIssues.map((issue: string, i: number) => (
                        <div key={i} className="flex items-start gap-2">
                          <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                          <p className="text-xs text-gray-300 leading-snug">{issue}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  {weeklyGuidance.topPairs?.length > 0 && (
                    <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-3">
                      <p className="text-[10px] text-emerald-400 font-semibold mb-2">Best Pairs This Week</p>
                      <div className="flex flex-wrap gap-1">
                        {weeklyGuidance.topPairs.map((p: string) => (
                          <span key={p} className="text-[10px] bg-emerald-500/20 text-emerald-300 rounded px-1.5 py-0.5 font-mono font-bold">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {weeklyGuidance.avoidPairs?.length > 0 && (
                    <div className="bg-red-950/20 border border-red-500/30 rounded-xl p-3">
                      <p className="text-[10px] text-red-400 font-semibold mb-2">Avoid This Week</p>
                      <div className="flex flex-wrap gap-1">
                        {weeklyGuidance.avoidPairs.map((p: string) => (
                          <span key={p} className="text-[10px] bg-red-500/20 text-red-300 rounded px-1.5 py-0.5 font-mono">{p}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {weeklyGuidance.pairOptimalConfs?.length > 0 && (
                  <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-3">
                    <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-2">Brain-Calibrated Confidence Gates</p>
                    <div className="flex flex-wrap gap-1.5">
                      {weeklyGuidance.pairOptimalConfs.map((c: string, i: number) => (
                        <span key={i} className="text-[10px] bg-purple-500/15 text-purple-300 border border-purple-500/20 rounded px-2 py-0.5 font-mono">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
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

            {/* ── SS Engine Dual-Vote Consensus Panel ── */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-purple-500/20">
                    <Swords className="w-4 h-4 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-white font-bold text-sm">SS Engine Dual-Vote Consensus</h3>
                    <p className="text-gray-500 text-[11px] mt-0.5">Quant Rules Agent + AI Vision Agent — both must agree to fire a trade</p>
                  </div>
                </div>
                {ssConsensusData?.updatedAt && (
                  <span className="text-[10px] text-gray-600">Last signal: {new Date(ssConsensusData.updatedAt).toLocaleTimeString()}</span>
                )}
              </div>

              {/* Summary chips */}
              {ssConsensusData?.summary && (
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {[
                    { key: 'strongConfirm', label: 'STRONG CONFIRM', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', emoji: '✅' },
                    { key: 'caution',       label: 'CAUTION',        color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/30',   emoji: '⚠️' },
                    { key: 'watch',         label: 'WATCH',          color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/30',     emoji: '👁️' },
                    { key: 'strongSkip',    label: 'STRONG SKIP',    color: 'text-red-400',     bg: 'bg-red-500/10 border-red-500/30',       emoji: '🚫' },
                  ].map(s => (
                    <div key={s.key} className={`rounded-xl border p-2.5 text-center ${s.bg}`}>
                      <p className="text-lg">{s.emoji}</p>
                      <p className={`font-bold text-lg ${s.color}`}>{(ssConsensusData.summary as any)[s.key] || 0}</p>
                      <p className="text-[10px] text-gray-500 mt-0.5">{s.label}</p>
                    </div>
                  ))}
                </div>
              )}

              {!ssConsensusData?.consensus?.length ? (
                <div className="text-center py-8 text-gray-600">
                  <Swords className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No signals processed yet — consensus appears as soon as your MT5 EA sends signals</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {ssConsensusData.consensus.slice(0, 10).map((c: any, i: number) => {
                    const consensusColors: Record<string, { border: string; badge: string }> = {
                      STRONG_CONFIRM: { border: 'border-emerald-500/30', badge: 'bg-emerald-500/20 text-emerald-300' },
                      CAUTION:        { border: 'border-amber-500/30',   badge: 'bg-amber-500/20 text-amber-300' },
                      WATCH:          { border: 'border-cyan-500/30',    badge: 'bg-cyan-500/20 text-cyan-300' },
                      STRONG_SKIP:    { border: 'border-red-500/30',     badge: 'bg-red-500/20 text-red-300' },
                    };
                    const cc = consensusColors[c.consensus] || consensusColors.WATCH;
                    return (
                      <div key={i} className={`rounded-xl border p-3 bg-gray-900/60 ${cc.border}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-white font-bold text-sm">{c.symbol}</span>
                            <span className="text-gray-500 text-[10px]">{c.timeframe}</span>
                            <Badge className={`${cc.badge} border-0 text-[10px]`}>{c.consensus.replace('_', ' ')}</Badge>
                          </div>
                          <span className="text-gray-600 text-[10px]">{new Date(c.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <div className={`flex items-center gap-1 ${c.quantVerdict === 'CONFIRM' ? 'text-emerald-400' : c.quantVerdict === 'SKIP' ? 'text-red-400' : 'text-amber-400'}`}>
                            <BarChart3 className="w-3 h-3" />
                            <span>Quant: {c.quantVerdict} ({c.quantScore}/100)</span>
                          </div>
                          <div className={`flex items-center gap-1 ${c.aiVerdict === 'CONFIRM' ? 'text-emerald-400' : 'text-red-400'}`}>
                            <Brain className="w-3 h-3" />
                            <span>AI: {c.aiVerdict} ({c.aiConfidence}%)</span>
                          </div>
                          <span className={c.tradeAllowed ? 'text-emerald-400' : 'text-red-400'}>
                            {c.tradeAllowed ? '✓ Allowed' : '✗ Blocked'}
                          </span>
                        </div>
                        {c.quantReasons?.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {c.quantReasons.slice(0, 4).map((r: string, ri: number) => (
                              <span key={ri} className="text-[10px] text-gray-500 bg-gray-800/60 rounded px-1.5 py-0.5">{r}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ─── Tab: Live Engine ────────────────────────────── */}
        {activeTab === 'engine' && (
          <div className="space-y-4">

            {/* ── Backtest Engine ───────────────────────────────── */}
            <div className="bg-gray-900/80 border border-violet-500/20 rounded-xl overflow-hidden">
              {/* Header */}
              <button
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-900/10 transition-colors"
                onClick={() => setBacktestOpen(o => !o)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-white font-semibold text-sm">🧪 Backtest Engine</span>
                  <span className="text-[10px] font-bold bg-violet-600/40 text-violet-300 border border-violet-500/30 rounded px-1.5 py-0.5">BETA</span>
                </div>
                {backtestOpen ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
              </button>

              {backtestOpen && (
                <div className="px-4 pb-4 space-y-4 border-t border-violet-500/10">
                  {/* Inputs */}
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">Pair</Label>
                      <Input
                        type="text"
                        value={backtestPair}
                        onChange={e => setBacktestPair(e.target.value.toUpperCase())}
                        className="bg-gray-800 border-gray-700 text-white text-sm h-8"
                        placeholder="XAUUSD"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">Look-back</Label>
                      <select
                        value={backtestPeriod}
                        onChange={e => setBacktestPeriod(Number(e.target.value))}
                        className="w-full bg-gray-800 border border-gray-700 text-white text-sm h-8 rounded-md px-2"
                      >
                        <option value={30}>30 days</option>
                        <option value={60}>60 days</option>
                        <option value={90}>90 days</option>
                        <option value={180}>180 days</option>
                      </select>
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">Take Profit %</Label>
                      <Input
                        type="number"
                        value={backtestTP}
                        onChange={e => setBacktestTP(Number(e.target.value))}
                        min={0.5} max={20} step={0.5}
                        className="bg-gray-800 border-gray-700 text-white text-sm h-8"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-400 mb-1 block">Stop Loss %</Label>
                      <Input
                        type="number"
                        value={backtestSL}
                        onChange={e => setBacktestSL(Number(e.target.value))}
                        min={0.5} max={10} step={0.5}
                        className="bg-gray-800 border-gray-700 text-white text-sm h-8"
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    Using: Strategy={engineMode}, Risk={engineRiskPerTrade}%, Balance=${engineAccountBalance}, Min Conf={engineMinConf}%
                  </p>
                  <Button
                    className="w-full bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold"
                    onClick={() => runBacktestMutation.mutate()}
                    disabled={runBacktestMutation.isPending}
                  >
                    {runBacktestMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Running Backtest…</>
                    ) : '▶ Run Backtest'}
                  </Button>

                  {/* Results */}
                  {backtestResult && !backtestResult.error && backtestResult.stats && (() => {
                    const s = backtestResult.stats;
                    return (
                      <div className="space-y-3">
                        {/* Stats grid */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {[
                            { label: 'Win Rate', value: `${s.winRate.toFixed(1)}%`, good: s.winRate > 50 },
                            { label: 'Total P&L', value: `${s.totalPnlPct >= 0 ? '+' : ''}${s.totalPnlPct.toFixed(2)}%`, good: s.totalPnlPct >= 0 },
                            { label: 'Total Trades', value: `${s.totalTrades}`, neutral: true },
                            { label: 'Max Drawdown', value: `-${s.maxDrawdownPct.toFixed(2)}%`, bad: true },
                            { label: 'Profit Factor', value: s.profitFactor.toFixed(2), good: s.profitFactor > 1 },
                            { label: 'Sharpe Ratio', value: s.sharpeRatio.toFixed(2), good: s.sharpeRatio > 1 },
                            { label: 'Avg Win', value: `+${s.avgWinPct.toFixed(2)}%`, good: true },
                            { label: 'Avg Loss', value: `-${s.avgLossPct.toFixed(2)}%`, bad: true },
                          ].map((item: any, idx: number) => (
                            <div key={idx} className="bg-gray-800/60 rounded-lg p-2 text-center">
                              <div className={`text-sm font-bold ${item.neutral ? 'text-white' : item.bad ? 'text-red-400' : item.good ? 'text-emerald-400' : 'text-white'}`}>
                                {item.value}
                              </div>
                              <div className="text-[10px] text-gray-500 mt-0.5">{item.label}</div>
                            </div>
                          ))}
                        </div>

                        {/* Verdict banner */}
                        {s.winRate >= 55 && s.totalPnlPct >= 0 ? (
                          <div className="rounded-lg bg-emerald-900/30 border border-emerald-500/30 px-3 py-2 text-emerald-300 text-xs font-medium">
                            ✅ Strategy profitable on {backtestResult.pair} over {backtestResult.periodDays}d — confidence in live deployment: High
                          </div>
                        ) : s.winRate >= 45 && s.totalPnlPct >= -5 ? (
                          <div className="rounded-lg bg-amber-900/30 border border-amber-500/30 px-3 py-2 text-amber-300 text-xs font-medium">
                            ⚠️ Marginally profitable — test longer period before going live
                          </div>
                        ) : (
                          <div className="rounded-lg bg-red-900/30 border border-red-500/30 px-3 py-2 text-red-300 text-xs font-medium">
                            ❌ Strategy underperformed on {backtestResult.pair} — adjust TP/SL or strategy mode before live trading
                          </div>
                        )}

                        {/* Trade log */}
                        {backtestResult.tradeLog?.length > 0 && (
                          <div>
                            <button
                              className="text-xs text-gray-400 hover:text-white flex items-center gap-1 mb-2"
                              onClick={() => setBacktestTradeLogOpen(o => !o)}
                            >
                              {backtestTradeLogOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                              Trade Log (last {Math.min(20, backtestResult.tradeLog.length)} trades)
                            </button>
                            {backtestTradeLogOpen && (
                              <div className="overflow-x-auto rounded-lg border border-gray-700">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="bg-gray-800 text-gray-400">
                                      <th className="px-2 py-1.5 text-left">Date</th>
                                      <th className="px-2 py-1.5 text-left">Dir</th>
                                      <th className="px-2 py-1.5 text-right">Entry</th>
                                      <th className="px-2 py-1.5 text-right">Exit</th>
                                      <th className="px-2 py-1.5 text-right">P&L%</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {backtestResult.tradeLog.slice(-20).map((t: any, idx: number) => (
                                      <tr key={idx} className={t.result === 'WIN' ? 'bg-emerald-900/20' : 'bg-red-900/20'}>
                                        <td className="px-2 py-1 text-gray-300">{t.exitDate?.slice(0, 10)}</td>
                                        <td className={`px-2 py-1 font-semibold ${t.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{t.direction}</td>
                                        <td className="px-2 py-1 text-right text-gray-300">{t.entryPrice?.toFixed(4)}</td>
                                        <td className="px-2 py-1 text-right text-gray-300">{t.exitPrice?.toFixed(4)}</td>
                                        <td className={`px-2 py-1 text-right font-semibold ${t.pnlPct >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                          {t.pnlPct >= 0 ? '+' : ''}{t.pnlPct?.toFixed(2)}%
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {backtestResult?.error && (
                    <div className="rounded-lg bg-red-900/30 border border-red-500/30 px-3 py-2 text-red-300 text-xs">
                      {backtestResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>

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

            {/* ── Engine Status Row ── */}
            <div className={`rounded-xl border p-4 flex flex-wrap items-center gap-4 ${
              isRunning ? 'bg-cyan-950/30 border-cyan-700/40' : 'bg-gray-900/60 border-gray-800'
            }`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-gray-600'}`} />
                <span className={`font-bold text-sm ${isRunning ? 'text-emerald-400' : 'text-gray-400'}`}>
                  {isRunning ? 'SS AI ENGINE RUNNING' : 'Engine Stopped'}
                </span>
                {isRunning && liveEngineStatus?.currentlyScanning && (
                  <span className="text-[10px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 px-1.5 py-0.5 rounded animate-pulse">SCANNING</span>
                )}
              </div>
              {isRunning && (
                <div className="flex flex-wrap gap-3 text-xs text-gray-400 ml-auto">
                  <span>Scans: <span className="text-white font-bold">{liveEngineStatus?.scanCount ?? 0}</span></span>
                  <span>Signals: <span className="text-purple-400 font-bold">{liveEngineStatus?.signalsGenerated ?? 0}</span></span>
                  <span>Executed: <span className="text-emerald-400 font-bold">{liveEngineStatus?.tradesExecuted ?? 0}</span></span>
                  <span>Open: <span className="text-yellow-400 font-bold">{liveEngineStatus?.openPositionCount ?? 0}</span></span>
                  <span>Failed: <span className="text-red-400 font-bold">{liveEngineStatus?.tradesFailed ?? 0}</span></span>
                  {liveEngineStatus?.startedAt && (
                    <span className="text-gray-600">Since {new Date(liveEngineStatus.startedAt).toLocaleTimeString()}</span>
                  )}
                </div>
              )}
            </div>

            {/* ── Composite Edge: Markov × Polymarket ── */}
            <div id="polymarket" />
            {((markovOverview?.overview?.length ?? 0) > 0 || polymarketSentiment || btcComposite) && (() => {
              const alignColor = (a: string) =>
                a === 'strong_agree'    ? 'text-emerald-400' :
                a === 'agree'          ? 'text-green-400'   :
                a === 'strong_disagree'? 'text-red-400'     :
                a === 'disagree'       ? 'text-orange-400'  : 'text-gray-400';
              const alignBorder = (a: string) =>
                a === 'strong_agree'    ? 'border-emerald-700/40' :
                a === 'agree'          ? 'border-green-700/30'   :
                a === 'strong_disagree'? 'border-red-700/40'     :
                a === 'disagree'       ? 'border-orange-700/30'  : 'border-purple-700/30';
              const alignment = btcComposite?.alignment ?? 'neutral';
              return (
                <div className={`bg-gray-900/60 border rounded-xl p-4 ${alignBorder(alignment)}`}>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-white font-bold text-sm flex items-center gap-2">
                      ⚡ Composite Edge
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold">Markov × Polymarket</span>
                    </h3>
                    {btcComposite && (
                      <span className={`text-xs font-bold ${alignColor(alignment)}`}>
                        {btcComposite.confidenceAdjustment > 0 ? '+' : ''}{btcComposite.confidenceAdjustment}% adj
                      </span>
                    )}
                  </div>

                  {/* BTC Composite row (when engine running) */}
                  {btcComposite && (
                    <div className="bg-gray-800/60 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs text-white font-bold font-mono">BTC Composite Edge</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          btcComposite.compositeEdgeScore >= 60 ? 'bg-emerald-500/20 text-emerald-400' :
                          btcComposite.compositeEdgeScore <= 40 ? 'bg-red-500/20 text-red-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>{btcComposite.compositeEdgeScore}/100</span>
                      </div>
                      {/* Composite bar */}
                      <div className="relative h-2.5 bg-gray-700 rounded-full overflow-hidden mb-2">
                        <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
                          style={{
                            width: `${btcComposite.compositeEdgeScore}%`,
                            background: btcComposite.compositeEdgeScore >= 60
                              ? 'linear-gradient(90deg,#10b981,#34d399)'
                              : btcComposite.compositeEdgeScore <= 40
                              ? 'linear-gradient(90deg,#ef4444,#f87171)'
                              : 'linear-gradient(90deg,#6b7280,#9ca3af)',
                          }} />
                        <div className="absolute left-1/2 top-0 h-full w-px bg-gray-500" />
                      </div>
                      {/* Markov signal */}
                      <div className="text-[11px]">
                        <div className="bg-purple-500/10 rounded px-2 py-1.5">
                          <p className="text-purple-300 font-semibold mb-0.5">🎲 Markov</p>
                          <p className="text-white font-mono">
                            {btcComposite.markov?.currentState?.replace('_', ' ') ?? '—'}
                          </p>
                          <p className="text-gray-400">
                            Bull {btcComposite.markov?.bullP ?? '?'}% · Bear {btcComposite.markov?.bearP ?? '?'}%
                          </p>
                          <p className={`font-bold mt-0.5 ${btcComposite.markov?.adjustment > 0 ? 'text-emerald-400' : btcComposite.markov?.adjustment < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                            {btcComposite.markov?.adjustment > 0 ? '+' : ''}{btcComposite.markov?.adjustment ?? 0}%
                          </p>
                        </div>
                      </div>
                      {/* Alignment badge */}
                      <div className={`mt-2 text-center text-[11px] font-bold ${alignColor(alignment)}`}>
                        {alignment === 'strong_agree'    ? '🔥 Both signals strongly agree — amplified adjustment' :
                         alignment === 'agree'           ? '✅ Both signals agree' :
                         alignment === 'strong_disagree' ? '🚫 Signals strongly conflict — dampened' :
                         alignment === 'disagree'        ? '⚠️ Signals conflict — partially cancelled' :
                                                           '🔸 Neutral — no strong edge'}
                      </div>
                    </div>
                  )}

                  {/* Markov table for all pairs */}
                  {markovOverview && markovOverview.overview.length > 0 && (
                    <>
                      <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wider mb-1.5">Markov State — All Pairs</p>
                      <div className="grid grid-cols-5 gap-1 mb-1 px-1">
                        <span className="text-[9px] text-gray-600 font-semibold">PAIR</span>
                        <span className="text-[9px] text-gray-600 font-semibold text-center">STATE</span>
                        <span className="text-[9px] text-emerald-400/70 font-semibold text-center">BULL%</span>
                        <span className="text-[9px] text-red-400/70 font-semibold text-center">BEAR%</span>
                        <span className="text-[9px] text-gray-500 font-semibold text-center">EDGE</span>
                      </div>
                      <div className="space-y-1">
                        {markovOverview.overview.slice(0, 8).map((m: any) => {
                          const edge = m.bullishProbability - m.bearishProbability;
                          const ec = edge >= 15 ? 'text-emerald-400' : edge <= -15 ? 'text-red-400' : 'text-gray-400';
                          const sc =
                            m.currentState === 'STRONG_BULL' ? 'text-emerald-400' :
                            m.currentState === 'BULL'        ? 'text-green-400' :
                            m.currentState === 'STRONG_BEAR' ? 'text-red-400' :
                            m.currentState === 'BEAR'        ? 'text-orange-400' : 'text-gray-500';
                          const sl =
                            m.currentState === 'STRONG_BULL' ? '▲▲' :
                            m.currentState === 'BULL'        ? '▲' :
                            m.currentState === 'STRONG_BEAR' ? '▼▼' :
                            m.currentState === 'BEAR'        ? '▼' : '─';
                          return (
                            <div key={m.symbol} className="grid grid-cols-5 gap-1 items-center bg-gray-800/30 rounded px-2 py-1">
                              <span className="text-[11px] text-white font-mono font-bold truncate">{m.symbol}</span>
                              <span className={`text-[11px] font-bold text-center ${sc}`}>{sl}</span>
                              <div className="text-center">
                                <span className="text-[11px] font-bold text-emerald-400">{m.bullishProbability}%</span>
                                <div className="h-1 bg-gray-700 rounded-full mt-0.5"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${m.bullishProbability}%` }} /></div>
                              </div>
                              <div className="text-center">
                                <span className="text-[11px] font-bold text-red-400">{m.bearishProbability}%</span>
                                <div className="h-1 bg-gray-700 rounded-full mt-0.5"><div className="h-full bg-red-500 rounded-full" style={{ width: `${m.bearishProbability}%` }} /></div>
                              </div>
                              <span className={`text-[11px] font-bold text-center ${ec}`}>{edge > 0 ? '+' : ''}{edge}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {/* → Full Polymarket Markets on dedicated page */}
                  <div className="mt-3 pt-3 border-t border-gray-800/60 flex items-center justify-between">
                    <p className="text-[10px] text-gray-500">View prediction markets & run the Polymarket engine</p>
                    <a
                      href="/polymarket-engine"
                      className="text-[11px] font-semibold text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors"
                    >
                      🏦 Polymarket Engine →
                    </a>
                  </div>

                  <p className="text-[9px] text-gray-600 mt-2 text-right">
                    Markov: built from 50 closed candles · 15s refresh · Polymarket data on dedicated page
                  </p>
                </div>
              );
            })()}

            {/* ── Composite Auto-Trade — standalone section ── */}
            {(() => {
              const alignment = btcComposite?.alignment ?? 'neutral';
              const edgeScore = btcComposite?.compositeEdgeScore ?? 0;
              const isLive = engineCompositeAutonomous;
              const signalReady = alignment === 'strong_agree' && edgeScore >= engineCompositeMinEdge;
              return (
                <div className={`bg-gray-900/60 border rounded-xl p-4 ${isLive ? 'border-purple-500/40' : 'border-gray-800'}`}>
                  {/* Header */}
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-bold text-sm">🤖 Composite Auto-Trade</span>
                      <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold">Markov × Polymarket</span>
                      {isLive && (
                        <span className="text-[9px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded px-1.5 py-0.5 animate-pulse">● ACTIVE</span>
                      )}
                    </div>
                    {/* Master on/off toggle */}
                    <button
                      onClick={async () => {
                        const next = !engineCompositeAutonomous;
                        setEngineCompositeAutonomous(next);
                        try {
                          await apiRequest('PATCH', '/api/vedd-live-engine/config', {
                            enableCompositeAutonomous: next,
                            compositeMinEdgeScore: engineCompositeMinEdge,
                          });
                        } catch { /* engine may not be running yet — setting saved locally */ }
                      }}
                      className={`w-12 h-6 rounded-full relative transition-colors shrink-0 ${isLive ? 'bg-purple-500' : 'bg-gray-700'}`}
                    >
                      <span className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow ${isLive ? 'translate-x-7' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  <p className="text-[10px] text-gray-400 mb-3">
                    Fires crypto trades autonomously when Markov chain + Polymarket prediction markets <span className="text-purple-300 font-semibold">strongly agree</span> on direction — no AI call needed. Independent of the SS AI engine.
                    <span className="text-gray-600"> 5-min cooldown per pair.</span>
                  </p>

                  {/* Current signal status */}
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-black/30 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-500 uppercase mb-0.5">Signal</p>
                      <p className={`text-xs font-bold ${btcComposite?.direction === 'BUY' ? 'text-emerald-400' : btcComposite?.direction === 'SELL' ? 'text-red-400' : 'text-gray-500'}`}>
                        {btcComposite?.direction ?? '—'}
                      </p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-500 uppercase mb-0.5">Edge Score</p>
                      <p className={`text-xs font-bold ${edgeScore >= 80 ? 'text-emerald-400' : edgeScore >= 65 ? 'text-purple-300' : 'text-gray-500'}`}>
                        {btcComposite ? `${edgeScore}/100` : '—'}
                      </p>
                    </div>
                    <div className="bg-black/30 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-500 uppercase mb-0.5">Alignment</p>
                      <p className={`text-[10px] font-bold ${
                        alignment === 'strong_agree' ? 'text-emerald-400' :
                        alignment === 'agree' ? 'text-green-400' :
                        alignment === 'strong_disagree' ? 'text-red-400' :
                        alignment === 'disagree' ? 'text-orange-400' : 'text-gray-500'
                      }`}>
                        {alignment === 'strong_agree' ? '🔥 STRONG' :
                         alignment === 'agree' ? '✅ AGREE' :
                         alignment === 'strong_disagree' ? '🚫 CONFLICT' :
                         alignment === 'disagree' ? '⚠️ PARTIAL' : '— neutral'}
                      </p>
                    </div>
                  </div>

                  {/* Fire-ready indicator */}
                  {btcComposite && (
                    <div className={`rounded-lg px-3 py-2 mb-3 flex items-center gap-2 ${signalReady ? 'bg-emerald-500/10 border border-emerald-500/30' : 'bg-gray-800/40 border border-gray-700/40'}`}>
                      <span className={`text-sm ${signalReady ? 'text-emerald-400' : 'text-gray-600'}`}>{signalReady ? '✅' : '⏳'}</span>
                      <span className={`text-[10px] ${signalReady ? 'text-emerald-300' : 'text-gray-500'}`}>
                        {signalReady
                          ? `Trade-ready — ${btcComposite.direction} BTC | edge ${edgeScore} ≥ threshold ${engineCompositeMinEdge}${isLive ? ' — will fire on next engine cycle' : ' — toggle ON to auto-trade'}`
                          : `Not ready — need strong_agree alignment + edge ≥ ${engineCompositeMinEdge} (current: ${edgeScore})`}
                      </span>
                    </div>
                  )}

                  {/* Min edge score control */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className="text-[10px] text-gray-400 shrink-0 w-24">Min edge score</span>
                    <input
                      type="range" min={55} max={90} step={1}
                      value={engineCompositeMinEdge}
                      onChange={async e => {
                        const v = Number(e.target.value);
                        setEngineCompositeMinEdge(v);
                        try {
                          await apiRequest('PATCH', '/api/vedd-live-engine/config', {
                            enableCompositeAutonomous: isLive,
                            compositeMinEdgeScore: v,
                          });
                        } catch { /* non-blocking */ }
                      }}
                      className="flex-1 accent-purple-500 h-1.5"
                    />
                    <span className={`text-xs font-bold w-10 text-right ${engineCompositeMinEdge >= 80 ? 'text-emerald-400' : engineCompositeMinEdge >= 70 ? 'text-purple-300' : 'text-yellow-400'}`}>
                      {engineCompositeMinEdge}<span className="text-gray-600 font-normal">/100</span>
                    </span>
                  </div>
                  {/* Polymarket Engine link */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-800">
                    <p className="text-[9px] text-gray-600">
                      Crypto pairs: BTC · ETH · SOL · XRP · BNB · DOGE · ADA · MATIC · LINK
                    </p>
                    <a
                      href="/polymarket-engine"
                      className="text-[10px] font-semibold text-purple-400 hover:text-purple-300 bg-purple-400/10 hover:bg-purple-400/20 px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                    >
                      🏦 Polymarket Engine →
                    </a>
                  </div>
                </div>
              );
            })()}

            {/* ── Weekly Profit Progress ── */}
            {strategy && (
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    🎯 Weekly Goal Progress
                  </h3>
                  <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${
                    (strategy.progressPercentage ?? 0) >= 100 ? 'bg-emerald-500/20 text-emerald-400' :
                    (strategy.progressPercentage ?? 0) >= 60 ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {(strategy.progressPercentage ?? 0) >= 100 ? '✓ TARGET HIT' : `${strategy.progressPercentage ?? 0}%`}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>Profit Progress</span>
                  <span>${(strategy.currentProfit ?? 0).toFixed(2)} / ${(strategy.profitTarget ?? 0).toFixed(2)}</span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-4">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, strategy.progressPercentage ?? 0)}%`,
                      background: (strategy.progressPercentage ?? 0) >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)'
                        : (strategy.progressPercentage ?? 0) >= 60 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                        : 'linear-gradient(90deg,#dc2626,#ef4444)'
                    }} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-white">{strategy.progressTrades ?? 0}</p>
                    <p className="text-xs text-gray-500 mt-0.5">Trades</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-emerald-400">{strategy.progressWinRate ?? 0}%</p>
                    <p className="text-xs text-gray-500 mt-0.5">Win Rate</p>
                  </div>
                  <div className="bg-gray-800/60 rounded-lg p-3 text-center">
                    <p className="text-xl font-bold text-amber-400">
                      {tracker?.weeklyTarget > 0 ? `$${(tracker.weeklyTarget - (tracker.currentProfit ?? 0)).toFixed(2)}` : '—'}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">Remaining</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── Engine Goal Tracker (from live engine) ── */}
            {isRunning && tracker && tracker.weeklyTarget > 0 && (
              <div className="bg-gray-900/60 border border-gray-700/40 rounded-xl p-5">
                <h3 className="text-white font-bold text-base flex items-center gap-2 mb-3">
                  ⚡ Live Engine Goal Tracker
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    tracker.currentPhase === 'target_reached' ? 'bg-emerald-500/20 text-emerald-400' :
                    tracker.currentPhase === 'pushing' ? 'bg-orange-500/20 text-orange-400' :
                    tracker.currentPhase === 'accelerating' ? 'bg-yellow-500/20 text-yellow-400' :
                    tracker.currentPhase === 'cruising' ? 'bg-cyan-500/20 text-cyan-400' :
                    'bg-gray-500/20 text-gray-400'
                  }`}>{tracker.currentPhase?.replace(/_/g, ' ').toUpperCase()}</span>
                </h3>
                <div className="flex justify-between text-xs text-gray-400 mb-1.5">
                  <span>${(tracker.currentProfit ?? 0).toFixed(2)} earned</span>
                  <span>${(tracker.weeklyTarget ?? 0).toFixed(2)} target — {tracker.progressPercent ?? 0}%</span>
                </div>
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden mb-4">
                  <div className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${Math.min(100, tracker.progressPercent ?? 0)}%`,
                      background: (tracker.progressPercent ?? 0) >= 100 ? 'linear-gradient(90deg,#10b981,#34d399)'
                        : (tracker.progressPercent ?? 0) >= 75 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                        : (tracker.progressPercent ?? 0) >= 50 ? 'linear-gradient(90deg,#06b6d4,#22d3ee)'
                        : 'linear-gradient(90deg,#a855f7,#c084fc)'
                    }} />
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Wins', value: tracker.wins ?? 0, color: 'text-emerald-400' },
                    { label: 'Losses', value: tracker.losses ?? 0, color: 'text-red-400' },
                    { label: 'Win Rate', value: `${tracker.winRate ?? 0}%`, color: 'text-yellow-400' },
                    { label: 'Compound', value: `${tracker.compoundMultiplier ?? 1}×`, color: 'text-cyan-400' },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-800/60 rounded-lg p-2">
                      <div className={`text-lg font-bold ${s.color}`}>{s.value}</div>
                      <div className="text-[10px] text-gray-500">{s.label}</div>
                    </div>
                  ))}
                </div>
                {tracker.consecutiveWins > 1 && (
                  <div className="mt-2 text-center text-xs text-emerald-400 bg-emerald-500/10 rounded-lg px-3 py-1.5">
                    🔥 {tracker.consecutiveWins}-win streak — compound active at {tracker.compoundMultiplier}×
                  </div>
                )}
                {tracker.consecutiveLosses > 1 && (
                  <div className="mt-2 text-center text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-1.5">
                    ⚠️ {tracker.consecutiveLosses}-loss streak — lot size reduced to {tracker.compoundMultiplier}×
                  </div>
                )}
              </div>
            )}

            {/* ── Connected TradeLocker Accounts ── */}
            {activeTLEngineConns.length > 0 && (
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
                <h3 className="text-white font-bold text-base flex items-center gap-2 mb-3">
                  🔗 Connected TradeLocker Accounts
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded-full font-bold">{activeTLEngineConns.length} active</span>
                </h3>
                <div className="space-y-2">
                  {activeTLEngineConns.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between bg-gray-800/50 border border-cyan-700/20 rounded-lg px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <div>
                          <p className="text-sm text-white font-medium">{c.email}</p>
                          <p className="text-[10px] text-gray-500">{c.serverId} · Account {c.accountId}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.accountType === 'live' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                          {c.accountType?.toUpperCase()}
                        </span>
                        {c.lotMultiplier && c.lotMultiplier !== 1 ? (
                          <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${c.lotMultiplier > 1 ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400'}`}>
                            ×{c.lotMultiplier}
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-500">×1.0</span>
                        )}
                        <a href="/webhooks" className="text-[10px] text-cyan-400 hover:text-cyan-300">Manage →</a>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {activeTLEngineConns.length === 0 && (
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 text-center">
                <p className="text-gray-500 text-sm">No active TradeLocker accounts connected.</p>
                <a href="/webhooks" className="text-cyan-400 text-sm underline mt-1 inline-block">Connect a TradeLocker account →</a>
              </div>
            )}

            {/* ── TL Recent Trade History ── */}
            {activeTLEngineConns.length > 0 && (
              <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-bold text-base flex items-center gap-2">
                    📋 Recent TL Trades
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded-full font-bold">{tlTrades.length} records</span>
                  </h3>
                  <span className="text-[10px] text-gray-500">Auto-syncs every 15s</span>
                </div>
                {tlTrades.length === 0 ? (
                  <p className="text-gray-500 text-sm text-center py-3">No trades synced yet — closed trades appear within 30 seconds</p>
                ) : (
                  <div className="space-y-1.5">
                    {/* header row */}
                    <div className="grid grid-cols-5 text-[10px] text-gray-500 uppercase tracking-wide px-2 pb-1 border-b border-gray-800">
                      <span>Symbol</span><span>Dir</span><span>Entry</span><span className="text-right">P&amp;L</span><span className="text-right">Date</span>
                    </div>
                    {tlTrades.map((t: any, i: number) => {
                      const pnl = typeof t.profitLoss === 'number' ? t.profitLoss : parseFloat(t.profitLoss ?? '0');
                      const dir = (t.action || t.direction || '').toUpperCase();
                      const isBuy = dir.includes('BUY') || dir.includes('LONG');
                      const result = t.result || t.status || '';
                      const isPending = result === 'PENDING' || result === 'open' || result === 'executed';
                      const isWin = !isPending && pnl > 0;
                      const isLoss = !isPending && pnl < 0;
                      const dateStr = t.closedAt || t.createdAt
                        ? new Date(t.closedAt || t.createdAt).toLocaleDateString('en-US', { month: 'numeric', day: 'numeric' })
                        : '—';
                      return (
                        <div key={t.id || i} className={`grid grid-cols-5 items-center text-[11px] px-2 py-1 rounded ${isPending ? 'bg-amber-500/5 border border-amber-500/20' : 'bg-gray-800/30'}`}>
                          <span className="text-white font-medium">{(t.symbol || 'UNKNOWN').toUpperCase()}</span>
                          <span className={`font-bold ${isBuy ? 'text-emerald-400' : 'text-red-400'}`}>{isBuy ? 'BUY' : 'SELL'}</span>
                          <span className="text-gray-400">{t.entryPrice ? Number(t.entryPrice).toFixed(5) : '—'}</span>
                          <span className={`text-right font-semibold ${isPending ? 'text-amber-400' : isWin ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-gray-400'}`}>
                            {isPending ? 'Open' : `${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`}
                          </span>
                          <span className="text-right text-gray-500">{dateStr}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="text-center pt-1">
              <a href="/live-monitor" className="text-red-400 underline text-sm">→ Open full Live Monitor for real-time trade feed</a>
            </div>
          </div>
        )}

        {/* ─── Tab: Goal Pacing Agent ───────────────────────────── */}
        {activeTab === 'pacing' && (
          <div className="space-y-4">

            {/* Header + Run button */}
            <div className="bg-gradient-to-r from-orange-950/40 to-amber-950/30 border border-orange-500/30 rounded-2xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-orange-500/20">
                    <Target className="w-5 h-5 text-orange-400" />
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-base">Goal Pacing Agent</h2>
                    <p className="text-gray-400 text-xs mt-0.5">AI analyses all your week's trades — SWOT + exact plan to hit your target</p>
                  </div>
                </div>
                <Button
                  onClick={async () => {
                    setPacingLoading(true);
                    try {
                      const res = await apiRequest('POST', '/api/goal-pacing/analyze', {});
                      const data = await res.json();
                      setPacingResult(data);
                    } catch (e: any) {
                      toast({ title: 'Analysis failed', description: e?.message || 'Check your connection', variant: 'destructive' });
                    } finally {
                      setPacingLoading(false);
                    }
                  }}
                  disabled={pacingLoading}
                  className="bg-orange-600 hover:bg-orange-700 text-white gap-2 shrink-0"
                >
                  {pacingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {pacingLoading ? 'Analysing…' : pacingResult ? 'Re-Run Analysis' : 'Run Full Analysis'}
                </Button>
              </div>
            </div>

            {/* ── AI Path Control Status Banner ── */}
            {aiPathStatus?.enabled && (
              <div className="rounded-2xl border border-violet-500/40 bg-violet-500/10 p-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500/20">
                      <Navigation className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-white font-bold text-sm">AI Path Control — ACTIVE</span>
                        <Badge className="bg-violet-500/20 text-violet-300 border-0 text-[10px]">{aiPathStatus.pathType}</Badge>
                      </div>
                      <p className="text-gray-400 text-xs mt-0.5">
                        AI is steering trades through: <span className="text-violet-300 font-medium">{(aiPathStatus.pairs || []).join(', ')}</span>
                        {' '}· Lot ×{(aiPathStatus.lotMultiplier || 1).toFixed(2)}
                      </p>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={aiPathLoading}
                    onClick={async () => {
                      setAiPathLoading(true);
                      try {
                        await apiRequest('POST', '/api/goal-pacing/set-ai-path', { enabled: false });
                        setAiPathStatus({ enabled: false });
                        toast({ title: 'AI Path Control deactivated', description: 'Engine returning to full pair access.' });
                      } catch { toast({ title: 'Error', variant: 'destructive' }); }
                      finally { setAiPathLoading(false); }
                    }}
                    className="border-red-500/40 text-red-400 hover:bg-red-500/10 shrink-0"
                  >
                    {aiPathLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Power className="w-3.5 h-3.5 mr-1" />}
                    Deactivate
                  </Button>
                </div>
              </div>
            )}

            {/* ── Let AI Auto-Select Path button (shown when no path is active) ── */}
            {!aiPathStatus?.enabled && (
              <div className="rounded-2xl border border-dashed border-violet-500/30 bg-violet-500/5 p-4 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <Navigation className="w-5 h-5 text-violet-400 shrink-0" />
                  <div>
                    <p className="text-white font-semibold text-sm">Let AI Choose the Path</p>
                    <p className="text-gray-500 text-xs mt-0.5">AI auto-selects the best path + pairs based on your current pace and activates it</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  disabled={aiPathLoading}
                  onClick={async () => {
                    setAiPathLoading(true);
                    try {
                      const res = await apiRequest('POST', '/api/goal-pacing/set-ai-path', { enabled: true, pathType: 'AUTO' });
                      const data = await res.json();
                      setAiPathStatus(data);
                      toast({ title: `AI Path Activated: ${data.pathType}`, description: `Steering through: ${(data.pairs || []).join(', ')}` });
                    } catch { toast({ title: 'Error', variant: 'destructive' }); }
                    finally { setAiPathLoading(false); }
                  }}
                  className="bg-violet-600 hover:bg-violet-700 text-white shrink-0"
                >
                  {aiPathLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <PlayIcon className="w-3.5 h-3.5 mr-1" />}
                  Auto-Select
                </Button>
              </div>
            )}

            {!pacingResult && !pacingLoading && (
              <div className="text-center py-12 text-gray-500">
                <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Click <span className="text-orange-400 font-semibold">Run Full Analysis</span> to get your personalised plan</p>
                <p className="text-xs mt-1 text-gray-600">AI scans every trade this week, calculates pace, and builds 3 paths to your goal</p>
              </div>
            )}

            {pacingLoading && (
              <div className="text-center py-12 text-gray-400">
                <Brain className="w-10 h-10 mx-auto mb-3 text-orange-400 animate-pulse" />
                <p className="text-sm">Reading your week's trades and calculating paths to goal…</p>
              </div>
            )}

            {pacingResult && !pacingLoading && (() => {
              const p = pacingResult;
              const pace = p.pace || {};
              const metrics = p.metrics || {};
              const swot = p.swot || {};
              const plans: any[] = p.plans || [];
              const tsa = p.tradeSizeAnalysis || {};

              const paceColor = pace.status === 'AHEAD' ? 'text-emerald-400' :
                                pace.status === 'ON_TRACK' ? 'text-cyan-400' :
                                pace.status === 'BEHIND' ? 'text-amber-400' : 'text-red-400';
              const paceBg = pace.status === 'AHEAD' ? 'bg-emerald-500/10 border-emerald-500/30' :
                              pace.status === 'ON_TRACK' ? 'bg-cyan-500/10 border-cyan-500/30' :
                              pace.status === 'BEHIND' ? 'bg-amber-500/10 border-amber-500/30' :
                              'bg-red-500/10 border-red-500/30';
              const paceEmoji = pace.status === 'AHEAD' ? '🚀' : pace.status === 'ON_TRACK' ? '✅' : pace.status === 'BEHIND' ? '⚠️' : '🔴';

              return (
                <div className="space-y-4">

                  {/* Pace Summary Bar */}
                  <div className={`rounded-2xl border p-4 ${paceBg}`}>
                    <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{paceEmoji}</span>
                        <span className={`font-bold text-sm ${paceColor}`}>{pace.status?.replace('_', ' ')}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs flex-wrap">
                        <span className="text-gray-400">${(pace.closedProfit || 0).toFixed(2)} earned</span>
                        <span className="text-gray-400">/ ${pace.weekTarget || 0} goal</span>
                        <span className={`font-bold ${paceColor}`}>{pace.pacePct || 0}%</span>
                      </div>
                    </div>
                    <div className="h-2.5 bg-gray-800/60 rounded-full overflow-hidden mb-3">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, pace.pacePct || 0)}%`, background: pace.status === 'AHEAD' ? 'linear-gradient(90deg,#10b981,#34d399)' : pace.status === 'ON_TRACK' ? 'linear-gradient(90deg,#06b6d4,#22d3ee)' : pace.status === 'BEHIND' ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#dc2626,#ef4444)' }} />
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      {[
                        { label: 'Remaining', value: `$${(pace.deficit || 0).toFixed(2)}` },
                        { label: 'Days Left', value: pace.daysLeft || 0 },
                        { label: 'Need/Day', value: `$${(pace.requiredPerDay || 0).toFixed(2)}` },
                        { label: 'Trades', value: metrics.totalTrades || 0 },
                      ].map(stat => (
                        <div key={stat.label} className="bg-black/20 rounded-lg py-2">
                          <p className="text-white font-bold text-sm">{stat.value}</p>
                          <p className="text-gray-500 text-[10px] mt-0.5">{stat.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Metrics Row */}
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { label: 'Win Rate', value: `${metrics.winRate || 0}%`, color: (metrics.winRate || 0) >= 55 ? 'text-emerald-400' : 'text-amber-400' },
                      { label: 'Avg Lot', value: metrics.avgLotSize || '—', color: tsa.isUndersized ? 'text-red-400' : 'text-cyan-400' },
                      { label: 'Profit Factor', value: (metrics.profitFactor || 0).toFixed(2), color: (metrics.profitFactor || 0) >= 1.5 ? 'text-emerald-400' : (metrics.profitFactor || 0) >= 1 ? 'text-amber-400' : 'text-red-400' },
                    ].map(m => (
                      <div key={m.label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 text-center">
                        <p className={`font-bold text-lg ${m.color}`}>{m.value}</p>
                        <p className="text-gray-500 text-[11px] mt-0.5">{m.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Trade Size Analysis */}
                  {tsa.assessment && (
                    <div className={`rounded-xl border p-4 ${tsa.isUndersized ? 'bg-red-500/8 border-red-500/30' : 'bg-emerald-500/8 border-emerald-500/30'}`}>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Swords className={`w-4 h-4 ${tsa.isUndersized ? 'text-red-400' : 'text-emerald-400'}`} />
                        <span className="text-white font-semibold text-sm">Trade Size Analysis</span>
                        {tsa.isUndersized && <Badge className="bg-red-500/20 text-red-300 border-0 text-[10px]">UNDERSIZED</Badge>}
                      </div>
                      <p className="text-gray-300 text-xs">{tsa.assessment}</p>
                      {tsa.recommendation && <p className="text-amber-300 text-xs mt-1.5 font-medium">→ {tsa.recommendation}</p>}
                    </div>
                  )}

                  {/* SWOT */}
                  {swot.strengths && (
                    <div className="rounded-2xl border border-gray-700/60 bg-gray-900/40 p-4">
                      <h3 className="text-white font-bold text-sm mb-3 flex items-center gap-2"><BookOpen className="w-4 h-4 text-purple-400" /> SWOT Analysis</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { key: 'strengths',    label: 'Strengths',    emoji: '💪', color: 'border-emerald-500/30 bg-emerald-500/8' },
                          { key: 'weaknesses',   label: 'Weaknesses',   emoji: '⚠️',  color: 'border-red-500/30 bg-red-500/8' },
                          { key: 'opportunities',label: 'Opportunities', emoji: '🚪', color: 'border-cyan-500/30 bg-cyan-500/8' },
                          { key: 'threats',      label: 'Threats',      emoji: '🔻', color: 'border-amber-500/30 bg-amber-500/8' },
                        ].map(q => (
                          <div key={q.key} className={`rounded-xl border p-3 ${q.color}`}>
                            <p className="text-xs font-bold text-gray-300 mb-2">{q.emoji} {q.label}</p>
                            <ul className="space-y-1">
                              {(swot[q.key] || []).map((item: string, i: number) => (
                                <li key={i} className="text-[11px] text-gray-400 flex items-start gap-1.5">
                                  <span className="text-gray-600 mt-0.5 shrink-0">•</span>{item}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 3 Plan Cards */}
                  {plans.length > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-white font-bold text-sm flex items-center gap-2"><Rocket className="w-4 h-4 text-orange-400" /> Paths to Goal — Safest to Riskiest</h3>
                      <div className="space-y-3">
                        {plans.map((plan: any, i: number) => {
                          const planColors: Record<string, { border: string; bg: string; badge: string; lotColor: string }> = {
                            SAFE:       { border: 'border-emerald-500/40', bg: 'bg-emerald-500/8',  badge: 'bg-emerald-500/20 text-emerald-300', lotColor: 'text-emerald-400' },
                            MODERATE:   { border: 'border-amber-500/40',   bg: 'bg-amber-500/8',    badge: 'bg-amber-500/20 text-amber-300',   lotColor: 'text-amber-400' },
                            AGGRESSIVE: { border: 'border-red-500/40',     bg: 'bg-red-500/8',      badge: 'bg-red-500/20 text-red-300',       lotColor: 'text-red-400' },
                          };
                          const pc = planColors[plan.type] || planColors.MODERATE;
                          const planEmojis = ['🛡️', '⚖️', '🔥'];
                          return (
                            <div key={i} className={`rounded-2xl border p-4 ${pc.border} ${pc.bg}`}>
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <span className="text-lg">{planEmojis[i] || '📊'}</span>
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-white font-bold text-sm">{plan.label}</span>
                                      <Badge className={`${pc.badge} border-0 text-[10px]`}>{plan.type}</Badge>
                                    </div>
                                    {plan.probability && <p className="text-gray-500 text-[10px] mt-0.5">{plan.probability}</p>}
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className={`font-bold text-lg ${pc.lotColor}`}>{plan.lotSize}</p>
                                  <p className="text-gray-500 text-[10px]">lots</p>
                                </div>
                              </div>
                              <div className="grid grid-cols-3 gap-2 mb-3">
                                {[
                                  { label: 'Proj. Profit', value: `$${(plan.projectedProfit || 0).toFixed(2)}` },
                                  { label: 'Trades/Day', value: plan.tradesPerDay || '—' },
                                  { label: 'Win Rate Needed', value: `${plan.winRateNeeded || 0}%` },
                                ].map(s => (
                                  <div key={s.label} className="bg-black/20 rounded-lg py-2 text-center">
                                    <p className="text-white font-bold text-sm">{s.value}</p>
                                    <p className="text-gray-500 text-[10px] mt-0.5">{s.label}</p>
                                  </div>
                                ))}
                              </div>
                              {plan.pairs && plan.pairs.length > 0 && (
                                <div className="flex flex-wrap gap-1 mb-2">
                                  {plan.pairs.map((pair: string) => (
                                    <Badge key={pair} variant="outline" className="text-[10px] border-gray-700 text-gray-400">{pair}</Badge>
                                  ))}
                                </div>
                              )}
                              {plan.steps && plan.steps.length > 0 && (
                                <ul className="space-y-1 mb-3">
                                  {plan.steps.map((step: string, si: number) => (
                                    <li key={si} className="flex items-start gap-2 text-[11px] text-gray-400">
                                      <span className="text-orange-400 font-bold shrink-0 mt-0.5">{si + 1}.</span>{step}
                                    </li>
                                  ))}
                                </ul>
                              )}

                              {/* Activate This Path button */}
                              {(() => {
                                const isActive = aiPathStatus?.enabled && aiPathStatus?.pathType === plan.type;
                                return (
                                  <Button
                                    size="sm"
                                    disabled={aiPathLoading}
                                    onClick={async () => {
                                      setAiPathLoading(true);
                                      try {
                                        if (isActive) {
                                          await apiRequest('POST', '/api/goal-pacing/set-ai-path', { enabled: false });
                                          setAiPathStatus({ enabled: false });
                                          toast({ title: 'AI Path deactivated' });
                                        } else {
                                          const res = await apiRequest('POST', '/api/goal-pacing/set-ai-path', {
                                            enabled: true,
                                            pathType: plan.type,
                                            pairs: plan.pairs || [],
                                            lotSize: plan.lotSize,
                                          });
                                          const data = await res.json();
                                          setAiPathStatus(data);
                                          toast({
                                            title: `${plan.type} Path Activated`,
                                            description: `AI steering through: ${(plan.pairs || []).join(', ')} · Lot ×${(plan.lotSize || 1)}`,
                                          });
                                        }
                                      } catch { toast({ title: 'Error', variant: 'destructive' }); }
                                      finally { setAiPathLoading(false); }
                                    }}
                                    className={`w-full text-xs font-semibold transition-all ${
                                      isActive
                                        ? 'bg-red-600/80 hover:bg-red-700 text-white'
                                        : 'bg-violet-600/80 hover:bg-violet-700 text-white'
                                    }`}
                                  >
                                    {aiPathLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Navigation className="w-3.5 h-3.5 mr-1" />}
                                    {isActive ? 'Deactivate Path' : 'Activate This Path'}
                                  </Button>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Overall recommendation */}
                  {p.overallRecommendation && (
                    <div className="rounded-xl border border-purple-500/30 bg-purple-500/8 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Brain className="w-4 h-4 text-purple-400" />
                        <span className="text-white font-semibold text-sm">VEDD AI Recommendation</span>
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed">{p.overallRecommendation}</p>
                    </div>
                  )}

                  {/* SOL Engine bonus */}
                  {p.solEngine && (
                    <div className="rounded-xl border border-violet-500/30 bg-violet-500/8 p-4">
                      <p className="text-xs font-bold text-violet-300 mb-2">🔮 SOL Engine This Week</p>
                      <div className="grid grid-cols-3 gap-2 text-center">
                        {[
                          { label: 'Trades', value: p.solEngine.trades },
                          { label: 'SOL Profit', value: `${p.solEngine.currentProfit.toFixed(3)}` },
                          { label: 'Goal', value: `${p.solEngine.currentProfit.toFixed(2)}/${p.solEngine.target}` },
                        ].map(s => (
                          <div key={s.label} className="bg-black/20 rounded-lg py-2">
                            <p className="text-white font-bold text-sm">{s.value}</p>
                            <p className="text-gray-500 text-[10px] mt-0.5">{s.label}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Week Trades Table */}
                  {p.weekTrades && p.weekTrades.length > 0 && (
                    <div className="rounded-2xl border border-gray-700/60 bg-gray-900/40 overflow-hidden">
                      <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
                        <BarChart3 className="w-4 h-4 text-gray-400" />
                        <span className="text-white font-semibold text-sm">All Trades This Week ({p.weekTrades.length})</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-gray-800">
                              {['Symbol','Dir','Lots','Profit','Result'].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-gray-500 font-medium">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {p.weekTrades.slice(0, 20).map((t: any, i: number) => (
                              <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                                <td className="px-3 py-2 text-white font-medium">{t.symbol}</td>
                                <td className="px-3 py-2">
                                  <span className={`font-bold ${t.direction === 'BUY' || t.direction === 'LONG' ? 'text-emerald-400' : t.direction === 'SELL' || t.direction === 'SHORT' ? 'text-red-400' : 'text-gray-400'}`}>{t.direction}</span>
                                </td>
                                <td className="px-3 py-2 text-gray-400">{t.lots}</td>
                                <td className={`px-3 py-2 font-medium ${t.profit > 0 ? 'text-emerald-400' : t.profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                                  {t.profit > 0 ? '+' : ''}${t.profit.toFixed(2)}
                                </td>
                                <td className="px-3 py-2">
                                  <Badge className={`text-[10px] border-0 ${t.outcome === 'WIN' ? 'bg-emerald-500/20 text-emerald-300' : t.outcome === 'LOSS' ? 'bg-red-500/20 text-red-300' : 'bg-gray-700/50 text-gray-400'}`}>{t.outcome}</Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {p.weekTrades.length > 20 && (
                          <p className="text-center text-gray-600 text-[11px] py-2">+ {p.weekTrades.length - 20} more trades</p>
                        )}
                      </div>
                    </div>
                  )}

                </div>
              );
            })()}

            {/* ── Live Decision Feed in Monitor ── */}
            <div className="bg-gray-900/60 border border-gray-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-800 flex items-center justify-between">
                <h3 className="text-white font-bold text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-400" />
                  Live Decision Feed
                  {(decisionFeed?.openCount ?? 0) > 0 && (
                    <span className="text-[9px] bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded px-1.5 py-0.5 animate-pulse">
                      ● {decisionFeed.openCount} OPEN
                    </span>
                  )}
                </h3>
                <div className="flex items-center gap-3">
                  {(decisionFeed?.unrealizedPnL ?? 0) !== 0 && (
                    <span className={`text-xs font-bold ${(decisionFeed?.unrealizedPnL ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {(decisionFeed?.unrealizedPnL ?? 0) >= 0 ? '+' : ''}${(decisionFeed?.unrealizedPnL ?? 0).toFixed(2)} open P&L
                    </span>
                  )}
                  <span className="text-[10px] text-gray-600">8s refresh</span>
                </div>
              </div>
              {(!decisionFeed?.events?.length) ? (
                <div className="px-4 py-8 text-center">
                  <Radio className="w-8 h-8 mx-auto text-gray-700 mb-2" />
                  <p className="text-gray-600 text-sm">No decisions yet</p>
                  <p className="text-gray-700 text-xs mt-1">Trades, signals, and blocks appear here live</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-800/50 max-h-96 overflow-y-auto">
                  {decisionFeed.events.slice(0, 20).map((ev: any) => {
                    const isWin = ev.result === 'WIN';
                    const isLoss = ev.result === 'LOSS';
                    const isOpen = ev.type === 'OPEN';
                    const isBlocked = ev.type === 'BLOCKED';
                    return (
                      <div key={ev.id} className={`flex items-center gap-3 px-4 py-2.5 hover:bg-gray-800/20 transition-colors ${
                        isWin ? 'border-l-2 border-emerald-500' : isLoss ? 'border-l-2 border-red-500' : isOpen ? 'border-l-2 border-yellow-500' : isBlocked ? 'border-l-2 border-red-800' : 'border-l-2 border-gray-700'
                      }`}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-white text-xs font-bold font-mono">{ev.symbol}</span>
                            <span className={`text-[11px] font-bold ${ev.direction === 'BUY' ? 'text-emerald-400' : ev.direction === 'SELL' ? 'text-red-400' : 'text-gray-400'}`}>{ev.direction}</span>
                            {ev.confidence != null && <span className="text-[10px] text-gray-500">{ev.confidence}%</span>}
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              isWin ? 'bg-emerald-500/20 text-emerald-300' : isLoss ? 'bg-red-500/20 text-red-300' : isOpen ? 'bg-yellow-500/20 text-yellow-300' : isBlocked ? 'bg-red-900/40 text-red-400' : 'bg-purple-500/20 text-purple-300'
                            }`}>{isOpen ? 'OPEN' : isBlocked ? 'BLOCKED' : ev.result || ev.type}</span>
                            <span className="text-[9px] text-gray-600">{ev.source}</span>
                          </div>
                          {ev.reason && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{ev.reason}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          {ev.profit != null && (
                            <p className={`text-sm font-bold ${ev.profit > 0 ? 'text-emerald-400' : ev.profit < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                              {ev.profit > 0 ? '+' : ''}${ev.profit.toFixed(2)}
                            </p>
                          )}
                          <p className="text-[9px] text-gray-600">{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* ─── Tab: FX Paper Trading ────────────────────────────── */}
        {activeTab === 'paper' && (
          <div className="space-y-6">

            {/* Header + toggle */}
            <div className="rounded-2xl border border-gray-800 bg-[#0D1117] p-6">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-5 h-5 text-purple-400" /> FX Paper Trading
                  </h2>
                  <p className="text-gray-400 text-sm mt-1">Simulated trading using the AI SS Engine signals — no real money, no broker execution.</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-sm font-semibold ${paperAccount?.isEnabled ? 'text-emerald-400' : 'text-gray-500'}`}>
                    {paperAccount?.isEnabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                  <button
                    onClick={() => togglePaperMutation.mutate(!paperAccount?.isEnabled)}
                    disabled={togglePaperMutation.isPending}
                    className={`relative w-12 h-6 rounded-full transition-colors duration-200 focus:outline-none ${
                      paperAccount?.isEnabled ? 'bg-emerald-500' : 'bg-gray-700'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                      paperAccount?.isEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>

              {/* Balance row */}
              <div className="mt-5 flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[160px]">
                  <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">Simulated Balance</p>
                  {paperEditingBalance ? (
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={paperBalanceInput}
                        onChange={e => setPaperBalanceInput(e.target.value)}
                        className="bg-gray-800 border-gray-700 text-white h-9 w-36"
                        placeholder="10000"
                      />
                      <Button size="sm" onClick={() => {
                        const n = parseFloat(paperBalanceInput);
                        if (!isNaN(n) && n > 0) savePaperBalanceMutation.mutate(n);
                      }} className="bg-emerald-600 hover:bg-emerald-700 h-9">Save</Button>
                      <Button size="sm" variant="ghost" onClick={() => setPaperEditingBalance(false)} className="h-9">Cancel</Button>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-white">${(paperAccount?.balance ?? 10000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      <button onClick={() => { setPaperBalanceInput(String(paperAccount?.balance ?? 10000)); setPaperEditingBalance(true); }}
                        className="text-xs text-gray-500 hover:text-white underline">edit</button>
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Starting</p>
                  <p className="text-base font-semibold text-gray-400">${(paperAccount?.initialBalance ?? 10000).toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Total P&L</p>
                  <p className={`text-base font-semibold ${(paperAccount?.totalPnl ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {(paperAccount?.totalPnl ?? 0) >= 0 ? '+' : ''}${(paperAccount?.totalPnl ?? 0).toFixed(2)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Open</p>
                  <p className="text-base font-semibold text-yellow-400">{paperAccount?.openTrades ?? 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Closed</p>
                  <p className="text-base font-semibold text-gray-300">{paperAccount?.closedTrades ?? 0}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-gray-500 mb-1">Running P&L</p>
                  <p className={`text-base font-semibold ${runningPnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {runningPnl >= 0 ? '+' : ''}${runningPnl.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Open Positions */}
            <div className="rounded-2xl border border-gray-800 bg-[#0D1117] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-yellow-400" /> Open Positions
                  <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-500/30 text-[10px] ml-1">{openPaperTrades.length}</Badge>
                </h3>
              </div>
              {openPaperTrades.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <BookOpen className="w-8 h-8 mx-auto text-gray-700 mb-2" />
                  <p className="text-gray-500 text-sm">No open paper trades</p>
                  <p className="text-gray-600 text-xs mt-1">When the engine runs with paper mode enabled, trades appear here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left px-4 py-2">Pair</th>
                        <th className="text-left px-4 py-2">Dir</th>
                        <th className="text-right px-4 py-2">Entry</th>
                        <th className="text-right px-4 py-2">SL</th>
                        <th className="text-right px-4 py-2">TP</th>
                        <th className="text-right px-4 py-2">Conf</th>
                        <th className="text-right px-4 py-2">Opened</th>
                        <th className="text-right px-4 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {openPaperTrades.map((t: any) => (
                        <tr key={t.id} className="hover:bg-gray-800/30">
                          <td className="px-4 py-2.5 font-mono font-bold text-white">{t.pair}</td>
                          <td className="px-4 py-2.5">
                            <span className={`font-bold ${t.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{t.direction}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{t.entry_price?.toFixed(5)}</td>
                          <td className="px-4 py-2.5 text-right text-red-400">{t.stop_loss?.toFixed(5) ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-emerald-400">{t.take_profit?.toFixed(5) ?? '—'}</td>
                          <td className="px-4 py-2.5 text-right text-purple-400">{t.confidence != null ? `${Math.round(t.confidence)}%` : '—'}</td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{new Date(t.opened_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                          <td className="px-4 py-2.5 text-right">
                            <Button size="sm" variant="outline"
                              onClick={() => {
                                const exitPrice = t.entry_price ?? 0;
                                closePaperTradeMutation.mutate({ id: t.id, exitPrice, pnl: 0, pnlPips: 0 });
                              }}
                              className="h-6 px-2 text-[10px] border-gray-700 text-gray-400 hover:text-white"
                            >Close</Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Closed Trades */}
            <div className="rounded-2xl border border-gray-800 bg-[#0D1117] overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                <h3 className="font-semibold text-white flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-gray-400" /> Closed Trades
                  <Badge className="bg-gray-700 text-gray-400 border-gray-600 text-[10px] ml-1">{closedPaperTrades.length}</Badge>
                </h3>
                {closedPaperTrades.length > 0 && (
                  <Button size="sm" variant="ghost"
                    onClick={() => clearPaperHistoryMutation.mutate()}
                    disabled={clearPaperHistoryMutation.isPending}
                    className="text-xs text-gray-600 hover:text-red-400 h-7"
                  >
                    <Trash2 className="w-3 h-3 mr-1" /> Clear
                  </Button>
                )}
              </div>
              {closedPaperTrades.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <p className="text-gray-500 text-sm">No closed trades yet</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500 border-b border-gray-800">
                        <th className="text-left px-4 py-2">Pair</th>
                        <th className="text-left px-4 py-2">Dir</th>
                        <th className="text-right px-4 py-2">Entry</th>
                        <th className="text-right px-4 py-2">Exit</th>
                        <th className="text-right px-4 py-2">P&L</th>
                        <th className="text-right px-4 py-2">Pips</th>
                        <th className="text-right px-4 py-2">Closed</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800/50">
                      {closedPaperTrades.slice(0, 50).map((t: any) => (
                        <tr key={t.id} className="hover:bg-gray-800/30">
                          <td className="px-4 py-2.5 font-mono font-bold text-white">{t.pair}</td>
                          <td className="px-4 py-2.5">
                            <span className={`font-bold ${t.direction === 'BUY' ? 'text-emerald-400' : 'text-red-400'}`}>{t.direction}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{t.entry_price?.toFixed(5)}</td>
                          <td className="px-4 py-2.5 text-right text-gray-300">{t.exit_price?.toFixed(5) ?? '—'}</td>
                          <td className={`px-4 py-2.5 text-right font-bold ${(t.pnl ?? 0) > 0 ? 'text-emerald-400' : (t.pnl ?? 0) < 0 ? 'text-red-400' : 'text-gray-500'}`}>
                            {t.pnl != null ? `${t.pnl >= 0 ? '+' : ''}$${t.pnl.toFixed(2)}` : '—'}
                          </td>
                          <td className={`px-4 py-2.5 text-right ${(t.pnl_pips ?? 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {t.pnl_pips != null ? `${t.pnl_pips >= 0 ? '+' : ''}${t.pnl_pips.toFixed(1)}` : '—'}
                          </td>
                          <td className="px-4 py-2.5 text-right text-gray-500">{t.closed_at ? new Date(t.closed_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
