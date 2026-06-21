import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Copy, Users, TrendingUp, TrendingDown, Trophy, Activity,
  CheckCircle, XCircle, Loader2, Settings, Trash2, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";

export default function CopyTradingPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [editingRelId, setEditingRelId] = useState<number | null>(null);
  const [editMaxLot, setEditMaxLot] = useState("0.01");
  const [editAccountType, setEditAccountType] = useState("paper");
  const [copyingUserId, setCopyingUserId] = useState<number | null>(null);
  const [newMaxLot, setNewMaxLot] = useState("0.01");
  const [newAccountType, setNewAccountType] = useState("paper");

  const { data: leaderboard = [], isLoading: lbLoading } = useQuery<any[]>({
    queryKey: ["/api/copy/leaderboard"],
    refetchInterval: 60000,
  });

  const { data: relationships = [], isLoading: relsLoading } = useQuery<any[]>({
    queryKey: ["/api/copy/relationships"],
  });

  const { data: copyTrades = [] } = useQuery<any[]>({
    queryKey: ["/api/copy/trades"],
    refetchInterval: 15000,
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

  const activeRelIds = new Set((relationships as any[]).filter((r: any) => r.is_active).map((r: any) => r.source_user_id));
  const openCopyTrades = (copyTrades as any[]).filter((t: any) => t.status === "open");
  const closedCopyTrades = (copyTrades as any[]).filter((t: any) => t.status === "closed");
  const totalCopyPnl = closedCopyTrades.reduce((s: number, t: any) => s + (t.pnl ?? 0), 0);

  return (
    <div className="min-h-screen bg-[#080B14] text-white">
      <div className="max-w-5xl mx-auto px-4 py-8 pb-24 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/dashboard">
            <button className="p-2 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors">
              <ArrowLeft className="w-4 h-4" />
            </button>
          </Link>
          <div>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <Copy className="w-6 h-6 text-purple-400" /> Copy Trading
            </h1>
            <p className="text-gray-400 text-sm">Mirror top traders' AI-generated signals to your paper account.</p>
          </div>
        </div>

        {/* Stats bar */}
        {(relationships as any[]).filter((r: any) => r.is_active).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "Copying", value: (relationships as any[]).filter((r: any) => r.is_active).length, color: "text-purple-400" },
              { label: "Open Trades", value: openCopyTrades.length, color: "text-yellow-400" },
              { label: "Closed", value: closedCopyTrades.length, color: "text-gray-300" },
              { label: "Total P&L", value: `${totalCopyPnl >= 0 ? "+" : ""}$${totalCopyPnl.toFixed(2)}`, color: totalCopyPnl >= 0 ? "text-emerald-400" : "text-red-400" },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-gray-800 bg-[#0D1117] px-4 py-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* Leaderboard */}
        <div className="rounded-2xl border border-gray-800 bg-[#0D1117] overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
            <Trophy className="w-5 h-5 text-amber-400" />
            <h2 className="font-semibold text-white">Trader Leaderboard</h2>
            <p className="text-xs text-gray-500 ml-auto">Updated every minute · paper traders with ≥1 closed trade</p>
          </div>

          {lbLoading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading leaderboard…
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-8 h-8 mx-auto text-gray-700 mb-2" />
              <p className="text-gray-500 text-sm">No traders on the leaderboard yet.</p>
              <p className="text-gray-600 text-xs mt-1">Enable paper trading on the AI SS Engine page and complete some trades to appear here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-500 border-b border-gray-800">
                    <th className="text-left px-5 py-3">#</th>
                    <th className="text-left px-4 py-3">Trader</th>
                    <th className="text-right px-4 py-3">Win Rate</th>
                    <th className="text-right px-4 py-3">Trades</th>
                    <th className="text-right px-4 py-3">Total P&L</th>
                    <th className="text-center px-4 py-3">Type</th>
                    <th className="text-right px-5 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {leaderboard.map((trader: any, i: number) => {
                    const isMe = trader.user_id === user?.id;
                    const isCopying = activeRelIds.has(trader.user_id);
                    const winRate = parseFloat(trader.win_rate ?? 0);
                    const pnl = parseFloat(trader.total_pnl ?? 0);
                    const isExpandedCopy = copyingUserId === trader.user_id;
                    return (
                      <>
                        <tr key={trader.user_id} className={`hover:bg-gray-800/30 transition-colors ${isMe ? "bg-purple-900/10" : ""}`}>
                          <td className="px-5 py-3 text-gray-500 font-mono text-xs">{i + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                                {trader.username?.[0]?.toUpperCase() ?? "?"}
                              </div>
                              <span className="font-semibold text-white">{trader.username}</span>
                              {isMe && <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[9px]">YOU</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className={`font-bold ${winRate >= 60 ? "text-emerald-400" : winRate >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                              {winRate}%
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right text-gray-300">{trader.total_trades}</td>
                          <td className={`px-4 py-3 text-right font-bold ${pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            {pnl >= 0 ? "+" : ""}${pnl.toFixed(2)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px]">{trader.account_type}</Badge>
                          </td>
                          <td className="px-5 py-3 text-right">
                            {isMe ? (
                              <span className="text-xs text-gray-600">—</span>
                            ) : isCopying ? (
                              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                                <CheckCircle className="w-3 h-3 mr-1" /> Copying
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                onClick={() => { setCopyingUserId(isExpandedCopy ? null : trader.user_id); setNewMaxLot("0.01"); setNewAccountType("paper"); }}
                                className="h-7 px-3 text-xs bg-purple-600 hover:bg-purple-700"
                              >
                                <Copy className="w-3 h-3 mr-1" /> Copy
                              </Button>
                            )}
                          </td>
                        </tr>
                        {isExpandedCopy && !isCopying && (
                          <tr key={`${trader.user_id}-expand`} className="bg-purple-900/10">
                            <td colSpan={7} className="px-5 py-4">
                              <div className="flex flex-wrap gap-4 items-end">
                                <div>
                                  <Label className="text-xs text-gray-400 mb-1 block">Max Lot Size</Label>
                                  <Input
                                    type="number"
                                    value={newMaxLot}
                                    onChange={e => setNewMaxLot(e.target.value)}
                                    className="bg-gray-800 border-gray-700 text-white h-8 w-28 text-sm"
                                    step="0.01"
                                    min="0.01"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs text-gray-400 mb-1 block">Account Type</Label>
                                  <select
                                    value={newAccountType}
                                    onChange={e => setNewAccountType(e.target.value)}
                                    className="bg-gray-800 border border-gray-700 text-white h-8 px-2 text-sm rounded-md"
                                  >
                                    <option value="paper">Paper</option>
                                    <option value="real">Real</option>
                                  </select>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => startCopyMutation.mutate({ sourceUserId: trader.user_id, accountType: newAccountType, maxLotSize: parseFloat(newMaxLot) || 0.01 })}
                                  disabled={startCopyMutation.isPending}
                                  className="h-8 bg-purple-600 hover:bg-purple-700"
                                >
                                  {startCopyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Confirm Copy"}
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => setCopyingUserId(null)} className="h-8 text-gray-400">Cancel</Button>
                              </div>
                              <p className="text-xs text-gray-500 mt-2">Trades will be mirrored to your paper account at the max lot size above. You can stop anytime.</p>
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

        {/* My Copy Subscriptions */}
        {(relationships as any[]).filter((r: any) => r.is_active).length > 0 && (
          <div className="rounded-2xl border border-gray-800 bg-[#0D1117] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
              <Settings className="w-4 h-4 text-purple-400" />
              <h2 className="font-semibold text-white">My Copy Subscriptions</h2>
            </div>
            <div className="divide-y divide-gray-800/50">
              {(relationships as any[]).filter((r: any) => r.is_active).map((rel: any) => (
                <div key={rel.id} className="px-5 py-4">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-xs font-bold text-white">
                        {rel.source_username?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <div>
                        <p className="font-semibold text-white">{rel.source_username}</p>
                        <p className="text-xs text-gray-500">
                          Max lot: <span className="text-gray-300">{rel.max_lot_size}</span>
                          {" · "}
                          Type: <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[9px] ml-0.5">{rel.account_type}</Badge>
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {editingRelId === rel.id ? (
                        <>
                          <Input
                            type="number"
                            value={editMaxLot}
                            onChange={e => setEditMaxLot(e.target.value)}
                            className="bg-gray-800 border-gray-700 text-white h-7 w-20 text-xs"
                            step="0.01" min="0.01"
                          />
                          <select
                            value={editAccountType}
                            onChange={e => setEditAccountType(e.target.value)}
                            className="bg-gray-800 border border-gray-700 text-white h-7 px-1.5 text-xs rounded"
                          >
                            <option value="paper">Paper</option>
                            <option value="real">Real</option>
                          </select>
                          <Button size="sm" onClick={() => updateCopyMutation.mutate({ relId: rel.id, maxLotSize: parseFloat(editMaxLot) || 0.01, accountType: editAccountType })}
                            disabled={updateCopyMutation.isPending} className="h-7 px-2 text-xs bg-emerald-600 hover:bg-emerald-700">
                            {updateCopyMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : "Save"}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingRelId(null)} className="h-7 px-2 text-xs text-gray-400">Cancel</Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => { setEditingRelId(rel.id); setEditMaxLot(String(rel.max_lot_size)); setEditAccountType(rel.account_type); }}
                            className="h-7 px-2 text-xs text-gray-400 hover:text-white border border-gray-700">
                            <Settings className="w-3 h-3 mr-1" /> Edit
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => stopCopyMutation.mutate(rel.id)}
                            disabled={stopCopyMutation.isPending}
                            className="h-7 px-2 text-xs text-red-500 hover:text-red-400 border border-gray-700 hover:border-red-800">
                            <XCircle className="w-3 h-3 mr-1" /> Stop
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Mirrored Trade Log */}
        {copyTrades.length > 0 && (
          <div className="rounded-2xl border border-gray-800 bg-[#0D1117] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-800">
              <Activity className="w-4 h-4 text-blue-400" />
              <h2 className="font-semibold text-white">Mirrored Trade Log</h2>
              <Badge className="bg-gray-700 text-gray-400 border-gray-600 text-[10px] ml-auto">{copyTrades.length} trades</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-gray-500 border-b border-gray-800">
                    <th className="text-left px-5 py-2">Pair</th>
                    <th className="text-left px-4 py-2">Dir</th>
                    <th className="text-left px-4 py-2">Trader</th>
                    <th className="text-right px-4 py-2">Entry</th>
                    <th className="text-right px-4 py-2">Exit</th>
                    <th className="text-right px-4 py-2">P&L</th>
                    <th className="text-center px-4 py-2">Status</th>
                    <th className="text-right px-5 py-2">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/40">
                  {(copyTrades as any[]).slice(0, 60).map((t: any) => {
                    const pnl = t.pnl ?? 0;
                    return (
                      <tr key={t.id} className="hover:bg-gray-800/20">
                        <td className="px-5 py-2.5 font-mono font-bold text-white">{t.pair}</td>
                        <td className="px-4 py-2.5">
                          <span className={`font-bold ${t.direction === "BUY" ? "text-emerald-400" : "text-red-400"}`}>{t.direction}</span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{t.source_username}</td>
                        <td className="px-4 py-2.5 text-right text-gray-300">{t.entry_price?.toFixed(5)}</td>
                        <td className="px-4 py-2.5 text-right text-gray-300">{t.exit_price?.toFixed(5) ?? "—"}</td>
                        <td className={`px-4 py-2.5 text-right font-bold ${pnl > 0 ? "text-emerald-400" : pnl < 0 ? "text-red-400" : "text-gray-500"}`}>
                          {t.pnl != null ? `${pnl >= 0 ? "+" : ""}$${pnl.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${t.status === "open" ? "bg-yellow-500/20 text-yellow-300" : "bg-gray-700 text-gray-400"}`}>
                            {t.status}
                          </span>
                        </td>
                        <td className="px-5 py-2.5 text-right text-gray-600">
                          {new Date(t.opened_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state — no trades yet */}
        {copyTrades.length === 0 && (relationships as any[]).filter((r: any) => r.is_active).length === 0 && (
          <div className="rounded-2xl border border-gray-800 bg-[#0D1117] py-12 text-center">
            <Copy className="w-10 h-10 mx-auto text-gray-700 mb-3" />
            <p className="text-gray-400 font-semibold">Start copying a trader above</p>
            <p className="text-gray-600 text-sm mt-1 max-w-xs mx-auto">
              When a copied trader gets a signal from the AI engine, the trade is mirrored to your paper account.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}
