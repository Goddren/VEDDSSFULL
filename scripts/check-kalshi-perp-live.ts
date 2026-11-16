/**
 * Kalshi stock-perp LIVE lane — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-perp-live.ts
 *
 * NO real orders, no network, no database: the pure pieces (promotion
 * bar, arm-state parsing, sizing, exit scan, margin payload parsers and
 * the order-outcome classifier) are exercised directly on synthetic /
 * MOCKED Kalshi payloads, and the gate chain itself — order, fail-closed
 * behavior, ambiguity discipline, blast-radius caps — is pinned by source
 * checks against kalshi-perp-live.ts. The live cycle is never invoked.
 *
 *   A. Promotion bar (gate 7): each piece fails independently; the
 *      losing-week rule is the last-two-calendar-weeks window the arming
 *      panel (PR #89) states — an older losing week does not block.
 *   B. Week keys: Monday-start UTC.
 *   C. Arm-state parsing (gate 6): PR #89's store shape
 *      ({ [strategy]: { armed } }) reads correctly; legacy shapes still
 *      parse; junk reads as nothing armed.
 *   D. Kill switch (gate 1): KALSHI_PERP_LIVE=off disables entries.
 *   E. Sizing + exit geometry: floored contracts, equity cap, levels
 *      from the fill, stop-before-target on the touch series.
 *   F. Margin client (mocked payloads): /margin/enabled parses strictly
 *      (only an explicit true), balance/position normalization, order
 *      body shape (IOC, fixed-point strings, reduce-only), and the HTTP
 *      outcome classifier (5xx/timeout/unparseable = ambiguous, never a
 *      rejection and never a fill).
 *   G. Source pins: gate order in the entry path, fail-closed reads,
 *      intent-before-send with client_order_id idempotency, exactly one
 *      order-send call site, exits/reconciliation outside the kill
 *      switch, caps + halt + storm-pause constants, unknown positions
 *      surfaced, journal source, table idempotency anchors, route +
 *      boot wiring, panel honesty markers, no second credential path.
 */
import { readFileSync } from 'node:fs';
import {
  evaluatePerpPromotionBar, isoWeekKey, parseArmedStrategies, perpLiveEnabled,
  perpLiveContractsFor, sizeLiveEntry, exitLevelsFor, scanExitTrigger,
  type PerpPromotionCloses,
} from '../server/services/kalshi-perp-live';
import {
  parseMarginEnabled, normalizeMarginBalance, normalizeMarginPosition, normalizeMarginPositions,
  buildMarginOrderBody, formatMarginPrice, classifyMarginOrderHttp,
} from '../server/services/kalshi-trading';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}

const read = (p: string) => readFileSync(p, 'utf8');
const live = read('server/services/kalshi-perp-live.ts');
const tables = read('server/services/ensure-kalshi-perp-live-tables.ts');
const routes = read('server/routes.ts');
const index = read('server/index.ts');
const panel = read('client/src/components/kalshi-shadow-panel.tsx');

// Fixed clock: Wednesday 2026-11-18 12:00 UTC. Current week starts Mon
// 2026-11-16; previous week Mon 2026-11-09; the bar window opens 11-09.
const NOW = Date.UTC(2026, 10, 18, 12);
const CUR = Date.UTC(2026, 10, 17, 12);
const PREV = Date.UTC(2026, 10, 10, 12);
const OLD = Date.UTC(2026, 9, 20, 12);
const closes = (n: number, at: number, returnPct: number, rMultiple: number | null): PerpPromotionCloses[] =>
  Array.from({ length: n }, () => ({ closedAtMs: at, returnPct, rMultiple }));

