/**
 * SP500 + cross-broker alias parity — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-fx-sp500-alias-parity.ts
 *
 * No database, broker, or market-data calls: everything exercised here is
 * pure (canonicalisation, asset-type routing, pip math, ORB candle math,
 * broker alias tables) plus source pins for the broker-facing call sites
 * that can't run without a live account (DXtrade / MT5 EA / AI prompt).
 *
 * The bug class: brokers name the same index differently — SPX500 on one,
 * SP500 on the next, US500/SPX on a third. Every table keyed by ONE name
 * silently missed the others: a config saying SP500 got no ORB candles
 * from an MT5 chart posting SPX500, no TradeLocker candle/order match,
 * no DXtrade instrument spec, forex ORB thresholds in the AI scorer, and
 * no FX Models exclusion mechanics — while US30/NAS100 (PR #86) worked.
 *
 *   A. canonicalIndexSymbol / indexSymbolVariants — the whole S&P family
 *      resolves to US500; NAS100/US30 families to their canonicals;
 *      non-index symbols pass through untouched; variant sets are
 *      identical whichever family name you start from.
 *   B. detectAssetType — SP500/SPX500/SPX/US500 all route to 'index',
 *      neighbours unchanged.
 *   C. Pip math — 1 point = 1 pip, $1 per point for the whole family.
 *   D. ORB state from synthetic SP500 candles (~5,900) — range in POINTS,
 *      breakout + retest, the same math US30/NAS100 run.
 *   E. TradeLocker — candle variants resolve via canonical for ANY family
 *      name; the order path canonicalises its alias lookup (source pin).
 *   F. Engine ORB candle source — wanted-set built from variants
 *      (source pin) + INDEX_BROKER_ALIASES covers the family.
 *   G. DXtrade — findInstrument + alias-family position matching +
 *      engine resolves the broker's own name (source pins).
 *   H. FX Models — SP500/SPX500/US500 share US30/NAS100's M1 exclusion
 *      mechanics via isExcludedPair.
 *   I. AI ORB thresholds canonicalised (source pin).
 *   J. MT5 EAs + Strategy Studio EA generator resolve/recognise the
 *      family (source pins).
 */

import { readFileSync } from 'fs';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const has = (arr: string[], ...names: string[]) => names.every(n => arr.includes(n));
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(x => b.includes(x));

const { canonicalIndexSymbol, indexSymbolVariants, INDEX_SYMBOL_ALIASES } = await import('../server/utils/symbolAliases');
const { marketDataService } = await import('../server/market-data/service');
const { getPipSize, getPipValue } = await import('../server/utils/pipUtils');
const { TL_CANDLE_SYMBOL_ALIASES, tlCandleVariants } = await import('../server/tradelocker');
const { INDEX_BROKER_ALIASES, computeOrbStateFromCandles, getNYTime } = await import('../server/services/live-trading-engine');
const { isExcludedPair } = await import('../server/services/fx-models');

// ── A. Canonicalisation ──────────────────────────────────────────────────────
for (const sym of ['SP500', 'SPX500', 'SPX', 'US500', 'SPXUSD', 'SP500USD', 'US500CASH', 'sp500']) {
  check(`A canonicalIndexSymbol(${sym}) === 'US500'`, canonicalIndexSymbol(sym) === 'US500',
    `got '${canonicalIndexSymbol(sym)}'`);
}
for (const sym of ['USTEC', 'NASDAQ100', 'NQ100', 'US100', 'NAS100']) {
  check(`A canonicalIndexSymbol(${sym}) === 'NAS100'`, canonicalIndexSymbol(sym) === 'NAS100',
    `got '${canonicalIndexSymbol(sym)}'`);
}
for (const sym of ['WS30', 'DJI30', 'WALLST30', 'DJ30', 'US30']) {
  check(`A canonicalIndexSymbol(${sym}) === 'US30'`, canonicalIndexSymbol(sym) === 'US30',
    `got '${canonicalIndexSymbol(sym)}'`);
}
check("A canonicalIndexSymbol(EURUSD) passes through", canonicalIndexSymbol('EURUSD') === 'EURUSD');
check("A canonicalIndexSymbol(XAUUSD) passes through", canonicalIndexSymbol('XAUUSD') === 'XAUUSD');
check("A canonicalIndexSymbol(BTCUSD) passes through", canonicalIndexSymbol('BTCUSD') === 'BTCUSD');
check('A variant sets identical from SP500 / SPX500 / US500',
  sameSet(indexSymbolVariants('SP500'), indexSymbolVariants('US500')) &&
  sameSet(indexSymbolVariants('SPX500'), indexSymbolVariants('US500')));
check('A variants(SP500) cover the S&P family',
  has(indexSymbolVariants('SP500'), 'US500', 'SP500', 'SPX500', 'SPX'));
