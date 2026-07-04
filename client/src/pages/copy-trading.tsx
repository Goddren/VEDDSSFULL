import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Copy, Users, TrendingUp, TrendingDown, Trophy, Activity,
  CheckCircle, XCircle, Loader2, Settings, ArrowLeft,
  Zap, Clock, Target, BarChart2, RefreshCw,
} from "lucide-react";
import { Link } from "wouter";

function fmt(v: number, dec = 2) {
  return (v >= 0 ? "+" : "") + v.toFixed(dec);
}

function pnlColor(v: number) {
  return v > 0 ? "#10b981" : v < 0 ? "#ef4444" : "#6b7280";
}

function winRateColor(wr: number) {
  return wr >= 60 ? "#10b981" : wr >= 50 ? "#f59e0b" : "#ef4444";
}

function duration(openedAt: string) {
  const ms = Date.now() - new Date(openedAt).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}

function relativeTime(ts: string) {
  if (!ts) return "—";
  const m = Math.floor((Date.now() - new Date(ts).getTime()) / 60000);
  if (m < 2) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function CopyTradingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editingRelId, setEditingRelId] = useState<number | null>(null);
  const [editMaxLot, setEditMaxLot] = useState("0.01");
  const [editAccountType, setEditAccountType] = useState("paper");
  const [copyingUserId, setCopyingUserId] = useState<number | null>(null);
  const [newMaxLot, setNewMaxLot] = useState("0.01");
  const [newAccountType, setNewAccountType] = useState("paper");
  const [logFilter, setLogFilter] = useState<"all" | "open" | "closed">("all");

  const { data: leaderboard = [], isLoading: lbLoading, dataUpdatedAt: lbUpdated } = useQuery<any[]>({
    queryKey: ["/api/copy/leaderboard"],
    refetchInterval: 30000,
  });

  const { data: relationships = [] } = useQuery<any[]>({
    queryKey: ["/api/copy/relationships"],
    refetchInterval: 15000,
  });

  const { data: copyTrades = [], dataUpdatedAt: tradesUpdated, isFetching: tradesFetching, refetch: refetchTrades } = useQuery<any[]>({
    queryKey: ["/api/copy/trades"],
    refetchInterval: 10000,
    staleTime: 0,
  });

  const startCopyMutation = useMutation({
    mutationFn: async ({ sourceUserId, accountType, maxLotSize }: { sourceUserId: number; accountType: string; maxLotSize: number }) => {
      const res = await apiRequest("POST", "/api/copy/relationships", { sourceUserId, accountType, maxLotSize });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/copy/relationships"] });
      setCopyingUserId(null);
      toast({ title: "Copy started", description: "You are now copying this trader." });
    },
    onError: () => toast({ title: "Error", description: "Could not start copy.", variant: "destructive" }),
  });

  const stopCopyMutation = useMutation({
    mutationFn: async (relId: number) => {
      const res = await apiRequest("DELETE", `/api/copy/relationships/${relId}`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/copy/relationships"] });
      toast({ title: "Copy stopped" });
    },
  });

  const updateCopyMutation = useMutation({
    mutationFn: async ({ relId, maxLotSize, accountType }: { relId: number; maxLotSize: number; accountType: string }) => {
      const res = await apiRequest("PATCH", `/api/copy/relationships/${relId}`, { maxLotSize, accountType });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/copy/relationships"] });
      setEditingRelId(null);
      toast({ title: "Settings updated" });
    },
  });

  const activeRels = (relationships as any[]).filter((r: any) => r.is_active);
  const activeRelIds = new Set(activeRels.map((r: any) => r.source_user_id));
  const openCopyTrades = (copyTrades as any[]).filter((t: any) => t.status === "open");
  const closedCopyTrades = (copyTrades as any[]).filter((t: any) => t.status === "closed");
  const totalCopyPnl = closedCopyTrades.reduce((s: number, t: any) => s + (parseFloat(t.pnl) || 0), 0);
  const totalPips = closedCopyTrades.reduce((s: number, t: any) => s + (parseFloat(t.pnl_pips) || 0), 0);
  const wins = closedCopyTrades.filter((t: any) => (parseFloat(t.pnl) || 0) > 0).length;
  const myWinRate = closedCopyTrades.length > 0 ? Math.round((wins / closedCopyTrades.length) * 100) : 0;

  const filteredTrades = (copyTrades as any[]).filter((t: any) => {
    if (logFilter === "open") return t.status === "open";
    if (logFilter === "closed") return t.status === "closed";
    return true;
  });

  // P&L per source trader
  const pnlByTrader: Record<number, number> = {};
  for (const t of closedCopyTrades) {
    pnlByTrader[t.source_user_id] = (pnlByTrader[t.source_user_id] || 0) + (parseFloat(t.pnl) || 0);
  }

  const lastUpdated = tradesUpdated ? new Date(tradesUpdated).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "—";

  return (
    <div style={{ minHeight: "100vh", background: "#050508", color: "#e5e7eb", paddingBottom: 80 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px" }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <Link href="/dashboard">
            <button style={{ padding: 8, borderRadius: 8, background: "transparent", border: "none", color: "#6b7280", cursor: "pointer" }}>
              <ArrowLeft size={16} />
            </button>
          </Link>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#fff", display: "flex", alignItems: "center", gap: 10 }}>
              <Copy size={20} color="#a855f7" /> Copy Trading
            </h1>
            <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>Mirror top traders' AI signals · auto-refreshes every 10s</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, color: "#4b5563" }}>Updated {lastUpdated}</span>
            <button
              onClick={() => refetchTrades()}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #1f2937", background: "#0f1420", color: "#9ca3af", cursor: "pointer", display: "flex", alignItems: "center", gap: 5, fontSize: 12 }}
            >
              <RefreshCw size={12} className={tradesFetching ? "animate-spin" : ""} /> Refresh
            </button>
          </div>
        </div>

        {/* Stats bar — always visible */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Copying", value: activeRels.length, color: "#a855f7", icon: <Users size={14} /> },
            { label: "Open Trades", value: openCopyTrades.length, color: "#f59e0b", icon: <Zap size={14} /> },
            { label: "Closed", value: closedCopyTrades.length, color: "#6b7280", icon: <BarChart2 size={14} /> },
            { label: "My Win Rate", value: closedCopyTrades.length > 0 ? `${myWinRate}%` : "—", color: winRateColor(myWinRate), icon: <Target size={14} /> },
            { label: "Total Pips", value: closedCopyTrades.length > 0 ? fmt(totalPips, 1) : "—", color: pnlColor(totalPips), icon: <TrendingUp size={14} /> },
            { label: "Total P&L", value: closedCopyTrades.length > 0 ? `${fmt(totalCopyPnl)}` : "—", color: pnlColor(totalCopyPnl), icon: <Activity size={14} /> },
          ].map(s => (
            <div key={s.label} style={{ background: "#0f1420", border: "1px solid #1a1f2e", borderRadius: 10, padding: "12px 14px" }}>
              <div style={{ color: s.color, marginBottom: 4 }}>{s.icon}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: "#6b7280", marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Live open trades — prominent panel */}
        {openCopyTrades.length > 0 && (
          <div style={{ background: "#0f1420", border: "1px solid #f59e0b44", borderRadius: 14, marginBottom: 20, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid #1a1f2e", background: "#f59e0b0a" }}>
              <Zap size={15} color="#f59e0b" />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b" }}>Live Open Trades</span>
              <span style={{ fontSize: 11, color: "#6b7280", marginLeft: "auto" }}>{openCopyTrades.length} position{openCopyTrades.length !== 1 ? "s" : ""} · refreshes every 10s</span>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ color: "#6b7280", fontSize: 10 }}>
                    {["Pair", "Dir", "Lot", "Entry", "SL", "TP", "Trader", "Open", "Duration"].map(h => (
                      <th key={h} style={{ padding: "8px 12px", textAlign: h === "Entry" || h === "SL" || h === "TP" ? "right" : "left", fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {openCopyTrades.map((t: any) => (
                    <tr key={t.id} style={{ borderTop: "1px solid #1a1f2e" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>{t.pair}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: t.direction === "BUY" ? "#065f4622" : "#7f1d1d22", color: t.direction === "BUY" ? "#10b981" : "#ef4444", border: `1px solid ${t.direction === "BUY" ? "#10b98133" : "#ef444433"}` }}>
                          {t.direction}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#d1d5db" }}>{parseFloat(t.lot_size || t.lotSize || 0.01).toFixed(2)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#d1d5db", fontFamily: "monospace" }}>{parseFloat(t.entry_price || t.entryPrice || 0).toFixed(5)}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#ef4444", fontFamily: "monospace" }}>{t.stop_loss || t.stopLoss ? parseFloat(t.stop_loss || t.stopLoss).toFixed(5) : "—"}</td>
                      <td style={{ padding: "10px 12px", textAlign: "right", color: "#10b981", fontFamily: "monospace" }}>{t.take_profit || t.takeProfit ? parseFloat(t.take_profit || t.takeProfit).toFixed(5) : "—"}</td>
                      <td style={{ padding: "10px 12px", color: "#9ca3af" }}>{t.source_username}</td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 11 }}>{new Date(t.opened_at || t.openedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: "#f59e0b22", color: "#f59e0b", fontWeight: 700 }}>
                          <Clock size={9} style={{ display: "inline", marginRight: 3 }} />
                          {duration(t.opened_at || t.openedAt)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Leaderboard */}
            <div style={{ background: "#0f1420", border: "1px solid #1a1f2e", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid #1a1f2e" }}>
                <Trophy size={16} color="#f59e0b" />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Trader Leaderboard</span>
                <span style={{ fontSize: 10, color: "#4b5563", marginLeft: "auto" }}>
                  Updated {lbUpdated ? relativeTime(new Date(lbUpdated).toISOString()) : "—"}
                </span>
              </div>

              {lbLoading ? (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 0", color: "#6b7280" }}>
                  <Loader2 size={16} style={{ marginRight: 8 }} className="animate-spin" /> Loading…
                </div>
              ) : leaderboard.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <Users size={32} color="#1f2937" style={{ margin: "0 auto 10px" }} />
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>No traders on the leaderboard yet.</p>
                  <p style={{ margin: "6px 0 0", color: "#4b5563", fontSize: 11 }}>Enable paper trading on the AI SS Engine page and complete some trades.</p>
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "#6b7280", fontSize: 10, borderBottom: "1px solid #1a1f2e" }}>
                        {["#", "Trader", "Win Rate", "Trades", "Open", "Avg P&L", "Best", "Total P&L", "Last Active", ""].map(h => (
                          <th key={h} style={{ padding: "8px 12px", textAlign: h === "#" || h === "Trader" || h === "" ? "left" : "right", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(leaderboard as any[]).map((trader: any, i: number) => {
                        const isMe = trader.user_id === user?.id;
                        const isCopying = activeRelIds.has(trader.user_id);
                        const wr = parseFloat(trader.win_rate ?? 0);
                        const pnl = parseFloat(trader.total_pnl ?? 0);
                        const avgPnl = parseFloat(trader.avg_pnl ?? 0);
                        const best = parseFloat(trader.best_trade ?? 0);
                        const openCount = parseInt(trader.open_trades ?? 0);
                        const isExpanded = copyingUserId === trader.user_id;
                        return (
                          <>
                            <tr key={trader.user_id} style={{ borderTop: "1px solid #1a1f2e11", background: isMe ? "#1a0f2e22" : "transparent" }}>
                              <td style={{ padding: "10px 12px", color: "#4b5563", fontFamily: "monospace", fontSize: 11 }}>{i + 1}</td>
                              <td style={{ padding: "10px 12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#a855f7,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                    {trader.username?.[0]?.toUpperCase() ?? "?"}
                                  </div>
                                  <span style={{ fontWeight: 700, color: "#fff" }}>{trader.username}</span>
                                  {isMe && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 6, background: "#a855f722", color: "#a855f7", fontWeight: 700 }}>YOU</span>}
                                </div>
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                <span style={{ fontWeight: 700, color: winRateColor(wr) }}>{wr}%</span>
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: "#9ca3af" }}>{trader.total_trades}</td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                {openCount > 0 ? (
                                  <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 8, background: "#f59e0b22", color: "#f59e0b", fontWeight: 700 }}>
                                    {openCount} live
                                  </span>
                                ) : <span style={{ color: "#374151" }}>—</span>}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600, color: pnlColor(avgPnl) }}>
                                {fmt(avgPnl)}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", color: "#10b981", fontSize: 11 }}>
                                {best > 0 ? `+$${best.toFixed(2)}` : "—"}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: pnlColor(pnl) }}>
                                {fmt(pnl)}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right", fontSize: 11, color: "#6b7280" }}>
                                {trader.last_trade_at ? relativeTime(trader.last_trade_at) : "—"}
                              </td>
                              <td style={{ padding: "10px 12px", textAlign: "right" }}>
                                {isMe ? (
                                  <span style={{ fontSize: 10, color: "#374151" }}>—</span>
                                ) : isCopying ? (
                                  <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 8, background: "#065f4622", color: "#10b981", fontWeight: 700, border: "1px solid #10b98133" }}>
                                    ✓ Copying
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => { setCopyingUserId(isExpanded ? null : trader.user_id); setNewMaxLot("0.01"); setNewAccountType("paper"); }}
                                    style={{ padding: "4px 12px", borderRadius: 8, background: "#a855f7", border: "none", color: "#fff", fontWeight: 700, fontSize: 11, cursor: "pointer" }}
                                  >
                                    <Copy size={10} style={{ display: "inline", marginRight: 4 }} />Copy
                                  </button>
                                )}
                              </td>
                            </tr>
                            {isExpanded && !isCopying && (
                              <tr key={`${trader.user_id}-expand`} style={{ background: "#1a0f2e22", borderTop: "1px solid #1a1f2e" }}>
                                <td colSpan={10} style={{ padding: "14px 16px" }}>
                                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
                                    <div>
                                      <label style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 4 }}>Max Lot Size</label>
                                      <Input type="number" value={newMaxLot} onChange={e => setNewMaxLot(e.target.value)}
                                        className="bg-gray-800 border-gray-700 text-white h-8 w-28 text-sm" step="0.01" min="0.01" />
                                    </div>
                                    <div>
                                      <label style={{ fontSize: 11, color: "#9ca3af", display: "block", marginBottom: 4 }}>Account Type</label>
                                      <select value={newAccountType} onChange={e => setNewAccountType(e.target.value)}
                                        style={{ background: "#1f2937", border: "1px solid #374151", color: "#fff", height: 32, padding: "0 8px", fontSize: 13, borderRadius: 6 }}>
                                        <option value="paper">Paper</option>
                                        <option value="real">Real</option>
                                      </select>
                                    </div>
                                    <Button size="sm" onClick={() => startCopyMutation.mutate({ sourceUserId: trader.user_id, accountType: newAccountType, maxLotSize: parseFloat(newMaxLot) || 0.01 })}
                                      disabled={startCopyMutation.isPending} className="h-8 bg-purple-600 hover:bg-purple-700">
                                      {startCopyMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : "Confirm Copy"}
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setCopyingUserId(null)} className="h-8 text-gray-400">Cancel</Button>
                                  </div>
                                  <p style={{ margin: "8px 0 0", fontSize: 11, color: "#4b5563" }}>
                                    Trades will mirror to your {newAccountType} account at ≤{newMaxLot} lots. Stop anytime.
                                  </p>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Trade log */}
            <div style={{ background: "#0f1420", border: "1px solid #1a1f2e", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 16px", borderBottom: "1px solid #1a1f2e", flexWrap: "wrap" }}>
                <Activity size={15} color="#60a5fa" />
                <span style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Mirrored Trade Log</span>
                <span style={{ fontSize: 10, color: "#4b5563" }}>{copyTrades.length} total</span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  {(["all", "open", "closed"] as const).map(f => (
                    <button key={f} onClick={() => setLogFilter(f)} style={{ padding: "3px 10px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, background: logFilter === f ? "#a855f7" : "#1a1f2e", color: logFilter === f ? "#fff" : "#6b7280" }}>
                      {f} {f === "open" ? `(${openCopyTrades.length})` : f === "closed" ? `(${closedCopyTrades.length})` : `(${copyTrades.length})`}
                    </button>
                  ))}
                </div>
              </div>

              {filteredTrades.length === 0 ? (
                <div style={{ padding: "40px 20px", textAlign: "center" }}>
                  <Activity size={32} color="#1f2937" style={{ margin: "0 auto 10px" }} />
                  <p style={{ margin: 0, color: "#6b7280", fontSize: 13 }}>No {logFilter !== "all" ? logFilter + " " : ""}trades yet.</p>
                  {copyTrades.length === 0 && <p style={{ margin: "6px 0 0", color: "#4b5563", fontSize: 11 }}>Start copying a trader from the leaderboard above.</p>}
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", fontSize: 11, borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ color: "#6b7280", fontSize: 10, borderBottom: "1px solid #1a1f2e" }}>
                        {["Pair", "Dir", "Lot", "Entry", "Exit/SL/TP", "P&L $", "Pips", "Trader", "Status", "Opened", "Duration"].map(h => (
                          <th key={h} style={{ padding: "7px 10px", textAlign: ["P&L $", "Pips", "Entry", "Exit/SL/TP"].includes(h) ? "right" : "left", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTrades.slice(0, 100).map((t: any) => {
                        const pnl = parseFloat(t.pnl) || 0;
                        const pips = parseFloat(t.pnl_pips || t.pnlPips) || 0;
                        const entry = parseFloat(t.entry_price || t.entryPrice || 0);
                        const exit = parseFloat(t.exit_price || t.exitPrice || 0);
                        const sl = parseFloat(t.stop_loss || t.stopLoss || 0);
                        const tp = parseFloat(t.take_profit || t.takeProfit || 0);
                        const openedAt = t.opened_at || t.openedAt;
                        const closedAt = t.closed_at || t.closedAt;
                        return (
                          <tr key={t.id} style={{ borderTop: "1px solid #1a1f2e44" }}>
                            <td style={{ padding: "8px 10px", fontWeight: 700, color: "#fff", fontFamily: "monospace" }}>{t.pair}</td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ fontWeight: 700, color: t.direction === "BUY" ? "#10b981" : "#ef4444" }}>{t.direction}</span>
                            </td>
                            <td style={{ padding: "8px 10px", color: "#9ca3af" }}>{parseFloat(t.lot_size || t.lotSize || 0.01).toFixed(2)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: "#d1d5db", fontFamily: "monospace" }}>{entry.toFixed(5)}</td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontFamily: "monospace", fontSize: 10 }}>
                              {t.status === "closed" && exit > 0 ? (
                                <span style={{ color: "#9ca3af" }}>{exit.toFixed(5)}</span>
                              ) : (
                                <span style={{ color: "#6b7280" }}>
                                  {sl > 0 ? <span style={{ color: "#ef444488" }}>SL {sl.toFixed(4)}</span> : null}
                                  {sl > 0 && tp > 0 ? " / " : null}
                                  {tp > 0 ? <span style={{ color: "#10b98188" }}>TP {tp.toFixed(4)}</span> : null}
                                  {sl === 0 && tp === 0 ? "—" : null}
                                </span>
                              )}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: t.status === "open" ? "#6b7280" : pnlColor(pnl) }}>
                              {t.status === "open" ? "live" : fmt(pnl)}
                            </td>
                            <td style={{ padding: "8px 10px", textAlign: "right", color: t.status === "open" ? "#6b7280" : pnlColor(pips) }}>
                              {t.status === "open" ? "—" : pips !== 0 ? fmt(pips, 1) : "—"}
                            </td>
                            <td style={{ padding: "8px 10px", color: "#6b7280" }}>{t.source_username}</td>
                            <td style={{ padding: "8px 10px" }}>
                              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, fontWeight: 700, background: t.status === "open" ? "#f59e0b22" : pnl > 0 ? "#10b98122" : pnl < 0 ? "#ef444422" : "#1a1f2e", color: t.status === "open" ? "#f59e0b" : pnl > 0 ? "#10b981" : pnl < 0 ? "#ef4444" : "#6b7280" }}>
                                {t.status === "open" ? "LIVE" : pnl > 0 ? "WIN" : pnl < 0 ? "LOSS" : "CLOSED"}
                              </span>
                            </td>
                            <td style={{ padding: "8px 10px", color: "#4b5563", fontSize: 10, whiteSpace: "nowrap" }}>
                              {new Date(openedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                            </td>
                            <td style={{ padding: "8px 10px", fontSize: 10, color: "#6b7280" }}>
                              {t.status === "open" ? (
                                <span style={{ color: "#f59e0b" }}>{duration(openedAt)}</span>
                              ) : closedAt ? (
                                (() => {
                                  const ms = new Date(closedAt).getTime() - new Date(openedAt).getTime();
                                  const m = Math.floor(ms / 60000);
                                  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`;
                                })()
                              ) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>

          {/* Right sidebar */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* My subscriptions */}
            <div style={{ background: "#0f1420", border: "1px solid #1a1f2e", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", borderBottom: "1px solid #1a1f2e" }}>
                <Settings size={13} color="#a855f7" />
                <span style={{ fontSize: 13, fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.5px" }}>My Subscriptions</span>
              </div>
              {activeRels.length === 0 ? (
                <div style={{ padding: "24px 14px", textAlign: "center" }}>
                  <Copy size={24} color="#1f2937" style={{ margin: "0 auto 8px" }} />
                  <p style={{ margin: 0, fontSize: 12, color: "#4b5563" }}>No active copies yet.</p>
                  <p style={{ margin: "4px 0 0", fontSize: 11, color: "#374151" }}>Pick a trader from the leaderboard.</p>
                </div>
              ) : (
                <div>
                  {activeRels.map((rel: any) => {
                    const traderPnl = pnlByTrader[rel.source_user_id] || 0;
                    const traderTrades = closedCopyTrades.filter((t: any) => t.source_user_id === rel.source_user_id);
                    const traderOpen = openCopyTrades.filter((t: any) => t.source_user_id === rel.source_user_id);
                    return (
                      <div key={rel.id} style={{ padding: "12px 14px", borderTop: "1px solid #1a1f2e" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#a855f7,#3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {rel.source_username?.[0]?.toUpperCase() ?? "?"}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{rel.source_username}</div>
                            <div style={{ fontSize: 10, color: "#6b7280" }}>
                              {rel.account_type} · max {rel.max_lot_size} lots
                            </div>
                          </div>
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginBottom: 10 }}>
                          <div style={{ background: "#080b14", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: pnlColor(traderPnl) }}>{traderPnl >= 0 ? "+" : ""}${traderPnl.toFixed(2)}</div>
                            <div style={{ fontSize: 9, color: "#4b5563" }}>My P&L</div>
                          </div>
                          <div style={{ background: "#080b14", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "#d1d5db" }}>{traderTrades.length}</div>
                            <div style={{ fontSize: 9, color: "#4b5563" }}>Closed</div>
                          </div>
                          <div style={{ background: "#080b14", borderRadius: 8, padding: "6px 8px", textAlign: "center" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: traderOpen.length > 0 ? "#f59e0b" : "#374151" }}>{traderOpen.length}</div>
                            <div style={{ fontSize: 9, color: "#4b5563" }}>Live</div>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          {editingRelId === rel.id ? (
                            <>
                              <Input type="number" value={editMaxLot} onChange={e => setEditMaxLot(e.target.value)}
                                className="bg-gray-800 border-gray-700 text-white h-7 text-xs" style={{ flex: 1 }} step="0.01" min="0.01" />
                              <select value={editAccountType} onChange={e => setEditAccountType(e.target.value)}
                                style={{ background: "#1f2937", border: "1px solid #374151", color: "#fff", height: 28, padding: "0 6px", fontSize: 11, borderRadius: 6 }}>
                                <option value="paper">Paper</option>
                                <option value="real">Real</option>
                              </select>
                              <Button size="sm" onClick={() => updateCopyMutation.mutate({ relId: rel.id, maxLotSize: parseFloat(editMaxLot) || 0.01, accountType: editAccountType })}
                                disabled={updateCopyMutation.isPending} className="h-7 px-2 text-xs bg-emerald-700 hover:bg-emerald-600">
                                {updateCopyMutation.isPending ? <Loader2 size={10} className="animate-spin" /> : "Save"}
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditingRelId(null)} className="h-7 px-1.5 text-xs text-gray-500">✕</Button>
                            </>
                          ) : (
                            <>
                              <button onClick={() => { setEditingRelId(rel.id); setEditMaxLot(String(rel.max_lot_size)); setEditAccountType(rel.account_type); }}
                                style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid #1f2937", background: "transparent", color: "#9ca3af", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                <Settings size={10} /> Edit
                              </button>
                              <button onClick={() => stopCopyMutation.mutate(rel.id)} disabled={stopCopyMutation.isPending}
                                style={{ flex: 1, padding: "5px 0", borderRadius: 7, border: "1px solid #7f1d1d44", background: "transparent", color: "#ef4444", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                                <XCircle size={10} /> Stop
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* How it works */}
            <div style={{ background: "#0f1420", border: "1px solid #1a1f2e", borderRadius: 14, padding: 16 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.5px" }}>How Copy Trading Works</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { icon: <Trophy size={12} />, color: "#f59e0b", text: "Pick a trader from the leaderboard — see their win rate, avg P&L, and best trade" },
                  { icon: <Copy size={12} />, color: "#a855f7", text: "Set your max lot size and account type, then click Confirm Copy" },
                  { icon: <Zap size={12} />, color: "#10b981", text: "When they get an AI signal, the same trade fires on your account automatically" },
                  { icon: <Activity size={12} />, color: "#60a5fa", text: "Track all mirrored trades live — open positions refresh every 10 seconds" },
                ].map((s, i) => (
                  <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: s.color + "22", display: "flex", alignItems: "center", justifyContent: "center", color: s.color, flexShrink: 0 }}>
                      {s.icon}
                    </div>
                    <p style={{ margin: 0, fontSize: 11, color: "#9ca3af", lineHeight: 1.5 }}>{s.text}</p>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
