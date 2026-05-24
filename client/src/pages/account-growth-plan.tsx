import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import ConnectedAccountPicker, { type ConnectedAccount } from "@/components/connected-account-picker";
import {
  TrendingUp, Target, Zap, Trophy, ArrowRight, ChevronDown, ChevronUp,
  Calculator, BookOpen, BarChart3, Plus, Trash2, Edit3, CheckCircle2,
  AlertTriangle, Lock, Star, RefreshCw, DollarSign, Info, Loader2, X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";

// ── Phase definitions ─────────────────────────────────────────────────────────
const PHASES = [
  {
    id: 1, name: "Seedling", emoji: "🌱", color: "emerald",
    minBalance: 0, maxBalance: 499,
    riskPct: { conservative: 0.5, moderate: 0.75, aggressive: 1.0 },
    maxTrades: 1, lotMultiplier: 0.01, // micro lots
    description: "Build discipline. 1 trade at a time. Protect the account.",
    tip: "Your only job in Phase 1 is to not blow up. Small size, big patience.",
    milestoneGoal: 500,
    milestoneLabel: "Reach $500",
  },
  {
    id: 2, name: "Sprouting", emoji: "🌿", color: "teal",
    minBalance: 500, maxBalance: 1499,
    riskPct: { conservative: 0.75, moderate: 1.0, aggressive: 1.5 },
    maxTrades: 2, lotMultiplier: 0.01,
    description: "Build consistency. 2 trades max. Log every entry.",
    tip: "Two consecutive weeks of profit = permission to move to next phase.",
    milestoneGoal: 1500,
    milestoneLabel: "Reach $1,500",
  },
  {
    id: 3, name: "Growing", emoji: "🌳", color: "cyan",
    minBalance: 1500, maxBalance: 4999,
    riskPct: { conservative: 1.0, moderate: 1.25, aggressive: 1.75 },
    maxTrades: 2, lotMultiplier: 0.1, // mini lots
    description: "Increase size. Hold setups longer. Let winners run.",
    tip: "At this phase you prove a strategy works consistently — not once or twice.",
    milestoneGoal: 5000,
    milestoneLabel: "Reach $5,000",
  },
  {
    id: 4, name: "Scaling", emoji: "🚀", color: "blue",
    minBalance: 5000, maxBalance: 14999,
    riskPct: { conservative: 1.25, moderate: 1.5, aggressive: 2.0 },
    maxTrades: 3, lotMultiplier: 0.1,
    description: "Scale winners. Add to positions at key levels. Diversify pairs.",
    tip: "You earned this phase. Now the risk management gets even more important.",
    milestoneGoal: 15000,
    milestoneLabel: "Reach $15,000",
  },
  {
    id: 5, name: "Thriving", emoji: "💎", color: "purple",
    minBalance: 15000, maxBalance: 49999,
    riskPct: { conservative: 1.5, moderate: 2.0, aggressive: 2.5 },
    maxTrades: 4, lotMultiplier: 1.0, // standard lots
    description: "Full standard lots. Multiple positions. Compound consistently.",
    tip: "At this level, protecting profits is as important as making them.",
    milestoneGoal: 50000,
    milestoneLabel: "Reach $50,000",
  },
  {
    id: 6, name: "Professional", emoji: "🏆", color: "amber",
    minBalance: 50000, maxBalance: Infinity,
    riskPct: { conservative: 1.5, moderate: 2.0, aggressive: 2.5 },
    maxTrades: 5, lotMultiplier: 1.0,
    description: "Institutional mindset. Drawdown management. Consistent income.",
    tip: "You built from scratch. Now trade like a business — not a gambler.",
    milestoneGoal: 100000,
    milestoneLabel: "Reach $100,000",
  },
];

const RISK_PROFILES = [
  { id: "conservative", label: "Conservative", desc: "Lower risk, slower growth — ideal for beginners", color: "emerald" },
  { id: "moderate",     label: "Moderate",     desc: "Balanced risk/reward — suits consistent traders",  color: "blue"    },
  { id: "aggressive",   label: "Aggressive",   desc: "Higher risk, faster growth — experienced traders", color: "orange"  },
];

const TRADING_STYLES = [
  { id: "scalping",    label: "Scalping",    desc: "< 15 min holds, tight SL" },
  { id: "day",         label: "Day Trading", desc: "Intraday, close before EOD" },
  { id: "swing",       label: "Swing",       desc: "1–5 day holds, wider SL"  },
  { id: "position",    label: "Position",    desc: "Weeks–months, macro trends" },
];

// ── Pip utils (client-side mirror) ───────────────────────────────────────────
function clientGetPipSize(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("JPY")) return 0.01;
  if (s.includes("XAU") || s.includes("GOLD")) return 0.1;
  if (s.includes("US30") || s.includes("NAS") || s.includes("SP5") || s.includes("DAX") || s.includes("UK100")) return 1.0;
  if (s.includes("BTC")) return 1.0;
  if (s.includes("ETH") || s.includes("SOL")) return 0.01;
  return 0.0001;
}
function clientGetPipValue(symbol: string): number {
  const s = symbol.toUpperCase();
  if (s.includes("XAU") || s.includes("GOLD")) return 10;
  if (s.includes("US30") || s.includes("NAS") || s.includes("SP5") || s.includes("DAX")) return 1;
  if (s.includes("JPY")) return 10;
  return 10;
}

function calcLotSize(accountBalance: number, riskPct: number, slPips: number, symbol: string): number {
  const riskUsd = (accountBalance * riskPct) / 100;
  const pipVal = clientGetPipValue(symbol);
  if (slPips <= 0 || pipVal <= 0) return 0;
  const lots = riskUsd / (slPips * pipVal);
  return Math.max(0.01, Math.round(lots * 100) / 100);
}

function calcRiskUsd(accountBalance: number, riskPct: number): number {
  return (accountBalance * riskPct) / 100;
}

// ── Projected growth chart data ───────────────────────────────────────────────
function buildProjection(startBalance: number, goalBalance: number, weeklyPct: number, weeks = 52) {
  const data = [];
  let bal = startBalance;
  for (let w = 0; w <= weeks; w++) {
    data.push({ week: w, projected: Math.round(bal * 100) / 100, label: `Week ${w}` });
    if (bal >= goalBalance * 1.5) break;
    bal = bal * (1 + weeklyPct / 100);
  }
  return data;
}

