// ─────────────────────────────────────────────────────────────────────────────
// Sol FOLLOWER (copy-trade) SHADOW lane — 2026-11-15, Chris's request.
//
// Pump Scalp 60 follows the top pump.fun traders' PATTERN. This lane is the
// literal version Chris asked for next: the user saves specific Solana
// wallets they follow, the lane watches those wallets' pump.fun trades, and
// mirrors them VIRTUALLY — a buy opens a shadow mirror position, a sell
// closes the same fraction of it. Every mirror is scored per LEADER WALLET
// (trades, win rate, net return after modeled costs, and the entry lag vs
// the leader — copy-trading lives or dies on that lag), so a future go-live
// decision reads a per-wallet record, not a vibe.
//
// SHADOW-ONLY BY CONSTRUCTION: this module holds no wallet keys, imports no
// swap/executor code and exposes no order path. Mirrors live in
// sol_follower_positions and land in the shared shadow ledger under the
// 'sol_follower_shadow' arm (strategy = leader wallet), where the PR #68
// lesson gate reads the LANE AS A WHOLE (per strategy/wallet-lane, never
// per token — Chris's standing rule: pump.fun tokens are disposable, a
// per-token guard is worthless; per-WALLET records are the point here).
//
// FEED: plain Solana JSON-RPC polling (SOLANA_RPC_URL when configured —
// production points it at Helius — else the public endpoint). No webhook
// infra exists in this app, so each followed wallet is polled every
// SOL_FOLLOWER_POLL_MS (default 30s): getSignaturesForAddress since the
// stored cursor, then getParsedTransaction per new signature. A leader
// event is a token-balance change for the wallet in a transaction that
// touches the pump.fun program OR moves a mint ending in 'pump' (pump.fun
// mints carry that suffix, including after graduation to Raydium, where
// leader exits usually happen). Expected detection lag: one poll interval
// plus RPC confirmation — typically ~30–75s behind the leader. That lag is
// measured on every mirror (entry_lag_sec) and reported, never hidden.
//
// STALENESS: an event older than SOL_FOLLOWER_MAX_EVENT_AGE_SEC (default
// 120s) at detection NEVER opens a mirror — it is recorded as skipped so
// the record shows what was missed. A feed outage therefore produces no
// mirrors, never bad ones (fail-open).
//
// MIRROR RULES:
//   • BUY  → open one mirror per (wallet, mint) at the current DexScreener
//     reference price, nominal SOL_FOLLOWER_SIZE_SOL (default 0.25 SOL,
//     the Sol shadow lanes' size). Repeat buys while a mirror is open are
//     recorded but not added to (v1: one mirror per leader position).
//   • SELL → close the SAME FRACTION of the remaining mirror as the leader
//     sold of their own balance (from the tx's pre/post token balances).
//     A ≥99% sell — or a remainder under 1% — closes the mirror fully
//     ('leader_exit'). Partial closes bank their fraction of the result.
//   • BACKSTOPS (the leader going silent is the normal pump.fun ending):
//     take-profit +SOL_FOLLOWER_TP_PCT (default 100%), stop-loss
//     −SOL_FOLLOWER_SL_PCT (default 30%), hard max hold
//     SOL_FOLLOWER_MAX_HOLD_MIN (default 360 min). Caps:
//     SOL_FOLLOWER_MAX_OPEN (20) per user, SOL_FOLLOWER_MAX_PER_WALLET (5).
//   • Costs: the paper-cost model (paper-costs.ts) round-trip estimate for
//     the pumpfun DEX, stamped at entry; results are NET of it.
//
// Kill switch: SOL_FOLLOWER_SHADOW=off (poller never starts; the panel
// reports the lane as off). Lesson gate kill switch: SOL_SHADOW_LESSONS=off
// (shared with the Sol shadow lane, shadow-lesson-gate.ts).
// ─────────────────────────────────────────────────────────────────────────────
import { pool } from '../db';
import { estimateSolRoundTripCost } from './paper-costs';

// ── Config ───────────────────────────────────────────────────────────────
const _envInt = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? Math.floor(v) : d; };
const _envNum = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };

export const solFollowerShadowOn = (): boolean => process.env.SOL_FOLLOWER_SHADOW !== 'off';
export const FOLLOWER_POLL_MS = _envInt('SOL_FOLLOWER_POLL_MS', 30_000);
export const FOLLOWER_MAX_EVENT_AGE_SEC = _envInt('SOL_FOLLOWER_MAX_EVENT_AGE_SEC', 120);
export const FOLLOWER_SIZE_SOL = _envNum('SOL_FOLLOWER_SIZE_SOL', 0.25);
export const FOLLOWER_MAX_OPEN = _envInt('SOL_FOLLOWER_MAX_OPEN', 20);
export const FOLLOWER_MAX_PER_WALLET = _envInt('SOL_FOLLOWER_MAX_PER_WALLET', 5);
export const FOLLOWER_TP_PCT = _envNum('SOL_FOLLOWER_TP_PCT', 100);
export const FOLLOWER_SL_PCT = _envNum('SOL_FOLLOWER_SL_PCT', 30);
export const FOLLOWER_MAX_HOLD_MIN = _envInt('SOL_FOLLOWER_MAX_HOLD_MIN', 360);

