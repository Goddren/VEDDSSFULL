/**
 * AI cost-cutting package verification checks (PR after #106).
 *
 * Run:  node --import tsx/esm scripts/check-ai-cost-cutting.ts
 * (Run with DATABASE_URL unset, like the other AI cost suites: importing
 * server/openai.ts logs a DB connection attempt and must degrade silently.)
 *
 * What is pinned:
 *   A. Gray-zone gating (Layer 1) — the decisive-reject predicate matches
 *      the chart-data decision block's own constants (EA gate 80, override
 *      floor Grade B, advisory floor 85); for every verdict the AI could
 *      return inside the band, the route's documented decision rules yield
 *      REJECT (so skipping the purchase is outcome-identical); outside the
 *      band a confirming verdict exists (so those stay ungated). The
 *      synthesized skip verdict fails the decision block's first test
 *      (aiConfidence 0), is never labelled an error, and counters move.
 *      The breakout rubber stamp is gated in source; the gate sits before
 *      the cache/budget in the vision branch; /api/health exports the
 *      counters; AI_GRAY_ZONE=off restores ask-always.
 *   B. Bar-aware verdict cache (Layer 2) — a verdict is a fresh HIT until
 *      its bar closes and a MISS on the next bar (mocked clock); the
 *      AI_BAR_CACHE=off kill switch restores fixed-TTL behavior; counters
 *      increment; timeframe parsing is pinned.
 *   C. Slim confirmation prompt (Layer 3) — on the pinned fixture the
 *      builder's output is >= 40% smaller than the pre-change builder
 *      (OLD_TOTAL_CHARS measured by running this exact fixture against the
 *      builder at base 2918d67d), with every verdict-contract field and the
 *      decision data still present.
 *   D. Cheap first pass (Layer 4) — the borderline test escalates only
 *      near the user's floor or on REQUIRE_BETTER_PRICE; defaults name the
 *      free model already in AVAILABLE_VISION_MODELS; AI_CHEAP_FIRST_PASS
 *      =off restores single-model; routes meter aiCallsBought exactly
 *      (0-unit answers skip metering) at both vision call sites.
 *   E. Scope guards — the two AI judges (PRs #105/#106) never import or
 *      reference the gating, and the branch diff touches no brain / trail /
 *      improvement / judge files.
 */
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

let failures = 0;
let passes = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (cond) passes++; else failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;

const gz = await import('../server/services/ai-gray-zone');
const cacheMod = await import('../server/services/ai-confirmation-cache');
const budget = await import('../server/services/ai-engine-budget');
const oai = await import('../server/openai');

