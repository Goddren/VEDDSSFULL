import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import {
  Brain, Send, RefreshCw, TrendingUp, TrendingDown, Target, Lightbulb,
  Sparkles, Wand2, Download, Save, Check, Cpu, BookOpen, Bot,
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

type ChatMsg = { role: "user" | "assistant"; content: string };
type AbbaTab = "manual" | "bot";

export default function AbbaBotPage() {
  // ── Shared data layer — single fetch, both tabs read from here ───────────
  const { data: plan, isFetching, refetch } = useQuery<AbbaPlan>({
    queryKey: ["/api/abba/strategist"],
    refetchInterval: 5 * 60 * 1000,
  });

  // ── Tab state ────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<AbbaTab>("manual");

  // ── Manual tab: apply plan ───────────────────────────────────────────────
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

  // ── Bot tab: chat ────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "I'm Abba — I can see all your trades, win rates, pairs, sessions and your weekly goal. Ask me anything: why a day went bad, what to change tomorrow, which setups to watch, or how to hit your target." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, sending]);

  const send = async () => {
    const text = input.trim();
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

  // ── Bot tab: EA builder ──────────────────────────────────────────────────
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
      if (data.error) { setEaError(data.error); }
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
    const a = document.createElement("a");
    a.href = url; a.download = generatedEA.filename; a.click();
    URL.revokeObjectURL(url);
  };

  const saveEA = async () => {
    if (!generatedEA) return;
    try {
      await apiRequest("POST", "/api/save-ea", {
        name: generatedEA.name,
        description: generatedEA.description,
        platformType: "MT5",
        eaCode: generatedEA.mql5Code,
        symbol: generatedEA.pair,
        strategyType: "abba_custom",
      });
      setEaSaved(true);
    } catch { setEaError("Save failed — try again."); }
  };

  const np = plan?.nextDayPlan;

  return (
    <div className="min-h-screen bg-[#080B14] text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)", boxShadow: "0 0 18px rgba(139,92,246,0.3)" }}>
            <Brain className="w-6 h-6 text-purple-300" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Abba — AI Strategist</h1>
            <p className="text-[11px] text-gray-500">Sees every trade · adapts your plan · explains the why</p>
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
        <div className="flex gap-1 p-1 bg-gray-900/60 border border-gray-800 rounded-xl mb-5">
          {([
            { id: "manual" as AbbaTab, label: "Manual Review", icon: <BookOpen className="w-3.5 h-3.5" /> },
            { id: "bot"    as AbbaTab, label: "Abba Bot",      icon: <Bot     className="w-3.5 h-3.5" /> },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-purple-600 text-white shadow-lg"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Manual tab ─────────────────────────────────────────────────── */}
        {activeTab === "manual" && (
          <div className="space-y-3">

            {/* Shared performance widgets — same data, no extra calls */}
            <AiHealthStrip />
            <TradePerformanceCard />
            <TodayReviewPanel />

            {/* Adaptive plan */}
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
                      {!!np.favorPairs?.length && (
                        <div className="bg-emerald-500/10 rounded-lg p-2">
                          <p className="text-emerald-400 font-bold mb-0.5">Favor</p>
                          <p className="text-gray-300">{np.favorPairs.join(", ")}</p>
                        </div>
                      )}
                      {!!np.avoidPairs?.length && (
                        <div className="bg-red-500/10 rounded-lg p-2">
                          <p className="text-red-400 font-bold mb-0.5">Avoid</p>
                          <p className="text-gray-300">{np.avoidPairs.join(", ")}</p>
                        </div>
                      )}
                      {!!np.bestSessions?.length && (
                        <div className="bg-blue-500/10 rounded-lg p-2">
                          <p className="text-blue-300 font-bold mb-0.5">Best sessions</p>
                          <p className="text-gray-300">{np.bestSessions.join(", ")}</p>
                        </div>
                      )}
                      {np.recommendedMinConfidence != null && (
                        <div className="bg-purple-500/10 rounded-lg p-2">
                          <p className="text-purple-300 font-bold mb-0.5">Min confidence</p>
                          <p className="text-gray-300">{np.recommendedMinConfidence}%</p>
                        </div>
                      )}
                    </div>
                    {np.strategyFocus && (
                      <p className="text-[11px] text-gray-300 mt-2"><span className="text-gray-500">Strategy: </span>{np.strategyFocus}</p>
                    )}
                    {np.sizingNote && (
                      <p className="text-[11px] text-gray-300 mt-1"><span className="text-gray-500">Sizing: </span>{np.sizingNote}</p>
                    )}
                    <button onClick={applyPlan} disabled={applying}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 text-xs font-bold rounded-lg py-2 disabled:opacity-50">
                      <Check className="w-3.5 h-3.5" />
                      {applying ? "Applying…" : "Apply to Live Engine (pairs + confidence)"}
                    </button>
                    {applied && <p className="text-[10px] text-center mt-1.5 text-gray-400">{applied}</p>}
                  </div>
                )}

                {!!plan.weeklyAdjustments?.length && (
                  <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                    <p className="text-sm font-bold text-cyan-300 mb-2">Weekly Adjustments</p>
                    <ul className="space-y-1">
                      {plan.weeklyAdjustments.map((a, i) => (
                        <li key={i} className="text-[12px] text-gray-200 flex gap-1.5">
                          <span className="text-gray-600">→</span>{a}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!!plan.setups?.length && (
                  <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                    <p className="text-sm font-bold text-yellow-300 mb-2 flex items-center gap-1.5">
                      <Lightbulb className="w-4 h-4" />High-Accuracy Setups to Watch
                    </p>
                    <div className="space-y-1.5">
                      {plan.setups.map((s, i) => (
                        <div key={i} className="flex items-start gap-2 bg-black/25 rounded-lg p-2">
                          {s.bias === "BUY"
                            ? <TrendingUp className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                            : <TrendingDown className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
                          <div>
                            <span className="text-[12px] font-bold text-white">{s.pair} {s.bias}</span>
                            <p className="text-[11px] text-gray-400">{s.rationale}</p>
                          </div>
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

            {/* Prompt to switch to Bot tab */}
            <button
              onClick={() => setActiveTab("bot")}
              className="w-full flex items-center justify-center gap-2 bg-purple-600/10 hover:bg-purple-600/20 border border-purple-600/30 text-purple-300 text-xs font-semibold rounded-xl py-3 transition-colors"
            >
              <Bot className="w-4 h-4" /> Switch to Abba Bot — chat or build an EA
            </button>
          </div>
        )}

        {/* ── Bot tab ────────────────────────────────────────────────────── */}
        {activeTab === "bot" && (
          <div className="space-y-4">

            {/* EA Builder */}
            <div className="rounded-2xl border border-amber-800/40 bg-amber-950/20 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                <Wand2 className="w-4 h-4 text-amber-300" />
                <span className="text-sm font-bold text-amber-200">Build a Strategy / EA from words</span>
              </div>
              <div className="p-3">
                <p className="text-[10px] text-gray-500 mb-2">
                  Describe a strategy in plain English and Abba writes a ready-to-run MT5 Expert Advisor. e.g. "Buy XAUUSD when RSI drops below 30 and price is above the 200 EMA, 1% risk, 2:1 reward, trade London session only."
                </p>
                <textarea
                  value={eaInput}
                  onChange={e => setEaInput(e.target.value)}
                  placeholder="Describe your trading strategy…"
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-amber-500 resize-none"
                />
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
                      {generatedEA.mql5Code.slice(0, 1200)}
                      {generatedEA.mql5Code.length > 1200 ? "\n… (download for full code)" : ""}
                    </pre>
                    <div className="flex gap-2 mt-2">
                      <button onClick={downloadEA}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-200 text-xs font-bold rounded-lg py-2">
                        <Download className="w-3.5 h-3.5" />Download .mq5
                      </button>
                      <button onClick={saveEA} disabled={eaSaved}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-200 text-xs font-bold rounded-lg py-2 disabled:opacity-60">
                        {eaSaved
                          ? <><Check className="w-3.5 h-3.5" />Saved to My EAs</>
                          : <><Save className="w-3.5 h-3.5" />Save to My EAs</>}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Chat */}
            <div className="rounded-2xl border border-purple-800/40 bg-gray-900/40 overflow-hidden">
              <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
                <Brain className="w-4 h-4 text-purple-300" />
                <span className="text-sm font-bold text-purple-200">Talk to Abba</span>
              </div>
              <div ref={scrollRef} className="max-h-[420px] overflow-y-auto p-3 space-y-2">
                {messages.map((m, i) => (
                  <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${
                      m.role === "user" ? "bg-purple-600/30 text-purple-50" : "bg-gray-800/70 text-gray-200"
                    }`}>
                      {m.content}
                    </div>
                  </div>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="bg-gray-800/70 text-gray-400 rounded-2xl px-3 py-2 text-[12px]">Abba is thinking…</div>
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-gray-800 flex gap-2">
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && send()}
                  placeholder="Ask Abba about your trades, plan, or goal…"
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-[12px] text-white outline-none focus:border-purple-500"
                />
                <button onClick={send} disabled={sending || !input.trim()}
                  className="bg-purple-600/40 hover:bg-purple-600/60 border border-purple-500/40 rounded-xl px-3 disabled:opacity-50">
                  <Send className="w-4 h-4 text-purple-200" />
                </button>
              </div>
              {messages.some(m => m.role === "user") && (
                <button
                  onClick={() => {
                    const lastUser = [...messages].reverse().find(m => m.role === "user");
                    if (lastUser) { setEaInput(lastUser.content); buildEA(lastUser.content); }
                  }}
                  disabled={eaBuilding}
                  className="w-full flex items-center justify-center gap-1.5 bg-amber-600/20 hover:bg-amber-600/40 border-t border-amber-700/40 text-amber-200 text-[11px] font-semibold py-2 disabled:opacity-50">
                  <Wand2 className="w-3.5 h-3.5" />Build an EA from my last message
                </button>
              )}
            </div>

          </div>
        )}

        <p className="text-[9px] text-gray-600 mt-3 text-center">
          Abba analyzes your real trade data for education and planning. Not licensed financial advice. Trading involves risk.
        </p>
      </div>
    </div>
  );
}
