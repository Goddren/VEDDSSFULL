// Tests for the paper-trade journal maths. Run: npx tsx --test server/services/paper-trade-math.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candleStart, validEntry, validLevels, firstHit, resolveOutcome } from './paper-trade-math';

const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 30, 10, 0);
const bar = (minAfter: number, low: number, high: number) => ({ timestamp: T0 + minAfter * 60_000, low, high });

test('candleStart buckets by timeframe; unknown counts as H1', () => {
  const t = T0 + 37 * 60_000; // 10:37
  assert.equal(candleStart('H1', t), T0);
  assert.equal(candleStart('M15', t), T0 + 30 * 60_000);
  assert.equal(candleStart('H4', t), Date.UTC(2026, 9, 30, 8, 0));
  assert.equal(candleStart('weird', t), T0);
});

test('validEntry rejects 0, negatives and non-numbers', () => {
  assert.equal(validEntry(0), false);
  assert.equal(validEntry(-1), false);
  assert.equal(validEntry(NaN), false);
  assert.equal(validEntry(undefined), false);
  assert.equal(validEntry(1.1), true);
});

test('validLevels needs stop and target on the right sides', () => {
  assert.deepEqual(validLevels('BUY', 1.1, 1.09, 1.12), { sl: 1.09, tp: 1.12 });
  assert.deepEqual(validLevels('SELL', 1.1, 1.11, 1.08), { sl: 1.11, tp: 1.08 });
  assert.equal(validLevels('BUY', 1.1, 1.11, 1.12), null);   // stop above a BUY entry
  assert.equal(validLevels('SELL', 1.1, 1.09, 1.08), null);  // stop below a SELL entry
  assert.equal(validLevels('BUY', 1.1, 0, 1.12), null);
  assert.equal(validLevels('BUY', 1.1, undefined, 1.12), null);
});

test('firstHit: target first, stop first, a bar spanning both counts as the stop', () => {
  assert.equal(firstHit([bar(5, 1.099, 1.121), bar(0, 1.095, 1.105)], 'BUY', 1.09, 1.12, T0), 'tp');
  assert.equal(firstHit([bar(0, 1.089, 1.105), bar(5, 1.10, 1.13)], 'BUY', 1.09, 1.12, T0), 'sl');
  assert.equal(firstHit([bar(0, 1.08, 1.13)], 'BUY', 1.09, 1.12, T0), 'sl');
  assert.equal(firstHit([bar(0, 1.079, 1.105)], 'SELL', 1.11, 1.08, T0), 'tp');
  assert.equal(firstHit([bar(0, 1.095, 1.105)], 'BUY', 1.09, 1.12, T0), null);
});

test('firstHit ignores bars that opened before the trade', () => {
  assert.equal(firstHit([bar(-5, 1.08, 1.13), bar(0, 1.095, 1.105)], 'BUY', 1.09, 1.12, T0), null);
});

test('resolveOutcome: win pays the target in real pips per instrument', () => {
  const eur = resolveOutcome({ symbol: 'EURUSD', direction: 'BUY', entryPrice: 1.1, stopLoss: 1.099, takeProfit: 1.102, openedAt: T0 },
    [bar(5, 1.0995, 1.1021)], 1.1015, T0 + H);
  assert.equal(eur?.outcome, 'win');
  assert.equal(eur?.pnlPips, 20);
  const jpy = resolveOutcome({ symbol: 'USDJPY', direction: 'SELL', entryPrice: 157.5, stopLoss: 157.8, takeProfit: 157.0, openedAt: T0 },
    [bar(5, 157.4, 157.85)], 157.6, T0 + H);
  assert.equal(jpy?.outcome, 'loss');
  assert.equal(jpy?.pnlPips, -30);
  const gold = resolveOutcome({ symbol: 'XAUUSD', direction: 'BUY', entryPrice: 4000, stopLoss: 3990, takeProfit: 4020, openedAt: T0 },
    [bar(5, 3995, 4021)], 4010, T0 + H);
  assert.equal(gold?.pnlPips, 200); // $20 at $0.10 a pip
});

test('resolveOutcome: open until 24h, then breakeven (expired) at the current price', () => {
  const t = { symbol: 'EURUSD', direction: 'BUY', entryPrice: 1.1, stopLoss: 1.09, takeProfit: 1.12, openedAt: T0 };
  const quiet = [bar(5, 1.098, 1.104)];
  assert.equal(resolveOutcome(t, quiet, 1.103, T0 + 23 * H), null);
  const r = resolveOutcome(t, quiet, 1.103, T0 + 24 * H);
  assert.equal(r?.outcome, 'breakeven');
  assert.equal(r?.pnlPips, 30);
  assert.match(r?.note || '', /expired/);
});

test('resolveOutcome: no valid stop/target falls back to the 24h price, ±5 pips', () => {
  const t = { symbol: 'EURUSD', direction: 'SELL', entryPrice: 1.1, stopLoss: null, takeProfit: null, openedAt: T0 };
  assert.equal(resolveOutcome(t, [], 1.098, T0 + 2 * H), null);
  assert.equal(resolveOutcome(t, [], 1.098, T0 + 24 * H)?.outcome, 'win');
  assert.equal(resolveOutcome(t, [], 1.1003, T0 + 24 * H)?.outcome, 'breakeven');
  assert.equal(resolveOutcome(t, [], 1.101, T0 + 24 * H)?.outcome, 'loss');
});
