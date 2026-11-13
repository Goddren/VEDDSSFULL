/**
 * FX Models enrichment — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-fx-models-enrich.ts
 *
 * No database, broker, or market-data calls: everything exercised here is
 * pure (the alt-regime scorecard, D1 aggregation, the volume-profile
 * compact mapping, the m1Reject ORB veto, and prompt assembly).
 *
 *   A. altClassifyD1H1: same scorecard as classifyDayType with D1 in the
 *      H4 slot — agreement/disagreement cases, an equivalence sweep against
 *      classifyDayType, and purity (no input mutation, deterministic).
 *   B. aggregateDailyBars + d1Summary: H1 → UTC daily aggregation (ms and
 *      s timestamps), then trend/priceAbove from synthetic daily series.
 *   C. compactVolumeProfile: mapping from the real indicators.volumeProfile
 *      shape ({ poc, vah, val, pocStrength, ... }) incl. null cases.
 *   D. m1Reject: the ONE new veto — an M1 fade opposing an active confirmed
 *      ORB breakout is rejected; same-direction / no-breakout / kill-switch
 *      cases pass, and all pre-enrichment M1 rejections are unchanged.
 *   E. buildModelsPrompt: with enrichment off the prompt is the legacy
 *      prompt (anchors present, no enrichment markers, deterministic);
 *      with enrichment on, the ONLY difference is one contiguous guidance
 *      block (FX includes ORB, crypto does not).
 */
import {
  classifyDayType,
  altClassifyD1H1,
  aggregateDailyBars,
  d1Summary,
  compactVolumeProfile,
  m1Reject,
  buildModelsPrompt,
  modelsEnrichOn,
  type ModelBar,
} from '../server/services/fx-models';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

delete process.env.FX_MODELS_ENRICH; // default-on for the veto tests below

// ── A. altClassifyD1H1 ─────────────────────────────────────────────────────
{
  const agree = altClassifyD1H1({ adx: 30, relVolume: 1.5, d1: 'BULLISH', h1: 'BULLISH', session: 'London' });
  check('A1 D1/H1 agree + strong ADX → trend/M2', agree.dayType === 'trend' && agree.autoModel === 'M2', JSON.stringify(agree));

  const disagree = altClassifyD1H1({ adx: 10, relVolume: 0.5, d1: 'BEARISH', h1: 'BULLISH', session: 'Asian' });
  check('A2 D1/H1 disagree + weak ADX + Asian → range/M1', disagree.dayType === 'range' && disagree.autoModel === 'M1', JSON.stringify(disagree));

  // Equivalence sweep: alt(d1, h1) must equal classify(h4=d1, h1) everywhere.
  let sweepOk = true;
  const trends: Array<string | null> = ['BULLISH', 'BEARISH', 'NEUTRAL', null];
  for (const d1 of trends) for (const h1 of trends) for (const adx of [10, 22, 30]) {
    const a = altClassifyD1H1({ adx, relVolume: 1.0, d1, h1, session: 'London' });
    const b = classifyDayType({ adx, relVolume: 1.0, h4: d1, h1, session: 'London' });
    if (a.dayType !== b.dayType || a.autoModel !== b.autoModel || a.score !== b.score) sweepOk = false;
  }
  check('A3 alt ≡ classifyDayType(h4:=d1) over trend×ADX sweep', sweepOk);

  const input = { adx: 22, relVolume: 1.1, d1: 'BULLISH', h1: 'BEARISH', session: 'New York', news: true };
  const before = JSON.stringify(input);
  const r1 = altClassifyD1H1(input);
  const r2 = altClassifyD1H1(input);
  check('A4 pure: deterministic + input not mutated', JSON.stringify(r1) === JSON.stringify(r2) && JSON.stringify(input) === before);

  const legacy = classifyDayType({ adx: 30, relVolume: 1.5, h1: 'BULLISH', h4: 'BULLISH', session: 'London' });
  check('A5 classifyDayType (H1/H4) itself unchanged', legacy.dayType === 'trend' && legacy.autoModel === 'M2');
}

