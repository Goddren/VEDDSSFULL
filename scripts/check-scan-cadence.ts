/**
 * Scan-cadence tuning (2026-11-15) — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-scan-cadence.ts
 *
 * Chris's direction: the Kalshi stock-perp SHADOW lane gets more scans and a
 * wider universe so it builds its record faster; the crypto engine watches a
 * hot market more continuously (wider per-cycle rotation). Cadence/coverage
 * ONLY — this suite pins both halves of that bargain:
 *   • the new cadence numbers (functional, env-driven), and
 *   • that every entry gate the tuning promised not to touch is still wired
 *     exactly as before (source pins): perp brain, VP veto, earnings
 *     blackout, funding fade, composite ≥ 72, confidence floor, liquidity
 *     floors, crypto brain gate + shadow-promotion consult.
 * It also pins that the CoinGecko budget-sized TTLs were NOT loosened (the
 * Demo plan's ~330 calls/day is the crypto side's binding external budget)
 * and that Part C stayed report-only (the FX weekend/late-session gates in
 * live-trading-engine.ts are byte-identical).
 *
 *   A. Kalshi lane cadence defaults (5-min entries, 45 open, 4/strategy).
 *   B. Kalshi cadence env overrides still win over the new defaults.
 *   C. Universe cap: 40 default, env override, garbage env → default.
 *   D. Kalshi 429/503 backoff math (Retry-After honored + capped).
 *   E. Crypto rotation knob: 10 default, env override + clamp.
 *   F. CoinGecko call-budget defaults unchanged (with and without key).
 *   G. Source pins: gates + floors intact on both engines.
 *   H. Part C report-only pins: FX weekend + late-session gates unchanged.
 */
import { readFileSync } from 'node:fs';
import { stockShadowCadence } from '../server/services/kalshi-stock-shadow';
import { maxStockPerpTickers, kalshiRetryDelayMs } from '../server/services/kalshi-perps';
import { callBudget } from '../server/services/defi-market-data';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

