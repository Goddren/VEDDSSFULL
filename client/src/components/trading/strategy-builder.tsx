import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Info } from 'lucide-react';
import type {
  StrategySpec, IndicatorConfig, IndicatorKind, Condition, ConditionGroup, ConditionField,
} from '@/lib/strategy-spec';
import { INDICATOR_FIELDS, INDICATOR_DEFAULTS, WIZARD_SYMBOLS, TIMEFRAMES } from '@/lib/strategy-spec';

/**
 * Condition-builder editor for a StrategySpec. Used by the Strategy
 * Wizard for builder-made strategies, template presets, and engine
 * strategies that have a mechanical approximation — one editor for
 * every spec the backtester / EA bridge / deploy layer understand.
 */

const OPERATORS: Array<{ value: Condition['operator']; label: string }> = [
  { value: 'crosses_above', label: 'crosses above' },
  { value: 'crosses_below', label: 'crosses below' },
  { value: 'above', label: 'is above' },
  { value: 'below', label: 'is below' },
  { value: 'rising', label: 'is rising' },
  { value: 'falling', label: 'is falling' },
  { value: 'turns_up', label: 'turns up (bottoms)' },
  { value: 'turns_down', label: 'turns down (tops)' },
];

const TF_ORDER = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

const smallSelect = 'h-9 text-sm';

function NumInput({ value, onChange, placeholder, step = '1', min }: {
  value: number | null | undefined; onChange: (v: number | null) => void; placeholder?: string; step?: string; min?: string;
}) {
  return (
    <Input
      type="number" step={step} min={min} placeholder={placeholder}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className="h-9 text-right"
    />
  );
}

