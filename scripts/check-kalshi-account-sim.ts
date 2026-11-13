/**
 * Kalshi $100-account sim — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-account-sim.ts
 *
 * No database, broker, or market-data calls: the replay (accountReplay in
 * kalshi-stock-shadow.ts) is pure and is exercised directly; the endpoint
 * wiring and the lane's untouched sizing are pinned by source checks.
 *
 *   A. Compounding: results apply to the running balance in close order —
 *      +10% then −10% ends at $99, NOT back at $100.
 *   B. Drawdown: largest peak-to-trough % fall of the balance curve.
 *   C. Empty / invalid input: start balance back, no trades counted.
 *   D. Per-strategy independence: each strategy replays from its own $100;
 *      interleaving strategies never share a balance.
 *   E. Kill switch: KALSHI_ACCOUNT_SIM=off flips accountSimEnabled().
 *   F. Source pins: the report payload carries accountSim (from a dedicated
 *      all-closes query on the same stats filter), and the lane's ~$250
 *      notional default is untouched by this reporting-only change.
 */
import { readFileSync } from 'node:fs';
import { accountReplay, accountSimEnabled } from '../server/services/kalshi-stock-shadow';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

// A — compounding in close order
{
  const r = accountReplay([10, -10]);
  check('A1 +10% then −10% ends at $99, not $100', approx(r.endBalance, 99), `end=${r.endBalance}`);
  check('A2 total return is −1%, not 0%', approx(r.totalReturnPct, -1), `ret=${r.totalReturnPct}`);
  check('A3 both trades counted', r.trades === 2);
  const up = accountReplay([10, 10]);
  check('A4 +10% twice compounds to $121', approx(up.endBalance, 121), `end=${up.endBalance}`);
  const obj = accountReplay([{ return_pct: 10 }]);
  check('A5 row-shaped closes ({return_pct}) accepted', approx(obj.endBalance, 110), `end=${obj.endBalance}`);
  const custom = accountReplay([10], 200);
  check('A6 custom start balance respected', approx(custom.endBalance, 220) && custom.startBalance === 200);
}

// B — drawdown math on a crafted curve: 100 → 150 → 120 → 132 → 92.4
{
  const r = accountReplay([50, -20, 10, -30]);
  check('B1 end balance 92.4', approx(r.endBalance, 92.4), `end=${r.endBalance}`);
  check('B2 max drawdown = (150 − 92.4) / 150 = 38.4%', approx(r.maxDrawdownPct, 38.4), `dd=${r.maxDrawdownPct}`);
  check('B3 worst/best trade tracked', r.worstTradePct === -30 && r.bestTradePct === 50);
  const rising = accountReplay([5, 5, 5]);
  check('B4 never-dipping curve has 0 drawdown', rising.maxDrawdownPct === 0, `dd=${rising.maxDrawdownPct}`);
  const dip = accountReplay([-10, 5]);
  check('B5 dip below start counts from the $100 peak (10%)', approx(dip.maxDrawdownPct, 10), `dd=${dip.maxDrawdownPct}`);
}

// C — empty / invalid input
{
  const r = accountReplay([]);
  check('C1 empty input returns the start balance', r.endBalance === 100 && r.startBalance === 100);
  check('C2 empty input: 0 trades, 0% return, 0 drawdown', r.trades === 0 && r.totalReturnPct === 0 && r.maxDrawdownPct === 0);
  check('C3 empty input: worst/best are null', r.worstTradePct === null && r.bestTradePct === null);
  const bad = accountReplay([Number.NaN, Infinity]);
  check('C4 non-finite results are skipped, not compounded', bad.trades === 0 && bad.endBalance === 100);
}

// D — per-strategy independence (the way the report runs it: grouped closes,
//     one replay per strategy, each starting at its own $100)
{
  const closes = [
    { strategy: 'orb', return_pct: 10 },
    { strategy: 'breakout', return_pct: -50 },
    { strategy: 'orb', return_pct: 10 },
  ];
  const grouped = new Map<string, Array<{ return_pct: number }>>();
  for (const c of closes) {
    const list = grouped.get(c.strategy) ?? [];
    list.push({ return_pct: c.return_pct });
    grouped.set(c.strategy, list);
  }
  const orb = accountReplay(grouped.get('orb')!);
  const breakout = accountReplay(grouped.get('breakout')!);
  check('D1 orb replays alone: $100 → $121', approx(orb.endBalance, 121), `end=${orb.endBalance}`);
  check('D2 breakout replays alone: $100 → $50', approx(breakout.endBalance, 50), `end=${breakout.endBalance}`);
  const whole = accountReplay(closes.map((c) => c.return_pct));
  check('D3 whole-window replay is its own sequence ($100 → $60.5)', approx(whole.endBalance, 60.5), `end=${whole.endBalance}`);
}

// E — kill switch
{
  const before = process.env.KALSHI_ACCOUNT_SIM;
  delete process.env.KALSHI_ACCOUNT_SIM;
  check('E1 sim on by default', accountSimEnabled() === true);
  process.env.KALSHI_ACCOUNT_SIM = 'off';
  check('E2 KALSHI_ACCOUNT_SIM=off disables', accountSimEnabled() === false);
  if (before === undefined) delete process.env.KALSHI_ACCOUNT_SIM; else process.env.KALSHI_ACCOUNT_SIM = before;
}

// F — source pins
{
  const svc = readFileSync(new URL('../server/services/kalshi-stock-shadow.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../client/src/components/kalshi-shadow-panel.tsx', import.meta.url), 'utf8');
  check('F1 report payload includes accountSim when enabled', svc.includes('...(accountSim ? { accountSim } : {})'));
  check('F2 replay query orders closes oldest-first', svc.includes('ORDER BY closed_at ASC'));
  check('F3 replay query reuses the stats filter (corporate actions excluded)',
    (svc.match(/validCloseWhere/g) || []).length >= 4 && svc.includes('exclude_from_stats IS NOT TRUE'));
  check('F4 per-strategy account fields merged into byStrategy rows',
    svc.includes('accountEnd: sim ? sim.endBalance : null') && svc.includes('accountReturnPct: sim ? sim.totalReturnPct : null'));
  check('F5 lane notional default untouched ($250)', svc.includes("num('KALSHI_STOCK_SHADOW_NOTIONAL_USD', 250)"));
  check('F6 panel renders the $100 account block + empty state',
    panel.includes('If this was a $100 account') && panel.includes('No closed trades yet in this window'));
  check('F7 panel renders the per-strategy $100 account result', panel.includes('$100 account →'));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
