import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

// Crypto paper trading (DeFi / Base). The full engine runs and records every
// entry it would make as a paper trade — no wallet, no gas — and the crypto
// brain learns from the results. Fastest start: connect MetaMask (read-only,
// further down this page) → "Start paper trading" sizes the paper account
// from the wallet's balance.

const fmt$ = (n: number) => `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function CryptoPaperCard() {
  const { data } = useQuery<any>({ queryKey: ["/api/crypto-paper"], refetchInterval: 60000 });
  const { data: wallets } = useQuery<any>({
    queryKey: ["/api/defi/balances"],
    queryFn: async () => (await apiRequest("GET", "/api/defi/balances")).json(),
    retry: false,
  });
  const [bal, setBal] = useState<string>("");
  const save = useMutation({
    mutationFn: async (body: any) => (await apiRequest("POST", "/api/crypto-paper/settings", body)).json(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crypto-paper"] });
      queryClient.invalidateQueries({ queryKey: ["/api/cryptocom-engine/config"] });
    },
  });

  const s = data?.settings || { enabled: false, startBalance: 1000 };
  const st = data?.stats || { trades: 0, wins: 0, winRate: 0, avgR: 0, pnlUsd: 0 };
  const rd = data?.readiness || { ready: false, progressTrades: 0, bar: { trades: 50, avgR: 0.2, winRate: 0.4 } };
  const w0 = wallets?.wallets?.[0];
  const walletUsd = Number(wallets?.totalUsd) || 0;
  const start = (startBalance: number) =>
    save.mutate({ enabled: true, startBalance, walletAddress: w0?.address });

  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(17,24,39,0.6)", border: "1.5px solid rgba(56,189,248,0.35)" }} data-testid="crypto-paper-card">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="text-sm font-bold text-gray-100">📝 Paper trading — DeFi on Base</h3>
          <p className="text-[11px] text-gray-400">The full engine runs and every trade it would make is recorded at live prices. No wallet, no gas, no real money. The brain learns from every result.</p>
        </div>
        {s.enabled ? (
          <button onClick={() => save.mutate({ enabled: false })} disabled={save.isPending} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-600 text-gray-300 hover:text-white">Pause paper trading</button>
        ) : null}
      </div>

      {!s.enabled ? (
        <div className="space-y-2">
          <p className="text-xs text-gray-300">
            <span className="font-semibold">Fastest start:</span> connect your MetaMask below (read-only — the app never asks for your keys), then start paper trading. It sizes the paper account from your wallet balance.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {walletUsd > 0 && (
              <button onClick={() => start(Math.round(walletUsd))} disabled={save.isPending} className="text-sm font-bold px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-60" data-testid="paper-start-wallet">
                Start paper trading with {fmt$(walletUsd)} (my wallet)
              </button>
            )}
            <input value={bal} onChange={(e) => setBal(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="1000" className="w-24 text-sm rounded-md bg-black/40 border border-gray-700 px-2 py-1 text-gray-100" aria-label="Paper starting balance (USD)" />
            <button onClick={() => start(Number(bal) || 1000)} disabled={save.isPending} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-sky-500 text-sky-300 hover:text-sky-200 disabled:opacity-60" data-testid="paper-start-manual">
              Start with {fmt$(Number(bal) || 1000)}
            </button>
          </div>
          {save.isError && <p className="text-[11px] text-red-400">{(save.error as Error)?.message}</p>}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              ["Paper balance", fmt$(Number(data?.balance ?? s.startBalance))],
              ["Trades", `${st.trades} (${(data?.open || []).length} open)`],
              ["Win rate", st.trades ? `${Math.round(st.winRate * 100)}%` : "—"],
              ["Avg per trade", st.trades ? `${st.avgR >= 0 ? "+" : ""}${Number(st.avgR).toFixed(2)}R` : "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-lg bg-black/30 px-2.5 py-2">
                <p className="text-[10px] text-gray-500">{k}</p>
                <p className="text-sm font-bold text-gray-100">{v}</p>
              </div>
            ))}
          </div>
          <div>
            <div className="flex justify-between text-[10px] text-gray-400 mb-1">
              <span>Ready for live? {rd.ready ? "✅ Yes — the record clears the bar" : `needs ${rd.bar.trades}+ trades, ${Math.round(rd.bar.winRate * 100)}%+ wins, +${rd.bar.avgR}R avg, no losing week`}</span>
              <span>{Math.min(st.trades, rd.bar.trades)}/{rd.bar.trades}</span>
            </div>
            <div className="h-1.5 rounded bg-gray-800 overflow-hidden"><div className="h-full bg-sky-500" style={{ width: `${Math.round((rd.progressTrades || 0) * 100)}%` }} /></div>
          </div>
          {(data?.recent || []).length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
              {data.recent.slice(0, 10).map((t: any) => (
                <div key={t.id} className="flex items-center justify-between text-[11px] rounded bg-black/20 px-2 py-1">
                  <span className="text-gray-300 font-semibold">{t.symbol} <span className="text-gray-500 font-normal">{t.exit_reason}</span></span>
                  <span className={Number(t.pnl_usd) >= 0 ? "text-emerald-400" : "text-red-400"}>{Number(t.r_multiple) >= 0 ? "+" : ""}{Number(t.r_multiple).toFixed(2)}R · {fmt$(Number(t.pnl_usd))}</span>
                </div>
              ))}
            </div>
          )}
          {rd.ready && (
            <p className="text-[11px] text-emerald-300">To go live: fund the engine's trading wallet from your MetaMask (you approve the transfer in MetaMask), then switch on DeFi auto-trade. Start small.</p>
          )}
        </>
      )}
    </div>
  );
}
