import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Brain, Send, RefreshCw, TrendingUp, TrendingDown, Target, Lightbulb, Sparkles } from "lucide-react";
import { TradePerformanceCard, TodayReviewPanel } from "@/components/trade-performance-card";

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

export default function AbbaBotPage() {
  const { data: plan, isFetching, refetch } = useQuery<AbbaPlan>({
    queryKey: ["/api/abba/strategist"],
    refetchInterval: 5 * 60 * 1000,
  });

  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "assistant", content: "I'm Abba — I can see all your trades, win rates, pairs, sessions and your weekly goal. Ask me anything: why a day went bad, what to change tomorrow, which setups to watch, or how to hit your target." },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

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
    } catch (e: any) {
      setMessages(m => [...m, { role: "assistant", content: "Connection issue — try again in a moment." }]);
    } finally {
      setSending(false);
    }
  };

  const np = plan?.nextDayPlan;

  return (
    <div className="min-h-screen bg-[#080B14] text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center" style={{ background: "rgba(139,92,246,0.2)", boxShadow: "0 0 18px rgba(139,92,246,0.3)" }}>
            <Brain className="w-6 h-6 text-purple-300" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">Abba — AI Strategist</h1>
            <p className="text-[11px] text-gray-500">Sees every trade · adapts your plan · explains the why</p>
          </div>
          <button onClick={() => refetch()} disabled={isFetching}
            className="ml-auto flex items-center gap-1.5 text-[11px] text-purple-300 bg-purple-500/10 border border-purple-500/25 rounded-lg px-3 py-1.5 disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
            {isFetching ? "Analyzing…" : "Re-analyze"}
          </button>
        </div>

        {/* Live performance + today review */}
        <div className="space-y-3 mb-4">
          <TradePerformanceCard />
          <TodayReviewPanel />
        </div>

        {/* Adaptive plan */}
        {plan && !plan.ready && (
          <div className="rounded-2xl p-4 bg-gray-900/40 border border-gray-800 mb-4">
            <p className="text-xs text-gray-400">{plan.message}</p>
          </div>
        )}

        {plan?.ready && (
          <div className="space-y-3 mb-5">
            {plan.goalAssessment && (
              <div className="rounded-2xl p-4" style={{ background: "rgba(139,92,246,0.08)", border: "1.5px solid rgba(139,92,246,0.25)" }}>
                <div className="flex items-center gap-2 mb-1.5"><Target className="w-4 h-4 text-purple-300" /><span className="text-sm font-bold text-purple-200">Goal Assessment</span>
                  {plan.context?.goal && <span className="ml-auto text-[11px] text-gray-400">{plan.context.goal.progressPct}% to target</span>}
                </div>
                <p className="text-[12px] text-gray-200 leading-relaxed">{plan.goalAssessment}</p>
              </div>
            )}

            {plan.diagnosis && (
              <div className="rounded-2xl p-4 bg-gray-900/50 border border-gray-800">
                <div className="flex items-center gap-2 mb-1.5"><Sparkles className="w-4 h-4 text-amber-300" /><span className="text-sm font-bold text-amber-200">Diagnosis</span></div>
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
          </div>
        )}

        {/* Chat */}
        <div className="rounded-2xl border border-purple-800/40 bg-gray-900/40 overflow-hidden">
          <div className="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
            <Brain className="w-4 h-4 text-purple-300" /><span className="text-sm font-bold text-purple-200">Talk to Abba</span>
          </div>
          <div ref={scrollRef} className="max-h-[420px] overflow-y-auto p-3 space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[12px] leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-purple-600/30 text-purple-50" : "bg-gray-800/70 text-gray-200"}`}>
                  {m.content}
                </div>
              </div>
            ))}
            {sending && <div className="flex justify-start"><div className="bg-gray-800/70 text-gray-400 rounded-2xl px-3 py-2 text-[12px]">Abba is thinking…</div></div>}
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
        </div>
        <p className="text-[9px] text-gray-600 mt-2 text-center">Abba analyzes your real trade data for education and planning. Not licensed financial advice. Trading involves risk.</p>
      </div>
    </div>
  );
}