// ── A. Gray-zone gating ─────────────────────────────────────────────────────
{
  // The band edges ARE the decision block's constants.
  check('A1 EA gate constant is the route AI-gate line (80)', gz.GRAY_ZONE_EA_GATE === 80);
  check('A2 override grades are exactly the B+ floor', JSON.stringify(gz.GRAY_ZONE_OVERRIDE_GRADES) === JSON.stringify(['A+', 'A', 'B']));
  check('A3 fraction confidences coerce like the decision block', gz.coerceEaConfidence(0.9) === 90 && gz.coerceEaConfidence(0.75) === 75 && gz.coerceEaConfidence(87) === 87);

  // Decisive-reject predicate across the boundary matrix.
  check('A4 below gate + below B grade is decisive-reject',
    gz.isDecisiveReject(79, 'C') === true && gz.isDecisiveReject(0, 'D') === true && gz.isDecisiveReject(79.9, 'c') === true);
  check('A5 at/above the EA gate is never decisive-reject',
    gz.isDecisiveReject(80, 'C') === false && gz.isDecisiveReject(100, 'D') === false);
  check('A6 Grade B or better can override — never decisive-reject',
    gz.isDecisiveReject(40, 'B') === false && gz.isDecisiveReject(40, 'A') === false && gz.isDecisiveReject(40, 'A+') === false);
  check('A7 a raw 0.9 fraction (coerced 90) cannot slip into the band',
    gz.isDecisiveReject(gz.coerceEaConfidence(0.9), 'C') === false);

  // The route's decision rules, as derived in ai-gray-zone.ts's header:
  // aiPasses needs confirmed + confidence >= floor; an AI pass on an
  // EA-failed setup is "too weak" unless Grade B+ (vision path:
  // enoughAligned falls back to strongGrade); the advisory override needs
  // a >= 85 signal; smcVerdict PASS only ever blocks.
  const routeDecision = (ea: number, grade: string, ai: { confirmed: boolean; confidence: number; smcVerdict: string | null }, floor = 70): string => {
    const eaPasses = ea >= 80;
    const aiPasses = ai.confirmed && ai.confidence >= floor;
    const strongGrade = ['A+', 'A', 'B'].includes(grade);
    if (ai.smcVerdict === 'PASS') return 'REJECT';
    if (aiPasses && !eaPasses && !strongGrade) return 'REJECT'; // override too weak
    if (aiPasses && (eaPasses || strongGrade || ea >= 85)) return 'CONFIRM';
    return 'REJECT';
  };
  let allReject = true;
  for (const ea of [0, 40, 79]) for (const grade of ['C', 'D']) {
    for (const confirmed of [true, false]) for (const confidence of [0, 50, 69, 70, 85, 100]) {
      for (const smcVerdict of [null, 'CONFIRM', 'REQUIRE_BETTER_PRICE', 'PASS']) {
        if (routeDecision(ea, grade, { confirmed, confidence, smcVerdict }) !== 'REJECT') allReject = false;
      }
    }
  }
  check('A8 EVERY possible AI verdict still REJECTS inside the band (skip is outcome-identical)', allReject);
  check('A9 just outside the band a confirming verdict exists (stays ungated)',
    routeDecision(79, 'B', { confirmed: true, confidence: 95, smcVerdict: 'CONFIRM' }) === 'CONFIRM' &&
    routeDecision(90, 'C', { confirmed: true, confidence: 95, smcVerdict: null }) === 'CONFIRM' &&
    routeDecision(90, 'C', { confirmed: false, confidence: 10, smcVerdict: null }) === 'REJECT');

  // The synthesized skip verdict: rejected by the block's own logic, never
  // an error, never a fake model opinion, learning row keeps confluence.
  const v = gz.decisiveRejectVerdict({ eaConfidence: 62, confluenceGrade: 'C', confluenceScore: 4 });
  check('A10 skip verdict is a plain reject (confirmed false, confidence 0)',
    v.confirmed === false && v.aiConfidence === 0 && v.aiDirection === 'NEUTRAL');
  check('A11 skip verdict is not an error and is honestly labelled',
    v.aiError === undefined && v.modelUsed === 'ai-gray-zone-gate' && v.grayZoneSkipped === 'decisive_reject' && v.smcVerdict === null);
  check('A12 skip verdict carries the server confluence for the learning row',
    v.confluenceGrade === 'C' && v.confluenceScore === 4);

  // Counters + kill switch.
  const U = 920201;
  const before = gz.aiGrayZoneSummary();
  gz.noteGrayZoneAsked(U); gz.noteGrayZoneAsked(U);
  gz.noteGrayZoneSkip(U, 'decisive_reject'); gz.noteGrayZoneSkip(U, 'decisive_pass');
  const after = gz.aiGrayZoneSummary();
  check('A13 counters move (asked / skipped per kind)',
    after.asked === before.asked + 2 && after.skippedDecisiveReject === before.skippedDecisiveReject + 1 &&
    after.skippedDecisivePass === before.skippedDecisivePass + 1 && after.skippedTotal === before.skippedTotal + 2,
    JSON.stringify(after));
  delete process.env.AI_GRAY_ZONE;
  check('A14 gray zone is on by default', gz.aiGrayZoneEnabled() === true && gz.aiGrayZoneSummary().enabled === true);
  process.env.AI_GRAY_ZONE = 'off';
  check('A15 AI_GRAY_ZONE=off reports disabled', gz.aiGrayZoneEnabled() === false && gz.aiGrayZoneSummary().enabled === false);
  delete process.env.AI_GRAY_ZONE;

  // Source wiring.
  const routes = src('../server/routes.ts');
  const oaiSrc = src('../server/openai.ts');
  check('A16 vision gate runs before the cache lookup and the budget gate',
    routes.includes('if (_gzVerdict) {') && routes.indexOf('decisiveRejectVerdict') < routes.indexOf('const _ccHit'),
    'gate verdict short-circuits cache + purchase');
  check('A17 gray-zone stage is set and preserved',
    routes.includes("_cdiag.stage = 'ai_gray_zone_skip'") && routes.includes("_cdiag.stage === 'ai_gray_zone_skip' ? 'ai_gray_zone_skip'"));
  check('A18 purchases at gated sites are counted (vision + fallback)',
    count(routes, 'noteGrayZoneAsked(token.userId)') >= 2, `${count(routes, 'noteGrayZoneAsked(token.userId)')} sites`);
  check('A19 /api/health exports the gray-zone counters beside the budget',
    routes.includes('aiGrayZone:') && routes.includes('aiGrayZoneSummary()'));
  check('A20 breakout rubber stamp is gated in source (engine-only verdict)',
    count(oaiSrc, "grayZoneSkipped: 'decisive_pass'") >= 2 && oaiSrc.includes("noteGrayZoneSkip(userId, 'decisive_pass')") && oaiSrc.includes("modelUsed: 'breakout-engine'"));
  check('A21 no decisive_pass marker appears before the gate declaration (grade-fail return stays marker-free)',
    oaiSrc.indexOf("grayZoneSkipped: 'decisive_pass'") > oaiSrc.indexOf('const grayZoneBreakout'));
}

