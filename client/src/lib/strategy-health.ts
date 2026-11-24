/**
 * Strategy Health — a plain-words readout of an assembled draft,
 * computed DETERMINISTICALLY from the spec alone. No AI, no market
 * data, no performance prediction: it checks the SHAPE of the rules
 * (is there a stop? do the entry and the filter fight? is it filtered
 * so heavily it may never fire?) and phrases each finding with the
 * education copy for the block involved, so the user learns why.
 *
 * The same findings feed the ABBA co-pilot panel instantly as the
 * draft changes, and are sent as context when the user taps
 * "Ask ABBA about this draft".
 */
import type { StrategySpec, Condition, ConditionGroup } from './strategy-spec';
import { BLOCK_EDUCATION } from './block-education';

export interface HealthFinding {
  id: string;
  level: 'strength' | 'risk' | 'note';
  title: string;
  detail: string;
  /** Catalog/block key the finding teaches about, when one applies. */
  blockKey?: string;
}

const edu = (key: string) => BLOCK_EDUCATION[key];

/** Polarity of a condition for contradiction checks: +1 = "above-ish",
 *  −1 = "below-ish", 0 = not a level comparison. Keyed by the exact
 *  series + field + compare target, so only genuinely opposed rules
 *  on the SAME line count as fighting. */
function polarityKey(c: Condition): string | null {
  if (c.operator !== 'above' && c.operator !== 'below' && c.operator !== 'crosses_above' && c.operator !== 'crosses_below') return null;
  const cmp = c.compare;
  const target = cmp.kind === 'value' ? `v:${cmp.value}`
    : cmp.kind === 'indicator' ? `i:${cmp.indicatorId}.${cmp.field}`
    : 'price';
  return `${c.indicatorId}|${c.field}|${target}`;
}
function polarities(g: ConditionGroup | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  if (!g || g.logic !== 'AND') return m; // OR groups don't require both sides at once
  for (const c of g.conditions) {
    const k = polarityKey(c);
    if (k) m.set(k, (c.operator === 'above' || c.operator === 'crosses_above') ? 1 : -1);
  }
  return m;
}
function contradictions(a: ConditionGroup | null | undefined, b: ConditionGroup | null | undefined): boolean {
  const pa = polarities(a);
  const pb = polarities(b);
  let hit = false;
  pa.forEach((v, k) => { if (pb.get(k) === -v) hit = true; });
  return hit;
}
function selfContradiction(g: ConditionGroup | null | undefined): boolean {
  if (!g || g.logic !== 'AND') return false;
  const seen = new Map<string, number>();
  for (const c of g.conditions) {
    const k = polarityKey(c);
    if (!k) continue;
    const v = (c.operator === 'above' || c.operator === 'crosses_above') ? 1 : -1;
    if (seen.get(k) === -v) return true;
    seen.set(k, v);
  }
  return false;
}

const kindsUsed = (spec: StrategySpec) => new Set(spec.indicators.map((i) => i.kind));
const referencedIds = (spec: StrategySpec): Set<string> => {
  const ids = new Set<string>();
  const scan = (g: ConditionGroup | null | undefined) => {
    for (const c of g?.conditions ?? []) {
      ids.add(c.indicatorId);
      if (c.compare.kind === 'indicator') ids.add(c.compare.indicatorId);
    }
  };
  scan(spec.entryLong); scan(spec.entryShort); scan(spec.exitLong); scan(spec.exitShort);
  scan(spec.trendFilter?.longGroup); scan(spec.trendFilter?.shortGroup);
  return ids;
};