export const PUMP_FUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
export const WSOL_MINT = 'So11111111111111111111111111111111111111112';

// ── Address validation (pure) ────────────────────────────────────────────
const B58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const B58_MAP = new Map(Array.from(B58_ALPHABET).map((c, i) => [c, i]));

/** Decode a base58 string; null on any invalid character. */
export function decodeBase58(s: string): Uint8Array | null {
  if (!s || typeof s !== 'string') return null;
  const le: number[] = [0]; // little-endian accumulator
  for (const ch of s) {
    const v = B58_MAP.get(ch);
    if (v === undefined) return null;
    let carry = v;
    for (let i = 0; i < le.length; i++) {
      const x = le[i] * 58 + carry;
      le[i] = x & 0xff;
      carry = x >> 8;
    }
    while (carry > 0) { le.push(carry & 0xff); carry >>= 8; }
  }
  // The numeric value's high zero bytes contribute nothing; each leading
  // '1' contributes exactly one zero byte.
  let n = le.length;
  while (n > 0 && le[n - 1] === 0) n--;
  let zeros = 0;
  while (zeros < s.length && s[zeros] === '1') zeros++;
  const out = new Uint8Array(zeros + n);
  for (let i = 0; i < n; i++) out[zeros + n - 1 - i] = le[i];
  return out;
}

/** A Solana wallet address: base58, decodes to exactly 32 bytes. */
export function isValidSolanaAddress(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 32 || t.length > 44) return false;
  const decoded = decodeBase58(t);
  return !!decoded && decoded.length === 32;
}

// ── Leader transaction parsing (pure) ────────────────────────────────────
export interface LeaderEvent {
  signature: string;
  wallet: string;
  side: 'buy' | 'sell';
  mint: string;
  /** Token amount moved, UI units, always positive. */
  tokenAmount: number;
  /** Sells only: fraction of the leader's pre-tx balance that was sold (0..1). */
  sellFraction: number | null;
  /** SOL spent (buy) or received (sell), approximate (a buy's figure
   *  includes the network fee — it is a reference, not an audit). */
  solAmount: number | null;
  /** Block time, ms epoch; 0 when the RPC response carried none. */
  eventAt: number;
}

const keyStr = (k: any): string => (typeof k === 'string' ? k : k?.pubkey ?? '');

/** pump.fun mints end in 'pump' — true on the bonding curve and after
 *  graduation, which is where leader exits usually print. */
export function isPumpFunMint(mint: string): boolean {
  return typeof mint === 'string' && mint.endsWith('pump');
}

/** True when any instruction (top-level or inner) targets the pump.fun program. */
export function txInvolvesPumpFun(tx: any): boolean {
  const msg = tx?.transaction?.message;
  if (!msg) return false;
  const keys: string[] = (msg.accountKeys ?? []).map(keyStr);
  const hits = (ix: any): boolean => {
    if (!ix) return false;
    if (ix.programId) return ix.programId === PUMP_FUN_PROGRAM_ID;
    if (typeof ix.programIdIndex === 'number') return keys[ix.programIdIndex] === PUMP_FUN_PROGRAM_ID;
    return false;
  };
  if ((msg.instructions ?? []).some(hits)) return true;
  for (const inner of tx?.meta?.innerInstructions ?? []) {
    if ((inner?.instructions ?? []).some(hits)) return true;
  }
  return false;
}

/**
 * Extract a wallet's pump.fun trade events from one parsed transaction.
 * An event is a change in the wallet's own token balance for a mint, in a
 * transaction that touches the pump.fun program OR moves a 'pump'-suffixed
 * mint. Failed transactions and WSOL movements never produce events.
 */
export function parseLeaderEvents(tx: any, wallet: string): LeaderEvent[] {
  if (!tx || tx?.meta?.err) return [];
  const msg = tx?.transaction?.message;
  if (!msg) return [];
  const keys: string[] = (msg.accountKeys ?? []).map(keyStr);
  const walletIdx = keys.indexOf(wallet);
  const pumpInvolved = txInvolvesPumpFun(tx);

  const balOf = (list: any[] | undefined) => {
    const m = new Map<string, number>();
    for (const b of list ?? []) {
      const owner = b?.owner ?? (typeof b?.accountIndex === 'number' ? keys[b.accountIndex] : undefined);
      if (owner !== wallet) continue;
      const amt = Number(b?.uiTokenAmount?.uiAmount ?? 0) || 0;
      m.set(b.mint, amt);
    }
    return m;
  };
  const pre = balOf(tx?.meta?.preTokenBalances);
  const post = balOf(tx?.meta?.postTokenBalances);

  let solDelta: number | null = null;
  if (walletIdx >= 0 && Array.isArray(tx?.meta?.preBalances) && Array.isArray(tx?.meta?.postBalances)) {
    const d = (Number(tx.meta.postBalances[walletIdx]) || 0) - (Number(tx.meta.preBalances[walletIdx]) || 0);
    solDelta = d / 1e9;
  }

  const eventAt = Number(tx?.blockTime) > 0 ? Number(tx.blockTime) * 1000 : 0;
  const signature = tx?.transaction?.signatures?.[0] ?? '';
  const out: LeaderEvent[] = [];
  for (const mint of Array.from(new Set(Array.from(pre.keys()).concat(Array.from(post.keys()))))) {
    if (mint === WSOL_MINT) continue;
    const delta = (post.get(mint) ?? 0) - (pre.get(mint) ?? 0);
    if (!delta || !Number.isFinite(delta)) continue;
    if (!pumpInvolved && !isPumpFunMint(mint)) continue;
    if (delta > 0) {
      out.push({ signature, wallet, side: 'buy', mint, tokenAmount: delta, sellFraction: null, solAmount: solDelta != null && solDelta < 0 ? -solDelta : null, eventAt });
    } else {
      const preAmt = pre.get(mint) ?? 0;
      const frac = preAmt > 0 ? Math.min(1, -delta / preAmt) : 1;
      out.push({ signature, wallet, side: 'sell', mint, tokenAmount: -delta, sellFraction: frac, solAmount: solDelta != null && solDelta > 0 ? solDelta : null, eventAt });
    }
  }
  return out;
}