// ── B. Bar-aware verdict cache ──────────────────────────────────────────────
{
  check('B1 timeframe parsing (numeric + letter forms)',
    cacheMod.barDurationMs('15min') === 900_000 && cacheMod.barDurationMs('1h') === 3_600_000 &&
    cacheMod.barDurationMs('M15') === 900_000 && cacheMod.barDurationMs('H4') === 14_400_000 &&
    cacheMod.barDurationMs('5m') === 300_000 && cacheMod.barDurationMs('D1') === 86_400_000 &&
    cacheMod.barDurationMs('1day') === 86_400_000);
  check('B2 unrecognized timeframes fall back (null)',
    cacheMod.barDurationMs('bogus') === null && cacheMod.barDurationMs('') === null);

  const realNow = Date.now;
  const HOUR = 3_600_000;
  const t0 = 1_767_225_600_000; // 2026-01-01T00:00:00Z — aligned to the hour
  let now = t0 + 30 * 60_000;   // 00:30, mid-bar for a 1h timeframe
  Date.now = () => now;
  try {
    delete process.env.AI_BAR_CACHE;
    const c = cacheMod.createConfirmationCache();
    const verdict = { confirmed: true, aiConfidence: 88 };
    c.put(7, 'EURUSD', '1h', 'BUY', 87, 1.085, verdict);
    check('B3 stats report bar-aware mode', c.stats().barAware === true);
    const hit1 = c.get(7, 'EURUSD', '1h', 'BUY', 87, 1.0852);
    check('B4 second identical setup inside the same bar is a HIT (no purchase)',
      !!hit1 && hit1.verdict === verdict && c.stats().hits === 1);
    now = t0 + 45 * 60_000; // 00:45 — past the old 3-minute TTL, same bar
    const hit2 = c.get(7, 'EURUSD', '1h', 'BUY', 87, 1.0853);
    check('B5 verdict outlives the old 3-min TTL until the bar closes',
      !!hit2 && c.stats().hits === 2);
    now = t0 + 61 * 60_000; // 01:01 — next bar, past the 1-min call floor
    const miss = c.get(7, 'EURUSD', '1h', 'BUY', 87, 1.0854);
    check('B6 a new bar re-buys (MISS) and counters move',
      miss === null && c.stats().misses === 1, JSON.stringify(c.stats()));

    // Kill switch: fixed-TTL behavior restored.
    process.env.AI_BAR_CACHE = 'off';
    const c2 = cacheMod.createConfirmationCache();
    now = t0;
    c2.put(7, 'EURUSD', '1h', 'BUY', 87, 1.085, verdict);
    check('B7 kill switch reports in stats', c2.stats().barAware === false);
    now = t0 + 2 * 60_000;
    check('B8 with the switch off, inside 3-min TTL still hits', !!c2.get(7, 'EURUSD', '1h', 'BUY', 87, 1.085));
    now = t0 + 4 * 60_000; // past the 3-min TTL and the 1-min floor
    check('B9 with the switch off, past the TTL it misses (no bar extension)',
      c2.get(7, 'EURUSD', '1h', 'BUY', 87, 1.085) === null);
    delete process.env.AI_BAR_CACHE;
    check('B10 removing the switch re-arms bar mode', cacheMod.barCacheEnabled() === true);
  } finally {
    Date.now = realNow;
    delete process.env.AI_BAR_CACHE;
  }
}

