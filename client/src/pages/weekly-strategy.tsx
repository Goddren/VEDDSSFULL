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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ArrowLeft, Target, TrendingUp, DollarSign, BarChart3,
  Calendar, Clock, Shield, Brain, RefreshCw, Trash2,
  CheckCircle, AlertCircle, Zap, ChevronRight, Star
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

type ProgressData = {
  currentProfit: number;
  progressTrades: number;
  progressWinRate: number;
  progressPercentage: number;
  targetRemaining: number;
  daysRemaining: number;
};

export default function WeeklyStrategyPage() {
  const { toast } = useToast();
  const [profitTarget, setProfitTarget] = useState("500");
  const [accountBalance, setAccountBalance] = useState("10000");
  const [riskLevel, setRiskLevel] = useState("moderate");
  const [lotSize, setLotSize] = useState("");
  const [selectedPairs, setSelectedPairs] = useState<string[]>(["EURUSD", "GBPUSD", "XAUUSD"]);
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
        riskLevel,
        lotSize: lotSize || undefined,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/weekly-strategy'] });
      toast({ title: "Strategy Generated", description: "Your weekly trading plan is ready!" });
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to generate strategy", variant: "destructive" });
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
      toast({ title: "Strategy Cleared", description: "Ready to create a new plan" });
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
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/30">
            <Target className="w-8 h-8 text-amber-400" />
            <h1 className="text-3xl font-bold text-white">Weekly Profit Strategist</h1>
          </div>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            AI-powered weekly trading plan based on your history, confidence grades, and market conditions
          </p>
        </motion.div>

        {strategy?.hasStrategy && plan ? (
          <div className="space-y-6">
            {/* Progress Tracker */}
            <Card className="border-2 border-amber-500/30 bg-gradient-to-r from-amber-900/20 to-orange-900/20">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-amber-400 flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Weekly Target: ${strategy.profitTarget}
                    </h3>
                    <p className="text-gray-400 text-sm">
                      {strategy.pairs?.join(', ')} | {strategy.riskLevel} risk | Balance: ${strategy.accountBalance}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updateProgressMutation.mutate()} disabled={updateProgressMutation.isPending}>
                      <RefreshCw className={`w-4 h-4 mr-1 ${updateProgressMutation.isPending ? 'animate-spin' : ''}`} />
                      Update Progress
                    </Button>
                    <Button size="sm" variant="outline" className="text-red-400 border-red-500/30" onClick={() => deleteMutation.mutate()}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Progress: ${strategy.currentProfit || 0} / ${strategy.profitTarget}</span>
                    <span className="text-amber-400">{strategy.progressPercentage || 0}%</span>
                  </div>
                  <Progress value={strategy.progressPercentage || 0} className="h-3" />
                  <div className="flex gap-4 text-xs text-gray-500 mt-2">
                    <span>Trades: {strategy.progressTrades || 0}</span>
                    <span>Win Rate: {strategy.progressWinRate || 0}%</span>
                    <span>Generated: {new Date(strategy.generatedAt || '').toLocaleDateString()}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Feasibility & Key Insights */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Shield className="w-5 h-5 text-blue-400" />
                    Feasibility Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge className={`text-sm mb-2 ${
                    plan.feasibility === 'HIGH' ? 'bg-green-500/20 text-green-400' :
                    plan.feasibility === 'MEDIUM' ? 'bg-amber-500/20 text-amber-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {plan.feasibility} Feasibility
                  </Badge>
                  <p className="text-gray-300 text-sm">{plan.feasibilityReason}</p>
                  {plan.suggestedTarget !== strategy.profitTarget && (
                    <p className="text-amber-400 text-xs mt-2">Suggested target: ${plan.suggestedTarget}</p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <Brain className="w-5 h-5 text-purple-400" />
                    Key Insights
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-1">
                    {(plan.keyInsights || []).map((insight: string, i: number) => (
                      <li key={i} className="text-gray-300 text-sm flex items-start gap-2">
                        <Zap className="w-3 h-3 text-amber-400 mt-1 flex-shrink-0" />
                        {insight}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>

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
                      <p className="text-amber-400 text-xs">Expected</p>
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
                    Risk Management Rules
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
                      <p className="text-amber-400 font-bold">{plan.riskManagement.riskPerTrade}%</p>
                    </div>
                    <div className="bg-gray-900/50 rounded-lg p-3 text-center">
                      <p className="text-gray-400 text-xs">AI Confidence Min</p>
                      <p className="text-purple-400 font-bold">{plan.riskManagement.aiConfidenceMinimum}%</p>
                    </div>
                  </div>
                  {plan.riskManagement.trailingStopRecommendation && (
                    <p className="text-gray-400 text-xs mt-2">
                      Trailing Stop: <span className="text-white">{plan.riskManagement.trailingStopRecommendation}</span>
                    </p>
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
                          <span className="text-amber-400 font-bold text-lg">#{i + 1}</span>
                          <div>
                            <span className="text-white font-semibold">{pr.symbol}</span>
                            <p className="text-gray-400 text-xs">Best: {pr.bestDay} / {pr.bestSession}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-sm text-white">Score: {pr.overallScore}%</p>
                            <p className="text-xs text-gray-400">Win Rate: {pr.winRate}%</p>
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
                  Daily Trading Plan
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
                          <ChevronRight className="w-4 h-4 text-green-400" />
                          {day}
                        </h4>
                        {dayPlan.dailyTarget && (
                          <Badge className="bg-green-500/20 text-green-400">
                            Target: ${dayPlan.dailyTarget}
                          </Badge>
                        )}
                      </div>
                      <div className="space-y-2">
                        {(dayPlan.pairs || []).map((p: any, i: number) => (
                          <div key={i} className="flex items-center justify-between bg-gray-800/50 rounded p-2 text-sm">
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
                              <span className="text-amber-400">{p.lotSize} lots</span>
                              <span className="text-gray-500">max {p.maxTrades} trades</span>
                            </div>
                          </div>
                        ))}
                      </div>
                      {dayPlan.pairs?.[0]?.reason && (
                        <p className="text-gray-500 text-xs italic pl-6">{dayPlan.pairs[0].reason}</p>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Historical Stats Used */}
            {strategy.pairStats && Object.keys(strategy.pairStats).length > 0 && (
              <Card className="bg-gray-800/50 border-gray-700">
                <CardHeader className="pb-2">
                  <CardTitle className="text-white text-lg flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-blue-400" />
                    Your Historical Data (Used for Strategy)
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

            {/* Generate New */}
            <div className="text-center">
              <Button variant="outline" onClick={() => deleteMutation.mutate()} className="text-gray-400">
                Clear & Create New Strategy
              </Button>
            </div>
          </div>
        ) : (
          /* Setup Form */
          <Card className="bg-gray-800/50 border-gray-700 max-w-2xl mx-auto">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Target className="w-5 h-5 text-amber-400" />
                Set Your Weekly Goal
              </CardTitle>
              <CardDescription>
                The AI will analyze your trading history and create a personalized plan to hit your target
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-gray-300">Weekly Profit Target ($)</Label>
                  <Input
                    type="number"
                    value={profitTarget}
                    onChange={(e) => setProfitTarget(e.target.value)}
                    placeholder="500"
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Account Balance ($)</Label>
                  <Input
                    type="number"
                    value={accountBalance}
                    onChange={(e) => setAccountBalance(e.target.value)}
                    placeholder="10000"
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Risk Level</Label>
                  <Select value={riskLevel} onValueChange={setRiskLevel}>
                    <SelectTrigger className="bg-gray-900 border-gray-700 text-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="conservative">Conservative (1-2% risk)</SelectItem>
                      <SelectItem value="moderate">Moderate (2-3% risk)</SelectItem>
                      <SelectItem value="aggressive">Aggressive (3-5% risk)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-gray-300">Lot Size (optional)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={lotSize}
                    onChange={(e) => setLotSize(e.target.value)}
                    placeholder="Auto-calculate"
                    className="bg-gray-900 border-gray-700 text-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-gray-300">Select Pairs to Trade</Label>
                <div className="flex flex-wrap gap-2">
                  {POPULAR_PAIRS.map(pair => (
                    <Badge
                      key={pair}
                      className={`cursor-pointer text-xs transition-all ${
                        selectedPairs.includes(pair)
                          ? 'bg-amber-500/30 text-amber-300 border-amber-500/50'
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

              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                <h4 className="text-sm text-gray-300 mb-2 flex items-center gap-2">
                  <Brain className="w-4 h-4 text-purple-400" />
                  What the AI will use:
                </h4>
                <ul className="text-xs text-gray-500 space-y-1">
                  <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Your trade history (win rates, best days, sessions)</li>
                  <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Direction bias per pair (BUY vs SELL performance)</li>
                  <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Current EA settings (AI override, trailing stops, confidence)</li>
                  <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Live market conditions from connected pairs</li>
                  <li className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-green-500" /> Confidence-based trade selection and ranking</li>
                </ul>
              </div>

              <Button
                className="w-full bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-semibold"
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending || selectedPairs.length === 0}
              >
                {generateMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    AI is building your plan...
                  </>
                ) : (
                  <>
                    <Brain className="w-4 h-4 mr-2" />
                    Generate Weekly Strategy
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
