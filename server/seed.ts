import { storage } from "./storage";
import { initialAchievements } from "./data/achievement-seeds";
import { db } from "./db";
import { subscriptionPlans } from "@shared/schema";

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
      name: "Standard",
      description: "Advanced features for serious traders",
      price: 2999, // $29.99
      interval: "month",
      features: [
        "Everything in Free",
        "Multi-timeframe EA generator (MT5 & TradingView)",
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
      description: "Unlimited power for professional traders",
      price: 9999, // $99.99
      interval: "month",
      features: [
        "Everything in Standard",
        "Multiple trade strategies (Pyramiding, Grid, Hedging)",
        "Custom EA parameters & optimization",
        "Advanced multi-timeframe analysis",
        "Unlimited chart analyses",
        "Unlimited social shares",
        "Historical strategy backtesting",
        "API access for automation",
        "Priority customer support (24/7)",
        "Custom indicator requests",
        "1-on-1 strategy consultations",
      ],
      analysisLimit: 99999,
      socialShareLimit: 99999,
      isActive: true,
    },
    {
      name: "Lifetime",
      description: "🔥 LIMITED TIME SALE: Pay once, trade forever - Best value for long-term traders",
      price: 14900, // $149 one-time (SALE PRICE - normally $499)
      interval: "lifetime",
      features: [
        "Everything in Premium",
        "Lifetime access - Pay once, no recurring fees",
        "All future updates & features included",
        "Multiple trade strategies (Pyramiding, Grid, Hedging)",
        "Custom EA parameters & optimization",
        "Advanced multi-timeframe analysis",
        "Unlimited chart analyses",
        "Unlimited social shares",
        "Historical strategy backtesting",
        "API access for automation",
        "Priority customer support (24/7)",
        "Custom indicator requests",
        "Quarterly 1-on-1 strategy consultations",
        "Early access to beta features",
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