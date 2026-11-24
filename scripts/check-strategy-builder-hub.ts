/**
 * Strategy Builder Hub — verification.
 *
 * Run:  node --import tsx/esm scripts/check-strategy-builder-hub.ts
 *
 *   A. Education coverage: EVERY entry in the server INDICATOR_CATALOG
 *      carries complete education (all fields, ≥1 pair, valid category,
 *      ≥1 search term) — a future block without teaching fails here.
 *   B. Single source: the client BLOCK_EDUCATION mirror matches the
 *      server catalog field-for-field for every indicator, and carries
 *      the filter/risk blocks + education-only candle/pattern entries.
 *   C. Catalog consistency with PR #74: the ABBA extractor brief still
 *      names every catalog kind (education fields changed nothing).
 *   D. Strategy Health fixtures: deterministic findings for the known
 *      shapes — no stop, target closer than stop, over-filtered,
 *      entry/filter fighting, ORB without a session filter, the
 *      healthy default draft.
 *   E. Co-pilot: kill switch; action sanitizer drops anything outside
 *      the allowlist / ranges; applyCopilotAction (server AND client
 *      mirror, deep-compared on fixtures) yields Studio-valid specs;
 *      no-op actions degrade to advice-only; the copilot path contains
 *      no save / deploy / broker-dispatch calls (source pins); the
 *      client Apply path is click-gated and the panel asks ONLY on
 *      the Ask button (source pins).
 */
import { readFileSync } from 'node:fs';
import {
  INDICATOR_CATALOG, validateStrategySpec, type StrategySpec,
} from '../server/services/strategy-spec';
import {
  studioCopilotEnabled, sanitizeCopilotAction, sanitizeCopilotSuggestions,
  applyCopilotAction as applyServer, COPILOT_ACTION_KINDS, COPILOT_ACTIONS_BRIEF,
} from '../server/services/studio-copilot';
import { ABBA_STRATEGY_SPEC_FORMAT } from '../server/services/abba-strategy-create';
import { BLOCK_EDUCATION, CANDLE_EDUCATION, PATTERN_EDUCATION, LIBRARY_CATEGORIES } from '../client/src/lib/block-education';
import { analyzeStrategyHealth } from '../client/src/lib/strategy-health';
import { applyCopilotAction as applyClient } from '../client/src/lib/studio-copilot';
import { defaultBuilderSpec } from '../client/src/lib/strategy-spec';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.log(`FAIL  ${name}${extra ? ` — ${extra}` : ''}`); }
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const eq = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b);

// ── A. Education coverage on the server catalog ─────────────────────
{
  const cats = new Set(LIBRARY_CATEGORIES as string[]);
  check('A1 catalog non-empty', INDICATOR_CATALOG.length >= 20, `${INDICATOR_CATALOG.length}`);
  for (const c of INDICATOR_CATALOG) {
    const e = (c as any).education;
    check(`A2 ${c.kind} education complete`,
      !!e && typeof e.plainName === 'string' && e.plainName.length > 0
      && typeof e.whatItIs === 'string' && e.whatItIs.length >= 40
      && typeof e.whyItWorks === 'string' && e.whyItWorks.length >= 40
      && typeof e.whyItFails === 'string' && e.whyItFails.length >= 40
      && Array.isArray(e.pairsWith) && e.pairsWith.length >= 1
      && Array.isArray(e.searchTerms) && e.searchTerms.length >= 1
      && cats.has(e.category),
      e ? `category=${e.category}` : 'missing');
    check(`A3 ${c.kind} pairsWith names real blocks`,
      (e?.pairsWith ?? []).every((k: string) => INDICATOR_CATALOG.some((x) => x.kind === k) || k in BLOCK_EDUCATION));
  }
  const allEdu = JSON.stringify(INDICATOR_CATALOG.map((c) => (c as any).education));
  check('A4 no profit promises in education copy',
    !/guarantee|will profit|win rate of \d|%\s*win rate|make money/i.test(allEdu));
}

// ── B. Client mirror parity + extra blocks ──────────────────────────
{
  for (const c of INDICATOR_CATALOG) {
    const m = BLOCK_EDUCATION[c.kind];
    check(`B1 ${c.kind} client mirror matches server`,
      !!m && eq(m, (c as any).education),
      m ? 'field drift' : 'missing on client');
  }
  for (const k of ['SESSION_FILTER', 'TREND_FILTER', 'STOP_LOSS', 'TAKE_PROFIT', 'TRAILING_STOP', 'BREAKEVEN', 'MAX_TRADES_PER_DAY']) {
    const e = BLOCK_EDUCATION[k];
    check(`B2 ${k} block education present`, !!e && e.category === 'Filters & Risk' && e.whatItIs.length >= 40 && e.pairsWith.length >= 1);
  }
  check('B3 candles are education-only entries with diagrams',
    CANDLE_EDUCATION.length >= 4 && CANDLE_EDUCATION.every((c) => c.diagram && c.closestBuildable.length > 20 && c.education.category === 'Candlesticks'));
  check('B4 patterns are education-only entries with diagrams',
    PATTERN_EDUCATION.length >= 5 && PATTERN_EDUCATION.every((p) => p.diagram && p.closestBuildable.length > 20));
  check('B5 candle/pattern keys are NOT buildable blocks',
    [...CANDLE_EDUCATION, ...PATTERN_EDUCATION].every((x) => !(x.key in BLOCK_EDUCATION)));
}