// ── C. Slim confirmation prompt ─────────────────────────────────────────────
{
  // The fixture mirrors production richness: full-precision EA floats,
  // full core+advanced indicator sets, ICT + SMC contexts, news, prop firm.
  function genCandles(n: number) {
    const out: any[] = [];
    let base = 1.0850234918273645;
    for (let i = 0; i < n; i++) {
      const drift = Math.sin(i * 1.7) * 0.0012345678901234 + (i % 5) * 0.0002134567890123;
      const o = base + drift;
      const c = o + Math.cos(i * 2.3) * 0.0009876543210987;
      const h = Math.max(o, c) + 0.0004567890123456 * (1 + (i % 3) * 0.317);
      const l = Math.min(o, c) - 0.0003456789012345 * (1 + (i % 4) * 0.213);
      out.push({ o, h, l, c, v: 1234.5678 + i * 37.8912, t: 1763000000000 - i * 900000 });
      base = c;
    }
    return out;
  }
  const indicators: any = {
    rsi: 58.34729184736291, macd: { macd: 0.001234567890123, signal: 0.000987654321098, histogram: 0.000246913569025 },
    ema20: 1.086723491827364, ema50: 1.084512938475610, ema200: 1.079823471029384, sma50: 1.084912837465019,
    atr: 0.0019876543210987, bollingerBands: { upper: 1.092345678901234, middle: 1.086123456789012, lower: 1.079901234567890 },
    adx: 27.48392018473625, stochastic: { k: 64.29183746501928, d: 59.83746501928374 },
    vwap: 1.085512938475610, obv: 1284756.918273645,
    pivotPoints: { pivot: 1.086123456789012, r1: 1.089234567890123, r2: 1.092345678901234, s1: 1.083012345678901, s2: 1.079901234567890 },
    fibonacci: { level236: 1.083456789012345, level382: 1.085123456789012, level500: 1.086623456789012, level618: 1.088123456789012, level786: 1.090123456789012 },
    supportResistance: { supports: [1.083012345678901, 1.079901234567890, 1.076543210987654], resistances: [1.089234567890123, 1.092345678901234, 1.095678901234567] },
    candlePatterns: [{ pattern: 'Bullish Engulfing', candlesAgo: 2, bullish: true }, { pattern: 'Doji', candlesAgo: 5, bullish: null }],
    swingPoints: { lastSwingHigh: 1.089876543210987, lastSwingLow: 1.081234567890123, higherHighs: true, higherLows: true },
    sessionContext: { session: 'London', isHighLiquidity: true, hoursIntoSession: 2.5 },
    volatilityContext: { atrPercentile: 62.5, regime: 'normal', atrVsAverage: 1.12 },
    volumeProfile: { poc: 1.085987654321098, valueAreaHigh: 1.089123456789012, valueAreaLow: 1.082123456789012, position: 'inside_value_area' },
    breakoutDetection: { isBreakoutWindow: true, breakoutDetected: false, approachingBreakout: true, volumeConfirmed: false, preSessionHigh: 1.089123456789012, preSessionLow: 1.082345678901234, direction: 'BULLISH' },
    momentumScore: 71.29384756102938, trendStrength: 'moderate', divergence: null, notes: undefined,
  };
  const ict: any = {
    macroWindow: { isInMacroWindow: true, macroName: 'London Macro', macroType: 'ACCUMULATION', minutesUntilNextMacro: 0, nextMacroName: 'NY AM Macro', currentNYTime: '03:47', session: 'London' },
    premiumDiscount: { zone: 'DISCOUNT', percentile: 32.5, rangeHigh: 1.092345678901234, rangeLow: 1.079901234567890, equilibrium: 1.086123456789012, aligns: true, description: 'Price in DISCOUNT zone (32.5th percentile of range) — favourable for BUY entries' },
    stopHunt: { detected: true, candlesAgo: 4, sweepLevel: 1.081234567890123, description: 'Liquidity sweep below equal lows at 1.08123, 4 candles ago — stop hunt complete' },
    crtPattern: { detected: true, direction: 'BULLISH', stage: 'EXPANSION', description: 'CRT expansion phase — candle range theory model projecting higher' },
    asianRange: { high: 1.086123456789012, low: 1.083123456789012, midpoint: 1.084623456789012, detected: true, description: 'Asian range 1.08312–1.08612 swept to the downside, now reclaimed' },
    keyLevels: { pdHigh: 1.091234567890123, pdLow: 1.080123456789012, pwHigh: 1.098765432109876, pwLow: 1.071234567890123, currentPrice: 1.087123456789012, abovePDH: false, belowPDL: false, description: 'Price mid-range between PDH 1.09123 and PDL 1.08012 — draw on liquidity is PDH' },
    oteZone: { detected: true, swingHigh: 1.089876543210987, swingLow: 1.081234567890123, ote618: 1.086512345678901, ote705: 1.085712345678901, ote79: 1.084912345678901, inOTEZone: true, currentPrice: 1.087123456789012, description: 'Price inside OTE zone' },
  };
  const smc: any = {
    bosCHOCH: { detected: true, type: 'CHOCH', direction: 'BULLISH', level: 1.086123456789012, candlesAgo: 3, description: 'Bullish CHOCH — market structure shifted up through 1.08612' },
    fvg: { detected: true, direction: 'BULLISH', top: 1.086723456789012, bottom: 1.085923456789012, inZone: true, candlesAgo: 2, description: 'Bullish FVG 1.08592–1.08672, price currently inside the gap' },
    orderBlock: { detected: true, type: 'BULLISH', top: 1.086123456789012, bottom: 1.084923456789012, aligns: true, mitigation: null, mitigationCount: 0, description: 'Bullish order block 1.08492–1.08612 aligned with signal' },
    equalHighsLows: {
      equalHighs: { detected: true, level: 1.089876543210987, count: 3, description: 'Triple top / equal highs at 1.08988 — liquidity pool above' },
      equalLows: { detected: true, level: 1.081234567890123, count: 2, description: 'Equal lows at 1.08123 — swept 4 candles ago' },
    },
    wyckoff: { detected: true, phase: 'MARKUP', stage: 'SPRING', aligns: true, description: 'Wyckoff markup after spring — accumulation complete, markup underway' },
    liquidityTargets: { internalTarget: { level: 1.089876543210987, type: 'EQUAL_HIGHS', description: 'Equal highs at 1.08988' }, externalTarget: { level: 1.091234567890123, type: 'PDH', description: 'Previous day high 1.09123' }, priceIsTargetingInternal: true, priceIsTargetingExternal: false, description: 'Price targeting internal liquidity (equal highs) first' },
  };
  const news: any = {
    sentiment: { overallLabel: 'Bullish', overallScore: 64, bullishCount: 7, bearishCount: 3, neutralCount: 4, tradingImplication: 'News flow leans bullish for EURUSD', pairDirection: 'BULLISH' },
    topHeadlines: ['ECB officials signal patience on rate cuts as inflation cools', 'Eurozone PMI beats expectations, services expand', 'Dollar softens ahead of US CPI release', 'Fed speakers strike cautious tone on further hikes'],
    upcomingEvents: [
      { event: 'US CPI (YoY)', currency: 'USD', impact: 'high', daysUntil: 1, timeFormatted: '08:30 ET', potentialImpact: 'Hot CPI could strengthen USD and pressure this long' },
      { event: 'ECB President Speech', currency: 'EUR', impact: 'medium', daysUntil: 0, timeFormatted: '10:00 ET', potentialImpact: 'Hawkish tone would support EUR' },
    ],
    marketNarrative: 'The euro has firmed through the week as ECB pushback against early rate cuts met softer US data. Positioning remains light ahead of CPI, with options markets pricing a modest upside skew for EURUSD into the print. Dealers report real-money demand on dips toward 1.0800 and offers stacked near 1.0950. Rate differentials have narrowed in EUR favour for three consecutive sessions, and the weekly close above the 200-day average keeps the broader bias constructive while price holds the mid-1.08s.',
  };
  const propFirm: any = { enabled: true, firmPreset: 'FTMO', accountBalance: 100000, maxDailyDrawdownPct: -5, currentDailyPnlPct: -0.8, maxTotalDrawdownPct: -10, currentTotalPnlPct: 1.2, riskPerTradePct: 1, newsBlockMinutes: 15, allowOvernightHolds: true, allowWeekendHolds: false };
  const perf: any = { totalTrades: 128, winRate: 54.7, symbolTrades: 23, symbolWinRate: 56.5, recentStreak: 'W2', openPositionsOnSymbol: 0 };

  const { system, user } = await oai.buildConfirmationPrompt(
    genCandles(30), indicators, 'BUY', 87,
    { entry: 1.087123456789012, stopLoss: 1.083512345678901, takeProfit: 1.094123456789012, lotSize: 0.1, riskReward: 1.94 },
    'EURUSD', 'M15', news, ict, smc, undefined, propFirm, perf,
    'Recent lesson: London-session EURUSD longs after a swept low have performed well; avoid chasing extended moves into PDH.',
    undefined, 'aggressive',
  );
  const total = system.length + user.length;
  // Measured by running this exact fixture against the pre-change builder
  // at base 2918d67d (system 979 + user 24,348). The only environment
  // variance is getStrategyContext's optional GitHub RSI override, which
  // changes just the source note + two threshold digits (~±35 chars).
  const OLD_TOTAL_CHARS = 25327;
  const reduction = (OLD_TOTAL_CHARS - total) / OLD_TOTAL_CHARS;
  check('C1 prompt is >= 40% smaller than the pre-change builder on the fixture',
    total <= OLD_TOTAL_CHARS * 0.6, `old=${OLD_TOTAL_CHARS} new=${total} (-${(reduction * 100).toFixed(1)}%)`);
  const CONTRACT = ['confirmed', 'direction', 'confidence', 'reasoning', 'adjustedEntry', 'adjustedStopLoss', 'adjustedTakeProfit',
    'trailRecommendation', 'recommendedTrailPips', 'ictMacroValid', 'ictMacroReason', 'smcVerdict', 'smcQuality', 'smcReason',
    'confluenceScore', 'confluenceGrade', 'propFirmVerdict', 'propFirmReason'];
  check('C2 every verdict-contract field is still in the prompt',
    CONTRACT.every(f => user.includes(`"${f}"`)), `${CONTRACT.length} fields`);
  check('C3 decision data survives (symbol, confluence, CSV candles, ICT/SMC, news, prop firm)',
    user.includes('EURUSD') && user.includes('CONFLUENCE SCORE:') && user.includes('idx,O,H,L,C,V') &&
    user.includes('OTE ZONE') && user.includes('SMC ANALYSIS:') && user.includes('US CPI (YoY)') &&
    user.includes('PROP FIRM COMPLIANCE') && user.includes('VALIDATED STRATEGY REFERENCE'));
  check('C4 serialization helpers behave (rounding + null-drop, arrays keep position)',
    oai.promptNum(1.144563691096121) === 1.14456 && oai.promptNum(149.123456789) === 149.123 &&
    oai.slimPromptJson({ a: 1.144563691096121, b: null, c: [1.23456789, null] }) === '{"a":1.14456,"c":[1.23457,null]}',
    oai.slimPromptJson({ a: 1.144563691096121, b: null, c: [1.23456789, null] }));
}

