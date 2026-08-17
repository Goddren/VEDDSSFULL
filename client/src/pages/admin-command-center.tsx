import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import {
  Shield, Users, Coins, TrendingUp, AlertTriangle, Loader2, CheckCircle2,
  ExternalLink, Activity, Wallet, RefreshCw,
} from "lucide-react";

type Tab = "overview" | "economy" | "signals" | "payouts" | "users" | "profitsplit" | "tools";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "economy", label: "Economy" },
  { id: "signals", label: "Signals" },
  { id: "payouts", label: "Payouts" },
  { id: "users", label: "Users" },
  { id: "profitsplit", label: "Profit Split" },
  { id: "tools", label: "Tools" },
];

const fmt = (n: number) => (Number(n) || 0).toLocaleString();
const fmtUsd = (cents: number) => `$${((Number(cents) || 0) / 100).toFixed(2)}`;

export default function AdminCommandCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("overview");

  const econ = useQuery<any>({ queryKey: ["/api/admin/economy"], enabled: !!user });
  const usersQ = useQuery<any[]>({ queryKey: ["/api/admin/users"], enabled: !!user && tab === "users" });
  const pending = useQuery<any[]>({ queryKey: ["/api/vedd/admin/pending-rewards"], enabled: !!user && tab === "payouts" });
  const transfers = useQuery<any[]>({ queryKey: ["/api/vedd/admin/transfers"], enabled: !!user && tab === "payouts" });
  const diag = useQuery<any>({ queryKey: ["/api/admin/mt5-diag"], enabled: !!user && tab === "signals", refetchInterval: tab === "signals" ? 30000 : false });
  const splits = useQuery<any[]>({ queryKey: ["/api/profit-split/admin/list"], enabled: !!user && tab === "profitsplit" });
  const [psEmail, setPsEmail] = useState("");
  const enrollPs = useMutation({
    mutationFn: async (email: string) => (await apiRequest("POST", "/api/profit-split/enroll", { email })).json(),
    onSuccess: () => { setPsEmail(""); queryClient.invalidateQueries({ queryKey: ["/api/profit-split/admin/list"] }); toast({ title: "Trader enrolled in Profit Split" }); },
    onError: (e: any) => toast({ title: "Enroll failed", description: e?.message, variant: "destructive" }),
  });
  const unenrollPs = useMutation({
    mutationFn: async (userId: number) => (await apiRequest("POST", "/api/profit-split/unenroll", { userId })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/profit-split/admin/list"] }); toast({ title: "Ended enrollment" }); },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });
  const payPs = useMutation({
    mutationFn: async ({ userId, amount }: { userId: number; amount: number }) => (await apiRequest("POST", "/api/profit-split/record-payment", { userId, amount })).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/profit-split/admin/list"] }); toast({ title: "Payment recorded" }); },
    onError: (e: any) => toast({ title: "Failed", description: e?.message, variant: "destructive" }),
  });

  const verify = useMutation({
    mutationFn: async (rewardId: number) => (await apiRequest("POST", `/api/vedd/admin/rewards/${rewardId}/verify`, {})).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/vedd/admin/pending-rewards"] }); toast({ title: "Reward verified — payout queued" }); },
    onError: (e: any) => toast({ title: "Verify failed", description: e?.message, variant: "destructive" }),
  });
  const toggleRole = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: any }) => (await apiRequest("PATCH", `/api/admin/users/${id}`, patch)).json(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] }); toast({ title: "User updated" }); },
    onError: (e: any) => toast({ title: "Update failed", description: e?.message, variant: "destructive" }),
  });

  // Admin gate — AFTER all hooks (hooks must run unconditionally every render;
  // gating before them changed the hook count once `user` loaded and blanked
  // the page). ProtectedRoute only enforces login, so self-gate here.
  if (!user?.isAdmin) {
    return (
      <div className="app-page min-h-screen flex items-center justify-center px-4">
        <div className="smart-card p-8 text-center">
          <Shield className="mx-auto h-8 w-8 text-red-400" />
          <p className="mt-3 text-white/70">Admins only.</p>
        </div>
      </div>
    );
  }

  const e = econ.data;
  const pool0 = e?.pool?.pools?.[0];

  return (
    <div className="app-page min-h-screen px-4 py-6 md:px-8 md:py-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 flex items-center justify-between gap-3">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
            <Shield className="h-7 w-7 text-amber-400" /> Admin Command Center
          </h1>
          <button onClick={() => econ.refetch()} className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/60 hover:text-white">
            <RefreshCw className={`h-4 w-4 ${econ.isFetching ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-1.5">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="rounded-lg px-3.5 py-1.5 text-sm font-medium transition"
              style={{ background: tab === t.id ? "rgba(245,158,11,0.18)" : "rgba(255,255,255,0.04)", color: tab === t.id ? "#fbbf24" : "rgba(255,255,255,0.6)", border: `1px solid ${tab === t.id ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.08)"}` }}>
              {t.label}
            </button>
          ))}
        </div>

        {econ.isLoading && <div className="flex items-center gap-2 text-white/50"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}

        {/* OVERVIEW */}
        {tab === "overview" && e && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat icon={<Users className="h-4 w-4" />} label="Total users" value={fmt(e.users?.total)} />
            <Stat icon={<Users className="h-4 w-4" />} label="Ambassadors" value={fmt(e.users?.ambassadors)} color="#f59e0b" />
            <Stat icon={<TrendingUp className="h-4 w-4" />} label="Subscribers" value={fmt(e.users?.subscribers)} color="#10b981" />
            <Stat icon={<Shield className="h-4 w-4" />} label="Admins" value={fmt(e.users?.admins)} />
            <Stat icon={<Wallet className="h-4 w-4" />} label="Pool balance (VEDD)" value={pool0 ? fmt(pool0.tokenBalance) : "—"} color={pool0?.isLowBalance ? "#ef4444" : "#10b981"} sub={pool0?.isLowBalance ? "LOW BALANCE" : pool0?.status} />
            <Stat icon={<Coins className="h-4 w-4" />} label="Distributed today" value={fmt(e.pool?.totalDistributedToday)} />
            <Stat icon={<Activity className="h-4 w-4" />} label="Pending payouts" value={fmt(e.pool?.pendingTransfers)} color="#f59e0b" />
            <Stat icon={<CheckCircle2 className="h-4 w-4" />} label="Payouts done today" value={fmt(e.pool?.completedTransfersToday)} />
          </div>
        )}

        {/* ECONOMY */}
        {tab === "economy" && e && (
          <div className="flex flex-col gap-5">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat icon={<Coins className="h-4 w-4" />} label="Daily cap / user" value={fmt(e.caps?.daily)} />
              <Stat icon={<Coins className="h-4 w-4" />} label="Weekly cap / user" value={fmt(e.caps?.weekly)} />
              <Stat icon={<Activity className="h-4 w-4" />} label="Gamified earned today" value={fmt(e.caps?.gamifiedEarnedToday)} />
              <Stat icon={<Activity className="h-4 w-4" />} label="Gamified earned 7d" value={fmt(e.caps?.gamifiedEarnedWeek)} />
            </div>

            <Section title="Reward config (source of truth)">
              <Table head={["Action", "Amount", "Active"]}>
                {(e.rewardConfig ?? []).map((r: any) => (
                  <tr key={r.actionType} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 text-white/80">{r.actionType}</td>
                    <td className="pr-3 font-mono">{r.baseAmount}</td>
                    <td className="pr-3">{r.isActive ? "✓" : "—"}</td>
                  </tr>
                ))}
              </Table>
            </Section>

            <Section title="Ambassador tiers">
              <Table head={["Tier", "Referrals", "Monthly credits", "Commission"]}>
                {(e.tiers ?? []).map((t: any) => (
                  <tr key={t.name} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 font-semibold text-amber-300">{t.name}</td>
                    <td className="pr-3 font-mono">{t.minReferrals}+</td>
                    <td className="pr-3 font-mono">{fmt(t.monthlyCredits)}</td>
                    <td className="pr-3 font-mono">{t.commissionPct}%</td>
                  </tr>
                ))}
              </Table>
            </Section>

            <Section title="Transfer pipeline">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {Object.entries(e.transfers ?? {}).map(([status, v]: any) => (
                  <Stat key={status} icon={<Coins className="h-4 w-4" />} label={status} value={fmt(v.count)} sub={`${fmt(v.total)} VEDD`} color={status === "failed" ? "#ef4444" : status === "pending" ? "#f59e0b" : "#10b981"} />
                ))}
              </div>
            </Section>
          </div>
        )}

        {/* SIGNALS (SS AI confirmations + why rejected, last 24h) */}
        {tab === "signals" && (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap items-center gap-2">
              {Object.entries(diag.data?.tally ?? {}).map(([k, v]: any) => (
                <span key={k} className="rounded-full px-3 py-1 text-xs font-bold" style={{
                  background: k === "CONFIRMED" ? "rgba(16,185,129,0.18)" : k === "REJECTED" ? "rgba(239,68,68,0.15)" : "rgba(148,163,184,0.15)",
                  color: k === "CONFIRMED" ? "#34d399" : k === "REJECTED" ? "#f87171" : "#94a3b8",
                }}>{k}: {v}</span>
              ))}
              <span className="ml-auto text-[11px] text-white/40">{diag.data?.count ?? 0} signals · last 24h</span>
            </div>
            <Section title="SS AI signals & rejection reasons">
              {diag.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white/40" /> :
               (diag.data?.rows ?? []).length === 0 ? (
                <p className="text-sm text-white/40">
                  No signals logged in the last 24h. {diag.data?.note ? `(${diag.data.note})` : "The SS AI engine may be idle, or Breakout Mode filtered everything."}
                </p>
              ) : (
                <Table head={["Time", "Symbol", "TF", "Signal", "Conf", "Votes", "Stage", "Decision", "Reason"]}>
                  {(diag.data?.rows ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="py-1.5 pr-3 text-white/50 whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleTimeString() : "—"}</td>
                      <td className="pr-3 text-white/80">{r.symbol}</td>
                      <td className="pr-3 text-white/50">{r.timeframe}</td>
                      <td className="pr-3">{r.signal}</td>
                      <td className="pr-3 font-mono">{r.confidence != null ? `${Math.round(r.confidence)}%` : "—"}</td>
                      <td className="pr-3 font-mono text-white/50">{r.buyVotes ?? 0}/{r.sellVotes ?? 0}</td>
                      <td className="pr-3 text-white/50">{r.stage}</td>
                      <td className="pr-3 font-semibold" style={{ color: r.decision === "CONFIRMED" ? "#34d399" : r.decision === "REJECTED" ? "#f87171" : "#fbbf24" }}>{r.decision}</td>
                      <td className="pr-3 text-white/50 max-w-[220px] truncate" title={r.neutralReason || r.err || ""}>{r.neutralReason || r.err || "—"}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </div>
        )}

        {/* PAYOUTS */}
        {tab === "payouts" && (
          <div className="flex flex-col gap-5">
            <Section title="Pending reward verification">
              {pending.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white/40" /> : (pending.data ?? []).length === 0 ? <p className="text-sm text-white/40">Nothing pending.</p> : (
                <Table head={["User", "Action", "Amount", ""]}>
                  {(pending.data ?? []).map((r: any) => (
                    <tr key={r.id} className="border-t border-white/5">
                      <td className="py-1.5 pr-3 text-white/70">{r.userId}</td>
                      <td className="pr-3">{r.actionType}</td>
                      <td className="pr-3 font-mono">{r.totalReward}</td>
                      <td className="pr-3"><button onClick={() => verify.mutate(r.id)} disabled={verify.isPending} className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-300 hover:bg-emerald-500/20 disabled:opacity-50">Verify</button></td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
            <Section title="Recent transfers">
              {transfers.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white/40" /> : (
                <Table head={["User", "Amount", "Status", "Tx"]}>
                  {(transfers.data ?? []).slice(0, 40).map((t: any) => (
                    <tr key={t.id} className="border-t border-white/5">
                      <td className="py-1.5 pr-3 text-white/70">{t.userId}</td>
                      <td className="pr-3 font-mono">{t.amount}</td>
                      <td className="pr-3" style={{ color: t.status === "failed" ? "#f87171" : t.status === "completed" ? "#34d399" : "#fbbf24" }}>{t.status}</td>
                      <td className="pr-3 text-white/40 truncate max-w-[140px]">{t.solanaTransactionSig ?? "—"}</td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </div>
        )}

        {/* USERS */}
        {tab === "users" && (
          <Section title="Users">
            {usersQ.isLoading ? <Loader2 className="h-4 w-4 animate-spin text-white/40" /> : (
              <Table head={["User", "Tier", "Ambassador", "Admin"]}>
                {(usersQ.data ?? []).map((u: any) => (
                  <tr key={u.id} className="border-t border-white/5">
                    <td className="py-1.5 pr-3 text-white/80">{u.username ?? u.email ?? u.id}</td>
                    <td className="pr-3 text-white/50">{u.subscriptionStatus ?? u.subscriptionTier ?? "free"}</td>
                    <td className="pr-3"><RoleToggle on={u.isAmbassador} onClick={() => toggleRole.mutate({ id: u.id, patch: { isAmbassador: !u.isAmbassador } })} /></td>
                    <td className="pr-3"><RoleToggle on={u.isAdmin} onClick={() => toggleRole.mutate({ id: u.id, patch: { isAdmin: !u.isAdmin } })} /></td>
                  </tr>
                ))}
              </Table>
            )}
          </Section>
        )}

        {/* TOOLS */}
        {tab === "profitsplit" && (
          <div className="grid gap-3">
            <Section title="Enroll a trader (30% prop-firm profit split — no subscription)">
              <div className="flex flex-wrap items-center gap-2">
                <input value={psEmail} onChange={e => setPsEmail(e.target.value)} placeholder="trader@email.com"
                  className="flex-1 min-w-[220px] rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white outline-none" />
                <button onClick={() => psEmail.trim() && enrollPs.mutate(psEmail.trim())} disabled={enrollPs.isPending}
                  className="rounded-lg px-4 py-2 text-sm font-bold" style={{ background: "rgba(245,196,81,.18)", color: "#f5c451", border: "1px solid rgba(245,196,81,.4)" }}>
                  {enrollPs.isPending ? "Enrolling…" : "Enroll"}
                </button>
              </div>
              <p className="mt-2 text-[11px] text-white/40">Grants full access with no plan; VEDD is owed 30% of the trader's net prop-firm profit. Ambassadors can enroll their own recruits from the Referral Hub.</p>
            </Section>
            <Section title="Active enrollments">
              {splits.isLoading ? <div className="text-white/40 text-sm">Loading…</div> : !splits.data?.length ? (
                <div className="text-white/40 text-sm">No active enrollments yet.</div>
              ) : (
                <Table head={["Trader", "PF accts", "Net profit", "30% owed", "Paid", "Balance", ""]}>
                  {splits.data.map((s: any) => (
                    <tr key={s.userId} className="border-t border-white/5">
                      <td className="py-2 pr-3">{s.username || `#${s.userId}`}</td>
                      <td className="py-2 pr-3 font-mono">{s.propFirmConnections}</td>
                      <td className="py-2 pr-3 font-mono" style={{ color: s.netProfit >= 0 ? "#34d399" : "#f87171" }}>${s.netProfit.toLocaleString()}</td>
                      <td className="py-2 pr-3 font-mono text-amber-300">${s.owed.toLocaleString()}</td>
                      <td className="py-2 pr-3 font-mono text-white/70">${s.paid.toLocaleString()}</td>
                      <td className="py-2 pr-3 font-mono font-bold" style={{ color: s.balance > 0 ? "#f5c451" : "#34d399" }}>${s.balance.toLocaleString()}</td>
                      <td className="py-2 pr-3">
                        <div className="flex gap-1.5">
                          <button onClick={() => { const a = Number(prompt(`Record payment collected from ${s.username || s.userId} (USD):`, String(s.balance))); if (a > 0) payPs.mutate({ userId: s.userId, amount: a }); }}
                            className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(16,185,129,.18)", color: "#34d399", border: "1px solid rgba(16,185,129,.4)" }}>Record $</button>
                          <button onClick={() => confirm(`End profit-split enrollment for ${s.username || s.userId}?`) && unenrollPs.mutate(s.userId)}
                            className="rounded px-2 py-0.5 text-[11px] font-bold" style={{ background: "rgba(255,255,255,.06)", color: "#f87171", border: "1px solid rgba(255,255,255,.12)" }}>End</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Section>
          </div>
        )}

        {tab === "tools" && (
          <div className="grid gap-3 md:grid-cols-2">
            <ToolLink href="/admin/vedd-pool" title="Token Distribution console" desc="Pool wallets, verification queue, transfer history, blacklist." />
            <ToolLink href="/blog" title="Blog management" desc="Generate & manage blog articles." />
            <ToolLink href="/vedd-tokenomics" title="Tokenomics" desc="Token supply, distribution, staking." />
            <ToolLink href="/impact-dashboard" title="Community impact" desc="Impact KPIs & quarterly metrics." />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="smart-card p-4">
      <div className="flex items-center gap-2 text-white/45" style={{ color: color ?? undefined }}>{icon}<span className="text-[11px] uppercase tracking-wider">{label}</span></div>
      <div className="mt-1 font-mono text-xl font-bold" style={{ color: color ?? "#fff" }}>{value}</div>
      {sub && <div className="mt-0.5 font-mono text-[11px] text-white/40">{sub}</div>}
    </div>
  );
}
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="smart-card p-4"><div className="mb-3 text-sm font-semibold text-white/80">{title}</div>{children}</div>;
}
function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-[11px] uppercase text-white/40">{head.map((h, i) => <th key={i} className="py-1 pr-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function RoleToggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return <button onClick={onClick} className="rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: on ? "rgba(16,185,129,0.2)" : "rgba(255,255,255,0.06)", color: on ? "#34d399" : "#9ca3af", border: `1px solid ${on ? "rgba(16,185,129,0.4)" : "rgba(255,255,255,0.12)"}` }}>{on ? "YES" : "no"}</button>;
}
function ToolLink({ href, title, desc }: { href: string; title: string; desc: string }) {
  return (
    <Link href={href}>
      <div className="smart-card p-4 hover:border-amber-500/30 cursor-pointer">
        <div className="flex items-center justify-between"><span className="font-semibold text-white/85">{title}</span><ExternalLink className="h-4 w-4 text-white/40" /></div>
        <p className="mt-1 text-[13px] text-white/50">{desc}</p>
      </div>
    </Link>
  );
}
