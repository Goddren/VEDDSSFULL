/**
 * KALSHI PERP SMALL-ACCOUNT BRAIN — verification.
 *
 * Run:  DATABASE_URL= node --import tsx/esm scripts/check-kalshi-perp-small-account.ts
 *
 * No database, broker, or provider calls: the shared small-account
 * module (server/services/kalshi-perp-small-account.ts), the live
 * lane's pure sizing/coverage functions, and the margin order-body
 * builder are exercised directly, and the monolith wiring (live gates,
 * shadow mirror, AI prompts, panel) is pinned by source checks.
 *
 *   A. The ladder — modes, risk %, max-open per band.
 *   B. sizePerpByRisk — risk$ ÷ (price × stop%), 0.02 granularity,
 *      notional cap, margin cap, min-increment block.
 *   C. perpLossStreak — consecutive-loss counting for the brakes.
 *   D. formatPerpAccountContext — incl. balance-unknown honesty.
 *   E. buildMarginOrderBody — fractional opt-in; default byte-identical.
 *   F. Live-lane pure functions — sizeLiveEntrySA + scaled Gate 5b math.
 *   G. Kill switch — KALSHI_PERP_SMALL_ACCOUNT=off restoration pins.
 *   H. Wiring pins — Gate 5b per-candidate, Gate 2c brakes, shadow
 *      wallet seed/update, judge + watch-plan context, panel, sw.
 */
import { readFileSync } from 'node:fs';
import {
  smallAccountEnabled, perpSaMode, perpSaRiskPct, perpSaMaxOpen, perpSaModeLabel,
  floorToIncrement, formatPerpCount, sizePerpByRisk, perpLossStreak,
  formatPerpAccountContext, SA_MIN_INCREMENT, SA_EQUITY_FLOOR_USD, SA_LOSS_STREAK,
} from '../server/services/kalshi-perp-small-account';
import { sizeLiveEntry, sizeLiveEntrySA, marginCoverageBlock } from '../server/services/kalshi-perp-live';
import { buildMarginOrderBody } from '../server/services/kalshi-trading';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(p, 'utf8');
const approx = (a: number, b: number) => Math.abs(a - b) < 1e-9;

const saModule = src('server/services/kalshi-perp-small-account.ts');
const live = src('server/services/kalshi-perp-live.ts');
const shadow = src('server/services/kalshi-stock-shadow.ts');
const trading = src('server/services/kalshi-trading.ts');
const judge = src('server/services/kalshi-perp-ai-judge.ts');
const watchPlans = src('server/services/kalshi-perp-watch-plans.ts');
const panel = src('client/src/components/kalshi-shadow-panel.tsx');
const sw = src('client/public/sw.js');

