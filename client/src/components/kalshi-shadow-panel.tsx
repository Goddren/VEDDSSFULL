import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { InfoExplainer } from "@/components/info-explainer";
import { fmtMoney } from "@/lib/utils";

interface KalshiShadowSummary {
  openCount: number;
  closedCount: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  estNetPnlUsd: number;
  fundingUsd: number;
  lastOpenedAt: string | null;
  lastClosedAt: string | null;
  enabled: boolean;
}

interface KalshiShadowStrategyStat {
  strategy: string;
  trades: number;
  wins: number;
  winRate: number;
  avgR: number | null;
  avgNetPct: number;
  estNetPnlUsd: number;
  fundingUsd: number;
}

interface KalshiShadowOpenPosition {
  id: number;
  strategy: string;
  ticker: string;
  underlying: string;
  direction: string;
  entry_price: number;
  stop_loss: number;
  take_profit: number;
  contracts: number;
  notional_usd: number;
  funding_accrued_usd: number;
  score: number | null;
  max_hours: number;
  opened_at: string;
  current_mark: number | null;
  unrealized_net_pct: number | null;
}

interface KalshiShadowRecentClose {
  id: number;
  strategy: string;
  ticker: string;
  underlying: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  return_pct: number;
  r_multiple: number | null;
  funding_accrued_usd: number;
  exit_reason: string | null;
  hold_minutes: number | null;
  closed_at: string;
}

interface KalshiShadowReport {
  days: number;
  summary: KalshiShadowSummary;
  byStrategy: KalshiShadowStrategyStat[];
  openPositions: KalshiShadowOpenPosition[];
  recentCloses: KalshiShadowRecentClose[];
}

const DAY_OPTIONS = [7, 30, 90] as const;

function pnlClass(v: number): string {
  return v >= 0 ? "text-emerald-300" : "text-red-300";
}

function fmtPctPoints(v: number | null | undefined, digits = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

function fmtWinRate(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${Math.round(v * 100)}%`;
}

function fmtR(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}R`;
}

function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `$${v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtContracts(v: number): string {
  return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function fmtDateTime(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function fmtHold(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  return `${(minutes / 60).toFixed(1)} h`;
}

function DirectionBadge({ direction }: { direction: string }) {
  const isLong = direction.toLowerCase() !== "short";
  return (
    <span className={`shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-bold tracking-wide ${isLong ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"}`}>
      {isLong ? "LONG" : "SHORT"}
    </span>
  );
}

