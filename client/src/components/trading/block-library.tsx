import React, { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, Plus, Check, ChevronDown, ChevronUp, BookOpen, GraduationCap } from 'lucide-react';
import type { IndicatorKind } from '@/lib/strategy-spec';
import { INDICATOR_DEFAULTS } from '@/lib/strategy-spec';
import {
  BLOCK_EDUCATION, CANDLE_EDUCATION, PATTERN_EDUCATION, LIBRARY_CATEGORIES,
  plainNameOf, type BlockEducation, type BlockCategory,
} from '@/lib/block-education';
import { patternDiagrams } from '@/components/candlestick-diagrams';

/**
 * The Hub's library: every buildable block, browsable by category and
 * searchable by plain words ("breakout", "overbought", "reversal"),
 * each card teaching what the block is, why traders use it, and where
 * it breaks — at the moment of choosing. Candlesticks and chart
 * patterns are here to LEARN (with the app's own diagrams): the spec
 * has no candle/pattern conditions, and the cards say so honestly.
 */

export function BlockEduDetails({ edu, diagram, closestBuildable }: {
  edu: BlockEducation; diagram?: string; closestBuildable?: string;
}) {
  const Diagram = diagram ? (patternDiagrams as any)[diagram] : null;
  return (
    <div className="space-y-2 text-sm">
      {Diagram && (
        <div className="rounded-md bg-muted/40 p-2 max-w-[320px] [&_svg]:w-full [&_svg]:h-auto">
          <Diagram />
        </div>
      )}
      <p>{edu.whatItIs}</p>
      <p><span className="font-medium text-emerald-600 dark:text-emerald-400">Why traders use it: </span>{edu.whyItWorks}</p>
      <p><span className="font-medium text-amber-600 dark:text-amber-400">Where it breaks: </span>{edu.whyItFails}</p>
      {edu.pairsWith.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground mr-1">Pairs well with:</span>
          {edu.pairsWith.map((k) => (
            <Badge key={k} variant="outline" className="text-[11px]">{plainNameOf(k)}</Badge>
          ))}
        </div>
      )}
      {closestBuildable && (
        <p className="text-xs text-muted-foreground border-l-2 border-primary/40 pl-2">{closestBuildable}</p>
      )}
    </div>
  );
}

interface LibraryItem {
  key: string;
  edu: BlockEducation;
  /** 'indicator' | 'filter' entries can be added; 'learn' is education-only. */
  addKind: 'indicator' | 'session' | 'trend' | 'learn';
  diagram?: string;
  closestBuildable?: string;
  learnNote?: string;
}

const RISK_KEYS = ['STOP_LOSS', 'TAKE_PROFIT', 'TRAILING_STOP', 'BREAKEVEN', 'MAX_TRADES_PER_DAY'];

function buildItems(): LibraryItem[] {
  const items: LibraryItem[] = [];
  for (const [key, edu] of Object.entries(BLOCK_EDUCATION)) {
    if ((Object.keys(INDICATOR_DEFAULTS) as string[]).includes(key)) {
      items.push({ key, edu, addKind: 'indicator' });
    } else if (key === 'SESSION_FILTER') {
      items.push({ key, edu, addKind: 'session' });
    } else if (key === 'TREND_FILTER') {
      items.push({ key, edu, addKind: 'trend' });
    } else if (RISK_KEYS.includes(key)) {
      items.push({ key, edu, addKind: 'learn', learnNote: 'Set in the Risk & Sizing card below — this card is the teaching version.' });
    }
  }
  for (const c of CANDLE_EDUCATION) {
    items.push({
      key: c.key, edu: c.education, addKind: 'learn', diagram: c.diagram,
      closestBuildable: c.closestBuildable,
      learnNote: 'Learn only — the builder cannot trigger on candle shapes.',
    });
  }
  for (const p of PATTERN_EDUCATION) {
    items.push({
      key: p.key, edu: p.education, addKind: 'learn', diagram: p.diagram,
      closestBuildable: p.closestBuildable,
      learnNote: 'Learn only — chart patterns live in the Strategy Wizard\'s templates.',
    });
  }
  return items;
}

