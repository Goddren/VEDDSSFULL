/**
 * StrategyPicker — Section 5
 * 6-strategy card grid with backtest results, combo mode, glow border on active
 */
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger
} from '@/components/ui/collapsible';
import { ChevronDown, Zap, TrendingUp, Coins, BarChart3, Flame, ArrowLeftRight, CheckCircle2 } from 'lucide-react';
import { useSolTradingState, type StrategyId } from '@/hooks/use-sol-trading-state';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ── Strategy definitions ───────────────────────────────────────────────────────
interface Strategy {
  id: StrategyId;
  name: string;
  risk: 'LOW' | 'LOW-MID' | 'MID' | 'MID-HIGH' | 'HIGH';
  riskColor: string;
  icon: React.ReactNode;
  avgHold: string;
  targetGain: string;
  stopLoss: string;
  description: string;
  bestFor: string;
  backtest: {
    startAccount: number;
    finalAccount: number;
    winRate: number;
    totalTrades: number;
    bestDay: number;
    worstDay: number;
  };
}

const STRATEGIES: Strategy[] = [
  {
    id: 'sniper_entry',
    name: 'Sniper Entry',
    risk: 'LOW-MID',
    riskColor: 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10',
    icon: <Zap className="h-4 w-4 text-yellow-400" />,
    avgHold: '2–15 min',
    targetGain: '+3–8%',
    stopLoss: '-2%',
    description: 'Watches for sudden volume spike (3×–10× avg) in under 5 min. Enters on first confirmed green candle after spike.',
    bestFor: 'New listings, trending meme tokens',
    backtest: { startAccount: 100, finalAccount: 187, winRate: 68, totalTrades: 47, bestDay: 18.4, worstDay: -4.1 },
  },
  {
    id: 'momentum_scalp',
    name: 'Momentum Scalp',
    risk: 'MID',
    riskColor: 'text-orange-400 border-orange-500/40 bg-orange-500/10',
    icon: <TrendingUp className="h-4 w-4 text-orange-400" />,
    avgHold: '5–30 min',
    targetGain: '+5–10%',
    stopLoss: 'Below last swing low',
    description: 'Rides short-term momentum on tokens already up 5–20% today. Enters on pullback to 9 EMA on 1m or 3m chart.',
    bestFor: 'Already-running tokens with momentum',
    backtest: { startAccount: 100, finalAccount: 213, winRate: 61, totalTrades: 54, bestDay: 22.1, worstDay: -6.3 },
  },
  {
    id: 'micro_compounder',
    name: 'Micro Compounder',
    risk: 'LOW',
    riskColor: 'text-green-400 border-green-500/40 bg-green-500/10',
    icon: <Coins className="h-4 w-4 text-green-400" />,
    avgHold: '3–10 min',
    targetGain: '+2–4%',
    stopLoss: '-1.5%',
    description: 'Targets only +2–4% per trade and compounds gains every trade. 3% × 5 trades = +15.9% compounded daily. Strict risk management.',
    bestFor: 'Small accounts, consistent growers',
    backtest: { startAccount: 100, finalAccount: 241, winRate: 76, totalTrades: 89, bestDay: 15.9, worstDay: -2.1 },
  },
  {
    id: 'breakout_hunter',
    name: 'Breakout Hunter',
    risk: 'MID-HIGH',
    riskColor: 'text-blue-400 border-blue-500/40 bg-blue-500/10',
    icon: <BarChart3 className="h-4 w-4 text-blue-400" />,
    avgHold: '15 min – 2 hrs',
    targetGain: '+10–25%',
    stopLoss: 'Back below breakout level',
    description: 'Scans for tokens consolidating in tight range for 15–30 min. Enters on confirmed breakout above range high with volume confirmation.',
    bestFor: 'Patience traders, larger moves',
    backtest: { startAccount: 100, finalAccount: 298, winRate: 52, totalTrades: 31, bestDay: 34.7, worstDay: -8.9 },
  },
  {
    id: 'new_listing_flip',
    name: 'New Listing Flip',
    risk: 'HIGH',
    riskColor: 'text-red-400 border-red-500/40 bg-red-500/10',
    icon: <Flame className="h-4 w-4 text-red-400" />,
    avgHold: '1–10 min',
    targetGain: '+20–50%',
    stopLoss: '-5%',
    description: 'Targets tokens in first 30 min of listing on Raydium/Jupiter. Enters early, targets 20–50% pump, exits fast before dump.',
    bestFor: 'High risk tolerance, $50+ accounts only',
    backtest: { startAccount: 100, finalAccount: 412, winRate: 44, totalTrades: 27, bestDay: 68.3, worstDay: -14.2 },
  },
  {
    id: 'sol_arb',
    name: 'SOL Pairs Arbitrage',
    risk: 'LOW',
    riskColor: 'text-purple-400 border-purple-500/40 bg-purple-500/10',
    icon: <ArrowLeftRight className="h-4 w-4 text-purple-400" />,
    avgHold: 'Seconds – 2 min',
    targetGain: '+0.8–2%',
    stopLoss: 'Built-in spread check',
    description: 'Monitors price discrepancies of same token across Jupiter, Raydium, Orca. Auto-executes when spread > 0.8% after fees.',
    bestFor: 'High frequency, low risk — combine with Micro Compounder',
    backtest: { startAccount: 100, finalAccount: 164, winRate: 89, totalTrades: 163, bestDay: 8.2, worstDay: -0.8 },
  },
];

