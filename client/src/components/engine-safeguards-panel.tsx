import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Settings2 } from "lucide-react";

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
  ai_call_failed: "AI call failed",
  stop_hold_breathe: "Stop held — letting the trade breathe (under 1R)",
  pending_order_expired: "Unfilled pending order cancelled",
  ai_reply_truncated: "AI reply cut off (too long)",
  stale_entry_skip: "Stale plan skipped",
  early_breakeven_refused: "Early breakeven refused (under 1R)",
  breakeven_reanchored: "Breakeven set from this account's fill",
  consistency_block: "Consistency block",
  h4_filter_skip: "Against H4 structure / Wyckoff",
  market_closed_skip: "Market closed (weekend)",
  late_session_skip: "Late session (21:00–24:00 UTC)",
  mtf_skip: "H1 and H4 don't both agree",
  range_day_skip: "Range day (no trend)",
  chase_skip: "No chasing (stretched market)",
};

// Plain-English explainer for each skip reason, shown under the event.
const SKIP_HELP: Record<string, string> = {
  stale_entry_skip: "The AI's planned entry was too far from the live price (or its stop was on the wrong side of price), so the order would have been refused or filled with almost no stop. The engine waits for a fresh plan at the current price.",
  consistency_block: "This prop account hit its consistency rule — one day can't be more than a set share of total profit — so it sat out the rest of the day. Other accounts were unaffected.",
};
SKIP_HELP.h4_filter_skip = "The 4-hour chart's market structure (a break of structure) or its Wyckoff phase pointed the opposite way. In past trades, entries against these lost money (41% win rate against Wyckoff), so the engine waits for a setup that agrees with the bigger picture.";
SKIP_HELP.market_closed_skip = "The FX market is closed from Friday 21:00 to Sunday 21:00 UTC. The engine doesn't open forex, gold or index trades then — the broker would refuse them, and a Friday plan could fill at Sunday's reopen gap. Crypto (BTCUSD) still trades.";
SKIP_HELP.late_session_skip = "From 21:00 to 24:00 UTC liquidity is thin and spreads are wide (including Sunday's reopen). Past entries in this window won 38% of the time and lost money, so the engine waits for the Asian session. Crypto still trades.";
SKIP_HELP.h4_filter_skip = "The 4-hour chart either pointed the other way (structure break or Wyckoff phase) or showed no clear structure at all. In past trades, both lost money, so the engine waits for a setup that agrees with the bigger picture.";
SKIP_HELP.mtf_skip = "The engine only enters when both the 1-hour and 4-hour trends point the same way as the trade. Trades with both agreeing won 64% of the time in the replay; the rest barely broke even.";
SKIP_HELP.range_day_skip = "The market is ranging, not trending. Trend entries on range days lost $12.5k over 90 days, so the engine sits them out (range-model trades are separate).";
SKIP_HELP.chase_skip = "The market had already run too far (RSI over 70 for a buy, under 30 for a sell). Entering then usually means buying the top, so the engine waits for a pullback.";
const SKIP_KINDS = Object.keys(SKIP_HELP);

