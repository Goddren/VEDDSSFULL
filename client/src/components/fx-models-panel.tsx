import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Layers, TrendingUp, Waves, Award, Landmark } from "lucide-react";
import { InfoExplainer } from "@/components/info-explainer";

// FX Model 1 (range) / Model 2 (trend) — shadow-phase brain panel.
// Reads /api/fx-models/{day-types,mastery,decisions}. Display only.

interface DayTypeRow {
  symbol: string; session: string; day_type: "range" | "trend" | "mixed"; auto_model: "M1" | "M2";
  trend_score: number | null; adx_m15: number | null; rel_volume: number | null;
  h1_trend: string | null; h4_trend: string | null; created_at: string;
}
interface MasteryRow {
  model: "M1" | "M2"; dayType?: string; symbol?: string; session?: string;
  trades: number; wins: number; winRate: number; avgR: number; totalR: number; masteryScore: number; level: string;
  epochTrades?: number; epochWinRate?: number; epochAvgR?: number; epochLevel?: string; allTimeLevel?: string;
  wasExcludedPair?: boolean;
  /** Purchased records only: where the record came from. */
  source?: string; sellerId?: number | null; listingId?: number | null; legacy?: boolean; recordEpoch?: number | null;
}
interface PropSimSummary {
  startBalance: number; endBalance: number; totalReturnPct: number;
  tradesTaken: number; tradesSkipped: number; blown: boolean; blownAt: string | null;
  worstDayPct: number; daysActive: number;
}
interface DecisionRow {
  id: number; symbol: string; model: "M1" | "M2"; day_type: string; session: string; direction: string;
  entry_price: number | null; stop_loss: number | null; take_profit: number | null; confidence: number;
  setup: string; reasoning: string; result: string | null; r_multiple: number | null; created_at: string;
}

const MODEL_META = {
  M1: { name: "Model 1 · Range", icon: Waves, color: "#38bdf8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.28)" },
  M2: { name: "Model 2 · Trend", icon: TrendingUp, color: "#a78bfa", bg: "rgba(167,139,250,0.08)", border: "rgba(167,139,250,0.28)" },
} as const;

const DAY_COLORS: Record<string, string> = { range: "#38bdf8", trend: "#a78bfa", mixed: "#fbbf24" };

const LEVEL_COLORS: Record<string, string> = {
  Learning: "#9ca3af", Developing: "#fbbf24", Proficient: "#34d399", Master: "#f472b6",
};
const levelColor = (l: string) => LEVEL_COLORS[l.split(" ")[0]] || "#9ca3af";

function fmtMoney(x: number) {
  return `$${Math.round(x).toLocaleString("en-US")}`;
}
function fmtR(r: number | null | undefined) {
  if (r == null || !Number.isFinite(r)) return "—";
  return `${r >= 0 ? "+" : ""}${r.toFixed(2)}R`;
}
function trendArrow(t: string | null) {
  return t === "BULLISH" ? "▲" : t === "BEARISH" ? "▼" : "•";
}
function resultChip(d: DecisionRow) {
  if (d.direction === "NONE") return { label: "no trade", color: "#6b7280" };
  if (!d.result) return { label: "open", color: "#fbbf24" };
  if (d.result === "WIN") return { label: `win ${fmtR(d.r_multiple)}`, color: "#4ade80" };
  if (d.result === "LOSS") return { label: `loss ${fmtR(d.r_multiple)}`, color: "#f87171" };
  return { label: `expired ${fmtR(d.r_multiple)}`, color: "#9ca3af" };
}

