import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Eye, EyeOff, Trash2, CheckCircle2, XCircle } from "lucide-react";

export default function DxtradePage() {
  const { toast } = useToast();
  const [form, setForm] = useState({ host: "https://dx.velotrade.com", username: "", password: "", domain: "default", label: "" });
  const [showPw, setShowPw] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [order, setOrder] = useState({ instrument: "EUR/USD", side: "BUY" as "BUY" | "SELL", quantity: "", type: "MARKET" as "MARKET" | "LIMIT", limitPrice: "", stopLoss: "", takeProfit: "" });
  const [orderConnId, setOrderConnId] = useState<number | null>(null);
  const [orderConfirm, setOrderConfirm] = useState(false);

  const placeOrder = useMutation({
    mutationFn: async (connectionId: number) => {
      const r = await apiRequest("POST", "/api/dxtrade/order", {
        connectionId, instrument: order.instrument, side: order.side, quantity: Number(order.quantity),
        type: order.type, limitPrice: order.limitPrice || undefined, stopLoss: order.stopLoss || undefined, takeProfit: order.takeProfit || undefined,
        confirm: true,
      });
      if (!r.ok) throw new Error((await r.json()).error || "Order failed");
      return r.json();
    },
    onSuccess: () => { toast({ title: "DXtrade order placed ✓", description: "Check your DXtrade platform to confirm the fill." }); setOrderConfirm(false); },
    onError: (e: any) => toast({ title: "DXtrade order failed", description: e.message, variant: "destructive" }),
  });

  const { data, isLoading } = useQuery<any>({
    queryKey: ["/api/dxtrade/connections"],
    queryFn: async () => (await apiRequest("GET", "/api/dxtrade/connections")).json(),
    retry: false,
  });

  const connect = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("POST", "/api/dxtrade/connect", form);
      if (!r.ok) throw new Error((await r.json()).error || "Connect failed");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "DXtrade connected", description: "Account linked. Balances loading below." });
      setForm((f) => ({ ...f, password: "" }));
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/dxtrade/connections"] });
    },
    onError: (e: any) => toast({ title: "DXtrade connect failed", description: e.message, variant: "destructive" }),
  });

  const remove = useMutation({
    mutationFn: async (id: number) => (await apiRequest("DELETE", `/api/dxtrade/connections/${id}`)).json(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/dxtrade/connections"] }),
  });

  const conns = data?.connections ?? [];

  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-3xl mx-auto px-4 pt-6">
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-white mb-4">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
        </Link>
        <div className="flex items-center gap-2.5 mb-1">
          <h1 className="text-xl font-bold">DXtrade (Velotrade)</h1>
          <Badge variant="outline" className="text-[10px] border-blue-700 text-blue-400">FX SS AI — read-only (Phase 1)</Badge>
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Connect your Velotrade DXtrade account. Phase 1 verifies the login and shows balances/positions;
          auto-execution of SS AI signals is wired in Phase 2 once a connection is confirmed. Your password is encrypted at rest and never shown again.
        </p>

        {/* Connected accounts */}
        <div className="space-y-3 mb-6">
          {isLoading ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : conns.length === 0 ? (
            <p className="text-xs text-gray-500">No DXtrade account connected yet.</p>
          ) : (
            conns.map((c: any) => (
              <Card key={c.id} className="bg-gray-900 border-gray-800">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span className="flex items-center gap-2">
                      {c.error ? <XCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                      {c.label || c.username}
                    </span>
                    <button onClick={() => remove.mutate(c.id)} className="text-gray-500 hover:text-red-400"><Trash2 className="w-4 h-4" /></button>
                  </CardTitle>
                  <CardDescription className="text-[11px]">
                    {c.host} · {c.accountCode || "account pending"} {c.domain ? `· domain ${c.domain}` : ""}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-xs">
                  {c.error ? (
                    <p className="text-red-400">Error: {c.error}</p>
                  ) : (
                    <>
                      <p className="text-[10px] text-gray-500 mb-1">account code: <span className="font-mono text-gray-300">{c.accountCode || "— not resolved (see raw below)"}</span></p>
                      {c.accounts && <pre className="text-[10px] text-gray-400 overflow-x-auto bg-black/30 rounded p-2 mb-2">users/self: {JSON.stringify(c.accounts, null, 2).slice(0, 1000)}</pre>}
                      {c.metrics && <pre className="text-[10px] text-gray-400 overflow-x-auto bg-black/30 rounded p-2 mb-2">{JSON.stringify(c.metrics, null, 2).slice(0, 800)}</pre>}
                      {c.portfolio && <pre className="text-[10px] text-gray-400 overflow-x-auto bg-black/30 rounded p-2">{JSON.stringify(c.portfolio, null, 2).slice(0, 1200)}</pre>}
                      {!c.metrics && !c.portfolio && <p className="text-gray-500">Connected. No portfolio/metrics returned — send me this account's response so I can map the fields.</p>}

                      {/* Manual order ticket (Phase 2a) — validate live order placement */}
                      <div className="mt-3 rounded-lg border border-blue-800/30 bg-black/20 p-3 space-y-2">
                        <p className="text-[11px] font-bold text-blue-300">Place a test order <span className="text-gray-500 font-normal">(live — start tiny)</span></p>
                        <div className="grid grid-cols-2 gap-2">
                          <Input placeholder="Instrument (EUR/USD)" value={order.instrument} onChange={(e) => setOrder((o) => ({ ...o, instrument: e.target.value.toUpperCase() }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                          <select value={order.side} onChange={(e) => setOrder((o) => ({ ...o, side: e.target.value as any }))} className="bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2"><option value="BUY">Buy</option><option value="SELL">Sell</option></select>
                          <select value={order.type} onChange={(e) => setOrder((o) => ({ ...o, type: e.target.value as any }))} className="bg-gray-800 border border-gray-700 rounded-lg h-8 text-sm text-white px-2"><option value="MARKET">Market</option><option value="LIMIT">Limit</option></select>
                          <Input placeholder="Quantity (lots/units)" value={order.quantity} onChange={(e) => setOrder((o) => ({ ...o, quantity: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                          {order.type === "LIMIT" && <Input placeholder="Limit price" value={order.limitPrice} onChange={(e) => setOrder((o) => ({ ...o, limitPrice: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm col-span-2" />}
                          <Input placeholder="Stop loss (optional)" value={order.stopLoss} onChange={(e) => setOrder((o) => ({ ...o, stopLoss: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                          <Input placeholder="Take profit (optional)" value={order.takeProfit} onChange={(e) => setOrder((o) => ({ ...o, takeProfit: e.target.value }))} className="bg-gray-800 border-gray-700 h-8 text-sm" />
                        </div>
                        {placeOrder.isError && orderConnId === c.id && <p className="text-[11px] text-red-400">{(placeOrder.error as Error)?.message}</p>}
                        {placeOrder.isSuccess && orderConnId === c.id && <p className="text-[11px] text-emerald-400">Order placed ✓</p>}
                        {!(orderConfirm && orderConnId === c.id) ? (
                          <button onClick={() => { setOrderConnId(c.id); setOrderConfirm(true); }} disabled={!order.quantity || Number(order.quantity) <= 0} className={`w-full text-sm font-bold py-1.5 rounded-lg ${order.side === "BUY" ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500"} text-white disabled:opacity-50`}>{order.side} {order.instrument}</button>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => placeOrder.mutate(c.id)} disabled={placeOrder.isPending} className="flex-1 text-sm font-bold py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white">{placeOrder.isPending ? "Placing…" : `Confirm ${order.side} ${order.quantity} ${order.instrument}`}</button>
                            <button onClick={() => setOrderConfirm(false)} className="text-sm px-3 py-1.5 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
                          </div>
                        )}
                        <p className="text-[10px] text-gray-600">Live order on your Velotrade account. Use a tiny quantity to validate before the SS AI engine auto-executes (Phase 2b).</p>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {/* Connect form */}
        {!showForm ? (
          <button onClick={() => setShowForm(true)} className="text-sm font-bold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white">+ Connect DXtrade account</button>
        ) : (
          <Card className="bg-gray-900 border-gray-800">
            <CardHeader><CardTitle className="text-base">Connect DXtrade</CardTitle>
              <CardDescription>Use the same username/password you log into the Velotrade DXtrade web trader with. Host is preset for Velotrade.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1"><Label className="text-xs text-gray-400">Host</Label>
                <Input value={form.host} onChange={(e) => setForm((f) => ({ ...f, host: e.target.value }))} className="bg-gray-800 border-gray-700 h-9 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-400">Username</Label>
                <Input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))} className="bg-gray-800 border-gray-700 h-9 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-400">Password</Label>
                <div className="relative">
                  <Input type={showPw ? "text" : "password"} value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))} className="bg-gray-800 border-gray-700 h-9 text-sm pr-9" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-2 top-2 text-gray-500">{showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                </div>
              </div>
              <div className="space-y-1"><Label className="text-xs text-gray-400">Domain <span className="text-gray-600">(usually "default")</span></Label>
                <Input value={form.domain} onChange={(e) => setForm((f) => ({ ...f, domain: e.target.value }))} className="bg-gray-800 border-gray-700 h-9 text-sm" /></div>
              <div className="space-y-1"><Label className="text-xs text-gray-400">Label (optional)</Label>
                <Input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="e.g. Velotrade 25k" className="bg-gray-800 border-gray-700 h-9 text-sm" /></div>
              {connect.isError && <p className="text-[11px] text-red-400">{(connect.error as Error)?.message}</p>}
              <div className="flex gap-2">
                <button onClick={() => connect.mutate()} disabled={connect.isPending || !form.username || !form.password} className="text-sm font-bold px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white disabled:opacity-60">{connect.isPending ? "Verifying…" : "Connect"}</button>
                <button onClick={() => setShowForm(false)} className="text-sm px-3 py-2 rounded-lg bg-gray-800 text-gray-400">Cancel</button>
              </div>
              <p className="text-[10px] text-gray-500">Velotrade officially allows API/algo trading on funded accounts. Read-only for now — no orders are placed in Phase 1.</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
