import { storage } from "./storage";
import { initialAchievements } from "./data/achievement-seeds";
import { db } from "./db";
import { subscriptionPlans, investmentPools, veddRewardConfig } from "@shared/schema";
import { eq } from "drizzle-orm";
import { scrypt, randomBytes } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const buf = (await scryptAsync(password, salt, 64)) as Buffer;
  return `${buf.toString("hex")}.${salt}`;
}

/**
 * Seed initial subscription plans into the database
 */
export async function seedSubscriptionPlans() {
  console.log("Checking if subscription plans need to be seeded...");

  // Check if plans already exist
  const existingPlans = await db.select().from(subscriptionPlans);
  
  if (existingPlans.length > 0) {
    console.log(`${existingPlans.length} subscription plans already exist, skipping seeding.`);
    return;
  }

  console.log("No subscription plans found, seeding initial plans...");

  const plans = [
    {
      name: "Free",
      description: "Perfect for getting started with AI-powered chart analysis",
      price: 0,
      interval: "month",
      features: [
        "Basic chart pattern recognition",
        "Entry & exit point suggestions",
        "Support & resistance levels",
        "Standard technical indicators",
        "Community access",
        "Mobile PWA app",
      ],
      analysisLimit: 10,
      socialShareLimit: 5,
      isActive: true,
    },
    {
      name: "Starter",
      description: "Advanced features for serious traders with unified signal synthesis",
      price: 5000, // $50
      interval: "month",
      features: [
        "Everything in Free",
        "Multi-timeframe EA generator (MT5, TradingView & TradeLocker)",
        "Immersive full-page processing with Daily Scripture",
        "Unified Trade Signal (synthesizes all chart analyses into one recommendation)",
        "EA validity tracking & updates",
        "Trailing stop-loss automation",
        "Advanced pattern analysis",
        "AI trading tip generator",
        "Christian market wisdom",
        "Social trading features",
        "Price alerts & notifications",
        "Offline chart analysis",
        "Priority email support",
      ],
      analysisLimit: 100,
      socialShareLimit: 50,
      isActive: true,
    },
    {
      name: "Premium",
      description: "Unlimited power for professional traders with advanced AI synthesis",
      price: 15000, // $150
      interval: "month",
      features: [
        "Everything in Starter",
        "Advanced Unified Trade Signal with confidence scoring",
        "Immersive processing with animated pipelines",
        "Timeframe convergence analysis & alignment strength",
        "Multiple trade strategies (Pyramising, Grid, Hedging)",
        "Custom EA parameters & optimization",
        "Advanced multi-timeframe analysis",
        "Unlimited chart analyses",
        "Unlimited social shares",
        "Historical strategy backtesting",
        "API access for automation",
        "Custom indicator requests",
        "EA Marketplace creation & monetization",
        "Advanced pattern backtesting",
      ],
      analysisLimit: 99999,
      socialShareLimit: 99999,
      isActive: true,
    },
    {
      name: "Yearly",
      description: "Annual subscription — all Premium features with yearly renewal. Best value for serious traders.",
      price: 100000,
      interval: "yearly",
      features: [
        "Everything in Premium",
        "Annual renewal — best value for serious traders",
        "All future updates & features included",
        "Immersive full-page processing experience",
        "Unified Trade Signal (unlimited synthesis)",
        "Advanced multi-timeframe analysis",
        "Multiple trade strategies (Pyramiding, Grid, Hedging)",
        "Custom EA parameters & optimization",
        "Unlimited chart analyses",
        "Unlimited social shares",
        "Historical strategy backtesting",
        "API access for automation",
        "Custom indicator requests",
        "Early access to beta features",
        "EA Marketplace premium creator tools",
        "Passive income dashboard for EA sales",
      ],
      analysisLimit: 99999,
      socialShareLimit: 99999,
      isActive: true,
    },
  ];

  for (const plan of plans) {
    await db.insert(subscriptionPlans).values(plan);
  }

  console.log(`Successfully seeded ${plans.length} subscription plans!`);
}

/**
 * Seed initial achievements into the database
 */
export async function seedAchievements() {
  console.log("Checking if achievements need to be seeded...");

  // Check if achievements already exist
  const existingAchievements = await storage.getAllAchievements();
  
  if (existingAchievements.length > 0) {
    console.log(`${existingAchievements.length} achievements already exist, skipping seeding.`);
    return;
  }

  console.log("No achievements found, seeding initial achievements...");

  // Seed all achievements from the initialAchievements array
  for (const achievement of initialAchievements) {
    await storage.createAchievement(achievement);
  }

  console.log(`Successfully seeded ${initialAchievements.length} achievements!`);
}

/**
 * Ensure the admin user exists with full access.
 * Creates the user if missing, or upgrades subscription/admin if already registered.
 */
export async function seedAdminUser() {
  const adminUsername = "donchismkos@gmail.com";

  const [yearlyPlan] = await db
    .select({ id: subscriptionPlans.id })
    .from(subscriptionPlans)
    .where(eq(subscriptionPlans.name, "Yearly"))
    .limit(1);

  if (!yearlyPlan) {
    console.error("[seed] No Yearly plan found — skipping admin user seed");
    return;
  }

  const planId = yearlyPlan.id;
  const existing = await storage.getUserByUsername(adminUsername);

  if (existing) {
    if (existing.subscriptionStatus !== "active" || !existing.isAdmin || existing.subscriptionPlanId !== planId) {
      await storage.updateUser(existing.id, {
        subscriptionStatus: "active",
        isAdmin: true,
        membershipTier: "premium",
        subscriptionPlanId: planId,
      });
      console.log(`[seed] Admin user upgraded: subscription=active, isAdmin=true, plan=Yearly(${planId})`);
    } else {
      console.log(`[seed] Admin user already configured correctly.`);
    }
  } else {
    const hashed = await hashPassword("VeddAI2024!");
    const newUser = await storage.createUser({
      username: adminUsername,
      email: adminUsername,
      password: hashed,
      fullName: "Donchismkos",
    });
    await storage.updateUser(newUser.id, {
      subscriptionStatus: "active",
      isAdmin: true,
      membershipTier: "premium",
      subscriptionPlanId: planId,
    });
    console.log(`[seed] Admin user created with temp password.`);
  }
}
/**
 * Seed 4 default VEDD investment pools
 */
