/**
 * FX Models 14-day REPLAY — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-fx-models-replay.ts
 *
 * No database, broker, or market-data calls are made against production
 * data: the pure parts are exercised directly (point-in-time windows,
 * market-closed skipping, the shared resolution race on synthetic bars,
 * Markov parity against the real builder on a scratch symbol, replay
 * mastery/results/prop-sim wiring), and the isolation invariants are
 * pinned by source inspection of the replay service — the same style as
 * the enrich/epoch/marketplace check scripts.
 *
 *   A. barsBefore: strictly-before-asOf windowing (ms + s timestamps).
 *   B. replayMarketClosed: Fri 21:00 UTC → Sun 21:00 UTC, crypto exempt.
 *   C. raceResolveOnBars (shared with live): TP first → WIN, SL first →
 *      LOSS, same bar → LOSS (stop assumed), 48h → EXPIRED at the 48h
 *      mark price, too-early → null; pre-entry bars never resolve.
 *   D. markovMatrixFromCandles: probability parity with the real
 *      markov-chain.buildTransitionMatrix on the same candle series;
 *      compactMarkovAsOf shape + null cases.
 *   E. computeReplayResults: per-model stats, prop-sim wiring (a
 *      synthetic +2R win grows the $100k sim), blocked-comparison counts
 *      (only resolved trades), NO_TRADE/open accounting.
 *   F. replayMasteryLines: lines built from resolved-so-far rows only;
 *      NO_TRADE and unresolved rows never appear.
 *   G. Source pins: replay tables separate; the replay service never
 *      writes fx_model_decisions / fx_day_regimes; kill switch present;
 *      the shared decision path (decideModelIdeas / buildModelFeatures /
 *      raceResolveOnBars) is IMPORTED, not duplicated — no prompt text,
 *      no duplicated race keywords in the replay service; routes + boot
 *      resume wired; client labels the block a simulation.
 */
import * as fs from 'fs';
import { raceResolveOnBars, type ModelBar } from '../server/services/fx-models';
import {
  barsBefore,
  replayMarketClosed,
  markovMatrixFromCandles,
  compactMarkovAsOf,
  replayMasteryLines,
  computeReplayResults,
  fxModelsReplayOn,
} from '../server/services/fx-models-replay';
import { buildTransitionMatrix, getCachedMatrix, MARKOV_STATES } from '../server/services/markov-chain';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const bar = (tsMs: number, o: number, h: number, l: number, c: number): ModelBar =>
  ({ timestamp: tsMs, open: o, high: h, low: l, close: c, volume: 100 });

// ── A. Point-in-time windowing ─────────────────────────────────────────────
{
  const t0 = Date.UTC(2026, 10, 5, 12, 0, 0); // an hour boundary
  const series = [0, 1, 2, 3].map((i) => bar(t0 - (3 - i) * 900_000, 1, 1, 1, 1)); // last bar AT t0
  const before = barsBefore(series, t0);
  check('A1 barsBefore excludes the bar AT asOf (strictly before)', before.length === 3 && before.every((b) => b.timestamp < t0));
  const last2 = barsBefore(series, t0 + 1, 2);
  check('A2 barsBefore lastN keeps the newest N', last2.length === 2 && last2[1].timestamp === t0);
  const secs = [{ timestamp: Math.floor(t0 / 1000) - 60, open: 1, high: 1, low: 1, close: 1, volume: 1 } as any];
  check('A3 second-based timestamps normalize', barsBefore(secs, t0).length === 1 && barsBefore(secs, t0 - 120_000).length === 0);
}

// ── B. Market-closed skipping (mirrors fxMarketClosedFor) ──────────────────
{
  // Nov 2026: Fri 13th, Sat 14th, Sun 15th.
  check('B1 Fri 20:00 UTC open', replayMarketClosed('EURUSD', Date.UTC(2026, 10, 13, 20)) === false);
  check('B2 Fri 21:00 UTC closed', replayMarketClosed('EURUSD', Date.UTC(2026, 10, 13, 21)) === true);
  check('B3 Sat closed all day', replayMarketClosed('EURUSD', Date.UTC(2026, 10, 14, 12)) === true);
  check('B4 Sun 20:00 UTC closed', replayMarketClosed('EURUSD', Date.UTC(2026, 10, 15, 20)) === true);
  check('B5 Sun 21:00 UTC open', replayMarketClosed('EURUSD', Date.UTC(2026, 10, 15, 21)) === false);
  check('B6 crypto never closes (Sat)', replayMarketClosed('BTCUSD', Date.UTC(2026, 10, 14, 12)) === false);
  check('B7 Mon open', replayMarketClosed('GBPUSD', Date.UTC(2026, 10, 16, 9)) === false);
}

