// streak-view.ts — single source for how a stored streak row is DISPLAYED.
//
// The stored userStreaks row only changes when the user records activity, so
// its `tier` / `tierProgress` / `currentStreak` can go stale between visits:
// tierProgress is never recomputed on activity, and a streak whose last
// activity was days ago still reads as alive. Different surfaces then showed
// different values ("1 day 👑 Elite" vs "0 day / Young Gun"). GET /api/streak
// now derives the display view here at read time — tier and progress from XP
// (same derivation storage.recordActivity uses on write), and the effective
// current streak (0 once the last activity is more than a day old). The
// stored row and the activity/write path are untouched.
import { TIER_CONFIG } from "@shared/schema";

type TierKey = keyof typeof TIER_CONFIG;
const TIER_ORDER: TierKey[] = ["YG", "Rising", "Pro", "Elite", "OG"];

export function tierForXp(xp: number): TierKey {
  let tier: TierKey = "YG";
  for (const key of TIER_ORDER) {
    if (xp >= TIER_CONFIG[key].minXP) tier = key;
  }
  return tier;
}

export function tierProgressForXp(xp: number): number {
  const tier = tierForXp(xp);
  const cfg = TIER_CONFIG[tier];
  if (!cfg.nextTier) return 100;
  const next = TIER_CONFIG[cfg.nextTier as TierKey];
  const span = next.minXP - cfg.minXP;
  if (span <= 0) return 100;
  return Math.max(0, Math.min(100, Math.round(((xp - cfg.minXP) / span) * 100)));
}

function localDayStart(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export interface StreakRowLike {
  currentStreak: number;
  lastActivityDate: string | Date | null;
  xpPoints: number;
  [key: string]: unknown;
}

export function effectiveStreakView<T extends StreakRowLike>(row: T, now: Date = new Date()): T {
  const xp = row.xpPoints ?? 0;
  let currentStreak = row.currentStreak ?? 0;
  if (row.lastActivityDate) {
    const last = row.lastActivityDate instanceof Date ? row.lastActivityDate : new Date(row.lastActivityDate);
    if (!Number.isNaN(last.getTime())) {
      const diffDays = Math.floor((localDayStart(now) - localDayStart(last)) / 86400000);
      // Active today or yesterday → streak still alive; older → broken (the
      // next recorded activity resets it to 1 in storage.recordActivity).
      if (diffDays > 1) currentStreak = 0;
    }
  }
  return { ...row, currentStreak, tier: tierForXp(xp), tierProgress: tierProgressForXp(xp) };
}
