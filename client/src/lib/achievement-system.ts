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
  
  // New achievement triggers
  CONSECUTIVE_LOGIN = "consecutive_login",         // User logs in on consecutive days
  MULTIPLE_TIMEFRAMES = "multiple_timeframes",     // User analyzes charts from multiple timeframes
  PERFECT_ANALYSIS = "perfect_analysis",           // User gets a high confidence analysis
  FIRST_PATTERN_IDENTIFIED = "first_pattern_identified", // User identifies their first pattern
  FEEDBACK_SUBMITTED = "feedback_submitted",       // User provides feedback on analysis
  HIGH_ACCURACY_STREAK = "high_accuracy_streak",   // User maintains high accuracy over multiple analyses
  WEEKLY_GOAL_COMPLETED = "weekly_goal_completed", // User completes their weekly analysis goal
  APP_CUSTOMIZATION = "app_customization",         // User customizes app settings or profile
  TOOL_USAGE = "tool_usage",                       // User uses specific trading tools
  SUBSCRIPTION_MILESTONE = "subscription_milestone", // User reaches a subscription milestone
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
    // Perform any client-side pre-processing based on trigger type
    switch (trigger) {
      case AchievementTrigger.MULTIPLE_TIMEFRAMES:
        // Track timeframes analyzed in localStorage
        const analyzedTimeframes = JSON.parse(localStorage.getItem('analyzedTimeframes') || '[]');
        if (data?.timeframe && !analyzedTimeframes.includes(data.timeframe)) {
          analyzedTimeframes.push(data.timeframe);
          localStorage.setItem('analyzedTimeframes', JSON.stringify(analyzedTimeframes));
          // Add the count to the data
          data.timeframeCount = analyzedTimeframes.length;
        }
        break;
        
      case AchievementTrigger.PERFECT_ANALYSIS:
        // Track perfect analyses (high confidence)
        if (data?.confidence && parseFloat(data.confidence) > 90) {
          const perfectAnalysesCount = parseInt(localStorage.getItem('perfectAnalysesCount') || '0') + 1;
          localStorage.setItem('perfectAnalysesCount', perfectAnalysesCount.toString());
          data.perfectAnalysesCount = perfectAnalysesCount;
        }
        break;
        
      case AchievementTrigger.HIGH_ACCURACY_STREAK:
        // Track accuracy streak
        if (data?.isAccurate) {
          const currentStreak = parseInt(localStorage.getItem('accuracyStreak') || '0') + 1;
          localStorage.setItem('accuracyStreak', currentStreak.toString());
          data.accuracyStreak = currentStreak;
        } else {
          // Reset streak if analysis was not accurate
          localStorage.setItem('accuracyStreak', '0');
          data.accuracyStreak = 0;
        }
        break;
        
      case AchievementTrigger.TOOL_USAGE:
        // Track tool usage count
        if (data?.toolName) {
          const toolUsage = JSON.parse(localStorage.getItem('toolUsage') || '{}');
          toolUsage[data.toolName] = (toolUsage[data.toolName] || 0) + 1;
          localStorage.setItem('toolUsage', JSON.stringify(toolUsage));
          data.toolUsageCount = toolUsage[data.toolName];
        }
        break;
    }
    
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

// Helper functions to trigger specific achievements from different parts of the app

// Track when a user completes an analysis
export async function trackAnalysisCompleted(analysisData: any): Promise<void> {
  await checkAchievements(AchievementTrigger.ANALYSIS_CREATED, analysisData);
  
  // If high confidence, also trigger perfect analysis achievement
  if (analysisData.confidence && parseFloat(analysisData.confidence) > 90) {
    await checkAchievements(AchievementTrigger.PERFECT_ANALYSIS, analysisData);
  }
  
  // If this is a new timeframe, track multiple timeframes achievement
  if (analysisData.timeframe) {
    await checkAchievements(AchievementTrigger.MULTIPLE_TIMEFRAMES, analysisData);
  }
  
  // If a pattern was detected, track pattern achievement
  if (analysisData.patterns && analysisData.patterns.length > 0) {
    await checkAchievements(AchievementTrigger.FIRST_PATTERN_IDENTIFIED, {
      patternType: analysisData.patterns[0].name,
      patternCount: analysisData.patterns.length
    });
  }
  
  // If this is a new market/symbol, track new market achievement
  if (analysisData.symbol) {
    await checkAchievements(AchievementTrigger.NEW_MARKET_ANALYZED, {
      symbol: analysisData.symbol
    });
  }
}

// Track when a user shares an analysis
export async function trackAnalysisShared(analysisId: number, shareId: string): Promise<void> {
  await checkAchievements(AchievementTrigger.SHARE_ANALYSIS, {
    analysisId,
    shareId,
    shareCount: 1
  });
}

// Track when a user provides feedback on an analysis
export async function trackFeedbackSubmitted(analysisId: number, feedbackData: any): Promise<void> {
  await checkAchievements(AchievementTrigger.FEEDBACK_SUBMITTED, {
    analysisId,
    feedbackData
  });
}

// Track when a user uses a specific trading tool
export async function trackToolUsage(toolName: string): Promise<void> {
  await checkAchievements(AchievementTrigger.TOOL_USAGE, {
    toolName
  });
}

// Track when a user reaches a subscription milestone
export async function trackSubscriptionMilestone(milestone: string, duration: number): Promise<void> {
  await checkAchievements(AchievementTrigger.SUBSCRIPTION_MILESTONE, {
    milestone,
    duration
  });
}

// Track when a user customizes app settings or profile
export async function trackAppCustomization(customizationType: string): Promise<void> {
  await checkAchievements(AchievementTrigger.APP_CUSTOMIZATION, {
    customizationType
  });
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