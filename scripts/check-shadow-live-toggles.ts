/**
 * Shadow → live go-live toggles — verification checks (2026-11-15).
 *
 * Run:  node --import tsx/esm scripts/check-shadow-live-toggles.ts
 *
 * No database and no broker are touched: the bar math is pure and walked
 * across every threshold; the weekly window is exercised against fixed
 * dates; the engine consult is exercised against the unreachable localhost
 * store (DATABASE_URL unset, as in this repo's check setup) where it must
 * fail CLOSED (not live) with the system on and bypass cleanly with the
 * kill switch off; and the wiring is pinned by source checks — flip-time
 * re-verification before any store write, the consult sitting in the live
 * DeFi branch (never paper, before the swap), the Kalshi side referencing
 * NO order path, the audit table, the four routes, and both panels using
 * the one shared toggle component.
 *
 *   A. summarizeCloses / drawdown / weekly window (pure math).
 *   B. Crypto bar verdicts — pass case + each missing piece, worded.
 *   C. Kalshi bar verdicts — pass case + each missing piece, worded.
 *   D. Kill switches + fail-closed consult with no reachable store.
 *   E. Strategy-list parity with the scanner's AUTO_STRATEGIES.
 *   F. Source pins — wiring, honesty, audit, isolation.
 */
import { readFileSync } from 'node:fs';
import {
  CRYPTO_LIVE_STRATEGIES, cryptoLiveToggleOn, kalshiPerpArmOn,
  evaluateCryptoBar, evaluateKalshiBar, summarizeCloses, lastTwoWeeks,
  maxDrawdownPctFromReturns, weekStartUtc, isCryptoStrategyLiveEnabled,
  type BarSnapshot, type ShadowClose,
} from '../server/services/shadow-live-toggles';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const approx = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;

// Fixed "now": Sunday 2026-11-15 12:00 UTC. Its calendar week starts
// Monday 2026-11-09; the two-week window starts Monday 2026-11-02.
const NOW = new Date('2026-11-15T12:00:00Z');
const close = (returnPct: number, closedAt: string, rMultiple: number | null = null): ShadowClose => ({ returnPct, rMultiple, closedAt });
const closes = (n: number, c: ShadowClose) => Array.from({ length: n }, () => ({ ...c }));

// ── A. Pure math ──────────────────────────────────────────────────────────
check('A1 weekStartUtc: a Sunday belongs to the week that started Monday',
  new Date(weekStartUtc(new Date('2026-11-15T12:00:00Z'))).toISOString() === '2026-11-09T00:00:00.000Z');
check('A2 weekStartUtc: a Monday starts its own week',
  new Date(weekStartUtc(new Date('2026-11-16T08:00:00Z'))).toISOString() === '2026-11-16T00:00:00.000Z');
check('A3 drawdown: +10% then −20% dips 20% from the peak',
  approx(maxDrawdownPctFromReturns([10, -20]), 20, 1e-9), `${maxDrawdownPctFromReturns([10, -20])}`);
check('A4 drawdown: all winners never draw down', maxDrawdownPctFromReturns([1, 2, 3]) === 0);
check('A5 drawdown: a single −10% close is a 10% drawdown', approx(maxDrawdownPctFromReturns([-10]), 10));
{
  const s = summarizeCloses([close(2, '2026-11-14T00:00:00Z', 0.5), close(-1, '2026-11-14T01:00:00Z', -0.25), close(3, '2026-11-14T02:00:00Z', null)], NOW, 'pct');
  check('A6 summarize: trades/mean/winRate', s.trades === 3 && approx(s.meanNetPct!, 4 / 3) && approx(s.winRate!, 2 / 3));
  check('A7 summarize: avgR averages only closes that carry an R', approx(s.avgR!, 0.125));
}
{
  const old = lastTwoWeeks([close(-50, '2026-10-20T00:00:00Z')], (c) => c.returnPct, NOW);
  check('A8 a losing week three weeks ago does not condemn', old.losingWeek === false && old.weeks.length === 0);
  const prev = lastTwoWeeks([close(-0.5, '2026-11-05T00:00:00Z'), close(5, '2026-11-14T00:00:00Z')], (c) => c.returnPct, NOW);
  check('A9 a losing week last week condemns even if this week wins', prev.losingWeek === true);
  const none = lastTwoWeeks([close(1, '2026-10-20T00:00:00Z')], (c) => c.returnPct, NOW);
  check('A10 no closes in the window → no losing week (silence never condemns)', none.losingWeek === false);
  const rWeeks = lastTwoWeeks([close(3, '2026-11-05T00:00:00Z', -0.4)], (c) => c.rMultiple ?? null, NOW);
  check('A11 weekly sums can run in R (Kalshi): a net-negative-R week condemns', rWeeks.losingWeek === true);
}

