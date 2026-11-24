/**
 * Studio co-pilot — ABBA watching a Strategy Studio draft.
 *
 * Two layers, one rule: ADVISORY ONLY.
 *   (a) The deterministic Strategy Health findings are computed on the
 *       client (client/src/lib/strategy-health.ts) and shown instantly.
 *   (b) "Ask ABBA about this draft" (POST /api/strategy-studio/copilot)
 *       sends the spec + those findings through the same AI plumbing
 *       ABBA chat uses and returns short suggestions. A suggestion may
 *       carry ONE machine action from the small allowlist below; the
 *       action is applied to a copy, re-validated with the Studio's
 *       own validator, and only survives if the resulting spec is
 *       valid AND actually changed. Applying it in the Studio is the
 *       user's click, client-side — this module never saves, never
 *       deploys, never reaches a broker path.
 *
 * Kill switch: STUDIO_COPILOT=off hides the panel (status route) and
 * 404s the review route; the Studio then behaves exactly as before.
 */
import {
  validateStrategySpec, INDICATOR_CATALOG,
  type StrategySpec, type IndicatorKind, type IndicatorConfig,
} from './strategy-spec';
import { describeStrategySpec } from './abba-strategy-create';

export function studioCopilotEnabled(): boolean {
  return process.env.STUDIO_COPILOT !== 'off';
}

// ── The action allowlist ─────────────────────────────────────────────
// Every edit ABBA may ever propose in the Studio. Deliberately small
// and boring: risk numbers, one indicator, one filter. Nothing here
// can create a strategy, change a symbol/timeframe, or touch an
// account. The client mirrors applyCopilotAction exactly (pinned by
// scripts/check-strategy-builder-hub.ts).

export type CopilotAction =
  | { kind: 'set_stop_loss_pips'; pips: number }
  | { kind: 'set_take_profit_pips'; pips: number }
  | { kind: 'set_stop_loss_atr'; mult: number }
  | { kind: 'add_indicator'; indicator: IndicatorKind }
  | { kind: 'add_session_filter' }
  | { kind: 'add_trend_filter' }
  | { kind: 'set_breakeven'; triggerPips: number }
  | { kind: 'set_max_trades_per_day'; count: number };

export const COPILOT_ACTION_KINDS = [
  'set_stop_loss_pips', 'set_take_profit_pips', 'set_stop_loss_atr',
  'add_indicator', 'add_session_filter', 'add_trend_filter',
  'set_breakeven', 'set_max_trades_per_day',
] as const;

const TF_ORDER: StrategySpec['timeframe'][] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

function uniqueIndicatorId(spec: StrategySpec, kind: IndicatorKind): string {
  let n = 1;
  let id = `${kind.toLowerCase()}${n}`;
  while (spec.indicators.some((i) => i.id === id)) { n++; id = `${kind.toLowerCase()}${n}`; }
  return id;
}

function withIndicator(spec: StrategySpec, kind: IndicatorKind, extra?: Partial<IndicatorConfig>): IndicatorConfig {
  const defaults = INDICATOR_CATALOG.find((c) => c.kind === kind)?.defaults ?? {};
  return { id: uniqueIndicatorId(spec, kind), kind, ...defaults, ...extra };
}

/** Apply one allowlisted action to a copy of the spec. Returns the new
 *  spec, or null when the action changes nothing / cannot apply (the
 *  suggestion then degrades to advice-only text). Pure. */