// ─── A. Promotion bar ──────────────────────────────────────────────────────
{
  const good = evaluatePerpPromotionBar(closes(55, CUR, 2, 0.5), NOW);
  check('A1 clean record clears the bar', good.met && good.trades === 55 && good.avgR === 0.5 && good.winRate === 1 && good.maxDrawdownPct === 0 && good.losingWeeks.length === 0);

  const few = evaluatePerpPromotionBar(closes(49, CUR, 2, 0.5), NOW);
  check('A2 49 trades fails on count alone', !few.met && few.reasons.some((r) => r.includes('49/50')));

  const lowR = evaluatePerpPromotionBar(closes(55, CUR, 2, 0.1), NOW);
  check('A3 avg +0.1R fails the +0.2R piece', !lowR.met && lowR.reasons.some((r) => r.includes('below the +0.2R bar')) && lowR.reasons.length === 1);

  const lowWr = evaluatePerpPromotionBar([...closes(20, CUR, 5, 1.5), ...closes(35, CUR, -0.2, -0.05)], NOW);
  check('A4 36% win rate fails the 40% piece', !lowWr.met && lowWr.reasons.some((r) => r.includes('win rate')) && (lowWr.avgR ?? 0) >= 0.2);

  const losing = evaluatePerpPromotionBar([...closes(3, PREV, -3, -2), ...closes(52, CUR, 2, 0.5)], NOW);
  check('A5 losing PREVIOUS week blocks, named by its Monday', !losing.met && losing.losingWeeks.length === 1 && losing.losingWeeks[0] === '2026-11-09' && losing.reasons.some((r) => r.includes('losing week in the last two weeks')));

  const forgiven = evaluatePerpPromotionBar([...closes(3, OLD, -3, -2), ...closes(52, CUR, 2, 0.5)], NOW);
  check('A6 losing week OUTSIDE the two-week window does not block', forgiven.met && forgiven.losingWeeks.length === 0);

  const noR = evaluatePerpPromotionBar(closes(55, CUR, 2, null), NOW);
  check('A7 closes without R cannot clear the bar (avgR unknown)', !noR.met && noR.avgR === null && noR.reasons.some((r) => r.includes('avg —')));

  const dd = evaluatePerpPromotionBar([...closes(20, CUR, -1, 0.5), ...closes(35, CUR + 60_000, 3, 0.5)], NOW);
  check('A8 replay drawdown over 10% fails', !dd.met && dd.maxDrawdownPct > 10 && dd.reasons.some((r) => r.includes('drawdown')));

  const empty = evaluatePerpPromotionBar([], NOW);
  check('A9 empty record fails closed', !empty.met && empty.trades === 0);
}

// ─── B. Week keys ──────────────────────────────────────────────────────────
{
  check('B1 Monday keys to itself', isoWeekKey(Date.UTC(2026, 10, 16)) === '2026-11-16');
  check('B2 Sunday belongs to the week that started the Monday before', isoWeekKey(Date.UTC(2026, 10, 15)) === '2026-11-09');
  check('B3 Saturday keys to its Monday', isoWeekKey(Date.UTC(2026, 10, 21)) === '2026-11-16');
}

// ─── C. Arm-state parsing (PR #89 store shape) ─────────────────────────────
{
  const pr89 = parseArmedStrategies({
    momentum: { armed: true, updatedAt: '2026-11-16T00:00:00.000Z', bar: null },
    orb: { armed: false, updatedAt: '2026-11-16T00:00:00.000Z', bar: null },
  });
  check('C1 PR #89 arm-entry shape: armed strategy reads armed', pr89.has('momentum'));
  check('C2 PR #89 arm-entry shape: disarmed strategy does not', !pr89.has('orb') && pr89.size === 1);
  check('C3 boolean map shape', parseArmedStrategies({ orb: true, momentum: false }).has('orb') && parseArmedStrategies({ orb: true, momentum: false }).size === 1);
  check('C4 array shape', parseArmedStrategies(['orb']).has('orb'));
  check('C5 { strategies: [] } shape', parseArmedStrategies({ strategies: ['orb'] }).has('orb'));
  check('C6 { armed: { strategy: true } } shape', parseArmedStrategies({ armed: { orb: true, momentum: false } }).has('orb'));
  check('C7 { armedStrategies: {} } shape', parseArmedStrategies({ armedStrategies: { orb: true } }).has('orb'));
  check('C8 junk reads as nothing armed', parseArmedStrategies(null).size === 0 && parseArmedStrategies(undefined).size === 0 && parseArmedStrategies('orb').size === 0 && parseArmedStrategies(42).size === 0);
  check('C9 a bare arm entry with no strategy key arms nothing', parseArmedStrategies({ armed: true }).size === 0);
}

