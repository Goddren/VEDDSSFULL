import { toast } from "@/hooks/use-toast";
import { Achievement, UserAchievement } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import React from "react";

// Forward reference to avoid circular dependency
// The actual component will be imported where this is used
type AchievementUnlockedProps = {
  achievement: Achievement;
  onClose: () => void;
};

// Achievement types for gamification
export enum AchievementType {
  ANALYSIS_COUNT = "analysis_count",        // Based on number of analyses performed
  CONSECUTIVE_DAYS = "consecutive_days",    // Based on consecutive days of activity
  PATTERN_DISCOVERY = "pattern_discovery",  // Based on discovering specific patterns
  ACCURACY_STREAK = "accuracy_streak",      // Based on accurate predictions
  MARKET_EXPLORER = "market_explorer",      // Based on analyzing different markets
  SOCIAL_SHARING = "social_sharing",        // Based on sharing analyses
  SPECIAL_EVENT = "special_event",          // Special one-time achievements
}

// Achievement triggers for different user actions
export enum AchievementTrigger {
  ANALYSIS_CREATED = "analysis_created",
  LOGIN = "login",
  SHARE_ANALYSIS = "share_analysis", 
  PROFIT_TARGET_HIT = "profit_target_hit",
  LOSS_AVOIDED = "loss_avoided",
  NEW_PATTERN_FOUND = "new_pattern_found",
  NEW_MARKET_ANALYZED = "new_market_analyzed",
}

// Interface for achievement progress data
export interface AchievementProgressData {
  analysisId?: number;
  patternType?: string;
  symbol?: string;
  isAccurate?: boolean;
  shareCount?: number;
  [key: string]: any;
}

// Check for unlocked achievements
export async function checkAchievements(
  trigger: AchievementTrigger,
  data?: AchievementProgressData
): Promise<UserAchievement[]> {
  try {
    // Send achievement check request to backend
    const response = await apiRequest("POST", "/api/check-achievements", {
      trigger,
      data
    });
    
    const unlockedAchievements = await response.json();
    
    // If achievements were unlocked, invalidate the achievements cache
    if (unlockedAchievements?.length > 0) {
      // Invalidate user achievements query
      queryClient.invalidateQueries({ queryKey: ['/api/user-achievements'] });
      
      // Show toast notifications for unlocked achievements
      showAchievementNotifications(unlockedAchievements);
    }
    
    return unlockedAchievements;
  } catch (error) {
    console.error("Failed to check achievements:", error);
    return [];
  }
}

// Track consecutive days of activity
export async function trackConsecutiveActivity(): Promise<void> {
  try {
    // Store last active date in localStorage
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lastActive = localStorage.getItem('lastActiveDate');
    
    if (lastActive !== today) {
      localStorage.setItem('lastActiveDate', today);
      
      // Check for consecutive days achievements
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayString = yesterday.toISOString().split('T')[0];
      
      if (lastActive === yesterdayString) {
        // Consecutive day detected
        const currentStreak = parseInt(localStorage.getItem('consecutiveDays') || '0');
        const newStreak = currentStreak + 1;
        localStorage.setItem('consecutiveDays', newStreak.toString());
        
        // Trigger achievement check for consecutive days
        await checkAchievements(AchievementTrigger.LOGIN, { 
          consecutiveDays: newStreak 
        });
      } else {
        // Streak broken, reset counter
        localStorage.setItem('consecutiveDays', '1');
      }
    }
  } catch (error) {
    console.error("Failed to track consecutive activity:", error);
  }
}

// Display achievement notifications to the user
function showAchievementNotifications(unlockedAchievements: (UserAchievement & { achievement: Achievement })[]): void {
  if (!unlockedAchievements || !Array.isArray(unlockedAchievements) || unlockedAchievements.length === 0) return;
  
  // Import toast function directly to avoid circular dependency issues
  const { toast } = require('@/hooks/use-toast');
  
  // Schedule notifications to appear one after another with simple notifications first
  unlockedAchievements.forEach((userAchievement, index) => {
    setTimeout(() => {
      toast({
        title: "Achievement Unlocked!",
        description: userAchievement.achievement.name,
        variant: "default",
        duration: 5000
      });
      
      // In a production app, we'd use the custom component here instead
      // of a simple toast, but we're avoiding it for now due to circular dependencies
    }, index * 1500); // Show each notification 1.5 seconds apart
  });
}

// Initialize achievements system
export function initAchievementSystem(): void {
  // Track consecutive days when the app loads
  trackConsecutiveActivity();
}

// Utility function to get user's level based on points
export function getUserLevel(totalPoints: number): {
  level: number;
  title: string;
  nextLevelPoints: number;
  progress: number;
} {
  // Define level thresholds
  const levels = [
    { threshold: 0, title: "Novice Trader" },
    { threshold: 100, title: "Apprentice Analyst" },
    { threshold: 250, title: "Market Student" },
    { threshold: 500, title: "Chart Enthusiast" },
    { threshold: 1000, title: "Pattern Spotter" },
    { threshold: 2000, title: "Technical Expert" },
    { threshold: 3500, title: "Market Tactician" },
    { threshold: 5000, title: "Trading Strategist" },
    { threshold: 7500, title: "Market Veteran" },
    { threshold: 10000, title: "Trading Master" },
    { threshold: 15000, title: "Market Wizard" },
    { threshold: 25000, title: "Trading Legend" },
  ];
  
  // Find current level
  let currentLevel = 0;
  for (let i = 0; i < levels.length; i++) {
    if (totalPoints >= levels[i].threshold) {
      currentLevel = i;
    } else {
      break;
    }
  }
  
  // Calculate next level threshold and progress
  const nextLevelThreshold = currentLevel < levels.length - 1 
    ? levels[currentLevel + 1].threshold 
    : levels[currentLevel].threshold * 1.5;
  
  const currentLevelThreshold = levels[currentLevel].threshold;
  const pointsInCurrentLevel = totalPoints - currentLevelThreshold;
  const pointsNeededForNextLevel = nextLevelThreshold - currentLevelThreshold;
  const progress = Math.min(Math.round((pointsInCurrentLevel / pointsNeededForNextLevel) * 100), 100);
  
  return {
    level: currentLevel + 1, // Make level 1-based instead of 0-based
    title: levels[currentLevel].title,
    nextLevelPoints: nextLevelThreshold,
    progress
  };
}