// ── StrategyCard ───────────────────────────────────────────────────────────────
function StrategyCard({
  strategy, isActive, onSelect
}: {
  strategy: Strategy;
  isActive: boolean;
  onSelect: () => void;
}) {
  const [backtestOpen, setBacktestOpen] = useState(false);
  const gain = ((strategy.backtest.finalAccount - strategy.backtest.startAccount) / strategy.backtest.startAccount * 100).toFixed(0);

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'cursor-pointer transition-all duration-200 border bg-gray-900/60 relative overflow-hidden',
        isActive
          ? 'border-[#d4af37] shadow-[0_0_20px_rgba(212,175,55,0.25)]'
          : 'border-gray-700/50 hover:border-gray-600'
      )}
    >
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#d4af37]/0 via-[#d4af37] to-[#d4af37]/0" />
      )}
      <CardHeader className="pb-2 pt-3 px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {strategy.icon}
            <CardTitle className="text-sm font-semibold text-gray-100 leading-tight">{strategy.name}</CardTitle>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <Badge variant="outline" className={cn('text-[9px] h-4 px-1.5 border font-semibold', strategy.riskColor)}>
              {strategy.risk}
            </Badge>
            {isActive && <CheckCircle2 className="h-4 w-4 text-[#d4af37]" />}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-3 pt-0 space-y-2">
        <p className="text-xs text-gray-400 leading-relaxed">{strategy.description}</p>
        <div className="grid grid-cols-3 gap-1 text-center">
          {[
            { label: 'Hold', value: strategy.avgHold },
            { label: 'Target', value: strategy.targetGain },
            { label: 'Stop', value: strategy.stopLoss },
          ].map(s => (
            <div key={s.label} className="bg-gray-800/60 rounded-lg p-1.5">
              <p className="text-[9px] text-gray-500">{s.label}</p>
              <p className="text-[10px] font-semibold text-gray-200 leading-tight">{s.value}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-gray-500">Best for: <span className="text-gray-400">{strategy.bestFor}</span></p>

        {/* Backtest collapsible */}
        <Collapsible open={backtestOpen} onOpenChange={setBacktestOpen}>
          <CollapsibleTrigger
            onClick={e => e.stopPropagation()}
            className="flex items-center gap-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            <ChevronDown className={cn('h-3 w-3 transition-transform', backtestOpen ? 'rotate-180' : '')} />
            Backtest Results (30-day, $100 start)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1.5">
            <div className="bg-gray-800/50 rounded-lg p-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between">
                <span className="text-gray-500">Final Value</span>
                <span className="text-green-400 font-semibold">${strategy.backtest.finalAccount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Total Gain</span>
                <span className="text-green-400 font-semibold">+{gain}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Win Rate</span>
                <span className="text-blue-400 font-semibold">{strategy.backtest.winRate}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Trades</span>
                <span className="text-gray-300 font-semibold">{strategy.backtest.totalTrades}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Best Day</span>
                <span className="text-green-400 font-semibold">+{strategy.backtest.bestDay}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Worst Day</span>
                <span className="text-red-400 font-semibold">{strategy.backtest.worstDay}%</span>
              </div>
            </div>
            <p className="text-[9px] text-gray-600 mt-1">⚠ Simulated results. Past performance doesn't guarantee future returns.</p>
          </CollapsibleContent>
        </Collapsible>
      </CardContent>
    </Card>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function StrategyPicker() {
  const { activeStrategy, comboMode, comboSecondary, setStrategy, setComboMode } = useSolTradingState();
  const { toast } = useToast();

  const handleSelect = (id: StrategyId) => {
    setStrategy(id);
    toast({ title: `Strategy: ${STRATEGIES.find(s => s.id === id)?.name}`, description: 'Active strategy updated.' });
  };

  const handleComboToggle = (enabled: boolean) => {
    setComboMode(enabled, enabled ? 'sol_arb' : null);
    toast({
      title: enabled ? 'Combo Mode ON' : 'Combo Mode OFF',
      description: enabled ? 'Micro Compounder + secondary strategy active' : 'Single strategy mode',
    });
  };

  const activeStrategyData = STRATEGIES.find(s => s.id === activeStrategy);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-200">Strategy Picker</h3>
          <p className="text-xs text-gray-500">Select one active strategy for the auto trade engine</p>
        </div>
        <div className="flex items-center gap-2">
          <Label className="text-xs text-gray-400">Combo Mode</Label>
          <Switch
            checked={comboMode}
            onCheckedChange={handleComboToggle}
            className="data-[state=checked]:bg-[#d4af37]"
          />
        </div>
      </div>

      {comboMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300">
          <Coins className="h-3.5 w-3.5" />
          Combo Mode: <strong>Micro Compounder</strong> base + your selected secondary strategy
        </div>
      )}

      {activeStrategyData && !comboMode && (
        <div className="flex items-center gap-2 px-3 py-2 bg-[#d4af37]/10 border border-[#d4af37]/30 rounded-xl text-xs text-[#d4af37]">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Active: <strong>{activeStrategyData.name}</strong>
          <span className="text-gray-400 ml-1">· {activeStrategyData.avgHold} avg hold · {activeStrategyData.targetGain} target</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STRATEGIES.map(s => (
          <StrategyCard
            key={s.id}
            strategy={s}
            isActive={activeStrategy === s.id}
            onSelect={() => handleSelect(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