check('A variants(USTEC) cover the Nasdaq family',
  has(indexSymbolVariants('USTEC'), 'NAS100', 'NASDAQ100', 'NQ100', 'US100'));
check('A variants(WS30) cover the Dow family',
  has(indexSymbolVariants('WS30'), 'US30', 'DJI30', 'WALLST30'));
check('A variants(EURUSD) is just itself', sameSet(indexSymbolVariants('EURUSD'), ['EURUSD']));
check('A INDEX_SYMBOL_ALIASES.US500 contains SP500 + SPX500',
  has(INDEX_SYMBOL_ALIASES.US500, 'SP500', 'SPX500', 'SPX'));

// ── B. Asset-type routing ────────────────────────────────────────────────────
for (const sym of ['SP500', 'SPX500', 'SPX', 'US500']) {
  check(`B detectAssetType(${sym}) === 'index'`, marketDataService.detectAssetType(sym) === 'index',
    `got '${marketDataService.detectAssetType(sym)}'`);
}
check("B detectAssetType(EURUSD) === 'forex'", marketDataService.detectAssetType('EURUSD') === 'forex');
check("B detectAssetType(XAUUSD) === 'forex'", marketDataService.detectAssetType('XAUUSD') === 'forex');
check("B detectAssetType(BTCUSD) === 'crypto'", marketDataService.detectAssetType('BTCUSD') === 'crypto');
check("B detectAssetType(US30) === 'index'", marketDataService.detectAssetType('US30') === 'index');
check("B detectAssetType(NAS100) === 'index'", marketDataService.detectAssetType('NAS100') === 'index');

// ── C. Pip / risk math in points ─────────────────────────────────────────────
for (const sym of ['SP500', 'SPX500', 'US500']) {
  check(`C getPipSize(${sym}) === 1`, getPipSize(sym) === 1, `got ${getPipSize(sym)}`);
  check(`C getPipValue(${sym}) === $1`, getPipValue(sym) === 1, `got ${getPipValue(sym)}`);
}

// ── D. ORB state from synthetic SP500 candles ────────────────────────────────
type Candle = { t: number; o: number; h: number; l: number; c: number; v: number };
function nyWallToUtcMs(dateStr: string, h: number, mi: number): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  let t = Date.UTC(y, mo - 1, d, h, mi);
  const got = getNYTime(t);
  t += ((h * 60 + mi) - (got.hour * 60 + got.minute)) * 60000;
  return t;
}
function buildCandles(dateStr: string, spec: Array<[number, number, number, number, number, number]>): Candle[] {
  const oldestFirst = spec.map(([h, mi, o, hi, lo, c]) => ({
    t: Math.floor(nyWallToUtcMs(dateStr, h, mi) / 1000), o, h: hi, l: lo, c, v: 100,
  }));
  for (const c of oldestFirst) {
    if (getNYTime(c.t * 1000).dateStr !== dateStr) throw new Error(`candle date mismatch for ${dateStr}`);
  }
  return [...oldestFirst].reverse(); // newest-first, the OrbCandle contract
}
const DAY = '2026-11-16';
// S&P 500: 9:30–9:45 range 5,940–5,952 (12 points). Closed 10:00 body fully
// above the high (BUY breakout); live 10:05 candle skipped; price 5,953 is
// inside the ±25%-of-range retest band around 5,952.
const spx = buildCandles(DAY, [
  [9, 30, 5946, 5952, 5941, 5949],
  [9, 35, 5949, 5951, 5940, 5943],
  [9, 40, 5943, 5948, 5942, 5946],
  [10, 0, 5956, 5966, 5954, 5962],
  [10, 5, 5958, 5960, 5950, 5953], // live candle (skipped for breakout)
]);
const spxState = computeOrbStateFromCandles(spx, 5953, DAY);
check('D SP500 range high/low from the 9:30–9:45 bars', spxState.orbHigh === 5952 && spxState.orbLow === 5940,
  `got ${spxState.orbLow}–${spxState.orbHigh}`);
check('D SP500 range is 12 POINTS', spxState.range === 12, `got ${spxState.range}`);
check('D SP500 breakout is BUY', spxState.breakoutDir === 'BUY', `got ${spxState.breakoutDir}`);
check('D SP500 phase is retest at 5,953', spxState.phase === 'retest' && spxState.retestActive,
  `got ${spxState.phase}`);
check('D SP500 ORB SL distance is 13.2 pips (points), not 132,000',
  Math.abs((spxState.range * 1.1) / getPipSize('SP500') - 13.2) < 1e-9,
  `got ${(spxState.range * 1.1) / getPipSize('SP500')}`);