/** The leader's approximate USD price per token, when both legs are known. */
export function leaderPriceUsd(ev: Pick<LeaderEvent, 'solAmount' | 'tokenAmount'>, solUsd: number | null): number | null {
  if (ev.solAmount == null || !(ev.solAmount > 0) || !(ev.tokenAmount > 0) || solUsd == null || !(solUsd > 0)) return null;
  return (ev.solAmount / ev.tokenAmount) * solUsd;
}

/** Stale events never open mirrors. Unknown block time (0) on a
 *  just-fetched transaction is treated as fresh — it came off the newest
 *  signatures page — never as ancient. */
export function eventIsFresh(eventAtMs: number, nowMs: number, maxAgeSec: number): boolean {
  if (!eventAtMs) return true;
  if (eventAtMs > nowMs + 30_000) return true; // clock skew guard
  return nowMs - eventAtMs <= maxAgeSec * 1000;
}

// ── Mirror math (pure) ───────────────────────────────────────────────────
export interface MirrorClosePlan { closeFractionOfOriginal: number; fullExit: boolean }

/**
 * The mirror closes the same fraction of its REMAINING size as the leader
 * sold of theirs. A ≥99% leader sell — or a remainder under 1% of the
 * original — closes the mirror in full.
 */
export function mirrorClosePlan(remainingFraction: number, sellFraction: number): MirrorClosePlan {
  const rem = Math.max(0, Math.min(1, remainingFraction));
  const f = Math.max(0, Math.min(1, sellFraction));
  if (f >= 0.99 || rem - rem * f < 0.01) return { closeFractionOfOriginal: rem, fullExit: true };
  return { closeFractionOfOriginal: rem * f, fullExit: false };
}

/** Bank a partial close: realized result is fraction-weighted gross %. */
export function blendRealizedPct(realizedPct: number, closeFractionOfOriginal: number, grossPctAtClose: number): number {
  return realizedPct + closeFractionOfOriginal * grossPctAtClose;
}

/** Final gross % once the remainder closes at grossPctAtClose. */
export function finalGrossPct(realizedPct: number, remainingFraction: number, grossPctAtClose: number): number {
  return realizedPct + remainingFraction * grossPctAtClose;
}

// ── Per-wallet verdict (pure) ────────────────────────────────────────────
export interface WalletBarStats {
  trades: number;
  wins: number;
  avgNetPct: number;
  avgR: number;
  /** Net % summed per calendar week (oldest → newest), closed mirrors only. */
  weeklyNetPct: number[];
}

/** The go-live bar this lane's record is judged against — the same shape
 *  as the other lanes' readiness bars (50+ trades, 40%+ wins, positive
 *  average, no losing week). Exposed for the shared shadow→live toggle. */
export const FOLLOWER_LIVE_BAR = { trades: 50, winRate: 0.4 };

export function walletVerdict(s: WalletBarStats): { verdict: 'learning' | 'proving' | 'proven' | 'losing'; line: string } {
  const wr = s.trades > 0 ? s.wins / s.trades : 0;
  if (s.trades < 10) return { verdict: 'learning', line: `Learning — only ${s.trades} closed mirror${s.trades === 1 ? '' : 's'} so far; too early to judge this wallet.` };
  const noLosingWeek = s.weeklyNetPct.length > 0 && s.weeklyNetPct.every((w) => w >= 0);
  if (s.trades >= FOLLOWER_LIVE_BAR.trades && wr >= FOLLOWER_LIVE_BAR.winRate && s.avgNetPct > 0 && noLosingWeek) {
    return { verdict: 'proven', line: `Proven so far — clears the go-live bar (${s.trades} mirrors, ${Math.round(wr * 100)}% wins, avg ${s.avgNetPct >= 0 ? '+' : ''}${s.avgNetPct.toFixed(1)}% net).` };
  }
  if (s.trades >= FOLLOWER_LIVE_BAR.trades && s.avgNetPct < 0 && wr <= FOLLOWER_LIVE_BAR.winRate) {
    return { verdict: 'losing', line: `Losing — ${s.trades} mirrors at ${Math.round(wr * 100)}% wins and ${s.avgNetPct.toFixed(1)}% average net. Copying this wallet has cost money on paper.` };
  }
  return { verdict: 'proving', line: `Proving — ${s.trades}/${FOLLOWER_LIVE_BAR.trades} mirrors toward the bar, ${Math.round(wr * 100)}% wins, avg ${s.avgNetPct >= 0 ? '+' : ''}${s.avgNetPct.toFixed(1)}% net.` };
}

