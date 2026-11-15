import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CloudSun } from "lucide-react";
import { InfoExplainer } from "@/components/info-explainer";

const DAY_OPTIONS = [7, 30, 90] as const;

interface WeatherShadowSummary {
  openCount: number;
  closedCount: number;
  wins: number;
  winRate: number | null;
  avgReturnPct: number | null;
  avgR: number | null;
  estNetPnlUsd: number;
  snapshots: number;
  lastOpenedAt: string | null;
  lastClosedAt: string | null;
}
interface WeatherCityStat {
  city_code: string;
  city_name: string;
  trades: number;
  wins: number;
  win_rate: number | null;
  avg_return_pct: number | null;
  est_net_pnl_usd: number;
}
interface WeatherShadowReport {
  enabled: boolean;
  strategy: string;
  minEdgeCents: number;
  summary: WeatherShadowSummary;
  byCity: WeatherCityStat[];
  openPositions: any[];
  recentCloses: any[];
  bucketStats: Array<{ dim: string; bucket: string; n: number; medianNet: number; winRate: number; verdict: string }>;
  lastCycle: { opened: number; resolved: number; snapshots: number; reasons: string[]; at: string } | null;
}

function pnlClass(v: number): string {
  return v > 0 ? "text-emerald-300" : v < 0 ? "text-rose-300" : "text-gray-300";
}
function fmtPct(v: number | null | undefined, digits = 1): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}
function fmtWinRate(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}
function fmtUsd(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v < 0 ? "−" : ""}$${Math.abs(v).toFixed(2)}`;
}
function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function StatCard({ label, value, detail, valueClass = "text-gray-100" }: {
  label: string; value: ReactNode; detail: string; valueClass?: string;
}) {
  return (
    <div className="min-w-0 rounded-lg bg-black/20 px-2 py-1.5">
      <div className="text-[9px] font-bold uppercase tracking-wider text-gray-500">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-bold tabular-nums ${valueClass}`}>{value}</div>
      <div className="mt-0.5 break-words text-[9px] leading-snug text-gray-500">{detail}</div>
    </div>
  );
}

function SectionTitle({ children, detail }: { children: ReactNode; detail?: string }) {
  return (
    <div className="mb-1 mt-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h3 className="text-[10px] font-bold uppercase tracking-wider text-gray-300">{children}</h3>
      {detail ? <span className="min-w-0 break-words text-[9px] text-gray-500">{detail}</span> : null}
    </div>
  );
}

