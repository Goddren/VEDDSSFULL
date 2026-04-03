import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  Wifi, WifiOff, Trash2, RefreshCw, ChevronDown, ChevronUp, Info,
  ShieldCheck, DollarSign, Activity, Layers
} from "lucide-react";

const PROP_FIRM_NAMES: Record<string, string> = {
  TOPSTEP: 'Topstep',
  APEX: 'Apex Trader Funding',
  BULENOX: 'Bulenox',
  EARN2TRADE: 'Earn2Trade',
  TAKEPROFITTRADER: 'Take Profit Trader',
};

const ACCOUNT_SIZES = [10000, 25000, 50000, 100000, 150000, 250000, 300000];

export default function FuturesConnect() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<'demo' | 'live'>('demo');
  const [propFirmPreset, setPropFirmPreset] = useState('TOPSTEP');
  const [propFirmAccountSize, setPropFirmAccountSize] = useState(50000);
  const [showRulesTable, setShowRulesTable] = useState(false);
  const [calcSymbol, setCalcSymbol] = useState('NQ');
  const [calcRisk, setCalcRisk] = useState('1');
  const [calcEntry, setCalcEntry] = useState('');
  const [calcSL, setCalcSL] = useState('');
  const [calcResult, setCalcResult] = useState<any>(null);

  const { data: connection, isLoading: connLoading } = useQuery<any>({
    queryKey: ['/api/tradovate/connection'],
  });

  const { data: accountData, refetch: refetchAccount } = useQuery<any>({
    queryKey: ['/api/tradovate/account'],
    enabled: !!connection?.connected,
    refetchInterval: 30000,
  });

  const { data: positions } = useQuery<any>({
    queryKey: ['/api/tradovate/positions'],
    enabled: !!connection?.connected,
    refetchInterval: 10000,
  });

  const { data: instrumentsData } = useQuery<any>({
    queryKey: ['/api/futures/instruments'],
  });

  const { data: presetsData } = useQuery<any>({
    queryKey: ['/api/futures/prop-firm-presets'],
  });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/tradovate/connection', {
        username, password, accountType, propFirmPreset, propFirmAccountSize,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tradovate/connection'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tradovate/account'] });
      toast({ title: "Tradovate Connected", description: "Futures account connected successfully" });
      setPassword('');
    },
    onError: (err: any) => toast({ title: "Connection Failed", description: err.message, variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/tradovate/connection');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tradovate/connection'] });
      toast({ title: "Disconnected", description: "Tradovate connection removed" });
    },
  });

  const calcContractSize = async () => {
    if (!calcEntry || !calcSL) return;
    const res = await apiRequest('POST', '/api/futures/contract-size', {
      symbol: calcSymbol,
      accountBalance: accountData?.account?.balance || 50000,
      riskPercent: parseFloat(calcRisk),
      entryPrice: parseFloat(calcEntry),
      stopLossPrice: parseFloat(calcSL),
    });
    setCalcResult(await res.json());
  };

  const dd = accountData?.drawdownStatus;
  const account = accountData?.account;
  const selectedPreset = presetsData?.presets?.find((p: any) => p.id === propFirmPreset);
  const selectedRulesRow = selectedPreset?.rulesTable?.find((r: any) => r.accountSize === propFirmAccountSize);

  const verdictColor: Record<string, string> = {
    SAFE: 'text-emerald-400',
    WARNING: 'text-amber-400',
    DANGER: 'text-red-400',
    BREACHED: 'text-red-500',
  };

  const verdictBg: Record<string, string> = {
    SAFE: 'border-emerald-500/30 bg-emerald-900/20',
    WARNING: 'border-amber-500/30 bg-amber-900/20',
    DANGER: 'border-red-500/30 bg-red-900/20',
    BREACHED: 'border-red-600/50 bg-red-900/30',
  };

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-700 flex items-center justify-center shadow-lg">
            <BarChart3 className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white" style={{ fontFamily: "'Space Grotesk', 'Inter', sans-serif" }}>
              Futures Connect
            </h1>
            <p className="text-gray-400 text-sm">Connect Tradovate for TOPSTEP, Apex, Bulenox &amp; more</p>
          </div>
        </div>
      </div>

      {/* ── Connection Card ───────────────────────────────────────────────── */}
      {!connection?.connected ? (
        <Card className="mb-6 bg-gray-900/60 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Wifi className="h-5 w-5 text-blue-400" /> Connect Tradovate Account
            </CardTitle>
            <CardDescription className="text-gray-400">
              Demo accounts are free on tradovate.com — perfect for prop firm challenges
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Tradovate Username</label>
                <Input value={username} onChange={e => setUsername(e.target.value)} placeholder="your@email.com"
                  className="bg-gray-800 border-gray-700 text-white" />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Password</label>
                <Input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Account Type</label>
                <div className="flex gap-2">
                  {(['demo', 'live'] as const).map(t => (
                    <button key={t} onClick={() => setAccountType(t)}
                      className={`flex-1 py-2 text-xs font-medium rounded-lg border transition-all ${accountType === t ? 'border-blue-500 bg-blue-500/15 text-blue-400' : 'border-gray-700 text-gray-500 hover:text-gray-300'}`}>
                      {t === 'demo' ? '📊 Demo' : '🔴 Live'}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Prop Firm</label>
                <Select value={propFirmPreset} onValueChange={setPropFirmPreset}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROP_FIRM_NAMES).map(([id, name]) => (
                      <SelectItem key={id} value={id}>{name}</SelectItem>
                    ))}
                    <SelectItem value="CUSTOM">Custom / No Preset</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">Account Size</label>
                <Select value={String(propFirmAccountSize)} onValueChange={v => setPropFirmAccountSize(Number(v))}>
                  <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_SIZES.map(s => (
                      <SelectItem key={s} value={String(s)}>${s.toLocaleString()}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Selected preset rules preview */}
            {selectedRulesRow && (
              <div className="rounded-xl bg-blue-900/20 border border-blue-500/20 p-3 grid grid-cols-3 gap-3">
                <div className="text-center">
                  <p className="text-red-400 font-bold text-sm">${selectedRulesRow.dailyLossLimit.toLocaleString()}</p>
                  <p className="text-gray-500 text-xs">Daily Loss Limit</p>
                </div>
                <div className="text-center">
                  <p className="text-amber-400 font-bold text-sm">${selectedRulesRow.trailingMaxDrawdown.toLocaleString()}</p>
                  <p className="text-gray-500 text-xs">Trailing Max DD</p>
                </div>
                <div className="text-center">
                  <p className="text-emerald-400 font-bold text-sm">${selectedRulesRow.profitTarget.toLocaleString()}</p>
                  <p className="text-gray-500 text-xs">Profit Target</p>
                </div>
              </div>
            )}

            <Button onClick={() => connectMutation.mutate()} disabled={!username || !password || connectMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700">
              {connectMutation.isPending ? 'Connecting...' : 'Connect Tradovate'}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* ── Connected — Account Status ────────────────────────────────── */}
          <Card className="mb-4 border-blue-500/30 bg-gradient-to-r from-blue-950/30 to-cyan-950/20">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
                  <span className="text-blue-400 font-bold text-sm">TRADOVATE CONNECTED</span>
                  <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/30 text-[10px]">
                    {connection.accountType?.toUpperCase()}
                  </Badge>
                  {connection.propFirmPreset && (
                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                      {PROP_FIRM_NAMES[connection.propFirmPreset] || connection.propFirmPreset}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" onClick={() => refetchAccount()} className="text-gray-400 hover:text-white h-7 px-2">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => disconnectMutation.mutate()} className="text-red-400 hover:text-red-300 h-7 px-2">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {account && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <p className="text-white font-bold text-lg">${account.balance?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                    <p className="text-gray-500 text-xs">Account Balance</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <p className={`font-bold text-lg ${account.openPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {account.openPnL >= 0 ? '+' : ''}${account.openPnL?.toFixed(2)}
                    </p>
                    <p className="text-gray-500 text-xs">Open P&L</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <p className={`font-bold text-lg ${account.closedPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {account.closedPnL >= 0 ? '+' : ''}${account.closedPnL?.toFixed(2)}
                    </p>
                    <p className="text-gray-500 text-xs">Closed P&L Today</p>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <p className="text-cyan-400 font-bold text-lg">${account.availableMargin?.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                    <p className="text-gray-500 text-xs">Available Margin</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ── Trailing Drawdown Gauge ────────────────────────────────────── */}
          {dd && (
            <Card className={`mb-4 border ${verdictBg[dd.verdict] || 'border-gray-700 bg-gray-900/50'}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <ShieldCheck className={`h-5 w-5 ${verdictColor[dd.verdict]}`} />
                    <span className="text-white font-bold text-sm">Prop Firm Risk Monitor</span>
                    <Badge className={`text-[10px] ${dd.verdict === 'SAFE' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : dd.verdict === 'BREACHED' ? 'bg-red-600/30 text-red-300 border-red-600/30' : dd.verdict === 'DANGER' ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30'}`}>
                      {dd.verdict}
                    </Badge>
                  </div>
                  {dd.verdictReason && <p className="text-xs text-gray-400">{dd.verdictReason}</p>}
                </div>

                <div className="space-y-3">
                  {/* Trailing DD bar */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Trailing Drawdown Buffer</span>
                      <span className={verdictColor[dd.verdict]}>${dd.distanceToFloor?.toFixed(0)} remaining (floor: ${dd.drawdownFloor?.toFixed(0)})</span>
                    </div>
                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${dd.verdict === 'SAFE' ? 'bg-emerald-500' : dd.verdict === 'WARNING' ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`}
                        style={{ width: `${Math.min(100, dd.distanceToFloorPct || 0)}%` }} />
                    </div>
                  </div>

                  {/* Daily loss bar */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Daily Loss Budget</span>
                      <span>${dd.dailyLossRemaining?.toFixed(0)} of ${dd.dailyLossLimit?.toFixed(0)} remaining</span>
                    </div>
                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${dd.dailyLossUsedPct < 50 ? 'bg-emerald-500' : dd.dailyLossUsedPct < 75 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(100, dd.dailyLossUsedPct || 0)}%` }} />
                    </div>
                  </div>

                  {/* Progress to target */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-400 mb-1">
                      <span>Profit Target Progress</span>
                      <span className="text-emerald-400">${dd.profitGained?.toFixed(2)} / ${dd.profitTarget?.toFixed(0)} ({dd.progressToTarget?.toFixed(1)}%)</span>
                    </div>
                    <div className="h-3 bg-gray-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all"
                        style={{ width: `${Math.min(100, dd.progressToTarget || 0)}%` }} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Open Positions ─────────────────────────────────────────────── */}
          {positions?.positions?.length > 0 && (
            <Card className="mb-4 bg-gray-900/60 border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4 text-blue-400" /> Open Positions ({positions.positions.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {positions.positions.map((pos: any) => (
                    <div key={pos.id} className="flex items-center justify-between bg-gray-800/50 rounded-lg p-2.5">
                      <div className="flex items-center gap-2">
                        <span className="text-white font-mono font-bold text-sm">{pos.symbol}</span>
                        <Badge className={`text-[10px] ${pos.netPos > 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-red-500/20 text-red-400 border-red-500/30'}`}>
                          {pos.netPos > 0 ? 'LONG' : 'SHORT'} {Math.abs(pos.netPos)}
                        </Badge>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold text-sm ${pos.openPnL >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {pos.openPnL >= 0 ? '+' : ''}${pos.openPnL?.toFixed(2)}
                        </p>
                        <p className="text-gray-500 text-xs">@ {pos.netPrice}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ── Prop Firm Rules Table ─────────────────────────────────────────── */}
      <Card className="mb-4 bg-gray-900/60 border-gray-700">
        <CardHeader className="pb-2 cursor-pointer" onClick={() => setShowRulesTable(!showRulesTable)}>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Info className="h-4 w-4 text-purple-400" /> Prop Firm Rules Reference
            </CardTitle>
            {showRulesTable ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
          </div>
        </CardHeader>
        {showRulesTable && presetsData?.presets && (
          <CardContent>
            <div className="space-y-4">
              {presetsData.presets.map((preset: any) => (
                <div key={preset.id}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-white font-bold text-sm">{preset.name}</span>
                    {preset.allowOvernightHolds && <Badge className="text-[10px] bg-blue-500/20 text-blue-400 border-blue-500/30">Overnight ✓</Badge>}
                    {preset.allowWeekendHolds && <Badge className="text-[10px] bg-purple-500/20 text-purple-400 border-purple-500/30">Weekend ✓</Badge>}
                    {preset.consistencyRule && <Badge className="text-[10px] bg-amber-500/20 text-amber-400 border-amber-500/30">Consistency Rule</Badge>}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-gray-400">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-1 pr-3">Account</th>
                          <th className="text-right py-1 pr-3 text-red-400">Daily Loss</th>
                          <th className="text-right py-1 pr-3 text-amber-400">Max DD</th>
                          <th className="text-right py-1 text-emerald-400">Target</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preset.rulesTable?.map((row: any) => (
                          <tr key={row.accountSize} className="border-b border-gray-800/50">
                            <td className="py-1 pr-3 font-mono">${row.accountSize.toLocaleString()}</td>
                            <td className="py-1 pr-3 text-right text-red-400 font-mono">${row.dailyLossLimit.toLocaleString()}</td>
                            <td className="py-1 pr-3 text-right text-amber-400 font-mono">${row.trailingMaxDrawdown.toLocaleString()}</td>
                            <td className="py-1 text-right text-emerald-400 font-mono">${row.profitTarget.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preset.consistencyRule && <p className="text-xs text-amber-400/70 mt-1">⚠️ {preset.consistencyRule}</p>}
                </div>
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Contract Size Calculator ──────────────────────────────────────── */}
      <Card className="mb-4 bg-gray-900/60 border-gray-700">
        <CardHeader className="pb-2">
          <CardTitle className="text-white text-sm flex items-center gap-2">
            <Layers className="h-4 w-4 text-cyan-400" /> Contract Size Calculator
          </CardTitle>
          <CardDescription className="text-gray-400 text-xs">
            Calculate how many contracts to trade based on your risk tolerance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Symbol</label>
              <Select value={calcSymbol} onValueChange={setCalcSymbol}>
                <SelectTrigger className="bg-gray-800 border-gray-700 text-white text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {instrumentsData?.instruments?.map((inst: any) => (
                    <SelectItem key={inst.symbol} value={inst.symbol}>
                      {inst.symbol} — {inst.description}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Risk %</label>
              <Input value={calcRisk} onChange={e => setCalcRisk(e.target.value)} type="number" min="0.1" max="5" step="0.1"
                className="bg-gray-800 border-gray-700 text-white text-xs" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Entry Price</label>
              <Input value={calcEntry} onChange={e => setCalcEntry(e.target.value)} type="number" placeholder="e.g. 19500"
                className="bg-gray-800 border-gray-700 text-white text-xs" />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">Stop Loss Price</label>
              <Input value={calcSL} onChange={e => setCalcSL(e.target.value)} type="number" placeholder="e.g. 19450"
                className="bg-gray-800 border-gray-700 text-white text-xs" />
            </div>
          </div>
          <Button size="sm" onClick={calcContractSize} className="bg-cyan-600 hover:bg-cyan-700 mb-3">
            Calculate
          </Button>
          {calcResult && (
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-white font-bold text-xl">{calcResult.contracts}</p>
                <p className="text-gray-500 text-xs">Contracts</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-red-400 font-bold text-xl">${calcResult.dollarRisk?.toFixed(2)}</p>
                <p className="text-gray-500 text-xs">Max Dollar Risk</p>
              </div>
              <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                <p className="text-cyan-400 font-bold text-xl">{calcResult.ticks}</p>
                <p className="text-gray-500 text-xs">SL Distance (ticks)</p>
              </div>
              {calcResult.instrument && (
                <div className="col-span-3 bg-blue-900/20 border border-blue-500/20 rounded-lg p-2 text-xs text-gray-400">
                  <span className="font-mono">{calcResult.instrument.symbol}</span> — Tick: ${calcResult.instrument.tickValue} | Point Value: ${calcResult.instrument.pointValue} | Exchange: {calcResult.instrument.exchange}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
