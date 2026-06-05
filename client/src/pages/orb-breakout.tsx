import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  TrendingUp, TrendingDown, Clock, Target, Shield, Zap, AlertTriangle,
  CheckCircle2, XCircle, ChevronUp, ChevronDown, BarChart3, BookOpen,
  RefreshCw, ArrowUpRight, ArrowDownRight, Minus, Star, Info,
  Activity, Radio, Lock, Plus, Trash2, Send, Webhook
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type ORBPhase =
  | "PRE_MARKET"    // before 9:30 AM EST
  | "BUILDING"      // 9:30–9:45 AM — first 15-min candle forming
  | "RANGE_SET"     // 9:45 AM+ — range defined, watching for breakout
  | "BREAKOUT_LONG" // 6-min close above ORB high
  | "BREAKOUT_SHORT"// 6-min close below ORB low
  | "RETEST_LONG"   // price pulling back to ORB high from above
  | "RETEST_SHORT"  // price pulling back to ORB low from below
  | "TRADE_TAKEN"   // one trade already executed today
  | "WINDOW_CLOSED";// past 2 PM EST — ORB window expired

interface ORBInstrument {
  symbol: string;
  displayName: string;
  type: "index" | "stock" | "commodity" | "forex";
  pipSize: number; // minimum tick
}

interface ORBSetup {
  id: string;
  symbol: string;
  orbHigh: number;
  orbLow: number;
  orbRange: number;
  orbRangePct: number;
  currentPrice: number;
  preMarketBias: "bullish" | "bearish" | "neutral";
  phase: ORBPhase;
  breakoutCandle?: "6min" | "1min";
  retestLevel?: number;
  entryPrice?: number;
  stopLoss?: number;
  target1?: number;
  target2?: number;
  riskReward?: number;
  pattern?: string;
  tradeDirection?: "LONG" | "SHORT";
  tradeTaken: boolean;
  tradeCount?: number;    // total trades logged on this symbol today (multi-setup mode)
  lastUpdated: string;
  aiScore?: number;
  aiChecks?: AICheck[];
  aiNote?: string;
  autoMode?: boolean;
  mt5Status?: "connected" | "no_data" | "error" | "idle";
  tlStatus?: "connected" | "no_data" | "error" | "idle";
}

interface AICheck {
  label: string;
  pass: boolean;
  note: string;
}

