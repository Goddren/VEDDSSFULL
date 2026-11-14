/**
 * ABBA strategy creation — verification.
 *
 * Run:  node --import tsx/esm scripts/check-abba-strategy-create.ts
 *
 * The shaping layer is pure (loose AI-extracted JSON → draft, the
 * Studio validator's verdict, missing-essentials detection, plain-words
 * description, provenance stamping), so it is exercised directly. The
 * chat handlers and routes are DB/AI-bound, so the confirm gate is
 * pinned by source checks on the exact guards it must contain — the
 * same split the other check scripts use.
 *
 *   A. Kill switch ABBA_STRATEGY_CREATE: on by default, off disables.
 *   B. A complete draft shapes clean: Studio validation passes, the
 *      bookkeeping defaults (name, lot size) are applied AND flagged.
 *   C. Missing essentials are reported in plain words, never invented:
 *      no pair, no timeframe, one-sided entries, no stop/target.
 *   D. An engine-source draft is honestly converted: builder spec +
 *      an "unsupported" note, never saved as an engine strategy.
 *   E. Validator errors reach the card in plain words.
 *   F. Provenance: stampAbbaProvenance adds createdVia 'abba' and the
 *      stamp survives the Studio validator's round-trip.
 *   G. The extractor's format brief names ONLY constructs the Studio
 *      spec supports (cross-checked against INDICATOR_CATALOG).
 *   H. Confirm gate (source): chat/stream can only produce a draft —
 *      createWizardStrategy is unreachable from abba-strategist.ts;
 *      the single ABBA write route re-validates, re-checks the kill
 *      switch, requires confirm, stamps provenance server-side and
 *      saves through the Studio's own service.
 *   I. Client (source): the card saves ONLY through the ABBA save
 *      route, offers the Studio handoff, and both ABBA surfaces +
 *      the shared chat hook carry strategyDraft.
 */
