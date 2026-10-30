import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Sol paper mode (2026-10-30): the Sol engine runs its strategies and records
// every buy it would make as a paper position (no wallet, live stays off).
// Positions persist across redeploys and the sol-brain learns from each close.

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
const px = (n: any) => { const v = Number(n); return v >= 1 ? v.toFixed(4) : v.toPrecision(4); };

export function SolPaperCard() {
  const { data } = useQuery<any>({ queryKey: ["/api/sol-paper"], refetchInterval: 60000 });
  const inval = () => { queryClient.invalidateQueries({ queryKey: ["/api/sol-paper"] }); queryClient.invalidateQueries({ queryKey: ["/api/sol-engine/status"] }); };
  const start = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/sol-paper/start", {})).json(), onSuccess: inval });
  const pause = useMutation({ mutationFn: async () => (await apiRequest("POST", "/api/sol-paper/pause", {})).json(), onSuccess: inval });

  const on = !!data?.enabled;
  const st = data?.stats || { trades: 0, winRate: 0, avgPct: 0, pnlSol: 0 };
  const rd = data?.readiness || { ready: false, progressTrades: 0, bar: { trades: 50, winRate: 0.4 } };

  return (
    <div className="rounded-2xl p-4 mb-6 space-y-3" style={{ background: "rgba(17,24,39,0.6)", border: "1.5px solid rgba(168,85,247,0.35)" }} data-testid="sol-paper-card">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-100">📝 Sol paper trading</h3>
          <p className="text-[11px] text-gray-400">The Sol engine runs its strategies and records every buy it would make as a paper trade. No wallet is touched and live trading stays off. The Sol brain learns from every result.</p>
        </div>
        {on ? (
          <div className="flex items-center gap-2">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${data?.running ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{data?.running ? "Running" : "Paper on — engine starting"}</span>
            <button onClick={() => pause.mutate()} disabled={pause.isPending} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:text-white">Pause</button>
          </div>
        ) : (
          <button onClick={() => start.mutate()} disabled={start.isPending} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white disabled:opacity-60" data-testid="sol-paper-start">
            {start.isPending ? "Starting…" : "Start Sol paper trading"}
          </button>
        )}
      </div>
      {start.isError && <p className="text-[11px] text-red-400">{(start.error as Error)?.message}</p>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Paper trades", `${st.trades} (${(data?.open || []).length} open)`],
          ["Win rate", st.trades ? `${Math.round(st.winRate * 100)}%` : "—"],
          ["Avg per trade", st.trades ? pct(Number(st.avgPct)) : "—"],
          ["Paper P&L", st.trades ? `${Number(st.pnlSol) >= 0 ? "+" : ""}${Number(st.pnlSol).toFixed(3)} SOL` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg bg-black/30 px-2.5 py-2">
            <p className="text-[10px] text-gray-500">{k}</p>
            <p className="text-sm font-bold text-gray-100">{v}</p>
          </div>
        ))}
      </div>
      <div>
        <div className="flex justify-between text-[10px] text-gray-400 mb-1">
          <span>Ready for live? {rd.ready ? "✅ Yes — the record clears the bar" : `needs ${rd.bar.trades}+ trades, ${Math.round(rd.bar.winRate * 100)}%+ wins, positive average, no losing week`}</span>
          <span>{Math.min(st.trades, rd.bar.trades)}/{rd.bar.trades}</span>
        </div>
        <div className="h-1.5 rounded bg-gray-800 overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${Math.round((rd.progressTrades || 0) * 100)}%` }} /></div>
      </div>

      {(data?.open || []).length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Open paper trades</p>
          {data.open.map((t: any) => {
            const chg = Number(t.entry_price) > 0 && Number(t.current_price) > 0 ? ((Number(t.current_price) - Number(t.entry_price)) / Number(t.entry_price)) * 100 : null;
            return (
              <div key={t.position_id} className="text-[11px] rounded bg-purple-500/[0.08] border border-purple-500/20 px-2 py-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-gray-100 font-semibold">{t.symbol} <span className="text-gray-400 font-normal">{t.strategy_id}</span></span>
                  <span className={chg == null ? "text-gray-400" : chg >= 0 ? "text-emerald-300" : "text-rose-300"}>{chg == null ? "—" : pct(chg)}</span>
                </div>
                <div className="text-gray-400 mt-0.5">{Number(t.size).toFixed(3)} SOL · entry {px(t.entry_price)} · TP +{Number(t.target_pct)}% · SL -{Number(t.sl_pct)}%</div>
              </div>
            );
          })}
        </div>
      )}
      {(data?.recent || []).length > 0 && (
        <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Recent results</p>
          {data.recent.slice(0, 10).map((t: any) => (
            <div key={t.position_id} className="flex items-center justify-between text-[11px] rounded bg-black/20 px-2 py-1">
              <span className="text-gray-300 font-semibold">{t.symbol} <span className="text-gray-500 font-normal">{t.strategy_id}</span></span>
              <span className={Number(t.close_pnl_pct) >= 0 ? "text-emerald-400" : "text-red-400"}>{pct(Number(t.close_pnl_pct))}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