interface DailyTrade {
  symbol: string;
  direction: "LONG" | "SHORT";
  entry: number;
  stop: number;
  target1: number;
  target2: number;
  rr: number;
  pattern: string;
  takenAt: string;
  result?: "WIN" | "LOSS" | "PENDING";
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_INSTRUMENTS: ORBInstrument[] = [
  { symbol: "US30",   displayName: "Dow Jones (US30)",   type: "index",     pipSize: 1    },
  { symbol: "NAS100", displayName: "Nasdaq 100 (NAS100)",type: "index",     pipSize: 1    },
  { symbol: "SPX500", displayName: "S&P 500 (SPX500)",   type: "index",     pipSize: 0.25 },
  { symbol: "AAPL",   displayName: "Apple Inc. (AAPL)",  type: "stock",     pipSize: 0.01 },
  { symbol: "TSLA",   displayName: "Tesla (TSLA)",       type: "stock",     pipSize: 0.01 },
  { symbol: "XAUUSD", displayName: "Gold (XAUUSD)",      type: "commodity", pipSize: 0.01 },
];

const CANDLESTICK_PATTERNS = [
  "Bullish Engulfing", "Bearish Engulfing",
  "Hammer / Pin Bar",  "Shooting Star",
  "Inside Bar (IB)",   "Outside Bar (OB)",
  "Bullish Marubozu",  "Bearish Marubozu",
  "Morning Star",      "Evening Star",
  "Doji Reversal",     "Three White Soldiers",
];

const PHASE_CONFIG: Record<ORBPhase, { label: string; color: string; bg: string }> = {
  PRE_MARKET:     { label: "Pre-Market",      color: "#6b7280", bg: "rgba(107,114,128,0.1)"  },
  BUILDING:       { label: "Building Range",  color: "#f59e0b", bg: "rgba(245,158,11,0.1)"   },
  RANGE_SET:      { label: "Range Set",       color: "#06b6d4", bg: "rgba(6,182,212,0.1)"    },
  BREAKOUT_LONG:  { label: "🚀 Breakout ↑",   color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
  BREAKOUT_SHORT: { label: "🔻 Breakout ↓",   color: "#ef4444", bg: "rgba(239,68,68,0.12)"  },
  RETEST_LONG:    { label: "⚡ Retest LONG",   color: "#22c55e", bg: "rgba(34,197,94,0.18)"  },
  RETEST_SHORT:   { label: "⚡ Retest SHORT",  color: "#ef4444", bg: "rgba(239,68,68,0.18)"  },
  TRADE_TAKEN:    { label: "✅ Trade Taken",   color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  WINDOW_CLOSED:  { label: "Window Closed",   color: "#374151", bg: "rgba(55,65,81,0.1)"    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getESTHour(): { hour: number; minute: number; phase: ORBPhase } {
  const now = new Date();
  // EST = UTC-5, EDT = UTC-4. Use fixed -5 offset for simplicity
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const est = new Date(utc + -5 * 3600000);
  const h = est.getHours();
  const m = est.getMinutes();

  let phase: ORBPhase = "PRE_MARKET";
  if (h < 9 || (h === 9 && m < 30)) phase = "PRE_MARKET";
  else if (h === 9 && m < 45) phase = "BUILDING";
  else if (h < 14) phase = "RANGE_SET";
  else phase = "WINDOW_CLOSED";

  return { hour: h, minute: m, phase };
}

function calcORB(high: number, low: number, current: number, price: number) {
  const range = high - low;
  const rangePct = (range / price) * 100;
  return { range, rangePct };
}

function calcLevels(direction: "LONG" | "SHORT", entry: number, orbHigh: number, orbLow: number) {
  const range = orbHigh - orbLow;
  if (direction === "LONG") {
    const stop = orbLow - range * 0.1;
    const risk = entry - stop;
    return {
      stop: +stop.toFixed(2),
      target1: +(entry + risk * 2).toFixed(2),
      target2: +(entry + risk * 3).toFixed(2),
      rr: 2,
    };
  } else {
    const stop = orbHigh + range * 0.1;
    const risk = stop - entry;
    return {
      stop: +stop.toFixed(2),
      target1: +(entry - risk * 2).toFixed(2),
      target2: +(entry - risk * 3).toFixed(2),
      rr: 2,
    };
  }
}

function formatPrice(n: number, symbol: string): string {
  if (["US30", "NAS100", "SPX500"].includes(symbol)) return n.toFixed(1);
  return n.toFixed(2);
}

// ─── ORB Clock ────────────────────────────────────────────────────────────────

function ORBClock() {
  const [time, setTime] = useState(() => getESTHour());

  useEffect(() => {
    const t = setInterval(() => setTime(getESTHour()), 30000);
    return () => clearInterval(t);
  }, []);

  const { hour, minute, phase } = time;
  const padded = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} EST`;

  let message = "";
  let progress = 0;
  if (phase === "PRE_MARKET") {
    const minsUntil = (9 * 60 + 30) - (hour * 60 + minute);
    message = minsUntil > 0 ? `Market opens in ${minsUntil} min` : "Opening soon";
    progress = Math.max(0, 100 - (minsUntil / 60) * 100);
  } else if (phase === "BUILDING") {
    const minsIn = (hour * 60 + minute) - (9 * 60 + 30);
    message = `Building range — ${15 - minsIn} min remaining`;
    progress = (minsIn / 15) * 100;
  } else if (phase === "WINDOW_CLOSED") {
    message = "ORB window closed for today";
    progress = 100;
  } else {
    const minsIn = (hour * 60 + minute) - (9 * 60 + 45);
    const windowMins = (14 * 60) - (9 * 60 + 45);
    message = minsIn < 105 ? `Peak window: ${105 - minsIn} min left (9:45–11:30 AM)` : "Extended window active";
    progress = Math.min(100, (minsIn / windowMins) * 100);
  }

  const cfg = PHASE_CONFIG[phase];

  return (
    <div className="p-4 rounded-xl border flex items-center gap-4" style={{ background: cfg.bg, borderColor: cfg.color + "50" }}>
      <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: cfg.color + "22" }}>
        <Clock className="w-6 h-6" style={{ color: cfg.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-white font-mono font-bold text-lg">{padded}</span>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.color + "22", color: cfg.color }}>{cfg.label}</span>
        </div>
        <p className="text-xs text-gray-400">{message}</p>
        <Progress value={progress} className="h-1 mt-1.5" style={{ "--progress-color": cfg.color } as any} />
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-[9px] text-gray-600 uppercase tracking-wider">ORB Window</p>
        <p className="text-xs font-semibold text-gray-400">9:45–2:00 PM</p>
      </div>
    </div>
  );
}

// ─── ORB Range Bar ────────────────────────────────────────────────────────────

function ORBRangeBar({ setup }: { setup: ORBSetup }) {
  const { orbHigh, orbLow, orbRange, currentPrice, phase, symbol } = setup;

  // Extend display 20% above/below range for context
  const pad = orbRange * 0.5;
  const displayLow = orbLow - pad;
  const displayHigh = orbHigh + pad;
  const total = displayHigh - displayLow;

  const pct = (v: number) => ((v - displayLow) / total) * 100;
  const currentPct = Math.max(1, Math.min(99, pct(currentPrice)));
  const highPct = pct(orbHigh);
  const lowPct = pct(orbLow);
  const rangePct = highPct - lowPct;

  const isLong = phase === "BREAKOUT_LONG" || phase === "RETEST_LONG";
  const isShort = phase === "BREAKOUT_SHORT" || phase === "RETEST_SHORT";

  return (
    <div className="mt-3">
      <div className="relative h-10 rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.04)" }}>
        {/* ORB zone */}
        <div
          className="absolute h-full"
          style={{
            left: `${lowPct}%`,
            width: `${rangePct}%`,
            background: "rgba(245,158,11,0.18)",
            borderLeft: "2px solid rgba(245,158,11,0.7)",
            borderRight: "2px solid rgba(245,158,11,0.7)",
          }}
        />
        {/* ORB labels */}
        <div className="absolute text-[8px] font-bold text-amber-400" style={{ left: `${lowPct + 1}%`, top: "2px" }}>ORB L</div>
        <div className="absolute text-[8px] font-bold text-amber-400" style={{ left: `${highPct - 6}%`, top: "2px" }}>ORB H</div>

        {/* Current price line */}
        <div
          className="absolute h-full w-0.5 transition-all duration-500"
          style={{
            left: `${currentPct}%`,
            background: isLong ? "#22c55e" : isShort ? "#ef4444" : "#ffffff88",
          }}
        />
        {/* Price label */}
        <div
          className="absolute text-[9px] font-black -translate-x-1/2 top-1"
          style={{
            left: `${currentPct}%`,
            color: isLong ? "#22c55e" : isShort ? "#ef4444" : "#e5e7eb",
          }}
        >
          {formatPrice(currentPrice, symbol)}
        </div>

        {/* Stop / Target markers */}
        {setup.stopLoss && (
          <div className="absolute h-full border-l border-red-500 border-dashed opacity-60"
            style={{ left: `${pct(setup.stopLoss)}%` }}>
            <span className="text-[7px] text-red-400 absolute bottom-0.5 left-1">SL</span>
          </div>
        )}
        {setup.target1 && (
          <div className="absolute h-full border-l border-green-400 border-dashed opacity-60"
            style={{ left: `${Math.max(1, Math.min(99, pct(setup.target1)))}%` }}>
            <span className="text-[7px] text-green-400 absolute bottom-0.5 left-1">T1</span>
          </div>
        )}
      </div>

      <div className="flex justify-between text-[9px] text-gray-500 mt-1 px-1">
        <span>{formatPrice(orbLow, symbol)}</span>
        <span className="text-amber-400 font-semibold">Range: {formatPrice(orbRange, symbol)} ({setup.orbRangePct.toFixed(2)}%)</span>
        <span>{formatPrice(orbHigh, symbol)}</span>
      </div>
    </div>
  );
}

// ─── Webhook Fire Button ──────────────────────────────────────────────────────

function WebhookFireButton({ setup }: { setup: ORBSetup }) {
  const { toast } = useToast();
  const canFire = (setup.aiScore ?? 0) >= 70 && (setup.phase === "RETEST_LONG" || setup.phase === "RETEST_SHORT") && !setup.tradeTaken;

  const fireMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/orb/fire-webhook", {
        symbol: setup.symbol,
        direction: setup.tradeDirection,
        entry: setup.entryPrice,
        stop: setup.stopLoss,
        target1: setup.target1,
        target2: setup.target2,
        rr: setup.riskReward,
        orbHigh: setup.orbHigh,
        orbLow: setup.orbLow,
        orbRange: setup.orbRange,
        orbRangePct: setup.orbRangePct,
        aiScore: setup.aiScore,
        pattern: setup.pattern,
        phase: setup.phase,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Webhook failed" }));
        throw new Error(err.error || "Webhook failed");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `🚀 Webhook fired — ${setup.symbol} ${setup.tradeDirection}`,
        description: `Signal sent to your connected webhooks. Score: ${setup.aiScore}/100`,
      });
    },
    onError: (err: Error) => {
      toast({ title: "Webhook failed", description: err.message, variant: "destructive" });
    },
  });

  if (!canFire) {
    return (
      <div className="mt-2 p-2 rounded-lg text-center text-[10px] text-gray-600" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
        {setup.aiScore !== undefined && setup.aiScore < 70
          ? `⚠️ Score ${setup.aiScore}/100 — need 70+ to fire webhook`
          : setup.tradeTaken
          ? "✅ Trade already logged — webhook fired"
          : "Run SS AI Bot and reach retest phase to enable auto-signal"}
      </div>
    );
  }

  return (
    <Button
      className="w-full mt-2 h-9 text-xs font-bold"
      style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", color: "white" }}
      onClick={() => fireMutation.mutate()}
      disabled={fireMutation.isPending}
    >
      {fireMutation.isPending
        ? <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> Firing…</>
        : <><Send className="w-3.5 h-3.5 mr-2" /> Fire Webhook Signal ({setup.aiScore}/100)</>}
    </Button>
  );
}

// ─── SS AI Bot Panel ──────────────────────────────────────────────────────────

function SSAIBotPanel({
  setup,
  onAnalyze,
  isLoading,
}: {
  setup: ORBSetup;
  onAnalyze: () => void;
  isLoading: boolean;
}) {
  const score = setup.aiScore ?? 0;
  const checks = setup.aiChecks ?? [];
  const passing = checks.filter(c => c.pass).length;
  const total = checks.length;

  const scoreColor = score >= 70 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";
  const verdict = score >= 70 ? "TAKE TRADE" : score >= 60 ? "MARGINAL — CAUTION" : "PASS — SKIP THIS";
  const verdictColor = score >= 70 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444";

  return (
    <Card className="bg-white/[0.03] border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)" }}>
            <Radio className="w-4 h-4 text-purple-400" />
          </div>
          <span>SS AI Bot — 2nd Confirmation</span>
          {setup.aiScore !== undefined && (
            <span className="ml-auto text-xs font-black" style={{ color: scoreColor }}>{score}/100</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {setup.aiScore === undefined ? (
          <div className="text-center py-6">
            <Radio className="w-10 h-10 mx-auto mb-2 text-purple-400 opacity-50" />
            <p className="text-sm text-gray-400 mb-3">AI not yet analyzed this setup</p>
            <p className="text-xs text-gray-600 mb-4">Set your ORB range and current price first, then run the SS AI Bot for a second confirmation signal.</p>
            <Button
              onClick={onAnalyze}
              disabled={isLoading || !setup.orbHigh || !setup.currentPrice}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isLoading ? (
                <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" /> Analyzing…</>
              ) : (
                <><Zap className="w-3.5 h-3.5 mr-2" /> Run SS AI Bot</>
              )}
            </Button>
          </div>
        ) : (
          <>
            {/* Score gauge */}
            <div className="flex items-center gap-4 p-3 rounded-xl" style={{ background: scoreColor + "12", border: `1px solid ${scoreColor}30` }}>
              <div className="text-center flex-shrink-0">
                <div className="text-3xl font-black" style={{ color: scoreColor }}>{score}</div>
                <div className="text-[9px] text-gray-500 uppercase tracking-widest">Score</div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-black" style={{ color: verdictColor }}>{verdict}</div>
                <div className="text-xs text-gray-400 mt-0.5">{passing}/{total} checks passing</div>
                <Progress value={(passing / total) * 100} className="h-1.5 mt-1" />
              </div>
            </div>

            {/* Checks */}
            <div className="space-y-1.5">
              {checks.map((c, i) => (
                <div key={i} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: c.pass ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)" }}>
                  {c.pass
                    ? <CheckCircle2 className="w-3.5 h-3.5 text-green-400 flex-shrink-0 mt-0.5" />
                    : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold" style={{ color: c.pass ? "#86efac" : "#fca5a5" }}>{c.label}</p>
                    <p className="text-[10px] text-gray-400 leading-snug">{c.note}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* AI Note */}
            {setup.aiNote && (
              <div className="p-3 rounded-lg text-xs text-gray-300 leading-relaxed" style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-purple-400 mb-1">SS AI Bot Note</p>
                {setup.aiNote}
              </div>
            )}

            <Button variant="outline" size="sm" onClick={onAnalyze} disabled={isLoading} className="w-full text-xs border-white/10 text-gray-400">
              {isLoading ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1.5" />}
              Re-analyze
            </Button>

            {/* Webhook auto-signal — fires to MT5/TradingView when score ≥ 70 */}
            <WebhookFireButton setup={setup} />

            {(setup.aiScore ?? 0) >= 70 && (
              <p className="text-[9px] text-center text-gray-600 mt-1">
                Webhook fires to all your active <a href="/webhooks" className="text-indigo-400 underline">configured webhooks</a> with the full ORB signal payload.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Setup Card ───────────────────────────────────────────────────────────────

function SetupCard({
  setup,
  onUpdate,
  onRemove,
  onTakeTrade,
  onAnalyze,
  isAnalyzing,
  onToggleAuto,
  onSetStopOrder,
}: {
  setup: ORBSetup;
  onUpdate: (id: string, patch: Partial<ORBSetup>) => void;
  onRemove: (id: string) => void;
  onTakeTrade: (id: string) => void;
  onAnalyze: (setup: ORBSetup) => void;
  isAnalyzing: boolean;
  onToggleAuto: (id: string) => void;
  onSetStopOrder: (setup: ORBSetup) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    orbHigh: setup.orbHigh?.toString() || "",
    orbLow: setup.orbLow?.toString() || "",
    currentPrice: setup.currentPrice?.toString() || "",
    pattern: setup.pattern || "",
    preMarketBias: setup.preMarketBias || "neutral",
    breakoutCandle: setup.breakoutCandle || "6min",
  });

  const cfg = PHASE_CONFIG[setup.phase];

  function applyForm() {
    const high = parseFloat(form.orbHigh);
    const low = parseFloat(form.orbLow);
    const curr = parseFloat(form.currentPrice);
    if (!high || !low || !curr || high <= low) {
      toast({ title: "Invalid values", description: "High must be > Low, all fields required", variant: "destructive" });
      return;
    }
    const range = high - low;
    const rangePct = (range / curr) * 100;
    let phase: ORBPhase = setup.phase;

    // Auto-detect phase from current price vs range
    if (curr > high * 1.001) phase = "BREAKOUT_LONG";
    else if (curr < low * 0.999) phase = "BREAKOUT_SHORT";
    else if (curr >= high * 0.998 && curr <= high * 1.002 && setup.phase === "BREAKOUT_LONG") phase = "RETEST_LONG";
    else if (curr >= low * 0.998 && curr <= low * 1.002 && setup.phase === "BREAKOUT_SHORT") phase = "RETEST_SHORT";
    else phase = "RANGE_SET";

    // Auto-calc levels
    let direction: "LONG" | "SHORT" | undefined;
    let levels = {};
    if (phase === "BREAKOUT_LONG" || phase === "RETEST_LONG") {
      direction = "LONG";
      levels = calcLevels("LONG", curr, high, low);
    } else if (phase === "BREAKOUT_SHORT" || phase === "RETEST_SHORT") {
      direction = "SHORT";
      levels = calcLevels("SHORT", curr, high, low);
    }

    onUpdate(setup.id, {
      orbHigh: high, orbLow: low, currentPrice: curr,
      orbRange: range, orbRangePct: rangePct,
      pattern: form.pattern,
      preMarketBias: form.preMarketBias as any,
      breakoutCandle: form.breakoutCandle as any,
      phase,
      tradeDirection: direction,
      entryPrice: direction ? curr : undefined,
      ...levels,
      lastUpdated: new Date().toLocaleTimeString(),
      // Clear AI on price update
      aiScore: undefined, aiChecks: undefined, aiNote: undefined,
    });
    setEditing(false);
    toast({ title: `${setup.symbol} updated`, description: `Phase: ${PHASE_CONFIG[phase].label}` });
  }

  const isRetest = setup.phase === "RETEST_LONG" || setup.phase === "RETEST_SHORT";
  const isBreakout = setup.phase === "BREAKOUT_LONG" || setup.phase === "BREAKOUT_SHORT";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="rounded-2xl border overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0e1f, #0d1229)", borderColor: cfg.color + "40" }}
    >
      {/* Card Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-black text-lg">{setup.symbol}</span>
            {setup.tradeDirection === "LONG"
              ? <ArrowUpRight className="w-4 h-4 text-green-400" />
              : setup.tradeDirection === "SHORT"
              ? <ArrowDownRight className="w-4 h-4 text-red-400" />
              : <Minus className="w-4 h-4 text-gray-600" />}
            <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</span>
            {isRetest && <span className="text-[9px] font-black px-1.5 py-0.5 rounded-full animate-pulse" style={{ background: "rgba(34,197,94,0.25)", color: "#22c55e", border: "1px solid #22c55e50" }}>ENTRY ZONE</span>}
            {(setup.tradeCount ?? 0) > 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                {setup.tradeCount}× today
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            {setup.lastUpdated && <p className="text-[9px] text-gray-600">Updated {setup.lastUpdated}</p>}
            {setup.autoMode && setup.mt5Status && !setup.tlStatus && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                style={{
                  background: setup.mt5Status === "connected" ? "rgba(34,197,94,0.2)" : setup.mt5Status === "error" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                  color: setup.mt5Status === "connected" ? "#4ade80" : setup.mt5Status === "error" ? "#f87171" : "#fbbf24",
                  border: `1px solid ${setup.mt5Status === "connected" ? "#22c55e40" : setup.mt5Status === "error" ? "#ef444440" : "#f59e0b40"}`,
                }}>
                {setup.mt5Status === "connected" ? "⚡ MT5 LIVE" : setup.mt5Status === "error" ? "⚠ MT5 ERR" : setup.mt5Status === "no_data" ? "📡 NO DATA" : "⏳ MT5 SYNC"}
              </span>
            )}
            {setup.autoMode && setup.tlStatus && (
              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full animate-pulse"
                style={{
                  background: setup.tlStatus === "connected" ? "rgba(168,85,247,0.2)" : setup.tlStatus === "error" ? "rgba(239,68,68,0.2)" : "rgba(245,158,11,0.2)",
                  color: setup.tlStatus === "connected" ? "#c084fc" : setup.tlStatus === "error" ? "#f87171" : "#fbbf24",
                  border: `1px solid ${setup.tlStatus === "connected" ? "#a855f740" : setup.tlStatus === "error" ? "#ef444440" : "#f59e0b40"}`,
                }}>
                {setup.tlStatus === "connected" ? "⚡ TL LIVE" : setup.tlStatus === "error" ? "⚠ TL ERR" : setup.tlStatus === "no_data" ? "📡 NO DATA" : "⏳ TL SYNC"}
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onToggleAuto(setup.id)}
            title={setup.autoMode ? "Disable Auto-Fill" : "Enable Auto-Fill (uses selected data source)"}
            className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
            style={{
              background: setup.autoMode ? "rgba(34,197,94,0.2)" : "rgba(255,255,255,0.05)",
              border: setup.autoMode ? "1px solid rgba(34,197,94,0.4)" : "1px solid transparent",
              color: setup.autoMode ? "#4ade80" : "#6b7280",
            }}>
            <Activity className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setEditing(!editing)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-white transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => onRemove(setup.id)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-red-400 transition-colors"
            style={{ background: "rgba(255,255,255,0.05)" }}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Range Bar */}
      {setup.orbHigh > 0 && (
        <div className="px-4">
          <ORBRangeBar setup={setup} />
        </div>
      )}

      {/* Edit Form */}
      <AnimatePresence>
        {editing && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4 border-t border-white/5">
              {/* MT5 auto mode banner */}
              {setup.autoMode ? (
                <div className="p-3 rounded-xl text-xs leading-relaxed" style={{ background: "rgba(34,197,94,0.07)", border: "1px solid rgba(34,197,94,0.3)" }}>
                  <p className="text-green-400 font-bold mb-1">⚡ MT5 Auto-Fill is ON</p>
                  <p className="text-gray-300">Your MT5 connection is feeding live data. ORB High/Low and current price update automatically every 30 seconds — no manual entry needed. The system will auto-detect phases and run the SS AI Bot when a retest is detected.</p>
                  <p className="text-gray-500 text-[10px] mt-1">You can still manually override values below. Click the green ⚡ button on the card to disable auto-fill.</p>
                </div>
              ) : (
                <div className="p-3 rounded-xl text-xs leading-relaxed" style={{ background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <p className="text-amber-300 font-bold mb-1.5">📋 How to fill this in:</p>
                  <p className="text-[10px] text-green-400 mb-1.5">💡 <strong>Tip:</strong> If your MT5 is connected and sending live data, tap the <span className="text-green-400">⚡ activity icon</span> in the card header to enable auto-fill — no manual entry needed!</p>
                  <ol className="space-y-1 text-gray-300 list-decimal list-inside">
                    <li>Open your chart (MT5, TradingView, etc.) on the <strong className="text-white">{setup.symbol}</strong> pair</li>
                    <li>Switch to the <strong className="text-white">15-minute</strong> timeframe</li>
                    <li>Find the <strong className="text-amber-300">first completed candle</strong> after 9:30 AM EST (the 9:30–9:45 candle)</li>
                    <li>Enter its <strong className="text-white">High</strong> as "ORB HIGH" and <strong className="text-white">Low</strong> as "ORB LOW"</li>
                    <li>Enter where price is <strong className="text-white">right now</strong> as "CURRENT PRICE"</li>
                    <li>Hit <strong className="text-indigo-300">Apply</strong> — the system auto-detects your phase</li>
                  </ol>
                </div>
              )}

              {/* Price inputs */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Step 1 — Enter the Opening Range</p>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[9px] text-amber-400 mb-1 block font-bold">ORB HIGH ↑</Label>
                    <Input value={form.orbHigh} onChange={e => setForm(f => ({ ...f, orbHigh: e.target.value }))}
                      placeholder="e.g. 39250" className="bg-white/5 border-amber-500/30 text-xs h-9 text-white" />
                    <p className="text-[8px] text-gray-600 mt-0.5">High of 9:30–9:45 candle</p>
                  </div>
                  <div>
                    <Label className="text-[9px] text-amber-400 mb-1 block font-bold">ORB LOW ↓</Label>
                    <Input value={form.orbLow} onChange={e => setForm(f => ({ ...f, orbLow: e.target.value }))}
                      placeholder="e.g. 39150" className="bg-white/5 border-amber-500/30 text-xs h-9 text-white" />
                    <p className="text-[8px] text-gray-600 mt-0.5">Low of 9:30–9:45 candle</p>
                  </div>
                  <div>
                    <Label className="text-[9px] text-cyan-400 mb-1 block font-bold">CURRENT PRICE</Label>
                    <Input value={form.currentPrice} onChange={e => setForm(f => ({ ...f, currentPrice: e.target.value }))}
                      placeholder="e.g. 39310" className="bg-white/5 border-cyan-500/30 text-xs h-9 text-white" />
                    <p className="text-[8px] text-gray-600 mt-0.5">Where price is right now</p>
                  </div>
                </div>
              </div>

              {/* Context inputs */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Step 2 — Add Context</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[9px] text-gray-400 mb-1 block">PRE-MARKET BIAS</Label>
                    <select value={form.preMarketBias} onChange={e => setForm(f => ({ ...f, preMarketBias: e.target.value as 'bullish' | 'bearish' | 'neutral' }))}
                      className="w-full bg-[#0f1525] border border-white/10 text-white rounded-md text-xs h-9 px-2">
                      <option value="bullish">📈 Bullish — Gapped Up pre-market</option>
                      <option value="bearish">📉 Bearish — Gapped Down pre-market</option>
                      <option value="neutral">➡️ Neutral — Flat / no clear bias</option>
                    </select>
                    <p className="text-[8px] text-gray-600 mt-0.5">Check pre-market futures before 9:30 AM</p>
                  </div>
                  <div>
                    <Label className="text-[9px] text-gray-400 mb-1 block">BREAKOUT CANDLE TIMEFRAME</Label>
                    <select value={form.breakoutCandle} onChange={e => setForm(f => ({ ...f, breakoutCandle: e.target.value as '1min' | '6min' }))}
                      className="w-full bg-[#0f1525] border border-white/10 text-white rounded-md text-xs h-9 px-2">
                      <option value="6min">6-Minute ✅ VEDD Standard (recommended)</option>
                      <option value="1min">1-Minute ⚠️ Aggressive (more false signals)</option>
                    </select>
                    <p className="text-[8px] text-gray-600 mt-0.5">The candle that must close outside the range</p>
                  </div>
                </div>
              </div>

              {/* Pattern — only relevant at retest */}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Step 3 — Pattern on Retest (fill in when price returns to ORB level)</p>
                <select value={form.pattern} onChange={e => setForm(f => ({ ...f, pattern: e.target.value }))}
                  className="w-full bg-[#0f1525] border border-white/10 text-white rounded-md text-xs h-9 px-2">
                  <option value="">Not at retest yet — leave blank for now</option>
                  {CANDLESTICK_PATTERNS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                <p className="text-[8px] text-gray-600 mt-0.5">
                  Look for this pattern on your 6-min chart when price touches back to the ORB level.
                  A Bullish Engulfing or Hammer at the ORB High (long trade) = high confidence entry.
                </p>
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="flex-1 bg-indigo-600 hover:bg-indigo-700 h-9 text-xs font-bold" onClick={applyForm}>
                  ✅ Apply & Auto-Detect Phase
                </Button>
                <Button size="sm" variant="outline" className="border-white/10 text-gray-400 h-9 text-xs" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>

              {/* Phase legend */}
              <div className="p-3 rounded-lg" style={{ background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.2)" }}>
                <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-1.5">What the system auto-detects from your prices:</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] text-gray-400">
                  <span><span className="text-amber-400">●</span> Price inside range → Range Set</span>
                  <span><span className="text-green-400">●</span> Price above ORB High → Breakout Long</span>
                  <span><span className="text-red-400">●</span> Price below ORB Low → Breakout Short</span>
                  <span><span className="text-green-400 font-bold">⚡</span> Price back at ORB High (after breakout) → Retest Long = ENTRY</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Grid */}
      {setup.orbHigh > 0 && (
        <div className="px-4 pb-3 mt-2">
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { label: "ORB H", value: setup.orbHigh, color: "#f59e0b" },
              { label: "ORB L", value: setup.orbLow, color: "#f59e0b" },
              { label: "Stop", value: setup.stopLoss, color: "#ef4444" },
              { label: "T1 (2:1)", value: setup.target1, color: "#22c55e" },
            ].map(({ label, value, color }) => (
              <div key={label} className="p-2 rounded-lg text-center" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <p className="text-[8px] uppercase tracking-wider mb-0.5" style={{ color }}>{label}</p>
                <p className="text-xs font-bold text-white">
                  {value ? formatPrice(value, setup.symbol) : "—"}
                </p>
              </div>
            ))}
          </div>
          {setup.riskReward && (
            <p className="text-center text-[9px] text-gray-500 mt-1.5">
              R:R {setup.riskReward}:1 • Pattern: <span className="text-amber-400">{setup.pattern || "None"}</span>
            </p>
          )}
          {/* MT5 auto-detected bias + pattern badges */}
          {setup.autoMode && (setup.preMarketBias || setup.pattern) && (
            <div className="flex items-center justify-center gap-2 flex-wrap mt-1.5">
              {setup.preMarketBias && (
                <span className="text-[8px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: setup.preMarketBias === "bullish" ? "rgba(34,197,94,0.15)" : setup.preMarketBias === "bearish" ? "rgba(239,68,68,0.15)" : "rgba(107,114,128,0.15)",
                    color: setup.preMarketBias === "bullish" ? "#4ade80" : setup.preMarketBias === "bearish" ? "#f87171" : "#9ca3af",
                    border: `1px solid ${setup.preMarketBias === "bullish" ? "#22c55e30" : setup.preMarketBias === "bearish" ? "#ef444430" : "#6b728030"}`,
                  }}>
                  {setup.preMarketBias === "bullish" ? "📈" : setup.preMarketBias === "bearish" ? "📉" : "➖"} {setup.preMarketBias} bias (MT5)
                </span>
              )}
              {setup.pattern && setup.autoMode && (
                <span className="text-[8px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: "rgba(245,158,11,0.12)", color: "#fbbf24", border: "1px solid rgba(245,158,11,0.25)" }}>
                  🕯 {setup.pattern} (MT5)
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action buttons */}
      <div className="px-4 pb-2 flex gap-2">
        <Button
          size="sm"
          onClick={() => onAnalyze(setup)}
          disabled={isAnalyzing || !setup.orbHigh}
          className="flex-1 text-xs h-8"
          style={{ background: "rgba(139,92,246,0.2)", border: "1px solid rgba(139,92,246,0.4)", color: "#c4b5fd" }}
        >
          {isAnalyzing ? <RefreshCw className="w-3 h-3 mr-1.5 animate-spin" /> : <Radio className="w-3 h-3 mr-1.5" />}
          SS AI Bot
        </Button>
        {(isRetest || isBreakout) && !setup.tradeTaken && (
          <Button
            size="sm"
            onClick={() => onTakeTrade(setup.id)}
            className="flex-1 text-xs h-8 font-bold"
            style={{
              background: setup.tradeDirection === "LONG"
                ? "linear-gradient(135deg, #16a34a, #15803d)"
                : "linear-gradient(135deg, #dc2626, #b91c1c)",
              color: "white",
            }}
          >
            {setup.tradeDirection === "LONG"
              ? <><ChevronUp className="w-3.5 h-3.5 mr-1" /> Log LONG Entry</>
              : <><ChevronDown className="w-3.5 h-3.5 mr-1" /> Log SHORT Entry</>}
          </Button>
        )}
        {(isRetest || isBreakout) && !setup.tradeTaken && setup.orbHigh > 0 && (
          <Button
            size="sm"
            onClick={() => onSetStopOrder(setup)}
            className="text-xs h-8"
            style={{ background: "rgba(251,191,36,0.15)", border: "1px solid rgba(251,191,36,0.35)", color: "#fbbf24" }}
          >
            <Target className="w-3 h-3 mr-1.5" />
            Stop Order
          </Button>
        )}
        {setup.tradeTaken && (
          <div className="flex-1 flex items-center justify-center gap-1.5 rounded-lg text-xs font-semibold text-purple-300"
            style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.3)" }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> Trade Logged
          </div>
        )}
      </div>

      {/* Webhook signal row — visible when SS AI Bot score ≥ 70 */}
      {(setup.aiScore ?? 0) >= 70 && !setup.tradeTaken && (
        <div className="px-4 pb-4">
          <WebhookFireButton setup={setup} />
        </div>
      )}
      {/* AI score badge when analyzed */}
      {setup.aiScore !== undefined && (setup.aiScore ?? 0) < 70 && (
        <div className="px-4 pb-3">
          <div className="text-center text-[9px] py-1.5 rounded-lg"
            style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5" }}>
            SS AI Bot: {setup.aiScore}/100 — Score 70+ required to fire webhook
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ─── Stop Order Modal ─────────────────────────────────────────────────────────

function StopOrderModal({
  setup,
  open,
  onClose,
}: {
  setup: ORBSetup | null;
  open: boolean;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [lotSize, setLotSize] = useState("0.01");

  const isLong = setup?.tradeDirection === "LONG";
  const direction = isLong ? "BUY_STOP" : "SELL_STOP";
  const triggerPrice = setup?.entryPrice || (isLong ? setup?.orbHigh : setup?.orbLow) || 0;
  const stopLoss = setup?.stopLoss || 0;
  const breakoutLevel = isLong ? setup?.orbHigh : setup?.orbLow;

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/stop-orders", {
        symbol: setup?.symbol,
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
      toast({ title: "Stop Order placed!", description: `${setup?.symbol} ${direction} @ ${triggerPrice}` });
      onClose();
    },
    onError: () => {
      toast({ title: "Failed to place stop order", variant: "destructive" });
    },
  });

  if (!setup) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-gray-950 border-white/10 text-white max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            Set Stop Order — {setup.symbol}
          </DialogTitle>
        </DialogHeader>
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
              <div className="mt-1 px-3 py-2 rounded-lg text-sm font-bold text-white bg-white/5">
                {setup.symbol}
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-400">Trigger Price</Label>
              <div className="mt-1 px-3 py-2 rounded-lg text-sm text-white bg-white/5">{triggerPrice}</div>
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
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick Start Guide ────────────────────────────────────────────────────────

function ORBQuickGuide() {
  const [open, setOpen] = useState(false);

  const steps = [
    {
      n: 1, time: "9:25 AM", color: "#6366f1", title: "Pre-Market Prep",
      what: "Before the open, check pre-market futures for bias.",
      how: "If US30 futures are up 150+ pts pre-market → Bullish bias. Down 150+ → Bearish. Flat → Neutral.",
      action: "Set pre-market bias in the setup card when you add your instrument.",
    },
    {
      n: 2, time: "9:30–9:45 AM", color: "#f59e0b", title: "Build the Opening Range",
      what: "Watch the FIRST 15-minute candle after the NYSE open.",
      how: "On your chart (MT5 or TradingView), switch to 15-min timeframe. The candle from 9:30 to 9:45 AM EST defines your range. Its HIGH is your ORB High. Its LOW is your ORB Low.",
      action: "After 9:45 AM when the candle closes → tap the ↻ icon on the card → enter ORB High and ORB Low. OR if your MT5 is connected, tap the ⚡ icon to enable Auto-Fill — the system reads your live MT5 data automatically.",
    },
    {
      n: 3, time: "9:45 AM+", color: "#06b6d4", title: "Watch for Breakout on 6-Min Chart",
      what: "Switch to the 6-MINUTE chart. Watch for price to close OUTSIDE the range.",
      how: "LONG signal: a 6-min candle body closes ABOVE ORB High (wicks don't count — must be a full close).\nSHORT signal: a 6-min candle body closes BELOW ORB Low.\nUpdate current price in the card — system auto-detects the breakout phase.",
      action: "Tap ↻ on card → update current price → tap Apply. Phase will change to 🚀 Breakout.",
    },
    {
      n: 4, time: "After breakout", color: "#22c55e", title: "Wait for the Retest (Your Entry Zone)",
      what: "After breakout, DO NOT chase. Wait for price to pull back to the broken level.",
      how: "For LONG trades: after price breaks above ORB High, wait for it to come back DOWN and tap the ORB High level from above. This ORB High is now support.\nFor SHORT trades: after price breaks below ORB Low, wait for it to bounce back UP to ORB Low from below.\nUpdate current price when this happens → phase changes to ⚡ Retest.",
      action: "Update current price on card. Look at your 6-min chart for a confirming candle pattern at that level.",
    },
    {
      n: 5, time: "At the retest", color: "#a855f7", title: "Confirm Pattern + Run SS AI Bot",
      what: "You need a confirming candlestick pattern on the 6-min chart AT the retest level.",
      how: "Look for: Bullish Engulfing, Hammer, Pin Bar (for longs) — or Bearish Engulfing, Shooting Star (for shorts). Select it in the Pattern dropdown on the card.\nThen tap 'SS AI Bot' — it scores the setup 0–100. You need 70+ to take the trade.",
      action: "Select pattern in card → tap SS AI Bot → wait for score.",
    },
    {
      n: 6, time: "Score 70+", color: "#22c55e", title: "Enter the Trade + Log It",
      what: "SS AI Bot scored 70+? Now enter the trade manually in your broker/MT5.",
      how: "Your stop loss, T1 (2:1 R:R), and T2 (3:1 R:R) are auto-calculated and shown on the card.\nPlace your trade in MT5 or your broker at the current retest price.\nOptional: tap 'Fire Webhook Signal' to auto-notify any connected EA/bot.\nRemember: ONE trade per instrument per day — after this, that pair is done.",
      action: "Tap 'Log LONG/SHORT Entry' to record the trade. Card locks for the day.",
    },
  ];

  return (
    <div className="mb-4 rounded-2xl border overflow-hidden" style={{ borderColor: "rgba(99,102,241,0.3)", background: "rgba(99,102,241,0.04)" }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center gap-3 text-left"
      >
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "rgba(99,102,241,0.2)" }}>
          <BookOpen className="w-4 h-4 text-indigo-400" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">📖 How to Use the ORB Scanner — Step-by-Step</p>
          <p className="text-[10px] text-gray-500">Tap to {open ? "hide" : "show"} the 6-step setup guide</p>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-white/5">
              <p className="text-xs text-gray-500 pt-3">
                This scanner helps you identify, track, and confirm ORB trade setups. <strong className="text-white">You still place trades manually in your broker</strong> — this tool tells you when the setup is ready.
              </p>

              {steps.map(step => (
                <div key={step.n} className="flex gap-3">
                  {/* Step number + time */}
                  <div className="flex-shrink-0 flex flex-col items-center">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black"
                      style={{ background: step.color + "25", color: step.color, border: `1.5px solid ${step.color}50` }}>
                      {step.n}
                    </div>
                    {step.n < 6 && <div className="w-px flex-1 mt-1" style={{ background: step.color + "30", minHeight: 16 }} />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-black text-white">{step.title}</span>
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: step.color + "20", color: step.color }}>{step.time}</span>
                    </div>
                    <p className="text-[11px] text-gray-300 leading-relaxed mb-1">{step.what}</p>
                    <div className="p-2 rounded-lg mb-1.5" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="text-[10px] text-gray-400 leading-relaxed whitespace-pre-line">{step.how}</p>
                    </div>
                    <p className="text-[10px] font-semibold" style={{ color: step.color }}>
                      → {step.action}
                    </p>
                  </div>
                </div>
              ))}

              {/* Phase cheat sheet */}
              <div className="mt-2 p-3 rounded-xl" style={{ background: "rgba(245,158,11,0.06)", border: "1px solid rgba(245,158,11,0.2)" }}>
                <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wider mb-2">Phase Status Cheat Sheet</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(PHASE_CONFIG).map(([key, cfg]) => (
                    <div key={key} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cfg.color }} />
                      <span className="text-[9px] text-gray-400"><span style={{ color: cfg.color }}>{cfg.label}</span></span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Add Instrument Modal ─────────────────────────────────────────────────────

function AddInstrumentModal({
  open, onClose, onAdd,
}: { open: boolean; onClose: () => void; onAdd: (symbol: string) => void }) {
  const [custom, setCustom] = useState("");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0d1229] border-white/10 max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-white">Add Instrument</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-gray-400">Select a preset or enter any ticker/pair</p>
          <div className="grid grid-cols-2 gap-2">
            {DEFAULT_INSTRUMENTS.map(inst => (
              <button
                key={inst.symbol}
                onClick={() => { onAdd(inst.symbol); onClose(); }}
                className="p-2.5 rounded-xl text-left border hover:bg-white/5 transition-colors"
                style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.08)" }}
              >
                <p className="text-sm font-bold text-white">{inst.symbol}</p>
                <p className="text-[9px] text-gray-500">{inst.type}</p>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              value={custom}
              onChange={e => setCustom(e.target.value.toUpperCase())}
              placeholder="Custom: NVDA, MSFT, UK100…"
              className="bg-white/5 border-white/10 text-sm"
              onKeyDown={e => { if (e.key === "Enter" && custom) { onAdd(custom); onClose(); setCustom(""); } }}
            />
            <Button onClick={() => { if (custom) { onAdd(custom); onClose(); setCustom(""); } }}>Add</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── ORB Education Panel ──────────────────────────────────────────────────────

function ORBEducation() {
  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl border" style={{ background: "rgba(6,182,212,0.06)", borderColor: "rgba(6,182,212,0.2)" }}>
        <div className="flex items-center gap-2 mb-2">
          <BookOpen className="w-4 h-4 text-cyan-400" />
          <p className="text-sm font-bold text-white">VEDD ORB Methodology — 9:30 Breakout</p>
        </div>
        <div className="space-y-3 text-xs text-gray-300 leading-relaxed">
          <p><span className="text-amber-400 font-semibold">Step 1 — Build the Range (9:30–9:45 AM EST):</span> Watch the first full 15-minute candle after the NYSE open. The <strong className="text-white">high</strong> and <strong className="text-white">low</strong> of this candle define your Opening Range. This is where the institutional "intent" of the day is established.</p>
          <p><span className="text-cyan-400 font-semibold">Step 2 — Wait for 6-Min Breakout Candle:</span> After 9:45 AM, switch to the 6-minute chart. A valid breakout requires a <strong className="text-white">full-body candle close</strong> above the ORB High (bullish) or below the ORB Low (bearish). A wick pierce alone does NOT qualify — you need the 6-min candle body to close outside the range.</p>
          <p><span className="text-green-400 font-semibold">Step 3 — Wait for the Retest (Your Entry):</span> After breakout, price often pulls back to test the broken level (ORB High becomes support for longs; ORB Low becomes resistance for shorts). This retest is your <strong className="text-white">entry signal</strong>. Look for a confirming candlestick pattern on the 6-min: engulfing, pin bar, inside bar, or hammer.</p>
          <p><span className="text-purple-400 font-semibold">Step 4 — SS AI Bot 2nd Confirmation:</span> Never enter without running the AI bot. It checks 6 criteria including range quality, breakout strength, retest pattern, time window, volume alignment, and pre-market bias. Minimum 70/100 to consider. Skip any setup scoring under 60.</p>
          <p><span className="text-red-400 font-semibold">Step 5 — ONE Trade Per Instrument Per Day:</span> Once a trade is logged for a pair, no more entries that day regardless of additional setups. This rule protects capital and prevents revenge trading.</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { title: "ORB Range Sweet Spot", color: "#f59e0b", points: ["0.3%–2.0% of price (stocks)", "150–600 pts (US30/NAS100)", "Too narrow = false breaks", "Too wide = risk too large"] },
          { title: "Best Trading Windows", color: "#22c55e", points: ["9:45–11:30 AM EST — peak", "11:30 AM–12:00 PM — ok", "12:00–2:00 PM — marginal", "After 2 PM — skip"] },
          { title: "Valid Retest Criteria", color: "#06b6d4", points: ["Price touches ORB level", "Level holds as support/resist", "Confirming pattern on 6-min", "No wick piercing > 50% range"] },
          { title: "Stop & Target Rules", color: "#8b5cf6", points: ["Stop: 10% range below ORB Low", "T1: 2:1 R:R (minimum)", "T2: 3:1 R:R (scale out)", "Move to BE after T1 hit"] },
        ].map(({ title, color, points }) => (
          <div key={title} className="p-3 rounded-xl border" style={{ background: color + "0a", borderColor: color + "30" }}>
            <p className="text-xs font-bold mb-2" style={{ color }}>{title}</p>
            <ul className="space-y-1">
              {points.map((p, i) => (
                <li key={i} className="flex items-center gap-1.5 text-[10px] text-gray-300">
                  <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ background: color }} />
                  {p}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="p-3 rounded-xl border" style={{ background: "rgba(251,191,36,0.05)", borderColor: "rgba(251,191,36,0.2)" }}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-gray-400 leading-relaxed">
            <span className="text-amber-300 font-semibold">Industry Standard Reference:</span> The ORB strategy was popularized by Toby Crabel's 1990 research on short-term trading. The 15-minute version is the most widely used institutional timeframe. VEDD's addition: 6-min breakout confirmation (reduces false signals vs. the raw 1-min), retest-only entry (improves R:R vs. chasing breakouts), and AI 2nd confirmation (removes emotion from the entry decision).
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Daily Trade Log ──────────────────────────────────────────────────────────

function DailyLog({ trades }: { trades: DailyTrade[] }) {
  return (
    <Card className="bg-white/[0.03] border-white/10">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-indigo-400" />
          Today's Trade Log
          <span className="ml-auto text-xs text-gray-500">{trades.length} trade{trades.length !== 1 ? "s" : ""} taken</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {trades.length === 0 ? (
          <div className="py-8 text-center">
            <Activity className="w-8 h-8 mx-auto mb-2 text-gray-700" />
            <p className="text-sm text-gray-600">No trades logged yet today</p>
          </div>
        ) : (
          <div className="space-y-2">
            {trades.map((t, i) => (
              <div key={i} className="p-3 rounded-xl border" style={{
                background: t.direction === "LONG" ? "rgba(34,197,94,0.06)" : "rgba(239,68,68,0.06)",
                borderColor: t.direction === "LONG" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
              }}>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-white font-bold text-sm">{t.symbol}</span>
                  <span className="text-xs font-bold px-1.5 py-0.5 rounded" style={{
                    background: t.direction === "LONG" ? "rgba(34,197,94,0.2)" : "rgba(239,68,68,0.2)",
                    color: t.direction === "LONG" ? "#4ade80" : "#f87171",
                  }}>{t.direction}</span>
                  <span className="text-[9px] text-gray-500 ml-auto">{t.takenAt}</span>
                  {t.result && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{
                      background: t.result === "WIN" ? "rgba(34,197,94,0.2)" : t.result === "LOSS" ? "rgba(239,68,68,0.2)" : "rgba(107,114,128,0.2)",
                      color: t.result === "WIN" ? "#4ade80" : t.result === "LOSS" ? "#f87171" : "#9ca3af",
                    }}>{t.result}</span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { l: "Entry", v: t.entry, c: "#e5e7eb" },
                    { l: "Stop", v: t.stop, c: "#f87171" },
                    { l: "T1 (2:1)", v: t.target1, c: "#4ade80" },
                    { l: "T2 (3:1)", v: t.target2, c: "#86efac" },
                  ].map(({ l, v, c }) => (
                    <div key={l}>
                      <p className="text-[8px] text-gray-600 uppercase">{l}</p>
                      <p className="text-xs font-bold" style={{ color: c }}>{v}</p>
                    </div>
                  ))}
                </div>
                {t.pattern && (
                  <p className="text-[9px] text-amber-400 mt-1.5">Pattern: {t.pattern} • R:R {t.rr}:1</p>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ORBBreakoutPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  // ── Persistent state — survive page reloads via localStorage ────────────
  const [setups, setSetups] = useState<ORBSetup[]>(() => {
    try {
      const saved = localStorage.getItem('orb_setups');
      return saved ? (JSON.parse(saved) as ORBSetup[]) : [];
    } catch { return []; }
  });
  const [dailyTrades, setDailyTrades] = useState<DailyTrade[]>(() => {
    try {
      // Clear trades from previous calendar day automatically
      const savedRaw = localStorage.getItem('orb_daily_trades');
      if (!savedRaw) return [];
      const { date, trades } = JSON.parse(savedRaw) as { date: string; trades: DailyTrade[] };
      const today = new Date().toISOString().slice(0, 10);
      return date === today ? trades : [];
    } catch { return []; }
  });
  const [showAddModal, setShowAddModal] = useState(false);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [ssAISetup, setSSAISetup] = useState<ORBSetup | null>(null);
  const [stopOrderSetup, setStopOrderSetup] = useState<ORBSetup | null>(null);
  const [dataSource, setDataSource] = useState<"mt5" | "tradelocker">(() => {
    return (localStorage.getItem('orb_data_source') as "mt5" | "tradelocker") || "mt5";
  });

  // Multi-Setup Mode — allow a symbol to re-arm after each trade, requiring full SS AI sequence each time
  const [multiSetupMode, setMultiSetupMode] = useState<boolean>(() => {
    try { return localStorage.getItem('orb_multi_setup') === 'true'; } catch { return false; }
  });

  // Persist setups whenever they change
  useEffect(() => {
    try { localStorage.setItem('orb_setups', JSON.stringify(setups)); } catch { /* quota */ }
  }, [setups]);

  // Persist daily trades with today's date so they auto-clear the next day
  useEffect(() => {
    try {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem('orb_daily_trades', JSON.stringify({ date: today, trades: dailyTrades }));
    } catch { /* quota */ }
  }, [dailyTrades]);

  // AI analysis mutation
  const analyzeMutation = useMutation({
    mutationFn: async (setup: ORBSetup) => {
      const res = await apiRequest("POST", "/api/orb/analyze", {
        symbol: setup.symbol,
        orbHigh: setup.orbHigh,
        orbLow: setup.orbLow,
        orbRange: setup.orbRange,
        orbRangePct: setup.orbRangePct,
        currentPrice: setup.currentPrice,
        preMarketBias: setup.preMarketBias,
        phase: setup.phase,
        pattern: setup.pattern,
        breakoutCandle: setup.breakoutCandle,
        tradeDirection: setup.tradeDirection,
      });
      if (!res.ok) throw new Error("AI analysis failed");
      return res.json() as Promise<{ score: number; checks: AICheck[]; note: string; verdict: string }>;
    },
    onSuccess: (data, setup) => {
      setSetups(prev => prev.map(s =>
        s.id === setup.id
          ? { ...s, aiScore: data.score, aiChecks: data.checks, aiNote: data.note }
          : s
      ));
      setSSAISetup(prev => prev?.id === setup.id ? { ...prev, aiScore: data.score, aiChecks: data.checks, aiNote: data.note } : prev);
      setAnalyzingId(null);
      autoAnalyzingRef.current?.delete(setup.id);
      toast({
        title: `SS AI Bot: ${data.verdict}`,
        description: `${setup.symbol} scored ${data.score}/100`,
        variant: data.score >= 70 ? "default" : "destructive",
      });
    },
    onError: (_, setup) => {
      setAnalyzingId(null);
      autoAnalyzingRef.current?.delete(setup.id);
      toast({ title: "AI analysis failed", description: "Check your API key or try again", variant: "destructive" });
    },
  });

  function addInstrument(symbol: string) {
    if (setups.find(s => s.symbol === symbol)) {
      toast({ title: `${symbol} already tracked`, variant: "destructive" });
      return;
    }
    const { phase } = getESTHour();
    const id = `${symbol}_${Date.now()}`;
    setSetups(prev => [...prev, {
      id, symbol,
      orbHigh: 0, orbLow: 0, orbRange: 0, orbRangePct: 0,
      currentPrice: 0,
      preMarketBias: "neutral",
      phase,
      tradeTaken: false,
      lastUpdated: "",
    }]);
  }

  function updateSetup(id: string, patch: Partial<ORBSetup>) {
    setSetups(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    if (ssAISetup?.id === id) setSSAISetup(prev => prev ? { ...prev, ...patch } : null);
  }

  function removeSetup(id: string) {
    setSetups(prev => prev.filter(s => s.id !== id));
    if (ssAISetup?.id === id) setSSAISetup(null);
  }

  function logTrade(id: string) {
    const setup = setups.find(s => s.id === id);
    if (!setup || !setup.tradeDirection || !setup.entryPrice) return;
    const newCount = (setup.tradeCount ?? 0) + 1;
    const trade: DailyTrade = {
      symbol: setup.symbol,
      direction: setup.tradeDirection,
      entry: setup.entryPrice,
      stop: setup.stopLoss!,
      target1: setup.target1!,
      target2: setup.target2!,
      rr: setup.riskReward || 2,
      pattern: setup.pattern || "No pattern",
      takenAt: new Date().toLocaleTimeString(),
      result: "PENDING",
    };
    setDailyTrades(prev => [...prev, trade]);

    if (multiSetupMode) {
      // Re-arm: reset to RANGE_SET so the symbol can pick up another setup
      // The full sequence (breakout → retest → SS AI ≥ 70) is required before the next signal fires
      autoFiredRef.current.delete(id);
      autoAnalyzingRef.current.delete(id);
      updateSetup(id, {
        tradeTaken: false,
        tradeCount: newCount,
        phase: "RANGE_SET",
        aiScore: undefined,
        aiChecks: undefined,
        aiNote: undefined,
      });
      toast({
        title: `✅ Trade #${newCount} logged — ${setup.symbol} re-armed`,
        description: `Entry ${setup.entryPrice} | Stop ${setup.stopLoss} | T1 ${setup.target1} | Watching for next setup…`,
      });
    } else {
      updateSetup(id, { tradeTaken: true, tradeCount: newCount, phase: "TRADE_TAKEN" });
      toast({
        title: `✅ ${setup.symbol} ${setup.tradeDirection} logged!`,
        description: `Entry ${setup.entryPrice} | Stop ${setup.stopLoss} | T1 ${setup.target1}`,
      });
    }
  }

