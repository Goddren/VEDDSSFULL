/**
 * Studio co-pilot actions — client mirror of the server allowlist
 * (server/services/studio-copilot.ts). The server vets every action
 * ABBA proposes against the real draft; this mirror is what the Apply
 * button runs, on the user's click only, to edit the LOCAL draft.
 * ABBA never calls this itself: no auto-edit, no save, no deploy.
 * Parity between the two implementations is pinned by
 * scripts/check-strategy-builder-hub.ts.
 */
import type { StrategySpec, IndicatorKind, IndicatorConfig } from './strategy-spec';
import { INDICATOR_DEFAULTS } from './strategy-spec';
import { BLOCK_EDUCATION } from './block-education';

export type CopilotAction =
  | { kind: 'set_stop_loss_pips'; pips: number }
  | { kind: 'set_take_profit_pips'; pips: number }
  | { kind: 'set_stop_loss_atr'; mult: number }
  | { kind: 'add_indicator'; indicator: IndicatorKind }
  | { kind: 'add_session_filter' }
  | { kind: 'add_trend_filter' }
  | { kind: 'set_breakeven'; triggerPips: number }
  | { kind: 'set_max_trades_per_day'; count: number };

const TF_ORDER: StrategySpec['timeframe'][] = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

function uniqueIndicatorId(spec: StrategySpec, kind: IndicatorKind): string {
  let n = 1;
  let id = `${kind.toLowerCase()}${n}`;
  while (spec.indicators.some((i) => i.id === id)) { n++; id = `${kind.toLowerCase()}${n}`; }
  return id;
}

function withIndicator(spec: StrategySpec, kind: IndicatorKind, extra?: Partial<IndicatorConfig>): IndicatorConfig {
  return { id: uniqueIndicatorId(spec, kind), kind, ...INDICATOR_DEFAULTS[kind], ...extra };
}

/** Apply one allowlisted action to a copy of the draft. Returns the new
 *  spec, or null when the action changes nothing / cannot apply. */
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

/** The Apply button's label — exactly what will change, in plain words. */
export function describeCopilotAction(action: CopilotAction): string {
  switch (action.kind) {
    case 'set_stop_loss_pips': return `Set stop loss to ${action.pips} pips`;
    case 'set_take_profit_pips': return `Set take profit to ${action.pips} pips`;
    case 'set_stop_loss_atr': return `Size the stop at ${action.mult}× ATR`;
    case 'add_indicator': return `Add ${BLOCK_EDUCATION[action.indicator]?.plainName ?? action.indicator}`;
    case 'add_session_filter': return 'Add session filter (07:00–21:00 UTC, Mon–Fri)';
    case 'add_trend_filter': return 'Add a higher-timeframe trend filter';
    case 'set_breakeven': return `Move stop to breakeven after +${action.triggerPips} pips`;
    case 'set_max_trades_per_day': return `Cap at ${action.count} trades per day`;
    default: return 'Apply suggestion';
  }
}
