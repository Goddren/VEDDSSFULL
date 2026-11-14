/**
 * ABBA strategy creation — build a Strategy Studio strategy by talking.
 *
 * The flow mirrors ABBA's other confirmed actions (Idea Lab, Week Setup):
 * the conversation produces a DRAFT, this module shapes + checks it, the
 * client shows a proposal card, and nothing is written until the trader
 * taps "Save strategy" on the card (POST /api/abba/strategy-draft/save).
 *
 * Everything here is pure and deterministic: shaping the AI-extracted JSON
 * into a spec-shaped object, running the STUDIO's own validator
 * (validateStrategySpec — the exact check the Studio save route runs),
 * working out which essentials are still missing, describing the spec in
 * plain words for the card, and stamping provenance. The actual save goes
 * through createWizardStrategy — the same service the Studio UI uses.
 */

import {
  validateStrategySpec, INDICATOR_CATALOG,
  type StrategySpec, type IndicatorConfig, type Condition, type ConditionGroup,
} from './strategy-spec';

/** Kill switch: ABBA_STRATEGY_CREATE=off disables the whole create flow
 *  (prompt section, extraction, save route) and nothing else. */
export function strategyCreateEnabled(): boolean {
  return process.env.ABBA_STRATEGY_CREATE !== 'off';
}

/** What the chat handlers hand the client when a strategy draft exists. */
export interface AbbaStrategyDraft {
  /** The shaped spec (best effort — present even when incomplete/invalid
   *  so the card can show what ABBA has so far). */
  spec: StrategySpec;
  /** Defaults ABBA chose that the trader never stated, in plain words.
   *  Always shown on the card — a default is never silent. */
  defaultsApplied: string[];
  /** Things the trader asked for that the Studio spec cannot express,
   *  with the closest supported alternative, in plain words. */
  unsupported: string[];
  /** Essentials still missing, in plain words. Non-empty ⇒ no save. */
  missing: string[];
  /** The Studio validator's verdict on the shaped spec. */
  validation: { ok: boolean; error: string | null; plain: string | null };
  /** Plain-words rendering of the spec for the proposal card. */
  summary: {
    name: string;
    market: string;
    entryLong: string[];
    entryShort: string[];
    exitLines: string[];
    risk: string[];
    filters: string[];
  };
}

const TIMEFRAMES = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'];

/** The compact spec-format brief the extractor model is given. Kept here
 *  (not in the chat file) so the check script can pin that every construct
 *  ABBA may use is one the Studio spec actually supports. */
