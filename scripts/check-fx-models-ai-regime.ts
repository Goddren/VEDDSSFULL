/**
 * FX Models AI regime vote + strategy-signal directive — verification.
 *
 * Run:  node --import tsx/esm scripts/check-fx-models-ai-regime.ts
 *
 * No database, broker, or market-data calls: the blend rule, the named
 * signal derivation, the prompt assembly and the stats aggregation are
 * pure; decision stamping (live + replay) is pinned on source.
 *
 *   R. Blend rule: the AI vote decides the day type ONLY on a mixed
 *      (borderline) scorecard with confidence ≥ the threshold
 *      (FX_MODELS_AI_REGIME_MIN_CONF, default 0.6); a decisive
 *      scorecard is never overridden; disagreements are counted.
 *   S. Named strategy signals: derived only from context that exists
 *      (ORB, ICT BOS, momentum composite, volume profile, measured
 *      range, caller-attached ctx.signals); strategyAligned validates
 *      against the active list.
 *   P. Prompt: with the build on, the tail carries the regime-vote +
 *      strategy directive and the new JSON contract; with
 *      FX_MODELS_AI_REGIME=off the prompt is the PRE-BUILD prompt byte
 *      for byte (sha256 pins recorded before the build landed).
 *   T. Stamping: the shared decide path stamps regime provenance +
 *      strategyAligned + the running epoch into storedCtx and onto the
 *      outcome; the replay consumes the same outcome (parity).
 *   V. Untouched guards: m1Reject's ORB veto still fires; the PR #68
 *      lesson gate still lives in shadowDecide only.
 *   G. summarizeRegimeStats: agreement rate + resolved split by
 *      regimeSource for the panel line.
 *   E. Epoch: MODELS_EPOCH = 3; FX_MODELS_AI_REGIME=off makes the
 *      running current epoch 2 again (pre-build counting).
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  MODELS_EPOCH,
  PREVIOUS_MODELS_EPOCH,
  currentModelsEpoch,
  modelsAiRegimeOn,
  aiRegimeMinConfidence,
  normalizeAiRegimeVote,
  resolveRegimeWithAiVote,
  summarizeRegimeResolutions,
  canonicalStrategyName,
  namedStrategySignals,
  normalizeStrategyAligned,
  buildModelsPrompt,
  m1Reject,
  summarizeRegimeStats,
} from '../server/services/fx-models';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number, b: number, tol = 0.0011) => Math.abs(a - b) <= tol;
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

delete process.env.FX_MODELS_AI_REGIME;
delete process.env.FX_MODELS_AI_REGIME_MIN_CONF;
delete process.env.FX_MODELS_ENRICH;
delete process.env.FX_MODELS_LIFTS;
delete process.env.FX_MODELS_EPOCH;

const fxSrc = readFileSync(new URL('../server/services/fx-models.ts', import.meta.url), 'utf8');
const replaySrc = readFileSync(new URL('../server/services/fx-models-replay.ts', import.meta.url), 'utf8');
const panelSrc = readFileSync(new URL('../client/src/components/fx-models-panel.tsx', import.meta.url), 'utf8');

// ── R. Blend rule ─────────────────────────────────────────────────────
{
  check('R0 defaults: build on, threshold 0.6', modelsAiRegimeOn() === true && aiRegimeMinConfidence() === 0.6);

  const decisive = resolveRegimeWithAiVote({ dayType: 'trend', autoModel: 'M2', score: 5 }, { regime: 'range', confidence: 0.99 });
  check('R1 decisive scorecard is NEVER overridden by a confident contrary vote',
    decisive.dayType === 'trend' && decisive.autoModel === 'M2' && decisive.regimeSource === 'scorecard' && decisive.tiebreakApplied === false);
  check('R2 the contrary vote is still recorded + flagged as a disagreement',
    decisive.aiRegime === 'range' && decisive.aiRegimeConfidence === 0.99 && decisive.scorecardRegime === 'trend' && decisive.disagreement === true);

  const agree = resolveRegimeWithAiVote({ dayType: 'range', autoModel: 'M1', score: 0 }, { regime: 'range', confidence: 0.9 });
  check('R3 decisive scorecard + agreeing vote → no disagreement', agree.dayType === 'range' && agree.disagreement === false && agree.regimeSource === 'scorecard');

  const tie = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 3 }, { regime: 'trend', confidence: 0.6 });
  check('R4 mixed scorecard + vote at the threshold → the vote DECIDES (trend → M2)',
    tie.dayType === 'trend' && tie.autoModel === 'M2' && tie.regimeSource === 'ai_tiebreak' && tie.tiebreakApplied === true);

  const weak = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 2 }, { regime: 'trend', confidence: 0.59 });
  check('R5 mixed scorecard + vote below the threshold → scorecard stands',
    weak.dayType === 'mixed' && weak.autoModel === 'M1' && weak.regimeSource === 'scorecard' && weak.tiebreakApplied === false && weak.disagreement === true);

  const mixedVote = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M2', score: 2 }, { regime: 'mixed', confidence: 0.9 });
  check('R6 mixed + confident "mixed" vote → tie-break confirms mixed, scorecard autoModel kept',
    mixedVote.dayType === 'mixed' && mixedVote.autoModel === 'M2' && mixedVote.regimeSource === 'ai_tiebreak' && mixedVote.disagreement === false);

  const invalid = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 2 }, { regime: 'sideways', confidence: 0.99 });
  check('R7 invalid vote ignored entirely', invalid.dayType === 'mixed' && invalid.aiRegime === null && invalid.disagreement === false);
  const none = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 2 }, undefined);
  check('R8 missing vote → scorecard stands, nothing stamped', none.aiRegime === null && none.aiRegimeConfidence === null && none.regimeSource === 'scorecard');

  const pct = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 3 }, { regime: 'trend', confidence: 75 });
  check('R9 a 0–100 confidence is rescaled (75 → 0.75) and can tie-break',
    pct.aiRegimeConfidence === 0.75 && pct.tiebreakApplied === true);
  check('R9b normalizeAiRegimeVote rejects out-of-range confidence', normalizeAiRegimeVote({ regime: 'trend', confidence: 150 }) === null);

  process.env.FX_MODELS_AI_REGIME_MIN_CONF = '0.8';
  const belowCustom = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 2 }, { regime: 'trend', confidence: 0.7 });
  const aboveCustom = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 2 }, { regime: 'trend', confidence: 0.85 });
  check('R10 env threshold is honored (0.8: 0.7 no, 0.85 yes)', belowCustom.tiebreakApplied === false && aboveCustom.tiebreakApplied === true);
  delete process.env.FX_MODELS_AI_REGIME_MIN_CONF;

  process.env.FX_MODELS_AI_REGIME = 'off';
  const killed = resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 2 }, { regime: 'trend', confidence: 0.99 });
  check('R11 kill switch: the vote is not even recorded', modelsAiRegimeOn() === false && killed.aiRegime === null && killed.dayType === 'mixed' && killed.disagreement === false);
  delete process.env.FX_MODELS_AI_REGIME;

  const summary = summarizeRegimeResolutions([
    resolveRegimeWithAiVote({ dayType: 'trend', autoModel: 'M2', score: 5 }, { regime: 'trend', confidence: 0.9 }),
    resolveRegimeWithAiVote({ dayType: 'trend', autoModel: 'M2', score: 5 }, { regime: 'range', confidence: 0.9 }),
    resolveRegimeWithAiVote({ dayType: 'mixed', autoModel: 'M1', score: 2 }, { regime: 'range', confidence: 0.9 }),
    resolveRegimeWithAiVote({ dayType: 'range', autoModel: 'M1', score: 0 }, undefined),
  ]);
  check('R12 cycle summary counts votes / agreements / disagreements / tie-breaks',
    summary.votes === 3 && summary.agreements === 1 && summary.disagreements === 2 && summary.tiebreaks === 1 && approx(summary.agreementRate ?? -1, 1 / 3, 0.01),
    JSON.stringify(summary));
}

// ── S. Named strategy signals ─────────────────────────────────────────
{
  const orbCtx = { orb: { phase: 'retest', direction: 'BUY', retest: true, rangeLow: 1.09, rangeHigh: 1.1 } };
  check('S1 ORB breakout/retest in context → the orb signal is active',
    namedStrategySignals(orbCtx, 'fx').some((s) => s.name === 'orb' && s.direction === 'BUY'));
  check('S2 ORB is FX-only (crypto context never lists it)', !namedStrategySignals(orbCtx, 'crypto').some((s) => s.name === 'orb'));
  check('S3 an unformed ORB range is not a signal',
    !namedStrategySignals({ orb: { phase: 'awaiting_breakout', direction: null, rangeLow: 1.09, rangeHigh: 1.1 } }, 'fx').some((s) => s.name === 'orb'));

  check('S4 H1/H4 BOS/CHOCH structure → ict_bos',
    namedStrategySignals({ h1: { bos: 'BOS up' }, h4: { bos: null } }, 'fx').some((s) => s.name === 'ict_bos'));

  const momCtx = { h1: { trend: 'BULLISH' }, h4: { trend: 'BULLISH' }, adx: 30, plusDI: 28, minusDI: 10, relVolume: 1.4 };
  check('S5 aligned H1/H4 + ADX/DI/volume → momentum (BUY)',
    namedStrategySignals(momCtx, 'fx').some((s) => s.name === 'momentum' && s.direction === 'BUY'));
  check('S6 weak ADX → no momentum signal',
    !namedStrategySignals({ ...momCtx, adx: 15 }, 'fx').some((s) => s.name === 'momentum'));
  check('S7 disagreeing H1/H4 → no momentum signal',
    !namedStrategySignals({ ...momCtx, h4: { trend: 'BEARISH' } }, 'fx').some((s) => s.name === 'momentum'));

  check('S8 volume profile in context → volume_profile',
    namedStrategySignals({ volumeProfile: { poc: 1.1, vah: 1.12, val: 1.08, pricePos: 'in VA' } }, 'fx').some((s) => s.name === 'volume_profile'));
  check('S9 a server-checked range candidate → measured_range',
    namedStrategySignals({ range: { m1Candidate: { direction: 'BUY', edge: 'bottom', target: 1.1 } } }, 'fx').some((s) => s.name === 'measured_range'));
  check('S10 a caller-attached ctx.signals entry is honored (the sniper door)',
    namedStrategySignals({ signals: [{ strategy: 'sniper', direction: 'BUY' }] }, 'fx').some((s) => s.name === 'sniper'));
  check('S11 a bare context carries NO named signals (nothing invented)',
    namedStrategySignals({ price: 1.1, dayType: 'mixed' }, 'fx').length === 0);

  check('S12 strategyAligned validates against the ACTIVE list (aliases ok, hallucinations → null)',
    normalizeStrategyAligned('ORB', orbCtx, 'fx') === 'orb'
    && normalizeStrategyAligned('bos', { h1: { bos: 'BOS up' } }, 'fx') === 'ict_bos'
    && normalizeStrategyAligned('momentum', momCtx, 'fx') === 'momentum'
    && normalizeStrategyAligned('sniper', orbCtx, 'fx') === null
    && normalizeStrategyAligned(null, orbCtx, 'fx') === null
    && canonicalStrategyName('Volume Profile') === 'volume_profile');
}

// ── P. Prompt ─────────────────────────────────────────────────────────
{
  const pairs = [{ symbol: 'EURUSD', ctx: { price: 1.1, dayType: 'mixed' } }];
  const on = buildModelsPrompt('fx', 'London', pairs, '', false);
  check('P1 build on: the directive block + new JSON contract are in the tail',
    on.includes('REGIME VOTE + STRATEGY-SIGNAL DIRECTIVE') && on.includes('"regimeVotes"') && on.includes('"strategyAligned"')
    && on.endsWith('Give exactly one regime vote per pair and exactly one M1 and one M2 entry per pair.'));
  check('P2 build on: deterministic', buildModelsPrompt('fx', 'London', pairs, '', false) === on);

  const rich = [{
    symbol: 'EURUSD',
    ctx: {
      price: 1.1, dayType: 'mixed', autoModel: 'M1',
      orb: { phase: 'retest', direction: 'BUY', retest: true, rangeLow: 1.09, rangeHigh: 1.1 },
      h1: { trend: 'BULLISH', bos: 'BOS up' }, h4: { trend: 'BULLISH' },
      adx: 30, plusDI: 28, minusDI: 10, relVolume: 1.4,
      volumeProfile: { poc: 1.1, vah: 1.12, val: 1.08, pricePos: 'in VA' },
    },
  }];
  const richPrompt = buildModelsPrompt('fx', 'London', rich, '', true);
  const directiveAt = richPrompt.indexOf('NAMED STRATEGY SIGNALS');
  const directiveSeg = directiveAt >= 0 ? richPrompt.slice(directiveAt, directiveAt + 1200) : '';
  check('P3 the directive lists the pair\'s REAL active signals',
    directiveSeg.includes('orb (') && directiveSeg.includes('ict_bos (') && directiveSeg.includes('momentum (') && directiveSeg.includes('volume_profile ('),
    directiveSeg.slice(0, 200));

  // Kill switch: the prompt must be the pre-build prompt byte for byte.
  // The sha256 pins below were recorded from the pre-build code for
  // these exact fixtures (enrich/lifts states as labelled).
  process.env.FX_MODELS_AI_REGIME = 'off';
  delete process.env.FX_MODELS_LIFTS;
  const offDefault = buildModelsPrompt('fx', 'London', pairs, '', false);
  check('P4 kill switch: no directive markers, legacy tail restored',
    !offDefault.includes('REGIME VOTE') && !offDefault.includes('regimeVotes') && !offDefault.includes('strategyAligned')
    && offDefault.endsWith('Give exactly one M1 and one M2 entry per pair.'));
  check('P5 kill switch: explicit aiRegime=false === env-off default',
    buildModelsPrompt('fx', 'London', pairs, '', false, false) === offDefault);
  check('P6 pre-build prompt hash — fx, unenriched', sha(offDefault) === '4ecaf3fc82e94904dcfbb963b81395428eb733317712fa03b50028bceff36064', sha(offDefault));
  process.env.FX_MODELS_LIFTS = 'off';
  check('P7 pre-build prompt hash — fx, enriched, lifts off',
    sha(buildModelsPrompt('fx', 'London', pairs, '', true)) === 'b3fab28568089a7fea6ac7972e5527cad4a13a93bb6706ceff20221138656b2c');
  delete process.env.FX_MODELS_LIFTS;
  check('P8 pre-build prompt hash — fx, enriched, lifts on',
    sha(buildModelsPrompt('fx', 'London', pairs, '', true)) === 'ecb4068a992dc079275a2429b3170443dab379b72e5e2c0511547a5358a7fe47');
  check('P9 pre-build prompt hash — crypto, unenriched',
    sha(buildModelsPrompt('crypto', 'London', pairs, '', false)) === 'bf8f4ea201ec915ffa0154e81dd98981b6f64e772481e2470d507f42c022be91');
  delete process.env.FX_MODELS_AI_REGIME;
}

// ── T. Stamping (source pins — live + replay share decideModelIdeas) ──
{
  const decideSeg = fxSrc.slice(fxSrc.indexOf('export async function decideModelIdeas'), fxSrc.indexOf('async function shadowDecide'));
  check('T1 decide path blends the vote per pair', decideSeg.includes('resolveRegimeWithAiVote(') && decideSeg.includes('out.regimeSummary'));
  check('T2 storedCtx stamps regime provenance + strategyAligned + running epoch',
    decideSeg.includes('regimeSource: resolution.regimeSource') && decideSeg.includes('aiRegimeConfidence: resolution.aiRegimeConfidence')
    && decideSeg.includes('scorecardRegime: resolution.scorecardRegime') && decideSeg.includes('strategyAligned,')
    && decideSeg.includes('epoch: currentModelsEpoch()'));
  check('T3 the outcome carries the effective day type + provenance fields',
    decideSeg.includes('dayType: resolution.dayType') && decideSeg.includes('regimeSource: aiRegime ? resolution.regimeSource : null')
    && decideSeg.includes('normalizeStrategyAligned('));
  check('T4 kill switch omits the stamps (conditional spread only)',
    decideSeg.includes('...(aiRegime ? {'));
  check('T5 replay parity: the replay calls the shared decide path and stores outcome dayType + storedCtx',
    replaySrc.includes('decideModelIdeas(') && replaySrc.includes('o.dayType') && replaySrc.includes('...o.storedCtx'));
  check('T6 shadowDecide logs the cycle regime summary',
    fxSrc.includes('[fx-models] regime votes') && fxSrc.includes('res.regimeSummary'));
}

// ── V. Untouched guards ───────────────────────────────────────────────
{
  const range = { qualifies: true, positionInRangePct: 80, rangeHigh: 1.105, rangeLow: 1.095, rangeMid: 1.1, touchesHigh: 3, touchesLow: 3, bbWidthPercentile: 40 };
  check('V1 m1Reject ORB veto intact: SELL fade vs confirmed BUY breakout is blocked',
    m1Reject('EURUSD', 'SELL', 1.104, 1.106, { h4: { trend: 'NEUTRAL' }, range: { ...range }, orb: { phase: 'breakout', direction: 'BUY', rangeHigh: 1.103, rangeLow: 1.101, retest: false } }) === 'ORB breakout active against the fade');
  const decideBody = fxSrc.slice(fxSrc.indexOf('export async function decideModelIdeas'), fxSrc.indexOf('// ── Lesson gate'));
  check('V2 the lesson gate stays OUT of the shared decide path (replay parity)',
    !decideBody.includes('lesson_gate') && !decideBody.includes('deadSlice') && !decideBody.includes('getDeadSlices'));
  const shadowSeg = fxSrc.slice(fxSrc.indexOf('async function shadowDecide'), fxSrc.indexOf('export interface RaceResolution'));
  check('V3 the lesson gate still lives in shadowDecide', shadowSeg.includes("source='lesson_gate'") || shadowSeg.includes('lesson_gate'));
}

// ── G. Panel stats aggregation ────────────────────────────────────────
{
  const stats = summarizeRegimeStats([
    { model: 'M1', result: 'WIN', r_multiple: 2, context: { aiRegime: 'trend', scorecardRegime: 'mixed', regimeSource: 'ai_tiebreak' } },
    { model: 'M1', result: 'LOSS', r_multiple: -1, context: { aiRegime: 'trend', scorecardRegime: 'trend', regimeSource: 'scorecard' } },
    { model: 'M1', result: null, r_multiple: null, context: { aiRegime: 'range', scorecardRegime: 'range', regimeSource: 'scorecard' } },
    { model: 'M2', result: 'WIN', r_multiple: 1, context: JSON.stringify({ aiRegime: 'mixed', scorecardRegime: 'mixed', regimeSource: 'ai_tiebreak' }) },
    { model: 'M2', result: 'WIN', r_multiple: 5, context: { dayType: 'trend' } },
  ]);
  check('G1 agreement accounting per model (string contexts parsed, voteless rows ignored)',
    stats.M1.votes === 3 && stats.M1.agreements === 2 && stats.M1.disagreements === 1 && approx(stats.M1.agreementRate ?? -1, 2 / 3, 0.01)
    && stats.M2.votes === 1 && stats.M2.agreements === 1, JSON.stringify(stats.M1));
  check('G2 resolved split by regimeSource',
    stats.M1.bySource.ai_tiebreak.trades === 1 && stats.M1.bySource.ai_tiebreak.avgR === 2
    && stats.M1.bySource.scorecard.trades === 1 && stats.M1.bySource.scorecard.avgR === -1
    && stats.M2.bySource.ai_tiebreak.trades === 1 && stats.M2.bySource.ai_tiebreak.avgR === 1);
  check('G3 mastery payload + panel line exist',
    fxSrc.includes('regimeStats: summarizeRegimeStats') && panelSrc.includes('RegimeLine') && panelSrc.includes('regimeStats'));
}

// ── E. Epoch ──────────────────────────────────────────────────────────
{
  check('E1 MODELS_EPOCH is 3, previous is 2', MODELS_EPOCH === 3 && PREVIOUS_MODELS_EPOCH === 2);
  check('E2 running current epoch is 3 with the build on', currentModelsEpoch() === 3);
  process.env.FX_MODELS_AI_REGIME = 'off';
  check('E3 FX_MODELS_AI_REGIME=off → the running current epoch falls back to 2 (pre-build counting)',
    currentModelsEpoch() === 2);
  delete process.env.FX_MODELS_AI_REGIME;
  check('E4 switch back on → current epoch 3 again', currentModelsEpoch() === 3);
}

console.log(`\n${total - failures}/${total} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
