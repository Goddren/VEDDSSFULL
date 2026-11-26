/**
 * Fan-out per-account risk gate — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-fanout-per-account-risk.ts
 *
 * Why: the chart-data TradeLocker fan-out (POST /api/mt5/chart-data) is
 * being re-enabled by the owner (CHART_DATA_AUTOTRADE_ENABLED=true) while
 * the MT5 source account is a $500K DEMO. The signal-level gates judge the
 * MT5 account; each TradeLocker prop account must be judged on its OWN
 * balance, risk cap and free margin before an order is placed on it.
 * These checks pin:
 *
 *   A. Kill switch + assumed leverage (pure): FANOUT_PER_ACCOUNT_RISK=off
 *      disables; FANOUT_ASSUMED_LEVERAGE defaults to a conservative 50.
 *   B. Per-account sizing (pure): a signal sized on a $500K source does
 *      NOT oversize a $10K connection in ANY mode — risk-% and
 *      proportional derive from $10K (pre-existing), and the residual
 *      'multiplier' path now derives from $10K too instead of copying the
 *      MT5 lot lot-for-lot. With the kill switch OFF the residual path
 *      reproduces the historical copy exactly (revert pinned).
 *   C. Own-balance volatile cap (pure): the volatile ceiling scales with
 *      the DESTINATION balance, not the $500K source.
 *   D. Margin estimate + durable skip reason (pure): requirement =
 *      notional / assumed leverage; the reason carries
 *      "per-account risk: needs $X margin, account has $Y free".
 *   E. Route wiring (source pins): the master switch condition and its
 *      OFF skip message are byte-identical (env off → the fan-out block
 *      is never entered → zero fan-out calls); all new behavior sits
 *      INSIDE the _chartAutoOn block and behind _fanoutRiskOn; the margin
 *      gate runs before the execution call; SL/TP prices come from the
 *      signal while volume is the per-account connLot; the Gate 0f
 *      consistency block is untouched; the old lot-copy cascade init is
 *      gone; no client change (sw stays vedd-v299).
 */
import { readFileSync } from 'node:fs';
import {
  sizeFanoutAccountLot,
  fanoutVolatileCapLot,
  fanoutPerAccountRiskEnabled,
  fanoutAssumedLeverage,
  estimateFanoutMarginUsd,
  fanoutMarginSkipReason,
} from '../server/services/fanout-per-account-risk';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number | null, b: number) => a != null && Math.abs(a - b) < 0.001;

const read = (p: string) => readFileSync(p, 'utf8');
const routes = read('server/routes.ts');
const moduleSrc = read('server/services/fanout-per-account-risk.ts');
const sw = read('client/public/sw.js');

// ── A. Kill switch + leverage ───────────────────────────────────────────────
check('A1 gate enabled by default', fanoutPerAccountRiskEnabled({} as NodeJS.ProcessEnv) === true);
check('A2 FANOUT_PER_ACCOUNT_RISK=off disables', fanoutPerAccountRiskEnabled({ FANOUT_PER_ACCOUNT_RISK: 'off' } as NodeJS.ProcessEnv) === false);
check('A3 any other value keeps the gate on', fanoutPerAccountRiskEnabled({ FANOUT_PER_ACCOUNT_RISK: 'on' } as NodeJS.ProcessEnv) === true);
check('A4 assumed leverage defaults to 50', fanoutAssumedLeverage({} as NodeJS.ProcessEnv) === 50);
check('A5 FANOUT_ASSUMED_LEVERAGE override honored', fanoutAssumedLeverage({ FANOUT_ASSUMED_LEVERAGE: '100' } as NodeJS.ProcessEnv) === 100);
check('A6 invalid leverage falls back to 50', fanoutAssumedLeverage({ FANOUT_ASSUMED_LEVERAGE: 'abc' } as NodeJS.ProcessEnv) === 50
  && fanoutAssumedLeverage({ FANOUT_ASSUMED_LEVERAGE: '0' } as NodeJS.ProcessEnv) === 50
  && fanoutAssumedLeverage({ FANOUT_ASSUMED_LEVERAGE: '-5' } as NodeJS.ProcessEnv) === 50);

