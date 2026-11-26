// ─────────────────────────────────────────────────────────────────────────────
// Kalshi stock-perp SMALL-ACCOUNT brain (2026-11-26) — Chris's direction:
// this lane exists to grow a SMALL Kalshi margin account into a larger
// one, so the brain must trade differently depending on how much money
// is actually in the wallet. Before this build the lane was a fixed-$250
// machine: shadow and live both sized ~$250 regardless of equity, Gate 5b
// tested a flat $250/5 margin fiction, live sizing floored to WHOLE
// contracts (so a sub-$100 account could not trade a $100+ underlying at
// all), and neither AI layer (judge / watch plans) was ever told the
// account size or the growth objective.
//
// What lives here (shared by the live lane, the shadow lane, and the
// order-body builder so the three can never disagree):
//   • The mode ladder: SURVIVAL (equity < $100) risks 2% of equity per
//     trade with at most 1 live position; GROWTH ($100–$1,000) risks 3%
//     with at most 2; STANDARD (≥ $1,000) is the lane's pre-build
//     behaviour (fixed $250 target under the 25%-of-equity cap). All
//     bands/risks/caps are env-tunable (KALSHI_PERP_SA_*).
//   • Risk-based fractional sizing: contracts = risk$ ÷ (price × stop%),
//     floored to Kalshi's 0.02-contract fixed-point granularity, capped
//     by the notional cap AND by the margin the account actually has.
//   • The survival brakes' pure math (loss-streak counting; the gates
//     themselves live in kalshi-perp-live.ts).
//   • The shadow lane's VIRTUAL wallet (runtime_state): seeded from the
//     user's real margin equity when readable (else $25), compounded by
//     every shadow close's net $ P&L, so the shadow record becomes a
//     small-account record the promotion bar can honestly grade.
//   • The account-context block the AI judge + watch-plan prompts carry.
//
// MASTER KILL SWITCH: KALSHI_PERP_SMALL_ACCOUNT=off restores the
// pre-build behaviour on every path this module touches — fixed $250
// shadow notional, legacy live sizing, whole-contract order counts, the
// fixed Gate 5b test, no brakes, no AI account context. The switch is
// consulted at each call site (never cached), exactly like the lane's
// other kill switches.
//
// This module NEVER touches: the promotion bar, funding/fee accounting
// (kalshi-perp-costs.ts), verdict handling, the AI budget pool, or any
// other engine. Brain learning is deterministic and untouched — this is
// sizing, gating, and context only.
// ─────────────────────────────────────────────────────────────────────────────
import { getRuntimeStateStrict, saveRuntimeState, insertRuntimeStateIfAbsent } from './runtime-state';

const num = (n: string, d: number) => { const v = Number(process.env[n]); return Number.isFinite(v) && v > 0 ? v : d; };

export const smallAccountEnabled = () => process.env.KALSHI_PERP_SMALL_ACCOUNT !== 'off';

// ── the ladder ─────────────────────────────────────────────────────────────
export type PerpSaMode = 'survival' | 'growth' | 'standard';

export const SA_SURVIVAL_MAX_USD = () => num('KALSHI_PERP_SA_SURVIVAL_MAX_USD', 100);
export const SA_GROWTH_MAX_USD = () => num('KALSHI_PERP_SA_GROWTH_MAX_USD', 1000);
export const SA_NOTIONAL_CAP_USD = () => num('KALSHI_PERP_SA_NOTIONAL_CAP_USD', 250);
export const SA_EQUITY_FLOOR_USD = () => num('KALSHI_PERP_SA_EQUITY_FLOOR_USD', 10);
export const SA_LOSS_STREAK = () => Math.max(1, Math.floor(num('KALSHI_PERP_SA_LOSS_STREAK', 3)));
/** Kalshi perp counts are fixed-point with a 0.02-contract granularity
 *  (one contract embeds 0.02 shares of the underlying). */
export const SA_MIN_INCREMENT = () => num('KALSHI_PERP_SA_MIN_INCREMENT', 0.02);
export const SA_SHADOW_SEED_USD = () => num('KALSHI_PERP_SA_SHADOW_SEED_USD', 25);

/** The mode for an equity figure. An unknown/unreadable balance reads as
 *  SURVIVAL — the most conservative band — never as a bigger account. */
export function perpSaMode(equityUsd: number | null | undefined): PerpSaMode {
  if (equityUsd == null || !Number.isFinite(equityUsd) || equityUsd < SA_SURVIVAL_MAX_USD()) return 'survival';
  if (equityUsd < SA_GROWTH_MAX_USD()) return 'growth';
  return 'standard';
}

/** Risk per trade as % of equity; null in STANDARD (legacy sizing). */
export function perpSaRiskPct(mode: PerpSaMode): number | null {
  if (mode === 'survival') return num('KALSHI_PERP_SA_SURVIVAL_RISK_PCT', 2);
  if (mode === 'growth') return num('KALSHI_PERP_SA_GROWTH_RISK_PCT', 3);
  return null;
}

