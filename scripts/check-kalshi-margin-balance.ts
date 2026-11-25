/**
 * Kalshi /margin/balance CURRENT-shape parsing + live-lane margin
 * coverage gate — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-margin-balance.ts
 *
 * Why: on Nov 25, 2026 the merged margin diagnostic (PR #116) proved live
 * that Kalshi answers /margin/balance 200 with a shape the app's parser
 * never understood — top-level `settled_funds` (string dollars) plus a
 * `subaccount_balances` array with fixed-point STRING amounts — so equity
 * read null and the perp live lane blocked forever on "margin balance
 * unreadable". These checks pin:
 *
 *   A. The OBSERVED live shape (sanitized values exactly as captured:
 *      settled_funds "2.606300", subaccount 64 all zeros; the panel
 *      snippet truncated inside the second subaccount, which is
 *      represented here with the zero values its visible fields showed).
 *   B. Shape variants: funded subaccount with a position, multiple
 *      subaccounts, exchange-reported available, missing settled_funds
 *      (subaccount-restricted key), settled-only, empty subaccounts,
 *      numeric (non-string) amounts.
 *   C. Malformed entries degrade to all-nulls (fail closed) — never a
 *      fabricated number, never a fall-through to legacy guessing.
 *   D. Legacy shapes keep their exact pre-fix values (plus the additive
 *      availableUsd, which is null unless a legacy payload reports one).
 *   E. Gate 5b (marginCoverageBlock): the owner's real $2.61 blocks with
 *      the exact reason; funded/boundary accounts pass; an unreadable
 *      balance is gate 5's job, not this gate's.
 *   F. Source pins: gate 5b wiring order, leverage env, parser presence,
 *      and the service-worker version (v295 since the margin-breakdown
 *      PR touched client code).
 *
 * Semantics source: docs.kalshi.com "Get Balance" (updated 2026-11-22) —
 * settled_funds is the "Total settled funds across all subaccounts", and
 * available_balance is 0 unless compute_available_balance=true is passed.
 */
import { readFileSync } from 'node:fs';
import { normalizeMarginBalance, normalizeKalshiMarginBalanceCurrent } from '../server/services/kalshi-trading';
import { marginCoverageBlock } from '../server/services/kalshi-perp-live';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const read = (p: string) => readFileSync(p, 'utf8');
const trading = read('server/services/kalshi-trading.ts');
const live = read('server/services/kalshi-perp-live.ts');
const sw = read('client/public/sw.js');

const zeroSub = (subaccount: number, extra: Record<string, string> = {}) => ({
  account_equity: '0.00000', available_balance: '0.00000', initial_margin: '0.0000',
  maintenance_margin: '0.0000', position_value: '0.00000', resting_orders_margin: '0.0000',
  subaccount, subaccount_type: 'isolated', ...extra,
});

// ── A. The observed live shape (Nov 25, 2026) ───────────────────────────────
{
  const liveShape = {
    settled_funds: '2.606300',
    subaccount_balances: [zeroSub(64), zeroSub(65)],
  };
  const b = normalizeMarginBalance(liveShape);
  check('A1 observed shape: equity reads the settled $2.6063 (was null before the fix)', b.equityUsd === 2.6063);
  check('A2 observed shape: cash = settled funds', b.cashUsd === 2.6063);
  check('A3 observed shape: settled cash outside subaccount equity is available', b.availableUsd === 2.6063);
  check('A4 observed shape: position value + maintenance margin sum to 0', b.positionValueUsd === 0 && b.maintenanceMarginUsd === 0);
}

