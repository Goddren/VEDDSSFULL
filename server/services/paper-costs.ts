// ─────────────────────────────────────────────────────────────────────────────
// Paper / shadow trading costs — 2026-11-06.
//
// Paper and shadow results were gross mid-price moves (Sol) or a flat 160 bps
// built from the slippage CAP (crypto). Both mislead the brain and the lessons:
// Sol memecoins pay ~1-3% per round trip, while a deep WETH pool pays ~0.2%.
//
// Model, per side (entry and exit each pay it):
//   pool fee + base slippage (latency/MEV) + price impact + network fee
// price impact ≈ 2 × notional / pool liquidity (constant-product pool with
// half its liquidity on each side). The round trip is 2 × per side. The exit
// uses the entry pool's liquidity — a thin pool that drains by exit time costs
// more than this estimate, so it is a floor, not a ceiling.
//
// Every number is env-overridable. Pure functions — no I/O.
// ─────────────────────────────────────────────────────────────────────────────

const num = (name: string, dflt: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? v : dflt;
};

/** Price impact of one swap, percent of notional. Unknown liquidity → null. */
export function priceImpactPct(notionalUsd: number, liquidityUsd: number | null | undefined): number | null {
  if (!(liquidityUsd && liquidityUsd > 0) || !(notionalUsd > 0)) return null;
  return Math.min(50, (2 * notionalUsd / liquidityUsd) * 100);
}

// ── Sol (Solana DEXes) ──────────────────────────────────────────────────────
/** Pool fee per swap, percent, by DEX. pump.fun bonding curve charges 1%;
 *  PumpSwap / Raydium AMM 0.25%; Orca / Meteora pools are mostly 0.25–0.3%. */
export function solDexFeePct(dex: string | null | undefined): number {
  const d = (dex || '').toLowerCase();
  if (d.startsWith('pumpswap')) return num('SOL_PAPER_FEE_PUMPSWAP_PCT', 0.25);
  if (d.startsWith('pump')) return num('SOL_PAPER_FEE_PUMPFUN_PCT', 1.0);
  if (d.startsWith('raydium')) return num('SOL_PAPER_FEE_RAYDIUM_PCT', 0.25);
  if (d.startsWith('orca')) return num('SOL_PAPER_FEE_ORCA_PCT', 0.3);
  if (d.startsWith('meteora')) return num('SOL_PAPER_FEE_METEORA_PCT', 0.3);
  return num('SOL_PAPER_FEE_DEFAULT_PCT', 0.3);
}

export interface SolCostInput { dex?: string | null; sizeSol: number; solUsd: number | null; liquidityUsd?: number | null }
export interface CostBreakdown { roundTripPct: number; perSide: { feePct: number; slippagePct: number; impactPct: number; networkPct: number } }

/** Round-trip cost, percent of position, for a Sol paper/shadow trade. */
export function estimateSolRoundTripCost(i: SolCostInput): CostBreakdown {
  const feePct = solDexFeePct(i.dex);
  // Memecoin fills land late and get sandwiched; 0.5%/side is a conservative floor.
  const slippagePct = num('SOL_PAPER_SLIPPAGE_PCT', 0.5);
  const notionalUsd = i.solUsd && i.solUsd > 0 ? i.sizeSol * i.solUsd : 0;
  // Unknown liquidity: assume a thin pool's worth of impact.
  const impactPct = priceImpactPct(notionalUsd, i.liquidityUsd) ?? num('SOL_PAPER_IMPACT_FALLBACK_PCT', 1.0);
  // Base + priority fee per transaction, in SOL.
  const txSol = num('SOL_PAPER_TX_FEE_SOL', 0.0001);
  const networkPct = i.sizeSol > 0 ? Math.min(5, (txSol / i.sizeSol) * 100) : 0;
  const side = feePct + slippagePct + impactPct + networkPct;
  return { roundTripPct: 2 * side, perSide: { feePct, slippagePct, impactPct, networkPct } };
}

// ── Crypto (EVM DeFi, Base) ─────────────────────────────────────────────────
export interface CryptoCostInput { notionalUsd: number; liquidityUsd?: number | null; slippageCapBps: number }

/** Round-trip cost in bps for a crypto paper trade on a Base DEX pool.
 *  Fee tier isn't in the discovery data, so deep pools (majors, usually the
 *  0.05% tier) get the low fee and everything else the 0.3% tier. Impact is
 *  capped at the swap's slippage cap: a worse fill would revert, not fill. */
export function estimateCryptoRoundTripBps(i: CryptoCostInput): { roundTripBps: number; perSideBps: number; liquidityKnown: boolean } {
  const cap = Math.max(0, i.slippageCapBps || 0);
  const liq = i.liquidityUsd && i.liquidityUsd > 0 ? i.liquidityUsd : null;
  if (!liq) {
    // No pool data: the old model (fee + half the cap per side).
    const perSide = num('CRYPTO_PAPER_FEE_BPS', 30) + cap / 2;
    return { roundTripBps: 2 * perSide, perSideBps: perSide, liquidityKnown: false };
  }
  const deep = liq >= num('CRYPTO_PAPER_DEEP_LIQ_USD', 5_000_000);
  const feeBps = deep ? num('CRYPTO_PAPER_FEE_DEEP_BPS', 5) : num('CRYPTO_PAPER_FEE_BPS', 30);
  const slipBps = num('CRYPTO_PAPER_SLIPPAGE_BPS', 5);
  const impactBps = Math.min(cap || Infinity, (priceImpactPct(i.notionalUsd, liq) ?? 0) * 100);
  const gasBps = i.notionalUsd > 0 ? Math.min(100, (num('CRYPTO_PAPER_GAS_USD', 0.02) / i.notionalUsd) * 10_000) : 0;
  const perSide = feeBps + slipBps + impactBps + gasBps;
  return { roundTripBps: 2 * perSide, perSideBps: perSide, liquidityKnown: true };
}
