import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, Send, RefreshCw, TrendingUp, TrendingDown, Target, Lightbulb,
  Sparkles, Wand2, Download, Save, Check, Cpu, BookOpen, Bot,
  MessageSquare, BarChart2, Radio, ChevronRight, Phone, Mail,
  Users, Bell, Map, Layers, Zap, DollarSign, Trophy,
  HelpCircle, ExternalLink, Play, Image, ChevronDown, ChevronUp,
} from "lucide-react";
import { TradePerformanceCard, TodayReviewPanel, AiHealthStrip } from "@/components/trade-performance-card";

interface GeneratedEA {
  name: string; description: string; pair: string; timeframe: string;
  mql5Code: string; filename: string; parsedStrategy?: any;
}

interface AbbaPlan {
  ready: boolean;
  message?: string;
  diagnosis?: string;
  nextDayPlan?: {
    favorPairs?: string[]; avoidPairs?: string[]; bestSessions?: string[];
    recommendedMinConfidence?: number; sizingNote?: string; strategyFocus?: string;
  };
  weeklyAdjustments?: string[];
  setups?: Array<{ pair: string; bias: string; rationale: string }>;
  goalAssessment?: string;
  narrative?: string;
  context?: { goal?: { weeklyTarget: number; currentProfit: number; progressPct: number } };
  generatedAt?: string;
}

interface DailyData {
  date: string;
  balance: number | null;
  openTrades: number;
  today: { pnl: number; trades: number; wins: number; losses: number; winRate: number };
  overall: { pnl: number; trades: number; winRate: number };
  goal: { weeklyTarget: number; currentProfit: number; progressPct: number };
  bestPairs: Array<{ pair: string; pnl: number; trades: number }>;
  worstPairs: Array<{ pair: string; pnl: number; trades: number }>;
  bySession: Array<{ session: string; trades: number; winRate: number; pnl: number }>;
}

type StepMedia =
  | { type: "youtube"; videoId: string; caption: string }
  | { type: "image"; url: string; caption: string }
  | { type: "video"; url: string; caption: string };

interface GuideStep {
  text: string;
  media?: StepMedia;
}

interface OnboardingGuide {
  title: string;
  intro: string;
  heroVideo?: { type: "youtube"; videoId: string; caption: string };
  steps: GuideStep[];
  tips: string[];
  nextPage?: string;
}