// ── C. Shared resolution race on synthetic bars ────────────────────────────
{
  const t0 = Date.UTC(2026, 10, 5, 12, 0, 0);
  const dec = { direction: 'BUY', entry_price: 100, stop_loss: 99, take_profit: 102, created_at: new Date(t0) };
  const win = raceResolveOnBars(dec, [bar(t0, 100, 102.5, 99.5, 102)], t0 + 900_000);
  check('C1 TP first → WIN at target', win?.result === 'WIN' && win.exitPrice === 102);
  const loss = raceResolveOnBars(dec, [bar(t0, 100, 100.5, 98.5, 99)], t0 + 900_000);
  check('C2 SL first → LOSS at stop', loss?.result === 'LOSS' && loss.exitPrice === 99);
  const both = raceResolveOnBars(dec, [bar(t0, 100, 103, 98, 100)], t0 + 900_000);
  check('C3 same bar hits both → LOSS (stop assumed, conservative)', both?.result === 'LOSS');
  const early = raceResolveOnBars(dec, [bar(t0, 100, 100.4, 99.6, 100.1)], t0 + 900_000);
  check('C4 no hit, <48h → null (still open)', early === null);
  const flat: ModelBar[] = [];
  for (let i = 0; i < 200; i++) flat.push(bar(t0 + i * 900_000, 100, 100.2, 99.8, 100.05));
  const exp = raceResolveOnBars(dec, flat, t0 + 49 * 3_600_000);
  check('C5 48h no hit → EXPIRED at the 48h-mark close', exp?.result === 'EXPIRED' && exp.exitPrice === 100.05 && exp.resolvedAtMs === t0 + 48 * 3_600_000);
  const preOnly = raceResolveOnBars(dec, [bar(t0 - 900_000, 100, 103, 100, 102.5)], t0 + 900_000);
  check('C6 bars before entry never resolve', preOnly === null);
  const sell = raceResolveOnBars({ ...dec, direction: 'SELL', stop_loss: 101, take_profit: 98 }, [bar(t0, 100, 100.4, 97.5, 98)], t0 + 900_000);
  check('C7 SELL: low through target → WIN', sell?.result === 'WIN' && sell.exitPrice === 98);
}

// ── D. Markov point-in-time parity ─────────────────────────────────────────
{
  // Deterministic pseudo-random walk.
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  const candles: Array<{ open: number; close: number }> = [];
  let px = 1.1;
  for (let i = 0; i < 49; i++) {
    const o = px; const c = o + (rnd() - 0.48) * 0.004;
    candles.push({ open: o, close: c }); px = c;
  }
  const SYM = 'ZZREPLAYPARITY';
  buildTransitionMatrix(SYM, candles); // the REAL builder (writes only this scratch symbol's cache)
  const real = getCachedMatrix(SYM);
  const mine = markovMatrixFromCandles(candles);
  let maxDiff = 0;
  if (real && mine) {
    for (const f of MARKOV_STATES) for (const t of MARKOV_STATES) {
      maxDiff = Math.max(maxDiff, Math.abs((real.matrix[f]?.[t] ?? NaN) - mine[f][t]));
    }
  }
  check('D1 local matrix matches buildTransitionMatrix probabilities', !!real && !!mine && maxDiff < 1e-9, `maxDiff=${maxDiff}`);
  const compact = compactMarkovAsOf(candles.map((c, i) => bar(i * 900_000, c.open, Math.max(c.open, c.close), Math.min(c.open, c.close), c.close)));
  check('D2 compactMarkovAsOf shape', !!compact && typeof compact.state === 'string' && compact.pTrend >= 0 && compact.pTrend <= 1.001 && compact.pChop >= 0 && compact.pChop <= 1.001, JSON.stringify(compact));
  check('D3 compactMarkovAsOf <5 bars → null', compactMarkovAsOf(candles.slice(0, 3).map((c, i) => bar(i, c.open, c.open, c.open, c.close))) === null);
  check('D4 markovMatrixFromCandles empty → null', markovMatrixFromCandles([]) === null);
}