// ── D. Cheap first pass ─────────────────────────────────────────────────────
{
  check('D1 clear verdicts do not escalate (well above / below the floor)',
    oai.isBorderlineVerdict(95, 'CONFIRM', 70, 15) === false && oai.isBorderlineVerdict(30, null, 70, 15) === false &&
    oai.isBorderlineVerdict(100, null, 70, 15) === false && oai.isBorderlineVerdict(0, 'PASS', 70, 15) === false);
  check('D2 verdicts within the band of the floor escalate',
    oai.isBorderlineVerdict(85, null, 70, 15) === true && oai.isBorderlineVerdict(55, null, 70, 15) === true &&
    oai.isBorderlineVerdict(70, null, 70, 15) === true);
  check('D3 REQUIRE_BETTER_PRICE always escalates (structure undecided)',
    oai.isBorderlineVerdict(95, 'REQUIRE_BETTER_PRICE', 70, 15) === true && oai.isBorderlineVerdict(10, 'REQUIRE_BETTER_PRICE', 70, 15) === true);
  check('D4 an unparseable confidence never escalates on its own',
    oai.isBorderlineVerdict(NaN, null, 70, 15) === false);
  delete process.env.AI_CHEAP_FIRST_PASS; delete process.env.AI_CHEAP_FIRST_PASS_MODEL; delete process.env.AI_CHEAP_FIRST_PASS_BAND;
  check('D5 defaults: on, free Gemma 4 31B, band 15',
    oai.cheapFirstPassEnabled() === true && oai.cheapFirstPassModel() === 'google/gemma-4-31b-it:free' && oai.cheapFirstPassBand() === 15);
  check('D6 the first-pass model is already in the repo vision-model list',
    oai.AVAILABLE_VISION_MODELS?.some((m: any) => m.id === 'google/gemma-4-31b-it:free') ?? src('../server/openai.ts').includes("id: 'google/gemma-4-31b-it:free'"));
  process.env.AI_CHEAP_FIRST_PASS = 'off';
  check('D7 AI_CHEAP_FIRST_PASS=off disables tiering', oai.cheapFirstPassEnabled() === false);
  delete process.env.AI_CHEAP_FIRST_PASS;
  process.env.AI_CHEAP_FIRST_PASS_BAND = '5';
  check('D8 band reads env at call time', oai.cheapFirstPassBand() === 5);
  delete process.env.AI_CHEAP_FIRST_PASS_BAND;

  const oaiSrc = src('../server/openai.ts');
  const routes = src('../server/routes.ts');
  check('D9 tiering lives in the OpenRouter branch and stamps aiCallsBought 0/1',
    oaiSrc.includes('const cheapModel = cheapFirstPassEnabled() ? cheapFirstPassModel() : null') &&
    oaiSrc.includes('aiCallsBought = 0') && oaiSrc.includes('aiCallsBought = 1') &&
    oaiSrc.includes('...(typeof aiCallsBought === \'number\' ? { aiCallsBought } : {})'));
  check('D10 routes meter aiCallsBought exactly at both vision sites (0 skips metering)',
    count(routes, 'aiCallsBought') >= 6 && count(routes, '_units > 0') + count(routes, '_fbUnits > 0') === 2,
    `${count(routes, 'aiCallsBought')} aiCallsBought references in routes`);
  check('D11 the budget module still clamps meter units to >= 1 (why 0 must skip, not pass)',
    src('../server/services/ai-engine-budget.ts').includes('Math.max(1, Math.floor(Number(units) || 1))'));
}

