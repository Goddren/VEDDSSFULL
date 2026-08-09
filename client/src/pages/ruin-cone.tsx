import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, Loader2, RefreshCw, Shield, Target, TrendingUp } from "lucide-react";

// ── Types (mirror server/services/ruin-cone.ts) ─────────────────────────────
interface ConePoint { tradeIndex: number; p5: number; p25: number; p50: number; p75: number; p95: number; }
interface RuinStats {
  probRuin: number; probDailyLossBreach: number; probConsistencyBreach: number; probHitTarget: number;
  expectedFinalEquity: number; stdDevFinalEquity: number;
  simulationsRun: number; tradesProjected: number; sourceTradeCount: number; tradesPerDay: number;
  startingEquity: number; dailyLossLimit: number; maxDrawdownLimit: number;
  consistencyRuleThreshold: number; profitTarget: number;
}
interface RuinConeResponse { cone: ConePoint[]; stats: RuinStats; warning?: string; }

interface Overrides {
  numSimulations?: number; numTrades?: number;
  dailyLossLimit?: number; maxDrawdownLimit?: number; profitTarget?: number; consistencyPct?: number;
}

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const fmtPct = (f: number) => `${(f * 100).toFixed(1)}%`;

// Prob-of-ruin traffic light: >15% red, 5–15% amber, <5% green.
function ruinColor(p: number): string {
  if (p > 0.15) return "#ef4444";
  if (p >= 0.05) return "#f59e0b";
  return "#10b981";
}

