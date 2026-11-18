/**
 * Volume Profile termination checks.
 *
 * Run:  node --import tsx/esm scripts/check-volume-profile-termination.ts
 *
 * Regression guard for the production freeze of 2026-11-18T00:13:34Z: the
 * PR #99 stall capture named calculateVolumeProfile with 7,330 samples
 * (100% of the frozen main thread). Root cause: in computeTrueVolumeProfile
 * (server/indicators.ts) the 70% Value Area expansion compared neighbor
 * bucket volumes with an exhausted side counting as 0 — with the POC at
 * bucket 0 and bucket 1 empty, the low side won the tie (0 >= 0), the index
 * never moved and vaVol grew by 0 while still below target: an infinite
 * loop that froze every engine and shadow lane until Render restarted the
 * process.
 *
 * Every case runs in a CHILD PROCESS with a hard timeout, so if the bug
 * ever returns the check FAILS (timeout) instead of hanging forever.
 *
 *   A. POC at bucket 0, bucket 1 empty, the rest of the volume far above
 *      (the exact production shape).
 *   B. Mirror image: POC at the top bucket, empty bucket below it.
 *   C. All volume in a single bucket.
 *   D. Normal trending candles — POC inside [VAL, VAH] and the value area
 *      covers >= ~70% of total volume under the algorithm's own bucketing.
 *   E. Source pins — the structural iteration cap stays in indicators.ts.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { computeTrueVolumeProfile, type CandleData } from '../server/indicators';

const flat = (price: number, v: number): CandleData => ({ o: price, h: price, l: price, c: price, v });

// ── Case definitions (shared by parent assertions and child execution) ──────
const CASES: Record<string, () => CandleData[]> = {
  // A: 10 zero-range candles at 100.4 (v=100 each → bucket 0, POC) and 10 at
  // 145 (v=60 each → top bucket); every bucket in between is empty.
  a: () => [
    ...Array.from({ length: 10 }, () => flat(100.4, 100)),
    ...Array.from({ length: 10 }, () => flat(145, 60)),
  ],
  // B: mirror of A — POC at the top bucket, empty bucket directly below.
  b: () => [
    ...Array.from({ length: 10 }, () => flat(200, 100)),
    ...Array.from({ length: 10 }, () => flat(155.4, 60)),
  ],
  // C: essentially all volume in one bucket (one thin ranged candle gives
  // the profile a price range to bucket over).
  c: () => [
    ...Array.from({ length: 10 }, () => flat(50, 100)),
    { o: 50, h: 52, l: 50, c: 51, v: 1 },
  ],
  // D: ordinary trending candles with ranges and varying volume.
  d: () => Array.from({ length: 40 }, (_, i) => {
    const base = 100 + i * 0.25;
    return { o: base, h: base + 0.3, l: base - 0.3, c: base + 0.1, v: 100 + (i % 5) * 20 };
  }),
};

// ── Child mode: run one case, print the result as JSON, exit ────────────────
if (process.argv[2] === '--child') {
  const build = CASES[process.argv[3]];
  if (!build) { console.error(`unknown case ${process.argv[3]}`); process.exit(2); }
  const t0 = Date.now();
  const vp = computeTrueVolumeProfile(build());
  console.log(`RESULT ${JSON.stringify({ vp: vp ?? null, ms: Date.now() - t0 })}`);
  process.exit(0);
}

// ── Parent mode ──────────────────────────────────────────────────────────────
let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const CHILD_TIMEOUT_MS = 10_000;

function runCase(id: string): { vp: { poc: number; vah: number; val: number; pocStrength: number }; ms: number } | null {
  const res = spawnSync(
    process.execPath,
    ['--import', 'tsx/esm', fileURLToPath(import.meta.url), '--child', id],
    { timeout: CHILD_TIMEOUT_MS, encoding: 'utf8', cwd: fileURLToPath(new URL('..', import.meta.url)) },
  );
  if (res.error && (res.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') return null;
  if (res.status !== 0) return null;
  const line = (res.stdout || '').split('\n').find(l => l.startsWith('RESULT '));
  if (!line) return null;
  try { return JSON.parse(line.slice('RESULT '.length)); } catch { return null; }
}

const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) < tol;

// A — the production shape: hung forever before the fix.
{
  const r = runCase('a');
  check('A completes within timeout (no infinite loop)', r !== null, r ? `${r.ms} ms` : `>${CHILD_TIMEOUT_MS} ms — HANG`);
  if (r?.vp) {
    check('A poc sits in bucket 0 at the price low', near(r.vp.poc, 100.846, 0.01), `poc=${r.vp.poc}`);
    check('A val is the price low', near(r.vp.val, 100.4), `val=${r.vp.val}`);
    check('A vah reaches the far volume at the price high', near(r.vp.vah, 145), `vah=${r.vp.vah}`);
    check('A pocStrength is the bucket-0 share (1000/1600)', r.vp.pocStrength === 63, `pocStrength=${r.vp.pocStrength}`);
  }
}

// B — mirror image at the top of the range.
{
  const r = runCase('b');
  check('B completes within timeout (no infinite loop)', r !== null, r ? `${r.ms} ms` : `>${CHILD_TIMEOUT_MS} ms — HANG`);
  if (r?.vp) {
    check('B poc sits in the top bucket', near(r.vp.poc, 199.554, 0.01), `poc=${r.vp.poc}`);
    check('B vah is the price high', near(r.vp.vah, 200), `vah=${r.vp.vah}`);
    check('B val reaches the far volume at the price low', near(r.vp.val, 155.4), `val=${r.vp.val}`);
  }
}

// C — all volume in a single bucket: no expansion needed, VA stays tight.
{
  const r = runCase('c');
  check('C completes within timeout', r !== null, r ? `${r.ms} ms` : `>${CHILD_TIMEOUT_MS} ms — HANG`);
  if (r?.vp) {
    check('C val is the price low', near(r.vp.val, 50, 0.001), `val=${r.vp.val}`);
    check('C value area stays within ~one bucket', r.vp.vah - r.vp.val <= 0.05, `vah-val=${(r.vp.vah - r.vp.val).toFixed(4)}`);
    check('C pocStrength ~100', r.vp.pocStrength >= 99, `pocStrength=${r.vp.pocStrength}`);
  }
}

// D — normal data: POC inside the value area, VA covers >= ~70% of volume
// under the algorithm's own accounting (50 buckets over [priceLow, priceHigh],
// zero-range candles to their close bucket, ranged candles spread evenly).
{
  const r = runCase('d');
  check('D completes within timeout', r !== null, r ? `${r.ms} ms` : `>${CHILD_TIMEOUT_MS} ms — HANG`);
  if (r?.vp) {
    const candles = CASES.d();
    check('D VAL <= POC <= VAH', r.vp.val <= r.vp.poc && r.vp.poc <= r.vp.vah, `val=${r.vp.val} poc=${r.vp.poc} vah=${r.vp.vah}`);
    const NUM_BUCKETS = 50;
    const priceLow = Math.min(...candles.map(c => c.l));
    const priceHigh = Math.max(...candles.map(c => c.h));
    const bucketSize = (priceHigh - priceLow) / NUM_BUCKETS;
    const buckets = new Array(NUM_BUCKETS).fill(0);
    let totalVol = 0;
    for (const c of candles) {
      const vol = c.v || 0;
      totalVol += vol;
      if (vol === 0) continue;
      if (c.h - c.l <= 0) {
        const bi = Math.min(Math.floor((c.c - priceLow) / bucketSize), NUM_BUCKETS - 1);
        if (bi >= 0) buckets[bi] += vol;
      } else {
        const s = Math.max(0, Math.floor((c.l - priceLow) / bucketSize));
        const e = Math.min(NUM_BUCKETS - 1, Math.floor((c.h - priceLow) / bucketSize));
        for (let bi = s; bi <= e; bi++) buckets[bi] += vol / (e - s + 1);
      }
    }
    const loIdx = Math.round((r.vp.val - priceLow) / bucketSize);
    const hiIdx = Math.round((r.vp.vah - priceLow) / bucketSize) - 1;
    let covered = 0;
    for (let bi = loIdx; bi <= hiIdx; bi++) covered += buckets[bi];
    const covPct = (covered / totalVol) * 100;
    check('D value area covers >= ~70% of volume', covPct >= 69.9, `coverage=${covPct.toFixed(1)}%`);
  }
}

// E — source pins: the structural termination guarantees stay in place.
{
  const src = readFileSync(new URL('../server/indicators.ts', import.meta.url), 'utf8');
  check('E expansion loop is hard-capped by NUM_BUCKETS', src.includes('iter < NUM_BUCKETS && vaVol < vaTarget'));
  check('E old data-dependent while shape is gone', !src.includes('while (vaVol < totalVol * 0.70'));
  check('E non-finite candle guard present', src.includes('Number.isFinite(c.h)'));
}

console.log(`\n${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
