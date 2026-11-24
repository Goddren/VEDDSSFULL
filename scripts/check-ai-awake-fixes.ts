/**
 * AI awake fixes (PR #111) — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-ai-awake-fixes.ts
 *
 * Diagnosis being fixed (proven Nov 24 by a signed-in read + code trace):
 * the MT5 chart-data route ran ZERO AI checks from 2026-10-16 because its
 * credit saver + the PR #108 watch-plan hook keyed the whole AI layer off
 * the Render env flag CHART_DATA_AUTOTRADE_ENABLED (a flag created for
 * TradeLocker fan-out execution, never set in production); and the live
 * engine's AI analysis (runAILiveAnalysis) sat in the budget reserve's
 * GENERAL lane, fenced off once the day's spend crossed cap − reserve.
 *
 * What is pinned:
 *   A. Decision function (pure) — chartDataAiEnabled composes
 *      env OR settings, the CHART_DATA_AI_SETTINGS_KEY=off kill switch
 *      restores env-only keying and never overrides the env flags, and
 *      an off/unreadable user setting fails safe to saver-on.
 *   B. Fix 1 — live-trading-engine: runAILiveAnalysis buys through
 *      { critical: true, engine: true, engineLane: 'protected' };
 *      exactly one protected claim in the file; the file's other engine
 *      call site (autoGenerateBrainSignals) is unchanged and general;
 *      no other call site in the file changed classification.
 *   C. Fix 2 wiring (routes.ts) — _chartAiEnabled is computed from the
 *      route-head eaIsEnabled read via the availability module, with an
 *      env-only fallback if the module can't load; the saver gates on
 *      !_chartAiEnabled (the old env-negation condition is gone); the
 *      watch-plan hook gates on _chartAiEnabled (the old env
 *      disjunction is gone), so the hook is reachable with the env off
 *      and the user's EA on.
 *   D. Untouched surfaces — the TradeLocker fan-out condition and its
 *      skip message are byte-identical; the pair-block and same-candle
 *      savers keep their reason strings; the saver reason still carries
 *      'ai_skipped_autotrade_off'; the market-closed skip and the
 *      credits-out pause are unchanged; the kill-switch env name lives
 *      only in the availability module and routes.ts.
 */
import { readFileSync } from 'node:fs';

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passes++; else failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const avail = await import('../server/services/chart-data-ai-availability');
const routes = src('../server/routes.ts');
const lte = src('../server/services/live-trading-engine.ts');
const availSrc = src('../server/services/chart-data-ai-availability.ts');

// ── A. Decision function ──────────────────────────────────────────────────
{
  const f = avail.chartDataAiEnabled;
  check('A1 env on → enabled (EA off, kill switch on)',
    f({ envEnabled: true, settingsKeyOff: true, eaEnabled: false }) === true);
  check('A2 env on → enabled (EA on)',
    f({ envEnabled: true, settingsKeyOff: false, eaEnabled: true }) === true);
  check('A3 env off + EA on → enabled (the production case this PR fixes)',
    f({ envEnabled: false, settingsKeyOff: false, eaEnabled: true }) === true);
  check('A4 env off + EA off → disabled (saver holds, as designed)',
    f({ envEnabled: false, settingsKeyOff: false, eaEnabled: false }) === false);
  check('A5 kill switch restores env-only: env off + EA on → disabled',
    f({ envEnabled: false, settingsKeyOff: true, eaEnabled: true }) === false);
  check('A6 kill switch never overrides env: env on + EA off → enabled',
    f({ envEnabled: true, settingsKeyOff: true, eaEnabled: false }) === true);
  check('A7 unreadable setting (undefined) fails safe to disabled',
    f({ envEnabled: false, settingsKeyOff: false, eaEnabled: undefined as any }) === false);

  delete process.env.CHART_DATA_AI_SETTINGS_KEY;
  check('A8 kill-switch env unset → settings keying live', avail.chartDataAiSettingsKeyOff() === false);
  process.env.CHART_DATA_AI_SETTINGS_KEY = 'off';
  check('A9 kill-switch env =off → reported off', avail.chartDataAiSettingsKeyOff() === true);
  process.env.CHART_DATA_AI_SETTINGS_KEY = 'on';
  check('A10 any other kill-switch value → settings keying live', avail.chartDataAiSettingsKeyOff() === false);
  delete process.env.CHART_DATA_AI_SETTINGS_KEY;
}