// ─── D. Kill switch ────────────────────────────────────────────────────────
{
  const saved = process.env.KALSHI_PERP_LIVE;
  delete process.env.KALSHI_PERP_LIVE;
  check('D1 unset env = lane enabled (gates still apply)', perpLiveEnabled() === true);
  process.env.KALSHI_PERP_LIVE = 'off';
  check('D2 KALSHI_PERP_LIVE=off disables', perpLiveEnabled() === false);
  process.env.KALSHI_PERP_LIVE = 'on';
  check('D3 any other value keeps the lane enabled', perpLiveEnabled() === true);
  if (saved === undefined) delete process.env.KALSHI_PERP_LIVE; else process.env.KALSHI_PERP_LIVE = saved;
}

// ─── E. Sizing + exit geometry ─────────────────────────────────────────────
{
  check('E1 contracts floored to the model', perpLiveContractsFor(250, 100) === 2 && perpLiveContractsFor(250, 249.99) === 1);
  check('E2 no whole contract inside target = 0', perpLiveContractsFor(250, 300) === 0 && perpLiveContractsFor(0, 100) === 0 && perpLiveContractsFor(250, 0) === 0);
  const full = sizeLiveEntry(10_000, 100);
  check('E3 $250 model target when equity is ample', full.contracts === 2 && full.notionalUsd === 200 && full.targetUsd === 250 && full.reason === null);
  const capped = sizeLiveEntry(400, 100);
  check('E4 25%-of-equity cap binds below the model', capped.targetUsd === 100 && capped.contracts === 1);
  const tiny = sizeLiveEntry(100, 100);
  check('E5 tiny equity sizes to zero with a reason', tiny.contracts === 0 && tiny.reason !== null);
  const noEquity = sizeLiveEntry(null, 50);
  check('E6 unknown equity falls back to the model target only', noEquity.contracts === 5 && noEquity.targetUsd === 250);
  const longLv = exitLevelsFor('long', 100, 2);
  const shortLv = exitLevelsFor('short', 100, 2);
  check('E7 levels mirror around the fill (2% stop, 2R target)', longLv.stop === 98 && longLv.target === 104 && shortLv.stop === 102 && shortLv.target === 96);
  const bar = (bidL: number, bidH: number, askL: number, askH: number) => ({
    bid: { o: bidL, h: bidH, l: bidL, c: bidL }, ask: { o: askL, h: askH, l: askL, c: askL },
  });
  check('E8 long stop triggers on the bid low', scanExitTrigger([bar(97, 99, 98, 100)], 'long', 98, 104) === 'stop');
  check('E9 long target triggers on the bid high', scanExitTrigger([bar(99, 105, 100, 106)], 'long', 98, 104) === 'target');
  check('E10 stop wins inside one candle', scanExitTrigger([bar(97, 105, 98, 106)], 'long', 98, 104) === 'stop');
  check('E11 short stop triggers on the ask high', scanExitTrigger([bar(99, 100, 98, 103)], 'short', 102, 96) === 'stop');
  check('E12 inside the range = no trigger', scanExitTrigger([bar(99, 101, 100, 102)], 'long', 98, 104) === null);
}

