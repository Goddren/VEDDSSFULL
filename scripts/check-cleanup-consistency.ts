/**
 * UI cleanup + numbers-consistency verification checks (Nov 16, 2026).
 *
 * Run:  node --import tsx/esm scripts/check-cleanup-consistency.ts
 *
 * No database and no broker are touched: the shared closed-trade summary
 * and the exec-error humanizer are pure and are walked on synthetic data,
 * and the consolidation is pinned by source checks:
 *
 *   A. summarizeClosed — wins + losses + flat = trades on synthetic sets,
 *      P&L sums both sources, cache rows score by profit sign.
 *   B. humanizeExecError — internal call chains never survive; a clean
 *      broker message passes through; null stays null.
 *   C. One daily/weekly source — daily-summary and update-progress both
 *      count through summarizeClosed; daily-summary exposes the flat
 *      residual; update-progress reads the same 5000-row history.
 *   D. /polymarket-engine no longer renders the duplicated Kalshi
 *      auto-trader block; the credentials section + /kalshi link remain.
 *   E. The footer carries no duplicated app nav and no second logo.
 *   F. Trade-performance tally names its residual (`other`).
 *   G. GET /api/streak derives its display view via effectiveStreakView.
 *   H. Service worker bumped for the client changes.
 */
import { readFileSync } from 'node:fs';
import { summarizeClosed } from '../server/services/closed-trade-stats';
import { humanizeExecError } from '../server/services/exec-error-text';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

// ── A. summarizeClosed reconciliation ────────────────────────────────────
{
  const db = [
    { result: 'WIN', profitLoss: 120.5 },
    { result: 'WIN', profitLoss: 30 },
    { result: 'LOSS', profitLoss: -80.25 },
    { result: 'BREAKEVEN', profitLoss: 0 },
    { result: 'CLOSED_UNKNOWN', profitLoss: 0 },
  ];
  const cache = [
    { profit: 45 },   // win by sign
    { profit: -12.5 }, // loss by sign
    { profit: 0 },     // flat
  ];
  const s = summarizeClosed(db, cache);
  check('A1 trades counts every closed row', s.trades === 8, `trades=${s.trades}`);
  check('A2 wins = DB WIN + positive cache', s.wins === 3, `wins=${s.wins}`);
  check('A3 losses = DB LOSS + negative cache', s.losses === 2, `losses=${s.losses}`);
  check('A4 flat is the named residual', s.flat === 3, `flat=${s.flat}`);
  check('A5 reconciliation closes: wins+losses+flat = trades', s.wins + s.losses + s.flat === s.trades);
  check('A6 pnl sums both sources', Math.abs(s.pnl - 102.75) < 1e-9, `pnl=${s.pnl}`);
  const empty = summarizeClosed([], []);
  check('A7 empty sets reconcile to zero', empty.trades === 0 && empty.flat === 0 && empty.pnl === 0);
}

// ── B. humanizeExecError ─────────────────────────────────────────────────
{
  const stacky = 'executeMT5SignalOnTradeLocker <- process.processTicksAndRejections | position modify failed';
  check('B1 call-chain error becomes the generic line', humanizeExecError(stacky) === 'Execution error — details in the trade log', humanizeExecError(stacky) ?? '');
  check('B2 clean broker message passes through', humanizeExecError('Insufficient margin for order') === 'Insufficient margin for order');
  check('B3 appended internals after " | " are cut', humanizeExecError('Order rejected by broker | internal detail xyz') === 'Order rejected by broker');
  check('B4 null/empty stays null', humanizeExecError(null) === null && humanizeExecError('') === null && humanizeExecError(undefined) === null);
  const long = 'x'.repeat(300);
  const out = humanizeExecError(long) ?? '';
  check('B5 long messages are capped', out.length <= 120, `len=${out.length}`);
}

// ── C. One daily/weekly source ───────────────────────────────────────────
{
  const routes = src('../server/routes.ts');
  check('C1 daily-summary counts via summarizeClosed', routes.includes('const todaySum = summarizeClosed(todayDb, todayCache)'));
  check('C2 update-progress week counts via summarizeClosed', routes.includes('const weekSummary = summarizeClosed(dbWeekTrades, cacheWeekTrades)'));
  check('C3 update-progress today counts via summarizeClosed', routes.includes('const todaySummary = summarizeClosed(todayAllDbTrades, todayCacheDeduped)'));
  check('C4 daily-summary exposes the flat residual', routes.includes('todayFlat:') && routes.includes('weekFlat:'));
  check('C5 prop-firm dashboard prefers the TL sync snapshot', routes.includes('const liveBal = propLive?.balance ?? tlLive.accounts[0]?.balance'));
  check('C6 balance history drops epoch/invalid dates', (routes.match(/Date\.UTC\(2000, 0, 1\)/g) || []).length >= 2);
  check('C7 exec-status humanizes stored errors', routes.includes('humanizeExecError(c.lastError)') && routes.includes('humanizeExecError(lastTrade.errorMessage)'));
}

// ── D. /polymarket-engine Kalshi dedupe ──────────────────────────────────
{
  const page = src('../client/src/pages/polymarket-engine.tsx');
  for (const marker of ['Kalshi Auto-Trader', 'High-Value Picks', 'Strategy Win Rate', 'Open Kalshi Trades', 'AiPredictionReviewPanel', 'Kalshi Engine Config']) {
    check(`D duplicated block gone: ${marker}`, !page.includes(marker));
  }
  check('D credentials anchor kept', page.includes('id="kalshi"'));
  check('D credential setup kept', page.includes('Connect Kalshi Account') && page.includes('Connect with Kalshi API Key'));
  check('D link to the canonical Command Center', page.includes('href="/kalshi"'));
  check('D sports section untouched', page.includes('Sports Prediction Agent'));
}

// ── E. Footer ────────────────────────────────────────────────────────────
{
  const footer = src('../client/src/components/layout/footer.tsx');
  for (const marker of ['/dashboard', '/analysis', '/pricing', '/orb', 'VeddLogo']) {
    check(`E footer has no duplicated nav/logo: ${marker}`, !footer.includes(marker));
  }
  check('E footer keeps legal links', footer.includes('/privacy') && footer.includes('/terms'));
}

// ── F/G/H. Tally residual, streak view, sw ───────────────────────────────
{
  const routes = src('../server/routes.ts');
  check('F tally names the residual', routes.includes('const other = rows.length - wins - losses - be'));
  check('G /api/streak derives the display view', routes.includes('effectiveStreakView(streakRow as any)'));
  const sw = src('../client/public/sw.js');
  check('H sw bumped for the client changes', sw.includes("CACHE_VERSION = 'vedd-v295'"));
  const kinds = src('../client/src/lib/guard-kinds.ts');
  check('G2 guard counting definition separates AI health', kinds.includes('ai_call_failed') && kinds.includes('countGuardActions'));
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
