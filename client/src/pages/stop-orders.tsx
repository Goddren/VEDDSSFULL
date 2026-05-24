import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Target, TrendingUp, TrendingDown, Plus, Trash2, Clock,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, Info, Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// ── Types ─────────────────────────────────────────────────────────────────────
interface StopOrder {
  id: number;
  userId: number;
  symbol: string;
  direction: "BUY_STOP" | "SELL_STOP";
  triggerPrice: number;
  lotSize: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  status: "PENDING" | "TRIGGERED" | "CANCELLED";
  breakoutLevel?: number | null;
  notes?: string | null;
  triggeredAt?: string | null;
  cancelledAt?: string | null;
  createdAt: string;
}

// ── Status helpers ─────────────────────────────────────────────────────────────
const STATUS_META = {
  PENDING:   { label: "Pending",   icon: Clock,         color: "text-amber-400  bg-amber-500/10  border-amber-500/30"  },
  TRIGGERED: { label: "Triggered", icon: CheckCircle2,  color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30" },
  CANCELLED: { label: "Cancelled", icon: XCircle,       color: "text-gray-500   bg-gray-500/10   border-gray-700/30"   },
} as const;

// ── Filter tabs ───────────────────────────────────────────────────────────────
const FILTERS = ["ALL", "PENDING", "TRIGGERED", "CANCELLED"] as const;
type Filter = typeof FILTERS[number];

// ─────────────────────────────────────────────────────────────────────────────
export default function StopOrdersPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  // ── Filter state
  const [activeFilter, setActiveFilter] = useState<Filter>("ALL");
  const [showForm, setShowForm] = useState(false);

  // ── Form state
  const [form, setForm] = useState({
    symbol:        "EURUSD",
    direction:     "BUY_STOP" as "BUY_STOP" | "SELL_STOP",
    triggerPrice:  "",
    lotSize:       "0.01",
    stopLoss:      "",
    takeProfit:    "",
    breakoutLevel: "",
    notes:         "",
    currentPrice:  "",
  });

  // ── Queries
  const { data: orders = [], isLoading } = useQuery<StopOrder[]>({
    queryKey: ["/api/stop-orders"],
    queryFn: () => apiRequest("GET", "/api/stop-orders").then(r => r.json()),
    refetchInterval: 15_000, // re-poll every 15s so triggered orders surface quickly
  });

  // ── Mutations
  const createMutation = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/stop-orders", body).then(r => r.json()),
    onSuccess: (d: any) => {
      if (d?.error) {
        toast({ title: `Error: ${d.error}`, variant: "destructive" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["/api/stop-orders"] });
      setShowForm(false);
      setForm({ symbol: "EURUSD", direction: "BUY_STOP", triggerPrice: "", lotSize: "0.01", stopLoss: "", takeProfit: "", breakoutLevel: "", notes: "", currentPrice: "" });
      toast({ title: "✅ Stop order placed" });
    },
    onError: (err: any) => toast({ title: `Error: ${err.message}`, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/stop-orders/${id}`).then(r => r.json()),
    onSuccess: (d: any) => {
      if (d?.error) { toast({ title: `Error: ${d.error}`, variant: "destructive" }); return; }
      qc.invalidateQueries({ queryKey: ["/api/stop-orders"] });
      toast({ title: "Order cancelled" });
    },
    onError: (err: any) => toast({ title: `Error: ${err.message}`, variant: "destructive" }),
  });

  // ── Derived
  const filtered = useMemo(
    () => activeFilter === "ALL" ? orders : orders.filter(o => o.status === activeFilter),
    [orders, activeFilter],
  );

  const counts = useMemo(() => ({
    ALL:       orders.length,
    PENDING:   orders.filter(o => o.status === "PENDING").length,
    TRIGGERED: orders.filter(o => o.status === "TRIGGERED").length,
    CANCELLED: orders.filter(o => o.status === "CANCELLED").length,
  }), [orders]);

  // ── Submit
  function handleSubmit() {
    if (!form.triggerPrice || !form.lotSize || !form.symbol) {
      toast({ title: "Symbol, trigger price and lot size are required", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      symbol:        form.symbol.toUpperCase().replace("/", ""),
      direction:     form.direction,
      triggerPrice:  parseFloat(form.triggerPrice),
      lotSize:       parseFloat(form.lotSize),
      stopLoss:      form.stopLoss      ? parseFloat(form.stopLoss)      : undefined,
      takeProfit:    form.takeProfit    ? parseFloat(form.takeProfit)    : undefined,
      breakoutLevel: form.breakoutLevel ? parseFloat(form.breakoutLevel) : undefined,
      notes:         form.notes         || undefined,
      currentPrice:  form.currentPrice  ? parseFloat(form.currentPrice)  : undefined,
    });
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 pb-24">
      <div className="max-w-2xl mx-auto pt-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-400" />
              Stop Orders
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Breakout pending orders — auto-triggered when price crosses your level
            </p>
          </div>
          <Button
            size="sm"
            className="h-8 text-xs bg-amber-600 hover:bg-amber-500 font-semibold"
            onClick={() => setShowForm(f => !f)}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            New Order
          </Button>
        </div>

        {/* How it works */}
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/8 border border-blue-500/20">
          <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div className="text-[11px] text-gray-300 leading-relaxed">
            <span className="font-semibold text-blue-300">BUY STOP</span> — set a trigger <span className="font-semibold">above</span> current price (breakout buy).{" "}
            <span className="font-semibold text-rose-300">SELL STOP</span> — set a trigger <span className="font-semibold">below</span> current price (breakdown sell).
            Orders fire automatically when your MT5 EA sends a price tick that crosses the level.
          </div>
        </div>

        {/* ── Create form ── */}
        {showForm && (
          <div className="bg-gray-900/60 border border-amber-500/25 rounded-2xl p-4 space-y-4">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-4 h-4 text-amber-400" />
              <p className="font-semibold text-sm text-gray-200">New Stop Order</p>
            </div>

            {/* Direction selector */}
            <div className="grid grid-cols-2 gap-2">
              {(["BUY_STOP", "SELL_STOP"] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setForm(f => ({ ...f, direction: d }))}
                  className={`flex items-center justify-center gap-2 p-3 rounded-xl border font-bold text-sm transition-all ${
                    form.direction === d
                      ? d === "BUY_STOP"
                        ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300"
                        : "border-rose-500/60 bg-rose-500/15 text-rose-300"
                      : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  {d === "BUY_STOP"
                    ? <TrendingUp className="w-4 h-4" />
                    : <TrendingDown className="w-4 h-4" />}
                  {d === "BUY_STOP" ? "BUY STOP" : "SELL STOP"}
                </button>
              ))}
            </div>

            {/* Symbol + trigger */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Symbol</label>
                <Input
                  value={form.symbol}
                  onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                  placeholder="EURUSD"
                  className="bg-gray-800 border-gray-600 text-white h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">
                  Trigger Price
                  <span className="ml-1 text-gray-600">
                    ({form.direction === "BUY_STOP" ? "above current" : "below current"})
                  </span>
                </label>
                <Input
                  value={form.triggerPrice}
                  onChange={e => setForm(f => ({ ...f, triggerPrice: e.target.value }))}
                  type="number" step="any"
                  placeholder={form.direction === "BUY_STOP" ? "e.g. 1.0920" : "e.g. 1.0800"}
                  className="bg-gray-800 border-gray-600 text-white h-9 text-sm"
                />
              </div>
            </div>

            {/* Lot size + current price (for validation) */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Lot Size</label>
                <Input
                  value={form.lotSize}
                  onChange={e => setForm(f => ({ ...f, lotSize: e.target.value }))}
                  type="number" step="0.01" min="0.01"
                  placeholder="0.01"
                  className="bg-gray-800 border-gray-600 text-white h-9 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">
                  Current Price <span className="text-gray-600">(for validation)</span>
                </label>
                <Input
                  value={form.currentPrice}
                  onChange={e => setForm(f => ({ ...f, currentPrice: e.target.value }))}
                  type="number" step="any"
                  placeholder="Optional — e.g. 1.0865"
                  className="bg-gray-800 border-gray-600 text-white h-9 text-sm"
                />
              </div>
            </div>

            {/* SL / TP / Breakout level */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Stop Loss</label>
                <Input
                  value={form.stopLoss}
                  onChange={e => setForm(f => ({ ...f, stopLoss: e.target.value }))}
                  type="number" step="any"
                  placeholder="Optional"
                  className="bg-gray-800 border-gray-600 text-white h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Take Profit</label>
                <Input
                  value={form.takeProfit}
                  onChange={e => setForm(f => ({ ...f, takeProfit: e.target.value }))}
                  type="number" step="any"
                  placeholder="Optional"
                  className="bg-gray-800 border-gray-600 text-white h-8 text-xs"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-400 block mb-1">Breakout Level</label>
                <Input
                  value={form.breakoutLevel}
                  onChange={e => setForm(f => ({ ...f, breakoutLevel: e.target.value }))}
                  type="number" step="any"
                  placeholder="Key level"
                  className="bg-gray-800 border-gray-600 text-white h-8 text-xs"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-[10px] text-gray-400 block mb-1">Notes (optional)</label>
              <Input
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. Resistance breakout at Asian session high"
                className="bg-gray-800 border-gray-600 text-white h-8 text-xs"
              />
            </div>

            <div className="flex gap-2">
              <Button
                className="flex-1 h-9 bg-amber-600 hover:bg-amber-500 font-bold text-sm"
                onClick={handleSubmit}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? "Placing..." : "Place Stop Order"}
              </Button>
              <Button
                variant="outline"
                className="h-9 border-gray-600 text-gray-400"
                onClick={() => setShowForm(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* ── Stats strip ── */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "All",       count: counts.ALL,       color: "text-gray-300" },
            { label: "Pending",   count: counts.PENDING,   color: "text-amber-400" },
            { label: "Triggered", count: counts.TRIGGERED, color: "text-emerald-400" },
            { label: "Cancelled", count: counts.CANCELLED, color: "text-gray-500" },
          ].map(s => (
            <div key={s.label} className="bg-gray-900/50 border border-gray-700/40 rounded-xl p-2.5 text-center">
              <p className="text-[9px] text-gray-500">{s.label}</p>
              <p className={`text-lg font-black ${s.color}`}>{s.count}</p>
            </div>
          ))}
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5">
          {FILTERS.map(f => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                activeFilter === f
                  ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                  : "bg-gray-800/50 border-gray-700/40 text-gray-400 hover:border-gray-500"
              }`}
            >
              {f} {counts[f] > 0 && <span className="ml-1 opacity-70">({counts[f]})</span>}
            </button>
          ))}
        </div>

        {/* ── Orders list ── */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500 text-sm">Loading orders…</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <Target className="w-10 h-10 mx-auto mb-3 text-gray-700" />
            <p className="text-sm text-gray-500 font-semibold">No {activeFilter !== "ALL" ? activeFilter.toLowerCase() : ""} orders</p>
            <p className="text-[11px] text-gray-600 mt-1 max-w-xs mx-auto">
              Place a stop order above (BUY STOP) or below (SELL STOP) the current price — it fires automatically when your MT5 EA sends a matching tick.
            </p>
            <Button
              size="sm"
              className="mt-4 h-8 text-xs bg-amber-600 hover:bg-amber-500"
              onClick={() => setShowForm(true)}
            >
              <Plus className="w-3.5 h-3.5 mr-1" /> Place First Order
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(order => {
              const meta = STATUS_META[order.status];
              const StatusIcon = meta.icon;
              const isBuy = order.direction === "BUY_STOP";

              return (
                <div
                  key={order.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    order.status === "PENDING"
                      ? "border-amber-500/25 bg-gray-900/60"
                      : order.status === "TRIGGERED"
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-gray-700/30 bg-gray-900/30 opacity-60"
                  }`}
                >
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                        isBuy ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                      }`}>
                        {isBuy ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                      </div>
                      <div>
                        <p className="text-sm font-black text-white">{order.symbol}</p>
                        <p className={`text-[11px] font-bold ${isBuy ? "text-emerald-400" : "text-rose-400"}`}>
                          {isBuy ? "BUY STOP" : "SELL STOP"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border flex items-center gap-1 ${meta.color}`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        {meta.label}
                      </span>
                      {order.status === "PENDING" && (
                        <button
                          onClick={() => cancelMutation.mutate(order.id)}
                          disabled={cancelMutation.isPending}
                          className="text-gray-600 hover:text-red-400 transition-colors"
                          title="Cancel order"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Price grid */}
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-500 mb-0.5">Trigger</p>
                      <p className="text-sm font-black text-amber-300">{order.triggerPrice}</p>
                    </div>
                    <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                      <p className="text-[9px] text-gray-500 mb-0.5">Lot Size</p>
                      <p className="text-sm font-bold text-gray-200">{order.lotSize}</p>
                    </div>
                    {order.breakoutLevel != null ? (
                      <div className="bg-gray-800/50 rounded-lg p-2 text-center">
                        <p className="text-[9px] text-gray-500 mb-0.5">Level</p>
                        <p className="text-sm font-bold text-blue-300">{order.breakoutLevel}</p>
                      </div>
                    ) : (
                      <div className="bg-gray-800/50 rounded-lg p-2 text-center opacity-40">
                        <p className="text-[9px] text-gray-500 mb-0.5">Level</p>
                        <p className="text-sm font-bold text-gray-500">—</p>
                      </div>
                    )}
                  </div>

                  {/* SL / TP row */}
                  {(order.stopLoss || order.takeProfit) && (
                    <div className="flex gap-2 mb-2">
                      {order.stopLoss != null && (
                        <span className="text-[10px] bg-red-500/10 border border-red-500/20 text-red-300 px-2 py-0.5 rounded-full">
                          SL {order.stopLoss}
                        </span>
                      )}
                      {order.takeProfit != null && (
                        <span className="text-[10px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">
                          TP {order.takeProfit}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Notes */}
                  {order.notes && (
                    <p className="text-[10px] text-gray-500 italic mb-2">"{order.notes}"</p>
                  )}

                  {/* Footer timestamps */}
                  <div className="flex items-center justify-between text-[9px] text-gray-600">
                    <span>Created {new Date(order.createdAt).toLocaleDateString()}</span>
                    {order.triggeredAt && (
                      <span className="text-emerald-600">
                        Triggered {new Date(order.triggeredAt).toLocaleString()}
                      </span>
                    )}
                    {order.cancelledAt && (
                      <span>Cancelled {new Date(order.cancelledAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Disclaimer */}
        <p className="text-[10px] text-gray-600 text-center pb-2">
          Stop orders are pending alerts — execution depends on your broker connection via MT5 EA.
          Always confirm fills in your trading platform.
        </p>
      </div>
    </div>
  );
}