// ── Tables ───────────────────────────────────────────────────────────────
let _ensured: Promise<void> | null = null;
export function ensureSolFollowerTables(): Promise<void> {
  if (!_ensured) {
    _ensured = (async () => {
      await pool.query(`CREATE TABLE IF NOT EXISTS sol_follower_wallets (
        id serial PRIMARY KEY, user_id int NOT NULL, wallet text NOT NULL, label text,
        last_signature text, last_polled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (user_id, wallet))`);
      await pool.query(`CREATE TABLE IF NOT EXISTS sol_follower_positions (
        id text PRIMARY KEY, user_id int NOT NULL, wallet_id int, leader_wallet text NOT NULL, leader_label text,
        mint text NOT NULL, symbol text NOT NULL, status text NOT NULL DEFAULT 'open',
        size_sol double precision NOT NULL, entry_price double precision NOT NULL,
        leader_entry_price double precision, leader_entry_at timestamptz, leader_signature text, leader_size_sol double precision,
        opened_at timestamptz NOT NULL DEFAULT now(), entry_lag_sec double precision,
        remaining_fraction double precision NOT NULL DEFAULT 1, realized_gross_pct double precision NOT NULL DEFAULT 0,
        cost_pct double precision, sl_pct double precision NOT NULL DEFAULT ${FOLLOWER_SL_PCT}, peak_price double precision, last_price double precision,
        closed_at timestamptz, close_reason text, gross_pct double precision, net_pct double precision)`);
      await pool.query(`CREATE INDEX IF NOT EXISTS sol_follower_positions_user_status ON sol_follower_positions (user_id, status)`);
      await pool.query(`CREATE TABLE IF NOT EXISTS sol_follower_events (
        id serial PRIMARY KEY, user_id int NOT NULL, leader_wallet text NOT NULL, signature text,
        side text NOT NULL, mint text NOT NULL, symbol text,
        leader_token_amount double precision, leader_sol double precision, leader_price_usd double precision,
        sell_fraction double precision, event_at timestamptz, detected_at timestamptz NOT NULL DEFAULT now(),
        entry_lag_sec double precision, action text NOT NULL, detail text,
        UNIQUE (user_id, signature, mint, side))`);
    })().catch((e) => { _ensured = null; throw e; });
  }
  return _ensured;
}

// ── Follow-list CRUD ─────────────────────────────────────────────────────
export interface FollowedWallet { id: number; userId: number; wallet: string; label: string | null; createdAt: string }

export async function listFollowedWallets(userId: number): Promise<FollowedWallet[]> {
  await ensureSolFollowerTables();
  const { rows } = await pool.query(
    `SELECT id, user_id, wallet, label, created_at FROM sol_follower_wallets WHERE user_id=$1 ORDER BY id`, [userId]);
  return rows.map((r: any) => ({ id: r.id, userId: r.user_id, wallet: r.wallet, label: r.label, createdAt: r.created_at }));
}

/** Add a wallet to follow. Throws Error with a user-facing message on bad input. */
export async function addFollowedWallet(userId: number, walletRaw: string, labelRaw?: string): Promise<FollowedWallet> {
  const wallet = String(walletRaw ?? '').trim();
  if (!isValidSolanaAddress(wallet)) throw new Error('That does not look like a Solana wallet address.');
  const label = String(labelRaw ?? '').trim().slice(0, 60) || null;
  await ensureSolFollowerTables();
  const { rows } = await pool.query(
    `INSERT INTO sol_follower_wallets (user_id, wallet, label) VALUES ($1,$2,$3)
     ON CONFLICT (user_id, wallet) DO UPDATE SET label = COALESCE(EXCLUDED.label, sol_follower_wallets.label)
     RETURNING id, user_id, wallet, label, created_at`,
    [userId, wallet, label]);
  const r = rows[0];
  return { id: r.id, userId: r.user_id, wallet: r.wallet, label: r.label, createdAt: r.created_at };
}

export async function removeFollowedWallet(userId: number, id: number): Promise<boolean> {
  await ensureSolFollowerTables();
  const { rowCount } = await pool.query(`DELETE FROM sol_follower_wallets WHERE user_id=$1 AND id=$2`, [userId, id]);
  return (rowCount ?? 0) > 0;
}

// ── Prices (DexScreener by mint — the Sol engine's reference source) ─────
export interface MintQuote { price: number; symbol: string | null; liquidityUsd: number | null }

