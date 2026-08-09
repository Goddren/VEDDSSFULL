import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Brain, Loader2, RefreshCw, TrendingUp, Sparkles, Store } from "lucide-react";
import { Link } from "wouter";

interface Bucket { trades: number; wins: number; winRate: number; }
interface CoinKnowledge {
  totalTrades: number; wins: number; losses: number; winRate: number;
  totalPnl: number; avgWin: number; avgLoss: number; riskReward: number;
  byStrikeType: Record<string, Bucket>; byConfidenceBand: Record<string, Bucket>;
  byEdgeBand: Record<string, Bucket>; byHour: Record<string, Bucket>;
  bestStrikeType: string | null; recommendedSizeMultiplier: number; valueScoreWeight: number;
}
interface KalshiBrain {
  lastLearned: string; totalTrades: number; overallWinRate: number; totalPnl: number;
  coinKnowledge: Record<string, CoinKnowledge>; insights: string[];
}

const wrCls = (wr: number) => (wr >= 60 ? "#10b981" : wr >= 45 ? "#f59e0b" : "#ef4444");
const fmtUsd = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(n).toFixed(2)}`;

function ToggleRow({ label, desc, on, onToggle, pending, disabled }: {
  label: string; desc: string; on: boolean; onToggle: () => void; pending?: boolean; disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-white/80">{label}</div>
        <div className="text-[11px] text-white/45">{desc}</div>
      </div>
      <button onClick={onToggle} disabled={pending || disabled}
        className="shrink-0 rounded-full px-3 py-1 text-xs font-bold transition disabled:opacity-40"
        style={{
          background: on ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)",
          color: on ? "#10b981" : "#9ca3af",
          border: `1px solid ${on ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.12)"}`,
        }}>
        {on ? "ON" : "OFF"}
      </button>
    </div>
  );
}

