import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { TrendingUp, TrendingDown, Clock, Target, Brain, BarChart3, Trophy, AlertCircle } from "lucide-react";

interface PaperTrade {
  id: number;
  symbol: string;
  timeframe: string;
  direction: "BUY" | "SELL";
  entryPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  aiConfidence: number;
  aiModel?: string;
  aiProvider?: string;
  aiReasoning?: string;
  confluenceScore?: number;
  confluenceGrade?: string;
  outcome: "pending" | "win" | "loss" | "breakeven";
  pnlPips?: number;
  pnlPercent?: number;
  notes?: string;
  createdAt: string;
  resolvedAt?: string;
}

interface Stats {
  total: number;
  resolved: number;
  pending: number;
  wins: number;
  losses: number;
  winRate: number;
  totalPnlPips: number;
  symbolStats: Record<string, { wins: number; losses: number; total: number }>;
  modelStats: Record<string, { wins: number; losses: number; total: number }>;
  recentTrades: PaperTrade[];
}

export default function PaperTradesPage() {
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("overview");

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/api/paper-trades"],
    refetchInterval: 30000,
  });

  const { data: trades = [] } = useQuery<PaperTrade[]>({
    queryKey: ["/api/paper-trades/list"],
    refetchInterval: 30000,
  });

  const updateOutcome = useMutation({
    mutationFn: async ({ id, outcome, pnlPips }: { id: number; outcome: string; pnlPips?: number }) => {
      return apiRequest("PUT", `/api/paper-trades/${id}/outcome`, { outcome, pnlPips });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/paper-trades"] });
      queryClient.invalidateQueries({ queryKey: ["/api/paper-trades/list"] });
    },
  });

  const getOutcomeBadge = (outcome: string) => {
    switch (outcome) {
      case "win": return <Badge className="bg-green-600 text-white">WIN</Badge>;
      case "loss": return <Badge className="bg-red-600 text-white">LOSS</Badge>;
      case "breakeven": return <Badge className="bg-yellow-600 text-white">B/E</Badge>;
      default: return <Badge variant="outline" className="border-orange-500 text-orange-400">PENDING</Badge>;
    }
  };

  const getDirectionIcon = (direction: string) => {
    return direction === "BUY"
      ? <TrendingUp className="w-4 h-4 text-green-400" />
      : <TrendingDown className="w-4 h-4 text-red-400" />;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-muted-foreground">Loading paper trade journal...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Brain className="w-8 h-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold text-foreground">Paper Trade AI Journal</h1>
            <p className="text-sm text-muted-foreground">
              Every confirmation AI signal is tracked here — outcomes train the AI to get smarter over time
            </p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-foreground">{stats?.total ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">Total Signals</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-400">{stats?.winRate ?? 0}%</div>
              <div className="text-xs text-muted-foreground mt-1">Win Rate</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${(stats?.totalPnlPips ?? 0) >= 0 ? "text-green-400" : "text-red-400"}`}>
                {(stats?.totalPnlPips ?? 0) > 0 ? "+" : ""}{stats?.totalPnlPips?.toFixed(1) ?? 0}
              </div>
              <div className="text-xs text-muted-foreground mt-1">Total Pips</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-400">{stats?.pending ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">Pending</div>
            </CardContent>
          </Card>
        </div>

        {/* Win/Loss Bar */}
        {(stats?.resolved ?? 0) > 0 && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">{stats?.wins} wins</span>
                <span className="text-sm font-semibold text-foreground">{stats?.winRate}% accuracy</span>
                <span className="text-sm text-muted-foreground">{stats?.losses} losses</span>
              </div>
              <div className="w-full h-3 bg-red-900 rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full transition-all"
                  style={{ width: `${stats?.winRate ?? 0}%` }}
                />
              </div>
              {(stats?.winRate ?? 0) < 40 && (
                <div className="flex items-center gap-2 mt-2 text-xs text-orange-400">
                  <AlertCircle className="w-3 h-3" />
                  Low accuracy — AI is learning from losses to improve future signals
                </div>
              )}
              {(stats?.winRate ?? 0) >= 65 && (
                <div className="flex items-center gap-2 mt-2 text-xs text-green-400">
                  <Trophy className="w-3 h-3" />
                  Strong accuracy — AI confirmation strategy is performing well
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={selectedTab} onValueChange={setSelectedTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="overview">Trade Log</TabsTrigger>
            <TabsTrigger value="symbols">By Symbol</TabsTrigger>
            <TabsTrigger value="models">By AI Model</TabsTrigger>
          </TabsList>

          {/* Trade Log */}
          <TabsContent value="overview" className="space-y-3">
            {trades.length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  <Brain className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p className="font-medium">No paper trades recorded yet</p>
                  <p className="text-sm mt-1">
                    Every time the 2nd confirmation AI runs on a signal, it will be recorded here automatically.
                  </p>
                </CardContent>
              </Card>
            ) : (
              trades.map((trade) => (
                <Card key={trade.id} className="border border-border">
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        {getDirectionIcon(trade.direction)}
                        <span className="font-bold text-foreground">{trade.symbol}</span>
                        <Badge variant="outline" className="text-xs">{trade.timeframe}</Badge>
                        {getOutcomeBadge(trade.outcome)}
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-muted-foreground">
                          {new Date(trade.createdAt).toLocaleDateString()}
                        </div>
                        {trade.pnlPips !== undefined && trade.pnlPips !== null && (
                          <div className={`text-sm font-bold ${trade.pnlPips >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {trade.pnlPips > 0 ? "+" : ""}{trade.pnlPips.toFixed(1)} pips
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Entry</span>
                        <div className="font-medium text-foreground">{trade.entryPrice}</div>
                      </div>
                      {trade.stopLoss && (
                        <div>
                          <span className="text-muted-foreground">SL</span>
                          <div className="font-medium text-red-400">{trade.stopLoss}</div>
                        </div>
                      )}
                      {trade.takeProfit && (
                        <div>
                          <span className="text-muted-foreground">TP</span>
                          <div className="font-medium text-green-400">{trade.takeProfit}</div>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                      <Brain className="w-3 h-3" />
                      <span>{trade.aiProvider} / {trade.aiModel}</span>
                      <span>•</span>
                      <span>{trade.aiConfidence}% confidence</span>
                      {trade.confluenceGrade && (
                        <>
                          <span>•</span>
                          <span>Grade: {trade.confluenceGrade}</span>
                        </>
                      )}
                    </div>

                    {trade.outcome === "pending" && (
                      <div className="mt-3 flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-600 text-green-400 hover:bg-green-900"
                          onClick={() => updateOutcome.mutate({ id: trade.id, outcome: "win", pnlPips: trade.takeProfit ? Math.abs(trade.takeProfit - trade.entryPrice) * 10000 : 20 })}
                        >
                          Mark Win
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-600 text-red-400 hover:bg-red-900"
                          onClick={() => updateOutcome.mutate({ id: trade.id, outcome: "loss", pnlPips: trade.stopLoss ? -Math.abs(trade.stopLoss - trade.entryPrice) * 10000 : -20 })}
                        >
                          Mark Loss
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-yellow-600 text-yellow-400 hover:bg-yellow-900"
                          onClick={() => updateOutcome.mutate({ id: trade.id, outcome: "breakeven", pnlPips: 0 })}
                        >
                          B/E
                        </Button>
                      </div>
                    )}

                    {trade.aiReasoning && (
                      <details className="mt-2">
                        <summary className="text-xs text-primary cursor-pointer">AI Reasoning</summary>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{trade.aiReasoning}</p>
                      </details>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* By Symbol */}
          <TabsContent value="symbols" className="space-y-3">
            {Object.entries(stats?.symbolStats ?? {}).length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No resolved trades yet
                </CardContent>
              </Card>
            ) : (
              Object.entries(stats?.symbolStats ?? {})
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([symbol, s]) => (
                  <Card key={symbol}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <BarChart3 className="w-5 h-5 text-primary" />
                          <span className="font-bold text-foreground">{symbol}</span>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-foreground">
                            {s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0}%
                          </div>
                          <div className="text-xs text-muted-foreground">{s.wins}W / {s.losses}L</div>
                        </div>
                      </div>
                      <div className="mt-2 w-full h-2 bg-red-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${s.total > 0 ? (s.wins / s.total) * 100 : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
            )}
          </TabsContent>

          {/* By AI Model */}
          <TabsContent value="models" className="space-y-3">
            {Object.entries(stats?.modelStats ?? {}).length === 0 ? (
              <Card>
                <CardContent className="pt-6 text-center text-muted-foreground">
                  No resolved trades yet
                </CardContent>
              </Card>
            ) : (
              Object.entries(stats?.modelStats ?? {})
                .sort(([, a], [, b]) => b.total - a.total)
                .map(([model, s]) => (
                  <Card key={model}>
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Brain className="w-5 h-5 text-primary" />
                          <div>
                            <div className="font-bold text-foreground text-sm">{model}</div>
                            <div className="text-xs text-muted-foreground">{s.total} trades</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold text-foreground">
                            {s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0}%
                          </div>
                          <div className="text-xs text-muted-foreground">{s.wins}W / {s.losses}L</div>
                        </div>
                      </div>
                      <div className="mt-2 w-full h-2 bg-red-900 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 rounded-full"
                          style={{ width: `${s.total > 0 ? (s.wins / s.total) * 100 : 0}%` }}
                        />
                      </div>
                    </CardContent>
                  </Card>
                ))
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
