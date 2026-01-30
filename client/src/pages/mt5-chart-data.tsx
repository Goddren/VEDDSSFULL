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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { 
  ArrowLeft,
  Activity,
  AlertCircle,
  RefreshCw,
  Copy,
  Download,
  Key,
  Zap,
  CheckCircle,
  XCircle,
  Clock,
  Plus,
  Trash2,
  Eye,
  EyeOff,
  TrendingUp,
  BarChart3,
  Layers,
  Target,
  Shield,
  BookOpen,
  Brain,
  Lightbulb,
  Calendar,
  Search
} from "lucide-react";
import { motion } from "framer-motion";
import { ConnectedPairs } from "@/components/mt5/connected-pairs";

type AiAccuracy = {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
  allTime: number;
  totalTrades: number;
  wins: number;
  losses: number;
};

function AiAccuracyDashboard() {
  const { data: accuracy, isLoading, refetch } = useQuery<AiAccuracy>({
    queryKey: ['/api/ai-trade-accuracy'],
    refetchInterval: 60000,
  });

  const getAccuracyColor = (value: number) => {
    if (value >= 70) return 'text-green-400';
    if (value >= 50) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getAccuracyBg = (value: number) => {
    if (value >= 70) return 'bg-green-900/20 border-green-500/30';
    if (value >= 50) return 'bg-yellow-900/20 border-yellow-500/30';
    return 'bg-red-900/20 border-red-500/30';
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <Card className="bg-gradient-to-br from-purple-900/30 to-blue-900/30 border-purple-500/30">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-purple-400" />
              AI Trade Accuracy
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription>
            Track the accuracy of AI trading signals over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="w-8 h-8 animate-spin text-purple-400" />
            </div>
          ) : accuracy ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className={`p-4 rounded-lg border ${getAccuracyBg(accuracy.daily)}`}>
                  <p className="text-gray-400 text-sm">Today</p>
                  <p className={`text-3xl font-bold ${getAccuracyColor(accuracy.daily)}`}>
                    {accuracy.daily}%
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${getAccuracyBg(accuracy.weekly)}`}>
                  <p className="text-gray-400 text-sm">This Week</p>
                  <p className={`text-3xl font-bold ${getAccuracyColor(accuracy.weekly)}`}>
                    {accuracy.weekly}%
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${getAccuracyBg(accuracy.monthly)}`}>
                  <p className="text-gray-400 text-sm">This Month</p>
                  <p className={`text-3xl font-bold ${getAccuracyColor(accuracy.monthly)}`}>
                    {accuracy.monthly}%
                  </p>
                </div>
                <div className={`p-4 rounded-lg border ${getAccuracyBg(accuracy.yearly)}`}>
                  <p className="text-gray-400 text-sm">This Year</p>
                  <p className={`text-3xl font-bold ${getAccuracyColor(accuracy.yearly)}`}>
                    {accuracy.yearly}%
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                <div className="flex items-center gap-6">
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide">All Time</p>
                    <p className={`text-2xl font-bold ${getAccuracyColor(accuracy.allTime)}`}>
                      {accuracy.allTime}%
                    </p>
                  </div>
                  <div className="h-8 w-px bg-gray-700" />
                  <div>
                    <p className="text-gray-500 text-xs uppercase tracking-wide">Total Trades</p>
                    <p className="text-xl font-semibold text-white">{accuracy.totalTrades}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-green-400 font-medium">{accuracy.wins} Wins</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-red-400 font-medium">{accuracy.losses} Losses</span>
                  </div>
                </div>
              </div>

              {accuracy.totalTrades === 0 && (
                <p className="text-center text-gray-500 text-sm">
                  No trades recorded yet. Your AI accuracy will appear here as you complete trades.
                </p>
              )}
            </div>
          ) : (
            <p className="text-center text-gray-400 py-4">Unable to load accuracy data</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

type ReversalAlert = {
  tradeId: number;
  symbol: string;
  tradeDirection: string;
  newSignal: string;
  confidence: number;
  reversalStrength: string;
  timeframe: string;
  analysisTime: string;
  message: string;
};

type ReversalData = {
  reversals: ReversalAlert[];
  openTradesCount: number;
  message: string;
};

type TradeHistoryAnalysis = {
  symbol: string;
  totalTrades: number;
  completedTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  patterns: Array<{ type: string; description: string; severity: string }>;
  worstHour: { hour: number; losses: number } | null;
  worstDay: { day: string; losses: number } | null;
  directionStats: { BUY: number; SELL: number };
  maxLossStreak: number;
  message?: string;
};

type PropFirmSettings = {
  enabled: boolean;
  dailyDrawdownLimit: number;
  maxDrawdownLimit: number;
  dailyLossLimit: number;
  maxLotSize: number;
  maxOpenTrades: number;
  noTradingDuringNews: boolean;
  stopLossRequired: boolean;
  minRiskRewardRatio: number;
  notes: string;
};

type EASettings = {
  symbol: string;
  directionBias: 'BOTH' | 'BUY_ONLY' | 'SELL_ONLY';
  hoursToAvoid: number[];
  daysToAvoid: string[];
  recommendedTimeframes: string[];
  tradeOnNewCandle: boolean;
  maxTradesPerDay: number;
  minConfidenceLevel: number;
  notes: string;
  propFirmSettings?: PropFirmSettings;
};

type StrategyImprovement = {
  symbol: string;
  winRate: number;
  totalTrades: number;
  recommendations: string[];
  eaSettings?: EASettings;
  rawAnalysis?: string;
};

type EALearningRec = {
  symbol: string;
  totalTrades: number;
  winRate: number;
  avgWinPL: number;
  avgLossPL: number;
  directionBias: number;
  directionBiasLabel: string;
  avoidHours: number[];
  avoidDays: string[];
  suggestedSettings: Record<string, any>;
};

type EALearningData = {
  hasData: boolean;
  message?: string;
  analyzedTrades?: number;
  lastUpdated?: string;
  recommendations?: Record<string, EALearningRec>;
  closedTradesCount?: number;
};

function TradeHistoryLearning() {
  const { toast } = useToast();
  const [symbol, setSymbol] = useState('');
  const [searchedSymbol, setSearchedSymbol] = useState('');
  
  // Fetch EA-synced learning recommendations from MT5
  const { data: eaLearning } = useQuery<EALearningData>({
    queryKey: ['/api/mt5/learning-recommendations'],
    refetchInterval: 30000,
  });
  
  const { data: analysis, isLoading: analysisLoading, refetch: refetchAnalysis } = useQuery<TradeHistoryAnalysis>({
    queryKey: ['/api/trade-history-learning', searchedSymbol],
    queryFn: async () => {
      const res = await fetch(`/api/trade-history-learning/${searchedSymbol}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch analysis');
      return res.json();
    },
    enabled: !!searchedSymbol,
  });
  
  const improveMutation = useMutation({
    mutationFn: async (sym: string) => {
      const res = await apiRequest('POST', `/api/trade-history-learning/${sym}/improve`);
      return res.json() as Promise<StrategyImprovement>;
    },
    onError: (error: Error) => {
      toast({
        title: "Analysis Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const handleSearch = () => {
    if (symbol.trim()) {
      setSearchedSymbol(symbol.trim().toUpperCase());
    }
  };
  
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-900/50 text-red-400 border-red-500';
      case 'HIGH': return 'bg-orange-900/50 text-orange-400 border-orange-500';
      case 'MEDIUM': return 'bg-yellow-900/50 text-yellow-400 border-yellow-500';
      default: return 'bg-gray-800 text-gray-400 border-gray-600';
    }
  };
  
  return (
    <Card className="bg-gray-900/50 border-gold/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-gold">
          <Brain className="w-5 h-5" />
          Trade History Learning
        </CardTitle>
        <CardDescription>
          Analyze your past trades by pair to identify patterns and generate AI strategy improvements
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <Input
              placeholder="Enter symbol (e.g. XAUUSD, BTCUSD)"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              className="pl-10 bg-gray-800/50 border-gray-700 text-white"
            />
          </div>
          <Button onClick={handleSearch} disabled={!symbol.trim() || analysisLoading}>
            {analysisLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Analyze'}
          </Button>
        </div>
        
        {analysis && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            {analysis.message ? (
              <div className="text-center py-6 text-gray-400">
                <AlertCircle className="w-8 h-8 mx-auto mb-2 text-yellow-500/50" />
                <p>{analysis.message}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-white">{analysis.completedTrades}</div>
                    <div className="text-xs text-gray-500">Total Trades</div>
                  </div>
                  <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                    <div className={`text-2xl font-bold ${analysis.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      {analysis.winRate}%
                    </div>
                    <div className="text-xs text-gray-500">Win Rate</div>
                  </div>
                  <div className="bg-green-900/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-green-400">{analysis.wins}</div>
                    <div className="text-xs text-gray-500">Wins</div>
                  </div>
                  <div className="bg-red-900/30 rounded-lg p-3 text-center">
                    <div className="text-2xl font-bold text-red-400">{analysis.losses}</div>
                    <div className="text-xs text-gray-500">Losses</div>
                  </div>
                </div>
                
                {analysis.patterns.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-white flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-yellow-500" />
                      Loss Patterns Detected
                    </h4>
                    <div className="space-y-2">
                      {analysis.patterns.map((pattern, i) => (
                        <div key={i} className={`p-3 rounded-lg border ${getSeverityColor(pattern.severity)}`}>
                          <div className="flex items-center justify-between">
                            <span className="text-sm">{pattern.description}</span>
                            <Badge className={getSeverityColor(pattern.severity)}>
                              {pattern.severity}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                  {analysis.worstHour && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Clock className="w-4 h-4 text-yellow-500" />
                        <span className="text-xs text-gray-400">Worst Trading Hour</span>
                      </div>
                      <div className="text-lg font-bold text-white">{analysis.worstHour.hour}:00</div>
                      <div className="text-xs text-red-400">{analysis.worstHour.losses} losses</div>
                    </div>
                  )}
                  {analysis.worstDay && (
                    <div className="bg-gray-800/50 rounded-lg p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <Calendar className="w-4 h-4 text-yellow-500" />
                        <span className="text-xs text-gray-400">Worst Day</span>
                      </div>
                      <div className="text-lg font-bold text-white">{analysis.worstDay.day}</div>
                      <div className="text-xs text-red-400">{analysis.worstDay.losses} losses</div>
                    </div>
                  )}
                </div>
                
                {analysis.maxLossStreak > 0 && (
                  <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                    <div className="text-sm text-red-400">
                      Max Losing Streak: <span className="font-bold">{analysis.maxLossStreak} trades</span>
                    </div>
                  </div>
                )}
                
                <Button
                  className="w-full bg-gold hover:bg-gold/90 text-black"
                  onClick={() => improveMutation.mutate(analysis.symbol)}
                  disabled={improveMutation.isPending}
                >
                  {improveMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin mr-2" />
                      Generating AI Strategy...
                    </>
                  ) : (
                    <>
                      <Lightbulb className="w-4 h-4 mr-2" />
                      Generate AI Strategy Improvements
                    </>
                  )}
                </Button>
                
                {improveMutation.data && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="bg-gradient-to-br from-gold/10 to-gold/5 border border-gold/30 rounded-lg p-4"
                  >
                    <h4 className="text-sm font-medium text-gold flex items-center gap-2 mb-3">
                      <Lightbulb className="w-4 h-4" />
                      AI Strategy Recommendations for {improveMutation.data.symbol}
                    </h4>
                    <div className="space-y-2">
                      {improveMutation.data.recommendations.map((rec, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-gray-300">
                          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span>{rec}</span>
                        </div>
                      ))}
                    </div>
                    
                    {improveMutation.data.eaSettings && (
                      <div className="mt-4 pt-4 border-t border-gold/20">
                        <h4 className="text-sm font-medium text-white flex items-center gap-2 mb-3">
                          <Target className="w-4 h-4 text-amber-400" />
                          Recommended EA Settings for {improveMutation.data.symbol}
                        </h4>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="bg-gray-800/50 rounded p-2">
                            <div className="text-gray-500 text-xs">Direction Bias</div>
                            <div className={`font-medium ${
                              improveMutation.data.eaSettings.directionBias === 'BUY_ONLY' ? 'text-green-400' :
                              improveMutation.data.eaSettings.directionBias === 'SELL_ONLY' ? 'text-red-400' : 'text-white'
                            }`}>
                              {improveMutation.data.eaSettings.directionBias.replace('_', ' ')}
                            </div>
                          </div>
                          <div className="bg-gray-800/50 rounded p-2">
                            <div className="text-gray-500 text-xs">Min Confidence</div>
                            <div className="font-medium text-white">{improveMutation.data.eaSettings.minConfidenceLevel}%</div>
                          </div>
                          <div className="bg-gray-800/50 rounded p-2">
                            <div className="text-gray-500 text-xs">Max Trades/Day</div>
                            <div className="font-medium text-white">{improveMutation.data.eaSettings.maxTradesPerDay}</div>
                          </div>
                          <div className="bg-gray-800/50 rounded p-2">
                            <div className="text-gray-500 text-xs">Trade on New Candle</div>
                            <div className="font-medium text-green-400">
                              {improveMutation.data.eaSettings.tradeOnNewCandle ? 'Yes' : 'No'}
                            </div>
                          </div>
                        </div>
                        
                        {improveMutation.data.eaSettings.hoursToAvoid.length > 0 && (
                          <div className="mt-3 bg-red-900/20 border border-red-500/30 rounded p-2">
                            <div className="text-xs text-red-400 flex items-center gap-1 mb-1">
                              <AlertCircle className="w-3 h-3" />
                              Avoid Trading at These Hours
                            </div>
                            <div className="text-white text-sm font-medium">
                              {improveMutation.data.eaSettings.hoursToAvoid.map(h => `${h}:00`).join(', ')}
                            </div>
                          </div>
                        )}
                        
                        {improveMutation.data.eaSettings.daysToAvoid.length > 0 && (
                          <div className="mt-2 bg-orange-900/20 border border-orange-500/30 rounded p-2">
                            <div className="text-xs text-orange-400 flex items-center gap-1 mb-1">
                              <Calendar className="w-3 h-3" />
                              Avoid Trading on These Days
                            </div>
                            <div className="text-white text-sm font-medium">
                              {improveMutation.data.eaSettings.daysToAvoid.join(', ')}
                            </div>
                          </div>
                        )}
                        
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full mt-3 border-gold/50 text-gold hover:bg-gold/10"
                          onClick={() => {
                            const settings = improveMutation.data?.eaSettings;
                            if (!settings) return;
                            const dayMap: { [key: string]: number } = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
                            const daysNumeric = settings.daysToAvoid.map(d => dayMap[d] ?? d).join(', ');
                            const propFirm = settings.propFirmSettings;
                            const text = `VEDD AI Recommended EA Settings for ${settings.symbol}
================================================
Generated from ${improveMutation.data?.totalTrades} trades (${improveMutation.data?.winRate}% win rate)

DIRECTION FILTER:
${settings.directionBias === 'BUY_ONLY' ? '✓ Only take BUY signals (avoid SELL - too many losses)' : 
  settings.directionBias === 'SELL_ONLY' ? '✓ Only take SELL signals (avoid BUY - too many losses)' : 
  '✓ Trade both directions'}

TIME FILTERS:
${settings.hoursToAvoid.length > 0 ? `✗ Avoid trading at hours: ${settings.hoursToAvoid.map(h => h + ':00').join(', ')}` : '✓ No specific hours to avoid'}
${settings.daysToAvoid.length > 0 ? `✗ Avoid trading on: ${settings.daysToAvoid.join(', ')} (Day indices: ${daysNumeric})` : '✓ No specific days to avoid'}

RISK SETTINGS:
• Minimum AI Confidence: ${settings.minConfidenceLevel}%
• Maximum Trades Per Day: ${settings.maxTradesPerDay}
• Trade on New Candle: ${settings.tradeOnNewCandle ? 'Yes (recommended)' : 'No'}

${propFirm ? `PROP FIRM COMPLIANCE:
• Daily Drawdown Limit: ${propFirm.dailyDrawdownLimit}%
• Max Total Drawdown: ${propFirm.maxDrawdownLimit}%
• Daily Loss Limit: ${propFirm.dailyLossLimit}%
• Max Lot Size: ${propFirm.maxLotSize}
• Max Open Trades: ${propFirm.maxOpenTrades}
• Avoid News Trading: ${propFirm.noTradingDuringNews ? 'Yes' : 'No'}
• Stop Loss Required: ${propFirm.stopLossRequired ? 'Yes' : 'No'}
• Min Risk:Reward: 1:${propFirm.minRiskRewardRatio}` : ''}

APPLY THESE SETTINGS:
1. Open your MT5 Chart Data EA settings
2. Set direction filter based on recommendation above
3. Avoid trading during the hours/days listed
4. Set minimum confidence to ${settings.minConfidenceLevel}%
5. Limit daily trades to ${settings.maxTradesPerDay}
${propFirm ? '6. Enable prop firm mode and set drawdown limits' : ''}

${settings.notes}`;
                            navigator.clipboard.writeText(text);
                            toast({
                              title: "EA Settings Copied!",
                              description: "Settings summary copied. Apply these to your EA configuration.",
                            });
                          }}
                        >
                          <Copy className="w-4 h-4 mr-2" />
                          Copy EA Settings Summary
                        </Button>
                        
                        {improveMutation.data.eaSettings.propFirmSettings && (
                          <div className="mt-4 pt-4 border-t border-blue-500/30">
                            <h4 className="text-sm font-medium text-blue-400 flex items-center gap-2 mb-3">
                              <Shield className="w-4 h-4" />
                              Prop Firm Compliance Settings
                            </h4>
                            <p className="text-xs text-gray-400 mb-3">
                              Conservative settings designed for FTMO, MyForexFunds, and similar prop firm challenges.
                            </p>
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div className="bg-blue-900/20 border border-blue-500/20 rounded p-2">
                                <div className="text-gray-500 text-xs">Daily Drawdown Limit</div>
                                <div className="font-medium text-blue-400">
                                  {improveMutation.data.eaSettings.propFirmSettings.dailyDrawdownLimit}%
                                </div>
                              </div>
                              <div className="bg-blue-900/20 border border-blue-500/20 rounded p-2">
                                <div className="text-gray-500 text-xs">Max Total Drawdown</div>
                                <div className="font-medium text-blue-400">
                                  {improveMutation.data.eaSettings.propFirmSettings.maxDrawdownLimit}%
                                </div>
                              </div>
                              <div className="bg-blue-900/20 border border-blue-500/20 rounded p-2">
                                <div className="text-gray-500 text-xs">Daily Loss Limit</div>
                                <div className="font-medium text-orange-400">
                                  {improveMutation.data.eaSettings.propFirmSettings.dailyLossLimit}%
                                </div>
                              </div>
                              <div className="bg-blue-900/20 border border-blue-500/20 rounded p-2">
                                <div className="text-gray-500 text-xs">Max Lot Size</div>
                                <div className="font-medium text-white">
                                  {improveMutation.data.eaSettings.propFirmSettings.maxLotSize}
                                </div>
                              </div>
                              <div className="bg-blue-900/20 border border-blue-500/20 rounded p-2">
                                <div className="text-gray-500 text-xs">Max Open Trades</div>
                                <div className="font-medium text-white">
                                  {improveMutation.data.eaSettings.propFirmSettings.maxOpenTrades}
                                </div>
                              </div>
                              <div className="bg-blue-900/20 border border-blue-500/20 rounded p-2">
                                <div className="text-gray-500 text-xs">Min Risk:Reward</div>
                                <div className="font-medium text-green-400">
                                  1:{improveMutation.data.eaSettings.propFirmSettings.minRiskRewardRatio}
                                </div>
                              </div>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <div className={`flex-1 text-center py-1.5 rounded text-xs ${
                                improveMutation.data.eaSettings.propFirmSettings.noTradingDuringNews 
                                  ? 'bg-green-900/30 border border-green-500/30 text-green-400' 
                                  : 'bg-gray-800/50 text-gray-500'
                              }`}>
                                {improveMutation.data.eaSettings.propFirmSettings.noTradingDuringNews ? '✓' : '✗'} No News Trading
                              </div>
                              <div className={`flex-1 text-center py-1.5 rounded text-xs ${
                                improveMutation.data.eaSettings.propFirmSettings.stopLossRequired 
                                  ? 'bg-green-900/30 border border-green-500/30 text-green-400' 
                                  : 'bg-gray-800/50 text-gray-500'
                              }`}>
                                {improveMutation.data.eaSettings.propFirmSettings.stopLossRequired ? '✓' : '✗'} Stop Loss Required
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        )}
        
        {!analysis && !analysisLoading && (
          <div className="text-center py-8 text-gray-500">
            <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="text-sm">Enter a trading pair to analyze your trade history</p>
            <p className="text-xs mt-1">Example: XAUUSD, BTCUSD, EURUSD</p>
          </div>
        )}
        
        {/* EA-Synced Learning Recommendations */}
        {eaLearning?.hasData && eaLearning.recommendations && Object.keys(eaLearning.recommendations).length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 pt-6 border-t border-gold/20"
          >
            <h4 className="text-sm font-medium text-gold flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4" />
              MT5 Trade History - Live EA Settings Recommendations
              <Badge className="bg-green-500/20 text-green-400 text-xs ml-2">
                {eaLearning.closedTradesCount} trades synced
              </Badge>
            </h4>
            <p className="text-xs text-gray-400 mb-4">
              Based on your closed MT5 trades. Apply these settings directly to your EA inputs.
            </p>
            
            <div className="grid gap-4">
              {Object.values(eaLearning.recommendations).map((rec: EALearningRec) => (
                <div key={rec.symbol} className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white text-lg">{rec.symbol}</span>
                      <Badge className={rec.winRate >= 50 ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                        {rec.winRate}% Win Rate
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">{rec.totalTrades} trades analyzed</span>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <div className="text-xs text-gray-500">Direction Bias</div>
                      <div className={`font-medium ${
                        rec.directionBias === 1 ? 'text-green-400' : 
                        rec.directionBias === 2 ? 'text-red-400' : 'text-white'
                      }`}>
                        {rec.directionBiasLabel}
                      </div>
                    </div>
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <div className="text-xs text-gray-500">Avg Win</div>
                      <div className="font-medium text-green-400">${rec.avgWinPL.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <div className="text-xs text-gray-500">Avg Loss</div>
                      <div className="font-medium text-red-400">-${rec.avgLossPL.toFixed(2)}</div>
                    </div>
                    <div className="bg-gray-900/50 rounded p-2 text-center">
                      <div className="text-xs text-gray-500">EA Setting</div>
                      <code className="font-mono text-gold text-xs">DIRECTION_BIAS={rec.directionBias}</code>
                    </div>
                  </div>
                  
                  {rec.avoidHours.length > 0 && (
                    <div className="bg-red-900/20 border border-red-500/30 rounded p-2 mb-2">
                      <div className="text-xs text-red-400 mb-1">Avoid Hours (high loss rate):</div>
                      <div className="flex flex-wrap gap-1">
                        {rec.avoidHours.map(h => (
                          <span key={h} className="bg-red-900/50 text-red-300 px-2 py-0.5 rounded text-xs">
                            {h}:00 → <code className="font-mono">AVOID_HOUR_{h}=true</code>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {rec.avoidDays.length > 0 && (
                    <div className="bg-orange-900/20 border border-orange-500/30 rounded p-2 mb-2">
                      <div className="text-xs text-orange-400 mb-1">Avoid Days:</div>
                      <div className="flex flex-wrap gap-1">
                        {rec.avoidDays.map(d => (
                          <span key={d} className="bg-orange-900/50 text-orange-300 px-2 py-0.5 rounded text-xs">
                            {d} → <code className="font-mono">AVOID_{d.toUpperCase()}=true</code>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2 border-gold/50 text-gold hover:bg-gold/10"
                    onClick={() => {
                      const settings = `EA Settings for ${rec.symbol}:
DIRECTION_BIAS = ${rec.directionBias} // ${rec.directionBiasLabel}
${rec.avoidHours.map(h => `AVOID_HOUR_${h} = true`).join('\n')}
${rec.avoidDays.map(d => `AVOID_${d.toUpperCase()} = true`).join('\n')}

Win Rate: ${rec.winRate}% from ${rec.totalTrades} trades`;
                      navigator.clipboard.writeText(settings);
                      toast({
                        title: "EA Settings Copied!",
                        description: `Settings for ${rec.symbol} copied to clipboard.`,
                      });
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy {rec.symbol} EA Settings
                  </Button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

function ReversalAlertPanel() {
  const { toast } = useToast();
  const { data: reversalData, isLoading, refetch } = useQuery<ReversalData>({
    queryKey: ['/api/reversal-alerts'],
    refetchInterval: 30000,
  });

  const flipTradeMutation = useMutation({
    mutationFn: async (data: { tradeId: number; symbol: string; currentDirection: string; newDirection: string }) => {
      const res = await apiRequest('POST', '/api/flip-trade', data);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Flip Trade Executed!",
        description: data.message,
      });
      refetch();
      queryClient.invalidateQueries({ queryKey: ['/api/ai-trade-accuracy'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ai-trade-results'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Flip Trade Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'CRITICAL': return 'text-red-400 bg-red-900/30 border-red-500/50';
      case 'HIGH': return 'text-orange-400 bg-orange-900/30 border-orange-500/50';
      case 'MEDIUM': return 'text-yellow-400 bg-yellow-900/30 border-yellow-500/50';
      default: return 'text-blue-400 bg-blue-900/30 border-blue-500/50';
    }
  };

  const getStrengthIcon = (strength: string) => {
    switch (strength) {
      case 'CRITICAL': return <AlertCircle className="w-5 h-5 text-red-400 animate-pulse" />;
      case 'HIGH': return <AlertCircle className="w-5 h-5 text-orange-400" />;
      case 'MEDIUM': return <TrendingUp className="w-5 h-5 text-yellow-400" />;
      default: return <Activity className="w-5 h-5 text-blue-400" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
    >
      <Card className={`border-2 ${reversalData?.reversals?.length ? 'bg-gradient-to-br from-red-900/20 to-orange-900/20 border-red-500/40' : 'bg-gray-800/50 border-gray-700'}`}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-2">
              <Zap className={`w-5 h-5 ${reversalData?.reversals?.length ? 'text-red-400 animate-pulse' : 'text-gray-400'}`} />
              Reversal Detection
              {reversalData?.reversals?.length ? (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 animate-pulse">
                  {reversalData.reversals.length} Alert{reversalData.reversals.length > 1 ? 's' : ''}
                </Badge>
              ) : null}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
          <CardDescription>
            Monitors for AI signal flips on your open trades
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <RefreshCw className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : reversalData?.reversals?.length ? (
            <div className="space-y-3">
              {reversalData.reversals.map((alert, index) => (
                <motion.div
                  key={alert.tradeId}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`p-4 rounded-lg border ${getStrengthColor(alert.reversalStrength)}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      {getStrengthIcon(alert.reversalStrength)}
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-white">{alert.symbol}</span>
                          <Badge className="bg-gray-800 text-gray-300 text-xs">
                            {alert.timeframe}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-300 mb-2">{alert.message}</p>
                        <div className="flex items-center gap-4 text-xs">
                          <span className="text-gray-500">
                            Your Trade: <span className={alert.tradeDirection === 'BUY' ? 'text-green-400' : 'text-red-400'}>{alert.tradeDirection}</span>
                          </span>
                          <span className="text-gray-500">→</span>
                          <span className="text-gray-500">
                            AI Signal: <span className={alert.newSignal === 'BUY' ? 'text-green-400' : 'text-red-400'}>{alert.newSignal}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-white">{alert.confidence}%</div>
                      <div className="text-xs text-gray-500 uppercase tracking-wide">AI Confidence</div>
                      <Badge className={`mt-1 text-xs ${getStrengthColor(alert.reversalStrength)}`}>
                        {alert.reversalStrength} REVERSAL
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-700/50 flex items-center justify-between">
                    <p className="text-xs text-gray-500">
                      Flip to catch reversal & recover losses
                    </p>
                    <Button
                      size="sm"
                      className={`${alert.newSignal === 'BUY' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}`}
                      onClick={() => flipTradeMutation.mutate({
                        tradeId: alert.tradeId,
                        symbol: alert.symbol,
                        currentDirection: alert.tradeDirection,
                        newDirection: alert.newSignal
                      })}
                      disabled={flipTradeMutation.isPending}
                    >
                      {flipTradeMutation.isPending ? (
                        <RefreshCw className="w-4 h-4 animate-spin mr-1" />
                      ) : (
                        <Zap className="w-4 h-4 mr-1" />
                      )}
                      Flip to {alert.newSignal}
                    </Button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6">
              <CheckCircle className="w-12 h-12 text-green-500/50 mx-auto mb-3" />
              <p className="text-green-400 font-medium">All Clear</p>
              <p className="text-gray-500 text-sm mt-1">
                {reversalData?.openTradesCount 
                  ? `Monitoring ${reversalData.openTradesCount} open trade(s) - no reversals detected`
                  : 'No open trades to monitor for reversals'
                }
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

type Mt5ApiToken = {
  id: number;
  userId: number;
  token: string;
  name: string;
  isActive: boolean;
  lastUsedAt: string | null;
  signalCount: number;
  createdAt: string;
};

type ConnectionStatus = {
  connected: boolean;
  lastSeen?: string;
  secondsAgo?: number;
  symbol?: string;
  timeframe?: string;
  broker?: string;
  candleCount?: number;
  message?: string;
};

type AccountData = {
  connected: boolean;
  lastUpdated?: string;
  secondsAgo?: number;
  broker?: string;
  balance: number;
  equity: number;
  margin: number;
  freeMargin: number;
  profit: number;
  credit: number;
  currency: string;
  accountNumber: number;
  accountName: string;
  server: string;
  leverage: number;
  marginLevel: number;
  dailyPnL: number;
  dailyPnLPercent: number;
  openPositions: number;
  pendingOrders: number;
  buyPositions: number;
  sellPositions: number;
  totalBuyLots: number;
  totalSellLots: number;
  unrealizedProfit: number;
  message?: string;
};

export default function MT5ChartDataPage() {
  const { toast } = useToast();
  const [newTokenName, setNewTokenName] = useState("");
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<Mt5ApiToken | null>(null);
  const [showToken, setShowToken] = useState<Record<number, boolean>>({});

  const copyToClipboard = (text: string, label = "Copied!") => {
    navigator.clipboard.writeText(text);
    toast({ title: label, description: "Copied to clipboard" });
  };

  const { data: mt5Tokens = [], isLoading: tokensLoading } = useQuery<Mt5ApiToken[]>({
    queryKey: ['/api/mt5-tokens'],
  });

  const { data: mt5ConnectionStatus, refetch: refetchConnectionStatus } = useQuery<ConnectionStatus>({
    queryKey: ['/api/mt5/connection-status'],
    refetchInterval: 30000,
  });

  const { data: accountData, refetch: refetchAccountData } = useQuery<AccountData>({
    queryKey: ['/api/mt5/account-data'],
    refetchInterval: 10000,
  });

  const createTokenMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('POST', '/api/mt5-tokens', { name });
      return res.json();
    },
    onSuccess: (data) => {
      setNewlyCreatedToken(data);
      setNewTokenName("");
      queryClient.invalidateQueries({ queryKey: ['/api/mt5-tokens'] });
      toast({ title: "Token Created!", description: "Copy this token now - it won't be shown again!" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/mt5-tokens/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/mt5-tokens'] });
      toast({ title: "Token Deleted" });
    },
  });

  const apiUrl = `${window.location.origin}/api/mt5/chart-data`;
  const baseUrl = window.location.origin;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <Link href="/webhooks">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Webhooks
            </Button>
          </Link>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4"
        >
          <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-green-500/20 to-teal-500/20 border border-green-500/30">
            <BarChart3 className="w-8 h-8 text-green-400" />
            <h1 className="text-3xl font-bold text-white">MT5 Chart Data EA</h1>
            <Badge className="bg-green-500/20 text-green-400">v3.71</Badge>
          </div>
          <p className="text-gray-400 text-lg max-w-2xl mx-auto">
            Stream live chart data from MetaTrader 5 to VEDD AI for real-time analysis with multi-timeframe support
          </p>
        </motion.div>

        <Card className={`border-2 ${mt5ConnectionStatus?.connected ? 'border-green-500/50 bg-green-900/20' : 'border-gray-700 bg-gray-800/50'}`}>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-4 h-4 rounded-full ${mt5ConnectionStatus?.connected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                <div>
                  <h3 className={`text-xl font-bold ${mt5ConnectionStatus?.connected ? 'text-green-400' : 'text-gray-400'}`}>
                    {mt5ConnectionStatus?.connected ? 'MT5 Connected' : 'MT5 Not Connected'}
                  </h3>
                  <p className="text-gray-400">
                    {mt5ConnectionStatus?.connected 
                      ? `${mt5ConnectionStatus.symbol} ${mt5ConnectionStatus.timeframe} from ${mt5ConnectionStatus.broker}`
                      : 'Start the Chart Data EA on your MT5 terminal to connect'
                    }
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {mt5ConnectionStatus?.connected && mt5ConnectionStatus.secondsAgo !== undefined && (
                  <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                    <Activity className="w-3 h-3 mr-1" />
                    {mt5ConnectionStatus.secondsAgo < 60 
                      ? `${mt5ConnectionStatus.secondsAgo}s ago`
                      : `${Math.floor(mt5ConnectionStatus.secondsAgo / 60)}m ago`
                    }
                  </Badge>
                )}
                <Button variant="outline" size="sm" onClick={() => refetchConnectionStatus()}>
                  <RefreshCw className="w-4 h-4" />
                </Button>
              </div>
            </div>
            {mt5ConnectionStatus?.connected && (
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                <p className="text-sm text-green-300">
                  Hey G, VEDD AI is receiving live data from your chart! Analysis updates appear in your MT5 Experts tab.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Connected Pairs Display */}
        <ConnectedPairs />

        {/* Account Balance Breakdown */}
        {accountData?.connected && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <Card className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 border-amber-500/30">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-amber-400" />
                    Account Balance Breakdown
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                      {accountData.broker}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => refetchAccountData()}>
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <CardDescription>
                  Account #{accountData.accountNumber} • {accountData.server} • 1:{accountData.leverage} Leverage
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Main Balance Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-sm">Balance</p>
                    <p className="text-2xl font-bold text-white">
                      {accountData.currency} {accountData.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-sm">Equity</p>
                    <p className={`text-2xl font-bold ${accountData.equity >= accountData.balance ? 'text-green-400' : 'text-red-400'}`}>
                      {accountData.currency} {accountData.equity.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-sm">Daily P&L</p>
                    <p className={`text-2xl font-bold ${accountData.dailyPnL >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {accountData.dailyPnL >= 0 ? '+' : ''}{accountData.currency} {accountData.dailyPnL.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                    <p className={`text-sm ${accountData.dailyPnLPercent >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {accountData.dailyPnLPercent >= 0 ? '+' : ''}{accountData.dailyPnLPercent.toFixed(2)}%
                    </p>
                  </div>
                  <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                    <p className="text-gray-400 text-sm">Unrealized P&L</p>
                    <p className={`text-2xl font-bold ${accountData.unrealizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {accountData.unrealizedProfit >= 0 ? '+' : ''}{accountData.currency} {accountData.unrealizedProfit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Margin Stats */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-900/30 rounded-lg">
                    <p className="text-gray-500 text-xs">Margin Used</p>
                    <p className="text-lg font-semibold text-white">
                      {accountData.currency} {accountData.margin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-900/30 rounded-lg">
                    <p className="text-gray-500 text-xs">Free Margin</p>
                    <p className="text-lg font-semibold text-green-400">
                      {accountData.currency} {accountData.freeMargin.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-900/30 rounded-lg">
                    <p className="text-gray-500 text-xs">Margin Level</p>
                    <p className={`text-lg font-semibold ${accountData.marginLevel > 200 ? 'text-green-400' : accountData.marginLevel > 100 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {accountData.marginLevel > 0 ? `${accountData.marginLevel.toFixed(1)}%` : 'N/A'}
                    </p>
                  </div>
                  <div className="p-3 bg-gray-900/30 rounded-lg">
                    <p className="text-gray-500 text-xs">Credit</p>
                    <p className="text-lg font-semibold text-gray-400">
                      {accountData.currency} {accountData.credit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>

                {/* Open Positions Breakdown */}
                <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-gray-400 font-medium">Open Positions</p>
                    <Badge className="bg-blue-500/20 text-blue-400">
                      {accountData.openPositions} positions • {accountData.pendingOrders} pending
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center justify-between p-3 bg-green-900/20 rounded border border-green-700/30">
                      <div>
                        <p className="text-green-400 font-medium">BUY Positions</p>
                        <p className="text-gray-400 text-sm">{accountData.buyPositions} trades</p>
                      </div>
                      <div className="text-right">
                        <p className="text-green-400 font-bold">{accountData.totalBuyLots.toFixed(2)}</p>
                        <p className="text-gray-500 text-xs">total lots</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-red-900/20 rounded border border-red-700/30">
                      <div>
                        <p className="text-red-400 font-medium">SELL Positions</p>
                        <p className="text-gray-400 text-sm">{accountData.sellPositions} trades</p>
                      </div>
                      <div className="text-right">
                        <p className="text-red-400 font-bold">{accountData.totalSellLots.toFixed(2)}</p>
                        <p className="text-gray-500 text-xs">total lots</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Last Updated */}
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Account: {accountData.accountName}</span>
                  <span>
                    Last updated: {accountData.secondsAgo !== undefined && accountData.secondsAgo < 60 
                      ? `${accountData.secondsAgo}s ago`
                      : accountData.secondsAgo !== undefined 
                        ? `${Math.floor(accountData.secondsAgo / 60)}m ago`
                        : 'Unknown'
                    }
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* No Account Data Message */}
        {!accountData?.connected && mt5ConnectionStatus?.connected && (
          <Card className="bg-gray-800/50 border-gray-700">
            <CardContent className="p-6 text-center">
              <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-white mb-2">Account Data Not Available</h3>
              <p className="text-gray-400">
                Download the latest version of the MT5 Chart Data EA to view your account balance breakdown here.
              </p>
            </CardContent>
          </Card>
        )}

        {/* AI Trade Accuracy Dashboard */}
        <AiAccuracyDashboard />

        {/* Reversal Detection Panel */}
        <ReversalAlertPanel />

        {/* Trade History Learning */}
        <TradeHistoryLearning />

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-amber-400" />
                Step 1: Create API Token
              </CardTitle>
              <CardDescription>Generate a unique token for your MT5 EA</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Token name (e.g., My MT5 Account)"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  className="bg-gray-900 border-gray-700 flex-1"
                />
                <Button
                  onClick={() => createTokenMutation.mutate(newTokenName)}
                  disabled={!newTokenName || createTokenMutation.isPending}
                >
                  {createTokenMutation.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                </Button>
              </div>

              {newlyCreatedToken && (
                <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 bg-green-900/30 border border-green-600/50 rounded-lg"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-green-400 font-semibold flex items-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      Your New API Token - Copy This!
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setNewlyCreatedToken(null)}>
                      <XCircle className="w-4 h-4" />
                    </Button>
                  </div>
                  <p className="text-yellow-400 text-sm mb-2">Copy this token now! It won't be shown again.</p>
                  <div className="flex items-center gap-2 bg-gray-900 p-2 rounded font-mono text-sm">
                    <code className="flex-1 text-green-400 break-all">{newlyCreatedToken.token}</code>
                    <Button variant="ghost" size="sm" onClick={() => copyToClipboard(newlyCreatedToken.token, "Token copied!")}>
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </motion.div>
              )}

              {mt5Tokens.length > 0 && !newlyCreatedToken && (
                <div className="space-y-2">
                  <Label className="text-gray-400 text-sm">Your existing tokens:</Label>
                  {mt5Tokens.map(token => (
                    <div key={token.id} className="flex items-center justify-between p-3 bg-gray-900/50 rounded border border-gray-700">
                      <div className="flex items-center gap-3">
                        <span className="text-white font-medium">{token.name}</span>
                        <Badge className={token.isActive ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}>
                          {token.isActive ? 'Active' : 'Inactive'}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <code className="text-gray-500 text-xs font-mono">
                            {showToken[token.id] ? token.token : `${token.token.slice(0, 8)}...`}
                          </code>
                          <Button variant="ghost" size="sm" onClick={() => setShowToken(prev => ({ ...prev, [token.id]: !prev[token.id] }))}>
                            {showToken[token.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => copyToClipboard(token.token)}>
                            <Copy className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => deleteTokenMutation.mutate(token.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gray-800/50 border-gray-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Zap className="w-5 h-5 text-green-400" />
                Step 2: Copy API URL
              </CardTitle>
              <CardDescription>This is the endpoint your EA will send data to</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-gray-400 text-sm mb-2 block">API URL (paste into EA's API_URL field):</Label>
                <div className="flex items-center gap-2 bg-gray-900 p-3 rounded-lg border border-green-700/50">
                  <code className="flex-1 text-green-400 text-sm break-all">{apiUrl}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(apiUrl, "URL copied!")}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
              
              <div>
                <Label className="text-gray-400 text-sm mb-2 block">Base URL (for MT5 WebRequest whitelist):</Label>
                <div className="flex items-center gap-2 bg-gray-900 p-3 rounded-lg border border-gray-700">
                  <code className="flex-1 text-amber-400 text-sm break-all">{baseUrl}</code>
                  <Button variant="outline" size="sm" onClick={() => copyToClipboard(baseUrl, "Base URL copied!")}>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="bg-gradient-to-r from-green-900/30 to-teal-900/30 border-green-700/50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white text-xl flex items-center gap-3">
                  <Download className="w-6 h-6 text-green-400" />
                  Step 3: Download & Install EA
                </CardTitle>
                <CardDescription>Get the Chart Data EA for your MetaTrader 5</CardDescription>
              </div>
              <a href="/downloads/VEDD_ChartData_EA.mq5" download className="inline-flex">
                <Button className="bg-gradient-to-r from-green-600 to-teal-600 hover:from-green-500 hover:to-teal-500">
                  <Download className="w-4 h-4 mr-2" />
                  Download VEDD_ChartData_EA.mq5
                </Button>
              </a>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Target className="w-4 h-4 text-green-400" />
                  Installation Steps
                </h4>
                <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                  <li>Download the EA file using the button above</li>
                  <li>In MT5, go to File → Open Data Folder</li>
                  <li>Navigate to MQL5 → Experts</li>
                  <li>Copy the .mq5 file into this folder</li>
                  <li>Restart MT5 or right-click Navigator → Refresh</li>
                  <li>Drag the EA onto your chart</li>
                </ol>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-400" />
                  Enable WebRequest
                </h4>
                <ol className="text-sm text-gray-400 space-y-2 list-decimal list-inside">
                  <li>In MT5, go to Tools → Options → Expert Advisors</li>
                  <li>Check "Allow WebRequest for listed URL"</li>
                  <li>Click "Add" and paste: <code className="text-green-400 bg-gray-900 px-1 rounded">{baseUrl}</code></li>
                  <li>Click OK to save settings</li>
                </ol>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-purple-400" />
              Multi-Timeframe Analysis
            </CardTitle>
            <CardDescription>The EA can analyze multiple timeframes for stronger signals</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-gray-900/50 rounded-lg border border-purple-700/30">
                <h4 className="text-purple-400 font-semibold mb-2">Scalping (Fast)</h4>
                <p className="text-sm text-gray-400 mb-2">Enable M5 for quick entries</p>
                <Badge className="bg-purple-500/20 text-purple-400">M5, M15</Badge>
              </div>
              <div className="p-4 bg-gray-900/50 rounded-lg border border-blue-700/30">
                <h4 className="text-blue-400 font-semibold mb-2">Day Trading (Default)</h4>
                <p className="text-sm text-gray-400 mb-2">Best for intraday analysis</p>
                <Badge className="bg-blue-500/20 text-blue-400">M15, H1, H4</Badge>
              </div>
              <div className="p-4 bg-gray-900/50 rounded-lg border border-teal-700/30">
                <h4 className="text-teal-400 font-semibold mb-2">Swing Trading</h4>
                <p className="text-sm text-gray-400 mb-2">Enable D1 and W1 for bigger moves</p>
                <Badge className="bg-teal-500/20 text-teal-400">H4, D1, W1</Badge>
              </div>
            </div>
            <div className="mt-4 p-4 bg-green-900/20 border border-green-700/30 rounded-lg">
              <p className="text-green-300 text-sm flex items-start gap-2">
                <TrendingUp className="w-4 h-4 mt-0.5 shrink-0" />
                <span><strong>Pro Tip:</strong> When 60%+ of your selected timeframes align with the signal direction, AI confidence gets a +10% boost. The more timeframes agree, the stronger the signal!</span>
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-800/50 border-gray-700">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-amber-400" />
              EA Settings Reference
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Accordion type="single" collapsible className="space-y-2">
              <AccordionItem value="connection" className="bg-gray-900/50 rounded-lg border border-gray-700 px-4">
                <AccordionTrigger className="text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-yellow-400" />
                    Connection Settings
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-gray-400">
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-green-400 font-mono">API_URL</span>
                      <span>Your AI Trading Vault endpoint URL</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-green-400 font-mono">API_TOKEN</span>
                      <span>Your unique authentication token</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">CANDLES_TO_SEND</span>
                      <span>Number of candles to send (default: 50)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">SEND_INTERVAL_SECONDS</span>
                      <span>How often to send data (default: 60)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">INCLUDE_INDICATORS</span>
                      <span>Send RSI, MACD, etc. (default: true)</span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="multitf" className="bg-gray-900/50 rounded-lg border border-gray-700 px-4">
                <AccordionTrigger className="text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Layers className="w-4 h-4 text-purple-400" />
                    Multi-Timeframe Settings
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-gray-400">
                  <div className="space-y-3 pt-2">
                    <div className="flex justify-between items-center">
                      <span className="text-green-400 font-mono">ENABLE_MULTI_TIMEFRAME</span>
                      <span>Enable multi-TF analysis (default: true)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-400 font-mono">INCLUDE_M5</span>
                      <span>Include 5-minute data (scalping)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-400 font-mono">INCLUDE_M15</span>
                      <span>Include 15-minute data (default: true)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-400 font-mono">INCLUDE_H1</span>
                      <span>Include 1-hour data (default: true)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-400 font-mono">INCLUDE_H4</span>
                      <span>Include 4-hour data (default: true)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-400 font-mono">INCLUDE_D1</span>
                      <span>Include daily data</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-purple-400 font-mono">INCLUDE_W1</span>
                      <span>Include weekly data (swing trading)</span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="autotrading" className="bg-gray-900/50 rounded-lg border border-gray-700 px-4">
                <AccordionTrigger className="text-white hover:no-underline">
                  <span className="flex items-center gap-2">
                    <Target className="w-4 h-4 text-red-400" />
                    Auto-Trading Settings (Advanced)
                  </span>
                </AccordionTrigger>
                <AccordionContent className="text-gray-400">
                  <div className="p-3 mb-3 bg-red-900/30 border border-red-600/50 rounded-lg">
                    <p className="text-red-300 text-sm flex items-start gap-2">
                      <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                      <span><strong>Warning:</strong> Auto-trading is disabled by default. Enable at your own risk. Start with a demo account!</span>
                    </p>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-red-400 font-mono">ENABLE_AUTO_TRADING</span>
                      <span>Enable automatic trade execution (default: false)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">LOT_SIZE</span>
                      <span>Fixed lot size for trades (default: 0.01)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">MIN_CONFIDENCE</span>
                      <span>Minimum AI confidence to trade (default: 70)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">MAX_OPEN_TRADES</span>
                      <span>Maximum open trades per symbol (default: 1)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">DAILY_LOSS_LIMIT</span>
                      <span>Max daily loss in account currency (default: 100)</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-amber-400 font-mono">COOLDOWN_SECONDS</span>
                      <span>Wait time between trades (default: 300)</span>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </CardContent>
        </Card>

        <Card className="bg-teal-900/20 border-teal-600/30">
          <CardHeader>
            <CardTitle className="text-teal-400 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              What Data Gets Sent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-white font-semibold mb-3">Candle Data (OHLCV)</h4>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• Open, High, Low, Close prices</li>
                  <li>• Volume for each candle</li>
                  <li>• Timestamp for each bar</li>
                  <li>• Symbol and timeframe identifier</li>
                </ul>
              </div>
              <div>
                <h4 className="text-white font-semibold mb-3">Technical Indicators</h4>
                <ul className="text-sm text-gray-400 space-y-1">
                  <li>• RSI (14-period)</li>
                  <li>• MACD (12, 26, 9)</li>
                  <li>• ATR (14-period)</li>
                  <li>• EMA 20, EMA 50, SMA 200</li>
                  <li>• Bollinger Bands (20, 2)</li>
                  <li>• Current Bid/Ask spread</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="text-center">
          <Link href="/user-guide">
            <Button variant="outline" className="mr-4">
              <BookOpen className="w-4 h-4 mr-2" />
              Read Full User Guide
            </Button>
          </Link>
          <Link href="/webhooks">
            <Button variant="outline">
              <Zap className="w-4 h-4 mr-2" />
              Webhook Settings
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
