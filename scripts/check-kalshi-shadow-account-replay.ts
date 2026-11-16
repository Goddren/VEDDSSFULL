/**
 * Kalshi WEATHER + SPORTS shadow lanes — $100-account replay checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-shadow-account-replay.ts
 *
 * No database, broker, or market-data calls: the replay (accountReplay in
 * kalshi-stock-shadow.ts, shared by all three Kalshi shadow lanes) is pure
 * and is exercised directly; the two new lanes' report wiring and panel
 * rendering are pinned by source checks.
 *
 *   A. Perp-semantics parity: the staking rule is the stock-perp lane's —
 *      each close moves the WHOLE running balance by its net return_pct
 *      (compounding), never a fixed-stake sum.
 *   B. Order-dependence: the same closes in a different close order give
 *      the same final balance but a different worst drawdown — which is
 *      why both reports replay strictly in close order.
 *   C. Zero-trade state: an empty replay returns the untouched $100 start
 *      (the dormant sports lane's state until an odds key is added), and
 *      both panels render that state instead of hiding the block.
 *   D. Kill switch: KALSHI_ACCOUNT_SIM=off flips the shared
 *      accountSimEnabled() both lanes gate on; the reports then omit
 *      accountSim and never run the replay query.
 *   E. Wiring pins: both lanes import the shared helper (no local copy),
 *      reuse their stats filter for the replay query, and both panels
 *      declare + render the $100 account block.
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

const weatherSvc = readFileSync(new URL('../server/services/kalshi-weather-shadow.ts', import.meta.url), 'utf8');
const sportsSvc = readFileSync(new URL('../server/services/kalshi-sports-shadow.ts', import.meta.url), 'utf8');
const weatherPanel = readFileSync(new URL('../client/src/components/kalshi-weather-shadow-panel.tsx', import.meta.url), 'utf8');
const sportsPanel = readFileSync(new URL('../client/src/components/kalshi-sports-shadow-panel.tsx', import.meta.url), 'utf8');

// A — perp-semantics parity (same crafted numbers as the perp lane's check)
{
  const compounded = accountReplay([10, 10]);
  check('A1 +10% twice compounds the whole balance to $121 (not a $120 fixed-stake sum)',
    approx(compounded.endBalance, 121), `end=${compounded.endBalance}`);
  const roundTrip = accountReplay([10, -10]);
  check('A2 +10% then −10% ends at $99 (−1% total)', approx(roundTrip.endBalance, 99) && approx(roundTrip.totalReturnPct, -1),
    `end=${roundTrip.endBalance}`);
  const curve = accountReplay([50, -20, 10, -30]);
  check('A3 crafted curve matches perp math: end 92.4, max drawdown 38.4%, worst −30 / best +50',
    approx(curve.endBalance, 92.4) && approx(curve.maxDrawdownPct, 38.4) && curve.worstTradePct === -30 && curve.bestTradePct === 50,
    `end=${curve.endBalance} dd=${curve.maxDrawdownPct}`);
}

// B — order-dependence: chronological replay is load-bearing
{
  const gainFirst = accountReplay([100, -50, -50]); // 100 → 200 → 100 → 50
  const lossFirst = accountReplay([-50, 100, -50]); // 100 → 50 → 100 → 50
  check('B1 gain-first order: end $50, worst drawdown 75% (peak $200 → $50)',
    approx(gainFirst.endBalance, 50) && approx(gainFirst.maxDrawdownPct, 75), `dd=${gainFirst.maxDrawdownPct}`);
  check('B2 loss-first order: same end $50, different drawdown 50% — order changes the path',
    approx(lossFirst.endBalance, 50) && approx(lossFirst.maxDrawdownPct, 50), `dd=${lossFirst.maxDrawdownPct}`);
  check('B3 weather replay query orders closes oldest-first (closed_at, id)',
    weatherSvc.includes('ORDER BY closed_at ASC, id ASC'));
  check('B4 sports replay query orders closes oldest-first (closed_at, id)',
    sportsSvc.includes('ORDER BY closed_at ASC, id ASC'));
}

// C — zero-trade state (dormant sports lane; fresh weather window)
{
  const r = accountReplay([]);
  check('C1 empty replay returns the untouched $100 start', r.startBalance === 100 && r.endBalance === 100);
  check('C2 empty replay: 0 trades, 0% return, 0 drawdown, worst/best null',
    r.trades === 0 && r.totalReturnPct === 0 && r.maxDrawdownPct === 0 && r.worstTradePct === null && r.bestTradePct === null);
  check('C3 weather panel renders the zero-trade $100 state (never hides the block)',
    weatherPanel.includes('no resolved trades yet') && weatherPanel.includes('data.accountSim.endBalance'));
  check('C4 sports panel renders the zero-trade $100 state (never hides the block)',
    sportsPanel.includes('no resolved trades yet') && sportsPanel.includes('data.accountSim.endBalance'));
}

// D — kill switch (shared KALSHI_ACCOUNT_SIM, defined by the perp lane)
{
  const before = process.env.KALSHI_ACCOUNT_SIM;
  delete process.env.KALSHI_ACCOUNT_SIM;
  check('D1 account view on by default', accountSimEnabled() === true);
  process.env.KALSHI_ACCOUNT_SIM = 'off';
  check('D2 KALSHI_ACCOUNT_SIM=off disables the shared switch', accountSimEnabled() === false);
  if (before === undefined) delete process.env.KALSHI_ACCOUNT_SIM; else process.env.KALSHI_ACCOUNT_SIM = before;
  check('D3 weather report gates on the switch and omits accountSim when off',
    weatherSvc.includes('const simOn = accountSimEnabled();') && weatherSvc.includes('...(accountSim ? { accountSim } : {})'));
  check('D4 sports report gates on the switch and omits accountSim when off',
    sportsSvc.includes('const simOn = accountSimEnabled();') && sportsSvc.includes('...(accountSim ? { accountSim } : {})'));
}

// E — wiring pins: shared helper, stats filter reuse, panel blocks
{
  check('E1 weather lane imports the shared accountReplay (no local copy)',
    weatherSvc.includes("from './kalshi-stock-shadow'") && weatherSvc.includes('accountReplay(') && !weatherSvc.includes('function accountReplay'));
  check('E2 sports lane imports the shared accountReplay (no local copy)',
    sportsSvc.includes("from './kalshi-stock-shadow'") && sportsSvc.includes('accountReplay(') && !sportsSvc.includes('function accountReplay'));
  check('E3 weather replay query reuses the stats filter (excluded rows stay excluded)',
    (weatherSvc.match(/WHERE \$\{validWhere\}/g) || []).length >= 3 && weatherSvc.includes('SELECT return_pct::float AS return_pct'));
  check('E4 sports replay query reuses the stats filter (excluded rows stay excluded)',
    (sportsSvc.match(/WHERE \$\{validWhere\}/g) || []).length >= 3 && sportsSvc.includes('SELECT return_pct::float AS return_pct'));
  check('E5 weather panel declares accountSim and renders the $100 account block',
    weatherPanel.includes('accountSim?: KalshiAccountSim;') && weatherPanel.includes('If this was a $100 account'));
  check('E6 sports panel declares accountSim and renders the $100 account block',
    sportsPanel.includes('accountSim?: KalshiAccountSim;') && sportsPanel.includes('If this was a $100 account'));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
