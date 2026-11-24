/**
 * Index data Yahoo-primary — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-index-data-yahoo.ts
 *
 * The bug: the account's Twelve Data plan excludes indices, so US30/DJI
 * 404'd on every call. The OHLCV path tried Twelve Data FIRST and Yahoo
 * only in the catch — and rethrew the raw 404 whenever Yahoo returned
 * nothing (throttled, or its by-design stale-bar refusal outside cash
 * hours), so the live engine's scan loop surfaced "Scan failed: Twelve
 * Data API error: 404 Not Found" for US30 on every scan. The ATR path
 * (TwelveDataProvider.fetchATR, used by /api/market-data/atr) had no
 * Yahoo fallback at all, and that route's local asset-type inference
 * never returned 'index' in the first place.
 *
 *   A. yahooIndexSymbol — pure symbol mapping.
 *   B. computeAtrFromBars — pure TR/ATR math.
 *   C. fetchMarketData, index, default order — Yahoo serves, Twelve Data
 *      is never called (stub provider + stubbed fetch, no network).
 *   D. Kill switch INDEX_YAHOO_PRIMARY=off — Twelve Data is tried first
 *      again, Yahoo still rescues.
 *   E. Both sources down — ONE clear 'Index data unavailable' error
 *      naming the symbol and both sources, never the raw provider 404.
 *   F. Non-index routing unchanged — provider serves forex; a forex
 *      failure still rethrows the raw provider error byte-identically.
 *   G. fetchATR — index ATR from Yahoo candles (no Twelve Data HTTP),
 *      both-down combined error, kill switch restores Twelve Data first,
 *      forex ATR untouched.
 *   H. Source pins for the wiring that can't run offline (routes.ts).
 */

import { readFileSync } from 'fs';