async function main(): Promise<void> {
  // ── A. The ladder ───────────────────────────────────────────────────
  check('A1 $21.51 wallet is SURVIVAL', perpSaMode(21.51) === 'survival');
  check('A2 band edges: <$100 survival, $100 growth, $1,000 standard',
    perpSaMode(99.99) === 'survival' && perpSaMode(100) === 'growth'
    && perpSaMode(999.99) === 'growth' && perpSaMode(1000) === 'standard');
  check('A3 unknown balance reads as SURVIVAL, never bigger',
    perpSaMode(null) === 'survival' && perpSaMode(undefined) === 'survival' && perpSaMode(NaN) === 'survival');
  check('A4 risk %: survival 2, growth 3, standard null (legacy)',
    perpSaRiskPct('survival') === 2 && perpSaRiskPct('growth') === 3 && perpSaRiskPct('standard') === null);
  check('A5 max open: survival 1, growth 2, standard null (lane cap)',
    perpSaMaxOpen('survival') === 1 && perpSaMaxOpen('growth') === 2 && perpSaMaxOpen('standard') === null);
  check('A6 mode labels', perpSaModeLabel('survival') === 'Survival' && perpSaModeLabel('growth') === 'Growth' && perpSaModeLabel('standard') === 'Standard');
  check('A7 defaults: increment 0.02, equity floor $10, loss streak 3',
    SA_MIN_INCREMENT() === 0.02 && SA_EQUITY_FLOOR_USD() === 10 && SA_LOSS_STREAK() === 3);

  // ── B. sizePerpByRisk ───────────────────────────────────────────────
  const b1 = sizePerpByRisk({ equityUsd: 21.51, price: 100, slPct: 2, mode: 'survival', availableMarginUsd: 21.51, leverage: 5 });
  check('B1 survival: 2% of $21.51 at a 2% stop on $100 → 0.20 contracts / $20',
    approx(b1.contracts, 0.2) && approx(b1.notionalUsd, 20) && approx(b1.riskUsd, 0.4302) && b1.cappedBy === 'risk' && b1.reason === null,
    JSON.stringify(b1));
  const b2 = sizePerpByRisk({ equityUsd: 21.51, price: 5000, slPct: 4, mode: 'survival', availableMarginUsd: 21.51, leverage: 5 });
  check('B2 below the 0.02 minimum → blocked with the numbers named',
    b2.contracts === 0 && !!b2.reason && b2.reason.includes('sizes below the 0.02-contract minimum') && b2.reason.includes('$0.43'),
    b2.reason ?? '');
  const b3 = sizePerpByRisk({ equityUsd: 500, price: 10, slPct: 1, mode: 'growth' });
  check('B3 notional cap binds: growth $500 → 25 contracts / $250 cap',
    approx(b3.contracts, 25) && approx(b3.notionalUsd, 250) && b3.cappedBy === 'notional_cap', JSON.stringify(b3));
  const b4 = sizePerpByRisk({ equityUsd: 90, price: 100, slPct: 0.8, mode: 'survival', availableMarginUsd: 2, leverage: 5 });
  check('B4 margin cap binds: $2 available × 5x → 0.10 contracts / $10',
    approx(b4.contracts, 0.1) && approx(b4.notionalUsd, 10) && b4.cappedBy === 'margin', JSON.stringify(b4));
  const b5 = sizePerpByRisk({ equityUsd: 5000, price: 100, slPct: 2, mode: 'standard' });
  check('B5 STANDARD refuses the ladder (legacy sizing owns it)',
    b5.contracts === 0 && !!b5.reason && b5.reason.includes('legacy fixed-$250'));
  check('B6 degenerate inputs block with reasons, never size',
    sizePerpByRisk({ equityUsd: 0, price: 100, slPct: 2, mode: 'survival' }).reason === 'no equity to size against'
    && sizePerpByRisk({ equityUsd: 50, price: 0, slPct: 2, mode: 'survival' }).reason === 'no price to size against'
    && sizePerpByRisk({ equityUsd: 50, price: 100, slPct: 0, mode: 'survival' }).reason === 'no stop distance to size against');
  check('B7 granularity floor: 0.2151→0.2, 0.019→0, 1.999→1.98',
    approx(floorToIncrement(0.2151), 0.2) && floorToIncrement(0.019) === 0 && approx(floorToIncrement(1.999), 1.98));
  check('B8 count strings: 2→"2", 0.5→"0.5", 0.02→"0.02", 0.2151→"0.2", 0→"0"',
    formatPerpCount(2) === '2' && formatPerpCount(0.5) === '0.5' && formatPerpCount(0.02) === '0.02'
    && formatPerpCount(0.2151) === '0.2' && formatPerpCount(0) === '0' && formatPerpCount(1.98) === '1.98');

  // ── C. perpLossStreak ───────────────────────────────────────────────
  const L = (netPnlUsd: number | null) => ({ netPnlUsd });
  check('C1 streak counts consecutive losses from the head',
    perpLossStreak([L(-1), L(-2.5), L(-0.01)]) === 3 && perpLossStreak([L(-1), L(0), L(-5)]) === 1);
  check('C2 a win, a scratch ($0), an unrecorded P&L, or no closes breaks/zeroes it',
    perpLossStreak([L(5)]) === 0 && perpLossStreak([L(-1), L(null), L(-1)]) === 1 && perpLossStreak([]) === 0);

  // ── D. formatPerpAccountContext ─────────────────────────────────────
  const d1 = formatPerpAccountContext({ realEquityUsd: 21.51, virtualEquityUsd: 21.51, mode: 'survival' });
  check('D1 full context: balances, mode, risk %, objective',
    d1.includes('real Kalshi margin balance $21.51') && d1.includes('shadow virtual wallet $21.51')
    && d1.includes('small-account mode SURVIVAL (risk 2% of equity per trade)')
    && d1.includes('grows a SMALL Kalshi account') && d1.includes('Survival and steady compounding outrank trade count'), d1);
  const d2 = formatPerpAccountContext({ realEquityUsd: null, virtualEquityUsd: null, mode: null });
  check('D2 unknown balance says unknown — and invents no number',
    d2.includes('real Kalshi margin balance unknown') && d2.includes('shadow virtual wallet not seeded yet')
    && d2.includes('small-account mode n/a') && !/\$\d/.test(d2), d2);
  const d3 = formatPerpAccountContext({ realEquityUsd: 2500, virtualEquityUsd: 2500, mode: 'standard' });
  check('D3 STANDARD carries no risk-% suffix (legacy sizing)',
    d3.includes('small-account mode STANDARD') && !d3.includes('(risk'), d3);

  // ── E. buildMarginOrderBody ─────────────────────────────────────────
  const base = { ticker: 'KXTSLAPERP1', clientOrderId: 'vedd-perp-e1', side: 'bid' as const, price: 100, tickSize: 0.01 };
  const eLegacy = buildMarginOrderBody({ ...base, count: 2.7 });
  check('E1 default count is the legacy whole-contract string (floor, min 1)',
    eLegacy.count === '2' && buildMarginOrderBody({ ...base, count: 0.4 }).count === '1');
  const eFrac = buildMarginOrderBody({ ...base, count: 0.5, fractional: true });
  const eFracWhole = buildMarginOrderBody({ ...base, count: 2, fractional: true });
  check('E2 fractional opt-in: 0.5→"0.5", 2→"2", 0.2151→"0.2"',
    eFrac.count === '0.5' && eFracWhole.count === '2' && buildMarginOrderBody({ ...base, count: 0.2151, fractional: true }).count === '0.2');
  const strip = (b: Record<string, unknown>) => { const { count, ...rest } = b; return JSON.stringify(rest); };
  check('E3 fractional changes NOTHING but the count field', strip(eLegacy) === strip(buildMarginOrderBody({ ...base, count: 2.7, fractional: true })));
  check('E4 reduce_only rides only when set',
    buildMarginOrderBody({ ...base, count: 1, reduceOnly: true }).reduce_only === true && !('reduce_only' in eLegacy));

  // ── F. Live-lane pure functions ─────────────────────────────────────
  const f1 = sizeLiveEntrySA(21.51, 100, 2, 21.51);
  check('F1 sizeLiveEntrySA survival matches the shared ladder (0.20 contracts)',
    approx(f1.contracts, 0.2) && approx(f1.notionalUsd, 20) && f1.reason === null, JSON.stringify(f1));
  const f2 = sizeLiveEntrySA(5000, 100, 2, 5000);
  const f2legacy = sizeLiveEntry(5000, 100);
  check('F2 sizeLiveEntrySA STANDARD is the legacy sizing, byte-for-byte',
    JSON.stringify(f2) === JSON.stringify(f2legacy) && f2.contracts === 2, JSON.stringify(f2));
  check('F3 sizeLiveEntrySA unreadable equity falls back to legacy',
    JSON.stringify(sizeLiveEntrySA(null, 100, 2, null)) === JSON.stringify(sizeLiveEntry(null, 100)));
  const bal = { cashUsd: 21.51, positionValueUsd: 0, equityUsd: 21.51, maintenanceMarginUsd: 0, availableUsd: 21.51 };
  check('F4 Gate 5b scaled per candidate: the $20 survival trade passes on $21.51',
    marginCoverageBlock(bal as any, 20, 5) === null);
  check('F5 Gate 5b still blocks the old $250 fiction on the same balance',
    marginCoverageBlock(bal as any, 250, 5) === 'margin balance too low — $21.51 available, needs ~$50.00 for $250 notional');

  // ── G. Kill switch ──────────────────────────────────────────────────
  check('G1 switch defaults ON (anything but "off")', smallAccountEnabled() === true);
  process.env.KALSHI_PERP_SMALL_ACCOUNT = 'off';
  const gOff = smallAccountEnabled();
  delete process.env.KALSHI_PERP_SMALL_ACCOUNT;
  check('G2 KALSHI_PERP_SMALL_ACCOUNT=off disables, read live (never cached)', gOff === false && smallAccountEnabled() === true);
  check('G3 module switch is the env read itself', saModule.includes("process.env.KALSHI_PERP_SMALL_ACCOUNT !== 'off'"));
  check('G4 shadow kill-switch path is the fixed-$250 line',
    shadow.includes('contracts = Math.max(1, Math.round(NOTIONAL() / entry));')
    && shadow.includes('if (saOn && saWallet)') && shadow.includes('const saOn = smallAccountEnabled();'));
  check('G5 live kill-switch path keeps the lane-level Gate 5b test',
    live.includes('if (!saOn) {') && live.includes('const coverageBlock = marginCoverageBlock(marginBalance, NOTIONAL(), ASSUMED_LEVERAGE());'));

  // ── H. Wiring pins ──────────────────────────────────────────────────
  check('H1 Gate 5b per-candidate (small-account form) tests the SIZED notional',
    live.includes('Gate 5b (small-account form)') && live.includes('marginCoverageBlock(marginBalance, sizing.notionalUsd, ASSUMED_LEVERAGE())'));
  check('H2 entry-loop sizing picks ladder vs legacy on the switch',
    live.includes('? sizeLiveEntrySA(equityUsd, entryBasis, Number(s.sl_pct), marginBalance?.availableUsd ?? marginBalance?.equityUsd ?? null)')
    && live.includes(': sizeLiveEntry(equityUsd, entryBasis);'));
  check('H3 Gate 2c brakes: floor + streak pause, entries only (exits unaffected)',
    live.includes('Gate 2c — small-account survival brakes (entries only')
    && live.includes('small-account equity floor:') && live.includes('small-account loss-streak pause:')
    && live.includes('entries paused (exits unaffected)') && live.includes('entries paused until the next UTC day (exits unaffected)')
    && live.includes('state.saStreakPaused = streak >= SA_LOSS_STREAK() && lastLossDay === today;'));
  check('H4 ladder tightens the open cap (STANDARD/kill switch keep lane cap)',
    live.includes('const maxOpenCap = (saMode ? perpSaMaxOpen(saMode) : null) ?? MAX_OPEN();'));
  check('H5 fractional order opt-in: switch on, or the count is already fractional',
    live.includes('fractional: smallAccountEnabled() || !Number.isInteger(intent.count)'));
  check('H6 order body: fractional is the ONLY count-shape branch',
    trading.includes('count: input.fractional ? formatPerpCount(input.count) : String(Math.max(1, Math.floor(input.count)))'));
  check('H7 shadow wallet seeded from the real balance read (fail-soft, creds-gated)',
    shadow.includes('saWallet = await getOrSeedPerpShadowWallet(userId, saRealEquityUsd)')
    && shadow.includes('saRealEquityUsd = bal?.equityUsd ?? null;'));
  check('H8 shadow wallet compounds on close; excluded closes book nothing; switch-gated',
    shadow.includes("if (smallAccountEnabled() && !exclude && net != null && Number(t.notional_usd) > 0)")
    && shadow.includes('await adjustPerpShadowWallet(Number(t.user_id), (Number(t.notional_usd) * net) / 100)'));
  check('H9 shadow sizing skips candidates below the minimum increment',
    shadow.includes('if (sized.contracts < SA_MIN_INCREMENT()) continue;')
    && shadow.includes('availableMarginUsd: saWallet.equityUsd'));
  check('H10 shadow summary carries the virtual wallet + mode for the panel',
    shadow.includes('virtualWalletEquityUsd: saWalletReport ? saWalletReport.equityUsd : null')
    && shadow.includes('smallAccountMode: saWalletReport ? perpSaMode(saWalletReport.equityUsd) : null'));
  check('H11 judge prompt: account context line, absent → legacy prompt',
    judge.includes('accountContext?: PerpAccountContext | null;')
    && judge.includes('c.accountContext ? formatPerpAccountContext(c.accountContext) : null,'));
  check('H12 watch-plan prompt: account context line, absent → legacy prompt',
    watchPlans.includes('accountContext?: PerpAccountContext | null;')
    && watchPlans.includes('input.accountContext ? formatPerpAccountContext(input.accountContext) : null,'));
  check('H13 shadow hands the SAME context object to judge + watch plans',
    (shadow.split('accountContext: saAccountContext,').length - 1) === 2
    && shadow.includes('saAccountContext = { realEquityUsd: saRealEquityUsd, virtualEquityUsd: saWallet.equityUsd, mode: perpSaMode(saWallet.equityUsd) };'));
  check('H14 live report payload carries the smallAccount block',
    live.includes('smallAccount: (() => {') && live.includes('riskPct: state.saRiskPct ?? (mode ? perpSaRiskPct(mode) : null)')
    && live.includes('streakPaused: state.saStreakPaused ?? false') && live.includes('equityFloorUsd: SA_EQUITY_FLOOR_USD(),')
    && live.includes('floorBlocked: state.saFloorBlocked ?? (equityUsd != null && equityUsd < SA_EQUITY_FLOOR_USD()),'));
  check('H15 panel types mirror both payloads',
    panel.includes('virtualWalletEquityUsd?: number | null;') && panel.includes('smallAccountMode?: "survival" | "growth" | "standard" | null;')
    && panel.includes('brakes: { lossStreak: number; streakPaused: boolean; equityFloorUsd: number; floorBlocked: boolean };'));
  check('H16 panel line: mode, wallet, risk %, virtual wallet, brake flags',
    panel.includes('data-testid="kalshi-small-account-line"') && panel.includes('Small-account mode:')
    && panel.includes('· risk {data.smallAccount.riskPct}%/trade') && panel.includes('· virtual shadow wallet {fmtMoney(virtualWalletEquityUsd)}')
    && panel.includes('loss-streak pause active') && panel.includes('below the equity floor — entries paused')
    && panel.includes('<KalshiPerpLiveSection virtualWalletEquityUsd={data?.summary.virtualWalletEquityUsd ?? null} />'));
  check('H17 sw bumped to vedd-v299', sw.includes("CACHE_VERSION = 'vedd-v299'"));

  console.log(`\n${total - failures}/${total} checks passed`);
  if (failures) process.exit(1);
}

main().catch((e) => { console.error('check crashed:', e); process.exit(1); });