export const ABBA_STRATEGY_SPEC_FORMAT = `Reply with JSON only:
{"spec":{"name":"short name","source":"builder","symbol":"EURUSD","timeframe":"H1",
"indicators":[{"id":"rsi","kind":"RSI","period":14}],
"entryLong":{"logic":"AND","conditions":[{"indicatorId":"rsi","field":"value","operator":"crosses_above","compare":{"kind":"value","value":30}}]},
"entryShort":{"logic":"AND","conditions":[]},
"exitLong":null,"exitShort":null,"trendFilter":null,"sessionFilter":null,
"risk":{"lotSize":0.01,"stopLossPips":30,"takeProfitPips":60}},
"defaultsAssumed":["plain-words list of anything YOU chose that the trader did not state"],
"unsupported":["plain-words list of anything the trader asked for that this format cannot do, with the closest supported alternative"]}
SPEC FORMAT — use ONLY these constructs:
- timeframe: one of M1 M5 M15 M30 H1 H4 D1.
- indicator kinds (id is any short unique name you choose): EMA(period), SMA(period), RSI(period), MACD(fastPeriod,slowPeriod,signalPeriod), STOCHASTIC(period,signalPeriod), BOLLINGER(period,stdDev), ATR(period), VWAP, ADX(period), CCI(period), WILLIAMS_R(period), ICHIMOKU(period=9,fastPeriod=26,slowPeriod=52), SUPERTREND(period,stdDev), DONCHIAN(period), VOLUME_PROFILE(lookbackBars,valueAreaPct; fields poc,vah,val), PIVOTS(fields pp,r1,r2,s1,s2), ORB(sessionStartHourUtc,sessionStartMinuteUtc,rangeMinutes; fields or_high,or_low), SWINGS(pivotLeft,pivotRight; fields swing_high,swing_low), FVG and ORDER_BLOCK(lookbackBars; fields bull_high,bull_low,bear_high,bear_low). Max 10 indicators.
- indicator fields: EMA/SMA/RSI/ATR/VWAP/ADX/CCI/WILLIAMS_R/SUPERTREND use "value" (ADX also plus,minus); MACD: value,signal,histogram; STOCHASTIC: k,d; BOLLINGER/DONCHIAN: upper,middle,lower; ICHIMOKU: tenkan,kijun,span_a,span_b.
- a condition: {"indicatorId":"<indicator id or the word price>","field":"value","operator":"...","compare":{"kind":"value","value":30} | {"kind":"indicator","indicatorId":"<id>","field":"value"} | {"kind":"price"}}. Operators: crosses_above, crosses_below, above, below, rising, falling, turns_up, turns_down (rising/falling/turns_* ignore compare). Optional per condition: sustainBars (hold N bars), minGapPips. Max 6 conditions per group; logic AND or OR.
- "price breaks above the opening-range high" = condition on indicatorId "price", field "price", operator crosses_above, compare {kind:"indicator", indicatorId:"<the ORB indicator id>", field:"or_high"}. ORB defaults: sessionStartHourUtc 14, sessionStartMinuteUtc 30, rangeMinutes 30 (the New York open) unless the trader said otherwise.
- exits: exitLong/exitShort are condition groups like the entries, or null (null = the stop/target closes the trade).
- trendFilter (optional): {"timeframe":"H4","longGroup":{...},"shortGroup":{...}} — its timeframe MUST be higher than the strategy timeframe; its conditions use the same indicator ids.
- sessionFilter (optional): {"startHourUtc":0-23,"endHourUtc":0-24,"daysUtc":[0-6]} — entries only inside that UTC window.
- risk: {"lotSize":0.01-50,"stopLossPips","takeProfitPips","stopLossAtrMult","takeProfitAtrMult" (ATR multiples need an ATR indicator in the list),"trailingStopPips","breakevenTriggerPips","breakevenOffsetPips","maxTradesPerDay"}. Every strategy needs at least a stop loss or a take profit.
RULES: use ONLY what the trader agreed. If they described one direction only and the rule has an obvious mirror (a cross up ↔ cross down), write the mirrored rule for the other side and list it in defaultsAssumed ("short side mirrors the long rule"). Never invent a stop, target, pair or timeframe the trader never mentioned — leave the field out and it will be asked for. NEVER promise or imply any performance.`;

const cleanStrings = (x: any, max: number, each = 200): string[] =>
  Array.isArray(x) ? x.map((s) => String(s ?? '').trim().slice(0, each)).filter(Boolean).slice(0, max) : [];

function groupConditions(g: any): Condition[] {
  return g && Array.isArray(g.conditions) ? g.conditions : [];
}

/** Translate the Studio validator's error into plain words for the card.
 *  One of ABBA's honesty rules: a draft that can't be saved says WHY in
 *  words a beginner understands, and what the closest fix is. */
export function explainValidationError(error: string): string {
  const e = String(error || '');
  if (/bad indicator kind/.test(e)) return 'One of the indicators isn\'t one the Studio supports. ABBA can rebuild the draft with a supported indicator instead.';
  if (/unknown (compare )?indicator/.test(e)) return 'A rule points at an indicator that isn\'t in the draft\'s list. ABBA needs to fix the draft before it can be saved.';
  if (/at least a stop loss or a take profit/.test(e)) return 'It still needs a stop loss or a take profit — tell ABBA how a trade should get out when it goes wrong.';
  if (/trendFilter timeframe must be HIGHER/.test(e)) return 'The trend filter has to sit on a higher timeframe than the strategy itself (e.g. an H4 filter on an H1 strategy).';
  if (/ATR-based stops need an ATR indicator/.test(e)) return 'The stop is sized off ATR, so the draft needs an ATR indicator added.';
  if (/bad timeframe/.test(e)) return 'The timeframe isn\'t one the Studio uses (M1, M5, M15, M30, H1, H4 or D1).';
  if (/bad symbol/.test(e)) return 'That market symbol doesn\'t look right — check the pair name (e.g. EURUSD, XAUUSD, BTCUSD).';
  if (/lotSize/.test(e)) return 'The lot size is outside the range the Studio allows (0.01 to 50).';
  if (/name is required/.test(e)) return 'The strategy needs a name before it can be saved.';
  if (/needs 1–6 conditions|needs 0–6 conditions/.test(e)) return 'Each entry side needs between 1 and 6 rules — this draft has too few or too many.';
  if (/bad field/.test(e)) return 'One rule reads a line the indicator doesn\'t have (e.g. asking RSI for an upper band). ABBA needs to fix the draft.';
  if (/bad operator/.test(e)) return 'One rule uses a comparison the Studio doesn\'t support. ABBA needs to fix the draft.';
  return `The Studio's checker says: ${e}`;
}

