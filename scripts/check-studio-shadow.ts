/**
 * Strategy Studio SHADOW deployments — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-studio-shadow.ts
 *
 * No database and no broker are touched: the dispatch guard and the
 * brain's layer partition are pure, and the consistency checks drive
 * the shadow decision logic (evaluateShadowBar) bar-by-bar over
 * synthetic series, comparing against the deterministic backtester —
 * the same approach Stage 5 used to prove the live runner trades what
 * was backtested, extended to the shadow lane.
 *
 *   A. A shadow deployment cannot reach broker dispatch.
 *   B. Shadow rows never move the brain's live layer or the
 *      Marketplace counter (listableTrades).
 *   C. Shadow evaluation fires entries/exits on the same bars, at the
 *      same prices, as the backtester (EMA-cross spec, then the same
 *      spec with breakeven armed).
 *   D. An ORB spec — a runner-only family the EA compiler refuses —
 *      shadow-trades identically to its backtest.
 */
import { readFileSync } from 'node:fs';
import { runBacktest, evaluateSpecSignals, type BacktestBar } from '../server/services/strategy-backtest';
import { evaluateShadowBar, type ShadowPositionState } from '../server/services/strategy-shadow';
import { specWarmupBars, type StrategySpec } from '../server/services/strategy-spec';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const { summarizeStrategyTrades } = await import('../server/services/strategy-brain');
const { assertBrokerDispatchAllowed } = await import('../server/services/strategy-runner');

// ── A. Dispatch guard ───────────────────────────────────────────────

const fakeDep = (platform: string): any => ({
  id: 999001, userId: 1, strategyId: 1, platform, connectionRef: 'virtual',
  accountLabel: 'Shadow (virtual)', status: 'running', lastBarTime: 0,
  lastSignalAt: null, lastError: null, createdAt: '', stoppedAt: null,
});

let shadowThrew = false;
try { assertBrokerDispatchAllowed(fakeDep('shadow'), 'dispatchOpen'); }
catch (e: any) { shadowThrew = /shadow deployment .* reached broker dispatch/.test(String(e?.message)); }
check('A1 dispatch guard throws loudly for a shadow deployment', shadowThrew);

for (const p of ['mt5', 'tradelocker', 'dxtrade']) {
  let ok = true;
  try { assertBrokerDispatchAllowed(fakeDep(p), 'dispatchOpen'); } catch { ok = false; }
  check(`A2 dispatch guard allows ${p} deployments`, ok);
}

const runnerSrc = readFileSync(new URL('../server/services/strategy-runner.ts', import.meta.url), 'utf8');
const rdStart = runnerSrc.indexOf('async function runDeployment');
const rd = runnerSrc.slice(rdStart);
const branchIdx = rd.indexOf("dep.platform === 'shadow'");
const dispatchIdx = rd.indexOf('dispatchOpen(');
check('A3 runDeployment branches shadow BEFORE the first dispatch call',
  branchIdx > 0 && dispatchIdx > branchIdx,
  `branch@${branchIdx} dispatch@${dispatchIdx}`);
for (const fn of ['dispatchOpen', 'dispatchClose', 'dispatchBreakeven', 'resolveVanishedPosition']) {
  const start = runnerSrc.indexOf(`function ${fn}`);
  check(`A4 ${fn} asserts dispatch is allowed`, start > 0 && runnerSrc.slice(start, start + 500).includes('assertBrokerDispatchAllowed'));
}

// ── B. Marketplace separation ───────────────────────────────────────

const T = (over: any): any => ({
  status: 'closed', pnl: 10, r_multiple: null, mode: 'live', symbol: 'EURUSD',
  exit_reason: 'take_profit', closed_at: new Date().toISOString(), opened_at: new Date().toISOString(), ...over,
});
const rows: any[] = [
  // 12 shadow closes (7 wins, 5 losses) with R values summing to +2.5
  ...Array.from({ length: 7 }, () => T({ mode: 'shadow', pnl: 30, r_multiple: 1.5 })),
  ...Array.from({ length: 5 }, () => T({ mode: 'shadow', pnl: -20, r_multiple: -1.6 })),
  // 3 live closes (2 wins, 1 loss)
  T({ pnl: 50 }), T({ pnl: 25 }), T({ pnl: -40 }),
  // 1 legacy close with no mode column value (pre-shadow schema → live)
  T({ pnl: 15, mode: undefined }),
  // 1 live close with pnl NULL (broker figure unreadable → excluded everywhere)
  T({ pnl: null }),
  // opens
  T({ status: 'open', pnl: null }),
  T({ status: 'open', pnl: null, mode: 'shadow' }),
  T({ status: 'open', pnl: null, mode: 'shadow' }),
];
const s = summarizeStrategyTrades(rows);
check('B1 listableTrades counts live closes only', s.listableTrades === 4, `got ${s.listableTrades}, want 4 (3 live + 1 legacy)`);
check('B2 live layer excludes every shadow row', s.live.trades === 4 && Math.abs(s.live.netPnl - 50) < 1e-9, `trades=${s.live.trades} netPnl=${s.live.netPnl}`);
check('B3 shadow layer holds the virtual results separately', s.shadow.trades === 12 && s.shadow.wins === 7 && s.shadow.openTrades === 2,
  `trades=${s.shadow.trades} wins=${s.shadow.wins} open=${s.shadow.openTrades}`);
