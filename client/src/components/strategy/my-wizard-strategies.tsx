// Saved Strategy Wizard strategies: each one's paper test (the same rules on
// candles after the save date) and the "Add to brain" step once it passes.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Brain, Trash2, FlaskConical } from "lucide-react";

type Saved = {
  id: number; name: string; symbol: string; timeframe: string; rr: number; status: string; createdAt: string;
  backtest: { totalR: number; winRate: number; trades: number; profitFactor: number } | null;
  paper: { totalR: number; winRate: number; trades: number; recent: { time: string; dir: string; r: number }[] } | null;
  verdict: { ready: boolean; label: string };
};

const KEY = ["/api/strategy-wizard/strategies"];
const sign = (n: number) => `${n > 0 ? "+" : ""}${n}`;

export function MyWizardStrategies({ refreshKey }: { refreshKey: number }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  const { data, isLoading } = useQuery<{ strategies: Saved[] }>({ queryKey: KEY });
  useEffect(() => { if (refreshKey) queryClient.invalidateQueries({ queryKey: KEY }); }, [refreshKey]);

  const act = async (id: number, kind: "promote" | "remove") => {
    setBusy(id);
    try {
      const r = kind === "promote"
        ? await apiRequest("POST", `/api/strategy-wizard/strategies/${id}/promote`, {})
        : await apiRequest("DELETE", `/api/strategy-wizard/strategies/${id}`);
      const d = await r.json();
      if (d.error) throw new Error(d.error);
      if (kind === "promote") {
        toast({ title: "Added to your brain", description: `${d.idea?.title}: ${d.idea?.summary || "saved as a shadow filter"}. It shows under My ideas on the ABBA page.` });
        queryClient.invalidateQueries({ queryKey: ["/api/abba/ideas"] });
      }
      queryClient.invalidateQueries({ queryKey: KEY });
    } catch (e: any) {
      toast({ title: kind === "promote" ? "Not added" : "Could not remove", description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const list = data?.strategies || [];
  return (
    <Card className="mt-10">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5" /> My strategies: paper test</CardTitle>
        <CardDescription>
          Saved strategies keep running on new candles, with no orders placed. After 10+ paper trades in profit you can add one to your brain as a filter.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground">Loading paper tests...</p>}
        {!isLoading && list.length === 0 && <p className="text-sm text-muted-foreground">Nothing saved yet. Run a backtest, then tap "Save & start paper test".</p>}
        {list.map((s) => (
          <div key={s.id} className="rounded-lg border p-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="font-medium">{s.name}</div>
              <Badge variant="outline">{s.status === "in_brain" ? "In brain (shadow)" : "Paper testing"}</Badge>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              <div className="rounded bg-muted/50 p-2">
                <div className="text-xs text-muted-foreground">Backtest (before saving)</div>
                {s.backtest ? <div>{sign(s.backtest.totalR)}R · {s.backtest.trades} trades · {s.backtest.winRate}% wins</div> : <div>—</div>}
              </div>
              <div className="rounded bg-muted/50 p-2">
                <div className="text-xs text-muted-foreground">Paper test (since {s.createdAt?.slice(0, 10)})</div>
                {s.paper ? <div className={s.paper.totalR > 0 ? "text-green-600" : s.paper.totalR < 0 ? "text-red-500" : ""}>{sign(s.paper.totalR)}R · {s.paper.trades} trades · {s.paper.winRate}% wins</div> : <div>—</div>}
              </div>
            </div>
            <p className="text-sm text-muted-foreground">{s.verdict.label}</p>
            {s.paper && s.paper.recent.length > 0 && (
              <p className="text-xs text-muted-foreground">Latest: {s.paper.recent.map((t) => `${t.time.slice(5, 10)} ${t.dir} ${sign(t.r)}R`).join(" · ")}</p>
            )}
            <div className="flex gap-2">
              {s.status !== "in_brain" && (
                <Button size="sm" disabled={!s.verdict.ready || busy === s.id} onClick={() => act(s.id, "promote")}>
                  <Brain className="h-4 w-4 mr-1" /> Add to brain
                </Button>
              )}
              <Button size="sm" variant="ghost" disabled={busy === s.id} onClick={() => act(s.id, "remove")}>
                <Trash2 className="h-4 w-4 mr-1" /> Remove
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