// ── E. Results + prop-sim wiring + blocked comparison ──────────────────────
{
  const t0 = Date.UTC(2026, 10, 5, 12, 0, 0);
  const rows: any[] = [
    { model: 'M1', direction: 'BUY', result: 'WIN', r_multiple: 2, confidence: 80, hour_at: new Date(t0).toISOString(), old_rules_blocked: true },
    { model: 'M1', direction: 'SELL', result: 'LOSS', r_multiple: -1, confidence: 80, hour_at: new Date(t0 + 3_600_000).toISOString(), old_rules_blocked: false },
    { model: 'M2', direction: 'BUY', result: 'WIN', r_multiple: 3, confidence: 90, hour_at: new Date(t0).toISOString(), old_rules_blocked: true },
    { model: 'M2', direction: 'NONE', result: 'NO_TRADE', r_multiple: null, hour_at: new Date(t0).toISOString(), old_rules_blocked: false },
    { model: 'M2', direction: 'BUY', result: null, r_multiple: null, hour_at: new Date(t0).toISOString(), old_rules_blocked: true },
  ];
  const res = computeReplayResults(rows);
  check('E1 per-model stats (M1: 2 trades, 50% WR, +0.5 avg R, +1 total R)', res.perModel.M1.trades === 2 && res.perModel.M1.winRate === 0.5 && res.perModel.M1.avgR === 0.5 && res.perModel.M1.totalR === 1, JSON.stringify(res.perModel.M1));
  check('E2 prop sim wired: M1 +2R/−1R at ≤0.5% risk grows $100k', res.propSim.M1.tradesTaken === 2 && res.propSim.M1.endBalance > 100_000, JSON.stringify(res.propSim.M1));
  check('E3 blocked comparison counts resolved trades only', res.blockedComparison.tradesTotal === 3 && res.blockedComparison.wouldHaveBeenBlocked === 2 && res.blockedComparison.byModel.M1 === 1 && res.blockedComparison.byModel.M2 === 1, JSON.stringify(res.blockedComparison));
  check('E4 open + NO_TRADE accounting', res.openDecisions === 1 && res.noTradeDecisions === 1);
  check('E5 results are stamped simulation', res.simulation === true);
}

// ── F. Replay mastery lines (resolved-so-far only) ─────────────────────────
{
  const rows: any[] = [];
  for (let i = 0; i < 6; i++) rows.push({ model: 'M1', day_type: 'range', symbol: 'EURUSD', session: 'London', result: i < 4 ? 'WIN' : 'LOSS', r_multiple: i < 4 ? 1.5 : -1 });
  rows.push({ model: 'M1', day_type: 'range', symbol: 'EURUSD', session: 'London', result: 'NO_TRADE', r_multiple: null });
  rows.push({ model: 'M2', day_type: 'trend', symbol: 'GBPUSD', session: 'New York', result: null, r_multiple: null });
  const lines = replayMasteryLines(rows);
  check('F1 resolved slice appears in the lines', lines.includes('EURUSD') && lines.includes('London'), lines.slice(0, 120));
  check('F2 unresolved/NO_TRADE slices never appear', !lines.includes('GBPUSD'));
  check('F3 empty record → empty lines (the prompt adds its no-record text, same as live)', replayMasteryLines([]) === '');
}

// ── G. Source pins ─────────────────────────────────────────────────────────
{
  const read = (rel: string) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8');
  const svc = read('../server/services/fx-models-replay.ts');
  const routes = read('../server/routes.ts');
  const index = read('../server/index.ts');
  const panel = read('../client/src/components/fx-models-panel.tsx');

  check('G1 replay tables are their own (fx_model_replay_runs/_decisions)', svc.includes('fx_model_replay_runs') && svc.includes('fx_model_replay_decisions'));
  const writesReal = /INSERT INTO fx_model_decisions|UPDATE fx_model_decisions|INSERT INTO fx_day_regimes|DELETE FROM fx_model/.test(svc);
  check('G2 replay service never writes the real record tables', !writesReal);
  check('G3 kill switch FX_MODELS_REPLAY present + exported gate', svc.includes("process.env.FX_MODELS_REPLAY !== 'off'") && svc.includes('fxModelsReplayOn'));
  check('G4 shared decision path imported, not forked', svc.includes('decideModelIdeas') && svc.includes('buildModelFeatures') && svc.includes('raceResolveOnBars') && svc.includes('propSimulate'));
  check('G5 no duplicated prompt text or race logic in the replay service',
    !svc.includes('buildModelsPrompt(') && !/hitSl|hitTp/.test(svc));
  check('G6 routes wired (POST+GET, kill-switch 404s)', routes.includes('"/api/fx-models/replay"') && (routes.match(/fx-models\/replay/g) || []).length >= 2 && routes.includes('fxModelsReplayOn'));
  check('G7 boot resume wired', index.includes('resumeFxModelReplayRuns'));
  check('G8 checkpointing: hours_done advances per hour', svc.includes('hours_done=$2') && svc.includes('startIdx'));
  check('G9 client labels it a simulation, not the real record', panel.includes('NOT') && panel.includes('real record') && panel.includes('14-day replay'));
  check('G10 client cost note is the honest batched figure', panel.includes('about 250 AI calls'));
  const prev = process.env.FX_MODELS_REPLAY;
  process.env.FX_MODELS_REPLAY = 'off';
  check('G11 kill switch off → gate false', fxModelsReplayOn() === false);
  if (prev === undefined) delete process.env.FX_MODELS_REPLAY; else process.env.FX_MODELS_REPLAY = prev;
}

console.log(`\n${total - failures}/${total} checks passed`);
process.exit(failures ? 1 : 0);
