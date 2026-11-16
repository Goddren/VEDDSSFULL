/**
 * Kalshi stock-perp SHADOW stats blow-up fix — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-kalshi-perp-stats-fix.ts
 *
 * No database, broker, or market-data calls: the lane's pure functions
 * (isValidShadowReturnPct, shadowCloseInvalidReason, accountReplay,
 * aggregateKalshiStats) are exercised directly; the SQL/read/write wiring
 * is pinned by source checks.
 *
 * Background (production, 2026-11-16): the shadow panel showed a net
 * result of −$924,181,878,093,150.60 next to sane counts (359 trades,
 * 118 wins, 33% WR). One close with an impossible return_pct (≈ −3.7e14)
 * — corrupt price inputs divided by entry_price with no validity bound
 * anywhere — poisoned the sum(notional × return_pct/100), the bucket
 * stats, and the $100 replay's whole-balance compounding.
 *
 *   A. Reproduction: the PRE-FIX formulas (re-implemented inline) blow
 *      up on the synthetic poisoned row at the production magnitude;
 *      the fixed path stays sane on the same rows.
 *   B. shadowCloseInvalidReason: every poison vector is named; sane
 *      closes and 'no price' closes pass.
 *   C. isValidShadowReturnPct bound semantics (±100 inclusive).
 *   D. accountReplay: the perp lane's bound skips the poisoned row;
 *      the unbounded call (weather/sports binary semantics) is
 *      byte-for-byte the legacy behavior, +900% included.
 *   E. aggregateKalshiStats: a poisoned net_pct contributes nothing.
 *   F. Source pins: write-time stamp, read-time bounds, invalid count
 *      surfacing (server + panel), entry cross-check, lazy column.
 *   G. PR #94 exact-cost semantics untouched (funding_model stamp and
 *      the costs module's deadband/cap still in place).
 */
import { readFileSync } from 'node:fs';
import {
  isValidShadowReturnPct, isValidShadowNotional, maxValidNotionalUsd,
  shadowCloseInvalidReason, accountReplay, aggregateKalshiStats,
} from '../server/services/kalshi-stock-shadow';