  // Track which setups have already had auto-webhook fired this session (prevent repeated fires)
  const autoFiredRef = useRef<Set<string>>(new Set());
  // Track which setups are currently being auto-analyzed (prevent duplicate AI calls)
  const autoAnalyzingRef = useRef<Set<string>>(new Set());

  // MT5 auto-poll logic
  const pollMT5 = useCallback(async (setup: ORBSetup) => {
    try {
      const res = await apiRequest("GET", `/api/orb/mt5-live/${encodeURIComponent(setup.symbol)}`);
      if (!res.ok) {
        updateSetup(setup.id, { mt5Status: "error" });
        return;
      }
      const data = await res.json() as {
        symbol: string; timeframe: string; currentPrice: number;
        orbHigh: number | null; orbLow: number | null;
        orbRange: number; orbRangePct: number; orbPhase: ORBPhase;
        foundOrbCandle: boolean; lastUpdated: string;
        preMarketBias?: "bullish" | "bearish" | "neutral";
        preMarketDetail?: string;
        detectedPattern?: string | null;
      };

      if (!data.currentPrice) {
        updateSetup(setup.id, { mt5Status: "no_data" });
        return;
      }

      const patch: Partial<ORBSetup> = {
        mt5Status: "connected",
        currentPrice: data.currentPrice,
        lastUpdated: new Date().toLocaleTimeString() + " (MT5)",
      };

      // Auto-fill pre-market bias from MT5 candle history
      if (data.preMarketBias && data.preMarketBias !== "neutral") {
        patch.preMarketBias = data.preMarketBias;
      } else if (data.preMarketBias === "neutral") {
        patch.preMarketBias = "neutral";
      }

      // Auto-fill candlestick pattern detected at current price
      if (data.detectedPattern) {
        patch.pattern = data.detectedPattern;
      }

      // Only update ORB levels if the MT5 data found the 9:30 candle
      if (data.foundOrbCandle && data.orbHigh && data.orbLow) {
        const range = data.orbHigh - data.orbLow;
        const rangePct = (range / data.currentPrice) * 100;
        patch.orbHigh = data.orbHigh;
        patch.orbLow = data.orbLow;
        patch.orbRange = range;
        patch.orbRangePct = rangePct;
      }

      // Auto-detect phase from MT5 price (only if we have valid ORB levels)
      const high = patch.orbHigh ?? setup.orbHigh;
      const low = patch.orbLow ?? setup.orbLow;
      const curr = data.currentPrice;

      if (high > 0 && low > 0) {
        let newPhase: ORBPhase = setup.phase;
        const prevPhase = setup.phase;

        if (curr > high * 1.001 && prevPhase !== "BREAKOUT_LONG" && prevPhase !== "RETEST_LONG" && prevPhase !== "TRADE_TAKEN") {
          newPhase = "BREAKOUT_LONG";
          patch.tradeDirection = "LONG";
          patch.entryPrice = curr;
          const levels = calcLevels("LONG", curr, high, low);
          Object.assign(patch, levels);
          // Reset AI score on new breakout
          patch.aiScore = undefined; patch.aiChecks = undefined; patch.aiNote = undefined;
          autoFiredRef.current.delete(setup.id);
        } else if (curr < low * 0.999 && prevPhase !== "BREAKOUT_SHORT" && prevPhase !== "RETEST_SHORT" && prevPhase !== "TRADE_TAKEN") {
          newPhase = "BREAKOUT_SHORT";
          patch.tradeDirection = "SHORT";
          patch.entryPrice = curr;
          const levels = calcLevels("SHORT", curr, high, low);
          Object.assign(patch, levels);
          patch.aiScore = undefined; patch.aiChecks = undefined; patch.aiNote = undefined;
          autoFiredRef.current.delete(setup.id);
        } else if (curr >= high * 0.998 && curr <= high * 1.002 && (prevPhase === "BREAKOUT_LONG")) {
          newPhase = "RETEST_LONG";
          patch.retestLevel = high;
          patch.entryPrice = curr;
          const levels = calcLevels("LONG", curr, high, low);
          Object.assign(patch, levels);
        } else if (curr >= low * 0.998 && curr <= low * 1.002 && (prevPhase === "BREAKOUT_SHORT")) {
          newPhase = "RETEST_SHORT";
          patch.retestLevel = low;
          patch.entryPrice = curr;
          const levels = calcLevels("SHORT", curr, high, low);
          Object.assign(patch, levels);
        } else if (prevPhase !== "TRADE_TAKEN" && prevPhase !== "WINDOW_CLOSED") {
          // Keep existing breakout/retest phase if still near level; otherwise RANGE_SET
          if (prevPhase !== "BREAKOUT_LONG" && prevPhase !== "BREAKOUT_SHORT" &&
              prevPhase !== "RETEST_LONG" && prevPhase !== "RETEST_SHORT") {
            const { phase: clockPhase } = getESTHour();
            newPhase = clockPhase;
          }
        }

        if (newPhase !== setup.phase && newPhase !== "TRADE_TAKEN") {
          patch.phase = newPhase;
          toast({
            title: `📡 MT5 Auto: ${setup.symbol} → ${PHASE_CONFIG[newPhase].label}`,
            description: `Price ${curr.toFixed(2)} | Auto-updated from MT5`,
          });
        }

        // Auto-run SS AI Bot when retest phase is detected and no AI score yet
        const effectivePhase = patch.phase ?? setup.phase;
        const isRetest = effectivePhase === "RETEST_LONG" || effectivePhase === "RETEST_SHORT";
        if (isRetest && setup.aiScore === undefined && !autoAnalyzingRef.current.has(setup.id) && !setup.tradeTaken) {
          autoAnalyzingRef.current.add(setup.id);
          toast({ title: `🤖 SS AI Bot auto-analyzing ${setup.symbol}…`, description: "Retest detected via MT5 live feed" });
          const updatedSetup: ORBSetup = { ...setup, ...patch };
          setAnalyzingId(setup.id);
          setSSAISetup(updatedSetup);
          analyzeMutation.mutate(updatedSetup);
        }
      }

      updateSetup(setup.id, patch);
    } catch {
      updateSetup(setup.id, { mt5Status: "error" });
    }
  }, [analyzeMutation, toast, updateSetup]);