export function applyCopilotAction(spec: StrategySpec, action: CopilotAction): StrategySpec | null {
  const s: StrategySpec = JSON.parse(JSON.stringify(spec));
  switch (action.kind) {
    case 'set_stop_loss_pips':
      if (s.risk.stopLossPips === action.pips) return null;
      s.risk = { ...s.risk, stopLossPips: action.pips };
      return s;
    case 'set_take_profit_pips':
      if (s.risk.takeProfitPips === action.pips) return null;
      s.risk = { ...s.risk, takeProfitPips: action.pips };
      return s;
    case 'set_stop_loss_atr': {
      const hadAtr = s.indicators.some((i) => i.kind === 'ATR');
      if (hadAtr && s.risk.stopLossAtrMult === action.mult) return null;
      if (!hadAtr) {
        if (s.indicators.length >= 10) return null;
        s.indicators = [...s.indicators, withIndicator(s, 'ATR', { period: 14 })];
      }
      s.risk = { ...s.risk, stopLossAtrMult: action.mult };
      return s;
    }
    case 'add_indicator': {
      if (s.indicators.some((i) => i.kind === action.indicator)) return null;
      if (s.indicators.length >= 10) return null;
      s.indicators = [...s.indicators, withIndicator(s, action.indicator)];
      return s;
    }
    case 'add_session_filter':
      if (s.sessionFilter) return null;
      s.sessionFilter = { startHourUtc: 7, endHourUtc: 21, daysUtc: [1, 2, 3, 4, 5] };
      return s;
    case 'add_trend_filter': {
      if (s.trendFilter) return null;
      const idx = TF_ORDER.indexOf(s.timeframe);
      if (idx < 0 || idx >= TF_ORDER.length - 1) return null;
      let ema = s.indicators.find((i) => i.kind === 'EMA');
      if (!ema) {
        if (s.indicators.length >= 10) return null;
        ema = withIndicator(s, 'EMA', { period: 50 });
        s.indicators = [...s.indicators, ema];
      }
      const gate = (operator: 'above' | 'below') => ({
        logic: 'AND' as const,
        conditions: [{
          indicatorId: 'price', field: 'price' as const, operator,
          compare: { kind: 'indicator' as const, indicatorId: ema!.id, field: 'value' as const },
        }],
      });
      s.trendFilter = { timeframe: TF_ORDER[idx + 1], longGroup: gate('above'), shortGroup: gate('below') };
      return s;
    }
    case 'set_breakeven':
      if (s.risk.breakevenTriggerPips === action.triggerPips) return null;
      s.risk = {
        ...s.risk,
        breakevenTriggerPips: action.triggerPips,
        breakevenOffsetPips: s.risk.breakevenOffsetPips ?? 0,
      };
      return s;
    case 'set_max_trades_per_day':
      if (s.risk.maxTradesPerDay === action.count) return null;
      s.risk = { ...s.risk, maxTradesPerDay: action.count };
      return s;
    default:
      return null;
  }
}

const inRange = (x: any, min: number, max: number): number | null =>
  typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max ? x : null;

/** Structural validation of one AI-proposed action. Anything outside
 *  the allowlist, or with numbers outside the sane ranges, is dropped. */
export function sanitizeCopilotAction(raw: any): CopilotAction | null {
  if (!raw || typeof raw !== 'object') return null;
  switch (raw.kind) {
    case 'set_stop_loss_pips': {
      const pips = inRange(raw.pips, 1, 2000);
      return pips == null ? null : { kind: 'set_stop_loss_pips', pips: Math.round(pips) };
    }
    case 'set_take_profit_pips': {
      const pips = inRange(raw.pips, 1, 5000);
      return pips == null ? null : { kind: 'set_take_profit_pips', pips: Math.round(pips) };
    }
    case 'set_stop_loss_atr': {
      const mult = inRange(raw.mult, 0.25, 10);
      return mult == null ? null : { kind: 'set_stop_loss_atr', mult: Math.round(mult * 100) / 100 };
    }
    case 'add_indicator': {
      const ok = INDICATOR_CATALOG.some((c) => c.kind === raw.indicator);
      return ok ? { kind: 'add_indicator', indicator: raw.indicator as IndicatorKind } : null;
    }
    case 'add_session_filter':
      return { kind: 'add_session_filter' };
    case 'add_trend_filter':
      return { kind: 'add_trend_filter' };
    case 'set_breakeven': {
      const t = inRange(raw.triggerPips, 1, 2000);
      return t == null ? null : { kind: 'set_breakeven', triggerPips: Math.round(t) };
    }
    case 'set_max_trades_per_day': {
      const n = inRange(raw.count, 1, 100);
      return n == null ? null : { kind: 'set_max_trades_per_day', count: Math.round(n) };
    }
    default:
      return null;
  }
}

export interface CopilotSuggestion {
  text: string;
  /** Present only when the edit is concrete, applicable, and leaves a
   *  Studio-valid spec. The client renders an Apply button for it;
   *  without an action the suggestion is advice-only. */
  action?: CopilotAction;
}

