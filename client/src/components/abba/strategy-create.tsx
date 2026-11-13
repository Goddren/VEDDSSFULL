// Strategy creation by talk: the proposal card ABBA shows when a trader
// agrees a strategy design in chat. The card is the ONLY write path —
// nothing is saved until "Save strategy" is tapped, which posts to
// /api/abba/strategy-draft/save (server re-validates with the Studio's
// own validator and stamps createdVia: 'abba'). After saving, the card
// offers the platform's existing next steps — backtest and Shadow
// deployment — each reusing the Studio's endpoints, each only on tap.
import { useState } from "react";
import { useLocation } from "wouter";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Hammer, Check, AlertTriangle, FlaskConical, Ghost, PencilRuler, X } from "lucide-react";
import type { StrategySpec } from "@/lib/strategy-spec";

export type AbbaStrategyDraft = {
  spec: StrategySpec;
  defaultsApplied: string[];
  unsupported: string[];
  missing: string[];
  validation: { ok: boolean; error: string | null; plain: string | null };
  summary: {
    name: string; market: string;
    entryLong: string[]; entryShort: string[]; exitLines: string[];
    risk: string[]; filters: string[];
  };
};

/** sessionStorage handoffs the Strategy Studio reads on mount:
 *  DRAFT = an unsaved spec to open in the builder; OPEN = a saved
 *  strategy id to load for editing. */
export const ABBA_STUDIO_DRAFT_KEY = "vedd.abbaStrategyDraft";
export const ABBA_STUDIO_OPEN_KEY = "vedd.abbaStrategyOpenId";

