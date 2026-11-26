// ─────────────────────────────────────────────────────────────────────────────
// Crypto fix pack (2026-11-26) — pure decision/math helpers for the DeFi
// hot-wallet lane corrections. Everything here is side-effect free so the
// check suite (scripts/check-crypto-fix-pack.ts) can pin the behavior
// without a DB, a wallet, or an RPC.
//
//   1. Consensus assembly throws → entry NOT allowed (was: allowed).
//      Kill switch CRYPTO_CONSENSUS_FAIL_CLOSED=off restores allow-on-throw.
//   2. Promoted shadow-guard consult throws → entry skipped (was: fail open).
//      Kill switch CRYPTO_PROMOTION_FAIL_CLOSED=off restores fail-open.
//   3. Live cost floor: refuse entries whose stop is closer than
//      mult × modeled round-trip cost (the shadow lane's rule, ported).
//      Kill switch CRYPTO_LIVE_COST_FLOOR=off (scanner-side).
//   4. Entry price = actual fill (USDC spent ÷ tokens received).
//   5. Realized P&L nets out round-trip native gas (USD).
//      Kill switch CRYPTO_GAS_IN_PNL=off restores gross math (scanner-side).
//   8. Partial close: book only the sold quantity; the remainder is parked.
//   9. Quote sanity band: implied quote price may not deviate from the
//      signal's pool price by more than slippage + 2%.
//      Kill switch CRYPTO_QUOTE_BAND=off (executor-side).
// ─────────────────────────────────────────────────────────────────────────────

type Env = Record<string, string | undefined>;

/** Fix 1: when consensus assembly throws, is the trade allowed anyway?
 *  Only when the kill switch explicitly restores the legacy behavior. */
export function consensusThrowAllowsTrade(env: Env = process.env): boolean {
  return env.CRYPTO_CONSENSUS_FAIL_CLOSED === 'off';
}

/** Fix 2: when the promoted-guard consult throws, do we skip the entry?
 *  Yes unless the kill switch explicitly restores fail-open. */
export function promotionErrorSkipsEntry(env: Env = process.env): boolean {
  return env.CRYPTO_PROMOTION_FAIL_CLOSED !== 'off';
}

/** Fix 3: the live cost floor. The shadow lane refuses an entry when
 *  slPct < mult × roundTripBps/100 (crypto-shadow.ts). Same rule in dollar
 *  terms so the skip reason can name the numbers. mult <= 0 disables,
 *  exactly as the shadow lane treats CRYPTO_PAPER_COST_FLOOR_MULT=0. */
export interface CostFloorVerdict {
  pass: boolean;
  stopUsd: number;          // dollars at risk if the stop is hit
  roundTripCostUsd: number; // modeled round-trip cost of the position
  floorUsd: number;         // mult × round-trip cost — the stop must reach this
}
export function evaluateCostFloor(i: { stopPct: number; roundTripBps: number; mult: number; notionalUsd: number }): CostFloorVerdict {
  const stopUsd = Math.max(0, i.notionalUsd) * Math.max(0, i.stopPct) / 100;
  const roundTripCostUsd = Math.max(0, i.notionalUsd) * Math.max(0, i.roundTripBps) / 10_000;
  const floorUsd = Math.max(0, i.mult) * roundTripCostUsd;
  const pass = !(i.mult > 0) || stopUsd >= floorUsd;
  return { pass, stopUsd, roundTripCostUsd, floorUsd };
}

/** Fix 4: the real fill price of a USDC→token swap. Falls back to the
 *  pre-swap hint when the received amount is unknown (then spent/received
 *  is the hint by construction anyway). */
export function fillPriceFromSwap(spentUsd: number, receivedQty: number, fallbackPrice: number): number {
  if (spentUsd > 0 && receivedQty > 0) return spentUsd / receivedQty;
  return fallbackPrice;
}

/** Fix 5a: native-token gas → USD. Null when either side is unknown, so
 *  callers can distinguish "no gas data" from "gas was free". */
export function gasUsdFromNative(gasNative: number | null | undefined, nativeUsdPrice: number | null | undefined): number | undefined {
  if (gasNative == null || !(gasNative >= 0) || nativeUsdPrice == null || !(nativeUsdPrice > 0)) return undefined;
  return gasNative * nativeUsdPrice;
}

/** Fix 5b: realized P&L net of round-trip gas. Missing gas data counts as
 *  0 — historical rows predate gas capture and must not be re-scored. */
export function realizedPnlAfterGas(grossPnl: number, entryGasUsd: number | null | undefined, exitGasUsd: number | null | undefined, enabled: boolean): number {
  if (!enabled) return grossPnl;
  return grossPnl - (Number(entryGasUsd) || 0) - (Number(exitGasUsd) || 0);
}

/** Fix 8: split a close into the quantity actually sold (booked) and the
 *  remainder (parked for reconciliation). soldQty unknown → full close. */
export interface PartialCloseSplit { isPartial: boolean; bookedQty: number; remainderQty: number }
export function partialCloseSplit(quantity: number, soldQty: number | null | undefined): PartialCloseSplit {
  const q = Number(quantity) || 0;
  const s = soldQty == null ? q : Number(soldQty);
  if (q > 0 && s > 0 && s < q) return { isPartial: true, bookedQty: s, remainderQty: q - s };
  return { isPartial: false, bookedQty: q, remainderQty: 0 };
}

/** Fix 9: allowed deviation between the 0x quote's implied price and the
 *  signal's pool price: the swap's own slippage band plus 2 points. */
export function quoteBandLimitPct(slippageBps: number): number {
  return Math.max(0, slippageBps) / 100 + 2;
}

/** Fix 9: |implied − reference| / reference, in percent. */
export function quoteDeviationPct(impliedPrice: number, referencePrice: number): number {
  if (!(referencePrice > 0) || !(impliedPrice > 0)) return Infinity;
  return Math.abs(impliedPrice - referencePrice) / referencePrice * 100;
}

/** Fix 7: merge the drawdown-shield peak across process restarts. The
 *  stored (runtime_state) peak and the in-process peak both count; equity
 *  itself is the floor. Pure so the merge rule is pinnable. */
export function mergePeakEquity(storedPeak: number | null | undefined, inMemoryPeak: number | null | undefined, equity: number): number {
  return Math.max(Number(storedPeak) || 0, Number(inMemoryPeak) || 0, equity);
}