/** Max simultaneous live positions; null in STANDARD (lane's own cap). */
export function perpSaMaxOpen(mode: PerpSaMode): number | null {
  if (mode === 'survival') return Math.max(1, Math.floor(num('KALSHI_PERP_SA_SURVIVAL_MAX_OPEN', 1)));
  if (mode === 'growth') return Math.max(1, Math.floor(num('KALSHI_PERP_SA_GROWTH_MAX_OPEN', 2)));
  return null;
}

export const perpSaModeLabel = (mode: PerpSaMode): string =>
  mode === 'survival' ? 'Survival' : mode === 'growth' ? 'Growth' : 'Standard';

// ── fractional counts ──────────────────────────────────────────────────────
/** Floor a contract count to Kalshi's fixed-point granularity (0.02). */
export function floorToIncrement(x: number, increment: number = SA_MIN_INCREMENT()): number {
  if (!(x > 0) || !(increment > 0)) return 0;
  const v = Math.floor((x + 1e-9) / increment) * increment;
  return Math.round(v * 1e6) / 1e6;
}

/** Fixed-point count string for the margin order body ("2", "0.5",
 *  "0.02") — the same decimal-string shape the API already takes for
 *  whole counts, extended to the fractional values Kalshi's own
 *  position/fill payloads report (position_fp / fill_count parse as
 *  floats in kalshi-trading.ts). */
export function formatPerpCount(count: number): string {
  const c = floorToIncrement(count);
  if (!(c > 0)) return '0';
  const s = c.toFixed(2);
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}

// ── risk-based sizing (pure) ───────────────────────────────────────────────
export interface PerpRiskSizing {
  contracts: number;
  notionalUsd: number;
  /** The dollar risk the sizing targeted (equity × risk%). */
  riskUsd: number;
  /** The pre-floor target notional after every cap. */
  targetUsd: number;
  cappedBy: 'risk' | 'notional_cap' | 'margin';
  reason: string | null;
}

/**
 * Size one perp entry from the account's actual size: risk a fixed % of
 * equity on the trade's own stop distance, in fractional contracts.
 * contracts = risk$ / (price × slPct/100), then capped by the notional
 * cap and by the margin the account actually has (available × leverage),
 * then floored to the 0.02 granularity. A result below one increment is
 * a block with a reason naming the numbers — on a tiny account that is
 * the honest answer for an expensive perp with a wide stop.
 */
export function sizePerpByRisk(input: {
  equityUsd: number; price: number; slPct: number; mode: PerpSaMode;
  availableMarginUsd?: number | null; leverage?: number;
}): PerpRiskSizing {
  const { equityUsd, price, slPct, mode } = input;
  const riskPct = perpSaRiskPct(mode);
  const fail = (reason: string): PerpRiskSizing => ({ contracts: 0, notionalUsd: 0, riskUsd: 0, targetUsd: 0, cappedBy: 'risk', reason });
  if (riskPct == null) return fail('standard mode sizes with the legacy fixed-$250 target, not the risk ladder');
  if (!(equityUsd > 0)) return fail('no equity to size against');
  if (!(price > 0)) return fail('no price to size against');
  if (!(slPct > 0)) return fail('no stop distance to size against');
  const riskUsd = (equityUsd * riskPct) / 100;
  const riskPerContract = (price * slPct) / 100;
  const byRisk = riskUsd / riskPerContract;
  const byNotionalCap = SA_NOTIONAL_CAP_USD() / price;
  const leverage = input.leverage != null && input.leverage > 0 ? input.leverage : null;
  const byMargin = input.availableMarginUsd != null && input.availableMarginUsd >= 0 && leverage != null
    ? (input.availableMarginUsd * leverage) / price
    : Infinity;
  const raw = Math.min(byRisk, byNotionalCap, byMargin);
  const cappedBy: PerpRiskSizing['cappedBy'] = raw === byMargin ? 'margin' : raw === byNotionalCap ? 'notional_cap' : 'risk';
  const contracts = floorToIncrement(raw);
  const increment = SA_MIN_INCREMENT();
  if (contracts < increment) {
    return {
      contracts: 0, notionalUsd: 0, riskUsd, targetUsd: raw * price, cappedBy,
      reason: `risk $${riskUsd.toFixed(2)} (${riskPct}% of $${equityUsd.toFixed(2)}) at a ${slPct.toFixed(2)}% stop on a $${price.toFixed(2)} perp sizes below the ${increment}-contract minimum`,
    };
  }
  return { contracts, notionalUsd: contracts * price, riskUsd, targetUsd: raw * price, cappedBy, reason: null };
}

// ── survival-brake math (pure) ─────────────────────────────────────────────
/** Consecutive losses at the head of a newest-first close list. A close
 *  at exactly $0 (or an unrecorded P&L) breaks the streak — it was not
 *  a loss. */
export function perpLossStreak(closesNewestFirst: Array<{ netPnlUsd: number | null }>): number {
  let n = 0;
  for (const c of closesNewestFirst) {
    if (c.netPnlUsd != null && Number.isFinite(c.netPnlUsd) && c.netPnlUsd < 0) n++;
    else break;
  }
  return n;
}