// Env hygiene: the knobs under test are read live from process.env, so the
// suite controls them explicitly and restores the ambient values at the end.
const KNOBS = [
  'KALSHI_STOCK_SHADOW_EVERY_MIN', 'KALSHI_STOCK_SHADOW_MAX_OPEN', 'KALSHI_STOCK_SHADOW_MAX_PER_STRATEGY',
  'KALSHI_STOCK_SHADOW_COOLDOWN_MIN', 'KALSHI_STOCK_SHADOW_MAX_TICKERS',
  'CRYPTO_MAX_SYMBOLS_PER_CYCLE', 'COINGECKO_API_KEY', 'COINGECKO_MIN_INTERVAL_MS',
  'COINGECKO_DISCOVERY_TTL_MS', 'COINGECKO_CANDLE_TTL_MS',
];
const saved = new Map(KNOBS.map((k) => [k, process.env[k]]));
function clearKnobs(): void { for (const k of KNOBS) delete process.env[k]; }
function restoreKnobs(): void {
  for (const k of KNOBS) {
    const v = saved.get(k);
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}

// A — Kalshi lane cadence defaults
clearKnobs();
{
  const c = stockShadowCadence();
  check('A1 lane tick is 5 minutes', c.tickMs === 5 * 60_000, `tickMs=${c.tickMs}`);
  check('A2 entries evaluate every 5 minutes (was 10)', c.entryEveryMs === 5 * 60_000, `entryEveryMs=${c.entryEveryMs}`);
  check('A3 max open widened to 45 (was 30)', c.maxOpen === 45, `maxOpen=${c.maxOpen}`);
  check('A4 max per strategy widened to 4 (was 3)', c.maxPerStrategy === 4, `maxPerStrategy=${c.maxPerStrategy}`);
  check('A5 re-entry cooldown unchanged at 60 minutes', c.cooldownMs === 60 * 60_000, `cooldownMs=${c.cooldownMs}`);
}

// B — Kalshi cadence env overrides
{
  process.env.KALSHI_STOCK_SHADOW_EVERY_MIN = '7';
  process.env.KALSHI_STOCK_SHADOW_MAX_OPEN = '12';
  process.env.KALSHI_STOCK_SHADOW_MAX_PER_STRATEGY = '2';
  const c = stockShadowCadence();
  check('B1 EVERY_MIN env override wins', c.entryEveryMs === 7 * 60_000);
  check('B2 MAX_OPEN env override wins', c.maxOpen === 12);
  check('B3 MAX_PER_STRATEGY env override wins', c.maxPerStrategy === 2);
  clearKnobs();
  check('B4 clearing env restores the new defaults', stockShadowCadence().entryEveryMs === 5 * 60_000);
}

// C — universe cap
clearKnobs();
{
  check('C1 universe cap defaults to 40 tickers (was 20)', maxStockPerpTickers() === 40, `=${maxStockPerpTickers()}`);
  process.env.KALSHI_STOCK_SHADOW_MAX_TICKERS = '15';
  check('C2 MAX_TICKERS env override wins', maxStockPerpTickers() === 15);
  process.env.KALSHI_STOCK_SHADOW_MAX_TICKERS = 'abc';
  check('C3 garbage MAX_TICKERS falls back to 40 (never NaN/empty universe)', maxStockPerpTickers() === 40);
  clearKnobs();
}

// D — Kalshi retry/backoff math
{
  check('D1 no Retry-After: 400ms → 800ms → 1600ms',
    kalshiRetryDelayMs(0, null) === 400 && kalshiRetryDelayMs(1, null) === 800 && kalshiRetryDelayMs(2, null) === 1600);
  check('D2 Retry-After honored', kalshiRetryDelayMs(0, 2) === 2000);
  check('D3 Retry-After capped at 5s', kalshiRetryDelayMs(0, 60) === 5000);
  check('D4 Retry-After of 0 means no wait', kalshiRetryDelayMs(1, 0) === 0);
}

// E — crypto rotation knob (functional via the scanner's exported helper)
{
  clearKnobs();
  const { maxSymbolsPerCycle } = await import('../server/services/cryptocom-scanner');
  check('E1 rotation defaults to 10 symbols/cycle (was 5)', maxSymbolsPerCycle() === 10, `=${maxSymbolsPerCycle()}`);
  process.env.CRYPTO_MAX_SYMBOLS_PER_CYCLE = '6';
  check('E2 CRYPTO_MAX_SYMBOLS_PER_CYCLE override wins', maxSymbolsPerCycle() === 6);
  process.env.CRYPTO_MAX_SYMBOLS_PER_CYCLE = '99';
  check('E3 rotation clamped at 25', maxSymbolsPerCycle() === 25);
  process.env.CRYPTO_MAX_SYMBOLS_PER_CYCLE = 'abc';
  check('E4 garbage rotation env falls back to 10', maxSymbolsPerCycle() === 10);
  clearKnobs();
}

// F — CoinGecko budget defaults NOT loosened
{
  clearKnobs();
  process.env.COINGECKO_API_KEY = 'test-key';
  const withKey = callBudget();
  check('F1 with key: call spacing still 2.1s (documented 30/min tier)', withKey.minIntervalMs === 2100);
  check('F2 with key: discovery TTL still 60 min (monthly-cap sized)', withKey.discoveryTtlMs === 60 * 60_000);
  check('F3 with key: candle TTL still 10 min', withKey.candleTtlMs === 10 * 60_000);
  clearKnobs();
  const noKey = callBudget();
  check('F4 no key: crawl spacing still 15s', noKey.minIntervalMs === 15_000);
  check('F5 no key: discovery TTL still 6h, candle TTL still 30 min',
    noKey.discoveryTtlMs === 6 * 60 * 60_000 && noKey.candleTtlMs === 30 * 60_000);
  clearKnobs();
}

// G — source pins: the gates this tuning promised not to touch
{
  const lane = readFileSync(new URL('../server/services/kalshi-stock-shadow.ts', import.meta.url), 'utf8');
  const perps = readFileSync(new URL('../server/services/kalshi-perps.ts', import.meta.url), 'utf8');
  const scanner = readFileSync(new URL('../server/services/cryptocom-scanner.ts', import.meta.url), 'utf8');
  check('G1 perp brain gate still consulted before insert', lane.includes('evaluatePerpBrainGate(stats, sig.strategy'));
  check('G2 VP value-edge veto still consulted', lane.includes('vpValueEdgeBlock(sig.direction, entry, vpProfile, atr)'));
  check('G3 earnings blackout still consulted', lane.includes('earningsBlockApplies(eInfo, now, earningsWindowH())'));
  check('G4 funding fade still feeds the same entry machinery', lane.includes('fundingFadeForTicker(mkt.ticker, fundingBook)'));
  check('G5 composite rule unchanged (≥2 agree, blend ≥ 72)', lane.includes('blend >= 72') && lane.includes('compositeMinEdgeScore: 72'));
  check('G6 confidence floor default unchanged (70)', lane.includes("num('KALSHI_STOCK_SHADOW_MIN_CONFIDENCE', 70)"));
  check('G7 cost floor unchanged (stop < 3× round-trip cost skips)', lane.includes('slPct < 3 * (costBps / 100)'));
  check('G8 liquidity floors unchanged ($25k vol / $10k OI)',
    perps.includes("KALSHI_STOCK_SHADOW_MIN_VOL24_USD ?? 25_000") && perps.includes("KALSHI_STOCK_SHADOW_MIN_OI_USD ?? 10_000"));
  check('G9 lane is still shadow-only (no order path in the lane file)', !/placeOrder|submitOrder|createOrder/.test(lane));
  check('G10 lane tick has the overlap guard', lane.includes('_tickInFlight'));
  check('G11 Kalshi reads retry on 429/503 with the pinned backoff',
    perps.includes('res.status === 429 || res.status === 503') && perps.includes('kalshiRetryDelayMs(attempt'));
  check('G12 crypto brain gate still consulted on live entries', scanner.includes('cryptoBrainGate(userId, symbol, result.strategy'));
  check('G13 crypto shadow-promotion consult still wired (PR #77)', scanner.includes("import('./crypto-shadow-promotions')"));
  check('G14 crypto shadow lane still invoked per cycle (PR #68)', scanner.includes('runCryptoShadowAll(userId, config'));
  check('G15 rotation site reads the knob (no stale constant)', scanner.includes('const maxPerCycle = maxSymbolsPerCycle();') && !scanner.includes('MAX_SYMBOLS_PER_CYCLE = 5'));
  check('G16 per-user scan throttle floor unchanged (60s min)', scanner.includes('MIN_SCAN_INTERVAL_MS = 60000'));
}

// H — Part C stayed report-only: FX gates byte-identical
{
  const fx = readFileSync(new URL('../server/services/live-trading-engine.ts', import.meta.url), 'utf8');
  check('H1 FX weekend gate unchanged (Fri 21:00 → Sun 21:00 UTC)',
    fx.includes('return d === 6 || (d === 5 && h >= 21) || (d === 0 && h < 21);'));
  check('H2 late-session block unchanged (21:00–24:00 UTC, kill switch intact)',
    fx.includes("process.env.LATE_SESSION_BLOCK !== 'off' && _n.getUTCHours() >= 21"));
}

restoreKnobs();
console.log(`\n${total - failures}/${total} checks passed${failures ? ` — ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