  // TradeLocker auto-poll logic — mirrors pollMT5 but uses tl-live endpoint
  const pollTL = useCallback(async (setup: ORBSetup) => {
    try {
      const res = await apiRequest("GET", `/api/orb/tl-live/${encodeURIComponent(setup.symbol)}`);
      if (!res.ok) {
        updateSetup(setup.id, { tlStatus: "error" });
        return;
      }
      const data = await res.json() as {
        symbol: string; timeframe: string; currentPrice: number;
        orbHigh: number | null; orbLow: number | null;
        orbRange: number; orbRangePct: number; orbPhase: ORBPhase;
        foundOrbCandle: boolean; lastUpdated: string;
        preMarketBias?: "bullish" | "bearish" | "neutral";
        preMarketDetail?: string;
      };

      if (!data.currentPrice) {
        updateSetup(setup.id, { tlStatus: "no_data" });
        return;
      }

      const patch: Partial<ORBSetup> = {
        tlStatus: "connected",
        currentPrice: data.currentPrice,
        lastUpdated: new Date().toLocaleTimeString() + " (TradeLocker)",
      };

      if (data.preMarketBias) patch.preMarketBias = data.preMarketBias;

      if (data.foundOrbCandle && data.orbHigh && data.orbLow) {
        const range = data.orbHigh - data.orbLow;
        patch.orbHigh = data.orbHigh;
        patch.orbLow = data.orbLow;
        patch.orbRange = range;
        patch.orbRangePct = (range / data.currentPrice) * 100;
      }

      const high = patch.orbHigh ?? setup.orbHigh;
      const low = patch.orbLow ?? setup.orbLow;
      const curr = data.currentPrice;

      if (high > 0 && low > 0) {
        let newPhase: ORBPhase = setup.phase;
        const prevPhase = setup.phase;

        if (curr > high * 1.001 && prevPhase !== "BREAKOUT_LONG" && prevPhase !== "RETEST_LONG" && prevPhase !== "TRADE_TAKEN") {
          newPhase = "BREAKOUT_LONG";
          patch.tradeDirection = "LONG"; patch.entryPrice = curr;
          Object.assign(patch, calcLevels("LONG", curr, high, low));
          patch.aiScore = undefined; patch.aiChecks = undefined; patch.aiNote = undefined;
          autoFiredRef.current.delete(setup.id);
        } else if (curr < low * 0.999 && prevPhase !== "BREAKOUT_SHORT" && prevPhase !== "RETEST_SHORT" && prevPhase !== "TRADE_TAKEN") {
          newPhase = "BREAKOUT_SHORT";
          patch.tradeDirection = "SHORT"; patch.entryPrice = curr;
          Object.assign(patch, calcLevels("SHORT", curr, high, low));
          patch.aiScore = undefined; patch.aiChecks = undefined; patch.aiNote = undefined;
          autoFiredRef.current.delete(setup.id);
        } else if (curr >= high * 0.998 && curr <= high * 1.002 && prevPhase === "BREAKOUT_LONG") {
          newPhase = "RETEST_LONG"; patch.retestLevel = high; patch.entryPrice = curr;
          Object.assign(patch, calcLevels("LONG", curr, high, low));
        } else if (curr >= low * 0.998 && curr <= low * 1.002 && prevPhase === "BREAKOUT_SHORT") {
          newPhase = "RETEST_SHORT"; patch.retestLevel = low; patch.entryPrice = curr;
          Object.assign(patch, calcLevels("SHORT", curr, high, low));
        } else if (prevPhase !== "TRADE_TAKEN" && prevPhase !== "WINDOW_CLOSED" &&
                   prevPhase !== "BREAKOUT_LONG" && prevPhase !== "BREAKOUT_SHORT" &&
                   prevPhase !== "RETEST_LONG" && prevPhase !== "RETEST_SHORT") {
          newPhase = getESTHour().phase;
        }

        if (newPhase !== setup.phase && newPhase !== "TRADE_TAKEN") {
          patch.phase = newPhase;
          toast({
            title: `📡 TL Auto: ${setup.symbol} → ${PHASE_CONFIG[newPhase].label}`,
            description: `Price ${curr.toFixed(2)} | Auto-updated from TradeLocker`,
          });
        }

        const effectivePhase = patch.phase ?? setup.phase;
        const isRetest = effectivePhase === "RETEST_LONG" || effectivePhase === "RETEST_SHORT";
        if (isRetest && setup.aiScore === undefined && !autoAnalyzingRef.current.has(setup.id) && !setup.tradeTaken) {
          autoAnalyzingRef.current.add(setup.id);
          toast({ title: `🤖 SS AI Bot auto-analyzing ${setup.symbol}…`, description: "Retest detected via TradeLocker live feed" });
          setAnalyzingId(setup.id);
          setSSAISetup({ ...setup, ...patch });
          analyzeMutation.mutate({ ...setup, ...patch });
        }
      }

      updateSetup(setup.id, patch);
    } catch {
      updateSetup(setup.id, { tlStatus: "error" });
    }
  }, [analyzeMutation, toast, updateSetup]);

