import { storage } from "./storage";
import { initialAchievements } from "./data/achievement-seeds";

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