import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Activity } from "lucide-react";

export interface TradePerformance {
  overall: { trades: number; wins: number; losses: number; breakeven: number; winRate: number; totalPnl: number };
  bySource: {
    mt5: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
    tradelocker: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
  };
  today: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
  streak: { type: "win" | "loss" | null; count: number };
  recentTrades: Array<{ symbol: string; direction: string; result: string; profitLoss: number; source: string; closedAt: string }>;
  lastTradeAt: string | null;
  generatedAt: string;
}

export function useTradePerformance(enabled = true) {
  return useQuery<TradePerformance>({
    queryKey: ["/api/trade-performance"],
    refetchInterval: 15000,
    enabled,
  });
}

interface TodayReview {
  hasData: boolean;
  message?: string;
  summary?: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number; stoppedOut: number };
  reasons?: string[];
  worstPairs?: Array<{ key: string; pnl: number; w: number; l: number; n: number }>;
}

export function useTodayReview(enabled = true) {
  return useQuery<TodayReview>({
    queryKey: ["/api/trade-review/today"],
    refetchInterval: 30000,
    enabled,
  });
}

const usd = (n: number) => `${n >= 0 ? "+" : ""}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pnlColor = (n: number) => (n > 0 ? "#4ade80" : n < 0 ? "#f87171" : "#9ca3af");
const wrColor = (wr: number) => (wr >= 55 ? "#34d399" : wr >= 45 ? "#fbbf24" : "#f87171");

/** Full card — for the dashboard and weekly-strategy page. */
export function TradePerformanceCard({ className = "" }: { className?: string }) {
  const { data, isLoading } = useTradePerformance();

  if (isLoading && !data) {
    return (
      <div className={`rounded-2xl p-4 bg-gray-900/40 border border-gray-800 ${className}`}>
        <p className="text-xs text-gray-500">Loading trade performance…</p>
      </div>
    );
  }
  const o = data?.overall;
  const hasData = (o?.trades ?? 0) > 0;

  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(16,185,129,0.06)", border: "1.5px solid rgba(16,185,129,0.25)" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-emerald-300">Trade Performance</h3>
          <span className="text-[9px] text-gray-500">MT5 + TradeLocker · live</span>
        </div>
        {data?.streak.type && data.streak.count > 0 && (
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.streak.type === "win" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
            {data.streak.count} {data.streak.type === "win" ? "win" : "loss"} streak
          </span>
        )}
      </div>

      {!hasData ? (
        <p className="text-[11px] text-gray-500 py-2">
          No closed trades yet. Once your MT5 EA posts closed trades (or a TradeLocker position closes), your win rate and P&L appear here automatically.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="bg-black/25 rounded-lg p-2 text-center">
              <p className="text-[9px] text-gray-500">Win Rate</p>
              <p className="text-lg font-black" style={{ color: wrColor(o!.winRate) }}>{o!.winRate}%</p>
              <p className="text-[8px] text-gray-500">{o!.wins}W / {o!.losses}L</p>
            </div>
            <div className="bg-black/25 rounded-lg p-2 text-center">
              <p className="text-[9px] text-gray-500">Total P&L</p>
              <p className="text-lg font-black" style={{ color: pnlColor(o!.totalPnl) }}>{usd(o!.totalPnl)}</p>
              <p className="text-[8px] text-gray-500">{o!.trades} trades</p>
            </div>
            <div className="bg-black/25 rounded-lg p-2 text-center">
              <p className="text-[9px] text-gray-500">Today</p>
              <p className="text-lg font-black" style={{ color: pnlColor(data!.today.totalPnl) }}>{usd(data!.today.totalPnl)}</p>
              <p className="text-[8px] text-gray-500">{data!.today.trades} trades</p>
            </div>
          </div>

          {/* Per-source split */}
          <div className="flex gap-2 mb-3">
            {(["mt5", "tradelocker"] as const).map((src) => {
              const s = data!.bySource[src];
              const label = src === "mt5" ? "MT5" : "TradeLocker";
              return (
                <div key={src} className="flex-1 bg-black/20 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-semibold text-gray-300">{label}</span>
                    <span className="text-[10px] font-bold" style={{ color: wrColor(s.winRate) }}>{s.trades > 0 ? `${s.winRate}%` : "—"}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="text-[8px] text-gray-500">{s.wins}W/{s.losses}L</span>
                    <span className="text-[9px] font-bold" style={{ color: pnlColor(s.totalPnl) }}>{usd(s.totalPnl)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Recent trades */}
          {data!.recentTrades.length > 0 && (
            <div>
              <p className="text-[9px] text-gray-500 mb-1">Recent closes</p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {data!.recentTrades.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-black/20">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {t.result === "WIN" ? <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" /> : t.result === "LOSS" ? <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" /> : <Activity className="w-3 h-3 text-gray-500 flex-shrink-0" />}
                      <span className="font-mono font-semibold text-gray-200 truncate">{t.symbol}</span>
                      <span className="text-[8px] text-gray-500">{t.direction}</span>
                      <span className="text-[8px] px-1 rounded bg-gray-700/50 text-gray-400">{t.source}</span>
                    </div>
                    <span className="font-bold flex-shrink-0" style={{ color: pnlColor(t.profitLoss) }}>{usd(t.profitLoss)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Today's Review — the "why was today good/bad" breakdown. */
export function TodayReviewPanel({ className = "" }: { className?: string }) {
  const { data } = useTodayReview();
  if (!data) return null;
  if (!data.hasData) {
    return (
      <div className={`rounded-2xl p-3 bg-gray-900/40 border border-gray-800 ${className}`}>
        <p className="text-[11px] text-gray-500">{data.message}</p>
      </div>
    );
  }
  const s = data.summary!;
  const bad = s.totalPnl < 0;
  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: bad ? "rgba(239,68,68,0.06)" : "rgba(16,185,129,0.06)", border: `1.5px solid ${bad ? "rgba(239,68,68,0.25)" : "rgba(16,185,129,0.25)"}` }}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-bold" style={{ color: bad ? "#fca5a5" : "#86efac" }}>
          Today's Review {bad ? "— rough day" : "— solid day"}
        </h3>
        <span className="text-xs font-black" style={{ color: bad ? "#f87171" : "#4ade80" }}>
          {s.totalPnl >= 0 ? "+" : ""}${Math.abs(s.totalPnl).toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      </div>
      <ul className="space-y-1">
        {data.reasons!.map((r, i) => (
          <li key={i} className="text-[11px] text-gray-300 flex items-start gap-1.5">
            <span className="text-gray-600 mt-0.5">•</span><span>{r}</span>
          </li>
        ))}
      </ul>
      {(data.worstPairs?.length ?? 0) > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-800/60">
          <p className="text-[9px] text-gray-500 mb-1">Biggest drains today</p>
          <div className="flex flex-wrap gap-1.5">
            {data.worstPairs!.map((p) => (
              <span key={p.key} className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25">
                {p.key} ${p.pnl.toFixed(2)} ({p.w}W/{p.l}L)
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Compact one-liner — for the side-nav pop-out. */
export function TradePerformanceCompact() {
  const { data } = useTradePerformance();
  const o = data?.overall;
  if (!o || o.trades === 0) return null;
  return (
    <div className="w-full text-left px-4 py-3 rounded-2xl mb-2" style={{ background: "rgba(16,185,129,0.10)", border: "1.5px solid rgba(16,185,129,0.28)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Activity className="w-3.5 h-3.5 text-emerald-400" />
          <span className="text-xs font-bold text-emerald-300">Performance</span>
        </div>
        {data?.streak.type && data.streak.count > 0 && (
          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${data.streak.type === "win" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
            {data.streak.count} {data.streak.type} streak
          </span>
        )}
      </div>
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[10px] text-gray-500">Win Rate</p>
          <p className="text-sm font-bold" style={{ color: wrColor(o.winRate) }}>{o.winRate}% <span className="text-[9px] text-gray-500">{o.wins}W/{o.losses}L</span></p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-gray-500">Total P&L</p>
          <p className="text-sm font-bold" style={{ color: pnlColor(o.totalPnl) }}>{usd(o.totalPnl)}</p>
        </div>
      </div>
    </div>
  );
}
