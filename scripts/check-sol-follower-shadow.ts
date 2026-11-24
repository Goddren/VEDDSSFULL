/**
 * Sol FOLLOWER (copy-trade) SHADOW lane — verification checks.
 *
 * Run:  node --import tsx/esm scripts/check-sol-follower-shadow.ts
 *
 * No database, no RPC and no wallet are touched: the lane's parsing and
 * mirror math are pure and are walked on synthetic parsed transactions
 * (a leader buy, a partial sell, a graduated-token exit, a failed tx),
 * and the wiring is pinned by source checks — the lane is shadow-only by
 * construction (no order path exists in its module), the lesson gate
 * reads the lane AS A WHOLE (never per token), mirrors land in the
 * shared ledger under their own arm, and stale leader events can never
 * open a mirror.
 *
 *   A. Address validation (base58 / 32-byte).
 *   B. Leader event parsing from parsed transactions.
 *   C. Staleness — old events are records, never entries.
 *   D. Mirror close math (proportional closes, full-exit rule, blending).
 *   E. Per-wallet verdicts against the go-live bar.
 *   F. Kill switch.
 *   G. Source pins — shadow-only, ledger arm, lane-wide gate, wiring.
 *   H. Go-live bar shape (what the shared shadow→live toggle will read).
 */
import { readFileSync } from 'node:fs';
import {
  isValidSolanaAddress, decodeBase58, parseLeaderEvents, leaderPriceUsd, eventIsFresh,
  mirrorClosePlan, blendRealizedPct, finalGrossPct, walletVerdict,
  solFollowerShadowOn, FOLLOWER_LIVE_BAR, PUMP_FUN_PROGRAM_ID, WSOL_MINT,
} from '../server/services/sol-follower';

let failures = 0;
function check(name: string, cond: boolean, detail = ''): void {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!cond) failures++;
}
const src = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

const WALLET = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
const PUMP_MINT = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU'; // non-pump suffix on purpose in one test
const PUMP_MINT_SUFFIX = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDpump';
const PLAIN_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ── A. Address validation ────────────────────────────────────────────────
check('A1 wrapped-SOL mint address is a valid wallet shape', isValidSolanaAddress(WSOL_MINT) === true);
check('A2 system program address valid', isValidSolanaAddress('11111111111111111111111111111111') === true);
check('A3 base58-invalid characters rejected', isValidSolanaAddress('0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl0OIl') === false);
check('A4 too-short rejected', isValidSolanaAddress('9WzDXwBbmkg8') === false);
check('A5 empty / non-string rejected', isValidSolanaAddress('') === false && isValidSolanaAddress(undefined) === false && isValidSolanaAddress(42) === false);
check('A6 decode: 32 ones = 32 zero bytes', (() => { const d = decodeBase58('11111111111111111111111111111111'); return !!d && d.length === 32 && d.every((b) => b === 0); })());
check('A7 whitespace is trimmed before validation', isValidSolanaAddress(`  ${WSOL_MINT}  `) === true);

// ── B. Leader event parsing ──────────────────────────────────────────────
function mkTx(over: any = {}): any {
  return {
    blockTime: 1_763_000_000,
    meta: {
      err: null,
      preBalances: [10_000_000_000], postBalances: [8_000_000_000],
      preTokenBalances: [], postTokenBalances: [],
      innerInstructions: [],
      ...(over.meta ?? {}),
    },
    transaction: {
      signatures: ['sig_test_1'],
      message: {
        accountKeys: [{ pubkey: WALLET, signer: true, writable: true }, { pubkey: PUMP_FUN_PROGRAM_ID }],
        instructions: [{ programId: PUMP_FUN_PROGRAM_ID, accounts: [], data: '' }],
        ...(over.message ?? {}),
      },
    },
  };
}
const bal = (mint: string, amt: number, owner = WALLET) => ({ accountIndex: 3, mint, owner, uiTokenAmount: { uiAmount: amt } });