export function FxModelsPanel({ className = "", engine = "fx" }: { className?: string; engine?: "fx" | "crypto" }) {
  const [tab, setTab] = useState<"today" | "mastery" | "ideas">("today");
  const isCrypto = engine === "crypto";
  const dayTypes = useQuery<{ dayTypes: DayTypeRow[] }>({ queryKey: [`/api/fx-models/day-types?engine=${engine}`], refetchInterval: 60000 });
  const mastery = useQuery<{ models: MasteryRow[]; slices: MasteryRow[]; importedSlices?: MasteryRow[]; propSim?: Record<string, PropSimSummary> }>({ queryKey: [`/api/fx-models/mastery?engine=${engine}`], refetchInterval: 120000 });
  const decisions = useQuery<{ decisions: DecisionRow[] }>({ queryKey: [`/api/fx-models/decisions?limit=60&engine=${engine}`], refetchInterval: 60000, enabled: tab === "ideas" });

  const settingsQ = useQuery<{ settings: { live: boolean; m1DailyCap: number; m2DailyCap: number }; eligible: MasteryRow[] }>({ queryKey: ["/api/fx-models/settings"], refetchInterval: 120000, enabled: !isCrypto });
  const live = !isCrypto && !!settingsQ.data?.settings.live;
  const eligible = settingsQ.data?.eligible || [];
  const eligiblePurchased = eligible.filter((s) => s.source === "marketplace_model").length;
  const toggleLive = useMutation({
    mutationFn: async (next: boolean) => (await apiRequest("POST", "/api/fx-models/settings", { live: next })).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/fx-models/settings"] }),
  });
  const onToggle = () => {
    if (!live) {
      const ok = window.confirm(
        `Turn Model 1 / Model 2 LIVE trading on?\n\nReal orders will be placed, but only for scopes that are Proficient or Master (${eligible.length} right now${eligiblePurchased ? `, including ${eligiblePurchased} proven purchased scope${eligiblePurchased === 1 ? "" : "s"}` : ""}), only with the model the day type calls for, max ${settingsQ.data?.settings.m1DailyCap ?? 3} Model 1 and ${settingsQ.data?.settings.m2DailyCap ?? 2} Model 2 trades a day. All engine gates and the risk guard still apply, and the FX engine must be running.`,
      );
      if (!ok) return;
    }
    toggleLive.mutate(!live);
  };

  const models = mastery.data?.models || [];
  const modelStat = (m: "M1" | "M2") => models.find((x) => x.model === m);

  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="fx-models-panel">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-300 shrink-0" />
            <h3 className="text-sm font-bold text-gray-100">{isCrypto ? "Crypto " : ""}Model 1 / Model 2</h3>
            {live ? (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">LIVE · proven scopes</span>
            ) : (
              <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">SHADOW</span>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">
            {live
              ? `Trading only Proficient/Master scopes (${eligible.length} eligible now${eligiblePurchased ? `, ${eligiblePurchased} of them purchased` : ""}). Everything else stays in shadow.`
              : "Recording what each model would trade. No orders are placed."}
          </p>
        </div>
        {!isCrypto && <button
          onClick={onToggle}
          disabled={toggleLive.isPending || !settingsQ.data}
          className={`shrink-0 text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors ${live ? "border-red-500/40 text-red-300 hover:bg-red-500/10" : "border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"}`}
          data-testid="fx-models-live-toggle"
        >
          {toggleLive.isPending ? "Saving…" : live ? "Stop live" : "Go live"}
        </button>}
      </div>

      <div className="flex flex-wrap mb-3 -mt-1">
        <InfoExplainer title="How this works" accent="border-l-sky-300/60">
          <p><strong className="text-gray-100">1. Read the day.</strong> For each pair, the app first decides what kind of day it is: moving in one direction, or going side to side.</p>
          <p><strong className="text-gray-100">2. Pick the model.</strong> Model 1 trades side-to-side days with tighter, quicker targets. Model 2 trades moving days and gives winners more room.</p>
          <p><strong className="text-gray-100">3. Prove it in shadow.</strong> Before any real money, each model practices with pretend trades priced from the real market. Only a strong practice record — lots of trades, winning often enough, and ahead on average — can ever count.</p>
          <p><strong className="text-gray-100">4. Check it like a firm account.</strong> The prop sim replays that practice record on a pretend $100,000 firm account, so you can see whether it would have survived firm rules.</p>
          <p><strong className="text-gray-100">5. Share it, or buy it.</strong> A proven record can be listed in the Marketplace. If you buy one, your own new trades can use that proof — but only with your live switch on, inside your daily limits, and after every normal safety check. Nothing trades just because you bought it.</p>
          <p><strong className="text-gray-100">Current system record</strong> means results from today's upgraded models — that is the record that counts. <strong className="text-gray-100">Earlier record (history)</strong> is what the older models did; it is kept for context and never counts toward going live or a new listing.</p>
        </InfoExplainer>
      </div>

      {/* Model summary cards */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        {(["M1", "M2"] as const).map((m) => {
          const meta = MODEL_META[m];
          const s = modelStat(m);
          const Icon = meta.icon;
          return (
            <div key={m} className="rounded-xl p-2.5 min-w-0" style={{ background: meta.bg, border: `1px solid ${meta.border}` }} data-testid={`fx-model-card-${m}`}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: meta.color }} />
                <span className="text-[11px] font-bold truncate" style={{ color: meta.color }}>{meta.name}</span>
              </div>
              {s ? (
                <>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-base font-black text-gray-100">{(s.winRate * 100).toFixed(0)}%</span>
                    <span className="text-[10px] text-gray-400">WR · {fmtR(s.avgR)} avg</span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-[10px] text-gray-500">{s.trades} resolved</span>
                    <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: levelColor(s.level), background: `${levelColor(s.level)}22` }}>{s.level}</span>
                  </div>
                  <MasteryBar score={s.masteryScore} color={meta.color} />
                  <p className="text-[9px] text-gray-400 mt-1">
                    Current system record: {s.epochTrades ?? 0} resolved{(s.epochTrades ?? 0) > 0 ? ` · ${((s.epochWinRate ?? 0) * 100).toFixed(0)}% · ${fmtR(s.epochAvgR)}` : ""}
                    {(s.trades - (s.epochTrades ?? 0)) > 0 ? ` · Earlier record (history): ${s.trades - (s.epochTrades ?? 0)}` : ""}
                  </p>
                  <PropSimLine sim={mastery.data?.propSim?.[m]} />
                </>
              ) : (
                <p className="text-[10px] text-gray-500">No resolved ideas yet</p>
              )}
            </div>
          );
        })}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-2" role="tablist">
        {([["today", "Day types"], ["mastery", "Mastery"], ["ideas", "Recent ideas"]] as const).map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`text-[11px] px-2.5 py-1 rounded-lg font-semibold transition-colors ${tab === k ? "bg-gray-700 text-gray-100" : "text-gray-400 hover:text-gray-200"}`}
            data-testid={`fx-models-tab-${k}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "today" && <DayTypesView rows={dayTypes.data?.dayTypes} loading={dayTypes.isLoading} />}
      {tab === "mastery" && <MasteryView rows={mastery.data?.slices} importedRows={mastery.data?.importedSlices} loading={mastery.isLoading} />}
      {tab === "ideas" && <IdeasView rows={decisions.data?.decisions} loading={decisions.isLoading} />}
    </div>
  );
}

const PROP_SIM_TITLE = "Prop-firm simulation of this model's current-system shadow record: $100k account, 0.5% risk per trade or less, 2.5% daily loss cap, 6% max loss";

function PropSimLine({ sim }: { sim?: PropSimSummary }) {
  if (!sim || sim.tradesTaken === 0) {
    return (
      <p className="text-[11px] text-gray-400 mt-1" title={PROP_SIM_TITLE}>
        Prop sim ($100k): no trades yet
      </p>
    );
  }
  if (sim.blown) {
    return (
      <p className="text-[11px] mt-1 font-bold" style={{ color: "#f87171" }} title={PROP_SIM_TITLE}>
        Prop sim ($100k): BLOWN {sim.blownAt ?? ""} · {fmtMoney(sim.endBalance)} · {sim.tradesTaken} trades
      </p>
    );
  }
  return (
    <p className="text-[11px] text-gray-300 mt-1" title={PROP_SIM_TITLE}>
      Prop sim ($100k): {fmtMoney(sim.endBalance)} ({sim.totalReturnPct >= 0 ? "+" : ""}{sim.totalReturnPct.toFixed(1)}%) · {sim.tradesTaken} trades · worst day {sim.worstDayPct.toFixed(1)}%
    </p>
  );
}

// ── Prop Firm Sim card — standalone, always-visible version of the prop sim.
// Rendered on Weekly Strategy OUTSIDE the Self-Learning Brain card so the
// $100k prop-firm replay can always be found: it renders in every state
// (loading, error, no trades yet, blown) instead of disappearing. Shares the
// panel's mastery query (same queryKey — react-query dedupes the fetch).
export function PropSimCard({ className = "" }: { className?: string }) {
  const mastery = useQuery<{ models: MasteryRow[]; slices: MasteryRow[]; importedSlices?: MasteryRow[]; propSim?: Record<string, PropSimSummary> }>({
    queryKey: [`/api/fx-models/mastery?engine=fx`],
    refetchInterval: 120000,
  });

  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(251,191,36,0.35)" }} data-testid="prop-sim-card">
      <div className="flex items-center gap-2">
        <Landmark className="w-5 h-5 text-amber-300 shrink-0" />
        <h3 className="text-base font-bold text-gray-100">Prop Firm Sim — $100,000</h3>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Model 1 and Model 2's shadow record, replayed as if it were a $100k prop-firm account: up to 0.5% risk per trade, 2.5% daily loss cap, blown at −6%.
      </p>

      {mastery.isError ? (
        <p className="text-[11px] text-gray-400 mt-3">Couldn't load the prop sim right now</p>
      ) : mastery.isLoading && !mastery.data ? (
        <p className="text-[11px] text-gray-500 mt-3">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
          {(["M1", "M2"] as const).map((m) => (
            <PropSimModelBlock key={m} model={m} sim={mastery.data?.propSim?.[m]} />
          ))}
        </div>
      )}
    </div>
  );
}

function PropSimModelBlock({ model, sim }: { model: "M1" | "M2"; sim?: PropSimSummary }) {
  const meta = MODEL_META[model];
  const Icon = meta.icon;
  const blown = !!sim?.blown;
  return (
    <div
      className="rounded-xl p-3 min-w-0"
      style={{ background: blown ? "rgba(248,113,113,0.08)" : meta.bg, border: `1px solid ${blown ? "rgba(248,113,113,0.4)" : meta.border}` }}
      data-testid={`prop-sim-block-${model}`}
      title={PROP_SIM_TITLE}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-4 h-4 shrink-0" style={{ color: meta.color }} />
        <span className="text-xs font-bold truncate" style={{ color: meta.color }}>{meta.name}</span>
      </div>
      {!sim || sim.tradesTaken === 0 ? (
        <>
          <p className="text-sm font-bold text-gray-300">No prop-sim trades yet</p>
          <p className="text-[10px] text-gray-500 mt-1">The sim starts counting when the current models' shadow trades resolve.</p>
        </>
      ) : blown ? (
        <>
          <p className="text-2xl font-black" style={{ color: "#f87171" }}>BLOWN{sim.blownAt ? ` · ${sim.blownAt}` : ""}</p>
          <p className="text-[11px] text-gray-300 mt-1">
            Ended at <span className="font-bold text-gray-100">{fmtMoney(sim.endBalance)}</span> ({sim.totalReturnPct >= 0 ? "+" : ""}{sim.totalReturnPct.toFixed(1)}%) · {sim.tradesTaken} trades · worst day {sim.worstDayPct.toFixed(1)}%
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-black text-gray-100">{fmtMoney(sim.endBalance)}</p>
          <p className="text-[11px] mt-0.5">
            <span className="font-bold" style={{ color: sim.totalReturnPct >= 0 ? "#34d399" : "#f87171" }}>
              {sim.totalReturnPct >= 0 ? "+" : ""}{sim.totalReturnPct.toFixed(1)}%
            </span>
            <span className="text-gray-400"> · {sim.tradesTaken} trades · worst day {sim.worstDayPct.toFixed(1)}%</span>
          </p>
        </>
      )}
    </div>
  );
}

function MasteryBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="mt-1.5 h-1 rounded-full bg-gray-800 overflow-hidden" title={`Mastery ${score}/100`}>
      <div className="h-full rounded-full" style={{ width: `${Math.max(2, Math.min(100, score))}%`, background: color }} />
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-[11px] text-gray-500 py-3 text-center">{text}</p>;
}

function DayTypesView({ rows, loading }: { rows?: DayTypeRow[]; loading: boolean }) {
  if (loading) return <Empty text="Loading…" />;
  if (!rows?.length) return <Empty text="No day types yet. The engine records one per pair every hour while it scans." />;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.symbol} className="flex items-center gap-2 rounded-lg bg-black/20 px-2.5 py-1.5" data-testid={`fx-daytype-${r.symbol}`}>
          <span className="text-[11px] font-bold text-gray-100 w-16 shrink-0">{r.symbol}</span>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize shrink-0" style={{ color: DAY_COLORS[r.day_type], background: `${DAY_COLORS[r.day_type]}1f` }}>
            {r.day_type}
          </span>
          <span className="text-[10px] text-gray-400 shrink-0">→ {r.auto_model === "M1" ? "Model 1" : "Model 2"}</span>
          <span className="text-[10px] text-gray-500 ml-auto truncate text-right">
            H1 {trendArrow(r.h1_trend)} H4 {trendArrow(r.h4_trend)}
            {r.adx_m15 != null ? ` · ADX ${Math.round(r.adx_m15)}` : ""}
            {r.rel_volume != null ? ` · vol ${r.rel_volume.toFixed(1)}×` : ""}
          </span>
        </div>
      ))}
      <p className="text-[9px] text-gray-600 pt-1">Latest reading per pair · {rows[0]?.session}</p>
    </div>
  );
}

function MasteryView({ rows, importedRows, loading }: { rows?: MasteryRow[]; importedRows?: MasteryRow[]; loading: boolean }) {
  if (loading) return <Empty text="Loading…" />;
  if (!rows?.length && !importedRows?.length) return <Empty text="Mastery builds as shadow ideas resolve. Expect the first results within a day." />;
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[9px] text-gray-500 px-2 pb-0.5">
        <span>Model · day · pair · session</span><span className="text-right">Trades</span><span className="text-right">WR / avg</span><span className="text-right">Level</span>
      </div>
      {(rows || []).slice(0, 25).map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center rounded-lg bg-black/20 px-2 py-1.5 text-[10px]">
          <span className="truncate text-gray-300">
            <span className="font-bold" style={{ color: MODEL_META[r.model].color }}>{r.model}</span> · {r.dayType} · {r.symbol} · {r.session}
            {r.wasExcludedPair && (
              <span className="ml-1 text-[8px] font-semibold px-1 py-px rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30" title="Probation: this pair was formerly blocked for this model — its record is being built under the lifted blocks">
                probation
              </span>
            )}
          </span>
          <span className="text-right text-gray-400">{r.trades}</span>
          <span className="text-right text-gray-300">{(r.winRate * 100).toFixed(0)}% / {fmtR(r.avgR)}</span>
          <span className="text-right font-semibold flex items-center gap-1 justify-end" style={{ color: levelColor(r.level) }}>
            {r.level.startsWith("Master") && <Award className="w-3 h-3" />}{r.level}
          </span>
        </div>
      ))}
      {!!importedRows?.length && (
        <>
          <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wide pt-2 px-2">Purchased model records</p>
          {importedRows.slice(0, 25).map((r, i) => (
            <div key={`imp-${i}`} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center rounded-lg bg-purple-500/5 border border-purple-500/20 px-2 py-1.5 text-[10px]">
              <span className="truncate text-gray-300">
                <span className="font-bold" style={{ color: MODEL_META[r.model].color }}>{r.model}</span> · {r.dayType} · {r.symbol} · {r.session}
                <span className={`ml-1 text-[8px] font-semibold px-1 py-px rounded-full border ${r.legacy ? "bg-gray-500/15 text-gray-400 border-gray-500/30" : "bg-purple-500/15 text-purple-300 border-purple-500/30"}`}>
                  {r.legacy ? "Earlier record (history) — cannot go live" : `Current system record · listing #${r.listingId ?? "—"}`}
                </span>
              </span>
              <span className="text-right text-gray-400">{r.epochTrades ?? 0}</span>
              <span className="text-right text-gray-300">{((r.epochWinRate ?? 0) * 100).toFixed(0)}% / {fmtR(r.epochAvgR)}</span>
              <span className="text-right font-semibold flex items-center gap-1 justify-end" style={{ color: levelColor(r.epochLevel || r.level) }}>
                {(r.epochLevel || r.level).startsWith("Master") && <Award className="w-3 h-3" />}{r.epochLevel || r.level}
              </span>
            </div>
          ))}
          <p className="text-[9px] text-gray-600 px-2 pt-1">Purchased records are graded on their current-system trades only. A proven purchased slice can qualify your own new trades — under your live switch, your daily limits, and every safety check.</p>
        </>
      )}
    </div>
  );
}