// ── Plain-words description of a spec (the proposal card's body) ──────

const FIELD_WORDS: Record<string, string> = {
  value: '', signal: ' signal line', histogram: ' histogram', upper: ' upper band', middle: ' middle line',
  lower: ' lower band', k: ' %K', d: ' %D', price: '', poc: ' POC', vah: ' value-area high', val: ' value-area low',
  tenkan: ' Tenkan', kijun: ' Kijun', span_a: ' cloud top (Span A)', span_b: ' cloud bottom (Span B)',
  plus: ' +DI', minus: ' −DI', swing_high: ' last swing high', swing_low: ' last swing low',
  or_high: ' opening-range high', or_low: ' opening-range low',
  bull_high: ' bullish zone top', bull_low: ' bullish zone bottom', bear_high: ' bearish zone top', bear_low: ' bearish zone bottom',
  pp: ' pivot point', r1: ' R1', r2: ' R2', s1: ' S1', s2: ' S2',
};
const OP_WORDS: Record<string, string> = {
  crosses_above: 'crosses above', crosses_below: 'crosses below', above: 'is above', below: 'is below',
  rising: 'is rising', falling: 'is falling', turns_up: 'turns up', turns_down: 'turns down',
};

function indicatorLabel(ind: IndicatorConfig): string {
  const base = (INDICATOR_CATALOG.find((c) => c.kind === ind.kind)?.label || ind.kind).replace(/\s*\(.*\)\s*$/, '');
  const params: string[] = [];
  if (ind.kind === 'MACD') params.push(`${ind.fastPeriod ?? 12}, ${ind.slowPeriod ?? 26}, ${ind.signalPeriod ?? 9}`);
  else if (ind.kind === 'ICHIMOKU') params.push(`${ind.period ?? 9}, ${ind.fastPeriod ?? 26}, ${ind.slowPeriod ?? 52}`);
  else if (ind.kind === 'BOLLINGER' || ind.kind === 'SUPERTREND') params.push(`${ind.period ?? (ind.kind === 'BOLLINGER' ? 20 : 10)}, ${ind.stdDev ?? (ind.kind === 'BOLLINGER' ? 2 : 3)}`);
  else if (ind.kind === 'STOCHASTIC') params.push(`${ind.period ?? 14}, ${ind.signalPeriod ?? 3}`);
  else if (ind.kind === 'VOLUME_PROFILE' || ind.kind === 'FVG' || ind.kind === 'ORDER_BLOCK') params.push(`${ind.lookbackBars ?? 100} bars`);
  else if (ind.kind === 'ORB') params.push(`${ind.rangeMinutes ?? 30} min from ${String(ind.sessionStartHourUtc ?? 14).padStart(2, '0')}:${String(ind.sessionStartMinuteUtc ?? 30).padStart(2, '0')} UTC`);
  else if (ind.kind === 'SWINGS') params.push(`${ind.pivotLeft ?? 3}/${ind.pivotRight ?? 3} pivots`);
  else if (ind.period != null) params.push(String(ind.period));
  return params.length ? `${base} (${params.join(', ')})` : base;
}

function seriesWords(spec: StrategySpec, indicatorId: string, field: string): string {
  if (indicatorId === 'price') return 'Price';
  const ind = (spec.indicators || []).find((i) => i.id === indicatorId);
  if (!ind) return indicatorId;
  return `${indicatorLabel(ind)}${FIELD_WORDS[field] ?? ''}`;
}

export function describeCondition(spec: StrategySpec, c: Condition): string {
  const left = seriesWords(spec, c.indicatorId, c.field);
  const op = OP_WORDS[c.operator] || c.operator;
  let out = `${left} ${op}`;
  if (!['rising', 'falling', 'turns_up', 'turns_down'].includes(c.operator)) {
    const cmp: any = c.compare || {};
    if (cmp.kind === 'value') out += ` ${cmp.value}`;
    else if (cmp.kind === 'indicator') out += ` ${seriesWords(spec, cmp.indicatorId, cmp.field)}`;
    else if (cmp.kind === 'price') out += ' price';
  }
  if (c.sustainBars && c.sustainBars > 1) out += `, held for ${c.sustainBars} bars`;
  if (c.minGapPips) out += `, by at least ${c.minGapPips} pips`;
  return out;
}