export function StrategyBuilder({ value, onChange }: { value: StrategySpec; onChange: (s: StrategySpec) => void }) {
  const spec = value;
  const set = (patch: Partial<StrategySpec>) => onChange({ ...spec, ...patch });
  const engineNative = spec.source === 'engine'
    && spec.entryLong.conditions.length === 0 && spec.entryShort.conditions.length === 0;

  const seriesOptions: Array<{ id: string; label: string; fields: ConditionField[] }> = [
    { id: 'price', label: 'Price (close)', fields: ['price'] },
    ...spec.indicators.map((i) => ({
      id: i.id,
      label: `${i.kind}${i.kind === 'MACD' ? ` ${i.fastPeriod ?? 12}/${i.slowPeriod ?? 26}/${i.signalPeriod ?? 9}` : ` (${i.period ?? ''})`}`,
      fields: INDICATOR_FIELDS[i.kind],
    })),
  ];

  const addIndicator = (kind: IndicatorKind) => {
    let n = 1;
    let id = `${kind.toLowerCase()}${n}`;
    while (spec.indicators.some((i) => i.id === id)) { n++; id = `${kind.toLowerCase()}${n}`; }
    set({ indicators: [...spec.indicators, { id, kind, ...INDICATOR_DEFAULTS[kind] }] });
  };

  const updateIndicator = (id: string, patch: Partial<IndicatorConfig>) =>
    set({ indicators: spec.indicators.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  const removeIndicator = (id: string) => {
    const strip = (g: ConditionGroup | null | undefined) =>
      g ? { ...g, conditions: g.conditions.filter((c) => c.indicatorId !== id && !(c.compare.kind === 'indicator' && c.compare.indicatorId === id)) } : g;
    onChange({
      ...spec,
      indicators: spec.indicators.filter((i) => i.id !== id).map((i) => (i.sourceId === id ? { ...i, sourceId: undefined } : i)),
      entryLong: strip(spec.entryLong) as ConditionGroup,
      entryShort: strip(spec.entryShort) as ConditionGroup,
      exitLong: strip(spec.exitLong) ?? null,
      exitShort: strip(spec.exitShort) ?? null,
      trendFilter: spec.trendFilter ? {
        ...spec.trendFilter,
        longGroup: strip(spec.trendFilter.longGroup) ?? null,
        shortGroup: strip(spec.trendFilter.shortGroup) ?? null,
      } : spec.trendFilter,
    });
  };

  const renderGroup = (title: string, group: ConditionGroup, apply: (g: ConditionGroup) => void, hint: string) => (
    <div className="border rounded-lg p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{hint}</div>
        </div>
        <Select value={group.logic} onValueChange={(v) => apply({ ...group, logic: v as 'AND' | 'OR' })}>
          <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="AND">ALL must be true</SelectItem>
            <SelectItem value="OR">ANY can be true</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {group.conditions.map((c, idx) => {
        const series = seriesOptions.find((s) => s.id === c.indicatorId) ?? seriesOptions[0];
        const needsCompare = !['rising', 'falling', 'turns_up', 'turns_down'].includes(c.operator);
        const cmpSeries = c.compare.kind === 'indicator'
          ? seriesOptions.find((s) => s.id === (c.compare as any).indicatorId) : null;
        const update = (patch: Partial<Condition>) =>
          apply({ ...group, conditions: group.conditions.map((x, i) => (i === idx ? { ...x, ...patch } : x)) });
        return (
          <div key={idx} className="flex flex-wrap items-center gap-2">
            <Select value={c.indicatorId} onValueChange={(v) => {
              const s = seriesOptions.find((x) => x.id === v) ?? seriesOptions[0];
              update({ indicatorId: v, field: s.fields[0] });
            }}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{seriesOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
            </Select>
            {series.fields.length > 1 && (
              <Select value={c.field} onValueChange={(v) => update({ field: v as ConditionField })}>
                <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                <SelectContent>{series.fields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
              </Select>
            )}
            <Select value={c.operator} onValueChange={(v) => update({ operator: v as Condition['operator'] })}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>{OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
            </Select>
            {needsCompare && (
              <>
                <Select value={c.compare.kind} onValueChange={(v) => {
                  if (v === 'value') update({ compare: { kind: 'value', value: 50 } });
                  else if (v === 'price') update({ compare: { kind: 'price' } });
                  else {
                    const s = seriesOptions[1] ?? seriesOptions[0];
                    update({ compare: { kind: 'indicator', indicatorId: s.id, field: s.fields[0] } });
                  }
                }}>
                  <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="value">a number</SelectItem>
                    <SelectItem value="indicator">a series</SelectItem>
                    <SelectItem value="price">price</SelectItem>
                  </SelectContent>
                </Select>
                {c.compare.kind === 'value' && (
                  <div className="w-24"><NumInput value={c.compare.value} onChange={(v) => update({ compare: { kind: 'value', value: v ?? 0 } })} step="0.1" /></div>
                )}
                {c.compare.kind === 'indicator' && (
                  <>
                    <Select value={c.compare.indicatorId} onValueChange={(v) => {
                      const s = seriesOptions.find((x) => x.id === v) ?? seriesOptions[0];
                      update({ compare: { kind: 'indicator', indicatorId: v, field: s.fields[0] } });
                    }}>
                      <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>{seriesOptions.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                    {(cmpSeries?.fields.length ?? 0) > 1 && (
                      <Select value={c.compare.field} onValueChange={(v) => update({ compare: { kind: 'indicator', indicatorId: (c.compare as any).indicatorId, field: v as ConditionField } })}>
                        <SelectTrigger className="w-24 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>{(cmpSeries?.fields ?? []).map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}</SelectContent>
                      </Select>
                    )}
                  </>
                )}
              </>
            )}
            {needsCompare && (
              <>
                <span className="text-xs text-muted-foreground" title="Condition must hold this many bars in a row">for</span>
                <div className="w-14" title="Sustain: consecutive bars the condition must hold">
                  <NumInput value={c.sustainBars} onChange={(v) => update({ sustainBars: v ?? undefined })} placeholder="1" min="1" />
                </div>
                <span className="text-xs text-muted-foreground">bars, gap ≥</span>
                <div className="w-16" title="Minimum gap past the level, in pips">
                  <NumInput value={c.minGapPips} onChange={(v) => update({ minGapPips: v ?? undefined })} placeholder="0" min="0" />
                </div>
                <span className="text-xs text-muted-foreground">pips</span>
              </>
            )}
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => apply({ ...group, conditions: group.conditions.filter((_, i) => i !== idx) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
      {group.conditions.length < 6 && (
        <Button variant="outline" size="sm" onClick={() => apply({
          ...group,
          conditions: [...group.conditions, { indicatorId: 'price', field: 'price', operator: 'above', compare: { kind: 'value', value: 0 } }],
        })}>
          <Plus className="h-4 w-4 mr-1" /> Add condition
        </Button>
      )}
    </div>
  );

  const renderOptionalGroup = (
    title: string, group: ConditionGroup | null | undefined, apply: (g: ConditionGroup | null) => void, hint: string,
  ) => group == null ? (
    <div className="border rounded-lg p-3 flex items-center justify-between">
      <div>
        <div className="font-medium text-sm">{title}</div>
        <div className="text-xs text-muted-foreground">{hint} Optional — stop loss / take profit still apply.</div>
      </div>
      <Button variant="outline" size="sm" onClick={() => apply({ logic: 'AND', conditions: [] })}>
        <Plus className="h-4 w-4 mr-1" /> Add exit rules
      </Button>
    </div>
  ) : (
    <div className="space-y-2">
      {renderGroup(title, group, apply, hint)}
      <Button variant="ghost" size="sm" onClick={() => apply(null)}>Remove exit rules</Button>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Strategy Setup</CardTitle>
          <CardDescription>
            {spec.source === 'builder' && 'Your custom rules — combined indicators, your entries, your exits.'}
            {spec.source === 'template' && 'Template preset loaded as editable rules. Tune anything — the backtest runs on exactly what you see.'}
            {spec.source === 'engine' && !engineNative && 'Mechanical approximation of the engine strategy, for backtesting. The live engine version uses AI analysis.'}
            {spec.source === 'engine' && engineNative && 'FX engine strategy — runs on the engine\'s AI analysis when deployed.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Strategy name</Label>
            <Input value={spec.name} onChange={(e) => set({ name: e.target.value })} maxLength={80} />
          </div>
          <div className="space-y-2">
            <Label>Symbol</Label>
            <Select value={spec.symbol} onValueChange={(v) => set({ symbol: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{WIZARD_SYMBOLS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Timeframe</Label>
            <Select value={spec.timeframe} onValueChange={(v) => set({ timeframe: v as StrategySpec['timeframe'] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TIMEFRAMES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {engineNative ? (
        <Card className="border-amber-500/40">
          <CardContent className="pt-6 flex gap-3">
            <Info className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm space-y-1">
              <p><strong>{spec.name}</strong> is one of the FX engine's built-in AI strategies. It doesn't reduce to fixed indicator rules, so there's no mechanical backtest for it — anyone showing you one would be inventing it.</p>
              <p className="text-muted-foreground">You can still save it here with the risk settings below; deploying it to a live account runs it through the FX engine. Its live results then feed its brain like every other strategy.</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Indicators</CardTitle>
              <CardDescription>Add the indicators your rules compare. Give each one a moment to warm up — the backtester skips the warmup bars.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {spec.indicators.map((ind) => (
                <div key={ind.id} className="flex flex-wrap items-center gap-2 border rounded-lg p-3">
                  <Badge variant="secondary" className="text-sm">{ind.kind}</Badge>
                  <span className="text-xs text-muted-foreground">id: {ind.id}</span>
                  {(ind.kind === 'EMA' || ind.kind === 'SMA' || ind.kind === 'RSI' || ind.kind === 'ATR' || ind.kind === 'CCI' || ind.kind === 'WILLIAMS_R' || ind.kind === 'ADX' || ind.kind === 'DONCHIAN') && (
                    <div className="flex items-center gap-2"><Label className="text-xs">Period</Label>
                      <div className="w-20"><NumInput value={ind.period} onChange={(v) => updateIndicator(ind.id, { period: v ?? 14 })} min="1" /></div></div>
                  )}
                  {(ind.kind === 'EMA' || ind.kind === 'SMA') && (
                    <div className="flex items-center gap-2"><Label className="text-xs">Smooths</Label>
                      <Select value={ind.sourceId ?? 'price'} onValueChange={(v) => updateIndicator(ind.id, { sourceId: v === 'price' ? undefined : v })}>
                        <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="price">price</SelectItem>
                          {spec.indicators.filter((o) => o.id !== ind.id).map((o) => (
                            <SelectItem key={o.id} value={o.id}>{o.kind} ({o.id})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select></div>
                  )}
                  {ind.kind === 'MACD' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">Fast</Label>
                      <div className="w-16"><NumInput value={ind.fastPeriod} onChange={(v) => updateIndicator(ind.id, { fastPeriod: v ?? 12 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Slow</Label>
                      <div className="w-16"><NumInput value={ind.slowPeriod} onChange={(v) => updateIndicator(ind.id, { slowPeriod: v ?? 26 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Signal</Label>
                      <div className="w-16"><NumInput value={ind.signalPeriod} onChange={(v) => updateIndicator(ind.id, { signalPeriod: v ?? 9 })} min="1" /></div></div>
                  </>)}
                  {ind.kind === 'STOCHASTIC' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">%K period</Label>
                      <div className="w-16"><NumInput value={ind.period} onChange={(v) => updateIndicator(ind.id, { period: v ?? 14 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">%D period</Label>
                      <div className="w-16"><NumInput value={ind.signalPeriod} onChange={(v) => updateIndicator(ind.id, { signalPeriod: v ?? 3 })} min="1" /></div></div>
                  </>)}
                  {ind.kind === 'BOLLINGER' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">Period</Label>
                      <div className="w-16"><NumInput value={ind.period} onChange={(v) => updateIndicator(ind.id, { period: v ?? 20 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Std dev</Label>
                      <div className="w-16"><NumInput value={ind.stdDev} onChange={(v) => updateIndicator(ind.id, { stdDev: v ?? 2 })} step="0.1" /></div></div>
                  </>)}
                  {ind.kind === 'SUPERTREND' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">ATR period</Label>
                      <div className="w-16"><NumInput value={ind.period} onChange={(v) => updateIndicator(ind.id, { period: v ?? 10 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Multiplier</Label>
                      <div className="w-16"><NumInput value={ind.stdDev} onChange={(v) => updateIndicator(ind.id, { stdDev: v ?? 3 })} step="0.1" /></div></div>
                  </>)}
                  {ind.kind === 'ICHIMOKU' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">Tenkan</Label>
                      <div className="w-16"><NumInput value={ind.period} onChange={(v) => updateIndicator(ind.id, { period: v ?? 9 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Kijun</Label>
                      <div className="w-16"><NumInput value={ind.fastPeriod} onChange={(v) => updateIndicator(ind.id, { fastPeriod: v ?? 26 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Senkou B</Label>
                      <div className="w-16"><NumInput value={ind.slowPeriod} onChange={(v) => updateIndicator(ind.id, { slowPeriod: v ?? 52 })} min="1" /></div></div>
                  </>)}
                  {ind.kind === 'VOLUME_PROFILE' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">Lookback bars</Label>
                      <div className="w-20"><NumInput value={ind.lookbackBars} onChange={(v) => updateIndicator(ind.id, { lookbackBars: v ?? 100 })} min="10" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Value area %</Label>
                      <div className="w-16"><NumInput value={ind.valueAreaPct} onChange={(v) => updateIndicator(ind.id, { valueAreaPct: v ?? 70 })} min="10" /></div></div>
                  </>)}
                  {ind.kind === 'ORB' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">Start (UTC)</Label>
                      <div className="w-16"><NumInput value={ind.sessionStartHourUtc} onChange={(v) => updateIndicator(ind.id, { sessionStartHourUtc: v ?? 14 })} min="0" /></div>
                      <span className="text-xs">:</span>
                      <div className="w-16"><NumInput value={ind.sessionStartMinuteUtc} onChange={(v) => updateIndicator(ind.id, { sessionStartMinuteUtc: v ?? 30 })} min="0" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Range minutes</Label>
                      <div className="w-16"><NumInput value={ind.rangeMinutes} onChange={(v) => updateIndicator(ind.id, { rangeMinutes: v ?? 30 })} min="1" /></div></div>
                  </>)}
                  {ind.kind === 'SWINGS' && (<>
                    <div className="flex items-center gap-2"><Label className="text-xs">Pivot left</Label>
                      <div className="w-16"><NumInput value={ind.pivotLeft} onChange={(v) => updateIndicator(ind.id, { pivotLeft: v ?? 3 })} min="1" /></div></div>
                    <div className="flex items-center gap-2"><Label className="text-xs">Pivot right</Label>
                      <div className="w-16"><NumInput value={ind.pivotRight} onChange={(v) => updateIndicator(ind.id, { pivotRight: v ?? 3 })} min="1" /></div></div>
                  </>)}
                  {(ind.kind === 'FVG' || ind.kind === 'ORDER_BLOCK') && (
                    <div className="flex items-center gap-2"><Label className="text-xs">Max age (bars)</Label>
                      <div className="w-20"><NumInput value={ind.lookbackBars} onChange={(v) => updateIndicator(ind.id, { lookbackBars: v ?? 100 })} min="10" /></div></div>
                  )}
                  {ind.kind === 'ORDER_BLOCK' && (
                    <div className="flex items-center gap-2"><Label className="text-xs">Confirm window</Label>
                      <div className="w-16"><NumInput value={ind.pivotLeft} onChange={(v) => updateIndicator(ind.id, { pivotLeft: v ?? 5 })} min="1" /></div></div>
                  )}
                  {(ind.kind === 'VWAP' || ind.kind === 'PIVOTS') && (
                    <span className="text-xs text-muted-foreground">{ind.kind === 'VWAP' ? 'Daily-reset VWAP from bar volume.' : 'Classic floor pivots from the prior UTC day.'}</span>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 ml-auto" onClick={() => removeIndicator(ind.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-2">
                {(Object.keys(INDICATOR_DEFAULTS) as IndicatorKind[]).map((kind) => (
                  <Button key={kind} variant="outline" size="sm" disabled={spec.indicators.length >= 10} onClick={() => addIndicator(kind)}>
                    <Plus className="h-4 w-4 mr-1" /> {kind.replace(/_/g, ' ')}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Entry & Exit Rules</CardTitle>
              <CardDescription>Combine indicators into the exact conditions that open and close trades.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {renderGroup('Entry — Long (buy)', spec.entryLong, (g) => set({ entryLong: g }), 'All/any of these fire → open a long at the bar close.')}
              {renderGroup('Entry — Short (sell)', spec.entryShort, (g) => set({ entryShort: g }), 'All/any of these fire → open a short at the bar close.')}
              {renderOptionalGroup('Exit — Long', spec.exitLong, (g) => set({ exitLong: g }), 'Close the long early when these fire.')}
              {renderOptionalGroup('Exit — Short', spec.exitShort, (g) => set({ exitShort: g }), 'Close the short early when these fire.')}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Filters — Session & Higher Timeframe</CardTitle>
              <CardDescription>Optional gates on top of your entry rules: only trade inside a UTC session window, and/or only when a higher timeframe agrees with the trade direction.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {spec.sessionFilter == null ? (
                <div className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">Session filter (UTC)</div>
                    <div className="text-xs text-muted-foreground">Entries only inside a daily window — e.g. London/NY hours only.</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => set({ sessionFilter: { startHourUtc: 7, endHourUtc: 21, daysUtc: [1, 2, 3, 4, 5] } })}>
                    <Plus className="h-4 w-4 mr-1" /> Add session filter
                  </Button>
                </div>
              ) : (
                <div className="border rounded-lg p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">Session (UTC)</span>
                    <span className="text-xs text-muted-foreground">from</span>
                    <div className="w-16"><NumInput value={spec.sessionFilter.startHourUtc} onChange={(v) => set({ sessionFilter: { ...spec.sessionFilter!, startHourUtc: v ?? 0 } })} min="0" /></div>
                    <span className="text-xs text-muted-foreground">:00 to</span>
                    <div className="w-16"><NumInput value={spec.sessionFilter.endHourUtc} onChange={(v) => set({ sessionFilter: { ...spec.sessionFilter!, endHourUtc: v ?? 24 } })} min="0" /></div>
                    <span className="text-xs text-muted-foreground">:00 (end before start = wraps midnight)</span>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => set({ sessionFilter: null })}>Remove</Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, di) => {
                      const days = spec.sessionFilter!.daysUtc ?? [];
                      const on = days.length === 0 || days.includes(di);
                      return (
                        <Button key={d} variant={on ? 'default' : 'outline'} size="sm" className="h-7 px-2 text-xs" onClick={() => {
                          const cur = days.length === 0 ? [0, 1, 2, 3, 4, 5, 6] : [...days];
                          const next = cur.includes(di) ? cur.filter((x) => x !== di) : [...cur, di].sort();
                          set({ sessionFilter: { ...spec.sessionFilter!, daysUtc: next.length === 7 ? [] : next } });
                        }}>{d}</Button>
                      );
                    })}
                  </div>
                </div>
              )}

              {spec.trendFilter == null ? (
                <div className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">Higher-timeframe trend filter</div>
                    <div className="text-xs text-muted-foreground">The same indicators, computed on a higher timeframe, must agree before any entry fires.</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => {
                    const higher = TIMEFRAMES.filter((t) => TF_ORDER.indexOf(t) > TF_ORDER.indexOf(spec.timeframe));
                    set({ trendFilter: { timeframe: (higher[0] ?? 'H4') as StrategySpec['timeframe'], longGroup: { logic: 'AND', conditions: [] }, shortGroup: { logic: 'AND', conditions: [] } } });
                  }}>
                    <Plus className="h-4 w-4 mr-1" /> Add trend filter
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">Trend filter timeframe</span>
                    <Select value={spec.trendFilter.timeframe} onValueChange={(v) => set({ trendFilter: { ...spec.trendFilter!, timeframe: v as StrategySpec['timeframe'] } })}>
                      <SelectTrigger className="w-28 h-9"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIMEFRAMES.filter((t) => TF_ORDER.indexOf(t) > TF_ORDER.indexOf(spec.timeframe)).map((t) => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">evaluated on the last closed {spec.trendFilter.timeframe} bar</span>
                    <Button variant="ghost" size="sm" className="ml-auto" onClick={() => set({ trendFilter: null })}>Remove filter</Button>
                  </div>
                  {renderOptionalGroup('HTF gate — Longs', spec.trendFilter.longGroup, (g) => set({ trendFilter: { ...spec.trendFilter!, longGroup: g } }), `Must hold on ${spec.trendFilter.timeframe} for long entries.`)}
                  {renderOptionalGroup('HTF gate — Shorts', spec.trendFilter.shortGroup, (g) => set({ trendFilter: { ...spec.trendFilter!, shortGroup: g } }), `Must hold on ${spec.trendFilter.timeframe} for short entries.`)}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Risk & Sizing</CardTitle>
          <CardDescription>Fixed lot sizing in v1. Leave a field empty to turn it off — a backtestable strategy needs at least a stop loss or a take profit.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2"><Label>Lot size</Label>
            <NumInput value={spec.risk.lotSize} onChange={(v) => set({ risk: { ...spec.risk, lotSize: v ?? 0.01 } })} step="0.01" min="0.01" /></div>
          <div className="space-y-2"><Label>Stop loss (pips)</Label>
            <NumInput value={spec.risk.stopLossPips} onChange={(v) => set({ risk: { ...spec.risk, stopLossPips: v } })} placeholder="off" /></div>
          <div className="space-y-2"><Label>Take profit (pips)</Label>
            <NumInput value={spec.risk.takeProfitPips} onChange={(v) => set({ risk: { ...spec.risk, takeProfitPips: v } })} placeholder="off" /></div>
          <div className="space-y-2"><Label>Trailing stop (pips)</Label>
            <NumInput value={spec.risk.trailingStopPips} onChange={(v) => set({ risk: { ...spec.risk, trailingStopPips: v } })} placeholder="off" /></div>
          <div className="space-y-2"><Label>Max trades per day</Label>
            <NumInput value={spec.risk.maxTradesPerDay} onChange={(v) => set({ risk: { ...spec.risk, maxTradesPerDay: v } })} placeholder="no cap" /></div>
          <div className="space-y-2"><Label>Breakeven trigger (pips profit)</Label>
            <NumInput value={spec.risk.breakevenTriggerPips} onChange={(v) => set({ risk: { ...spec.risk, breakevenTriggerPips: v } })} placeholder="off" /></div>
          <div className="space-y-2"><Label>Breakeven offset (pips)</Label>
            <NumInput value={spec.risk.breakevenOffsetPips} onChange={(v) => set({ risk: { ...spec.risk, breakevenOffsetPips: v } })} placeholder="0" /></div>
          {spec.indicators.some((i) => i.kind === 'ATR') && (<>
            <div className="space-y-2"><Label>Stop loss (× ATR)</Label>
              <NumInput value={spec.risk.stopLossAtrMult} onChange={(v) => set({ risk: { ...spec.risk, stopLossAtrMult: v } })} step="0.1" placeholder="off" /></div>
            <div className="space-y-2"><Label>Take profit (× ATR)</Label>
              <NumInput value={spec.risk.takeProfitAtrMult} onChange={(v) => set({ risk: { ...spec.risk, takeProfitAtrMult: v } })} step="0.1" placeholder="off" /></div>
          </>)}
        </CardContent>
      </Card>
    </div>
  );
}