// ── AI account context ─────────────────────────────────────────────────────
export interface PerpAccountContext {
  /** Real Kalshi margin equity when a read succeeded; null → the prompt
   *  says the balance is unknown. NEVER an invented number. */
  realEquityUsd: number | null;
  /** The shadow lane's virtual wallet equity (the live lane trades the
   *  real wallet, so it passes its real equity here too). */
  virtualEquityUsd: number | null;
  /** The ladder mode in force for the equity this lane trades against. */
  mode: PerpSaMode | null;
}

/** The one account block both AI prompts carry (judge + watch plans).
 *  Plain language, bounded length: what the account holds, which mode
 *  the brain is in, and the objective — grow a small account; survival
 *  and steady compounding outrank trade count. */
export function formatPerpAccountContext(ctx: PerpAccountContext): string {
  const real = ctx.realEquityUsd != null && Number.isFinite(ctx.realEquityUsd)
    ? `real Kalshi margin balance $${ctx.realEquityUsd.toFixed(2)}`
    : 'real Kalshi margin balance unknown';
  const virt = ctx.virtualEquityUsd != null && Number.isFinite(ctx.virtualEquityUsd)
    ? `shadow virtual wallet $${ctx.virtualEquityUsd.toFixed(2)}`
    : 'shadow virtual wallet not seeded yet';
  const mode = ctx.mode ? `small-account mode ${ctx.mode.toUpperCase()}${perpSaRiskPct(ctx.mode) != null ? ` (risk ${perpSaRiskPct(ctx.mode)}% of equity per trade)` : ''}` : 'small-account mode n/a';
  return `ACCOUNT: this lane grows a SMALL Kalshi account — ${real} · ${virt} · ${mode}. Survival and steady compounding outrank trade count: a setup that risks the account's growth is a bad setup at this size, however good the chart looks.`;
}

// ── the shadow lane's virtual wallet (runtime_state) ──────────────────────
export const SHADOW_WALLET_SCOPE = 'kalshi_perp_shadow_wallet';
export interface PerpShadowWallet {
  equityUsd: number;
  seededFromUsd: number;
  seedSource: 'margin_balance' | 'default';
  updatedAt: string;
}

function parseShadowWallet(v: any): PerpShadowWallet | null {
  if (!v || typeof v !== 'object') return null;
  const equity = Number(v.equityUsd);
  if (!Number.isFinite(equity) || equity < 0) return null;
  return {
    equityUsd: equity,
    seededFromUsd: Number.isFinite(Number(v.seededFromUsd)) ? Number(v.seededFromUsd) : equity,
    seedSource: v.seedSource === 'margin_balance' ? 'margin_balance' : 'default',
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : new Date(0).toISOString(),
  };
}

export async function loadPerpShadowWallet(userId: number): Promise<PerpShadowWallet | null> {
  try { return parseShadowWallet(await getRuntimeStateStrict(SHADOW_WALLET_SCOPE, String(userId))); }
  catch { return null; }
}

/** Load the virtual wallet, seeding it on first use: from the user's
 *  real margin equity when the caller could read it, else the $25
 *  default. Insert-if-absent so two racing cycles seed once. Fail-soft:
 *  on any store error the caller gets an unpersisted seed for this
 *  cycle rather than a blocked lane. */
export async function getOrSeedPerpShadowWallet(userId: number, realEquityUsd: number | null): Promise<PerpShadowWallet> {
  const existing = await loadPerpShadowWallet(userId);
  if (existing) return existing;
  const fromReal = realEquityUsd != null && Number.isFinite(realEquityUsd) && realEquityUsd > 0;
  const seed: PerpShadowWallet = {
    equityUsd: fromReal ? (realEquityUsd as number) : SA_SHADOW_SEED_USD(),
    seededFromUsd: fromReal ? (realEquityUsd as number) : SA_SHADOW_SEED_USD(),
    seedSource: fromReal ? 'margin_balance' : 'default',
    updatedAt: new Date().toISOString(),
  };
  try {
    const stored = parseShadowWallet(await insertRuntimeStateIfAbsent(SHADOW_WALLET_SCOPE, String(userId), seed));
    return stored ?? seed;
  } catch { return seed; }
}

/** Compound the virtual wallet by one shadow close's net $ P&L. A wallet
 *  that was never seeded is left alone (the close predates the mirror;
 *  the next entry seeds fresh). Never throws — a wallet write must not
 *  break a close. */
export async function adjustPerpShadowWallet(userId: number, deltaUsd: number): Promise<void> {
  if (!Number.isFinite(deltaUsd) || deltaUsd === 0) return;
  try {
    const w = await loadPerpShadowWallet(userId);
    if (!w) return;
    const next: PerpShadowWallet = {
      ...w,
      equityUsd: Math.max(0, Math.round((w.equityUsd + deltaUsd) * 100) / 100),
      updatedAt: new Date().toISOString(),
    };
    saveRuntimeState(SHADOW_WALLET_SCOPE, String(userId), next);
  } catch { /* non-fatal by design */ }
}