check('B4 shadow netR sums R multiples', s.shadow.netR != null && Math.abs(s.shadow.netR - 2.5) < 1e-9, `netR=${s.shadow.netR}`);
check('B5 live open count excludes shadow opens', s.live.openTrades === 1, `got ${s.live.openTrades}`);

// ── C/D. Shadow ↔ backtest consistency ─────────────────────────────

interface SimTrade {
  side: string; entryIndex: number; exitIndex: number;
  entryPrice: number; exitPrice: number; exitReason: string; pnl: number;
}

function simulateShadow(spec: StrategySpec, bars: BacktestBar[]): { trades: SimTrade[]; openAtEnd: boolean } {
  const trades: SimTrade[] = [];
  let pos: (ShadowPositionState & { entryIndex: number }) | null = null;
  const entriesByDay = new Map<string, number>();
  const warmup = Math.min(specWarmupBars(spec), Math.max(0, bars.length - 1));
  for (let i = warmup; i < bars.length; i++) {
    const sig = evaluateSpecSignals(spec, bars.slice(0, i + 1));
    if (!sig) continue;
    const dayKey = new Date(bars[i].timestamp).toISOString().slice(0, 10);
    const cap = spec.risk.maxTradesPerDay;
    const entriesAllowed = cap == null || (entriesByDay.get(dayKey) ?? 0) < cap;
    const decision = evaluateShadowBar({ spec, position: pos, sig, bar: bars[i], entriesAllowed });
    if (decision.type === 'open') {
      pos = {
        direction: decision.direction, entryPrice: decision.entryPrice, stopLoss: decision.stopLoss,
        takeProfit: decision.takeProfit, extremePrice: decision.extremePrice, breakevenApplied: false,
        riskDist: decision.riskDist, volume: decision.volume, entryIndex: i,
      };
      entriesByDay.set(dayKey, (entriesByDay.get(dayKey) ?? 0) + 1);
    } else if (decision.type === 'close' && pos) {
      trades.push({
        side: pos.direction === 'BUY' ? 'long' : 'short', entryIndex: pos.entryIndex, exitIndex: i,
        entryPrice: pos.entryPrice, exitPrice: decision.exitPrice, exitReason: decision.exitReason, pnl: decision.pnl,
      });
      pos = null;
    } else if (decision.type === 'update' && pos) {
      pos.stopLoss = decision.stopLoss;
      pos.extremePrice = decision.extremePrice;
      pos.breakevenApplied = decision.breakevenApplied;
    }
  }
  return { trades, openAtEnd: pos != null };
}

function compareConsistency(label: string, spec: StrategySpec, bars: BacktestBar[]): void {
  const bt = runBacktest(spec, bars, { initialCapital: 10000, spreadPips: 0, slippagePips: 0, commissionPerLot: 0 });
  const sim = simulateShadow(spec, bars);
  let btTrades = bt.trades;
  const hadEndClose = btTrades.length > 0 && btTrades[btTrades.length - 1].exitReason === 'end';
  if (hadEndClose) btTrades = btTrades.slice(0, -1);
  check(`${label}: backtest produced trades`, bt.trades.length >= 2, `${bt.trades.length} backtest trades`);
  check(`${label}: same number of closed trades`, sim.trades.length === btTrades.length,
    `shadow ${sim.trades.length} vs backtest ${btTrades.length}${hadEndClose ? ' (excl. end-of-data close)' : ''}`);
  if (hadEndClose) check(`${label}: shadow leaves the end-of-data position open (live semantics — no forced close)`, sim.openAtEnd);
  const n = Math.min(sim.trades.length, btTrades.length);
  let allMatch = sim.trades.length === btTrades.length;
  for (let k = 0; k < n; k++) {
    const a = sim.trades[k], b = btTrades[k];
    // Tolerances are principled, not padded: shadow stop/target levels
    // are rounded to 5dp broker precision exactly like the live
    // runner's dispatched levels (the backtester keeps full float), so
    // an SL/TP exit price can differ by at most half of the last digit
    // (5e-6) and its P&L by at most 5e-6 × 100000 × lotSize (=$0.05 at
    // 0.1 lots) plus the shadow P&L's own 2dp rounding. Anything larger
    // is a real divergence — a wrong bar or a wrong level differs by
    // whole pips, not micro-pips.
    const ok = a.side === b.side && a.entryIndex === b.entryIndex && a.exitIndex === b.exitIndex
      && a.exitReason === b.exitReason
      && Math.abs(a.entryPrice - b.entryPrice) < 1e-6
      && Math.abs(a.exitPrice - b.exitPrice) < 1e-5
      && Math.abs(a.pnl - b.pnl) < 0.06;
    if (!ok) {
      allMatch = false;
      console.log(`   trade ${k}: shadow ${JSON.stringify(a)}\n             backtest ${JSON.stringify(b)}`);
    }
  }
  check(`${label}: every trade matches on side, entry/exit bars, reason, prices, P&L`, allMatch);
}