export function KalshiWeatherShadowPanel({ className = "" }: { className?: string }) {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const { data, isLoading, isError } = useQuery<WeatherShadowReport>({
    queryKey: [`/api/kalshi-weather-shadow?days=${days}`],
    refetchInterval: 60_000,
  });

  const summary = data?.summary;
  const hasAnyTrades = !!summary && (summary.openCount > 0 || summary.closedCount > 0);

  return (
    <section
      className={`overflow-hidden rounded-md border border-white/10 bg-white/[0.03] p-2 ${className}`}
      data-testid="kalshi-weather-shadow-panel"
    >
      <div className="mb-2 flex flex-wrap items-start gap-x-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300" aria-hidden="true">
          <CloudSun className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-[11px] font-bold leading-tight text-gray-100">Kalshi Weather — Ensemble Shadow</h2>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-amber-300">
              SHADOW / SIMULATED
            </span>
            {data && !data.enabled ? (
              <span className="rounded-full bg-white/5 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-gray-400">LANE OFF</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
            Practice trades on Kalshi's daily high-temperature markets (New York, Chicago, Miami, Austin, Los Angeles, Denver, Philadelphia). The model counts GFS + ECMWF weather-ensemble members to price each temperature bucket, cross-checks the National Weather Service forecast for the station Kalshi settles on, and only takes a shadow position when the model beats the market price by at least {data?.minEdgeCents ?? 8}¢ — the same bar the live weather strategy uses. No real money, no real orders.
          </p>
        </div>
        <InfoExplainer title="Kalshi weather ensemble shadow results" accent="border-l-sky-300/60">
          <p><b>How the model works.</b> Weather services run the atmosphere dozens of times with slightly different starting points (an "ensemble"). Counting how many of those runs land in each temperature bucket gives a real probability for that bucket — not a single guessed number. This lane blends the American GFS ensemble with the European ECMWF ensemble.</p>
          <p><b>Why weather?</b> Kalshi's temperature markets are priced by crowd intuition, and research on these markets shows the crowd systematically overpays for unlikely tail buckets and underprices the favorite. The ensemble corrects exactly that.</p>
          <p><b>The NWS cross-check.</b> Kalshi settles these markets on National Weather Service station readings, so the lane also records the NWS forecast high for the settlement station on every trade — if the ensemble and the NWS disagree, that shows up in the record.</p>
          <p><b>Price snapshots.</b> Settled Kalshi contracts usually leave no usable price history behind, so this lane saves a timestamped price snapshot for every bucket it looks at — that archive is what makes the shadow record gradeable later.</p>
          <p><b>Costs.</b> Results are net of a placeholder estimate of Kalshi's trading fee. Nothing here is live: a live step would be a separate, explicit decision after this record proves out.</p>
        </InfoExplainer>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Kalshi weather shadow reporting window">
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Closed trades from the last:</span>
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${days === option ? "bg-sky-500/25 text-sky-200" : "bg-white/5 text-gray-400"}`}
          >
            {option}d
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-3 text-center text-[10px] text-gray-500">Loading weather shadow record…</p>
      ) : isError || !data || !summary ? (
        <p className="py-3 text-center text-[10px] text-gray-500">Weather shadow record unavailable right now.</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Open" value={summary.openCount} detail="virtual positions waiting on settlement" />
            <StatCard label="Closed" value={summary.closedCount} detail={`in the last ${days} days`} />
            <StatCard label="Win rate" value={fmtWinRate(summary.winRate)} detail={`${summary.wins} winning closes`} valueClass={summary.winRate != null ? pnlClass(summary.winRate - 0.5) : undefined} />
            <StatCard label="Avg return" value={fmtPct(summary.avgReturnPct)} detail="per closed trade, net of modeled fees" valueClass={summary.avgReturnPct != null ? pnlClass(summary.avgReturnPct) : undefined} />
            <StatCard label="Est. net P&L" value={fmtUsd(summary.estNetPnlUsd)} detail="on $100 pretend stakes" valueClass={pnlClass(summary.estNetPnlUsd)} />
            <StatCard label="Price snapshots" value={summary.snapshots} detail="saved prices — the grading evidence" />
          </div>

          {!hasAnyTrades ? (
            <p className="mt-3 rounded-lg bg-black/20 px-2 py-2 text-[10px] leading-snug text-gray-400">
              No shadow trades yet. The lane scans every city's market about every 30 minutes and only opens a position when the ensemble model beats the market by the full edge bar — quiet stretches are the model agreeing with the market, not a fault.
            </p>
          ) : null}

          {data.byCity.length > 0 ? (
            <>
              <SectionTitle detail="the lane learns per city — station bias differs by airport">By city</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px] tabular-nums">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="py-0.5 pr-2 font-semibold">City</th>
                      <th className="py-0.5 pr-2 font-semibold">Trades</th>
                      <th className="py-0.5 pr-2 font-semibold">Win rate</th>
                      <th className="py-0.5 pr-2 font-semibold">Avg return</th>
                      <th className="py-0.5 font-semibold">Est. net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byCity.map((c) => (
                      <tr key={c.city_code} className="border-t border-white/5 text-gray-300">
                        <td className="py-1 pr-2 font-semibold text-gray-100">{c.city_name}</td>
                        <td className="py-1 pr-2">{c.trades}</td>
                        <td className="py-1 pr-2">{fmtWinRate(c.win_rate)}</td>
                        <td className={`py-1 pr-2 ${c.avg_return_pct != null ? pnlClass(c.avg_return_pct) : ""}`}>{fmtPct(c.avg_return_pct)}</td>
                        <td className={`py-1 ${pnlClass(c.est_net_pnl_usd)}`}>{fmtUsd(c.est_net_pnl_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {data.openPositions.length > 0 ? (
            <>
              <SectionTitle>Open shadow positions</SectionTitle>
              <ul className="flex flex-col gap-1">
                {data.openPositions.map((p: any) => (
                  <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-black/20 px-2 py-1.5 text-[10px]">
                    <span className="font-semibold text-gray-100">{p.city_name} — {p.subtitle ?? p.ticker}</span>
                    <span className="tabular-nums text-gray-400">
                      in at {p.entry_price_cents}¢ · model {Math.round(p.model_prob_pct)}% · edge +{Math.round(p.edge_cents)}¢ · {p.target_date}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {data.recentCloses.length > 0 ? (
            <>
              <SectionTitle>Recent closes</SectionTitle>
              <ul className="flex flex-col gap-1">
                {data.recentCloses.map((t: any) => (
                  <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-lg bg-black/20 px-2 py-1.5 text-[10px]">
                    <span className="font-semibold text-gray-100">{t.city_name} — {t.subtitle ?? t.ticker}</span>
                    <span className={`tabular-nums ${t.return_pct != null ? pnlClass(t.return_pct) : "text-gray-400"}`}>
                      settled {t.result === "yes" ? "YES" : "NO"} · {fmtPct(t.return_pct)} · {fmtDateTime(t.closed_at)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          {data.lastCycle ? (
            <p className="mt-3 break-words text-[9px] leading-snug text-gray-600">
              Last scan {fmtDateTime(data.lastCycle.at)}: opened {data.lastCycle.opened}, settled {data.lastCycle.resolved}, saved {data.lastCycle.snapshots} price snapshots.
              {data.lastCycle.reasons.length ? ` ${data.lastCycle.reasons.join(" · ")}` : ""}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
