import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Activity, Brain, Loader2, Play, Square, Scan, Save, Store, TrendingUp, Wallet, XCircle } from "lucide-react";

// Consolidated Kalshi command center — every setting + feature in one place.
// All reads/writes use the existing /api/kalshi/* routes; no server changes.

const COINS = ["BTC", "ETH", "SOL", "XRP", "DOGE", "GOLD"] as const;
const STRATEGIES = ["auto", "momentum", "volume_profile", "markov", "order_flow", "ensemble"] as const;
const fmtUsd = (n: number) => `${n >= 0 ? "+" : "-"}$${Math.abs(Number(n) || 0).toFixed(2)}`;

export default function KalshiHubPage() {
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: state } = useQuery<any>({ queryKey: ["/api/kalshi/engine/status"], enabled: !!user, refetchInterval: 15000 });
  const { data: account } = useQuery<any>({ queryKey: ["/api/kalshi/account"], enabled: !!user });
  const { data: picks } = useQuery<any>({ queryKey: ["/api/kalshi/value-picks?limit=5"], enabled: !!user });
  const { data: perf } = useQuery<any>({ queryKey: ["/api/kalshi/performance"], enabled: !!user });

  const cfg = state?.config;
  const [form, setForm] = useState<any>(null);
  useEffect(() => { if (cfg && !form) setForm({ ...cfg }); }, [cfg, form]);
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const mut = (url: string, body?: any) => async () => (await apiRequest("POST", url, body)).json();
  const start = useMutation({ mutationFn: mut("/api/kalshi/engine/start"), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }) });
  const stop = useMutation({ mutationFn: mut("/api/kalshi/engine/stop"), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }) });
  const scan = useMutation({ mutationFn: mut("/api/kalshi/engine/scan"), onSuccess: (d: any) => { queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }); toast({ title: d?.fired ? "Trade fired" : "Scan complete", description: d?.reason }); } });
  const closeAll = useMutation({ mutationFn: mut("/api/kalshi/engine/trades/close-all"), onSuccess: (d: any) => { queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }); toast({ title: "Closed all open trades", description: `${d?.closed ?? 0} closed.` }); } });
  const save = useMutation({
    mutationFn: async () => (await apiRequest("PUT", "/api/kalshi/engine/config", form)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/kalshi/engine/status"] }); toast({ title: "Settings saved" }); },
    onError: (e: any) => toast({ title: "Save failed", description: e?.message, variant: "destructive" }),
  });

  const running = state?.isRunning;
  const paper = state?.isPaperMode;
  const open = state?.openTrades ?? [];
  const totals = useMemo(() => perf?.totals ?? {}, [perf]);

  return (
    <div className="app-page min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-5xl">
        {/* Header + engine controls */}
        <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
              <TrendingUp className="h-7 w-7 text-indigo-400" /> Kalshi Command Center
            </h1>
            <p className="mt-1 text-sm text-white/50">Every Kalshi setting and tool in one place — connection, engine, strategy, risk, brain, and value picks.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: running ? "rgba(16,185,129,0.2)" : "rgba(148,163,184,0.15)", color: running ? "#34d399" : "#94a3b8" }}>{running ? "RUNNING" : "STOPPED"}</span>
            <span className="rounded-full px-3 py-1 text-xs font-bold" style={{ background: paper ? "rgba(245,158,11,0.2)" : "rgba(16,185,129,0.2)", color: paper ? "#fcd34d" : "#34d399" }}>{paper ? "PAPER" : "LIVE"}</span>
          </div>
        </div>

        {/* Status strip */}
        <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Open trades" value={String(open.length)} />
          <Stat label="Unrealized P&L" value={fmtUsd(state?.totalUnrealizedPnl ?? 0)} color={(state?.totalUnrealizedPnl ?? 0) >= 0 ? "#34d399" : "#f87171"} />
          <Stat label="Realized P&L" value={fmtUsd(state?.totalRealizedPnl ?? 0)} color={(state?.totalRealizedPnl ?? 0) >= 0 ? "#34d399" : "#f87171"} />
          <Stat label="Win rate" value={totals.winRate != null ? `${totals.winRate}% (${totals.trades ?? 0}t)` : "—"} />
        </div>

        {/* Engine controls */}
        <div className="smart-card mb-5 flex flex-wrap items-center gap-2 p-4">
          {!running ? (
            <Btn onClick={() => start.mutate()} pending={start.isPending} icon={<Play className="h-4 w-4" />} color="#10b981">Start engine</Btn>
          ) : (
            <Btn onClick={() => stop.mutate()} pending={stop.isPending} icon={<Square className="h-4 w-4" />} color="#ef4444">Stop engine</Btn>
          )}
          <Btn onClick={() => scan.mutate()} pending={scan.isPending} icon={<Scan className="h-4 w-4" />} color="#6366f1">Scan now</Btn>
          {open.length > 0 && <Btn onClick={() => closeAll.mutate()} pending={closeAll.isPending} icon={<XCircle className="h-4 w-4" />} color="#f59e0b">Close all ({open.length})</Btn>}
          <span className="ml-auto text-[11px] text-white/40">{state?.lastScanResult ?? "No scans yet."}</span>
        </div>

        {/* Connection */}
        <Section title="Connection" icon={<Wallet className="h-4 w-4" />}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm text-white/70">
              {paper ? "No live credentials — running in paper mode." : "Connected to Kalshi (live)."}
              {account?.balance != null && <span className="ml-2 font-mono text-white/90">Balance: ${Number(account.balance).toFixed(2)}</span>}
              {state?.credentialError && <span className="ml-2 text-red-300">{state.credentialError}</span>}
            </div>
            <Link href="/polymarket-engine#kalshi"><button className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:text-white">Manage credentials</button></Link>
          </div>
        </Section>

        {/* Settings */}
        {form && (
          <Section title="Settings" icon={<Activity className="h-4 w-4" />}
            action={<Btn onClick={() => save.mutate()} pending={save.isPending} icon={<Save className="h-4 w-4" />} color="#6366f1">Save settings</Btn>}>
            <div className="grid gap-4 md:grid-cols-2">
              {/* Trading */}
              <Group label="Trading">
                <MultiCoin value={form.symbols ?? []} onChange={(v) => set("symbols", v)} />
                <Select label="Timeframe" value={form.timeframe} opts={[["hourly", "Hourly"], ["fifteen_min", "15-minute"]]} onChange={(v) => set("timeframe", v)} />
                <Select label="Strategy" value={form.strategy} opts={STRATEGIES.map(s => [s, s])} onChange={(v) => set("strategy", v)} />
                <Num label="Min confidence %" value={form.minConfidence} onChange={(v) => set("minConfidence", v)} />
                <Num label="Contracts / trade" value={form.contractsPerTrade} onChange={(v) => set("contractsPerTrade", v)} />
                <Num label="Max open trades" value={form.maxOpenTrades} onChange={(v) => set("maxOpenTrades", v)} />
                <Num label="Cooldown (min)" value={form.cooldownMinutes} onChange={(v) => set("cooldownMinutes", v)} />
                <Toggle label="Require aligned 1h trend" value={form.requireAlignedHourly} onChange={(v) => set("requireAlignedHourly", v)} />
                <Toggle label="Require confluence (≥60%)" value={form.requireConfluence} onChange={(v) => set("requireConfluence", v)} />
                <Toggle label="Auto-trade value picks" value={form.autoTradeValuePicks} onChange={(v) => set("autoTradeValuePicks", v)} />
                <Num label="Min value score" value={form.minValueScore} onChange={(v) => set("minValueScore", v)} />
              </Group>

              {/* Exits + sizing */}
              <Group label="Exits & sizing">
                <Num label="Take-profit (% of entry)" value={form.takeProfitCents} onChange={(v) => set("takeProfitCents", v)} />
                <Num label="Stop-loss (% of entry)" value={form.stopLossCents} onChange={(v) => set("stopLossCents", v)} />
                <Toggle label="Compounding" value={form.compounding} onChange={(v) => set("compounding", v)} />
                <Num label="Risk % / trade (compounding)" value={form.riskPctPerTrade} onChange={(v) => set("riskPctPerTrade", v)} />
                <Num label="Starting bankroll ($)" value={form.startingBankroll} onChange={(v) => set("startingBankroll", v)} />
                <Toggle label="Kelly criterion sizing" value={form.useKellyCriterion} onChange={(v) => set("useKellyCriterion", v)} />
                <Toggle label="Brain Learning Mode (lock to 1)" value={form.brainLearningMode} onChange={(v) => set("brainLearningMode", v)} />
                <Num label="Drawdown Shield threshold %" value={form.drawdownShieldThreshold} onChange={(v) => set("drawdownShieldThreshold", v)} />
              </Group>

              {/* Brain */}
              <Group label="Self-learning brain">
                <Toggle label="Brain influence (reweight + size)" value={form.kalshiBrainEnabled} onChange={(v) => set("kalshiBrainEnabled", v)} />
                <Toggle label="Brain gating (hard-block losers)" value={form.kalshiBrainGating} onChange={(v) => set("kalshiBrainGating", v)} />
                <Link href="/kalshi-brain"><button className="mt-1 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-sm text-amber-300 hover:bg-amber-500/20"><Brain className="h-4 w-4" /> Open Brain panel</button></Link>
              </Group>

              {/* Ruin guard */}
              <Group label="Ruin Guard (circuit breaker)">
                <Toggle label="Ruin Guard enabled" value={form.ruinGuardEnabled} onChange={(v) => set("ruinGuardEnabled", v)} />
                <Num label="Daily loss limit %" value={form.dailyLossLimitPct} onChange={(v) => set("dailyLossLimitPct", v)} />
                <Num label="Max drawdown limit %" value={form.maxDrawdownLimitPct} onChange={(v) => set("maxDrawdownLimitPct", v)} />
                <Link href="/ruin-cone"><button className="mt-1 flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 hover:text-white"><Activity className="h-4 w-4" /> Open Ruin Cone</button></Link>
              </Group>
            </div>
          </Section>
        )}

        {/* Open trades */}
        {open.length > 0 && (
          <Section title={`Open trades (${open.length})`} icon={<TrendingUp className="h-4 w-4" />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-[11px] uppercase text-white/40"><th className="py-1 pr-3">Market</th><th className="pr-3">Coin</th><th className="pr-3">Entry</th><th className="pr-3">Now</th><th className="pr-3">P&L</th></tr></thead>
                <tbody>
                  {open.map((t: any) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="py-1.5 pr-3 text-white/80">{t.subtitle}</td>
                      <td className="pr-3 text-white/60">{t.coin}</td>
                      <td className="pr-3 font-mono">{t.entryPriceCents}¢</td>
                      <td className="pr-3 font-mono">{t.currentPriceCents}¢</td>
                      <td className="pr-3 font-mono" style={{ color: (t.unrealizedPnl ?? 0) >= 0 ? "#34d399" : "#f87171" }}>{fmtUsd(t.unrealizedPnl ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        {/* Value picks */}
        {picks?.picks?.length > 0 && (
          <Section title="Top value picks" icon={<Store className="h-4 w-4" />}>
            <ul className="flex flex-col gap-2">
              {picks.picks.slice(0, 5).map((p: any, i: number) => (
                <li key={i} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-sm">
                  <span className="text-white/80">{p.subtitle}</span>
                  <span className="font-mono text-white/60">score {p.valueScore} · +{p.edgePct}¢ · {p.marketAskCents}¢</span>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

/* ── Presentational helpers ─────────────────────────────── */
function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="smart-card p-4"><div className="text-[11px] uppercase tracking-wider text-white/40">{label}</div><div className="mt-1 font-mono text-xl font-bold" style={{ color: color ?? "#fff" }}>{value}</div></div>;
}
function Section({ title, icon, action, children }: { title: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return <div className="smart-card mb-5 p-4"><div className="mb-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2 text-sm font-semibold text-white/80">{icon}{title}</div>{action}</div>{children}</div>;
}
function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-lg border border-white/8 p-3"><div className="mb-2 text-[11px] uppercase tracking-wider text-indigo-300/70">{label}</div><div className="flex flex-col gap-2">{children}</div></div>;
}
function Num({ label, value, onChange }: { label: string; value: any; onChange: (v: number) => void }) {
  return <label className="flex items-center justify-between gap-3 text-sm"><span className="text-white/60">{label}</span>
    <input type="number" defaultValue={value} onBlur={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) onChange(v); }}
      className="w-24 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 font-mono text-right text-white/85 outline-none focus:border-indigo-400/50" /></label>;
}
function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <button onClick={() => onChange(!value)} className="flex items-center justify-between gap-3 text-sm">
    <span className="text-white/60 text-left">{label}</span>
    <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: value ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)", color: value ? "#34d399" : "#9ca3af", border: `1px solid ${value ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.12)"}` }}>{value ? "ON" : "OFF"}</span>
  </button>;
}
function Select({ label, value, opts, onChange }: { label: string; value: any; opts: readonly (readonly [string, string])[]; onChange: (v: string) => void }) {
  return <label className="flex items-center justify-between gap-3 text-sm"><span className="text-white/60">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-white/85 outline-none focus:border-indigo-400/50">
      {opts.map(([v, l]) => <option key={v} value={v} className="bg-[#0D1117]">{l}</option>)}
    </select></label>;
}
function MultiCoin({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  return <div><div className="mb-1 text-sm text-white/60">Coins</div><div className="flex flex-wrap gap-1.5">
    {COINS.map(c => {
      const on = value.includes(c);
      return <button key={c} onClick={() => onChange(on ? value.filter(x => x !== c) : [...value, c])}
        className="rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ background: on ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.04)", color: on ? "#c7d2fe" : "#9ca3af", border: `1px solid ${on ? "rgba(99,102,241,0.4)" : "rgba(255,255,255,0.1)"}` }}>{c}</button>;
    })}
  </div></div>;
}
function Btn({ onClick, pending, icon, color, children }: { onClick: () => void; pending?: boolean; icon: React.ReactNode; color: string; children: React.ReactNode }) {
  return <button onClick={onClick} disabled={pending} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium disabled:opacity-50"
    style={{ background: `${color}1f`, color, border: `1px solid ${color}55` }}>{pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}{children}</button>;
}