function IdeasView({ rows, loading }: { rows?: DecisionRow[]; loading: boolean }) {
  if (loading) return <Empty text="Loading…" />;
  if (!rows?.length) return <Empty text="No ideas yet. Each model is asked once per H1 candle." />;
  return (
    <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
      {rows.map((d) => {
        const chip = resultChip(d);
        return (
          <div key={d.id} className="rounded-lg bg-black/20 px-2.5 py-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[10px] font-bold" style={{ color: MODEL_META[d.model]?.color }}>{d.model}</span>
              <span className="text-[11px] font-bold text-gray-100">{d.symbol}</span>
              {d.direction !== "NONE" && (
                <span className={`text-[10px] font-bold ${d.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{d.direction}</span>
              )}
              <span className="text-[10px] text-gray-500 capitalize">{d.day_type}</span>
              <span className="text-[10px] font-semibold ml-auto" style={{ color: chip.color }}>{chip.label}</span>
            </div>
            {d.reasoning && <p className="text-[10px] text-gray-400 mt-0.5 line-clamp-2">{d.reasoning}</p>}
            <p className="text-[9px] text-gray-600 mt-0.5">{new Date(d.created_at).toLocaleString()}{d.confidence ? ` · ${d.confidence}%` : ""}</p>
          </div>
        );
      })}
    </div>
  );
}