let failures = 0;
let total = 0;
function check(name: string, cond: boolean, detail = ''): void {
  total++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const approx = (a: number, b: number, eps = 1e-6) => Math.abs(a - b) <= eps;

// The synthetic record: 358 sane closes (deterministic cycle in the
// lane's real geometry: stops ≤ −4%, targets ≤ +8%) + ONE poisoned
// close — a short whose exit print was off-scale (entry $100, exit
// print $3.697e14), producing return_pct ≈ −3.697e14, the production
// magnitude.
const sanePcts: number[] = Array.from({ length: 358 }, (_, i) => [-3.2, 1.4, -0.8, 6.1, -4.0, 2.2, 0.6, -1.5][i % 8]);
const POISON_PCT = -369_700_000_000_000;
const rows = [...sanePcts.map((p) => ({ notional: 250, pct: p })), { notional: 250, pct: POISON_PCT }];

// ── A. reproduction: pre-fix formulas blow up, fixed path stays sane ─────
{
  // PRE-FIX estNetPnlUsd: sum(notional × return_pct / 100), no bound.
  const legacyNet = rows.reduce((a, r) => a + (r.notional * r.pct) / 100, 0);
  check('A1 pre-fix net reproduces the production blow-up (|net| > 9e14)', Math.abs(legacyNet) > 9e14, `legacy=${legacyNet}`);
  // PRE-FIX accountReplay: finite-only skip, whole-balance compounding.
  const legacyReplay = (pcts: number[]) => {
    let bal = 100;
    for (const pct of pcts) { if (!Number.isFinite(pct)) continue; bal += (bal * pct) / 100; }
    return bal;
  };
  const legacyBal = legacyReplay([...sanePcts, POISON_PCT]);
  check('A2 pre-fix replay compounding explodes on the poisoned close', Math.abs(legacyBal) > 1e12, `legacyBal=${legacyBal}`);
  // FIXED path: validity filter first, then the same formulas.
  const fixedNet = rows.filter((r) => isValidShadowReturnPct(r.pct)).reduce((a, r) => a + (r.notional * r.pct) / 100, 0);
  check('A3 fixed net is sane on the same rows', Math.abs(fixedNet) < 1000, `fixed=${fixedNet}`);
  const fixedReplay = accountReplay([...sanePcts, POISON_PCT], 100, 100);
  const saneOnlyReplay = accountReplay(sanePcts, 100, 100);
  check('A4 fixed replay equals the sane-only replay exactly', approx(fixedReplay.endBalance, saneOnlyReplay.endBalance), `end=${fixedReplay.endBalance}`);
  check('A5 fixed replay counts only the 358 sane closes', fixedReplay.trades === 358, `trades=${fixedReplay.trades}`);
}

// ── B. shadowCloseInvalidReason ──────────────────────────────────────────
{
  const poisonGross = ((100 - 369_700_000_000_100) / 100) * 100; // short, off-scale exit print
  check('B1 off-scale exit print => gross_return', shadowCloseInvalidReason({
    entryPrice: 100, exitPrice: 369_700_000_000_100, grossPct: poisonGross, fundingPct: 0, netPct: poisonGross - 0.24,
  }) === 'gross_return', `gross=${poisonGross}`);
  check('B2 near-zero entry quote => gross_return', shadowCloseInvalidReason({
    entryPrice: 0.0001, exitPrice: 50, grossPct: ((50 - 0.0001) / 0.0001) * 100, fundingPct: 0, netPct: 49_999_900,
  }) === 'gross_return');
  check('B3 zero entry price => entry_price', shadowCloseInvalidReason({
    entryPrice: 0, exitPrice: 50, grossPct: null, fundingPct: null, netPct: null,
  }) === 'entry_price');
  check('B4 zero exit price => exit_price', shadowCloseInvalidReason({
    entryPrice: 100, exitPrice: 0, grossPct: -100, fundingPct: 0, netPct: -100.24,
  }) === 'exit_price');
  check('B5 funding explosion => funding', shadowCloseInvalidReason({
    entryPrice: 100, exitPrice: 99, grossPct: -1, fundingPct: 1e9, netPct: 1e9,
  }) === 'funding');
  check('B6 net-only breach => net_return', shadowCloseInvalidReason({
    entryPrice: 100, exitPrice: 101, grossPct: 1, fundingPct: 99.5, netPct: 100.26,
  }) === 'net_return');
  check('B7 sane stop close passes', shadowCloseInvalidReason({
    entryPrice: 412.5, exitPrice: 396.0, grossPct: -4, fundingPct: -0.31, netPct: -4.55,
  }) === null);
  check('B8 sane target close passes', shadowCloseInvalidReason({
    entryPrice: 100, exitPrice: 108, grossPct: 8, fundingPct: 0.12, netPct: 7.88,
  }) === null);
  check("B9 'no price' close (null pcts) passes — it carries no return", shadowCloseInvalidReason({
    entryPrice: 100, exitPrice: null, grossPct: null, fundingPct: null, netPct: null,
  }) === null);
  check('B10 non-finite gross => gross_return', shadowCloseInvalidReason({
    entryPrice: 100, exitPrice: 100, grossPct: Number.POSITIVE_INFINITY, fundingPct: 0, netPct: Number.POSITIVE_INFINITY,
  }) === 'gross_return');
}

// ── C. bound semantics ───────────────────────────────────────────────────
{
  check('C1 +100 is valid (a replay double is legitimate)', isValidShadowReturnPct(100));
  check('C2 −100 is valid (zeroes a replay balance, never inverts it)', isValidShadowReturnPct(-100));
  check('C3 +100.01 is invalid', !isValidShadowReturnPct(100.01));
  check('C4 the production poison magnitude is invalid', !isValidShadowReturnPct(POISON_PCT));
  check('C5 NaN / Infinity invalid', !isValidShadowReturnPct(Number.NaN) && !isValidShadowReturnPct(Number.POSITIVE_INFINITY));
  check('C6 ordinary values valid', isValidShadowReturnPct(-4.55) && isValidShadowReturnPct(7.88) && isValidShadowReturnPct(0));
}

// ── D. accountReplay bound is opt-in (shared-helper discipline) ─────────
{
  const bounded = accountReplay([10, POISON_PCT, -10], 100, 100);
  check('D1 bounded replay skips the poisoned close mid-stream', approx(bounded.endBalance, 99) && bounded.trades === 2, `end=${bounded.endBalance}`);
  const binary = accountReplay([900, -50]); // weather/sports semantics: a 10c YES win is +900%
  check('D2 unbounded replay still applies a +900% binary close (legacy behavior)', approx(binary.endBalance, 500), `end=${binary.endBalance}`);
  const neg = accountReplay([-100, 50], 100, 100);
  check('D3 a −100% close zeroes the balance and it stays zero', neg.endBalance === 0, `end=${neg.endBalance}`);
}

// ── E. aggregateKalshiStats ──────────────────────────────────────────────
{
  const ctxRows = [
    ...sanePcts.slice(0, 20).map((net_pct) => ({
      strategy: 'orb', ticker: 'KXMUPERP', direction: 'long', session_et: 'regular',
      spread_bps: 5, atr_pct: 0.7, funding_rate_at_entry: 0.01, htf_aligned: true, hour_et: 17, vp_position: null, net_pct,
    })),
    {
      strategy: 'orb', ticker: 'KXMUPERP', direction: 'long', session_et: 'regular',
      spread_bps: 5, atr_pct: 0.7, funding_rate_at_entry: 0.01, htf_aligned: true, hour_et: 17, vp_position: null, net_pct: POISON_PCT,
    },
  ];
  const stats = aggregateKalshiStats(ctxRows as any[]);
  const all = stats.find((s) => s.strategy === 'orb' && s.dim === 'all');
  check('E1 poisoned net_pct contributes nothing to the all bucket', !!all && all.n === 20, `n=${all?.n}`);
  check('E2 bucket median stays in the lane geometry', !!all && Math.abs(all.medianNet) <= 8, `median=${all?.medianNet}`);
  check('E3 bucket win rate stays a rate', !!all && all.winRate >= 0 && all.winRate <= 1, `wr=${all?.winRate}`);
}

// ── F. source pins ───────────────────────────────────────────────────────
{
  const lane = readFileSync(new URL('../server/services/kalshi-stock-shadow.ts', import.meta.url), 'utf8');
  const ensure = readFileSync(new URL('../server/services/ensure-kalshi-perp-shadow-tables.ts', import.meta.url), 'utf8');
  const panel = readFileSync(new URL('../client/src/components/kalshi-shadow-panel.tsx', import.meta.url), 'utf8');
  const weather = readFileSync(new URL('../server/services/kalshi-weather-shadow.ts', import.meta.url), 'utf8');
  const sports = readFileSync(new URL('../server/services/kalshi-sports-shadow.ts', import.meta.url), 'utf8');

  check('F1 closeTrade consults shadowCloseInvalidReason', lane.includes('shadowCloseInvalidReason({'));
  check('F2 closeTrade stamps stats_invalid_reason', lane.includes('stats_invalid_reason=$10'));
  check('F3 closeTrade quarantine forces exclusion before the write', /if \(invalidReason\) \{\s*exclude = true;/.test(lane));
  check('F4 report validCloseWhere carries the read-time bound', lane.includes('abs(return_pct) <= $3::float'));
  check('F5 bucket-stats query carries the net_pct bound', lane.includes('abs(c.net_pct) <= $2::float'));
  check('F6 recent-closes query carries the bound', lane.includes('abs(t.return_pct) <= $3::float'));
  check('F7 invalid count query counts stamps + read-time failures', lane.includes('stats_invalid_reason IS NOT NULL') && lane.includes('invalid_count'));
  check('F8 report summary surfaces invalidExcludedCount', lane.includes('invalidExcludedCount: Number((invalidRes.rows[0]'));
  check('F9 perp report passes the bound into both accountReplay calls',
    lane.includes('accountReplay(windowCloses, 100, maxValidReturnPct())') && lane.includes('accountReplay(list, 100, maxValidReturnPct())'));
  check('F10 weather lane replay stays unbounded (binary semantics)', !/accountReplay\([^)]*maxValid/.test(weather));
  check('F11 sports lane replay stays unbounded (binary semantics)', !/accountReplay\([^)]*maxValid/.test(sports));
  check('F12 entry cross-check: touch vs H1 close', lane.includes('disagrees with H1 close'));
  check('F13 lazy column for the invalid stamp', ensure.includes('ADD COLUMN IF NOT EXISTS stats_invalid_reason text'));
  check('F14 panel renders the quarantine note', panel.includes('invalidExcludedCount') && panel.includes('quarantined'));
  check('F15 aggregateKalshiStats filters by the validity helper', lane.includes('if (!isValidShadowReturnPct(v)) continue;'));
}

// ── H. the production shape: off-scale ENTRY, corrupt notional ──────────
// Per-strategy attribution from the signed-in survey: the whole blow-up
// sits in opt_volume_profile (−$924,181,878,092,900.50 of the
// −$924,181,878,093,150.60 total) with a SANE avg −1.75R — so the corrupt
// field is notional_usd, not return_pct. Reconstruction: one trade whose
// entry print was ~9.24e14 (contracts = max(1, round(250/entry)) = 1, so
// notional = entry), closed at a sane exit: gross ≈ −100.00, net ≈
// −100.05 (matching that strategy's $100 view: $100 → −$0.05, −100.05%),
// r = net/sl_pct ≈ −25 (one such row among ~15 sane rows ⇒ avg ≈ −1.75R).
{
  const entry = 924_181_878_092_900;
  const exit = 92.42;
  const gross = ((exit - entry) / entry) * 100;
  const net = gross + 0.19 - 0.24; // funding +0.19, exact-era cost 0.24
  const contribution = (entry * net) / 100; // notional = entry (1 contract)
  check('H1 reconstructed row reproduces the strategy blow-up within 1%',
    Math.abs(contribution - -924_181_878_092_900.5) / 924_181_878_092_900.5 < 0.01, `contribution=${contribution}`);
  check('H2 its return_pct is a plausible-looking ≈ −100.05 (return-only guards nearly miss it)',
    Math.abs(net - -100.05) < 0.1, `net=${net}`);
  check('H3 shadowCloseInvalidReason names the root field: entry_price (above the $1M ceiling)', shadowCloseInvalidReason({
    entryPrice: entry, exitPrice: exit, grossPct: gross, fundingPct: 0.19, netPct: net,
    notionalUsd: entry, targetNotionalUsd: 250,
  }) === 'entry_price');
  check('H4 a notional inconsistent with its own sane entry => notional', !isValidShadowNotional(100, entry, 250)
    && shadowCloseInvalidReason({
      entryPrice: 100, exitPrice: 96, grossPct: -4, fundingPct: 0, netPct: -4.24,
      notionalUsd: entry, targetNotionalUsd: 250,
    }) === 'notional');
  check('H5 BTC-class row stays valid (entry 97000, 1 contract, notional = entry)',
    isValidShadowNotional(97_000, 97_000, 250) && shadowCloseInvalidReason({
      entryPrice: 97_000, exitPrice: 93_120, grossPct: -4, fundingPct: -0.1, netPct: -4.34,
      notionalUsd: 97_000, targetNotionalUsd: 250,
    }) === null);
  check('H6 ordinary row stays valid (entry 412.50, 1 contract, notional = entry)',
    isValidShadowNotional(412.5, 412.5, 250));
  check('H7 rounded-up sizing stays valid (entry 100, 3 contracts, notional 300)',
    isValidShadowNotional(100, 300, 250));
  check('H8 an entry above the $1M ceiling (2e6) => entry_price', shadowCloseInvalidReason({
    entryPrice: 2_000_000, exitPrice: 100, grossPct: -99.99, fundingPct: 0, netPct: -100.23,
    notionalUsd: 2_000_000, targetNotionalUsd: 250,
  }) === 'entry_price');
  // Documented boundary: an off-scale-but-sub-ceiling entry (999,999 for
  // a $100 asset) whose net lands inside ±100 passes close validation —
  // its defense is the entry-time touch-vs-candle cross-check (F12),
  // which compares two independent price sources before any row exists.
  check('H8b sub-ceiling boundary is the cross-check\u2019s job, not the close validator\u2019s', shadowCloseInvalidReason({
    entryPrice: 999_999, exitPrice: 500_000, grossPct: -50, fundingPct: 0, netPct: -50.24,
    notionalUsd: 999_999, targetNotionalUsd: 250,
  }) === null);
  check('H9 maxValidNotionalUsd follows the sizing construction',
    maxValidNotionalUsd(100, 250) === 500 && maxValidNotionalUsd(97_000, 250) === 145_500);
  const lane = readFileSync(new URL('../server/services/kalshi-stock-shadow.ts', import.meta.url), 'utf8');
  check('H10 report queries carry the SQL notional bound', lane.includes('notional_usd <= greatest($4::float, entry_price * 1.5)'));
  check('H11 invalid count includes read-time notional + entry failures',
    lane.includes('notional_usd > greatest($4::float, entry_price * 1.5)') && lane.includes('entry_price > $5::float'));
  check('H13 report queries carry the SQL entry ceiling', lane.includes('entry_price <= $5::float'));
  check('H12 closeTrade passes the row notional into the validator', lane.includes('notionalUsd: t.notional_usd, targetNotionalUsd: NOTIONAL()'));
}

// ── G. PR #94 exact-cost semantics untouched ─────────────────────────────
{
  const lane = readFileSync(new URL('../server/services/kalshi-stock-shadow.ts', import.meta.url), 'utf8');
  const costs = readFileSync(new URL('../server/services/kalshi-perp-costs.ts', import.meta.url), 'utf8');
  check('G1 funding_model close stamp intact', lane.includes('funding_model=CASE WHEN $9::text IS NOT NULL THEN $9 ELSE funding_model END'));
  check('G2 costs module deadband + cap intact', costs.includes('FUNDING_DEADBAND') && costs.includes('FUNDING_CAP'));
  check('G3 exact-era accrual path intact', lane.includes('accrueFundingFromPrints({'));
}

console.log(`\n${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