// ── MILESTONES ────────────────────────────────────────────────────────────────
const ACCOUNT_MILESTONES = [
  { id: "first_trade",    label: "First Trade Logged",  emoji: "🎯", check: (_p: any, trades: any[]) => trades.length >= 1 },
  { id: "five_trades",    label: "5 Trades Logged",     emoji: "📊", check: (_p: any, trades: any[]) => trades.length >= 5 },
  { id: "first_win",      label: "First Winning Trade", emoji: "✅", check: (_p: any, trades: any[]) => trades.some((t: any) => (t.pnl_usd || 0) > 0) },
  { id: "three_streak",   label: "3 Win Streak",        emoji: "🔥", check: (_p: any, trades: any[]) => {
    const closed = [...trades].filter(t => t.status === 'closed').reverse();
    let streak = 0;
    for (const t of closed) { if ((t.pnl_usd || 0) > 0) streak++; else break; }
    return streak >= 3;
  }},
  { id: "phase2",  label: "Reach Phase 2 ($500)",    emoji: "🌿", check: (p: any) => (p?.current_balance || 0) >= 500 },
  { id: "phase3",  label: "Reach Phase 3 ($1,500)",  emoji: "🌳", check: (p: any) => (p?.current_balance || 0) >= 1500 },
  { id: "phase4",  label: "Reach Phase 4 ($5,000)",  emoji: "🚀", check: (p: any) => (p?.current_balance || 0) >= 5000 },
  { id: "phase5",  label: "Reach Phase 5 ($15,000)", emoji: "💎", check: (p: any) => (p?.current_balance || 0) >= 15000 },
  { id: "phase6",  label: "Reach Phase 6 ($50,000)", emoji: "🏆", check: (p: any) => (p?.current_balance || 0) >= 50000 },
  { id: "doubled", label: "Doubled the Account",     emoji: "💰", check: (p: any) => p && (p.current_balance || 0) >= (p.starting_balance || 1) * 2 },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function AccountGrowthPlan() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // Phase promotion celebration
  const [promotionModal, setPromotionModal] = useState<{
    newPhase: typeof PHASES[0];
    oldPhase: typeof PHASES[0];
    riskPct: number;
    maxTrades: number;
  } | null>(null);

  // Plan just saved success banner
  const [planJustSaved, setSetupJustSaved] = useState(false);
  const [planSaveBannerSeconds, setPlanSaveBannerSeconds] = useState(5);

  // Setup wizard state
  const [setupMode, setSetupMode] = useState(false);
  const [setupBalance, setSetupBalance] = useState("500");
  const [setupGoal, setSetupGoal] = useState("10000");
  const [setupRisk, setSetupRisk] = useState<"conservative" | "moderate" | "aggressive">("conservative");
  const [setupStyle, setSetupStyle] = useState("day");
  const [setupWeekly, setSetupWeekly] = useState("3");

  // Position sizer state
  const [sizerSymbol, setSizerSymbol] = useState("EURUSD");
  const [sizerSL, setSizerSL] = useState("20");
  const [sizerEntry, setSizerEntry] = useState("");

  // Balance update
  const [newBalance, setNewBalance] = useState("");
  const [showBalanceEdit, setShowBalanceEdit] = useState(false);

  // Trade log
  const [showTradeForm, setShowTradeForm] = useState(false);
  const [tradeForm, setTradeForm] = useState({
    symbol: "EURUSD", direction: "long", entryPrice: "", exitPrice: "",
    stopLoss: "", lotSize: "", pnlUsd: "", notes: "",
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/growth-plan"],
    queryFn: () => apiRequest("GET", "/api/growth-plan").then(r => r.json()),
  });

  const { data: weeklyStrategy } = useQuery<any>({ queryKey: ["/api/weekly-strategy"] });
  const { data: liveEngineStatus } = useQuery<any>({
    queryKey: ["/api/vedd-live-engine/status"],
    refetchInterval: 10000,
  });
  const { data: weeklyData } = useQuery<any>({ queryKey: ["/api/weekly-strategy"] });

  const plan = data?.plan;
  const trades: any[] = data?.trades || [];

  const savePlanMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/growth-plan", body).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/growth-plan"] });
      setSetupMode(false);
      setSetupJustSaved(true);
      setPlanSaveBannerSeconds(5);
      toast({ title: "✅ Growth plan saved!" });
    },
    onError: () => toast({ title: "Error saving plan", variant: "destructive" }),
  });

  // Auto-dismiss planJustSaved banner with countdown
  useEffect(() => {
    if (!planJustSaved) return;
    const interval = setInterval(() => {
      setPlanSaveBannerSeconds(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setSetupJustSaved(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [planJustSaved]);

  const updateBalanceMutation = useMutation({
    mutationFn: (body: any) => apiRequest("PATCH", "/api/growth-plan/balance", body).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/growth-plan"] });
      setShowBalanceEdit(false);
      setNewBalance("");
      if (d.phaseChanged && d.currentPhase && d.oldPhase) {
        const newP = PHASES.find(p => p.id === d.currentPhase);
        const oldP = PHASES.find(p => p.id === d.oldPhase);
        const rp = (d.riskProfile || "conservative") as "conservative" | "moderate" | "aggressive";
        if (newP && oldP) {
          setPromotionModal({ newPhase: newP, oldPhase: oldP, riskPct: newP.riskPct[rp], maxTrades: newP.maxTrades });
          return;
        }
      }
      const phase = PHASES.find(p => p.id === d.currentPhase);
      toast({ title: `Balance updated ${phase ? `— ${phase.emoji} ${phase.name} phase` : ""}` });
    },
    onError: () => toast({ title: "Error updating balance", variant: "destructive" }),
  });

  const logTradeMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/growth-plan/trades", body).then(r => r.json()),
    onSuccess: (d: any) => {
      qc.invalidateQueries({ queryKey: ["/api/growth-plan"] });
      setShowTradeForm(false);
      setTradeForm({ symbol: "EURUSD", direction: "long", entryPrice: "", exitPrice: "", stopLoss: "", lotSize: "", pnlUsd: "", notes: "" });
      if (d.phaseChanged && d.newPhase && d.oldPhase) {
        const newP = PHASES.find(p => p.id === d.newPhase);
        const oldP = PHASES.find(p => p.id === d.oldPhase);
        const rp = (d.riskProfile || "conservative") as "conservative" | "moderate" | "aggressive";
        if (newP && oldP) {
          setPromotionModal({ newPhase: newP, oldPhase: oldP, riskPct: newP.riskPct[rp], maxTrades: newP.maxTrades });
          return;
        }
      }
      toast({ title: "Trade logged ✅" });
    },
    onError: () => toast({ title: "Error logging trade", variant: "destructive" }),
  });

  const deleteTradeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/growth-plan/trades/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/growth-plan"] }); toast({ title: "Trade removed" }); },
  });

  // Derived state
  const currentPhase = PHASES.find(p => p.id === (plan?.current_phase || 1)) || PHASES[0];
  const riskProfile = (plan?.risk_profile || "conservative") as "conservative" | "moderate" | "aggressive";
  const currentRiskPct = currentPhase.riskPct[riskProfile];
  const currentBalance = plan?.current_balance || 0;
  const goalBalance = plan?.goal_balance || 0;
  const startingBalance = plan?.starting_balance || 0;
  const progressToGoal = goalBalance > 0 ? Math.min(1, (currentBalance - startingBalance) / (goalBalance - startingBalance)) : 0;
  const progressToNextPhase = currentPhase.maxBalance < Infinity
    ? Math.min(1, (currentBalance - currentPhase.minBalance) / (currentPhase.maxBalance - currentPhase.minBalance + 1))
    : 1;

  const slPips = parseFloat(sizerSL) || 0;
  const recommendedLots = plan ? calcLotSize(currentBalance, currentRiskPct, slPips, sizerSymbol) : 0;
  const riskAmountUsd = plan ? calcRiskUsd(currentBalance, currentRiskPct) : 0;

  const projectionData = useMemo(() =>
    plan ? buildProjection(startingBalance, goalBalance, plan.weekly_target_pct || 3) : [],
    [startingBalance, goalBalance, plan?.weekly_target_pct]
  );

  // Track actual growth on chart
  const weeksActive = plan
    ? Math.floor((Date.now() - new Date(plan.created_at).getTime()) / (7 * 24 * 3600 * 1000))
    : 0;

  const closedTrades = trades.filter(t => t.status === "closed");
  const totalPnl = closedTrades.reduce((sum, t) => sum + (t.pnl_usd || 0), 0);
  const wins = closedTrades.filter(t => (t.pnl_usd || 0) > 0).length;
  const winRate = closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : 0;
  const avgWin = wins > 0
    ? closedTrades.filter(t => (t.pnl_usd || 0) > 0).reduce((s, t) => s + (t.pnl_usd || 0), 0) / wins
    : 0;
  const avgLoss = (closedTrades.length - wins) > 0
    ? Math.abs(closedTrades.filter(t => (t.pnl_usd || 0) <= 0).reduce((s, t) => s + (t.pnl_usd || 0), 0) / (closedTrades.length - wins))
    : 0;
  const rr = avgLoss > 0 ? avgWin / avgLoss : 0;

  // Milestones
  const earnedMilestones = ACCOUNT_MILESTONES.filter(m => m.check(plan, trades));

  // Phase color helper
  const phaseColor: Record<string, string> = {
    emerald: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
    teal:    "text-teal-400 bg-teal-500/10 border-teal-500/30",
    cyan:    "text-cyan-400 bg-cyan-500/10 border-cyan-500/30",
    blue:    "text-blue-400 bg-blue-500/10 border-blue-500/30",
    purple:  "text-purple-400 bg-purple-500/10 border-purple-500/30",
    amber:   "text-amber-400 bg-amber-500/10 border-amber-500/30",
  };
  const pc = phaseColor[currentPhase.color] || phaseColor.emerald;

  // ─── SETUP WIZARD ────────────────────────────────────────────────────────────
  if (!plan || setupMode) {
    return (
      <div className="min-h-screen bg-gray-950 text-white p-4 pb-20">
        <div className="max-w-lg mx-auto pt-6">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 border border-emerald-500/30 mb-4">
              <TrendingUp className="w-8 h-8 text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-white mb-1">Smart Account Growth Plan</h1>
            <p className="text-sm text-gray-400">Build your account from the bottom up — step by step, phase by phase.</p>
          </div>

          <div className="space-y-5 bg-gray-900/50 border border-gray-700/50 rounded-2xl p-5">
            {/* Starting balance — with account picker */}
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-1.5">Starting Account Balance (USD)</label>
              {/* Sync from a connected account */}
              <ConnectedAccountPicker
                label="Auto-fill from connected account"
                compact
                className="mb-2"
                onSelect={(acct) => {
                  if (acct && acct.balance > 0) {
                    setSetupBalance(String(Math.round(acct.balance * 100) / 100));
                  }
                }}
              />
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input value={setupBalance} onChange={e => setSetupBalance(e.target.value)}
                  type="number" min="50" placeholder="e.g. 500"
                  className="bg-gray-800 border-gray-600 text-white pl-8" />
              </div>
              <p className="text-[11px] text-gray-500 mt-1">This is your account right now. Be honest — it only helps you.</p>
            </div>

            {/* Goal balance */}
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-1.5">Your Goal Balance (USD)</label>
              <div className="relative">
                <Target className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input value={setupGoal} onChange={e => setSetupGoal(e.target.value)}
                  type="number" min="500" placeholder="e.g. 10000"
                  className="bg-gray-800 border-gray-600 text-white pl-8" />
              </div>
            </div>

            {/* Risk profile */}
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-2">Risk Profile</label>
              <div className="grid grid-cols-3 gap-2">
                {RISK_PROFILES.map(rp => (
                  <button key={rp.id} onClick={() => setSetupRisk(rp.id as any)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${setupRisk === rp.id ? 'border-emerald-500/60 bg-emerald-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}`}>
                    <p className={`text-xs font-bold mb-0.5 ${setupRisk === rp.id ? 'text-emerald-300' : 'text-gray-300'}`}>{rp.label}</p>
                    <p className="text-[10px] text-gray-500 leading-tight">{rp.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Trading style */}
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-2">Trading Style</label>
              <div className="grid grid-cols-2 gap-2">
                {TRADING_STYLES.map(ts => (
                  <button key={ts.id} onClick={() => setSetupStyle(ts.id)}
                    className={`p-2.5 rounded-xl border text-left transition-all ${setupStyle === ts.id ? 'border-blue-500/60 bg-blue-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}`}>
                    <p className={`text-xs font-bold mb-0.5 ${setupStyle === ts.id ? 'text-blue-300' : 'text-gray-300'}`}>{ts.label}</p>
                    <p className="text-[10px] text-gray-500">{ts.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Weekly target */}
            <div>
              <label className="text-sm font-semibold text-gray-300 block mb-1.5">Weekly Growth Target (%)</label>
              <Input value={setupWeekly} onChange={e => setSetupWeekly(e.target.value)}
                type="number" min="1" max="20" step="0.5" placeholder="3"
                className="bg-gray-800 border-gray-600 text-white" />
              <p className="text-[11px] text-gray-500 mt-1">
                {setupWeekly && setupBalance && (
                  <>At {setupWeekly}% weekly from ${parseInt(setupBalance).toLocaleString()}, you'd reach ${(parseInt(setupBalance) * Math.pow(1 + parseFloat(setupWeekly)/100, 52)).toLocaleString(undefined, { maximumFractionDigits: 0 })} in 52 weeks</>
                )}
              </p>
            </div>

            <Button onClick={() => savePlanMutation.mutate({
              startingBalance: parseFloat(setupBalance),
              goalBalance: parseFloat(setupGoal),
              riskProfile: setupRisk,
              tradingStyle: setupStyle,
              weeklyTargetPct: parseFloat(setupWeekly),
            })} disabled={savePlanMutation.isPending || !setupBalance || !setupGoal}
              className={`w-full text-white font-bold h-12 flex items-center justify-center gap-2 transition-colors ${
                savePlanMutation.isPending
                  ? 'bg-emerald-700 hover:bg-emerald-700'
                  : 'bg-emerald-600 hover:bg-emerald-500'
              }`}>
              {savePlanMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : "Build My Growth Plan →"}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN DASHBOARD ──────────────────────────────────────────────────────────
  // Guided workflow steps
  const workflowSteps = [
    {
      num: 1, label: "Plan Created", desc: "Starting balance, goal & risk set",
      done: true, icon: "✅",
    },
    {
      num: 2, label: "Know Your Phase", desc: `Phase ${currentPhase.id} — ${currentPhase.name} active`,
      done: true, icon: currentPhase.emoji,
    },
    {
      num: 3, label: "Size Your Trade", desc: "Calculate lot size before every entry",
      done: slPips > 0, icon: "🎯", anchor: "sizer",
    },
    {
      num: 4, label: "Get Your Signal", desc: "Weekly Strategy or AI Analysis",
      done: false, icon: "📡", link: "/weekly-strategy",
    },
    {
      num: 5, label: "Execute & Log", desc: "Log the trade, update balance after close",
      done: trades.length > 0, icon: "📒", anchor: "tradelog",
    },
    {
      num: 6, label: "Check the Meters", desc: "Volatility, Sentiment & Market Mood",
      done: false, icon: "📊", link: "/market-mood",
    },
    {
      num: 7, label: "Update Balance", desc: "Lock in gains, trigger phase check",
      done: currentBalance > startingBalance, icon: "💰", anchor: "balance",
    },
  ];

  const nextStep = workflowSteps.find(s => !s.done);

  return (
    <>
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-24">
      <div className="max-w-2xl mx-auto pt-4 space-y-4">

        {/* ── Page header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
              Account Growth Plan
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">Phase-based sizing • Step-by-step guidance • Full trade log</p>
          </div>
          <Button size="sm" variant="outline" className="h-8 text-xs border-gray-600"
            onClick={() => { setSetupBalance(String(currentBalance)); setSetupGoal(String(goalBalance)); setSetupMode(true); }}>
            <Edit3 className="w-3 h-3 mr-1" /> Edit Plan
          </Button>
        </div>

        {/* ── Plan Just Saved Success Banner ── */}
        {planJustSaved && (
          <div className="relative rounded-2xl border border-emerald-500/40 bg-emerald-950/40 p-4 overflow-hidden">
            {/* Countdown progress bar at bottom */}
            <div className="absolute bottom-0 left-0 h-1 bg-emerald-500/30 rounded-b-2xl" style={{ width: '100%' }}>
              <div
                className="h-full bg-emerald-400 rounded-b-2xl transition-all duration-1000"
                style={{ width: `${(planSaveBannerSeconds / 5) * 100}%` }}
              />
            </div>
            {/* Close button */}
            <button
              onClick={() => setSetupJustSaved(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-white transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3">
              <span className="text-2xl">🎉</span>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-emerald-300 text-sm mb-1">Growth Plan Activated!</p>
                <p className="text-xs text-gray-400 mb-2">
                  Your Phase {currentPhase.id} — {currentPhase.name} plan is live. Here's what's set for you:
                </p>
                <div className="space-y-1 text-xs">
                  <p className="text-gray-300">✅ Risk per trade: <span className="font-bold text-white">{currentRiskPct}%</span> <span className="text-gray-500">(${riskAmountUsd.toFixed(2)} USD)</span></p>
                  <p className="text-gray-300">✅ Max trades: <span className="font-bold text-white">{currentPhase.maxTrades} per session</span></p>
                  <p className="text-gray-300">✅ Weekly target: <span className="font-bold text-white">{plan?.weekly_target_pct || 3}%</span></p>
                  <p className="text-gray-300">✅ Phase: <span className="font-bold text-white">{currentPhase.id} — {currentPhase.name}</span></p>
                </div>
                <a
                  href="/weekly-strategy"
                  className="inline-flex items-center gap-1 mt-3 text-[11px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 px-3 py-1.5 rounded-lg font-semibold transition-colors"
                >
                  <ArrowRight className="w-3 h-3" /> Go to Weekly Strategy to build your first plan
                </a>
              </div>
            </div>
            <p className="text-[10px] text-gray-600 mt-2">Auto-dismissing in {planSaveBannerSeconds}s</p>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1 — PERFORMANCE HERO
            Shows gains at a glance. First thing a trader wants to see.
        ═══════════════════════════════════════════════════════════════════ */}
        <div className={`rounded-2xl border p-4 relative overflow-hidden ${pc}`}>
          {/* Phase colour glow */}
          <div className="absolute inset-0 opacity-5 bg-current pointer-events-none" />

          <div className="relative flex items-start justify-between mb-3">
            <div className="flex items-center gap-3">
              <span className="text-4xl">{currentPhase.emoji}</span>
              <div>
                <p className="text-[10px] opacity-60 uppercase tracking-widest font-semibold">Current Phase</p>
                <p className="font-black text-lg leading-tight">Phase {currentPhase.id} — {currentPhase.name}</p>
                <p className="text-[11px] opacity-60 mt-0.5">{currentPhase.description}</p>
              </div>
            </div>
            <div className="text-right shrink-0 pl-3">
              <p className="text-[10px] opacity-50">Risk/trade</p>
              <p className="text-2xl font-black">{currentRiskPct}%</p>
              <p className="text-[10px] opacity-50">${riskAmountUsd.toFixed(2)} USD</p>
            </div>
          </div>

          {/* Gains row */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-black/20 rounded-xl p-2.5 text-center">
              <p className="text-[9px] opacity-50 mb-0.5">Balance</p>
              <p className="text-base font-black">${currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
            </div>
            <div className={`rounded-xl p-2.5 text-center ${(currentBalance - startingBalance) >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              <p className="text-[9px] opacity-50 mb-0.5">Total Gain</p>
              <p className={`text-base font-black ${(currentBalance - startingBalance) >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {(currentBalance - startingBalance) >= 0 ? '+' : ''}${(currentBalance - startingBalance).toFixed(0)}
              </p>
            </div>
            <div className={`rounded-xl p-2.5 text-center ${totalPnl >= 0 ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}>
              <p className="text-[9px] opacity-50 mb-0.5">Net P&L</p>
              <p className={`text-base font-black ${totalPnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(0)}
              </p>
            </div>
          </div>

          {/* Phase tip */}
          <div className="flex items-start gap-2 p-2 rounded-lg bg-black/20">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 opacity-60" />
            <p className="text-[11px] opacity-80 italic">"{currentPhase.tip}"</p>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2 — GUIDED WORKFLOW
            Step-by-step trading flow, always showing next action.
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-amber-400" />
            <p className="font-semibold text-sm text-gray-200">Your Trading Workflow</p>
            {nextStep && (
              <span className="ml-auto text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded-full font-semibold">
                Next: Step {nextStep.num}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {workflowSteps.map((step, i) => {
              const isNext = step === nextStep;
              return (
                <div key={step.num}
                  className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
                    step.done ? 'border-emerald-500/20 bg-emerald-500/5' :
                    isNext    ? 'border-amber-500/40 bg-amber-500/8 ring-1 ring-amber-500/20' :
                                'border-gray-700/30 bg-gray-800/20 opacity-50'
                  }`}>
                  {/* Step number / check */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm shrink-0 font-black ${
                    step.done ? 'bg-emerald-500/20 text-emerald-400' :
                    isNext    ? 'bg-amber-500/20 text-amber-300' :
                                'bg-gray-700/40 text-gray-600'
                  }`}>
                    {step.done ? '✓' : step.num}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold ${step.done ? 'text-emerald-300' : isNext ? 'text-amber-200' : 'text-gray-600'}`}>
                        {step.icon} {step.label}
                      </p>
                      {isNext && <span className="text-[9px] bg-amber-500/30 text-amber-300 px-1.5 py-0.5 rounded-full font-bold">DO THIS NOW</span>}
                      {step.done && <span className="text-[9px] text-emerald-500 font-semibold">Done</span>}
                    </div>
                    <p className={`text-[10px] mt-0.5 ${step.done ? 'text-gray-500' : isNext ? 'text-gray-300' : 'text-gray-700'}`}>
                      {step.desc}
                    </p>
                  </div>

                  {/* CTA links */}
                  {isNext && step.link && (
                    <a href={step.link}
                      className="shrink-0 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      Go →
                    </a>
                  )}
                  {isNext && step.anchor && (
                    <button
                      onClick={() => document.getElementById(step.anchor!)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                      className="shrink-0 text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap">
                      Go ↓
                    </button>
                  )}
                  {step.done && step.link && (
                    <a href={step.link}
                      className="shrink-0 text-[10px] text-gray-600 hover:text-gray-400 transition-colors whitespace-nowrap">
                      Open
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2b — PLAN STATUS MONITOR
            Live connection status to weekly strategy and engine.
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4">
          {/* Card header */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-base">📡</span>
            <p className="font-semibold text-sm text-gray-200">Plan Monitor — Live Status</p>
            {liveEngineStatus?.status === 'running' && (
              <span className="flex items-center gap-1 ml-auto text-[10px] text-emerald-400 font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                Engine Live
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Left: Animated ring + phase progression */}
            <div className="flex flex-col items-center gap-3">
              {/* Circular SVG progress ring */}
              <div className="relative w-28 h-28">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
                  <circle
                    cx="50" cy="50" r="42" fill="none"
                    stroke={
                      currentPhase.color === 'emerald' ? '#10b981' :
                      currentPhase.color === 'teal'    ? '#14b8a6' :
                      currentPhase.color === 'cyan'    ? '#06b6d4' :
                      currentPhase.color === 'blue'    ? '#3b82f6' :
                      currentPhase.color === 'purple'  ? '#a855f7' :
                                                         '#f59e0b'
                    }
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={`${2 * Math.PI * 42}`}
                    strokeDashoffset={`${2 * Math.PI * 42 * (1 - progressToNextPhase)}`}
                    className="transition-all duration-700"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl">{currentPhase.emoji}</span>
                  <span className="text-[10px] text-gray-400 font-semibold">{Math.round(progressToNextPhase * 100)}%</span>
                </div>
              </div>
              <p className="text-xs text-gray-400 text-center">Phase {currentPhase.id} of 6 — to next phase</p>

              {/* Phase progression bar */}
              <div className="w-full">
                <div className="flex items-center gap-1">
                  {PHASES.map(ph => (
                    <div
                      key={ph.id}
                      className={`flex-1 h-1.5 rounded-full transition-all ${
                        ph.id < currentPhase.id
                          ? 'bg-emerald-500'
                          : ph.id === currentPhase.id
                          ? 'bg-amber-400'
                          : 'bg-gray-700'
                      }`}
                      title={`${ph.emoji} ${ph.name}`}
                    />
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                  <span>Phase 1</span>
                  <span>Phase 6</span>
                </div>
              </div>
            </div>

            {/* Right: Status badges */}
            <div className="space-y-3">
              {/* Weekly Strategy connection */}
              <div className="rounded-xl p-3 bg-gray-800/40 border border-gray-700/30">
                <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5 tracking-wide">Weekly Strategy</p>
                {weeklyStrategy?.hasStrategy ? (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />
                    <span className="text-xs text-emerald-300 font-semibold">Strategy Active</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />
                      <span className="text-xs text-gray-500">No strategy yet</span>
                    </div>
                    <a href="/weekly-strategy" className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold transition-colors">
                      Build one →
                    </a>
                  </div>
                )}
              </div>

              {/* Engine status */}
              <div className="rounded-xl p-3 bg-gray-800/40 border border-gray-700/30">
                <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5 tracking-wide">SS AI Engine</p>
                {liveEngineStatus?.status === 'running' ? (
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    <span className="text-xs text-emerald-300 font-semibold">Engine Running</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-gray-600 inline-block" />
                      <span className="text-xs text-gray-500">Engine Off</span>
                    </div>
                    <a href="/weekly-strategy?tab=engine" className="text-[10px] text-amber-400 hover:text-amber-300 font-semibold transition-colors">
                      Start engine →
                    </a>
                  </div>
                )}
              </div>

              {/* Weekly profit progress */}
              <div className="rounded-xl p-3 bg-gray-800/40 border border-gray-700/30">
                <p className="text-[10px] text-gray-500 uppercase font-semibold mb-1.5 tracking-wide">Weekly Progress</p>
                {(() => {
                  const currentProfit = weeklyData?.currentProfit || 0;
                  const profitTarget = weeklyData?.plan?.profitTarget || weeklyData?.profitTarget || 0;
                  const pct = profitTarget > 0 ? Math.min(100, Math.round((currentProfit / profitTarget) * 100)) : 0;
                  return (
                    <>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={`text-sm font-black ${currentProfit >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                          {currentProfit >= 0 ? '+' : ''}${currentProfit.toFixed(2)}
                        </span>
                        {profitTarget > 0 && (
                          <span className="text-[10px] text-gray-500">/ ${profitTarget.toFixed(0)} target</span>
                        )}
                      </div>
                      {profitTarget > 0 && (
                        <div className="h-1.5 rounded-full bg-gray-700/60 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                      {!profitTarget && (
                        <p className="text-[10px] text-gray-600">No weekly plan — go to <a href="/weekly-strategy" className="text-amber-400 hover:text-amber-300">Weekly Strategy</a></p>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3 — GOAL PROGRESS + QUICK BALANCE UPDATE
            Always visible — traders update balance after closing trades.
        ═══════════════════════════════════════════════════════════════════ */}
        <div id="balance" className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4 scroll-mt-20">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-400" />
              <p className="font-semibold text-sm text-gray-200">Goal Progress</p>
            </div>
            <button onClick={() => setShowBalanceEdit(!showBalanceEdit)}
              className="flex items-center gap-1 text-[11px] bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 px-2.5 py-1 rounded-lg font-semibold transition-colors">
              <RefreshCw className="w-3 h-3" /> Update Balance
            </button>
          </div>

          {/* Phase + goal progress dual bars */}
          <div className="space-y-2 mb-3">
            <div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span>To Phase {Math.min(currentPhase.id + 1, 6)} unlock</span>
                <span className="font-semibold text-gray-300">
                  ${currentBalance.toLocaleString(undefined, { maximumFractionDigits: 0 })} / ${currentPhase.maxBalance < Infinity ? currentPhase.maxBalance.toLocaleString() : '∞'}
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-700/60 overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${
                  currentPhase.color === 'emerald' ? 'from-emerald-500 to-teal-400' :
                  currentPhase.color === 'teal'    ? 'from-teal-500 to-cyan-400' :
                  currentPhase.color === 'cyan'    ? 'from-cyan-500 to-blue-400' :
                  currentPhase.color === 'blue'    ? 'from-blue-500 to-indigo-400' :
                  currentPhase.color === 'purple'  ? 'from-purple-500 to-pink-400' :
                                                     'from-amber-500 to-yellow-400'
                }`} style={{ width: `${Math.round(progressToNextPhase * 100)}%` }} />
              </div>
              <p className="text-[9px] text-right text-gray-600 mt-0.5">
                ${Math.max(0, currentPhase.maxBalance - currentBalance + 1).toLocaleString(undefined, { maximumFractionDigits: 0 })} to unlock next phase
              </p>
            </div>
            <div>
              <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                <span>Overall goal</span>
                <span className="font-semibold text-emerald-400">{Math.round(progressToGoal * 100)}% complete</span>
              </div>
              <div className="h-2.5 rounded-full bg-gray-700/60 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-700"
                  style={{ width: `${Math.round(progressToGoal * 100)}%` }} />
              </div>
              <div className="flex justify-between text-[9px] text-gray-600 mt-0.5">
                <span>${startingBalance.toLocaleString()} start</span>
                <span>${goalBalance.toLocaleString()} goal</span>
              </div>
            </div>
          </div>

          {/* Quick stat pills */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {[
              { label: "Trades", value: String(closedTrades.length) },
              { label: "Win Rate", value: `${winRate}%` },
              { label: "R:R", value: rr > 0 ? `${rr.toFixed(1)}:1` : "—" },
              { label: "Weeks Active", value: String(weeksActive || 1) },
            ].map(s => (
              <div key={s.label} className="bg-gray-800/50 rounded-lg p-2 text-center">
                <p className="text-[9px] text-gray-500">{s.label}</p>
                <p className="text-xs font-bold text-gray-200">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Balance update form */}
          {showBalanceEdit && (
            <div className="mt-1 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-2">
              {/* Account picker — auto-fills balance from live account */}
              <ConnectedAccountPicker
                label="Sync from connected account"
                compact
                onSelect={(acct) => {
                  if (acct && acct.balance > 0) {
                    setNewBalance(String(Math.round(acct.balance * 100) / 100));
                  }
                }}
              />
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <DollarSign className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                  <Input value={newBalance} onChange={e => setNewBalance(e.target.value)}
                    type="number" placeholder={`New balance (e.g. ${Math.round(currentBalance * 1.05)})`}
                    className="bg-gray-800 border-gray-600 text-white text-sm h-9 pl-7" />
                </div>
                <Button size="sm" className="h-9 bg-emerald-600 hover:bg-emerald-500 font-semibold"
                  onClick={() => updateBalanceMutation.mutate({ currentBalance: parseFloat(newBalance) })}
                  disabled={!newBalance || updateBalanceMutation.isPending}>
                  {updateBalanceMutation.isPending ? "..." : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 4 — SMART POSITION SIZER
            Pre-trade — calculate size BEFORE entering any position.
        ═══════════════════════════════════════════════════════════════════ */}
        <div id="sizer" className="bg-gray-900/50 border border-blue-500/20 rounded-2xl p-4 scroll-mt-20">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-4 h-4 text-blue-400" />
            <p className="font-semibold text-sm text-gray-200">Step 3 — Size Your Position</p>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Do this <span className="text-blue-300 font-semibold">before every trade.</span> Enter your pair and stop loss to get the exact lot size for your phase.
          </p>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Trading Pair</label>
              <Input value={sizerSymbol} onChange={e => setSizerSymbol(e.target.value.toUpperCase())}
                placeholder="EURUSD" className="bg-gray-800 border-gray-600 text-white h-9 text-sm" />
            </div>
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Stop Loss (pips)</label>
              <Input value={sizerSL} onChange={e => setSizerSL(e.target.value)}
                type="number" min="1" placeholder="20"
                className="bg-gray-800 border-gray-600 text-white h-9 text-sm" />
            </div>
          </div>

          {recommendedLots > 0 && slPips > 0 ? (
            <div className="grid grid-cols-3 gap-2 p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 mb-3">
              <div className="text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">Lot Size</p>
                <p className="text-2xl font-black text-blue-300">{recommendedLots.toFixed(2)}</p>
                <p className="text-[9px] text-gray-500">lots</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">$ at Risk</p>
                <p className="text-2xl font-black text-amber-300">${riskAmountUsd.toFixed(2)}</p>
                <p className="text-[9px] text-gray-500">{currentRiskPct}% of balance</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] text-gray-400 mb-0.5">Max Trades</p>
                <p className="text-2xl font-black text-gray-300">{currentPhase.maxTrades}</p>
                <p className="text-[9px] text-gray-500">this phase</p>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-gray-800/50 border border-gray-700/30 mb-3">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <p className="text-xs text-gray-400">Enter your stop loss in pips to get your lot size recommendation.</p>
            </div>
          )}

          {/* After sizing — go get your signal */}
          {recommendedLots > 0 && slPips > 0 && (
            <div className="flex items-center gap-2 p-2.5 rounded-xl bg-amber-500/8 border border-amber-500/20">
              <span className="text-base">📡</span>
              <p className="text-[11px] text-amber-200 flex-1">Now get your signal — use Weekly Strategy or Analysis</p>
              <div className="flex gap-1.5 shrink-0">
                <a href="/weekly-strategy"
                  className="text-[10px] bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 px-2 py-1 rounded-lg font-semibold transition-colors">
                  Strategy
                </a>
                <a href="/analysis"
                  className="text-[10px] bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 px-2 py-1 rounded-lg font-semibold transition-colors">
                  Analysis
                </a>
              </div>
            </div>
          )}

          {/* Phase risk table (collapsed) */}
          <details className="mt-3">
            <summary className="text-[11px] text-gray-500 cursor-pointer hover:text-gray-300 flex items-center gap-1">
              <ChevronDown className="w-3 h-3" /> All phase risk levels
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-700/50">
                    <th className="text-left py-1.5 pr-2">Phase</th>
                    <th className="text-right py-1.5 px-2">Balance Range</th>
                    <th className="text-right py-1.5 px-2">Risk %</th>
                    <th className="text-right py-1.5 pl-2">Max Trades</th>
                  </tr>
                </thead>
                <tbody>
                  {PHASES.map(p => {
                    const risk = p.riskPct[riskProfile];
                    const isActive = p.id === currentPhase.id;
                    const isUnlocked = currentBalance >= p.minBalance;
                    return (
                      <tr key={p.id} className={`border-b border-gray-700/30 ${isActive ? 'bg-white/5' : ''}`}>
                        <td className="py-1.5 pr-2">
                          <span className="mr-1">{p.emoji}</span>
                          <span className={isActive ? 'text-white font-semibold' : isUnlocked ? 'text-gray-300' : 'text-gray-600'}>{p.name}</span>
                          {isActive && <span className="ml-1 text-emerald-400 font-bold">← you</span>}
                        </td>
                        <td className={`text-right px-2 ${isUnlocked ? 'text-gray-300' : 'text-gray-600'}`}>
                          ${p.minBalance.toLocaleString()}{p.maxBalance < Infinity ? `–$${p.maxBalance.toLocaleString()}` : '+'}
                        </td>
                        <td className={`text-right px-2 font-semibold ${isActive ? 'text-emerald-400' : isUnlocked ? 'text-gray-300' : 'text-gray-600'}`}>
                          {isUnlocked ? `${risk}%` : <Lock className="w-3 h-3 inline" />}
                        </td>
                        <td className={`text-right pl-2 ${isUnlocked ? 'text-gray-300' : 'text-gray-600'}`}>
                          {isUnlocked ? p.maxTrades : <Lock className="w-3 h-3 inline" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 5 — MARKET METERS (quick links)
            Direct links to the meters already on the platform.
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <p className="font-semibold text-sm text-gray-200">Step 6 — Check the Meters</p>
          </div>
          <p className="text-[11px] text-gray-500 mb-3">
            Before and after each trade, check these live readings to confirm conditions are right for your phase strategy.
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: "Market Mood",      sub: "Bull / Bear reading",        emoji: "🌡️", link: "/market-mood",      color: "from-rose-500/20 to-pink-500/10     border-rose-500/20"    },
              { label: "Market Sentiment", sub: "Long vs short pressure",      emoji: "⚖️", link: "/market-sentiment", color: "from-blue-500/20 to-cyan-500/10     border-blue-500/20"    },
              { label: "Volatility Meter", sub: "Expansion/contraction",       emoji: "📈", link: "/volatility-meter", color: "from-amber-500/20 to-yellow-500/10  border-amber-500/20"   },
              { label: "Market Insights",  sub: "AI-powered pair analysis",    emoji: "🤖", link: "/market-insights",  color: "from-emerald-500/20 to-teal-500/10  border-emerald-500/20" },
              { label: "Weekly Strategy",  sub: "Your AI trade plan",          emoji: "🗓️", link: "/weekly-strategy",  color: "from-indigo-500/20 to-purple-500/10 border-indigo-500/20"  },
              { label: "Analysis",         sub: "Multi-timeframe + AI 2nd Op", emoji: "🔍", link: "/analysis",         color: "from-teal-500/20 to-cyan-500/10     border-teal-500/20"    },
            ].map(m => (
              <a key={m.label} href={m.link}
                className={`flex items-center gap-2.5 p-3 rounded-xl border bg-gradient-to-br ${m.color} hover:opacity-80 transition-opacity`}>
                <span className="text-xl shrink-0">{m.emoji}</span>
                <div>
                  <p className="text-xs font-bold text-gray-200">{m.label}</p>
                  <p className="text-[9px] text-gray-500">{m.sub}</p>
                </div>
                <ArrowRight className="w-3 h-3 text-gray-600 ml-auto shrink-0" />
              </a>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 6 — TRADE LOG
            Log trades immediately after closing. Feeds balance update prompt.
        ═══════════════════════════════════════════════════════════════════ */}
        <div id="tradelog" className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4 scroll-mt-20">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-teal-400" />
              <p className="font-semibold text-sm text-gray-200">Step 5 — Trade Log</p>
              <span className="text-[10px] text-gray-500">{trades.length} trade{trades.length !== 1 ? 's' : ''}</span>
            </div>
            <Button size="sm" className="h-7 text-xs bg-teal-600 hover:bg-teal-500 font-semibold"
              onClick={() => setShowTradeForm(!showTradeForm)}>
              <Plus className="w-3 h-3 mr-1" /> Log Trade
            </Button>
          </div>

          {/* Inline guidance tip */}
          {trades.length === 0 && !showTradeForm && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-teal-500/8 border border-teal-500/20 mb-3">
              <span className="text-base">📒</span>
              <div>
                <p className="text-xs font-semibold text-teal-300 mb-0.5">Log every trade you take</p>
                <p className="text-[10px] text-gray-400">After your trade closes, tap "Log Trade" above. Your balance automatically updates, the phase engine checks for a promotion, and your stats build over time.</p>
              </div>
            </div>
          )}

          {/* Trade form */}
          {showTradeForm && (
            <div className="mb-4 p-3 rounded-xl border border-teal-500/30 bg-teal-500/5 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Pair</label>
                  <Input value={tradeForm.symbol} onChange={e => setTradeForm(p => ({ ...p, symbol: e.target.value.toUpperCase() }))}
                    className="bg-gray-800 border-gray-600 text-white h-8 text-xs" placeholder="EURUSD" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Direction</label>
                  <select value={tradeForm.direction} onChange={e => setTradeForm(p => ({ ...p, direction: e.target.value }))}
                    className="w-full h-8 bg-gray-800 border border-gray-600 text-white text-xs rounded-md px-2">
                    <option value="long">Long (Buy)</option>
                    <option value="short">Short (Sell)</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Entry Price</label>
                  <Input value={tradeForm.entryPrice} onChange={e => setTradeForm(p => ({ ...p, entryPrice: e.target.value }))}
                    type="number" step="any" className="bg-gray-800 border-gray-600 text-white h-8 text-xs" placeholder="1.0850" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Exit Price</label>
                  <Input value={tradeForm.exitPrice} onChange={e => setTradeForm(p => ({ ...p, exitPrice: e.target.value }))}
                    type="number" step="any" className="bg-gray-800 border-gray-600 text-white h-8 text-xs" placeholder="(if closed)" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Lot Size</label>
                  <Input value={tradeForm.lotSize} onChange={e => setTradeForm(p => ({ ...p, lotSize: e.target.value }))}
                    type="number" step="0.01" className="bg-gray-800 border-gray-600 text-white h-8 text-xs" placeholder="0.01" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">P&L (USD)</label>
                  <Input value={tradeForm.pnlUsd} onChange={e => setTradeForm(p => ({ ...p, pnlUsd: e.target.value }))}
                    type="number" step="0.01" className="bg-gray-800 border-gray-600 text-white h-8 text-xs" placeholder="+25.00 or -12.00" />
                </div>
                <div>
                  <label className="text-[10px] text-gray-400 block mb-1">Notes</label>
                  <Input value={tradeForm.notes} onChange={e => setTradeForm(p => ({ ...p, notes: e.target.value }))}
                    className="bg-gray-800 border-gray-600 text-white h-8 text-xs" placeholder="Optional" />
                </div>
              </div>
              <Button onClick={() => logTradeMutation.mutate({
                symbol: tradeForm.symbol, direction: tradeForm.direction,
                entryPrice: tradeForm.entryPrice ? parseFloat(tradeForm.entryPrice) : undefined,
                exitPrice: tradeForm.exitPrice ? parseFloat(tradeForm.exitPrice) : undefined,
                lotSize: tradeForm.lotSize ? parseFloat(tradeForm.lotSize) : undefined,
                pnlUsd: tradeForm.pnlUsd ? parseFloat(tradeForm.pnlUsd) : undefined,
                pnlPct: tradeForm.pnlUsd && currentBalance > 0 ? parseFloat(tradeForm.pnlUsd) / currentBalance * 100 : undefined,
                riskUsd: riskAmountUsd > 0 ? riskAmountUsd : undefined,
                phaseAtEntry: currentPhase.id,
                notes: tradeForm.notes || undefined,
              })} disabled={logTradeMutation.isPending || !tradeForm.symbol}
                className="w-full h-8 bg-teal-600 hover:bg-teal-500 text-xs font-semibold">
                {logTradeMutation.isPending ? "Saving..." : "Log This Trade"}
              </Button>
            </div>
          )}

          {/* Trade list */}
          {trades.length > 0 && (
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {trades.slice(0, 50).map((t: any) => {
                const pnl = t.pnl_usd || 0;
                const isWin = pnl > 0;
                const phase = PHASES.find(p => p.id === t.phase_at_entry);
                return (
                  <div key={t.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${isWin ? 'border-emerald-500/20 bg-emerald-500/5' : pnl < 0 ? 'border-red-500/20 bg-red-500/5' : 'border-gray-700/30 bg-gray-800/30'}`}>
                    <span className="text-xs font-bold text-gray-300 w-16 shrink-0">{t.symbol}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${t.direction === 'long' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                      {t.direction === 'long' ? 'BUY' : 'SELL'}
                    </span>
                    {phase && <span className="text-[9px] text-gray-500">{phase.emoji}</span>}
                    <span className="flex-1 text-[10px] text-gray-500 truncate">{t.notes || '—'}</span>
                    {pnl !== 0 && (
                      <span className={`text-xs font-bold shrink-0 ${isWin ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isWin ? '+' : ''}${pnl.toFixed(2)}
                      </span>
                    )}
                    <span className={`text-[9px] shrink-0 ${t.status === 'open' ? 'text-amber-400' : 'text-gray-500'}`}>
                      {t.status === 'open' ? '⏳' : '✅'}
                    </span>
                    <button onClick={() => deleteTradeMutation.mutate(t.id)}
                      className="text-gray-600 hover:text-red-400 shrink-0 transition-colors">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* After logging, prompt balance update */}
          {trades.length > 0 && (
            <div className="mt-3 flex items-center gap-2 p-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <span className="text-base">💰</span>
              <p className="text-[11px] text-gray-400 flex-1">Trade logged? Scroll up to <span className="text-emerald-400 font-semibold">update your balance</span> so the phase engine can check for promotion.</p>
              <button
                onClick={() => { setShowBalanceEdit(true); document.getElementById('balance')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}
                className="shrink-0 text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded-lg font-semibold transition-colors whitespace-nowrap">
                Update ↑
              </button>
            </div>
          )}
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 7 — GROWTH CHART
            Visual proof of compounding. Below the action items.
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-purple-400" />
            <p className="font-semibold text-sm text-gray-200">Projected Growth Curve</p>
            <span className="text-[10px] text-gray-500">@ {plan?.weekly_target_pct || 3}%/week compounded</span>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={projectionData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#6b7280' }} interval={7} tickFormatter={v => `W${v}`} />
              <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} tickFormatter={v => `$${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 11 }}
                formatter={(val: any) => [`$${Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, 'Projected']}
                labelFormatter={l => `Week ${l}`} />
              {goalBalance > 0 && (
                <ReferenceLine y={goalBalance} stroke="#f59e0b" strokeDasharray="4 2"
                  label={{ value: 'Goal', fill: '#f59e0b', fontSize: 9 }} />
              )}
              <ReferenceLine y={currentBalance} stroke="#10b981" strokeDasharray="4 2"
                label={{ value: 'Now', fill: '#10b981', fontSize: 9 }} />
              <Area type="monotone" dataKey="projected" stroke="#8b5cf6" fill="url(#growthGrad)" strokeWidth={2} dot={false} />
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-gray-500 text-center mt-1">
            At {plan?.weekly_target_pct || 3}%/week, goal reached around week&nbsp;
            {projectionData.findIndex(d => d.projected >= goalBalance) > -1
              ? projectionData.findIndex(d => d.projected >= goalBalance)
              : "52+"}
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 8 — MILESTONES
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <Trophy className="w-4 h-4 text-amber-400" />
            <p className="font-semibold text-sm text-gray-200">Milestones</p>
            <span className="text-[10px] text-gray-500">{earnedMilestones.length}/{ACCOUNT_MILESTONES.length} earned</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {ACCOUNT_MILESTONES.map(m => {
              const earned = m.check(plan, trades);
              return (
                <div key={m.id} className={`flex items-center gap-2 p-2.5 rounded-xl border transition-all ${earned ? 'border-amber-500/40 bg-amber-500/10' : 'border-gray-700/30 bg-gray-800/20 opacity-50'}`}>
                  <span className="text-base shrink-0">{earned ? m.emoji : '🔒'}</span>
                  <p className={`text-[11px] font-medium leading-tight ${earned ? 'text-amber-200' : 'text-gray-500'}`}>{m.label}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 9 — PHASE ROADMAP
            Full roadmap — last section, for reference not daily action.
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="bg-gray-900/50 border border-gray-700/40 rounded-2xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <p className="font-semibold text-sm text-gray-200">Growth Roadmap</p>
            <span className="text-[10px] text-gray-500">— your full journey</span>
          </div>
          <div className="space-y-2">
            {PHASES.map(p => {
              const isActive = p.id === currentPhase.id;
              const isPast = currentBalance >= p.minBalance && p.id < currentPhase.id;
              const isLocked = currentBalance < p.minBalance;
              const risk = p.riskPct[riskProfile];
              return (
                <div key={p.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${isActive ? phaseColor[p.color] : isPast ? 'border-gray-600/30 bg-gray-800/20' : 'border-gray-700/20 bg-gray-800/10 opacity-40'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${isActive ? 'bg-current/10' : isPast ? 'bg-gray-700/50' : 'bg-gray-800/50'}`}>
                    {isPast ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : isLocked ? <Lock className="w-3.5 h-3.5 text-gray-600" /> : p.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className={`text-xs font-bold ${isActive ? '' : isPast ? 'text-gray-400' : 'text-gray-600'}`}>
                        Phase {p.id}: {p.name}
                      </p>
                      {isActive && <span className="text-[9px] bg-current/20 px-1.5 py-0.5 rounded-full font-bold">ACTIVE</span>}
                    </div>
                    <p className={`text-[10px] mt-0.5 ${isActive ? 'opacity-70' : 'text-gray-600'}`}>{p.description}</p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className={`text-[9px] ${isActive ? 'opacity-60' : 'text-gray-600'}`}>${p.minBalance.toLocaleString()}{p.maxBalance < Infinity ? `–$${p.maxBalance.toLocaleString()}` : '+'}</span>
                      <span className={`text-[9px] font-semibold ${isActive ? '' : 'text-gray-600'}`}>{risk}% risk</span>
                      <span className={`text-[9px] ${isActive ? 'opacity-60' : 'text-gray-600'}`}>max {p.maxTrades} trade{p.maxTrades !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[10px] text-gray-600 text-center pb-2">
          Position sizing is a guide based on your phase settings. Always verify your broker's margin requirements. Past performance does not guarantee future results.
        </p>
      </div>
    </div>

    {/* ── Phase Promotion Celebration Modal ── */}
    {promotionModal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setPromotionModal(null)} />
        <div className="relative z-10 w-full max-w-sm bg-gray-900 border border-gray-700/60 rounded-3xl overflow-hidden shadow-2xl">
          <div className={`h-2 w-full bg-gradient-to-r ${
            promotionModal.newPhase.color === 'emerald' ? 'from-emerald-500 to-teal-400' :
            promotionModal.newPhase.color === 'teal'    ? 'from-teal-500 to-cyan-400' :
            promotionModal.newPhase.color === 'cyan'    ? 'from-cyan-500 to-blue-400' :
            promotionModal.newPhase.color === 'blue'    ? 'from-blue-500 to-indigo-400' :
            promotionModal.newPhase.color === 'purple'  ? 'from-purple-500 to-pink-400' :
                                                          'from-amber-500 to-yellow-400'
          }`} />
          <div className="p-6 text-center">
            <div className="text-6xl mb-3 animate-bounce">{promotionModal.newPhase.emoji}</div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-1">Phase Unlocked</p>
            <h2 className="text-2xl font-black text-white mb-0.5">Phase {promotionModal.newPhase.id} — {promotionModal.newPhase.name}</h2>
            <p className="text-xs text-gray-400 mb-5">You leveled up from {promotionModal.oldPhase.emoji} {promotionModal.oldPhase.name}</p>
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className={`p-3 rounded-2xl border ${phaseColor[promotionModal.newPhase.color]}`}>
                <p className="text-[10px] opacity-60 mb-1">New Risk / Trade</p>
                <p className="text-2xl font-black">{promotionModal.riskPct}%</p>
                <p className="text-[10px] opacity-50">per position</p>
              </div>
              <div className={`p-3 rounded-2xl border ${phaseColor[promotionModal.newPhase.color]}`}>
                <p className="text-[10px] opacity-60 mb-1">Max Open Trades</p>
                <p className="text-2xl font-black">{promotionModal.maxTrades}</p>
                <p className="text-[10px] opacity-50">simultaneous</p>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-xl bg-white/5 border border-white/10 text-left mb-5">
              <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-gray-300 italic">"{promotionModal.newPhase.tip}"</p>
            </div>
            <p className="text-xs text-gray-400 mb-6">{promotionModal.newPhase.description}</p>
            <Button
              className="w-full h-11 font-bold text-sm bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white border-0"
              onClick={() => setPromotionModal(null)}>
              Let's Go {promotionModal.newPhase.emoji}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