export async function fetchMintQuotes(mints: string[]): Promise<Record<string, MintQuote>> {
  const out: Record<string, MintQuote> = {};
  const unique = Array.from(new Set(mints.filter(Boolean)));
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    try {
      const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${batch.join(',')}`);
      if (!resp.ok) continue;
      const data: any = await resp.json();
      const bestLiq: Record<string, number> = {};
      for (const pair of data?.pairs ?? []) {
        if (pair?.chainId && pair.chainId !== 'solana') continue;
        const mint = pair?.baseToken?.address;
        const price = parseFloat(pair?.priceUsd) || 0;
        if (!mint || price <= 0) continue;
        const liq = pair?.liquidity?.usd || 0;
        if (out[mint] === undefined || liq > (bestLiq[mint] ?? -1)) {
          out[mint] = { price, symbol: pair?.baseToken?.symbol ?? null, liquidityUsd: liq || null };
          bestLiq[mint] = liq;
        }
      }
    } catch { /* a failed price read means no mirrors this tick — never bad ones */ }
  }
  return out;
}

let _solUsdCache: { v: number; at: number } | null = null;
async function solUsdCached(): Promise<number | null> {
  if (_solUsdCache && Date.now() - _solUsdCache.at < 10 * 60_000) return _solUsdCache.v;
  const q = (await fetchMintQuotes([WSOL_MINT]).catch(() => ({} as Record<string, MintQuote>)))[WSOL_MINT];
  if (q?.price > 0) { _solUsdCache = { v: q.price, at: Date.now() }; return q.price; }
  return _solUsdCache?.v ?? null;
}

// ── Solana RPC (polling feed) ────────────────────────────────────────────
function rpcUrl(): string {
  return process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
}

async function rpcCall<T>(method: string, params: any[]): Promise<T> {
  const resp = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (resp.status === 429) { const e: any = new Error('solana rpc rate limited (429)'); e.status = 429; throw e; }
  if (!resp.ok) throw new Error(`solana rpc http ${resp.status}`);
  const j: any = await resp.json();
  if (j?.error) throw new Error(`solana rpc ${method}: ${j.error.message ?? 'error'}`);
  return j.result as T;
}

interface SigInfo { signature: string; blockTime?: number | null; err?: unknown }

// ── Event + position writes (non-fatal: bookkeeping never breaks a tick) ─
async function recordEvent(userId: number, ev: LeaderEvent, action: string, detail: string, symbol?: string | null): Promise<void> {
  try {
    await ensureSolFollowerTables();
    const now = Date.now();
    await pool.query(
      `INSERT INTO sol_follower_events (user_id, leader_wallet, signature, side, mint, symbol, leader_token_amount, leader_sol, sell_fraction, event_at, entry_lag_sec, action, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (user_id, signature, mint, side) DO NOTHING`,
      [userId, ev.wallet, ev.signature || null, ev.side, ev.mint, symbol ?? null, ev.tokenAmount, ev.solAmount,
       ev.sellFraction, ev.eventAt ? new Date(ev.eventAt) : null,
       ev.eventAt ? Math.max(0, (now - ev.eventAt) / 1000) : null, action, String(detail).slice(0, 500)]);
  } catch (e: any) { console.error('[sol-follower] event write failed (non-fatal):', e?.message ?? e); }
}

interface FollowerPositionRow {
  id: string; user_id: number; leader_wallet: string; leader_label: string | null; mint: string; symbol: string;
  size_sol: number; entry_price: number; remaining_fraction: number; realized_gross_pct: number;
  cost_pct: number | null; sl_pct: number; opened_at: string; peak_price: number | null; last_price: number | null;
}

async function openPositionsFor(userId: number): Promise<FollowerPositionRow[]> {
  const { rows } = await pool.query(
    `SELECT * FROM sol_follower_positions WHERE user_id=$1 AND status='open' ORDER BY opened_at`, [userId]);
  return rows;
}

async function closePositionFully(pos: FollowerPositionRow, grossPct: number, reason: string): Promise<void> {
  const gross = finalGrossPct(Number(pos.realized_gross_pct) || 0, Number(pos.remaining_fraction) || 0, grossPct);
  const net = gross - (Number(pos.cost_pct) || 0);
  await pool.query(
    `UPDATE sol_follower_positions SET status='closed', closed_at=now(), close_reason=$2, gross_pct=$3, net_pct=$4, remaining_fraction=0 WHERE id=$1`,
    [pos.id, reason, Math.round(gross * 100) / 100, Math.round(net * 100) / 100]);
}

// ── Mirror application ───────────────────────────────────────────────────
async function handleLeaderEvent(fw: { id: number; user_id: number; wallet: string; label: string | null }, ev: LeaderEvent): Promise<void> {
  const userId = fw.user_id;
  const now = Date.now();

  if (ev.side === 'sell') {
    const open = await openPositionsFor(userId);
    const pos = open.find((p) => p.leader_wallet === ev.wallet && p.mint === ev.mint);
    if (!pos) { await recordEvent(userId, ev, 'no_open_mirror', 'leader sold a token with no open mirror'); return; }
    const quote = (await fetchMintQuotes([ev.mint]))[ev.mint];
    if (!quote?.price) { await recordEvent(userId, ev, 'skipped_no_price', 'no reference price at leader sell — mirror left to its backstops', pos.symbol); return; }
    const grossNow = ((quote.price - Number(pos.entry_price)) / Number(pos.entry_price)) * 100;
    const plan = mirrorClosePlan(Number(pos.remaining_fraction) || 0, ev.sellFraction ?? 1);
    if (plan.fullExit) {
      await closePositionFully(pos, grossNow, 'leader_exit');
      await recordEvent(userId, ev, 'mirrored_exit', `leader sold ${Math.round((ev.sellFraction ?? 1) * 100)}% — mirror closed at ${grossNow >= 0 ? '+' : ''}${grossNow.toFixed(1)}% gross`, pos.symbol);
    } else {
      const realized = blendRealizedPct(Number(pos.realized_gross_pct) || 0, plan.closeFractionOfOriginal, grossNow);
      await pool.query(
        `UPDATE sol_follower_positions SET remaining_fraction=$2, realized_gross_pct=$3 WHERE id=$1`,
        [pos.id, Math.max(0, (Number(pos.remaining_fraction) || 0) - plan.closeFractionOfOriginal), realized]);
      await recordEvent(userId, ev, 'mirrored_partial_close', `leader sold ${Math.round((ev.sellFraction ?? 0) * 100)}% — mirror banked that fraction at ${grossNow >= 0 ? '+' : ''}${grossNow.toFixed(1)}% gross`, pos.symbol);
    }
    return;
  }

  // BUY — staleness first: an old leader buy is a record, never an entry.
  if (!eventIsFresh(ev.eventAt, now, FOLLOWER_MAX_EVENT_AGE_SEC)) {
    await recordEvent(userId, ev, 'skipped_stale', `leader buy was ${Math.round((now - ev.eventAt) / 1000)}s old at detection (max ${FOLLOWER_MAX_EVENT_AGE_SEC}s) — not chased`);
    return;
  }
  // Lesson gate: the lane as a whole stops opening mirrors while its own
  // rolling record is proven losing (rehabilitation is structural — the
  // rolling window clearing lifts it). Per-lane, never per token.
  try {
    const gate = await import('./shadow-lesson-gate');
    if (gate.solShadowLessonsOn()) {
      const verdict = await gate.getSolFollowerLessonVerdict(userId);
      if (verdict?.blocked) {
        void gate.logShadowLessonBlock({
          lane: 'sol_follower_shadow', userId, strategyKey: 'wallet_follower', bucket: 'lane (all wallets)',
          n: verdict.trades, winRate: verdict.trades ? verdict.wins / verdict.trades : null, avgR: verdict.avgR,
          reason: `follower lane proven losing on the lesson bar: ${verdict.trades} resolved, avg ${verdict.avgR.toFixed(2)}R, win ${Math.round((verdict.wins / Math.max(1, verdict.trades)) * 100)}%`,
        });
        await recordEvent(userId, ev, 'blocked_lesson_gate', 'the follower lane is paused by its own lesson gate (proven-losing rolling record)');
        return;
      }
    }
  } catch { /* gate read failure never blocks the lane (fail-open) */ }

  const open = await openPositionsFor(userId);
  if (open.length >= FOLLOWER_MAX_OPEN) { await recordEvent(userId, ev, 'skipped_cap_open', `lane cap reached (${FOLLOWER_MAX_OPEN} open mirrors)`); return; }
  if (open.filter((p) => p.leader_wallet === ev.wallet).length >= FOLLOWER_MAX_PER_WALLET) { await recordEvent(userId, ev, 'skipped_cap_wallet', `per-wallet cap reached (${FOLLOWER_MAX_PER_WALLET} open mirrors for this leader)`); return; }
  if (open.some((p) => p.leader_wallet === ev.wallet && p.mint === ev.mint)) { await recordEvent(userId, ev, 'skipped_already_open', 'a mirror for this leader + token is already open (v1 does not add to mirrors)'); return; }

  const quote = (await fetchMintQuotes([ev.mint]))[ev.mint];
  if (!quote?.price) { await recordEvent(userId, ev, 'skipped_no_price', 'no reference price for the token at detection — no mirror opened'); return; }
  const solUsd = await solUsdCached();
  const cost = estimateSolRoundTripCost({ dex: 'pumpfun', sizeSol: FOLLOWER_SIZE_SOL, solUsd, liquidityUsd: quote.liquidityUsd });
  const costPct = Math.round(cost.roundTripPct * 100) / 100;
  const id = `follower_${userId}_${now}_${ev.mint.slice(0, 6)}`;
  const lagSec = ev.eventAt ? Math.max(0, (now - ev.eventAt) / 1000) : null;
  await pool.query(
    `INSERT INTO sol_follower_positions (id, user_id, wallet_id, leader_wallet, leader_label, mint, symbol, size_sol, entry_price,
       leader_entry_price, leader_entry_at, leader_signature, leader_size_sol, entry_lag_sec, cost_pct, sl_pct, peak_price, last_price)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)`,
    [id, userId, fw.id, ev.wallet, fw.label, ev.mint, quote.symbol || ev.mint.slice(0, 8), FOLLOWER_SIZE_SOL, quote.price,
     leaderPriceUsd(ev, solUsd), ev.eventAt ? new Date(ev.eventAt) : null, ev.signature || null, ev.solAmount, lagSec, costPct, FOLLOWER_SL_PCT, quote.price]);
  await recordEvent(userId, ev, 'mirrored_open', `mirror opened at $${quote.price} (${lagSec != null ? `${lagSec.toFixed(0)}s` : '?'} behind the leader)`, quote.symbol);
}

// ── Poller ───────────────────────────────────────────────────────────────
const _backoff = new Map<string, { until: number; fails: number }>();

async function pollWallet(fw: { id: number; user_id: number; wallet: string; label: string | null; last_signature: string | null }): Promise<void> {
  const key = `${fw.user_id}:${fw.wallet}`;
  const bo = _backoff.get(key);
  if (bo && bo.until > Date.now()) return;
  try {
    if (!fw.last_signature) {
      // First poll for a newly followed wallet: seed the cursor at the
      // newest signature and process NOTHING — history is never replayed.
      const sigs = await rpcCall<SigInfo[]>('getSignaturesForAddress', [fw.wallet, { limit: 1 }]);
      if (Array.isArray(sigs) && sigs.length) {
        await pool.query(`UPDATE sol_follower_wallets SET last_signature=$2, last_polled_at=now() WHERE id=$1`, [fw.id, sigs[0].signature]);
      } else {
        await pool.query(`UPDATE sol_follower_wallets SET last_polled_at=now() WHERE id=$1`, [fw.id]);
      }
      _backoff.delete(key);
      return;
    }
    // Catch up in pages (50/page, up to 4) so a busy leader's trades
    // between polls are not silently gapped over.
    const batch: SigInfo[] = [];
    let before: string | undefined;
    for (let page = 0; page < 4; page++) {
      const sigs = await rpcCall<SigInfo[]>('getSignaturesForAddress', [
        fw.wallet,
        { limit: 50, until: fw.last_signature, ...(before ? { before } : {}) },
      ]);
      if (!Array.isArray(sigs) || !sigs.length) break;
      batch.push(...sigs);
      if (sigs.length < 50) break;
      before = sigs[sigs.length - 1].signature;
    }
    if (!batch.length) {
      await pool.query(`UPDATE sol_follower_wallets SET last_polled_at=now() WHERE id=$1`, [fw.id]);
      _backoff.delete(key);
      return;
    }
    // Oldest → newest, so a buy is mirrored before the sell that follows it.
    for (const info of [...batch].reverse()) {
      if (!info.err) {
        const tx = await rpcCall<any>('getParsedTransaction', [info.signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
        if (!tx) {
          // Not visible on the RPC node yet: stop here WITHOUT advancing
          // the cursor — the next poll retries this signature. A signature
          // >10 min old that still reads null is treated as pruned and
          // skipped, so one bad read can never stall the wallet forever.
          if (!(info.blockTime && info.blockTime * 1000 < Date.now() - 10 * 60_000)) break;
        } else {
          if (!tx.blockTime && info.blockTime) tx.blockTime = info.blockTime;
          if (!tx.transaction?.signatures?.length) tx.transaction = { ...(tx.transaction ?? {}), signatures: [info.signature] };
          for (const ev of parseLeaderEvents(tx, fw.wallet)) {
            await handleLeaderEvent(fw, ev);
          }
        }
      }
      // Advance the cursor past every processed (or failed-on-chain)
      // signature; an RPC failure above throws before this line, so the
      // cursor never jumps over unprocessed trades.
      await pool.query(`UPDATE sol_follower_wallets SET last_signature=$2, last_polled_at=now() WHERE id=$1`, [fw.id, info.signature]);
    }
    _backoff.delete(key);
  } catch (e: any) {
    const fails = (_backoff.get(key)?.fails ?? 0) + 1;
    const delayMs = e?.status === 429 ? Math.min(10 * 60_000, 30_000 * 2 ** Math.min(fails, 5)) : 30_000;
    _backoff.set(key, { until: Date.now() + delayMs, fails });
    console.warn(`[sol-follower] poll failed for a followed wallet (attempt ${fails}, backing off ${Math.round(delayMs / 1000)}s):`, e?.message ?? e);
  }
}

async function monitorFollowerPositions(): Promise<void> {
  const { rows } = await pool.query(`SELECT * FROM sol_follower_positions WHERE status='open'`);
  if (!rows.length) return;
  const quotes = await fetchMintQuotes(rows.map((p: any) => p.mint));
  const now = Date.now();
  for (const pos of rows as FollowerPositionRow[]) {
    const quote = quotes[pos.mint];
    const heldMin = (now - new Date(pos.opened_at).getTime()) / 60_000;
    const isMaxHold = heldMin >= FOLLOWER_MAX_HOLD_MIN;
    if (!quote?.price) {
      // No fresh print: only the time stop may close, at the last mark —
      // the same discipline as the Sol shadow monitor.
      if (isMaxHold && Number(pos.last_price) > 0) {
        const lastMark = Number(pos.last_price);
        await closePositionFully(pos, ((lastMark - Number(pos.entry_price)) / Number(pos.entry_price)) * 100, 'max_hold');
      }
      continue;
    }
    const price = quote.price;
    const newPeak = !pos.peak_price || price > Number(pos.peak_price) ? price : Number(pos.peak_price);
    await pool.query(`UPDATE sol_follower_positions SET peak_price=$2, last_price=$3 WHERE id=$1`, [pos.id, newPeak, price]);
    const gross = ((price - Number(pos.entry_price)) / Number(pos.entry_price)) * 100;
    if (gross >= FOLLOWER_TP_PCT) await closePositionFully(pos, gross, 'tp');
    else if (gross <= -FOLLOWER_SL_PCT) await closePositionFully(pos, gross, 'sl');
    else if (isMaxHold) await closePositionFully(pos, gross, 'max_hold');
  }
}

let _started = false;
let _tickRunning = false;

async function followerTick(): Promise<void> {
  if (_tickRunning) return;
  _tickRunning = true;
  try {
    await ensureSolFollowerTables();
    const { rows } = await pool.query(`SELECT id, user_id, wallet, label, last_signature FROM sol_follower_wallets ORDER BY user_id, id`);
    for (const fw of rows) await pollWallet(fw);
    await monitorFollowerPositions();
  } catch (e: any) {
    console.error('[sol-follower] tick failed (non-fatal):', e?.message ?? e);
  } finally {
    _tickRunning = false;
  }
}

/** Start the follower shadow poller (idempotent). No-op when the kill
 *  switch is off. Polls only wallets users actually follow. */
export function startSolFollowerShadow(): void {
  if (!solFollowerShadowOn()) { console.log('[sol-follower] SOL_FOLLOWER_SHADOW=off — lane disabled'); return; }
  if (_started) return;
  _started = true;
  console.log(`[sol-follower] shadow lane started (poll ${Math.round(FOLLOWER_POLL_MS / 1000)}s, size ${FOLLOWER_SIZE_SOL} SOL, max event age ${FOLLOWER_MAX_EVENT_AGE_SEC}s)`);
  setTimeout(() => { void followerTick(); }, 5_000).unref?.();
  setInterval(() => { void followerTick(); }, FOLLOWER_POLL_MS).unref?.();
}

// ── Report (panel + the future shadow→live toggle's bar read) ───────────
export interface FollowerWalletScore extends WalletBarStats {
  wallet: string; label: string | null; openCount: number; avgEntryLagSec: number | null;
  verdict: 'learning' | 'proving' | 'proven' | 'losing'; verdictLine: string;
}

export async function getSolFollowerReport(userId: number): Promise<any> {
  await ensureSolFollowerTables();
  const wallets = await listFollowedWallets(userId);
  const { rows: closed } = await pool.query(
    `SELECT leader_wallet, net_pct, sl_pct, entry_lag_sec, closed_at FROM sol_follower_positions
      WHERE user_id=$1 AND status='closed' AND net_pct IS NOT NULL ORDER BY closed_at`, [userId]);
  const { rows: open } = await pool.query(
    `SELECT id, leader_wallet, leader_label, mint, symbol, size_sol, entry_price, leader_entry_price, leader_entry_at, opened_at, entry_lag_sec, remaining_fraction
       FROM sol_follower_positions WHERE user_id=$1 AND status='open' ORDER BY opened_at DESC`, [userId]);
  const { rows: recent } = await pool.query(
    `SELECT id, leader_wallet, leader_label, mint, symbol, entry_price, leader_entry_price, opened_at, closed_at, close_reason, net_pct, entry_lag_sec
       FROM sol_follower_positions WHERE user_id=$1 AND status='closed' ORDER BY closed_at DESC LIMIT 20`, [userId]);

  const scores: FollowerWalletScore[] = wallets.map((w) => {
    const mine = closed.filter((c: any) => c.leader_wallet === w.wallet);
    const trades = mine.length;
    const wins = mine.filter((c: any) => Number(c.net_pct) > 0).length;
    const avgNetPct = trades ? mine.reduce((a: number, c: any) => a + Number(c.net_pct), 0) / trades : 0;
    const avgR = trades ? mine.reduce((a: number, c: any) => a + (Number(c.sl_pct) > 0 ? Number(c.net_pct) / Number(c.sl_pct) : 0), 0) / trades : 0;
    const weeks = new Map<string, number>();
    for (const c of mine) {
      const d = new Date(c.closed_at);
      const wk = `${d.getUTCFullYear()}-W${Math.floor((d.getTime() / 86_400_000) / 7)}`;
      weeks.set(wk, (weeks.get(wk) ?? 0) + Number(c.net_pct));
    }
    const lags = mine.map((c: any) => c.entry_lag_sec).filter((x: any) => x != null).map(Number);
    const stats: WalletBarStats = { trades, wins, avgNetPct, avgR, weeklyNetPct: Array.from(weeks.values()) };
    const v = walletVerdict(stats);
    return {
      ...stats, wallet: w.wallet, label: w.label,
      openCount: open.filter((o: any) => o.leader_wallet === w.wallet).length,
      avgEntryLagSec: lags.length ? lags.reduce((a: number, b: number) => a + b, 0) / lags.length : null,
      verdict: v.verdict, verdictLine: v.line,
    };
  });

  return {
    enabled: solFollowerShadowOn(),
    sizeSol: FOLLOWER_SIZE_SOL,
    maxEventAgeSec: FOLLOWER_MAX_EVENT_AGE_SEC,
    bar: FOLLOWER_LIVE_BAR,
    wallets: wallets.map((w) => ({ ...w, score: scores.find((s) => s.wallet === w.wallet) })),
    open,
    recentClosed: recent,
  };
}