// ── B. Crypto bar ─────────────────────────────────────────────────────────
const goodCrypto: BarSnapshot = { trades: 50, meanNetPct: 1, avgR: null, winRate: 1, maxDrawdownPct: 0, losingWeek: false };
check('B1 a clean record clears the crypto bar', evaluateCryptoBar(goodCrypto).meetsBar === true && evaluateCryptoBar(goodCrypto).missing.length === 0);
check('B2 trade count is worded with the actual numbers',
  evaluateCryptoBar({ ...goodCrypto, trades: 23 }).missing.includes('23/50 shadow trades'));
check('B3 mean net of exactly 0 does not clear (bar is strictly above 0)',
  evaluateCryptoBar({ ...goodCrypto, meanNetPct: 0 }).missing.some((m) => m.startsWith('mean net')));
check('B4 a negative mean is worded', evaluateCryptoBar({ ...goodCrypto, meanNetPct: -0.42 }).missing.some((m) => m.includes('−0.4%')));
check('B5 win rate 36% is worded with the bar',
  evaluateCryptoBar({ ...goodCrypto, winRate: 0.36 }).missing.includes('win rate 36% (needs ≥ 40%)'));
check('B6 win rate exactly 40% clears', evaluateCryptoBar({ ...goodCrypto, winRate: 0.4 }).meetsBar === true);
check('B7 a losing week is a missing piece',
  evaluateCryptoBar({ ...goodCrypto, losingWeek: true }).missing.includes('a losing week in the last two weeks'));
check('B8 drawdown 13.8% is worded with the cap',
  evaluateCryptoBar({ ...goodCrypto, maxDrawdownPct: 13.84 }).missing.includes('shadow drawdown 13.8% (needs ≤ 10%)'));
check('B9 drawdown exactly 10% clears', evaluateCryptoBar({ ...goodCrypto, maxDrawdownPct: 10 }).meetsBar === true);
{
  // End-to-end through summarizeCloses: 49 winners this week + one small
  // loser LAST week — everything clears except the losing week.
  const mixed = [...closes(49, close(1, '2026-11-14T00:00:00Z')), close(-0.5, '2026-11-05T00:00:00Z')];
  const v = evaluateCryptoBar(summarizeCloses(mixed, NOW, 'pct'));
  check('B10 end-to-end: the lone missing piece is the losing week', v.meetsBar === false && v.missing.length === 1 && v.missing[0].includes('losing week'), v.missing.join(' · '));
  const clean = evaluateCryptoBar(summarizeCloses(closes(50, close(1, '2026-11-14T00:00:00Z')), NOW, 'pct'));
  check('B11 end-to-end: 50 clean closes clear', clean.meetsBar === true);
}

// ── C. Kalshi bar ─────────────────────────────────────────────────────────
const goodKalshi: BarSnapshot = { trades: 50, meanNetPct: 2, avgR: 0.3, winRate: 0.6, maxDrawdownPct: 4, losingWeek: false };
check('C1 a clean record clears the Kalshi bar', evaluateKalshiBar(goodKalshi).meetsBar === true);
check('C2 avg +0.10R is worded against the +0.20R bar',
  evaluateKalshiBar({ ...goodKalshi, avgR: 0.1 }).missing.includes('avg +0.10R (needs ≥ +0.20R)'));