export async function seedInvestmentPools() {
  const existing = await db.select().from(investmentPools);
  if (existing.length > 0) {
    return; // already seeded
  }
  const pools = [
    {
      name: "VEDD Stake Pool",
      slug: "stake",
      poolType: "stake",
      description: "Lock your VEDD tokens for 30 days and earn a stable 8% APY. Principal and yield are returned at maturity. Ideal for holders who want steady, low-risk returns.",
      apyRate: 0.08,
      lockPeriodDays: 30,
      minInvestment: 500,
      maxInvestment: null,
      riskLevel: "low",
      totalPoolSize: 500000,
      isActive: true,
      isPaused: false,
    },
    {
      name: "Community Flex Pool",
      slug: "community",
      poolType: "community",
      description: "Flexible staking with no lock period. Earn 5% APY and withdraw anytime. Perfect for ambassadors who want liquidity while still earning on idle tokens.",
      apyRate: 0.05,
      lockPeriodDays: 0,
      minInvestment: 100,
      maxInvestment: 50000,
      riskLevel: "low",
      totalPoolSize: 250000,
      isActive: true,
      isPaused: false,
    },
    {
      name: "VEDD Growth Fund",
      slug: "growth",
      poolType: "growth",
      description: "Medium-term fund targeting 15% APY over 90 days. Designed for ambassadors building their VEDD position and looking for consistent compounding growth.",
      apyRate: 0.15,
      lockPeriodDays: 90,
      minInvestment: 1000,
      maxInvestment: null,
      riskLevel: "medium",
      totalPoolSize: 750000,
      isActive: true,
      isPaused: false,
    },
    {
      name: "Elite Vault",
      slug: "elite",
      poolType: "elite",
      description: "Premium 180-day vault for serious VEDD holders. Earn 24% APY on a 6-month commitment. Exclusive tier for committed community members and top ambassadors.",
      apyRate: 0.24,
      lockPeriodDays: 180,
      minInvestment: 5000,
      maxInvestment: null,
      riskLevel: "high",
      totalPoolSize: 1000000,
      isActive: true,
      isPaused: false,
    },
  ];

  for (const pool of pools) {
    await db.insert(investmentPools).values(pool as any);
  }
  console.log('[seed] Investment pools seeded (4 pools).');
}

/**
 * Seed VEDD reward configurations for ambassador actions
 * Aligned with 1B supply tokenomics: max ~900 VEDD/ambassador/month
 */
export async function seedVeddRewardConfig() {
  const existing = await db.select().from(veddRewardConfig);
  if (existing.length > 0) {
    console.log(`[seed] VEDD reward configs already exist (${existing.length}), skipping.`);
    return;
  }

  const configs = [
    { actionType: 'daily_post', baseAmount: 10, streakMultiplier: 1.2, maxDailyRewards: 1, requiresVerification: true, isActive: true, description: 'Post VEDD content on social media' },
    { actionType: 'daily_comment', baseAmount: 5, streakMultiplier: 1.1, maxDailyRewards: 3, requiresVerification: false, isActive: true, description: 'Engage in community comments' },
    { actionType: 'referral_signup', baseAmount: 50, streakMultiplier: 1.0, maxDailyRewards: 5, requiresVerification: false, isActive: true, description: 'Referred user signs up' },
    { actionType: 'referral_subscribes', baseAmount: 200, streakMultiplier: 1.0, maxDailyRewards: 5, requiresVerification: false, isActive: true, description: 'Referred user subscribes to paid plan' },
    { actionType: 'challenge_completion', baseAmount: 25, streakMultiplier: 1.0, maxDailyRewards: 3, requiresVerification: false, isActive: true, description: 'Ambassador training challenge completed' },
    { actionType: 'event_hosting', baseAmount: 100, streakMultiplier: 1.0, maxDailyRewards: 1, requiresVerification: true, isActive: true, description: 'Hosted a community event' },
    { actionType: 'event_attendance', baseAmount: 15, streakMultiplier: 1.0, maxDailyRewards: 2, requiresVerification: false, isActive: true, description: 'Attended a community event' },
    { actionType: 'journey_day_complete', baseAmount: 10, streakMultiplier: 1.05, maxDailyRewards: 1, requiresVerification: false, isActive: true, description: 'Completed a day in the 44-day free path journey' },
    { actionType: 'journey_completion_bonus', baseAmount: 500, streakMultiplier: 1.0, maxDailyRewards: 1, requiresVerification: true, isActive: true, description: 'Completed the full 44-day ambassador journey' },
    { actionType: 'referral_profit_share', baseAmount: 5, streakMultiplier: 1.0, maxDailyRewards: 10, requiresVerification: false, isActive: true, description: '5% share of referral trade profit' },
    { actionType: 'wear_to_earn', baseAmount: 50, streakMultiplier: 1.0, maxDailyRewards: 1, requiresVerification: true, isActive: true, description: 'Scanned VEDD clothing QR code' },
  ];

  for (const config of configs) {
    await db.insert(veddRewardConfig).values(config as any);
  }
  console.log(`[seed] VEDD reward configs seeded (${configs.length} action types).`);
}