/** Parse + vet the model's suggestions against the real draft. */
export function sanitizeCopilotSuggestions(raw: any, spec: StrategySpec): CopilotSuggestion[] {
  const list = Array.isArray(raw) ? raw : Array.isArray(raw?.suggestions) ? raw.suggestions : [];
  const out: CopilotSuggestion[] = [];
  for (const item of list) {
    if (out.length >= 4) break;
    const text = String(item?.text ?? '').trim().slice(0, 300);
    if (!text) continue;
    let action: CopilotAction | undefined;
    if (item?.action != null) {
      const clean = sanitizeCopilotAction(item.action);
      if (clean) {
        const applied = applyCopilotAction(spec, clean);
        if (applied && validateStrategySpec(applied).ok) action = clean;
      }
    }
    out.push(action ? { text, action } : { text });
  }
  return out;
}

export const COPILOT_ACTIONS_BRIEF = `You may attach AT MOST ONE action per suggestion, and only from this list (anything else is discarded):
- {"kind":"set_stop_loss_pips","pips":<1-2000>} — set the stop loss in pips.
- {"kind":"set_take_profit_pips","pips":<1-5000>} — set the take profit in pips.
- {"kind":"set_stop_loss_atr","mult":<0.25-10>} — size the stop as a multiple of ATR (adds an ATR indicator if the draft has none).
- {"kind":"add_indicator","indicator":"<one of the Studio indicator kinds>"} — add an indicator the draft lacks, with standard settings.
- {"kind":"add_session_filter"} — restrict entries to 07:00–21:00 UTC, Mon–Fri.
- {"kind":"add_trend_filter"} — add a higher-timeframe gate: price must be above the EMA on the next timeframe up for longs, below for shorts.
- {"kind":"set_breakeven","triggerPips":<1-2000>} — move the stop to entry after this many pips of profit.
- {"kind":"set_max_trades_per_day","count":<1-100>} — cap daily trades.
Attach an action ONLY when your suggestion is exactly that edit. Otherwise give the advice as text with no action.`;

/** One explicit, user-tapped review of a draft. Same AI client ABBA
 *  chat uses (getUniversalAIClientForUser via the route). Never called
 *  on draft changes — only from the Ask button. */
export async function reviewStrategyDraft(
  ai: { client: any; model: string },
  spec: StrategySpec,
  findings: string[],
): Promise<CopilotSuggestion[]> {
  const summary = describeStrategySpec(spec);
  const lines = [
    `Strategy: ${summary.name} — ${summary.market}`,
    ...summary.entryLong.map((l) => `Long entry: ${l}`),
    ...summary.entryShort.map((l) => `Short entry: ${l}`),
    ...summary.exitLines.map((l) => `Exit: ${l}`),
    ...summary.risk.map((l) => `Risk: ${l}`),
    ...summary.filters.map((l) => `Filter: ${l}`),
  ];
  const eduNotes = spec.indicators
    .map((i) => INDICATOR_CATALOG.find((c) => c.kind === i.kind)?.education)
    .filter(Boolean)
    .map((e) => `${e!.plainName}: known weakness — ${e!.whyItFails}`)
    .join('\n');
  const r = await ai.client.chat.completions.create({
    model: ai.model, temperature: 0.2, max_tokens: 1200,
    messages: [
      {
        role: 'system',
        content: `You are ABBA, the trading co-pilot inside the Strategy Builder Hub, reviewing a draft strategy the trader is building. Give AT MOST 4 short, concrete suggestions (one or two sentences each) that would make THIS draft better built — tighter risk, a missing filter, a contradiction fixed, a block that pairs well. Ground every suggestion in the draft and the deterministic health findings provided. Refer to blocks by their plain names. NEVER promise or imply the strategy will make money, never quote win rates or expected returns, and never tell the trader to deploy or trade it live — the backtest and the Shadow record are the proof, say so when relevant. Reply with JSON only: {"suggestions":[{"text":"...","action":{...} | null}]}.
${COPILOT_ACTIONS_BRIEF}`,
      },
      {
        role: 'user',
        content: `THE DRAFT:\n${lines.join('\n')}\n\nDETERMINISTIC HEALTH FINDINGS:\n${findings.length ? findings.join('\n') : '(none)'}\n\nWHAT EACH BLOCK IS KNOWN TO DO WRONG:\n${eduNotes || '(no indicators)'}`,
      },
    ],
  });
  const raw = String(r.choices[0]?.message?.content || '');
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    return sanitizeCopilotSuggestions(JSON.parse(m[0]), spec);
  } catch {
    return [];
  }
}