check('C3 avg exactly +0.20R clears', evaluateKalshiBar({ ...goodKalshi, avgR: 0.2 }).meetsBar === true);
check('C4 no R data yet reads as a missing avg, not a pass',
  evaluateKalshiBar({ ...goodKalshi, avgR: null }).missing.some((m) => m.startsWith('avg —')));
check('C5 the trade-count piece matches the crypto wording',
  evaluateKalshiBar({ ...goodKalshi, trades: 31 }).missing.includes('31/50 shadow trades'));

// ── D. Kill switches + consult ────────────────────────────────────────────
delete process.env.CRYPTO_LIVE_TOGGLE;
delete process.env.KALSHI_PERP_ARM;
check('D1 toggles default ON', cryptoLiveToggleOn() === true && kalshiPerpArmOn() === true);
process.env.CRYPTO_LIVE_TOGGLE = 'off';
process.env.KALSHI_PERP_ARM = 'off';
check('D2 kill switches read', cryptoLiveToggleOn() === false && kalshiPerpArmOn() === false);
{
  const bypass = await isCryptoStrategyLiveEnabled(1, 'momentum').then((v) => v, () => 'rejected' as const);
  check('D3 kill switch OFF bypasses the consult (pre-toggle behavior)', bypass === true);
}
delete process.env.CRYPTO_LIVE_TOGGLE;
delete process.env.KALSHI_PERP_ARM;
{
  const closed = await isCryptoStrategyLiveEnabled(1, 'momentum').then((v) => v, () => 'rejected' as const);
  check('D4 consult fails CLOSED (not live, never rejects) with the store unreachable', closed === false);
}

// ── E. Strategy-list parity ───────────────────────────────────────────────
{
  const scanner = src('../server/services/cryptocom-scanner.ts');
  const m = scanner.match(/const AUTO_STRATEGIES = \[([^\]]+)\]/);
  const auto = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
  check('E1 toggle list = scanner AUTO_STRATEGIES + composite_autonomous',
    auto.length === 7
    && auto.every((s) => (CRYPTO_LIVE_STRATEGIES as readonly string[]).includes(s))
    && CRYPTO_LIVE_STRATEGIES.length === auto.length + 1
    && CRYPTO_LIVE_STRATEGIES.includes('composite_autonomous'),
    `auto: ${auto.join(',')}`);
}

// ── F. Source pins ────────────────────────────────────────────────────────
const mod = src('../server/services/shadow-live-toggles.ts');
const scanner = src('../server/services/cryptocom-scanner.ts');
const routes = src('../server/routes.ts');
const shared = src('../client/src/components/shadow-live-toggle.tsx');
const safeguards = src('../client/src/components/engine-safeguards-panel.tsx');
const page = src('../client/src/pages/guards-trails.tsx');
const arming = src('../client/src/components/kalshi-perp-arming.tsx');
const kalshiPanel = src('../client/src/components/kalshi-shadow-panel.tsx');
const sw = src('../client/public/sw.js');

const flipFn = mod.slice(mod.indexOf('export async function flipCryptoLiveToggle'), mod.indexOf('export async function isCryptoStrategyLiveEnabled'));
check('F1 flip ON re-verifies against FRESH bar stats', flipFn.includes('await getCryptoStrategyBar(userId, strategy)'));
check('F2 the bar verdict gates the store write (refusal returns 422 with missing pieces)',
  flipFn.indexOf('if (!bar.meetsBar)') > -1
  && flipFn.indexOf('if (!bar.meetsBar)') < flipFn.lastIndexOf('storeCryptoLiveToggles')
  && flipFn.includes('status: 422') && flipFn.includes('missing: bar.missing'));