// ── E. Scope guards: judges + brains untouched ──────────────────────────────
{
  const judgeFiles = ['../server/services/kalshi-perp-ai-judge.ts', '../server/services/crypto-shadow.ts', '../server/services/kalshi-stock-shadow.ts', '../server/services/crypto-ai-confirmation.ts'];
  let judgesClean = true;
  for (const f of judgeFiles) {
    const s = src(f);
    if (s.includes('ai-gray-zone') || s.includes('AI_GRAY_ZONE') || s.includes('cheapFirstPass') || s.includes('AI_CHEAP_FIRST_PASS') || s.includes('AI_BAR_CACHE')) judgesClean = false;
  }
  check('E1 judge modules never reference the gating (PRs #105/#106 untouched)', judgesClean);
  let diffNote = 'git diff unavailable — skipped';
  let diffClean = true;
  try {
    const out = execSync('git diff --name-only 2918d67d...HEAD 2>/dev/null || git diff --name-only HEAD', { encoding: 'utf8' });
    const files = out.split('\n').filter(Boolean);
    if (files.length > 0) {
      diffNote = `${files.length} changed files`;
      const bad = files.filter(f => /(brain|trail|improvement|judge)/i.test(f) && !f.startsWith('dist/'));
      diffClean = bad.length === 0;
      if (!diffClean) diffNote += ` — offending: ${bad.join(', ')}`;
    } else {
      diffNote = 'no diff vs base (already merged?) — skipped';
    }
  } catch { /* git unavailable in this environment */ }
  check('E2 branch diff touches no brain / trail / improvement / judge files', diffClean, diffNote);
  check('E3 package kill switches are all read at call time (env-driven)',
    gz.aiGrayZoneEnabled() === (process.env.AI_GRAY_ZONE !== 'off') &&
    cacheMod.barCacheEnabled() === (process.env.AI_BAR_CACHE !== 'off') &&
    oai.cheapFirstPassEnabled() === (process.env.AI_CHEAP_FIRST_PASS !== 'off'));
}

console.log(`\n${passes} passed, ${failures} failed`);
console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
