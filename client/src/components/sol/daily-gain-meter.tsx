/**
 * DailyGainMeter — Section 3 & 4
 * Arc gauge + Recharts line chart + goal editor + auto-stop banner
 */
import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine,
  ResponsiveContainer, CartesianGrid
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog';
import { Pencil, Target, TrendingUp, TrendingDown, RotateCcw, Play, AlertTriangle } from 'lucide-react';
import { useSolTradingState } from '@/hooks/use-sol-trading-state';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

// ── Arc SVG Gauge ────────────────────────────────────────────────────────────
const ARC_START = -210;  // degrees (bottom-left)
const ARC_END   =   30;  // degrees (bottom-right)
const ARC_TOTAL = ARC_END - ARC_START; // 240°

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number) {
  const s = polarToCartesian(cx, cy, r, startDeg);
  const e = polarToCartesian(cx, cy, r, endDeg);
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
}

interface ArcGaugeProps {
  cumPct: number;
  goalPct: number;
  lossLimitPct: number;
  cumUsd: number;
}

function ArcGauge({ cumPct, goalPct, lossLimitPct, cumUsd }: ArcGaugeProps) {
  const cx = 80, cy = 80, r = 62;
  const progress = Math.max(-1, Math.min(1, cumPct / Math.max(Math.abs(goalPct), 0.01)));
  const fillPct = Math.max(0, progress);
  const endDeg = ARC_START + ARC_TOTAL * fillPct;

  const color = fillPct < 0.5 ? '#f59e0b' : fillPct < 0.9 ? '#3b82f6' : '#10b981';
  const trackColor = '#1f2937';
  const isGoalHit = cumPct >= goalPct;
  const isLossHit = lossLimitPct < 0 && cumPct <= lossLimitPct;

  return (
    <svg viewBox="0 0 160 120" className="w-full max-w-[200px] mx-auto">
      {/* Track */}
      <path
        d={describeArc(cx, cy, r, ARC_START, ARC_END)}
        fill="none"
        stroke={trackColor}
        strokeWidth={10}
        strokeLinecap="round"
      />
      {/* Fill */}
      {fillPct > 0 && (
        <path
          d={describeArc(cx, cy, r, ARC_START, endDeg)}
          fill="none"
          stroke={isGoalHit ? '#10b981' : color}
          strokeWidth={10}
          strokeLinecap="round"
          className={isGoalHit ? 'drop-shadow-[0_0_8px_#10b981]' : ''}
        />
      )}
      {/* Goal marker */}
      {(() => {
        const gDeg = ARC_START + ARC_TOTAL;
        const gPt = polarToCartesian(cx, cy, r, gDeg);
        return <circle cx={gPt.x} cy={gPt.y} r={4} fill="#10b981" opacity={0.6} />;
      })()}
      {/* Center text */}
      <text x={cx} y={cy - 8} textAnchor="middle" fill={cumPct >= 0 ? '#10b981' : '#ef4444'} fontSize="18" fontWeight="bold" className="font-mono">
        {cumPct >= 0 ? '+' : ''}{cumPct.toFixed(2)}%
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle" fill={cumUsd >= 0 ? '#6ee7b7' : '#fca5a5'} fontSize="10">
        {cumUsd >= 0 ? '+' : ''}${Math.abs(cumUsd).toFixed(2)}
      </text>
      {isGoalHit && (
        <text x={cx} y={cy + 25} textAnchor="middle" fill="#10b981" fontSize="8">
          🎯 Goal Hit!
        </text>
      )}
      {isLossHit && (
        <text x={cx} y={cy + 25} textAnchor="middle" fill="#ef4444" fontSize="8">
          ⚠ Limit Hit
        </text>
      )}
    </svg>
  );
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{new Date(d.time).toLocaleTimeString()}</p>
      <p className="text-white font-semibold">{d.label}</p>
      <p className={d.cumPct >= 0 ? 'text-green-400' : 'text-red-400'}>
        {d.cumPct >= 0 ? '+' : ''}{d.cumPct.toFixed(2)}%
      </p>
      <p className="text-gray-300">{d.pnlUsd >= 0 ? '+' : ''}${d.pnlUsd.toFixed(2)} this trade</p>
    </div>
  );
}

// ── Preset Goal Buttons ────────────────────────────────────────────────────────
const GOAL_PRESETS = [3, 5, 10, 15];
const LOSS_PRESETS = [-2, -3, -5];

