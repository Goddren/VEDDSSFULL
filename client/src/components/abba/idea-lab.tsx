// Idea Lab: the card ABBA shows when a trader agrees to an idea, and the list
// of their saved ideas (shadow-tested filters on their personal brain).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Lightbulb, Check, Pause, Play, Trash2 } from "lucide-react";

export type IdeaDraft = {
  title: string; rationale: string; rule: any; summary: string;
  evidence: { verdict: string; trades: { wouldSkip: number; skipWins: number; skipLosses: number; skipPnl: number }; shadows: { wouldSkip: number; skipR: number } };
};

const money = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;

export function IdeaDraftCard({ draft }: { draft: IdeaDraft }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");
  const save = async () => {
    setState("saving"); setErr("");
    try {
      const r = await apiRequest("POST", "/api/abba/ideas", { title: draft.title, rule: draft.rule, rationale: draft.rationale });
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      setState("saved");
      queryClient.invalidateQueries({ queryKey: ["/api/abba/ideas"] });
    } catch (e: any) { setState("error"); setErr(e.message || "Couldn't save"); }
  };
  const t = draft.evidence.trades, s = draft.evidence.shadows;
  return (
    <div className="mt-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-[12px] text-gray-200 space-y-1.5">
      <div className="flex items-center gap-1.5 font-bold text-amber-300"><Lightbulb className="w-3.5 h-3.5" />{draft.title}</div>
      <div className="text-gray-300">{draft.summary}</div>
      {draft.rationale && <div className="text-gray-400 italic">"{draft.rationale}"</div>}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="rounded-lg bg-gray-900/60 p-2">
          <div className="text-[10px] text-gray-500">Your real trades it would skip</div>
          <div className="font-bold">{t.wouldSkip} <span className="font-normal text-gray-400">({t.skipWins}W / {t.skipLosses}L)</span></div>
          {t.wouldSkip > 0 && <div className={t.skipPnl < 0 ? "text-emerald-400" : "text-red-400"}>{money(t.skipPnl)}</div>}
        </div>
        <div className="rounded-lg bg-gray-900/60 p-2">
          <div className="text-[10px] text-gray-500">Model 1/2 shadow trades it would skip</div>
          <div className="font-bold">{s.wouldSkip}</div>
          {s.wouldSkip > 0 && <div className={s.skipR < 0 ? "text-emerald-400" : "text-red-400"}>{s.skipR >= 0 ? "+" : ""}{s.skipR}R</div>}
        </div>
      </div>
      <div className="text-gray-400">{draft.evidence.verdict}</div>
      {state === "saved" ? (
        <div className="flex items-center gap-1 text-emerald-400 font-semibold"><Check className="w-3.5 h-3.5" />Added to your brain. Testing in shadow mode.</div>
      ) : (
        <button onClick={save} disabled={state === "saving"}
          className="w-full rounded-lg bg-amber-500 text-black font-bold py-1.5 disabled:opacity-60">
          {state === "saving" ? "Adding…" : "Add to my brain (shadow test)"}
        </button>
      )}
      {state === "error" && <div className="text-red-400">{err}</div>}
      <div className="text-[10px] text-gray-500">Ideas only filter signals. Nothing goes live without approval.</div>
    </div>
  );
}

export function MyIdeasPanel() {
  const { data } = useQuery<{ ideas: any[] }>({ queryKey: ["/api/abba/ideas"] });
  const ideas = data?.ideas || [];
  const setStatus = async (id: number, status: string) => {
    await apiRequest("PATCH", `/api/abba/ideas/${id}`, { status });
    queryClient.invalidateQueries({ queryKey: ["/api/abba/ideas"] });
  };
  if (!ideas.length) return null;
  return (
    <div className="rounded-2xl border border-amber-700/40 bg-gray-900/40 p-3 space-y-2">
      <div className="flex items-center gap-2 text-sm font-bold text-amber-300"><Lightbulb className="w-4 h-4" />My brain ideas</div>
      {ideas.map((i) => (
        <div key={i.id} className="rounded-lg bg-gray-800/60 p-2 text-[12px]">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-100">{i.title}</span>
            <span className={`ml-auto text-[10px] px-1.5 py-0.5 rounded ${i.status === "shadow" ? "bg-purple-600/30 text-purple-200" : i.status === "approved" ? "bg-emerald-600/30 text-emerald-200" : "bg-gray-700 text-gray-300"}`}>
              {i.status === "shadow" ? "Shadow test" : i.status === "approved" ? "Live" : "Paused"}
            </span>
          </div>
          <div className="text-gray-400">{i.summary}</div>
          {i.evidence?.verdict && <div className="text-gray-500 text-[11px]">{i.evidence.verdict}</div>}
          {i.status !== "approved" && (
            <div className="flex gap-3 pt-1 text-[11px]">
              {i.status === "shadow"
                ? <button onClick={() => setStatus(i.id, "paused")} className="flex items-center gap-1 text-gray-300"><Pause className="w-3 h-3" />Pause</button>
                : <button onClick={() => setStatus(i.id, "shadow")} className="flex items-center gap-1 text-gray-300"><Play className="w-3 h-3" />Resume</button>}
              <button onClick={() => setStatus(i.id, "retired")} className="flex items-center gap-1 text-red-400"><Trash2 className="w-3 h-3" />Remove</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
