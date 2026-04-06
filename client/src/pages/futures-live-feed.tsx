import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity, TrendingUp, TrendingDown, Play, Square,
  RefreshCw, Zap, AlertCircle, CheckCircle2, Clock,
  BarChart3, Target, Brain
} from "lucide-react";

const DEFAULT_SYMBOLS = ["NQ", "ES", "YM", "GC", "CL", "MNQ", "MES"];

function directionColor(dir: string) {
  if (dir === "BUY" || dir === "LONG") return "text-green-400";
  if (dir === "SELL" || dir === "SHORT") return "text-red-400";
  return "text-gray-400";
}

function confidenceBadge(confidence: number) {
  if (confidence >= 80) return "bg-green-600 text-white";
  if (confidence >= 65) return "bg-yellow-600 text-white";
  return "bg-gray-600 text-white";
}

function activityIcon(type: string) {
  if (type === "signal") return <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />;
  if (type === "error") return <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (type === "scan") return <RefreshCw className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
  if (type === "start" || type === "stop") return <Activity className="w-3.5 h-3.5 text-purple-400 shrink-0" />;
  return <CheckCircle2 className="w-3.5 h-3.5 text-gray-400 shrink-0" />;
}

function timeAgo(ts: string | number) {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function FuturesLiveFeed() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedSymbols] = useState<string[]>(DEFAULT_SYMBOLS);

  const { data: status, isLoading: statusLoading } = useQuery<any>({
    queryKey: ["/api/tradovate/scanner/status"],
    refetchInterval: 5000,
  });

  const { data: signalsData } = useQuery<any>({
    queryKey: ["/api/tradovate/scanner/signals"],
    refetchInterval: 5000,
  });

  const { data: activitiesData } = useQuery<any>({
    queryKey: ["/api/tradovate/scanner/activities"],
    refetchInterval: 5000,
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tradovate/scanner/start", {
        symbols: selectedSymbols,
        scanIntervalMs: 120000,
        minConfidence: 70,
        maxOpenTrades: 3,
        riskPerTrade: 1,
        accountBalance: 50000,
        aiMode: "full",
        propFirmDailyDrawdownLimit: 2,
        enableAutoExecution: false,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tradovate/scanner/status"] });
      toast({ title: "Futures Scanner Started", description: "AI is now scanning the markets" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tradovate/scanner/stop", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tradovate/scanner/status"] });
      toast({ title: "Scanner Stopped" });
    },
  });

  const isRunning = status?.running === true;
  const signals: any[] = signalsData?.signals || [];
  const activities: any[] = activitiesData?.activities || [];
  const symPerf: Record<string, any> = status?.symbolPerformance || {};

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-purple-400" />
            Futures AI Live Feed
          </h1>
          <p className="text-gray-400 text-sm mt-1">
            Real-time AI market scanning for futures instruments
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isRunning ? "bg-green-900/50 text-green-400 border border-green-700" : "bg-gray-800 text-gray-400 border border-gray-700"}`}>
            <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-green-400 animate-pulse" : "bg-gray-500"}`} />
            {isRunning ? "Live Scanning" : "Scanner Off"}
          </div>
          {isRunning ? (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => stopMutation.mutate()}
              disabled={stopMutation.isPending}
            >
              <Square className="w-4 h-4 mr-2" />
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-purple-600 hover:bg-purple-700"
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending || statusLoading}
            >
              <Play className="w-4 h-4 mr-2" />
              Start Scanner
            </Button>
          )}
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-gray-400 text-xs mb-1">Total Scans</p>
            <p className="text-2xl font-bold text-white">{status?.scanCount ?? 0}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-gray-400 text-xs mb-1">Signals Generated</p>
            <p className="text-2xl font-bold text-yellow-400">{signals.length}</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-gray-400 text-xs mb-1">Wins / Losses</p>
            <p className="text-2xl font-bold">
              <span className="text-green-400">{status?.wins ?? 0}</span>
              <span className="text-gray-500"> / </span>
              <span className="text-red-400">{status?.losses ?? 0}</span>
            </p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-800">
          <CardContent className="p-4">
            <p className="text-gray-400 text-xs mb-1">Last Scan</p>
            <p className="text-sm font-medium text-white">
              {status?.lastScanAt ? timeAgo(status.lastScanAt) : "—"}
            </p>
          </CardContent>
        </Card>
      </div>

      {status?.dailyLossHalted && (
        <div className="flex items-center gap-2 p-3 bg-red-900/30 border border-red-700 rounded-lg text-red-300 text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          Daily loss limit reached — scanner halted for today to protect your prop firm account.
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-6">

        {/* Live Signals */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              AI Signals
              {signals.length > 0 && (
                <Badge className="ml-auto bg-yellow-600 text-white text-xs">{signals.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {signals.length === 0 ? (
              <div className="px-4 pb-4 text-center text-gray-500 text-sm py-8">
                {isRunning ? "Scanning… signals will appear here" : "Start the scanner to see signals"}
              </div>
            ) : (
              <div className="divide-y divide-gray-800 max-h-96 overflow-y-auto">
                {signals.map((sig: any, i: number) => (
                  <div key={sig.id || i} className="px-4 py-3 hover:bg-gray-800/40 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {sig.direction === "BUY" || sig.direction === "LONG"
                          ? <TrendingUp className="w-4 h-4 text-green-400 shrink-0" />
                          : <TrendingDown className="w-4 h-4 text-red-400 shrink-0" />
                        }
                        <div>
                          <span className="font-bold text-white">{sig.symbol}</span>
                          <span className={`ml-2 font-semibold ${directionColor(sig.direction)}`}>
                            {sig.direction}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${confidenceBadge(sig.confidence)}`}>
                          {sig.confidence}%
                        </span>
                        <span className="text-gray-500 text-xs">{timeAgo(sig.generatedAt)}</span>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Entry </span>
                        <span className="text-white font-medium">{sig.entry ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">SL </span>
                        <span className="text-red-400 font-medium">{sig.stopLoss ?? "—"}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">TP </span>
                        <span className="text-green-400 font-medium">{sig.takeProfit ?? "—"}</span>
                      </div>
                    </div>
                    {sig.reason && (
                      <p className="mt-1.5 text-xs text-gray-400 leading-snug">{sig.reason}</p>
                    )}
                    {sig.strategy && (
                      <p className="mt-1 text-xs text-purple-400">{sig.strategy}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Log */}
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              Activity Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {activities.length === 0 ? (
              <div className="px-4 pb-4 text-center text-gray-500 text-sm py-8">
                No activity yet
              </div>
            ) : (
              <div className="divide-y divide-gray-800/60 max-h-96 overflow-y-auto">
                {activities.map((act: any, i: number) => (
                  <div key={i} className="px-4 py-2.5 flex items-start gap-2">
                    {activityIcon(act.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-300 leading-snug">{act.message}</p>
                    </div>
                    <span className="text-gray-600 text-xs shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {timeAgo(act.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Symbol Performance */}
      {Object.keys(symPerf).length > 0 && (
        <Card className="bg-gray-900 border-gray-800">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-400" />
              Symbol Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(symPerf).map(([sym, perf]: [string, any]) => {
                const total = (perf.wins || 0) + (perf.losses || 0);
                const wr = total > 0 ? Math.round((perf.wins / total) * 100) : 0;
                return (
                  <div key={sym} className="bg-gray-800/60 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-white">{sym}</span>
                      <span className={`text-xs font-medium ${wr >= 60 ? "text-green-400" : wr >= 45 ? "text-yellow-400" : "text-red-400"}`}>
                        {wr}% WR
                      </span>
                    </div>
                    <div className="flex gap-3 text-xs text-gray-400">
                      <span><span className="text-green-400">{perf.wins || 0}W</span> / <span className="text-red-400">{perf.losses || 0}L</span></span>
                    </div>
                    {perf.avgConfidence > 0 && (
                      <div className="mt-1 text-xs text-gray-500 flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        Avg conf: {Math.round(perf.avgConfidence)}%
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Scanning symbols */}
      {isRunning && status?.config?.symbols && (
        <div className="flex flex-wrap gap-2">
          <span className="text-gray-500 text-sm">Scanning:</span>
          {status.config.symbols.map((s: string) => (
            <Badge key={s} variant="outline" className="border-purple-700 text-purple-300 text-xs">
              {s}
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