// ── B. D1 aggregation + summary ────────────────────────────────────────────
{
  const dayMs = 86_400_000;
  const base = Math.floor(Date.now() / dayMs) * dayMs - 10 * dayMs; // 10 days ago, UTC midnight
  const h1Bars: ModelBar[] = [];
  for (let d = 0; d < 3; d++) {
    for (let h = 0; h < 24; h++) {
      const open = 100 + d * 10 + h;
      h1Bars.push({ timestamp: base + d * dayMs + h * 3_600_000, open, high: open + 2, low: open - 1, close: open + 1, volume: 5 });
    }
  }
  const daily = aggregateDailyBars(h1Bars);
  check('B1 72 H1 bars → 3 daily bars', daily.length === 3);
  check('B2 daily OHLC aggregated (day 2)', daily[1].open === 110 && daily[1].high === 135 && daily[1].low === 109 && daily[1].close === 134,
    JSON.stringify(daily[1]));
  check('B3 daily timestamps at UTC day starts, ascending',
    daily[0].timestamp === base && daily[1].timestamp === base + dayMs && daily[2].timestamp === base + 2 * dayMs);
  check('B4 seconds timestamps aggregate identically',
    JSON.stringify(aggregateDailyBars(h1Bars.map((b) => ({ ...b, timestamp: b.timestamp / 1000 })))) === JSON.stringify(daily));
  check('B5 empty input → empty output', aggregateDailyBars([]).length === 0);

  const mkDaily = (n: number, drift: number): ModelBar[] => {
    const out: ModelBar[] = [];
    const start = Math.floor(Date.now() / dayMs) * dayMs - (n + 1) * dayMs; // all confirmed (past) days
    for (let i = 0; i < n; i++) {
      const c = 100 + drift * i;
      out.push({ timestamp: start + i * dayMs, open: c - drift / 2, high: c + 1, low: c - 1, close: c });
    }
    return out;
  };
  const up = d1Summary(mkDaily(70, 1), 200);
  check('B6 rising daily series → BULLISH + priceAbove', up?.trend === 'BULLISH' && up?.priceAbove === true, JSON.stringify(up));
  const down = d1Summary(mkDaily(70, -1), 10);
  check('B7 falling daily series → BEARISH + !priceAbove', down?.trend === 'BEARISH' && down?.priceAbove === false, JSON.stringify(down));
  check('B8 fewer than 20 confirmed days → null', d1Summary(mkDaily(10, 1), 200) === null);
}

// ── C. compactVolumeProfile ────────────────────────────────────────────────
{
  // Fixture matches the real indicators.volumeProfile shape (server/indicators.ts).
  const vp = { avgVolume: 1000, currentVolume: 1500, volumeRatio: 1.5, volumeTrend: 'INCREASING', poc: 1.1, vah: 1.105, val: 1.095, pocStrength: 12.5 };
  const above = compactVolumeProfile(vp, 1.108);
  check('C1 price above VAH → above VA + distToPocPct', above?.pricePos === 'above VA' && above?.distToPocPct === 0.73, JSON.stringify(above));
  const inside = compactVolumeProfile(vp, 1.1);
  check('C2 price at POC → in VA + zero distance', inside?.pricePos === 'in VA' && inside?.distToPocPct === 0);
  const below = compactVolumeProfile(vp, 1.09);
  check('C3 price below VAL → below VA + negative distance', below?.pricePos === 'below VA' && below?.distToPocPct === -0.91, JSON.stringify(below));
  check('C4 missing POC (profile without true VP) → null', compactVolumeProfile({ avgVolume: 5, volumeTrend: 'STABLE' }, 1.1) === null);
  check('C5 null profile / zero price → null', compactVolumeProfile(null, 1.1) === null && compactVolumeProfile(vp, 0) === null);
}