export function StrategyDraftCard({ draft }: { draft: AbbaStrategyDraft }) {
  const [, setLocation] = useLocation();
  const [dismissed, setDismissed] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [err, setErr] = useState("");
  const [savedId, setSavedId] = useState<number | null>(null);
  const [bt, setBt] = useState<{ state: "idle" | "running" | "done" | "error"; line?: string }>({ state: "idle" });
  const [shadow, setShadow] = useState<{ state: "idle" | "running" | "done" | "error"; line?: string }>({ state: "idle" });

  if (dismissed) return null;
  const s = draft.summary;
  const incomplete = draft.missing.length > 0;
  const canSave = !incomplete && draft.validation.ok;

  const openInStudio = () => {
    try {
      if (savedId) {
        sessionStorage.setItem(ABBA_STUDIO_OPEN_KEY, String(savedId));
        sessionStorage.removeItem(ABBA_STUDIO_DRAFT_KEY);
      } else {
        sessionStorage.setItem(ABBA_STUDIO_DRAFT_KEY, JSON.stringify(draft.spec));
        sessionStorage.removeItem(ABBA_STUDIO_OPEN_KEY);
      }
    } catch { /* storage unavailable — the Studio still opens normally */ }
    setLocation("/strategy-studio");
  };

  const save = async () => {
    setSaveState("saving"); setErr("");
    try {
      const r = await apiRequest("POST", "/api/abba/strategy-draft/save", { spec: draft.spec, confirm: true });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Couldn't save");
      setSavedId(d.strategy?.id ?? null);
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-wizard/spec-strategies"] });
    } catch (e: any) { setSaveState("error"); setErr(e.message || "Couldn't save"); }
  };

  const runBacktest = async () => {
    if (!savedId) return;
    setBt({ state: "running" });
    try {
      const r = await apiRequest("POST", "/api/strategy-wizard/spec-backtest", { spec: draft.spec, strategyId: savedId, initialCapital: 10000 });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Backtest failed");
      const st = d.stats || {};
      const wr = typeof st.winRate === "number" ? Math.round(st.winRate) : 0;
      const net = typeof st.netPnl === "number" ? st.netPnl : 0;
      setBt({ state: "done", line: `Backtest (${d.provider || "history"}): ${st.totalTrades ?? 0} trades · ${wr}% win rate · net ${net >= 0 ? "+" : "−"}$${Math.abs(net).toFixed(2)}` });
      queryClient.invalidateQueries({ queryKey: ["/api/strategy-wizard/spec-strategies"] });
    } catch (e: any) { setBt({ state: "error", line: e.message || "Backtest failed" }); }
  };

  const deployShadow = async () => {
    if (!savedId) return;
    setShadow({ state: "running" });
    try {
      const r = await apiRequest("POST", "/api/strategy-wizard/deployments", { strategyId: savedId, platform: "shadow" });
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || "Shadow deploy failed");
      setShadow({ state: "done", line: d.note || "Shadow (virtual) deployment running — it trades virtually, no account, no real orders. Watch its record build in the Studio." });
    } catch (e: any) { setShadow({ state: "error", line: e.message || "Shadow deploy failed" }); }
  };

  return (
    <div className="mt-2 rounded-xl border border-violet-500/40 bg-violet-500/5 p-3 text-[12px] text-gray-200 space-y-1.5">
      <div className="flex items-center gap-1.5 font-bold text-violet-300">
        <Hammer className="w-3.5 h-3.5" />
        {incomplete ? "Strategy draft — almost there" : s.name}
        <button onClick={() => setDismissed(true)} className="ml-auto text-gray-500 hover:text-gray-300" aria-label="Discard draft">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {!incomplete && <div className="text-gray-400">{s.market}</div>}

      {incomplete ? (
        <div className="space-y-1">
          <div className="text-gray-300">ABBA still needs:</div>
          {draft.missing.map((m, i) => <div key={i} className="text-amber-300">• {m}</div>)}
          <div className="text-gray-400">Answer ABBA in the chat and the finished card will appear here. Nothing is saved yet.</div>
        </div>
      ) : (
        <>
          {s.entryLong.length > 0 && <div><span className="text-emerald-400 font-semibold">Buys when: </span>{s.entryLong.join(" ")}</div>}
          {s.entryShort.length > 0 && <div><span className="text-red-400 font-semibold">Sells when: </span>{s.entryShort.join(" ")}</div>}
          {s.exitLines.map((l, i) => <div key={i} className="text-gray-300">{l}</div>)}
          {s.risk.length > 0 && <div className="text-gray-300">{s.risk.join(" · ")}</div>}
          {s.filters.map((l, i) => <div key={i} className="text-gray-400">{l}</div>)}
        </>
      )}

      {draft.unsupported.length > 0 && (
        <div className="rounded-lg bg-gray-900/60 p-2 space-y-0.5">
          <div className="text-[10px] text-gray-500">Couldn't be built exactly as asked</div>
          {draft.unsupported.map((u, i) => <div key={i} className="text-amber-200/90">{u}</div>)}
        </div>
      )}

      {draft.defaultsApplied.length > 0 && (
        <div className="rounded-lg bg-gray-900/60 p-2 space-y-0.5">
          <div className="text-[10px] text-gray-500">Defaults ABBA chose — flagged, never silent. Change any of them in the Studio</div>
          {draft.defaultsApplied.map((d, i) => <div key={i} className="text-gray-300">• {d}</div>)}
        </div>
      )}

      {!incomplete && (draft.validation.ok ? (
        <div className="flex items-center gap-1 text-emerald-400"><Check className="w-3.5 h-3.5" />Passes the Studio's checks — ready to save.</div>
      ) : (
        <div className="flex items-start gap-1 text-amber-300"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /><span>{draft.validation.plain || draft.validation.error}</span></div>
      ))}

      {saveState === "saved" ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold"><Check className="w-3.5 h-3.5" />Saved to your strategies. Nothing is trading — pick a next step:</div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={runBacktest} disabled={bt.state === "running"}
              className="flex items-center gap-1 rounded-lg bg-gray-800 px-2.5 py-1.5 font-semibold text-gray-100 disabled:opacity-60">
              <FlaskConical className="w-3.5 h-3.5" />{bt.state === "running" ? "Backtesting…" : "Run a backtest"}
            </button>
            <button onClick={deployShadow} disabled={shadow.state === "running" || shadow.state === "done"}
              className="flex items-center gap-1 rounded-lg bg-gray-800 px-2.5 py-1.5 font-semibold text-gray-100 disabled:opacity-60">
              <Ghost className="w-3.5 h-3.5" />{shadow.state === "running" ? "Deploying…" : shadow.state === "done" ? "Shadow running" : "Deploy to Shadow"}
            </button>
            <button onClick={openInStudio}
              className="flex items-center gap-1 rounded-lg bg-gray-800 px-2.5 py-1.5 font-semibold text-gray-100">
              <PencilRuler className="w-3.5 h-3.5" />Open in Studio
            </button>
          </div>
          {bt.line && <div className={bt.state === "error" ? "text-red-400" : "text-gray-300"}>{bt.line}</div>}
          {shadow.line && <div className={shadow.state === "error" ? "text-red-400" : "text-gray-300"}>{shadow.line}</div>}
        </div>
      ) : (
        <div className="flex gap-1.5">
          {!incomplete && (
            <button onClick={save} disabled={!canSave || saveState === "saving"}
              className="flex-1 rounded-lg bg-violet-500 text-black font-bold py-1.5 disabled:opacity-50">
              {saveState === "saving" ? "Saving…" : "Save strategy"}
            </button>
          )}
          <button onClick={openInStudio}
            className="flex items-center justify-center gap-1 flex-1 rounded-lg bg-gray-800 font-semibold text-gray-100 py-1.5">
            <PencilRuler className="w-3.5 h-3.5" />Open in Studio to edit
          </button>
        </div>
      )}
      {saveState === "error" && <div className="text-red-400">{err}</div>}
      <div className="text-[10px] text-gray-500">A new strategy is unproven until its backtest and shadow record say otherwise. Saving never trades anything — no orders, no account changes.</div>
    </div>
  );
}
