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
  accountEnd?: number | null;
  accountReturnPct?: number | null;
}

interface KalshiAccountSim {
  startBalance: number;
  endBalance: number;
  totalReturnPct: number;
  trades: number;
  maxDrawdownPct: number;
  worstTradePct: number | null;
  bestTradePct: number | null;
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

interface KalshiPerpBrainTopBlock {
  strategy: string;
  underlying: string | null;
  ticker: string;
  direction: string | null;
  dim: string;
  bucket: string;
  blocks: number;
  medianNetPct: number | null;
  bucketN: number | null;
}

interface KalshiPerpBrain {
  enabled: boolean;
  vpEnabled: boolean;
  blocksInWindow: number;
  vpSkipsInWindow: number;
  favorBuckets: number;
  avoidBuckets: number;
  topBlocks: KalshiPerpBrainTopBlock[];
}

interface KalshiShadowReport {
  days: number;
  summary: KalshiShadowSummary;
  byStrategy: KalshiShadowStrategyStat[];
  openPositions: KalshiShadowOpenPosition[];
  recentCloses: KalshiShadowRecentClose[];
  accountSim?: KalshiAccountSim;
  perpBrain?: KalshiPerpBrain;
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

// Friendly names for the lane's strategy keys. The raw key stays visible in
// small text next to the friendly name, so nothing about which engine or
// variant produced a result is hidden — this only translates the shorthand.
const STRATEGY_LABELS: Record<string, string> = {
  orb: "ORB (opening range)",
  opt_orb: "Options ORB",
  opt_volume_profile: "Options volume profile",
  opt_breakout: "Options breakout",
  opt_momentum: "Options momentum",
  opt_order_flow: "Options order flow",
  fx_scalping: "FX scalping",
  fx_momentum: "FX momentum",
  fx_aggressive: "FX aggressive compound",
  fx_sniper: "FX sniper",
  fx_prop_firm_sniper: "FX prop-firm sniper",
  breakout: "Breakout",
  trend_following: "Trend following",
  structure: "Market structure",
  divergence: "Divergence",
  order_flow: "Order flow",
  volume_profile: "Volume profile",
  composite_autonomous: "Combined signals (composite)",
};

function strategyLabel(key: string): string {
  const known = STRATEGY_LABELS[key];
  if (known) return known;
  // Fallback for any future key: expand the prefix and snake_case.
  const prefixed = key.replace(/^fx_/, "FX ").replace(/^opt_/, "Options ");
  const words = prefixed.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : key;
}

// Plain words for the perp brain's bucket dimensions and values, so a block
// line reads like a sentence instead of a database row.
const BUCKET_DIM_LABELS: Record<string, string> = {
  hourEt: "time of day",
  session: "session",
  ticker: "ticker",
  side: "direction",
  spread: "spread",
  volatility: "volatility",
  funding: "funding",
  htf: "trend alignment",
  vp: "volume-profile position",
  all: "overall record",
};

function bucketDimLabel(dim: string): string {
  return BUCKET_DIM_LABELS[dim] || dim;
}

function bucketValueLabel(dim: string, bucket: string): string {
  if (dim === "hourEt") return bucket.replace(/^(\d+)-(\d+)ET$/, "$1–$2 ET");
  return bucket.replace(/_/g, " ");
}

function exitReasonLabel(reason: string | null | undefined): string {
  switch ((reason || "").toLowerCase()) {
    case "stop": return "hit its stop";
    case "target": return "hit its target";
    case "time limit": return "time limit reached";
    case "no price": return "closed — no price available";
    default: return reason || "—";
  }
}

// Plain-words takeaway, derived ONLY from the by-strategy numbers rendered
// below it: among strategies with a verdict-grade sample (8+ closed trades),
// name the best and worst by net result. Returns null when there isn't
// enough scored data to say either honestly.
function strategyTakeaway(stats: KalshiShadowStrategyStat[]): string | null {
  const scored = stats.filter((s) => s.trades >= 8);
  if (scored.length < 2) return null;
  const sorted = [...scored].sort((a, b) => b.estNetPnlUsd - a.estNetPnlUsd);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  if (best.strategy === worst.strategy || best.estNetPnlUsd === worst.estNetPnlUsd) return null;
  return `Strongest so far: ${strategyLabel(best.strategy)} (${fmtMoney(best.estNetPnlUsd, { signed: true })} net). Weakest: ${strategyLabel(worst.strategy)} (${fmtMoney(worst.estNetPnlUsd, { signed: true })} net).`;
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
            Practice trades on Kalshi's stock perpetuals — contracts that track single stocks like AAPL and TSLA — using the real market prices, but no real money and no real orders. Every result below is <b>net</b>: the daily funding charge and trading costs have already been taken out. This record is the proof each strategy has to build here before anyone talks about trading it live.
          </p>
        </div>
        <InfoExplainer title="Kalshi stock-perp shadow results" accent="border-l-cyan-300/60">
          <p><b>What is a stock perp?</b> A perpetual future on one stock — it follows the stock's price (AAPL, TSLA, and 50+ other names on Kalshi) with roughly 5× leverage, and unlike a normal future it never expires. This lane tests crypto, options, and FX-derived strategies on those contracts using real production prices, without placing an order.</p>
          <p><b>What "net" means.</b> Every number here already has funding and modeled trading costs taken out, so what you see is the result after the charges a real trade would have paid.</p>
          <p><b>Funding</b> is a daily charge that keeps the perp's price tied to the stock. It lands once a day at <b>4:00 PM ET</b>: when the funding rate is positive, longs pay and shorts receive; when it is negative, that flips. Funding totals are shown signed — positive means the position collected funding overall, negative means it paid.</p>
          <p><b>Why real prices?</b> Kalshi also offers demo prices, but those are simulated and can drift from the real market — proof built on them would prove nothing. This lane reads the live production feed only.</p>
          <p><b>The $100 account.</b> Percentages are hard to feel, so the panel also replays the closed trades on a pretend $100 account: it starts at $100 and applies each trade's real net result, in the order the trades closed. Each strategy gets its own $100 replay in the by-strategy list. The live lane can hold several trades at once, so read it as a clear illustration of what these results add up to — not an exact account history.</p>
          <p><b>The perp brain.</b> The lane keeps score of its own closed trades by setup — ticker, direction, session, time of day, and where price sat in the day's volume profile (the range where most trading happened). When a setup's record proves it loses — 15 or more trades and a clearly negative typical result — the brain blocks new shadow trades in that setup and logs what it stopped. Blocks are not permanent: the score only looks back 60 days, so a setup earns its way back as old losses age out. The brain also skips one volume-profile trap: buying right at the top, or selling right at the bottom, of the day's accepted value range.</p>
          <p><b>What happens if a strategy proves out?</b> Nothing automatic. A strategy first has to clear a promotion bar on this shadow record, and any live step after that is a separate, explicit decision — shadow results never turn into real orders on their own.</p>
          <p>Open positions show the price the position could close at right now when Kalshi is reachable — the bid for a long and the ask for a short — and what the net result would be at that price, with funding and costs included.</p>
        </InfoExplainer>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5" aria-label="Kalshi shadow reporting window">
        <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">Closed trades from the last:</span>
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
            <StatCard label="Net result" value={fmtMoney(summary.estNetPnlUsd, { signed: true })} detail="after funding + trading costs" valueClass={pnlClass(summary.estNetPnlUsd)} />
            <StatCard label="Win rate" value={fmtWinRate(summary.winRate)} detail={`${summary.wins} of ${summary.closedCount} closed trades won`} />
            <StatCard label="Trades closed" value={summary.closedCount} detail={`in the last ${data.days} days`} />
            <StatCard label="Open now" value={summary.openCount} detail={summary.openCount > data.openPositions.length ? `${data.openPositions.length} most recent shown below` : "positions currently open"} />
            <StatCard label="Funding total" value={fmtMoney(summary.fundingUsd, { signed: true })} detail="collected (+) or paid (−) in funding" valueClass={pnlClass(summary.fundingUsd)} />
            <StatCard label="Avg R" value={fmtR(summary.avgR)} detail="average result per closed trade, in R" />
          </div>

          {data.accountSim ? (
            <div className="mt-2 rounded-lg border border-cyan-400/25 bg-cyan-500/[0.06] px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="text-[11px] font-bold text-gray-100">If this was a $100 account</h3>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">last {data.days} days · closed trades only</span>
              </div>
              {data.accountSim.trades > 0 ? (
                <>
                  <div className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                    <span className="text-xl font-black tabular-nums text-gray-100">
                      {fmtMoney(data.accountSim.startBalance)} → <span className={pnlClass(data.accountSim.totalReturnPct)}>{fmtMoney(data.accountSim.endBalance)}</span>
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${pnlClass(data.accountSim.totalReturnPct)}`}>{fmtPctPoints(data.accountSim.totalReturnPct)} overall</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
                    <span>{data.accountSim.trades} closed trades counted</span>
                    <span>Worst dip {data.accountSim.maxDrawdownPct > 0 ? `−${data.accountSim.maxDrawdownPct.toFixed(1)}%` : "0%"} from the account's peak</span>
                    <span className={data.accountSim.bestTradePct != null ? pnlClass(data.accountSim.bestTradePct) : undefined}>Best trade {fmtPctPoints(data.accountSim.bestTradePct)}</span>
                    <span className={data.accountSim.worstTradePct != null ? pnlClass(data.accountSim.worstTradePct) : undefined}>Worst trade {fmtPctPoints(data.accountSim.worstTradePct)}</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-snug text-gray-500">
                    Starts at $100. Each closed trade adds its real net result — after funding and costs — to the balance, one trade at a time in the order trades closed. The live shadow lane can hold several trades at once, so treat this as a clear illustration, not an exact account history.
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[10px] leading-snug text-gray-400">
                  No closed trades yet in this window — the $100 result starts counting with the first close.
                </p>
              )}
            </div>
          ) : null}

          {data.perpBrain ? (
            <div className="mt-2 rounded-lg bg-black/20 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="text-[11px] font-bold text-gray-100">Perp brain</h3>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                  {data.perpBrain.enabled ? "acting on the lane's own lessons" : "switched off"}
                </span>
              </div>
              {data.perpBrain.enabled ? (
                <>
                  <p className="mt-1 text-[10px] leading-snug text-gray-400">
                    The brain blocks new shadow trades in setups its own record proves lose; blocks lift on their own as old results age out of the 60-day window.
                  </p>
                  <div className="mt-1 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
                    <span>Blocked in the last {data.days} days: <b className="text-gray-200">{data.perpBrain.blocksInWindow}</b></span>
                    {data.perpBrain.vpEnabled ? (
                      <span>Volume-profile edge skips: <b className="text-gray-200">{data.perpBrain.vpSkipsInWindow}</b></span>
                    ) : null}
                    <span>Setups currently rated: <span className="text-emerald-300">{data.perpBrain.favorBuckets} favor</span> · <span className="text-red-300">{data.perpBrain.avoidBuckets} avoid</span></span>
                  </div>
                  {data.perpBrain.topBlocks.length ? (
                    <div className="mt-1.5 space-y-0.5">
                      {data.perpBrain.topBlocks.map((b, i) => (
                        <p key={i} className="text-[10px] leading-snug text-gray-400">
                          <span className="font-semibold text-gray-200">{strategyLabel(b.strategy)}</span>
                          {" · "}{b.underlying || b.ticker}
                          {b.direction ? <> · {b.direction}</> : null}
                          {" — "}{bucketDimLabel(b.dim)}: {bucketValueLabel(b.dim, b.bucket)}
                          {b.medianNetPct != null && b.bucketN != null ? (
                            <> · median {fmtPctPoints(b.medianNetPct)} over {b.bucketN} trades</>
                          ) : null}
                          {" · "}stopped {b.blocks}×
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] leading-snug text-gray-500">Nothing blocked in this window — no setup has a proven-losing record yet, or the ones that did have aged out.</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-[10px] leading-snug text-gray-500">The perp brain is off right now, so no shadow trades are being blocked by it. The lane still records its results and advice as usual.</p>
              )}
            </div>
          ) : null}

          {!hasAnyTrades ? (
            <div className="mt-3 rounded-lg bg-black/20 px-3 py-3 text-[11px] leading-relaxed text-gray-400">
              No Kalshi shadow trades recorded yet — the lane scans automatically and results will appear here as positions open and close.
            </div>
          ) : (
            <>
              <SectionTitle detail="Closed trades only; every result is net of funding and costs">Results by strategy</SectionTitle>
              {strategyTakeaway(data.byStrategy) ? (
                <p className="mb-1.5 text-[10px] leading-snug text-gray-400">{strategyTakeaway(data.byStrategy)}</p>
              ) : null}
              {data.byStrategy.length ? (
                <div className="space-y-1">
                  {[...data.byStrategy].sort((a, b) => b.estNetPnlUsd - a.estNetPnlUsd).map((s) => (
                    <div key={s.strategy} className="rounded-lg bg-black/20 px-2 py-1.5">
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px]">
                        <span className="min-w-0 flex-1 break-words font-semibold text-gray-200">
                          {strategyLabel(s.strategy)} <span className="font-normal text-gray-600">{s.strategy}</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-400">{s.trades} trades · {s.wins} wins</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums">
                        <span className="text-gray-300">Win rate {fmtWinRate(s.winRate)}</span>
                        <span className="text-gray-300">Avg {fmtR(s.avgR)}</span>
                        <span className={pnlClass(s.avgNetPct)}>Avg net {fmtPctPoints(s.avgNetPct)}</span>
                        <span className={pnlClass(s.estNetPnlUsd)}>Net total {fmtMoney(s.estNetPnlUsd, { signed: true })}</span>
                        <span className={pnlClass(s.fundingUsd)}>Funding {fmtMoney(s.fundingUsd, { signed: true })}</span>
                        {data.accountSim ? (
                          s.accountEnd != null ? (
                            <span className={pnlClass(s.accountReturnPct ?? 0)}>$100 account → {fmtMoney(s.accountEnd)} ({fmtPctPoints(s.accountReturnPct)})</span>
                          ) : (
                            <span className="text-gray-500">$100 account —</span>
                          )
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-500">No Kalshi shadow trades have closed in this window yet.</p>
              )}

              <SectionTitle detail="Newest first; each shows the price it could close at right now">Open positions</SectionTitle>
              {data.openPositions.length ? (
                <div className="max-h-80 space-y-1 overflow-y-auto overflow-x-hidden pr-1">
                  {data.openPositions.map((p) => (
                    <div key={p.id} className="rounded-lg bg-black/20 px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                        <span className="font-bold text-gray-100">{p.underlying}</span>
                        <span className="min-w-0 break-all text-gray-500">{p.ticker}</span>
                        <DirectionBadge direction={p.direction} />
                        <span className="min-w-0 break-words text-gray-400">{strategyLabel(p.strategy)}</span>
                        {p.score != null ? <span className="ml-auto shrink-0 tabular-nums text-gray-500">signal score {Math.round(p.score)}</span> : null}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
                        <span>Entry {fmtPrice(p.entry_price)}</span>
                        <span>Stop {fmtPrice(p.stop_loss)}</span>
                        <span>Target {fmtPrice(p.take_profit)}</span>
                        <span>{fmtContracts(p.contracts)} contracts · {fmtMoney(p.notional_usd)}</span>
                        <span className={pnlClass(p.funding_accrued_usd)}>Funding so far {fmtMoney(p.funding_accrued_usd, { signed: true })}</span>
                        <span>Opened {fmtDateTime(p.opened_at)} · closes within {p.max_hours}h</span>
                      </div>
                      <div className="mt-0.5 text-[10px] tabular-nums text-gray-400">
                        {p.current_mark != null && p.unrealized_net_pct != null ? (
                          <>Price if closed now {fmtPrice(p.current_mark)} · <span className={pnlClass(p.unrealized_net_pct)}>Result if closed now {fmtPctPoints(p.unrealized_net_pct)} net</span></>
                        ) : (
                          <span className="text-gray-600">Live price unavailable right now — the recorded entry and funding are still shown.</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-500">No Kalshi shadow positions are open right now.</p>
              )}

              <SectionTitle detail="Most recent closed trades, newest first">Recent closes</SectionTitle>
              {data.recentCloses.length ? (
                <div className="space-y-1">
                  {data.recentCloses.map((c) => (
                    <div key={c.id} className="rounded-lg bg-black/20 px-2 py-1.5">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                        <span className="font-bold text-gray-100">{c.underlying}</span>
                        <span className="min-w-0 break-all text-gray-500">{c.ticker}</span>
                        <DirectionBadge direction={c.direction} />
                        <span className="min-w-0 break-words text-gray-400">{strategyLabel(c.strategy)}</span>
                        <span className="ml-auto shrink-0 text-gray-600">{fmtDateTime(c.closed_at)}</span>
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
                        <span>{fmtPrice(c.entry_price)} → {fmtPrice(c.exit_price)}</span>
                        <span className={pnlClass(c.return_pct)}>Net {fmtPctPoints(c.return_pct)}</span>
                        <span className={c.r_multiple == null ? "text-gray-400" : pnlClass(c.r_multiple)}>{fmtR(c.r_multiple)}</span>
                        <span className={pnlClass(c.funding_accrued_usd)}>Funding {fmtMoney(c.funding_accrued_usd, { signed: true })}</span>
                        <span>Closed: {exitReasonLabel(c.exit_reason)}</span>
                        <span>Held {fmtHold(c.hold_minutes)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-gray-500">No Kalshi shadow trades have closed in this window yet.</p>
              )}
            </>
          )}
        </>
      ) : null}

      <p className="mt-3 break-words text-[9px] leading-relaxed text-gray-600">
        Practice results only — no orders are placed and no real money moves. Net results already include modeled trading costs and the daily funding charge. Trades that spanned a stock split or similar corporate action are left out of every stat and list, because prices from before and after a split can't be compared honestly.
      </p>
    </section>
  );
}