export function BlockLibrary({
  onAddIndicator, onAddSessionFilter, onAddTrendFilter,
  indicatorsFull, hasSessionFilter, hasTrendFilter, canAddTrendFilter,
}: {
  onAddIndicator: (kind: IndicatorKind) => void;
  onAddSessionFilter: () => void;
  onAddTrendFilter: () => void;
  indicatorsFull: boolean;
  hasSessionFilter: boolean;
  hasTrendFilter: boolean;
  canAddTrendFilter: boolean;
}) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<BlockCategory | 'All'>('All');
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = useMemo(buildItems, []);

  const visible = items.filter((it) => {
    if (category !== 'All' && it.edu.category !== category) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [it.key, it.edu.plainName, it.edu.whatItIs, it.edu.category, ...it.edu.searchTerms].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });

  const addButton = (it: LibraryItem) => {
    if (it.addKind === 'indicator') {
      return (
        <Button size="sm" className="min-h-[44px] px-4" disabled={indicatorsFull}
          onClick={() => onAddIndicator(it.key as IndicatorKind)}>
          <Plus className="h-4 w-4 mr-1" /> Add
        </Button>
      );
    }
    if (it.addKind === 'session') {
      return hasSessionFilter
        ? <Button size="sm" variant="secondary" className="min-h-[44px] px-4" disabled><Check className="h-4 w-4 mr-1" /> Added</Button>
        : <Button size="sm" className="min-h-[44px] px-4" onClick={onAddSessionFilter}><Plus className="h-4 w-4 mr-1" /> Add</Button>;
    }
    if (it.addKind === 'trend') {
      if (hasTrendFilter) return <Button size="sm" variant="secondary" className="min-h-[44px] px-4" disabled><Check className="h-4 w-4 mr-1" /> Added</Button>;
      if (!canAddTrendFilter) return <Button size="sm" variant="outline" className="min-h-[44px] px-4" disabled>Needs a lower timeframe</Button>;
      return <Button size="sm" className="min-h-[44px] px-4" onClick={onAddTrendFilter}><Plus className="h-4 w-4 mr-1" /> Add</Button>;
    }
    return <Badge variant="outline" className="text-[11px] py-1.5"><GraduationCap className="h-3 w-3 mr-1" /> Learn</Badge>;
  };

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder='Search blocks — try "breakout", "overbought", "reversal", "stop"…'
          className="pl-9 min-h-[44px]"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {(['All', ...LIBRARY_CATEGORIES] as const).map((c) => (
          <Button key={c} size="sm" variant={category === c ? 'default' : 'outline'}
            className="min-h-[44px] whitespace-nowrap" onClick={() => setCategory(c)}>
            {c}
          </Button>
        ))}
      </div>
      {visible.length === 0 && (
        <p className="text-sm text-muted-foreground border rounded-lg p-4">
          Nothing matches "{query}"{category !== 'All' ? ` in ${category}` : ''}. Try a plainer word — "trend", "volume", "stop", "gap".
        </p>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {visible.map((it) => {
          const open = expanded === it.key;
          return (
            <div key={it.key} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm leading-snug">{it.edu.plainName}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    <Badge variant="secondary" className="text-[10px]">{it.edu.category}</Badge>
                    {it.learnNote && <Badge variant="outline" className="text-[10px]">learn only</Badge>}
                  </div>
                </div>
                {addButton(it)}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{it.edu.whatItIs}</p>
              {it.learnNote && !open && <p className="text-[11px] text-muted-foreground italic">{it.learnNote}</p>}
              <Button variant="ghost" size="sm" className="min-h-[44px] px-2 -ml-2 text-xs"
                onClick={() => setExpanded(open ? null : it.key)}>
                <BookOpen className="h-3.5 w-3.5 mr-1" />
                Why it works / where it breaks
                {open ? <ChevronUp className="h-3.5 w-3.5 ml-1" /> : <ChevronDown className="h-3.5 w-3.5 ml-1" />}
              </Button>
              {open && <BlockEduDetails edu={it.edu} diagram={it.diagram} closestBuildable={it.closestBuildable} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