// A smooth deterministic wave: EMA 9/21 crosses each half-cycle, moves
// large enough to reach 40-pip targets and 20-pip stops intrabar.
function waveBars(n: number, startTs: number): BacktestBar[] {
  const bars: BacktestBar[] = [];
  let prev = 1.1;
  for (let i = 0; i < n; i++) {
    const close = 1.1 + 0.0055 * Math.sin(i / 9) + 0.0022 * Math.sin(i / 3.7 + 1.3);
    const open = prev;
    bars.push({
      timestamp: startTs + i * 15 * 60000,
      open,
      high: Math.max(open, close) + 0.0006 + 0.0003 * Math.abs(Math.sin(i / 2.3)),
      low: Math.min(open, close) - 0.0006 - 0.0003 * Math.abs(Math.cos(i / 2.9)),
      close, volume: 100,
    });
    prev = close;
  }
  return bars;
}

const emaCrossSpec: StrategySpec = {
  name: 'check-ema-cross', source: 'builder', symbol: 'EURUSD', timeframe: 'M15',
  indicators: [
    { id: 'emaFast', kind: 'EMA', period: 9 },
    { id: 'emaSlow', kind: 'EMA', period: 21 },
  ],
  entryLong: { logic: 'AND', conditions: [{ indicatorId: 'emaFast', field: 'value', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } }] },
  entryShort: { logic: 'AND', conditions: [{ indicatorId: 'emaFast', field: 'value', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'emaSlow', field: 'value' } }] },
  exitLong: null, exitShort: null,
  risk: { lotSize: 0.1, stopLossPips: 20, takeProfitPips: 40 },
};

const MON = Date.UTC(2026, 0, 5, 0, 0, 0); // a Monday
compareConsistency('C1 EMA-cross', emaCrossSpec, waveBars(420, MON));
compareConsistency('C2 EMA-cross + breakeven', { ...emaCrossSpec, name: 'check-ema-cross-be', risk: { ...emaCrossSpec.risk, breakevenTriggerPips: 25, breakevenOffsetPips: 0 } }, waveBars(420, MON));

// ── D. ORB (runner-only family) ─────────────────────────────────────

// Six days of M15 bars: a tight morning range, the 14:30–15:00 UTC
// opening range, then a decisive post-range drift up that takes out
// the range high and runs to the 30-pip target.
function orbBars(days: number, startTs: number): BacktestBar[] {
  const bars: BacktestBar[] = [];
  for (let d = 0; d < days; d++) {
    const base = 1.1 + d * 0.001;
    for (let m = 0; m < 96; m++) {
      const minuteOfDay = m * 15;
      const ts = startTs + (d * 96 + m) * 15 * 60000;
      let close: number;
      if (minuteOfDay < 870) close = base + 0.0003 * Math.sin(m / 2);
      else if (minuteOfDay < 900) close = base + (minuteOfDay === 870 ? 0.0005 : -0.0004);
      else {
        const k = (minuteOfDay - 900) / 15; // bars since the range closed
        if (k < 10) close = base + 0.0016 + k * 0.0009;
        else close = base + 0.0097 - Math.min(90, (k - 10) * 0.0004);
      }
      bars.push({
        timestamp: ts,
        open: close,
        high: close + 0.0002,
        low: close - 0.0002,
        close, volume: 100,
      });
    }
  }
  return bars;
}

const orbSpec: StrategySpec = {
  name: 'check-orb', source: 'builder', symbol: 'EURUSD', timeframe: 'M15',
  indicators: [{ id: 'orb', kind: 'ORB', sessionStartHourUtc: 14, sessionStartMinuteUtc: 30, rangeMinutes: 30 }],
  entryLong: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_above', compare: { kind: 'indicator', indicatorId: 'orb', field: 'or_high' } }] },
  entryShort: { logic: 'AND', conditions: [{ indicatorId: 'price', field: 'price', operator: 'crosses_below', compare: { kind: 'indicator', indicatorId: 'orb', field: 'or_low' } }] },
  exitLong: null, exitShort: null,
  risk: { lotSize: 0.1, stopLossPips: 15, takeProfitPips: 30 },
};
compareConsistency('D ORB breakout', orbSpec, orbBars(6, MON));

console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll studio-shadow checks passed.');
process.exit(failures ? 1 : 0);