let failures = 0;
function check(name: string, cond: boolean) {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name}`); }
}

// ── Network stubs ────────────────────────────────────────────────────────
// fetchIndexFromYahoo is the only global-fetch consumer on the Yahoo side;
// the Twelve Data provider paths exercised here go through global fetch
// too (/atr, /price). The market-data SERVICE tests use an in-memory stub
// provider instead, so no Twelve Data HTTP happens there at all.
let yahooMode: 'ok' | 'down' = 'ok';
let tdHttpMode: 'ok' | '404' = 'ok';
let yahooFetchCalls = 0;
let tdHttpCalls = 0;

function yahooChartJson(barCount: number, stepSec: number) {
  const nowSec = Math.floor(Date.now() / 1000);
  const timestamp: number[] = [];
  const open: number[] = [], high: number[] = [], low: number[] = [], close: number[] = [], volume: number[] = [];
  for (let i = 0; i < barCount; i++) {
    const c = 40000 + i; // TR of every bar = max(5, 3, 2) = 5 by construction
    timestamp.push(nowSec - (barCount - 1 - i) * stepSec);
    open.push(c - 1); high.push(c + 2); low.push(c - 3); close.push(c); volume.push(1000);
  }
  return { chart: { result: [{ timestamp, indicators: { quote: [{ open, high, low, close, volume }] } }] } };
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any) => {
  const u = String(url);
  if (u.includes('query1.finance.yahoo.com')) {
    yahooFetchCalls++;
    if (yahooMode === 'down') return { ok: false, status: 429, statusText: 'Too Many Requests', json: async () => ({}) };
    const isDaily = u.includes('interval=1d');
    return { ok: true, status: 200, statusText: 'OK', json: async () => yahooChartJson(40, isDaily ? 86400 : 900) };
  }
  if (u.includes('api.twelvedata.com')) {
    tdHttpCalls++;
    if (tdHttpMode === '404') return { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    if (u.includes('/atr')) return { ok: true, status: 200, statusText: 'OK', json: async () => ({ values: [{ atr: '2.5' }] }) };
    if (u.includes('/price')) return { ok: true, status: 200, statusText: 'OK', json: async () => ({ price: '1.1000' }) };
    return { ok: false, status: 400, statusText: 'Bad Request', json: async () => ({}) };
  }
  throw new Error(`unstubbed fetch in check: ${u}`);
}) as any;

const { marketDataService } = await import('../server/market-data/service');
const { marketDataCache } = await import('../server/market-data/cache');
const { TwelveDataProvider } = await import('../server/market-data/providers/twelve-data');
const { yahooIndexSymbol, computeAtrFromBars } = await import('../server/market-data/yahoo-index');

// ── A. Pure symbol mapping ───────────────────────────────────────────────
check("A yahooIndexSymbol('US30') === '^DJI'", yahooIndexSymbol('US30') === '^DJI');
check("A yahooIndexSymbol('WS30') === '^DJI'", yahooIndexSymbol('WS30') === '^DJI');
check("A yahooIndexSymbol('NAS100') === '^NDX'", yahooIndexSymbol('NAS100') === '^NDX');
check("A yahooIndexSymbol('SP500') === '^GSPC'", yahooIndexSymbol('SP500') === '^GSPC');
check("A yahooIndexSymbol('EURUSD') === null", yahooIndexSymbol('EURUSD') === null);
check("A yahooIndexSymbol('AAPL') === null", yahooIndexSymbol('AAPL') === null);

// ── B. Pure ATR math ─────────────────────────────────────────────────────
const flatBars = Array.from({ length: 20 }, (_, i) => ({
  timestamp: i * 900_000, open: 40000 + i - 1, high: 40000 + i + 2, low: 40000 + i - 3, close: 40000 + i, volume: 1,
}));
const atrCalc = computeAtrFromBars(flatBars as any, 14);
check('B computeAtrFromBars TR=5 bars → atr 5', atrCalc !== null && atrCalc.atr === 5);
check('B computeAtrFromBars currentPrice = last close', atrCalc !== null && atrCalc.currentPrice === 40019);
check('B computeAtrFromBars <2 bars → null', computeAtrFromBars([flatBars[0]] as any, 14) === null);

// ── Stub Twelve Data provider for the service tests ─────────────────────
let tdMode: 'ok' | '404' = '404';
let stubTdCalls = 0;
const stubProvider = {
  name: 'stubtd',
  supportedAssets: ['forex', 'stock', 'crypto', 'index', 'futures'],
  isSymbolSupported: () => true,
  fetchOHLCV: async () => {
    stubTdCalls++;
    if (tdMode === '404') throw new Error('Twelve Data API error: 404 Not Found');
    return flatBars;
  },
};
marketDataService.registerProvider(stubProvider as any, true);

delete process.env.INDEX_YAHOO_PRIMARY;

// ── C. Index, default order: Yahoo primary ───────────────────────────────
marketDataCache.clear();
stubTdCalls = 0; yahooFetchCalls = 0; yahooMode = 'ok'; tdMode = '404';
const cRes = await marketDataService.fetchMarketData({ symbol: 'US30', assetType: 'index', timeframe: '15m', limit: 50 } as any);
check("C index US30 served by Yahoo (provider 'yahoo-index')", cRes.provider === 'yahoo-index');
check('C index US30 returned bars', cRes.bars.length === 40);
check('C Twelve Data never called when Yahoo serves', stubTdCalls === 0);
check('C Yahoo was called', yahooFetchCalls === 1);

// ── D. Kill switch: Twelve Data first again ──────────────────────────────
process.env.INDEX_YAHOO_PRIMARY = 'off';
marketDataCache.clear();
stubTdCalls = 0; yahooMode = 'ok'; tdMode = '404';
const dRes = await marketDataService.fetchMarketData({ symbol: 'US30', assetType: 'index', timeframe: '15m', limit: 50 } as any);
check('D kill-switch: Twelve Data tried first (1 call)', stubTdCalls === 1);
check("D kill-switch: Yahoo still rescues (provider 'yahoo-index')", dRes.provider === 'yahoo-index');
delete process.env.INDEX_YAHOO_PRIMARY;

// ── E. Both sources down: one clear combined error ───────────────────────
marketDataCache.clear();
yahooMode = 'down'; tdMode = '404';
let eErr: Error | null = null;
try {
  await marketDataService.fetchMarketData({ symbol: 'NAS100', assetType: 'index', timeframe: '15m', limit: 50 } as any);
} catch (err: any) { eErr = err; }
check('E both-down throws', eErr !== null);
check("E error names the symbol and both sources",
  !!eErr && eErr.message.startsWith('Index data unavailable for NAS100: Yahoo returned no data and Twelve Data failed ('));
check('E error is not the raw provider 404', !!eErr && eErr.message !== 'Twelve Data API error: 404 Not Found');
yahooMode = 'ok';

// ── F. Non-index routing unchanged ───────────────────────────────────────
marketDataCache.clear();
stubTdCalls = 0; yahooFetchCalls = 0; tdMode = 'ok';
const fRes = await marketDataService.fetchMarketData({ symbol: 'EURUSD', assetType: 'forex', timeframe: '15m', limit: 50 } as any);
check("F forex served by the provider (provider 'stubtd')", fRes.provider === 'stubtd');
check('F forex never touches Yahoo', yahooFetchCalls === 0);
tdMode = '404';
let fErr: Error | null = null;
try {
  await marketDataService.fetchMarketData({ symbol: 'GBPUSD', assetType: 'forex', timeframe: '15m', limit: 50 } as any);
} catch (err: any) { fErr = err; }
check('F forex failure rethrows the raw provider error byte-identically',
  !!fErr && fErr.message === 'Twelve Data API error: 404 Not Found');

// ── G. fetchATR ──────────────────────────────────────────────────────────
const td = new TwelveDataProvider('check-key');
tdHttpCalls = 0; yahooMode = 'ok'; tdHttpMode = 'ok';
const g1 = await td.fetchATR('US30', 'index', '1d', 14);
check('G index ATR from Yahoo candles (atr = 5)', g1.atr === 5);
check('G index ATR currentPrice = last Yahoo close', g1.currentPrice === 40000 + 39 - 0 && g1.currentPrice > 40000);
check('G index ATR suggestedSL = 2x/1.5x/1x', g1.suggestedSL.conservative === 10 && g1.suggestedSL.moderate === 7.5 && g1.suggestedSL.aggressive === 5);
check('G index ATR made no Twelve Data HTTP calls', tdHttpCalls === 0);

yahooMode = 'down'; tdHttpMode = '404';
let gErr: Error | null = null;
try { await td.fetchATR('NAS100', 'index', '1d', 14); } catch (err: any) { gErr = err; }
check('G index ATR both-down throws the combined error',
  !!gErr && gErr.message.startsWith('Index data unavailable for NAS100: Yahoo returned no data and Twelve Data failed ('));
yahooMode = 'ok'; tdHttpMode = 'ok';

const g3 = await td.fetchATR('EURUSD', 'forex', '1d', 14);
check('G forex ATR still from Twelve Data (atr = 2.5)', g3.atr === 2.5 && g3.currentPrice === 1.1);
check('G forex ATR still returns suggestedSLPips', !!g3.suggestedSLPips && g3.suggestedSLPips.conservative > 0);

process.env.INDEX_YAHOO_PRIMARY = 'off';
tdHttpCalls = 0;
const g4 = await td.fetchATR('GER40', 'index', '1d', 14);
check('G kill-switch: index ATR served by Twelve Data first (atr = 2.5)', g4.atr === 2.5 && tdHttpCalls > 0);
delete process.env.INDEX_YAHOO_PRIMARY;

// ── H. Source pins ───────────────────────────────────────────────────────
const serviceSrc = readFileSync(new URL('../server/market-data/service.ts', import.meta.url), 'utf8');
const tdSrc = readFileSync(new URL('../server/market-data/providers/twelve-data.ts', import.meta.url), 'utf8');
const routesSrc = readFileSync(new URL('../server/routes.ts', import.meta.url), 'utf8');
const yahooSrc = readFileSync(new URL('../server/market-data/yahoo-index.ts', import.meta.url), 'utf8');
check('H service routes index through fetchIndexMarketData', serviceSrc.includes('fetchIndexMarketData'));
check('H service honours the INDEX_YAHOO_PRIMARY kill switch', serviceSrc.includes("process.env.INDEX_YAHOO_PRIMARY !== 'off'"));
check('H service combined-error shape', serviceSrc.includes('Index data unavailable for ${request.symbol}: Yahoo returned no data and Twelve Data failed'));
check('H Yahoo fetcher moved out of service.ts', !serviceSrc.includes('query1.finance.yahoo.com') && yahooSrc.includes('query1.finance.yahoo.com'));
check('H provider ATR Yahoo path + combined error', tdSrc.includes('fetchIndexATRFromYahoo') && tdSrc.includes('Index data unavailable for ${symbol}: Yahoo returned no data and Twelve Data failed'));
check('H routes ATR endpoint classifies indices via detectAssetType',
  routesSrc.includes("detectAssetType(symbol) === 'index' ? 'index' : inferAssetType(symbol)"));
check('H source-evidence logging wired (logIndexSource)', serviceSrc.includes('logIndexSource') && tdSrc.includes('logIndexSource'));

globalThis.fetch = realFetch;
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