/** Why the engine skipped a trade it otherwise wanted — durable reasons, not the in-memory feed. */
export function SkippedTradesPanel({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ events: Array<{ id: number; kind: string; symbol: string | null; detail: string; created_at: string }> }>({
    queryKey: [`/api/engine/guard-events?limit=20&kinds=${SKIP_KINDS.join(",")}`],
    refetchInterval: 60000,
  });
  const events = data?.events || [];
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="skipped-trades-panel">
      <h3 className="text-sm font-bold text-gray-100 mb-1">Why trades were skipped</h3>
      <p className="text-[10px] text-gray-500 mb-3">Signals the engine wanted to take but deliberately didn't — and why.</p>
      {!events.length ? (
        <p className="text-[11px] text-gray-500 py-2">No skipped trades recently.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {events.map((e) => (
            <div key={e.id} className="text-[10px] rounded bg-black/20 px-2 py-1.5">
              <span className="text-amber-300 font-semibold">{LABEL[e.kind] || e.kind}</span>
              {e.symbol ? <span className="text-gray-300"> · {e.symbol}</span> : null}
              <span className="text-gray-400"> — {e.detail}</span>
              {SKIP_HELP[e.kind] && <span className="block text-gray-500 mt-0.5">{SKIP_HELP[e.kind]}</span>}
              <span className="block text-gray-600">{new Date(e.created_at).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Per-guard fire rates (engine report rec #3): which protections fire most,
 *  this week vs last — a guard that fires constantly is a recalibration
 *  candidate; one that never fires is dead weight. */
export function GuardFireRatesPanel({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ days: number; rates: Array<{ engine: string; kind: string; fires: number; prev_fires: number; last_fired: string; top_symbol: string | null }> }>({
    queryKey: ["/api/engine/guard-events?view=rates&days=7"],
    refetchInterval: 60000,
  });
  const { data: cf } = useQuery<{ days: number; guards: Array<{ kind: string; resolved: number; would_win: number; would_lose: number; expired: number; pending: number; avg_r: number | null }> }>({
    queryKey: ["/api/engine/guard-events?view=counterfactuals&days=30"],
    refetchInterval: 60000,
  });
  const rates = (data?.rates || []).filter((r) => r.fires > 0 || r.prev_fires > 0);
  const cfByKind = new Map((cf?.guards || []).map((g) => [g.kind, g]));
  const cfOnly = (cf?.guards || []).filter((g) => g.resolved > 0 && !rates.some((r) => r.kind === g.kind));
  const verdict = (avgR: number | null) => avgR == null ? "" : avgR <= -0.1 ? " — earning its keep" : avgR >= 0.1 ? " — mostly stops winners; loosening candidate" : " — mixed results";
  const cfLine = (kind: string) => {
    const g = cfByKind.get(kind);
    if (!g || g.resolved === 0) return null;
    return (
      <div className="text-[10px] text-gray-400 pl-2 pb-1">
        Would-be results (30d): <span className="text-emerald-300">{g.would_win} won</span> · <span className="text-red-300">{g.would_lose} lost</span>
        {g.expired > 0 ? <span> · {g.expired} expired flat</span> : null}
        {g.avg_r != null ? <span> · avg {g.avg_r >= 0 ? "+" : ""}{g.avg_r.toFixed(2)}R</span> : null}
        <span className="text-gray-500">{verdict(g.avg_r)}</span>
        {g.pending > 0 ? <span className="text-gray-600"> · {g.pending} still open</span> : null}
      </div>
    );
  };
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="guard-fire-rates-panel">
      <h3 className="text-sm font-bold text-gray-100 mb-1">Guard fire rates</h3>
      <p className="text-[10px] text-gray-500 mb-3">How often each protection fired — last 7 days vs the 7 before. Guards at the top are shaping your results most.</p>
      {!rates.length ? (
        <p className="text-[11px] text-gray-500 py-2">No guard activity in the last two weeks.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
          {rates.map((r) => {
            const delta = r.fires - r.prev_fires;
            return (
              <div key={`${r.engine}:${r.kind}`} className="rounded bg-black/20 px-2 py-1.5">
                <div className="text-[10px] flex items-baseline gap-2">
                  <span className="text-gray-200 font-semibold">{LABEL[r.kind] || r.kind}</span>
                  <span className="text-gray-500">{r.engine}</span>
                  <span className="ml-auto text-gray-300 font-semibold">{r.fires}×</span>
                  <span className={delta > 0 ? "text-amber-300" : delta < 0 ? "text-emerald-300" : "text-gray-500"}>
                    {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "— 0"} vs prior
                  </span>
                  {r.top_symbol ? <span className="text-gray-500">mostly {r.top_symbol}</span> : null}
                  <span className="text-gray-600">{new Date(r.last_fired).toLocaleDateString()}</span>
                </div>
                {cfLine(r.kind)}
              </div>
            );
          })}
          {cfOnly.map((g) => (
            <div key={`cf:${g.kind}`} className="rounded bg-black/20 px-2 py-1.5">
              <div className="text-[10px] flex items-baseline gap-2">
                <span className="text-gray-200 font-semibold">{LABEL[g.kind] || g.kind}</span>
                <span className="text-gray-500">fx</span>
              </div>
              {cfLine(g.kind)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Settings overview (Nov 8, 2026): per engine, every guard setting as
// Standard (the app's built-in default) vs Yours (your live value), with
// anything you changed highlighted. Read-only — edit settings on each
// engine's own page.
export function SettingsOverviewPanel({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ engines: Array<{ id: string; name: string; available: boolean; changed: number; rows: Array<{ key: string; label: string; fmt: string; standard: unknown; yours: unknown; differs: boolean }> }> }>({
    queryKey: ["/api/engine/guard-events?view=settings"],
    refetchInterval: 60000,
  });
  const engines = data?.engines || [];
  const fmtVal = (v: unknown, fmt: string): string => {
    if (v === null || v === undefined) return "—";
    if (fmt === "bool") return v ? "On" : "Off";
    if (fmt === "secs") { const s = Math.round(Number(v) / 1000); return s >= 60 ? `${Math.round(s / 60)}m` : `${s}s`; }
    if (fmt === "num") { const n = Number(v); return Number.isFinite(n) ? String(Math.round(n * 100) / 100) : String(v); }
    return String(v);
  };
  if (!engines.length) return null;
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.03] p-2 ${className}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <Settings2 className="w-3.5 h-3.5 text-sky-300" />
        <span className="text-[11px] font-bold text-gray-200">Your settings vs standard</span>
        <span className="text-[9px] text-gray-500 ml-auto">read-only — change settings on each engine's page</span>
      </div>
      <div className="space-y-2.5">
        {engines.map((e) => (
          <div key={e.id}>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-[10px] font-bold text-gray-300">{e.name}</span>
              {e.available
                ? <span className={e.changed > 0 ? "text-[9px] text-amber-300" : "text-[9px] text-gray-500"}>{e.changed > 0 ? `${e.changed} changed from standard` : "all standard"}</span>
                : <span className="text-[9px] text-gray-600">engine off — showing standard</span>}
            </div>
            <div className="space-y-0.5">
              {e.rows.map((r) => (
                <div key={r.key} className="text-[10px] flex items-baseline gap-2 rounded bg-black/20 px-2 py-1">
                  <span className="text-gray-400">{r.label}</span>
                  <span className="ml-auto text-gray-500">standard {fmtVal(r.standard, r.fmt)}</span>
                  <span className={r.differs ? "text-amber-300 font-semibold" : "text-gray-300"}>
                    yours {e.available ? fmtVal(r.yours, r.fmt) : fmtVal(r.standard, r.fmt)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