// ── D. m1Reject ORB veto ───────────────────────────────────────────────────
{
  const range = { qualifies: true, positionInRangePct: 80, rangeHigh: 1.105, rangeLow: 1.095, rangeMid: 1.1, touchesHigh: 3, touchesLow: 3, bbWidthPercentile: 40 };
  const ctxTop = (extra: any = {}) => ({ h4: { trend: 'NEUTRAL' }, range: { ...range }, ...extra });

  check('D1 baseline SELL fade at range top passes (no ORB)', m1Reject('EURUSD', 'SELL', 1.104, 1.106, ctxTop()) === null);
  check('D2 SELL fade vs confirmed BUY breakout → ORB veto',
    m1Reject('EURUSD', 'SELL', 1.104, 1.106, ctxTop({ orb: { phase: 'breakout', direction: 'BUY', rangeHigh: 1.103, rangeLow: 1.101, retest: false } })) === 'ORB breakout active against the fade');
  check('D3 SELL fade vs BUY breakout in retest phase → ORB veto',
    m1Reject('EURUSD', 'SELL', 1.104, 1.106, ctxTop({ orb: { phase: 'retest', direction: 'BUY', rangeHigh: 1.103, rangeLow: 1.101, retest: true } })) === 'ORB breakout active against the fade');
  check('D4 SELL fade WITH a SELL breakout (same direction) passes',
    m1Reject('EURUSD', 'SELL', 1.104, 1.106, ctxTop({ orb: { phase: 'breakout', direction: 'SELL', rangeHigh: 1.103, rangeLow: 1.101, retest: false } })) === null);
  check('D5 range formed, no breakout yet (awaiting_breakout) passes',
    m1Reject('EURUSD', 'SELL', 1.104, 1.106, ctxTop({ orb: { phase: 'awaiting_breakout', direction: null, rangeHigh: 1.103, rangeLow: 1.101, retest: false } })) === null);

  const rangeBottom = { ...range, positionInRangePct: 20 };
  check('D6 BUY fade vs confirmed SELL breakout → ORB veto',
    m1Reject('EURUSD', 'BUY', 1.096, 1.094, { h4: { trend: 'NEUTRAL' }, range: rangeBottom, orb: { phase: 'breakout', direction: 'SELL', rangeHigh: 1.103, rangeLow: 1.101, retest: false } }) === 'ORB breakout active against the fade');

  process.env.FX_MODELS_ENRICH = 'off';
  check('D7 FX_MODELS_ENRICH=off → ORB veto disabled, fade passes',
    m1Reject('EURUSD', 'SELL', 1.104, 1.106, ctxTop({ orb: { phase: 'breakout', direction: 'BUY', rangeHigh: 1.103, rangeLow: 1.101, retest: false } })) === null);
  delete process.env.FX_MODELS_ENRICH;

  check('D8 pre-enrichment rejections unchanged: no range data',
    m1Reject('EURUSD', 'SELL', 1.104, 1.106, { h4: { trend: 'NEUTRAL' }, range: null }) === 'range data unavailable');
  check('D9 pre-enrichment rejections unchanged: SELL not at top',
    (m1Reject('EURUSD', 'SELL', 1.1, 1.102, { h4: { trend: 'NEUTRAL' }, range: { ...range, positionInRangePct: 50 } }) || '').startsWith('SELL not at range top'));
}

// ── E. buildModelsPrompt ───────────────────────────────────────────────────
{
  const pairs = [{ symbol: 'EURUSD', ctx: { price: 1.1, dayType: 'range' } }];
  const off = buildModelsPrompt('fx', 'London', pairs, '', false);
  check('E1 off prompt: legacy head + tail anchors',
    off.startsWith('You run TWO FX trading models side by side.') && off.endsWith('Give exactly one M1 and one M2 entry per pair.'));
  check('E2 off prompt: legacy body anchors',
    off.includes('MODEL 1 (range / low-volume days)') && off.includes('Target 3R or more') && off.includes('EURUSD: {"price":1.1,"dayType":"range"}'));
  check('E3 off prompt: no enrichment markers',
    !off.includes('ENRICHED CONTEXT') && !off.includes('ctx.volumeProfile') && !off.includes('ctx.markov') && !off.includes('ctx.orb') && !off.includes('ctx.d1'));
  check('E4 off prompt: deterministic', buildModelsPrompt('fx', 'London', pairs, '', false) === off);

  const on = buildModelsPrompt('fx', 'London', pairs, '', true);
  check('E5 on prompt (FX): guidance markers incl. ORB + POC + Markov + D1',
    on.includes('ENRICHED CONTEXT') && on.includes('ctx.volumeProfile') && on.includes('ctx.orb') && on.includes('ctx.markov') && on.includes('ctx.d1') && on.includes('POC'));

  // The enriched prompt must be the legacy prompt with exactly ONE
  // contiguous block inserted: longest common prefix + suffix cover `off`.
  let p = 0;
  while (p < off.length && on[p] === off[p]) p++;
  let s = 0;
  while (s < off.length - p && on[on.length - 1 - s] === off[off.length - 1 - s]) s++;
  check('E6 on = off + one contiguous inserted block', p + s >= off.length && on.length > off.length,
    `prefix ${p}, suffix ${s}, off ${off.length}, on ${on.length}`);

  const onCrypto = buildModelsPrompt('crypto', 'London', pairs, '', true);
  check('E7 on prompt (crypto): VP/Markov/D1 guidance, NO ORB line',
    onCrypto.includes('ctx.volumeProfile') && onCrypto.includes('ctx.markov') && onCrypto.includes('ctx.d1') && !onCrypto.includes('ctx.orb'));
  const offCrypto = buildModelsPrompt('crypto', 'London', pairs, '', false);
  check('E8 off prompt (crypto): no enrichment markers', !offCrypto.includes('ENRICHED CONTEXT') && !offCrypto.includes('ctx.d1'));

  check('E9 modelsEnrichOn default true', modelsEnrichOn() === true);
  process.env.FX_MODELS_ENRICH = 'off';
  check('E10 modelsEnrichOn false when FX_MODELS_ENRICH=off', modelsEnrichOn() === false);
  delete process.env.FX_MODELS_ENRICH;
}

console.log(`\n${total - failures}/${total} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
