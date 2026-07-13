import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Activity, RefreshCw, Zap } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

export interface TlAccountPerf {
  connectionId: number;
  email: string;
  accountId: string;
  accountType: string;
  brokerName: string;
  isPropFirm: boolean;
  propFirmName: string | null;
  propFirmAccountSize: number | null;
  balance: number;
  equity: number;
  currency: string;
  isConnected: boolean;
  trades: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
}

export interface TradePerformance {
  overall: { trades: number; wins: number; losses: number; breakeven: number; winRate: number; totalPnl: number };
  bySource: {
    mt5: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
    tradelocker: { trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
  };
  tradelockerAccounts?: TlAccountPerf[];
  propFirm?: { accounts: TlAccountPerf[]; trades: number; wins: number; losses: number; winRate: number; totalPnl: number };
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
  const { data, isLoading, refetch } = useTradePerformance();
  const qc = useQueryClient();
  const syncMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/trade-sync/force').then(r => r.json()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['/api/trade-performance'] }); qc.invalidateQueries({ queryKey: ['/api/trade-review/today'] }); qc.invalidateQueries({ queryKey: ['/api/platform-monitors'] }); },
  });

  if (isLoading && !data) {
    return (
      <div className={`rounded-2xl p-4 bg-gray-900/40 border border-gray-800 ${className}`}>
        <p className="text-xs text-gray-500">Loading trade performance…</p>
      </div>
    );
  }
  const o = data?.overall;
  const hasData = (o?.trades ?? 0) > 0;

  const timeAgo = (iso: string) => {
    const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (diff < 60) return `${diff}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  };

  return (
    <div className={`rounded-2xl p-4 ${className}`} style={{ background: "rgba(16,185,129,0.06)", border: "1.5px solid rgba(16,185,129,0.25)" }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-bold text-emerald-300">Trade Performance</h3>
          <span className="text-[9px] text-gray-500">MT5 + TradeLocker · live</span>
        </div>
        <div className="flex items-center gap-2">
          {data?.streak.type && data.streak.count > 0 && (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${data.streak.type === "win" ? "bg-emerald-500/20 text-emerald-300" : "bg-red-500/20 text-red-300"}`}>
              {data.streak.count} {data.streak.type === "win" ? "win" : "loss"} streak
            </span>
          )}
          <button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            title="Force sync trades from TradeLocker"
            className="p-1 rounded text-gray-500 hover:text-emerald-400 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-3 h-3 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>
      {syncMutation.data && (
        <p className="text-[10px] text-emerald-400 mb-2">{syncMutation.data.message}</p>
      )}

      {!hasData ? (
        <p className="text-[11px] text-gray-500 py-2">
          No closed trades yet. Once your MT5 EA posts closed trades (or a TradeLocker position closes), your win rate and P&L appear here automatically.
        </p>
      ) : (
        <>
          {/* Today's P&L — prominent banner */}
          <div className="rounded-xl px-4 py-3 mb-3 flex items-center justify-between" style={{ background: "rgba(0,0,0,0.30)" }}>
            <div>
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Today's P&L</p>
              <p className="text-2xl font-black leading-none mt-0.5" style={{ color: pnlColor(data!.today.totalPnl) }}>
                {usd(data!.today.totalPnl)}
              </p>
              <p className="text-[9px] text-gray-500 mt-0.5">
                {data!.today.trades} trade{data!.today.trades !== 1 ? "s" : ""} · {data!.today.wins}W/{data!.today.losses}L
              </p>
            </div>
            {data!.today.totalPnl >= 0
              ? <TrendingUp className="w-8 h-8 text-emerald-400/40" />
              : <TrendingDown className="w-8 h-8 text-red-400/40" />}
          </div>

          {/* Overall stats grid: Total Trades · Win Rate · Total P&L · Win Streak */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 mb-3">
            <div className="bg-black/25 rounded-lg p-2 text-center">
              <p className="text-[8px] text-gray-500">Trades</p>
              <p className="text-base font-black text-gray-200">{o!.trades}</p>
            </div>
            <div className="bg-black/25 rounded-lg p-2 text-center">
              <p className="text-[8px] text-gray-500">Win Rate</p>
              <p className="text-base font-black" style={{ color: wrColor(o!.winRate) }}>{o!.winRate}%</p>
              <p className="text-[7px] text-gray-500">{o!.wins}W/{o!.losses}L</p>
            </div>
            <div className="bg-black/25 rounded-lg p-2 text-center">
              <p className="text-[8px] text-gray-500">Total P&L</p>
              <p className="text-base font-black" style={{ color: pnlColor(o!.totalPnl) }}>{usd(o!.totalPnl)}</p>
            </div>
            <div className="bg-black/25 rounded-lg p-2 text-center">
              <p className="text-[8px] text-gray-500">Streak</p>
              {data!.streak.type && data!.streak.count > 0 ? (
                <>
                  <p className="text-base font-black" style={{ color: data!.streak.type === "win" ? "#4ade80" : "#f87171" }}>
                    {data!.streak.count}
                  </p>
                  <p className="text-[7px]" style={{ color: data!.streak.type === "win" ? "#4ade80" : "#f87171" }}>
                    {data!.streak.type === "win" ? "wins" : "losses"}
                  </p>
                </>
              ) : (
                <p className="text-base font-black text-gray-600">—</p>
              )}
            </div>
          </div>

          {/* By Source breakdown — MT5 and TradeLocker rows */}
          <div className="mb-3">
            <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">By Source</p>
            <div className="space-y-1">
              {(["mt5", "tradelocker"] as const).map((src) => {
                const s = data!.bySource[src];
                const label = src === "mt5" ? "MT5" : "TradeLocker";
                return (
                  <div key={src} className="flex items-center justify-between bg-black/20 rounded-lg px-2.5 py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${src === "mt5" ? "bg-indigo-500/20 text-indigo-300" : "bg-cyan-500/20 text-cyan-300"}`}>{label}</span>
                      <span className="text-[9px] text-gray-500">{s.trades} trades · {s.wins}W/{s.losses}L</span>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="text-[10px] font-bold" style={{ color: wrColor(s.winRate) }}>{s.trades > 0 ? `${s.winRate}%` : "—"}</span>
                      <span className="text-[10px] font-bold" style={{ color: pnlColor(s.totalPnl) }}>{usd(s.totalPnl)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TradeLocker accounts — tied to prop firm accounts, live balance + per-account P&L */}
          {(data!.tradelockerAccounts?.length ?? 0) > 0 && (
            <div className="mb-3">
              <div className="flex items-start gap-1.5 mb-1.5 px-2 py-1.5 rounded-lg" style={{ background: 'rgba(6,182,212,.08)', border: '1px solid rgba(6,182,212,.2)' }}>
                <Zap className="w-3 h-3 text-cyan-400 flex-shrink-0 mt-0.5" />
                <p className="text-[9px] text-cyan-200/80 leading-relaxed">
                  Every trade on these accounts is now detected and logged automatically — no manual entry needed. Look for the <span className="font-semibold text-cyan-300">Auto-Synced</span> tag below.
                </p>
              </div>
              <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">TradeLocker Accounts {(data!.propFirm?.accounts.length ?? 0) > 0 ? "· Prop Firm" : ""}</p>
              <div className="space-y-1.5">
                {data!.tradelockerAccounts!.map((a) => (
                  <div key={a.connectionId} className="bg-black/25 rounded-lg px-2.5 py-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: a.isConnected ? "#34d399" : "#6b7280" }} />
                        <span className="text-[10px] font-bold text-cyan-300 truncate">{a.brokerName}</span>
                        {a.isPropFirm && (
                          <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 flex-shrink-0">
                            {a.propFirmName || "PROP FIRM"}
                          </span>
                        )}
                        <span className="text-[8px] px-1 rounded bg-gray-800/60 text-gray-500 flex-shrink-0">{a.accountType}</span>
                      </div>
                      <span className="text-[10px] font-black text-gray-100 flex-shrink-0">
                        ${(a.balance || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        {a.propFirmAccountSize ? <span className="text-[8px] text-gray-500"> / ${(a.propFirmAccountSize).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span> : null}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-gray-500">{a.trades} trades · {a.wins}W/{a.losses}L</span>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold" style={{ color: wrColor(a.winRate) }}>{a.trades > 0 ? `${a.winRate}%` : "—"}</span>
                        <span className="text-[10px] font-bold" style={{ color: pnlColor(a.totalPnl) }}>{usd(a.totalPnl)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Last 5 recent trades mini-list */}
          {data!.recentTrades.length > 0 && (
            <div>
              <p className="text-[9px] text-gray-500 mb-1 uppercase tracking-wide">Last {Math.min(5, data!.recentTrades.length)} Trades</p>
              <div className="space-y-0.5">
                {data!.recentTrades.slice(0, 5).map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-[10px] px-2 py-1 rounded bg-black/20">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      {t.direction === "BUY"
                        ? <TrendingUp className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                        : <TrendingDown className="w-3 h-3 text-red-400 flex-shrink-0" />}
                      <span className="font-mono font-semibold text-gray-200 truncate">{t.symbol}</span>
                      <span className={`text-[8px] px-1 py-0.5 rounded font-semibold flex-shrink-0 ${
                        t.result === "WIN" ? "bg-emerald-500/20 text-emerald-400"
                        : t.result === "LOSS" ? "bg-red-500/20 text-red-400"
                        : "bg-gray-700/50 text-gray-400"
                      }`}>{t.result}</span>
                      <span className={`text-[8px] px-1 rounded flex-shrink-0 ${t.source === 'tradelocker_auto' || t.source === 'mt5_copier' ? 'bg-cyan-900/40 text-cyan-400' : 'bg-gray-800/60 text-gray-500'}`}>
                        {t.source === 'tradelocker_auto' ? 'Auto-Synced' : t.source === 'mt5_copier' ? 'Auto (MT5)' : t.source}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-1">
                      <span className="font-bold" style={{ color: pnlColor(t.profitLoss) }}>{usd(t.profitLoss)}</span>
                      <span className="text-[8px] text-gray-600">{timeAgo(t.closedAt)}</span>
                    </div>
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

/** AI provider health strip — shows which provider served the last AI call. */
export function AiHealthStrip({ className = "" }: { className?: string }) {
  const { data } = useQuery<{ ok: boolean | null; provider?: string; model?: string; failedOver?: boolean; attempts?: string[]; lastError?: string | null; lastCallAt?: string; message?: string }>({
    queryKey: ["/api/ai-health"],
    refetchInterval: 15000,
  });
  if (!data) return null;
  const label = (p?: string) => (p === "openai" || p === "openai-platform") ? "OpenAI" : p === "anthropic" ? "Claude" : p === "groq" ? "Groq" : p === "google" ? "Gemini" : p === "mistral" ? "Mistral" : (p || "—");
  const idle = data.ok === null;
  const color = idle ? "#9ca3af" : data.ok ? (data.failedOver ? "#fbbf24" : "#34d399") : "#f87171";
  const text = idle
    ? "AI idle — no calls yet"
    : data.ok
      ? (data.failedOver ? `AI: failed over → ${label(data.provider)} (${data.model || ""})` : `AI: ${label(data.provider)} (${data.model || ""})`)
      : `AI error: ${(data.lastError || "").slice(0, 70)}`;
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] ${className}`} style={{ background: "rgba(255,255,255,0.03)", border: `1px solid ${color}44` }}>
      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color, boxShadow: `0 0 6px ${color}` }} />
      <span className="text-gray-300 truncate">{text}</span>
      {data.attempts && data.attempts.length > 1 && (
        <span className="text-gray-600 ml-auto flex-shrink-0">tried: {data.attempts.map(label).join(" → ")}</span>
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