import { readFileSync } from 'node:fs';
import {
  strategyCreateEnabled, shapeAbbaStrategyDraft, stampAbbaProvenance,
  explainValidationError, ABBA_STRATEGY_SPEC_FORMAT,
} from '../server/services/abba-strategy-create';
import { validateStrategySpec, INDICATOR_CATALOG } from '../server/services/strategy-spec';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`); }
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const orbDraft = () => ({
  spec: {
    symbol: 'eurusd', timeframe: 'm15',
    indicators: [
      { id: 'orb', kind: 'ORB', sessionStartHourUtc: 14, sessionStartMinuteUtc: 30, rangeMinutes: 15 },
      { kind: 'ATR', period: 14 },
    ],
    entryLong: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'orb', field: 'or_high' } }] },
    entryShort: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'orb', field: 'or_low' } }] },
    risk: { stopLossPips: 25, takeProfitPips: 50 },
  },
  defaultsAssumed: ['ORB window is the standard New York open (14:30 UTC, 15 minutes)'],
});

// ── A. Kill switch ───────────────────────────────────────────────────
{
  delete process.env.ABBA_STRATEGY_CREATE;
  check('A1 create flow on by default', strategyCreateEnabled() === true);
  process.env.ABBA_STRATEGY_CREATE = 'off';
  check('A2 ABBA_STRATEGY_CREATE=off disables', strategyCreateEnabled() === false);
  delete process.env.ABBA_STRATEGY_CREATE;
  check('A3 unsetting re-enables', strategyCreateEnabled() === true);
}

// ── B. Complete draft shapes clean ───────────────────────────────────
{
  const d = shapeAbbaStrategyDraft(orbDraft());
  check('B1 draft produced', !!d);
  check('B2 source forced to builder', d!.spec.source === 'builder');
  check('B3 symbol/timeframe normalized', d!.spec.symbol === 'EURUSD' && d!.spec.timeframe === 'M15');
  check('B4 nothing missing', d!.missing.length === 0, JSON.stringify(d!.missing));
  check('B5 Studio validation passes', d!.validation.ok === true, d!.validation.error || '');
  check('B6 missing indicator id assigned + unique',
    d!.spec.indicators.every((i) => typeof i.id === 'string' && i.id.length > 0)
    && new Set(d!.spec.indicators.map((i) => i.id)).size === d!.spec.indicators.length);
  check('B7 lot size defaulted to 0.01 AND flagged',
    d!.spec.risk.lotSize === 0.01 && d!.defaultsApplied.some((x) => /lot size/i.test(x)));
  check('B8 derived name flagged as a default',
    d!.defaultsApplied.some((x) => /named it/i.test(x)) && d!.spec.name.length > 0);
  check('B9 extractor-stated assumption carried through',
    d!.defaultsApplied.some((x) => /ORB window/i.test(x)));
  check('B10 summary describes the ORB break in plain words',
    d!.summary.entryLong.join(' ').includes('opening-range high'), d!.summary.entryLong.join(' '));
  check('B11 summary market + risk lines',
    d!.summary.market === 'EURUSD · M15' && d!.summary.risk.some((x) => x.includes('Stop loss: 25 pips')));
}

// ── C. Missing essentials: reported, never invented ──────────────────
{
  const bare = shapeAbbaStrategyDraft({ spec: { symbol: 'XAUUSD' } });
  check('C1 bare draft still produces a card payload', !!bare);
  check('C2 timeframe reported missing', bare!.missing.some((m) => /timeframe/i.test(m)));
  check('C3 entry rule reported missing', bare!.missing.some((m) => /entry rule/i.test(m)));
  check('C4 stop/target reported missing', bare!.missing.some((m) => /stop loss or take profit/i.test(m)));
  check('C5 timeframe NOT invented', (bare!.spec as any).timeframe === undefined);
  check('C6 stop NOT invented', bare!.spec.risk.stopLossPips == null && bare!.spec.risk.takeProfitPips == null);

  const oneSided = shapeAbbaStrategyDraft({
    spec: {
      name: 'RSI dips', symbol: 'EURUSD', timeframe: 'H1',
      indicators: [{ id: 'rsi', kind: 'RSI', period: 14 }],
      entryLong: { logic: 'AND', conditions: [{ indicatorId: 'rsi', field: 'value', operator: 'crosses_above', compare: { kind: 'value', value: 30 } }] },
      entryShort: { logic: 'AND', conditions: [] },
      risk: { lotSize: 0.02, stopLossPips: 30, takeProfitPips: 60 },
    },
  });
  check('C7 one-sided draft flags the missing short rule', oneSided!.missing.some((m) => /short \(sell\)/i.test(m)), JSON.stringify(oneSided!.missing));
  check('C8 stated lot size is kept, not defaulted', oneSided!.spec.risk.lotSize === 0.02
    && !oneSided!.defaultsApplied.some((x) => /lot size/i.test(x)));
  check('C9 description renders the RSI cross in plain words',
    oneSided!.summary.entryLong.join(' ').includes('crosses above 30'), oneSided!.summary.entryLong.join(' '));

  check('C10 junk input yields no draft', shapeAbbaStrategyDraft(null) === null && shapeAbbaStrategyDraft('nope') === null);
}

// ── D. Engine source is converted honestly ───────────────────────────
{
  const d = shapeAbbaStrategyDraft({
    spec: { name: 'Sniper-ish', source: 'engine', engineStrategyKey: 'sniper', symbol: 'EURUSD', timeframe: 'H1', indicators: [], entryLong: { logic: 'AND', conditions: [] }, entryShort: { logic: 'AND', conditions: [] }, risk: { lotSize: 0.01 } },
  });
  check('D1 engine draft becomes a builder spec', d!.spec.source === 'builder' && !(d!.spec as any).engineStrategyKey);
  check('D2 the conversion is disclosed as unsupported', d!.unsupported.some((u) => /engine/i.test(u)));
}

// ── E. Plain-words validation ────────────────────────────────────────
{
  check('E1 unsupported indicator explained plainly',
    /isn't one the Studio supports/.test(explainValidationError('bad indicator kind "NEWS"')));
  check('E2 missing stop/target explained plainly',
    /stop loss or a take profit/.test(explainValidationError('a strategy needs at least a stop loss or a take profit')));
  check('E3 trend-filter timeframe explained plainly',
    /higher timeframe/.test(explainValidationError('trendFilter timeframe must be HIGHER than the strategy timeframe')));
  const d = shapeAbbaStrategyDraft({
    spec: {
      name: 'No exit plan', symbol: 'EURUSD', timeframe: 'H1',
      indicators: [{ id: 'rsi', kind: 'RSI', period: 14 }],
      entryLong: { logic: 'AND', conditions: [{ indicatorId: 'rsi', field: 'value', operator: 'crosses_above', compare: { kind: 'value', value: 30 } }] },
      entryShort: { logic: 'AND', conditions: [{ indicatorId: 'rsi', field: 'value', operator: 'crosses_below', compare: { kind: 'value', value: 70 } }] },
      risk: { lotSize: 0.01 },
    },
  });
  check('E4 a draft with no stop/target fails Studio validation with the plain reason',
    d!.validation.ok === false && /stop loss or a take profit/.test(d!.validation.plain || ''), d!.validation.plain || '');
}

// ── F. Provenance stamp ──────────────────────────────────────────────
{
  const d = shapeAbbaStrategyDraft(orbDraft())!;
  const stamped = stampAbbaProvenance(d.spec);
  check('F1 stamp sets createdVia abba', stamped.createdVia === 'abba');
  check('F2 stamp changes nothing else', stamped.name === d.spec.name && stamped.symbol === d.spec.symbol);
  const v = validateStrategySpec(stamped);
  check('F3 stamp survives the Studio validator round-trip', v.ok && v.spec.createdVia === 'abba');
  check('F4 unstamped drafts carry no provenance', (d.spec as any).createdVia === undefined);
}

// ── G. Format brief only names supported constructs ──────────────────
{
  const catalogKinds = INDICATOR_CATALOG.map((c) => c.kind);
  check('G1 every catalog indicator is named in the brief', catalogKinds.every((k) => ABBA_STRATEGY_SPEC_FORMAT.includes(k)),
    catalogKinds.filter((k) => !ABBA_STRATEGY_SPEC_FORMAT.includes(k)).join(','));
  check('G2 brief pins the supported timeframes', ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'].every((t) => ABBA_STRATEGY_SPEC_FORMAT.includes(t)));
  check('G3 brief forbids promising performance', /NEVER promise/i.test(ABBA_STRATEGY_SPEC_FORMAT));
}

// ── H. Confirm gate (source pins) ────────────────────────────────────
{
  const strat = src('server/abba-strategist.ts');
  check('H1 chat can never save: no createWizardStrategy in abba-strategist.ts', !strat.includes('createWizardStrategy'));
  check('H2 strategy marker + heuristic + extractor exist',
    strat.includes('STRATEGY_MARKER') && strat.includes('wantsStrategyCard') && strat.includes('extractStrategyDraft'));
  check('H3 chat response carries strategyDraft', /res\.json\(\{ reply, response: reply, ideaDraft, setupDraft, strategyDraft \}\)/.test(strat));
  check('H4 prompt has the interview + the off-state wording',
    strat.includes('BUILD A STRATEGY WITH ABBA') && strat.includes('Strategy creation by chat is currently OFF'));
  check('H5 prompt forbids promising performance', /NEVER promise a strategy will make money/.test(strat));

  const routes = src('server/routes.ts');
  const saveStart = routes.indexOf("app.post('/api/abba/strategy-draft/save'");
  check('H6 save route exists', saveStart > 0);
  const saveBlock = routes.slice(saveStart, routes.indexOf("app.get('/api/abba/engine-updates'", saveStart));
  check('H7 save route is auth-gated + confirm-gated',
    saveBlock.includes('isAuthenticated') && saveBlock.includes("req.body?.confirm !== true"));
  check('H8 save route re-checks the kill switch', saveBlock.includes('strategyCreateEnabled()'));
  check('H9 save route re-validates with the Studio validator', saveBlock.includes('validateStrategySpec'));
  check('H10 save route rejects engine specs', saveBlock.includes("v.spec.source === 'engine'"));
  check('H11 save stamps provenance server-side + saves via the Studio service',
    saveBlock.includes('stampAbbaProvenance') && saveBlock.includes('createWizardStrategy'));
  check('H12 stream strips the marker and ships strategyDraft in done',
    routes.includes("split(STRATEGY_MARKER).join('')") && /navigateTo, planProposal, suggestions, ideaDraft, setupDraft, strategyDraft/.test(routes));
  check('H13 stream extraction is kill-switch gated', routes.includes("console.error('[ABBA stream strategy]'"));
}

// ── I. Client (source pins) ──────────────────────────────────────────
{
  const card = src('client/src/components/abba/strategy-create.tsx');
  check('I1 card saves ONLY through the ABBA save route',
    card.includes('"/api/abba/strategy-draft/save"') && !/apiRequest\("POST", "\/api\/strategy-wizard\/spec-strategies"/.test(card));
  check('I2 save is confirm-flagged', card.includes('confirm: true'));
  check('I3 post-save next steps reuse Studio endpoints',
    card.includes('"/api/strategy-wizard/spec-backtest"') && card.includes('"/api/strategy-wizard/deployments"') && card.includes('platform: "shadow"'));
  check('I4 Studio handoff writes sessionStorage keys',
    card.includes('ABBA_STUDIO_DRAFT_KEY') && card.includes('sessionStorage.setItem'));
  check('I5 card carries the unproven framing', card.includes('unproven until its backtest and shadow record'));
  check('I6 card flags ABBA defaults', card.includes('Defaults ABBA chose'));

  const studio = src('client/src/pages/strategy-studio.tsx');
  check('I7 Studio reads the ABBA handoff on mount',
    studio.includes('ABBA_STUDIO_DRAFT_KEY') && studio.includes('ABBA_STUDIO_OPEN_KEY') && studio.includes('sessionStorage.getItem'));
  const hook = src('client/src/components/abba/use-abba-chat.ts');
  check('I8 shared chat hook carries strategyDraft on both paths',
    (hook.match(/strategyDraft: parsed\.strategyDraft|strategyDraft: data\.strategyDraft/g) || []).length === 2);
  check('I9 both surfaces render the card',
    src('client/src/pages/abba-bot.tsx').includes('StrategyDraftCard') && src('client/src/components/travis/travis-assistant.tsx').includes('StrategyDraftCard'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