// ── B. Current-shape variants ───────────────────────────────────────────────
{
  const funded = normalizeMarginBalance({
    settled_funds: '1000.0000',
    subaccount_balances: [zeroSub(0, {
      account_equity: '1200.0000', position_value: '5000.0000',
      initial_margin: '250.0000', maintenance_margin: '200.0000',
    })],
  });
  check('B1 funded subaccount with a position: equity is the subaccount equity (no double-count of settled cash)',
    funded.equityUsd === 1200 && funded.cashUsd === 1000);
  check('B2 funded: position value + maintenance margin read through', funded.positionValueUsd === 5000 && funded.maintenanceMarginUsd === 200);
  check('B3 funded: available derives free margin (equity − committed) when Kalshi reports 0 (flag off)',
    funded.availableUsd === 950);

  const multi = normalizeMarginBalance({
    settled_funds: '300.0000',
    subaccount_balances: [
      zeroSub(1, { account_equity: '100.0000', initial_margin: '10.0000', resting_orders_margin: '5.0000', maintenance_margin: '8.0000' }),
      zeroSub(2, { account_equity: '250.0000', position_value: '100.0000', maintenance_margin: '20.0000' }),
    ],
  });
  check('B4 multiple subaccounts: equity = max(settled total, summed subaccount equity)',
    multi.equityUsd === 350 && multi.positionValueUsd === 100 && multi.maintenanceMarginUsd === 28);
  check('B5 multiple subaccounts: available sums derived free margin', multi.availableUsd === 335);

  const reported = normalizeMarginBalance({
    settled_funds: '500.0000',
    subaccount_balances: [zeroSub(0, { account_equity: '500.0000', initial_margin: '100.0000', available_balance: '450.0000' })],
  });
  check('B6 exchange-reported available (flag computed) wins over the derived figure when larger',
    reported.availableUsd === 450 && reported.equityUsd === 500);

  const restricted = normalizeMarginBalance({ subaccount_balances: [zeroSub(64, { account_equity: '42.5000' })] });
  check('B7 missing settled_funds (restricted key): equity + available from the locked subaccount, cash unknown',
    restricted.equityUsd === 42.5 && restricted.availableUsd === 42.5 && restricted.cashUsd === null);

  const settledOnly = normalizeMarginBalance({ settled_funds: '7.2500' });
  check('B8 settled funds only: equity = cash = available, position/maintenance unknown',
    settledOnly.equityUsd === 7.25 && settledOnly.cashUsd === 7.25 && settledOnly.availableUsd === 7.25
    && settledOnly.positionValueUsd === null && settledOnly.maintenanceMarginUsd === null);

  const emptySubs = normalizeMarginBalance({ settled_funds: '3.0000', subaccount_balances: [] });
  check('B9 empty subaccount list + settled funds: equity still reads', emptySubs.equityUsd === 3 && emptySubs.availableUsd === 3);

  const numeric = normalizeMarginBalance({
    settled_funds: 12.5,
    subaccount_balances: [{ account_equity: 12.5, available_balance: 0, initial_margin: 0, maintenance_margin: 0, position_value: 0, resting_orders_margin: 0, subaccount: 0 }],
  });
  check('B10 numeric (non-string) amounts parse too', numeric.equityUsd === 12.5 && numeric.availableUsd === 12.5);
}

// ── C. Malformed → fail closed ──────────────────────────────────────────────
{
  const allNull = (b: ReturnType<typeof normalizeMarginBalance>) =>
    b.equityUsd === null && b.cashUsd === null && b.availableUsd === null && b.positionValueUsd === null && b.maintenanceMarginUsd === null;
  check('C1 non-numeric settled_funds → all nulls', allNull(normalizeMarginBalance({ settled_funds: 'abc', subaccount_balances: [zeroSub(64)] })));
  check('C2 non-numeric account_equity in one entry → all nulls',
    allNull(normalizeMarginBalance({ settled_funds: '10.0000', subaccount_balances: [zeroSub(64, { account_equity: 'soon' })] })));
  const missingField = zeroSub(64) as any; delete missingField.available_balance;
  check('C3 entry missing a field → all nulls', allNull(normalizeMarginBalance({ settled_funds: '10.0000', subaccount_balances: [missingField] })));
  check('C4 non-object entry → all nulls', allNull(normalizeMarginBalance({ settled_funds: '10.0000', subaccount_balances: ['junk'] })));
  check('C5 malformed current shape does NOT fall through to legacy keys',
    normalizeMarginBalance({ settled_funds: '10.0000', subaccount_balances: [zeroSub(64, { account_equity: 'x' })], cash_balance: '999.00' }).equityUsd === null);
  check('C6 not-this-shape payloads return null from the current-shape parser',
    normalizeKalshiMarginBalanceCurrent({ cash_balance: '1.00' }) === null && normalizeKalshiMarginBalanceCurrent(null) === null
    && normalizeKalshiMarginBalanceCurrent([1, 2]) === null && normalizeKalshiMarginBalanceCurrent('settled_funds') === null);
}