export default function RuinConePage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [overrides, setOverrides] = useState<Overrides>({});
  const [nonce, setNonce] = useState(0); // bump to force a fresh (uncached) run

  // Live Kalshi engine config — to read/toggle the Ruin Guard circuit breaker.
  const { data: engine } = useQuery<any>({
    queryKey: ["/api/kalshi/engine/status"],
    enabled: !!user,
  });
  const guardOn: boolean = engine?.config?.ruinGuardEnabled ?? false;

  const url = useMemo(() => {
    const p = new URLSearchParams();
    if (overrides.numSimulations)   p.set("numSimulations", String(overrides.numSimulations));
    if (overrides.numTrades)        p.set("numTrades", String(overrides.numTrades));
    if (overrides.dailyLossLimit)   p.set("dailyLossLimit", String(overrides.dailyLossLimit));
    if (overrides.maxDrawdownLimit) p.set("maxDrawdownLimit", String(overrides.maxDrawdownLimit));
    if (overrides.profitTarget)     p.set("profitTarget", String(overrides.profitTarget));
    if (overrides.consistencyPct)   p.set("consistencyRuleThreshold", String(overrides.consistencyPct));
    if (nonce > 0)                  p.set("nocache", "1"); // manual resimulate always busts the 5-min cache
    const s = p.toString();
    return `/api/analytics/ruin-cone${s ? `?${s}` : ""}`;
  }, [overrides, nonce]);

  const { data, isFetching, isError, error } = useQuery<RuinConeResponse>({
    queryKey: [url, nonce],
    queryFn: async () => (await apiRequest("GET", url)).json(),
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });

  const stats = data?.stats;

  // Recharts floating bands: dataKey → [low, high] renders a band.
  const chartData = useMemo(() => (data?.cone ?? []).map((c) => ({
    tradeIndex: c.tradeIndex,
    outer: [c.p5, c.p95] as [number, number],
    inner: [c.p25, c.p75] as [number, number],
    p50: c.p50,
  })), [data]);

  const ddFloor = stats ? stats.startingEquity - stats.maxDrawdownLimit : 0;
  const targetLine = stats ? stats.startingEquity + stats.profitTarget : 0;

  // Current (possibly-edited) $ limits, converted to % of starting equity for
  // the engine's Ruin Guard config.
  const dailyLimit$ = overrides.dailyLossLimit ?? stats?.dailyLossLimit ?? 0;
  const maxDD$ = overrides.maxDrawdownLimit ?? stats?.maxDrawdownLimit ?? 0;

  const guardMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const eq = stats?.startingEquity || 1;
      const res = await apiRequest("PUT", "/api/kalshi/engine/config", {
        ruinGuardEnabled: enabled,
        dailyLossLimitPct: Math.max(1, Math.round((dailyLimit$ / eq) * 100)),
        maxDrawdownLimitPct: Math.max(1, Math.round((maxDD$ / eq) * 100)),
      });
      return res.json();
    },
    onSuccess: (_data, enabled) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] });
      toast({
        title: enabled ? "Ruin Guard enabled" : "Ruin Guard disabled",
        description: enabled
          ? `Kalshi engine will halt new trades at −${fmtUsd(dailyLimit$)}/day or ${fmtUsd(maxDD$)} drawdown.`
          : "Live circuit breaker is now off.",
      });
    },
    onError: (e: any) => toast({ title: "Failed to update Ruin Guard", description: e?.message, variant: "destructive" }),
  });

  return (
    <div className="app-page min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-grad-gold">
              RUIN CONE — FORWARD MONTE CARLO
            </h1>
            <p className="mt-1 text-sm text-white/50">
              Forward-projects your scanner's own realized trade distribution against FTUK prop-firm rules.
              Bootstrap-resampled from actual outcomes — no Gaussian assumption.
            </p>
          </div>
          <button
            onClick={() => setNonce((n) => n + 1)}
            disabled={isFetching}
            className="flex shrink-0 items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 transition hover:bg-amber-500/20 disabled:opacity-50"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Resimulate
          </button>
        </div>

        {isError && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <AlertTriangle className="h-4 w-4" /> Failed to run simulation: {(error as any)?.message ?? "unknown error"}
          </div>
        )}
        {data?.warning && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            <AlertTriangle className="h-4 w-4" /> {data.warning}
          </div>
        )}

        {/* Stat strip */}
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard
            icon={<Shield className="h-4 w-4" />}
            label="Prob. of Ruin"
            value={stats ? fmtPct(stats.probRuin) : "—"}
            sub={stats ? `max DD ${fmtUsd(stats.maxDrawdownLimit)}` : ""}
            color={stats ? ruinColor(stats.probRuin) : "#6b7280"}
            loading={isFetching && !stats}
          />
          <StatCard
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Consistency Breach"
            value={stats ? fmtPct(stats.probConsistencyBreach) : "—"}
            sub={stats ? `> ${fmtPct(stats.consistencyRuleThreshold)} of profit / day` : ""}
            color="#fbbf24"
            loading={isFetching && !stats}
          />
          <StatCard
            icon={<Target className="h-4 w-4" />}
            label="Prob. Hit Target"
            value={stats ? fmtPct(stats.probHitTarget) : "—"}
            sub={stats ? `+${fmtUsd(stats.profitTarget)} before breach` : ""}
            color="#10b981"
            loading={isFetching && !stats}
          />
          <StatCard
            icon={<TrendingUp className="h-4 w-4" />}
            label="Expected Final Equity"
            value={stats ? fmtUsd(stats.expectedFinalEquity) : "—"}
            sub={stats ? `± ${fmtUsd(stats.stdDevFinalEquity)} SD` : ""}
            color="#f59e0b"
            loading={isFetching && !stats}
          />
        </div>

        {/* Cone chart */}
        <div className="smart-card p-4 md:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wider text-white/40">
              Equity cone · {stats ? `${stats.simulationsRun.toLocaleString()} sims × ${stats.tradesProjected} trades` : "…"}
            </span>
            <div className="flex items-center gap-3 text-[11px] font-mono text-white/50">
              <LegendSwatch color="rgba(245,158,11,0.15)" label="5–95%" />
              <LegendSwatch color="rgba(245,158,11,0.35)" label="25–75%" />
              <LegendSwatch color="#f59e0b" label="median" solid />
            </div>
          </div>

          <div className="h-[360px] w-full">
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 16, bottom: 4, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis
                    dataKey="tradeIndex" tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                    tickLine={false} axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    label={{ value: "Trade #", position: "insideBottom", offset: -2, fill: "rgba(255,255,255,0.35)", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }} tickLine={false}
                    axisLine={{ stroke: "rgba(255,255,255,0.1)" }} width={64}
                    domain={["auto", "auto"]} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                  />
                  <Tooltip
                    contentStyle={{ background: "#0d1226", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: "rgba(255,255,255,0.6)" }}
                    formatter={(val: any, name: string) => {
                      if (Array.isArray(val)) return [`${fmtUsd(val[0])} – ${fmtUsd(val[1])}`, name === "outer" ? "5–95%" : "25–75%"];
                      return [fmtUsd(val), "median"];
                    }}
                    labelFormatter={(l) => `Trade ${l}`}
                  />
                  <Area dataKey="outer" stroke="none" fill="rgba(245,158,11,0.13)" isAnimationActive={false} />
                  <Area dataKey="inner" stroke="none" fill="rgba(245,158,11,0.30)" isAnimationActive={false} />
                  <Line dataKey="p50" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                  {stats && (
                    <ReferenceLine
                      y={targetLine} stroke="#10b981" strokeDasharray="5 4"
                      label={{ value: `Target ${fmtUsd(targetLine)}`, position: "insideTopRight", fill: "#10b981", fontSize: 10 }}
                    />
                  )}
                  {stats && (
                    <ReferenceLine
                      y={ddFloor} stroke="#ef4444" strokeDasharray="5 4"
                      label={{ value: `Max DD ${fmtUsd(ddFloor)}`, position: "insideBottomRight", fill: "#ef4444", fontSize: 10 }}
                    />
                  )}
                  {stats && (
                    <ReferenceLine y={stats.startingEquity} stroke="rgba(255,255,255,0.25)" strokeDasharray="2 4" />
                  )}
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-white/40">
                {isFetching ? (
                  <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Running Monte Carlo…</span>
                ) : "No simulation data."}
              </div>
            )}
          </div>
        </div>

        {/* Rule settings — pre-filled from the server's resolved values; edit to match your FTUK terms */}
        {stats && (
          <div className="smart-card mt-4 p-4 md:p-5">
            <div className="mb-3 text-xs uppercase tracking-wider text-white/40">
              FTUK rule settings · starting equity {fmtUsd(stats.startingEquity)} (Kalshi bankroll) ·
              {" "}{stats.sourceTradeCount} trades sampled · ~{stats.tradesPerDay}/day
            </div>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <RuleInput label="Forward trades" value={overrides.numTrades ?? stats.tradesProjected}
                onChange={(v) => setOverrides((o) => ({ ...o, numTrades: v }))} />
              <RuleInput label="Simulations" value={overrides.numSimulations ?? stats.simulationsRun}
                onChange={(v) => setOverrides((o) => ({ ...o, numSimulations: v }))} />
              <RuleInput label="Daily loss ($)" value={overrides.dailyLossLimit ?? stats.dailyLossLimit}
                onChange={(v) => setOverrides((o) => ({ ...o, dailyLossLimit: v }))} />
              <RuleInput label="Max DD ($)" value={overrides.maxDrawdownLimit ?? stats.maxDrawdownLimit}
                onChange={(v) => setOverrides((o) => ({ ...o, maxDrawdownLimit: v }))} />
              <RuleInput label="Profit target ($)" value={overrides.profitTarget ?? stats.profitTarget}
                onChange={(v) => setOverrides((o) => ({ ...o, profitTarget: v }))} />
              <RuleInput label="Consistency (%)" value={overrides.consistencyPct ?? Math.round(stats.consistencyRuleThreshold * 100)}
                onChange={(v) => setOverrides((o) => ({ ...o, consistencyPct: v }))} />
            </div>
            <p className="mt-3 text-[11px] text-white/35">
              Edit any value to match your actual FTUK account terms, then hit Resimulate. Daily-loss breach
              probability this run: <span className="font-mono text-white/60">{fmtPct(stats.probDailyLossBreach)}</span>.
            </p>

            {/* Live enforcement — wire these limits into the Kalshi engine's circuit breaker */}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4" style={{ color: guardOn ? "#10b981" : "#6b7280" }} />
                <div>
                  <div className="text-sm font-medium text-white/80">
                    Ruin Guard — live circuit breaker{" "}
                    <span className="font-mono text-xs" style={{ color: guardOn ? "#10b981" : "#f59e0b" }}>
                      {guardOn ? "ON" : "OFF"}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/45">
                    When ON, the Kalshi engine stops opening new trades at −{fmtUsd(dailyLimit$)}/day or {fmtUsd(maxDD$)} drawdown from peak.
                  </div>
                </div>
              </div>
              <button
                onClick={() => guardMutation.mutate(!guardOn)}
                disabled={guardMutation.isPending}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
                  guardOn
                    ? "border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
                    : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                }`}
              >
                {guardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                {guardOn ? "Disable on engine" : "Enable on engine"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Local presentational bits ───────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, loading }: {
  icon: React.ReactNode; label: string; value: string; sub?: string; color: string; loading?: boolean;
}) {
  return (
    <div className="smart-card p-4">
      <div className="flex items-center gap-2 text-white/50" style={{ color }}>
        {icon}
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
      </div>
      <div className="mt-2 font-mono text-2xl font-bold tabular-nums" style={{ color }}>
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
      </div>
      {sub && <div className="mt-1 font-mono text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}

function RuleInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-white/45">{label}</span>
      <input
        type="number"
        defaultValue={value}
        onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && v > 0) onChange(v); }}
        className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-sm text-white/80 outline-none focus:border-amber-500/40"
      />
    </label>
  );
}

function LegendSwatch({ color, label, solid }: { color: string; label: string; solid?: boolean }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-2.5 w-4 rounded-sm" style={solid ? { background: color, height: 2 } : { background: color }} />
      {label}
    </span>
  );
}