{
  const tx = mkTx({ meta: { preTokenBalances: [bal(PUMP_MINT, 0)], postTokenBalances: [bal(PUMP_MINT, 5000)] } });
  const evs = parseLeaderEvents(tx, WALLET);
  check('B1 pump.fun buy detected', evs.length === 1 && evs[0].side === 'buy' && evs[0].mint === PUMP_MINT);
  check('B2 buy size + SOL leg read', evs[0]?.tokenAmount === 5000 && Math.abs((evs[0]?.solAmount ?? 0) - 2) < 1e-9);
  check('B3 event carries block time + signature', evs[0]?.eventAt === 1_763_000_000_000 && evs[0]?.signature === 'sig_test_1');
}
{
  const tx = mkTx({ meta: { preTokenBalances: [bal(PUMP_MINT, 5000)], postTokenBalances: [bal(PUMP_MINT, 2000)], preBalances: [8_000_000_000], postBalances: [9_000_000_000] } });
  const evs = parseLeaderEvents(tx, WALLET);
  check('B4 partial sell: fraction of pre-balance sold', evs.length === 1 && evs[0].side === 'sell' && Math.abs((evs[0].sellFraction ?? 0) - 0.6) < 1e-9 && evs[0].tokenAmount === 3000);
}
{
  // Graduated token: no pump.fun program in the tx, mint keeps its suffix.
  const tx = mkTx({ message: { instructions: [{ programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', accounts: [], data: '' }] },
                    meta: { preTokenBalances: [bal(PUMP_MINT_SUFFIX, 1000)], postTokenBalances: [bal(PUMP_MINT_SUFFIX, 0)] } });
  const evs = parseLeaderEvents(tx, WALLET);
  check('B5 graduated-token exit detected via mint suffix', evs.length === 1 && evs[0].side === 'sell' && evs[0].sellFraction === 1);
}
{
  const tx = mkTx({ message: { instructions: [{ programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', accounts: [], data: '' }] },
                    meta: { preTokenBalances: [bal(PLAIN_MINT, 0)], postTokenBalances: [bal(PLAIN_MINT, 100)] } });
  check('B6 non-pump token in a non-pump tx is ignored', parseLeaderEvents(tx, WALLET).length === 0);
}
{
  const tx = mkTx({ meta: { preTokenBalances: [bal(WSOL_MINT, 0)], postTokenBalances: [bal(WSOL_MINT, 3)] } });
  check('B7 WSOL movements are not trade events', parseLeaderEvents(tx, WALLET).length === 0);
}
{
  const tx = mkTx({ meta: { err: { InstructionError: [0, 'Custom'] }, preTokenBalances: [bal(PUMP_MINT, 0)], postTokenBalances: [bal(PUMP_MINT, 5000)] } });
  check('B8 failed transactions produce no events', parseLeaderEvents(tx, WALLET).length === 0);
}
{
  const other = '4Nd1mPzV3kEeXkCkvnFqHmhqMrhKkPkZSHarEqgBrpK';
  const tx = mkTx({ meta: { preTokenBalances: [bal(PUMP_MINT, 0, other)], postTokenBalances: [bal(PUMP_MINT, 5000, other)] } });
  check("B9 another wallet's balances are not the leader's events", parseLeaderEvents(tx, WALLET).length === 0);
}
check('B10 leader price from the two legs', Math.abs((leaderPriceUsd({ solAmount: 2, tokenAmount: 5000 }, 150) ?? 0) - 0.06) < 1e-9);
check('B11 leader price is null when a leg is unknown', leaderPriceUsd({ solAmount: null, tokenAmount: 5 }, 150) === null && leaderPriceUsd({ solAmount: 2, tokenAmount: 5 }, null) === null);
{
  // Pump program reached only through an inner instruction (aggregator route).
  const tx = mkTx({ message: { instructions: [{ programId: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', accounts: [], data: '' }] },
                    meta: { innerInstructions: [{ index: 0, instructions: [{ programId: PUMP_FUN_PROGRAM_ID, accounts: [], data: '' }] }],
                            preTokenBalances: [bal(PLAIN_MINT, 0)], postTokenBalances: [bal(PLAIN_MINT, 250)] } });
  check('B12 pump program via inner instruction counts', parseLeaderEvents(tx, WALLET).length === 1);
}

// ── C. Staleness ─────────────────────────────────────────────────────────
const NOW = 1_763_100_000_000;
check('C1 60s-old event is fresh at a 120s cap', eventIsFresh(NOW - 60_000, NOW, 120) === true);
check('C2 121s-old event is stale at a 120s cap', eventIsFresh(NOW - 121_000, NOW, 120) === false);
check('C3 exactly at the cap is fresh', eventIsFresh(NOW - 120_000, NOW, 120) === true);
check('C4 unknown block time (0) on a just-fetched tx is fresh, not ancient', eventIsFresh(0, NOW, 120) === true);

// ── D. Mirror close math ─────────────────────────────────────────────────
check('D1 half sell closes half the mirror', (() => { const p = mirrorClosePlan(1, 0.5); return p.closeFractionOfOriginal === 0.5 && !p.fullExit; })());
check('D2 half of the remaining half is a quarter overall', (() => { const p = mirrorClosePlan(0.5, 0.5); return p.closeFractionOfOriginal === 0.25 && !p.fullExit; })());
check('D3 a 99% sell is a full exit of everything left', (() => { const p = mirrorClosePlan(0.4, 0.99); return p.fullExit && p.closeFractionOfOriginal === 0.4; })());
check('D4 a remainder under 1% closes in full', (() => { const p = mirrorClosePlan(0.015, 0.5); return p.fullExit && p.closeFractionOfOriginal === 0.015; })());
check('D5 partial closes bank fraction-weighted gross', blendRealizedPct(0, 0.5, 20) === 10 && blendRealizedPct(10, 0.25, -8) === 8);
check('D6 final gross blends banked + remainder', finalGrossPct(10, 0.5, -10) === 5);
check('D7 sell fractions are clamped to [0,1]', (() => { const p = mirrorClosePlan(1, 1.7); return p.fullExit && p.closeFractionOfOriginal === 1; })());

// ── E. Per-wallet verdicts ───────────────────────────────────────────────
check('E1 under 10 closed mirrors is learning', walletVerdict({ trades: 5, wins: 5, avgNetPct: 40, avgR: 1, weeklyNetPct: [40] }).verdict === 'learning');
check('E2 clearing the whole bar is proven', walletVerdict({ trades: 50, wins: 25, avgNetPct: 2, avgR: 0.3, weeklyNetPct: [1, 2, 0] }).verdict === 'proven');
check('E3 50+ losing mirrors at ≤40% wins is losing', walletVerdict({ trades: 60, wins: 20, avgNetPct: -3, avgR: -0.4, weeklyNetPct: [-5, -4] }).verdict === 'losing');
check('E4 mid-record is proving', walletVerdict({ trades: 30, wins: 15, avgNetPct: 1, avgR: 0.1, weeklyNetPct: [2] }).verdict === 'proving');
check('E5 a losing week keeps a strong record at proving, not proven', walletVerdict({ trades: 50, wins: 25, avgNetPct: 2, avgR: 0.3, weeklyNetPct: [5, -1] }).verdict === 'proving');

// ── F. Kill switch ───────────────────────────────────────────────────────
check('F1 lane defaults ON', solFollowerShadowOn() === true);
process.env.SOL_FOLLOWER_SHADOW = 'off';
check('F2 SOL_FOLLOWER_SHADOW=off disables the lane', solFollowerShadowOn() === false);
delete process.env.SOL_FOLLOWER_SHADOW;

// ── G. Source pins ───────────────────────────────────────────────────────
const follower = src('../server/services/sol-follower.ts');
const gate = src('../server/services/shadow-lesson-gate.ts');
const ledger = src('../server/services/shadow-ledger.ts');
const routes = src('../server/routes.ts');
const index = src('../server/index.ts');
const scannerPage = src('../client/src/pages/solana-scanner.tsx');
const panel = src('../client/src/components/sol/sol-follower-panel.tsx');
const sw = src('../client/public/sw.js');

check('G1 shadow-only: the lane module has no order path', !/sendTransaction|signTransaction|VersionedTransaction|defi-swap|cefi-executor|executeSignal|placeOrder/.test(follower));
check('G2 shadow-only: the lane module holds no wallet keys', !/privateKey|secretKey|Keypair/.test(follower));
check('G3 kill switch wired in the lane module', follower.includes("process.env.SOL_FOLLOWER_SHADOW !== 'off'"));
check('G4 stale buys are refused before any mirror opens', follower.indexOf('skipped_stale') > -1 && follower.indexOf('skipped_stale') < follower.indexOf('INSERT INTO sol_follower_positions'));
check('G5 first poll seeds the cursor — history is never replayed', follower.includes('seed the cursor') && follower.includes('last_signature'));
check('G6 ledger carries the sol_follower_shadow arm', ledger.includes("'sol_follower_shadow'") && ledger.includes('FROM sol_follower_positions'));
check('G7 lesson gate reads the follower arm', gate.includes("source='sol_follower_shadow'") && gate.includes('getSolFollowerLessonVerdict'));
check('G8 the gate verdict is lane-wide (no per-strategy/per-token grouping in it)', (() => {
  const body = gate.slice(gate.indexOf('getSolFollowerLessonVerdict'));
  return !/GROUP BY strategy/.test(body) && !/GROUP BY.*symbol/.test(body) && !/GROUP BY.*mint/.test(body);
})());
check('G9 blocks are audited to the shared table under the follower lane', follower.includes("lane: 'sol_follower_shadow'") && follower.includes('logShadowLessonBlock'));
check('G10 routes registered (report + follow + unfollow)', routes.includes('"/api/sol-follower"') && routes.includes('"/api/sol-follower/wallets"') && routes.includes('"/api/sol-follower/wallets/:id"'));
check('G11 follow-list writes validate the address server-side', follower.includes('isValidSolanaAddress(wallet)') && routes.includes('addFollowedWallet'));
check('G12 poller started at boot', index.includes('startSolFollowerShadow'));
check('G13 panel mounted on the Sol engine page', scannerPage.includes('SolFollowerPanel') && panel.includes('data-testid="sol-follower-panel"'));
check('G14 backstops present (TP / SL / max hold)', follower.includes("closePositionFully(pos, gross, 'tp')") && follower.includes("closePositionFully(pos, gross, 'sl')") && follower.includes("'max_hold'"));
check('G15 entry lag is a recorded, reported stat', follower.includes('entry_lag_sec') && follower.includes('avgEntryLagSec'));
check('G16 sw bumped for the client change', sw.includes("CACHE_VERSION = 'vedd-v293'"));

// ── H. Go-live bar shape ─────────────────────────────────────────────────
check('H1 the bar matches the other lanes (50 trades, 40% wins)', FOLLOWER_LIVE_BAR.trades === 50 && FOLLOWER_LIVE_BAR.winRate === 0.4);
check('H2 the report exposes per-wallet R (the toggle reads R-shaped stats)', follower.includes('avgR') && follower.includes('getSolFollowerReport'));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nALL CHECKS PASSED');
process.exit(failures ? 1 : 0);
