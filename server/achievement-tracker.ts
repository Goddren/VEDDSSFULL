import { storage } from './storage';
import { Achievement, UserAchievement } from '@shared/schema';

// Interface for achievement check request
export interface AchievementCheckRequest {
  trigger: string;
  data?: {
    analysisId?: number;
    patternType?: string;
    symbol?: string;
    isAccurate?: boolean;
    shareCount?: number;
    consecutiveDays?: number;
    [key: string]: any;
  };
  userId?: number;
}

/**
 * Checks if a user has earned any achievements based on a trigger event
 * and updates their progress/completes achievements as needed
 */
export async function checkUserAchievements(
  req: AchievementCheckRequest
): Promise<(UserAchievement & { achievement: Achievement })[]> {
  try {
    if (!req.userId) {
      return [];
    }

    // Get all available achievements
    const allAchievements = await storage.getAllAchievements();
    
    // Get user's current achievements
    const userAchievements = await storage.getUserAchievements(req.userId);
    
    // Track newly unlocked achievements
    const newlyCompletedAchievements: (UserAchievement & { achievement: Achievement })[] = [];
    
    // Process each achievement
    for (const achievement of allAchievements) {
      // Skip processing if achievement is already completed
      const existingUserAchievement = userAchievements.find(
        ua => ua.achievementId === achievement.id
      );
      
      if (existingUserAchievement?.isCompleted) {
        continue;
      }
      
      // Check if the achievement can be progressed based on the trigger
      const progressAmount = await calculateProgressUpdate(achievement, req, existingUserAchievement);
      
      if (progressAmount > 0) {
        // Create or update the user achievement
        let updatedUserAchievement: UserAchievement;
        
        if (existingUserAchievement) {
          // Update existing achievement progress
          const newProgress = Math.min(
            existingUserAchievement.progress + progressAmount,
            achievement.threshold
          );
          
          // Check if achievement is now complete
          const isNowCompleted = newProgress >= achievement.threshold;
          
          // Update in database
          updatedUserAchievement = await storage.updateUserAchievementProgress(
            existingUserAchievement.id,
            newProgress
          );
          
          // If newly completed, mark as completed in database
          if (isNowCompleted && !existingUserAchievement.isCompleted) {
            updatedUserAchievement = await storage.completeUserAchievement(
              existingUserAchievement.id
            );
            
            // Add to newly completed achievements list
            newlyCompletedAchievements.push({
              ...updatedUserAchievement,
              achievement
            });
          }
        } else {
          // Create new user achievement
          const newProgress = Math.min(progressAmount, achievement.threshold);
          const isComplete = newProgress >= achievement.threshold;
          
          // Create in database
          const userAchievement = await storage.createUserAchievement({
            userId: req.userId,
            achievementId: achievement.id,
            progress: newProgress,
            isCompleted: isComplete
          });
          
          // If completed on creation, add to newly completed list
          if (isComplete) {
            newlyCompletedAchievements.push({
              ...userAchievement,
              achievement
            });
          }
        }
      }
    }
    
    return newlyCompletedAchievements;
  } catch (error) {
    console.error('Error checking achievements:', error);
    return [];
  }
}

/**
 * Calculate how much progress should be added to an achievement based on the trigger
 */
async function calculateProgressUpdate(
  achievement: Achievement,
  req: AchievementCheckRequest,
  existingUserAchievement?: UserAchievement
): Promise<number> {
  const { trigger, data } = req;
  
  // Different calculation logic based on achievement category
  switch (achievement.category) {
    case 'analysis':
      // Track analysis counts
      if (trigger === 'analysis_created') {
        return 1;
      }
      break;
      
    case 'consistency':
      // Track consecutive days
      if (trigger === 'login' && data?.consecutiveDays) {
        // Only update if consecutive days matches or exceeds achievement threshold
        return data.consecutiveDays >= achievement.threshold ? 1 : 0;
      }
      break;
      
    case 'accuracy':
      // Track trading accuracy
      if (trigger === 'profit_target_hit' && data?.isAccurate) {
        return 1;
      }
      break;
      
    case 'exploration':
      // Track different markets/symbols
      if (trigger === 'new_market_analyzed' && data?.symbol) {
        // Check if this symbol is already counted for this achievement
        if (existingUserAchievement) {
          // We need to get detailed data to check if this symbol was already analyzed
          // This would require additional metadata storage, for now just increment
          return 1;
        } else {
          return 1;
        }
      }
      break;
      
    case 'special':
      // Special one-time achievements
      if (trigger === 'share_analysis' && achievement.name.includes('Share')) {
        return 1;
      }
      // Add more special achievement triggers as needed
      break;
  }
  
  // No progress update for this combination
  return 0;
}

/**
 * Get user's total points from completed achievements
 */
export async function getUserTotalPoints(userId: number): Promise<number> {
  try {
    const userAchievements = await storage.getUserAchievements(userId);
    
    return userAchievements.reduce((total, ua) => {
      if (ua.isCompleted) {
        return total + (ua.achievement?.points || 0);
      }
      return total;
    }, 0);
  } catch (error) {
    console.error('Error getting user points:', error);
    return 0;
  }
}