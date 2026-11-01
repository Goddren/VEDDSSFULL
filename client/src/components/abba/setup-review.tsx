// Week setup review: what ABBA proposes vs what's set now, the risk math and
// warnings. Nothing changes until the trader taps Confirm.
import { useState } from "react";
import { apiRequest } from "@/lib/queryClient";
import { Rocket, AlertTriangle, Ban, Check } from "lucide-react";

type Review = {
  changes: { engine: string; field: string; from: string; to: string; riskUp?: boolean }[];
  math: { balance: number | null; worstDayLossPct: number | null; worstDayLossUsd: number | null; targetPerDay: number | null; targetPctOfBalance: number | null };
  warnings: string[]; blockers: string[]; canApply: boolean;
};

export function SetupDraftCard({ draft }: { draft: any }) {
  const [review, setReview] = useState<Review | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "applying" | "done" | "error">("idle");
  const [result, setResult] = useState<{ applied: string[]; errors: string[] } | null>(null);
  const [err, setErr] = useState("");

  const load = async () => {
    setState("loading"); setErr("");
    try {
      const r = await apiRequest("POST", "/api/abba/setup/review", { proposal: draft });
      const d = await r.json(); if (d.error) throw new Error(d.error);
      setReview(d); setState("idle");
    } catch (e: any) { setErr(e.message); setState("error"); }
  };
  const apply = async () => {
    setState("applying"); setErr("");
    try {
      const r = await apiRequest("POST", "/api/abba/setup/apply", { proposal: draft, confirm: true });
      const d = await r.json(); if (d.error && !d.applied) throw new Error(d.error);
      setResult({ applied: d.applied || [], errors: d.errors || (d.error ? [d.error] : []) }); setState("done");
    } catch (e: any) { setErr(e.message); setState("error"); }
  };

  return (
    <div className="mt-2 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 text-[12px] text-gray-200 space-y-2">
      <div className="flex items-center gap-1.5 font-bold text-emerald-300"><Rocket className="w-3.5 h-3.5" />{draft.title}</div>
      {draft.rationale && <div className="text-gray-400">{draft.rationale}</div>}

      {!review && state !== "done" && (
        <button onClick={load} disabled={state === "loading"} className="w-full rounded-lg bg-emerald-500 text-black font-bold py-1.5 disabled:opacity-60">
          {state === "loading" ? "Checking your settings…" : "Review settings"}
        </button>
      )}

      {review && state !== "done" && (
        <>
          {review.changes.length ? (
            <div className="rounded-lg bg-gray-900/60 divide-y divide-gray-800">
              {review.changes.map((c, i) => (
                <div key={i} className="grid grid-cols-[70px_1fr] gap-2 p-2">
                  <div className="text-gray-500">{c.engine}</div>
                  <div>
                    <div className="text-gray-300">{c.field}</div>
                    <div><span className="text-gray-500 line-through">{c.from}</span> → <span className={c.riskUp ? "text-red-400 font-semibold" : "text-emerald-300 font-semibold"}>{c.to}</span>{c.riskUp && " ▲ risk"}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : <div className="text-gray-400">These settings are already in place. Nothing to change.</div>}

          <div className="grid grid-cols-2 gap-2">
            {review.math.targetPerDay != null && <Stat label="Goal per trading day" value={`$${review.math.targetPerDay}`} />}
            {review.math.targetPctOfBalance != null && <Stat label="Weekly goal vs balance" value={`${review.math.targetPctOfBalance}%`} />}
            {review.math.worstDayLossPct != null && <Stat label="Worst day if every FX trade stops out" value={`${review.math.worstDayLossPct}%${review.math.worstDayLossUsd ? ` ($${review.math.worstDayLossUsd})` : ""}`} />}
          </div>

          {review.blockers.map((b, i) => <div key={i} className="flex gap-1.5 text-red-400"><Ban className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{b}</div>)}
          {review.warnings.map((w, i) => <div key={i} className="flex gap-1.5 text-amber-300"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />{w}</div>)}

          <button onClick={apply} disabled={!review.canApply || state === "applying"}
            className="w-full rounded-lg bg-emerald-500 text-black font-bold py-2 disabled:opacity-40">
            {state === "applying" ? "Applying…" : "Confirm & go live"}
          </button>
          <div className="text-[10px] text-gray-500">Only the changes above are made. Safety gates (daily loss limit, drawdown halt, brain gate) stay on.</div>
        </>
      )}

      {state === "done" && result && (
        <div className="space-y-1">
          {result.applied.map((a, i) => <div key={i} className="flex gap-1.5 text-emerald-400"><Check className="w-3.5 h-3.5 mt-0.5" />{a}</div>)}
          {result.errors.map((e, i) => <div key={i} className="flex gap-1.5 text-red-400"><Ban className="w-3.5 h-3.5 mt-0.5" />{e}</div>)}
        </div>
      )}
      {state === "error" && <div className="text-red-400">{err}</div>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-gray-900/60 p-2">
      <div className="text-[10px] text-gray-500">{label}</div>
      <div className="font-bold">{value}</div>
    </div>
  );
}