// ─── F. Margin client on MOCKED payloads ───────────────────────────────────
{
  check('F1 /margin/enabled: only an explicit true counts',
    parseMarginEnabled({ enabled: true }) === true && parseMarginEnabled(true) === true && parseMarginEnabled({ margin_enabled: true }) === true
    && parseMarginEnabled({ enabled: false }) === false && parseMarginEnabled({}) === false && parseMarginEnabled({ enabled: 'true' }) === false
    && parseMarginEnabled(null) === false && parseMarginEnabled('yes') === false);
  const bal = normalizeMarginBalance({ cash_balance: '100.50', position_value: '50.25' });
  check('F2 balance: equity = cash + position value when no equity is reported', bal.equityUsd === 150.75 && bal.cashUsd === 100.5);
  const reported = normalizeMarginBalance({ portfolio_value: 999, cash_balance: 1, position_value: 1 });
  check('F3 balance: a reported equity figure wins', reported.equityUsd === 999);
  check('F4 balance: unparseable payload yields null equity (cannot size)', normalizeMarginBalance({}).equityUsd === null && normalizeMarginBalance(null).equityUsd === null);
  const sub = normalizeMarginBalance({ subaccounts: [{ subaccount: 1, cash_balance: 5 }, { subaccount: 0, cash_balance: 7 }] });
  check('F5 balance: primary subaccount (0) is the one read', sub.cashUsd === 7);
  const pos = normalizeMarginPosition({ ticker: 'KXAAPLPERP1', position_fp: '-3.5', average_entry_price: '210.25' });
  check('F6 position: signed count + entry price parse', !!pos && pos.contracts === -3.5 && pos.entryPrice === 210.25);
  const sidePos = normalizeMarginPosition({ ticker: 'KXMSFTPERP1', position: '2', side: 'ask' });
  check('F7 position: unsigned count + ask side reads short', !!sidePos && sidePos.contracts === -2);
  check('F8 position: zero or tickerless rows drop out', normalizeMarginPosition({ ticker: 'KXXPERP1', position_fp: '0' }) === null && normalizeMarginPosition({ position_fp: '1' }) === null
    && normalizeMarginPositions({ positions: [{ ticker: 'KXXPERP1', position_fp: '0' }, { ticker: 'KXYPERP1', position_fp: '1' }] }).length === 1);
  const body = buildMarginOrderBody({ ticker: 'KXAAPLPERP1', clientOrderId: 'vedd-perp-e1', side: 'bid', count: 2.9, price: 100, tickSize: 0.01 });
  check('F9 order body: IOC, floored string count, fixed-point price, idempotency key',
    body.time_in_force === 'immediate_or_cancel' && body.count === '2' && body.price === '100.00' && body.client_order_id === 'vedd-perp-e1' && !('reduce_only' in body));
  const exitBody = buildMarginOrderBody({ ticker: 'KXAAPLPERP1', clientOrderId: 'vedd-perp-x1-1', side: 'ask', count: 2, price: 99.5, tickSize: 0.01, reduceOnly: true });
  check('F10 exit body carries reduce_only', exitBody.reduce_only === true);
  check('F11 price formatting rounds to the tick', formatMarginPrice(100.0049, 0.01) === '100.00' && formatMarginPrice(99.999, 0.01) === '100.00' && formatMarginPrice(12.34567) === '12.3457');
  check('F12 classifier: 2xx with an order id = responded',
    classifyMarginOrderHttp(200, { order_id: 'o1' }) === 'responded' && classifyMarginOrderHttp(201, { order: { order_id: 'o2' } }) === 'responded');
  check('F13 classifier: 4xx with an error body = rejected (incl. order_already_exists)',
    classifyMarginOrderHttp(409, { error: { code: 'order_already_exists' } }) === 'rejected' && classifyMarginOrderHttp(400, { error: { code: 'bad' } }) === 'rejected');
  check('F14 classifier: 5xx / timeout / unparseable = ambiguous, never a verdict',
    classifyMarginOrderHttp(500, { error: {} }) === 'ambiguous' && classifyMarginOrderHttp(null, null) === 'ambiguous'
    && classifyMarginOrderHttp(200, {}) === 'ambiguous' && classifyMarginOrderHttp(200, null) === 'ambiguous' && classifyMarginOrderHttp(503, null) === 'ambiguous');
}