// ── C. PR #74 catalog consistency ───────────────────────────────────
{
  const kinds = INDICATOR_CATALOG.map((c) => c.kind);
  check('C1 extractor brief still names every catalog kind',
    kinds.every((k) => ABBA_STRATEGY_SPEC_FORMAT.includes(k)),
    kinds.filter((k) => !ABBA_STRATEGY_SPEC_FORMAT.includes(k)).join(','));
}

// ── D. Health fixtures ──────────────────────────────────────────────
const baseSpec = (): StrategySpec => JSON.parse(JSON.stringify(defaultBuilderSpec('EURUSD', 'H1')));
const ids = (spec: StrategySpec) => analyzeStrategyHealth(spec).map((f) => f.id);
{
  const healthy = ids(baseSpec());
  check('D1 default draft: defined risk/reward strength', healthy.includes('defined-rr'), healthy.join(','));
  check('D2 default draft: no false alarms', !healthy.some((i) => i.startsWith('fight-') || i === 'no-stop' || i === 'self-fight-Long'), healthy.join(','));

  const noStop = baseSpec();
  noStop.risk = { lotSize: 0.1, stopLossPips: null, takeProfitPips: 60 };
  check('D3 no-stop draft flags the missing stop', ids(noStop).includes('no-stop'));

  const tight = baseSpec();
  tight.risk = { lotSize: 0.1, stopLossPips: 50, takeProfitPips: 20 };
  check('D4 target closer than stop flagged', ids(tight).includes('target-closer-than-stop'));

  const stuffed = baseSpec();
  stuffed.entryLong = { logic: 'AND', conditions: Array.from({ length: 6 }, (_, i) => ({
    indicatorId: 'price', field: 'price' as const, operator: 'above' as const,
    compare: { kind: 'value' as const, value: i },
  })) };
  check('D5 six-condition AND entry flagged as over-filtered', ids(stuffed).includes('over-filtered-Long'));

  const fighter = baseSpec();
  fighter.indicators = [{ id: 'ema', kind: 'EMA', period: 50 }];
  fighter.entryLong = { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'above', compare: { kind: 'indicator', indicatorId: 'ema', field: 'value' } }] };
  fighter.entryShort = { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'below', compare: { kind: 'indicator', indicatorId: 'ema', field: 'value' } }] };
  fighter.trendFilter = {
    timeframe: 'H4',
    longGroup: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'below', compare: { kind: 'indicator', indicatorId: 'ema', field: 'value' } }] },
    shortGroup: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'above', compare: { kind: 'indicator', indicatorId: 'ema', field: 'value' } }] },
  };
  const fightIds = ids(fighter);
  check('D6 entry/filter fight detected both sides', fightIds.includes('fight-long') && fightIds.includes('fight-short'), fightIds.join(','));

  const orb = baseSpec();
  orb.indicators = [{ id: 'orb', kind: 'ORB', sessionStartHourUtc: 14, sessionStartMinuteUtc: 30, rangeMinutes: 30 }];
  orb.entryLong = { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'orb', field: 'or_high' } }] };
  orb.entryShort = { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'orb', field: 'or_low' } }] };
  orb.sessionFilter = null;
  check('D7 ORB without session filter flagged', ids(orb).includes('session-sensitive-no-filter'));
  orb.sessionFilter = { startHourUtc: 14, endHourUtc: 21, daysUtc: [1, 2, 3, 4, 5] };
  const orbOk = ids(orb);
  check('D8 ORB with session filter reads as a strength', orbOk.includes('orb-session') && !orbOk.includes('session-sensitive-no-filter'));

  const unused = baseSpec();
  unused.indicators = [...unused.indicators, { id: 'adx1', kind: 'ADX', period: 14 }];
  check('D9 unused indicator noted', ids(unused).includes('unused-adx1'));
}

