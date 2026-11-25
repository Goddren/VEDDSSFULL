import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { InfoExplainer } from "@/components/info-explainer";
import { KalshiPerpArmingSection } from "@/components/kalshi-perp-arming";
import { fmtMoney } from "@/lib/utils";

interface KalshiShadowSummary {
  openCount: number;
  closedCount: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  estNetPnlUsd: number;
  fundingUsd: number;
  invalidExcludedCount?: number;
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
  funding_estimate_usd: number;
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
  funding_model: string;
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
  earningsEnabled?: boolean;
  earningsSkipsInWindow?: number;
  favorBuckets: number;
  avoidBuckets: number;
  topBlocks: KalshiPerpBrainTopBlock[];
}

interface KalshiAiJudgeBucket {
  n: number;
  wins: number;
  winRate: number | null;
  avgR: number | null;
  avgNetPct: number | null;
  netUsd: number;
}

interface KalshiAiJudge {
  enabled: boolean;
  judgedCloses: number;
  scoreboard: {
    approve: KalshiAiJudgeBucket;
    reject: KalshiAiJudgeBucket;
    unsure: KalshiAiJudgeBucket;
    noVerdict: KalshiAiJudgeBucket;
    judgedCloses: number;
  };
}

interface KalshiPerpWatchPlans {
  enabled: boolean;
  activePlans: number;
  created: number;
  triggered: number;
  expired: number;
  invalidated: number;
  structureBreaks: number;
  deepCalls: number;
  planSkips: number;
  fallbacks: number;
  entriesViaPlan: number;
}

