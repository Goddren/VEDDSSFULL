import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Sol FOLLOWER (copy-trade) SHADOW lane (2026-11-15): the user saves leader
// wallets; the lane watches their pump.fun trades and mirrors them virtually
// — buy opens a shadow mirror, sell closes the same fraction — building a
// per-wallet record (trades, win rate, net after costs, entry lag vs the
// leader). Shadow only: no wallet is touched and nothing here can order.

const pct = (n: any) => { const v = Number(n) || 0; return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`; };
const px = (n: any) => { const v = Number(n); if (!v) return "—"; return v >= 1 ? v.toFixed(4) : v.toPrecision(4); };
const shortAddr = (a: string) => (a && a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const reasonLabel: Record<string, string> = {
  leader_exit: "leader exited",
  tp: "take-profit backstop",
  sl: "stop-loss backstop",
  max_hold: "max hold (leader silent)",
};

export function SolFollowerPanel() {
  const { data } = useQuery<any>({ queryKey: ["/api/sol-follower"], refetchInterval: 30000 });
  const [wallet, setWallet] = useState("");
  const [label, setLabel] = useState("");
  const inval = () => queryClient.invalidateQueries({ queryKey: ["/api/sol-follower"] });
  const add = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/sol-follower/wallets", { wallet: wallet.trim(), label: label.trim() })).json(),
    onSuccess: () => { setWallet(""); setLabel(""); inval(); },
  });
  const remove = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/sol-follower/wallets/${id}`)).json(),
    onSuccess: inval,
  });

  const wallets: any[] = data?.wallets || [];
  const open: any[] = data?.open || [];
  const recent: any[] = data?.recentClosed || [];
  const enabled = data?.enabled !== false;

  return (
    <div className="rounded-2xl p-4 mb-6 space-y-3" style={{ background: "rgba(17,24,39,0.6)", border: "1.5px solid rgba(45,212,191,0.35)" }} data-testid="sol-follower-panel">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-100">👀 Wallet follower — copy-trade shadow test</h3>
          <p className="text-[11px] text-gray-400 max-w-xl">
            Follow specific traders' wallets. When a wallet you follow buys a pump.fun token, a virtual mirror opens
            ({data?.sizeSol ?? 0.25} SOL); when they sell, the mirror closes the same fraction. Every mirror is scored
            per wallet below — including how far behind the leader the mirror filled. Shadow only: no real trades.
          </p>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${enabled ? "bg-teal-500/15 text-teal-300" : "bg-gray-500/15 text-gray-400"}`}>
          {enabled ? "Shadow lane on" : "Lane off (SOL_FOLLOWER_SHADOW=off)"}
        </span>
      </div>

      {/* Add a wallet */}
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          placeholder="Leader wallet address (Solana)"
          className="flex-1 rounded-lg bg-black/30 border border-gray-700 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-500"
          data-testid="sol-follower-wallet-input"
        />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Label (optional)"
          className="sm:w-44 rounded-lg bg-black/30 border border-gray-700 px-3 py-2 text-xs text-gray-100 placeholder:text-gray-500"
          data-testid="sol-follower-label-input"
        />
        <button
          onClick={() => add.mutate()}
          disabled={add.isPending || !wallet.trim()}
          className="text-xs font-bold px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-60"
          data-testid="sol-follower-add"
        >
          {add.isPending ? "Adding…" : "Follow wallet"}
        </button>
      </div>
      {add.isError && <p className="text-[11px] text-red-400">{(add.error as Error)?.message}</p>}

      {/* Per-wallet scoreboard */}
      {wallets.length === 0 ? (
        <p className="text-[11px] text-gray-500">No wallets followed yet. Add a top trader's wallet address above and the lane starts watching it — history is never replayed; only trades after you follow count.</p>
      ) : (
        <div className="space-y-2">
          {wallets.map((w) => {
            const s = w.score || {};
            const vColor = s.verdict === "proven" ? "text-emerald-300" : s.verdict === "losing" ? "text-red-300" : s.verdict === "proving" ? "text-amber-300" : "text-gray-400";
            return (
              <div key={w.id} className="rounded-lg bg-black/30 px-3 py-2.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="text-xs font-bold text-gray-100">
                    {w.label || "Leader"} <span className="font-mono font-normal text-gray-400">{shortAddr(w.wallet)}</span>
                    {s.openCount > 0 && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-teal-500/15 text-teal-300">{s.openCount} mirror{s.openCount === 1 ? "" : "s"} open</span>}
                  </p>
                  <button
                    onClick={() => remove.mutate(w.id)}
                    disabled={remove.isPending}
                    className="text-[10px] font-semibold px-2 py-1 rounded border border-gray-600 text-gray-400 hover:text-white"
                    data-testid="sol-follower-remove"
                  >
                    Unfollow
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    ["Closed mirrors", `${s.trades ?? 0}`],
                    ["Win rate", s.trades ? `${Math.round(((s.wins ?? 0) / Math.max(1, s.trades)) * 100)}%` : "—"],
                    ["Avg net / mirror", s.trades ? pct(s.avgNetPct) : "—"],
                    ["Avg entry lag", s.avgEntryLagSec != null ? `${Number(s.avgEntryLagSec).toFixed(0)}s behind leader` : "—"],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded bg-black/30 px-2 py-1.5">
                      <p className="text-[9px] text-gray-500">{k}</p>
                      <p className="text-xs font-bold text-gray-100">{v}</p>
                    </div>
                  ))}
                </div>
                <p className={`text-[11px] ${vColor}`}>{s.verdictLine || "Learning — no closed mirrors yet."}</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Open mirrors */}
      {open.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-300 mb-1">Open mirrors</p>
          <div className="space-y-1">
            {open.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-[11px] rounded bg-black/30 px-2.5 py-1.5">
                <span className="text-gray-200 font-semibold">{p.symbol}</span>
                <span className="text-gray-400">leader {p.leader_label || shortAddr(p.leader_wallet)}</span>
                <span className="text-gray-400">@ ${px(p.entry_price)}</span>
                <span className="text-gray-500">{p.entry_lag_sec != null ? `${Number(p.entry_lag_sec).toFixed(0)}s lag` : ""}</span>
                <span className="text-gray-500">{Math.round(Number(p.remaining_fraction ?? 1) * 100)}% still in</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent closed mirrors */}
      {recent.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-300 mb-1">Recent closed mirrors</p>
          <div className="space-y-1">
            {recent.slice(0, 8).map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-2 text-[11px] rounded bg-black/30 px-2.5 py-1.5">
                <span className="text-gray-200 font-semibold">{p.symbol}</span>
                <span className="text-gray-400">{p.leader_label || shortAddr(p.leader_wallet)}</span>
                <span className="text-gray-500">{reasonLabel[p.close_reason] || p.close_reason}</span>
                <span className={Number(p.net_pct) >= 0 ? "text-emerald-300 font-semibold" : "text-red-300 font-semibold"}>{pct(p.net_pct)} net</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