// ── E. Co-pilot ─────────────────────────────────────────────────────
{
  delete process.env.STUDIO_COPILOT;
  check('E1 copilot on by default', studioCopilotEnabled() === true);
  process.env.STUDIO_COPILOT = 'off';
  check('E2 STUDIO_COPILOT=off disables', studioCopilotEnabled() === false);
  delete process.env.STUDIO_COPILOT;

  check('E3 sanitizer drops unknown action kinds', sanitizeCopilotAction({ kind: 'deploy_live' }) === null
    && sanitizeCopilotAction({ kind: 'set_symbol', symbol: 'X' }) === null);
  check('E4 sanitizer drops out-of-range numbers', sanitizeCopilotAction({ kind: 'set_stop_loss_pips', pips: 99999 }) === null
    && sanitizeCopilotAction({ kind: 'set_stop_loss_atr', mult: 0 }) === null);
  check('E5 sanitizer drops unknown indicators', sanitizeCopilotAction({ kind: 'add_indicator', indicator: 'NEWS' }) === null);
  check('E6 sanitizer keeps a valid action', eq(sanitizeCopilotAction({ kind: 'set_stop_loss_pips', pips: 30 }), { kind: 'set_stop_loss_pips', pips: 30 }));
  check('E7 brief names every allowlisted action kind', COPILOT_ACTION_KINDS.every((k) => COPILOT_ACTIONS_BRIEF.includes(k)));

  const spec = baseSpec();
  const fixtures: any[] = [
    { kind: 'set_stop_loss_pips', pips: 45 },
    { kind: 'set_take_profit_pips', pips: 90 },
    { kind: 'set_stop_loss_atr', mult: 1.5 },
    { kind: 'add_indicator', indicator: 'ADX' },
    { kind: 'add_session_filter' },
    { kind: 'add_trend_filter' },
    { kind: 'set_breakeven', triggerPips: 25 },
    { kind: 'set_max_trades_per_day', count: 3 },
  ];
  for (const a of fixtures) {
    const s1 = applyServer(spec, a);
    const s2 = applyClient(spec, a);
    check(`E8 apply ${a.kind}: server/client parity + Studio-valid`,
      !!s1 && eq(s1, s2) && validateStrategySpec(s1!).ok === true,
      s1 ? (validateStrategySpec(s1!).ok ? '' : 'invalid result') : 'server returned null');
  }
  check('E9 no-op actions return null (add existing filter/indicator)',
    applyServer({ ...spec, sessionFilter: { startHourUtc: 7, endHourUtc: 21 } }, { kind: 'add_session_filter' }) === null
    && applyServer(spec, { kind: 'add_indicator', indicator: 'RSI' }) === null
    && applyServer(spec, { kind: 'set_stop_loss_pips', pips: spec.risk.stopLossPips! }) === null);

  const sugg = sanitizeCopilotSuggestions({
    suggestions: [
      { text: 'Tighten the stop.', action: { kind: 'set_stop_loss_pips', pips: 20 } },
      { text: 'Deploy it live now.', action: { kind: 'deploy_live' } },
      { text: 'Add a session filter.', action: { kind: 'add_session_filter' } },
      { text: '' },
      { text: 'Fifth is over the cap.', action: null },
      { text: 'Sixth is over the cap.', action: null },
    ],
  }, spec);
  check('E10 suggestions capped at 4, junk actions degraded to advice-only',
    sugg.length === 4 && sugg[0].action?.kind === 'set_stop_loss_pips'
    && sugg[1].action === undefined && sugg[2].action?.kind === 'add_session_filter',
    JSON.stringify(sugg.map((s) => s.action?.kind ?? null)));

  const svc = src('server/services/studio-copilot.ts');
  check('E11 copilot service has no save/deploy/dispatch calls',
    !/createWizardStrategy|spec-strategies|deployments|assertBrokerDispatchAllowed|placeOrder|executeTrade/.test(svc));
  const routes = src('server/routes.ts');
  const routeStart = routes.indexOf('app.post("/api/strategy-studio/copilot"');
  const routeBlock = routes.slice(routeStart, routes.indexOf('app.post("/api/strategy-wizard/generate-ea"', routeStart));
  check('E12 review route exists, auth + kill-switch + validator gated, budget-aware',
    routeStart > 0 && routeBlock.includes('isAuthenticated') && routeBlock.includes('studioCopilotEnabled()')
    && routeBlock.includes('validateStrategySpec') && routeBlock.includes('shouldDeferLowPriorityAi'));
  check('E13 review route writes nothing', !/createWizardStrategy|createDeployment|storage\.(create|update|delete)/.test(routeBlock));

  const panel = src('client/src/components/trading/abba-copilot-panel.tsx');
  check('E14 panel asks ONLY via the Ask button (no effect fires the review)',
    panel.includes("'/api/strategy-studio/copilot'") && !/useEffect\([\s\S]{0,200}apiRequest\('POST'/.test(panel));
  check('E15 Apply is a click handler running the vetted action',
    /onClick=\{\(\) => apply\(idx, s\.action!\)\}/.test(panel) && panel.includes('applyCopilotAction(spec, action)'));
  check('E16 panel never calls save/deploy endpoints',
    !/spec-strategies|strategy-wizard\/deployments|strategy-draft\/save/.test(panel));
  const studio = src('client/src/pages/strategy-studio.tsx');
  check('E17 Studio renders health + copilot beside the builder',
    studio.includes('StrategyHealthPanel') && studio.includes('AbbaCopilotPanel') && studio.includes('Strategy Builder Hub'));
  const builder = src('client/src/components/trading/strategy-builder.tsx');
  check('E18 builder picker is the library now', builder.includes('BlockLibrary') && builder.includes('BlockEduDetails'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