function groupLines(spec: StrategySpec, g: ConditionGroup | null | undefined): string[] {
  if (!g || !Array.isArray(g.conditions) || !g.conditions.length) return [];
  const joiner = g.logic === 'OR' ? ' — or — ' : ' — and — ';
  return [g.conditions.map((c) => describeCondition(spec, c)).join(joiner)];
}

export function describeStrategySpec(spec: StrategySpec): AbbaStrategyDraft['summary'] {
  const risk: string[] = [];
  const r = spec.risk || ({} as StrategySpec['risk']);
  if (r.lotSize != null) risk.push(`Trades ${r.lotSize} lots a position`);
  if (r.stopLossPips != null) risk.push(`Stop loss: ${r.stopLossPips} pips`);
  if (r.stopLossAtrMult != null) risk.push(`Stop loss: ${r.stopLossAtrMult}× ATR`);
  if (r.takeProfitPips != null) risk.push(`Take profit: ${r.takeProfitPips} pips`);
  if (r.takeProfitAtrMult != null) risk.push(`Take profit: ${r.takeProfitAtrMult}× ATR`);
  if (r.trailingStopPips != null) risk.push(`Trailing stop: ${r.trailingStopPips} pips`);
  if (r.breakevenTriggerPips != null) risk.push(`Stop moves to breakeven after +${r.breakevenTriggerPips} pips${r.breakevenOffsetPips ? ` (locks ${r.breakevenOffsetPips})` : ''}`);
  if (r.maxTradesPerDay != null) risk.push(`Max ${r.maxTradesPerDay} trades a day`);

  const exitLines = [
    ...groupLines(spec, spec.exitLong).map((l) => `Longs exit early when: ${l}`),
    ...groupLines(spec, spec.exitShort).map((l) => `Shorts exit early when: ${l}`),
  ];
  if (!exitLines.length && (r.stopLossPips != null || r.takeProfitPips != null || r.stopLossAtrMult != null || r.takeProfitAtrMult != null)) {
    exitLines.push('No early-exit rule — the stop loss / take profit closes each trade');
  }

  const filters: string[] = [];
  if (spec.trendFilter) filters.push(`Trend filter on ${spec.trendFilter.timeframe}: entries only fire when the higher-timeframe rules agree`);
  if (spec.sessionFilter) {
    const sf = spec.sessionFilter;
    filters.push(`Only trades ${String(sf.startHourUtc).padStart(2, '0')}:00–${String(sf.endHourUtc).padStart(2, '0')}:00 UTC${sf.daysUtc?.length ? ` on set weekdays` : ''}`);
  }
  return {
    name: spec.name,
    market: `${String(spec.symbol || '').toUpperCase()} · ${spec.timeframe}`,
    entryLong: groupLines(spec, spec.entryLong),
    entryShort: groupLines(spec, spec.entryShort),
    exitLines, risk, filters,
  };
}

// ── Shaping: loose AI-extracted JSON → draft the card can stand behind ──

/**
 * Normalize the extractor's output into an AbbaStrategyDraft. NEVER
 * invents an essential: a missing pair, timeframe, entry rule or
 * stop/target lands in `missing` (plain words) instead of being silently
 * filled. The small defaults that ARE applied (name, lot size) are
 * recorded in defaultsApplied so the card can flag them.
 */