function StatCard({ label, value, detail, valueClass = "text-gray-100" }: {
  label: string;
  value: ReactNode;
  detail: string;
  valueClass?: string;
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

export function KalshiShadowPanel({ className = "" }: { className?: string }) {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const { data, isLoading, isError } = useQuery<KalshiShadowReport>({
    queryKey: [`/api/kalshi-stock-shadow?days=${days}`],
    refetchInterval: 60_000,
  });

  const summary = data?.summary;
  const hasAnyTrades = !!summary && (summary.openCount > 0 || summary.closedCount > 0);

  return (
    <section
      className={`overflow-hidden rounded-md border border-white/10 bg-white/[0.03] p-2 ${className}`}
      data-testid="kalshi-shadow-panel"
    >
      <div className="mb-2 flex flex-wrap items-start gap-x-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300" aria-hidden="true">
          <BarChart3 className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-[11px] font-bold leading-tight text-gray-100">Kalshi Stock Perps — Shadow</h2>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-amber-300">
              SHADOW / SIMULATED
            </span>
            {summary && !summary.enabled ? (
              <span className="rounded-full bg-white/5 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-gray-400">LANE OFF</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
            Virtual single-stock perpetual positions on real Kalshi market data. No orders and no real balance.
          </p>
        </div>
        <InfoExplainer title="Kalshi stock-perp shadow results" accent="border-l-cyan-300/60">
          <p>This lane tests crypto, options, and FX-derived strategies on Kalshi single-stock perpetuals using real production market prices, without placing an order.</p>
          <p><b>Net %</b> already includes modeled trading costs and funding. <b>Funding P&amp;L</b> is signed: a positive value means the shadow position received funding overall; a negative value means it paid. With a positive funding rate, longs pay and shorts receive; the reverse applies when the rate is negative.</p>
          <p>Open positions show the current exit-side mark when Kalshi is reachable — the bid for a long and the ask for a short — and an estimated unrealized net result using that mark, accrued funding, and the modeled cost.</p>
        </InfoExplainer>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Kalshi shadow reporting window">
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Closed results:</span>
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={days === option}
            onClick={() => setDays(option)}
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums transition-colors ${days === option ? "bg-cyan-500/25 text-cyan-100" : "bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-200"}`}
          >
            {option}d
          </button>
        ))}
        {summary ? (
          <span className="min-w-0 break-words text-[9px] text-gray-600">
            Last opened {fmtDateTime(summary.lastOpenedAt)} · Last closed {fmtDateTime(summary.lastClosedAt)}
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="py-2 text-[11px] text-gray-500">Reading Kalshi shadow positions and results…</p>
      ) : isError ? (
        <p className="py-2 text-[11px] text-red-300">Kalshi shadow results are unavailable right now. The shadow lane itself is unaffected.</p>
      ) : data && summary ? (
        <>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Open positions" value={summary.openCount} detail={summary.openCount > data.openPositions.length ? `${data.openPositions.length} most recent shown` : "currently open"} />
            <StatCard label="Closed" value={summary.closedCount} detail={`valid closes in ${data.days} days`} />
            <StatCard label="Win rate" value={fmtWinRate(summary.winRate)} detail={`${summary.wins} winning closes`} />
            <StatCard label="Avg R" value={fmtR(summary.avgR)} detail="per valid close" />
            <StatCard label="Est. net P&L" value={fmtMoney(summary.estNetPnlUsd, { signed: true })} detail="net results in window" valueClass={pnlClass(summary.estNetPnlUsd)} />
            <StatCard label="Funding P&L" value={fmtMoney(summary.fundingUsd, { signed: true })} detail="signed contribution" valueClass={pnlClass(summary.fundingUsd)} />
          </div>

          {!hasAnyTrades ? (
            <div className="mt-3 rounded-lg bg-black/20 px-3 py-3 text-[11px] leading-relaxed text-gray-400">
              No Kalshi shadow trades recorded yet — the lane scans automatically and results will appear here as positions open and close.
            </div>
          ) : (
            <>
              <SectionTitle detail="Valid closes only; all returns are net">By strategy</SectionTitle>
              {data.byStrategy.length ? (
                <div className="space-y-1">
                  {data.byStrategy.map((s) => (
                    <div key={s.strategy} className="rounded-lg bg-black/20 px-2 py-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px]">
                        <span className="min-w-0 flex-1 break-words font-semibold text-gray-200">{s.strategy}</span>
                        <span className="shrink-0 tabular-nums text-gray-400">{s.trades} trades · {s.wins} wins</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums">
                        <span className="text-gray-300">Win rate {fmtWinRate(s.winRate)}</span>
                        <span className="text-gray-300">Avg {fmtR(s.avgR)}</span>
                        <span className={pnlClass(s.avgNetPct)}>Avg net {fmtPctPoints(s.avgNetPct)}</span>
                        <span className={pnlClass(s.estNetPnlUsd)}>Est. net {fmtMoney(s.estNetPnlUsd, { signed: true })}</span>
                        <span className={pnlClass(s.fundingUsd)}>Funding {fmtMoney(s.fundingUsd, { signed: true })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-500">No valid Kalshi shadow closes in this window yet.</p>
              )}

              <SectionTitle detail="Newest first; marks use the current exit-side touch when available">Open positions</SectionTitle>
              {data.openPositions.length ? (
                <div className="max-h-80 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                  {data.openPositions.map((p) => (
                    <div key={p.id} className="rounded-lg bg-black/20 px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                        <span className="font-bold text-gray-100">{p.underlying}</span>
                        <span className="min-w-0 break-all text-gray-500">{p.ticker}</span>
                        <DirectionBadge direction={p.direction} />
                        <span className="min-w-0 break-words text-gray-400">{p.strategy}</span>
                        {p.score != null ? <span className="ml-auto shrink-0 tabular-nums text-gray-500">score {Math.round(p.score)}</span> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
                        <span>Entry {fmtPrice(p.entry_price)}</span>
                        <span>Stop {fmtPrice(p.stop_loss)}</span>
                        <span>Target {fmtPrice(p.take_profit)}</span>
                        <span>{fmtContracts(p.contracts)} contracts · {fmtMoney(p.notional_usd)}</span>
                        <span className={pnlClass(p.funding_accrued_usd)}>Funding P&amp;L {fmtMoney(p.funding_accrued_usd, { signed: true })}</span>
                        <span>Opened {fmtDateTime(p.opened_at)} · max {p.max_hours}h</span>
                      </div>
                      <div className="mt-0.5 text-[10px] tabular-nums text-gray-400">
                        {p.current_mark != null && p.unrealized_net_pct != null ? (
                          <>Current exit mark {fmtPrice(p.current_mark)} · <span className={pnlClass(p.unrealized_net_pct)}>Est. unrealized net {fmtPctPoints(p.unrealized_net_pct)}</span></>
                        ) : (
                          <span className="text-gray-600">Current mark unavailable — recorded entry and funding are still shown.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-500">No Kalshi shadow positions are open right now.</p>
              )}

              <SectionTitle detail="Most recent valid closes">Recent closes</SectionTitle>
              {data.recentCloses.length ? (
                <div className="space-y-1">
                  {data.recentCloses.map((c) => (
                    <div key={c.id} className="rounded-lg bg-black/20 px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                        <span className="font-bold text-gray-100">{c.underlying}</span>
                        <span className="min-w-0 break-all text-gray-500">{c.ticker}</span>
                        <DirectionBadge direction={c.direction} />
                        <span className="min-w-0 break-words text-gray-400">{c.strategy}</span>
                        <span className="ml-auto shrink-0 text-gray-600">{fmtDateTime(c.closed_at)}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
                        <span>{fmtPrice(c.entry_price)} → {fmtPrice(c.exit_price)}</span>
                        <span className={pnlClass(c.return_pct)}>Net {fmtPctPoints(c.return_pct)}</span>
                        <span className={c.r_multiple == null ? "text-gray-400" : pnlClass(c.r_multiple)}>{fmtR(c.r_multiple)}</span>
                        <span className={pnlClass(c.funding_accrued_usd)}>Funding {fmtMoney(c.funding_accrued_usd, { signed: true })}</span>
                        <span>Exit {c.exit_reason || "—"}</span>
                        <span>Hold {fmtHold(c.hold_minutes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-500">No valid Kalshi shadow closes in this window yet.</p>
              )}
            </>
          )}
        </>
      ) : null}

      <p className="mt-3 break-words text-[9px] leading-relaxed text-gray-600">
        Simulated shadow results only — no orders or real funds. Net results include modeled costs and signed funding P&amp;L. Corporate-action closes are excluded from all stats and lists because prices spanning a split or similar action are not valid evidence.
      </p>
    </section>
  );
}