// ── B. Fix 1: runAILiveAnalysis → protected lane ─────────────────────────
{
  check('B1 runAILiveAnalysis call site carries the protected lane',
    lte.includes("getUniversalAIClientForUser(userId, { critical: true, engine: true, engineLane: 'protected' })"));
  check('B2 exactly one protected claim in live-trading-engine',
    count(lte, "engineLane: 'protected'") === 1 && count(lte, "'protected'") === 1);
  check('B3 the other call site (autoGenerateBrainSignals) is unchanged and general',
    lte.includes('getUniversalAIClientForUser(userId, { engine: true })') &&
    count(lte, 'getUniversalAIClientForUser(') === 2);
  check('B4 no budget-reserve env logic leaked into live-trading-engine',
    !lte.includes('AI_BUDGET_RESERVE'));
}

// ── C. Fix 2 wiring in routes.ts ──────────────────────────────────────────
{
  check('C1 availability is computed from the route-head eaIsEnabled read',
    routes.includes('eaEnabled: eaIsEnabled,') &&
    routes.includes("await import('./services/chart-data-ai-availability')") &&
    routes.includes('settingsKeyOff: _avail.chartDataAiSettingsKeyOff(),'));
  check('C2 env-only fallback stands if the module cannot load',
    routes.includes('let _chartAiEnabled = _envChartAi;') &&
    routes.includes('module unavailable → env-only keying (pre-PR behavior)'));
  check('C3 saver gates on !_chartAiEnabled; the env-negation condition is gone',
    routes.includes('if (!_chartAiEnabled) {') &&
    !routes.includes("process.env.CHART_DATA_AUTOTRADE_ENABLED !== 'true'"));
  check('C4 watch-plan hook gates on _chartAiEnabled; the env disjunction is gone',
    routes.includes('if (!_fxMarketClosed && !_aiCreditsOut && !_saverReason && _chartAiEnabled) {') &&
    !routes.includes("(process.env.CHART_DATA_AUTOTRADE_ENABLED === 'true' || process.env.CHART_DATA_AI_WHEN_OFF === 'true')"));
  check('C5 _chartAiEnabled is computed before both consumers (saver, then hook)',
    routes.indexOf('let _chartAiEnabled = _envChartAi;') > -1 &&
    routes.indexOf('let _chartAiEnabled = _envChartAi;') < routes.indexOf('if (!_chartAiEnabled) {') &&
    routes.indexOf('if (!_chartAiEnabled) {') < routes.indexOf('if (!_fxMarketClosed && !_aiCreditsOut && !_saverReason && _chartAiEnabled) {'));
  check('C6 the EA kill switch read at the route head is unchanged',
    routes.includes('const eaIsEnabled = (global as any).mt5EaEnabled[token.userId] !== false; // default: enabled'));
}

// ── D. Untouched surfaces ─────────────────────────────────────────────────
{
  check('D1 TradeLocker fan-out condition is byte-identical (env still gates execution)',
    count(routes, "const _chartAutoOn = process.env.CHART_DATA_AUTOTRADE_ENABLED === 'true';") === 1 &&
    routes.includes("_markTlSkip('fan-out', 'CHART-DATA AUTOTRADE OFF (set CHART_DATA_AUTOTRADE_ENABLED=true to re-enable)')"));
  check('D2 saver reason strings are stable',
    routes.includes("'ai_skipped_autotrade_off (chart-data autotrade is off, so no AI call)'") &&
    routes.includes('`ai_skipped_blocked_pair (${_pf.reason})`') &&
    routes.includes("'ai_skipped_same_candle (already checked this candle)'"));
  check('D3 market-closed skip and credits-out pause are unchanged',
    routes.includes("if (_fxMarketClosed) _cdiag.stage = 'market_closed';") &&
    routes.includes('m.fxShouldPauseForCredits()') &&
    routes.includes('const _skipAi = _fxMarketClosed || _aiCreditsOut || !!_saverReason || _watchPlanSkip;'));
  check('D4 kill-switch env name lives only in the availability module + routes comment',
    availSrc.includes('CHART_DATA_AI_SETTINGS_KEY') &&
    !lte.includes('CHART_DATA_AI_SETTINGS_KEY'));
  check('D5 the availability module is pure decision logic (no db/storage imports)',
    !/from\s+['"]\.\/db['"]|from\s+['"]\.\.\/db['"]|storage/.test(availSrc));
}

console.log(`\n${passes} passed, ${failures} failed`);
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