  // Interval: poll every 30 seconds for any setup with autoMode=true
  // Route to MT5 or TradeLocker based on selected data source
  useEffect(() => {
    const interval = setInterval(() => {
      setSetups(prev => {
        prev.filter(s => s.autoMode && !s.tradeTaken).forEach(s => {
          if (dataSource === "tradelocker") pollTL(s);
          else pollMT5(s);
        });
        return prev;
      });
    }, 30000);
    return () => clearInterval(interval);
  }, [pollMT5, pollTL, dataSource]);

  // Auto-fire webhook when SS AI Bot scores ≥ 70 on a retest in auto mode
  useEffect(() => {
    setups.forEach(setup => {
      if (!setup.autoMode || setup.tradeTaken || autoFiredRef.current.has(setup.id)) return;
      const isRetest = setup.phase === "RETEST_LONG" || setup.phase === "RETEST_SHORT";
      if (isRetest && (setup.aiScore ?? 0) >= 70) {
        autoFiredRef.current.add(setup.id);
        autoAnalyzingRef.current.delete(setup.id);
        // Fire webhook automatically
        apiRequest("POST", "/api/orb/fire-webhook", {
          symbol: setup.symbol, orbHigh: setup.orbHigh, orbLow: setup.orbLow,
          currentPrice: setup.currentPrice, phase: setup.phase,
          tradeDirection: setup.tradeDirection, aiScore: setup.aiScore,
          pattern: setup.pattern, entryPrice: setup.entryPrice,
          stopLoss: setup.stopLoss, target1: setup.target1, target2: setup.target2,
        }).catch(() => {});
        toast({
          title: `🚀 Auto-Webhook Fired: ${setup.symbol}`,
          description: `MT5 detected retest + SS AI Bot ${setup.aiScore}/100 ≥ 70 — signal sent!`,
        });
      }
    });
  }, [setups]);

