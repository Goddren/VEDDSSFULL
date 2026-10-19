import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";

// Shows what the engine's safeguards (2026-10-19 bug-scan fixes) actually did:
// stops it refused to loosen, sizes it capped, partial closes refused, thin-data
// brain blocks skipped, flatten retries. Display only.

const LABEL: Record<string, string> = {
  stop_loosen_refused: "Stop loosen refused",
  stop_through_price_refused: "Stop through price refused",
  size_cap: "Size capped",
  sl_widen_lot_cut: "Lot cut for wider stop",
  partial_close_refused: "Partial close refused",
  brain_block_thin_data: "Thin-data brain block skipped",
  flatten_retry: "Flatten retried",
};

export function EngineSafeguardsPanel({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ events: Array<{ id: number; kind: string; symbol: string | null; detail: string; created_at: string }>; summary: Array<{ kind: string; n: number; last: string }> }>({
    queryKey: ["/api/engine/guard-events?limit=40"],
    refetchInterval: 60000,
  });
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="engine-safeguards-panel">
      <div className="flex items-center gap-2 mb-1">
        <ShieldCheck className="w-4 h-4 text-emerald-300" />
        <h3 className="text-sm font-bold text-gray-100">Engine safeguards</h3>
      </div>
      <p className="text-[10px] text-gray-500 mb-3">What the protections did — stops kept tight, sizes kept inside your caps, risky closes refused. Last 7 days.</p>
      {!data?.summary?.length ? (
        <p className="text-[11px] text-gray-500 py-2">No safeguard has had to act yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {data.summary.map((s) => (
              <span key={s.kind} className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/25">
                {LABEL[s.kind] || s.kind} · {s.n}
              </span>
            ))}
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
            {data.events.map((e) => (
              <div key={e.id} className="text-[10px] rounded bg-black/20 px-2 py-1.5">
                <span className="text-gray-300 font-semibold">{LABEL[e.kind] || e.kind}</span>
                {e.symbol ? <span className="text-gray-400"> · {e.symbol}</span> : null}
                <span className="text-gray-500"> — {e.detail}</span>
                <span className="block text-gray-600">{new Date(e.created_at).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