// ── Inline YouTube embed ─────────────────────────────────────────────────────
function YouTubeEmbed({ videoId, caption }: { videoId: string; caption: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2.5 rounded-xl overflow-hidden border border-gray-700/60 bg-black/30">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/40 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-red-600/20 border border-red-500/30 flex items-center justify-center flex-shrink-0 group-hover:bg-red-600/30">
            <Play className="w-5 h-5 text-red-400 fill-red-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[11px] text-red-400 font-semibold">Watch Video</p>
            <p className="text-[10px] text-gray-400 truncate">{caption}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        </button>
      ) : (
        <div>
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`}
              title={caption}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
          <button
            onClick={() => setExpanded(false)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] text-gray-500 hover:text-gray-300 border-t border-gray-700/40"
          >
            <ChevronUp className="w-3 h-3" /> Collapse video
          </button>
        </div>
      )}
    </div>
  );
}

// ── Inline image viewer ──────────────────────────────────────────────────────
function InlineImage({ url, caption }: { url: string; caption: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2.5 rounded-xl overflow-hidden border border-gray-700/60 bg-black/30">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/40 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
            <Image className="w-5 h-5 text-blue-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[11px] text-blue-400 font-semibold">View Screenshot</p>
            <p className="text-[10px] text-gray-400 truncate">{caption}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        </button>
      ) : (
        <div>
          <img
            src={url}
            alt={caption}
            className="w-full object-contain max-h-64 bg-black/50"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="px-3 py-2 border-t border-gray-700/40 flex items-center justify-between">
            <p className="text-[10px] text-gray-400">{caption}</p>
            <button onClick={() => setExpanded(false)} className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1">
              <ChevronUp className="w-3 h-3" /> Collapse
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Inline video player ──────────────────────────────────────────────────────
function InlineVideo({ url, caption }: { url: string; caption: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="mt-2.5 rounded-xl overflow-hidden border border-gray-700/60 bg-black/30">
      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full flex items-center gap-3 p-3 hover:bg-gray-800/40 transition-colors group"
        >
          <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
            <Play className="w-5 h-5 text-purple-400 fill-purple-400" />
          </div>
          <div className="text-left flex-1 min-w-0">
            <p className="text-[11px] text-purple-400 font-semibold">Watch Demo Video</p>
            <p className="text-[10px] text-gray-400 truncate">{caption}</p>
          </div>
          <ChevronDown className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        </button>
      ) : (
        <div>
          <video controls className="w-full max-h-64" src={url}>
            Your browser does not support video playback.
          </video>
          <button
            onClick={() => setExpanded(false)}
            className="w-full flex items-center justify-center gap-1.5 py-2 text-[10px] text-gray-500 hover:text-gray-300 border-t border-gray-700/40"
          >
            <ChevronUp className="w-3 h-3" /> Collapse
          </button>
        </div>
      )}
    </div>
  );
}

// ── Step media renderer ──────────────────────────────────────────────────────
function StepMediaBlock({ media }: { media: StepMedia }) {
  if (media.type === "youtube") return <YouTubeEmbed videoId={media.videoId} caption={media.caption} />;
  if (media.type === "image")   return <InlineImage url={media.url} caption={media.caption} />;
  if (media.type === "video")   return <InlineVideo url={media.url} caption={media.caption} />;
  return null;
}

type ChatMsg = { role: "user" | "assistant"; content: string };
type AbbaTab = "manual" | "bot" | "daily" | "outreach" | "setup";

const QUICK_PROMPTS = [
  "How did my trades do today?",
  "What pairs should I focus on tomorrow?",
  "Why are my losses happening?",
  "How do I hit my weekly goal?",
  "Set up MT5 step by step",
  "Connect my futures account",
  "How does the prop firm mode work?",
  "What is my best trading session?",
  "How do I earn VEDD tokens?",
  "Walk me through copy trading setup",
];

const SETUP_TOPICS = [
  { id: "mt5",          label: "Connect MT5",          icon: <Layers className="w-4 h-4" />,    color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/25" },
  { id: "futures",      label: "Futures Engine",        icon: <Zap className="w-4 h-4" />,       color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/25" },
  { id: "kalshi",       label: "Kalshi API",             icon: <Radio className="w-4 h-4" />,     color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/25" },
  { id: "ambassador",   label: "Ambassador Program",    icon: <Users className="w-4 h-4" />,     color: "text-purple-400",  bg: "bg-purple-500/10 border-purple-500/25" },
  { id: "prop_firm",    label: "Prop Firm Challenge",   icon: <Trophy className="w-4 h-4" />,    color: "text-rose-400",    bg: "bg-rose-500/10 border-rose-500/25" },
  { id: "ea_generator", label: "Build & Install EA",   icon: <Cpu className="w-4 h-4" />,       color: "text-cyan-400",    bg: "bg-cyan-500/10 border-cyan-500/25" },
];

export default function AbbaBotPage() {
  const { data: plan, isFetching, refetch } = useQuery<AbbaPlan>({
    queryKey: ["/api/abba/strategist"],
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: dailyData, isLoading: dailyLoading } = useQuery<DailyData>({
    queryKey: ["/api/abba/accounts-daily"],
    refetchInterval: 30 * 1000,
  });

  const [activeTab, setActiveTab] = useState<AbbaTab>("bot");
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState("");

  const applyPlan = async () => {
    const np2 = plan?.nextDayPlan;
    if (!np2 || applying) return;
    setApplying(true); setApplied("");
    try {
      const patch: any = {};
      if (np2.favorPairs?.length) patch.pairs = np2.favorPairs;
      if (np2.recommendedMinConfidence) patch.minConfidence = np2.recommendedMinConfidence;
      const res = await apiRequest("PATCH", "/api/vedd-live-engine/config", patch);
      const data = await res.json();
      setApplied(data?.success ? "Applied to your live engine ✓" : (data?.error || "Start the engine first, then apply."));
    } catch {
      setApplied("Start the engine first, then apply.");
    } finally {
      setApplying(false);
    }
  };

  // ── Chat state ──────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "Hey! I'm Abba — your personal AI assistant for everything on the VEDD platform.\n\nI can see all your trades, P&L, win rates, and account data. I can also walk you through setting up MT5, the futures engine, Kalshi, and more.\n\nWhat do you need?" },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async (overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    setInput("");
    const next = [...messages, { role: "user" as const, content: text }];
    setMessages(next);
    setSending(true);
    try {
      const res = await apiRequest("POST", "/api/abba/chat", { message: text, history: next.slice(-9, -1) });
      const data = await res.json();
      setMessages(m => [...m, { role: "assistant", content: data.reply || data.error || "No response." }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", content: "Connection issue — try again in a moment." }]);
    } finally {
      setSending(false);
    }
  };

  // ── EA builder ──────────────────────────────────────────────────────────────
  const [eaInput, setEaInput] = useState("");
  const [eaBuilding, setEaBuilding] = useState(false);
  const [generatedEA, setGeneratedEA] = useState<GeneratedEA | null>(null);
  const [eaSaved, setEaSaved] = useState(false);
  const [eaError, setEaError] = useState("");

  const buildEA = async (descOverride?: string) => {
    const desc = (descOverride ?? eaInput).trim();
    if (!desc || eaBuilding) return;
    setEaBuilding(true); setEaError(""); setEaSaved(false); setGeneratedEA(null);
    try {
      const res = await apiRequest("POST", "/api/abba/generate-ea", { message: desc });
      const data = await res.json();
      if (data.error) setEaError(data.error);
      else { setGeneratedEA(data); setEaInput(desc); }
    } catch {
      setEaError("Couldn't generate the EA — try again or add more detail.");
    } finally {
      setEaBuilding(false);
    }
  };

  const downloadEA = () => {
    if (!generatedEA) return;
    const blob = new Blob([generatedEA.mql5Code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = generatedEA.filename; a.click();
    URL.revokeObjectURL(url);
  };

  const saveEA = async () => {
    if (!generatedEA) return;
    try {
      await apiRequest("POST", "/api/save-ea", {
        name: generatedEA.name, description: generatedEA.description,
        platformType: "MT5", eaCode: generatedEA.mql5Code,
        symbol: generatedEA.pair, strategyType: "abba_custom",
      });
      setEaSaved(true);
    } catch { setEaError("Save failed — try again."); }
  };

  // ── Outreach state ──────────────────────────────────────────────────────────
  const [outTarget, setOutTarget] = useState<"user" | "ambassador" | "admin" | "lead">("user");
  const [outChannel, setOutChannel] = useState<"sms" | "email" | "both">("sms");
  const [outPhone, setOutPhone] = useState("");
  const [outEmail, setOutEmail] = useState("");
  const [outSubject, setOutSubject] = useState("");
  const [outMessage, setOutMessage] = useState("");
  const [outSending, setOutSending] = useState(false);
  const [outResult, setOutResult] = useState<{ success?: boolean; error?: string } | null>(null);

  const sendOutreach = async () => {
    if (!outMessage.trim() || outSending) return;
    setOutSending(true); setOutResult(null);
    try {
      const res = await apiRequest("POST", "/api/abba/notify", {
        target: outTarget, channel: outChannel,
        phone: outPhone || undefined, email: outEmail || undefined,
        subject: outSubject || undefined, message: outMessage,
      });
      const data = await res.json();
      setOutResult({ success: data.success });
      if (data.success) { setOutMessage(""); setOutSubject(""); }
    } catch {
      setOutResult({ success: false, error: "Failed to send — check phone/email and try again." });
    } finally {
      setOutSending(false);
    }
  };

  // ── Daily report send ───────────────────────────────────────────────────────
  const [reportPhone, setReportPhone] = useState("");
  const [reportEmail, setReportEmail] = useState("");
  const [reportChannel, setReportChannel] = useState<"sms" | "email" | "both">("sms");
  const [reportSending, setReportSending] = useState(false);
  const [reportResult, setReportResult] = useState<string | null>(null);

  const sendDailyReport = async () => {
    setReportSending(true); setReportResult(null);
    try {
      const res = await apiRequest("POST", "/api/abba/daily-report", {
        phone: reportPhone || undefined, email: reportEmail || undefined, channel: reportChannel,
      });
      const data = await res.json();
      setReportResult(data.success ? "Report sent! ✓" : (data.error || "Failed to send."));
    } catch {
      setReportResult("Failed to send — try again.");
    } finally {
      setReportSending(false);
    }
  };

  // ── Setup guide state ───────────────────────────────────────────────────────
  const [setupTopic, setSetupTopic] = useState<string | null>(null);
  const [guide, setGuide] = useState<OnboardingGuide | null>(null);
  const [guideLoading, setGuideLoading] = useState(false);

  const loadGuide = async (topic: string) => {
    setSetupTopic(topic); setGuide(null); setGuideLoading(true);
    try {
      const res = await apiRequest("GET", `/api/abba/onboarding/${topic}`);
      const data = await res.json();
      setGuide(data);
    } catch {
      setGuide(null);
    } finally {
      setGuideLoading(false);
    }
  };

  const np = plan?.nextDayPlan;

  const TABS = [
    { id: "bot"      as AbbaTab, label: "Chat",        icon: <Bot     className="w-3.5 h-3.5" /> },
    { id: "manual"   as AbbaTab, label: "Strategy",    icon: <BookOpen className="w-3.5 h-3.5" /> },
    { id: "daily"    as AbbaTab, label: "Daily Report", icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: "outreach" as AbbaTab, label: "Outreach",    icon: <Bell    className="w-3.5 h-3.5" /> },
    { id: "setup"    as AbbaTab, label: "Setup Guides", icon: <Map     className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-[#080B14] text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)", boxShadow: "0 0 18px rgba(139,92,246,0.3)" }}>
            <Brain className="w-6 h-6 text-purple-300" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Abba — Your AI Personal Assistant</h1>
            <p className="text-[11px] text-gray-500">Sees every trade · guides every setup · connected to your whole platform</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => refetch()} disabled={isFetching}
              className="flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-500/10 border border-purple-500/25 rounded-lg px-3 py-1.5 disabled:opacity-50">
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              {isFetching ? "Analyzing…" : "Re-analyze"}
            </button>
            <a href="/dashboard" className="flex items-center gap-1 text-[11px] text-gray-400 bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-1.5 hover:text-white hover:border-gray-500 transition-all">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              Close
            </a>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 p-1 bg-gray-900/60 border border-gray-800 rounded-xl mb-5 overflow-x-auto">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-shrink-0 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all ${
                activeTab === tab.id ? "bg-purple-600 text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── Chat tab ──────────────────────────────────────────────────────── */}
        {activeTab === "bot" && (
          <div className="space-y-4">
            {/* Quick prompts */}
            <div className="flex gap-2 flex-wrap">
              {QUICK_PROMPTS.slice(0, 6).map(q => (
                <button key={q} onClick={() => send(q)} disabled={sending}
                  className="text-[10px] px-2.5 py-1.5 rounded-lg bg-gray-800/70 border border-gray-700 text-gray-300 hover:border-purple-500/50 hover:text-purple-200 transition-all disabled:opacity-40">
                  {q}
                </button>
              ))}
            </div>

            {/* Chat window */}
            <div className="rounded-2xl border border-purple-800/40 bg-gray-900/40 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-300" />
                <span className="text-sm font-bold text-purple-200">Talk to Abba</span>
                <span className="ml-auto text-[10px] text-gray-600">Knows your trades · your plan · every platform feature</span>
              </div>
              <div ref={scrollRef} className="max-h-[480px] overflow-y-auto p-3 space-y-2">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    {m.role === "assistant" && (
                      <div className="w-6 h-6 rounded-full bg-purple-600/30 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                        <Brain className="w-3 h-3 text-purple-300" />
                      </div>
                    )}
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "bg-purple-600/30 text-purple-50" : "bg-gray-800/70 text-gray-200"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="w-6 h-6 rounded-full bg-purple-600/30 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                      <Brain className="w-3 h-3 text-purple-300 animate-pulse" />
                    </div>
                    <div className="bg-gray-800/70 text-gray-400 rounded-2xl px-3 py-2 text-[12px]">Abba is thinking…</div>
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-gray-800 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="Ask anything — trades, setup, strategy, platform help…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-purple-500"
                />
                <button onClick={() => send()} disabled={sending || !input.trim()}
                  className="bg-purple-600/40 hover:bg-purple-600/60 border border-purple-500/40 rounded-xl px-3 disabled:opacity-50">
                  <Send className="w-4 h-4 text-purple-200" />
                </button>
              </div>
            </div>

            {/* EA Builder */}
            <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-amber-300" />
                <span className="text-sm font-bold text-amber-200">Build an MT5 EA from words</span>
              </div>
              <div className="p-3">
                <textarea value={eaInput} onChange={e => setEaInput(e.target.value)}
                  placeholder='e.g. "Buy XAUUSD when RSI < 30 and price is above 200 EMA, 1% risk, 2:1 reward, London session only."'
                  rows={3} className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-amber-500 resize-none" />
                <button onClick={() => buildEA()} disabled={eaBuilding || !eaInput.trim()}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 bg-amber-600/30 hover:bg-amber-600/50 border border-amber-500/40 text-amber-100 text-xs font-bold rounded-lg py-2.5 disabled:opacity-50">
                  <Cpu className={`w-4 h-4 ${eaBuilding ? "animate-pulse" : ""}`} />
                  {eaBuilding ? "Abba is coding your EA…" : "Generate EA"}
                </button>
                {eaError && <p className="text-[10px] text-red-400 mt-2">{eaError}</p>}
                {generatedEA && (
                  <div className="mt-3 rounded-xl bg-black/30 border border-amber-700/40 p-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-bold text-amber-200">{generatedEA.name}</span>
                      <span className="text-[9px] text-gray-500">{generatedEA.pair} · {generatedEA.timeframe}</span>
                    </div>
                    <p className="text-[11px] text-gray-300 mb-2">{generatedEA.description}</p>
                    <pre className="text-[9px] text-gray-400 bg-black/40 rounded-lg p-2 max-h-40 overflow-auto whitespace-pre">
                      {generatedEA.mql5Code.slice(0, 1200)}{generatedEA.mql5Code.length > 1200 ? "\n…(download for full code)" : ""}
                    </pre>
                    <div className="flex gap-2 mt-2">
                      <button onClick={downloadEA} className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-200 text-xs font-bold rounded-lg py-2">
                        <Download className="w-3.5 h-3.5" />Download .mq5
                      </button>
                      <button onClick={saveEA} disabled={eaSaved} className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 text-xs font-bold rounded-lg py-2 disabled:opacity-60">
                        {eaSaved ? <><Check className="w-3.5 h-3.5" />Saved</> : <><Save className="w-3.5 h-3.5" />Save to My EAs</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Strategy tab ──────────────────────────────────────────────────── */}
        {activeTab === "manual" && (
          <div className="space-y-3">
            <AiHealthStrip />
            <TradePerformanceCard />
            <TodayReviewPanel />

            {plan && !plan.ready && (
              <div className="rounded-2xl p-4 bg-gray-900/40 border border-gray-800">
                <p className="text-xs text-gray-400">{plan.message}</p>
              </div>
            )}

            {plan?.ready && (
              <>
                {plan.goalAssessment && (
                  <div className="rounded-2xl p-4" style={{ background: "rgba(139,92,246,0.08)", border: "1.5px solid rgba(139,92,246,0.25)" }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <Target className="w-4 h-4 text-purple-300" />
                      <span className="text-sm font-bold text-purple-200">Goal Assessment</span>
                      {plan.context?.goal && (
                        <span className="ml-auto text-[11px] text-gray-400">{plan.context.goal.progressPct}% to target</span>
                      )}
                    </div>
                    <p className="text-[12px] text-gray-200 leading-relaxed">{plan.goalAssessment}</p>
                  </div>
                )}
                {plan.diagnosis && (
                  <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Sparkles className="w-4 h-4 text-amber-300" />
                      <span className="text-sm font-bold text-amber-200">Diagnosis</span>
                    </div>
                    <p className="text-[12px] text-gray-200 leading-relaxed">{plan.diagnosis}</p>
                  </div>
                )}
                {np && (
                  <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                    <p className="text-sm font-bold text-emerald-300 mb-2">Tomorrow's Plan</p>
                    <div className="grid grid-cols-2 gap-2 text-[11px]">
                      {!!np.favorPairs?.length && <div className="bg-emerald-500/10 rounded-lg p-2"><p className="text-emerald-400 font-bold mb-0.5">Favor</p><p className="text-gray-300">{np.favorPairs.join(", ")}</p></div>}
                      {!!np.avoidPairs?.length && <div className="bg-red-500/10 rounded-lg p-2"><p className="text-red-400 font-bold mb-0.5">Avoid</p><p className="text-gray-300">{np.avoidPairs.join(", ")}</p></div>}
                      {!!np.bestSessions?.length && <div className="bg-blue-500/10 rounded-lg p-2"><p className="text-blue-300 font-bold mb-0.5">Best sessions</p><p className="text-gray-300">{np.bestSessions.join(", ")}</p></div>}
                      {np.recommendedMinConfidence != null && <div className="bg-purple-500/10 rounded-lg p-2"><p className="text-purple-300 font-bold mb-0.5">Min confidence</p><p className="text-gray-300">{np.recommendedMinConfidence}%</p></div>}
                    </div>
                    {np.strategyFocus && <p className="text-[11px] text-gray-300 mt-2"><span className="text-gray-500">Strategy: </span>{np.strategyFocus}</p>}
                    {np.sizingNote && <p className="text-[11px] text-gray-300 mt-1"><span className="text-gray-500">Sizing: </span>{np.sizingNote}</p>}
                    <button onClick={applyPlan} disabled={applying}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 text-xs font-bold rounded-lg py-2 disabled:opacity-50">
                      <Check className="w-3.5 h-3.5" />
                      {applying ? "Applying…" : "Apply to Live Engine"}
                    </button>
                    {applied && <p className="text-[10px] text-center mt-1.5 text-gray-400">{applied}</p>}
                  </div>
                )}
                {!!plan.weeklyAdjustments?.length && (
                  <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                    <p className="text-sm font-bold text-cyan-300 mb-2">Weekly Adjustments</p>
                    <ul className="space-y-1">
                      {plan.weeklyAdjustments.map((a, i) => <li key={i} className="text-[12px] text-gray-200 flex gap-1.5"><span className="text-gray-600">→</span>{a}</li>)}
                    </ul>
                  </div>
                )}
                {!!plan.setups?.length && (
                  <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                    <p className="text-sm font-bold text-yellow-300 mb-2 flex items-center gap-1.5"><Lightbulb className="w-4 h-4" />High-Accuracy Setups to Watch</p>
                    <div className="space-y-1.5">
                      {plan.setups.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 bg-black/25 rounded-lg p-2">
                          {s.bias === "BUY" ? <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" /> : <TrendingDown className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
                          <div><span className="text-[12px] font-bold text-white">{s.pair} {s.bias}</span><p className="text-[11px] text-gray-400">{s.rationale}</p></div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {plan.narrative && (
                  <div className="rounded-2xl p-4" style={{ background: "rgba(16,185,129,0.06)", border: "1.5px solid rgba(16,185,129,0.2)" }}>
                    <p className="text-[12px] text-gray-200 leading-relaxed italic">{plan.narrative}</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Daily Report tab ──────────────────────────────────────────────── */}
        {activeTab === "daily" && (
          <div className="space-y-4">
            {dailyLoading ? (
              <div className="rounded-2xl p-8 bg-gray-900/40 border border-gray-800 text-center text-gray-500 text-sm">Loading account data…</div>
            ) : dailyData ? (
              <>
                {/* P&L summary */}
                <div className="rounded-2xl p-5" style={{ background: "rgba(139,92,246,0.07)", border: "1.5px solid rgba(139,92,246,0.2)" }}>
                  <p className="text-[11px] text-gray-500 mb-1">{new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' })}</p>
                  <div className="flex items-end gap-3">
                    <p className={`text-3xl font-black ${dailyData.today.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}
                      style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {dailyData.today.pnl >= 0 ? "+" : ""}${dailyData.today.pnl.toFixed(2)}
                    </p>
                    <p className="text-gray-400 text-sm mb-1">today</p>
                  </div>
                  <div className="flex gap-4 mt-2 text-[12px]">
                    <span className="text-gray-400">{dailyData.today.trades} trades</span>
                    <span className="text-emerald-400">{dailyData.today.wins}W</span>
                    <span className="text-red-400">{dailyData.today.losses}L</span>
                    <span className="text-gray-300">{dailyData.today.winRate}% WR</span>
                  </div>
                </div>

                {/* Goal progress */}
                <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-400" />
                      <span className="text-sm font-bold text-white">Weekly Goal</span>
                    </div>
                    <span className="text-[11px] text-gray-400">${dailyData.goal.currentProfit.toFixed(2)} / ${dailyData.goal.weeklyTarget}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2.5">
                    <div className="bg-purple-500 rounded-full h-2.5 transition-all"
                      style={{ width: `${Math.min(dailyData.goal.progressPct, 100)}%` }} />
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">{dailyData.goal.progressPct}% complete</p>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Account Balance", value: dailyData.balance != null ? `$${dailyData.balance.toFixed(2)}` : "N/A", color: "text-white" },
                    { label: "Open Trades", value: String(dailyData.openTrades), color: "text-blue-300" },
                    { label: "All-Time P&L", value: `${dailyData.overall.pnl >= 0 ? "+" : ""}$${dailyData.overall.pnl.toFixed(2)}`, color: dailyData.overall.pnl >= 0 ? "text-emerald-400" : "text-red-400" },
                    { label: "Overall Win Rate", value: `${dailyData.overall.winRate}%`, color: "text-purple-300" },
                  ].map(s => (
                    <div key={s.label} className="bg-gray-900/60 border border-gray-800 rounded-xl p-3">
                      <p className="text-[10px] text-gray-500 mb-1">{s.label}</p>
                      <p className={`text-lg font-bold ${s.color}`} style={{ fontVariantNumeric: 'tabular-nums' }}>{s.value}</p>
                    </div>
                  ))}
                </div>

                {/* Best/Worst pairs */}
                {(dailyData.bestPairs.length > 0 || dailyData.worstPairs.length > 0) && (
                  <div className="grid grid-cols-2 gap-3">
                    {dailyData.bestPairs.length > 0 && (
                      <div className="rounded-xl p-3 bg-emerald-500/5 border border-emerald-500/20">
                        <p className="text-[10px] text-emerald-400 font-bold mb-2">Best Pairs Today</p>
                        {dailyData.bestPairs.map(p => (
                          <div key={p.pair} className="flex justify-between text-[11px] mb-1">
                            <span className="text-white font-mono">{p.pair}</span>
                            <span className="text-emerald-400">+${p.pnl.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {dailyData.worstPairs.length > 0 && (
                      <div className="rounded-xl p-3 bg-red-500/5 border border-red-500/20">
                        <p className="text-[10px] text-red-400 font-bold mb-2">Worst Pairs Today</p>
                        {dailyData.worstPairs.map(p => (
                          <div key={p.pair} className="flex justify-between text-[11px] mb-1">
                            <span className="text-white font-mono">{p.pair}</span>
                            <span className="text-red-400">${p.pnl.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Send daily report */}
                <div className="rounded-2xl border border-blue-800/40 bg-blue-950/10 p-4 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Bell className="w-4 h-4 text-blue-300" />
                    <span className="text-sm font-bold text-blue-200">Send This Report to Yourself</span>
                  </div>
                  <div className="flex gap-2">
                    {(["sms", "email", "both"] as const).map(ch => (
                      <button key={ch} onClick={() => setReportChannel(ch)}
                        className={`flex-1 py-1.5 rounded-lg text-[11px] font-semibold border transition-all ${reportChannel === ch ? "bg-blue-600/40 border-blue-500/60 text-blue-100" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
                        {ch.toUpperCase()}
                      </button>
                    ))}
                  </div>
                  {(reportChannel === "sms" || reportChannel === "both") && (
                    <input value={reportPhone} onChange={e => setReportPhone(e.target.value)}
                      placeholder="Phone number (+1...)"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-blue-500" />
                  )}
                  {(reportChannel === "email" || reportChannel === "both") && (
                    <input value={reportEmail} onChange={e => setReportEmail(e.target.value)}
                      placeholder="Email address"
                      className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-blue-500" />
                  )}
                  <button onClick={sendDailyReport} disabled={reportSending || (!reportPhone && !reportEmail)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-100 text-xs font-bold rounded-lg py-2.5 disabled:opacity-50">
                    <Bell className={`w-3.5 h-3.5 ${reportSending ? "animate-pulse" : ""}`} />
                    {reportSending ? "Sending…" : "Send Daily Report"}
                  </button>
                  {reportResult && <p className={`text-[11px] text-center ${reportResult.includes("✓") ? "text-emerald-400" : "text-red-400"}`}>{reportResult}</p>}
                </div>
              </>
            ) : (
              <div className="rounded-2xl p-8 bg-gray-900/40 border border-gray-800 text-center">
                <p className="text-gray-400 text-sm">No account data yet. Connect MT5 or your futures account to see daily P&L.</p>
                <button onClick={() => setActiveTab("setup")} className="mt-3 text-[11px] text-purple-300 border border-purple-500/30 rounded-lg px-4 py-2">
                  → View Setup Guides
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Outreach tab ──────────────────────────────────────────────────── */}
        {activeTab === "outreach" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: "rgba(139,92,246,0.07)", border: "1.5px solid rgba(139,92,246,0.2)" }}>
              <p className="text-sm font-bold text-purple-200 mb-1 flex items-center gap-2"><MessageSquare className="w-4 h-4" />Abba Outreach — Lead & Network Automation</p>
              <p className="text-[11px] text-gray-400">Send texts and emails to users, ambassadors, leads, or admin directly through Abba. Powered by Twilio SMS and SendGrid email.</p>
            </div>

            {/* Target */}
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Send to:</p>
              <div className="grid grid-cols-4 gap-2">
                {(["user", "ambassador", "admin", "lead"] as const).map(t => (
                  <button key={t} onClick={() => setOutTarget(t)}
                    className={`py-2 rounded-lg text-[11px] font-semibold border capitalize transition-all ${outTarget === t ? "bg-purple-600/40 border-purple-500/60 text-purple-100" : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"}`}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Channel */}
            <div>
              <p className="text-[11px] text-gray-500 mb-2">Channel:</p>
              <div className="grid grid-cols-3 gap-2">
                {(["sms", "email", "both"] as const).map(ch => (
                  <button key={ch} onClick={() => setOutChannel(ch)}
                    className={`py-2 rounded-lg text-[11px] font-semibold border transition-all ${outChannel === ch ? "bg-blue-600/40 border-blue-500/60 text-blue-100" : "bg-gray-800 border-gray-700 text-gray-400"}`}>
                    {ch === "sms" ? <span className="flex items-center justify-center gap-1"><Phone className="w-3 h-3" />SMS</span>
                      : ch === "email" ? <span className="flex items-center justify-center gap-1"><Mail className="w-3 h-3" />Email</span>
                      : <span className="flex items-center justify-center gap-1"><Bell className="w-3 h-3" />Both</span>}
                  </button>
                ))}
              </div>
            </div>

            {/* Contact fields */}
            {(outChannel === "sms" || outChannel === "both") && (
              <input value={outPhone} onChange={e => setOutPhone(e.target.value)}
                placeholder="Phone number (+1...)"
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-purple-500" />
            )}
            {(outChannel === "email" || outChannel === "both") && (
              <>
                <input value={outEmail} onChange={e => setOutEmail(e.target.value)}
                  placeholder="Email address"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-purple-500" />
                <input value={outSubject} onChange={e => setOutSubject(e.target.value)}
                  placeholder="Subject (optional)"
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-purple-500" />
              </>
            )}

            {/* Message */}
            <textarea value={outMessage} onChange={e => setOutMessage(e.target.value)}
              placeholder={outTarget === "lead"
                ? "Hey [name], I wanted to follow up about VEDD — the AI trading platform I mentioned…"
                : outTarget === "ambassador"
                ? "Hey ambassador! Quick update on your leads and commissions this week…"
                : "Message…"}
              rows={5}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-purple-500 resize-none" />

            {/* Message templates */}
            <div className="space-y-1">
              <p className="text-[10px] text-gray-600 mb-1">Quick templates:</p>
              {[
                { label: "Follow-up on VEDD", msg: "Hey! Just following up — have you had a chance to check out the VEDD AI trading platform? It auto-trades forex and futures 24/5 using AI. Happy to walk you through it." },
                { label: "Ambassador check-in", msg: "Hey! Checking in on how your ambassador work is going. Let me know if you need any content, referral links refreshed, or commission questions answered." },
                { label: "Daily P&L update", msg: `Today's trading report is ready on VEDD. Log in at the VEDD app to see your full daily P&L, win rate, and tomorrow's AI plan from Abba.` },
                { label: "New feature announcement", msg: "Big update on VEDD — we just launched new features including volume profile chart analysis, prop firm challenge mode, and the full ABBA personal assistant. Log in to explore." },
              ].map(t => (
                <button key={t.label} onClick={() => setOutMessage(t.msg)}
                  className="w-full text-left text-[10px] px-3 py-2 bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 rounded-lg text-gray-400 hover:text-white transition-all">
                  {t.label}
                </button>
              ))}
            </div>

            <button onClick={sendOutreach} disabled={outSending || !outMessage.trim() || (!outPhone && !outEmail)}
              className="w-full flex items-center justify-center gap-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-100 text-sm font-bold rounded-xl py-3 disabled:opacity-50">
              {outSending ? <><Bell className="w-4 h-4 animate-pulse" />Sending…</> : <><Send className="w-4 h-4" />Send via Abba</>}
            </button>
            {outResult && (
              <p className={`text-[12px] text-center font-semibold ${outResult.success ? "text-emerald-400" : "text-red-400"}`}>
                {outResult.success ? "Message sent successfully ✓" : outResult.error || "Failed — check credentials and try again."}
              </p>
            )}
          </div>
        )}

        {/* ── Setup Guides tab ──────────────────────────────────────────────── */}
        {activeTab === "setup" && (
          <div className="space-y-4">
            <div className="rounded-2xl p-4" style={{ background: "rgba(139,92,246,0.07)", border: "1.5px solid rgba(139,92,246,0.2)" }}>
              <p className="text-sm font-bold text-purple-200 mb-1 flex items-center gap-2"><Map className="w-4 h-4" />Step-by-Step Setup Guides</p>
              <p className="text-[11px] text-gray-400">Choose any setup below and Abba will walk you through it step by step.</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {SETUP_TOPICS.map(t => (
                <button key={t.id} onClick={() => loadGuide(t.id)}
                  className={`rounded-xl p-4 border text-left transition-all hover:scale-[1.02] active:scale-[0.98] ${t.bg} ${setupTopic === t.id ? "ring-2 ring-purple-500/50" : ""}`}>
                  <div className={`mb-2 ${t.color}`}>{t.icon}</div>
                  <p className={`text-sm font-bold ${t.color}`}>{t.label}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Video + step guide</p>
                </button>
              ))}
            </div>

            {guideLoading && (
              <div className="rounded-2xl p-8 bg-gray-900/40 border border-gray-800 text-center text-gray-500 text-sm animate-pulse">
                Abba is loading your guide…
              </div>
            )}

            {guide && !guideLoading && (
              <div className="rounded-2xl bg-gray-900/50 border border-gray-800 overflow-hidden">
                {/* Guide header */}
                <div className="p-4 border-b border-gray-800 space-y-1">
                  <h3 className="text-sm font-bold text-white">{guide.title}</h3>
                  {guide.intro && (
                    <p className="text-[11px] text-gray-400 leading-relaxed">{guide.intro}</p>
                  )}
                </div>

                {/* Hero video — watch this first */}
                {guide.heroVideo && (
                  <div className="px-4 pt-4">
                    <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                      <Play className="w-3 h-3 fill-red-400" /> Watch First
                    </p>
                    <YouTubeEmbed videoId={guide.heroVideo.videoId} caption={guide.heroVideo.caption} />
                  </div>
                )}

                <div className="p-4 space-y-4">
                  {/* Steps */}
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider">
                    Step-by-Step Guide ({guide.steps.length} steps)
                  </p>
                  {guide.steps.map((step, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className="w-6 h-6 rounded-full bg-purple-600/30 border border-purple-500/30 flex items-center justify-center flex-shrink-0 text-[10px] font-bold text-purple-300">
                          {i + 1}
                        </div>
                        {i < guide.steps.length - 1 && (
                          <div className="w-px flex-1 bg-gray-800 mt-1.5 min-h-[16px]" />
                        )}
                      </div>
                      <div className="flex-1 pb-2">
                        <p className="text-[12px] text-gray-200 leading-relaxed">{step.text}</p>
                        {step.media && <StepMediaBlock media={step.media} />}
                      </div>
                    </div>
                  ))}

                  {/* Pro tips */}
                  {guide.tips.length > 0 && (
                    <div className="rounded-xl bg-amber-500/5 border border-amber-500/15 p-3 space-y-2">
                      <p className="text-[10px] text-amber-400 font-semibold uppercase tracking-wider">Pro Tips from Abba</p>
                      {guide.tips.map((tip, i) => (
                        <div key={i} className="flex gap-2 text-[11px] text-gray-300">
                          <span className="text-amber-400 flex-shrink-0 mt-px">💡</span>
                          <span>{tip}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* CTA buttons */}
                  <div className="space-y-2 pt-1">
                    {guide.nextPage && (
                      <a href={guide.nextPage}
                        className="w-full flex items-center justify-center gap-2 bg-purple-600/30 hover:bg-purple-600/50 border border-purple-500/40 text-purple-100 text-xs font-bold rounded-lg py-2.5">
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open {guide.nextPage} in VEDD
                      </a>
                    )}
                    <button
                      onClick={() => {
                        send(`Walk me through ${SETUP_TOPICS.find(t => t.id === setupTopic)?.label} step by step. I'm a beginner — explain everything clearly.`);
                        setActiveTab("bot");
                      }}
                      className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs font-semibold rounded-lg py-2.5"
                    >
                      <Bot className="w-3.5 h-3.5" />
                      Ask Abba to walk me through this live
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <p className="text-[9px] text-gray-600 mt-4 text-center">
          Abba analyzes your real trade data for education and planning. Not licensed financial advice. Trading involves risk.
        </p>
      </div>
    </div>
  );
}
