import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Trophy } from "lucide-react";
import { InfoExplainer } from "@/components/info-explainer";

const DAY_OPTIONS = [7, 30, 90] as const;

interface SportsShadowSummary {
  openCount: number;
  closedCount: number;
  wins: number;
  winRate: number | null;
  avgReturnPct: number | null;
  avgR: number | null;
  estNetPnlUsd: number;
  snapshots: number;
  observations: number;
  lastOpenedAt: string | null;
  lastClosedAt: string | null;
}
interface SportsLeagueStat {
  league: string;
  trades: number;
  wins: number;
  win_rate: number | null;
  avg_return_pct: number | null;
  est_net_pnl_usd: number;
}
interface SportsShadowReport {
  enabled: boolean;
  strategy: string;
  minDivergencePts: number;
  activation: { oddspapiKeyConfigured: boolean; oddsApiKeyConfigured: boolean; activeSource: string | null };
  summary: SportsShadowSummary;
  byLeague: SportsLeagueStat[];
  openPositions: any[];
  recentCloses: any[];
  bucketStats: Array<{ dim: string; bucket: string; n: number; medianNet: number; winRate: number; verdict: string }>;
  lastCycle: { opened: number; resolved: number; snapshots: number; matched: number; evaluated: number; reasons: string[]; at: string } | null;
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

export function KalshiSportsShadowPanel({ className = "" }: { className?: string }) {
  const [days, setDays] = useState<(typeof DAY_OPTIONS)[number]>(30);
  const { data, isLoading, isError } = useQuery<SportsShadowReport>({
    queryKey: [`/api/kalshi-sports-shadow?days=${days}`],
    refetchInterval: 60_000,
  });

  const summary = data?.summary;
  const hasAnyTrades = !!summary && (summary.openCount > 0 || summary.closedCount > 0);
  const dormant = !!data && !data.activation.activeSource;

  return (
    <section
      className={`overflow-hidden rounded-md border border-white/10 bg-white/[0.03] p-2 ${className}`}
      data-testid="kalshi-sports-shadow-panel"
    >
      <div className="mb-2 flex flex-wrap items-start gap-x-2.5">
        <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-300" aria-hidden="true">
          <Trophy className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="text-[11px] font-bold leading-tight text-gray-100">Kalshi Sports — Book-Odds Benchmark Shadow</h2>
            <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-amber-300">
              SHADOW / SIMULATED
            </span>
            {data && !data.enabled ? (
              <span className="rounded-full bg-white/5 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-gray-400">LANE OFF</span>
            ) : dormant ? (
              <span className="rounded-full bg-white/5 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-gray-400">DORMANT — NO ODDS KEY</span>
            ) : null}
          </div>
          <p className="mt-0.5 text-[10px] leading-snug text-gray-500">
            Practice trades on Kalshi game-winner markets (NFL, NBA, MLB, NHL, college football and basketball). The benchmark is the sharp sportsbook line with the bookmaker's margin removed ("de-vigged") — Pinnacle via OddsPapi when that key is set, mainstream books via The Odds API otherwise. A shadow position opens only when the book's true probability beats Kalshi's price by at least {data?.minDivergencePts ?? 4} points — the same bar the live sports guard uses. Games are matched between the book and Kalshi strictly, by both teams and date; anything ambiguous is skipped. No real money, no real orders.
          </p>
        </div>
        <InfoExplainer title="Kalshi sports odds-benchmark shadow results" accent="border-l-orange-300/60">
          <p><b>Why book odds?</b> A sharp book's closing line is the strongest public probability in sports — every academic study measures against it. Removing the bookmaker's margin from both sides ("de-vigging") turns the two prices into honest win probabilities.</p>
          <p><b>The trade.</b> Kalshi's game prices are set by a retail-heavy crowd and can lag or overshoot the book. When the de-vigged book probability says a team wins 62% of the time but Kalshi sells that outcome at 55¢, the 7-point gap is the signal — this lane only acts at {data?.minDivergencePts ?? 4}+ points.</p>
          <p><b>Strict matching.</b> A game counts only when both teams and the game window line up exactly between the book and Kalshi, with exactly one possible pairing. If two games could match, the lane skips both — a wrong pairing would poison the record.</p>
          <p><b>Evidence.</b> Every matched game is written down (book probability next to Kalshi's price) whether or not a position opens, and Kalshi prices are snapshotted on a schedule — settled contracts leave almost no price history behind, so the lane keeps its own.</p>
          <p><b>Costs.</b> Results are net of a placeholder estimate of Kalshi's trading fee. Nothing here is live: a live step would be a separate, explicit decision after this record proves out.</p>
        </InfoExplainer>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Kalshi sports shadow reporting window">
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Closed trades from the last:</span>
        {DAY_OPTIONS.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDays(option)}
            className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${days === option ? "bg-orange-500/25 text-orange-200" : "bg-white/5 text-gray-400"}`}
          >
            {option}d
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="py-3 text-center text-[10px] text-gray-500">Loading sports shadow record…</p>
      ) : isError || !data || !summary ? (
        <p className="py-3 text-center text-[10px] text-gray-500">Sports shadow record unavailable right now.</p>
      ) : (
        <>
          {dormant ? (
            <p className="mb-2 rounded-lg bg-black/20 px-2 py-2 text-[10px] leading-snug text-gray-400">
              This lane is built and ready but dormant: no odds API key is configured on the server. Adding a free OddsPapi key (Pinnacle lines) as <span className="font-mono text-gray-200">ODDSPAPI_KEY</span> — or a free The Odds API key as <span className="font-mono text-gray-200">ODDS_API_KEY</span> — in the server environment switches it on. Until then it takes no positions and costs nothing.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label="Open" value={summary.openCount} detail="virtual positions waiting on settlement" />
            <StatCard label="Closed" value={summary.closedCount} detail={`in the last ${days} days`} />
            <StatCard label="Win rate" value={fmtWinRate(summary.winRate)} detail={`${summary.wins} winning closes`} valueClass={summary.winRate != null ? pnlClass(summary.winRate - 0.5) : undefined} />
            <StatCard label="Avg return" value={fmtPct(summary.avgReturnPct)} detail="per closed trade, net of modeled fees" valueClass={summary.avgReturnPct != null ? pnlClass(summary.avgReturnPct) : undefined} />
            <StatCard label="Est. net P&L" value={fmtUsd(summary.estNetPnlUsd)} detail="on $100 pretend stakes" valueClass={pnlClass(summary.estNetPnlUsd)} />
            <StatCard label="Games graded" value={summary.observations} detail={`${summary.snapshots} Kalshi price snapshots saved`} />
          </div>

          {!hasAnyTrades && !dormant ? (
            <p className="mt-3 rounded-lg bg-black/20 px-2 py-2 text-[10px] leading-snug text-gray-400">
              No shadow trades yet. The lane compares every matched game about every 6 hours and only opens a position when the book's de-vigged probability beats Kalshi's price by the full divergence bar — quiet stretches are the market agreeing with the book, not a fault.
            </p>
          ) : null}

          {data.byLeague.length > 0 ? (
            <>
              <SectionTitle detail="the record is kept per league — books price some leagues sharper than others">By league</SectionTitle>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[10px] tabular-nums">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="py-0.5 pr-2 font-semibold">League</th>
                      <th className="py-0.5 pr-2 font-semibold">Trades</th>
                      <th className="py-0.5 pr-2 font-semibold">Win rate</th>
                      <th className="py-0.5 pr-2 font-semibold">Avg return</th>
                      <th className="py-0.5 font-semibold">Est. net</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.byLeague.map((l) => (
                      <tr key={l.league} className="border-t border-white/5 text-gray-300">
                        <td className="py-1 pr-2 font-semibold text-gray-100">{l.league}</td>
                        <td className="py-1 pr-2">{l.trades}</td>
                        <td className="py-1 pr-2">{fmtWinRate(l.win_rate)}</td>
                        <td className={`py-1 pr-2 ${l.avg_return_pct != null ? pnlClass(l.avg_return_pct) : ""}`}>{fmtPct(l.avg_return_pct)}</td>
                        <td className={`py-1 ${pnlClass(l.est_net_pnl_usd)}`}>{fmtUsd(l.est_net_pnl_usd)}</td>
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
                    <span className="font-semibold text-gray-100">{p.league} — {p.team} vs {p.opponent}</span>
                    <span className="tabular-nums text-gray-400">
                      in at {p.entry_price_cents}¢ · book {Math.round(p.book_prob_pct)}% · edge +{Math.round(p.divergence_cents)} pts via {p.bookmaker ?? p.odds_source}
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
                    <span className="font-semibold text-gray-100">{t.league} — {t.team} vs {t.opponent}</span>
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
              Last scan {fmtDateTime(data.lastCycle.at)}: evaluated {data.lastCycle.evaluated} Kalshi games, matched {data.lastCycle.matched}, opened {data.lastCycle.opened}, settled {data.lastCycle.resolved}, saved {data.lastCycle.snapshots} price snapshots.
              {data.lastCycle.reasons.length ? ` ${data.lastCycle.reasons.join(" · ")}` : ""}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
