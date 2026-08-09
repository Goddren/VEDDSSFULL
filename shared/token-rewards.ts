// ── Single source of truth for the VEDD reward economy ──────────────────────
// Every award amount, subscription price, and ambassador tier lives HERE.
// Seed config, schema defaults, route handlers, and UI catalogs must import
// from this module instead of hardcoding their own numbers. This file exists to
// end the drift found in the 2026-08 audit, where the SAME action paid
// DIFFERENT amounts in different places (challenge 15 vs 25, event 50 vs 100,
// referral profit-share told users 25 but paid 5, etc.).

/** VEDD tokens / points awarded per user action. Keyed by actionType. */
export const TOKEN_REWARDS = {
  daily_post: 10,
  daily_comment: 5,
  referral_signup: 50,
  referral_subscription: 200,
  challenge_completion: 25,
  event_hosting: 100,
  event_attendance: 15,
  journey_day_complete: 10,
  journey_streak_bonus: 100,        // awarded at each 7-day streak milestone
  journey_completion_bonus: 960,    // raised so a full 44-day journey reaches JOURNEY_FREE_MONTH_TOKENS
  referral_profit_share: 5,
  wear_to_earn: 50,
} as const;

export type TokenRewardAction = keyof typeof TOKEN_REWARDS;

// Free-to-Pro journey math (must reconcile with storage.updateJourneyProgress):
//   44 days × 10  = 440
//   6 streak milestones × 100 = 600   (days 7/14/21/28/35/42)
//   completion bonus          = 960
//   ────────────────────────────────
//   total on a completed run  = 2000  ← the advertised "1 free month" threshold
export const JOURNEY_FREE_MONTH_TOKENS = 2000;

/** Subscription prices in CREDITS (= cents; 100 credits = $1). */
export const SUBSCRIPTION_PRICE_CENTS = {
  starter: 4995,   // $49.95 / mo
  premium: 14999,  // $149.99 / mo
  yearly: 99999,   // $999.99 / yr
} as const;

/** Ambassador tiers — the canonical (training-page) set. monthlyCredits in credits. */
export const AMBASSADOR_TIERS = [
  { name: 'Bronze',   minReferrals: 10,  monthlyCredits: 5000,  commissionPct: 0 },
  { name: 'Silver',   minReferrals: 30,  monthlyCredits: 15000, commissionPct: 5 },
  { name: 'Gold',     minReferrals: 60,  monthlyCredits: 30000, commissionPct: 10 },
  { name: 'Platinum', minReferrals: 100, monthlyCredits: 50000, commissionPct: 15 },
] as const;
