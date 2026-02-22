import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft, Target, TrendingUp, DollarSign, BarChart3,
  Calendar, Clock, Shield, Brain, RefreshCw, Trash2,
  CheckCircle, AlertCircle, Zap, ChevronRight, Star,
  Rocket, Flame, ArrowUpRight
} from "lucide-react";
import { motion } from "framer-motion";

const POPULAR_PAIRS = [
  "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "AUDUSD", "NZDUSD", "USDCAD",
  "XAUUSD", "GBPJPY", "EURJPY", "EURGBP", "AUDJPY", "CADJPY",
  "US30", "NAS100", "SPX500", "BTCUSD", "ETHUSD"
];

type WeeklyStrategy = {
  hasStrategy: boolean;
  profitTarget?: number;
  pairs?: string[];
  accountBalance?: number;
  riskLevel?: string;
  plan?: any;
  pairStats?: Record<string, any>;
  generatedAt?: string;
  currentProfit?: number;
  progressTrades?: number;
  progressWinRate?: number;
  progressPercentage?: number;
};

export default function WeeklyStrategyPage() {
  const { toast } = useToast();
  const [profitTarget, setProfitTarget] = useState("400");
  const [accountBalance, setAccountBalance] = useState("100");
  const [lotSize, setLotSize] = useState("");
  const [selectedPairs, setSelectedPairs] = useState<string[]>(["XAUUSD", "GBPJPY", "NAS100"]);
  const [pairInput, setPairInput] = useState("");

  const { data: strategy, isLoading } = useQuery<WeeklyStrategy>({
    queryKey: ['/api/weekly-strategy'],
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/weekly-strategy/generate', {
        profitTarget: parseFloat(profitTarget),
        pairs: selectedPairs,
        accountBalance: parseFloat(accountBalance),
        riskLevel: 'ai-controlled',
        lotSize: lotSize || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      toast({ title: "VEDD SS AI Plan Ready", description: "Your AI-powered growth strategy is live!" });
    },
    onError: (err: any) => {
      const msg = err.message || "Failed to generate strategy";
      toast({ title: "Strategy Generation Failed", description: msg, variant: "destructive" });
    },
  });

  const updateProgressMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/weekly-strategy/update-progress', {});
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      toast({ title: "Progress Updated", description: `$${data.currentProfit} earned so far` });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', '/api/weekly-strategy');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      toast({ title: "Plan Cleared", description: "Ready to create a new VEDD SS AI plan" });
    },
  });

  const togglePair = (pair: string) => {
    setSelectedPairs(prev =>
      prev.includes(pair) ? prev.filter(p => p !== pair) : [...prev, pair]
    );
  };

  const addCustomPair = () => {
    const pair = pairInput.toUpperCase().replace('/', '').trim();
    if (pair && !selectedPairs.includes(pair)) {
      setSelectedPairs(prev => [...prev, pair]);
      setPairInput("");
    }
  };

  const formGrowthMultiplier = accountBalance && profitTarget && parseFloat(accountBalance) > 0
    ? ((parseFloat(accountBalance) + parseFloat(profitTarget)) / parseFloat(accountBalance)).toFixed(1)
    : '1.0';

  const strategyGrowthMultiplier = strategy?.accountBalance && strategy?.profitTarget && strategy.accountBalance > 0
    ? (((strategy.accountBalance + strategy.profitTarget) / strategy.accountBalance)).toFixed(1)
    : '1.0';

  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const plan = strategy?.plan;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-950 via-gray-900 to-gray-950 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/mt5-chart-data">
            <Button variant="ghost" size="sm" className="text-gray-400 hover:text-white">
              <ArrowLeft className="w-4 h-4 mr-1" /> Back to MT5
            </Button>
          </Link>
        </div>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="text-center space-y-2">
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30">
            <Rocket className="w-8 h-8 text-orange-400" />
            <h1 className="text-3xl font-bold text-white">VEDD SS AI</h1>
            <Flame className="w-6 h-6 text-red-400" />
          </div>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Full AI control - no EA restraints. Set your growth target and let AI map the path.
          </p>
        </motion.div>

        {strategy?.hasStrategy && plan ? (
          <div className="space-y-6">
            {/* Growth Progress Header */}
            <Card className="border-2 border-orange-500/30 bg-gradient-to-r from-orange-900/20 to-red-900/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-orange-400 flex items-center gap-2">
                      <Rocket className="w-5 h-5" />
                      ${strategy.accountBalance} <ArrowUpRight className="w-4 h-4" /> ${(strategy.accountBalance || 0) + (strategy.profitTarget || 0)}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {strategy.pairs?.join(', ')} | {strategyGrowthMultiplier}x Growth Target | Full AI Control
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateProgressMutation.mutate()} disabled={updateProgressMutation.isPending}>
                      <RefreshCw className={`w-4 h-4 mr-1 ${updateProgressMutation.isPending ? 'animate-spin' : ''}`} />
                      Sync Progress
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-400 border-red-500/30" onClick={() => deleteMutation.mutate()}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Progress: ${strategy.currentProfit || 0} / ${strategy.profitTarget}</span>
                    <span className="text-orange-400 font-bold">{strategy.progressPercentage || 0}%</span>
                  </div>
                  <Progress value={strategy.progressPercentage || 0} className="h-3" />
                  <div className="flex gap-4 text-xs text-gray-500 mt-2">
                    <span>Trades: {strategy.progressTrades || 0}</span>
                    <span>Win Rate: {strategy.progressWinRate || 0}%</span>
                    <span>Started: {new Date(strategy.generatedAt || '').toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Feasibility & Growth Strategy */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-400" />
                    Feasibility
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge className={`text-sm mb-2 ${
                    plan.feasibility === 'ACHIEVABLE' ? 'bg-green-500/20 text-green-400' :
                    plan.feasibility === 'AGGRESSIVE' ? 'bg-orange-500/20 text-orange-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {plan.feasibility}
                  </Badge>
                  <p className="text-gray-300 text-sm">{plan.feasibilityReason}</p>
                  {plan.suggestedTarget && plan.suggestedTarget !== strategy.profitTarget && (
                    <p className="text-amber-400 text-xs mt-2">AI suggests: ${plan.suggestedTarget}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    AI Growth Strategy
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-300 text-sm mb-3">{plan.growthStrategy}</p>
                  <ul className="space-y-1">
                    {(plan.keyInsights || []).map((insight: string, i: number) => (
                      <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                        <Zap className="w-3 h-3 text-orange-400 mt-1 flex-shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

            {/* Compound Growth Projection */}
            {plan.compoundGrowth && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    Compound Growth Projection
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-5 gap-2">
                    {dayNames.map(day => {
                      const dayKey = day.toLowerCase();
                      const cg = plan.compoundGrowth[dayKey];
                      if (!cg) return null;
                      return (
                        <div key={day} className="bg-gray-900/50 rounded-lg p-3 text-center">
                          <p className="text-gray-400 text-xs font-medium">{day.substring(0, 3)}</p>
                          <p className="text-green-400 font-bold text-sm">${cg.endBalance}</p>
                          <p className="text-gray-500 text-[10px]">+${(cg.endBalance - cg.startBalance).toFixed(0)}</p>
                          <p className="text-gray-600 text-[10px]">{cg.trades} trades</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Weekly Projection */}
            {plan.weeklyProjection && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardContent className="p-4">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <p className="text-red-400 text-xs">Worst Case</p>
                      <p className="text-white font-bold text-lg">${plan.weeklyProjection.worstCase}</p>
                    </div>
                    <div>
                      <p className="text-orange-400 text-xs">Expected</p>
                      <p className="text-white font-bold text-lg">${plan.weeklyProjection.expected}</p>
                    </div>
                    <div>
                      <p className="text-green-400 text-xs">Best Case</p>
                      <p className="text-white font-bold text-lg">${plan.weeklyProjection.bestCase}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Risk Management */}
            {plan.riskManagement && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5 text-red-400" />
                    AI Risk Controls
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs">Max Daily Loss</p>
                      <p className="text-red-400 font-bold">${plan.riskManagement.maxDailyLoss}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs">Max Daily Trades</p>
                      <p className="text-white font-bold">{plan.riskManagement.maxDailyTrades}</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs">Risk Per Trade</p>
                      <p className="text-orange-400 font-bold">{plan.riskManagement.riskPerTrade}%</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs">Trailing Stop</p>
                      <p className="text-purple-400 font-bold">{plan.riskManagement.trailingStopMode || plan.riskManagement.trailingStopRecommendation || 'AI'}</p>
                    </div>
                  </div>
                  {plan.riskManagement.dailyStopRule && (
                    <div className="mt-3 bg-red-900/20 border border-red-500/20 rounded-lg p-3">
                      <p className="text-red-300 text-xs flex items-center gap-2">
                        <AlertCircle className="w-3 h-3" />
                        <strong>Stop Rule:</strong> {plan.riskManagement.dailyStopRule}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Pair Rankings */}
            {plan.pairRankings && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Star className="w-5 h-5 text-amber-400" />
                    Pair Rankings
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {plan.pairRankings.map((pr: any, i: number) => (
                      <div key={i} className="flex items-center justify-between bg-gray-900/50 rounded-lg p-3">
                        <div className="flex items-center gap-3">
                          <span className="text-orange-400 font-bold text-lg">#{i + 1}</span>
                          <div>
                            <span className="text-white font-semibold">{pr.symbol}</span>
                            <p className="text-gray-400 text-xs">Best: {pr.bestDay} / {pr.bestSession}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm text-white">Score: {pr.overallScore}%</p>
                            <p className="text-xs text-gray-400">
                              {pr.optimalLotSize ? `${pr.optimalLotSize} lots` : `WR: ${pr.winRate}%`}
                              {pr.avgPipsPerTrade ? ` | ~${pr.avgPipsPerTrade} pips` : ''}
                            </p>
                          </div>
                          <Badge className={`text-xs ${
                            pr.recommendation === 'Primary' ? 'bg-green-500/20 text-green-400' :
                            pr.recommendation === 'Secondary' ? 'bg-amber-500/20 text-amber-400' :
                            'bg-red-500/20 text-red-400'
                          }`}>
                            {pr.recommendation}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Daily Plan */}
            <Card className="bg-gray-800/50 border-gray-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-white text-lg flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-green-400" />
                  Daily Battle Plan
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {dayNames.map(day => {
                  const dayPlan = plan.weeklyPlan?.[day];
                  if (!dayPlan) return null;
                  return (
                    <div key={day} className="bg-gray-900/50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <h4 className="text-white font-semibold flex items-center gap-2">
                          <ChevronRight className="w-4 h-4 text-orange-400" />
                          {day}
                        </h4>
                        <div className="flex gap-2">
                          {dayPlan.dailyTarget && (
                            <Badge className="bg-green-500/20 text-green-400">
                              Target: ${dayPlan.dailyTarget}
                            </Badge>
                          )}
                          {dayPlan.projectedBalance && (
                            <Badge className="bg-blue-500/20 text-blue-400">
                              Balance: ${dayPlan.projectedBalance}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        {(dayPlan.pairs || []).map((p: any, i: number) => (
                          <div key={i} className="bg-gray-800/50 rounded p-3 text-sm space-y-1">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-white font-medium">{p.symbol}</span>
                                <Badge className={`text-[10px] ${
                                  p.direction === 'BUY' ? 'bg-green-500/20 text-green-400' :
                                  p.direction === 'SELL' ? 'bg-red-500/20 text-red-400' :
                                  'bg-gray-500/20 text-gray-400'
                                }`}>
                                  {p.direction}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] text-gray-400">
                                  <Clock className="w-2.5 h-2.5 mr-1" />
                                  {p.session}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-3 text-xs">
                                <span className="text-purple-400">AI: {p.confidence}%</span>
                                <span className="text-gray-400">~{p.estimatedPips} pips</span>
                                <span className="text-orange-400 font-medium">{p.lotSize} lots</span>
                                <span className="text-gray-500">max {p.maxTrades}</span>
                              </div>
                            </div>
                            {p.entryCondition && (
                              <p className="text-gray-500 text-xs pl-2 border-l-2 border-orange-500/30">
                                Entry: {p.entryCondition}
                              </p>
                            )}
                            {p.reason && (
                              <p className="text-gray-600 text-xs italic pl-2">{p.reason}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Historical Stats */}
            {strategy.pairStats && Object.keys(strategy.pairStats).length > 0 && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    Your Data (Used by AI)
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {Object.entries(strategy.pairStats).map(([pair, stats]: [string, any]) => (
                      <div key={pair} className="bg-gray-900/50 rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-white font-semibold">{pair}</span>
                          <Badge className={`text-xs ${stats.winRate >= 55 ? 'bg-green-500/20 text-green-400' : stats.winRate >= 45 ? 'bg-amber-500/20 text-amber-400' : 'bg-red-500/20 text-red-400'}`}>
                            {stats.winRate}% WR
                          </Badge>
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-xs">
                          <div>
                            <p className="text-gray-500">Trades</p>
                            <p className="text-white">{stats.totalTrades}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Avg Win</p>
                            <p className="text-green-400">${stats.avgWin}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">Avg Loss</p>
                            <p className="text-red-400">-${stats.avgLoss}</p>
                          </div>
                        </div>
                        <div className="flex gap-2 mt-2 text-[10px]">
                          <span className="text-gray-500">BUY: {stats.buyWinRate}%</span>
                          <span className="text-gray-500">SELL: {stats.sellWinRate}%</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="text-center">
              <Button variant="outline" onClick={() => deleteMutation.mutate()} className="text-gray-400">
                Clear & Create New Growth Plan
              </Button>
            </div>
          </div>
        ) : (
          /* Setup Form */
          <Card className="bg-gray-800/50 border-gray-700 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Rocket className="w-5 h-5 text-orange-400" />
                Set Your Account Growth Target
              </CardTitle>
              <CardDescription>
                Tell the AI where you are and where you want to be. It handles the rest - lot sizing, risk, entries, everything.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Quick Presets */}
              <div className="space-y-2">
                <Label className="text-gray-300">Quick Growth Presets</Label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { balance: '100', target: '400', label: '$100 → $500' },
                    { balance: '100', target: '700', label: '$100 → $800' },
                    { balance: '200', target: '800', label: '$200 → $1,000' },
                  ].map(preset => (
                    <Button
                      key={preset.label}
                      variant="outline"
                      size="sm"
                      className={`text-xs ${
                        accountBalance === preset.balance && profitTarget === preset.target
                          ? 'border-orange-500 text-orange-400 bg-orange-500/10'
                          : 'border-gray-700 text-gray-400'
                      }`}
                      onClick={() => { setAccountBalance(preset.balance); setProfitTarget(preset.target); }}
                    >
                      {preset.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Starting Balance ($)</Label>
                  <Input
                    type="number"
                    value={accountBalance}
                    onChange={(e) => setAccountBalance(e.target.value)}
                    placeholder="100"
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Profit Target ($)</Label>
                  <Input
                    type="number"
                    value={profitTarget}
                    onChange={(e) => setProfitTarget(e.target.value)}
                    placeholder="400"
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
              </div>

              {/* Growth Preview */}
              {accountBalance && profitTarget && parseFloat(accountBalance) > 0 && (
                <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 rounded-lg p-4 border border-orange-500/20">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-gray-400 text-xs">Growth Target</p>
                      <p className="text-white font-bold text-xl">
                        ${accountBalance} <ArrowUpRight className="w-4 h-4 inline text-orange-400" /> ${parseFloat(accountBalance) + parseFloat(profitTarget)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-gray-400 text-xs">Multiplier</p>
                      <p className="text-orange-400 font-bold text-xl">{formGrowthMultiplier}x</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-gray-300">Lot Size (optional - AI will decide if blank)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={lotSize}
                  onChange={(e) => setLotSize(e.target.value)}
                  placeholder="Let AI decide"
                  className="bg-gray-900 border-gray-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Select Pairs to Trade</Label>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_PAIRS.map(pair => (
                    <Badge
                      key={pair}
                      className={`cursor-pointer text-xs transition-all ${
                        selectedPairs.includes(pair)
                          ? 'bg-orange-500/30 text-orange-300 border-orange-500/50'
                          : 'bg-gray-900 text-gray-500 border-gray-700 hover:border-gray-500'
                      }`}
                      onClick={() => togglePair(pair)}
                    >
                      {selectedPairs.includes(pair) && <CheckCircle className="w-3 h-3 mr-1" />}
                      {pair}
                    </Badge>
                  ))}
                </div>
                <div className="flex gap-2 mt-2">
                  <Input
                    value={pairInput}
                    onChange={(e) => setPairInput(e.target.value)}
                    placeholder="Add custom pair..."
                    className="bg-gray-900 border-gray-700 text-white flex-1"
                    onKeyDown={(e) => e.key === 'Enter' && addCustomPair()}
                  />
                  <Button variant="outline" size="sm" onClick={addCustomPair}>Add</Button>
                </div>
                {selectedPairs.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Selected: {selectedPairs.join(', ')}
                  </p>
                )}
              </div>

              <div className="bg-gray-900/50 rounded-lg p-4 border border-orange-500/20">
                <h4 className="text-sm text-orange-300 mb-2 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-orange-400" />
                  Full AI Control Mode
                </h4>
                <ul className="text-xs text-gray-400 space-y-1">
                  <li className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" /> AI decides all trade entries, exits, and lot sizing</li>
                  <li className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" /> No EA score gates - AI is the sole decision maker</li>
                  <li className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" /> Compound growth strategy (profits reinvested daily)</li>
                  <li className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" /> Specific entry conditions and session timing for each trade</li>
                  <li className="flex items-center gap-1"><Flame className="w-3 h-3 text-orange-500" /> Uses your actual trade history for edge optimization</li>
                </ul>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white font-semibold py-6 text-lg"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || selectedPairs.length === 0}
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
                    AI is building your growth plan...
                  </>
                ) : (
                  <>
                    <Rocket className="w-5 h-5 mr-2" />
                    Generate Growth Strategy
                  </>
                )}
              </Button>

              {selectedPairs.length === 0 && (
                <p className="text-red-400 text-xs text-center">Select at least one pair to continue</p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