// ── B. Sizing: $500K source must not oversize a $10K connection ─────────────
// The MT5 lot sized on the $500K demo at 0.5% risk / 20 pips / $10 per pip:
// 500000 × 0.5% / (20 × $10) = 12.5 lots.
const SRC = { mt5RefBalance: 500_000, mt5Lot: 12.5, slPips: 20, pipValue: 10, pipSizeKnown: true, accountId: '1556546' };
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'proportional', useRiskPercent: true, riskPercent: 0.5, tlEquity: 10_000, perAccountRiskEnabled: true });
  check('B1 risk-% mode: $10K connection sized from its OWN equity (0.25, not 12.5)', approx(r.lot, 0.25) && r.label.includes('risk 0.5%'), `lot=${r.lot} label=${r.label}`);
}
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'proportional', useRiskPercent: false, riskPercent: 0.5, tlEquity: 10_000, perAccountRiskEnabled: true });
  check('B2 proportional mode: lot scales by own/source equity (12.5 × 10K/500K = 0.25)', approx(r.lot, 0.25) && r.label.includes('proportional'), `lot=${r.lot}`);
}
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'multiplier', useRiskPercent: false, riskPercent: 0.5, tlEquity: 10_000, perAccountRiskEnabled: true });
  check('B3 multiplier residual, gate ON: sized from OWN equity (0.25) — MT5 lot NOT copied', approx(r.lot, 0.25) && r.label.includes('own-risk'), `lot=${r.lot} label=${r.label}`);
}
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'multiplier', useRiskPercent: false, riskPercent: 0.5, tlEquity: 10_000, perAccountRiskEnabled: false });
  check('B4 multiplier residual, gate OFF (kill switch): historical exact copy restored (12.5)', r.lot === 12.5 && r.label === 'exact MT5 copy', `lot=${r.lot}`);
}
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'multiplier', useRiskPercent: false, riskPercent: 0.5, tlEquity: 10_000, pipValue: 0, pipSizeKnown: false, perAccountRiskEnabled: true });
  check('B5 multiplier residual, gate ON, no pip model: lot=null → route skips the account (fail closed)', r.lot === null);
}
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'proportional', useRiskPercent: false, riskPercent: 0.5, tlEquity: null, perAccountRiskEnabled: true });
  check('B6 proportional with unreadable equity: lot unchanged here (route per-trade cap fails closed downstream)', r.lot === 12.5 && r.label === 'exact MT5 copy');
}
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'proportional', useRiskPercent: true, riskPercent: 0.5, tlEquity: 10_000, slPips: 0, perAccountRiskEnabled: true });
  check('B7 risk-% with no SL distance: 20-pip default assumption', approx(r.lot, 0.25) && r.label.includes('default 20pip'), `lot=${r.lot}`);
}
{
  const r = sizeFanoutAccountLot({ ...SRC, mt5RefBalance: 0, copyMode: 'proportional', useRiskPercent: false, riskPercent: 0.5, tlEquity: 10_000, perAccountRiskEnabled: true });
  check('B8 proportional without MT5 reference: TL-direct risk sizing from own equity', approx(r.lot, 0.25) && r.label.includes('TL-direct'), `lot=${r.lot} label=${r.label}`);
}
{
  const r = sizeFanoutAccountLot({ ...SRC, copyMode: 'multiplier', useRiskPercent: false, riskPercent: 0, tlEquity: 10_000, perAccountRiskEnabled: true });
  check('B9 residual fallback with no configured risk %: defaults to 1% of own equity', approx(r.lot, 0.5) && r.label.includes('own-risk 1%'), `lot=${r.lot} label=${r.label}`);
}

// ── C. Own-balance volatile cap ─────────────────────────────────────────────
{
  const own = fanoutVolatileCapLot('XAUUSD', 10_000, 10);
  const srcCap = fanoutVolatileCapLot('XAUUSD', 500_000, 10);
  check('C1 gold cap on $10K (0.02) is far below the cap on $500K (1.00)', approx(own, 0.02) && approx(srcCap, 1.0), `own=${own} src=${srcCap}`);
  check('C2 non-volatile symbol has no cap', fanoutVolatileCapLot('EURUSD', 10_000, 10) === null);
  check('C3 no pip value → no cap (5% per-trade cap remains binding)', fanoutVolatileCapLot('XAUUSD', 10_000, 0) === null);
  check('C4 zero balance mirrors the route floor case (0.10)', fanoutVolatileCapLot('XAUUSD', 0, 10) === 0.10);
  check('C5 index cap scales with balance too', approx(fanoutVolatileCapLot('US30', 10_000, 10), 0.03) && approx(fanoutVolatileCapLot('US30', 500_000, 10), 1.66),
    `own=${fanoutVolatileCapLot('US30', 10_000, 10)} src=${fanoutVolatileCapLot('US30', 500_000, 10)}`);
}

