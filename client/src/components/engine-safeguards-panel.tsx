import type { ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Settings2, GraduationCap, Receipt, Route, Ban, Activity } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { InfoExplainer } from "@/components/info-explainer";

// Shared panel chrome (Nov 8, 2026 polish pass): one header treatment for
// every engine panel — a tinted icon square, title with a subtitle line
// under it, and the section's info button aligned at the right. Subtitles
// live UNDER the title (never in a right-hand slot), and flex children
// carry min-w-0 / wrap classes, so nothing can push past the card border
// on a phone-width screen.
function PanelHeader({ icon, tint, title, subtitle, explainer, compact = false }: {
  icon: ReactNode;
  tint: string;
  title: string;
  subtitle?: string;
  explainer?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="flex items-start gap-2.5 mb-2">
      <span className={`shrink-0 inline-flex items-center justify-center rounded-lg ${compact ? "w-6 h-6" : "w-7 h-7"} ${tint}`} aria-hidden="true">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className={`${compact ? "text-[11px]" : "text-sm"} font-bold text-gray-100 leading-tight`}>{title}</div>
        {subtitle ? <div className="text-[10px] leading-snug text-gray-500 mt-0.5">{subtitle}</div> : null}
      </div>
      {explainer ? <span className="shrink-0 pt-0.5">{explainer}</span> : null}
    </div>
  );
}

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
  promoted_rule_block: "Promoted lesson guard",
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
    <div className={`rounded-2xl p-4 overflow-hidden ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="skipped-trades-panel">
      <PanelHeader
        icon={<Ban className="w-4 h-4" />}
        tint="bg-amber-500/15 text-amber-300"
        title="Why trades were skipped"
        subtitle="Signals the engine wanted to take but deliberately didn't — and why."
        explainer={<InfoExplainer title="Why trades were skipped">
          <p>These are signals the engine <b>wanted</b> to trade but deliberately passed on — a guard or quality check said no. Each row names the reason: chasing a moved price, fighting the higher-timeframe trend, a range-bound day, a stale entry, and so on.</p>
          <p>Skips are the system working as designed, not missed chances by default. If one guard seems to skip everything, check its would-be results in Guard fire rates — blocked trades are scored later against real prices.</p>
        </InfoExplainer>}
      />
      {!events.length ? (
        <p className="text-[11px] text-gray-500 py-2">No skipped trades recently.</p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto overflow-x-hidden pr-1">
          {events.map((e) => (
            <div key={e.id} className="text-[10px] rounded-lg bg-black/20 px-2 py-1.5 break-words">
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
      <div className="text-[10px] text-gray-400 pl-2 pb-1 tabular-nums break-words">
        Would-be results (30d): <span className="text-emerald-300">{g.would_win} won</span> · <span className="text-red-300">{g.would_lose} lost</span>
        {g.expired > 0 ? <span> · {g.expired} expired flat</span> : null}
        {g.avg_r != null ? <span> · avg {g.avg_r >= 0 ? "+" : ""}{g.avg_r.toFixed(2)}R</span> : null}
        <span className="text-gray-500">{verdict(g.avg_r)}</span>
        {g.pending > 0 ? <span className="text-gray-600"> · {g.pending} still open</span> : null}
      </div>
    );
  };
  return (
    <div className={`rounded-2xl p-4 overflow-hidden ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="guard-fire-rates-panel">
      <PanelHeader
        icon={<Activity className="w-4 h-4" />}
        tint="bg-sky-500/15 text-sky-300"
        title="Guard fire rates"
        subtitle="How often each protection fired — last 7 days vs the 7 before. Guards at the top are shaping your results most."
        explainer={<InfoExplainer title="Guard fire rates & would-be results">
          <p>This counts how often each protection fired in the last 7 days versus the 7 before, so you can see which guards are shaping your results most.</p>
          <p><b>Would-be results</b> are the important part: when a guard blocks a trade that had a full plan (entry, stop, target), the system keeps watching that plan against real prices and scores it later — win or loss — exactly as if the trade had been taken. That turns "the guard blocked me" into evidence:</p>
          <p>• Blocked trades losing on average → the guard is <b>earning its keep</b>.<br/>• Blocked trades winning on average → that guard may be <b>too tight</b> and worth loosening.<br/>• Near zero → mixed; leave it alone.</p>
        </InfoExplainer>}
      />
      {!rates.length ? (
        <p className="text-[11px] text-gray-500 py-2">No guard activity in the last two weeks.</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto overflow-x-hidden pr-1">
          {rates.map((r) => {
            const delta = r.fires - r.prev_fires;
            return (
              <div key={`${r.engine}:${r.kind}`} className="rounded-lg bg-black/20 px-2 py-1.5">
                <div className="text-[10px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className="min-w-0 break-words text-gray-200 font-semibold">{LABEL[r.kind] || r.kind}</span>
                  <span className="text-gray-500">{r.engine}</span>
                  <span className="ml-auto text-gray-300 font-semibold tabular-nums">{r.fires}×</span>
                  <span className={`tabular-nums ${delta > 0 ? "text-amber-300" : delta < 0 ? "text-emerald-300" : "text-gray-500"}`}>
                    {delta > 0 ? `▲ +${delta}` : delta < 0 ? `▼ ${delta}` : "— 0"} vs prior
                  </span>
                  {r.top_symbol ? <span className="text-gray-500">mostly {r.top_symbol}</span> : null}
                  <span className="text-gray-600 tabular-nums">{new Date(r.last_fired).toLocaleDateString()}</span>
                </div>
                {cfLine(r.kind)}
              </div>
            );
          })}
          {cfOnly.map((g) => (
            <div key={`cf:${g.kind}`} className="rounded-lg bg-black/20 px-2 py-1.5">
              <div className="text-[10px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="min-w-0 break-words text-gray-200 font-semibold">{LABEL[g.kind] || g.kind}</span>
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
    <div className={`rounded-md border border-white/10 bg-white/[0.03] p-2 overflow-hidden ${className}`}>
      <PanelHeader
        compact
        icon={<Settings2 className="w-3.5 h-3.5" />}
        tint="bg-sky-500/15 text-sky-300"
        title="Your settings vs standard"
        subtitle="Read-only — change settings on each engine's own page."
        explainer={<InfoExplainer title="Your settings vs standard">
          <p>Every guard setting for the FX, Sol, Kalshi and Crypto engines, in one place. <b>Standard</b> is what the app ships with; <b>Yours</b> is what your engine is actually running right now.</p>
          <p>Anything you have changed is highlighted, and each engine header counts its changes. This panel never changes anything — it exists so a surprise in engine behavior can be traced to the setting that caused it.</p>
          <p>To change a value, use that engine's own settings page.</p>
        </InfoExplainer>}
      />
      <div className="space-y-2.5">
        {engines.map((e) => (
          <div key={e.id}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 mb-1">
              <span className="text-[10px] font-bold text-gray-300">{e.name}</span>
              {e.available
                ? <span className={`text-[9px] px-1.5 py-px rounded-full ${e.changed > 0 ? "bg-amber-500/15 text-amber-300" : "bg-white/5 text-gray-500"}`}>{e.changed > 0 ? `${e.changed} changed from standard` : "all standard"}</span>
                : <span className="text-[9px] px-1.5 py-px rounded-full bg-white/5 text-gray-600">engine off — showing standard</span>}
            </div>
            <div className="space-y-0.5">
              {e.rows.map((r) => (
                <div key={r.key} className="text-[10px] flex items-baseline gap-2 rounded bg-black/20 px-2 py-1">
                  <span className="min-w-0 flex-1 break-words text-gray-400">{r.label}</span>
                  <span className="shrink-0 text-gray-500 tabular-nums">standard {fmtVal(r.standard, r.fmt)}</span>
                  <span className={`shrink-0 tabular-nums ${r.differs ? "text-amber-300 font-semibold" : "text-gray-300"}`}>
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

// Promoted rules (Nov 8, 2026): shadow lessons that cleared the proof bar
// (50+ practice trades, avg R ≤ −0.2, ≤40% wins, no winning week) can be
// promoted — one at a time — into real entry guards, and retired any time.
export function PromotedRulesPanel({ className = "" }: { className?: string }) {
  const qc = useQueryClient();
  const { data } = useQuery<{ lessons: Array<{ source: string; dimension: string; key: string; trades: number; winRate: number; avgR: number; verdict: string; text: string; eligibility: { eligible: boolean; reasons: string[] } }>; rules: Array<{ id: string; dimension: string; key: string; trades: number; avgR: number; winRate: number; promotedAt: string; active: boolean }> }>({
    queryKey: ["/api/engine/promoted-rules"],
    refetchInterval: 60000,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["/api/engine/promoted-rules"] });
  const promote = useMutation({
    mutationFn: async (l: { source: string; dimension: string; key: string }) => apiRequest("POST", "/api/engine/promoted-rules", l),
    onSuccess: invalidate,
  });
  const retire = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", "/api/engine/promoted-rules/retire", { id }),
    onSuccess: invalidate,
  });
  const lessons = data?.lessons || [];
  const eligible = lessons.filter((l) => l.eligibility?.eligible);
  const active = (data?.rules || []).filter((r) => r.active);
  const retiredCount = (data?.rules || []).filter((r) => !r.active).length;
  if (!lessons.length && !active.length) return null;
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.03] p-2 overflow-hidden ${className}`}>
      <PanelHeader
        compact
        icon={<GraduationCap className="w-3.5 h-3.5" />}
        tint="bg-violet-500/15 text-violet-300"
        title="Proven lessons → real guards"
        subtitle="Bar: 50+ practice trades · avg R ≤ −0.2 · ≤40% wins · no winning week."
        explainer={<InfoExplainer title="Proven lessons → real guards">
          <p>Your engines practice constantly in shadow mode — every signal is scored against real prices without risking money. Patterns in those results become <b>lessons</b>.</p>
          <p>Most lessons stay advice. But a pattern that has proven itself a loser — 50 or more practice trades, losing at least 0.2R on average, winning 40% or less, and not one winning week in the last 30 days — can be promoted into a <b>real guard</b>: the FX engine will refuse live trades matching it.</p>
          <p>Promotion is always your tap, one guard at a time, and the server re-checks the evidence when you tap. Retire a guard anytime and matching trades flow again. Promoted guards' blocks are also scored as would-be results, so you can see whether each guard keeps earning its place.</p>
        </InfoExplainer>}
      />
      {active.length > 0 && (
        <div className="space-y-1 mb-2">
          {active.map((r) => (
            <div key={r.id} className="text-[10px] flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-violet-500/10 border border-violet-400/20 px-2 py-1.5">
              <span className="min-w-0 break-words text-violet-200 font-semibold">GUARD: {r.dimension} — {r.key}</span>
              <span className="text-gray-400 tabular-nums">{r.trades} trades · {Math.round(r.winRate * 100)}% wins · {r.avgR.toFixed(2)}R avg</span>
              <button
                className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-gray-200 hover:bg-white/20 disabled:opacity-50"
                disabled={retire.isPending}
                onClick={() => { if (window.confirm(`Retire this guard? The engine will stop blocking on "${r.key}" right away.`)) retire.mutate(r.id); }}
              >Retire</button>
            </div>
          ))}
        </div>
      )}
      {eligible.length > 0 ? (
        <div className="space-y-1">
          {eligible.map((l) => (
            <div key={`${l.dimension}:${l.key}`} className="text-[10px] flex flex-wrap items-center gap-x-2 gap-y-1 rounded bg-black/20 px-2 py-1.5">
              <span className="min-w-0 flex-1 break-words text-gray-300">{l.text}</span>
              <button
                className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-violet-500/30 text-violet-100 hover:bg-violet-500/50 disabled:opacity-50"
                disabled={promote.isPending}
                onClick={() => { if (window.confirm(`Make this a real guard?\n\n${l.text}\n\nThe FX engine will hard-block matching live entries until you retire the guard. This changes live trading behavior.`)) promote.mutate({ source: l.source, dimension: l.dimension, key: l.key }); }}
              >Make it a guard</button>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[10px] text-gray-500">
          No lesson has cleared the proof bar yet — {lessons.length} FX lesson{lessons.length === 1 ? "" : "s"} still gathering evidence. Lessons appear here when one proves itself.
          {retiredCount > 0 ? ` (${retiredCount} retired guard${retiredCount === 1 ? "" : "s"} on record.)` : ""}
        </div>
      )}
      {(promote.isError || retire.isError) && (
        <div className="text-[10px] text-red-300 mt-1">That didn't go through — the lesson may no longer be eligible. The list refreshes automatically.</div>
      )}
    </div>
  );
}

// Practice cost check (Nov 8, 2026): what practice trades actually get
// charged vs what the cost model assumes — the evidence base for tuning
// the model. Live fills carry their costs inside execution prices (no
// stored fee series), so this reports the practice side exactly and says
// so.
export function PracticeCostPanel({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ days: number; constants: { cryptoFeeBps: number; cryptoFeeDeepBps: number; cryptoFloorMult: number; solSlippagePct: number; solFeePumpfunPct: number; solFeeDefaultPct: number; solImpactFallbackPct: number }; cryptoPaper: { n: number; avg_bps: number | null; median_bps: number | null; avg_cost_usd: number | null; avg_cost_pct: number | null; avg_drag_pct: number | null; flipped: number } | null; bands: Array<{ band: string; n: number; avg_bps: number | null; avg_drag_pct: number | null }> }>({
    queryKey: ["/api/engine/guard-events?view=costs&days=90"],
    refetchInterval: 60000,
  });
  if (!data) return null;
  const cp = data.cryptoPaper;
  const c = data.constants;
  const pct = (v: number | null | undefined, dp = 2) => v == null ? "—" : `${(v * 100).toFixed(dp)}%`;
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.03] p-2 overflow-hidden ${className}`}>
      <PanelHeader
        compact
        icon={<Receipt className="w-3.5 h-3.5" />}
        tint="bg-emerald-500/15 text-emerald-300"
        title="Practice cost check"
        subtitle={`Last ${data.days} days · crypto paper trades.`}
        explainer={<InfoExplainer title="Practice cost check">
          <p>Practice trades are charged simulated fees and slippage so their results stay honest. This panel measures what those charges actually were: the average charge in basis points (100 bps = 1%), what a typical trade paid, and how much return the costs ate.</p>
          <p><b>Flipped trades</b> are the warning sign — trades that would have won before costs but lost after. A lot of flips in thin pools usually means the cost model is doing its job of warning you off bad fills, not that it is too harsh.</p>
          <p>Live fills carry their costs inside the execution price, so there is no separate live cost series to compare against — this panel is the practice side, measured exactly.</p>
        </InfoExplainer>}
      />
      {cp && cp.n > 0 ? (
        <>
          <div className="text-[10px] text-gray-300 rounded bg-black/20 px-2 py-1.5 mb-1 tabular-nums break-words">
            {cp.n} closed practice trades · average charge <span className="text-gray-100 font-semibold">{cp.avg_bps != null ? `${Math.round(cp.avg_bps)} bps` : "—"}</span>
            {cp.median_bps != null ? <span className="text-gray-500"> (typical {Math.round(cp.median_bps)} bps)</span> : null}
            {cp.avg_cost_pct != null ? <span> · {pct(cp.avg_cost_pct)} of the trade size</span> : null}
            {cp.avg_drag_pct != null ? <span> · costs ate <span className="text-amber-300">{cp.avg_drag_pct.toFixed(2)}%</span> of return on average</span> : null}
            {cp.flipped > 0 ? <span> · <span className="text-red-300">{cp.flipped} trade{cp.flipped === 1 ? "" : "s"} would have won before costs</span></span> : null}
          </div>
          <div className="space-y-0.5">
            {data.bands.map((b) => (
              <div key={b.band} className="text-[10px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded bg-black/20 px-2 py-1 tabular-nums">
                <span className="min-w-0 break-words text-gray-400">Pool {b.band}</span>
                <span className="ml-auto text-gray-500">{b.n} trades</span>
                <span className="text-gray-300">{b.avg_bps != null ? `${Math.round(b.avg_bps)} bps avg` : "—"}</span>
                {b.avg_drag_pct != null ? <span className="text-gray-500">drag {b.avg_drag_pct.toFixed(2)}%</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="text-[10px] text-gray-500">No closed crypto practice trades in the last {data.days} days yet — the check fills in as practice trades close.</div>
      )}
      <div className="text-[9px] text-gray-600 mt-1.5 break-words">
        The model assumes: crypto fee {c.cryptoFeeBps} bps ({c.cryptoFeeDeepBps} bps in deep pools), cost floor ×{c.cryptoFloorMult}; Sol slippage {c.solSlippagePct}%/side, pump.fun fee {c.solFeePumpfunPct}%, other DEX fees {c.solFeeDefaultPct}%, thin-pool impact fallback {c.solImpactFallbackPct}%. Real fills carry costs inside their execution prices, so there is no stored "real cost" series to compare against — this panel is the practice side, measured exactly.
      </div>
    </div>
  );
}

type TrailGroupT = { key: string; trades: number; winRate: number | null; avgFinal: number | null; avgPeak: number | null; avgGiveback: number | null; trailExitShare: number | null; verdict: string | null };

function TrailGroupRows({ groups, unit }: { groups: TrailGroupT[]; unit: string }) {
  if (!groups.length) return null;
  return (
    <div className="space-y-0.5">
      {groups.map((g) => (
        <div key={g.key} className="rounded bg-black/20 px-2 py-1.5">
          <div className="text-[10px] flex items-baseline gap-2">
            <span className="min-w-0 flex-1 truncate text-gray-200 font-medium">{g.key}</span>
            <span className="shrink-0 text-gray-500 tabular-nums">{g.trades} trades</span>
          </div>
          <div className="text-[10px] flex flex-wrap gap-x-2.5 gap-y-0.5 mt-0.5 tabular-nums">
            <span className="text-gray-300">{g.avgFinal != null ? `${g.avgFinal > 0 ? "+" : ""}${g.avgFinal}${unit} avg close` : "—"}</span>
            {g.avgPeak != null ? <span className="text-gray-500">peak {g.avgPeak}{unit}</span> : null}
            {g.avgGiveback != null ? <span className="text-amber-300/90">gave back {g.avgGiveback}{unit}</span> : null}
            {g.trailExitShare != null ? <span className="text-gray-500">{Math.round(g.trailExitShare * 100)}% trail exits</span> : null}
          </div>
          {g.verdict ? <div className="text-[9px] text-sky-300/80 mt-0.5 break-words">{g.verdict}</div> : null}
        </div>
      ))}
    </div>
  );
}

export function TrailStudyPanel({ className = "" }: { className?: string }) {
  const { data } = useQuery<{
    days: number;
    crypto: { settings: { method: string; activationR: number; fixedR: number; stepR: number; profitLockPct: number; sarInitialAf: number; sarMaxAf: number; breakevenBufferR: number } | null; overall: TrailGroupT | null; byStrategy: TrailGroupT[]; bySymbol: TrailGroupT[]; note: string };
    sol: { settings: { learnedRulesOn: boolean; breakevenAtPct: number; partialAtPct: number; partialFraction: number; trailDistPct: number; stagedTrail: string }; overall: TrailGroupT | null; byStrategy: TrailGroupT[]; bySymbol: TrailGroupT[]; note: string };
  }>({
    queryKey: ["/api/engine/guard-events?view=trails&days=90"],
    refetchInterval: 60000,
  });
  if (!data) return null;
  const cs = data.crypto.settings;
  const ss = data.sol.settings;
  return (
    <div className={`rounded-md border border-white/10 bg-white/[0.03] p-2 overflow-hidden ${className}`}>
      <PanelHeader
        compact
        icon={<Route className="w-3.5 h-3.5" />}
        tint="bg-sky-500/15 text-sky-300"
        title="Trail study — which trail fits which pair & strategy"
        subtitle={`Last ${data.days} days.`}
        explainer={<InfoExplainer title="Trail study & trail guards">
          <p>A trailing stop follows a winning trade's peak and locks in a floor behind it. The key number in this study is <b>giveback</b>: how much of the peak gain a trade handed back before it closed. Small giveback with frequent trail exits means the trail fits; large giveback means winners are round-tripping.</p>
          <p>Crypto is measured in <b>R</b> (multiples of the trade's planned risk) on live trades; Sol is measured in <b>%</b> on paper and shadow trades. Results are grouped by strategy and by pair/token so you can see which trail fits where.</p>
          <p>Groups with a proven pattern can become <b>trail guards</b> below: <b>Tighten</b> for groups that give back too much, <b>Lock profile in</b> for groups where trailing provably works. Guards change exit management only — never entries or sizing — and can be retired anytime.</p>
        </InfoExplainer>}
      />

      <div className="text-[10px] font-semibold text-gray-300 mt-1 mb-1 break-words">Crypto engine {cs ? <span className="text-gray-500 font-normal">— your trail now: {cs.method}, arms at {cs.activationR}R, fixed {cs.fixedR}R / step {cs.stepR}R / locks {cs.profitLockPct}%</span> : <span className="text-gray-500 font-normal">— no saved trail settings</span>}</div>
      {data.crypto.overall ? (
        <>
          <div className="text-[10px] text-gray-400 mb-1">By strategy</div>
          <TrailGroupRows groups={data.crypto.byStrategy} unit="R" />
          <div className="text-[10px] text-gray-400 mt-1.5 mb-1">By pair</div>
          <TrailGroupRows groups={data.crypto.bySymbol} unit="R" />
        </>
      ) : (
        <div className="text-[10px] text-gray-500">No closed live crypto trades in the last {data.days} days yet — the study fills in as trades close.</div>
      )}
      <div className="text-[9px] text-gray-600 mt-1">{data.crypto.note}</div>

      <div className="text-[10px] font-semibold text-gray-300 mt-2.5 mb-1 break-words">Sol engine <span className="text-gray-500 font-normal">— learned rules {ss.learnedRulesOn ? "on" : "off"}: breakeven at +{ss.breakevenAtPct}%, half off at +{ss.partialAtPct}%, trail {ss.trailDistPct}% under the peak. {ss.stagedTrail}</span></div>
      {data.sol.overall ? (
        <>
          <div className="text-[10px] text-gray-400 mb-1">By strategy</div>
          <TrailGroupRows groups={data.sol.byStrategy} unit="%" />
          <div className="text-[10px] text-gray-400 mt-1.5 mb-1">By token</div>
          <TrailGroupRows groups={data.sol.bySymbol} unit="%" />
        </>
      ) : (
        <div className="text-[10px] text-gray-500">No closed Sol paper/shadow trades in the last {data.days} days yet.</div>
      )}
      <div className="text-[9px] text-gray-600 mt-1">{data.sol.note}</div>
      <TrailGuardsSection />
    </div>
  );
}

type TrailCandidateT = { engine: "crypto" | "sol"; dimension: "strategy" | "symbol"; key: string; action: "tighten" | "lock_profile"; trades: number; reason: string; alreadyGuarded: boolean };
type TrailGuardT = { id: string; engine: "crypto" | "sol"; dimension: "strategy" | "symbol"; key: string; action: "tighten" | "lock_profile"; trades: number; profileSummary: string; active: boolean };

function TrailGuardsSection() {
  const qc = useQueryClient();
  const { data } = useQuery<{ candidates: TrailCandidateT[]; guards: TrailGuardT[] }>({
    queryKey: ["/api/engine/trail-guards"],
    refetchInterval: 60000,
  });
  const promote = useMutation({
    mutationFn: (c: TrailCandidateT) => apiRequest("POST", "/api/engine/trail-guards", { engine: c.engine, dimension: c.dimension, key: c.key, action: c.action }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/engine/trail-guards"] }); },
  });
  const retire = useMutation({
    mutationFn: (id: string) => apiRequest("POST", "/api/engine/trail-guards/retire", { id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/engine/trail-guards"] }); },
  });
  if (!data) return null;
  const fresh = data.candidates.filter((c) => !c.alreadyGuarded);
  const active = data.guards.filter((g) => g.active);
  if (!fresh.length && !active.length) return null;
  const eng = (e: string) => (e === "crypto" ? "Crypto" : "Sol");
  return (
    <div className="mt-2.5 border-t border-white/10 pt-2">
      <div className="text-[10px] font-semibold text-gray-300 mb-1">Proven trail lessons → real trail guards</div>
      {fresh.map((c) => (
        <div key={`${c.engine}:${c.dimension}:${c.key}:${c.action}`} className="rounded bg-black/20 px-2 py-1.5 mb-0.5">
          <div className="text-[10px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="min-w-0 break-words text-gray-200 font-medium">{eng(c.engine)} · {c.dimension} · {c.key}</span>
            <span className={`shrink-0 px-1.5 py-px rounded-full ${c.action === "tighten" ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"}`}>{c.action === "tighten" ? "Tighten trail" : "Lock this profile in"}</span>
            <button
              className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-sky-500/20 text-sky-200 border border-sky-500/40 disabled:opacity-50"
              disabled={promote.isPending}
              onClick={() => {
                const msg = c.action === "tighten"
                  ? `Make this a trail guard? Future ${eng(c.engine)} exits for ${c.dimension} "${c.key}" will use a TIGHTER trail profile (earlier arm, closer floor). Entries and sizing do not change. You can retire it anytime.`
                  : `Make this a trail guard? The trail profile that works for ${eng(c.engine)} ${c.dimension} "${c.key}" gets frozen for this group, so later global changes can't loosen it. You can retire it anytime.`;
                if (window.confirm(msg)) promote.mutate(c);
              }}
            >Make it a guard</button>
          </div>
          <div className="text-[9px] text-gray-500 mt-0.5 break-words">{c.reason}</div>
        </div>
      ))}
      {active.map((g) => (
        <div key={g.id} className="rounded bg-sky-500/10 border border-sky-500/25 px-2 py-1.5 mb-0.5">
          <div className="text-[10px] flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="min-w-0 break-words text-sky-200 font-medium">🛡️ {eng(g.engine)} · {g.dimension} · {g.key}</span>
            <span className="min-w-0 break-words text-gray-400">{g.action === "tighten" ? "tightened" : "profile locked"}: {g.profileSummary}</span>
            <button
              className="ml-auto shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-white/5 text-gray-300 border border-white/15 disabled:opacity-50"
              disabled={retire.isPending}
              onClick={() => { if (window.confirm(`Retire this trail guard for ${eng(g.engine)} ${g.dimension} "${g.key}"? Exits for this group go back to the global trail settings.`)) retire.mutate(g.id); }}
            >Retire</button>
          </div>
        </div>
      ))}
      <div className="text-[9px] text-gray-600 mt-1">Guards change exit management only — never entries or sizing. Evidence bar: 10+ closed trades with a clear giveback problem (tighten) or a proven trail record (lock in).</div>
    </div>
  );
}

export function EngineSafeguardsPanel({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ events: Array<{ id: number; kind: string; symbol: string | null; detail: string; created_at: string }>; summary: Array<{ kind: string; n: number; last: string }> }>({
    queryKey: ["/api/engine/guard-events?limit=40"],
    refetchInterval: 60000,
  });
  return (
    <div className={`rounded-2xl p-4 overflow-hidden ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="engine-safeguards-panel">
      <PanelHeader
        icon={<ShieldCheck className="w-4 h-4" />}
        tint="bg-emerald-500/15 text-emerald-300"
        title="Engine safeguards"
        subtitle="What the protections did — stops kept tight, sizes kept inside your caps, risky closes refused. Last 7 days."
        explainer={<InfoExplainer title="Engine safeguards">
          <p>This is the receipt feed for your engines' safety systems. Every time a protection steps in — refusing to loosen a stop, capping a position size to your limits, refusing a risky close, retrying a flatten — it is written here.</p>
          <p>Nothing here is an error. A busy feed on a wild day means the guards were doing their job while the market moved.</p>
          <p>The chips at the top count each kind of action over the last 7 days, newest events below.</p>
        </InfoExplainer>}
      />
      {!data?.summary?.length ? (
        <p className="text-[11px] text-gray-500 py-2">No safeguard has had to act yet.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {data.summary.map((s) => (
              <span key={s.kind} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/25 tabular-nums">
                {LABEL[s.kind] || s.kind} · {s.n}
              </span>
            ))}
          </div>
          <div className="space-y-1 max-h-56 overflow-y-auto overflow-x-hidden pr-1">
            {data.events.map((e) => (
              <div key={e.id} className="text-[10px] rounded-lg bg-black/20 px-2 py-1.5 break-words">
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
