import { storage } from "./storage";
import { initialAchievements } from "./data/achievement-seeds";
import { db } from "./db";
import { subscriptionPlans } from "@shared/schema";
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
      price: 4995, // $49.95
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
      price: 14999, // $149.99
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