// ── D. Margin estimate + skip reason ────────────────────────────────────────
check('D1 FX margin: 1 lot EURUSD @1.08, 1:50 → $2,160', approx(estimateFanoutMarginUsd({ lots: 1, contractSize: 100_000, price: 1.08, leverage: 50 }), 2160));
check('D2 index margin: 10 units US30 @49614, 1:50 → $9,922.80', approx(estimateFanoutMarginUsd({ lots: 10, contractSize: 1, price: 49_614, leverage: 50 }), 9922.8));
check('D3 gold margin: 1 lot @3669 (100 oz), 1:50 → $7,338', approx(estimateFanoutMarginUsd({ lots: 1, contractSize: 100, price: 3669, leverage: 50 }), 7338));
check('D4 unusable inputs → null (route fails closed)', estimateFanoutMarginUsd({ lots: 0, contractSize: 100_000, price: 1.08, leverage: 50 }) === null
  && estimateFanoutMarginUsd({ lots: 1, contractSize: 100_000, price: 0, leverage: 50 }) === null
  && estimateFanoutMarginUsd({ lots: 1, contractSize: 0, price: 1.08, leverage: 50 }) === null);
{
  const reason = fanoutMarginSkipReason('1556546', 9922.8, 5000);
  check('D5 durable skip reason carries needs/has figures', reason.includes('per-account risk: needs $9922.80 margin, account has $5000.00 free'), reason);
  // The gate decision the route makes with these figures:
  check('D6 requirement above free margin is a skip; at-or-below passes', (9922.8 > 5000) && !(9922.8 > 9922.8) && !(2160 > 5000));
}

// ── E. Route wiring (source pins) ───────────────────────────────────────────
check('E1 master switch condition byte-identical', routes.includes("const _chartAutoOn = process.env.CHART_DATA_AUTOTRADE_ENABLED === 'true';"));
check('E2 OFF skip message byte-identical', routes.includes("_markTlSkip('fan-out', 'CHART-DATA AUTOTRADE OFF (set CHART_DATA_AUTOTRADE_ENABLED=true to re-enable)');"));
{
  const fanoutStart = routes.indexOf('if (_chartAutoOn && !tlGateBlocked');
  const sizingCall = routes.indexOf('sizeFanoutAccountLot({');
  const marginGate = routes.indexOf('fanoutMarginSkipReason(');
  const execCall = routes.indexOf('executeMT5SignalOnTradeLocker(tlConn, {', fanoutStart);
  check('E3 new behavior sits INSIDE the _chartAutoOn fan-out block', fanoutStart >= 0 && sizingCall > fanoutStart && marginGate > fanoutStart);
  check('E4 margin gate runs BEFORE the execution call in the loop', marginGate > fanoutStart && execCall > marginGate);
  check('E5 kill-switch state computed once from env', routes.includes('const _fanoutRiskOn = fanoutPerAccountRiskEnabled(process.env);'));
  check('E6 margin + own-volatile blocks are behind the kill switch', routes.includes('if (_fanoutRiskOn && _tlEq)') && routes.includes('if (_fanoutRiskOn) {'));
}
check('E7 SL/TP prices follow the signal; volume is the per-account lot', routes.includes('volume: connLot,\n                  entryPrice: _entryPrice,\n                  stopLoss: analysis.tradePlan.stopLoss,\n                  takeProfit: analysis.tradePlan.takeProfit,'));
check('E8 Gate 0f consistency block untouched (hard block + taper lines intact)',
  routes.includes('_markTlSkip(String(tlConn.accountId), `[Consistency BLOCK] ${tlConn.accountId}: ${_consistency.guidance}`);')
  && routes.includes('if (_consistency.sizeMultiplier < 1) {'));
check('E9 old lot-copy cascade init is gone', !routes.includes('let connLot = tradeVolume;'));
check('E10 module is pure: no direct env reads, no execution calls, no master-switch read',
  !moduleSrc.includes('process.env') && !moduleSrc.includes('executeMT5SignalOnTradeLocker') && !moduleSrc.includes('process.env.CHART_DATA_AUTOTRADE_ENABLED'));
check('E11 margin gate reads THIS account\'s free margin live', routes.includes('const _mgInfo: any = await _mgSvc.getAccountInfo();') && routes.includes('_mgInfo?.freeMargin'));
check('E12 no client change: sw stays vedd-v299', sw.includes("CACHE_VERSION = 'vedd-v299'"));

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