function Bars({ title, data }: { title: string; data: Record<string, Bucket> }) {
  const entries = Object.entries(data).filter(([, b]) => b.trades > 0).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
  if (!entries.length) return null;
  return (
    <div className="mt-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40 mb-1.5">{title}</div>
      <div className="flex flex-col gap-1">
        {entries.map(([k, b]) => (
          <div key={k} className="flex items-center gap-2 text-[11px]">
            <span className="w-14 shrink-0 font-mono text-white/50">{k}</span>
            <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${b.winRate}%`, background: wrCls(b.winRate) }} />
            </div>
            <span className="w-16 shrink-0 text-right font-mono" style={{ color: wrCls(b.winRate) }}>{b.winRate}% · {b.trades}t</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function KalshiBrainPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [sellOpen, setSellOpen] = useState(false);
  const [title, setTitle] = useState("Kalshi BTC Brain");
  const [price, setPrice] = useState<number | "">("");

  const { data: brain, isLoading, isError } = useQuery<KalshiBrain>({
    queryKey: ["/api/kalshi/brain"],
    enabled: !!user,
  });

  // Listing eligibility + suggested price (only fetched when the sell panel opens)
  const { data: preview } = useQuery<any>({
    queryKey: ["/api/brain-marketplace/my-listings/preview?sourceCategory=kalshi"],
    enabled: !!user && sellOpen,
  });

  const listMut = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/brain-marketplace/list", {
      title: title.trim() || "Kalshi Brain",
      sourceCategory: "kalshi",
      priceVedd: price === "" ? undefined : Number(price),
    })).json(),
    onSuccess: () => { toast({ title: "Brain listed", description: "Your Kalshi brain is live on the marketplace." }); setSellOpen(false); },
    onError: (e: any) => toast({ title: "Couldn't list", description: e?.message, variant: "destructive" }),
  });

  const relearn = useMutation({
    mutationFn: async () => (await apiRequest("POST", "/api/kalshi/brain/backfill")).json(),
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/kalshi/brain"] });
      toast({ title: "Brain relearned", description: `${d.totalTrades} trades · ${d.overallWinRate}% win rate across ${d.coins?.length ?? 0} coin(s).` });
    },
    onError: (e: any) => toast({ title: "Relearn failed", description: e?.message, variant: "destructive" }),
  });

  // Live engine config — read/toggle the brain's influence + gating.
  const { data: engine } = useQuery<any>({ queryKey: ["/api/kalshi/engine/status"], enabled: !!user });
  const cfg = engine?.config ?? {};
  const setCfg = useMutation({
    mutationFn: async (patch: any) => (await apiRequest("PUT", "/api/kalshi/engine/config", patch)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }),
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  const coins = brain ? Object.entries(brain.coinKnowledge) : [];

  return (
    <div className="app-page min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <Brain className="h-7 w-7 text-amber-400" /> Kalshi Brain
            </h1>
            <p className="mt-1 text-sm text-white/50">
              What your bot has learned from every trade — win or loss. It reweights value scoring and sizing toward what actually wins for you.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button onClick={() => relearn.mutate()} disabled={relearn.isPending}
              className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-500/20 disabled:opacity-50">
              {relearn.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Relearn from trades
            </button>
            <button onClick={() => setSellOpen(o => !o)}
              className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-500/20">
              <Store className="h-4 w-4" /> Sell this brain
            </button>
          </div>
        </div>

        {/* One-click sell */}
        {sellOpen && (
          <div className="smart-card mb-5 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-300"><Store className="h-4 w-4" /> List your Kalshi brain</div>
            {preview && preview.eligible === false ? (
              <p className="text-sm text-amber-300">
                Not eligible yet — you have {preview.tradeCount} trade(s); need at least {preview.minTradesRequired}. Let the bot trade more (or hit Relearn to backfill history).
              </p>
            ) : (
              <>
                <p className="mb-3 text-[13px] text-white/55">
                  Buyers get a snapshot of your trade outcomes merged into their own brain (they can't resell it). Sells for VEDD credits.
                  {preview?.suggestedPriceVedd != null && <> Suggested price: <b className="text-emerald-300">{preview.suggestedPriceVedd} VEDD</b> · {preview.tradeCount} trades · {preview.winRate != null ? `${Math.round(preview.winRate * 100)}% win rate` : "win rate pending"}.</>}
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/45">Listing title</span>
                    <input value={title} onChange={e => setTitle(e.target.value)}
                      className="w-56 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 text-sm text-white/80 outline-none focus:border-emerald-500/40" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-[11px] text-white/45">Price (VEDD, blank = suggested)</span>
                    <input type="number" value={price} placeholder={preview?.suggestedPriceVedd ?? "—"}
                      onChange={e => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                      className="w-44 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1.5 font-mono text-sm text-white/80 outline-none focus:border-emerald-500/40" />
                  </label>
                  <button onClick={() => listMut.mutate()} disabled={listMut.isPending || preview?.eligible === false}
                    className="flex items-center gap-2 rounded-lg bg-emerald-500/90 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                    {listMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Store className="h-4 w-4" />}
                    List on marketplace
                  </button>
                  <Link href="/brain-data-marketplace"><button className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/60 hover:text-white">View marketplace</button></Link>
                </div>
              </>
            )}
          </div>
        )}

        {isLoading && <div className="flex items-center gap-2 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading brain…</div>}
        {isError && <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">Couldn't load the brain.</div>}

        {brain && (
          <>
            {/* Overview */}
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="smart-card p-4"><div className="text-[11px] uppercase tracking-wider text-white/40">Trades learned</div><div className="mt-1 font-mono text-2xl font-bold">{brain.totalTrades}</div></div>
              <div className="smart-card p-4"><div className="text-[11px] uppercase tracking-wider text-white/40">Overall win rate</div><div className="mt-1 font-mono text-2xl font-bold" style={{ color: wrCls(brain.overallWinRate) }}>{brain.overallWinRate}%</div></div>
              <div className="smart-card p-4"><div className="text-[11px] uppercase tracking-wider text-white/40">Net P&amp;L (learned)</div><div className="mt-1 font-mono text-2xl font-bold" style={{ color: brain.totalPnl >= 0 ? "#10b981" : "#ef4444" }}>{fmtUsd(brain.totalPnl)}</div></div>
              <div className="smart-card p-4"><div className="text-[11px] uppercase tracking-wider text-white/40">Coins learned</div><div className="mt-1 font-mono text-2xl font-bold">{coins.length}</div></div>
            </div>

            {/* Brain controls (live engine) */}
            <div className="smart-card mb-5 p-4">
              <div className="mb-3 text-[11px] uppercase tracking-wider text-white/40">Brain controls · live engine</div>
              <div className="flex flex-col gap-2">
                <ToggleRow
                  label="Influence sizing & value scoring"
                  desc="Bounded reweight (~0.6–1.4×) + Kelly sizing (0.25–1.5×). Never blocks a trade."
                  on={cfg.kalshiBrainEnabled !== false}
                  pending={setCfg.isPending}
                  onToggle={() => setCfg.mutate({ kalshiBrainEnabled: !(cfg.kalshiBrainEnabled !== false) })}
                />
                <ToggleRow
                  label="Gate proven-losing setups (hard-block)"
                  desc="Skip coins/bracket types with a proven low win rate (enough samples). Requires influence on."
                  on={!!cfg.kalshiBrainGating}
                  pending={setCfg.isPending}
                  disabled={cfg.kalshiBrainEnabled === false}
                  onToggle={() => setCfg.mutate({ kalshiBrainGating: !cfg.kalshiBrainGating })}
                />
              </div>
            </div>

            {/* Insights */}
            {brain.insights?.length > 0 && (
              <div className="smart-card mb-5 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-300"><Sparkles className="h-4 w-4" /> What the brain learned</div>
                <ul className="flex flex-col gap-1.5">
                  {brain.insights.map((s, i) => <li key={i} className="text-sm text-white/70 flex gap-2"><span className="text-amber-400">→</span>{s}</li>)}
                </ul>
              </div>
            )}

            {/* Per-coin cards */}
            {coins.length === 0 ? (
              <div className="smart-card p-6 text-center text-white/50">
                No learned data yet. Once the bot closes Kalshi trades (or you hit “Relearn from trades” to backfill history), per-coin knowledge appears here.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {coins.map(([coin, k]) => (
                  <div key={coin} className="smart-card p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg font-bold">{coin}</span>
                        <span className="text-[11px] text-white/40">{k.wins + k.losses} decided · {k.totalTrades} total</span>
                      </div>
                      <span className="font-mono text-xl font-bold" style={{ color: wrCls(k.winRate) }}>{k.winRate}%</span>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-white/[0.04] py-2">
                        <div className="text-[10px] uppercase text-white/40">Size ×</div>
                        <div className="font-mono text-sm font-bold" style={{ color: k.recommendedSizeMultiplier >= 1 ? "#10b981" : "#f59e0b" }}>{k.recommendedSizeMultiplier}</div>
                      </div>
                      <div className="rounded-lg bg-white/[0.04] py-2">
                        <div className="text-[10px] uppercase text-white/40">Value ×</div>
                        <div className="font-mono text-sm font-bold" style={{ color: k.valueScoreWeight >= 1 ? "#10b981" : "#f59e0b" }}>{k.valueScoreWeight}</div>
                      </div>
                      <div className="rounded-lg bg-white/[0.04] py-2">
                        <div className="text-[10px] uppercase text-white/40">R:R</div>
                        <div className="font-mono text-sm font-bold text-white/80">{k.riskReward.toFixed(2)}</div>
                      </div>
                    </div>

                    {k.bestStrikeType && <div className="mt-3 text-[12px] text-white/60">Best bracket type: <span className="font-mono text-emerald-300">{k.bestStrikeType}</span></div>}

                    <Bars title="By bracket type" data={k.byStrikeType} />
                    <Bars title="By confidence band" data={k.byConfidenceBand} />
                    <Bars title="By edge band (¢)" data={k.byEdgeBand} />
                  </div>
                ))}
              </div>
            )}

            <p className="mt-5 text-[11px] text-white/35">
              Last learned {new Date(brain.lastLearned).toLocaleString()}. The brain influences sizing (0.25–1.5×) and value scoring (~0.6–1.4×) only —
              it never hard-blocks a trade, and stays neutral until it has ≥10 decided trades per coin.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
