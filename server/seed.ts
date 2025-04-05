import { storage } from "./storage";

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

  // Analysis category achievements
  await storage.createAchievement({
    name: "First Analysis",
    description: "Complete your first chart analysis",
    category: "analysis",
    icon: "chart-line",
    points: 10,
    threshold: 1,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Novice Analyst",
    description: "Complete 5 chart analyses",
    category: "analysis",
    icon: "chart-bar",
    points: 20,
    threshold: 5,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Intermediate Analyst",
    description: "Complete 20 chart analyses",
    category: "analysis",
    icon: "chart-pie",
    points: 50,
    threshold: 20,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Expert Analyst",
    description: "Complete 100 chart analyses",
    category: "analysis",
    icon: "analytics",
    points: 100,
    threshold: 100,
    isSecret: false
  });

  // Consistency achievements
  await storage.createAchievement({
    name: "Daily Trader",
    description: "Analyze charts on 3 different days",
    category: "consistency",
    icon: "calendar-check",
    points: 15,
    threshold: 3,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Weekly Warrior",
    description: "Analyze charts on 7 different days",
    category: "consistency",
    icon: "calendar-week",
    points: 30,
    threshold: 7,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Market Veteran",
    description: "Analyze charts on 30 different days",
    category: "consistency",
    icon: "calendar-star",
    points: 100,
    threshold: 30,
    isSecret: false
  });

  // Accuracy achievements
  await storage.createAchievement({
    name: "Sharp Eye",
    description: "Complete 1 high confidence analysis",
    category: "accuracy",
    icon: "bullseye",
    points: 20,
    threshold: 1,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Precision Trader",
    description: "Complete 10 high confidence analyses",
    category: "accuracy",
    icon: "crosshairs",
    points: 50,
    threshold: 10,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Market Oracle",
    description: "Complete 50 high confidence analyses",
    category: "accuracy",
    icon: "gem",
    points: 150,
    threshold: 50,
    isSecret: false
  });

  // Exploration achievements
  await storage.createAchievement({
    name: "Market Explorer",
    description: "Analyze 3 different symbols",
    category: "exploration",
    icon: "compass",
    points: 20,
    threshold: 3,
    isSecret: false
  });

  await storage.createAchievement({
    name: "Diversified Trader",
    description: "Analyze 10 different symbols",
    category: "exploration",
    icon: "globe",
    points: 50,
    threshold: 10,
    isSecret: false
  });

  // Secret achievements
  await storage.createAchievement({
    name: "Night Owl",
    description: "Complete an analysis after midnight",
    category: "special",
    icon: "moon",
    points: 25,
    threshold: 1,
    isSecret: true
  });

  await storage.createAchievement({
    name: "Pattern Master",
    description: "Find 10 different chart patterns",
    category: "special",
    icon: "puzzle-piece",
    points: 75,
    threshold: 10,
    isSecret: true
  });

  console.log("Achievement seeding completed successfully!");
}