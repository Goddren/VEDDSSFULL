import React, { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Activity, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import type { StrategySpec } from '@/lib/strategy-spec';
import { analyzeStrategyHealth, type HealthFinding } from '@/lib/strategy-health';

/**
 * Strategy Health — the deterministic plain-words readout of the
 * current draft. Recomputes on every edit (it is a pure function of
 * the spec — no AI, no network), teaching while the user builds.
 */
export function StrategyHealthPanel({ spec }: { spec: StrategySpec }) {
  const findings = useMemo(() => analyzeStrategyHealth(spec), [spec]);
  const strengths = findings.filter((f) => f.level === 'strength');
  const risks = findings.filter((f) => f.level === 'risk');
  const notes = findings.filter((f) => f.level === 'note');

  const row = (f: HealthFinding) => (
    <div key={f.id} className="flex gap-2">
      {f.level === 'strength' && <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />}
      {f.level === 'risk' && <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />}
      {f.level === 'note' && <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />}
      <div className="min-w-0">
        <div className="text-sm font-medium leading-snug">{f.title}</div>
        <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">{f.detail}</p>
      </div>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-5 w-5 text-indigo-400" /> Strategy Health
        </CardTitle>
        <CardDescription>
          A plain-words check of this draft's shape — strengths, gaps and contradictions,
          updated as you build. {strengths.length} strength{strengths.length === 1 ? '' : 's'} · {risks.length} risk{risks.length === 1 ? '' : 's'} · {notes.length} note{notes.length === 1 ? '' : 's'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {risks.map(row)}
        {strengths.map(row)}
        {notes.map(row)}
        {findings.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing to flag yet — start adding blocks and rules and this panel reads the draft as you go.</p>
        )}
        <p className="text-[11px] text-muted-foreground border-t pt-2">
          These checks read your rules only — they are not a prediction. The backtest and the Shadow (virtual) record are where a strategy proves itself.
        </p>
      </CardContent>
    </Card>
  );
}