// ── E. TradeLocker parity ────────────────────────────────────────────────────
check('E TL_CANDLE_SYMBOL_ALIASES.US500 covers SPX500/SP500/SPX',
  has(TL_CANDLE_SYMBOL_ALIASES.US500, 'SPX500', 'SP500', 'SPX'));
check('E tlCandleVariants(SP500) covers the family',
  has(tlCandleVariants('SP500'), 'US500', 'SPX500', 'SPX'));
check('E tlCandleVariants(SPX500) covers the family',
  has(tlCandleVariants('SPX500'), 'US500', 'SP500', 'SPX'));
check('E tlCandleVariants(USTEC) covers the Nasdaq family',
  has(tlCandleVariants('USTEC'), 'NAS100', 'NASDAQ100', 'NQ100'));
check('E tlCandleVariants(WS30) covers the Dow family',
  has(tlCandleVariants('WS30'), 'US30', 'DJI30', 'WALLST30'));
check('E tlCandleVariants(XAUUSD) still covers GOLD', has(tlCandleVariants('XAUUSD'), 'GOLD'));
const tlSrc = readFileSync(new URL('../server/tradelocker.ts', import.meta.url), 'utf8');
check('E TL order path resolves aliases via canonical symbol (source pin)',
  tlSrc.includes('ALIASES[canonicalIndexSymbol(sym)]') && tlSrc.includes('indexSymbolVariants(sym)'));

// ── F. Engine ORB candle source ──────────────────────────────────────────────
check('F INDEX_BROKER_ALIASES.US500 covers SP500/SPX500/SPX',
  has(INDEX_BROKER_ALIASES.US500, 'SP500', 'SPX500', 'SPX'));
const engineSrc = readFileSync(new URL('../server/services/live-trading-engine.ts', import.meta.url), 'utf8');
check('F getBrokerIndexCandles wanted-set built from indexSymbolVariants (source pin)',
  engineSrc.includes('indexSymbolVariants(symbol)'));

// ── G. DXtrade ───────────────────────────────────────────────────────────────
const dxSrc = readFileSync(new URL('../server/dxtrade.ts', import.meta.url), 'utf8');
check('G DxtradeService.findInstrument exists (source pin)', dxSrc.includes('async findInstrument('));
check('G executeSignalOnDxtrade matches positions by alias family (source pin)',
  dxSrc.includes('indexSymbolVariants(symbol)'));
check('G engine DX open path resolves the broker name via findInstrument (source pin)',
  engineSrc.includes('svc.findInstrument(dxSymbol)') && engineSrc.includes('_dxWireSymbol'));

// ── H. FX Models exclusion parity ────────────────────────────────────────────
check("H isExcludedPair('M1','SP500') === true", isExcludedPair('M1', 'SP500') === true);
check("H isExcludedPair('M1','SPX500') === true", isExcludedPair('M1', 'SPX500') === true);
check("H isExcludedPair('M1','US500') === true", isExcludedPair('M1', 'US500') === true);
check("H isExcludedPair('M1','US30') === true", isExcludedPair('M1', 'US30') === true);
check("H isExcludedPair('M1','NAS100') === true", isExcludedPair('M1', 'NAS100') === true);
check("H isExcludedPair('M1','EURUSD') === false", isExcludedPair('M1', 'EURUSD') === false);
check("H isExcludedPair('M2','SP500') === false", isExcludedPair('M2', 'SP500') === false);

// ── I. AI ORB thresholds ─────────────────────────────────────────────────────
const openaiSrc = readFileSync(new URL('../server/openai.ts', import.meta.url), 'utf8');
check('I analyzeORBSignal canonicalises the symbol (source pin)',
  openaiSrc.includes('canonicalIndexSymbol(params.symbol)'));

// ── J. MT5 EAs + generated EA pip size ───────────────────────────────────────
for (const ea of ['VEDD_Signal_Receiver_EA.mq5', 'VEDD_Combined_EA.mq5', 'VEDD_Combined_EA.mq4']) {
  const src = readFileSync(new URL(`../public/downloads/${ea}`, import.meta.url), 'utf8');
  check(`J ${ea} resolves the index alias family in NormalizeSymbol`,
    src.includes('ResolveIndexAlias') && src.includes('"SPX500"') && src.includes('"SP500"'));
}
const specEaSrc = readFileSync(new URL('../server/services/spec-ea-generator.ts', import.meta.url), 'utf8');
check('J Strategy Studio EA PipSize recognises SP500/SPX (source pin)',
  specEaSrc.includes('StringFind(s, "SP500")') && specEaSrc.includes('StringFind(s, "SPX")'));

// ── K. Service worker ────────────────────────────────────────────────────────
const sw = readFileSync(new URL('../client/public/sw.js', import.meta.url), 'utf8');
check("K sw bumped for the EA-download change", sw.includes("CACHE_VERSION = 'vedd-v296'"));

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