// ─── G. Source pins ────────────────────────────────────────────────────────
{
  check('G1 arming reads PR #89 scope first', live.includes("const ARM_SCOPES = ['kalshi_perp_armed', 'kalshi_perp_live_arm', 'kalshi_perp_arm'];"));
  check('G2 unreadable arm state = nothing armed', live.includes('catch { return new Set(); }'));
  const entries = live.slice(live.indexOf('async function processLiveEntries'));
  const g1 = entries.indexOf('perpLiveEnabled()');
  const g4 = entries.indexOf('getKalshiMarginEnabled(userId)');
  const g6 = entries.indexOf('getArmedPerpStrategies(userId)');
  const g7 = entries.indexOf('evaluatePerpPromotionBar(closesByStrategy');
  check('G3 gate order: kill switch → margin-enabled → armed → promotion bar', g1 >= 0 && g1 < g4 && g4 < g6 && g6 < g7);
  check('G4 margin check fails closed and counts toward the storm', entries.includes('margin check failed') && entries.includes('state.consecutiveApiErrors++; return block'));
  check('G5 balance must read before sizing', entries.includes("if (equityUsd == null || !(equityUsd > 0)) return block('margin balance unreadable"));
  check('G6 daily-loss halt reads realized + floating vs the day anchor', entries.includes('floatingToday') && entries.includes('daily-loss halt: realized'));
  check('G7 intent persisted before send, keyed by client_order_id', live.includes("ON CONFLICT (client_order_id) DO NOTHING RETURNING id") && live.includes("'sending'"));
  check('G8 ambiguity discipline: reconcile, never resend blind', live.includes('reconcile, never resend') && live.includes('AMBIGUOUS_ABANDON_MS') && live.includes('no retry fired'));
  check('G9 exactly one order-send call site in the lane', (live.match(/placeKalshiMarginOrder\(userId/g) ?? []).length === 1);
  const cycle = live.slice(live.indexOf('export async function runKalshiPerpLiveCycle'));
  check('G10 cycle order: reconciliation + exits run before entries', cycle.indexOf('reconcileLivePositions(userId, state)') >= 0 && cycle.indexOf('reconcileLivePositions(userId, state)') < cycle.indexOf('processLiveEntries(userId, state') && cycle.indexOf('monitorLiveExits(userId, actions)') < cycle.indexOf('processLiveEntries(userId, state'));
  check('G11 kill switch referenced only at the entry gate, the report, and the boot log', (live.match(/perpLiveEnabled\(\)/g) ?? []).length === 3);
  check('G12 caps: 3 open / 10 orders a day / $250 model / −5% day', /KALSHI_PERP_LIVE_MAX_OPEN', 3\)/.test(live) && /KALSHI_PERP_LIVE_MAX_ORDERS_PER_DAY', 10\)/.test(live) && /KALSHI_PERP_LIVE_NOTIONAL_USD', 250\)/.test(live) && /KALSHI_PERP_LIVE_DAILY_LOSS_PCT', 5\)/.test(live));
  check('G13 in-flight entries count toward caps + uniqueness', live.includes('let openLive = [...openRows];'));
  check('G14 error storm: 3 failed cycles pause entries 30 minutes', live.includes('ERROR_STORM_LIMIT = 3') && live.includes('ERROR_PAUSE_MS = 30 * 60_000') && live.includes('AUTO-PAUSED'));
  check('G15 unknown Kalshi positions are surfaced from the unclaimed set', live.includes('state.unknownPositions = positions') && live.includes('.filter((p) => !claimed.has(p.ticker))'));
  check('G16 closes journal into the shared trade journal as kalshi_perp', live.includes("source: 'kalshi_perp'") && live.includes('mt5Ticket: `perp-live-${t.id}`'));
  check('G17 signal freshness: only fresh shadow entries mirror', live.includes('SIGNAL_MAX_AGE_MIN') && live.includes("s.status='open' AND l.id IS NULL"));
  check('G18 tables anchor idempotency: one mirror per shadow trade, one intent per client_order_id',
    tables.includes('shadow_trade_id int NOT NULL UNIQUE') && tables.includes('client_order_id text NOT NULL UNIQUE'));
  check('G19 read-only authenticated panel route', routes.includes('"/api/kalshi-stock-perp-live"') && routes.includes('getKalshiPerpLiveReport'));
  check('G20 boot wiring starts the lane', index.includes('startKalshiPerpLive();'));
  check('G21 panel section is honest about state', panel.includes('data-testid="kalshi-perp-live-section"') && panel.includes('KILL SWITCH OFF — NO NEW ENTRIES') && panel.includes('not opened by this lane') && panel.includes('/api/kalshi-stock-perp-live'));
  check('G22 no second credential path in the lane', live.includes('loadKalshiCredentials') && !live.includes('API_KEY') && !live.includes('PRIVATE_KEY') && !live.includes('-----BEGIN'));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