// ── Main Component ─────────────────────────────────────────────────────────────
export function DailyGainMeter() {
  const {
    dailyTrades, currentCumPct, currentCumUsd,
    dailyGoalPct, dailyLossLimitPct,
    isAutoStopped, autoStopReason,
    setDailyGoal, setLossLimit, resumeEngine, resetDay,
  } = useSolTradingState();
  const { toast } = useToast();

  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [editGoal, setEditGoal] = useState('');
  const [editLoss, setEditLoss] = useState('');

  const chartData = useMemo(() => {
    // Prepend a zero-point
    const origin = { time: dailyTrades[0]?.time || new Date().toISOString(), label: 'Start', pnlUsd: 0, cumPct: 0, cumUsd: 0 };
    return [origin, ...dailyTrades];
  }, [dailyTrades]);

  const lineColor = currentCumPct >= 0 ? '#10b981' : '#ef4444';
  const gradId = 'gainGrad';

  const handleSaveGoal = () => {
    const g = parseFloat(editGoal);
    const l = parseFloat(editLoss);
    if (!isNaN(g) && g > 0) setDailyGoal(g);
    if (!isNaN(l) && l < 0) setLossLimit(l);
    setGoalDialogOpen(false);
    toast({ title: 'Goals updated', description: `Target: +${editGoal}% | Limit: ${editLoss}%` });
  };

  const progressPct = Math.min(100, Math.max(0, (currentCumPct / Math.max(dailyGoalPct, 0.01)) * 100));

  return (
    <div className="space-y-4">
      {/* Auto-stop banner */}
      {isAutoStopped && (
        <div className={cn(
          'flex items-center justify-between rounded-xl px-4 py-3 border text-sm',
          autoStopReason === 'goal_reached'
            ? 'bg-green-500/10 border-green-500/30 text-green-300'
            : 'bg-red-500/10 border-red-500/30 text-red-300'
        )}>
          <div className="flex items-center gap-2">
            {autoStopReason === 'goal_reached'
              ? <><Target className="h-4 w-4" /> Daily goal achieved — engine resting until tomorrow</>
              : <><AlertTriangle className="h-4 w-4" /> Daily loss limit hit — engine paused</>
            }
          </div>
          <Button size="sm" variant="outline" onClick={() => { resumeEngine(); toast({ title: 'Engine resumed', description: 'Override active — trade carefully.' }); }}
            className="h-7 text-xs border-current text-inherit hover:bg-current/10">
            <Play className="h-3 w-3 mr-1" /> Resume Anyway
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Arc Gauge Card */}
        <Card className="bg-gray-900/60 border-gray-700/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-200">Daily P&L</CardTitle>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
              setEditGoal(String(dailyGoalPct));
              setEditLoss(String(dailyLossLimitPct));
              setGoalDialogOpen(true);
            }}>
              <Pencil className="h-3.5 w-3.5 text-gray-400" />
            </Button>
          </CardHeader>
          <CardContent className="pt-0">
            <ArcGauge
              cumPct={currentCumPct}
              goalPct={dailyGoalPct}
              lossLimitPct={dailyLossLimitPct}
              cumUsd={currentCumUsd}
            />
            <div className="mt-2 text-center">
              <p className="text-xs text-gray-400">
                Goal: <span className="text-green-400 font-semibold">+{dailyGoalPct}%</span>
                <span className="mx-2 text-gray-600">|</span>
                Limit: <span className="text-red-400 font-semibold">{dailyLossLimitPct}%</span>
              </p>
              <div className="mt-1 h-1 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${progressPct}%`,
                    background: progressPct < 50 ? '#f59e0b' : progressPct < 90 ? '#3b82f6' : '#10b981',
                    boxShadow: progressPct >= 90 ? '0 0 8px #10b981' : undefined,
                  }}
                />
              </div>
              <p className="text-[10px] text-gray-500 mt-1">
                {dailyTrades.length} trade{dailyTrades.length !== 1 ? 's' : ''} today
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Line Chart Card */}
        <Card className="bg-gray-900/60 border-gray-700/50">
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-200">Daily Gain Chart</CardTitle>
            <div className="flex items-center gap-2">
              {currentCumPct >= 0
                ? <TrendingUp className="h-4 w-4 text-green-400" />
                : <TrendingDown className="h-4 w-4 text-red-400" />
              }
              <Button variant="ghost" size="icon" className="h-6 w-6" title="Reset day" onClick={() => { resetDay(); toast({ title: 'Day reset', description: 'Daily P&L cleared.' }); }}>
                <RotateCcw className="h-3 w-3 text-gray-400" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="h-[140px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={lineColor} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                  <XAxis dataKey="time" hide />
                  <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} />
                  <Tooltip content={<CustomTooltip />} />
                  {/* Zero line */}
                  <ReferenceLine y={0} stroke="#374151" strokeDasharray="4 4" />
                  {/* Goal line */}
                  <ReferenceLine
                    y={dailyGoalPct}
                    stroke="#10b981"
                    strokeDasharray="6 3"
                    label={{ value: `+${dailyGoalPct}%`, position: 'insideTopRight', fontSize: 9, fill: '#10b981' }}
                  />
                  {/* Loss limit line */}
                  <ReferenceLine
                    y={dailyLossLimitPct}
                    stroke="#ef4444"
                    strokeDasharray="6 3"
                    label={{ value: `${dailyLossLimitPct}%`, position: 'insideBottomRight', fontSize: 9, fill: '#ef4444' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="cumPct"
                    stroke={lineColor}
                    strokeWidth={2}
                    fill={`url(#${gradId})`}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Goal Editor Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-4 w-4 text-green-400" />
              Set Daily Goals
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Daily Profit Target</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {GOAL_PRESETS.map(p => (
                  <Button key={p} size="sm" variant={editGoal === String(p) ? 'default' : 'outline'}
                    className="h-7 px-2.5 text-xs" onClick={() => setEditGoal(String(p))}>
                    +{p}%
                  </Button>
                ))}
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs"
                  onClick={() => setEditGoal('')}>Custom</Button>
              </div>
              <Input
                type="number" min={0.5} max={100} step={0.5}
                value={editGoal}
                onChange={e => setEditGoal(e.target.value)}
                placeholder="e.g. 8"
                className="h-8 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1.5 block">Daily Loss Limit (negative)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {LOSS_PRESETS.map(p => (
                  <Button key={p} size="sm" variant={editLoss === String(p) ? 'default' : 'outline'}
                    className="h-7 px-2.5 text-xs" onClick={() => setEditLoss(String(p))}>
                    {p}%
                  </Button>
                ))}
              </div>
              <Input
                type="number" max={0} min={-50} step={0.5}
                value={editLoss}
                onChange={e => setEditLoss(e.target.value)}
                placeholder="e.g. -3"
                className="h-8 text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSaveGoal} className="bg-green-600 hover:bg-green-700">Save Goals</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