export function shapeAbbaStrategyDraft(raw: any): AbbaStrategyDraft | null {
  if (!raw || typeof raw !== 'object') return null;
  const rawSpec: any = (raw.spec && typeof raw.spec === 'object') ? raw.spec : raw;
  if (!rawSpec || typeof rawSpec !== 'object') return null;

  const defaultsApplied: string[] = cleanStrings(raw.defaultsAssumed ?? raw.defaultsApplied, 8);
  const unsupported: string[] = cleanStrings(raw.unsupported, 6);

  const spec: any = { ...rawSpec };
  // ABBA drafts are condition-builder specs. An engine strategy runs on
  // the FX engine's AI and has no fixed rules to backtest, shadow-test or
  // save honestly through this flow — say so and build the mechanical
  // version instead (the extractor is briefed the same way).
  if (spec.source === 'engine') {
    unsupported.push('Engine strategies run on the FX engine\'s AI analysis, not fixed rules — this draft is the closest mechanical version, built with Studio rules.');
    spec.source = 'builder';
    delete spec.engineStrategyKey;
  } else if (spec.source !== 'builder' && spec.source !== 'template') {
    spec.source = 'builder';
  }
  if (typeof spec.symbol === 'string') spec.symbol = spec.symbol.trim().toUpperCase().replace(/\s+/g, '');
  if (typeof spec.timeframe === 'string') spec.timeframe = spec.timeframe.trim().toUpperCase();

  // Indicator ids: every indicator needs a unique string id for the
  // conditions to reference. Assigning a MISSING id is bookkeeping, not
  // a trading decision, so it isn't flagged as a default.
  if (!Array.isArray(spec.indicators)) spec.indicators = [];
  if (Array.isArray(spec.indicators)) {
    const used = new Set<string>();
    spec.indicators = spec.indicators.map((ind: any, i: number) => {
      const out = { ...(ind || {}) };
      let id = typeof out.id === 'string' && out.id.trim() ? out.id.trim() : `${String(out.kind || 'ind').toLowerCase()}_${i + 1}`;
      while (used.has(id)) id = `${id}_x`;
      used.add(id);
      out.id = id;
      return out;
    });
  }

  // Name: a label, not a trading decision — derive one and SAY so.
  if (typeof spec.name !== 'string' || !spec.name.trim()) {
    const derived = `${spec.symbol || 'New'} ${TIMEFRAMES.includes(spec.timeframe) ? spec.timeframe : ''} strategy`.trim();
    spec.name = derived.slice(0, 80);
    defaultsApplied.push(`ABBA named it "${spec.name}" — rename it any time in the Studio.`);
  }
  // Lot size: default to the smallest size and SAY so. Never default a
  // stop, target, pair or timeframe — those are the trader's decisions.
  if (!spec.risk || typeof spec.risk !== 'object') spec.risk = {};
  if (typeof spec.risk.lotSize !== 'number' || !Number.isFinite(spec.risk.lotSize)) {
    spec.risk = { ...spec.risk, lotSize: 0.01 };
    defaultsApplied.push('Lot size set to 0.01 (the smallest) — you didn\'t name a size.');
  }

  // Essentials, in plain words. Missing ⇒ the card asks, nothing saves.
  const missing: string[] = [];
  if (typeof spec.symbol !== 'string' || spec.symbol.length < 3) missing.push('which market it trades (e.g. EURUSD, XAUUSD, BTCUSD)');
  if (!TIMEFRAMES.includes(spec.timeframe)) missing.push('the timeframe (M15, H1, H4…)');
  const longN = groupConditions(spec.entryLong).length;
  const shortN = groupConditions(spec.entryShort).length;
  if (longN === 0 && shortN === 0) missing.push('the entry rule — what has to happen for it to buy or sell');
  else if (longN === 0 || shortN === 0) missing.push(`the ${longN === 0 ? 'long (buy)' : 'short (sell)'} entry rule — the Studio runs both sides, or tell ABBA to mirror the other side`);
  const r = spec.risk;
  if (r.stopLossPips == null && r.stopLossAtrMult == null && r.takeProfitPips == null && r.takeProfitAtrMult == null) {
    missing.push('a stop loss or take profit — how a trade gets out when it goes wrong');
  }

  // The Studio's own validator is the only judge.
  const v = validateStrategySpec(spec);
  const validation = v.ok
    ? { ok: true, error: null as string | null, plain: null as string | null }
    : { ok: false, error: v.error, plain: explainValidationError(v.error) };
  const finalSpec = (v.ok ? v.spec : spec) as StrategySpec;

  return {
    spec: finalSpec,
    defaultsApplied, unsupported, missing, validation,
    summary: describeStrategySpec(finalSpec),
  };
}

/** Provenance stamp, applied server-side at save time only (the client
 *  cannot stamp its own drafts). Follows the spec.marketplace pattern:
 *  metadata that rides inside the spec JSON and never affects trading. */
export function stampAbbaProvenance(spec: StrategySpec): StrategySpec {
  return { ...spec, createdVia: 'abba' };
}
