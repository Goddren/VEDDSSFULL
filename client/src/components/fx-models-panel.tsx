import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Layers, TrendingUp, Waves, Award } from "lucide-react";

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

export function FxModelsPanel({ className = "" }: { className?: string }) {
  const [tab, setTab] = useState<"today" | "mastery" | "ideas">("today");
  const dayTypes = useQuery<{ dayTypes: DayTypeRow[] }>({ queryKey: ["/api/fx-models/day-types"], refetchInterval: 60000 });
  const mastery = useQuery<{ models: MasteryRow[]; slices: MasteryRow[] }>({ queryKey: ["/api/fx-models/mastery"], refetchInterval: 120000 });
  const decisions = useQuery<{ decisions: DecisionRow[] }>({ queryKey: ["/api/fx-models/decisions?limit=60"], refetchInterval: 60000, enabled: tab === "ideas" });

  const models = mastery.data?.models || [];
  const modelStat = (m: "M1" | "M2") => models.find((x) => x.model === m);

  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(17,24,39,0.5)", border: "1.5px solid rgba(75,85,99,0.5)" }} data-testid="fx-models-panel">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-300 shrink-0" />
            <h3 className="text-sm font-bold text-gray-100">Model 1 / Model 2</h3>
            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">SHADOW</span>
          </div>
          <p className="text-[10px] text-gray-500 mt-0.5">Recording what each model would trade. No orders are placed.</p>
        </div>
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
      {tab === "mastery" && <MasteryView rows={mastery.data?.slices} loading={mastery.isLoading} />}
      {tab === "ideas" && <IdeasView rows={decisions.data?.decisions} loading={decisions.isLoading} />}
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

function MasteryView({ rows, loading }: { rows?: MasteryRow[]; loading: boolean }) {
  if (loading) return <Empty text="Loading…" />;
  if (!rows?.length) return <Empty text="Mastery builds as shadow ideas resolve. Expect the first results within a day." />;
  return (
    <div className="space-y-1">
      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[9px] text-gray-500 px-2 pb-0.5">
        <span>Model · day · pair · session</span><span className="text-right">Trades</span><span className="text-right">WR / avg</span><span className="text-right">Level</span>
      </div>
      {rows.slice(0, 25).map((r, i) => (
        <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center rounded-lg bg-black/20 px-2 py-1.5 text-[10px]">
          <span className="truncate text-gray-300">
            <span className="font-bold" style={{ color: MODEL_META[r.model].color }}>{r.model}</span> · {r.dayType} · {r.symbol} · {r.session}
          </span>
          <span className="text-right text-gray-400">{r.trades}</span>
          <span className="text-right text-gray-300">{(r.winRate * 100).toFixed(0)}% / {fmtR(r.avgR)}</span>
          <span className="text-right font-semibold flex items-center gap-1 justify-end" style={{ color: levelColor(r.level) }}>
            {r.level.startsWith("Master") && <Award className="w-3 h-3" />}{r.level}
          </span>
        </div>
      ))}
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