interface KalshiShadowReport {
  days: number;
  summary: KalshiShadowSummary;
  byStrategy: KalshiShadowStrategyStat[];
  openPositions: KalshiShadowOpenPosition[];
  recentCloses: KalshiShadowRecentClose[];
  accountSim?: KalshiAccountSim;
  perpBrain?: KalshiPerpBrain;
  aiJudge?: KalshiAiJudge;
  aiWatchPlans?: KalshiPerpWatchPlans;
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

// Strategy-key labels live in kalshi-strategy-labels.ts (shared with the
// "Arm for live" section); re-exported here for existing imports.
import { strategyLabel } from "@/components/kalshi-strategy-labels";
export { strategyLabel };

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

// ── LIVE lane section ─────────────────────────────────────────────────────
// Reads /api/kalshi-stock-perp-live — the live lane's own records (armed
// strategies + promotion-bar status, reconciled live positions, unknown
// positions, today's live P&L, halt/pause state). Nothing here is derived
// from the shadow numbers above; if the live report is unavailable the
// section says so instead of guessing.
interface KalshiPerpLiveBar {
  met: boolean;
  trades: number;
  avgR: number | null;
  winRate: number | null;
  losingWeeks: string[];
  maxDrawdownPct: number;
  reasons: string[];
}

interface KalshiMarginCallDiagnostic {
  endpoint: string;
  ok: boolean;
  httpStatus: number | null;
  bodySnippet: string | null;
  errorMessage: string | null;
}

interface KalshiMarginSubaccountBreakdown {
  subaccount: number | null;
  subaccountType: string | null;
  accountEquityUsd: number;
  initialMarginUsd: number;
  maintenanceMarginUsd: number;
  restingOrdersMarginUsd: number;
  positionValueUsd: number;
  availableBalanceRawUsd: number;
  derivedFreeMarginUsd: number;
}

interface KalshiMarginBalanceBreakdown {
  settledFundsUsd: number | null;
  subaccounts: KalshiMarginSubaccountBreakdown[];
  sumSubaccountEquityUsd: number | null;
  equityUsd: number | null;
  availableUsd: number | null;
}

interface KalshiMarginDiagnostic {
  checkedAt: string;
  host: "prod" | "demo";
  enabled: KalshiMarginCallDiagnostic;
  enabledParsed: boolean | null;
  balance: KalshiMarginCallDiagnostic;
  balanceParsed: {
    cashUsd: number | null;
    positionValueUsd: number | null;
    equityUsd: number | null;
    maintenanceMarginUsd: number | null;
    availableUsd: number | null;
  } | null;
  balanceBreakdown: KalshiMarginBalanceBreakdown | null;
}

interface KalshiPerpLiveReport {
  enabled: boolean;
  host: "prod" | "demo";
  hasCredentials: boolean;
  marginEnabled: boolean | null;
  marginDiagnostic: KalshiMarginDiagnostic | null;
  paused: { active: boolean; reason: string | null; until: string | null };
  lastBlockReason: string | null;
  lastCycleAt: string | null;
  dayAnchorEquityUsd: number | null;
  todayRealizedPnlUsd: number;
  todayOrders: number;
  caps: { maxOpen: number; maxPerStrategy: number; maxOrdersPerDay: number; notionalUsd: number; dailyLossPct: number };
  strategies: Array<{ strategy: string; armed: boolean; bar: KalshiPerpLiveBar }>;
  openPositions: Array<{
    id: number; strategy: string; ticker: string; underlying: string; direction: string; status: string;
    contracts: number; entry_price: number | null; stop_loss: number; take_profit: number;
    opened_at: string | null; current_mark: number | null; unrealized_usd: number | null;
  }>;
  unknownPositions: Array<{ ticker: string; contracts: number; seenAt: string }>;
  recentCloses: Array<{
    id: number; strategy: string; ticker: string; underlying: string; direction: string;
    entry_price: number | null; exit_price: number | null; net_pnl_usd: number | null;
    return_pct: number | null; exit_reason: string | null; closed_at: string | null;
  }>;
}

/** One raw margin answer, compact: "→ 404 {body…}" or "→ no answer (error)". */
function fmtMarginCall(call: KalshiMarginCallDiagnostic): string {
  if (call.errorMessage) return `→ no answer (${call.errorMessage})`;
  return `→ ${call.httpStatus ?? "?"}${call.bodySnippet ? ` ${call.bodySnippet}` : ""}`;
}

/** Money for a figure that may be genuinely unknown: a dash, never $0.00 —
 *  an unreadable number must not dress up as a zero balance. */
function fmtMoneyOrDash(value: number | null): string {
  return value == null ? "—" : fmtMoney(value);
}

function KalshiPerpLiveSection() {
  const { data, isLoading, isError } = useQuery<KalshiPerpLiveReport>({
    queryKey: [`/api/kalshi-stock-perp-live`],
    refetchInterval: 60_000,
  });

  return (
    <div className="mt-3 rounded-lg border border-red-400/25 bg-red-500/[0.04] px-3 py-2.5" data-testid="kalshi-perp-live-section">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-[11px] font-bold text-gray-100">Kalshi Stock Perps — Live</h3>
        {data ? (
          <span className={`rounded-full px-1.5 py-px text-[8.5px] font-bold tracking-wide ${data.enabled ? "bg-red-500/20 text-red-200" : "bg-white/5 text-gray-400"}`}>
            {!data.enabled ? "KILL SWITCH OFF — NO NEW ENTRIES" : data.paused.active ? "AUTO-PAUSED" : "LIVE LANE RUNNING"}
          </span>
        ) : null}
        {data?.host === "demo" ? (
          <span className="rounded-full bg-amber-500/15 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-amber-300">DEMO ACCOUNT</span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-1 text-[10px] leading-snug text-gray-500">Reading the live lane…</p>
      ) : isError || !data ? (
        <p className="mt-1 text-[10px] leading-snug text-gray-500">Live lane status is unavailable right now. That says nothing about the account — check again shortly.</p>
      ) : (
        <>
          <p className="mt-1 text-[10px] leading-snug text-gray-400">
            Real orders on your Kalshi margin account — but only for a strategy you have <b>armed</b>, only after it clears the
            promotion bar on its shadow record (50+ trades, avg +0.2R or better, 40%+ wins, no losing week in the last two weeks, drawdown within 10%),
            and only while Kalshi reports margin enabled. Every cycle re-checks all three. Caps: {data.caps.maxOpen} open,{" "}
            {fmtMoney(data.caps.notionalUsd)} per trade, {data.caps.maxOrdersPerDay} orders a day, entries halt at −{data.caps.dailyLossPct}% on the day.
          </p>

          {!data.hasCredentials ? (
            <p className="mt-1.5 text-[10px] leading-snug text-amber-200/90">No Kalshi credentials are saved, so the live lane is idle. Exits and monitoring have nothing to run until a position exists.</p>
          ) : data.marginEnabled === false ? (
            <p className="mt-1.5 text-[10px] leading-snug text-amber-200/90">Kalshi margin is <b>not enabled</b> for this account, so no live perp orders can be placed. The lane checks again every cycle.</p>
          ) : data.marginEnabled === null ? (
            <p className="mt-1.5 text-[10px] leading-snug text-amber-200/90">Kalshi's margin check didn't answer just now — the lane treats that as <b>not enabled</b> and places nothing until it answers yes.</p>
          ) : null}

          {data.marginDiagnostic ? (
            <p className="mt-1.5 break-words text-[10px] leading-snug text-gray-500">
              Kalshi answered: /margin/enabled {fmtMarginCall(data.marginDiagnostic.enabled)}
              {data.marginDiagnostic.enabledParsed !== null ? ` (enabled: ${data.marginDiagnostic.enabledParsed ? "yes" : "no"})` : ""}
              {" · "}/margin/balance {fmtMarginCall(data.marginDiagnostic.balance)}
              {data.marginDiagnostic.balanceParsed?.equityUsd != null ? ` · equity ${fmtMoney(data.marginDiagnostic.balanceParsed.equityUsd)}` : ""}
              {" · "}checked {fmtDateTime(data.marginDiagnostic.checkedAt)}
            </p>
          ) : null}

          {data.marginDiagnostic?.balanceBreakdown ? (
            <div className="mt-1 space-y-0.5 text-[10px] leading-snug tabular-nums text-gray-500" data-testid="kalshi-margin-breakdown">
              {data.marginDiagnostic.balanceBreakdown.subaccounts.map((s, i) => (
                <p key={s.subaccount ?? `sub-${i}`}>
                  Sub #{s.subaccount ?? "?"} ({s.subaccountType ?? "type unknown"}): equity {fmtMoney(s.accountEquityUsd)}
                  {" · "}held {fmtMoney(s.initialMarginUsd + s.restingOrdersMarginUsd)} (initial {fmtMoney(s.initialMarginUsd)} + resting {fmtMoney(s.restingOrdersMarginUsd)})
                  {" · "}free {fmtMoney(s.derivedFreeMarginUsd)}
                </p>
              ))}
              <p>
                Settled {fmtMoneyOrDash(data.marginDiagnostic.balanceBreakdown.settledFundsUsd)}
                {" · "}Σ sub equity {fmtMoneyOrDash(data.marginDiagnostic.balanceBreakdown.sumSubaccountEquityUsd)}
                {" · "}equity {fmtMoneyOrDash(data.marginDiagnostic.balanceBreakdown.equityUsd)}
                {" · "}available {fmtMoneyOrDash(data.marginDiagnostic.balanceBreakdown.availableUsd)}
              </p>
            </div>
          ) : null}

          {data.paused.active ? (
            <p className="mt-1.5 text-[10px] leading-snug text-red-200">
              Auto-paused{data.paused.until ? ` until ${fmtDateTime(data.paused.until)}` : ""}: {data.paused.reason || "repeated Kalshi API errors"}. Open positions are still monitored and reconciled while paused.
            </p>
          ) : null}
          {!data.paused.active && data.lastBlockReason ? (
            <p className="mt-1.5 text-[10px] leading-snug text-gray-500">Why nothing opened lately: {data.lastBlockReason}</p>
          ) : null}

          <div className="mt-1.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
            <span>Today's live result <b className={pnlClass(data.todayRealizedPnlUsd)}>{fmtMoney(data.todayRealizedPnlUsd, { signed: true })}</b></span>
            <span>Live orders today: <b className="text-gray-200">{data.todayOrders}</b></span>
            <span>Open live positions: <b className="text-gray-200">{data.openPositions.length}</b></span>
          </div>

          {data.strategies.length ? (
            <>
              <SectionTitle detail="Arming is your tap; the bar is the shadow record's, re-checked every cycle">Strategies</SectionTitle>
              <div className="space-y-1">
                {data.strategies.map((s) => (
                  <div key={s.strategy} className="rounded-lg bg-black/20 px-2 py-1.5">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px]">
                      <span className="min-w-0 flex-1 break-words font-semibold text-gray-200">
                        {strategyLabel(s.strategy)} <span className="font-normal text-gray-600">{s.strategy}</span>
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-bold tracking-wide ${s.armed ? "bg-red-500/20 text-red-200" : "bg-white/5 text-gray-400"}`}>
                        {s.armed ? "ARMED" : "NOT ARMED"}
                      </span>
                      <span className={`shrink-0 rounded-full px-1.5 py-px text-[8.5px] font-bold tracking-wide ${s.bar.met ? "bg-emerald-500/15 text-emerald-300" : "bg-white/5 text-gray-400"}`}>
                        {s.bar.met ? "BAR MET" : "BAR NOT MET"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[10px] tabular-nums text-gray-400">
                      {s.bar.trades} shadow trades · avg {fmtR(s.bar.avgR)} · win rate {fmtWinRate(s.bar.winRate)} · worst dip {s.bar.maxDrawdownPct > 0 ? `−${s.bar.maxDrawdownPct.toFixed(1)}%` : "0%"}
                      {!s.bar.met && s.bar.reasons.length ? <span className="text-gray-500"> — missing: {s.bar.reasons.join("; ")}</span> : null}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {data.unknownPositions.length ? (
            <div className="mt-2 rounded-lg border border-amber-400/30 bg-amber-500/[0.07] px-2 py-1.5">
              <p className="text-[10px] font-semibold leading-snug text-amber-200">On Kalshi, but not opened by this lane — left completely alone:</p>
              {data.unknownPositions.map((p) => (
                <p key={p.ticker} className="mt-0.5 text-[10px] tabular-nums text-amber-100/80">
                  {p.ticker} · {p.contracts > 0 ? "long" : "short"} {fmtContracts(Math.abs(p.contracts))} contracts
                </p>
              ))}
            </div>
          ) : null}

          <SectionTitle detail="Reconciled against Kalshi every minute — what Kalshi shows is what's true">Live positions</SectionTitle>
          {data.openPositions.length ? (
            <div className="space-y-1">
              {data.openPositions.map((p) => (
                <div key={p.id} className="rounded-lg bg-black/20 px-2 py-1.5">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                    <span className="font-bold text-gray-100">{p.underlying}</span>
                    <span className="min-w-0 break-all text-gray-500">{p.ticker}</span>
                    <DirectionBadge direction={p.direction} />
                    <span className="min-w-0 break-words text-gray-400">{strategyLabel(p.strategy)}</span>
                    {p.status !== "open" ? <span className="shrink-0 rounded-full bg-amber-500/15 px-1.5 py-px text-[8.5px] font-bold tracking-wide text-amber-300">{p.status.replace(/_/g, " ").toUpperCase()}</span> : null}
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-x-2.5 gap-y-0.5 text-[10px] tabular-nums text-gray-400">
                    <span>{fmtContracts(p.contracts)} contracts</span>
                    <span>Entry {fmtPrice(p.entry_price)}</span>
                    <span>Stop {fmtPrice(p.stop_loss)}</span>
                    <span>Target {fmtPrice(p.take_profit)}</span>
                    {p.current_mark != null ? <span>Now {fmtPrice(p.current_mark)}</span> : null}
                    {p.unrealized_usd != null ? <span className={pnlClass(p.unrealized_usd)}>Unrealized {fmtMoney(p.unrealized_usd, { signed: true })}</span> : null}
                    <span>Opened {fmtDateTime(p.opened_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[10px] text-gray-500">No live perp positions open. A position appears here only after an armed, bar-proven strategy's shadow trade is mirrored into a real order.</p>
          )}

          {data.recentCloses.length ? (
            <>
              <SectionTitle detail="Real fills, real results — funding included when Kalshi reports it">Recent live closes</SectionTitle>
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
                      {c.net_pnl_usd != null ? <span className={pnlClass(c.net_pnl_usd)}>Net {fmtMoney(c.net_pnl_usd, { signed: true })}</span> : <span>Result unrecorded</span>}
                      {c.return_pct != null ? <span className={pnlClass(c.return_pct)}>{fmtPctPoints(c.return_pct)}</span> : null}
                      <span>Closed: {exitReasonLabel(c.exit_reason)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </>
      )}
    </div>
  );
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
          <p><b>What "net" means.</b> Every number here already has funding and trading costs taken out, so what you see is the result after the charges a real trade would have paid. Trading costs are Kalshi's published perp fees — 12 bps of the trade size when it opens and again when it closes — and funding comes from Kalshi's own daily funding prints, not a guess. If Kalshi's funding history is ever unreachable at the moment a trade closes, that one trade books the current funding estimate instead and is labeled <b>est.</b> below — it is never swapped in silently.</p>
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

          {summary.invalidExcludedCount ? (
            <p className="mt-1.5 text-[10px] leading-snug text-amber-200/90" data-testid="kalshi-shadow-invalid-note">
              {summary.invalidExcludedCount} closed trade{summary.invalidExcludedCount === 1 ? "" : "s"} in this window carried impossible values
              (a bad price print, not a real result) and {summary.invalidExcludedCount === 1 ? "was" : "were"} quarantined — excluded from every
              statistic above and from the $100 replay, and counted here so the exclusion is never silent.
            </p>
          ) : null}

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
                    {data.perpBrain.earningsEnabled ? (
                      <span>Earnings blackout skips: <b className="text-gray-200">{data.perpBrain.earningsSkipsInWindow ?? 0}</b></span>
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

          {data.aiJudge ? (
            <div className="mt-2 rounded-lg bg-black/20 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="text-[11px] font-bold text-gray-100">AI judge</h3>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                  {data.aiJudge.enabled ? "scoring every trade — never blocking" : "switched off"}
                </span>
              </div>
              {data.aiJudge.enabled ? (
                <>
                  <p className="mt-1 text-[10px] leading-snug text-gray-400">
                    An AI judge now scores every new shadow trade at entry — approve, reject, or unsure. It does <b className="text-gray-200">not</b> block or change any trade; its verdicts are graded against the real results here, so a future decision to let it gate entries can be made on evidence.
                  </p>
                  {data.aiJudge.judgedCloses > 0 ? (
                    <div className="mt-1.5 space-y-0.5">
                      {([
                        ["Approved", data.aiJudge.scoreboard.approve],
                        ["Rejected", data.aiJudge.scoreboard.reject],
                        ["Unsure", data.aiJudge.scoreboard.unsure],
                        ["No verdict (AI unavailable)", data.aiJudge.scoreboard.noVerdict],
                      ] as const).filter(([, b]) => b.n > 0).map(([label, b]) => (
                        <p key={label} className="text-[10px] leading-snug tabular-nums text-gray-400">
                          <span className="font-semibold text-gray-200">{label}</span>
                          {" · "}{b.n} trades · {b.wins} wins · Win rate {fmtWinRate(b.winRate)}
                          {" · "}Avg {fmtR(b.avgR)}
                          {" · "}<span className={pnlClass(b.netUsd)}>Net {fmtMoney(b.netUsd, { signed: true })}</span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-[10px] leading-snug text-gray-500">The judge is collecting evidence — no verdicts scored yet. Scores appear here as judged trades close.</p>
                  )}
                </>
              ) : (
                <p className="mt-1 text-[10px] leading-snug text-gray-500">The AI judge is off right now, so new trades are opening without a verdict. The lane's own brain still gates as usual.</p>
              )}
            </div>
          ) : null}

          {data.aiWatchPlans ? (
            <div className="mt-2 rounded-lg bg-black/20 px-3 py-2.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <h3 className="text-[11px] font-bold text-gray-100">AI watch plans</h3>
                <span className="text-[9px] font-bold uppercase tracking-wider text-gray-500">
                  {data.aiWatchPlans.enabled ? "entries now wait for an AI plan trigger" : "switched off"}
                </span>
              </div>
              {data.aiWatchPlans.enabled ? (
                <>
                  <p className="mt-1 text-[10px] leading-snug text-gray-400">
                    An AI study writes a watch plan for a ticker + strategy — the pattern it is waiting for and the exact candle that confirms it. Watching is free; a shadow entry now opens only when the strategy's own signal fires <b className="text-gray-200">and</b> its plan's trigger has formed. Signals without a triggered plan are skipped on purpose.
                  </p>
                  <p className="mt-1.5 text-[10px] leading-snug tabular-nums text-gray-400">
                    <span className="font-semibold text-gray-200">{data.aiWatchPlans.activePlans} plans live</span>
                    {" · "}{data.aiWatchPlans.entriesViaPlan} entries via plan today
                    {" · "}{data.aiWatchPlans.planSkips} signals skipped (no trigger)
                    {" · "}{data.aiWatchPlans.deepCalls} studies bought
                    {" · "}{data.aiWatchPlans.created} plans created
                    {" · "}{data.aiWatchPlans.triggered} triggered
                    {" · "}{data.aiWatchPlans.expired} expired
                    {" · "}{data.aiWatchPlans.invalidated} invalidated
                    {data.aiWatchPlans.fallbacks > 0 ? <>{" · "}{data.aiWatchPlans.fallbacks} plan failures fell back to mechanical entries</> : null}
                  </p>
                </>
              ) : (
                <p className="mt-1 text-[10px] leading-snug text-gray-500">Watch plans are off right now, so entries open on the mechanical signals alone, exactly as before. The lane's own brain and the AI judge still work as usual.</p>
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
                        {p.funding_estimate_usd ? <span className={pnlClass(p.funding_estimate_usd)}>Est. at next 4pm print {fmtMoney(p.funding_estimate_usd, { signed: true })}</span> : null}
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
                        <span className={pnlClass(c.funding_accrued_usd)}>Funding {fmtMoney(c.funding_accrued_usd, { signed: true })}{c.funding_model === 'estimate' ? ' (est.)' : ''}</span>
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

      <KalshiPerpArmingSection />

      <KalshiPerpLiveSection />

      <p className="mt-3 break-words text-[9px] leading-relaxed text-gray-600">
        The shadow results above are practice only — no orders are placed and no real money moves; net results already include modeled trading costs and the daily funding charge. The Live section is separate: it reports the live lane's own real orders and positions. Trades that spanned a stock split or similar corporate action are left out of every stat and list, because prices from before and after a split can't be compared honestly.
      </p>
    </section>
  );
}
