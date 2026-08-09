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
  // Daily-missions catalog actions (were advertised in the UI but had no config,
  // so they paid 0). Now real, at their advertised amounts.
  devotional_solo: 73,
  devotional_group: 148,
  strategy_review: 15,
  analysis_view: 10,
  live_monitor_check: 5,
  blog_share: 20,
  grant_apply: 25,
  training_module: 50,
  devotional_streak_bonus: 200,
} as const;

export type TokenRewardAction = keyof typeof TOKEN_REWARDS;

// Free-to-Pro journey math (must reconcile with storage.updateJourneyProgress):
//   44 days × 10  = 440
//   6 streak milestones × 100 = 600   (days 7/14/21/28/35/42)
//   completion bonus          = 960
//   ────────────────────────────────
//   total on a completed run  = 2000  ← the advertised "1 free month" threshold
export const JOURNEY_FREE_MONTH_TOKENS = 2000;

// Free-to-Pro redemption: a FLAT 2,000 earned VEDD per subscription month (the
// rate used by the redeem flow, tokenomics page, and user guide). The Free Path
// milestone ladder must follow this rate — previously "5,000 = 3 months" broke
// it (3 months = 6,000 at 2,000/month), effectively giving a month away.
export const EARNED_VEDD_PER_MONTH = 2000;
export const FREE_PATH_MILESTONES = [
  { tokens: 500,  reward: '1 Free Week' },   // ~2,000/4 weeks
  { tokens: 2000, reward: '1 Free Month' },
  { tokens: 4000, reward: '2 Free Months' },
  { tokens: 6000, reward: '3 Free Months' },
] as const;

// Earning caps for the gamified internal-wallet paths (NFC tap, activation,
// daily check-in, wear-to-earn). Prevents farming free reward tokens. Owed
// payouts (copy-trade profit share, marketplace sale proceeds) are NOT capped.
export const DAILY_VEDD_CAP = 500;   // per UTC day
export const WEEKLY_VEDD_CAP = 2000; // rolling 7 days

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

export type AmbassadorTier = (typeof AMBASSADOR_TIERS)[number];

/** Flat in-app credits to a referrer when their referral subscribes (before tier commission). */
export const REFERRAL_SUBSCRIPTION_BASE_CREDITS = 200;

/** Highest tier reached for a completed-referral count, or null if below Bronze. */
export function resolveAmbassadorTier(referralCount: number): AmbassadorTier | null {
  let current: AmbassadorTier | null = null;
  for (const t of AMBASSADOR_TIERS) if (referralCount >= t.minReferrals) current = t;
  return current;
}

/** Commission (in credits) a referrer earns when a referral subscribes, from the
 *  referrer's tier and the plan price (in cents/credits). 0 below Silver. */
export function tierCommissionCredits(referralCount: number, planPriceCents: number): number {
  const tier = resolveAmbassadorTier(referralCount);
  if (!tier || !tier.commissionPct) return 0;
  return Math.round(planPriceCents * (tier.commissionPct / 100));
}
