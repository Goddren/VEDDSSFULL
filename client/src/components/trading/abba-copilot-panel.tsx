import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bot, Loader2, Check, X, AlertTriangle, CheckCircle2, Info, Sparkles } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import type { StrategySpec } from '@/lib/strategy-spec';
import { analyzeStrategyHealth } from '@/lib/strategy-health';
import { applyCopilotAction, describeCopilotAction, type CopilotAction } from '@/lib/studio-copilot';

interface Suggestion { text: string; action?: CopilotAction }

/**
 * ABBA co-pilot — ABBA watches the draft and adds its two cents.
 * Layer (a): the deterministic health findings, echoed live.
 * Layer (b): "Ask ABBA" — an explicit tap sends the draft + findings
 * through ABBA's AI plumbing. Suggestions are advice; the only way one
 * changes the draft is the user's own Apply tap, which runs the
 * server-vetted action against the local draft. ABBA never saves,
 * never deploys, never auto-edits. The panel disappears entirely when
 * STUDIO_COPILOT=off (server status route) — the Studio then behaves
 * exactly as it did before the Hub.
 */
export function AbbaCopilotPanel({ spec, onApplySpec }: {
  spec: StrategySpec;
  onApplySpec: (s: StrategySpec) => void;
}) {
  const { toast } = useToast();
  const { data: status } = useQuery<{ enabled: boolean }>({
    queryKey: ['/api/strategy-studio/copilot'],
  });
  const findings = useMemo(() => analyzeStrategyHealth(spec), [spec]);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [stale, setStale] = useState<Set<number>>(new Set());

  if (!status || status.enabled === false) return null;

  const echo = [...findings.filter((f) => f.level === 'risk'),
    ...findings.filter((f) => f.level === 'strength'),
    ...findings.filter((f) => f.level === 'note')].slice(0, 4);

  const ask = async () => {
    setAsking(true);
    setAskError(null);
    setApplied(new Set());
    setDismissed(new Set());
    setStale(new Set());
    try {
      const res = await apiRequest('POST', '/api/strategy-studio/copilot', {
        spec,
        findings: findings.map((f) => `${f.level.toUpperCase()}: ${f.title} — ${f.detail}`),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || 'ABBA could not review this draft.');
      setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
      if (!data.suggestions?.length) {
        setAskError('ABBA read the draft and had nothing to add beyond the health findings — that is a good sign for the draft\'s shape.');
      }
    } catch (e: any) {
      const raw = e?.message || 'ABBA could not review this draft.';
      let msg = raw;
      try { const j = JSON.parse(raw); msg = j.error || raw; } catch { /* keep raw */ }
      setAskError(String(msg).slice(0, 300));
    } finally {
      setAsking(false);
    }
  };

  const apply = (idx: number, action: CopilotAction) => {
    const next = applyCopilotAction(spec, action);
    if (!next) {
      setStale((s) => new Set(s).add(idx));
      toast({ title: 'That edit no longer applies', description: 'The draft changed since ABBA suggested it — ask again for fresh eyes.', variant: 'destructive' });
      return;
    }
    onApplySpec(next);
    setApplied((s) => new Set(s).add(idx));
    toast({ title: 'Applied to your draft', description: describeCopilotAction(action) + '. Nothing is saved until you tap Save Strategy.' });
  };

  return (
    <Card className="border-violet-500/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-5 w-5 text-violet-400" /> ABBA Co-pilot
        </CardTitle>
        <CardDescription>
          ABBA is watching this draft. Its notes are advice — nothing here changes, saves
          or deploys anything unless you tap Apply yourself.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {echo.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">What ABBA sees right now</div>
            {echo.map((f) => (
              <div key={f.id} className="flex items-center gap-2 text-sm">
                {f.level === 'risk' && <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                {f.level === 'strength' && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                {f.level === 'note' && <Info className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
                <span className="leading-snug">{f.title}</span>
              </div>
            ))}
          </div>
        )}

        <Button className="w-full min-h-[44px]" onClick={ask} disabled={asking}>
          {asking
            ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> ABBA is reading your draft…</>
            : <><Sparkles className="h-4 w-4 mr-2" /> Ask ABBA about this draft</>}
        </Button>

        {askError && (
          <div className="border rounded-lg p-3 text-sm text-muted-foreground">{askError}</div>
        )}

        {suggestions.map((s, idx) => {
          if (dismissed.has(idx)) return null;
          const isApplied = applied.has(idx);
          const isStale = stale.has(idx);
          return (
            <div key={idx} className="border rounded-lg p-3 space-y-2">
              <p className="text-sm leading-relaxed">{s.text}</p>
              <div className="flex flex-wrap items-center gap-2">
                {s.action && !isApplied && !isStale && (
                  <Button size="sm" className="min-h-[44px]" onClick={() => apply(idx, s.action!)}>
                    <Check className="h-4 w-4 mr-1" /> Apply: {describeCopilotAction(s.action)}
                  </Button>
                )}
                {isApplied && <Badge className="py-1.5"><Check className="h-3 w-3 mr-1" /> Applied to draft</Badge>}
                {isStale && <Badge variant="outline" className="py-1.5">No longer applies</Badge>}
                {!isApplied && (
                  <Button size="sm" variant="ghost" className="min-h-[44px]" onClick={() => setDismissed((d) => new Set(d).add(idx))}>
                    <X className="h-4 w-4 mr-1" /> Dismiss
                  </Button>
                )}
              </div>
            </div>
          );
        })}

        <p className="text-[11px] text-muted-foreground">
          Suggestions are a second pair of eyes, not a promise — the backtest and the Shadow (virtual) record are the proof.
        </p>
      </CardContent>
    </Card>
  );
}
