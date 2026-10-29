// Tests for detectFairValueGap. Run: npx tsx --test server/utils/smcUtils.fvg.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectFairValueGap } from './smcUtils';

type C = { o: number; h: number; l: number; c: number };
const bar = (l: number, h: number, c = (l + h) / 2): C => ({ o: c, h, l, c });
// Write candles oldest → newest for readability; the detector wants newest first.
const newestFirst = (oldestFirst: C[]) => [...oldestFirst].reverse();
const flat = (n: number, l = 1.0, h = 1.001) => Array.from({ length: n }, () => bar(l, h));

test('returns the most recent bullish gap, not the oldest', () => {
  const candles = newestFirst([
    ...flat(3),
    bar(1.0, 1.001), bar(1.001, 1.006), bar(1.003, 1.007),          // gap A: 1.001–1.003 (older)
    bar(1.0035, 1.0075), bar(1.004, 1.008),
    bar(1.0045, 1.0085), bar(1.0085, 1.012), bar(1.010, 1.013),     // gap B: 1.0085–1.010 (newer)
    bar(1.0095, 1.0125, 1.0098),                                     // current, inside gap B
  ]);
  const fvg = detectFairValueGap(candles, 'BUY');
  assert.equal(fvg.detected, true);
  assert.equal(fvg.direction, 'BULLISH');
  assert.equal(fvg.bottom, 1.0085);
  assert.equal(fvg.top, 1.010);
  assert.equal(fvg.inZone, true);
});

test('skips a bullish gap that price has since traded through', () => {
  const candles = newestFirst([
    ...flat(3),
    bar(1.0, 1.001), bar(1.001, 1.006), bar(1.003, 1.007),          // gap 1.001–1.003
    bar(0.9995, 1.004),                                              // low below 1.001 → filled
    bar(1.000, 1.002), bar(1.0005, 1.0025),
  ]);
  assert.equal(detectFairValueGap(candles, 'BUY').detected, false);
});

test('a partial retrace into the gap does not fill it', () => {
  const candles = newestFirst([
    ...flat(3),
    bar(1.0, 1.001), bar(1.001, 1.006), bar(1.003, 1.007),          // gap 1.001–1.003
    bar(1.002, 1.005, 1.0022),                                       // dips into the gap, not through
  ]);
  const fvg = detectFairValueGap(candles, 'BUY');
  assert.equal(fvg.detected, true);
  assert.equal(fvg.bottom, 1.001);
  assert.equal(fvg.inZone, true);
});

test('falls back to an older unfilled gap when the newer one is filled', () => {
  const candles = newestFirst([
    ...flat(3),
    bar(1.0, 1.001), bar(1.001, 1.006), bar(1.003, 1.007),          // gap A: 1.001–1.003, never filled
    bar(1.004, 1.008), bar(1.0065, 1.012), bar(1.010, 1.013),       // gap B: 1.008–1.010
    bar(1.0075, 1.011),                                              // low 1.0075 ≤ 1.008 → gap B filled
  ]);
  const fvg = detectFairValueGap(candles, 'BUY');
  assert.equal(fvg.detected, true);
  assert.equal(fvg.bottom, 1.001);
  assert.equal(fvg.top, 1.003);
});

test('bearish gap: most recent unfilled, filled when a high reaches its top', () => {
  const open = newestFirst([
    ...flat(3, 1.0088, 1.0105),
    bar(1.009, 1.010), bar(1.004, 1.009), bar(1.003, 1.007),        // gap 1.007–1.009
    bar(1.0075, 1.0085, 1.008),                                      // rallies into the gap
  ]);
  const fvg = detectFairValueGap(open, 'SELL');
  assert.equal(fvg.detected, true);
  assert.equal(fvg.direction, 'BEARISH');
  assert.equal(fvg.bottom, 1.007);
  assert.equal(fvg.top, 1.009);
  assert.equal(fvg.inZone, true);

  const filled = newestFirst([
    ...flat(3, 1.0088, 1.0105),
    bar(1.009, 1.010), bar(1.004, 1.009), bar(1.003, 1.007),
    bar(1.006, 1.0092),                                              // high above 1.009 → filled
    bar(1.005, 1.008),
  ]);
  assert.equal(detectFairValueGap(filled, 'SELL').detected, false);
});

test('only returns gaps that match the signal direction', () => {
  const candles = newestFirst([
    ...flat(3),
    bar(1.0, 1.001), bar(1.001, 1.006), bar(1.003, 1.007),          // bullish gap only
    bar(1.004, 1.006),
  ]);
  assert.equal(detectFairValueGap(candles, 'SELL').detected, false);
  assert.equal(detectFairValueGap(candles, 'BUY').detected, true);
});

test('too few candles → none', () => {
  assert.equal(detectFairValueGap(flat(5), 'BUY').detected, false);
});