  function toggleAutoMode(id: string) {
    setSetups(prev => prev.map(s => {
      if (s.id !== id) return s;
      const enabling = !s.autoMode;
      const srcLabel = dataSource === "tradelocker" ? "TradeLocker" : "MT5";
      if (enabling) {
        toast({ title: `⚡ ${srcLabel} Auto-Fill enabled for ${s.symbol}`, description: "Polling live data every 30 seconds" });
        setTimeout(() => {
          if (dataSource === "tradelocker") pollTL({ ...s, autoMode: true });
          else pollMT5({ ...s, autoMode: true });
        }, 500);
      } else {
        toast({ title: `${srcLabel} Auto-Fill disabled for ${s.symbol}`, description: "Returning to manual entry mode" });
        autoFiredRef.current.delete(id);
        autoAnalyzingRef.current.delete(id);
      }
      return { ...s, autoMode: enabling, mt5Status: enabling && dataSource === "mt5" ? "idle" : s.mt5Status, tlStatus: enabling && dataSource === "tradelocker" ? "idle" : s.tlStatus };
    }));
  }

  function handleAnalyze(setup: ORBSetup) {
    autoAnalyzingRef.current.delete(setup.id);
    setAnalyzingId(setup.id);
    setSSAISetup(setup);
    analyzeMutation.mutate(setup);
  }