export function analyzeStrategyHealth(spec: StrategySpec): HealthFinding[] {
  const out: HealthFinding[] = [];
  const add = (level: HealthFinding['level'], id: string, title: string, detail: string, blockKey?: string) =>
    out.push({ id, level, title, detail, blockKey });

  const r = spec.risk;
  const hasStop = r.stopLossPips != null || r.stopLossAtrMult != null;
  const hasTarget = r.takeProfitPips != null || r.takeProfitAtrMult != null;
  const hasExitRules = (spec.exitLong?.conditions.length ?? 0) > 0 || (spec.exitShort?.conditions.length ?? 0) > 0;
  const longN = spec.entryLong.conditions.length;
  const shortN = spec.entryShort.conditions.length;
  const kinds = kindsUsed(spec);

  // Engine-native: no fixed rules exist to check — say so honestly.
  if (spec.source === 'engine' && longN + shortN === 0) {
    add('note', 'engine-native', 'Engine AI strategy — nothing mechanical to check',
      'This strategy runs on the FX engine\'s AI analysis, not fixed rules, so there is no rule shape to review. Its record comes from live results once deployed.', undefined);
    if (!hasStop && !hasTarget) {
      add('risk', 'engine-no-exit', 'No stop or target set',
        'The risk settings below are the only exit plan this strategy carries. Set at least a stop loss so a wrong call has a pre-set maximum loss.', 'STOP_LOSS');
    }
    return out;
  }

  if (longN + shortN === 0) {
    add('risk', 'no-entries', 'No entry rules yet',
      'The draft has no conditions that would open a trade. Add an indicator from the library and build at least one entry rule.', undefined);
    return out;
  }

  // ── Exits: stop / target shape ────────────────────────────────────
  if (!hasStop) {
    add('risk', 'no-stop', 'No stop loss — losing trades have no pre-set exit',
      'Nothing in this draft says where a wrong trade gets out. ' + (edu('STOP_LOSS')?.whyItFails ?? ''), 'STOP_LOSS');
  }
  if (hasStop && hasTarget) {
    const sl = r.stopLossPips, tp = r.takeProfitPips;
    if (sl != null && tp != null && sl > 0 && tp > 0) {
      const breakevenWr = Math.round((sl / (sl + tp)) * 100);
      if (tp < sl) {
        add('risk', 'target-closer-than-stop', 'Target is closer than the stop',
          `This draft risks ${sl} pips to make ${tp} pips. At that shape it must win more than ${breakevenWr}% of its trades just to break even — before spread and costs. That is a hard bar; most traders give winners at least as much room as losers.`, 'TAKE_PROFIT');
      } else {
        add('strength', 'defined-rr', 'Defined risk and reward on every trade',
          `Stop ${sl} pips, target ${tp} pips — a winner pays ${(tp / sl).toFixed(1)}× what a loser costs, so the strategy breaks even at about a ${breakevenWr}% win rate before costs. The backtest shows whether it clears that bar.`, 'TAKE_PROFIT');
      }
    } else {
      add('strength', 'defined-exits', 'Stop and target both defined',
        'Every trade carries a pre-set exit in both directions — the basic shape of a testable strategy.', 'STOP_LOSS');
    }
  }
  if (hasStop && !hasTarget && !hasExitRules && r.trailingStopPips == null && r.breakevenTriggerPips == null) {
    add('note', 'no-winner-exit', 'Winners have no planned exit',
      'There is a stop loss but no take-profit, no exit rules, no trailing stop and no breakeven move — a winning trade stays open until price comes back to the stop. Many trend systems accept this on purpose; just know it is the choice being made.', 'TAKE_PROFIT');
  }
  if (r.breakevenTriggerPips != null) {
    add('strength', 'breakeven-on', 'Breakeven protection is on',
      `After +${r.breakevenTriggerPips} pips the stop moves to entry${r.breakevenOffsetPips ? ` (+${r.breakevenOffsetPips})` : ''} — a proven trade stops being able to turn into a loser. ${edu('BREAKEVEN')?.whyItFails ?? ''}`, 'BREAKEVEN');
  }
  if (r.trailingStopPips != null) {
    add('note', 'trailing-on', 'A trailing stop manages the exit',
      `The stop follows ${r.trailingStopPips} pips behind the best price. ${edu('TRAILING_STOP')?.whyItFails ?? ''}`, 'TRAILING_STOP');
  }
  if (r.maxTradesPerDay == null) {
    add('note', 'no-daily-cap', 'No daily trade cap',
      'If the rules misfire on a choppy day, nothing stops the strategy opening trade after trade. A cap is the simplest brake.', 'MAX_TRADES_PER_DAY');
  }

  // ── Entry shape ───────────────────────────────────────────────────
  for (const [side, g] of [['Long', spec.entryLong], ['Short', spec.entryShort]] as const) {
    if (g.logic === 'AND' && g.conditions.length >= 5) {
      add('risk', `over-filtered-${side}`, `${side} entries need ${g.conditions.length} conditions at once`,
        'Every added AND condition removes trades. Stacked this deep, the strategy may fire so rarely that a backtest has too few trades to judge — check the trade count when you run it.', undefined);
    }
    if (g.logic === 'OR' && g.conditions.length >= 3) {
      add('note', `or-entries-${side}`, `${side} entries fire on ANY of ${g.conditions.length} conditions`,
        'OR logic trades often and selects weakly — each single condition is enough on its own. That is a legitimate choice for a high-frequency design, but expect more noise trades.', undefined);
    }
    if (selfContradiction(g)) {
      add('risk', `self-fight-${side}`, `${side} entry rules contradict themselves`,
        'The same line is required to be both above and below the same level at the same time — that can never be true, so this side can never trade. Fix one of the two conditions.', undefined);
    }
  }
  if ((longN > 0) !== (shortN > 0)) {
    add('note', 'one-sided', 'One-sided strategy',
      `Only ${longN > 0 ? 'long (buy)' : 'short (sell)'} entries are defined. That is fine if it is deliberate — just know the strategy sits out every move in the other direction.`, undefined);
  }

  // ── Trend filter interplay ────────────────────────────────────────
  if (spec.trendFilter) {
    add('strength', 'htf-gate', `Higher-timeframe gate is on (${spec.trendFilter.timeframe})`,
      'Entries only fire when the higher timeframe agrees with the direction. ' + (edu('TREND_FILTER')?.whyItWorks ?? ''), 'TREND_FILTER');
    if (contradictions(spec.entryLong, spec.trendFilter.longGroup)) {
      add('risk', 'fight-long', 'Long entries and the trend filter fight each other',
        'A long entry needs a line ABOVE a level that the trend filter needs BELOW the same level. Both can never hold together, so longs are silently blocked. Align one of them.', 'TREND_FILTER');
    }
    if (contradictions(spec.entryShort, spec.trendFilter.shortGroup)) {
      add('risk', 'fight-short', 'Short entries and the trend filter fight each other',
        'A short entry needs a line BELOW a level that the trend filter needs ABOVE the same level. Both can never hold together, so shorts are silently blocked. Align one of them.', 'TREND_FILTER');
    }
    const tfSides = (spec.trendFilter.longGroup?.conditions.length ? 1 : 0) + (spec.trendFilter.shortGroup?.conditions.length ? 1 : 0);
    if (tfSides === 1) {
      add('note', 'htf-one-sided', 'Trend filter only gates one direction',
        'One side has an HTF gate and the other trades ungated. If that asymmetry is not deliberate, add the mirror gate.', 'TREND_FILTER');
    }
  } else {
    // Mean-reversion entries with no trend guard anywhere.
    const oscKinds = ['RSI', 'STOCHASTIC', 'CCI', 'WILLIAMS_R'];
    const idToKind = new Map(spec.indicators.map((i) => [i.id, i.kind]));
    const fadesExtreme = (g: ConditionGroup) => g.conditions.some((c) => {
      const k = idToKind.get(c.indicatorId);
      if (!k || !oscKinds.includes(k) || c.compare.kind !== 'value') return false;
      return (c.operator === 'crosses_above' && c.compare.value <= 35) || (c.operator === 'crosses_below' && c.compare.value >= 65);
    });
    if (fadesExtreme(spec.entryLong) || fadesExtreme(spec.entryShort)) {
      add('note', 'fading-no-trend-gate', 'Mean-reversion entries with no trend gate',
        'This draft buys oversold / sells overbought with nothing checking the bigger trend. ' + (edu('RSI')?.whyItFails ?? '') + ' A higher-timeframe filter is the usual companion.', 'RSI');
    }
  }

  // ── Session interplay ─────────────────────────────────────────────
  const sessionSensitive = kinds.has('ORB') || kinds.has('VWAP');
  if (sessionSensitive && !spec.sessionFilter) {
    add('risk', 'session-sensitive-no-filter', 'Session-based setup with no session filter',
      `${kinds.has('ORB') ? 'An opening-range' : 'A VWAP'} strategy is built around one part of the day, but entries are allowed around the clock — including the thin hours the design never intended. Add a session filter so it only trades its session.`, 'SESSION_FILTER');
  }
  if (kinds.has('ORB') && spec.sessionFilter) {
    add('strength', 'orb-session', 'Session window matches the opening-range design',
      'The ORB only trades inside its session window — the range and the entries live in the same part of the day.', 'ORB');
  }

  // ── Housekeeping ──────────────────────────────────────────────────
  const refs = referencedIds(spec);
  for (const ind of spec.indicators) {
    if (!refs.has(ind.id)) {
      add('note', `unused-${ind.id}`, `${ind.kind} is added but no rule reads it`,
        'An indicator that no condition uses does nothing except slow the warmup. Either wire it into a rule or remove it.', ind.kind);
    }
  }
  const totalConds = longN + shortN;
  if (totalConds >= 2 && spec.trendFilter && !out.some((f) => f.id.startsWith('fight-'))) {
    add('strength', 'aligned-stack', 'Entries and filter pull the same way',
      'The entry rules are confirmed by a higher-timeframe gate with no contradictions — the classic trend-following stack.', 'TREND_FILTER');
  }

  return out;
}
