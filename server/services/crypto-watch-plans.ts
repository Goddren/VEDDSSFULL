// Crypto watch plans — WIP scaffold (feat/crypto-watch-plans).
// Deep AI study per user+symbol+strategy writes a validated watch plan for
// the crypto SHADOW lane; deterministic watching costs zero AI calls; shadow
// entries require signal AND a triggered plan. Modelled on
// kalshi-perp-watch-plans.ts (PR #110) and ai-watch-plans.ts (PR #108).
// Kill switch: CRYPTO_WATCH_PLANS=off.
export function cryptoWatchPlansEnabled(): boolean {
  return process.env.CRYPTO_WATCH_PLANS !== 'off';
}