  const activeSetups = setups.filter(s => s.phase !== "TRADE_TAKEN" && s.phase !== "WINDOW_CLOSED");
  // In multi-setup mode count all trade logs; in single mode count locked symbols
  const tradesTaken = multiSetupMode
    ? setups.reduce((acc, s) => acc + (s.tradeCount ?? 0), 0)
    : setups.filter(s => s.tradeTaken).length;
  const retestSignals = setups.filter(s => s.phase === "RETEST_LONG" || s.phase === "RETEST_SHORT").length;
  const mt5AutoCount = setups.filter(s => s.autoMode && s.mt5Status === "connected").length;

  return (
    <div className="min-h-screen bg-[#080B14] text-white">
      <div className="container mx-auto px-4 py-8 max-w-7xl">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(99,102,241,0.2))", border: "1px solid rgba(34,197,94,0.3)" }}>
              <TrendingUp className="w-6 h-6 text-green-400" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-black">ORB Breakout — 9:30 Open</h1>
                <Badge className="text-[10px] font-black" style={{ background: "rgba(251,191,36,0.15)", color: "#fbbf24", border: "1px solid rgba(251,191,36,0.3)" }}>
                  EXCLUSIVE
                </Badge>
                <Badge className="text-[10px]" style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.3)" }}>
                  SS AI BOT
                </Badge>
              </div>
              <p className="text-gray-400 text-sm mt-1">
                15-min opening range · 6-min breakout · Retest entry ·{" "}
                {multiSetupMode
                  ? <span className="text-yellow-400 font-semibold">Multi-setup/day — re-arms after each trade</span>
                  : "1 trade/pair/day"
                }{" "}
                — US30, NAS100, SPX, Stocks, Commodities
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
              {/* Multi-Setup Mode toggle */}
              <button
                onClick={() => {
                  const next = !multiSetupMode;
                  setMultiSetupMode(next);
                  try { localStorage.setItem('orb_multi_setup', String(next)); } catch {}
                  toast({
                    title: next ? "🔄 Multi-Setup Mode ON" : "1️⃣ Single-Trade Mode ON",
                    description: next
                      ? "Symbols re-arm after each trade — full SS AI sequence required each time"
                      : "Each symbol locks after one trade per day",
                  });
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold transition-all"
                style={{
                  background: multiSetupMode ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.05)",
                  border: multiSetupMode ? "1px solid rgba(251,191,36,0.4)" : "1px solid rgba(255,255,255,0.12)",
                  color: multiSetupMode ? "#fbbf24" : "#6b7280",
                }}
                title={multiSetupMode ? "Multi-Setup Mode: symbols re-arm after each trade" : "Single-Trade Mode: one trade per symbol per day"}
              >
                <span>{multiSetupMode ? "🔄" : "1️⃣"}</span>
                {multiSetupMode ? "Multi-Setup" : "Single Trade"}
              </button>
              {/* Data source toggle */}
              <div className="flex items-center rounded-lg overflow-hidden border border-gray-700/50 text-[10px] font-bold">
                <button
                  onClick={() => { setDataSource("mt5"); localStorage.setItem('orb_data_source', 'mt5'); }}
                  className="px-2.5 py-1.5 transition-colors"
                  style={{
                    background: dataSource === "mt5" ? "rgba(6,182,212,0.2)" : "rgba(255,255,255,0.04)",
                    color: dataSource === "mt5" ? "#06b6d4" : "#6b7280",
                  }}
                >MT5</button>
                <button
                  onClick={() => { setDataSource("tradelocker"); localStorage.setItem('orb_data_source', 'tradelocker'); }}
                  className="px-2.5 py-1.5 transition-colors border-l border-gray-700/50"
                  style={{
                    background: dataSource === "tradelocker" ? "rgba(168,85,247,0.2)" : "rgba(255,255,255,0.04)",
                    color: dataSource === "tradelocker" ? "#a855f7" : "#6b7280",
                  }}
                >TradeLocker</button>
              </div>
              <Button onClick={() => setShowAddModal(true)}
                className="bg-green-600 hover:bg-green-700"
                size="sm">
                <Plus className="w-4 h-4 mr-1.5" /> Add Instrument
              </Button>
            </div>
          </div>
        </motion.div>

        {/* ORB Clock */}
        <div className="mb-6">
          <ORBClock />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "Instruments Tracked", value: setups.length, color: "#6366f1", icon: BarChart3 },
            { label: "Active Setups", value: activeSetups.length, color: "#06b6d4", icon: Activity },
            { label: "MT5 Live", value: mt5AutoCount, color: "#22c55e", icon: Radio },
            { label: "Retest Signals", value: retestSignals, color: "#f59e0b", icon: Zap },
            { label: "Trades Taken Today", value: tradesTaken, color: "#8b5cf6", icon: CheckCircle2 },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="bg-white/[0.03] border-white/10">
              <CardContent className="p-3 flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: color + "20" }}>
                  <Icon className="w-4 h-4" style={{ color }} />
                </div>
                <div>
                  <p className="text-xl font-black text-white">{value}</p>
                  <p className="text-[9px] text-gray-500 leading-tight">{label}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="scanner">
          <TabsList className="bg-white/[0.05] border border-white/10 mb-6 flex-wrap h-auto gap-1 p-1">
            <TabsTrigger value="scanner" className="text-xs data-[state=active]:bg-indigo-600/80 data-[state=active]:text-white">
              📡 Scanner
            </TabsTrigger>
            <TabsTrigger value="ai-bot" className="text-xs data-[state=active]:bg-purple-600/80 data-[state=active]:text-white">
              🤖 SS AI Bot
            </TabsTrigger>
            <TabsTrigger value="log" className="text-xs data-[state=active]:bg-green-600/80 data-[state=active]:text-white">
              📋 Daily Log
            </TabsTrigger>
            <TabsTrigger value="learn" className="text-xs data-[state=active]:bg-cyan-600/80 data-[state=active]:text-white">
              📚 ORB Methodology
            </TabsTrigger>
          </TabsList>

          {/* Scanner Tab */}
          <TabsContent value="scanner">

            {/* Quick Start Guide — always shown, collapsible */}
            <ORBQuickGuide />

            {setups.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="text-center py-16 rounded-2xl border border-dashed border-white/10 mt-4">
                <TrendingUp className="w-14 h-14 mx-auto mb-4 text-gray-700" />
                <h3 className="text-lg font-bold text-white mb-2">No Instruments Added Yet</h3>
                <p className="text-gray-500 text-sm mb-2 max-w-sm mx-auto">
                  Add US30, NAS100, SPX500, AAPL, TSLA, or any instrument your broker offers.
                </p>
                <p className="text-gray-600 text-xs mb-6 max-w-sm mx-auto">
                  After adding, tap the ↻ icon on a card to enter your ORB High/Low from the 9:30–9:45 candle.
                </p>
                <Button onClick={() => setShowAddModal(true)} className="bg-green-600 hover:bg-green-700">
                  <Plus className="w-4 h-4 mr-2" /> Add Your First Instrument
                </Button>
              </motion.div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                <AnimatePresence>
                  {setups.map(setup => (
                    <SetupCard
                      key={setup.id}
                      setup={setup}
                      onUpdate={updateSetup}
                      onRemove={removeSetup}
                      onTakeTrade={logTrade}
                      onAnalyze={handleAnalyze}
                      isAnalyzing={analyzingId === setup.id}
                      onToggleAuto={toggleAutoMode}
                      onSetStopOrder={(s) => setStopOrderSetup(s)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}

            {setups.length > 0 && (
              <div className="mt-4 text-center">
                <Button variant="outline" size="sm" onClick={() => setShowAddModal(true)} className="border-white/10 text-gray-400 text-xs">
                  <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Another Instrument
                </Button>
              </div>
            )}

            {/* One trade rule reminder */}
            <div className="mt-6 p-3 rounded-xl flex items-center gap-3"
              style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <Shield className="w-4 h-4 text-red-400 flex-shrink-0" />
              <p className="text-xs text-gray-400">
                <span className="text-red-300 font-semibold">Rule #1 — One Trade Per Pair Per Day.</span>{" "}
                Once a trade is logged for an instrument, that pair is locked for the rest of the session.
                Respecting this rule is what separates consistent traders from gamblers.
              </p>
            </div>
          </TabsContent>

          {/* SS AI Bot Tab */}
          <TabsContent value="ai-bot">
            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <Card className="bg-white/[0.03] border-white/10">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Radio className="w-4 h-4 text-purple-400" />
                      What is the SS AI Bot?
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-xs text-gray-300 leading-relaxed">
                    <p>The <span className="text-purple-400 font-semibold">Secondary Signal AI Bot (SS AI Bot)</span> is VEDD's exclusive 2nd confirmation layer. It runs 6 independent checks on every ORB setup before you risk a single dollar.</p>
                    <div className="space-y-2">
                      {[
                        { n: 1, label: "ORB Range Quality", desc: "Is the range in the Goldilocks zone? (not too tight, not too wide)" },
                        { n: 2, label: "Breakout Candle Strength", desc: "Did the 6-min candle close with a full body outside the range?" },
                        { n: 3, label: "Retest Validity", desc: "Is price holding the breakout level as support/resistance?" },
                        { n: 4, label: "Pattern Confirmation", desc: "Is there a valid candlestick pattern at the retest level?" },
                        { n: 5, label: "Trading Window", desc: "Are we in the optimal 9:45 AM–11:30 AM window?" },
                        { n: 6, label: "Pre-Market Bias Alignment", desc: "Does the trade direction match the pre-market sentiment?" },
                      ].map(({ n, label, desc }) => (
                        <div key={n} className="flex items-start gap-2 p-2 rounded-lg bg-white/3">
                          <span className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0 mt-0.5"
                            style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd" }}>{n}</span>
                          <div>
                            <p className="font-semibold text-white text-[11px]">{label}</p>
                            <p className="text-[10px] text-gray-500">{desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="p-3 rounded-lg" style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)" }}>
                      <p className="text-[10px] text-purple-300">
                        <span className="font-bold">Scoring:</span> 80–100 = Take Trade ✅ &nbsp;|&nbsp; 60–79 = Marginal ⚠️ &nbsp;|&nbsp; Under 60 = Skip ❌
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {setups.length === 0 && (
                  <div className="p-6 rounded-xl text-center border border-dashed border-white/10">
                    <p className="text-gray-600 text-sm">Add an instrument in the Scanner tab first to run the SS AI Bot.</p>
                  </div>
                )}
                {setups.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 uppercase tracking-wider">Select Setup to Analyze</p>
                    {setups.map(s => (
                      <button key={s.id} onClick={() => setSSAISetup(s)}
                        className="w-full p-3 rounded-xl text-left transition-all border"
                        style={{
                          background: ssAISetup?.id === s.id ? "rgba(139,92,246,0.15)" : "rgba(255,255,255,0.03)",
                          borderColor: ssAISetup?.id === s.id ? "rgba(139,92,246,0.5)" : "rgba(255,255,255,0.08)",
                        }}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-white">{s.symbol}</span>
                          <span className="text-[9px] px-2 py-0.5 rounded-full" style={{ background: PHASE_CONFIG[s.phase].bg, color: PHASE_CONFIG[s.phase].color }}>
                            {PHASE_CONFIG[s.phase].label}
                          </span>
                        </div>
                        {s.aiScore !== undefined && (
                          <p className="text-xs mt-1" style={{ color: s.aiScore >= 70 ? "#22c55e" : s.aiScore >= 60 ? "#f59e0b" : "#ef4444" }}>
                            Last score: {s.aiScore}/100
                          </p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                {ssAISetup ? (
                  <SSAIBotPanel
                    setup={ssAISetup}
                    onAnalyze={() => handleAnalyze(ssAISetup)}
                    isLoading={analyzingId === ssAISetup.id}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center rounded-2xl border border-dashed border-white/10">
                    <div className="text-center text-gray-600 py-12">
                      <Radio className="w-10 h-10 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Select a setup on the left to analyze</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          {/* Daily Log Tab */}
          <TabsContent value="log">
            <DailyLog trades={dailyTrades} />
          </TabsContent>

          {/* Learn Tab */}
          <TabsContent value="learn">
            <ORBEducation />
          </TabsContent>
        </Tabs>
      </div>

      <AddInstrumentModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={addInstrument}
      />

      <StopOrderModal
        setup={stopOrderSetup}
        open={!!stopOrderSetup}
        onClose={() => setStopOrderSetup(null)}
      />
    </div>
  );
}