check('F3 flip OFF writes without any bar check (instant, unconditional)',
  flipFn.indexOf('await storeCryptoLiveToggles') > -1 && flipFn.indexOf('await storeCryptoLiveToggles') < flipFn.indexOf('await getCryptoStrategyBar'));
check('F4 kill switches gate flips and consult', mod.includes("process.env.CRYPTO_LIVE_TOGGLE !== 'off'") && mod.includes("process.env.KALSHI_PERP_ARM !== 'off'") && flipFn.includes('status: 403'));
check('F5 every flip is audited with its bar snapshot', mod.includes('shadow_live_toggle_audit') && (mod.match(/auditFlip\(/g) || []).length >= 5);
check('F6 state lives in runtime_state scopes (FX-Models shape)', mod.includes("const CRYPTO_SCOPE = 'crypto_live_toggles'") && mod.includes("const KALSHI_SCOPE = 'kalshi_perp_armed'"));
check('F7 the Kalshi side references NO order path (arming only)',
  !/defiEntryBuy|executeSignal|placeOrder|submitOrder/.test(mod)
  && mod.includes("livePathBuilt: false") && mod.includes("marginStatus: 'unknown'"));
check('F8 crypto bar numbers are the directed ones (50 / >0 / 40% / ≤10% / 90d)',
  mod.includes('minTrades: 50') && mod.includes('minWinRate: 0.4') && mod.includes('maxDrawdownPct: 10') && mod.includes('windowDays: 90'));
check('F9 Kalshi bar numbers are the lane’s existing ones (50 / +0.2R / 40% / ≤10%)',
  mod.includes('minAvgR: 0.2') && mod.includes('KALSHI_PERP_BAR'));
check('F10 scanner consults the toggle in the DeFi branch, non-paper, before the swap',
  scanner.includes('isCryptoStrategyLiveEnabled(userId, result.strategy)')
  && scanner.indexOf('isCryptoStrategyLiveEnabled(userId, result.strategy)') > scanner.indexOf("venue === 'defi'")
  && scanner.indexOf('isCryptoStrategyLiveEnabled(userId, result.strategy)') < scanner.indexOf('defiEntryBuy')
  && /Shadow → live go-live toggle[\s\S]{0,1200}?if \(!\(cfg as any\)\._paper\) \{/.test(scanner));
check('F11 the toggle consult leaves the PR #77 promotion consult intact',
  scanner.includes('hasActiveCryptoPromotion(userId, result.strategy)') && scanner.includes('checkCryptoPromotion(userId, result.strategy'));
check('F12 the four routes exist', routes.includes('app.get("/api/engine/crypto-live-toggles"')
  && routes.includes('app.post("/api/engine/crypto-live-toggles"')
  && routes.includes('app.get("/api/engine/kalshi-perp-arming"')
  && routes.includes('app.post("/api/engine/kalshi-perp-arming"'));
check('F13 shared toggle component is the one switch both panels use',
  shared.includes('role="switch"') && safeguards.includes('ShadowLiveToggleRow') && arming.includes('ShadowLiveToggleRow'));
check('F14 crypto panel queries its endpoint and sits on the Guards & Trails page',
  safeguards.includes('"/api/engine/crypto-live-toggles"') && page.includes('<CryptoLiveTogglesPanel />'));
check('F15 Kalshi arming is labeled ARM, never LIVE, and says arming places no trades',
  arming.includes('onText="ARMED"') && !arming.includes('onText="LIVE"') && arming.includes('Arming does not place trades'));
check('F16 the arming section renders inside the Kalshi shadow panel', kalshiPanel.includes('<KalshiPerpArmingSection />'));
check('F17 service worker bumped to vedd-v293', sw.includes("CACHE_VERSION = 'vedd-v293'"));
check('F18 no timers in the module — nothing can auto-flip or auto-arm', !/setInterval|setTimeout/.test(mod));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