// ── D. Legacy regression ────────────────────────────────────────────────────
{
  const f2 = normalizeMarginBalance({ cash_balance: '100.50', position_value: '50.25' });
  check('D1 legacy flat: equity = cash + position value, available unknown', f2.equityUsd === 150.75 && f2.cashUsd === 100.5 && f2.availableUsd === null);
  check('D2 legacy reported equity wins', normalizeMarginBalance({ portfolio_value: 999, cash_balance: 1, position_value: 1 }).equityUsd === 999);
  check('D3 legacy junk → null equity', normalizeMarginBalance({}).equityUsd === null && normalizeMarginBalance(null).equityUsd === null);
  check('D4 legacy subaccounts: primary (0) is the one read',
    normalizeMarginBalance({ subaccounts: [{ subaccount: 1, cash_balance: 5 }, { subaccount: 0, cash_balance: 7 }] }).cashUsd === 7);
  const legacyAvail = normalizeMarginBalance({ cash_balance: 10, available_balance: '8.25' });
  check('D5 legacy reported available surfaces additively', legacyAvail.cashUsd === 10 && legacyAvail.availableUsd === 8.25);
  check('D6 legacy wrapped balance parses', normalizeMarginBalance({ balance: { cash_balance: '12.34', position_value: '0.00' } }).equityUsd === 12.34);
  check('D7 current shape under a balance wrapper parses', normalizeMarginBalance({ balance: { settled_funds: '9.0000', subaccount_balances: [] } }).equityUsd === 9);
}

// ── E. Gate 5b — margin coverage ────────────────────────────────────────────
{
  const owner = normalizeMarginBalance({ settled_funds: '2.606300', subaccount_balances: [zeroSub(64), zeroSub(65)] });
  check('E1 owner reality: $2.61 cannot fund the standard $250 trade at 5x — exact block reason',
    marginCoverageBlock(owner, 250, 5) === 'margin balance too low — $2.61 available, needs ~$50.00 for $250 notional');
  const funded = normalizeMarginBalance({
    settled_funds: '1000.0000',
    subaccount_balances: [zeroSub(0, { account_equity: '1200.0000', position_value: '5000.0000', initial_margin: '250.0000', maintenance_margin: '200.0000' })],
  });
  check('E2 funded account passes', marginCoverageBlock(funded, 250, 5) === null);
  check('E3 boundary: usable exactly equal to required margin passes',
    marginCoverageBlock({ cashUsd: 50, positionValueUsd: 0, equityUsd: 50, maintenanceMarginUsd: 0, availableUsd: 50 }, 250, 5) === null);
  check('E4 legacy balance without an available figure falls back to equity',
    marginCoverageBlock({ cashUsd: 30, positionValueUsd: 0, equityUsd: 30, maintenanceMarginUsd: 0, availableUsd: null }, 250, 5)
      === 'margin balance too low — $30.00 available, needs ~$50.00 for $250 notional');
  check('E5 unreadable balance is gate 5\u2019s job: this gate stays silent',
    marginCoverageBlock(null, 250, 5) === null
    && marginCoverageBlock({ cashUsd: null, positionValueUsd: null, equityUsd: null, maintenanceMarginUsd: null, availableUsd: null }, 250, 5) === null);
  check('E6 degenerate config never blocks', marginCoverageBlock(owner, 0, 5) === null && marginCoverageBlock(owner, 250, 0) === null);
  check('E7 available (not equity) is the judged figure: equity rich, available poor → blocked',
    marginCoverageBlock({ cashUsd: 500, positionValueUsd: 0, equityUsd: 500, maintenanceMarginUsd: 0, availableUsd: 10 }, 250, 5)
      === 'margin balance too low — $10.00 available, needs ~$50.00 for $250 notional');
}

// ── F. Source pins ──────────────────────────────────────────────────────────
{
  const entries = live.slice(live.indexOf('async function processLiveEntries'));
  const g5 = entries.indexOf("return block('margin balance unreadable — cannot size safely')");
  const g5b = entries.indexOf('marginCoverageBlock(marginBalance, NOTIONAL(), ASSUMED_LEVERAGE())');
  const g6 = entries.indexOf('getArmedPerpStrategies(userId)');
  check('F1 gate 5b wired after gate 5\u2019s unreadable block and before the armed gate', g5 >= 0 && g5b > g5 && g6 > g5b);
  check('F2 assumed leverage env with 5x default', live.includes("KALSHI_PERP_LIVE_ASSUMED_LEVERAGE', 5"));
  check('F3 current-shape parser present + reached from normalizeMarginBalance',
    trading.includes('export function normalizeKalshiMarginBalanceCurrent') && trading.includes('normalizeKalshiMarginBalanceCurrent(data)'));
  check('F4 sw at vedd-v295 (bumped by the margin-breakdown PR, which changed client code)', sw.includes("CACHE_VERSION = 'vedd-v295'"));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
